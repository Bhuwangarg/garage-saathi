#!/usr/bin/env python3
"""What /pull costs, held to a budget -- and the paging rules that cost depends on.

An earlier /pull read MAX(rev) and filtered by rev with neither indexed. A poll that
returned nothing cost 94ms of scanning; a hundred devices polling every four seconds
made that 141 seconds of database time per minute of clock, and nothing errored --
everything just queued. Contract §3.4 now adds a per-record predicate
(json_extract / ->>) to pull()'s two statements, on an expression no index serves,
and asserts it filters a PAGE rather than a table. That was reasoned, not measured.
scripts/measure-pull.py measures it; this file is the part of that which can fail a
build.

What can fail a build, and what cannot
--------------------------------------
Every figure in 03 §8 was taken on a Mac, and the office runs Core 2 Duos. A test
that hard-codes today's milliseconds fails on a busy machine for a reason that is
not a defect, and a one-in-three failure in a push gate gets the gate bypassed. So:

  * FAILS the build, on any machine: the number of SQLite virtual-machine
    instructions a pull costs (counted, so load does not move it), the query plans,
    the indexes, the request counts, and the paging rules. These do not depend on
    how fast the machine is.
  * FAILS the build only when the machine was calm before AND after, and only after
    three tries: wall-clock time, always as a multiple of a full-table scan timed in
    the same run, never as milliseconds.
  * Otherwise prints NOT MEASURED, with the reason, counts it in the last line, and
    exits 0. It never passes silently and never fails for being busy.

Not here: a comparison with the PREVIOUS run on the same machine. That needs a file
that outlives the run, which a test should not write into the repo;
`scripts/measure-pull.py --save run.json` then `--compare run.json` does it.

    /usr/bin/python3 test_pullcost.py
"""
import importlib.util
import os
import re
import sys
import tempfile
import types

os.environ["DB_PATH"] = tempfile.mktemp(suffix=".db")
for k in ("DATABASE_URL", "TURSO_URL", "TURSO_DATABASE_URL"):
    os.environ.pop(k, None)
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import sync_server as S  # noqa: E402

_spec = importlib.util.spec_from_file_location("measure_pull", os.path.join(HERE, "scripts", "measure-pull.py"))
MP = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(MP)

fails = []
unmeasured = []


def check(name, cond, detail=""):
    print(("  ok  " if cond else " FAIL ") + name + ("" if cond else "   " + str(detail)))
    if not cond:
        fails.append(name)


def not_measured(name, why):
    print(" SKIP " + name + "\n        NOT MEASURED: " + why)
    unmeasured.append(name)


def wants_red(name, failures):
    """A tripwire check: the broken thing must have produced at least one failure."""
    check(name, bool(failures), "the check stayed green with the thing broken, so it cannot fail")
    if failures:
        print("        caught: " + failures[0][:150])


# ===========================================================================
# 1. The paging rules. These run against a module, so the same checks can be run
#    against a deliberately broken copy of sync_server.py (section 3).
# ===========================================================================
OWNER = {"id": "u-owner", "role": "owner"}


def seed(M, rows):
    with M._lock:
        c = M.db()
        c.execute("DELETE FROM records")
        c.executemany("INSERT INTO records VALUES(?,?,?,?,?)", rows)
        c.commit()
        c.close()


def row(store, i, rev, pad=0, at=None):
    import json
    at = at or 1
    d = {"id": i, "at": at, "updatedAt": at, "n": "x" * pad}
    return (store, i, json.dumps(d, separators=(",", ":")), at, rev)


def pages_of(M, actor, limit=None, **kw):
    """Page the way the client does. -> (pages, finished)."""
    since, pages = 0, []
    for _ in range(300):
        out = M.pull(since, limit=limit, actor=actor, **kw)
        pages.append(out)
        since = out["maxRev"]
        if not out["more"]:
            return pages, True
    return pages, False


def semantics(M):
    """The three paging rules B5 owns, as a list of failures against module M."""
    f = []
    saved = M.PULL_MAX_BYTES
    try:
        # ---- a page never splits a rev group (the count limit) ---------------
        # Groups of 5, 1, 7, 2, 5, 3, 6, 1 records; limit 4 -- smaller than most of
        # them, so a group bigger than the limit must go out whole, not be cut.
        sizes = [5, 1, 7, 2, 5, 3, 6, 1, 4, 4, 2, 5]
        rows, groups = [], {}
        for rev, n in enumerate(sizes, 1):
            for k in range(n):
                rows.append(row("buses", "b%d-%d" % (rev, k), rev))
                groups.setdefault(rev, set()).add("b%d-%d" % (rev, k))
        seed(M, rows)
        for limit in (4, 12):
            pages, done = pages_of(M, OWNER, limit=limit)
            if not done:
                f.append("limit %d: the drain never finished" % limit)
                continue
            got = []
            for p in pages:
                by = {}
                for r in p["records"]:
                    by.setdefault(r["rev"], set()).add(r["id"])
                    got.append(r["id"])
                for rev, ids in by.items():
                    if ids != groups[rev]:
                        f.append("limit %d: rev %d went out as %d of its %d records in one page"
                                 % (limit, rev, len(ids), len(groups[rev])))
            allids = set().union(*groups.values())
            if set(got) != allids or len(got) != len(set(got)):
                f.append("limit %d: %d records arrived (%d distinct) of %d -- a device would advance past records "
                         "it never received" % (limit, len(got), len(set(got)), len(allids)))

        # ---- the same, for the byte budget; and an oversize FIRST group --------
        M.PULL_MAX_BYTES = 3000
        rows, groups = [], {}
        # rev 1: 5 records of ~900 bytes -- over the whole budget on its own.
        for k in range(5):
            rows.append(row("buses", "big-%d" % k, 1, pad=800))
            groups.setdefault(1, set()).add("big-%d" % k)
        for rev in range(2, 12):
            for k in range(2):
                rows.append(row("buses", "m%d-%d" % (rev, k), rev, pad=800))
                groups.setdefault(rev, set()).add("m%d-%d" % (rev, k))
        seed(M, rows)
        pages, done = pages_of(M, OWNER)
        if not done:
            f.append("byte budget: the drain never finished (a first group over budget must still be sent)")
        else:
            first = sorted(r["id"] for r in pages[0]["records"])
            if set(first) != groups[1]:
                f.append("a first rev group over the byte budget was not sent whole: page 1 held %d records, group has %d"
                         % (len(first), len(groups[1])))
            got = []
            for p in pages:
                by = {}
                for r in p["records"]:
                    by.setdefault(r["rev"], set()).add(r["id"])
                    got.append(r["id"])
                for rev, ids in by.items():
                    if ids != groups[rev]:
                        f.append("byte budget: rev %d went out as %d of its %d records" % (rev, len(ids), len(groups[rev])))
            if len(got) != 5 + 20 or len(set(got)) != 25:
                f.append("byte budget: %d records arrived (%d distinct) of 25" % (len(got), len(set(got))))
            import json
            for p in pages:
                est = sum(len(json.dumps(r["data"], separators=(",", ":"))) + 160 for r in p["records"])
                if est > 3000 and len({r["rev"] for r in p["records"]}) > 1:
                    f.append("byte budget: a page of %d records (~%d bytes, several rev groups) ignored the %d budget"
                             % (len(p["records"]), est, 3000))
        M.PULL_MAX_BYTES = saved

        # ---- a page emptied by redaction still advances the cursor -------------
        # 25 gpsevents older than the history window (redact_for drops every one of
        # them for the owner), then one fresh record. Every page but the last is
        # read and then emptied. Held back, the client would ask for page 1 for ever;
        # advanced, it must still be told the sync is not finished.
        old = M.now_ms() - 90 * 86400000
        rows = [row("gpsevents", "g%d" % i, i + 1, at=old) for i in range(25)] + [row("buses", "fresh", 26)]
        seed(M, rows)
        out = M.pull(0, limit=10, actor=OWNER)
        if out["records"] != []:
            f.append("setup: the page was meant to be emptied by redaction and held %d records" % len(out["records"]))
        if not out["maxRev"] > 0:
            f.append("a page emptied by redaction did not advance the cursor (maxRev %s)" % out["maxRev"])
        if out["more"] is not True:
            f.append("a page emptied by redaction said the sync was finished (more=%s) with records still to come" % out["more"])
        if out["tableMax"] != 26:
            f.append("tableMax was %s, not the table's maximum rev 26" % out["tableMax"])
        pages, done = pages_of(M, OWNER, limit=10)
        if not done:
            f.append("a drain through emptied pages never finished")
        else:
            last = pages[-1]
            ids = [r["id"] for p in pages for r in p["records"]]
            if ids != ["fresh"]:
                f.append("the drain through emptied pages delivered %s, not ['fresh']" % ids)
            complete = (not last["more"]) and last["maxRev"] >= last["tableMax"]
            if not complete:
                f.append("at the end of the drain complete was false (maxRev %s, tableMax %s, more %s)"
                         % (last["maxRev"], last["tableMax"], last["more"]))
        # And the other direction: while the drain is NOT finished it must not look
        # finished, or a screen would show a total for a partial sync.
        mid = M.pull(0, limit=10, actor=OWNER)
        if (not mid["more"]) or mid["maxRev"] >= mid["tableMax"]:
            f.append("an unfinished drain reported itself complete")
    finally:
        M.PULL_MAX_BYTES = saved
    return f


print("paging rules (a small table):")
sem = semantics(S)
check("a page never splits a rev group; a first group over the byte budget is sent whole; a page emptied by "
      "redaction advances the cursor and reports complete/tableMax", not sem, "; ".join(sem))
for m in sem:
    print("        - " + m)


# ===========================================================================
# 2. The cost, on the fleet-sized table
# ===========================================================================
print("\nbuilding the fleet-sized fixture ...")
with S._lock:
    _c = S.db()
    _c.execute("DELETE FROM records")
    _c.commit()
    _c.close()
FX = MP.build_fixture()
check("the fixture is the fleet-sized one (80,700 rows, 40,000 GPS events)",
      FX["rows"] == MP.FLEET_ROWS and S.db().execute("SELECT COUNT(*) FROM records WHERE store='gpsevents'").fetchone()[0] == MP.GPS_ROWS)

check("the first-screen pass is measured with v2/pullapply.js's FIRST_STORES (%d stores), not v1's list"
      % len(MP.first_stores()),
      MP._first_src[0].endswith(os.path.join("v2", "pullapply.js")) and MP.first_stores() != MP.first_stores(os.path.join(HERE, "pullapply.js")),
      "read %s" % MP._first_src[0])
R = MP.measure(reps=3, quick=True)
print()
MP.report(R, FX)
print()


def fast_probe():
    """The cheap, load-proof facts about the current state of the table: work done by
    a nothing-new poll and a next-rev read, relative to a full scan; the plan of every
    statement the REAL pull() sends; and which indexes exist. Re-taken after each
    deliberate breakage below, so the tripwires are tested against the real thing."""
    mx = MP.table_max()
    first = MP.first_stores()
    scan = MP.work(lambda: S.db().execute("SELECT COUNT(*) FROM records WHERE rev+0 > ?", (1 << 60,)).fetchone())[0]
    poll = MP.work(lambda: S.pull(mx, actor=MP.DRIVER))[0]
    nxt = MP.work(lambda: S.db().execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone())[0]
    plans = {}
    for label, fn in (("poll", lambda: S.pull(mx, actor=MP.DRIVER)),
                      ("page", lambda: S.pull(0, actor=MP.DRIVER)),
                      ("page, owner", lambda: S.pull(0, actor=MP.OWNER)),
                      ("first screen", lambda: S.pull(0, actor=MP.OWNER, only=first)),
                      ("defer", lambda: S.pull(0, actor=MP.OWNER, defer=["gpsevents"]))):
        plans[label] = MP.captured_plans(fn)
    return {"scan": scan, "poll": poll, "next_rev": nxt, "plans": plans, "indexes": MP.indexes()}


def index_checks(p):
    f = []
    if p["indexes"] != ["records_rev", "records_store_rev"]:
        f.append("records indexes are %s, not both of records_rev and records_store_rev" % p["indexes"])
    if p["poll"] * 200 > p["scan"]:
        f.append("a poll with nothing new cost %d (x100 instructions) against %d for a full scan of the table"
                 % (p["poll"], p["scan"]))
    if p["next_rev"] * 200 > p["scan"]:
        f.append("the next-rev read cost %d against %d for a full scan" % (p["next_rev"], p["scan"]))
    for label, got in p["plans"].items():
        if not got:
            f.append("no statement on records was caught while running '%s' -- the plan check saw nothing" % label)
        for sql, plan in got:
            if re.search(r"SCAN TABLE records(?! USING)", plan, re.I) or "USING INDEX" not in plan.upper() and "COVERING INDEX" not in plan.upper():
                f.append("'%s' reads the table, not an index: %s   <- %s" % (label, plan, sql[:90]))
    fs = p["plans"].get("first screen") or []
    if fs and not any("records_store_rev" in plan for _, plan in fs):
        f.append("the first-screen pass no longer reaches its page through records_store_rev")
    return f


PROBE = fast_probe()
bad = index_checks(PROBE)
check("both records indexes exist; a poll with nothing new and the next-rev read are index lookups, a "
      "thousandth of a table scan's work (%d and %d against %d, in hundreds of VM instructions)"
      % (PROBE["poll"], PROBE["next_rev"], PROBE["scan"]), not bad, "; ".join(bad))
check("every statement the real pull() sends -- poll, plain page, first-screen pass, deferred pass -- is "
      "answered through a records index, never a table scan (%d statements explained)"
      % sum(len(v) for v in PROBE["plans"].values()),
      not [x for x in bad if "reads the table" in x or "caught" in x], "; ".join(bad))

# ---- work budgets, per kind of drain. Multiples of a full scan measured in this run. ----
def work_checks(r):
    f = []
    scan = r["scan_work"]
    for key, mult in (("first_screen_owner", 4), ("drain_owner_defer", 8), ("drain_driver", 8), ("drain_conductor", 8)):
        w = r[key]["work"]
        if w > mult * scan:
            f.append("%s did %d (x100 instructions): %.1f full scans, budget %d" % (key, w, w / float(scan), mult))
    if r["drain_owner_defer"]["requests"] > 2 * MP.RECORDED["full_drain_requests"]:
        f.append("the owner's first-sync drain took %d requests; 03 §8 recorded %d" % (
            r["drain_owner_defer"]["requests"], MP.RECORDED["full_drain_requests"]))
    return f


bad = work_checks(R)
check("a first-sync drain stays inside its work budget: first-screen pass %d, owner drain %d (%d requests), driver drain %d "
      "(%d requests), against a table scan of %d"
      % (R["first_screen_owner"]["work"], R["drain_owner_defer"]["work"], R["drain_owner_defer"]["requests"],
         R["drain_driver"]["work"], R["drain_driver"]["requests"], R["scan_work"]), not bad, "; ".join(bad))


# ---- the own-rows predicate, contract §3.4 ----
def own_rows_checks(res):
    """res: the dict MP.measure() returns under 'own_rows_candidate' (or the same
    shape built from the real pull()). The predicate must (a) cost little extra work,
    (b) hand SQLite fewer rows -- which a post-filter cannot, it reads them all and
    drops them afterwards -- and (c) not make the drain longer."""
    f = []
    a, b = res["without"], res["with_predicate"]
    if b["work"] > 1.6 * a["work"]:
        f.append("the predicate cost %.2fx the work of the same drain without it (budget 1.6x)" % (b["work"] / float(a["work"])))
    if not b["fetched"] < a["fetched"]:
        f.append("the predicate did not reduce the rows SQLite read (%d against %d): it is a post-filter" % (b["fetched"], a["fetched"]))
    if b["requests"] > a["requests"]:
        f.append("the predicate made the drain longer: %d requests against %d" % (b["requests"], a["requests"]))
    return f


bad = own_rows_checks(R["own_rows_candidate"])
c = R["own_rows_candidate"]
check("contract §3.4's predicate (json_extract on the owner field, in SQL, on both statements) on an own-rows "
      "driver's drain costs %+.0f%% work, hands SQLite %d rows instead of %d, and takes %d requests instead of %d"
      % (100.0 * (c["with_predicate"]["work"] - c["without"]["work"]) / c["without"]["work"],
         c["with_predicate"]["fetched"], c["without"]["fetched"], c["with_predicate"]["requests"], c["without"]["requests"]),
      not bad, "; ".join(bad))
check("with that predicate on them, the four statement shapes are still answered through a records index: "
      + "; ".join("%s -> %s" % (k, re.sub(r" \(.*", "", v)) for k, v in R["plans"].items()),
      not [k for k, v in R["plans"].items() if re.search(r"SCAN TABLE records(?! USING)", v, re.I)],
      str(R["plans"]))

# The real thing, once B1 has put a predicate in pull(). Until then it is a candidate.
src = open(os.path.join(HERE, "sync_server.py")).read()
real = MP.real_own_rows_pair(reps=3)
if real is None:
    check("no per-record predicate is in sync_server.py yet, so §3.4 is measured as a candidate (above), not as shipped",
          "json_extract(" not in src and "->>" not in src,
          "sync_server.py now contains a json_extract / ->> predicate but no OWN_ROWS_ONLY map: contract §3.4 names it "
          "that, and real_own_rows_pair() in scripts/measure-pull.py looks for it by that name. Teach it the new name, "
          "or this file keeps measuring a candidate while the real thing ships unmeasured.")
else:
    check("the real pull(): the patch that empties OWN_ROWS_ONLY changes what a driver receives, so the with/without "
          "comparison is of two different code paths", real["patch_took_effect"],
          "emptying the map changed nothing, so 'without' is the same code as 'with'")
    rr = {"without": dict(real["without_predicate"], fetched=real["without_predicate"]["records"]),
          "with_predicate": dict(real["with_predicate"], fetched=real["with_predicate"]["records"])}
    bad = own_rows_checks(rr)
    check("the real pull() for an own-rows driver stays inside the budget: %d work with the predicate, %d without; "
          "%d requests against %d" % (rr["with_predicate"]["work"], rr["without"]["work"],
                                      rr["with_predicate"]["requests"], rr["without"]["requests"]), not bad, "; ".join(bad))


# ---- wall clock: judged only when it can be believed ----
def time_checks(r):
    f = []
    scan = r["scan_ms"]
    if r["poll_sql_ms"] * 20 > scan:
        f.append("a poll with nothing new took %.3f ms against %.1f ms for a full scan" % (r["poll_sql_ms"], scan))
    if r["next_rev_ms"] * 20 > scan:
        f.append("the next-rev read took %.3f ms against %.1f ms for a full scan" % (r["next_rev_ms"], scan))
    for key, mult in (("first_screen_owner", 120), ("drain_owner_defer", 300), ("drain_driver", 300), ("drain_conductor", 300)):
        if r[key]["ms"] > mult * scan:
            f.append("%s took %.0f ms: %.0f full scans of %.1f ms, budget %d" % (key, r[key]["ms"], r[key]["ms"] / scan, scan, mult))
    c = r["own_rows_candidate"]
    if c["with_predicate"]["ms"] > 2.0 * c["without"]["ms"]:
        f.append("the own-rows predicate doubled the drain: %.0f ms against %.0f ms" % (c["with_predicate"]["ms"], c["without"]["ms"]))
    return f


verdict, why, attempt = None, "", R
for n in range(1, 4):
    ok = attempt["calm_before"][0] and attempt["calm_after"][0]
    bad = time_checks(attempt)
    if not bad:
        verdict = "ok"
        break
    if not ok:
        verdict, why = "busy", attempt["calm_before"][1] or attempt["calm_after"][1]
    else:
        verdict, why = "red", "; ".join(bad)
    if n < 3:
        attempt = MP.measure(reps=3, quick=True)
if verdict == "ok":
    check("wall clock, as multiples of a full-table scan measured in the same run (scan %.1f ms here): a nothing-new poll "
          "%.3f ms, first-screen pass %.0f ms, driver drain %.0f ms" % (
              attempt["scan_ms"], attempt["poll_sql_ms"], attempt["first_screen_owner"]["ms"], attempt["drain_driver"]["ms"]), True)
elif verdict == "busy":
    not_measured("wall-clock budgets (poll, first-screen pass, drains, own-rows delta)",
                 "the machine was not calm enough to read milliseconds from (%s) on %d tries. This is not a verdict on "
                 "pull(), and it is not a pass either: the instruction-count and query-plan checks above ran and are exact."
                 % (why, n))
else:
    check("wall clock, as multiples of a full-table scan, on a calm machine, on 3 tries", False, why)


# ===========================================================================
# 3. Each check, made to fail on purpose. A check that cannot fail is decoration.
# ===========================================================================
print("\ntripwires (each one breaks the thing on purpose and expects red):")

MP.drop_index("records_rev")
try:
    wants_red("dropping records_rev turns the poll/plan/index checks red", index_checks(fast_probe()))
finally:
    MP.create_indexes()
MP.drop_index("records_store_rev")
try:
    wants_red("dropping records_store_rev turns the index and first-screen-plan checks red", index_checks(fast_probe()))
finally:
    MP.create_indexes()
check("... and with both indexes back, the same checks are green again", not index_checks(fast_probe()))

pf = dict(R["own_rows_candidate"])
pf["with_predicate"] = pf["post_filter"]
wants_red("filtering the own rows in Python after the page is read (instead of in SQL) turns the own-rows check red",
          own_rows_checks(pf))

slow = dict(R["own_rows_candidate"])
slow["with_predicate"] = dict(slow["with_predicate"], work=int(slow["without"]["work"] * 3))
wants_red("a predicate that costs three times the work of the drain turns the own-rows check red", own_rows_checks(slow))


def variant(old, new):
    """sync_server.py with one line changed, loaded as its own module on its own empty
    database. THROWS if the line is not there exactly once: a mutant that stopped
    applying would otherwise pass for ever."""
    if src.count(old) != 1:
        raise SystemExit("tripwire cannot be built: expected exactly one of\n    %s\nin sync_server.py, found %d. "
                         "pull() changed; update the mutation, do not delete it." % (old.strip(), src.count(old)))
    saved = os.environ["DB_PATH"]
    os.environ["DB_PATH"] = tempfile.mktemp(suffix=".db")
    try:
        m = types.ModuleType("sync_server_variant")
        m.__file__ = os.path.join(HERE, "sync_server.py")
        exec(compile(src.replace(old, new), m.__file__, "exec"), m.__dict__)
        m.db().close()
        return m
    finally:
        os.environ["DB_PATH"] = saved


wants_red("cutting a page mid rev group on the COUNT limit turns the paging check red",
          semantics(variant("trimmed = [r for r in rows if r[4] < last]", "trimmed = rows")))
wants_red("cutting a page mid rev group on the BYTE budget turns the paging check red",
          semantics(variant("keep = [r for r in rows if r[4] < boundary]", "keep = rows[:over_at]")))
wants_red("trimming an oversize first rev group to nothing turns the paging check red",
          semantics(variant("keep = [r for r in rows if r[4] == first]", "keep = []")))
wants_red("making redaction hold the cursor turns the paging check red",
          semantics(variant("    recs = [x for x in (redact_for(actor, r) for r in recs) if x is not None]\n",
                            "    recs = [x for x in (redact_for(actor, r) for r in recs) if x is not None]\n"
                            "    if not recs:\n        cursor = since\n")))

print("\nRESULT: %d failed%s" % (len(fails), ("; %d NOT MEASURED (%s)" % (len(unmeasured), ", ".join(unmeasured))) if unmeasured else ""))
if unmeasured:
    print("This was NOT a full pass: see NOT MEASURED above. Exit status is still 0, because a busy machine is not a defect.")
try:
    os.unlink(S.DB)
except OSError:
    pass
sys.exit(1 if fails else 0)

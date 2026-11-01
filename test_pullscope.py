#!/usr/bin/env python3
"""pull() skips the stores a login can never receive -- and only those.

A phone's first sync walks the whole table in pages. Most of the table is GPS
events, which only the owner and supervisor may see, so a driver's new phone spent
most of its first sync being handed pages that redaction then emptied: the cursor
moved, nothing arrived, and the screens waiting on real records stayed blank. The
query now leaves those stores out.

The risk runs one way. Skipping one store too FEW is a little wasted reading.
Skipping one too MANY means every device with that role never receives it, with no
error anywhere -- so the whole point of this file is to check the skip list against
redact_for itself, for every role and every store, rather than trusting that two
copies of the same rules stay in step.

    /usr/bin/python3 test_pullscope.py
"""
import os
import sys
import tempfile

os.environ["DB_PATH"] = tempfile.mktemp(suffix=".db")
for k in ("DATABASE_URL", "TURSO_URL", "TURSO_DATABASE_URL"):
    os.environ.pop(k, None)
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import sync_server as S  # noqa: E402

fails = []


def check(name, cond):
    print(("  ok  " if cond else " FAIL ") + name)
    if not cond:
        fails.append(name)


# Every store a record can live in: the client's own list, plus the ones that only
# ever exist server-side. Spelled out rather than imported so that adding a store
# and forgetting it here shows up as a gap in the sweep below, not as silence.
STORES = [
    "users", "buses", "parts", "jobcards", "ledger", "attendance", "purchases",
    "drivers", "incidents", "driverreports", "routes", "triplog", "fuel",
    "gpsevents", "audits", "components", "def", "vendors", "trips", "challans",
    "usage", "breakdowns", "stockmoves", "gatepasses", "rbservices", "rbreviews",
    "rbcomplaints", "rbassign", "itslookup", "rbreviewai", "rbaliasai", "gateai",
    "coreai", "reportai", "coachai", "crewnotes", "digest", "rbalias",
    "gatechecks", "dutylog", "meta", "aimeta", "waconv", "odometerlogs",
]
ROLES = list(S.ALL_ROLES)

print("The skip list never drops a record redaction would have kept")
# Fresh records on purpose: the history stores are also trimmed by AGE, and an old
# record would be refused for a reason that has nothing to do with the skip list.
now = S.now_ms()
for role in ROLES:
    actor = {"id": "u-" + role, "role": role}
    never = S._never_for(actor)
    wrong = []
    for st in STORES:
        rec = {"store": st, "id": "r-" + st, "data": {"id": "r-" + st, "at": now, "updatedAt": now},
               "updatedAt": now, "rev": 1}
        kept = S.redact_for(actor, rec) is not None
        if st in never and kept:
            wrong.append(st)
    check("%-11s skips nothing it is allowed to have%s" % (role, "" if not wrong else " -> " + ",".join(wrong)),
          not wrong)

print("\nAnd an unauthenticated pull skips nothing past redact_for's early return")
check("no actor means no store-level skipping beyond bookkeeping",
      S._never_for(None) - {"aimeta", "digest", "crewnotes"} <= set(S.HISTORY_ROLES))

print("\nIt does skip the big ones, or the change bought nothing")
check("a driver's phone skips the GPS table", "gpsevents" in S._never_for({"id": "u", "role": "driver"}))
check("and the reviews it may not read", "rbreviews" in S._never_for({"id": "u", "role": "driver"}))
check("the office skips GPS", "gpsevents" in S._never_for({"id": "u", "role": "office"}))
check("but NOT the reviews, which are its screen", "rbreviews" not in S._never_for({"id": "u", "role": "office"}))
check("the owner skips nothing but bookkeeping", S._never_for({"id": "u", "role": "owner"}) == frozenset({"aimeta"}))

print("\nEnd to end: the same records arrive, just without the empty pages")
c = S.db()
rev = c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()[0]
# One record per store, then a wall of GPS events -- the shape that made a new
# phone's first sync crawl: the records a driver actually needs sit behind them.
for st in STORES:
    rev = S._upsert_record(c, st, "seed-" + st, {"id": "seed-" + st, "at": now, "updatedAt": now}, now, rev)
for i in range(2000):
    rev = S._upsert_record(c, "gpsevents", "g%d" % i, {"id": "g%d" % i, "at": now, "updatedAt": now}, now, rev)
for st in ("jobcards", "buses", "drivers"):
    rev = S._upsert_record(c, st, "late-" + st, {"id": "late-" + st, "at": now, "updatedAt": now}, now, rev)
c.commit()
c.close()


def drain(actor, limit=600):
    """Every record a device receives, and how many pages it took to get them."""
    seen, since, pages = set(), 0, 0
    while True:
        pages += 1
        got = S.pull(since, limit=limit, actor=actor)
        for r in got["records"]:
            seen.add((r["store"], r["id"]))
        since = got["maxRev"]
        if not got["more"] or pages > 400:
            return seen, pages


owner_got, owner_pages = drain({"id": "u-own", "role": "owner"})
for role in ("driver", "store", "mechanic", "office", "crewmanager", "conductor", "supervisor"):
    actor = {"id": "u-" + role, "role": role}
    got, pages = drain(actor)
    # What this role is entitled to, decided by redact_for alone.
    want = {k for k in owner_got
            if S.redact_for(actor, {"store": k[0], "id": k[1],
                                    "data": {"id": k[1], "at": now, "updatedAt": now},
                                    "updatedAt": now, "rev": 1}) is not None}
    missing = sorted(want - got)[:4]
    check("%-11s receives everything it is entitled to%s" % (role, "" if not missing else " -> missing " + ",".join(missing)),
          not missing)
    check("  %-9s and the records behind the GPS wall still arrive" % role,
          ("buses", "late-buses") in got)
    if role != "supervisor":
        check("  %-9s in fewer pages than the owner needs (%d vs %d)" % (role, pages, owner_pages),
              pages < owner_pages)

print("\nRESULT: " + ("ALL PASS" if not fails else "%d FAILED -> %s" % (len(fails), fails)))
sys.exit(1 if fails else 0)

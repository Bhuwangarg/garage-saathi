#!/usr/bin/env python3
"""What does /pull cost? Measured on a fleet-sized table, in the units 03 §8 uses.

An earlier /pull read MAX(rev) and filtered by rev with neither indexed. A poll
that returned nothing cost 94 ms of pure scanning, a hundred devices polling every
four seconds turned that into 141 s of database time per minute of clock, and
nothing errored -- everything just queued. The fix took a full first sync from
2,359 ms to 536 ms. Those figures are recorded in docs/v2/inventory/03-data-and-
sync.md §8, so this reports in the same units (ms of server time, requests per
drain) rather than inventing one nobody can line up against them.

This file is the HARNESS. test_pullcost.py is the budget that fails a build, and
imports this. Run it directly to read the numbers:

    python3 scripts/measure-pull.py                  # the table
    python3 scripts/measure-pull.py --save run.json  # keep it, to compare next time
    python3 scripts/measure-pull.py --compare run.json

It never touches production. The database is a fresh tempfile built here; the
environment is scrubbed of DATABASE_URL / TURSO_* before sync_server is imported,
and refuses to continue if sync_server was already imported against anything that
is not a temporary file.

What is measured, and why two kinds of number
---------------------------------------------
Milliseconds depend on the machine and on what else it is doing. Every budget in
03 §8 was taken on a Mac; the office runs Core 2 Duos on Chrome 109. So each
measurement is taken twice:

  * "work": SQLite virtual-machine instructions executed, counted by a progress
    handler. This does not change with load, so it can fail a build.
  * "ms": best of N runs. Machine-dependent, so it is printed beside the machine,
    compared with a calibration taken in the same run (a full table scan), and
    only ever judged if the machine was calm before AND after.
"""
import argparse
import json
import os
import platform
import random
import re
import sqlite3
import statistics
import sys
import tempfile
import time

if "sync_server" in sys.modules:
    _S = sys.modules["sync_server"]
    _tmp = os.path.realpath(tempfile.gettempdir())
    if not os.path.realpath(_S.DB).startswith(_tmp) or _S.DATABASE_URL or _S.TURSO_URL:
        raise SystemExit("measure-pull: sync_server is already loaded against %r -- "
                         "refusing to measure anything that is not a temp file" % _S.DB)
else:
    os.environ["DB_PATH"] = tempfile.mktemp(suffix=".db")
    for _k in ("DATABASE_URL", "TURSO_URL", "TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"):
        os.environ.pop(_k, None)
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
import sync_server as S  # noqa: E402

# ---------------------------------------------------------------------------
# The recorded figures (03 §8), so a result can be printed as a ratio to them.
# ---------------------------------------------------------------------------
RECORDED = {
    "poll_nothing_new_ms": 0.1,      # 94 ms without records_rev        (8647a37)
    "poll_no_index_ms": 94.0,
    "first_screen_ms": 195.0,        # 888 ms without records_store_rev (sync_server.py:570)
    "first_screen_no_index_ms": 888.0,
    "full_drain_ms": 536.0,          # 2,359 ms before                  (8647a37)
    "full_drain_requests": 19,
    "next_rev_ms": 0.03,             # 43 ms before                     (8647a37)
}

FLEET_ROWS = 80700
GPS_ROWS = 40000

# store -> (rows, approx bytes of filler, own-rows field or None, distinct owners)
# Sums to FLEET_ROWS (asserted). The mix follows 03 §3/§8: GPS is half the table,
# trips/ledger/attendance/reviews are the next biggest, and the stores the v2
# contract narrows per record (§3.4) are all present with their owner field.
SHAPE = [
    ("gpsevents",     40000,  60, None,         0),
    ("triplog",       12000,  50, None,         0),
    ("ledger",         6000,  80, None,         0),
    ("attendance",     6000,  70, "userId",   100),
    ("rbreviews",      4000, 120, None,         0),
    ("stockmoves",     3000,  80, None,         0),
    ("usage",          2500,  40, "userId",   100),
    ("jobcards",       1680, 600, None,         0),
    ("purchases",      1200, 300, None,         0),
    ("parts",          1200, 150, None,         0),
    ("fuel",           1000,  70, None,         0),
    ("audits",          500, 100, None,         0),
    ("trips",           400,  90, "driverId",    60),
    ("driverreports",   250, 150, "_createdBy",  60),
    ("gatechecks",      250, 200, "userId",     100),
    ("challans",        120,  90, None,         0),
    ("incidents",       150, 200, None,         0),
    ("breakdowns",       80, 150, None,         0),
    ("components",       50,  80, None,         0),
    ("vendors",          40,  80, None,         0),
    ("routes",           30, 100, None,         0),
    ("buses",            60, 120, None,         0),
    ("drivers",          60, 250, "userId",      60),
    ("users",           100,  60, None,         0),
    ("meta",             30,  80, None,         0),
]
assert sum(n for _, n, *_ in SHAPE) == FLEET_ROWS
assert dict((s, n) for s, n, *_ in SHAPE)["gpsevents"] == GPS_ROWS

# The per-record predicate contract §3.4 adds, as far as it is spelled out there:
# store -> JSON field naming the owner. (triplog's "own bus" needs the actor's crew
# record and is a named post-filter; it is not here.)
OWN_ROWS = {"attendance": "userId", "usage": "userId", "drivers": "userId",
            "driverreports": "_createdBy", "trips": "driverId", "gatechecks": "userId"}

DRIVER = {"id": "u-d7", "role": "driver"}
CONDUCTOR = {"id": "u-c3", "role": "conductor"}
OWNER = {"id": "u-owner", "role": "owner"}


FIRST_STORES_FILE = os.path.join(ROOT, "v2", "pullapply.js")      # v2 is what is being measured
_first_src = [FIRST_STORES_FILE]


def first_stores(path=None):
    """The first-screen pass's stores, read from pullapply.js so they cannot drift.

    Defaults to v2/pullapply.js, because v2 is what this project is measuring; the
    v1 file at the repo root has an older, shorter list and measuring it under v2's
    name is the mistake this signature exists to prevent. Pass a path (or
    --first-stores-from) to measure the other one -- report() always says which file
    was read. Raises rather than falling back to a built-in list: a stale copy of
    the list is exactly the silent drift being avoided."""
    path = path or _first_src[0]
    src = open(path).read()
    m = re.search(r"FIRST_STORES\s*=\s*\[(.*?)\]", src, re.S)
    got = re.findall(r"'([a-z]+)'", m.group(1)) if m else []
    if not got:
        raise RuntimeError("no FIRST_STORES list found in %s" % path)
    return got


# What the fixture does NOT model. Printed under every report, because the next
# person reads the number and not the fixture.
FIXTURE_LIMITS = [
    "gatechecks rows are ~200 bytes of text and carry no selfie or item-photo payload. If a gate check record ever "
    "holds image data inline (rather than an /uploads URL), the bytes pulled -- and the number of byte-trimmed "
    "pages -- are UNDERSTATED here. gatechecks has no server send window, so a real first pass pulls every one ever made.",
    "any first-screen store that is not in SHAPE contributes ZERO rows to the first-screen figures: that is absence, "
    "not cheapness. report() names them.",
    "the Postgres figures (--pg) are a local cluster on this machine; production's pooler, network and hardware are not modelled.",
]


# ---------------------------------------------------------------------------
# The fixture
# ---------------------------------------------------------------------------
def build_fixture(seed=7, analyze=False):
    """80,700 rows, 40,000 of them GPS events, into S's (temporary) database.

    Revs are handed out the way push() hands them out: one rev per BATCH, so a
    device's burst of GPS events shares one rev and the rest arrive a few at a time,
    interleaved. That matters for what is being measured -- a rev group is what a
    page may not split, and a table where every row had its own rev would never
    exercise it. Returns {"rows", "maxrev", "build_s"}.
    """
    t0 = time.time()
    rng = random.Random(seed)
    now = int(time.time() * 1000)
    left = dict((s, n) for s, n, *_ in SHAPE)
    meta = dict((s, (pad, own, k)) for s, _, pad, own, k in SHAPE)
    counter = dict.fromkeys(left, 0)
    rows = []
    rev = 0
    while any(left.values()):
        # Pick the store in proportion to what is left, so the mix stays even all
        # the way through instead of all the GPS arriving first or last.
        total = sum(left.values())
        pick = rng.randrange(total)
        for st, n in left.items():
            if pick < n:
                break
            pick -= n
        batch = min(left[st], rng.randint(20, 60) if st == "gpsevents" else rng.randint(1, 8))
        rev += 1
        pad, own, owners = meta[st]
        for _ in range(batch):
            i = counter[st]
            counter[st] += 1
            at = now - rng.randrange(0, 20 * 86400000)            # inside every history window
            d = {"id": "%s-%d" % (st[:3], i), "at": at, "updatedAt": at,
                 "busId": "b%d" % rng.randrange(60), "n": "x" * pad}
            if own:
                d[own] = ("u-d%d" if st in ("trips", "driverreports", "drivers") else "u-s%d") % rng.randrange(owners)
            rows.append((st, d["id"], json.dumps(d, separators=(",", ":")), at, rev))
        left[st] -= batch
    with S._lock:
        c = S.db()
        c.executemany("INSERT OR REPLACE INTO records VALUES(?,?,?,?,?)", rows)
        c.commit()
        # sync_server never runs ANALYZE, so a fresh table has no statistics and the
        # planner chooses on heuristics alone. The fixture matches that by default;
        # --analyze turns it on, because test_pullindex.py does and the two can
        # choose differently (see the plan lines this prints).
        if analyze:
            c.execute("ANALYZE")
            c.commit()
        c.close()
    return {"rows": len(rows), "maxrev": rev, "build_s": time.time() - t0}


# ---------------------------------------------------------------------------
# Counting work, and timing
# ---------------------------------------------------------------------------
_ticks = [0]
_counting = [False]
_orig_db = S.db


def _counting_db():
    c = _orig_db()
    if _counting[0]:
        def tick():
            _ticks[0] += 1
            return 0
        c.set_progress_handler(tick, 100)
    return c


S.db = _counting_db        # pull() looks db() up at call time, so this reaches it


def work(fn):
    """SQLite VM instructions fn() executed, in hundreds. Load does not move this."""
    _ticks[0] = 0
    _counting[0] = True
    try:
        out = fn()
    finally:
        _counting[0] = False
    return _ticks[0], out


def timed(fn, reps):
    """(best ms, median ms) over reps runs. Best-of is the right summary for a cost:
    load can only add time to a run, never take it away."""
    xs = []
    for _ in range(reps):
        t = time.perf_counter()
        fn()
        xs.append((time.perf_counter() - t) * 1000)
    return min(xs), statistics.median(xs)


def drain(actor, only=None, defer=None, limit=None):
    """Page /pull to the end the way the client does. -> (requests, records)."""
    since, reqs, recs = 0, 0, 0
    while True:
        out = S.pull(since, limit=limit, actor=actor, only=only, defer=defer)
        reqs += 1
        recs += len(out["records"])
        since = out["maxRev"]
        if not out["more"]:
            return reqs, recs
        if reqs > 500:
            raise RuntimeError("a drain that never finishes -- the cursor is not advancing")


def table_max():
    c = S.db()
    try:
        return c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()[0]
    finally:
        c.close()


def scan_calibration(reps=7):
    """One full-table scan with no index to help: the price of the bug this suite
    exists to prevent, measured on THIS machine right now. Everything judged by
    wall clock is judged as a multiple of this, so a slow or busy machine moves the
    yardstick and the measurement together."""
    def scan():
        c = S.db()
        try:
            c.execute("SELECT COUNT(*) FROM records WHERE rev+0 > ?", (1 << 60,)).fetchone()
        finally:
            c.close()
    return timed(scan, reps)[0]


def machine():
    la = os.getloadavg()
    return {"cpu": platform.processor() or platform.machine(), "ncpu": os.cpu_count(),
            "load1": round(la[0], 2), "load5": round(la[1], 2),
            "python": platform.python_version(), "sqlite": sqlite3.sqlite_version,
            "os": "%s %s" % (platform.system(), platform.release())}


def calm(label=""):
    """Is this machine fit to read milliseconds from? -> (ok, why).

    A fixed piece of pure-Python arithmetic, repeated: on an idle core every repeat
    takes about the same, on a starved one the slow repeats stand out. Compared with
    itself, so it needs no recorded speed. Load average alone is not trusted -- a
    16-core machine at load 8 is fine and a 2-core one at load 2 is not -- but a
    load above 1.5 per core is refused outright."""
    la1, n = os.getloadavg()[0], os.cpu_count() or 1
    if la1 / n > 1.5:
        return False, "load average %.1f on %d cpus" % (la1, n)
    xs = []
    for _ in range(9):
        t = time.perf_counter()
        s = 0
        for k in range(60000):
            s += k * k
        xs.append(time.perf_counter() - t)
    spread = statistics.median(xs) / min(xs)
    if spread > 1.8:
        return False, "the same loop took %.1fx longer at its median than at its best" % spread
    return True, ""


# ---------------------------------------------------------------------------
# The candidate: contract §3.4's predicate, in the SQL shape it describes
# ---------------------------------------------------------------------------
def own_pred(actor_id, own=OWN_ROWS):
    """AND (store NOT IN (own stores) OR (store=? AND json_extract(data,'$.f')=?) ...)

    Applied to BOTH statements, as §3.4 says. A store outside the map passes
    untouched, so the predicate only costs anything on rows of the named stores."""
    stores = sorted(own)
    sql = " AND (store NOT IN (%s)" % ",".join("?" * len(stores))
    args = list(stores)
    for st in stores:
        sql += " OR (store=? AND json_extract(data,'$.%s')=?)" % own[st]
        args += [st, actor_id]
    return sql + ")", args


def sql_drain(skip, pred=None, post=None, only=None, limit=None):
    """pull()'s two statements and its paging rule, without its redaction, JSON
    decoding or byte budget -- so what differs between two calls is the SQL alone.

    pred = (sql, args) is added to both statements; post = a function(row)->bool
    filters in Python instead (the thing §3.4 forbids). Returns a dict with the
    requests, the rows SQLite handed back (`fetched`) and the rows kept (`kept`)."""
    limit = limit or S.PULL_LIMIT
    if only is not None:
        gap, gargs = " AND store IN (%s)" % ",".join("?" * len(only)), list(only)
    else:
        gap = (" AND store NOT IN (%s)" % ",".join("?" * len(skip))) if skip else ""
        gargs = list(skip)
    psql, pargs = pred if pred else ("", [])
    since, reqs, fetched, kept = 0, 0, 0, 0
    c = S.db()
    try:
        while True:
            reqs += 1
            maxrev = c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()[0]
            rows = c.execute(
                "SELECT store,id,data,updatedAt,rev FROM records WHERE rev>? AND rev<=?"
                + gap + psql + " ORDER BY rev ASC LIMIT ?",
                tuple([since, maxrev] + gargs + pargs + [limit])).fetchall()
            full = len(rows) == limit
            if rows and full:
                last = rows[-1][4]
                trimmed = [r for r in rows if r[4] < last]
                if trimmed:
                    rows = trimmed
                else:
                    rows += c.execute(
                        "SELECT store,id,data,updatedAt,rev FROM records WHERE rev=?" + gap + psql
                        + " ORDER BY id ASC LIMIT ? OFFSET ?",
                        tuple([last] + gargs + pargs + [1000000, len(rows)])).fetchall()
            fetched += len(rows)
            if post:
                kept += sum(1 for r in rows if post(r))
            else:
                kept += len(rows)
            cursor = maxrev if not full else (rows[-1][4] if rows else maxrev)
            more = cursor < maxrev
            since = cursor
            if not more:
                return {"requests": reqs, "fetched": fetched, "kept": kept}
            if reqs > 500:
                raise RuntimeError("sql_drain never finished")
    finally:
        c.close()


def plan(sql, args):
    c = S.db()
    try:
        return " | ".join(str(r[-1]) for r in c.execute("EXPLAIN QUERY PLAN " + sql, args).fetchall())
    finally:
        c.close()


def captured_plans(fn):
    """Run fn() (which calls the REAL pull()), catch every statement it sends to the
    records table, and ask SQLite how it would run each. -> [(sql, plan)].

    This is how the plan check follows the code instead of a copy of it: whatever
    SQL B1 ends up writing for the per-record predicate is the SQL that gets
    explained, with no hand-written twin to drift. SQLite's trace callback hands
    over the statement with its parameters already filled in."""
    seen = []
    real = S.db

    def tracing():
        c = real()
        c.set_trace_callback(lambda q: seen.append(q))
        return c
    S.db = tracing
    try:
        fn()
    finally:
        S.db = real
    out = []
    c = real()
    try:
        for q in seen:
            if q.lstrip().upper().startswith("SELECT") and " FROM RECORDS" in q.upper():
                out.append((q, " | ".join(str(r[-1]) for r in c.execute("EXPLAIN QUERY PLAN " + q).fetchall())))
    finally:
        c.close()
    return out


def python_post_filter(actor_id, own=OWN_ROWS):
    """The same rule as own_pred, applied after the page is read -- what §3.4 says
    must not be done, kept here as the thing the budget has to be able to tell from
    the real thing."""
    def keep(row):
        st = row[0]
        if st not in own:
            return True
        return json.loads(row[2]).get(own[st]) == actor_id
    return keep


def indexes():
    c = S.db()
    try:
        return sorted(r[1] for r in c.execute("PRAGMA index_list(records)")
                      if not str(r[1]).startswith("sqlite_autoindex"))
    finally:
        c.close()


def drop_index(name):
    c = S.db()
    c.execute("DROP INDEX IF EXISTS %s" % name)
    c.commit()
    c.close()


def create_indexes():
    c = S.db()
    c.execute("CREATE INDEX IF NOT EXISTS records_rev ON records(rev)")
    c.execute("CREATE INDEX IF NOT EXISTS records_store_rev ON records(store, rev)")
    c.commit()
    c.close()


# ---------------------------------------------------------------------------
# The measurements
# ---------------------------------------------------------------------------
def measure(reps=5, quick=False):
    """Everything in the table, as a dict. Takes a few seconds on the full fixture."""
    r = {"machine": machine()}
    first = first_stores()
    mx = table_max()
    r["maxrev"] = mx
    r["rows"] = S.db().execute("SELECT COUNT(*) FROM records").fetchone()[0]

    ok, why = calm()
    r["calm_before"] = [ok, why]
    r["scan_ms"] = scan_calibration()

    # 1. A poll with nothing new. Many calls per sample: it is far below timer
    # resolution for one, and it is the one every device makes every four seconds.
    def polls(n=200):
        for _ in range(n):
            S.pull(mx, actor=DRIVER)
    ms, med = timed(polls, 5)
    r["poll_ms"], r["poll_median_ms"] = ms / 200, med / 200
    # The same poll's two statements alone, on a held connection: the "DB time" that
    # 03 §8 means. pull() above also opens a connection and builds the skip list, which
    # is Python and process overhead, not the table, and is why it reads higher.
    skip_d = sorted(S._never_for(DRIVER))
    def poll_sql(n=200, c=None):
        c = c or S.db()
        gap = " AND store NOT IN (%s)" % ",".join("?" * len(skip_d))
        for _ in range(n):
            c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()
            c.execute("SELECT store,id,data,updatedAt,rev FROM records WHERE rev>? AND rev<=?" + gap
                      + " ORDER BY rev ASC LIMIT ?", tuple([mx, mx] + skip_d + [2000])).fetchall()
        c.close()
    r["poll_sql_ms"] = timed(poll_sql, 5)[0] / 200
    r["poll_work"] = work(lambda: S.pull(mx, actor=DRIVER))[0]
    r["poll_owner_work"] = work(lambda: S.pull(mx, actor=OWNER))[0]

    # 2. Next-rev allocation: the MAX(rev) every push reads.
    def alloc(n=500):
        c = S.db()
        for _ in range(n):
            c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()
        c.close()
    ms, _ = timed(alloc, 5)
    r["next_rev_ms"] = ms / 500
    r["next_rev_work"] = work(lambda: alloc(1))[0]

    # 3. The first-screen pass: only= the stores a first screen draws from.
    for who, actor in (("owner", OWNER), ("driver", DRIVER)):
        ms, med = timed(lambda: drain(actor, only=first), reps)
        w, (rq, rc) = work(lambda: drain(actor, only=first))
        r["first_screen_" + who] = {"ms": ms, "median_ms": med, "work": w, "requests": rq, "records": rc}

    # 4. The full first-sync drain. The owner's is the client's own 'defer' step
    # (everything but GPS); the driver's and conductor's are what those logins get.
    for who, actor, kw in (("owner_defer", OWNER, {"defer": ["gpsevents"]}),
                           ("owner_gps", OWNER, {"only": ["gpsevents"]}),
                           ("driver", DRIVER, {}), ("conductor", CONDUCTOR, {})):
        ms, med = timed(lambda: drain(actor, **kw), reps)
        w, (rq, rc) = work(lambda: drain(actor, **kw))
        r["drain_" + who] = {"ms": ms, "median_ms": med, "work": w, "requests": rq, "records": rc}

    # 5. The unknown: the same drain with an own-rows predicate, against without.
    # Today the real pull() has none, so this runs the SQL contract §3.4 describes
    # next to pull()'s own statements (sql_drain), and says which it was.
    skip = sorted(S._never_for(DRIVER))
    pred = own_pred(DRIVER["id"])
    res = {}
    for name, kw in (("without", {}), ("with_predicate", {"pred": pred}),
                     ("post_filter", {"post": python_post_filter(DRIVER["id"])})):
        ms, med = timed(lambda: sql_drain(skip, **kw), reps)
        w, out = work(lambda: sql_drain(skip, **kw))
        res[name] = dict(out, ms=ms, median_ms=med, work=w)
    r["own_rows_candidate"] = res
    # And a poll with nothing new, with the predicate -- the cost every device pays.
    def cand_poll(n=200):
        c = S.db()
        for _ in range(n):
            c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()
            c.execute("SELECT store,id,data,updatedAt,rev FROM records WHERE rev>? AND rev<=?"
                      " AND store NOT IN (%s)%s ORDER BY rev ASC LIMIT ?" % (
                          ",".join("?" * len(skip)), pred[0]),
                      tuple([mx, mx] + skip + pred[1] + [2000])).fetchall()
        c.close()
    ms, _ = timed(cand_poll, 5)
    r["cand_poll_ms"] = ms / 200

    # Query plans for the four statement shapes with the predicate on them.
    shapes = {
        "page_drain": ("SELECT store,id,data,updatedAt,rev FROM records WHERE rev>? AND rev<=? AND store NOT IN (%s)%s ORDER BY rev ASC LIMIT ?"
                       % (",".join("?" * len(skip)), pred[0]), [0, mx] + skip + pred[1] + [2000]),
        "page_poll": ("SELECT store,id,data,updatedAt,rev FROM records WHERE rev>? AND rev<=? AND store NOT IN (%s)%s ORDER BY rev ASC LIMIT ?"
                      % (",".join("?" * len(skip)), pred[0]), [mx, mx] + skip + pred[1] + [2000]),
        "page_first_screen": ("SELECT store,id,data,updatedAt,rev FROM records WHERE rev>? AND rev<=? AND store IN (%s)%s ORDER BY rev ASC LIMIT ?"
                              % (",".join("?" * len(first)), pred[0]), [0, mx] + first + pred[1] + [2000]),
        "group_completion": ("SELECT store,id,data,updatedAt,rev FROM records WHERE rev=? AND store NOT IN (%s)%s ORDER BY id ASC LIMIT ? OFFSET ?"
                             % (",".join("?" * len(skip)), pred[0]), [mx] + skip + pred[1] + [1000000, 1]),
    }
    r["plans"] = dict((k, plan(sql, args)) for k, (sql, args) in shapes.items())

    # 6. What the missing index costs, here, today. The WORK is always taken (it is
    # cheap and does not move with load); the milliseconds only when not --quick.
    drop_index("records_rev")
    try:
        r["poll_no_index_work"] = work(lambda: S.pull(mx, actor=DRIVER))[0]
        if not quick:
            r["poll_no_index_ms"] = timed(lambda: S.pull(mx, actor=DRIVER), 5)[0]
            r["poll_sql_no_index_ms"] = timed(lambda: poll_sql(5), 3)[0] / 5
    finally:
        create_indexes()
    drop_index("records_store_rev")
    try:
        r["first_screen_no_index_work"] = work(lambda: drain(OWNER, only=first))[0]
        if not quick:
            r["first_screen_no_index_ms"] = timed(lambda: drain(OWNER, only=first), 3)[0]
    finally:
        create_indexes()
    r["scan_work"] = work(lambda: S.db().execute("SELECT COUNT(*) FROM records WHERE rev+0 > ?", (1 << 60,)).fetchone())[0]
    r["indexes"] = indexes()
    r["calm_after"] = list(calm())
    r["real_predicate_in_tree"] = hasattr(S, "OWN_ROWS_ONLY")
    return r


def real_own_rows_pair(reps=5):
    """Once B1 is in the tree: the REAL pull() for an own-rows role, with and without
    the predicate. -> dict, or None while the predicate does not exist.

    'Without' is made by emptying S.OWN_ROWS_ONLY for the duration, which is only
    the same code path if pull() reads the map when it is called. That is checked,
    not assumed: if emptying the map changes nothing about what is returned, the
    two numbers are the same code and this says so instead of reporting a delta."""
    if not hasattr(S, "OWN_ROWS_ONLY"):
        return None
    own = S.OWN_ROWS_ONLY
    out = {}
    ms, med = timed(lambda: drain(DRIVER), reps)
    w, (rq, rc) = work(lambda: drain(DRIVER))
    out["with_predicate"] = {"ms": ms, "work": w, "requests": rq, "records": rc}
    saved = dict(own) if hasattr(own, "items") else own
    try:
        S.OWN_ROWS_ONLY = type(saved)()
        ms, med = timed(lambda: drain(DRIVER), reps)
        w, (rq, rc) = work(lambda: drain(DRIVER))
        out["without_predicate"] = {"ms": ms, "work": w, "requests": rq, "records": rc}
    finally:
        S.OWN_ROWS_ONLY = saved
    out["patch_took_effect"] = out["with_predicate"]["records"] != out["without_predicate"]["records"]
    return out


# ---------------------------------------------------------------------------
# Postgres: the engine production actually runs
# ---------------------------------------------------------------------------
def measure_postgres(extra_attendance=0):
    """The driver's drain, with and without contract §3.4's predicate, on a throwaway
    local PostgreSQL holding the same fixture and the production table definition
    (records.data is TEXT, so the predicate is `(data::jsonb->>'f') = x` and parses
    the document on every row it examines).

    Needs initdb, pg_ctl and psql on PATH; returns None, saying why, when they are
    not. The cluster lives in a temp directory, listens on 127.0.0.1 only, on a free
    port, and is stopped and deleted on the way out. Nothing here can reach a real
    database: there is no connection string to give it.

    extra_attendance adds that many attendance rows belonging to somebody else, to
    see how the predicate scales as the table grows -- attendance is ~100 people x
    2 x 365 rows a year (contract §3.4)."""
    import csv
    import shutil
    import socket
    import subprocess
    for tool in ("initdb", "pg_ctl", "psql"):
        if not shutil.which(tool):
            return {"skipped": "%s is not on PATH" % tool}
    d = tempfile.mkdtemp(prefix="pullcost-pg-")
    env = dict(os.environ, LC_ALL="en_US.UTF-8")
    sk = socket.socket()
    sk.bind(("127.0.0.1", 0))
    port = sk.getsockname()[1]
    sk.close()
    base = ["psql", "-h", "127.0.0.1", "-p", str(port), "-d", "postgres", "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1"]

    def sh(args, **kw):
        return subprocess.run(args, env=env, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, **kw)
    try:
        sh(["initdb", "-D", d + "/c", "-A", "trust", "--locale=en_US.UTF-8"])
        sh(["pg_ctl", "-D", d + "/c", "-w", "-l", d + "/log", "-o",
            "-p %d -c listen_addresses=127.0.0.1 -c unix_socket_directories=%s" % (port, "''"), "start"])
        c = S.db()
        with open(d + "/rows.csv", "w", newline="") as f:
            w = csv.writer(f)
            for row in c.execute("SELECT store,id,data,updatedAt,rev FROM records ORDER BY rev"):
                w.writerow(row)
        c.close()
        skip = ",".join("'%s'" % x for x in sorted(S._never_for(DRIVER)))
        own = sorted(OWN_ROWS)
        pred = ("(store NOT IN (%s) OR %s)" % (",".join("'%s'" % x for x in own), " OR ".join(
            "(store='%s' AND (data::jsonb->>'%s')=uid)" % (st, OWN_ROWS[st]) for st in own)))
        base_where = "rev>since AND rev<=mx AND store NOT IN (%s)" % skip
        extra = ""
        if extra_attendance:
            extra = ("INSERT INTO records SELECT 'attendance','x-'||g,"
                     "'{\"id\":\"x-'||g||'\",\"userId\":\"u-s'||(g%100)||'\",\"n\":\"" + "x" * 70 + "\"}',"
                     "1,20000+(g/10) FROM generate_series(1,%d) g;" % extra_attendance)
        sql = r"""
CREATE TABLE records(store TEXT, id TEXT, data TEXT, updatedAt BIGINT, rev BIGINT, PRIMARY KEY(store,id));
\copy records FROM '@DIR@/rows.csv' CSV
CREATE INDEX records_rev ON records(rev);
CREATE INDEX records_store_rev ON records(store, rev);
@EXTRA@
ANALYZE records;
CREATE FUNCTION drain(use_pred boolean, uid text, lim int) RETURNS TABLE(reqs int, fetched int, ms numeric) AS $f$
DECLARE since bigint := 0; mx bigint; n int; t0 timestamptz := clock_timestamp(); r int := 0; f int := 0; last bigint;
BEGIN
  LOOP
    r := r + 1;
    SELECT COALESCE(MAX(rev),0) INTO mx FROM records;
    IF use_pred THEN
      SELECT count(*), COALESCE(max(rev),0) INTO n, last FROM (SELECT store,id,data,updatedAt,rev FROM records WHERE @BASE@ AND @PRED@ ORDER BY rev ASC LIMIT lim) q;
    ELSE
      SELECT count(*), COALESCE(max(rev),0) INTO n, last FROM (SELECT store,id,data,updatedAt,rev FROM records WHERE @BASE@ ORDER BY rev ASC LIMIT lim) q;
    END IF;
    f := f + n;
    IF n < lim THEN EXIT; END IF;
    since := last;
  END LOOP;
  RETURN QUERY SELECT r, f, round((extract(epoch from clock_timestamp()-t0)*1000)::numeric,1);
END $f$ LANGUAGE plpgsql;
"""
        sql = sql.replace("@DIR@", d).replace("@EXTRA@", extra).replace("@BASE@", base_where).replace("@PRED@", pred)
        open(d + "/load.sql", "w").write(sql)
        sh(base + ["-f", d + "/load.sql"])
        out = {"port": port, "extra_attendance": extra_attendance}
        for label, use in (("without", "false"), ("with_predicate", "true")):
            best = None
            for _ in range(5):
                q = sh(base + ["-c", "SELECT * FROM drain(%s,'u-d7',2000)" % use]).stdout.decode().strip().split("|")
                row = {"requests": int(q[0]), "fetched": int(q[1]), "ms": float(q[2])}
                if best is None or row["ms"] < best["ms"]:
                    best = row
            out[label] = best
        v = sh(base + ["-c", "SHOW server_version"]).stdout.decode().strip()
        out["version"] = v
        return out
    except subprocess.CalledProcessError as e:
        return {"skipped": "postgres failed: %s" % (e.stderr or b"").decode()[-300:]}
    finally:
        subprocess.run(["pg_ctl", "-D", d + "/c", "-m", "immediate", "stop"], env=env,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        shutil.rmtree(d, ignore_errors=True)


# ---------------------------------------------------------------------------
# Printing
# ---------------------------------------------------------------------------
def ratio(v, rec):
    return "%.1fx the recorded %g" % (v / rec, rec) if rec else ""


def report(r, fixture=None):
    m = r["machine"]
    p = print
    p("machine : %s, %s cpus, load %s/%s (1m/5m), python %s, sqlite %s, %s"
      % (m["cpu"], m["ncpu"], m["load1"], m["load5"], m["python"], m["sqlite"], m["os"]))
    p("fixture : %d rows, max rev %d%s" % (r["rows"], r["maxrev"],
      ", built in %.1fs" % fixture["build_s"] if fixture else ""))
    fs = first_stores()
    inshape = dict((st, n) for st, n, *_ in SHAPE)
    p("first-screen pass: %d stores, read from %s" % (len(fs), os.path.relpath(_first_src[0], ROOT)))
    gone = [x for x in fs if x not in inshape]
    if gone:
        p("  NOT IN THE FIXTURE, so they add zero rows below (absence, not cheapness): %s" % ", ".join(gone))
    p("  fixture rows in the first-screen stores: %d" % sum(inshape.get(x, 0) for x in fs))
    p("calm    : before=%s after=%s%s" % (r["calm_before"][0], r["calm_after"][0],
      "" if r["calm_before"][0] and r["calm_after"][0] else "   <-- NOT CALM: " + (r["calm_before"][1] or r["calm_after"][1])))
    p("yardstick: one full-table scan with no index = %.1f ms here (the 94 ms of the old bug was this)" % r["scan_ms"])
    p("")
    p("%-52s %12s %10s   %s" % ("", "ms", "work", "against 03 §8"))
    p("%-52s %12.3f %10d   %s" % ("poll, nothing new: its two statements (driver)", r["poll_sql_ms"], r["poll_work"], ratio(r["poll_sql_ms"], RECORDED["poll_nothing_new_ms"])))
    p("%-52s %12.3f %10s   (adds a connection and the skip list: Python, not the table)" % ("  the same poll through pull()", r["poll_ms"], ""))
    if "poll_no_index_ms" in r:
        p("%-52s %12.3f %10d   %s" % ("  its two statements with records_rev dropped", r["poll_sql_no_index_ms"], r["poll_no_index_work"],
                                      "recorded 94 was a different engine/size: " + ratio(r["poll_sql_no_index_ms"], RECORDED["poll_no_index_ms"])))
        p("%-52s %12.0fx" % ("  index saves, on this engine, by a factor of", r["poll_sql_no_index_ms"] / max(r["poll_sql_ms"], 1e-9)))
    p("%-52s %12.3f %10d   %s" % ("next-rev allocation (MAX(rev)) per push", r["next_rev_ms"], r["next_rev_work"], ratio(r["next_rev_ms"], RECORDED["next_rev_ms"])))
    f = r["first_screen_owner"]
    p("%-52s %12.1f %10d   %s, %d requests" % ("first-screen pass (owner)", f["ms"], f["work"], ratio(f["ms"], RECORDED["first_screen_ms"]), f["requests"]))
    f = r["first_screen_driver"]
    p("%-52s %12.1f %10d   %d requests, %d records" % ("first-screen pass (driver)", f["ms"], f["work"], f["requests"], f["records"]))
    if "first_screen_no_index_ms" in r:
        p("%-52s %12.1f %10s   %s" % ("  first-screen pass with records_store_rev dropped", r["first_screen_no_index_ms"], "",
                                      ratio(r["first_screen_no_index_ms"], RECORDED["first_screen_no_index_ms"])))
    for k, label in (("owner_defer", "full drain, owner minus GPS (client's 'defer')"), ("owner_gps", "full drain, owner GPS only (client's 'only')"),
                     ("driver", "full drain, driver"), ("conductor", "full drain, conductor")):
        d = r["drain_" + k]
        extra = ratio(d["ms"], RECORDED["full_drain_ms"]) if k in ("owner_defer", "driver") else ""
        p("%-52s %12.1f %10d   %d requests (recorded %d), %d records  %s"
          % (label, d["ms"], d["work"], d["requests"], RECORDED["full_drain_requests"], d["records"], extra))
    p("")
    p("Contract §3.4 -- own-rows predicate on the driver's drain, SQL shape from the contract:")
    c = r["own_rows_candidate"]
    for k, label in (("without", "no predicate"), ("with_predicate", "json_extract predicate in SQL"), ("post_filter", "filtered in Python (forbidden)")):
        d = c[k]
        p("  %-36s %9.1f ms %9d work  %2d requests  fetched %6d kept %6d" % (label, d["ms"], d["work"], d["requests"], d["fetched"], d["kept"]))
    a, b = c["without"], c["with_predicate"]
    p("  delta from the predicate: %+.1f ms (%+.0f%%), %+d work (%+.0f%%), %+d requests"
      % (b["ms"] - a["ms"], 100.0 * (b["ms"] - a["ms"]) / max(a["ms"], 1e-9), b["work"] - a["work"],
         100.0 * (b["work"] - a["work"]) / max(a["work"], 1), b["requests"] - a["requests"]))
    p("  nothing-new poll with the predicate: %.3f ms" % r["cand_poll_ms"])
    for k, v in r["plans"].items():
        p("  plan %-18s %s" % (k, v))
    p("")
    p("indexes on records: %s" % ", ".join(r["indexes"]))
    p("")
    p("what this fixture does not model:")
    for x in FIXTURE_LIMITS:
        p("  - " + x)
    real = real_own_rows_pair()
    if real is None:
        p("real pull() own-rows predicate: NOT IN THE TREE (no S.OWN_ROWS_ONLY) -- the candidate above is the only number")
    else:
        p("real pull() own-rows, driver: with %.1f ms / %d work / %d requests / %d records; without %.1f ms / %d work / %d requests / %d records%s"
          % (real["with_predicate"]["ms"], real["with_predicate"]["work"], real["with_predicate"]["requests"], real["with_predicate"]["records"],
             real["without_predicate"]["ms"], real["without_predicate"]["work"], real["without_predicate"]["requests"], real["without_predicate"]["records"],
             "" if real["patch_took_effect"] else "   (emptying OWN_ROWS_ONLY changed nothing: these are the same code, not a delta)"))


FLAT_KEYS = ["poll_ms", "next_rev_ms", "scan_ms", "cand_poll_ms"]


def flat(r):
    out = dict((k, r[k]) for k in FLAT_KEYS)
    out["first_screen_owner_ms"] = r["first_screen_owner"]["ms"]
    for k in ("owner_defer", "driver", "conductor"):
        out["drain_%s_ms" % k] = r["drain_" + k]["ms"]
    out["drain_own_with_ms"] = r["own_rows_candidate"]["with_predicate"]["ms"]
    return out


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--save", help="write this run's figures to a json file")
    ap.add_argument("--compare", help="compare against a file written by --save on THIS machine")
    ap.add_argument("--reps", type=int, default=5)
    ap.add_argument("--first-stores-from", help="pullapply.js to read FIRST_STORES from (default v2/pullapply.js)")
    ap.add_argument("--analyze", action="store_true", help="run ANALYZE on the fixture (the server never does)")
    ap.add_argument("--pg", action="store_true", help="also run the predicate on a throwaway local PostgreSQL, if one is installed")
    ap.add_argument("--pg-extra-attendance", type=int, default=0, help="rows of other people's attendance to add for the Postgres run")
    ap.add_argument("--quick", action="store_true", help="skip the drop-an-index counterfactuals")
    a = ap.parse_args(argv)
    if a.first_stores_from:
        _first_src[0] = os.path.abspath(a.first_stores_from)
    fx = build_fixture(analyze=a.analyze)
    r = measure(a.reps, a.quick)
    report(r, fx)
    if a.pg:
        pgr = measure_postgres(a.pg_extra_attendance)
        print("\nPostgres (throwaway local cluster, production table definition):")
        if "skipped" in pgr:
            print("  NOT MEASURED:", pgr["skipped"])
        else:
            w, x = pgr["without"], pgr["with_predicate"]
            print("  PostgreSQL %s, +%d other-people attendance rows" % (pgr["version"], pgr["extra_attendance"]))
            print("  driver drain, no predicate        %7.1f ms  %2d requests  fetched %6d" % (w["ms"], w["requests"], w["fetched"]))
            print("  driver drain, predicate in SQL    %7.1f ms  %2d requests  fetched %6d   (%+.1f ms, %.2fx)"
                  % (x["ms"], x["requests"], x["fetched"], x["ms"] - w["ms"], x["ms"] / max(w["ms"], 1e-9)))
    cur = flat(r)
    if a.save:
        json.dump({"machine": r["machine"], "figures": cur}, open(a.save, "w"), indent=1)
        print("\nsaved to", a.save)
    if a.compare:
        prev = json.load(open(a.compare))
        print("\nagainst %s (taken on %s cpus, load %s):" % (a.compare, prev["machine"]["ncpu"], prev["machine"]["load1"]))
        for k, v in cur.items():
            o = prev["figures"].get(k)
            if o:
                print("  %-26s %10.3f -> %10.3f   %.2fx" % (k, o, v, v / o))
    try:
        os.unlink(S.DB)
    except OSError:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

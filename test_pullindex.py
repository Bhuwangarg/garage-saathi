#!/usr/bin/env python3
"""/pull reaches its page through an index, never by scanning the table.

Every pull is "WHERE rev>cursor ORDER BY rev LIMIT n" and reads MAX(rev) first to
clamp the page. The records primary key is (store, id), which answers neither, so
both statements were a full scan of the whole table -- on every request, from every
device, every four seconds. On a fleet-sized table a poll that returned nothing at
all cost 94ms of scanning, and a hundred devices doing that is more database time
per minute than a minute contains. Nothing failed; everything queued.

A grep for CREATE INDEX would not catch the ways this comes back: an index dropped
in a migration, a query rewritten into a shape the index cannot serve (a function
on rev, an OR, a leading wildcard), or a store filter moved to the front of the
compound key. So this asks the database what it would actually DO with the three
query shapes pull() issues, and fails on the word SCAN.

    /usr/bin/python3 test_pullindex.py
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


def ck(name, cond, detail=""):
    print(("  ✓ " if cond else "  ✗ ") + name + ("" if cond else "   " + detail))
    if not cond:
        fails.append(name)


def plan(sql, args):
    with S._lock:
        c = S.db()
        return " | ".join(str(r[-1]) for r in
                          c.execute("EXPLAIN QUERY PLAN " + sql, args).fetchall())


# Rows in several stores, so the planner has a reason to prefer one path.
with S._lock:
    c = S.db()
    for n in range(400):
        store = ("gpsevents", "jobcards", "buses", "parts")[n % 4]
        c.execute("INSERT OR REPLACE INTO records VALUES(?,?,?,?,?)",
                  (store, "r%d" % n, '{"x":1}', 1762000000000 + n, n + 1))
    c.commit()
    c.execute("ANALYZE")
    c.commit()

SKIP = ["gpsevents", "itslookup", "crew", "reviews"]
ONLY = ["meta", "users", "buses", "parts", "jobcards"]
SEL = "SELECT store,id,data,updatedAt,rev FROM records WHERE rev>? AND rev<=?"
ORD = " ORDER BY rev ASC LIMIT ?"

# Asserted on the index NAME, not on the absence of the word SCAN: sqlite reports
# a bare MAX() as "SEARCH TABLE records" whether or not an index exists, so a check
# reading only for SCAN passes with no index at all. It was written that way first.
p = plan("SELECT COALESCE(MAX(rev),0) FROM records", ())
ck("the bound read before every page comes off the index, not the table",
   "RECORDS_REV" in p.upper(), p)

p = plan(SEL + " AND store NOT IN (%s)" % ",".join("?" * len(SKIP)) + ORD,
         tuple([0, 999999] + SKIP + [2000]))
ck("the plain drain reaches its page through an index",
   "SEARCH" in p.upper() and "SCAN TABLE RECORDS" not in p.upper(), p)

p = plan(SEL + " AND store IN (%s)" % ",".join("?" * len(ONLY)) + ORD,
         tuple([0, 999999] + ONLY + [2000]))
ck("the first-screen pass reaches its page through an index",
   "SEARCH" in p.upper() and "SCAN TABLE RECORDS" not in p.upper(), p)

# The one that actually hurt: a poll with nothing new. It returns no rows, and
# used to read every row in the table to find that out.
p = plan(SEL + " AND store NOT IN (%s)" % ",".join("?" * len(SKIP)) + ORD,
         tuple([400, 400] + SKIP + [2000]))
ck("a poll with nothing new does not read the table to find that out",
   "SCAN TABLE RECORDS" not in p.upper(), p)

names = sorted(r[1] for r in
               S.db().execute("PRAGMA index_list(records)")
               if not str(r[1]).startswith("sqlite_autoindex"))
ck("both indexes the two page shapes need are created by the schema",
   names == ["records_rev", "records_store_rev"], str(names))

print("RESULT: %d passed, %d failed" % (5 - len(fails), len(fails)))
sys.exit(1 if fails else 0)

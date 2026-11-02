#!/usr/bin/env python3
"""A pull page is bounded by BYTES, and still never splits a rev group.

pull() used to be bounded only by a record count, so the count had to be small
enough for the worst-case page -- six hundred rows each carrying a photo -- and was
therefore small for every page. A fleet-sized first sync became 135 sequential
round trips, each paying ~96ms of request overhead before Postgres did any work.

The count is now a backstop and bytes are the real limit, which means the ways this
can go wrong have changed. A page trimmed to nothing would make a device ask for the
same page for ever. A page trimmed mid-rev-group would let the cursor advance past
records that were never sent -- silently, on that one device, until somebody edited
the record again. A trimmed page that reported itself as not-full would send the
cursor to the table maximum and step over everything it had just left behind.

Each of those is checked below.

    /usr/bin/python3 test_pullbytes.py
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


OWNER = {"id": "u-owner", "role": "owner"}
now = S.now_ms()


def seed(groups):
    """groups: list of lists of payload sizes. Each inner list is one rev group."""
    c = S.db()
    c.execute("DELETE FROM records")
    rev = 0
    n = 0
    for group in groups:
        rev += 1
        for size in group:
            n += 1
            S._upsert_record(c, "jobcards", "j%d" % n,
                             {"id": "j%d" % n, "updatedAt": now, "blob": "x" * size},
                             now, rev)
    # pull() opens its own connection, so without this it sees an empty table and
    # every assertion below passes for the wrong reason.
    c.commit()
    c.close()
    return rev


print("Under the budget, nothing is trimmed")
seed([[100]] * 5)
r = S.pull(0, actor=OWNER)
check("a small page returns every record", len(r["records"]) == 5)
check("…and reports no more to come", r["more"] is False)
check("…with the cursor at the table maximum", r["maxRev"] == r["tableMax"])

print("\nOver the budget, the page is cut on a rev boundary")
# Three groups of one record each, every one comfortably over half the budget, so
# the second record must not fit beside the first.
big = S.PULL_MAX_BYTES // 2
seed([[big], [big], [big]])
r = S.pull(0, actor=OWNER)
check("an oversized page is trimmed", len(r["records"]) < 3)
check("…and says there is more", r["more"] is True)
revs = sorted({x["rev"] for x in r["records"]})


def group_is_whole(page, revs_in_page):
    """No rev group may be partially sent: that is what would let the cursor
    advance past records the device never received."""
    c = S.db()
    try:
        for rv in revs_in_page:
            total = c.execute("SELECT COUNT(*) FROM records WHERE rev=?", (rv,)).fetchone()[0]
            sent = len([x for x in page if x["rev"] == rv])
            if sent != total:
                return False
    finally:
        c.close()
    return True


check("…cutting on a rev boundary, not mid-group", group_is_whole(r["records"], revs))
check("…and the revs it sent are the lowest ones, contiguously",
      revs == sorted(revs) and len(set(revs)) == len(revs))
check("…with the cursor at the last rev actually sent", r["maxRev"] == max(revs))
check("…which is below the table maximum", r["maxRev"] < r["tableMax"])

print("\nThe client can always make progress")
# One rev group that is over budget by itself. Trimming to nothing here would mean
# this device asks for the same page for ever.
seed([[S.PULL_MAX_BYTES + 50000]])
r = S.pull(0, actor=OWNER)
check("a single group bigger than the budget is still sent", len(r["records"]) == 1)
check("…and the cursor moves past it", r["maxRev"] == r["tableMax"])
check("…so nothing is left to ask for", r["more"] is False)

# The same, but with a second group behind it: the oversized group goes alone and
# the next pull picks up the rest.
seed([[S.PULL_MAX_BYTES + 50000], [100]])
r = S.pull(0, actor=OWNER)
minrev = min(x["rev"] for x in r["records"])
check("an oversized FIRST group is sent alone",
      len(r["records"]) == 1 and r["records"][0]["id"] == "j1" and group_is_whole(r["records"], [minrev]))
check("…and the page says there is more", r["more"] is True)
r2 = S.pull(r["maxRev"], actor=OWNER)
check("…and the next pull returns the record behind it", [x["id"] for x in r2["records"]] == ["j2"])
check("…finishing the table", r2["more"] is False)

print("\nA whole table drains, in order, with nothing lost or repeated")
seed([[big], [big], [big], [big], [big]])
seen, cursor, rounds = [], 0, 0
while True:
    rounds += 1
    page = S.pull(cursor, actor=OWNER)
    seen += [x["id"] for x in page["records"]]
    cursor = page["maxRev"]
    if not page["more"] or rounds > 20:
        break
check("every record arrives exactly once", sorted(seen) == sorted(["j%d" % i for i in range(1, 6)]))
check("…in rev order", seen == ["j1", "j2", "j3", "j4", "j5"])
check("…and it took more than one page (the budget really bit)", rounds > 1)
check("…and it terminated", rounds <= 20)

print("\nThe record count is still a backstop")
# Tiny records: bytes will never bite, so the count must be what ends the page.
seed([[10] for _ in range(S.PULL_LIMIT + 50)])
r = S.pull(0, actor=OWNER)
check("a page of tiny records stops at PULL_LIMIT or a rev boundary below it",
      len(r["records"]) <= S.PULL_LIMIT)
check("…and reports more to come", r["more"] is True)

print("\nThe budget is a real number, not an accident")
check("PULL_MAX_BYTES is under the 4.5 MB platform body limit", S.PULL_MAX_BYTES < 4_500_000)
check("…and leaves room for per-record overhead", S.PULL_MAX_BYTES + S.PULL_LIMIT * S.PULL_REC_OVERHEAD < 4_500_000)
check("PULL_LIMIT is a backstop, not the governor", S.PULL_LIMIT >= 1000)

print()
if fails:
    print("%d FAILED:" % len(fails))
    for f in fails:
        print("  - " + f)
    sys.exit(1)
print("all ok")

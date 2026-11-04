#!/usr/bin/env python3
"""Deferring a store to a second cursor must not lose it.

gpsevents is an order of magnitude larger than everything else and only the owner
and supervisor are sent it, so on exactly those two logins the whole app used to
wait behind ~40,000 telemetry rows before one job card appeared. The main drain now
skips them and its cursor moves PAST them -- which is only safe because a second
cursor goes back for them.

That makes "nothing is lost" the only property worth testing here, and it is tested
the brutal way: drain both cursors to exhaustion and compare the union against the
table, row for row. Also checked: that asking for a store by name cannot widen what
a login receives, since `store=` is a parameter a client controls.

    /usr/bin/python3 test_pulldefer.py
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
DRIVER = {"id": "u-drv", "role": "driver"}
DEFER = ["gpsevents"]
now = S.now_ms()

# A table shaped like the real one: a handful of records people actually look at,
# buried behind a wall of telemetry.
c = S.db()
c.execute("DELETE FROM records")
rev = 0
expected = set()
for i in range(5):
    rev = S._upsert_record(c, "jobcards", "j%d" % i, {"id": "j%d" % i, "updatedAt": now}, now, rev)
    expected.add(("jobcards", "j%d" % i))
for i in range(300):
    rev = S._upsert_record(c, "gpsevents", "g%d" % i, {"id": "g%d" % i, "at": now, "updatedAt": now}, now, rev)
    expected.add(("gpsevents", "g%d" % i))
for i in range(3):
    rev = S._upsert_record(c, "buses", "b%d" % i, {"id": "b%d" % i, "updatedAt": now}, now, rev)
    expected.add(("buses", "b%d" % i))
c.commit()
c.close()


def drain(actor, only=None, defer=None, start=0, cap=60):
    """Page until the server says there is no more. Returns (ids, pages, cursor)."""
    got, cursor, pages = [], start, 0
    while pages < cap:
        pages += 1
        page = S.pull(cursor, actor=actor, only=only, defer=defer)
        got += [(x["store"], x["id"]) for x in page["records"]]
        cursor = page["maxRev"]
        if not page["more"]:
            break
    return got, pages, cursor


print("The main drain leaves the deferred store alone")
main, main_pages, main_cursor = drain(OWNER, defer=DEFER)
check("it returns the records people actually open", {("jobcards", "j0"), ("buses", "b0")} <= set(main))
check("…and not one deferred record", not [x for x in main if x[0] == "gpsevents"])
check("…and its cursor still clears the whole table", main_cursor == rev)

print("\nThe deferred drain picks them up on its own cursor")
# From 0, exactly as the client does: the main cursor has already moved past these.
dfr, dfr_pages, dfr_cursor = drain(OWNER, only=DEFER)
check("it returns the deferred records", len([x for x in dfr if x[0] == "gpsevents"]) == 300)
check("…and nothing else", not [x for x in dfr if x[0] != "gpsevents"])
check("…and its cursor also clears the table", dfr_cursor == rev)

print("\nTogether they lose nothing and repeat nothing")
both = main + dfr
check("every record in the table arrives", set(both) == expected)
check("…exactly once", len(both) == len(expected))
check("…and the deferred drain really was separate work", dfr_pages >= 1 and main_pages >= 1)

print("\nThe old single drain would have returned the same set")
plain, _, plain_cursor = drain(OWNER)
check("the union matches an undeferred drain exactly", set(plain) == set(both))
check("…and reaches the same cursor", plain_cursor == rev)

print("\n`store=` cannot widen what a login receives")
# gpsevents is one of the stores a driver may never be sent. Asking for it by name
# must not hand it over -- and must not advance their cursor either, or they would
# step over records they are allowed to have.
check("gpsevents is denied to a driver in the first place", "gpsevents" in S._never_for(DRIVER))
page = S.pull(0, actor=DRIVER, only=DEFER)
check("a driver asking for it by name gets nothing", page["records"] == [])
check("…is told there is no more", page["more"] is False)
check("…and their cursor does NOT move", page["maxRev"] == 0)

d_main, _, _ = drain(DRIVER, defer=DEFER)
# `buses`, not `jobcards`: job cards are filtered per record now, which is not
# what this check is about.
check("a driver's own drain is unaffected by the defer list", {("buses", "b0")} <= set(d_main))
check("…and still carries no telemetry", not [x for x in d_main if x[0] == "gpsevents"])

print("\nA name that is not a store is harmless")
page = S.pull(0, actor=OWNER, defer=["notastore"])
check("deferring an unknown store changes nothing", len(page["records"]) > 0)
page = S.pull(0, actor=OWNER, only=["notastore"])
check("asking only for an unknown store returns nothing", page["records"] == [])

print("\nDeferring is what the client asks for, not a server default")
page = S.pull(0, actor=OWNER)
check("an undeferred pull still includes telemetry",
      any(x["store"] == "gpsevents" for x in page["records"]))

print()
if fails:
    print("%d FAILED:" % len(fails))
    for f in fails:
        print("  - " + f)
    sys.exit(1)
print("all ok")

#!/usr/bin/env python3
"""The office login reads crew performance and can change nothing.

The point of the role is that somebody in the office can see how the drivers
are doing without being able to touch the roster, the ratings, or anybody's
Aadhaar. Each of those is a separate guard, so each is tested separately.

    /usr/bin/python3 test_office.py
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
OFFICE = {"id": "u-off", "role": "office"}
OWNER = {"id": "u-own", "role": "owner"}


def check(name, cond):
    print(("  ok  " if cond else " FAIL ") + name)
    if not cond:
        fails.append(name)


def push(actor, store, rid, data):
    return S.push([{"store": store, "id": rid, "data": dict(data, id=rid)}], actor)


def ok(res):
    return bool(res.get("applied"))


print("The role exists and is spelled the same everywhere")
check("office is a known role", "office" in S.ALL_ROLES)
check("and is NOT given PII", "office" not in S.PII_ROLES)

print("\nIt cannot write anything that matters")
check("cannot change a crew record", not ok(push(OFFICE, "drivers", "d-1", {"name": "Ramesh", "role": "driver"})))
check("cannot write a review", not ok(push(OFFICE, "rbreviews", "rv-1", {"stars": 5})))
check("cannot touch a bus", not ok(push(OFFICE, "buses", "b-1", {"regNo": "RJ14 0001"})))
check("cannot open a job card", not ok(push(OFFICE, "jobcards", "j-1", {"busId": "b-1", "problem": "x", "status": "open"})))
check("cannot issue stock", not ok(push(OFFICE, "ledger", "l-1", {"partId": "p1", "type": "out", "qty": 1})))
check("cannot name a redBus review as a crew member", not ok(push(OFFICE, "rbalias", "a-1", {"name": "Ramesh"})))
check("cannot assign a bus through the duty log", not ok(push(OFFICE, "dutylog", "dl-1", {"crewId": "d-1", "busId": "b-1"})))

print("\nThe conversation log is its one real write")
check("it can record a conversation", ok(push(OFFICE, "crewnotes", "cn-1",
      {"crewId": "d-9", "at": S.now_ms(), "kind": "warned", "text": "Spoke about three one-star reviews."})))
check("a note must say who it is about", not ok(push(OFFICE, "crewnotes", "cn-2", {"text": "something"})))
check("and must say what was said", not ok(push(OFFICE, "crewnotes", "cn-3", {"crewId": "d-9", "text": "  "})))
# Append-only: the note everybody remembers is the one changed after the argument.
check("it cannot be edited afterwards", not ok(push(OFFICE, "crewnotes", "cn-1",
      {"crewId": "d-9", "text": "Actually it was fine."})))
check("nor by the owner", not ok(push(OWNER, "crewnotes", "cn-1", {"crewId": "d-9", "text": "Rewritten."})))
check("nor deleted", not ok(push(OFFICE, "crewnotes", "cn-1", {"crewId": "d-9", "text": "x", "_deleted": True})))
stored_note = next((r["data"] for r in S.pull(0, actor=OWNER).get("records", []) if r["id"] == "cn-1"), None)
check("the note kept its first wording", stored_note and "three one-star" in stored_note.get("text", ""))
check("and the author is the signed-in login, not the body", stored_note and stored_note.get("by") == "u-off")
# A driver must not receive notes about anybody, including themselves.
DRV = {"id": "u-d1", "role": "driver"}
drv_sees = [r for r in S.pull(0, actor=DRV).get("records", []) if r["store"] == "crewnotes"]
check("a driver receives no conversation notes at all", not drv_sees)
mech_sees = [r for r in S.pull(0, actor={"id": "u-m1", "role": "mechanic"}).get("records", []) if r["store"] == "crewnotes"]
check("neither does a mechanic", not mech_sees)
off_sees = [r for r in S.pull(0, actor=OFFICE).get("records", []) if r["store"] == "crewnotes"]
check("the office does receive them", len(off_sees) == 1)

print("\nThe two things it may write")
check("its own attendance", ok(push(OFFICE, "attendance", "att-1", {"userId": "u-off", "type": "in", "at": S.now_ms()})))
check("and the usage counter every login writes", ok(push(OFFICE, "usage", "us-1", {"screen": "home", "n": 1})))

print("\nA driver's private details never reach it")
S.push([{"store": "drivers", "id": "d-9", "data": {
    "id": "d-9", "name": "Ramesh", "role": "driver", "phone": "9876543210",
    "license": "RJ14 2019 0001234", "salaryMonthly": 22000, "address": "Jaipur",
    "docs": {"aadhaar": {"number": "123412341234"}}}}], OWNER)
got = S.pull(0, actor=OFFICE)
rec = next((r["data"] for r in got.get("records", []) if r["id"] == "d-9"), None)
check("the office does receive the crew member", rec is not None)
if rec:
    for field in ("phone", "license", "salaryMonthly", "address", "docs"):
        check("  %s is stripped out" % field, not rec.get(field))
    check("  but the name survives, or the screen is useless", rec.get("name") == "Ramesh")

owner_rec = next((r["data"] for r in S.pull(0, actor=OWNER).get("records", []) if r["id"] == "d-9"), None)
check("the owner still sees the whole record", bool(owner_rec and owner_rec.get("license")))

print("\nRESULT: " + ("ALL PASS" if not fails else "%d FAILED -> %s" % (len(fails), fails)))
sys.exit(1 if fails else 0)

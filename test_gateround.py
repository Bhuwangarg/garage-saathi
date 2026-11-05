#!/usr/bin/env python3
"""A supervisor can run the evening's gate round, and cannot clear their own.

The owner decided on 4 Nov 2026 that drivers have logins and do not use them, so
the departure check is recorded by somebody holding a phone -- keeping all ten
items, the hold, and the driver's photograph (DECISIONS.md section 12). The
server answered "a gate check is started by the driver at the bus" to any
manager, so that screen could not ship at all.

These pin both halves: a manager may now START and FILL a round, and a manager
may NOT decide on a check they ran themselves -- the same rule as a job card's
second signature, because with drivers out of the flow one pair of hands would
otherwise check a bus, fail it, and clear it.

    /usr/bin/python3 test_gateround.py
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

SUP = {"id": "u-sup", "role": "supervisor"}
SUP2 = {"id": "u-sup2", "role": "supervisor"}
OWNER = {"id": "u-own", "role": "owner"}
DRIVER = {"id": "u-d1", "role": "driver"}
fails = []


def check(name, ok, detail=""):
    print(("  ok  " if ok else "  FAIL ") + name + ("" if ok else "  -- " + str(detail)))
    if not ok:
        fails.append(name)


def push(actor, store, rid, data):
    data.setdefault("updatedAt", S.now_ms())
    return S.push([{"store": store, "id": rid, "data": dict(data, id=rid),
                    "updatedAt": data["updatedAt"]}], actor=actor)


def ok(res):
    return (res or {}).get("applied") == 1


def why(res):
    r = (res or {}).get("refused") or []
    return r[0].get("reason") if r else None


# Fixture: one bus, one crew member on it, one crew member on another bus.
push(OWNER, "buses", "b1", {"regNo": "RJ14 PA 1023"})
push(OWNER, "buses", "b2", {"regNo": "RJ14 PA 2044"})
push(OWNER, "drivers", "d1", {"name": "Ramlal", "busId": "b1", "userId": "u-d1",
                              "status": "active"})
push(OWNER, "drivers", "d2", {"name": "Kesar", "busId": "b2", "userId": "u-d2",
                              "status": "active"})

# A real items map. Every one of the ten must be present or the outcome is
# "incomplete", and an item that needs a photo needs one, and a failed item
# needs a note. My first version used {"tyres": "fail"} and the server rightly
# called the whole check incomplete.
def items(fail=None):
    out = {}
    for k, needs_photo in S.GATE_ITEMS:
        it = {"ok": k != fail}
        if needs_photo:
            it["photo"] = "/uploads/" + (k * 8)[:32] + ".jpg"
        if k == fail:
            it["note"] = "nearside rear is down to the markers"
        out[k] = it
    return out


def round_rec(**over):
    d = {"busId": "b1", "regNo": "RJ14 PA 1023", "driverId": "d1", "driverName": "Ramlal",
         "startedAt": S.now_ms(), "date": "2026-11-05", "selfie": "/uploads/" + "a" * 32 + ".jpg",
         "faceVerified": False, "lat": 26.9, "lng": 75.8, "onDutyBoard": True,
         "status": "open", "items": {}}
    d.update(over)
    return d


print("A supervisor runs the round")

r = push(SUP, "gatechecks", "gc-1", round_rec())
check("a supervisor can START a gate check", ok(r), why(r))
stored = next((x["data"] for x in S.pull(0, actor=OWNER).get("records", [])
               if x["store"] == "gatechecks" and x["id"] == "gc-1"), {})
check("  ...and the record says the SUPERVISOR did it", stored.get("userId") == "u-sup",
      "userId=%r" % stored.get("userId"))
check("  ...while still naming the driver taking the bus out",
      stored.get("driverId") == "d1" and stored.get("driverName") == "Ramlal",
      "driverId=%r name=%r" % (stored.get("driverId"), stored.get("driverName")))

r = push(SUP, "gatechecks", "gc-2", round_rec(driverId="d2"))
check("a driver crewed to another bus is refused", not ok(r), "applied=%r" % (r or {}).get("applied"))
r = push(SUP, "gatechecks", "gc-3", round_rec(driverId=""))
check("a round with no driver named is refused", not ok(r), "applied=%r" % (r or {}).get("applied"))
r = push(SUP, "gatechecks", "gc-4", round_rec(status="released"))
check("a round cannot start already released", not ok(r), "applied=%r" % (r or {}).get("applied"))
r = push(SUP, "gatechecks", "gc-5", round_rec(decision={"verdict": "go", "reason": "fine"}))
check("a round cannot start already decided", not ok(r), "applied=%r" % (r or {}).get("applied"))

print("\nAnd fills it in")
filled = dict(stored, items=items(fail="tyres"), status="awaiting")
r = push(SUP, "gatechecks", "gc-1", filled)
check("the supervisor who started it can fill it in and escalate", ok(r), why(r))

print("\nBut does not clear their own")
cur = next((x["data"] for x in S.pull(0, actor=OWNER).get("records", [])
            if x["store"] == "gatechecks" and x["id"] == "gc-1"), {})
r = push(SUP, "gatechecks", "gc-1", dict(cur, status="approved",
                                         decision={"reason": "looked fine to me"}))
check("the supervisor who RAN the check cannot decide it", not ok(r),
      "applied=%r reason=%r" % ((r or {}).get("applied"), why(r)))
r = push(SUP2, "gatechecks", "gc-1", dict(cur, status="approved",
                                          decision={"reason": "checked the tyre myself"}))
check("  ...but another supervisor can", ok(r), why(r))

print("\nThe driver path is unchanged")
r = push(DRIVER, "gatechecks", "gc-d1", round_rec(busId="b1", driverId="d1"))
check("a driver can still start their own check", ok(r), why(r))
r = push(DRIVER, "gatechecks", "gc-d2", round_rec(busId="b2", driverId="d2"))
check("a driver still cannot check somebody else's bus", not ok(r),
      "applied=%r" % (r or {}).get("applied"))

n = 13
print("\n%d of %d checks passed." % (n - len(fails), n))
if fails:
    print("FAILED: " + "; ".join(fails))
    sys.exit(1)
print("\nall passed")

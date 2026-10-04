"""Server rules for the gate check (departure checklist).

The driver fills in and releases their own bus's check; a failed check goes to
the office, and only the owner or a supervisor decides go/hold, with a reason.
Nobody deletes a check or rewrites who did it.

Run: python3 test_gatecheck.py
"""
import copy
import json
import os
import subprocess
import tempfile

_tmp = tempfile.mkdtemp(prefix="gs-gate-")
os.environ["DB_PATH"] = os.path.join(_tmp, "test.db")
os.environ.pop("TURSO_URL", None)
os.environ.pop("TURSO_DATABASE_URL", None)

import sync_server as S  # noqa: E402

fails = []


def check(name, cond):
    print(("  ok  " if cond else " FAIL ") + name)
    if not cond:
        fails.append(name)


OWNER = {"id": "u-owner", "role": "owner"}
SUPER = {"id": "u-sup", "role": "supervisor"}
CREWM = {"id": "u-crewm", "role": "crewmanager"}
DRV = {"id": "u-drvA", "role": "driver"}
DRV2 = {"id": "u-drvB", "role": "driver"}
STORE = {"id": "u-store", "role": "store"}

_t = [S.now_ms()]


def push(actor, store, data):
    _t[0] += 10
    return S.push([{"store": store, "id": data["id"], "updatedAt": _t[0], "data": copy.deepcopy(data)}], actor)


def stored(rid):
    c = S.db()
    r = c.execute("SELECT data FROM records WHERE store='gatechecks' AND id=?", (rid,)).fetchone()
    c.close()
    return json.loads(r[0]) if r else None


# The two items lists must not drift.
js = json.loads(subprocess.check_output(
    ["node", "-e", "console.log(JSON.stringify(require('./gate.js').GATE_ITEMS))"]).decode())
check("gate.js and the server list the same items", [(i["k"], i["photo"]) for i in js] == S.GATE_ITEMS)

# Crew records the server resolves logins to.
push(SUPER, "drivers", {"id": "d-A", "name": "Driver A", "userId": "u-drvA", "busId": "bus-1"})
push(SUPER, "drivers", {"id": "d-B", "name": "Driver B", "userId": "u-drvB", "busId": "bus-2"})


def all_pass():
    return {k: {"ok": True, "photo": "u/x.jpg" if p else ""} for k, p in S.GATE_ITEMS}


base = {"id": "gc-1", "busId": "bus-1", "regNo": "RJ09PA6141", "driverId": "d-A", "driverName": "Driver A",
        "startedAt": S.now_ms() - 1000, "date": "2026-10-05", "selfie": "u/self.jpg", "faceVerified": True,
        "lat": 26.9, "lng": 75.8, "onDutyBoard": True, "status": "open", "items": {}}

# Starting a check.
check("store login cannot write gate checks", push(STORE, "gatechecks", base)["rejected"] == 1)
check("crew manager cannot write gate checks", push(CREWM, "gatechecks", base)["rejected"] == 1)
check("owner cannot start a check for the driver", push(OWNER, "gatechecks", base)["rejected"] == 1)
check("another driver cannot start my check", push(DRV2, "gatechecks", base)["rejected"] == 1)
check("a driver cannot start a check for a bus that is not theirs",
      push(DRV, "gatechecks", dict(base, id="gc-x", busId="bus-2"))["rejected"] == 1)
check("a check must start open", push(DRV, "gatechecks", dict(base, id="gc-y", status="released"))["rejected"] == 1)
check("the driver starts their own check", push(DRV, "gatechecks", base)["applied"] == 1)
check("userId is stamped from the token", stored("gc-1")["userId"] == "u-drvA")

# Filling and releasing.
cur = dict(stored("gc-1"))
half = dict(cur, items={"ac": {"ok": True, "photo": "u/ac.jpg"}})
check("the driver saves progress", push(DRV, "gatechecks", half)["applied"] == 1)
check("cannot release an incomplete check", push(DRV, "gatechecks", dict(half, status="released"))["rejected"] == 1)
noPhoto = all_pass(); noPhoto["ac"] = {"ok": True}
check("cannot release with a photo item missing its photo",
      push(DRV, "gatechecks", dict(half, items=noPhoto, status="released"))["rejected"] == 1)
check("cannot swap the selfie", push(DRV, "gatechecks", dict(half, selfie="u/someone-else.jpg"))["rejected"] == 1)
check("cannot move the start time", push(DRV, "gatechecks", dict(half, startedAt=1))["rejected"] == 1)
check("cannot write a decision", push(DRV, "gatechecks", dict(half, decision={"reason": "ok"}))["rejected"] == 1)
check("cannot delete", push(DRV, "gatechecks", dict(half, _deleted=True))["rejected"] == 1)

fail = all_pass(); fail["ac"] = {"ok": False, "note": "not cooling"}
check("a pass-only release is refused when an item failed",
      push(DRV, "gatechecks", dict(half, items=fail, status="released"))["rejected"] == 1)
check("a failed check goes to the office", push(DRV, "gatechecks", dict(half, items=fail, status="awaiting"))["applied"] == 1)
aw = stored("gc-1")
check("…stamped with when it was sent", isinstance(aw.get("sentAt"), int))
check("the driver cannot release it while it waits",
      push(DRV, "gatechecks", dict(aw, items=all_pass(), status="released"))["rejected"] == 1)

# The office.
check("crew manager cannot decide", push(CREWM, "gatechecks", dict(aw, status="approved", decision={"reason": "x"}))["rejected"] == 1)
check("a decision needs a reason", push(SUPER, "gatechecks", dict(aw, status="held", decision={"reason": " "}))["rejected"] == 1)
check("the office cannot change the items",
      push(SUPER, "gatechecks", dict(aw, items=all_pass(), status="approved", decision={"reason": "fine"}))["rejected"] == 1)
check("supervisor holds the bus", push(SUPER, "gatechecks", dict(aw, status="held", decision={"reason": "fix AC first", "by": "forged"}))["applied"] == 1)
h = stored("gc-1")
check("decision by/at are stamped by the server", h["decision"]["by"] == "u-sup" and h["decision"]["verdict"] == "hold"
      and isinstance(h["decision"]["at"], int))
check("a held check cannot then be approved directly",
      push(OWNER, "gatechecks", dict(h, status="approved", decision={"reason": "go"}))["rejected"] == 1)

# Re-check after a hold.
check("the driver re-opens a held check", push(DRV, "gatechecks", dict(h, status="open"))["applied"] == 1)
o = stored("gc-1")
check("…and the earlier failure stays on record", o.get("failedBefore") == ["ac"])
check("fixed and all passed → released", push(DRV, "gatechecks", dict(o, items=all_pass(), status="released"))["applied"] == 1)
r = stored("gc-1")
check("released is stamped by the server", isinstance(r.get("releasedAt"), int) and r.get("failedBefore") == ["ac"])
check("a released check is locked", push(DRV, "gatechecks", dict(r, items=fail, status="open"))["rejected"] == 1)
check("…even for the owner", push(OWNER, "gatechecks", dict(r, status="held", decision={"reason": "x"}))["rejected"] == 1)

# Approve path, on a second check.
g2 = dict(base, id="gc-2")
push(DRV, "gatechecks", g2)
push(DRV, "gatechecks", dict(stored("gc-2"), items=fail, status="awaiting"))
check("owner approves a go with a reason",
      push(OWNER, "gatechecks", dict(stored("gc-2"), status="approved", decision={"reason": "AC fixed at Mathura stop"}))["applied"] == 1)
check("approved check records verdict go", stored("gc-2")["decision"]["verdict"] == "go")

# Hold → re-check → go: the hold survives as history.
g4 = dict(base, id="gc-4")
push(DRV, "gatechecks", g4)
push(DRV, "gatechecks", dict(stored("gc-4"), items=fail, status="awaiting"))
push(SUPER, "gatechecks", dict(stored("gc-4"), status="held", decision={"reason": "fix AC"}))
push(DRV, "gatechecks", dict(stored("gc-4"), status="open"))
push(DRV, "gatechecks", dict(stored("gc-4"), status="awaiting"))
check("a re-sent check can be decided again",
      push(OWNER, "gatechecks", dict(stored("gc-4"), status="approved", decision={"reason": "AC fixed, go"}))["applied"] == 1)
g = stored("gc-4")
check("…and the earlier hold is kept as history",
      [d["verdict"] for d in g.get("pastDecisions", [])] == ["hold"] and g["decision"]["verdict"] == "go")
check("history cannot be forged by the office", push(OWNER, "gatechecks", dict(g, status="held", pastDecisions=[], decision={"reason": "x"}))["rejected"] == 1)

# The office alert fires once, when a check first goes to the office.
sent = []
S.send_push = lambda title, body, url="/", roles=None: sent.append((title, body)) or 1
g3 = dict(base, id="gc-3")
push(DRV, "gatechecks", g3)
push(DRV, "gatechecks", dict(stored("gc-3"), items=fail, status="awaiting"))
check("office is alerted when a bus waits at the gate", len(sent) == 1 and "RJ09PA6141" in sent[0][0] and "ac" in sent[0][1])
push(DRV, "gatechecks", stored("gc-3"))
check("…and not again on a re-push", len(sent) == 1)

print("\n%d failed" % len(fails) if fails else "\nall passed")
raise SystemExit(1 if fails else 0)

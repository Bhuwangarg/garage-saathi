"""Server rules for "this redBus name on this bus is this crew member".

Run: python3 test_rbalias.py
"""
import copy
import json
import os
import subprocess
import tempfile

_tmp = tempfile.mkdtemp(prefix="gs-alias-")
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
STORE = {"id": "u-store", "role": "store"}
_t = [S.now_ms()]


def push(actor, store, data):
    _t[0] += 10
    return S.push([{"store": store, "id": data["id"], "updatedAt": _t[0], "data": copy.deepcopy(data)}], actor)


def stored(rid):
    c = S.db()
    r = c.execute("SELECT data FROM records WHERE store='rbalias' AND id=?", (rid,)).fetchone()
    c.close()
    return json.loads(r[0]) if r else None


# The id rule must match trace.js exactly, or the app and the server would key the same name twice.
cases = [("Kesar Dvr", "mp44zf2538"), ("  Jitu  Ji!", "RJ 09 PA 6141"), ("Mukesh Sharma", "MP44ZD471")]
js = json.loads(subprocess.check_output(["node", "-e",
    "const T=require('./trace.js');console.log(JSON.stringify(%s.map(([n,r])=>T.aliasId(n,r))))" % json.dumps(cases)]).decode())
check("trace.js and the server build the same id", js == [S._alias_id(n, r) for n, r in cases])

push(SUPER, "drivers", {"id": "d-kesar", "name": "Kesar Singh", "busId": "bus-2538"})
push(SUPER, "drivers", {"id": "d-other", "name": "Kesar Lal", "busId": "bus-9"})
rid = S._alias_id("Kesar Dvr", "MP44ZF2538")
rec = {"id": rid, "name": "Kesar Dvr", "regNo": "MP44ZF2538", "role": "driver", "status": "crew", "crewId": "d-kesar",
       "decidedBy": "forged"}

check("a driver cannot confirm names", push(DRV, "rbalias", rec)["rejected"] == 1)
check("store cannot confirm names", push(STORE, "rbalias", rec)["rejected"] == 1)
check("the crew manager confirms a name", push(CREWM, "rbalias", rec)["applied"] == 1)
s = stored(rid)
check("who decided comes from the login", s["decidedBy"] == "u-crewm" and isinstance(s["decidedAt"], int))

check("a second record for the same name and bus is refused",
      push(SUPER, "rbalias", dict(rec, id="al-MP44ZF2538-kesar_dvr_2"))["rejected"] == 1)
check("a crew member who does not exist is refused",
      push(SUPER, "rbalias", dict(rec, id=S._alias_id("X", "MP44ZF2538"), name="X", crewId="d-nobody"))["rejected"] == 1)
check("the name of a match cannot be changed", push(SUPER, "rbalias", dict(s, name="Kesar"))["rejected"] == 1)
check("cannot be deleted", push(OWNER, "rbalias", dict(s, _deleted=True))["rejected"] == 1)

check("a correction is allowed", push(SUPER, "rbalias", dict(s, crewId="d-other"))["applied"] == 1)
s2 = stored(rid)
check("…and the earlier answer is kept", s2["crewId"] == "d-other" and s2["history"][-1]["crewId"] == "d-kesar"
      and s2["history"][-1]["decidedBy"] == "u-crewm")

gen = {"id": S._alias_id("Staff", "RJ09PA6141"), "name": "Staff", "regNo": "RJ09PA6141", "role": "driver",
       "status": "generic", "crewId": "d-kesar"}
check("\"not a real name\" is allowed", push(CREWM, "rbalias", gen)["applied"] == 1)
check("…and never points at anyone", stored(gen["id"])["crewId"] is None)
check("an unknown status is refused", push(CREWM, "rbalias", dict(gen, status="maybe"))["rejected"] == 1)

print("\n%d failed" % len(fails) if fails else "\nall passed")
raise SystemExit(1 if fails else 0)

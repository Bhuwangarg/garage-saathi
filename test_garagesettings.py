#!/usr/bin/env python3
"""The garage's settings are the same on every phone, or the money is not.

Labour rate, late cutoff, the late penalty and the geofence live in the `meta`
store. It was never synced, so the owner's ₹400/hr stayed on the owner's phone
and every other device costed the same job at the built-in ₹250.

    /usr/bin/python3 test_garagesettings.py
"""
import json, os, sys, tempfile

os.environ["DB_PATH"] = tempfile.mktemp(suffix=".db")
os.environ.pop("ENABLE_DEMO_SEED", None)
for k in ("DATABASE_URL", "TURSO_URL", "TURSO_DATABASE_URL"):
    os.environ.pop(k, None)
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import sync_server as S  # noqa: E402

fails = []
OWNER = {"id": "u-own", "role": "owner"}
SUP = {"id": "u-sup", "role": "supervisor"}
STORE = {"id": "u-st", "role": "store"}
DRIVER = {"id": "u-d1", "role": "driver"}


def check(name, cond):
    print(("  ok  " if cond else " FAIL ") + name)
    if not cond:
        fails.append(name)


def push(actor, rid, data):
    return S.push([{"store": "meta", "id": rid, "updatedAt": S.now_ms(), "data": data}], actor)


def stored(rid):
    c = S.db()
    row = c.execute("SELECT data FROM records WHERE store='meta' AND id=?", (rid,)).fetchone()
    c.close()
    return json.loads(row[0]) if row else None


GARAGE = {"key": "garage", "name": "Mahalaxmi Travels Garage", "labourRate": 400,
          "lateCutoff": "09:30", "latePenalty": 200, "lat": 26.9124, "lng": 75.7873, "radiusM": 200}

print("The settings row")
r = push(OWNER, "garage", dict(GARAGE))
check("an owner may set the garage up", r["applied"] == 1 and stored("garage")["labourRate"] == 400)
check("it is keyed by `key`, not `id`", stored("garage").get("key") == "garage")
check("the payload carries a timestamp, so phones accept it", (stored("garage").get("updatedAt") or 0) > 0)
r = push(SUP, "garage", dict(GARAGE, labourRate=450))
check("a supervisor may too", r["applied"] == 1 and stored("garage")["labourRate"] == 450)
r = push(STORE, "garage", dict(GARAGE, labourRate=1))
check("the storekeeper may not", r["rejected"] == 1 and stored("garage")["labourRate"] == 450)
r = push(DRIVER, "garage", dict(GARAGE, labourRate=1))
check("nor a driver", r["rejected"] == 1 and stored("garage")["labourRate"] == 450)

print("Everything else in that store stays on its own device")
r = push(OWNER, "seeded", {"key": "seeded", "value": True})
check("the seed flag is refused", r["rejected"] == 1 and stored("seeded") is None)
check("the refusal says why", "garage settings" in (r["refused"][0]["reason"] if r["refused"] else ""))

print("And it reaches a device through the ordinary pull")
page = S.pull(0, actor={"id": "u-x", "role": "mechanic"})
rec = [x for x in page["records"] if x["store"] == "meta"]
check("every role receives the settings (they price what people see)", len(rec) == 1)
check("with the rate on it", rec[0]["data"]["labourRate"] == 450)

print("\nRESULT: " + ("ALL PASS" if not fails else "%d FAILED -> %s" % (len(fails), fails)))
sys.exit(1 if fails else 0)

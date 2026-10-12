#!/usr/bin/env python3
"""GPS history is telemetry, not a record every phone needs.

Every screen that reads `gpsevents` looks back seven days at most, and only the
owner and supervisor can open one. The table passed 42,000 rows and /pull sent
all of them to every device, which is most of why a phone re-downloading the
fleet never seemed to finish.

    /usr/bin/python3 test_gpshistory.py
"""
import os, sys, tempfile

os.environ["DB_PATH"] = tempfile.mktemp(suffix=".db")
os.environ.pop("ENABLE_DEMO_SEED", None)
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


def ev(age_days):
    at = S.now_ms() - int(age_days * 86400000)
    return {"store": "gpsevents", "id": "g-%s" % age_days, "data": {"id": "g", "reg": "RJ14PA1023", "type": "night", "at": at}}


OWNER = {"id": "u-o", "role": "owner"}
SUP = {"id": "u-s", "role": "supervisor"}
CREWMGR = {"id": "u-cm", "role": "crewmanager"}
DRIVER = {"id": "u-d", "role": "driver"}
STORE = {"id": "u-st", "role": "store"}

print("Who gets GPS history at all")
check("the owner does", S.redact_for(OWNER, ev(1)) is not None)
check("a supervisor does", S.redact_for(SUP, ev(1)) is not None)
check("a crew manager does not — no screen reads it", S.redact_for(CREWMGR, ev(1)) is None)
check("nor the store", S.redact_for(STORE, ev(1)) is None)
check("nor a driver", S.redact_for(DRIVER, ev(1)) is None)

print("How far back")
check("yesterday's event is sent", S.redact_for(OWNER, ev(1)) is not None)
check("a 29-day-old event is sent", S.redact_for(OWNER, ev(29)) is not None)
check("a 31-day-old event is not", S.redact_for(OWNER, ev(31)) is None)
check("a year-old event is not", S.redact_for(OWNER, ev(365)) is None)

print("Everything else is untouched by this rule")
crew = {"store": "drivers", "id": "d1", "data": {"id": "d1", "name": "Ramlal", "phone": "9876500000"}}
check("the owner still gets a crew record whole", (S.redact_for(OWNER, crew) or {}).get("data", {}).get("phone") == "9876500000")
check("a driver still gets one, redacted", (S.redact_for(DRIVER, crew) or {}).get("data", {}).get("_redacted") is True)
bus = {"store": "buses", "id": "b1", "data": {"id": "b1", "regNo": "RJ14 PA 1023"}}
check("a crew manager still gets buses", S.redact_for(CREWMGR, bus) is not None)

print("\nRESULT: " + ("ALL PASS" if not fails else "%d FAILED -> %s" % (len(fails), fails)))
sys.exit(1 if fails else 0)

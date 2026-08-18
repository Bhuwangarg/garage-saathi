"""Direct test of the WhatsApp odometer capture path.

The value of this flow is entirely in what it REFUSES to write. Every one of the
89 buses currently reads odometer 0, so the first real reading has no history to
be checked against and anything we accept becomes the baseline for cost-per-km
forever. A digit slip that turns 45,218 into 452,180 would not look wrong on any
screen, and would quietly poison every km figure for that bus for months.

So these tests exercise the refusals, not the happy path:
  - a reading that goes backwards is never written;
  - a jump too large for one day's running is held for a human;
  - an unknown phone enrols instead of guessing a bus;
  - an unreadable photo asks again rather than writing a zero.

Vision is stubbed — this tests the guard rails, not the OCR. Real accuracy needs
real dashboard photos from the fleet and is measured separately.

Run: python3 test_odometer.py
"""
import json
import os
import sys
import tempfile

_tmp = tempfile.mkdtemp(prefix="gs-odo-")
os.environ["DB_PATH"] = os.path.join(_tmp, "test.db")
os.environ.pop("TURSO_URL", None)
os.environ.pop("TURSO_DATABASE_URL", None)

import sync_server as S  # noqa: E402

fails = []


def check(name, cond):
    print(("  ok  " if cond else "  FAIL ") + name)
    if not cond:
        fails.append(name)


def put_bus(bus_id, reg, phone, odo):
    with S._lock:
        c = S.db()
        rev = c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()[0]
        S._upsert_record(c, "buses", bus_id, {
            "id": bus_id, "regNo": reg, "crewPhone": phone,
            "odometer": odo, "updatedAt": S.now_ms(),
        }, S.now_ms(), rev)
        c.commit(); c.close()


def get_bus(bus_id):
    with S._lock:
        c = S.db()
        row = c.execute("SELECT data FROM records WHERE store='buses' AND id=?", (bus_id,)).fetchone()
        c.close()
    return json.loads(row[0]) if row else None


def logs():
    with S._lock:
        c = S.db()
        rows = c.execute("SELECT data FROM records WHERE store='odometerlogs'").fetchall()
        c.close()
    return [json.loads(r[0]) for r in rows]


IMG = "data:image/jpeg;base64,AAAA"


def stub(km, raw="stub"):
    S.vision_read_odometer = lambda _img: (km, raw)


print("\n--- phone routing ---")
put_bus("bus-1", "RJ14PF207", "7357316016", 0)

stub(45218)
r = S.odometer_submit("7357316016", IMG)
check("a known phone routes to its bus", r["status"] == "accepted" and r["bus"] == "RJ14PF207")
check("first reading is written even from 0", get_bus("bus-1")["odometer"] == 45218)

r = S.odometer_submit("+91 73573 16016", IMG)
check("+91 and spacing still match the same bus", r["status"] == "accepted")

r = S.odometer_submit("9999999999", IMG)
check("an unknown phone asks to enrol, does not guess", r["status"] == "enrol")
check("enrol reply names the office, not an error code", "register" in r["reply"].lower())

print("\n--- the refusals that protect cost-per-km ---")
put_bus("bus-2", "RJ09PA6126", "9828949520", 100000)

stub(99000)
r = S.odometer_submit("9828949520", IMG)
check("a backwards reading is HELD", r["status"] == "held")
check("...and the bus is NOT updated", get_bus("bus-2")["odometer"] == 100000)
check("...and it is logged for the office", any(l["status"] == "held-backwards" for l in logs()))

stub(1000000)   # the classic digit slip: 100,000 -> 1,000,000
r = S.odometer_submit("9828949520", IMG)
check("an implausible jump is HELD", r["status"] == "held")
check("...and the bus is NOT updated", get_bus("bus-2")["odometer"] == 100000)
check("...and it is logged as a jump", any(l["status"] == "held-jump" for l in logs()))

stub(100450)    # a normal day's running
r = S.odometer_submit("9828949520", IMG)
check("a plausible day IS accepted", r["status"] == "accepted")
check("...and the bus is updated", get_bus("bus-2")["odometer"] == 100450)
check("...and the reply states the delta", "450" in r["reply"])

stub(100450 + int(S.ODO_MAX_DAILY_KM))
r = S.odometer_submit("9828949520", IMG)
check("exactly at the daily limit is accepted, not held", r["status"] == "accepted")

print("\n--- unreadable photo ---")
S.vision_read_odometer = lambda _img: (None, "NONE")
r = S.odometer_submit("9828949520", IMG)
check("an unreadable photo asks again", r["status"] == "unreadable")
check("...and never writes a zero", get_bus("bus-2")["odometer"] != 0)

print("\n--- audit trail ---")
all_logs = logs()
check("every attempt is logged, accepted or not", len(all_logs) >= 5)
check("each log keeps the raw model output", all("raw" in l for l in all_logs))
check("each log keeps the submitting phone", all(l.get("phone") for l in all_logs))
check("each log names the bus", all(l.get("busId") for l in all_logs))
check("logs record their transport", all(l.get("source") for l in all_logs))

print("\n--- write permissions ---")
check("no client role may push odometerlogs",
      all(S.may_write(r_, "odometerlogs") is False
          for r_ in ("owner", "supervisor", "store", "mechanic", "driver")))

print("\n--- dry run: read, but never write ---")
put_bus("bus-3", "MP44ZE3358", "9000000003", 500000)
before_logs = len(logs())

stub(500300)
r = S.odometer_submit("9000000003", IMG, dry=True)
check("dry run reports the reading", r["status"] == "accepted" and r["km"] == 500300)
check("dry run is flagged as dry", r.get("dry") is True)
check("dry run does NOT move the odometer", get_bus("bus-3")["odometer"] == 500000)
check("dry run writes no log row", len(logs()) == before_logs)

stub(9999999)
r = S.odometer_submit("9000000003", IMG, dry=True)
check("dry run still reports a held jump", r["status"] == "held")
check("...and still writes nothing", len(logs()) == before_logs)
check("...and leaves the odometer alone", get_bus("bus-3")["odometer"] == 500000)

stub(500300)
S.odometer_submit("9000000003", IMG)
check("a real run after a dry run DOES write", get_bus("bus-3")["odometer"] == 500300)

print("\nRESULT: " + ("ALL PASS" if not fails else f"{len(fails)} FAILED: {fails}"))
sys.exit(1 if fails else 0)

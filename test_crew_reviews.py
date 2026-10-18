"""A crew member's own redBus reviews (/my/reviews): theirs only, and nothing about the passenger.

Run: python3 test_crew_reviews.py
"""
import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="gs-myrv-")
os.environ["DB_PATH"] = os.path.join(_tmp, "test.db")
os.environ.pop("TURSO_URL", None)
os.environ.pop("TURSO_DATABASE_URL", None)

import crew_trace as CT  # noqa: E402
import sync_server as S  # noqa: E402

fails = []


def check(name, cond):
    print(("  ok  " if cond else " FAIL ") + name)
    if not cond:
        fails.append(name)


def put(store, data):
    c = S.db()
    rev0 = c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()[0]
    S._upsert_record(c, store, data["id"], data, S.now_ms(), rev0)
    c.commit()
    c.close()


now = S.now_ms()
day = 86400000
ist = lambda ts: CT._ist(ts).strftime("%Y-%m-%d %H:%M:%S")
put("buses", {"id": "bus-1", "regNo": "MP44ZD471"})
put("drivers", {"id": "d-ram", "name": "Ramlal", "userId": "u-ram", "busId": "bus-1"})
put("drivers", {"id": "d-sym", "name": "Shyam", "userId": "u-sym"})
put("drivers", {"id": "c-gop", "name": "Gopal", "crewRole": "conductor", "userId": "u-gop", "busId": "bus-1"})
# On the duty log since well before the trips.
for cid, role in (("d-ram", "driver"), ("c-gop", "conductor")):
    put("dutylog", {"id": "dl-base-" + cid, "at": now - 60 * day, "crewId": cid, "role": role, "busId": "bus-1"})
put("rbservices", {"id": "501", "routeIds": ["9001"], "startTime": "21:00"})
dep = CT.parse_local(ist(now - 3 * day)[:10] + " 21:00:00")
put("gatechecks", {"id": "gc-1", "serviceId": "501", "startedAt": dep - 3600000, "busId": "bus-1",
                   "regNo": "MP44ZD471", "driverId": "d-ram"})
put("rbreviews", {"id": "rv-1", "pnr": "555001", "routeId": "9001", "boardAt": ist(dep + 2 * 3600000), "stars": 2,
                  "seats": ["L4"], "comment": "rash driving, call 9829012345", "tags": ["Driving"],
                  "source": "Jaipur", "dest": "Indore"})
put("rbreviews", {"id": "rv-old", "pnr": "555002", "routeId": "9001", "boardAt": ist(now - 200 * day), "stars": 1})
put("rbreviews", {"id": "rv-x", "pnr": "555003", "routeId": "nope", "boardAt": ist(now - day), "stars": 5})

r = S.crew_reviews_for("u-ram")
check("the driver gets the review of their gate-checked trip", [x["id"] for x in r["reviews"]] == ["rv-1"])
x = r["reviews"][0]
check("…found through the gate check and the duty log", sorted(x["vias"]) == ["duty", "gate"])
check("…with the bus", x["regNo"] == "MP44ZD471")
check("…and nothing that identifies the passenger", "pnr" not in x and "seats" not in x and "boardAt" not in x
      and "9829012345" not in x["comment"])
check("older than 90 days is not sent", all(y["id"] != "rv-old" for y in r["reviews"]))
check("the conductor on the duty log gets it too", [y["id"] for y in S.crew_reviews_for("u-gop")["reviews"]] == ["rv-1"])
check("another driver gets none of it", S.crew_reviews_for("u-sym")["reviews"] == [])
check("a login with no crew record gets nothing", S.crew_reviews_for("u-owner") == {"crewId": None, "reviews": [], "days": 90})

# A later change to the data is picked up (the memo is keyed on the stores).
put("itslookup", {"id": "it-555003", "pnr": "555003", "found": True, "crewId": "d-sym"})
check("a new ITS match reaches the driver it names", [y["id"] for y in S.crew_reviews_for("u-sym")["reviews"]] == ["rv-x"])

print("\n%d failed" % len(fails) if fails else "\nall passed")
raise SystemExit(1 if fails else 0)

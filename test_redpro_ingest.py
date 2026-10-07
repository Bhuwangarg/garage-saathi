"""The redPro ingest: only the collector writes, personal data never lands, and
redBus's daily assignment becomes a history we keep.

Run: python3 test_redpro_ingest.py
"""
import json
import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="gs-redpro-")
os.environ["DB_PATH"] = os.path.join(_tmp, "test.db")
os.environ.pop("TURSO_URL", None)
os.environ.pop("TURSO_DATABASE_URL", None)

import sync_server as S  # noqa: E402

fails = []


def check(name, cond):
    print(("  ok  " if cond else " FAIL ") + name)
    if not cond:
        fails.append(name)


def stored(store, rid):
    c = S.db()
    r = c.execute("SELECT data FROM records WHERE store=? AND id=?", (store, rid)).fetchone()
    c.close()
    return json.loads(r[0]) if r else None


def count(store):
    c = S.db()
    n = c.execute("SELECT COUNT(*) FROM records WHERE store=?", (store,)).fetchone()[0]
    c.close()
    return n


NOW = S.now_ms()

# Nobody but the collector writes these stores — owner included.
for st in S.REDPRO_STORES:
    check("owner cannot push %s" % st, not S.may_write("owner", st))
    check("driver cannot push %s" % st, not S.may_write("driver", st))

# Reviews: personal fields are dropped even if sent.
rev = {"reviewId": "88123", "tin": "TVB276345240", "pnr": "251402880", "routeId": "46346772",
       "source": "Lucknow", "dest": "Kanpur (Uttar Pradesh)", "boardAt": "2026-10-07 06:15:00", "fare": "249",
       "seats": ["L10"], "stars": 1, "submittedOn": "2026-10-07T14:30:56",
       "comment": "AC not working", "tags": ["Cleanliness"], "reviewStatus": "CONFIRMED",
       "name": "Tanushka Singh", "mobileNo": "919044034155", "email": "x@y.z"}
r = S.ingest_redpro({"kind": "reviews", "rows": [rev], "capturedAt": NOW}, now=NOW)
check("a review is stored", r["ok"] and r["written"] == 1)
s = stored("rbreviews", "rv-88123")
check("passenger name, phone and e-mail never stored", not any(k in s for k in ("name", "mobileNo", "email")))
check("…and nowhere in the record", "919044034155" not in json.dumps(s) and "Tanushka" not in json.dumps(s))
check("the fields the trace needs are kept", s["pnr"] == "251402880" and s["routeId"] == "46346772" and s["stars"] == 1)

before = count("rbreviews")
r = S.ingest_redpro({"kind": "reviews", "rows": [rev], "capturedAt": NOW + 1000}, now=NOW + 1000)
check("an unchanged review is not rewritten (no re-download on every phone)", r["written"] == 0 and count("rbreviews") == before)
r = S.ingest_redpro({"kind": "reviews", "rows": [dict(rev, reviewStatus="CHALLENGED")]}, now=NOW + 2000)
check("a changed review is updated, firstSeen kept", r["written"] == 1 and stored("rbreviews", "rv-88123")["firstSeen"] == NOW)
check("an invalid star value is dropped", S._clean_review(dict(rev, stars=9))["stars"] is None)
check("an id with markup is refused", S._clean_review(dict(rev, reviewId='"><img>'))is None)

# Complaints: agent names on notes are dropped.
comp = {"caseNumber": "33967620", "pnr": "248659731", "doj": "2026-09-08 03:00:00", "status": "Closed",
        "issue": "I was not allowed to board the bus", "custName": "A B", "phoneNo": "9999999999",
        "notes": [{"at": "2026-09-08 20:04:25", "text": "Instant resolution - BO Accepted", "by": "Agent X"}]}
S.ingest_redpro({"kind": "complaints", "rows": [comp]}, now=NOW)
s = stored("rbcomplaints", "cs-33967620")
check("complaint stored without customer details", s and "custName" not in s and "9999999999" not in json.dumps(s))
check("…and without who wrote each note", s["notes"] == [{"at": "2026-09-08 20:04:25", "text": "Instant resolution - BO Accepted"}])

# Assignments: today's list becomes a dated history, one entry per change.
a1 = {"serviceId": "125291", "serviceNo": "MHLMEERUT-JAIPUR-0930PM", "origin": "Meerut", "dest": "Jaipur",
      "startTime": "21:30:00", "vehicleNo": "rj09pa6141", "driver1": "Ravindra", "driver1Mobile": "9000000000"}
day_ms = 1791375600000          # 2026-10-07 ~20:30 IST
S.ingest_redpro({"kind": "assignments", "rows": [a1], "capturedAt": day_ms}, now=day_ms)
S.ingest_redpro({"kind": "assignments", "rows": [a1], "capturedAt": day_ms + 1800000}, now=day_ms + 1800000)
s = stored("rbassign", "as-125291-" + S._ist_day(day_ms))
check("assignment stored under service + IST day", s is not None and s["date"] == S._ist_day(day_ms))
check("an unchanged snapshot adds no new entry", len(s["obs"]) == 1 and s["obs"][0]["vehicleNo"] == "RJ09PA6141")
check("driver phone never stored", "9000000000" not in json.dumps(s))
S.ingest_redpro({"kind": "assignments", "rows": [dict(a1, vehicleNo="MP44ZF2103")], "capturedAt": day_ms + 3600000},
                now=day_ms + 3600000)
s = stored("rbassign", "as-125291-" + S._ist_day(day_ms))
check("a bus swap is kept as a second entry", [o["vehicleNo"] for o in s["obs"]] == ["RJ09PA6141", "MP44ZF2103"])
svc = stored("rbservices", "125291")
check("the assignment list also describes the service", svc["startTime"] == "21:30:00" and svc["origin"] == "Meerut")

# Services: route ids merge, never shrink.
S.ingest_redpro({"kind": "services", "rows": [{"serviceId": "125291", "routeIds": ["1", "2"]}]}, now=NOW)
S.ingest_redpro({"kind": "services", "rows": [{"serviceId": "125291", "routeIds": ["2", "3"]}]}, now=NOW + 1)
check("route ids accumulate", stored("rbservices", "125291")["routeIds"] == ["1", "2", "3"])
check("…and the service keeps its time", stored("rbservices", "125291")["startTime"] == "21:30:00")

# Bad input.
check("unknown kind refused", not S.ingest_redpro({"kind": "drivers", "rows": []})["ok"])
check("too many rows refused", not S.ingest_redpro({"kind": "reviews", "rows": [{}] * (S._REDPRO_MAX_ROWS + 1)})["ok"])

# Pull: managers get these stores; crew phones do not.
rec = {"store": "rbreviews", "id": "rv-88123", "data": stored("rbreviews", "rv-88123")}
check("owner receives reviews", S.redact_for({"id": "o", "role": "owner"}, rec) is not None)
check("a driver's phone does not", S.redact_for({"id": "d", "role": "driver"}, rec) is None)
svcrec = {"store": "rbservices", "id": "125291", "data": stored("rbservices", "125291")}
check("drivers do get the service list (no names in it)", S.redact_for({"id": "d", "role": "driver"}, svcrec) is not None
      and "Ravindra" not in json.dumps(svcrec))
check("the service remembers the last bus redBus had on it", stored("rbservices", "125291")["lastVehicle"] == "MP44ZF2103")

print("\n%d failed" % len(fails) if fails else "\nall passed")
raise SystemExit(1 if fails else 0)

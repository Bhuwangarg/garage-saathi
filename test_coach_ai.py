"""Weekly coaching notes (/ai/coaching, /ai/coaching/decide, /my/coaching), against a fake API.

Run: python3 test_coach_ai.py
"""
import json
import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="gs-coach-")
os.environ["DB_PATH"] = os.path.join(_tmp, "test.db")
os.environ.pop("TURSO_URL", None)
os.environ.pop("TURSO_DATABASE_URL", None)

import coach_ai as CO  # noqa: E402
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


def rows(store):
    c = S.db()
    out = {i: json.loads(d) for i, d in c.execute("SELECT id, data FROM records WHERE store=?", (store,)).fetchall()}
    c.close()
    return out


now = S.now_ms()
D = 86400000
week, frm, to = CO.week_of(now)
mid = frm + 3 * D + 20 * 3600000          # inside last week
ist = lambda ts: CT._ist(ts).strftime("%Y-%m-%d %H:%M:%S")

put("buses", {"id": "b1", "regNo": "RJ14PB1218"})
put("drivers", {"id": "d-ram", "name": "Ramlal", "userId": "u-ram", "busId": "b1"})
put("drivers", {"id": "c-gop", "name": "Gopal", "crewRole": "conductor", "userId": "u-gop", "busId": "b1"})
put("drivers", {"id": "d-idle", "name": "Idle", "userId": "u-idle"})
put("drivers", {"id": "d-left", "name": "Gone", "status": "left"})
for cid, role in (("d-ram", "driver"), ("c-gop", "conductor")):
    put("dutylog", {"id": "dl-" + cid, "at": frm - 30 * D, "crewId": cid, "role": role, "busId": "b1"})
put("rbservices", {"id": "501", "routeIds": ["9001"], "startTime": "21:00"})
dep = CT.parse_local(ist(mid)[:10] + " 21:00:00")
put("gatechecks", {"id": "gc-1", "serviceId": "501", "startedAt": dep - 3600000, "busId": "b1", "regNo": "RJ14PB1218",
                   "driverId": "d-ram", "status": "released"})
for n, (stars, txt, faults) in enumerate([(1, "driver rash on ghat", ["driver"]), (2, "AC not working", ["bus"]), (5, "great", [])]):
    put("rbreviews", {"id": "rv-%d" % n, "pnr": "55%d" % n, "routeId": "9001", "boardAt": ist(dep + 3600000), "stars": stars,
                      "comment": txt, "tags": [], "source": "Jaipur", "dest": "Indore"})
    put("rbreviewai", {"id": "ai-rv-%d" % n, "rv": "rv-%d" % n, "v": 1, "faults": faults, "topics": [], "en": txt.capitalize()})
put("incidents", {"id": "in-1", "driverId": "d-ram", "type": "harsh-brake", "at": mid})
put("gpsevents", {"id": "ge-1", "reg": "RJ14PB1218", "type": "overspeed", "at": mid})
put("gpsevents", {"id": "ge-old", "reg": "RJ14PB1218", "type": "overspeed", "at": frm - 2 * D})

NOTE = {"hi": {"good": "गेट चेक किया", "fix": "ढलान पर धीरे", "tip": "धीरे ब्रेक"}, "en": {"good": "Did the gate check", "fix": "Slow on ghats", "tip": "Brake gently"}}


class Fake:
    def __init__(self):
        self.sent = []

    def __call__(self, method, path, payload):
        self.sent.append(payload["messages"][0]["content"])
        return {"content": [{"type": "tool_use", "name": "record_note", "input": NOTE}]}


fake = Fake()
code, res = S.coach_ai_tick(call=fake)
notes = rows("coachai")
ram = next(t for t in fake.sent if "Ramlal" in t)
check("notes drafted for the driver and the conductor, not for someone with nothing last week, nor someone who left",
      code == 200 and res["drafted"] == 2 and set(notes) == {"co-%s-d-ram" % week, "co-%s-c-gop" % week} and res["nothingToSay"] == 1)
check("the driver's facts: his review counted, the AC one marked not his", "Passenger reviews of their trips last week: 2" in ram
      and "1 more complaints were about the bus" in ram and "Driver rash on ghat" in ram)
check("…and the AC complaint is not offered as his to fix", "AC not working" not in ram)
check("incidents and GPS events in his seat last week only", "harsh-brake x1" in ram and "overspeed x1" in ram)
check("gate checks counted", "Gate checks done before departure: 1" in ram)
gop = next(t for t in fake.sent if "Gopal" in t)
check("a conductor gets no driving events", "GPS" not in gop and "Role: conductor" in gop)
check("a draft starts as a draft", notes["co-%s-d-ram" % week]["status"] == "draft")
check("nothing is drafted twice in a week", S.coach_ai_tick(call=Fake())[1]["drafted"] == 0)

# The driver sees nothing until it is approved.
check("a draft does not reach the driver", S.my_coaching("u-ram")["notes"] == [])
check("a driver cannot approve", S.coach_decide({"id": "u-ram", "role": "driver"}, {"id": "co-%s-d-ram" % week, "decision": "approve"})[0] == 403)
code, _ = S.coach_decide({"id": "u-cm", "role": "crewmanager"}, {"id": "co-%s-d-ram" % week, "decision": "approve",
                                                                  "hi": {"fix": "घाट पर गति कम रखें"}})
mine = S.my_coaching("u-ram")["notes"]
check("the crew manager approves with an edit, and the driver sees the edited note",
      code == 200 and len(mine) == 1 and mine[0]["hi"]["fix"] == "घाट पर गति कम रखें" and mine[0]["hi"]["good"] == "गेट चेक किया")
check("what Claude wrote is kept beside the edit", rows("coachai")["co-%s-d-ram" % week]["aiHi"]["fix"] == "ढलान पर धीरे")
check("the driver's copy carries no facts", set(mine[0]) == {"week", "hi", "en", "at"})
S.coach_decide({"id": "u-o", "role": "owner"}, {"id": "co-%s-c-gop" % week, "decision": "skip"})
check("a skipped note never reaches the conductor", S.my_coaching("u-gop")["notes"] == [])
check("one crew member never sees another's", all(n["week"] == week for n in S.my_coaching("u-ram")["notes"]) and S.my_coaching("u-idle")["notes"] == [])
check("phones are not sent the drafts", S.redact_for({"id": "u-ram", "role": "driver"},
      {"store": "coachai", "id": "co-%s-d-ram" % week, "data": rows("coachai")["co-%s-d-ram" % week]}) is None)
check("no phone may write them", not S.may_write("crewmanager", "coachai"))
check("a note missing a line is refused", CO.parse_message({"content": [{"type": "tool_use", "name": "record_note",
      "input": {"hi": {"good": "x", "fix": "", "tip": "y"}, "en": NOTE["en"]}}]}) is None)

print("\n%d failed" % len(fails) if fails else "\nall passed")
raise SystemExit(1 if fails else 0)

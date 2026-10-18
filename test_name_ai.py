"""Claude matching typed redBus names to crew (/ai/names), against a fake API.

The owner's rule (18 Oct 2026): confirmed by itself only when Claude is sure AND the duty log had
that person in that seat on that bus on most of the nights; otherwise a suggestion. A person's
decision is never touched.

Run: python3 test_name_ai.py
"""
import json
import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="gs-nameai-")
os.environ["DB_PATH"] = os.path.join(_tmp, "test.db")
os.environ.pop("TURSO_URL", None)
os.environ.pop("TURSO_DATABASE_URL", None)

import crew_trace as CT  # noqa: E402
import name_ai as NA  # noqa: E402
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
put("buses", {"id": "b1", "regNo": "MP44ZF2538"})
put("buses", {"id": "b2", "regNo": "RJ09PA6141"})
for d in ({"id": "d-kesar", "name": "Kesar Singh"}, {"id": "d-jitendra", "name": "Jitendra Kumar"},
          {"id": "d-ram", "name": "Ramesh"}, {"id": "c-gopal", "name": "Gopal", "crewRole": "conductor"},
          {"id": "d-old", "name": "Kesar Lal", "status": "left"}):
    put("drivers", d)
# Duty log: Kesar on b1 all along; Jitendra on b2 only from 2 days ago.
put("dutylog", {"id": "dl-k", "at": now - 30 * D, "crewId": "d-kesar", "role": "driver", "busId": "b1"})
put("dutylog", {"id": "dl-j", "at": now - 2 * D, "crewId": "d-jitendra", "role": "driver", "busId": "b2"})
nights = [now - k * D for k in range(1, 6)]
for n, t in enumerate(nights):    # one assignment row per service per day, as redPro's are
    put("rbassign", {"id": "as1-%d" % n, "serviceId": "501", "date": CT.day_key(t),
                     "obs": [{"at": t, "vehicleNo": "MP44ZF2538", "driver1": "Kesar Dvr", "driver2": "Staff", "cro": ""}]})
    put("rbassign", {"id": "as2-%d" % n, "serviceId": "502", "date": CT.day_key(t),
                     "obs": [{"at": t, "vehicleNo": "RJ09PA6141", "driver1": "Jitu Ji", "driver2": "Ram", "cro": ""}]})


class Fake:
    def __init__(self):
        self.sent = []

    def __call__(self, method, path, payload):
        rows_ = json.loads(payload["messages"][0]["content"].split("\n", 1)[1])
        self.sent += rows_
        items = []
        for r in rows_:
            ids = [c["crewId"] for c in r["candidates"]]
            if r["typed"] == "Kesar Dvr":
                items.append({"i": r["i"], "crewId": "d-kesar", "generic": False, "confidence": "high", "reason": "Kesar, on the bus every night"})
            elif r["typed"] == "Jitu Ji":
                items.append({"i": r["i"], "crewId": "d-jitendra" if "d-jitendra" in ids else None, "generic": False, "confidence": "high", "reason": "Jitu is short for Jitendra"})
            elif r["typed"] == "Staff":
                items.append({"i": r["i"], "crewId": None, "generic": True, "confidence": "high", "reason": "not a name"})
            else:
                items.append({"i": r["i"], "crewId": "d-nobody", "generic": False, "confidence": "high", "reason": "made up"})
        return {"content": [{"type": "tool_use", "name": "record_matches", "input": {"items": items}}]}


fake = Fake()
code, res = S.names_ai_tick(call=fake)
al, ai = rows("rbalias"), rows("rbaliasai")
k = CT.alias_id("Kesar Dvr", "MP44ZF2538")
j = CT.alias_id("Jitu Ji", "RJ09PA6141")
st = CT.alias_id("Staff", "MP44ZF2538")
r = CT.alias_id("Ram", "RJ09PA6141")
check("every typed name was asked once", code == 200 and res["asked"] == 4 and res["pending"] == 0)
check("Claude sees the duty log as evidence", any(c["crewId"] == "d-kesar" and c["onBus"] == "5 of 5"
                                                  for x in fake.sent if x["typed"] == "Kesar Dvr" for c in x["candidates"]))
check("someone who left is not a candidate", all(c["crewId"] != "d-old" for x in fake.sent for c in x["candidates"]))
check("sure + on the bus 5 of 5 nights: confirmed by Claude",
      al[k]["status"] == "crew" and al[k]["crewId"] == "d-kesar" and al[k]["decidedBy"] == "claude" and al[k]["auto"])
check("sure, but the duty log has them only 2 of 5 nights: only a suggestion",
      j not in al and ai[j]["pick"] == "d-jitendra" and ai[j]["onBus"] == 2)
check("\"Staff\" is marked not a name", al[st]["status"] == "generic" and al[st]["crewId"] is None)
check("a crewId Claude invented is thrown away", r not in al and ai[r]["pick"] is None)
code, res = S.names_ai_tick(call=Fake())
check("nothing is asked twice while the evidence is the same", res["asked"] == 0)

# More evidence: Jitendra on b2 for longer, so the name is asked again and now passes the rule.
put("dutylog", {"id": "dl-j0", "at": now - 10 * D, "crewId": "d-jitendra", "role": "driver", "busId": "b2"})
code, res = S.names_ai_tick(call=Fake())
check("new evidence: asked again and confirmed", rows("rbalias")[j]["crewId"] == "d-jitendra" and res["confirmed"] == 1)

# A person's decision is never touched, and a person can undo Claude's.
OWNER = {"id": "u-owner", "role": "owner"}
rec = dict(rows("rbalias")[k], status="unsure", crewId=None)
check("undo: a person can set Claude's match to unmatched",
      S.push([{"store": "rbalias", "id": k, "updatedAt": S.now_ms() + 5, "data": rec}], OWNER)["applied"] == 1)
after = rows("rbalias")[k]
check("…which clears Claude's marks and keeps them in history",
      after["decidedBy"] == "u-owner" and "auto" not in after and after["history"][-1]["decidedBy"] == "claude")
put("rbaliasai", dict(rows("rbaliasai")[k], v=0))           # force a re-ask
S.names_ai_tick(call=Fake())
check("…and Claude never overrides it", rows("rbalias")[k]["status"] == "unsure")

# Phones.
check("a driver's phone gets none of Claude's answers", S.redact_for({"id": "u-d", "role": "driver"},
      {"store": "rbaliasai", "id": j, "data": rows("rbaliasai")[j]}) is None)
check("no phone may write them", not S.may_write("owner", "rbaliasai"))

# The rule itself.
cands = [{"crewId": "a", "onBus": 3}]
check("rule: high + 3/5 nights confirms", NA.decide({"pick": "a", "generic": False, "conf": "high"}, cands, 5) == "crew")
check("rule: medium never confirms", NA.decide({"pick": "a", "generic": False, "conf": "medium"}, cands, 5) is None)
check("rule: one night is not enough", NA.decide({"pick": "a", "generic": False, "conf": "high"}, [{"crewId": "a", "onBus": 1}], 1) is None)

print("\n%d failed" % len(fails) if fails else "\nall passed")
raise SystemExit(1 if fails else 0)

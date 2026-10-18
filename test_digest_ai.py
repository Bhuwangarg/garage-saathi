"""The Monday summary (/ai/digest), against a fake API.

Run: python3 test_digest_ai.py
"""
import json
import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="gs-digest-")
os.environ["DB_PATH"] = os.path.join(_tmp, "test.db")
os.environ.pop("TURSO_URL", None)
os.environ.pop("TURSO_DATABASE_URL", None)

import coach_ai as CO  # noqa: E402
import digest_ai as DG  # noqa: E402
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
week, frm, to = CO.week_of(now)
H = 3600000
put("buses", {"id": "b1", "regNo": "RJ14PB1218"})
put("buses", {"id": "b2", "regNo": "MP44ZD0471"})
put("jobcards", {"id": "j1", "busId": "b1", "problem": "Brakes", "status": "verified", "createdAt": frm + 30 * H,
                 "partsUsed": [{"cost": 4000}], "labourHours": 0})
put("driverreports", {"id": "dr-1", "busId": "b2", "status": "open", "problem": "brake", "at": frm + 40 * H})
put("reportai", {"id": "ra-dr-1", "report": "dr-1", "busId": "b2", "unsafe": True, "title": "Brakes weak"})
put("coachai", {"id": "co-x", "crewId": "d1", "status": "draft", "week": week, "hi": {}, "en": {}})

SUMMARY = {"headline": "₹4,000 on repairs; one bus may be unsafe", "hi_headline": "मरम्मत पर ₹4,000",
           "sections": [{"title": "Money", "lines": ["₹4,000 repairs", ""]}, {"title": "Flags to look at", "lines": ["MP44ZD0471 brakes"]}],
           "actions": ["Check MP44ZD0471 brakes", "Approve 1 coaching note", "a", "b"]}


class Fake:
    def __init__(self):
        self.sent = []

    def __call__(self, method, path, payload):
        self.sent.append(json.loads(payload["messages"][0]["content"].split("\n", 1)[1]))
        return {"content": [{"type": "tool_use", "name": "record_summary", "input": SUMMARY}]}


pushed = []
S.send_push = lambda title, body, url="/", roles=None: pushed.append((title, body, roles)) or 1

code, res = S.digest_tick(call=Fake(), now=to + 3 * H)
check("not before Monday 07:00", res["written"] is False and "07:00" in res["why"])
fake = Fake()
code, res = S.digest_tick(call=fake, now=to + 8 * H)
f = fake.sent[0]
check("written on Monday morning", code == 200 and res["written"] and "dg-" + week in rows("digest"))
check("the figures come from the advisor's tools: last week's repair cost", f["money_last_week"]["repair_cost"]["total"] == 4000
      and f["costliest_buses_last_week"]["rows"][0]["name"] == "RJ14PB1218")
check("open flags: an unsafe bus and a coaching note waiting", f["flags"]["unsafe_bus_reports_open"][0]["bus"] == "MP44ZD0471"
      and f["flags"]["coaching_notes_waiting_approval"] == 1)
check("gate checks: the buses with none", f["gate_checks_last_week"]["no_check_count"] == 2)
d = rows("digest")["dg-" + week]
check("kept: headline, Hindi headline, sections (empty lines dropped), at most 3 actions",
      d["hi"] == "मरम्मत पर ₹4,000" and d["sections"][0]["lines"] == ["₹4,000 repairs"] and len(d["actions"]) == 3)
check("owner and supervisor get a push with the headline", pushed and pushed[0][2] == ("owner", "supervisor") and "₹4,000" in pushed[0][1])
check("written once a week", S.digest_tick(call=Fake(), now=to + 9 * H)[1]["why"] == "already written")
check("the owner's Write now rewrites it", S.digest_tick(force=True, call=Fake(), now=to + 9 * H)[1]["written"])

rec = {"store": "digest", "id": "dg-" + week, "data": d}
check("a supervisor's phone gets it", S.redact_for({"id": "u-s", "role": "supervisor"}, rec) is not None)
check("the crew manager's does not (it carries money)", S.redact_for({"id": "u-c", "role": "crewmanager"}, rec) is None)
check("nor a driver's", S.redact_for({"id": "u-d", "role": "driver"}, rec) is None)
check("no phone may write it", not S.may_write("owner", "digest"))
check("a summary with no sections is refused", DG.parse_message({"content": [{"type": "tool_use", "name": "record_summary",
      "input": dict(SUMMARY, sections=[])}]}) is None)

print("\n%d failed" % len(fails) if fails else "\nall passed")
raise SystemExit(1 if fails else 0)

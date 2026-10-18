"""Driver report -> draft job card (/ai/reports), against a fake API.

Run: python3 test_report_ai.py
"""
import io
import json
import os
import tempfile
import urllib.error

_tmp = tempfile.mkdtemp(prefix="gs-repai-")
os.environ["DB_PATH"] = os.path.join(_tmp, "test.db")
os.environ.pop("TURSO_URL", None)
os.environ.pop("TURSO_DATABASE_URL", None)

import report_ai as RA  # noqa: E402
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
put("buses", {"id": "b1", "regNo": "RJ14PB1218", "model": "Volvo 9600"})
put("jobcards", {"id": "j-old", "busId": "b1", "problem": "Front brake pads replaced", "status": "verified", "createdAt": now - 20 * D})
put("jobcards", {"id": "j-other", "busId": "b2", "problem": "AC gas refill", "status": "verified", "createdAt": now - 5 * D})
put("driverreports", {"id": "dr-1", "busId": "b1", "driverId": "d1", "category": "Brakes", "status": "open",
                      "problem": "brake kam pakad raha hai, ghaat pe gaadi kheench rahi hai", "photo": "", "at": now - 3600000})
put("driverreports", {"id": "dr-2", "busId": "b1", "driverId": "d1", "category": "AC", "status": "open",
                      "problem": "", "photo": "https://pub.r2.dev/ac.jpg", "at": now - 1800000})
put("driverreports", {"id": "dr-done", "busId": "b1", "status": "resolved", "problem": "old", "at": now - 1000})
put("driverreports", {"id": "dr-cancel", "busId": "b1", "status": "cancelled", "problem": "mistake", "at": now - 1000})

DRAFTS = {
    "Brakes": {"title": "Brakes weak on slopes, bus pulls", "hi": "ढलान पर ब्रेक कमज़ोर", "trade": "Brakes", "priority": "high",
               "unsafe": True, "cause": "Likely worn or glazed pads, or low air pressure (a guess)",
               "checks": ["Air pressure", "Pad thickness", "Slack adjusters", "extra"],
               "parts": [{"name": "Brake pad set", "why": "if worn"}], "repeat": True},
    "AC": {"title": "AC not cooling", "hi": "एसी ठंडा नहीं", "trade": "AC", "priority": "medium", "unsafe": False,
           "cause": "Possibly low gas", "checks": ["Gas pressure"], "parts": [], "repeat": False},
}


class Fake:
    def __init__(self, fail_image=False):
        self.sent, self.fail_image = [], fail_image

    def __call__(self, method, path, payload):
        self.sent.append(payload)
        content = payload["messages"][0]["content"]
        if self.fail_image and any(b["type"] == "image" for b in content):
            raise urllib.error.HTTPError("u", 400, "bad", {}, io.BytesIO(b"{}"))
        area = "Brakes" if "Brakes" in content[0]["text"] else "AC"
        return {"content": [{"type": "tool_use", "name": "record_draft", "input": DRAFTS[area]}]}


pushed = []
S.send_push = lambda title, body, url="/", roles=None: pushed.append((body, roles)) or 1
fake = Fake()
code, res = S.report_ai_tick(call=fake)
r = rows("reportai")
check("both open reports drafted", code == 200 and res["drafted"] == 2 and set(r) == {"ra-dr-1", "ra-dr-2"})
check("resolved and cancelled reports are left alone", "ra-dr-done" not in r and "ra-dr-cancel" not in r)
brake_text = next(p["messages"][0]["content"][0]["text"] for p in fake.sent if "Brakes" in p["messages"][0]["content"][0]["text"])
check("Claude gets the bus, the driver's words and this bus's own history",
      "RJ14PB1218 (Volvo 9600)" in brake_text and "ghaat pe" in brake_text and "Front brake pads replaced" in brake_text
      and "AC gas refill" not in brake_text)
check("a photo-only report sends the photo", any(b["type"] == "image" for p in fake.sent for b in p["messages"][0]["content"]))
check("the draft is kept: trade, priority, cause, checks (max 3), parts",
      r["ra-dr-1"]["trade"] == "Brakes" and r["ra-dr-1"]["priority"] == "high" and len(r["ra-dr-1"]["checks"]) == 3
      and r["ra-dr-1"]["parts"][0]["name"] == "Brake pad set" and r["ra-dr-1"]["repeat"])
check("an unsafe bus alerts the owner and supervisor at once", res["unsafe"] == 1 and pushed and "RJ14PB1218" in pushed[0][0]
      and pushed[0][1] == ("owner", "supervisor"))
check("nothing is drafted twice", S.report_ai_tick(call=Fake())[1]["drafted"] == 0)

put("driverreports", {"id": "dr-1", "busId": "b1", "driverId": "d1", "category": "Brakes", "status": "open",
                      "problem": "brake kam pakad raha hai, ab awaaz bhi aa rahi hai", "photo": "", "at": now - 3600000})
check("an edited report is drafted again", S.report_ai_tick(call=Fake())[1]["drafted"] == 1)

put("driverreports", {"id": "dr-3", "busId": "b1", "category": "AC", "status": "open", "problem": "AC band", "photo": "https://x/gone.jpg", "at": now})
f = Fake(fail_image=True)
code, res = S.report_ai_tick(call=f)
check("a photo Claude cannot open: drafted from the words", res["drafted"] == 1 and "ra-dr-3" in rows("reportai"))

check("a mechanic's phone is not sent drafts", S.redact_for({"id": "u-m", "role": "mechanic"},
      {"store": "reportai", "id": "ra-dr-1", "data": rows("reportai")["ra-dr-1"]}) is None)
check("no phone may write them", not S.may_write("owner", "reportai"))
check("a bad trade is refused, not stored", RA.parse_message({"content": [{"type": "tool_use", "name": "record_draft",
      "input": dict(DRAFTS["AC"], trade="Plumbing")}]}) is None)

print("\n%d failed" % len(fails) if fails else "\nall passed")
raise SystemExit(1 if fails else 0)

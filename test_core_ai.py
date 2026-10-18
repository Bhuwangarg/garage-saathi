"""Claude looking at returned old-part photos (/ai/core), against a fake API.

Run: python3 test_core_ai.py
"""
import io
import json
import os
import tempfile
import urllib.error

_tmp = tempfile.mkdtemp(prefix="gs-coreai-")
os.environ["DB_PATH"] = os.path.join(_tmp, "test.db")
os.environ.pop("TURSO_URL", None)
os.environ.pop("TURSO_DATABASE_URL", None)

import core_ai as CA  # noqa: E402
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
R2 = "https://pub.r2.dev/"
put("parts", {"id": "p-pad", "name": "Brake pad set", "category": "Brakes", "code": "BP-220"})
put("parts", {"id": "p-belt", "name": "Fan belt", "category": "Engine"})
put("jobcards", {"id": "j-1", "busId": "b1", "coreReturns": [
    {"id": "cr-1", "partId": "p-pad", "photo": R2 + "pad.jpg", "condition": "worn", "at": now - 3600000, "by": "u-m1"},
    {"id": "cr-2", "partId": "p-belt", "photo": R2 + "belt.jpg", "condition": "worn", "at": now - 1800000, "by": "u-m1"}]})
put("jobcards", {"id": "j-2", "busId": "b2", "coreReturns": [
    {"id": "cr-3", "partId": "p-pad", "photo": R2 + "pad.jpg", "condition": "worn", "at": now - 600000, "by": "u-m2"},
    {"id": "cr-old", "partId": "p-pad", "photo": R2 + "old.jpg", "condition": "worn", "at": now - 90 * 86400000, "by": "u-m2"}]})

ANS = {"pad.jpg": {"what": "Worn brake pads", "matches": "yes", "wear": 85, "verdict": "worn", "partNo": "BP-220", "reason": "friction material worn down", "hi": "घिसा हुआ"},
       "belt.jpg": {"what": "New belt in wrapper", "matches": "no", "wear": 0, "verdict": "looks_new", "partNo": None, "reason": "still in its wrapper", "hi": "पैकेट में नया"}}


class Fake:
    def __init__(self, fail=None):
        self.sent, self.fail = [], fail

    def __call__(self, method, path, payload):
        self.sent.append(payload)
        if self.fail:
            raise urllib.error.HTTPError("u", self.fail, "bad", {}, io.BytesIO(b"{}"))
        url = payload["messages"][0]["content"][1]["source"]["url"]
        return {"content": [{"type": "tool_use", "name": "record_part", "input": ANS[url.rsplit("/", 1)[1]]}]}


fake = Fake()
code, res = S.core_ai_tick(call=fake)
r = rows("coreai")
check("three recent returns looked at", code == 200 and res["checked"] == 3)
check("a 90-day-old return is not sent", "ca-cr-old" not in r)
check("Claude is told which part it should be and what was claimed",
      "Brake pad set; category: Brakes; part no: BP-220" in fake.sent[-1]["messages"][0]["content"][0]["text"]
      or any("Brake pad set" in p["messages"][0]["content"][0]["text"] and "worn out" in p["messages"][0]["content"][0]["text"] for p in fake.sent))
check("a genuinely worn pad is not flagged", r["ca-cr-1"]["flags"] == [] and r["ca-cr-1"]["wear"] == 85 and r["ca-cr-1"]["partNo"] == "BP-220")
check("a new belt in its wrapper, said to be worn out, is flagged three ways",
      r["ca-cr-2"]["flags"] == ["claim_mismatch", "looks_new", "not_this_part"])
check("the same pad photo on another job is flagged as reused", r["ca-cr-3"]["flags"] == ["dup_photo"] and r["ca-cr-3"]["dupOf"] == "cr-1")
check("who returned it is kept with the reading", r["ca-cr-2"]["by"] == "u-m1")
check("flagged returns are counted", res["flagged"] == 2)
check("nothing is looked at twice", S.core_ai_tick(call=Fake())[1]["checked"] == 0)

put("jobcards", {"id": "j-3", "busId": "b3", "coreReturns": [
    {"id": "cr-4", "partId": "p-belt", "photo": R2 + "gone.jpg", "condition": "partial", "at": now - 1000, "by": "u-m1"},
    {"id": "cr-5", "partId": "", "photo": "/uploads/local.jpg", "condition": "worn", "note": "air filter", "at": now - 2000, "by": "u-m1"}]})
code, res = S.core_ai_tick(call=Fake(fail=400))
r = rows("coreai")
check("a broken link is recorded once", r["ca-cr-4"]["error"] == "photo could not be opened" and r["ca-cr-4"]["flags"] == [])
check("a photo Claude cannot reach is recorded, not sent", r["ca-cr-5"]["error"] and "ca-cr-5" in r)
check("…and neither is retried", S.core_ai_tick(call=Fake())[1]["checked"] == 0)

check("a store phone is not sent the readings", S.redact_for({"id": "u-s", "role": "store"},
      {"store": "coreai", "id": "ca-cr-2", "data": rows("coreai")["ca-cr-2"]}) is None)
check("no phone may write them", not S.may_write("owner", "coreai"))
check("rule: unclear never counts as a mismatch", CA.flags({"matches": "unsure", "verdict": "unclear", "wear": 0}, "worn", False) == [])

print("\n%d failed" % len(fails) if fails else "\nall passed")
raise SystemExit(1 if fails else 0)

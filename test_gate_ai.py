"""Claude looking at gate check photos (/ai/gate), against a fake API.

Run: python3 test_gate_ai.py
"""
import io
import json
import os
import tempfile
import urllib.error

_tmp = tempfile.mkdtemp(prefix="gs-gateai-")
os.environ["DB_PATH"] = os.path.join(_tmp, "test.db")
os.environ.pop("TURSO_URL", None)
os.environ.pop("TURSO_DATABASE_URL", None)

import gate_ai as GA  # noqa: E402
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
items = lambda ac, bl, cb: {"ac": {"ok": True, "photo": ac}, "blankets": {"ok": True, "photo": bl}, "cabin": {"ok": True, "photo": cb},
                            "fuel": {"ok": True}}


class Fake:
    def __init__(self, verdicts=None, fail=None):
        self.calls, self.verdicts, self.fail = [], verdicts or {}, fail

    def __call__(self, method, path, payload):
        self.calls.append(payload)
        if self.fail:
            raise urllib.error.HTTPError("u", self.fail, "bad", {}, io.BytesIO(b"{}"))
        content = payload["messages"][0]["content"]
        keys = [b["text"].split()[1].rstrip(":") for b in content if b["type"] == "text"]
        imgs = [b for b in content if b["type"] == "image"]
        assert len(imgs) == len(keys) and payload["tool_choice"] == {"type": "auto"}
        return {"content": [{"type": "tool_use", "name": "record_photos", "input": {"items": [
            {"k": k, "verdict": self.verdicts.get(k, "ok"), "reason": "seen", "hi": "देखा"} for k in keys]}}]}


put("gatechecks", {"id": "gc-1", "status": "released", "startedAt": now - 3600000, "busId": "b1",
                   "items": items(R2 + "a.jpg", R2 + "b.jpg", R2 + "c.jpg")})
put("gatechecks", {"id": "gc-2", "status": "awaiting", "startedAt": now - 1800000, "busId": "b2",
                   "items": items(R2 + "d.jpg", R2 + "d.jpg", "data:image/jpeg;base64,/9j/AAAA")})
put("gatechecks", {"id": "gc-open", "status": "open", "startedAt": now, "busId": "b3", "items": items(R2 + "x.jpg", "", "")})
put("gatechecks", {"id": "gc-old", "status": "released", "startedAt": now - 30 * 86400000, "busId": "b1",
                   "items": items(R2 + "c.jpg", R2 + "o2.jpg", R2 + "o3.jpg")})

fake = Fake({"blankets": "wrong"})
code, res = S.gate_ai_tick(call=fake)
r = rows("gateai")
check("two submitted checks looked at, newest first", code == 200 and res["checked"] == 2 and fake.calls and len(fake.calls) == 2)
check("an open check (still being filled) is left alone", "ga-gc-open" not in r)
check("a month-old check is not sent", "ga-gc-old" not in r)
check("a photo by link is sent as a link, an inline one as an image",
      any(b.get("source", {}).get("type") == "url" for p in fake.calls for b in p["messages"][0]["content"])
      and any(b.get("source", {}).get("type") == "base64" for p in fake.calls for b in p["messages"][0]["content"]))
check("Claude's verdict is kept per photo", r["ga-gc-1"]["items"]["blankets"]["verdict"] == "wrong" and r["ga-gc-1"]["items"]["ac"]["verdict"] == "ok")
check("the same photo for AC and blankets is flagged", r["ga-gc-2"]["dup"].get("blankets") == {"sameAs": "ac"})
check("a photo reused from an earlier check is flagged", r["ga-gc-1"]["dup"].get("cabin", {}).get("sameAsCheck") == "gc-old")
check("flagged checks are counted", res["flagged"] == 2)
code, res = S.gate_ai_tick(call=Fake())
check("nothing is looked at twice", res["checked"] == 0 and res["pending"] == 0)

# A new photo after a hold is looked at again.
put("gatechecks", {"id": "gc-1", "status": "approved", "startedAt": now - 3600000, "busId": "b1",
                   "items": items(R2 + "a.jpg", R2 + "b2.jpg", R2 + "c.jpg")})
code, res = S.gate_ai_tick(call=Fake())
check("a retaken photo is looked at again", res["checked"] == 1 and rows("gateai")["ga-gc-1"]["items"]["blankets"]["verdict"] == "ok")

# A photo Claude cannot open is recorded once, not retried every tick.
put("gatechecks", {"id": "gc-3", "status": "released", "startedAt": now - 600000, "busId": "b4",
                   "items": items(R2 + "gone1.jpg", R2 + "gone2.jpg", R2 + "gone3.jpg")})
code, res = S.gate_ai_tick(call=Fake(fail=400))
check("a broken photo link is recorded once", rows("gateai")["ga-gc-3"]["error"] == "photos could not be opened")
check("…and not retried", S.gate_ai_tick(call=Fake())[1]["checked"] == 0)

# Phones and writes.
check("a driver's phone is not sent the verdicts", S.redact_for({"id": "u-d", "role": "driver"},
      {"store": "gateai", "id": "ga-gc-1", "data": rows("gateai")["ga-gc-1"]}) is None)
check("no phone may write them", not S.may_write("owner", "gateai"))
check("Claude is told never to describe people", "Never identify" in GA.SYSTEM)

print("\n%d failed" % len(fails) if fails else "\nall passed")
raise SystemExit(1 if fails else 0)

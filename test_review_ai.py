"""Claude's reading of whose fault a review is (/ai/reviews), against a fake API.

Run: python3 test_review_ai.py
"""
import json
import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="gs-rvai-")
os.environ["DB_PATH"] = os.path.join(_tmp, "test.db")
os.environ.pop("TURSO_URL", None)
os.environ.pop("TURSO_DATABASE_URL", None)
os.environ["AI_REVIEW_BATCH_MIN"] = "25"

import review_ai as RA  # noqa: E402
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


def reading_for(text):
    t = text.lower()
    if "ac" in t:
        return {"faults": ["bus"], "topics": ["ac"], "safety": False, "severity": 2, "en": "AC not cooling", "hi": "एसी ठंडा नहीं"}
    if "rash" in t:
        return {"faults": ["driver"], "topics": ["driving", "safety"], "safety": True, "severity": 3, "en": "Rash driving", "hi": "तेज़ गाड़ी"}
    return {"faults": [], "topics": [], "safety": False, "severity": 0, "en": "Happy", "hi": "खुश"}


class FakeClaude:
    def __init__(self):
        self.calls, self.batch = [], None

    def answer(self, params):
        sent = json.loads(params["messages"][0]["content"].split("\n", 1)[1])
        return {"content": [{"type": "tool_use", "name": "record_reviews", "input": {"items": [
            dict(reading_for(r["comment"] + " " + " ".join(r["tags"])), i=r["i"]) for r in sent]}}]}

    def __call__(self, method, path, payload):
        self.calls.append((method, path))
        if path == "/messages":
            assert payload["tool_choice"] == {"type": "auto"} and payload["model"] == S.AI_MODEL
            return self.answer(payload)
        if path == "/messages/batches" and method == "POST":
            self.batch = payload["requests"]
            return {"id": "msgbatch_1", "processing_status": "in_progress"}
        if path == "/messages/batches/msgbatch_1":
            return {"processing_status": self.status, "request_counts": {"processing": 1}}
        if path == "/messages/batches/msgbatch_1/results":
            return "\n".join(json.dumps({"custom_id": r["custom_id"], "result": {"type": "succeeded", "message": self.answer(r["params"])}})
                             for r in self.batch)
        raise AssertionError(path)


# A few new reviews: read directly.
put("rbreviews", {"id": "rv-1", "stars": 1, "comment": "AC was not working all night", "tags": [], "boardAt": "2026-10-10 22:00:00"})
put("rbreviews", {"id": "rv-2", "stars": 1, "comment": "driver was rash", "tags": ["Driving"], "boardAt": "2026-10-11 22:00:00"})
put("rbreviews", {"id": "rv-3", "stars": 5, "comment": "", "tags": [], "boardAt": "2026-10-11 22:00:00"})
fake = FakeClaude()
code, res = S.review_ai_tick(call=fake)
r = rows("rbreviewai")
check("new reviews are read directly", code == 200 and res["classified"] == 2 and fake.calls == [("POST", "/messages")])
check("AC is the bus, rash driving the driver", r["ai-rv-1"]["faults"] == ["bus"] and r["ai-rv-2"]["faults"] == ["driver"] and r["ai-rv-2"]["safety"])
check("stars alone are not sent", "ai-rv-3" not in r)
code, res = S.review_ai_tick(call=FakeClaude())
check("nothing is read twice", res["classified"] == 0 and res["pending"] == 0)
put("rbreviews", {"id": "rv-1", "stars": 1, "comment": "driver was rash and braking hard", "tags": [], "boardAt": "2026-10-10 22:00:00"})
code, res = S.review_ai_tick(call=FakeClaude())
check("an edited review is read again", res["classified"] == 1 and "driver" in rows("rbreviewai")["ai-rv-1"]["faults"])

# A backlog goes as one batch, collected later.
for n in range(40):
    put("rbreviews", {"id": "rv-b%d" % n, "stars": 2, "comment": "AC weak" if n % 2 else "rash", "tags": [], "boardAt": "2026-09-01 22:00:00"})
fake = FakeClaude()
code, res = S.review_ai_tick(call=fake)
check("a backlog is sent as a batch", res["batch"]["started"] and res["batch"]["reviews"] == 40
      and len(fake.batch) == 4 and ("POST", "/messages") not in fake.calls)
fake.status = "in_progress"
put("rbreviews", {"id": "rv-new", "stars": 4, "comment": "fine trip", "tags": [], "boardAt": "2026-10-12 22:00:00"})
code, res = S.review_ai_tick(call=fake)
check("while it runs, new reviews are still read directly", res["batch"]["status"] == "in_progress" and res["classified"] == 1)
check("…and the batch's reviews are not sent twice", sum(1 for k in rows("rbreviewai") if k.startswith("ai-rv-b")) == 0)
fake.status = "ended"
code, res = S.review_ai_tick(call=fake)
r = rows("rbreviewai")
check("the finished batch is collected", res["batch"]["collected"] == 40 and r["ai-rv-b1"]["faults"] == ["bus"] and r["ai-rv-b2"]["faults"] == ["driver"])
check("…and nothing is pending", res["pending"] == 0)

# A batch that comes back failed is never sent again by itself.
class Failing(FakeClaude):
    def __call__(self, method, path, payload):
        if path.endswith("/results"):
            self.calls.append((method, path))
            return "\n".join(json.dumps({"custom_id": r["custom_id"], "result": {"type": "errored", "error": {"type": "error",
                              "error": {"type": "invalid_request_error", "message": "bad tool"}}}}) for r in self.batch)
        return FakeClaude.__call__(self, method, path, payload)


for n in range(30):
    put("rbreviews", {"id": "rv-f%d" % n, "stars": 2, "comment": "late %d" % n, "tags": [], "boardAt": "2026-08-01 22:00:00"})
f = Failing()
S.review_ai_tick(call=f)
f.status = "ended"
code, res = S.review_ai_tick(call=f)
check("a failed batch reports Claude's error", res["batch"]["failed"] == 3 and "bad tool" in (res["batch"]["error"] or ""))
check("…and does not send the backlog again", res.get("paused") and sum(1 for m, p in f.calls if p == "/messages/batches") == 1)
code, res = S.review_ai_tick(call=f)
check("…nor on the next call (paused, nothing sent)", res.get("paused") and f.calls[-1][1].endswith("/results"))
code, d = S.review_ai_diag(call=f)
check("the diagnostic shows the error", d["errors"] and "bad tool" in d["errors"][0])
check("retry clears the pause", S.review_ai_retry()[0] == 200 and S.review_ai_tick(call=Failing())[1]["batch"]["started"])

# Who receives what.
driver = {"id": "u-d", "role": "driver"}
owner = {"id": "u-o", "role": "owner"}
red = lambda actor, st, i: S.redact_for(actor, {"store": st, "id": i, "data": rows(st)[i]})
check("a driver's phone is not sent the readings", red(driver, "rbreviewai", "ai-rv-2") is None)
check("the owner's is", red(owner, "rbreviewai", "ai-rv-2") is not None)
check("the batch bookkeeping goes to no phone", red(owner, "aimeta", "rv-batch") is None)
check("no phone may write a reading, owner included", not S.may_write("owner", "rbreviewai") and not S.may_write("owner", "aimeta"))

# The counting rule.
check("bus fault does not count against the driver", not RA.counts_for(["bus"], "driver"))
check("driver fault counts", RA.counts_for(["driver", "bus"], "driver"))
check("staff without saying who counts for both", RA.counts_for(["crew"], "conductor") and RA.counts_for(["crew"], "driver"))
check("a driver fault does not count against the conductor", not RA.counts_for(["driver"], "conductor"))
check("unread or praise counts", RA.counts_for([], "driver"))
check("app.js has the same rule", "function rvCountsFor" in open("app.js").read())

print("\n%d failed" % len(fails) if fails else "\nall passed")
raise SystemExit(1 if fails else 0)

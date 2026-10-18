"""The advisor with read-only tools (/ai), against a fake API and seeded records.

Run: python3 test_advisor_ai.py
"""
import json
import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="gs-adv-")
os.environ["DB_PATH"] = os.path.join(_tmp, "test.db")
os.environ.pop("TURSO_URL", None)
os.environ.pop("TURSO_DATABASE_URL", None)

import advisor_ai as AD  # noqa: E402
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
D = 86400000
ist = lambda ts: CT._ist(ts).strftime("%Y-%m-%d %H:%M:%S")
put("meta", {"id": "garage", "key": "garage", "labourRate": 300})
put("buses", {"id": "b1", "regNo": "RJ14PB1218", "company": "Mahalaxmi", "model": "Volvo 9600"})
put("buses", {"id": "b2", "regNo": "MP44ZD0471", "company": "Mahalaxmi"})
put("drivers", {"id": "d-ram", "name": "Ramlal", "busId": "b1"})
put("drivers", {"id": "d-sym", "name": "Shyam", "busId": "b2"})
put("dutylog", {"id": "dl-1", "at": now - 90 * D, "crewId": "d-ram", "role": "driver", "busId": "b1"})
put("dutylog", {"id": "dl-2", "at": now - 90 * D, "crewId": "d-sym", "role": "driver", "busId": "b2"})
put("jobcards", {"id": "j1", "busId": "b1", "problem": "Brakes", "status": "verified", "createdAt": now - 5 * D,
                 "partsUsed": [{"partId": "p1", "qty": 1, "cost": 2000}], "labourHours": 2, "externalCost": 500})
put("jobcards", {"id": "j2", "busId": "b2", "problem": "AC", "status": "open", "createdAt": now - 9 * D, "partsUsed": [], "labourHours": 1})
put("jobcards", {"id": "j-old", "busId": "b2", "problem": "Old", "status": "verified", "createdAt": now - 200 * D, "externalCost": 99999})
put("rbservices", {"id": "501", "routeIds": ["9001"], "startTime": "21:00"})
put("rbservices", {"id": "502", "routeIds": ["9002"], "startTime": "21:00"})
for n in range(8):
    dep = CT.parse_local(ist(now - (n + 1) * D)[:10] + " 21:00:00")
    for svc, bus, reg, drv, stars, fault in (("501", "b1", "RJ14PB1218", "d-ram", 1, ["driver"]), ("502", "b2", "MP44ZD0471", "d-sym", 2, ["bus"])):
        put("gatechecks", {"id": "gc-%s-%d" % (bus, n), "serviceId": svc, "startedAt": dep - 3600000, "busId": bus, "regNo": reg,
                           "driverId": drv, "status": "released"})
        rid = "rv-%s-%d" % (bus, n)
        put("rbreviews", {"id": rid, "pnr": "9%s%d" % (bus[-1], n), "routeId": "9001" if svc == "501" else "9002", "boardAt": ist(dep + 3600000),
                          "stars": stars, "comment": "secret passenger text 98290", "source": "Jaipur", "dest": "Indore" if svc == "501" else "Ujjain"})
        put("rbreviewai", {"id": "ai-" + rid, "rv": rid, "v": 1, "faults": fault, "topics": ["driving"] if fault == ["driver"] else ["ac"], "en": "summary"})
put("purchases", {"id": "pu1", "supplier": "Jaipur Auto", "amount": 5000, "paymentStatus": "pending", "at": now - D})
put("parts", {"id": "p1", "name": "Brake pad set", "qty": 1, "reorderLevel": 4, "unit": "set", "unitCost": 850})

# The tools, directly.
c = S.db()
ix, ctx = S._crew_review_index(c)
rows = AD.review_rows([json.loads(r[0]) for r in c.execute("SELECT data FROM records WHERE store='rbreviews'").fetchall()], ctx,
                      {i: json.loads(d) for i, d in c.execute("SELECT id, data FROM records WHERE store='rbreviewai'").fetchall()}, "2000-01-01")
stores = {st: S._store_rows(c, st) for st in S._ADV_STORES}
c.close()
R = AD.Records(stores, now, rows)
cost = AD.run_tool(R, "rank", {"metric": "repair_cost_by_bus", "days": 30})
check("repair cost = parts + hours x the garage's rate + outside, as app.js jobCost",
      cost["rows"][0] == {"name": "RJ14PB1218", "cost": 2000 + 2 * 300 + 500} and cost["rows"][1]["cost"] == 300)
check("a 200-day-old job is outside 30 days", all(r["cost"] < 99999 for r in cost["rows"]))
drv = AD.run_tool(R, "rank", {"metric": "review_avg_by_driver", "days": 30})
check("driver ratings count only their own faults: Shyam's bus complaints are not his",
      [r["name"] for r in drv["rows"]] == ["Ramlal"] and drv["rows"][0]["avg"] == 1.0)
faults = AD.run_tool(R, "rank", {"metric": "review_faults", "days": 30})
check("whose fault, fleet-wide", faults["faults"] == {"driver": 8, "bus": 8})
route = AD.run_tool(R, "rank", {"metric": "low_reviews_by_driver", "days": 30, "route": "Indore"})
check("a route filter keeps only that route", [r["name"] for r in route["rows"]] == ["Ramlal"])
lst = AD.run_tool(R, "reviews", {"crew_id": "d-ram", "limit": 3})
check("review listing has no PNR, seat or passenger text", lst["total"] == 8 and "secret" not in json.dumps(lst) and "pnr" not in json.dumps(lst))
put("buses", {"id": "b3", "regNo": "RJ09PA6141"})
check("gate checks: the buses with none are listed", AD.run_tool(AD.Records(dict(stores, buses=dict(stores["buses"], b3={"id": "b3", "regNo": "RJ09PA6141"})), now, rows),
      "rank", {"metric": "gate_checks_by_bus", "days": 7})["buses_with_no_check"] == ["RJ09PA6141"])
R2 = AD.Records(dict(stores, challans={"a": {"rc": "MP44ZD0471", "pendingCount": 2, "pendingFine": 1000, "total": 2, "fetchedAt": 1},
                                       "b": {"rc": "MP44ZD471", "pendingCount": 9, "pendingFine": 90000, "total": 9, "fetchedAt": 5},
                                       "c": {"rc": "RJ 14 PB 1218", "pendingCount": 0, "pendingFine": 0, "total": 0, "fetchedAt": 9}}), now, rows)
check("challans: one snapshot per bus by the app's rule (exact registration wins)", AD.run_tool(R2, "money", {})["challan_fines_pending"] == 1000)
check("bus overview", AD.run_tool(R, "bus_overview", {"bus_id": "b1"})["gate_checks"]["done"] == 8)
check("crew overview", AD.run_tool(R, "crew_overview", {"crew_id": "d-sym"})["reviews"] == {"theirs": 0, "avg": None, "low": 0, "not_theirs": 8, "low_topics": {}})
check("low stock", AD.run_tool(R, "stock", {"low_only": True})["parts"][0]["name"] == "Brake pad set")
check("money", AD.run_tool(R, "money", {"days": 30})["pending_to_suppliers_all_time"] == 5000)
check("find by plate written loosely", AD.run_tool(R, "find", {"kind": "bus", "text": "mp44zd471"})[0]["bus_id"] == "b2")
check("an unknown tool or metric is an error, not a crash", "error" in AD.run_tool(R, "delete_everything", {})
      and "error" in AD.run_tool(R, "rank", {"metric": "nope"}))


# The loop.
class Fake:
    def __init__(self, script):
        self.script, self.seen = list(script), []

    def __call__(self, method, path, payload):
        self.seen.append(payload)
        return self.script.pop(0)


tool_turn = {"content": [{"type": "text", "text": "Let me look."},
                         {"type": "tool_use", "id": "t1", "name": "rank", "input": {"metric": "repair_cost_by_bus", "days": 30}}]}
fake = Fake([tool_turn, {"content": [{"type": "text", "text": "RJ14PB1218 cost most: ₹3,100."}]}])
code, res = S.advise({"id": "u-o", "role": "owner"}, "Which bus cost most this month?", "Mahalaxmi", call=fake)
check("the advisor calls a tool, reads the result and answers", code == 200 and "₹3,100" in res["text"]
      and res["looked"][0]["tool"] == "rank")
sent = fake.seen[1]["messages"][-1]["content"][0]
check("the tool result goes back to Claude", sent["type"] == "tool_result" and "RJ14PB1218" in sent["content"])
check("tools are offered, not forced", fake.seen[0]["tool_choice"] == {"type": "auto"} and fake.seen[0]["model"] == S.AI_MODEL)

ticks = iter([0, 0, 40, 40, 40, 40, 40])
fake = Fake([tool_turn, {"content": [{"type": "text", "text": "From what I have: RJ14PB1218."}]}])
code, res = S.advise({"id": "u-o", "role": "owner"}, "q", "x", call=fake, clock=lambda: next(ticks))
check("past the time budget it is told to answer now", "Answer now" in json.dumps(fake.seen[-1]["messages"][-1]) and "RJ14PB1218" in res["text"])
check("a mechanic cannot use it", S.advise({"id": "u-m", "role": "mechanic"}, "q", "x", call=Fake([]))[0] == 403)
check("only reading tools exist", {t["name"] for t in AD.TOOLS} == {"find", "bus_overview", "crew_overview", "rank", "reviews", "stock", "money"})

print("\n%d failed" % len(fails) if fails else "\nall passed")
raise SystemExit(1 if fails else 0)

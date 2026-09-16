#!/usr/bin/env python3
"""The B-list from the Sep 2026 security audit: staff altering or hiding the
records that hold them accountable. Each case is an attack that must fail, next
to the legitimate flow that must still work.

Drives push() and the handlers against a throwaway SQLite file.

    /usr/bin/python3 test_blist.py
"""
import json, os, sys, tempfile, threading, time, urllib.error, urllib.request

os.environ["DB_PATH"] = tempfile.mktemp(suffix=".db")
os.environ.pop("ENABLE_DEMO_SEED", None)
for k in ("DATABASE_URL", "TURSO_URL", "TURSO_DATABASE_URL"):
    os.environ.pop(k, None)
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import sync_server as S  # noqa: E402

fails = []
OWNER = {"id": "u-own", "role": "owner"}
SUP = {"id": "u-sup", "role": "supervisor"}
STORE = {"id": "u-st", "role": "store"}
MECH = {"id": "u-m1", "role": "mechanic"}
DRV = {"id": "u-d1", "role": "driver"}
DRV2 = {"id": "u-d2", "role": "driver"}
COND = {"id": "u-c1", "role": "conductor"}


def check(name, cond):
    print(("  ok  " if cond else " FAIL ") + name)
    if not cond:
        fails.append(name)


def push(actor, store, rid, data):
    return S.push([{"store": store, "id": rid, "updatedAt": S.now_ms(), "data": dict(data, id=rid)}], actor)


def ok(res):
    return res["applied"] == 1


def stored(store, rid):
    c = S.db()
    row = c.execute("SELECT data FROM records WHERE store=? AND id=?", (store, rid)).fetchone()
    c.close()
    return json.loads(row[0]) if row else None


def moves(part):
    c = S.db()
    rows = [json.loads(r[0]) for r in c.execute("SELECT data FROM records WHERE store='stockmoves'").fetchall()]
    c.close()
    return [m for m in rows if m.get("partId") == part]


def tick():
    time.sleep(0.002)


def main():
    S.bootstrap()

    print("B13 — evidence rows written by others")
    check("store logs a stock count", ok(push(SUP, "audits", "au-1", {"by": "u-sup", "shrinkValue": 500})))
    tick()
    check("store cannot zero a count", not ok(push(STORE, "audits", "au-1", {"by": "u-sup", "shrinkValue": 0})))
    check("store cannot delete a count", not ok(push(STORE, "audits", "au-1", {"_deleted": True})))
    check("store can add a new count", ok(push(STORE, "audits", "au-2", {"shrinkValue": 0})))
    push(SUP, "fuel", "fu-1", {"busId": "b1", "litres": 100, "cost": 9000})
    tick()
    check("store cannot rewrite a fuel fill", not ok(push(STORE, "fuel", "fu-1", {"busId": "b1", "litres": 10, "cost": 900})))
    check("store cannot delete a DEF fill", ok(push(SUP, "def", "def-1", {"litres": 5})) and not ok(push(STORE, "def", "def-1", {"_deleted": True})))
    push(STORE, "purchases", "pur-1", {"amount": 1000, "paymentStatus": "pending"})
    tick()
    check("store cannot change a bill amount", not ok(push(STORE, "purchases", "pur-1", {"amount": 10, "paymentStatus": "pending"})))
    tick()
    check("store can still mark a bill paid",
          ok(push(STORE, "purchases", "pur-1", {"amount": 1000, "paymentStatus": "paid", "paidAt": S.now_ms()})))
    check("the owner can still correct a bill", ok(push(OWNER, "purchases", "pur-1", {"amount": 900, "paymentStatus": "paid"})))
    push(SUP, "drivers", "d-1", {"name": "D1", "userId": "u-d1", "busId": "b1", "status": "active"})
    push(SUP, "drivers", "d-2", {"name": "D2", "userId": "u-d2", "busId": "b2", "status": "active"})
    push(DRV2, "driverreports", "dr-1", {"driverId": "d-2", "busId": "b2", "status": "open", "problem": "brakes"})
    tick()
    check("a mechanic cannot cancel a driver's report", not ok(push(MECH, "driverreports", "dr-1", {"driverId": "d-2", "busId": "b2", "status": "cancelled", "problem": "brakes"})))
    check("another driver cannot delete it", not ok(push(DRV, "driverreports", "dr-1", {"_deleted": True})))
    tick()
    check("the reporter can cancel their open report",
          ok(push(DRV2, "driverreports", "dr-1", {"driverId": "d-2", "busId": "b2", "status": "cancelled", "problem": "brakes", "resolvedAt": S.now_ms()})))

    print("B14/B15 — verified job cards")
    PROOF = {"beforePhotos": ["b.jpg"], "afterPhotos": ["a.jpg"]}
    push(SUP, "jobcards", "j-1", {**PROOF, "status": "verified", "labourHours": 2, "externalCost": 0,
                                  "partsUsed": [{"partId": "p1", "qty": 1, "cost": 100}], "assignees": [{"userId": "u-m1"}]})
    tick()
    check("store cannot raise hours on a verified card", not ok(push(STORE, "jobcards", "j-1", {**PROOF, "status": "verified", "labourHours": 40, "externalCost": 0,
                                                                                               "partsUsed": [{"partId": "p1", "qty": 1, "cost": 100}]})))
    check("a crew mechanic cannot remove parts from it", not ok(push(MECH, "jobcards", "j-1", {**PROOF, "status": "verified", "labourHours": 2, "externalCost": 0,
                                                                                               "partsUsed": [], "assignees": [{"userId": "u-m1"}]})))
    tick()
    check("store can still attach a part to it", ok(push(STORE, "jobcards", "j-1", {**PROOF, "status": "verified", "labourHours": 2, "externalCost": 0,
                                                                                    "partsUsed": [{"partId": "p1", "qty": 1, "cost": 100}, {"partId": "p2", "qty": 1, "cost": 50}]})))
    check("store cannot delete a job card", not ok(push(STORE, "jobcards", "j-1", {**PROOF, "status": "verified", "_deleted": True})))
    tick()
    check("a supervisor still can", ok(push(SUP, "jobcards", "j-1", {**PROOF, "status": "verified", "_deleted": True})))

    print("B16 — trip cash")
    check("a driver starts their own trip", ok(push(DRV, "trips", "t-1", {"driverId": "d-1", "busId": "b1", "allowance": 5000, "status": "active", "expenses": []})))
    check("a driver cannot start one for another driver", not ok(push(DRV, "trips", "t-x", {"driverId": "d-2", "busId": "b2", "allowance": 5000, "status": "active"})))
    tick()
    check("another driver cannot touch it", not ok(push(DRV2, "trips", "t-1", {"driverId": "d-1", "busId": "b1", "allowance": 99, "status": "active", "expenses": []})))
    e1 = {"id": "e1", "cat": "police", "mode": "cash", "amount": 300}
    tick()
    check("the driver adds an expense", ok(push(DRV, "trips", "t-1", {"driverId": "d-1", "busId": "b1", "allowance": 5000, "status": "active", "expenses": [e1]})))
    tick()
    check("the allowance cannot be raised afterwards", not ok(push(DRV, "trips", "t-1", {"driverId": "d-1", "busId": "b1", "allowance": 9000, "status": "active", "expenses": [e1]})))
    tick()
    check("a cash expense cannot be relabelled card", not ok(push(DRV, "trips", "t-1", {"driverId": "d-1", "busId": "b1", "allowance": 5000, "status": "active", "expenses": [dict(e1, mode="card")]})))
    tick()
    check("the driver ends the trip", ok(push(DRV, "trips", "t-1", {"driverId": "d-1", "busId": "b1", "allowance": 5000, "status": "closed", "expenses": [e1], "closedAt": S.now_ms()})))
    tick()
    check("a closed trip cannot be reopened", not ok(push(DRV, "trips", "t-1", {"driverId": "d-1", "busId": "b1", "allowance": 5000, "status": "active", "expenses": [e1]})))
    check("a driver cannot delete a trip", not ok(push(DRV, "trips", "t-1", {"driverId": "d-1", "_deleted": True})))

    print("B17/B18 — attendance")
    check("a mechanic checks in", ok(push(MECH, "attendance", "a-1", {"type": "in", "at": S.now_ms(), "late": True})))
    tick()
    check("they cannot clear their own late check-in", not ok(push(MECH, "attendance", "a-1", {"type": "in", "at": S.now_ms() - 3600000, "late": False})))
    check("they cannot delete it", not ok(push(MECH, "attendance", "a-1", {"_deleted": True})))
    check("a colleague cannot take it over", not ok(push(DRV, "attendance", "a-1", {"type": "in", "at": S.now_ms()})))
    a1 = stored("attendance", "a-1")
    check("the server records when it arrived", bool(a1.get("receivedAt")))
    push(MECH, "attendance", "a-2", {"type": "in", "at": S.now_ms() - 3 * 3600000})
    check("a check-in stated hours before it arrived is marked unverified", stored("attendance", "a-2").get("atUnverified") is True)
    push(MECH, "attendance", "a-3", {"type": "in", "at": S.now_ms() + 86400000})
    check("a future check-in time is replaced by the server's", stored("attendance", "a-3")["at"] <= S.now_ms())
    tick()
    check("a supervisor can still correct attendance", ok(push(SUP, "attendance", "a-1", {"userId": "u-m1", "type": "in", "at": S.now_ms()})))

    print("B19 — stop arrivals")
    arrival = {"routeId": "r1", "busId": "b1", "stopId": "s1", "day": "2026-09-16", "deltaMin": 0}
    check("a driver cannot log another bus's stop", not ok(push(DRV, "triplog", "tl-x", dict(arrival, busId="b2"))))
    check("a driver logs their own bus's stop", ok(push(DRV, "triplog", "tl-1", arrival)))
    check("not twice for the same stop and day", not ok(push(DRV, "triplog", "tl-2", arrival)))
    tick()
    check("and cannot rewrite it", not ok(push(DRV, "triplog", "tl-1", dict(arrival, deltaMin=-5))))

    print("B21-B24 — the stock-move log")
    push(OWNER, "parts", "p9", {"qty": 10})
    tick()
    push(STORE, "parts", "p9", {"qty": None})
    tick()
    push(STORE, "parts", "p9", {"qty": 3})
    check("a count routed through a blank qty is still logged", len([m for m in moves("p9") if not m["justified"]]) == 2)
    push(OWNER, "parts", "p8", {"qty": 10})
    tick()
    S.push([{"store": "ledger", "id": "l-dup", "updatedAt": S.now_ms(), "data": {"id": "l-dup", "partId": "p8", "type": "out", "qty": 1}}], OWNER)
    tick()
    S.push([
        {"store": "ledger", "id": "l-dup", "updatedAt": S.now_ms(), "data": {"id": "l-dup", "partId": "p8", "type": "out", "qty": 7}},
        {"store": "parts", "id": "p8", "updatedAt": S.now_ms() + 1, "data": {"id": "p8", "qty": 3}},
    ], STORE)
    check("a refused ledger row does not justify a stock change", moves("p8") and not moves("p8")[-1]["justified"])
    push(OWNER, "parts", "p7", {"qty": 10})
    tick()
    S.push([
        {"store": "ledger", "id": "l-small", "updatedAt": S.now_ms(), "data": {"id": "l-small", "partId": "p7", "type": "out", "qty": 1}},
        {"store": "parts", "id": "p7", "updatedAt": S.now_ms() + 1, "data": {"id": "p7", "qty": 0}},
    ], STORE)
    check("a one-unit issue does not justify a ten-unit drop", moves("p7") and not moves("p7")[-1]["justified"])
    push(OWNER, "parts", "p6", {"qty": 10})
    tick()
    S.push([
        {"store": "ledger", "id": "l-exact", "updatedAt": S.now_ms(), "data": {"id": "l-exact", "partId": "p6", "type": "out", "qty": 2}},
        {"store": "parts", "id": "p6", "updatedAt": S.now_ms() + 1, "data": {"id": "p6", "qty": 8}},
    ], STORE)
    check("an issue that matches the drop is justified", moves("p6") and moves("p6")[-1]["justified"])
    S.push([
        {"store": "parts", "id": "p6", "updatedAt": S.now_ms() + 2, "data": {"id": "p6", "qty": 4}},
        {"store": "parts", "id": "p6", "updatedAt": S.now_ms() + 3, "data": {"id": "p6", "qty": 3}},
    ], STORE)
    check("two moves of one part in one push are both kept", len(moves("p6")) == 3)

    print("B27 — crew who have left")
    c = S.db()
    salt = "x"
    c.execute("INSERT INTO users(id,name,role,salt,pin_hash) VALUES(?,?,?,?,?)", ("u-d1", "D1", "driver", salt, S.hash_pin(salt, "4821")))
    c.commit(); c.close()
    tok = S.do_login("u-d1", "4821")["token"]
    check("an active driver's session works", S.user_for_token(tok) is not None)
    push(SUP, "drivers", "d-1", {"name": "D1", "userId": "u-d1", "busId": None, "status": "left"})
    check("once marked left, the same session stops working", S.user_for_token(tok) is None)
    check("...and the login is switched off", S.login_disabled("u-d1"))
    push(SUP, "drivers", "d-1", {"name": "D1", "userId": "u-d1", "busId": "b1", "status": "active"})
    check("rehired, the login works again", S.user_for_token(tok) is not None)

    print("B28/B29/B31 — WhatsApp odometer")
    c = S.db()
    rev = c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()[0]
    for rid, data in (("bus-a", {"id": "bus-a", "regNo": "RJ01", "odometer": 100000, "crewPhone": "9000000001"}),
                      ("bus-b", {"id": "bus-b", "regNo": "RJ02", "odometer": 0, "crewPhone": "9000000002"}),
                      ("bus-c", {"id": "bus-c", "regNo": "RJ03", "odometer": 50000, "crewPhone": "9000000003", "odoBroken": True}),
                      ("d-old", {"id": "d-old", "name": "Old", "phone": "9000000001", "status": "left", "busId": None})):
        rev = S._upsert_record(c, "drivers" if rid.startswith("d-") else "buses", rid, data, S.now_ms(), rev)
    c.commit(); c.close()
    S.vision_read_odometer = lambda _img: (100500, "stub")
    r = S.odometer_submit("9000000001", "data:image/jpeg;base64,AA==", source="whatsapp")
    check("a phone that belongs only to crew who left binds no bus", r["status"] == "enrol")
    S.vision_read_odometer = lambda _img: (250000, "stub")
    r = S.odometer_submit("9000000002", "data:image/jpeg;base64,AA==", source="whatsapp")
    check("a first reading from WhatsApp is held for the office", r["status"] == "held" and stored("buses", "bus-b")["odometer"] == 0)
    S.vision_read_odometer = lambda _img: (50100, "stub")
    r = S.odometer_submit("9000000003", "data:image/jpeg;base64,AA==", source="whatsapp")
    check("a bus marked meter-broken takes no reading", r["status"] == "held")
    c = S.db()
    rev = c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()[0]
    S._upsert_record(c, "drivers", "d-new", {"id": "d-new", "name": "New", "phone": "9000000009", "status": "active", "busId": "bus-a"}, S.now_ms(), rev)
    c.commit(); c.close()
    steps = [101500, 103000, 104500]
    got = []
    for km in steps:
        S.vision_read_odometer = (lambda k: (lambda _img: (k, "stub")))(km)
        got.append(S.odometer_submit("9000000009", "data:image/jpeg;base64,AA==", source="whatsapp")["status"])
    check("the active driver's phone is bound through the crew bank", got[0] == "accepted")
    check("repeated photos cannot walk the odometer past a day's limit", "held" in got[1:] and stored("buses", "bus-a")["odometer"] <= 100000 + S.ODO_MAX_DAILY_KM)
    push(SUP, "buses", "bus-a", dict(stored("buses", "bus-a"), routeLabel="edited meanwhile"))
    real_read = S.vision_read_odometer

    def slow_edit(_img):
        push(SUP, "buses", "bus-a", dict(stored("buses", "bus-a"), routeLabel="edited during the read"))
        return (int(stored("buses", "bus-a")["odometer"]) + 10, "stub")
    S.vision_read_odometer = slow_edit
    S.odometer_submit("9000000009", "data:image/jpeg;base64,AA==", source="test")
    check("an edit made during the photo read survives", stored("buses", "bus-a").get("routeLabel") == "edited during the read")
    S.vision_read_odometer = real_read

    print("B32 — far-future payload timestamps")
    push(STORE, "vendors", "v-1", {"name": "x", "updatedAt": 9000000000000})
    check("the stored payload's updatedAt is clamped too", stored("vendors", "v-1")["updatedAt"] <= S.now_ms())

    print("B34 — AI proxy")
    check("a driver may not use the AI proxy", S.ai_allowed({"id": "u-d1", "role": "driver"}) == "forbidden")
    S.AI_DAILY_LIMIT = 2
    check("an owner may, up to the daily limit",
          S.ai_allowed(OWNER) is None and S.ai_allowed(OWNER) is None and S.ai_allowed(OWNER) == "daily AI limit reached")

    print("B35 — photo deletion")
    os.makedirs(S.UPLOADS, exist_ok=True)
    name = "a" * 32 + ".jpg"
    open(os.path.join(S.UPLOADS, name), "wb").write(b"x")
    check("a replaced upload is deleted", S.delete_uploads(["https://host/uploads/" + name]) == 1
          and not os.path.exists(os.path.join(S.UPLOADS, name)))
    check("a path outside the upload names is never touched", S.delete_uploads(["https://host/uploads/../sync_server.py"]) == 0)

    print("\nRESULT: " + ("ALL PASS" if not fails else "%d FAILED -> %s" % (len(fails), fails)))
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()

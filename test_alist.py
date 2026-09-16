#!/usr/bin/env python3
"""The A-list from the Sep 2026 security audit, each as an attack that must fail.

Runs a real server on loopback against a throwaway SQLite file, with the demo
seed OFF — the default a real deployment now gets.

    /usr/bin/python3 test_alist.py
"""
import json, os, sys, tempfile, threading, time, urllib.error, urllib.request

os.environ["DB_PATH"] = tempfile.mktemp(suffix=".db")
os.environ.pop("ENABLE_DEMO_SEED", None)
os.environ.pop("WA_APP_SECRET", None)
os.environ.pop("WA_ALLOW_UNSIGNED", None)
for k in ("DATABASE_URL", "TURSO_URL", "TURSO_DATABASE_URL"):
    os.environ.pop(k, None)
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import sync_server as S  # noqa: E402

PORT = int(os.environ.get("ALIST_PORT", "8837"))
BASE = "http://127.0.0.1:%d" % PORT
fails = []


def check(name, cond):
    print(("  ok  " if cond else " FAIL ") + name)
    if not cond:
        fails.append(name)


def http(path, payload=None, token=None, method=None, headers=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method or ("POST" if data is not None else "GET"))
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            body = r.read()
            try:
                return r.status, json.loads(body or b"{}")
            except Exception:
                return r.status, body
    except urllib.error.HTTPError as e:
        body = e.read()
        try:
            return e.code, json.loads(body or b"{}")
        except Exception:
            return e.code, body


def make_user(uid, name, role, pin):
    """An account as an earlier deployment would have left it."""
    c = S.db()
    salt = "s-" + uid
    c.execute("INSERT INTO users(id,name,role,salt,pin_hash) VALUES(?,?,?,?,?)",
              (uid, name, role, salt, S.hash_pin(salt, pin)))
    rev = c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()[0]
    S._upsert_record(c, "users", uid, {"id": uid, "name": name, "role": role}, S.now_ms(), rev)
    c.commit()
    c.close()


def login(uid, pin):
    st, r = http("/auth/login", {"userId": uid, "pin": pin})
    return st, (r.get("token") if isinstance(r, dict) else None), r


def put(store, rid, data):
    c = S.db()
    rev = c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()[0]
    S._upsert_record(c, store, rid, data, S.now_ms(), rev)
    c.commit()
    c.close()


def pulled(token):
    st, d = http("/pull?since=0", token=token)
    return {(r["store"], r["id"]): r["data"] for r in d.get("records", [])} if st == 200 else {}


def main():
    from http.server import ThreadingHTTPServer
    S.bootstrap()
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), S.Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    time.sleep(0.3)

    print("A1 — published demo logins")
    check("demo accounts are not created when ENABLE_DEMO_SEED is unset",
          S.user_exists("u-sup") is False and S.user_exists("u-owner") is False)
    make_user("u-owner", "Owner (old deploy)", "owner", "1111")      # never rotated
    st, tok, r = login("u-owner", "1111")
    check("the published owner PIN is refused", st == 403 and not tok and r.get("error") == "demo_pin")
    make_user("u-boss", "Real Owner", "owner", "4827")
    st, owner, _ = login("u-boss", "4827")
    check("a real owner PIN still signs in", st == 200 and owner)
    put("users", "u-store", {"id": "u-store", "name": "Store", "role": "store", "_deleted": True})
    S.ENABLE_DEMO_SEED = True
    S.seed_users()
    S.ENABLE_DEMO_SEED = False
    check("a deleted demo account is not re-seeded", S.user_exists("u-store") is False)

    print("A2 — one shared crew PIN")
    make_user("u-cond-old", "Old Conductor", "conductor", "0000")
    st, tok, r = login("u-cond-old", "0000")
    check("the old shared crew PIN is refused", st == 403 and not tok and r.get("error") == "default_pin")
    st, r = http("/auth/register-roster", {"crew": [{"id": "u-drv-new", "name": "New Driver", "role": "driver"}]}, owner)
    pins = r.get("pins") or {}
    check("activation hands back a PIN for the new login and the one still on 0000",
          st == 200 and set(pins) == {"u-drv-new", "u-cond-old"} and r.get("created") == 1 and r.get("reset") == 1)
    check("the PINs are four digits and not the old shared one",
          all(len(p) == 4 and p.isdigit() and p != "0000" for p in pins.values()))
    st, drv, _ = login("u-drv-new", pins.get("u-drv-new", ""))
    check("the new crew member signs in with their own PIN", st == 200 and drv)
    st, cond, _ = login("u-cond-old", pins.get("u-cond-old", ""))
    check("the reset conductor signs in with the new PIN", st == 200 and cond)
    st, _ = http("/auth/setpin", {"pin": "0000"}, drv)
    check("crew cannot set the shared PIN again", st == 400)

    print("A3/A4 — supervisor to owner")
    make_user("u-super", "Supervisor", "supervisor", "5931")
    _, sup, _ = login("u-super", "5931")
    st, _ = http("/auth/setpin", {"userId": "u-boss", "pin": "1357"}, sup)
    check("a supervisor cannot reset the owner's PIN", st == 403)
    st, _, _ = login("u-boss", "1357")
    check("...and cannot sign in as the owner with it", st != 200)
    st, _ = http("/auth/setpin", {"userId": "u-drv-new", "pin": "8642"}, sup)
    check("a supervisor can still reset a driver's PIN", st == 200)
    _, drv, _ = login("u-drv-new", "8642")          # a reset ends the old session
    st, _ = http("/auth/setpin", {"userId": "u-super", "pin": "9753"}, owner)
    check("the owner can reset a supervisor's PIN", st == 200)
    _, sup, _ = login("u-super", "9753")
    st, _ = http("/auth/users", {"name": "Fake Owner", "role": "owner", "pin": "2468"}, sup)
    check("a supervisor cannot create an owner login", st == 403)
    st, _ = http("/auth/users", {"name": "Odd", "role": "superadmin", "pin": "2468"}, owner)
    check("an unknown role is refused", st == 400)
    st, r = http("/auth/users", {"name": "New Store", "role": "store", "pin": "2468"}, owner)
    check("the owner can still create a store login", st == 200 and r.get("user", {}).get("role") == "store")
    st, _ = http("/auth/users", {"name": "New Mech", "role": "mechanic", "pin": "1593"}, sup)
    check("a supervisor can still create a mechanic", st == 200)

    print("A5 — public seed files")
    seed = open(os.path.join(HERE, "seed-data.js")).read()
    docs = open(os.path.join(HERE, "seed-docs.js")).read()
    check("seed-data.js carries no crew PIN map", '"creds"' not in seed)
    check("seed-data.js carries no crew phones", '"crewPhone"' not in seed)
    check("seed-docs.js carries no Drive folder ids", '"docFolders"' not in docs)

    print("A6 — unsigned WhatsApp webhook")
    st, _ = http("/wa/webhook", {"entry": [{"changes": [{"value": {"messages": [
        {"from": "919999999999", "id": "x", "type": "text", "text": {"body": "hi"}}]}}]}]})
    check("a delivery with no app secret configured is refused", st == 503)

    print("A7 — live GPS without a login")
    st, _ = http("/gps?busId=bus-X&reg=RJ14PA0001")
    check("/gps needs a session", st == 401)
    st, _ = http("/gps/latest?reg=RJ14PA0001")
    check("/gps/latest needs a session or the provider token", st == 401)
    st, _ = http("/gps?busId=bus-X&reg=RJ14PA0001", token=drv)
    check("a signed-in user still gets telemetry", st == 200)

    print("A8 — every role downloads everything")
    put("drivers", "d-other", {"id": "d-other", "name": "Other", "userId": "u-someone", "phone": "9000000001",
                               "docs": {"aadhaar": {"number": "111122223333"}}, "salaryMonthly": 15000,
                               "license": "RJ-X", "address": "home"})
    put("drivers", "d-self", {"id": "d-self", "name": "Me", "userId": "u-drv-new", "phone": "9000000002",
                              "docs": {"license": {"number": "RJ-SELF"}}})
    put("buses", "bus-1", {"id": "bus-1", "regNo": "RJ14PA0001", "crewPhone": "9000000003"})
    put("waconv", "9000000003", {"id": "9000000003", "phone": "9000000003"})
    mine = pulled(drv)
    other = mine.get(("drivers", "d-other"), {})
    check("a driver gets a colleague's record without phone, documents, licence, address or pay",
          other and not any(k in other for k in ("phone", "docs", "salaryMonthly", "license", "address"))
          and other.get("_redacted") is True and other.get("name") == "Other")
    check("a driver still gets their own record in full",
          mine.get(("drivers", "d-self"), {}).get("phone") == "9000000002")
    check("a driver gets buses without the crew phone",
          "crewPhone" not in mine.get(("buses", "bus-1"), {"crewPhone": 1}))
    check("a driver gets no WhatsApp conversations", ("waconv", "9000000003") not in mine)
    full = pulled(owner)
    check("the owner still gets everything",
          full.get(("drivers", "d-other"), {}).get("salaryMonthly") == 15000
          and "_redacted" not in full.get(("drivers", "d-other"), {})
          and full.get(("buses", "bus-1"), {}).get("crewPhone") == "9000000003")

    print("A9 — a record written over another by id")
    make_user("u-st", "Storekeeper", "store", "7412")
    _, store, _ = login("u-st", "7412")
    put("ledger", "l-real", {"id": "l-real", "partId": "p1", "type": "out", "qty": 5})
    now = S.now_ms()
    st, r = http("/push", {"records": [{"store": "ledger", "id": "l-fresh", "updatedAt": now,
                                         "data": {"id": "l-real", "partId": "p1", "type": "out", "qty": 0}}]}, store)
    check("an envelope for one id carrying another id's data is refused",
          st == 403 and not S.push is None and r.get("applied") == 0)
    st, r = http("/push", {"records": [{"store": "ledger", "id": "l-null", "updatedAt": now, "data": None}]}, store)
    check("non-object record data is refused", r.get("applied") == 0)
    st, r = http("/push", {"records": [{"store": "attendance", "id": 'a-"><img src=x>', "updatedAt": now,
                                         "data": {"id": 'a-"><img src=x>', "type": "in"}}]}, drv)
    check("an id carrying markup is refused", r.get("applied") == 0)
    st, r = http("/push", {"records": [{"store": "attendance", "id": "a-red", "updatedAt": now,
                                         "data": {"id": "a-red", "_redacted": True}}]}, drv)
    check("a redacted copy cannot be pushed back", r.get("applied") == 0)
    st, r = http("/push", {"records": [{"store": "attendance", "id": "a-noid", "updatedAt": now,
                                         "data": {"type": "in"}}]}, drv)
    check("a record with no id in its data is stored under the envelope id",
          r.get("applied") == 1 and pulled(owner).get(("attendance", "a-noid"), {}).get("id") == "a-noid")

    print("Contact backfill (seed files → server)")
    st, r = http("/admin/backfill-contacts", {"records": [
        {"store": "buses", "id": "bus-1", "data": {"id": "bus-1", "crewPhone": "9111111111"}},
        {"store": "buses", "id": "bus-2", "data": {"id": "bus-2", "regNo": "RJ14PA0002", "crewPhone": "9222222222",
                                                  "docsFolderId": "folder-2", "updatedAt": 1}},
        {"store": "drivers", "id": "d-self", "data": {"id": "d-self", "altPhone": "9333333333", "phone": "9444444444"}},
    ]}, owner)
    after = pulled(owner)
    check("a bus the server lacked is added", r.get("added") == 1 and after.get(("buses", "bus-2"), {}).get("docsFolderId") == "folder-2")
    check("an existing phone is never overwritten", after.get(("buses", "bus-1"), {}).get("crewPhone") == "9000000003")
    check("an empty field is filled", after.get(("drivers", "d-self"), {}).get("altPhone") == "9333333333"
          and after.get(("drivers", "d-self"), {}).get("phone") == "9000000002")
    st, _ = http("/admin/backfill-contacts", {"records": []}, drv)
    check("only owner/supervisor may backfill", st == 403)

    srv.shutdown()
    print("\nRESULT: " + ("ALL PASS" if not fails else "%d FAILED -> %s" % (len(fails), fails)))
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()

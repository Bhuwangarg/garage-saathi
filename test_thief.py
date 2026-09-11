#!/usr/bin/env python3
"""Adversarial test: what can an insider steal by talking to the server directly?

The app enforces its rules in app.js. A thief does not use app.js — they use
curl with a valid login, which every member of staff has. So every rule that
protects money has to hold at /push, or it does not exist.

Each case below is an ATTACK. "blocked" is the pass condition.

    /usr/bin/python3 test_thief.py
"""
import json, os, sys, tempfile, threading, time, urllib.error, urllib.request

os.environ["DB_PATH"] = tempfile.mktemp(suffix=".db")
os.environ["ENABLE_DEMO_SEED"] = "1"
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sync_server as S  # noqa: E402

PORT = int(os.environ.get("THIEF_PORT", "8821"))
BASE = "http://127.0.0.1:%d" % PORT
RESULTS = []


def call(path, payload, token=None, method="POST"):
    req = urllib.request.Request(BASE + path, data=json.dumps(payload).encode(), method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"{}")
        except Exception:
            return e.code, {}


def get(path, token):
    req = urllib.request.Request(BASE + path, method="GET")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read() or b"{}")


def login(uid, pin):
    st, res = call("/auth/login", {"userId": uid, "pin": pin})
    assert st == 200, "login %s failed: %s" % (uid, res)
    return res["token"]


def record(store, rid, token):
    """Read one record back as it now stands on the server."""
    d = get("/pull?since=0", token)
    for r in d.get("records") or []:
        if r.get("store") == store and r.get("id") == rid:
            return r.get("data") or {}
    return None


def attack(name, blocked, detail=""):
    RESULTS.append((name, blocked, detail))
    print("  %-9s %s%s" % ("BLOCKED" if blocked else "STOLEN", name, ("  — " + detail) if detail else ""))


def push(token, store, rid, data, updated=None):
    return call("/push", {"records": [{"store": store, "id": rid,
                                       "data": data,
                                       "updatedAt": updated if updated is not None else S.now_ms()}]}, token)


def main():
    from http.server import HTTPServer
    S.bootstrap()
    srv = HTTPServer(("127.0.0.1", PORT), S.Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    time.sleep(0.4)

    owner = login("u-owner", "1111")
    store = login("u-store", "3333")
    driver = login("u-d1", "0010")

    # The owner sets up an honest world: a job, a part, and the ledger row that
    # records the part leaving stock against that job.
    push(owner, "jobcards", "j-1", {"id": "j-1", "busId": "b1", "problem": "brakes",
                                    "status": "open", "assignedTo": "u-m1",
                                    "beforePhotos": [], "afterPhotos": [],
                                    "labourHours": 2, "partsUsed": []})
    push(owner, "parts", "p-1", {"id": "p-1", "name": "Tyre", "qty": 20, "unitCost": 21500})
    push(owner, "ledger", "l-1", {"id": "l-1", "partId": "p-1", "type": "out", "qty": 2,
                                  "jobId": "j-1", "by": "u-store"})

    print("\nAs the STOREKEEPER — a login every garage gives out:")

    # 1. Sign off your own work. The manual promises the app refuses this.
    st, res = push(store, "jobcards", "j-1", {"id": "j-1", "busId": "b1", "problem": "brakes",
                                              "status": "verified", "verifiedBy": "u-store",
                                              "beforePhotos": [], "afterPhotos": []})
    now = record("jobcards", "j-1", owner) or {}
    attack("verify a job myself", now.get("status") != "verified",
           "status is now %r" % now.get("status"))

    # 2. Close and verify with no photographic proof at all.
    push(owner, "jobcards", "j-2", {"id": "j-2", "busId": "b1", "problem": "clutch",
                                    "status": "open", "beforePhotos": [], "afterPhotos": []})
    push(store, "jobcards", "j-2", {"id": "j-2", "busId": "b1", "problem": "clutch",
                                    "status": "verified", "beforePhotos": [], "afterPhotos": []})
    j2 = record("jobcards", "j-2", owner) or {}
    attack("close a job with no photos", j2.get("status") != "verified",
           "status is now %r" % j2.get("status"))

    # 3. Delete the ledger row that proves the tyres left the store.
    push(store, "ledger", "l-1", {"id": "l-1", "_deleted": True})
    l1 = record("ledger", "l-1", owner) or {}
    attack("erase the ledger entry", not l1.get("_deleted"),
           "_deleted=%r" % l1.get("_deleted"))

    # 4. Take stock off the shelf and quietly correct the book to match, with no
    #    ledger row — so the stock count finds nothing missing.
    #    This one is deliberately ALLOWED: a genuine stock count corrects qty with
    #    no ledger row, and blocking it would break counting. The control is that
    #    it cannot happen QUIETLY.
    push(store, "parts", "p-1", {"id": "p-1", "name": "Tyre", "qty": 10, "unitCost": 21500})
    moves = [r for r in (get("/pull?since=0", owner).get("records") or [])
             if r.get("store") == "stockmoves"]
    mv = (moves[0].get("data") if moves else {}) or {}
    attack("reduce stock unnoticed",
           bool(moves) and mv.get("by") == "u-store" and mv.get("delta") == -10
           and mv.get("justified") is False,
           "logged: %s took %s, justified=%s" % (mv.get("by"), mv.get("delta"), mv.get("justified")))

    # 4b. So erase the evidence of that instead.
    if moves:
        push(store, "stockmoves", moves[0]["id"], {"id": moves[0]["id"], "_deleted": True})
        still = [r for r in (get("/pull?since=0", owner).get("records") or [])
                 if r.get("store") == "stockmoves" and not (r.get("data") or {}).get("_deleted")]
        attack("erase the stock-move log", len(still) == len(moves))

    # 5. Stamp a record from the year 2100 so last-write-wins makes it permanent
    #    and the owner can never correct it.
    far = S.now_ms() + 1000 * 60 * 60 * 24 * 365 * 75
    push(store, "parts", "p-2", {"id": "p-2", "name": "Filter", "qty": 1}, updated=far)
    push(owner, "parts", "p-2", {"id": "p-2", "name": "Filter", "qty": 99})
    p2 = record("parts", "p-2", owner) or {}
    attack("pin a record with a future date", p2.get("qty") == 99,
           "owner's correction %s" % ("stuck" if p2.get("qty") == 99 else "was ignored"))

    # 6. Make it look like the owner signed off.
    push(store, "jobcards", "j-3", {"id": "j-3", "busId": "b1", "problem": "ac",
                                    "status": "done", "verifiedBy": "u-owner"})
    j3 = record("jobcards", "j-3", owner) or {}
    attack("forge who verified it", j3.get("verifiedBy") != "u-owner",
           "verifiedBy=%r" % j3.get("verifiedBy"))

    print("\nAs a DRIVER — the lowest login there is:")

    # 7. Mark a colleague present who never came in.
    push(driver, "attendance", "a-1", {"id": "a-1", "userId": "u-m1", "type": "in",
                                       "at": S.now_ms(), "selfie": "", "lat": 0, "lng": 0})
    a1 = record("attendance", "a-1", owner) or {}
    attack("mark someone else present", a1.get("userId") != "u-m1",
           "userId=%r _by=%r" % (a1.get("userId"), a1.get("_by")))

    # 8. Write a job card at all (the matrix should already stop this).
    push(driver, "jobcards", "j-4", {"id": "j-4", "busId": "b1", "status": "verified"})
    attack("write a job card as a driver", record("jobcards", "j-4", owner) is None)

    # 9. Invent GPS history to cover a night trip.
    push(driver, "gpsevents", "g-1", {"id": "g-1", "reg": "RJ14", "lat": 26.9, "lng": 75.8})
    attack("forge GPS history", record("gpsevents", "g-1", owner) is None)

    # ---- and now the honest paths, because a guard that blocks real work is
    # ---- its own kind of bug.
    print("\nHonest work must still go through:")
    photos = {"beforePhotos": ["b.jpg"], "afterPhotos": ["a.jpg"]}
    d = dict({"id": "j-5", "busId": "b1", "problem": "brakes", "status": "open"}, **photos)
    push(owner, "jobcards", "j-5", d)
    push(owner, "jobcards", "j-5", dict(d, status="done"))
    j5 = record("jobcards", "j-5", owner) or {}
    attack("owner closes a job with photos", j5.get("status") == "done",
           "closedBy=%r" % j5.get("closedBy"))

    sup = login("u-sup", "2222")
    push(sup, "jobcards", "j-5", dict(d, status="verified"))
    j5 = record("jobcards", "j-5", owner) or {}
    attack("a different person verifies it", j5.get("status") == "verified",
           "verifiedBy=%r" % j5.get("verifiedBy"))

    push(owner, "jobcards", "j-6", dict(d, id="j-6", status="done"))
    push(owner, "jobcards", "j-6", dict(d, id="j-6", status="verified"))
    j6 = record("jobcards", "j-6", owner) or {}
    attack("owner cannot verify what the owner closed", j6.get("status") != "verified",
           "status=%r" % j6.get("status"))

    # The real fulfil flow: the storekeeper attaches a part to a job, carrying
    # whatever status the card already has.
    push(owner, "jobcards", "j-7", dict(d, id="j-7", status="open"))
    push(store, "jobcards", "j-7", dict(d, id="j-7", status="open",
                                        partsUsed=[{"partId": "p-1", "qty": 1, "cost": 100}]))
    j7 = record("jobcards", "j-7", owner) or {}
    attack("storekeeper fulfils a part request on an open job",
           len(j7.get("partsUsed") or []) == 1, "partsUsed=%d" % len(j7.get("partsUsed") or []))

    # And on a job already signed off, the sign-off survives untouched.
    push(store, "jobcards", "j-5", dict(d, status="verified",
                                        partsUsed=[{"partId": "p-1", "qty": 1, "cost": 100}]))
    j5 = record("jobcards", "j-5", owner) or {}
    attack("a later write keeps the original sign-off",
           j5.get("verifiedBy") == "u-sup" and len(j5.get("partsUsed") or []) == 1,
           "verifiedBy=%r partsUsed=%d" % (j5.get("verifiedBy"), len(j5.get("partsUsed") or [])))

    st, res = push(store, "ledger", "l-2", {"id": "l-2", "partId": "p-1", "type": "out",
                                            "qty": 1, "jobId": "j-5"})
    attack("storekeeper can still add a ledger row",
           record("ledger", "l-2", owner) is not None)

    print("\nAs a MECHANIC — who may look, not sign off:")
    mech = login("u-m1", "0001")
    push(owner, "jobcards", "j-8", dict(d, id="j-8", status="open"))
    push(mech, "jobcards", "j-8", dict(d, id="j-8", status="done"))
    j8 = record("jobcards", "j-8", owner) or {}
    attack("close a job as the mechanic", j8.get("status") != "done",
           "status=%r" % j8.get("status"))
    push(mech, "jobcards", "j-8", dict(d, id="j-8", status="verified"))
    j8 = record("jobcards", "j-8", owner) or {}
    attack("verify a job as the mechanic", j8.get("status") != "verified",
           "status=%r" % j8.get("status"))

    print("\nRound 2 — the surfaces added on 2026-09-11:")

    # A breakdown is evidence that a bus is failing. Whoever is responsible for
    # maintaining it has the strongest motive to make one disappear.
    push(owner, "breakdowns", "bd-1", {"id": "bd-1", "busId": "b1", "system": "gearbox",
                                       "description": "clutch gave way", "odometer": 480000,
                                       "downtimeHours": 6, "at": S.now_ms()})
    push(store, "breakdowns", "bd-1", {"id": "bd-1", "_deleted": True})
    attack("delete a breakdown as the storekeeper",
           not ((record("breakdowns", "bd-1", owner) or {}).get("_deleted")))
    push(driver, "breakdowns", "bd-2", {"id": "bd-2", "busId": "b1", "system": "engine",
                                        "description": "invented", "at": S.now_ms()})
    attack("write a breakdown as a driver", record("breakdowns", "bd-2", owner) is None)

    # The stock-move log is the control that makes a quiet stock edit visible.
    push(store, "stockmoves", "sm-forged", {"id": "sm-forged", "partId": "p-1",
                                            "was": 10, "now": 10, "delta": 0, "justified": True})
    attack("forge a stock-move row", record("stockmoves", "sm-forged", owner) is None)

    # Provenance is what the pilferage radar reads. If the body can set it, the
    # radar points at whoever the thief chooses.
    push(store, "parts", "p-9", {"id": "p-9", "name": "Belt", "qty": 5,
                                 "_by": "u-owner", "_byRole": "owner"})
    p9 = record("parts", "p-9", owner) or {}
    attack("forge who made the change", p9.get("_by") == "u-store",
           "_by=%r _byRole=%r" % (p9.get("_by"), p9.get("_byRole")))

    # The mechanic's own attendance is their wage record.
    push(mech, "attendance", "a-9", {"id": "a-9", "userId": "u-sup", "type": "in", "at": S.now_ms()})
    a9 = record("attendance", "a-9", owner) or {}
    attack("log attendance as somebody else (mechanic)", a9.get("userId") == "u-m1",
           "userId=%r" % a9.get("userId"))

    # A job already signed off is the record a bill was paid against.
    push(store, "jobcards", "j-5", dict(d, status="open"))
    j5b = record("jobcards", "j-5", owner) or {}
    attack("re-open a verified job to edit it", j5b.get("status") == "verified",
           "status=%r" % j5b.get("status"))

    # Renaming an account is not cosmetic. The name is what the login screen
    # offers and what every record's provenance is read back as, so a thief who
    # can relabel accounts can make their own look like somebody else's.
    st, _ = call("/auth/users/rename", {"id": "u-sup", "name": "Thief"}, store)
    attack("rename an account as the storekeeper", st == 403, "HTTP %s" % st)

    st, _ = call("/auth/users/rename", {"id": "u-owner", "name": "Suresh (Store)"}, sup)
    attack("relabel the owner's account as a supervisor", st == 403, "HTTP %s" % st)

    st, _ = call("/auth/users/rename", {"id": "u-sup", "name": "Anybody"}, None)
    attack("rename an account with no token", st == 401, "HTTP %s" % st)

    stolen = [n for n, ok, _ in RESULTS if not ok]
    print("\n%d of %d attacks BLOCKED." % (len(RESULTS) - len(stolen), len(RESULTS)))
    if stolen:
        print("STOLEN: " + "; ".join(stolen))
    return 1 if stolen else 0


if __name__ == "__main__":
    sys.exit(main())

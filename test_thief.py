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
    push(owner, "jobcards", "j-8", dict(d, id="j-8", status="open", assignedTo="u-m1"))
    push(mech, "jobcards", "j-8", dict(d, id="j-8", status="done", assignedTo="u-m1"))
    j8 = record("jobcards", "j-8", owner) or {}
    attack("close a job as the mechanic", j8.get("status") != "done",
           "status=%r" % j8.get("status"))
    push(mech, "jobcards", "j-8", dict(d, id="j-8", status="verified", assignedTo="u-m1"))
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

    # A gate pass is the garage's word that a unit left the premises, and the
    # serial on it is what the returning unit is checked against.
    #
    # OWNER'S DECISION 3 (outside-repair contract 3.2, 9a): whoever may send a
    # unit out may paper it. The storekeeper and the crew manager write and
    # return a pass now -- the two assertions that said a storekeeper was refused
    # are flipped to say the opposite, on purpose and by name. The other half of
    # this block is unchanged and is the point of the file: a mechanic, a driver,
    # a conductor and the office still cannot write one, so a thief with any of
    # those logins still cannot authorise a part out of the gate or close a slip.
    def mint(role):
        # A throwaway login in this run's tempfile database, with a PIN drawn here
        # rather than written down: no fixture in the tree should hold one.
        pin = S.CREW_DEFAULT_PIN
        while pin == S.CREW_DEFAULT_PIN:        # a crew login refuses the default
            pin = "%04d" % (int.from_bytes(os.urandom(2), "big") % 9000 + 1000)
        u = S.create_user("Thief " + role, role, pin)
        return login(u["id"], pin)
    crewm = mint("crewmanager")
    cond = mint("conductor")
    office = mint("office")

    def pass_body(rid, **kw):
        return dict({"id": rid, "no": "OJ-261109-" + rid[-4:].upper(), "status": "out",
                     "busId": "b1", "vendorName": "Real", "unitName": "Alternator",
                     "unitSerial": "ALT-1"}, **kw)

    push(store, "gatepasses", "gp-st01", pass_body("gp-st01"))
    attack("DECISION 3: the storekeeper may now write a gate pass",
           (record("gatepasses", "gp-st01", owner) or {}).get("status") == "out")
    push(crewm, "gatepasses", "gp-cm01", pass_body("gp-cm01"))
    attack("DECISION 3: the crew manager may now write a gate pass",
           (record("gatepasses", "gp-cm01", owner) or {}).get("status") == "out")

    # The same two may return one -- and the serial the server records is the
    # server's own comparison, not the body's.
    push(store, "gatepasses", "gp-st01", pass_body("gp-st01", status="returned",
                                                   returnSerial="ALT-9", serialMismatch=False))
    g1 = record("gatepasses", "gp-st01", owner) or {}
    attack("DECISION 3: the storekeeper may return a pass; the server derives the mismatch",
           g1.get("status") == "returned" and g1.get("serialMismatch") is True
           and g1.get("returnedBy") == "u-store", "%r" % g1)
    push(crewm, "gatepasses", "gp-cm01", pass_body("gp-cm01", status="returned",
                                                   returnSerial="ALT-1"))
    attack("DECISION 3: the crew manager may return a pass",
           (record("gatepasses", "gp-cm01", owner) or {}).get("status") == "returned")

    for who, tok in (("mechanic", mech), ("driver", driver), ("conductor", cond),
                     ("office", office)):
        rid = "gp-no-" + who
        push(tok, "gatepasses", rid, pass_body(rid))
        attack("write a gate pass as the %s (still refused)" % who,
               record("gatepasses", rid, owner) is None)

    # Closing one out is the same authority as opening it: a pass quietly marked
    # returned is a unit nobody is looking for any more.
    push(sup, "gatepasses", "gp-z", pass_body("gp-z", no="OJ-261109-REAL"))
    for who, tok in (("mechanic", mech), ("driver", driver), ("conductor", cond),
                     ("office", office)):
        push(tok, "gatepasses", "gp-z", pass_body("gp-z", no="OJ-261109-REAL",
                                                  status="returned", returnSerial="ALT-1"))
        gz = record("gatepasses", "gp-z", owner) or {}
        attack("close a gate pass as the %s (still refused)" % who,
               gz.get("status") == "out", "status=%r" % gz.get("status"))

    # And what the new roles still may not do: set the vendor's money on a card.
    push(owner, "jobcards", "j-os", {"id": "j-os", "busId": "b1", "problem": "AC",
                                     "status": "open", "assignedTo": "u-m1",
                                     "beforePhotos": [], "afterPhotos": [],
                                     "partsUsed": []})
    for who, tok in (("storekeeper", store), ("mechanic", mech)):
        push(tok, "jobcards", "j-os", {"id": "j-os", "busId": "b1", "problem": "AC",
                                       "status": "open", "assignedTo": "u-m1",
                                       "beforePhotos": [], "afterPhotos": [],
                                       "partsUsed": [], "outside": True,
                                       "externalVendor": "Ghost", "externalCost": 1})
        jo = record("jobcards", "j-os", owner) or {}
        attack("mark a bus away / set the outside cost as the %s" % who,
               not jo.get("outside") and not jo.get("externalCost"),
               "outside=%r cost=%r" % (jo.get("outside"), jo.get("externalCost")))

    print("\nRound 3 — a mechanic's reach is the cards they are on:")
    mech2 = login("u-m2", "0002")
    # A card that is Vijay's alone.
    push(owner, "jobcards", "j-v", dict(d, id="j-v", status="open", assignedTo="u-m3",
                                        labourHours=2, notes="Vijay's job"))
    push(mech, "jobcards", "j-v", dict(d, id="j-v", status="open", assignedTo="u-m3",
                                       labourHours=40, notes="padded by Mukesh"))
    jv = record("jobcards", "j-v", owner) or {}
    attack("edit another mechanic's job card", jv.get("labourHours") == 2,
           "labourHours=%r" % jv.get("labourHours"))

    # The obvious way round: put yourself on it in the same write.
    push(mech, "jobcards", "j-v", dict(d, id="j-v", status="open", assignedTo="u-m1",
                                       assignees=[{"userId": "u-m1", "task": "x"}],
                                       labourHours=40))
    jv = record("jobcards", "j-v", owner) or {}
    attack("add yourself to a job in order to edit it",
           jv.get("labourHours") == 2 and jv.get("assignedTo") == "u-m3",
           "hours=%r assignedTo=%r" % (jv.get("labourHours"), jv.get("assignedTo")))

    push(mech, "jobcards", "j-new", dict(d, id="j-new", status="open", assignedTo="u-m1"))
    attack("open a job card as a mechanic (something to hang parts on)",
           record("jobcards", "j-new", owner) is None)

    # A shared job: Mukesh on the wiring, Imran on the brakes.
    crew = [{"userId": "u-m1", "task": "Electrical"}, {"userId": "u-m2", "task": "Brakes"}]
    push(owner, "jobcards", "j-c", dict(d, id="j-c", status="open", assignedTo="u-m1",
                                        assignees=crew, labourHours=0))
    # Removing a colleague from the crew is a supervisor's decision.
    push(mech, "jobcards", "j-c", dict(d, id="j-c", status="open", assignedTo="u-m1",
                                       assignees=[{"userId": "u-m1", "task": "Electrical"}]))
    jc = record("jobcards", "j-c", owner) or {}
    attack("drop a colleague from a shared job",
           [a.get("userId") for a in (jc.get("assignees") or [])] == ["u-m1", "u-m2"],
           "crew=%r" % [a.get("userId") for a in (jc.get("assignees") or [])])

    push(mech, "jobcards", "j-c", dict(d, id="j-c", status="open", assignedTo="u-m1",
                                       assignees=crew, _deleted=True))
    jc = record("jobcards", "j-c", owner) or {}
    attack("delete a job card as a mechanic", not jc.get("_deleted"),
           "_deleted=%r" % jc.get("_deleted"))

    # ---- and the honest work, which the guard must not get in the way of ----
    # Imran is on the crew but is NOT assignedTo. If membership were still read
    # from assignedTo, this is the write that would be wrongly refused.
    push(mech2, "jobcards", "j-c", dict(d, id="j-c", status="in-progress", assignedTo="u-m1",
                                        assignees=crew, labourHours=3))
    jc = record("jobcards", "j-c", owner) or {}
    attack("the SECOND mechanic on a shared job can record their work",
           jc.get("labourHours") == 3 and jc.get("status") == "in-progress",
           "hours=%r status=%r" % (jc.get("labourHours"), jc.get("status")))

    # A device on the previous build sends the card without `assignees`. That is
    # a stale client, not an attack: the work is kept and the crew is not lost.
    push(mech2, "jobcards", "j-c", dict(d, id="j-c", status="in-progress", assignedTo="u-m1",
                                        labourHours=4))
    jc = record("jobcards", "j-c", owner) or {}
    attack("an older build's write keeps its work and the crew survives",
           jc.get("labourHours") == 4 and len(jc.get("assignees") or []) == 2,
           "hours=%r crew=%d" % (jc.get("labourHours"), len(jc.get("assignees") or [])))

    # A card from before multi-mechanic jobs has only assignedTo.
    push(owner, "jobcards", "j-old", dict(d, id="j-old", status="open", assignedTo="u-m1",
                                          labourHours=0))
    push(mech, "jobcards", "j-old", dict(d, id="j-old", status="in-progress", assignedTo="u-m1",
                                         labourHours=1))
    jo = record("jobcards", "j-old", owner) or {}
    attack("a mechanic works a pre-crew card that names them",
           jo.get("labourHours") == 1, "hours=%r" % jo.get("labourHours"))

    print("\nRound 4 — nobody signs off their own close (owner's call, 4 Nov 2026):")
    # This round asserted the OPPOSITE until today. From 15 Sep a supervisor's
    # own work signed itself off, on the owner's instruction; he reversed it on
    # 4 Nov after being shown that the same pair of hands had come to hold the
    # parts, the cash reconciliation and the departure record as well. The rule
    # is now one rule for every role, the owner included.

    # Vajid closes and signs off in one write — the way the app used to send it.
    push(sup, "jobcards", "j-s1", dict(d, id="j-s1", status="open"))
    push(sup, "jobcards", "j-s1", dict(d, id="j-s1", status="verified", closedBy="u-sup"))
    js1 = record("jobcards", "j-s1", owner) or {}
    attack("a supervisor closes and signs off their own job in one step",
           js1.get("status") != "verified",
           "status=%r verifiedBy=%r" % (js1.get("status"), js1.get("verifiedBy")))

    # His backlog: a job he closed properly, then tries to verify himself.
    push(sup, "jobcards", "j-s2", dict(d, id="j-s2", status="open"))
    push(sup, "jobcards", "j-s2", dict(d, id="j-s2", status="done"))
    push(sup, "jobcards", "j-s2", dict(d, id="j-s2", status="verified"))
    js2 = record("jobcards", "j-s2", owner) or {}
    attack("a supervisor verifies a job they closed earlier",
           js2.get("status") != "verified", "status=%r" % js2.get("status"))
    # Refused, not mangled: the close stands and still says who did it. A control
    # that loses the work it was protecting is not a control.
    attack("  ...and the close survives the refusal, closer recorded",
           js2.get("status") == "done" and js2.get("closedBy") == "u-sup",
           "status=%r closedBy=%r" % (js2.get("status"), js2.get("closedBy")))

    # And the point of the rule: somebody ELSE can sign the same card off.
    # Without this the round would pass just as well if verifying were broken.
    push(owner, "jobcards", "j-s2", dict(d, id="j-s2", status="verified"))
    js2b = record("jobcards", "j-s2", owner) or {}
    attack("  ...and the owner CAN sign off what the supervisor closed",
           js2b.get("status") == "verified" and js2b.get("verifiedBy") == "u-owner",
           "status=%r verifiedBy=%r" % (js2b.get("status"), js2b.get("verifiedBy")))

    # What did NOT go: the evidence. No photos, no sign-off, supervisor or not.
    push(sup, "jobcards", "j-s3", {"id": "j-s3", "busId": "b1", "problem": "x", "status": "open"})
    push(sup, "jobcards", "j-s3", {"id": "j-s3", "busId": "b1", "problem": "x", "status": "verified"})
    js3 = record("jobcards", "j-s3", owner) or {}
    attack("a supervisor signs off a job with no photos", js3.get("status") != "verified",
           "status=%r" % js3.get("status"))

    # The hole the one-step path left open, and the reason a close is now
    # required first: on a straight open -> verified write closedBy was never
    # server-stamped — it fell back to the request body — so a crafted push could
    # name somebody else as the closer and then sign the card itself.
    push(sup, "jobcards", "j-s4", dict(d, id="j-s4", status="open"))
    push(sup, "jobcards", "j-s4", dict(d, id="j-s4", status="verified", closedBy="u-owner"))
    js4 = record("jobcards", "j-s4", owner) or {}
    attack("a supervisor names someone else as closer and signs off in one write",
           js4.get("status") != "verified",
           "status=%r closedBy=%r" % (js4.get("status"), js4.get("closedBy")))

    # The owner was always held to this. Now everybody is.
    push(owner, "jobcards", "j-s5", dict(d, id="j-s5", status="open"))
    push(owner, "jobcards", "j-s5", dict(d, id="j-s5", status="done"))
    push(owner, "jobcards", "j-s5", dict(d, id="j-s5", status="verified"))
    js5 = record("jobcards", "j-s5", owner) or {}
    attack("the owner still cannot sign off what the owner closed",
           js5.get("status") != "verified", "status=%r" % js5.get("status"))

    stolen = [n for n, ok, _ in RESULTS if not ok]
    print("\n%d of %d attacks BLOCKED." % (len(RESULTS) - len(stolen), len(RESULTS)))
    if stolen:
        print("STOLEN: " + "; ".join(stolen))
    return 1 if stolen else 0


if __name__ == "__main__":
    sys.exit(main())

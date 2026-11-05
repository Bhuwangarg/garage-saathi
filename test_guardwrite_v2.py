#!/usr/bin/env python3
"""Every v2 write, replayed against `_guard_write`, with its verdict recorded.

This file exists because of `LIVE-ISSUES.md` issue 8. `confirmLogService`
(`app.js:9376`) writes a job card straight at `status:'verified'` with empty
photo arrays, and the server has refused that card since 10 September, word for
word: "job needs before and after photos (or a vendor bill) to close". The bus's
service DATE lands, because that is a separate record and it is accepted. So for
eight weeks the screen has said "Service logged" while the cost, the hours and
the audit trail never left the device, and the running-cost total for that bus is
short by the amount. Nobody reported it, because the client reports success from
IndexedDB and the refusal arrives later as a context-free toast beside a screen
that has already moved on.

The commit that added the photo rule was right. What it did not do was audit the
client's write paths against the new rule. That is what this file is: contract
§10's table, every row replayed against the real push path, with the verdict
asserted -- so a row that says "allowed" and is actually refused fails the build,
and the next commit that tightens a server rule breaks this file instead of
breaking a screen eight weeks later.

**Three rows are deliberately red** and must STAY red. They are design questions
for the owner, not things to code around:

  * the v1 service-log shape -- a verified card with no photographs;
  * the second signature -- the server still lets a supervisor verify a job the
    same supervisor closed (contract §9(c) is the patch, and it is the owner's);
  * the gate round -- `_guard_gatecheck` lets only a DRIVER create a check, so a
    supervisor-run round (`DECISIONS.md §12`, screen #13) cannot create one at
    all. Contract §10 records this row as merely flagged; it is refused.

The second half of this file covers the field merge, which is the primary fix for
the silent write loss (contract §4.2): for every **F** store, a stale push whose
fields do not collide must APPLY and the stored record must hold both devices'
changes.

    /usr/bin/python3 test_guardwrite_v2.py
"""
import json
import os
import sys
import tempfile

os.environ["DB_PATH"] = tempfile.mktemp(suffix=".db")
for k in ("DATABASE_URL", "TURSO_URL", "TURSO_DATABASE_URL"):
    os.environ.pop(k, None)
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import sync_server as S  # noqa: E402

fails = []


def check(name, cond):
    print(("  ok  " if cond else " FAIL ") + name)
    if not cond:
        fails.append(name)


OWNER = {"id": "u-own", "role": "owner"}
SUP = {"id": "u-sup", "role": "supervisor"}
SUP2 = {"id": "u-sup2", "role": "supervisor"}
STORE = {"id": "u-st", "role": "store"}
MECH = {"id": "u-me", "role": "mechanic"}
DRIVER = {"id": "u-drv", "role": "driver"}
CON = {"id": "u-con", "role": "conductor"}
CREWM = {"id": "u-cm", "role": "crewmanager"}
OFFICE = {"id": "u-of", "role": "office"}

now = S.now_ms()
_t = [now]


def tick():
    _t[0] += 1000
    return _t[0]


def push(actor, store, data, upd=None):
    return S.push([{"store": store, "id": data.get("id") or data.get("key") or data.get("rc"),
                    "data": dict(data), "updatedAt": upd if upd is not None else tick()}], actor)


def verdict(actor, store, data, upd=None):
    """'allowed', or the reason the server gave. One representative push per row."""
    r = push(actor, store, data, upd)
    if r["applied"] == 1 and not r["refused"]:
        return "allowed"
    return r["refused"][0]["reason"] if r["refused"] else "dropped"


def stored(store, rid):
    c = S.db()
    row = c.execute("SELECT data FROM records WHERE store=? AND id=?", (store, rid)).fetchone()
    c.close()
    return json.loads(row[0]) if row else None


# ---------------------------------------------------------------- fixtures
S.db().close()
c = S.db()
rev = c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()[0]
for u in (OWNER, SUP, SUP2, STORE, MECH, DRIVER, CON, CREWM, OFFICE):
    rev = S._upsert_record(c, "users", u["id"],
                           {"id": u["id"], "name": u["id"], "role": u["role"], "updatedAt": now},
                           now, rev)
rev = S._upsert_record(c, "buses", "bus-1",
                       {"id": "bus-1", "regNo": "RJ14 AA 1111", "odometer": 100000,
                        "lastServiceOdo": 90000, "docs": [], "photos": [], "updatedAt": now},
                       now, rev)
rev = S._upsert_record(c, "drivers", "d-1",
                       {"id": "d-1", "name": "Ramlal", "userId": "u-drv", "busId": "bus-1",
                        "driverSlot": 1, "docs": {}, "updatedAt": now}, now, rev)
rev = S._upsert_record(c, "drivers", "d-2",
                       {"id": "d-2", "name": "Shyam", "userId": "u-con", "busId": "bus-1",
                        "docs": {}, "updatedAt": now}, now, rev)
rev = S._upsert_record(c, "parts", "p-1",
                       {"id": "p-1", "name": "Brake pad", "qty": 10, "unitCost": 500,
                        "unit": "set", "updatedAt": now}, now, rev)
c.commit()
c.close()

PHOTOS = {"beforePhotos": ["/uploads/aa.jpg"], "afterPhotos": ["/uploads/bb.jpg"]}
JOB = dict({"id": "j-1", "busId": "bus-1", "status": "open", "problem": "brake noise",
            "assignedTo": "u-me", "labourHours": 0, "partsUsed": [], "partRequests": [],
            "coreReturns": [], "closedBy": None}, **PHOTOS)

print("Contract §10 — every v2 write, with the verdict recorded")

print("\n  Job cards")
check("create a card at step 1 (owner/supervisor/store)  ->  allowed",
      verdict(SUP, "jobcards", JOB) == "allowed")
check("  …and the store login may open one too  ->  allowed",
      verdict(STORE, "jobcards", dict(JOB, id="j-store")) == "allowed")
check("  …and a mechanic may NOT open one  ->  refused",
      verdict(MECH, "jobcards", dict(JOB, id="j-mech")) == "a mechanic cannot open a job card")

# DECISIONS.md §6 claims the mechanic's two taps need no new capability and no
# shape change. Verified against the clause rather than assumed.
check("the mechanic's two taps (startAt, completeAt)  ->  allowed",
      verdict(MECH, "jobcards", dict(JOB, startAt=now, completeAt=now + 60000,
                                     status="in-progress")) == "allowed")
check("  …and they landed on the card",
      (stored("jobcards", "j-1") or {}).get("completeAt") == now + 60000)
check("  …a mechanic not on the card is refused  ->  refused",
      verdict({"id": "u-me2", "role": "mechanic"}, "jobcards",
              dict(JOB, startAt=now)) == "you are not on this job")
check("  …and 'add myself to the crew' is not the way in",
      (stored("jobcards", "j-1") or {}).get("assignedTo") == "u-me")
check("  …a mechanic cannot change who is on the job",
      verdict(MECH, "jobcards", dict(JOB, assignedTo="u-me2", status="in-progress")) == "allowed"
      and (stored("jobcards", "j-1") or {}).get("assignedTo") == "u-me")

check("a supervisor closes a card with photographs  ->  allowed",
      verdict(SUP, "jobcards", dict(JOB, status="done")) == "allowed")
check("  …and closedBy/closedAt are the server's, not the body's",
      (stored("jobcards", "j-1") or {}).get("closedBy") == "u-sup"
      and (stored("jobcards", "j-1") or {}).get("closedAt"))

print("\n  🔴 The row that must stay red: the v1 service-log shape")
# `confirmLogService` writes status:'verified' with empty photo arrays. v2's own
# service log must stop at `done` WITH a photo and must never copy this shape.
SERVICE_V1 = {"id": "j-svc", "busId": "bus-1", "status": "verified", "problem": "Service",
              "labourHours": 3, "externalCost": 0, "beforePhotos": [], "afterPhotos": [],
              "partsUsed": [], "closedBy": None}
check("a verified card with empty photo arrays  ->  REFUSED, as it has been since 10 Sep",
      verdict(SUP, "jobcards", SERVICE_V1)
      == "job needs before and after photos (or a vendor bill) to close")
check("  …and nothing of it was stored", stored("jobcards", "j-svc") is None)
check("v2's shape — stop at `done`, with a photograph  ->  allowed",
      verdict(SUP, "jobcards", dict(SERVICE_V1, id="j-svc2", status="done", **PHOTOS))
      == "allowed")
check("  …and a vendor's bill photo stands in for both  ->  allowed",
      verdict(SUP, "jobcards", dict(SERVICE_V1, id="j-svc3", status="done",
                                    externalVendor="Shree Motors",
                                    beforePhotos=["/uploads/bill.jpg"])) == "allowed")

print("\n  The row contract §10 flagged is now CLOSED, on the server and in v1")
# These four asserted the opposite until main was merged into launch-v2, and they
# were right to: this branch forked before the fix, so when they were written a
# supervisor really could still sign off their own close here. §9(c) was
# outstanding and they pinned that, which is what made the merge visible instead
# of silent -- they are the reason nobody had to notice by hand that the two
# branches disagreed about a production rule.
#
# The owner reversed the 15 September self-sign-off on 4 Nov and both halves
# shipped (b1fb43b, dd26807). So the verdict flips, and the clause greps below
# flip with it. If they ever go back to the old spelling, this branch has
# reverted a deployed fix and these say so.
check("a supervisor may NOT verify a card they closed  ->  refused",
      verdict(SUP, "jobcards", dict(JOB, status="verified")) != "allowed")
check("  …and the card is left closed, with the closer still recorded",
      (stored("jobcards", "j-1") or {}).get("status") == "done"
      and (stored("jobcards", "j-1") or {}).get("closedBy") == "u-sup"
      and not (stored("jobcards", "j-1") or {}).get("verifiedBy"))
check("the server's clause no longer exempts a supervisor",
      'and actor["role"] != "supervisor"'
      not in open(os.path.join(HERE, "sync_server.py"), encoding="utf-8").read())
check("  …and signing off now requires the card to be closed first",
      "a job must be closed before it can be signed off"
      in open(os.path.join(HERE, "sync_server.py"), encoding="utf-8").read())
check("…and v1's client half matches, so it offers no button the server refuses",
      "const selfSignsOff = () => false;"
      in open(os.path.join(HERE, "app.js"), encoding="utf-8").read())
check("an OWNER still may not sign off what the owner closed  ->  refused",
      verdict(OWNER, "jobcards", dict(JOB, id="j-own", status="done")) == "allowed"
      and verdict(OWNER, "jobcards", dict(JOB, id="j-own", status="verified"))
      == "you closed this job — someone else must verify it")
check("and a second supervisor verifying a colleague's close  ->  allowed",
      verdict(SUP2, "jobcards", dict(JOB, id="j-own", status="verified")) == "allowed")

print("\n  Parts, bills and the stock trail")
check("issue a part against a card: a ledger row  ->  allowed",
      verdict(STORE, "ledger", {"id": "lg-1", "partId": "p-1", "qty": 2, "kind": "out",
                                "jobId": "j-1", "at": now}) == "allowed")
check("  …the part's new quantity  ->  allowed",
      verdict(STORE, "parts", {"id": "p-1", "name": "Brake pad", "qty": 8,
                               "unitCost": 500, "unit": "set"}) == "allowed")
check("  …and the line on the card  ->  allowed",
      verdict(STORE, "jobcards", dict(JOB, id="j-store",
                                      partsUsed=[{"partId": "p-1", "qty": 2, "cost": 1000}]))
      == "allowed")
check("  …and the ledger is append-only for everyone  ->  refused",
      verdict(OWNER, "ledger", {"id": "lg-1", "partId": "p-1", "qty": 99, "kind": "out",
                                "jobId": "j-1", "at": now}) == "ledger is append-only")
check("a part request on an unverified card  ->  allowed",
      verdict(SUP, "jobcards", dict(JOB, id="j-store",
                                    partRequests=[{"id": "pr-1", "partId": "p-1", "qty": 1}]))
      == "allowed")
check("an old-part return  ->  allowed",
      verdict(SUP, "jobcards", dict(JOB, id="j-store",
                                    coreReturns=[{"id": "cr-1", "partId": "p-1"}])) == "allowed")
check("receive stock and a supplier bill  ->  allowed",
      verdict(STORE, "purchases", {"id": "pu-1", "vendorId": "v-1", "amount": 5000,
                                   "paymentStatus": "pending",
                                   "lines": [{"partId": "p-1", "qty": 5}]}) == "allowed")
check("  …a vendor record  ->  allowed",
      verdict(STORE, "vendors", {"id": "v-1", "name": "Shree Motors"}) == "allowed")
check("  …marking that bill paid afterwards  ->  allowed",
      verdict(STORE, "purchases", {"id": "pu-1", "vendorId": "v-1", "amount": 5000,
                                   "paymentStatus": "paid", "paidAt": now, "paidBy": "u-st",
                                   "lines": [{"partId": "p-1", "qty": 5}]}) == "allowed")
check("  …but changing its amount afterwards  ->  refused",
      verdict(STORE, "purchases", {"id": "pu-1", "vendorId": "v-1", "amount": 1,
                                   "paymentStatus": "paid",
                                   "lines": [{"partId": "p-1", "qty": 5}]})
      == "a bill cannot be changed after it is entered, only marked paid")
check("a shelf count  ->  allowed",
      verdict(STORE, "audits", {"id": "au-1", "at": now,
                                "lines": [{"partId": "p-1", "counted": 8}]}) == "allowed")
check("  …and append-only for the people it audits  ->  refused",
      verdict(STORE, "audits", {"id": "au-1", "at": now,
                                "lines": [{"partId": "p-1", "counted": 10}]})
      == "audits entries cannot be changed once recorded")

print("\n  The supervisor's trip cash (DECISIONS.md §11)")
# `ux §4.3` says "no new capability and no server change". Confirmed: the driver
# restrictions in _guard_write bind only `actor["role"] == "driver"`.
check("a supervisor records a trip  ->  allowed",
      verdict(SUP, "trips", {"id": "tp-1", "busId": "bus-1", "driverId": "d-1",
                             "allowance": 2000, "status": "active", "expenses": [],
                             "startAt": now}) == "allowed")
check("  …and supervisor is already in WRITE_ROLES, so nothing was widened",
      "supervisor" in S.WRITE_ROLES["trips"])
check("  …a driver still only records their own  ->  refused",
      verdict(DRIVER, "trips", {"id": "tp-2", "busId": "bus-1", "driverId": "d-2",
                                "allowance": 2000, "status": "active", "expenses": [],
                                "startAt": now}) == "a driver can only record their own trips")

print("\n  🔴 The gate round (DECISIONS.md §12, screen #13) — refused, not merely flagged")
# Contract §10 records this row as "allowed, with one thing to check in stage 1",
# on the grounds that WRITE_ROLES["gatechecks"] holds owner/supervisor. It does —
# but _guard_gatecheck only lets a DRIVER create a check, and answers a manager
# with no stored row outright. So the owner having moved the round to the
# supervisor is not something the server permits today.
GATE = {"id": "gc-1", "busId": "bus-1", "regNo": "RJ14 AA 1111", "driverId": "d-1",
        "driverName": "Ramlal", "status": "open", "startedAt": now, "date": "2026-11-04",
        "selfie": "/uploads/selfie.jpg", "items": {}}
check("a SUPERVISOR creating the gate round  ->  REFUSED today",
      verdict(SUP, "gatechecks", GATE) == "a gate check is started by the driver at the bus")
check("  …and so is an owner", verdict(OWNER, "gatechecks", dict(GATE, id="gc-2"))
      == "a gate check is started by the driver at the bus")
check("the driver creating their own  ->  allowed",
      verdict(DRIVER, "gatechecks", GATE) == "allowed")
check("  …and userId is stamped from the token",
      (stored("gatechecks", "gc-1") or {}).get("userId") == "u-drv")
# Every amend has to carry what the server stamped on the create, because
# `userId` is in GATE_FIXED and the guard runs before any merge.
GATE_ON_FILE = dict(GATE, userId="u-drv")
check("  …who did the check, when, and the selfie are frozen  ->  refused",
      verdict(DRIVER, "gatechecks", dict(GATE_ON_FILE, selfie="/uploads/other.jpg"))
      == "who did the check, when and the selfie cannot be changed")
check("  …a driver cannot decide go or hold  ->  refused",
      verdict(DRIVER, "gatechecks", dict(GATE_ON_FILE,
                                         decision={"verdict": "go", "reason": "fine"}))
      == "only the office can approve or hold a bus")
check("  …and a check with no failed item cannot be sent to the office  ->  refused",
      verdict(DRIVER, "gatechecks", dict(GATE_ON_FILE, status="awaiting"))
      == "only a check with a failed item goes to the office")
check("  …nor released unless every item passed  ->  refused",
      verdict(DRIVER, "gatechecks", dict(GATE_ON_FILE, status="released"))
      == "a bus can only be released when every item passed")

print("\n  The duty board")
check("fill a seat: a duty row  ->  allowed",
      verdict(CREWM, "dutylog", {"id": "dl-1", "crewId": "d-1", "role": "driver",
                                 "busId": "bus-1", "at": now, "reason": "assign"}) == "allowed")
check("  …and `by` is the token's", (stored("dutylog", "dl-1") or {}).get("by") == "u-cm")
check("  …nobody edits one, owner included  ->  refused",
      verdict(OWNER, "dutylog", {"id": "dl-1", "crewId": "d-2", "role": "driver",
                                 "busId": "bus-1", "at": now, "reason": "assign"})
      == "the duty log cannot be changed once written")
check("  …and the crew record's bus and seat  ->  allowed",
      verdict(CREWM, "drivers", {"id": "d-1", "name": "Ramlal", "userId": "u-drv",
                                 "busId": "bus-1", "driverSlot": 2, "docs": {}}) == "allowed")
check("tonight's running list  ->  allowed by construction",
      verdict(CREWM, "nightlist", {"id": "nl-2026-11-04", "date": "2026-11-04",
                                   "buses": {"bus-1": {"running": True}}}) == "allowed")

print("\n  People, crew and the desk")
check("a conversation log entry  ->  allowed",
      verdict(OFFICE, "crewnotes", {"id": "cn-1", "crewId": "d-1", "text": "spoke about lates",
                                    "at": now}) == "allowed")
check("  …written once, kept as written  ->  refused",
      verdict(OWNER, "crewnotes", {"id": "cn-1", "crewId": "d-1", "text": "changed my mind",
                                   "at": now}) == "a conversation note cannot be edited once written")
check("confirm a redBus name  ->  allowed",
      verdict(CREWM, "rbalias", {"id": S._alias_id("RAMLAL", "RJ14AA1111"), "name": "RAMLAL",
                                 "regNo": "RJ14AA1111", "role": "driver", "status": "crew",
                                 "crewId": "d-1"}) == "allowed")
check("  …and a person's write clears the AI's reasoning",
      "auto" not in (stored("rbalias", S._alias_id("RAMLAL", "RJ14AA1111")) or {}))
check("  …an id that is not <name,bus> is refused",
      verdict(CREWM, "rbalias", {"id": "al-wrong", "name": "RAMLAL", "regNo": "RJ14AA1111",
                                 "role": "driver", "status": "crew", "crewId": "d-1"})
      == "this name and bus already have their own record")

print("\n  Diesel, AdBlue, a tyre, a check-in, a report, the settings")
check("a fuel fill  ->  allowed",
      verdict(CREWM, "fuel", {"id": "fu-1", "busId": "bus-1", "litres": 200, "at": now,
                              "amount": 18000}) == "allowed")
check("  …append-only for a non-manager  ->  refused",
      verdict(CREWM, "fuel", {"id": "fu-1", "busId": "bus-1", "litres": 150, "at": now,
                              "amount": 18000}) == "fuel entries cannot be changed once recorded")
check("an AdBlue entry  ->  allowed",
      verdict(CREWM, "def", {"id": "df-1", "busId": "bus-1", "litres": 20, "at": now}) == "allowed")
check("fitting a tyre  ->  allowed",
      verdict(STORE, "components", {"id": "cp-1", "partId": "p-1", "state": "in-service",
                                    "busId": "bus-1", "history": []}) == "allowed")
check("check in  ->  allowed",
      verdict(CON, "attendance", {"id": "u-con|2026-11-04", "type": "in", "at": now}) == "allowed")
check("  …userId forced from the token",
      (stored("attendance", "u-con|2026-11-04") or {}).get("userId") == "u-con")
check("  …receivedAt is the server's",
      (stored("attendance", "u-con|2026-11-04") or {}).get("receivedAt"))
check("  …and a non-manager cannot change it afterwards  ->  refused",
      verdict(CON, "attendance", {"id": "u-con|2026-11-04", "type": "in", "at": now - 10})
      == "attendance cannot be changed once recorded")
check("a check-in stated well before it arrived is marked, not refused",
      verdict(DRIVER, "attendance", {"id": "u-drv|2026-11-04", "type": "in",
                                     "at": now - 3600000}) == "allowed"
      and (stored("attendance", "u-drv|2026-11-04") or {}).get("atUnverified") is True)
check("'something is wrong with my bus', from a driver  ->  allowed",
      verdict(DRIVER, "driverreports", {"id": "dr-1", "busId": "bus-1", "problem": "shaking",
                                        "status": "open", "at": now}) == "allowed")
check("  …and from a conductor  ->  allowed",
      verdict(CON, "driverreports", {"id": "dr-2", "busId": "bus-1", "problem": "door",
                                     "status": "open", "at": now}) == "allowed")
check("  …the reporter may cancel it while it is open and unlinked  ->  allowed",
      verdict(DRIVER, "driverreports", {"id": "dr-1", "busId": "bus-1", "problem": "shaking",
                                        "status": "cancelled", "at": now}) == "allowed")
check("garage settings  ->  allowed",
      verdict(SUP, "meta", {"key": "garage", "name": "Garage", "labourRate": 400}) == "allowed")
check("  …and only the `garage` row syncs  ->  refused",
      verdict(OWNER, "meta", {"key": "seeded", "value": True})
      == "only the garage settings are shared")

print("\nAnd the stores no client may push at all, owner included")
for st in ("gpsevents", "gpslive", "challans", "stockmoves", "itslookup", "aimeta", "digest"):
    check("%-11s is refused even to the owner" % st,
          verdict(OWNER, st, {"id": "x-" + st, "rc": "x-" + st})
          == "role may not write this store")

# =====================================================================
# The field merge (contract §4.2, §4.4) — the primary fix for the silent loss.
# =====================================================================
print("\nThe field merge: a stale push that does not collide APPLIES, and keeps both changes")


def two_devices(store, base, a_change, b_change, rid):
    """Device A writes at t+2000; device B, holding the record from before A,
    writes its own change at t+1000. B loses the clock comparison."""
    t = tick()
    push(OWNER, store, dict(base, id=rid), t)
    push(OWNER, store, dict(base, id=rid, **a_change), t + 2000)
    r = push(SUP, store, dict(base, id=rid, **b_change), t + 1000)
    return r, stored(store, rid)


JOBM = dict({"id": "m-job", "busId": "bus-1", "status": "open", "problem": "noise",
             "assignedTo": "u-me", "labourHours": 0, "partsUsed": [], "partRequests": [],
             "coreReturns": [], "busMoves": [], "closedBy": None}, **PHOTOS)
r, rec = two_devices("jobcards", JOBM, {"labourHours": 4},
                     {"partRequests": [{"id": "pr-9", "partId": "p-1", "qty": 1}]}, "m-job")
check("jobcards   the stale write applies instead of vanishing",
      r["applied"] == 1 and not r["refused"])
check("jobcards   the card holds BOTH devices' changes",
      rec.get("labourHours") == 4
      and [x["id"] for x in rec.get("partRequests") or []] == ["pr-9"])
check("jobcards   and the merged copy is re-stamped above the stored row, so its own author pulls it",
      rec.get("updatedAt") >= _t[0])
r, rec = two_devices("jobcards", JOBM, {"beforePhotos": ["/uploads/aa.jpg", "/uploads/cc.jpg"]},
                     {"afterPhotos": ["/uploads/bb.jpg", "/uploads/dd.jpg"]}, "m-job2")
check("jobcards   photo arrays union by URL, both sets kept",
      set(rec.get("beforePhotos") or []) == {"/uploads/aa.jpg", "/uploads/cc.jpg"}
      and set(rec.get("afterPhotos") or []) == {"/uploads/bb.jpg", "/uploads/dd.jpg"})
r, rec = two_devices("jobcards", JOBM, {"coreReturns": [{"id": "cr-a", "partId": "p-1"}]},
                     {"coreReturns": [{"id": "cr-b", "partId": "p-1"}]}, "m-job3")
check("jobcards   coreReturns union by element id, neither dropped",
      {x["id"] for x in rec.get("coreReturns") or []} == {"cr-a", "cr-b"})
BUSM = {"id": "m-bus", "regNo": "RJ14 AA 2222", "odometer": 100000, "odometerAt": now,
        "lastServiceOdo": 90000, "docs": [], "photos": []}
r, rec = two_devices("buses", BUSM, {"odometer": 120000}, {"lastServiceOdo": 95000}, "m-bus")
check("buses      independent odometer fields both land",
      rec.get("odometer") == 120000 and rec.get("lastServiceOdo") == 95000)
print("…and the odometer takes the MAX even when the NEWER write carries the lower reading")
# This is the clock-independence proof. A lower reading is never the newer truth,
# so the rule needs no clock at all — which is the whole of contract §4.0.
t = tick()
push(OWNER, "buses", dict(BUSM, id="m-bus2", odometer=150000), t)
r = push(SUP, "buses", dict(BUSM, id="m-bus2", odometer=120000), t + 5000)
rec = stored("buses", "m-bus2")
check("buses      the newer write wins the comparison",
      r["applied"] == 1)
check("buses      …and the odometer is still the HIGHER reading, not the newer one",
      rec.get("odometer") == 150000)
r, rec = two_devices("buses", BUSM, {"docs": [{"type": "fitness", "number": "F1"}]},
                     {"docs": [{"type": "permit", "number": "P1"}]}, "m-bus3")
check("buses      docs union by (type, number)",
      {(d["type"], d["number"]) for d in rec.get("docs") or []}
      == {("fitness", "F1"), ("permit", "P1")})

print("\nEvery array rule in the table, with BOTH devices holding a different element")
# A union rule only earns its place when each side has something the other has
# not: with one side empty, plain last-write-wins looks identical and dropping
# the rule goes unnoticed. The sweep below is driven off _MERGE_UNION_BY itself,
# so a rule added without a test, or removed without a failure, cannot happen.
_ELEM = {
    ("jobcards", "partRequests"): lambda n: {"id": "pr-" + n, "partId": "p-1", "qty": 1},
    ("jobcards", "coreReturns"): lambda n: {"id": "cr-" + n, "partId": "p-1"},
    ("jobcards", "busMoves"): lambda n: {"at": 1000 + ord(n), "by": "u-" + n},
    ("jobcards", "beforePhotos"): lambda n: "/uploads/before-%s.jpg" % n,
    ("jobcards", "afterPhotos"): lambda n: "/uploads/after-%s.jpg" % n,
    ("audits", "lines"): lambda n: {"partId": "p-" + n, "counted": 1},
    ("fuel", "lines"): lambda n: {"partId": "p-" + n, "qty": 1},
    ("def", "lines"): lambda n: {"partId": "p-" + n, "qty": 1},
    ("purchases", "lines"): lambda n: {"partId": "p-" + n, "qty": 1},
    ("buses", "docs"): lambda n: {"type": "t-" + n, "number": "N-" + n},
    ("buses", "photos"): lambda n: "/uploads/bus-%s.jpg" % n,
    ("routes", "stops"): lambda n: {"id": "s-" + n, "name": n},
    ("components", "history"): lambda n: {"at": 2000 + ord(n), "what": n},
    ("trips", "expenses"): lambda n: {"id": "ex-" + n, "amount": 10},
}
_BASE = {
    "jobcards":   JOBM,
    "audits":     {"id": "x", "at": now, "lines": []},
    "fuel":       {"id": "x", "busId": "bus-1", "litres": 10, "at": now, "lines": []},
    "def":        {"id": "x", "busId": "bus-1", "litres": 10, "at": now, "lines": []},
    "purchases":  {"id": "x", "vendorId": "v-1", "amount": 10, "paymentStatus": "pending", "lines": []},
    "buses":      BUSM,
    "routes":     {"id": "x", "name": "R", "stops": []},
    "components": {"id": "x", "partId": "p-1", "state": "in-service", "history": []},
    "trips":      {"id": "x", "busId": "bus-1", "driverId": "d-1", "allowance": 1,
                   "status": "active", "startAt": now, "expenses": []},
}
# The sweep runs off _ELEM, which is spelled out above, and NOT off the server's
# own table -- iterating the table would make deleting a rule delete its test
# with it, and the first run of this file did exactly that: dropping
# `partRequests` left every assertion green because the loop no longer reached
# it. Both containments are asserted instead, so a rule added without a case and
# a case left without a rule each fail here.
check("every array rule in the server's table has a case below",
      not [(st, f) for st, fs in S._MERGE_UNION_BY.items() for f in fs if (st, f) not in _ELEM])
_absent = [k for k in _ELEM if k[1] not in (S._MERGE_UNION_BY.get(k[0]) or {})]
check("every case below still has its rule in the server's table%s"
      % ("" if not _absent else " -> gone: " + ",".join("%s.%s" % k for k in _absent)), not _absent)
_n = [0]
for _st, _f in sorted(_ELEM):
    _n[0] += 1
    _rid = "u%d-%s" % (_n[0], _st)
    _mk = _ELEM[(_st, _f)]
    _r, _rec = two_devices(_st, dict(_BASE[_st], **{_f: []}),
                           {_f: [_mk("a")]}, {_f: [_mk("b")]}, _rid)
    _got = (_rec.get(_f) or []) if _rec else []
    check("%-11s %-13s keeps both devices' elements (%d)"
          % (_st, _f, len(_got)),
          _r["applied"] == 1 and len(_got) == 2
          and _mk("a") in _got and _mk("b") in _got)



r, rec = two_devices("purchases",
                     {"id": "m-pu", "vendorId": "v-1", "amount": 100,
                      "paymentStatus": "pending", "lines": [{"partId": "p-1", "qty": 1}]},
                     {"lines": [{"partId": "p-1", "qty": 1}, {"partId": "p-2", "qty": 2}]},
                     {"lines": [{"partId": "p-1", "qty": 1}, {"partId": "p-3", "qty": 3}]},
                     "m-pu")
check("purchases  lines union by partId, both devices' lines kept",
      r["applied"] == 1
      and {l["partId"] for l in rec.get("lines") or []} == {"p-1", "p-2", "p-3"})
r, rec = two_devices("routes", {"id": "m-rt", "name": "Jaipur", "stops": []},
                     {"stops": [{"id": "s-1", "name": "A"}]},
                     {"stops": [{"id": "s-2", "name": "B"}]}, "m-rt")
check("routes     stops union by stop id",
      {s["id"] for s in rec.get("stops") or []} == {"s-1", "s-2"})
print("\nA field the stale device never knew about is carried over, not dropped")
# This is `_merge_parts_used`'s rule one level up, and it is the rest of issue 1:
# under whole-record last-write-wins the loser's record took every field the
# winner had written with it.
t = tick()
push(OWNER, "vendors", {"id": "m-v", "name": "Shree", "phone": ""}, t)
push(OWNER, "vendors", {"id": "m-v", "name": "Shree", "phone": "", "gstin": "08AAA"}, t + 2000)
r = push(SUP, "vendors", {"id": "m-v", "name": "Shree", "phone": "9876500000"}, t + 1000)
rec = stored("vendors", "m-v")
check("vendors    the stale write applies", r["applied"] == 1)
check("vendors    its own change landed", rec.get("phone") == "9876500000")
check("vendors    and the field it had never seen is still there", rec.get("gstin") == "08AAA")

print("\nBut a genuine collision on ONE scalar is refused, not resolved by guesswork")
# Contract §4.4 assigns `meta`, `vendors`, `incidents`, `breakdowns` and
# `gatepasses` strategy **F** on the grounds that their fields are independent,
# and for `meta` claims that "two people changing the labour rate and the late
# cutoff stop overwriting each other". That is not decidable here: both devices
# send a value for BOTH settings, and without a base snapshot per outbox key —
# which §4.0 deliberately removed — the server cannot tell which of the two
# someone actually edited. So the honest outcome is the residual **R**: named,
# counted, and re-applied by the client on top of the server's copy (§4.5).
# Reported to the lead as a contract correction; it loses nothing either way,
# because a named refusal the client re-applies keeps both changes and a guess
# would silently overwrite one of them.
# Sent WHOLE by all three, so nothing is carried over and the only difference
# left is the collision itself.
GAR = {"key": "garage", "name": "Mahalaxmi", "labourRate": 400, "lateCutoff": "09:30"}
t = tick()
push(OWNER, "meta", GAR, t)
push(OWNER, "meta", dict(GAR, labourRate=500), t + 2000)
r = push(SUP, "meta", dict(GAR, lateCutoff="10:00"), t + 1000)
check("meta       a same-field collision is named as stale, never merged by guess",
      r["rejected"] == 1 and r["refused"][0]["reason"] == "stale")
check("meta       …and the refusal carries the copy to re-apply on top of",
      (((r["refused"][0].get("server") or {}).get("data") or {}).get("labourRate")) == 500)
check("meta       …and the winner's setting still stands",
      (stored("meta", "garage") or {}).get("labourRate") == 500)

print("\nusage counters never go down, and a retry never inflates them")
# Contract §4.4 says these ADD. They must not: app.js increments a CUMULATIVE
# row on the device (`r.taps++`) and pushes the whole row, so addition would
# re-add the running total on every push. `max` is the rule that holds.
t = tick()
push(DRIVER, "usage", {"id": "u-drv|2026-11-04", "userId": "u-drv", "taps": 10,
                       "screens": {"home": 5}, "acts": {"tap": 10}, "slow": {},
                       "firstAt": now, "lastAt": now}, t)
push(DRIVER, "usage", {"id": "u-drv|2026-11-04", "userId": "u-drv", "taps": 14,
                       "screens": {"home": 7}, "acts": {"tap": 14}, "slow": {},
                       "firstAt": now, "lastAt": now + 100}, t + 2000)
r = push(DRIVER, "usage", {"id": "u-drv|2026-11-04", "userId": "u-drv", "taps": 12,
                           "screens": {"home": 6, "me": 3}, "acts": {"tap": 12}, "slow": {},
                           "firstAt": now - 500, "lastAt": now + 50}, t + 1000)
rec = stored("usage", "u-drv|2026-11-04")
check("usage      a stale usage row applies", r["applied"] == 1)
check("usage      the counter is the larger, never the sum", rec.get("taps") == 14)
check("usage      a screen only one device saw is kept", (rec.get("screens") or {}).get("me") == 3)
check("usage      and the one both saw is the larger", (rec.get("screens") or {}).get("home") == 7)
check("usage      firstAt is the earliest", rec.get("firstAt") == now - 500)
check("usage      lastAt is the latest", rec.get("lastAt") == now + 100)

print("\nAn **R** field is NOT merged — a real collision still reaches the refusal")
t = tick()
push(OWNER, "buses", dict(BUSM, id="m-r", regNo="RJ14 AA 3333"), t)
push(OWNER, "buses", dict(BUSM, id="m-r", regNo="RJ14 AA 4444"), t + 2000)
r = push(SUP, "buses", dict(BUSM, id="m-r", regNo="RJ14 AA 5555"), t + 1000)
check("buses.regNo is refused as stale rather than quietly merged",
      r["rejected"] == 1 and r["refused"][0]["reason"] == "stale")
check("…and the winner's registration still stands",
      (stored("buses", "m-r") or {}).get("regNo") == "RJ14 AA 4444")

print("\nAnd `parts.qty` is deliberately NOT fixed — v2 must not look as though it is")
# Two storekeepers can both decrement it offline and the server cannot tell a
# correction from a second issue. `ledger` is the authority and is append-only;
# `stockmoves.justified=false` is what EXPOSES the loss. `03 §5.5` says those two
# "exist to expose this, not prevent it".
check("parts has no merge rule at all", "parts" not in S._MERGE_STORES)
check("…and neither qty nor a counter rule is written for it",
      "parts" not in S._MERGE_MAX and "parts" not in S._MERGE_UNION_BY)
t = tick()
push(STORE, "parts", {"id": "p-2", "name": "Filter", "qty": 10, "unitCost": 100, "unit": "no"}, t)
push(STORE, "parts", {"id": "p-2", "name": "Filter", "qty": 8, "unitCost": 100, "unit": "no"}, t + 2000)
r = push(OWNER, "parts", {"id": "p-2", "name": "Filter", "qty": 7, "unitCost": 100, "unit": "no"}, t + 1000)
check("a losing decrement is named as stale, not silently dropped",
      r["rejected"] == 1 and r["refused"][0]["reason"] == "stale")
check("…and the count is the winner's, with the other decrement genuinely lost",
      (stored("parts", "p-2") or {}).get("qty") == 8)

print("\nRESULT: " + ("ALL PASS" if not fails else "%d FAILED -> %s" % (len(fails), fails)))
sys.exit(1 if fails else 0)

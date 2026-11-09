#!/usr/bin/env python3
"""The outside-repair write guard, as the server enforces it (contract 6, 4.3, 5, 7).

Not a UI test: every write here is a push with a token's identity, the way a
crafted request arrives. In-process against a tempfile database, no port.

  1. The forbidden role is refused, server-side, on an OPEN card. Today's rule only
     froze these fields on an already-verified card, which is the hole.
  2. The same write carrying the stored values UNCHANGED applies (part issuing on
     an outside card must keep working).
  3. A v2 write that omits outsideLat/outsideLng does not erase them (v1 lives on).
  4. The gate-pass machine, and the serial mismatch the server derives.
  5. A return with no pass clears a piece stuck at sent-out, counted once.
  6. externalCost is the SUM over the card's returned passes.
  7. Every refusal string, against contract 6.3.

    /usr/bin/python3 test_outside_guard.py
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
import v2_outside as O  # noqa: E402

OWNER = {"id": "u-own", "role": "owner"}
SUP = {"id": "u-sup", "role": "supervisor"}
STORE = {"id": "u-st", "role": "store"}
CREWM = {"id": "u-cm", "role": "crewmanager"}
MECH = {"id": "u-me", "role": "mechanic"}

fails = []


def check(name, cond, detail=""):
    print(("  ok  " if cond else " FAIL ") + name + ("" if cond else "  -- " + str(detail)))
    if not cond:
        fails.append(name)


_t = [S.now_ms()]


def tick():
    _t[0] += 1000
    return _t[0]


def push(actor, store, data, upd=None):
    return S.push([{"store": store, "id": data["id"], "data": dict(data),
                    "updatedAt": upd if upd is not None else tick()}], actor)


def reason(r):
    return r["refused"][0]["reason"] if r["refused"] else None


def stored(store, rid):
    c = S.db()
    row = c.execute("SELECT data FROM records WHERE store=? AND id=?", (store, rid)).fetchone()
    c.close()
    return json.loads(row[0]) if row else None


# Contract 6.3, copied here by hand and NOT imported from v2_outside, so a string
# edited in the module is a failure here rather than silence.
C63 = {
    "not_manager": "only an owner or supervisor may mark a bus away or set the outside cost",
    "photos": "at most 4 bill photos on a job card",
    "reason_frozen": "the reason a card closed without a bill cannot be rewritten",
    "no_bus": "a gate pass must name a bus",
    "no_vendor_unit": "a gate pass must name the vendor and the unit",
    "moved": "a gate pass cannot be moved to another bus",
    "already_returned": "this gate pass is already returned",
    "manager_corrects": "a returned gate pass is a manager's to correct",
    "unreturn": "a gate pass cannot be un-returned",
    "no_delete": "a gate pass cannot be deleted",
    "needs_bill": "a job card needs the vendor's bill, or a reason typed in, to close",
    "role": "role may not write this store",
}

CARD = {"id": "j-o1", "busId": "b1", "problem": "AC", "status": "open",
        "assignedTo": "u-me", "beforePhotos": [], "afterPhotos": [], "partsUsed": [],
        "labourHours": 0}
OUTSIDE_WRITE = {"outside": True, "outsideCity": "Jaipur", "externalVendor": "CoolAir",
                 "externalCost": 4000, "billPhotos": ["/uploads/b1.jpg"],
                 "closeNoBillReason": "no bill given"}

print("1. The forbidden role is refused on an OPEN card, with the contract string")
push(OWNER, "jobcards", CARD)
for who, actor in (("mechanic", MECH), ("storekeeper", STORE)):
    for f, v in sorted(OUTSIDE_WRITE.items()):
        r = push(actor, "jobcards", dict(CARD, **{f: v}))
        check("%s setting %s on an open card is refused" % (who, f),
              r["applied"] == 0 and reason(r) == C63["not_manager"], reason(r) or r)
    check("  ...and nothing of it was stored (%s)" % who,
          not any(k in (stored("jobcards", "j-o1") or {}) for k in ("outside", "externalVendor",
                                                                     "externalCost", "billPhotos")))
r = push(SUP, "jobcards", dict(CARD, **OUTSIDE_WRITE))
check("the supervisor can set all six on the same card", r["applied"] == 1, r["refused"])

print("\n2. A storekeeper carrying the stored outside values UNCHANGED applies")
cur = stored("jobcards", "j-o1")
carry = {k: cur[k] for k in cur if not k.startswith("_") and k != "updatedAt"}
carry["partsUsed"] = [{"partId": "p-1", "qty": 1, "reused": False}]
r = push(STORE, "jobcards", carry)
check("part issuing on an outside card still works", r["applied"] == 1, r["refused"])
check("  ...and the part is on the card, the outside fields untouched",
      (stored("jobcards", "j-o1") or {}).get("partsUsed")
      and stored("jobcards", "j-o1")["externalVendor"] == "CoolAir")
r = push(STORE, "jobcards", dict(carry, externalCost=1))
check("  ...but one changed figure in the same write is refused",
      r["applied"] == 0 and reason(r) == C63["not_manager"], reason(r))

print("\n3. A v2 write that omits outsideLat/outsideLng does not erase them")
push(OWNER, "jobcards", dict(CARD, id="j-v1", outside=True, outsideLat=26.91, outsideLng=75.78,
                             outsideCity="Jaipur"))
r = push(SUP, "jobcards", dict(CARD, id="j-v1", outside=True, outsideCity="Jaipur", labourHours=2))
v1 = stored("jobcards", "j-v1") or {}
check("the v2 write applies", r["applied"] == 1, r["refused"])
check("  ...and v1's pin survives it", v1.get("outsideLat") == 26.91 and v1.get("outsideLng") == 75.78,
      (v1.get("outsideLat"), v1.get("outsideLng")))
r = push(STORE, "jobcards", dict(CARD, id="j-v1", outside=True, outsideCity="Jaipur"))
check("  ...and a storekeeper omitting them is not refused for it", r["applied"] == 1, r["refused"])

print("\n   bill photos: cap, and the closing reason")
r = push(SUP, "jobcards", dict(CARD, id="j-ph", billPhotos=["/u/%d.jpg" % i for i in range(5)]))
check("five bill photos refused", r["applied"] == 0 and reason(r) == C63["photos"], reason(r))
r = push(SUP, "jobcards", dict(CARD, id="j-ph", billPhotos=["/u/%d.jpg" % i for i in range(4)]))
check("four applied", r["applied"] == 1, r["refused"])
push(SUP, "jobcards", dict(CARD, id="j-ph", billPhotos=["/u/9.jpg", "/u/8.jpg", "/u/7.jpg"]))
check("  ...two devices' photos union but never past the cap, so the card never wedges",
      len((stored("jobcards", "j-ph") or {}).get("billPhotos") or []) == 4)
push(SUP, "jobcards", dict(CARD, id="j-rs", status="done", externalVendor="V",
                           closeNoBillReason="vendor refused to bill"))
r = push(MECH, "jobcards", dict(CARD, id="j-rs", status="done", externalVendor="V",
                                closeNoBillReason="rewritten"))
check("a closed card's reason cannot be rewritten by a non-manager",
      r["applied"] == 0 and reason(r) == C63["reason_frozen"], reason(r))

print("\n4. The gate-pass machine")
GP = {"id": "gp-1", "no": "OJ-261109-0001", "status": "out", "busId": "b1", "jobId": "j-o1",
      "vendorName": "CoolAir", "unitName": "Compressor", "unitSerial": "ALT-77120"}
r = push(STORE, "gatepasses", GP)
check("a storekeeper issues a pass (decision 3)", r["applied"] == 1, r["refused"])
check("  ...issuedBy is the token's", (stored("gatepasses", "gp-1") or {}).get("issuedBy") == "u-st")
r = push(STORE, "gatepasses", dict(GP, id="gp-x", issuedBy="u-own"))
check("  ...a body naming someone else as issuer is overwritten",
      stored("gatepasses", "gp-x")["issuedBy"] == "u-st")
r = push(STORE, "gatepasses", dict(GP, id="gp-nb", busId=""))
check("no bus refused", reason(r) == C63["no_bus"], reason(r))
r = push(STORE, "gatepasses", dict(GP, id="gp-nv", vendorName=" "))
check("no vendor refused", reason(r) == C63["no_vendor_unit"], reason(r))
r = push(STORE, "gatepasses", dict(GP, id="gp-nu", unitName=""))
check("no unit refused", reason(r) == C63["no_vendor_unit"], reason(r))
r = push(STORE, "gatepasses", dict(GP, id="gp-ne", unitSerial=""))
check("an empty serial is allowed", r["applied"] == 1, r["refused"])
r = push(STORE, "gatepasses", dict(GP, busId="b2"))
check("a frozen identifier changed is refused",
      reason(r) == C63["moved"], reason(r))

RET = dict(GP, status="returned", returnedAt=5000, returnSerial="ALT-99999",
           serialMismatch=False, cost=2500, billPhoto="data:image/jpeg;base64,AA")
r = push(CREWM, "gatepasses", RET)
g = stored("gatepasses", "gp-1") or {}
check("a crew manager returns it", r["applied"] == 1, r["refused"])
check("  ...serialMismatch is DERIVED: the body said false, the record says true",
      g.get("serialMismatch") is True, g.get("serialMismatch"))
check("  ...returnedBy is the token's", g.get("returnedBy") == "u-cm")
r = push(STORE, "gatepasses", dict(RET, returnSerial="alt 77120"))
check("a second, DIFFERENT return is refused",
      r["applied"] == 0 and reason(r) == C63["already_returned"], reason(r))
r = push(STORE, "gatepasses", dict(RET, unitName="Other"))
check("a storekeeper editing a returned pass is refused",
      reason(r) == C63["manager_corrects"], reason(r))
r = push(STORE, "gatepasses", dict(RET))
check("a byte-identical replay is applied", r["applied"] == 1 and not r["refused"], r["refused"])
check("  ...and the record did not move",
      {k: (stored("gatepasses", "gp-1") or {}).get(k) for k in ("returnSerial", "cost", "returnedBy",
                                                               "serialMismatch")}
      == {"returnSerial": "ALT-99999", "cost": 2500, "returnedBy": "u-cm", "serialMismatch": True})
r = push(STORE, "gatepasses", dict(GP))
check("returned -> out is refused", reason(r) == C63["unreturn"], reason(r))
r = push(SUP, "gatepasses", dict(GP))
check("  ...for a supervisor too", reason(r) == C63["unreturn"], reason(r))
r = push(SUP, "gatepasses", dict(RET, returnRemark="corrected", cost=2600))
check("a manager may correct a returned pass", r["applied"] == 1
      and stored("gatepasses", "gp-1")["cost"] == 2600, r["refused"])
r = push(OWNER, "gatepasses", {"id": "gp-1", "_deleted": True})
check("nobody deletes a pass, the owner included", reason(r) == C63["no_delete"], reason(r))
r = push(MECH, "gatepasses", dict(GP, id="gp-m"))
check("a mechanic may not write a pass", reason(r) == C63["role"], reason(r))
# serial table (contract 4.1)
for on, typed, want in (("ALT-77120", "ALT-77120", False), ("ALT-77120", "alt 77120", False),
                        ("ALT-77120", "ALT77120", False), ("ALT-77120", "ALT-77999", True),
                        ("", "ALT-77120", False), ("ALT-77120", "", True)):
    check("norm table: %r typed %r -> mismatch %s" % (on, typed, want),
          (bool(O.norm_serial(on)) and O.norm_serial(typed) != O.norm_serial(on)) is want)

print("\n5. A return with NO pass clears a piece stuck at sent-out, once")
c0 = {"id": "c-a1", "partId": "p-1", "state": "sent-out", "busId": "b1", "refurbCount": 0,
      "history": [{"type": "send-out", "at": 1000, "vendor": "V"}]}
push(OWNER, "components", c0)
ret_entry = {"id": "h-1", "type": "return", "at": 9000, "passId": None, "cost": 1200,
             "billPhoto": "/uploads/x.jpg"}
back = dict(c0, state="in-service", history=[c0["history"][0], ret_entry])
r1 = push(STORE, "components", back)
r2 = push(STORE, "components", back)
cc = stored("components", "c-a1") or {}
check("the piece is in service on its bus", cc.get("state") == "in-service" and cc.get("busId") == "b1")
check("refurbCount is 1 after two identical pushes", cc.get("refurbCount") == 1, cc.get("refurbCount"))
check("  ...with one return entry", len([h for h in cc.get("history", []) if h["type"] == "return"]) == 1,
      cc.get("history"))
check("  ...neither push refused", not r1["refused"] and not r2["refused"], (r1["refused"], r2["refused"]))
# a v1-written entry (no id) joined by (type, at)
push(OWNER, "components", dict(c0, id="c-v1", history=[{"type": "return", "at": 7}], refurbCount=1))
push(STORE, "components", dict(c0, id="c-v1", history=[{"type": "return", "at": 7},
                                                      {"id": "h-9", "type": "return", "at": 8}]))
check("v1's id-less entry is not duplicated and the count agrees",
      (stored("components", "c-v1") or {}).get("refurbCount") == 2
      and len(stored("components", "c-v1")["history"]) == 2)

print("\n6. externalCost is the SUM over the card's returned passes")
push(OWNER, "jobcards", dict(CARD, id="j-sum", outside=True, externalVendor="V",
                             gatePassId="gp-s1", gatePassNo="OJ-1"))
for pid, cost in (("gp-s1", 1000), ("gp-s2", 250)):
    push(STORE, "gatepasses", {"id": pid, "no": "OJ-" + pid, "status": "out", "busId": "b1",
                               "jobId": "j-sum", "vendorName": "V", "unitName": "U"})
push(STORE, "gatepasses", {"id": "gp-s1", "no": "OJ-gp-s1", "status": "returned", "busId": "b1",
                           "jobId": "j-sum", "vendorName": "V", "unitName": "U", "cost": 1000})
# device A writes the card with its own idea of the cost
push(STORE, "jobcards", dict(stored("jobcards", "j-sum"), externalCost=stored("jobcards", "j-sum").get("externalCost")))
push(STORE, "gatepasses", {"id": "gp-s2", "no": "OJ-gp-s2", "status": "returned", "busId": "b1",
                           "jobId": "j-sum", "vendorName": "V", "unitName": "U", "cost": 250})
# device B, holding the card from before A's return, writes it back claiming only ITS pass
r = push(SUP, "jobcards", dict(CARD, id="j-sum", outside=True, externalVendor="V",
                               gatePassId="gp-s1", gatePassNo="OJ-1", externalCost=250))
check("the card write applies", r["applied"] == 1, r["refused"])
check("externalCost is 1250, not the last body's 250", (stored("jobcards", "j-sum") or {}).get("externalCost") == 1250,
      (stored("jobcards", "j-sum") or {}).get("externalCost"))
r = push(SUP, "jobcards", dict(stored("jobcards", "j-sum"), remark="again"))
check("  ...and a replay does not double it", (stored("jobcards", "j-sum") or {}).get("externalCost") == 1250)
check("external_cost_of: none known -> None, not 0", O.external_cost_of([{"status": "returned", "cost": None}]) is None)

print("\n7. The close gate (contract 7)")
base = dict(CARD, id="j-cg", outside=True, externalVendor="V", status="open")
push(OWNER, "jobcards", base)
r = push(SUP, "jobcards", dict(base, status="done"))
check("an outside card with no bill and no reason does not close",
      reason(r) == C63["needs_bill"], reason(r))
r = push(SUP, "jobcards", dict(base, status="done", beforePhotos=["/a.jpg"], afterPhotos=["/b.jpg"]))
check("  ...not even with before and after photos", reason(r) == C63["needs_bill"], reason(r))
GP2 = {"id": "gp-cg", "no": "OJ-cg", "status": "returned", "busId": "b1", "jobId": "j-cg",
       "vendorName": "V", "unitName": "U", "billPhoto": "/uploads/bill.jpg"}
push(STORE, "gatepasses", GP2)
r = push(SUP, "jobcards", dict(base, status="done", gatePassId="gp-cg"))
check("a returned pass of THIS card carrying the bill closes it", r["applied"] == 1, r["refused"])
base2 = dict(CARD, id="j-cg2", outside=True, externalVendor="V", status="open", gatePassId="gp-cg")
push(OWNER, "jobcards", base2)
r = push(SUP, "jobcards", dict(base2, status="done"))
check("  ...but another card cannot borrow that bill", reason(r) == C63["needs_bill"], reason(r))
check("a plain card still needs before AND after",
      reason(push(SUP, "jobcards", dict(CARD, id="j-pl", status="done", beforePhotos=["/a.jpg"])))
      == "job needs before and after photos (or a vendor bill) to close")

print("\n8. The pure functions")
check("merge_history unions by id then (type, at)",
      len(O.merge_history([{"type": "return", "at": 1}, {"id": "a", "type": "x", "at": 2}],
                          [{"type": "return", "at": 1}, {"id": "a", "type": "x", "at": 2},
                           {"id": "b", "type": "x", "at": 3}])) == 3)
check("derive_refurb_count counts return entries", O.derive_refurb_count(
    [{"type": "return"}, {"type": "send-out"}, {"type": "return"}]) == 2)

print("\n%d failed" % len(fails))
if fails:
    print("FAILED: " + "; ".join(fails))
    sys.exit(1)
print("all passed")

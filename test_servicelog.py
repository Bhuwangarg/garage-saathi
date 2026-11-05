#!/usr/bin/env python3
"""The service log must actually reach the server, and must prove itself.

confirmLogService wrote a photoless card straight at `verified`. The server has
refused exactly that since 2299533 (10 Sep 2026), while the separate push that
updates the bus's service date was accepted -- so a service looked logged, its
cost never left the phone, and nobody reported it for eight weeks because the one
thing anybody checks was right. LIVE-ISSUES 8.

These tests pin the shape the sheet now pushes, in both directions: with proof it
lands, without proof it is refused, and it lands as `done` rather than signing
itself off.

    /usr/bin/python3 test_servicelog.py
"""
import os
import sys
import tempfile

os.environ["DB_PATH"] = tempfile.mktemp(suffix=".db")
for k in ("DATABASE_URL", "TURSO_URL", "TURSO_DATABASE_URL"):
    os.environ.pop(k, None)
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import sync_server as S  # noqa: E402

SUP = {"id": "u-sup", "role": "supervisor"}
OWNER = {"id": "u-own", "role": "owner"}
fails = []


def check(name, ok, detail=""):
    print(("  ok  " if ok else "  FAIL ") + name + ("" if ok else "  -- " + str(detail)))
    if not ok:
        fails.append(name)


def card(cid, **over):
    d = {"id": cid, "busId": "b1",
         "problem": "Scheduled service @ 48,210 km (every 10,000 km)",
         "priority": "low", "status": "done",
         "reportedBy": "u-sup", "assignedTo": "u-sup",
         "beforePhotos": ["before.jpg"], "afterPhotos": ["after.jpg"],
         "partsUsed": [], "labourHours": 2, "externalVendor": "",
         "externalCost": 900, "notes": "oil + filter changed",
         "createdAt": 1, "closedAt": 1, "updatedAt": 1}
    d.update(over)
    return d


def push(actor, cid, data):
    return S.push([{"store": "jobcards", "id": cid, "data": data, "updatedAt": data["updatedAt"]}],
                  actor=actor)


def stored(cid):
    return S.record("jobcards", cid, OWNER) if hasattr(S, "record") else None


print("The shape the service sheet pushes now")

r = push(SUP, "j-sv1", card("j-sv1"))
check("a service with a before and an after photo is accepted", r.get("applied") == 1,
      r.get("refused"))

r = push(SUP, "j-sv2", card("j-sv2", beforePhotos=[], afterPhotos=[]))
check("a service with no photos at all is refused", r.get("applied") == 0,
      "applied=%r" % r.get("applied"))

r = push(SUP, "j-sv3", card("j-sv3", afterPhotos=[]))
check("done here with only a before photo is refused", r.get("applied") == 0,
      "applied=%r" % r.get("applied"))

r = push(SUP, "j-sv4", card("j-sv4", externalVendor="Sharma Auto Works", afterPhotos=[]))
check("an outside garage with one bill photo is accepted", r.get("applied") == 1,
      r.get("refused"))

print("\nAnd it does not sign itself off")

r = push(SUP, "j-sv5", card("j-sv5", status="verified", verifiedBy="u-sup", verifiedAt=1))
check("the OLD shape -- straight to verified by its author -- is still refused",
      r.get("applied") == 0, "applied=%r" % r.get("applied"))

# The accepted card must be sitting at done, waiting for a second person.
rows = {rec["id"]: rec for rec in
        [r2["data"] for r2 in S.pull(0, actor=OWNER).get("records", [])
         if r2["store"] == "jobcards"]}
sv1 = rows.get("j-sv1") or {}
check("the accepted service is waiting at done, not verified",
      sv1.get("status") == "done", "status=%r" % sv1.get("status"))
check("  ...and the server recorded who closed it", sv1.get("closedBy") == "u-sup",
      "closedBy=%r" % sv1.get("closedBy"))
check("  ...and nobody has signed it off yet", not sv1.get("verifiedBy"),
      "verifiedBy=%r" % sv1.get("verifiedBy"))

r = push(OWNER, "j-sv1", dict(sv1, status="verified", updatedAt=2))
check("the owner can then sign off the supervisor's service", r.get("applied") == 1,
      r.get("refused"))

print("\n%d of %d checks passed." % (9 - len(fails), 9))
if fails:
    print("FAILED: " + "; ".join(fails))
    sys.exit(1)
print("\nall passed")

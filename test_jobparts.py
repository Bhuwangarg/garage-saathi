#!/usr/bin/env python3
"""A part issued to a job card must stay on it.

The card's `partsUsed` line is a copy of a stock-ledger row: the part has left
the store. A device saving the same card from a copy loaded before the issue
must not drop that line, or the stock is short with nothing accounting for it.

    /usr/bin/python3 test_jobparts.py
"""
import json, os, sys, tempfile

os.environ["DB_PATH"] = tempfile.mktemp(suffix=".db")
os.environ.pop("ENABLE_DEMO_SEED", None)
for k in ("DATABASE_URL", "TURSO_URL", "TURSO_DATABASE_URL"):
    os.environ.pop(k, None)
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import sync_server as S  # noqa: E402

fails = []
SUP = {"id": "u-sup", "role": "supervisor"}
STORE = {"id": "u-st", "role": "store"}
MECH = {"id": "u-m1", "role": "mechanic"}
PROOF = ["before.jpg"]


def check(name, cond):
    print(("  ok  " if cond else " FAIL ") + name)
    if not cond:
        fails.append(name)


def push(actor, store, rid, data, at=None):
    return S.push([{"store": store, "id": rid, "updatedAt": at or S.now_ms(),
                    "data": dict(data, id=rid)}], actor)


def stored(store, rid):
    c = S.db()
    row = c.execute("SELECT data FROM records WHERE store=? AND id=?", (store, rid)).fetchone()
    c.close()
    return json.loads(row[0]) if row else None


def lines(rid):
    return {(l["partId"], bool(l.get("reused"))): l["qty"] for l in (stored("jobcards", rid) or {}).get("partsUsed", [])}


CARD = {"busId": "b1", "problem": "clutch", "status": "open", "assignees": [{"userId": "u-m1"}],
        "beforePhotos": PROOF, "afterPhotos": PROOF, "partsUsed": [], "labourHours": 2}

print("A stale device must not drop a part that was issued")
push(SUP, "jobcards", "j1", CARD)
# The store issues a part: ledger row, then the line on the card.
push(STORE, "ledger", "l1", {"partId": "p-clutch", "type": "out", "qty": 2, "jobId": "j1"})
push(STORE, "jobcards", "j1", dict(CARD, partsUsed=[{"partId": "p-clutch", "qty": 2, "cost": 900}]))
check("the issued part is on the card", lines("j1") == {("p-clutch", False): 2})

# The mechanic's phone still holds the card as it was before the issue, and
# saves its own honest edit (hours) a moment later.
push(MECH, "jobcards", "j1", dict(CARD, labourHours=5))
card = stored("jobcards", "j1")
check("the part survives the stale write", lines("j1") == {("p-clutch", False): 2})
check("the stale device's own edit still lands", card["labourHours"] == 5)

print("A reduced quantity is restored, a larger one is kept")
push(STORE, "jobcards", "j1", dict(CARD, partsUsed=[{"partId": "p-clutch", "qty": 1, "cost": 450}]))
check("a reduced quantity goes back to what was issued", lines("j1") == {("p-clutch", False): 2})
push(STORE, "jobcards", "j1", dict(CARD, partsUsed=[{"partId": "p-clutch", "qty": 5, "cost": 2250}]))
check("issuing more is still allowed", lines("j1") == {("p-clutch", False): 5})

print("New and reused lines of the same part are separate")
push(STORE, "jobcards", "j1", dict(CARD, partsUsed=[
    {"partId": "p-clutch", "qty": 5, "cost": 2250},
    {"partId": "p-clutch", "qty": 1, "cost": 100, "reused": True}]))
push(MECH, "jobcards", "j1", dict(CARD, labourHours=6))
check("both lines survive", lines("j1") == {("p-clutch", False): 5, ("p-clutch", True): 1})

print("Adding a part is never blocked")
push(STORE, "jobcards", "j1", dict(CARD, partsUsed=[
    {"partId": "p-clutch", "qty": 5, "cost": 2250},
    {"partId": "p-clutch", "qty": 1, "cost": 100, "reused": True},
    {"partId": "p-oil", "qty": 3, "cost": 600}]))
check("a new part lands", lines("j1").get(("p-oil", False)) == 3)

print("Deleting a card is still the manager's to do")
push(SUP, "jobcards", "j1", dict(CARD, _deleted=True))
check("a deleted card is not resurrected with parts", stored("jobcards", "j1").get("_deleted") is True)

print("\nRESULT: " + ("ALL PASS" if not fails else "%d FAILED -> %s" % (len(fails), fails)))
sys.exit(1 if fails else 0)

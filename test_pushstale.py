#!/usr/bin/env python3
"""A push that loses the staleness comparison is named, not dropped.

`LIVE-ISSUES.md` issue 1, the highest-severity item in the rebuild. push() wrote
a record only `if row is None or upd > (row[0] or 0)` and had **no else**: a
record that lost that comparison was not applied, not counted in `rejected` and
not named in `refused`. It fell off the end of the loop and the response said
200. The client then cleared the whole batch from its outbox under the comment
"everything else landed", so the change stayed in that one phone's database,
"Waiting to send" dropped to zero, and the server never had it. Nobody could
see it had happened, least of all the person who made the change.

The code already knew this failure mode and said so about REFUSED writes, three
lines above: "a refused write is the quietest way to lose work... the server says
WHY -- pass it on." The identical hole was still open for staleness.

Most writes never reach the else branch any more, because `_guard_write` merges
first by a domain rule (test_guardwrite_v2.py covers that). What reaches here is
the residual: a genuine collision on a value no rule decides -- free text, a
state, a registration number. Those a person has to see, with a reason and a
Retry, and never as a dialog asking them to adjudicate a clock.

    /usr/bin/python3 test_pushstale.py
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


OWNER = {"id": "u-own", "role": "owner", "name": "Owner"}
SUP = {"id": "u-sup", "role": "supervisor", "name": "Sup"}


def push(actor, store, data, upd):
    return S.push([{"store": store, "id": data["id"], "data": dict(data), "updatedAt": upd}], actor)


def stored(store, rid):
    c = S.db()
    row = c.execute("SELECT data FROM records WHERE store=? AND id=?", (store, rid)).fetchone()
    c.close()
    return json.loads(row[0]) if row else None


now = S.now_ms()

# A bus record, whole, with every field the two devices hold. `regNo` is **R** in
# contract §4.4 -- a registration number is one value two people can genuinely
# disagree about and no domain rule decides -- so a losing write on it is the
# residual case this file is about. Sending the record WHOLE matters: a device
# that omitted a field would have the field merged back, which is a correction,
# and a corrected payload is re-stamped above the stored row and applies.
BUS = {"id": "bus-1", "regNo": "RJ14 AA 1111", "company": "Volvo", "model": "9400",
       "chassis": "CH-1", "engine": "EN-1", "odometer": 100000, "odometerAt": now,
       "lastServiceOdo": 90000, "docs": [], "photos": []}

print("The winning write lands")
r = push(OWNER, "buses", BUS, now)
check("a first write applies", r["applied"] == 1 and r["rejected"] == 0)
r = push(OWNER, "buses", dict(BUS, regNo="RJ14 BB 2222"), now + 1000)
check("a newer write applies", r["applied"] == 1)
check("and the newer registration is what is stored",
      stored("buses", "bus-1")["regNo"] == "RJ14 BB 2222")

print("\nThe losing write is named, counted and carried back")
r = push(SUP, "buses", dict(BUS, regNo="RJ14 CC 3333"), now + 500)
check("it is NOT counted in applied", r["applied"] == 0)
check("it IS counted in rejected", r["rejected"] == 1)
check("it is named in refused", len(r["refused"]) == 1)
ent = r["refused"][0] if r["refused"] else {}
check("named with its store and id", ent.get("store") == "buses" and ent.get("id") == "bus-1")
check("with the literal reason 'stale'", ent.get("reason") == "stale")
check("and the stored record is untouched",
      stored("buses", "bus-1")["regNo"] == "RJ14 BB 2222")

print("\nThe reason string is distinct from every prose refusal, because v2 switches on it")
# Every other reason this function produces is a sentence. A client that matched
# on a substring would be matching on English.
reasons = set()
for store, data, actor in (
        ("ledger", {"id": "lg-x", "amount": 1}, {"id": "u-drv", "role": "driver"}),
        ("meta", {"key": "seeded", "value": 1}, OWNER),
        ("jobcards", {"id": "j-x", "status": "open"}, {"id": "u-mech", "role": "mechanic"})):
    out = S.push([{"store": store, "id": data.get("id") or data["key"],
                   "data": dict(data), "updatedAt": now}], actor)
    for x in out["refused"]:
        reasons.add(x["reason"])
check("at least three prose refusals were produced to compare against", len(reasons) >= 3)
check("'stale' is not one of them", "stale" not in reasons)
check("and no prose reason contains it as a word",
      not [x for x in reasons if x.split() and "stale" in x.split()])

print("\nThe stored copy rides along under the cap")
check("the refusal carries the server's copy", "server" in ent)
srv = ent.get("server") or {}
check("…with the data", (srv.get("data") or {}).get("regNo") == "RJ14 BB 2222")
check("…with the stored updatedAt", srv.get("updatedAt") == now + 1000)
check("…and with the rev, the one ordering fact a client can trust",
      isinstance(srv.get("rev"), int) and srv["rev"] > 0)

print("\nAnd is omitted over it, so one stale job card cannot become a 6 MiB response")
# A job card whose photo upload failed carries the image inline as a `data:` URL
# and travels in every pull and push (`03 §6`). The cap is what stops a thousand
# of those turning a refusal list into the largest thing in the response.
_was = S.STALE_COPY_MAX_BYTES
try:
    S.STALE_COPY_MAX_BYTES = 32
    r = push(SUP, "buses", dict(BUS, regNo="RJ14 DD 4444"), now + 400)
    over = r["refused"][0] if r["refused"] else {}
    check("still refused, with the same reason", over.get("reason") == "stale")
    check("still counted in rejected", r["rejected"] == 1)
    check("but the copy is left out", "server" not in over)
finally:
    S.STALE_COPY_MAX_BYTES = _was

print("\nThe comparison itself is untouched — v1's conflict resolution is unchanged")
# Changing `upd > row[0]` would change conflict resolution for every v1 device in
# the field. The fix is step 5 merging first, not step 6 ordering differently.
src = open(os.path.join(HERE, "sync_server.py"), encoding="utf-8").read()
check("push() still writes only when the row is new or strictly newer",
      "if row is None or upd > (row[0] or 0):" in src)
# A DIFFERENT record at the stored record's own timestamp. The comparison is
# strictly greater, so an equal stamp has always lost silently -- which is why
# v2's client re-applies at `server.updatedAt + 1` rather than at the same value.
r = push(SUP, "buses", dict(BUS, regNo="RJ14 EE 5555"), now + 1000)
check("an EQUAL timestamp still loses, exactly as it did before",
      r["applied"] == 0 and r["refused"][0]["reason"] == "stale")

print("\nIdempotent replay: a retry after a lost response is a success, not a refusal")
# `04 §3.2`. A phone that pushed successfully and lost the RESPONSE retries. Into
# an append-only store that retry was refused even though the first write landed,
# so the device quarantined a change the server already had and somebody had to
# go and look at it.
LEDGER = {"id": "lg-1", "partId": "p-1", "qty": 2, "kind": "out", "at": now, "by": "u-own"}
NOTE = {"id": "cn-1", "crewId": "d-1", "text": "spoke about the late marks", "at": now}
DUTY = {"id": "dl-1", "crewId": "d-1", "role": "driver", "busId": "bus-1",
        "at": now, "reason": "assign"}
for store, row in (("ledger", LEDGER), ("crewnotes", NOTE), ("dutylog", DUTY)):
    first = push(OWNER, store, row, now)
    check("%-10s first write applies" % store, first["applied"] == 1)
    again = push(OWNER, store, row, now + 5000)
    check("%-10s an identical replay is applied, not refused" % store,
          again["applied"] == 1 and again["rejected"] == 0 and not again["refused"])
    changed = push(OWNER, store, dict(row, text="different", qty=99, reason="left"), now + 6000)
    check("%-10s but a CHANGED write is still refused, append-only intact" % store,
          changed["rejected"] == 1 and changed["applied"] == 0)
check("the replay did not write a second row",
      stored("ledger", "lg-1")["qty"] == 2)
check("…and the note still says what it said when it was written",
      stored("crewnotes", "cn-1")["text"] == "spoke about the late marks")

print("\nA replay whose only difference is a field the SERVER stamped still counts")
# The device never saw `by` -- the server put it there from the token -- so a
# retry cannot carry it, and judging the replay on its absence would refuse the
# very write this is meant to let through.
bare = {k: v for k, v in NOTE.items() if k != "by"}
r = push(OWNER, "crewnotes", bare, now + 7000)
check("a crewnotes retry without the server's `by` is applied", r["applied"] == 1)
check("and `by` is still the token's, not the body's", stored("crewnotes", "cn-1")["by"] == "u-own")

print("\nA stale push on an **R** field of a job card is refused the same way")
JOB = {"id": "j-1", "busId": "bus-1", "status": "open", "problem": "brake noise",
       "priority": "high", "notes": "", "remark": "", "labourHours": 2,
       "partsUsed": [], "partRequests": [], "coreReturns": [],
       "beforePhotos": [], "afterPhotos": [], "closedBy": None}
check("a first card applies", push(OWNER, "jobcards", JOB, now)["applied"] == 1)
check("a newer edit to the free text applies",
      push(OWNER, "jobcards", dict(JOB, problem="brake noise, front left"), now + 2000)["applied"] == 1)
r = push(SUP, "jobcards", dict(JOB, problem="handbrake"), now + 1000)
check("a stale edit to the same free text is refused as stale",
      r["rejected"] == 1 and r["refused"] and r["refused"][0]["reason"] == "stale")
check("and the card still reads what the winner wrote",
      stored("jobcards", "j-1")["problem"] == "brake noise, front left")

print("\nRESULT: " + ("ALL PASS" if not fails else "%d FAILED -> %s" % (len(fails), fails)))
sys.exit(1 if fails else 0)

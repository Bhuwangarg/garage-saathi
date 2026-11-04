#!/usr/bin/env python3
"""`nightlist` — tonight's running list, and the clock it does not depend on.

One record per night, id `nl-<YYYY-MM-DD>`, holding a map of bus id to
`{running, at, by}`. Contract §5.

Two things about it are easy to get wrong and both are checked here.

**It is a map, not a list.** A list of running buses could only ever be unioned,
so a bus ticked by mistake could never be un-ticked and the count could never
reach zero -- which is the one thing this record exists to make possible
(`DECISIONS.md §8`). And `running: false` is a real state that is NOT the same as
absent: absent means nobody has decided about that bus tonight. "Unknown" and
"no" must never look alike (`v2-foundation-ui.md §3.6`).

**Its ordering comes from the server, not from a phone.** Each changed entry's
`at` is stamped from server time and its `by` from the token, exactly as
`attendance.receivedAt`, `dutylog.by` and `gatechecks.decision.at` already are.
That is what makes per-bus last-write-wins server-ordered rather than
clock-ordered, so a phone set forward cannot win every tick and a phone set back
cannot lose every one -- strategy **S** in contract §4.4. It is not tidying, and
it is the whole reason a new store was added rather than a field on `buses`.

    /usr/bin/python3 test_nightplan.py
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
import v2_perms as P  # noqa: E402

fails = []


def check(name, cond):
    print(("  ok  " if cond else " FAIL ") + name)
    if not cond:
        fails.append(name)


OWNER = {"id": "u-own", "role": "owner"}
SUP = {"id": "u-sup", "role": "supervisor"}
CREWM = {"id": "u-cm", "role": "crewmanager"}
STORE = {"id": "u-st", "role": "store"}
DRIVER = {"id": "u-dr", "role": "driver"}
OFFICE = {"id": "u-of", "role": "office"}
MECH = {"id": "u-me", "role": "mechanic"}
CON = {"id": "u-co", "role": "conductor"}

now = S.now_ms()
DAY = "2026-11-04"
NID = "nl-" + DAY


def night(buses, date=DAY, nid=NID, **extra):
    return dict({"id": nid, "date": date, "buses": buses,
                 "createdAt": now, "updatedAt": now}, **extra)


def push(actor, data, upd=None):
    return S.push([{"store": "nightlist", "id": data["id"], "data": dict(data),
                    "updatedAt": upd if upd is not None else now}], actor)


def stored(nid=NID):
    c = S.db()
    row = c.execute("SELECT data FROM records WHERE store='nightlist' AND id=?", (nid,)).fetchone()
    c.close()
    return json.loads(row[0]) if row else None


print("Who may write it: the duty board's three roles, and nobody else")
check("the owner may", push(OWNER, night({"bus-1": {"running": True}}))["applied"] == 1)
check("the supervisor may", push(SUP, night({"bus-1": {"running": True},
                                             "bus-2": {"running": True}}), now + 10)["applied"] == 1)
check("the crew manager may", push(CREWM, night({"bus-3": {"running": True}}), now + 20)["applied"] == 1)
for actor in (STORE, DRIVER, OFFICE, MECH, CON):
    r = push(actor, night({"bus-9": {"running": True}}), now + 30)
    check("a %-11s may not" % actor["role"],
          r["rejected"] == 1 and r["refused"][0]["reason"] == "role may not write this store")
check("the write roles are exactly the duty board's three",
      S.WRITE_ROLES["nightlist"] == {"owner", "supervisor", "crewmanager"})
check("and it is not a server-ingest-only store", "nightlist" not in S.SERVER_INGEST_ONLY)

print("\nWho may read it: the same three")
check("the read matrix names exactly those three",
      P.read_roles("nightlist") == frozenset({"owner", "supervisor", "crewmanager"}))
for role in ("store", "mechanic", "driver", "conductor", "office"):
    check("a %-10s receives no nightlist record" % role,
          S.redact_for({"id": "u-" + role, "role": role},
                       {"store": "nightlist", "id": NID,
                        "data": night({"bus-1": {"running": True}}),
                        "updatedAt": now, "rev": 1}) is None)
    check("  …and the query skips it for a %-10s" % role,
          "nightlist" in S._never_for({"id": "u-" + role, "role": role}))

print("\nThe four guard rules")
bad = push(OWNER, night({"bus-1": {"running": True}}, date="04-11-2026", nid="nl-04-11-2026"), now + 40)
check("a date that is not YYYY-MM-DD is refused",
      bad["rejected"] == 1 and "date" in bad["refused"][0]["reason"])
bad = push(OWNER, night({"bus-1": {"running": True}}, date="2026-11-05"), now + 41)
check("a date that disagrees with the id is refused",
      bad["rejected"] == 1 and "agree" in bad["refused"][0]["reason"])
bad = push(OWNER, night([{"busId": "bus-1"}]), now + 42)
check("a LIST of buses is refused — a list can only ever be unioned",
      bad["rejected"] == 1 and "object" in bad["refused"][0]["reason"])
bad = push(OWNER, night({"bus-%d" % i: {"running": True} for i in range(S.NIGHTLIST_MAX_BUSES + 1)}),
           now + 43)
check("more than %d buses on one night is refused" % S.NIGHTLIST_MAX_BUSES,
      bad["rejected"] == 1 and "too many" in bad["refused"][0]["reason"])
ok = push(OWNER, night({"bus-%d" % i: {"running": True} for i in range(S.NIGHTLIST_MAX_BUSES)}),
          now + 44)
check("…and exactly %d is allowed" % S.NIGHTLIST_MAX_BUSES, ok["applied"] == 1)
bad = push(OWNER, night({"bus-1": {"running": "yes"}}), now + 45)
check("an entry that is neither running nor not is refused",
      bad["rejected"] == 1 and "running" in bad["refused"][0]["reason"])
bad = push(OWNER, night({"bus-1": {}}), now + 46)
check("…including one that says nothing at all", bad["rejected"] == 1)
bad = push(OWNER, dict(night({"bus-1": {"running": True}}), _deleted=True), now + 47)
check("a delete is refused — a night that happened happened",
      bad["rejected"] == 1 and "deleted" in bad["refused"][0]["reason"])

print("\n…and it is NOT append-only: the board is edited through the evening")
S.push([], OWNER)
base = push(OWNER, night({"bus-1": {"running": True}}), now + 100)
check("a fresh night lands", base["applied"] == 1)
later = push(CREWM, night({"bus-1": {"running": True}, "bus-2": {"running": True}}), now + 200)
check("a second writer adds a bus to the same record", later["applied"] == 1)
check("…and there is still ONE record for the night, not two",
      set((stored() or {}).get("buses") or {}) >= {"bus-1", "bus-2"})

print("\n`by` comes from the token, never from the body")
r = push(CREWM, night({"bus-new-a": {"running": True, "by": "u-somebody-else", "at": 1}}), now + 300)
check("the write applies", r["applied"] == 1)
entry = (stored()["buses"] or {}).get("bus-new-a") or {}
check("and the entry says who was actually signed in", entry.get("by") == "u-cm")
check("the body's claim is gone", entry.get("by") != "u-somebody-else")

print("\n`at` is stamped from SERVER time — the clock-independence of this store")
# A phone set a year forward must not be able to stamp a tick in the future, and
# a phone set a year back must not be able to stamp one in the past: per-bus
# ordering has to come from something the server issued.
before = S.now_ms()
r = push(SUP, night({"bus-new-b": {"running": True, "at": 4102444800000, "by": "u-fake"}}), now + 400)
after = S.now_ms()
e_b = (stored()["buses"] or {}).get("bus-new-b") or {}
check("a far-future `at` from the body is replaced", e_b.get("at") != 4102444800000)
check("…with the server's own clock", before <= (e_b.get("at") or 0) <= after)
r = push(SUP, night({"bus-new-c": {"running": True, "at": 1}}), now + 500)
e_c = (stored()["buses"] or {}).get("bus-new-c") or {}
check("a `at` from a phone set backwards is replaced too", (e_c.get("at") or 0) > 1)
check("…and with the server's clock, not the phone's", (e_c.get("at") or 0) >= before)

print("\nAn UNCHANGED entry keeps the stamp it already had")
# Otherwise every save would re-date every tick, and "who said this bus runs, and
# when" -- which measure 5 and measure 6 are both read against -- would be the
# time of the last save rather than the time of the decision.
was = dict((stored()["buses"] or {}).get("bus-1") or {})
r = push(CREWM, night({"bus-1": {"running": True}}), now + 600)
now_1 = (stored()["buses"] or {}).get("bus-1") or {}
check("the same verdict leaves `at` alone", now_1.get("at") == was.get("at"))
check("…and leaves `by` as whoever first said it", now_1.get("by") == was.get("by"))
r = push(CREWM, night({"bus-1": {"running": False}}), now + 700)
flipped = (stored()["buses"] or {}).get("bus-1") or {}
check("a CHANGED verdict is re-stamped", (flipped.get("at") or 0) > (was.get("at") or 0))
check("…by whoever changed it", flipped.get("by") == "u-cm")

print("\nA tick can be taken back, and 'no' is not the same as 'nobody has said'")
check("running:false is stored as a real state", flipped.get("running") is False)
check("a bus nobody has decided about is simply absent",
      "bus-never" not in ((stored() or {}).get("buses") or {}))

print("\nNo tick is ever lost: a stale board does not un-decide another phone's bus")
r = push(SUP, night({"bus-new-d": {"running": True}}), now + 800)
check("one phone ticks bus-8", r["applied"] == 1)
# A device that loaded the board before bus-8 was ticked pushes without it.
r = push(CREWM, night({"bus-2": {"running": False}}), now + 900)
after_stale = (stored() or {}).get("buses") or {}
check("a device that never saw bus-8 does not remove it", "bus-new-d" in after_stale)
check("…and its own change still landed", (after_stale.get("bus-2") or {}).get("running") is False)

print("\nThe retention window")
check("the server sends 365 days of it", S.HISTORY_DAYS["nightlist"] == 365)
check("…and the window is env-overridable", "NIGHTLIST_HISTORY_DAYS" in
      open(os.path.join(HERE, "sync_server.py"), encoding="utf-8").read())
check("it is aligned with the duty log it is read against",
      S.HISTORY_DAYS["nightlist"] == S.HISTORY_DAYS["dutylog"])
old = {"store": "nightlist", "id": "nl-2000-01-01",
       "data": {"id": "nl-2000-01-01", "date": "2000-01-01", "buses": {},
                "updatedAt": now - 400 * 86400000},
       "updatedAt": now - 400 * 86400000, "rev": 1}
check("a night older than the window is not sent", S.redact_for(OWNER, old) is None)
fresh = {"store": "nightlist", "id": NID,
         "data": {"id": NID, "date": DAY, "buses": {}, "updatedAt": now},
         "updatedAt": now, "rev": 2}
check("and tonight's is", S.redact_for(OWNER, fresh) is not None)

print("\nIt reaches a duty-board device through the ordinary pull")
page = S.pull(0, actor=CREWM)
got = [x for x in page["records"] if x["store"] == "nightlist"]
check("a crew manager's drain contains the night", any(x["id"] == NID for x in got))
page = S.pull(0, actor=DRIVER)
check("a driver's drain does not",
      not [x for x in page["records"] if x["store"] == "nightlist"])

print("\nIt is not merged, because it is ordered instead (strategy S)")
check("nightlist has no field-merge rule", "nightlist" not in S._MERGE_STORES)

print("\nRESULT: " + ("ALL PASS" if not fails else "%d FAILED -> %s" % (len(fails), fails)))
sys.exit(1 if fails else 0)

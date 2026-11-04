#!/usr/bin/env python3
"""The server's read boundary: deny by default, both directions.

`redact_for` used to name the stores it withheld and return everything else to
every authenticated role, so a `conductor` token -- zero capabilities in `PERMS`,
zero routes in the app -- could `/pull` supplier bills, purchases, the vendor
registry, parts, the stock ledger, job-card costs, fuel, driver trip cash,
challan liabilities, garage settings, all-staff attendance, and gate checks with
their selfies. Taking a screen away in `PERMS` hid the screen and changed nothing
about what that token could download (`LIVE-ISSUES.md` issue 2), which is why
v2's whole permission model was cosmetic until this moved.

This file checks BOTH directions, because only one of them is about security:

  * nothing arrives that the role is not entitled to -- the obvious half; and
  * EVERYTHING the role is entitled to still arrives, as an exact set rather
    than as "nothing extra turned up". A scoping bug satisfies "nothing extra"
    perfectly: it withholds a store from a role whose screen reads it, the
    screen goes blank for a hundred people, and no assertion anywhere notices.
    That is a worse failure than the one this boundary fixes, because it breaks
    software that works today rather than exposing data that is already exposed.

The v1-compat rows at the end are asserted PRESENT, each beside the v1 route
that needs it, so removing one is two deliberate edits rather than an accident
somebody makes mid-build.

    /usr/bin/python3 test_readscope.py
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
import v2_perms as P  # noqa: E402

fails = []


def check(name, cond):
    print(("  ok  " if cond else " FAIL ") + name)
    if not cond:
        fails.append(name)


# Every store a record can live in. Spelled out rather than imported from
# v2_perms, deliberately and for the same reason test_pullscope.py does it:
# adding a store and forgetting it must show up as a gap in the sweep below
# rather than as silence. Importing the table would make the sweep agree with
# whatever the table happens to say.
STORES = [
    "users", "meta", "buses", "drivers", "parts", "jobcards", "ledger",
    "purchases", "vendors", "audits", "stockmoves", "components", "def", "fuel",
    "attendance", "usage", "incidents", "driverreports", "routes", "triplog",
    "trips", "challans", "breakdowns", "gatepasses", "gatechecks", "dutylog",
    "nightlist", "gpsevents", "rbservices", "rbreviews", "rbcomplaints",
    "rbassign", "rbreviewai", "rbalias", "rbaliasai", "itslookup", "gateai",
    "coreai", "reportai", "coachai", "crewnotes", "digest", "aimeta", "gpslive",
    "odometerlogs", "waconv",
]
ROLES = list(S.ALL_ROLES)
now = S.now_ms()

print("The table covers every store, and the sweep covers every store in it")
check("no store in the sweep is missing from the read matrix",
      not sorted(set(STORES) - (set(P.STORE_READ_ROLES) | set(P.V1_COMPAT_READ))))
check("no store in the read matrix is missing from the sweep",
      not sorted((set(P.STORE_READ_ROLES) | set(P.V1_COMPAT_READ)) - set(STORES)))
check("every role named anywhere in the matrix is a real role",
      not sorted({r for st in STORES for r in P.read_roles(st)} - set(ROLES)))


def rec(store, rid, **extra):
    data = dict({"id": rid, "at": now, "updatedAt": now}, **extra)
    return {"store": store, "id": rid, "data": data, "updatedAt": now, "rev": 1}


print("\n8 roles x %d stores, both directions" % len(STORES))
# Fresh records on purpose: the history stores are trimmed by AGE as well, and an
# old record would be withheld for a reason that has nothing to do with the role.
for role in ROLES:
    actor = {"id": "u-" + role, "role": role}
    never = S._never_for(actor)
    leaked, unskipped, lost = [], [], []
    for st in STORES:
        allowed = role in P.read_roles(st)
        # A record belonging to SOMEBODY ELSE, so an own-rows store is judged on
        # the store rule and not accidentally on ownership.
        other = rec(st, "r-" + st, userId="u-nobody", _createdBy="u-nobody",
                    driverId="d-nobody")
        got = S.redact_for(actor, other) is not None
        if not allowed:
            if got:
                leaked.append(st)
            if st not in never:
                unskipped.append(st)
        else:
            # And the other direction, which is the half that keeps the office
            # working: an entitled store must still arrive. Own-rows stores are
            # asked with the actor's OWN row.
            field = (P.OWN_ROWS_ONLY.get(st) or (None, ()))[0]
            mine = other if field is None else rec(st, "m-" + st, **{field: actor["id"]})
            if S.redact_for(actor, mine) is None:
                lost.append(st)
            if st in never:
                lost.append(st + "(skipped)")
    check("%-11s receives nothing it may not have%s"
          % (role, "" if not leaked else " -> " + ",".join(leaked)), not leaked)
    check("  %-9s and the query skips every one of them%s"
          % (role, "" if not unskipped else " -> " + ",".join(unskipped)), not unskipped)
    check("  %-9s and still receives everything it may%s"
          % (role, "" if not lost else " -> LOST " + ",".join(sorted(set(lost)))), not lost)

print("\nAn unknown store reaches nobody — the inverse of v1")
for role in ROLES:
    check("%-11s is denied a store that is not in the table" % role,
          S.redact_for({"id": "u", "role": role}, rec("notastore", "x-1")) is None)

print("\nEnd to end: the received set EQUALS the entitled set after a full drain")
c = S.db()
rev = c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()[0]
for st in STORES:
    rev = S._upsert_record(c, st, "seed-" + st,
                           {"id": "seed-" + st, "at": now, "updatedAt": now,
                            "userId": "u-nobody", "_createdBy": "u-nobody",
                            "driverId": "d-nobody", "busId": "bus-nobody"}, now, rev)
# One own row per role per own-rows store, so the equality below is a real test
# of the SQL predicate and not of an empty set.
for role in ROLES:
    for st, (field, roles) in P.OWN_ROWS_ONLY.items():
        if not field:
            continue
        rid = "own-%s-%s" % (st, role)
        rev = S._upsert_record(c, st, rid,
                               {"id": rid, "at": now, "updatedAt": now, field: "u-" + role},
                               now, rev)
# The wall that made a new phone's first sync crawl: the records a driver
# actually needs sit behind thousands of rows it may never see.
for i in range(2000):
    rev = S._upsert_record(c, "gpsevents", "g%d" % i, {"id": "g%d" % i, "at": now, "updatedAt": now}, now, rev)
for st in ("jobcards", "buses", "drivers"):
    rev = S._upsert_record(c, st, "late-" + st,
                           {"id": "late-" + st, "at": now, "updatedAt": now, "userId": "u-nobody"}, now, rev)
c.commit()
c.close()


def drain(actor, limit=600):
    """Every record a device receives, and how many pages it took."""
    seen, since, pages = set(), 0, 0
    while True:
        pages += 1
        got = S.pull(since, limit=limit, actor=actor)
        for r in got["records"]:
            seen.add((r["store"], r["id"]))
        since = got["maxRev"]
        if not got["more"] or pages > 400:
            return seen, pages


def entitled(actor):
    """What this role is owed, computed from the matrix rather than from
    redact_for — otherwise the drain would only be checked against the code it is
    meant to be checking."""
    role = actor["role"]
    want = set()
    for st in STORES:
        if role not in P.read_roles(st):
            continue
        field, roles = P.OWN_ROWS_ONLY.get(st) or (None, ())
        restricted = bool(field) and role in roles
        if restricted:
            want.add((st, "own-%s-%s" % (st, role)))
            continue          # every seeded row above belongs to somebody else
        want.add((st, "seed-" + st))
        if field:
            want |= {(st, "own-%s-%s" % (st, r)) for r in ROLES}
        if st in ("jobcards", "buses", "drivers"):
            want.add((st, "late-" + st))
        if st == "gpsevents":
            want |= {("gpsevents", "g%d" % i) for i in range(2000)}
    return want


for role in ROLES:
    actor = {"id": "u-" + role, "role": role}
    got, pages = drain(actor)
    want = entitled(actor)
    extra = sorted(got - want)[:4]
    missing = sorted(want - got)[:4]
    check("%-11s received set equals entitled set%s" % (
        role,
        "" if not (extra or missing) else
        (" -> extra " + ",".join("/".join(x) for x in extra) if extra else "") +
        (" -> missing " + ",".join("/".join(x) for x in missing) if missing else "")),
        not extra and not missing)
    # The page an own row arrives in must not be empty. A post-filter instead of
    # a SQL predicate satisfies "nothing extra" and empties the page -- which is
    # the first-sync bug the skip list exists to cure, recreated one layer down.
    if role not in ("owner", "supervisor"):
        check("  %-9s and its own attendance arrives, in a page that is not empty" % role,
              ("attendance", "own-attendance-" + role) in got)

print("\nNamed regressions — every one of these is true on today's code")
CON = {"id": "u-conductor", "role": "conductor"}
MECH = {"id": "u-mechanic", "role": "mechanic"}
OFF = {"id": "u-office", "role": "office"}
CM = {"id": "u-crewmanager", "role": "crewmanager"}
con_got, _ = drain(CON)
con_stores = {s for s, _ in con_got}
for st in ("purchases", "ledger", "jobcards", "fuel", "trips", "challans", "gatechecks",
           "vendors", "parts", "stockmoves", "audits", "def", "components", "gatepasses"):
    check("a conductor receives no %s" % st, st not in con_stores)
check("a conductor receives no other person's attendance",
      ("attendance", "seed-attendance") not in con_got)
check("…but does receive its own", ("attendance", "own-attendance-conductor") in con_got)
check("a conductor receives no labourRate on the garage settings",
      "labourRate" not in (S.redact_for(CON, rec("meta", "garage", labourRate=400)) or
                           {"data": {}})["data"])
check("…and the row still arrives, so check-in keeps its geofence and cutoff",
      S.redact_for(CON, rec("meta", "garage", labourRate=400, lateCutoff="09:30")) is not None)
mech_stores = {s for s, _ in drain(MECH)[0]}
check("a mechanic receives no purchases", "purchases" not in mech_stores)
check("a mechanic receives no vendors", "vendors" not in mech_stores)
check("a mechanic receives no fuel", "fuel" not in mech_stores)
check("a mechanic receives no gate checks with their selfies", "gatechecks" not in mech_stores)
off_stores = {s for s, _ in drain(OFF)[0]}
check("an office login receives no jobcards", "jobcards" not in off_stores)
check("an office login receives no ledger", "ledger" not in off_stores)
check("an office login receives no purchases", "purchases" not in off_stores)
cm_stores = {s for s, _ in drain(CM)[0]}
check("a crewmanager receives no purchases", "purchases" not in cm_stores)
check("a crewmanager receives no ledger", "ledger" not in cm_stores)
check("a crewmanager receives no stockmoves", "stockmoves" not in cm_stores)

print("\nA crew member's emergency and reference numbers are not for every login")
# They were not in _DRIVER_PRIVATE and so reached every role, conductors
# included (`03 §9.26`). The store check withholds a colleague's record outright
# for most roles now, so this is asserted on the one role that still receives
# other people's crew records whole-store: the office.
crew = rec("drivers", "d-1", name="Ramlal", userId="u-someone",
           emgName="Sita", emgPhone="9876500000", emgRelation="wife",
           refName="Hari", refPhone="9876511111", phone="9876522222",
           salaryMonthly=18000, license="RJ14-2019-0001")
for role in ROLES:
    if role in P.PII:
        continue
    out = S.redact_for({"id": "u-" + role, "role": role}, crew)
    if out is None:
        check("%-11s receives no colleague crew record at all" % role, True)
        continue
    d = out["data"]
    leaked = [f for f in ("emgPhone", "emgName", "emgRelation", "refName", "refPhone",
                          "phone", "salaryMonthly", "license") if f in d]
    check("%-11s receives a colleague's record without any of them%s"
          % (role, "" if not leaked else " -> " + ",".join(leaked)), not leaked)
    check("  %-9s and the partial copy is marked, so it is never pushed back" % role,
          d.get("_redacted") is True)
check("a PII role still receives the whole crew record",
      (S.redact_for({"id": "u-own", "role": "owner"}, crew) or {})["data"].get("emgPhone")
      == "9876500000")
check("and so does the person themselves",
      (S.redact_for({"id": "u-someone", "role": "driver"}, crew) or {})["data"].get("phone")
      == "9876522222")

print("\nOwn rows: its own row, not a colleague's — and the SQL did the narrowing")
for st, (field, roles) in sorted(P.OWN_ROWS_ONLY.items()):
    if not field:
        continue
    for role in sorted(roles):
        actor = {"id": "u-" + role, "role": role}
        if role not in P.read_roles(st):
            continue
        check("%-14s %-11s gets its own row" % (st, role),
              S.redact_for(actor, rec(st, "mine", **{field: actor["id"]})) is not None)
        check("%-14s %-11s does not get a colleague's" % (st, role),
              S.redact_for(actor, rec(st, "theirs", **{field: "u-somebody-else"})) is None)
print("…and the narrowing is in the query, not after it")
for st in ("attendance", "usage", "drivers", "trips", "gatechecks"):
    pred = P.own_rows_predicate(st, {"id": "u-d", "role": "driver"}, "sqlite")
    pg = P.own_rows_predicate(st, {"id": "u-d", "role": "driver"}, "postgres")
    if "driver" not in (P.OWN_ROWS_ONLY[st][1] or ()):
        continue
    check("%-11s is narrowed in SQLite" % st, bool(pred) and "json_extract" in pred[0])
    check("%-11s is narrowed in Postgres" % st, bool(pg) and "::jsonb->>" in pg[0])
check("a manager is not narrowed at all",
      P.own_rows_predicate("attendance", {"id": "u-own", "role": "owner"}) is None)
check("triplog is honestly post-filtered, because its owner is a bus",
      P.own_rows_predicate("triplog", {"id": "u-d", "role": "driver"}) is None)

print("\n`store=` cannot widen what a login receives")
page = S.pull(0, actor=CON, only=["purchases", "ledger", "gpsevents"])
check("a conductor asking for the money stores by name gets nothing", page["records"] == [])
check("…and its cursor does not move", page["maxRev"] == 0)
page = S.pull(0, actor={"id": "u-drv", "role": "driver"}, only=["attendance"])
check("a driver asking for attendance by name still gets only its own",
      all(r["data"].get("userId") == "u-drv" for r in page["records"]))

print("\nThe v1-compat rows, asserted present with the v1 route that needs each")
COMPAT = [
    ("ledger", "mechanic", "v1 store screen's movement trail (viewPartDetail)"),
    ("usage", "supervisor", "v1 supervisor's adoption screen (viewUsage)"),
    ("gatechecks", "driver", "v1 driver's `gate` route — their only screen"),
    ("gatechecks", "office", "the office's traced reviews (traceCtx -> gateChecks)"),
    ("trips", "driver", "v1 driver's trip-cash card (viewDriverHome)"),
    ("triplog", "driver", "v1 driver's stop arrivals"),
    ("rbservices", "driver", "v1 gate check's service picker (viewGate)"),
    ("components", "mechanic", "the mechanic's Store screen (viewPartDetail tracked pieces)"),
    ("parts", "crewmanager", "the crew manager's Components screen (viewComponentDetail)"),
    ("jobcards", "crewmanager", "the duty board (busesNeedingCrew -> inShopJobs/awayJobs)"),
    ("driverreports", "office", "People's crew detail (viewDriverDetail)"),
    ("driverreports", "crewmanager", "People's crew detail (viewDriverDetail)"),
    ("dutylog", "office", "the office's traced reviews (traceCtx -> crewAt)"),
    ("reportai", "crewmanager", "People's crew detail (viewDriverDetail reportAiLine)"),
]
for st, role, why in COMPAT:
    check("%-14s -> %-11s  %s" % (st, role, why),
          role in P.V1_COMPAT_READ.get(st, frozenset()))
# A compat row has to BUY something, or deleting it at cutover would close
# nothing and somebody would delete it thinking it had. There are two kinds and
# contract §9(b) names both: a whole-store grant the v2 matrix withholds, and —
# for `usage` → supervisor — an exemption from the own-row narrowing, because
# v1's adoption screen counts everybody's taps and v2 asks for owner-only.
_idle = []
for _st, _rs in P.V1_COMPAT_READ.items():
    for _r in _rs:
        if _r not in P.STORE_READ_ROLES.get(_st, frozenset()):
            continue                      # a real store-level grant
        _field, _roles = P.OWN_ROWS_ONLY.get(_st) or (None, ())
        if _field and _r not in _roles:
            continue                      # exempt from the narrowing: also a grant
        _idle.append((_st, _r))
check("every compat row grants something the v2 matrix withholds%s"
      % ("" if not _idle else " -> idle " + ",".join("%s/%s" % x for x in _idle)), not _idle)
check("the compat table holds exactly the rows listed above",
      sorted((st, r) for st, rs in P.V1_COMPAT_READ.items() for r in rs)
      == sorted((st, r) for st, r, _ in COMPAT))

print("\nFour stores no client has an object store for reach nobody at all")
for st in ("aimeta", "gpslive", "odometerlogs", "waconv"):
    check("%-13s reaches no role, the owner included" % st, not P.read_roles(st))

print("\nHISTORY_ROLES never withholds a store the matrix allows")
for st, roles in S.HISTORY_ROLES.items():
    extra = sorted(set(roles) - P.read_roles(st))
    check("%-11s history roles are a subset of the read matrix%s"
          % (st, "" if not extra else " -> " + ",".join(extra)), not extra)

print("\nRESULT: " + ("ALL PASS" if not fails else "%d FAILED -> %s" % (len(fails), fails)))
sys.exit(1 if fails else 0)

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

# Three different ids hide behind one login, and `OWN_ROWS_SUBJECT` says which
# each store's ownership field holds. An actor for a restricted role therefore
# has to carry all three, exactly as `pull()` resolves them from the crew bank
# before it builds its predicate -- a bare token dict owns nothing and is denied,
# which is the safe direction and is asserted further down.
CREW = {r: "own-drivers-" + r for r in ROLES}      # the crew-bank record below
BUS = {r: "bus-" + r for r in ROLES}


def actor_for(role):
    return {"id": "u-" + role, "role": role, "crewId": CREW[role], "busId": BUS[role]}


def subject_value(store, role):
    """What this role's own row of `store` must carry in its ownership field."""
    return {"user": "u-" + role, "crew": CREW[role],
            "bus": BUS[role]}[P.OWN_ROWS_SUBJECT.get(store, "user")]

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
    actor = actor_for(role)
    never = S._never_for(actor)
    leaked, unskipped, lost = [], [], []
    for st in STORES:
        allowed = role in P.read_roles(st)
        # A record belonging to SOMEBODY ELSE, so an own-rows store is judged on
        # the store rule and not accidentally on ownership.
        other = rec(st, "r-" + st, userId="u-nobody", _createdBy="u-nobody",
                    driverId="d-nobody", busId="bus-nobody")
        got = S.redact_for(actor, other) is not None
        if not allowed:
            if got:
                leaked.append(st)
            if st not in never:
                unskipped.append(st)
        else:
            # And the other direction, which is the half that keeps the office
            # working: an entitled store must still arrive. Own-rows stores are
            # asked with the actor's OWN row, keyed on whichever of the three ids
            # that store's field actually holds.
            field = (P.OWN_ROWS_ONLY.get(st) or (None, ()))[0]
            if role in (P.OWN_ROWS_MEMBER.get(st) or ()):
                # "Mine" on a membership store is a row this role is ON. Handing
                # it `other` here would assert that a mechanic still receives a
                # card belonging to nobody, which is the leak, not the rule.
                mine = rec(st, "m-" + st, assignees=[{"userId": "u-" + role, "task": ""}])
            elif field is None:
                mine = other
            else:
                mine = rec(st, "m-" + st, **{field: subject_value(st, role)})
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
          S.redact_for(actor_for(role), rec("notastore", "x-1")) is None)

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
        rid = "own-%s-%s" % (st, role)
        row = {"id": rid, "at": now, "updatedAt": now, field: subject_value(st, role)}
        # `own-drivers-<role>` doubles as the role's crew-bank record, so the
        # crew and bus ids `pull()` resolves for itself are the same ones this
        # file seeded its trips, stop arrivals and routes under. Without that the
        # drain below would be testing two different identities against each
        # other and would pass for the wrong reason.
        if st == "drivers":
            row["busId"] = BUS[role]
        rev = S._upsert_record(c, st, rid, row, now, rev)
# The wall that made a new phone's first sync crawl: the records a driver
# actually needs sit behind thousands of rows it may never see.
for i in range(2000):
    rev = S._upsert_record(c, "gpsevents", "g%d" % i, {"id": "g%d" % i, "at": now, "updatedAt": now}, now, rev)
for st in ("jobcards", "buses", "drivers"):
    rev = S._upsert_record(c, st, "late-" + st,
                           {"id": "late-" + st, "at": now, "updatedAt": now, "userId": "u-nobody"}, now, rev)
# Job cards each MEMBER role is actually on, in both shapes the rule accepts,
# plus the one it must refuse. Without these the narrowing below would be tested
# in one direction only -- "the mechanic stopped receiving cards" passes just as
# well when the mechanic receives NOTHING, which is the blank screen this
# project has shipped before and the reason these three rows exist.
for role in sorted(P.OWN_ROWS_MEMBER.get("jobcards", ())):
    rev = S._upsert_record(c, "jobcards", "mine-assignees-" + role,
                           {"id": "mine-assignees-" + role, "at": now, "updatedAt": now,
                            "assignees": [{"userId": "u-" + role, "task": ""}]}, now, rev)
    # The pre-multi-mechanic shape: no `assignees`, one `assignedTo`. A card
    # written before that feature must still have a crew of one.
    rev = S._upsert_record(c, "jobcards", "mine-legacy-" + role,
                           {"id": "mine-legacy-" + role, "at": now, "updatedAt": now,
                            "assignedTo": "u-" + role}, now, rev)
    # Reassigned away, with a stale `assignedTo` left behind. `assignees` wins
    # when it has anything, so this one is NOT theirs -- the ordered fallback,
    # which is the half of the rule a combined OR would get wrong.
    rev = S._upsert_record(c, "jobcards", "reassigned-away-" + role,
                           {"id": "reassigned-away-" + role, "at": now, "updatedAt": now,
                            "assignees": [{"userId": "u-somebody-else", "task": ""}],
                            "assignedTo": "u-" + role}, now, rev)
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
        # Membership stores: "mine" is a list, not a column (`jobcards`). The
        # two cards this role is on and not the three that belong to others.
        if role in (P.OWN_ROWS_MEMBER.get(st) or ()):
            want.add((st, "mine-assignees-" + role))
            want.add((st, "mine-legacy-" + role))
            continue
        field, roles = P.OWN_ROWS_ONLY.get(st) or (None, ())
        restricted = bool(field) and role in roles
        if restricted:
            want.add((st, "own-%s-%s" % (st, role)))
            continue          # every seeded row above belongs to somebody else
        want.add((st, "seed-" + st))
        if field:
            want |= {(st, "own-%s-%s" % (st, r)) for r in ROLES}
        # A role this membership store does not narrow is owed every member's
        # cards as well -- the storekeeper issues a part against any card, and
        # the workshop runs on seeing all of them.
        for r in sorted(P.OWN_ROWS_MEMBER.get(st) or ()):
            want |= {(st, "mine-assignees-" + r), (st, "mine-legacy-" + r),
                     (st, "reassigned-away-" + r)}
        if st in ("jobcards", "buses", "drivers"):
            want.add((st, "late-" + st))
        if st == "gpsevents":
            want |= {("gpsevents", "g%d" % i) for i in range(2000)}
    return want


# Drained with a BARE token -- `{id, role}`, which is all `/pull` ever receives.
# `pull()` has to resolve the crew and bus ids for itself; handing them to it
# here would skip the very step whose absence emptied the trip-cash card, and an
# earlier version of this file did exactly that and stayed green when the
# resolution was removed.
for role in ROLES:
    actor = {"id": "u-" + role, "role": role}
    got, pages = drain(actor)
    want = entitled(actor_for(role))
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
CON = actor_for("conductor")
MECH = actor_for("mechanic")
OFF = actor_for("office")
CM = actor_for("crewmanager")
DRV = actor_for("driver")
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
check("an office login receives no gate passes", "gatepasses" not in off_stores)
check("a mechanic receives no gate passes", "gatepasses" not in mech_stores)
cm_stores = {s for s, _ in drain(CM)[0]}
check("a crewmanager receives no purchases", "purchases" not in cm_stores)
check("a crewmanager receives no ledger", "ledger" not in cm_stores)
check("a crewmanager receives no stockmoves", "stockmoves" not in cm_stores)
# Decision 3 (outside repair): whoever may send a unit out may paper it, so the
# slip is read by the crew manager and the storekeeper too. Spelled out as an
# exact set, in both directions, rather than read off the table.
check("a crewmanager receives gate passes", "gatepasses" in cm_stores)
check("gatepasses are read by exactly owner, supervisor, store and crewmanager",
      set(P.read_roles("gatepasses")) == {"owner", "supervisor", "store", "crewmanager"})
check("...and not by a mechanic, an office login or a gate-only role",
      not ({"mechanic", "office", "driver", "conductor"} & set(P.read_roles("gatepasses"))))

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
    out = S.redact_for(actor_for(role), crew)
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
    for role in sorted(roles):
        if role not in P.read_roles(st):
            continue
        actor = actor_for(role)
        check("%-14s %-11s gets its own row" % (st, role),
              S.redact_for(actor, rec(st, "mine",
                                      **{field: subject_value(st, role)})) is not None)
        check("%-14s %-11s does not get a colleague's" % (st, role),
              S.redact_for(actor, rec(st, "theirs", **{field: "somebody-else"})) is None)

print("\nMembership: a job card's crew is a LIST, and a mechanic sees only their own")
# Spelled out rather than read off the map, for the same reason as NARROWED
# below: a store dropped from OWN_ROWS_MEMBER must fail here rather than quietly
# take its own checks with it.
MEMBER = {"jobcards": ["mechanic"]}
check("the membership map holds exactly these stores%s"
      % ("" if sorted(P.OWN_ROWS_MEMBER) == sorted(MEMBER)
         else " -> gone: " + ",".join(sorted(set(MEMBER) - set(P.OWN_ROWS_MEMBER)))),
      sorted(P.OWN_ROWS_MEMBER) == sorted(MEMBER))
for _st, _roles in sorted(MEMBER.items()):
    check("%s narrows exactly %s" % (_st, ",".join(_roles)),
          sorted(P.OWN_ROWS_MEMBER.get(_st) or ()) == sorted(_roles))
    for _role in _roles:
        a = actor_for(_role)
        check("%-14s %-11s gets a card it is on by `assignees`" % (_st, _role),
              S.redact_for(a, rec(_st, "mine", assignees=[{"userId": "u-" + _role}])) is not None)
        check("%-14s %-11s gets a pre-multi-mechanic card by `assignedTo`" % (_st, _role),
              S.redact_for(a, rec(_st, "legacy", assignedTo="u-" + _role)) is not None)
        check("%-14s %-11s gets a card naming it among several" % (_st, _role),
              S.redact_for(a, rec(_st, "shared", assignees=[
                  {"userId": "u-other"}, {"userId": "u-" + _role}])) is not None)
        check("%-14s %-11s does NOT get a colleague's card" % (_st, _role),
              S.redact_for(a, rec(_st, "theirs", assignees=[{"userId": "u-other"}])) is None)
        check("%-14s %-11s does NOT get a card with no crew at all" % (_st, _role),
              S.redact_for(a, rec(_st, "nobody")) is None)
        # The ordered fallback, which is the half a combined OR gets wrong: the
        # card was reassigned and a stale `assignedTo` was left behind.
        check("%-14s %-11s does NOT get a card reassigned away from it" % (_st, _role),
              S.redact_for(a, rec(_st, "stale", assignees=[{"userId": "u-other"}],
                                  assignedTo="u-" + _role)) is None)
        # And the SQL filter in front of the backstop must be a SUPERSET, never
        # tighter: the one card they disagree on has to survive the query so the
        # backstop is the thing that drops it.
        _frag, _args = P.member_rows_predicate(_st, a, "sqlite")
        check("%-14s %-11s the query filter is looser than the rule, not tighter" % (_st, _role),
              "assignedTo" in _frag and "assignees" in _frag)
for _role in sorted(set(ROLES) - {"mechanic"}):
    if _role not in P.read_roles("jobcards"):
        continue
    check("jobcards      %-11s is not narrowed and keeps every card" % _role,
          S.redact_for(actor_for(_role),
                       rec("jobcards", "any", assignees=[{"userId": "u-mechanic"}])) is not None)

print("…and the narrowing is in the query for EVERY one of them, not after it")
# Spelled out rather than read off OWN_ROWS_ONLY, so a store dropped from the map
# fails here instead of quietly dropping its own check with it.
NARROWED = ["attendance", "usage", "drivers", "driverreports", "trips", "triplog",
            "routes", "gatechecks"]
check("the own-rows map holds exactly these stores%s"
      % ("" if sorted(P.OWN_ROWS_ONLY) == sorted(NARROWED)
         else " -> gone: " + ",".join(sorted(set(NARROWED) - set(P.OWN_ROWS_ONLY)))),
      sorted(P.OWN_ROWS_ONLY) == sorted(NARROWED))
for st in NARROWED:
    if st not in P.OWN_ROWS_ONLY:
        continue                      # already named by the check above
    role = sorted(P.OWN_ROWS_ONLY[st][1])[0]
    a = actor_for(role)
    pred = P.own_rows_predicate(st, a, "sqlite")
    pg = P.own_rows_predicate(st, a, "postgres")
    check("%-14s is narrowed in SQLite" % st, bool(pred) and "json_extract" in pred[0])
    check("%-14s is narrowed in Postgres" % st, bool(pg) and "::jsonb->>" in pg[0])
    check("%-14s binds the id its field actually holds" % st,
          pred[1] == [subject_value(st, role)])
check("a manager is not narrowed at all",
      P.own_rows_predicate("attendance", actor_for("owner")) is None)

print("\nAnd an actor with no identity for the subject is DENIED, never widened")
# The first version of this file keyed `trips` on the login id while app.js
# writes the crew id, so the predicate matched nothing and a v1 driver's
# trip-cash card came up empty. The same class of mistake with a NULL field used
# to return "no narrowing", which is the opposite failure: every bus's stop times
# to every driver. Both directions are nailed down here.
BARE = {"id": "u-driver", "role": "driver"}
for st in ("trips", "triplog", "routes"):
    pred = P.own_rows_predicate(st, BARE, "sqlite")
    check("%-14s a bare token with no crew record matches no rows (never None)" % st,
          pred is not None and pred[0] == "1 = 0" and pred[1] == [])
    check("%-14s …and the per-record backstop denies too" % st,
          P.own_row_ok(st, BARE, {"id": "x", "driverId": "d1", "busId": "bus-1"}) is False)
check("trips is keyed on the CREW id, which is what app.js writes",
      P.OWN_ROWS_ONLY["trips"][0] == "driverId"
      and P.OWN_ROWS_SUBJECT["trips"] == "crew")
check("…so a trip carrying the login id in driverId is NOT the driver's own",
      S.redact_for(DRV, rec("trips", "t-wrong", driverId="u-driver")) is None)
check("…and one carrying their crew id is",
      S.redact_for(DRV, rec("trips", "t-right", driverId=CREW["driver"])) is not None)
check("triplog and routes are keyed on the BUS",
      P.OWN_ROWS_SUBJECT["triplog"] == "bus" and P.OWN_ROWS_SUBJECT["routes"] == "bus")
check("…so a stop arrival for another bus is withheld",
      S.redact_for(DRV, rec("triplog", "tl-other", busId="bus-other")) is None)
check("…and the driver's own bus's arrival is not",
      S.redact_for(DRV, rec("triplog", "tl-mine", busId=BUS["driver"])) is not None)

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
    ("routes", "driver", "captureArrivals, via startRouteMonitor on every login"),
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

print("\nThe driver's four screens, each checked against what they actually read")
drv_got, _ = drain(DRV)
check("the trip-cash card on their home has its trips",
      ("trips", "own-trips-driver") in drv_got)
check("…and not a colleague's", ("trips", "seed-trips") not in drv_got)
check("their stop arrivals arrive, for their own bus",
      ("triplog", "own-triplog-driver") in drv_got)
check("…and not another bus's", ("triplog", "seed-triplog") not in drv_got)
# `captureArrivals` returns early unless `routeForBus(bus.id)` finds a route, and
# `startRouteMonitor` runs on every login — so without this the driver's phone
# holds the triplog write role and produces not one line.
check("the route those arrivals are measured against arrives too",
      ("routes", "own-routes-driver") in drv_got)
check("…and only for their own bus", ("routes", "seed-routes") not in drv_got)
check("their gate check arrives — their only route in v1",
      ("gatechecks", "own-gatechecks-driver") in drv_got)
check("…and not a colleague's", ("gatechecks", "seed-gatechecks") not in drv_got)
check("the service picker that gate check needs arrives",
      ("rbservices", "seed-rbservices") in drv_got)

print("\nAnd the server resolves those ids itself, from the crew bank")
# Without this, every check above could be satisfied by a test that kindly handed
# the server the answer. `/pull` gets a token holding a login id and nothing else.
_bare_drv = {"id": "u-driver", "role": "driver"}
_sc = S._scoped_actor(S.db(), _bare_drv)
check("pull() turns a login id into the crew id app.js writes",
      _sc.get("crewId") == CREW["driver"])
check("…and into the bus its stop arrivals and route are keyed on",
      _sc.get("busId") == BUS["driver"])
check("a role with no own-rows subject is left alone, so nothing is read for it",
      S._scoped_actor(S.db(), {"id": "u-owner", "role": "owner"}) == {"id": "u-owner", "role": "owner"})
check("every store with a subject is a store the map actually narrows",
      not sorted(set(P.OWN_ROWS_SUBJECT) - set(P.OWN_ROWS_ONLY)))

_bare_got, _ = drain(_bare_drv)
check("so a bare driver token still receives its own trips",
      ("trips", "own-trips-driver") in _bare_got)
check("…its own bus's stop arrivals", ("triplog", "own-triplog-driver") in _bare_got)
check("…and its own bus's route", ("routes", "own-routes-driver") in _bare_got)
check("…and still not a colleague's trips", ("trips", "seed-trips") not in _bare_got)

print("\nAnd it notices when somebody is moved to another bus")
# The resolution is memoised on the crew store's own (count, max rev), because
# /pull runs every four seconds on every device. A memo that never invalidated
# would keep a reassigned driver on their old bus's stop times and route for the
# life of the container — a staleness bug with no symptom but wrong data.
_mc = S.db()
_mrev = _mc.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()[0]
_mrev = S._upsert_record(_mc, "drivers", CREW["driver"],
                         {"id": CREW["driver"], "userId": "u-driver",
                          "busId": "bus-moved", "at": now, "updatedAt": now}, now, _mrev)
_mrev = S._upsert_record(_mc, "routes", "rt-moved",
                         {"id": "rt-moved", "busId": "bus-moved", "at": now,
                          "updatedAt": now}, now, _mrev)
_mc.commit()
_mc.close()
check("the crew read notices the new bus",
      S._scoped_actor(S.db(), _bare_drv).get("busId") == "bus-moved")
_moved_got, _ = drain(_bare_drv)
check("…so the route of the bus they are on now arrives",
      ("routes", "rt-moved") in _moved_got)
check("…and the one they left does not",
      ("routes", "own-routes-driver") not in _moved_got)

print("\nA gate check the driver really pushed comes back to them")
# Not a seeded row: the client never writes `userId`, the SERVER stamps it on a
# driver create (same commit as the store), so a check pushed through the app
# always carries it. Diagnosing this from demo rows that no driver ever pushed
# reads as a boundary bug and is not one, so the round trip is asserted here
# rather than left to a fixture.
_c = S.db()
_rev = _c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()[0]
_rev = S._upsert_record(_c, "drivers", "crew-gc",
                        {"id": "crew-gc", "name": "Gate Driver", "userId": "u-gcdrv",
                         "busId": "bus-gc", "updatedAt": now}, now, _rev)
_c.commit()
_c.close()
GCDRV = {"id": "u-gcdrv", "role": "driver"}
_r = S.push([{"store": "gatechecks", "id": "gc-live",
              "data": {"id": "gc-live", "busId": "bus-gc", "driverId": "crew-gc",
                       "driverName": "Gate Driver", "status": "open",
                       "startedAt": now, "date": "2026-11-05", "items": {}},
              "updatedAt": now}], GCDRV)
check("the push is accepted", _r["applied"] == 1 and not _r["refused"])
_gc = [x for x in S.pull(0, actor=GCDRV)["records"] if x["store"] == "gatechecks"]
check("the server stamped userId from the token, so the client never has to",
      any(x["id"] == "gc-live" and x["data"].get("userId") == "u-gcdrv" for x in _gc))
check("and the driver who pushed it receives it back",
      any(x["id"] == "gc-live" for x in _gc))
check("…while another driver does not",
      not [x for x in S.pull(0, actor=DRV)["records"]
           if x["store"] == "gatechecks" and x["id"] == "gc-live"])

print("\nThe office keeps the one field its screen is computed from")
# `rvBoard()` in app.js is `parseLocal(r.boardAt || r.doj)`, and every "last N
# days" filter, every crew scorecard and the review trace are computed from it.
# Stripping both left the office — the only login whose entire purpose is this
# screen — reading "Last 7 days 0, — average" with every review dated "—".
_rv = rec("rbreviews", "rv-1", pnr="PNR123", tin="T1", seats=["1A"], fare=900,
          amount=900, boardAt="2026-11-01 21:30", doj="2026-11-01",
          rating=1, comment="late", source="Jaipur", dest="Delhi")
_off = (S.redact_for(OFF, _rv) or {}).get("data") or {}
check("the office receives the boarding time", _off.get("boardAt") == "2026-11-01 21:30")
check("…and the date of journey", _off.get("doj") == "2026-11-01")
check("…and the rating and the words, which is the screen", _off.get("rating") == 1)
for _f in ("pnr", "tin", "seats", "fare", "amount"):
    check("but not the %-6s — the PNR is the booking credential, not the date" % _f,
          _f not in _off)
check("and the partial copy is still marked", _off.get("_redacted") is True)
check("a crew manager still gets the whole review",
      (S.redact_for(CM, _rv) or {})["data"].get("pnr") == "PNR123")
for _role in ("driver", "conductor", "store", "mechanic"):
    check("%-10s still receives no reviews at all" % _role,
          S.redact_for(actor_for(_role), _rv) is None)

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

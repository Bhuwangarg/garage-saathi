#!/usr/bin/env python3
"""The read boundary, as data rather than as code.

`redact_for` used to name the stores it withheld and return everything else to
every authenticated role, so a `conductor` token -- which holds zero
capabilities in `PERMS` and reaches zero routes in v1 -- could `/pull` supplier
bills, purchases, the vendor registry, parts, the stock ledger, job-card costs,
fuel, driver trip cash, challan liabilities, garage settings, all-staff
attendance and gate checks with their selfies (`LIVE-ISSUES.md` issue 2).
Hiding a screen in `PERMS` changed nothing about what that token could
download, which is why v2's permission model was cosmetic until this moved.

So the rule inverts: **a store absent from the table below is sent to nobody.**

This file is separate from the server for one reason: the matrix should be
readable as data by somebody who is not reading a 6,000-line module, and it is
the file the owner edits at cutover to delete the six `v1-compat` rows
(contract §9b). `_never_for` and `redact_for` are both DERIVED from it; neither
restates a rule, because two copies of the same rule are how they drift apart.

The asymmetry that `_never_for`'s docstring warns about still holds: naming one
store too few in the SQL skip costs a little reading, while naming one too many
means every device with that role silently never receives it. Deriving both from
one table removes the chance of the two disagreeing, which is the whole point.
"""

ALL_ROLES = frozenset({"owner", "supervisor", "crewmanager", "office",
                       "store", "mechanic", "driver", "conductor"})
MANAGERS = frozenset({"owner", "supervisor"})
# The three roles that may hold a crew member's documents, phone and salary.
# PII_ROLES stops being a read-AUTHORISATION set in v2 and becomes only the
# field-redaction set (contract §1.1, §3.3a).
PII = frozenset({"owner", "supervisor", "crewmanager"})
WORKSHOP = frozenset({"owner", "supervisor", "store", "mechanic"})
STOREROOM = frozenset({"owner", "supervisor", "store"})
# The people who read what a passenger said and act on it.
REVIEWERS = frozenset({"owner", "supervisor", "crewmanager", "office"})


# What the v2 screens entitle a role to, derived from `v2-ux.md` §4.1/§4.2 and
# written down in contract §3.3. DENY BY DEFAULT: a store that is not a key here
# and not a key in V1_COMPAT_READ reaches nobody at all, which is the property
# that makes a new store (`nightlist`) safe to add.
STORE_READ_ROLES = {
    "users":         ALL_ROLES,            # the login roster; names on every screen
    "meta":          ALL_ROLES,            # geofence + late cutoff for check-in; money fields stripped below manager
    "buses":         ALL_ROLES,            # the bus picker on Me's "something is wrong with my bus"
    # Every role's Me screen reads its OWN crew record, and every role reaches
    # its own document locker from it (contract §12 hands all eight roles three
    # upload paths into this store). Contract §3.3 listed six roles and the
    # omission would have blanked Me for a storekeeper and a mechanic -- see
    # OWN_ROWS_ONLY, which is what keeps a colleague's record out of it.
    "drivers":       ALL_ROLES,
    "parts":         WORKSHOP,
    "jobcards":      WORKSHOP,
    "ledger":        STOREROOM,
    "purchases":     STOREROOM,
    "vendors":       STOREROOM,
    "audits":        STOREROOM,
    "stockmoves":    STOREROOM,
    "components":    STOREROOM | {"crewmanager"},
    "def":           STOREROOM | {"crewmanager"},
    "fuel":          STOREROOM | {"crewmanager"},
    # Managers see the whole roll; everybody else sees their own rows only, in
    # SQL. ~100 people x 2 x 365 rows a year is exactly the volume §3.4 exists
    # to keep off a driver's phone.
    "attendance":    ALL_ROLES,
    "usage":         ALL_ROLES,
    "incidents":     REVIEWERS,
    "driverreports": WORKSHOP | {"driver", "conductor"},
    "routes":        MANAGERS,
    "triplog":       MANAGERS,
    "trips":         MANAGERS,
    "challans":      MANAGERS,
    "breakdowns":    MANAGERS,
    # "gatepasses" is assigned from "components" below the table (PAPER_FOLLOWS_UNIT).
    "gatechecks":    frozenset({"owner", "supervisor", "crewmanager"}),
    "dutylog":       frozenset({"owner", "supervisor", "crewmanager"}),
    "nightlist":     frozenset({"owner", "supervisor", "crewmanager"}),   # new, contract §5
    "gpsevents":     MANAGERS,
    "rbservices":    REVIEWERS,            # holds no names: it is the service picker
    "rbreviews":     PII | {"office"},     # office copy has the passenger stripped
    "rbcomplaints":  PII | {"office"},
    "rbassign":      REVIEWERS,
    "rbreviewai":    REVIEWERS,
    "rbalias":       REVIEWERS,            # the office displays traced reviews
    "rbaliasai":     PII,                  # the name queue is `manageDrivers`
    "itslookup":     MANAGERS,             # carries a PNR, a seat and a fare
    "gateai":        MANAGERS,
    # Contract §3.3 puts these two at "owner, sup, store — unchanged". Both
    # halves are wrong and `test_core_ai.py` already said so: a store phone is
    # NOT sent Claude's reading of a returned old part today, and no screen a
    # storekeeper can reach asks for it (`coreAiOf` is only reached through
    # viewJobDetail's core-return card, which is owner/supervisor work). Granting
    # it would be a widening dressed as a tidy-up, so these stay with the two
    # roles that act on them.
    "coreai":        MANAGERS,
    "reportai":      MANAGERS,
    "coachai":       PII,                  # crew read their own through /my/coaching
    "crewnotes":     REVIEWERS,            # never reaches its subject
    "digest":        MANAGERS,             # the Monday summary carries money
    # Four stores no client has ever had an object store for. They were being
    # sent to somebody and discarded, which is bandwidth on a yard phone.
    "aimeta":        frozenset(),          # the open review batch: server bookkeeping
    "gpslive":       frozenset(),          # never was a client store
    "odometerlogs":  frozenset(),          # not in any client's STORES
    "waconv":        frozenset(),          # keyed by a crew member's phone number
}

# "Whoever may send a unit out may paper it" -- the owner's decision 3, as one
# rule rather than as two lists that happen to match. The slip is read by exactly
# the roles that read the piece it papers, so the second key is the SAME object as
# the first and the two cannot drift. Before this the slip was storeroom-only and a
# crew manager, who can send a piece out, could not read the paper for it.
PAPER_FOLLOWS_UNIT = ("gatepasses", "components")
STORE_READ_ROLES[PAPER_FOLLOWS_UNIT[0]] = STORE_READ_ROLES[PAPER_FOLLOWS_UNIT[1]]

# The card fields only a manager may change on a job card (contract 6.1).
# `gatePassNo`/`gatePassId` are deliberately NOT here: the piece door sets them.
OUTSIDE_CARD_FIELDS = frozenset({
    "outside", "outsideCity", "outsideLat", "outsideLng", "externalVendor",
    "externalCost", "enterAt", "outAt", "billPhotos", "closeNoBillReason"})


def may_set_outside(role):
    """THE single place that decides who may mark a bus away or set outside cost.

    The write guard consumes this rather than restating it: two copies of a
    permission rule are how they drift apart."""
    return role in MANAGERS


def assert_write_roles_follow(write_roles):
    """Raise if the slip's write roles and the piece's write roles have drifted.

    The read side cannot drift (one object). The write side lives in the server's
    WRITE_ROLES, so it is checked here, at import, where a failure is loud."""
    paper, unit = PAPER_FOLLOWS_UNIT
    if paper not in write_roles or unit not in write_roles:
        raise RuntimeError("WRITE_ROLES must name both %s and %s" % (paper, unit))
    a, b = set(write_roles[paper]), set(write_roles[unit])
    if a != b:
        raise RuntimeError(
            "%s write roles differ from %s: only-%s=%s only-%s=%s" % (
                paper, unit, paper, sorted(a - b), unit, sorted(b - a)))


# The rows that exist ONLY because a live v1 screen reads the store. Deleting one
# closes a hole and costs a screen, so deleting one is the cutover and it is the
# owner's call (contract §9b). Each row names the v1 route that needs it, because
# a row with no reason attached is a row nobody dares delete.
#
# Every one of these was checked against `app.js` itself rather than against the
# inventory's route lists: for each of the eight roles, which stores the screens
# it can actually reach read from `S.cache`. Nine of them were found that way and
# are marked [audit]; without them a live v1 screen would have gone blank or
# silently started lying, which is a worse bug than the one this file fixes.
V1_COMPAT_READ = {
    # v1's store screen shows a part's movement trail, and `store` is one of the
    # five routes a mechanic has. Blanking it is a live regression.
    "ledger":        frozenset({"mechanic"}),                 # app.js viewPartDetail, route `store`
    # v1's `usage` route is a supervisor route; `ux §4.1 #5` and `§4.3` ask for
    # owner-only, so this row is the one the UX doc wants gone.
    "usage":         frozenset({"supervisor"}),               # app.js viewUsage, route `usage`
    # The four driver rows below are per-record "own rows" grants, not
    # whole-store ones (see OWN_ROWS_ONLY), so a v1 driver still never receives a
    # colleague's trip cash or gate selfie.
    "gatechecks":    frozenset({"driver", "office"}),         # app.js viewGate (driver's only route); viewOfficeHome/viewReviews trace [audit]
    "trips":         frozenset({"driver"}),                   # app.js viewDriverHome, the trip-cash card
    "triplog":       frozenset({"driver"}),                   # app.js driver stop arrivals
    # [audit] And the route those arrivals are measured against. `startRouteMonitor`
    # runs on EVERY signed-in login (only the at-risk toast is gated on
    # `manageRoutes`), and `captureArrivals` returns early unless
    # `routeForBus(bus.id)` finds a route — so granting `triplog` without
    # `routes` gives a driver's phone the write role and the read row for a log
    # it can no longer produce a single line of. Narrowed to the driver's own bus,
    # which is all `routeForBus` ever asks for and all their `triplog` write
    # guard permits.
    "routes":        frozenset({"driver"}),                   # app.js captureArrivals via startRouteMonitor
    "rbservices":    frozenset({"driver"}),                   # app.js viewGate, the service picker
    # [audit] The mechanic's Store screen. viewPartDetail renders a "Tracked
    # pieces" card for any rotable, and `componentsOfPart` reads this store
    # unguarded -- so a tyre's history disappears from the mechanic's view.
    "components":    frozenset({"mechanic"}),                 # app.js viewPartDetail, route `store`
    # [audit] The crew manager's Components screen. viewComponentDetail reads
    # `byId(S.cache.parts, c.partId)` unguarded to name the piece's source part.
    "parts":         frozenset({"crewmanager"}),              # app.js viewComponentDetail, route `components`
    # [audit] The duty board. `busesNeedingCrew` subtracts `inShopJobs` and
    # `awayJobs` from the fleet, so without job cards every bus looks available
    # and the board offers crew for a bus that is in the workshop.
    "jobcards":      frozenset({"crewmanager"}),              # app.js viewCrewManagerHome, route `home`
    # [audit] People. viewDriverDetail lists the reports filed against a crew
    # member's bus; both roles reach it through `crewPerf`.
    "driverreports": frozenset({"office", "crewmanager"}),    # app.js viewDriverDetail, route `drivers`
    # [audit] The office's traced reviews are its whole job, and `traceCtx`'s
    # `crewAt` resolves "who was on that bus that night" out of the duty log. No
    # duty log means every traced review names nobody.
    "dutylog":       frozenset({"office"}),                   # app.js traceCtx via viewOfficeHome/viewReviews
    # [audit] viewDriverDetail's `reportAiLine` reads Claude's draft job card for
    # a crew member's report. A crew manager receives this store today.
    "reportai":      frozenset({"crewmanager"}),              # app.js viewDriverDetail, route `drivers`
}

# Four stores are "own rows only" for some roles, and the narrowing happens in
# SQL rather than after the page is read. `attendance` alone grows ~100 people
# x 2 x 365 rows a year, and handing a driver's phone the whole table so it can
# drop 99% of it recreates exactly the bug `_never_for` was written to cure: a
# new device spending its first sync on pages that redaction empties.
#
# {store: (json field holding the owner, roles restricted to their own rows)}
OWN_ROWS_ONLY = {
    "attendance":    ("userId",      ALL_ROLES - MANAGERS),
    # The supervisor's compat row above is a whole-store grant: v1's adoption
    # screen counts everybody's taps. Everyone else sees one row, which is also
    # what makes §4.4's additive merge safe.
    "usage":         ("userId",      ALL_ROLES - MANAGERS),
    "drivers":       ("userId",      frozenset({"store", "mechanic", "driver", "conductor"})),
    "driverreports": ("_createdBy",  frozenset({"driver", "conductor"})),
    "trips":         ("driverId",    frozenset({"driver"})),
    "triplog":       ("busId",       frozenset({"driver"})),
    "routes":        ("busId",       frozenset({"driver"})),
    "gatechecks":    ("userId",      frozenset({"driver"})),
}

# WHICH IDENTITY each ownership field above holds. Getting this wrong is silent
# in the worst way: the predicate simply never matches, every row is withheld,
# and the screen is blank with no error anywhere.
#
# It is easy to get wrong because the three ids look alike in a token. A login id
# (`u-d1`) is what `attendance.userId`, `usage.userId`, `drivers.userId` and
# `driverreports._createdBy` hold. A CREW-BANK id (`d1`) is what
# `trips.driverId` holds -- `saveStartTrip` in app.js writes `driverId` from
# `data-driver="${esc(d.id)}"`, where `d` is the crew record, and the server's own
# write guard agrees (`data.get("driverId") != crew.get("id")`). A BUS id is what
# `triplog.busId` and `routes.busId` hold.
#
# `trips` was keyed on the login id in the first version of this file, so a v1
# driver received none of their own trips and the trip-cash card on their home
# screen -- one of the four screens that login has -- came up empty.
# ---------------------------------------------------------------------------
# Membership, for a store whose "mine" is a LIST and not a column.
#
# `OWN_ROWS_ONLY` above narrows on one scalar field, which is every store but
# one. A job card's crew is `assignees[].userId`, falling back to the single
# `assignedTo` on cards written before multi-mechanic jobs — so it fits no
# `(field, roles)` pair, and that is the whole reason `jobcards` was never in
# the map and a mechanic received every card in the fleet. `02 §4.3` says a
# mechanic must never see another mechanic's card and `02 §6.2` records that it
# leaked once already; REV-AUTH verified a second mechanic's token pulling all
# three cards on both read paths, hours and `externalCost` included.
#
# Only the mechanic is narrowed. `store` keeps every card on purpose: the
# storekeeper issues a part against a chosen card (`v2-ux.md §4` row 3, "store
# (read)"), and owner and supervisor run the workshop.
OWN_ROWS_MEMBER = {
    "jobcards": frozenset({"mechanic"}),
}


def job_crew_ids(rec):
    """User ids on a job card: `assignees` if it has any, else `assignedTo`.

    THE one definition. `app.js`'s `jobCrew()` and `v2/screens/jobcard.js` are
    the client's copies of the same rule and `sync_server.py`'s `_job_crew`
    delegates here, because the write guard that refuses "you are not on this
    job" and the read rule that decides which cards arrive have to be the same
    sentence. Two copies that drift mean a mechanic who can write a card they
    can no longer see.

    The fallback is ordered, not combined: a card WITH assignees is described by
    them alone, so a stale `assignedTo` on a reassigned card grants nothing.
    """
    rec = rec or {}
    ids = []
    for a in rec.get("assignees") or []:
        uid = a.get("userId") if isinstance(a, dict) else None
        if uid and str(uid) not in ids:
            ids.append(str(uid))
    if not ids and rec.get("assignedTo"):
        ids.append(str(rec["assignedTo"]))
    return ids


def member_row_ok(store, actor, data):
    """Exact membership test for `OWN_ROWS_MEMBER`. This is the boundary.

    `redact_for` calls it on every record it returns, so what this refuses never
    leaves the server whatever the SQL did. `member_rows_predicate` below is a
    volume filter sitting in front of it and is deliberately allowed to be
    LOOSER — never tighter, because a tighter SQL filter drops a row the cursor
    has already stepped past and the device never asks again.
    """
    roles = OWN_ROWS_MEMBER.get(store)
    if not roles or not actor or not isinstance(data, dict):
        return True
    if actor.get("role") not in roles:
        return True
    me = str(actor.get("id") or "")
    if not me:
        return False               # no identity: deny, never widen
    return me in job_crew_ids(data)


def member_rows_predicate(store, actor, dialect="sqlite"):
    """`(sql_fragment, params)` for `OWN_ROWS_MEMBER`, or None if unrestricted.

    A SUPERSET of `member_row_ok` on purpose, and the comment is the design:
    this matches a card that names the actor in `assignees` OR in `assignedTo`,
    while the exact rule prefers `assignees` when it has any. The two differ for
    one card only — reassigned away from somebody whose `assignedTo` was left
    behind — and on that card this sends the row and `member_row_ok` drops it.
    Loose here costs a row read; tight here would cost a row that is never sent
    and never asked for again, which is the failure in `c5dff43`'s own comment.
    """
    roles = OWN_ROWS_MEMBER.get(store)
    if not roles or not actor or actor.get("role") not in roles:
        return None
    me = str(actor.get("id") or "")
    if not me:
        return ("1 = 0", [])       # no identity for the subject: no rows
    if dialect == "postgres":
        return ("((data::jsonb->'assignees') @> jsonb_build_array("
                "jsonb_build_object('userId', ?::text))"
                " OR (data::jsonb->>'assignedTo') = ?)", [me, me])
    return ("(EXISTS (SELECT 1 FROM json_each(data, '$.assignees')"
            " WHERE json_extract(value, '$.userId') = ?)"
            " OR json_extract(data, '$.assignedTo') = ?)", [me, me])


OWN_ROWS_SUBJECT = {
    "trips":   "crew",
    "triplog": "bus",
    "routes":  "bus",
}
# Where each subject's value is found on an actor. `pull()` fills `crewId` and
# `busId` from the actor's crew-bank record before it builds the predicate; a
# plain token dict carries neither, and both functions below then DENY rather
# than quietly widening (see own_rows_predicate).
_SUBJECT_KEY = {"user": "id", "crew": "crewId", "bus": "busId"}

# The two tables above have to agree, and the failure if they do not is the worst
# kind: a store narrowed with its subject missing silently falls back to the
# login id, which is the exact defect that emptied the driver's trip-cash card.
# So this is a hard stop at import rather than a wrong answer at run time — the
# only safe way round for a rule nothing downstream can detect.
_orphan_subjects = sorted(set(OWN_ROWS_SUBJECT) - set(OWN_ROWS_ONLY))
if _orphan_subjects:
    raise RuntimeError(
        "OWN_ROWS_SUBJECT names stores OWN_ROWS_ONLY does not narrow: %s — "
        "either narrow them or drop the subject" % ", ".join(_orphan_subjects))

# The second layer, applied AFTER the store check decided the record may be sent
# at all. Removing a field is not the same question as withholding a record, and
# conflating the two is how the office spent a while receiving no reviews.
FIELD_REDACT = {
    # `emg*`/`ref*` are new: a crew member's emergency contact and their
    # reference's phone number were not in `_DRIVER_PRIVATE` and so reached every
    # role (`LIVE-ISSUES.md` 2, `03 §9.26`).
    "drivers":      ("phone", "altPhone", "address", "dob", "bloodGroup", "license",
                     "docs", "salaryMonthly",
                     "emgName", "emgPhone", "emgRelation", "refName", "refPhone"),
    "buses":        ("crewPhone",),
    # One row currently hands the labour rate and the daily revenue to every
    # login, including the two that hold no capabilities at all. See
    # META_MONEY_ROLES for who keeps them, which is narrower than contract §3.3a
    # says and for a reason found in `app.js`.
    "meta":         ("labourRate", "latePenalty", "lateGraceDays", "latePenaltyCap",
                     "dailyRevenue"),
    # The PNR is the booking-lookup credential on our own portal, and the seat,
    # the fare and the amount are the passenger's business. The BOARDING TIME is
    # not any of those, and taking it away broke the only screen this login
    # exists for: `rvBoard()` in app.js is `parseLocal(r.boardAt || r.doj)`, and
    # every "last 7 days" filter, every scorecard and the review trace itself are
    # computed from it. With both fields gone it returns 0, so the office's
    # landing screen reads "Last 7 days 0, — average, — 1★" with every review
    # dated "—", while a crew manager on the same data sees real figures.
    #
    # Contract §3.3a lists `boardAt`/`doj` in this set and says "unchanged",
    # which is true — v1 has been stripping them from the office all along. So
    # this is a live defect being fixed rather than a v2 narrowing, and it
    # WIDENS what the office receives, which is permission policy: named for the
    # owner in the hand-over rather than slipped in.
    "rbreviews":    ("pnr", "tin", "seats", "fare", "amount"),
    "rbcomplaints": ("pnr", "tin", "seats", "fare", "amount"),
}


# Who keeps `meta`'s money fields. Contract §3.3a says "roles below manager" lose
# them; checked against `app.js`, that would have been five screens quietly
# showing zero. `jobCost` reads `labourRate` and is reached from a mechanic's
# home, a job card, the mechanic leaderboard, a scorecard and the completed-work
# history — all of which a storekeeper and a mechanic can open — and
# `latePenaltyFor` reads `latePenalty`/`lateGraceDays`/`latePenaltyCap` on a
# mechanic's own scorecard, which is the penalty charged to THEM. `dailyRev` is
# read on the job card too. So the workshop keeps them and the four roles whose
# screens never ask for any of the five lose them, which is what §3.3a was for:
# the crew manager, the office and the two logins with no capabilities at all
# stop being handed the labour rate and the day's revenue.
META_MONEY_ROLES = frozenset({"owner", "supervisor", "store", "mechanic"})


def read_roles(store):
    """Every role that may receive a record from `store` — the one answer."""
    return frozenset(STORE_READ_ROLES.get(store, frozenset())) | \
        frozenset(V1_COMPAT_READ.get(store, frozenset()))


def may_read(role, store):
    """Deny by default. An unknown store is denied for every role, which is the
    inverse of v1 and is why adding a store reaches nobody until it is named."""
    return role in read_roles(store)


def never_for(actor):
    """Stores this actor can never receive a single record from.

    Derived, never restated. A store in OWN_ROWS_ONLY for this role is KEPT: it
    still needs reading, and the per-record predicate narrows it in SQL.

    With no actor at all this mirrors `redact_for`'s early return — nothing past
    that point is withheld, so nothing past that point may be skipped either.
    """
    role = (actor or {}).get("role")
    if not actor:
        return frozenset()
    never = set()
    for store in set(STORE_READ_ROLES) | set(V1_COMPAT_READ):
        if role in read_roles(store):
            continue
        field_roles = OWN_ROWS_ONLY.get(store)
        if field_roles and role in field_roles[1]:
            continue          # narrowed per record, not skipped per store
        never.add(store)
    return frozenset(never)


def own_rows_subject(store, actor):
    """The value this actor's own rows of `store` must carry, or None.

    None means the actor has no identity for that subject — a driver with no
    crew-bank record, or one who is on no bus. Both callers then DENY, which is
    the only safe direction: a driver linked to no crew record owns no trips, and
    answering "no narrowing" instead would hand them the whole store.
    """
    key = _SUBJECT_KEY[OWN_ROWS_SUBJECT.get(store, "user")]
    val = (actor or {}).get(key)
    return str(val) if val else None


def own_rows_predicate(store, actor, dialect="sqlite"):
    """`(sql_fragment, params)` narrowing `store` to this actor's own rows, or None.

    Returns None only when the actor is not restricted on this store at all, so
    a caller that gets None may safely read the store whole. When the actor IS
    restricted but has no identity for the subject, the fragment is one that
    matches nothing — never None, because None would widen.

    `pull()` must add the fragment to BOTH of its statements, or completing a rev
    group quietly readmits a row the page had just excluded.
    """
    rule = OWN_ROWS_ONLY.get(store)
    if not rule or not actor:
        return None
    field, roles = rule
    if actor.get("role") not in roles:
        return None
    col = ("(data::jsonb->>'%s')" % field) if dialect == "postgres" \
        else ("json_extract(data,'$.%s')" % field)
    want = own_rows_subject(store, actor)
    if want is None:
        return ("1 = 0", [])          # no identity for this subject: no rows
    return ("%s = ?" % col, [want])


def own_row_ok(store, actor, data):
    """The same rule as a backstop on one record, derived from the same map.

    `redact_for` enforces it after the SQL has already narrowed the page, because
    a store asked for by name through `?store=` takes a different path through
    `pull()`, and because a caller that never went through `pull()` at all — an
    agent route, a test — would otherwise have no narrowing behind it.
    """
    rule = OWN_ROWS_ONLY.get(store)
    if not rule or not actor or not isinstance(data, dict):
        return True
    field, roles = rule
    if actor.get("role") not in roles:
        return True
    want = own_rows_subject(store, actor)
    if want is None:
        return False
    return str(data.get(field) or "") == want


def read_scope_digest(role):
    """8 lowercase hex characters naming WHAT this role may read (contract 2.3).

    A device stores it from login and rewinds its cursors when it changes, so a
    widening reaches the one role it affects instead of every device in the fleet.
    sha256 over a canonical string, NEVER `hash()`: that is salted per process by
    PYTHONHASHSEED, so every cold start would change it and every device would
    rewind on every login.
    """
    import hashlib
    parts = []
    for store in sorted(set(STORE_READ_ROLES) | set(V1_COMPAT_READ)):
        if role not in read_roles(store):
            continue
        own = role in (OWN_ROWS_ONLY.get(store) or (None, ()))[1] \
            or role in OWN_ROWS_MEMBER.get(store, ())
        parts.append("%s:%d" % (store, 1 if own else 0))
    redact = []
    for store in sorted(FIELD_REDACT):
        if role not in read_roles(store):
            continue
        exempt = META_MONEY_ROLES if store == "meta" else PII
        if role not in exempt:
            redact.append(store + "=" + ",".join(sorted(FIELD_REDACT[store])))
    canon = "|".join(parts) + "#" + "|".join(redact)
    return hashlib.sha256(canon.encode("utf-8")).hexdigest()[:8]

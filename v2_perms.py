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
    "gatepasses":    STOREROOM,
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
    # `triplog`'s owner is a BUS, and which bus is the actor's needs their crew
    # record -- which this module cannot read. So it post-filters with the store
    # still in the page. Named as a known cost rather than hidden: it is the one
    # row here that costs a read.
    "triplog":       (None,          frozenset({"driver"})),
    "gatechecks":    ("userId",      frozenset({"driver"})),
}

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
    # A PNR plus a date is a booking-lookup credential on our own portal. The
    # leaderboard needs the stars, the words, the route and whose trip it was.
    "rbreviews":    ("pnr", "tin", "seats", "fare", "boardAt", "doj", "amount"),
    "rbcomplaints": ("pnr", "tin", "seats", "fare", "boardAt", "doj", "amount"),
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


def own_rows_predicate(store, actor, dialect="sqlite"):
    """`(sql_fragment, params)` narrowing `store` to this actor's own rows, or None.

    Returns None when the actor is not restricted, when the store has no
    ownership field the server can read from a token, or when there is no actor —
    and `pull()` must add the fragment to BOTH of its statements, or completing a
    rev group quietly readmits a row the page had just excluded.
    """
    rule = OWN_ROWS_ONLY.get(store)
    if not rule or not actor:
        return None
    field, roles = rule
    if actor.get("role") not in roles or not field:
        return None
    if dialect == "postgres":
        return ("(data::jsonb->>'%s') = ?" % field, [actor.get("id")])
    return ("json_extract(data,'$.%s') = ?" % field, [actor.get("id")])


def own_row_ok(store, actor, data):
    """The same predicate as a backstop on one record, derived from the same map.

    `redact_for` enforces it after the SQL has already narrowed the page, because
    a store asked for by name through `?store=` takes a different path through
    `pull()` and because `triplog` is post-filtered by design.
    """
    rule = OWN_ROWS_ONLY.get(store)
    if not rule or not actor or not isinstance(data, dict):
        return True
    field, roles = rule
    if actor.get("role") not in roles or not field:
        return True
    return str(data.get(field) or "") == str(actor.get("id") or "")

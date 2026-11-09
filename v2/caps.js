/* Garage Saathi v2 — the capability table and the thirteen screens.
 *
 * Data and one predicate. No DOM, no store, no clock.
 *
 * THE RULE THIS FILE EXISTS FOR (DECISIONS.md §3, v2-ux.md §4.3):
 *
 *   a screen declares the capability it needs, and a screen that declares
 *   nothing is unreachable by everybody, including the owner.
 *
 * v1 defaulted the other way and leaked six times by it (LIVE-ISSUES 6,
 * `02 §6.1`, `02 §6.2`): `purchases`, `company`, `scorecard`, `history`,
 * `outsidejobs` and `gatepass` had no entry in v1's `ROUTE_PERM` and were
 * therefore open to every signed-in role. The defect was not a wrong entry in
 * a table — it was the ABSENCE of an entry meaning "allow". So here an empty
 * or missing `declares` admits nobody, an unknown capability name admits
 * nobody, and an unknown screen id admits nobody. The only way in is to say
 * out loud what you need.
 *
 * `OPEN_BY_DESIGN` is the sentinel that keeps that rule honest. Two screens
 * genuinely have no capability of their own — Today (#1) and Me (#12) — and
 * without a sentinel the only way to express them would be an empty
 * `declares`, which is exactly the v1 defect spelled differently. So "open by
 * design" is a thing a screen SAYS, with a reason beside it, and
 * `test_v2_router.js` asserts there are exactly two of them. A third would be
 * a leak taking the same shape as v1's six.
 */
(function (root) {
  'use strict';

  /* Not a capability name and not a string any role could hold: `can()` is
   * never consulted for it, and PERMS has no such key. */
  const OPEN_BY_DESIGN = '@open-by-design';

  /* ---------------------------------------------------------------------- *
   * PERMS — v1's 37 capabilities, transcribed from app.js:973-1100, plus the
   * four v2 names from v2-ux.md §4.3.
   *
   * TRANSCRIBED, NOT REDESIGNED. The role lists below are v1's, character for
   * character, because the permission table is the one thing in this rebuild
   * that must not quietly change: a role list edited while "porting" is a
   * grant nobody reviewed. v1's own comments are kept wherever they carry the
   * reason for a list, because the reason is the part that gets lost.
   *
   * ONE DELIBERATE DEPARTURE, and it is marked at the line it is on:
   * `gateCheck` loses `driver`. See the comment there.
   * ---------------------------------------------------------------------- */
  const PERMS = {
    addBus: ['owner', 'supervisor'],
    addJob: ['owner', 'supervisor'],
    verifyJob: ['owner', 'supervisor'],
    issuePart: ['owner', 'supervisor', 'store'],
    receiveStock: ['owner', 'supervisor', 'store'],
    addPurchase: ['owner', 'supervisor', 'store'],
    dashboard: ['owner', 'supervisor'],
    // redBus reviews traced to a crew member: the crew manager assigns them, so sees them too.
    crewReviews: ['owner', 'supervisor', 'crewmanager', 'office'],
    /* Looking at how the crew are doing, without being able to change any of it.
     *
     * `manageDrivers` conflated two things — reading a crew member's record and
     * editing it — so the only way to let the office see a scorecard was to let
     * them rewrite the roster. They are separate: `crewPerf` opens the list,
     * the scorecard and the reviews; `manageDrivers` still guards every button
     * that writes. The office login has the first and not the second. */
    crewPerf: ['owner', 'supervisor', 'crewmanager', 'office'],
    // Writing down that a conversation happened. The office's one write.
    crewNote: ['owner', 'supervisor', 'crewmanager', 'office'],
    insights: ['owner', 'supervisor'],         // v1's AI Insights screen; Attention's rows in v2
    // 'crewmanager' is a single-job login: the daily duty board and the crew bank,
    // and nothing else. It deliberately has no money, fleet, jobs or store rights.
    manageDrivers: ['owner', 'supervisor', 'crewmanager'],   // crew bank, details, documents
    assignDriver: ['owner', 'supervisor', 'crewmanager'],    // driver/conductor <-> bus
    /* Gate check. v1: 'owner', 'supervisor', 'driver' — the driver filled it and
     * the two managers decided go/hold on a failed one.
     *
     * THE ONE LINE OF THIS TABLE THAT IS NOT v1's, and it is not a tidy-up.
     * DECISIONS.md §7 moves the departure check to the supervisor ("drivers have
     * logins but do not use them"), §15 makes it screen #13 run by the
     * supervisor, and v2-ux.md §4.2 states the consequence as a fact about this
     * table: "With the gate check moved to the supervisor, a driver holds ZERO
     * capabilities, the same as a conductor already does." §4.4's slot table
     * then gives a driver one slot — Me — and screens-shell.md §1.4.1 gives
     * them no nav at all.
     *
     * Leaving `driver` here would make Gate round AND Duty board reachable by a
     * driver's login, because both declare `gateCheck`: a driver's phone would
     * open tonight's whole roster and every bus's gate selfies. That is
     * LIVE-ISSUES 2's shape, created by a transcription. The alternative —
     * keeping the entry and hiding the two screens from drivers by role — is
     * worse, because it reinstates role-gating beside capability-gating, which
     * is the thing v2 replaced, and because then the "every capability a role
     * holds is reachable" check below would have to be told to ignore it.
     *
     * Flagged in F1's report. If the lead disagrees it is this one line. */
    gateCheck: ['owner', 'supervisor'],
    gateDecide: ['owner', 'supervisor'],
    // Split off manageDrivers on purpose: minting logins and PINs for the whole
    // crew is an owner's job, not part of keeping their records.
    manageCrewLogins: ['owner', 'supervisor'],
    // Archiving the entire roll in one go is an owner action — it empties every
    // bus until people are added back.
    bulkArchiveCrew: ['owner'],
    // Scoring somebody's driving is a supervisor's judgement, not record-keeping —
    // and the server refuses `incidents` writes from anyone else anyway.
    logIncident: ['owner', 'supervisor'],
    // Issuing the slip that lets a unit out of the gate, and signing off what
    // comes back against it. The supervisor sends the work out, so it is theirs.
    outsideJob: ['owner', 'supervisor'],
    // Removing a job card takes a repair, its cost and its parts off the board.
    // Cards made in testing or opened twice have to go somewhere, but a wrong
    // delete is the one edit nobody can see afterwards — so it is the owner's
    // alone, and only from their own login.
    deleteJob: ['owner'],
    /* Closing a card, and moving a signed-off one to another bus.
     *
     * Neither was a capability in v1: `mayCloseJob` is a role helper at
     * app.js:3887 and the bus move is a bare role test on the server. So a
     * screen asking Caps.can(role, 'mayCloseJob') got false for EVERYBODY, and
     * the close button would have been absent for the two people who hold it.
     * Slice W found that, transcribed the server's rules as role lists in its
     * own file, and escalated rather than inventing a capability.
     *
     * Minted here instead, because a role list inside a screen file is exactly
     * the v1 pattern that let permission and reachability diverge -- the thing
     * this rebuild exists to end. deleteJob above is already a capability for
     * the same kind of act, so the inconsistency was v1's and is not inherited.
     *
     * Role lists taken from the server, not from a screen:
     *   closeJob    sync_server.py:1760  "only an owner or supervisor may close a job"
     *   moveJobBus  sync_server.py:1702  "only an owner may move a verified job card
     *                                     to another bus" -- it moves money after
     *                                     sign-off, so it is the owner's alone. */
    closeJob: ['owner', 'supervisor'],
    moveJobBus: ['owner'],
    /* Correcting a record somebody else appended, and writing a bus's odometer.
     *
     * Slice FT needed both and had neither, so it stood them up on
     * `garageSetup` -- the right roles for the wrong reason. `garageSetup`
     * means "may open the garage setup sheet"; coupling fill-correction to it
     * means a future narrowing of one silently narrows the other, which is the
     * class of drift DECISIONS section 23 ruled on.
     *
     * editFuelFill is NOT the same question as creating a fill. Four roles may
     * WRITE fuel on the server -- owner, supervisor, store, crewmanager
     * (sync_server.py WRITE_ROLES) -- because the crew manager is the person
     * standing at the pump. But fuel and def are append-only for everybody
     * else (02 section 4.4): the person who recorded a fill cannot later edit
     * it, which is the anti-tamper property. So creating is four roles and
     * correcting is two, and they are different capabilities.
     *
     * writeBusOdometer mirrors the server exactly: WRITE_ROLES['buses'] is
     * owner and supervisor, so a storekeeper's or crew manager's odometer
     * write would be refused -- which FT found by reading the server rather
     * than the spec, and skipped the control for them. */
    editFuelFill: ['owner', 'supervisor'],
    writeBusOdometer: ['owner', 'supervisor'],
    logService: ['owner', 'supervisor'],       // resets service + writes a verified job
    manageRoutes: ['owner', 'supervisor'],     // routes, stops, go-times, punctuality
    // Diesel, AdBlue and tyres are the crew manager's too: the person who runs
    // the duty board is the one standing at the pump. Deliberately NOT a wider
    // `issuePart` (that is stock leaving the store) and not `dashboard`.
    addFuel: ['owner', 'supervisor', 'store', 'crewmanager'], // log fuel fills; view mileage
    // Tyres and other rotables: fitting, removing and tracking a piece.
    manageComponents: ['owner', 'supervisor', 'store', 'crewmanager'],
    // The warranty screen rode on addFuel and is parts-and-supplier money, so it
    // keeps the old set rather than following the crew manager in.
    viewWarranty: ['owner', 'supervisor', 'store'],
    requestPart: ['supervisor', 'owner'],      // ask the store to issue a part against a job
    money: ['owner', 'supervisor'],            // Money tab (owner-weighted)
    fleet: ['owner', 'supervisor'],            // Fleet tab
    people: ['owner', 'supervisor'],           // People tab (owner-weighted)
    bills: ['owner', 'supervisor', 'store'],   // Bills tab (store manages supplier bills)
    // Sheet-only actions in v1. These had no route of their own, so v1's
    // ROUTE_PERM never saw them — they had to be checked inside their own
    // functions. In v2 they are rows on a screen, so they are declared below.
    garageSetup: ['owner', 'supervisor'],      // Garage setup sheet + saveGarage
    manageStaff: ['owner', 'supervisor'],      // Staff accounts sheet + saveStaff
    // Outstanding fines and court referrals are finance data, and each lookup
    // spends a billable credit — same gate the server applies.
    challans: ['owner', 'supervisor'],
    // Where the buses are is duty information, not money: the crew manager puts
    // people on those buses and needs to know which one is where. Its own
    // permission rather than widening `dashboard`, which also opens reports,
    // accounting, usage and the money screens.
    liveMap: ['owner', 'supervisor', 'crewmanager'],
    /* 'mechanic' belongs in all three, and its absence made that login useless:
     * their nav carried a Store tab, their home screen listed their jobs and
     * their score — and every one of those taps bounced them back to the same
     * home screen. What a mechanic may see INSIDE a card is scoped per record
     * and again on the server, which is where that belongs. */
    viewStore: ['owner', 'supervisor', 'store', 'mechanic'],
    viewJobs: ['owner', 'supervisor', 'store', 'mechanic'],
    viewScoreboard: ['owner', 'supervisor', 'store', 'mechanic'],

    /* ---- the four v2 names (v2-ux.md §4.3, DECISIONS.md §5) ---- */
    // Attention (#2) is one destination whose ROWS each declare their own
    // capability. Granting this grants nothing but the empty list — which is the
    // whole point: Attention merges five screens that sat behind four different
    // capabilities, and one capability over all of them would be `dashboard`
    // rebuilt (v2-ux.md §4.3, "the trap inside Attention").
    viewAttention: ['owner', 'supervisor'],
    // The `bills` split: manage the bill in Store, read the total in Money.
    // Both halves are owner + supervisor, so the split grants nobody anything
    // new today — it exists so a FUTURE role cannot inherit money by being
    // given an operational capability (DECISIONS.md §5).
    viewSpendTotals: ['owner', 'supervisor'],
    // The other half of v1's `dashboard` split. The supervisor holds it: the 2
    // November decision to take company money away is reversed, because the
    // supervisor does the cash reconciliation (DECISIONS.md §5).
    viewCompanyBilling: ['owner', 'supervisor'],
    // Who opened what, from the `usage` store, on Me. Owner only, and the
    // reason it exists is that the money is deliberately shared: the owner
    // should be able to see who looked at it (DECISIONS.md §5).
    // NOTE for the backend lead: the server still sends `usage` to owner AND
    // supervisor (`03 §2.1`), so until that read boundary moves this is a
    // client gate over records a supervisor's phone already holds.
    viewAdoption: ['owner'],
  };

  /* Deny by default, three ways: an unknown capability name, a null role and a
   * role that is not in the list all return false. v1's `can` was the same
   * shape; what leaked in v1 was the ROUTE table, not this. */
  function can(role, cap) {
    const roles = PERMS[cap];
    if (!roles || !role) return false;
    return roles.indexOf(String(role)) !== -1;
  }

  // Every capability a role holds, for the orphan check (v2-ux.md §4.4: "no
  // capability is held without a path").
  function capsOf(role) {
    const out = [];
    const names = Object.keys(PERMS);
    for (let i = 0; i < names.length; i++) {
      if (can(role, names[i])) out.push(names[i]);
    }
    return out;
  }

  /* ---------------------------------------------------------------------- *
   * SCREENS — the thirteen (DECISIONS.md §15), in RAIL ORDER.
   *
   * THIRTEEN SCREENS, TWELVE DESTINATIONS: `jobcard` has `nav: false` and is
   * reached from `jobs`, exactly as the foundation already says for mechanic
   * ("5 destinations, 4 tabs") and store.
   *
   * `title` is the screen's one name. screens-shell.md §1.6: one name, three
   * places — the nav label, the header and the More sheet — never a synonym.
   * `word` is its id for `w()` so the three places translate from one id too.
   *
   * `declares` is either a NON-EMPTY array of capability names, ANY of which
   * admits, or `OPEN_BY_DESIGN` with a reason. Nothing else admits anybody.
   *
   * `gates` is the capabilities used INSIDE the screen — its rows, its cards,
   * its sheets. It is not what admits; it is what makes the "no capability is
   * held without a path" check possible at all, because only twelve of the
   * forty-one capabilities are declarations and the other twenty-nine are
   * row- and field-level gates. Sources: v2-ux.md §4.3's Declares column,
   * screens-money-people.md §0.1's "Row- and field-level gates" column,
   * v2-ux.md §5.1's route-by-route table, screens-shell.md §4.2 (Me's blocks).
   * ---------------------------------------------------------------------- */
  const SCREENS = {
    today: {
      title: 'Today', word: 'scToday', order: 1, nav: true, mark: 'home',
      declares: OPEN_BY_DESIGN,
      /* The first of the two deliberate exceptions. Its CONTENTS are
       * capability-scoped block by block, so the screen itself has nothing to
       * declare (v2-ux.md §4.3, screens-shell.md §2). */
      openReason: 'Its contents are capability-scoped block by block, so the '
        + 'screen has no capability of its own (v2-ux.md §4.3).',
      /* …and that is also why it is NOT open to everybody. A role holding no
       * capability gets no block, and v2-ux.md §4.1 #1 is explicit: "No Today
       * at all for a driver or a conductor: for them it would be a shell, and a
       * shell is the dead end of [E] 8db78e7." So the admission rule is derived
       * from PERMS rather than from a role whitelist — the screen is reachable
       * exactly when the reader has something to put on it, which is the honest
       * statement of §4.2's front doors and §4.4's slot table (driver 1,
       * conductor 1, both Me). A role whitelist here would be role-gating
       * smuggled back in beside capability-gating. */
      openTo: 'withCapability',
      gates: [],
    },
    attention: {
      title: 'Attention', word: 'scAttention', order: 2, nav: true, mark: 'alert',
      declares: ['viewAttention'],
      /* Nine row kinds behind their own capabilities. `gateDecide` is here and
       * not on Duty board (v2-ux.md §4.3: "the go/hold decision is gateDecide,
       * on Attention" — the queue belongs where the decider already looks).
       * `insights` and `dashboard` are v1's five "what is wrong?" screens
       * folded into these rows (v2-ux.md §5.1: pilferage, insights, safety,
       * breakdowns, alerts, storehealth, gatechecks all become rows here). */
      gates: ['gateDecide', 'verifyJob', 'challans', 'insights', 'dashboard'],
    },
    jobs: {
      title: 'Jobs', word: 'scJobs', order: 3, nav: true, mark: 'job',
      declares: ['viewJobs'],
      // `newjob` becomes an action here (§5.1); the mechanic leaderboard answers
      // "who should take this card" (§5.1) and so appears on both Jobs and the
      // card. A mechanic is narrowed to their own cards IN THE QUERY, not in
      // the view, and not by a capability — that rule is W's, per record.
      gates: ['addJob', 'viewScoreboard'],
    },
    jobcard: {
      title: 'Job card', word: 'scJobcard', order: 4, nav: false, mark: 'job',
      parent: 'jobs',
      declares: ['viewJobs'],
      /* The second signature is `verifyJob` PLUS the per-record rule
       * `closedBy !== me`, for every role including the owner — and that half is
       * server-enforced now (b1fb43b: `_guard_write`'s jobcards clause is
       * `if closer and closer == actor["id"]`, with the role test gone). Any
       * spec calling it a client-only rule until the guard is tightened is
       * stale. It is still not a capability, so it is not in this list. */
      /* `closeJob` and `moveJobBus` are gates here rather than orphans: slice W
       * found that neither existed as a capability, so Caps.can() was false for
       * everybody and the close button would have been absent for the two people
       * who hold it. They are minted above from the SERVER's rules, and they
       * belong in this list because the Job card uses them without declaring
       * them -- which is the distinction `gates` exists to carry. */
      gates: ['addJob', 'verifyJob', 'deleteJob', 'closeJob', 'moveJobBus',
              'outsideJob', 'requestPart', 'issuePart', 'viewScoreboard',
              'viewWarranty'],
    },
    buses: {
      title: 'Buses', word: 'scBuses', order: 5, nav: true, mark: 'bus',
      declares: ['fleet'],
      // `liveMap` survives here as the bus's own position; the full-screen fleet
      // map is dropped outright (v2-ux.md §5.2, Q9).
      // `addJob` is card 1's "Make a job" from an open driver report (§1.1) and
      // `assignDriver` is card 8's link to the Duty board (§1.9). Both were gated
      // correctly in the screen and absent here, so the "no capability is held
      // without a path" sweep could not see either one. Found by slice B.
      gates: ['addBus', 'logService', 'challans', 'liveMap', 'addJob', 'assignDriver'],
    },
    store: {
      title: 'Store', word: 'scStore', order: 6, nav: true, mark: 'part',
      declares: ['viewStore'],
      // `bills` is the operational half of the split — managing the bill is
      // here, the spend total is Money's. `viewWarranty` survives as a flag on
      // a piece rather than the list nobody acted on (§5.2).
      gates: ['issuePart', 'receiveStock', 'addPurchase', 'bills',
              'manageComponents', 'viewWarranty', 'requestPart'],
    },
    money: {
      title: 'Money', word: 'scMoney', order: 7, nav: true, mark: 'money',
      // screens-money-people.md §0.1 declares BOTH. Owner and supervisor hold
      // each of them, so "any of which admits" and "all of which admit" are the
      // same set today; it is written as the declaration the spec gives.
      declares: ['viewSpendTotals', 'money'],
      gates: ['viewCompanyBilling', 'bills', 'challans', 'dashboard'],
    },
    people: {
      title: 'People', word: 'scPeople', order: 8, nav: true, mark: 'person',
      declares: ['crewPerf'],
      // §0.1's inner gates, plus the crew bank's bulk archive and the blended
      // score. Salary is behind `money` — the gate, not the screen (§3.4).
      gates: ['manageDrivers', 'crewNote', 'manageCrewLogins', 'manageStaff',
              'logIncident', 'money', 'bulkArchiveCrew', 'viewScoreboard',
              'people'],
    },
    duty: {
      title: 'Duty board', word: 'scDuty', order: 9, nav: true, mark: 'seat',
      /* Two capabilities, row-scoped exactly as Attention is: a crew manager
       * holds `assignDriver` and not `gateCheck`, so he sees tonight's buses and
       * their seats and no check action; a supervisor holds both
       * (v2-ux.md §4.3). Gate state appears here as WORDS, not as a pressable
       * thing — the round itself is #13 (DECISIONS.md §15). */
      declares: ['assignDriver', 'gateCheck'],
      gates: [],
    },
    gate: {
      title: 'Gate round', word: 'scGate', order: 10, nav: true, mark: 'gate',
      declares: ['gateCheck'],
      gates: [],
    },
    fuel: {
      title: 'Fuel & tyres', word: 'scFuel', order: 11, nav: true, mark: 'fuel',
      declares: ['addFuel', 'manageComponents'],
      /* `addFuel` admits four roles because the crew manager is at the pump.
       * Correcting a fill somebody else appended, and writing a bus's recorded
       * odometer, are both narrower -- owner and supervisor -- so they are gates
       * here rather than declarations. The screen is reachable without them. */
      gates: ['editFuelFill', 'writeBusOdometer', 'fleet', 'viewStore', 'outsideJob'],
    },
    reviews: {
      title: 'Reviews', word: 'scReviews', order: 12, nav: true, mark: 'review',
      declares: ['crewReviews'],
      gates: ['manageDrivers', 'crewNote', 'logIncident'],
    },
    me: {
      title: 'Me', word: 'scMe', order: 13, nav: true, mark: 'me',
      declares: OPEN_BY_DESIGN,
      openReason: 'Every row inside is own-record or capability-scoped, and the '
        + 'own-record rows exist for all eight roles (v2-ux.md §4.3).',
      /* The second exception, and the reason it differs from Today's: Me's rows
       * are own-record. A driver and a conductor hold zero capabilities and Me
       * is nevertheless their WHOLE app (v2-ux.md §3.4, §4.2) — own attendance,
       * own documents, own reviews, own coaching note, "something is wrong with
       * my bus". A login that lands nowhere is the dead end that cost a month of
       * mechanics' time ([E] 8db78e7), so this one is open to everybody and that
       * is deliberate rather than defaulted. */
      openTo: 'everybody',
      // Block 8 is owner-only: who opened what (`viewAdoption`), Import from
      // Excel (`addPurchase`), Garage setup (`garageSetup`) — screens-shell.md
      // §4.2. Block 2 is own score (`viewScoreboard`), own row only.
      gates: ['viewAdoption', 'addPurchase', 'garageSetup', 'viewScoreboard'],
    },
  };

  /* The More tab. `screens-shell.md §1.3`: More is `icon('more')` and is NEVER
   * a destination — its item carries no `aria-current`, the sheet's rows do.
   * It is deliberately not a key in SCREENS, so `go('more')` is refused by the
   * same line that refuses any unknown id. */
  const MORE = { id: 'more', title: 'More', word: 'navMore', mark: 'more' };

  /* The nav slots, from screens-shell.md §1.3 and v2-ux.md §4.4, which agree.
   *
   * These are ORDERS, not just sets, and two of them are deliberately not rail
   * order: the storekeeper gets Store second ("Today, Store, Jobs, Fuel &
   * tyres, Me") and the crew manager gets Duty board second ("Today, Duty
   * board, People, Fuel & tyres, Reviews, Me"). Each role's nav opens with the
   * screen that role lives in, which is why the slot table exists at all and
   * is not derived from `order`.
   *
   * Six is the ceiling at 360px — 60px an item, which holds a 20px mark and a
   * --t6 label — so the owner's and the supervisor's seventh slot is More and
   * the rest go in the sheet. Their two lists differ by exactly one item on
   * purpose: Money for the owner, Jobs for the supervisor.
   *
   * `driver` and `conductor` are absent on purpose: one destination means no
   * nav at all (§1.4.1), not a list of one. */
  /* SCREENS A ROLE KEEPS BUT DOES NOT CARRY ON THE DESK RAIL.
   *
   * The owner's decision, 2026-11-09: the supervisor was being SHOWN all thirteen screens on an
   * office PC -- the same rail as the owner's -- and he wanted him back to the shape v1 had, where
   * five things were in front of him and the rest sat behind a menu.
   *
   * It is deliberately NOT a permission change, and the measurement is why. By capability v2's
   * supervisor is already tighter than v1's: v1 denied him two things (`deleteJob`,
   * `bulkArchiveCrew`) and v2 denies those plus `moveJobBus` and `viewAdoption`. What grew was not
   * what he may do, it was what is on screen at once. So these three stay REACHABLE -- Money in
   * particular, because `DECISIONS.md` section 5 gave it to him on purpose: he does the cash
   * reconciliation, and a supervisor who cannot open Money cannot do that job. They move behind
   * More, which is where a phone has always put them: `NAV_SLOTS.supervisor` below has never
   * carried them, so at yard density nothing changes at all.
   *
   * An empty or missing list leaves a role's rail exactly as it was, which is every other role. */
  const RAIL_OFF = {
    supervisor: ['money', 'people', 'reviews'],
  };

  const NAV_SLOTS = {
    owner: ['today', 'attention', 'money', 'buses', 'me'],
    supervisor: ['today', 'attention', 'jobs', 'buses', 'me'],
    mechanic: ['today', 'jobs', 'store', 'me'],
    store: ['today', 'store', 'jobs', 'fuel', 'me'],
    crewmanager: ['today', 'duty', 'people', 'fuel', 'reviews', 'me'],
    office: ['today', 'people', 'reviews', 'me'],
  };

  /* The capabilities v2's screen set genuinely retires: held by a role, used by
   * no screen that role can reach. Named here with the line that retires each,
   * because the alternative is a check that passes by ignoring what it found.
   * test_v2_router.js asserts the computed orphan set equals this one EXACTLY,
   * so it goes red both when a new orphan appears and when a listed one is
   * given a home and not delisted. */
  const RETIRED = {
    // v2-ux.md §5.2: `routes` is dropped outright, nothing replaces it — "the
    // real job underneath it, which buses run today, is not served at all" and
    // is now the Duty board's quick daily entry instead (Q8).
    manageRoutes: ['owner', 'supervisor'],
    // v2-ux.md §5.2: the full-screen fleet map is dropped until somebody names
    // the moment (Q9). The bus's own position stays on Buses — which owner and
    // supervisor reach and a crew manager does not.
    liveMap: ['crewmanager'],
  };

  /* ---------------------------------------------------------------------- *
   * The predicate. Everything above is data; this is the whole enforcement.
   * ---------------------------------------------------------------------- */
  function holds(role, id) {
    const s = SCREENS[id];
    if (!s || !role) return false;          // an unknown screen admits nobody
    const d = s.declares;
    if (d === OPEN_BY_DESIGN) {
      // A sentinel with no reason beside it admits nobody. "Open by design"
      // has to be said out loud or it is just an empty declaration again.
      if (!s.openReason) return false;
      if (s.openTo === 'everybody') return true;
      if (s.openTo === 'withCapability') return capsOf(role).length > 0;
      return false;                          // an unrecognised openTo: deny
    }
    // THE line. Not an array, or an empty one, means unreachable — for every
    // role including the owner. This is where v1's six leaks stop being
    // possible: a screen added in a year with no declaration is invisible, not
    // open, and nobody has to remember to add it to a deny-list.
    if (!Array.isArray(d) || d.length === 0) return false;
    for (let i = 0; i < d.length; i++) {
      if (can(role, d[i])) return true;      // ANY of them admits
    }
    return false;
  }

  function byOrder(a, b) { return SCREENS[a].order - SCREENS[b].order; }

  // Every screen the role holds, in rail order. Includes `jobcard`, which is
  // held and is not a destination — callers that want destinations filter on
  // `nav`, exactly as navFor does.
  function screensFor(role) {
    return Object.keys(SCREENS).filter(function (id) {
      return holds(role, id);
    }).sort(byOrder);
  }

  function item(id) {
    const s = SCREENS[id];
    return { id: id, label: s.title, word: s.word, mark: s.mark };
  }

  /* The nav, from screens-shell.md §1.3's slot table.
   *
   * `density` is `'desk'` or `'yard'` (Boot.density()). At desk the rail holds
   * all twelve and there is no More at all; at yard six is the ceiling.
   *
   * ONE SLOT MEANS NO NAV. A driver and a conductor hold Me and nothing else,
   * and a nav with one item is a lie about there being somewhere else to go —
   * the same lie as a disabled tab, which §3.7's disabled row already forbids.
   * So this returns an empty bar rather than leaving the shell to notice, and
   * the rule is tested here rather than hoped for downstream
   * (screens-shell.md §1.4.1, v2-foundation-ui.md §3.7.1).
   */
  function navFor(role, density) {
    const dests = screensFor(role).filter(function (id) { return SCREENS[id].nav; });
    if (dests.length < 2) return { items: [], more: [] };
    const slots = NAV_SLOTS[role];
    // A role the slot table does not name falls back to rail order rather than
    // to nothing: a new role with no slot list should still be able to move.
    if (!slots) return { items: dests.map(item), more: [] };

    const inBar = {};
    const items = [];
    for (let i = 0; i < slots.length; i++) {
      if (dests.indexOf(slots[i]) === -1) continue;   // a slot the role lost
      inBar[slots[i]] = true;
      items.push(item(slots[i]));
    }
    const rest = dests.filter(function (id) { return !inBar[id]; });
    if (!rest.length) return { items: items, more: [] };
    /* At desk the rail holds every destination the role is SHOWN, and for
     * most roles that is all of them with no More AT ALL (screens-shell.md
     * §1.3) — twelve items is 12 x --tap 32px = 384px of a 768px column,
     * which is why the overflow sheet is a phone-width answer only. The one
     * exception is RAIL_OFF, below: the supervisor's three. The rail is in
     * rail order, which is the order the two desks say to each other. */
    if (density === 'desk') return deskBar(role, dests);
    const more = rest.map(item);

    /* More sits immediately before Me, which is where both of §1.3's lists put
     * it ("Today, Attention, Money, Buses, More, Me"). Written as "before Me"
     * rather than "at index 4" so a slot list that changes length still reads
     * the same way. */
    let at = items.length;
    for (let j = 0; j < items.length; j++) {
      if (items[j].id === 'me') { at = j; break; }
    }
    items.splice(at, 0,
                 { id: MORE.id, label: MORE.title, word: MORE.word, mark: MORE.mark });
    return { items: items, more: more };
  }

  /* The desk rail. It held EVERY destination and had no More at all
   * (screens-shell.md 1.3) -- twelve items is 12 x --tap 32px = 384px of a 768px column, so the
   * overflow sheet was a phone-width answer only. That still holds for every role whose RAIL_OFF
   * is empty, and this returns the identical shape for them.
   *
   * For a role that has one, the named screens come off the rail and into More, and More is
   * inserted immediately before Me -- the same place, by the same rule, as the yard bar below, so
   * the two densities do not teach a person two different maps of the same app. */
  function deskBar(role, dests) {
    const off = RAIL_OFF[role] || [];
    const hidden = dests.filter(function (id) { return off.indexOf(id) !== -1; });
    if (!hidden.length) return { items: dests.map(item), more: [] };
    const items = dests.filter(function (id) { return off.indexOf(id) === -1; }).map(item);
    let at = items.length;
    for (let i = 0; i < items.length; i++) {
      if (items[i].id === 'me') { at = i; break; }
    }
    items.splice(at, 0, { id: MORE.id, label: MORE.title, word: MORE.word, mark: MORE.mark });
    return { items: items, more: hidden.map(item) };
  }

  const api = {
    PERMS: PERMS,
    RAIL_OFF: RAIL_OFF,
    SCREENS: SCREENS,
    OPEN_BY_DESIGN: OPEN_BY_DESIGN,
    MORE: MORE,
    NAV_SLOTS: NAV_SLOTS,
    RETIRED: RETIRED,
    can: can,
    capsOf: capsOf,
    holds: holds,
    screensFor: screensFor,
    navFor: navFor,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Caps = api;
})(typeof window !== 'undefined' ? window : this);

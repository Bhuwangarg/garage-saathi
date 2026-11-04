# 02 — Roles and permissions (as built, commit `4732dac`, branch `launch-v2`)

Inventory of the authorization model of the live Garage Saathi app, for the v2 rebuild.
Everything here is read from `app.js` (14,163 lines), `sync_server.py` (6,060 lines),
`sync.js`, `test_pullscope.py`, `test_office.py` and git history. **Code wins over
every document.** No source file was changed and nothing was run.

Line numbers are for this commit and will drift; function and constant names will not.

## 0. Headline facts (read these first)

- **8 roles**: `owner`, `supervisor`, `store`, `mechanic`, `crewmanager`, `office`, `driver`, `conductor`.
- **37 capabilities** in `PERMS` (`app.js:974-1061`). **50 routes** in `ROUTE_PERM` (`app.js:12736-12750`).
  The router has **53** route names; the three with no `ROUTE_PERM` entry are `home`, `me` and `driverdocs`
  (the last is checked per id by `canDriverDocs`, not by route).
- `conductor` holds **0** capabilities. `driver` holds **1** (`gateCheck`). `mechanic` holds **3**. `office` holds **3**.
- `supervisor` holds **35 of 37** — everything except `deleteJob` and `bulkArchiveCrew`. In the same commit history
  the owner decided (2 Nov 2026) that this must change; it is blocked on two capability splits (section 8).
- **The server's WRITE boundary is real and well-built** (`WRITE_ROLES`, `_guard_write`, `_guard_gatecheck`,
  `_guard_rbalias`, per-store append-only and ownership rules).
- **The server's READ boundary is narrow.** `/pull` withholds only: crew PII fields, GPS history, the review/AI-draft
  stores, `crewnotes`, `digest`, a few history stores, server bookkeeping. **Every other store — supplier bills,
  vendors, job-card costs, parts and ledger, fuel, driver trip cash, driver incidents, challan liabilities, garage
  settings, all-staff attendance, gate checks with selfies — is delivered in full to every signed-in role,
  including a conductor.** Every read-side capability (`money`, `fleet`, `people`, `bills`, `dashboard`, `viewStore`,
  `viewJobs`, ...) is therefore a screen curtain on the client, not an authorization (sections 4 and 5).
- Role lists exist in **three** independent places that must agree: `PERMS` (`app.js`), `PII_ROLES` (`sync.js:101`,
  a mirror), and the server tables (`WRITE_ROLES`, `PII_ROLES`, `MANAGER_ROLES`, `HISTORY_ROLES`, `COACH_DECIDERS`,
  `SUPERVISOR_MANAGES`, plus ~15 inline `me["role"] not in (...)` checks). There is also a large set of **inline role
  checks outside `PERMS`** in `app.js` (section 4.3) that a table-driven rebuild would silently lose.

---

## 1. The eight roles

`ALL_ROLES` (server, `sync_server.py:947`) = `("owner", "supervisor", "crewmanager", "office", "store", "mechanic", "driver", "conductor")`.
Client labels: `ROLE_META` (`app.js:13360`). Every role has its own home view (`app.js:3147-3154`) and its own bottom nav (`NAVS`, `app.js:1980-1999`).
`NO_LOGIN_ROLES` is an **empty set** (`app.js:13374`) — every role signs in. The "Mechanic — no login" option text in the Add-staff
sheet (`app.js:7200`) is stale.

"Who holds it" comes from `SEED_USERS` (`sync_server.py:337`), `db.js:382`, `TRAINING_MANUAL.html` and code comments.
Where the repo does not name a person it says UNDETERMINED.

### owner
- **Login is for:** running the company — full oversight of money, fleet, people and every sign-off, plus the few acts reserved to nobody else.
- **Held by:** Bhuwan (`u-owner`). One person; the server refuses to delete the last owner (`sync_server.py:5621`).
- **Capabilities (37):** all of them — `addBus, addJob, verifyJob, issuePart, receiveStock, addPurchase, dashboard, crewReviews, crewPerf, crewNote, insights, manageDrivers, assignDriver, gateCheck, gateDecide, manageCrewLogins, bulkArchiveCrew, logIncident, outsideJob, deleteJob, logService, manageRoutes, addFuel, manageComponents, viewWarranty, requestPart, money, fleet, people, bills, garageSetup, manageStaff, challans, liveMap, viewStore, viewJobs, viewScoreboard`.
- **Reached only by owner (not in `PERMS`; inline checks):** create/delete logins of any role and delete a login (`/auth/users/delete`, `canRemoveStaff`), create `supervisor`/`crewmanager`/`office`/`owner` accounts (`may_manage`), move a *verified* job card to another bus (`changeJobBus`, client + `_guard_write`), sign off a card the owner themself closed is **refused** (supervisor may), `/admin/import`, ITS diagnostics (`/its/lookup` with `diag`), `startFresh` (local DB wipe, client-only), delete a job card (`deleteJob`), archive the whole crew roll (`bulkArchiveCrew`).
- **Home:** `viewOwnerHome`. **Nav:** Today · Money · Fleet · People · Me.

### supervisor
- **Login is for:** running the floor day to day — jobs, store, crew, duty, gate, fuel, challans — and signing work off.
- **Held by:** Vajid (`u-sup`) and Latif; the training manual says they work alternate shifts (`TRAINING_MANUAL.html:1546`). Latif is named in a code comment (`app.js:3869`) but not in the seed.
- **Capabilities (35):** `addBus, addJob, verifyJob, issuePart, receiveStock, addPurchase, dashboard, crewReviews, crewPerf, crewNote, insights, manageDrivers, assignDriver, gateCheck, gateDecide, manageCrewLogins, logIncident, outsideJob, logService, manageRoutes, addFuel, manageComponents, viewWarranty, requestPart, money, fleet, people, bills, garageSetup, manageStaff, challans, liveMap, viewStore, viewJobs, viewScoreboard`. **Not held:** `deleteJob`, `bulkArchiveCrew`.
- **Extra rules (inline/server):** may create/reset only `store, mechanic, driver, conductor` accounts (`SUPERVISOR_MANAGES`); cannot rename an owner; a supervisor's own closed work verifies in the same step with no second signature (`selfSignsOff`, owner's decision of 15 Sep 2026; `_guard_write` jobcards).
- **Home:** `viewSupervisorHome`. **Nav:** Today · Jobs · Fleet · Store · Me.
- **Governance flag:** see section 8.1 — in a cash business this role is almost the owner.

### store
- **Login is for:** the storekeeper — issue and receive parts, enter supplier bills, book fuel/AdBlue/tyres, and see the job board.
- **Held by:** Suresh (`u-store`, seed). Whether more than one storekeeper exists: UNDETERMINED.
- **Capabilities (10):** `issuePart, receiveStock, addPurchase, addFuel, manageComponents, viewWarranty, bills, viewStore, viewJobs, viewScoreboard`.
- **Home:** `viewStoreHome`. **Nav:** Store (home) · Bills · Jobs · Me.
- **Server-only grants beyond the client:** may write `jobcards` (needed to attach parts) — including *creating* a card, which the client denies it (`addJob` is owner/supervisor). See section 4.4.

### mechanic
- **Login is for:** seeing the job cards one has been given, logging hours/photos on them, and checking in — "to see what is waiting for them", nothing else.
- **Held by:** Mukesh, Imran, Vijay (seed `u-m1..u-m3`); the real count is UNDETERMINED. Mechanics lost their logins once ("Mechanics never wanted to keep the paperwork", `app.js:13362`) and got them back; the supervisor still keeps the card.
- **Capabilities (3):** `viewStore, viewJobs, viewScoreboard`.
- **Enforced on the server, per record:** may write only job cards whose crew includes them; cannot create, delete, close, verify or re-open; cannot change the crew (`_guard_write` jobcards, commit `fbcd246`). Client mirrors with `isOnJob` filters and `viewScorecard` self-only.
- **Home:** `viewMechanicHome`. **Nav:** My work · Store · Me (no Jobs tab; jobs are the home).
- **Dead branch:** the request-a-part button is `can(role,'requestPart') && (role !== 'mechanic' || mine)`, but `requestPart` is `['supervisor','owner']`, so the mechanic branch can never be true (section 4.2).

### crewmanager
- **Login is for:** one job — the daily duty board (who sits on which bus) and the crew bank (records, documents), plus fuel/AdBlue/tyres and the live map.
- **Held by:** UNDETERMINED — no person is named anywhere in the repo.
- **Capabilities (8):** `crewReviews, crewPerf, crewNote, manageDrivers, assignDriver, addFuel, manageComponents, liveMap`.
- **Home:** `viewCrewManagerHome`. **Nav:** Today · Duty board (`assignments`) · Crew bank (`crewbank`) · Me.
- **PII:** is in `PII_ROLES` — receives the full crew record (phone, address, licence, documents, **salary**) although it has no `money` capability (section 5.3).

### office
- **Login is for:** reading how drivers and conductors are performing and what passengers said about them, and writing down that a conversation happened; "a window, not a desk".
- **Held by:** UNDETERMINED — an office clerk (`sync_server.py:942-946`, comment).
- **Capabilities (3):** `crewReviews, crewPerf, crewNote`.
- **Server writes allowed:** `crewnotes` (append-only), its own `attendance`, `usage`. Nothing else (`test_office.py`).
- **Never receives:** crew phone/address/licence/documents/salary, GPS history, PNR/seat/fare/board point on reviews, `itslookup`, AI-draft stores.
- **Home:** `viewOfficeHome`. **Nav:** Office · Crew (`drivers`) · Reviews · Me.

### driver
- **Login is for:** the bus crew member's own day — fill and release the departure gate check, report a problem, record trip cash, see their own bus, reviews and coaching.
- **Held by:** the roster of drivers (`CREW_ROLES`); the training manual counts ~110 crew records. Seed: Ramlal (`u-d1`, demo).
- **Capabilities (1):** `gateCheck`.
- **Server-enforced own-record rules:** gate check only for own bus (`_guard_gatecheck`), trips only own (`trips`), stop arrivals only own bus once per stop per day (`triplog`), may cancel only own open report. `/my/coaching` and `/my/reviews` return the caller's own rows only.
- **Home:** `viewDriverHome`. **Nav:** My Bus · Me.
- **Status flag:** `TRAINING_MANUAL.html` (lines ~981, 1037, 1064) says driver/conductor logins are "being withdrawn" because they shared PIN `0000`. The code has since moved to per-person PINs (`register_roster`, `pin_refusal`, `CREW_DEFAULT_PIN` refused at login). The manual is stale; whether crew logins are live in production is UNDETERMINED from the repo (owner must confirm).

### conductor
- **Login is for:** the same as the driver, minus the gate check — see the bus, driver pairing and own duty.
- **Held by:** conductors in the crew bank (same population as drivers; per-bus `u-cond-<reg>` ids exist).
- **Capabilities (0):** none. Everything a conductor can do is a hard-coded role branch (home, Me, own documents vault `app.js:5643`) plus the stores the server lets every role write (`attendance`, `usage`, `driverreports`).
- **Home:** `viewConductorHome`. **Nav:** My Duty · Me.

### Per-role totals (from `PERMS`)

| Role | Capabilities | Routes passing `ROUTE_PERM` (of 50) |
|---|---:|---:|
| owner | 37 | 50 |
| supervisor | 35 | 50 |
| store | 10 | 14 |
| crewmanager | 8 | 11 |
| mechanic | 3 | 5 |
| office | 3 | 2 |
| driver | 1 | 1 |
| conductor | 0 | 0 |

Routes by role (exact, generated from the two tables):

- **owner** (50): money, fleet, people, bills, insights, drivers, assignments, routes, reports, busreport, livemap, track, fuel, safety, breakdowns, warranty, storehealth, linkgps, newjob, forecast, pilferage, components, def, vendors, import, crewpins, crewbank, usage, accounting, busacct, purchases, alerts, buses, gate, gatechecks, reviews, rbnames, whynodriver, coaching, digest, store, jobs, scoreboard, challans, buschallans, company, scorecard, history, outsidejobs, gatepass
- **supervisor** (50): money, fleet, people, bills, insights, drivers, assignments, routes, reports, busreport, livemap, track, fuel, safety, breakdowns, warranty, storehealth, linkgps, newjob, forecast, pilferage, components, def, vendors, import, crewpins, crewbank, usage, accounting, busacct, purchases, alerts, buses, gate, gatechecks, reviews, rbnames, whynodriver, coaching, digest, store, jobs, scoreboard, challans, buschallans, company, scorecard, history, outsidejobs, gatepass
- **store** (14): bills, fuel, warranty, storehealth, components, def, vendors, import, purchases, store, jobs, scoreboard, scorecard, history
- **mechanic** (5): store, jobs, scoreboard, scorecard, history
- **crewmanager** (11): drivers, assignments, livemap, track, fuel, components, def, crewbank, reviews, rbnames, coaching
- **office** (2): drivers, reviews
- **driver** (1): gate
- **conductor** (0): (none)

---

## 2. Capability × role matrix (derived from `PERMS`)

`can(role, perm)` is `(PERMS[perm] || []).includes(role)` (`app.js:973`). **An unknown permission name is silently
"nobody"** (`|| []`), and an unknown role is silently "denied"; a typo in either fails closed, which is the only
good property of that line. `PERMS` is the only declarative table; it was originally 7 entries (see `ROLES.md`).

The table below is generated from the object literal, not typed. `✓` = the role is listed for that capability.

| # | Capability | owner | supervisor | store | mechanic | crewmanager | office | driver | conductor | Roles (count) |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| 1 | `addBus` | ✓ | ✓ |  |  |  |  |  |  | 2 |
| 2 | `addJob` | ✓ | ✓ |  |  |  |  |  |  | 2 |
| 3 | `verifyJob` | ✓ | ✓ |  |  |  |  |  |  | 2 |
| 4 | `issuePart` | ✓ | ✓ | ✓ |  |  |  |  |  | 3 |
| 5 | `receiveStock` | ✓ | ✓ | ✓ |  |  |  |  |  | 3 |
| 6 | `addPurchase` | ✓ | ✓ | ✓ |  |  |  |  |  | 3 |
| 7 | `dashboard` | ✓ | ✓ |  |  |  |  |  |  | 2 |
| 8 | `crewReviews` | ✓ | ✓ |  |  | ✓ | ✓ |  |  | 4 |
| 9 | `crewPerf` | ✓ | ✓ |  |  | ✓ | ✓ |  |  | 4 |
| 10 | `crewNote` | ✓ | ✓ |  |  | ✓ | ✓ |  |  | 4 |
| 11 | `insights` | ✓ | ✓ |  |  |  |  |  |  | 2 |
| 12 | `manageDrivers` | ✓ | ✓ |  |  | ✓ |  |  |  | 3 |
| 13 | `assignDriver` | ✓ | ✓ |  |  | ✓ |  |  |  | 3 |
| 14 | `gateCheck` | ✓ | ✓ |  |  |  |  | ✓ |  | 3 |
| 15 | `gateDecide` | ✓ | ✓ |  |  |  |  |  |  | 2 |
| 16 | `manageCrewLogins` | ✓ | ✓ |  |  |  |  |  |  | 2 |
| 17 | `bulkArchiveCrew` | ✓ |  |  |  |  |  |  |  | 1 |
| 18 | `logIncident` | ✓ | ✓ |  |  |  |  |  |  | 2 |
| 19 | `outsideJob` | ✓ | ✓ |  |  |  |  |  |  | 2 |
| 20 | `deleteJob` | ✓ |  |  |  |  |  |  |  | 1 |
| 21 | `logService` | ✓ | ✓ |  |  |  |  |  |  | 2 |
| 22 | `manageRoutes` | ✓ | ✓ |  |  |  |  |  |  | 2 |
| 23 | `addFuel` | ✓ | ✓ | ✓ |  | ✓ |  |  |  | 4 |
| 24 | `manageComponents` | ✓ | ✓ | ✓ |  | ✓ |  |  |  | 4 |
| 25 | `viewWarranty` | ✓ | ✓ | ✓ |  |  |  |  |  | 3 |
| 26 | `requestPart` | ✓ | ✓ |  |  |  |  |  |  | 2 |
| 27 | `money` | ✓ | ✓ |  |  |  |  |  |  | 2 |
| 28 | `fleet` | ✓ | ✓ |  |  |  |  |  |  | 2 |
| 29 | `people` | ✓ | ✓ |  |  |  |  |  |  | 2 |
| 30 | `bills` | ✓ | ✓ | ✓ |  |  |  |  |  | 3 |
| 31 | `garageSetup` | ✓ | ✓ |  |  |  |  |  |  | 2 |
| 32 | `manageStaff` | ✓ | ✓ |  |  |  |  |  |  | 2 |
| 33 | `challans` | ✓ | ✓ |  |  |  |  |  |  | 2 |
| 34 | `liveMap` | ✓ | ✓ |  |  | ✓ |  |  |  | 3 |
| 35 | `viewStore` | ✓ | ✓ | ✓ | ✓ |  |  |  |  | 4 |
| 36 | `viewJobs` | ✓ | ✓ | ✓ | ✓ |  |  |  |  | 4 |
| 37 | `viewScoreboard` | ✓ | ✓ | ✓ | ✓ |  |  |  |  | 4 |
| | **Capabilities held** | 37 | 35 | 10 | 3 | 8 | 3 | 1 | 0 | |

Observations that are facts of the table, not interpretation:

- `bulkArchiveCrew` and `deleteJob` are the only capabilities the owner holds alone.
- `receiveStock` is in `PERMS` but **no `can()` call in the app ever names it** — the Receive button is gated by `issuePart` (`app.js:4668`). Same role set today, so it is dead rather than wrong.
- `requestPart` excludes `mechanic`, although its only call site and its sheet are written for mechanics (section 4.2).
- `conductor` appears in no row. A conductor's whole app is role branches outside `PERMS`.
- `gateCheck` is the only capability the `driver` holds; `gateCheck` is *not* held by `store`, `crewmanager` or `office`.
- `crewmanager` holds `manageDrivers` and `assignDriver` but not `money`, `fleet` or `people`.

### 2.1 `PERMS` verbatim (`app.js:973-1061`, including every comment)

```js
const can = (role, perm) => (PERMS[perm] || []).includes(role);
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
   * them rewrite the roster. They are separate now: `crewPerf` opens the list,
   * the scorecard and the reviews; `manageDrivers` still guards every button
   * that writes. The office login has the first and not the second. */
  crewPerf: ['owner', 'supervisor', 'crewmanager', 'office'],
  // Writing down that a conversation happened. The office's one write.
  crewNote: ['owner', 'supervisor', 'crewmanager', 'office'],
  insights: ['owner', 'supervisor'],         // AI Insights screen
  // 'crewmanager' is a single-job login: the daily duty board and the crew bank,
  // and nothing else. It deliberately has no money, fleet, jobs or store rights.
  manageDrivers: ['owner', 'supervisor', 'crewmanager'],   // crew bank, details, documents
  assignDriver: ['owner', 'supervisor', 'crewmanager'],    // driver/conductor ↔ bus
  // Gate check: the driver fills it; owner and supervisor see every check and
  // decide go/hold on a failed one. Mirrors _guard_gatecheck on the server.
  gateCheck: ['owner', 'supervisor', 'driver'],
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
  // Sheet-only actions. These have no route of their own, so ROUTE_PERM never
  // sees them — they must be checked inside their own functions.
  garageSetup: ['owner', 'supervisor'],      // Garage setup sheet + saveGarage
  manageStaff: ['owner', 'supervisor'],      // Staff accounts sheet + saveStaff
  // Read-only screens that were reachable by any role because ROUTE_PERM had no
  // entry for them. Mechanics genuinely use these (store is a bottom tab, jobs is
  // their work list, the scoreboard is their leaderboard); drivers and conductors
  // never do — their nav is home + me.
  // Outstanding fines and court referrals are finance data, and each lookup
  // spends a billable credit — same gate the server applies.
  challans: ['owner', 'supervisor'],
  // Where the buses are is duty information, not money: the crew manager puts
  // people on those buses and needs to know which one is where. Its own
  // permission rather than widening `dashboard`, which also opens reports,
  // accounting, usage and the money screens.
  liveMap: ['owner', 'supervisor', 'crewmanager'],
  // 'mechanic' belongs in all three, and its absence made that login useless:
  // their nav carries a Store tab, their home screen lists their jobs and their
  // score — and every one of those taps bounced them back to the same home
  // screen, so they could not open a card, log hours or mark work done. What a
  // mechanic may see INSIDE a card is scoped per record (viewJobDetail's `mine`
  // check) and again on the server, which is where that belongs.
  viewStore: ['owner', 'supervisor', 'store', 'mechanic'],
  viewJobs: ['owner', 'supervisor', 'store', 'mechanic'],
  viewScoreboard: ['owner', 'supervisor', 'store', 'mechanic'],
};
```

---

## 3. Routes → required capability (`ROUTE_PERM`)

### 3.1 How the router applies it (`render`, `app.js:12751-12759`)

```js
function render(r) {
  ...
  if (ROUTE_PERM[r.name] && !can(S.user.role, ROUTE_PERM[r.name])) r = { name: 'home' };
  // `driverdocs` cannot be a flat ROUTE_PERM entry: staff manage everyone's
  // documents, but a driver still reaches their OWN locker from Me. So it is
  // permission-or-self, and has to be checked per id rather than per route.
  if (r.name === 'driverdocs' && !canDriverDocs(r.id)) r = { name: 'home' };
```

- **A failed check silently renders `home`** — no error, no 403, no log. The user's own home view is shown.
- **A route name with no `ROUTE_PERM` entry passes for every signed-in role.** The `switch` default is also `viewHome()`, so an *unknown* name is harmless; a *known* name with no entry is open.
- The check is **by route name only**. Id-bearing routes (`jobs`, `buses`, `drivers`, `store`, `scorecard`, `gate`, `track`, `busreport`, `busacct`, `buschallans`, `history`, `routes`, `components`, `vendors`) are NOT re-checked per record by the router. Per-record scoping exists only where a view adds its own check: `viewJobDetail` (mechanic must be on the job), `viewScorecard` (self unless owner/supervisor, `app.js:8020`), `viewGate` (edit only if own check, `_gateMine` — **but any holder of `gateCheck` can *view* any gate check by id**), `driverdocs` (`canDriverDocs`).
- The guard is in the client. Nothing on the server corresponds to a route.

### 3.2 `ROUTE_PERM` verbatim (`app.js:12736-12750`, including every comment)

```js
const ROUTE_PERM = { money: 'money', fleet: 'fleet', people: 'people', bills: 'bills', insights: 'insights', drivers: 'crewPerf', assignments: 'assignDriver', routes: 'manageRoutes', reports: 'dashboard', busreport: 'dashboard', livemap: 'liveMap', track: 'liveMap', fuel: 'addFuel', safety: 'dashboard', breakdowns: 'logIncident', warranty: 'viewWarranty', storehealth: 'issuePart', linkgps: 'addBus', newjob: 'addJob', forecast: 'dashboard', pilferage: 'insights', components: 'manageComponents', def: 'addFuel', vendors: 'addPurchase', import: 'addPurchase', crewpins: 'manageCrewLogins', crewbank: 'manageDrivers', usage: 'dashboard', accounting: 'dashboard', busacct: 'dashboard',
  // `purchases` renders the same view as `bills`; without its own entry the
  // `bills` permission was bypassable just by using the other route name.
  purchases: 'bills', alerts: 'dashboard', buses: 'fleet', gate: 'gateCheck', gatechecks: 'gateDecide', reviews: 'crewReviews', rbnames: 'manageDrivers', whynodriver: 'dashboard', coaching: 'manageDrivers', digest: 'dashboard',
  store: 'viewStore', jobs: 'viewJobs', scoreboard: 'viewScoreboard',
  challans: 'challans', buschallans: 'challans',
  // Company billing and another person's scorecard rendered for any role because
  // ROUTE_PERM had no entry for them — the same bypass class as `purchases`/`bills`.
  company: 'dashboard', scorecard: 'viewScoreboard',
  // These three had no entry, so any signed-in role could force them open: a
  // driver reached the fleet's completed work (spend, every bus, mechanics'
  // names) and the outside-job gate passes. Completed work follows the job
  // board (completedJobs() narrows a mechanic to their own); the passes follow
  // the role that issues them.
  history: 'viewJobs', outsidejobs: 'outsideJob', gatepass: 'outsideJob' };
```

### 3.3 The same table, one route per row (generated; 50 routes)

| # | Route | Required capability | Roles that pass |
|---|---|---|---|
| 1 | `money` | `money` | owner, supervisor |
| 2 | `fleet` | `fleet` | owner, supervisor |
| 3 | `people` | `people` | owner, supervisor |
| 4 | `bills` | `bills` | owner, supervisor, store |
| 5 | `insights` | `insights` | owner, supervisor |
| 6 | `drivers` | `crewPerf` | owner, supervisor, crewmanager, office |
| 7 | `assignments` | `assignDriver` | owner, supervisor, crewmanager |
| 8 | `routes` | `manageRoutes` | owner, supervisor |
| 9 | `reports` | `dashboard` | owner, supervisor |
| 10 | `busreport` | `dashboard` | owner, supervisor |
| 11 | `livemap` | `liveMap` | owner, supervisor, crewmanager |
| 12 | `track` | `liveMap` | owner, supervisor, crewmanager |
| 13 | `fuel` | `addFuel` | owner, supervisor, store, crewmanager |
| 14 | `safety` | `dashboard` | owner, supervisor |
| 15 | `breakdowns` | `logIncident` | owner, supervisor |
| 16 | `warranty` | `viewWarranty` | owner, supervisor, store |
| 17 | `storehealth` | `issuePart` | owner, supervisor, store |
| 18 | `linkgps` | `addBus` | owner, supervisor |
| 19 | `newjob` | `addJob` | owner, supervisor |
| 20 | `forecast` | `dashboard` | owner, supervisor |
| 21 | `pilferage` | `insights` | owner, supervisor |
| 22 | `components` | `manageComponents` | owner, supervisor, store, crewmanager |
| 23 | `def` | `addFuel` | owner, supervisor, store, crewmanager |
| 24 | `vendors` | `addPurchase` | owner, supervisor, store |
| 25 | `import` | `addPurchase` | owner, supervisor, store |
| 26 | `crewpins` | `manageCrewLogins` | owner, supervisor |
| 27 | `crewbank` | `manageDrivers` | owner, supervisor, crewmanager |
| 28 | `usage` | `dashboard` | owner, supervisor |
| 29 | `accounting` | `dashboard` | owner, supervisor |
| 30 | `busacct` | `dashboard` | owner, supervisor |
| 31 | `purchases` | `bills` | owner, supervisor, store |
| 32 | `alerts` | `dashboard` | owner, supervisor |
| 33 | `buses` | `fleet` | owner, supervisor |
| 34 | `gate` | `gateCheck` | owner, supervisor, driver |
| 35 | `gatechecks` | `gateDecide` | owner, supervisor |
| 36 | `reviews` | `crewReviews` | owner, supervisor, crewmanager, office |
| 37 | `rbnames` | `manageDrivers` | owner, supervisor, crewmanager |
| 38 | `whynodriver` | `dashboard` | owner, supervisor |
| 39 | `coaching` | `manageDrivers` | owner, supervisor, crewmanager |
| 40 | `digest` | `dashboard` | owner, supervisor |
| 41 | `store` | `viewStore` | owner, supervisor, store, mechanic |
| 42 | `jobs` | `viewJobs` | owner, supervisor, store, mechanic |
| 43 | `scoreboard` | `viewScoreboard` | owner, supervisor, store, mechanic |
| 44 | `challans` | `challans` | owner, supervisor |
| 45 | `buschallans` | `challans` | owner, supervisor |
| 46 | `company` | `dashboard` | owner, supervisor |
| 47 | `scorecard` | `viewScoreboard` | owner, supervisor, store, mechanic |
| 48 | `history` | `viewJobs` | owner, supervisor, store, mechanic |
| 49 | `outsidejobs` | `outsideJob` | owner, supervisor |
| 50 | `gatepass` | `outsideJob` | owner, supervisor |

### 3.4 Capabilities used by more than one route

| Capability | Routes it guards |
|---|---|
| `dashboard` | `reports`, `busreport`, `safety`, `forecast`, `usage`, `accounting`, `busacct`, `alerts`, `whynodriver`, `digest`, `company` (11) |
| `manageDrivers` | `crewbank`, `rbnames`, `coaching` (3) |
| `addPurchase` | `vendors`, `import` (2) |
| `addFuel` | `fuel`, `def` (2) |
| `liveMap` | `livemap`, `track` (2) |
| `viewJobs` | `jobs`, `history` (2) |
| `viewScoreboard` | `scoreboard`, `scorecard` (2) |
| `insights` | `insights`, `pilferage` (2) |
| `bills` | `bills`, `purchases` (2; `purchases` renders the same view as `bills`) |
| `fleet` | `fleet`, `buses` (2) |
| `challans` | `challans`, `buschallans` (2) |
| `outsideJob` | `outsidejobs`, `gatepass` (2) |

Capabilities in `PERMS` that guard **no route** (9): `verifyJob`, `receiveStock`, `crewNote`, `bulkArchiveCrew`, `deleteJob`, `logService`, `requestPart`, `garageSetup`, `manageStaff`. These are sheets/buttons/handlers only.
Every capability named in `ROUTE_PERM` exists in `PERMS` (no dangling names).

### 3.5 Routes with NO `ROUTE_PERM` entry (open to every signed-in role)

Of the 53 route names in the `render()` switch, these three have no entry:

| Route | Why that is (or is not) safe |
|---|---|
| `home` | Dispatches to the caller's own role home (`app.js:3147-3154`). Safe by construction. |
| `me` | The caller's own profile/attendance/menu. Items inside are gated individually (garage setup, staff, usage, import, alerts opt-in). Safe if every item stays gated. |
| `driverdocs` | Checked **per id** by `canDriverDocs`: `manageDrivers` OR the caller's own crew record (`app.js:1867`). Also checked on the sheet read/write paths. Not a hole, but not table-driven either. |

Any *other* route someone adds is open by default (this is exactly how the bypasses in section 6 happened).
The v2 design spec (§7) already decides this inverts to deny-by-default.

Not routes, but also outside `ROUTE_PERM`: **sheet actions** (`openSetup`, `openStaff`, `sheetAddCrew`, ...). They have no
route, so `ROUTE_PERM` never sees them; each must check inside its own function. That is why `garageSetup` and `manageStaff`
exist (section 6, item 8).

---

## 4. Where enforcement actually happens

### 4.0 The three layers and how to read this section

| Layer | What it is | Is it a security boundary? |
|---|---|---|
| **R** — client route guard | `ROUTE_PERM` + `render()` (bounces to `home`) | **No.** The client is code on the user's phone; a modified or scripted client skips it. |
| **H** — client in-handler guard | `if (!can(...)) return toast(...)` at the top of a write function | **No**, but it stops forced actions (`data-act` fired from console) in the stock app. |
| **U** — client UI visibility | button/section rendered only `if (can(...))` | **No.** Hiding a control is cosmetic. |
| **S** — server guard | `may_write` / `_guard_write` / `redact_for` / endpoint `me["role"]` checks | **Yes** — the only real boundary. |

A capability is "enforced" only if there is an **S** that corresponds to it. Per the brief, a capability enforced only by
R/H/U is **not enforced**. The server has no concept of a capability: it enforces **per store (write)** and **per store/field
(read)**, so "matching server guard" below means "a server rule that stops the same roles doing the same thing".

Every line in `app.js` containing a real `can(` call was enumerated: 112 lines (115 grep hits excluding the definition at line 973, less 3 false matches inside `inlineMediaScan(`; a few lines hold two calls).
Classification used: **R** = appears in `ROUTE_PERM`; **H** = checked at the start of the write function (or dispatcher arm);
**U** = only decides whether markup renders.

### 4.1 Per-capability enforcement table (all 37)

Server column: **W** = server write guard exists on the store(s) that capability writes, **R** = server read boundary, **—** = none.

| Capability | Client R (routes) | Client H (write handlers that check it) | Client U (visibility only) | Server | Verdict |
|---|---|---|---|---|---|
| `addBus` | `linkgps` | `importFleet` (3522), `autoReconcileFleet` (3547) | Buses FAB (3370), bus docs (3797), Add-bus btn (5986), fleet-revenue link (7752), **also used as the gate for the Add-driver FAB** (9406) | W: `buses` = owner, supervisor | Server-enforced. `saveBus`/`sheetAddBus` have no own check. |
| `addJob` | `newjob` | none (`saveJob`, `sheetAddJob`, `createJobFromReport` unchecked) | Jobs FAB (3944), "→ Job" (3792) | W (**weaker**): `jobcards` = owner, supervisor, **store**, mechanic; only `mechanic` is blocked from creating | **Server is looser than client**: a store login can create a job card. |
| `verifyJob` | — | `verifyJob` (9271), `rejectJob` (9298) | `jobLi` (3859), `actionsForJob` (4081) | W: transition to `verified` only owner/supervisor; owner cannot verify what owner closed; re-open only owner/supervisor | Server-enforced. |
| `issuePart` | `storehealth` | `reconcileJobParts` (1582) | Issue btn, blind count (4559/4668), tracked pieces (4719/3750-3754), fulfil request (9121), job parts card (4003) | W: `ledger`, `parts`, `audits` = owner, supervisor, store; ledger append-only for everyone incl. owner; stock changes logged to server-only `stockmoves` | Server-enforced. Also the de-facto gate for Receive (see `receiveStock`). |
| `receiveStock` | — | none | none (**never referenced by any `can()`**) | W: same stores as `issuePart` | Dead in the client; server covers the writes. |
| `addPurchase` | `vendors`, `import` | `togglePaid` (7003) | Store FAB (4677), Import (5630), Vendors (6766/6775/6783), Bills (7390/7400) | W: `purchases`, `vendors` = owner, supervisor, store; non-managers cannot alter a bill after entry except `paymentStatus/paidAt/paidBy`; `/ai/bill` = owner, supervisor, store | Server-enforced. `savePurchase`/`saveVendor` have no own check. |
| `dashboard` | `reports`, `busreport`, `safety`, `forecast`, `usage`, `accounting`, `busacct`, `alerts`, `whynodriver`, `digest`, `company` | `itsLookupRun` (10098) | Home boss block `isBoss` (3163), Usage menu (5637), digest/ITS/AI-review/review cards (10146, 10169, 10311, 10346, 10466) | R: `digest` store = owner/supervisor; `usage` store = owner/supervisor; `/its/lookup`, `/ai/digest`, `/ai/reviews` = owner/supervisor. **The records these screens compute from are not withheld** | **Client-only for the money/ops screens.** Server guards only the AI/digest/usage extras. |
| `crewReviews` | `reviews` | none (cards return `''`: 2616, 10607, 10613, 10649) | cards | R: `rbreviews`, `rbcomplaints`, `rbassign`, `rbreviewai` withheld from every role outside owner/supervisor/crewmanager/office; office gets journey fields stripped | **Server-enforced (read).** The one read capability with a real S. |
| `crewPerf` | `drivers` (list **and** `drivers/<id>`) | none | none | R (partial): crew PII fields stripped for non-PII roles. Performance records (`incidents`, `driverreports`, attendance) are not withheld | Mostly client-only; only PII fields are server-protected. |
| `crewNote` | — | `sheetCrewNote` (2394), `saveCrewNote` (2412), `crewNotesCard` (2433) | | W: `crewnotes` = owner, supervisor, crewmanager, office; immutable, author from token. R: other roles never receive notes | Server-enforced (read and write). |
| `insights` | `insights`, `pilferage` | none | none | S for the advisor: `/ai`, `/ai/vision` = owner/supervisor, 60 calls/day. The screens compute client-side from synced stores | **Client-only** for the two screens; AI call server-enforced. |
| `manageDrivers` | `crewbank`, `rbnames`, `coaching` | 14 handlers: `coachHomeCard` (2533), `sheetAddCrew` (11422), `saveCrew` (11508), `crewReuse` (11621), `sheetCrewProfile` (11652), `saveCrewProfile` (11684), `sheetCrewExit` (11720), `saveCrewExit` (11733), `archiveCrew` (11773), `restoreCrew` (11784), `rejoinCrew` (11817), `exportCrewCsv` (11832), `maybeBackfillConductors` (11941), `rbnSave` (10759), `revealDocNum` arm (13171) + `canDriverDocs` (1867) | `setSalary` btn (10920) | W: `drivers`, `dutylog`, `rbalias` = owner, supervisor, crewmanager; `/ai/coaching/decide`, `/ai/names`, `/upload/delete` include crewmanager | Server-enforced at store level. No field-level write guard on `drivers` (crewmanager may write any field, including `salaryMonthly`). |
| `assignDriver` | `assignments` | `ensureDutyBaselines` (1822) | Drivers list (9401), bus detail (3768) | W: `drivers`, `dutylog` = owner, supervisor, crewmanager; dutylog immutable once written | Server-enforced (cannot distinguish from `manageDrivers`, same role set). |
| `gateCheck` | `gate` | none (own-check logic via `_gateMine`) | | W: `gatechecks` = owner, supervisor, driver; driver may only fill own bus's check; releases only if every item passed | Server-enforced (strongest guard in the system). Read of any check by id is not restricted. |
| `gateDecide` | `gatechecks` | `gateAiLine` (9763), `gateAiNudge` (9776), `gateDecide` (9981), `gateDecideSave` (9989), `gateHomeSummaryCard` (10036) | `viewGate` (9883), `rvSourcesBlock` (10424) | W: only owner/supervisor, only on `awaiting` checks, reason mandatory, `by/byRole/at` from token | Server-enforced. |
| `manageCrewLogins` | `crewpins` | none | | W: `/auth/register-roster`, `/auth/users`, `/auth/setpin` = owner/supervisor, bounded by `may_manage` | Server-enforced. |
| `bulkArchiveCrew` | — | `bulkArchiveCrew` (11798) | button (11411) | **—** (bulk archive is just many ordinary `drivers` writes, allowed to owner/supervisor/crewmanager) | **Client-only.** "Owner only" is not true on the server. |
| `logIncident` | `breakdowns` | `saveBreakdown` (8893), `addIncident` arm (13272) | many (2281, 3721, 8859, 9572, 9612) | W: `incidents`, `breakdowns` = owner, supervisor | Server-enforced. `saveIncident` itself unchecked. |
| `outsideJob` | `outsidejobs`, `gatepass` | none (`saveGatePass` unchecked) | create FAB (4800), return (4949), job list (3935) | W: `gatepasses` = owner, supervisor | Server-enforced. |
| `deleteJob` | — | `deleteJob` arm (4124), confirm (4150) via `canDeleteJob` | button (4098) | W: only owner may set `_deleted` on a job card | Server-enforced. |
| `logService` | — | `logService` (9357), `confirmLogService` (9369) | Mark-service block (9351) | W (indirect): writes a verified job card (owner/supervisor only transition) and a bus (owner/supervisor) | Server-enforced by side effect. |
| `manageRoutes` | `routes` | none | alert nudge (12291) | W: `routes` = owner, supervisor | Server-enforced. |
| `addFuel` | `fuel`, `def` | none (`saveFuel`, `saveDef` unchecked) | buttons (3723, 7874, 8439, 8527) | W: `fuel`, `def` = owner, supervisor, store, crewmanager; append-only for non-managers | Server-enforced. |
| `manageComponents` | `components` | none | (3752, 5169, 5177, 5184) | W: `components` = owner, supervisor, store, crewmanager | Server-enforced. |
| `viewWarranty` | `warranty` | | | **—** | **Client-only (read).** |
| `requestPart` | — | none (`saveRequestPart` checks only mechanic-on-job) | button (9111) | **—** (a request is a write to `jobcards`, allowed to owner/supervisor/store/own-mechanic) | **Client-only**, and the mechanic branch is unreachable. |
| `money` | `money` | none | pay visibility: `sheetAddCrew` (11425), `sheetCrewProfile` (11655), `viewDriverDetail` (9589) | R (partial): `salaryMonthly` stripped for non-PII roles — but `crewmanager` is PII and lacks `money` | **Client-only**, and contradicted for `crewmanager` by the server. |
| `fleet` | `fleet`, `buses` | | | **—** | **Client-only (read).** |
| `people` | `people` | | | **—** | **Client-only (read).** |
| `bills` | `bills`, `purchases` | | | **—** (`purchases` store is delivered to every role) | **Client-only (read).** Writes covered by `addPurchase`. |
| `garageSetup` | — | `sheetGarageSetup` (7017), `saveGarage` (7056) | Me menu (5631) | W: `meta` = owner, supervisor, and only the row `garage` | Server-enforced. |
| `manageStaff` | — | `sheetStaff` (7173), `saveStaff` (7222), `canRemoveStaff` (7347) | `canRenameStaff` (7324) | W: `/auth/users*`, `/auth/setpin`, `users` store | Server-enforced (with `may_manage`). |
| `challans` | `challans`, `buschallans` | | bus detail (3692), alerts (7410) | S: `GET /challans` (the billable lookup) = owner/supervisor. **But the stored `challans` snapshots sync to every role** | Partly. The paid lookup is server-guarded; the **liability data is readable by every login**. |
| `liveMap` | `livemap`, `track` | | | **—** (`GET /gps`, `/gps/fleet`, `/gps/latest` accept **any** signed-in session; `gpsevents` history is owner/supervisor only) | **Client-only.** |
| `viewStore` | `store` | | | **—** (`parts`, `ledger` delivered to every role; `stockmoves` is owner/supervisor/store) | **Client-only (read).** |
| `viewJobs` | `jobs`, `history` | `viewJobDetail` mine-check (3967) | list filters `isOnJob` (3891, 3916) | Write scoping for mechanic: **yes** (own cards only). Read: **—** — every role receives every job card with costs | Write server-enforced; **read client-only**. |
| `viewScoreboard` | `scoreboard`, `scorecard` | `viewScorecard` self-or-manager (8020) | | **—** (`attendance` for all staff delivered to every role) | **Client-only (read).** |

### 4.2 Anomalies inside the client's use of `PERMS`

1. **`receiveStock` is never consulted.** Receive gating is `issuePart`. If v2 splits them, someone must decide who receives stock.
2. **`requestPart` blocks the mechanic it was written for.** `partsCardExtras` (9111): `can(role,'requestPart') && (role !== 'mechanic' || mine)`. `PERMS.requestPart = ['supervisor','owner']`, so a mechanic never sees the button; the `mine` clause is dead. Commit `d2d8afa` (2 Aug 2026) says the mechanic "now gets the request-part button", and the sheet is titled "'Need a part' sheet for mechanics". Either `PERMS` regressed or the button was intentionally taken away. UNDETERMINED which; owner must decide (section 8).
3. **One capability gating unrelated things.**
   - `addBus` also gates: adding a driver (9406), bus document edits (3797), importing the fleet, setting fleet revenue.
   - `issuePart` also gates: blind stock counts, tracked pieces/tyres, fulfilling part requests, the `storehealth` route.
   - `manageDrivers` also gates: salary entry, document-number reveal, redBus name matching, coaching approval, CSV export.
   - `dashboard` gates 11 routes, the whole boss block of the home screen, the digest card, the ITS lookup, the usage menu. (This is the conflation the owner flagged.)
   - `money` gates the money tab **and** whether a driver's salary is shown.
4. **`driverdocs` is permission-or-self**, outside the table.
5. **`bills`/`purchases`** are two routes for one view.

### 4.3 Inline role checks that are NOT in `PERMS` (a table-driven rebuild would lose all of these)

| Check | Where | What it does | Mirrored on server? |
|---|---|---|---|
| `mayCloseJob()` = owner, supervisor | `app.js:3878`; used in `partsCardExtras`, `actionsForJob`, `sheetCloseJob`, `confirmCloseJob`, `markDone` | only they may set a job to `done` | Yes (`_guard_write`: "only an owner or supervisor may close a job") |
| `selfSignsOff(role)` = supervisor | `app.js:3873` | supervisor's closed work verifies with no second person | Yes (but the **owner** may not verify what the owner closed) |
| Job card edit: `canEdit = mine || owner/supervisor`; `canAddProof` = owner/supervisor | `app.js:3968, 3972` | which fields are editable on a card | Partly (mechanic own-card rule) |
| Mechanic sees only own jobs | `app.js:3891, 3916, 3967, 8665` | list and detail filtering | Write only |
| `changeJobBus` / `saveJobBus` = owner | `app.js:4092, 4271, 4286` | move a verified card to another bus | Yes (`only an owner may move a verified job card to another bus`) |
| `sheetEditService` / `saveService` = owner, supervisor | `app.js:9065, 9086` | edit workshop clock times | Via `jobcards` (store/mechanic can still write unverified cards) |
| `viewScorecard`: self or owner/supervisor | `app.js:8020` | a mechanic sees only their own scorecard | No |
| `canDriverDocs(id)`: `manageDrivers` or own crew record | `app.js:1867` | identity documents | Partly: `drivers.docs` stripped for non-PII roles except own record |
| Add-staff role options; non-owner may add only mechanic/store/driver | `app.js:7202, 7245` | who can mint which account | Yes (`may_manage`; server also lets supervisor add `conductor`) |
| `canResetStaffPin(u)`: owner any other; supervisor only store/mechanic/driver/conductor | `app.js:7291-7295` | PIN reset | Yes (`may_manage`) |
| `canRenameStaff` owner/supervisor; `canRemoveStaff` owner only (never the last owner) | `app.js:7324, 7347` | rename/delete logins | Yes (rename: supervisor cannot touch an owner; delete: owner only, not self, not last owner) |
| `canSetServer` owner/supervisor | `app.js:7112` | sync-server URL | No (client convenience) |
| `tidyPhotos` owner/supervisor | `app.js:1480` | bulk photo cleanup | Photos deleted via `/upload/delete` = owner/supervisor/crewmanager |
| `dropReplacedPhotos` owner/supervisor/crewmanager | `app.js:5791` | delete replaced doc photos | Yes (`/upload/delete`) |
| `startFresh` owner | `app.js:7072` | wipes the local DB | N/A (local only) |
| `itsDiag` owner | `app.js:10179` | ITS diagnostics | Yes (`/its/lookup` diag owner) |
| Me menu: Garage setup, push opt-in, ITS, `maybeAutoActivateCrew`, `maybeBackfillContacts`, `reconcileStaffNames` owner/supervisor | `app.js:5631, 5655, 11012, 11029, 11913` | admin side effects at sign-in | Yes where they call `/auth/*` |
| `aiGradeCore`, AI report nudge owner/supervisor | `app.js:4026, 4326, 12180` | AI side calls | Yes (`/ai/*` owner/supervisor) |
| Driver/conductor branch in Me (own documents vault) | `app.js:5643` | own docs | n/a |
| Role-specific home view and nav | `app.js:3147-3154`, `NAVS` 1980 | what each role lands on | n/a |
| `PIN_NO_CACHE_ROLES` = owner, supervisor, crewmanager | `app.js:13621` | manager PINs never cached on the phone, so no offline sign-in for them | n/a |
| Offline sign-in takes the role from the **device's cached roster** | `app.js:13812-13884` | client role may differ from server | Server re-derives role from its `users` table on every request (`user_for_token`) |

### 4.4 Server write matrix vs. client capabilities

`may_write(role, store)` (`sync_server.py:3227`): (1) `SERVER_INGEST_ONLY` stores are **denied to everyone, owner included**;
(2) `owner` passes everything else; (3) otherwise the role must be in `WRITE_ROLES[store]`; (4) an unknown store is denied.
`push()` also stamps `_by/_byRole/_createdBy` from the token and rejects `_redacted` copies, id/data.id mismatch and markup in ids.
After `may_write`, `_guard_write` applies per-store rules (and applies to the owner too where stated).

| Store | Writers (`WRITE_ROLES`) | Client capability it corresponds to | Extra server rules |
|---|---|---|---|
| `ledger` | owner, supervisor, store | `issuePart`/`receiveStock` | append-only, no delete — **even for owner** |
| `purchases` | owner, supervisor, store | `addPurchase` | non-managers: after entry only `paymentStatus/paidAt/paidBy` may change; no delete |
| `vendors` | owner, supervisor, store | `addPurchase` | — |
| `parts` | owner, supervisor, store | `issuePart`/`receiveStock`/`addPurchase` | quantity changes logged to `stockmoves`, flagged unless a ledger row justifies them |
| `audits` | owner, supervisor, store | `issuePart` (blind count) | append-only for non-managers |
| `components` | owner, supervisor, store, crewmanager | `manageComponents` | — |
| `fuel`, `def` | owner, supervisor, store, crewmanager | `addFuel` | append-only for non-managers |
| `buses` | owner, supervisor | `addBus` | — |
| `meta` | owner, supervisor | `garageSetup` | only the row id `garage` |
| `routes` | owner, supervisor | `manageRoutes` | — |
| `drivers` | owner, supervisor, crewmanager | `manageDrivers`, `assignDriver` | **none** (no field rules) |
| `incidents` | owner, supervisor | `logIncident` | — |
| `breakdowns` | owner, supervisor | `logIncident` | — |
| `gatepasses` | owner, supervisor | `outsideJob` | — |
| `users` | owner, supervisor | `manageStaff` | roster row only; the credential table changes via `/auth/*` |
| `jobcards` | owner, supervisor, store, mechanic | `addJob`, `verifyJob`, `deleteJob`, `logService`, close | see "jobcards rules" below |
| `dutylog` | owner, supervisor, crewmanager | `assignDriver` | immutable once written, owner included; needs crew + seat + real time; `by` from token |
| `gatechecks` | owner, supervisor, driver | `gateCheck`, `gateDecide` | `_guard_gatecheck` (full state machine) |
| `rbalias` | owner, supervisor, crewmanager | `manageDrivers` (rbnames) | must name a real crew record; history kept; never deleted |
| `crewnotes` | owner, supervisor, crewmanager, office | `crewNote` | immutable, no delete, author from token |
| `trips`, `triplog` | owner, supervisor, driver | (no `PERMS` entry — driver role branch) | driver: own trips only, allowance/claimed expenses fixed, closed trips frozen; stop arrival own bus, once per stop per day |
| `attendance` | all 8 roles | (none) | non-managers: append-only; `userId` from token; server receive time; late check-ins flagged `atUnverified` |
| `usage` | all 8 roles | (none) | — |
| `driverreports` | owner, supervisor, store, mechanic, driver, conductor | (none) | non-managers: only the reporter may cancel, only while open and with no job |
| `gpsevents`, `gpslive`, `challans` | **nobody** (empty set) | — | server-ingest |
| `SERVER_INGEST_ONLY` (denied to everyone, even owner) | `gpsevents, gpslive, challans, odometerlogs, waconv, itslookup, stockmoves, rbservices, rbreviews, rbcomplaints, rbassign, rbreviewai, aimeta, rbaliasai, gateai, coreai, reportai, coachai, digest` | — | written only by named server routes (`/redpro/ingest`, `/ai/*`, `/gps/ingest`, WhatsApp) |

`jobcards` rules (`_guard_write`): only the owner may delete a card; staff cannot change hours/costs/outside/parts-down on a `verified` card;
only the owner may move a verified card to another bus; parts already issued are merged back, never dropped; **mechanic:** cannot create,
cannot delete, must be on the card's crew (read from the stored card), cannot change `assignees/assignedTo`; closing `done` needs owner/supervisor
and before+after photos (or a vendor bill); `verified` needs owner/supervisor, and the closer cannot be the verifier unless the verifier is a
**supervisor**; re-opening a verified card needs owner/supervisor; `closedBy/verifiedBy/verifiedAt` come from the token.

**Where the server is looser than the client's `PERMS`:**

1. **`jobcards` creation by `store`.** `PERMS.addJob` = owner, supervisor; the server blocks creation only for `mechanic`. A store token can open a new job card and edit any unverified card.
2. **`requestPart`.** No server rule distinguishes it.
3. **`bulkArchiveCrew`** (owner-only in the client) is unenforced on the server.
4. **`drivers` has no field rules**: `crewmanager` (no `money`) can write `salaryMonthly`; `crewmanager`/`supervisor` can write `userId` links.

### 4.5 Server endpoint guards (non-sync routes)

| Endpoint | Who may call | Notes |
|---|---|---|
| `GET /roster` | **anyone, unauthenticated** | id, name, role of every account (drives the login tiles). Deliberate (comment `sync_server.py:5231-5236`). |
| `GET /health` (and `/`) | **anyone** | deploy/db/feature-flag diagnostics (booleans, no secrets). |
| `GET /uploads/<32 hex>.jpg|png|pdf` | **anyone with the URL** | Unauthenticated read; protection is only that the `uuid4().hex` name is unguessable. Document photos (Aadhaar, licence) live here. When R2 storage is on, photos are served from the public bucket URL (`R2_PUBLIC_URL`) — same property, outside this server's control. |
| `GET /push/vapid` | anyone | public key. |
| `GET /pull` | any signed-in role | filtered by `redact_for` (section 5). Rate-limited per user. |
| `GET /my/coaching`, `/my/reviews` | any signed-in role | own rows only (by token id → crew record). |
| `GET /gps` | any signed-in role | live position of any bus. |
| `GET /gps/latest`, `/gps/fleet` | provider token, agent key (scope `gps`), or any signed-in role | |
| `GET /agent/crew|coaching|bus-papers` | agent keys only (scoped); sessions get 401 | not user roles |
| `GET /challans` | owner, supervisor | billable upstream lookup |
| `POST /auth/login` | public | per-user and per-IP lockout |
| `POST /odometer/submit` | owner, supervisor | |
| `POST /auth/users` | owner, supervisor, bounded by `may_manage` (supervisor: store, mechanic, driver, conductor; owner: any of the 8) | |
| `POST /auth/users/rename` | owner, supervisor (supervisor cannot rename an owner) | |
| `POST /auth/users/delete` | owner only; not self; not the last owner | |
| `POST /auth/setpin` | self, or a manager per `may_manage` | |
| `POST /auth/register-roster` | owner, supervisor | returns crew PINs to the caller's device |
| `POST /admin/backfill-contacts` | owner, supervisor | |
| `POST /push` | any signed-in role | store-level `may_write` + `_guard_write` per record |
| `POST /admin/import` | owner **and** `IMPORT_TOKEN` header **and** empty database (or `force`) | bypasses the write matrix (actor=None) |
| `POST /upload` | any signed-in role | rate-limited |
| `POST /upload/delete` | owner, supervisor, crewmanager | |
| `POST /ai`, `/ai/vision` | owner, supervisor (60 calls/day combined per user) | model fixed server-side |
| `POST /ai/bill` | owner, supervisor, store | |
| `POST /its/lookup` | owner, supervisor (`diag`: owner) | |
| `POST /ai/digest`, `/ai/reports`, `/ai/core`, `/ai/gate`, `/ai/reviews` | cron/extension token, or owner/supervisor | |
| `POST /ai/coaching`, `/ai/names` | cron/extension token, or `COACH_DECIDERS` / owner, supervisor, crewmanager | |
| `POST /ai/coaching/decide` | owner, supervisor, crewmanager (`COACH_DECIDERS`) | |
| `POST /push/subscribe`, `/push/test` | any signed-in role | role comes from the token, test goes to the caller's role only |
| `POST /redpro/ingest`, `/gps/ingest`, `/wa/webhook` | machine tokens / Meta signature | not user roles |

### 4.6 Capabilities enforced ONLY on the client (no corresponding server guard)

**Pure client-only (14):** `money`, `fleet`, `people`, `bills` (read side), `dashboard` (screens), `insights` (screens), `viewWarranty`, `liveMap`, `viewStore`, `viewJobs` (read side), `viewScoreboard`, `crewPerf` (all but PII fields), `bulkArchiveCrew`, `requestPart`.

**Partially client-only (2):** `challans` (the billable lookup is server-guarded; the stored liability data syncs to every role), `addJob` (server lets `store` create cards).

**Dead:** `receiveStock` (no client check at all; server guards the underlying stores).

**Server-enforced (the remaining 20):** `addBus`, `verifyJob`, `issuePart`, `addPurchase`, `crewReviews` (read), `crewNote`, `manageDrivers` (store-level), `assignDriver`, `gateCheck`, `gateDecide`, `manageCrewLogins`, `logIncident`, `outsideJob`, `deleteJob`, `logService`, `manageRoutes`, `addFuel`, `manageComponents`, `garageSetup`, `manageStaff`.

The read-side gap is structural, not a list of exceptions: the only stores the server withholds are in section 5.1.

---

## 5. Server redaction rules (`redact_for`, `_never_for`, `pull`)

Source: `sync_server.py:3683-3840` (`PII_ROLES`, `_DRIVER_PRIVATE`, `GPS_HISTORY_ROLES`, `HISTORY_DAYS`, `HISTORY_ROLES`, `_never_for`, `redact_for`).
`pull()` takes its cursor **before** redaction, so an omitted record counts as delivered and the device never re-asks.
`_never_for` is a performance mirror of `redact_for` expressed in store terms so the query can skip rows; `test_pullscope.py` checks they agree.
`sync.js:101` holds a client copy of `PII_ROLES` to decide whether to rewind the pull cursor on a role change (`SCOPE_V = 'v2'`).

**Role groups used by redaction**

- `PII_ROLES` = `owner`, `supervisor`, `crewmanager` — receive crew records whole and all review/AI stores.
- Everyone else (`store`, `mechanic`, `office`, `driver`, `conductor`) is "non-PII" and gets field-level stripping.
- `office` is deliberately outside `PII_ROLES` but is given a carve-out for the review stores.
- With **no actor** (`actor=None`, i.e. internal calls) `redact_for` returns everything past the store-level checks.

### 5.1 Store-level: who receives records of a store at all

R = receives. Blank = the store is not sent to that role (it is skipped in the SQL query and, defensively, in `redact_for`).

| Store | owner | supervisor | crewmanager | office | store | mechanic | driver | conductor | Window / note |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| `aimeta` | | | | | | | | | **nobody** — server bookkeeping, not even the owner |
| `digest` (Monday summary, carries money) | R | R | | | | | | | |
| `crewnotes` | R | R | R | R | | | | | |
| `gpsevents` | R | R | | | | | | | last 30 days (`GPS_HISTORY_DAYS`); `test_gpshistory.py` asserts `crewmanager` does NOT get it |
| `stockmoves` | R | R | | | R | | | | last 180 days |
| `usage` | R | R | | | | | | | last 90 days |
| `audits` (stock counts) | R | R | | | R | | | | last 365 days |
| `triplog` | R | R | R | R | R | R | R | R | last 120 days, every role |
| `dutylog` | R | R | R | R | R | R | R | R | last 365 days, every role |
| `waconv` (keyed by a crew member's phone) | R | R | R | | | | | | |
| `itslookup` (passenger PNR/seat/journey) | R | R | R | | | | | | |
| `rbaliasai`, `gateai`, `coreai`, `reportai`, `coachai` (Claude's drafts) | R | R | R | | | | | | |
| `rbreviews`, `rbcomplaints` | R | R | R | R* | | | | | *office: journey fields stripped, see 5.2 |
| `rbassign`, `rbreviewai` | R | R | R | R | | | | | |
| `rbservices` | R | R | R | R | R | R | R | R | deliberately sent to drivers (gate-check service picker) |
| `rbalias` | R | R | R | R | R | R | R | R | the name→crew match; sent to every role |

The history windows apply to **every** role, owner included ("this is about volume, not privacy", `redact_for` comment); a record older than its window is simply never sent.

**Every other store is delivered in full to all eight roles**, field-level rules below aside. That includes, non-exhaustively:
`purchases`, `vendors`, `ledger`, `parts`, `jobcards` (with labour and outside costs), `fuel`, `def`, `components`, `buses`, `routes`, `drivers` (minus fields below),
`incidents`, `driverreports`, `trips` (driver cash allowance and expenses), `breakdowns`, `gatepasses`, `gatechecks` (including selfie URLs), `challans`, `attendance` (every staff member's), `users` (roster), `meta` (garage settings incl. late-penalty rules), `gpslive`, `odometerlogs` (minus `phone`).

### 5.2 Field-level: what is stripped inside a record that is sent

Applied only to non-PII roles (`store`, `mechanic`, `office`, `driver`, `conductor`). Stripped copies are marked `_redacted: true`; the server refuses to accept a `_redacted` record back in `/push`, and the device never pushes them.

| Store | Condition | Fields removed |
|---|---|---|
| `drivers` (crew bank) | the record's `userId` is not the caller's own id | `phone`, `altPhone`, `address`, `dob`, `bloodGroup`, `license`, `docs`, `salaryMonthly` (`_DRIVER_PRIVATE`) |
| `drivers` | the record IS the caller's own (`userId == actor.id`) | nothing — the driver/conductor sees their own record whole |
| `buses` | always | `crewPhone` |
| `odometerlogs` | always | `phone` |
| `rbreviews`, `rbcomplaints` | caller is `office` | `pnr`, `tin`, `seats`, `fare`, `boardAt`, `doj`, `amount` |
| anything else | | none |

### 5.3 What the redaction does NOT cover (verified against the client's record shape)

1. **Crew emergency-contact and reference details are not stripped.** `saveCrew`/`saveCrewProfile` write `emgName`, `emgPhone`, `emgRelation`, `refName`, `refPhone` onto the `drivers` record (`app.js:11526, 11698`); none of those appears in `_DRIVER_PRIVATE`, and the strings occur nowhere in `sync_server.py`. A driver, conductor, mechanic, store or office login receives other people's **emergency-contact and reference phone numbers**. The same applies to the HR fields `leftAt`, `leftReason`, `leftNote`, `rehire` (`app.js:11739-11744`) and the face `photo` URL.
2. **`crewmanager` receives `salaryMonthly`** because it is in `PII_ROLES`, while the client hides pay from anyone without `money` (`canSeePay`, `app.js:11425, 11655`). The two models disagree about whether pay is "identity" or "money".
3. **`office` receives other crew's driving-performance records** (`incidents`, `driverreports`) in full — only phone/address/licence/docs/salary are removed.
4. **`gatechecks` (selfies, face verification, lat/lng) and `trips` (cash)** are delivered to every role.
5. **`users` roster** goes to every role and unauthenticated callers get the same via `/roster`.
6. Any field not named in the tables above is delivered. The rule is a deny-list of five record types, not an allow-list per role.

### 5.4 What the two test files encode as intended rules

`test_pullscope.py` (skip list vs `redact_for`; 44 stores × 8 roles):

- For every role and every store: nothing in `_never_for(actor)` may be a store `redact_for` would have kept. (Skipping too much is the failure it guards against.)
- `_never_for(None)` skips only `aimeta, digest, crewnotes` plus `HISTORY_ROLES` stores.
- A driver's phone skips `gpsevents` and `rbreviews`. The office skips `gpsevents` but **not** `rbreviews`. The owner skips only `aimeta`.
- Every role still receives everything `redact_for` allows it, including records stored *behind* a 2,000-row GPS wall; non-owner roles need fewer pages than the owner.
- A record committed between the cursor read and the page read is not stepped over (race fix).

`test_office.py` (the `office` role):

- `office` is in `ALL_ROLES` and **not** in `PII_ROLES`.
- Cannot write: `drivers`, `rbreviews`, `buses`, `jobcards`, `ledger`, `rbalias`, `dutylog`.
- Can write `crewnotes` (must name a crew member and have text; immutable even for the owner; no delete; `by` is the token's id), its own `attendance`, and `usage`.
- Driver and mechanic receive **no** `crewnotes`; office receives them.
- Office receives a crew member but with `phone`, `license`, `salaryMonthly`, `address`, `docs` removed and `name` kept; owner sees all.
- Office receives `rbreviews`, `rbassign`, `rbreviewai`, `rbcomplaints`, `rbalias`; does NOT receive `itslookup` or `rbaliasai`; the review arrives without `pnr, tin, seats, fare, boardAt`, with stars and comment kept, marked `_redacted`.
- A driver's phone receives none of the review stores or `itslookup`.

**What no test asserts:** that a driver/conductor/mechanic/store cannot receive `purchases`, `jobcards` costs, `trips`, `incidents`, `challans`, or `attendance`. Those are not intended-and-tested rules; they are simply not rules.

---

## 6. Known past failures

### 6.1 The six recorded ROUTE_PERM bypasses

The comments inside `ROUTE_PERM` (`app.js:12737-12749`) record six routes that rendered for roles they should not have, because the route had no entry or an alias bypassed the entry. Dates and commits are from `git log -S`.

| # | Route | Found / fixed | What leaked or opened | How it was fixed |
|---|---|---|---|---|
| 1 | `purchases` (alias of `bills`; renders `viewPurchases`) | commit `d2d8afa`, 2 Aug 2026 ("Close the role-scoping gaps the 5-role regression found") | The `bills` guard (supplier bills, purchase totals) could be bypassed just by navigating to the other route name. Same commit: `buses`, `alerts`, `store`, `jobs`, `scoreboard` had no entry at all. | Added `purchases: 'bills'` (and entries for the others); `store/jobs/scoreboard` left open to mechanics on purpose. |
| 2 | `company` | commit `c5c11a1`, 18 Aug 2026 ("Scope the routes that ROUTE_PERM never covered"; found by the launch QA driving all roles) | Fleet-wide **company billing** rendered for a driver and a conductor. | `company: 'dashboard'` |
| 3 | `scorecard` | commit `c5c11a1`, 18 Aug 2026 | **Another person's scorecard** (score, attendance, late penalty) rendered for any role. | `scorecard: 'viewScoreboard'`, plus `viewScorecard` self-or-owner/supervisor check (`app.js:8020`) |
| 4 | `history` | commit `36e7eee`, 17 Oct 2026 (found by the `/g-saathi` run of 17 Oct) | A driver reached **the fleet's completed work: spend, every bus, mechanics' names**. | `history: 'viewJobs'` (`completedJobs()` still narrows a mechanic to their own work) |
| 5 | `outsidejobs` | commit `36e7eee`, 17 Oct 2026 | The **outside-job gate passes** list reachable by any role. | `outsidejobs: 'outsideJob'` |
| 6 | `gatepass` | commit `36e7eee`, 17 Oct 2026 | A single **gate pass** reachable by any role. | `gatepass: 'outsideJob'` |

Common cause, stated in the code: `ROUTE_PERM` is allow-list-by-presence for *restriction* — a route that is not in the map is open. Each was fixed by adding a line; nothing prevents a seventh.

### 6.2 Other recorded failures of the same family (from commit messages and code comments)

| Area | What happened | Fix |
|---|---|---|
| `driverdocs` route (`c5c11a1`, 18 Aug 2026) | A driver and a conductor opened **another driver's identity-document locker**; the document sheets had no check on the **write** path either. | Per-id `canDriverDocs` (permission-or-self) on both read and write; cannot be a flat `ROUTE_PERM` entry. |
| Sheet-only actions `openSetup`, `openStaff` (`d2d8afa`, 2 Aug 2026) | A mechanic or driver could force-fire the action and render the owner sheets; `saveGarage` **persisted** — widening the attendance geofence and zeroing the late-arrival penalty that polices their own check-in. | Checks inside `sheetGarageSetup`/`saveGarage`/`sheetStaff`/`saveStaff` (`garageSetup`, `manageStaff`). Server `meta` already owner/supervisor-only, so it could not sync. |
| `viewJobDetail` (`c5c11a1`) | `mine` was computed and never enforced: a mechanic opened another mechanic's card and completed a part request on it. | Detail route enforces ownership; request-part follows ownership. |
| Mechanic close button (`36e7eee`, 17 Oct) | The "Close job" button opened for `mine`; the phone wrote `done`, the server then refused. | `mayCloseJob()` (owner/supervisor) behind every close path. |
| Mechanic could not work (`8db78e7`, 12 Oct) | `viewStore/viewJobs/viewScoreboard` omitted `mechanic`, so every tap bounced to home. | Added `mechanic` to those three. |
| `/pull` handed every role everything (`b739e83`, 16 Sep) | A conductor's login could download every colleague's Aadhaar, licence, phone and salary. | `redact_for` + `PII_ROLES`. |
| Privilege escalation via `/auth/*` (`b739e83`) | A supervisor could reset the owner's PIN (and sign in as owner) or mint an owner login. | `may_manage`. |
| `jobcards` granted by role alone (`fbcd246`, 15 Sep) | One crafted request let any mechanic edit **any** card. | Own-card, no-create, no-delete, no-close rules in `_guard_write`. |
| Other stores writable by role alone (`09a83fc`, 16 Sep) | Staff could zero a stock count, rewrite fuel or a bill, reopen trip cash, clear their own late marks, forge stop arrivals. | Append-only / own-record rules (section 4.4). |
| AI proxy open to any login (`09a83fc`) | Any role could use the operator's Anthropic key as a general proxy. | `ai_allowed`: owner/supervisor, daily cap. |
| `/push/test` (`43d328a`) | A test from any login fired every subscription. | To the caller's role only. |
| Office reviews leaked passenger bookings (`bd11e75`, 1 Nov 2026) | Giving `office` whole review records exposed PNR/tin/seats/fare/boardAt. | Journey fields stripped, record marked partial. |
| Office received no reviews (`db6101f`, 1 Nov 2026) | One check (`PII_ROLES`) gated both crew documents and reviews, so the only role meant to read reviews got none. | Reviews asked separately. |
| 42,000 GPS rows to every phone (`9369390`, 12 Oct) | Volume, not privacy; owner's phone too. | `gpsevents` owner/supervisor only, 30-day window. |

---

## 7. Cross-check of `ROLES.md` against the code

`ROLES.md` is **stale and should not be used as a source**. Its own header says `app.js` is "~1650 lines"; it is 14,163. Code wins on every row below.

| `ROLES.md` says | Code says |
|---|---|
| 5 roles: owner, supervisor, store, mechanic, driver | **8 roles**; adds `crewmanager`, `office`, `conductor` |
| `PERMS` has 7 entries (`addBus, addJob, verifyJob, issuePart, receiveStock, addPurchase, dashboard`) | **37 entries** |
| "There is no gate at all on the router (`render`)" | `ROUTE_PERM` (50 routes) + `render()` fallback to `home`; `driverdocs` per-id |
| Gap G2: `assignDriver` button unconditional; proposes `assignDriver: ['owner','supervisor']` | Exists as `assignDriver: ['owner','supervisor','crewmanager']`; gates the `assignments` route and the button |
| Gap G5: Receive uses `issuePart`, `receiveStock` never consulted | Still true |
| Gap G6: `logService` ungated | `logService` capability exists and is checked in `showGps`, `logService`, `confirmLogService` |
| Gap G3: insights/drivers reachable by anyone who is linked | `insights: 'insights'`, `drivers: 'crewPerf'` in `ROUTE_PERM` |
| "AI Insights — owner only (target)"; supervisor gets an ops subset | `insights` = owner **and** supervisor; server `/ai` = owner/supervisor |
| Owner and supervisor homes identical; store and mechanic share one generic home | Every role has its own home view (`viewHome` dispatch) |
| Bottom nav: owner = Home·Buses·Jobs·Store·Me; mechanic = Home·Jobs·Store·Me | Owner = Today·Money·Fleet·People·Me; mechanic = My work·Store·Me |
| Store: Buses "View only" | `store` has no `fleet`/`buses` route access |
| Mechanic jobs filtered to their own | Correct, and now also enforced server-side per card |
| Driver: two-tab nav, report a problem | Correct, plus `gateCheck` (the departure checklist) |
| Staff accounts: owner/supervisor | `manageStaff` owner/supervisor, but only the owner can create `supervisor/crewmanager/office/owner`; server `may_manage` is the authority |
| Nothing about server enforcement | Server has its own write matrix, per-record rules, redaction, endpoint guards (sections 4 and 5) |
| Nothing on `conductor`, `crewmanager`, `office` | Defined above |

Also stale elsewhere (not `ROLES.md`): `TRAINING_MANUAL.html` says driver/conductor logins are being withdrawn and mechanics "do not sign in"; the Add-staff sheet still labels mechanic "no login" (`app.js:7200`) although `NO_LOGIN_ROLES` is empty and mechanics do sign in (`app.js:13362-13373`). The v2 design spec (`docs/superpowers/specs/2026-11-01-garage-saathi-v2-design.md` §6) says "Mechanics do not sign in today" — also stale.

---

## 8. Open questions the owner must decide

### 8.1 Supervisor ≈ owner in a cash-handling business

Fact: a supervisor holds **35 of 37** capabilities; the only two denied are `deleteJob` and `bulkArchiveCrew`. They also reach all 50 routes (identical route set to the owner), write `purchases`/`vendors`/`ledger`/`fuel`/`meta` on the server, run `/ai` with the operator's key, create and reset any store/mechanic/driver/conductor login, and **sign off their own closed work with no second person** (owner's decision of 15 Sep 2026, `selfSignsOff` / `_guard_write`). Money screens (`money`, `accounting`, `busacct`, `company`, `reports`, `forecast`, `bills`/`purchases`) and crew pay are all open to them.

The owner has already decided, on **2 Nov 2026** (`cfa254a`, v2 design spec §6): *a supervisor keeps operations (jobs, crew, store, duty, gate, challans, fuel) and loses company money (cash reconciliation, bills and purchase totals, P&L, cost per km).* **Nothing in the code implements it.** The decision is blocked on the two splits below. Questions still open:

1. **Does any supervisor do the cash reconciliation today?** The spec says it must move to a login that keeps it *before* the permission changes. Unconfirmed.
2. **Is a supervisor's self-sign-off still wanted** now that the same owner is taking company money away from the role? The two decisions (15 Sep, 2 Nov) pull in opposite directions.
3. **Who should see crew salary?** `money` currently gates pay visibility. Removing `money` from `supervisor` also removes pay from the people who hire and manage the crew (and `crewmanager` already receives pay from the server). Decide whether pay is a `money` or a `people` matter.
4. **Challans.** The `PERMS` comment calls outstanding fines "finance data" and gates them owner/supervisor; the 2 Nov decision says the supervisor *keeps* challans. Which wins?
5. **Warranty** is described in `PERMS` as "parts-and-supplier money". Operational or company money?
6. **Does removing the capability remove the data?** No: because the server delivers `purchases`, `vendors`, `ledger`, `parts` costs, `jobcards` costs and `attendance` to every role, taking `money`/`bills` away from `supervisor` in `PERMS` changes what the app *draws*, not what the supervisor's token can download or what they can still write (`WRITE_ROLES` lets them write `purchases`, `vendors`, `fuel`, `meta`). A real scope change needs server read scoping and a write-matrix change in the same release.
7. **Two supervisors (Vajid, Latif) exist.** Is the intended end state one rule for both, or a "senior supervisor"?

### 8.2 The unresolved capability splits (named in the 2 Nov decision)

**`dashboard` → at least `viewAlerts` + `viewCompanyBilling`.** `dashboard` currently guards 11 routes, the whole boss block on the owner/supervisor home, the digest card, the ITS lookup and the Usage menu. Dropping it from `supervisor` removes the alerts they use hourly; keeping it leaves company billing open. Needed from the owner: a route-by-route assignment. Only two are decided by the spec's wording: `alerts` → `viewAlerts`, `company` → `viewCompanyBilling`. **Undecided: `reports`, `busreport`, `safety`, `forecast`, `usage`, `accounting`, `busacct`, `whynodriver`, `digest`**, plus the home cards, the ITS/AI-review cards, and `/its/lookup`, `/ai/digest`, `/ai/reviews` on the server.

**`bills` → at least `manageSupplierBills` + `viewSpendTotals`.** `bills` guards the bills screen, which is one view (`viewPurchases`) that mixes the supplier-bill list/mark-paid with purchase totals. `store` holds `bills` for the operational half and must keep it. Needed: which fields/totals are "spend totals"; whether `vendors`/`import`/`addPurchase` follow `manageSupplierBills`; whether `supervisor` keeps *manage* (marking paid, entering) without *totals*. The `viewPurchases` screen must be split too, not just the permission.

### 8.3 Decisions the code forces on a rebuild

1. **Server read scoping.** Decide what each of the 8 roles may *receive* (the v2 spec §7 says "the same declaration drives what the server will send" but nothing implements it). Today the answer is "everything except the five lists in section 5.1". The single decision that most changes the rebuild's security.
2. **Crew emergency/reference contacts and HR exit fields** (section 5.3.1): who may receive them? Today any role.
3. **`crewmanager` and pay.** Server sends `salaryMonthly` to `crewmanager`; client hides it. Which is intended?
4. **Do driver and conductor logins exist in production?** The training manual says they are being withdrawn; the server issues per-person PINs and the app has full flows. `conductor` has zero capabilities — is that intended, or should it get something (e.g. a reduced `gateCheck`)?
5. **`requestPart`:** should a mechanic be able to request a part? The code and commit history say yes in intent; `PERMS` says no.
6. **`receiveStock` vs `issuePart`:** one capability or two? Who receives stock today is by accident of reuse.
7. **`addJob` and `store`:** the server lets `store` create job cards. Intended (to attach parts) or a hole?
8. **`bulkArchiveCrew`:** is "owner only" a real requirement? It is not enforceable on the server as the data model stands (no distinct bulk operation).
9. **Live map (`liveMap`) and `/gps`:** any signed-in role may read any bus's live position from the server. Intended?
10. **Unauthenticated `/uploads/<random>` and `/roster`:** the document photos (Aadhaar, licence) are protected only by an unguessable name; the roster (ids, names, roles of all accounts) is public by design. Keep?
11. **Owner continuity.** One owner account; a supervisor cannot reset the owner PIN and the last owner cannot be deleted. The recovery path for a forgotten owner PIN is mentioned in commit `c3adbd8` / the manual but not traced here: UNDETERMINED.
12. **Who holds `crewmanager` and `office`?** No person is named in the repo; UNDETERMINED, and needed before role migration. Also UNDETERMINED: number of storekeepers and mechanics in real use.
13. **Where enforcement lives in v2.** Today role lists are duplicated in `PERMS`, `sync.js` `PII_ROLES`, and ~25 places in `sync_server.py` (including `WRITE_ROLES`, `HISTORY_ROLES`, `COACH_DECIDERS`, `SUPERVISOR_MANAGES`). One declaration should drive all of them.

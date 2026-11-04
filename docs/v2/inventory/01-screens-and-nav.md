# 01 - Screens and navigation (Garage Saathi, as coded)

Source of truth: `app.js` (14,163 lines) at branch `launch-v2`. Line numbers below are for that file.
Docs consulted and cross-checked: `FEATURES.md`, `SITEMAP.html`, `ROLES.md`. Where they disagree with the code, the code wins and the gap is logged in section 7.

Method: read `render(r)` (line 12751) and the `switch` inside it; read each `view*()` function; read `bottomnav()` (line 1980) and `viewMe()` (line 5600); read `PERMS` (line 974) and `ROUTE_PERM` (line 12736). "Reached from" was derived by grepping every opener (`data-nav=`, `data-act="openX"` plus its `case 'openX': return push(...)` handler, entity drill attributes such as `data-bus=`, and direct `push({ name: ... })` calls). Nothing was executed.

## 0. Headline numbers

| Thing | Count |
|---|---|
| Route names in the `render()` switch | **53** |
| View functions the switch dispatches to | 59 (7 routes split into list + detail on `r.id`: `buses`, `jobs`, `store`, `drivers`, `routes`, `components`, `vendors`; `bills` and `purchases` share one function) |
| `view*` functions defined in total | 69 (the other 10: 8 per-role home functions, `viewPhoto`, `viewComplaintsTab`) |
| Routes with no `ROUTE_PERM` entry | 3: `home`, `me` (open to all by design), `driverdocs` (permission-or-self, checked per id by `canDriverDocs`) |
| Roles | **8**: `owner`, `supervisor`, `store`, `mechanic`, `driver`, `conductor`, `crewmanager`, `office` (`ROLE_META`, line 13360) |
| Permission names in `PERMS` | 37 |
| Bottom-nav tabs per role | owner 5, supervisor 5, store 4, mechanic 3, crewmanager 4, office 4, driver 2, conductor 2 (29 slots total) |
| Per-role home screens (what route `home` renders) | 8 |
| Modal "sheet" forms (`function sheet*`) | 45 (not routes; most writes happen here) |
| Me-menu "More" card actions | 8 distinct (`openImport`, `openSetup`, `lang`, `theme`, `changePin`, `openUsage`, `openSync`, `logout`); 15 distinct `data-act` values on the whole Me screen |
| Routes with no working UI entry point at all | 4 (`forecast`, `warranty`, `company`, `routes`) plus the list form of `buses`; `linkgps` has one conditional entry |
| URL/deep-link routing | **none** (see 1.2) |

## 1. How navigation works (read this before the table)

### 1.1 Mechanics
- A stack, not URLs. `S.stack` is an in-memory array. `navTab(name)` resets the stack to one root; `push(r)` adds a level; `back()` calls `history.back()`; a `popstate` handler pops the stack (line 12871). Browser BACK is mirrored so it never leaves the app (`histPush`, `_tabTrail`).
- `render(r)` first applies `ROUTE_PERM[r.name]`; if the role lacks the permission, it **silently renders `home`** instead (line 12754). There is no "not allowed" message. Any unknown route name also renders `viewHome()` (the `default:` case).
- The permission check is on the route name only. Per-record scoping happens inside the view (mechanic sees only jobs where `isOnJob`; a non-owner/supervisor can only open their own `scorecard`; `driverdocs` is own-or-manager).
- **`data-nav` is not only for tabs.** `_dispatchClick` sends every `data-nav="x"` to `navTab('x')`, which resets the stack. 11 distinct literal values are used: `me`, `jobs`, `fleet`, `store`, `storehealth`, `coaching`, `livemap`, `fuel`, `digest`, `def`, `components`. Only `me`, `jobs`, `fleet`, `store` are ever bottom tabs. The rest are drill-ins that behave like tab switches (stack reset, `_tabTrail` push). AI-insight cards also emit `data-nav` for `safety`, `crewbank`, `store`, `storehealth`, `def` (line 12635).
- Entity drill-ins (`push`, keep history): `data-job` -> `jobs/<id>`, `data-bus` -> `buses/<id>`, `data-part` -> `store/<id>`, `data-driver` -> `drivers/<id>`, `data-company` -> `company/<id>`, `data-routebus` -> `routes/<id>`, `data-challanbus` -> `buschallans/<id>`.
- Tab highlight comes from `TAB_OF` (line 1963). It maps sub-screens to the parent tab, but is written for the owner/supervisor tab sets; for other roles a sub-screen often lights no tab (e.g. a store keeper on `purchases` maps to `money`, which the store nav does not have).
- Global chrome on every routed screen (`topbar`, line 1950): back button (only when stack depth > 1, else a "GS" logo), page title, sync-status chip (only shown when sync is stuck/loading; tapping it goes to `me`), theme toggle (`theme`), language toggle (`lang`, EN/Hindi).

### 1.2 What is NOT a route
- **No URL routing or deep linking.** Login always ends in `route({ name: 'home' })` (`enterApp`, line 13892). There is no hash/query parsing. A push-notification tap only focuses an existing window or opens `/` (`sw.js` lines 75-81). So the "deep link only" category in the table is empty.
- **Login** is outside `render()`: `renderLogin` (role list + "recent on this phone") -> `renderRolePick` (name list, searchable when > 6) -> `renderPin` (PIN pad). `NO_LOGIN_ROLES` is an empty set, so all 8 roles can sign in.
- **Boot screen** (`showBootProgress`), **photo viewer** (`viewPhoto` opens a sheet, or a PDF), **face-capture overlay** (`captureFace`, used by check-in and gate checks).
- **45 sheets** (`function sheet*`), e.g. `sheetAddBus`, `sheetAddDoc`, `sheetEditJob`, `sheetIssue`, `sheetReceive`, `sheetAddStock`, `sheetAddPurchase`, `sheetAddVendor`, `sheetAddFuel`, `sheetAddDef`, `sheetAudit`, `sheetBreakdown`, `sheetGatePass`, `sheetReturnGatePass`, `sheetAddComponent`, `sheetFitComp`, `sheetFitPieces`, `sheetSendOut`, `sheetReceiveComp`, `sheetAddCrew`, `sheetCrewProfile`, `sheetCrewExit`, `sheetAssignBus`, `sheetAssignDriverToBus`, `sheetIncident`, `sheetTripReport`, `sheetStartTrip`, `sheetAddTripExp`, `sheetDriverDoc`, `sheetAddStop`, `sheetStaff`, `sheetGarageSetup`, `sheetChangePin`, `sheetSync`, `sheetCrewNote`, `sheetRequestPart`, `sheetCloseJob`, `sheetEditService`, `sheetChangeJobBus`, `sheetDeleteJob`, `sheetReturnCore`, `sheetAddDriver`, `sheetAddPart`, `sheetCrewDuplicate`. Several of these are whole workflows (Staff accounts, Garage setup, Sync/device, Close job with hours, Crew profile).
- **The new-job form** is a route (`newjob`) but is a multi-step wizard inside one route (`wizGo`/`wizNext`/`wizBack`), with a localStorage draft (`gs-jobdraft`).
- **Dead code:** the tail of `viewHome()` (lines 3155-3297) is a generic dashboard for "any other role". All 8 roles return earlier, so it never runs. It is the only opener for `company`, `routes`/`openRoutes`, the `buses` list tile and the `store` tile (see 1.3).

### 1.3 Reachability problems found while tracing openers
These are facts about the UI as coded, not permission statements.

1. **Orphan routes (no live opener anywhere):**
   - `forecast` - `case 'openForecast'` exists (line 13092) but nothing renders `data-act="openForecast"`.
   - `warranty` - `case 'openWarranty'` exists (line 13116) but nothing renders it.
   - `company` - only opener is `data-company=` at line 3267, inside the dead `viewHome` tail.
   - `routes` (list and per-bus detail) - only opener is `data-act="openRoutes"` at line 3242, inside the dead tail. `routes/<id>` is only reachable from the list.
   - `buses` **list** (no id) - `viewBuses` is only called after `saveBus`, as a not-found fallback, and from a tile in the dead tail. The Fleet tab (`viewFleet`) has its own searchable bus list. Consequence: the **"+" Add bus button lives only on the orphaned list** (`shell(t('buses'), ..., addBus FAB)`, line 3370) and in the empty state of `newjob`. `viewFleet` has no add-bus control.
   - The app's own usage report (`USAGE_SCREENS`, line 2634) lists `warranty`, `forecast`, `routes` under "Built but never opened".
2. **`linkgps`** is opened only from the live-tracking screen (`trackTick`, line 3669) when a bus has no GPS match.
3. **`bills`** is opened only as the store keeper's bottom tab. Owner/supervisor use `purchases` for the same screen.
4. **Permission without any path (supervisor).** The supervisor has `money`, `people`, `bills`, `manageStaff`, `manageCrewLogins`, `addFuel`, `dashboard`, `insights` permissions but only the tabs Today/Jobs/Fleet/Store/Me. The openers for the following live only on the owner's Money/People tabs or the owner home, so the supervisor has no UI path to: `money`, `people`, `purchases`/`bills` (list), `reports`, `busreport`, `accounting`, `busacct`, `fuel`, `vendors`, `crewbank`, `crewpins`, `coaching`, `safety`, `pilferage`, `storehealth`, and the Staff-accounts sheet (`openStaff` appears only in `viewPeople`, line 2746). (They can still log fuel and add a bill through sheets reachable from bus detail and the Store tab "+" button.) Static reading; no runtime check.
5. **Owner has no path to the parts catalogue** (`store` list): the owner nav has no Store tab and the only `data-nav="store"` openers are on the supervisor home and the dead tail. The owner can reach a single part via Store health rows (`data-part`, line 4583).
6. **Mechanic has no path to the job list** (`viewJobs`): the mechanic nav is Home/Store/Me and the home screen only lists job rows (`data-job`, detail only). `FEATURES.md` says mechanics get a Jobs tab.
7. **Dead-end taps (rendered link, permission denied -> silent bounce to home):**
   - Mechanic home "Driver said..." rows use `data-bus` (line ~2131) -> `buses` needs `fleet` (owner/supervisor) -> mechanic lands on home.
   - Mechanic opening a part that has tracked pieces: rows use `data-act="openComp"` (line 4721) -> `components` needs `manageComponents` (no mechanic).
   - Driver home, a resolved report with a linked job: row uses `data-job` (line 9696) -> `jobs` needs `viewJobs` (no driver). The code comment calls this "permission-safe"; the effect is a tap that goes nowhere.
   - Fuel screen per-bus rows (`data-act="busReport"`, line 8460) for store and crewmanager -> `busreport` needs `dashboard` (owner/supervisor only).
   - Duty-board "who was on this bus" lookup lists gate checks as `data-act="openGate"` (line 9451) -> `gate` needs `gateCheck` (owner, supervisor, driver; not crewmanager). Conditional on a gate check existing for that bus/date.
8. **Mis-routed insight link.** `insightCard` builds an entity attribute from `i.nav.name` (line 12634): jobs -> `data-job`, buses -> `data-bus`, drivers -> `data-driver`, anything else with an id -> `data-part`. The crew-document insights use `nav: { name: 'driverdocs', id: d.id }` (lines 12580, 12590), so they emit `data-part="<crew id>"` and open the part-detail route with a crew id, which falls through to the parts list.

## 2. Route table (53 routes)

Roles column: permission name from `ROUTE_PERM`, then the roles that hold it in `PERMS`. "all" = no `ROUTE_PERM` entry. A denied role is silently sent to `home`.
"Reached from": **tab** = a bottom-nav tab for the named roles; **Me** = Me menu; **drill** = linked from another screen (named); **none** = no live opener.

| # | Route name | View function | One-line purpose | Roles (`ROUTE_PERM` -> `PERMS`) | Reached from |
|---|---|---|---|---|---|
| 1 | `home` | `viewHome` -> `viewOwnerHome` / `viewSupervisorHome` / `viewStoreHome` / `viewMechanicHome` / `viewCrewManagerHome` / `viewOfficeHome` / `viewDriverHome` / `viewConductorHome` | The role's landing screen: "what needs me now" | none -> all 8 | tab 1 for every role; every denied route falls back here; login lands here |
| 2 | `me` | `viewMe` | Check in/out, own attendance log, settings, sign out | none -> all 8 | tab (last) for every role; "Check in" banners and sync chip (`data-nav="me"`) |
| 3 | `money` | `viewMoney` | Owner's spend hub: running cost, where it goes, money-pit buses, trip cash, supplier dues | `money` -> owner, supervisor | tab: owner only |
| 4 | `fleet` | `viewFleet` | Fleet hub: service overdue, expiring documents, live map, breakdowns, history, searchable bus cards | `fleet` -> owner, supervisor | tab: owner, supervisor; triage rows "Service overdue" (`data-nav="fleet"`) on both homes |
| 5 | `people` | `viewPeople` | People hub: drivers worst-first, manage links (assignments, safety, scoreboard, crew bank, coaching, PINs, staff) | `people` -> owner, supervisor | tab: owner only |
| 6 | `bills` | `viewPurchases` | Supplier bills (same screen as `purchases`) | `bills` -> owner, supervisor, store | tab: store only |
| 7 | `purchases` | `viewPurchases` | Supplier bills: pending vs paid, mark paid, add bill | `bills` -> owner, supervisor, store | drill: store home card, Money tab (2 rows), owner home ("You owe" card + triage) |
| 8 | `buses` | `viewBuses` (no id) / `viewBusDetail` (id) | List of buses / one bus: documents, service due, GPS, challans, tyres, fuel, reports, job history | `fleet` -> owner, supervisor | detail: drill from any bus row (`data-bus`) on Fleet, homes, alerts, Money, etc.; list: **none** (see 1.3) |
| 9 | `jobs` | `viewJobs` (no id) / `viewJobDetail` (id) | Job-card board / one job card (photos, parts, hours, close, verify) | `viewJobs` -> owner, supervisor, store, mechanic | list: tab for supervisor, store; drill for owner (home triage `data-nav="jobs"`, In-shop "all jobs" link); detail: any job row (`data-job`) incl. mechanic home |
| 10 | `store` | `viewStore` (no id) / `viewPartDetail` (id) | Parts catalogue with stock / one part with ledger and tracked pieces | `viewStore` -> owner, supervisor, store, mechanic | list: tab for supervisor, mechanic; supervisor low-stock triage; **no path for owner**; store role uses its home instead; detail: any part row (`data-part`) |
| 11 | `newjob` | `viewNewJob` | Create a job card (multi-step wizard with draft) | `addJob` -> owner, supervisor | drill: "+" on Jobs board, breakdown -> job, driver report -> job |
| 12 | `history` | `viewHistory` | Completed work by bus, quick-repeat and service-due tracking | `viewJobs` -> owner, supervisor, store, mechanic | drill: Fleet tab row, Jobs board row, owner home "Fleet health", bus detail (per-bus) |
| 13 | `outsidejobs` | `viewGatePasses` | Register of work sent out of the garage (gate passes) with overdue count | `outsideJob` -> owner, supervisor | drill: row on Jobs board |
| 14 | `gatepass` | `viewGatePass` | One printable outside-work gate pass; mark returned | `outsideJob` -> owner, supervisor | drill: `outsidejobs` list rows; after saving a new pass |
| 15 | `components` | `viewComponents` (no id) / `viewComponentDetail` (id) | Per-piece tracking of tyres, batteries, rotables / one piece's life and history | `manageComponents` -> owner, supervisor, store, crewmanager | drill: crewmanager home ("Tyres"), bus detail, part detail, AI insights |
| 16 | `storehealth` | `viewStoreHealth` | Stock reconciliation: trust score, shrinkage, blind/full counts, unexplained stock changes | `issuePart` -> owner, supervisor, store | drill: store home button, owner home triage "unexplained", pilferage card |
| 17 | `pilferage` | `viewPilferage` | Per-mechanic pilferage risk from job/part/warranty signals (180 days) | `insights` -> owner, supervisor | drill: owner home triage "Pilferage flags" (shown only when flags exist); supervisor: none |
| 18 | `insights` | `viewInsights` | AI findings list + "Ask the advisor" Q&A | `insights` -> owner, supervisor | drill: AI Insights banner (`aiInsightsCard`) on owner and supervisor homes |
| 19 | `warranty` | `viewWarranty` | Parts still under supplier warranty | `viewWarranty` -> owner, supervisor, store | **none** (orphan) |
| 20 | `vendors` | `viewVendors` (no id) / `viewVendorDetail` (id) | Supplier registry with bills per vendor | `addPurchase` -> owner, supervisor, store | drill: Money tab row (owner) |
| 21 | `import` | `viewImport` | Load Parts Master / Vendor Master / bus roster from Excel | `addPurchase` -> owner, supervisor, store | Me menu "Import from Excel" |
| 22 | `accounting` | `viewAccounting` | Running cost per bus incl. trip cash, fuel, maintenance | `dashboard` -> owner, supervisor | drill: Money tab "Trip cash" card |
| 23 | `busacct` | `viewBusAccounting` | One bus's trips, cash vs card, salary | `dashboard` -> owner, supervisor | drill: `accounting` rows |
| 24 | `reports` | `viewReports` | Maintenance spend by bus for a period | `dashboard` -> owner, supervisor | drill: Money tab row, owner home KPI and 7-day chart |
| 25 | `busreport` | `viewBusReport` | One bus's cost, service status, odometer; share | `dashboard` -> owner, supervisor | drill: Reports KPI, Forecast rows, Fuel rows |
| 26 | `company` | `viewCompanyDetail` | Lifetime repair bill per owning company; share/copy bill | `dashboard` -> owner, supervisor | **none** (only the dead `viewHome` tail) |
| 27 | `forecast` | `viewForecast` | Lost revenue from downtime + upcoming/overdue maintenance; set daily revenue | `dashboard` -> owner, supervisor | **none** (orphan) |
| 28 | `fuel` | `viewFuel` | Fuel fills and km/l per bus; log fuel | `addFuel` -> owner, supervisor, store, crewmanager | drill: Money tab row (owner), store home button, crewmanager home row |
| 29 | `def` | `viewDef` | AdBlue/DEF fills and consumption (BS6/SCR buses) | `addFuel` -> owner, supervisor, store, crewmanager | drill: crewmanager home row, bus detail AdBlue row, AI insights |
| 30 | `alerts` | `viewAlerts` | Expiring bus documents; challan summary card | `dashboard` -> owner, supervisor | drill: Fleet tab row, owner and supervisor home triage |
| 31 | `challans` | `viewChallans` | Pending traffic fines per bus, check unchecked buses (billable lookups) | `challans` -> owner, supervisor | drill: owner home triage, `alerts` card |
| 32 | `buschallans` | `viewBusChallans` | One bus's challan list | `challans` -> owner, supervisor | drill: bus detail card, `challans` rows |
| 33 | `breakdowns` | `viewBreakdowns` | Log of on-road breakdowns (180 d): worst bus/system, off-road hours, linked job | `logIncident` -> owner, supervisor | drill: Fleet tab row (needs `logIncident`), owner home "Fleet health" |
| 34 | `livemap` | `viewLiveMap` | All buses on a map, refreshed every 20 s (needs internet) | `liveMap` -> owner, supervisor, crewmanager | drill: Fleet tab row, crewmanager home row |
| 35 | `track` | `viewTrackBus` | Full-screen live tracking of one bus (1 s refresh) | `liveMap` -> owner, supervisor, crewmanager | drill: bus detail "Track live", map popups |
| 36 | `linkgps` | `viewLinkGps` | Match AirFi GPS devices to buses by plate | `addBus` -> owner, supervisor | drill: only from the `track` screen when a bus is unlinked |
| 37 | `routes` | `viewRoutes` (no id) / `viewRouteDetail` (id) | Stops, go-times and late-pickup risk per bus | `manageRoutes` -> owner, supervisor | **none** (only the dead `viewHome` tail) |
| 38 | `safety` | `viewSafety` | GPS safety/misuse events, last 7 days | `dashboard` -> owner, supervisor | drill: People tab row, AI insights |
| 39 | `drivers` | `viewDrivers` (no id) / `viewDriverDetail` (id) | Crew list worst-first / one driver or conductor: score, incidents, reports, actions | `crewPerf` -> owner, supervisor, crewmanager, office | list: tab for office; People tab "+N more" (owner); detail: any crew row (`data-driver`) |
| 40 | `assignments` | `viewAssignments` | Duty board: driver <-> bus and conductor <-> bus, by role or by bus | `assignDriver` -> owner, supervisor, crewmanager | tab: crewmanager; People tab row; supervisor home triage "no driver"; Drivers list button; crewmanager home KPIs |
| 41 | `crewbank` | `viewCrewBank` | Register of every driver and conductor: documents, status, add/archive/export | `manageDrivers` -> owner, supervisor, crewmanager | tab: crewmanager; People tab row; crewmanager home row; AI insights |
| 42 | `crewpins` | `viewCrewPins` | Create crew logins, show/reset their PINs, activate server logins | `manageCrewLogins` -> owner, supervisor | drill: People tab row |
| 43 | `driverdocs` | `viewDriverDocs` | One crew member's six document cards | per-record `canDriverDocs`: `manageDrivers` roles (owner, supervisor, crewmanager) or the person themself | Me "My documents" card (driver, conductor); driver detail; crew bank |
| 44 | `coaching` | `viewCoaching` | Approve/skip weekly AI coaching notes per crew member | `manageDrivers` -> owner, supervisor, crewmanager | `data-nav` from People tab row and crewmanager home card |
| 45 | `scoreboard` | `viewScoreboard` | Mechanic leaderboard (score out of 100) | `viewScoreboard` -> owner, supervisor, store, mechanic | drill: People tab, owner/supervisor homes, Jobs board row, mechanic home button |
| 46 | `scorecard` | `viewScorecard` | One mechanic's score, attendance, late penalty (own only unless owner/supervisor) | `viewScoreboard` -> owner, supervisor, store, mechanic | drill: scoreboard rows, mechanic home "My score" |
| 47 | `gate` | `viewGate` | One gate check (departure checklist) | `gateCheck` -> owner, supervisor, driver | drill: driver home card, `gatechecks` rows, duty lookup |
| 48 | `gatechecks` | `viewGateChecks` | Today's gate checks; failed ones waiting for go/hold | `gateDecide` -> owner, supervisor | drill: owner/supervisor home triage and summary card |
| 49 | `reviews` | `viewReviews` | Passenger reviews and complaints traced to bus and crew (two sub-tabs) | `crewReviews` -> owner, supervisor, crewmanager, office | tab: office; owner/supervisor home card (`reviewsHomeCard`); bus-detail rating card (`rvScopeBus`, scoped to that bus); no crewmanager link |
| 50 | `rbnames` | `viewRbNames` | Confirm which crew record each redBus crew name means | `manageDrivers` -> owner, supervisor, crewmanager | drill: banner on `assignments` and `reviews` when names are pending |
| 51 | `whynodriver` | `viewWhyNoDriver` | Why low reviews could not be pinned on a driver | `dashboard` -> owner, supervisor | drill: button in the reviews "ITS" card |
| 52 | `digest` | `viewDigest` | Weekly AI management digest | `dashboard` -> owner, supervisor | `data-nav` from home card (`digestHomeCard`) on owner/supervisor homes |
| 53 | `usage` | `viewUsage` | Who uses the app, most-opened screens/actions, never-opened screens, slow actions | `dashboard` -> owner, supervisor | Me menu "Usage & adoption" |

Routes each role is *permitted* to open (by `ROUTE_PERM` + `PERMS`; `driverdocs` counted where `canDriverDocs` can pass): owner 53, supervisor 53, store 16, crewmanager 14, mechanic 7, driver 4, office 4, conductor 3. 27 routes are held by owner + supervisor alone. Owner and supervisor have an identical permission set over routes; they differ only in navigation (section 3) and in `deleteJob`, `bulkArchiveCrew` (owner-only permissions with no route of their own).

Permitted routes for the non-boss roles, spelled out (so the redesign can see how small each role's world is):
- store (16): `home`, `me`, `bills`, `purchases`, `jobs`, `store`, `history`, `scoreboard`, `scorecard`, `storehealth`, `fuel`, `def`, `components`, `vendors`, `import`, `warranty`
- crewmanager (14): `home`, `me`, `assignments`, `crewbank`, `drivers`, `driverdocs`, `coaching`, `rbnames`, `reviews`, `livemap`, `track`, `fuel`, `def`, `components`
- mechanic (7): `home`, `me`, `jobs`, `store`, `history`, `scoreboard`, `scorecard`
- driver (4): `home`, `me`, `gate`, `driverdocs` (own only)
- office (4): `home`, `me`, `drivers`, `reviews`
- conductor (3): `home`, `me`, `driverdocs` (own only)

## 3. Per-role navigation

Tabs are defined in `bottomnav()` -> `NAVS` (line 1990). Each entry is `[route, icon, label]`; the label is an i18n key (English shown; every label has a Hindi string in `i18n-hi.js`). `NAVS[role] ||` falls back to a 5-tab default (Today, Fleet, Jobs, Store, Me) for an unknown role; no current role triggers it.

| Role | Tab count | Tabs in order (label -> route) | Home screen function |
|---|---|---|---|
| `owner` | 5 | Today -> `home`; Money -> `money`; Fleet -> `fleet`; People -> `people`; Me -> `me` | `viewOwnerHome` |
| `supervisor` | 5 | Today -> `home`; Jobs -> `jobs`; Fleet -> `fleet`; Store -> `store`; Me -> `me` | `viewSupervisorHome` |
| `store` | 4 | Store -> `home` (the store home, not the parts list); Bills -> `bills`; Jobs -> `jobs`; Me -> `me` | `viewStoreHome` |
| `mechanic` | 3 | My work -> `home`; Store -> `store`; Me -> `me` | `viewMechanicHome` |
| `crewmanager` | 4 | Today -> `home`; Duty board -> `assignments`; Crew bank -> `crewbank`; Me -> `me` | `viewCrewManagerHome` |
| `office` | 4 | Crew performance -> `home`; Crew -> `drivers`; Reviews -> `reviews`; Me -> `me` | `viewOfficeHome` |
| `driver` | 2 | My Bus -> `home`; Me -> `me` | `viewDriverHome` |
| `conductor` | 2 | My Duty -> `home`; Me -> `me` | `viewConductorHome` |

Tab counts: owner 5, supervisor 5, store 4, mechanic 3, crewmanager 4, office 4, driver 2, conductor 2. Total 29.

Special active-tab rules in `bottomnav()`: for `crewmanager`, the routes `crewbank`, `drivers`, `driverdocs` light the Crew bank tab and `assignments` lights the Duty board tab; everything else uses `TAB_OF`.

### 3.1 Me menu (`viewMe`, line 5600)

Structure, in order, for every role:
1. Profile card (name, role) with one button: **Check in** or **Check out** (`checkin` / `checkout`, shown according to today's last attendance record; takes a live face capture + GPS, records late/too-far flags) - 1 action, 2 states.
2. **Attendance** card: the user's own last 12 records (type, time, metres from garage, LATE badge, selfie thumbnail which opens `viewPhoto`). Self only.
3. **"More" card** - the menu proper (rows below).
4. Role-specific extra card(s): "My documents" (driver, conductor) or "Phone alerts" (owner, supervisor).

"More" card rows, with the condition that shows each:

| Row | `data-act` | Shown when | Opens |
|---|---|---|---|
| Import from Excel | `openImport` | `can(role, 'addPurchase')` -> owner, supervisor, store | route `import` |
| Garage setup | `openSetup` | role is owner or supervisor (hard-coded array, not `PERMS.garageSetup`) | `sheetGarageSetup` (garage location/geofence, shift time, "start fresh") |
| Language / भाषा | `lang` | all | toggles EN/Hindi in place |
| Theme | `theme` | all | toggles light/dark |
| Change my PIN | `changePin` | all | `sheetChangePin` |
| (identity row: name, role, user id) | none | all | display only |
| Usage & adoption | `openUsage` | `can(role, 'dashboard')` -> owner, supervisor | route `usage` |
| Device & server | `openSync` | all | `sheetSync` (device id, pending changes, last sync, counts on this phone, server address/API key, re-download) |
| Logout | `logout` | all | signs out to login |

Per-role Me menu content:

| Role | "More" rows (actions) | Extra cards |
|---|---|---|
| `owner` | 9 rows / 8 actions: Import, Garage setup, Language, Theme, Change PIN, identity, Usage, Device & server, Logout | Phone alerts (`enableNotif`, or `testNotif` + `disableNotif` when on) |
| `supervisor` | same as owner: 9 / 8 | Phone alerts |
| `store` | 7 / 6: Import, Language, Theme, Change PIN, identity, Device & server, Logout | none |
| `mechanic` | 6 / 5: Language, Theme, Change PIN, identity, Device & server, Logout | none |
| `crewmanager` | 6 / 5 (same as mechanic) | none |
| `office` | 6 / 5 (same as mechanic) | none |
| `driver` | 6 / 5 (same as mechanic) | My documents (`openDriverDocs`) |
| `conductor` | 6 / 5 (same as mechanic) | My documents (`openDriverDocs`) |

Distinct `data-act` values anywhere on the Me screen: 15 (`checkin`, `checkout`, `openImport`, `openSetup`, `lang`, `theme`, `changePin`, `openUsage`, `openSync`, `logout`, `openDriverDocs`, `enableNotif`, `testNotif`, `disableNotif`, `viewPhoto`). Of those, 8 are "More" card rows.

Nothing else is in the Me menu. Note what is *not* there compared with the old docs: no Purchases, Alerts, Drivers, Staff, or Sync-URL entries (see section 7). Staff accounts moved to a row in the People tab; Garage setup and Usage are the only "admin" rows left.

### 3.2 What each role's home shows, and where each role can go from it

- **owner** (`viewOwnerHome`): KPI row (30-day repair cost with trend arrow, buses on road of total, in shop, away); "You owe" card -> `purchases`; "Needs you now" triage rows (gate checks waiting -> `gatechecks`, jobs to verify -> `jobs`, unexplained stock -> `storehealth`, pilferage flags -> `pilferage`, challans -> `challans`, documents expired/soon -> `alerts`, supplier dues -> `purchases`); weekly digest card -> `digest`; gate-check summary; passenger-reviews card -> `reviews`; AI Insights banner -> `insights`; In-shop jobs (3 oldest) + link to the whole board; Away (outside-work) jobs; Fleet health (breakdowns, service due -> `fleet`, history, mechanic scoreboard); 7-day cost chart -> `reports`.
- **supervisor** (`viewSupervisorHome`): In-shop list (8) with idle time, Away jobs; triage (driver complaints -> bus detail, gate waiting, jobs to verify, buses with no driver -> `assignments`, service overdue -> `fleet`, documents -> `alerts`, low stock -> `store`); digest, gate summary, reviews cards; "waiting for sign-off" note for jobs the supervisor closed themself; mechanic workload card -> `scoreboard`; AI Insights banner.
- **store** (`viewStoreHome`): stock value, low-stock count, Add stock / Issue part buttons, Fuel and Store health buttons, live parts search, "reorder soon" list, pending supplier total -> `purchases`, open jobs.
- **mechanic** (`viewMechanicHome`): check-in banner, "My score" card -> `scorecard`, Team leaderboard -> `scoreboard`, today's counts, "My day" (open jobs by priority and age) and "My jobs" -> job detail, "Driver said..." driver reports on buses they work (dead link, see 1.3).
- **crewmanager** (`viewCrewManagerHome`): free drivers / free conductors KPIs, buses needing a driver or conductor, shortcuts (Duty board, Fuel, AdBlue, Tyres -> `components`, Live map, Crew bank), crew ratings card (lowest rated), coaching card -> `coaching`.
- **office** (`viewOfficeHome`): KPIs (average stars, 1-star count, rated crew, "need a talk", notes logged this month), "needs a talk" list (score < 60), full worst-first list with search, "not enough reviews yet" list; every row -> `drivers/<id>`.
- **driver** (`viewDriverHome`): bus hero, own rating + reasons + tip, gate-check card (start the departure checklist), latest coaching note, passenger reviews card, trip-cash card (start trip / add expense / end trip), Report a problem, own reports (open/resolved/cancel).
- **conductor** (`viewConductorHome`): bus hero, route, driver(s), contact, latest coaching note, passenger reviews card, link to own documents via Me.

## 4. What each screen is for

Written for someone who has never seen the app. "Writes" names the local IndexedDB store (`DB.put('<store>')`) or server call (`Sync.*`) the screen's actions produce; every local write is queued and synced to the server later (offline-first). "Read-only" means the screen itself produces no write (opening it still increments the per-person-per-day `usage` counter via `trackScreen`/`trackAct`, which is written for every screen, so it is not repeated below). Stores written anywhere by the actions in this section: `attendance`, `audits`, `breakdowns`, `buses`, `components`, `crewnotes`, `def`, `driverreports`, `drivers`, `dutylog`, `fuel`, `gatechecks`, `gatepasses`, `incidents`, `jobcards`, `ledger`, `meta`, `parts`, `purchases`, `rbalias`, `routes`, `triplog`, `trips`, `usage`, `users`, `vendors`.

### 4.1 Home screens (route `home`, 8 variants)

- **Owner home** (`viewOwnerHome`). Question: "What needs me today, and how is spend moving?" The owner reads four numbers, works the ranked "Needs you now" rows (each drills to where it is fixed), and checks digest/gate/review/AI cards. Writes: none.
- **Supervisor home** (`viewSupervisorHome`). Question: "What is in the workshop right now, for how long, and who is carrying what?" Shows in-shop jobs with idle time, outside-work jobs, complaints from drivers, buses missing a driver, work awaiting sign-off, mechanic load. Writes: none.
- **Store home** (`viewStoreHome`). Question: "What is low, what do we owe, and what jobs are waiting for parts?" Buttons start Add stock (`sheetAddStock`), Issue part (`sheetIssue`), Fuel, Store health; has its own live parts search. Writes via sheets: `parts`, `ledger`.
- **Mechanic home** (`viewMechanicHome`). Question: "What is waiting for me, most urgent first, and how am I scored?" Lists the mechanic's own open jobs and recent jobs, their score card, the leaderboard, and open driver complaints on buses they are working. Writes: none (job actions are on the job card).
- **Crew manager home** (`viewCrewManagerHome`). Question: "Which buses are short a driver or conductor today, and who is free to fill them?" Two KPIs (free drivers, free conductors) open the duty board on the right role chip; shortcuts to fuel, AdBlue, tyres, live map, crew bank; ratings and coaching cards. Writes: none.
- **Office home** (`viewOfficeHome`). Question: "How are the drivers and conductors doing, and what did passengers say?" Deliberately worst-first; tapping a person opens the read-only scorecard where the office can add a conversation note. Writes: none here (`crewnotes` via the scorecard).
- **Driver home** (`viewDriverHome`). Question: "Is my bus ready to leave, how am I rated, and what have I reported?" Starts the departure gate check, shows rating and coaching tip, runs the trip-cash session, raises a problem report, shows report status. Writes: `gatechecks` (gate), `driverreports` (report, cancel), `trips` (start trip, add expense, end trip).
- **Conductor home** (`viewConductorHome`). Question: "Which bus and route am I on and who am I paired with?" Read-only: bus, route, paired driver, contact, coaching note, reviews. Writes: none.

### 4.2 Hubs and self

- **`me`** (`viewMe`). Question: "Am I checked in, and how do I change my settings?" Check in/out writes `attendance` (selfie, GPS, distance, late/flagged). Change PIN calls `Sync.setPin`. Garage setup writes `meta`. Notifications call `Sync.subscribePush`. Details in 3.1.
- **`money`** (`viewMoney`). Question: "What did running the fleet cost this month, where did it go, and what do I owe?" A window selector (this month / last month / this year) drives a hero total with trend and 6-month bars, a stacked split (fuel & AdBlue, parts, labour, outside, misc) that reconciles to the total, the top-5 cost-per-km buses, a trip-cash roll-up, and four links (Bills, Vendors, Fuel & mileage, Reports). Read-only.
- **`fleet`** (`viewFleet`). Question: "Which buses need attention and where are they?" Triage rows (service overdue, documents expiring), links to live map, breakdowns, history, then a searchable grid of bus cards (tap = bus detail, Track button = live tracking). Read-only. No add-bus button.
- **`people`** (`viewPeople`). Question: "Which drivers need attention, and where do I manage people?" Worst-8 drivers by score, then a Manage list: Driver <-> bus assignments, Safety & GPS events, Scoreboard, Crew data bank, Coaching, Crew logins & PINs, Staff. "Staff" opens `sheetStaff` (add/rename/remove staff logins; writes `users` and calls `Sync.addStaff`/`renameStaff`/`removeStaff`).

### 4.3 Buses and fleet operations

- **`buses`** (`viewBuses`, `viewBusDetail`). The list is a searchable registry with live running/idle/parked status and a "+" button (writes `buses` via `saveBus`; duplicate-registration warning). Bus detail is the per-bus hub: pending challans, odometer, lifetime repair cost, next-service badge, Track live, GPS & service (`showGps`; Log service writes a verified `jobcards` row and updates `buses`), report a problem, log fuel/AdBlue, vehicle documents with expiry (`saveDoc`/`deleteDoc` write `buses`), tyres/batteries fitted, assigned driver (`sheetAssignDriverToBus`), open driver reports with "make job" (`createJobFromReport` writes `jobcards`), job history.
- **`alerts`** (`viewAlerts`). Question: "Which bus documents (insurance, fitness, PUC, permit, road tax) are expiring within 15 days or already expired?" Searchable list; row -> bus detail; top card summarises challans (if permitted). Read-only.
- **`challans`** / **`buschallans`** (`viewChallans`, `viewBusChallans`). Question: "What traffic fines are pending against our registrations?" Check unchecked buses (`syncChallans`) or one bus (`checkChallan`); each lookup spends a billable credit. Writes: `Sync.challans` (server lookup, cached on device).
- **`breakdowns`** (`viewBreakdowns`). Question: "Which buses and systems break down on the road, and how many hours were lost?" 180-day KPIs, worst bus/system, searchable log; "+" and row tap open `sheetBreakdown` (writes `breakdowns`, can link to a job). Read plus write.
- **`livemap`** / **`track`** (`viewLiveMap`, `viewTrackBus`). Question: "Where is every bus / this bus right now?" Live map polls every 20 s; track polls every second. Need internet and the map library. Read-only. `track` with an unlinked bus offers **`linkgps`**.
- **`linkgps`** (`viewLinkGps`). Match each unlinked AirFi device (by plate) to a bus. Writes `buses` (sets `regNo` to the real plate, raises odometer).
- **`routes`** (`viewRoutes`, `viewRouteDetail`). Per-bus stop list with go-times and a live "pickups at risk" monitor. Writes `routes` (add/edit/delete stop). Orphan (1.3).
- **`forecast`** (`viewForecast`). "How much revenue did downtime cost and what maintenance is coming/overdue?" Writes `meta` (daily revenue per bus). Orphan.
- **`safety`** (`viewSafety`). 7-day GPS-detected events (overspeed, harsh braking, night movement, idle) with a recent-events list; these also lower a driver's score. Read-only.
- **`history`** (`viewHistory`). Question: "What repair work has been completed, for which bus, at what cost, and which buses are repeat offenders?" KPIs for 90 days and all-time, a "watch" list of quick-repeat/service-due buses, per-bus chips (hidden for mechanics), searchable list of the 300 latest. Read-only.

### 4.4 Workshop: jobs, store, components

- **`jobs`** (`viewJobs`, `viewJobDetail`). The board lists job cards (open -> in-progress -> done -> verified; verifiers see "done" first; mechanics see only their own). Rows above the list link to Mechanic scoreboard (owner/supervisor), Completed work, Outside jobs (if `outsideJob`). "+" (owner/supervisor) opens `newjob`. A job card shows bus, problem, crew (one or more mechanics, each with a task), service record, before/after photos, parts used, parts requests, old-part (core) returns, outside repair, cost and downtime impact, and the actions: Edit/Reassign (`editJob`), Mark done (`markDone`, owner/supervisor), Verify / Send back (`verifyJob`, `rejectJob`, owner/supervisor), Change bus (`changeJobBus`, owner, verified cards only), Delete (`deleteJob`, owner only; returns parts to the store). Writes: `jobcards`, `parts`, `ledger`, `driverreports`, `breakdowns`.
- **`newjob`** (`viewNewJob`). A 3-step wizard to open a job card. Step 1: bus (with that bus's open driver reports to link), outside-work toggle (city/location), problem text, priority. Step 2: crew (one or more mechanics, each with a task), date, enter time, job start time, odometer (or odometer-broken flag). Step 3: outside vendor and cost, labour hours, notes, summary. Auto-saves a local draft (`gs-jobdraft`); the draft can be discarded. Writes: `jobcards`, marks linked `driverreports` resolved, may link a `breakdowns` row, updates `buses` odometer.
- **`outsidejobs`** / **`gatepass`** (`viewGatePasses`, `viewGatePass`). Paper trail for units sent to outside vendors (e.g. alternator for rewind): register with "at vendor / overdue (14 days+) / back" counts, "+" to issue a pass (`sheetGatePass`, unit serial recorded), printable pass, mark returned (`sheetReturnGatePass`, compares serial). Writes: `gatepasses`, `components`.
- **`store`** (`viewStore`, `viewPartDetail`). Parts catalogue (capped to 250 rows, searchable), low-stock first, stock value; buttons Add stock / Issue part (owner, supervisor, store), "+" button here is **Add supplier bill** (`addPurchase`). Part detail shows stock, cost, reorder level, ledger of every movement, and tracked pieces for rotable parts. Writes: `parts`, `ledger` (`confirmAddStock`, `issuePart`, `receiveStock`, `saveAddPart`), `purchases` (bill), `components`.
- **`storehealth`** (`viewStoreHealth`). Question: "Is stock disappearing?" Trust score, shrinkage in rupees, received vs issued vs on-hand, storekeeper activity, recent counts, unexplained stock changes (quantity changed with no ledger row). Blind count and Full count (`sheetAudit`) write `audits`, `parts`, `ledger`.
- **`pilferage`** (`viewPilferage`). Question: "Which mechanics should I watch?" Risk score per mechanic from missing/suspect old parts, warranty-period charges and related signals over 180 days; rows jump to the first flagged job. Read-only.
- **`warranty`** (`viewWarranty`). "Which fitted parts are still under supplier warranty so a failure should be a free claim?" Read-only. Orphan.
- **`components`** (`viewComponents`, `viewComponentDetail`). Per-piece register for tyres, batteries, alternators etc.: life in km or months, state, alerts; buttons Fit tyres / Fit batteries (bulk), "+" add a piece; detail has Fit, Remove, Send out (for remould/rewind), Receive back, Scrap. Writes: `components`.
- **`scoreboard`** / **`scorecard`** (`viewScoreboard`, `viewScorecard`). Mechanic leaderboard (score out of 100, open jobs) and a single mechanic's breakdown (attendance this month, late penalty). A mechanic can open only their own scorecard. Read-only.

### 4.5 Money, suppliers, reports

- **`purchases`** / **`bills`** (`viewPurchases`). Pending-vs-paid supplier bills; "Mark paid" (`togglePaid`, needs `addPurchase`), "+" adds a bill (`sheetAddPurchase`; photo, OCR scan via `scanBill`; writes `purchases`). Both routes render the identical function.
- **`vendors`** (`viewVendors`, `viewVendorDetail`). Supplier registry; vendor detail shows bills mapped to the vendor, pending amount. Writes `vendors` (add/edit).
- **`import`** (`viewImport`). Upload Parts Master, Vendor Master (.xls) or a bus/route roster (.xlsx); matches by key. Writes `parts`, `vendors`, `buses`, `drivers`.
- **`fuel`** (`viewFuel`). Per-bus fuel spend and km/l with a "falling mileage" flag, pump price comparison, "Log fuel" (`sheetAddFuel`, writes `fuel`, updates `buses` odometer). Row tap -> `busreport` (owner/supervisor only).
- **`def`** (`viewDef`). Same for AdBlue/DEF on BS6/Volvo SCR buses. Writes `def`.
- **`reports`** / **`busreport`** (`viewReports`, `viewBusReport`). Period-filtered maintenance spend by bus and a one-bus report (odometer, next service, cost split, cost per km), with share-as-text. Read-only.
- **`accounting`** / **`busacct`** (`viewAccounting`, `viewBusAccounting`). Running cost per bus including trip cash, card spend, fuel logs, maintenance, driver salary. `setSalary` writes `drivers`. Trips themselves are created on the driver's home screen.
- **`company`** (`viewCompanyDetail`). Lifetime repair bill per owning company, per bus, with Share/copy bill. Orphan.

### 4.6 Crew

- **`drivers`** (`viewDrivers`, `viewDriverDetail`). List: all active crew worst-first, search, "+" `addDriver` (needs `addBus`, so owner/supervisor), button to the duty board (needs `assignDriver`). Detail: photo, role, bus, blended score (incidents + GPS + passenger reviews), incidents, driver reports with "make job", conversation notes (`crewNotesCard`, roles with `crewNote`), documents link, and manage actions behind `manageDrivers`: Edit profile, Assign bus, Add incident (`sheetIncident`, `logIncident` roles), Leave/Archive. Writes: `incidents`, `drivers`, `dutylog`, `crewnotes`, `jobcards`, `driverreports`.
- **`assignments`** (`viewAssignments`). The duty board: chips for Driver / Conductor / By bus; pick a free person -> bus (or bus -> person); "who was on this bus on this date" lookup from the duty log; banner for pending redBus names. Writes `drivers`, `dutylog`, `buses`.
- **`crewbank`** (`viewCrewBank`). Register of every driver/conductor ever employed: counts of drivers, conductors, missing documents, unscanned, expiring; searchable list with status chips; "+" adds a person (`sheetAddCrew`, with duplicate detection); Export CSV; owner-only Bulk archive. Writes `drivers`, `dutylog`, `users`.
- **`driverdocs`** (`viewDriverDocs`). Six document cards per person (mandatory ones depend on driver vs conductor), photo or number, expiry watched. A driver or conductor reaches their own from Me. Writes `drivers` (`saveDriverDoc`) and uploads photos.
- **`crewpins`** (`viewCrewPins`). Shows the PIN this phone was given for each crew login; Create missing logins & PINs (`makeCrewLogins`: writes `users`, `drivers`, `buses`), Activate crew server logins (`Sync.registerRoster`), per-person New PIN (`Sync.setPin`).
- **`coaching`** (`viewCoaching`). Claude drafts a three-line weekly note (good / fix / tip) per crew member from the week's facts; the reader edits and Approves or Skips. Only approved notes reach the crew member's own home. Writes: `Sync.aiCoaching` (draft run), `Sync.coachDecide`.
- **`reviews`** (`viewReviews`). Passenger reviews (imported from redBus) traced to the bus and crew who ran that trip; sub-tabs Reviews and Complaints; filters (all / low / conflict); scoped by bus or crew; row opens a read-only sheet (`openReview`, `openComplaint`). Includes AI classification card and "ITS" lookup card. Read-only; AI runs call `Sync.aiReviews`, `Sync.itsLookup`.
- **`rbnames`** (`viewRbNames`). Confirm which crew record each redBus crew name means (suggestions from the app and Claude). Writes `rbalias`; `Sync.aiNames`.
- **`whynodriver`** (`viewWhyNoDriver`). Groups low reviews and complaints by why no driver could be attributed (e.g. name not matched), with a suggested fix. Read-only.

### 4.7 Gate and oversight

- **`gate`** (`viewGate`). A driver's departure checklist for one bus: ten items, some need a photo (AC, blankets, cabin), live selfie + GPS, hold-to-release. All pass -> released. Any fail -> status `awaiting` until owner/supervisor decides go or hold with a reason (`gateDecide`); the driver can re-check. Server enforces the rules (`_guard_gatecheck`). Writes `gatechecks`; `Sync.aiGate`.
- **`gatechecks`** (`viewGateChecks`). Owner/supervisor list: waiting-for-decision first, then today's recent checks; row -> `gate`. Read-only.
- **`insights`** (`viewInsights`). AI findings across cost, pilferage, maintenance prediction, crew docs, with "Ask the advisor" (free text or four canned questions; `Sync.ai`). Cards deep-link via `data-nav` / entity attributes (see 1.3 item 8). Read-only.
- **`digest`** (`viewDigest`). Weekly AI-written management digest: headline, sections, actions, earlier weeks; "Generate now" (`Sync.aiDigest`).
- **`usage`** (`viewUsage`). Adoption report from the `usage` store (rows per person per day): used today/week/month, staff who never signed in, most-opened screens and actions, "built but never opened" (checked against a hard-coded list of 37 route names `USAGE_SCREENS`, line 2634 - not all 53), slow actions (> 1 s), per-person activity. Read-only.

## 5. Screens that overlap or duplicate

### 5.1 Different routes, same view
- **`bills` and `purchases`** both `return viewPurchases()` (lines 12766, 12778) and share `ROUTE_PERM` -> `bills`. Only the entry differs: `bills` is the store keeper's tab, `purchases` is everyone else's drill-in. `TAB_OF` lights `bills` for the first and `money` for the second.
- Seven routes are one route with two functions chosen by `r.id`: `buses`, `jobs`, `store`, `drivers`, `routes`, `components`, `vendors`. A redesign should treat these as list + detail pairs, not 14 screens.
- `viewComplaintsTab` is a sub-tab of `reviews` (not a route); `driverdocs` is the same screen reached by a manager (any person) or by the person themself.

### 5.2 One user question, several screens
| Question | Screens that answer it | Notes |
|---|---|---|
| "Which buses do we have / which need attention?" | `fleet` (bus cards, search), `buses` list (registry, search, +), `alerts`, `forecast` | `fleet` and the `buses` list show the same data; only the orphaned `buses` list can add a bus. |
| "What is it costing us?" | `money` (hero + split), `reports` (spend by bus per period), `busreport` (one bus), `accounting` + `busacct` (running cost incl. trip cash), `company` (per owning company), `forecast` (downtime cost), `history` (spend on completed work), bus detail "Lifetime repair cost", owner home 30-day KPI + 7-day chart | At least five per-bus cost lenses (`busreport`, `busacct`, bus detail, `money` money-pit list, `history`) each with a different basis: maintenance only, maintenance + fuel + trip cash, per-km. `money`'s hero reconciles fuel + parts + labour + outside + misc; `reports` is repair cost only. |
| "What do we owe suppliers?" | `purchases`/`bills`, `vendors` (pending per vendor), owner home "You owe" + triage row, Money "You owe" tile, store home "pending suppliers" | Four entry points to the same list. |
| "Is stock/parts being stolen?" | `pilferage` (people), `storehealth` (store shrinkage + unexplained stock changes), `insights` (contains the pilferage radar and cost findings), `warranty` (warranty-period re-purchases), job-card "Old parts returned" | Owner home surfaces pilferage and storehealth as separate triage rows. |
| "Which crew need attention?" | `people` (worst 8 drivers), `drivers` list (worst first), `office` home (worst first, blended score), crewmanager home ratings card (lowest rated), `reviews`, `coaching`, `scoreboard` (mechanics, best first), `safety` | Five ordered lists of the same people with slightly different scores (`driverOverall`, `driverScore`, `mechanicScore`). The mechanics' list is best-first; every crew list is worst-first. |
| "Who is on which bus?" | `assignments` (duty board + "who was on this bus" lookup), `drivers/<id>` (assign bus), bus detail (assign driver), supervisor home "no driver" row, crewmanager home KPIs | Three different write paths to the same seat (`_takeSeat`). |
| "Where is the bus?" | `livemap`, `track`, `linkgps`, bus list status chip, job card outside-work map link | |
| "Which documents are expiring?" | `alerts` (bus docs), `crewbank` (crew docs expiring KPI), `driverdocs` (one person), AI insights (both), bus detail (per bus), owner/supervisor triage rows | Bus documents and crew documents are two separate systems with two separate screens. |
| "What work has been done?" | `history` (completed, per bus), `jobs` board (filters), `buses/<id>` job list, `outsidejobs` (sent out) | `history` is a subset of the job board (completed/verified). |
| "Fuel" | `fuel`, `def`, Money split, bus detail "Log fuel", store home button, crewmanager home | Fuel and AdBlue are separate screens with the same layout and the same permission (`addFuel`). |
| "Challans" | `challans`, `buschallans`, `alerts` card, bus detail card | |
| "How is this person scored?" | `scorecard` (mechanics only, despite the generic name), `drivers/<id>` (crew), mechanic home "My score", office home | `scorecard` and `drivers/<id>` are the mechanic and crew scorecards respectively. |
| "Settings" | `me` menu rows, top-bar theme and language buttons | Theme and Language appear in both the top bar (every routed screen) and the Me menu. |
| "Part catalogue" | `store` (list), store home (own search box + reorder list), part detail | Two catalogue UIs; the store role has the second as its home and no tab to the first. |

### 5.3 Same data, mirrored lists inside role homes
`viewOwnerHome` and `viewSupervisorHome` share these cards: triage (`triageCard`/`triageRow`), in-shop (`inShopCard`), away (`awayCard`), digest (`digestHomeCard`), gate summary (`gateHomeSummaryCard`), reviews (`reviewsHomeCard`), AI banner (`aiInsightsCard`). Driver and conductor homes share `myCoachCard` and `myReviewsCard`. The hub tabs (`money`, `fleet`, `people`) repeat links that also appear on the owner home (e.g. Reports, Purchases, Alerts, History, Scoreboard).

### 5.4 Duplicated bookkeeping
- `USAGE_SCREENS` (37 names) is a hand-maintained second copy of the route list; 16 routes are missing from it (`home`, `me`, `company`, `history`, `outsidejobs`, `gatepass`, `breakdowns`, `gate`, `gatechecks`, `reviews`, `rbnames`, `whynodriver`, `coaching`, `digest`, `usage`, `buschallans`), so they can never show as "built but never opened".
- `TAB_OF` (the highlight map) is a third list; `ROUTE_PERM` a fourth. They are separate objects with no consistency check.

## 6. UNDETERMINED

- UNDETERMINED: which role-conditional buttons inside each of the 45 sheets and inside the job card exist for each role. Many are guarded by inline `['owner','supervisor'].includes(role)` (e.g. `actionsForJob`, `viewMe`) rather than a `PERMS` name; they were noted where seen but not exhaustively enumerated.
- UNDETERMINED: server-side enforcement. `sync_server.py` has `WRITE_ROLES` (line 1152) and `_guard_*` functions; this document is client-scope only and does not state what the server permits.
- UNDETERMINED: what URL the server puts in push-notification payloads. The service worker reads `data.url` but the click handler only focuses an open window or opens that URL; the app has no code to turn a URL into a route.
- UNDETERMINED: whether anything outside `app.js` (`duty.js`, `gate.js`, `pullapply.js`, `trace.js`) calls `push`/`route`. A grep for `data-nav`, `openForecast` and `openWarranty` in those files and `index.html` found nothing, so the orphan findings stand for the whole front end.
- UNDETERMINED: the live (production) data volume per screen. Several screens cap lists (parts 250, history 300, gate passes 200); whether real data hits the caps was not examined.
- The dispatcher in `_dispatchClick` has roughly 280 `case '<act>'` labels (279 counted between lines 12980 and 13340). They were not individually catalogued here; this document lists the actions reachable from each routed screen's first-level buttons only.

## 7. Discrepancies found (existing docs vs code)

Code wins in every row.

### 7.1 `ROLES.md` (last committed 2026-11-02, but describes an ~1,650-line app)
| # | Doc says | Code says |
|---|---|---|
| R1 | 5 roles: owner, supervisor, store, mechanic, driver | 8 roles (`ROLE_META`, line 13360): adds `crewmanager`, `office`, `conductor` |
| R2 | `app.js` is "~1650 lines" | 14,163 lines |
| R3 | `PERMS` has 7 entries; everything else is "inline hardcoded conditionals" | `PERMS` has 37 entries (lines 974-1060) |
| R4 | "There is no gate at all on the router (`render`, line 1424)" | `render()` applies `ROUTE_PERM` (line 12754) to 50 of 53 routes; the other three are `home`, `me` (open) and `driverdocs` (own-or-manager) |
| R5 | Owner nav "Home - Buses - Jobs - Store - Me" | Owner: Today, Money, Fleet, People, Me |
| R6 | Supervisor nav "Home - Buses - Jobs - Store - Me" | Supervisor: Today, Jobs, Fleet, Store, Me (no Buses tab) |
| R7 | Store target nav "Home - Store - Jobs - Me" | Store: Store (home), Bills, Jobs, Me |
| R8 | Mechanic nav "Home - Jobs(own) - Store(view) - Me" | Mechanic: My work, Store, Me (no Jobs tab) |
| R9 | Store and mechanic share a generic home ("G1") | Each has its own: `viewStoreHome`, `viewMechanicHome` |
| R10 | Purchases, Alerts, Drivers, Staff, Sync are in the Me menu for everyone/owners | Me has none of Purchases, Alerts, Drivers or Staff. Staff is a People-tab row; Sync is "Device & server"; Purchases and Alerts are drill-ins from other screens |
| R11 | "Buses list: all staff (driver: no tab)" and bus detail open to anyone | `buses` needs `fleet` (owner, supervisor); other roles tapping a bus are sent to home |
| R12 | `assignDriver` button on bus detail is ungated; `PERMS.assignDriver` missing | `PERMS.assignDriver` exists (owner, supervisor, crewmanager) and `assignments` is route-guarded by it |
| R13 | Attendance "show all" for owner/supervisor lives in the Me screen (`viewMe` 744 in the old file) | Me shows only the user's own last 12 records; the People tab shows only a count of people checked in today |

### 7.2 `FEATURES.md` (last committed 2026-06-22; "190 features across 8 areas")
| # | Doc says | Code says |
|---|---|---|
| F1 | Line 20 (flagged partial): Mechanic/Store see "Home - Jobs - Store - Me"; Owner/Supervisor "Home - Buses - Jobs - Store - Me"; Driver "My Bus - Me" | Only the driver row is right. See table in section 3 |
| F2 | Lines 12, 208: staff created via "Me > Staff > Add staff" | No Staff row in Me. It is `data-act="openStaff"` in the People tab (owner only has that tab) |
| F3 | Line 161: "Me menu 'Drivers' link (owner/supervisor only)" | No such Me row. `drivers` list opens from the People tab (owner) or the office Crew tab |
| F4 | Line 21: driver has "'My Trips' tab" | Driver tabs are "My Bus" and "Me". "My Trips" (`myTrips`) is the page title of the driver and conductor homes |
| F5 | Lines 14, 25: Garage setup is owner-only (tag `owner`) | Me row shows for owner and supervisor; `PERMS.garageSetup` = owner, supervisor |
| F6 | Lines 34-35 (marked working): tap a company on the owner dashboard -> company billing worksheet | `company` is reachable only from dead code in `viewHome` (see 1.3); no live screen links to it |
| F7 | Heading "AI Insights & Pilferage Radar (Owner Only)" | Tags and code: owner and supervisor (`insights`); the radar (`pilferage`) is linked only from the owner home |
| F8 | Role tags are always a subset of owner/supervisor/store/mechanic/driver | Three more roles exist and none are described: `crewmanager`, `office`, `conductor` |
| F9 | Not mentioned at all (zero hits): crew bank, challans, duty board, usage report, digest, Money/Fleet/People tabs | All exist as routes (`crewbank`, `challans`/`buschallans`, `assignments`, `usage`, `digest`, `money`/`fleet`/`people`) |
| F10 | Line 27: Store role "cannot ... see drivers/costs/insights" | Store is permitted `fuel` (fleet fuel spend), `purchases`/`bills` (supplier amounts), `vendors`, `warranty`, `storehealth` (stock value, shrinkage), `scoreboard`, `history`, `components`, `def`, `import` |

### 7.3 `SITEMAP.html` (last committed 2026-09-09)
| # | Doc says | Code says |
|---|---|---|
| S1 | "Seven roles" (matrix has 7 columns) | 8 roles; `office` is missing from the matrix and the screen list |
| S2 | "A mechanic has no login at all" (matrix note under section 1) | `NO_LOGIN_ROLES` is an empty set (line 13374); the comment at lines 13362-13373 says mechanics sign in again; a mechanic has a nav (3 tabs), a home (`viewMechanicHome`) and 7 permitted routes. The matrix itself shows mechanic with "own" on Job cards and "view" on Store, contradicting the note |
| S3 | Usage & adoption tile: "Owner-only" | Matrix row, `PERMS.dashboard` and the Me row: owner and supervisor |
| S4 | Matrix: Driver scoring / incidents is owner and supervisor only | `crewPerf` gives `crewmanager` and `office` read access to `drivers` list/detail and scorecards; incidents (`logIncident`) are owner and supervisor only, which does match |
| S5 | Section 2 lists Warranty, Forecast, Routes ("Per-bus and per-company cost breakdowns" implies `company`) as available screens | None has a working UI entry point (1.3) |
| S6 | Section 2 omits these routes by name: `insights`, `breakdowns`, `history`, `outsidejobs`, `gatepass`, `gate`, `gatechecks`, `reviews`, `rbnames`, `whynodriver`, `coaching`, `digest` (12 of 53) | They exist and are permission-guarded |
| S7 | Section 2 "Workshop & store: supervisor, store, mechanic" | Owner holds the same permissions as supervisor on all of these routes |
| S8 | "Every screen has a permission entry except home and me and crew documents" | **Correct** (verified: 53 switch cases, 50 `ROUTE_PERM` keys, the 3 exceptions are exactly those) |

### 7.4 Code-internal inconsistencies worth knowing
- `Garage setup` Me row is gated by a hard-coded `['owner','supervisor']` array, not `PERMS.garageSetup` (same members today, but they can drift).
- `TAB_OF` assigns `breakdowns` to `fleet`, `outsidejobs`/`gatepass` to `jobs`, `usage`/`import` to `me`, but `insights`/`pilferage` to `home`; the owner opens `jobs`, `store` and `purchases` without having those tabs, so no tab is lit.
- The Store tab's "+" button creates a **supplier bill** (`addPurchase`), not a part.
- `viewHome` has 143 lines of unreachable "other role" code (3155-3297) that still contains the only openers for `company` and `routes`. A comment at line 2993 records that AI Insights was once orphaned the same way, until `aiInsightsCard` was added to the role homes.

# Garage Saathi — Role-Based Access Schema

Authoritative map of **reality (as coded today)** vs. **intent (target)** for the 5 roles:
`owner`, `supervisor`, `store` (storekeeper), `mechanic`, `driver`.

Source of truth: `app.js` (~1650 lines) and `db.js` (seed + roles). All line numbers refer to those files.

---

## 1. The access primitives (verbatim)

The only declarative gate in the app is the `PERMS` object with the `can()` helper (`app.js` lines 119–128):

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
};
```

Everything else is gated by **inline hardcoded conditionals**, not `PERMS`:
- `S.user.role === 'driver'` → `viewHome` (382), `bottomnav` (348).
- `S.user.role === 'mechanic'` → check-in banner (404), jobs filter (591).
- `['owner','supervisor'].includes(role)` → job edit (614), attendance "show all" (744), Me-menu Drivers + Staff links (761).
- `can(role,'dashboard')` (= owner/supervisor) → the entire boss dashboard block in `viewHome` (408–471).

**There is no gate at all on the router (`render`, line 1424) or on `viewInsights` / `viewDrivers` / `viewDriverDetail`.** Those screens are only unreachable because nothing renders a *link* to them for non-boss roles — they are not access-controlled. (Security note: see Gap G7.)

---

## 2. Feature / screen inventory (function → what it does → who reaches it today)

| Screen / feature | Function(s) | What it does | Reachable today by |
|---|---|---|---|
| Boss dashboard (cost chart, quick-stats, AI card, service-due, Drivers card, cost-by-company) | `viewHome` 408–471, gated `can(role,'dashboard')` | Oversight home | owner, supervisor |
| Generic fall-through home (greet + doc alerts + open jobs + low stock) | `viewHome` 474–493 (runs for everyone non-driver) | Limited home | **store, mechanic** (identical), plus appended under boss block for owner/sup |
| Driver home (bus, rating, report btn, my reports) | `viewDriverHome` 1154–1174 | Driver self-service | driver only |
| Buses list | `viewBuses` 506–510; FAB `addBus` gated | List + add | all staff (driver: no nav tab) |
| Bus detail (info, GPS btn, **driver+score**, **driver-reported issues**, docs, service history) | `viewBusDetail` 512–574 | Per-bus hub | anyone who taps a bus; assign/→Job buttons gated |
| Jobs list | `viewJobs` 589–598; mechanic filtered to own (591) | Job list | all staff; FAB add gated |
| Job detail (photos, parts, cost, markDone/verify) | `viewJobDetail` 609–671 | Job card | all staff; edit = mine OR owner/sup (614) |
| Store / inventory (stock value, parts, issue/receive) | `viewStore` 674–699; issue/receive btns gated `issuePart` | Inventory | all staff; actions: owner/sup/store |
| Part detail (stock + ledger) | `viewPartDetail` 701–727 | Pilferage trail | anyone who taps a part |
| Me / attendance / menu | `viewMe` 730–769 | Check-in, att log, menu | all staff (driver too) |
| Purchases / bills | `viewPurchases` 980–993 | Supplier bills | reached via Me menu (all staff); add gated |
| Document alerts | `viewAlerts` 995–1004 | Expiry list | reached via Me menu (all staff) |
| **AI Insights** (pilferage radar, cost, predictive, Ask advisor) | `viewInsights` 1350–1365, `computeInsights` 1269 | Owner intelligence | **owner/sup only** (entry is the boss-only `aibanner` card, 433) |
| **Drivers list** | `viewDrivers` 1106–1110 | Roster + scores | **owner/sup only** (entries: boss `openDrivers` card 455, Me menu 762) |
| **Driver detail** (score, incidents, trip reports) | `viewDriverDetail` 1112–1151 | Driver mgmt | owner/sup (via Drivers list / bus detail driver row) |
| **Driver score / rating** | `driverScore` 309, `scoreStars`/`starStr` 315 | 0–100 + stars | rendered in viewHome boss block, bus detail, driver home, drivers list |
| GPS + preventive service | `showGps` 1043, `logService` 1082 | Live telemetry, mark service | anyone on bus detail (btn line 533) |
| Staff accounts (add user) | `sheetStaff` 944, `saveStaff` 962 | Create logins | owner/sup (Me menu 763) |
| Sync settings + AI key | `sheetSync` 925 | Server URL / API key | all staff (Me menu) |

### Actions in the `bind()` switch (1463–1509) and their effective role gate

| Action | Handler | Gated by | Effective roles |
|---|---|---|---|
| `addBus` / `saveBus` | sheetAddBus / saveBus | FAB shown only if `can(addBus)` | owner, supervisor |
| `addJob` / `saveJob` | sheetAddJob / saveJob | FAB / button `can(addJob)` | owner, supervisor |
| `issueTo` / `confirmIssue` | sheetIssue / confirmIssue | button `can(issuePart)` | owner, supervisor, store |
| `receive` / `confirmReceive` | sheetReceive / confirmReceive | button `can(issuePart)` (note: uses issuePart, not receiveStock) | owner, supervisor, store |
| `addPurchase` / `savePurchase` | sheetAddPurchase / savePurchase | FAB `can(addPurchase)` | owner, supervisor, store |
| `markDone` | markDone | `editable` = mine OR owner/sup (614) | mechanic(own), owner, supervisor |
| `verifyJob` | verifyJob | `can(verifyJob)` (662) | owner, supervisor |
| `addPhoto` | addJobPhoto | `editable` | mechanic(own), owner, supervisor |
| `checkin`/`checkout` | doAttendance | none | all staff (incl. driver) |
| `gps` / `logService` | showGps / logService | none | anyone reaching bus detail |
| `openInsights` | push insights | card only rendered in boss block (433) | owner, supervisor (UI), **anyone if linked** |
| `askAi` | askAi | inside insights | same |
| `openPurchases` / `openAlerts` | push | Me menu, no role gate | all staff |
| `openStaff`/`saveStaff` | sheetStaff/saveStaff | Me menu `['owner','supervisor']` (761) | owner, supervisor |
| `openDrivers` | push drivers | boss card (455) + Me menu `['owner','supervisor']` (762) | owner, supervisor |
| `addDriver`/`saveDriver` | sheetAddDriver | FAB on viewDrivers uses `can(addBus)` (1109) | owner, supervisor |
| `assignBus`/`saveAssignBus` | driver→bus | buttons live only inside viewDriverDetail | owner, supervisor |
| `assignDriver`/`saveAssignDriver` | bus→driver | button unconditional on bus detail (540) | **anyone on bus detail** |
| `addIncident`/`saveIncident` | driver data point | inside viewDriverDetail | owner, supervisor |
| `reportProblem`/`saveReport` | trip report | driver home (1165) + driver detail (1130) | driver, owner, supervisor |
| `reportToJob` | createJobFromReport | wrapped in `can(addJob)` on bus detail (554); unconditional in driver detail (1147) | owner, supervisor |
| `openSync`/`saveSyncUrl`/`syncNow` | sync | Me menu, no gate | all staff |
| `lang` / `back` / `viewPhoto` / `logout` | — | none | all |

---

## 3. What each role's home renders TODAY (tracing `viewHome`)

`viewHome` (382): driver → `viewDriverHome`. Otherwise it computes the limited body (greet, doc alerts, open jobs, low stock) and **conditionally prepends** the boss block when `isBoss = can(role,'dashboard')` (392).

- **owner** — `isBoss = true`. Renders the FULL dashboard: 7-day cost chart + ₹ pill (414), quick-stat tiles (424), **✨ AI Insights card** (433, `data-act="openInsights"`), service-due (441), **Drivers card** (455, `data-act="openDrivers"`, shows lowest-rated driver + score), cost-by-company (463) — THEN the generic doc-alerts/open-jobs/low-stock cards.
- **supervisor** — identical to owner (also `can(dashboard)`).
- **store** — `isBoss = false`. Falls straight to the generic block: greet + doc alerts + open jobs + low stock. **No** insights, drivers, cost chart, service-due, stock value.
- **mechanic** — `isBoss = false`. **Same generic block as store**, plus the not-checked-in banner (404). Store and mechanic are pixel-identical otherwise.
- **driver** — `viewDriverHome`: bus hero, rating/score, "Report a problem" button, my-reports list. Two-tab nav (My Bus / Me).

### Owner-gap verification — is the owner login itself missing features? **NO.**

The owner's home genuinely surfaces all four "missing" features. Exact code paths:

- **✨ AI Insights card** — `viewHome` lines 432–438 inside `if (isBoss)`. `data-act="openInsights"` → bind 1485 → `push({name:'insights'})` → `viewInsights`. **Renders for owner.**
- **Drivers card** — `viewHome` lines 451–460, `if (drv.length)` inside `if (isBoss)`. `data-act="openDrivers"` → bind 1491 → `viewDrivers`. Also a second entry in the Me menu (762). **Renders for owner.**
- **Assign-driver on bus detail** — `viewBusDetail` line 540, button is **unconditional** (`data-act="assignDriver"`), present for every role that opens a bus. → bind 1496 → `sheetAssignDriverToBus`. **Renders for owner.**
- **Driver reports** — bus detail "Driver-reported issues" card (549–556) when `openReportsForBus` non-empty; per-driver trip reports in `viewDriverDetail` (1143). **Renders for owner.**

Driver score is rendered in the boss Drivers card (459), bus detail driver row (545), driver list (1103), driver detail (1124), and driver home (1163).

**Conclusion:** The owner login is NOT missing anything — every feature is wired and renders. The owner's perception of "everyone sees the same view" is real but is about the **other logins** (store/mechanic share one generic home; driver has its own; none of them can see insights/drivers/cost/score). If the owner login looks bare, it is a stale render / not-hard-refreshed PWA, not a code gap. The real defect is the **absence of purpose-built homes for store and mechanic**, not a broken owner.

---

## 4. TARGET SCHEMA

### 4a. Access matrix (rows = feature, cols = role; cell = Full / View / None)

| Feature / Screen | owner | supervisor | store | mechanic | driver |
|---|---|---|---|---|---|
| Home dashboard | Full (oversight) | Full (operations) | Full (inventory home) | Full (my-work home) | Full (my-bus home) |
| Buses list | Full add/edit | Full add/edit | View only | View only | None (no tab) |
| Bus detail | Full | Full | View stock-relevant | View + report card | None |
| Assign driver↔bus | Full | Full assign | None | None | None |
| Jobs list | Full all | Full all | View all | View **own only** | None |
| Job detail | Full edit/verify | Full edit/verify | View + issue parts | Full **own** (photos, done) | None |
| Verify job | Full | Full | None | None | None |
| Store / inventory | Full | Full | **Full** issue/receive | View only | None |
| Part detail / ledger | Full | Full | Full | View | None |
| Purchases / bills | Full add | Full add | **Full** add | None | None |
| Document alerts | Full | Full | View | View | None |
| **AI Insights** | **Full** | View (ops subset) | None | None | None |
| **Drivers list/detail** | **Full** | **Full** manage | None | None | None |
| Add incident (data point) | Full | Full | None | None | None |
| **Driver score/rating** | View all | View all | None | None | **View own** |
| Driver trip reports | Full (→Job) | Full (→Job) | None | View (read, on bus) | Full create own |
| GPS + preventive service | Full | Full | None | View | None |
| Mark service done | Full | Full | None | View/Full (debatable) | None |
| Attendance (own) | Full | Full | Full | Full | Full |
| Attendance log (all staff) | Full | Full | None | None | None |
| Staff accounts (add user) | **Full** | Full | None | None | None |
| Sync / API key | Full | Full | Full | View | None |

Notes condensed: "Full" = can act/edit; "View" = read-only; "None" = hidden and (target) router-blocked.

### 4b. Per-role spec

**owner — Oversight**
- Home: full boss dashboard — cost chart, AI Insights card, Drivers card (lowest-rated + reports), service-due, cost-by-company, doc alerts. (Today: correct.)
- Bottom nav: Home · Buses · Jobs · Store · Me.
- Key actions: everything — add/verify jobs, issue/receive, purchases, assign drivers, add incidents, add staff, AI advisor.
- Must NOT see: nothing restricted.

**supervisor — Operations**
- Home: operations-focused — open jobs to assign/verify, drivers needing attention + open trip reports, service-due, doc alerts. (Could reuse boss dashboard; trim AI to an ops subset.)
- Bottom nav: Home · Buses · Jobs · Store · Me.
- Key actions: assign/verify jobs, manage drivers + incidents + reports→Job, issue/receive, purchases, add staff.
- Must NOT see: (optionally) the full pilferage AI radar reserved for owner; otherwise same as owner.

**store (storekeeper) — Inventory** *(today: no purpose-built home)*
- Home (NEW): stock value, low-stock list with reorder, quick Issue/Receive buttons, pending supplier bills, recent ledger movements.
- Bottom nav: Home · Store · Jobs(view, for issuing) · Me. (Hide Buses or make view-only.)
- Key actions: `issuePart`, `receiveStock`, `addPurchase`, view part ledger.
- Must NOT see: AI Insights, Drivers, cost-by-company, attendance-of-all, verify/add jobs, staff admin.

**mechanic — My Work** *(today: shares store's generic home)*
- Home (NEW): my assigned open jobs (jobs already filter to `assignedTo` in `viewJobs`), check-in banner, the driver-reported issues on buses I work, my service-due tasks.
- Bottom nav: Home · Jobs(own) · Store(view) · Me.
- Key actions: addPhoto, markDone on own jobs, check-in/out, read driver reports.
- Must NOT see: AI Insights, Drivers, cost dashboards, verify, purchases, issue/receive (parts come via storekeeper), staff admin, all-staff attendance.

**driver — My Bus** *(already exists, correct)*
- Home: `viewDriverHome` — bus hero, own rating/score + stars, "Report a problem", my reports. Keep.
- Bottom nav: My Bus · Me (two-tab). Keep.
- Key actions: `reportProblem`/`saveReport`, check-in/out.
- Must NOT see: jobs, store, buses list, other drivers, cost, insights, anyone else's score.

---

## 5. GAP LIST (ordered by impact; each with the function/line to change)

**G1 — store & mechanic have no real home (HIGH).** `viewHome` (382) sends both to the same generic block (474–493). Build two new branches: `if (role==='store') return viewStoreHome();` and `if (role==='mechanic') return viewMechanicHome();` before the `isBoss` check. Reuse `viewStore` stats for store; reuse the `assignedTo` filter from `viewJobs` (591) for mechanic.

**G2 — `assignDriver` button on bus detail is ungated (HIGH, privilege escalation).** `viewBusDetail` line 540 renders the Assign/Change button unconditionally. Wrap in `can(S.user.role,'assignDriver')`. Add `assignDriver: ['owner','supervisor']` to `PERMS` (line 120). Without this, a store/mechanic opening any bus can reassign drivers.

**G3 — no router-level gating; deep screens are reachable by anyone (HIGH, security).** `render` (1424) and `viewInsights`/`viewDrivers`/`viewDriverDetail` have zero role checks. They are hidden only by missing links. A crafted `data-nav="insights"` / `data-driver` (e.g. via the insight cards' `nav:{name:'drivers',id}` at 1325, which `insightCard` turns into `data-driver`) exposes them. Add guards at the top of each `viewX`, or a central allow-map in `render()` keyed by role.

**G4 — `reportToJob` inconsistently gated (MED).** On bus detail it is wrapped in `can(addJob)` (554), but in `viewDriverDetail` (1147) the same `→ Job` button is unconditional. Since `viewDriverDetail` is owner/sup-only today this is latent, but once G3 opens driver detail it leaks job creation. Gate both with `can(addJob)`.

**G5 — `receiveStock` action gated by the wrong perm (MED, correctness).** `viewStore` (683) and the receive button use `can(role,'issuePart')`, and `confirmReceive` has no check. `PERMS.receiveStock` exists (line 125) but is never consulted. Switch the gate to `can(role,'receiveStock')` for clarity/future divergence.

**G6 — `gps` / `logService` ungated (MED).** Bus detail GPS button (533) and `logService` (1082) — which **creates a verified jobcard** — are callable by any role on bus detail. `logService` writing a verified job bypasses `verifyJob` perms. Gate the "Mark service done" button (1078) and the action with `can(role,'verifyJob')` or a new `logService` perm; allow plain GPS view to mechanics.

**G7 — bottom nav identical for store & mechanic (MED, UX).** `bottomnav` (348) only special-cases `driver`. Give store and mechanic focused tabs (per 4b): mechanic → Home/Jobs/Store/Me; store → Home/Store/Jobs/Me. Drop or view-only the Buses tab for them.

**G8 — driver score not surfaced to the driver beyond home, and never to store/mechanic (LOW, intent).** `viewDriverHome` (1163) shows the driver their own score — good. No change needed for driver. Confirm store/mechanic remain `None` per matrix; this is correct-by-omission once G3 blocks the routes.

**G9 — Me-menu "show all" attendance uses inline array, not PERMS (LOW, consistency).** `viewMe` (744) and Drivers/Staff links (761) hardcode `['owner','supervisor']`. Move to a `PERMS.attendanceAll` / `PERMS.manageStaff` / `PERMS.drivers` entry so all gating lives in one object. Low impact, high consistency value — do alongside G2.

**G10 — job edit permission inline, not in PERMS (LOW).** `viewJobDetail` (614) `['owner','supervisor'].includes(role)` for `canEdit`. Fold into a `PERMS.editAnyJob` for uniformity.

### Recommended implementation order
1. G2 + G6 (close the two real privilege holes via PERMS additions).
2. G3 (central router gate — biggest blast radius).
3. G1 + G7 (the actual product fix: purpose-built homes + nav for store & mechanic).
4. G4, G5, G9, G10 (consistency cleanups — centralise everything into `PERMS`).

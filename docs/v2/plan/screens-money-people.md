# Garage Saathi v2 — Money, People, Reviews

Stage 2b of the pipeline (`docs/v2/PIPELINE.md`): three of the twelve screens of
`docs/v2/plan/v2-ux.md` — **#7 Money, #8 People, #11 Reviews**. The two most
permission-sensitive areas in the product: the cash and the people.

Read in full before a line of this was written: `docs/v2/plan/v2-ux.md` (§3.3, §4.1,
§4.3, §6, §8), `docs/v2/plan/v2-foundation-ui.md` (consumed, not changed),
`docs/v2/DECISIONS.md` (§1, §5, §10, §11, §13, §14), `docs/v2/LIVE-ISSUES.md`
(**issue 2 shapes every redaction claim below**), `docs/v2/inventory/02-roles-and-permissions.md`
(§2, §4.4, §5.1–5.4, §6), `docs/v2/inventory/03-data-and-sync.md` (§2, §2.1, §3.3, §3.7),
`v2/ui/tokens.css`, `v2/ui/components.css`, `v2/ui/states.js`, `v2/ui/icons.js`,
`v2/ui/screens.css`.

**Gate run at the end of this document:** `python3 scripts/check-floor.py v2 ui` — green.

**Nothing in this document adds a token, an icon, a motion rule, a field or a store.**
Three screens, zero additions. Where I needed something the foundation lacks, it is
named in §9 rather than invented here.

---

## 0. The three things this document is for

1. **One cost basis for a bus, reconciling to its parts on screen** (§2.1). Five bases
   exist today and they disagree (`01 §5.2`), which is why people stopped reading them.
2. **A screen that hides a field is not a screen that protects it.** `LIVE-ISSUES.md`
   issue 2: a `conductor` token holding **zero** capabilities can `/pull` supplier
   bills, the ledger, job-card costs, trip cash, gate selfies, crew emergency phone
   numbers and crew face photos. So every hidden field below says, in the same row,
   whether the server actually withholds it today. Where it does not, it is a
   **stage-3 backend requirement**, consolidated in §7.
3. **The office login is scoped by this document** (§4.2) because Reviews is the only
   reason that login exists.

### 0.1 Capability declarations (the one enforcement mechanism, `v2-ux.md §4.3`)

| Screen | Declares | Row- and field-level gates inside it |
|---|---|---|
| **#7 Money** | `viewSpendTotals` **and** `money` | `viewCompanyBilling` for anything company-level (Q7); `bills` for the supplier-dues detail; `challans` for the liability card; the trip entry writes `trips`, which the server already lets a supervisor write — **no new capability, no server change** |
| **#8 People** | `crewPerf` | `manageDrivers` for every write and for identity documents; `crewNote` for the conversation log; `manageCrewLogins` for crew PINs; `manageStaff` for staff logins; `logIncident` to log an incident; **salary behind `money`** (§3.4); coaching approval behind `crewNote` + the server's `COACH_DECIDERS` |
| **#11 Reviews** | `crewReviews` | `manageDrivers` for the typed-name queue; `crewNote` to write a note from a review; `logIncident` to log an incident from a review |

A control whose gate the viewer does not hold is **absent**, never disabled and never
greyed (`v2-foundation-ui.md §3.1`, §3.8). A screen the viewer does not hold is not in
their nav and the route does not resolve; they stay on the screen they were on. No
toast — a message about a screen nobody asked for is noise.

### 0.2 Who reaches these three screens

| Role | Money #7 | People #8 | Reviews #11 |
|---|---|---|---|
| owner | yes, whole | yes, whole | yes, whole |
| supervisor | **yes, whole** (`DECISIONS.md §5`) | yes, whole | yes, whole |
| crewmanager | no | yes — no salary (§3.4), no staff logins, no crew PINs | yes, with the name queue |
| office | no | **read, plus the conversation log** — no documents, no phone, no salary | yes — **no journey fields, no passenger lookup** (§4.2) |
| store, mechanic | no | no | no |
| driver, conductor | no | no | no (their own reviews are on Me #12) |

### 0.3 Density, and which reader each screen is sized for

`data-density` goes on the screen's own container (`v2/ui/tokens.css` allows a desk
container inside a yard page; `v2-foundation-ui.md §2.1`).

| Screen | Phone | Office PC (1024×768, Chrome 109) |
|---|---|---|
| Money | `yard` throughout. The hero and the six parts are read standing up | `desk`, with the left rail (`--rail-w` 160px, content 864px). The per-bus table is `desk` |
| People | `yard`. The crew list is 164 rows and still read on a phone at the pump | `desk`. 164 one-line rows is the densest list in these three screens |
| Reviews | `yard` for the review detail, `desk` for the queues | `desk`. ~4,000 reviews: **windowed**, which forces the one-line row (§4.5) |

### 0.4 Tokens used, by name

Colour: `--ink`, `--ink-dim`, `--surface`, `--surface-raised`, `--line`, `--accent`,
`--accent-ink`, `--accent-text`, `--ok`, `--warn`, `--bad`.
Type: `--font`, `--font-hi`, `--lh`, `--t1`…`--t6`.
Space: `--s1`…`--s8`, `--pad`.
Density: `--tap`, `--row-h`.
Foundation additions consumed as-is: `--nav-h`, `--thumb`, `--rail-w`.
Radii are the three existing literals (8px controls, 12px panels, 999px pills).
**No new token.** Every size below resolves to one of the names above.

### 0.5 Primitives used, all existing

`.card`, `.v2row` (+ `.v2row-why`), `.tabs`, `.stat` (`.k` / `.v`), `.table` (+ `td.fig`),
`.badge` (`badge-ok` / `badge-warn` / `badge-bad`), `.btn` (`btn-primary` / `btn-quiet` /
`btn-danger`), `.field`, `.select`, `.num` (`.num-l` / `.num-in` / `.num-h`), `.photos`,
`.nav`, `.sr-only`; `figure()`, `emptyState()`, `errorState()`, `offlineState()`,
`skeleton()`; `V2.openSheet` / `V2.closeSheet` / `V2.confirmDialog` / `V2.toast`;
`icon(name, {size})`. From `v2/ui/screens.css`: `.kpirow` / `.kpi` / `.kpi-v` / `.kpi-l` /
`.kpi-u`, `.drow` / `.drow-l` / `.drow-v` / `.drow-i`, `.trow` severity colouring on `.ti`.

### 0.6 Icons used, all from the set of 34

`money`, `fuel`, `part`, `bus`, `doc`, `clock`, `add`, `challan`, `count`, `person`,
`star`, `review`, `warn`, `edit`, `search`, `filter`, `ok`, `bad`, `offline`, `camera`,
`back`, `me`, `delete`. The cap is reached (`v2-foundation-ui.md §4.4`); these three
screens ask for nothing new.

---

## 1. Money (#7)

> "What did running the fleet cost, where did it go, and what do we owe?"

### 1.1 The one cost basis for a bus

**Name it once and never compute it twice: `runningCost(busId, period)`.**

> **Running cost** = Fuel & AdBlue + Parts + Labour + Outside work + Trip cash + Misc.

One rule makes it reconcile, and it is the whole design: **one rupee, one source record,
one part.** A part is defined by the records it reads, not by a category somebody typed,
so no rupee can land in two parts and none can go missing.

| Part | Source records | Exactly |
|---|---|---|
| **Fuel & AdBlue** | `fuel`, `def` | `sum(cost)` where `busId` matches and `at` is inside the period |
| **Parts** | `jobcards.partsUsed` | `sum(qty × cost)` on cards whose `jobDate` is inside the period, after `reconcileJobParts` has healed `partsUsed` from `ledger` — the ledger is the record, the card is the copy |
| **Labour** | `jobcards.labourHours`, `meta.garage.labourRate` | `sum(labourHours) × labourRate` on the same cards |
| **Outside work** | `jobcards.externalCost`; `components.history[].cost` where `type` is `send-out` or `return` | summed. Rotables sent out carry a cost with no job card, which is why the second source is here |
| **Trip cash** | `trips.expenses[].amount` | every expense on trips of that bus whose `startedAt` is inside the period, **every category including road-side diesel** — that rupee is not in `fuel`, because `fuel` is the pump log |
| **Misc** | `incidents.cost` | summed. Damage the business paid for that never became a card |

**Three things are deliberately NOT in the total, and the screen says so in one line**,
because each would double-count or change the question:

- **Supplier bills (`purchases.amount`).** A bill buys stock; the stock becomes cost
  when it is issued to a card (Parts). Counting both counts it twice. Bills are
  **money we owe**, and they live in the dues panel (§1.5).
- **Challans.** A liability, not a running cost. Dues panel.
- **Audit shrinkage (`audits.shrinkValue`).** Stock that walked is Store's number
  (#6), not a bus's running cost.

**It reconciles on screen, not in a comment.** Under the hero total the six parts are
six rows, and the last line of the card is the arithmetic in words:

> `Fuel & AdBlue 2,41,300 + Parts 1,58,940 + Labour 46,250 + Outside 61,000 + Trip cash 88,420 + Misc 7,500 = 6,03,410`
> "These six add up to the total. Any rupee you cannot see here is not in it."

If the six do not sum to the hero, **the hero is not drawn**: the card shows
`figure(null)` and `errorState('The parts do not add up to the total', retry)`. A total
that disagrees with its parts is how five bases happened. A wrong total is worse than
no total (`v2-ux.md §4.1` #7; [E] `8db78e7`).

**Per km** is `runningCost / km`, and `km` has its own rules (§1.3). It is never a
seventh part and never a basis of its own.

### 1.2 Structure — phone first (`yard`)

One column, `--surface` page, `--pad` side padding, `padding-bottom:
calc(var(--nav-h) + env(safe-area-inset-bottom))`, `--s4` between cards.

```
[ period .tabs ]  This month · Last month · 3 months · Year · [icon filter] Dates
[ card: THE TOTAL ]
    .stat  .k "Running cost, this month"   .v figure(603410, {format: rupees})
    .drow × 6   one per part: .drow-i mark, .drow-l name, .drow-v figure
    .drow  "= 6,03,410"  (the reconciliation line, --ink-dim, --t6)
    freshness: "Updated 4 minutes ago"   (one line, icon clock, --ink-dim)
[ card: TREND ]
    6 × .v2row   month, figure, change in words ("Up 18,400 on last month")
[ card: COST PER KM ]
    .stat  .k "Fleet cost per km"  .v figure(14.20, {unit: '/km'})
    .drow  "Worked out over 42,460 km from 89 buses. 3 buses have no km (see below)."
[ card: THE MONEY PIT ]
    .tabs  By total · By cost per km
    up to 8 × .v2row.v2row-why   bus, reason, figure
    .btn-quiet "See all 89 buses"      → the per-bus list
    section: "Cannot work out cost per km (3)"  → 3 × .v2row, each with its reason
[ card: TRIP CASH ]
    .btn-primary  [icon add] "Give allowance"        (supervisor and owner)
    .btn          [icon add] "Expenses back"
    up to 6 × .v2row   open trips first, then today's closed
    .btn-quiet "All trips this month (41)"
[ card: WE OWE ]
    .stat  .k "Unpaid supplier bills"  .v figure(214700, {format: rupees})
    .drow  "11 bills, 4 of them over 30 days"
    .btn-quiet "Open the bills"        (needs `bills`)
    .drow  [icon challan] "Challans pending 18,400 on 7 buses"   (needs `challans`)
[ card: PERIOD REPORT ]
    .btn "Make the report for this period"
```

### 1.3 Structure — desk (`desk`, rail, 864px of content)

Two columns, `--s4` gap: left 520px, right the rest.

- **Left:** the total card (hero at `--t2` through `.stat .v`), the six parts as a
  `.table` with `td.fig` right-aligning each figure, the reconciliation line, then the
  trend as a `.table` of six periods.
- **Right:** cost per km, the money pit (`.v2row.v2row-why`, variable height, **never
  windowed** — capped at 8 visible with "See all 89 buses"), trip cash, we owe.
- **The per-bus list** is its own full-width `.table` under both columns: 89 rows at
  `--row-h` 32px = 2,848px of scroll, well under the 200-row cap, so **no windowing
  and no measurement per row** (`v2-foundation-ui.md §2.3` rules 1–4).

Per-bus table columns, desk: Bus · Running cost · Fuel · Parts · Labour · Outside ·
Trip cash · Misc · km · Cost per km. Ten columns at 864px: the first is 110px, the
eight figures 70px each (tabular-nums, right-aligned via `td.fig`), km 60px. That is
730px, leaving 134px of slack. **The column that gives first if the office PC says the
row is too wide is Misc, then Labour** — never the km or the cost-per-km column, which
are the two the owner came for.

### 1.4 The unreliable denominator — the ₹45,000/km bug, specified against

[E] `8db78e7`: a per-km figure divided by a missing odometer read ₹45,000 of work as
₹45,000/km and topped the money-pit list, sending the owner to inspect a healthy bus.

**The rule: a denominator is never defaulted. No `|| 1`, no `|| 0`, no "treat missing
as 1 km".** `km` for a bus over a period is only a number when all four hold:

1. the bus is not `odoBroken`;
2. there are at least **two** odometer readings inside the period, from `fuel.odometer`,
   `jobcards.odometer` or `buses.odometerAt`, each greater than zero;
3. the later reading is **greater** than the earlier one (forward only — a lower reading
   is a typo, [E] `927864c`);
4. the difference is at least **500 km**. Under 500 km the quotient is noise: ₹45,000
   over 12 km is ₹3,750/km and still a lie.

Otherwise `km` is **unknown**, and everything downstream of it is unknown:

| Where | What is drawn |
|---|---|
| The bus's `km` cell | `figure(null)` — the dash from `states.js`, `title="No data"`, `.sr-only` "No data". Never `0`, never `—` typed by hand |
| The bus's cost-per-km cell | `figure(null)` **and** a `badge badge-warn` with `icon('warn')` and the word **"No km"** |
| The money-pit list, "By cost per km" | The bus is **not in the ranking at all.** It cannot be first, last or anywhere |
| Under the money-pit list | A section, always drawn when the count is non-zero: **"Cannot work out cost per km (3)"**, three `.v2row`s, each naming the reason for that bus: "Odometer marked broken on 12 Oct" · "Only one reading since 1 Nov" · "Readings 240 km apart — too close to divide" |
| The fleet cost-per-km card | Its `.drow` names the excluded count: "Worked out over 42,460 km from 86 buses. 3 buses have no km." The fleet figure divides only by km it has |

**The money-pit list defaults to "By total", not "By cost per km".** Rupees are always
knowable; per km is not. The owner's first list is therefore the one that cannot lie,
and per km is a tab he chooses.

**And the reason travels with the row.** Every money-pit row is `.v2row.v2row-why`: the
`.sub` carries why this bus is on the list, up to two lines, never truncated to an
ellipsis — "4 breakdowns and a gearbox since 1 Oct" / "Highest cost per km of the 86
buses with km". A row that is a colour and a number is `dashboard` again
(`v2-foundation-ui.md §3.4`).

### 1.5 The supervisor's trip entry (`DECISIONS.md §11`, `v2-ux.md §3.3` steps 4–5)

Two sheets, two saves, one record. `trips` is already supervisor-writable
(`02 §4.4`) — **no new capability, no server change, no new field.**

**Sheet A — "Give allowance"** (opened from `.btn-primary`, `icon('add')`):

| Field | Control | Rule |
|---|---|---|
| Bus | `.select` | **Never pre-selected.** First option is "Choose the bus", `disabled`, `selected`. [E] `d738a6e` is a floor report of a part charged to the wrong bus because a sheet pre-picked the first open job; the same mistake with cash is worse |
| Driver | `.select` | Pre-filled from the bus's current seat (`drivers.busId`, `driverSlot`) and changeable. Pre-filling a *derived* value is fine; pre-filling the *subject* is not |
| Date | `.field type="date"` | Defaults to today. Editable, because the round is at 20:00 and the entry may happen at 02:00 |
| Allowance given | `.num data-kind="decimal"`, `.num-l` "Allowance given", `.num-h` "Rupees handed to the driver" | `inputmode="decimal"`, `pattern="[0-9]*[.]?[0-9]*"`, `enterkeyhint="done"`. **Never pre-filled with 0** |
| | `.btn-primary` "Save allowance" | Writes one `trips` record: `busId`, `driverId`, `fromTo`, `allowance`, `startedAt` = the chosen date's time, `status:'active'`, `expenses: []`, `by` from the token |

**Sheet B — "Expenses back"**: pick the open trip (`.select`, open trips only, newest
first), then one `.num` per expense with a `.select` for `cat` and `mode` (`cash` /
`card`), `.btn` "Add another", `.btn-primary` "Save expenses", and a separate
`.btn-quiet` "Close this trip". Each expense is appended to `expenses` — the field the
driver's own rules already treat as append-only.

**Closing is explicit and separate from saving.** `V2.confirmDialog('Close this trip?
Expenses cannot be added here afterwards.')`, focus starting on **Cancel**. After
closing, `status:'closed'`, `closedAt` set, and the sheet's fields are `disabled`
(`opacity: 0.5; cursor: not-allowed`) with the line "Closed trips cannot be changed
here."

**Named honestly: that freeze is a client rule for a supervisor.** The server freezes a
closed trip **for a driver** (`02 §4.4`); a supervisor or owner token may still push a
changed closed trip. Stage-3 backend item §7.6.

**Unknown and zero must never look alike** (`v2-ux.md §4.1` #7):

| The data | What the per-bus Trip cash cell shows |
|---|---|
| No trip record for this bus in this period | `figure(null)` plus the words **"No trips recorded"** |
| A trip with an allowance and no expenses yet | `figure(null)` plus **"Open since 20:10, expenses not back"**, `icon('clock')` in `--warn` |
| A trip closed with expenses of nothing | `figure(0)` — a real `0` — plus "Closed, nothing spent" |

A free-text cash total does not exist on this screen. It is a trip with a start and an
end, or it is not recorded.

### 1.6 Supplier dues and the period report

**Dues** read `purchases` where `paymentStatus` is not paid, grouped by vendor, oldest
first, each row `.v2row` with the vendor, the age in days, the amount. `.badge badge-bad`
with the word "Over 30 days" where it applies — never the colour alone.

**The challan row** is behind `challans` and **prices itself before it is pressed**: the
button reads **"Check challans (uses 1 credit)"**, because each lookup spends a billable
credit and the server guards the same (`02 §4.5`, `v2-foundation-ui.md §6.1`).

**The period report** is the same six parts over the chosen period, plus the per-bus
table, rendered to one printable column. It is not a new screen and not a download: it
is the Money screen with the period fixed and the nav absent at print width. Offline it
is drawn from the local database with the freshness line at the top — "Figures as at
06:40 today. No connection since then."

### 1.7 Money — every state

| State | What is on screen |
|---|---|
| **loading** | `skeleton(6)` in the total card, `skeleton(8)` in the money pit, `skeleton(4)` in trip cash. The period `.tabs` draws immediately with every count as `figure(null)` — a dash, not a `0`. The hero is **never** drawn mid-fill: [E] `2170703`, "the figures are incomplete and the app draws them as final" |
| **empty** | A period with no records at all: `emptyState('No spending recorded for March', {icon: 'money', hint: 'Choose another period, or log a fuel fill or a bill.'})`. The six part rows are **not** drawn as six zeroes |
| **one item** | One bus with cost and 88 without: the hero and the six parts are real; the money pit draws one `.v2row.v2row-why` and **no** "See all 89 buses" button; cost per km says "Worked out over 1,200 km from 1 bus" |
| **far too many** | The money pit is capped at **8 visible** with "See all 89 buses"; the per-bus table is 89 rows, inside the 200-row cap, drawn as one string with one `insertAdjacentHTML` and **no `at` on any figure inside a row** (that note is a block element and would triple the row height and run `ageWords()` 89 times — `v2-foundation-ui.md §2.3` rule 4). Freshness is stated once, in the card header. The trip list over a year is period-scoped and, past 200 rows, windowed — which forces the one-line row |
| **error** | A store that would not read: `errorState('Could not read the fuel log', retry)` **inside the part's row**, the other five parts still shown, and **the hero replaced by `figure(null)`** with "One part could not be read, so the total is not shown." A partial total is the five-bases bug being reinvented |
| **offline** | Every figure keeps its value — these are local reads — and the card header says **"No connection since 06:40. Figures may be out of date."** via `offlineState()`'s words. The challan check and the period report's AI reading are **absent**, with the line "Needs a connection." Note for whoever builds it: owner and supervisor cannot sign in offline at all (`v2-ux.md §6`), so this state is always a session that went offline, never a cold start |
| **half-finished** | A trip with an allowance and no expenses is a **real record**, not a draft: it is a row with "Open since 20:10, expenses not back". Nothing on this screen lives only in `localStorage`. An interrupted sheet loses the two numbers typed into it and nothing else, and that is stated in the sheet: "Not saved until you press Save allowance" |
| **no permission** | Not reachable. Money is absent from the nav of every role but owner and supervisor, and the route does not resolve for them. There is no "you may not see this" page — a screen that renders a refusal is still a screen |
| **partially redacted** | A role holding `viewSpendTotals` and `money` but **not** `bills`: the dues card shows the one total and "11 bills" and **no vendor names, no bill photos, no rows**, with one line: "Supplier names are not shown for your login." A role without `challans`: the challan row is **absent**, not greyed. A role without `viewCompanyBilling`: any per-company split is absent (Q7 — today there is no such split to draw) |

### 1.8 Money — interactions, exactly

| Control | Does | Pressed | Focus | Disabled | While working |
|---|---|---|---|---|---|
| Period `.tabs` | Changes what is drawn. **Never navigates and never writes** — a tab that pushes a route makes Back walk through filters instead of leaving | `scale(0.97)`, 120 ms `ease-out` | `outline: 2px solid var(--accent); outline-offset: -2px` (inside the edge; the strip clips an outer ring) | Never. A period with no data is still selectable and shows its empty state | The lists go to `skeleton()`; the strip stays |
| "Dates" (custom range) | `V2.openSheet` — two fields is more than one axis, so it is a sheet, not a chip | per `.btn` | ring at `offset: 2px` | — | — |
| Money-pit row | `a.v2row.v2row-why` → the bus on Buses (#5). Every row goes somewhere: the row is the reason, the link is the fix | `scale(0.97)`, 120 ms | ring at `offset: -2px` | A bus the viewer may not open is absent | — |
| "See all 89 buses" | Reveals the per-bus table in place. No route change | `.btn-quiet` press | ring | — | — |
| "Give allowance" | Sheet A | `scale(0.97)` | ring | **Absent** for a role that cannot write `trips` | "Saving…", `aria-disabled="true"` for the life of the write |
| `.num` allowance / expense | Puts the caret in the field and **exactly nothing else**. The screen's one delegated click handler returns early when `ev.target.closest('input, select, textarea, label, .num')` is non-null, **before** it reads `[data-act]` or `[data-nav]` — the line the storekeeper's count regression was missing (`v2-foundation-ui.md §3.3`) | **None.** A field is focused, not pressed | `outline: 2px solid var(--accent); outline-offset: 2px` | A closed trip's amount: `opacity: 0.5; cursor: not-allowed` | The field is never a loading surface; the **button** says "Saving…" |
| "Save allowance" | Writes `trips` | `scale(0.97)` | ring | `aria-disabled="true"` until a bus is chosen and the amount is greater than zero. Its `.num-h` says why: "Choose the bus and type the amount" | "Saving…" then `V2.toast('Allowance saved', {kind: 'ok'})` |
| "Close this trip" | `V2.confirmDialog`, focus on **Cancel** | `scale(0.97)` | ring | Absent on a trip already closed | "Closing…" |
| "Check challans (uses 1 credit)" | Network lookup | `scale(0.97)` | ring | Offline: **absent**, replaced by the words "Needs a connection" | "Checking…" and the price restated |
| "Make the report for this period" | Renders the report | `scale(0.97)` | ring | — | "Making the report…" |

### 1.9 Money — copy, in full

| Where | Words |
|---|---|
| Screen title | Money |
| Hero label | Running cost, this month |
| The six parts | Fuel & AdBlue · Parts · Labour · Outside work · Trip cash · Misc |
| Reconciliation line | These six add up to the total. Any rupee you cannot see here is not in it. |
| Excluded line | Supplier bills and challans are money we owe, not running cost. They are below. |
| Trend row | Up 18,400 on last month / Down 6,200 on last month / Same as last month |
| Cost per km | Fleet cost per km · Worked out over 42,460 km from 86 buses. 3 buses have no km. |
| No km badge | No km |
| No km section | Cannot work out cost per km (3) |
| No km reasons | Odometer marked broken on 12 Oct · Only one reading since 1 Nov · Readings 240 km apart — too close to divide |
| Money pit | Where the money went · By total · By cost per km |
| Trip cash | Trip cash · Give allowance · Expenses back · Close this trip |
| Trip states | No trips recorded · Open since 20:10, expenses not back · Closed, nothing spent |
| Trip sheet fields | Choose the bus · Driver · Date · Allowance given (Rupees handed to the driver) · What came back |
| Trip sheet guard | Not saved until you press Save allowance |
| Dues | Unpaid supplier bills · 11 bills, 4 of them over 30 days · Over 30 days · Open the bills |
| Dues redacted | Supplier names are not shown for your login. |
| Challans | Challans pending 18,400 on 7 buses · Check challans (uses 1 credit) |
| Empty | No spending recorded for March / Choose another period, or log a fuel fill or a bill. |
| Error, one part | Could not read the fuel log · One part could not be read, so the total is not shown. |
| Error, arithmetic | The parts do not add up to the total |
| Offline | No connection since 06:40. Figures may be out of date. |
| Needs network | Needs a connection |
| Saved | Allowance saved · Expenses saved · Trip closed |
| Not saved | Not sent. The entry is saved on this phone. It will send when there is signal. |

### 1.10 Money — what the server still sends (stage-3 requirements)

| Field or record hidden by the screen | Server today | Requirement |
|---|---|---|
| Everything on this screen, for `store`, `mechanic`, `office`, `driver`, `conductor` | **Sent in full.** `purchases`, `vendors`, `ledger`, `parts`, `jobcards` with labour and outside costs, `fuel`, `def`, `trips` (allowance and expenses), `challans`, `audits`, `incidents`, `components` are delivered to every authenticated role (`02 §5.1`, LIVE-ISSUES 2) | §7.1 — the whole of Money is client-side only today |
| Vendor names and bill photos, for a `viewSpendTotals`-without-`bills` role | Sent | §7.1 |
| The challan liability | `GET /challans` is owner/supervisor-guarded, but the **stored snapshot syncs to every role** (`02 §4.6`) | §7.1 |
| A closed trip's amounts, against a supervisor edit | Frozen for `driver` only | §7.6 |

---

## 2. People (#8)

> "Who is on the roll, how are they doing, and what did we do about it?"

### 2.1 Structure — phone first (`yard`)

```
[ .tabs ]  Crew · Staff logins · Crew PINs        (each tab only if its gate is held)
[ .field  [icon search] "Find a person" ]
[ .tabs ]  Worst first · Documents missing · Left        (secondary view, Crew only)
[ .btn  [icon add] "Add a person" ]                      (needs `manageDrivers`)
[ list: up to 200 × a.v2row ]
    .lead  icon('person')
    .t     Brijesh · driver · RJ09PA6126
    .sub   Score 41 · 2 incidents · licence expires in 19 days
    .act   figure(41, {unit: '/100'})
[ one line ]  "164 people. 164 shown."
```

**Opening a person** is a route, not a sheet — it holds the conversation log, the
documents and the reviews, and a sheet two people hold at once is the whole-record
last-write-wins problem (`v2-ux.md §6`).

```
[ back ]  [icon back] Crew
[ card: WHO ]
    .greet-style block: icon('person') ring, name at --t3, role + bus at --t5 --ink-dim
    .drow  Joined 14 Mar 2024 · Seat: RJ09PA6126, driver 1
    .drow  Phone 98xxxxxx12                       (needs manageDrivers-or-self)
    .drow  Salary 18,000 / month                  (needs `money` — §2.4)
[ card: SCORE ]
    .stat  .k "Crew score"  .v figure(41, {unit: '/100'})
    .drow × 4  the four parts, each with its own figure (§2.3)
[ card: DOCUMENTS ]        (needs manageDrivers-or-self — §2.5)
    6 × .drow   licence · aadhaar · pan · police · medical · photo
                each: number, expiry, and a badge when expiring or expired
    .photos grid of --thumb tiles
    .btn "Add a document"
[ card: INCIDENTS ]
    up to 10 × .v2row    type, date, cost, note
    .btn "Log an incident"                        (needs `logIncident`)
[ card: THEIR REVIEWS ]
    up to 5 × .v2row  → Reviews (#11)
[ card: THIS WEEK'S COACHING NOTE ]               (needs `crewNote`)
    "Shown to Brijesh once you approve it."
    good / fix / tip, in English and Hindi
    .btn-primary "Approve and send"    .btn "Skip this week"
[ card: CONVERSATION LOG ]                        (needs `crewNote`)
    "Office record. Brijesh never sees this."
    append-only list, newest first: kind, date, who wrote it, text
    .btn "Write what was said"
[ card: ON THE ROLL ]                             (needs `manageDrivers`)
    .btn-danger "Mark as left"
```

### 2.2 Structure — desk (`desk`, rail)

Master–detail at 864px: the crew list is a 320px left panel of one-line `.v2row`s (164
rows at `--row-h` 32px, inside the cap, one string, one insert), the person fills the
remaining 544px as two stacked columns of cards. The `.tabs` sit above both. The
documents grid is `--thumb` 56px at desk — six across a 544px column with `--s2` gaps
is 336 + 40 = 376px, comfortable.

### 2.3 One crew score, with its parts on screen

Today five ordered lists of the same people use three different scores (`01 §5.2`).
This screen has **one**, called **"Crew score"**, out of 100, worst first, and it shows
what it is made of — because a blended number nobody can decompose is a number people
stop believing:

| Part | Read from | Shown as |
|---|---|---|
| Passenger reviews | `rbreviews.stars` traced through `rbalias` | "Reviews 2.4 stars from 31 reviews" |
| Incidents | `incidents` | "3 incidents, 12,400 rupees" |
| Attendance | `attendance` late flags | "Late 4 of 22 days" |
| Safety events | `gpsevents` by registration for the buses they drove (`dutylog`) | "11 overspeed, 2 harsh brakes" — and `figure(null)` with "No GPS for your login" for `crewmanager` and `office`, who are not sent `gpsevents` (`02 §5.1`) |

A part that cannot be read is `figure(null)` with its reason, and **the score is still
drawn** with the line "Worked out from 3 of 4 parts." A score that silently drops a part
is the five-bases bug in a new place.

### 2.4 Salary — the version that does not depend on Q4, and the dependency named

**Q4 is open** ("is crew pay a money matter or a people matter?", `v2-ux.md §8`). The
version built now:

> **Salary (`drivers.salaryMonthly`) shows only for a role holding `money`.** Today that
> is owner and supervisor. It does **not** show for `crewmanager`, and it does not show
> for `office`. The row is **absent**, not masked and not greyed.

This is v1's own rule (`canSeePay`, `app.js:11425`) and it needs no answer to Q4 to be
built. **The dependency, exactly:** if the owner answers "pay is a people matter", the
gate becomes `manageDrivers` instead of `money`, one row appears on the crew manager's
view and one field appears in the edit sheet. **Nothing else on this screen changes** —
not a layout, not a token, not a state. That is the whole cost of the open question, and
it is why stage 2 did not wait for it.

**And the hiding is cosmetic for one role today.** `salaryMonthly` is in
`_DRIVER_PRIVATE`, so the server strips it for `office`, `store`, `mechanic`, `driver`
and `conductor` — but `crewmanager` is in `PII_ROLES` and **receives it whole**
(`02 §5.3` item 2). A crew manager's `/pull` carries every crew member's pay while this
screen hides it. Stage-3 backend item §7.2.

### 2.5 Identity documents — permission-or-self, and it leaked once

**The rule:** another person's identity documents reach **nobody** outside
`manageDrivers`-or-self. `docs`, `license`, `dob`, `address`, `bloodGroup`, `phone`,
`altPhone` are a single block: either the whole DOCUMENTS card is drawn, or it is
**absent** with one line in its place — "Documents are not shown for your login." Never a
card of blanked rows: a row that exists and is empty teaches people to ask why.

It leaked once ([C] `02 §6.2`, commit `c5c11a1`): a driver and a conductor opened another
driver's document locker, and the write path had no check either. So:

- The check is **per record, not per route**: `manageDrivers || record.userId === me.id`.
  A flat route permission cannot express "or self", which is exactly how that bug lived.
- The same check guards the **write** (adding or replacing a document), because the
  original bug was on both paths.
- The document photo is shown through `.photos` → `V2.openPhoto` → a sheet. **The URL is
  never put in link text, never in a copy button, never in a toast**, because
  `GET /uploads/<32 hex>.jpg` needs **no login at all** (`02 §4.5`): anyone holding the
  URL holds the document. That is a real protection gap and it is stage-3 item §7.5 —
  until it is fixed, the screen's rule is "the URL does not leave the image element".

**What the server already does, and what it does not** (this is the honest part):

| Field on a crew record | Withheld today from | Still sent to |
|---|---|---|
| `phone`, `altPhone`, `address`, `dob`, `bloodGroup`, `license`, `docs`, `salaryMonthly` | `office`, `store`, `mechanic`, `driver`, `conductor` | owner, supervisor, **crewmanager** (correct for the first seven; wrong for salary — §2.4) |
| `emgName`, `emgPhone`, `emgRelation`, `refName`, `refPhone` | **nobody** | **every signed-in role**, including a `conductor` with zero capabilities (`02 §5.3` item 1) — §7.3 |
| `photo` (the crew member's face) | **nobody** | every role — §7.3 |
| `leftAt`, `leftReason`, `leftReasonKey`, `leftNote`, `rehire` | **nobody** | every role — §7.4 |

So this screen hides emergency and reference phone numbers, the face photo and the HR
leave fields from everyone outside `manageDrivers`-or-self, **and for all four of those
the server still sends them.** Four stage-3 requirements, not four design choices.

### 2.6 The conversation log — never reaches the person it is about

[E] `4a42e38`. A note written knowing its subject will read it stops being a record and
becomes a performance. Three rules:

1. **It is never on Me (#12), for any role, ever.** Not summarised, not counted, not
   "3 notes on file".
2. **On People it carries its own label, above the list, always drawn:** "Office record.
   Brijesh never sees this." The reader has to know what kind of writing this is before
   they write.
3. **It is append-only in the interface because it is append-only in the store.**
   `crewnotes` is immutable and undeletable, owner included (`02 §4.4`). So there is no
   edit control and no delete control — not disabled ones, **absent** ones — and the
   write sheet says so before the text box: "Once saved, this cannot be changed or
   deleted. Author and time are recorded."

**The coaching note is the opposite and must never look like it.** It is *for* the
person, `/my/coaching` returns it to them, and approving it sends it. So the two cards
carry opposite labels in the same words-first style: "Shown to Brijesh once you approve
it." against "Office record. Brijesh never sees this." Different cards, different
buttons, never adjacent in the DOM order — the coaching card sits above the incidents
card, the log sits at the bottom of the screen.

**What the server does, and the hole in it.** `crewnotes` is sent to owner, supervisor,
crewmanager and office, and **not** to driver, conductor, mechanic or store (`02 §5.1`).
So for the crew as they exist today the server really does withhold it. The hole is that
the denial is **by role, not by subject**: if a crew member is ever linked to a login
with one of those four roles — a driver promoted to supervisor, a conductor given the
office login — the server will hand them every note written about them. Stage-3 item
§7.7: deny a `crewnotes` row whose `crewId` resolves to the caller's own crew record,
whatever the caller's role. The client applies the same rule now (`note.crewId !==
myCrewId`), and a client rule has been walked around six times in this codebase
(`02 §6.1`).

### 2.7 Add a joiner, with duplicate detection

A sheet, and the person is created on the **first** save with the minimum that makes a
real record — name, driver or conductor, phone — so an interruption leaves a person on
the roll rather than a draft on one phone (the job-card rule, `v2-ux.md §6`). Documents,
seat and salary are added to a record that already exists.

**Duplicate detection runs before the save, not after**, and it is a local read — it
works offline:

- normalised name (case-folded, spaces collapsed) against every `drivers` record **in
  every status**, `active`, `left` and `archived`;
- `phone` and `altPhone` exact match on the last 10 digits.

A hit opens, inside the same sheet, a short list of what matched:

> **"Looks like somebody already on the roll"**
> `Brijesh · driver · RJ09PA6126 · active` → [Open this person]
> `Brijesh Kumar · driver · left 12 Aug 2025` → [Bring back]
> `.btn-quiet` "No, this is a different person — add anyway"

"Bring back" is the rehire path and writes the existing record (`status:'active'`,
`rehire`, `rejoinedAt`) rather than making a second one. 107 drivers and 57 conductors
share first names heavily in the seed ("Brijesh", "Rakesh", "Vikram"), so a
name-only match is a question, never a block: "add anyway" is always available and is
never the default button.

### 2.8 Mark a leaver

`.btn-danger` "Mark as left" → a sheet with reason (`.select`: left · dismissed ·
retired · other), note (`.field textarea`), last day (`.field type="date"`), then
`V2.confirmDialog` whose text **names the consequence**:

> "Mark Brijesh as left? His seat on RJ09PA6126 becomes empty for tonight."

Writes existing fields only: `status:'left'`, `leftAt`, `leftReason`, `leftReasonKey`,
`leftNote`, `busId: null`, plus one `dutylog` row with `reason:'left'` (append-only,
immutable, `by` from the token). Nothing clears a seat the person did not touch
(`05 §4` row 26) — so the seat is named before the press, not discovered on the duty
board at 20:00.

### 2.9 Crew logins and PINs, and staff logins

**Crew PINs** (`manageCrewLogins`; owner and supervisor only). 165 PINs were minted and
read out one by one, 5–6 hours (`v2-ux.md §2.3` friction #6), for an app those people do
not open (`DECISIONS.md §7`). So this tab is built to be used rarely and correctly:

- PINs are minted **by bus**, not for the whole roll: a `.v2row` per bus with its crew
  and a `.btn` "Make PINs for this bus (3)".
- The returned PINs appear **once**, in a sheet, grouped by person, at `--t3` so they can
  be read out at arm's length. The sheet's head says: **"Write these down now. They are
  shown once."** The server will not return an existing PIN.
- They are never in a list row, never in a toast, never in the conversation log, never in
  `usage`. Closing the sheet is a `V2.confirmDialog`: "Close? These PINs cannot be shown
  again."
- Minting needs the network (`POST /auth/register-roster`, `02 §4.5`), so the sheet says
  so **before** it is filled: "Needs a connection."

**Staff logins** (`manageStaff`). The role `.select` offers **only the roles the signed-in
person may manage** — supervisor: store, mechanic, driver, conductor; owner: any of the
eight (`may_manage`, `02 §4.5`). Offering a role the server will refuse is a form filled
in for nothing. Delete is **owner-only, not self, not the last owner**, so for a
supervisor the delete control is absent, and for an owner looking at their own row it is
absent too, with the line "You cannot delete your own login."

### 2.10 People — every state

| State | What is on screen |
|---|---|
| **loading** | `skeleton(12)` for the crew list (12, because that is what fits a phone without the list jumping when it fills). The `.tabs` draw at once with `figure(null)` counts. The person's cards each skeleton their own height; the score is **never** drawn mid-fill |
| **empty** | No crew at all: `emptyState('Nobody on the roll yet', {icon: 'person', hint: 'Add a person, or import the roster.'})`. The "Left" filter with nobody in it: `emptyState('Nobody marked as left')` — naming the filter, not "No data" |
| **one item** | One person: the list draws one row and no count line. The master–detail desk layout opens that person immediately rather than showing an empty right pane |
| **far too many** | 164 crew today; the cap is **200 rows with the remainder stated** ("1,240 people. 200 shown. Use the search or a filter."). One string, one insert, no per-row measurement, no `at` on any figure inside a row. Past 200 the list windows, which means one-line rows only |
| **error** | `errorState('Could not read the crew list', retry)` for the list. One card failing inside a person does not blank the person: that card takes its own `errorState` and the rest stays. The score shows `figure(null)` with "Could not work out the score" rather than a number built from what happened to load |
| **offline** | List and person draw from the local database; the header says "No connection since 06:40." **Absent, each with "Needs a connection":** make crew PINs, add or rename a staff login, set a PIN, approve the coaching note, upload a document photo. Present and working: the conversation log write, the incident log, mark as left, add a person, duplicate detection. The office login **can** start cold offline (only owner, supervisor and crewmanager cannot sign in offline, `v2-ux.md §6`), so for `office` this is a real first-screen state and it must not be a blank one |
| **half-finished** | A joiner saved with no documents is a person with a `badge badge-warn` "Documents missing" and a place in the "Documents missing" filter. It does **not** go to Attention (#2) until a document exists and is expiring — [E] `5eb8c6e`, "110 of 110 missing documents", is a count that could never reach zero. An unsent conversation note is in the sheet only, and the sheet says "Not saved until you press Save" |
| **no permission** | Not reachable for `store`, `mechanic`, `driver`, `conductor`. For a holder, missing inner gates make whole cards absent: no `crewNote` → no coaching card and no log; no `manageCrewLogins` → no Crew PINs tab; no `manageStaff` → no Staff logins tab; no `manageDrivers` → no add, no edit, no mark-as-left, no documents |
| **partially redacted** | **This is the office login, and it is the state to build first.** The row and the person open; absent with a stated reason: documents ("Documents are not shown for your login"), phone, salary, the GPS part of the score ("No GPS for your login"). Present: name, role, bus, score from 3 of 4 parts, incidents, reviews, the conversation log, and the one write the office has — a note. The crew manager's variant: everything except salary and the two login tabs |

### 2.11 People — interactions, exactly

| Control | Does | Pressed | Focus | Disabled | While working |
|---|---|---|---|---|---|
| Tabs (Crew / Staff logins / Crew PINs) | Changes what is drawn; no route, no write | `scale(0.97)` 120 ms | ring `offset: -2px` | Never. A tab whose gate is missing is **absent** | — |
| Search `.field` | Filters locally. A field, so the delegated click handler returns early before `[data-act]` | none | ring `offset: 2px` | — | — |
| Crew row | `a.v2row` → the person | `scale(0.97)` | ring `offset: -2px` | — | — |
| "Add a person" | Sheet | `scale(0.97)` | ring | Absent without `manageDrivers` | "Saving…" |
| Duplicate list "Open this person" / "Bring back" / "Add anyway" | Three distinct buttons; "Add anyway" is `.btn-quiet` and **never** the focused default | `scale(0.97)` | ring | — | "Saving…" |
| "Add a document" | `.photos` capture label wrapping `input type="file" accept="image/*"`, the input `.sr-only`, the **label** carrying the ring via `:focus-within` | `scale(0.97)` on the label | `:focus-within` ring `offset: 2px` | Absent without `manageDrivers`-or-self | The tile shows the `.skeleton-bar` fill at `--thumb` square while it decodes; **the word "Sending" and no spinner** while it uploads |
| "Write what was said" | Sheet; `.select` kind + `.field textarea` | `scale(0.97)` | ring | `aria-disabled="true"` until there is text | "Saving…", then `V2.toast('Note saved', {kind: 'ok'})` |
| "Approve and send" | `POST /ai/coaching/decide` | `scale(0.97)` | ring | Offline: absent, with "Needs a connection" | "Sending…" for the life of the request, then a toast. **Never drawn optimistically and then withdrawn** — on a 30–36 s cold server that is a button somebody presses twice |
| "Mark as left" | `.btn-danger` → sheet → `V2.confirmDialog` naming the seat, focus on **Cancel** | `scale(0.97)` | ring | Absent without `manageDrivers`; absent on somebody already left | "Saving…" |
| "Make PINs for this bus (3)" | Network mint | `scale(0.97)` | ring | Offline: absent | "Making PINs…"; the result sheet cannot be reopened |
| Salary row | Read-only text; editing is inside the edit sheet | n/a | n/a | **Absent** without `money` | — |

### 2.12 People — copy, in full

| Where | Words |
|---|---|
| Screen title | People |
| Tabs | Crew · Staff logins · Crew PINs |
| Filters | Worst first · Documents missing · Left |
| Search | Find a person |
| Row sub-line | Score 41 · 2 incidents · licence expires in 19 days |
| Count line | 164 people. 164 shown. / 1,240 people. 200 shown. Use the search or a filter. |
| Score card | Crew score · Worked out from 3 of 4 parts. |
| Score parts | Reviews 2.4 stars from 31 reviews · 3 incidents, 12,400 rupees · Late 4 of 22 days · 11 overspeed, 2 harsh brakes |
| Score, part missing | No GPS for your login · Could not work out the score |
| Documents | Documents · Add a document · Expires in 19 days · Expired 2 months ago |
| Documents hidden | Documents are not shown for your login. |
| Coaching | This week's coaching note · Shown to Brijesh once you approve it. · Approve and send · Skip this week |
| Log | Conversation log · Office record. Brijesh never sees this. · Write what was said |
| Log write guard | Once saved, this cannot be changed or deleted. Author and time are recorded. |
| Log empty | Nothing written down yet |
| Joiner | Add a person · Name · Driver or conductor · Phone · Save and add documents later |
| Duplicate | Looks like somebody already on the roll · Open this person · Bring back · No, this is a different person — add anyway |
| Leaver | Mark as left · Reason · Note · Last day · Mark Brijesh as left? His seat on RJ09PA6126 becomes empty for tonight. |
| PINs | Make PINs for this bus (3) · Write these down now. They are shown once. · Close? These PINs cannot be shown again. |
| Staff | Staff logins · Add a login · Role · You cannot delete your own login. |
| Needs network | Needs a connection |
| Empty | Nobody on the roll yet / Add a person, or import the roster. · Nobody marked as left |
| Error | Could not read the crew list |
| Offline | No connection since 06:40. |
| Not saved | Not sent. The note is saved on this phone. It will send when there is signal. |

### 2.13 People — what the server still sends (stage-3 requirements)

| Hidden by the screen | Server today | Requirement |
|---|---|---|
| `salaryMonthly` from `crewmanager` | **Sent** — `crewmanager` is in `PII_ROLES` | §7.2 |
| `emgName`, `emgPhone`, `emgRelation`, `refName`, `refPhone` from every role outside `manageDrivers`-or-self | **Sent to every signed-in role** | §7.3 |
| `photo` (the face) from the same | **Sent to every role** | §7.3 |
| `leftAt`, `leftReason`, `leftReasonKey`, `leftNote`, `rehire` from the same | **Sent to every role** | §7.4 |
| A document image behind its URL | `GET /uploads/<32 hex>` needs **no login** | §7.5 |
| A `crewnotes` row from the person it is about, when that person holds a note-reading role | Denied **by role**, not by subject | §7.7 |
| `incidents` and `driverreports` about other crew, from `office` | **Sent in full** | §7.8 |
| `attendance` for every staff member, from every role | **Sent in full** | §7.1 |

---

## 3. Reviews (#11)

> "Which crew member did this passenger mean, and whose fault was it?"

### 3.1 Structure — phone first (`yard`), desk (`desk`) after

```
[ .tabs ]  Reviews · Complaints · Names to confirm (14)
[ .tabs ]  All · Low (1–2 stars) · Conflict · Untraced          (Reviews only)
[ .field  [icon search] "Find a bus, a name or a word" ]
[ list: windowed, one-line a.v2row ]
    .lead  icon('star')
    .t     2 stars · RJ09PA6126 · 2 Nov · Brijesh
    .act   figure(2, {unit: 'star'})
[ one line ]  "4,012 reviews. 200 shown. Narrow with a filter."
```

Opening a review is a **sheet** (one reader, no shared edit, and it closes back to the
list):

```
[ sheet: REVIEW ]
    .ov-title  2 stars · 2 Nov
    .drow  Bus RJ09PA6126 · Jaipur → Indore · service 4471
    .drow  Crew: Brijesh (driver 1) · Anil Jhansi (conductor)   → People (#8)
    blockquote-style .card: the passenger's words
    .card: CLAUDE'S READING
        "Claude's reading, not a finding."
        Fault: driver · Topics: rash driving, late start · Safety: yes · Severity 2 of 3
        .drow  "Why: the comment names the driving, and the bus left 40 minutes late."
    .btn "Write what was said"        (needs `crewNote`)
    .btn "Log an incident"            (needs `logIncident`)
    .btn-quiet "This is the wrong crew member"   → the name queue for that bus
```

Desk: the list is a 360px left panel of one-line rows and the review opens in the
remaining 504px as a panel rather than a sheet — same markup, no `<dialog>`, because at
desk the list and the review are read together.

### 3.2 How the office login is scoped

The office exists for this screen and nothing else (`v2-ux.md §4.1` #11). Four layers,
and only three of them hold today:

1. **Screens:** Today, People (read + conversation log), Reviews, Me. Four, no nav
   overflow, no More sheet.
2. **Capabilities:** `crewReviews`, `crewPerf`, `crewNote`. Three, and `crewNote` is the
   office's one write (`02 §2.1`).
3. **The server, where it holds:** `office` is deliberately outside `PII_ROLES` with a
   carve-out for the review stores (`02 §5`). It receives `rbreviews`, `rbcomplaints`,
   `rbassign`, `rbreviewai`, `rbalias`, `crewnotes`. On `rbreviews` and `rbcomplaints`
   the journey fields — `pnr`, `tin`, `seats`, `fare`, `boardAt`, `doj`, `amount` — are
   **stripped and the record marked `_redacted: true`** ([E] `bd11e75`). It does **not**
   receive `itslookup` or `rbaliasai`. `test_office.py` encodes all of it.
4. **The server, where it does not hold:** the office token still receives
   `purchases`, `vendors`, `ledger`, `parts`, `jobcards` with costs, `fuel`, `trips`,
   `challans`, `incidents`, `driverreports`, `attendance`, `users`, `gatechecks` with
   their selfies, and crew `emgPhone` / `refPhone` / `photo` (`02 §5.1`, §5.3). A desk
   that reads crew performance holds the business's money and the gate's photographs.
   §7.1 and §7.3.

**On this screen, for `office`:**

- The **passenger-journey lookup does not exist.** No PNR field, no seat, no fare, no
  board point, no "look up this ticket" button — **absent**, not disabled, and no label
  anywhere on the screen names any of those words (`v2-foundation-ui.md §6.3`). A desk
  reading crew performance has no business holding a passenger's travel record.
- Where a journey field would have been, one line: **"Passenger ticket details are not
  part of this screen."** Stated once, at the bottom of the review, so a reader stops
  looking rather than believing the data failed to load.
- **The name queue is absent** — it is `manageDrivers`, which the office does not hold —
  and so is Claude's name suggestion (`rbaliasai`, which the server does not send it).
  Claude's *fault* reading (`rbreviewai`) **is** sent and **is** shown: that is crew
  performance, which is what the login is for.
- Identity documents are absent, per §2.5.

### 3.3 The typed-name queue — the second-biggest friction in the business

`v2-ux.md §2.3` ranks matching typed redBus names to real crew by hand at **2–6 hours a
week, mid 4**, second only to the job card. 1,025 reviews in 16 days is [E]. So this
queue is the one high-throughput surface in these three screens, and it is designed for
one thing: **one tap per name.**

Each row is one typed name on one bus — an `rbalias` record, id
`al-<NORMREG>-<name_with_underscores>`:

```
[ .v2row  (desk, one line) ]
    .lead  icon('person')
    .t     "BRIJESH K"  ·  RJ09PA6126  ·  driver
    .sub   (yard only)  Claude: Brijesh — 14 nights on this bus
    .act   [.btn-primary "Yes, Brijesh"]  [.btn "Someone else"]  [.btn-quiet "Not a person"]
```

- **Claude's pick is pre-filled into the button's label, never pre-committed.** The row
  is not selected, nothing is written until a press. `rbaliasai` carries `pick`, `conf`,
  `reason`, `nights`, `onBus`; `conf` of `high` puts the name in the primary button,
  `medium` or `low` puts "Choose the crew member" there instead and the suggestion in
  the sub-line. A confident wrong guess that takes one tap to accept is worse than no
  guess.
- **"Someone else"** opens a sheet listing that bus's own crew first (from `dutylog` for
  the dates the name appeared), then a search over the whole roll.
- **"Not a person"** writes `status:'generic'` — the typed name was a word, not a
  person. This is the row kind that answers "why could this review not be pinned on
  anybody".
- **A group confirm exists and shows its work:** "Confirm 7 high-confidence names on
  RJ09PA6126" reveals the seven rows **above** the button, and the button is pressed
  after they are visible. No bulk action without the list in front of the reader.
- **Claude's own auto-confirms are visible and reversible.** The server auto-confirms
  some aliases with `decidedBy: 'claude'`; those rows carry a `badge` with the word
  **"Decided by Claude"** and the same three buttons. `rbalias` keeps `history` (last 20
  changes) and is never deleted, so a correction is a record, not an erasure.
- Writes `rbalias` only: `status`, `crewId`, `decidedBy`, `decidedAt`. A human write
  strips Claude's `auto`, `reason` and `evidence`, as v1 already does. **No new field.**

### 3.4 Claude's reading of fault, and the one thing this screen cannot record

`rbreviewai` holds `faults`, `topics`, `safety`, `severity` (0–3), `en`, `hi`. It is
shown with three rules: labelled **"Claude's reading, not a finding."**; the evidence
sentence shown beside the verdict, never the verdict alone; and Hindi taken from the
record's own `hi` field rather than translated in the client.

**What cannot be done, named rather than quietly dropped:** there is nowhere to record
"Claude was wrong about fault". `rbreviewai` is server-written
(`SERVER_INGEST_ONLY`), and `v2` may not add a field or a store
(`DECISIONS.md §2`, `v2-foundation-ui.md §7.1` item 13). So a human disagreement is
recorded through what exists — a conversation note (`crewnotes`), an incident
(`incidents`), or reassigning the crew member (`rbalias`) — and the screen says so in
the words on the buttons rather than offering an "I disagree" control that writes
nothing. If the business wants the disagreement itself recorded, that is a field or a
store and it goes back to stage 1 (§9.3).

### 3.5 Why Reviews cannot use the ranked row — a consequence worth stating

Attention (#2) ranks with `.v2row.v2row-why`, whose height is variable, so it may not be
windowed and is capped at 200 (`v2-foundation-ui.md §2.4`). Reviews holds ~4,000 records
and grows by ~1,025 every sixteen days. A cap of 200 on a list somebody searches is a
list that hides the answer.

**So the Reviews list is the one-line `.v2row` and it windows.** Scroll height is
`rows × --row-h`, computed, never measured. The consequence the reader must accept: **the
reason does not fit in the row.** It goes into the opened review, where there is room for
the passenger's words and Claude's evidence. That is the right trade here and the wrong
one on Attention, and the difference is the number of rows.

### 3.6 Reviews — every state

| State | What is on screen |
|---|---|
| **loading** | `skeleton(12)`. The three `.tabs` draw at once with `figure(null)` counts — a dash, because "14 names to confirm" and "0 names to confirm" must not look alike while it reads |
| **empty** | `emptyState('No reviews with 1 or 2 stars', {icon: 'star', hint: 'Try All, or another month.'})` — the filter named. The name queue empty is the state the screen exists to reach: `emptyState('Every name is matched', {icon: 'ok', hint: 'Checked just now.'})` |
| **one item** | One review: the list draws one row, no count line, and at desk it opens immediately |
| **far too many** | 4,012 reviews: windowed one-line rows, "4,012 reviews. 200 shown. Narrow with a filter." One string, one insert, no `at` on a row figure, freshness in the header once |
| **error** | `errorState('Could not read the reviews', retry)` for the list. A review whose AI reading failed to load keeps the review and replaces the reading with "Claude has not read this one yet" — never a blank card and never a fabricated verdict |
| **offline** | Reviews, complaints, aliases and Claude's stored readings are local records and all work. **Absent, with "Needs a connection":** "Ask Claude to read this" (`POST /ai/reviews`), "Ask Claude about this name" (`POST /ai/names`). The collector is server-side, so the header says "No new reviews since 06:40" rather than implying the list is complete |
| **half-finished** | Each confirm is its own write, so the queue shows "7 left on this bus" and an interruption costs nothing. A review note typed and not saved lives in the sheet only: "Not saved until you press Save" |
| **no permission** | Not reachable for `store`, `mechanic`, `driver`, `conductor` — their own reviews are on Me (#12) through `/my/reviews`, which is own-record on the server |
| **partially redacted** | **The office login** (§3.2): the review, the stars, the words, the bus, the crew and Claude's fault reading; **no** PNR, seat, fare, board point or date of journey, **no** lookup control, **no** name queue, **no** identity documents; one line where the journey would have been. The crew manager: everything the owner sees except `itslookup`-backed detail, which the server does not send them either — so for `crewmanager` the lookup control is also absent |

### 3.7 Reviews — interactions, exactly

| Control | Does | Pressed | Focus | Disabled | While working |
|---|---|---|---|---|---|
| Tabs (Reviews / Complaints / Names to confirm) | Changes what is drawn | `scale(0.97)` 120 ms | ring `offset: -2px` | Never; an ungated tab is absent | Lists go to `skeleton()` |
| Filters (All / Low / Conflict / Untraced) | Changes what is drawn. Mutually exclusive, so `.tabs` and never a multi-select — which is also why the rejected `--surface-pick` token has no consumer here (`v2-foundation-ui.md §1.3`) | `scale(0.97)` | ring `offset: -2px` | Never | — |
| Review row | Opens the review (sheet at yard, panel at desk) | `scale(0.97)` | ring `offset: -2px` | — | — |
| "Yes, Brijesh" | Writes `rbalias` | `scale(0.97)` | ring `offset: 2px` | Absent without `manageDrivers` | "Saving…", `aria-disabled="true"`; the row leaves the queue on success and the count in the tab drops |
| "Someone else" | Sheet, that bus's crew first | `scale(0.97)` | ring | Absent without `manageDrivers` | — |
| "Not a person" | Writes `status:'generic'` | `scale(0.97)` | ring | Absent without `manageDrivers` | "Saving…" |
| "Confirm 7 high-confidence names" | Reveals the seven, then writes seven `rbalias` records in one push | `scale(0.97)` | ring | `aria-disabled="true"` until the seven are visible | "Saving 7…" then one toast naming the number: "7 names confirmed" |
| "Write what was said" | `crewnotes` sheet, per §2.6 — and the same label: "Office record. Brijesh never sees this." | `scale(0.97)` | ring | Absent without `crewNote`; `aria-disabled` until there is text | "Saving…" |
| "Log an incident" | `incidents` sheet | `scale(0.97)` | ring | Absent without `logIncident` | "Saving…" |
| "This is the wrong crew member" | Jumps to the name queue filtered to that bus | `.btn-quiet` press | ring | Absent without `manageDrivers` | — |
| Search `.field` | Local filter over the windowed list | none | ring `offset: 2px` | — | — |

### 3.8 Reviews — copy, in full

| Where | Words |
|---|---|
| Screen title | Reviews |
| Tabs | Reviews · Complaints · Names to confirm (14) |
| Filters | All · Low (1–2 stars) · Conflict · Untraced |
| Search | Find a bus, a name or a word |
| Row | 2 stars · RJ09PA6126 · 2 Nov · Brijesh |
| Count line | 4,012 reviews. 200 shown. Narrow with a filter. |
| Review head | Bus RJ09PA6126 · Jaipur → Indore · service 4471 · Crew: Brijesh (driver 1), Anil Jhansi (conductor) |
| Claude's reading | Claude's reading, not a finding. · Fault: driver · Rash driving, late start · Safety: yes · Severity 2 of 3 · Why: the comment names the driving, and the bus left 40 minutes late. |
| Not read yet | Claude has not read this one yet |
| Untraced reasons | No bus recorded for that service on 2 Nov · Two drivers on that bus that night · The typed name is a word, not a person |
| Name queue | Names to confirm · Yes, Brijesh · Someone else · Not a person · Choose the crew member · Decided by Claude · Confirm 7 high-confidence names on RJ09PA6126 · 7 left on this bus |
| Claude's evidence, names | Claude: Brijesh — 14 nights on this bus |
| Office line | Passenger ticket details are not part of this screen. |
| Empty | No reviews with 1 or 2 stars / Try All, or another month. · Every name is matched / Checked just now. |
| Error | Could not read the reviews |
| Offline | No new reviews since 06:40. · Needs a connection |
| Saved | Name confirmed · 7 names confirmed · Note saved · Incident logged |
| Not saved | Not sent. The name is saved on this phone. It will send when there is signal. |

### 3.9 Reviews — what the server still sends (stage-3 requirements)

| Hidden by the screen | Server today | Requirement |
|---|---|---|
| Journey fields from `office` | **Already withheld.** `pnr`, `tin`, `seats`, `fare`, `boardAt`, `doj`, `amount` stripped, record marked `_redacted` ([E] `bd11e75`) | None. This one is real — keep it and keep `test_office.py` |
| `itslookup` and `rbaliasai` from `office` | **Already withheld** | None |
| Review stores from `store`, `mechanic`, `driver`, `conductor` | **Already withheld** | None |
| Everything else the office token receives — money, costs, trip cash, gate selfies, attendance, crew face photos and emergency numbers | **Sent** | §7.1, §7.3 |

---

## 4. Motion

**No new animation on any of these three screens.** Everything that moves here already
exists and is already justified (`v2-foundation-ui.md §5`):

| What moves | Property | Duration / easing | Why |
|---|---|---|---|
| Every pressable — `.btn`, `[role="tab"]`, `button.v2row`, `a.v2row`, a photo tile, the capture label | `transform: scale(0.97)` | 120 ms `ease-out` | The office machines take hundreds of milliseconds to draw a screen. A control with no feedback reads as broken and the person presses again — which on "Save allowance" is two cash records |
| The trip sheet, the note sheet, the PIN sheet, the review sheet | `translateY(var(--s8))` → none, with opacity | 250 ms in `ease-out`, 180 ms out | It arrives from the edge it is anchored to, so its direction is its dismissal |
| "Close this trip?", "Mark as left?", "Close? These PINs…" | `scale(0.95)` → none, with opacity | 200 ms in, 150 ms out, `transform-origin: center` | A destructive question must not appear in the same instant as the tap that asked for it |
| The scrim | `opacity` 0 → 0.5 on `--accent-ink` | 200 ms in, 150 ms out | The page behind is inert; the scrim is the only thing that says so |
| Toasts | `translateY(var(--s2))` → none, with opacity | 200 ms in, 150 ms out | A message that appears without transition reads as a redraw, which in this app's history means something broke |

**Explicitly not animated here, each for a named reason:** the period tabs and the review
filters (pressed tens of times a day — a 200 ms slide on the thing you press most makes
the app slower than it is); the figures (`tabular-nums` exists so digits do not shift,
and these numbers are read against each other); the money-pit reorder (the reorder **is**
the information); the name queue's row leaving (a sync tick applies records every 4 s, so
an animated queue would be in motion permanently); the crew list; the skeleton
(deliberately static); photo tiles arriving. `prefers-reduced-motion: reduce` keeps the
acknowledgement as `opacity` and removes the movement, as `components.css` already does.

---

## 5. Copy rules these three screens add to the foundation's voice

The foundation's §6.1 voice applies unchanged. Four additions, each because of something
on these screens:

1. **A figure is never formatted before `figure()` sees it.** Pass the raw value and a
   `format` function. `figure(0)` is a zero, `figure(null)` is a dash and says "No data";
   formatting first turns the dash into "₹0" and that is the five-bases bug in one line.
2. **Price a lookup before it is pressed:** "Check challans (uses 1 credit)".
3. **A label that says who will read it.** Every writing surface about a person carries
   its audience: "Shown to Brijesh once you approve it." against "Office record. Brijesh
   never sees this." A writer who does not know the audience writes the wrong thing.
4. **A hidden field says it is hidden, once, in words** — "Documents are not shown for
   your login", "Passenger ticket details are not part of this screen" — and never by
   drawing an empty row. An empty row is the silence that has had eight causes
   (`v2-ux.md §6`).

**Hindi.** Every string in §1.9, §2.12 and §3.8 is a screen label, and
`v2-foundation-ui.md §6.3`'s rule is adopted for screen labels too: **a missing Hindi
value is a build error, not an English fallback.** The three readers that matter here are
a supervisor at the gate at 20:00 (Money's trip entry), a crew manager at a desk (People)
and the office login (Reviews). Q12 — who reads Hindi only — is still open and does not
block any of it; the mechanism does not depend on the answer.

---

## 6. The backend's to-do list

Every field these three screens hide that the server still sends. A hidden field that is
still sent is not protected; it is curtained. This is **stage 3's single largest security
item** and `v2-ux.md §4.3` says the pressure to do it is now entirely internal, because
the decision that would have forced it was reversed.

| # | Requirement | Evidence | Who it affects |
|---|---|---|---|
| **7.1** | **Make the read boundary follow the screen declaration.** A role that opens no screen needing supplier bills, the ledger, job-card costs, fuel, trip cash, challan liabilities, audits, attendance or garage settings must not receive those stores. Today `redact_for` denies only `aimeta`, `digest`, `crewnotes`, the review/AI stores and the history stores, and **everything not named is returned to every authenticated role** — a `conductor` with zero capabilities included | `sync_server.py:3779`; LIVE-ISSUES 2; `02 §5.1`, §5.3 items 4–6 | all of Money, most of what the office token can pull |
| **7.2** | **Strip `salaryMonthly` for `crewmanager`** (or, if Q4 answers "pay is a people matter", strip it for every role without the new gate). Today `crewmanager` is in `PII_ROLES` and receives pay whole while the client hides it | `02 §5.3` item 2 | People §2.4 |
| **7.3** | **Add `emgName`, `emgPhone`, `emgRelation`, `refName`, `refPhone` and `photo` to the crew private-field list.** They are sent to **every** role today — Q11 is the owner's question about who may see them, and whatever he answers, "everyone" is not it | `02 §5.3` item 1; `03 §2.1` | People §2.5 |
| **7.4** | **Add `leftAt`, `leftReason`, `leftReasonKey`, `leftNote`, `rehire` to the same list.** Why somebody left is an HR record, and it reaches a conductor today | `02 §5.3` item 1 | People §2.8 |
| **7.5** | **Authenticate `GET /uploads/<32 hex>`.** Aadhaar and licence images are protected only by an unguessable name; the same holds for the public R2 bucket | `02 §4.5` | People §2.5 |
| **7.6** | **Freeze a closed `trip` for every role, not only `driver`.** Today a supervisor or owner token may push a changed closed trip, so the screen's rule is a convention | `02 §4.4` | Money §1.5 |
| **7.7** | **Deny a `crewnotes` row whose `crewId` resolves to the caller**, whatever the caller's role. The denial is by role today, so a crew member linked to a note-reading login would receive notes about themselves | `02 §5.1`; [E] `4a42e38` | People §2.6 |
| **7.8** | **Decide and enforce whether `office` receives other crew's `incidents` and `driverreports` in full.** It does today; the screen shows incidents, so this may be intended — but it is not a rule, it is the absence of one, and §5.3 item 3 says so | `02 §5.3` item 3 | People, Reviews |

Two further items that are not mine but that these screens sit on top of:

- **LIVE-ISSUES 1 is live in `v2/sync.js` too.** `DECISIONS.md §14`: v2 starts from a
  byte-identical copy, so **v2 starts with the same silent-drop bug** — a push that loses
  the `updatedAt` comparison is dropped with a 200 and the client clears the batch.
  Every "Not sent. It will send when there is signal." in §1.9, §2.12 and §3.8 is only
  true once that is fixed. Until then the honest copy is the one written, and the fix is
  a stage-3 backend slice, not something to be discovered by a supervisor whose trip cash
  vanished.
- **`usage` is sent to owner *and* supervisor** (`03 §2.1`), so the who-opened-Money row
  on Me (#12) shows a supervisor the record of who looked at the money, including their
  own. Not my screen, but it is the control `DECISIONS.md §5` leans on, so it is named.

---

## 7. What a builder must not change, and what they may

### 7.1 Must not

1. **The one cost basis.** Six parts, the six source records in §1.1, one rupee one part.
   A seventh part, a different denominator or a second total is the defect this screen
   exists to end. If the six do not sum to the hero, the hero is not drawn.
2. **No defaulted denominator.** No `|| 1`, no `|| 0`. A missing km is `figure(null)` and
   the bus leaves the per-km ranking entirely (§1.4).
3. **Unknown, zero and stale are three different figures.** Pass the raw value and a
   `format` function to `figure()`; never format first.
4. **The trip bus select is never pre-selected**, and the first option is a disabled
   "Choose the bus" (§1.5).
5. **A control whose gate the viewer lacks is absent**, never disabled and never greyed.
6. **The conversation log never reaches its subject**, never appears on Me, and has no
   edit or delete control (§2.6).
7. **Identity documents are `manageDrivers`-or-self per record, on read and on write**,
   and a document URL never leaves the image element (§2.5).
8. **Salary is behind one named gate**, and that gate is `money` until Q4 says otherwise
   (§2.4).
9. **No journey field, and no passenger lookup, for `office`** — absent, and no label on
   the screen names a PNR, a seat, a fare or a board point (§3.2).
10. **Claude's pick is never pre-committed**, and a bulk confirm shows its rows before
    the button (§3.3).
11. **A `.num` never navigates.** The screen's one delegated handler returns early on
    `closest('input, select, textarea, label, .num')` **before** reading `[data-act]` or
    `[data-nav]`, and a row holding a field is `div.v2row`.
12. **No new field, no new store, no new token, no new icon, no new animation.** Every
    write above lands in a field v1 already reads; under whole-record last-write-wins a
    field v2 invents is erased the next time a v1 device writes that record.
13. **No `at` on a figure inside a list row.** The list states its freshness once, in its
    header.
14. **Status is never colour alone.** Every badge, figure note and toast carries a word
    and a mark as well.

### 7.2 May

1. **Choose the exact wording**, inside §5 and the foundation's §6.1, in both languages.
2. **Choose each list's order and the visible caps**, inside the foundation's §2 — the
   money pit's 8, the crew list's 200 and the review window are starting values, not
   measurements.
3. **Add one screen-level stylesheet per screen** for layout that belongs to it, in the
   shape of `login.css`, keeping the `[data-v2]` prefix and sizing from tokens.
4. **Nest a desk container inside a yard page**, which `tokens.css` supports explicitly —
   the per-bus table is the intended case.
5. **Drop the per-bus table's Misc column, then Labour**, if the office PC says the row is
   too wide at 864px. Never the km or cost-per-km column.
6. **Replace the six-row trend with something better** if a measurement says a reader
   cannot use it (§9.2). The constraint is the arithmetic, not the shape.
7. **Reject anything here that a measurement contradicts**, and say so in the stage-3
   report rather than working around it.

---

## 8. UX decisions I had to make, and what belongs back in stage 1

`v2-ux.md` left these open; a spec cannot. Each is written as a decision with its reason,
and each should be read back into the UX doc rather than discovered in the code.

1. **Supplier bills and challans are not in the running cost.** `v2-ux.md §4.1` #7 asks
   for "one total that reconciles to its parts" **and** "supplier dues" on the same
   screen, without saying whether dues are inside the total. They cannot be: a bill buys
   stock and the stock becomes cost when it is issued. They are a second question on the
   same screen, labelled as such (§1.1).
2. **The trend is six periods with figures, not a drawn chart.** The numbers on this
   screen are read against each other with `tabular-nums`; a chart cannot be read that
   way, a drawn chart at 360px loses most of its resolution, and a per-item drawing is the
   shape the performance work exists to avoid. v1 had a 7-day chart on the owner home, so
   this is a change and it is a judgement — §9.2 lists it as one of the three most likely
   to be wrong.
3. **There is nowhere to record that Claude was wrong about fault.** `rbreviewai` is
   server-written and v2 may not add a field or a store, so a disagreement is recorded as
   a note, an incident or a reassignment (§3.4). If the owner wants the disagreement
   itself on the record, that is a data addition and it belongs in `v2-ux.md §6` beside
   tonight's running list.
4. **Reviews cannot use the ranked reason row.** 4,000 rows forces windowing, windowing
   forces the one-line row, and the reason therefore lives in the opened review (§3.5).
   `v2-ux.md §4.1` #11 asks for "why a review could not be pinned on anybody" as a
   screen element; it is a filter plus a line in the detail, not a row.
5. **The crew score names its four parts and draws itself from three when one is
   missing.** `v2-ux.md` asks for "the blended score" and does not say what it blends.
   §2.3 fixes one definition, because five lists with three scores is what we are
   replacing.
6. **A new joiner with no documents does not reach Attention (#2).** It sits in People's
   own "Documents missing" filter until a document exists and is expiring. Otherwise
   Attention inherits [E] `5eb8c6e`'s 110-of-110 count that can never reach zero.
7. **Crew PINs are minted per bus, not for the roll.** `v2-ux.md §4.1` #8 says "crew
   logins and PINs" without a granularity; 165 at once is the 5–6 hours that friction #6
   counted, and per-bus is the unit the duty board already works in.

---

## 9. Status

**ok = true.** Three screens specified at both widths, every element against a named
token, every one of the ten states, and every hidden field marked for whether the server
actually withholds it.

### 9.1 Gates

```
python3 scripts/check-floor.py v2 ui     -> within the Chrome 109 floor
```

Nothing in this document can fail the CSS floor by construction: it specifies no colour
outside the ten tokens, no `oklch()`, no `color-mix()`, no nesting, no `@starting-style`,
no view transition, no `subgrid`, no `@scope`, no `light-dark()`, no `text-wrap: balance`,
no `Object.groupBy`, no `toSorted`, no `Promise.withResolvers`, no emoji, no icon font,
no `url()`, and no animated property other than `transform` and `opacity`.

### 9.2 The three specifications most likely to be wrong

1. **The trip-cash part of the running cost may double-count road-side diesel.** §1.1
   counts every `trips.expenses[].amount` as Trip cash, including a diesel purchase on the
   road, on the reasoning that the pump log (`fuel`) and the road (`trips`) are different
   money. If a supervisor also keys a road fill into `fuel` — and nothing in the data
   model stops him — that rupee is in the total twice, and the total will be quietly wrong
   rather than loudly broken, which is the worst failure this screen has. **The reading
   that settles it:** one query over `fuel` and `trips` for a month, looking for a `fuel`
   row within a day of a trip expense with `cat` of fuel on the same bus. Until it is
   taken, the screen should show Trip cash and Fuel as two rows and never merge them,
   which it does.
2. **The six-period trend instead of a chart** (§8.2). I decided it from reasoning —
   tabular numbers, 360px, no per-item drawing — and not from watching the owner read his
   current 7-day chart. He has had a chart since the beginning and may read it fluently.
   Measure 4 in `v2-ux.md §7` run per card would say, and the fallback is cheap: the
   arithmetic does not change, only the shape.
3. **The name queue's one-tap primary button may confirm wrong names faster than the
   current method does.** `conf: 'high'` puts Claude's pick in the button label, and the
   whole gain — 2–6 hours a week — comes from that being one tap instead of a search. If
   Claude's high-confidence precision is below about 95%, a one-tap accept spreads wrong
   crew attributions into the crew score, the reviews and the coaching notes, all of which
   read `rbalias`. **The reading that settles it:** take 100 existing high-confidence
   `rbaliasai` picks and have the crew manager check them by hand. `rbalias.history` keeps
   the last 20 changes per alias and is never deleted, so a wrong confirm is reversible —
   which is the only reason I specified it this way before the reading exists.

### 9.3 What this document needed and did not have

- **Q4** (is crew pay money or people). Built without it; §2.4 names the one row that
  moves on the answer.
- **Q7** (do we bill another transport company). Money has no per-company split today, so
  `viewCompanyBilling` guards nothing on this screen yet. A yes adds a card and a gate.
- **Q11** (who may see crew emergency and reference numbers). The screen hides them from
  everyone outside `manageDrivers`-or-self, which is the safe reading of an unanswered
  question. §7.3 is the server half.
- **Q12** (who reads Hindi only). Does not block; the build-error rule does not depend on
  the answer.
- **The office PC reading** (`DECISIONS.md §9`). The 200-row / 250 ms budget every density
  rule here is sized against is a placeholder set on a developer's Mac. The per-bus table
  at 864px and the 200-row crew list are the two places this document would change first
  if that reading comes back slow, and §7.2 item 5 says what gives.

**Written to:** `docs/v2/plan/screens-money-people.md`
**Specifies:** `v2-ux.md` screens **#7 Money, #8 People, #11 Reviews**.
**Blocking for stage 3, not for stage 2:** the eight backend requirements in §6. Seven of
the eight are "a field the screen hides that the server still sends", and until they land,
these three screens are a curtain and not a boundary.

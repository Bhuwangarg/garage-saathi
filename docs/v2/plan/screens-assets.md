# Garage Saathi v2 — screens 5, 6 and 10: the asset and parts flow

Stage 2b of the pipeline (`docs/v2/PIPELINE.md`). Three of the twelve screens in
`docs/v2/plan/v2-ux.md §4`: **Buses (#5)**, **Store (#6)** and **Fuel & tyres (#10)**.

Read in full before writing a line of it: `docs/v2/plan/v2-ux.md` (1051 lines, §4 the
twelve screens, §5 what folds into which, §6 the edge cases), `docs/v2/plan/v2-foundation-ui.md`
(1223 lines — consumed, not changed), `docs/v2/DECISIONS.md`,
`docs/v2/inventory/03-data-and-sync.md` (record shapes, conflict rules, measured budgets),
`docs/v2/inventory/02-roles-and-permissions.md §2, §4.3, §4.4, §6`,
`docs/v2/inventory/01-screens-and-nav.md §5.2` (the five cost bases),
`ui/tokens.css`, `ui/components.css`, `ui/states.js`, `ui/icons.js`, and the bundled seed
`seed-data.js`, read with a script rather than skimmed — §0.4 is what that read found and it
changed three of the states below.

**Gate:** `python3 scripts/check-floor.py v2 ui` — green, 10 files, within the Chrome 109
floor. This document specifies; it writes no CSS, no JS and no HTML, and touches no file in
`ui/`.

---

## 0. Scope, and what shaped all three

### 0.1 What these three screens are

| # | Screen | The one question | Roles | Density default |
|---|---|---|---|---|
| 5 | **Buses** | "What does this bus need, and what has it cost?" | owner, supervisor | desk, with yard at phone width |
| 6 | **Store** | "Hand out a part against a card without the count drifting, and record what arrived." | store, supervisor, owner; mechanic read-only | **both, by view** — see §0.5 |
| 10 | **Fuel & tyres** | "Record what went into or onto a bus away from the workshop." | crewmanager, store, owner, supervisor | yard — the crew manager is standing at the pump |

They are the asset half of the product: the thing, the part that goes into it, and the
liquid and rubber that get consumed by it. Between them they absorb fourteen of v1's
53 routes (`v2-ux.md §5.1`): `fleet` + the orphaned `buses` list, `linkgps`, `challans`,
`buschallans`, `bills`, `purchases`, `vendors`, `components`, `storehealth`, `warranty`,
`fuel`, `def`, and the `busreport`/`busacct` per-bus cost lenses, which do **not** land here
(§1.2).

### 0.2 Nothing new is needed to build them

| | Count | Detail |
|---|---|---|
| New colour tokens | **0** | `v2-foundation-ui.md §1.3` rejected the only candidate and I found no consumer for it either: no list row on these three screens is multi-selected, and every filter is a mutually exclusive view |
| New space / type / density tokens | **0** | Everything below sizes from `--s1`..`--s8`, `--pad`, `--tap`, `--row-h`, `--t1`..`--t6`, `--thumb`, `--nav-h`, `--rail-w` |
| New icons | **0** | The 34-mark set covers all three. `v2-foundation-ui.md §4.4` says the cap is reached and stages 3–5 have no headroom; I did not spend a 35th. Every mark I use is in §6.3's table with a consumer the foundation already named, with one addition noted there (`back` gains a consumer on #5) |
| New primitives | **0** | `.v2row`, `.v2row-why`, `.num`, `.photos`, `.tabs`, `.field`, `.select`, `.btn`, `.badge`, `.card`, `.table`, `.stat`, `V2.openSheet/confirmDialog/toast`, `emptyState/errorState/offlineState/skeleton/figure`, `nav()` |
| New screen stylesheets | **3** | One per screen, `[data-v2]`-scoped, layout only, sizing from tokens — permitted by `v2-foundation-ui.md §7.2` item 2 |
| New fields on any record | **0** | Required by `DECISIONS.md §2` and `v2-foundation-ui.md §7.1` item 13. Every write below lands in a field confirmed at a write site in `03 §3` |
| New stores | **0** | The one new store the plan needs is the Duty board's nightly list (`v2-ux.md §6`), not mine |

### 0.3 The four hard rules I was given, and where each is discharged

| Rule | Where |
|---|---|
| **One cost basis per bus, not five** | §1.2 — and the basis is *read from Money (#7), never recomputed here*, which is the only arrangement under which two screens cannot disagree |
| **No crew phone number for a role outside `PII_ROLES`** | §1.9 — and the client tests `_redacted`, not "is the field empty", because redacted and not-recorded must not look alike |
| **A count field must never navigate away when tapped** | §2.6 — the regression `predeploy-gate.sh:508-511` has a permanent check for, plus the invariant sweep at line 1073 |
| **No stepper buttons on a number entry** | §2.6, §3.5 — every number on these three screens is a reading or a count. Steppers are also why the icon cap was not spent on a minus mark (`v2-foundation-ui.md §4.4`) |

### 0.4 What the bundled seed actually contains, and the three states it changed

Read with a script, not skimmed (`seed-data.js`, version `2026-07-08-pin0000`, 2,755 rows,
applied on every new device with `updatedAt: 1`):

| Fact | Count | What it does to these screens |
|---|---|---|
| Buses with any document | **0 of 89** | A "papers" card driven by expiry alone draws nothing for every bus on a fresh device. §1.7 draws **five fixed rows per bus** instead, so a missing paper is visible as missing |
| Buses with `lastServiceOdo` / `lastServiceDate` | **0 of 89** — the keys are absent, not zero | Service due has no km basis and no date basis. §1.3 |
| Buses with `odometer > 0` | **0 of 89** | Every per-km and every service-due figure is unknown. §1.3 |
| Buses with a `company` or `model` | **0 of 89** (both empty strings) | A register row's second line cannot be "Volvo B9R". §1.6 |
| Parts in the catalogue | **2,384** | Over the 200-row windowing threshold. §0.5 |
| Parts with `reorderLevel > 0` | **0 of 2,384** | "What is low" defined as `qty <= reorderLevel` matches **all 2,384**, which is a count that cannot reach zero — the exact failure `v2-ux.md §4.1` forbids, with `5eb8c6e` ("110 of 110 missing documents") and `ba274f6` ("67 buses need a driver") as its two recorded instances. §2.4 redefines low |
| Parts with `qty > 0` | **0 of 2,384** | Zero stock and uncounted stock are indistinguishable from the number. §2.4 keeps them apart |
| Parts with `unitCost > 0` or `warrantyMonths` | **0 of 2,384** | No value and no warranty state for anything until a bill is received |
| Parts with `serialTracked` | **28** | These are the catalogue's link to the per-piece register (`components.partId` / `partExtId`). §2.8 |
| Parts with `reusable` | **6** | The `partsUsed[].reused` flag has six legitimate subjects |
| Part names as stored | `FULE FILTER`, `MAKHI WASER FRONT 2518 B BANZ`, `WHEEL CHUCKNUT B BANZ`, `Hydrolic Oils`, `GULF SUPERFLEET TURBO+15W-40` | Mixed case, imported misspellings, 59% with a blank `partNo`. §2.5: the name is rendered **exactly as stored**, never title-cased, and search is case-insensitive substring with no correction — "FULE FILTER" is how the storekeeper will type it |
| Vendors | **11**, real: `Volvo`, `PREM AUTO ELECTRIC WORKS`, `MIDAS TYRE`, `GULF OIL LUBRICANTS INDIA LTD`, `PURAN AUTO SEALS` | §2.9 content is these, not placeholders |

**Why this matters more than it looks.** Seed rows are overwritten by any server row
(`03 §9` trap 9), and production holds 81,680 records, so a synced device shows real numbers.
But a first sync is 50–90 s on a Mac and "several times that" on Windows 7 (`03 §8`), and the
screen is drawn from the first paint. **For minutes, on the slowest machines, this is what a
storekeeper sees.** A screen that reads unknown as zero is wrong for exactly as long as that
lasts, which is the window in which a new user decides whether the app is honest.

### 0.5 Density per screen, and which of my decisions ride on the placeholder budget

`DECISIONS.md §9`: the "200 dense desk rows inside 250 ms" budget is a placeholder taken from
a developer's Mac, not a measurement. `v2-foundation-ui.md §2.2` says the same and §8.2 item 1
calls it the highest-value measurement in the foundation. Stated per decision, because a
builder needs to know which lines move when the office PC is finally read:

| Decision | Depends on the placeholder? |
|---|---|
| Buses register is a one-line `.v2row` list at desk, **not windowed** | **No.** 89 buses is under 200 by a factor of two. This stands whatever the reading says |
| Buses detail is a two-column card grid at desk | **No.** Eleven cards, not a list |
| Store catalogue at desk is a **windowed** one-line `.v2row` list | **Yes, twice.** The 200-row windowing threshold is the placeholder's (`v2-foundation-ui.md §2.3` rule 6), and 2,384 rows is twelve times it. If the office PC comes back at 700 ms the window shrinks; if it comes back fast, windowing could be dropped for a simpler list. **This is stage 3's to settle with a real reading** |
| Store desk catalogue row carries four things — mark, name, `figure`, badge, `.btn` | **Yes.** `v2-foundation-ui.md §8.2` item 1 says the badge goes first and then the figure if the reading is bad. §2.5 names the order things are dropped in |
| Store counts view is one `.num` per part, **scoped to one category per session** | Partly — but the binding reason is a data-shape constraint, not performance (§2.6, and §8 item 3) |
| Fuel & tyres fills list is capped at **200** with a stated remainder | **Yes.** Same number, same source. `fuel` row count in production is UNDETERMINED (`03 §8`), so the cap is doing real work and its size is a guess |
| Fuel & tyres is yard density throughout | **No.** The person is standing at a pump |

---

## 1. Screen 5 — Buses

### 1.1 Declaration, and who sees what inside it

Per `v2-ux.md §4.3`: the screen declares `fleet`; `addBus` to add; `logService` to log a
service; `challans` for the liability card. All four are **owner and supervisor only**
(`02 §2`, `02 §4.3`), so on today's role table nobody reaches Buses with a partial hand. The
per-action declarations are still written per action, because the whole point of
deny-by-default is that a role added later inherits nothing.

| Element | Declares | For a role without it |
|---|---|---|
| The screen, the register, the bus detail | `fleet` | **The tab is absent and the screen is not drawn.** Not a tab that errors |
| "Add bus" | `addBus` | The control is **absent** |
| "Log service" | `logService` | Absent |
| The challan card and "Check challans" | `challans` | The whole card is absent — not an empty card |
| "Make a job" on a driver report | `addJob` | The row stays and shows the report; the button is absent |
| "Link GPS" | `addBus` (`ROUTE_PERM.linkgps`, `02 §4.3`) | Absent |
| A crew phone number | membership of `PII_ROLES` **and** a non-`_redacted` record | §1.9 |

The rows in §1.7's card 2 ("What this bus needs") are **the same row kinds as Attention (#2),
each declaring its own capability**, rendered for one bus. A person who cannot see unpaid
challans on Attention does not see the challan row here. This is `v2-ux.md §4.3`'s trap
applied one screen over: if the bus detail showed every row kind behind one capability, we
would have rebuilt `dashboard` inside a bus.

### 1.2 ONE cost basis per bus — the decision, in full

v1 has **five** per-bus cost lenses with five different bases (`01 §5.2`): `busreport`
(maintenance only), `busacct` (maintenance + fuel + trip cash), the bus detail's "Lifetime
repair cost", `money`'s money-pit list (per-km), and `history` (spend on completed work). They
disagree, so people stopped reading them. `v2-ux.md §4.1` #5 makes five bases a "must not".

**The basis: "Running cost, last 30 days" — the same definition, the same window and the same
computation as Money (#7), scoped to one bus, read from Money and never recomputed on Buses.**

```
Running cost, last 30 days (one bus)
  = diesel + AdBlue            (fuel.cost + def.cost)
  + parts issued               (ledger 'out' rows for this bus's cards x unitCost)
  + labour                     (jobcards.labourHours x meta.garage.labourRate)
  + outside vendor             (jobcards.externalCost)
  + trip cash                  (trips: allowance given - expenses returned)
  over the 30 days ending at the stated reading time
```

Five named parts, always drawn beneath the total, always visibly summing to it.

**Why this one.**

1. **It is Money's.** `v2-ux.md §4.1` #7 requires Money to hold "one total that reconciles to
   its parts (fuel and AdBlue, parts, labour, outside, misc)" and "running cost per bus
   including trip cash". If Buses computed anything of its own it would be a sixth basis by
   construction. The only arrangement in which two screens cannot disagree is that **one of
   them computes**. Buses is not that one.
2. **Rupees, not per-km.** Buses shows **no per-km figure at all.** Per-km is where the
   ₹45,000/km bug lived (`8db78e7`), it needs a divisor this screen cannot trust (§1.3), and
   it already has two homes: "Running cost per km" on Money (#7) and "Diesel cost per km" on
   Fuel & tyres (#10). A third would be the five lenses coming back.
3. **A window, not a lifetime.** "Lifetime repair cost" grows forever and makes a new bus look
   cheap and an old bus look like a problem; it answers no question anybody asked. 30 days
   matches the owner's own 30-day number on Today (#1) and `000c3dd`.
4. **Trip cash is inside it.** `v2-ux.md §4.1` #7 puts trip cash in the per-bus running cost
   and `DECISIONS.md §11` gives it an input. Leaving it out would make the bus's cost
   *quietly different* from Money's, which is the failure in a politer form.

**The rules that keep it one basis**, each falsifiable:

- The total is **never drawn alone.** The five parts are in the same card and the reader can
  add them up. A total without its parts is a number you have to trust.
- **Unknown is never folded into the sum.** A bus with no trips entered reads "Trip cash: no
  trips recorded" and the total carries `badge badge-warn` + `icon('clock')` + the words
  **"Part of this is missing"** — never a smaller number presented as complete.
  `v2-ux.md §4.1` #7: "unknown" and "zero" must never look alike.
- **`figure(value, {at})`** on the total, always, so it says when it was last true
  (`spec §4.7`). During a partial sync it also carries `stale: true`, because `tableMax >
  lastRev` means the figure is a total-so-far (`03 §9` trap 21).
- **The words "cost per km" do not appear on this screen.** A grep for them in the Buses
  screen layer is a one-line check that this rule is still holding.

### 1.3 The odometer rule — this screen needs it twice

`buses.odometer` is `0` for all 89 seeded buses and `0` is also the real value when the
instrument is broken (`03 §3.2`; `odoBroken`, `odoBrokenAt` exist). So on this screen two
figures divide by it and both must refuse to.

**Service due.** Five states, never a sixth:

| State | What it shows |
|---|---|
| Odometer and `lastServiceOdo` both known | `figure(remaining, {unit: 'km'})` — "4,120 km to the next service". `--warn` + `icon('clock')` under 1,000 km; `--bad` + `icon('warn')` when negative, worded "Overdue by 310 km" |
| Odometer known, `lastServiceOdo` absent | Dash. "No service recorded. Log one to start the count." |
| Odometer 0 or absent, `lastServiceDate` known | **Falls back to the date, never to km**: "Last serviced 3 Jan 2026, 10 months ago." No km figure at all |
| Odometer 0 or absent, no `lastServiceDate` | Dash. "No odometer reading and no service recorded." One next step: "Add a reading" |
| `odoBroken` true | Dash. "Odometer broken since 12 Oct." **No request for a reading** — the fix is a workshop job, not a data-entry job, and asking is how a wrong number gets typed |

If this rule were skipped, every bus on a fresh device would read "Overdue by 48,210 km" —
89 rows of red that cannot reach zero, which is `5eb8c6e` rebuilt.

**Running cost.** The total is in rupees and does not divide (§1.2), so the odometer cannot
break it. The odometer appears on this screen as a **reading with its age**, nothing more:
`figure(odometer, {unit: 'km', at: odometerAt})`, which also covers the case `03 §2` names —
the server writes `odometer` and `odometerAt` from the WhatsApp capture, so the age is often
the only thing that says whether the number is this week's.

### 1.4 Structure at phone width (yard density, 360px)

Two states of one screen, not two routes. `icon('back')` returns from the bus to the register.

**State A — the register.**

```
[ header, not sticky                                                  ]
  Buses                                                        --t2 600
  89 buses                                                     --t6 --ink-dim
  [ .field  icon('search')  "Search a bus" ]  [ .btn icon('add') Add bus ]
[ list: a.v2row per bus, 89 rows, no window                           ]
  icon('bus')  RJ09PA6126                                 [ badge ]
               Insurance expired · 2 open jobs
  icon('bus')  RJ09PA6137
               No papers recorded
  ...
[ --nav-h + safe-area bottom padding                                   ]
```

- Sorted by `regNo`, ascending, because the person is looking for a plate they already know.
  A sort sheet (`V2.openSheet`, `icon('filter')`) offers registration / running cost high
  first / service due soonest. It is a sheet and not a `.tabs` strip because it has one axis
  and three values and `.tabs` is for views, not ordering (`v2-foundation-ui.md §3.6`).
- **No filter tabs.** Every candidate is another screen's question: standing buses are Jobs
  (#3), expiring papers and unpaid challans are Attention (#2), unstaffed buses are Duty board
  (#9). Adding them here is how a register becomes a sixth lens. Search is the filter.
- `.sub` is the **one most urgent thing** about the bus, in a fixed precedence — expired paper,
  then expiring within 30 days, then overdue service, then unpaid challan, then open unsafe
  driver report, then open job count, then "Nothing open" — and when nothing at all is
  recorded, "No papers recorded" (which is the truth on a fresh device), never a blank line.
  `company`/`model` are empty for all 89 seeded buses (§0.4), so they are **not** the second
  line; they are inside the detail.
- `.act` at yard holds **at most one** control (`v2-foundation-ui.md §2.1`): a `badge badge-bad`
  / `badge-warn` carrying a word, or nothing.

**State B — one bus.** Eleven cards, in this order, and the order is the argument: what it
needs, then what it is, then what it cost, then what is fitted to it, then who is on it, then
what has happened to it.

| # | Card | Holds |
|---|---|---|
| 1 | **The bus** | `regNo` at `--t2`; `icon('back')` `.btn-quiet` "Buses"; odometer `figure(v, {unit:'km', at: odometerAt})`; company / model / chassis / engine as `.t`/`.sub` rows, each "Not recorded" when the stored string is empty |
| 2 | **What this bus needs** | Up to five `div.v2row.v2row-why` rows, same marks and same per-row capability rule as Attention (#2). Empty: `emptyState('Nothing needs this bus', {icon:'ok', hint:'Papers, service and challans all checked.'})` |
| 3 | **Papers** | **Five fixed rows**, always drawn: Insurance, Fitness, PUC, Permit, Road tax (`03 §3.2` `docs[].type`). Each: `icon('doc')`, the number or "Number not recorded", and the expiry state |
| 4 | **Service** | Interval, last service, the due figure per §1.3, `.btn` "Log service" |
| 5 | **Running cost** | §1.2: one total, five parts, the window, the age |
| 6 | **Challans** | `icon('challan')`, pending count, pending payable, when the snapshot was taken, credits left, `.btn` "Check challans (uses 1 credit)" |
| 7 | **Tyres and batteries fitted** | `components` where `busId` is this bus and `state` is `in-service`, grouped by `position` |
| 8 | **Crew** | **Three fixed seats**: Driver 1, Driver 2, Conductor. Name or "Empty", since when, phone per §1.9 |
| 9 | **Last seen** | The most recent position this device holds, with its age. Never the word "live" — §8 item 1 |
| 10 | **Driver reports** | Open `driverreports` for this bus as `div.v2row.v2row-why`; `.btn` "Make a job" per row |
| 11 | **Repair history** | `jobcards` for this bus, newest first, capped at 50 with a remainder line |

### 1.5 Structure at desk (1024x768, Windows 7, `--rail-w` left rail, 864px of content)

- **Register**: the same one-line `a.v2row` list at `data-density="desk"` — `--row-h` 32px,
  `--pad` `--s2`, `.t` only, lead mark at 16px, and `.act` carrying up to three controls:
  `figure(odometer, {unit:'km'})` (no `at` — `v2-foundation-ui.md §2.3` rule 4 forbids a
  figure note inside a desk row; the **list header** states the age once), a `badge`, and
  nothing else. 89 rows, no windowing (§0.5).
- The desk row's `.t` is `regNo` alone. The one-urgent-thing line is a yard affordance; at desk
  it becomes the badge's word.
- **One bus** at desk: the eleven cards in a two-column grid —
  `display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--s4)` — columns
  fractional and the gap a token, so no px literal and no new token. Cards 1, 2 and 5 take the
  full width (`grid-column: 1 / -1`): the first because it is the heading, the second because a
  wrapped reason row must not be squeezed to half of 864px, the fifth because the five parts
  read as a column of figures.
- **No two-pane register-plus-detail.** It would need a column width that is neither a token
  nor a fraction, and the register's job is to get you to one bus, not to compare two.

### 1.6 Every element, with its token

| Element | Tokens |
|---|---|
| Page background | `--surface` |
| Card, sheet panel, field, row hover fill | `--surface-raised`, radius 12px (panels) / 8px (controls) — the three existing literals, legal per `v2-foundation-ui.md §1.4` |
| Row hairline, card and field border, tab strip, rail edge | `--line`, as `box-shadow: inset 0 -1px 0 var(--line)` on the row so it takes no height (`§2.3` rule 3) |
| Screen title | `--t2`, weight 600, `--ink` |
| `regNo` in the bus card | `--t2`, `--ink`, tabular-nums (inherited from `[data-v2]`) |
| Row title `.t` | `--t5`, weight 600, `--ink` |
| Row sub-line `.sub` | `--t6`, `--ink-dim` |
| Card heading | `--t4`, weight 600, `--ink` |
| Label, table head, figure note | `--t6`, `--ink-dim` |
| Figure value | `.figure`, `--ink`; unknown `.figure-none` is the em dash; stale note `.figure-note-stale` in `--warn` |
| Row height / tap target / side padding | `--row-h`, `--tap`, `--pad` |
| Gaps: inside a row, between rows, between cards, card padding | `--s2`, 0 (the hairline separates), `--s4`, `--pad` |
| Lead mark | `icon(name, {size: 20})` at yard, `{size: 16}` at desk, `--ink-dim`, or `--bad`/`--warn`/`--ok` on a `.v2row-why` row |
| Status | `badge badge-ok` / `badge-warn` / `badge-bad`, each carrying a **word and a mark**; `--ok` / `--warn` / `--bad`, never colour alone (`v2-foundation-ui.md §7.1` item 9) |
| The one action in a card | `.btn` ; `.btn-primary` only for "Log service" and "Make a job", which are the two writes |
| Destructive | `.btn-danger` — **not used on this screen.** There is no delete here; a mistaken card is deleted on the Job card (#4), owner only |
| Photo tile | `--thumb` square, `object-fit: cover`, radius 8px, 1px `--line`, `gap: --s2` |
| Scroll padding | `calc(var(--nav-h) + env(safe-area-inset-bottom))` with the bottom bar; `calc(var(--pad) + env(safe-area-inset-bottom))` with the rail |
| Devanagari | `--font-hi` via `:lang(hi)`, `--lh` 1.7 — the tightest fit in the system is the yard two-line row at 52.7px inside 56px (`v2-foundation-ui.md §2.1`), so nothing here raises `--t5` or `--t6` |

### 1.7 Every state

**The register.**

| State | Specification |
|---|---|
| loading | `skeleton(8)` at yard, `skeleton(20)` at desk — fixed constants, inside `states.js`'s 1..50, chosen without measuring anything (`§2.3` rule 2). The header and the search field draw first and never wait for a store |
| empty | `emptyState('No buses yet', {icon: 'bus', hint: 'Add the first bus to start.'})` + the "Add bus" control. Only when the read returned and there are none — not while a first sync is running |
| one item | The one row, and the count line reads "1 bus", singular. The sort sheet control is **absent**: there is nothing to order |
| far too many | Cannot occur. 89 buses, and `02`/`03` record no path by which a garage reaches 200. If one ever does, §0.5 says windowing is the answer and the row is already the one-line shape it needs |
| error | `errorState('Could not read the bus list', retry)` |
| offline | A list that has rows **keeps them** and the header reads "No connection. Last updated 06:40." Only an empty-and-offline list gets `offlineState()` |
| half-finished | A bus created with a registration and nothing else is a real row, not a draft — "Add bus" writes the record on the first screen, exactly as the Job card does (`v2-ux.md §3.1` step 4, `4f0691e`). Its `.sub` reads "No papers recorded" and card 2 carries one row: "Finish this bus — add its papers" |
| no permission | The screen is not drawn and the tab is absent for the six roles without `fleet` |

**One bus — per card.**

| Card | loading | empty / unknown | error | offline | half-finished |
|---|---|---|---|---|---|
| 1 The bus | `skeleton(3)` | Each blank string reads "Not recorded"; odometer 0/absent is the dash and "No odometer reading" | `errorState` for the whole card | No change — local read | — |
| 2 What it needs | `skeleton(3)` | `emptyState('Nothing needs this bus', {icon:'ok', hint:'Papers, service and challans all checked.'})` | `errorState`; a row that cannot be ranked is **listed at the end under "Could not check"**, never ranked at zero and never at the top (`v2-foundation-ui.md §3.4`) | Rows stay, header carries the age | — |
| 3 Papers | `skeleton(5)` | **Never empty** — five fixed rows. All five "Not recorded" on a fresh device, with one line above: "No papers recorded for this bus." | `errorState` | No change | A paper with a number and no expiry: "Expiry not recorded", `--warn`, not treated as valid |
| 4 Service | `skeleton(2)` | §1.3's five states | `errorState` | No change | A service log interrupted before its photo: the card stays `open` and card 2 shows "Finish the service card" (§1.8) |
| 5 Running cost | `skeleton(6)` — the total and its five parts, so the card does not jump | Any part unknown: that part reads its own words ("No trips recorded", "No fills recorded") and the total carries "Part of this is missing". **All** parts unknown: the total is the dash, not ₹0 | `errorState` | Figures stay with their age; during a partial sync also `stale: true` | — |
| 6 Challans | `skeleton(2)` | Three different things: "No pending challans, checked 2 hours ago" (a real zero) / "Never checked" (the dash) / `providerUnavailable`: "Could not reach the challan service. Last checked 3 days ago." | `errorState` | **The button says so before it is pressed**: "Needs signal. Check when you are online." (`v2-foundation-ui.md §3.2` offline rule) | — |
| 7 Fitted | `skeleton(4)` | `emptyState('No tyres or batteries recorded on this bus', {icon:'tyre'})` | `errorState` | No change | A piece fitted with no `position`: "Position not recorded", `--warn` |
| 8 Crew | `skeleton(3)` | **Never empty** — three fixed seats, each "Empty" or a name | `errorState` | No change | A seat filled with no `dutylog` row: the name shows, "Since when: not recorded" |
| 9 Last seen | `skeleton(1)` | "No position recorded for this bus" — and when the registration matches nothing, the `linkgps` row (§1.8) | `errorState` | "Last seen 3 hours ago" is honest offline; nothing here claims to be current | — |
| 10 Driver reports | `skeleton(2)` | `emptyState('No open reports for this bus', {icon:'ok'})` | `errorState` | Rows stay with the age | A report with a job already drafted by `reportai` but no card: the row says "A job was drafted for this. Open it." |
| 11 Repair history | `skeleton(6)` | `emptyState('No work recorded on this bus', {icon:'job'})` | `errorState` | Rows stay | A card at `done` reads `badge badge-warn` **"Waiting for sign-off"**, never "Verified" (`v2-foundation-ui.md §3.8`) |

### 1.8 The writes, and their order

Three write paths. Each lands only in fields confirmed at a write site in `03 §3`.

**(a) Add bus** — `addBus`, writes `buses`.
Sheet: registration (required), company, model, chassis, engine, `serviceIntervalKm`
(`.num` whole, blank, hint "Usually 10,000 km"). The record is written on the first save, so an
interruption leaves a real bus. Duplicate registration: the sheet checks the **normalised**
plate against existing rows *including tombstones* (`DB._rawAll`, `03 §9` trap 10 — otherwise a
deleted bus is silently re-created) and says "RJ09PA6126 is already on the register" with a link
to it, rather than making a second row. Seeded and imported ids are stable by design
(`bus-<NORMREG>`, trap 25), so a new bus gets `uid('b-')` and never a constructed id.

**(b) Log service** — `logService`, writes `jobcards` then `buses`.

This is the one place my spec deliberately differs from v1's behaviour, and the reason is a
server guard, not taste.

v1's `confirmLogService` writes a card **directly at `status: 'verified'`** with
`closedAt`/`verifiedBy`/`verifiedAt` set and no photos (`03 §3.1`). Two things are wrong with
copying that into v2:

1. `_guard_write` (`02 §4.4`) requires **before+after photos or a vendor bill** to reach `done`
   or `verified`, and requires that **the closer cannot be the verifier unless the verifier is a
   supervisor**. `closedBy`/`verifiedBy` come from the token. So a photoless create-at-verified
   is at best guard-dependent, and **for the owner it fails the closer-is-verifier clause
   outright** — the exemption names supervisors, not owners. A refused push is quiet: it drops
   "Waiting to send" to zero while the server never has the record (`03 §9` trap 15).
2. `DECISIONS.md §10` removes self-sign-off for **every role including the owner**. A screen
   that self-verifies an oil change contradicts the control the owner just chose.

**So v2's service log stops at `done` and collects the second signature like every other closed
card.** The sheet asks: date, odometer (`.num` whole, blank, forward-only), what was done,
labour hours, parts used, and **one photo or the vendor bill, stated as required and why** —
"A photo or the bill is needed. A closed card is not accepted without one." Writes, in order:

1. `jobcards` — `uid('j-')`, `busId`, `problem` (the service text), `status: 'done'`,
   `closedAt`, `jobDate`, `labourHours`, `assignedTo` = the logger, and the photo in
   `afterPhotos` or `externalVendor`/`externalCost` for a bill.
2. `buses` — `lastServiceOdo`, `lastServiceDate`, and `odometer`/`odometerAt` **only when the
   entered reading is higher than the stored one**. Read the bus row from IndexedDB immediately
   before the put, never from `S.cache`: the whole row goes to the server under last-write-wins
   and `S.cache` can be seconds stale (`03 §5.5`, `§7`).

The card then appears in the repair history labelled **"Service"** and badged "Waiting for
sign-off", and on somebody else's Attention (#2). Named for the report, because stage 1 did not
anticipate it: this changes what v1's button did, and §7 measure 12 (`closedBy == verifiedBy`)
stops being polluted by every oil change as a result.

**(c) Make a job from a driver report** — `addJob`, writes `jobcards`, `driverreports`, and
`buses` only if asked.

Pre-filled from `reportai` when the server has drafted one (`03 §3.9`: `title`, `trade`,
`priority`, `unsafe`, `cause`, `checks`, `parts`) and fully usable when it has not — the draft
arrives within ten minutes and the supervisor is standing there now. Writes:

1. `jobcards` — `reportIds: [the report]`, `problem` from the draft's `title` (editable),
   `priority` from the draft, `status: 'open'`.
2. `driverreports` — `status: 'addressed'`, `jobId`, `resolvedAt`.
3. `buses` — **only if the person entered an odometer reading, and only forward.** A whole
   `buses` row written to record nothing is a chance to clobber a concurrent WhatsApp odometer
   capture for no gain (`03 §2`, `§5.5`). This is the rule: *never write a record to say
   nothing changed.*

**(d) Check challans** — `challans` capability; writes **nothing**. `challans` is in
`SERVER_INGEST_ONLY` (`02 §4.4`): denied to every role including the owner. The button calls
the `/challans` proxy, the snapshot arrives by pull, keyed on `rc`. Two traps to honour:
each lookup spends a billable credit, so the price is **on the button** — "Check challans
(uses 1 credit)" (`v2-foundation-ui.md §6.1`, `05 §4` row 36); and snapshots written before the
padding fix sit under an older key spelling which the app reconciles (`03 §3.9`), so the card
must read through that reconciliation or it shows "Never checked" for a bus that has a snapshot.

**(e) Link GPS** — `addBus`; writes `buses`. Drawn as a row in card 2 only when this bus's
normalised registration matches no position record. One field: the registration as the tracker
reports it. This is the dead-end fix from `01 §1.3` item 2, where the route was reachable from a
single conditional branch.

### 1.9 Crew, and the phone-number rule

`buses.crewPhone` is stripped for non-`PII_ROLES` and `drivers.phone`/`altPhone` are stripped
with `_redacted: true` added (`03 §2.1`). `PII_ROLES` is owner, supervisor, crewmanager; Buses
is owner and supervisor; so on today's table the rule is satisfied by construction. It is still
specified, for three reasons that are not satisfied by construction:

1. **`_DRIVER_PRIVATE` does not list `emgName`, `emgPhone`, `emgRelation`, `refName`,
   `refPhone` or `photo`** (`03 §2.1`, `§9` trap 26, LIVE-ISSUES 2, owner question Q11). Those
   reach **every** role today. **Buses renders none of them, for any role.** An emergency
   contact is People's (#8) and behind `manageDrivers`, and Q11 is the owner's.
2. **Redacted and not-recorded must not look alike.** The client tests `row._redacted`, not
   "is the field empty":
   - `_redacted: true` -> **no phone slot is drawn at all.** Not an empty one, not "Hidden"
   - not redacted, phone present -> the number as a `tel:` link, `--accent-text`
   - not redacted, phone empty -> "No phone recorded"
   An empty slot invites somebody to type a number into a redacted copy, and a redacted copy
   must never be pushed back (`03 §9` trap 8).
3. **The role is not the whole test.** A supervisor's own device can hold a redacted copy of a
   crew row pulled before a scope change; `SCOPE_V` and the cursor rewind exist for exactly
   that (`03 §9` trap 3). The per-record flag is the test that survives it.

Card 8 holds **three fixed seats** — Driver 1, Driver 2, Conductor — because a bus that has
lost a seat must show the hole. Each: name (or "Empty"), "Since 2 Nov" from the newest
`dutylog` row for that seat, and the phone per the rule above. **Filling a seat is not done
here** — it is Duty board's (#9), and the seat-clearing bug (`05 §4` row 26) is one write path
too many already (`01 §5.2` records three). Card 8 links to Duty board for a holder of
`assignDriver`, and for a holder without it the row simply does not link.

### 1.10 Interactions

| Control | What it does | Pressed | Focus | Disabled | While it works |
|---|---|---|---|---|---|
| A register row (`a.v2row`) | Opens the bus | `transform: scale(0.97)`, 120 ms `ease-out` | `outline: 2px solid var(--accent); outline-offset: -2px` — inside the edge, a list clips an outer ring | Never. A bus a person may not open is absent | Nothing. The detail is a local read and draws under 250 ms |
| Search `.field` | Filters as you type, locally. **Never navigates, never writes** | None — a field is focused, not pressed | `outline-offset: 2px` | Never | Nothing |
| Sort (`.btn` `icon('filter')`) | Opens a sheet | scale(0.97), 120 ms | ring at offset 2px | Absent when there is one bus | Sheet opens immediately with `skeleton()` inside if it needs a read |
| "Add bus" (`.btn`) | Opens the sheet | scale(0.97) | ring | Absent without `addBus` | Save button `aria-disabled="true"`, reads **"Saving..."** |
| `icon('back')` (`.btn-quiet`) | Returns to the register, keeping the search text and the scroll position | scale(0.97) | ring | Never | — |
| "Log service" (`.btn-primary`) | Opens the sheet | scale(0.97) | ring | **Absent** without `logService`. Inside the sheet, Save is `aria-disabled="true"` until the photo or the bill is there, with the reason in words beside it, never a silent dead button | "Saving..." |
| "Check challans (uses 1 credit)" (`.btn`) | `V2.confirmDialog` first — it spends money. Focus starts on **Cancel** | scale(0.97) | ring | Absent without `challans`. Offline: still drawn, says "Needs signal", `aria-disabled="true"` | "Checking..." and the card keeps its old snapshot with its age. Never blanks to a spinner |
| "Make a job" (`.btn-primary`) | Opens the sheet pre-filled | scale(0.97) | ring | Absent without `addJob` | "Saving..." |
| "Link GPS" (`.btn`) | Opens the sheet | scale(0.97) | ring | Absent without `addBus` | "Saving..." |
| A photo tile | `V2.openPhoto` — full size inside a sheet, not a new overlay kind | scale(0.97) | ring at offset 2px | A closed card's capture cell is **absent**, with "Photos are fixed once the card is closed" | A tile being sent carries the word "Sending" and no spinner |
| A `tel:` link | Dials | scale(0.97) | ring | Absent per §1.9 | — |
| A `div.v2row.v2row-why` with no link | Nothing | **None.** A row that moves under the thumb and then does nothing is the feedback failure inverted (`v2-foundation-ui.md §3.8`) | Not focusable — it is not a control, so it is not in the tab order | — | — |

**Reduced motion** (`prefers-reduced-motion: reduce`): every press becomes `opacity: 0.8`,
sheets and confirmations fade without moving. Gentler, not absent — the person still has to be
told the interface heard them.

### 1.11 Copy

Written for somebody standing up with ninety seconds whose first language may not be English.
Seven words on a button, twelve in a row title. No exclamation marks, no "Please", no blame.

| Where | English |
|---|---|
| Screen title | Buses |
| Count, none / one / many | No buses · 1 bus · 89 buses |
| Search placeholder | Search a bus |
| Buttons | Add bus · Log service · Make a job · Link GPS · Check challans (uses 1 credit) · Buses (the back control) |
| Card headings | The bus · What this bus needs · Papers · Service · Running cost · Challans · Tyres and batteries fitted · Crew · Last seen · Driver reports · Repair history |
| Odometer, unknown | No odometer reading |
| Odometer, broken | Odometer broken since 12 Oct |
| Odometer entry, too low | Lower than the last reading, 48,210 km |
| Service, due | 4,120 km to the next service |
| Service, overdue | Overdue by 310 km |
| Service, no km basis | Last serviced 3 Jan 2026, 10 months ago |
| Service, nothing at all | No odometer reading and no service recorded |
| Papers, per row | Expires 14 March 2027 · Expires in 9 days · Expired 3 January 2026 · Not recorded |
| Papers, none at all | No papers recorded for this bus. |
| Running cost | Running cost, last 30 days |
| Running cost, parts | Diesel and AdBlue · Parts · Labour · Outside vendor · Trip cash |
| Running cost, a part missing | Part of this is missing |
| Trip cash, none | No trips recorded |
| Challans, zero | No pending challans, checked 2 hours ago |
| Challans, never | Never checked |
| Challans, provider down | Could not reach the challan service. Last checked 3 days ago. |
| Challans, credits | 46 checks left this month |
| Challans, offline | Needs signal. Check when you are online. |
| Crew, empty seat | Empty |
| Crew, no phone | No phone recorded |
| Position, none | No position recorded for this bus |
| Position, no match | This bus is not matched to a tracker |
| Repair history, waiting | Waiting for sign-off |
| Repair history, a service log | Service |
| Duplicate bus | RJ09PA6126 is already on the register |
| Save failed | Could not save. The bus is kept on this phone. It will send when there is signal. |
| Empty register | No buses yet / Add the first bus to start. |
| Offline header | No connection. Last updated 06:40. |

Hindi: every fixed word in the chrome comes through `w(id)` from `ui/words.js`
(`v2-foundation-ui.md §6.3`), and **a missing Hindi value is a build error, not an English
fallback.** The screen labels above are screen-level and stage 1 adopted the same rule for them
(`v2-ux.md §6`). Who reads Hindi only is owner question Q12 and is not mine to answer.

---

## 2. Screen 6 — Store

### 2.1 Declaration, and the `bills` split

Per `v2-ux.md §4.3`: `viewStore`; `issuePart`; `receiveStock` (Q6); `manageSupplierBills`;
`manageComponents`.

| Element | Declares | Roles today (`02 §2`) |
|---|---|---|
| The screen, Catalogue, Pieces | `viewStore` | owner, supervisor, store, **mechanic** |
| Issue a part | `issuePart` | owner, supervisor, store |
| Receive stock | `receiveStock` | owner, supervisor, store — identical to `issuePart` today, and **nothing in the app ever checks it** (`02 §4.2`); the Receive button is gated by `issuePart` at `app.js:4668`. **Q6 is open.** I declare `receiveStock` because the role sets are identical, so the declaration is free today and already right if the owner answers "its own". If he answers "the same", one line changes |
| The shelf count | `issuePart` (`ROUTE_PERM.storehealth`, `02 §4.3`) |owner, supervisor, store |
| Bills, vendors | `manageSupplierBills` — the operational half of the `bills` split | store keeps it (`v2-ux.md §5.1`) |
| The piece register's write actions | `manageComponents` | owner, supervisor, store, crewmanager |

**The split, exactly.** `bills` and `purchases` are two routes rendering one function today,
kept apart only because dropping the alias made the permission bypassable (`01 §5.1`,
`02 §6.1`). v2 splits the capability: **manage the supplier bill here, read the fleet total on
Money (#7).** So on this screen:

| Allowed here | Forbidden here |
|---|---|
| One bill: supplier, number, date, amount, lines, photo, paid or not | Any period spend total — 30 days, this month, this year |
| **One vendor's unpaid bills**: the list, the count, and their sum | A sum across vendors, or "what we owe suppliers" as one number — that is Money's |
| A part's own `unitCost` and the stock value of that part | Fleet stock value, cost per bus, cost per km |

The per-vendor unpaid sum is a judgement I made and it is the line most likely to be argued
with: you cannot settle with `MIDAS TYRE` without knowing what `MIDAS TYRE` is owed, and that is
managing the bill. **Everything above that line of aggregation is Money's.** Stage 1 did not
draw the line this precisely; §9 carries it back.

**The mechanic.** Holds `viewStore` and nothing else here (`02 §2`: three capabilities, all
reads). So a mechanic sees **Catalogue and Pieces, read-only** — Issue, Receive, Counts and
Bills are absent tabs, not disabled ones. "I need a part" is on the **Job card (#4)**
(`v2-ux.md §3.2` step 4, writing `jobcards.partRequests`), not here, and the catalogue's empty
state for a mechanic says so: "To ask for a part, open your job card." `PERMS.requestPart` is
`['supervisor','owner']` and the mechanic branch can never be true (`02 §4.2` item 2) while
`d2d8afa` says the button was given to mechanics — whether that regressed or was taken away is
UNDETERMINED, and this screen does not depend on the answer.

### 2.2 Structure at phone width (yard density, 360px)

The storekeeper is at a counter with a mechanic waiting. The two things that happen are at the
top and never behind a tab.

```
[ header                                                               ]
  Store                                                       --t2 600
  2,384 parts · 7 waiting requests                            --t6 --ink-dim
  [ .btn-primary Issue part ]  [ .btn icon('add') Receive stock ]
  [ .field icon('search')  "Search a part" ]
[ .tabs  role=tablist, scrolls horizontally                            ]
  Catalogue · Pieces · Requests (7) · Bills · Counts
[ the view                                                             ]
[ --nav-h + safe-area bottom padding                                   ]
```

- **Five tabs, not the foundation's three.** `v2-foundation-ui.md §3.6` names "catalogue /
  waiting requests / counts" as this screen's example; I need two more because each tab is a
  different *object* — a line in the book, a numbered piece, a waiting ask, a supplier's paper,
  a physical count — and collapsing any two hides one of them. The strip scrolls horizontally
  at 360px (`§3.6`), which is the cost, and at desk five fit with room over. The foundation
  permits the builder to choose each list's filters (`§7.2` item 5); I am exercising that and
  saying so.
- **Issue and Receive are above the tabs**, not inside Catalogue. A storekeeper with somebody
  waiting must not choose a view before doing the job.
- The header count is three facts, in words, so none of them can be mistaken for a total:
  "2,384 parts", "7 waiting requests", and on a fresh device "no reorder levels set" (§2.4).

### 2.3 Structure at desk

- `data-density="desk"` on the view container only; the header and the action buttons stay at
  `--tap` 48px even at desk, because they are the two writes and a 32px "Issue part" on a Core 2
  Duo is a miss. `tokens.css` allows density on any container inside `[data-v2]` explicitly.
- Catalogue: a **windowed** one-line `a.v2row` list. `--row-h` 32px; scroll height is
  `rows x --row-h`, computed, never measured (`§2.3` rules 2 and 6). `.act` carries three
  controls: `figure(qty, {unit})`, a `badge`, and a `.btn` "Issue".
- Counts: a `.table` is wrong here — every cell is a field — so it stays a list of
  `div.v2row`, one `.num` each, at desk density.
- Bills and Pieces: one-line `a.v2row` lists, under 200 rows in any plausible garage, not
  windowed.
- The rail takes 160px and leaves 864px. A desk catalogue row needs a 16px mark, a name that may
  run to 30 characters, a figure, a badge and a 32px button; the foundation sized that at 864px
  from arithmetic and has not seen it (`§8.2` item 2). If it is too narrow, §2.5 says what gives.

### 2.4 "Low stock", and the count that could never reach zero

This is the single most consequential line on the screen, and the seed is why (§0.4).
`reorderLevel` is **0 for all 2,384 parts** and `qty` is **0 for all 2,384 parts**. So
`qty <= reorderLevel` is true for every row, and a reorder list built that way shows 2,384 red
rows on a fresh device — a count that cannot reach zero, which `v2-ux.md §4.1` forbids by name
and which has shipped twice already (`5eb8c6e`, `ba274f6`).

**Three states, kept apart:**

| State | Test | Shown as |
|---|---|---|
| **Low** | `reorderLevel > 0` **and** `qty <= reorderLevel` | `badge badge-warn` + `icon('warn')` + "Low", and the row is in the Low filter |
| **No reorder level set** | `reorderLevel` is 0, absent or not a number | **Not low.** `figure(null)` in the reorder slot and the words "No reorder level". Counted once, in one line at the top of the catalogue: "2,384 parts have no reorder level. Set one to get a warning." with a link, **not 2,384 rows** |
| **Out of stock** vs **never counted** | `qty === 0` with a ledger row for this part vs `qty === 0` with no ledger row at all | "Out of stock" (a real zero, `figure(0)`) vs "Not counted yet" (the dash, `figure(null)`). `states.js` exists because these must never look alike, and a storekeeper ordering against a book that was never counted is how the count drifts in the first place |

A `qty` below zero is possible and is **not hidden** (§2.7 (a)): `figure(-2, {unit:'pc'})` with
`badge badge-bad` "Count this part".

### 2.5 Catalogue

**Yard row** (two lines, `a.v2row`):

```
icon('part')  FULE FILTER                                 [ 12 pc ]
              328305 · reorder 4
```

**Desk row** (one line):

```
icon('part',16)  FULE FILTER        [ 12 pc ] [ badge Low ] [ .btn Issue ]
```

- `.t` is `name` **rendered exactly as stored.** Not title-cased, not corrected. The catalogue
  holds `FULE FILTER`, `MAKHI WASER FRONT 2518 B BANZ`, `WHEEL CHUCKNUT B BANZ` and
  `Hydrolic Oils`, and those spellings are how the storekeeper will search for them. A row that
  silently prettifies a name is a row that cannot be found by the name on the shelf label.
- `.sub` at yard is `partNo` (or "No part number" — 59% of the catalogue has none), then the
  reorder state. Truncates with an ellipsis; the three-column grid
  `auto minmax(0, 1fr) auto` means a long name truncates instead of shrinking the action.
- Search is case-insensitive substring over `name` and `partNo`, with no stemming and no fuzzy
  matching. A storekeeper typing "FULE" must find "FULE FILTER" and a storekeeper typing "FUEL"
  must be told nothing matched rather than being shown a guess — a wrong part issued against a
  card is `d738a6e` with a different cause.
- Sub-filters inside Catalogue, as a second `.tabs` strip would be two levels of tabs and is
  refused. They are a sheet (`icon('filter')`): Low · No reorder level · Out of stock · By
  category · Serial-tracked only.
- **What gives if 864px or the 250 ms reading is wrong** (`v2-foundation-ui.md §8.2` item 1,
  §2.3): first the badge (its word moves into `.sub` at yard and is lost at desk, where the
  figure and the Low filter still carry it), then the figure (the Issue button survives
  longest, because it is the job). The lead mark and the name never go.

### 2.6 Counts — the shelf against the book

`audits`: `{id, at, by, mode:'blind'|'full', lines:[{partId, system, counted, variance, value}],
shrinkValue, foundValue}`. Append-only for non-managers (`02 §4.4`).

**The regression this view exists to not repeat.** `predeploy-gate.sh:508-511` has a permanent
check — "Clicking a count field must NOT navigate away — the exact regression" — plus the
invariant sweep at line 1073 which clicks every `input`, `select` and `textarea` on a screen and
asserts the route is `stable`, not `MOVED`. A shelf-count field sat inside a pressable row, the
row's delegated handler caught the click, and the storekeeper was thrown off the screen
mid-count. The three rules, from `v2-foundation-ui.md §3.3`, restated because this is the screen
they were written for:

1. **A row that holds a field is `div.v2row`.** Never `button.v2row`, never `a.v2row`. The field
   lives in `.act`; nothing that wraps it is itself a target.
2. **`type="text"` with `inputmode="numeric"`, never `type="number"`.** A number input puts
   spinners in a 32px desk row, accepts `e`, and **changes its value when the mouse wheel rolls
   over it** — on a list of hundreds of count fields at a desk that is a silent wrong count, and
   a wrong count writes a shrinkage figure onto the owner's Attention queue.
3. **The screen's one delegated click listener returns early** when
   `ev.target.closest('input, select, textarea, label, .num')` is non-null, **before** it reads
   `[data-act]` or `[data-nav]`. This is the line the regression was missing.

**And no steppers.** `v2-foundation-ui.md §4.4`: a minus mark would have been a 35th icon
against a 34 cap. The stronger reason is the storekeeper's own instruction — "correct the book
by counting, not by typing" (`05 §4` row 25) — and a stepper invites exactly the nudge that
instruction forbids. Every number on this screen is a reading or a count.

**Blind and full.** `audits.mode` exists, so both are real:

- **Blind** (the default, and the one the anti-pilferage record is for): the book figure is
  **not drawn** while counting. The row is the part name and an empty field. Nobody can type
  what the book says.
- **Full**: the book figure sits beside the field in `--ink-dim`, for a reconciliation pass
  after a blind count has found a gap.

The mode is chosen once, at the start, in the sheet that opens the count, and cannot be changed
mid-count — switching to Full halfway makes a blind count not blind and the record would say it
was.

**A count session is one category, not 2,384 parts, and that is forced by the data.** `audits`
is written **once**, at the end, and is **append-only for the store role** — so a half-saved
audit row can never be completed by the person counting. There is nowhere for a partial count
to live: `v2-ux.md §6` requires that nothing important lives only in `localStorage`, and it is
right. So:

- A session is scoped to **one category or one search result** — twenty to sixty lines, not
  2,384 — chosen in the opening sheet.
- The top of the view says, in words, before anything is typed: **"This count is not saved until
  you press Save count. Do not close the app."** The honest state, stated, beats a promise the
  data model cannot keep.
- Losing a session costs minutes, not an afternoon. That is the whole reason for the scoping.
- **A resumable count needs either a non-append-only draft or a new store**, which is a backend
  decision exactly like the Duty board's nightly list (`v2-ux.md §6`). §8 item 3 carries it.

**Saving a count writes, in this order:** `audits` (the record of what was counted), then
`parts` for each line whose `counted` differs from `qty`, then `ledger` — one append-only row
per corrected part, reason `Audit shortfall (shrinkage)` or `Audit surplus` (`03 §3.5`). The
audit row first, because an interruption must leave a record of the count rather than silently
corrected stock with nothing to explain it — the same ordering argument as the part issue
(`d738a6e`), applied here.

**The trust number.** One figure, from existing fields: **the share of counted lines whose
`variance` was zero at the last count, with the date.** "The book matched the shelf on 412 of
430 lines counted, 12 October." Plus `shrinkValue` and `foundValue` in rupees. And three states:
never counted (the dash, "This shelf has never been counted"), counted (the figure with its
`at`), and counted long ago (`stale: true`, `--warn`, "May be out of date"). **Unexplained stock
changes are not here** — `stockmoves.justified === false` is an Attention (#2) row kind with the
`count` mark, because a finding belongs in one ranked list (`v2-ux.md §5.1`).

### 2.7 Issue a part, and receive stock

**(a) Issue against a chosen card.** `issuePart`. A sheet (`V2.openSheet`), four steps, and the
first one is the card.

1. **Pick the card. Never pre-selected.** `d738a6e` is a floor report of a part charged to the
   wrong bus because the sheet pre-picked the first open job. A search field over open cards by
   bus registration and card date, nothing selected, and the sheet cannot advance until one is.
   No open card for this bus: "No open job card for this bus." The maker is the Job card's and
   needs `addJob` — which `store` does **not** hold in `PERMS` although the server would permit
   it (`02 §4.4`, "where the server is looser", item 1). So for a storekeeper the message names
   who can: "Ask a supervisor to open one."
2. **Pick the part.** The same search as the catalogue, with the stock figure and **its age**
   beside each result, because `parts.qty` is a mutable scalar updated in place and two
   storekeepers issuing offline both decrement it — the later write replaces the other's
   (`03 §5.5`). The age is the only honest thing to show.
3. **Quantity.** `.num` `data-kind="whole"`, blank, never a pre-filled 1. A "reused part"
   checkbox for the six `reusable` parts in the catalogue -> `partsUsed[].reused`.
4. **Confirm, with the consequence in words.** "Issue 2 pc FULE FILTER to RJ09PA6126, card
   j-4f2. The book goes from 12 to 10."

Writes, in this order and no other (`v2-ux.md §3.1` step 5, `d738a6e`):

1. **`ledger`** — `uid('l-')`, `type: 'out'`, `qty`, `jobId`, `reason: 'Issued to job'` (or
   `'Issued to job (reused)'`), `by`, `at`, `reused`, `unitCost`. Append-only; the server
   refuses any edit or delete of an existing id, **even for the owner**.
2. **`parts`** — `qty` decremented.
3. **`jobcards.partsUsed`** — the line. This is the one array the server merges by
   `(partId, reused)`, restoring a line a stale device omitted and keeping the larger `qty`
   (`03 §5.3`), which is the only reason a storekeeper and a supervisor can touch one card
   safely.

**An issue is never blocked by the book.** If it would take `qty` below zero it still saves, and
the toast says "Issued. The book now says -2. Count this part." The part has physically left the
shelf; refusing the write would mean it leaves with **no ledger row**, and the ledger is the
anti-pilferage record — this screen's whole reason to exist. A negative book is a visible
problem; an unrecorded issue is an invisible one. **This is my call and §9 carries it back.**

**An interrupted issue heals itself, and the screen says so.** If the `ledger` row landed and
`partsUsed` did not, `reconcileJobParts()` already re-adds any ledger-issued part missing from a
card after every applied pull, for roles that may issue (`03 §5.3`). So the half-finished state
is **not** a form to re-fill: the catalogue shows one line, "1 issue is still being matched to
its card", and it clears itself. The screen's job here is to say so, not to hide it.

**(b) A waiting part request.** `jobcards.partRequests[]` —
`{id:'pr-…', partId, partName, qty, status:'requested'|'fulfilled', by, at, fulfilledBy?,
fulfilledAt?}`. The Requests tab lists them oldest first: part, quantity, the named card, the
bus, who asked, how long ago. Tapping one opens the issue sheet **with the card and the part
already chosen from the request** — which is not the pre-selection `d738a6e` forbids, because
the mechanic named them, not the sheet. Quantity is still typed. Writes: the same three, plus
`partRequests[].status = 'fulfilled'`, `fulfilledBy`, `fulfilledAt`.

**(c) Receive stock, with the bill photographed and read.** `receiveStock`,
`manageSupplierBills`. `/ai/bill` is already open to `store` (`04 §1` row 35; `c896478`).

1. **Photograph the bill.** `photoCapture` -> a `--thumb` tile. Offline, the sheet says so
   **before** the person fills anything in: "No signal. The photo is saved. The reading needs
   signal." (`v2-foundation-ui.md §3.2`). The AI reading is one of the things `03 §6` lists as
   failing offline.
2. **Claude reads it, and the reading is a draft.** `purchases.readByAi: {lines, subtotal,
   total, model}`. Supplier, bill number, date, GSTIN and every line come back editable, and the
   model's name is shown. **Nothing is saved as read without the storekeeper confirming it.**
3. **Unmatched lines are shown as unmatched, never dropped.** `purchases.lines[]` needs a
   `partId`, so a line the reader could not match to the catalogue cannot go there. It stays in
   the `items` text and is listed under its own heading: **"Not matched to a part — these do not
   change stock."** Each gets a "find the part" action. A silently dropped line is stock that
   the bill says arrived and the book never heard about.
4. **Confirm, with the stock consequence in words.** "Saving adds 12 items to stock." Receiving
   changes `parts.qty` and `unitCost` (weighted average) and writes a `ledger` row — stock
   movement as an invisible side effect of photographing a paper is precisely how a count drifts.

Writes, in order: `vendors` (only if the supplier is new), `purchases`, then per line `parts`
(`qty` up, `unitCost` re-averaged) and `ledger` (`type: 'in'`, reason
`Purchase from <supplier>`). `03 §9` trap 25: vendor ids are stable by design, so an existing
supplier is matched, never duplicated.

**Paid or not.** `purchases.paymentStatus`, `paidAt`, `paidBy` are the **only** fields a
non-manager may change after entry (`02 §4.4`). So for the store role every other field on a
saved bill is `opacity: 0.5` with the reason in words — "A saved bill cannot be changed. Ask a
supervisor." — and "Mark paid" is a `.btn` that works.

### 2.8 Pieces — the per-piece register

`components`: `{id, kind:'tyre'|'alternator'|'starter'|'battery'|'injector'|'other', label,
serial, partId|null, partExtId, busId|null, position, state:'in-service'|'removed'|'sent-out'|
'refurbished'|'scrapped', installedAt, installedOdo, lifeKm, maxRefurb, lifeMonths,
warrantyMonths, boughtAt, refurbCount, cost, history:[...]}`.

This is where `warranty` lands. v1's warranty screen was reachable by **nobody** (`01 §1.3`) and
`v2-ux.md §5.2` drops it because "which fitted parts are still under supplier warranty" is a
property of a piece, and a list of claimable parts with no claim flow is a report nobody acts
on. So warranty is a **state on the piece**, in three forms that never look alike:

| Warranty | Test | Shown |
|---|---|---|
| In warranty | `boughtAt` and `warrantyMonths` both present, and the end date is ahead | "In warranty to 14 March 2027", `--ok` + `icon('ok')` |
| Ended | both present, end date passed | "Warranty ended 3 January 2026", `--ink-dim` |
| **Not recorded** | `warrantyMonths` absent — **0 of 2,384 seeded parts have one** (§0.4) | The dash and "No warranty recorded". Never "ended" |

The register row: kind mark (`tyre`, `battery`, else `part`), `label` and `serial` as `.t`, state
as a `badge` with a word, current bus and position as `.sub`. Tapping it opens the piece's whole
life — `history[]` as a timeline of install / remove / send-out / return / scrap, each with its
date, odometer, bus, vendor, cost and bill photo — plus "Refurbished 2 of 3 times" from
`refurbCount` / `maxRefurb`, and life used against `lifeKm` / `lifeMonths` (the dash when
`installedOdo` is unknown, per §3.5).

**The whole life is here and only here.** `v2-ux.md §4.1` #10 makes it a "must not" on
Fuel & tyres: that screen does the fitting, this screen holds the history. §3.6 says what
Fuel & tyres shows instead, and why the link into this register is **absent** for a crew manager.

### 2.9 Bills and vendors

Bills list, newest first: supplier, bill number (or "No bill number"), date, amount,
`badge badge-warn` "Unpaid" or `badge-ok` "Paid". One bill: the photo at `--thumb`, the lines
with the parts they moved, the vendor, "Mark paid".

The vendor behind the bill — real content, these are the eleven in the seed: `Volvo`
(Repair, Jaipur, "Contact: Kamlesh ji"), `MIDAS TYRE`, `PREM AUTO ELECTRIC WORKS`,
`GULF OIL LUBRICANTS INDIA LTD` (GSTIN `08AACCH0941E1ZZ`), `PURAN AUTO SEALS`, `DAIMOND MOTORS`,
`WPM MOTORS`. A vendor card holds name, category, city, phone as a `tel:` link, GSTIN, notes,
`isRepairVendor`, and **that vendor's unpaid bills** — the list, the count, their sum, and
nothing wider (§2.1).

### 2.10 Every state

| State | Catalogue | Pieces | Requests | Bills | Counts |
|---|---|---|---|---|---|
| loading | `skeleton(8)` yard / `skeleton(20)` desk; the header and both action buttons draw first | `skeleton(6)` | `skeleton(4)` | `skeleton(6)` | `skeleton(10)` |
| empty | `emptyState('No parts in the book yet', {icon:'part', hint:'Receive a bill to add parts.'})`; for a mechanic the hint is "To ask for a part, open your job card." | `emptyState('No tyres, batteries or other pieces recorded', {icon:'tyre'})` | `emptyState('No part requests waiting', {icon:'ok', hint:'Mechanics ask from their job card.'})` | `emptyState('No supplier bills yet', {icon:'doc', hint:'Photograph a bill to add one.'})` | `emptyState('No count recorded', {icon:'count', hint:'Start a count to check the book.'})` |
| one item | The one row; the filter sheet control is absent | The one piece | "1 request waiting", singular | The one bill | A one-line count is allowed and saves |
| **far too many** | **2,384 rows, every figure unknown** (§0.4). Windowed one-line desk row; "2,384 parts have no reorder level" as **one** line, not 2,384 rows; search is the only way through and is stated as such in the header | Under 200 in any plausible garage | 7 is a busy day. Capped at 200 with a remainder line, like Attention | Capped at 200 with a remainder line | **Scoped to one category per session** (§2.6) — the cap is a design rule, not a number |
| error | `errorState('Could not read the part book', retry)` | `errorState` | `errorState` | `errorState` | `errorState`. **A typed count is never thrown away by an error** — the fields keep their values and the message says the save failed |
| offline | Rows stay with their age in the header. Issue, Receive's **photo**, and the count all work — they are local writes, which is most of what this app is for | Rows stay | Rows stay | Rows stay; "Mark paid" works | Works entirely. Stated: "This count saves on this phone and sends when there is signal." The bill **reading** does not work offline and says so before the person starts |
| **half-finished** | "1 issue is still being matched to its card" — self-healing (§2.7 (a)) | A piece with no `position`: "Position not recorded", `--warn` | A request fulfilled with no ledger row: "This request has no issue against it. Issue it again." | A bill photographed, not read, not saved: it is **not** a record yet and the sheet says "Not saved yet". A bill saved with unmatched lines: the heading stays on the bill forever until matched | Typed, unsaved: the warning at the top of the view, always |
| no permission | The screen and these two tabs need `viewStore`; Issue needs `issuePart`; Receive `receiveStock`; Bills `manageSupplierBills`; the piece write actions `manageComponents`. **Every one of them absent, never disabled** | | | | |

### 2.11 Interactions

| Control | What it does | Pressed | Focus | Disabled | While it works |
|---|---|---|---|---|---|
| "Issue part" (`.btn-primary`) | Opens the sheet, card step first, nothing pre-selected | scale(0.97), 120 ms `ease-out` | `outline: 2px solid var(--accent); outline-offset: 2px` | Absent without `issuePart`. Inside the sheet, Issue is `aria-disabled="true"` until a card, a part and a quantity are all there, with the reason in words | **"Issuing..."** on the button; the sheet stays open until the three writes land, then closes and toasts the new book figure |
| "Receive stock" (`.btn`) | Opens the sheet, photo first | scale(0.97) | ring | Absent without `receiveStock` | "Reading the bill..." while `/ai/bill` runs; `skeleton()` where the lines will be, never a blank panel |
| A `.tabs` tab | Changes the view. **Never navigates, never writes** — a tab must not push a route, or a back press walks through filters instead of leaving the screen | scale(0.97) | ring **inside** the edge, `outline-offset: -2px` — the strip clips an outer ring | Never. A filter that would return nothing is still shown; its own empty state is the answer | Counts draw as `figure(null)` — a dash, not a 0 — until the read lands |
| A catalogue row | Opens the part | scale(0.97) | ring at -2px | Never | — |
| Row-level "Issue" (`.btn`, desk only) | Opens the sheet **with the part chosen and the card step still empty** | scale(0.97) | ring | Absent without `issuePart` | "Issuing..." |
| A count `.num` | Puts the caret in the field. **Exactly one thing.** The row is a `div`, the delegated listener returns early, the input is `type="text"` with `inputmode="numeric"` | **None.** A field is focused, not pressed | `outline-offset: 2px` | `opacity: 0.5; cursor: not-allowed` only for a line already saved in this session's audit | Nothing. The field is never a loading surface |
| "Save count" (`.btn-primary`) | `V2.confirmDialog` naming the consequence: "Save this count? 18 parts will be corrected." Focus starts on **Cancel** | scale(0.97) | ring | `aria-disabled="true"` until one field has a value | "Saving count..."; the fields stay readable and keep their values |
| "Mark paid" (`.btn`) | Writes `paymentStatus`, `paidAt`, `paidBy` | scale(0.97) | ring | Absent without `manageSupplierBills` | "Saving..." |
| A photo tile / capture label | `V2.openPhoto` in a sheet / opens the camera | scale(0.97) on both | ring on the tile; `:focus-within` on the capture label, which is how a clipped `.sr-only` file input gets a visible ring | The capture cell is **absent** on a saved bill | A tile being sent says "Sending", no spinner. A tile that failed carries `badge badge-bad` "Not sent" + `icon('offline')` and stays tappable to retry. **The photo is not lost — it is in the record** |

### 2.12 Copy

| Where | English |
|---|---|
| Screen title | Store |
| Header counts | 2,384 parts · 7 waiting requests · 2,384 parts have no reorder level |
| Tabs | Catalogue · Pieces · Requests · Bills · Counts |
| Buttons | Issue part · Receive stock · Save count · Mark paid · Take photo · Find the part |
| Search | Search a part |
| Stock, states | 12 pc in stock · Out of stock · Not counted yet · No reorder level |
| Stock, negative | The book says -2. Count this part. |
| Low | Low |
| Issue, card step | Choose the job card this part is going to |
| Issue, no card | No open job card for this bus. Ask a supervisor to open one. |
| Issue, confirm | Issue 2 pc FULE FILTER to RJ09PA6126, card j-4f2. The book goes from 12 to 10. |
| Issue, done | Issued. The book now says 10. |
| Issue, done below zero | Issued. The book now says -2. Count this part. |
| Issue, failed | Not issued. Nothing has left the book. Try again. |
| Issue, healing | 1 issue is still being matched to its card |
| Request row | 2 pc FULE FILTER for RJ09PA6126 · asked 3 hours ago |
| Receive, offline | No signal. The photo is saved. The reading needs signal. |
| Receive, reading | Reading the bill... |
| Receive, unmatched | Not matched to a part — these do not change stock |
| Receive, confirm | Saving adds 12 items to stock. |
| Bill, saved and locked | A saved bill cannot be changed. Ask a supervisor. |
| Bill, no number | No bill number |
| Count, mode | Count without the book showing (blind) · Count with the book showing |
| Count, warning | This count is not saved until you press Save count. Do not close the app. |
| Count, confirm | Save this count? 18 parts will be corrected. |
| Count, saved | Count saved. 18 parts corrected. |
| Count, offline | This count saves on this phone and sends when there is signal. |
| Trust number | The book matched the shelf on 412 of 430 lines counted, 12 October. |
| Trust, never | This shelf has never been counted |
| Warranty | In warranty to 14 March 2027 · Warranty ended 3 January 2026 · No warranty recorded |
| Piece state | In service · Removed · Sent out for repair · Refurbished · Scrapped |
| Piece, refurb | Refurbished 2 of 3 times |
| Mechanic, catalogue hint | To ask for a part, open your job card. |
| Save failed, generic | Not sent. The count is saved on this phone. It will send when there is signal. |

---

## 3. Screen 10 — Fuel & tyres

### 3.1 Declaration, and the dead end it fixes

`addFuel` (owner, supervisor, store, crewmanager) and `manageComponents` (the same four).

| Element | Declares |
|---|---|
| The screen, Fills, Mileage | `addFuel` |
| Log diesel, Log AdBlue | `addFuel` |
| Pieces, Fit, Remove, Send out for repair | `manageComponents` |
| A bus row that **links to Buses (#5)** | `fleet` — and this is the fix, below |

No role holds one of the two capabilities without the other today, so nothing splits in
practice. The declarations are per action anyway, so the screen stays correct if that changes.

**The named dead end.** `01 §1.3` item 7: the row tap into `busreport` is a dead end for
`store` and `crewmanager`, who do not hold `dashboard`. `v2-ux.md §4.1` #10 makes per-bus cost
reports a "must not" here. So:

> **A bus row on this screen is an `a.v2row` only for a holder of `fleet`.** For a storekeeper
> and a crew manager it is a `div.v2row` — not a link that bounces, not a greyed link. The
> mileage and the last fill are **on the row**, so the person who cannot navigate still gets the
> answer.

That is "absent, not disabled" applied to a link, and it closes a recorded dead end rather than
re-styling it.

### 3.2 Structure at phone width — the crew manager is holding a nozzle

Yard density throughout. The four writes are the top of the screen, as four buttons, because
this person is standing at a pump or at a tyre shop and has one hand.

```
[ header                                                               ]
  Fuel & tyres                                                --t2 600
  Last fill: RJ09PA6126, 2 hours ago                          --t6 --ink-dim
  [ .btn-primary icon('fuel') Log diesel ]  [ .btn Log AdBlue ]
  [ .btn icon('tyre') Fit tyre ]            [ .btn icon('battery') Fit battery ]
[ .tabs ]  Fills · Mileage · Pieces
[ the view                                                             ]
[ --nav-h + safe-area bottom padding                                   ]
```

- Buttons wrap to two rows at 360px; each is `min-height: var(--tap)` 48px with `gap: --s2`.
  "Log diesel" is the only `.btn-primary`: it is what happens most.
- The header's second line is the last thing this person did, so a double entry is visible
  before it is made.
- At desk (office, `--rail-w` rail, 864px) the same three views; the buttons stay at `--tap`
  48px and the lists take `data-density="desk"`.

### 3.3 Fills

Newest first, `fuel` and `def` in one list, each row saying which it is.

```
icon('fuel')  RJ09PA6126 · 120.5 L · ₹11,460           [ badge Full tank ]
              48,210 km · HP pump, Ajmer Road · 2 hours ago
```

AdBlue rows carry `icon('fuel')` too (the set has no AdBlue mark and the cap is reached) and
`.t` begins "AdBlue". Capped at **200** with one line stating the remainder and which filter
narrows it — the same shape as Attention (`v2-foundation-ui.md §2.4`), and §0.5 says the number
is the placeholder's.

A row with no odometer reads "No odometer reading" in `--warn` where the km would be. It is not
hidden: a fill without a reading is the input that breaks mileage, and the person who can fix it
is the person reading this list.

**A fill cannot be edited by the person who made it.** `fuel` and `def` are append-only for
non-managers (`02 §4.4`), so for `store` and `crewmanager` there is no edit control — absent,
not disabled — and the toast after saving says what to do instead: "Saved. A fill cannot be
changed. Add a correcting fill if this was wrong." Owner and supervisor get an edit action.

### 3.4 Log diesel — the sheet, in the order the person is standing in

1. **Bus.** Search, with the buses this person logged most recently first. Nothing
   pre-selected.
2. **Litres.** `.num` `data-kind="decimal"` -> `inputmode="decimal"`,
   `pattern="[0-9]*[.]?[0-9]*"`. Blank.
3. **Rupees.** `.num` decimal. Blank.
4. **Odometer.** `.num` whole. Blank, with the last reading as a **hint under the field, not a
   value in it**: "Last reading 48,210 km, 2 November". `v2-foundation-ui.md §3.3`: never a
   pre-filled 0, and never a pre-filled anything on a reading — a default is a number nobody
   typed. Forward-only: a lower entry is `aria-invalid="true"` with "Lower than the last
   reading, 48,210 km" (`927864c`).
5. **Full tank or part fill.** A `.select` with **no default selection** —
   `<option value="">Choose</option>`, then "Full tank", then "Part fill" — and it is required.
   **The default must not be "Full tank":** a part fill recorded as full produces a wrong km/l,
   which is the ₹45,000/km bug's sibling. This two-option select is the weakest control in my
   spec and §8 item 4 says why.
6. **Pump** and **place**, optional `.field`s; `place` is capped at 500 characters by the server.

Writes **one** `fuel` row: `{id: uid('f-'), busId, litres, cost, odometer, full, at, by}` plus
`pump`, `place`. Then `buses.odometer` / `odometerAt` **only when the entered reading is higher
than the stored one**, read from IndexedDB immediately before the put and never from `S.cache`
(§1.8 (b)). Nothing else is written: a fill does not touch a job card, a part or a component.

Log AdBlue is the same sheet writing `def`, without the full/part choice (`def` has no `full`
field) and without the forward-only odometer write — AdBlue top-ups are not a mileage basis, so
they do not get to move the bus's odometer. That keeps the number of paths that write `buses`
as low as it can be, and `buses` is the most-clobbered record in the system (`03 §5.5`).

### 3.5 The odometer rule — what a missing or implausible reading shows

This is the bug the screen is designed against. `8db78e7`: **₹45,000 of work was divided by a
missing odometer, read as ₹45,000 per kilometre, and topped the money-pit list — sending the
owner to inspect a healthy bus.** The rule, stated as one sentence and then as cases:

> **A per-km or per-litre figure is never drawn from a divisor the app does not hold or does not
> believe. There is no fallback divisor, no "assume the last reading", and no zero. The figure is
> the dash, and the reason is in words beside it.**

**Six cases. The first is a sentence; the rest are the arithmetic.**

| Case | Test | What the screen shows |
|---|---|---|
| **1. No reading on this fill** | `odometer` absent, 0, or not a number | `figure(null)` — the em dash, which a screen reader hears as "No data" — plus **"No odometer reading"** and one next step, "Add the reading on the next fill". Never 0, never computed from the fill before |
| **2. Odometer broken** | `buses.odoBroken` true | The dash plus **"Odometer broken since 12 October"**, and **no request for a reading.** Different from case 1 because the fix is different: somebody forgot, versus the instrument is broken and asking for a number is how a wrong one gets typed |
| **3. Backwards** | entered `odometer` < the last stored reading | **Refused at entry**: `aria-invalid="true"`, `--bad` border plus an inset 1px `--bad` edge plus the message in words — "Lower than the last reading, 48,210 km". Forward-only (`927864c`). The fill can still be saved **with the reading left out** (case 1), never with a lower number |
| **4. No distance** | this reading equals the previous full-fill reading | The dash plus **"Same reading as the last fill"**. A division by zero is not a big number; it is no number |
| **5. Implausible** | the computed km/l falls outside **1.5 to 12 km/l** | **Not a mileage.** The dash, plus both numbers so the person can see which one is wrong: **"Reading does not fit — 48,210 km to 61,900 km on 120.5 litres"**. `--warn` + `icon('warn')` |
| **6. Part fill only** | no two consecutive `full: true` fills yet | The dash plus **"Part fill — mileage at the next full tank"**. Litres and rupees are still shown; they are facts |

**And the consequence that actually prevented the bug:**

> **An unusable figure cannot enter a ranking in either direction.** A bus whose km/l or
> ₹/km cannot be computed is **dropped from the mileage ordering and listed at the end under its
> own heading, "Readings to check"**, with the case above that applies to it. It is never ranked
> at zero and — this is the half `8db78e7` got wrong — **never ranked at the top.** It is also
> excluded from the falling-mileage flag, because a flag fired by a missing number is a flag
> that teaches people to ignore flags.

This is `v2-foundation-ui.md §3.4`'s error rule ("a single row that cannot be ranked is dropped
from the ranking and listed at the end under its own heading, never ranked at zero") applied to
a divisor rather than to a failed read. The same wording, the same shape, one screen over.

**The 1.5 to 12 km/l band is mine, and it is a band on the *result*, not on the distance** — a
plausibility test needs no knowledge of route lengths that way, and this document has none. A
full-size diesel coach realistically returns 3 to 6 km/l, so 1.5 and 12 are wide enough not to
reject a real tank and narrow enough to catch a transposed digit. **It is a guess with its
arithmetic shown, not a measurement**, and it can be replaced by one in a single query: the
median and the spread of computable km/l across the `fuel` store. §8 item 5 and §9 carry it.

### 3.6 Mileage

Per bus, one row, and the row carries the answer so a non-`fleet` role is not sent anywhere:

```
icon('bus')  RJ09PA6126                                     [ 4.2 km/l ]
             ₹95.1 diesel per km · 48,210 km · full tank 2 hours ago
```

**How each figure is computed**, written out so a builder has nothing left to decide:

- **km/l** — full-tank to full-tank. Order this bus's `fuel` rows by `at`. Take the two most
  recent `full: true` fills. Distance = odometer(later) - odometer(earlier). Litres = the sum of
  `litres` over every fill **strictly after** the earlier full fill up to and including the
  later one — so part fills in between are counted, which is the partial-fill rule
  `v2-ux.md §4.1` #10 asks for. `km/l = distance / litres`, one decimal place. Any of §3.5's six
  cases -> the dash and the reason.
- **"Diesel cost per km"** — the sum of `cost` over the same span divided by the same distance,
  two decimal places. **The label is always "Diesel cost per km", never "cost per km".** It is
  diesel only: no AdBlue, no parts, no labour, no outside work, no trip cash. Money (#7) holds
  "Running cost per km", which is all of it. Two figures with the same name on two screens is how
  five cost bases start, and §10 item 1 says this is where the one-basis rule is most likely to
  erode.
- **Run since** — `buses.odometer` - odometer(last fill), only when both are known.
- **The falling-mileage flag** — fires when this bus's current km/l is below **0.85** of the
  median of its **previous three** computable spans, and only when at least **four** computable
  spans exist. `--warn` + `icon('warn')` + the words "Mileage down 18% on the last three tanks".
  **0.85 and four are mine**, chosen so the flag cannot fire on a single bad tank or on a bus
  with almost no history; §9 carries them back.

Ordering: worst mileage first, because that is the question. Buses with no usable figure are
**not** in that ordering (§3.5) — they are at the end under "Readings to check".

### 3.7 Pieces — fitting, removing, sending out

The fitting half of `components`. The whole life is Store's (§2.8).

**What a row shows here** — and this list is exactly what a crew manager needs to fit the right
tyre, because a crew manager does **not** hold `viewStore` (`02 §2`: `crewReviews`, `crewPerf`,
`crewNote`, `manageDrivers`, `assignDriver`, `addFuel`, `manageComponents`, `liveMap`):

`kind` mark, `label`, `serial`, `state` badge with a word, current `busId` and `position`,
and the **last event only** from `history[]`. **No timeline, no cost history, no bill photos.**
And the link into Store's register is **absent** for a role without `viewStore` — not a link
that bounces, which is the same dead end as §3.1's.

**Three write actions**, each a sheet, each writing exactly one `components` row:

| Action | Writes |
|---|---|
| **Fit** | `busId`, `position`, `state: 'in-service'`, `installedAt`, `installedOdo`, and one `history` entry `{type:'install', at, odo, busId, position}` |
| **Remove** | `state: 'removed'`, `busId: null`, and `{type:'remove', at, odo, busId, position}` |
| **Send out for repair** | `state: 'sent-out'`, and `{type:'send-out', at, vendor, cost, billPhoto, note}` |

- `installedOdo` is a `.num` whole, **blank**, with the bus's last reading as a hint under the
  field. It is stored on the component and **does not write `buses`** — a tyre fit must not be a
  path that clobbers an odometer (§3.4's reasoning, applied again).
- `position` is required on a fit. A piece in service with no position cannot be found on the
  bus, and §2.10 shows what that row looks like when it happens anyway.
- `history` is a whole-record array rewritten by the editor, so two people editing one piece lose
  each other's entries (`03 §5.5`). A bus's four tyres are four separate records, so the normal
  case is safe; what is not safe is two people recording the same piece's removal, and the sheet
  therefore shows the piece's current state **with its age** before the action, the same way the
  issue sheet shows stock with its age.

**The seam this screen cannot close.** "Send out for repair" sends a physical unit out of the
garage, and the printable gate pass that evidences it is `gatepasses` — **owner and supervisor
only** (`02 §4.4`, capability `outsideJob`). So a crew manager or a storekeeper can record that a
piece left and **cannot make the slip.** The sheet says so rather than omitting it: "No gate pass
can be made from here. The owner or a supervisor makes the slip." Hiding it would mean a unit
leaves with no paper and nobody told. §8 item 6 carries the seam.

### 3.8 Every state

| State | Fills | Mileage | Pieces |
|---|---|---|---|
| loading | `skeleton(8)`; the four buttons draw in the first paint and never wait for a store | `skeleton(6)` | `skeleton(6)` |
| empty | `emptyState('No fills recorded yet', {icon:'fuel', hint:'Log the first diesel fill.'})` | `emptyState('No mileage yet', {icon:'fuel', hint:'Mileage needs two full tanks on one bus.'})` — which is the honest reason, not "no data" | `emptyState('No tyres, batteries or other pieces recorded', {icon:'tyre'})` |
| one item | The one fill. Mileage still says "Mileage needs two full tanks on one bus" — **one fill is not a mileage** and must not be drawn as one | The one bus | The one piece |
| far too many | Capped at **200** with a remainder line and the filter that narrows it (§0.5) | One row per bus, 89 maximum | Under 200 in any plausible garage |
| error | `errorState('Could not read the fills', retry)` | `errorState` | `errorState` |
| offline | Rows stay with their age. **Logging a fill works** — it is a local write, and that is what this screen is for | Figures stay with their age | Fitting works |
| **half-finished** | A fill saved with no odometer: in the list, "No odometer reading" in `--warn`, and it is the row the person can act on | A bus with one computable span and one unusable one: the computable figure, and the unusable one under "Readings to check" — never averaged | A piece in service with no `position`: "Position not recorded", `--warn` |
| no permission | Fills and Mileage need `addFuel`; Pieces and its three actions need `manageComponents`; a bus row links only with `fleet`. All absent, never disabled | | |

### 3.9 Interactions

| Control | What it does | Pressed | Focus | Disabled | While it works |
|---|---|---|---|---|---|
| "Log diesel" (`.btn-primary`) | Opens the sheet, bus first, nothing pre-selected | scale(0.97), 120 ms `ease-out` | `outline: 2px solid var(--accent); outline-offset: 2px` | Absent without `addFuel`. Inside the sheet, Save is `aria-disabled="true"` until bus, litres, rupees and the full/part choice are all there, with the reason in words | **"Saving..."** on the button; the sheet closes on the write and toasts "Saved" |
| "Log AdBlue" (`.btn`) | The same sheet, writing `def` | scale(0.97) | ring | Absent without `addFuel` | "Saving..." |
| "Fit tyre" / "Fit battery" (`.btn`) | Opens the fit sheet | scale(0.97) | ring | Absent without `manageComponents` | "Saving..." |
| A litres / rupees / odometer `.num` | Puts the caret in the field, and **exactly that**. `type="text"` + `inputmode`, `div.v2row` if it is ever in a row, the delegated listener returns early | **None** — a field is focused, not pressed | `outline-offset: 2px` | `opacity: 0.5` on a verified card's odometer only; never here | Nothing. The field is never a loading surface |
| The full/part `.select` | Sets `full`. **No default selection** (§3.4) | None | ring | Never | — |
| A bus row on Mileage | Opens Buses (#5) **with `fleet`**; does nothing without it, and is a `div.v2row` with no press (§3.1) | scale(0.97) only when it links | ring at -2px when it links; not focusable when it does not | Never disabled — the link is absent or present | — |
| A fill row's edit (`.btn-quiet`) | Opens the fill | scale(0.97) | ring | **Absent** for `store` and `crewmanager`: `fuel` and `def` are append-only for non-managers. The toast after saving says what to do instead | "Saving..." |
| "Send out for repair" (`.btn`) | `V2.confirmDialog` — the unit leaves the premises. Focus starts on **Cancel** | scale(0.97) | ring | Absent without `manageComponents` | "Saving..." |

### 3.10 Copy

| Where | English |
|---|---|
| Screen title | Fuel & tyres |
| Header | Last fill: RJ09PA6126, 2 hours ago · No fills yet |
| Buttons | Log diesel · Log AdBlue · Fit tyre · Fit battery · Remove · Send out for repair |
| Tabs | Fills · Mileage · Pieces |
| Fill row | 120.5 L · ₹11,460 · 48,210 km · HP pump, Ajmer Road |
| Fill type | Full tank · Part fill |
| Litres label / hint | Litres · As printed on the pump slip |
| Rupees label | Rupees |
| Odometer label / hint | Odometer now · Last reading 48,210 km, 2 November |
| Odometer, too low | Lower than the last reading, 48,210 km |
| Fill choice | Choose · Full tank · Part fill |
| Saved, non-manager | Saved. A fill cannot be changed. Add a correcting fill if this was wrong. |
| Save failed | Not sent. The fill is saved on this phone. It will send when there is signal. |
| Mileage, value | 4.2 km/l |
| Diesel cost | ₹95.10 diesel per km |
| Run since | 310 km since the last fill |
| **Missing odometer** | **No odometer reading** |
| Missing, next step | Add the reading on the next fill |
| Broken | Odometer broken since 12 October |
| No distance | Same reading as the last fill |
| **Implausible** | **Reading does not fit — 48,210 km to 61,900 km on 120.5 litres** |
| Part fill only | Part fill — mileage at the next full tank |
| The excluded group's heading | Readings to check |
| Falling mileage | Mileage down 18% on the last three tanks |
| Mileage, empty | Mileage needs two full tanks on one bus. |
| Piece states | In service · Removed · Sent out for repair · Refurbished · Scrapped |
| Fit, position | Which position on the bus |
| Position missing | Position not recorded |
| Gate pass seam | No gate pass can be made from here. The owner or a supervisor makes the slip. |
| Register link absent | — nothing is drawn. No "you cannot see this" |

---

## 4. The shared interaction contract

Collected so a builder does not have to read three tables to find one rule. Every item is
already in `v2-foundation-ui.md`; none is new.

1. **Every pressable presses.** `transform: scale(0.97)`, 120 ms `ease-out`, on `.btn`,
   `[role="tab"]`, `button.v2row`, `a.v2row`, the nav item, the photo tile, the capture label.
   The office machines took 884 ms per tap before dirty-store tracking; a control with no
   feedback reads as broken and the person taps again, which on an issue sheet is two parts off
   the shelf. This is the one animation the product cannot do without.
2. **A field is focused, never pressed.** Tapping a `.num` does exactly one thing: puts the
   caret in it.
3. **Focus rings.** `outline: 2px solid var(--accent)`. `outline-offset: 2px` on buttons,
   fields and photo tiles; `-2px` on list rows and tab strips, which clip an outer ring.
4. **Disabled has exactly two legitimate forms.** A control a person **may not use** is
   **absent** — deny-by-default, `v2-ux.md §4.3`. A control that is **working** is
   `aria-disabled="true"` and says what it is doing ("Issuing...", "Saving...", "Checking..."),
   for the ~200 ms of a local write or the 30–36 s of a cold server. `opacity: 0.5` plus the
   reason in words is for a record the **server** has frozen: a saved bill's fields for a
   non-manager, a closed trip's expense, a verified card's odometer.
5. **A row that does not link does not press and is not focusable.** It is not a control, so it
   is not in the tab order. A row that moves under the thumb and then does nothing is the
   feedback failure inverted.
6. **A write says what it will do before it does it**, when it spends money (a challan credit),
   moves stock ("the book goes from 12 to 10", "adds 12 items to stock"), or corrects the book
   ("18 parts will be corrected"). A `V2.confirmDialog` starts focus on **Cancel**, so a
   reflexive Enter says no.
7. **A failed write names what is still true.** Three clauses, no more: what happened, what is
   kept, the one next thing. "Not sent. The count is saved on this phone. It will send when
   there is signal."
8. **A filter never navigates and never writes.** It changes what is drawn. A tab that pushes a
   route makes the back press walk through filters instead of leaving the screen.
9. **Unknown, zero and stale are three different figures.** Pass the raw value and a `format`
   function to `figure()`; never format first. `Number(null).toLocaleString()` is `"0"`, and
   that one line is the whole ₹45,000/km family of bugs in miniature.
10. **Nothing on these three screens is two people's to edit at once.** The division of fields
    is load-bearing, not styling (`v2-foundation-ui.md §3.2`): the storekeeper's issue writes
    `partsUsed`, the one array the server merges; a fill is its own row; a component is its own
    row; `buses` is written by one path at a time and only forward.

---

## 5. Motion

**Nothing on these three screens animates that is not already in `components.css`.** No new
animation is specified, and that is the finding, not an omission.

| What moves | Property | Duration / easing | Why |
|---|---|---|---|
| Every press | `transform: scale(0.97)` | 120 ms `ease-out` | §4 item 1 |
| Sheet enter / exit | `translateY(var(--s8))` -> none + opacity | 250 ms / 180 ms `ease-out` | It arrives from the edge it is anchored to, so its direction is its dismissal. The distance is a token, so a desk sheet moves less than a yard one |
| Confirmation enter / exit | `scale(0.95)` -> none + opacity | 200 ms / 150 ms `ease-out` | A question that spends a credit or corrects the book must not appear in the same instant as the tap that asked for it. Exit faster than enter: slow where the person is deciding, fast where the system is responding |
| Scrim | `opacity: 0 -> 0.5` on `--accent-ink` | 200 ms / 150 ms | The page behind is inert; the scrim is the only thing that says so |
| Toast | `translateY(var(--s2))` -> none + opacity | 200 ms / 150 ms | A message that appears with no transition reads as a redraw, which on this app's history means something broke |

**What I considered and refused**, named so the next reader can see the purpose test being
applied rather than asserted:

| Refused | Why |
|---|---|
| The stock figure counting from 12 to 10 after an issue | `tabular-nums` exists precisely so digits do not shift as they update, and these numbers are read against each other. A number that animates cannot be read |
| A row sliding out of the catalogue when a part goes to zero | The reorder is the information. A sync tick applies records every 4 s; an animated 2,384-row desk list would be in permanent motion |
| A progress bar while `/ai/bill` reads the photo | Its duration is unknown, so the bar would be a lie about how far along it is. The words "Reading the bill..." and `skeleton()` where the lines will be are honest and cost nothing |
| A stagger on the fills list | 50 ms x n of deliberately withheld content on a machine that takes 798 ms to boot |
| A shimmer on the skeleton | Cannot stay under 300 ms without strobing, and costs frames on the oldest PCs. The word "Loading" and `aria-busy` carry the state |
| Anything on a tab or filter switch | Tens of times a day each. A 200 ms slide on the thing you press most makes the app feel slower than it is |

The one motion exception in the system — the 1.5-second hold-to-release bar — belongs to
Duty board (#9) and lives in that screen's own stylesheet, not in `components.css`
(`v2-foundation-ui.md §5.7`). **Nothing on my three screens needs a hold**, and I did not add
one: a part issue, a fill and a fit are all reversible by a correcting entry, and a count is
confirmed by a dialog that names its consequence.

---

## 6. What a builder must not change, and what they may

### 6.1 Must not

1. **The one cost basis** (§1.2). Buses reads Money's running cost; it does not compute one. A
   second definition anywhere is the five lenses coming back, and the words "cost per km" do not
   appear in the Buses screen layer.
2. **The label "Diesel cost per km"** (§3.6). Never "cost per km". That name belongs to Money.
3. **The odometer rule** (§1.3, §3.5). No fallback divisor, no assumed reading, no zero. An
   unusable figure is the dash with its reason, and it cannot enter a ranking in **either**
   direction.
4. **`type="text"` with `inputmode`, never `type="number"`**, on every number on all three
   screens; a row holding a field is a `div.v2row`; and the delegated listener returns early on
   `closest('input, select, textarea, label, .num')` **before** reading `[data-act]` or
   `[data-nav]`. Two gate checks already guard this (`predeploy-gate.sh:508-511`, :1073).
5. **No stepper buttons**, anywhere on these three screens.
6. **The order of the part-issue writes**: `ledger`, then `parts`, then `partsUsed`. And the
   order of the count writes: `audits`, then `parts`, then `ledger`.
7. **`buses` is written only forward and only when something changed**, read from IndexedDB
   immediately before the put, never from `S.cache`.
8. **No phone number for a role outside `PII_ROLES`**, and the test is the per-record
   `_redacted` flag, not whether a field is empty. No `emg*` or `ref*` field is rendered on
   these screens for any role.
9. **"Low" means `reorderLevel > 0 && qty <= reorderLevel"`** (§2.4). Any looser test produces a
   count that cannot reach zero on a fresh device.
10. **A control a person may not use is absent**, not disabled and not greyed. A bus row that
    cannot link is a `div`, not a dead `a`.
11. **Unknown, zero and stale stay three figures.** Pass the raw value and a `format` to
    `figure()`.
12. **No new field on any record, and no new store.** Under whole-record last-write-wins a field
    v2 invents is erased the next time a v1 device writes that record.
13. Everything in `v2-foundation-ui.md §7.1`: token names and values, the `[data-v2]` scope, no
    colour literal in a component, the Chrome 109 floor, `transform` and `opacity` only under
    300 ms with no bare `ease-in`, no emoji and no icon font, `.v2row` not `.row`, the `V2.*`
    overlay API, status never colour alone, and no fixed English word outside `ui/words.js`.

### 6.2 May

1. **Compose freely** — rows inside cards, tabs above lists, sheets from anywhere.
2. **Add the three screen stylesheets**, `[data-v2]`-scoped, sizing from tokens, the way
   `login.css` does.
3. **Choose the words**, inside §1.11, §2.12 and §3.10, in both languages.
4. **Change the skeleton row counts** (8 yard / 20 desk) to anything in `states.js`'s 1..50.
5. **Change the caps** — 200 fills, 50 history rows, 200 bills — once the office PC has been
   measured. That is an instruction, not a permission (§0.5).
6. **Change the 200-row windowing threshold on the catalogue**, for the same reason.
7. **Replace my three guessed numbers with a measurement**: the 1.5–12 km/l plausibility band,
   the 0.85 falling-mileage ratio, and the four-span minimum. Each shows its arithmetic and each
   is one query away from being a real number.
8. **Reject anything here that a measurement contradicts**, and say so in the stage-3 report
   rather than working around it.

---

## 7. Status

**ok = true.** Three screens specified at both densities, with all eight states each, every
element tokenised, every write ordered, and every number either sourced or shown as arithmetic.
I decided nothing that is the owner's.

`python3 scripts/check-floor.py v2 ui` — green, 10 files, within the Chrome 109 floor.

---

## 8. What the foundation lacks — carried back, not invented

Each of these is something I needed and did not find. None blocked the spec; all six are real.

1. **There is no store holding a bus's live position, so "live position" cannot be built as
   written.** `v2-ux.md §4.1` #5 asks for it. But `gpslive(reg, data, at)` is a **server table**,
   not a synced store: it is not in `db.js`, not in `Sync.STORES`, and it is in
   `SERVER_INGEST_ONLY`, denied to every role including the owner (`03 §1.2`, `02 §4.4`). The
   only position data a client holds is `gpsevents`, which carries `lat`/`lng` per safety event
   and reaches owner and supervisor only, time-windowed. So card 9 is specified as **"Last
   seen"** — the newest `gpsevents` position for this bus's normalised registration, with its
   age — and **the word "live" does not appear on the screen.** A genuinely live position needs
   `/gps*`, which fails offline, plus a new synced store or a new endpoint. That is a backend
   decision, not a UI one, and it belongs beside the Duty board's nightly store.
2. **The foundation has no radio-group or segmented-choice primitive**, and §3.4 needs one: "Full
   tank or part fill" is a required two-value choice where **no default is safe**, because a part
   fill recorded as full silently poisons km/l. I used a `.select` with an empty first option,
   which works and adds nothing, but it is the weakest control in this document: a select hides
   both options behind a tap and reads as optional. A two-option `[role="radiogroup"]` of
   `.btn`-shaped targets would be better and is about fifteen lines of CSS with no new token and
   no new icon. **Named rather than built**, because a primitive is the foundation's to add.
3. **A partial physical count has nowhere to live** (§2.6). `audits` is written once and is
   append-only for the store role, so a half-saved count can never be finished by the person
   counting; and `v2-ux.md §6` rightly forbids anything important living only in `localStorage`.
   My answer is to scope a session to one category and to say in words that it is not saved yet —
   honest, but it is a constraint shaped into a feature. A resumable count needs a draft the
   author may rewrite, which means either relaxing `audits`' append-only rule for the author
   (a server change) or one new store (the same shape as the Duty board's). **This is the second
   place in the plan where a store is the only safe home for a half-finished thing**, and the two
   should be decided together.
4. **`words.js` is specified for the 21 fixed chrome words only** (`v2-foundation-ui.md §6.3`),
   and these three screens contribute roughly 110 more labels (§1.11, §2.12, §3.10). Stage 1
   adopted the "a missing Hindi value is a build error" rule for screen labels too
   (`v2-ux.md §6`), which is right, but the mechanism is sized for 21 ids. Whether screen labels
   go in `words.js`, in a per-screen table, or through the live `i18n-hi.js` is unanswered, and
   it decides whether the key-parity check catches 21 keys or 131.
5. **No budget exists for Store's catalogue, which is the largest list in the product.** The
   foundation's only list budget is "200 dense desk rows inside 250 ms", and it is a placeholder
   (`DECISIONS.md §9`). The catalogue is **2,384 rows**, twelve times that, and it is the one
   list a storekeeper searches dozens of times a day. The office-PC reading stage 3 owes the
   foundation should be taken **with 2,384 rows as well as with 200**, or the windowing threshold
   that governs this screen is extrapolated from a number that was itself extrapolated.
6. **Two seams between capabilities, neither of which the foundation or stage 1 names:**
   - **A crew manager or a storekeeper can send a rotable out for repair and cannot make the
     gate pass.** `manageComponents` is four roles; `gatepasses` is owner and supervisor
     (`02 §4.4`). §3.7 says so on screen rather than omitting it, but a unit leaving with no slip
     is the thing `2b35e74`'s serial number exists to prevent.
   - **A storekeeper may need a job card to exist and may not create one.** `PERMS.addJob` is
     owner and supervisor, while the server would permit a `store` token to create a card
     (`02 §4.4`, "where the server is looser", item 1). §2.7 names who to ask. If the owner would
     rather the storekeeper could open a card, that is one line in `PERMS` and the server already
     allows it.

---

## 9. What stage 1 left open that I had to decide

These belong back in `v2-ux.md`. Each is a product decision I made because a screen could not be
specified without it; none of them is the owner's to answer, and all of them are reversible.

| # | Decision | Where | Reversible by |
|---|---|---|---|
| 1 | **The one cost basis is Money's 30-day running cost, read from Money and not recomputed.** Buses shows no per-km figure at all | §1.2 | Changing one definition in one place, which is the point |
| 2 | **v2's "log a scheduled service" stops at `status: 'done'` and collects a second signature.** v1's `confirmLogService` self-verifies, which a server guard makes unsafe for the owner and `DECISIONS.md §10` makes wrong for everybody. It therefore **requires a photo or the bill**, because `_guard_write` will refuse a photoless close | §1.8 (b) | A decision, not a line: either the server's guard is checked and found to exempt a create-at-verified, or this stands |
| 3 | **A part issue is never blocked by the book**, even below zero, because refusing it means the part leaves with no ledger row | §2.7 (a) | One condition |
| 4 | **The line of aggregation in the `bills` split**: one vendor's unpaid total is Store's; any sum across vendors or any period total is Money's | §2.1 | Moving the per-vendor sum to Money, at the cost of a storekeeper who cannot see what a supplier is owed |
| 5 | **"Low" requires a reorder level to have been set.** A part with `reorderLevel` 0 — all 2,384 of them in the seed — is "No reorder level", counted once, not low | §2.4 | One condition. But it is the line between a working reorder list and 2,384 red rows |
| 6 | **Store has five tabs, not the foundation's three** (Catalogue · Pieces · Requests · Bills · Counts), and the strip scrolls at 360px | §2.2 | Merging two, at the cost of hiding one object inside another |
| 7 | **A count session is one category**, not the whole catalogue | §2.6 | Item 3 in §8 |
| 8 | **Three numbers are mine and show their arithmetic, not a measurement**: the 1.5–12 km/l plausibility band, the 0.85 falling-mileage ratio, the four-span minimum before that flag may fire | §3.5, §3.6 | One query over the `fuel` store replaces all three with real figures |
| 9 | **Buses has no filter tabs.** Every candidate filter is another screen's question | §1.4 | Adding one, and accepting that the register becomes a sixth lens |
| 10 | **Fuel & tyres shows the answer on the row** so that a bus row which cannot link is still useful | §3.1 | — this one should not be reversed; it closes a recorded dead end |

---

## 10. The three specifications most likely to be wrong

1. **The one cost basis will erode, and the most likely place is a per-km label.** I have been
   careful: Buses carries no per-km figure, Fuel & tyres says "Diesel cost per km", Money says
   "Running cost per km". But three screens now carry rupee-per-something numbers with three
   different scopes, and the pressure to put "₹/km" on a bus — where the question "what has it
   cost?" is actually asked — will be constant. The honest reading is that §1.2's rule holds only
   as long as somebody is enforcing it; the grep for "cost per km" in the Buses screen layer is
   the cheapest enforcement I can offer and it is not much. **If a sixth basis appears, it will
   appear here.**

2. **The Store catalogue at desk is specified at 864px from arithmetic, against a budget nobody
   has measured, for a list twelve times larger than the budget covers.** Three guesses compound:
   the foundation's 250 ms came from a developer's Mac (`DECISIONS.md §9`); its rail leaves 864px
   which it sized from character counts and has not seen (`§8.2` item 2); and I am putting 2,384
   windowed rows through both. Each is defensible alone. Together they mean the single most-used
   list in the product rests on a stack of extrapolations. §8 item 5 says what reading would
   settle it, and §2.5 says what gets dropped if the reading is bad — the badge, then the figure.
   **It is the thing I would measure first.**

3. **The 1.5–12 km/l plausibility band may reject real fills, or pass the bug it exists to
   catch.** It is the load-bearing number in the ₹45,000/km defence, and it is a guess with
   arithmetic rather than a reading. If this operator's coaches genuinely return 1.2 km/l on a
   mountain route, the band silently hides their mileage under "Readings to check" — which is a
   quieter failure than the bug but still a failure, and nobody would report it, exactly as no
   mechanic reported a month-long dead end (`8db78e7`). The cases around it (1, 2, 3, 4, 6) are
   structural and need no threshold, so the rule survives a wrong band; what does not survive is
   the confidence. **One query over the `fuel` store — the median and spread of computable
   km/l — replaces it with a measurement, and it should be run before stage 3 writes this
   screen.**

---

**Written to:** `docs/v2/plan/screens-assets.md`
**Specifies:** Buses (#5), Store (#6), Fuel & tyres (#10) — 3 of the 12 screens in
`v2-ux.md §4.1`.
**New tokens:** 0. **New icons:** 0. **New primitives:** 0. **New record fields:** 0.
**New stores:** 0.
**Gate:** `python3 scripts/check-floor.py v2 ui` green, 10 files.
**Carried back to stage 1:** §9, ten decisions.
**Carried back to the foundation:** §8, six gaps.
**Blocking for stage 3, not for the other nine screens:** the office-PC reading with 2,384 rows
(§8 item 5); whether `_guard_write` accepts a create-at-verified job card, which decides whether
§1.8 (b) is a correction or a precaution; and the median km/l query behind §3.5's band.

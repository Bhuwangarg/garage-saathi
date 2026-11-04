# Garage Saathi v2 — the work and crew screens

Stage 2b of the pipeline (`docs/v2/PIPELINE.md`). Three of the twelve screens of
`docs/v2/plan/v2-ux.md §4.1`: **#3 Jobs**, **#4 Job card**, **#9 Duty board**. It
contains the mechanic's two one-tap writes, which `DECISIONS.md §6` and §13 name as the
justification for the whole redesign, and the second-signature state that
`DECISIONS.md §10` created.

**What this document consumes and does not change.** `v2-foundation-ui.md` is final and
is the material: thirty-three tokens, eight primitives, thirty-four marks, the motion
ladder, the voice. Nothing below adds a token, a colour, a mark or an animation. Where
the foundation specifies a state (§3.8 is the whole of the second signature), this
document points at it and repeats its copy verbatim rather than paraphrasing. One gap
in the foundation is named in §9.3 rather than filled here.

**Where the files live.** `DECISIONS.md §14`, taken after the foundation was written:
v2 holds its own copy of the design system at `v2/ui/`. So every reference below is to
`v2/ui/tokens.css`, `v2/ui/components.css`, `v2/ui/states.js`, `v2/ui/overlay.js`,
`v2/ui/icons.js`, and the new files the foundation asks for land beside them
(`v2/ui/photos.js`, `v2/ui/nav.js`, `v2/ui/words.js`). The three new tokens are already
in `v2/ui/tokens.css`. Each of these three screens gets **one** screen-level stylesheet
(`v2/ui/work.css`), the way `login.css` does it, keeping the `[data-v2]` prefix and
sizing from tokens — that is §7.2 permission 2 and it is the only new CSS this document
asks for.

**Read before building from this:** `v2-ux.md §3.1`, `§3.2`, `§3.3`, `§3.6`, `§4.1`
rows 3, 4 and 9, `§4.3`, `§6`; `v2-foundation-ui.md §2`, `§3.1`–`§3.8`, `§5`, `§6`;
`DECISIONS.md §6`, §8, §10, §12, §13, §14; `inventory/02 §4.4` (the server's write
matrix, which decides what every button below is allowed to do);
`inventory/03 §3.1` (the `jobcards` shape) and `§3.8` (the `gatechecks` state machine).

**Gates run at the end of this document, green:**
`python3 scripts/check-floor.py v2 ui` -> within the Chrome 109 floor.

---

## 1. Tokens, primitives and marks used

### 1.1 Tokens — all existing, none added

| Group | Names used on these three screens | Where |
|---|---|---|
| Ink | `--ink`, `--ink-dim` | Every row title, every `.sub`, every label, every table head, the gap words under a time |
| Surface | `--surface`, `--surface-raised` | `--surface` is the page; `--surface-raised` is every `.card`, every sheet panel, every field, every photo tile's backing |
| Edge | `--line` | The row hairline (inset shadow, no height), card and field borders, the tab strip, the check panel's sticky header edge |
| Accent | `--accent`, `--accent-ink`, `--accent-text` | `--accent` fills the one next step and every focus ring; `--accent-ink` is the text on it and, at 0.25, the hold bar's overlay (§5.4); `--accent-text` is the selected filter tab and `.btn-quiet` |
| Status | `--ok`, `--warn`, `--bad` | The Jobs row's lead mark, the close-gate line, the four-times rows, released / waiting / held on Duty board, all three badge kinds, all three toast kinds. **Never alone** — every one carries a word and a mark |
| Type | `--font`, `--font-hi`, `--lh` | `--font-hi` carries Devanagari; `--lh` is 1.7 there and is why a desk row is one line (foundation §2.1) |
| Space | `--s1`..`--s8` | Every gap and pad. `--s8` is the sheet's enter distance |
| Density | `--tap`, `--row-h`, `--pad`, `--t1`..`--t6` | Foundation §2 |
| New-in-foundation | `--nav-h`, `--thumb`, `--rail-w` | `--nav-h` is the bottom bar and each screen's bottom scroll padding; `--thumb` is every photo tile on all three screens; `--rail-w` is the desk rail's width and each screen's `padding-inline-start` at desk and >= 1024px |

Literals used, all legal: radius **8px** on controls and photo tiles, **12px** on
panels and cards, **999px** on pills; durations **120 / 150 / 180 / 200 / 250 ms**, plus
the one **1500 ms linear** of the hold (foundation §5.7); `px` only inside `border`,
`outline` and `box-shadow` values.

**`₹` is used as a prefix on money, never as `figure()`'s `unit`.** `unit` renders
*after* the number (`figure-u`), and "45,000 ₹" is not how anybody here reads it. So
money is passed through `figure`'s `format` function as `'₹' + groupIndian(v)` and the
unit is left empty. U+20B9 is outside every range `check-floor.py` treats as emoji and
the live app already draws it sixty times, so it renders on the office PCs today.

### 1.2 Primitives used

| Primitive | Foundation | Used here for |
|---|---|---|
| List row `.v2row` | §3.1 | Jobs' cards, the four times, parts, part requests, old-part returns, tonight's buses, the three seats, the duty-log lookup |
| Ranked row `.v2row.v2row-why` | §3.4 | **The Job card's one-next-step slot** — the only consumer of it outside Attention and Money |
| Sheet | §3.2 | One time, one part request, one issue, one seat, one duty-log lookup, the ledger behind a part, the gate pass |
| Number entry `.num` | §3.3 | The odometer, a part-request quantity. `data-kind="whole"` for both |
| Photo `.photos` | §3.5 | Before and after on the Job card, the three check-item photos and the driver's photo on Duty board |
| Filter | §3.6 | Jobs' four views, Duty board's two |
| Nav | §3.7 | Bottom bar at yard, left rail at desk. Not re-specified here |
| Second-signature state | §3.8 | §3.12 below, verbatim |
| `.card`, `.btn`, `.badge`, `.table`, `.tabs`, `.field` | `components.css` | Throughout |
| `emptyState / errorState / offlineState / skeleton / figure` | `states.js` | Every state table below |

### 1.3 Marks used, with the screen that consumes each

`job`, `bus`, `clock`, `person`, `part`, `camera`, `doc`, `ok`, `bad`, `warn`, `add`,
`edit`, `delete`, `back`, `filter`, `search`, `map`, `seat`, `gate`, `me`, `count`.
Twenty-one of the thirty-four, every one already drawn and already with a consumer in
foundation §4.1. **No mark is added.** The cap is reached (§4.4 there) and these screens
do not reach for a twenty-second idea: a two-way answer on a check item is two words and
two buttons, not two new glyphs.

---

## 2. Screen 3 — Jobs

> "What is standing in the yard, for how long, and has it been started?"

Readers: supervisor and owner (the whole board); store (read); **mechanic, narrowed to
their own cards in the query**. Declares `viewJobs` (`v2-ux.md §4.3`).

The card's contents are not on this screen. A row answers three things — which bus,
how long, started or not — and the fourth tap opens #4.

### 2.1 Phone (yard density, 360px up)

One scrolling column, `--pad` side padding,
`padding-bottom: calc(var(--nav-h) + env(safe-area-inset-bottom))`.

| Order | Element | Token / primitive | Real content |
|---|---|---|---|
| 1 | Screen title | `h1` at `--t3`, `--ink`, `margin-block-end: var(--s1)` | "Jobs" |
| 2 | Freshness line | `.sub`-weight line, `--t6` `--ink-dim`, holding `figure(openCount, {at: lastPullAt})` | "14 standing · Updated 4 minutes ago" |
| 3 | New job | `button.btn.btn-primary` carrying `icon('add')`, full width, `min-height: var(--tap)` | "New job card" |
| 4 | Filter strip | `.tabs role="tablist"`, four tabs, horizontally scrollable, `min-height: var(--tap)` | "Open" / "Completed" / "Away for repair" / "Mechanic workload" |
| 5 | The list | `button.v2row` per card, `gap: 0` (the hairline separates) | below |
| 6 | Cap line, when capped | `--t6` `--ink-dim`, one line, `padding-block: var(--s3)` | "200 of 341 shown, oldest first. Use a filter to narrow this." |

**The row, exactly:**

- `.lead` — `icon('job', {size: 20})`, coloured by state and nothing else:
  `--bad` when the card is not started and has stood **more than 48 hours**, `--warn`
  when not started and under 48, `--ink-dim` when started. A coloured mark, not a
  coloured tile (foundation §3.4).
- `.t` — `--ink` at 600: `"RJ09PA6126 — Brake overhaul"`. Truncates with an ellipsis;
  the grid is `auto minmax(0, 1fr) auto`, so a long fault never shrinks the figure.
- `.sub` — `--t6` `--ink-dim`, one line, truncating: `"Ramesh — brake shoes · not started"`,
  or `"Ramesh — brake shoes · started 10:42"`, or `"Nobody on it yet"`.
- `.act` — exactly **one** control at yard: `figure(idle, {format: idleWords})`.
  `idleWords` gives `"20 h"` under 48 hours and `"3 d"` over, so the number is never
  `"72 h"`. No `at` inside the row — the list states its freshness once, at line 2
  (foundation §2.3 rule 4).

**Order** is `enterAt` ascending, nulls last and flagged: a card with no `enterAt` sorts
to the end of the Open list with `.act` = `figure(null)` (the dash, not a 0) and
`.sub` = `"Enter time not recorded"`. "Unknown" and "zero" must never look alike.

**Mechanic workload** is not a list of cards, so the tab swaps the list for one
`button.v2row` per mechanic: `.lead` = `icon('person', {size: 20})`,
`.t` = `"Ramesh Kumar"`,
`.sub` = `"3 open · 1 rework · 2 days average turnaround"`,
`.act` = `figure(openCount)`. **Three numbers, never blended into one score** —
[E] `38e1914`: "who should take this job" is not a question one score answers. Tapping
opens that mechanic's cards as the Open list pre-filtered, not a scorecard.

### 2.2 Desk (desk density, >= 1024px)

Same markup, `data-density="desk"` on the page element, left rail, so
`padding-inline-start: var(--rail-w)` and
`padding-bottom: calc(var(--pad) + env(safe-area-inset-bottom))`.

- `--row-h` 32px, one line, `.sub` **not rendered** (foundation §2.1: a two-line desk
  row is 49.3px in Hindi and breaks windowing's only assumption). What the `.sub` said
  moves into `.act`.
- `.lead` — `icon('job', {size: 16})`, same colour rule.
- `.t` — `"RJ09PA6126 — Brake overhaul"`.
- `.act` — up to **three**: `figure(idle, {format: idleWords})`, then
  `<span class="badge badge-warn">` with `icon('clock')` + `"Not started"` (or
  `badge-ok` + `icon('ok')` + `"Started"`), then `a.btn.btn-quiet` `"Open"`.
  The row itself is the target too; the button exists because a 32px row is a small
  thing to hit with a mouse and the office reads with a mouse.
- The mechanic's name is **not** on a desk row. It is behind the Mechanic workload tab,
  which at desk is a `.table` — reg, fault, idle, carried by, started — because that is
  the one place density pays and the office reads tables.

Mechanic workload at desk: `.table`, `td.fig` right-aligning each of the three numbers,
one `tr` per mechanic, head row `--ink-dim` at `--t6`.

### 2.3 The mechanic's own-cards rule — the thing that leaked

`inventory/02 §6.2`, `viewJobDetail` (`c5c11a1`): *`mine` was computed and never
enforced*, and a mechanic opened another mechanic's card and completed a part request on
it. So this is specified as a data rule, not a view rule (`v2-ux.md §4.3`: "mechanic
narrowed to own cards in the query, not the view"):

1. The list builder takes the signed-in person and, when `role === 'mechanic'`, returns
   only cards where that person's id is in `assignees[].userId` **or** equals
   `assignedTo`. The filter is inside the function that produces the array, before any
   markup exists.
2. **The Mechanic workload tab is absent for a mechanic.** Not empty, not showing only
   themselves: absent. It answers "who should take this job", which is not a mechanic's
   question, and showing it with one row tells them it is a list of their colleagues
   with the colleagues removed.
3. A mechanic's filter strip is therefore three tabs, and the Completed tab is also
   narrowed to their own.
4. The server already narrows nothing on read (`inventory/02 §4.6`: `viewJobs` is
   client-only on the read side). **So this is a curtain until the server's read
   boundary moves**, which `v2-ux.md §4.3` calls stage 3's single largest security item.
   Said here so nobody reads the three rules above as a boundary.

### 2.4 The nine states

| State | Specification |
|---|---|
| **loading** | `skeleton(8)` in place of the list. The title, the freshness line, the New job button and the filter strip draw **first**, from no data (foundation §3.6: the strip draws immediately with its counts as `figure(null)` — a dash, not a 0). The freshness line reads `"Loading"` with no count |
| **empty** | Per filter, named, never "No data". Open: `emptyState('Nothing standing in the yard', {icon: 'ok', hint: 'Every bus is on the road.'})`. Completed: `emptyState('No cards completed yet', {icon: 'job'})`. Away for repair: `emptyState('No cards away for repair', {icon: 'map'})`. Workload: `emptyState('No mechanics on the roll', {icon: 'person', hint: 'Add people in People.'})`. A mechanic's own Open list: `emptyState('No cards for you', {icon: 'ok', hint: 'The supervisor will put your name on one.'})` |
| **one item** | No special case, and deliberately so: one row, the same row. No "1 result" line, no centring, no grid collapsing to a card. A list that changes shape at one item teaches the reader that one is unusual, and on a good day one is the target |
| **far too many** | **Yard caps, desk windows**, and the reason is foundation §2.3 rule 6: windowing needs a height it can compute without measuring, and a windowed list may only use the one-line row. At yard the row is two lines on purpose, so over **200** cards it draws 200 oldest-first and ends with the cap line in §2.1 order 6. At desk the row is already one line, so over 200 it windows on `rows x var(--row-h)` and the cap line is not drawn. The measured ceiling behind both numbers is the placeholder in foundation §2.2, and `DECISIONS.md §9` says so |
| **error** | `errorState('Could not load the job board', retry)`. The title, the freshness line and the filter strip **stay**: losing the filter with the data strands the person on a screen they cannot leave by filter (foundation §3.6). The freshness line reads `"Last loaded 2 hours ago"` if there was an earlier load, otherwise it is not drawn |
| **offline** | The list **keeps its rows** — they are from the local database and they are real; only their age is in question. The freshness line becomes `"14 standing · No connection since 06:40"` with `icon('offline')`. `offlineState()` replaces the list only when there is no local data at all. **New job still works**: a card is a local write (`inventory/02 §4.4`, `jobcards`) and creating one offline is most of what this app is for |
| **half-finished** | A card created with a bus and a fault and nothing else is a **real row**, because `v2-ux.md §3.1` step 4 creates the card on the first screen so an interrupted entry leaves a card and not a draft ([E] `4f0691e`). It reads `.sub` = `"Nobody on it yet"` and `.act` = `figure(null)` when `enterAt` is missing. There is no draft state and no "finish this entry" badge: the row is the card, and #4 says what it still needs |
| **two people editing** | Jobs writes nothing except a new card, so there is no edit conflict here — but it **displays** conflicted data, and that is a state. Two devices that both created a card for the same bus produce two rows with two ids, which is correct and must not be de-duplicated: they are two cards and somebody has to merge them by hand. What the screen owes the reader is the freshness line (order 2) and nothing more. It must never draw a count as current when `lastPullAt` is unknown — `figure(count, {at: null})` renders "Updated time unknown", which is the honest output |
| **no permission** | Jobs is **absent** from the nav for a role without `viewJobs`, and the route refuses. No disabled tab, no "you cannot see this" screen (foundation §3.7: a tab a role does not hold is absent). Within the screen, the two row-level cases are in §2.3: the Workload tab is absent for a mechanic, and the New job button is absent for a role without `addJob` — which today is everybody except owner and supervisor, **and the server also lets `store` create a card** (`inventory/02 §4.4`, "where the server is looser"), so the client is the only thing stopping a storekeeper, and that is worth knowing rather than relying on |

### 2.5 Controls

| Control | Does | Pressed | Focus | Disabled | While working |
|---|---|---|---|---|---|
| `button.v2row` (a card) | Opens #4 for that card | `scale(0.97)`, 120 ms `ease-out` | `outline: 2px solid var(--accent); outline-offset: -2px` — inside the edge, because a list clips an outer ring | Never disabled. A card this person may not open is not drawn | Nothing. It is a route change and the budget for it is 250 ms total; an animation spends the budget it hides (foundation §5.8) |
| `.btn-primary` "New job card" | Opens the new-card sheet | `scale(0.97)`, 120 ms | ring at `outline-offset: 2px` | Absent, not disabled, without `addJob` | `aria-disabled="true"`, label `"Saving..."`, on the sheet's save button — not on this one |
| `[role="tab"]` (a filter) | Changes what is drawn. **Never pushes a route and never writes** — a back press must leave the screen, not walk back through filters (foundation §3.6) | `scale(0.97)`, 120 ms | ring at `outline-offset: -2px` | A filter that would return nothing is still shown; its emptiness is the answer | Nothing. It is local |
| `a.btn-quiet` "Open" (desk only) | Same as the row | `scale(0.97)`, 120 ms | ring at `outline-offset: 2px` | Never | Nothing |
| The new-card sheet's fields | Bus (`.select`), fault (`textarea.field`), priority (`.select`), crew (`.select`, multiple rows), odometer (`.num`, `data-kind="whole"`) | Fields are not pressed, they are focused | `outline: 2px solid var(--accent); outline-offset: 2px` | The odometer is never pre-filled with 0 (foundation §3.3) | The save button carries it |

The sheet's odometer error names the number and never blames the reader:
`"Lower than the last reading, 48,210 km"` ([E] `927864c`, forward-only), as
`aria-invalid="true"` plus the words plus the `--bad` edge. Never colour alone.

---

## 3. Screen 4 — Job card

> "What is the state of this one repair, and what is the one next step?"

The most important screen in v2 and the one `DECISIONS.md §13` says is justified by an
unmeasured estimate. Readers: supervisor (owns it), mechanic (two taps), owner (verify,
move, delete), store (parts). Declares `viewJobs`; `mayCloseJob` to close; `verifyJob`
**plus the per-record rule `closedBy !== me.id` for every role**; `deleteJob` and
`changeJobBus` owner-only.

### 3.1 The one rule this screen must not bend, and the one shape it must not invent

- **Nobody signs off their own close.** Every role, the owner included
  (`DECISIONS.md §10`). Foundation §3.8 is the whole specification and §3.12 below
  repeats it rather than restating it.
- **Four empty time fields presented as a form is forbidden** (`v2-ux.md §4.1` row 4).
  The card asks for **one** time, in its own sheet, from the row that is missing it.
- **No new field.** Every write below lands in a field that exists in
  `inventory/03 §3.1`: `enterAt`, `startAt`, `completeAt`, `outAt`, `odometer`,
  `partsUsed`, `partRequests`, `coreReturns`, `beforePhotos`, `afterPhotos`,
  `externalVendor`, `externalCost`, `status`, `closedAt`, `closedBy`, `verifiedBy`,
  `verifiedAt`. Under whole-record last-write-wins a field v2 invents is erased the next
  time a v1 device writes the card (`v2-ux.md §6`).
- **This screen is not two people editing one record** (`v2-ux.md §6`). The division of
  fields is the only reason it is safe on the existing protocol: the supervisor owns the
  card, the mechanic's two taps write two fields nobody else writes, the storekeeper's
  issue writes `partsUsed` — the one field the server merges. §3.13 "two people editing"
  specifies what the screen does when the division is broken anyway.

### 3.2 The reading order, phone (yard)

One scrolling column, `--pad` sides,
`padding-bottom: calc(var(--nav-h) + env(safe-area-inset-bottom))`. Order is the
specification: a person in a hurry reads downward and must hit the answer in the first
screenful.

| Order | Block | Primitive | Real content |
|---|---|---|---|
| 1 | Header | `a.btn.btn-quiet` with `icon('back')`, then `h1` `--t3`, then a status `.badge` | "Back" · "RJ09PA6126" · `badge-warn` + `icon('clock')` + "Waiting for sign-off" |
| 2 | Freshness | `--t6` `--ink-dim` line with `icon('clock')` | "Showing what this phone received 4 minutes ago" |
| 3 | **The one next step** | `.v2row.v2row-why`, or a `.btn-primary` in the same slot — §3.4 | "Add the two after photos" |
| 4 | **The close gate** | `div.v2row`, unpressable | "To close: 2 photos before, 2 after" / "2 before taken, 2 after still needed" |
| 5 | Fault and priority | `.card`, `--t4` title, `--t5` body | "Brake overhaul" · `badge-bad` + "High priority" |
| 6 | Crew and their tasks | `.card` holding one `div.v2row` per assignee | "Ramesh Kumar — brake shoes" |
| 7 | **The four times** | `.card` holding four rows with the gaps between them — §3.6 | below |
| 8 | Odometer | `.card` holding one row, or the `.num` when it is being entered — §3.8 | "48,210 km · read when the bus came in" |
| 9 | Parts down | `.card`, one `div.v2row` per line, ledger behind each — §3.9 | "Brake shoe set x2 · ₹3,400" |
| 10 | Part requests | `.card`, one row per request + the request control | "Brake shoe set x2 — waiting at the store" |
| 11 | Old parts returned | `.card`, one row per `coreReturns` line with its thumbnail | "Brake shoe set — worn, photographed 11:20" |
| 12 | Photos | `.card` holding two `photoGrid`s — §3.10 | "Before (2)" / "After (0)" |
| 13 | Outside vendor | `.card`, present only when `externalVendor` is set, with the gate pass — §3.11 | "Sharma Auto Electric · ₹2,100 · Gate pass 184" |
| 14 | The card's own actions | A column of `.btn`s, each absent when not held | "Close this card" / "Sign off" / "Move to another bus" / "Delete this card" |

Blocks 5 to 13 are **cards, not one long list**, because each is a different kind of
thing and a hairline between a fault and a photo says they are the same kind. Cards use
the 12px radius and `--surface-raised`, `gap: var(--s3)` between them.

**A mechanic sees blocks 1, 2, 3, 5, 6, 7, 9, 10, 12 and nothing else.** No close
button, no verify control, no odometer entry, no delete, no move, no vendor block, no
labour hours. `v2-ux.md §3.2`: everything else on a mechanic's card is read-only.

### 3.3 Desk

`data-density="desk"`, left rail, `padding-inline-start: var(--rail-w)`. The column
becomes **two**, because 864px of content on a 1024px screen is two 420px columns with
a `--s4` gutter, and the office reads a card with a mouse and a keyboard:

- **Left column**: blocks 3, 4, 5, 6, 7, 8 — the state of the repair.
- **Right column**: blocks 9, 10, 11, 12, 13 — what went into it.
- Blocks 1, 2 span both; block 14 is a single row of buttons under both, right-aligned.
- The rows inside the cards go to one line (`--row-h` 32px), and the gap words that sat
  in a `.sub` at yard move into `.act` as a second item. The four times are the one
  exception and keep two lines: see §3.6.
- Two columns is a `grid-template-columns: 1fr 1fr` on the content element, guarded by
  `@media (min-width: 1024px)` alongside the rail's own guard, so a supervisor opening
  the desk screen on a 360px phone (which `000c3dd` says happens) keeps one column and
  the bottom bar.

### 3.4 The one next step — every reader, one row

**One**, for whoever is looking. Not a list of three. The slot is foundation §3.4's
ranked row, which is the only reason that primitive exists outside Attention: a next
step with no reason attached is a button, and a button that does not say why is how the
old app got forty-seven screens.

| Who is looking | Card state | The slot holds |
|---|---|---|
| Mechanic on the crew | `startAt` null | **`.btn-primary` "I have started"** — §3.5 |
| Mechanic on the crew | `startAt` set, `completeAt` null | **`.btn-primary` "I am done"** — §3.5 |
| Mechanic on the crew | both set | `div.v2row`, no press, `icon('ok')` in `--ok`, `.t` = "Your work is recorded", `.sub` = "Done 15:30. The supervisor closes the card." |
| Supervisor / owner | `enterAt` null | `button.v2row`, `icon('clock')` in `--warn`, `.t` = "Add the enter time", `.sub` = "When did this bus come into the yard?" Opens the one-time sheet |
| Supervisor / owner | nobody on the crew | `button.v2row`, `icon('person')` in `--warn`, `.t` = "Put somebody on this job", `.sub` = "Nobody is carrying it yet." Opens the crew sheet |
| Supervisor / owner | a part request is waiting | `div.v2row`, no press, `icon('part')` in `--warn`, `.t` = "Waiting for a part", `.sub` = "Brake shoe set x2, asked for at 09:15. The store issues it." |
| Supervisor / owner | photos short of the gate | `button.v2row`, `icon('camera')` in `--warn`, `.t` = "Add the two after photos", `.sub` = "The card cannot be closed without them." Scrolls to block 12 |
| Supervisor / owner | gate met, `status` not `done` | `.btn-primary` "Close this card" |
| **The person who closed it** | `status` `done` | `div.v2row`, **no press, no link**, `icon('clock')` in `--warn`, `.t` = **"Waiting for sign-off"**, `.sub` = **"Somebody else has to check this card. You closed it."** |
| Somebody else who may verify | `status` `done` | `.btn-primary` **"Sign off"** |
| Anybody who may not verify | `status` `done` | `div.v2row`, no press, `icon('clock')` in `--warn`, `.t` = "Waiting for sign-off", `.sub` = **"Waiting for a supervisor or the owner to check it"** |
| Anybody | `status` `verified` | `div.v2row`, no press, `icon('ok')` in `--ok`, `.t` = "Finished and signed off", `.sub` = "Closed by Ramesh 14:20, signed off by the owner 18:05." |
| Store | a part request is waiting | `.btn-primary` "Issue the part" — opens the issue sheet with **this** card chosen and **never** pre-selected from a list ([E] `d738a6e`) |

The last four rows of that table are foundation §3.8 and its copy is quoted, not
rewritten. §3.12 carries the rest of it.

**The resolution order is fixed, so two readers never see two different "one" steps for
the same reason:** the mechanic's rows first (they are role-exclusive), then closed /
verified state, then enter time, then crew, then part request, then photos, then close.
The first match wins and nothing below it is drawn.

### 3.5 The mechanic's two taps — the whole justification, specified

`DECISIONS.md §6`: exactly two one-tap writes, `startAt` and `completeAt`, on fields
that already exist and that the server already permits a mechanic to write
(`inventory/02 §4.4`: `jobcards` writers include `mechanic`; the mechanic must be on
the card's crew, cannot create, delete or close). No new capability, no server change,
no record-shape change.

**The reader.** Dirty hands, possibly gloved, in a pit, on a cracked phone, in bad
light, in a hurry, maybe reading Hindi only. So:

1. **It is the one next step**, in slot 3, above everything else on the card. They do
   not scroll to find it.
2. **One button on screen, never two.** "I am done" does not exist until `startAt` is
   set. A mechanic can never be looking at two buttons and choosing.
3. **The target.** `button.btn.btn-primary`, full width of the content column,
   `min-height: calc(var(--tap) + var(--s2))` — 56px at yard, 40px at desk. It is the
   largest control on the screen and it is the only `--accent` fill on it, so it is the
   only orange thing a thumb can land on.
4. **The label is a sentence the person would say out loud**, which foundation §6.1
   requires: **"I have started"** and **"I am done"**. Not "Start", not "Mark started",
   not "Update status". Seven words is the ceiling; these are three and four.
5. **The label carries `icon('ok', {size: 20})`** to its left. Not a play triangle,
   which is not in the set and would be a thirty-fifth mark.
6. **No confirmation dialog.** A confirm is a second tap, and foundation §5.3 says a
   confirmation exists for a destructive question. This is neither destructive nor
   irreversible: `"I am done"` is a claim, not a close (`v2-ux.md §3.2` step 3), the
   supervisor owns the four times and can retype any of them, and the card still cannot
   be closed by the mechanic or by the server.
7. **The handler is idempotent and the button cannot be double-written.** On the first
   tap: the handler returns immediately if the field is already set; it stamps
   `Date.now()`; it sets `aria-disabled="true"` and the label to `"Saving..."` for the
   in-flight window; then it replaces the button **in place** with the row in step 8.
   On a Core 2 Duo a person taps twice, and the second tap must land on something that
   does not write. The replacement is not pressable, so it cannot.
8. **What they see after tapping**, in this order, all of it inside the 100 ms
   tap-to-response budget because the write is to the local database and the sync is a
   later, zero-main-thread tick (foundation §2.2):

   - The press itself: `scale(0.97)`, 120 ms `ease-out`. This is the one animation the
     product cannot do without (foundation §5.1) and it is the first thing that says the
     tap landed.
   - The button becomes a `div.v2row` in the same slot: `.lead` = `icon('ok')` in
     `--ok`, `.t` = **"Started 10:42"**, `.sub` = **"Saved on this phone. Tell the
     supervisor if the time is wrong."** Unpressable, not focusable, not in the tab
     order.
   - `V2.toast('Started 10:42', {kind: 'ok'})` — enter `translateY(var(--s2))` to none
     plus opacity, 200 ms (foundation §5.5). The toast exists because the row is in the
     place the button was, and a replacement in place can read as a redraw.
   - Block 7's **Start** row fills with "10:42" and the **Enter to Start** gap
     recalculates to "Waited 3 h 20 m before work started". The gap words are the proof
     the write landed somewhere real, not just in a message.
   - The one-next-step slot then resolves again (§3.4) and, after "I have started",
     holds **"I am done"**. After "I am done", it holds the read-only "Your work is
     recorded" row. The mechanic is never left looking at a card with no state.
   - The nav's **Me** tab label gains a count while the record is unsent: `"Me (1)"`
     (foundation §3.7). Not a coloured dot. Me names what is waiting and why.

9. **There is no undo and no correction control for a mechanic**, and the copy says who
   fixes it instead: *"Tell the supervisor if the time is wrong."* This follows
   `v2-ux.md §3.2` ("everything else on a mechanic's card stays read-only") and it is
   the specification I am least sure of — §9.4 item 2.
10. **Offline is the normal case, not an error state.** Both writes are local
    (`inventory/02 §4.4`). The button does not change, the toast does not change, and
    nothing says "could not send". What says it is the Me count in step 8 and Me itself.
11. **Hindi.** Both labels, both stamped-row lines and both toasts need Hindi values
    before this screen can be built, and **a missing Hindi value is a build error, not
    an English fallback** (foundation §6.3). These are the two buttons `v2-ux.md §6`
    moved the Hindi risk onto when Trip cash went, so they are the first strings the
    owner is asked for, not the last. Ids in §6.3 below.
12. **The write, exactly.** Read the stored card, set the one field, put the card back,
    mark it dirty. Nothing else on the record is touched — not `updatedAt`'s meaning,
    not `assignees` (the server carries those over from the stored card for a mechanic
    whatever the push says, `inventory/03 §5`), not `status`. `"I am done"` does **not**
    set `status = 'done'`: `done` is a close and a close needs owner or supervisor and
    the photo gate. A mechanic's push that set `status` would be refused by the server
    and the client must not send it.

### 3.6 The four times and the gaps between them

A `.card` holding four rows. The gap is the information — a bus that waited eleven hours
before anybody touched it is the finding, and four bare timestamps hide it.

| Row | Lead | `.t` | `.sub` (yard) / `.act` second item (desk) | `.act` |
|---|---|---|---|---|
| Enter | `icon('clock')` `--ink-dim` | "Came in 07:20" | — | `.btn-quiet` "Change" (supervisor, owner) |
| Start | `icon('clock')` | "Work started 10:40" | "Waited 3 h 20 m before work started" | `.btn-quiet` "Change" |
| Done | `icon('clock')` | "Work finished 15:30" | "Worked 4 h 50 m" | `.btn-quiet` "Change" |
| Out | `icon('clock')` | "Left the yard 16:10" | "Stood 40 m after the work was done" | `.btn-quiet` "Change" |

- **A missing time is not an empty field.** The row becomes a `button.v2row`:
  `.lead` = `icon('clock')` in `--warn`, `.t` = "Enter time — not recorded",
  `.sub` = "Tap to add it", `.act` = `figure(null)`. Tapping opens **one** sheet with
  **one** field. That is how "the card asks for one time, not four"
  (`v2-ux.md §3.1` step 3) is enforced at the markup level: there is no element on this
  screen that is four time inputs.
- **The one-time sheet.** `V2.openSheet('Enter time', html)` with a single
  `input type="time"` (`.field`, `enterkeyhint="done"`) and a day shown as read-only
  text from `jobDate`, then `.btn-primary` "Save". `type="time"` is inside Chrome 109 and
  gives the office PC a keyboard entry and the phone a wheel, which is the right split
  without a line of script. A time later than now on `jobDate` is an error in words:
  "That is later than right now, 16:48."
- **A gap that cannot be computed says so.** If `startAt` is set and `enterAt` is not,
  the Start row's gap line reads "Enter time not recorded, so the wait is unknown" —
  never a dash presented as zero wait.
- **A negative gap is a finding, not a format error.** Device clocks differ
  (`inventory/03 §4`: the client uses the device clock), so `completeAt` before
  `startAt` happens. The row reads, in `--warn`: "Finished before it started — one of
  these times is wrong." It does not silently reorder them and it does not refuse to
  draw.
- **At desk the times keep two lines**, which is the one exception to foundation §2.1's
  one-line desk row. It is legal (that rule exists to keep windowing's row height
  computable, and this is four rows inside a card, never windowed) and it is necessary:
  the gap words are the reason the block exists.
- **"Change" is absent for a mechanic** on all four rows, including the two they wrote.
  §3.5 item 9.

### 3.7 The close gate, visible from the top

`v2-ux.md §3.1` step 6: the gate is visible from step 2 so it is never a surprise at the
end — *"once the part is off the bus you can never take it again"*. The server enforces
it (`inventory/02 §4.4`: closing `done` needs owner or supervisor **and** before+after
photos, or a vendor bill).

Block 4, a `div.v2row`, unpressable, directly under the one next step:

| Gate state | `.lead` | `.t` | `.sub` |
|---|---|---|---|
| Not met | `icon('camera')` in `--warn` | "To close: 2 photos before, 2 after" | "2 before taken, 2 after still needed." |
| Not met, no photos at all | `icon('camera')` in `--warn` | "To close: 2 photos before, 2 after" | "None taken yet. A vendor bill can stand in for them." |
| Met by photos | `icon('ok')` in `--ok` | "Ready to close" | "2 before, 2 after. The photos are on the card." |
| Met by a vendor bill | `icon('ok')` in `--ok` | "Ready to close" | "The vendor bill stands in for the photos." |
| Already closed | not drawn | — | — |

Two photos each is this document's number, and it is the number the copy states. The
server's rule is "before and after" without a count; two is what makes a before and
after legible on a brake job and it is what the gate line promises, so the client must
not accept one and then say "Ready to close".

### 3.8 Odometer

One row in a `.card`: `.t` = "48,210 km", `.sub` = "Read when the bus came in",
`.act` = `.btn-quiet` with `icon('edit')` "Change", which opens a sheet holding one
`.num` (`data-kind="whole"`, `inputmode="numeric"`, `pattern="[0-9]*"`).

- **Never pre-filled with 0.** A default 0 on an odometer is a wrong reading nobody
  typed (foundation §3.3), and 0 is a real value here — `inventory/03 §3.2` says all 89
  seeded buses carry 0 until capture, and `§3.1` says 0 means the odometer is broken.
  So: an unknown reading is `figure(null)` and the words "Not read yet"; a real 0 is
  "0 km" and the words "Odometer is broken".
- **Forward only**, with the number named: "Lower than the last reading, 48,210 km"
  ([E] `927864c`).
- **Disabled, not absent, on a verified card** — `opacity: 0.5; cursor: not-allowed`
  (foundation §3.3) — because the server freezes it and the reason is the card's state,
  not this person's role. A control that is absent says "not for you"; a control that is
  disabled with the card's badge beside it says "not any more". Those are different
  sentences and the reader needs the second one here.
- Absent for a mechanic and for store.

### 3.9 Parts, the ledger behind them, part requests, old-part returns

**Parts down** (`partsUsed`): one `div.v2row` per line. `.lead` = `icon('part')`,
`.t` = "Brake shoe set x2", `.sub` = "Issued by Suresh 11:05", `.act` = `figure(cost,
{format: rupees})`. The row **is** pressable (`button.v2row`) and opens the ledger
behind that line: `V2.openSheet('Brake shoe set', html)` listing the `ledger` rows for
this part on this card — who, when, how many, at what cost, and whether it was a reused
part. The ledger is the source the app uses to heal `partsUsed`
(`inventory/03 §3.1`), so it is the truth and the card's line is the summary; the sheet
says that in one line: "The store's ledger is what this is counted from."

- `partsUsed` is **the one field the server merges** (`_merge_parts_used`,
  `inventory/03 §5`). So this is the one block on the card that may legitimately change
  under a reader while they are looking at it. It is therefore the block whose header
  carries its own age: "Parts, as of 4 minutes ago".
- Issuing is not done from here by a supervisor: `v2-ux.md §3.1` step 5 writes the
  ledger first, then parts, then `partsUsed`, in that order, so an interruption leaves
  an issue to finish rather than stock short with nothing to explain it. The issue sheet
  belongs to Store (#6) and opens with **this card already chosen and never
  pre-selected from a list** ([E] `d738a6e`).

**Part requests** (`partRequests`): one row per request. `.t` = "Brake shoe set x2",
`.sub` by status: "Waiting at the store, asked for 09:15" (`requested`) or "Issued by
Suresh 11:05" (`fulfilled`). `.lead` = `icon('part')` in `--warn` while waiting,
`--ok` when fulfilled.

- **"I need a part" is the mechanic's third control and it is not one of the two taps.**
  It is a `.btn` with `icon('add')` at the foot of this card, opening a sheet with a
  part search (`.field` + `icon('search')`) and a quantity (`.num`). It writes
  `partRequests` only, which the server permits a mechanic to do and has no rule
  against (`inventory/02 §4.4`, "where the server is looser"). It is specified as a
  sheet and not a tap because it needs two values, and `DECISIONS.md §6` grants the
  mechanic two **one-tap** writes — a part request was never one of them.

**Old parts returned** (`coreReturns`): one row per line, `.lead` = the line's photo as
a `--thumb` tile when there is one, otherwise `icon('part')`, `.t` = "Brake shoe set",
`.sub` = "Worn, photographed 11:20 by Suresh". Pressable, opening the photo full size
through `V2.openPhoto`. Read-only on this screen for every role: a core return is a
store action.

### 3.10 Photos

Two `photoGrid` calls in one `.card`, each with its own heading at `--t6` `--ink-dim`:
"Before (2)" and "After (0)". Tiles are `--thumb` squares, `gap: var(--s2)`,
`object-fit: cover`, 8px radius, 1px `--line`. Four across at 360px
(4 x 72 + 3 x 8 = 312 <= 328), six across in a desk column.

- Each tile is a `button` opening `V2.openPhoto(src, caption)` — a sheet, never a new
  overlay kind (foundation §3.5: `overlay.js` has 100 checks behind its focus,
  scroll-lock and dismissal behaviour).
- The capture control is the last cell of each grid:
  `<label class="btn photo-add"><input type="file" accept="image/*" capture="environment" class="sr-only">` +
  `icon('camera')` + "Take photo". The label carries the ring via `:focus-within`.
- **Empty is not `emptyState()`.** It is the capture control plus the requirement in
  words: "Two photos before, two after. Needed to close this card." The gate is the
  content (foundation §3.5).
- A tile that could not upload carries `badge badge-bad` with `icon('offline')` and the
  words "On this phone only", and the grid's hint reads "Sends when there is wifi". The
  photo is **not lost** — it travels inside the record as a data URL and can be twenty
  megabytes (`v2-ux.md §6`). Do not tell the person to do anything else.
- After the card is closed the capture cell is **absent**, not disabled, and the grid
  says "Photos are fixed once the card is closed."
- Absent entirely for store. Present and read-only for a mechanic: they can look at the
  before photos, which is often what they need, and they cannot add — `v2-ux.md §3.2`
  says no photo requirement for a mechanic, and a capture control they may not use is
  not drawn.

### 3.11 Outside vendor and the printable gate pass

Block 13, drawn only when `externalVendor` is set. `.card`:
`.t` = "Sharma Auto Electric", `.sub` = "Alternator rebuild",
one row for `externalCost` as `figure(cost, {format: rupees})`, one row for the bus's
location when `outside` is true (`icon('map')`, "In Jaipur"), and one
`a.btn` with `icon('doc')` **"Gate pass 184"**.

- The pass opens as a sheet (`gatepasses`, `inventory/03 §3`): number, status out or
  returned, vendor, bus and its registration, engine and chassis numbers, the unit name
  and serial, who issued it and when, and the remark. On return it also shows the
  returned serial, whether it mismatched, the cost and the bill photo.
- **Printable** is a `@media print` block in `v2/ui/work.css`, not a second layout and
  not a window: inside the sheet, the `.btn` "Print this pass" calls `window.print()`,
  and the print block sets everything outside `.ov-panel` to `display: none`, drops the
  sheet's scrim and shadow, and prints black on white with the hairlines kept. The
  gatekeeper gets an A4 sheet with a number on it, which is what a gate pass is. No
  banned property is involved.
- Absent without `outsideJob`. The pass was one of the six recorded route bypasses
  (`inventory/02 §6.1` rows 5 and 6: the gate-pass list and a single gate pass were
  reachable by any role), so its absence here is a fix, not a styling choice.

### 3.12 The second signature

**Foundation §3.8 is the specification.** It is reproduced, not reinterpreted. What this
screen adds is only where each piece sits.

**The rule, exactly:** the verify control is **absent** when `card.closedBy === me.id`,
for every role **including the owner**. Not disabled, not greyed, not
present-and-erroring. Same deny-by-default shape as every other control a person may not
use, and the same filter the live app already has at `app.js:3019`
(`closedBy !== S.user.id`), applied to everyone instead of skipped for supervisors.

| Where | What |
|---|---|
| Block 1, the status badge | `badge badge-warn` carrying `icon('clock')` and **"Waiting for sign-off"**. Never colour alone, and **never the word "verified" on a card nobody has verified** |
| Block 3, the one next step | The four rows at the foot of §3.4's table, copy verbatim from foundation §3.8 |
| Block 14, the card's actions | The "Sign off" `.btn-primary` is **here as well as in slot 3** for the eligible second person, because block 14 is where a reader who scrolled the whole card ends up. It is the **same control**, absent under the same condition. For the closer, block 14 has no verify entry at all — no row, no greyed button, nothing |

All eight states, from foundation §3.8:

| State | On this screen |
|---|---|
| default | The badge in block 1 and the matching row in block 3 |
| pressed | Only "Sign off" presses: `scale(0.97)`, 120 ms. **The waiting row must not press** — a row that moves under the thumb and then does nothing is the feedback failure inverted |
| focus | Standard ring on the button at `outline-offset: 2px`. The waiting row is not focusable: it is not a control, so it must not be in the tab order |
| **disabled** | **The verify control is absent, not disabled.** The only thing ever *disabled* here is "Sign off" for the ~200 ms its write is in flight, via `aria-disabled="true"`, reading **"Signing off..."** |
| loading | While the card's own read is in flight, slot 3 is `skeleton(1)`. It must **never** draw "Sign off" optimistically and then take it away — on a 30-36 s cold server that is a button a person presses twice |
| empty | A card that is not closed has no second-signature state at all, and slot 3 holds its real next step (§3.4) |
| error | `V2.toast(msg, {kind: 'bad'})` and the slot returns to "Sign off". The close itself is already saved, so the message says what is still true: **"Not signed off. The card is still closed and still waiting."** |
| offline | Sign-off is a local write and works offline, so the button stays. The card's freshness line (block 2) carries the age, because **a card may already have been verified on another phone** — two people signing off one card is a conflict under whole-record last-write-wins, so the copy never says "nobody has signed this off", only **"not signed off here yet"** |

**Two gaps that are not this screen's to close, named because the control is worth what
enforces it** (`v2-ux.md §6`):

1. **The server still permits it.** `_guard_write` says the closer cannot be the
   verifier *unless the verifier is a supervisor*, so a supervisor self-verifying is a
   legal push today. Until that clause becomes `closedBy != verifiedBy` for every role,
   this is a UI convention and not a boundary — and this codebase has six recorded cases
   of a client-only rule being walked around.
2. **v1 is deliberately unchanged** (`DECISIONS.md §10`), so a supervisor who wants to
   verify his own card can open v1 and do it. Not an argument against the decision; the
   reason `v2-ux.md §7` measure 12 counts `closedBy == verifiedBy` across both clients
   rather than testing this button.

### 3.13 The nine states

| State | Specification |
|---|---|
| **loading** | Block 1's back control and `h1` draw from the route's own id. Everything else is `skeleton`: slot 3 is `skeleton(1)`, the four times are `skeleton(4)`, each other card is `skeleton(2)` inside its own heading. The headings draw — a screen that draws every heading and no data is the defect this pipeline exists to fix, and the fix is not "draw nothing", it is "say which empty this is" |
| **empty** | A card always has a bus and a fault, so the screen is never empty; its **blocks** are. Each names its own emptiness and none of them uses the word "data": parts — "No parts issued against this card"; part requests — "Nobody has asked for a part"; old parts — "No old parts returned"; photos — the requirement in words (§3.10); crew — "Nobody is carrying this job yet"; vendor — the block is absent. A card id that does not exist is `errorState('That job card is not on this phone', retry)` with a `.btn-quiet` "Back to Jobs" |
| **one item** | No special case anywhere: one part line is one row, one photo is one tile beside the capture cell, one assignee is one row. The close gate still says "2 before, 2 after" with one photo taken, because the gate is the requirement and not a progress bar |
| **far too many** | A card with sixty part lines, forty photos and twelve part requests is a real shape on a long rebuild. Nothing here windows (every list is inside a card and bounded by the repair). Instead each block **caps at 20 rows** and ends with a `button.v2row`: "20 of 63 shown. See all parts" — opening the rest in a sheet, in desk density, one line each. Forty photos stay a grid: it is four or six tiles a row, it is one insert, and the tiles do not animate in (foundation §5.8: twenty staggered entrances is a slideshow) |
| **error** | Whole-card read failure: `errorState('Could not open this job card', retry)` with the back control kept. A **block** that fails keeps the rest of the card and takes its own `errorState` inside its own card, named: "Could not load the parts for this card". A sign-off, close, or time write that fails is a `bad` toast and the control returns, per the block's own table |
| **offline** | The whole card reads from the local database and draws normally. Block 2 reads "No connection since 06:40 — this may be out of date." Every write on this screen is local and keeps working: the two taps, the four times, the odometer, the photos, the part request, the close, the sign-off. What does **not** work offline is the photo *upload*, and that is the tile state in §3.10, not an error. The gate-pass print works offline |
| **half-finished** | The normal case, by design: the card is created at step 1 with a bus and a fault and everything else is added to a card that already exists, so an interruption leaves a real card rather than a draft ([E] `4f0691e`, which is a floor complaint about exactly the opposite). So there is no draft badge and no "finish this entry" state. What there is: the one next step always names the most useful missing thing, and no block is hidden because it is empty — a reader must be able to see that the odometer has not been read |
| **two people editing the same card** | The sharpest edge in the product and a live data-loss bug (`v2-ux.md §6`, LIVE-ISSUES 1): conflict is whole-record last-write-wins on a **device** clock, the loser is dropped silently with a 200 response, and `DECISIONS.md §14` says **v2 starts with that bug**. Four rules, none of which depends on it being fixed: (a) **the field division is the design** — the supervisor owns the card, the mechanic's two taps write two fields nobody else writes, the store's issue writes the one field the server merges (§3.1); (b) **the screen does not redraw under an open sheet** — a sync tick that arrives while somebody is typing a time must not wipe the panel, so redraw is suppressed while `V2.openSheet` holds a panel and the card re-reads and redraws on `closeSheet`; (c) **every sheet reads the stored card at open, writes only the fields that sheet owns, and puts the rest back untouched** — never a whole-card form; (d) **a stale-save warning**: if the stored card's `updatedAt` changed between the sheet opening and its save, the save first asks `V2.confirmDialog('Somebody changed this card while you were typing. If you save, your version replaces theirs.', {title: 'This card changed', yes: 'Save mine', no: 'Look first'})`. "No" closes the sheet and redraws. This is a client-only guard on an unreliable clock and it is §9.4 item 3 |
| **no permission** | Every control is **absent** rather than disabled, with two named exceptions where disabled is the honest word because the reason is the card's state and not the reader's role: the odometer on a verified card (§3.8) and the photo capture on a closed card (§3.10). Absent list: "Close this card" without `mayCloseJob` — which is the live defect `36e7eee` fixed, where the close button opened for a mechanic, the phone wrote `done` and the server then refused; "Sign off" without `verifyJob` **or** when `closedBy === me.id`; "Move to another bus" and "Delete this card" for anybody but the owner; the whole vendor block without `outsideJob`; the odometer, the four "Change" buttons, the photo capture, the close, the verify and the delete for a mechanic. A card a mechanic is not on is **not openable at all** (§2.3) |

### 3.14 Controls

| Control | Does | Pressed | Focus | Disabled rule | While working |
|---|---|---|---|---|---|
| "I have started" / "I am done" | §3.5 | `scale(0.97)` 120 ms | ring `outline-offset: 2px` | Absent when the field is set or the reader is not on the crew. Never greyed | `aria-disabled="true"`, "Saving...", then replaced in place |
| "Sign off" | Writes `status='verified'`, `verifiedBy`, `verifiedAt` | `scale(0.97)` 120 ms | ring `outline-offset: 2px` | **Absent** when `closedBy === me.id`, for every role | `aria-disabled="true"`, "Signing off..." |
| "Close this card" | Writes `status='done'`, `closedAt`; `closedBy` is server truth | `scale(0.97)` 120 ms | ring `outline-offset: 2px` | Absent without `mayCloseJob`. **Present and `aria-disabled="true"`** when the photo gate is not met, with the gate line (block 4) as the explanation — this is the one place a disabled button is right, because the person does hold the capability and the card is one photo away | `aria-disabled="true"`, "Closing..." |
| "Delete this card" | `_deleted` plus `deleteReason` | `scale(0.97)` 120 ms | ring | Absent for everybody but the owner | Behind `V2.confirmDialog('Delete this job card? The parts already issued stay on the ledger.', {danger: true, yes: 'Delete', no: 'Keep it'})` — 200 ms enter, 150 ms exit, `transform-origin: center` |
| "Move to another bus" | Appends to `busMoves` | `scale(0.97)` 120 ms | ring | Absent for everybody but the owner; absent on an unverified card (the server only lets the owner move a **verified** card) | Behind a confirmation naming both buses |
| Four "Change" time buttons | Open the one-time sheet | `scale(0.97)` 120 ms | ring `outline-offset: -2px` (inside a row) | Absent for a mechanic and for store | The sheet's save button carries it |
| Odometer "Change" | Opens the `.num` sheet | `scale(0.97)` 120 ms | ring | Disabled on a verified card; absent for mechanic and store | Save button |
| A part row | Opens the ledger sheet | `scale(0.97)` 120 ms | ring `outline-offset: -2px` | Never — a part this person may not see is not drawn | Nothing |
| "I need a part" | Opens the request sheet | `scale(0.97)` 120 ms | ring | Absent without `requestPart`; the sheet's save is `aria-disabled` until both a part and a quantity above 0 are chosen | "Asking..." |
| A photo tile | `V2.openPhoto` | `scale(0.97)` 120 ms | ring `outline-offset: 2px` | Never | The sheet opens in 250 ms |
| Photo capture label | Opens the camera | `scale(0.97)` 120 ms | **`:focus-within`** ring on the label, because the input is `.sr-only` | Absent on a closed card and for a mechanic | The new tile shows `.skeleton-bar` at `--thumb` square while decoding, then the word "Sending" with no spinner |
| "Gate pass 184" / "Print this pass" | Sheet, then `window.print()` | `scale(0.97)` 120 ms | ring | Absent without `outsideJob` | Nothing — printing is the browser's |
| Back | Returns to Jobs, or to Today for a mechanic who came from there | `scale(0.97)` 120 ms | ring | Never | Nothing |

**The one delegated click listener on this screen returns early** when
`ev.target.closest('input, select, textarea, label, .num')` is non-null, **before** it
reads `[data-act]` or `[data-nav]` (foundation §3.3 rule 3). This screen holds a `.num`
(the odometer, the request quantity) and a `label`-wrapped file input (the photo
capture), and `predeploy-gate.sh` lines 508-511 and 1073 already test exactly this
regression: a count field inside a pressable row threw the storekeeper off the screen
mid-count. A row that holds a field is `div.v2row`, never `button.v2row`.

---

## 4. Screen 9 — Duty board

> "Does every bus that runs tonight have a driver and a conductor, and did each leave the
> gate fit?"

Two questions. One screen, because the twelve-screen budget says so and not because they
belong together. §9.1 is my verdict on that.

Readers: crew manager (tonight's buses and the seats), supervisor (both, plus the
departure check), owner (both). Declares `assignDriver` for the list and the seats,
**`gateCheck`** for the check. The go/hold **decision** is `gateDecide` and is a row on
Attention (#2), where the decider already looks — it is not on this screen.

### 4.1 Structure, phone (yard)

One column, two tabs:

| Order | Element | Primitive | Content |
|---|---|---|---|
| 1 | Title | `h1` `--t3` | "Duty board" |
| 2 | The count | `--t5` `--ink` with the date at `--t6` `--ink-dim` | "3 of 24 buses still need somebody" / "Tuesday 4 November, tonight" |
| 3 | Tabs | `.tabs role="tablist"`, two | "Tonight" / "Who was on a bus" |
| 4 | Tonight: the list or the entry | §4.2, §4.3 | |
| 5 | Lookup | §4.4 | |

**The count is the screen's whole argument and it must be able to read zero**
([E] `ba274f6`: "67 buses need a driver" against 54 drivers and about 100 buses, a number
that could not reach zero, which teaches people to scroll past red). So:

- The denominator is **tonight's picked buses**, never the fleet.
- At zero it reads **"Every bus tonight has a driver and a conductor"** with
  `icon('ok')` in `--ok`. Not "0 of 24". A zero that still looks like a counter is still
  a counter.
- A second count sits beside it for the gate: "18 of 24 checked out of the gate", and
  at zero remaining, "Every bus tonight left the gate checked". **Two counts that empty
  at different hours of the evening is the clearest evidence this is two screens** —
  §9.1.

Desk: `data-density="desk"`, rail, `padding-inline-start: var(--rail-w)`. Tonight's
buses become a two-column grid of per-bus cards at >= 1024px (`grid-template-columns:
1fr 1fr`, `gap: var(--s4)`), because twenty-four buses of three seats each is the one
list in these three screens that the office genuinely reads all at once.

### 4.2 Tonight's list — the daily entry, ticked off the office register

`DECISIONS.md §8`: the register is on paper in the office; the app has never had any
notion of it; so the day starts with one entry. No WhatsApp integration and no file
import.

**When there is no record for tonight**, the Tonight tab holds the entry and nothing
else — this is a **first state, not an empty state**, and it must not use
`emptyState()`:

| Order | Element | Content |
|---|---|---|
| 1 | Heading | `h2` `--t4`: "Which buses run tonight?" |
| 2 | Hint | `--t6` `--ink-dim`: "Tick them off the office register. The board then shows only these." |
| 3 | Search | `.field` + `icon('search')`: "Search a bus number" |
| 4 | The pick list | One `div.v2row` per bus, `.lead` = `icon('bus')`, `.t` = "RJ09PA6126", `.sub` = "Jaipur — Kota", `.act` = **one** control: `input type="checkbox"` sized `var(--tap)` square |
| 5 | Save | `.btn-primary`, full width, sticky to the bottom of the content column via `position: sticky; bottom: 0` **inside the scroll container** — not fixed to the viewport: "Save tonight's list (24 buses)" |

- The row is `div.v2row`, **never** `button.v2row`, because it holds a form control, and
  the delegated listener returns early on `input` (foundation §3.3 rules 2 and 3). The
  whole row is still the label for the checkbox, so a thumb anywhere on it ticks the
  box — `<label class="v2row">` with the checkbox in `.act`, which gives a 56px target
  without a pressable wrapper and without a second handler.
- The save button's label carries the live count, so the person sees what they are
  committing before they commit it.
- **Yesterday's list is offered, not copied.** Above the pick list, one
  `button.v2row`: `.t` = "Same 24 buses as last night", `.sub` = "Tap to tick them all,
  then change what is different." One tap, then correction, which is how a register is
  actually read. It pre-ticks; it does not save.

**When the record exists**, the entry becomes one row at the top of the board:
`button.v2row`, `.lead` = `icon('edit')`, `.t` = "24 buses tonight",
`.sub` = "Saved by Ramesh at 18:20. Tap to change the list." Reopening shows the current
ticks, so a second person **adds** rather than replaces.

**The record.** `v2-ux.md §6` decided this is **one new store** and said why every
existing home is wrong (a field on `buses` is erased by the next v1 write; `dutylog`
needs crew and seat and a real time and is immutable; `meta` syncs one row id; deriving
it from filled seats is circular). The shape this screen is specified against:

```
nightlist:  { id: 'nl-<YYYY-MM-DD>', date: 'YYYY-MM-DD', busIds: [string],
              by: string, at: number, updatedAt: number }
```

One record per night, id derived from the date so two devices cannot create two. v1
discards a store it does not know, so **no record v1 reads changes shape** — which is
the whole reason this is the safest available change. It needs the server's
`WRITE_ROLES` and `may_write` extended to owner, supervisor and crewmanager
(`inventory/02 §4.4`: an unknown store is denied today). **That is the backend lead's to
accept or refuse.**

**If it is refused**, this screen must not solve it quietly with a field on `buses`.
The degraded state, specified so nobody invents one: the board lists **every** bus, the
count reads "87 of 103 buses need somebody", and a `div.v2row` sits above it with
`icon('warn')` in `--warn`, `.t` = "This count cannot reach zero", `.sub` = "The app
does not know which buses run tonight. Ask the office." That is deliberately ugly,
because it is the defect `DECISIONS.md §8` exists to remove, and a screen that hides it
is how it survived.

**Two people picking at once** is a real conflict on a whole-record store: last write
wins and the loser is dropped silently. Mitigation is honest display, not a lock — the
entry row names who saved it and when, and reopening shows the saved ticks rather than a
blank list, so the second person's save is an edit of the first and not a replacement of
it. Said plainly: if two people pick tonight's buses in the same minute, one list is
lost, and nothing in the client can prevent that until LIVE-ISSUES 1 is fixed
(`DECISIONS.md §14`).

### 4.3 The board — three seats per bus

One `.card` per bus of tonight's list, ordered by the buses that still need somebody
first, then by registration:

| Order | Element | Content |
|---|---|---|
| 1 | Bus line | `icon('bus')` + `--t4` "RJ09PA6126" + `--t6` `--ink-dim` "Jaipur — Kota, 21:30" |
| 2 | Driver 1 | `button.v2row`, `.lead` = `icon('seat')`, `.t` = "Driver 1 — Ramesh Kumar", `.sub` = "On this bus since 3 November", `.act` = `.btn-quiet` "Change" |
| 3 | Driver 2 | Empty: `.lead` = `icon('seat')` in `--warn`, `.t` = "Driver 2 — empty", `.sub` = "Tap to put somebody on it", `.act` = nothing |
| 4 | Conductor | As above |
| 5 | Gate state | `.lead` = `icon('gate')`, coloured and worded per the table below |

**The seat sheet.** `V2.openSheet('Driver 2 — RJ09PA6126', html)`: a `.field` +
`icon('search')` to find a person, then a list of `button.v2row`s of **people who are
free tonight** — not seated on another bus in tonight's list — each
`.t` = the name, `.sub` = "Free · 4 nights this week" or "On RJ14PA1023 as Driver 1"
(shown, unpressable, so the reader can see *why* somebody is not offered rather than
wondering where they went). A person already seated elsewhere is drawn and unpressable,
never hidden.

**Filling one seat must never clear another.** `05 §4` row 26 is a workaround in the
training manual for a same-role seat-clearing bug — the manual currently tells the user
that if a bus "looks like it lost its driver after you assigned a conductor, that is a
fault, tell the office". So:

1. The seat sheet writes **one** seat. It reads the stored records, sets that one seat,
   and puts everything else back untouched.
2. The write is: the person's `drivers` record (their bus and seat), a **`dutylog`
   append** (`reason: 'assign'`, crew, seat, a real time, `by` from the token —
   immutable once written, even for the owner), and `buses` where the denormalised crew
   fields live.
3. `dutylog` is append-only, so the history is the audit and the screen never edits it.
   A seat change is a second append with `reason: 'seat-taken'`, and the lookup in §4.4
   shows both.
4. The falsifiable check stage 3 owes this: fill the conductor seat, then assert
   Driver 1 and Driver 2 are **byte-identical** to before. §8 item 7.

### 4.4 Who was on bus X on date Y

The second tab. Two fields and a list, no sheet:

- `.select` of buses (searchable `.field` above it when the fleet is over 40),
  `input type="date"` defaulting to today, `.btn` "Show".
- The result is one `div.v2row` per `dutylog` row, newest first: `.lead` =
  `icon('person')`, `.t` = "Ramesh Kumar — Driver 1", `.sub` = "Put on at 18:22 by
  Mohan · assign". Unpressable: this is a record, not a route.
- If a gate check exists for that bus and date, one `button.v2row` under the crew:
  `.lead` = `icon('gate')`, `.t` = "Gate check at 21:05 — released", opening the check
  read-only. **Only for a holder of `gateCheck`**: `01 §1.3` records this exact row as a
  reachability problem today, where the duty lookup linked a crew manager to a screen
  needing a capability they do not hold.
- Empty: `emptyState('Nobody was recorded on that bus that day', {icon: 'seat', hint: 'The duty log starts on 12 October.'})` — naming the horizon, so the reader does not read "nobody" as "the bus ran empty".

### 4.5 The departure check

`DECISIONS.md §12`: the ten items, the photos and the hold all stay, and **the supervisor
performs the check and photographs the driver at the gate**. Foundation §5.7 says it is
a **state of this screen, not a screen of its own**.

**It is a full-column panel inside the screen, not a sheet.** Reached from the gate row
of a bus, with its own `icon('back')` control, keeping the route. A sheet is wrong here
and the reason is mechanical: a scroll-locked modal holding ten answers, three camera
captures and a 1500 ms hold, on a 360px phone, in the dark, is a trap with one exit, and
`overlay.js`'s 100 checks are about focus and dismissal, not about holding a ten-step
task.

**Step 1 is the driver's photo, and the record shape is why.** `inventory/03 §3.8`: a
check is created with `{busId, regNo, driverId, driverName, startedAt, date, selfie,
faceVerified, lat, lng, onDutyBoard, status: 'open', items: {}}` and the fields in
`GATE_FIXED` **cannot change after creation**. `selfie` is one of them. So the photo
cannot be taken at the end:

| Order | Element | Content |
|---|---|---|
| 1 | Who is taking it out | `div.v2row` pre-filled from the bus's Driver 1 seat: `icon('person')`, "Ramesh Kumar — Driver 1", `.act` = `.btn-quiet` "Somebody else" |
| 2 | The photo | `photoCapture('Photo of the driver', 'selfie')`, one `--thumb` tile once taken, with `.btn-quiet` "Take it again" |
| 3 | Start | `.btn-primary` "Start the check", `aria-disabled="true"` until a driver and a photo are both there, with the reason in words beside it: "Photograph the driver first." |

That tap creates the record (`status: 'open'`) with the location from the device. An
interrupted check therefore leaves a **real open check**, not a draft on one phone —
the same rule as the job card.

**`faceVerified` is written `false` and the copy never claims verification.** v1's
driver flow verified a live face against an enrolment; a supervisor photographing
somebody else verifies nothing. Writing `true` here would put a false claim in a record
that the owner reads as evidence. The label is **"Photo of the driver"**, never "verify
face", and the `gateai` reading (server-side, `/ai/gate`) remains the only thing that
looks at it.

**The ten items**, keyed exactly as the record does: `ac`, `blankets`, `cabin`,
`charging`, `water`, `tyres`, `fuel`, `papers`, `safety`, `uniform`. `ac`, `blankets`
and `cabin` require a photo to pass.

**Each item is a `.card`, not a row**, and this is the one place I step away from the
list row on purpose. A row's `.act` holds **at most one** control at yard density
(foundation §2.1), and an item needs a two-way answer: pass, or a problem with a note.
Two 48px buttons plus a lead mark plus a title does not fit 328px, and cycling one
target through three states is worse than either. So:

| Element | Token | Content |
|---|---|---|
| Item name | `--t4` `--ink` 600 | "Blankets" |
| What is being checked | `--t6` `--ink-dim` | "Clean, counted, and a photo of the rack" |
| State mark | `icon('clock')` `--ink-dim` unanswered, `icon('ok')` `--ok` passed, `icon('bad')` `--bad` failed, 20px, beside the name | |
| Photo (three items only) | `photoCapture` + one `--thumb` tile | "Take photo" |
| Answers | Two buttons, `gap: var(--s2)`: `.btn-primary` "Pass" and `.btn` "Problem" | |
| The note, after "Problem" | `textarea.field`, 3 rows | Placeholder "What is wrong?" |

"Pass" on one of the three photo items is `aria-disabled="true"` until a photo exists,
with the reason in words under it: "A photo is needed to pass this one." The server
enforces the same rule, so a button that let them through would produce a refused push.

A **sticky header** inside the panel (`position: sticky; top: 0`, `--surface-raised`, 1px
`--line` bottom) carries the progress: "6 of 10 answered · 1 problem". Sticky, not
fixed: foundation §3.7.1 forbids a fixed bottom bar on a screen with no nav, and the
principle — a bar pinned to a viewport edge reads as a nav — applies to a panel too.

**The end of the check, which has two endings:**

| Every item passed | A problem was recorded |
|---|---|
| `.btn-primary` **"Hold to release this bus"**, full width, `min-height: var(--tap)` in **both** densities (48px yard, 32px desk), with the 1500 ms bar — §5.4 | `.btn` **"Send for a decision"**. Writes `status: 'awaiting'`; the server stamps `sentAt` |
| On release: `status: 'released'`, the server stamps `releasedAt`. `V2.toast('RJ09PA6126 released', {kind: 'ok'})` and the panel returns to the board, where the bus's gate row is now `--ok` | After sending: `div.v2row`, `icon('gate')` in `--warn`, "Waiting for a decision", "Sent at 21:05. The owner or a supervisor decides go or hold." The panel returns to the board |

**The hold is the control, not decoration** ([E] `8a8cde5`): a bus must not be released
by a palm brushing a screen in the dark. The release button is **absent** until all ten
are answered — not disabled — because the thing to do before then is answer an item, and
the sticky header already says how many are left.

**The go/hold decision is not on this screen.** It is an Attention row for
`gateDecide`, with a mandatory reason, where the decider already looks
(`v2-ux.md §4.1` row 9: it must **not** be here). This screen shows the outcome once it
exists: "Held at 22:40 — brake warning light, reason recorded by the owner."

**Per-bus gate row on the board:**

| `status` | `.lead` | `.t` | `.sub` |
|---|---|---|---|
| no check | `icon('gate')` `--ink-dim` | "Not checked out yet" | "Tap to run the ten items" |
| `open` | `icon('gate')` `--warn` | "Check started 20:10" | "6 of 10 answered. Tap to carry on." |
| `awaiting` | `icon('gate')` `--warn` | "Waiting for a decision" | "Sent 21:05 · tyres, blankets" |
| `released` | `icon('ok')` `--ok` | "Released 21:05" | "All ten passed · Ramesh Kumar" |
| `approved` | `icon('ok')` `--ok` | "Allowed out 22:40" | "The owner said go · brake light noted" |
| `held` | `icon('bad')` `--bad` | "Held 22:40" | "The owner said hold · brake warning light" |

**Never colour alone**: every one of those six carries a mark and a word, and `--ok` /
`--warn` / `--bad` are the third signal, not the first (`v2-ux.md §4.1` row 9 forbids
status by colour alone; `spec §4.3`).

For a **crew manager**, who holds `assignDriver` and not `gateCheck`, the gate row is
drawn as a `div.v2row` — same mark, same words, **no press**. This is a judgement I am
making rather than one the foundation decided: a control you may not use is not drawn,
but a *state* you may read is information, and "has this bus left yet" is squarely the
crew manager's business. The press is the capability; the sentence is not. §9.3 carries
it back.

### 4.6 The nine states

| State | Specification |
|---|---|
| **loading** | Title and tabs draw first. The count line is `figure(null)` with the word "Loading" — never "0 of 0", which reads as a finished day. Tonight's list is `skeleton(6)`; the lookup tab's fields draw empty and enabled |
| **empty** | Three different empties, each named. (a) No record for tonight: the **entry** in §4.2, which is not an `emptyState`. (b) A record saved with no buses picked: `emptyState('No buses run tonight', {icon: 'bus', hint: 'Saved by Ramesh at 18:20. Tap the row above to change it.'})` — a real and legal answer on a holiday, and it must not look like a failure. (c) The lookup with no rows: §4.4 |
| **one item** | One bus tonight is one card and the count reads "1 bus tonight needs somebody" or "The one bus tonight has a driver and a conductor". The singular is written out in the word table, because English pluralises and Hindi does not (foundation §6.3, `w(id, n)`) |
| **far too many** | The **pick list** is the long one: about 103 buses today. It stays a flat list at yard — 103 x 56px is six screenfuls and the search field is above it — and windows at desk over 200 on `rows x var(--row-h)`. Tonight's **board** is bounded by the pick (24 is the real number, 103 the ceiling), so it caps at 200 cards with the remainder line. The lookup caps at 200 `dutylog` rows with "200 of 418 shown, newest first." |
| **error** | `errorState('Could not load the duty board', retry)` with the tabs kept. A failed **seat write** is `V2.toast('Not saved. Nobody was put on that seat.', {kind: 'bad'})` and the seat stays empty — never an optimistic name that disappears on the next draw. A failed **release** is the hardest one and its copy says what is still true: "Not released. The check is saved and still open." |
| **offline** | The board, the seats, the pick and the whole check are local writes and all work (`inventory/02 §4.4`: `dutylog`, `drivers`, `buses`, `gatechecks` are client-written stores). The count line carries "No connection since 19:40 — this may be out of date", which matters more here than anywhere else on these three screens: **another supervisor may already have released a bus**, so the copy never says "not checked yet", only **"not checked on this phone yet"**. The driver's photo is the named 20 MB case — it travels inside the record as a data URL, the tile says "On this phone only", and the hint says "Sends when there is wifi" |
| **half-finished** | The normal case twice over. (a) A check started at 20:00 and read at 02:00 is still `open` and still counts — `v2-ux.md §3.3` step 3: "a 20:00 check still counts at 02:00". The gate row says "Check started 20:10 · 6 of 10 answered. Tap to carry on", and the panel reopens on the first unanswered item, not at the top. (b) A pick saved with eighteen of twenty-four buses is a saved list, and the entry row says so; there is no draft |
| **two people doing it at once** | Three cases, all real. (a) **Two supervisors on the same bus**: before creating a check, the screen looks for an existing check for this `busId` and `date`. If one exists in any status, it **resumes it** and never creates a second — the panel opens on it with a line naming the other person: "Started by Mohan at 20:10." `failedBefore` and `pastDecisions` accumulate across writes, so a resumed check keeps its history. (b) **Two people filling one seat**: last write wins on the person's record and on `buses`, but `dutylog` is append-only, so **both appends survive** and the lookup shows the truth even when the board shows one of them. The board therefore draws the seat from the newest `dutylog` row for that bus and seat, not from the denormalised copy on `buses`, and that is a rule and not an optimisation. (c) **Two people picking tonight's buses**: §4.2, last write wins and one list is lost |
| **no permission** | Duty board is **absent** from the nav without `assignDriver` or `gateCheck`. Inside: the gate row's **press** is absent without `gateCheck` (the row and its words stay — §4.5); the seat rows and the "Change" buttons and the pick entry are absent without `assignDriver`, so a supervisor who somehow held only `gateCheck` would see tonight's buses and their gate states and no seats; the go/hold decision is **never here for anybody**, whatever they hold. `01 §1.3` records the duty lookup linking a crew manager into a `gateCheck` screen today — §4.4 fixes it |

### 4.7 Controls

| Control | Does | Pressed | Focus | Disabled rule | While working |
|---|---|---|---|---|---|
| `label.v2row` + checkbox (the pick) | Ticks a bus for tonight | **None.** A checkbox is not pressed; it is checked, and the tick is the feedback | ring on the label via `:focus-within`, `outline-offset: -2px` | Never | Nothing. It is local state until Save |
| "Same 24 buses as last night" | Pre-ticks, does not save | `scale(0.97)` 120 ms | ring | Absent when there is no previous night | Nothing |
| "Save tonight's list (24 buses)" | Writes `nightlist` | `scale(0.97)` 120 ms | ring | `aria-disabled="true"` at zero ticked, with "Tick at least one bus" beside it | `aria-disabled="true"`, "Saving..." |
| A seat row | Opens the seat sheet | `scale(0.97)` 120 ms | ring `outline-offset: -2px` | Absent without `assignDriver` | The sheet opens in 250 ms |
| A person in the seat sheet | Fills that one seat | `scale(0.97)` 120 ms | ring `outline-offset: -2px` | A person seated elsewhere is `div.v2row`, unpressable, with the reason in `.sub` | `aria-disabled="true"` on the sheet, "Putting them on..." |
| The gate row | Opens the check panel | `scale(0.97)` 120 ms | ring `outline-offset: -2px` | **Press absent** without `gateCheck`; the row stays | Panel replaces the content, no transition (it is a screen change) |
| "Pass" / "Problem" | Writes one `items` key | `scale(0.97)` 120 ms | ring | "Pass" is `aria-disabled="true"` on `ac`, `blankets`, `cabin` until a photo exists, with the reason in words | `aria-disabled="true"`, "Saving..." |
| Item photo capture | Opens the camera | `scale(0.97)` 120 ms | `:focus-within` on the label | Absent once the check is `released`, `approved` or `held` | `.skeleton-bar` at `--thumb` square, then "Sending" |
| **"Hold to release this bus"** | Writes `status: 'released'` after 1500 ms of continuous hold | The bar **is** the pressed state — §5.4 | ring `outline-offset: 2px`. Keyboard: Space or Enter **held** runs the same timer, so a desk user is not locked out of a touch gesture | **Absent** until all ten are answered. Absent without `gateCheck` | The bar, then `aria-disabled="true"` and "Releasing..." |
| "Send for a decision" | Writes `status: 'awaiting'` | `scale(0.97)` 120 ms | ring | Absent until all ten are answered | "Sending..." |
| Lookup "Show" | Reads `dutylog` | `scale(0.97)` 120 ms | ring | `aria-disabled="true"` until a bus and a date are both chosen | "Looking..." |

---

## 5. Motion

Nothing new, with one exception that is already the foundation's. Only `transform` and
`opacity`, nothing over 300 ms except the named hold, `ease-out` both ways, no
`@keyframes`.

### 5.1 Press feedback — inherited, and the one these screens cannot do without

`transform: scale(0.97)`, 120 ms `ease-out`, on every pressable listed above.
**Why:** the office machines took 884 ms per tap before dirty-store tracking and still
take hundreds of milliseconds to draw a screen. On these three screens specifically: a
mechanic in a pit taps "I have started" and must know the tap landed before the row
redraws, and a supervisor at a gate taps "Pass" ten times a bus, twenty buses a night.
A control with no feedback reads as broken, and the person taps again — which on an
issue sheet is two parts off the shelf.

### 5.2 Sheet, confirmation, toast, scrim — inherited unchanged

Sheet enter `translateY(var(--s8))` to none plus opacity, 250 ms `ease-out`; exit
180 ms. Confirmation `scale(0.95)` to none plus opacity, 200 ms in, 150 ms out,
`transform-origin: center`. Toast `translateY(var(--s2))` plus opacity, 200 ms in,
150 ms out. Scrim `opacity` 0 to 0.5 on `--accent-ink`, 200 ms in, 150 ms out.
Consumers here: the one-time sheet, the odometer sheet, the part-request sheet, the
ledger sheet, the gate-pass sheet, the seat sheet, the photo viewer, the delete and
move confirmations, the stale-save confirmation, and every toast in §6.

### 5.3 The mechanic's two taps do **not** animate beyond the press

**Why it is named rather than left out:** this is the single most important action in
v2, so there is pressure to make it feel like something. It gets the 120 ms press, the
row that replaces it, and the toast's 200 ms entrance. It does not get a checkmark that
draws itself, a row that slides in, a figure that counts up, or a success colour that
washes across the card. The action is repeated several times a day by a person in a
hurry on a Core 2 Duo-era phone, and foundation §5.8's rule is that a frequently
repeated action does not animate. The time appearing in the times block **is** the
confirmation; a flourish on top of it spends frames saying what the number already says.

### 5.4 The hold to release — the one exception, and it is the foundation's

Foundation §5.7, unchanged, restated because this is the screen it lives on:

| | |
|---|---|
| What moves | An overlay inside the hold button: `--accent-ink` at 0.25 opacity over `.btn-primary`, so the button darkens left to right |
| Property | `transform: scaleX(0)` to `scaleX(1)`, `transform-origin: left` |
| Duration / easing | **1500 ms `linear`** |
| Released early | `scaleX` back to 0, 150 ms `ease-out` |
| Reduced motion | The bar does not move: `opacity: 0` to `1`, 1500 ms `linear`, same overlay |
| Where the CSS lives | `v2/ui/work.css`, **not** `components.css`, whose 300 ms ceiling is proved by a test over the whole file. One composited layer on one element does not justify weakening a check that guards 923 lines |
| **Why** | The 1.5 s hold **is** the control ([E] `8a8cde5`): a bus must not be released by a palm brushing a screen in the dark. Without a growing bar the person lifts early, the check does not release, and a bus is standing at the gate with nobody knowing why. Linear because the bar is a clock, not an easing |
| Repeated twenty times a night | The bar stays and §5.8's rule is not broken: it is not motion laid over the action, it is the action's own readout, and removing it would not make the action one millisecond faster. If twenty holds a night is the wrong price, the thing to revisit is the 1.5 seconds, which is the owner's and which `DECISIONS.md §12` has just confirmed |

### 5.5 What does not animate on these three screens, and why

| Not animated | Why |
|---|---|
| Opening a job card from Jobs; opening the check panel from the board | The most repeated action here, and the budget is 250 ms **total**. An animation spends the budget it is supposed to hide |
| The filter tabs, the two Duty board tabs, the nav's active bar | Tens of times a day each. A 200 ms slide on the thing you press most makes the app feel slower than it is |
| A Jobs row moving up the oldest-first list; a bus moving to the top of the board when its seat empties | A sync tick applies records every 4 s. The reorder **is** the information — a bus rising up the list is a fact, not a transition |
| The idle figure, the gap minutes, the two counts | `tabular-nums` exists precisely so digits do not shift as they update, and these numbers are read against each other |
| Skeletons | Deliberately static. A looping shimmer cannot stay under 300 ms without strobing and costs frames on the oldest PCs; "Loading" and `aria-busy` carry the state |
| Photo tiles appearing; the check's ten cards | Twenty tiles arrive from a camera roll at once, and ten cards is a list. Staggered entrances are 50 ms x n of deliberately withheld content on a machine that takes 798 ms to boot |
| The close-gate line changing from `--warn` to `--ok` | It is a state change in a sentence, read once. A transition on it would be the only animated colour in the system, and colour is not a compositor property |

### 5.6 Reduced motion

`prefers-reduced-motion: reduce` removes every movement and keeps the acknowledgement as
`opacity`: a press becomes `opacity: 0.8`, sheets and confirmations fade without moving,
toasts fade, and the hold bar becomes the 1500 ms opacity ramp in §5.4. Reduced motion
means gentler, not absent — the person still has to be told the interface heard them,
and at a gate in the dark that is the whole point.

---

## 6. Copy

Written for someone standing up, with ninety seconds, whose first language may not be
English. Seven words on a button, twelve in a row title. An error says what happened,
what is kept, and the one next thing — three clauses, no more. No exclamation marks, no
"Oops", no "Please", no jargon, no cleverness, and never blame the reader.

### 6.1 Every button, in full

| Screen | Button | Why these words |
|---|---|---|
| 3 | "New job card" | The thing, not the record. Not "Create jobcard entry" |
| 3 | "Open" (desk) | One word, and the row says what is being opened |
| 3 | Filters: "Open" / "Completed" / "Away for repair" / "Mechanic workload" | "Away for repair" is the yard's own phrase, not "external" |
| 4 | **"I have started"** | What the mechanic would say out loud. Not "Start", which is an instruction to the app |
| 4 | **"I am done"** | Same. And it is a claim, which "Complete" would overstate |
| 4 | "I need a part" | Same voice, same person |
| 4 | "Close this card" | "This" because the card is one of many and the button is at the foot of a long screen |
| 4 | "Sign off" | Two words, and it is what the office calls it |
| 4 | "Change" | On a time, an odometer, a seat. Not "Edit", which is an app word |
| 4 | "Move to another bus" | Says the consequence. Not "Reassign" |
| 4 | "Delete this card" | Plain. The confirmation carries the consequence |
| 4 | "Take photo" / "Take it again" | |
| 4 | "Print this pass" | |
| 9 | "Save tonight's list (24 buses)" | The count in the label, so the commitment is visible before it is made |
| 9 | "Same 24 buses as last night" | |
| 9 | "Somebody else" | On the pre-filled driver. Not "Change driver", which reads like a seat change |
| 9 | "Start the check" | |
| 9 | "Pass" / "Problem" | Two words a tired person reads in the dark. Not "Fail", which sounds like the person failed |
| 9 | **"Hold to release this bus"** | The instruction **is** the label, because the gesture is unusual and nothing else teaches it |
| 9 | "Send for a decision" | Says where it goes. Not "Submit" |
| 9 | "Show" | On the lookup |

### 6.2 Every empty, error and state message, in full

**Jobs:** "Nothing standing in the yard" / "Every bus is on the road." ·
"No cards completed yet" · "No cards away for repair" ·
"No cards for you" / "The supervisor will put your name on one." ·
"No mechanics on the roll" / "Add people in People." ·
"200 of 341 shown, oldest first. Use a filter to narrow this." ·
"Could not load the job board" · "Enter time not recorded" ·
"14 standing · No connection since 06:40" ·
"Lower than the last reading, 48,210 km"

**Job card:** "Waiting for sign-off" ·
"Somebody else has to check this card. You closed it." ·
"Waiting for a supervisor or the owner to check it" ·
"Finished and signed off" / "Closed by Ramesh 14:20, signed off by the owner 18:05." ·
"Not signed off. The card is still closed and still waiting." ·
"Started 10:42" / "Saved on this phone. Tell the supervisor if the time is wrong." ·
"Your work is recorded" / "Done 15:30. The supervisor closes the card." ·
"To close: 2 photos before, 2 after" / "2 before taken, 2 after still needed." ·
"None taken yet. A vendor bill can stand in for them." ·
"Ready to close" · "Photos are fixed once the card is closed." ·
"Two photos before, two after. Needed to close this card." ·
"On this phone only" / "Sends when there is wifi" ·
"Waited 3 h 20 m before work started" · "Worked 4 h 50 m" ·
"Stood 40 m after the work was done" ·
"Enter time not recorded, so the wait is unknown" ·
"Finished before it started — one of these times is wrong." ·
"That is later than right now, 16:48." · "Not read yet" · "Odometer is broken" ·
"Nobody is carrying this job yet" · "No parts issued against this card" ·
"Nobody has asked for a part" · "No old parts returned" ·
"The store's ledger is what this is counted from." ·
"Waiting for a part" / "Brake shoe set x2, asked for at 09:15. The store issues it." ·
"20 of 63 shown. See all parts" ·
"Could not open this job card" · "Could not load the parts for this card" ·
"That job card is not on this phone" ·
"No connection since 06:40 — this may be out of date." ·
"This card changed" / "Somebody changed this card while you were typing. If you save,
your version replaces theirs." / "Save mine" / "Look first" ·
"Delete this job card? The parts already issued stay on the ledger." / "Delete" /
"Keep it"

**Duty board:** "3 of 24 buses still need somebody" ·
"Every bus tonight has a driver and a conductor" ·
"18 of 24 checked out of the gate" · "Every bus tonight left the gate checked" ·
"Which buses run tonight?" / "Tick them off the office register. The board then shows
only these." · "Search a bus number" ·
"24 buses tonight" / "Saved by Ramesh at 18:20. Tap to change the list." ·
"Tick at least one bus" ·
"No buses run tonight" / "Saved by Ramesh at 18:20. Tap the row above to change it." ·
"This count cannot reach zero" / "The app does not know which buses run tonight. Ask
the office." ·
"Driver 2 — empty" / "Tap to put somebody on it" ·
"Free · 4 nights this week" · "On RJ14PA1023 as Driver 1" ·
"Not saved. Nobody was put on that seat." ·
"Nobody was recorded on that bus that day" / "The duty log starts on 12 October." ·
"Photo of the driver" / "Photograph the driver first." ·
"A photo is needed to pass this one." · "What is wrong?" ·
"6 of 10 answered · 1 problem" ·
"Not checked out yet" / "Tap to run the ten items" ·
"Check started 20:10" / "6 of 10 answered. Tap to carry on." ·
"Started by Mohan at 20:10." ·
"Waiting for a decision" / "Sent at 21:05. The owner or a supervisor decides go or
hold." · "RJ09PA6126 released" · "Released 21:05" / "All ten passed · Ramesh Kumar" ·
"Allowed out 22:40" / "The owner said go · brake light noted" ·
"Held 22:40" / "The owner said hold · brake warning light" ·
"Not released. The check is saved and still open." ·
"Could not load the duty board" ·
"No connection since 19:40 — this may be out of date." ·
"not checked on this phone yet" ·
"200 of 418 shown, newest first."

### 6.3 Hindi, and the strings that must exist before this is built

Foundation §6.3's rule is adopted for screen labels and not only the 21 fixed chrome
words: **a missing Hindi value is a build error, not an English fallback.** The fallback
is the defect — it is what let a whole screen stay English with every test passing, and
`t()` cannot tell a missing translation from a present one.

`v2-ux.md §6` moved the Hindi risk onto **the mechanic's two buttons** when Trip cash
went, so these are the first strings asked of the owner, not the last:

| Id | English |
|---|---|
| `jobStarted` | "I have started" |
| `jobDone` | "I am done" |
| `jobStartedAt` | "Started {time}" |
| `jobDoneAt` | "Done {time}" |
| `jobTellSupervisor` | "Saved on this phone. Tell the supervisor if the time is wrong." |
| `jobWorkRecorded` | "Your work is recorded" |
| `jobNeedPart` | "I need a part" |
| `jobWaitingSignoff` | "Waiting for sign-off" |
| `jobYouClosedIt` | "Somebody else has to check this card. You closed it." |
| `gatePass` | "Pass" |
| `gateProblem` | "Problem" |
| `gateHoldRelease` | "Hold to release this bus" |
| `gatePhotoDriver` | "Photo of the driver" |
| `gateSendDecision` | "Send for a decision" |
| `dutyPickTonight` | "Which buses run tonight?" |
| `dutySeatEmpty` | "{seat} — empty" |

Each needs a `one` and an `other` form where a count is interpolated, because English
pluralises ("1 bus tonight" / "24 buses tonight") and Hindi takes one form — the `w(id,
n)` shape foundation §6.3 specifies. The remaining strings in §6.1 and §6.2 take ids in
the same table; the sixteen above are the ones whose absence would put a Hindi-reading
mechanic or a Hindi-reading supervisor in front of an English control at the moment that
matters.

---

## 7. What a builder must not change, and what they may

### 7.1 May not

1. **The verify control is absent when `closedBy === me.id`** — every role, the owner
   included. Not disabled, not hidden by CSS, not present-and-erroring. And the card
   never reads "verified" when nobody has verified it.
2. **The mechanic gets exactly two one-tap writes**, `startAt` and `completeAt`, and
   nothing else on their card is writable. No close, no verify, no hours, no photo
   requirement, no odometer, no time correction.
3. **No four-field time form.** One row, one missing time, one sheet, one field.
4. **The close gate is drawn above the fold**, before the fault, before the times,
   before the photos.
5. **No new field on any record**, and no change to the shape of one. Under whole-record
   last-write-wins a field v2 invents is erased the next time a v1 device writes that
   record, and v1 must stay able to read everything v2 writes (`DECISIONS.md §2`,
   §14).
6. **The Job card is not a screen two people edit at once.** The field division in §3.1
   is the only reason it is safe on the existing protocol, and §3.13's four rules stand
   whether or not LIVE-ISSUES 1 is fixed.
7. **A row that holds a field is `div.v2row` or `label.v2row`, never `button.v2row` or
   `a.v2row`**, and the screen's one delegated listener returns early on
   `input, select, textarea, label, .num` before it reads `[data-act]`. Two gate checks
   already test this.
8. **Duty board's count denominator is tonight's picked buses, never the fleet**, and at
   zero it reads a sentence, not "0 of 24".
9. **The 1.5-second hold stays, and so does the bar that reports it.** The duration is
   the owner's (`DECISIONS.md §12`).
10. **The driver's photo is taken before the check starts**, because `selfie` is in
    `GATE_FIXED` and cannot be written after creation. And `faceVerified` is written
    `false`: no copy on this screen claims a face was verified.
11. **The go/hold decision is not on Duty board**, for any role.
12. **A mechanic's card list is narrowed in the query**, not in the view, and the
    Mechanic workload tab is absent for them.
13. **Status is never colour alone** — every badge, gate state, close-gate line and
    figure note carries a word and a mark.
14. **Unknown, zero and stale are three different figures.** Pass the raw value and a
    `format` to `figure()`; never format first. An odometer of 0 means broken; an
    unknown odometer is a dash.
15. **No new token, no new colour, no new mark, no new animation**, and no `px` outside
    a `border`, `outline` or `box-shadow` value.
16. **No fixed English word outside the word table** (§6.3).

### 7.2 May

1. **Compose freely** inside the primitives — the check items being cards rather than
   rows (§4.5) is an example of this permission being used, and of why it exists.
2. **Choose the words**, inside §6, in both languages.
3. **Choose each list's cap and order**, inside foundation §2 — the 200s and the 20s
   above are this document's, not the foundation's.
4. **Tighten or loosen the yard cap / desk window boundary** once the office PC has been
   measured. The 200 is sized against a placeholder set on a developer's Mac and
   `DECISIONS.md §9` says so.
5. **Add to `v2/ui/work.css`** for layout that belongs to these three screens, keeping
   the `[data-v2]` prefix and sizing from tokens.
6. **Reject anything here that a measurement contradicts**, and say so in the stage-3
   report rather than working around it.

---

## 8. The falsifiable checks these three screens owe stage 3

A check that cannot fail is decoration. Each of these fails when its own feature is
broken.

1. **Sign in as the closer, open their own closed card, assert no verify control exists
   in the DOM** — for `supervisor` **and** for `owner`, since the owner is the role the
   old rule exempted by name. (Foundation §3.8 check 1.)
2. **Sign in as a second eligible person, open the same card, assert the control is
   there and one tap writes `verifiedBy` and `verifiedAt`.** (Foundation §3.8 check 2.)
3. **Assert the closer's own closed card is not in their Attention queue while it is in
   the other person's.** (Foundation §3.8 check 3 — Attention is not this document's
   screen, but the card is where the state is written.)
4. **Sign in as a mechanic on a card, assert exactly one `--accent`-filled button exists
   on the card, tap it, and assert `startAt` is set, the button is gone from the DOM, and
   `status` is unchanged.** Then assert a second simulated tap on the same coordinates
   writes nothing.
5. **Sign in as a mechanic, open a card they are not on by id, and assert the screen
   refuses.** This is the `viewJobDetail` leak (`c5c11a1`) and it is the one that leaked.
6. **Assert no element on the Job card is a group of four time inputs**, and that the
   time sheet contains exactly one.
7. **Fill the conductor seat on a bus with both drivers seated, then assert Driver 1 and
   Driver 2 are unchanged** — the `05 §4` row 26 bug.
8. **Pick zero buses for tonight, save, and assert the count reads a sentence and not
   "0 of 0"**; then pick 24, fill every seat, and assert the count reaches the zero
   sentence.
9. **Start a check, answer six items, reload, and assert the check resumes at item seven
   with its answers intact** — the 20:00-to-02:00 case.
10. **Attempt to pass `ac` with no photo and assert the client refuses before the push
    does.**
11. **Create a check, then attempt a second for the same bus and date, and assert the
    screen resumes the first.**
12. **Click every `input`, `select` and `textarea` on all three screens and assert the
    route is stable** — the existing invariant sweep (`predeploy-gate.sh:1073`) extended
    to the odometer, the request quantity, the pick checkboxes and the problem note.
13. **Render all three screens with the document language set to Hindi and assert no
    fixed string matches `/[A-Za-z]/`** (caller text and digits excepted) — the check
    that would have caught Trip cash.

---

## 9. Status

**ok = true.** I did not halt and I decided nothing that is the owner's.

### 9.1 Duty board: one screen or two

**Two.** I have specified it as one, because the brief and the twelve-screen budget say
one, and it works — but stage 1 is right that it is the weakest point in the plan, and
the specification above kept producing the evidence rather than resolving it.

**Why two, in the order the evidence arrived while writing §4:**

1. **Two counts that empty at different hours.** §4.1 needs "3 of 24 buses still need
   somebody" **and** "18 of 24 checked out of the gate". The first can reach zero by six
   in the evening; the second cannot reach zero until the last bus has gone, near
   midnight. One header carrying both means one of them is permanently red for most of
   the day, which is precisely the defect `DECISIONS.md §8` and [E] `ba274f6` exist to
   remove. A count that is red because the other count is finished teaches the same
   lesson as a count that cannot reach zero.
2. **Two capabilities, and the crew manager never holds the second.** `assignDriver` and
   `gateCheck` (`v2-ux.md §4.3`). A crew manager opens this screen and half of it is
   read-only state they cannot act on. I had to invent a rule in §4.5 to keep that half
   honest — a gate row that shows its words and refuses its press — and inventing a rule
   to make a merge survivable is the merge telling you something.
3. **Two people and two times of day.** The crew manager fills seats in the afternoon,
   on a desk or a phone. The supervisor walks the line at 20:00 in the dark. The same
   screen is in yard density for one and desk density for the other, on the same evening.
4. **The check is already a screen in everything but the route table.** §4.5 is a
   full-column panel with its own back control, its own sticky header, its own ten-step
   state and its own write boundary. It is not a sheet and it is not a state of a list;
   it is a screen that declines to be called one.
5. **The tab strip is doing a nav's job, which is the tell.** A filter changes what is
   drawn within one question (foundation §3.6). "Tonight" and "Who was on a bus" are the
   same question at two dates, so those two are a legitimate filter — but the gate check
   is a third thing that is neither, and it got in by being a row's destination rather
   than a tab, which is how a merged screen hides its seam.

**The split, exactly:**

| # | Screen | Question | Declares | Holds |
|---|---|---|---|---|
| 9 | **Duty board** | "Does every bus that runs tonight have a driver and a conductor?" | `assignDriver` | Tonight's pick (§4.2), the three seats (§4.3), who is free, "who was on bus X on date Y" (§4.4), and **the gate state as unpressable words** so the crew manager can see whether a bus has gone |
| 13 | **Gate round** | "Did each bus leave the gate fit?" | `gateCheck` | Tonight's buses with their check state, the check itself (§4.5), the driver's photo, the ten items, the hold. Nothing about seats |

Cost: **thirteen screens, not twelve**, and one more nav slot for the supervisor and the
owner — both of whom already overflow into a More sheet at yard and a rail at desk, so
the marginal cost is one row in a sheet and one row in a rail that has 384px of twelve
items in a 768px column. **No new nav slot for the crew manager**, who keeps six. No new
mark: `gate` already has a consumer and would simply gain a nav slot it lost when the
old Gate check screen went (foundation §4.1). No new token and no new capability.

Benefit: each count reaches zero on its own clock, the crew manager stops holding a
screen half of which is not theirs, and the supervisor's nightly task stops being two
taps deep inside somebody else's screen — which is the same shape as the defect we are
fixing, one tap shallower (`v2-ux.md §4.4` makes exactly that argument about the rail).

The twelve is a budget, not a measurement. If one screen has to be bought back to pay
for this, the candidate is **Fuel & tyres (#10)**, whose diesel and AdBlue rows are a
`.num` pair and a list and could live as a tab on Buses (#5) — but that is stage 1's
call and I am not making it. My recommendation stands as: split 9, accept thirteen.

### 9.2 What I decided because stage 1 left it open

These belong back in `v2-ux.md`:

1. **Two photos before and two after, as the close gate's stated number.** The server
   requires "before and after" without a count; the gate line has to promise something
   specific or it cannot say "Ready to close". I chose two.
2. **Yard caps, desk windows.** Foundation §2.3 rule 6 says a windowed list may only use
   the one-line row, and the yard row is deliberately two lines, so a long list at yard
   has to cap. 200 with a remainder line, matching Attention.
3. **The gate state is readable by a crew manager and pressable only with `gateCheck`.**
   The foundation's rule is that a control you may not use is absent; I split a row into
   a sentence and a press, which it does not cover. §9.3.
4. **`faceVerified: false`**, and no copy claiming verification, now that somebody else
   takes the photo. `DECISIONS.md §12` kept the selfie and moved the hands; it did not
   say what happens to the claim the field carries.
5. **The driver's photo is step 1 of the check**, not the last step, forced by
   `GATE_FIXED`. `v2-ux.md §3.3` step 2 lists the selfie after the items.
6. **A stale-save confirmation on the Job card's sheets** (§3.13 (d)). `v2-ux.md §6`
   says v2 must not design a flow that depends on the silent-drop bug being fixed; it
   does not say whether a client-side warning is wanted. I added one and I am not sure.
7. **The `nightlist` store's name and shape**, and the degraded state if the backend
   lead refuses it. `v2-ux.md §6` left both open on purpose.
8. **"I need a part" is a sheet and not a third tap.** `DECISIONS.md §6` grants two
   one-tap writes; `v2-ux.md §3.2` step 4 lists a part request as a mechanic action
   without saying it is a tap. It needs two values, so it cannot be one.

### 9.3 What the foundation lacks

**One thing, and it is small.** Foundation §3.1 and §3.7 both say a control a person may
not use is **absent**, and §3.4 says a row whose capability the reader does not hold is
absent. Neither covers the case this screen actually has: **a row whose words are
information for this reader and whose press is not for them.** Duty board's gate row for
a crew manager is exactly that — "has this bus gone yet" is the crew manager's business,
and the ten-item check is not. I have specified it as a `div.v2row` with the same mark
and the same sentence and no press (§4.5), on the reasoning that absent means "this is
not for you" and the sentence *is* for them. If the foundation would rather the row
disappeared, that is a one-line change here and the crew manager loses the ability to see
whether tonight's buses have left — which seems worse. Carried, not assumed.

Everything else I needed was there, including the two things I went looking for and
found: foundation §3.8 covers all eight states of the second signature with its copy
written, and §3.3's three rules plus the two existing gate checks cover the number-entry
regression on both of this document's `.num` consumers.

### 9.4 The three specifications most likely to be wrong

1. **The ten check items as cards rather than rows.** Ten cards is roughly 1,300px of
   scroll per bus, and a supervisor walks twenty buses in an evening. I chose cards
   because a yard row's `.act` holds one control and an item needs a two-way answer, and
   because a card is unmistakable with gloves in the dark — but I have not watched
   anybody do it, and the number of answers per night (200 taps plus 60 photos) is the
   kind of total that gets a design abandoned in week two. The alternative is a row with
   two buttons in `.act`, which breaks a stated foundation rule at 360px; if the office
   says cards are too slow, that rule is what gives, and it should give deliberately
   rather than by somebody squeezing two buttons in.
2. **The mechanic's two taps have no undo and no correction.** §3.5 item 9: a mis-tap at
   09:00 is fixable only by finding the supervisor, and I wrote the copy to say so. This
   follows `v2-ux.md §3.2` ("everything else stays read-only") to the letter, and the
   letter may be wrong: a mechanic who taps "I am done" on the wrong card has sent a
   false claim to the top of the supervisor's list and has no way to withdraw it. The
   fix would be a 60-second window with a "Change" control, which means a clock, a third
   control on a screen that is supposed to have two, and a rule about what happens when
   the window closes mid-sync. I did not build it because `DECISIONS.md §6` is explicit
   about the count being two. If mis-taps turn out to be common, this is the first thing
   to revisit, and the measurement that would show it is already in the record:
   `startAt` or `completeAt` rewritten within a minute by a supervisor.
3. **The stale-save confirmation on the Job card's sheets** (§3.13 (d)). It compares the
   stored card's `updatedAt` before and after a sheet is open, and `updatedAt` comes from
   the **device clock** (`inventory/03 §4`), which `v2-ux.md §6` names as unreliable
   enough to lose records on its own. So it will fire falsely — a phone with a slow clock
   receiving its own echo — and a hurried supervisor who does not understand the question
   will answer it the same way every time, which is "Save mine", which is the behaviour
   we already have with an extra tap in front of it. It may do more harm than the silent
   loss it is trying to surface. It is also the only thing in this document that tries to
   help with LIVE-ISSUES 1 from the client, and `DECISIONS.md §14` says v2 ships with
   that bug, so the temptation to paper over it will exist whether or not this is the
   right paper. I would rather it were measured than argued: count how often the dialog
   fires in a week and what the answer was.

### 9.5 What stage 3 must not read as settled

- The **200-row budget** behind every cap and window above is a placeholder taken on a
  developer's Mac (`DECISIONS.md §9`, foundation §2.2). Take the reading on an office PC
  and move these numbers to it.
- The **3-to-13 hours a week** that justifies the Job card remains an estimate built on
  two inferred numbers (`DECISIONS.md §13`). The two taps are worth building whatever it
  says; the **ranking** is what the reading could overturn.
- The **`nightlist` store** is the backend lead's to accept or refuse, and if it is
  refused, §4.2's degraded state is what the screen shows — it does not get solved with
  a field on `buses`.
- The **second signature is a client-only rule** until `_guard_write`'s "unless the
  verifier is a supervisor" clause is tightened, and **v1 is the bypass** for as long as
  both clients run.
- The **read boundary** has not moved. A conductor token still pulls job-card costs and
  gate checks with their selfies. Every "absent" in this document is a curtain until it
  does.

---

**Written to:** `docs/v2/plan/screens-work.md`
**Gate:** `python3 scripts/check-floor.py v2 ui` — green.
**Next:** the remaining nine screens, and stage 3 on these three.

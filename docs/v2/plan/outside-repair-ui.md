# Outside repair — the interface

**Stage 2 (UI) of `docs/v2/PIPELINE.md`. Slug: `outside-repair`.**
Written 2026-11-09. Input: `docs/v2/plan/outside-repair-ux.md` (status: ready for
stage 2, with the owner's three decisions recorded), `v2-foundation-ui.md`,
`screens-work.md §3`, `screens-assets.md`, and the code the flow lands on.

**Scope.** The four paths of UX §3 drawn on the five screens of UX §4, plus the six
sheets that carry the writes. **No new screen** (v2 stays at twelve), **no new token**,
**no new icon** (the 34-mark cap is reached and stays reached), **no new colour**.

`scripts/check-css-floor.sh v2 ui` is green at the time of writing (60 files, exit 0).
Nothing specified below uses `oklch()`, `color-mix()`, CSS nesting, `@starting-style`,
view transitions, `@scope`, `subgrid`, relative colour, `light-dark()` or
`text-wrap: balance`. The one thing the checker cannot see is a spec that *asks* for
them, so §11.1 names them again as a must-not.

---

## 0. Everything this feature changes, in one table

| Where | Change | Spec |
|---|---|---|
| Job card (#4), block 13 | The outside block stops being read-only. Draws the away state, the days, the vendor, the bill, every pass on the card | §3.1 |
| Job card (#4), block 4 | The close gate changes: an outside card's gate is the vendor's bill, not any one photo `[decision 1]` | §3.2 |
| Job card (#4), block 12 | A third photo group, "Vendor's bill", on an outside card only | §3.3 |
| Job card (#4), block 3 | Two new next steps for an away card, and "put somebody on this job" suppressed | §3.4 |
| Job card (#4), block 14 | Two new actions, one new state action | §3.5 |
| *sheet* Bus is away | NEW. Two fields | §4.1 |
| *confirmation* Back in our yard | NEW. One question | §4.2 |
| *sheet* New gate pass | NEW on the card; on Fuel & tyres it replaces the send-out sheet | §4.3 |
| *sheet* The slip | Exists as a stub (`jobcard.js:1366`), rewritten and made printable for real | §4.4 |
| *sheet* Back from the vendor | NEW. The missing half of the one-way door | §4.5 |
| *sheet* Close without the bill | NEW `[decision 1]` | §4.6 |
| Jobs (#3) | Away tab: days away per row; the tab is absent for a mechanic | §5 |
| Attention (#2) | One new row kind: out 14 days or more | §6 |
| Fuel & tyres (#10) | The send-out sheet becomes the gate-pass sheet for all four roles; "Back from the vendor" appears; `ftGateSeam` and the cost field are dropped | §7 |
| Store (#6) | The piece timeline names the pass; vendor money is withheld from `store` and `crewmanager` | §8 |

---

## 1. Tokens used

All from `v2/ui/tokens.css`. **Nothing added, nothing redefined.** If a builder finds
they need a new token, that is a finding to report, not a literal to inline.

| Group | Token | What it carries here |
|---|---|---|
| Ink | `--ink` | Every row title, every field value, the slip's body text |
| | `--ink-dim` | Every `.sub`, every field label, the freshness line, the serial-why sentence, the slip's "Issued by" line |
| Surface | `--surface` | The page behind the card |
| | `--surface-raised` | The outside block's `.card`, every sheet panel, the slip, every `.field`, the photo tile backing |
| Edge | `--line` | The card border, the row hairline (inset shadow), the field border, the slip's rules in print (as a real `border-bottom`, §4.4) |
| Accent | `--accent` | "Make the gate pass", "Record it back" and "Save" as `.btn-primary` fill; every focus ring |
| | `--accent-ink` | Text on those buttons; the scrim at 0.5 |
| | `--accent-text` | `.btn-quiet` ("Print", "Change"), the active Away tab |
| Status | `--ok` | The `ok` mark on "Ready to close", on "Serial matches", on "Back in our yard" |
| | `--warn` | The `clock` mark on "At vendor", the days figure on an away row under 14 days, the `camera` mark on an unmet gate |
| | `--bad` | The `warn` mark on a serial mismatch, the days figure at 14 days or more, the `bad` toast kind |
| Type | `--font`, `--font-hi` | `--font-hi` carries every Hindi string below; the slip prints in it too |
| | `--t3` | The job card `h1`, the sheet title |
| | `--t4` | The outside block's card heading, the slip's pass number |
| | `--t5` | Body, every field, every row title |
| | `--t6` | Every `.sub`, every label, the freshness line, the print footer |
| Space | `--s1` | Gap between a mark and its word inside a badge |
| | `--s2` | Photo-grid gap; gap between the three buttons in a piece row's action strip |
| | `--s3` | Gap between the cards of the job card column; gap between fields in a sheet |
| | `--s4` | The desk two-column gutter |
| | `--s8` | The sheet's enter distance (inherited, §9.2) |
| Density | `--pad` | Sheet body padding, card padding, slip padding |
| | `--tap` | Minimum height of every button and field here |
| | `--row-h` | Minimum height of every row here |
| | `--thumb` | The bill photo tile, the return sheet's capture cell |
| | `--nav-h` | The bottom padding of the job card scroll container (unchanged) |
| | `--rail-w` | The desk inset (unchanged) |
| Radius | 8px / 12px | The two existing radii: 8px on controls and photo tiles, 12px on cards and the sheet panel. px in a `border-radius` value is allowed (`PX_OK_PROP`) |
| Shadow | `box-shadow: inset 0 -1px 0 var(--line)` | The row hairline, which takes no height. **Screen only** — in print it is replaced, §4.4 |

**Marks used, all existing.** `map` (away, and the place), `doc` (the pass and the
Print button), `part` / `tyre` / `battery` (the unit, by kind), `clock` (days, times,
at-vendor), `camera` (a photo is needed), `ok` (matched, ready, back), `warn`
(mismatch, overdue), `bad` (the error toast kind), `money` (the charge), `bus` (the
bus on the slip), `person` (who issued, who received), `edit` (change a value),
`back` (the card header). **No 35th mark.** A print button draws `doc`, not a printer:
`doc` already has #4 as a named consumer and the cap at 34 is a decision, not a commit
(`v2-foundation-ui.md §4.4`).

---

## 2. Density and the two widths

| | Phone (yard, default, 360px up) | Desk (`data-density="desk"`, >= 1024px) |
|---|---|---|
| Job card | One column, `--pad` sides, `padding-bottom: calc(var(--nav-h) + env(safe-area-inset-bottom))` | Two columns, `grid-template-columns: 1fr 1fr`, `--s4` gutter, `padding-inline-start: var(--rail-w)`. The outside block stays in the right column (block 13 of `screens-work.md §3.3`) |
| Every sheet here | Bottom-anchored, full width, `max-width: 40rem` | Same sheet. Only the enter distance and the row heights change, from tokens |
| Rows inside the outside block | Two lines: `.t` + `.sub` | **One line.** The `.sub` moves into `.act` as a second item (`screens-work.md §3.3`) |
| The slip | One column, scrolls | One column, `max-width: var(--read-w)`. It is a document, not a table |
| Away tab rows | Two lines, `--row-h` 56px | One line, `--row-h` 32px, windowable |

A supervisor opening the office screen on a 360px phone keeps one column and the
bottom bar: both desk rules sit behind `@media (min-width: 1024px)`.

---

## 3. Job card (#4)

> "What is the state of this one repair, and what is the one next step?"

Readers: **supervisor** (owns it), owner (reads, signs off, moves, deletes), store
(parts only), mechanic (two taps). Everything in §3 is **absent** without
`outsideJob` — not disabled, not greyed. `outsideJob` stays `['owner','supervisor']`
(UX §8); the pass's own capability is wider and lives on Fuel & tyres, §7.

### 3.1 Block 13 — the outside block, rewritten

Today: `jobcard.js:805`, drawn only when `externalVendor` is set, three read-only rows.
That condition is wrong in the same direction the Away tab was: a bus away in Jaipur
with no vendor typed yet draws nothing at all.

**Drawn when `c.outside` is true OR `c.externalVendor` is non-empty OR the card has a
pass.** Heading `--t4`: **"Outside repair"** when only a vendor is set;
**"Away for repair"** with `icon('map')` when `c.outside` is true.

`.card`, `--surface-raised`, 12px radius, rows in reading order:

| Row | `.lead` | `.t` | `.sub` | `.act` |
|---|---|---|---|---|
| Where it is — only when `c.outside` | `icon('map')` in `--warn` | "In Jaipur" | "Marked away. Nobody from our garage is on it." | — |
| How long — only when `c.outside`, or when the card was away and came back | `icon('clock')` in `--warn`, or `--bad` at 14 days or more | "Away for 3 days" / "Was away 4 days" | "Since 6 Nov, 09:40" (the reached time) | `figure(days, {unit: 'd'})` |
| Who did the work | `icon('person')` in `--ink-dim` | "CoolAir Jaipur" | "The workshop holding the bus. What it charges goes in Outside cost." | `.btn-quiet` + `icon('edit')` "Change" |
| What they charged | `icon('money')` in `--ink-dim` | "Outside cost" | — | `figure(c.externalCost, {format: rupees})` |
| One row per gate pass on this card, newest first | `icon('doc')` in `--ink-dim` | "Gate pass OJ-261109-AB12" | "Alternator ALT-77120 · out 3 days" / "Back 9 Nov · serial matched" | `badge-warn` "At vendor" or `badge-ok` "Back" |

- **The days figure.** `figure(days, {unit: 'd'})`, computed as v1 computes it and from
  the same fields: `(outAt - enterAt)` when both exist, else `(now - enterAt)` while the
  card is open (`app.js:7735`, `jobDownDays`). **`enterAt` is the reached-the-workshop
  time** — v1 already relabels that field for an away card (`app.js:6101`) — and
  **`outAt` is "Back in our yard"**. So the number freezes on return by arithmetic, no
  field is invented, and v1 reads the identical figure. Until `enterAt` exists the
  figure is `figure(null)`: a dash and "No data", never 0. **Unknown and zero must not
  look alike** — a card marked away this minute with no reached time is not a card that
  has been away zero days.
- **One place, in words, and nothing else.** No city *and* a map link *and* coordinates.
  `owLoc`, `owOpenMap` and the lat/lng are dropped (UX §5). The field is **`outsideCity`**
  — see the defect at §10.2, because the code reads `c.outsidePlace`, which no record has.
- **A pass row is a pressable `button.v2row`** and opens the slip (§4.4). It is the only
  pressable row in the block.
- **Every pass, not one.** Resolved by `pass.jobId === card.id`, newest `issuedAt` first.
  `c.gatePassNo` / `c.gatePassId` hold the most recent pass so the two existing read
  sites keep working. A pass with no `jobId` (one issued from a piece, or a v1-era pass)
  is shown only if `c.gatePassId` names it. See §9 — this is a decision stage 1 left open.

### 3.2 Block 4 — the close gate, changed `[decision 1]`

`div.v2row`, unpressable, directly under the one next step, visible from the top of the
card so the gate is never a surprise at the end. The two inside-work states are
unchanged (`screens-work.md §3.7`). The outside states replace the one that said
"The vendor bill stands in for the photos" on the strength of any single photo:

| State | `.lead` | `.t` | `.sub` |
|---|---|---|---|
| Inside work, not met | `camera` in `--warn` | "To close: 2 photos before, 2 after" | "2 before taken, 2 after still needed." |
| Inside work, met | `ok` in `--ok` | "Ready to close" | "2 before, 2 after. The photos are on the card." |
| **Outside, no bill** | `camera` in `--warn` | **"To close: a photo of the vendor's bill"** | **"No bill photo yet. You can close without it by typing a reason."** |
| **Outside, bill on the card** | `ok` in `--ok` | "Ready to close" | **"The vendor's bill is on the card."** |
| **Outside, bill on a returned pass** | `ok` in `--ok` | "Ready to close" | **"The vendor's bill is on gate pass OJ-261109-AB12."** |
| **Outside, closed on a typed reason** | `warn` in `--bad` | **"Closed with no bill"** | The reason, in the words whoever closed it typed, up to two lines (`v2row-why`) |
| Already closed, bill present | not drawn | — | — |

**The gate rule, exactly** (client mirror of the server's `_has_proof`; both change in
this feature, and the server half is the owner's deploy):

```
outside card  := c.outside === true || c.externalVendor !== ''
gate met      := (c.billPhotos || []).length >= 1
              || any pass of this card has status 'returned' and a billPhoto
              || c.closeNoBillReason is a non-empty string
inside card   := beforePhotos >= 2 && afterPhotos >= 2      (unchanged)
```

The pass's bill counts because UX §5 drops capturing the bill twice: "one event, one
amount, one photo". Making the supervisor photograph the same bill onto the card after
typing it into the return sheet would re-create the double capture this feature exists
to remove.

**Block 4 carries the reason wherever the card is read.** The same sentence appears on
Money's outside split row and in the owner's sign-off view, as a `--t6` `--ink-dim` line
under the card's name. Decision 1's words: *not a silent override*.

### 3.3 Block 12 — a third photo group

On an outside card only, after "Before" and "After":

- Heading `--t4`: **"Vendor's bill (1)"**, `photoGrid(c.billPhotos, {capture: mayCapture && !closed, label: 'Photograph the bill', name: 'bill'})`.
- Tiles are `--thumb` square, 8px radius, 1px `--line`, `object-fit: cover`; the capture
  control is the last cell, a label-wrapped `input type="file" accept="image/*" capture="environment"` (foundation §3.5). No new primitive.
- **Empty is not `emptyState()`.** It is the capture control plus the requirement in
  words: **"The vendor's bill. Needed to close this card."**
- A tile still uploading carries the word **"Sending"** and no spinner. A tile that
  failed carries `badge-bad` + `icon('offline')` + **"On this phone only"**, stays
  tappable to retry, and is **not** lost — it travels inside the record as a data URL.
- **The return sheet must save with the photo still uploading** (UX §6): the man at the
  gate does not wait.

### 3.4 Block 3 — the one next step, for an away card

One row, for whoever is looking, in foundation §3.4's `v2row-why`. The away branch is
inserted into `nextStep()` after the second-signature branches and before the crew
branch, because **an away card must never ask for a crew member**: nobody from our
garage is in Jaipur, and a note telling you to undo what the screen just did to you is
a design apologising (UX §5, `owCrewNote` dropped as a sentence and kept as behaviour).

| Order | Condition | `.lead` | `.t` | `.sub` | `.act` |
|---|---|---|---|---|---|
| 1 | `outside` and `enterAt == null` | `clock` in `--warn` | **"Record when it reached the workshop"** | "Until then nobody can say how many days." | `.btn-primary` "Record the time" |
| 2 | `outside` and no bill | `camera` in `--warn` | **"Add the vendor's bill"** | "A photo of their bill closes this card." | `.btn-primary` "Photograph the bill" |
| 3 | `outside`, bill present | `ok` in `--ok` | **"Ready to close"** | "The bus is still away. Close it when it is back." | `.btn-primary` "Close this card" |
| — | not `outside` | unchanged (`screens-work.md §3.4`) | | | |

The crew step (`kind: 'crew'`, "Put somebody on this job") is **skipped entirely** while
`outside` is true. The time step reuses the existing one-time sheet (`screens-work.md
§3.6`) with its label switched to **"Reached the workshop"** — the field is `enterAt`,
which is v1's own behaviour and v1's own word (`owReached`, Hindi exists).

### 3.5 Block 14 — the card's actions

Appended to the existing column of `.btn`s, each **absent** when not held:

| Control | Shown when | Class | Mark | Label |
|---|---|---|---|---|
| Mark away | `outsideJob` and not `c.outside` and not closed | `.btn` `.jc-wide` | `map` | **"The bus is away for repair"** |
| Back in our yard | `outsideJob` and `c.outside` and not closed | `.btn` `.jc-wide` | `ok` | **"Back in our yard"** |
| Send a unit out | `outsideJob` and not closed | `.btn` `.jc-wide` | `doc` | **"Send a unit out on a gate pass"** |

Order: away/back first (it is the state of the bus), then the pass. Both sit above
"Close this card". None is drawn on a closed or verified card: the record is finished.

### 3.6 The nine states of this screen, for the parts this feature adds

| State | What is drawn |
|---|---|
| loading | `skeleton(1)` in the next-step slot, `skeleton(3)` where the outside block will be. The block never draws "Away for repair" optimistically and then takes it away |
| empty | Not applicable to a card — a card either is away or is not. The block is **absent** when the card is neither away, nor has a vendor, nor has a pass. Absent, not an empty card with a heading. (The current app draws headings with no data; that is the thing this replaces) |
| error | A failed read of `gatepasses` draws `errorState()` **inside the outside block only** — the rest of the card is real and stays. A failed write is `V2.toast(msg, {kind: 'bad'})`, because the sheet has closed by then |
| offline | No change to any control. Every write here is local-first and **nothing may say "could not send"**. The card's freshness line already says when this phone last heard from the server |
| too much data | A card with more than three passes shows the three newest and a `--t6` line: **"3 of 7 gate passes shown, newest first."** No scroller inside a card |
| one item | One pass: one row, no count line, no "1 of 1" |
| no permission | Without `outsideJob`: no block, no actions, no bill photos, no pass, **and no Away tab** (§5). A mechanic has no business knowing which vendor holds the unit |
| closed card | Every capture cell and every action absent; the block is read-only and says **"Photos are fixed once the card is closed"** |
| two people at once | The card already has "Somebody changed this card while you were typing. If you save, your version replaces theirs." (`jobcard.js:192`). The away fields ride that dialog and need nothing new. Every sheet below reads the stored card at open, writes only the fields it owns, and puts the rest back untouched |

---

## 4. The six sheets

Sheets, not destinations (`v2-foundation-ui.md §3.2`): `V2.openSheet(title, html)`,
bottom-anchored, `max-width: 40rem`, `max-height: 90%`, radius 12px 12px 0 0, head with
`--row-h` min-height and a Close button, body padded `--pad` plus
`env(safe-area-inset-bottom)`. Focus is trapped by `showModal()`; the opener's
`activeElement` is restored. A confirmation starts focus on **Cancel**, so a reflexive
Enter says no.

Every sheet below: `data-sheet="<kind>"`, one `[data-field]` per input, read once at save
by the screen's existing `vals()` helper. **No sheet is a whole-card form.**

### 4.1 Sheet — "The bus is away"

Title: **"The bus is away"**. Two fields and nothing else. Four taps and one typed word.

| Element | Primitive | Content |
|---|---|---|
| Statement | `.ft-fixed`-style `--t5` line with `icon('bus')` | "RJ45 CC 8890 — AC not cooling" |
| Hint | `--t6` `--ink-dim` | "Turn this on when the bus itself is away — standing at a workshop in another town, not in our yard." (`owHint`, Hindi exists) |
| Where it is | `label` + `input.field` `type="text"`, `autocomplete="off"`, `list` of places this garage has used before | Label "Town or workshop", placeholder "e.g. Jaipur" |
| Who is doing the work | `label` + `input.field` `type="text"`, `list` of known vendor names | Label "Who is doing the work (if you know)", placeholder "who is doing the work" (`ojVendorPh`) |
| Save bar | `.btn-primary` `.jc-wide` | "Save" |

- **The suggestion list is a native `<datalist>`**, built from the distinct
  `outsideCity` values already in `jobcards` and the `vendors` store. It is markup, not
  script, it works offline, and it is inside Chrome 109. Typing a new value is always
  allowed: the list offers, it does not constrain.
- **No third field. No date picker.** It is today unless the card says otherwise; the
  reached-the-workshop time is asked for afterwards, as the card's next step, by the
  sheet that already exists for one time.
- **Where is required, vendor is not.** Empty place on save: the field takes
  `aria-invalid="true"`, a `--bad` border *and* the message beside it in words —
  **"Which town is the bus in?"** (`owNoCity`, Hindi exists). Never colour alone.
- Writes: `outside: true`, `outsideCity`, `externalVendor` if typed, `updatedAt`.
  Nothing else on the card is touched.

### 4.2 Confirmation — "Back in our yard"

`V2.confirmDialog`, not a sheet: it is one question with no fields.

- Title: **"Back in our yard"**
- Text: **"The bus is back from CoolAir Jaipur. Away for 4 days."**
- Buttons: **"Yes, it is back"** (`.ov-yes`) / **"Not yet"** (`.ov-no`, focused first)
- Writes: `outside: false`, `outAt: now`. The days away are then fixed by arithmetic
  (§3.1) and the card returns to Open on the board.
- If `enterAt` is null the text instead reads **"The bus is back from CoolAir Jaipur. No
  reached-the-workshop time was recorded, so the days away cannot be counted."** It still
  confirms — a missing time must not trap a bus in the Away tab.

### 4.3 Sheet — "New gate pass"

Title: **"New outside job"** (`ojNew`, Hindi exists). Reached from the job card (§3.5)
and from a piece on Fuel & tyres (§7). **Same sheet, same questions, same slip, same
number**; the only difference is the door, and the door decides whether the bus comes
from the card or from the piece.

| Order | Element | Primitive | Content |
|---|---|---|---|
| 1 | What will print | `--t6` `--ink-dim` block with `icon('bus')` | "Will print: RJ14 PA 1023 · Chassis MAT4470 · Engine ENG88231" (`ojWillPrint`) |
| 2 | Hint | `--t6` `--ink-dim` | "Fill this in before the unit leaves. Print it and send a copy with the vendor." (`ojNewHint`) |
| 3 | Vendor | `input.field` + `<datalist>` of `vendors` | Label "Vendor name", placeholder "who is doing the work" |
| 4 | Tracked piece | `select.select` | Label "Tracked piece (optional)". First option **"Not a tracked piece"**; then the pieces fitted to this bus: "Alternator · ALT-77120" |
| 5 | Unit | `input.field` | Label "Unit name", placeholder "e.g. Alternator, Front tyre, Starter" |
| 6 | Serial | `input.field`, `autocomplete="off"`, `spellcheck="false"` | Label "Unit serial no.", placeholder "the number stamped on the unit" |
| 7 | Why the serial matters | `--t6` `--ink-dim` with `icon('warn')` in `--warn` | "This is the one that matters — it is how you prove the unit that comes back is the one that went." (`ojSerialWhy`) |
| 8 | What work it is going for | `input.field` | Label "Remark", placeholder "what is to be done" |
| 9 | Save bar | `.btn-primary` `.jc-wide` + `icon('doc')` | **"Make the gate pass"** |

- **Choosing a tracked piece fills in the unit name and the serial** and leaves both
  editable: the serial on the record may be wrong and the casing is the truth.
- **No cost field.** Nobody knows it yet and asking invites a guess that becomes a figure
  on Money (UX §4). `ftRepairCost` is therefore **removed** from this sheet, which is a
  removal from the live send-out sheet (§7).
- **No signature box drawn on screen.** Signatures stay on paper.
- Required: vendor (**"Enter the vendor"**, `ojNeedVendor`) and unit name (**"Enter the
  unit name"**, `ojNeedUnit`), each as `aria-invalid` plus the words beside the field.
- Writes a `gatepasses` record: `no` (date-first, generated on the device —
  `OJ-261109-AB12`, never a counter, because two supervisors on alternate shifts are both
  offline), `status: 'out'`, `vendorName`, `busId`, and `regNo`, `engineNo`, `chassisNo`
  **copied, not referenced**; `componentId` or null; `unitName`, `unitSerial`, `remark`,
  `issuedBy`, `issuedAt`, `jobId` when the card was the door. On the card: `gatePassNo`,
  `gatePassId`, and `externalVendor` if it was empty. On the piece, if one was chosen:
  `state: 'sent-out'` plus a `send-out` history entry naming the pass.
- **On save the sheet is replaced by the slip (§4.4), in the same panel.** Not a second
  sheet opening over the first: the person's next act is to print, and a sheet-to-sheet
  crossfade has no purpose (`v2-foundation-ui.md §5.8`).

### 4.4 Sheet — "The slip", and how it prints

Title: **"Gate pass OJ-261109-AB12"**. This is the paper. It is a document, so at desk
it is `max-width: var(--read-w)` and never a table.

| Order | Element | Content |
|---|---|---|
| 1 | Number | `--t4`, 600 weight, tabular-nums | "OJ-261109-AB12" |
| 2 | Status | `badge-warn` + `icon('clock')` "At vendor" · or `badge-ok` + `icon('ok')` "Back" |
| 3 | Vendor | row, `icon('person')` | "Sharma Auto Electricals" |
| 4 | Bus | row, `icon('bus')` | "RJ14 PA 1023" · `.sub` "Chassis MAT4470 · Engine ENG88231" |
| 5 | Unit | row, `icon('part')` | "Alternator" · `.sub` "Serial ALT-77120" |
| 6 | For | row, `icon('doc')` | "Weak charging — sent for rewind" |
| 7 | Issued | `--t6` `--ink-dim` | "Issued by Ramesh Kumar, 6 Nov 09:40" |
| 8 | On return only | rows | "Came back as ALT-77120" · "Serial matches" (`ok`, `--ok`) or "Serial does NOT match" (`warn`, `--bad`) · the charge as `figure(cost, {format: rupees})` · the bill photo as one `--thumb` tile |
| 9 | Print | `.btn-quiet` + `icon('doc')` | **"Print"** |
| 10 | A returned pass | no Record-it-back control at all, and the line **"Received by Ramesh Kumar, 9 Nov 16:20"** |

**Printing.** `window.print()` and the existing `@media print` block in
`v2/ui/work.css`, extended, not replaced. No second layout, no new window, no new route.
It works offline: it is CSS and a record, and both are on the device.

- Already there: `.apphead`, `.nav`, `.appbody`, `.ov-scrim` and `.ov-close` go to
  `display: none`; `.ov-panel` goes `position: static`, `max-height: none`,
  `box-shadow: none`.
- **Add:** inside `@media print`, `[data-v2] .jc-pass .v2row { box-shadow: none; border-bottom: 1px solid var(--line); }`.
  The screen hairline is an inset `box-shadow`, and Chrome drops box-shadows when
  "Background graphics" is off, which is the default — the slip would print with no rules
  at all. A real `border-bottom` prints either way, px is legal in a `border` value, and
  the selector keeps its `[data-v2]` scope.
- **No `@page` rule.** `test_v2_work.js` asserts every selector in `work.css` starts with
  `[data-v2]`, and `@page` does not. Default print margins are correct for A4 and the
  gatekeeper does not measure them.
- **Do not add `print-color-adjust`.** The slip prints black ink on white paper; the only
  colour on it is a status word that is also a word.

### 4.5 Sheet — "Back from the vendor"

Title: **"Received back"** (`ojReceive`, Hindi exists). Six taps and one photo. This is
the half that does not exist today: `fuel.js:1421-1435` has `ftFit`, `ftRemove`, `ftSend`
and nothing that brings a piece back, so **every piece sent out in v2 is stuck for ever**.

| Order | Element | Primitive | Content |
|---|---|---|---|
| 1 | What went out | `--t5` statement, `icon('part')`, **not a field** | "Went out as Alternator · ALT-77120" (`ojWentOut`) |
| 2 | How old this reading is | `--t6` `--ink-dim` with `icon('clock')` | "Read from this phone 4 minutes ago" — the piece's `history` is rewritten whole, so two people recording one return lose each other's entries (UX §6). The send-out sheet already states its age; this one must too |
| 3 | Hint | `--t6` `--ink-dim` | "Check the number on the unit against the one on the pass before you accept it." (`ojReceiveHint`) |
| 4 | The serial in his hand | `input.field`, `autocomplete="off"`, `spellcheck="false"`, **never pre-filled** | Label "Serial on the unit that came back", placeholder "read it off the unit" |
| 5 | Why | `--t6` `--ink-dim` | "Read it off the metal, not off their bill." (`ojSerialBackWhy`) |
| 6 | What they charged | `label.num` + `input.field.num-in` `type="text"` `inputmode="decimal"` `pattern="[0-9]*[.]?[0-9]*"` | Label "Vendor bill", no pre-filled 0 |
| 7 | Photo of the bill | `photoCapture('Photograph the bill', 'returnBill')`, one `--thumb` cell | Label "Photo of the bill" |
| 8 | Remark | `input.field` | Placeholder "condition, what they did" |
| 9 | Only if the piece came off a bus | `.tabs` `role="tablist"`, two tabs | **"Back on RJ14 PA 1023"** / **"Onto the shelf as a spare"**. Defaults to "Back on" — the one question v1 asked on a different sheet on a different screen |
| 10 | Save bar | `.btn-primary` `.jc-wide` | **"Record it back"** |

- **Pre-filling the serial is the same as not asking.** The whole record exists to catch
  the case where the two differ.
- **The mismatch confirmation** is `V2.confirmDialog`, replacing v1's native `confirm()`
  (`app.js:5046`) — the most important sentence in the flow was a browser dialog with no
  control over its wording or its focus:
  - Title: **"Serial does not match"**
  - Text: **"The pass says ALT-77120. You have entered ALT-77999. This is not the unit
    that was sent out. Record it anyway and flag it?"**
  - Yes: **"Record it and flag it"** · No: **"Look again"** (focused first)
  - Under the text, `--t6` `--ink-dim`: **"Recorded so it can be taken up with the vendor.
    Do not pay until it is explained."** (`ojMismatchWhy`)
  - **Confirming never refuses the return.** The unit is in the yard whatever the paper
    says, and a flow that would not let him write that down would be worked around
    (`app.js:5043-5046`).
- Writes, in one save: the pass → `status: 'returned'`, `returnedAt`, `returnedBy`,
  `returnSerial`, `serialMismatch`, `cost`, `returnRemark`, `billPhoto`; the piece →
  `state: 'in-service'` with its `busId` and position restored, or `'refurbished'` with
  `busId: null`, plus a `return` history entry and `refurbCount + 1`; the card →
  `externalCost` set to the charge, **captured once**.
- **A return must not require a pass.** The seeded alternator (`v2/db.js:737`) and
  everything else already at `sent-out` left with no slip and must be clearable. With no
  pass, row 1 reads from the piece's last `send-out` entry — "Went out as Alternator ·
  ALT-77120, 6 Nov" — and there is no mismatch check to run, because there is no paper to
  disagree with. The sheet says so once, in `--t6` `--ink-dim`: **"This piece went out
  before gate passes were kept. There is nothing to check the serial against."**
- Toast on success: **"Received — serial matches"** (`kind: 'ok'`) or **"Received — serial
  does NOT match"** (`kind: 'warn'`). No emoji: v1's two (U+26A0, U+2705) are grey boxes on
  Windows 7.

### 4.6 Sheet — "Close without the bill" `[decision 1]`

Title: **"Close without the bill"**. Reached only from the close path, as a visible
control, on an outside card whose gate is unmet. **No long press, no hidden gesture.**

The close path for an outside card with no bill:

1. Block 14's "Close this card" is **enabled** (it is not a disabled button with a secret).
2. Tapping it opens the ordinary close confirmation, which on this card carries one extra
   row: `div.v2row`, `icon('warn')` in `--warn`, `.t` **"There is no bill photo on this
   card"**, `.sub` "You can add the bill, or close it by typing a reason.", and in `.act`
   a `.btn-quiet` **"Close without the bill"**.
3. That button opens this sheet.

| Element | Primitive | Content |
|---|---|---|
| Statement | `--t5` with `icon('warn')` in `--warn` | "This card has no photo of the vendor's bill." |
| The reason | `textarea.field`, 3 rows, **required** | Label "Why is it closing without the bill?", placeholder "e.g. Vendor will send the bill next week" |
| What happens to it | `--t6` `--ink-dim` | "This reason stays on the card. Anybody who reads the card will see it." |
| Save bar | `.btn-primary` `.jc-wide` | **"Close the card"** |

- **No list of canned reasons.** A tap-to-pick list is a shrug, and the owner asked for a
  reason somebody wrote.
- Empty on save: `aria-invalid="true"`, `--bad` border, and **"Type the reason. The card
  cannot close without it."** The button does not become permanently disabled — a
  disabled button on a slow machine reads as broken.
- Writes `closeNoBillReason`, then the ordinary close (`status: 'done'`, `closedAt`,
  `closedBy`). One save, one write, one toast: **"Card closed. No bill — your reason is on
  the card."**

---

## 5. Jobs (#3) — the Away tab

The filter already keys on `c.outside` (commit 93a32a5). What this feature adds:

- **Days away in every away row.** `.act` carries `figure(days, {unit: 'd'})`, same
  arithmetic as §3.1, `--warn` under 14 days, `--bad` at 14 and over. **No `at` note
  inside the row** — a figure note is a block, it triples the row height and runs
  `ageWords()` once per row; the list states its freshness once, in its header
  (`v2-foundation-ui.md §2.3` rule 4).
- **The row's `.sub` for an away card** is the place and the vendor, not the crew:
  "In Jaipur · CoolAir Jaipur", or "In Jaipur · no vendor recorded yet". An away card has
  no crew by design, so "Nobody on it yet" would be a complaint about a decision the app
  made.
- **The lead mark is `map`**, in `--warn`, not the idle `clock`: this row is answering
  *where*, not *how long it has stood in our yard*.
- **The tab is absent for a mechanic.** `jobs.js:model` currently gives a mechanic
  `FILTERS.slice(0, 3)`, which is `['open','done','away']`. It becomes
  `['open','done']` for a mechanic, and the three-or-four choice for everybody else is
  unchanged. Absent, not empty: a mechanic has no business knowing which vendor holds the
  unit (UX §4).
- States: empty is `emptyState('No cards away for repair', {icon: 'map'})` — already
  written at `jobs.js:419`. Over 200 away rows takes the existing cap line, **"12 of 240
  shown, oldest first. Use a filter to narrow this."** One away card: one row, no cap
  line. Offline: the rows stay and the header says "No connection since 06:40"; the rows
  are from the local database and are real, only their age is in question.

---

## 6. Attention (#2) — one new row kind

One declarative entry in `KINDS`, which is how every other row kind is added:

```
{ key: 'outsideUnit', cap: 'outsideJob', band: 3, mark: 'doc', tone: 'warn',
  stores: ['gatepasses', 'buses'], build: outsideUnitRows }
```

- **Band 3** — "a clock ending in a fine or a stopped bus", days, ascending. It is
  therefore ranked below a gate hold (band 1) and below money (band 2), which is what UX
  §3.4 asks for, and it appears under the **Papers** tab with the expiring documents,
  because it is the same question: a clock somebody has to act on before a date.
- **`basis = 14 - daysOut`**, so a unit out 20 days is `-6` and sorts above one out 15
  days at `-1`. Band 3's rank is the basis with no sign flip and overdue is negative —
  the existing comparator needs no change, and no cross-unit comparison is created.
- **The row:** `.lead` `icon('doc')` in `--warn`; `.t` = "Alternator ALT-77120 ·
  Sharma Auto Electricals"; `.sub` = **"Out 21 days. 14 days is the limit."** (two lines
  max, wrapped, never truncated — the reason *is* the row); `.act` =
  `figure(days, {unit: 'd'})`.
- **The threshold says itself on the screen.** 14 days is v1's number
  (`app.js:4789`) and stage 1 uses it until the owner says otherwise, so the row states
  it rather than asserting an opinion the reader cannot see.
- **Only passes with `status: 'out'` and 14 or more days since `issuedAt`.** A row per
  unit out *at all* is a row that is always there, and a count that can never reach zero
  is the one thing Attention may not have.
- **Where it goes when tapped:** `to: 'jobcard'`, `params: {id: pass.jobId, pass: pass.id}`
  when the pass has a card — the job card opens the slip when `params.pass` is present —
  else `to: 'store'`, `params: {pieceId: pass.componentId}`, which is the piece's own home
  and already has a timeline. A pass with neither cannot exist `[decision 2]`.
- **Declared on `outsideJob`**, so it is invisible to everybody else and costs them
  nothing: an unheld kind never reads a store.
- States: it contributes to the existing `emptyState('Nothing needs you')`; a
  `gatepasses` read that fails drops **this kind only**, listed at the end under its own
  heading, never ranked at zero. **In today's fixture this row cannot appear** — the one
  seeded `sent-out` piece left 3 days ago and there are no `gatepasses` records at all.
  §12 makes that a fixture item, because a row nobody can see is a row nobody has tested.

---

## 7. Fuel & tyres (#10) — the door the other two roles come in by `[decision 3]`

The pieces tab, per piece row. Today: `Fit` / `Remove` / `Send out for repair`, with a
sentence admitting the screen cannot make the slip.

| Change | Spec |
|---|---|
| **"Send out for repair" becomes the gate-pass sheet** | The same sheet as §4.3, for all four roles — owner, supervisor, store, crewmanager. The `o.gatepass` branch at `fuel.js:707` and `fuel.js:1589` goes; there is one sheet, not two |
| **`ftGateSeam` is deleted** | "No gate pass can be made from here. The owner or a supervisor makes the slip." The restriction it describes is gone, so the sentence is now a lie about our own screen, and a screen that explains a restriction it no longer has is worse than silence |
| **`ftRepairCost` is deleted from this sheet** | "Cost, if known" invites a guess at the one moment nobody can know, and the guess becomes a figure on Money. The `send-out` history entry writes `cost: null`, which `figure()` draws as a dash, not a zero |
| **"Back from the vendor" appears** | A third button in the action strip of a piece at `state: 'sent-out'`, opening §4.5. It is the missing half of the one-way door and the only new control on this screen |
| The bus comes from the piece | The piece fills in the bus; there is no bus picker here, and **no "mark the bus away"** — that is `outsideJob` and stays with the owner and the supervisor (UX §8) |

- The action strip is the existing `.ft-pacts` with `data-density="yard"` — three `.btn`s
  at `--tap` minimum, `--s2` gap, wrapping on a 360px phone. Tap targets do not shrink
  because a third button arrived.
- The piece row's badge for `sent-out` stays `badge-warn` with the word **"At vendor"**,
  and gains the pass in its `.sub`: **"Out 3 days on OJ-261109-AB12"**. Status is never
  colour alone; here it is a colour, a word and a number.
- States: `sent-out` with no pass → the badge and the days, and the `.sub` reads **"Out 3
  days. No gate pass was made."** That is the honest state and it is the thing UX §7
  counts down to zero.
- No permission: a role without `manageComponents` sees no action strip at all, which is
  today's behaviour and is unchanged.

---

## 8. Store (#6) — the piece register

- **A `send-out` entry in the timeline names its pass**: `.t` = "Sent out · 6 Nov",
  `.sub` = "Sharma Auto Electricals · gate pass OJ-261109-AB12", and when the piece is
  still out, a third fact in `.act`: `figure(days, {unit: 'd'})`.
- **A `return` entry**: `.t` = "Back · 9 Nov", `.sub` = "Serial matched" or **"Serial did
  not match — went out ALT-77120, came back ALT-77999"**, which wraps rather than
  truncates, because it is the one line somebody will be asked about.
- **Vendor money is withheld from `store` and `crewmanager`.** Today the timeline draws
  `figure(cost)` on every history entry. For a reader without `outsideJob`, the `send-out`
  and `return` entries draw **no figure and no bill photo** — the `.act` is empty, not a
  dash, because a dash means "unknown" and this is "not for you". Decision 3 settled who
  may *issue and receive*, not who may *re-read a bill a month later*; until the owner
  says otherwise, deny by default. The amount and the photo are on the return sheet of
  whoever is receiving the unit, because they are typing them.
- Nothing else on this screen changes. No pass of its own, no browsable bill history.

---

## 9. Interaction — every control this feature adds

| Control | What it does | Pressed | Focus | Disabled rule | While it works |
|---|---|---|---|---|---|
| "The bus is away for repair" (`.btn`) | Opens §4.1 | `scale(0.97)`, 120ms `ease-out` | `outline: 2px solid var(--accent)`, `outline-offset: 2px` | **Absent** without `outsideJob`, or on a closed card | n/a — opening a sheet is instant |
| "Back in our yard" (`.btn`) | Opens §4.2 | same | same | **Absent** unless `outside` is true | `aria-disabled="true"`, label **"Saving..."** |
| "Send a unit out on a gate pass" (`.btn`) | Opens §4.3 | same | same | **Absent** without the pass capability | n/a |
| "Save" in Bus is away (`.btn-primary`) | Writes two fields, closes, redraws | same | same | Never disabled before the press. An empty place fails the field, not the button | `aria-disabled="true"`, **"Saving..."**, and `data-busy` so a re-check cannot re-enable it underneath |
| "Make the gate pass" (`.btn-primary`) | Writes the pass, replaces the panel with the slip | same | same | Never pre-disabled | `aria-disabled="true"`, **"Making the pass..."** |
| "Print" (`.btn-quiet`) | `window.print()` | same | same | Never | Nothing. The browser's own print dialog is the feedback, and it arrives in under 100ms |
| A pass row (`button.v2row`) | Opens the slip | `scale(0.97)`, 120ms | `outline-offset: -2px` — a row inside a card clips an outer ring | A returned pass is still pressable: reading the paper is not an action | n/a |
| "Record it back" (`.btn-primary`) | Mismatch confirm if the serials differ, then one write | same | same | Never pre-disabled | `aria-disabled="true"`, **"Recording..."** |
| Back-on-the-bus / shelf (`role="tab"`) | Changes what the save will write | `scale(0.97)`, 120ms | `outline-offset: -2px` | The pair is **absent** when the piece came off no bus | Nothing. It writes nothing until save |
| "Close without the bill" (`.btn-quiet`) | Opens §4.6 | same | same | **Absent** on a card whose gate is met, and for a role that may not close | n/a |
| "Close the card" in §4.6 (`.btn-primary`) | Writes the reason and closes | same | same | Never. An empty reason fails the field | `aria-disabled="true"`, **"Closing..."** |
| Photograph the bill (`label.btn`) | Opens the camera | `scale(0.97)`, 120ms | `:focus-within` on the label, `outline-offset: 2px`. The input is `.sr-only`, never `display: none` | **Absent** on a closed card | The new tile carries the word **"Sending"** |
| A bill tile (`button`) | Opens the photo full size in a sheet | `scale(0.97)`, 120ms | `outline-offset: 2px` | Never | n/a |

Three rules that hold across all of them:

1. **A field is not pressed; it is focused.** Tapping a serial, a charge or a reason does
   exactly one thing: puts the caret in it. Every screen's delegated listener returns on
   `ev.target.closest('input, select, textarea, label, .num')` **before** it reads
   `[data-act]` — the line the shelf-count regression was missing, and the gate at
   `predeploy-gate.sh:508` still has to pass.
2. **`aria-disabled`, never `disabled`, for a write in flight**, with the label saying
   what is happening. A `disabled` button loses focus and drops out of the tab order
   mid-save.
3. **A control a person may not use is not drawn.** Absent is the whole permission idiom
   of this app; a greyed button teaches people to try.

---

## 10. Motion

Inherited whole from `v2-foundation-ui.md §5`. **`transform` and `opacity` only, nothing
over 300ms, `ease-out` both ways, no `@keyframes`, no `@starting-style`.** This feature
adds **no new animation**, and that is a decision with reasons.

| What moves | Property | Duration / easing | Why it animates at all |
|---|---|---|---|
| Every pressable above | `transform: scale(0.97)` | 120ms `ease-out` | The office machines took 884ms per tap before dirty-store tracking and still take hundreds of ms to draw a screen. A control that gives no feedback reads as broken, and the person taps again — which at a gate is two passes for one unit. This is the one animation the product cannot do without |
| Every sheet here, entering | `translateY(var(--s8))` to none, with `opacity 0` to `1` | 250ms `ease-out` | It arrives from the edge it is anchored to, so its direction is its dismissal. The distance is a token, so a desk sheet moves less than a yard one. Nothing scales in from nothing |
| Every sheet here, leaving | same, reversed | 180ms `ease-out` | Faster than the enter: slow where the person is deciding, fast where the system is responding |
| The mismatch confirmation | `scale(0.95)` to none + opacity, `transform-origin: center` | 200ms in, 150ms out, `ease-out` | The half-second is the point. The most consequential question in the flow must not appear in the same instant as the tap that asked for it. Centre origin because a modal is anchored to no trigger |
| The scrim | `opacity 0` to `0.5` on `--accent-ink` | 200ms in, 150ms out | The page behind is inert and the scrim is the only thing that says so |
| Toasts | `translateY(var(--s2))` to none + opacity | 200ms in, 150ms out | A message that appears without transition reads as a redraw, and on this app's history a redraw means something broke |

**What does not animate here, and why:**

| Not animated | Why |
|---|---|
| The card moving from Open to Away | A list insert or remove, 4 seconds after a sync tick. The reorder *is* the information — a bus arriving in the Away tab is a fact, not a transition |
| The days-away figure updating | `tabular-nums` exists precisely so digits do not shift. A number that animates cannot be read, and these are read against each other |
| The Away tab switch | Tens of times a day. A 200ms slide on the control you press most makes the app feel slower than it is |
| The sheet becoming the slip after "Make the gate pass" | A crossfade between two different documents has no purpose, and the office PCs cannot afford to composite a blur to mask one |
| The badge going "At vendor" to "Back" | A status word is read, not watched. It changes once per pass in three days |
| The bill photo tile arriving | A photo comes from a camera, sometimes several at once. Staggered entrances are a slideshow |
| Anything on the printed slip | Paper does not animate |

**Reduced motion.** `prefers-reduced-motion: reduce` is already handled in
`components.css` and nothing here extends it: the press becomes `opacity: 0.8`, the
sheets and the confirmation fade without moving, the toast fades. Gentler, not absent —
the person still has to be told the interface heard them.

---

## 11. Copy

English below is final. **Hindi is PENDING for every new id and goes to the owner**, who
is the only Hindi speaker on the project. Where a v1 Hindi string already exists it is
named with its `i18n-hi.js` line and **must be reused, not rewritten**. A missing Hindi
value is a build error, not an English fallback (`v2-foundation-ui.md §6.3`) — the
English fallback is what let a whole screen stay English with every test passing.

### 11.1 Reused, Hindi exists

| Word id | English | Hindi source |
|---|---|---|
| `owHint` | Turn this on when the bus itself is away — standing at a workshop in another town, not in our yard. | `i18n-hi.js:180` |
| `owCity` / `owCityPh` | Town or workshop / e.g. Jaipur | 181 |
| `owAway` | Away for repair | 183 |
| `owNoCity` | Which town is the bus in? | 183 |
| `owReached` | Reached the workshop | 185 |
| `owVendNote` | The workshop holding the bus. What it charges goes in Outside cost. | 185 |
| `owWhere` / `owAwayFor` | Where it is / Away for | 186 |
| `ojNew` / `ojNewHint` | New outside job / Fill this in before the unit leaves. Print it and send a copy with the vendor. | 198 |
| `ojVendor` / `ojVendorPh` | Vendor name / who is doing the work | 199 |
| `ojSerial` / `ojSerialPh` | Unit serial no. / the number stamped on the unit | 201 |
| `ojSerialWhy` | This is the one that matters — it is how you prove the unit that comes back is the one that went. | 202 |
| `ojUnitName` / `ojUnitPh` | Unit name / e.g. Alternator, Front tyre, Starter | 203 |
| `ojPiece` / `ojPieceNone` | Tracked piece (optional) / Not a tracked piece | 204 |
| `ojRemark` / `ojRemarkPh` | Remark / what is to be done | 205 |
| `ojIssue` / `ojIssued` / `ojPrint` | Make the gate pass / Gate pass issued / Print | 206 |
| `ojWillPrint` / `ojNeedVendor` / `ojNeedUnit` | Will print / Enter the vendor / Enter the unit name | 207 |
| `ojAtVendor` / `ojOverdue` / `ojBack` / `ojOutFor` | At vendor / Out 14+ days / Back / out | 208 |
| `ojReceive` / `ojReceiveHint` | Received back / Check the number on the unit against the one on the pass before you accept it. | 211 |
| `ojSerialBack` / `ojSerialBackPh` | Serial on the unit that came back / read it off the unit | 212 |
| `ojSerialBackWhy` | Read it off the metal, not off their bill. | 213 |
| `ojBill` / `ojBillPhoto` / `ojMarkBack` | Vendor bill / Photo of the bill / Record it back | 214 |
| `ojMismatch` / `ojWentOut` / `ojCameBack` | Serial does not match / Went out as / came back as | 216 |
| `ojMismatchWhy` | Recorded so it can be taken up with the vendor. Do not pay until it is explained. | 218 |
| `ojBackOk` / `ojBackMismatch` | Received — serial matches / Received — serial does NOT match | 219 |
| `ojConfirmMismatch` | The pass says ALT-77120. You have entered ALT-77999. This is not the unit that was sent out. Record it anyway and flag it? | 220 — reword to drop `\n\n` and the `#`, keep the meaning |
| `addPhotoNote` | Before AND after photos required to close a job (outside repairs: a bill photo) | 22 |
| `jbMoveWarn` | Parts, labour and outside work move with the card | 100 — **not dropped**, named so nobody drops it as decoration |

### 11.2 New ids, `hi: ''` PENDING

| Word id | English |
|---|---|
| `jcAwayAction` | The bus is away for repair |
| `jcBackInYard` | Back in our yard |
| `jcSendUnitOut` | Send a unit out on a gate pass |
| `jcAwayHead` | Away for repair |
| `jcOutsideHead` | Outside repair |
| `jcAwayAt` | In {place} |
| `jcAwayNobody` | Marked away. Nobody from our garage is on it. |
| `jcAwayFor` | Away for {n} days |
| `jcWasAwayFor` | Was away {n} days |
| `jcAwaySince` | Since {date} |
| `jcAwayNoTime` | No reached-the-workshop time recorded |
| `jcNextReached` | Record when it reached the workshop |
| `jcNextReachedWhy` | Until then nobody can say how many days. |
| `jcNextReachedBtn` | Record the time |
| `jcNextBill` | Add the vendor's bill |
| `jcNextBillWhy` | A photo of their bill closes this card. |
| `jcNextBillBtn` | Photograph the bill |
| `jcAwayReadyWhy` | The bus is still away. Close it when it is back. |
| `jcBillHead` | Vendor's bill ({n}) |
| `jcBillNeed` | The vendor's bill. Needed to close this card. |
| `jcBillTake` | Photograph the bill |
| `jcGateBillNeed` | To close: a photo of the vendor's bill |
| `jcGateBillNone` | No bill photo yet. You can close without it by typing a reason. |
| `jcGateBillOnCard` | The vendor's bill is on the card. |
| `jcGateBillOnPass` | The vendor's bill is on gate pass {no}. |
| `jcClosedNoBill` | Closed with no bill |
| `jcNoBillTitle` | Close without the bill |
| `jcNoBillState` | This card has no photo of the vendor's bill. |
| `jcNoBillWarnRow` | There is no bill photo on this card |
| `jcNoBillWarnSub` | You can add the bill, or close it by typing a reason. |
| `jcNoBillAsk` | Why is it closing without the bill? |
| `jcNoBillPh` | e.g. Vendor will send the bill next week |
| `jcNoBillKept` | This reason stays on the card. Anybody who reads the card will see it. |
| `jcNoBillNeed` | Type the reason. The card cannot close without it. |
| `jcNoBillSave` | Close the card |
| `jcNoBillDone` | Card closed. No bill — your reason is on the card. |
| `jcAwayTitle` | The bus is away |
| `jcAwayWho` | Who is doing the work (if you know) |
| `jcAwaySave` | Save |
| `jcAwaySaving` | Saving... |
| `jcBackTitle` | Back in our yard |
| `jcBackAsk` | The bus is back from {vendor}. Away for {n} days. |
| `jcBackAskNoTime` | The bus is back from {vendor}. No reached-the-workshop time was recorded, so the days away cannot be counted. |
| `jcBackYes` | Yes, it is back |
| `jcBackNo` | Not yet |
| `jcPassRow` | Gate pass {no} |
| `jcPassOut` | {unit} {serial} · out {n} days |
| `jcPassBack` | Back {date} · serial matched |
| `jcPassBackBad` | Back {date} · serial did not match |
| `jcPassCap` | {shown} of {total} gate passes shown, newest first. |
| `jcPassIssuedBy` | Issued by {name}, {date} |
| `jcPassReceivedBy` | Received by {name}, {date} |
| `jcPassMaking` | Making the pass... |
| `jcPassWork` | For |
| `ftActReturn` | Back from the vendor |
| `ftOutOnPass` | Out {n} days on {no} |
| `ftOutNoPass` | Out {n} days. No gate pass was made. |
| `ftReturnAge` | Read from this phone {ago} |
| `ftReturnNoPass` | This piece went out before gate passes were kept. There is nothing to check the serial against. |
| `ftReturnFitBack` | Back on {reg} |
| `ftReturnShelf` | Onto the shelf as a spare |
| `ftReturnCharge` | What they charged |
| `ftReturnRemarkPh` | condition, what they did |
| `ftReturnRecording` | Recording... |
| `ftMismatchYes` | Record it and flag it |
| `ftMismatchNo` | Look again |
| `jbAwayWhere` | In {place} · {vendor} |
| `jbAwayNoVendor` | In {place} · no vendor recorded yet |
| `attOutsideUnit` | {unit} {serial} · {vendor} |
| `attOutsideWhy` | Out {n} days. 14 days is the limit. |
| `stHistSendPass` | {vendor} · gate pass {no} |
| `stHistSerialOk` | Serial matched |
| `stHistSerialBad` | Serial did not match — went out {a}, came back {b} |

### 11.3 The voice rules these obey

Seven words maximum on a button, twelve in a row title. A button is the verb the person
would say out loud ("Make the gate pass", not "Submit"). The number first where the
number is the point ("Out 21 days", not "This unit has been out for 21 days"). No
exclamation marks, no "Please", no "Oops", no cleverness. An error says what happened,
what is kept, and the one next thing — three clauses, no more. Never blame the reader: it
is "Which town is the bus in?", not "Invalid city". **No emoji anywhere**, including in a
toast: Windows 7 never shipped the full set and v1's two toast emoji on this
very flow (`app.js:5049`, U+26A0 and U+2705) are grey boxes on the machines the office
uses all day.

---

## 12. Performance, against the measured budgets

| Budget | Source | What this feature spends |
|---|---|---|
| Tap to visible response **< 100ms** | `spec §8` | Every control here opens a sheet or writes locally. No control waits on a network |
| Screen change with data present **< 250ms** | `spec §8` | No new screen, no new route |
| **200 dense desk rows < 250ms**, fastest of three runs | `predeploy-gate.sh`, `#perf-bed` | The Away tab adds **one figure** per row and changes no row's markup contract. The Attention kind reads `gatepasses`, which is the 24th of 41 stores and small. The job card's pass rows are capped at three |
| Sync tick while idle ~0ms of main thread | commit `cd240f7` | Nothing here polls, nothing here measures a row. No `offsetHeight`, no `getBoundingClientRect`, no `getComputedStyle` per row |

Three rules this feature must not break, all of them already paid for:

1. **One string, one insert.** The pass rows, the timeline rows and the away rows are
   built into one string and inserted once. Per-row `appendChild` is the shape that cost
   277ms per page.
2. **The hairline stays an inset shadow on screen.** It takes no height, so a desk row
   holding a 32px button is exactly 32px. 200 rows times 1px of border is 200px of drift
   and a scroll height that lies. The print override in §4.4 is inside `@media print`
   and touches no screen row.
3. **The bill photo goes through the existing photo queue, outside the record**, and the
   return saves with the upload still in flight.

**The 250ms is still a placeholder set on a developer's Mac**, and the gate says so in
its own comment. The real number comes from opening `v2/ui/gallery.html` on an office PC
and pressing "Draw 200 rows". That reading beats every number above, and taking it is an
instruction, not a permission.

---

## 13. What the contract must gain, and the risk in it

Stage 1 named one of these; the rest follow from its own sentences. **None is a styling
choice and none is stage 2's to approve** — they are listed here so the backend slice
does not inherit them by accident, which is exactly how `gatePassNo` got into a read site
with no record behind it.

| Record | Field | Required by | Why no existing field will do |
|---|---|---|---|
| `jobcards` | `gatePassNo`, `gatePassId` | UX §3.2, §6 | v1 never linked a pass to a card. Both are **already read** at `jobcard.js:809` and `:1368`, so the pair is live fiction today |
| `jobcards` | `closeNoBillReason` (string) | `[decision 1]` | `notes` and `remark` are free text; a reason hidden among notes cannot mark the card on Money or in the sign-off view, and decision 1 is explicitly *not a silent override* |
| `jobcards` | `billPhotos` (array of string) | `[decision 1]` | `beforePhotos` / `afterPhotos` cannot say *which* photo is the bill, so a gate reading them "must not claim a bill it cannot see" |
| `gatepasses` | `jobId` (string or null) | UX §3.2 | A card can send out two units. One `gatePassId` on the card cannot express two, and matching by `busId` would collect every pass that bus ever had |
| `components` | `history[].passId` | UX §3.2 ("a send-out entry naming the pass") | The entry already carries `vendor`, `cost`, `billPhoto`, `note`. The pass number in `note` would be unparseable prose |

**The risk, stated plainly.** `v2-ux.md §6` holds that under whole-record
last-write-wins **a field v2 invents is erased the next time a v1 device writes that
record**, and v1 is live on ~100 phones. If that is true of `jobcards`, then a typed
close reason and a bill photo can vanish from a card a v1 device touches, and decision
1's promise — that a card closed without a bill is *visibly* a card closed without a bill
— is not deliverable while both apps run. Stage 3 must **measure this before building
on it**, not assume it: `app.js:4243` (`saveEditJob`) mutates the pulled record in place
rather than rebuilding it, which suggests unknown fields may survive a v1 edit. That is a
reading of the code, not a measurement, and the difference matters. The away state itself
is deliberately free of this: it writes only `outside`, `outsideCity`, `externalVendor`,
`externalCost`, `enterAt` and `outAt`, which are **v1's own fields with v1's own
arithmetic** (`app.js:7735`).

---

## 14. Defects in the code this feature lands on

Three, all in the read path that exists today, all of which would make a correct write
look broken. The first two are stage 1's; the third is new here.

1. **`jobcard.js:1373` prints `p.unit`; the field is `unitName`** (`inventory/03 §3`,
   store 24). The unit line on the slip is blank today.
2. **`jobcard.js:809` and `:1368` read `c.gatePassNo` / `c.gatePassId`**, which exist in
   neither v1's jobcards nor the field table. §13 makes them real.
3. **`jobcard.js:809` reads `c.outsidePlace`. No record has that field** — v1 writes
   `outsideCity` (`app.js:4265`) and the field table lists `outsideCity`. So the away
   place on the card renders empty even when v1 recorded it. Same defect class as 1 and 2,
   found while writing this spec. **The field is `outsideCity`** everywhere in this spec.

One more, not a defect but a live wrong: **`jobs.js` gives a mechanic the Away tab**
(`FILTERS.slice(0, 3)` includes `'away'`), which UX §4 forbids. §5 fixes it.

---

## 15. The falsifiable checks stage 3 owes this feature

A check that cannot fail is decoration. After adding each, **break the thing it covers
and confirm it goes red.**

1. **The gate is the bill.** Close an outside card with one before photo and no bill:
   refused, client and server. Add a bill photo: allowed. Remove the bill, type a reason:
   allowed, and the reason is on the card afterwards. Break it by letting `afterPhotos`
   satisfy an outside card and confirm the test reddens.
2. **The reason is visible where the card is read.** Assert the typed reason appears in
   the card's own state, in Money's outside row and in the sign-off view — three
   assertions, because decision 1 names three places.
3. **A return exists at all.** Take the seeded `sent-out` alternator (`db.js:737`), which
   has **no pass**, and return it: the piece reaches `in-service` on `b1` with
   `refurbCount` 2 and a `return` history entry. Today this is impossible, which is the
   point.
4. **The serial mismatch is recorded and never refuses.** Return with a different serial:
   `serialMismatch` is true, the pass is `returned`, and the unit is back in service.
5. **The mismatch count is not always zero.** A mismatch rate of exactly 0 after a month
   means the serial is being copied off the pass instead of read off the unit, which is
   the failure the whole record exists to catch. One query, read at one month.
6. **No cost field on the pass sheet.** Assert the issue sheet's markup contains no
   input whose `data-field` is `cost`. It is a one-line test and it guards a figure on
   Money.
7. **The pass capability equals `manageComponents`**, both halves: server
   `WRITE_ROLES["gatepasses"] == WRITE_ROLES["components"]`, client the new pass
   capability `== manageComponents` (`caps.js:163`). Remove one role from either side and
   confirm it reddens. And **`outsideJob` stays at `{owner, supervisor}`** — assert a
   storekeeper gets **no** "The bus is away for repair" control and **no** vendor block.
8. **The mechanic's Away tab is absent.** Sign in as a mechanic, open Jobs, assert no
   tab with `data-tab="away"` exists in the DOM. Absent, not empty.
9. **The Attention row can appear and can reach zero.** Needs a fixture item: a
   `gatepasses` record issued 21 days ago, `status: 'out'`. Today there are **no
   `gatepasses` records at all**, so this row has never been drawn. Then assert the row
   exists for an owner, does **not** exist for a storekeeper, and disappears when the
   pass is returned.
10. **The slip prints.** Assert `work.css` has an `@media print` block, that every
    selector in it starts with `[data-v2]`, that it contains no px outside
    `border`/`outline`/`box-shadow`, and that the slip's rows carry a real
    `border-bottom` inside it — the hairline that a box-shadow would lose when background
    graphics are off.
11. **A field tap never navigates.** The existing invariant sweep clicks every `input`,
    `select` and `textarea` on a screen and asserts the route is stable. The three new
    sheets must be in it.
12. **No emoji, no banned CSS.** `scripts/check-floor.py v2 ui` stays green, and
    `test_ui_icons.js` still reports exactly 34 marks. A 35th mark is a decision, not a
    commit.

---

## 16. What a builder must not change, and what they may

### 16.1 Must not

1. **Any token name or value.** All 30 are reused as they stand; each hue's lightness is
   tuned separately for contrast. No new token is needed and none is added.
2. **A colour as a literal in a component.** `hsl()` tokens only. No hex, no `rgb()`, no
   keyword, not `transparent` as a new colour.
3. **A 35th icon.** The cap is 34 and it is reached. The Print button draws `doc`.
4. **The Chrome 109 floor.** No `oklch()`, `color-mix()`, CSS nesting, `@starting-style`,
   view transitions, `@scope`, `subgrid`, relative colour, `light-dark()`,
   `text-wrap: balance`, `Object.groupBy`, `toSorted`, `Promise.withResolvers`.
5. **`transform` and `opacity` only, under 300ms, never a bare `ease-in`.** No new
   animation. Nothing scales in from nothing.
6. **The serial is never pre-filled** on the return. Pre-filling it is the same as not
   asking.
7. **A mismatch never refuses the return.** The unit is in the yard whatever the paper
   says.
8. **The pass number is generated on the device, date-first.** Never a counter: two
   supervisors on alternate shifts are both offline and must not collide.
9. **No cost on the issue sheet.** Nobody knows it yet.
10. **The bill is captured once.** Not on the pass return *and* again on the piece.
11. **Away is `outside`.** The vendor's name is who did the work, not where the bus is.
12. **Absent, not disabled**, for every control a person may not use — and
    `aria-disabled` only for a write in flight, with the label saying what is happening.
13. **No emoji in a rendered string**, including toasts.
14. **No fixed English word outside `ui/words.js`**, and no Hindi fallback to English:
    a missing Hindi value is a build error.
15. **`--read-w` is not applied to the Away tab or the piece register.** They are tables
    and want the width; only the slip is prose.
16. **No `@page` rule in `work.css`.** Its scope test requires every selector to start
    with `[data-v2]`.

### 16.2 May

1. **Compose freely** from the primitives — rows in cards, tabs in sheets, a sheet from
   anywhere.
2. **Add rules to `v2/ui/work.css` and `v2/ui/fuel.css`** for layout that belongs to one
   screen, keeping the `[data-v2]` prefix and sizing from tokens.
3. **Choose the `<datalist>` contents and their order** in §4.1 and §4.3 — the places
   this garage has used before, most recent first, is a suggestion, not a requirement.
4. **Choose the exact wording inside §11's voice rules**, in both languages, and tell the
   owner which ids are PENDING.
5. **Cap the pass rows at something other than three** if a real card turns out to carry
   more. Three is an estimate; the cap line is the requirement.
6. **Reject any number here that a measurement contradicts** — including the 250ms row
   budget — and say so in the stage-3 report rather than working around it.
7. **Tighten the 200-row threshold once an office PC has been measured.** That is an
   instruction, not a permission.

---

## 17. Status

**ok = true.** Stage 1 is complete enough to build from: every screen it names has a
spec above, every state is specified beside its happy path, and nothing was left for a
builder to decide.

### 17.1 What I decided because stage 1 left it open — these belong back in the UX doc

1. **The away period is `enterAt` to `outAt`, and the frozen days are arithmetic.** Stage
   1 asked for "the days it was away frozen onto the card" without saying where the two
   moments live. They are v1's own fields with v1's own relabelling (`app.js:6101`,
   `owReached`) and v1's own formula (`app.js:7735`). **No field is invented for the away
   state**, and v1 reads the same number v2 writes. The alternative — a new
   `outsideDays` number — would have been a figure only v2 understands.
2. **The gate pass's bill photo satisfies the card's close gate.** Decision 1 says the
   gate is the vendor's bill; UX §5 drops capturing the bill twice. Requiring a second
   photograph of the same bill onto the card would reinstate the double capture. So the
   gate accepts a bill on the card **or** a bill on a returned pass of that card.
3. **An outside card's bill needs its own photo group**, because a gate that reads
   `afterPhotos` cannot tell a bill from a photo of a wheel, and stage 1 says the gate
   must not claim a bill it cannot see. §13 names the field and the risk.
4. **A card may carry more than one pass.** Stage 1 says "On the card: this pass's
   number", singular, which cannot express two units out at once. The block lists every
   pass with `jobId === card.id`, newest first, capped at three with a count line;
   `gatePassNo` / `gatePassId` keep the most recent so the existing read sites stay
   correct.
5. **The Attention row's basis is `14 - daysOut`**, which puts it in band 3 with the
   expiring papers, under the Papers tab. Stage 1 said "ranked below a gate hold and below
   money" and named no band. This needs no change to the comparator and creates no
   cross-unit comparison.
6. **"Back in our yard" is a confirmation, not a sheet.** It is one question with no
   fields, and `V2.confirmDialog` starts focus on "Not yet", so a reflexive Enter does not
   bring a bus home that is still in Jaipur.
7. **The place suggestions are a native `<datalist>`.** Stage 1 asked for "the places this
   garage has used before offered as he types" and that is the only way to do it with no
   JavaScript on a Core 2 Duo.
8. **The mechanic loses the Away tab.** Stage 1 forbade the tab for a role without
   `outsideJob`; the code gives a mechanic exactly that tab today, so this is a change,
   not a confirmation.
9. **`ftRepairCost` is deleted from the send-out sheet.** Stage 1 said the new pass sheet
   must carry no cost and that the two sheets become one. It did not say the live field
   goes; it does, or the merged sheet keeps the thing stage 1 forbade.

### 17.2 Still the owner's, carried forward from stage 1 — none of it blocks the build

- Does decision 3 also open **marking a bus away** to the storekeeper and the crew
  manager? This spec builds the narrow reading: no. One sentence settles it and no screen
  is redrawn either way.
- May the storekeeper and the crew manager **re-read a vendor's bill** in the piece
  register after the return? This spec says no, deny by default. §8 is the only place that
  changes if the answer is yes.
- Is **14 days** still the right overdue threshold? This spec uses 14 and **says so on
  the row**, so a different number changes one constant and one sentence.
- Who physically **hands the printed slip** to the vendor's man? There is no gatekeeper
  among the eight roles, so the paper is the only handover. Nothing on a screen depends on
  the answer.

Two of these are live-behaviour changes the owner deploys, not stage 3:
`sync_server.py:1291` (the close gate) and `sync_server.py:1205` (the pass's roles).
Stage 3 builds both and hands over the command.

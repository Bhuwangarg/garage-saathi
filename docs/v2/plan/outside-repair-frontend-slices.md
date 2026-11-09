# Outside repair — the frontend cut

**Stage 3, client side. Slug: `outside-repair`. The cut, not the build.**
Written 2026-11-09. Input: `docs/v2/plan/outside-repair-ui.md` (stage 2, `ok = true`),
`docs/v2/plan/outside-repair-ux.md` (stage 1, the owner's three decisions recorded),
`docs/v2/inventory/03-data-and-sync.md` (store 24, `gatepasses`), and the code the flow
lands on. Precedent for the shape of this document: `docs/v2/plan/v2-frontend-slices.md`.

This session dispatches no builder and writes no screen. The workflow dispatches from
§1. **Builders run no git command**: six of them work in one tree at once and the
integrator commits.

---

## 0. The problem this cut has to solve

The feature is seven screens' worth of change concentrated in one file. UI §0 changes
**five blocks of the job card** (3, 4, 12, 13, 14), **six sheets**, and four other
screens. Three things decide the cut.

**(a) Three of the six sheets are a shared primitive, not job-card code.** "New gate
pass" (§4.3), "The slip" (§4.4) and "Back from the vendor" (§4.5) are reached from the
card *and* from a piece on Fuel & tyres, and the spec says so in one sentence: *"Same
sheet, same questions, same slip, same number; the only difference is the door"* (§4.3).
If they live in `jobcard.js`, then `fuel.js` and `jobcard.js` are one slice. They go in a
new file, `v2/ui/passes.js`, beside `ui/photos.js`, and land before any screen consumes
them. The three sheets that are the card's alone — "The bus is away" (§4.1), "Back in our
yard" (§4.2), "Close without the bill" (§4.6) — stay in `jobcard.js`, because nothing
else opens them.

**(b) The arithmetic goes one layer lower again.** The away days (§3.1), the close gate
(§3.2), the pass number (§4.3), the pass-to-card resolution (§3.1), the 14-day threshold
(§6) and the new capability are read by **five** of the six slices. Each is one
expression in one place: `v2/outside.js` + `v2/caps.js`. `inventory/02 §6.2` records what
two expressions of one rule cost here — the mechanic's own-cards rule was written twice,
one copy was never enforced, and a mechanic completed a part request on somebody else's
card.

**(c) Jobs (#3) and the Job card (#4) are one slice, because `test_v2_work.js` is one
file.** They would otherwise be two, and both would have to edit it: the card's slice
changes the gate assertions at `test_v2_work.js:605-606` (an outside card satisfied today
by **one before photo** — the exact thing UI §15.1 tightens) and the vendor-block
assertions at `:932-933`, while the Away tab's change makes `:402` — *"a mechanic's
filter strip is three tabs"* — read two (UI §5, §15.8). Two builders in one file is the
one thing a cut may not produce, so they are one slice, which is also how
`v2-frontend-slices.md` cut slice W and for the same reason: the away filter takes cards
out of Open, so the board and the card are two views of one record.

**Two files are new and need wiring the builders do not own** — see §4.

---

## 1. The table

`✱` = new file. **Every file appears in exactly one row**, checked mechanically in §3.
A slice may consume only a lower order. A screen slice owns its existing test file as
well as its new one, so that an assertion this feature **changes** can be changed by the
builder whose change it is — and `scripts/predeploy-gate.sh` is the reviewer's check that
none of them was weakened instead.

| Order | Slice | Owns | Exports | Consumes | The check that proves it works |
|---|---|---|---|---|---|
| **0** | **OR1 — the outside rules and the pass capability** | `v2/outside.js` ✱, `v2/caps.js`, `test_v2_outside.js` ✱ | `Outside.OVERDUE_DAYS`, `Outside.CAP`, `Outside.isOutside`, `Outside.awayDays`, `Outside.daysOut`, `Outside.passesFor`, `Outside.gateMet`, `Outside.gateState`, `Outside.passNo`, `Outside.mismatch` (§2.1 for exact signatures); `Caps.PERMS.gatePass` | nothing. Every function is **pure** — rows and `now` are passed in; no `DB`, no `S.cache`, no `Date.now()` inside | `test_v2_outside.js`: `gatePass == manageComponents` as sets **and** `outsideJob` still `['owner','supervisor']` — remove one role from either side and it reddens (UI §15.7); `awayDays` freezes on `outAt`, and with no `enterAt` is `null`, never `0` (§3.1); `gateMet` is false for one before photo, true for a bill on the card, true for a bill on a **returned** pass of that card, true for a typed reason (§15.1); `passNo` is date-first, never a counter, and 10,000 ids collide 0 times (§4.3) |
| **1** | **OR2 — the three shared sheets, the class contract, the print rule** | `v2/ui/passes.js` ✱, `v2/ui/work.css`, `v2/ui/fuel.css`, `test_v2_passes.js` ✱ | `Passes.issueSheet`, `Passes.slipSheet`, `Passes.returnSheet`, `Passes.issueWrite`, `Passes.returnWrite`, `Passes.vals`, `Passes.WORDS` (§2.2); the CSS class contract of §2.3 | OR1 (`Outside.*`); `V2.openSheet/closeSheet/confirmDialog/toast`, `photoCapture`, `icon`, `figure`, `W.register`/`w` | `test_v2_passes.js`: the issue sheet's markup contains **no** `[data-field="cost"]` (§15.6); the return sheet's serial is **never** pre-filled, and `returnWrite` with a different serial marks the pass `returned`, records the typed serial and **still** returns the piece (§15.4, and §2.5 on who owns the flag); a return with **no pass** still writes (§15.3); `work.css`'s `@media print` carries `[data-v2] .jc-pass .v2row { box-shadow: none; border-bottom: 1px solid var(--line) }`, every selector in the file starts with `[data-v2]`, there is no `@page` and no `print-color-adjust` (§15.10); every class in §2.3 exists; `scripts/check-css-floor.sh v2 ui` green |
| **2** | **OR3 — Jobs (#3) and the Job card (#4)** | `v2/screens/jobcard.js`, `v2/screens/jobs.js`, `test_v2_work.js`, `test_v2_outside_card.js` ✱ | `Jobcard.awaySheet`, `Jobcard.backConfirm`, `Jobcard.noBillSheet` (for the test); no change to `Jobcard.guard`/`crew` | OR1, OR2, `photoGrid`, `V2.*`, and the file's own `row/btn/card_/vals/sheet` helpers | `test_v2_outside_card.js`: a **storekeeper** gets no away control, no vendor block, no bill group (§15.7 — absent, not disabled); the away branch of `nextStep()` **never** returns `kind: 'crew'` (§3.4); block 4 draws the four outside gate states and carries the typed reason verbatim (§15.1, and two of §15.2's three places); the close path on an unmet gate offers a **visible** "Close without the bill" and an empty reason fails the **field**, not the button (§4.6); a card with 7 passes draws 3 rows plus the cap line (§3.6); a mechanic's tab strip has no `data-tab="away"` (§15.8); an away row's `.act` is one `figure(days,{unit:'d'})` with no `.figure-note` inside the row at either density (§5); clicking every `input`/`select`/`textarea` in the three new sheets leaves the route stable (§15.11) |
| **2** | **OR4 — Attention (#2), the overdue-unit row** | `v2/screens/attention.js`, `test_v2_attention.js`, `test_v2_outside_attention.js` ✱ | nothing | OR1 (`Outside.daysOut`, `OVERDUE_DAYS`, `CAP`) | `test_v2_outside_attention.js`: with a pass issued 21 days ago at `status:'out'` the row exists for an **owner**, does **not** exist for a **storekeeper**, and **disappears** when the pass is returned (§15.9); a unit out 20 days ranks above one out 15 (`basis = 14 - daysOut`, band 3, Papers tab); a failed `gatepasses` read drops **this kind only** and never ranks it at zero; the `.sub` states the 14-day limit in words |
| **2** | **OR5 — Fuel & tyres (#10), the other door** | `v2/screens/fuel.js`, `test_v2_fuel.js`, `test_v2_outside_fuel.js` ✱ | nothing | OR1, OR2 (`Passes.issueSheet`, `Passes.returnSheet`, `Passes.*Write`) | `test_v2_outside_fuel.js`: the word ids `ftGateSeam` and `ftRepairCost` are **gone from the file**, and the send-out sheet has no `[data-field="cost"]` (§7, §15.6); all four of owner/supervisor/store/crewmanager get the **same** sheet and the `o.gatepass` branch is gone; a piece at `sent-out` draws a third action that opens the return sheet (§15.3); a `sent-out` piece with no pass reads "Out 3 days. No gate pass was made."; the three buttons stay at `--tap` and wrap at 360px |
| **2** | **OR6 — Store (#6), the piece timeline** | `v2/screens/store.js`, `test_v2_store.js`, `test_v2_outside_store.js` ✱ | nothing | OR1 (`Outside.daysOut`, `CAP`) | `test_v2_outside_store.js`: a `send-out` entry names its pass, and a still-out piece carries the days in `.act`; a `return` entry says "Serial matched" or names **both** serials and is not truncated; for a reader **without** `outsideJob` a `send-out` or `return` entry that carries money draws **no figure and no bill photo**, and the `.act` is **empty, not a dash** (§8) — an entry with a `passId` carries no money at all (§2.5), so both paths are asserted |

**6 slices, 20 files, each in exactly one row.**

### 1.1 Who runs on which model

`sonnet`: **OR1, OR4, OR6** — the spec leaves no decision (one expression per rule; one
declarative `KINDS` entry; one row shape each).
`opus`: **OR2, OR3, OR5** — OR2 composes three sheets and owns the print rule the
gatekeeper checks; OR3 is five blocks, three sheets and a tab strip across the two
largest files in v2; OR5 deletes two live word ids and re-points a live sheet for four
roles.

---

## 2. The seams, written out, because the later slices are written against them

### 2.1 `v2/outside.js` — OR1's exports, verbatim

Plain script, ES5, `(function (root) { ... })(window)`, `root.Outside` plus
`module.exports`, exactly like `v2/cost.js`. **Pure**: every function takes its rows and
its `now`; none reads `DB`, `S.cache` or the clock.

```
Outside.OVERDUE_DAYS                        // 14  (app.js:4789; stated on the row, UI §6)
Outside.CAP                                 // 'gatePass'
Outside.isOutside(card)         -> boolean  // card.outside === true || (card.externalVendor || '') !== ''
Outside.awayDays(card, now)     -> number|null
Outside.daysOut(pass, now)      -> number|null
Outside.passesFor(card, passes) -> [pass]
Outside.gateMet(card, passes)   -> boolean
Outside.gateState(card, passes) -> { key, passNo, reason }
                                   // key: 'need-bill' | 'bill-card' | 'bill-pass' | 'no-bill-reason'
Outside.passNo(recordId, atMs)  -> 'OJ-261109-AB12'
Outside.mismatch(pass, typedSerial) -> boolean
```

`awayDays`: `(outAt - enterAt)` when both exist, else `(now - enterAt)`, else **`null`**
— and `null` is a dash and "No data", never `0`, because *"a card marked away this minute
with no reached time is not a card that has been away zero days"* (UI §3.1). `enterAt` is
the reached-the-workshop time, `outAt` is "Back in our yard"; this is v1's formula on v1's
own fields (`app.js:7735`, `jobDownDays`), so **no field is invented** for the away state.

`gateMet`, exactly as UI §3.2 writes it:

```
gate met := (c.billPhotos || []).length >= 1
         || any pass of this card has status 'returned' and a billPhoto
         || c.closeNoBillReason is a non-empty string
```

`passesFor`: `pass.jobId === card.id`, newest `issuedAt` first; a pass with **no** `jobId`
is included only when `card.gatePassId` names it (UI §3.1). The cap at three and the count
line belong to the caller.

`passNo`: date-first, generated on the device, tail off the record id
(`OJ-YYMMDD-XXXX`) — **never a counter**: two supervisors on alternate shifts are both
offline (UX §6).

`Caps`: `PERMS.gatePass = ['owner','supervisor','store','crewmanager']`, which must equal
`manageComponents` exactly (decision 3), and `outsideJob` **stays**
`['owner','supervisor']` (UI §8: widening it would hand a storekeeper "The bus is away for
repair" and the vendor's money, which nobody decided). The new capability goes in the
`gates` list of the `jobs`, `jobcard` and `fuel` screen entries, or
`test_v2_router.js`'s "no capability is held without a path" sweep reddens — which is the
sweep doing its job, not a test to edit.

### 2.2 `v2/ui/passes.js` — OR2's exports, verbatim

```
Passes.issueSheet(o)  -> html     // o: {bus, pieces, card|null, piece|null, role}
Passes.slipSheet(o)   -> html     // o: {pass, bus, mayReceive}
Passes.returnSheet(o) -> html     // o: {pass|null, piece, bus|null, ageWords}
Passes.issueWrite(o)  -> Promise<{ok, pass, reason?}>
Passes.returnWrite(o) -> Promise<{ok, pass, piece, reason?}>
Passes.vals(kind)     -> {field: value}    // kind: 'pass' | 'return'
Passes.WORDS                               // the table it registers, for the tests
```

Each sheet carries `data-sheet="pass" | "slip" | "return"` and one `[data-field]` per
input, read once at save (UI §4). `issueSheet` has **no cost field** (§4.3).
`returnSheet` **never** pre-fills the serial (§4.5) and runs the mismatch question through
`V2.confirmDialog`, which **never refuses the return** (§4.5). The slip's Print is
`window.print()` plus the `@media print` block — no second layout, no new window, works
offline (§4.4). **On save the issue sheet is replaced by the slip in the same panel**, not
a second sheet over the first (§4.3). `returnWrite` writes the pass, the piece **and**
the card's `externalCost` in one save — the bill is captured **once** (§4.5, UX §5).

### 2.3 The CSS class contract — OR2 writes it, OR3/OR5/OR6 consume it

| Class | File | What it is |
|---|---|---|
| `.jc-out` | `work.css` | Block 13's `.card`: the outside block. At desk a row is one line — the `.sub` moves into `.act` (UI §2) |
| `.jc-out-cap` | `work.css` | `--t6` `--ink-dim`: "3 of 7 gate passes shown, newest first." |
| `.jc-pass` (exists) | `work.css` | The slip. At desk `max-width: var(--read-w)` — it is prose, not a table |
| `.jc-pass-no` | `work.css` | `--t4`, 600, `font-variant-numeric: tabular-nums`: the pass number |
| `.jc-pass-by` | `work.css` | `--t6` `--ink-dim`: "Issued by…" / "Received by…" |
| `.oj-sheet` | `work.css` | The panel wrapper of all three shared sheets; fields full width |
| `.oj-stat` | `work.css` | `--t5` statement line with a mark ("Went out as…", "Will print:…") |
| `.oj-why` | `work.css` | `--t6` `--ink-dim` explanation (the serial-why, the hints, the reading age) |
| `.oj-err` | `work.css` | The message **beside** an `aria-invalid` field, in `--bad`. Never colour alone |
| `@media print` | `work.css` | Inside the existing block: `[data-v2] .jc-pass .v2row { box-shadow: none; border-bottom: 1px solid var(--line); }` — Chrome drops box-shadows when Background graphics is off, which is the default (UI §4.4) |
| `.ft-pacts` (exists) | `fuel.css` | Three `.btn`s at `--tap`, `--s2` gap, wrapping at 360px. Tap targets do not shrink because a third button arrived (UI §7) |

No new token, no new icon (the cap is 34 and reached — Print draws `doc`), no new colour,
no new stylesheet. `.tabs`, `.field`, `.select`, `.num`, `.badge-*`, `.btn-quiet`,
`.sr-only` and `.figure` all already exist in `components.css` and are **not** OR2's to
change.

### 2.4 Word ids, partitioned so no two slices register the same one

`W.register` **throws** when an id's half is already registered (`v2/ui/words.js:128`), so
this partition is binding, not tidiness. Hindi for a reused id is copied from the
`i18n-hi.js` line UI §11.1 names — reuse, do not rewrite. A new id ships `hi: ''` and is
reported to the owner as PENDING (UI §11.2).

| Slice | Ids it registers |
|---|---|
| OR2 | every `oj*` in UI §11.1 (`ojNew` … `ojConfirmMismatch`), plus new `jcPassIssuedBy`, `jcPassReceivedBy`, `jcPassMaking`, `jcPassWork`, `ftReturnAge`, `ftReturnNoPass`, `ftReturnFitBack`, `ftReturnShelf`, `ftReturnCharge`, `ftReturnRemarkPh`, `ftReturnRecording`, `ftMismatchYes`, `ftMismatchNo` |
| OR3 | every `jc*` in §11.2 **except** the four OR2 holds; every `jb*` (`jbAwayWhere`, `jbAwayNoVendor`); the reused `ow*` (`owHint`, `owCity`, `owCityPh`, `owAway`, `owNoCity`, `owReached`, `owVendNote`, `owWhere`, `owAwayFor`) and `addPhotoNote` |
| OR4 | `attOutsideUnit`, `attOutsideWhy` |
| OR5 | `ftActReturn`, `ftOutOnPass`, `ftOutNoPass` — and **deletes** `ftGateSeam` and `ftRepairCost` |
| OR6 | `stHistSendPass`, `stHistSerialOk`, `stHistSerialBad` |

### 2.5 Where the backend contract binds this cut

`docs/v2/plan/outside-repair-contract.md` was written against the same spec and decides
three things a client slice would otherwise guess at. Read the named sections, not the
whole file.

- **`serialMismatch` is the server's, derived** (contract §4.1):
  `norm(returnSerial) != norm(unitSerial)`, upper-cased with spaces and hyphens removed,
  and `false` when `unitSerial` is empty — *there is no paper to disagree with*. The
  client computes the same thing to draw the confirmation and to read offline;
  `Outside.mismatch` (OR1) **is** that mirror and is held to the server's normalisation.
  So OR2 writes the flag locally and asserts nothing about its provenance; the record's
  value is the server's.
- **Vendor money lives in exactly one place** (contract §4.3): when a return has a pass,
  the amount and the bill photo are on the `gatepasses` record and the
  `components.history` entry carries `passId` and **no** money. Only a legacy entry — the
  pieces already at `sent-out`, which must stay returnable — carries `cost` and
  `billPhoto` itself. OR2 writes it that way; OR6 draws both cases.
- **`jobcards.billPhotos` is capped at 4** (contract §4.2) and `refurbCount` is
  server-derived from the count of `return` entries. OR3 refuses a fifth bill tile;
  OR2 may increment `refurbCount` locally for the offline view, which the server then
  re-derives to the same number.

The fixture rows the contract adds (`gp-1` out 21 days, `gp-0` returned with a bill, `j3`,
`j4`) belong to the backend slice and to `v2/db.js`, which **no frontend slice owns**.
Every check in §1 builds its own rows in its own test, the way `test_v2_work.js` and
`test_v2_fuel.js` already do, so no frontend slice waits on a seed.

---

## 3. Files owned by no slice

`v2/index.html`, `v2/sw.js`, `test_v2_boot.js`, `test_v2_router.js`, `v2/db.js`,
`v2/ui/icons.js`, `v2/ui/tokens.css`, `v2/ui/components.css`, `v2/screens/money.js`
(see §5), `scripts/*`, `i18n-hi.js`, `sync_server.py`, and every v1 file.

A builder that needs a change in one of these **reports it in its finding and moves on**.
Two of them need a change in this feature and it is the integrator's: §4.

The mechanical check of the cut, run before dispatch:

```
20 paths across 6 rows, 20 unique — no file is claimed twice.
```

---

## 4. The glue, which belongs to the integrator and not to a builder

`v2/outside.js` and `v2/ui/passes.js` are new top-level scripts. `test_v2_boot.js` holds
the script order as data and asserts (a) `index.html` lists every script in dependency
order, (b) **every script `index.html` lists exists on disk**, and (c) `sw.js`'s precache
is `index.html`'s list, entry for entry. So the two files cannot be wired before they
exist, and the moment they exist an unwired file has to be visible.

**Done in this cut** (glue, not a screen): both names are added to `test_v2_boot.js`'s
`ORDER` and `DEPS` at the position their dependencies put them — `ui/passes.js` after
`ui/photos.js`, `outside.js` after `cost.js` — which is what the file's own comment asks
for: *"Entries not yet on disk are listed at the position their dependencies put them, so
the slice that lands one has somewhere to put it rather than a guess."* The comparisons
filter to what exists, so this is green today (`node test_v2_boot.js`: all ok) and goes
**red the moment a file lands unwired** — confirmed by landing a placeholder
`v2/outside.js` and watching *"index.html lists every script, in the declared dependency
order"* fail, then removing it.

**Owed by the integrator once OR1 and OR2 have landed, in one commit:**

```
v2/index.html   <script src="ui/passes.js"></script>   after ui/photos.js
                <script src="outside.js"></script>     after cost.js
v2/sw.js        'ui/passes.js' and 'outside.js' in SHELL, in the same two positions
```

Nothing else: no new stylesheet (OR2 writes into `work.css` and `fuel.css`, both already
linked and precached), no new screen file, no route, no icon, no token.

---

## 5. What this cut does **not** cover, and why

**Money (#7) — UI §3.2's third reader of the typed reason has no row to land on.**
§3.2 says the close-without-bill reason *"appears on Money's outside split row and in the
owner's sign-off view, as a `--t6` `--ink-dim` line under the card's name"*, and §15.2
asks for three assertions. Measured in the code: `v2/screens/money.js` has **no row that
names a job card**. Its outside figure is one aggregate line in `totalCard()`
(`money.js:967-978`) and one column of the per-**bus** table (`money.js:1270-1297`);
`Cost.forBus` sums `jobcards.externalCost` into a number, not rows (`v2/cost.js:198-203`).
There is no drill-down from either to a card.

So the Money half of decision 1 needs a screen decision — which row, under what
capability, at what cap, in which of the nine states — that the UI spec does not make.
**No slice is cut for it and no builder is given it**: inventing it is how a screen gets
built that nobody asked for. Two of §15.2's three places are covered by OR3 (the card's
own state, and the sign-off read of the card); the third is open, and is reported up with
this cut.

**The backend half is not here.** `sync_server.py:1291` (`_has_proof`, the close gate) and
`sync_server.py:1205` (`WRITE_ROLES["gatepasses"]`) are live-behaviour changes the owner
deploys (decisions 1 and 3; UI §17.2), as is the `jobcards` field contract of UI §13.
They belong to the backend cut — and UI §13's risk, *a field v2 invents being erased the
next time a v1 device writes that record*, must be **measured** before OR3's
`closeNoBillReason` is relied on, not assumed.

**The live map is not here.** `docs/v2/plan/live-map-ux.md` is stage 1 only; there is no
`live-map-ui.md`. No UI spec, no cut — stage 2 runs first, and `outside-repair-ux.md §5`
already stands on that: the away card's latitude, longitude and map link are dropped here
and arrive with the map, if the owner wants them.

---

## 6. The rules every brief repeats, from UI §16.1

No new token, no literal colour, no 35th icon, nothing outside the Chrome 109 floor,
`transform`/`opacity` only and under 300ms with **no new animation**, the serial never
pre-filled, a mismatch never refusing a return, the pass number never a counter, no cost
on the issue sheet, the bill captured once, away is `outside`, **absent not disabled** for
a control a person may not hold, `aria-disabled` only for a write in flight with the label
saying what is happening, no emoji in any rendered string, no English outside a
`W.register` table, no Hindi fallback to English, no `@page` in `work.css`, one string and
one insert for every list of rows, and the field guard before `[data-act]` in every
delegated listener (`predeploy-gate.sh:508`).

And the one that is not about styling: **a check that cannot fail is decoration. After
adding one, break the thing it covers and confirm it goes red** (`CLAUDE.md`, UI §15).

# Outside repair — review, the flow

**Stage 5 of `docs/v2/PIPELINE.md`. Slug: `outside-repair`. One lens: the flow.**
Reviewed 2026-11-09 at `a7002ad` on branch `launch-v2`. Read-only on source;
nothing was changed, nothing was pushed, nothing touched production.

# FIX FIRST — do not ship this to the yard yet.

The flow is **shorter** than stage 1 promised on all four paths, the states the UI
spec listed are nearly all built, and the one-way door at `fuel.js:1431` is genuinely
closed. Two things stop it: **every gate pass this feature issues prints without a
chassis number and without an engine number** — the slip is the whole reason the
record exists, and the three identifiers are frozen after issue — and **the job card
shows nothing after any write made on it**, so the supervisor's flagship action gives
him no evidence at all that it landed. I reproduced a duplicate gate pass for one
starter motor from that second one, in a browser, by doing what a person would do.

Neither is a design question. Both belong to a slice.

---

## How this was walked

A real browser, not node: Chrome headless over CDP against
`python3 -m http.server` on `/v2/`, one wiped IndexedDB per run, the contract-§10
fixtures seeded from `v2/db.js`'s own `seedIfEmpty(true)`, and the session entered
through `Boot.enter(user)`. Signed in as **supervisor, owner, store, crewmanager and
mechanic (u-m1 and u-m2, the assignee)**. No sync server, so every reading below is
the offline case, which stage 1 calls the normal one. Taps were counted by performing
the flow, from the screen already open; typing is not a tap and a `<datalist>`
suggestion is one tap, which is the assembly doc's own basis.

The scripts are in
`/private/tmp/claude-501/-Users-bhuwangarg-Downloads-claude-test-garage-saathi-launch/05316e8a-78b9-47a5-af6b-7b095cce3233/scratchpad/walk/`
(`drv.js` is the driver; `w*.js` are the walks; `repro-chassis.js` is finding 1 in node).

---

## 1. Every pass this feature issues prints with no chassis and no engine number

**`v2/ui/passes.js:355`** (the write), **`:180-182`** (the "Will print" line),
**`:231-232`** (the slip).

```js
// v2/ui/passes.js:355
regNo: str(o.bus.regNo), engineNo: str(o.bus.engineNo), chassisNo: str(o.bus.chassisNo),
```

No `buses` record in this system has `engineNo` or `chassisNo`. The fields are
`engine` and `chassis` — `v2/db.js:706` seeds them, `v2/screens/buses.js:1157-1158`
reads them, `buses.js:1497-1498/1797` writes them, and `sync_server.py:3670` lists
the store's five text fields as `("regNo", "company", "model", "chassis", "engine")`.
So both reads are `undefined` and `str()` turns them into `''`.

**v1 got this right, in the file stage 1 cites.** `app.js:4902-4903`:

```js
engineNo: b ? (b.engine || '') : '',
chassisNo: b ? (b.chassis || '') : '',
```

**The concrete case.** Supervisor → job card `j9` on bus `b1` (`RJ14 PA 1023`,
`chassis: 'MAT4470'`, `engine: 'ENG88231'`) → "Send a unit out on a gate pass" →
vendor "Sharma Auto Electricals" → tracked piece "Tyre FR · MRF-9921" → "Make the
gate pass". The record written to `gatepasses`:

```
{no:"OJ-261109-RG9K", busId:"b1", regNo:"RJ14 PA 1023",
 engineNo:"", chassisNo:"",  unitName:"Tyre FR", unitSerial:"MRF-9921", ...}
```

and the slip on screen — the thing he taps Print on and hands to the vendor's man —
reads `Sharma Auto Electricals / RJ14 PA 1023 / Tyre FR / Serial MRF-9921` with no
`Chassis … · Engine …` line at all. The sheet's own promise, `Will print: RJ14 PA
1023`, omits them too, so he cannot even see what is missing or type it in.
Reproduced from both doors (job card and the piece on Fuel & tyres) and in node
against a seed-shaped bus (`repro-chassis.js`).

**What it costs.** Contract §4.1 marks the three identifiers `COPIED at issue, frozen
after it` and §6.2 freezes them, so this is not repairable later: a pass issued this
week can never be given its chassis number. UX §1 says the supervisor needs "a piece
of paper to send with the unit so the vendor's shop has something with our number on
it"; two thirds of our number is not on it. The one case where that matters is the
one the whole record exists for — a dispute with a vendor about which unit came back
— and it is a regression against the live v1 app, which 100 people use today.

**Why no check caught it.** `test_v2_passes.js:59` invents its own bus:
`const BUS = { id:'b1', regNo:'…', engineNo:'ENG88231', chassisNo:'MAT4470' }`, and
`:155-156` then asserts `g.engineNo === 'ENG88231'`. The check is named
*"issueWrite writes a date-first number and copies the bus identifiers"*, it is green
(`node test_v2_passes.js` → 12 checks, all ok), and it cannot ever go red for the
real case, because its fixture is the only bus in the world with those field names.
`test_v2_outside_db.js:234` has the same literal. **Slice to change: OR2** (one line
in `passes.js`), and the two fixtures with it, or the check stays decoration.

---

## 2. The job card shows nothing after any write made on it; the away save has no toast either

**`v2/screens/jobcard.js:2038`** (`redraw()`), **`v2/shell.js:799-804`** (`enter()`),
**`v2/screens/jobcard.js:1531`** (`load()`).

`redraw()` is `Shell.mount(ID, {id: here()})`. `Shell.mount` calls `leave(id)` then
`enter(id)`, and **both return early when the screen is already the one mounted**
(`shell.js:790`, `:800`). So a same-screen re-mount never fires the screen's `mount`
hook, `jobcard.js:load()` never runs, `Cache.load` is never called, and the body is
re-rendered from a `S.cache` that still holds the pre-write row. Instrumented:
`Shell.mount` called twice after an away save, `Cache.load` called **zero** times,
`DB.dirtySnapshot()` still listing `jobcards`, the cache row still `{}` and the disk
row `{outside:true, outsideCity:'Kota'}`.

**This is pre-existing and not this feature's code.** `v2/shell.js` is not in
`git diff --name-only 93a32a5..a7002ad`, and the same staleness is demonstrable on the
untouched Start-time save (`jobcard.js:1966`, same `saveField` + `closeSheet` +
`redraw` shape). But this feature put its flagship action on that path and gave it no
toast, so it is where the defect becomes a flow failure.

**The concrete case, as the supervisor.** Card `j2`, bus `RJ14 PB 4567`:

1. "The bus is away for repair" → Town "Kota" → Save. The sheet closes.
2. The card redraws with **no away block, no "In Kota", no "Away for N days"**, the
   action still reading **"The bus is away for repair"**, the close gate still reading
   "To close: 2 photos before, 2 after", the next step still "Add the enter time" —
   **and no toast.** Zero evidence anything happened. Waited 2.5 s: unchanged.
3. Leave the card and come back: everything is correct.

UX §3.1 step 3 is *"He sees the card now saying the bus is away, in that place, and
the card has moved from Open to Away"*. He does not. UI §4.1's `data-busy` and
"Saving…" are there, so the button flickers and settles back to the same label.

Re-opening the sheet, which is what a person does next, shows **both fields empty** —
no clue the town was already saved. Verified.

**And it produces a duplicated slip.** Same card, "Send a unit out on a gate pass" →
vendor / unit "Starter motor" / serial ST-4410 → "Make the gate pass" → slip → Close.
The card behind it shows **no pass row and still says "No vendor recorded yet"**,
while the record holds `gatePassNo:"OJ-261109-VCYU"` and the vendor. Doing the obvious
thing — issuing it again — gives:

```
j4's passes: OJ-261109-VCYU  Starter motor ST-4410  out
             OJ-261109-RM1H  Starter motor ST-4410  out
```

Two numbers, two slips, one unit. UX §1 is explicit that this supervisor is
interrupted mid-task ("while on a call", [E] d738a6e). The second pass never returns,
so it sits at `out` for ever and surfaces on Attention at day 14 as a unit at a vendor
that is not at a vendor — which is exactly the always-there row UX §3.4 forbids.

**Which paths are affected, and which are not.** Affected, all on the job card:
the away save (no toast — worst), "Back in our yard" (no toast; the action stays
"Back in our yard" and a second confirm re-stamps `outAt`), the pass issue (slip gives
feedback, card does not), the return (toast fine, card stale), the close-without-bill
(toast fine, card stale — the "Closed with no bill" row and the typed reason only
appear after re-navigation). **Not affected: Fuel & tyres.** `fuel.js:refresh()` reads
the pieces again itself, and the piece row updated in place after a return
(`In service`, `refurbCount` 1→2, back on `b1`) with no re-navigation. That is the
pattern the card needs.

**Slices to change: OR3** (the five card write paths need the screen's own re-read,
or a toast at minimum on the away save and the back-in-yard). The shell fix is bigger
than this feature and belongs to whoever owns `v2/shell.js`.

---

## 3. A mechanic is still told to start work on a bus standing in another town

**`v2/screens/today.js`** (the mechanic's "Your jobs" block), reached in two taps.

UX §3.1 step 3: *"Its next step is no longer 'put somebody on this job' — nobody from
our garage is in Jaipur"*. The job card honours that. The mechanic's front door does
not, and UX §4's five screens do not include Today (#1).

**The concrete case.** `j4` is away in Jaipur (`outside:true`, `outsideCity:'Jaipur'`)
and assigned to `u-m2` (Imran). As Imran:

- **Jobs board**: "No cards for you. The supervisor will put your name on one." —
  correct, the Away tab is absent for a mechanic (verified: his tabs are `Open`,
  `Completed` only).
- **Today**: first row of "Your jobs" is *"RJ14 PB 4567 — Gearbox rebuild at outside
  workshop / Opened 2 days ago. Not started."* with a **Start** control.
- Tapping it opens the card, which offers **"I have started"**. Tapping that writes
  `startAt: 1794217398613` onto a card whose bus is in Jaipur. Verified on disk.

The same card, read by the supervisor, says in one block *"Who is on it — Imran"* and
in the next *"In Kota / Marked away. Nobody from our garage is on it."* Both sentences
are true of the record and they contradict each other on one screen. UX §5 dropped
v1's `owCrewNote` ("remove the mechanic") on the grounds that the behaviour would make
the sentence unnecessary; the behaviour is only on the next-step row, and the
assignment survives untouched because UX §3.1 step 2 says "Nothing else on the card is
touched".

**What it costs.** A mechanic walks to an empty bay, or stamps a start time that makes
"days in the bay" and his own score wrong. It is also the one number UX §7 cannot
read: an away card carrying a start time is indistinguishable from work that happened.

**Slice to change: OR3**, plus one line of UX: either the away save clears
`assignedTo`, or the card and Today both refuse to offer a start while `outside` is
true. This is a decision stage 1 left out, not a build error — but it ships with the
feature either way.

---

## 4. Attention's overdue row does not take you to the thing it is about

Named in `outside-repair-assembly.md` §6 item 2; **verified independently here**, and
the second half is worse than one extra tap.

`v2/screens/attention.js` emits the right params. `v2/screens/jobcard.js` contains no
reference to `params.pass` and `v2/screens/store.js` none to `params.pieceId`.

- **Pass with a card.** Attention → *"AC compressor ACC-5512 · CoolAir Jaipur / Out 21
  days. 14 days is the limit. / 21 d"* → route becomes
  `{id:'jobcard', params:{id:'j3', pass:'gp-1'}}` and **no sheet opens**. The pass row
  is on the card, so it is one extra tap. Tolerable.
- **Pass with no card.** I set `gp-0` back to `status:'out'`, 22 days old
  (`componentId:'c-t2'`, `jobId:null`) — the shape contract §10 seeds on purpose. The
  row draws correctly, and tapping it goes to `{id:'store', params:{pieceId:'c-t2'}}`,
  which opens Store **on the Catalogue tab, listing seven spare parts**. The piece is
  on the Pieces tab. Nothing on screen connects the row he tapped to what he is
  looking at.

**What it costs.** This is the owner's row — UX §3.4 is the only part of the flow
written for him, and he has asked for this three times. He taps the one thing Attention
tells him about and lands on a parts catalogue. UI §6 promised "the piece's own home,
which already has a timeline".

`test_v2_outside_attention.js` check 6 is green because it asserts what Attention
*emits*. **Slices to change: OR3 and OR6** (per the assembly).

---

## 5. The return sheet asks a question it cannot act on

**`v2/ui/passes.js:274-278`** draws the fit tabs `if (bus)`. **`:420`** only reads
`v.fit` inside `if (piece && !replay)`.

UI §4.5 row 9: *"Only if the piece came off a bus"*. UI §9: *"The pair is **absent**
when the piece came off no bus"*.

**The concrete case.** Supervisor → card `j3` → pass row "Gate pass OJ-261019-0GP1"
(`componentId: null`, an untracked "AC compressor") → "Record it back". The sheet
draws **"Back on RJ45 CC 8890" / "Onto the shelf as a spare"**. There is no piece
record, so whichever he picks, `returnWrite` ignores it and writes nothing about where
the compressor went.

**What it costs.** One wasted tap on a flow stage 1 budgeted at six, and a sheet that
claims to record a decision it discards. If he picks "Onto the shelf", nothing is on
the shelf and nobody can tell afterwards. **Slice to change: OR2.**

---

## 6. The crew manager and the storekeeper get no vendor suggestions at their only door

Named in the assembly §6 item 3; **verified**. `fuel.js:1215` calls
`Passes.issueSheet` with no `vendors`, so the `<datalist>` UI §4.3 row 3 specifies is
built and **empty**:

```
vendor datalist: {list:"oj-vendors-gp-1lplm5lr860j0", exists:true, opts:[]}
```

**The concrete case.** Crew manager → Fuel & tyres → Pieces → "Send out for repair" on
Tyre FR. The vendor field offers nothing; from the supervisor's job card the same field
offers all five known vendors. Decision 3 gave these two roles the slip and this screen
is their only door (verified: a crew manager reaches `today, people, duty, fuel,
reviews, me`), so **100% of their passes are typed from scratch**. Two spellings of
"Jaipur Tyre Remould" is how Money's outside split stops adding up — and the
supervisor, who has the list, is the one role that does not need it.
**Slice to change: OR5.**

---

## 7. The piece-door return sheet has one sentence wrapped inside another

**`v2/ui/passes.js:283`** interpolates `o.ageWords` into `ftReturnAge` =
`'Read from this phone {ago}'`. **`v2/screens/fuel.js:1161`** passes
`ageLine(piece)`, which is already a whole sentence (`ftStateAge`).

**The concrete case.** Crew manager → Fuel & tyres → Pieces → "Back from the vendor"
on the alternator. The line, read out of the DOM:

```html
<p class="oj-why">[clock] Read from this phone Sent out for repair, updated just now</p>
```

**What it costs.** It is the line UI §4.5 row 2 requires, and it exists for a reason
with teeth — the piece's `history` is rewritten whole, so two people recording one
return lose each other's entries, and the age of the reading is the only warning. A
sentence that does not parse is a sentence nobody reads. It is also English-only
(`hi: ''`) so the owner will be asked to translate it as it stands.
**Slice to change: OR5 or OR2** — whichever owns the seam.

The job-card door is not affected and is not broken: `jobcard.js:1878` passes
`ageWords(lastSyncAt())`, which is `''` on a never-synced device and correctly drops
the line.

---

## 8. Low — a sent-out piece says "Not on a bus" while its return sheet says "Back on RJ14 PA 1023"

**`v2/screens/fuel.js:962`** — pre-existing (`08a92bd`, wave 5), not this cut's code,
but this feature is what puts the two statements next to each other. The alternator
row reads *"Alternator · ALT-77120 / Not on a bus / Sent out 6 November / Out 3 days.
No gate pass was made."* while `components.c-a1.busId` is `b1` and the return sheet
one tap away correctly offers "Back on RJ14 PA 1023". Worth one line, not a blocker.

---

## 9. For the owner, not a defect — passes 4 and older on a card are unreachable

UX §5 drops the Outside-jobs register and its search box and says so honestly: *"For
an untracked unit — a 'front tyre', a 'self' — nothing answers it after the fact."*
Now observable: I put eight passes on `j3` and the card drew the three newest plus
**"3 of 8 gate passes shown, newest first."** — exactly as UI §3.6 specifies, with no
scroller and no "see all". For an out pass Attention reaches it after 14 days; for a
**returned untracked** pass that is not in the newest three, there is no screen in v2
that can find it again. That is the accepted cost of twelve screens, and the owner
should hear it once in that form rather than discover it in a vendor dispute.

---

## What I checked and found correct — do not redo this

**The tap counts, performed in the browser, not read off the spec.**

| UX §7 promise | Measured here | |
|---|---|---|
| Mark a card away: **4 taps + one typed word** | **3 taps + one typed word** (action, Town field, Save) | better |
| Issue a pass and print, tracked piece: **7** | **7, nothing typed** (action, vendor field, vendor suggestion, piece select, the piece, "Make the gate pass", "Print") on an open card on `b1` | exactly |
| …typed unit: **9** | **6 taps + 3 typed values** from the card | better |
| Receive back and refit: **6 + one photo** | **5 taps + one typed serial + the charge**, one sheet, one screen; **6** with the mismatch confirmation | better |
| Close without the bill `[decision 1]` | **4 taps + the typed reason**, all of it a visible control on the close path | met |
| Reach the card from Jobs → Away tab | 2 taps | — |

**The states the UI spec listed.**

- **empty** — Away tab with no away card: *"No cards away for repair"*. Attention with
  no pass out ≥14 days: the `outsideUnit` row is absent and the kind contributes
  nothing. Vendor's-bill photo group empty: the capture control plus *"The vendor's
  bill. Needed to close this card."*, not an `emptyState()`.
- **one item** — one pass on a card: one row, no count line, no "1 of 1".
- **far too many** — 8 passes on one card: three newest + *"3 of 8 gate passes shown,
  newest first."* 240 away cards: 200 rows drawn + *"200 of 241 shown, oldest first.
  Use a filter to narrow this."*, oldest genuinely first, `Shell.mount('jobs')` in
  **15 ms** on this machine at that density.
- **offline** — the entire walk was offline (`ERR_CONNECTION_REFUSED`, never synced).
  Every write landed locally, the slip rendered, and **nothing anywhere said "could not
  send"**. The header carries *"No signal"* / *"This phone has not sent anything yet"*.
- **half-finished** — there is no draft, as promised. Abandoning the away sheet writes
  nothing; saving it empty flags the field (`aria-invalid="true"` + *"Which town is the
  bus in?"*) and writes nothing; "Make the gate pass" with empty vendor and unit flags
  both (*"Enter the vendor"*, *"Enter the unit name"*) and the `gatepasses` count stays
  at 2, so no orphan draft record is minted when the sheet opens.
- **no permission** — mechanic: Jobs tabs are `Open, Completed` only (no Away tab);
  `j3`/`j4` read as *"That job card is not on this phone"*, not an error; and on a card
  **assigned to them** there is no vendor, no outside cost, no pass row and no
  vendor's-bill group. Storekeeper: the piece timeline draws **no ₹ and no bill photo**
  on `send-out`/`return` entries where the owner sees **₹4,200** — `.act` empty, not a
  dash. Crew manager reaches six screens and `fuel` is the only door.
- **two people at once** — the card's "Somebody changed this card while you were
  typing" dialog is wired to the away save (`saveFields(…, v._opened)`); a pass already
  returned refuses a second return (`reason: 'returned'`) and the slip drops the
  "Record it back" control.

**The flow's own correctness, walked.**

- **Away tab keys on the bus, not the vendor.** Exactly one row (`j4`, *"In Jaipur · no
  vendor recorded yet"*, `2 d`, `map` mark); `j3` — a vendor typed, bus in our yard —
  is on **Open**, not Away. UX §7's "cards in the Away tab whose bus is in our yard" is
  **0**.
- **The away card's next step is never the crew step.** `j4`: *"Add the vendor's
  bill"*. `j2` with no reached time: *"Record when it reached the workshop / Until then
  nobody can say how many days."*
- **"Back in our yard"** is a confirmation with no fields, *"Not yet"* focused first,
  and falls back to the place when there is no vendor: *"The bus is back from Jaipur.
  Away for 2 days."* Writes `outside:false` + `outAt`.
- **The serial normalisation agrees with the contract at runtime.** `'acc 5512'` typed
  against `ACC-5512` → **no mismatch**; `ACC-9999` → the app's own confirmation with
  both serials in one sentence, *"Look again"* focused, *"Record it and flag it"* the
  other way, the typed serial surviving "Look again", `serialMismatch:true` recorded,
  the return never refused, and the warn toast *"Received — serial does NOT match"*.
  No emoji anywhere in the flow's rendered strings.
- **The bill is captured once.** `externalCost` on the card = `cost` on the pass =
  7800, from one save. With no pass, the money goes onto the history entry
  (`cost:5600, billPhoto:""`), which is the only place that exists.
- **The one-way door is closed, including the piece that left before passes existed.**
  `c-a1` (sent out, no pass) is receivable by the crew manager, says *"This piece went
  out before gate passes were kept. There is nothing to check the serial against."*,
  offers **"Back on RJ14 PA 1023"**, and on save goes `sent-out → in-service` on `b1`
  with `refurbCount` 1→2 and a `return` history entry. UX §7's "pieces stuck at
  `sent-out`" is **0**.
- **The pass number is minted on the device, date-first**: `OJ-261109-UJCJ`,
  `OJ-261109-RG9K`, `OJ-261109-WWKH` — all `^OJ-\d{6}-[A-Z0-9]{4}$`, no counter, with
  no network.
- **Store's timeline names the pass** for an entry this feature wrote: *"Sent out ·
  9 Nov / Jaipur Tyre Remould · gate pass OJ-261109-RG9K / 0 d"*. (The seeded `c-t2`
  entries have no `passId`, so they correctly show none — that is legacy data, not a
  defect.)
- **Fuel & tyres**: `ftGateSeam` is gone, no cost field on the send-out sheet, one
  sheet for all four roles, the badge reads *"At vendor" / "Out 3 days on
  OJ-261109-AB12"* or *"Out 3 days. No gate pass was made."*
- **Attention's row** draws for the first time in v2's life, correctly worded, under
  **Papers**, ranked below the gate holds and the money, and absent for roles without
  `outsideJob`.
- **Decision 1's close path**: the confirmation carries *"There is no bill photo on
  this card / You can add the bill, or close it by typing a reason."* with a visible
  `.btn-quiet`; the reason is required (*"Type the reason. The card cannot close
  without it."*); `closeNoBillReason` is written; the toast says *"Card closed. No bill
  — your reason is on the card."*; and on a fresh mount the card draws **"Closed with
  no bill"** with the typed words, for the supervisor and for the owner, in the
  next-step slot and in block 4. Decision 1 is honoured — it is only invisible for the
  few seconds finding 2 covers.
- `Passes` and `Outside` exist on a real page load (seam 8's fix holds). Console over
  the whole walk: the absent sync server, the `http.server` service-worker scope, and
  the app's own "a figure is drawn as final while this device is still filling"
  tripwire, which fires on `today` too. No exception from any screen in this feature.

---

## What I could not check, and why

- **The printed slip on paper.** Nothing was printed. The print CSS is asserted by
  `test_v2_passes.js` and `window.print()` is wired, but finding 1 means that whatever
  comes out of the printer has no chassis and no engine number, so this should be
  re-checked after that fix rather than before it.
- **Windows 7 / Chrome 109.** This was Chrome 157 headless on a Mac. The hardware
  floor and the `#perf-bed` numbers are another reviewer's lens and another machine's;
  my 15 ms at 200 away rows is this machine's and means nothing for a Core 2 Duo.
- **The `errorState()` inside the outside block** on a failed `gatepasses` read
  (UI §3.6). I could not make IndexedDB fail for one store only without editing source.
- **A real second device editing the same record.** I verified the dialog is wired and
  that a returned pass refuses a second return; I did not run two devices.
- **A real photo on the bill.** The capture control is a `label`-wrapped file input and
  I could not attach a file through CDP without touching the page's own handlers, so
  "the return saves with the photo still uploading" (UX §6) is unverified. The return
  does save with `billPhoto: ""`, which is the no-photo case, not the uploading one.
- **`readScope` over HTTP, the drain budget, the push budgets and the server-side
  guard.** All outside this lens, and all named in `outside-repair-assembly.md` §5 and
  §6. I did not re-measure them and I am not reporting on them.
- **Whether `assignedTo` should be cleared when a bus is marked away** (finding 3) is
  a decision, not a defect. Stage 1 did not make it.

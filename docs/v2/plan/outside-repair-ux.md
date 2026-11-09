# Outside repair — the write path

**Stage 1 (UX) of `docs/v2/PIPELINE.md`. Slug: `outside-repair`.**
Written 2026-11-09. Input: `docs/v2/GAPS-FROM-V1.md` §A1, the inventory, and the
approved v2 direction in `docs/v2/plan/v2-ux.md` §4.1 and §5.1.

**Status: ready for stage 2** (2026-11-09). The three owner decisions are recorded
under "Owner decided" below; the section after it keeps the questions as they were put.
The original status line read "not ready for stage 2" and is superseded: the flow
was complete and buildable then too, but three of its decisions were the owner's
and two changed what is on a screen.

---

## 0. Scope decided here, before anything else

Stage 1 was asked two questions. Both are answered, and a third had to be.

**(a) "The bus is away" and "a unit went out to a vendor" are TWO flows, not
one.** They are two different facts about the world, they already are two
records, and they fail in different ways:

| | The bus is away | A unit went out |
|---|---|---|
| What is true | The whole bus is standing at somebody else's workshop, in another town | The bus is in our yard; an alternator, a tyre or a self is at a vendor in town |
| Where it lives today | `jobcards.outside`, `outsideCity`, `outsideLat/Lng` (`inventory/03 §3`, jobcard field table) | `gatepasses` — a numbered slip with a serial out and a serial back (`inventory/03 §3`, store 24) |
| Who is idle | A bus, earning nothing | A bus, if the unit came off a bus that is now waiting for it |
| What goes wrong | Nobody knows where the bus is or how many days it has been there | The unit that comes back is not the unit that went out, and nobody can prove it |
| The evidence | The vendor's bill | The serial number — `ojSerialWhy`: *"this is what proves what came back is what went out"* (`i18n-hi.js:202`) |

They meet in exactly one place: a job card can carry both, and v1's `jbMoveWarn`
(`app.js:108`) already promises both move with the card when the card moves bus.

v2 half-covers the second one: `v2/screens/fuel.js:1431` "Send out for repair"
writes `state:'sent-out'` and a `send-out` history entry (`fuel.js:1302`). It
does **not** write a slip, does not record a serial, and — measured from the
action table at `fuel.js:1421-1435` — **has no return at all.** There is
`ftFit`, `ftRemove`, `ftSend` and nothing that brings a piece back. Every piece
sent out in v2 is stuck at `sent-out` for ever. So the second flow is not
"already covered"; it is half-built and currently a one-way door.

**(b) The printable slip is in scope NOW, not later.** It is the reason the
record exists — `ojNewHint`: *"fill it in before the unit leaves, print it, send
a copy with the vendor"* (`i18n-hi.js:198`) — and in v2 the printing is already
written: the sheet and `window.print()` at `v2/screens/jobcard.js:1366-1376`,
the `@media print` block specified in `screens-work.md §3.11`. What is missing is
the record behind it. Issuing a pass with no paper would be a worse product than
v1 and would also be more work than v1, because the vendor's man is standing at
the gate either way.

**(c) The third question, which had to be answered: what does "Away for repair"
mean on the Jobs board?** Today `v2/screens/jobs.js:178` is
`function away(c) { return !!c.externalVendor; }`, and `matches()` at
`jobs.js:181-186` then removes those cards from Open. v1's own test is
`isOutside = (j) => !!(j && j.outside)` (`app.js:2927`) — a different question.
The consequence in v2 is live and wrong in both directions: a bus **standing in
our yard** with an outside vendor's name typed on its card disappears from Open,
and a bus **away in Jaipur** with no vendor name yet never appears in Away.
`v2-ux.md:628` already decided this — the away tick *"is also overloaded onto
the vendor field today and gets its own state"* (`inventory/05 §4` row 21).
**Decided: Away is `outside`. The vendor's name is who did the work, not where
the bus is.**

**Not in scope, named so nobody waits for it:** the full-screen live map
(`GAPS-FROM-V1.md` §A5 — its own feature), the Vendors list (§A2), the ITS crew
lookup (§A3), and the standalone Fit control for alternator / starter / injector
(§A4). One dependency on §A4 is dealt with inside the flow below rather than
waiting for it: a returned alternator goes back on **the bus it came off**, from
the return itself, the way v1's receive sheet did (`app.js:5575`, "Refit to
<reg>? Yes — refit now"). That needs no new Fit button.

---

## 1. The job

It is a Tuesday afternoon. **A supervisor** — one of two, on alternate shifts
(`inventory/05 §1`) — is standing at the workshop door with a phone in one hand
and the bus's alternator in the other, and a man from Sharma Auto Electric is
waiting at the gate for it. He needs the serial number that is stamped on the
casing written down somewhere that is not his memory, a piece of paper to send
with the unit so the vendor's shop has something with our number on it, and the
same record waiting for him in three days when the unit comes back and he has to
decide whether what came back is what went out. The other half of the same job
is the phone call he took that morning: bus RJ-14-XXXX is standing at a workshop
in Jaipur, it will not move for two days, and the owner will ask tomorrow why a
bus is earning nothing. He is interrupted while doing both (`inventory/05 §2.2`:
a part was once issued "while on a call", [E] d738a6e). His own job list has
this as item 7 of 8: *"Send work outside on a printed gate pass; check it back in
by serial number"* ([E] 2b35e74, `inventory/05 §2.2`).

The owner is the second person in this document, and he is not the user: he reads
the result (how many days, whose bill, how much) on Money and on Attention. He
has asked for this three times.

---

## 2. What they do today

Two "todays": the live v1 app, which is what the ~100 people use, and v2, which
cannot do it at all.

**v1 — mark a brand-new card as away** (`viewNewJob`, `app.js:6000-6115`;
`inventory/01 §2` row `newjob`): Jobs tab, "+", bus, the "Is this being done
outside our garage?" tick, city, problem, priority, Next, Next, vendor, outside
cost, Create. **~13 taps, 4 typed fields, 3 wizard steps, 3 screens.** A phone
call in the middle of it has already lost a half-filled card once ([E] 4f0691e,
quoted in `v2-ux.md:627`).

**v1 — mark an existing card as away** (`sheetEditJob`, `app.js:4217-4221`): Jobs
tab, the card, Edit/Reassign, the tick, city, Save. **6 taps, 1 typed field, 3
screens** — the edit sheet also carries every other field on the card, so the
two fields he wants are inside a form of about fifteen.

**v1 — send a unit out** (`viewGatePasses` `app.js:4785`, `sheetGatePass`
`app.js:4833`, `saveGatePass` `app.js:4878`): Jobs tab, the "Outside jobs" row,
"+", vendor, bus, tracked piece, unit name, serial, remark, "Make gate pass",
then it lands on the slip and he taps Print. **~12 taps, 4 screens** (board,
register, sheet, slip). Picking the bus and the piece prefills the registration,
engine, chassis, unit name and serial (`app.js:4862-4873`), so the typing is
less than the field count suggests. The slip number is date-first — `OJ-261109-
AB12` (`gpNumber`, `app.js:4773`) — deliberately, because it has to be issued
offline without colliding with the other supervisor's (`inventory/05 §4` row 30).

**v1 — check it back in** (`sheetReturnGatePass` `app.js:4998`,
`saveReturnGatePass` `app.js:5034`): Jobs tab, Outside jobs, find the pass,
"Received back", the serial read off the unit, the bill amount, the bill photo,
remark, "Mark back", and on a mismatch a confirm dialog. **~11 taps, 4 screens.**
The mismatch is recorded and never used to refuse the return (`app.js:5043-5046`,
and the reason is written out there) — the unit is physically in the yard whatever
the paper says.

**v1 — refit what came back** (`sheetReceiveComp`, `app.js:5564`): a separate
sheet on a separate screen (`components`), vendor, bill, bill photo, life after
rewind, "refit to this bus?", note, Save. **~8 taps, 2 screens.** So in v1 the
bill is captured **twice** for one event — once on the pass return and once on
the piece — and nothing reconciles them.

**v2 — all four of the above: impossible.** `jobcard.js:805` draws the outside
block, `jobs.js:173-178` filters an Away tab, `cost.js:201` counts
`externalCost` into Money's outside split — and **nothing anywhere sets
`externalVendor`, `outside` or `outsidePlace`.** Those three fields exist only in
`v2/db.js`'s seed (`db.js:669`) and at the read sites. The only thing v2 can do
is send a tracked piece out with no slip and no serial (**7 taps**:
Fuel & tyres, Pieces, the piece, "Send out for repair", vendor, cost, note,
Save) — and then never bring it back.

---

## 3. The flow

Four paths. Each is one question at a time, and every one of them is shorter than
v1's.

### 3.1 "This bus is away" — the supervisor, on the card

1. **He is on the job card** for that bus (the card exists; v2 creates a real
   card from bus + fault at step one, `jobs.js:create`). He sees the card's one
   next step and the card's actions.
   *He taps:* **"The bus is away for repair"** — present only for `outsideJob`.
2. **He sees** two fields and nothing else: **where it is** (a town or a
   workshop name, in words, with the places this garage has used before offered
   as he types) and **who is doing the work** (the vendor, which he may not know
   yet and may leave empty).
   *He taps:* Save.
   *The system writes:* on the card — away is true, the place, the vendor if
   given, and the moment it was marked. Nothing else on the card is touched.
3. **He sees** the card now saying the bus is away, in that place, and the card
   has moved from Open to Away on the board. Its next step is no longer "put
   somebody on this job" — nobody from our garage is in Jaipur
   (`owCrewNote`, `i18n-hi.js:184`) — it is **"How many days? Record when it
   reached the workshop"** if that time is not yet known, and after that
   **"Add the vendor's bill"**.

**4 taps and one typed word.** (v1: 6 taps through a fifteen-field edit sheet, or
13 through the wizard.)

4. **Days later** the bus is back in our yard. *He taps* **"Back in our yard"**
   on the card. *The system writes:* away ends, and the days it was away are
   frozen onto the card so the number does not become "0 days away" the moment
   it returns. The card goes back to Open and behaves like any other card:
   photos or the bill, close, second signature.

### 3.2 "This unit is going out" — the supervisor, at the door

1. **He is on the job card** for the bus the unit came off.
   *He taps:* **"Send a unit out on a gate pass"** — `outsideJob` only.
2. **He sees** the bus already filled in, and asks for: **the vendor**
   (offered from the vendors we already have), **which tracked piece** if it is
   one of ours by serial (offered from the pieces fitted to this bus, and
   choosing one fills in the unit's name and its serial), **the unit** in words
   if it is not tracked, **the serial**, and **what work it is going for**.
   Under the serial, one sentence: it is what proves what came back is what
   went out (`ojSerialWhy`, `i18n-hi.js:202`).
   *He taps:* **Make the gate pass**.
   *The system writes:* a new pass — its number (date-first, generated on the
   phone so it works offline), who issued it and when, the vendor, the bus with
   its registration, engine and chassis **copied onto the pass, not referenced**
   (`inventory/03 §3`, store 24: *"Identifiers are copied, not referenced"* —
   the paper in the vendor's file cannot change when a bus record is corrected
   next month); the unit's name and serial; the remark. On the card: this pass's
   number, and the vendor if the card had none. On the piece, if one was chosen:
   sent out, with a send-out entry naming the pass.
3. **He sees the slip**, with the number on it, and **Print**. He prints it,
   keeps one, sends one with the unit. It prints offline.

**7 taps with a tracked piece chosen, 9 with a unit typed by hand.** (v1: ~12.)

### 3.3 "It came back" — the supervisor, three days later

1. **He finds it** one of three ways, each answering its own question: the card
   he was on; the Attention row if it has been out 14 days or more; or the piece
   in the register, which says it is sent out and on which pass.
   *He taps:* **"Back from the vendor"**.
2. **He sees** what went out — the unit's name and the serial on the pass — and
   is asked for **the serial he is reading off the unit in his hand** (not off
   their bill: `ojSerialBackWhy`, `i18n-hi.js:213`), **what they charged**, **a
   photo of their bill**, and a remark. If the piece came off a bus, one more
   question: **back on that bus now, or onto the shelf as a spare** — the one
   question v1 asked in a different sheet on a different screen.
   *He taps:* **Record it back**.
3. **If the serials differ**, he sees exactly what the pass says and what he
   typed, and is asked to confirm. Confirming records the mismatch; it never
   refuses the return. The unit is in the yard whatever the paper says, and a
   flow that would not let him write that down would be worked around
   (`app.js:5043-5046`). The reason it is recorded is said once: so somebody can
   take it up with the vendor, and *don't pay until it is explained*
   (`ojMismatchWhy`, `i18n-hi.js:218`).
   *The system writes:* the pass returned, with the returned serial, the
   mismatch flag, the cost, the bill photo and the remark; the piece back in
   service on that bus or spare, with a return entry, its refurbish count up by
   one; and the vendor's charge on the job card as outside cost — **captured
   once**, not twice as v1 did.

**6 taps and one photo**, or 7 with the mismatch confirmation. (v1: ~11, plus
~8 more on a second screen to refit it.)

### 3.4 The owner, next morning

He opens **Attention**. If something has been at a vendor 14 days or more there
is one row for it, with the unit, the vendor and the number of days, and tapping
it opens the slip. If a bus is away it is on the Jobs board's Away tab with how
long. Money's outside split already counts both (`v2/cost.js:201` and `:213`) and
needs no new tile. The owner does not issue passes and does not receive units;
nothing in 3.1-3.3 is designed for him.

---

## 4. Screens

No new screens. v2 stays at twelve (`v2-ux.md §4.1`). Five existing screens
change; the sheets are named because they are where the work happens, and they
are sheets by `v2-foundation-ui.md §3.2`, not destinations.

| Screen | The job it serves | Role that does that job | What must be on it | What must NOT be on it |
|---|---|---|---|---|
| **Job card** (#4) | "What is the state of this one repair, and what is the one next step?" | **supervisor** keeps it; owner reads and signs off; mechanic never writes here | The away state in words — the place and how many days; the vendor and what they charged; the pass number, opening the printable slip; the two actions **"The bus is away for repair"** and **"Send a unit out on a gate pass"**, and **"Back in our yard"** while away. For an away card the one next step is the reached-the-workshop time, then the bill — never "put somebody on this job" | Any of those actions, or the vendor block at all, without `outsideJob` — it is absent, not disabled (`screens-work.md §3.12`, and this was one of the six route bypasses, `inventory/02 §6.1` rows 5-6). A city **and** a map link **and** coordinates — one place, in words. "Ready to close" on an outside card that has no bill (see §6) |
| *sheet:* **Bus is away** | "Where is this bus, and who has it?" | supervisor, owner | Two fields: the place in words, the vendor (optional) | A third field. A date picker — it is today unless the card says otherwise |
| *sheet:* **New gate pass** | "What is leaving, on whose authority, with which number?" | supervisor, owner | Vendor, the tracked piece if there is one, unit name, serial, the work asked for, and the one sentence about why the serial matters. The bus's identifiers shown as what will print | A cost. Nobody knows it yet, and asking invites a guess that becomes a figure on Money |
| *sheet:* **The slip** | "The paper that goes with the unit." | supervisor, owner | The number, the vendor, the bus and its copied registration / engine / chassis, the unit and serial, the remark, who issued it and when; after return, the returned serial, whether it matched, the cost and the bill photo; and Print | A signature box drawn on screen. Signatures stay on paper (`v2-ux.md:677`) |
| *sheet:* **Back from the vendor** | "Is what came back what went out, and what did it cost?" | supervisor, owner | What went out (unit and serial, as a statement), the serial read off the unit, the charge, the bill photo, a remark, and — only if it came off a bus — back on that bus or onto the shelf | A pre-filled serial. Pre-filling it is the same as not asking, and the whole record exists to catch the case where they differ |
| **Jobs** (#3) | "What is standing in the yard, for how long, and has it been started?" | supervisor, owner, store (read), mechanic (own only) | The Away tab filtered on **the bus being away**, with days away per row | A vendor name deciding which tab a card is in (`jobs.js:178` today). An Away tab for a role without `outsideJob`: a mechanic has no business knowing which vendor holds the unit |
| **Attention** (#2) | "What is wrong across the business, ranked by money and safety?" | owner, supervisor | One row per unit out 14 days or more: the unit, the vendor, the days. Declared on `outsideJob`, so it is invisible to everybody else, and ranked below a gate hold and below money | A row per unit out at all — most come back inside a week and a row that is always there is a row nobody reads (`v2-ux.md §4.1` #2: no count that can never reach zero) |
| **Fuel & tyres** (#10) | "Record what went into or onto a bus away from the workshop." | crewmanager, store, owner, supervisor | **"Back from the vendor"** on a sent-out piece — the missing half of the one-way door at `fuel.js:1431`. The existing "Send out for repair" keeps its honest line about not being able to make the slip (`fuel.js:1189`) | A gate pass made from here by a role without `outsideJob`. The slip is owner/supervisor; the seam stays stated, not hidden (`screens-assets.md §3.7`) |
| **Store** piece register (#6) | "What is this piece, where is it, and what has it cost?" | store, owner, supervisor | On a sent-out piece: the pass number and how many days out, in its timeline | The pass's bill photo for a role that may not see vendor money — see Owner must decide (3) |

---

## 5. Dropped

Everything v1 did here that this does not carry forward.

| Dropped | Why |
|---|---|
| **The Outside jobs register screen** (`outsidejobs`, `app.js:4785`) and its three counting tiles — at vendor / 14+ days overdue / back | Already decided (`v2-ux.md:628`): same list, different status. The overdue count — the only one anybody acted on — becomes an **Attention row**, which is where findings live. "At vendor" and "back" were counts of a list nobody had a reason to open; the questions behind them are answered on the card and on the piece |
| **The single-pass route** (`gatepass`, `app.js:4929`) | A document, not a destination (`v2-ux.md:629`). It is a sheet, and it prints |
| **The register's search box** over returned passes — vendor, unit, serial or bus (`ojSearch`, `app.js:4804`) | For a tracked piece the timeline answers "which pass did this go out on". **For an untracked unit — a "front tyre", a "self" — nothing answers it after the fact.** That is a real loss, it is the one thing on this list I would expect somebody to miss, and it is listed here rather than quietly fixed with a thirteenth screen |
| **The away-work creation question in the new-job wizard** — the step-1 tick and step-3 vendor/cost (`app.js:6018-6060`) | A card is created from a bus and a fault, and everything else is asked on the card, one field at a time. This is v2's existing idiom, and the wizard's own `localStorage` draft lost a half-filled card to a phone call ([E] 4f0691e, `v2-ux.md:627`) |
| **The Google-location field, the map link and the lat/lng** on an away card (`owLoc`, `owLocPh`, `owOpenMap`, `i18n-hi.js:181-182`) | Two more fields on a flow that happens a few times a month, to produce a pin nobody navigates to — the supervisor is not driving to Jaipur. The place in words is what is read on the card and in the Away tab. If the owner wants the pin it arrives with the live map (`GAPS-FROM-V1.md §A5`), which is its own feature |
| **`owCrewNote` as a sentence on screen** — "nobody from our garage has to be on it, remove the mechanic" (`i18n-hi.js:184`) | Kept as behaviour instead: an away card never asks for a crew member, so there is nothing to explain and nothing to undo. A note that tells you to undo what the screen just did to you is a design apologising |
| **Capturing the vendor's bill twice** — once on the pass return (`app.js:5034`) and again on the piece (`app.js:5564`) | One event, one amount, one photo. Two capture points produced two numbers that nothing reconciled, and both fed cost |
| **"Life after rewind (km)"** on the return (`app.js:5574`) | A number the supervisor is guessing at the counter, which then silently governs the wear bar. The refurbish count is recorded and is the honest figure. If the owner wants a re-rated life it belongs in the piece register, deliberately, not in a doorway |
| **The emoji on the mismatch and success toasts** (`app.js:5049`: `⚠️`, `✅`) | Windows 7 renders them as boxes — `CLAUDE.md` hardware floor, enforced by `scripts/check-floor.py` |
| **The browser `confirm()` on a serial mismatch** (`app.js:5046`) | The mismatch question is the most important sentence in the flow and it is currently a native dialog with no control over wording or focus. It becomes the app's own confirmation (`V2.confirmDialog`, used by the send-out already) |
| **A free-floating pass** — v1 let a pass be issued with no bus and no piece (`app.js:4900`, `busId` may be empty) | A pass is issued against a bus's job card, or against a tracked piece. A slip attached to nothing has no home among twelve screens and could only be found by searching the register that is being dropped. **This is the drop I am least sure of** — see Owner must decide (2) |
| **A gate pass issued by the storekeeper or the crew manager** | Not dropped by me — it is not v1's behaviour either (`gatepasses` has been owner/supervisor at the server since v1: `sync_server.py:1205`). The seam stays, stated on screen (`fuel.js:1189`). Owner must decide (3) asks whether to close it |
| **`jbMoveWarn`** — "parts, labour, outside work move with the card" (`app.js:108`) | **Not dropped.** It is already true in v2's move (the whole record moves) and the sentence exists in Hindi (`i18n-hi.js:100`). Named here so nobody drops it as decoration |

---

## 6. Edge cases that matter here

**Offline, which is the normal case at a gate.** Every write in §3 is local
first; nothing in this flow waits for a connection and nothing may say "could
not send". The pass **number must be generated on the device**, and v1's scheme
(date, then a tail off the record id — `app.js:4773`) is what makes two
supervisors on alternate shifts, both offline, unable to collide. Do not replace
it with a counter. The slip must print with no network: it is CSS and the
record, and both are on the device.

**The one-way door that exists today.** Any piece already at `sent-out` in the
live data — including the seeded alternator (`v2/db.js:723`) — must be
returnable by the new flow even though it left with no pass. The return must not
require a pass to exist.

**A half-finished entry.** There is no draft. The away state is two fields saved
together; the pass is issued or it is not. If the supervisor abandons either
sheet, nothing is written and nothing is left behind to find and finish — which
is the opposite of the wizard draft this replaces.

**Two people at once.** Three different shapes, three different answers:
- *The card* is a whole-record write and already has the "Somebody changed this
  card while you were typing" dialog (`jobcard.js:192-195`). The away fields ride
  that; they need nothing new.
- *The piece* has a `history` array rewritten whole by the editor
  (`inventory/03 §5.5`), so two people recording the same return lose each
  other's entries. The return sheet must therefore show the piece's current
  state **with how old that reading is**, exactly as the send-out sheet already
  does (`fuel.js:1180`).
- *The pass* is a single record touched by one person at the door; the realistic
  conflict is the same unit being received twice. A pass already returned must
  say so and offer nothing to press.

**A role that must not see it.** A mechanic may not mark a job outside, may not
issue or receive a pass, and may not see the vendor block — absent, not disabled
(`screens-work.md §3.12`). **The server is looser than this and must be
tightened in the same change:** `sync_server.py:1698` freezes `outside`,
`outsideCity`, `externalVendor` and `externalCost` only on a **verified** card
for a non-manager, so a mechanic's phone can today set them on an open card and
the server will accept it. The client deny is not a security boundary on its own
(`inventory/02 §4.4`, "where the server is looser"). This is a backend slice, and
it is part of this feature, not a follow-up.

**The close gate, which this flow quietly weakens.** `_has_proof`
(`sync_server.py:1291`) and its client mirror (`jobcard.js:320-324`) drop the
requirement from two before and two after photos to **any one photo on either
side** as soon as `externalVendor` is set, and the card then reads "Ready to
close — the vendor bill stands in for the photos" (`jcGateVendorSub`). After this
change a supervisor can make that true in four taps. The intended sentence has
always been the stricter one — `addPhotoNote`: *"Before AND after photos required
to close a job (outside repairs: a bill photo)"* (`app.js:30`,
`i18n-hi.js:22`) — and the gate must not claim a bill it cannot see. Owner must
decide (1).

**The slowest machine in the office.** Nothing here adds a list. The Away tab is
a filter over cards already in memory; the Attention row is one more entry in an
existing declarative table (`attention.js:306-328`), computed from
`gatepasses`, which is 24th of 41 stores and small. The bill photo goes through
the existing photo queue outside the record (`DECISIONS.md §552`) — the return
must save with the photo still uploading, because the man at the gate does not
wait. The print path is `@media print`, no second layout, no new window.

**The desk row.** Every new row here is one line (`v2-foundation-ui.md §2.1`) and
uses the row markup contract. The open second-line defect (`GAPS-FROM-V1.md`
§B4, §B3) is not to be added to by this feature.

**The words already exist in Hindi, and the owner is the only Hindi speaker on
the project.** Reuse, do not rewrite: `owAsk`/`owHint` (`i18n-hi.js:179-180`),
`owCity`/`owCityPh` (181), `owBadge`/`owAway`/`owNoCity` (183),
`owReached`/`owVendNote` (185), `owWhere`/`owAwayFor` (186), `ojNew`/`ojNewHint`
(198), `ojVendor` (199), `ojSerial`/`ojSerialPh` (201), `ojSerialWhy` (202),
`ojUnitName`/`ojUnitPh` (203), `ojPiece`/`ojPieceNone` (204),
`ojRemark`/`ojRemarkPh` (205), `ojIssue`/`ojIssued`/`ojPrint` (206),
`ojWillPrint`/`ojNeedVendor`/`ojNeedUnit` (207),
`ojAtVendor`/`ojOverdue`/`ojBack`/`ojOutFor` (208),
`ojReceive`/`ojReceiveHint` (211), `ojSerialBack`/`ojSerialBackPh` (212),
`ojSerialBackWhy` (213), `ojBill`/`ojBillPhoto`/`ojMarkBack` (214),
`ojMismatch`/`ojWentOut`/`ojCameBack` (216), `ojMismatchWhy` (218),
`ojBackOk`/`ojBackMismatch` (219), `ojConfirmMismatch` (220), `addPhotoNote`
(22), `jbMoveWarn` (100). Anything genuinely new — "Back in our yard", "Back
from the vendor", the Attention row's sentence — is registered with an empty
`hi` and goes to the owner, the way `v2/login.js` and `v2/screens/me.js` do it.

**Two defects in the code this feature lands on, found while reading it.** Both
are in the read path that already exists, and both would make a correct write
look broken: `jobcard.js:1373` prints `p.unit`, and the field is `unitName`
(`inventory/03 §3`, store 24), so the unit line on the slip is blank; and
`jobcard.js:809` and `:1368` read `c.gatePassNo` / `c.gatePassId`, fields that
are in **neither** v1's jobcards nor the inventory's field table — v1 never
linked a pass to a card. This flow does link them (§3.2), so that invented field
pair becomes real; it should be added to the contract deliberately rather than
inherited by accident.

---

## 7. How we will know it worked

Read after one week, then after one month.

| Number | Today | What success looks like |
|---|---|---|
| Job cards with the away state set, created in v2 | **0, structurally** | At least as many per month as v1 recorded. **UNKNOWN: the v1 rate.** It is one count of `jobcards` where `outside` is true, and one of `gatepasses` by month, against the live database — the owner runs it; nothing in this pipeline writes to production (`CLAUDE.md`) |
| Gate passes issued per month | 0 in v2 | Same test, same baseline |
| Taps to mark a card away | 6 (v1 edit sheet) / 13 (v1 wizard) | **4 and one typed word**, counted on the fixture, not estimated |
| Taps to issue a pass and print it | ~12 | **7** with a tracked piece, 9 with a typed unit |
| Taps to receive a unit back **and refit it** | ~11 + ~8 on a second screen | **6 and one photo**, one sheet, one screen |
| Pieces stuck at `sent-out` with no return possible | **all of them** (`fuel.js:1421-1435` has no return) | 0 — and the pieces already stuck must be clearable without a pass |
| Cards in the Away tab whose bus is in our yard | Unknown and non-zero: the tab keys on `externalVendor` (`jobs.js:178`) | 0. Measurable before and after on the fixture: count cards with a vendor and `outside` false |
| Screens added | — | **0.** v2 stays at twelve. If stage 2 needs a thirteenth, this document was wrong |
| Old screens emptied | `outsidejobs` and `gatepass` are already gone from v2's routes | They stay gone, with the jobs they carried now reachable — which is the honest version of "47 became 12" |
| Who used it | — | The per-person-per-day `usage` counter (`inventory/01 §2`). Expect **two people**: the two supervisors. If the owner is the only one who ever taps it, the flow is in the wrong place and that is the finding |

---

## Owner decided, 2026-11-09

The three questions below were put to the owner and answered. His answers are
recorded verbatim in effect; the reasoning under each is the consequence for
stage 2, not a re-opening of the decision.

**1. The bill photo is required, with a named way out.**
An outside card may not be closed on any one photo. The gate is the vendor's
bill — AND a supervisor may close without it by typing a reason, which is kept
on the card and shown wherever the card is read. Not a silent override: the
reason is part of the record, so a card closed without a bill is visibly a card
closed without a bill.

Consequences for stage 2: the close sheet gains a second path, not a second
button hidden behind a long press; the typed reason is a required field on that
path; `sync_server.py:1291` and `jobcard.js:320` both change, and the server
half is a LIVE BEHAVIOUR CHANGE affecting cards being closed today, so it ships
with the owner's own deploy and not before. The reason needs a word id, PENDING.

**2. Nothing leaves that belongs to no bus.**
Every pass hangs off a job card or off a piece fitted to a bus. The
free-floating pass v1 allowed (`app.js:4900`) is NOT restored. Two doors, not
three, and §5's drop stands as written.

Consequence: the piece register in Store needs no pass of its own, and a pass
with no bus is a state the UI never has to draw. If a shelf spare ever does go
out, it goes out against the bus it is destined for, or it does not go out.

**3. The gate pass opens to the storekeeper and the crew manager.**
They may already send a unit out of the premises; they may now make the slip for
it. The send-out is NOT narrowed. This closes the gap where a unit leaves with no
paper, which is the thing the serial number exists to prevent.

Consequences for stage 2: `gatepasses` moves from {owner, supervisor} to
{owner, supervisor, store, crewmanager} and must match `manageComponents`
exactly — the rule is "whoever may send it out may paper it", and a check should
hold those two lists equal so they cannot drift apart again. This is a
permission change at `sync_server.py:1205` and in `v2/caps.js`; the server half
is the owner's deploy.

**Still open and smaller** — neither blocks stage 2, both are one sentence when
the owner has a moment: who physically hands the printed slip to the vendor's
man (there is no gatekeeper among the eight roles, so the paper is the only
handover), and whether 14 days is still the right overdue threshold
(`app.js:4789`) now that it surfaces on Attention rather than a tile nobody
opened. Stage 2 uses 14 days until told otherwise and says so on the screen.

---

## The questions as they were put (kept for the record)

## Owner must decide

Three questions. None of them is mine, and two change what is on a screen, which
is why stage 2 should not start before they are answered.

1. **May a job marked "outside" be closed without the vendor's bill photo?**
   Today it can: setting a vendor drops the gate from 2+2 photos to any one
   photo, at the server (`sync_server.py:1291`) and on the client
   (`jobcard.js:320`). The app's own sentence has always promised stricter —
   "outside repairs: a bill photo" (`app.js:30`). Tightening it means a
   supervisor cannot close an outside card until the bill is photographed, which
   is more evidence and also a bus that stays open on the board for days waiting
   for a vendor's paperwork. Tightening the server affects cards being closed
   today, so it is a live-behaviour change, not a new screen. **This is about
   money evidence in a cash-handling business and it is the owner's call.**

2. **Does a unit ever leave the garage that belongs to no bus and is not a
   tracked piece?** A spare alternator off the shelf, sent for rewind before
   anything needs it. v1 allowed a pass with no bus (`app.js:4900`); whether
   anybody ever issued one, I cannot tell from the code. If the answer is yes,
   §5's drop of the free-floating pass is wrong and the pass needs a home that
   is not a job card — most likely the piece register in Store. If no, the drop
   stands and the flow stays two doors instead of three.

3. **Should the storekeeper or the crew manager be able to issue a gate pass?**
   Today they can send a physical unit out of the premises
   (`manageComponents`, four roles) and cannot make the slip
   (`gatepasses`, owner and supervisor — `sync_server.py:1205`). The screen says
   so honestly (`fuel.js:1189`), but the gap it describes is a unit leaving with
   no paper, which is the exact thing the serial number exists to prevent
   (`screens-assets.md §8` item 6). Either the pass opens to those roles, or the
   send-out closes to owner and supervisor only. **Who may authorise something
   leaving the premises is a permission policy in a business that handles cash
   — `CLAUDE.md` says that is the owner's, not mine.**

**Also unknown, and smaller:** who physically hands the printed slip to the
vendor's man — there is no gatekeeper among the eight roles, so the paper is the
only handover, and that is an assumption worth one sentence of confirmation.
And: is 14 days still the right overdue threshold (`app.js:4789`), or has the
owner a different number in mind now that it will appear on Attention rather
than on a tile nobody opened?

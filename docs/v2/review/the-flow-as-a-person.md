# The flow, as a person — can anybody do a day's work with this?

REV-FLOW, stage 5, third of three. Branch `launch-v2`, HEAD `6ecd927`. 2026-11-06.
Read-only on source: no application file was changed and no git command was run.

**Verdict: SEND BACK.** Not "fix first". The two screens that carry the ranked
friction — the Job card and Store — and three more besides **write nothing at
all in a browser**, silently, and the crew manager's whole job is unreachable.
This is not a list of rough edges on a working product; six of the eight roles
cannot complete the task stage 1 says they open the app to do.

I signed in as all eight roles and walked a real task per role rather than
touring screens. Every finding below says whether I **RAN** it or **READ** it.
Ranked by what it costs in the yard.

The good news, stated first because it is load-bearing: **the renderers are
right.** The zero-versus-unknown rule (`v2-ux.md §4.1` #7) is honoured
everywhere I looked — a bus with no odometer reads `— No data`, not `0 km`; a
month with no spend reads `— No data`, not `₹0`; Money refuses a per-km figure
and says *"24 buses have no km"* instead of dividing. The capability table, the
nav slots, the per-row scoping and the second-signature rule all behave as §4
specifies. What is broken is one layer down: **what reaches the cache, and what
leaves it.**

---

## How I got in

`python3 -m http.server 8911` over the repo, driven with the gstack headless
browser (`~/.claude/skills/gstack/browse`), at `http://127.0.0.1:8911/v2/index.html`.
No server, so the app is permanently offline — which per the brief is the normal
case, not the error case.

`v2/db.js`'s `seedIfEmpty` was **not** called. I wrote a fixture of my own
through `DB.bulkPut(store, rows, false, false)` (no stamp, no outbox): 11 users
covering all eight roles, 24 buses (one deliberately with no odometer), 7 parts,
6 job cards, 12 crew, tonight's `nightlist` with 6 buses running, 4 `dutylog`
rows, 2 `gatechecks`, 2 `trips`, fuel, def, ledger, audits, challans, reviews,
coaching drafts, a digest. Sessions were handed to the app through
`Boot.enter(user)` as `login.js` does, with `localStorage.v2ReplicaFor` set to
the same id first so `Cache.scopeTo` would not wipe the fixture it was about to
read. No PIN was typed and production was never touched.

**One caveat on my fixture.** Every row carries `updatedAt: 1`. Two things I
first read as defects turned out to be artifacts of that — the Gate round's
`Sent 05:30` (F13) and a driver vanishing from a Duty board seat (F12). Both are
demoted to readings below and neither is counted as a finding.

---

## F1. Every write on five screens is a silent no-op. `window.DB` does not exist.

**RAN. Four separate flows, each verified against IndexedDB afterwards.**
Severity: this is the whole product.

`v2/db.js:203` declares `const DB = { … }` at the top level of a classic
script. A top-level `const` goes into the global **lexical** environment, never
onto `window`. In the live page:

```
typeof DB           -> "object"
typeof window.DB    -> "undefined"
window.DB === DB    -> false
```

`window.Sync` is missing for the same reason (`v2/sync.js`, `const Sync`).

Most v2 modules know this and resolve `typeof DB !== 'undefined' && DB` first.
**Six do not**:

| File:line | What it is | Effect |
|---|---|---|
| `v2/screens/jobcard.js:229` | `function db() { return root.DB || null; }` | the whole Job card |
| `v2/screens/gate.js:100` | `function db() { return (root && root.DB) \|\| null; }` | the whole Gate round |
| `v2/screens/people.js:418` | same | the whole People screen |
| `v2/screens/store.js:1769, 1866, 1896, 2039` | `if (… \|\| !root.DB) return;` then `root.DB.put` | issue a part, shelf count, mark a bill paid, receive stock |
| `v2/screens/money.js:1759, 1783, 1814` | same | allowance given, expenses back, close a trip |
| `v2/screens/jobs.js:592` | `if (!rec \|\| !root.DB) return;` | new job card |

`gate.js:99` and `people.js:416` resolve `sync()` through `root.Sync` as well,
so both are `null`; `store.js:1951` calls `root.Sync.bill(...)` on `undefined`
inside a `try`, so the supplier-bill photo read returns nothing with no reason
given.

### The four I ran

**1. The mechanic's two taps (§3.2, approved in `DECISIONS §6`).** Signed in as
`u-m1`. Today showed his one open card. Tapped the row → Job card for
RJ14 PE 3006 offering exactly `I have started` and `I need a part` and nothing
else, which is correct. Tapped **I have started**. The button read `Saving…`,
then reverted. Afterwards:

```
jobcards.j5.startAt  -> undefined
jobcards.j5.status   -> "open"
Sync.info().pending  -> 0
```

The card still says `Not started`. No toast, no error. Because `startAt` never
lands, `I am done` never appears, so the mechanic can never report finishing
either. The flow stage 1 approved is a dead button.

**2. The supervisor's new job card (§3.1 step 4 — friction #1, 3–13 h/week).**
Jobs → `New job card` → chose a bus, typed *"Air leak from brake line"* → tapped
**Save**. `saveNew` returns at `jobs.js:592` *before* the `aria-disabled` line,
so the button does not even change to `Saving…`:

```
jobcards count: 6 -> 6     route: still "jobs"     pending: 0
```

The sheet sits there unchanged. The supervisor will tap Save again.

**3. The storekeeper issuing a part (§3.5 step 3 — "anti-pilferage is the
product, not a feature").** Store → `Issue part` → the sheet asked for **the
card first and did not pre-select one**, which is exactly right ([E] d738a6e) →
chose RJ14 PB 4567 / card j2 → chose Brake Pad Set → typed 2. The sheet read:

> *"Issue 2 set Brake Pad Set (front) to RJ14 PB 4567, card j2. The book goes
> from 12 to 10."*

Tapped **Issue part**. Four seconds later:

```
parts.p1.qty  -> 12   (unchanged)
ledger rows   -> 3    (unchanged)
sheet         -> still open, still saying "the book goes from 12 to 10"
```

No toast. `store.js:1769` returned on `!root.DB` before the `try` that would
have caught and announced a failure. **The part leaves the shelf and the book
never moves.** That is the hole the product exists to close.

**4. The supervisor's trip cash (§3.3 steps 4–5, `DECISIONS §11`).** Money →
`Give allowance` → set bus and amount → `Save allowance`. `trips` stayed at 2
rows, `pending` 0, and the hint under the button still read *"Not saved until
you press Save allowance"*. `money.js:1759` is the same early return.

### Read, not run, but the same line

- **Gate round** (`gate.js:432` create, `:961` tick one of the ten items,
  `:986` release / send for a decision) — every one guards on `!d` and returns.
  The departure check writes nothing. I reached the per-bus panel and it
  correctly refused a bus with no driver, so I could not get as far as an item
  tap; the three call sites are unambiguous.
- **People** (`people.js:1698, 1747, 1826, 1924, 1964, 2008`) — add a joiner,
  mark a leaver, crew PINs, the coaching decision, the conversation log.
- **Job card**'s other six writes — the four workshop times (§3.1 step 3), the
  odometer, the close (step 6), the second signature (step 7), delete, and the
  mechanic's part request (§3.2 step 4).

### Why every check is green

`scripts/predeploy-gate.sh` says so itself at lines 1399 and 1451: *"the gate
never opens /v2 at all"*. It greps v2 and drives `v2/ui/gallery.html`; it boots
`/v2/index.html` never.

The node suites cannot see it either, and the reason is written down in the one
file built to cover this gap. `test_v2_browserpath.js:232–242` states the rule
exactly:

> a top-level `const` goes into the global LEXICAL scope rather than onto the
> global object. That is exactly why every v2 module resolves its neighbours as
> `typeof DB !== 'undefined' && DB` first and `root.DB` second

— and then line 252 does `win.DB = inCtx('DB')`, hanging `DB` on the fake
`window`, which is the one thing the real page never does. The harness
manufactures the condition that makes `root.DB` work, so a suite cannot fail on
its absence. The claim in that comment is also false for the six files above.
This is a check that cannot fail, in CLAUDE.md's sense, and it is the reason a
product whose every write is dead has a green gate.

---

## F2. The crew manager cannot open the Duty board. Ever. And their Today lies about it.

**RAN. 40 seconds on the screen, with tonight's list present in IndexedDB.**

The crew manager's day is §3.6: pick tonight's buses, then fill three seats on
each. Signed in as `u-cm` with `nightlist` holding 6 running buses and 4
`dutylog` rows on disk:

```
Duty board  — No data  Loading  2026-11-06 · tonight … Tonight | Who was on a bus  Loading
after 40s: identical
typeof S.cache.nightlist -> undefined
typeof S.cache.dutylog   -> undefined
typeof S.cache.coachai   -> undefined
```

`duty.js:539–546` correctly refuses to guess: with either store `undefined` the
model stays `kind:'loading'` and the screen draws a skeleton. The problem is
that **nothing ever loads them for this role.** `PullApply.FIRST_STORES`
(`v2/pullapply.js:263–266`) is the only list `Boot.enter` reads, and it does not
include `nightlist` or `dutylog`. `duty.js`'s only `Cache.load` is inside
`retry()` (`duty.js:986–989`), reachable only from the **error** state — and the
screen is in the **loading** state, so no Retry button is ever drawn. The single
code path in all of v2 that loads these two stores is
`attention.js:317` — the `seat` row kind's store list — and **the crew manager
does not hold Attention** (`Caps.screensFor('crewmanager')` = today, people,
duty, fuel, reviews, me).

So for the one role whose job this screen is, the Duty board is a permanent
skeleton and there is no sequence of taps that changes it.

Their Today then compounds it. With six buses ticked for tonight it reads:

> Seats to fill tonight **— No data** · Free drivers **— No data**
> Tonight's buses with an empty seat
> **"Tonight's buses are not picked yet"**
> *"Open the Duty board and tick tonight's buses off the register."*
> [ Pick tonight's buses ]

Every word of that is false, and the button it offers leads to the skeleton.
`today.js:419–433`'s `tonight(q)` returns `null` both when `nightlist` is
unloaded and when there is no record for tonight, and the crew manager's block 2
cannot tell those apart.

Cost in the yard: nobody can be put on a bus by the person whose job it is. The
supervisor can do it instead (F3 says at what price), so the fleet runs — but
§3.6 steps 1, 2, 3 and 5 are all unavailable to the role that owns them.

---

## F3. Twelve stores are never loaded by anything, so the owner's four numbers and Money's total do not exist

**RAN.**

`FIRST_STORES` is 19 names. Of the stores the screens read, these are in none of
the four load lists that exist (`attention.js:347` per row kind, `store.js:488`,
`fuel.js:68`, `gate.js:887`):

`trips`, `coachai`, `digest`, `usage`, `rbcomplaints`, `rbalias` — **no code
path anywhere in v2 loads these.**
`nightlist`, `dutylog` — only via Attention (F2).
`ledger`, `audits` — only via Attention (the pilferage and stock row kinds) or Store.
`purchases` — only via Store.
`def` — only via Fuel & tyres.

None of those side doors is open to every role that needs the figure: the crew
manager holds no Attention and no Store, and the owner's Today needs `purchases`
and `ledger` before he has tapped anything.

What that costs, measured on the screen:

**The owner at 6.40am (§3.7 step 2) gets two of his four numbers.** Signed in as
`u-owner`, straight to Today:

```
Repair cost, 30 days  — No data     (needs ledger, trips, def)
Owed to suppliers     — No data     (needs purchases)
Buses on road  20 of 24             ✓
In shop        4                    ✓
```

**Money never shows a total.** Owner → Money, nothing else visited:

```
Running cost, this month   — No data
Fuel & AdBlue              — No data   "Could not read the fuel log"   [Retry]
Parts                      — No data   "Could not read the parts issued" [Retry]
Trip cash                  — No data   "Could not read the trip cash"  [Retry]
"One part could not be read, so the total is not shown."
```

Refusing to show a wrong total is the right call and I want that on the record.
But the figures only arrive if he first wanders through other people's screens:
after visiting **Fuel & tyres**, `Fuel & AdBlue` became `37500`. `trips` stays
`undefined` whatever you do, so **Trip cash and the running-cost total are
permanently unavailable** — which takes out §3.3 steps 4–5 and §4.1 #7's
"running cost per bus including trip cash" on the read side too, not only the
write side of F1.

**The supervisor's front door (§3.1 step 1, §3.3 step 1).** Straight to Today:
`Going out tonight` is a skeleton, for ever. After visiting Attention in the
same session it fills correctly. His front door depends on his having tapped a
different tab first.

Also permanently absent, for the same reason: the Monday summary (§3.7 step 2,
`digest`), "who opened what" (§3.7 step 5, `usage`, reads `— No data` on the
owner's Me), the crew manager's coaching approvals (§3.6 step 5, `coachai`), and
Reviews' `Complaints 0` / `Names to confirm 0`, which are hard zeros rather than
unknowns because `rbcomplaints` and `rbalias` are never read.

---

## F4. Attention invents a count off a half-loaded replica, and sends the supervisor after drivers who are already on the bus

**RAN. Proven by loading the two stores one at a time.**

`attention.js:815` `seatRows` reads `read('dutylog')`, which yields `[]` when
the store is unloaded, so "no dutylog on this device" and "nobody is assigned"
are the same value. With `nightlist` loaded and `dutylog` not — which is the
state every supervisor passes through on the way in, because Attention's own
load fills them in one call but the first render happens before it lands:

```
nightlist loaded, dutylog undefined:
  RJ14 PA 1023 — no crew   "Picked to run tonight. 2 seats still empty."
  RJ14 PB 4567 — no crew   "Picked to run tonight. 2 seats still empty."
  RJ45 CC 8890 — no crew   … (6 rows)

both loaded:
  RJ14 PB 4567 — no conductor  "1 seat still empty."
  RJ45 CC 8890 — no crew       … (5 rows)
```

RJ14 PA 1023 has all three seats filled. It is reported as having no crew and
two empty seats, with no loading state and no hedge. I watched the same rows
appear on the supervisor's Today: `RJ14 PA 1023 — no crew  2 seats`.

This is the defect `v2-ux.md §4.1` #2 names ([E] ba274f6, *"67 buses need a
driver"*), reproduced by a load-order race rather than by a missing narrowing.
The cost is a supervisor walking the yard to crew buses that are crewed, then
learning to scroll past the red — which is the exact habit the row kind was
built to prevent.

---

## F5. Money's five Retry buttons do nothing

**RAN.** Captured the screen text, clicked every button whose label is `Retry`,
captured again:

```
window.__R.m1 === window.__R.m2   ->  true
typeof S.cache.trips              ->  undefined (before and after)
```

`money.js:862–864`:

```js
function retry() {
  if (root.Shell && typeof root.Shell.mount === 'function') root.Shell.mount(ID, null);
}
```

It re-renders from the same cache and never calls `Cache.load`. A button that
appears under *"Could not read the trip cash"* and redraws the identical
sentence is worse than no button: it teaches the owner that the screen is simply
broken, and it is the only affordance he is given.

`duty.js:986` is the correct shape for this and would fix it.

---

## F6. A phone that has never synced tells its user it is up to date

**RAN. Observed on all eight roles; it is the whole of a driver's and a
conductor's status display.**

`v2/sync.js:184` — `lastSyncAt = parseInt(ls.getItem('lastSyncAt') || '0', 10)`.
A device that has never synced holds **0**, not `null`. `me.js:509` guards
`ms == null`, and 0 is not null, so epoch renders as a time. The office is IST,
so:

```
Me  ▸ Last sent        05:30
    ▸ Updated 20763 days ago
    ▸ This phone holds 91 of 91 records
Today  ▸ "No signal since 05:30. What you see may be out of date."
Attention ▸ "No signal since 05:30 am"
```

Two separate problems in one line. The time is a lie dressed as a fact — the
phone has never sent anything. And `meHolds` (`me.js:900–902`) is drawn **only
when the replica is incomplete** and then prints `held` of `held + behind`,
which on a never-synced device is `91 of 91`: the sentence that exists to say
what is missing reports nothing missing.

`v2-ux.md §4.1` #12 forbids exactly this and lists eight distinct causes of
*"everything exists, just no data"* where the only symptom anyone saw was
silence. This is a ninth, and for a driver or conductor — whose whole app is Me
— `Last sent 05:30` and `91 of 91 records` are the only two facts the product
offers them about why their screen is empty.

---

## F7. Hindi: 1,246 pending strings, not 504, and the login screen has none

**RAN** the fallback; **READ** the counts.

`W.pending().length` on the live page returns **1,246**. `DECISIONS §21` says
504 words, 459 genuinely new. Whatever that figure counts, it is not what a
person sees.

Per file, `hi: ''` of total `hi:`:

| File | pending / total |
|---|---|
| `v2/login.js` | **29 / 29** |
| `v2/screens/store.js` | 146 / 146 |
| `v2/screens/jobcard.js` | 111 / 111 |
| `v2/screens/fuel.js` | 88 / 88 |
| `v2/screens/reviews.js` | 64 / 74 |
| `v2/screens/attention.js` | 50 / 50 |
| `v2/screens/jobs.js` | 42 / 42 |
| `v2/screens/me.js` | 74 / 108 |
| `v2/screens/today.js` | 71 / 79 |
| `v2/screens/people.js` | 151 / 159 |
| `v2/screens/money.js` | 101 / 109 |
| `v2/screens/gate.js` | 78 / 79 |
| `v2/screens/duty.js` | 61 / 66 |
| `v2/screens/buses.js` | 132 / 134 |

**Worst affected, for the roles least able to read English:**

1. **`login.js` — 29 of 29 pending.** Every driver and conductor must get
   through the sign-in screen, and there is not one Hindi string in it.
2. **Me — 74 of 108.** It is the entire application for driver and conductor.
   Set `lang="hi"` and the driver's one screen reads:

   > Me No signal Ramlal ड्राइवर · Mahalaxmi Travels **छुट्टी** Sends when there
   > is wifi [meSendsOnWifi] हाज़िरी In [meIn] · 10:56 · Location not recorded
   > [meNoLocation] मेरी बस में समस्या बताएं Yours [meYours] Your documents
   > [meDocs] 0 … Last sent [meLastSent] 05:30 20763 दिन पहले अपडेट हुआ …

   The bracketed ids are the designed behaviour (`v2-foundation-ui.md §6.3`) and
   are better than silent English — but as the whole product for two roles it is
   not shippable.
3. **The mechanic's four screens are effectively all English**: today 71/79,
   jobs 42/42, jobcard 111/111, store 146/146.
4. **One word to look at in the §21 sitting, flagged and not judged** — I am not
   qualified on Hindi: the attendance check-out button renders as **"छुट्टी"**,
   which ordinarily means *leave / holiday*. A driver tapping it may believe he
   is marking himself off work rather than clocking out.

---

## F8. Store opens on "0 parts" and a skeleton for 3.3 seconds, every single visit

**RAN.** Instrumented the first content paint with 7 parts on disk:

```
  251 ms   "Store … 0 parts … Loading"
 1254 ms   "Store … 0 parts … Loading"
 2265 ms   "Store … 0 parts … Loading"
 3270 ms   "Store … 7 parts … Brake Pad Set (front) 12 set …"
```

`store.js:1641–1644`'s `load()` fires `Cache.load(STORES)` and **discards the
promise** — no `.then(redraw)`, unlike `fuel.js:1322` and `attention.js:1035`.
So the screen only updates on `boot.js`'s next four-second sync tick. On a Core
2 Duo that is one tick or two.

The headline is the part that matters: for three seconds the storekeeper's own
screen says **"0 parts"**, drawn as a settled figure, on a shelf holding seven
lines. That is `v2-ux.md §4.1` #7 broken in the one place a storekeeper looks
first. The honest reading is `— No data` or the skeleton's own count.

The same screen is correct once loaded, including `Low` on the two parts under
their reorder level and `7 of 7 shown`.

---

## F9. Today says four buses are standing; Jobs says three

**RAN**, same device, same second, supervisor.

```
Today  ▸ Standing in the yard: 4 rows (j2, j6, j5, j3)  "See all (4)"
Jobs   ▸ "3 standing", 3 rows (j2, j6, j5)
```

j3 carries an `externalVendor`, so Jobs files it under **Away for repair** while
Today counts it as standing. One of the two is wrong about the question both
claim to answer. Minor in money, corrosive in trust: this is the first number a
supervisor sees each morning and the screen he taps to act on it disagrees.

Secondary, same screen: the `3 standing` headline does not change with the tab —
on **Away for repair** it reads `3 standing` above one row.

---

## F10. The mechanic's card invites three taps he cannot make

**RAN.** On `u-m1`'s own job card:

```
The four times
  Came in     12:56
  Start time  — not recorded   Tap to add it   — No data
  Done time   — not recorded   Tap to add it   — No data
  Out time    — not recorded   Tap to add it   — No data
```

None of those three rows carries a `data-act`; the only controls on the card are
`jobStart` and `jobRequest`. `§3.2` is explicit that everything else on a
mechanic's card stays read-only, and it is — but the card asks him three times
to tap something that cannot be tapped. On a 64-pixel yard row under a thumb
that is three dead presses per card.

---

## F11. The bus pick-lists in sheets are not in any order a person can scan

**RAN.** Money's `Give allowance` and Jobs' `New job card` both list all 24
buses as:

> RJ14 PA 1023, RJ14 PE 3010, 3011, 3012 … 3019, **RJ14 PB 4567**, RJ14 PE 3020
> … 3024, **RJ45 CC 8890**, **RJ14 PD 2211**, RJ14 PE 3005 … 3009

The Buses screen sorts the same fleet correctly, so the comparison is available
to the user. At a gate at eight in the evening, on a hundred buses, finding the
right registration in that order is the slowest part of a flow stage 1 costed at
"two fields and a save". The allowance sheet also offers the whole fleet rather
than tonight's six, which the device already knows.

---

## F12–F14. Readings, not runs

- **F12.** `duty.js:336–341`'s `seatKeyOf` derives the seat from
  `drivers[crewId].driverSlot`, not from the `dutylog` row's own `seat` field,
  and an absent slot reads as Driver 1 (the comment at line 334 owns this).
  `perBus[bus][seat] = r` is last-write-wins, so **two drivers on one bus who
  both lack `driverSlot` collapse into one seat and the earlier one disappears
  from the board while remaining in the append-only log** — the shape of the
  same-role seat-clearing bug the manual still tells users to report
  (`05 §4` row 26). `duty.js:1093` writes the slot on every seat v2 fills, so
  this bites only rows inherited from v1. I could not separate it from my own
  fixture, which also lacked distinct slots. **Not verified.**
- **F13.** `gate.js:572` and `:824` render *"Sent {0}"* from
  `r.check.sentAt || r.check.updatedAt`. `updatedAt` is sync bookkeeping, not a
  send time. The `Sent 05:30` I saw was my fixture's `updatedAt: 1`, so this is
  a reading about the fallback, not an observed defect.
- **F14.** On a shared yard phone, Me shows `Waiting to send 3` to a driver for
  writes a supervisor queued (`Sync.info().pending` is device-wide; `info()`
  computes `heldForOthers` per actor but `me.js:899` draws the raw count). The
  driver cannot act on it and has nothing of their own pending. Low, and it may
  be intended as "what this device is carrying".

---

## What I checked and found correct — so the next reviewer does not redo it

All **RAN** unless marked.

**The shape of the thing is right.**
- `Caps.screensFor` / `Caps.navFor` match `§4.2` and `§4.4` exactly for all eight
  roles, including **driver and conductor at one screen and no bottom nav at
  all** (`{"items":[],"more":[]}`). Supervisor and owner each get six slots with
  seven behind More.
- A mechanic sees **only his own card**. `u-m1`'s Today and Jobs show j5 and
  never j6 (`u-m2`'s), on both screens, with `1 standing`.
- The mechanic's Job card offers `I have started` and `I need a part` and
  **no close and no verify button** (§3.2).
- The card the supervisor closed himself reads, on his own Attention, *"Closed 0
  days by Vajid (Supervisor), needs a second signature. Not signed off here
  yet."* and on his Today *"Waiting for someone else"* — with no verify control.
  `DECISIONS §10` / §3.1 step 7 is honoured in the read model.
- The issue-a-part sheet asks for **the card first and pre-selects nothing**
  ([E] d738a6e). It then names the card in the confirmation sentence.
- The Gate round refuses a bus with no driver and says where to fix it: *"No
  driver is crewed to this bus. Put somebody on a driver seat on the duty board
  first."* No dead end, no silent empty panel.

**Two flows work end to end, offline, and persist.**
- **A driver reports a fault (§3.4 step 4).** Me → *"Something is wrong with my
  bus"* → pick an area from nine → type → **Send**. `driverreports` 2 → 3,
  outbox 3 → 4. Three taps and a sentence. This is the one write a driver has
  and it is sound.
- **Filling a seat on the Duty board (§3.6 step 3), as supervisor or owner.**
  Two taps: the empty seat, then the person. `dutylog` 4 → 5, three items
  queued. The seat sheet lists free crew first with *"Free · 0 nights this
  week"*, then the busy ones with where they are — which is the right answer to
  "who can take it". Filling Driver 1 did not touch Driver 2 or the Conductor.

**The zero-versus-unknown rule holds in the renderers** (`§4.1` #7,
`v2-foundation-ui.md §3.6`). I tried to break it and could not:
- A bus with no odometer reads `RJ14 PD 2211  — No data` on Buses, never `0 km`.
- Money says `Fleet cost per km — No data`, *"Worked out over 0 km from 0
  buses. 24 buses have no km."* and lists `Cannot work out cost per km (24)`
  per bus with a reason — *"Only one reading since 1 Nov"*, *"No readings since
  1 Nov"*. It refuses the division that produced ₹45,000/km ([E] 8db78e7).
- A month with no spend reads `November — No data`, not `₹0`.
- Me reads `Your reviews — No data`, not 0.
- The exceptions are F6's `91 of 91 records` and F8's `0 parts`.

**Counts that can reach zero.**
- The Duty board's `5 of 6 buses still need somebody` is narrowed by tonight's
  `nightlist`, exactly as `DECISIONS §8` intended, and the denominator is six —
  not a hundred. The Gate round's `1 of 6 checked out of the gate` likewise.
  [E] ba274f6 is genuinely fixed **in the model**; F4 is a separate failure of
  the data behind it.
- Attention's filter counts (`All 12 Safety 2 Money 0 Papers 4 Waiting 6`) add
  up to the rows shown, and every row carries its reason inline.

**Empty states are real sentences with a next step**, not headings over
nothing — *"No bus is standing in the yard"*, *"No parts in the book yet /
Receive a bill to add parts."*, *"To ask for a part, open your job card."*,
*"No fills recorded yet / Log the first diesel fill."*, *"That job card is not
on this phone / Back to jobs"*. The Jobs Completed and Away-for-repair tabs both
filter correctly. A device with no roster at all draws *"No accounts on this
phone yet — The server could not be reached, so there is nobody to show."*,
which is honest rather than a white page.

**Offline is treated as normal, not as an error.** Every screen carries one
freshness line, `Sends when there is wifi` sits under the check-in button, and
`Change my PIN` says *"Needs a connection. Try when there is signal."* rather
than failing on tap.

---

## What I could not check, and why

- **Anything that needs a camera**: check in / out with the live face, the three
  departure-check photos, the 1.5-second hold, the selfie of the driver, the
  before/after photos and the close gate. Headless, no camera. The 1.5-second
  hold is `DECISIONS §12`'s control, not decoration, and remains unexercised by
  anybody.
- **Anything that needs a server**: `/roster` against a real server, PIN login
  (I used `Boot.enter`, as instructed), push and the outbox draining, the
  AI bill read, Claude's coaching drafts, the digest. All of the server-side
  refusals are REV-AUTH's lane in any case.
- **The People person sheet** and the **shelf count** end to end — my selectors
  missed the person row and I ran out of road on the count. Both save through
  `root.DB`, so F1 covers their writes, but their read models are unreviewed.
- **Chrome 109 on a Core 2 Duo.** I measured in Chrome headless on a Mac, so
  F8's 3.3 seconds is a floor, not the office's number. REV-FLOOR's limitation
  applies here unchanged.
- **Real Hindi quality.** I counted pending ids and flagged one word. The
  translations that do exist I am not qualified to judge.
- **A second device editing the same record.** One browser, one tab.

---

## The answer to the question

**No. A hundred people cannot do their work with this today, and the reason is
narrow enough to be encouraging.**

Nothing I found is a design failure. Stage 1's flows are the right flows; the
capability model holds; the renderers obey the rules the UX doc spent its length
arguing for, including the two the product has been burned by most. Six of the
eight roles are blocked by **three mechanical faults**:

1. **`window.DB` and `window.Sync` do not exist** (F1). Six files resolve them
   the one way that cannot work in a browser. The fix is the idiom the other ten
   files already use, and it is six lines plus the eleven `root.DB.put` call
   sites in `store.js`, `money.js` and `jobs.js`.
2. **Nothing loads twelve of the stores the screens read** (F2, F3, F4). The fix
   is a mount-time `Cache.load` per screen — `duty.js:986`'s list is already
   written, in the wrong function — and `FIRST_STORES` growing by the handful
   that Today and Money need.
3. **`lastSyncAt` is 0 where it should be null** (F6). One line.

F1 should also be treated as a finding about the gate, not only about the code.
A product whose every write is dead passed every check, because the one harness
built to cover the browser path hangs `DB` on its fake window and its own
comment explains why that is the one thing the page never does. Until something
boots `/v2/index.html` and asserts that one record landed on disk, the coverage
number for v2's writes is zero however green the gate is.

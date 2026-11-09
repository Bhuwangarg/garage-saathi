# Outside repair — assembly

**Stage 4 of `docs/v2/PIPELINE.md`. Slug: `outside-repair`.** Assembled 2026-11-09.
Input: `outside-repair-ux.md` (stage 1), `outside-repair-ui.md` (stage 2),
`outside-repair-contract.md`, and the ten slices of
`outside-repair-frontend-slices.md` and `outside-repair-backend-slices.md`.

**Branch: `launch-v2`.** Nine commits, `93a32a5..a7002ad`. Nothing is pushed and
nothing is deployed — that is the owner's, and §7 is the handover.

Every number below was measured here, on this machine, today. Where a number is
worse than the one stage 1 or stage 2 promised, it is in §5 with the promise beside
it. Where something does not work, it is in §6, which is the section to read first
if you only read one.

---

## 1. What is on the branch

| Commit | What |
|---|---|
| `1df222a` | The stage-2 UI spec, the contract, and the two cut tables (paperwork first, so the code can be read against it) |
| `6868362` | **OR1** `v2/outside.js` — the rules, pure; `v2/caps.js` — `gatePass` |
| `4f29f3f` | The capability-count pin, 45 → 46, in its own commit |
| `d06d5d2` | **OB1 + OB2** the read boundary, the write guard, the close gate, the rewind — and the `readScope` wire neither slice owned (§3 seam 4) |
| `efd0a3f` | **OB3** `DB.putMany`, one transaction over three stores; the contract-10 fixtures |
| `568c4a8` | **OR2** the three gate-pass sheets, and the words the slip prints |
| `25ca3e2` | **OR3–OR6** job card, Jobs' Away tab, Attention, Fuel & tyres, the piece register |
| `f50e1a5` | **Assembly** `ui/passes.js` and `outside.js` onto the page and into the worker's shell; three pins moved |
| `a7002ad` | **OB4** the cost harness and the budget check; the budget check moved to the serial phase |

The order is the dependency order: the pure rules, then the contract the screens
were written against, then the local write transaction, then the sheets, then the
screens that open them. The tip is green (§4). Intermediate commits are not all
green — `6868362` through `25ca3e2` each leave a check red that a later commit in
this sequence satisfies, and the glue commit `f50e1a5` is what makes the page load
at all. Bisect from `a7002ad`, not from the middle.

Every slice arrived `DONE_WITH_CONCERNS`. No slice's files were discarded and no
check was deleted to make anything pass.

---

## 2. The slices, as they landed

| Slice | Files | Its own checks |
|---|---|---|
| OR1 | `v2/outside.js`, `v2/caps.js`, `test_v2_outside.js` | 31 |
| OB1 | `v2_perms.py`, `v2/sync.js`, `test_outside_readscope.py`, `test_readscope.py` | 54 + 251 |
| OR2 | `v2/ui/passes.js`, `v2/ui/work.css`, `v2/ui/fuel.css`, `test_v2_passes.js` | 12 |
| OB2 | `sync_server.py`, `v2_outside.py`, `test_outside_guard.py`, `test_outside_roles.py`, `test_guardwrite_v2.py`, `test_thief.py`, `test_servicelog.py` | 67 + 20 + 124 + 56 attacks + 12 |
| OB3 | `v2/db.js`, `test_v2_outside_db.js` | 29 |
| OR3 | `v2/screens/jobcard.js`, `v2/screens/jobs.js`, `test_v2_work.js`, `test_v2_outside_card.js` | 77 + 16 |
| OR4 | `v2/screens/attention.js`, `test_v2_attention.js`, `test_v2_outside_attention.js` | 60 + 8 |
| OR5 | `v2/screens/fuel.js`, `test_v2_fuel.js`, `test_v2_outside_fuel.js` | 91 + 8 |
| OR6 | `v2/screens/store.js`, `test_v2_store.js`, `test_v2_outside_store.js` | 87 + 14 |
| OB4 | `scripts/measure-outside.py`, `test_outside_cost.py` | 5 |
| assembly | `v2/index.html`, `v2/sw.js`, `test_v2_boot.js`, `test_v2_browserpath.js`, `scripts/run-tests.py` | 60 + 70 |

---

## 3. The seams, and how each was verified

A seam is where one slice's output is another slice's input. Each was checked
against the real shape on disk, not against the brief.

### Seam 1 — `v2/outside.js` → five screens and the sheets

**Holds.** Every call site matches the published signature: `gateMet(card, passes)`
and `gateState(card, passes)` in `jobcard.js:422/619/756`, `passesFor` at `:1008`,
`awayDays(card, now)` at `:1014` and in `jobs.js:viewRow`, `daysOut(pass, now)` in
`store.js:1474`, `fuel.js:709` and `jobcard.js:1058`, `OVERDUE_DAYS` in
`attention.js:outsideUnitRows` and `jobs.js`. Every consumer resolves `Outside` at
call time through its own accessor, so none of them is a load-order dependency.

Verified by reading both sides and by walking the screens (§4.3). One wart, not a
break: `jobcard.js` has a `function outside()` that can return `null` and four of
its five call sites do not guard it. With `outside.js` on the page (now true) it
cannot be null; before the glue commit it could, and the card would have thrown.

### Seam 2 — the capability equality, client half and server half

**Holds.** `PERMS.gatePass` is `['owner','supervisor','store','crewmanager']`, equal
to `manageComponents`; `WRITE_ROLES["gatepasses"]` and `WRITE_ROLES["components"]`
are assigned from the **same literal** `_PIECE_WRITERS`, and
`v2_perms.assert_write_roles_follow` raises at import if they ever differ.
`STORE_READ_ROLES["gatepasses"]` is the **same object** as `components`'s, so the
read sets cannot drift at all. `/health` answers `permsOk` from the same two
equalities (`sync_server.py:5972`).

Falsifiability checked, not assumed: `test_v2_outside.js` holds a mutation that
drops a role from `gatePass`, `test_outside_roles.py` holds one that drops a role
from either write set. Both are red when mutated.

### Seam 3 — `DB.putMany` (OB3) → `issueWrite` / `returnWrite` (OR2)

**Holds, and was exercised live** as a crew manager in a real browser, not only in
node. Sending a tyre out and receiving it back:

```
putMany=1  put=0
pass  {id:"gp-k9aiu5rrv65t", no:"OJ-261109-V65T", status:"out",  componentId:"c-t1", jobId:null}
      {status:"returned", returnSerial:"mrf 9921", serialMismatch:false, cost:3200}
piece {state:"sent-out"  -> "in-service", refurbCount:1}
      history entry {id:"h-t20nrv136qvom", passId:"gp-k9aiu5rrv65t"}   -- and no cost on it
```

One `putMany` per save, zero `DB.put`; the draft's id and number survived the save;
the money is on the pass and the history entry carries only `passId`. `'mrf 9921'`
typed against `'MRF-9921'` was recorded as **no mismatch**, which is the published
normalisation agreeing with itself across the seam at runtime.

### Seam 4 — `readScope`: the login response (OB2's file) → the cursor rewind (OB1's file)

**WAS BROKEN. Fixed in `d06d5d2`, with a check that fails when it is cut again.**

Both halves existed and nothing joined them. `v2_perms.read_scope_digest(role)` was
written and tested. `v2/sync.js` read `j.readScope`, compared it with the stored
value and rewound `lastRev`, `lastRevDeferred` and `pullSkips` together — tested,
under node, against a hand-written login body. And `sync_server.do_login` returned
`{token, user}` and nothing else, so **no device would ever have received the field**
and the rewind was unreachable code. Each slice's tests passed; the wire between
them was tested by neither, because a test that builds its own login body cannot
notice that the server does not build one like it.

`do_login` now carries `readScope`, and `test_outside_readscope.py` asserts that a
real login response carries the right role's digest (four roles, nine checks, 45 →
54). Removing the field again turns all nine red — that mutation was run.

A residual remains and it is not ours to decide: see §6, item 1.

### Seam 5 — the close gate, server rule vs client mirror

**Holds.** Server (`v2_outside.has_proof` via `sync_server._close_gate_met`): an
outside card is met by a bill photo on the card, **or** a typed reason, **or** a
returned pass of the card carrying a bill. Client (`Outside.gateState` →
`gateMet`): the same three, in a different order of preference, which changes which
sentence is drawn and not whether the card may close. Walked on the j4 fixture: the
card says *"To close: a photo of the vendor's bill — No bill photo yet. You can close
without it by typing a reason."* and the close leads to a reason field.

The lookup's cost is bounded and was measured, not argued: pointer hit 0.077 ms,
pointer miss (the whole-store scan, worst case) 2.483 ms, ordinary card 0.001 ms
and no query at all.

### Seam 6 — the serial normalisation, published table vs both implementations

**Holds.** All eight rows of contract §4.1 were run against `Outside.mismatch` in
node and against `v2_outside.norm_serial` in python, plus two rows of my own
(`'  alt-771 20 '`, `'ALT 77120'`): identical verdicts on all ten. `Outside.passNo`
matches `^OJ-\d{6}-[A-Z0-9]{4}$` for every sample, including a one-character id
(`OJ-251109-000X`), and `v2/db.js`'s fixture minting is the same expression.

### Seam 7 — the contract-10 fixtures → the screens' checks

**Holds.** Seeded in the browser and read back: `gp-1` out 21 days on `b3`/`j3`,
`gp-0` returned from `c-t2` with `jobId:null` and one bill photo, `c-a1` still
`sent-out` with no pass, `j3` pointing at `gp-1` while staying `outside:false`, `j4`
away in Jaipur with no vendor. `DB_VERSION` is still 29 and no index was added.

One consequence reached a file outside the cut, as contract §10 predicted it might:
`test_v2_browserpath.js`'s "read, and found empty" shelf listed nine stores and
Store now reads ten. Routed to the integrator and fixed in `f50e1a5`.

### Seam 8 — `index.html` / `sw.js` / `test_v2_boot.js` (the integrator's)

**WAS BROKEN. Fixed in `f50e1a5`.** `test_v2_boot.js`'s ORDER declared
`ui/passes.js` and `outside.js`; `v2/index.html` listed neither and `sw.js`'s SHELL
listed neither. On a real page load `Passes` and `Outside` did not exist. Every node
suite passed throughout, because they all take the `module.exports` branch and
require the file directly — which is exactly the gap `test_v2_browserpath.js` exists
for and the reason this stage walks the app in a browser.

### Seam 9 — the refusal strings → the person

**Holds, by the existing mechanism.** The eleven new reasons in contract §6.3 are
prose sentences on the `refused` list; `Sync.info().reasons` carries them
deduplicated and `me.js` block 6 draws each with a Retry. Nothing new was built for
this and nothing had to be.

### Seam 10 — Attention's row → the card and the register

**DOES NOT WORK. Named, not papered over.** See §6, item 2. The row is drawn and
ranked correctly; the deep link it carries is consumed by nobody.

---

## 4. The gate, on the assembled whole

All four commands from `PIPELINE.md`, run here, at the tip:

| Command | Result |
|---|---|
| `scripts/predeploy-gate.sh` | **392 passed, 0 failed** — unchanged count, and none of its checks is this feature's |
| `scripts/run-tests.py` | **90 suites passed, 0 failed; 3,695 counted checks** |
| `scripts/check-floor.py v2 ui` | within the Chrome 109 floor, 62 files |
| `scripts/check-v2-isolation.sh` | v1 and v2 isolated, 10 checks |

`scripts/check-css-floor.sh v2 ui` is green too (it is the same floor check, and
`test_v2_passes.js` runs it as one of its own).

### The counting, because a check that vanished in a merge stopped existing

Baseline: the whole suite at `93a32a5` in a clean worktree — **79 suites, 3,420
counted checks, green.** Assembled: **90 suites, 3,695 counted checks, green.**
+11 suites (exactly the eleven new test files) and **+275 checks**.

Compared suite by suite against the baseline: **no suite's check count shrank.**
Four grew (`test_readscope.py` 246→251, `test_guardwrite_v2.py` 122→124,
`test_servicelog.py` 9→12, `test_v2_router.js` 74→75). Five were modified without
their count changing, and each was checked by name rather than by number:

- `test_v2_fuel.js` — two blocks renamed: the gate-pass-seam sentence no longer
  exists on the screen, and "sending a unit out asks first" became "opens the
  gate-pass sheet". Same count, same subjects, new rule.
- `test_v2_store.js` — "the nine stores it draws from" became "the ten".
- `test_v2_attention.js`, `test_v2_work.js`, `test_v2_boot.js` — changes inside
  existing blocks only; no block added or removed.
- `test_thief.py` prints attacks rather than checks: 46 attack sites → 50, **56 of
  56 blocked**. Its two refusals of a storekeeper's gate pass became a named
  decision-3 allowance for the storekeeper and the crew manager *plus* a loop that
  keeps asserting every still-refused role is still refused. That is contract §7's
  instruction followed exactly: rewritten, not deleted.

### The three pins that moved, and why none of them is a weakening

1. `test_v2_router.js`, 45 → 46 capabilities, plus a new check naming `gatePass` as
   the 46th so the number cannot be satisfied by some other addition.
2. `test_v2_browserpath.js`, 5 → 7 at-load document listeners: `ui/passes.js`'s
   click and change, both inert unless the event came from inside an open
   `.oj-sheet`. Still an exact count, so it still reddens when a *screen* adds one.
3. `test_v2_boot.js`'s dependency table: `ui/passes.js` is listed with no
   dependencies, because it resolves everything at call time and its position is
   pinned by ORDER rather than by that table. Claiming a dependency the mutation
   check cannot catch made the suite red with nothing wrong in the code.

### Running it, as every role

Served locally and walked in a real browser (`gstack browse`), signing in as owner,
supervisor, store, crewmanager, mechanic, driver, conductor and office.

- **Owner / supervisor** — job card j4 draws the away block, the town, "Away for 2
  days", "Since 7 Nov", "Back in our yard" and "Send a unit out on a gate pass". j3
  draws the vendor, the outside cost and the pass row *"Gate pass OJ-261019-0GP1 / AC
  compressor ACC-5512 · out 21 days / At vendor"*. The slip opens and prints; the
  return sheet opens from it; typing `ACC-9999` raises the mismatch confirmation
  with both serials in the sentence and *"Look again"* as the safe answer.
- **Attention** draws the overdue row for the first time in v2's life: *"AC
  compressor ACC-5512 · CoolAir Jaipur / Out 21 days. 14 days is the limit. / 21 d"*,
  under Papers, ranked below the gate holds and the money.
- **Jobs → Away for repair** shows exactly one row, j4, with the `map` mark and
  `2 d`; j3 — a vendor typed, bus in our yard — is **not** there. At yard density the
  row's `.sub` reads *"In Jaipur · no vendor recorded yet"*; at desk density the sub
  is dropped, which is v2's existing desk-row convention and not this feature's.
- **Store** — the storekeeper's job card for an outside card offers no away control,
  no pass row, no vendor block. Correct: their door is Fuel & tyres.
- **Crew manager** — reaches `today, people, duty, fuel, reviews, me` and no more,
  so Fuel & tyres is their only door, as UI §7 says. The pieces tab offers "Send out
  for repair" on an in-service piece and **"Back from the vendor"** on `c-a1`, whose
  row reads *"Out 3 days. No gate pass was made."* The one-way door is closed.
- **Mechanic** — no Away tab, no away controls, and j3 (not their card) is a denied
  read, not an error.
- **Driver / conductor** — `me` only, as before.

**Console: zero errors other than the two that are not the app.** (a)
`ERR_CONNECTION_REFUSED` — the absent sync server. (b) a service-worker scope
error, because `python3 -m http.server` cannot send `Service-Worker-Allowed: /`;
the real server does (`sync_server.py:6248`). The only warnings are *"a figure is
drawn as final while this device is still filling"*, which fires on `today` as well
as on the screens this feature touches — it is the app's own tripwire for an
incomplete replica on a device with no server, and it is not this feature's.

---

## 5. The numbers, against what was promised

### Contract §8, measured by `scripts/measure-outside.py` at load 4.19

| What | Budget | Measured | |
|---|---|---|---|
| `/push` of an outside job card, with vs without the recompute, at 2,000 passes | < 5 ms | **+3.66 ms** | HELD |
| `/push` of a record in an unrelated store | 0 ms | **−0.20 ms**, 0 recompute calls, 0 statements naming `gatepasses` in 20 pushes | HELD |
| The crew manager's first drain | grows by **< 1 page** | **grows by 1 page**: 5 → 6 pages, +2,000 rows, **+873 KB** | **MISSED** |
| Devices that re-drain because of this deploy | crew managers only | 0 today — and that is the other half of the problem (§6 item 1) | — |
| A client write (away, issue, return) | one IndexedDB transaction, three stores dirty | one `putMany`, zero `DB.put`, measured live | HELD |
| The close transition's lookup | not budgeted | 0.077 ms pointer hit / 2.483 ms worst-case scan / 0.001 ms ordinary | — |

**The drain miss is arithmetic, not a slow query, and it was not reasoned about when
the budget was written.** `PULL_LIMIT` is 2,000 rows a page. A crew manager's drain
before the widening is 9,290 rows = 5 pages, so the last page has **710 free
slots**: the **711th** pass is the one that adds a page, and at the fixture's 2,000
it is one page and 873 KB. Below 711 passes it grows by nothing. So the budget as
written is a statement about where a page boundary falls, not about what this
feature costs. Contract §8 says a change to it goes through the lead and into §12 —
it has not been made here. The input that decides it is one of the counts contract
§9(b) leaves to the owner (`SELECT ... FROM records WHERE store='gatepasses'`), and
nobody has run it.

**Nothing in `test_outside_cost.py` can go red for this.** That file keeps the two
push numbers only; the drain budget lives in the harness and is printed, not
asserted. A missed budget that cannot redden anything is a budget nobody will notice
missing again.

### The budget check is load-sensitive, and that is now recorded

Same code, same fixture, same day, three runs of the whole suite plus one standalone:

| How it ran | Three deltas (ms) | Verdict |
|---|---|---|
| In `run-tests.py`'s pool of 8 | 8.69 / 8.50 / 17.17 | red |
| In the pool, lower load | passed | green |
| In the pool, load ≈ 5 | 5.41 / 7.93 / 8.65 | red |
| By itself, load ≈ 6 | 1.57 / 2.03 / 1.70 | green |
| The harness, 60 reps each | +3.66 | green |

The file's reasoning — *"load can only add time to a run, never take it away, so the
minimum is the cost and a busy machine does not redden the build"* — is true of one
timing and false of this one, which is a **difference of two medians taken at
different instants**: load inflates the with-recompute half more than the other, and
the fastest of three differences is still wrong. The suite now runs in
`run-tests.py`'s serial phase. The budget, the reps and the assertion are untouched.

### UI §12, measured by the gate's own `#perf-bed`

| What | Budget | Measured |
|---|---|---|
| 200 dense desk rows, fastest of three | < 250 ms | **74.4 / 72.3 / 71.3 ms** — held with 3.5× margin |

Still a developer's Mac. UI §16.2 rule 7 stands: the real number comes from
`v2/ui/gallery.html` on an office PC, and taking it is an instruction.

### UX §7, the counts that can be read on the fixture

| Promise | Measured | |
|---|---|---|
| Taps to mark a card away: **4 and one typed word** | **3 taps and one typed word** from the open card: the action, the Town field, the town typed, Save | better |
| Taps to issue a pass and print it: **7** with a tracked piece | **7, with nothing typed**: send-out, the piece select, the piece, the vendor field, the vendor suggestion, "Make the gate pass", "Print" | exactly |
| …**9** with a typed unit | **7 taps and two typed words** | better |
| Taps to receive a unit back and refit it: **6 and one photo**, one sheet, one screen | **5 taps, one photo, one typed serial**, one sheet, one screen | better |
| Pieces stuck at `sent-out` with no return possible: **0** | **0** — `c-a1` is receivable, and its sheet says there is nothing to check the serial against | met |
| Cards in the Away tab whose bus is in our yard: **0** | **0** — one away row (j4), and j3 with a vendor and `outside:false` is excluded | met |
| Screens added: **0** | **0** — `Caps.SCREENS` is the same thirteen; no file was added to `v2/screens/` | met |

Counting basis, stated so it can be disagreed with: a tap is one finger-touch of a
control, counted from the screen already open; typing a word is not a tap, and a
`<datalist>` suggestion is one tap. The three flows were counted by performing them
in the browser, not read off the spec.

Everything else in UX §7 needs production and is the owner's: the v1 monthly rate,
the passes-per-month baseline, the count of closes on a typed reason, and who
actually uses it. The SQL is in contract §9(b) and nothing in this pipeline runs it.

---

## 6. What does not work

Nothing here is softened, and nothing here is fixed by a shim.

1. **The widening reaches no device that exists today.** `readScope` is now wired
   end to end (§3 seam 4), but a device that holds a cursor and no stored digest —
   which is *every* device alive before this deploy — stores the digest **without**
   rewinding. That is contract §2.3's own rule, and `test_outside_readscope.py`
   asserts it on purpose ("the first digest a device sees is stored without a
   rewind"). The consequence: **a crew manager will receive gate passes issued from
   the deploy onward and never the ones issued before it**, with nothing on any
   screen saying so. A storekeeper is unaffected — they could already read the store.
   The two honest options, both the lead's or the owner's and neither taken here:
   *(a)* treat "a cursor but no stored digest" as a one-time rewind, which costs one
   full drain per device, once, for every role — the cost §2.3 exists to avoid, paid
   once instead of on every widening; *(b)* accept it, and tell the crew managers
   that the pass history starts on the deploy date. **Slice to change: OB1**
   (`v2/sync.js`, four lines), and contract §2.3's wording with it.
2. **Attention's overdue row goes to the right screen and not to the right thing.**
   The row carries `{to:'jobcard', params:{id, pass}}`, or `{to:'store',
   params:{pieceId}}` when the pass has no card. UI §6 promises the job card "opens
   the slip when `params.pass` is present" and that Store is "the piece's own home".
   Verified live: `jobcard.js` contains no reference to `params.pass` and `store.js`
   none to `params.pieceId`. Tapping the row opens the card (one extra tap to the
   slip, which is at least visible on it) and opens Store **on the Catalogue tab**,
   where the piece is not. Nothing throws and no data is wrong; the promise is
   unkept. `test_v2_outside_attention.js` check 6 passes because it asserts what
   Attention *emits*, which is the shape of a check that cannot see a seam.
   **Slices to change: OR3** (`jobcard.js`: open the slip when the param names a pass
   of this card — and only once, not on every redraw) **and OR6** (`store.js`: open
   the piece sheet for `params.pieceId`). Or OR4 drops the params, which is worse: the
   row would then be the only Attention row that does not take you to the thing.
3. **The crew manager gets no vendor suggestions at the only door they have.**
   `fuel.js`'s `sendSheet` calls `Passes.issueSheet` without `vendors`, so the
   `<datalist>` UI §4.3 row 3 specifies is empty on Fuel & tyres, for both roles
   decision 3 added. Contract §9(c)1 says stage 3 builds their list from the vendor
   names already on the passes and piece history they do receive; nobody did. The
   field is free text, so a pass can still be made — the vendor's name is just typed
   from scratch every time, and two spellings of one vendor is how the Money screen
   stops adding up. **Slice to change: OR5.**
4. **Three word ids are English-only, pending the owner.** `ojChassis`, `ojEngine`
   and `ojSerialNo` were added during assembly because `ui/passes.js` drew those
   three labels as hard-coded English on a slip that gets printed and handed to a
   vendor (`test_v2_words.js` was right to be red). They are registered with
   `hi: ''`, so in Hindi they render as `Chassis [ojChassis]` — the app's own
   pending-label behaviour. They join the rest of UI §11.2's pending list. **The
   owner is the only Hindi speaker on the project; these are his.**
5. **The drain budget is missed at 2,000 passes and nothing can tell you.** §5. The
   budget needs re-deciding against a real count of `gatepasses` in production, by
   the lead, into contract §12 — and the harness's drain figure should become an
   assertion in `test_outside_cost.py` once that number exists, or it will be missed
   again in silence. **Slice to change: OB4**, after the lead decides the number.
6. **`jobcard.js` calls `outside()` unguarded at four of five sites.** Harmless now
   that `outside.js` is on the page, and it is how the defect in seam 8 would have
   surfaced — as a thrown card rather than a missing figure. Worth one guard.
   **Slice to change: OR3.**
7. **Not verified here, and I will not claim it:** the printed slip on paper (the
   print CSS is checked by `test_v2_passes.js` and the sheet draws, but nothing has
   been printed); anything on Windows 7 / Chrome 109 itself — every number in §5 is
   this Mac's; and the live server path for `readScope` over HTTP (the response body
   is asserted in-process, and the handler returns that body verbatim).

---

## 7. For the owner — what this branch changes the moment it merges

Nothing in this stage ran against production, and nothing was pushed.

1. **Decision 1 goes live for the whole fleet, v1 devices included**, because the
   rule is the server's: an outside card can no longer be closed on one photo. A
   supervisor closes without a bill by typing a reason, and the reason stays on the
   card. Cards already at `done` are untouched; only new closes are judged.
2. **Decision 3 goes live**: a storekeeper and a crew manager may issue and receive
   gate passes, and their devices begin receiving passes — with the "from now on"
   limit in §6 item 1.
3. **Three counts are still unknown and are read-only SQL in contract §9(b)**: v1's
   monthly rate of away cards, gate passes by month, and how many pieces sit at
   `sent-out` with no pass. The first two are UX §7's baseline, and the third is a
   number this feature is supposed to drive to zero. The `gatepasses` count also
   decides §6 item 5.
4. **Four policy questions from contract §9(c)** are unanswered and stage 3 built the
   narrow reading of each: the crew manager and the `vendors` registry; the vendor
   name and outside cost still on a mechanic's own card; whether `store` and
   `crewmanager` may re-read a bill later (built as "no"); and whether 14 days is
   still the overdue threshold (built as 14, and the row says so on the screen).
5. **The Hindi for every new id**, including the three in §6 item 4.

---

## 8. Status

**ok = false for stage 5 to start on this as finished work**, and that is a
statement about §6 items 1 and 2, not about the gate. The gate is green on the
assembled whole, every slice's checks are present and counted, and the feature was
walked by every role in a browser. But the widening does not reach a single device
that exists today, and one of Attention's rows does not take you to the thing it is
about. Both are small, both are named, and both belong to a slice rather than to a
reviewer.

A reviewer can start on the rest of it today; the two items above should be fixed
before anybody calls this shipped.

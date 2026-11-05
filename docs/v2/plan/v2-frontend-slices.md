# v2 frontend slices

Stage 3, client side. **The cut, not the build.** This session dispatches no builder
and writes no screen. The dispatching session dispatches from the table below.

Read before any brief: `docs/v2/plan/v2-foundation-ui.md` (final), the four screen
specs (`screens-shell.md`, `screens-work.md`, `screens-assets.md`,
`screens-money-people.md`), `docs/v2/plan/v2-contract.md`,
`docs/v2/plan/v2-backend-slices.md`, `docs/v2/plan/INTEGRATION-NOTES.md`,
`docs/v2/DECISIONS.md` (all 15 sections). A builder reads only the sections its own
brief names.

---

## 0. What exists, and the shape of the problem

**Exists in `v2/`, built and tested (stage 3 backend, commits `0c221c3`, `b1fb43b`,
`ae7586b`):** `db.js` (`garage-saathi-v2`, version 29, `outboxbase`, `nightlist`),
`sync.js` (stale re-apply, `DB.touched`/`touchedMany`, `Sync.info()` with
`stale`/`staleUnresolved`/`quarantined`/`reasons`), `pullapply.js` (19-store first pass
— `gatechecks`, `driverreports`, `crewnotes` are already in it, so
`screens-shell.md §6.4`'s `FIRST_STORES` dependency is **discharged**), `night.js`
(`Night.dayKey/get/setRunning/running/undecided`), `ui/tokens.css` (33 tokens),
`ui/components.css`, `ui/icons.js` (34 marks — `seat`, `challan`, `count` landed),
`ui/states.js`, `ui/overlay.js`, `ui/screens.css`, `ui/login.css`, `sw.js` (no fetch
handler).

**Does not exist: any v2 application.** `v2/index.html` is a bare root — doctype,
viewport, `#app`, the worker registration, **no scripts**. There is no boot, no router,
no cache layer, no `S`, no `t()`/`w()`, no capability table, no screen, no app frame,
no service-worker precache. Everything thirteen screens stand on is built here.

**The rule the cut is organised around**, `DECISIONS.md §3` and `v2-ux.md §4.3`: a
screen declares the capability it needs, and **a screen that declares nothing is
unreachable by everybody, including the owner.** v1 leaked data six times by defaulting
the other way. The router is where that lives, so **F1 is order 0 and nothing else is**.

**Two deliberate exceptions**, and they are why the router needs a sentinel rather than
an empty list: Today (#1) and Me (#12) declare no capability and scope their contents
block by block (`v2-ux.md §4.3`, `screens-shell.md §2`, §4). An empty `declares` must
mean *unreachable*; "open by design" must be a thing a screen says out loud, with a
reason, and the router check asserts **exactly two** screens say it.

---

## 1. The table

`✱` = new file. **Every file appears in exactly one row.** Checked mechanically (§3).

| Order | Slice | Owns | Exports | Consumes | The check that proves it works |
|---|---|---|---|---|---|
| **0** | **F1 — The router and the capability table** | `v2/caps.js` ✱, `v2/router.js` ✱, `test_v2_router.js` ✱ | `Caps.can / PERMS / SCREENS / OPEN_BY_DESIGN / screensFor / navFor`; `Router.register / go / back / current / onChange` | nothing | `test_v2_router.js`: 8 roles × 13 screens both directions; a screen with `declares: []` is unreachable for **all eight roles including owner**; exactly two screens carry `OPEN_BY_DESIGN`; every capability a role holds is reachable from a screen that role holds |
| **1** | **F2 — Boot, the device cache, retention, script order** | `v2/boot.js` ✱, `v2/cache.js` ✱, `v2/index.html`, `v2/sw.js`, `test_v2_boot.js` ✱ | `S`; `Cache.load / sig / sigOf / reads / prune`; `LOCAL_HISTORY_DAYS`; `Boot.start / density / onDensity / replica` | `Caps`, `Router` (F1); `DB`, `Sync`, `PullApply`, `Night`; `nav()` (P1) | `test_v2_boot.js`: `LOCAL_HISTORY_DAYS.nightlist === 395` and prune drops a 400-day row and keeps a 390-day one; the module **contains no `onConflict`** and does pass `onRefused`; index.html's script order loads in a stub `window` with no `ReferenceError` and throws when any two are swapped; every `v2/screens/*.js` on disk is listed in index.html **and** in `sw.js`'s precache |
| **1** | **P1 — CSS primitives, the nav and the photo builders** | `v2/ui/tokens.css`, `v2/ui/components.css`, `v2/ui/nav.js` ✱, `v2/ui/photos.js` ✱, `test_v2_ui.js` ✱ | `--nav-h`, `--thumb`, `--rail-w`; `.num`, `.v2row-why`, `.nav`/`.nav-i`/`.nav-ic`/`.nav-l` (bar + rail); `nav(items, activeId)`, `navMore(items)`; `photoGrid(list, opts)`, `photoCapture(label, name)`, `V2.openPhoto(src, caption)` | `v2/ui/icons.js`, `v2/ui/overlay.js` (read only) | `test_v2_ui.js`: `diff ui/tokens.css v2/ui/tokens.css` and `diff ui/components.css v2/ui/components.css` show **added lines only** — nothing removed, nothing changed; the three tokens are declared in all three theme blocks; no `px` literal in the added rules outside `border*`/`outline*`/`box-shadow`; no bare `ease-in`, nothing over 300 ms; `check-floor.py v2` green |
| **1** | **P2 — Format and domain helpers** | `v2/fmt.js` ✱, `v2/odo.js` ✱, `v2/cost.js` ✱, `test_v2_fmt.js` ✱ | `fmt.rupees / groupIndian / oneDecimal / hours / days / km`; `Odo.check(prevKm, nextKm, atMs)`; `Cost.forBus(busId, days, rows)` | nothing — all three are **pure** (rows passed in) | `test_v2_fmt.js`: `Cost.forBus`'s six parts sum to its total to the rupee and the function returns `null` for the total when a part is unknown; `Odo.check` refuses a reading below the last one and names the last number; `fmt.rupees(null)` throws rather than returning `"₹0"` |
| **1** | **P3 — Hindi: the word table and the chrome** | `v2/ui/words.js` ✱, `v2/ui/states.js`, `v2/ui/overlay.js`, `test_v2_words.js` ✱ | `w(id, n)`, `W.register(table)`, `W.lang()`, `W.ids()`, `W.pending()` | `i18n-hi.js` (read only, for existing values) | `test_v2_words.js`: every id registered anywhere under `v2/` has an `en` value and an `hi` **key**; a **chrome** id with an empty `hi` fails the build; rendering every state and overlay with `lang="hi"` produces no fixed string matching `/[A-Za-z]/`; a quoted capitalised English word in `v2/**/*.js` outside a `W.register` literal fails |
| **1** | **M1 — The row-budget instrument** | `v2/ui/gallery.html` ✱, `scripts/measure-v2-rows.sh` ✱ | the 200-row desk bed, a 200-row `v2row-why` bed, a 2,384-row catalogue bed; three timed runs each, printed with the machine name | P1's CSS, `v2/ui/icons.js`, `v2/ui/states.js` | `measure-v2-rows.sh` prints three runs per bed and exits non-zero when a bed draws fewer rows than asked or a row is missing its mark, figure, badge or button. **It asserts no threshold** — see §5 |
| **2** | **S1 — The app frame** | `v2/shell.js` ✱, `v2/ui/shell.css` ✱, `v2/ui/screens.css`, `test_v2_shell.js` ✱ | `Shell.mount(screenId)`, `Shell.head(title, opts)`, `Shell.body(html)`, `Shell.offline(on)`, `Shell.title(name)`, `Shell.pad()` | `Router`, `Caps`, `Boot.density`, `nav()`, `w()`, `states.js` | `test_v2_shell.js`: the bottom padding equals the nav's own box at both densities and becomes the no-nav half for `driver`/`conductor`; **no `.nav` element exists at all** for those two roles and no fixed bottom bar of any kind; the header is not `position: sticky` and the nav is the only fixed layer; the offline button takes the trailing slot and the title column does not reflow |
| **3** | **T — Today (#1)** | `v2/screens/today.js` ✱, `test_v2_today.js` ✱ | `Today.render(model) -> string`, `Today.model(role, rows)` | S1, P1, P2, P3, F1, F2 | at most four blocks for every one of the six roles; a block whose capability the role lacks is **absent** (no heading); no `.figure-note` inside any `.v2row`; "See all" absent at a count of 0 or 1; the supervisor's block 3 shows **only** `closedBy === me.id`; with `replicaState().complete === false` every aggregate figure carries `data-state="stale"` |
| **3** | **A — Attention (#2)** | `v2/screens/attention.js` ✱, `v2/ui/attention.css` ✱, `test_v2_attention.js` ✱ | `Attention.index(rows, me) -> {rows, counts}`, `Attention.render(index, filter) -> string` | S1, P1, P2, P3, F1, F2 | the index is built once per content signature: draw, redraw with no sync between, assert `Cache.reads()` did not move; 200 rows is one string and one insert; **no `.figure-note` inside any row**, either density; kind 2 excludes `closedBy === me.id` for **owner** as well; kind 1 excludes `userId === me.id` (§6.2); a kind the reader lacks contributes nothing to its filter count |
| **3** | **M — Me (#12)** | `v2/screens/me.js` ✱, `v2/ui/me.css` ✱, `test_v2_me.js` ✱ | `Me.render(model) -> string` | S1, P1, P3, F1, F2 | there is **no state in which the screen draws a heading and no content**, for `driver` and `conductor`; every upload URL appears only as an `<img src>` with `referrerpolicy="no-referrer"` inside `V2.openPhoto` — no anchor, no copy, no share, no download, and block 5 loads no image before a tap; blocks 4 and 8 are absent for the roles that lack them; the device card never says "everything else was sent" |
| **3** | **W — Jobs (#3) and the Job card (#4)** | `v2/screens/jobs.js` ✱, `v2/screens/jobcard.js` ✱, `v2/ui/work.css` ✱, `test_v2_work.js` ✱ | `Jobs.render / model`, `Jobcard.render / model`, `Jobcard.guard(card, me) -> bool` | S1, P1, P2, P3, F1, F2 | a mechanic's list is narrowed **in the query** and `Jobcard.guard` refuses a card they are not on, by id (the `c5c11a1` leak); the closer sees **no** verify control in the DOM, for `supervisor` **and** `owner`; a second eligible person sees it and one tap writes `verifiedBy`/`verifiedAt`; exactly one `--accent`-filled button on a mechanic's card, and after the tap it is gone from the DOM and `status` is unchanged; no group of four time inputs exists; clicking any `input`/`select`/`textarea` leaves the route stable |
| **3** | **D — Duty board (#9)** | `v2/screens/duty.js` ✱, `v2/ui/duty.css` ✱, `test_v2_duty.js` ✱ | `Duty.render / model`, `Duty.seat(busId, slot, crewId)` | S1, P1, P3, F1, F2, `Night.*` | pick zero buses, save, and the count reads a sentence, not "0 of 0"; pick 24, fill every seat, and the count reaches the zero sentence; fill the conductor seat on a bus with both drivers seated and assert Driver 1 and Driver 2 are unchanged (`05 §4` row 26); the board draws a seat from the newest `dutylog` row, not from `buses`; with `Night.get()` null the screen shows the **entry**, not an `emptyState` |
| **3** | **G — Gate round (#13) — BLOCKED, §6.2** | `v2/screens/gate.js` ✱, `v2/ui/gate.css` ✱, `test_v2_gate.js` ✱ | `Gate.render / model`, `Gate.start(busId, driverId, selfie)` | S1, P1, P3, F1, F2, `Night.running` | all six gate-row states render with a mark and a word, never colour alone; a check started by somebody else is **read-only and names them**; "Pass" on `ac`/`blankets`/`cabin` is refused client-side with no photo; the release control is **absent** until all ten are answered; a 6-of-10 check reopens at item seven with its answers. **Once unblocked:** the create payload carries `status:'open'`, a real `startedAt`, a `driverId` crewed to that `busId` and **no** `decision`, and a second check for the same bus and date resumes the first |
| **3** | **B — Buses (#5)** | `v2/screens/buses.js` ✱, `v2/ui/buses.css` ✱, `test_v2_buses.js` ✱ | `Buses.render / model` | S1, P1, P2 (`Cost.forBus`, `Odo.check`), P3, F1, F2 | the screen contains **no per-km figure and no string matching `/per km|\/km/`** (`screens-assets.md §1.2`); five fixed paper rows per bus, so a missing paper is visible as missing on a seed device; a `_redacted` crew phone and an unrecorded one do not look alike; the challan action states its price before it is pressed |
| **3** | **ST — Store (#6)** | `v2/screens/store.js` ✱, `v2/ui/store.css` ✱, `test_v2_store.js` ✱ | `Store.render / model`, `Store.low(parts)` | S1, P1, P2, P3, F1, F2 | with the bundled seed (2,384 parts, every `reorderLevel` 0) the low-stock count is **not** 2,384 and the catalogue does not draw 2,384 red rows; a part name renders exactly as stored (`FULE FILTER` is not title-cased) and search is case-insensitive substring; an issue is never blocked by the book, even below zero; clicking a `.num` in the count grid leaves the route stable |
| **3** | **FT — Fuel & tyres (#10)** | `v2/screens/fuel.js` ✱, `v2/ui/fuel.css` ✱, `test_v2_fuel.js` ✱ | `Fuel.render / model`, `Fuel.mileage(fills)` | S1, P1, P2 (`Odo.check`), P3, F1, F2 | "full tank or part fill" has **no default** and the sheet cannot be submitted without it; a km/l outside 1.5–12 lands under "Readings to check" and is excluded from the mileage figure, not silently averaged in; the falling-mileage flag cannot fire with fewer than four spans; a fill with no odometer still saves and says what is missing |
| **3** | **MO — Money (#7)** | `v2/screens/money.js` ✱, `v2/ui/money.css` ✱, `test_v2_money.js` ✱ | `Money.render / model` | S1, P1, P2 (`Cost.forBus`), P3, F1, F2 | the six parts sum to the hero, and **when they do not the hero is not drawn**; no `|| 1` and no `|| 0` anywhere — a missing km is `figure(null)` and the bus leaves the per-km ranking; the trip bus select's first option is a disabled "Choose the bus"; Trip cash and Fuel are two rows and are never merged |
| **3** | **PE — People (#8)** | `v2/screens/people.js` ✱, `v2/ui/people.css` ✱, `test_v2_people.js` ✱ | `People.render / model` | S1, P1, P2, P3, F1, F2 | the conversation log never renders for the person it is about and has no edit or delete control; identity documents are `manageDrivers`-or-self **per record** and a document URL never leaves the image element; salary is absent without `money`; a duplicate joiner is detected before the write |
| **3** | **RV — Reviews (#11)** | `v2/screens/reviews.js` ✱, `v2/ui/reviews.css` ✱, `test_v2_reviews.js` ✱ | `Reviews.render / model` | S1, P1, P3, F1, F2 | for `office` no PNR, seat, fare or board point appears in the DOM and **no label names one**; Claude's pick is never pre-committed and a bulk confirm lists its rows above the button; the windowed queue uses the one-line row and `rows × --row-h` for its scroll height |

**19 slices, 63 files, each in exactly one row** — checked by script, not by eye: 63
paths, 63 unique.

### Files owned by no slice

`scripts/predeploy-gate.sh`, `scripts/run-tests.py`, `scripts/check-v2-isolation.sh`
(B2's), `v2/db.js`, `v2/sync.js`, `v2/pullapply.js`, `v2/night.js`, `v2/ui/icons.js`,
`v2/ui/login.css`, `i18n-hi.js`, and every v1 file. A builder that needs a change in one
of these **reports it and moves on** — the lead or the integrator makes the edit. Each
screen slice hands its browser-level gate additions (the `.num` navigation sweep, the
Hindi render sweep) to the lead as a patch in its report rather than editing the gate.

---

## 2. Dependencies and waves

```
F1 (router)  ─────────────┐
                          ├── S1 (frame) ── the twelve screen slices
P1 P2 P3 F2 M1 ───────────┘
```

- **F1 is alone at order 0.** Nothing may be reachable before the declaration is
  enforced, and every screen slice is written against `Caps.SCREENS` and `Router.go`.
- **P1, P2, P3, M1 depend on nothing in this cut** and are written against the
  foundation and the contract. **F2** depends on F1's two names only, which its brief
  quotes. All five are order 1 and share no file, so they are genuinely parallel.
- **S1** needs F1 (`Router`), P1 (`nav()`), F2 (`Boot.density`), P3 (`w()`). It is the
  only order-2 slice and it is the seam every screen crosses.
- **The twelve screen slices** share no file with each other and are written against
  S1's five names plus the primitives. They are parallel.

**Waves, and the builder count in each:**

| Wave | Builders | Slices |
|---|---|---|
| 1 | **1** | F1 |
| 2 | **5** | F2, P1, P2, P3, M1 |
| 3 | **1** | S1 |
| 4 | **6** | T, A, M, W, D, G — **G only if §6.2's one-line check says the server change is committed; otherwise 5 builders and G moves to wave 5** |
| 5 | **6** | B, ST, FT, MO, PE, RV |

Wave 4 before wave 5 for one reason only: wave 4 holds the shell's own three screens
plus the two that carry the second signature and the gate, so whatever is wrong with
S1's contract surfaces on six screens rather than twelve. If S1 comes back clean, 4 and
5 can be one wave of twelve — the files are disjoint either way.

**First integration point:** F1 + F2 + P1 + S1 booting to a drawn frame with a nav and
one skeleton body, before a single screen lands. That is the integrator's seam, and it
is named here so it is not a surprise: **`Shell.mount(screenId)` and
`Router.register(id, mod)` are the seam.**

---

## 3. Ground rules every brief inherits

- **Builders run no git command at all.** They work concurrently in one tree; the
  integrator commits. No `git add`, no `git stash`, no branch, no commit.
- **A slice owns its files and touches nothing else.** A change needed outside the slice
  is reported, not made. A builder that edits a colleague's file overwrites work in
  progress.
- `scripts/run-tests.py` auto-discovers `test_*.js` and `test_*.py` **at the repo root
  only — it does not recurse into `v2/`**. Every suite above is therefore
  `test_v2_*.js` at the root. A test in `v2/` would never run, and a test nobody runs is
  not a test.
- The suites are **node, no browser**, in the shape of `test_v2_night.js` and
  `test_ui_states.js`: read the source, load it in a `vm` context holding a stub
  `window` and nothing else, assert on the markup **string** a render function returns.
  This is why every screen exports `render(model) -> string` and keeps its DOM wiring in
  a separate `mount()`: a screen that can only be tested in a browser is a screen whose
  rules are checked by nobody.
- **After adding a check, break the thing it covers and confirm it goes red.** A check
  that cannot fail is decoration. Each brief names the check and the mutation.
- **Never weaken a gate check to make a slice pass.** `scripts/predeploy-gate.sh`,
  `scripts/check-css-floor.sh` and `python3 scripts/check-floor.py v2 ui` are hard gates.
- **One string, one insert.** A screen builds its whole body as one string and sets it
  with a single `insertAdjacentHTML`. Per-row `appendChild` is the shape that cost 277 ms
  per page (`v2-foundation-ui.md §2.3` rule 1).
- **Nothing measures a row.** No `offsetHeight`, `getBoundingClientRect` or
  `getComputedStyle` per row, anywhere (rule 2).
- **No `at` on a figure inside a row.** A list states its freshness once, in its header
  (rule 4). This is the rule a well-meaning builder breaks first.
- **No new field on any record, no new store, no new token, no new icon, no new
  animation.** Under whole-record last-write-wins a field v2 invents is erased the next
  time a v1 device writes that record (`v2-foundation-ui.md §7.1` item 13).
- **A control the person may not use is absent, not disabled.** `aria-disabled="true"` is
  only ever a write in flight, with the label saying what is happening.
- **Status is never colour alone** — every badge, figure note, toast and state carries a
  word and a mark.
- **Unknown, zero and stale are three different figures**, and partial is a fourth. Pass
  the raw value and a `format` to `figure()`; never format first.
- **No dialog about a conflict.** No "Overwrite?", no "keep mine or theirs?", no
  timestamp as a tie-break. A conflict a person must see is a named refusal with a
  reason and a Retry (`v2-contract.md §4.0`, `screens-shell.md §4.6`). `v2/sync.js`
  exports nothing `confirm`-shaped on purpose.
- **No fixed English word outside `v2/ui/words.js` or a `W.register` table** (§4.5).
- Never print, log or paste a secret, token or PIN. Never run a production write or
  deploy — hand the command over.
- v1 must keep working. Nothing under `v2/` reaches outside it except to **read**
  `i18n-hi.js`.

---

## 4. The briefs

Each brief below is what a builder gets, plus the spec sections it names. **It gets
nothing else — not this conversation, not the other slices, not the whole spec.**

### F1 — The router and the capability table (order 0, opus)

**Owns:** `v2/caps.js` ✱, `v2/router.js` ✱, `test_v2_router.js` ✱.

**Read:** `DECISIONS.md §3`, §5, §7, §15; `v2-ux.md §4.3`, §4.4; `screens-shell.md`
lines 218–289 (the nav slots and the More sheet), 325–342 (how the route is shown),
404–416 (the shell's `no permission` state), 470–489 (one slot: no nav);
`v2-foundation-ui.md` lines 493–545 (§3.7, the slot table); `app.js` lines 973–1100
(v1's `PERMS`, 37 capabilities — **transcribe, do not redesign**);
`screens-money-people.md` lines 36–59 (the three declarations and who reaches them).

**The rule this slice exists for**, quoted from `DECISIONS.md §3` and `v2-ux.md §4.3`:
*a screen declares the capability it needs, and a screen that declares nothing is
unreachable by everybody, including the owner.* v1 defaulted the other way and leaked
six times (`02 §6.1`, `02 §6.2`).

`v2/caps.js` holds data and one predicate, no DOM:

```js
Caps.PERMS                      // {cap: [role]} — v1's 37 transcribed, plus the four
                                //   v2 names: viewAttention, viewSpendTotals,
                                //   viewCompanyBilling, viewAdoption (v2-ux §4.3)
Caps.can(role, cap) -> bool
Caps.OPEN_BY_DESIGN             // the sentinel, with a `reason` required beside it
Caps.SCREENS                    // {id: {title, declares, nav, mark, order}}
Caps.screensFor(role) -> [id]   // in rail order
Caps.navFor(role, density) -> { items: [{id, label, mark}], more: [{id, label, mark}] }
```

`SCREENS` is the thirteen, spelled the same in the nav label, the header and the More
sheet (`screens-shell.md §1.6`: *one name, three places, never a synonym*): `today`,
`attention`, `jobs`, `jobcard`, `buses`, `store`, `money`, `people`, `duty`, `gate`,
`fuel`, `reviews`, `me`. **Twelve destinations** — `jobcard` has `nav: false` and is
reached from `jobs`.

`declares` is either a non-empty array of capability names (**any** of which admits) or
`Caps.OPEN_BY_DESIGN` with a reason string. `today` and `me` are the only two, and their
reasons are `v2-ux.md §4.3`'s: their contents are scoped block by block.

Rail order for owner and supervisor, the same list for both so two people at two desks
can tell each other where to tap: **Today, Attention, Jobs, Buses, Store, Money, People,
Duty board, Gate round, Fuel & tyres, Reviews, Me.** Yard slots and the seven-row More
sheet are `screens-shell.md §1.3` exactly; More carries no `aria-current` and is never a
destination.

`v2/router.js` holds the route, the one-deep back stack and the enforcement:

```js
Router.register(id, { render, mount, unmount })   // a screen module registers itself
Router.go(id, params) -> bool    // false when unreachable; Router.current() unchanged;
                                 //   never throws, and NO toast (money-people §0.1)
Router.back()                    // one step up to the parent screen, never into history
Router.current() -> { id, params }
Router.onChange(fn)
```

There is **no URL routing** (`v2-ux.md §2.1`), so there is no address bar to read and no
deep link to guard. `Router.go` checks `Caps` before it changes anything. A screen whose
module never registered is unreachable the same way an unheld one is.

**Checks (`test_v2_router.js`), and the mutation that reddens each:**

| Check | Red when you |
|---|---|
| a screen with `declares: []` is unreachable for **all eight roles including owner** | default an unknown or empty declaration to allow — the v1 defect in one line |
| exactly **two** screens carry `OPEN_BY_DESIGN`, each with a non-empty reason | add a third quietly, or drop the reason |
| 8 roles × 13 screens, both directions: `Router.go(id)` returns false ⇔ `screensFor(role)` omits `id` ⇔ `navFor` omits it | let the nav and the declaration disagree — which is LIVE-ISSUES 6 exactly |
| every capability a role holds in `PERMS` is reachable from at least one screen that role holds | drop a screen from a role's nav and leave the capability (a supervisor holds 16 capabilities with no reachable screen today) |
| owner and supervisor: 5 yard slots + 7 More rows = 12 destinations, no duplicate, no `aria-current` on More; at desk 12 items and **no More at all** | add a thirteenth destination, or leave More in the rail |
| `Router.go` to an unheld screen leaves `current()` unchanged and queues no toast | navigate first and check after |

---

### F2 — Boot, the device cache, retention, and the script order (order 1, opus)

**Owns:** `v2/boot.js` ✱, `v2/cache.js` ✱, `v2/index.html`, `v2/sw.js`,
`test_v2_boot.js` ✱.

**Read:** `screens-shell.md` lines 149–217 (the frame and the density rule), 356–403
(first load and the offline indicator); `INTEGRATION-NOTES.md` items 1, 2 and **4**;
`v2-contract.md §5` (the `nightlist` retention row), §2.1 (`/pull`'s cursor and
`tableMax`); `app.js` line 1378 (`LOCAL_HISTORY_DAYS`, the whole table) and lines
1107–1140 (`storeSig`/`cachedSig` — transcribe the reasoning, it is measured);
`v2/sync.js` lines 1305–1320 (`Sync.start`'s options) and 1388–1394 (`Sync.info()`);
`v2/pullapply.js` lines 219–272 (`replicaState`, `FIRST_STORES`).

**Four things this slice must get right, each from a named finding:**

1. **`v2` has no `LOCAL_HISTORY_DAYS` at all** (`INTEGRATION-NOTES` 1). Create the whole
   table in `v2/cache.js`, not just the new row: `{ gpsevents: 60, triplog: 150,
   stockmoves: 210, usage: 120, audits: 395, dutylog: 395, nightlist: 395 }`. The 395 is
   the contract's: **30 days more than the server's 365-day window, per the existing rule
   that the two must never fight** (`03 §7`). Without the row the store is never pruned
   on the device — the shape of a bug that only appears after a year. `DB.pruneBefore`
   already exists (`v2/db.js:509`); `Cache.prune()` walks the table, one transaction per
   store, and a store that fails is skipped, not fatal.
2. **`onConflict` can never fire any more** (`INTEGRATION-NOTES` 4). What it counted —
   discarded local edits — no longer happens; B3 keeps the key in the outbox and the
   server merges it. So `Sync.start` is wired
   `{ onStatus, onApplied, onRefused, onStoreFail }` and **`onConflict` does not appear
   in this module**. A callback that cannot fire is worse than none, because the next
   person reads the wiring and believes conflicts are handled. `onRefused(n, reasons)`
   feeds Me's device card and the nav's "Me (3)" count through `Sync.info()`.
3. **`v2/index.html` loads no scripts** (`INTEGRATION-NOTES` 2). These are **classic
   scripts declaring top-level `const`s, not modules**, so an order mistake is a blank
   page with one console error. The order, and it is a dependency order, not a
   preference:

   ```
   ui/tokens.css · ui/components.css · ui/screens.css · ui/login.css · ui/shell.css   (styles, any order)
   ui/icons.js → ui/words.js → ui/states.js → ui/overlay.js → ui/photos.js → ui/nav.js
   db.js → sync.js → pullapply.js → night.js
   fmt.js · odo.js · cost.js          (pure, no dependents among these three)
   caps.js → router.js → cache.js → shell.js → boot.js
   screens/*.js                        (any order; each registers itself)
   ```

   `boot.js` is **last** and is the only script that calls anything. `screens/*.js`
   register with `Router` at load and draw nothing until `Shell.mount` asks.
4. **`v2/sw.js` has no fetch handler**, so `/v2` does not open offline at all — on an
   offline-first app for a yard at 20:00. Add the precache and a cache-first handler for
   the shell's own files, keeping `CACHE = 'garage-saathi-v2-<n>'` and the existing
   install/activate behaviour. **The precache list and `index.html`'s script list are
   the same list**, which is why one slice owns both files, and the check below is what
   stops them drifting. Do not touch `scripts/check-v2-isolation.sh` (B2's) — the scope
   cap and the `no-cache` rule for `sw.js` itself must keep passing; if a new invariant
   is wanted, report it.

**Also:** `S = { user, route, stack, cache: {} }`; `Cache.load(names)` does one
`getAll()` per store **per content signature** and nothing per row; `Cache.reads()`
exposes the read counter the screen slices' perf checks assert on; `Boot.density()` is
`desk` when `(min-width: 1024px) and (pointer: fine)` and `yard` otherwise — both
clauses, each for a reason (`screens-shell.md §1.2`) — re-evaluated on **one** debounced
`resize` listener, the only one in the app; `Boot.replica()` wraps
`PullApply.replicaState(lastRev, tableMax, skipCount)` so the frame and every screen read
`{behind, complete}` from one place.

**Checks (`test_v2_boot.js`):**

| Check | Red when you |
|---|---|
| `LOCAL_HISTORY_DAYS` holds all seven rows and `nightlist === 395`; `Cache.prune()` drops a 400-day-old `nightlist` row and keeps a 390-day-old one | drop the row, or prune on the server's 365 |
| the module **contains no `onConflict`** (grep the source) **and** passes `onRefused` | wire `onConflict` back — this check guards an absence, like B2's no-dialog check, and for the same reason |
| index.html's scripts, loaded in order in a stub `window`, raise no `ReferenceError`; swapping any adjacent pair throws | reorder two files, or add a script above its dependency |
| every file matching `v2/screens/*.js` on disk is listed in index.html **and** in `sw.js`'s precache, and every listed file exists | land a screen and forget one of the two lists |
| `Boot.density()`: 1024 + fine ⇒ desk; 1024 + coarse ⇒ yard; 1023 + fine ⇒ yard; exactly one `resize` listener and at most one evaluation per 250 ms | drop the pointer clause (a tablet in landscape gets 32px rows) or the debounce |
| `Cache.load` called twice with no write between does one `getAll` per store | re-read per call — `computeInsights()` at 386 ms per render is this rule being broken |

---

### P1 — CSS primitives, the nav and the photo builders (order 1, opus)

**Owns:** `v2/ui/tokens.css`, `v2/ui/components.css`, `v2/ui/nav.js` ✱,
`v2/ui/photos.js` ✱, `test_v2_ui.js` ✱.

**Read:** `v2-foundation-ui.md` lines 83–113 (§1.2, the three tokens **with their
arithmetic**), 272–289 (the primitive table), 349–390 (§3.3 `.num`), 391–425 (§3.4
`.v2row-why`), 426–465 (§3.5 the photo primitive), 493–627 (§3.7 the nav, bar and rail),
1065–1114 (§7, may and may not); `screens-shell.md` lines 267–289 (the bar and rail
boxes, exact).

**The exact signatures the twelve screen slices are written against** — they are written
before these exist, so these names are the contract:

```js
nav(items, activeId) -> string
// items: [{id, label, mark}].  <nav class="nav" aria-label="Main">
//   <a class="nav-i" aria-current="page"><span class="nav-ic">[icon]</span>
//      <span class="nav-l">Today</span></a> ...
navMore(items) -> string              // the More sheet's body: a.v2row rows, mark in .lead
photoGrid(list, opts) -> string
// list: [{url, caption, pending, failed, local}]; opts {max, capture, label, name}
photoCapture(label, name) -> string
V2.openPhoto(src, caption) -> <dialog>    // full size INSIDE V2.openSheet, never a new overlay
```

`photos.js` is ES5 in the shape of `states.js`: returns markup strings, escapes
everything it is passed. The capture control is a label-wrapped file input, the only way
to reach a camera on Chrome 109 without script; the input is `.sr-only` (clipped, still
in the accessibility tree, **never `display: none`**) and the **label** carries the ring
via `:focus-within`. Every `<img>` whose `src` is an upload URL carries
`referrerpolicy="no-referrer"`, and a thumbnail is a `button`, never an anchor.

**Three tokens, no colours.** `--nav-h` 56/44px, `--thumb` 72/56px, `--rail-w` —/160px,
declared in all three theme blocks per `v2-foundation-ui.md §1.3`'s contract. The
arithmetic is in §1.2 and must be reproduced in a comment, because the next person will
want to round the numbers: `--nav-h` yard is 20 + `--s1` 4 + a 25.5px Hindi label inside
56; the desk rail is twelve items × `--tap` 32px = 384px of a 768px column.
**`test_ui_components.js` allows a `px` literal only inside a `border*`, `outline*` or
`box-shadow` value**, so every height, width, pad and gap in the new rules comes from a
token or the suite fails.

`.num` carries the regression that threw a storekeeper off the screen mid-count: a row
holding a field is `div.v2row`, never `button`/`a`; `type="text"` with `inputmode`, never
`type="number"` (a number input changes its value when the mouse wheel rolls over it —
on a 200-row desk list that is a silent wrong quantity); **no stepper buttons**, which
is also why the icon cap was not spent on a minus mark.

`.v2row-why` adds `-webkit-line-clamp: 2` and `white-space: normal` so the reason wraps
to two lines instead of truncating. A reason truncated to an ellipsis turns the row into
a colour and a number, which is `dashboard` again. The row keeps
`min-height: var(--row-h)` and grows, which is why `v2-foundation-ui.md §2.4` forbids
windowing it.

**Checks (`test_v2_ui.js`):**

| Check | Red when you |
|---|---|
| `diff ui/tokens.css v2/ui/tokens.css` and `diff ui/components.css v2/ui/components.css` show **added lines only** — nothing removed, nothing changed | regularise a hue's lightness, "tidy" a radius, or rename anything. `DECISIONS.md §14`: the copies start byte-identical so the first diff shows exactly what v2 changed |
| the three tokens appear in the light block, the `prefers-color-scheme: dark` block and `[data-v2][data-theme="dark"]`, with identical dark values | declare one in one block |
| no `px` literal in any added rule outside `border*`/`outline*`/`box-shadow`; the three radii are 8/12/999px | size a nav item in px |
| every added selector starts with `[data-v2]`; no colour literal, `hsl()` tokens only | write a bare `:root` — it flips the live app's `--accent-ink` mid-migration |
| no bare `ease-in`, nothing over 300 ms, `transform`/`opacity` only; the nav's active bar does not transition | animate the bar — it is the thing people press most |
| `nav([], 'today')` renders **nothing at all** (not an empty `<nav>`); a one-item list renders nothing | render a one-item nav — a nav with one item is a lie about there being somewhere to go |
| `photoGrid` escapes a caption containing `<script>`, and a `failed` tile stays tappable and carries the word "Not sent" | drop the escape, or remove the retry |
| `python3 scripts/check-floor.py v2 ui` green | reach for `oklch()`, `color-mix()`, nesting or `@starting-style` |

---

### P2 — Format and domain helpers (order 1, sonnet)

**Owns:** `v2/fmt.js` ✱, `v2/odo.js` ✱, `v2/cost.js` ✱, `test_v2_fmt.js` ✱.

**Read:** `screens-money-people.md` lines 105–147 (§1.1, **the six parts of the one cost
basis and their six source records** — transcribe, do not invent a seventh) and 204–239
(§1.4, the unreliable denominator and the ₹45,000/km bug); `screens-assets.md` lines
132–210 (§1.2 one cost basis per bus, §1.3 the odometer rule) and 1016–1056 (§3.5, the
1.5–12 km/l band); `screens-work.md` lines 56–62 (money is `figure`'s `format`, never its
`unit` — "45,000 ₹" is not how anybody here reads it).

All three modules are **pure**: they take arrays in and return numbers and strings. No
store access, no DOM, no clock except an argument. That is what makes them node-testable
and what keeps three screens from each growing their own copy.

```js
fmt.rupees(v) -> string            // '₹' + groupIndian(v); throws on null — never '₹0'
fmt.groupIndian(v) -> string       // 45,00,000 — lakh grouping, not thousands
fmt.oneDecimal(v) / fmt.hours(v) / fmt.days(v) / fmt.km(v)
Odo.check(prevKm, nextKm, atMs) -> null | { reason, message }
// forward-only: a lower reading is never the newer truth. The message NAMES the number:
//   "Lower than the last reading, 48,210 km" — never "Invalid odometer" ([E] 927864c)
Cost.forBus(busId, days, rows) -> { total, parts: [{id, label, value}] }
// rows: {jobcards, fuel, trips, purchases, ledger, components}
// total is null when any part is unknown. The six parts are money-people §1.1's six.
```

**The one rule above the arithmetic**, `screens-assets.md §1.2` and
`screens-money-people.md §7.1` item 1: there is **one** cost basis, it lives here, and
Buses and Money both **read** it. Five bases exist in v1 and they disagree, which is why
people stopped reading them. If the six parts do not sum to the total, the caller does
not draw the total.

**No defaulted denominator.** No `|| 1`, no `|| 0`. A missing km is unknown, and an
unknown denominator means the bus leaves the per-km ranking entirely — 45,000 rupees read
as 45,000/km sent the owner to inspect a healthy bus ([E] `8db78e7`).

**Checks (`test_v2_fmt.js`):** the six parts sum to the total to the rupee; `total` is
`null` when a part is unknown (red when you coerce a missing part to 0); `Odo.check`
refuses a lower reading and its message contains the previous number (red when you
return a generic string); `fmt.rupees(null)` throws (red when it returns `'₹0'` — that is
the unknown-reads-as-zero failure `states.js` exists to prevent, moved one file over);
`groupIndian(4500000)` is `45,00,000`.

---

### P3 — Hindi: the word table and the chrome (order 1, opus)

**Owns:** `v2/ui/words.js` ✱, `v2/ui/states.js`, `v2/ui/overlay.js`,
`test_v2_words.js` ✱.

**Read:** `v2-foundation-ui.md` lines 963–1062 (§6, the voice, the five empty states and
**§6.3, the defect, its cause and the rule**); `screens-shell.md` lines 672–711, 937–965,
1094–1134 (the three copy tables, ~90 ids); `screens-assets.md` lines 1352–1360 (§8 item
4, the 110-more-labels problem this slice answers).

**The defect, verbatim from `v2-foundation-ui.md §6.3`:** `i18n-hi.js` line 8 —
*"Until it arrives `t()` falls back to English, which is exactly what it already did for
any key Hindi was missing."* A missing translation is indistinguishable from a present
one until a Hindi reader opens the screen. Nothing fails. Nobody is told. Trip cash was
English-only in Hindi mode on a screen for the largest role. **And the foundation has the
same hole: `states.js` and `overlay.js` hold 21 English string literals, drawn on all
thirteen screens.**

```js
w(id, n) -> string        // n selects between an id's `one` and `other` forms
W.register(table)         // {id: {en, hi}} or {id: {en: {one, other}, hi: {...}}}
W.lang() -> 'en' | 'hi'   // from the document's own lang — the same source that drives
                          //   --font-hi and --lh: 1.7 through :lang(hi). One source, not two
W.ids() -> [id]
W.pending() -> [id]       // registered ids whose `hi` is empty
```

`words.js` holds the **21 chrome ids** named in §6.3 and the lookup. `states.js` and
`overlay.js` are rewired to read every fixed word through `w(id, n)` and keep **no
English literal of their own**; they already take all caller text as arguments, so this
is the fixed words only. Their English values move into `words.js`. Hindi comes from
`i18n-hi.js` where an equivalent key exists (`cancel`, `save`, `attendance`, `lang`,
`theme`, `logout` and three more) and from the owner otherwise.

**Screen labels, which the foundation sized for 21 ids and the screens need for ~130.**
This is a decision this cut makes, because `screens-assets.md §8` item 4 leaves it open
and two builders appending to one table is a file clash: **each screen slice registers
its own table from inside its own module, with `W.register({...})` at load.** No shared
file, no extra file, and the parity check finds every table by scanning `v2/**/*.js` for
`W.register` literals, so it sees all ~130 ids rather than 21.

**And the honest half of that decision.** "A missing Hindi value is a build error" cannot
hold for ~110 labels nobody has asked the owner about yet without holding the whole
branch red on one sitting. So:

- every registered id must have an `en` value and an `hi` **key**; an id missing either
  fails the build;
- an `hi` of `''` is **pending**, counted and printed by name on every run, and at
  runtime renders the English **with the id visible** (`[meTitle]`) in the dev build, so
  it is loud rather than silent — which is the whole defect;
- a **chrome** id (one of the 21) with an empty `hi` **fails the build**. The chrome is
  on all thirteen screens and has nowhere to hide.

Say the pending count in the report. It is the owner's list and it belongs on the
hand-over (§7).

**Checks (`test_v2_words.js`):**

| Check | Red when you |
|---|---|
| key parity over every table found under `v2/`: `en` present, `hi` key present; fails naming the first offender | add an id with only `en` |
| a chrome id with an empty `hi` fails; the count of pending **screen** ids is printed | leave a chrome word untranslated |
| render `emptyState`, `errorState`, `offlineState`, `skeleton`, `figure`, `openSheet`, `confirmDialog` and all three toasts with the document language Hindi, and assert **no fixed string matches `/[A-Za-z]/`** (caller text and digits excepted) | leave one literal behind — this is the check that would have caught Trip cash |
| a quoted, capitalised, multi-letter English word anywhere in `v2/**/*.js` outside a `W.register` literal fails | hard-code the 22nd word. Without this, the first two checks pass while the screen is wrong |
| `w('minutesAgo', 1) !== w('minutesAgo', 3)` in English; Hindi takes one form for both | collapse the plural selector |
| the two existing suites still pass against v2's copies: `STATES_JS=v2/ui/states.js COMPONENTS_CSS=v2/ui/components.css node test_ui_states.js`, and `OVERLAY_JS=v2/ui/overlay.js node test_ui_overlay.js` | change what the English chrome says while rewiring it |

Those last two commands are the only reason `v2/ui/states.js` and `v2/ui/overlay.js`
stay covered at all: `test_ui_states.js` and `test_ui_overlay.js` default to v1's copies,
and `test_ui_tokens.js` / `test_ui_components.js` have **no** env override, which is why
P1's cover for those two is a diff check. Say so in the report; a check nobody runs
against the file that changed is the hazard here.

---

### M1 — The row-budget instrument (order 1, sonnet)

**Owns:** `v2/ui/gallery.html` ✱, `scripts/measure-v2-rows.sh` ✱.

**Read:** `DECISIONS.md §9`; `v2-foundation-ui.md` lines 216–270 (§2.2 the budget table
and §2.3 the seven rules, §2.4 Attention's cap); `screens-assets.md` lines 87–105 (§0.5,
which decisions ride on the placeholder) and 1374–1380 (§8 item 5, the 2,384-row
problem); `screens-shell.md` lines 858–871 (Attention's three checks);
`scripts/predeploy-gate.sh` lines 1355–1380 (the existing `#perf-bed` block in v1's
gallery — **copy its shape, do not edit that file**).

`DECISIONS.md §9`, quoted because it is the whole point of this slice: *"the '200 dense
desk rows inside 250 ms' budget comes from the existing gate, which admits the figure was
set on a developer's Mac. Every density rule in `v2-foundation-ui.md` is sized against
it... Until then it is an assumption wearing a number's clothes."*

Build `v2/ui/gallery.html` in the shape of `ui/gallery.html` — a plain page, no build
step, ES5 in the gate's scanned blocks (no `=>`, no backtick, no `const` in the code the
gate greps) — with **three** beds, each starting empty and each a `desk`-density
container:

1. **200 dense desk rows.** Each row must carry a drawing, a figure, a badge and a
   button, or bare divs would satisfy the row height and time nothing.
2. **200 `v2row-why` rows**, each with a mark, a **two-line** reason and a figure. This
   is Attention's real row and it is taller and more expensive than bed 1; nobody has
   timed it.
3. **2,384 one-line catalogue rows** — the Store catalogue's real size, twelve times the
   published budget, windowed and unwindowed.

`scripts/measure-v2-rows.sh` drives the page, prints **three runs per bed with the
machine name beside the number**, and exits non-zero only when a bed draws fewer rows
than asked or a row is missing one of its four parts. **It asserts no threshold**, on
purpose: a threshold measured on this machine would be the same lie one layer down.

**What this slice delivers and what it cannot.** It delivers the instrument and this
machine's numbers. **The reading that matters needs a Windows 7 / Chrome 109 Core 2 Duo
in the office**, which no session in this pipeline has. See §5.

---

### S1 — The app frame (order 2, opus)

**Owns:** `v2/shell.js` ✱, `v2/ui/shell.css` ✱, `v2/ui/screens.css`,
`test_v2_shell.js` ✱.

**Read:** `screens-shell.md` lines 106–144 (§0.3, the three things the foundation does
not have), **149–489 in full** (§1, the whole shell: frame, density, nav, scrolling,
safe areas, route display, signed out, first load, the offline indicator, states,
interactions, copy, motion, and §1.4.1 the no-nav roles); `v2-foundation-ui.md` lines
546–627 (§3.7.1 and §3.7.2).

```js
Shell.mount(screenId, params)     // draws head + body + nav; calls the screen's render
Shell.head(title, opts)           // opts {back: bool, trailing: html}
Shell.body(html)                  // ONE insertAdjacentHTML into #screen
Shell.offline(on)                 // the trailing-slot button, opacity 0->1, 150ms, no movement
Shell.title(name)                 // document.title = "<screen> — Garage Saathi"
Shell.pad()                       // re-applies the two bottom-padding halves
```

The frame is four elements and the foundation's §7.2 item 2 permits one more stylesheet;
this one belongs to all thirteen screens rather than to one, declares **no colour and no
size of its own**, and sizes everything from the 33 tokens:

```
<html data-v2 data-density="yard|desk" [data-theme] lang="en|hi">
  <header class="apphead"> [back] [title] [trailing] </header>
  <main class="appbody" id="screen"> ... </main>
  <nav class="nav" aria-label="Main">          (absent for driver and conductor)
  <div class="ov-toasts" data-v2>              (overlay.js owns it)
```

**`data-theme` and `data-density` go on the same element as `data-v2`** — `tokens.css`'s
dark guard is `[data-v2]:not([data-theme="light"])` and only sees the attribute there.
**`body` is the scroll container**, there is no inner scroller and that is not a
preference: `overlay.js` locks the page with `documentElement.style.overflow` (lines
160–169, 100 checks behind it), so an inner scroller would keep scrolling behind a
scrim. **The nav is the one fixed layer**; the header scrolls away; nothing is
`position: sticky`. A 200-row list on a Core 2 Duo pays for one promoted layer, not two.

**The two bottom-padding halves must stay equal to the nav's own box** — bar present:
`calc(var(--nav-h) + env(safe-area-inset-bottom))`; rail or no nav:
`calc(var(--pad) + env(safe-area-inset-bottom))`. A builder who changes one must change
the other.

**Driver and conductor get no nav at all** — not an empty nav, not a one-item nav, not a
disabled item, and **no fixed bottom bar of any kind, including an action bar**. A bar
pinned to the bottom of a one-screen app reads as a nav that has lost its tabs. No back
control either: a back arrow pointing at nothing is the same lie.

Also this slice's: the **persistent offline indicator** (`.btn-quiet` +
`icon('offline')` + the words "No signal", in `--warn`, shown when the last pull failed
**or** `navigator.onLine` is false — not `onLine` alone, it reports true on a captive
portal, which is the office wifi when the bill is unpaid); the **first-load sequence**
(frame and nav in the first paint, body `skeleton(n)`, and *no aggregate figure drawn
without `stale: true` while `Boot.replica().complete` is false*); the **signed-out
handover** to `login.css`'s `.lg*` family with no header, no nav and no padding; and the
**no-permission body** (`emptyState('This is not open to you', …)` plus one dev console
line naming the role and the screen, because arriving there means the nav and the
declaration disagree).

`v2/ui/screens.css` is this slice's to own because `.card`, `.kpirow`, `.drow`, `.greet`
and `.trow` are used by eight screens. A screen slice that needs a change there
**reports it**.

**Checks (`test_v2_shell.js`):**

| Check | Red when you |
|---|---|
| for `driver` and `conductor`: no `.nav` element in the DOM, no element with `position: fixed` at the bottom edge, no back control | render a one-item nav, or add an action bar |
| the scroll container's `padding-bottom` equals the nav box at both densities, and switches to the no-nav half when the nav is absent | change one half and not the other |
| `.apphead` is not sticky and `.nav` is the only `position: fixed` rule in `shell.css` | make the header sticky |
| with `complete: false`, every `.figure` in the body carries `data-state="stale"` | draw a partial aggregate as final — [E] `2170703` turned into a check |
| the offline button occupies the trailing slot and the title column is `minmax(0, 1fr)` and truncates rather than reflowing | let the title shrink the slot |
| `document.title` is `"<screen> — Garage Saathi"` and the screen's name is spelled identically in the nav label, the header and More | introduce a synonym |

---

### The twelve screen slices (order 3)

Every screen brief carries the same four things, and nothing else: **(a)** its own rows
from the table in §1; **(b)** the spec section, by file and line range, quoted where the
rule is load-bearing; **(c)** the exact signatures it consumes — `Shell.*`, `Router.*`,
`Caps.can`, `Cache.load/sig`, `nav`, `photoGrid`/`photoCapture`/`V2.openPhoto`, `w`/
`W.register`, `fmt.*`, `Odo.check`, `Cost.forBus`, `figure`/`emptyState`/`errorState`/
`offlineState`/`skeleton`, `V2.openSheet`/`closeSheet`/`confirmDialog`/`toast`,
`icon(name, {size})`, `Night.*`, `Sync.info()`, `DB.*`; **(d)** the checks it owes, with
the mutation that reddens each.

Shared shape, in every brief: `render(model) -> string` is pure and node-testable;
`mount()` installs **one** delegated click listener that **returns early when
`ev.target.closest('input, select, textarea, label, .num')` is non-null, before it reads
`[data-act]` or `[data-nav]`** — the line the shelf-count regression was missing
(`predeploy-gate.sh:508` and the sweep at `:1073`); `W.register` holds the screen's
labels; the screen declares its capability through `Caps.SCREENS` and never checks a
capability in the view where a query should have narrowed it.

| Slice | Spec | Model | Why that model |
|---|---|---|---|
| **T — Today** | `screens-shell.md` 492–747 | opus | Six role-shaped variants and a four-block cap that a builder will want to break |
| **A — Attention** | `screens-shell.md` 750–966 | opus | Nine row kinds, ten capability paths, the comparator, and the screen stage 1 says is most likely to be built wrong |
| **M — Me** | `screens-shell.md` 969–1201 | opus | Two shapes, nine blocks, the upload-URL rules, and it is two roles' whole app |
| **W — Jobs + Job card** | `screens-work.md` 90–657 | opus | The second signature, the mechanic's two taps, the close gate. **Paired** because the mechanic's own-cards rule must be identical in the list query and the detail guard — two builders would write it twice, and it is the rule that leaked (`c5c11a1`) |
| **D — Duty board** | `screens-work.md` 658–822, 926–957 | opus | The count that must reach zero, and the degraded state if `nightlist` had been refused (it was not — §6.3) |
| **G — Gate round** | `screens-work.md` 823–925 + `_guard_gatecheck` as committed | opus | Ten items, three photos, the 1.5 s hold — and **BLOCKED**: the brief is §6.2's "what G builds while the block stands" until the create path lands |
| **B — Buses** | `screens-assets.md` 106–512 | opus | Eleven cards, the seed's eight zeroes, and the one cost basis it must not recompute |
| **ST — Store** | `screens-assets.md` 513–912 | opus | Five tabs, 2,384 rows, the count that could never reach zero, the shelf count |
| **FT — Fuel & tyres** | `screens-assets.md` 913–1191 | sonnet | The spec leaves almost nothing open; the three numbers are given with their arithmetic |
| **MO — Money** | `screens-money-people.md` 101–367 | opus | The one cost basis, six parts reconciling on screen, the supervisor's trip entry |
| **PE — People** | `screens-money-people.md` 368–678 | opus | Permission-or-self documents, the conversation log, salary behind one gate — three recorded leaks |
| **RV — Reviews** | `screens-money-people.md` 679–887 | opus | The office scoping, the typed-name queue, 4,000 windowed rows |

Every screen brief also carries these four, because each is a rule a screen will break
first and each has a commit behind it:

1. **A row a person may not act on is not drawn.** Deny by default, per row, per block.
2. **No `at` on a figure inside a row.** `at` adds `.figure-note` as a block element,
   triples the row height and runs `ageWords()` once per row.
3. **A sheet is never designed on the assumption that whole-record last-write-wins is
   fixed.** It is not. The field division between people is what makes the flows safe:
   the supervisor owns the card, the mechanic writes two fields nobody else writes, the
   storekeeper writes the one field the server merges.
4. **No screen asks a person to adjudicate a clock.** A conflict is a named refusal with
   a reason and a Retry.

---

## 5. The row-budget measurement, and who takes it

**M1 builds the instrument. The reading itself is not a slice, because no session in
this pipeline has the machine.**

`DECISIONS.md §9` assigns stage 3 one measurement and `v2-foundation-ui.md §8.2` calls it
the highest-value measurement in the foundation: open the gallery on an office PC
(Windows 7, Chrome 109, Core 2 Duo), press the three Draw buttons, read three runs each.
Five minutes, one person, in the office.

**The slice that owns the number is M1; the slice that owns the consequence is ST.**
`screens-assets.md §0.5` is the only place in the plan that lists which decisions ride on
the placeholder, and the two that ride hardest are both Store's: windowing the 2,384-row
catalogue at 200, and how many things a desk catalogue row may carry. If the reading comes
back at 700 ms, the order things are dropped in is already written
(`screens-assets.md §2.5`: the badge first, then the figure) and `v2-foundation-ui.md
§2.3` becomes the most important page in the foundation rather than a checklist.

**Who tightens the threshold.** `scripts/predeploy-gate.sh` is owned by no slice, so the
one-line threshold edit goes to the lead with the reading beside it. Until that reading
exists, the gate's 250 ms means only "not absurdly slow here" — and **every slice whose
design rests on it must say so in its report**: M1, ST, A (the 200-row cap and the
no-windowing rule for `v2row-why`), B and MO (the desk tables at 864px), RV (the windowed
queue), and P1 (the one-line desk row, which is what windowing requires).

---

## 6. The four things this cut must handle explicitly

### 6.1 `onConflict` can never fire — it is not wired

`INTEGRATION-NOTES` item 4. What `onConflict` counted was discarded local edits, and B3
stopped discarding them: the key stays in the outbox and the server merges on the second
push. **F2 wires `onRefused` and `onConflict` does not appear in `v2/boot.js`**, enforced
by a grep check on the module (§4.2). `v2/sync.js` keeps the option in `start()` so an
older caller is not broken — that is B2's file and this cut does not touch it — but no
v2 code passes it. A callback that cannot fire is worse than none, because the next
person reads the wiring and believes conflicts are handled.

### 6.2 Gate round (#13) — **BLOCKED at HEAD, and being unblocked in this tree right now**

**Marked BLOCKED, and the block is real at HEAD.** `git show HEAD:sync_server.py` still
answers any manager with *"a gate check is started by the driver at the bus"*, so on the
committed tree a supervisor **cannot create** a `gatechecks` record — only decide on one.
The owner chose the supervisor-run gate round (`DECISIONS.md §12`) and it is on the
hand-over.

**But the working tree is already different, and a cut that ignored that would send a
builder into a file that is changing under it.** `git status` in this shared worktree
shows `sync_server.py`, `test_gatecheck.py`, `test_guardwrite_v2.py` and
`docs/v2/LIVE-ISSUES.md` modified and `test_gateround.py` new, **all uncommitted** — a
concurrent session is landing exactly this server change as this cut is being written.
The uncommitted `sync_server.py:1918–1953` reads:

```python
if not manager:
    return "role may not write this store"
# Owner / supervisor. Two things: START a round, and decide go or hold.
if not old:
    # A supervisor-run gate round. The owner's decision of 4 Nov 2026
    # (DECISIONS.md section 12) ...
    # This answered "a gate check is started by the driver at the bus" until
    # now, which blocked that screen outright. The driver path above is NOT
    # loosened: a driver still may only check their own bus.
```

`WRITE_ROLES["gatechecks"]` is already `{owner, supervisor, driver}`
(`sync_server.py:1193`, committed) and `v2_perms.py:77` already grants the store to
`{owner, supervisor, crewmanager}`, so the write matrix and the read scope were never the
blocker — `_guard_gatecheck` was, and only for the **create**.

**So the dispatch rule for G is:** the slice is cut whole below, and
**it is not dispatched until that server change is committed by the session that owns
`sync_server.py`, with `test_gateround.py` and `test_gatecheck.py` green.** One command
decides it — `git show HEAD:sync_server.py | grep -c "A supervisor-run gate round"` — and
`0` means hold. **No builder is asked to work around a server rule, and no builder of
mine touches `sync_server.py`.** If that change is abandoned rather than committed, G's
brief is **"What G builds while the block stands"** below, and the create path goes on the
owner's hand-over as a server change, not a client workaround.

**Three rules the builder must build against once it lands, each read from the guard
itself, and two of them contradict `screens-work.md §4`:**

1. **Creating:** `status` must be `'open'`, `decision` must be absent, `startedAt` must
   be a real time within the 5-minute skew clamp, `busId` must be a non-empty string,
   and **`driverId` must resolve to a crew record whose `busId` equals that `busId`** —
   "that driver is not crewed to this bus". `driverName` and `userId` are forced from the
   crew record and the token, so the screen must not send them as truth. `GATE_FIXED`
   (`busId, regNo, driverId, driverName, userId, startedAt, date, selfie, faceVerified,
   lat, lng, onDutyBoard`) cannot change after creation, which is why the driver's
   photograph is **step 1** and not the end.
2. **Only the supervisor who started a check may carry on filling it.** The guard's
   `manager_fill` requires `old["userId"] == actor["id"]`. `screens-work.md §4.6`'s
   "two supervisors on the same bus — it resumes it" is therefore half right: the screen
   resumes **your own** open check, and a check somebody else started is **read-only and
   names them** ("Started by Mohan at 20:10"). A resume button that produced a refused
   push would be the worst version of this.
3. **The decider may not be the person who ran the check** — *"you ran this check —
   somebody else decides go or hold"* — and a decision needs a non-empty reason;
   `by`, `byRole`, `at` and `verdict` are server-stamped and `pastDecisions` accumulates.
   **This is new since the screen specs were written, it is in the same uncommitted
   change, and it changes a screen that is not blocked:** Attention's row kind 1
   (`gateDecide`) needs an **identity rule** — `userId !== me.id` — exactly like kind 2's.
   Without it, a supervisor who ran twenty checks sees twenty rows whose only action the
   server will refuse. It costs one condition and it is wrong in neither world: at HEAD
   a manager never runs a check, so the filter removes nothing. **It is in A's brief and
   in A's checks**, and A ships before G either way.

**What G builds while the block stands**, against the existing driver-created flow and
nothing else — this is the brief if the server change does not land:

- the per-bus gate row and **all six of its states** (`no check`, `open`, `awaiting`,
  `released`, `approved`, `held`) read from existing driver-created checks, with their
  words and marks from `screens-work.md §4.5`'s table — never colour alone;
- the full **read-only** check panel: the ten items keyed exactly as the record keys
  them, their answers, the three item photographs and the driver's selfie through
  `V2.openPhoto`, the sticky progress header, and the outcome line
  ("Held at 22:40 — brake warning light, reason recorded by the owner");
- **resuming a check the signed-in person started** — which the guard permits for a
  driver today and for a manager the moment the change lands, so the panel is written
  once;
- `Night.running(date)` wired, so the screen already knows which buses it is waiting on;
- the counts, the empty states and the Hindi labels.

**What it does not build, and does not fake:** the create path — step 1's driver pick,
the selfie capture and "Start the check". In its place the panel carries one
`div.v2row`, `icon('warn')` in `--warn`, `.t` = "A check is started at the bus", `.sub` =
"The app cannot start one from here yet." That is deliberately plain, because a screen
that hides a block is how a block survives. **No workaround, no second store, no
client-side draft** — a draft on one phone is exactly what `screens-work.md §4.5` rules
out ("an interrupted check leaves a real open check, not a draft on one phone").

### 6.3 `nightlist: 395`, and the whole retention table

`INTEGRATION-NOTES` items 1 and 2. **F2 creates `LOCAL_HISTORY_DAYS` from nothing** —
all seven rows, not just the new one — because v2 has no copy of it and `v2/db.js`'s own
comment at line 494 records the last time a store was missing from it. 395 days is the
contract's number: thirty more than the server's 365-day window, per the existing rule
that the two must never fight. The check prunes a 400-day row and keeps a 390-day one,
which is the only form of this check that can fail.

The store itself is built and accepted: `Night.dayKey/get/setRunning/running/undecided`,
a **map keyed by bus id** so a tick can be taken back, `at` stamped by the **server**, and
`running:false` distinct from absent. **D (Duty board) writes it; D and G both read it.**

Two notes for those two briefs. `screens-work.md §4.2` specifies the record as
`{ id, date, busIds: [string], by, at }`. **That shape is superseded** by
`v2-contract.md §5` and `v2/night.js`: it is `buses: {busId: {running, at, by}}`, and the
list shape is the exact thing the contract rejects, because a list can only be unioned
under merge and a bus ticked by mistake could then never be un-ticked — which would make
the count unable to reach zero, which is the one thing the record exists to make
possible. **Builders use `Night.*` and never touch the record directly.** And
`Night.dayKey` uses a **fixed +5:30 offset** matching the server's `_ist_day`, not the
device's local day — `INTEGRATION-NOTES` item 3 asks the next person not to introduce a
third convention, and a screen computing its own date string would be that third one.

### 6.4 `v2/index.html`'s script order

**F2 owns it, with the order in §4.2 and three checks on it.** These are classic scripts
declaring top-level `const`s, not modules, so an order mistake is a blank page with one
console error, and `boot.js` is the only script that calls anything. The check that
actually proves it: load the files in index.html's own order inside a stub `window` and
assert no `ReferenceError`, then swap any adjacent pair and assert it throws. The twin
check — every `v2/screens/*.js` on disk is listed in index.html **and** in `sw.js`'s
precache — is what makes the integrator's one-line-per-screen job falsifiable instead of
remembered, and it is why one slice owns both files.

---

## 7. For the lead and the owner — not done by any builder

| Item | Whose | Blocks |
|---|---|---|
| **The Hindi values.** ~21 chrome ids (9 already in `i18n-hi.js`) and ~110 screen labels | the owner, one sitting | A chrome id with no Hindi **fails the build** (P3). Screen labels ship pending, counted and printed by name. Start this sitting in wave 1 or it becomes the critical path |
| **The 200-row / 2,384-row reading** on a Windows 7 Core 2 Duo in the office | one person, five minutes, `v2/ui/gallery.html` | Not the build. It is the one number in the plan that can move a published budget (§5) |
| **The `predeploy-gate.sh` threshold edit** once that reading exists, and each screen slice's browser-level gate additions | the lead / integrator | Gate files are owned by no slice |
| **`usage` narrowed to owner** in the server's read scope | the backend lead | Not the build. Until it moves, Me's who-opened-what row is a client check over records a supervisor's phone already holds, and its copy promises nothing it cannot keep |
| **The gate-round create path** — `_guard_gatecheck`'s manager branch, uncommitted in this worktree | the session that owns `sync_server.py` | **G only** (§6.2). Nothing else in the cut waits on it |
| **A decision on `GET /uploads/<name>`** (`LIVE-ISSUES` 7) | the owner | Not the build and not in this cut. Me hands out three such URLs; M's brief carries the four things the interface can do without pretending to have fixed it |
| **The read boundary** for the stores these screens hide (`screens-money-people.md §6`, items 7.1–7.8) | the backend lead | Not the build. Until they land, every "absent" in twelve screens is a curtain and not a boundary, and that sentence belongs in stage 5's report |

Two items the specs list as blocking that are **already discharged**, verified in source:
`gatechecks`, `driverreports` and `crewnotes` are in `v2/pullapply.js`'s `FIRST_STORES`
(line 263); and `_guard_write`'s jobcards clause no longer exempts a supervisor —
`sync_server.py:1798` is `if closer and closer == actor["id"]`, with the role test gone
(`b1fb43b`). **The second signature is server-enforced for every role including the
owner**, so `screens-shell.md §6.4` and `screens-work.md §9.5`'s "client-only rule until
the guard is tightened" is stale. v1 is still the bypass for as long as both clients run,
which is `DECISIONS.md §10`'s deliberate choice.

---

## 8. The three things in this cut most likely to be wrong

1. **The Hindi compromise in P3.** `v2-foundation-ui.md §6.3` says a missing Hindi value
   is a **build error** and gives one reason that is hard to argue with: the English
   fallback is what let a whole screen stay English with every test passing. I have kept
   that for the 21 chrome ids and softened it to "pending, counted, printed, and visibly
   marked at runtime" for ~110 screen labels, because the strict rule applied to all 131
   holds the entire branch red on one conversation with the owner that nobody has had
   yet. **If pending ids are still pending at cutover, I will have reinvented the
   fallback with a counter in front of it.** The cheap guard is in the report rather than
   the code: the count is printed on every run and it should be going down weekly. If it
   is not, make the rule strict and let the build go red — that is what the foundation
   asked for and it would be right.

2. **Pairing Jobs and the Job card, and splitting nothing else.** Nineteen slices is a
   lot of seams, and the one honest grouping I found is the one that also produces the
   largest brief in the cut (`screens-work.md` 90–657, ~570 lines of spec for one
   builder). I paired them because the mechanic's own-cards narrowing has to be the same
   rule in the list query and the detail guard and that rule is the one that actually
   leaked — but a brief that size is where a builder starts skimming, and skimming the
   Job card means skimming the second signature. **If one slice comes back thin, it is
   this one**, and the re-cut is to split `jobcard.js` out with `Jobcard.guard` as a
   named export of the Jobs slice.

3. **`Cost.forBus` living in P2 rather than in Money.** The one-cost-basis rule says the
   basis is read from Money and never recomputed, and I moved the arithmetic into a pure
   helper so Buses and Money could be built in the same wave. That makes the definition
   shared, which is the point — but it also puts Money's core arithmetic in a file Money's
   builder does not own, and `screens-money-people.md §1.1` is where the six parts and
   their six source records are specified. **If the hero and its six parts disagree on
   screen, the seam is here**, and the fallback is to give `v2/cost.js` to MO and make B
   order 4. Two further seams I am naming rather than resolving: `components` is read by
   ST (the per-piece register) and written by FT (fitting, removing, sending out), so the
   fit/remove write is FT's and Store links to it; and a `.num` count grid appears in
   both ST and FT, which means the delegated-listener early return is implemented twice
   and must be checked twice.

---

**Written to:** `docs/v2/plan/v2-frontend-slices.md`
**Slices:** 19 — F1 (order 0), F2 · P1 · P2 · P3 · M1 (order 1), S1 (order 2), and the
twelve screen slices (order 3), covering all **thirteen** screens of `DECISIONS.md §15`.
**Files:** 63, each owned by exactly one slice. **New tokens:** 0 beyond the foundation's
three. **New icons:** 0. **New stores:** 0. **New record fields:** 0.
**Gates every slice inherits:** `scripts/run-tests.py`,
`python3 scripts/check-floor.py v2 ui`, `scripts/check-v2-isolation.sh`,
`scripts/predeploy-gate.sh`.
**Next:** dispatch wave 1 — F1 alone.

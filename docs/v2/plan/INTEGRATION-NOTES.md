# Cross-slice follow-ups, for stage 4

Things a builder found that belong to a file it did not own. A builder that
edits outside its slice overwrites a colleague's work, so the rule is to report
and move on — and this file is where "report" lands, so it does not live only in
a transcript.

The integrator works through this list. An item here is not a defect; it is a
seam that only becomes visible once two slices are side by side.

---

## From B4 (`nightlist` client module)

**1. `nightlist` has no client retention entry yet.** Contract §5 gives it 395
days. v1's equivalent is `LOCAL_HISTORY_DAYS` in `app.js`; v2 has no app shell
yet, so there is nowhere to put it. Whoever builds v2's cache layer adds
`nightlist: 395`. Without it the store is never pruned on the device, which is
the shape of a bug that only appears after a year.

**2. `v2/index.html` loads no scripts at all.** It is still the bare app root
from the serving work — doctype, viewport, the worker registration and nothing
else. Every module built since then (`v2/db.js`, `v2/sync.js`,
`v2/pullapply.js`, `v2/night.js`, `v2/ui/*`) has to be added to it in dependency
order, and the order matters: these are classic scripts that declare top-level
`const`s, not modules.

**3. A decision B4 made that the spec left implicit, and that the next person
should not quietly reverse.** `Night.dayKey` uses a **fixed +5:30 offset**,
matching `sync_server.py:_ist_day`, rather than the device's local day as
`Gate.dayKey` does. Verified: the server computes
`time.gmtime(ms / 1000 + 5.5 * 3600)` while `gate.js` uses `new
Date(ts).getDate()`. Those agree only while every device is in IST — true for
this business, so v1 has no live bug — but `_guard_write` compares the record's
`date` against its id suffix, so a device on another timezone would file ticks
under a night the office does not recognise and the server would refuse them.
Two conventions already existed and B4 chose the server's. Do not add a third.

---

## From B2 (v2's database and the stale re-apply)

**4. `onConflict` no longer fires anywhere, and the frontend must wire
`onRefused` instead.** What `onConflict` counted was discarded local edits, and
those no longer happen. A callback that can never fire is worse than none: the
next person reads the wiring and believes conflicts are handled.

**5. `trips` is marked "F + R" in contract §4.4 but no R field is named.** Its
residual is a frozen trip, which no field-level merge resolves, so `trips`
records no base and a stale refusal there surfaces with a reason rather than
re-applying. That may be the right answer — a frozen trip should probably not be
silently re-applied — but the contract should say so instead of leaving a
strategy half-assigned.

**6. The version is 29, not 1.** B2's brief said v2 should start its own version
line at 1. It did not, and it was right: `v2/db.js` was copied at 28 and the
rename to `garage-saathi-v2` has already been in the tree, so a version going
*backwards* throws `VersionError` on exactly the machines being used to test v2.
Contract §5 agrees. If anyone "tidies" this to 1 later, that is the bug.

## From B3 (pull-apply)

**7. `DB.touched()` cannot distinguish "no usable base" from "not an R store".**
Both return `[]`, so pull-apply cannot tell them apart and an unpushed edit in an
**F** store is still clobbered locally. B2 assessed closing it: distinguishing
the two returns is cheap and closes nothing, because the real fix needs a base
for F stores — which is the unbounded snapshot §4.2 deliberately retired, plus a
base write per pulled row on the drain's hot path. **Not cheap. The integrator
decides whether this residual local-loss path is acceptable for a first release,
and it should be written down either way.**

**8. Contract §2.2 says idempotent replay "is slice B3"; the slice table gives it
to B1.** Neither built it. One of the two is wrong and the work is unassigned.

## From B5 (the pull-cost proof)

**9. §3.5's cursor rewind makes every device pay the `data::jsonb` cast at
once.** Measured: the per-record predicate costs about 4 µs per examined
own-store row, which is 1.7× on a driver's drain today and **3.6× with 54,000
other people's attendance rows added**. It is paid once per first sync, not per
poll — but rewinding all cursors because an entitlement changed turns "once per
device, spread out" into "every device, now". Whoever changes a role's
entitlement in production should stagger it.

**10. Contract §8 credits slice B2 with proving the pull cost. It is B5.**

**11. The fixture does not model two things it reports on.** Gate-check rows
carry no selfie or item photographs, and `crewnotes` is absent from its shape
entirely — so `crewnotes` contributed exactly zero rows to a measurement that
reads as if it had been measured. See `LIVE-ISSUES.md` issue 9 for why the
photograph case is not hypothetical.

## Mine, and already fixed

**12. `scripts/predeploy-gate.sh` had a check asserting the old spelling of the
service-worker cache rule** (`rel == "sw.js"`), which went stale in the very
commit that changed it to `os.path.basename(rel)` so that `/v2/sw.js` would be
covered. It therefore disagreed with isolation invariant 5, and neither said so.
Two checks asserting different spellings of one rule is worse than one check,
because the pair cannot both be right. Fixed. The reason it survived is that I
had never run the browser gate on `launch-v2` — only the other three checks —
which is exactly the gap `PIPELINE.md` now warns about.

---

## From wave 2 of the frontend build

**13. Reader-facing English lives in `v2/sync.js`, which no slice owns.** P3's
literal scan covers the v2 files that *draw*; `sync.js` holds roughly ten
sentences a person actually reads — "No connection to the server" and its
siblings — and they are hard-coded English. That is the same defect §6.3
records, in a file the Hindi slice does not own. For a driver or conductor, whose
whole app is one screen, a sync refusal is one of the few sentences they will
ever see. Move them into `W.register` when a slice next owns that file.

**14. One English literal is deliberately pinned, and must stay.**
`test_ui_states.js`'s mutant patches the exact text `'Updated ' + age`, so that
string cannot move into the word table without emptying the mutant. It is a
pinned list of exactly one, with the reason beside it. If somebody "finishes the
translation" by moving it, that suite stops proving anything.

**15. Two existing suites still read v1's `ui/`, not v2's copies.** P3's suite
spawns the states one against v2, but `test_ui_overlay.js` must be run by hand
for v2:
`OVERLAY_JS=v2/ui/overlay.js COMPONENTS_CSS=v2/ui/components.css node test_ui_overlay.js`
(84s). Nothing in `run-tests.py` points either suite at v2, so v2's overlay and
components are **not** covered by the automatic run. This is the gap the tokens
builder first reported in wave 1 of the backend work, now narrowed to one suite.

**16. The shell must compose the nav's count badges.** `nav(items, activeId)` has
nowhere to put "Me (3)" — P1 says the shell composes it into `label`. S1 owns
that.

---

## 17. THE TOP INTEGRATION ITEM: screen listeners are never removed

**Found by slice MO while reviewing its own draft, then measured across all
thirteen screens. This is the one defect in wave 4 and 5 that no single slice
could see, and it is exactly what stage 4 exists for.**

Every screen installs a delegated click listener on **`document`** in its
`mount()`. And:

- **No screen implements `unmount`.**
- **No screen calls `removeEventListener`.**
- **Neither `shell.js` nor `router.js` ever calls `unmount`**, although
  `Router.register(id, {render, mount, unmount})` accepts one.

So a listener survives for the whole session, and they accumulate: after
visiting Store, People and Reviews, **three** live handlers are listening for
`data-tab`. The attributes actually shared are:

| attribute | read by |
|---|---|
| `data-tab` | store, people, reviews |
| `data-filter` | jobs, reviews |
| `data-act` | all thirteen |

Most builders prefixed theirs and are therefore safe — `data-bs-job`,
`data-open-part`, `data-bs-sort`. MO scoped its three to `.mo` after finding
this. The rest are exposed, and `data-act` is shared by every screen, which is
survivable only because each handler happens to ignore an act it does not know.

**The fix, and it is the mechanism that already exists rather than a new one:**

1. `Shell.mount` calls the **outgoing** screen's `unmount()` before mounting the
   next. One edit in `shell.js`; the hook is already in the Router contract.
2. Each screen implements `unmount()` and removes exactly what its `mount()`
   added. Twelve small edits.
3. Then a gate check per screen: a screen that calls `addEventListener` must
   also call `removeEventListener`, and must export `unmount`. **Do not add that
   check before step 2** — it would fail thirteen times and block every push,
   which is how a gate gets bypassed.

### Correction, measured before dispatching stage 4 (integrator)

I re-measured this note against the files rather than forwarding it, and two of
its statements are wrong. The fix it prescribes is right; the picture it paints
of the current state is not.

    screen       addEventListener  removeEventListener  unmount
    attention           2                  0               no
    buses               3                  0               no
    duty                4                  0               no
    fuel                4                  0               no
    gate                7                  0              YES
    jobcard             2                  0               no
    jobs                2                  0               no
    me                  3                  0               no
    money               2                  0               no
    people              4                  0               no
    reviews             4                  0               no
    store               5                  0               no
    today               2                  0               no
                       ---                ---
                        42                  0

1. **"No screen implements `unmount`" is false.** `gate.js` does: defined at
   `v2/screens/gate.js:1165`, exported at `:1186`, and passed to
   `Router.register` at `:1198`. Twelve screens lack it, not thirteen — which is
   what this note's own step 2 says ("Twelve small edits"), so the step count was
   right and the headline claim contradicted it.

2. **Gate's `unmount` removes no listeners either.** It clears a timer and resets
   seven `ui` fields. So step 2 is twelve screens that need `unmount` written plus
   one that needs listener removal added to the `unmount` it already has. No
   screen in v2 currently removes a listener.

3. **`Router.register` does carry the hook, loosely.** It stores the module whole
   (`modules[id] = mod`, `v2/router.js:87`) and validates only that `render` is a
   function (`:86`), so `Router.moduleFor(id).unmount` is reachable from the Shell
   today. The hook is available; the contract does not require it. Step 1 needs no
   router change.

**A fourth item this note missed.** `gate.js` is the only screen that sets a
timer (`setTimeout` at `:1129`, the press-and-hold on the release control). It is
cleared on release at `:1142` and self-nulls when it fires at `:1130`, so it is
short-lived — but `unmount` clearing it at `:1166` is the one path that handles
*navigating away mid-hold*, and since nothing ever calls `unmount`, that path is
dead code. Hold the release control, leave the screen before `HOLD_MS`, and the
timer fires against a screen that is no longer mounted. It is the smallest of the
four findings and the only one that is a live misbehaviour rather than an
accumulation.

**Two partial guards already exist and should not be mistaken for the fix.**
`people.js` and `store.js` carry a double-install guard, so re-entering one
screen does not stack its own listener twice. That stops the count growing on
re-entry; it does nothing about a *different* screen's listener still being
live.

**Why this was invisible to every slice.** Each builder tested its own screen in
isolation, where exactly one listener exists and everything passes. The
collision needs two screens mounted in one session, which is the integrator's
first real test and nobody else's.

---

## 18. THE HEADLINE: v2 opens to a blank page — there is no login screen

**Found in a browser, after wave 5 was wired and all fourteen node suites were
green at 969 checks. No suite could have found it. This outranks note 17.**

This note replaces a first draft of itself that claimed v2 was "three screens
short of its own design". That was wrong, in three separate ways, because I
compared the build against §5 of the *design spec* (fourteen screens) without
noticing that **stage 1 superseded it**: `docs/v2/plan/v2-ux.md` is the
authoritative screen list and it says **twelve**. All twelve are built. The
corrections are at the end of this note, because the mistake is instructive — it
is the same mistake as grading a slice against a brief nobody is working from.

### What happens when a person opens /v2 today

Nothing. A white page.

    #app children ........... 0
    S.route ................. "login"
    S.user .................. null
    console ................. no error from the shell

All thirteen screen modules load and register. `Boot.start()` runs to completion
and resolves. It routes to `login`, because `firstScreen()` returns `LOGIN` when
there is no session (`v2/boot.js:255`). `Shell.mount('login')` then returns
`true` — and draws nothing.

**`Shell.mount` is not at fault.** `v2/shell.js:553` sends the login route to
`signedOut()`, and `signedOut()` (`:504`) deliberately empties `#app`, drops
`data-frame` and adds the `lg` class so `ui/login.css` owns a bare body. That
hand-off is correct and intentional — its own comment says a nav over a keypad
would be "a lie about there being somewhere to go". The frame gets out of the way
exactly as designed.

**There is nothing on the other side of the hand-off.** No login module exists.
`ui/login.css` is 154 lines, defines the whole `.lg*` family (`.lg-pad`,
`.lg-dots`, `.lg-who`, `.lg-ava`, `.lg-search`, `.pinpad`, `.userpick`), is
linked in `index.html` and is precached in `sw.js`. The stylesheet for the screen
shipped and the screen never did.

Consequence: **nobody can sign in, so none of the twelve screens is reachable by
a real person.** Every one of them is correct and unreachable.

### Why no slice built it

Login is not one of the twelve, and it was never meant to be. In v1 it lives
*outside* `render()` — `docs/v2/inventory/01-screens-and-nav.md:38`: `renderLogin`
→ `renderRolePick` → `renderPin` — so it was never a route to redesign, and the
reduction that produced the twelve was a reduction *of routes*. Deny-by-default
compounds it: login must be reachable with no capability at all, so it can never
appear in `Caps.SCREENS`, which is the one list every gate, every suite and every
dispatch was derived from. It is absent from the artefact that defines
completeness, so nothing could report it missing.

`v2/shell.js:61` says it plainly, and is the only place in the codebase that
does: `const LOGIN = 'login';  // not one of the thirteen: nobody is signed in`.

### Corrections to this note's first draft

1. **"Three screens short of its own design" — wrong.** The design spec's §5
   lists fourteen; stage 1 (`v2-ux.md`, revised against the owner's answers in
   `DECISIONS.md §5–12`) reduces that to twelve and is the list the build was
   dispatched from. The twelve are Today, Attention, Jobs, Job card, Buses,
   Store, Money, People, Duty board, Fuel & tyres, Reviews, Me. **All twelve
   exist**, plus `gate` as Duty board's drill-in, the way `jobcard` is Jobs'.

2. **"Map and Challans are unbuilt" — wrong, they were absorbed.** Both were cut
   between §5 and the UX plan, and their content is present:
   - Map → Buses: `bsNoPosition`, `bsSeenNone`, `bsLinkGps`, `bsGpsReg`,
     `bsNeedLinkGps` (`v2/screens/buses.js:189–217`).
   - Challans → Attention as a ranked row, `attChallanN` / `attChallanWhy` with
     `{ key: 'challan', cap: 'challans', band: 2, tone: 'crit' }`
     (`v2/screens/attention.js:180–182, 302`), and → Buses as
     `bsCardChallans` / `bsChallanPend` (`:121, 176`).

3. **"`challans` is a capability guarding nothing" — wrong.** `v2/caps.js:179`
   grants it to owner and supervisor and `v2/screens/attention.js:302` guards the
   challans row with it. It is used.

**One real finding does survive from that draft, and it is small: the UX plan's
arithmetic does not add up.** It says "Gate check and Trip cash are dropped as
screens. 14 → 12", but Trip cash was never one of §5's fourteen. The actual delta
is three dropped (Map, Gate check, Challans) and one added (Job card). The
outcome is right and the absorptions are sound; the sentence explaining how
fourteen became twelve names the wrong two. Worth a line in the UX plan so the
next person reconciling the two documents does not conclude, as I did, that two
screens went missing.

### What this costs

**Login is blocking, and it blocks everything.** Until it exists, v2 cannot be
opened by a person, demonstrated to the owner, or walked by the eight-role
reviewer that stage 5 is supposed to run — the review that found four real
boundary defects last time cannot even sign in.

### What it says about the pipeline

Every gate checks dispatched work against what it was dispatched to do, and every
list of what to dispatch came from `Caps.SCREENS`. Login cannot be in that list
by construction. So the pipeline had no representation of it anywhere, and
thirteen slices, 969 checks, a 250-check pre-deploy gate and a browser boot all
passed over the one screen standing between the product and its first user.

The cheap fix is not another gate on the screens. It is a single check that the
*shell's* own route constants each have something that draws them: `shell.js`
knows about `LOGIN`, and nothing renders it. That check is four lines and would
have failed on the day `signedOut()` was written.

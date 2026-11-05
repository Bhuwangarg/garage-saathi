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

# Hardware-floor review — will v2 run on the machines these people own?

REV-FLOOR, stage 5. Branch `launch-v2`, HEAD `90aaec1`. 2026-11-06.
Read-only on source; no application file was changed and no git command was run.

**Verdict: FIX FIRST — two findings, and neither is in the syntax floor.**

v2's syntax and API floor is clean, and is cleaner than the floor requires: the
newest JavaScript in all 33,887 lines is `async`/`await` (Chrome 55) and the
newest CSS is a logical property (Chrome 87). Nothing in `v2/` needs a browser
newer than about Chrome 87, let alone 109. One finding costs an owner on a phone
a sideways-scrolling screen; one costs whoever uses Buses' cost sort roughly a
third of a second of frozen screen every four seconds, forever. Both are small
fixes. The thing nobody had measured — speed at fleet volume — came back mostly
reassuring, with that one exception.

---

## The one limitation that qualifies everything in parts 2 and 3

**The browser I measured in is Chrome 145 headless, not Chrome 109**, on an
Intel i9-9880H, not a Core 2 Duo. No Chrome 109 and no Windows 7 machine exists
in this environment. So:

- Every **syntax/API** judgement (part 1) is sound — those are facts about
  feature versions, not about this machine.
- Every **layout** pixel (part 2) was measured in a browser 36 versions past the
  floor. A layout bug specific to Chrome 109 would not appear here. The two
  layout findings below are structural (an inline-block that cannot wrap; a
  `<div>` where a `<label>` was wanted) and will behave the same on 109, but a
  *clean* result at a given size is weaker evidence than it looks.
- Every **millisecond** (part 3) is this machine's. Core 2 Duo figures are
  marked ESTIMATED and carry the multiplier.

`DECISIONS.md §20` already names the five-minute way to close this: copy
`v2/ui` to a Windows 7 machine, open `gallery.html`, press each Draw button
once, photograph the screen. That is still the only way to get the office's own
number, and this review does not replace it.

---

## Findings, worst first

### 1. Today scrolls sideways on a phone as soon as a rupee figure reaches six digits

**Where.** `v2/ui/today.css` `.kpirow` / `.kpi-v`, with `[data-v2] .figure`
(`display: inline-block`) in `v2/ui/components.css:~556`.

**The concrete case.** Owner, signed in, Today, on a 375×812 phone
(`data-density="yard"`). `.kpirow` stays a two-column grid —
`grid-template-columns: 165.5px 165.5px` measured — and the content box inside a
`.kpi-v` cell is **88 px**. The `.figure` span holding the money is
`display: inline-block` with `white-space: normal`, and a rupee amount has no
break opportunity in it (Chrome does not break after a comma in `9,99,999`), so
the span simply grows past its cell. Nothing clips it, so the page grows.

Measured, by setting the "Owed to suppliers" figure to each value and reading
`documentElement.scrollWidth - innerWidth`:

| figure | span width | horizontal page scroll |
|---|---|---|
| ₹999 | 88 px | 0 |
| ₹9,999 | 96 px | 0 |
| ₹99,999 | 114 px | 0 |
| **₹9,99,999** | 139 px | **18 px** |
| **₹99,99,999** | 156 px | **36 px** |
| **₹9,99,99,999** | 181 px | **60 px** |

**What it costs.** Any supplier balance of ₹1,00,000 or more — ordinary for an
89-bus fleet — and the whole Today screen slides sideways under the thumb. With
the review fixture's own total (₹2,03,61,093 owed, from 1,200 purchase records)
the page is 435 px wide in a 375 px window. Both money KPIs ("Repair cost, 30
days" and "Owed to suppliers") sit in that same 165 px column, so either one
does it. This is the first screen anyone opens.

**Not a finding, checked:** at 1366×768 desk density the same grid has room and
page overflow is 0 on all thirteen screens.

### 2. Buses' "running cost, high first" costs 80 ms per redraw, and it re-pays it every sync tick

**Where.** `v2/screens/buses.js:583-593` (`costTotals`) calling
`v2/cost.js:97` (`Cost.forBus`) once per bus; `v2/shell.js:611` computes the
model *before* its signature short-circuit, so the redraw path pays in full.

**The concrete case.** Owner on Buses, Sort → "running cost, high first", 89
buses, fleet fixture (83,884 rows: 40,000 GPS events, 6,000 ledger rows, 1,680
job cards, 2,384 parts, 1,200 purchases, 1,000 fuel fills — volumes from
`scripts/measure-pull.py` `SHAPE`).

Measured (mount + forced style/layout, three runs, all three, load 0.18–0.20 per
logical core):

| | run 1 | run 2 | run 3 |
|---|---|---|---|
| Buses, sort = registration | 14.5 ms | 14.8 ms | 16.4 ms |
| **Buses, sort = running cost** | **95.2 ms** | **82.6 ms** | **80.3 ms** |
| `Cost.forBus` for one bus | 0.8 ms | 0.4 ms | 0.5 ms |
| `Cost.forBus` × 89 buses | 61.9 ms | 59.9 ms | 60.6 ms |

The 89 `forBus` calls are 60 ms of the ~66 ms difference. Slice B's suspicion is
confirmed by measurement: `Cost.forBus` walks `fuel`, `def`, `jobcards`,
`ledger`, `trips`, `incidents` and `components` end to end on every call, so
sorting by cost is 89 full passes over the money stores for one list.

**The part that makes it a finding rather than a slow sort.** This is paid again
on every *redraw*, not only on the sort. Measured on the redraw path — same
screen, unchanged signature, which is exactly what a sync tick triggers:

| | five consecutive redraws |
|---|---|
| sort = registration | 15.4, 16.4, 16.4, 15.8, 15.8 ms |
| **sort = running cost** | **68.8, 77.7, 94.6, 83.1, 81.1 ms** |

`boot.js` re-mounts on every sync status change, coalesced at `REDRAW_MS = 120`,
and the poller ticks every four seconds. There is no memo, and one would not
help: `now = Date.now()` is a fresh argument each time.

**ESTIMATED cost on the office hardware.** At **5× (band 4–6×; estimate, never
measured on a Core 2 Duo — nobody here has one)**, 80 ms becomes **≈400 ms (320–480 ms)**
of blocked main thread, re-paid every four seconds for as long as the owner
leaves that sort on and that screen open. `DECISIONS.md §20` puts DOM work on a
Core 2 Duo at 5–10× rather than 4–6×, which would make the upper bound worse.
Against §9's 250 ms placeholder it is over budget on the first draw and over it
again every tick.

Two smaller things in the same code, both verified by reading it:
`costTotals(buses, …)` runs over **all** buses before the search filter, so
searching down to one registration still costs 89 passes; and the figure is
discarded and recomputed rather than held.

### 3. Duty's search box has a dead 25 px band — a `<div>` where Buses used a `<label>`

**Where.** `v2/screens/duty.js:734` — `<div class="field dt-find"><input …>`.
Compare `v2/screens/buses.js:994` — `<label class="field bs-find">…`.

**The concrete case.** Supervisor, Duty board, 375×812 phone. `.field` is 48 px
tall (`min-height: var(--tap)`), the `<input>` inside it is **309×22**, and the
input sits at the top: 1 px of padding above, **25 px below**. Verified with
`document.elementFromPoint` at three heights in the box:

- top of box → `INPUT.dt-search`
- middle of input → `INPUT.dt-search`
- 4 px above the bottom of the box → `DIV.field dt-find`

`duty.js:1213` handles `.dt-find` on **`input`** events only (`onField`), not on
click, so there is nothing to focus the field from that band. On Buses the
identical visual box is a `<label>`, so a tap anywhere in its 48 px focuses the
input — which is why this reads as an oversight rather than a decision.

**What it costs.** The effective touch target is 309×23, not 309×48, on the
screen a supervisor filters 89 registrations on at the gate, one-handed. A
missed tap, then a second one. Small, and it is the only sub-44 px touch target
I found anywhere in v2 at yard density.

### 4. `scripts/check-floor.py` passes, and here is what it would not catch

The checker is well built — comment-stripping before matching is the right call
and its own notes explain why. It is also a hand-written list, so I planted 71
violations in scratch copies and ran it on each. **17 of 25 CSS probes, 11 of 15
JS probes and 15 of 21 emoji probes passed when they should have gone red.** The
gaps, by what is most likely to arrive here:

**Emoji — the one that already cost this project 968 icons.** `EMOJI_RANGES`
covers `U+1F000–1FAFF`, `U+2600–27BF`, `U+FE0F` and `U+2B00–2BFF`. It missed,
in a `.js` string:

- `U+231A–23FA` — ⌚ ⌛ **⏰ ⏳ ⏸ ⏱** and the media keys. The most plausible
  icons in a duty/shift app, and Windows 7 renders them as boxes.
- `U+2139` ℹ, `U+2122` ™, `U+00A9` ©, `U+00AE` ®, `U+203C` ‼, `U+2049` ⁉,
  `U+24C2` Ⓜ, `U+25FB–25FE` ◻ ◼ ◽ ◾, `U+3030` 〰, `U+303D` 〽, `U+3297–3299`
- `U+20E3` bare (a keycap without the `FE0F` that currently catches it), and
  `U+200D` ZWJ on its own.

It correctly caught ⚠ (`U+26A0`), 🚌 (`U+1F68C`), an emoji inside a template
literal, and a lone `U+FE0F`. `v2/screens/today.js:74-75` uses `▲`/`▼`
(`U+25B2`/`U+25BC`) — **not** a finding: those are geometric shapes, not emoji,
and Windows 7's Arial and Lucida Sans Unicode both have them.

**CSS features past Chrome 109 that pass today.** `lab()` and `lch()` (111) —
the checker only matches the *relative* form `lab(from …)`, so a plain
`lab(50% 40 59.5)` passes; `color()` (111); `scrollbar-width`/`scrollbar-color`
(121); `align-content` on block layout (123); `field-sizing` (123);
`transition-behavior: allow-discrete` (117); `overlay` (117); anchor positioning
and `anchor()` (125); scroll-driven animations / `animation-timeline` (115);
`:user-valid`/`:user-invalid` (119); `:nth-child(… of …)` (111); `:dir()` (120);
`:popover-open` (114); `text-wrap-mode`/`text-wrap-style` (130);
`interpolate-size`/`calc-size()` (129); CSS `round()`/`mod()`/`abs()`/`sign()`
(125) and `sin()`/`cos()` (111).

**CSS nesting has two shapes the `NESTING` regex cannot see.** It requires
`^\s*&`, so `.x{ color: red; &:hover{ … } }` written on one line passes, and a
nested `@media` inside a style rule — which is nesting too, Chrome 112 — passes.

**JS/Web APIs past 109 that pass today.** Set methods `union` / `intersection` /
`difference` / `isSubsetOf` (122); iterator helpers including `.toArray()` on
`map.keys()` (122); the whole **popover API** — `showPopover()`,
`setAttribute('popover','auto')` (114), a real risk for a codebase full of
sheets and toasts; `URL.canParse` (120); `AbortSignal.any` (116);
`Array.prototype.with` (110, when written on an identifier rather than after
`]`); `CloseWatcher` (120); `Element.moveBefore` (133);
`HTMLDialogElement.requestClose` (134); `Intl.DurationFormat` (129); the RegExp
`v` flag (112).

None of these is in `v2/` today — I scanned every one of them across
`v2/*.js`, `v2/screens/*.js`, `v2/ui/*.css`, `v2/ui/*.js` and `v2/index.html`,
and the only hits were `::backdrop` (Chrome 37) and `Promise.allSettled`
(Chrome 76). This is a hole in the *gate*, not a defect in the code: the next
person to reach for `Set.prototype.union` or a popover will not be stopped.

**Worth saying because it was the first thing I doubted:** the floor check is
*not* only in the pre-push hook. `.github/workflows/tests.yml:49` runs
`check-floor.py v2 ui` on every push to every branch, so it cannot be skipped by
an uninstalled hook. It is not in `predeploy-gate.sh`, which is fine — the hook
and CI both have it.

---

## What I measured and found correct

### The syntax and API floor (part 1)

Every identifier `v2` actually uses, extracted from the comment-stripped source
of all 33,887 lines, not sampled:

- **CSS properties used** (88 distinct): the newest are the logical properties
  `border-inline-*`, `margin-inline*`, `padding-block`, `inset-inline-start`
  (Chrome 87), `accent-color` (93) and `overscroll-behavior` (63). No `:has()`,
  no container queries, no `@layer`, no `@property`, no subgrid.
- **CSS functions used**: `calc env hsl inset is lang media min minmax not
  repeat rgba scale scaleX translateY var`. `env()` (69) is the newest.
- **Pseudo-classes used**: `:focus-visible` (86) is the newest. One `::backdrop`
  (37). Only `@media` as an at-rule.
- **JS globals/statics used**: `Object.assign/create/entries/freeze/keys`,
  `Promise.all/allSettled/resolve`, `Array.isArray`, `Math.*`, `JSON.*`,
  `Date.now/parse`, `crypto.getRandomValues`, `caches.*`, `indexedDB.open`,
  `navigator.onLine/serviceWorker/geolocation`. `Promise.allSettled` (76) is the
  newest. No `.at()`, no `.findLast()`, no `.replaceAll()`, no
  `structuredClone`, no `Intl.*` beyond `toLocaleString`.
- **Syntax**: no optional chaining, no `??`, no `??=`, no private fields, no
  static blocks, no `BigInt`, no regex `v`/`d` flags, no `\p{}`, no import
  attributes, no `using`, no decorators, no ES modules. v2 is classic scripts
  with `async`/`await`, arrow functions and template literals — Chrome 55-era.

Of the brief's list I was asked to verify rather than trust: `structuredClone`
(98), `Array.prototype.at` (92), `findLast` (97), `Intl.supportedValuesOf` (99)
and `:has()` (105) are all at or under 109 and all correct as stated; none is
used anyway.

**Animations.** No `@keyframes` anywhere in `v2/ui/`. Every transition touches
`transform` and/or `opacity` only, except `components.css:87`
(`background-color`, `border-color` on a pressable) — paint-only, no layout, and
worth no more than this sentence. `attention.css:107` correctly has
`transition: none` behind reduced motion.

**No framework runtime arrived.** 32 classic scripts, no bundler, no polyfill,
no `import`.

### Layout (part 2)

Driven in the gstack headless browser against `python3 -m http.server` on
`127.0.0.1`, which is how `predeploy-gate.sh` serves the app. Measured, not
eyeballed: `getBoundingClientRect`, `scrollWidth`/`clientWidth`,
`getComputedStyle`, `elementFromPoint`. `.sr-only` elements are excluded from
clipping counts — they are 1×1 by design, and counting them produced 220 false
positives on Reviews before I excluded them.

**1366×768, `data-density="desk"` (both media clauses confirmed: `min-width:
1024px` true, `pointer: fine` true) — all thirteen screens plus login:**

| | result |
|---|---|
| horizontal page scroll | **0 px on all 14** |
| elements crossing the right edge | **0 on all 14** |
| text clipped by `overflow: hidden` (h or v) | **0 on all 14** |
| interactive controls below the fold with no scroller to reach them | **0 on all 14** |

Page heights at 1366×768, so the owner knows what scrolls: today 772, gate 768,
store 995, jobcard 1035, me 1368, buses 3084, duty 3261, money 3999, people
4821, jobs 6620, attention 6842, reviews 7305, fuel 11623. All on the ordinary
page scroller.

**375×812, `data-density="yard"` (density confirmed to have flipped after the
resize settled — my first pass read `desk` because boot debounces at 250 ms, and
that pass is discarded):**

| screen | h-scroll | over right edge | sub-44 px targets |
|---|---|---|---|
| today | **60 px** | 3 (finding 1) | 0 |
| attention | 0 | 6 — all tab buttons in a scrollable strip | 0 |
| jobs | 0 | 1 — tab button | 0 |
| store | 0 | 2 — tab buttons | 0 |
| money | 0 | 4 — tab buttons + an icon | 0 |
| people | 0 | 1 — tab button | 0 |
| reviews | 0 | 3 — tab button | 0 |
| buses, duty, gate, fuel, jobcard, me, login | 0 | 0 | duty: 1 (finding 3) |

**The off-screen tab buttons are not a finding.** I checked each one's nearest
overflowing ancestor: `.tabs att-tabs`, `.st-tabs`, `.mo-tabs`, `.rv-tabs`,
`.jb-tabs` and `.tabs` on People are all `overflow-x: auto` with
`scrollWidth` 363–537 against `clientWidth` 343, so every hidden tab is reachable
by swiping. At 1366 they all fit.

**Touch targets.** At yard density, every interactive control I measured is
≥44 px in both directions except duty's search input (finding 3). The 32 px rows
at desk density are by design (`data-density` is the machine's answer, not the
role's) and a mouse does not need 44 px, so I did not count them.

**The login, specifically.** Measured at both sizes, including the PIN pad,
which I reached through `Login._goto('pin', …)` — a declared test seam — so that
**no PIN was typed and no credential was invented or used.**

| | 375×812 | 1366×768 |
|---|---|---|
| role tiles | 6, all ≥44 px | 6, 392×32 (desk, by design) |
| PIN keys | 12, all **92×48** | 12, all **123×52** |
| any key below the fold | 0 | 0 |
| horizontal scroll | 0 | 0 |

**Hover on a touch device: nothing depends on it.** I parsed every `:hover` rule
in `v2/ui/*.css` and looked for declarations that reveal or hide
(`display`, `visibility`, `opacity`, `content`, `pointer-events`, `max-height`,
`height`, `width`, `overflow`). **Zero.** No `mouseover`/`mouseenter` handler
anywhere in `v2/`, and exactly one `title=` attribute in all the rendered markup.

### Speed at fleet volume (part 3) — the part nobody had measured

**Bed.** `S.cache` populated directly with **83,884 rows, 40,000 of them GPS
events**, volumes from `scripts/measure-pull.py` `SHAPE` and field shapes copied
from `v2/db.js` `seedIfEmpty` so the screens read what they expect: 89 buses
(`test_v2_buses.js`), **2,384 parts** (`DECISIONS §20`), 1,680 job cards, 6,000
ledger rows, 12,000 triplog, 6,000 attendance, 4,000 reviews, 3,000 stockmoves,
2,500 usage, 1,200 purchases, 1,200 fuel/def, 500 audits, 400 trips, 400
components, 250 driver reports, 250 gate checks, 100 drivers, 100 users.

**Machine.** Intel i9-9880H (16 logical), Chrome 145 headless, 1366×768,
macOS 24.4.0. Load **0.18–0.46 per logical core** across every run quoted, under
§20's 0.7 NOT-MEASURED threshold; load is printed before and after each run and
no run is quoted whose load I did not read. Three runs each, **all three
reported, never the best** — §20's rule.

Timed around `Shell.mount(id)` *plus a forced style recalc and layout*
(reading `offsetHeight`), because the number a person waits for includes layout
and the DOM-build-only figure flatters the app by roughly 2×.

| screen | mount + layout, 3 runs (ms) | DOM nodes | rows drawn |
|---|---|---|---|
| **buses, sort = running cost** | **95.2 / 82.6 / 80.3** | 960 | 89 |
| store | 49.7 / 54.7 / 52.4 | 429 | **34 of 2,384** |
| money | 46.9 / 44.2 / 46.0 | 1,353 | 98 |
| fuel | 43.4 / 49.0 / 42.2 | 3,357 | 200 (`FILLS_CAP`) |
| jobs | 43.6 / 41.2 / 35.9 | 2,419 | 200 of 1,097 standing |
| reviews | 29.6 / 33.8 / 32.0 | 2,014 | 220 of 4,000 |
| people | 24.1 / 24.1 / 20.9 | 1,026 | 100 |
| attention | 20.8 / 21.3 / 21.8 | 1,291 | 115 |
| buses, sort = registration | 14.5 / 14.8 / 16.4 | 960 | 89 |
| duty | 12.4 / 12.3 / 12.1 | 823 | 89 |
| today | 6.9 / 5.3 / 5.0 | 173 | 12 |
| jobcard | 5.4 / 3.5 / 3.6 | 160 | — |
| me | 4.0 / 2.4 / 2.5 | 130 | 9 |
| gate | 2.8 / 1.7 / 2.2 | 13 | — (see gaps) |

Two beds disagreed with themselves across passes and I am reporting the spread
rather than averaging it away: store ranged 34.3–54.7 ms and money 30.4–100.7 ms
(the 100.7 was a first-ever draw) across four independent passes.

**ESTIMATED on the office hardware**, at **5× (band 4–6×; an estimate, not a
measurement — nobody on this project has a Core 2 Duo):** twelve of the fourteen
screens land between 10 ms and 275 ms, i.e. at or inside §9's 250 ms
placeholder. The two that do not are Buses with the cost sort (finding 2,
≈400 ms) and, right at the line, store/money/fuel/jobs at ≈175–275 ms.

**The Store catalogue's windowing is confirmed, with a number.** Store draws
**34 `.v2row`s of 2,384** — `S.cache.parts.length` read as 2,384 in the same
breath — in 34–55 ms. For the comparison, I took the 34 real drawn rows'
`outerHTML`, repeated it to 2,414 rows into a detached `.appbody`, and measured
build + forced layout: **271.3 / 346.1 / 266.8 ms**, i.e. **5–7× the windowed
draw with the same row markup**. §20 measured 410–619 ms for its own all-drawn
bed; mine is a different bed (the real row, repeated) and lands lower, but it
points the same way. At 4–6×, un-windowed would be **1.1–2.1 s** on an office
PC and windowed stays **140–275 ms**. §20's ruling that the catalogue must be
windowed holds, and the screen is doing it.

**Cold load of `/v2/index.html`**, three navigations to a fresh query string:

| | run 1 | run 2 | run 3 |
|---|---|---|---|
| first paint | 44 ms | 36 ms | 28 ms |
| DOM interactive | 70 ms | 31 ms | 24 ms |
| load event end | 71 ms | 31 ms | 25 ms |

**32 blocking classic scripts, 1,368 KB of JavaScript and 170 KB of CSS
uncompressed** (49–50 resources, ~1.5 MB decoded). Over localhost with no
compression, so this is parse/compile and nothing else. ESTIMATED at 4–6×:
**100–420 ms** to interactive on a Core 2 Duo, before any network. That is fine,
and it is worth knowing the number is parse-bound rather than network-bound,
because `sw.js` precaches the lot and the second load pays only the parse.

### Checks I broke to see whether they can fail

Per CLAUDE.md's rule that a check which cannot fail is decoration: I planted
**71 separate violations** in scratch copies under my scratchpad — never in
`v2/` — and ran `scripts/check-floor.py` against each. It went correctly red on
`oklch()`, `color-mix()`, `@starting-style`, `grid-template-rows: subgrid`,
`text-wrap: balance`, `Object.groupBy`, `.toSorted()`, `Promise.withResolvers`,
⚠ `U+26A0`, 🚌 `U+1F68C`, an emoji inside a template literal, a lone `U+FE0F`,
and a keycap carrying `FE0F`. It is a real check. The 43 probes it let through
are catalogued in finding 4.

---

## What I could not check, and why

1. **Chrome 109 itself, and Windows 7.** Not available here. Everything in parts
   2 and 3 was measured on Chrome 145 on macOS. See the limitation at the top.
2. **A Core 2 Duo.** Every office-hardware figure in this document is an
   estimate from a stated multiplier, and is labelled as one in the same
   sentence. `DECISIONS §20`'s gallery procedure remains the only way to get the
   real number.
3. **Paint, compositing and scroll smoothness.** My figures stop at forced
   style + layout. Headless Chrome does not composite to a real display, and
   §20 names the same gap in its own instrument.
4. **The Gate round screen's populated state.** It renders "The app does not
   know which buses run tonight" — 13 nodes, 1.7–2.8 ms — because my
   `nightlist` row shape did not satisfy it. Its empty state is correct and its
   layout is clean at both sizes, but I have **no render figure for a Gate round
   with buses on it**, and that is the screen a supervisor uses at 20:00 with a
   queue behind them. It should be measured before this ships.
5. **Reaching any signed-in screen through the login.** A never-synced device
   holds no roster: I read `users` out of IndexedDB as **0 rows**, because
   nothing in v2's boot calls `seedIfEmpty`, so the login has nobody to offer
   and the role tiles do not render. Another slice is fixing that. I therefore
   set `S.user` in the page and called `Shell.mount(id)` directly — a local
   fixture, **no PIN typed, no credential minted, no production endpoint
   touched**. That means I measured each screen's render and layout, not the
   taps to reach it; a tap-count review of the flows is a different pass.
6. **Hindi.** Every string I rendered was English. `DECISIONS §21` has the Hindi
   pending the owner, and Devanagari metrics will change wrapping and row
   heights — including, possibly, finding 1's threshold. Re-measure the layout
   after the Hindi lands.
7. **Real data.** The fixture is synthetic at real volume. Field *shapes* come
   from `v2/db.js`, but real registrations, real part names and real Hindi notes
   are longer and more varied than generated ones.

---

## If only two things get fixed

1. **Finding 1** — let the Today KPI figure wrap or shrink, or drop `.kpirow` to
   one column below ~420 px. One CSS change, and it takes the first screen
   anyone opens off a sideways scroll.
2. **Finding 2** — compute the 89 cost totals once per data change rather than
   once per redraw (the stores' `Cache.storeSig` is already the key that would
   tell you when it changed), and compute them after the search filter rather
   than before. Both are inside `buses.js`; `cost.js` needs nothing.

Finding 3 is a one-word change (`div` → `label`, as Buses already does).
Finding 4 is a change to the checker, which CLAUDE.md says belongs in its own
deliberate commit — and after adding each pattern, break the thing it covers and
confirm it goes red.

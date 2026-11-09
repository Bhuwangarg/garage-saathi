# Outside repair — review: the floor

Stage 5, one lens only: **Chrome 109 on a Core 2 Duo.** Branch `launch-v2`, tip
`f074302`. 2026-11-09. Read-only on source: every mutation in this review was made
in a throwaway copy of the repo, and `git status` in the worktree is clean and
`HEAD` unmoved. No production anything was touched; the only server was
`python3 -m http.server` on 127.0.0.1:8765, stopped afterwards.

Reviewed against `outside-repair-ux.md`, `-ui.md`, `-contract.md` and
`-assembly.md`. The sibling lenses are in `docs/v2/review/` (authorization, the
flow as a person, and an earlier `hardware-floor.md` of the whole of v2 at
`90aaec1`) — I read the last one and credit it below rather than re-finding it.

---

**Verdict: FIX FIRST — and nothing in the fix list is in the code's syntax or
speed.**

The cut itself is on the floor, and I could not find a single thing in it that
renders as nothing on Chrome 109. The newest platform feature the 8,629 added
lines use is `enterkeyhint` (Chrome 77), thirty-two versions below the ceiling.
Every measured number in the assembly doc reproduces here, including the drain
budget it reports as missed. Both of the checks I deliberately broke went red. What needs fixing before this ships is the paperwork and the gate around it:
one number the owner will act on is wrong by 77, and the check that is the *only*
floor evidence this cut has is still open at exactly the hole this cut's own CSS
sits in — reported three days ago and not closed.

The SHIP/SEND-BACK call on the feature as a whole is not mine: this is one lens,
and assembly §6 items 1 and 2 (the widening that reaches no existing device;
Attention's row that does not open the thing) are untouched by this review and
are still the reasons that doc says `ok = false`.

---

## Findings, worst first

### 1. The handover says three strings need Hindi. It is 80, and they are all of them.

**Where.** Assembly §6 item 4 ("**Three** word ids are English-only, pending the
owner") and §7 item 5. The code is honest and the doc is not: the slices'
own source comments say "Hindi PENDING".

**The concrete case, verified in a browser.** 128 new word ids are registered by
this cut; **80 of them carry `hi: ''`**. `v2/ui/words.js:104-111` renders such an
id as its English *with the id in brackets*, in Hindi mode only. With
`document.documentElement.lang = 'hi'` on a loaded `v2/index.html` I read back,
from all five files the cut touches:

```
attOutsideWhy   -> Out  days. 14 days is the limit. [attOutsideWhy]
attOutsideUnit  -> {unit} {serial} · {vendor} [attOutsideUnit]
jcAwayHead      -> Away for repair [jcAwayHead]
jcGateBillNeed  -> To close: a photo of the vendor's bill [jcGateBillNeed]
ftActReturn     -> Back from the vendor [ftActReturn]
jcOutsideCost   -> Outside cost [jcOutsideCost]
ojChassis       -> Chassis [ojChassis]
jcPassIssuedBy  -> Issued by {name}, {date} [jcPassIssuedBy]
ftReturnCharge  -> What they charged [ftReturnCharge]
stHistSerialOk  -> Serial matched [stHistSerialOk]
```

So: Attention's overdue row, the job card's away block, bill block, close-without-
a-bill flow and every gate-pass row, the whole of Fuel & tyres' return sheet —
the crew manager's only door — and the piece register's history lines. In Hindi,
this feature is English text with a bracketed id after it, end to end. The three
ids §6 item 4 names are only the three the integrator added; the other 77 came
in with the slices.

**What it costs.** The mechanism is the house's declared pending-label behaviour,
not a new bug — `W.pending()` returns 1,148 ids app-wide on a loaded page, so the
feature is in company. The cost is the *number in the handover*: an owner who
reads "three" and sets aside an evening for three labels discovers 80 after the
deploy, on the screens his crew managers use at a pump. He is the only Hindi
speaker on the project, which is exactly why the count has to be right.

**Fix.** Assembly §6 item 4 and §7 item 5: say 80, and say which screens are
affected. No code change. The count is 80 of the 128 ids the cut registers: 79
declare `hi: ''` on the same line as the id, and `jcBackAsk`
(`v2/screens/jobcard.js`) is the eightieth, with its empty Hindi on the
entry's second line. A bare `grep -c "hi: ''"` over the diff reads 125 and is
wrong: it counts removed lines too.

### 2. The one check that certifies this cut against the floor has a hole shaped like this cut

**Where.** `scripts/check-floor.py` — the `BANNED` list (lines 31-51) and
`NESTING` (line 56). Already reported, in detail, in
`docs/v2/review/hardware-floor.md` ("CSS nesting has two shapes the `NESTING`
regex cannot see", and two paragraphs of post-109 CSS and JS that pass). **Still
open at the tip.** The only change to the check since
(`36ad898`, "The floor check never saw an alarm clock") added emoji ranges and
touched none of it.

**The concrete case.** In a copy of the repo at the tip I appended this to
`v2/ui/work.css`, immediately below this cut's own `.oj-sheet` rules:

```css
[data-v2] .oj-sheet {
  color: var(--ink);
  .oj-err { color: var(--bad); }
  > .field { width: 100%; }
}
```

`scripts/check-css-floor.sh v2 ui` → **`✅ within the Chrome 109 floor`, exit 0.**
Chrome 109 drops both nested blocks: the error line and the full-width field are
simply not styled. The regex wants `^\s*&`, and neither of the two commonest
nesting shapes starts with one. In the same probe I added, and the check passed
green on all of them: `lab()`, `transition-behavior: allow-discrete`,
`transition: display .2s allow-discrete`, `linear()` easing, CSS `round()`,
`:nth-child(2 of .v2row)`, `setAttribute('popover','auto')` + `showPopover()`,
a `scrollend` listener, a `/…/v` regex, `new Set(x).union(y)`, `rows.with(0,v)`
on an identifier, and `URL.canParse`.

Two of those are worse than a dropped declaration. A `v`-flag regex is a
**SyntaxError at parse time on Chrome 109**: the whole script file fails to load,
which for `ui/passes.js` is every sheet in this feature gone and for
`screens/jobcard.js` is a blank card. `Set.union` and `.with()` throw at the tap.

**What it costs, and why it matters more now than it did on 6 Nov.** This is the
first cut whose UI *is* dialogs — three sheets, a confirmation, a datalist, a
print view. `popover`, `allow-discrete` and nesting are precisely the idioms the
next person touching `v2/ui/passes.js` or `work.css` will reach for, and the gate
will wave them through to a hundred people who cannot render them. Today the code
is clean (I scanned: finding 4 below), so this costs nothing yet. It is a gate
hole, not a defect in this feature — but it is load-bearing, because of finding 3.

**Fix.** Closing it is `check-floor.py` only, in its own commit, with each pattern
broken once to prove it reddens. If the list is to stay a blacklist, at minimum:
nesting without `&`, the `v` flag, the popover API, `allow-discrete`, `linear()`,
`lab()`/`lch()`/`color()`, `:nth-child(… of …)`, Set methods, `.with(` on an
identifier.

### 3. Nothing in this pipeline has ever executed on Chrome 109, and two sentences in the assembly doc read as if something had

**Where.** Assembly §4.3 ("Served locally and walked in a real browser … signing
in as owner, supervisor, store, crewmanager, mechanic, driver, conductor and
office") and §5's row-bed table ("held with 3.5× to 4.9× margin").

**The concrete case.** The browser `gstack browse` drives, which is the browser
the gate and §4.3's walk both use, reports itself as
`HeadlessChrome/145.0.7632.6` on `Intel Mac OS X 10_15_7`, 8 logical processors —
I read it off `v2/ui/gallery.html`'s own device line. No Chrome 109 and no
Windows 7 machine exists in this environment. §6 item 7 does say "anything on
Windows 7 / Chrome 109 itself" was not verified, which is honest and is why this
is third and not first; §4.3 and §5 do not repeat the caveat, and they are the
sections a reader quotes.

**What it costs.** It makes finding 2 the whole of the floor evidence for this
cut. A Chrome-109-specific layout or parse failure in 8,629 new lines would not
have appeared anywhere in this pipeline.

**Fix.** Two sentences in §4.3 and §5 naming the browser and the machine. The real
close is already written down and still not done — `DECISIONS.md §20` and UI §12:
copy `v2/ui` to an office PC, open `gallery.html`, press each Draw button once,
photograph the screen. I confirmed that page works and takes the reading
(four beds, three runs each, a field for the machine's name).

### 4. The drain budget is missed, I reproduced it, and I bounded what it costs the office PC — which nobody had

**Where.** Contract §8, assembly §5 and §6 item 5.

**Reproduced**, `python3 scripts/measure-outside.py` at the tip, load 6.45,
python 3.8.1 / sqlite 3.28, fixture 80,700 rows + 2,000 passes on 400 cards:

| | before | after | grows by |
|---|---|---|---|
| pages | 5 | 6 | **1** (budget: < 1) |
| rows | 9,290 | 11,290 | +2,000 |
| bytes | 3,508,917 | 4,403,187 | **+894,270** (873 KB) |

Identical to the doc. The arithmetic explanation in §5 (710 free slots on page 5,
the 711th pass buys the page) checks out against `PULL_LIMIT = 2000`.

**The number that was missing.** The miss is stated in server pages and bytes; what
the floor cares about is what the device does with them. Measured directly:
2,000 pass records are **1,071,356 bytes of JSON**, `JSON.parse` of them takes
**4.69 ms** and `PullApply.decidePage` over all 2,000 takes **0.33 ms** (best of
five, node 26, this Mac). Even at a Core 2 Duo's tenth of the speed that is tens
of milliseconds of CPU, once. **So the missed budget is a one-time 873 KB of
bandwidth on one role's devices, not a stall on an office PC** — which is the
input the lead needs to decide contract §8, and it is worth putting in §12 beside
the decision.

**What is still true and still a problem:** nothing can redden it.
`test_outside_cost.py:56-63` keeps the two push numbers only; the drain figure is
printed by the harness and asserted nowhere. §6 item 5 says this. I confirmed it
by breaking the other direction — see "the checks" below.

---

## What I checked and found correct — do not redo this

**The floor check, as run.** `scripts/check-css-floor.sh v2 ui` at `f074302`:
green, 62 files, exit 0. It is wired in three places and I confirmed each:
`.githooks/pre-push` (on `v2/` only, which covers `v2/ui/`),
`.github/workflows/tests.yml` (every push, every branch, so an uninstalled hook
cannot skip it), and twice inside the suite — `test_v2_passes.js:216` and
`test_v2_ui.js:776`, both with `v2 ui`.

**The cut's own platform floor.** The newest thing the 8,629 added lines use is
`enterkeyhint` (Chrome 77). The rest: `async`/`await` (55), `Element.closest`
(41), `FileReader.readAsDataURL`, `<datalist>`, `inputmode` (66),
`margin-inline-start` (69), `font-variant-numeric: tabular-nums` (52), CSS grid
`minmax` (57), `flex` shorthand, `aria-invalid`, `@media print`. Nothing in the
cut raises v2's requirement above Chrome 87, which is where the earlier review
left it.

**Post-109 features beyond the blacklist: none present.** I grepped all of `v2/`
for 24 patterns the checker does not cover — `lab(`/`lch(`, `scrollbar-width`,
`scrollbar-color`, `field-sizing`, `interpolate-size`, `animation-composition`,
`overlay:`, `:user-valid`, `:user-invalid`, `::details-content`, `anchor-name`,
`position-anchor`, `text-box`, `margin-trim`, `hyphenate-limit`,
`showPopover`/`hidePopover`/`togglePopover`, `.union(`, `Iterator.`,
`Promise.try`, `RegExp.escape`, `Float16`, `Temporal.` — **zero hits.** I also
scanned every `v2/**/*.js` for a regex literal carrying a `v` flag: zero (all
apparent hits are `'</div'` in HTML strings).

**CSS nesting: zero real occurrences.** A brace-depth scan of every `v2/**/*.css`
that tracks whether the enclosing block is an at-rule (so `@media` children are
not false positives) finds **0** selector blocks opened inside a selector block.

**Emoji and unrenderable characters: none.** Every added line in `v2/`, and in
`sync_server.py`, `v2_outside.py`, `v2_perms.py`, scanned in Python (not with BSD
`grep -P`, which is the trap the checker's own header describes). Non-ASCII in the
cut is: em dash ×18, middle dot ×14, right single quote ×7, ellipsis ×2, curly
double quotes ×2, and Devanagari. All render from ordinary Windows 7 fonts. The
server files added **no** non-ASCII at all, which matters because the eleven new
refusal sentences in contract §6.3 reach the screen from Python and
`check-floor.py` never scans a `.py`.

**The Hindi font stack is right for Windows 7.** `v2/ui/tokens.css:65`
`--font-hi: "Nirmala UI", "Segoe UI", Mangal, sans-serif` — Mangal is the
Devanagari font Windows 7 actually ships, and it is in the list.

**Animations.** The cut adds **no** `transition`, `animation` or `@keyframes` at
all: `git diff` over `v2/ui/work.css` and `v2/ui/fuel.css` shows layout, colour
tokens and a print override only. Across all of `v2/ui/*.css`, every transition is
`transform` and/or `opacity` except `v2/ui/login.css:87`
(`background-color`, `border-color`, 120ms, on one 12px PIN dot, with a
`transition: none` sibling at line 107) — pre-existing, not in this cut, paint-only
on one tiny element, and I am naming it so the next reviewer does not have to
re-find it rather than as a finding.

**No framework runtime arrived.** `v2/index.html` loads 34 classic local scripts
and 17 local stylesheets; no `type="module"`, no dynamic `import(`, no `http(s)://`
anywhere in the added lines, and no `setInterval`/`setTimeout`/
`requestAnimationFrame` added. The cut's weight on the shell: `v2/ui/passes.js`
32,363 B + `v2/outside.js` 4,444 B = **+36.8 KB on a 1,762 KB shell (+2.1%)**, and
2 more of 53 cached requests.

**Rule 1 and rule 2 of UI §12 hold.** No `appendChild`, `insertAdjacentHTML` or
`innerHTML` in any per-row loop in the added screen code, and no
`offsetHeight`/`offsetWidth`/`getBoundingClientRect`/`getComputedStyle` anywhere
in it — grepped over the whole diff of `v2/screens/` and `v2/ui/passes.js`. Rows
are built into one string. The print override
(`v2/ui/work.css:409-411`) swaps the inset hairline for a real
`border-bottom`, with the right reason: Chrome prints no box-shadow with
"Background graphics" off.

**The glue, on a real page load** — the thing seam 8 had broken. Loading
`http://localhost:8765/v2/index.html`: `Passes=object`, `Outside=object`,
`Caps.PERMS.gatePass = owner/supervisor/store/crewmanager`, and
`Outside.passNo('gp-abcd1234', 9 Nov 2026) = "OJ-261109-1234"`, matching the
published `^OJ-\d{6}-[A-Z0-9]{4}$`. Console: only the two the doc names —
`ERR_CONNECTION_REFUSED` ×2 and the service-worker scope error that
`python3 -m http.server` cannot avoid. Nothing else.

**The gate, re-run here, at the tip.**

| Command | My result | The doc's claim |
|---|---|---|
| `scripts/predeploy-gate.sh` | **392 passed, 0 failed** | 392 / 0 ✓ |
| `scripts/run-tests.py` | **90 passed, 0 failed, 8 serial, 81s wall**, and the per-suite counts sum to **3,695** | 90 / 3,695 ✓ |
| `scripts/check-floor.py v2 ui` | green, 62 files | 62 files ✓ |
| `scripts/check-v2-isolation.sh` | green | ✓ |

The gate's own outside-job and slip checks ("the slip prints what was recorded",
"serial compare ignores punctuation", "the slip stays ink-on-paper in dark mode")
are **v1's**, on `index.html`, and `predeploy-gate.sh` is unchanged in this range —
so §4's "none of its checks is this feature's" is correct.

**The push budgets, re-measured.** `/push` of an outside card: 4.75 ms with the
recompute, 2.12 without, **delta +2.64 ms** against a < 5 ms budget (the doc's own
run said +3.66; both hold). Unrelated store: **−0.18 ms, 0 recompute calls, 0 SQL
statements naming `gatepasses` in 20 pushes.** Close-transition lookup: 0.070 ms
pointer hit, 1.900 ms worst-case scan, 0.001 ms ordinary card.

**The row budget, re-measured — and on the page UI §12 actually points at.** The
gate's `#perf-bed` is in v1's `ui/gallery.html`; the doc's 51.5/52.6/58.1 ms is
that bed. My gate run of the same bed: **64.3 / 64.1 / 70.0 ms** (limit 250 on the
fastest). I then took the reading UI §12 names, from `v2/ui/gallery.html`, which
nobody had recorded at the tip:

| Bed | three runs (ms) |
|---|---|
| 200 dense desk rows | 45.2 / 38.1 / **34.7** |
| 200 reason rows (the Attention row — the heaviest in the app) | 30.6 / **28.0** / 28.7 |
| the 2,384-row catalogue, unwindowed | 389.4 / **360.4** / 414.8 |
| the same, windowed | 6.6+60.7 / 5.1+51.3 / **4.3**+52.1 |

All of this machine's, Chrome 145. Held with margin; the catalogue bed is
pre-existing and carries no budget. The office's own numbers are still unknown
(finding 3).

---

## The checks: I broke two, and both went red

**1. The floor check.** Put `color: oklch(55% 0.2 25)` in this cut's own
`.oj-err` rule in `v2/ui/work.css`, and a printer emoji into the rendered string
`ojPrint` in `v2/ui/passes.js`. `check-css-floor.sh v2 ui` → **2 violations,
exit 1**, naming both with the right file and line. Both wrapping suites went red
too: `test_v2_passes.js` → `1 FAILED`, `test_v2_ui.js` →
`FAIL python3 scripts/check-floor.py v2 ui is green`. Not decoration.

**2. The push budget.** Removed the `LIKE` pre-filter from
`_all_passes_of_card` (`sync_server.py:1505` region) — the realistic regression,
a "for correctness" edit that makes the recompute parse every gate pass instead
of the candidates. `test_outside_cost.py` → **`FAIL an outside card's push costs
under 5 ms more for the recompute`, 12.91 ms** (three runs 13.19 / 13.03 / 12.91),
while its three sibling work-assertions stayed green and correctly kept pointing
at the recompute. Not decoration, and it fails for the right reason.

Both mutations were made in a copy under the scratchpad. The worktree was never
modified.

I also probed the floor check for the holes in finding 2, which is the inverse
exercise: twelve things Chrome 109 cannot do, added to this cut's own files, and
the check stayed **green**.

---

## What I could not check, and why

1. **Chrome 109 and Windows 7 themselves.** Not available here; no emulation of
   either exists in this environment. Every millisecond in this review is an
   8-core Mac's under `HeadlessChrome/145`. I did not throttle the CPU — the
   browser driver available here exposes no way to.
2. **A Core 2 Duo multiplier.** I deliberately quote no estimate. The earlier
   review carried one; I have no measurement of my own to stand behind, and the
   honest statement is that the office's number comes from the office's machine.
3. **The printed slip on paper.** The print CSS reads correctly and the sheet
   draws; nothing has been printed, as §6 item 7 says.
4. **`readScope` over real HTTP** and the live server's
   `Service-Worker-Allowed` header. Both asserted in-process only; the local
   static server cannot send the header.
5. **Whether 873 KB on a first drain is acceptable on the office's connection.**
   I bounded the device's CPU cost, not the office's bandwidth. Nobody here knows
   what that link is, and the production count of `gatepasses` that decides the
   whole question is still unrun SQL in contract §9(b).
6. **Anything outside the floor.** Authorization, the flow's tap counts, the
   empty/one/too-many states, and assembly §6 items 1 and 2 are other lenses'. I
   did not review them and nothing here should be read as clearing them.

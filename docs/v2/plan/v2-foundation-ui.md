# Garage Saathi v2 — UI foundation

Stage 2 of the pipeline (`docs/v2/PIPELINE.md`), **foundation only**. This document
specifies the material the twelve screens of `docs/v2/plan/v2-ux.md` are built from:
tokens, density, primitives, icons, motion and copy. It does **not** specify the
screens. It was written while Q1, Q2 and Q3 (`v2-ux.md §8`) were still with the owner,
on the claim that nothing in the foundation turns on their answers. **Those three are
now answered** (`DECISIONS.md §5`, §6, §7) and two further decisions arrived with them
(§10 the second signature, §11 the supervisor's trip entry, §12 the departure check
kept whole), taking the product from fourteen screens to **twelve**. The claim held:
no token, no rejected colour, no icon, no motion rule and no copy rule moved. What
moved is listed in §8.3, and §8.1 re-checks the claim against the answers rather than
against the questions.

Read in full before writing a line of it: `docs/v2/plan/v2-ux.md` (654 lines),
`docs/v2/DECISIONS.md`, `docs/v2/inventory/03-data-and-sync.md §8` (measured budgets),
`docs/superpowers/specs/2026-11-01-garage-saathi-v2-design.md §8` (the performance
contract), `ui/tokens.css`, `ui/components.css`, `ui/states.js`, `ui/overlay.js`,
`ui/icons.js`, `ui/screens.css`, `ui/login.css`, and the five test files that are the
contract: `test_ui_tokens.js` (25 checks), `test_ui_components.js` (75),
`test_ui_overlay.js` (100), `test_ui_states.js` (43), `test_ui_icons.js` (30).

**The starting position is that `ui/` is right.** It is 2,581 lines carrying 273
passing checks, the live app already loads it, and the one thing this project cannot
afford is a second design system to migrate to. Everything below is either *reused
unchanged*, *a named gap with a named screen behind it*, or *a named defect in what
exists*. Three things it is not: a re-run of the colour work, a re-run of the motion
work, and a fresh set of names.

Gates run at the end of this document, green:
`python3 scripts/check-floor.py v2 ui` -> within the Chrome 109 floor (10 files).
`node test_ui_tokens.js` -> all passed.

---

## 0. What already exists, and what is missing

| The screens ask for | In `ui/` today | Verdict |
|---|---|---|
| Colour, space, type, density | `tokens.css`: 30 names, 61 declarations | **Reused whole.** 2 names added (§1.2) |
| Button, field, select, card, table, badge, tabs, stat | `components.css` | Reused whole |
| List row | `.v2row` (grid, truncating, density-sized) | Reused; one variant added (§3.4) |
| Sheet, confirmation, toast | `overlay.js` -> `V2.openSheet / closeSheet / confirmDialog / toast` | Reused whole |
| Empty, error, offline, loading, one-number figure | `states.js` -> `emptyState / errorState / offlineState / skeleton / figure` | Reused; **one defect fixed** (§6.3) |
| Icons, no font | `icons.js`, 31 marks | Reused; 3 added, cap reached (§4) |
| Number entry that never navigates | nothing | **Missing** (§3.3) |
| Ranked row carrying a reason | nothing | **Missing** (§3.4) |
| Photo capture and view | `camera` icon only | **Missing** (§3.5) |
| Filter control | `.tabs` + `V2.openSheet` + `.field` | **Already covered** — no new primitive (§3.6) |
| Nav | nothing (`home` and `me` icons were drawn for it) | **Missing** (§3.7) — a bottom bar at yard, a left rail at desk, and **none at all** for the two roles that hold one screen |
| A state for work waiting on a second signature | nothing | **Missing** (§3.8), and new since the first pass (`DECISIONS.md §10`) |
| Fixed words in Hindi | nothing: 21 English literals inside `states.js` and `overlay.js` | **Missing, and it is the named GO_LIVE defect** (§6.3) |

The brief's count of "26 icons" is stale: the set is **31** and `test_ui_icons.js` caps
it at 34. That cap decides §4.

---

## 1. Tokens

### 1.1 What v2 uses as-is

All of it. **30 distinct names, 61 declarations, nothing removed, nothing redefined.**

| Group | Names | Where the twelve screens use them |
|---|---|---|
| Ink | `--ink`, `--ink-dim` | Every row title (`--ink`), every sub-line, label, table head and figure note (`--ink-dim`) |
| Surface | `--surface`, `--surface-raised` | `--surface` is the page on all 14; `--surface-raised` is every card, sheet panel, toast, field and the row's hover fill |
| Edge | `--line` | The row hairline (an inset shadow, so it takes no height), card and field borders, the tab strip, the nav's top edge |
| Accent | `--accent`, `--accent-ink`, `--accent-text` | `--accent` is the one next step (Job card #4), the focus ring everywhere, the selected tab bar and the overlay scrim at 0.5; `--accent-ink` is text on it; `--accent-text` is the active nav tab, the active filter and `.btn-quiet` |
| Status | `--ok`, `--warn`, `--bad` | Attention row severity (#2), departure-check state released/waiting/held (#9), stale figures (`--warn`), the three badges, the three toasts. **Never alone** — always with a word and a mark |
| Type | `--font`, `--font-hi` | `--font-hi` carries Devanagari on every screen. **Me (#12) is the whole app for a driver and a conductor** (`DECISIONS.md §7`), which makes it the first place Hindi has to be right rather than the last (§6.3) |
| Space | `--s1`..`--s8` | Every gap and pad. `--s8` is also the sheet's enter distance |
| Density | `--tap`, `--row-h`, `--pad`, `--t1`..`--t6` | §2 |

Three properties of this file the screens depend on and a builder must not undo:
every selector starts with `[data-v2]` (so v2 and v1 share a document during the
migration); `font-variant-numeric: tabular-nums` is on `[data-v2]` but **does not
survive a `font:` shorthand or reach a form control**, which is why
`components.css` re-declares it on controls; and each hue's lightness is tuned
separately for contrast, so the numbers must not be regularised.

### 1.2 What is missing: three tokens, no colours

`test_ui_components.js` allows a px literal only in a `border*`, `outline*` or
`box-shadow` value (`PX_OK_PROP`). Any new component's height, width, padding or
gap **must** come from a token or that suite fails. All three additions below are
therefore required by the test, not a preference.

| New token | yard | desk | Named consumer |
|---|---|---|---|
| `--nav-h` | `56px` | `44px` | The nav **as a bottom bar** (§3.7), on every screen a nav-bearing role opens; and the bottom padding of that screen's scroll container, which must equal `calc(var(--nav-h) + env(safe-area-inset-bottom))` or the last row of Jobs (#3) and Attention (#2) sits under the bar |
| `--thumb` | `72px` | `56px` | The photo primitive (§3.5): Job card before/after photos and the close gate (#4), the **three departure-check photos and the driver's selfie on Duty board (#9)**, the supplier bill photo (#6), a driver's "something is wrong with my bus" photo on Me (#12) |
| `--rail-w` | — | `160px` | The nav **as a left rail** (§3.7.2), on every screen a supervisor or an owner opens on the office PC — which after `DECISIONS.md §5` and §7 is all twelve of them. Desk only: a rail is what a nav becomes when there is width and twelve slots |

Arithmetic for all three, so they are not taste:

- **`--nav-h` yard 56px.** Stacked item: icon 20px + gap `--s1` 4px + label `--t6`
  15px. In Hindi `--lh` is 1.7, so the label box is 25.5px: 20 + 4 + 25.5 = 49.5px,
  leaving 6.5px of padding inside 56. Latin (1.4) leaves 11px.
- **`--nav-h` desk 44px.** The desk item puts the label beside the icon (there is
  width and no thumb): content height is max(20, 15 x 1.7 = 25.5) = 25.5px plus
  `--s2` 8px top and bottom = 41.5px inside 44. Still above the 32px desk tap floor.
- **`--thumb` yard 72px.** At 360px (the narrowest phone in the yard, per
  `login.css`) the content width is 360 - 2 x `--pad` 16 = 328px. Four tiles of 72
  plus three `--s2` gaps = 288 + 24 = 312px <= 328. Desk 56px fits six across a
  660px panel.
- **`--rail-w` desk 160px.** `--pad` 8 + mark 20 + `--s2` 8 + label + `--pad` 8. The
  longest label is "Fuel & tyres", 12 characters at `--t6` 14px, about 84px in Latin:
  128px. Devanagari runs wider, so 160px leaves 32px of slack rather than 8px.
  Vertically, twelve items at `--tap` 32px is 384px of a 768px office screen, so every
  slot a supervisor holds fits without a More sheet. Content keeps 1024 - 160 = 864px.

### 1.3 Colour: nothing new, and here is the arithmetic

One colour token was a real candidate and is **rejected**: a third surface step
(`--surface-pick`) to fill a selected filter chip and a selected desk row. Computed
with `contrast()` exported by `test_ui_tokens.js`:

Light candidate `hsl(38 34% 91%)`, against the light block:

| Foreground | Ratio | Needs |
|---|---|---|
| `--ink` `hsl(30 20% 9%)` | 14.89:1 | 4.5 ok |
| `--ink-dim` `hsl(30 8% 34%)` | 5.97:1 | 4.5 ok |
| `--accent-text` `hsl(16 71% 35%)` | 5.85:1 | 4.5 ok |
| `--ok` `hsl(147 63% 28%)` | 4.82:1 | 4.5 ok |
| `--warn` `hsl(38 93% 28%)` | 5.00:1 | 4.5 ok |
| `--bad` `hsl(5 67% 43%)` | 5.06:1 | 4.5 ok |
| `--accent` `hsl(16 88% 54%)` as a ring | **2.83:1** | 3.0 **FAIL** (WCAG 1.4.11) |

Every lighter candidate that still separates from `--surface` (96%) and
`--surface-raised` (99%) fails the same way: `hsl(40 30% 92%)` gives 2.89:1,
`hsl(38 38% 90%)` 2.78:1, `hsl(38 40% 89%)` 2.73:1. A filter chip and a desk row
both take focus, and a tab-strip focus ring is drawn *inside* the edge
(`outline-offset: -2px`, `components.css`), so the ring would sit on the new fill
and fail 3:1. The dark side has the mirror problem: `hsl(30 13% 20%)` and lighter
put `--bad` `hsl(5 85% 66%)` at 4.17:1, under 4.5, and only `hsl(30 12% 18%)`
(4.50:1) scrapes it — a one-hundredth margin is not a token.

**And it has no consumer.** Every filter named in `v2-ux.md` is a mutually
exclusive view, not an additive flag: Jobs (#3) "completed" / "away for repair",
Reviews (#11) "low / conflict / untraced", Store (#6) catalogue / waiting
requests. `.tabs` already draws exactly that — `--accent-text` plus a 2px
`--accent` bar, never colour alone, already at 4.5:1 and 3:1 — so a selected-chip
fill is a token with nothing behind it. No row in `v2-ux.md` is multi-selected
either; a tap on a Jobs row opens the Job card. **Rejected on both counts.**

So: **zero new colour tokens.** The status, accent and surface tokens cover all
twelve screens, including the things a reader might expect to need one:

| Thing someone will ask for | What it uses instead |
|---|---|
| A dark backdrop behind a full-size photo | `--accent-ink` at 0.5 via the existing sheet scrim (that token is near-black in **both** themes, which is why the scrim uses it) |
| The gate-check hold progress | `--accent-ink` at 0.25 over `.btn-primary`, so the button darkens left to right (§5.7) |
| "Held for another person" / locked trip | `opacity: 0.5` and words; the system already disables this way |
| Attention severity | `--bad` / `--warn` / `--ok` on the row's lead mark, as `screens.css .trow.crit` already does |
| A figure that is old | `--warn` on `.figure-note-stale`, with a clock and the words "Updated ... ago" |

**If a later stage does need a colour**, the contract is: `hsl()` only (no hex, no
`rgb()`, no keyword — `nonHslColours()` rejects all of them, including
`transparent` and `currentColor`); declared in all three blocks (light,
`@media (prefers-color-scheme: dark)`, `[data-v2][data-theme="dark"]`) with
identical dark values; different in light and dark (only `--accent-ink` is allowed
to be shared); and the pairs added to `TEXT_PAIRS` in `test_ui_tokens.js`, plus the
3:1 ring loop if the accent is ever drawn on it. A token that cannot pass those is
not a token.

### 1.4 What is deliberately not tokenised

| Not a token | Why |
|---|---|
| Radius | `components.css` uses 8px for controls, 12px for panels, 999px for pills, as literals, legally (`border-radius` is exempt). A radius token now would mean two conventions in one file and an edit to all 923 lines to be consistent. New primitives **reuse those three literals** |
| Duration and easing | Same reason: the ladder is 120 / 150 / 180 / 200 / 250 ms and `ease-out`, written out, and pinned by `test_ui_components.js` |
| Shadow | Only `login.css` has one (an `rgba()` desktop lift). Nothing in the twelve needs a second |
| Z-index | `overlay.js` owns the top layer via `<dialog>`; the toast lane is 1000. The nav sits in normal flow |

---

## 2. The density problem

Two readers, one component. A supervisor at a desk on Windows 7 at 1024x768 reads
Jobs (#3) and Attention (#2) as **hundreds of rows**; a driver at a bus at 20:00
reads **four** on a cracked screen in bad light. These are not two components and
not two stylesheets. They are `.v2row` under two values of one attribute.

### 2.1 How one row serves both

`data-density="yard"` (the default, because a bigger target is the safe failure) or
`data-density="desk"`, on the `[data-v2]` element or on any container inside it —
`tokens.css` already allows a desk table inside a yard page. Nothing in the markup
changes.

| | yard | desk |
|---|---|---|
| Row height | `--row-h` 56px | `--row-h` 32px |
| Tap target | `--tap` 48px | `--tap` 32px |
| Side padding | `--pad` = `--s4` 16px | `--pad` = `--s2` 8px |
| Body / small | `--t5` 16px / `--t6` 15px | 15px / 14px |
| Lines in the row | two: `.t` title + `.sub` | **one: `.t` only** |
| Lead mark | `icon(name, {size: 20})` | `icon(name, {size: 16})` |
| Controls in `.act` | at most **one** | up to **three** (figure, badge, button) |
| Row element | `button.v2row` or `a.v2row` — the whole row is the target | `a.v2row`, unless it holds a field (§3.3) |

Two numbers decide the one-line desk row, and both are Hindi:

- Desk, Hindi, one line: `--t5` 15px x `--lh` 1.7 = 25.5px, inside `--row-h` 32px.
- Desk, Hindi, two lines: 25.5 + 23.8 = **49.3px**, which forces the row to 49.3px
  and breaks the only assumption windowing has (§2.3). So a desk row is one line,
  and Hindi is the reason, not taste.
- Yard, Hindi, two lines: 27.2 + 25.5 = 52.7px inside 56px — 3.3px of slack. It
  fits, and it is the tightest fit in the system. A builder who raises `--t5` or
  `--t6` in yard density breaks Hindi first and English never.

### 2.2 The measured budget

From `03-data-and-sync.md §8` and `spec §8`, measured, not chosen:

| Interaction | Budget | Where it comes from |
|---|---|---|
| Tap to visible response | **< 100 ms** | `spec §8`; the old number was 884 ms per tap before dirty-store tracking (commit `cd240f7`) |
| Screen change, data present | **< 250 ms** | `spec §8`; the old home render was 432 ms uncached, every 4 s |
| First paint after sign-in | **< 1 s** | `spec §8`; cold boot 798 ms, pad drawn at ~120 ms |
| Sync tick while idle | **~0 ms of main thread** | 880 ms -> 0 ms, commit `cd240f7` |
| **200 dense desk rows, drawn and laid out** | **< 250 ms**, fastest of three runs | `predeploy-gate.sh`, the `#perf-bed` block. Each row must carry a drawing, a figure, a badge and a button, or bare divs would satisfy the row height and time nothing |

**The 250 ms in the gate is a placeholder set on a developer's Mac and the gate says
so in its own comment.** The real number comes from opening `ui/gallery.html` on an
office PC (Windows 7, Chrome 109, Core 2 Duo) and pressing "Draw 200 rows", which
shows three runs on screen. Until that reading exists the check means only "not
absurdly slow here". **Stage 3 must take that reading and tighten the threshold to
it.** This is the single highest-value measurement in the whole foundation and it
costs one person five minutes.

### 2.3 The seven rules that keep 200 rows inside it

1. **One string, one insert.** Build the whole list as one string and use a single
   `insertAdjacentHTML`, as `renderDemoRows()` in `ui/gallery.html` does. Per-row
   `appendChild` is the shape that cost 277 ms per page before batching (db.js:193).
2. **Nothing measures a row.** No `offsetHeight`, `getBoundingClientRect` or
   `getComputedStyle` per row — that is the "work proportional to the dataset,
   performed per item" shape named in `v2-ux.md §6` and `spec §8.1`.
3. **The hairline stays an inset shadow.** `box-shadow: inset 0 -1px 0 var(--line)`
   takes no height, so a desk row holding a 32px button is exactly 32px, not 33.
   200 rows x 1px of border is 200px of drift and a scroll height that lies.
4. **No `at` on a figure inside a row, in desk density.** `figure(v, {at})` adds
   `.figure-note` as a **block** — it triples the row's height and runs `ageWords()`
   200 times. The list states its freshness **once**, in its header, which still
   satisfies "every number says when it was last true" (`spec §4.7`). A figure
   inside a row is `figure(v, {unit})`, or `figure(null)` for unknown.
5. **Indexes once, per content signature.** `cachedSig(store)` already exists in the
   live app and is gate-checked; `computeInsights()` at 386 ms per render and
   `driverOverall`'s 200 ms `storeSig` over 40,000 rows are what happens without it.
6. **Over 200 rows, window.** `spec §8.3`. Windowing needs a row height it can
   compute without measuring, which is exactly `--row-h` — so **a windowed list may
   only use the one-line row**. Scroll height is `rows x --row-h`.
7. **Hover is already gated** behind `@media (hover: hover)`, so a tap on a phone
   leaves nothing stuck and a desk list pays for hover only where there is a mouse.

### 2.4 The consequence for Attention

The ranked row (§3.4) carries a wrapped reason, so its height is **variable** — 72px
yard, about 88px in Hindi — and rule 6 therefore forbids windowing it. So
**Attention draws at most 200 ranked rows**, and ends with one line stating how many
more there are and which filter narrows them. That is the measured number, and it
keeps the screen `v2-ux.md §9` calls "the one most likely to reintroduce the measured
performance bug" inside the only budget we have. It also refuses the other failure
that document names: a count that can never reach zero.

---

## 3. Primitives

Eight, in the order `v2-ux.md` demands them. Each lists its exports, whether it
exists, and all eight states. Where a state cannot occur, that is said rather than
left out — and §3.7's `empty` row is a worked example of that claim being wrong and
having to be corrected.

| # | Primitive | Exists in `ui/`? | New code needed |
|---|---|---|---|
| 3.1 | List row `.v2row` | **Yes**, `components.css` | None |
| 3.2 | Sheet | **Yes**, `overlay.js` | None |
| 3.3 | Number entry `.num` | No | ~25 lines CSS, one delegation rule |
| 3.4 | Ranked row `.v2row.v2row-why` | Variant of 3.1 | ~12 lines CSS |
| 3.5 | Photo `.photos` | No | ~40 lines CSS + one `photos.js` |
| 3.6 | Filter | **Yes** (`.tabs` + sheet + field) | None |
| 3.7 | Nav `.nav` (bar or rail) | No | ~45 lines CSS + one `nav()` builder |
| 3.8 | Second-signature state | No (composed from 3.1, 3.4 and the badge) | No new CSS |

### 3.1 List row — `.v2row` (exists)

**Exports** (markup contract, `components.css` header):
`<div|button|a class="v2row"><span class="lead">[icon]</span><div class="txt"><div class="t">title</div><div class="sub">second line</div></div><div class="act">[figure][badge][button]</div></div>`
A three-column grid: `auto minmax(0, 1fr) auto`, so a long bus number truncates with
an ellipsis instead of shrinking the action.

**Consumers:** all twelve. Jobs (#3) standing buses oldest-first; Today (#1) every
role's queue; Store (#6) catalogue and waiting requests; People (#8) crew worst-first;
Duty board (#9) tonight's buses and their three seats; Buses (#5) register; Reviews
(#11); Me (#12), which for a driver and a conductor is the whole app.

| State | Specification |
|---|---|
| default | As above. `--ink` title at 600, `--ink-dim` sub at `--t6`, lead mark `--ink-dim` |
| pressed | `transform: scale(0.97)`, 120 ms `ease-out`, on `button.v2row:active` and `a.v2row:active` only. Already in `components.css` |
| focus | `outline: 2px solid var(--accent); outline-offset: -2px` — inside the edge, because a list clips an outer ring |
| disabled | A row a person may not act on is **not drawn** (deny-by-default, `v2-ux.md §4.3`). A row that is temporarily unusable is a `div.v2row` with no press and a word in `.act` ("Waiting for parts"), never a greyed-out pressable |
| loading | `skeleton(n)` with `n` = the number of rows the list will have, so the list does not jump. Static by design |
| empty | `emptyState(text, {icon, hint})` — and only when the answer is "I asked, and there are none" |
| error | `errorState(text, onRetry)` |
| offline | `offlineState()` when there is nothing to show **and** no connection. A list that has rows keeps them and states its age in the header |

**Must not change:** the class is `.v2row`, not `.row`. The live app uses `.row` 237
times as a flex utility; the collision shipped to the home screen and stacked both
children of every layout row on top of each other. 237 against 10: the system yields
the name.

### 3.2 Sheet (exists)

**Exports:** `V2.openSheet(title, html, opts)` -> `<dialog>`, `V2.closeSheet()`,
`V2.confirmDialog(text, opts)` -> `Promise<boolean>`, `V2.toast(text, opts)`. On the
`V2` global only — the live `app.js` already owns the bare names and a page holds both
files for the whole migration.

**Consumers:** every write in `v2-ux.md §3`. Issue a part against a chosen card (#6,
and the card is **never** pre-selected — a part was charged to the wrong bus,
[E] `d738a6e`); a part request (#4); one workshop time (#4 step 3); fit a tyre or log
diesel (#10); fill a seat and record a departure check (#9); the supervisor's trip
entry (#7); the secondary filters of §3.6.

| State | Specification |
|---|---|
| default | Bottom-anchored panel, `max-width: 40rem`, `max-height: 90%`, radius 12px 12px 0 0, `--surface-raised`, head with `--row-h` min-height and a Close button, body padded `--pad` with `env(safe-area-inset-bottom)` |
| pressed | Its own controls press per §5.1 |
| focus | `showModal()` traps focus; the opener's `activeElement` is recorded and restored. A confirmation starts focus on **Cancel**, so a reflexive Enter says no |
| disabled | n/a — a sheet is not a control. A sheet that would be empty for this person is not opened |
| loading | `skeleton()` inside the body; the sheet opens immediately. Never a blank panel while a store reads |
| empty | `emptyState()` inside the body |
| error | `errorState()` inside the body for a failed read; `V2.toast(msg, {kind: 'bad'})` for a failed write, because the sheet has closed by then |
| offline | A sheet whose write needs the network (challan lookup, ITS, any AI reading, staff creation, PIN setting — `03 §6`) says so **before** the person fills it in, in its body, not after they press |

**The division of fields is load-bearing, not styling.** `v2-ux.md §6`: conflict is
whole-record last-write-wins on a device clock, and a losing record is dropped
silently with a 200 response. So the Job card is not a sheet two people hold at once:
the supervisor owns the card, the mechanic's two taps write two fields nobody else
writes, and the storekeeper's issue writes `partsUsed` — the one field the server
merges. **No sheet in v2 may be designed on the assumption that this is fixed.**

### 3.3 Number entry — `.num` (NEW)

The one primitive with a regression check already written against it.
`predeploy-gate.sh` lines 508-511 ("Clicking a count field must NOT navigate away —
the exact regression") and the invariant sweep at line 1073, which clicks every
`input`, `select` and `textarea` on a screen and asserts the route is `stable`, not
`MOVED`. A shelf-count field sat inside a pressable row, the row's delegated handler
caught the click, and the storekeeper was thrown off the screen mid-count.

**Exports:** markup only, no script.
`<label class="num"><span class="num-l">Quantity</span><input class="field num-in" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" enterkeyhint="done" data-kind="whole"><span class="num-h">...hint...</span></label>`
`data-kind="decimal"` switches to `inputmode="decimal"` and `pattern="[0-9]*[.]?[0-9]*"`.

**Three rules, each with a reason:**

1. **`type="text"` with `inputmode`, never `type="number"`.** A number input puts
   spinners in a 32px desk row, accepts `e`, and **changes its value when the mouse
   wheel rolls over it** — on a 200-row desk list that is a silent wrong quantity.
   `inputmode` and `enterkeyhint` are both inside Chrome 109.
2. **A row that holds a field is `div.v2row`, never `button.v2row` or `a.v2row`.**
   The field lives in `.act`; nothing wraps it that is itself a target.
3. **The screen's one delegated click listener returns early** when
   `ev.target.closest('input, select, textarea, label, .num')` is non-null, **before**
   it reads `[data-act]` or `[data-nav]`. This is the line the regression was missing.

**Consumers:** Store (#6) issue against a card, receive stock, and the shelf count —
"the book is corrected by counting, not by typing", which is a grid of one field per
part; Job card (#4) part request quantity and the **odometer**; Fuel & tyres (#10)
litres and rupees (`data-kind="decimal"`); Money (#7) the supervisor's trip entry —
allowance given and expenses back (`DECISIONS.md §11`).

| State | Specification |
|---|---|
| default | `.field` as it stands: `--surface-raised`, 1px `--line`, radius 8px, `min-height: --tap`, `--t5`, tabular-nums re-declared (the UA `font:` shorthand resets it) |
| pressed | None. A field is not pressed; it is focused. Tapping it must do **exactly one** thing: put the caret in it |
| focus | `outline: 2px solid var(--accent); outline-offset: 2px` |
| disabled | `opacity: 0.5; cursor: not-allowed`. Used for a closed trip's expense ([C] the server freezes it) and a verified card's odometer |
| loading | The field is never a loading surface. While the write is in flight the **submit button** is `aria-disabled="true"` and says what it is doing ("Issuing...") — §5 says why this does not animate |
| empty | A blank field is blank, with `::placeholder` in `--ink-dim`. **Never a pre-filled 0**: on an odometer or a shelf count a default 0 is a wrong reading nobody typed |
| error | `aria-invalid="true"` -> `--bad` border **plus** an inset 1px `--bad` edge, **plus** the message beside it in words. Never colour alone. The odometer's message names the number: "Lower than the last reading, 48,210 km" — forward-only, [E] `927864c` |
| offline | No change. A count, a quantity and an odometer are local writes and work offline — which is most of what this app is for |

### 3.4 Ranked row with a reason — `.v2row.v2row-why` (NEW)

Attention (#2) is the one new idea in `v2-ux.md` and the one its own §9 says is most
likely to be built wrong. Its row is the reason: "one ranked list, each row carrying
the reason and the money or the safety it represents". A reason truncated to an
ellipsis is the failure — the row becomes a colour and a number, which is `dashboard`
again.

**Exports:** the `.v2row` markup plus `v2row-why` on the row. `.sub` then wraps to at
most two lines instead of truncating:
`white-space: normal; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden`
(`-webkit-line-clamp` is Chrome 6+; well inside the floor). The row keeps
`min-height: var(--row-h)` and grows.

**Consumers:** Attention (#2), every row kind — a gate check awaiting a decision,
work awaiting sign-off, an unexplained stock change, a pilferage flag, a document
expiring, an unpaid challan, an open unsafe driver report, a breakdown pattern, a bus
with no driver. Also the "one next step" row at the top of the Job card (#4), and the
money-pit list on Money (#7), where a per-km figure must carry why it is one
([E] `8db78e7`: 45,000 rupees read as 45,000/km sent the owner to inspect a healthy
bus).

| State | Specification |
|---|---|
| default | `.lead` is the **row kind's own mark** coloured `--bad`, `--warn` or `--ok` (as `screens.css .trow.crit .ti` already does — a coloured mark, not a coloured tile: six tiles is decoration, one mark is a signal). `.t` is the thing. `.sub` is the reason, up to two lines. `.act` is `figure()` — the money or the count — and nothing else |
| pressed | `a.v2row:active` scale(0.97), 120 ms. Every Attention row goes somewhere: the row is the reason, the link is the fix |
| focus | ring inside the edge, as §3.1 |
| disabled | A row whose capability this person does not hold is **absent**. `v2-ux.md §4.3`: Attention declares a capability **per row kind**; granting Attention grants the empty list |
| loading | `skeleton(6)`. Attention ranks across many stores and is the screen most likely to be slow, so it draws its skeleton first and fills in |
| empty | `emptyState('Nothing needs you', {icon: 'ok', hint: 'Checked just now.'})`. This is the state the whole screen exists to be able to reach — if the count can never be zero, the screen is lying (`v2-ux.md §4.1` #2) |
| error | `errorState()` for the whole list. A single row that cannot be ranked is **dropped from the ranking and listed at the end under its own heading**, never ranked at zero |
| offline | The list keeps its rows, and the header says "No signal since 06:40" — the rows are from the local database and are real; only their age is in question |

**Variable height, so never windowed** (§2.4). A windowed list uses §3.1's one-line row.

### 3.5 Photo capture and view — `.photos` (NEW)

`viewPhoto` is a component, not a screen (`spec §5`). Nothing in `ui/` draws one
today.

**Exports** (one new file, `ui/photos.js`, in the shape of `states.js` — ES5, returns
markup strings, escapes everything):
- `photoGrid(list, opts)` -> a grid of `--thumb` tiles; `opts {max, capture: boolean, pending: [ids]}`
- `photoCapture(label, name)` -> the capture control
- `V2.openPhoto(src, caption)` -> full size, inside `V2.openSheet` (no new overlay)

The capture control is a label-wrapped file input, because that is the only way to
reach a camera on Chrome 109 without script:
`<label class="btn photo-add"><input type="file" accept="image/*" capture="environment" class="sr-only">[icon camera] Take photo</label>`
The input is `.sr-only` (clipped, still in the accessibility tree, never
`display: none`), and the **label** carries the focus ring via `:focus-within`:
`outline: 2px solid var(--accent); outline-offset: 2px`.

**Consumers:** Job card (#4) before/after photos with the close gate **visible from
the top of the card**, so it is never a surprise at the end; Duty board (#9) the three
departure-check items that need a photo **and the driver's selfie, photographed by the
supervisor** (`DECISIONS.md §12`); Store (#6) the supplier bill, photographed and read
by Claude; Me (#12) check-in with the live face, and a driver's "something is wrong
with my bus" by photo or voice.

| State | Specification |
|---|---|
| default | Grid of `--thumb` square tiles, `gap: --s2`, `object-fit: cover`, radius 8px, 1px `--line`. Each tile is a `button` that opens the full size. The capture control is the last cell |
| pressed | scale(0.97), 120 ms, on the tile and on the capture label |
| focus | ring at `outline-offset: 2px` on the tile; `:focus-within` on the capture label |
| disabled | After a card is closed or a trip ended, the capture cell is **absent**, not disabled, and the grid says "Photos are fixed once the card is closed" |
| loading | A tile that is decoding shows the `.skeleton-bar` fill at `--thumb` square. A tile that is **uploading** carries the word "Sending" and no spinner |
| empty | Not `emptyState()`. An empty photo grid is the capture control plus the requirement in words: "Two photos before, two after. Needed to close this card." The gate is the content |
| error | A tile that failed carries a `badge badge-bad` with the word "Not sent" and the `offline` mark, and stays tappable to retry. The photo is **not** lost — it is in the record |
| offline | The named 20 MB case (`v2-ux.md §6`): a photo that could not be uploaded travels inside the record as a data URL. The tile says "On this phone only" with the `offline` mark, and the grid's hint says "Sends when there is wifi". Do not tell the user to do anything else; the manual already tells them to upload on wifi and that is the honest state |

**Must not change:** the view is a sheet. A photo is not a screen and not a new
overlay kind — `overlay.js` has 100 checks behind its focus, scroll-lock and
dismissal behaviour and a second modal mechanism would have none of them.

### 3.6 Filter control (EXISTS — nothing new)

**Exports:** three things that are already built.
1. `.tabs` — `<div class="tabs" role="tablist"><button role="tab" aria-selected="true">` — for a set of mutually exclusive views. The selected one has a 2px `--accent` bar **and** `--accent-text`, never colour alone; the strip scrolls horizontally on a phone; `min-height: --tap`.
2. `V2.openSheet` — for anything with more than one axis (a date range, a bus, a vendor), opened from a `.btn` carrying `icon('filter')`. A filter with three fields is a sheet, not a strip.
3. `.field` with `icon('search')` — for a needle (a part, a bus, a person).

**Consumers:** Jobs (#3) open / completed / away for repair / mechanic workload;
Reviews (#11) low / conflict / untraced, plus the typed-redBus-name queue;
Store (#6) catalogue / waiting requests / counts; People (#8) crew / staff / logins;
Buses (#5) and Store (#6) search.

| State | Specification |
|---|---|
| default | Unselected tab `--ink-dim`, transparent 2px bottom border |
| pressed | scale(0.97), 120 ms |
| focus | ring inside the edge (`outline-offset: -2px`) — the strip clips an outer ring |
| disabled | A filter that would return nothing is still **shown**, and selecting it shows the empty state. Hiding it makes the person wonder where it went; its own emptiness is the answer |
| loading | The strip draws immediately with the counts as `figure(null)` — a dash, not a 0. `states.js` exists because "unknown" and "zero" must never look alike |
| empty | The **list** goes to `emptyState()` naming the filter: "No cards away for repair" |
| error | The strip stays; the list takes `errorState()`. Losing the filter with the data strands the person on a screen they cannot leave by filter |
| offline | No change. Filtering is local |

**The filter never navigates and never writes.** It changes what is drawn. A tap on
a tab must not push a route, because a back press would then walk back through
filters instead of leaving the screen.

### 3.7 Nav — `.nav` (NEW): a bottom bar at yard, a left rail at desk

Nothing in `ui/` draws it, though `icons.js` says `home` and `me` were drawn for it.
It is where the most plainly broken thing in today's app gets fixed: a supervisor
holds 16 capabilities with no reachable screen (LIVE-ISSUES 6), and `v2-ux.md §4.4`
makes "no capability is held without a path" a build-time check.

**Exports:** one builder, `nav(items, activeId)` -> markup (new file `ui/nav.js`, or
the screen layer — it is twelve lines of string building either way).
`<nav class="nav" aria-label="Main"><a class="nav-i" aria-current="page"><span class="nav-ic">[icon]</span><span class="nav-l">Today</span></a>...</nav>`
**One component, two orientations** (§3.7.2), chosen by the page's own density.

**Slots, from `v2-ux.md §4.4`, which is the whole point of the primitive:**

| Role | Slots | Tabs |
|---|---|---|
| driver | **1** | Me — **and therefore no nav at all** (§3.7.1) |
| conductor | **1** | Me — **and therefore no nav at all** (§3.7.1) |
| mechanic | 4 | Today, Jobs, Store, Me |
| store | 5 | Today, Store, Jobs, Fuel & tyres, Me |
| crewmanager | 6 | Today, Duty board, People, Fuel & tyres, Reviews, Me |
| office | 4 | Today, People, Reviews, Me |
| supervisor | 6 at yard, **all 12 at desk** | Today, Attention, Jobs, Buses, More, Me |
| owner | 6 at yard, **all 12 at desk** | Today, Attention, Money, Buses, More, Me |

The crew manager's six is settled: the first draft of `v2-ux.md §4.4` said five, this
document took `§4.2`'s list of six, and the revised `§4.4` confirms six and says the
foundation's reasoning is the reason. Nothing to carry back any more.

**Six slots is the ceiling at phone width.** At 360px, six items are 60px wide, which
holds a 20px mark and a `--t6` label. The overflow is a **More** tab (`icon('more')`)
that opens `V2.openSheet` listing every remaining screen this person holds — that is
the mechanism by which a supervisor on a phone reaches Store, People, Duty board,
Fuel & tyres, Reviews and the departure check, and the mechanism the
(role x capability) vs (role x reachable screen) check reads. **A screen reachable
only from another role's home is a build error.**

| State | Specification |
|---|---|
| default | Mark + label, `--ink-dim`. The label is **always** visible: a 4-slot and a 12-slot nav must read the same, and an icon-only tab on a Windows 7 machine is how the emoji problem started |
| pressed | scale(0.97), 120 ms `ease-out`, same as every pressable |
| focus | `outline: 2px solid var(--accent); outline-offset: -2px` |
| disabled | Never. A tab a role does not hold is **absent** |
| loading | The nav draws in the first paint, before any store is read. It is the one thing on screen that must never wait for data |
| **empty** | **One slot means no nav is drawn at all** — see §3.7.1. This was written as "cannot occur: every role has at least Today and Me", which `DECISIONS.md §7` has made false: a driver and a conductor now have Me and nothing else |
| error | Cannot occur. The nav holds no data |
| offline | The **Me** tab's label carries a count when records are waiting: "Me (3)". Not a coloured dot — `v2-ux.md §7` measure 7 wants every refused, quarantined or dropped record surfaced with a reason, and a dot carries neither. Me (#12) then names them |

**Active tab:** `aria-current="page"`, `--accent-text`, plus a 2px `--accent` bar on
the edge the nav sits against — the **top** edge of a bottom-bar item, the **leading**
edge of a rail item (mirroring `.tabs`' bottom bar). Colour is never the only cue.
**The bar does not animate** (§5.8).

#### 3.7.1 One slot: a driver and a conductor get no nav

`DECISIONS.md §7` and `v2-ux.md §3.4`: Me (#12) is the **whole app** for these two
roles, who between them hold zero capabilities. **A nav with one item is a lie about
there being somewhere else to go** — the same lie as a disabled tab, which §3.7's
disabled row already forbids. So `.nav` is not rendered, and the two jobs a nav does
are done by the screen itself:

| What a nav would have done | What Me does instead |
|---|---|
| Say whose app this is and who is signed in | The greeting block at the top of the screen (`screens.css .greet`): `icon('me')` in a 40px ring, the person's name at `--t3`, their role and the garage's name at `--t5` in `--ink-dim`. It scrolls with the screen; the screen is one short column |
| Offer a way out of where you are | There is nowhere else, so **no `back` control and no More**. A back arrow pointing at nothing is the same lie. Every sheet opened from Me closes to Me, which `overlay.js` already guarantees with Escape, the Close button and a backdrop click |

Three further rules for this screen, because it is the one screen two whole roles ever
see and `v2-ux.md` is explicit that a login landing nowhere is what cost a month of
mechanics' time ([E] `8db78e7`):

1. **No fixed bottom bar of any kind**, including an action bar. A bar pinned to the
   bottom edge of a one-screen app reads as a nav that has lost its tabs.
2. **Check in / out is the first thing on the screen**, a full-width `.btn-primary`
   inside the first card — it is what the business needs from these two roles
   (attendance is wages in practice, Q10) and what they came for.
3. **"Something is wrong with my bus"** is a `.btn` in its own card opening a sheet
   (area, then voice or photo). It is this screen's one consumer of the photo
   primitive (§3.5) and of `warn` and `camera`.

**What `--nav-h` means on a screen with no nav: nothing — it is not consumed.** The
scroll padding rule is therefore conditional, and both halves are exact:

- With a bottom bar: `padding-bottom: calc(var(--nav-h) + env(safe-area-inset-bottom))`.
- With no nav, or with the rail: `padding-bottom: calc(var(--pad) + env(safe-area-inset-bottom))`.

`--nav-h` keeps every other consumer: it is the bar's height on every screen the other
six roles open, at both densities (§3.7.2 explains why its desk value stays alive).

**Stage 1 counts `--nav-h` as being "on ten screens, not fourteen" (`v2-ux.md §4.5`).
I read that count as wrong in a way that does not matter.** The nav appears on all
**twelve** screens; what is true is that it is absent for **two of the eight roles**,
and the one screen those two open (Me) is drawn *with* a nav for the other six. The
token's consumers are unaffected either way, which is presumably why the slip survived
the revision.

#### 3.7.2 Desk: the nav is a left rail, and that is now decided

My §8.2 doubt — that a phone-shaped bottom bar is wrong on a 1024x768 office PC — is
agreed by the revised `v2-ux.md §4.4`, which adds the fact that settles it: **the
supervisor and the owner now hold all twelve screens**, so a six-slot bar leaves
*half the app* permanently one extra tap and one sheet away from the two people who
run the garage. That is the same shape as the defect we are fixing, one tap shallower.

**Decision: the nav is a left rail in desk density, and it is the same component, not
a second primitive.** `.nav` turns:

`flex-direction: column; position: fixed; left/top/bottom: 0; width: var(--rail-w); border-top: 0; border-inline-end: 1px solid var(--line)`,
each item a row (`icon` then label, which is already the desk item's shape), and the
screen gets `padding-inline-start: var(--rail-w)` instead of a bottom padding.

| | |
|---|---|
| **Third new token** | `--rail-w: 160px`, declared in the **desk** density block only |
| Arithmetic | Twelve items at `--tap` 32px = 384px of a 768px column, so every slot fits and **More disappears entirely at desk**. Width: `--pad` 8 + mark 20 + `--s2` 8 + label + `--pad` 8. The longest label is "Fuel & tyres", 12 characters at `--t6` 14px, about 84px Latin; Devanagari runs wider, so 160px leaves 32px of slack rather than 8px |
| Content width | 1024 - 160 = **864px** for the screen. A desk Jobs row needs about 700px for a lead mark, a title, a figure, a badge and a button |
| **The condition** | Rail when the page is `data-density="desk"` **and** the viewport is at least 1024px wide. Both clauses, each for a reason: density is already how this system says "this is a desk screen" and a width-only rule would put a rail on a tablet in landscape, which is also 1024x768; and a desk-density page on a 360px phone (a supervisor opening the office screen on a phone, which `000c3dd` says happens) must not lose 44% of its width to a rail. That case keeps the bottom bar, which is why `--nav-h`'s desk value stays alive |
| Reduced motion, press, focus | Unchanged. The rail does not animate, slide or collapse — see §5.8 |

**This decision does not depend on the placeholder budget, and that is worth saying
because `DECISIONS.md §9` records that the 200-rows-in-250 ms figure came from a
developer's Mac.** A rail changes the width available to a row, not the cost of
drawing one: 200 rows cost the same at 864px as at 1024px, because the work is style
and layout per row, not pixels. So the rail is decidable now and I have decided it.
What the office-PC reading changes is §2.3 — what a desk row is allowed to *contain* —
and if 864px turns out to be too narrow for that content, the thing that gives is the
row's badge, not the rail.

**What would overturn it**, stated so it is falsifiable rather than defended: the
`usage` store counts screen opens per person per day (`03 §2`). If after four weeks a
supervisor's and the owner's opens are concentrated in six or fewer screens, then the
rail is 160px of every desk screen spent on screens nobody opens, and the bottom bar
with More was right. That reading is `v2-ux.md §7` measure 4 run per role, it needs no
new instrument, and it is the same measurement that would prove me wrong about the
twelve screens themselves.

### 3.8 Second-signature state (NEW — composed, no new CSS)

`DECISIONS.md §10` reverses the 15 September decision: **a job closed by anybody now
waits for a second person to verify it, and nobody may sign off their own close —
supervisor, owner, every role, one rule.** So a card has a state it did not have in
the first pass, and `v2-ux.md §4.1` #4 makes it a "must not" on the screen: *a verify
button for the person who closed the card, any person, any role.*

This is a state and a disabled rule, so it belongs here rather than in a screen. It
needs no new CSS and no new token — it is §3.1's row, §3.4's reason row, the existing
badge, and one rule about who sees a button.

**The rule, exactly:** the verify control is **absent** when
`card.closedBy === me.id`, for every role including the owner. Not disabled, not
greyed, not present-and-erroring. This is the same deny-by-default shape as §3.1's
disabled row and §3.7's — a control you may not use is not drawn — and it matches the
filter the live app already has at `app.js:3019` (`closedBy !== S.user.id`), applied
to everyone instead of skipped for supervisors.

**But absent is not silent.** The closer must be told what the card is waiting for,
or they will hunt for the button and then ask somebody. So the card's **one next step**
slot (§3.4's row at the top of the Job card) carries the state for whoever is looking:

| Who is looking | The one-next-step slot holds |
|---|---|
| The person who closed it | A `div.v2row` — **no press, no link** — `lead` = `icon('clock')` in `--warn`, `.t` = "Waiting for sign-off", `.sub` = "Somebody else has to check this card. You closed it." |
| Somebody else who may verify | A `.btn-primary` in the same slot: "Sign off" |
| Anybody who may not verify | The same unpressable row, `.sub` = "Waiting for a supervisor or the owner to check it" |

| State | Specification |
|---|---|
| default | On the card: a `badge badge-warn` beside the status carrying `icon('clock')` and the words **"Waiting for sign-off"**. Never colour alone, and never the word "verified" on a card nobody has verified |
| pressed | Only the "Sign off" button presses (scale 0.97, 120 ms). The waiting row must not press: a row that moves under the thumb and then does nothing is the feedback failure §5.1 exists to prevent, inverted |
| focus | Standard ring on the button. The waiting row is not focusable — it is not a control, so it must not be in the tab order |
| **disabled** | **The verify control is absent, not disabled** (the rule above). The only thing that is ever *disabled* here is the "Sign off" button for the ~200 ms its write is in flight, via `aria-disabled="true"`, reading "Signing off..." |
| loading | While the card's own read is in flight the slot is `skeleton(1)`. It must never draw "Sign off" optimistically and then take it away — on a 30-36 s cold server that is a button a person presses twice |
| empty | A card that is not closed has no second-signature state at all and the slot holds its real next step ("Add the two after photos", "Issue the part") |
| error | A sign-off that fails is `V2.toast(msg, {kind: 'bad'})` and the slot returns to "Sign off". The close itself is already saved, so the message says what is still true: "Not signed off. The card is still closed and still waiting." |
| offline | Sign-off is a local write and works offline, so the button stays. What changes is the card's own freshness line: the queue of cards waiting on somebody else is only as current as the last sync, so the list header says when that was. **A card may already have been verified on another phone** — under whole-record last-write-wins (`v2-ux.md §6`) two people signing off the same card is a conflict, so the Attention row and the card both carry the `at` of the reading, and the copy never says "nobody has signed this off", only "not signed off here yet" |

**On Attention (#2)** the same state is one ranked row kind, and it is the one row kind
that must filter itself out by *identity* and not only by capability: a person's own
closes never appear in their own queue. Mark: `ok`. Reason line: "Closed 2 days ago,
needs a second signature". That is the row-kind-plus-identity case `v2-ux.md §4.3`
warns about; a capability check alone would show the owner their own closed cards.

**Three falsifiable checks** stage 3 owes this state, because a rule nobody can fail
is decoration:

1. Sign in as the closer, open their own closed card, assert **no** verify control
   exists in the DOM — for `supervisor` **and** for `owner`, since the owner is the
   role the old rule exempted by name.
2. Sign in as a second eligible person, open the same card, assert the control is
   there and one tap writes `verifiedBy` and `verifiedAt`.
3. Assert the closer's own closed card is **not** in their Attention queue while it
   *is* in the other person's.

**Noted for stage 3, because it will be compared:** `DECISIONS.md §10` says v1 is
deliberately **not** changed — `selfSignsOff` is live and supervisors are signing off
their own work today. So v1 and v2 differ here on purpose, and a tester moving between
them will see a supervisor verify their own card in one and not the other. That is not
a bug in this spec.

---

## 4. Icons

31 marks exist. `test_ui_icons.js` pins the exact set and caps it at **34**: one path
each on a 24-grid, geometry inside 1..23 so the 1.75 stroke is never clipped,
`currentColor` only, no `<text>`, no font, pure ASCII, no two icons sharing a drawing.

### 4.1 Coverage of the twelve screens

| Screen | Nav mark | Marks inside it | Gap |
|---|---|---|---|
| 1 Today | `home` | every row kind below | none |
| 2 Attention | `alert` | per row kind, see §4.2 | 2 |
| 3 Jobs | `job` | `clock` (idle time), `filter`, `add`, `person`, `map` (away for repair) | none |
| 4 Job card | `job` | `clock` (the four times, and **"waiting for sign-off"**, §3.8), `part`, `camera`, `doc` (gate pass), `person`, `ok` (sign off), `add`, `edit`, `delete`, `bus`, `back` | none |
| 5 Buses | `bus` | `doc` (papers), `clock` (service due), `tyre`, `battery`, `person`, `map` (live position), `warn`, **`challan`** | 1 |
| 6 Store | `part` | `add`, `search`, `doc` (bill), `camera`, `tyre`, `battery`, **`count`** (shelf count vs book), `person` | 1 |
| 7 Money | `money` | `fuel`, `part`, `bus`, `doc`, `clock`, `add` (**the supervisor's trip entry**, `DECISIONS.md §11`) | none |
| 8 People | `person` | `doc`, `star`, `review`, `warn`, `add`, `edit` | none |
| 9 Duty board | **`seat`** | `bus`, `person`, `clock`, and **the whole departure check moved here** (`DECISIONS.md §12`): `gate` (the check itself), `camera` (the three item photos), `me` (the driver's selfie, taken by the supervisor), `ok` / `bad` / `warn` (released / held / waiting) | 1 |
| 10 Fuel & tyres | `fuel` | `tyre`, `battery`, `bus`, `add`, `warn` (falling mileage) | none |
| 11 Reviews | `review` | `star`, `person`, `bus`, `filter`, `search`, `warn` | none |
| 12 Me | `me` | `sun`, `moon`, `doc`, `star`, `review`, `offline`, `clock`, `camera` + `warn` (**"something is wrong with my bus"**, the driver's and conductor's one write) | none |

Two things I checked rather than took on trust:

- **`gate` keeps a consumer and does not free a slot.** It loses its nav slot with the
  Gate check screen, but the mark is still drawn twice: the departure check on Duty
  board (#9) and the awaiting-decision row on Attention (#2).
- **`money` keeps its nav slot** — Money (#7) is now the supervisor's as well as the
  owner's (`DECISIONS.md §5`) — and it also carries the trip entry that used to be
  Trip cash. It is in two navs and two screens.

`map` keeps a named consumer whatever happens to Q9: the bus's live position on
Buses (#5), and "away for repair" on Jobs (#3). Only the full-screen fleet map is
dropped.

**Count, done by hand over the whole set rather than asserted.** All 34 marks have at
least one named consumer among the twelve, so dropping two screens frees nothing and
the cap stays reached:

| Mark | Consumer |
|---|---|
| `home` | #1 nav |
| `me` | #12 nav, #9 the driver's selfie |
| `alert` | #2 nav |
| `job` | #3 nav, #4 |
| `bus` | #5 nav, #9, #2 breakdown pattern |
| `part` | #6 nav, #2 pilferage, #4, #7 |
| `money` | #7 nav, #7 trip entry |
| `person` | #8 nav, #3, #5, #9, #11 |
| **`seat`** | #9 nav, #2 bus with no driver |
| `fuel` | #10 nav, #7 |
| `review` | #11 nav, #12 own reviews |
| `tyre`, `battery` | #10 fitting, #6 piece register |
| `gate` | #9 the departure check, #2 awaiting a decision |
| `more` | the supervisor's and owner's More tab at yard width (§3.7) |
| `star` | #11 ratings, #12 own rating |
| `map` | #5 live position, #3 away for repair |
| `warn` | #2 unsafe report, #10 falling mileage, #12 "something is wrong with my bus" |
| `ok` | #2 awaiting a second signature, #9 released, #4 sign off, `badge-ok`, the Done toast |
| `bad` | #9 held, `errorState()`, the Error toast |
| `clock` | #3 idle time, #4 the four times and "waiting for sign-off", every `figure` note |
| `search` | #5, #6, #11 |
| `filter` | #3, #11 |
| `add` | #3 new job, #6 receive, #7 trip entry, #10 |
| `edit` | #4, #8 |
| `delete` | #4, owner deletes a mistaken card |
| `back` | #4, the Job card under the Jobs tab |
| `camera` | #4, #9, #6, #12 |
| `doc` | #4 gate pass, #5 papers, #2 expiring, #6 bill, #12 own documents |
| `sun`, `moon` | #12 the light/dark choice, which is a row on Me for every role |
| `offline` | #12 device state, `offlineState()`, an unsent photo |
| **`challan`** | #2 unpaid challan, #5 per-bus liability |
| **`count`** | #6 shelf count, #2 unexplained stock change |

### 4.2 Attention's row kinds, which is where the gaps are

Attention puts nine row kinds in **one list**. Two marks in one list meaning two
different things is the exact mistake `icons.js` records fixing when a cog did both
"fit tyres" and "fit batteries" — so each kind needs its own mark:

| Row kind | Mark |
|---|---|
| Departure check awaiting a decision (the check itself is on Duty board, the decision is here, where the decider already looks) | `gate` |
| **Work awaiting a second signature** — never the reader's own closes, for any role including the owner (`DECISIONS.md §10`, §3.8) | `ok` |
| Document expiring or expired | `doc` |
| Unpaid challan | **`challan`** (new) |
| Unexplained stock change | **`count`** (new) |
| Pilferage flag | `part` |
| Open unsafe driver report | `warn` |
| Breakdown pattern | `bus` |
| Bus with no driver | **`seat`** (new) |

### 4.3 The three new marks

Each is one path string, one `d`, geometry inside 1..23, in the house style (1.75
stroke, `currentColor`, round caps and joins). Added to `ICONS` in `ui/icons.js` and
to `REQUIRED` in `test_ui_icons.js`.

All three path strings were run against `test_ui_icons.js` in a scratch copy before
being written here: **30 checks pass**, including the 1..23 safe area, one path per
mark, no two marks sharing a drawing, and the set at exactly 34.

**`seat`** — a seat seen from the side: a back, a cushion, a base, two legs. It is a
*place on a bus*, which is what the duty board fills, and it cannot be mistaken for
`person` (People, one tab along in the crewmanager's nav) or `bus`.
`M7 4h2.6a2 2 0 0 1 2 2v7H7z M7 13h10a2 2 0 0 1 2 2v2H7z M7.6 17v3 M18.4 17v3`
Bounds x 7..19, y 4..20.
*Consumer:* Duty board (#9) nav slot and its three seats per bus; the "bus with no
driver" row on Attention (#2).

**`challan`** — a ticket: a rectangle pinched on both sides, a perforated stub line,
two lines of writing. It is a *notice with a number and a sum*, and it must not be
`doc`, which in the same Attention list means a bus paper expiring.
`M3.4 7.6h17.2v3a1.6 1.6 0 0 0 0 3.2v3.6H3.4v-3.6a1.6 1.6 0 0 0 0-3.2z M8.6 7.6v9.8 M12.4 11.2h5 M12.4 14h3`
Bounds x 3.4..20.6, y 7.6..17.4.
*Consumer:* the unpaid-challan row on Attention (#2); the per-bus liability card on
Buses (#5), where the check action must show what a lookup costs before it is pressed
(each one spends a billable credit).

**`count`** — a balance: a post, a beam, two pans. It means *the shelf against the
book*, which is the one thing the storekeeper's count is, and it is not `part` (a
cog, which on Attention means pilferage).
`M12 3.6v16.8 M8.4 20.4h7.2 M4.6 7.2h14.8 M4.6 7.2 2 13h5.2z M19.4 7.2 16.8 13h5.2z`
Bounds x 2..22, y 3.6..20.4.
*Consumer:* the shelf count and the trust number on Store (#6); the unexplained
stock-change row on Attention (#2).

### 4.4 The cap is now reached, and that is a finding

31 + 3 = **34**, which is exactly `test_ui_icons.js`'s ceiling, chosen to hold the
"~25 inline SVGs" of `DECISIONS.md §3`. **Stages 3 to 5 have no headroom.** A 35th
mark is a decision, not a commit: either the owner raises the cap or a mark comes out.
Do not quietly edit the number — the cap is the only thing standing between 31 icons
and the 968 emoji this rebuild exists to delete.

This is also why the number entry (§3.3) has **no stepper buttons**: a minus mark
would have been a fourth icon, and `v2-ux.md` never asks for steppers. A plain
numeric field with the device keypad is fewer parts, fewer taps, and no icon.

**Never:** an emoji (Windows 7 renders grey boxes — this is the single most
frequently cited fact in the whole repo), an icon font, a `<text>` element, a sprite
sheet, an `<img>`, or a glyph standing in for a mark. `screens.css` keeps the
U+25B2/U+25BC trend arrows because Windows 7 does carry those two and the direction
is also stated in colour; that is the only exception in the system and it is not
extended.

---

## 5. Motion

Only `transform` and `opacity`. Nothing over 300 ms. `ease-out` both ways — a bare
`ease-in` withholds movement in the moment the user is watching, and
`test_ui_components.js` fails on the string. No `@keyframes`, so a toast asked for
again halfway through leaving reverses from where it is. No `@starting-style` (Chrome
117): entering uses the `data-mounted` pattern.

### 5.1 Press feedback — exists

| | |
|---|---|
| What moves | Every pressable: `.btn`, `[role="tab"]`, `button.v2row`, `a.v2row`, the nav item, the photo tile, the capture label |
| Property | `transform: scale(0.97)` |
| Duration / easing | 120 ms `ease-out` |
| **Why** | The office machines took 884 ms per tap before dirty-store tracking, and still take hundreds of milliseconds to draw a screen. A control that gives no feedback reads as broken on a slow machine, and the person taps again — which on an issue sheet is two parts off the shelf. This is the one animation the product cannot do without |

### 5.2 Sheet enter and exit — exists

Enter `transform: translateY(var(--s8)) -> none` with `opacity: 0 -> 1`, 250 ms
`ease-out`; exit 180 ms. **Why:** it arrives from the edge it is anchored to, so its
direction is its dismissal. The distance is a token, so a desk sheet moves less than
a yard one. Nothing scales from nothing.

### 5.3 Confirmation enter and exit — exists

Enter `scale(0.95) -> none` + opacity, 200 ms `ease-out`; exit 150 ms.
`transform-origin: center`, because a modal is not anchored to a trigger. **Why:** a
destructive question must not appear in the same instant as the tap that asked for
it — the half-second is the point. Exit is faster than enter: slow where the person
is deciding, fast where the system is responding.

### 5.4 Scrim — exists

`opacity: 0 -> 0.5`, 200 ms in, 150 ms out, on `--accent-ink`. **Why:** the page
behind is inert; the scrim is the only thing that says so.

### 5.5 Toast enter and exit — exists

Enter `translateY(var(--s2)) -> none` + opacity, 200 ms; exit 150 ms. **Why:** a
message that appears without transition reads as a redraw, which on this app's
history means "something broke".

### 5.6 PIN dots — exists, and is the system's one deviation

`login.css` transitions `background-color` and `border-color` over 120 ms on four
10px dots. That is not a compositor property. It **stays**: four ten-pixel boxes on a
screen with nothing else on it, once per digit, and the login is the most
abandonment-sensitive moment in the product (30-36 s on a cold server for the three
roles whose PIN is never cached). **No new component may do this**, and
`test_ui_components.js` enforces it for `components.css`, where every primitive
above lives.

### 5.7 Departure check, hold to release — NEW, and the one exception to the ceiling

**The spec does not move; the person in it does.** `DECISIONS.md §12`: the ten items,
the three photos, the 1.5-second hold and the driver's selfie all stay, and **the
supervisor** performs the check and photographs the driver at the gate. It is a state
of Duty board (#9), not a screen of its own.

| | |
|---|---|
| What moves | An overlay inside the hold button: `--accent-ink` at 0.25 opacity over `.btn-primary`, so the button darkens left to right |
| Property | `transform: scaleX(0 -> 1)`, `transform-origin: left` |
| Duration / easing | **1500 ms `linear`** |
| Release before it completes | `scaleX` back to 0, 150 ms `ease-out` |
| Reduced motion | The bar does not move: `opacity: 0 -> 1`, 1500 ms `linear`, on the same overlay |
| **Why** | The 1.5 s hold is not decoration, it **is** the control ([E] `8a8cde5`): a bus must not be released by a palm brushing a screen in the dark. Without a growing bar the person lifts early, the check does not release, and a bus is standing at the gate with nobody knowing why. Linear because the bar is a clock, not an easing |

**Two things change with the person, and both are specified rather than assumed:**

1. **It can now happen at a desk.** The supervisor may be on a phone at the gate or at
   the office PC, so the hold target is `min-height: var(--tap)` in **both** densities
   — 48px yard, 32px desk — and the bar is the full width of the button at either. A
   1.5 s hold with a mouse is unusual and that is deliberate: the hold is the same
   deliberate act whoever is doing it.
2. **It is now repeated.** One supervisor may check out twenty buses in an evening,
   and §5.8's rule is that a frequently repeated action does not animate. **The bar
   stays, and the rule is not broken**, because the bar is not motion laid over the
   action — it is the action's own readout, and removing it would not make the action
   one millisecond faster: the 1.5 seconds are mandatory either way. If twenty holds a
   night turns out to be the wrong price, the thing to revisit is the **1.5 seconds**,
   which is the owner's decision and `DECISIONS.md §12` has just confirmed it, not the
   bar that reports them.

**Where it may live:** the Duty board screen's own stylesheet, **not**
`components.css`. The 300 ms ceiling there is proved by a test over the whole file,
and it exists to stop *decorative* motion costing frames on a Core 2 Duo. This is one
composited layer on one element. Putting it in `components.css` would mean weakening a
check that guards 923 lines to admit one exception — which is how ceilings stop
meaning anything.

### 5.8 What does not animate, and why

| Not animated | Why |
|---|---|
| **Screen change / navigation** | The most repeated action in the app, and the budget for it is 250 ms **total**. An animation spends the budget it is supposed to hide |
| **Nav active bar, tab and filter switches** | Tens of times a day each. A 200 ms slide on the thing you press most makes the app feel slower than it is |
| **List insert, remove, reorder** | A sync tick applies records every 4 s. An animated 200-row desk list would be in motion permanently, and the reorder is the information — a bus moving up the oldest-first list is a fact, not a transition |
| **Figure updates** | `tabular-nums` exists precisely so digits do not shift as they update. A number that animates cannot be read, and these numbers are read against each other |
| **Skeleton** | Deliberately static. A looping shimmer cannot stay under 300 ms without strobing and costs frames on the oldest PCs; the word "Loading" and `aria-busy` carry the state |
| **Photo tiles appearing** | They arrive from a camera roll, sometimes twenty at once. Twenty staggered entrances is a slideshow |
| **Stagger of any kind** | Named here because the craft literature recommends it: a staggered list is 50 ms x n of deliberately withheld content on a machine that already takes 798 ms to boot. Not in this product |
| **Toast stacking** | At most three, each already transitioned on its own |

**If you cannot name the purpose, leave it out.** Three animations were considered and
are out for exactly that reason: a sheet-to-sheet crossfade (purpose: none — the
sheets are different sheets); a blur during a button's state change (purpose: masking
an imperfect crossfade the office PCs cannot afford to composite); a spring on the
nav bar (purpose: none, and springs need a per-frame loop, which is JavaScript, which
is the expensive thing here).

### 5.9 Reduced motion

Already in `components.css` and extended only by §5.7: `prefers-reduced-motion:
reduce` removes every movement and keeps the acknowledgement as `opacity` — a press
becomes `opacity: 0.8`, the sheet and confirmation fade without moving, the toast
fades. Reduced motion means gentler, not absent: the person still has to be told the
interface heard them.

---

## 6. Copy

The reader is standing up, has ninety seconds, and may not read English first. Hindi
is first-class, not a layer (`spec §4.2`).

### 6.1 Voice

| Rule | Instead of | Write |
|---|---|---|
| A button is the verb the person would say out loud | "Submit" | "Issue part" |
| Say the thing, not the record | "Create jobcard entry" | "New job card" |
| Never a word that exists only inside the app | "Sync pending", "payload refused" | "Not sent yet" |
| Seven words maximum on a button, twelve in a row title | | |
| The number first where the number is the point | "You have 4 buses standing" | "4 buses standing" |
| No exclamation marks, no "Oops", no "Please", no cleverness | "Oops! Something went wrong :(" | "Could not save" |
| Never blame the reader | "Invalid odometer" | "Lower than the last reading, 48,210 km" |
| An error says what happened, what is kept, and the one next thing — three clauses, no more | | "Not sent. The count is saved on this phone. It will send when there is signal." |
| A figure with no value is a dash and says "No data"; a real zero is 0. Never the same | | `states.js` already enforces this; do not format before calling `figure()` |
| Price a thing before the person presses it | "Check challans" | "Check challans (uses 1 credit)" |
| An empty state names **which** empty it is | "No data" | one of the five in §6.2 |

### 6.2 The five empty states, because silence has had eight causes

`v2-ux.md §6` and `05 §3` row 4: "everything exists, just no data" has had at least
eight distinct causes and the user saw silence every time. A v2 screen with nothing
on it must say which one it is:

| Which | Primitive | Words |
|---|---|---|
| Still filling | `skeleton(n)` | "Loading" — and a figure that is still filling must **never** be drawn as final ([E] `2170703`) |
| Nothing to show | `emptyState()` | "No cards away for repair" — name the filter or the question that was asked |
| This device could not save records | `errorState()` + the Me screen | "3 records could not be saved on this phone. Open Me to see them." |
| Held for another person | `emptyState()` | "Waiting for the supervisor to sign off" — say who, so the reader stops waiting on the app |
| No signal since a stated time | `offlineState()` | "No connection. What you see may be out of date." plus the time |

### 6.3 Hindi: the defect, its cause, and the rule that prevents it

**The named defect** ([E] `GO_LIVE` "Still open"): Trip cash was **English-only in
Hindi mode**, on a screen for the largest role.

**That screen is gone, and the defect it was evidence of is not.** `DECISIONS.md §7`
says drivers do not use their logins, so — as that decision itself asks stage 1 to say
out loud — if no driver ever opened Trip cash then **that defect was never costing the
hours it was ranked for**, and its place in the friction ranking was wrong. I am not
keeping the estimate. What I am keeping is the *mechanism*, because the mechanism is
untouched and it now points somewhere worse: the two roles most likely to read Hindi
only, and least likely to read English, now have **one screen that is their whole app**
(Me, #12, `DECISIONS.md §7`). A silent English fallback there is not a screen stuck in
the wrong language; it is the entire application in the wrong language, for the only
people who have no second screen to fall back to.

**The cause is a mechanism, not an oversight,** and it is written down in the
dictionary itself. `i18n-hi.js` line 8: *"Until it arrives `t()` falls back to
English, which is exactly what it already did for any key Hindi was missing."* A
missing translation is indistinguishable from a present one until a Hindi reader
opens the screen. Nothing fails. Nobody is told.

**And the foundation has the same hole today.** `states.js` and `overlay.js` hold
**21 English string literals** and `states.js` says so in its own header ("English
only for now... Wiring the fixed words to the app's translator is a migration step,
not done here"). Every one of them is drawn on all twelve screens. So this is the
foundation's one real defect, and fixing it is foundation work, not screen work.

**The change.** One table, `ui/words.js`, in the shape of the other `ui/` files (ES5,
one global, no dependencies). It holds these 21 ids and nothing else:

`nothingToShow`, `somethingWrong`, `retry`, `reloadToRetry`, `offline`,
`offlineHint`, `loading`, `noData`, `updatedAgo`, `justNow`, `minutesAgo`,
`hoursAgo`, `daysAgo`, `mayBeOld`, `timeUnknown`, `close`, `confirm`, `cancel`,
`toastOk`, `toastWarn`, `toastBad`.

- `states.js` and `overlay.js` read every fixed word through one lookup, `w(id, n)`;
  `n` selects between an id's `one` and `other` forms (English pluralises
  "1 minute ago" / "3 minutes ago"; Hindi takes one form).
- The language is the document's own: `:lang(hi)` already drives `--font-hi` and
  `--lh: 1.7` in `components.css`, so the word table reads the same source.
- Hindi values come from `i18n-hi.js` where an equivalent key already exists
  (`cancel`, `save`, `refusedRetry` are three), and from the owner otherwise.
- **A missing Hindi value is a build error, not an English fallback.** This is the
  whole rule. The fallback is the defect: it is what let a whole screen stay English
  with every test passing.

**Three falsifiable checks** (stage 3 adds them; "a check that cannot fail is
decoration"):

1. **Key parity.** Every one of the 21 ids has both an `en` and a `hi` value. Fails
   on the first missing one, naming it.
2. **No English in Hindi chrome.** Render each primitive with the document language
   set to Hindi and assert that no *fixed* string matches `/[A-Za-z]/` — caller text
   and digits excepted. This is the check that would have caught Trip cash.
3. **No literal escapes the table.** A quoted, capitalised English word inside
   `ui/*.js` outside `words.js` fails the build. Without this, the 22nd word gets
   hard-coded and the first two checks pass while the screen is wrong.

Two further carried rules, because they are copy as much as permission: the
conversation log's words must never reach the person they are about ([E] `4a42e38`),
and `office` never receives passenger journey fields ([E] `bd11e75`) — so no label on
Reviews (#11) may name a PNR, a seat, a fare or a board point for that role.

---

## 7. What a builder may not change, and what they may

### 7.1 May not

1. **Token names and values.** Reuse all 30. Each hue's lightness is tuned
   separately for contrast; regularising them breaks `test_ui_tokens.js`.
2. **The `[data-v2]` scope.** Every selector starts with it. A bare `:root` flips the
   live app's `--accent-ink` to its opposite meaning mid-migration.
3. **No colour literal in a component.** `hsl()`/`hsla()` tokens only. No hex, no
   `rgb()`, no keyword, not `transparent`, not `currentColor` as a new colour.
4. **The Chrome 109 floor.** No `oklch()`, `color-mix()`, nesting, `@starting-style`,
   view transitions, `subgrid`, `@scope`, relative colour, `light-dark()`,
   `text-wrap: balance`, `Object.groupBy`, `toSorted`, `Promise.withResolvers`.
5. **`transform` and `opacity` only, under 300 ms, never a bare `ease-in`** — with
   the one named exception in §5.7, which lives outside `components.css`.
6. **No emoji, no icon font, no webfont, no `url()`.** Inline SVG, `currentColor`,
   one path, inside 1..23.
7. **`.v2row`, not `.row`.** And `ov-` on every overlay class. The live app owns
   those names and a page holds both files for the whole migration.
8. **The overlay API is `V2.*`.** Attaching bare `openSheet`/`toast` replaces the
   live app's functions for every call site that has not migrated yet.
9. **Status is never colour alone.** Every badge, figure note, toast and gate state
   carries a word and a mark too.
10. **Unknown, zero and stale are three different figures.** Pass the raw value and a
    `format` function to `figure()`; never format first.
11. **A number entry never navigates on tap** (§3.3), and the two existing gate
    checks stay.
12. **No fixed English word outside `words.js`** (§6.3).
13. **No new field on any record.** `v2-ux.md §6`: under whole-record
    last-write-wins, a field v2 invents is erased the next time a v1 device writes
    that record.

### 7.2 May

1. **Compose freely.** Rows inside cards, tabs above lists, sheets from anywhere —
   the primitives are meant to be assembled without asking.
2. **Add a screen-level stylesheet** for layout that belongs to one screen, the way
   `login.css` does, keeping the `[data-v2]` prefix and sizing from tokens.
3. **Choose each screen's density**, and nest a desk container inside a yard page —
   `tokens.css` supports it explicitly.
4. **Choose the words**, inside §6, in both languages.
5. **Choose each list's order, filters and caps**, inside §2.
6. **Tighten the 200-row threshold** once the office PC has been measured — and that
   is an instruction, not a permission (§2.2).
7. **Use `px` in a `border`, `outline` or `box-shadow` value**, and the three
   existing radii (8px controls, 12px panels, 999px pills).
8. **Reject anything here that a measurement contradicts.** Every number above either
   comes from a measured source or shows its arithmetic; a reading from an office PC
   beats all of it. Say so in the stage-3 report rather than working around it.

---

## 8. Status

**ok = true.** I did not halt and I did not decide anything that is the owner's.

### 8.1 The answers, checked against this document

The first pass claimed nothing here turned on Q1, Q2 or Q3. They are answered now, so
the claim is checkable rather than a promise:

| Answer | What it did to the foundation |
|---|---|
| **Q1 / Q2 — a supervisor DOES reconcile cash; the 2 Nov decision is reversed** (`DECISIONS.md §5`) | **Nothing.** Money (#7) gains a role and a nav slot. `money` was already in the owner's nav; it is now in the supervisor's too. No token, icon, motion or copy rule moved |
| **Q3 — mechanics have phones and may record their own start and finish** (`§6`) | **Nothing.** Two `.btn-primary` buttons on the Job card, already specified with all eight states |
| **Q5 — drivers and conductors do not use their logins** (`§7`) | **The one real hit.** Two screens went, two nav rows became one slot each, and **"empty: cannot occur" in §3.7 turned out to be false** — which is why that row now carries the correction rather than a quiet rewrite. `--nav-h`'s consumers survived; `--thumb`'s moved screens; `camera`, `me` and `gate` kept consumers |
| **Q8 — tonight's running list is a register in the office** (`§8`) | **Nothing.** Duty board gains a daily pick; `seat` keeps its slot and its row kind |
| **§10 — a supervisor's closed work needs a second signature** | **One new state**, §3.8, composed from the existing row, badge and button. No new CSS, no new token, no new icon |
| **§11 — the supervisor records trip cash** | **Nothing new.** The number entry (§3.3) was already specified with a decimal kind; it moves from Trip cash to Money |
| **§12 — the departure check keeps everything, selfie included** | **Nothing but the person.** §5.7's reason, property, duration and easing are unchanged; it is now performed at a desk as well as at a gate, and by somebody doing it twenty times an evening, so both of those are now specified |

Still open and still harmless to this document: **Q4** (is crew pay money or people —
it decides whether salary appears on People #8, which is rows of existing primitives),
**Q9** (`map` keeps a consumer on Buses #5 regardless), **Q10** (whether attendance
decides wages — it decides whether the driver's and conductor's logins survive at all,
and §3.7.1 is written so that if they go, one screen and no nav goes with them),
**Q12** (who reads Hindi only — §6.3 is the mechanism, and the mechanism is needed
whoever the readers turn out to be).

### 8.2 The three specifications most likely to be wrong

1. **The 200-row desk budget is not a measurement yet.** The 250 ms threshold is a
   placeholder set on a developer's Mac, and the gate says so itself. Every density
   decision in §2 — the one-line desk row, the no-`at`-in-a-row rule, windowing at
   200, Attention's 200-row cap — is sized against a number nobody has taken on a
   Core 2 Duo. If the office PC comes back at 700 ms, the desk row loses its badge
   and its figure before it loses anything else, and §2.3 becomes the most important
   page in this document rather than a checklist.
2. **The rail is 160px of a 1024px screen and I have not seen a desk row at 864px.**
   This replaces the first pass's doubt, which was "the bottom nav may be the wrong
   shape for the desk" — stage 1 agreed, the supervisor now holds all twelve screens,
   and §3.7.2 decides it: a rail at desk density and 1024px or wider. The doubt moves
   rather than disappears. A desk Jobs row carries a lead mark, a title, a figure, a
   badge and a button, and I have specified it at 864px from arithmetic, not from
   looking at it. If it is too narrow, §2.3 says what gives (the badge, then the
   figure), but it is the rail that caused it. The reading that would overturn the
   rail itself is in §3.7.2 and it is the same `usage` counter as item 1's budget is
   not: **the nav decision does not depend on the 200-row measurement**, because a
   rail changes a row's width and not the cost of drawing one.
3. **`count` and `challan` may be marks nobody reads.** A balance meaning "the shelf
   against the book" and a ticket meaning "a fine" are both idioms, and I have no
   evidence a storekeeper or an owner reads either at 20px. The alternative was to
   reuse `part` and `doc` and let two row kinds in one Attention list share a mark,
   which `icons.js` records as a mistake already made once. Both carry words beside
   them, so being wrong costs recognition speed and not meaning — but they also spent
   the last two slots under the 34-icon cap, which is the part that would be
   expensive to undo.

### 8.3 What moved when fourteen became twelve

Kept here rather than smoothed away, so the next reader can see what a product change
costs a foundation. **Nothing in §1.1 (the 30 existing tokens), §1.3 (zero new
colours), §2 (density), §4.3 (the three new marks) or §6.1–6.2 (the voice) moved at
all.**

| Moved | From | To |
|---|---|---|
| Nav slots | driver 4, conductor 2 | **1 each, so no nav at all** (§3.7, §3.7.1) |
| A nav's `empty` state | "cannot occur" | the corrected row in §3.7, and §3.7.1 |
| The nav's desk shape | undecided, flagged as a doubt | **decided: a left rail** (§3.7.2), with `--rail-w` as a third token |
| `--thumb`'s consumers | Gate check #11, Me #14 | Duty board #9, Me #12 |
| The hold-to-release bar | Gate check #11, a driver, a phone | Duty board #9, **the supervisor**, phone or desk (§5.7) |
| The number entry's decimal kind | Trip cash #13 | Money #7, the supervisor's trip entry |
| Icon coverage | 14 rows | 12 rows, plus a by-hand check that all 34 marks still have a consumer (§4.1) |
| The Hindi argument | "the defect is on Trip cash" | "the mechanism now threatens Me, which is two roles' whole app" (§6.3) |
| — | — | **New: §3.8, the second-signature state** |

### 8.4 What I think is wrong in `v2-ux.md`

**One thing**, and it is small:

1. **`§4.5` counts `--nav-h` as being "on ten screens, not fourteen".** The nav is on
   all **twelve**; what is true is that it is absent for **two of the eight roles**.
   The token's consumers are the same either way, which is probably why the slip
   survived the revision. Argued in §3.7.1.

Three things I went looking for and will not report as wrong, because they hold:

- **Me as two different screens.** I expected `§4.1` #12 to hide the fork between "a
  tab among six" and "a whole app with no nav". It does not — the row says "all 8 —
  and for driver and conductor it is **the whole app**" and points at `§3.4`. The
  foundation's half of that fork is §3.7.1.
- **The supervisor's path to the departure check.** They perform it nightly at a gate
  on a phone, and `§4.4` gives them no Duty board tab at yard width, which looked like
  a timed task buried behind a More sheet. But `§4.1` #1 puts "tonight's unchecked
  departures" on the supervisor's **Today**, so the path is one tap from the screen
  they land on. Nothing to fix. Worth knowing that `§4.4`'s falsifiable check cannot
  tell "reachable" from "reachable in one tap", and that it is Today's content rather
  than the nav that is carrying this one.
- **The friction ranking.** `DECISIONS.md §7` asks stage 1 to say that the Trip cash
  Hindi defect was not costing the hours it was ranked for if no driver opened it, and
  `v2-ux.md` now says so. §6.3 matches that rather than keeping the dead estimate
  alive as the foundation's justification.

**Written to:** `docs/v2/plan/v2-foundation-ui.md`
**Gates:** `python3 scripts/check-floor.py v2 ui` green (10 files);
`node test_ui_tokens.js` green (25 checks). The three new icon paths were run against
`test_ui_icons.js` in a scratch copy: 30 checks green, set at exactly 34.
**Next:** stage 2b — the twelve screens.

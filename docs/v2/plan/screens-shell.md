# Garage Saathi v2 — the shell, Today (#1), Attention (#2), Me (#12)

Stage 2b of the pipeline (`docs/v2/PIPELINE.md`). Three of the thirteen screens of
`docs/v2/plan/v2-ux.md §4`, plus the frame all thirteen live in.

**Input read in full before a line of this was written:** `docs/v2/plan/v2-ux.md`
(1051 lines, stage 1, final), `docs/v2/plan/v2-foundation-ui.md` (1223 lines, stage 2a,
final — **consumed, not changed**), `docs/v2/DECISIONS.md` (14 decisions, including
§14, which arrived while this was being written), `docs/v2/inventory/01-screens-and-nav.md`,
`docs/v2/inventory/02-roles-and-permissions.md`, `docs/v2/inventory/05-user-needs.md`,
and the source the foundation points at: `v2/ui/tokens.css`, `v2/ui/components.css`,
`v2/ui/states.js`, `v2/ui/overlay.js`, `v2/ui/icons.js`, `v2/ui/screens.css`,
`v2/ui/login.css`, `v2/pullapply.js`, `v2/sync.js`.

**`DECISIONS.md §14` changes every path in the foundation.** v2 owns its own copy of
the design system at **`v2/ui/`**, byte-identical to `ui/` today (verified: `diff -q`
is silent on `tokens.css`, `components.css`, `states.js`). Everywhere the foundation
says `ui/x`, this document means `v2/ui/x`. Nothing here edits `ui/` or `v2/ui/`.

**`DECISIONS.md §15` arrived while this was being written and changes three things
here.** Duty board splits in two — **#9 Duty board** (`assignDriver`) and **#13 Gate
round** (`gateCheck`) — so there are thirteen screens and **twelve nav destinations**
(the Job card still shares the Jobs tab). What moved in this document: the rail's
length and order (§1.3), the owner's and supervisor's More sheet (§1.3), the
supervisor's Today block 2 and the crew manager's block 2 (§2.3), and the destination of
Attention's row kinds 1 and 9 (§3.2). Nothing else: no token, no icon, no state, no copy
id. The split is also what makes the foundation's rail arithmetic right — see §6.1.

**`LIVE-ISSUES.md` issue 7 also arrived** — `GET /uploads/<name>` authenticates
nothing, so an upload URL is a capability URL with no revocation, and crew identity
documents and attendance selfies are behind it. Three of Me's blocks hand out such a
URL. §4.7 says what this spec does about it, which is narrow and honest: it stops the
interface widening the leak, and it does not pretend to close it.

**Gate:** `python3 scripts/check-floor.py v2 ui` — green, 20 files checked, 0
violations. Nothing specified below would be rejected by it: no `oklch()`, no
`color-mix()`, no nesting, no `@starting-style`, no view transitions, no `subgrid`, no
`@scope`, no `text-wrap: balance`, no `Object.groupBy`, no `toSorted`, no
`Promise.withResolvers`, no emoji, no arrow or dingbat characters in any shipped
string. The two characters `screens.css` keeps (U+25B2 / U+25BC, the trend arrows) are
outside the checker's emoji ranges and are used in exactly one place below (the owner's
cost tile), as `.schip` already draws them, with the direction also stated in colour.

---

## 0. What this document is, and what it is not

### 0.1 Scope

| In | Out |
|---|---|
| The app frame: header, scroll container, nav, safe areas, density, route display | The ten other screens (Jobs, Job card, Buses, Store, Money, People, Duty board, Gate round, Fuel & tyres, Reviews) |
| Today (#1), all six roles that have it | Any application HTML, CSS or JS. **This is a spec. Not one line of `v2/ui/` or `v2/` is touched** |
| Attention (#2), nine row kinds, scoped individually | New tokens, new icons, new colours, new motion rules. The foundation is final and I consume it |
| Me (#12), both shapes: a tab among six, and the whole app for two roles | The server's read boundary. Named where it blocks a control (§4.4, §3.7), never specified |
| The signed-out state, the first-load state, the offline indicator | URL routing and deep links — stage 1 §2.1 puts them out of scope and §1.7 below depends on their absence |

### 0.2 Tokens used

**All 33 names, no additions.** 30 from `v2/ui/tokens.css`, 3 from the foundation
§1.2 (`--nav-h`, `--thumb`, `--rail-w`), which stage 3 declares in `v2/ui/tokens.css`
when it builds the nav. Values are quoted from the file so a builder never has to look
them up to check an arithmetic.

| Token | Value (yard / desk) | Where these three screens and the shell use it |
|---|---|---|
| `--ink` | `hsl(30 20% 9%)` / dark `hsl(35 25% 94%)` | Every row title, every figure value, the header title |
| `--ink-dim` | `hsl(30 8% 34%)` | Every `.sub`, every `.kpi-l`, the lead mark, the freshness note, the nav's inactive item |
| `--surface` | `hsl(40 22% 96%)` | The page, the nav bar, the rail |
| `--surface-raised` | `hsl(40 30% 99%)` | Every `.card`, every sheet panel, the toast, the desk row hover fill |
| `--line` | `hsl(38 12% 80%)` | The row hairline (inset shadow, no height), card borders, the tab strip, the nav's top edge, the rail's inline-end edge |
| `--accent` | `hsl(16 88% 54%)` | The focus ring everywhere; the active nav bar (2px); the scrim at 0.5 is `--accent-ink`, not this |
| `--accent-ink` | `hsl(24 70% 8%)` | Text on `.btn-primary` (Check in, Sign off, Ask); the sheet scrim at 0.5 |
| `--accent-text` | `hsl(16 71% 35%)` | The active nav item, the selected filter tab, every `.btn-quiet` ("See all", "No signal") |
| `--ok` | `hsl(147 63% 28%)` | Attention's `ok` mark on a second-signature row; `badge-ok`; Me's "Sent" state |
| `--warn` | `hsl(38 93% 28%)` | Attention's band-3 marks; `figure-note-stale`; the "Waiting for sign-off" badge; the offline button |
| `--bad` | `hsl(5 67% 43%)` | Attention's band-1 and band-2 marks; `errorState()`; `badge-bad` ("Not sent") |
| `--font` | system stack | Everything Latin |
| `--font-hi` | `"Nirmala UI", "Segoe UI", Mangal` | Every screen under `:lang(hi)`. **Me is the whole app for two roles, so it is the first place Hindi has to be right** (foundation §6.3) |
| `--s1` | `4px` | The nav item's icon-to-label gap; `.badge` padding-block |
| `--s2` | `8px` | `.act` gap; `.kpi` internal gap on desk; the header's trailing-slot gap; the offline line's icon gap |
| `--s3` | `12px` | Gap between cards; `.v2row > .lead` margin-inline-end; `.kpirow` gap |
| `--s4` | `16px` | `--pad` at yard: the scroll container's side gutter, every card's padding |
| `--s5` | `20px` | The gap between Today's figure block and its first card |
| `--s6` | `24px` | The top padding of the body under the header; `.state`'s own padding is `calc(var(--pad) * 2)` and is not re-stated |
| `--s7` | `32px` | The gap between Me's last card and the end of the scroll, so Logout is never flush against the nav |
| `--s8` | `48px` | The sheet's enter distance. Used by every sheet these screens open; never set by hand |
| `--tap` | `48px` / `32px` | Every control's `min-height`; the header's own height arithmetic |
| `--row-h` | `56px` / `32px` | Every `.v2row`; the nav item at desk; the header's min-height floor |
| `--pad` | `--s4` / `--s2` | The side gutter and every card's padding, at both densities |
| `--t1` | `36px` / `30px` | **Not used by these four surfaces.** Named so nobody thinks it was forgotten |
| `--t2` | `28px` / `24px` | The owner's four figures (`.kpi-v`) |
| `--t3` | `22px` / `20px` | The header title; Me's greeting name (`.greet-hi`) |
| `--t4` | `18px` / `17px` | Every card heading (`.card h3`); Attention's `figure` in `.act` via `.trow .tc` sizing |
| `--t5` | `16px` / `15px` | Body: every row title, every button, every field |
| `--t6` | `15px` / `14px` | Every `.sub`, `.kpi-l`, `.figure-u`, `.figure-note`, `.badge`, the nav label |
| `--nav-h` | `56px` / `44px` | The bottom bar, and the scroll container's bottom padding (§1.5) |
| `--thumb` | `72px` / `56px` | Me only, of these three: the check-in face and the "something is wrong with my bus" photo |
| `--rail-w` | — / `160px` | The left rail at desk (§1.3.2) |

**No token is added and none is redefined.** Every size below is one of the above, a
`calc()` of them, a `px` literal inside a `border`, `outline` or `box-shadow` value
(permitted, `PX_OK_PROP`), or one of the three existing radii (8px controls, 12px
panels, 999px pills).

### 0.3 Primitives used, and the three the shell needs that do not exist

| Primitive | Source | Used here for |
|---|---|---|
| `.v2row` + `.lead` / `.txt` / `.t` / `.sub` / `.act` | `v2/ui/components.css` | Every list row on all three screens |
| `.v2row.v2row-why` | foundation §3.4 (new, ~12 lines CSS) | Every Attention row; Today's top-of-Attention rows |
| `.card`, `.card h3`, `.ptitle` | `v2/ui/screens.css` | Every block on Today and Me |
| `.kpirow`, `.kpi`, `.kpi-ic`, `.kpi-l`, `.kpi-v`, `.kpi-u` | `v2/ui/screens.css` | Today's figure block |
| `.schip.ok` / `.schip.crit` | `v2/ui/screens.css` | The one trend, on the owner's cost tile |
| `.drow`, `.drow-i`, `.drow-l`, `.drow-v` | `v2/ui/screens.css` | A fact inside a card: Me's device facts, Me's attendance rows |
| `.greet`, `.greet-av`, `.greet-hi` | `v2/ui/screens.css` | Me's first block, in both shapes |
| `.tabs` + `[role="tab"]` | `v2/ui/components.css` | Attention's four filters; the usage sheet's two periods |
| `.btn`, `.btn-primary`, `.btn-quiet` | `v2/ui/components.css` | Check in/out, Sign off, Ask, See all, No signal, Retry |
| `.badge`, `.badge-ok/-warn/-bad` | `v2/ui/components.css` | "Waiting for sign-off", "Not sent yet", "Not sent" |
| `.field` + `icon('search')`; `.num` | `v2/ui/components.css`; foundation §3.3 | Attention's one advisor field; no `.num` on these three (no number is typed on any of them) |
| `emptyState / errorState / offlineState / skeleton / figure` | `v2/ui/states.js` | Every state below. Markup is never hand-written |
| `V2.openSheet / closeSheet / confirmDialog / toast` | `v2/ui/overlay.js` | More, the usage readout, the device sheet, the report sheet, every confirmation |
| `icon(name, {size})` | `v2/ui/icons.js`, 34 marks | Every mark below is from the set; **none is added** |
| `photoGrid / photoCapture / V2.openPhoto` | foundation §3.5 (new, `v2/ui/photos.js`) | Me: the check-in face, the bus-fault photo |
| `nav(items, activeId)` | foundation §3.7 (new, `v2/ui/nav.js`) | §1.3 |

**Three things the shell needs that the foundation does not have.** Each is named here
rather than invented quietly, and each is sized only from the 33 tokens, so none of
them is a token request:

1. **An app frame.** There is no header, no scroll container and no page-title
   primitive — `.ptitle` styles a heading *inside* a card, not the screen's own. §1.1
   specifies it as `v2/ui/shell.css`, which the foundation's §7.2 item 2 permits ("add
   a screen-level stylesheet for layout"), except that this one belongs to all thirteen
   screens rather than one. It declares no colour and no size of its own.
2. **A persistent offline indicator.** The foundation has `offlineState()` (a block
   for an empty list), a stale figure note, and the nav's "Me (3)" count. It has
   nothing that says "there is no signal right now" on a screen that *does* have rows.
   §1.9 builds it from `.btn-quiet` + `icon('offline')` and adds no CSS.
3. **A "still filling" figure.** `states.js` keeps three things apart — unknown, zero,
   stale — and a **partial aggregate is a fourth thing**: we hold a real number over
   part of the data. §1.8 resolves it with `stale: true` plus one sentence of words,
   which needs no new primitive, and makes the rule falsifiable.

---

## 1. The shell

### 1.1 The frame

**One document, at `/v2`, which holds no `styles.css`.** So `data-v2` goes on `<html>`,
with `data-theme` and `data-density` **on the same element** — `tokens.css` requires it
("the dark guard is `[data-v2]:not([data-theme="light"])`, so it only sees `data-theme`
when it sits on the SAME element as `data-v2`"). The wrapper case that file warns about
(`v2wrap`, `display: contents`) is a migration device for screens living inside v1 and
**is not used by any of the thirteen**.

```
<html data-v2 data-density="yard|desk" [data-theme="light|dark"] lang="en|hi">
  <body>
    <header class="apphead"> [back] [title] [trailing slot] </header>
    <main class="appbody" id="screen">  ... the screen ...  </main>
    <nav class="nav" aria-label="Main"> ... </nav>          (absent for 2 roles)
    <div class="ov-toasts" data-v2>                          (overlay.js owns it)
  </body>
</html>
```

**Structure at phone width (yard), top to bottom:**

| Element | Tokens | Specification |
|---|---|---|
| `body` | `--surface`, `--pad` | `background: var(--surface)`; `padding-top: env(safe-area-inset-top)`; side and bottom padding per §1.5. **`body` is the scroll container** (§1.4) |
| `.apphead` | `--pad`, `--tap`, `--s2`, `--t3` | A three-column grid `auto minmax(0, 1fr) auto`. `min-height: calc(var(--tap) + var(--s2) * 2)` = **64px yard, 48px desk**. `padding-inline: var(--pad)`. Background `--surface` (the same as the page: it is not a bar, it is the top of the page). No border, no shadow |
| `.apphead h1` | `--t3`, `--ink` | The screen's name, weight 650, `letter-spacing: -0.2px`, one line, `overflow: hidden; text-overflow: ellipsis; white-space: nowrap`. Hindi: `22 x 1.7 = 37.4px` inside the 64px box with 8px above and below, 53.4px total — fits with 10.6px spare |
| the back control | `--tap`, `--accent-text` | `button.btn.btn-quiet` carrying `icon('back', {size: 20})` and no word. Present **only** on a detail screen (Job card, a bus, a person). **Absent on all three screens in this document** — they are destinations, not details |
| the trailing slot | `--s2` | At most **one** control. Today: nothing. Attention: the filter sheet button, only at desk (at yard the filters are a `.tabs` strip in the body). Me: nothing. The offline button (§1.9) takes this slot when there is no signal, and it is the one thing allowed to displace what is there — because a control you cannot use beats a control you did not know you could not use |
| `.appbody` | `--s6`, `--pad` | `padding-top: var(--s6)`. Its side padding is the body's (§1.5), so a full-bleed list can still reach the edge by negative-margining `--pad`, which only Attention's desk table does |
| `.nav` | `--nav-h` | §1.3 |

**Desk (`data-density="desk"`, 1024x768, Windows 7):** the same four elements, with
the rail replacing the bar (§1.3.2) and three differences:

- `.apphead` is 48px and its title is `--t3` 20px. The header still scrolls (§1.4).
- `.appbody` is `max-width: 900px` on Today and Me, left-aligned after the rail, because
  a 16px line of body text across 864px is unreadable and these two screens are text
  and cards. **Attention is not capped**: it is a list of 200 rows and wants every
  pixel of the 864px the rail leaves (foundation §3.7.2).
- A `.kpirow` goes from two columns to four (§2.2).

**What a builder must not do to the frame:** add a second fixed layer; make the header
sticky; put a bar of any kind at the bottom of a screen that has no nav (foundation
§3.7.1 rule 1); or put `data-theme` on a different element from `data-v2`.

### 1.2 Density is chosen by the machine, not by the role

One rule, evaluated once at boot and again on `resize` (debounced to one evaluation per
250 ms, which is the only `resize` listener in the app):

```
desk  when  (min-width: 1024px) and (pointer: fine)
yard  otherwise                                        (the default, and the safe failure)
```

Both clauses, each for a reason. Width alone would put a desk row and a rail on a
tablet in landscape, which is also 1024x768 and is held in two hands — the foundation
§3.7.2 names exactly this case. `pointer: fine` alone would put 32px rows on a
1366x768 touchscreen laptop. **Role is not in the rule**: a supervisor at the gate on a
phone gets yard and the same supervisor at the office desk gets desk, which is the
whole point of `000c3dd`.

A builder **may** nest `data-density="desk"` on one container inside a yard page
(`tokens.css` supports it explicitly). Of these three screens exactly one does:
Attention's desk list, when a supervisor opens it on a phone deliberately — no. That
case keeps yard. **No nesting on these three screens.** The nesting allowance is spent
on Jobs' desk table, which is not mine.

### 1.3 The nav

One component, two orientations, built by `nav(items, activeId)` (foundation §3.7). The
markup contract is the foundation's, unchanged:

```
<nav class="nav" aria-label="Main">
  <a class="nav-i" aria-current="page"><span class="nav-ic">[icon]</span><span class="nav-l">Today</span></a>
  ...
</nav>
```

**Slots, exactly as `v2-ux.md §4.4` and foundation §3.7 settle them:**

| Role | Yard slots, in order | Desk |
|---|---|---|
| driver | **none** (§1.4.1) | none |
| conductor | **none** (§1.4.1) | none |
| mechanic | Today, Jobs, Store, Me | same 4, as a rail |
| store | Today, Store, Jobs, Fuel & tyres, Me | same 5, as a rail |
| crewmanager | Today, Duty board, People, Fuel & tyres, Reviews, Me | same 6, as a rail |
| office | Today, People, Reviews, Me | same 4, as a rail |
| supervisor | Today, Attention, Jobs, Buses, More, Me | **all 12 destinations, no More** |
| owner | Today, Attention, Money, Buses, More, Me | **all 12 destinations, no More** |

**The rail holds twelve items, and after `DECISIONS.md §15` the foundation's arithmetic
is right.** Thirteen *screens*, twelve *destinations*: the Job card is reached from Jobs
and shares its tab, exactly as the foundation already says for mechanic ("5
destinations, **4 tabs**") and store. So the rail is `12 x --tap 32px = 384px` of a
768px column — the foundation's own number, which was sized by counting screens
including the Job card and excluding a Gate round that did not exist yet. Two offsetting
errors, now both gone. `--rail-w: 160px` is unaffected either way, because the width is
decided by the longest label ("Fuel & tyres") and not by the count.

Rail order for owner and supervisor, which is the same list in the same order for both
so that two people at two desks can tell each other where to tap: **Today, Attention,
Jobs, Buses, Store, Money, People, Duty board, Gate round, Fuel & tyres, Reviews, Me.**
Duty board and Gate round sit next to each other because they are one evening and two
hours of it, and because a supervisor walking the line moves between them.

**More**, at yard, for owner and supervisor only: `V2.openSheet('More', ...)` holding
the seven remaining destinations as `a.v2row`, in the rail's order, each with its nav
mark in `.lead` and nothing in `.act`. Supervisor's seven: Store, Money, People, Duty
board, Gate round, Fuel & tyres, Reviews. Owner's seven: Jobs, Store, People, Duty
board, Gate round, Fuel & tyres, Reviews. 5 + 7 = 12 for both. **More is `icon('more')`
and is never a destination**: its item carries no `aria-current`, and the sheet's rows
do. Seven rows at `--row-h` 56px is 392px, inside the sheet's `max-height: 90%` on a
640px phone without scrolling.

#### 1.3.1 The bottom bar (yard)

| | |
|---|---|
| Box | `position: fixed; left: 0; right: 0; bottom: 0; height: calc(var(--nav-h) + env(safe-area-inset-bottom)); padding-bottom: env(safe-area-inset-bottom)` |
| Edge | `border-top: 1px solid var(--line)`; background `--surface` |
| Item | `flex: 1 1 0; min-width: 0`; stacked: `icon(name, {size: 20})`, gap `--s1`, label `--t6`. Arithmetic (foundation §1.2): 20 + 4 + 25.5 Hindi = 49.5px inside 56 |
| Six at 360px | 60px each, which holds a 20px mark and a `--t6` label. Six is the ceiling; the seventh is More |
| Label | **Always visible.** An icon-only tab on a Windows 7 machine is how the emoji problem started |
| Active | `aria-current="page"`, `--accent-text`, and a 2px `--accent` bar on the **top** edge of the item. Colour is never the only cue. **The bar does not animate** |

#### 1.3.2 The left rail (desk)

The foundation's decision, consumed verbatim: rail when the page is
`data-density="desk"` **and** the viewport is at least 1024px wide. Under §1.2's rule
the second clause is normally implied by the first; it stays as the guard for a
deliberately desk-density container on a narrow viewport, which keeps the bar.

`flex-direction: column; position: fixed; left: 0; top: 0; bottom: 0; width: var(--rail-w); border-top: 0; border-inline-end: 1px solid var(--line); padding-inline-start: env(safe-area-inset-left)`.
Each item is a row: mark then label, which is already the desk item's shape. Active
item: the 2px `--accent` bar on the **leading** edge. The rail does not animate, slide
or collapse.

### 1.4 How a screen is scrolled

**`body` is the scroll container. There is no inner scroller, and that is not a
preference.** `v2/ui/overlay.js` locks the page by setting
`documentElement.style.overflow = 'hidden'` and restoring it exactly (lines 160-169,
with 100 checks behind it). An inner scroller would not be locked by it, so a sheet
would open over a list that still scrolls behind the scrim — and the scrim is the only
thing that says the page behind is inert (foundation §5.4). Two further reasons, both
measured elsewhere in this repo rather than guessed: `100vh` on an Android phone is
taller than the visible viewport, so the last row of a list would sit under the bar
however correct the padding is; and an inner scroller loses Chrome's scroll anchoring,
which is what stops a 200-row desk list jumping when the 4-second sync tick applies a
record.

So: the header scrolls away with the content, the nav is the **one** fixed layer, and
nothing on these three screens is `position: sticky`. A 200-row list on a Core 2 Duo
pays for one promoted layer, not two.

### 1.5 Where the safe-area padding goes

Exactly, and the two halves of the bottom rule are the foundation's (§3.7.1):

| Edge | Rule |
|---|---|
| top | `body { padding-top: env(safe-area-inset-top) }`. On the frame, not the header, so the header's `calc(var(--tap) + var(--s2) * 2)` arithmetic is unchanged |
| inline | `body { padding-inline: calc(var(--pad) + env(safe-area-inset-left)) calc(var(--pad) + env(safe-area-inset-right)) }`. The rail adds `padding-inline-start: var(--rail-w)` **in place of** the left inset, because the rail already covers it |
| bottom, bar present | `padding-bottom: calc(var(--nav-h) + env(safe-area-inset-bottom))` |
| bottom, rail or no nav | `padding-bottom: calc(var(--pad) + env(safe-area-inset-bottom))` |

The bar's own box is `calc(var(--nav-h) + env(safe-area-inset-bottom))` tall with
`padding-bottom: env(safe-area-inset-bottom)`, so the two numbers are the same number
and the last row clears the bar exactly. **A builder who changes one must change the
other**; the falsifiable form is a check that scrolls a 200-row list to the end and
asserts the last row's bottom is above the nav's top.

### 1.6 How the route is shown

Three places, and only three, because v2 has no URL routing (stage 1 §2.1) and
therefore no address bar to read:

1. **The nav's active item** — `aria-current="page"`, `--accent-text`, the 2px bar.
2. **The header title** — the screen's own name, from the thirteen, spelled the same in
   the nav label, the header and the More sheet: Today, Attention, Jobs, Job card,
   Buses, Store, Money, People, Duty board, Gate round, Fuel & tyres, Reviews, Me. One
   name, three places, never a synonym.
3. **`document.title`** — `"<screen> — Garage Saathi"`, so a second tab on the office
   PC is identifiable from the tab strip. Not read by anything else.

**A greeting is not a route.** v1's home opens with the person's name; v2's Today opens
with the word "Today" and the freshness line, and the greeting lives on Me (foundation
§3.7.1 assigns `.greet` there). On the one screen six roles open in ninety seconds, the
top 64px says where you are, not who you are.

### 1.7 Signed out

Already built: `v2/ui/login.css`, the `.lg*` family — `.lg-mark`, `.lg-biz`,
`.lg-list` of `a.v2row`, `.lg-pad` keypad, `.lg-dots`, `.lg-build`. The shell's only
job here is the handover, and it has four rules:

| Rule | Why |
|---|---|
| The signed-out document has **no header, no nav and no scroll container padding**. `login.css` sets `[data-v2].lg { min-height: 100vh; display: flex; justify-content: center }` and owns the whole viewport | A nav on the login is a lie about there being somewhere to go, which is the same lie as a one-item nav (§1.4.1) |
| Signing out is `V2.confirmDialog('Sign out?', {yes: 'Sign out', no: 'Stay'})`, focus starting on **Stay** | `overlay.js` starts a confirmation on Cancel so a reflexive Enter says no. Signing out costs the owner, supervisor and crew manager a 30-36 second cold login to undo ([E] 6fa0a6d) |
| On sign-out the local database is **not** cleared, and the confirmation says so: "Your records stay on this phone." | Clearing it on sign-out would throw away unsent writes. LIVE-ISSUES 1 is live in `v2/sync.js` (`DECISIONS.md §14`), so an unsent write is already at risk; losing it on a sign-out tap would be the second cause of the same silence |
| The PIN is **not** cached for owner, supervisor and crew manager, so for those three the login is one network request. The login's own waiting state is `login.css`'s, not this document's | Stage 1 §6: the three people who run the garage cannot sign in offline. The shell must not make it worse, and it does not touch it |

### 1.8 First load, before any data

The app has had **eight distinct causes** of "everything exists, just no data", and the
user saw silence every time (stage 1 §6). So the first load is specified as a sequence
with a state at every step, and the instrument already exists in `v2/pullapply.js`:
`replicaState(lastRev, tableMax, skipCount)` returns `{behind, complete}`, with
`complete: false` whenever no pull has ever come back.

| t | What is on screen |
|---|---|
| first paint | **The frame and the nav.** The role is in the session, so the nav needs no store read — "it is the one thing on screen that must never wait for data" (foundation §3.7). The header title is drawn. The body is `skeleton(n)` |
| `n` | The number of rows the block *will* have, so the list does not jump. On a device that has loaded this block before, `n` is last time's row count, capped at the block's cap. On a device that never has, `n` = the block's cap (5 at yard, 12 at desk) |
| first pull returns | The blocks fill. `v2/pullapply.js`'s `FIRST_STORES` is asked for first and is one or two pages, so this is seconds, not the whole drain |
| `complete === false` | **Every aggregate figure is `figure(value, {at, stale: true})`** and the block carries one line under it: "Still filling. 4,120 of 9,300 records on this phone." (`behind` is the second number minus the first). `figure-note-stale` turns `--warn` and the note reads "Updated ... ago" |
| `complete === true` | `stale` comes off. Figures carry `at` only |
| a store this block reads has never arrived | One line at the end of the block naming it: "Gate checks have not arrived on this phone yet." Never a silently shorter list |

**The rule, stated so it can fail:** *no aggregate figure may be drawn without
`stale: true` while `replicaState().complete` is false.* That is [E] 2170703 —
"Nothing is going missing. The figures are incomplete and the app draws them as final"
— turned into a check: render Today with `tableMax > lastRev` and assert every
`.figure` on it has `data-state="stale"`.

**And the first-load hole this found.** `FIRST_STORES` is `meta, users, buses, parts,
jobcards, drivers, challans, fuel, rbreviews, incidents, routes, vendors, components,
attendance, stockmoves, breakdowns`. Five of Attention's nine row kinds read a store
that is **not** in it — `gatechecks`, `driverreports`, `dutylog` (plus the new nightly
store), `audits`, `ledger` — and the first three are the safety and standstill kinds.
Me's own coaching note reads `crewnotes`, also absent, on the one screen that is two
roles' whole app. Recommendation for stage 3's data-layer slice, not a change made
here: **add `gatechecks`, `driverreports`, `dutylog` and `crewnotes` to `FIRST_STORES`;
leave `audits` and `ledger` out** — they are large, and a money finding may arrive
behind a safety one. Until that happens the per-kind line above is what keeps it
honest.

### 1.9 The offline indicator

| | |
|---|---|
| Where | The header's trailing slot, on every screen |
| What | `button.btn.btn-quiet` carrying `icon('offline', {size: 20})` and the words **"No signal"**, in `--warn` |
| When | The last pull attempt failed **or** `navigator.onLine` is false. Not `navigator.onLine` alone: it reports true on a captive portal, which is the office's wifi when the bill is unpaid |
| What it opens | `V2.openSheet('Device and server', ...)` — the same sheet Me's device row opens (§4.2 block 6). One sheet, two doors |
| What it never is | A coloured dot. Stage 1 §7 measure 7 wants every refused, quarantined or dropped record surfaced with a reason, and a dot carries neither |
| Beside it | The nav's **Me** label carries the waiting count — "Me (3)" — which is the foundation's rule and is about unsent records, not about signal. The two are different facts and are shown in different places on purpose |
| Layout | The header's title column is `minmax(0, 1fr)` and truncates, so the title does not reflow when the button appears. The slot is the only thing that changes width |
| Motion | `opacity: 0 -> 1`, 150 ms `ease-out`, no movement. **Why:** a line that appears without a transition reads as a redraw, which on this app's history means something broke (foundation §5.5's reasoning). The layout shift happens at once — height is not animated, ever |

### 1.10 Shell states

| State | Specification |
|---|---|
| loading | §1.8. The frame and nav are never in a loading state; they have no data |
| empty | The shell has no empty state. A screen's body does |
| one item | The shell does not change. A block with one row drops its "See all" line (§2.4) |
| far too many | The shell does not change. Caps are per block and per screen (§2.4, §3.4) |
| error | A screen whose whole body failed to read keeps the frame and the nav and puts `errorState(text, onRetry)` in the body. **The nav is never removed by an error**: a person who cannot read Attention can still reach Today |
| offline | §1.9. The frame, the nav and every drawn row stay. Only the age is in question |
| half-finished | The shell carries nothing half-finished. Rows do (§2.4, §4.4) |
| no permission | **It cannot be reached.** A tab a role does not hold is absent (not disabled), there is no URL routing, and no screen is reachable from another role's home — stage 1 §4.4 makes that a build-time check. If a code path lands there anyway, the body is `emptyState('This is not open to you', {icon: 'warn', hint: 'If you need it, ask the owner.'})` and the dev build writes one console line naming the role and the screen, because arriving there means the nav and the declaration disagree, which is LIVE-ISSUES 6 exactly |

### 1.11 Shell interactions

| Control | Does | Pressed | Focus | Disabled |
|---|---|---|---|---|
| nav item | Changes the screen. Never animates (foundation §5.8: most repeated action, 250 ms total budget) | `transform: scale(0.97)`, 120 ms `ease-out` | `outline: 2px solid var(--accent); outline-offset: -2px` — inside the edge, the bar clips an outer ring | **Never disabled.** A tab a role does not hold is absent |
| the active nav item | Nothing. A tap on the screen you are on is a no-op, and it does **not** scroll to top, reload or clear a filter | Still presses — the press is the acknowledgement that the tap was heard on a 400 ms machine | as above | n/a |
| More | Opens a sheet | scale(0.97), 120 ms | as above | n/a |
| back (detail screens only) | One step up, to the parent screen, never into history | scale(0.97), 120 ms | `outline-offset: 2px` (it is not in a clipping strip) | n/a. A back control with nowhere to go is not drawn |
| the offline button | Opens the device sheet | scale(0.97), 120 ms | `outline-offset: 2px` | n/a |
| Every control on these screens | | `scale(0.97)`, 120 ms `ease-out`; under `prefers-reduced-motion: reduce` it becomes `opacity: 0.8` — gentler, not absent | `2px solid var(--accent)`, offset `2px` outside a strip and `-2px` inside one | `aria-disabled="true"` **only** while a write is in flight, with the label saying what is happening ("Signing off..."). A control the person may not use is **absent** |

### 1.12 Shell copy

| Where | English | Note |
|---|---|---|
| header titles | Today · Attention · Jobs · Job card · Buses · Store · Money · People · Duty board · Gate round · Fuel & tyres · Reviews · Me | The thirteen names. Same word in the nav, the header and More |
| `document.title` | `Today — Garage Saathi` | |
| offline button | No signal | Two words. Not "Offline" — that is the state's word, and `offlineState()` already owns it |
| sign out confirmation | Title: Sign out? Body: Your records stay on this phone. Buttons: Sign out / Stay | Three clauses, no more |
| no permission | This is not open to you. / If you need it, ask the owner. | Never "Access denied", never "Unauthorized", never blames the reader |
| still filling | Still filling. 4,120 of 9,300 records on this phone. | The number first, because the number is the point |
| a store that never arrived | Gate checks have not arrived on this phone yet. | Names the thing, not the store id |

### 1.13 Shell motion

| What moves | Property | Duration | Easing | Why it animates at all |
|---|---|---|---|---|
| Every pressable | `transform: scale(0.97)` | 120 ms | `ease-out` | The office machines took 884 ms per tap before dirty-store tracking. A control that gives no feedback reads as broken, and the person taps again (foundation §5.1). The one animation the product cannot do without |
| The offline button appearing | `opacity` 0 to 1 | 150 ms | `ease-out` | A line that appears without a transition reads as a redraw, and on this app's history a redraw means something broke |
| Sheets (More, the usage readout, the device sheet) | `translateY(var(--s8))` to none + `opacity` | 250 ms in, 180 ms out | `ease-out` | It arrives from the edge it is anchored to, so its direction is its dismissal. Already built |
| Confirmations | `scale(0.95)` to none + `opacity` | 200 ms in, 150 ms out | `ease-out` | A destructive question must not appear in the same instant as the tap that asked for it. Already built |
| Scrim | `opacity` 0 to 0.5 on `--accent-ink` | 200 in, 150 out | `ease-out` | The page behind is inert; the scrim is the only thing that says so. Already built |
| Toasts | `translateY(var(--s2))` to none + `opacity` | 200 in, 150 out | `ease-out` | Already built |

**Nothing else on these three screens animates**, and the list of what was considered
and rejected is: the nav's active bar (tens of times a day), screen change (the budget
for it is 250 ms total, and an animation spends the budget it is meant to hide),
Attention's rows arriving or reordering (a sync tick applies records every 4 s; the
reorder *is* the information), figure updates (`tabular-nums` exists precisely so
digits do not shift), the skeleton (deliberately static), and stagger of any kind
(50 ms x n of deliberately withheld content on a machine that takes 798 ms to boot).

**One note on craft, since the craft literature was consulted (`emil-design-eng`) and
disagrees in two places.** It recommends custom cubic-beziers over the built-in
easings, and a 30-80 ms stagger on lists. Both are refused here: `test_ui_components.js`
pins the duration ladder (120/150/180/200/250 ms) and `ease-out`, and the foundation
names stagger as out of the product by name. The reasoning is the same reasoning either
way — the curve and the stagger are paid for in frames on a Core 2 Duo, and this
product's motion budget is spent entirely on the press. Where the craft reading and the
foundation agree, and it is worth saying because it is the rule most often broken: exit
is faster than enter, slow where the person is deciding, fast where the system is
responding.

### 1.4.1 One slot: a driver and a conductor get no nav

`DECISIONS.md §7` and stage 1 §3.4: Me is the **whole app** for these two roles, who
between them hold zero capabilities. A nav with one item is a lie about there being
somewhere else to go — the same lie as a disabled tab. So:

| | |
|---|---|
| `.nav` | **Not rendered.** Not an empty nav, not a one-item nav, not a nav with the item disabled |
| back | **No back control**, ever. A back arrow pointing at nothing is the same lie |
| More | Absent |
| bottom padding | `calc(var(--pad) + env(safe-area-inset-bottom))` — the no-nav half of §1.5 |
| any fixed bottom bar | Forbidden, **including an action bar**. A bar pinned to the bottom edge of a one-screen app reads as a nav that has lost its tabs (foundation §3.7.1 rule 1) |
| the header | Still drawn, title "Me". It is the only thing that says which app this is, and `document.title` follows it |
| whose app this is | The `.greet` block, first thing in the body (§4.2) |
| every sheet | Closes to Me, which `overlay.js` already guarantees with Escape, the Close button and a backdrop click |

**The foundation's §3.7 "empty: cannot occur" was corrected to this by its own author
and the correction is consumed, not re-argued.**

---

## 2. Today (#1) — "What needs me, now?"

The only screen all roles have except the two that have none. Six roles, one name.
`v2-ux.md §4.3` gives it the first of two deliberate capability exceptions: **Today
declares no capability; its contents are capability-scoped block by block**, the same
rule as Attention's rows.

### 2.1 Eight screens wearing one name: what is shared and what is not

**Shared, identically, for all six roles:**

| Part | Rule |
|---|---|
| The header | Title "Today". No back. No trailing control except the offline button |
| The freshness line | One line at the top of the body, `--t6`, `--ink-dim`: `icon('clock', {size: 16})` + "Updated 4 minutes ago". **The screen states its freshness once, here**, which is why no figure inside a row on this screen carries `at` (foundation §2.3 rule 4: `at` inside a row adds a block element and runs `ageWords()` per row) |
| The block grammar | A block is either **a figure row** (`.kpirow` of `.kpi`) or **a card** (`.card` > `h3` + rows). Nothing else |
| The cap | **At most four blocks**, and **no block links to more than one screen.** Five cards each linking to a different ranked list is what Attention replaced; Today must not grow it back (`v2-ux.md §4.1` #1, "must NOT") |
| Row cap per card | 5 at yard, 12 at desk. Then one `.btn-quiet` row: "See all (34)" linking to the screen that owns the list |
| Order inside a card | Always stated per role below, always one key, always worst-or-oldest first. No role's Today sorts by anything the person cannot see in the row |
| What is absent | Any row that is not this person's to act on. A block whose capability the person does not hold is **absent**, not empty and not greyed |

**Not shared:** everything else. The six are set out one by one below because "Today is
role-shaped" is the sentence that lets a builder guess, and the guesses are what made
69 `view*` functions.

### 2.2 Structure

**Phone (yard), top to bottom:**

```
.apphead                  "Today"                       64px
.appbody  padding-top --s6
  .today-fresh            clock + "Updated 4 minutes ago"      --t6 --ink-dim
  .kpirow                 2 columns, gap --s3                  (0, 2 or 4 tiles)
  .card                   h3 + up to 5 .v2row + "See all (n)"  margin-bottom --s3
  .card                   h3 + up to 5 .v2row + "See all (n)"
  .card                   the Monday summary, when there is one
  (end)                   padding-bottom calc(--nav-h + env(safe-area-inset-bottom))
```

The gap between the figure row and the first card is `--s5`; between cards it is `--s3`
(`screens.css .card` already carries `margin-bottom: var(--s3)`).

**Desk:** `.appbody` is `max-width: 900px`. `.kpirow` becomes four columns
(`grid-template-columns: repeat(4, 1fr)`) so the owner's four numbers are one line and
can be read against each other, which is the only reason they are a row. Cards keep
their order; rows go to `--row-h` 32px and one line (`.sub` is not drawn at desk
density — foundation §2.1, and Hindi is the reason). **A desk Today row therefore loses
its second line, so every role's row below states what the one line must say.**

A `.kpi` holds `figure()` inside its `.kpi-v`, which is legal and worth stating because
it looks like a collision: `.kpi-v` sets `--t2`, weight 650 and `tabular-nums`;
`.figure-u` and `.figure-note` each re-declare `--t6` and weight 400 in
`components.css`, so the unit and the age do not inherit the headline size. Four tiles
is four `ageWords()` calls, not 200, so `at` is allowed here and forbidden in a row.

### 2.3 Per role

Capability names are from `02 §2`'s 37 where one exists; the three v2 names
(`viewAttention`, `viewSpendTotals`, `viewAdoption`) are stage 1 §4.3's.

#### Owner — four numbers, the top of Attention, and the Monday summary

Stage 1 §3.7 step 2 and §4.1 #1, exactly: "Four numbers and a short list."

| # | Block | Content | Scope |
|---|---|---|---|
| 1 | `.kpirow`, 4 tiles | **Repair cost, 30 days** — `icon('money')`, `figure(v, {at, format: rupees})`, with `.schip.ok` or `.schip.crit` carrying U+25B2/U+25BC and the per-cent change. **Owed to suppliers** — `icon('doc')`. **Buses on road** — `icon('bus')`, value "84 of 102" as one formatted string. **In shop** — `icon('job')` | `money` for the first two, `fleet` for the last two. An owner holds all four; the split is so a future role cannot inherit money with an operational grant |
| 2 | `.card` "What needs you" | Up to 5 `a.v2row.v2row-why` — **the top of Attention, by Attention's own comparator (§3.3), not a second ranking.** Then "See all (34)" to Attention | Each row is scoped exactly as on Attention: per kind, and by identity for the second-signature kind. **The owner never sees his own closes here**, which was already true for him alone and is now the rule for everybody |
| 3 | `.card` "This week" | The Monday summary, when the `digest` store holds one for this week: the heading, Claude's three lines, and one `.btn-quiet` "Read it all" opening a sheet. **Absent entirely when there is none** — not an empty card | the server sends `digest` to the roles it sends it to; the block is drawn when a record exists, which is the honest condition |
| — | not on it | Standing buses. Away for repair. The job board. Five cards to five lists | Those are Jobs' and Attention's. The owner reaches the job board from the rail or More, which is the fix for `05 §4` row 14 ("no Jobs tab; the manual teaches a workaround") |

Desk one-line row (block 2): the thing, then the figure. "Bus 14 held at the gate" ·
`figure(4, {unit: 'h'})`. The reason moves into the title's tail only when it fits:
at desk the reason is on Attention, one tap away, and Today is a doorway.

#### Supervisor — the yard, the gate, his own waiting closes, then Attention

Stage 1 §3.1 step 1: "Sees the workshop: every bus standing in the yard, oldest first,
how long it has stood, whether work has started." This is the most frequently drawn
list in the product (§2.7).

| # | Block | Content | Scope |
|---|---|---|---|
| 1 | `.card` "Standing in the yard" | Up to 5 (12 desk) `a.v2row`, **oldest first by `enterAt`**. `.lead` = `icon('bus')`. `.t` = "Bus 14 — brake light" (bus, then fault, truncating). `.sub` = "Standing 6 h. Not started." or "Standing 6 h. Started 20 min ago." `.act` = `figure(hours, {unit: 'h'})`. Then "See all (23)" to Jobs | `viewJobs` |
| 2 | `.card` "Going out tonight" | Up to 5 `a.v2row`, **unchecked first, then by bus number**. `.lead` = `icon('gate')`. `.t` = "Bus 31". `.sub` = "Not checked out of the gate." / "Released 20:14." / "Held: tyre." `.act` = the `badge` for the state: `badge-warn` "Waiting", `badge-ok` "Released", `badge-bad` "Held". Then "See all (18)" to **Gate round (#13)** | `gateCheck`. **This block is why the supervisor needs no Gate round tab at yard** — foundation §8.4 found the path and it is this one, one tap from the screen they land on. After `DECISIONS.md §15` it links to Gate round, not Duty board: the count this block empties is the departure checks, which is the count Gate round owns, and mixing it with the seat count on one screen is what §15 split |
| 3 | `.card` "Waiting for someone else" | Up to 5 **`div.v2row` — no press, no link** — the cards *he* closed that are waiting for a second signature. `.lead` = `icon('clock')` in `--warn`. `.t` = "Bus 9 — clutch". `.sub` = "Closed 2 days ago. Somebody else has to check it." `.act` = `figure(days, {unit: 'd'})`. **Absent when there are none** | `mayCloseJob`, and the identity rule inverted: this block shows **only** `closedBy === me.id`. It is the mirror of Attention's row kind 2, and the reason both exist: he must see it as "waiting for sign-off" rather than discover it later (stage 1 §3.1 step 7, §9 item 2) |
| 4 | `.card` "What needs you" | Up to 5 `a.v2row.v2row-why`, the top of Attention, per-row scoped. Then "See all (41)" | per kind |

Four blocks is the cap, and the supervisor uses all four. **No figure row**: a
supervisor's question is a list, not a number (`000c3dd`: "the supervisor's home now
leads with what is in the workshop right now"), and a fifth block would have to displace
one of these.

#### Mechanic — his own cards, and nothing else in the business

Stage 1 §3.2 step 1: "Their own open cards, most urgent first, carried over from
earlier days — *an unfinished job does not stop mattering at midnight*."

| # | Block | Content | Scope |
|---|---|---|---|
| 1 | `.card` "Your jobs" | Up to 5 (12 desk) `a.v2row`, **priority descending, then oldest `enterAt` first**. `.lead` = `icon('job')`. `.t` = "Bus 14 — brake light". `.sub` = "Opened yesterday. Not started." / "You started at 09:12." `.act` = the one next step as a `badge`: `badge-warn` "Start" or `badge-ok` "Done" — **a badge, not a button**: the two taps live on the Job card where the bus and the fault are in front of him, and a one-tap write from a list row is how a part gets charged to the wrong bus ([E] d738a6e, the same shape). Then "See all (7)" to Jobs | `viewJobs`, **narrowed to own cards in the query, not in the view** (stage 1 §4.3). A mechanic must never see another mechanic's card; it leaked once (`02 §6.2`) |
| 2 | `.card` "Your score" | Three `.drow`: open work, rework, turnaround. Each `.drow-v` is `figure()`. One `.btn-quiet` "How this is counted" opening a sheet with the three definitions in words | `viewScoreboard`. **Own row only.** The team leaderboard is not here: it answers "who should take this card", so it is on the Job card (stage 1 §5.1) |
| — | not on it | Any other mechanic's card. The leaderboard. Check-in (that is Me's, and it is one tab away) | |

**Two blocks, and that is the whole screen.** It is short on purpose: for a month this
role's every tap bounced back to home and no mechanic reported it ([E] 8db78e7). A
short screen that works is the opposite of that; a long screen that mostly cannot be
acted on is the same thing again.

#### Storekeeper — the counter's queue

| # | Block | Content | Scope |
|---|---|---|---|
| 1 | `.kpirow`, 2 tiles | **Low stock** — `icon('part')`, `figure(count, {at})`. **Owed to suppliers** — `icon('doc')`, `figure(rupees, {at, format: rupees})` | `viewStore`; `manageSupplierBills` for the second. The fleet-wide spend total is **not** here — that is Money's (the `bills` split: manage the bill here, read the total there) |
| 2 | `.card` "Parts asked for" | Up to 5 `a.v2row`, **oldest request first**. `.lead` = `icon('part')`. `.t` = "Brake pad set — Bus 14". `.sub` = "Asked by Ramesh, 2 h ago. Card 4821." `.act` = `figure(qty)`. Then "See all (9)" to Store | `issuePart` |
| 3 | `.card` "Order these soon" | Up to 5 `a.v2row`, **lowest against reorder level first**. `.t` = the part. `.sub` = "4 left. Reorder at 10." `.act` = `figure(onHand)`. Then "See all (31)" to Store | `viewStore` |
| 4 | `.card` "Jobs waiting for parts" | Up to 5 `a.v2row`, oldest first. `.t` = "Bus 9 — clutch". `.sub` = "Waiting for a clutch plate since Tuesday." `.act` = `figure(days, {unit: 'd'})`. Then "See all" to Jobs | `viewJobs` |

Blocks 2 and 4 both link to a list, and they are different lists (Store, Jobs), which
is inside the "no block links to more than one screen" rule and at the edge of it. If a
fifth block is ever wanted here, one of these two goes.

#### Crew manager — tonight's empty seats, a count that can reach zero

Stage 1 §3.6 step 2, and `DECISIONS.md §8`. **The count can reach zero only because
tonight's buses are picked first**; before that the board counted buses that never
needed a driver ("67 buses need a driver" against 54 drivers, [E] ba274f6).

| # | Block | Content | Scope |
|---|---|---|---|
| 1 | `.kpirow`, 2 tiles | **Seats to fill tonight** — `icon('seat')`, `figure(count, {at})`. **Free drivers** — `icon('person')`, `figure(count, {at})` | `assignDriver` |
| 2 | `.card` "Tonight's buses with an empty seat" | Up to 5 (12 desk) `a.v2row`, **most empty seats first, then bus number**. `.lead` = `icon('seat')`. `.t` = "Bus 31". `.sub` = "No conductor. Driver 1 and Driver 2 filled." `.act` = `figure(empty, {unit: 'seats'})`. Then "See all (12)" to Duty board | `assignDriver` |
| 3 | `.card` "Coaching notes to approve" | Up to 5 `a.v2row`, oldest draft first. `.lead` = `icon('review')`. `.t` = the crew member. `.sub` = "Three lines, written Monday." Then "See all (8)" to People | `crewNote` |
| — | **The block that is absent, and the owner question behind it** | When **tonight's buses have not been picked**, block 2 cannot exist — there is no list to be short against. In that state block 2 is replaced by one `.card` holding `emptyState('Tonight\'s buses are not picked yet', {icon: 'seat', hint: 'Open the Duty board and tick tonight\'s buses off the register.'})` and a `.btn-primary` "Pick tonight's buses" to Duty board. **The figure tiles then read `figure(null)` — a dash, not 0** | This block depends on the one data addition in the whole plan (stage 1 §6: one new store, writable by owner, supervisor and crew manager, which the backend lead may refuse). **Specified so it does not depend on it:** if the store is refused, block 2 is removed and blocks 1 and 3 stand; nothing else on this screen changes, and the dash is already the honest figure |

#### Office — the crew, worst first

| # | Block | Content | Scope |
|---|---|---|---|
| 1 | `.kpirow`, 2 tiles | **Crew needing a talk** — `icon('warn')`, `figure(count, {at})`. **Average stars** — `icon('star')`, `figure(v, {at, format: oneDecimal})` | `crewPerf` |
| 2 | `.card` "Needs a talk" | Up to 5 (12 desk) `a.v2row`, **lowest blended score first**. `.lead` = `icon('person')`. `.t` = the person. `.sub` = "Score 48. Three 1-star reviews this month." `.act` = `figure(score)`. Then "See all (14)" to People | `crewPerf`. **Never a phone number** (`PII_ROLES`, `03 §2.1`), **never an identity document** (permission-or-self, `02 §4.3`), **never the conversation log** ([E] 4a42e38) |
| 3 | `.card` "Reviews to sort out" | Up to 5 `a.v2row`, newest first. `.lead` = `icon('review')`. `.t` = "1 star — Bus 23, Tuesday". `.sub` = "Could not be matched to a crew member." Then "See all (37)" to Reviews | `crewReviews`. **No passenger journey field for this role** — PNR, seat, fare and board point are stripped by the server for `office` and must not be re-added ([E] bd11e75). No label on this block names one |

#### Driver and conductor — no Today at all

They land on **Me** (§4). Today is not drawn, not linked and not in any nav, because
for them it would be a shell and a shell is the dead end that cost a month of
mechanics' time. This is `DECISIONS.md §7` resolved in stage 1 §4.2 and it is not
re-opened here.

### 2.4 States

Per block, because a screen of four blocks has four of each. "The block" below means
the card or the figure row; the **screen** never goes to a single state unless every
block does.

| State | Specification |
|---|---|
| loading | `skeleton(n)` inside each card, `n` per §1.8. The figure tiles draw their label and their mark immediately with `figure(null)` — a dash, never a 0, and never a blank tile |
| empty | `emptyState(text, {icon, hint})` inside the card, **naming which empty it is** and never the word "No data". Per block: "No bus is standing in the yard" / "Every bus tonight is checked out" / "You have no open jobs" / "No parts asked for" / "Nothing to order" / "Every seat tonight is filled" / "No notes waiting" / "Nobody needs a talk". Each is a sentence a person would say |
| one item | One row, **and the "See all" line is dropped** — "See all (1)" is a button that goes somewhere to show the same row. The card heading keeps no count either |
| far too many | The cap (5 yard / 12 desk) plus one `.btn-quiet` row: "See all (203)". **Never an uncapped list on Today**: Today is a doorway and a 203-row doorway is Jobs |
| error | `errorState(text, onRetry)` inside **that block only**, with Retry. The other three blocks keep their rows. A screen where one store failed is not a failed screen, and `states.js`'s retry registry (cap 200, same function reuses its id) makes a per-block retry safe on a screen that redraws |
| offline | Rows stay. The freshness line turns `--warn` and reads "No signal since 06:40. What you see may be out of date." The offline button appears in the header. `offlineState()` is used **only** when a block has nothing to show **and** there is no connection — otherwise the rows are real and only their age is in question |
| half-finished | A row whose write is still in the outbox keeps its place and carries `badge-warn` "Not sent yet" in `.act`, beside or instead of its figure. **Never "Failed"**, and never removed: it is in the record. The honest limit, stated: a write that the server **dropped** on the `updatedAt` comparison cannot be shown here at all, because the response was 200 and the outbox cleared (LIVE-ISSUES 1, live in `v2/sync.js` by `DECISIONS.md §14`). Me's device card can show refused and quarantined records; it cannot show that one, and §4.4 says so in the copy rather than implying a guarantee |
| no permission | The block is **absent**. Not empty, not greyed, no heading. It cannot happen that all blocks are absent for the six roles: the per-role tables above each give at least two blocks to a capability the role holds in `02 §2`, and the (role x capability) vs (role x screen) check is what keeps that true when a role is added |

### 2.5 Interactions

| Control | Does | Pressed | Focus | Disabled / while working |
|---|---|---|---|---|
| a list row (`a.v2row`) | Opens the thing. **The whole row is the target** (grid `auto minmax(0,1fr) auto`, so a long bus number truncates instead of shrinking the action) | `scale(0.97)`, 120 ms `ease-out` | `outline: 2px solid var(--accent); outline-offset: -2px` | A row a person may not act on is **not drawn**. A row that is temporarily unusable is a `div.v2row` with no press and a word in `.act` |
| a `div.v2row` (supervisor's block 3, mechanic's score facts) | Nothing | **Does not press.** A row that moves under the thumb and then does nothing is the feedback failure inverted (foundation §3.8) | Not focusable. It is not a control, so it is not in the tab order | n/a |
| "See all (n)" | Changes the screen | `scale(0.97)`, 120 ms | `outline-offset: 2px` | Absent when the count is 1 or 0 |
| "Pick tonight's buses" | Changes the screen (Duty board) | `scale(0.97)`, 120 ms | `outline-offset: 2px` | n/a |
| "Read it all" (the Monday summary) | Opens a sheet | `scale(0.97)`, 120 ms | `outline-offset: 2px` | n/a |
| a figure tile | **Nothing. A tile is not a control.** Four tiles that each navigate is four cards to four lists, which is the thing Today must not be | no press | not focusable | n/a |
| Retry (in a block's `errorState`) | Re-reads that block's stores | `scale(0.97)`, 120 ms | `outline-offset: 2px` | While the read is in flight: `aria-disabled="true"`, label "Loading...". If its handler was evicted from the registry the button disables itself and says "Reload the page to retry" — `states.js` already does this |

### 2.6 Copy

Written for someone standing up with ninety seconds whose first language may not be
English. Seven words maximum on a button, twelve in a row title, the number first where
the number is the point, no exclamation marks, no "Please", no word that exists only
inside the app.

| Id | English | Hindi |
|---|---|---|
| `todayTitle` | Today | needed |
| `freshUpdated` | Updated 4 minutes ago | `updatedAgo` exists in `words.js` (foundation §6.3) |
| `kpiRepair30` | Repair cost, 30 days | `costMonth` exists in `i18n-hi.js` line 13 |
| `kpiOwed` | Owed to suppliers | needed |
| `kpiOnRoad` | Buses on road | needed |
| `kpiInShop` | In shop | needed |
| `cardNeedsYou` | What needs you | needed |
| `cardStanding` | Standing in the yard | needed |
| `cardTonight` | Going out tonight | needed |
| `cardWaitingOther` | Waiting for someone else | needed |
| `cardYourJobs` | Your jobs | `todayJobs` exists (line 13) |
| `cardYourScore` | Your score | needed |
| `cardPartsAsked` | Parts asked for | needed |
| `cardOrderSoon` | Order these soon | `lowStock` exists (line 13) |
| `cardJobsWaiting` | Jobs waiting for parts | needed |
| `cardEmptySeats` | Tonight's buses with an empty seat | needed |
| `cardNotes` | Coaching notes to approve | needed |
| `cardNeedsTalk` | Needs a talk | needed |
| `cardReviewsSort` | Reviews to sort out | needed |
| `cardThisWeek` | This week | needed |
| `seeAll` | See all (34) | needed |
| `notStarted` | Not started. | `markDone` exists (line 16); this one is needed |
| `standingHours` | Standing 6 h. | needed |
| `notSentYet` | Not sent yet | needed — and `i18n-hi.js` has no equivalent; the foundation's rule is that a missing Hindi value is a **build error**, not an English fallback |

**The Hindi column is the owner's and it is not a stage-2 decision.** Q12 is open (who
reads Hindi only, who cannot read at all). What is *not* conditional on Q12 is the
mechanism: every id above needs an `hi` value or stage 3 does not build, which is the
rule that would have caught the Trip cash defect. Nine of the ids can take a value that
already exists in `i18n-hi.js` or `words.js`; the rest are one sitting with the owner.

### 2.7 Performance: the supervisor's standing list is the most drawn list in the product

Stage 1 §6 names two screens by name. This is one of them. The shape that must not come
back is **work proportional to the whole dataset, performed per item, inside something
that runs on every render**, and there are no secondary indexes anywhere — every read is
`getAll()` plus a JS filter (`03 §1.1`).

Six rules, all of them the foundation's §2.3 applied to this screen:

1. **One string, one insert.** The whole screen is built as one string and set with a
   single `insertAdjacentHTML`. Per-row `appendChild` is the shape that cost 277 ms per
   page before batching.
2. **Nothing measures a row.** No `offsetHeight`, `getBoundingClientRect` or
   `getComputedStyle` anywhere on this screen.
3. **No `at` on a figure inside a row.** The screen states its freshness once, in the
   freshness line. Four tiles carry `at`; no row does. This is the rule that keeps
   `ageWords()` at 4 calls instead of 60.
4. **Each store is read once per content signature**, through `cachedSig(store)`, and
   the per-role block queries are built from that one read. A redraw with no new records
   re-reads nothing. The falsifiable form: a counter on the store read, a redraw with no
   sync in between, and an assertion that the counter did not move.
5. **The caps are the budget.** 5 rows at yard, 12 at desk, four blocks: at most 48
   rows on the densest Today. Windowing is not needed and is not used.
6. **The 4-second sync tick redraws nothing on its own.** A redraw happens when a store
   this screen reads has a new content signature, and then it is the whole screen as one
   string. No row animates in, out or into a new position — the reorder is the
   information (a bus moving up the oldest-first list is a fact, not a transition).

### 2.8 What Today depends on that is still open

| Open question | What this spec does |
|---|---|
| **Q8's data addition** (closed as a decision, open as a backend acceptance) | The crew manager's block 2 is specified in both worlds: with the nightly store it is a list whose count reaches zero; without it the block is replaced by one empty state and a button, and the two tiles read a dash. Nothing else moves |
| **Q10** (does attendance decide wages) | Today is unaffected. It decides whether driver and conductor logins exist at all, which is Me's question (§4) |
| **Q13** (the adoption report, never read) | Today's own measure is stage 1 §7 measure 4: any v2 screen with zero opens in four weeks is a screen stage 1 got wrong. Today is the screen most likely to prove stage 1 §9 item 3 right — that for the owner, Today and Attention are one screen. **This spec is deliberately built so that finding is cheap to act on**: the owner's Today is four tiles, five Attention rows and a digest card, so if measure 4 says it is only ever a doorway, what is deleted is three blocks and no primitive |

---

## 3. Attention (#2) — "What is wrong across the business, ranked by money and safety?"

One ranked list replacing five screens (`alerts`, `insights`, `pilferage`, `safety`,
`breakdowns`). Stage 1 §9 calls it the one new idea and the one most likely to fail, for
two reasons. Both are answered here before anything is drawn.

### 3.1 The two ways this screen fails, and the answer to each

**Failure 1: it becomes `dashboard` rebuilt.** If Attention declares one capability and
then shows pilferage, money, safety and alert rows, we have rebuilt the conflation the
owner flagged, where one capability guards 11 routes, the digest, the ITS lookup and the
Usage menu. The answer is §3.2 and §3.6: **every row kind declares its own capability,
checked per row, and the second-signature kind is scoped by identity as well.** Granting
Attention grants nothing but the empty list.

**Failure 2: it reintroduces the measured performance bug.** Attention ranks across many
stores, there are no secondary indexes, and the shape that cost this product its
reputation is work proportional to the whole dataset performed per item inside something
that runs on every render (`computeInsights()` at 386 ms per render;
`driverOverall`'s 200 ms `storeSig` over 40,000 rows). The answer is §3.4: **one index,
built once per content signature, outside any render**, a pure comparator, a 200-row
cap, and three checks that fail when any of those is undone.

### 3.2 The nine row kinds

Every row is `a.v2row.v2row-why`: `.lead` = the kind's own mark, coloured; `.t` = the
thing; `.sub` = the reason, up to two lines, **wrapped, never truncated** (a reason
truncated to an ellipsis turns the row into a colour and a number, which is `dashboard`
again); `.act` = `figure()` and nothing else.

| # | Row kind | Capability | Identity rule | Mark | Colour | Band | `.t` | `.sub` (the reason) | `.act` | Goes to |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Departure check waiting for a decision | `gateDecide` | none | `gate` | `--bad` | 1 | "Bus 14 held at the gate" | "Brake light failed the 20:00 check. Nobody has decided. Standing 4 hours." | `figure(h, {unit: 'h'})` | **Gate round (#13)**, that bus's check |
| 2 | Work waiting for a second signature | `verifyJob` | **`closedBy !== me.id`, for every role including the owner** | `ok` | `--ok` | 4 | "Bus 9 — clutch" | "Closed 2 days ago by Suresh, needs a second signature." | `figure(d, {unit: 'd'})` | Job card |
| 3a | A bus paper expiring or expired | `fleet` | none | `doc` | `--warn` (expiring) / `--bad` (expired) | 3 | "Bus 23 — fitness" | "Expired 6 days ago." / "Expires in 9 days." | `figure(days, {unit: 'd'})` | Buses, that bus's papers |
| 3b | A crew document expiring or expired | `manageDrivers` | none | `doc` | `--warn` / `--bad` | 3 | "Ramesh — licence" | "Expires in 11 days." | `figure(days, {unit: 'd'})` | People, that person |
| 4 | Unpaid challan | `challans` | none | `challan` | `--bad` | 2 | "Bus 14 — 2 unpaid challans" | "Oldest is from 12 August. Checked 3 days ago." | `figure(rupees, {format: rupees})` | Buses, that bus's liability |
| 5 | Unexplained stock change | `issuePart` | none | `count` | `--bad` | 2 | "Brake pad set — 6 missing" | "The shelf count on Tuesday was 6 under the book. Nobody has explained it." | `figure(rupees, {format: rupees})` | Store, that part's count |
| 6 | Pilferage flag | `insights` | none | `part` | `--bad` | 2 | "Ramesh — parts off the book" | "11 issues with no card in 30 days, against a team average of 2." | `figure(rupees, {format: rupees})` | Store, that person's issues |
| 7 | Open unsafe driver report | `fleet` | none | `warn` | `--bad` | 1 | "Bus 23 — brakes" | "Reported 2 days ago. No job card yet." | `figure(d, {unit: 'd'})` | Buses, that bus's reports, with "Make a job" |
| 8 | Breakdown pattern | `logIncident` | none | `bus` | `--warn` | 4 | "Bus 31 — 4 breakdowns" | "Four in 30 days, all electrical. The fleet average is one." | `figure(count)` | Buses, that bus's history |
| 9 | A bus tonight with no driver | `assignDriver` | none | `seat` | `--warn` | 4 | "Bus 31 — no conductor" | "Picked to run tonight. One seat still empty." | `figure(empty, {unit: 'seats'})` | Duty board, that bus |

**Nine kinds, ten capability paths**, because kind 3 is one mark over two capabilities
and two privacy rules: a bus paper is `fleet`, a crew document is `manageDrivers` and is
permission-or-self (`02 §4.3`; it leaked once, `02 §6.2`). They share a mark and they
must never share a query. Merging them is the single easiest way to leak a crew member's
licence to a role that may only see buses.

**Stage 1 left the per-row capability names unstated** (§4.3 says "`viewAttention` +
**per row kind**" and enumerates the kinds, not the names). The ten above are chosen
from the 37 in `02 §2` that exist today, each the narrowest existing capability that
already guards the thing the row is about. They belong back in the UX doc as a decision,
not here; they are listed in this document's report.

**What is never on this screen**, from stage 1 §4.1 #2: anything a person cannot act on;
any row whose capability this person does not hold; and **any count that can never reach
zero** — "110 of 110 missing documents" and "67 buses need a driver" against 54 drivers
are the app teaching its user to scroll past red. Kind 9 can reach zero only because
tonight's buses are picked first; **if the nightly store is refused, kind 9 is removed
from this screen**, not left as a number that cannot reach zero.

### 3.3 The ranking, exactly

One comparator, pure, over the index built in §3.4. Four keys:

1. **`band` ascending.** Four bands, each a fixed integer on the row kind, from the
   table above:
   - **1 — somebody is standing still or somebody is unsafe**: kinds 1, 7.
   - **2 — money is leaving**: kinds 5, 6, 4.
   - **3 — a clock that ends in a fine or a stopped bus**: kinds 3a, 3b.
   - **4 — work waiting on a person**: kinds 2, 8, 9.
2. **the band's own basis**, and each band has exactly one, so **no cross-unit
   comparison exists anywhere in this screen**:
   - band 1: hours since it became true, **descending** (longest standing first).
   - band 2: rupees, **descending**.
   - band 3: days until expiry, **ascending** (expired is negative, so most overdue
     first).
   - band 4: hours since it became true, **descending**. Kind 8's "became true" is its
     most recent breakdown; kind 9's is the time tonight's record was created.
3. **`id` ascending**, so a tie is stable and the list does not shuffle between two
   draws of the same data.

**Why bands and not one money number.** Stage 1 asks for "ranked by money and safety",
and money and safety are not the same unit. A single number would mean pricing a brake
failure, and whatever number was chosen would be wrong and would be in the source. Bands
say what the order means in four words each, and inside a band the comparison is real.

**Why kind 9 is band 4 and not band 1 after a cutoff.** The obvious refinement is to
promote "a bus with no driver" to band 1 as the evening approaches. It needs a time, and
the only time available is the device clock — which is the clock that already loses
records on the `updatedAt` comparison (LIVE-ISSUES 1). A ranking that moves with a wrong
clock is worse than a stable one that is one band too low, and the crew manager's own
Today is where that work actually lives. Rejected deliberately.

### 3.4 Performance: the measured bug, and what stops it coming back

| Rule | Specification | Why |
|---|---|---|
| **One index, built outside any render** | `attentionIndex()` runs when a store it reads has a new content signature (`cachedSig(store)`), never from a draw function. It does one `getAll()` per store it needs, turns each into rows, and returns the sorted array plus the four filter counts | `computeInsights()` at 386 ms per render is this rule being broken. `cachedSig` already exists in the live app and is gate-checked |
| **The stores, named** | `gatechecks`, `jobcards`, `buses`, `drivers`, `challans`, `parts` + `audits` + `stockmoves`, `ledger`, `driverreports`, `breakdowns`, `dutylog` + the nightly store. **Twelve reads per index build, not per row and not per render** | Thirteen `getAll()` calls on a 4-second tick would be the whole bug restated |
| **The comparator is pure and allocates nothing** | Four integer/number comparisons on fields already on the row. No date parsing, no formatting, no store access inside the sort | A comparator that parses a date is O(n log n) parses |
| **Nothing measures a row** | No `offsetHeight`, `getBoundingClientRect`, `getComputedStyle` | foundation §2.3 rule 2 |
| **No `at` on any figure in any row** | The screen states its freshness once, in the list header. `figure(v, {unit})` inside a row, or `figure(null)` for unknown | `at` adds `.figure-note` as a **block**, which triples the row height and runs `ageWords()` 200 times (foundation §2.3 rule 4) |
| **One string, one insert** | The 200 rows are one string and one `insertAdjacentHTML` | Per-row `appendChild` cost 277 ms per page before batching |
| **Capped at 200, never windowed** | `v2row-why` has a wrapped reason, so its height is variable — 72px yard, about 88px in Hindi — and windowing needs a height it can compute without measuring. So the cap is the mechanism, and the list ends with one line: "200 shown. 46 more. Use the filters above." | foundation §2.4, consumed whole. A capped list with a stated remainder is not a count that cannot reach zero |
| **The filters narrow the index, they do not re-read** | `.tabs` selects a band; the index is already sorted, so a filter is one pass over an array in memory. A filter never navigates and never writes | foundation §3.6 |

**Three checks stage 3 owes this screen**, because a rule nobody can fail is decoration:

1. Build the index, draw, redraw with **no** sync in between, and assert the store-read
   counter did not move.
2. Draw 200 `v2row-why` rows in the `#perf-bed` block of `predeploy-gate.sh`, each with
   a mark, a two-line reason and a figure, and assert the fastest of three runs is inside
   the threshold. **The threshold is a placeholder set on a developer's Mac
   (`DECISIONS.md §9`)** and the instruction, not the permission, is to tighten it to the
   office PC's reading.
3. Assert no `.figure-note` element exists inside any `.v2row` on this screen, in either
   density. That is rule 4 made falsifiable; it is the rule a well-meaning builder will
   break first, because "every number says when it was last true" reads like it applies
   per number.

### 3.5 Structure

**Phone (yard):**

```
.apphead                  "Attention"                              64px
.appbody  padding-top --s6
  .tabs  role=tablist     All (41) · Safety (3) · Money (12) · Papers (19) · Waiting (7)
  .att-fresh              clock + "Updated 4 minutes ago"          --t6 --ink-dim
  a.v2row.v2row-why       x up to 200                              min-height 72px
  .att-more               "200 shown. 46 more. Use the filters above."   --t6 --ink-dim
  .card  "Ask about the business"   (one field + one button)
```

- The `.tabs` strip scrolls horizontally at 360px (`components.css` already does), five
  tabs, each `min-height: var(--tap)`, selected one `--accent-text` plus a 2px
  `--accent` bottom bar — **never colour alone**.
- Each tab's count is `figure(n)` — and `figure(null)` while the index is building, so a
  dash, not a 0. "Unknown" and "zero" must never look alike.
- The rows are full-bleed: the list negative-margins `--pad` so the hairline reaches the
  edge, and each `.v2row` keeps its own `padding: 0 var(--pad)`. This is the one
  full-bleed list in this document.
- The advisor field is **last, not first**: it is the most expensive path in the product
  (6 sequential Opus calls) and the ranked list is what the person came for.

**Desk:** the same single column, not capped to 900px (it wants the 864px the rail
leaves). Rows stay `v2row-why` and keep their wrapped reason — **this is the one list in
the product that does not become a one-line desk row**, because the reason is the
content. The filter set moves to the header's trailing slot as a `.btn` carrying
`icon('filter')` only if a sixth filter is ever added; with five, the strip stays in the
body at both densities.

### 3.6 Scoping, and the half of it that is not ours

| Layer | What it does |
|---|---|
| The screen | Declares `viewAttention`. A person without it has no Attention tab and no path; §1.10's no-permission state is unreachable by construction |
| The row kind | Each of the ten paths in §3.2 is checked **before the kind's query runs**, not after. A kind the person does not hold is never read from a store, so it costs nothing and cannot leak through a figure, a filter count or the remainder line |
| The filter counts | Computed over the rows this person actually holds. **A count that includes a row the reader cannot see is a leak with no row attached**, and it is the subtlest one on this screen |
| The identity rule | Kind 2 only: `closedBy !== me.id`, applied for **every** role including the owner. The live app already has this filter at `app.js:3019` and skips it for supervisors; v2 applies it to everybody |
| The remainder line | "46 more" counts only rows this person holds |
| **The server** | **Not ours, and it is the larger half.** A conductor token with zero capabilities can `/pull` supplier bills, the stock ledger, job-card costs, fuel, trip cash, challan liabilities, all-staff attendance, and gate checks with their selfies (LIVE-ISSUES 2). Every rule above is a curtain until the same declaration drives what the server sends. Stage 1 §4.3 says this is stage 3's single largest security item **and is now less likely to be done** because the decision that would have forced it was withdrawn. Restating it is all a UI spec can do |

### 3.7 States

| State | Specification |
|---|---|
| loading | `skeleton(6)`. The `.tabs` strip draws **immediately**, with every count as `figure(null)`. Attention ranks across twelve stores and is the screen most likely to be slow, so it draws its chrome first and fills in |
| empty | `emptyState('Nothing needs you', {icon: 'ok', hint: 'Checked just now.'})`. **This is the state the whole screen exists to be able to reach.** If the count can never be zero, the screen is lying |
| one item | One row, no remainder line, and the filter counts still drawn (the other four read 0, which is a real zero and reads as one) |
| far too many | 200 rows, then "200 shown. 46 more. Use the filters above." Never a longer list, never an infinite scroll, never a page control |
| error | `errorState(text, onRetry)` for the whole list when the index could not be built. **A single row that cannot be ranked** — a missing basis, an unparseable date — is **dropped from the ranking and listed at the end under its own heading**, "Could not be ranked (3)", never ranked at zero and never silently discarded |
| offline | The list keeps its rows and the header reads "No signal since 06:40". The rows are from the local database and are real; only their age is in question. The advisor field says **before** the person types in it: "Needs a connection. It will not send now." |
| half-finished | A row whose fix was begun on another phone is still a row. The copy never says a thing has not happened, only that it has not happened **here**: a second-signature row reads "not signed off here yet", never "nobody has signed this off" — under whole-record last-write-wins two people signing off one card is a conflict, so the row and the card both carry the `at` of the reading (foundation §3.8) |
| no permission | A row kind the person does not hold is **absent**, and so is its filter count's contribution. A person with `viewAttention` and no row kinds gets the empty state above — and that case is unreachable for the two roles who have this screen, because both hold all ten paths in `02 §2` |

### 3.8 Interactions

| Control | Does | Pressed | Focus | Disabled / working |
|---|---|---|---|---|
| a row | Goes to where it is fixed. **Every row goes somewhere: the row is the reason, the link is the fix.** A row with no destination is not a row | `scale(0.97)`, 120 ms `ease-out` | `outline-offset: -2px` | A row the person cannot act on is absent |
| a filter tab | Changes what is drawn. **Never navigates, never writes.** A tab must not push a route, or a back press walks back through filters instead of leaving the screen | `scale(0.97)`, 120 ms | `outline-offset: -2px` (the strip clips an outer ring) | A filter that would return nothing is still **shown**, and selecting it shows the empty state naming it: "Nothing under Money." Hiding it makes the person wonder where it went |
| "Ask" (the advisor) | Sends the question, opens the answer in a sheet | `scale(0.97)`, 120 ms | `outline-offset: 2px` | `aria-disabled="true"` while in flight, label "Asking..." (**no spinner**, and no animation: this is the one control on the screen whose wait is seconds, and a 6-call path cannot be made to feel fast by a moving thing). Disabled outright with a word when there is no connection |
| the advisor field | Takes a question. Tapping it does **exactly one** thing: puts the caret in it | none — a field is focused, not pressed | `outline-offset: 2px` | The screen's one delegated click listener returns early when `ev.target.closest('input, select, textarea, label, .num')` is non-null, **before** it reads `[data-act]` or `[data-nav]`. This is the line the shelf-count regression was missing, and the gate at `predeploy-gate.sh:508` and the sweep at :1073 both check it |

### 3.9 Copy

| Id | English | Note |
|---|---|---|
| `attTitle` | Attention | |
| `attAll` / `attSafety` / `attMoney` / `attPapers` / `attWaiting` | All · Safety · Money · Papers · Waiting | The four bands plus all, in the bands' own order |
| `attEmpty` | Nothing needs you | |
| `attEmptyHint` | Checked just now. | |
| `attEmptyFilter` | Nothing under Money. | Names the filter that was asked |
| `attMore` | 200 shown. 46 more. Use the filters above. | Three clauses |
| `attUnranked` | Could not be ranked (3) | |
| `attHeld` | Bus 14 held at the gate | |
| `attSecondSig` | Closed 2 days ago by Suresh, needs a second signature. | Never the word "verified" on a card nobody has verified |
| `attNotHere` | Not signed off here yet. | Never "nobody has signed this off" |
| `attExpired` | Expired 6 days ago. | |
| `attExpires` | Expires in 9 days. | |
| `attAskTitle` | Ask about the business | |
| `attAskPlaceholder` | What is costing us the most this month? | A real question, so the person can see the shape of one |
| `attAsk` | Ask | |
| `attAsking` | Asking... | |
| `attAskSlow` | This takes up to a minute. | Price the thing before the person presses it |
| `attAskOffline` | Needs a connection. It will not send now. | Said **before** they fill it in |

One carried copy rule: a challan check action anywhere must show what a lookup costs
before it is pressed — "Check challans (uses 1 credit)" — because each one spends a
billable credit and the manual has to teach "use *Check unchecked*, not the whole fleet
out of habit". **That action is on Buses, not here**; Attention's challan row only
reads. Stated so it is not added here by someone who reads row kind 4 and reaches for
the obvious button.

---

## 4. Me (#12) — "Am I checked in, what is mine, and what is this device doing?"

The one screen all eight roles have, and **for a driver and a conductor it is the whole
app** (`DECISIONS.md §7`, stage 1 §3.4). It is also Me's second deliberate capability
exception: the screen declares nothing, and every row inside it is own-record or
capability-scoped.

### 4.1 Two shapes, one screen

| | Nav-bearing (owner, supervisor, store, mechanic, crewmanager, office) | Whole app (driver, conductor) |
|---|---|---|
| nav | Bar at yard, rail at desk. Me is the last slot | **None** (§1.4.1) |
| back | None (Me is a destination) | **None**, ever |
| header | Title "Me" | Title "Me" |
| bottom padding | `calc(var(--nav-h) + env(safe-area-inset-bottom))` | `calc(var(--pad) + env(safe-area-inset-bottom))` |
| blocks | 1, 2, 3, 5, 6, 7, 8 (owner), 9 | 1, 2, 3, **4**, 5, 6, 7, 9 |
| density | Per §1.2, by the machine | Almost always yard — an old Android, Hindi-first |
| the first thing | The greeting, then **Check in** | The greeting, then **Check in**. It is what the business needs from these two roles (attendance is wages in practice, Q10) and what they came for |

### 4.2 Structure, block by block

```
.apphead                "Me"                                  64px
.appbody  padding-top --s6
  .greet                mark in a 40px ring, name, role, garage          block 1
  .card                 Check in / Check out  (.btn-primary, full width) block 2
  .card  "Your attendance"      up to 12 .drow                          block 3
  .card  "Something is wrong with my bus"   (driver, conductor only)     block 4
  .card  "Yours"                documents, reviews, coaching, score      block 5
  .card  "This phone"           sync state, what is missing and why      block 6
  .card  "Settings"             language, theme, PIN                     block 7
  .card  "Owner only"           import, who opened what, garage setup    block 8
  .btn-danger             Sign out                                      block 9
  (end)                   --s7 of space before the padding, so Sign out is never flush against the bar
```

| Block | Element and tokens | Content | Scope |
|---|---|---|---|
| **1** greeting | `.greet` + `.greet-av` (40px ring, `icon('me')` at 20px, `--accent`) + `.greet-hi` at `--t3` + two lines at `--t5` `--ink-dim` | The person's name; "Driver · Mahalaxmi Travels". **This is the block that does the nav's first job** for the two roles that have no nav: say whose app this is (foundation §3.7.1) | own record |
| **2** check in / out | `.card` with one full-width `.btn-primary`, `min-height: var(--tap)` | "Check in" or "Check out", by today's last `attendance` record. Takes a live face (`photoCapture`, `--thumb`) and the location, and records the late and too-far flags. On success: `V2.toast('Checked in at 08:14', {kind: 'ok'})` | own record; `attendance` is append-only for non-managers, `userId` from the token, server receive time (`02 §4.4`) |
| **3** attendance | `.card` + up to 12 `.drow`: `.drow-i` = `icon('clock')`, `.drow-l` = "In · 08:14 · 40 m from the garage", `.drow-v` = a `badge-warn` "Late" when flagged. A `--thumb` selfie thumbnail opens `V2.openPhoto` | The person's own last 12 records. **Self only** | own record |
| **4** something is wrong with my bus | `.card` + one `.btn` carrying `icon('warn')`, opening a sheet: the area (a `select`), then voice or photo (`photoCapture`, `--thumb`) | **Driver and conductor only.** This screen's one consumer of the photo primitive and of `warn` + `camera` (foundation §3.7.1 rule 3). Writes `driverreports`; the server already drafts a job card from it within ten minutes and pushes the owner if it reads as unsafe | the server permits `driver` and `conductor` (`02 §4.4`). **No new capability for either role** |
| **5** yours | `.card` + four `button.v2row`: **Your documents** (`doc`, `.sub` = "Licence expires in 11 days" in `--warn` when inside 30 days, else the count); **Your reviews** (`review`, `.sub` = "4.2 stars from 31 reviews"); **Your coaching note** (`star`, `.sub` = "Written Monday. Three lines."); **Your score** (`star`, mechanic only, `.sub` = the three numbers) | Each opens a sheet. Every one of these already has a server path that returns the caller's rows only: `/my/reviews`, `/my/coaching`, `driverdocs` permission-or-self | own record, all four. **The conversation log about a crew member is never here and never reaches the person it is about** ([E] 4a42e38) |
| **6** this phone | `.card` + `.drow` facts: **Waiting to send** (`figure(n)`), **Last sent** (`figure(v, {at})`), **Records on this phone** (`figure(n)`), **This phone holds** "4,120 of 9,300" when `replicaState().complete` is false. Then up to 5 `button.v2row` for records the server **refused** or **quarantined**, each with the reason in `.sub` and a Retry in `.act`. Then one `.btn` "Device and server" opening the sheet §1.9 also opens | all roles. **Stage 1 §7 measure 7 wants every refused, quarantined or dropped record surfaced with a reason and a retry. Two of the three are here. The third is not possible**: a record dropped on the `updatedAt` comparison returns 200 and the client clears the outbox (LIVE-ISSUES 1, live in `v2/sync.js` by `DECISIONS.md §14`). So the copy must not promise it — see §4.5 |
| **7** settings | `.card` + three `button.v2row`: **Language / भाषा** (`.act` = "English" or "हिंदी"), **Theme** (`sun` / `moon`, `.act` = "Light", "Dark" or "Follow the phone"), **Change my PIN** | all roles. Language and theme are device settings and work offline; **setting a PIN needs the network** and the sheet says so before the person fills it in (`03 §6`) |
| **8** owner only | `.card` + up to three `button.v2row`: **Who opened what** (`person`, §4.3); **Import from Excel** (`add`, `.sub` = "Only on an empty database"); **Garage setup** (`edit`) | `viewAdoption` for the first, `addPurchase` for the second (`/admin/import` is owner + token and refuses a non-empty database), `garageSetup` for the third. **Stage 1 §4.1 #12 lists import and who-opened-what and does not list garage setup**; it is here because §3.7 step 6 names Me as one of the three places rare admin lives, and because it is a row rather than a screen. If stage 1 disagrees, it is one row to delete |
| **9** sign out | `.btn-danger`, full width | "Sign out", via `V2.confirmDialog` with focus on **Stay** (§1.7) | all roles |

**Desk:** `.appbody` is `max-width: 900px`. The cards stay one column — Me is read top
to bottom once, not scanned — and rows go to one line, so block 5's `.sub` moves into
the row's `.act` as a figure where it is a number ("4.2 stars") and is dropped where it
is a sentence ("Written Monday"). Block 3's twelve `.drow` facts are unaffected: a
`.drow` is not a `.v2row` and has no two-line rule.

**What must not be on it**, from stage 1 §4.1 #12: **a normal-looking empty screen.**
"Everything exists, just no data" has had at least eight distinct causes and the only
symptom the user ever saw was silence. Every block above either has own-record content
that always exists (1, 2, 7, 9), or states which empty it is (3, 5, 6), or is absent for
this role (4, 8). **There is no state in which this screen draws its headings and no
content** — and for a driver or a conductor that is not a nicety, it is the whole
application.

### 4.3 The who-opened-what readout

New, from `DECISIONS.md §5`: because the money is now deliberately shared with the
supervisor, the owner should be able to see who opened what. It is a read of data the
app has been recording all along — **not a thirteenth screen, and not a report**: one
person, one rare moment, one row on Me (stage 1 §3.7 step 5).

| | |
|---|---|
| The row | `button.v2row`, `.lead` = `icon('person')`, `.t` = "Who opened what", `.sub` = "Last 7 days", `.act` = `figure(peopleCount)` |
| Opens | `V2.openSheet('Who opened what', ...)` |
| The data | The `usage` store, one row per person per day: `{id: '<userId>|<YYYY-MM-DD>', userId, name, role, date, screens: {name: count}, acts: {name: count}, slow: {...}, taps, firstAt, lastAt}` (`03 §2`, row 21). The device keeps 120 days; the server keeps 90 (`USAGE_HISTORY_DAYS`) |
| The sheet | `.tabs`: **7 days** / **30 days**, mutually exclusive. Then one `div.v2row` per person — **not pressable: there is nowhere to go** — `.t` = the name, `.sub` = "Money 4 times. Attention 11 times. Last opened 2 days ago.", `.act` = `figure(taps)`. Then a second block, "Never signed in", listing names from `users` with no `usage` row in the window and no `lastLoginAt` |
| The order | People who opened **Money** most, first; then everybody else by last opened, most recent first; then `userId` ascending for stability. Money first because that is the question the decision asked |
| The cap | 200 people, then "200 shown. 46 more." Aggregated **once per content signature**, one `getAll('usage')`, never per render and never per row |
| The owner is in it | His own rows appear like anybody's. A record of who looked at the money that excludes the person who asked for it is a different kind of record |
| Scope | `viewAdoption`, which stage 1 §4.3 creates in place of `openUsage`'s `dashboard` |

**The read boundary, which this row needs narrowed and cannot narrow.** The server sends
`usage` to **owner and supervisor** today (`03 §2.1`). So as it stands a supervisor's
device holds the record of who looked at the money, **including their own**, and
`viewAdoption` only stops the row being drawn. The records are on the phone and a
devtools console reads them. Therefore:

- The client check is specified above and is worth having (it is what makes the row
  owner-only in the interface).
- **It is not a boundary until `usage`'s entitlement is narrowed to owner in the
  server's read scope.** That is a server change, not a client setting, and stage 1
  §4.3 already carries it. It is named here again because this row is the one place in
  the product where a client-only check guards a record *about* the people it is hidden
  from, and this codebase has six recorded cases of a client-only rule being walked
  around (`02 §6.1`, `02 §6.2`).
- **Copy consequence:** the sheet must not promise privacy it does not have. There is no
  line saying "only you can see this". It says what it is — "Who opened what" — and
  nothing about who else can.

### 4.4 States

| State | Specification |
|---|---|
| loading | Blocks 1, 2, 7 and 9 draw immediately — they need no store read (the session has the name, the role, the language and the theme). Blocks 3, 5, 6 and 8 draw their heading and `skeleton(3)`. **The screen is never blank**, and for two roles that is the difference between an app and the dead end of [E] 8db78e7 |
| empty | Per block, naming which empty it is. Block 3: "No attendance yet. Check in above." Block 5 documents: "No documents on your record. Ask the office." Block 5 coaching: "No note yet. One is written every Monday." Block 5 reviews: "No reviews yet." Block 6 refusals: the list is absent when there are none, and the facts above it are not |
| one item | One `.drow`, one row, no remainder line |
| far too many | Block 3 is capped at 12 by its own definition (own last 12 records) with no "See all" — there is no Attendance screen to go to, and stage 1 did not ask for one. Block 6's refusal list caps at 5 with "See all (23)" opening the device sheet. The usage sheet caps at 200 with a remainder line |
| error | Per block, `errorState(text, onRetry)`. **Block 2 is the exception**: a check-in that fails is a `V2.toast(msg, {kind: 'bad'})` and the button returns to "Check in", because the sheet has closed by then and the person is standing at a gate |
| offline | Blocks 1, 2, 3, 4, 7 (language, theme) and 9 all work: they are local writes, which is most of what this app is for. **Three things do not and say so before they are pressed, in the body, not after**: Change my PIN, Import from Excel, and any live face upload — the capture works, the upload waits. Block 6's facts are the most useful thing on the screen in this state and they are already there |
| half-finished | A check-in that captured a face but could not get a location: the record is **saved**, the attendance row reads "In · 08:14 · location not recorded", and block 6 counts it as waiting to send. **The capture is never discarded for a missing location** — "check-in fails silently with no camera" is on record, and if attendance decides wages (Q10) a silent failure is a wages bug, not a UX bug. A bus-fault report with a photo that could not upload: the tile says "On this phone only" with the `offline` mark and the grid's hint says "Sends when there is wifi" (the named 20 MB data-URL case) |
| no permission | Blocks 4 and 8 are **absent** for the roles that do not hold them. No greying, no heading. Blocks 1, 2, 3, 5, 6, 7 and 9 are own-record and every role holds them, which is why this screen can be two roles' whole app without a single capability between them |

### 4.5 Interactions

| Control | Does | Pressed | Focus | Disabled / working |
|---|---|---|---|---|
| Check in / Check out | Opens the capture, writes `attendance` | `scale(0.97)`, 120 ms `ease-out` | `outline-offset: 2px` | `aria-disabled="true"` while the write is in flight, label "Checking in..." — **no spinner, no animation** (foundation §3.3: while a write is in flight the submit button says what it is doing) |
| a `button.v2row` in blocks 5, 7, 8 | Opens a sheet | `scale(0.97)`, 120 ms | `outline-offset: -2px` | A row the person may not use is absent |
| a selfie thumbnail | `V2.openPhoto(src, caption)` — full size inside a sheet, **not a new overlay kind** (`overlay.js` has 100 checks behind its focus, scroll-lock and dismissal) | `scale(0.97)`, 120 ms | `outline-offset: 2px` | n/a |
| the capture label (block 2, block 4) | Opens the camera. A label-wrapped `input[type=file][capture]` — the only way to reach a camera on Chrome 109 without script | `scale(0.97)`, 120 ms, on the label | `:focus-within` on the **label**, `outline-offset: 2px`; the input is `.sr-only` (clipped, still in the accessibility tree, **never `display: none`**) | n/a |
| Retry (a refused record) | Pushes that record again | `scale(0.97)`, 120 ms | `outline-offset: 2px` | `aria-disabled="true"` + "Sending..." while in flight |
| Language | Toggles EN / हिंदी **in place**, no reload | `scale(0.97)`, 120 ms | `outline-offset: -2px` | n/a. The document's `lang` changes, which is what drives `--font-hi` and `--lh: 1.7` through `:lang(hi)` — one source, not two |
| Theme | Cycles Light / Dark / Follow the phone | `scale(0.97)`, 120 ms | `outline-offset: -2px` | n/a. Writes `data-theme` **onto the same element as `data-v2`**, which `tokens.css` requires |
| Sign out | `V2.confirmDialog`, focus on **Stay** | `scale(0.97)`, 120 ms | `outline-offset: 2px` | n/a |
| the usage sheet's period tabs | Changes what is drawn | `scale(0.97)`, 120 ms | `outline-offset: -2px` | A period with no rows shows the empty state naming it |

### 4.6 Copy

| Id | English | Hindi |
|---|---|---|
| `meTitle` | Me | needed |
| `meCheckIn` / `meCheckOut` | Check in / Check out | needed |
| `meCheckingIn` | Checking in... | needed |
| `meCheckedAt` | Checked in at 08:14 | needed |
| `meAttendance` | Your attendance | `attendance` exists (`i18n-hi.js` line 17) |
| `meNoLocation` | Location not recorded | needed |
| `meLate` | Late | needed |
| `meBusWrong` | Something is wrong with my bus | needed — **and this is the highest-value Hindi string in the product**: it is one of two writes on the one screen two whole roles ever see |
| `meYours` | Yours | needed |
| `meDocs` | Your documents | needed |
| `meDocsExpiring` | Licence expires in 11 days | needed |
| `meReviews` | Your reviews | needed |
| `meCoaching` | Your coaching note | needed |
| `meScore` | Your score | needed |
| `mePhone` | This phone | needed |
| `meWaiting` | Waiting to send | needed |
| `meLastSent` | Last sent | needed |
| `meHolds` | This phone holds 4,120 of 9,300 records | needed |
| `meRefused` | 3 records the server would not take | needed. **Not** "rejected", **not** "payload refused" |
| `meRefusedHint` | They are still on this phone. Tap one to see why. | Three clauses: what happened, what is kept, the one next thing |
| `meOnPhoneOnly` | On this phone only | needed |
| `meSendsOnWifi` | Sends when there is wifi | needed |
| `meSettings` | Settings | needed |
| `meLang` | Language / भाषा | `lang` exists (line 17) |
| `meTheme` | Theme | `theme` exists (line 17) |
| `meThemeFollow` | Follow the phone | needed |
| `mePin` | Change my PIN | needed |
| `mePinOffline` | Needs a connection. Try when there is signal. | needed |
| `meOwnerOnly` | Owner only | needed |
| `meWhoOpened` | Who opened what | needed |
| `meImport` | Import from Excel | needed |
| `meImportHint` | Only on an empty database | needed |
| `meSetup` | Garage setup | needed |
| `meSignOut` | Sign out | `logout` exists (line 17) |
| `meSignOutBody` | Your records stay on this phone. | needed |
| `meStay` | Stay | `cancel` exists (line 17) and is the right word in Hindi for this button |

**The copy that is deliberately not written.** Block 6 says "3 records the server would
not take. They are still on this phone." It does **not** say "everything else was sent",
"all changes saved" or "you are up to date", because LIVE-ISSUES 1 means a change can
have vanished with the screen saying it sent. A true statement about what is on this
phone is available and is what is written; a statement about what the server has is not,
and must not be invented to make the card read better.

**And one question this screen must never ask.** A conflict is never surfaced as
"Overwrite?", "Save anyway?" or any other abstract confirmation. Two reasons, and the
second is the one that matters: the comparison behind it is `updatedAt` from a **device
clock**, so a phone running slow would ask its user to confirm an overwrite on every
save until they learned the dialog meant nothing — and a confirmation people have been
trained to dismiss is worse than no confirmation, because it turns the data loss into
consent. So on Me, and on every screen in this document: **a conflict is reported as a
named refusal with a reason and a Retry** (block 6), never as a question. If a question
is ever unavoidable, it names the field and both values — "Odometer: this phone says
48,900, the server says 49,310" — and never asks about a record in the abstract. The
merge policy itself is a data-layer contract and is not this document's; what is this
document's is the rule that no screen here is designed on the assumption that the policy
has been fixed, and no screen here asks a person to adjudicate a clock.

### 4.7 The three places Me hands out an upload URL

`LIVE-ISSUES.md` issue 7, verified in source: `GET /uploads/<name>` at
`sync_server.py:5231` authenticates nothing. The name is 32 hex characters, so this is
the capability-URL pattern and the bytes are infeasible to guess — but there is no
revocation, the URL leaks through a `Referer` header, a screenshot or a forwarded
message, and **every rule in `redact_for` about who may see a crew member's documents is
bypassed by holding the link.** Behind those URLs: Aadhaar and licence photographs,
attendance selfies, supplier bills, repair photographs.

**Me is the screen that hands the most of them to the least privileged person**, because
for a driver and a conductor it is the whole app and everything on it is their own
record. The three places:

| Block | What it hands out |
|---|---|
| 3, attendance | The person's own check-in selfies, up to 12, as `--thumb` thumbnails |
| 5, Your documents | **The person's own identity documents** — the licence, and whatever else the office uploaded |
| 4, something is wrong with my bus | The photograph they just took, once it has uploaded |

**What this spec does about it, which is narrow:**

1. **Never a link.** An upload URL appears in exactly one place: the `src` of an `<img>`
   inside `V2.openPhoto`. No `<a href>`, no "Open in new tab", no "Copy link", no "Share",
   no "Download". A thumbnail is a `button`, not an anchor — which is already the photo
   primitive's contract, and this is the reason it matters rather than a style.
2. **`referrerpolicy="no-referrer"` on every `<img>` whose `src` is an upload URL.** That
   closes the one leak on the issue's list that the interface owns, costs nothing, and is
   inside the floor (Chrome 70+).
3. **Words before pictures.** Block 5 lists a document by **type and expiry in words**
   and loads no image until an explicit tap. A licence photograph that nobody asked to
   see is a request to an unauthenticated endpoint that nobody asked for, and it puts the
   URL in the browser's cache and history of whatever device is in that person's hand.
4. **No photograph of another person, anywhere on this screen.** Everything here is
   own-record, which is the one thing that makes the leak's blast radius equal to the
   person holding the phone.

**What this spec does not do, said plainly:** none of the above is a fix. The fix is a
session token on every `<img>` (so the service worker attaches it) or short-lived signed
URLs, it has to cover the R2 bucket as well, and `LIVE-ISSUES.md` records it as the
owner's call because a wrong move breaks photographs on a hundred devices. **It is not
in this cut and it is not a UI decision.** My recommendation, for the record and for
whoever takes it to him: it is worth doing for the identity documents in block 5 and
arguably not for a repair photograph, which is the issue's own reading and matches what
these three blocks actually carry.

---

## 5. What a builder must not change, and what they may

### 5.1 Must not

1. **Any of the 33 tokens**, by name or value. Each hue's lightness is tuned separately
   for contrast; regularising them fails `test_ui_tokens.js`.
2. **The `[data-v2]` scope**, and `data-theme` / `data-density` on the same element.
3. **No colour literal anywhere.** `hsl()` tokens only — no hex, no `rgb()`, no keyword,
   not `transparent`, not `currentColor` as a new colour.
4. **The Chrome 109 floor.** The banned list is `DECISIONS.md §1` and
   `scripts/check-floor.py`; nothing above reaches for any of it.
5. **`transform` and `opacity` only, under 300 ms, never a bare `ease-in`.** These three
   screens contain no exception; the one exception in the system (the 1.5 s hold) is
   **Gate round's** after `DECISIONS.md §15` and lives outside `components.css`.
6. **`.v2row`, not `.row`.** The live app uses `.row` 237 times as a flex utility and the
   collision shipped to a home screen. 237 against 10: the system yields the name.
7. **The overlay API is `V2.*`.** Attaching bare `openSheet` / `toast` replaces the live
   app's functions for every call site that has not migrated.
8. **Status is never colour alone.** Every badge, figure note, toast, Attention mark and
   gate state carries a word and a mark too.
9. **Unknown, zero and stale are three different figures**, and **partial is a fourth**
   (§1.8). Pass the raw value and a `format` to `figure()`; never format first.
10. **No `at` on a figure inside a row**, on any of these three screens, at either
    density. The freshness is stated once per list.
11. **No new field on any record**, and no new store beyond the one `DECISIONS.md §8`
    needs. Under whole-record last-write-wins a field v2 invents is erased the next time
    a v1 device writes that record.
12. **The second signature's absent-not-disabled rule**: the verify control is absent
    when `closedBy === me.id`, for every role including the owner, and the closer's own
    closes never appear in the closer's own Attention queue.
13. **A row a person may not act on is not drawn.** Deny by default, per row, per block.
14. **Today's four-block cap**, and "no block links to more than one screen".
15. **Attention's 200-row cap with a stated remainder**, and its single `insertAdjacentHTML`.
16. **No fixed English word outside `words.js`**, and a missing Hindi value is a **build
    error**, not an English fallback.
17. **The two bottom-padding halves of §1.5**, which must stay equal to the nav's own box.
18. **No screen in this document asks a person to adjudicate a conflict** (§4.6). A
    refusal is named, with a reason and a Retry. "Overwrite?" is forbidden, and so is any
    confirmation whose answer depends on a device clock.
19. **An upload URL appears only as an `<img src>` inside `V2.openPhoto`, with
    `referrerpolicy="no-referrer"`** (§4.7). Never an anchor, never a copy, never a
    share, never a download, and never loaded before the person asks to see it.

### 5.2 May

1. **Compose freely** inside §0.3's primitives — rows in cards, tabs above lists, sheets
   from anywhere.
2. **Choose each screen's density container**, inside §1.2.
3. **Choose the words**, inside the copy rules, in both languages — the ids above are the
   contract, the wording is a builder's with the owner.
4. **Choose each list's order within the stated key**, and tighten a cap downwards if a
   reading says so.
5. **Tighten the 200-row threshold** once an office PC has been measured. That is an
   instruction, not a permission.
6. **Use `px` in a `border`, `outline` or `box-shadow` value**, and the three existing
   radii (8px controls, 12px panels, 999px pills).
7. **Reject anything here that a measurement contradicts**, and say so in the stage-3
   report rather than working around it. Every number above is either from a measured
   source, from the token file, or shown as arithmetic.

---

## 6. Status

**ok = true.** Nothing was halted and nothing the owner decides was decided here.

**Gate:** `python3 scripts/check-floor.py v2 ui` — green, 20 files, 0 violations.

### 6.1 What the foundation does not have

Three things, each named rather than invented, each specified above from the 33 tokens
only, and none of them a token or icon request:

1. **An app frame** — no header, no scroll container, no page title. §1.1, as
   `v2/ui/shell.css`.
2. **A persistent offline indicator** for a screen that has rows. §1.9, built from
   `.btn-quiet` + `icon('offline')`, no new CSS.
3. **A "still filling" figure** — `states.js` keeps unknown, zero and stale apart; a
   partial aggregate is a fourth thing. §1.8, as `stale: true` plus one sentence.

And one counting note, which resolved itself while this was being written: the
foundation sizes the rail for **twelve items** by counting screens, including the Job
card, which is not a destination. That was one item too many. `DECISIONS.md §15` then
added Gate round, which is a destination, so the rail really does hold twelve and the
foundation's `12 x --tap 32px = 384px` is now correct — by two offsetting errors rather
than by one right count (§1.3). Worth recording only because the next person to add a
screen will reach for that arithmetic: the number to count is **destinations**, not
screens, and `--rail-w` is decided by the longest label, not by either count.

### 6.2 Decisions stage 1 left open that this document had to make

These belong back in `v2-ux.md`, not here.

1. **Attention's ten per-row capability names** (§3.2). Stage 1 says "per row kind" and
   names the kinds, not the capabilities. Each of the ten is the narrowest existing name
   in `02 §2` that already guards the thing the row is about.
2. **Kind 3 is one mark over two capabilities** — a bus paper is `fleet`, a crew document
   is `manageDrivers` and permission-or-self. Nine kinds, ten paths.
3. **The ranking is four bands with one basis each** (§3.3), not one money number.
4. **Garage setup is a row on Me** (§4.2 block 8). Stage 1 §4.1 #12 does not list it;
   §3.7 step 6 names Me as one of the three homes for rare admin.
5. **Density is chosen by the machine, not the role** (§1.2).
6. **The header scrolls; the nav is the one fixed layer** (§1.4), because `overlay.js`
   locks `documentElement`.

### 6.3 The three specifications most likely to be wrong

1. **Today's four-block cap, and the owner's Today in particular.** Stage 1 §9 item 3
   already doubts that Today and Attention are two screens for the owner, and this spec
   makes his Today four tiles, five Attention rows and a digest card — which is close to
   a doorway with a number on it. The cap is also where a sixth role's block will be
   argued for first (the storekeeper already uses all four). Measure 4, read per role,
   settles both within a month, and the cheap outcome is deliberate: if the owner's Today
   is only ever a doorway, what is deleted is three blocks and no primitive.
2. **Attention's bands.** The order inside a band is defensible arithmetic; the order
   *of* the bands is a judgement — that a bus standing at a gate outranks ninety thousand
   rupees of unexplained stock. I believe that and cannot prove it, and the band integer
   is one number per row kind, so being wrong is cheap to correct and will not be noticed
   unless somebody looks. The falsifiable version: if the rows people actually tap are
   consistently below the rows they do not, the bands are wrong — and `usage`'s `acts`
   counters can say so without a new instrument.
3. **The "still filling" figure.** `stale: true` plus a sentence is a reuse of a
   primitive built for a different meaning ("the caller knows this value is old"), and a
   reader may take `--warn` and "Updated 4 minutes ago" to mean the number is complete but
   stale when it is actually fresh and partial. The alternative was a fourth figure state
   in `states.js`, which is foundation work and a 43-check suite, and I will not open that
   from a screen spec. If the first office reading shows people misreading a partial
   figure, this is the thing to fix, and the fix is `states.js`'s, not these screens'.

### 6.4 Dependencies stage 3 cannot start without

| Dependency | Whose | Blocks |
|---|---|---|
| The Hindi value for every id in §2.6, §3.9 and §4.6 | The owner (Q12 is a different question; this is just the list) | **The build**, by the foundation's own rule. Nine ids already have a Hindi value in `i18n-hi.js` or `words.js`; the rest are one sitting |
| `gatechecks`, `driverreports`, `dutylog`, `crewnotes` added to `FIRST_STORES` | The data-layer slice | Not the build. Without it Attention's safety rows and a driver's coaching note arrive behind the full drain, and §1.8's per-kind line is what keeps that honest instead of silent |
| `usage` narrowed to owner in the server's read boundary | The backend lead | Not the build. Until it moves, §4.3 is a client check over records a supervisor's phone holds, and the copy is written so it promises nothing it cannot keep |
| The one new store for tonight's running list | The backend lead (stage 1 §6) | Not the build. Today's crew-manager block 2 and Attention's row kind 9 are specified to be **removed** if it is refused, and nothing else on either screen moves |
| `_guard_write` tightened to `closedBy != verifiedBy` for every role | The backend lead (stage 1 §6) | Not the build. Until then §3.2 kind 2 and the Today supervisor block 3 are a UI convention, and v1 can still self-sign |
| The 200-row reading on an actual office PC | One person, five minutes, `ui/gallery.html` | Not the build, but it is the highest-value measurement in the foundation and §3.4's threshold is a placeholder until it exists |
| The per-store merge policy for `v2/sync.js` (LIVE-ISSUES 1) | The data-layer slice, **not this document** | Not the build. Every screen here is specified to work with the bug live, which is stage 1 §6's instruction: "v2 must not design any flow that depends on it being fixed." What this document owes that contract is two things, both already in it — the field division it relies on (the supervisor owns the card, the mechanic's two taps write two fields nobody else writes, the storekeeper writes the one field the server merges) and the rule that **no screen here asks a person to adjudicate a clock** (§4.6) |
| A decision on `GET /uploads/<name>` (LIVE-ISSUES 7) | The owner, as the issue says | Not the build and **not in this cut**. §4.7 lists the three Me blocks that hand out such a URL, so the decision has a list rather than a category, and specifies the four things the interface can do without pretending to have fixed it |

**Written to:** `docs/v2/plan/screens-shell.md`
**Specifies:** the shell, and 3 of the 13 screens — Today (#1), Attention (#2), Me (#12).
**Reconciled with:** `DECISIONS.md §14` (v2's own copy at `v2/ui/`) and **§15** (Duty
board splits; twelve nav destinations), and `LIVE-ISSUES.md` issues 1, 2, 6 and **7**.
**Next:** the other ten, against this shell.

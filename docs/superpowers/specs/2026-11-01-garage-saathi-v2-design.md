# Garage Saathi v2 — design

**Status:** design approved in conversation; awaiting review of this document.
**Date:** 1 November 2026
**Decided by:** Bhuwan Garg (owner). Written by Claude.

This covers the design only. Identity, permissions, data and sync are described
here as far as the design depends on them; each needs its own spec before it is
built.

---

## 1. What this is for

The current app works and is used daily by around 100 people. It is also a
prototype that grew: 22,593 lines across five files, 14,184 of them in one
`app.js`, 47 screens, 37 permissions, 8 roles. The owner's words for it are
"very slow and old", and the measurements agree.

The goal is not a prettier version of the same thing. It is a smaller, faster
product that means something on the hardware the business actually owns.

### Fixed decisions

| Decision | Choice | Taken |
|---|---|---|
| Who it serves | Mahalaxmi only, tenant boundary in the data model from day one | 1 Nov |
| Office floor | Windows 7, Chrome 109 | 1 Nov |
| Driver phones | Old Android, exact versions pending the device check | 1 Nov |
| Sign-in | Enrol device once, short PIN after; office can revoke | 1 Nov |
| Build order | Design first | 1 Nov |

The owner chose design-first over a walking skeleton. The two risks of that
order — designing screens before knowing who may see them, and designing data
that arrives too slowly to show that way — are answered inside this document
rather than by changing the order: every screen is specified against the role
that opens it (§6) and against a measured performance budget (§8).

---

## 2. The constraints, measured

Nothing here is estimated. Browser support is from vendor documentation; the
timings are from a fleet-sized dataset of 80,700 records.

### Chrome 109 is the ceiling

Chrome 109 (January 2023) is the last version for Windows 7 and 8.1, and it
receives no further updates. Available and used: `:has()`, container queries,
grid, `@layer`, `aspect-ratio`, `gap` in flex, `tabular-nums`, `dialog`.

Not available, and therefore not used anywhere:

| Feature | Arrived in | Consequence |
|---|---|---|
| `oklch()`, `color-mix()` | Chrome 111 | Colour ramps are hand-tuned in HSL (§4.3) |
| View Transitions | Chrome 111 | Screen changes do not animate (which §3 wanted anyway) |
| CSS nesting | Chrome 112 | Flat selectors, `@layer` for order |
| Popover API | Chrome 114 | `dialog` and positioned elements instead |
| `text-wrap: balance` | Chrome 114 | Headlines wrap manually where it matters |
| `@starting-style` | Chrome 117 | Enter animations use the `data-mounted` pattern |
| `subgrid` | Chrome 117 | Grids are declared per level |

No polyfills. A polyfill is JavaScript, and JavaScript is the expensive thing
on this hardware.

### Emoji are not available either

The app draws **968 of its icons as emoji characters**, 150 distinct, including
two multi-part sequences (driver, mechanic) used 21+ times on the crew screens
the office uses most. Windows 7 never received the full emoji set — Microsoft
backported part of it to Segoe UI Symbol in an optional update whose own notes
say "there will still be rectangles" — and colour emoji arrived with Segoe UI
Emoji in Windows 8/8.1. On the office PCs a large share of those icons render
grey or as empty boxes.

The device check sent to the office measures this per machine rather than
leaving it inferred.

### What the app costs today

Measured at fleet volume (40,000 GPS events, 12,000 trip logs, 92 buses, 110
crew, 2,392 parts) on an M-series Mac. The office hardware is roughly 4–10×
slower, so these are the optimistic numbers.

| | before | after today's fixes |
|---|---|---|
| One button tap | 884 ms (write 1.1 ms, reload 883 ms) | 14 ms |
| Idle sync tick, every ~4s | 880 ms | 0 ms |
| All 110 crew scores | 808 ms **per render** | 0.3 ms |
| First home render | 988 ms | 283 ms |
| Crew bank re-render | 808 ms | 5.6 ms |

The causes were structural, not sloppy: `load()` re-read all 41 stores after
every write; `gpsEventsForBus()` scanned 40,000 rows and re-normalised every
registration once per driver (4.4 million string rewrites to draw one list);
and the memo guard itself walked every row on each check. All three are fixed
and deployed. They are recorded here because the new design must not reintroduce
the shape: **work proportional to the whole dataset, performed per item, inside
something that runs on every render.**

---

## 3. Principles

**1. Nothing animates that people see all day.** A mechanic opens a job card
dozens of times a shift; an animation there is a toll, not delight. Motion is
reserved for occasional events — a sheet opening, a toast. Navigation, lists,
tab switches and keyboard actions do not animate. What remains everywhere is
press feedback at ~100 ms, because that is the interface confirming it heard
you, not decoration.

**2. Chrome 109 is a design constraint, not a bug to polyfill.** See §2.

**3. Eight roles are not one app with things hidden.** Today a conductor
reaches 4 screens and an owner reaches 47, from one codebase that hides the
difference. That is why a driver's phone was downloading 40,000 GPS events it
was never permitted to see. See §6.

**4. Fewer screens is the product decision, not a side effect.** 47 screens is
itself the problem. See §5.

**5. A number must say when it was last true.** The app is offline-first, so
what is on screen is frequently not current. See §4.7.

---

## 4. Foundations

### 4.1 Icons

All 968 emoji are removed and replaced with one inline-SVG set of roughly 25
marks. Reasons, in order: emoji are a font dependency that Windows 7 cannot
satisfy; SVG inherits `currentColor` so a single mark works in every state;
there is no font to download; and a screen reader announcing "warning sign"
forty times in a table is noise that disappears with a labelled SVG.

The set is deliberately small. If a screen needs a 26th icon, that is a prompt
to ask whether the screen is doing too much.

### 4.2 Type

```
--font: -apple-system, "Segoe UI", Roboto, system-ui, Arial, sans-serif;
--font-hi: "Nirmala UI", "Segoe UI", Mangal, sans-serif;
```

System fonts only: Segoe UI on the office PCs, Roboto on the phones, both
already installed, zero bytes, no flash of unstyled text on a weak connection.

Windows 7 ships both Nirmala UI and Mangal but maps Devanagari to **Mangal** by
default; Nirmala is markedly better, so it is named first. Hindi is a first-class
language here, not a translation layer.

All figures use `font-variant-numeric: tabular-nums` so numbers stop shifting
as they update.

Scale is deliberately short — six sizes. Body text never goes below 15px on a
phone or 14px at a desk; these screens are read in a workshop.

### 4.3 Colour

`oklch()` and `color-mix()` are unavailable (§2), so ramps are built and tuned
by eye in HSL. HSL lightness is perceptually uneven across hues — which is the
exact problem `oklch` solves — so this is hand work, not a generated palette.

Tokens are semantic, never raw: `--ink`, `--ink-dim`, `--surface`,
`--surface-raised`, `--line`, `--accent`, `--ok`, `--warn`, `--bad`. The
existing orange is kept as `--accent`.

Both light and dark are supported and neither is an afterthought: a yard in
daylight needs light, a 4 a.m. shift needs dark.

**Status is never colour alone.** A failed gate check reads "FAILED" with a
mark, not merely red. These screens are read on cheap panels, in sunlight, by
people who may be colour-blind.

### 4.4 Spacing and density

A 4px scale. Two densities from one set of components:

- **Yard** — 48px minimum touch target, generous spacing, for phones
- **Desk** — 32px rows, compact, so a supervisor sees twenty buses without
  scrolling on a 1024×768 monitor

Desk baseline is **1024×768**, because that is what the office monitors are.

### 4.5 Motion

Per §3 and the frequency rule. Durations: press feedback 100–160 ms, toast and
sheet 200–250 ms, nothing over 300 ms. Easing is `ease-out` for anything
entering; `ease-in` is never used, because it withholds movement at the exact
moment the user is watching. Only `transform` and `opacity` are animated — on a
Core 2 Duo, animating layout properties drops frames visibly.

`prefers-reduced-motion` removes movement and keeps opacity.

### 4.6 Components

One set, both densities, no variants without a use: button (3 kinds), field,
select, row, card, table, sheet, dialog, toast, badge, tab, empty state, skeleton,
stat. Every pressable element gets `transform: scale(0.97)` on `:active` and a
visible focus ring — the office works on keyboards and mice, which the current
design largely ignores.

### 4.7 States

Every list and every figure specifies five states, not one: **loading, empty,
stale, error, offline.**

**Stale is first-class.** A number carries when it was last true and says so
when that is old. An owner reading today's collection must be able to tell he is
looking at a figure from before the phone lost signal. This is the difference
between information and a guess, and the current app does not make it.

Skeletons are used only where data genuinely takes time; everywhere else the
screen renders immediately with what it already has.

---

## 5. Information architecture: 47 screens become 14

### What the 47 actually are

Counted from the router: 47 screens, and **25 of them are reachable only by
owner and supervisor**. Only four are shared by most roles, and three of those
are home, settings and a photo viewer.

Several are already duplicates. `bills` and `purchases` render the same view —
the code notes that without its own entry the `bills` permission was bypassable
by using the other name. `livemap` and `track`, `challans` and `buschallans`,
`accounting` and `busacct` are each one idea addressed twice.

### The new set

Fourteen screens, organised around the things the business actually has rather
than around reports about them. Filters and tabs replace separate routes.

| # | Screen | Absorbs |
|---|---|---|
| 1 | **Today** | home — role-shaped; what needs this person now |
| 2 | **Buses** | fleet, buses, busreport, busacct, buschallans, linkgps, warranty, track |
| 3 | **Jobs** | jobs, newjob (an action), history (a filter), outsidejobs (a filter), gatepass (a document) |
| 4 | **Store** | store, storehealth, import, vendors, components |
| 5 | **People** | people, drivers, crewbank, scorecard, coaching, rbnames, driverdocs, crewpins |
| 6 | **Duty board** | assignments, whynodriver (a state, not a screen) |
| 7 | **Money** | money, accounting, company, bills, purchases, reports, forecast |
| 8 | **Fuel** | fuel, def |
| 9 | **Reviews** | reviews, digest |
| 10 | **Map** | livemap |
| 11 | **Attention** | alerts, insights, pilferage, safety, breakdowns |
| 12 | **Gate check** | gate, gatechecks |
| 13 | **Challans** | challans |
| 14 | **Me** | me, usage, scoreboard, scorecard (own) |

`viewPhoto` becomes a component, not a route.

**Attention (#11) is the one new idea.** Five separate screens today each answer
"what is wrong?" from a different angle, and nobody opens five screens. One
prioritised list, ranked by money and safety, with the reason attached — this is
what an owner opens in the morning instead of guessing which of five to check.

### Why this is the Apple question

Not because it looks like anything Apple makes, but because it is the decision
Apple makes: fewer things, each with one obvious way to use it, defaults good
enough that nobody opens settings. Forty-seven screens means forty-seven places
to look for something; it is why the app needs a training manual.

---

## 6. Four front doors

The roles are not one app with permissions. They are four products sharing a
system.

**Floor — driver, conductor.** Today, Gate check, Me (with their own documents
and their own reviews). Three or four screens, large targets, works offline,
assumes a cracked screen in bad light. A conductor today effectively has one
screen; this makes that honest instead of accidental.

**Specialist — store, crew manager, office.** Today plus the two or three
screens that are their job. The store sees Store, Jobs (read), Fuel, bills. The
crew manager sees People, Duty board, Reviews, Fuel, Map. The office sees People
(read-only), Reviews, and the conversation log. Each is a small, complete tool.

**Workshop — mechanic.** Today, Jobs, Me. Mechanics do not sign in today; if
that changes, this is the shape.

**Command — owner, supervisor.** Everything.

### Settled: supervisor keeps operations, not company money

A supervisor used to reach **all 47 screens — identical to the owner** —
including money, accounting and company billing. For a business handling cash
that was a governance question, not a bug, and the new system answers it
deliberately rather than inheriting it.

**Owner's decision, 2 November 2026: operations only, no company money.** A
supervisor keeps jobs, crew, store, duty, gate, challans and fuel. They lose
company-level money: cash reconciliation, bills and purchase totals, P&L and
cost per km.

Measured against today's code rather than assumed: a supervisor holds **35 of
the 37 permissions in `PERMS`**. The only two they are already denied are
`deleteJob` and `bulkArchiveCrew`.

Two conflations in the v1 model make this impossible to express as a v1 edit, and
they are the reason this belongs to the deny-by-default work below rather than to
a patch of `PERMS`:

- **`dashboard` guards two unrelated things.** `ROUTE_PERM` maps both the
  `company` route (company billing) and `alerts` (the operational alert list) to
  it. Dropping `dashboard` from supervisor removes the alerts a supervisor needs
  hourly; keeping it leaves company billing open. There is no third answer
  without splitting the capability.
- **`bills` guards supplier-bill management and the purchase totals together**,
  and `store` holds it too for the operational half. Removing it from supervisor
  alone would be incoherent while the store keeps it.

So the capability split is a prerequisite, not a follow-up: `dashboard` becomes
at least `viewAlerts` and `viewCompanyBilling`, and `bills` at least
`manageSupplierBills` and `viewSpendTotals`. The supervisor then holds the
operational half of each and neither money half.

One thing to confirm with the office before this ships, because it takes a screen
away from someone who may be using it daily: whether any supervisor currently
does the cash reconciliation. If they do, that work has to move to a login that
keeps it before the permission changes, not after.

---

## 7. Permissions: deny by default

Today `ROUTE_PERM` maps route to permission, and a route **missing** from that
map is open to every signed-in role. The code records the consequences:
`purchases` bypassed `bills`; `company` and `scorecard` rendered for anyone;
`history`, `outsidejobs` and `gatepass` let a driver reach the fleet's completed
work, spend, mechanics' names and gate passes. Each was fixed by adding a line.
The next screen anyone adds is open by default.

This inverts. A screen declares the capability it needs; a screen that declares
none is unreachable by everyone including the owner, and that is a build-time
error rather than a runtime surprise. The same declaration drives what the
server will send, so a device never receives records for a screen it cannot open
— the fix already deployed for pull scoping becomes the general rule.

The existing permission vocabulary is kept. Splitting `crewPerf` from
`manageDrivers`, so the office can read a scorecard without being able to rewrite
the roster, is good modelling and was learned the hard way.

---

## 8. Performance contract

Budgets are part of the design, and are measured on the office hardware, not a
developer's machine.

| Interaction | Budget | Measured on |
|---|---|---|
| Tap to visible response | < 100 ms | oldest office PC and oldest phone |
| Screen change, data present | < 250 ms | same |
| First paint after sign-in | < 1 s | same |
| Sync tick while idle | ~0 ms of main thread | same |

Rules that follow from the measurements in §2:

1. No work proportional to the dataset inside a render. Indexes are built once
   and invalidated on a content signature.
2. A screen reads only the stores it shows. The 41-store in-memory cache is
   retired; GPS events never reach a device that may not see them.
3. Lists longer than ~200 rows are windowed. A supervisor's bus list is fine;
   6,000 ledger rows are not.
4. Every budget above is a test, run against a fleet-sized fixture, failing the
   build when exceeded. Performance that is not asserted regresses.

---

## 9. Not building

Listed so it is a decision rather than an omission: no framework runtime
(React/Next adds payload to every office PC, permanently, to solve a problem
these screens do not have); no webfonts; no WebGL, scroll choreography or
decorative motion; no multi-operator signup, billing or onboarding (§1 — the
boundary is in the data model, the surfaces are not built); no dark/light
auto-switching cleverness beyond the OS setting; no settings screen for anything
a good default can decide.

---

## 10. Open questions

1. **Device check results** — Windows and Chrome versions, the two speed numbers,
   and whether icons render, per machine. Sent 1 Nov; outstanding.
2. **Driver phone versions** — decides how much the phone app can be asked to do,
   and whether WhatsApp can carry enrolment codes to every crew member.
3. **Supervisor scope** (§6) — owner's decision.
4. **Whether Google sign-in works on Chrome 109** — one office person to try it
   and report. Does not block the chosen design, which deliberately does not
   depend on it.

---

## 11. What happens next

This document is the design. Before anything is built it needs:

1. The owner's review of this document.
2. An implementation plan (`writing-plans`), which sequences the nine subsystems:
   identity, permissions, data and sync, GPS ingest, WhatsApp automation, Claude
   intelligence, migration, observability, and the design system itself.
3. The existing app keeps running throughout. Screens move across one at a time;
   nothing is cut over until its replacement has been measured on an office PC.

`/security-review` and `/engineering:code-review` run against real code at the
end, as requested — they have nothing to read yet.

# Rehearsal: garage-v2

An animated hero for Garage Saathi v2, the fleet-maintenance PWA at
`/Users/bhuwangarg/Downloads/claude-test/garage-saathi-launch`.

**The argument it makes.** v2's central product decision was that 47 screens
became 14, and that five screens each asking "what is wrong?" became one ranked
list. So the demo shows that list, acts on the top thing in it, and the list
gets shorter. That is the whole case for the rewrite in one motion.

Gold: `hero-demo` (animated hero, a gesture).

- **Kept:** the stage at 720x340, the 32px gutter, pinned bottom bleed, the
  window at the gutter running past the bottom, the compact breakpoint, the
  beat shape (move, press, a surface comes forward, press, payoff, hold,
  reset), `data-target` naming and measuring rather than hard-coded positions.
- **Changed:** its browser window became a sidebar app window, because v2 is an
  installed app with a rail, not a site. Its terminal satellite became anchored
  UI inside the window (see the framing line below). Its dev-tool content became
  the Attention list. Its palette became v2's own.

**The look is the product's, not chosen.** Every colour is read from
`v2/ui/tokens.css`: warm paper `hsl(40 22% 96%)`, warm ink `hsl(30 20% 9%)`, the
orange accent `hsl(16 88% 54%)` the app uses for anything a person must act on.
The glyphs are the app's own paths, lifted from `v2/ui/icons.js` — the app draws
inline SVG because the office runs Windows 7, where emoji render as empty boxes.
Every string is the app's: "Held at the gate", "Standing 3 hours.", "Low stock",
"Checked 3 hours ago.", and the counter whose empty state reads "Nothing needs
you". The plain voice is the product.

Beats: 1 press the top of the list → 2 the gate check that held the bus opens →
3 open a job card from it, the button confirms on itself → 4 payoff: the row
leaves the list and the count rolls 7 → 6, held 2.4s → reset. Loop ~13.5s.

Captured: wide 720, compact 390, reduced motion (poster), both gated.

Gate (wide): `rehearsal passed`
Gate (compact 390): `rehearsal passed`

## Film lines → what I did

| Line | Where | Outcome |
|---|---|---|
| `framing: satellite .gs-detail sits 48px from the right edge where the gutter is 32px` | wide, 1.7s | **Fixed, and it was right.** The panel was a satellite floating on the stage. It is the app's own panel, so it moved inside the window body — anchored UI, which `framing.md` rule 16 says is not a satellite and sits where the product would put it. |
| `framing: window shows 326x384, narrower than tall for a desktop window` | compact | **Fixed.** I had squeezed the desktop design into the phone column. The compact crop is now 358x300 so what shows of the window is wider than tall. |
| `cut by the crop: .ss-button runs off the stage's bottom (20px of its 24px)` | compact, 1.1s | **Fixed.** The panel was a bottom sheet, and on a bled window the foot of the screen is off-stage. It now opens under the row that was tapped, full width, with the trigger row still visible above it. |
| `empty pane: .gs-aside has 155px of nothing under its last content (61%)` | wide | **Fixed.** The right pane was a title and a box with a void beneath. It is now a list of tonight's departures running off the bottom bleed. |
| `skeleton ladder: 3 of 5 rows have no words at realistic fidelity` | both | **Fixed by dropping to `standard` fidelity.** Words in every row is what makes a demo look generated; `standard` is the kit's "words where they carry meaning, bars elsewhere", which is exactly the composition the restraint rules ask for. |
| `half-pixel glyph: a 15px svg in a 26x26 span.gs-tile` | wide, 1.1s | **Fixed.** Even inside even: the tile glyphs are 14px. |
| `clipped: near aligned: "Gate check" and "Brakes, failed" start 6.0px apart` | wide, 1.7s | **Fixed.** Dropped the panel's lead tile and bled the failed-item band inside the card's padding, so every line starts on one left edge. |
| `covers: the cursor sits on "Standing 3 hours." as it presses` | compact, 9.9s | **Fixed.** The press now aims at `x: 0.84` of the row, clear of the words. |
| `appears with no entrance: .ss-collapse "Bus 1234 held at the"` | both | **Fixed with `reveal="drop"`,** so the row arrives whole at the seam instead of being uncovered by the opening edge. |
| `jump: ss-button width +8.8px in one frame` | wide, 13.11s | **Fixed** by ordering the reset: the panel closes, *then* the scene snaps. |
| `layout: .ss-row.gs-row leaves -24px / -83px below its last child inside .gs-body` | both, from 0.0s | **Stands, deliberately, and it took two goes to earn.** It first read `leaves 1px`, which was a real fault — the list stopped 1px above the window's bottom, so it read as almost fitting rather than bleeding. Measured in the browser, fixed by reshaping the window to 367px so a row now crosses by 24px and the next by 83px, which is what `framing.md` rule 11 asks ("crossing by under 24px is a mistake"). The checker measures rows against the window body, whose own bottom is 27px below the stage; the stage is what crops them. |
| `appears with no entrance: span.ss-count` | both | **Stands.** This is the count jumping 6 → 7 inside `a.snap()` at the loop seam. The kit documents `Count` as jumping inside a snap, and that is the point: with `set` it eased 6 → 7 in view, a figure rewinding with no cause, which is the one thing a loop must not show. Jumping behind the returning row is the lesser fault, and the row's own entrance is the cause the viewer reads. |
| `handoff shift: .ss-roll__item ... -0.3px across, -0.1px down` | both | **Stands.** Sub-pixel, inside `Button`'s own label `Roll` as "Open job card" becomes "Job card open" and the tick grows its slot. It is the kit part doing its documented job; the alternative is hand-building a button, which the kit forbids. |

## Judged by eye, not by the gate

- **The closing panel dissolved through the row beneath it** — both legible at
  once for about a quarter second, worst on the phone column where the panel
  covers the list rather than a margin. Not a gate line; visible at 6.4s of the
  compact sheet. The exit is now 130ms against a 220ms entrance.
- **The rail labels read "Todav", "Dutv", "Monev"** in the first still:
  `text-box: trim-both cap alphabetic` with `overflow: hidden` was cutting the
  descenders off. Cap-trim is for centring a label in a pill, not for a nav item.

## Assumptions

- The demo lives beside the app, never in it. It is React, and the office floor
  is Chrome 109 with no framework runtime, so nothing here can ship to a yard.
- Tonight's departures (bus numbers, routes, times) are invented, plausible
  fleet content. The product strings are not.

## Unresolved

- The `part` glyph is v2's own cog-shaped parts icon, and beside "Brake pads,
  2 left" a cog still reads a little like Settings. Kept, because the rule is
  the product's own pack first, but a reviewer may fairly call it.

## Not checked

- Dark theme. v2 has a full dark palette in `tokens.css` and this demo maps only
  the light one; `--dark` was never filmed.
- Hover playback and `play="once"`; only the loop was filmed.
- Any host page. It was filmed in the stageshow playground at 720 and 390, never
  embedded in a real column with real copy beside it.
- Coverage came back `inconclusive` on every run — 73 to 85 sampling gaps over
  28ms, because the machine was running the dev server, the browser and the
  film at once. Motion inside those gaps was never judged, so the one-frame
  `jump` lines may be an under-sampled ease rather than a real snap.

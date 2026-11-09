# What v2 left behind, measured against v1

Written 2026-11-09, after the owner listed features he had in v1 and cannot find in v2.

Every line below was checked against both codebases. Each item says **what v1 has**, **what v2 has**,
and **what it would take** — and whether it is a defect (fix it) or a feature (UX doc and UI spec
first, per `docs/v2/PIPELINE.md`).

Nothing here is a guess about what the owner meant. Where I could not establish something, it says so.

---

## A. Features v1 has and v2 cannot do at all

### A1. Marking a job as outside repair — **no write path**
*The owner has asked for this three times.*

- **v1:** `owAsk` "Is this being done outside our garage?", plus `owNoCity`, `owWhere`, `owAwayFor`,
  and a "New outside job" flow (`ojNew`) that prints a slip to send with the vendor, records the
  serial that went out, and matches it against what comes back (`ojSerialWhy`, `ojBackMismatch`).
- **v2:** reads it and cannot write it. `jobcard.js:800` renders an Outside vendor block with the
  place and a gate pass; `jobs.js:173` filters an "Away for repair" tab on `externalVendor`. But
  **nothing in v2 ever sets `externalVendor`, `outside` or `outsidePlace`** — those three fields
  appear only in `db.js`'s seed and at the read sites. A card that already says it is outside
  displays correctly; you cannot make one.
- **Needs:** stage 1 and 2. It is a flow with a slip, a serial and a return match, not a checkbox.

### A2. The Vendors list — **gone**
- **v1:** a Vendors screen (`openVendors` → `route: 'vendors'`, `app.js:13121`) listing every vendor
  with a count, reachable from Store.
- **v2:** vendor *data* exists and Store shows one vendor's unpaid total (`store.js:619`), but there
  is no vendors list and no way to open a vendor.
- **Needs:** stage 1 and 2 (it is a screen).

### A3. The ITS lookup for crew names — **built, wired to nothing**
- **v1:** `itsLookupRun` behind a button (`itsBtn`), batching PNRs to `Sync.itsLookup`, with a
  diagnostic sheet showing exactly what ITS returned (`itsDiag*`, twelve strings). Its answers fed
  the review name-matching alongside the garage's own duty log (`app.js:10325` passes
  `its: itsLookups()` into the matcher).
- **v2:** `Sync.itsLookup` exists in `v2/sync.js` and **no v2 screen calls it**. Attribution is the
  garage's duty log alone.
- **Consequence the owner noticed:** fewer names resolve, so People and Reviews show less than v1 did.
- **Needs:** stage 1 and 2 for the button and the diagnostic; the transport is already there.

### A4. Three of the five rotable kinds cannot be fitted
- **v1:** five kinds — tyre, battery, **alternator**, starter, injector — each with per-piece life,
  serials and outside-repair capture (`app.js:5081`: `alternator … 'rewind'`).
- **v2:** `db.js` seeds an alternator and the send-out flow works on it, but `fuel.js:1566` is
  `var fits = { tyre: 'ftFitTyre', battery: 'ftFitBattery' }` — **only two kinds have a Fit control.**
  An alternator can be sent out and returned; it cannot be fitted to a bus.
- **Needs:** small, but it is still a change to what the screen offers — stage 2 at least.

### A5. The full-screen live map — **dropped on purpose, and the owner has now overruled it**
- **v1:** `openLiveMap` / `route: 'livemap'`, "Track every bus, Uber-style", for owner, supervisor
  and crew manager.
- **v2:** dropped. `docs/v2/plan/v2-ux.md:665` records why: *"UNKNOWN: who opens the live map, and
  to answer what? … dropped until somebody names the moment (Q9)."* What survives is the bus's own
  position on Buses, under the same `liveMap` capability.
- **Status:** the owner has now named the moment — he wants it. Q9 is answered; it needs stage 1 and 2.

---

## B. Defects, not missing features

### B1. "No signal" is shown when there is signal
`shell.js:210` — `isOffline()` returns true whenever `info().lastError` is non-empty, and
`sync.js:236` **restores `lastError` from localStorage at load**. So an error recorded in an earlier
session, or by the previous person on a shared office PC, makes the app report "No signal since
<an old time>" from the first paint, before any sync has been tried. The first success clears it
(`sync.js:788`) — but see B2.

### B2. Today does not repaint when the replica finishes filling
Measured: wipe the device, sign in as owner, sign out, sign in as supervisor. Today paints once
against an empty replica and shows "No signal" and **"No bus is standing in the yard"** — a confident
false statement — and stays that way. Navigating away and back shows the real screen. The data was
there within seconds; the screen never asked again.

### B3. Store's catalogue overruns its own scroll box
`store.js:882` sizes the window as `calc(var(--row-h) * n)` = 32px a row, while the rows render at
36px because they draw a second line at desk density. With 19 parts that is 76px of overrun, and the
"19 of 19 shown" caption is drawn on top of the last rows. Measured at 1366px on both the owner's and
the supervisor's login. Pre-existing — present with and without the row fixes of 8520c54.

### B4. A desk row draws two lines where the foundation says one
`v2-foundation-ui.md` §2.1: a desk row is one line and 32px, *"and Hindi is the reason, not taste"* —
two Hindi lines measure 49.3px and break the only assumption windowing has (§2.3). Several screens
draw a second line at desk anyway. B3 is the first visible consequence. Resolving it is a decision:
drop the second line at desk (as Today already does by hand), or raise `--row-h` and re-measure the
row budget.

---

## C. Survived, in case the list reads as worse than it is

Reviews' name queue (`rbalias` / `rbaliasai`, the "Names to confirm" tab) is in v2 and working — the
part that is missing from it is A3, the ITS half. Pilferage, safety, the scoreboard, store health,
warranty, challans, purchases, the Excel import, garage setup and "who opened what" all have v2
homes. Gate round, the duty board and the coaching note are v2 screens in their own right.

---

## D. What this list is not

It covers what the owner named plus what the same searches turned up next to it. It is **not** a
complete diff of v1's 22,593 lines against v2. v1 has 46 `open*` actions; this document accounts for
five of them in detail and asserts nothing about the rest beyond section C. A full inventory is its
own job and should be done before any of the above is scheduled, so the order is chosen with the
whole list in view rather than the half that was remembered first.

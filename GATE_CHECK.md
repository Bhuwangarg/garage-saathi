# Gate Check — the departure checklist

Built Oct 2026, week 2 of the rating-trace plan. A redBus review can only be
traced to a crew if someone recorded who was at the bus. This check records that,
and stops the faults passengers complain about before the bus leaves.

## The flow

1. **Driver, at the bus:** My Bus → *Start gate check*. Live selfie (face
   detection, as for attendance) plus GPS. The check records the bus, the
   driver, the time, and whether that driver is on the duty board for that bus.
2. **Ten items.** Each one is *OK* or *Problem*. AC, blankets and cabin need a
   photo to be OK, because those are the complaints passengers dispute. A problem
   needs a note, and can have a photo.
3. **Hold to release (1.5 s).**
   - Every item OK → **Released**.
   - Any problem → **Waiting for office**. Owners and supervisors get a push
     alert, and their home screen shows "Bus waiting at the gate".
4. **Office:** *Go* or *Hold*, always with a reason. On Hold, the driver fixes
   the problem and re-checks, then the bus is released or sent to the office again.

Owners and supervisors see every check under Today → *Gate checks*, including
buses with a driver and no check yet. The duty board's "Who was on a bus that
day" lists the day's gate checks too.

No breath test yet. Add it as one item in `GATE_ITEMS` (gate.js **and**
sync_server.py) when the devices arrive.

## Rules the server enforces (`_guard_gatecheck`)

- Only a **driver** starts a check, only for **their own bus**, as themselves.
- The driver can't change the bus, driver, start time, selfie, GPS or
  duty-board flag after starting.
- **Released** only if every item passed (photos included). **Waiting** only if
  something failed. `releasedAt` and `sentAt` are server time.
- Only **owner or supervisor** decide, only on a waiting check, only with a
  reason. `decision.by` and `decision.at` come from the token and the server clock.
  Earlier decisions are kept in `pastDecisions`. Items that failed and were later
  re-checked are kept in `failedBefore`.
- Nobody deletes a check. Released and approved checks are locked, owner included.

`test_gatecheck.py` checks all of this, plus that gate.js and the server list
the same items. `test_gate.js` covers the client rules.

## Things that look odd but are on purpose

- **Ticks don't animate**, because they're tapped ten times every departure. The
  only animation is the release button: a 1.5 s linear fill while held, and a
  200 ms snap back when let go. With reduced motion there's no fill, only "Keep
  holding…".
- **The screen won't redraw during a hold** (`userIsEditing`). If it redraws
  anyway, the old button's timer does nothing (`btn.isConnected`). Otherwise a
  sync tick mid-hold could release a bus after the driver let go.
- **Item labels are i18n keys** (`gi_<key>`), never stored words, as in the crew bank.
- A check belongs to a bus's **current departure**: the newest one started in
  the last 20 hours. A night bus checked at 20:00 is still "today's" at 02:00.
- The service worker now precaches with `cache: 'reload'`. Without it a new build
  could install next to a stylesheet up to 5 minutes old.

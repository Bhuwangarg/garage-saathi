#!/usr/bin/env python3
"""The outside-repair cost budgets (contract 8) as a check that can fail a build.

scripts/measure-outside.py is the harness and prints the whole table; this keeps
the two numbers that can regress quietly:

  1. /push of an outside job card costs under 5 ms more with the externalCost
     recompute than without, at 2,000 gate passes. Fastest of three runs: load can
     only add time to a run, never take it away, so the minimum is the cost and a
     busy machine does not redden the build.
  2. /push of a record in any other store adds nothing. Milliseconds cannot show
     zero, so it is asserted as work -- the recompute is never called and no SQL
     statement names gatepasses -- and the millisecond delta is held to a noise
     floor as well.

In-process against a tempfile database, no port.

    /usr/bin/python3 test_outside_cost.py
"""
import importlib.util
import os
import sys
import tempfile

os.environ["DB_PATH"] = tempfile.mktemp(suffix=".db")
for k in ("DATABASE_URL", "TURSO_URL", "TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"):
    os.environ.pop(k, None)
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

_spec = importlib.util.spec_from_file_location(
    "measure_outside", os.path.join(HERE, "scripts", "measure-outside.py"))
M = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(M)

fails = []
unmeasured = []


def not_measured(name, why):
    """test_pullcost.py's convention: says so loudly, counts it, exits 0."""
    print(" SKIP " + name + "\n        NOT MEASURED: " + why)
    unmeasured.append(name)


def check(name, cond, detail=""):
    print(("  ok  " if cond else " FAIL ") + name + ("" if cond else "  -- " + str(detail)))
    if not cond:
        fails.append(name)


NOISE_MS = 1.0         # what an unrelated-store delta may wander by with nothing added

# WHY THERE IS A SECOND GATE ON THE BUDGET CHECK, and why the noise check above
# is not it.
#
# "Fastest of three, because load can only add time" is sound and it is not
# enough. It failed a CI build at 6.69 ms against a 5 ms budget on a machine
# that was uniformly about 2.5x slow, and the unrelated-store noise check sat
# green through it at 0.12 / -0.09 / 0.26 ms -- because that check measures a
# DIFFERENCE of two cheap pushes, and a machine being slow all over barely moves
# a difference of two cheap things while it moves an expensive one a lot.
#
# So the gate has to be scale-invariant. Measured on this machine, 10 runs in
# one process while it drifted from calm to busy:
#
#   ma (card push with recompute)     4.55 -> 6.24 ms
#   mb (the same push without it)     1.89 -> 2.65 ms
#   delta in ms                       2.66 -> 4.04 ms      moves with the machine
#   delta / mb                        1.21 -> 1.83         does not
#
# A slow machine lifts ma and mb together. A recompute that actually regressed
# lifts the ratio: OB4's own mutation, scanning every store instead of
# gatepasses, measured 40.5 ms against an mb of about 2, a ratio near 20.
#
# 3.0 is the ceiling -- comfortably above the 1.83 a drifting machine produced,
# comfortably below anything a real regression does. Above the budget AND above
# the ratio is a FAIL. Above the budget with the ratio still calm is a machine
# that cannot resolve 5 ms, which is NOT MEASURED, exit 0 -- test_pullcost.py's
# convention, and for its reason: "a busy machine is not a defect", and a check
# that reddens for being busy gets switched off.
RATIO_CEILING = 3.0

M.build()

card, other, base = [], [], []
for _ in range(3):
    ma, mb, delta = M.interleaved(M.push_card, 40)
    card.append(delta)
    base.append(mb)                     # the same push without the recompute: the scale reference
    other.append(M.interleaved(M.push_unrelated, 40)[2])
print("  push delta on an outside card, three runs (ms): %s" % ", ".join("%.2f" % x for x in card))
print("  push delta on an unrelated store, three runs (ms): %s" % ", ".join("%.2f" % x for x in other))
print("  the same push without the recompute (ms): %s" % ", ".join("%.2f" % x for x in base))

BUDGET_NAME = ("an outside card's push costs under %g ms more for the recompute (fastest of 3)"
               % M.BUDGET_MS)
_best = min(range(len(card)), key=lambda i: card[i])
_delta, _mb = card[_best], base[_best]
_ratio = (_delta / _mb) if _mb > 0 else float("inf")
print("  recompute as a multiple of the push it is added to: %.2f (ceiling %.1f)"
      % (_ratio, RATIO_CEILING))

if _delta < M.BUDGET_MS:
    check(BUDGET_NAME, True)
elif _ratio >= RATIO_CEILING:
    # Over budget AND disproportionate: the recompute itself got more expensive.
    check(BUDGET_NAME, False,
          "%.2f ms, and %.2fx the push it is added to (ceiling %.1f) — this is the "
          "recompute, not the machine" % (_delta, _ratio, RATIO_CEILING))
else:
    # Over budget but still in proportion: everything here is slow, so this run
    # cannot resolve a 5 ms budget either way.
    not_measured(BUDGET_NAME,
                 "%.2f ms, over the %g ms budget — but only %.2fx the push it is added to "
                 "(a calm machine gives 1.2-1.8x), so this machine is uniformly slow and "
                 "cannot resolve %g ms. Run it on a quiet machine."
                 % (_delta, M.BUDGET_MS, _ratio, M.BUDGET_MS))

work = M.unrelated_work()
check("an unrelated store's push never calls the recompute", work["recompute_calls"] == 0, work)
check("an unrelated store's push never touches gatepasses", work["gatepass_statements"] == 0, work)
check("an unrelated store's push adds no measurable time (fastest of 3)",
      min(abs(x) for x in other) <= NOISE_MS, min(abs(x) for x in other))

# The harness must be measuring the thing: the recompute really runs on the card
# push and really scans gatepasses, or the delta above is a delta of nothing.
M._recompute_calls[0] = 0
del M._seen[:]
M._tracing[0] = True
try:
    M.push_card(3, 999)
finally:
    M._tracing[0] = False
check("the card push does call the recompute and scan gatepasses",
      M._recompute_calls[0] == 1 and any("gatepasses" in s for s in M._seen),
      (M._recompute_calls[0], len(M._seen)))

# ---------------------------------------------------------------------------
# THE STAMP RACE THAT REDDENED A CI BUILD, pinned so it cannot come back.
#
# The server does not always store what you sent. When the guard changes the
# payload -- which is what the recompute under measurement does the first time
# it touches each card -- sync_server.py:4058 re-stamps the row
# `max(upd + 1, now_ms(), row.updatedAt + 1)`. The next push of that card, if
# it only consults its own clock and the wall clock, can land on a stamp the
# server has already used; `upd > row[0]` is then false and the push is REFUSED
# as stale. On GitHub's runner that refusal raised out of push_card and failed
# the build, while the same commit passed on a quieter machine.
#
# Waiting for a slow machine is not a check. The bump is forced instead: move
# the server's clock forward DURING the push, so it always re-stamps well ahead,
# and require the following push to be applied anyway.
#
# Red when you: take the stored stamp back out of _tick() in measure-outside.py.
_real_now = M.S.now_ms
try:
    M.S.now_ms = lambda: _real_now() + 50      # the server will re-stamp ~50ms ahead
    sent = []
    _orig_tick = M._tick
    M._tick = lambda stored_at: sent.append(_orig_tick(stored_at)) or sent[-1]
    # oc-399, not oc-5: the interleaves above touch cards 0..39, and the
    # re-stamp only happens when the payload CHANGES -- which is the first time
    # the recompute sets externalCost on a card and never again. Picking an
    # already-touched card made this check assert +0 and prove nothing.
    CARD = M.CARDS - 1
    M.push_card(CARD, 4242)                    # first touch: externalCost changes
    stored_after_a = M._stored("jobcards", "oc-%d" % CARD)["updatedAt"]
    ahead = stored_after_a - sent[-1]
    refused = None
    try:
        M.push_card(CARD, 4243)                # the push that used to be refused
    except RuntimeError as e:
        refused = str(e)
    check("the server re-stamped the card ahead of the push (so the race is live here)",
          ahead > 0, "server stored %+d ms from what was sent" % ahead)
    check("a second push of the same card is applied even so, not refused as stale",
          refused is None, refused)
finally:
    M.S.now_ms = _real_now
    M._tick = _orig_tick

if fails:
    print("\nFAILED: %s" % fails)
elif unmeasured:
    print("\n%d check(s) NOT MEASURED (%s)." % (len(unmeasured), ", ".join(unmeasured)))
    print("This was NOT a full pass. Exit status is still 0, because a busy machine is "
          "not a defect — but nothing above proves the budget either.")
else:
    print("\nALL PASSED")
sys.exit(1 if fails else 0)

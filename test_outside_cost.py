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


def check(name, cond, detail=""):
    print(("  ok  " if cond else " FAIL ") + name + ("" if cond else "  -- " + str(detail)))
    if not cond:
        fails.append(name)


NOISE_MS = 1.0         # what an unrelated-store delta may wander by with nothing added

M.build()

card, other = [], []
for _ in range(3):
    card.append(M.interleaved(M.push_card, 40)[2])
    other.append(M.interleaved(M.push_unrelated, 40)[2])
print("  push delta on an outside card, three runs (ms): %s" % ", ".join("%.2f" % x for x in card))
print("  push delta on an unrelated store, three runs (ms): %s" % ", ".join("%.2f" % x for x in other))

check("an outside card's push costs under %g ms more for the recompute (fastest of 3)" % M.BUDGET_MS,
      min(card) < M.BUDGET_MS, min(card))

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

print("\n%s" % ("ALL PASSED" if not fails else "FAILED: %s" % fails))
sys.exit(1 if fails else 0)

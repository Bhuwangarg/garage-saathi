#!/usr/bin/env python3
"""Run every test file in the repo and say what failed.

There are 47 of them -- 38 Python, 9 JavaScript -- and before this script
nothing ran any of them. Not the pre-deploy gate, not the pre-push hook, not
CI. They were written alongside real fixes, they encode what those fixes were
for, and they had quietly become documentation: a test nobody runs cannot fail,
so it stops being a test.

They are safe to run anywhere. Every Python test pops DATABASE_URL, TURSO_URL
and TURSO_DATABASE_URL from the environment and points DB_PATH at a tempfile,
so none of them can reach production. That was checked before this ran the
first time, and it is the reason this script does not need a flag to be safe.

Success is judged by EXIT CODE, not by scraping output. The first version of
this grepped for "all passed" and reported two healthy suites as failures: one
prints "all ok" and the other prints nothing at all on success.

Suites run in parallel, so the wall clock is the slowest suite rather than the
sum of all of them -- 181s instead of about 330s. subprocess releases the GIL
while it waits, so threads are the right tool and there is no process pool to
reason about.

Usage:  scripts/run-tests.py [-q] [--fast] [name-fragment ...]
Exit 0 = everything passed. Exit 1 = something failed, named below.
"""
import concurrent.futures
import os
import pathlib
import subprocess
import sys
import time

TIMEOUT = 300
SLOW_S = 20            # anything over this is reported, so slowness stays visible

# Suites too slow to sit in a pre-push hook, with the measured time and the
# reason. --fast skips these and SAYS SO; nothing here is ever skipped silently,
# because a silent cap reads as "everything passed" when it did not run.
#
# EMPTY, and the pre-push hook no longer passes --fast: every suite runs on
# every push. test_ui_overlay.js was the only entry -- 181s for 100 checks, of
# which 174s was 57 sleeps waiting out real animation durations. It now asserts
# the declared durations and waits on the state it is really waiting for.
#
# It is still the slowest file here, and both its numbers are worth quoting, not
# just the best one. Run back to back against the old version on the same
# machine: 67s against 190s at a load average of 7, and 57s against 164s at a
# load average of 5. On an idle machine it has done 40s; under heavier load it
# has taken 83-111s. The whole set comes in at 84-104s wall, which a hook can
# carry. Its few wall-clock checks report NOT MEASURED, loudly and without
# failing, where the machine will not keep its own timers -- see unmeasurable()
# in that file. The mechanism here stays for the next suite that earns a place in
# it; nothing is skipped while this is bare.
SLOW = {}

# Suites that bind a real TCP port. These ran serially until now, because
# test_clist.py and test_agent_key.py both default to 8839 and the first
# parallel run failed with "Address already in use" -- the clash had been latent
# since both were written, so parallelism revealed it rather than caused it.
#
# Each of them reads its port from the environment, so each now gets one of its
# own and they run in the parallel batch with everything else. The objection
# recorded here before was that "the variable name differs per file and a wrong
# guess reads as a passing test that never bound anything" -- which is true, and
# is why _unread_port_vars() below exists: a name its suite no longer mentions
# stops the run instead of quietly falling back to 8839. Every name here was
# checked by pointing it at port 1 and confirming the suite fails to bind.
#
# test_its_lookup.py is deliberately NOT here. It asks for port 0 and reads back
# whatever the kernel gave it (test_its_lookup.py:104), so it cannot collide with
# anything and needs no port of its own; it was serialised for a hazard it never
# had.
PORT_VARS = {
    "test_agent_key.py": "AGENT_KEY_PORT",
    "test_clist.py": "CLIST_PORT",
    "test_alist.py": "ALIST_PORT",
    "test_thief.py": "THIEF_PORT",
    "test_pin_rotation.py": "TEST_PORT",
    "test_agent_endpoints.py": "AGENT_ENDPOINTS_PORT",
}

# 9200 up, in a block of its own per process. NOT 8800-8919: that is
# scripts/predeploy-gate.sh's own range, 8800 + (pid % 120), and the gate runs
# from the same pre-push hook. GS_TEST_PORT_BASE overrides it, which is how the
# delivery of these variables is verified -- set it to 1 and every suite in
# PORT_VARS must fail to bind.
PORT_BASE = int(os.environ.get("GS_TEST_PORT_BASE", 9200 + (os.getpid() % 150) * 8))


def port_env(name):
    """The environment a port-bound suite runs with; None means inherit."""
    var = PORT_VARS.get(name)
    if not var:
        return None
    env = dict(os.environ)
    env[var] = str(PORT_BASE + sorted(PORT_VARS).index(name))
    return env


def _unread_port_vars():
    """Entries in PORT_VARS whose suite no longer reads that variable.

    Without this a renamed variable is invisible: the suite falls back to 8839,
    binds it, passes, and two of them meeting is a flake nobody can place.
    """
    out = []
    for name, var in sorted(PORT_VARS.items()):
        f = HERE / name
        if f.exists() and var not in f.read_text():
            out.append((name, var))
    return out

# Suites whose subject is a DURATION, which eight sibling processes on this pool
# change. These are now the ONLY serial suites -- the port binders left for the
# pool once each had a port of its own -- and the reason they stay is measured
# rather than assumed.
#
# test_outside_cost.py holds contract 8's "< 5 ms added per /push of an outside
# card". On this machine, same code, same fixture, same day:
#
#   in this pool, 8 workers   8.69 / 8.50 / 17.17 ms  -> red
#   in this pool, 8 workers   5.41 /  7.93 /  8.65 ms -> red
#   run by itself             1.57 /  2.03 /  1.70 ms -> green
#   the harness, 60 reps      +3.66 ms                -> green
#
# The file reasons that "load can only add time to a run, never take it away, so
# the minimum is the cost and a busy machine does not redden the build". That is
# true of one timing; it is NOT true of this number, which is a DIFFERENCE of two
# medians taken at different instants -- load inflates the with-recompute half
# more than the without half, and the fastest of three differences is still wrong.
# So the budget is unchanged and the assertion is untouched: what moves is where
# it is measured. A timing check run beside eight competitors reports the pool,
# not the code, and a gate that goes red for the machine teaches people to ignore
# it.
TIMED = {"test_outside_cost.py"}

HERE = pathlib.Path(__file__).resolve().parent.parent


def runners():
    for f in sorted(HERE.glob("test_*.py")):
        yield f, [sys.executable, f.name]
    for f in sorted(HERE.glob("test_*.js")):
        yield f, ["node", f.name]


def main(argv):
    quiet = "-q" in argv
    fast = "--fast" in argv
    want = [a for a in argv if not a.startswith("-")]
    jobs = [(f, c) for f, c in runners() if not want or any(w in f.name for w in want)]
    if not jobs:
        print("no test files matched")
        return 1

    # Before anything runs: if a suite stopped reading the variable we hand it,
    # it would bind 8839 instead and pass, and the next parallel run would flake
    # somewhere else entirely. Say so and stop.
    stale = _unread_port_vars()
    if stale:
        for name, var in stale:
            print(f"  BROKEN   {name} no longer reads {var} — it would fall back to 8839")
        print("\n❌ PORT_VARS in run-tests.py is out of date; fix it before trusting a parallel run")
        return 1

    skipped = []
    if fast:
        keep = []
        for f, c in jobs:
            if f.name in SLOW:
                skipped.append(f.name)
            else:
                keep.append((f, c))
        jobs = keep

    def run_one(job):
        f, cmd = job
        t = time.time()
        try:
            p = subprocess.run(cmd, cwd=HERE, capture_output=True, text=True,
                               timeout=TIMEOUT, env=port_env(f.name))
        except subprocess.TimeoutExpired:
            return f.name, None, "", time.time() - t
        return f.name, p.returncode, p.stdout + p.stderr, time.time() - t

    # Parallel for everything that cannot collide. Only the timing suites are
    # serial now: the port binders each got a port of their own above, which is
    # what kept them out of this pool.
    serial_names = TIMED
    wide = [j for j in jobs if j[0].name not in serial_names]
    narrow = [j for j in jobs if j[0].name in serial_names]

    def results():
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            yield from pool.map(run_one, wide)
        for job in narrow:
            yield run_one(job)

    failed, timed_out, passed, slow, t0 = [], [], 0, [], time.time()
    for name, code, out, secs in results():
        if secs > SLOW_S:
            slow.append((name, secs))
        if code is None:
            timed_out.append(name)
            print(f"  TIMEOUT  {name}  (over {TIMEOUT}s)")
        elif code == 0:
            passed += 1
            if not quiet:
                # Most suites print one "ok" line per check; showing the
                # count makes a suite that quietly stopped checking visible.
                n = sum(1 for ln in out.splitlines()
                        if ln.strip().startswith("ok"))
                print(f"  ok       {name}" + (f"  ({n} checks)" if n else ""))
        else:
            failed.append((name, code, out))
            print(f"  FAIL     {name}  (exit {code})")

    print("──")
    print(f"{passed} passed, {len(failed)} failed, {len(timed_out)} timed out, "
          f"{len(jobs)} run ({len(narrow)} serial), {time.time() - t0:.0f}s wall")
    for name in skipped:
        print(f"  SKIPPED  {name} — {SLOW[name]} (--fast); CI runs it")
    for name, secs in sorted(slow, key=lambda x: -x[1]):
        print(f"  slow     {name}  {secs:.0f}s")

    for name, code, out in failed:
        print(f"\n─── {name} (exit {code}) " + "─" * max(0, 46 - len(name)))
        lines = [ln for ln in out.splitlines() if ln.strip()]
        # The FAILING lines first, then the tail. A tail on its own is the
        # wrong report for a long suite: test_ui_overlay.js prints ~50 lines,
        # so when two checks failed EARLY the 18-line window showed seventeen
        # passes and the word FAILED, and CI looked like it was hiding the
        # reason. The diagnostic was hiding the diagnosis.
        # A failing check and the REASON under it. The first version of this
        # kept only lines containing FAIL, which is where a check's name lives
        # and not where it says why -- the suites print the detail on the
        # following line, as node 20 did with "this node has no built-in
        # WebSocket". Printing the name without the reason just moves the
        # question. So: each failing line plus what follows it, up to the next
        # check line.
        def is_check(ln):
            t = ln.lstrip()
            return t.startswith("ok ") or t.startswith("ok\t") or "FAIL" in ln or t.startswith("✗")
        bad = []
        for i, ln in enumerate(lines):
            if "FAIL" in ln or ln.lstrip().startswith("✗"):
                bad.append(ln)
                # Follow to the NEXT CHECK, not a fixed few lines. A check that
                # reports "3 failure(s):" and lists them needs four lines, and a
                # window of three printed two of three -- the same clipping this
                # whole block exists to undo, committed twice by me in a row. The
                # stop condition is the next check line; 12 is only a runaway cap.
                for nxt in lines[i + 1:i + 13]:
                    if is_check(nxt):
                        break
                    bad.append(nxt)
        shown = []
        if bad:
            shown += ["the checks that failed, and why:"] + bad[:40]
            if len(bad) > 40:
                shown += [f"...and {len(bad) - 24} more lines"]
            shown += ["the end of the run:"]
        shown += lines[-18:]
        print("\n".join("  " + ln for ln in shown) or "  (no output)")

    if failed or timed_out:
        print(f"\n❌ {len(failed) + len(timed_out)} suite(s) not passing")
        return 1
    print("\n✅ every test file passes")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

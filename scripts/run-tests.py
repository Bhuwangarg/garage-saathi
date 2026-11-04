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
# test_ui_overlay.js: 181s for 100 checks, of which 174s is 57 explicit sleeps
# waiting out real animation durations (350ms sheet transitions and the like).
# The intent is right -- it tests motion timing for real -- but it could assert
# the declared duration instead of living through it. Fixing that is its own job.
SLOW = {"test_ui_overlay.js": "57 sleeps totalling 174s of the 181s"}

# Suites that bind a real TCP port, and therefore cannot run beside each other.
# Found the hard way: the first parallel run failed with "Address already in
# use", because test_clist.py and test_agent_key.py both default to 8839. Run
# sequentially they never meet, so the clash had been latent since both were
# written -- parallelism did not cause it, it revealed it.
#
# These run serially after the parallel batch. Assigning each a unique port from
# here would be tidier, since they all read one from the environment, but the
# variable name differs per file and a wrong guess reads as a passing test that
# never bound anything.
PORT_BOUND = {"test_agent_key.py", "test_clist.py", "test_alist.py",
              "test_thief.py", "test_pin_rotation.py", "test_its_lookup.py",
              "test_agent_endpoints.py"}

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
                               timeout=TIMEOUT)
        except subprocess.TimeoutExpired:
            return f.name, None, "", time.time() - t
        return f.name, p.returncode, p.stdout + p.stderr, time.time() - t

    # Parallel for everything that cannot collide; serial for the port binders.
    wide = [j for j in jobs if j[0].name not in PORT_BOUND]
    narrow = [j for j in jobs if j[0].name in PORT_BOUND]

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
        tail = [ln for ln in out.splitlines() if ln.strip()][-18:]
        print("\n".join("  " + ln for ln in tail) or "  (no output)")

    if failed or timed_out:
        print(f"\n❌ {len(failed) + len(timed_out)} suite(s) not passing")
        return 1
    print("\n✅ every test file passes")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

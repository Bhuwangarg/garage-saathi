"""The scheduler's token starts AI jobs and nothing else.

Run: python3 test_ai_cron.py
"""
import os
import re
import tempfile

os.environ["DB_PATH"] = os.path.join(tempfile.mkdtemp(prefix="gs-cron-"), "t.db")
os.environ.pop("TURSO_URL", None)
os.environ.pop("TURSO_DATABASE_URL", None)
os.environ["AI_CRON_TOKEN"] = "c" * 40
os.environ["REDPRO_INGEST_TOKEN"] = "r" * 40

import sync_server as S  # noqa: E402

fails = []


def check(name, cond):
    print(("  ok  " if cond else " FAIL ") + name)
    if not cond:
        fails.append(name)


check("the scheduler's token starts AI jobs", S._ai_trigger_ok("Bearer " + "c" * 40))
check("the extension's token still does", S._ai_trigger_ok("Bearer " + "r" * 40))
check("a wrong token does not", not S._ai_trigger_ok("Bearer " + "x" * 40) and not S._ai_trigger_ok(""))
src = open("sync_server.py").read()
ingest = src[src.index('if u.path == "/redpro/ingest"'):][:600]
check("redPro data upload does not accept the scheduler's token", "_ai_trigger_ok" not in ingest and "REDPRO_INGEST_TOKEN" in ingest)
guarded = [p for p in re.findall(r'if u\.path == "(/ai/[a-z]+)":', src)
           if "_ai_trigger_ok(h)" in src[src.index('if u.path == "%s":' % p):][:500]]
check("every AI job the schedule calls accepts it: %s" % sorted(guarded),
      set(guarded) >= {"/ai/reviews", "/ai/names", "/ai/gate", "/ai/core", "/ai/reports", "/ai/coaching", "/ai/digest"})
wf = open(".github/workflows/ai-jobs.yml").read()
check("the workflow calls each of them", all(p in wf for p in ("reviews", "names", "gate", "core", "reports", "coaching", "digest")))
check("the workflow never prints the token", "echo $AI_CRON_TOKEN" not in wf and "secrets.AI_CRON_TOKEN" in wf)

print("\n%d failed" % len(fails) if fails else "\nall passed")
raise SystemExit(1 if fails else 0)

#!/usr/bin/env python3
"""Rate limiting, the push ceiling, the protocol alias, schema version, flags.

The thing these checks are really protecting is the yard at four in the
morning: every one of them must either let work through or say clearly how
long to wait, and none of them may refuse a conductor because a counter table
had a bad moment.

    /usr/bin/python3 test_ratelimit.py
"""
import os
import sys
import tempfile

os.environ["DB_PATH"] = tempfile.mktemp(suffix=".db")
os.environ["RL_SYNC_PER_MIN"] = "5"          # small, so the test is quick
os.environ["RL_UPLOAD_PER_HOUR"] = "3"
os.environ["FEATURE_FLAGS"] = "newFares, gateCheckV2"
for k in ("DATABASE_URL", "TURSO_URL", "TURSO_DATABASE_URL", "RATE_LIMIT_OFF"):
    os.environ.pop(k, None)
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import sync_server as S  # noqa: E402

fails = []


def check(name, cond):
    print(("  ok  " if cond else " FAIL ") + name)
    if not cond:
        fails.append(name)


print("Rate limiting")
ok_count = 0
for _ in range(5):
    ok, wait = S._rate_ok("u-driver", "sync")
    ok_count += 1 if ok else 0
check("the first five sync calls are allowed", ok_count == 5)

ok, wait = S._rate_ok("u-driver", "sync")
check("the sixth is refused", not ok)
check("and it says how long to wait", 0 < wait <= 60)

ok, _ = S._rate_ok("u-conductor", "sync")
check("another person is unaffected", ok)
# This is the one that matters: the yard shares one wifi, so a per-IP limit
# would stop everybody because one phone was stuck.

ok, _ = S._rate_ok("u-driver", "upload")
check("a different bucket has its own ceiling", ok)
for _ in range(2):
    S._rate_ok("u-driver", "upload")
ok, wait = S._rate_ok("u-driver", "upload")
check("uploads refuse past their own ceiling", not ok)
check("and the wait is an hour-shaped number", 0 < wait <= 3600)

print("\nIt fails open")
_real = S.db
S.db = lambda: (_ for _ in ()).throw(RuntimeError("database having a moment"))
try:
    ok, wait = S._rate_ok("u-driver", "sync")
finally:
    S.db = _real
check("a broken counter lets the request through", ok and wait == 0)

_off = S.RATE_LIMIT_OFF
S.RATE_LIMIT_OFF = True
try:
    allowed = all(S._rate_ok("u-flood", "sync")[0] for _ in range(50))
finally:
    S.RATE_LIMIT_OFF = _off
check("RATE_LIMIT_OFF is a real escape hatch", allowed)
check("an anonymous caller is not counted", S._rate_ok("", "sync") == (True, 0))

print("\nThe protocol alias")
check("/v1/pull is the same route as /pull", S._strip_version("/v1/pull") == ("/pull", 1))
check("/pull is untouched", S._strip_version("/pull") == ("/pull", None))
check("a version we do not speak is left to 404", S._strip_version("/v9/pull")[0] == "/v9/pull")
check("the version is not stripped out of a record id", S._strip_version("/uploads/v1abc") == ("/uploads/v1abc", None))

print("\nSchema version and flags")
c = S.db()
row = c.execute("SELECT v FROM sys WHERE k='schema_version'").fetchone()
c.close()
check("the schema version is written down", row and int(row[0]) == S.SCHEMA_VERSION)
check("flags parse from the environment", S.feature_flags() == ["gateCheckV2", "newFares"])
os.environ["FEATURE_FLAGS"] = ""
check("no flags set means none on", S.feature_flags() == [])
os.environ["FEATURE_FLAGS"] = "newFares"
check("one flag set means exactly that one", S.feature_flags() == ["newFares"])

print("\nThe push ceiling")
check("a byte ceiling is declared", S.MAX_PUSH_BYTES > 0)
check("it is smaller than the platform's own limit", S.MAX_PUSH_BYTES <= 10 * 1024 * 1024)

print("\nRESULT: " + ("ALL PASS" if not fails else "%d FAILED -> %s" % (len(fails), fails)))
sys.exit(1 if fails else 0)

#!/usr/bin/env python3
"""Whoever may send a unit out may paper it: both halves of the equality, and /health.

Owner's decision 3 (outside-repair contract 3.2). The slip's roles are DERIVED from
the piece's, not typed twice, and two copies of a permission rule are how they drift.
The read half is one shared object in v2_perms; the write half lives in the server's
WRITE_ROLES and is asserted at import, so a drift is a loud failure in CI and
`permsOk: false` in /health for anyone who cannot read a traceback.

In-process: /health is answered by calling the handler's own method, no port bound.

    /usr/bin/python3 test_outside_roles.py
"""
import os
import sys
import tempfile
import urllib.parse

os.environ["DB_PATH"] = tempfile.mktemp(suffix=".db")
for k in ("DATABASE_URL", "TURSO_URL", "TURSO_DATABASE_URL"):
    os.environ.pop(k, None)
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import sync_server as S  # noqa: E402
import v2_perms as P  # noqa: E402

fails = []


def check(name, cond, detail=""):
    print(("  ok  " if cond else " FAIL ") + name + ("" if cond else "  -- " + str(detail)))
    if not cond:
        fails.append(name)


def health():
    """The /health body, from the real handler, with nothing bound."""
    h = S.Handler.__new__(S.Handler)
    h.path = "/health"
    h.headers = {}
    got = {}
    h._send = lambda code, body, *a, **k: got.update(code=code, body=body)
    h.do_GET()
    return got.get("code"), got.get("body") or {}


FOUR = {"owner", "supervisor", "store", "crewmanager"}

print("The write half")
check("WRITE_ROLES['gatepasses'] == WRITE_ROLES['components']",
      S.WRITE_ROLES["gatepasses"] == S.WRITE_ROLES["components"])
check("  ...and is exactly the four roles that may send a unit out",
      set(S.WRITE_ROLES["gatepasses"]) == FOUR, sorted(S.WRITE_ROLES["gatepasses"]))
for role in sorted(FOUR):
    check("may_write(%s, gatepasses)" % role, S.may_write(role, "gatepasses"))
for role in ("mechanic", "driver", "conductor", "office"):
    check("may_write(%s, gatepasses) is False" % role, not S.may_write(role, "gatepasses"))

print("\nThe read half")
check("the read table gives gatepasses and components the same roles",
      P.STORE_READ_ROLES["gatepasses"] == P.STORE_READ_ROLES["components"])
# read_roles() adds v1-compat rows on top of the table, and `components` has one
# for the mechanic (a v1 screen reads it); the slip has none and must not. So the
# equality of contract 3.2 is on the table, and the difference below is exactly
# that one named row -- anything else here would be a drift.
check("  ...and read_roles() differs by exactly the mechanic's v1 row on components",
      P.read_roles("components") - P.read_roles("gatepasses") == {"mechanic"}
      and not (P.read_roles("gatepasses") - P.read_roles("components")))
check("  ...so gate passes reach exactly the four", set(P.read_roles("gatepasses")) == FOUR,
      sorted(P.read_roles("gatepasses")))

print("\nThe rule raises when the write sides drift")
drift = dict(S.WRITE_ROLES, gatepasses=set(S.WRITE_ROLES["gatepasses"]) - {"crewmanager"})
try:
    P.assert_write_roles_follow(drift)
    raised = False
except RuntimeError:
    raised = True
check("assert_write_roles_follow raises on a gatepasses list missing a role", raised)

print("\n/health says so")
code, body = health()
check("it is 200", code == 200, code)
check("permsOk is present and true", body.get("permsOk") is True, body.get("permsOk"))
saved = S.WRITE_ROLES["gatepasses"]
S.WRITE_ROLES["gatepasses"] = set(saved) - {"store"}
try:
    code, body = health()
    check("with one role removed from gatepasses, /health is STILL 200 (the truth is in the body)",
          code == 200, code)
    check("  ...and permsOk is false", body.get("permsOk") is False, body.get("permsOk"))
    check("  ...and the equality check is red",
          S.WRITE_ROLES["gatepasses"] != S.WRITE_ROLES["components"])
finally:
    S.WRITE_ROLES["gatepasses"] = saved
check("restored: permsOk true again", health()[1].get("permsOk") is True)

print("\n%d failed" % len(fails))
if fails:
    print("FAILED: " + "; ".join(fails))
    sys.exit(1)
print("all passed")

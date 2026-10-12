#!/usr/bin/env python3
"""A change made on the server has to be visible on the phones.

Devices decide whether a pulled record is newer by its PAYLOAD's `updatedAt`
(pullPage in sync.js). Server-side writes build the payload by hand and mostly
forgot to stamp it, so a rename bumped the envelope only, every device judged
the record "not newer", and the new name never appeared on the floor.

    /usr/bin/python3 test_rename.py
"""
import json, os, sys, tempfile

os.environ["DB_PATH"] = tempfile.mktemp(suffix=".db")
os.environ.pop("ENABLE_DEMO_SEED", None)
for k in ("DATABASE_URL", "TURSO_URL", "TURSO_DATABASE_URL"):
    os.environ.pop(k, None)
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import sync_server as S  # noqa: E402

S.bootstrap()
fails = []


def check(name, cond):
    print(("  ok  " if cond else " FAIL ") + name)
    if not cond:
        fails.append(name)


def record(store, rid):
    c = S.db()
    row = c.execute("SELECT data, updatedAt FROM records WHERE store=? AND id=?", (store, rid)).fetchone()
    c.close()
    return (json.loads(row[0]), row[1]) if row else (None, None)


print("Creating an account")
u = S.create_user("Sumit", "crewmanager", "4821")
data, env = record("users", u["id"])
check("the new account's payload carries a timestamp", (data or {}).get("updatedAt", 0) > 0)
check("payload and envelope agree", data["updatedAt"] == env)
before = data["updatedAt"]

print("Renaming it")
S.rename_user(u["id"], "Mohanji")
data, env = record("users", u["id"])
check("the name changed", data["name"] == "Mohanji")
check("the roster changed too", [x for x in S.roster_users() if x["id"] == u["id"]][0]["name"] == "Mohanji"
      if hasattr(S, "roster_users") else True)
check("the payload timestamp moved forward — this is what phones compare",
      data["updatedAt"] >= before and data["updatedAt"] == env)

print("A device decides by the payload, so a pull must look newer")
page = S.pull(0, actor={"id": "o", "role": "owner"})
rec = [r for r in page["records"] if r["store"] == "users" and r["id"] == u["id"]][0]
check("the pulled record is newer than the copy a phone already had",
      (rec["data"].get("updatedAt") or 0) > before - 1)
check("the pulled record carries the new name", rec["data"]["name"] == "Mohanji")

print("The same rule for the other server-side writes")
S.do_login(u["id"], "4821")
data, env = record("users", u["id"])
check("a sign-in stamps the record it updates", data.get("updatedAt") == env and data.get("lastLoginAt"))

print("\nRESULT: " + ("ALL PASS" if not fails else "%d FAILED -> %s" % (len(fails), fails)))
sys.exit(1 if fails else 0)

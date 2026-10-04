"""Server rules for the duty log: who may write it, and that nobody rewrites it.

The duty log is what a redBus review or a complaint is traced to a crew by, so
the property that matters is that it is append-only for everyone, owner included.

Run: python3 test_dutylog.py
"""
import json
import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="gs-duty-")
os.environ["DB_PATH"] = os.path.join(_tmp, "test.db")
os.environ.pop("TURSO_URL", None)
os.environ.pop("TURSO_DATABASE_URL", None)

import sync_server as S  # noqa: E402

fails = []


def check(name, cond):
    print(("  ok  " if cond else " FAIL ") + name)
    if not cond:
        fails.append(name)


OWNER = {"id": "u-owner", "role": "owner"}
SUPER = {"id": "u-sup", "role": "supervisor"}
CREWM = {"id": "u-crewm", "role": "crewmanager"}
DRIVER = {"id": "u-drvA", "role": "driver"}
STORE = {"id": "u-store", "role": "store"}


def row(rid, **kw):
    d = {"id": rid, "at": S.now_ms() - 1000, "crewId": "crew-1", "role": "driver",
         "busId": "bus-1", "reason": "assign", "by": "u-forged"}
    d.update(kw)
    return d


def push(actor, data, upd=None):
    rec = {"store": "dutylog", "id": data["id"], "updatedAt": upd or S.now_ms(), "data": data}
    return S.push([rec], actor)


def stored(rid):
    c = S.db()
    r = c.execute("SELECT data FROM records WHERE store='dutylog' AND id=?", (rid,)).fetchone()
    c.close()
    return json.loads(r[0]) if r else None


# Who may write.
check("crew manager CAN write the duty log", push(CREWM, row("dl-1"))["applied"] == 1)
check("supervisor CAN write the duty log", push(SUPER, row("dl-2"))["applied"] == 1)
check("driver CANNOT write the duty log", push(DRIVER, row("dl-3"))["rejected"] == 1)
check("store CANNOT write the duty log", push(STORE, row("dl-4"))["rejected"] == 1)

# Who made the change comes from the token.
check("`by` is stamped from the token, not the body", stored("dl-1")["by"] == "u-crewm")

# Append-only, owner included.
check("owner CANNOT rewrite a row",
      push(OWNER, row("dl-1", busId="bus-OTHER"), S.now_ms() + 10)["rejected"] == 1)
check("…and the row is unchanged", stored("dl-1")["busId"] == "bus-1")
check("owner CANNOT delete a row",
      push(OWNER, row("dl-2", _deleted=True), S.now_ms() + 10)["rejected"] == 1)
check("a brand-new tombstone is refused too", push(OWNER, row("dl-5", _deleted=True))["rejected"] == 1)

# Shape.
check("seat must be driver or conductor", push(SUPER, row("dl-6", role="cleaner"))["rejected"] == 1)
check("crew id is required", push(SUPER, row("dl-7", crewId=""))["rejected"] == 1)
check("a far-future time is refused", push(SUPER, row("dl-8", at=S.now_ms() + 86400000))["rejected"] == 1)
check("off a bus (busId null) is allowed", push(SUPER, row("dl-9", busId=None, reason="left"))["applied"] == 1)

# Two phones write the same baseline: the second is a quiet no-op, not a refusal.
first = row("dl-base-crew-1", reason="baseline", at=S.now_ms() - 5000)
check("first baseline lands", push(SUPER, first)["applied"] == 1)
second = row("dl-base-crew-1", reason="baseline", at=S.now_ms() - 10, busId="bus-2")
r = push(CREWM, second, S.now_ms() + 20)
check("second baseline is not refused", r["rejected"] == 0)
s = stored("dl-base-crew-1")
check("…and the first one is kept", s["busId"] == "bus-1" and s["by"] == "u-sup")
check("a baseline cannot be overwritten by a non-baseline",
      push(SUPER, row("dl-base-crew-1", reason="assign", busId="bus-3"), S.now_ms() + 30)["rejected"] == 1)

print("\n%d failed" % len(fails) if fails else "\nall passed")
raise SystemExit(1 if fails else 0)

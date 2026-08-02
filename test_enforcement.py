"""Direct test of the device-identity server enforcement (Phases 1-3).

/g-saathi runs the app OFFLINE (no sync_server), so it cannot exercise server-side
write enforcement. This drives push()/register_roster()/may_write() against an
isolated SQLite DB and asserts the security properties hold:
  - roster materialization creates crew accounts (0000), idempotently, skipping
    tombstones and non-crew roles;
  - the role->store matrix blocks cross-role forgery (driver can't write ledger)
    while allowing every legitimate flow;
  - the server stamps immutable _by/_byRole from the token, overriding the body.

Run: DB_PATH=<temp> python3 test_enforcement.py  (wrapper sets a temp DB below).
"""
import json
import os
import sys
import tempfile

# Isolate the DB before importing the server (it reads DB_PATH at import time).
_tmp = tempfile.mkdtemp(prefix="gs-test-")
os.environ["DB_PATH"] = os.path.join(_tmp, "test.db")
os.environ.pop("TURSO_URL", None)
os.environ.pop("TURSO_DATABASE_URL", None)

import sync_server as S  # noqa: E402

fails = []


def check(name, cond):
    print(("  ok  " if cond else " FAIL ") + name)
    if not cond:
        fails.append(name)


def put_user_record(uid, name, role, deleted=False):
    """Simulate a synced users record (as the owner device would push)."""
    c = S.db()
    rev = c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()[0]
    data = {"id": uid, "name": name, "role": role}
    if deleted:
        data["_deleted"] = True
    S._upsert_record(c, "users", uid, data, S.now_ms(), rev)
    c.commit()
    c.close()


def account_exists(uid):
    c = S.db()
    row = c.execute("SELECT id FROM users WHERE id=?", (uid,)).fetchone()
    c.close()
    return row is not None


def stored(store, rid):
    c = S.db()
    row = c.execute("SELECT data FROM records WHERE store=? AND id=?", (store, rid)).fetchone()
    c.close()
    return json.loads(row[0]) if row else None


print("Phase 1a — roster materialization from a SENT roster (primary path)")
# The bundled seed never pushes crew, so the owner device sends the list. Include a
# non-crew role and a blank id to prove they're filtered out.
SENT = [
    {"id": "u-drvA", "name": "Driver A", "role": "driver"},
    {"id": "u-conB", "name": "Conductor B", "role": "conductor"},
    {"id": "u-ownerX", "name": "Owner X", "role": "owner"},   # non-crew: skipped
    {"id": "", "name": "No id", "role": "driver"},            # blank id: skipped
]
created = S.register_roster(SENT)
check("materializes exactly the 2 sent crew", created == 2)
check("driver account created", account_exists("u-drvA"))
check("conductor account created", account_exists("u-conB"))
check("non-crew (owner) in payload skipped", not account_exists("u-ownerX"))
check("crew can log in with 0000", S.do_login("u-drvA", "0000") is not None)
check("crew rejects a wrong PIN", S.do_login("u-drvA", "1234") is None)
check("re-run is idempotent (0 new)", S.register_roster(SENT) == 0)

print("Phase 1b — fallback: materialize from pushed records when no roster is sent")
put_user_record("u-drvC", "Driver C", "driver")
put_user_record("u-drvGone", "Deleted Driver", "driver", deleted=True)
put_user_record("u-ownerY", "Owner Y", "owner")
created_fb = S.register_roster()   # no crew arg → scan records
check("fallback creates the pushed driver record", account_exists("u-drvC"))
check("fallback skips tombstoned crew", not account_exists("u-drvGone"))
check("fallback skips non-crew record", not account_exists("u-ownerY"))
check("fallback created exactly 1", created_fb == 1)

print("Phase 3 — role->store write matrix")
OWNER = {"id": "u-owner", "role": "owner"}
SUPER = {"id": "u-sup", "role": "supervisor"}
STORE = {"id": "u-store", "role": "store"}
MECH = {"id": "u-m1", "role": "mechanic"}
DRIVER = {"id": "u-drvA", "role": "driver"}
COND = {"id": "u-conB", "role": "conductor"}


def push_one(actor, store, rid, data=None):
    rec = {"store": store, "id": rid, "updatedAt": S.now_ms() + 1, "data": data or {"id": rid}}
    return S.push([rec], actor)


# The security wins: crew cannot forge money / fleet / vendor records.
check("driver CANNOT write ledger", push_one(DRIVER, "ledger", "l-forge")["rejected"] == 1)
check("conductor CANNOT write ledger", push_one(COND, "ledger", "l-forge2")["rejected"] == 1)
check("mechanic CANNOT write ledger", push_one(MECH, "ledger", "l-forge3")["rejected"] == 1)
check("driver CANNOT write vendors", push_one(DRIVER, "vendors", "v-forge")["rejected"] == 1)
check("driver CANNOT write buses", push_one(DRIVER, "buses", "b-forge")["rejected"] == 1)
check("mechanic CANNOT write purchases", push_one(MECH, "purchases", "p-forge")["rejected"] == 1)
check("driver CANNOT write an unknown store", push_one(DRIVER, "totallynew", "x")["rejected"] == 1)

# Every legitimate flow still lands.
check("store CAN write ledger (issue part)", push_one(STORE, "ledger", "l-ok")["applied"] == 1)
check("store CAN write jobcards (fulfil)", push_one(STORE, "jobcards", "j-store")["applied"] == 1)
check("mechanic CAN write jobcards (work)", push_one(MECH, "jobcards", "j-mech")["applied"] == 1)
check("driver CAN write trips (cash session)", push_one(DRIVER, "trips", "t-ok")["applied"] == 1)
check("driver CAN write attendance", push_one(DRIVER, "attendance", "a-drv")["applied"] == 1)
check("conductor CAN write attendance", push_one(COND, "attendance", "a-con")["applied"] == 1)
check("conductor CAN write driverreports", push_one(COND, "driverreports", "dr-con")["applied"] == 1)
check("store CAN write vendors", push_one(STORE, "vendors", "v-ok")["applied"] == 1)
check("supervisor CAN write buses", push_one(SUPER, "buses", "b-ok")["applied"] == 1)
check("owner passes everything (ledger)", push_one(OWNER, "ledger", "l-owner")["applied"] == 1)
check("owner passes everything (buses)", push_one(OWNER, "buses", "b-owner")["applied"] == 1)
check("nobody may client-push gpsevents (server-ingest only)", push_one(MECH, "gpsevents", "ev-x")["rejected"] == 1)

print("Phase 2 — immutable server provenance (_by / _byRole / _org)")
push_one(DRIVER, "trips", "t-prov", {"id": "t-prov", "driverId": "u-drvA", "_by": "u-owner"})
rec = stored("trips", "t-prov")
check("_by stamped from token, not body", rec.get("_by") == "u-drvA")
check("body-supplied _by was OVERWRITTEN", rec.get("_by") != "u-owner")
check("_byRole stamped from token", rec.get("_byRole") == "driver")
check("_org tenant stamped", rec.get("_org") == "mahalaxmi")

print()
if fails:
    print(f"RESULT: {len(fails)} FAILED -> {fails}")
    sys.exit(1)
print("RESULT: ALL PASS")

#!/usr/bin/env python3
"""Outside repair, slice OB1: who may read a gate pass, and the rewind that makes it arrive.

Decision 3 gives the storekeeper and the crew manager the slip. The storekeeper
could already read it; the crew manager could not, and even once it can, the
crew manager's cursor has stepped past every pass that existed before the deploy
(the server takes the cursor BEFORE redaction), so without a rewind they would
never receive one and nothing would say so. This file holds both halves:

  * the read boundary, as exact sets in BOTH directions, through the real
    `redact_for` and `_never_for` rather than through the table;
  * the derivation: the slip's read roles ARE the piece's, one object;
  * `read_scope_digest`: sha256, so stable across processes (Python's `hash()`
    is salted per PYTHONHASHSEED and would rewind every device on every login);
  * the client half in v2/sync.js, run for real under node with a fake login.

    /usr/bin/python3 test_outside_readscope.py
"""
import os
import random
import shutil
import subprocess
import sys
import tempfile

os.environ["DB_PATH"] = tempfile.mktemp(suffix=".db")
for k in ("DATABASE_URL", "TURSO_URL", "TURSO_DATABASE_URL"):
    os.environ.pop(k, None)
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import sync_server as S  # noqa: E402
import v2_perms as P  # noqa: E402

fails = []


def check(name, cond):
    print(("  ok  " if cond else " FAIL ") + name)
    if not cond:
        fails.append(name)


def actor_for(role):
    return {"id": "u-" + role, "role": role, "crewId": "d-" + role, "busId": "bus-" + role}


def slip(i="gp-1"):
    return {"store": "gatepasses", "id": i, "data": {"id": i, "passNo": "GP-1", "vendor": "Ace Tyres"},
            "updatedAt": S.now_ms(), "rev": 1}


# Spelled out, not read off the table: a role dropped from the derivation must
# fail here rather than take its own assertion with it.
READERS = {"owner", "supervisor", "store", "crewmanager"}
BLIND = {"mechanic", "driver", "conductor", "office"}

print("The slip is read by exactly the roles that read the piece")
check("every role is in exactly one of the two lists", READERS | BLIND == set(P.ALL_ROLES)
      and not (READERS & BLIND))
got = {r for r in P.ALL_ROLES if S.redact_for(actor_for(r), slip()) is not None}
check("the roles that receive a gate pass are exactly %s (got %s)" % (sorted(READERS), sorted(got)),
      got == READERS)
for r in sorted(READERS):
    out = S.redact_for(actor_for(r), slip())
    check("%-11s receives a FULL record, not a _redacted one" % r,
          out is not None and not out["data"].get("_redacted") and out["data"].get("vendor") == "Ace Tyres")
    check("%-11s is not told to skip the store in SQL" % r, "gatepasses" not in S._never_for(actor_for(r)))

print("\nThe other four receive nothing, and the SQL does not even read the store")
for r in sorted(BLIND):
    a = actor_for(r)
    check("%-11s receives zero gate pass records" % r, S.redact_for(a, slip()) is None)
    check("%-11s has gatepasses in never_for, so pull() skips it" % r, "gatepasses" in S._never_for(a))

print("\nOne rule, two keys")
check("PAPER_FOLLOWS_UNIT names the slip then the piece", tuple(P.PAPER_FOLLOWS_UNIT) == ("gatepasses", "components"))
# NOT read_roles(): `components` carries a v1-compat row for the mechanic (the
# Store screen's tracked-pieces card), and the mechanic must not read the slip, so
# read_roles() differs by exactly that one v1 row. The rule lives in the table.
check("STORE_READ_ROLES['gatepasses'] == STORE_READ_ROLES['components']",
      P.STORE_READ_ROLES["gatepasses"] == P.STORE_READ_ROLES["components"])
check("read_roles() differs only by the mechanic's v1 compat row on components",
      P.read_roles("components") - P.read_roles("gatepasses") == {"mechanic"}
      and not (P.read_roles("gatepasses") - P.read_roles("components")))
check("and it is the same object in the table, not an equal copy",
      P.STORE_READ_ROLES["gatepasses"] is P.STORE_READ_ROLES["components"])
same = {"gatepasses": ["owner", "supervisor", "store", "crewmanager"],
        "components": ("crewmanager", "store", "supervisor", "owner")}
try:
    P.assert_write_roles_follow(same)
    ok = True
except Exception:
    ok = False
check("assert_write_roles_follow accepts equal sets in any order or type", ok)
for label, bad in (
        ("a role missing from the slip", {"gatepasses": ["owner", "supervisor", "store"],
                                          "components": ["owner", "supervisor", "store", "crewmanager"]}),
        ("a role extra on the slip", {"gatepasses": ["owner", "supervisor", "store", "crewmanager", "office"],
                                      "components": ["owner", "supervisor", "store", "crewmanager"]}),
        ("one key absent", {"gatepasses": ["owner"]})):
    try:
        P.assert_write_roles_follow(bad)
        raised = False
    except Exception:
        raised = True
    check("assert_write_roles_follow raises on %s" % label, raised)

print("\nThe outside decision is one function, over one set")
check("only owner and supervisor may set outside",
      {r for r in P.ALL_ROLES if P.may_set_outside(r)} == {"owner", "supervisor"})
check("OUTSIDE_CARD_FIELDS is the contract 6.1 set, and not the pass pointers",
      set(P.OUTSIDE_CARD_FIELDS) == {"outside", "outsideCity", "outsideLat", "outsideLng", "externalVendor",
                                     "externalCost", "enterAt", "outAt", "billPhotos", "closeNoBillReason"}
      and "gatePassNo" not in P.OUTSIDE_CARD_FIELDS and "gatePassId" not in P.OUTSIDE_CARD_FIELDS)

print("\nread_scope_digest")
dig = {r: P.read_scope_digest(r) for r in sorted(P.ALL_ROLES)}
import re  # noqa: E402
check("every digest is 8 lowercase hex", all(re.fullmatch(r"[0-9a-f]{8}", d) for d in dig.values()))
check("roles that read different things have different digests",
      len({dig[r] for r in ("crewmanager", "store", "mechanic", "driver", "conductor", "office")}) == 6)


def digest_in_subprocess(seed, role):
    env = dict(os.environ, PYTHONHASHSEED=str(seed))
    return subprocess.check_output(
        [sys.executable, "-c", "import sys; sys.path.insert(0, %r); import v2_perms as P; print(P.read_scope_digest(%r))"
         % (HERE, role)], env=env).decode().strip()


for r in ("crewmanager", "mechanic"):
    seen = {digest_in_subprocess(s, r) for s in (1, 2, 987)}
    check("%s digest is identical across processes with different PYTHONHASHSEED" % r,
          seen == {dig[r]})
before = P.read_scope_digest("mechanic")
P.STORE_READ_ROLES["nightlist"] = P.STORE_READ_ROLES["nightlist"] | {"mechanic"}
try:
    check("a role that gains a store gets a different digest", P.read_scope_digest("mechanic") != before)
    check("and a role that did not is unchanged", P.read_scope_digest("driver") == dig["driver"])
finally:
    P.STORE_READ_ROLES["nightlist"] = frozenset({"owner", "supervisor", "crewmanager"})

print("\nThe login response carries the digest -- the wire between the two halves")
# Both halves of 2.3 were built and tested apart: the digest in v2_perms, the
# rewind in v2/sync.js against a hand-written login body. Nothing asserted that
# a REAL login says `readScope`, and the server did not -- so the rewind could
# never fire on any device. This is that assertion. The PIN is generated here and
# never written down: a tempfile database and a random four digits.
_pin = "%04d" % random.SystemRandom().randrange(10000)
for _role in ("crewmanager", "owner", "store", "mechanic"):
    _uid = "u-login-" + _role
    _salt = S.new_salt() if hasattr(S, "new_salt") else os.urandom(8).hex()
    with S._lock:
        _c = S.db()
        _c.execute("INSERT OR REPLACE INTO users(id,name,role,salt,pin_hash) VALUES(?,?,?,?,?)",
                   (_uid, _role.title(), _role, _salt, S.hash_pin(_salt, _pin)))
        _c.commit()
        _c.close()
    _r = S.do_login(_uid, _pin)
    check("a %s's login response carries readScope" % _role, bool(_r) and "readScope" in _r)
    check("...and it is read_scope_digest(%s), not another role's" % _role,
          bool(_r) and _r.get("readScope") == P.read_scope_digest(_role))
check("two roles that read different things are handed different digests",
      P.read_scope_digest("crewmanager") != P.read_scope_digest("mechanic"))

print("\nClient: a changed readScope rewinds both cursors; an absent one rewinds neither")
NODE_HARNESS = r"""
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = fs.readFileSync(path.join(process.argv[2], 'v2', 'sync.js'), 'utf8');
function run(seed, loginBody) {
  const store = Object.assign({ token: 't', lastRev: '500', lastRevDeferred: '400',
    outbox: '[]', clockOffset: '0', pullSkips: '{"parts":{"tries":2}}',
    syncHeal_pullPaging_v1: '1', syncBackfill_compdefvendtrip_v1: '1' }, seed);
  const ls = { getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  const never = new Promise(() => {});
  const res = (b) => ({ ok: true, status: 200, json: async () => b, clone: () => ({ json: async () => b }), headers: { get: () => null } });
  const sb = { console, JSON, Math, Date, Promise, Set, Map, Object, Array, Number, String, Error,
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
    location: { hostname: 'localhost', protocol: 'http:', origin: 'http://localhost' },
    AbortController, PullApply: require(path.join(process.argv[2], 'v2', 'pullapply.js')),
    DB: {}, indexedDB: { open: () => ({}) },
    // The login answers; anything else (the tick's pull) never returns, so the
    // cursors we read are the ones the login left and not a later pull's.
    fetch: (url) => (String(url).indexOf('/auth/login') >= 0 ? Promise.resolve(res(loginBody)) : never) };
  sb.window = sb; sb.self = sb; sb.window.localStorage = ls; sb.window.addEventListener = () => {};
  const ctx = vm.createContext(sb);
  vm.runInContext(src, ctx, { filename: 'v2/sync.js' });
  const Sync = vm.runInContext('Sync', ctx);
  return Sync.login('u-cm', '0000').then((r) => ({ r, store }));
}
(async () => {
  const user = { id: 'u-cm', name: 'x', role: 'crewmanager' };
  const out = {};
  const base = { pullScope: 'full:v2' };
  let x = await run(Object.assign({ readScope: 'aaaaaaaa' }, base), { token: 't', user, readScope: 'bbbbbbbb' });
  out.changed = { rev: x.store.lastRev || null, def: x.store.lastRevDeferred || null, skips: x.store.pullSkips || null, kept: x.store.readScope };
  x = await run(Object.assign({ readScope: 'aaaaaaaa' }, base), { token: 't', user, readScope: 'aaaaaaaa' });
  out.same = { rev: x.store.lastRev || null, def: x.store.lastRevDeferred || null, skips: x.store.pullSkips || null };
  x = await run(base, { token: 't', user });
  out.absent = { rev: x.store.lastRev || null, def: x.store.lastRevDeferred || null, skips: x.store.pullSkips || null, kept: x.store.readScope || null };
  x = await run(base, { token: 't', user, readScope: 'cccccccc' });
  out.first = { rev: x.store.lastRev || null, def: x.store.lastRevDeferred || null, kept: x.store.readScope || null };
  console.log(JSON.stringify(out)); process.exit(0);
})().catch((e) => { console.log('ERR ' + e.stack); process.exit(1); });
"""
node = shutil.which("node")
if not node:
    check("node is available to run the client half", False)
else:
    import json
    fd, path = tempfile.mkstemp(suffix=".js")
    os.write(fd, NODE_HARNESS.encode())
    os.close(fd)
    try:
        p = subprocess.run([node, path, HERE], capture_output=True, text=True, timeout=60)
    finally:
        os.unlink(path)
    try:
        o = json.loads(p.stdout.strip().splitlines()[-1])
    except Exception:
        o = None
        print(p.stdout, p.stderr)
    check("the client harness ran", o is not None)
    if o:
        c, s, a, f = o["changed"], o["same"], o["absent"], o["first"]
        check("a changed readScope rewinds lastRev", c["rev"] is None)
        check("...and lastRevDeferred, together", c["def"] is None)
        check("...and clears pullSkips", c["skips"] is None)
        check("...and stores the new digest", c["kept"] == "bbbbbbbb")
        check("an unchanged readScope rewinds neither cursor", s["rev"] == "500" and s["def"] == "400")
        check("...and keeps pullSkips", s["skips"] is not None)
        check("an absent readScope rewinds neither cursor", a["rev"] == "500" and a["def"] == "400")
        check("...keeps pullSkips and stores nothing", a["skips"] is not None and a["kept"] is None)
        check("the first digest a device sees is stored without a rewind",
              f["rev"] == "500" and f["def"] == "400" and f["kept"] == "cccccccc")
    SYNC = open(os.path.join(HERE, "v2", "sync.js")).read()
    check("SCOPE_V was not bumped", "const SCOPE_V = 'v2';" in SYNC)

if fails:
    print("\n%d FAILED" % len(fails))
    sys.exit(1)
print("\nall ok")

/* Tests for v2/night.js — tonight's running list. Run: node test_v2_night.js
 *
 * At the repo ROOT and not in v2/, because run-tests.py auto-discovers test_*.js
 * at the root only and does not recurse: a test in v2/ would never run, and a
 * test nobody runs is not a test.
 *
 * Each case below is one of the three decisions in contract §5 that the module
 * exists to hold, phrased so that undoing the decision turns this file red:
 *
 *   - a MAP keyed by bus id, so a tick can be taken back and the count can reach
 *     zero (a union merge, or a list, makes zero unreachable);
 *   - `at` stamped by the SERVER, asserted on the PUSHED PAYLOAD rather than on
 *     the stored record, because a client stamp would pass every test that did
 *     not look there;
 *   - `running:false` is a real state and is not the same as absent.
 */
process.env.TZ = process.env.TZ || 'UTC';   // nothing here may depend on the machine's zone

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const NIGHT_SRC = fs.readFileSync(path.join(ROOT, 'v2', 'night.js'), 'utf8');

let fails = 0;
function check(name, cond) { console.log((cond ? '  ok  ' : ' FAIL ') + name); if (!cond) fails++; }

/* A stand-in for v2/db.js, faithful in the three ways that matter here:
 *   - put() stamps updatedAt and nothing else, exactly as DB.put does;
 *   - get() returns null for a missing row (and for a tombstone);
 *   - every write and read is a CLONE, because IndexedDB stores a copy — a fake
 *     that handed back the same object would let a test pass on identity where
 *     the real store would have given back last night's data.
 * putRaw() keeps the server's own updatedAt and does not notify, which is how a
 * pulled record arrives; that is the path the server-stamp cases need. */
function fakeDB() {
  const data = {};
  const clone = (o) => JSON.parse(JSON.stringify(o));
  return {
    changes: [],
    async get(store, id) {
      const v = (data[store] || {})[id];
      return v && !v._deleted ? clone(v) : null;
    },
    async put(store, obj) {
      obj.updatedAt = Date.now();
      (data[store] || (data[store] = {}))[obj.id] = clone(obj);
      this.changes.push(store + '|' + obj.id);
      return obj;
    },
    async putRaw(store, obj) {
      (data[store] || (data[store] = {}))[obj.id] = clone(obj);
      return obj;
    },
    _rawGet(store, id) { return Promise.resolve(clone((data[store] || {})[id] || null)); },
  };
}

/* The wire record v2/sync.js would push for an outbox key (its recordForKey).
 * The `at` assertions below run against THIS, not against what is on disk: the
 * question is what this device sends the server, and the stored record is the
 * same object only until somebody decides it is convenient for it not to be. */
async function pushedPayload(db, id) {
  const rec = await db._rawGet('nightlist', id);
  if (!rec) return null;
  return { store: 'nightlist', id: id, data: rec, updatedAt: rec.updatedAt || 0 };
}

/* Which device we are. night.js resolves DB at CALL time, not at load, so one
 * module serves every fake database here and the swap has to happen in front of
 * each call rather than once per "device" — two devices sharing one global is
 * precisely how the first version of this file quietly tested one of them twice. */
const Night = require('./v2/night.js');
function on(db) { global.DB = db; return Night; }

async function main() {
  const DATE = '2026-11-04';
  const OTHER = '2026-11-05';

  /* ---- the day key ------------------------------------------------------ */
  // IST is UTC+5:30 and the key must be the server's (_ist_day), not the
  // machine's: 18:45 UTC on the 4th is already a quarter past midnight in
  // Jaipur, so that tick belongs to the night of the 5th.
  const N = on(fakeDB());
  check('dayKey is the IST day, so 18:45 UTC is already tomorrow night',
        N.dayKey(Date.UTC(2026, 10, 4, 18, 45)) === '2026-11-05');
  check('…and 18:00 UTC (23:30 IST) is still tonight',
        N.dayKey(Date.UTC(2026, 10, 4, 18, 0)) === '2026-11-04');
  check('dayKey() with no argument answers in the same shape',
        /^\d{4}-\d{2}-\d{2}$/.test(N.dayKey()));

  /* ---- two writers, one record ------------------------------------------ */
  // Red the moment the id picks up a device or a user: two people opening the
  // board tonight would then write two competing records, and the count would be
  // whichever of them a screen happened to read.
  const dbA = fakeDB(), dbB = fakeDB();
  await on(dbA).setRunning(DATE, 'b1', true);
  await on(dbB).setRunning(DATE, 'b2', true);
  const recA = await on(dbA).get(DATE);
  const recB = await on(dbB).get(DATE);
  check('the id is the night and nothing else', recA.id === 'nl-' + DATE);
  check('…so two writers on one night address ONE record', recA.id === recB.id);
  check('…and each writer touches only its own bus key',
        Object.keys(recA.buses).join() === 'b1' && Object.keys(recB.buses).join() === 'b2');

  /* Both ticks survive, which is what the map buys and a list could not.
   * The merge itself is the server's (contract §4.4, strategy S); what this side
   * has to guarantee is that a write confined to one key leaves every other
   * entry — including the server's stamps on it — exactly as the server wrote
   * it. If it did not, there would be nothing left for a per-bus merge to merge. */
  const merged = { id: 'nl-' + DATE, date: DATE,
                   buses: { b1: { running: true, at: 111, by: 'u-sup' },
                            b2: { running: true, at: 222, by: 'u-crew' } },
                   createdAt: 100, updatedAt: 222 };
  await dbA.putRaw('nightlist', merged);
  await on(dbA).setRunning(DATE, 'b1', false);          // one bus, again
  const after = await on(dbA).get(DATE);
  check('a write to one bus leaves another bus\'s server stamps untouched',
        after.buses.b2.at === 222 && after.buses.b2.by === 'u-crew' && after.buses.b2.running === true);
  check('…and both buses are still on the night\'s single record',
        Object.keys(after.buses).sort().join() === 'b1,b2');

  /* ---- the count reaches zero ------------------------------------------- */
  // The whole point. Red if the merge becomes a union, or if an un-tick deletes
  // the entry and something later reads absence as agreement.
  const C = on(fakeDB());
  await C.setRunning(DATE, 'b1', true);
  await C.setRunning(DATE, 'b2', true);
  check('both ticks are running', (await C.running(DATE)).sort().join() === 'b1,b2');
  await C.setRunning(DATE, 'b1', false);
  check('a bus ticked by mistake can be un-ticked', (await C.running(DATE)).join() === 'b2');
  await C.setRunning(DATE, 'b2', false);
  const zero = await C.running(DATE);
  check('…and the count reaches ZERO', zero.length === 0);
  const zeroRec = await C.get(DATE);
  check('an un-tick is stored as running:false, not as a deletion',
        zeroRec.buses.b1.running === false && zeroRec.buses.b2.running === false);
  check('running() counts only running===true, never a truthy accident',
        (await C.running(DATE)).length === 0 && Object.keys(zeroRec.buses).length === 2);

  /* ---- null is "not yet decided", never "no buses run" ------------------ */
  check('get() is null for a night nobody has touched', (await C.get(OTHER)) === null);
  check('…and null is distinguishable from a night where nothing runs',
        (await C.get(OTHER)) === null && (await C.get(DATE)) !== null && (await C.running(DATE)).length === 0);
  check('running() on an untouched night is empty without inventing a record',
        (await C.running(OTHER)).length === 0 && (await C.get(OTHER)) === null);

  /* ---- undecided: the honest third state -------------------------------- */
  // Red if absent is treated as false. Unknown and no must never look alike
  // (v2-foundation-ui.md §3.6), and ux §7 measures 5 and 6 read a `false` out of
  // this record rather than inferring it from silence.
  const ALL = ['b1', 'b2', 'b3'];
  const D = on(fakeDB());
  await D.setRunning(DATE, 'b1', true);
  await D.setRunning(DATE, 'b2', false);
  check('undecided() is the buses with NO entry', (await D.undecided(DATE, ALL)).join() === 'b3');
  check('…so a running:false bus is decided, not undecided',
        (await D.undecided(DATE, ALL)).indexOf('b2') < 0 && (await D.running(DATE)).indexOf('b2') < 0);
  check('…and before anybody decides, every bus is undecided',
        (await D.undecided(OTHER, ALL)).join() === 'b1,b2,b3');
  check('a bus absent from the record is not counted as running',
        (await D.running(DATE)).join() === 'b1');

  /* ---- no client-stamped `at`, asserted on the pushed payload ----------- */
  // This is the check the brief asks for by name, and it is the one a client
  // stamp would otherwise sail past: the store's immunity to §4.0's clock
  // problem is entirely that per-bus ordering comes from server time.
  const dbE = fakeDB();
  const E = on(dbE);
  await E.setRunning(DATE, 'b1', true);
  const wire = await pushedPayload(dbE, 'nl-' + DATE);
  const e1 = wire.data.buses.b1;
  check('the PUSHED entry carries no `at` at all', !('at' in e1));
  check('…and no `by` either — the server forces it from the token', !('by' in e1));
  check('…and carries `running` and nothing else', Object.keys(e1).join() === 'running');

  // A re-tick of a bus the server has already stamped must DROP that stamp, so
  // _guard_write re-stamps the entry it actually changed. Keeping the old `at`
  // would hand the ordering back to whatever wrote it last.
  await dbE.putRaw('nightlist', merged);
  await on(dbE).setRunning(DATE, 'b1', true);
  const wire2 = await pushedPayload(dbE, 'nl-' + DATE);
  check('a re-tick drops the server\'s old `at` so the server re-stamps it',
        !('at' in wire2.data.buses.b1) && !('by' in wire2.data.buses.b1));
  check('…while the untouched entry still carries the server\'s stamp',
        wire2.data.buses.b2.at === 222);

  /* The same thing again in the source, so a future builder cannot add a stamp
   * quietly: a mistake here is invisible on screen and only shows up as the
   * clock bug this store was shaped to avoid. Comments are stripped first, so
   * prose about `at` does not trip it (a check that fails on its own
   * explanation teaches people to delete checks). */
  const code = NIGHT_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  check('night.js assigns no `at` property anywhere', !/(^|[^A-Za-z0-9_$.])at\s*:/.test(code));
  check('night.js assigns no `by` property anywhere', !/(^|[^A-Za-z0-9_$.])by\s*:/.test(code));
  check('night.js reads no timezone from the machine, only the IST offset',
        code.indexOf('19800000') > 0 && !/getTimezoneOffset|Asia\/Kolkata/.test(code));

  /* ---- the record v1 never sees ----------------------------------------- */
  // The store is safe BECAUSE it is new. Red if somebody teaches v1 about it:
  // v1 would then have the object store, and whole-record last-write-wins from a
  // v1 device is exactly the clobber a new store was chosen to avoid.
  const v1db = fs.readFileSync(path.join(ROOT, 'db.js'), 'utf8');
  const v1sync = fs.readFileSync(path.join(ROOT, 'sync.js'), 'utf8');
  check('v1\'s db.js does not know the nightlist store', v1db.indexOf('nightlist') < 0);
  check('v1\'s sync.js does not know it either', v1sync.indexOf('nightlist') < 0);
  check('the record carries no field v1 would need, and none it does not',
        Object.keys(wire.data).sort().join() === 'buses,createdAt,date,id,updatedAt');
  check('`date` equals the id\'s suffix, which is what _guard_write checks',
        wire.data.date === wire.data.id.slice(3) && wire.data.id.slice(0, 3) === 'nl-');

  /* ---- the store this module writes into (B2's file, not this slice's) -- */
  /* v2/db.js and v2/sync.js belong to B2; this slice does not edit them and must
   * not work around them, because a module that quietly tolerates a missing
   * store is how two slices end up disagreeing about a shape. It does assert
   * them: without the declaration there is no object store on any device, and
   * without the DB_VERSION bump onupgradeneeded never runs to create it, which
   * is not a slow path but a blank app with nothing in the console. */
  const v2db = fs.readFileSync(path.join(ROOT, 'v2', 'db.js'), 'utf8');
  const v2sync = fs.readFileSync(path.join(ROOT, 'v2', 'sync.js'), 'utf8');
  check('v2/db.js declares nightlist keyed by id', /nightlist\s*:\s*'id'/.test(v2db));
  const ver = /const DB_VERSION\s*=\s*(\d+)/.exec(v2db);
  check('…behind a DB_VERSION bump, or no device ever gets the object store',
        !!ver && Number(ver[1]) >= 29);
  check('…and v2/sync.js pushes and pulls it, or the record never leaves the phone',
        /'nightlist'/.test(v2sync));

  console.log(fails ? `\n${fails} FAILED` : '\nall ok');
  process.exit(fails ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });

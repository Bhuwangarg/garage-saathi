/* Tests for the outside-repair stores in v2/db.js: the ONE transaction a
 * multi-store write goes through, the fixture rows, and the version line.
 * Run: node test_v2_outside_db.js
 *
 * Lives at the repo root because scripts/run-tests.py discovers test_*.js there
 * only. Loads the real v2/db.js the way a page does (a plain script in a vm
 * context) against a small in-memory IndexedDB. The transaction count is taken
 * by wrapping db.transaction, not by reading the code: the claim under test is
 * how many transactions IndexedDB was asked to open.
 *
 * Contract: docs/v2/plan/outside-repair-contract.md sections 4, 4.4, 5, 10, 11.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fails = 0;
function check(name, cond) { console.log((cond ? '  ok  ' : ' FAIL ') + name); if (!cond) fails++; }

const ROOT = __dirname;
const DB_SRC = fs.readFileSync(path.join(ROOT, 'v2', 'db.js'), 'utf8');
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const DAY = 86400000;

/* In-memory IndexedDB: requests answer on a later turn and a transaction
 * completes once everything queued on it has. `log` records every
 * db.transaction() call with its store list and mode. A store not named when
 * the transaction opened throws, as the real one does. */
function newIDB() {
  const stores = {};
  const log = [];
  let version = 0;
  function txObj(names) {
    const t = { oncomplete: null, onerror: null, onabort: null, error: null };
    let pending = 0, settled = false;
    const sched = () => setTimeout(() => {
      if (pending || settled) return;
      settled = true;
      if (t.oncomplete) t.oncomplete();
    }, 0);
    const request = (fn) => {
      const r = { onsuccess: null, onerror: null, result: undefined, error: null };
      pending++;
      setTimeout(() => {
        pending--;
        try { r.result = fn(); } catch (e) { r.error = e; if (r.onerror) r.onerror(); sched(); return; }
        if (r.onsuccess) r.onsuccess();
        sched();
      }, 0);
      return r;
    };
    t.objectStore = (n) => {
      if (names.indexOf(n) < 0) throw new Error('NotFoundError: ' + n + ' not in this transaction');
      const s = stores[n];
      return {
        transaction: t,
        get: (k) => request(() => clone(s.rows.get(String(k)))),
        getAll: () => request(() => [...s.rows.values()].map(clone)),
        put: (o) => request(() => { s.rows.set(String(o[s.keyPath]), clone(o)); return o[s.keyPath]; }),
        delete: (k) => request(() => { s.rows.delete(String(k)); }),
        clear: () => request(() => { s.rows.clear(); }),
      };
    };
    sched();
    return t;
  }
  const db = {
    objectStoreNames: { contains: (n) => !!stores[n] },
    createObjectStore: (n, o) => { stores[n] = { keyPath: o.keyPath, rows: new Map() }; return {}; },
    transaction: (n, mode) => { const names = Array.isArray(n) ? n : [n]; log.push({ names, mode: mode || 'readonly' }); return txObj(names); },
    close() {},
    onversionchange: null,
  };
  return {
    stores, log,
    idb: {
      open(name, v) {
        const req = { onupgradeneeded: null, onsuccess: null, onerror: null, onblocked: null, result: null };
        setTimeout(() => {
          req.result = db;
          if (v > version) { version = v; if (req.onupgradeneeded) req.onupgradeneeded({ target: { result: db } }); }
          if (req.onsuccess) req.onsuccess();
        }, 0);
        return req;
      },
    },
  };
}

function load(src) {
  const idb = newIDB();
  const sandbox = {
    console, JSON, Math, Date, Promise, Set, Map, Object, Array, Number, String, Error,
    crypto: require('crypto').webcrypto, indexedDB: idb.idb, setTimeout, clearTimeout,
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(src || DB_SRC, ctx, { filename: 'v2/db.js' });
  return {
    idb, ctx,
    DB: vm.runInContext('DB', ctx),
    STORES: vm.runInContext('Object.keys(STORES)', ctx),
    seed: (demo) => vm.runInContext('seedIfEmpty(' + (demo ? 'true' : 'false') + ')', ctx),
  };
}
const rowsOf = (h, store) => [...h.idb.stores[store].rows.values()];

async function main() {
  /* ---- 1, 2, 3: putMany -------------------------------------------------- */
  {
    const h = load();
    // A piece already on the device, put straight into the fake store: putRaw would also
    // record a base for it (a pulled row is its own base), and then a putMany that skipped
    // the snapshot would still find one and check 3 could not fail.
    await h.DB.bulkRawGet('components', ['c1']);                         // opens the db
    h.idb.stores.components.rows.set('c1', { id: 'c1', state: 'sent-out', history: [] });
    const changes = [];
    h.DB.onChange = (store, id) => changes.push(store + '|' + id);
    h.DB.clearDirty();
    h.idb.log.length = 0;
    await h.DB.putMany([
      { store: 'gatepasses', obj: { id: 'gp-x', no: 'OJ-260101-GPX0', status: 'returned' } },
      { store: 'components', obj: { id: 'c1', state: 'refurbished', history: [{ id: 'h-1', type: 'return', passId: 'gp-x' }] } },
      { store: 'jobcards', obj: { id: 'jx', status: 'open', gatePassId: 'gp-x' } },
    ]);
    const writes = h.idb.log.filter((t) => t.mode === 'readwrite');
    console.log('  measured: transactions opened by a three-store putMany = ' + h.idb.log.length +
      ' (' + writes.length + ' readwrite)');
    check('1. putMany opens exactly ONE transaction for a three-store write', h.idb.log.length === 1 && writes.length === 1);
    check('1. …and it is one readwrite over the stores named',
      ['gatepasses', 'components', 'jobcards'].every((n) => writes[0].names.indexOf(n) >= 0));
    check('1. …all three rows landed',
      rowsOf(h, 'gatepasses').length === 1 && rowsOf(h, 'jobcards').length === 1 &&
      rowsOf(h, 'components')[0].state === 'refurbished');
    check('1. onChange fires once per store (one record each)',
      JSON.stringify(changes.slice().sort()) === JSON.stringify(['components|c1', 'gatepasses|gp-x', 'jobcards|jx']));
    const dirty = [...h.DB.dirtySnapshot()].sort();
    check('2. exactly the three stores are dirty and nothing else',
      JSON.stringify(dirty) === JSON.stringify(['components', 'gatepasses', 'jobcards']));
    check('3. one outbox entry per record (three records, three entries)', changes.length === 3);
    const base = h.idb.stores.outboxbase.rows.get('components|c1');
    check('3. the outboxbase snapshot exists for components.state, holding the value BEFORE the write',
      !!base && base.base && base.base.state === 'sent-out');
    check('3. …and no base for the stores with no R field (gatepasses)', !h.idb.stores.outboxbase.rows.has('gatepasses|gp-x'));
    check('2. outboxbase is not marked dirty (device-local)', dirty.indexOf('outboxbase') < 0);

    // Two rows in one store: both must reach the outbox, so onChange is per record.
    changes.length = 0; h.idb.log.length = 0;
    await h.DB.putMany([
      { store: 'gatepasses', obj: { id: 'gp-y', status: 'out' } },
      { store: 'gatepasses', obj: { id: 'gp-z', status: 'out' } },
    ]);
    check('1. two rows in one store: still one transaction, both rows get an outbox entry',
      h.idb.log.length === 1 && changes.length === 2);

    // The first base wins: a second local write must not move it.
    await h.DB.putMany([{ store: 'components', obj: { id: 'c1', state: 'scrapped', history: [] } }]);
    const b2 = h.idb.stores.outboxbase.rows.get('components|c1');
    check('3. a second write before the push keeps the FIRST base', !!b2 && b2.base.state === 'sent-out');
  }

  /* ---- 4: the three requirements contract 11 places on the frontend ------- */
  {
    const passesPath = process.env.PASSES_PATH || path.join(ROOT, 'v2', 'ui', 'passes.js');
    if (!fs.existsSync(passesPath)) {
      console.log('  SKIP 4. v2/ui/passes.js has not landed (frontend OR2); the three contract-11 requirements are NOT proven yet');
    } else {
      await checkPasses(passesPath);
    }
  }

  /* ---- 5: the fixture ----------------------------------------------------- */
  {
    const h = load();
    await h.seed(true);
    const gp = (id) => (rowsOf(h, 'gatepasses').filter((r) => r.id === id)[0]);
    const re = /^OJ-\d{6}-[A-Z0-9]{4}$/;
    const g1 = gp('gp-1'), g0 = gp('gp-0');
    const age = g1 ? (Date.now() - g1.issuedAt) / DAY : -1;
    check('5. gp-1 is status out, 21 days old, b3 / j3, AC compressor ACC-5512, CoolAir Jaipur',
      !!g1 && g1.status === 'out' && Math.round(age) === 21 && g1.busId === 'b3' && g1.jobId === 'j3' &&
      g1.componentId === null && g1.unitName === 'AC compressor' && g1.unitSerial === 'ACC-5512' && g1.vendorName === 'CoolAir Jaipur');
    check('5. gp-0 is returned, from c-t2, jobId null, serial matched, a cost and ONE billPhoto',
      !!g0 && g0.status === 'returned' && g0.componentId === 'c-t2' && g0.jobId === null && g0.serialMismatch === false &&
      g0.returnSerial === g0.unitSerial && typeof g0.cost === 'number' && g0.cost > 0 &&
      typeof g0.billPhoto === 'string' && g0.billPhoto !== '');
    check('5. both pass numbers match ^OJ-\\d{6}-[A-Z0-9]{4}$', !!g1 && !!g0 && re.test(g1.no) && re.test(g0.no));
    const comps = rowsOf(h, 'components'), cards = rowsOf(h, 'jobcards');
    const a1 = comps.filter((c) => c.id === 'c-a1')[0];
    check('5. c-a1 is sent-out with NO pass anywhere referencing it',
      !!a1 && a1.state === 'sent-out' && rowsOf(h, 'gatepasses').every((p) => p.componentId !== 'c-a1') &&
      a1.history.every((e) => e.passId === undefined && e.id === undefined));
    const j3 = cards.filter((c) => c.id === 'j3')[0], j4 = cards.filter((c) => c.id === 'j4')[0];
    check('5. j3 points at gp-1 and stays outside:false with its vendor',
      !!j3 && j3.gatePassId === 'gp-1' && !!g1 && j3.gatePassNo === g1.no && j3.outside === false && j3.externalVendor === 'CoolAir Jaipur');
    check('5. j4 is b2, outside in Jaipur, entered two days ago, no vendor, no bill photos',
      !!j4 && j4.busId === 'b2' && j4.outside === true && j4.outsideCity === 'Jaipur' &&
      Math.round((Date.now() - j4.enterAt) / DAY) === 2 && j4.externalVendor === '' && Array.isArray(j4.billPhotos) && j4.billPhotos.length === 0);
    const prod = load(); await prod.seed(false);
    check('5. the production seed (demo=false) writes no pass', rowsOf(prod, 'gatepasses').length === 0);
  }

  /* ---- 6: no version bump, no new store ------------------------------------ */
  {
    const h = load();
    check('6. DB_VERSION is still 29', /const DB_VERSION = 29;/.test(DB_SRC));
    // 43 is the count on disk before this slice (the brief said 41; it was counted from a
    // doc). Pinning the real number is what makes an added store red.
    check('6. STORES gained no key (43, gatepasses among them)', h.STORES.length === 43 && h.STORES.indexOf('gatepasses') >= 0);
    check('6. no index is created (contract 4.4)', !/createIndex/.test(DB_SRC));
  }

  console.log(fails ? '\n' + fails + ' FAILED' : '\nall ok');
  process.exit(fails ? 1 : 0);
}

/* The three requirements of contract 11, against the frontend's real module.
 * passes.js and outside.js are loaded into the SAME context as the real db.js, so
 * the write functions run against the real DB and the real putMany; DB.put and
 * DB.putMany are wrapped to count, and db.transaction is counted underneath.
 * (PASSES_PATH points at a mutated copy for the tripwire run; v2/ui/passes.js
 * itself is never edited from here.) */
async function checkPasses(passesPath) {
  const h = load();
  const calls = { put: 0, putMany: 0 };
  const realPut = h.DB.put.bind(h.DB), realMany = h.DB.putMany.bind(h.DB);
  h.DB.put = (...a) => { calls.put++; return realPut(...a); };
  h.DB.putMany = (...a) => { calls.putMany++; return realMany(...a); };
  try {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'v2', 'outside.js'), 'utf8'), h.ctx, { filename: 'v2/outside.js' });
    vm.runInContext(fs.readFileSync(passesPath, 'utf8'), h.ctx, { filename: passesPath });
  } catch (e) { check('4. v2/ui/passes.js loads', false); console.log('     ' + e.message); return; }
  const P = vm.runInContext('Passes', h.ctx);
  const bus = { id: 'b1', regNo: 'RJ14 PA 1023', engineNo: 'E1', chassisNo: 'C1' };
  const me = { id: 'u-sup' };
  await h.DB.putRaw('components', { id: 'c1', label: 'Alternator', serial: 'ALT-1', busId: 'b1', state: 'in-service', history: [] });
  await h.DB.putRaw('components', { id: 'c2', label: 'Old unit', serial: 'OLD-1', busId: 'b1', state: 'sent-out', refurbCount: 0,
    history: [{ type: 'send-out', at: 1, vendor: 'Sharma', busId: 'b1' }] });
  await h.DB.putRaw('jobcards', { id: 'j1', busId: 'b1', status: 'open' });
  const sheet = { id: 'gp-draft1', no: 'OJ-260101-RAFT', hid: 'h-draft1', vendor: 'Sharma', unit: 'Alternator', serial: 'ALT-1', piece: 'c1' };
  const issue = () => P.issueWrite({ vals: Object.assign({}, sheet), bus, card: { id: 'j1' }, me });
  let r1, r2;
  try {
    r1 = await issue();
    r2 = await issue();                                   // the double tap: one draft, saved twice
  } catch (e) { check('4. issueWrite ran', false); console.log('     ' + e.message); return; }
  const passes = rowsOf(h, 'gatepasses');
  const hist = rowsOf(h, 'components').filter((c) => c.id === 'c1')[0].history;
  check('4. the first issue succeeded', r1.ok === true);
  check('4. issueWrite twice with one draft leaves ONE gatepasses row, with the draft\'s id and number',
    passes.length === 1 && passes[0].id === 'gp-draft1' && passes[0].no === 'OJ-260101-RAFT' && r2.ok === true);
  check('4. …and ONE history entry, carrying the draft\'s id (not one minted inside the write)',
    hist.length === 1 && hist[0].id === 'h-draft1' && hist[0].passId === 'gp-draft1');
  check('4. issueWrite goes through putMany once and never DB.put', calls.putMany === 1 && calls.put === 0);

  calls.putMany = 0; calls.put = 0; h.idb.log.length = 0;
  const rr = await P.returnWrite({ vals: { hid: 'h-ret1', serial: 'ALT-1', cost: '1500', bill: 'bill.jpg', fit: 'shelf' }, pass: passes[0], piece: { id: 'c1' }, me });
  const rw = h.idb.log.filter((t) => t.mode === 'readwrite');
  check('4. returnWrite performs ONE putMany and no DB.put', rr.ok === true && calls.putMany === 1 && calls.put === 0);
  check('4. …which is one readwrite transaction for the pass, the piece and the card', rw.length === 1);
  const after = rowsOf(h, 'gatepasses')[0];
  check('4. …and with a pass, the money is on the pass and the entry carries passId only',
    after.status === 'returned' && after.cost === 1500 && after.billPhoto === 'bill.jpg' &&
    rowsOf(h, 'components').filter((c) => c.id === 'c1')[0].history.filter((e) => e.type === 'return').every((e) => e.passId === 'gp-draft1' && e.cost === undefined));

  calls.putMany = 0; calls.put = 0;
  const nr = await P.returnWrite({ vals: { hid: 'h-ret2', serial: 'OLD-1', cost: '250', bill: 'x.jpg', fit: 'shelf' }, pass: null, piece: { id: 'c2' }, me });
  const ret = (rowsOf(h, 'components').filter((c) => c.id === 'c2')[0].history || []).filter((e) => e.type === 'return')[0];
  check('4. a return with NO pass still writes, and puts cost/billPhoto on the history entry',
    nr.ok === true && !!ret && ret.cost === 250 && ret.billPhoto === 'x.jpg' && ret.passId === null && calls.putMany === 1 && calls.put === 0);
}

main().catch((e) => { console.error(e); process.exit(1); });

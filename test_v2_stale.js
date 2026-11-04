/* Tests for v2's half of the stale refusal — and for the ONE thing it must not
 * grow. Run: node test_v2_stale.js
 *
 * Lives at the repo root, not in v2/, because scripts/run-tests.py discovers
 * test_*.js at the root only. A test in v2/ would never run, and a test nobody
 * runs is not a test.
 *
 * What is under test is the real v2/db.js and the real v2/sync.js, loaded the way
 * a page loads them — a plain script, a window, a localStorage — against a FAKE
 * server and an in-memory IndexedDB. Both fakes are below and both are small on
 * purpose: the point of this file is the module's behaviour, so anything clever in
 * the harness would be the thing being tested.
 *
 * The bug: `LIVE-ISSUES.md` issue 1. The server drops a push that loses the
 * `updatedAt` comparison, v2/sync.js clears the whole batch under the comment
 * "everything else landed", and a change vanishes while the screen says it sent.
 * The fix is a re-apply, and contract §4.0 is the rule it is built on — no screen
 * ever asks a person to adjudicate a clock, because `updatedAt` comes off the
 * pushing device's clock and a phone set forward wins every comparison. The last
 * section of this file is what keeps that rule: it asserts the ABSENCE of a
 * confirmation path, which is the only check in the cut that guards a thing's
 * absence.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fails = 0;
function check(name, cond) { console.log((cond ? '  ok  ' : ' FAIL ') + name); if (!cond) fails++; }

const ROOT = __dirname;
const DB_SRC = fs.readFileSync(path.join(ROOT, 'v2', 'db.js'), 'utf8');
const SYNC_SRC = fs.readFileSync(path.join(ROOT, 'v2', 'sync.js'), 'utf8');
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

/* ---- a two-page IndexedDB ------------------------------------------------
 * Enough of the API for db.js to run unchanged: requests call back on a later
 * turn, and a transaction completes only once everything queued on it has. That
 * second part matters — bulkRawGet and bulkPutRaw wait on the TRANSACTION rather
 * than on each request, which is the whole reason they exist. */
function newIDB() {
  const stores = {};
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
      const s = stores[n];
      if (!s) throw new Error('NotFoundError: no object store ' + n);
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
    transaction: (n) => txObj(Array.isArray(n) ? n : [n]),
    close() {},
    onversionchange: null,
  };
  return {
    stores,
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

/* ---- the fake server -----------------------------------------------------
 * /push answers from `reply(body)`, so each case below says what the server does
 * and nothing else has to. /pull is always empty: this file is about what the
 * client does with a refusal, and the drain has its own tests. */
function load(seed) {
  const idb = newIDB();
  const store = Object.assign({
    token: 'u-sup.sig', clockOffset: '0', lastRev: '10', outbox: '[]',
    // Both one-shot migrations already done, so start() is one tick and not a
    // full re-read of the table.
    syncHeal_pullPaging_v1: '1', syncBackfill_compdefvendtrip_v1: '1',
  }, seed || {});
  const ls = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  const timers = new Set();
  const server = { pushes: [], pulls: 0, pullRecords: [], reply: () => ({ ok: true, applied: 1, rejected: 0, refused: [], maxRev: 11 }) };
  const res = (status, body) => ({
    ok: status >= 200 && status < 300, status,
    json: async () => body,
    clone: () => ({ json: async () => body }),
    headers: { get: () => null },
  });
  const sandbox = {
    console, JSON, Math, Date, Promise, Set, Map, Object, Array, Number, String, Error,
    indexedDB: idb.idb,
    setTimeout: (fn, ms) => { const id = setTimeout(fn, ms); timers.add(id); return id; },
    clearTimeout: (id) => { timers.delete(id); return clearTimeout(id); },
    setInterval: (fn, ms) => { const id = setInterval(fn, ms); timers.add(id); return id; },
    clearInterval: (id) => { timers.delete(id); return clearInterval(id); },
    location: { hostname: 'localhost', protocol: 'http:', origin: 'http://localhost' },
    AbortController: typeof AbortController !== 'undefined' ? AbortController : undefined,
    PullApply: require('./v2/pullapply.js'),
    async fetch(url, opts) {
      const body = opts && opts.body ? JSON.parse(opts.body) : null;
      if (String(url).indexOf('/push') >= 0) {
        server.pushes.push(body);
        const r = server.reply(body, server.pushes.length);
        return res(r.status || 200, r);
      }
      if (String(url).indexOf('/pull') >= 0) {
        server.pulls++;
        return res(200, { records: server.pullRecords, maxRev: 10, more: false, tableMax: 10 });
      }
      return res(200, {});
    },
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.window.localStorage = ls;
  sandbox.window.addEventListener = () => {};
  const ctx = vm.createContext(sandbox);
  vm.runInContext(DB_SRC, ctx, { filename: 'v2/db.js' });
  vm.runInContext(SYNC_SRC, ctx, { filename: 'v2/sync.js' });
  return {
    server, ls, store, ctx,
    DB: vm.runInContext('DB', ctx),
    Sync: vm.runInContext('Sync', ctx),
    STORES: vm.runInContext('Object.keys(STORES)', ctx),
    stopTimers: () => { timers.forEach((id) => { clearTimeout(id); clearInterval(id); }); timers.clear(); },
  };
}
// A few turns of the loop: enough for a tick's fetches and IndexedDB callbacks.
const settle = async (n = 40) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };

/* The record the two devices are fighting over, and the shape of the refusal.
 *
 * The server's stored copy is stamped TEN MINUTES AHEAD of this device, because
 * that is the real case: the other phone's clock is set forward, which is why it
 * wins every comparison and why nobody can be asked to adjudicate it. */
const AHEAD = Date.now() + 600000;
const SERVER_BUS = { id: 'b1', regNo: 'RJ14 PA 1023', company: 'Pink City Travels', odometer: 184320, updatedAt: AHEAD };
const staleRefusal = (extra) => ({
  ok: true, applied: 0, rejected: 1, maxRev: 11,
  refused: [Object.assign({ store: 'buses', id: 'b1', reason: 'stale',
    server: { data: SERVER_BUS, updatedAt: AHEAD, rev: 7 } }, extra || {})],
});

// A device that pulled the bus, then edited its registration offline.
async function pending(h) {
  await h.DB.putRaw('buses', clone(SERVER_BUS));                 // the server's copy is the base
  const local = clone(SERVER_BUS);
  local.regNo = 'RJ14 PA 9999';                                  // this device's change
  await h.DB.put('buses', local);                                // a local write: stamps updatedAt
}
// The outbox is read from storage when the module loads, so a pending key has to
// be there before it does -- exactly as it is on a device that was closed with a
// change unsent.
const PENDING_BUS = { outbox: JSON.stringify(['buses|b1']) };

/* ---- the base snapshot, which the re-apply is built on -------------------- */
{
  const h = load();
  (async () => {
    await pending(h);
    const touched = await h.DB.touched('buses', 'b1');
    check('DB.touched names the field this device changed', touched.length === 1 && touched[0] === 'regNo');
    check('…and not the fields it left alone',
          touched.indexOf('company') < 0 && touched.indexOf('odometer') < 0);
    // parts is the store §4.4 says is NOT fixed. A base for it would make the lost
    // decrement look recoverable, and it is not.
    await h.DB.put('parts', { id: 'p1', qty: 11 });
    check('a store with no residual fields records no base', (await h.DB.touched('parts', 'p1')).length === 0);

    /* A record this device created itself, with no server copy behind it. Two
     * phones can still produce one id -- the ids are stable by design so two
     * writers make one record -- so this path reaches a stale refusal too, and
     * its base is "nothing", which makes every field it carries this device's. */
    await h.DB.put('jobcards', { id: 'j9', problem: 'Brakes weak', status: 'open' });
    let t = await h.DB.touched('jobcards', 'j9');
    check('a locally created record counts its own fields as changed',
          t.sort().join(',') === 'problem,status');
    // A second edit before the first has been pushed still measures against the
    // last state the server knew -- which is still nothing. Re-basing on every
    // write would forget the first edit and push only the second.
    await h.DB.put('jobcards', { id: 'j9', problem: 'Brakes weak', status: 'in-progress' });
    t = await h.DB.touched('jobcards', 'j9');
    check('…and a second edit does not move the base off the first',
          t.sort().join(',') === 'problem,status');
    h.stopTimers();
  })().catch((e) => { check('base snapshot threw: ' + e.message, false); });
}

/* ---- "stale" is a re-apply, not a loss ----------------------------------- */
async function staleCase() {
  const h = load(PENDING_BUS);
  const seen = { calls: 0, reasons: [] };
  await pending(h);
  h.server.reply = () => staleRefusal();
  h.Sync.start({ onRefused: (n, reasons) => { seen.calls++; seen.reasons.push(...reasons); } });
  await settle();
  h.stopTimers();

  const row = await h.DB._rawGet('buses', 'b1');
  check('a "stale" refusal keeps the key in the outbox', h.Sync.info().pending === 1);
  check('…and does NOT quarantine it', h.Sync.info().quarantined === 0);
  check('…and tells nobody: the device is still working on it', seen.calls === 0);
  check('…and counts it as in-flight for Me\'s device state', h.Sync.info().stale === 1);
  check('the re-applied record stamps server.updatedAt + 1', row.updatedAt === AHEAD + 1);
  check('…which is strictly greater than the stored copy, as step 6 compares', row.updatedAt > AHEAD);
  check('…keeps this device\'s change', row.regNo === 'RJ14 PA 9999');
  check('…and takes the rest from the server\'s copy', row.odometer === 184320 && row.company === 'Pink City Travels');

  // The next tick pushes the re-applied record, which is the whole point: the
  // change reaches the server instead of sitting here looking sent.
  h.server.reply = () => ({ ok: true, applied: 1, rejected: 0, refused: [], maxRev: 12 });
  await h.Sync.tick();
  await settle();
  h.stopTimers();
  const second = h.server.pushes[h.server.pushes.length - 1].records[0];
  check('the next push carries the re-applied record', second.data.regNo === 'RJ14 PA 9999');
  check('…at the stamp above the server\'s copy', second.updatedAt === AHEAD + 1);
  check('…and once it lands the outbox is empty', h.Sync.info().pending === 0);
  check('…and the key keeps no retry budget', h.Sync.info().stale === 0);
  check('…and no base snapshot either', (await h.DB.touched('buses', 'b1')).length === 0);
}

/* ---- bounded: exactly two rounds, then a reason and a Retry --------------- */
async function budgetCase() {
  const h = load(PENDING_BUS);
  const seen = { calls: 0, reasons: [] };
  await pending(h);
  h.server.reply = () => staleRefusal();             // two people both editing: never resolves
  h.Sync.start({ onRefused: (n, reasons) => { seen.calls++; seen.reasons.push(...reasons); } });
  await settle();
  for (let i = 0; i < 6; i++) { await h.Sync.tick(); await settle(8); }
  h.stopTimers();

  check('an unresolvable collision stops, it does not loop', h.server.pushes.length === 3);
  check('…after exactly 2 re-apply rounds', h.Sync.info().stale === 0);
  check('…then quarantines with a reason of its own', h.Sync.info().staleUnresolved === 1);
  check('…which is "stale-unresolved"', h.Sync.info().reasons.join(',') === 'stale-unresolved');
  check('…and surfaces through cbRefused, once', seen.calls === 1 && seen.reasons.length === 1);
  check('…with the reason, for a screen to show beside a Retry', seen.reasons[0] === 'stale-unresolved');
  check('Retry is clearQuarantine, and it gives the key another go',
        (h.Sync.clearQuarantine(), h.Sync.info().quarantined === 0 && h.Sync.info().pending === 1));
}

/* ---- the server copy over the byte cap ----------------------------------- */
async function cappedCase() {
  const h = load(PENDING_BUS);
  await pending(h);
  // One stale job card with inline photos must not become a 6 MiB response, so the
  // server names the refusal and omits the copy. The key waits a tick for /pull to
  // deliver it — inside the SAME budget, or the cap would be a way round it.
  h.server.reply = () => staleRefusal({ server: undefined });
  h.Sync.start({});
  await settle();
  check('a refusal with no server copy defers rather than quarantines',
        h.Sync.info().pending === 1 && h.Sync.info().quarantined === 0);
  check('…and the local change is untouched while it waits',
        (await h.DB._rawGet('buses', 'b1')).regNo === 'RJ14 PA 9999');
  for (let i = 0; i < 6; i++) { await h.Sync.tick(); await settle(8); }
  h.stopTimers();
  check('…and spends the same two rounds, not an unbounded wait',
        h.server.pushes.length === 3 && h.Sync.info().staleUnresolved === 1);
}

/* ---- every other reason quarantines exactly as before -------------------- */
async function otherReasonsCase() {
  const h = load(PENDING_BUS);
  const seen = { calls: 0, reasons: [] };
  await pending(h);
  h.server.reply = () => ({ ok: true, applied: 0, rejected: 1, maxRev: 11,
    refused: [{ store: 'buses', id: 'b1', reason: 'role may not write this store' }] });
  h.Sync.start({ onRefused: (n, reasons) => { seen.calls++; seen.reasons.push(...reasons); } });
  await settle();
  h.stopTimers();
  check('a non-stale refusal still quarantines', h.Sync.info().quarantined === 1);
  check('…and still fires cbRefused with the server\'s own words',
        seen.calls === 1 && seen.reasons[0] === 'role may not write this store');
  check('…and is not counted as a staleness case', h.Sync.info().staleUnresolved === 0 && h.Sync.info().stale === 0);
  check('…and the record is not rewritten behind the refusal',
        (await h.DB._rawGet('buses', 'b1')).regNo === 'RJ14 PA 9999');

  // And the other half of that path: what the server did NOT name really did land.
  const h2 = load(PENDING_BUS);
  await pending(h2);
  h2.server.reply = () => ({ ok: true, applied: 1, rejected: 0, refused: [], maxRev: 12 });
  h2.Sync.start({});
  await settle();
  h2.stopTimers();
  check('an applied record leaves the outbox', h2.Sync.info().pending === 0);
}

/* ---- the other end of the same loss: a pull that overtakes a pending edit --
 * B3 owns the rule (v2/pullapply.js); these three are the wiring in THIS file,
 * and each of them was wrong in a way that read as working. The page's pending
 * fields have to be handed to decidePage as data (it is pure and DB.touched() is
 * not), the residual has to arrive with its reason rather than as a count, and
 * the fallback path has to write the WINNER and not the arriving record. */
const REMOTE_NEWER = Date.now() + 900000;          // the other device's copy, newer
function pullOf(extra) {
  return Object.assign({ id: 'b1', regNo: 'RJ14 PA 1023', company: 'Rajasthan Roadlinks',
                         odometer: 190000, updatedAt: REMOTE_NEWER }, extra || {});
}
// lastRev 0 so the tick pulls BEFORE it pushes, and a push that cannot reach the
// server so the key is still pending while the page is applied.
const PULL_FIRST = Object.assign({}, { outbox: JSON.stringify(['buses|b1']), lastRev: '0' });
function offlinePush(h, rows) {
  h.server.pullRecords = rows;
  h.server.reply = () => { throw new Error('offline'); };
}

async function pullConflictCase() {
  const h = load(PULL_FIRST);
  const seen = { calls: 0, reasons: [] };
  await pending(h);
  offlinePush(h, [{ store: 'buses', id: 'b1', rev: 9, data: pullOf() }]);
  h.Sync.start({ onRefused: (n, reasons) => { seen.calls++; seen.reasons.push(...reasons); },
                 onConflict: () => { seen.conflictToast = true; } });
  await settle();
  h.stopTimers();
  const row = await h.DB._rawGet('buses', 'b1');
  check('a remote winner does NOT discard the pending edit', h.Sync.info().pending === 1);
  check('…and this device\'s own field survives the write', row.regNo === 'RJ14 PA 9999');
  check('…while the rest of the record is the server\'s', row.odometer === 190000);
  check('…and the residual collision arrives with a reason', seen.calls === 1 && /stale-conflict/.test(seen.reasons[0]));
  check('…naming the field, so the person can see what it was about', /regNo/.test(seen.reasons[0]));
  check('…and not as a bare count in a toast', !seen.conflictToast);
  // The base must still be the SERVER's copy, or the next refusal is unresolvable.
  check('…and the pending change is still measurable against the server\'s copy',
        (await h.DB.touched('buses', 'b1')).join(',') === 'regNo');
}

async function pullMergeCase() {
  const h = load(PULL_FIRST);
  const seen = { calls: 0, reasons: [] };
  await pending(h);
  // The other device already carries this device's value, so there is nothing to
  // decide: a merge, which is nobody's problem and nobody is told about.
  offlinePush(h, [{ store: 'buses', id: 'b1', rev: 9, data: pullOf({ regNo: 'RJ14 PA 9999' }) }]);
  h.Sync.start({ onRefused: (n, reasons) => { seen.calls++; seen.reasons.push(...reasons); } });
  await settle();
  h.stopTimers();
  const row = await h.DB._rawGet('buses', 'b1');
  check('a merge keeps the key and tells nobody', h.Sync.info().pending === 1 && seen.calls === 0);
  check('…and takes the arriving record', row.odometer === 190000 && row.regNo === 'RJ14 PA 9999');
}

async function pullFallbackCase() {
  const h = load(PULL_FIRST);
  await pending(h);
  offlinePush(h, [{ store: 'buses', id: 'b1', rev: 9, data: pullOf() }]);
  // One row in a store aborts the whole transaction, so the page is redone a
  // record at a time. That path only ever runs when something is already wrong,
  // which is exactly why it must not quietly drop the re-applied fields.
  h.DB.bulkPutRaw = async () => { throw new Error('transaction aborted'); };
  h.Sync.start({});
  await settle();
  h.stopTimers();
  const row = await h.DB._rawGet('buses', 'b1');
  check('the one-at-a-time fallback writes the winner, not the arriving record',
        row.regNo === 'RJ14 PA 9999' && row.odometer === 190000);
  check('…and still keeps the key', h.Sync.info().pending === 1);
}

/* ---- the check that guards an absence ------------------------------------
 * Contract §4.0 and the brief: no "Overwrite?", no "keep mine or theirs?", no
 * timestamp offered as a tie-break. A phone set back loses every comparison, so
 * its user would be asked to confirm an overwrite on every save, would learn the
 * dialog means nothing, and would click through — which launders data loss into
 * consent. Both stage-2 designers wrote their screens against that rule.
 *
 * Asserted by grepping the module, because the way this rule breaks is a future
 * builder adding a dialog quietly, and no behavioural test would catch it. */
function noDialogCase() {
  const src = SYNC_SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  const BANNED = [
    ['confirm() dialog', /\bconfirm\s*\(/],
    ['window.confirm reference', /window\s*\.\s*confirm/],
    ['native prompt()', /(^|[^.\w])prompt\s*\(/],
    ['"overwrite" affordance', /overwrite/i],
    ['keep-mine / keep-theirs choice', /keep\s*(mine|yours|theirs|local|server)/i],
    ['"which copy" question', /which\s+(copy|version)/i],
    ['conflict callback asking the caller to choose', /onConflictChoice|chooseVersion|resolveConflict\s*\(/],
  ];
  for (const [what, re] of BANNED) {
    check('v2/sync.js has no ' + what, !re.test(src));
  }
  // The absence has to be real, not an artifact of stripping comments: prove the
  // scan can see the code it is scanning.
  check('…and the scan is looking at live code, not only at comments',
        /reapplyStale/.test(src) && /'stale'/.test(src));
  // There is deliberately no confirm-shaped export either: the frontend has
  // nothing to ask, because there is nothing a person can be asked about a clock.
  const h = load();
  h.stopTimers();
  const exported = Object.keys(h.Sync);
  check('…and Sync exports nothing confirm-shaped',
        !exported.some((k) => /confirm|overwrite|chooseVersion|resolveConflict/i.test(k)));
}

/* ---- job 1: v2's own database -------------------------------------------- */
function isolationCase() {
  const v1 = fs.readFileSync(path.join(ROOT, 'db.js'), 'utf8');
  const nameOf = (src) => (src.match(/DB_NAME = '([^']+)'/) || [])[1];
  check('v2 names its own IndexedDB database', nameOf(DB_SRC) && nameOf(DB_SRC) !== nameOf(v1));
  const v1v = Number((v1.match(/DB_VERSION = (\d+)/) || [])[1]);
  const v2v = Number((DB_SRC.match(/DB_VERSION = (\d+)/) || [])[1]);
  // Monotonic above whatever this tree has already opened: onupgradeneeded only
  // fires on a bump, so a version that went backwards would throw VersionError on
  // the machines doing the testing.
  check('…at a version its new store can actually be created on', v2v > v1v);
  const h = load();
  h.stopTimers();
  check('nightlist is a store v2 has', h.STORES.indexOf('nightlist') >= 0);
  check('outboxbase is a store v2 has', h.STORES.indexOf('outboxbase') >= 0);
  // The device-local one must never leave the device: markDirty returns early for
  // a store that is not in sync's list, exactly as it does for meta.seeded.
  // Comments stripped first, and the LITERAL looked for rather than the word: the
  // array's own comment explains why outboxbase is not in it, and a check that
  // trips on its own documentation teaches people to delete checks.
  const syncStores = (SYNC_SRC.match(/const STORES = \[[\s\S]*?\];/) || [''])[0]
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ');
  check('…and sync never carries it', syncStores.indexOf("'outboxbase'") < 0);
  check('…while nightlist does sync', syncStores.indexOf("'nightlist'") >= 0);
}

(async () => {
  await staleCase();
  await budgetCase();
  await cappedCase();
  await otherReasonsCase();
  await pullConflictCase();
  await pullMergeCase();
  await pullFallbackCase();
  noDialogCase();
  isolationCase();
  await settle(5);
  console.log(fails ? `\n${fails} FAILED` : '\nall ok');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

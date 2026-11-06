/* Tests for v2's boot, device cache, retention and script order.
 * Run: node test_v2_boot.js
 *
 * At the repo ROOT and not in v2/, because run-tests.py auto-discovers test_*.js
 * at the root only and does not recurse: a test in v2/ would never run, and a
 * test nobody runs is not a test.
 *
 * Four of the cases here guard things that are invisible when they are right:
 *
 *   - the retention table, because a store with no row is never pruned and that
 *     is a bug whose first symptom arrives after a year;
 *   - the ABSENCE of the callback that counted discarded local edits, because an
 *     absence is the one kind of defect nothing else notices coming back;
 *   - the script order, because these are classic scripts declaring top-level
 *     `const`s and a file above its dependency is one console error and a blank
 *     page;
 *   - index.html's list and sw.js's precache list being THE SAME LIST, because a
 *     file served but not precached works perfectly until the yard is offline.
 */
process.env.TZ = process.env.TZ || 'UTC';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const V2 = path.join(ROOT, 'v2');
const read = (p) => fs.readFileSync(path.join(V2, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(V2, p));

let fails = 0;
function check(name, cond) { console.log((cond ? '  ok  ' : ' FAIL ') + name); if (!cond) fails++; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DAY = 86400000;

/* ===== The declared load order =========================================== */

/* The canonical dependency order. THIS is the contract; v2/index.html is the
 * implementation of it, and sw.js's precache is the same list again.
 *
 * Entries not yet on disk are listed at the position their dependencies put
 * them, so the slice that lands one has somewhere to put it rather than a
 * guess. The comparisons below filter this list to what exists, which is what
 * makes a landed-but-unwired file red rather than invisible.
 *
 * SCREENS_SLOT is where v2/screens/*.js go: after shell.js, so Router and the
 * ui builders have declared themselves, and BEFORE boot.js, because a screen
 * registers itself at load and boot.js is the only script that calls anything.
 * (The brief's order block prints the screens below boot.js and says in the
 * next sentence that boot.js is last; both cannot hold, and "boot.js is last"
 * is the one with a reason attached — a screen that registers after the first
 * mount is a blank body.) */
const SCREENS_SLOT = '<screens>';
const ORDER = [
  'ui/icons.js', 'ui/words.js', 'ui/states.js', 'ui/overlay.js', 'ui/photos.js', 'ui/nav.js',
  'db.js', 'sync.js', 'pullapply.js', 'night.js',
  'fmt.js', 'odo.js', 'cost.js',
  'caps.js', 'router.js', 'cache.js', 'shell.js',
  /* The login, which is NOT a screen and is deliberately not in screens/: it
   * must be reachable holding no capability, so it can never appear in
   * Caps.SCREENS -- the list SCREENS_SLOT is checked against. It sits with the
   * frame rather than inside the slot so the thirteen stay contiguous. */
  'login.js',
  SCREENS_SLOT,
  'boot.js',
];

// The stylesheets. Order is free between them (every selector is [data-v2]
// scoped and none of them overrides another), so this is a SET check.
const STYLES = ['ui/tokens.css', 'ui/components.css', 'ui/screens.css', 'ui/login.css',
                'ui/shell.css',
                // One per screen slice. This list is a SET CHECK in both directions:
                // a stylesheet linked but not named here fails, and one named but not
                // linked fails too -- which is what caught all seven screens arriving
                // on disk wired to nothing.
                'ui/today.css', 'ui/attention.css', 'ui/work.css', 'ui/duty.css', 'ui/gate.css',
                'ui/buses.css', 'ui/fuel.css', 'ui/money.css', 'ui/people.css', 'ui/reviews.css',
                'ui/store.css', 'ui/me.css'];

/* What must already have run when a file runs. Not "what it imports" — there are
 * no imports — but what has to have declared itself before this file's own
 * declarations are usable by anything.
 *
 * Every v2 module resolves its neighbours at CALL time (v2/night.js's db(),
 * v2/router.js's caps(), v2/boot.js's pick()), which is deliberate and is why a
 * single ordering mistake is recoverable instead of fatal. It also means a wrong
 * order does NOT throw at load: that is exactly why this table exists and is
 * checked statically as well as at load. The brief asks that swapping any
 * adjacent pair throw; it cannot, without introducing the load-time coupling the
 * codebase spent effort removing, so the swap is caught here instead. */
const DEPS = {
  'ui/states.js': ['ui/icons.js'],
  'ui/overlay.js': ['ui/icons.js'],
  'ui/photos.js': ['ui/icons.js'],
  'ui/nav.js': ['ui/icons.js', 'ui/words.js'],
  'sync.js': ['db.js'],
  'pullapply.js': ['db.js'],
  'night.js': ['db.js'],
  'router.js': ['caps.js'],
  'cache.js': ['db.js'],
  'shell.js': ['ui/icons.js', 'ui/states.js', 'caps.js', 'router.js', 'cache.js'],
  // The login draws with the ui builders, authenticates through Sync and asks
  // the frame for its own re-mount. It needs NEITHER caps.js nor router.js --
  // it registers with no route and reads no capability -- and not boot.js
  // either, which loads after it and is resolved at call time.
  'login.js': ['ui/icons.js', 'ui/words.js', 'ui/states.js', 'sync.js', 'shell.js'],
  'boot.js': ['db.js', 'sync.js', 'pullapply.js', 'caps.js', 'router.js', 'cache.js'],
};

/* The global names a file declares, read OUT OF THE FILE rather than from a
 * table here. A table would be a second place to forget, and the first time a
 * slice named its export something else this suite would have gone green on a
 * file it never actually loaded.
 *
 * `=(?!=)` IS LOAD-BEARING AND WAS MISSING. Every v2 module resolves a
 * neighbour by testing for it — `typeof root.icon === 'function'` — and an
 * assignment pattern that stops at the first `=` reads the `===` in that test
 * as one. So shell.js was credited with DECLARING `icon`, `skeleton`,
 * `emptyState`, `errorState`, `offlineState`, `nav` and `getComputedStyle`,
 * all seven of which it only ever READS. Six of those seven are declared
 * earlier in the order by ui/icons.js and ui/states.js, so the swap check
 * below — which asks whether ANY of a dependency's names was already defined —
 * found one and reported the swap as fine. Any new dependency edge onto
 * shell.js was therefore untestable, and the existing cache.js <-> shell.js
 * edge was one such `typeof` line in cache.js away from going quiet too.
 * Strengthened here rather than worked around in the load order. */
function providedBy(src) {
  const names = new Set();
  const pats = [
    /\broot\.([A-Za-z][A-Za-z0-9]*)\s*=(?!=)\s*/g,
    /\bwindow\.([A-Za-z][A-Za-z0-9]*)\s*=(?!=)\s*/g,
    /^const ([A-Z][A-Za-z0-9]*) = [{(]/gm,
  ];
  for (const re of pats) { let m; while ((m = re.exec(src))) names.add(m[1]); }
  return [...names];
}

/* ===== A stub window ====================================================== */

/* Deliberately thin: a stub that answered everything would let a module that
 * touches the DOM at load pass here and fail in a browser. Nothing in v2 may
 * do more than declare at load, and this is the shape that proves it.
 *
 * getElementById returns null, which is also what keeps boot.js from booting:
 * it starts only when there is an #app to mount into. */
function stubWindow(extra) {
  const w = Object.assign({
    navigator: { onLine: true, userAgent: 'node', language: 'en' },
    location: { href: 'http://localhost/v2/', origin: 'http://localhost', pathname: '/v2/' },
    document: {
      documentElement: { dataset: {}, style: {}, setAttribute() {}, getAttribute() { return null; } },
      addEventListener() {}, getElementById() { return null; },
      querySelector() { return null; }, querySelectorAll() { return []; },
      createElement() { return { style: {}, setAttribute() {}, appendChild() {}, classList: { add() {}, remove() {} } }; },
      head: { appendChild() {} }, body: null,
    },
    addEventListener() {}, removeEventListener() {},
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
    localStorage: { _d: {}, getItem(k) { return k in this._d ? this._d[k] : null; },
                    setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } },
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    indexedDB: { open() { return { addEventListener() {} }; } },
    fetch: () => Promise.reject(new Error('no network in this suite')),
    requestAnimationFrame: (f) => setTimeout(f, 0),
    console,
  }, extra || {});
  w.window = w; w.self = w;
  return vm.createContext(w);
}

function runFile(ctx, rel) { vm.runInContext(read(rel), ctx, { filename: 'v2/' + rel }); }

/* ===== index.html and sw.js, as lists ==================================== */

const HTML = read('index.html');
const SW = read('sw.js');

const htmlScripts = [...HTML.matchAll(/<script\s+src="([^"]+)"/g)].map((m) => m[1]);
const htmlStyles = [...HTML.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"/g)].map((m) => m[1]);
const swShell = (() => {
  const m = SW.match(/const SHELL = \[([\s\S]*?)\];/);
  if (!m) return null;
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
})();

const screensOnDisk = fs.existsSync(path.join(V2, 'screens'))
  ? fs.readdirSync(path.join(V2, 'screens')).filter((f) => f.endsWith('.js')).sort().map((f) => 'screens/' + f)
  : [];

// ORDER, with the screens slot expanded, filtered to what is on disk. This is
// what index.html must say, exactly and in this sequence.
const expectedScripts = ORDER
  .reduce((acc, e) => acc.concat(e === SCREENS_SLOT ? screensOnDisk : [e]), [])
  .filter(exists);

async function main() {
  /* ---- 1. retention ----------------------------------------------------- */

  const CacheSrc = read('cache.js');
  const cctx = stubWindow();
  const fdb = fakeDB();
  cctx.DB = fdb;
  cctx.S = { user: null, route: null, stack: [], cache: {} };
  runFile(cctx, 'cache.js');
  const Cache = cctx.Cache;

  const T = Cache.LOCAL_HISTORY_DAYS;
  const WANT = { gpsevents: 60, triplog: 150, stockmoves: 210, usage: 120,
                 audits: 395, dutylog: 395, nightlist: 395 };
  check('LOCAL_HISTORY_DAYS holds all seven rows and nothing else',
        Object.keys(T).sort().join() === Object.keys(WANT).sort().join());
  check('…every window is the server\'s send window plus 30 days',
        Object.keys(WANT).every((k) => T[k] === WANT[k]));
  // Named on its own: this is the row v2 did not have at all, and 365 here would
  // delete rows the next pull puts straight back, every night, for ever.
  check('…and nightlist is 395, not the server\'s 365', T.nightlist === 395);

  const now = Date.now();
  fdb.seed('nightlist', [
    { id: 'nl-old', at: now - 400 * DAY },
    { id: 'nl-edge', at: now - 390 * DAY },
    { id: 'nl-mid', at: now - 370 * DAY },      // inside 395, outside the server's 365
  ]);
  const dropped = await Cache.prune();
  const left = fdb.ids('nightlist');
  check('prune() drops a 400-day-old nightlist row', dropped === 1 && left.indexOf('nl-old') < 0);
  check('…keeps the 390-day-old one', left.indexOf('nl-edge') >= 0);
  check('…and keeps a 370-day-old one, which pruning on 365 would not',
        left.indexOf('nl-mid') >= 0);

  // Housekeeping, not a transaction: a store that throws must not take the rest
  // of the table down with it.
  fdb.failOn('audits');
  fdb.seed('dutylog', [{ id: 'd1', at: now - 400 * DAY }]);
  const dropped2 = await Cache.prune();
  check('a store that fails to prune is skipped, not fatal',
        dropped2 === 1 && fdb.ids('dutylog').length === 0);
  fdb.failOn(null);

  /* ---- 2. one getAll per store ----------------------------------------- */

  fdb.seed('buses', [{ id: 'b1', updatedAt: now }]);
  fdb.seed('parts', [{ id: 'p1', updatedAt: now }]);
  fdb.resetReads();
  await Cache.load(['buses', 'parts']);
  await Cache.load(['buses', 'parts']);
  check('Cache.load twice with no write between does ONE getAll per store',
        fdb.reads('buses') === 1 && fdb.reads('parts') === 1);
  check('…and Cache.reads() reports the same count', Cache.reads() >= 2);
  check('…the rows are in S.cache', cctx.S.cache.buses.length === 1);

  const held = cctx.S.cache.buses;
  await Cache.load(['buses']);
  check('a clean store is not even re-read, so the array identity survives',
        cctx.S.cache.buses === held);

  fdb.put('buses', { id: 'b2', updatedAt: now + 1 });    // marks it dirty
  await Cache.load(['buses', 'parts']);
  check('a written store IS re-read on the next load',
        fdb.reads('buses') === 2 && cctx.S.cache.buses.length === 2);
  check('…and the store nobody wrote is not', fdb.reads('parts') === 1);

  /* ---- 3. the callback that must not be wired -------------------------- */

  const BootSrc = read('boot.js');
  // The forbidden name is assembled rather than written, so this file can say
  // which name it is checking for without the check tripping on itself.
  const FORBIDDEN = 'on' + 'Conflict';
  check('boot.js wires no ' + FORBIDDEN + ' — it can no longer fire at all',
        BootSrc.indexOf(FORBIDDEN) < 0);
  check('…and neither does cache.js', CacheSrc.indexOf(FORBIDDEN) < 0);

  const booted = await bootWith({});
  const opts = booted.syncOpts;
  check('Sync.start is wired', !!opts);
  check('…with onRefused, which is what replaced it', typeof opts.onRefused === 'function');
  check('…and onStatus, onApplied, onStoreFail',
        typeof opts.onStatus === 'function' && typeof opts.onApplied === 'function'
        && typeof opts.onStoreFail === 'function');
  check('…and exactly those four, no fifth callback',
        Object.keys(opts).sort().join() === 'onApplied,onRefused,onStatus,onStoreFail');

  /* ---- 4. density ------------------------------------------------------- */

  // Both clauses, each for a reason: width alone puts a desk rail on a tablet in
  // landscape (also 1024x768, held in two hands); pointer alone puts 32px rows
  // on a 1366x768 touchscreen laptop.
  check('1024 + fine  => desk', (await densityFor(1024, 'fine')) === 'desk');
  check('1024 + coarse => yard (a tablet in landscape)', (await densityFor(1024, 'coarse')) === 'yard');
  check('1023 + fine   => yard', (await densityFor(1023, 'fine')) === 'yard');
  check('no matchMedia at all => yard, the safe failure',
        (await densityFor(null, null)) === 'yard');

  const d = await bootWith({ width: 1024, pointer: 'fine' });
  check('boot installs exactly one resize listener',
        d.listeners.filter((l) => l[0] === 'resize').length === 1);
  check('…and it set data-density on <html>', d.densityAttr === 'desk');

  const before = d.evals();
  const fire = d.listeners.find((l) => l[0] === 'resize')[1];
  for (let i = 0; i < 12; i++) fire();
  check('twelve resizes inside the window evaluate nothing yet', d.evals() === before);
  await sleep(400);
  check('…and exactly one evaluation lands after the 250 ms debounce',
        d.evals() === before + 1);

  /* ---- 5. the replica, from one place ---------------------------------- */

  const r1 = await bootWith({ info: { lastRev: 10, tableMax: 40, notStored: 0 } });
  check('Boot.replica() reports behind from Sync.info and PullApply',
        r1.Boot.replica().behind === 30 && r1.Boot.replica().complete === false);
  const r2 = await bootWith({ info: { lastRev: 40, tableMax: 40, notStored: 0 } });
  check('…and complete only when caught up with nothing skipped',
        r2.Boot.replica().complete === true);
  const r3 = await bootWith({ info: { lastRev: 40, tableMax: 40, notStored: 1 } });
  check('…a record that would not store counts against completeness',
        r3.Boot.replica().complete === false);

  /* ---- 6. the script order --------------------------------------------- */

  check('index.html lists every script, in the declared dependency order',
        htmlScripts.join(' | ') === expectedScripts.join(' | '));
  check('every script index.html lists exists on disk',
        htmlScripts.every(exists));
  check('every stylesheet index.html lists exists, and is one of the declared five',
        htmlStyles.every((s) => exists(s) && STYLES.indexOf(s) >= 0));
  check('…and every declared stylesheet that exists is listed',
        STYLES.filter(exists).every((s) => htmlStyles.indexOf(s) >= 0));

  // ORDER itself has to be a topological order of DEPS, so that "fix" the check
  // by reordering ORDER to match a broken index.html is also red.
  let topoBad = [];
  const flat = ORDER.filter((e) => e !== SCREENS_SLOT);
  for (const f of flat) {
    for (const dep of (DEPS[f] || [])) {
      if (flat.indexOf(dep) > flat.indexOf(f)) topoBad.push(f + ' before ' + dep);
    }
  }
  check('the declared order is a topological order of the dependency table',
        topoBad.length === 0, topoBad);

  // Each file declares something, and it declares it by the time anything that
  // depends on it runs. Loaded for real, in index.html's own order.
  const inOrder = loadSequence(htmlScripts);
  check('index.html\'s scripts load in order with no error',
        inOrder.error === null, inOrder.error);
  check('…every one of them declares at least one global',
        inOrder.silent.length === 0, inOrder.silent);
  check('…and nothing runs before a module it depends on has declared itself',
        inOrder.violations.length === 0, inOrder.violations);

  // The mutation this check exists for. Every adjacent pair in index.html that
  // the table says has a dependency must break when swapped.
  const pairs = [];
  for (let i = 0; i < htmlScripts.length - 1; i++) {
    const a = htmlScripts[i], b = htmlScripts[i + 1];
    const edge = (DEPS[b] || []).indexOf(a) >= 0 || (DEPS[a] || []).indexOf(b) >= 0;
    if (!edge) continue;
    const swapped = htmlScripts.slice();
    swapped[i] = b; swapped[i + 1] = a;
    const res = loadSequence(swapped);
    pairs.push([a + ' <-> ' + b, res.violations.length > 0 || res.error !== null]);
  }
  check('there are adjacent pairs with a real dependency to swap', pairs.length >= 3);
  check('swapping any dependent adjacent pair is caught',
        pairs.every((p) => p[1]), pairs.filter((p) => !p[1]).map((p) => p[0]));

  /* ---- 7. the precache list is the same list --------------------------- */

  check('sw.js has a SHELL list', Array.isArray(swShell));
  const swFiles = (swShell || []).filter((u) => u !== './' && u !== 'index.html');
  check('sw.js precaches the document itself',
        (swShell || []).indexOf('./') >= 0 && (swShell || []).indexOf('index.html') >= 0);
  check('sw.js\'s precache is index.html\'s list, entry for entry and in order',
        swFiles.join(' | ') === htmlStyles.concat(htmlScripts).join(' | '));
  check('every precached file exists on disk', swFiles.every(exists));
  check('sw.js does not precache itself — a device could pin an old worker',
        (swShell || []).every((u) => path.basename(u) !== 'sw.js'));
  check('every v2/screens/*.js on disk is in BOTH lists',
        screensOnDisk.every((s) => htmlScripts.indexOf(s) >= 0 && swFiles.indexOf(s) >= 0));

  /* ---- 8. the worker opens offline, and keeps its scope ---------------- */

  check('sw.js has a fetch handler at last', /addEventListener\('fetch'/.test(SW));
  check('…answering the shell from the cache first', /caches\.match\(/.test(SW));
  check('…and a navigation anywhere under /v2/ resolves to the one document',
        /mode === 'navigate'/.test(SW) && /INDEX_PATH/.test(SW));
  check('the cache name still carries the garage-saathi-v2- prefix',
        /const CACHE = 'garage-saathi-v2-\d+'/.test(SW));
  check('activate still drops only v2\'s own older caches',
        SW.indexOf("k.startsWith('garage-saathi-v2-')") > 0);
  /* The scope cap is check-v2-isolation.sh's, in thirteen invariants, and this
   * suite must not restate it badly. One half of it is worth repeating here
   * because it is about THIS file's own contents: a `scope:` option. The other
   * half — the Service-Worker-Allowed header — is only ever set by the server or
   * the platform config and is checked there; grepping for the NAME here would
   * trip on the comment at the top of sw.js that explains why the header must
   * never appear, and a check that trips on prose about itself teaches people to
   * delete checks. */
  check('the worker still passes no scope option', !/\bscope\s*:/.test(SW));
  check('a cross-origin or non-GET request is never intercepted',
        /request\.method !== 'GET'/.test(SW) && /url\.origin !== self\.location\.origin/.test(SW));

  console.log(fails ? '\n' + fails + ' FAILED' : '\nall ok');
  process.exit(fails ? 1 : 0);
}

/* ===== helpers =========================================================== */

/* A stand-in for v2/db.js, faithful in the ways this suite depends on:
 *  - all() is ONE read and is counted, because the whole point of Cache.load is
 *    how many of them happen;
 *  - the dirty marks behave as v2/db.js's do — set by a write, cleared only for
 *    the names the reader says it finished;
 *  - pruneBefore reads `at`, `lastAt` then `updatedAt`, in that order, because
 *    the history stores disagree about which field they carry;
 *  - every read and write is a clone, because IndexedDB stores a copy. */
function fakeDB() {
  const data = {};
  const dirty = new Set();
  const counts = {};
  let failing = null;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  return {
    seed(store, rows) { data[store] = {}; rows.forEach((r) => { data[store][r.id] = clone(r); }); dirty.add(store); },
    ids(store) { return Object.keys(data[store] || {}); },
    reads(store) { return counts[store] || 0; },
    resetReads() { Object.keys(counts).forEach((k) => delete counts[k]); },
    failOn(store) { failing = store; },
    dirtySnapshot() { return new Set(dirty); },
    clearDirty(names) { (names || new Set(dirty)).forEach((n) => dirty.delete(n)); },
    markDirty(store) { dirty.add(store); },
    async all(store) {
      counts[store] = (counts[store] || 0) + 1;
      return Object.values(data[store] || {}).map(clone);
    },
    async get(store, id) { const v = (data[store] || {})[id]; return v ? clone(v) : null; },
    async put(store, obj) { obj.updatedAt = Date.now(); (data[store] || (data[store] = {}))[obj.id] = clone(obj); dirty.add(store); return obj; },
    async pruneBefore(store, cutoff) {
      if (failing === store) throw new Error('pruneBefore ' + store + ' failed');
      const rows = data[store] || {};
      let n = 0;
      for (const k of Object.keys(rows)) {
        const at = Number((rows[k].at || rows[k].lastAt || rows[k].updatedAt) || 0);
        if (!at || at >= cutoff) continue;              // no date is not an old date
        delete rows[k]; n++;
      }
      if (n) dirty.add(store);
      return n;
    },
  };
}

/* Boot, in a stub window, against stubs for everything it calls. boot.js
 * resolves every dependency at call time, which is exactly what makes this
 * possible without loading the real data layer. */
async function bootWith(o) {
  const listeners = [];
  let evals = 0;
  const ctx = stubWindow({
    addEventListener(ev, fn) { listeners.push([ev, fn]); },
    matchMedia: o.width == null ? undefined : function (q) {
      evals++;
      const m = /min-width: (\d+)px/.exec(q);
      return { matches: m ? o.width >= Number(m[1]) : q === '(pointer: ' + (o.pointer || 'coarse') + ')',
               addEventListener() {}, addListener() {} };
    },
  });
  let densityAttr = null;
  ctx.document.documentElement.setAttribute = (k, v) => { if (k === 'data-density') densityAttr = v; };
  const info = o.info || { lastRev: 0, tableMax: 0, notStored: 0 };
  let syncOpts = null;
  const mounted = [];
  ctx.DB = { get: async () => (o.user === undefined ? { id: 'u1', role: 'owner' } : o.user) };
  ctx.Sync = { start(opts) { syncOpts = opts; }, info: () => info, tokenUser: () => 'u1' };
  ctx.Caps = { screensFor: () => ['today', 'me'] };
  ctx.Router = { go: () => true, onChange() {}, current: () => ({ id: 'today', params: null }) };
  ctx.Cache = { load: async () => ({}), prune: async () => 0 };
  ctx.PullApply = { FIRST_STORES: ['buses'], replicaState: require('./v2/pullapply.js').replicaState };
  ctx.Shell = { mount(id) { mounted.push(id); } };
  runFile(ctx, 'boot.js');
  await ctx.Boot.start();
  return { Boot: ctx.Boot, S: ctx.S, syncOpts, listeners, mounted, densityAttr,
           evals: () => Math.floor(evals / 2) };
}

async function densityFor(width, pointer) {
  const ctx = stubWindow({
    matchMedia: width == null ? undefined : function (q) {
      if (/min-width: (\d+)px/.test(q)) return { matches: width >= Number(/min-width: (\d+)px/.exec(q)[1]) };
      return { matches: q === '(pointer: ' + pointer + ')' };
    },
  });
  runFile(ctx, 'boot.js');
  return ctx.Boot.density();
}

/* Load a list of scripts into one stub window, in the given order, and report
 * what went wrong: an error, a file that declared nothing at all, or a file that
 * ran before something it depends on had declared itself. */
function loadSequence(files) {
  const ctx = stubWindow();
  const defined = new Set();
  const violations = [];
  const silent = [];
  for (const f of files) {
    for (const dep of (DEPS[f] || [])) {
      if (!files.includes(dep)) continue;              // not built yet: not this check's business
      const names = providedBy(read(dep));
      if (!names.some((n) => defined.has(n))) violations.push(f + ' ran before ' + dep);
    }
    try { runFile(ctx, f); } catch (e) {
      return { error: f + ': ' + e.constructor.name + ': ' + e.message, violations, silent };
    }
    const mine = providedBy(read(f)).filter((n) => ctx[n] !== undefined || vmHas(ctx, n));
    if (!mine.length) silent.push(f);
    mine.forEach((n) => defined.add(n));
  }
  return { error: null, violations, silent };
}

// A top-level `const` in a classic script is a lexical global, not a property of
// the global object, so `ctx[name]` cannot see it. db.js and sync.js both
// declare theirs that way.
function vmHas(ctx, name) {
  try { return vm.runInContext('typeof ' + name + ' !== "undefined"', ctx); } catch (e) { return false; }
}

main().catch((e) => { console.error(e); process.exit(1); });

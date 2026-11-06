/* Tests for the branch no node suite had ever run. Run: node test_v2_browserpath.js
 *
 * At the repo ROOT, not in v2/: scripts/run-tests.py discovers test_*.js at the
 * root only and does not recurse, and a test nobody runs is not a test.
 *
 * WHY THIS FILE EXISTS
 *
 * Every v2 module ends the same way:
 *
 *     if (typeof module !== 'undefined' && module.exports) module.exports = api;
 *     else { root.Thing = api; ... }
 *
 * and every one of the fourteen suites before this one takes the FIRST branch.
 * So the `else` — the browser's, the one that registers with the Router, the
 * one that used to call `mount()` — was exercised by nothing. `v2/login.js`
 * says so in its own words at its registration block, and it is how
 * `v2/screens/store.js` shipped a line that threw on every page load in a real
 * browser for a month:
 *
 *     Uncaught (in promise) Error: cache.js needs boot.js (S) — not loaded
 *
 * store.js's load-time `mount()` reached `Cache.load`, `Cache.load` needs `S`,
 * `S` is created by `boot.js`, and `boot.js` is the LAST script on the page.
 * Thirteen slices, 969 checks and a 250-check gate all passed over it, because
 * none of them loaded the page.
 *
 * SO THIS SUITE LOADS THE PAGE. It takes `v2/index.html`'s own script list, in
 * index.html's own order, runs every file as a classic script in ONE shared
 * context with `#app` already in the document — which is what makes `boot.js`
 * boot — and then asks what happened. Nothing is stubbed that the page does not
 * stub for itself: `caps.js`, `router.js`, `cache.js`, `shell.js`, `login.js`
 * and all thirteen screens are the real files. `DB` and `Sync` are the real
 * files too, with the handful of methods that would reach IndexedDB or the
 * network replaced AFTER load, so that the load path itself is untouched.
 *
 * WHAT IT HOLDS, one property per section:
 *
 *  1. The load draws nothing, reads nothing and throws nothing. A screen's load
 *     registers and that is all.
 *  2. A screen's listeners exist exactly while the screen is on the page.
 *     INTEGRATION-NOTES 17: 42 `addEventListener` and no `removeEventListener`,
 *     and after Store, People and Reviews THREE live handlers were reading
 *     `data-tab`. The collision needs two screens mounted in one session, which
 *     is why no slice could see it and why this is the file that can.
 *  3. All thirteen screens answer a tap. Four of them — duty, gate, me, today —
 *     never called `mount()` at load and nothing else called it either, so in a
 *     browser they had no listener at all. Me is a driver's and a conductor's
 *     whole app.
 *  4. Gate's press-and-hold timer does not fire against a screen that is gone.
 *  5. `Shell.mount(null)` over a live session is not the login (REV-AUTH F7).
 *  6. The route's params survive a sync tick.
 *  7. A store that could not be read is not a store that is empty.
 *  8. The replica belongs to one person, and the next person does not inherit
 *     it (REV-AUTH F1).
 *
 * MUTANTS. Section 9 breaks each rule in the SOURCE, reloads the page, and
 * asserts the check for it goes red. A check that cannot fail is decoration,
 * and this repo has shipped a bug behind one.
 */
process.env.TZ = process.env.TZ || 'UTC';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const read = (p) => fs.readFileSync(p, 'utf8');
const V2 = (...p) => path.join(ROOT, 'v2', ...p);

/* index.html's own list, parsed from index.html, in index.html's order. NOT
 * restated here: a second copy of the script order is a second copy to forget,
 * and `test_v2_boot.js` already keeps index.html and sw.js agreeing. */
const INDEX = read(V2('index.html'));
const SRC = (INDEX.match(/<script src="[^"]+"><\/script>/g) || [])
  .map((s) => s.replace(/^<script src="/, '').replace(/"><\/script>$/, ''));

let fails = 0;
const fail = (name, e) => {
  console.log(' FAIL ' + name + '\n        ' + String(e && e.message).split('\n').join('\n        '));
  fails++;
};

/* CASES RUN ONE AT A TIME, and that is not tidiness.
 *
 * An unhandled rejection is reported to `process`, not to the page that caused
 * it, so two pages open at once cannot be told apart — and section 1's whole
 * subject is a rejection. The first version of this file ran its cases
 * concurrently and section 9's store.js mutant, which is SUPPOSED to reject,
 * handed its rejection to section 1, which then failed for the right reason
 * about the wrong page. A suite that can attribute a failure to the wrong
 * subject is worse than a slow one. */
const cases = [];
function test(name, fn) { cases.push({ name: name, fn: fn }); }
const flush = () => new Promise((r) => setImmediate(r));

/* ===================================================================================================
 * THE PAGE
 * =================================================================================================== */

/* An element faithful in the ways the frame and the screens depend on:
 * `innerHTML` is readable back, `insertAdjacentHTML` appends to it (Shell.put
 * clears then inserts), and attributes are kept. */
function el(tag) {
  const o = {
    tagName: tag || 'div', innerHTML: '', textContent: '', style: {}, _a: {},
    insertAdjacentHTML(pos, h) { o.innerHTML += String(h); },
    appendChild(c) { return c; },
    setAttribute(k, v) { o._a[k] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(o._a, k) ? o._a[k] : null; },
    removeAttribute(k) { delete o._a[k]; },
    hasAttribute(k) { return Object.prototype.hasOwnProperty.call(o._a, k); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    addEventListener() {}, removeEventListener() {}, focus() {}, blur() {},
    classList: { add() {}, remove() {}, contains() { return false; } },
  };
  return o;
}

function htmlEl() {
  const cls = {}, attrs = {};
  return {
    lang: 'en', style: {}, classes: cls, attrs: attrs,
    classList: {
      add(c) { cls[c] = true; }, remove(c) { delete cls[c]; }, contains(c) { return !!cls[c]; },
    },
    setAttribute(k, v) { attrs[k] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null; },
    removeAttribute(k) { delete attrs[k]; },
  };
}

/* The thirteen, their ids and the role that holds each, so section 3 can walk
 * them. Taken from `Caps.SCREENS` at run time rather than listed, so a
 * fourteenth screen is walked without anybody remembering to add it. */
function screensOf(win, role) {
  return win.Caps.screensFor(role);
}

/* open(o) -> the page, and everything a case needs to interrogate it.
 *
 *   o.src    {'screens/store.js': '<source>'} — the mutation seam
 *   o.rows   the stores this device's IndexedDB holds
 *   o.ls     localStorage, as the device found it
 */
function open(o) {
  o = o || {};
  const html = htmlEl();
  const nodes = { app: el('div'), screen: el('main') };

  // Every document listener, with the phase, because a capture-phase listener
  // is a DIFFERENT listener and a removal that forgets `true` removes nothing.
  const on = [];
  let adds = 0, removes = 0;
  const doc = {
    documentElement: html,
    title: '',
    activeElement: null,
    head: el('head'),
    body: el('body'),
    addEventListener(type, fn, cap) { adds++; on.push({ type: type, fn: fn, cap: !!cap }); },
    removeEventListener(type, fn, cap) {
      for (let i = 0; i < on.length; i++) {
        if (on[i].type === type && on[i].fn === fn && on[i].cap === !!cap) {
          on.splice(i, 1); removes++; return;
        }
      }
    },
    getElementById(id) { return nodes[id] || null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement(t) { return el(t); },
  };

  const ls = { _d: Object.assign({}, o.ls || {}) };
  ls.getItem = (k) => (Object.prototype.hasOwnProperty.call(ls._d, k) ? ls._d[k] : null);
  ls.setItem = (k, v) => { ls._d[k] = String(v); };
  ls.removeItem = (k) => { delete ls._d[k]; };

  const timers = [];
  let tseq = 0;
  const warns = [], errors = [], infos = [];
  const rejections = [];
  const onRejection = (e) => rejections.push(String((e && e.message) || e));
  process.on('unhandledRejection', onRejection);

  const win = {
    navigator: { onLine: o.online === false ? false : true, userAgent: 'node', language: 'en' },
    location: { href: 'http://localhost/v2/', origin: 'http://localhost', pathname: '/v2/' },
    document: doc,
    localStorage: ls,
    matchMedia() { return { matches: false, addEventListener() {}, addListener() {} }; },
    /* Timers are RECORDED, not run: `boot.js`'s redraw is on a 120 ms timer and
     * gate's hold is 1.5 s, and a suite that waited for either would pass or
     * fail by how busy the machine is. `run(ms)` fires what is due. */
    setTimeout(fn, ms) { const t = { id: ++tseq, fn: fn, ms: ms, dead: false }; timers.push(t); return t; },
    clearTimeout(t) { if (t) t.dead = true; },
    setInterval() { return 0; }, clearInterval() {},
    requestAnimationFrame(fn) { return win.setTimeout(fn, 16); },
    addEventListener() {}, removeEventListener() {},
    getComputedStyle() { return { opacity: '1' }; },
    fetch() { return Promise.reject(new Error('no network in this suite')); },
    crypto: { getRandomValues(a) { for (let i = 0; i < a.length; i++) a[i] = i; return a; },
              randomUUID() { return 'uuid-' + (++tseq); } },
    console: {
      warn(...a) { warns.push(a.join(' ')); },
      error(...a) { errors.push(a.join(' ')); },
      info(...a) { infos.push(a.join(' ')); },
      log(...a) { infos.push(a.join(' ')); },
    },
    Math, JSON, Promise, Date, Set, Map, Object, Array, String, Number, Boolean,
    isFinite, isNaN, parseInt, parseFloat, RegExp, Error, TypeError, Intl,
    encodeURIComponent, decodeURIComponent, URL, AbortController, Uint8Array, ArrayBuffer,
  };
  win.window = win;
  win.self = win;
  win.globalThis = win;

  const ctx = vm.createContext(win);
  const loadThrew = [];

  /* THE TWO REPLACEMENTS, and WHERE they happen is the whole of their honesty.
   *
   * `DB` and `Sync` are the real objects from the real files; only the methods
   * that would reach IndexedDB or the network are swapped, and the swap happens
   * IN THE LOAD LOOP, immediately after the file that declares them — which is
   * before a single screen has loaded. So every screen, the frame, the cache
   * and boot run exactly as they do on the page, against a data layer that
   * answers instead of one that cannot open a database. Patching after the loop
   * instead would hide the one thing section 1 is for: a store read that
   * happened while the page was still parsing scripts.
   *
   * Reached by EVALUATING THE NAME in the context, not off `window`: `db.js`
   * and `sync.js` declare `const DB` and `const Sync` at the top level of a
   * classic script, and a top-level `const` goes into the global LEXICAL scope
   * rather than onto the global object. That is exactly why every v2 module
   * resolves its neighbours as `typeof DB !== 'undefined' && DB` first and
   * `root.DB` second, and a stub hung on `window` alone would be a stub none of
   * them could see. `STORES` is in that same scope, which is how `cache.js`
   * reads db.js's own store table without db.js exporting it. */
  const inCtx = (name) => vm.runInContext(name, ctx);
  const rows = {};
  Object.keys(o.rows || {}).forEach((k) => { rows[k] = (o.rows[k] || []).slice(); });
  const dirty = new Set(Object.keys(rows));
  const pruned = [];
  const reads = [];
  let loading = true;             // true while the page's scripts are still running
  const readsWhileLoading = [];
  function patchDB() {
  /* NOT `win.DB = inCtx('DB')` any more, and that line was the whole reason this
     harness could not see the defect it exists to catch. `db.js` publishes
     itself to the global object now, exactly as the real page does, so READING
     it off `window` here is what proves the publish is there. Hanging it on
     `window` ourselves manufactured the one condition nine screens depend on,
     which is the same trap this file already avoided, two comments below, for
     `STORES`. If the publish is ever removed this throws instead of passing. */
  if (!win.DB) throw new Error('db.js did not publish window.DB — nine screens reach root.DB and every write behind it is a silent no-op on the page');
  /* `STORES` is DELIBERATELY NOT hung on `window`. `cache.js` resolves it as a
   * bare name first and falls back to `root.STORES`, so a copy here would take
   * a branch the real page never takes — and it quietly neutered section 8's
   * unscoped mutant, which thought it had removed the table and had only
   * removed the first of three ways to find it. */
  win.DB.all = function (store) {
    if (loading) readsWhileLoading.push(store);
    reads.push(store);
    if (rows[store] === 'throws') return Promise.reject(new Error('could not read ' + store));
    return Promise.resolve((rows[store] || []).slice());
  };
  win.DB.get = function (store, id) {
    const a = rows[store] || [];
    for (let i = 0; i < a.length; i++) if (a[i].id === id) return Promise.resolve(a[i]);
    return Promise.resolve(null);
  };
  win.DB.put = function (store, row) {
    (rows[store] || (rows[store] = [])).push(row); dirty.add(store); return Promise.resolve(true);
  };
  win.DB.dirtySnapshot = function () { return new Set(dirty); };
  win.DB.clearDirty = function (names) { (names || []).forEach((n) => dirty.delete(n)); };
  win.DB.pruneBefore = function (store, cutoff) {
    pruned.push({ store: store, cutoff: cutoff });
    // A store the device cannot read is a store it cannot prune.
    if (rows[store] === 'throws') return Promise.reject(new Error('could not prune ' + store));
    const n = (rows[store] || []).length;
    rows[store] = (rows[store] || []).filter((r) => {
      const at = Number((r && (r.at || r.lastAt || r.updatedAt)) || 0);
      return !at || at >= cutoff;
    });
    dirty.add(store);
    return Promise.resolve(n - rows[store].length);
  };
  }

  const syncStarts = [];
  const resets = [];
  function patchSync() {
  // Read, not assigned, for the reason given above `win.DB`.
  if (!win.Sync) throw new Error('sync.js did not publish window.Sync — the screens that reach root.Sync get nothing');
  win.Sync.start = function (cb) { syncStarts.push(cb); return true; };
  win.Sync.tick = function () { return Promise.resolve(); };
  win.Sync.reset = function () { resets.push(Date.now()); return Promise.resolve(); };
  /* `info()` is LAYERED OVER THE REAL ONE, not swapped for it, and that
   * distinction is this file's whole subject applied to itself.
   *
   * `info()` reaches neither IndexedDB nor the network — it is bookkeeping over
   * `localStorage` and the outbox — so by this harness's own rule it should
   * never have been replaced outright. Replacing it meant no case here could
   * observe a field sync.js computes for itself, and `lastSyncAt` is one:
   * REV-FLOW F6 is `lastSyncAt` seeded from `ls.getItem('lastSyncAt') || '0'`,
   * so a phone that had never synced held the EPOCH and rendered it as 05:30 —
   * and a suite that handed the page its own `info()` could not have seen that
   * however many cases it had. Same shape as the `win.DB = inCtx('DB')` that
   * used to stand above it and is now a throw, for exactly this reason:
   * the harness manufacturing the condition it exists to interrogate.
   *
   * So the real answer comes first, the defaults the suites were written
   * against sit over it, and `o.info` sits over both. A field no default names
   * — `lastSyncAt`, `lastError`, `clockOffset` — now comes from sync.js. */
  const realInfo = win.Sync.info;
  win.Sync.info = function () {
    let base = {};
    try { base = (typeof realInfo === 'function' && realInfo.call(win.Sync)) || {}; }
    catch (e) { base = {}; }
    return Object.assign({}, base, {
      lastRev: 0, tableMax: 0, notStored: 0, pending: 0, status: 'idle', authed: false,
    }, o.info || {});
  };
  win.Sync.pendingIds = function (store) { return ((o.pending || {})[store] || []).slice(); };
  win.Sync.tokenUser = function () { return o.token || ''; };
  win.Sync.logout = function () {};
  win.Sync.setActor = function () {};
  }

  for (const f of SRC) {
    const src = (o.src && o.src[f] !== undefined) ? o.src[f] : read(V2(f));
    try { vm.runInContext(src, ctx, { filename: V2(f) }); }
    catch (e) { loadThrew.push(f + ': ' + e.message); }
    if (f === 'db.js') patchDB();
    if (f === 'sync.js') patchSync();
  }
  loading = false;

  return {
    win: win, html: html, nodes: nodes, ls: ls,
    loadThrew: loadThrew, rejections: rejections, warns: warns, errors: errors, infos: infos,
    listeners: on, adds: () => adds, removes: () => removes,
    reads: reads, readsWhileLoading: readsWhileLoading,
    pruned: pruned, resets: resets, syncStarts: syncStarts,
    rows: (s) => (rows[s] || []).slice(),
    timers: timers,
    close() { process.removeListener('unhandledRejection', onRejection); },
    // Fire every live timer at or under `ms`, then let microtasks settle.
    async run(ms) {
      for (let i = 0; i < 6; i++) {
        const due = timers.filter((t) => !t.dead && t.ms <= (ms == null ? 10000 : ms));
        due.forEach((t) => { t.dead = true; });
        due.forEach((t) => { try { t.fn(); } catch (e) { errors.push(String(e.message)); } });
        await flush();
        if (!due.length) break;
      }
    },
    // The body markup the frame last put into #screen.
    body: () => nodes.screen.innerHTML,
    frame: () => nodes.app.innerHTML,
    // Every listener of one type, in registration order.
    of: (type) => on.filter((l) => l.type === type),
  };
}

/* A click through whatever handlers are on the document, in registration order.
 * `closest(sel)` answers exactly the selectors the handler asks for — a target
 * that answered everything would make every branch look alive. */
function click(p, matches) {
  const target = {
    closest(sel) {
      const keys = Object.keys(matches || {});
      for (let i = 0; i < keys.length; i++) {
        if (keys[i] === sel || sel.indexOf(keys[i]) >= 0) {
          const attrs = matches[keys[i]];
          return {
            getAttribute: (k) => (attrs && attrs[k] !== undefined ? attrs[k] : null),
            setAttribute() {}, removeAttribute() {}, closest() { return null; },
            querySelectorAll() { return []; }, querySelector() { return null; },
          };
        }
      }
      return null;
    },
  };
  const ev = { target: target, preventDefault() {}, type: 'click' };
  p.of('click').forEach((l) => { try { l.fn(ev); } catch (e) { /* recorded by the case */ } });
  return ev;
}

/* `updatedAt` on both, because every row that reaches this disk has one:
 * `DB.bulkPut` writes `updatedAt || 1` and the server stamps on push. A fixture
 * row without one would survive a rebuild for a reason no real row has. */
const OWNER = { id: 'u-owner', role: 'owner', name: 'Owner', updatedAt: 1 };
const CONDUCTOR = { id: 'u-cond', role: 'conductor', name: 'Conductor', updatedAt: 1 };

/* ===================================================================================================
 * 1. THE LOAD. A screen's load registers and does nothing else.
 * =================================================================================================== */

test('the page loads with no throw, no unhandled rejection and no console error', async () => {
  const p = open();
  await p.run(0);
  assert.deepStrictEqual(p.loadThrew, [], 'a script threw while the page was loading');
  /* THE REGRESSION THIS FILE WAS WRITTEN FOR. `v2/screens/store.js` called its
   * own `mount()` at script load, `mount()` called `Cache.load`, and `Cache.load`
   * needs `S` — which `boot.js` creates, two hundred lines further down the
   * document. Live in a real browser on every page load, and invisible to all
   * fourteen suites, because they all take the `module.exports` branch. */
  assert.deepStrictEqual(p.rejections, [], 'the page load left an unhandled rejection');
  assert.deepStrictEqual(p.errors, [], 'the page load wrote a console error');
  p.close();
});

test('no screen reads a store while the page is still loading scripts', async () => {
  const p = open();
  /* `boot.js` is the only script that calls anything, and it is the last one on
   * the page. So a store read recorded while the scripts are still running is a
   * screen reading data for a screen nobody has opened — and it is the read
   * that cost `store.js` an exception on every page load, because `Cache.load`
   * needs an `S` that does not exist yet.
   *
   * The reads `boot.js` and the login make once the document has been parsed
   * are not this: those are the frame asking, which is what FIRST_STORES is
   * for. The question is WHEN, not WHETHER. */
  assert.deepStrictEqual(p.readsWhileLoading, [],
    'a screen read a store while the page was still parsing scripts');
  await p.run(200);
  p.close();
});

test('no screen installs a listener at load — only the login, which is not a route', async () => {
  const p = open();
  await p.run(0);
  /* The login registers with nothing and is resolved by name (`shell.js`'s
   * `login()`), so it is not in `Router`'s registry and `Shell.mount` cannot
   * call a lifecycle hook on it. Its four listeners go on at load and stay, and
   * its `onClick` is scoped to `[data-screen="login"]`, so they are inert
   * behind a signed-in screen. Every OTHER listener on the document must have
   * arrived through `Shell.mount`. */
  /* FIVE, and each one is named: `ui/photos.js:192` installs the photo viewer's
   * one click handler at load, and the login's four go on at load because the
   * login is not a route and the frame has no lifecycle hook to call on it
   * (`shell.js` resolves it by name). Both are foundation, both are permanent,
   * and neither is a screen. Every other listener on the document must have
   * arrived through `Shell.mount`. */
  assert.strictEqual(p.adds(), 5,
    'expected the photo viewer\'s one and the login\'s four at load, got ' + p.adds()
    + ': ' + p.listeners.map((l) => l.type).join(', '));
  assert.strictEqual(p.win.Shell._mounted(), null, 'a screen was live before anybody signed in');
  p.close();
});

test('every screen registered itself, so none of the thirteen is unreachable', async () => {
  const p = open();
  await p.run(0);
  const ids = Object.keys(p.win.Caps.SCREENS);
  const missing = ids.filter((id) => !p.win.Router.moduleFor(id));
  assert.deepStrictEqual(missing, [], 'screens that never registered');
  assert(ids.length >= 13, 'expected at least the thirteen, got ' + ids.length);
  p.close();
});

/* ===================================================================================================
 * 2. THE LIFECYCLE. A screen's listeners exist exactly while it is on the page.
 * =================================================================================================== */

async function signIn(p, user) {
  await p.win.Boot.enter(user);
  await p.run(200);
}

test('mounting a screen installs its listeners, and leaving it takes them off', async () => {
  const p = open({ token: 'u-owner', rows: { users: [OWNER] } });
  await p.run(0);
  const atLoad = p.adds();

  await signIn(p, OWNER);
  const first = p.win.Shell._mounted();
  assert(first, 'nothing was mounted after signing in');
  const afterFirst = p.adds();
  assert(afterFirst > atLoad, 'mounting ' + first + ' installed no listener at all');

  // Somewhere else, and back is not the test: the point is that the FIRST
  // screen's handlers are gone while the second one's are on.
  const ids = screensOf(p.win, 'owner').filter((id) => id !== first);
  assert(ids.length, 'the owner holds one screen');
  assert(p.win.Router.go(ids[0]), 'could not route to ' + ids[0]);
  await p.run(200);
  assert.strictEqual(p.win.Shell._mounted(), ids[0], 'the frame did not record the new screen');
  assert(p.removes() > 0, 'nothing was ever removed: INTEGRATION-NOTES 17 is back');
  p.close();
});

test('walking all thirteen TWICE gives the same count screen for screen — the note 17 property', async () => {
  const p = open({ token: 'u-owner', rows: { users: [OWNER] } });
  await p.run(0);
  await signIn(p, OWNER);
  const ids = screensOf(p.win, 'owner');

  async function walk() {
    const out = [];
    for (const id of ids) {
      if (!p.win.Router.go(id)) continue;
      await p.run(200);
      out.push(id + ':' + p.listeners.length);
    }
    return out;
  }

  /* TWO PASSES, compared pair for pair, and the reason it is two rather than a
   * single count against a fixed number:
   *
   *  - the number is honestly different per screen. `gate.js` installs ten
   *    listeners (click, two changes, pointerdown, keydown and five hold-stop
   *    types) and `today.js` installs one, so "the same number every time" is
   *    not the property, and a ceiling would be a guess.
   *  - some FOUNDATION listeners are installed lazily and are permanent by
   *    design: `ui/states.js:243` installs the retry registry's one delegated
   *    handler the first time any screen draws an `errorState`, with its own
   *    documented cap of 200 entries. A check that counted it as a leak would
   *    be crying wolf about the foundation.
   *
   * Two identical passes say exactly what matters: the count depends only on
   * WHICH screen is on the page, not on how many have been. Before the fix it
   * grew monotonically and never came down — after Store, People and Reviews
   * there were three live handlers all reading `data-tab`, and `data-act` is
   * shared by every one of the thirteen. */
  /* A WARM-UP PASS FIRST, and it is thrown away. The lazy foundation listener
   * above is installed during the first walk, part way through it — measured:
   * it appears when Money first draws an error state — so pass 1 and pass 2
   * differ by one on every screen BEFORE that point and agree after it. The
   * warm-up lets every lazy, once-only listener in the foundation exist before
   * anything is counted, so the two passes that ARE compared differ only if a
   * SCREEN left something behind. */
  await walk();
  const first = await walk();
  const second = await walk();
  assert(first.length >= 2, 'fewer than two screens were walked');
  assert.strictEqual(second.join(' '), first.join(' '),
    'a second pass over the same screens found a different number of listeners\n'
    + '        pass 1: ' + first.join(' ') + '\n        pass 2: ' + second.join(' '));
  p.close();
});

test('revisiting one screen twelve times does not stack its listeners', async () => {
  const p = open({ token: 'u-owner', rows: { users: [OWNER] } });
  await p.run(0);
  await signIn(p, OWNER);
  /* The two partial guards note 17 warns against being mistaken for the fix —
   * `people.js` and `store.js` each carry a double-install guard — would pass
   * this and fail the case above. This one is here so that the pair of them
   * tells you WHICH half is broken. */
  assert(p.win.Router.go('store'));
  await p.run(200);
  const one = p.listeners.length;
  for (let i = 0; i < 12; i++) {
    p.win.Router.go(i % 2 ? 'store' : 'people');
    await p.run(200);
  }
  p.win.Router.go('store');
  await p.run(200);
  assert.strictEqual(p.listeners.length, one,
    'twelve trips between Store and People left ' + (p.listeners.length - one)
    + ' extra listener(s), all of them reading data-tab');
  p.close();
});

test('a capture-phase listener is removed in the capture phase, or it is not removed at all', async () => {
  const p = open({ token: 'u-owner', rows: { users: [OWNER] } });
  await p.run(0);
  await signIn(p, OWNER);
  /* `store.js` and `reviews.js` register their scroll listener with `true`.
   * `removeEventListener('scroll', fn)` without it matches a different listener
   * and silently removes nothing — the one mistake in this area that looks
   * exactly like the fix. */
  for (const id of ['store', 'reviews']) {
    if (!p.win.Router.go(id)) continue;
    await p.run(200);
    assert(p.of('scroll').length > 0, id + ' registered no scroll listener');
    assert(p.win.Router.go('today'), 'could not leave ' + id);
    await p.run(200);
    assert.strictEqual(p.of('scroll').length, 0,
      id + ' left a capture-phase scroll listener behind');
  }
  p.close();
});

test('every screen that adds a listener removes it, and exports unmount', () => {
  const dir = path.join(ROOT, 'v2', 'screens');
  const bad = [];
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.js'))) {
    const src = read(path.join(dir, f));
    if (!/\.addEventListener\(/.test(src)) continue;
    if (!/\.removeEventListener\(/.test(src)) bad.push(f + ': no removeEventListener');
    if (!/function unmount\s*\(/.test(src)) bad.push(f + ': no unmount()');
    if (!/\bunmount:\s*unmount\b/.test(src)) bad.push(f + ': unmount is not exported');
  }
  assert.deepStrictEqual(bad, [], 'screens that install a listener they never remove');
});

test('no screen calls its own mount() at load, and none reads [data-nav]', () => {
  const dir = path.join(ROOT, 'v2', 'screens');
  const bad = [];
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.js'))) {
    const src = read(path.join(dir, f));
    // Comments carry the word; a bare statement is the call.
    const live = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    if (/(^|\n)\s*mount\(\);/.test(live)) bad.push(f + ': calls mount() at load');
    /* `[data-nav]` is the FRAME's attribute and the frame routes it with no
     * params, so a screen that reads it is a screen whose row loses what it is
     * about (`attention.js`'s own comment). Drawing it is fine — `jobcard.js`
     * has a plain "back to Jobs" button; reading it in a handler is not. */
    if (/closest\(\s*'\[data-nav\]'\s*\)/.test(live)) bad.push(f + ': reads [data-nav]');
  }
  assert.deepStrictEqual(bad, [], 'screens still installing or routing at load');
});

/* ===================================================================================================
 * 3. ALL THIRTEEN ANSWER A TAP. Four of them never did.
 * =================================================================================================== */

test('every one of the thirteen has a live listener while it is the screen on the page', async () => {
  const p = open({ token: 'u-owner', rows: { users: [OWNER, CONDUCTOR] } });
  await p.run(0);
  await signIn(p, OWNER);
  const dead = [];
  const ids = Object.keys(p.win.Caps.SCREENS);
  for (const id of ids) {
    if (!p.win.Caps.holds('owner', id)) continue;
    if (!p.win.Router.go(id)) { dead.push(id + ' (unroutable)'); continue; }
    await p.run(200);
    /* The frame's own handler is always there, so the count alone proves
     * nothing: ask the module whether the Shell called IT. `_mounted()` is the
     * id whose `mount()` ran, and before this fix it was never anything at all
     * for duty, gate, me and today — the four that registered without calling
     * their own `mount()`, and which nothing else called either. Me is a driver's
     * and a conductor's whole app, and Today is the owner's front door. */
    if (p.win.Shell._mounted() !== id) dead.push(id);
  }
  assert.deepStrictEqual(dead, [], 'screens the frame never mounted');
  p.close();
});

test('the gate round opens knowing which buses run tonight, not which have been checked', async () => {
  const p = open({ token: 'u-owner', rows: { users: [OWNER] },
                   ls: { v2ReplicaFor: 'u-owner' },
                   info: { lastRev: 5, tableMax: 5, notStored: 0 } });
  await p.run(0);
  await signIn(p, OWNER);
  /* `gate.js`'s `mount()` is the ONLY caller of `reload()`, and `reload()` is
   * the only thing that fills `ui.running` from `Night.running(date)` —
   * tonight's list. Nothing called `mount()`, so `ui.running` stayed null on
   * first entry and `model()` fell back to "the buses that already have a check
   * today" (`gate.js:478-482`). The Gate round therefore listed the work that
   * was DONE and not the work that was LEFT, which is `v2-ux.md §4.1` #9's rule
   * for this screen read backwards. Not a listener defect — the same missing
   * call, costing data rather than taps. */
  assert.strictEqual(p.win.Gate._ui.running, null, 'the fixture should start with no list');
  assert(p.win.Router.go('gate'), 'could not reach the gate round');
  await p.run(200);
  assert.strictEqual(p.win.Shell._mounted(), 'gate', 'the gate round was not mounted');
  assert(p.win.Gate._ui.date, 'the gate round opened without asking which night it is');
  // `running` is whatever Night answered — an array, or null if it could not be
  // read. What matters is that it was ASKED, which `date` records.
  p.close();
});

test('Me is live for a conductor, whose whole app it is', async () => {
  const p = open({ token: 'u-cond', rows: { users: [CONDUCTOR] } });
  await p.run(0);
  await signIn(p, CONDUCTOR);
  assert.deepStrictEqual(screensOf(p.win, 'conductor'), ['me'],
    'a conductor should hold exactly Me');
  assert.strictEqual(p.win.Shell._mounted(), 'me', 'Me was not mounted for a conductor');
  const before = p.listeners.length;
  assert(before > 5, 'Me installed nothing: a conductor\'s only screen answers no tap');
  p.close();
});

/* ===================================================================================================
 * 4. GATE'S HOLD TIMER
 * =================================================================================================== */

test('leaving the gate round mid-hold clears the 1.5 s timer', async () => {
  const p = open({ token: 'u-owner', rows: { users: [OWNER] } });
  await p.run(0);
  await signIn(p, OWNER);
  assert(p.win.Router.go('gate'), 'could not reach the gate round');
  await p.run(200);
  /* The press. `holdStart` is on `pointerdown` and `keydown`; the timer is
   * `HOLD_MS` and the only path that handles navigating away before it fires is
   * the `unmount` that nothing used to call. */
  const live = () => p.timers.filter((t) => !t.dead && t.ms === p.win.Gate.HOLD_MS).length;
  const down = p.listeners.filter((l) => l.type === 'pointerdown');
  assert(down.length, 'the gate round registered no pointerdown');
  down.forEach((l) => {
    try {
      l.fn({ target: { closest: (s) => (s.indexOf('data-hold') >= 0 ? { getAttribute: () => 'gc-1' } : null) },
             preventDefault() {} });
    } catch (e) { /* the fixture has no check to release */ }
  });
  const held = live();
  assert(p.win.Router.go('today'), 'could not leave the gate round');
  await p.run(200);
  assert.strictEqual(live(), 0,
    'a hold timer survived the screen (' + held + ' set, ' + live() + ' still live)');
  p.close();
});

/* ===================================================================================================
 * 5. mount(null) OVER A LIVE SESSION — REV-AUTH F7
 * =================================================================================================== */

test('Shell.mount(null) with somebody signed in is the no-permission body, not the login', async () => {
  const p = open({ token: 'u-owner', rows: { users: [OWNER] } });
  await p.run(0);
  await signIn(p, OWNER);
  p.win.Shell.mount(null);
  /* `.lg` is login.css taking the whole viewport, and `data-frame` coming off
   * is the frame tearing itself down. Both are correct for a signed-OUT device
   * and are a lockout for a signed-in one: the person reads "Sign in to carry
   * on" over a session that is still valid, and offline the next PIN cannot
   * heal it because there is no server to override the local row. */
  assert.strictEqual(p.html.classList.contains('lg'), false,
    'the login was drawn over a live session (REV-AUTH F7)');
  assert(p.html.getAttribute('data-frame'), 'the frame was torn down under a live session');
  assert(/This is not open to you/.test(p.body()),
    'expected §1.10\'s no-permission body, got: ' + p.body().slice(0, 160));
  assert(p.win.S.user && p.win.S.user.id === 'u-owner', 'the session was dropped');
  p.close();
});

test('…and with nobody signed in it IS the login, which is the other half of the same branch', async () => {
  const p = open();
  await p.run(200);
  p.win.Shell.mount(null);
  assert.strictEqual(p.html.classList.contains('lg'), true,
    'a signed-out device was not handed over to login.css');
  p.close();
});

test('leaving a screen for the login still unmounts it', async () => {
  const p = open({ token: 'u-owner', rows: { users: [OWNER] } });
  await p.run(0);
  await signIn(p, OWNER);
  const was = p.win.Shell._mounted();
  assert(was, 'nothing was mounted');
  const before = p.removes();
  p.win.Shell.mount('login');
  assert.strictEqual(p.win.Shell._mounted(), null, 'a screen stayed live behind the login');
  assert(p.removes() > before, was + ' kept its listeners behind the login screen');
  p.close();
});

/* ===================================================================================================
 * 6. THE ROUTE'S PARAMS SURVIVE A SYNC TICK
 * =================================================================================================== */

test('a redraw re-mounts the screen WITH its params: a job card does not lose its card', async () => {
  const p = open({ token: 'u-owner', rows: { users: [OWNER] } });
  await p.run(0);
  await signIn(p, OWNER);
  const seen = [];
  const real = p.win.Shell.mount;
  p.win.Shell.mount = function (id, params) { seen.push({ id: id, params: params }); return real(id, params); };
  assert(p.win.Router.go('jobcard', { id: 'jc-7' }), 'could not reach a job card');
  await p.run(200);
  /* `boot.js`'s redraw is what a sync tick runs, and it used to call
   * `sh.mount(cur.id)` — the id without the params. `jobcard.js:827` reads
   * `m.params.id`, so four seconds after opening a card it was re-drawn for no
   * card at all, on a screen nobody had touched. */
  const last = seen[seen.length - 1];
  assert(last, 'the redraw never reached the frame');
  /* Compared as JSON: `router.js` clones the params inside the page, so the
   * object that comes back is another realm's Object and `deepStrictEqual`
   * fails on the prototype rather than on the contents. */
  assert.strictEqual(JSON.stringify(last.params), JSON.stringify({ id: 'jc-7' }),
    'the redraw dropped the route params: ' + JSON.stringify(seen.slice(-3)));
  /* EVERY mount of this route, not only the last one, and the difference is a
   * mutant that came back alive. `jobcard.js`'s mount-time `Cache.load` redraws
   * when it lands, and its own redraw passes `{ id: here() }` — read from the
   * Router, which still holds the params whatever `boot.js` did with them. So
   * with boot.js mutated to drop them, the LAST call was still right and the
   * check reported green over a frame that had just drawn a card for no card.
   * Asserting on the last of several calls is the same shape of decoration as
   * asking whether a file contains at least one `removeEventListener`. */
  const dropped = seen.filter((s) => s.id === 'jobcard'
                                     && JSON.stringify(s.params) !== JSON.stringify({ id: 'jc-7' }));
  assert.deepStrictEqual(dropped.map((s) => String(s.params)), [],
    'some mount of the card arrived without its params: ' + JSON.stringify(seen));
  p.close();
});

/* ===================================================================================================
 * 7. "COULD NOT READ" IS NOT "EMPTY"
 * =================================================================================================== */

test('a store that could not be read is named, and keeps this device incomplete', async () => {
  const p = open({
    token: 'u-owner',
    rows: { users: [OWNER], jobcards: 'throws' },
    /* This device is already the owner's, so the scope guard does nothing and
     * the only thing that can mark a store here is the read itself. Without
     * this the first draft of this case passed for the WRONG reason: the guard
     * rebuilt an unmarked replica, the rebuild of a store that cannot be read
     * failed, and the store came out sealed instead of unread. */
    ls: { v2ReplicaFor: 'u-owner' },
    info: { lastRev: 10, tableMax: 10, notStored: 0 },
  });
  await p.run(0);
  await signIn(p, OWNER);
  await p.win.Cache.load(['jobcards']);
  /* Three different facts, three different answers. Before this, a failed read
   * was written into `S.cache` as `[]` and the fact was gone: one layer below
   * all thirteen screens, "could not read this store" and "this store is empty"
   * were the same value, which is `v2-ux.md §4.1` #7 — "'unknown' and 'zero'
   * must never look alike" — broken at the foundation. */
  assert(p.win.Cache.unread().indexOf('jobcards') >= 0,
    'a failed read was not named: ' + JSON.stringify(p.win.Cache.unread()));
  assert(p.win.Cache.isUnread('jobcards'), 'isUnread disagrees with unread()');
  /* And it is LOAD-BEARING rather than a field nobody reads: an unread store
   * makes the replica incomplete, which is §1.8's rule reaching every screen at
   * once — no aggregate figure may be drawn without `stale: true`. With
   * lastRev === tableMax the cursor itself says this device has everything, so
   * the only thing that can make it incomplete here is the failed read. */
  assert.strictEqual(p.win.Boot.replica().complete, false,
    'a store that could not be read left the replica claiming to be complete');
  p.close();
});

test('…and a store that really is empty is not named, so the two do not blur', async () => {
  const p = open({
    token: 'u-owner', rows: { users: [OWNER], jobcards: [] },
    ls: { v2ReplicaFor: 'u-owner' },
    info: { lastRev: 10, tableMax: 10, notStored: 0 },
  });
  await p.run(0);
  await signIn(p, OWNER);
  await p.win.Cache.load(['jobcards']);
  assert.deepStrictEqual(p.win.S.cache.jobcards, [], 'an empty store should read as empty');
  assert.strictEqual(p.win.Cache.isUnread('jobcards'), false,
    'an empty store was reported as unread');
  assert.strictEqual(p.win.Boot.replica().complete, true,
    'an empty store made the replica incomplete');
  p.close();
});

test('a read that recovers clears the name, so the device stops saying it is short', async () => {
  const p = open({
    token: 'u-owner', rows: { users: [OWNER], jobcards: 'throws' },
    ls: { v2ReplicaFor: 'u-owner' },
    info: { lastRev: 10, tableMax: 10, notStored: 0 },
  });
  await p.run(0);
  await signIn(p, OWNER);
  await p.win.Cache.load(['jobcards']);
  assert(p.win.Cache.isUnread('jobcards'));
  p.win.DB.all = (s) => Promise.resolve(s === 'jobcards' ? [{ id: 'jc-1', updatedAt: 1 }] : []);
  p.win.DB.markDirty('jobcards');
  await p.win.Cache.load(['jobcards']);
  assert.strictEqual(p.win.Cache.isUnread('jobcards'), false, 'a recovered read stayed named');
  assert.strictEqual(p.win.Boot.replica().complete, true, 'the replica stayed incomplete');
  p.close();
});

/* ===================================================================================================
 * 8. THE REPLICA BELONGS TO ONE PERSON — REV-AUTH F1
 * =================================================================================================== */

/* The rows the authorization pass actually measured in a conductor's cache,
 * after one offline PIN login on a phone an owner had filled. Every field here
 * is one the server withholds from a conductor; they are on this device only
 * because somebody else's token fetched them. */
const OTHERS = {
  users: [OWNER, CONDUCTOR],
  drivers: [{ id: 'd9', userId: 'u-other', name: 'Someone Else', salaryMonthly: 21000,
              license: 'DL-999', docs: [{ kind: 'aadhaar', url: '/uploads/aadhaar-other.jpg' }],
              updatedAt: 1 }],
  crewnotes: [{ id: 'n5', crewId: 'd1', text: 'a note about a driver', updatedAt: 1 }],
  gatechecks: [{ id: 'g2', userId: 'u-other', selfie: '/uploads/selfie-other.jpg', updatedAt: 1 }],
  jobcards: [{ id: 'j-m1', labourHours: 4, notes: 'another mechanic\'s note', updatedAt: 1 }],
};

test('the next person on a shared phone does not inherit the last person\'s replica', async () => {
  /* The owner filled this device: the marker says so and the cursor has moved.
   * Now a conductor signs in, which is the yard case — `NO_DEVICE_PIN` is owner,
   * supervisor and crewmanager, so a conductor's PIN IS cached and the offline
   * branch signs them in with no server round trip at all. */
  const p = open({
    token: '', rows: OTHERS,
    ls: { v2ReplicaFor: 'u-owner' },
    info: { lastRev: 900, tableMax: 900, notStored: 0 },
  });
  await p.run(0);
  await signIn(p, CONDUCTOR);
  await p.run(200);

  for (const store of ['drivers', 'crewnotes', 'gatechecks', 'jobcards']) {
    assert.deepStrictEqual(p.rows(store), [],
      store + ' is still on the disk under the next person: REV-AUTH F1');
    const held = p.win.S.cache[store];
    assert(!held || !held.length,
      store + ' reached the conductor\'s memory: ' + JSON.stringify(held).slice(0, 120));
  }
  // The roster is KEPT, and that is not an oversight: purging it locks the next
  // person out, because the role and name picker reads it and askRoster() needs
  // the network. It carries {id, name, role, updatedAt} and nothing else.
  assert(p.rows('users').length, 'the login roster was purged: nobody can sign in offline');
  // And the cursor is rewound, or the dropped stores would be empty for ever.
  assert(p.resets.length, 'the pull cursor was not rewound after the rebuild');
  assert.strictEqual(p.ls.getItem('v2ReplicaFor'), 'u-cond', 'the replica still names the last person');
  p.close();
});

test('the same person signing back in keeps their replica — the rebuild is not a device wipe', async () => {
  const p = open({
    token: 'u-owner', rows: OTHERS,
    ls: { v2ReplicaFor: 'u-owner' },
    info: { lastRev: 900, tableMax: 900, notStored: 0 },
  });
  await p.run(0);
  await signIn(p, OWNER);
  /* The blanking failure this repo has been bitten by most. A purge on every
   * sign-out would mean an owner who signed out and back in at a gate with no
   * network had nothing: the rebuild has to be keyed on WHO, not on the fact of
   * a sign-in. */
  assert(p.rows('drivers').length, 'the owner\'s own replica was thrown away');
  assert.deepStrictEqual(p.pruned, [], 'nothing should have been pruned for the same person');
  assert.deepStrictEqual(p.resets, [], 'the cursor was rewound for no reason');
  p.close();
});

test('a device that has never pulled is claimed, not rebuilt: a first sign-in costs no sync', async () => {
  const p = open({
    token: 'u-owner', rows: { users: [OWNER] },
    info: { lastRev: 0, tableMax: 0, notStored: 0 },
  });
  await p.run(0);
  await signIn(p, OWNER);
  assert.deepStrictEqual(p.resets, [], 'a brand-new device was made to re-pull');
  assert.deepStrictEqual(p.pruned, [], 'a brand-new device was pruned');
  assert.strictEqual(p.ls.getItem('v2ReplicaFor'), 'u-owner');
  p.close();
});

test('a replica with no marker and a moved cursor is of unknown provenance, so it is rebuilt once', async () => {
  /* Every device in the yard on the deploy that lands this has a full replica
   * and no marker. Treating that as "nothing was ever here" would leak for
   * exactly one handover, which is the handover that matters. */
  const p = open({
    token: '', rows: OTHERS,
    info: { lastRev: 900, tableMax: 900, notStored: 0 },
  });
  await p.run(0);
  await signIn(p, CONDUCTOR);
  assert(p.pruned.length, 'a replica of unknown provenance was claimed rather than rebuilt');
  assert.deepStrictEqual(p.rows('drivers'), [], 'the unknown replica survived');
  p.close();
});

test('a store holding unsent work is NOT purged, and is sealed instead of read', async () => {
  const p = open({
    token: '', rows: OTHERS,
    ls: { v2ReplicaFor: 'u-owner' },
    info: { lastRev: 900, tableMax: 900, notStored: 0 },
    pending: { gatechecks: ['g2'] },
  });
  await p.run(0);
  await signIn(p, CONDUCTOR);
  await p.win.Cache.load(['gatechecks', 'drivers']);
  /* `sync.js`'s push reads the row from the store at push time and drops the
   * outbox key when the row has gone (`recordForKey` -> `dropKey`), so purging
   * a store with a pending row throws away the previous person's work in
   * silence. A supervisor's gate check is worth more than one handover's delay. */
  assert.strictEqual(p.rows('gatechecks').length, 1, 'unsent work was destroyed by the rebuild');
  // It fails CLOSED: not read, and not handed over as an empty list either.
  assert(p.win.Cache.isUnread('gatechecks'), 'a store held for unsent work was not sealed');
  assert.strictEqual(p.win.S.cache.gatechecks, undefined,
    'a sealed store was read into the next person\'s memory');
  assert.strictEqual(p.win.Boot.replica().complete, false,
    'a sealed store left the replica claiming to be complete');
  /* The marker is NOT moved on, so the next sign-in tries the rebuild again.
   * Writing it here would record a partial rebuild as a finished one, and the
   * sealed store would stay sealed for ever with nothing coming back to it. */
  assert.strictEqual(p.ls.getItem('v2ReplicaFor'), 'u-owner',
    'a partial rebuild was recorded as finished');
  // Everything that COULD be dropped was.
  assert.deepStrictEqual(p.rows('drivers'), [], 'a droppable store was skipped too');
  p.close();
});

test('a device whose scope cannot be decided reads NOTHING, rather than everything', async () => {
  /* The fail-OPEN this guards was in the first draft of `cache.js`:
   * `replicaStores()` returned an empty list when it could not see `db.js`'s
   * own store table, which reads as "there is nothing to purge" — so the
   * rebuild recorded itself as finished and the next person read the last
   * person's rows with every check green. "I do not know whose these rows are"
   * has exactly one safe answer.
   *
   * The mutation takes the table away, which is the only way this state is
   * reachable: in a browser `STORES` is a top-level const in a loaded script
   * and is always there. */
  /* The WHOLE resolution block goes, not its first line: `replicaStores` looks
   * for the table three ways, and a mutant that removes one of them proves
   * nothing. */
  const src = mutate('cache.js',
    "    let table = null;\n"
    + "    if (typeof STORES !== 'undefined' && STORES) table = STORES;\n"
    + "    else if (root && root.STORES) table = root.STORES;\n"
    + "    else { const d = db(); table = (d && d._STORES) || null; }\n",
    '    let table = null;\n');
  const p = open({ src: src, token: '', rows: OTHERS,
                   ls: { v2ReplicaFor: 'u-owner' },
                   info: { lastRev: 900, tableMax: 900, notStored: 0 } });
  await p.run(0);
  await signIn(p, CONDUCTOR);
  await p.win.Cache.load(['drivers', 'crewnotes', 'gatechecks']);
  for (const store of ['drivers', 'crewnotes', 'gatechecks']) {
    assert.strictEqual(p.win.S.cache[store], undefined,
      store + ' was read on a device that does not know whose rows these are');
  }
  assert.strictEqual(p.win.Boot.replica().complete, false,
    'a device that cannot scope itself claimed to be complete');
  // And it says so, loudly, rather than failing in silence: every screen is
  // about to be empty and stale until this device is reloaded.
  assert(p.errors.join(' ').indexOf('cannot be scoped to a person') >= 0,
    'nothing was written down: ' + JSON.stringify(p.errors));
  p.close();
});

test('the stores kept through a rebuild are two, named, and everything else goes', () => {
  const p = open();
  /* Joined rather than deep-compared: an array built inside the page is a
   * different realm's Array and `deepStrictEqual` fails on the prototype, which
   * reads as the list having changed when it has not. */
  assert.strictEqual(p.win.Cache.KEEP_THROUGH_REBUILD.slice().sort().join(','),
    'outboxbase,users',
    'the keep-list changed: every name on it is a store the next person inherits');
  /* Deny-by-default applied to retention: the list that decides what is PURGED
   * is db.js's own store table minus those two, so a store added tomorrow is
   * rebuilt without anybody remembering to list it. */
  const purged = p.win.Cache.replicaStores();
  assert(purged.indexOf('drivers') >= 0 && purged.indexOf('crewnotes') >= 0
         && purged.indexOf('gatechecks') >= 0 && purged.indexOf('meta') >= 0,
    'a scoped store is not in the rebuild set: ' + purged.join(', '));
  assert.strictEqual(purged.indexOf('users'), -1, 'the roster is in the rebuild set');
  assert.strictEqual(purged.indexOf('outboxbase'), -1, 'the rebase table is in the rebuild set');
  assert(purged.length > 30, 'the rebuild set is suspiciously short: ' + purged.length);
  p.close();
});

/* ===================================================================================================
 * 10. WHAT A MOUNTED SCREEN READS — REV-FLOW F2, F3, F4, F5, F6, F8
 *
 * The lifecycle landed first and this is what it made possible. `Shell.mount`
 * calls the incoming screen's `mount()`, so a screen finally has one place to
 * ask IndexedDB for its own data — and before this slice, EIGHT of the thirteen
 * never asked at all. Twelve stores were loaded by nothing in the whole of v2.
 *
 * The cost of that, all of it measured on the screen by REV-FLOW:
 *
 *   F2  the crew manager's Duty board was a permanent skeleton. The only list
 *       of its stores in the file was inside `retry()`, which is reachable only
 *       from the ERROR state while the screen sits in the LOADING state, and
 *       the only other loader of `nightlist`/`dutylog` in v2 was Attention's
 *       seat row — a screen that role does not hold.
 *   F3  the owner got two of his four 6.40am numbers; Money never showed a
 *       total and Trip cash read "Could not read the trip cash" for ever;
 *       Reviews drew `Complaints 0` as a hard zero over a store nothing had
 *       read; the owner's "who opened what" was `— No data`.
 *   F4  Attention reported six buses as "no crew, 2 seats still empty",
 *       including one with all three seats filled, off a `dutylog` it could not
 *       read — [E] ba274f6 as a load defect rather than a narrowing one.
 *   F5  Money's five Retry buttons called `Shell.mount` and never `Cache.load`,
 *       so the screen text was byte-identical after clicking all five.
 *   F6  a phone that had never synced said "Last sent 05:30" and "This phone
 *       holds 91 of 91 records".
 *   F8  Store opened on "0 parts" and a skeleton for 3.3 seconds, every visit,
 *       because `load()` discarded its promise and waited for the 4 s tick.
 *
 * THIS IS THE FILE THAT CAN SEE IT, for the reason the header gives: every
 * other suite hands a screen a rows bag and asks what it draws, which answers
 * "would this screen draw the right thing IF the rows were there". The question
 * here is whether anything ever puts them there, and only a loaded page has an
 * answer.
 * =================================================================================================== */

/* One fixture, every role, one row per store that matters — enough that a store
 * which IS read is visibly non-empty, so "read it" and "drew it" can be told
 * apart. `updatedAt: 1` on everything, for the reason OWNER carries one.
 *
 * It deliberately does NOT cover every store: a store absent from here still
 * gets a `getAll`, which is what `p.reads` records, and asking what was READ is
 * the question — not what came back. */
const CREWMGR = { id: 'u-cm', role: 'crewmanager', name: 'Crew manager', updatedAt: 1 };
const DRIVER = { id: 'u-drv', role: 'driver', name: 'Ramlal', updatedAt: 1 };
const STOREMAN = { id: 'u-st', role: 'store', name: 'Storekeeper', updatedAt: 1 };

// Today's key in the shape `nightlist` is keyed by (`nl-<YYYY-MM-DD>`), on the
// page's own clock: a fixture with yesterday's key is a fixture with no record
// for tonight, which is a different state and the one F2 is NOT about.
function todayKey() {
  const d = new Date();
  const m = d.getMonth() + 1, day = d.getDate();
  return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
}

function yardRows(users) {
  const key = 'nl-' + todayKey();
  const now = Date.now();
  return {
    users: users,
    buses: [{ id: 'b1', regNo: 'RJ14 PA 1023', updatedAt: 1 },
            { id: 'b2', regNo: 'RJ14 PB 4567', updatedAt: 1 }],
    drivers: [{ id: 'c1', name: 'Ramlal', status: 'active', busId: 'b1', driverSlot: 1,
                crewRole: 'driver', updatedAt: 1 },
              { id: 'c2', name: 'Suresh', status: 'active', busId: 'b1',
                crewRole: 'conductor', updatedAt: 1 }],
    // b1 has a driver and a conductor; b2 has nobody. So a correctly-read board
    // reports ONE bus short and not two, which is the whole of F4's measurement.
    dutylog: [{ id: 'dl1', crewId: 'c1', busId: 'b1', seat: 'd1', role: 'driver', at: now - 3600000, updatedAt: 1 },
              { id: 'dl2', crewId: 'c2', busId: 'b1', seat: 'con', role: 'conductor', at: now - 3600000, updatedAt: 1 }],
    nightlist: [{ id: key, date: todayKey(), buses: { b1: { running: true }, b2: { running: true } },
                  at: now - 7200000, updatedAt: 1 }],
    parts: [{ id: 'p1', name: 'Brake Pad Set', partNo: 'BP-1', unit: 'set', qty: 12, reorderLevel: 4, updatedAt: 1 }],
    jobcards: [{ id: 'j1', busId: 'b1', status: 'open', at: now - 1000, updatedAt: 1 }],
    ledger: [{ id: 'l1', jobId: 'j1', partId: 'p1', qty: 2, at: now - 2000, updatedAt: 1 }],
    purchases: [{ id: 'pu1', supplier: 'Acme', amount: 5000, paymentStatus: 'due', at: now - 3000, updatedAt: 1 }],
    trips: [{ id: 't1', busId: 'b1', startedAt: now - 4000, allowance: 2000, expenses: [], updatedAt: 1 }],
    def: [{ id: 'd1', busId: 'b1', litres: 10, amount: 900, at: now - 5000, updatedAt: 1 }],
    audits: [{ id: 'a1', partId: 'p1', counted: 12, at: now - 6000, updatedAt: 1 }],
    usage: [{ id: 'u1', userId: 'u-owner', day: todayKey(), screens: { today: 3 }, updatedAt: 1 }],
    coachai: [{ id: 'ca1', crewId: 'c1', status: 'draft', at: now - 7000, updatedAt: 1 }],
    digest: [{ id: 'dg1', week: '2026-W45', headline: 'A quiet week', sections: [], updatedAt: 1 }],
    rbcomplaints: [{ id: 'rc1', status: 'open', at: now - 8000, updatedAt: 1 }],
    rbalias: [{ id: 'ra1', name: 'RAMLAL', status: 'typed', updatedAt: 1 }],
    vendors: [], components: [], incidents: [], fuel: [], challans: [], gatechecks: [],
    attendance: [], crewnotes: [], stockmoves: [], breakdowns: [], driverreports: [],
    routes: [], gatepasses: [], rbservices: [], rbreviews: [], rbassign: [],
    rbreviewai: [], rbaliasai: [], reportai: [], meta: [],
  };
}

// A page already belonging to this person, already fully synced: so the only
// thing that can leave a store unread here is a screen that never asked for it.
function yard(user, extra) {
  const o = {
    token: user.id,
    rows: yardRows([user]),
    ls: { v2ReplicaFor: user.id },
    info: { lastRev: 9, tableMax: 9, notStored: 0, pending: 0, lastSyncAt: Date.now() - 60000 },
  };
  Object.keys(extra || {}).forEach((k) => {
    if (k === 'rows') Object.assign(o.rows, extra.rows);
    else if (k === 'info') Object.assign(o.info, extra.info);
    else o[k] = extra[k];
  });
  return o;
}

/* WHAT A SCREEN ASKED FOR, which is `Cache.load` and NOT `DB.all`.
 *
 * `p.reads` records `getAll`s, and `Cache.load` deliberately skips a store that
 * cannot have changed since the last read — so a screen whose stores are
 * already in hand correctly performs no `getAll`, and that is indistinguishable
 * from a screen that never asked. The asking is the property; `Cache.load` is
 * where it happens. Installed AFTER sign-in, so `boot.js`'s own FIRST_STORES
 * read is not counted as a screen's. */
function watchAsks(p) {
  const asked = [];
  const real = p.win.Cache.load;
  p.win.Cache.load = function (names) {
    (names || []).forEach((n) => asked.push(String(n)));
    return real.call(p.win.Cache, names);
  };
  return asked;
}

/* THE UNIFORM RULE, and the reason it is uniform. "Every screen asks for its
 * own stores when the frame mounts it" is a property all thirteen can be held
 * to; "every screen that happens to need it does" is a property whose
 * exceptions have to be remembered, and the eight screens that were missing a
 * read were missing it because nobody was holding a list. `jobs.js` and
 * `jobcard.js` read only stores that are already in FIRST_STORES and ask
 * anyway, so that this check has no exceptions to carve out. */
test('every one of the thirteen asks for its own stores when the frame mounts it', async () => {
  const silent = [];
  for (const user of [OWNER, CREWMGR, STOREMAN, DRIVER]) {
    const p = open(yard(user));
    await p.run(0);
    await p.win.Boot.enter(user);
    await p.run(300);
    const asked = watchAsks(p);
    for (const id of Object.keys(p.win.Caps.SCREENS)) {
      if (!p.win.Caps.holds(user.role, id)) continue;
      if (!p.win.Router.go(id)) continue;          // unroutable is section 3's subject
      await p.run(300);
      if (p.win.Shell._mounted() !== id) continue; // likewise
      /* RE-ENTERED THROUGH THE FRAME, not by routing somewhere else and back.
       * `Shell.enter` fires on a CHANGE of screen and not per redraw — the line
       * that keeps a four-second sync tick from re-kicking a store read forty
       * times a minute — so `mount()` only runs again after something else has
       * been mounted. Routing elsewhere cannot do that for a DRIVER or a
       * CONDUCTOR, who hold exactly one screen, and Me is their whole app:
       * the first draft of this case excused `driver/me` for that reason and
       * would have excused a genuinely silent Me with it. `Shell.mount(null)`
       * over a live session is §5's no-permission body, which unmounts without
       * needing a second screen to exist. */
      const n = asked.length;
      p.win.Shell.mount(null, null);
      assert.strictEqual(p.win.Shell._mounted(), null,
        'mount(null) left ' + id + ' recorded as live, so the re-entry below is not one');
      p.win.Shell.mount(id, null);
      await p.run(300);
      if (asked.length === n) silent.push(user.role + '/' + id);
    }
    p.close();
  }
  assert.deepStrictEqual(silent, [],
    'screens that were mounted and never asked the cache for anything');
});

/* ---- F2: the crew manager's Duty board ---- */

test('F2 the crew manager opens the Duty board and it FILLS — it was a permanent skeleton', async () => {
  const p = open(yard(CREWMGR));
  await p.run(0);
  await p.win.Boot.enter(CREWMGR);
  await p.run(300);
  assert(p.win.Caps.holds('crewmanager', 'duty'), 'the fixture should give this role the board');
  assert.strictEqual(p.win.Caps.holds('crewmanager', 'attention'), false,
    'the premise of F2 is that this role holds no Attention, which was the only other loader');
  assert(p.win.Router.go('duty'), 'could not reach the duty board');
  await p.run(300);
  assert.strictEqual(p.win.Shell._mounted(), 'duty', 'the board was not mounted');
  /* THE TWO STORES. Before this, `p.reads` held neither for this role at any
   * point in the session, and `S.cache.nightlist` stayed `undefined` for ever —
   * which `duty.js:539` correctly refuses to guess past, so the screen drew a
   * skeleton and there was no sequence of taps that changed it. */
  for (const n of ['nightlist', 'dutylog', 'buses', 'drivers', 'gatechecks']) {
    assert(p.reads.indexOf(n) >= 0, 'the board never asked IndexedDB for ' + n);
    assert(Array.isArray(p.win.S.cache[n]), n + ' is still ' + typeof p.win.S.cache[n] + ' in the cache');
  }
  // And the model is out of `loading`, which is the fact the person sees.
  const m = p.win.Duty.model({ role: 'crewmanager', cache: p.win.S.cache, params: null });
  assert.notStrictEqual(m.kind, 'loading', 'the board is still in its loading state');
  assert.strictEqual(m.total, 2, 'the denominator should be tonight\'s two buses');
  assert.strictEqual(m.need, 1, 'b1 is crewed and b2 is not, so exactly one bus needs somebody');
  assert(/RJ14 PB 4567/.test(p.body()), 'the board drew no bus at all:\n' + p.body().slice(0, 400));
  p.close();
});

test('F2 …and the crew manager\'s Today no longer says tonight is not picked when it is', async () => {
  const p = open(yard(CREWMGR));
  await p.run(0);
  await p.win.Boot.enter(CREWMGR);
  await p.run(300);
  assert.strictEqual(p.win.Shell._mounted(), 'today', 'the crew manager should land on Today');
  /* `tonight(q)` returns null both when `nightlist` is unloaded and when there
   * is no record for tonight, and the crew manager's block 2 could not tell
   * them apart — so with six buses ticked it read "Tonight's buses are not
   * picked yet" and offered a button to the skeleton above. */
  const body = p.body();
  assert(!/not picked yet/i.test(body),
    'Today still says tonight is not picked, with tonight\'s record on disk:\n' + body.slice(0, 600));
  assert(p.reads.indexOf('nightlist') >= 0, 'Today never asked for nightlist');
  p.close();
});

/* ---- F3: the stores nothing loaded ---- */

/* The twelve, each against the screen whose figure REV-FLOW measured as missing.
 * Driven as a table rather than twelve cases because the property is one
 * property, and a table is the thing that reddens when a thirteenth store is
 * added to a screen and nobody wires it up. */
const F3 = [
  { role: 'owner', user: OWNER, screen: 'today',
    stores: ['ledger', 'trips', 'def', 'purchases', 'digest', 'coachai', 'nightlist', 'rbalias'],
    why: 'the owner\'s 6.40am numbers: he got two of four' },
  { role: 'owner', user: OWNER, screen: 'money',
    stores: ['trips', 'ledger', 'def', 'purchases', 'challans'],
    why: 'Money never showed a total and Trip cash read "Could not read the trip cash"' },
  { role: 'owner', user: OWNER, screen: 'reviews',
    stores: ['rbcomplaints', 'rbalias'],
    why: 'Complaints 0 and Names to confirm 0, drawn as hard zeros' },
  { role: 'owner', user: OWNER, screen: 'me',
    stores: ['usage', 'coachai'],
    why: 'the owner\'s "who opened what" read — No data' },
  { role: 'owner', user: OWNER, screen: 'people',
    stores: ['dutylog', 'coachai', 'crewnotes'],
    why: 'dutylog reached this screen only through Attention' },
  { role: 'owner', user: OWNER, screen: 'buses',
    stores: ['dutylog', 'def', 'trips', 'ledger', 'reportai'],
    why: 'a per-bus running cost built out of stores nothing had read' },
  { role: 'store', user: STOREMAN, screen: 'store',
    stores: ['audits', 'purchases', 'ledger'],
    why: 'the anti-pilferage trail, loaded by this screen alone' },
  { role: 'crewmanager', user: CREWMGR, screen: 'duty',
    stores: ['nightlist', 'dutylog'],
    why: 'F2' },
];

for (const row of F3) {
  test('F3 ' + row.screen + ' asks for the stores it draws (' + row.why + ')', async () => {
    const p = open(yard(row.user));
    await p.run(0);
    await p.win.Boot.enter(row.user);
    await p.run(300);
    assert(p.win.Caps.holds(row.role, row.screen),
      row.role + ' does not hold ' + row.screen + ', so this row is testing nothing');
    assert(p.win.Router.go(row.screen), 'could not reach ' + row.screen);
    await p.run(300);
    assert.strictEqual(p.win.Shell._mounted(), row.screen, row.screen + ' was not mounted');
    const missed = row.stores.filter((n) => p.reads.indexOf(n) < 0);
    assert.deepStrictEqual(missed, [],
      row.screen + ' drew ' + missed.join(', ') + ' without ever reading ' + (missed.length === 1 ? 'it' : 'them'));
    // Read is not enough: it has to have reached the cache as a LIST, because
    // `undefined` is what every screen reads as "still loading".
    const unloaded = row.stores.filter((n) => !Array.isArray(p.win.S.cache[n]));
    assert.deepStrictEqual(unloaded, [], 'read but not in the cache: ' + unloaded.join(', '));
    p.close();
  });
}

test('F3 the owner\'s Today has every one of its eighteen stores in hand after one mount', async () => {
  const p = open(yard(OWNER));
  await p.run(0);
  await p.win.Boot.enter(OWNER);
  await p.run(300);
  assert.strictEqual(p.win.Shell._mounted(), 'today', 'the owner should land on Today');
  /* `today.js` reuses its own `SIG_STORES` as its read list, so this is the
   * screen's own declaration of what it draws, checked against what it asked
   * for. Taken from the module rather than retyped: a nineteenth store added to
   * the screen and not to the list reddens here. */
  /* `.slice()`d into THIS realm first. The page is a separate vm context, so an
   * array that comes back from it is another realm's Array and
   * `deepStrictEqual` fails on the prototype rather than on the contents —
   * the same trap section 6 names for the route params. */
  const want = Array.prototype.slice.call(p.win.Today._stores());
  assert(want.length >= 18, 'expected Today to declare its stores, got ' + JSON.stringify(want));
  const missed = want.filter((n) => !Array.isArray(p.win.S.cache[n]));
  assert.deepStrictEqual(missed, [], 'Today drew with these stores still unloaded: ' + missed.join(', '));
  p.close();
});

/* ---- F4: no count off a replica that cannot be read ---- */

/* The seat kind's row ids, in THIS realm. Both halves of the index are read:
 * a row whose basis cannot be worked out is `unranked` rather than absent, and
 * a check that looked only at `rows` would pass a version that drew six wrong
 * rows in the remainder line. */
function seatIdsOf(idx) {
  const all = Array.prototype.slice.call(idx.rows)
    .concat(Array.prototype.slice.call(idx.unranked));
  return all.filter((r) => r.kind === 'seat').map((r) => String(r.id));
}

test('F4 Attention draws NO seat count when dutylog could not be read, rather than six wrong ones', async () => {
  /* `nightlist` readable, `dutylog` NOT — the state REV-FLOW proved by loading
   * the two one at a time. A failed read is left as `[]` by `Cache.load` and
   * named in `Cache.unread()`, so "no dutylog on this device" and "nobody is
   * assigned to any bus" arrive at `seatRows` as the same value, and it
   * reported both of tonight's buses as having no crew — one of them fully
   * crewed. [E] ba274f6 with a new cause. */
  const p = open(yard(OWNER, { rows: { dutylog: 'throws' } }));
  await p.run(0);
  await p.win.Boot.enter(OWNER);
  await p.run(300);
  assert(p.win.Router.go('attention'), 'could not reach Attention');
  await p.run(300);
  assert(p.win.Cache.isUnread('dutylog'), 'the fixture should leave dutylog unread');
  assert(Array.isArray(p.win.S.cache.nightlist) && p.win.S.cache.nightlist.length,
    'the fixture should leave nightlist readable, or this proves nothing');
  const idx = p.win.Attention.index(p.win.S.cache, { id: 'u-owner', role: 'owner' },
                                    Date.now(), p.win.Cache.unread());
  const seats = seatIdsOf(idx);
  assert.deepStrictEqual(seats, [],
    'Attention invented ' + seats.length + ' seat row(s) off a dutylog it could not read');
  assert(idx.skipped.indexOf('seat') >= 0,
    'the kind was dropped but not recorded as skipped: ' + JSON.stringify(idx.skipped));
  // And the kinds that CAN see their stores are untouched: this removes one
  // kind, not the screen.
  assert.strictEqual(idx.skipped.indexOf('busPaper'), -1,
    'a kind whose stores were readable was dropped too');
  p.close();
});

test('F4 …and with both readable the same fixture reports the ONE bus that is short', async () => {
  const p = open(yard(OWNER));
  await p.run(0);
  await p.win.Boot.enter(OWNER);
  await p.run(300);
  assert(p.win.Router.go('attention'), 'could not reach Attention');
  await p.run(300);
  assert.strictEqual(p.win.Cache.isUnread('dutylog'), false, 'dutylog should be readable here');
  const idx = p.win.Attention.index(p.win.S.cache, { id: 'u-owner', role: 'owner' },
                                    Date.now(), p.win.Cache.unread());
  const seats = seatIdsOf(idx);
  /* ONE, and it is b2. b1 carries a driver and a conductor in `dutylog`, and
   * the half-read replica reported it as having "no crew, 2 seats still empty".
   * This is the pair of numbers F4 is: six wrong rows against one right one.
   * The row id carries its kind (`seat:b2`), which is `row()`'s own shape. */
  assert.deepStrictEqual(seats, ['seat:b2'],
    'expected exactly the uncrewed bus, got ' + JSON.stringify(seats));
  assert.deepStrictEqual(Array.prototype.slice.call(idx.skipped), [],
    'nothing should be skipped on a readable replica');
  p.close();
});

/* ---- F5: Money's Retry ---- */

test('F5 Money\'s Retry asks IndexedDB again — it called Shell.mount and nothing else', async () => {
  const p = open(yard(OWNER));
  await p.run(0);
  await p.win.Boot.enter(OWNER);
  await p.run(300);
  assert(p.win.Router.go('money'), 'could not reach Money');
  await p.run(300);
  assert.strictEqual(p.win.Shell._mounted(), 'money', 'Money was not mounted');
  /* Watched at `Cache.load`, not at `getAll`: `Cache.load` skips a store that
   * cannot have changed, so a Retry on a screen whose stores are in hand
   * correctly performs no `getAll` — and a check on `getAll` would then report
   * the FIXED code as broken and the broken code as fixed. The question is
   * whether the button asks the cache at all. */
  const asked = watchAsks(p);
  p.win.Money._retry();
  await p.run(300);
  const want = Array.prototype.slice.call(p.win.Money._stores());
  const missed = want.filter((n) => asked.indexOf(n) < 0);
  assert.deepStrictEqual(missed, [],
    'Retry asked for none of ' + missed.join(', ') + ': it redrew the same cache, which is the '
    + 'identical sentence. ' + (asked.length ? 'It asked for: ' + asked.join(', ') : 'It asked for nothing.'));
  p.close();
});

/* ---- F6: a phone that has never synced ---- */

test('F6 a never-synced phone reports no last-sent time at all, not the epoch', async () => {
  // No `lastSyncAt` in localStorage: a device straight out of the box.
  const p = open({ token: 'u-drv', rows: yardRows([DRIVER]), ls: {} });
  await p.run(0);
  /* `parseInt(ls.getItem('lastSyncAt') || '0', 10)` gave 0, and 0 is a
   * perfectly good timestamp — the epoch. Every reader guards on `== null` or
   * `isNum`, and 0 passes both, so IST rendered it as 05:30: "Last sent 05:30",
   * "Updated 20763 days ago", "No signal since 05:30", on a phone that had
   * never sent anything. */
  assert.strictEqual(p.win.Sync.info().lastSyncAt, null,
    'a device that has never synced reports ' + JSON.stringify(p.win.Sync.info().lastSyncAt));
  p.close();
});

test('F6 …and a device that HAS synced still reports the time it synced', async () => {
  const when = 1762400000000;
  const p = open({ token: 'u-drv', rows: yardRows([DRIVER]), ls: { lastSyncAt: String(when) } });
  await p.run(0);
  assert.strictEqual(p.win.Sync.info().lastSyncAt, when,
    'the honest null swallowed a real timestamp as well');
  p.close();
});

test('F6 …and Me does not tell a never-synced phone it holds n of n records', async () => {
  const p = open({ token: 'u-drv', rows: yardRows([DRIVER]), ls: {},
                   info: { lastRev: 0, tableMax: 0, notStored: 0, pending: 0, lastSyncAt: null } });
  await p.run(0);
  await p.win.Boot.enter(DRIVER);
  await p.run(300);
  assert.deepStrictEqual(screensOf(p.win, 'driver'), ['me'], 'a driver should hold exactly Me');
  assert.strictEqual(p.win.Shell._mounted(), 'me', 'Me was not mounted');
  const rep = p.win.Boot.replica();
  assert.strictEqual(rep.complete, false, 'a device that has never pulled claims a complete replica');
  assert.strictEqual(rep.behind, 0, 'the premise: the shortfall is UNKNOWN, which reads as 0');
  /* `meHolds` is drawn ONLY when the replica is incomplete — it is the sentence
   * that exists to say what is missing — and it printed `held` of `held + 0`.
   * Measured: "This phone holds 91 of 91 records". A denominator nobody knows
   * is not a denominator. */
  const body = p.body();
  const nOfN = /holds\s+([\d,]+)\s+of\s+([\d,]+)\s+records/.exec(body);
  assert.strictEqual(nOfN && nOfN[1] === nOfN[2] ? nOfN[0] : null, null,
    'Me still reports "' + (nOfN && nOfN[0]) + '" on a phone that has never synced');
  p.close();
});

/* ---- F8: Store's first paint ---- */

test('F8 Store\'s read redraws when it lands, without waiting for the four-second tick', async () => {
  /* THE SHELF STARTS EMPTY, and that is what makes this measurable.
   *
   * Getting the screen mounted at all needs a timer — `boot.js`'s redraw is on
   * 120 ms — so "mount it and look" cannot tell the fixed code from the broken
   * code: `p.run()` fires that timer AND flushes the microtasks the read
   * settles on, in one call. So the shelf is empty for the first paint, a part
   * arrives on disk afterwards, and the question becomes whether the screen
   * catches up on ITS OWN read landing with NO further timer fired. Before
   * this, `load()` fired `Cache.load(STORES)` and discarded the promise, so the
   * answer was "on the next four-second sync tick" — measured in a real browser
   * as 3.3 seconds of "0 parts … Loading" over a shelf holding seven lines. */
  const p = open(yard(STOREMAN, { rows: { parts: [] } }));
  await p.run(0);
  await p.win.Boot.enter(STOREMAN);
  await p.run(300);
  assert(p.win.Router.go('store'), 'could not reach Store');
  await p.run(300);
  assert.strictEqual(p.win.Shell._mounted(), 'store', 'Store was not mounted');
  assert(!/Brake Pad Set/.test(p.body()), 'the shelf should start empty, or this proves nothing');

  // A part lands on disk. `DB.put` marks the store dirty, exactly as a pull
  // applying a record does, so the next `Cache.load` has something to re-read.
  await p.win.DB.put('parts', { id: 'p1', name: 'Brake Pad Set', partNo: 'BP-1',
                                unit: 'set', qty: 12, reorderLevel: 4, updatedAt: 2 });
  const timersBefore = p.timers.filter((t) => !t.dead).length;
  p.win.Store.mount();                 // what `Shell.mount` calls on an entry
  /* NO `p.run()`. Microtasks only: `Cache.load` awaits one `getAll` per store
   * and this screen reads nine, so the redraw sits nine promises deep. */
  for (let i = 0; i < 60; i++) await flush();
  assert(/Brake Pad Set/.test(p.body()),
    'Store drew no part after its own read landed, with no timer fired:\n' + p.body().slice(0, 400));
  /* And it got there WITHOUT a tick: no timer that was pending before the read
   * has been fired, because nothing here fires one. Stated as an assertion
   * rather than left implicit, so a future `p.run()` creeping into this case
   * cannot quietly turn it back into a check that passes either way. */
  assert.strictEqual(p.timers.filter((t) => !t.dead).length >= timersBefore, true,
    'a timer was consumed, so this case no longer proves the redraw was the read\'s own');
  p.close();
});

test('F8 …and the headline never says "0 parts" over a shelf it has not read', async () => {
  /* The loading model, straight from the module: `counts.parts` is `null` until
   * the shelf is read, and `header()` drew `say('stPartsN', { c: … || 0 }, 0)`
   * — so for the whole of the loading state the storekeeper's own first line
   * read "0 parts", in plain text, as a settled figure. `v2-ux.md §4.1` #7
   * broken in the one place a storekeeper looks first. */
  const p = open(yard(STOREMAN));
  await p.run(0);
  const loadingHtml = p.win.Store.render({ role: 'store', cache: {}, params: null,
                                           user: STOREMAN, replica: { behind: 0, complete: false },
                                           stale: true, unread: [], offline: false });
  assert(!/\b0 parts\b/.test(loadingHtml),
    'the loading headline still reads "0 parts":\n' + loadingHtml.slice(0, 300));
  assert(/data-state="unknown"/.test(loadingHtml),
    'an unknown count should draw the dash figure() already owns for it');
  // And a shelf that really IS empty still reads as a real zero, so the two do
  // not blur the other way round.
  const emptyShelf = {};
  ['parts', 'ledger', 'jobcards', 'audits', 'purchases', 'vendors', 'components', 'buses', 'users']
    .forEach((n) => { emptyShelf[n] = []; });
  const emptyHtml = p.win.Store.render({ role: 'store', cache: emptyShelf, params: null,
                                         user: STOREMAN, replica: { behind: 0, complete: true },
                                         stale: false, unread: [], offline: false });
  assert(/\b0 parts\b/.test(emptyHtml),
    'a shelf that was read and found empty must still say 0:\n' + emptyHtml.slice(0, 300));
  p.close();
});

/* ===================================================================================================
 * 9. MUTANTS. Every check above, broken on purpose.
 * =================================================================================================== */

/* A mutant is a page loaded with ONE file replaced by a changed copy of itself.
 * Nothing on disk is touched. `mutant(file, from, to)` asserts the replacement
 * actually happened, because a mutation that silently did not apply is a check
 * that reports green for the wrong reason — which is the failure mode this
 * whole section exists to rule out.
 */
function mutate(file, from, to) {
  const src = read(V2(file));
  const n = src.split(from).length - 1;
  assert.strictEqual(n, 1, 'mutation anchor appears ' + n + ' times in ' + file + ', expected 1');
  const out = {};
  out[file] = src.replace(from, to);
  return out;
}

async function mustFail(name, src, check) {
  let threw = null;
  const p = open(src ? { src: src, token: 'u-owner', rows: { users: [OWNER] } } : {});
  try { await check(p); } catch (e) { threw = e; }
  p.close();
  if (!threw) throw new Error('the mutant passed: ' + name);
}

test('MUTANT must fail: a screen calls Cache.load at script load again', async () => {
  await mustFail('store.js mounts at load',
    mutate('screens/store.js',
           "    root.Store = api;\n", "    root.Store = api;\n    mount();\n"),
    async (p) => {
      await p.run(0);
      assert.deepStrictEqual(p.rejections, [], 'the page load left an unhandled rejection');
      assert.deepStrictEqual(p.reads.filter((s) => s !== 'users' && s !== 'meta'), [],
        'a screen read a store before anybody signed in');
    });
});

test('MUTANT must fail: Shell.mount stops calling the outgoing screen\'s unmount', async () => {
  await mustFail('shell leaves the listener on',
    mutate('shell.js', '    leave(id);\n', ''),
    async (p) => {
      await p.run(0);
      await signIn(p, OWNER);
      const first = p.win.Shell._mounted();
      const before = p.removes();
      const other = screensOf(p.win, 'owner').filter((id) => id !== first)[0];
      p.win.Router.go(other);
      await p.run(200);
      assert(p.removes() > before, 'nothing was removed when ' + first + ' was left');
    });
});

test('MUTANT must fail: Shell.mount stops calling the incoming screen\'s mount', async () => {
  /* THE MUTATION IS IN `enter` ITSELF, not at one of its two call sites, and
   * the first draft of this check learnt why the hard way. Removing only the
   * call in the frame-REBUILD branch SURVIVES: `boot.js`'s coalesced redraw
   * calls `mount` again a moment later with an unchanged signature, and the
   * short-circuit branch has its own `enter(id)` which answers for it. Two
   * independent paths reach the screen, which is right in the app and a trap in
   * a mutant, so this one takes the function out from under both. The survivor
   * is recorded here rather than left out, because a mutant that lives is the
   * shape of the hole. */
  await mustFail('shell never mounts a screen',
    mutate('shell.js',
           "  function enter(id) {\n    if (id === null || mounted === id) return false;\n"
           + "    mounted = id;\n    hook(id, 'mount');\n    return true;\n  }",
           '  function enter(id) {\n    return !!id;\n  }'),
    async (p) => {
      await p.run(0);
      await signIn(p, OWNER);
      assert(p.win.Router.go('store'), 'could not reach Store');
      await p.run(200);
      /* The capture-phase SCROLL listener, because `store.js` and `reviews.js`
       * are the only things in v2 that install one on the document: no
       * foundation module does and the login does not, so one scroll listener
       * means Store's `mount()` ran and zero means the frame never called it.
       * Counting clicks instead would have been answered by the login's, the
       * photo viewer's and the frame's own — which is how the first draft of
       * this mutant survived. */
      assert.strictEqual(p.of('scroll').length, 1,
        'Store was never mounted: ' + p.of('scroll').length + ' scroll listener(s)');
      assert.strictEqual(p.win.Shell._mounted(), 'store', 'Store was never recorded as live');
    });
});

test('MUTANT must fail: a screen removes its capture-phase scroll listener without the phase', async () => {
  await mustFail('store forgets the capture phase',
    mutate('screens/store.js',
           "      d.removeEventListener('scroll', onScroll, true);",
           "      d.removeEventListener('scroll', onScroll);"),
    async (p) => {
      await p.run(0);
      await signIn(p, OWNER);
      p.win.Router.go('store');
      await p.run(200);
      assert(p.of('scroll').length > 0, 'store registered no scroll listener');
      p.win.Router.go('today');
      await p.run(200);
      assert.strictEqual(p.of('scroll').length, 0, 'store left a capture-phase listener behind');
    });
});

test('MUTANT must fail: gate\'s unmount stops clearing the hold timer', async () => {
  await mustFail('gate keeps its timer',
    mutate('screens/gate.js',
           '    if (timer !== null) { root.clearTimeout(timer); timer = null; }\n    ui.busId = null;',
           '    ui.busId = null;'),
    async (p) => {
      await p.run(0);
      await signIn(p, OWNER);
      p.win.Router.go('gate');
      await p.run(200);
      const live = () => p.timers.filter((t) => !t.dead && t.ms === p.win.Gate.HOLD_MS).length;
      p.listeners.filter((l) => l.type === 'pointerdown').forEach((l) => {
        try {
          l.fn({ target: { closest: (s) => (s.indexOf('data-hold') >= 0
                   ? { getAttribute: () => 'gc-1' } : null) }, preventDefault() {} });
        } catch (e) { /* no check to release in this fixture */ }
      });
      p.win.Router.go('today');
      await p.run(200);
      assert.strictEqual(live(), 0, 'a hold timer survived the screen');
    });
});

test('MUTANT must fail: mount(null) over a live session goes back to drawing the login', async () => {
  await mustFail('F7 comes back',
    mutate('shell.js',
           '    const s0 = state();\n    if (id === null && !(s0 && s0.user)) return signedOut();\n',
           '    if (id === null) return signedOut();\n'),
    async (p) => {
      await p.run(0);
      await signIn(p, OWNER);
      p.win.Shell.mount(null);
      assert.strictEqual(p.html.classList.contains('lg'), false,
        'the login was drawn over a live session');
    });
});

test('MUTANT must fail: the redraw drops the route params again', async () => {
  await mustFail('boot drops params',
    mutate('boot.js',
           'sh.mount(cur && cur.id ? cur.id : S.route, cur ? cur.params : null)',
           'sh.mount(cur && cur.id ? cur.id : S.route)'),
    async (p) => {
      await p.run(0);
      await signIn(p, OWNER);
      const seen = [];
      const real = p.win.Shell.mount;
      p.win.Shell.mount = function (id, params) { seen.push({ id: id, params: params }); return real(id, params); };
      p.win.Router.go('jobcard', { id: 'jc-7' });
      await p.run(200);
      // EVERY call, for the reason the positive case above now states at
      // length: the screen's own redraw re-supplies the params from the Router,
      // so the last call is right even when boot.js's is not.
      const dropped = seen.filter((s) => s.id === 'jobcard'
                                         && JSON.stringify(s.params) !== JSON.stringify({ id: 'jc-7' }));
      assert.deepStrictEqual(dropped.map((s) => String(s.params)), [],
        'some mount of the card arrived without its params');
    });
});

test('MUTANT must fail: a failed read is written back as an empty store and nothing else', async () => {
  const src = mutate('cache.js',
                     "        markUnread(n, 'read failed');\n", '');
  let threw = null;
  const p = open({ src: src, token: 'u-owner',
                   rows: { users: [OWNER], jobcards: 'throws' },
                   ls: { v2ReplicaFor: 'u-owner' },
                   info: { lastRev: 10, tableMax: 10, notStored: 0 } });
  try {
    await p.run(0);
    await signIn(p, OWNER);
    await p.win.Cache.load(['jobcards']);
    assert(p.win.Cache.isUnread('jobcards'), 'a failed read was not named');
    assert.strictEqual(p.win.Boot.replica().complete, false, 'the replica claimed to be complete');
  } catch (e) { threw = e; }
  p.close();
  if (!threw) throw new Error('the mutant passed: a failed read reads as empty');
});

test('MUTANT must fail: unread stops reaching the replica, so nothing is marked stale', async () => {
  const src = mutate('boot.js',
                     '    if (!held.length) return r;\n    return { behind: r.behind, complete: false };\n',
                     '    return r;\n');
  let threw = null;
  const p = open({ src: src, token: 'u-owner',
                   rows: { users: [OWNER], jobcards: 'throws' },
                   ls: { v2ReplicaFor: 'u-owner' },
                   info: { lastRev: 10, tableMax: 10, notStored: 0 } });
  try {
    await p.run(0);
    await signIn(p, OWNER);
    await p.win.Cache.load(['jobcards']);
    assert.strictEqual(p.win.Boot.replica().complete, false,
      'a store that could not be read left the replica claiming to be complete');
  } catch (e) { threw = e; }
  p.close();
  if (!threw) throw new Error('the mutant passed: unread does not reach the replica');
});

test('MUTANT must fail: the scope check is skipped, so the next person inherits the replica', async () => {
  const src = mutate('boot.js',
                     "const scoping = (ch && ch.scopeTo && S.user && S.user.id) ? ch.scopeTo(S.user.id) : null;",
                     'const scoping = null;');
  let threw = null;
  const p = open({ src: src, token: '', rows: OTHERS,
                   ls: { v2ReplicaFor: 'u-owner' },
                   info: { lastRev: 900, tableMax: 900, notStored: 0 } });
  try {
    await p.run(0);
    await signIn(p, CONDUCTOR);
    await p.run(200);
    assert.deepStrictEqual(p.rows('drivers'), [], 'drivers survived under the next person');
  } catch (e) { threw = e; }
  p.close();
  if (!threw) throw new Error('the mutant passed: REV-AUTH F1 is back');
});

test('MUTANT must fail: a sealed store is read anyway', async () => {
  const src = mutate('cache.js',
    '      if (sealed(n)) { markUnread(n, _unread[n] || UNKNOWN_SCOPE); continue; }\n', '');
  let threw = null;
  const p = open({ src: src, token: '', rows: OTHERS,
                   ls: { v2ReplicaFor: 'u-owner' },
                   info: { lastRev: 900, tableMax: 900, notStored: 0 },
                   pending: { gatechecks: ['g2'] } });
  try {
    await p.run(0);
    await signIn(p, CONDUCTOR);
    await p.win.Cache.load(['gatechecks']);
    assert.strictEqual(p.win.S.cache.gatechecks, undefined,
      'a sealed store was read into the next person\'s memory');
  } catch (e) { threw = e; }
  p.close();
  if (!threw) throw new Error('the mutant passed: a sealed store is read');
});

test('MUTANT must fail: the roster is purged with everything else', async () => {
  const src = mutate('cache.js',
                     "  const KEEP_THROUGH_REBUILD = ['users', 'outboxbase'];",
                     "  const KEEP_THROUGH_REBUILD = ['outboxbase'];");
  let threw = null;
  const p = open({ src: src, token: '', rows: OTHERS,
                   ls: { v2ReplicaFor: 'u-owner' },
                   info: { lastRev: 900, tableMax: 900, notStored: 0 } });
  try {
    await p.run(0);
    await signIn(p, CONDUCTOR);
    assert(p.rows('users').length, 'the login roster was purged: nobody can sign in offline');
  } catch (e) { threw = e; }
  p.close();
  if (!threw) throw new Error('the mutant passed: the roster can be purged');
});

/* ===================================================================================================
 * 11. MUTANTS FOR SECTION 10. Every read-side rule, broken on purpose.
 *
 * `mustFail` takes its own fixture here rather than section 9's bare owner page,
 * because every rule above needs rows on disk to be wrong about. Same contract:
 * ONE file replaced by a changed copy of itself, the replacement asserted to
 * have happened, nothing on disk touched.
 * =================================================================================================== */

async function mustFailOn(name, src, o, check) {
  let threw = null;
  const p = open(Object.assign({}, o, { src: src }));
  try { await check(p); } catch (e) { threw = e; }
  p.close();
  if (!threw) throw new Error('the mutant passed: ' + name);
}

test('MUTANT must fail: the Duty board goes back to its store list living inside retry()', async () => {
  await mustFailOn('duty does not read on mount',
    mutate('screens/duty.js', '    load();\n    var d = doc();', '    var d = doc();'),
    yard(CREWMGR),
    async (p) => {
      await p.run(0);
      await p.win.Boot.enter(CREWMGR);
      await p.run(300);
      assert(p.win.Router.go('duty'));
      await p.run(300);
      for (const n of ['nightlist', 'dutylog']) {
        assert(Array.isArray(p.win.S.cache[n]), n + ' is ' + typeof p.win.S.cache[n]);
      }
      const m = p.win.Duty.model({ role: 'crewmanager', cache: p.win.S.cache, params: null });
      assert.notStrictEqual(m.kind, 'loading', 'the board is still a skeleton');
    });
});

/* ONE MUTANT IS NOT HERE, AND THE REASON IS WORTH MORE THAN THE CHECK.
 *
 * Every `mount()` in this slice puts its `load()` above the screen's listener
 * guard, and the first version of that change said in nine comments that a read
 * below the guard "would happen on the first visit of a session and never
 * again". So a mutant was written to move `store.js`'s read back down — and it
 * SURVIVED. `Shell.mount` calls `unmount()` on the way out, every `unmount()`
 * in v2 clears its own guard (`store.js:1535`), so the guard is false again by
 * the next entry and a read below it runs exactly as often. The comments were
 * wrong and have been rewritten; the position is defence against a teardown
 * that is skipped or changed, not a fix for a live defect.
 *
 * The check is not kept in a weakened form. A mutant that cannot redden is the
 * decoration CLAUDE.md names, and leaving it green beside eleven real ones
 * would be worse than not having it: it would read as evidence for a claim that
 * had just been shown to be false. What the position actually buys has no
 * observable symptom today, so it gets a comment and no check.
 */

test('MUTANT must fail: Today stops reading, so the owner gets two of his four numbers again', async () => {
  await mustFailOn('today does not read on mount',
    mutate('screens/today.js', '    load();\n    var d = doc();', '    var d = doc();'),
    yard(OWNER),
    async (p) => {
      await p.run(0);
      await p.win.Boot.enter(OWNER);
      await p.run(300);
      const want = Array.prototype.slice.call(p.win.Today._stores());
      const missed = want.filter((n) => !Array.isArray(p.win.S.cache[n]));
      assert.deepStrictEqual(missed, [], 'unloaded: ' + missed.join(', '));
    });
});

test('MUTANT must fail: Money\'s Retry goes back to redrawing the same cache', async () => {
  await mustFailOn('money retry does not reload',
    mutate('screens/money.js', '  function retry() { load(); }',
           '  function retry() { redraw(); }'),
    yard(OWNER),
    async (p) => {
      await p.run(0);
      await p.win.Boot.enter(OWNER);
      await p.run(300);
      assert(p.win.Router.go('money'));
      await p.run(300);
      const asked = watchAsks(p);
      p.win.Money._retry();
      await p.run(300);
      const want = Array.prototype.slice.call(p.win.Money._stores());
      const missed = want.filter((n) => asked.indexOf(n) < 0);
      assert.deepStrictEqual(missed, [], 'Retry asked for none of ' + missed.join(', '));
    });
});

test('MUTANT must fail: Store discards its load promise again, so the shelf waits for a tick', async () => {
  await mustFailOn('store discards the promise',
    mutate('screens/store.js',
           "    return c.load(STORES).then(function () { loading = false; reread(); },\n                               function () { loading = false; });",
           '    c.load(STORES);\n    loading = false;\n    return null;'),
    yard(STOREMAN, { rows: { parts: [] } }),
    async (p) => {
      await p.run(0);
      await p.win.Boot.enter(STOREMAN);
      await p.run(300);
      assert(p.win.Router.go('store'));
      await p.run(300);
      await p.win.DB.put('parts', { id: 'p1', name: 'Brake Pad Set', unit: 'set', qty: 12,
                                    reorderLevel: 4, updatedAt: 2 });
      p.win.Store.mount();
      for (let i = 0; i < 60; i++) await flush();
      assert(/Brake Pad Set/.test(p.body()), 'the shelf did not fill on its own read');
    });
});

test('MUTANT must fail: the "0 parts" headline comes back', async () => {
  await mustFailOn('store headline reads 0 over an unread shelf',
    mutate('screens/store.js',
           "    var known = v.counts.parts != null;",
           '    var known = true;'),
    yard(STOREMAN),
    async (p) => {
      await p.run(0);
      const html = p.win.Store.render({ role: 'store', cache: {}, params: null, user: STOREMAN,
                                        replica: { behind: 0, complete: false }, stale: true,
                                        unread: [], offline: false });
      assert(!/\b0 parts\b/.test(html), 'the loading headline reads "0 parts"');
    });
});

test('MUTANT must fail: Attention builds a kind off stores it could not read', async () => {
  await mustFailOn('attention ignores unread',
    mutate('screens/attention.js',
           '      const missing = unreadableFor(k, rows, unreadSet);\n      if (missing.length) { skipped.push(k.key); continue; }\n',
           ''),
    yard(OWNER, { rows: { dutylog: 'throws' } }),
    async (p) => {
      await p.run(0);
      await p.win.Boot.enter(OWNER);
      await p.run(300);
      assert(p.win.Router.go('attention'));
      await p.run(300);
      assert(p.win.Cache.isUnread('dutylog'), 'the fixture should leave dutylog unread');
      const idx = p.win.Attention.index(p.win.S.cache, { id: 'u-owner', role: 'owner' },
                                        Date.now(), p.win.Cache.unread());
      assert.deepStrictEqual(seatIdsOf(idx), [], 'seat rows were invented off an unread dutylog');
    });
});

test('MUTANT must fail: Attention looks only at `undefined` and misses the failed read', async () => {
  /* THE HALF THAT SURVIVES A WEAKER CHECK, and the whole reason `unreadableFor`
   * reads two facts rather than one. `Cache.load` leaves `[]` behind a FAILED
   * read — not `undefined` — so a readability test that asks only whether the
   * store has a copy passes a store that could not be read, which is exactly
   * the state F4 was measured in. */
  await mustFailOn('attention tests undefined alone',
    mutate('screens/attention.js',
           "      if (rows && rows[n] !== undefined && !(unreadSet && unreadSet[n])) continue;",
           '      if (rows && rows[n] !== undefined) continue;'),
    yard(OWNER, { rows: { dutylog: 'throws' } }),
    async (p) => {
      await p.run(0);
      await p.win.Boot.enter(OWNER);
      await p.run(300);
      assert(p.win.Router.go('attention'));
      await p.run(300);
      assert(p.win.Cache.isUnread('dutylog'), 'the fixture should leave dutylog unread');
      const idx = p.win.Attention.index(p.win.S.cache, { id: 'u-owner', role: 'owner' },
                                        Date.now(), p.win.Cache.unread());
      assert.deepStrictEqual(seatIdsOf(idx), [], 'seat rows were invented off an unread dutylog');
    });
});

test('MUTANT must fail: lastSyncAt is seeded to the epoch again', async () => {
  await mustFailOn('lastSyncAt seeds to 0',
    mutate('sync.js',
           "  let lastSyncAt = (function () {\n    const raw = ls.getItem('lastSyncAt');\n    if (raw == null || raw === '') return null;\n    const n = parseInt(raw, 10);\n    return isFinite(n) && n > 0 ? n : null;\n  })();",
           "  let lastSyncAt = parseInt(ls.getItem('lastSyncAt') || '0', 10);"),
    { token: 'u-drv', rows: yardRows([DRIVER]), ls: {} },
    async (p) => {
      await p.run(0);
      assert.strictEqual(p.win.Sync.info().lastSyncAt, null,
        'a never-synced device reports ' + JSON.stringify(p.win.Sync.info().lastSyncAt));
    });
});

test('MUTANT must fail: Me tells a never-synced phone it holds n of n records', async () => {
  await mustFailOn('me draws n of n',
    mutate('screens/me.js',
           "      body += '<p class=\"photos-hint\">' + esc(behind > 0\n        ? fill('meHolds', group(held), group(held + behind))\n        : fill('meHoldsUnknown', group(held))) + '</p>';",
           "      body += '<p class=\"photos-hint\">' + esc(fill('meHolds', group(held), group(held + behind))) + '</p>';"),
    { token: 'u-drv', rows: yardRows([DRIVER]), ls: {},
      info: { lastRev: 0, tableMax: 0, notStored: 0, pending: 0, lastSyncAt: null } },
    async (p) => {
      await p.run(0);
      await p.win.Boot.enter(DRIVER);
      await p.run(300);
      const nOfN = /holds\s+([\d,]+)\s+of\s+([\d,]+)\s+records/.exec(p.body());
      assert.strictEqual(nOfN && nOfN[1] === nOfN[2] ? nOfN[0] : null, null,
        'Me reports "' + (nOfN && nOfN[0]) + '"');
    });
});

test('MUTANT must fail: Today goes back to calling an unread nightlist "not picked yet"', async () => {
  await mustFailOn('today conflates unloaded with unpicked',
    mutate('screens/today.js',
           "    if (!q.rows.nightlist || !q.rows.drivers) return loading('seats', say('cardEmptySeats'), q);\n",
           ''),
    yard(CREWMGR, { rows: { nightlist: 'throws' } }),
    async (p) => {
      await p.run(0);
      await p.win.Boot.enter(CREWMGR);
      await p.run(300);
      /* `nightlist` could not be read, so `Cache.load` left it `[]` — which
       * `tonight()` reads as "no record for tonight", which block 2 reads as
       * "nobody has picked". The honest answer is that this device does not
       * know, and the loading card says exactly that much. */
      assert(p.win.Cache.isUnread('nightlist'), 'the fixture should leave nightlist unread');
      assert(!/not picked yet/i.test(p.body()),
        'Today says tonight is not picked over a nightlist it could not read');
    });
});

/* =================================================================================================== */

(async () => {
  for (const c of cases) {
    try { await c.fn(); console.log('  ok  ' + c.name); }
    catch (e) { fail(c.name, e); }
  }
  console.log('──');
  if (fails) { console.log('❌ ' + fails + ' browser-path check(s) failed'); process.exit(1); }
  console.log('✅ the page loads, and a screen is live exactly while it is on it');
})();

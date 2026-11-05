/* Tests for v2/screens/duty.js — screen #9, the duty board. Run: node test_v2_duty.js
 *
 * At the repo ROOT and not in v2/, because scripts/run-tests.py auto-discovers
 * test_*.js at the root only and does not recurse: a test in v2/ would never run,
 * and a test nobody runs is not a test.
 *
 * WHAT THIS FILE IS FOR. One property, and every case below is a face of it:
 *
 *     THE COUNT ON THIS SCREEN MUST BE ABLE TO READ ZERO.
 *
 * v1's duty board counted buses that never needed a driver ("the duty board
 * counts buses that need a driver, not every bus in the yard", ba274f6) and
 * showed "67 buses need a driver" against 54 drivers. A count that cannot reach
 * zero teaches people to scroll past red, which is the defect the whole
 * Attention idea exists to avoid, so the checks here are written to go red if
 * the denominator drifts back to the fleet, if an un-tick stops counting, if a
 * seat that does not hold the count open starts holding it open, or if the zero
 * state goes back to being a counter that happens to say nought.
 *
 * The screen is loaded in a vm context holding a stub `window` and nothing else,
 * in the shape of test_v2_shell.js, and every assertion is on the markup STRING
 * that render() returns. That is why the screen keeps its DOM wiring in mount():
 * a screen whose rules can only be checked in a browser is a screen whose rules
 * are checked by nobody.
 */
process.env.TZ = process.env.TZ || 'UTC';   // nothing here may depend on the machine's zone

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const read = (p) => fs.readFileSync(p, 'utf8');
const V2 = (...p) => path.join(ROOT, 'v2', ...p);

let fails = 0;
const waiting = [];
const fail = (name, e) => {
  console.log(' FAIL ' + name + '\n        ' + String(e.message).split('\n').join('\n        '));
  fails++;
};
/* Async cases are collected and awaited at the end rather than run inline: the
 * three seat-write cases below have to await a fake IndexedDB, and a runner that
 * dropped a rejected promise would report a passing suite for a seat write that
 * threw — which is exactly the kind of check that passes either way. */
function test(name, fn) {
  let r;
  try { r = fn(); }
  catch (e) { fail(name, e); return; }
  if (r && typeof r.then === 'function') {
    waiting.push(r.then(() => console.log('  ok  ' + name), (e) => fail(name, e)));
    return;
  }
  console.log('  ok  ' + name);
}

/* ===================================================================================================
 * THE SANDBOX
 * =================================================================================================== */

const SRC = ['ui/icons.js', 'ui/words.js', 'ui/states.js', 'fmt.js', 'caps.js',
             'router.js', 'night.js', 'screens/duty.js'];

/* A stand-in for v2/db.js, faithful in the two ways seat() depends on: a missing
 * row reads as null, and every read and write is a CLONE, because IndexedDB
 * stores a copy. A fake that handed back the same object would let a seat write
 * that mutated a record in place pass here and clobber a colleague's seat in the
 * browser — which is precisely the bug 05 §4 row 26 is a workaround for. */
function fakeDB(seed) {
  const data = {};
  const clone = (o) => JSON.parse(JSON.stringify(o));
  Object.keys(seed || {}).forEach((store) => {
    data[store] = {};
    (seed[store] || []).forEach((r) => { data[store][r.id] = clone(r); });
  });
  return {
    writes: [],
    async get(store, id) {
      const v = (data[store] || {})[id];
      return v && !v._deleted ? clone(v) : null;
    },
    async all(store) { return Object.keys(data[store] || {}).map((k) => clone(data[store][k])); },
    async put(store, obj) {
      obj.updatedAt = Date.now();
      (data[store] || (data[store] = {}))[obj.id] = clone(obj);
      this.writes.push(store + '|' + obj.id);
      return obj;
    },
    _rawGet(store, id) { const v = (data[store] || {})[id]; return v ? clone(v) : null; },
    _rows(store) { return Object.keys(data[store] || {}).map((k) => clone(data[store][k])); },
    dirtySnapshot() { return new Set(); },
    clearDirty() {},
  };
}

/* A Date whose now() is the fixture's night.
 *
 * The screen asks `Night.dayKey(Date.now())` for tonight's key, as it must — the
 * server's _guard_write refuses a record whose `date` is not its id's suffix, so
 * the client may not compute a date itself. A fixture pinned to 4 November would
 * therefore pass only on 4 November. Pinning the clock instead keeps the real
 * code path and makes the suite answer the same on every day of the year. */
const RealDate = Date;
function fixedDate(t) {
  function D(a, b, c, d, e, f, g) {
    switch (arguments.length) {
      case 0: return new RealDate(t);
      case 1: return new RealDate(a);
      default: return new RealDate(a, b, c, d, e, f, g);
    }
  }
  D.prototype = RealDate.prototype;
  D.now = () => t;
  D.parse = RealDate.parse;
  D.UTC = RealDate.UTC;
  return D;
}

/* load(o) -> {win, Duty, db, toasts, clicks, changes, gone}
 *   o.lang    the document language, for the Hindi render
 *   o.db      the seed for the fake database
 */
function load(o) {
  o = o || {};
  const html = { lang: o.lang || 'en', getAttribute: () => null, setAttribute: () => {} };
  const toasts = [], sheets = [], clicks = [], changes = [], gone = [];
  const db = fakeDB(o.db);
  const sandbox = {
    navigator: { onLine: true, userAgent: 'node', language: 'en' },
    location: { href: 'http://localhost/v2/', pathname: '/v2/' },
    document: {
      documentElement: html,
      title: '',
      addEventListener: function (type, fn) {
        if (type === 'click') clicks.push(fn);
        if (type === 'change') changes.push(fn);
      },
      removeEventListener: function () {},
      getElementById: function () { return null; },
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; },
      createElement: function () { return { style: {}, setAttribute: function () {} }; },
      head: { appendChild: function () {} },
      body: null,
    },
    setTimeout: setTimeout, clearTimeout: clearTimeout,
    addEventListener: function () {}, removeEventListener: function () {},
    console: { warn: function () {}, error: function () {}, info: function () {}, log: function () {} },
    Date: fixedDate(o.now == null ? T : o.now),
    Math: Math,
    JSON: JSON,
    DB: db,
    V2: {
      openSheet: function (title, body) { sheets.push({ title: title, body: body }); return { dialog: true }; },
      closeSheet: function () {},
      toast: function (text, opts) { toasts.push({ text: text, kind: opts && opts.kind }); },
    },
    Cache: { load: function () { return Promise.resolve({}); }, sig: function () { return ''; } },
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  for (const f of SRC) vm.runInContext(read(V2(f)), ctx, { filename: V2(f) });
  // The real Router.go would need a Caps role; the screen only ever moves its
  // own params, so the move is recorded rather than performed.
  const realGo = sandbox.Router.go;
  sandbox.Router.go = function (id, params) { gone.push({ id: id, params: params }); return true; };
  sandbox.Router._realGo = realGo;
  return { win: sandbox, Duty: sandbox.Duty, db: db, toasts: toasts, sheets: sheets,
           clicks: clicks, changes: changes, gone: gone };
}

/* ===================================================================================================
 * THE FIXTURE — one night, in the shape the stores actually hold
 * =================================================================================================== */

const DATE = '2026-11-04';
// 19:00 IST on the night of the 4th. Night.dayKey's offset is fixed at +5:30 to
// match the server's _ist_day, so the fixture states the UTC instant and lets the
// module do the arithmetic rather than agreeing with it by hand.
const T = Date.UTC(2026, 10, 4, 13, 30);
const DAY = 86400000;

const bus = (n) => ({ id: 'b' + n, regNo: 'RJ09PA' + (6100 + n), routeLabel: 'Jaipur - Kota',
                      driverCrew: '', conductor: '' });
const crew = (id, name, role, slot, busId) => ({
  id: id, name: name, crewRole: role, status: 'active',
  driverSlot: slot == null ? null : slot, busId: busId == null ? null : busId,
});
const log = (id, at, crewId, crewName, role, busId, reason) => ({
  id: id, at: at, crewId: crewId, crewName: crewName, role: role,
  busId: busId, regNo: busId ? 'RJ09PA' + (6100 + Number(String(busId).slice(1))) : '',
  reason: reason || 'assign', by: 'u-mohan', updatedAt: at,
});

// A nightlist record: a MAP keyed by bus id, never a list. `at` and `by` are the
// server's stamps, written here as a pulled record would arrive.
function night(running, off) {
  const buses = {};
  (running || []).forEach((b) => { buses[b] = { running: true, at: T - 3600000, by: 'u-ramesh' }; });
  (off || []).forEach((b) => { buses[b] = { running: false, at: T - 3600000, by: 'u-ramesh' }; });
  return { id: 'nl-' + DATE, date: DATE, buses: buses, createdAt: T - 7200000, updatedAt: T - 3600000 };
}

/* The shell's model, which is what Shell.mount hands every screen's render(). */
function shell(o) {
  o = o || {};
  return {
    route: 'duty',
    params: o.params || null,
    role: o.role || 'supervisor',
    density: o.density || 'yard',
    user: { id: 'u-sup', role: o.role || 'supervisor', name: 'Mohan' },
    cache: o.cache || {},
    replica: { behind: 0, complete: o.complete !== false },
    stale: o.complete === false,
    offline: o.offline === true,
    now: o.now == null ? T : o.now,
  };
}

// 24 buses tonight, every seat filled: the shape the count has to read zero on.
function fullHouse() {
  const buses = [], drivers = [], dutylog = [];
  const ids = [];
  for (let i = 1; i <= 24; i++) {
    buses.push(bus(i));
    ids.push('b' + i);
    const d1 = 'c' + i + 'a', d2 = 'c' + i + 'b', cn = 'c' + i + 'c';
    drivers.push(crew(d1, 'Driver A' + i, 'driver', 1, 'b' + i));
    drivers.push(crew(d2, 'Driver B' + i, 'driver', 2, 'b' + i));
    drivers.push(crew(cn, 'Conductor ' + i, 'conductor', null, 'b' + i));
    dutylog.push(log('dl-1-' + i, T - 10 * DAY, d1, 'Driver A' + i, 'driver', 'b' + i));
    dutylog.push(log('dl-2-' + i, T - 10 * DAY, d2, 'Driver B' + i, 'driver', 'b' + i));
    dutylog.push(log('dl-3-' + i, T - 10 * DAY, cn, 'Conductor ' + i, 'conductor', 'b' + i));
  }
  return { cache: { nightlist: [night(ids)], buses: buses, drivers: drivers, dutylog: dutylog,
                    gatechecks: [] }, ids: ids };
}

/* ===================================================================================================
 * HELPERS THAT READ THE MARKUP
 * =================================================================================================== */

const count = (html, re) => (String(html).match(re) || []).length;

// Every `.v2row` element's own opening tag plus its contents up to the next row.
// Deliberately crude: it only has to be good enough to prove a figure's age note
// is not INSIDE a row, and a crude reader that over-reports would fail loudly.
function rows(html) {
  const out = [];
  const re = /<(div|button|label|a)\b[^>]*class="[^"]*\bv2row\b[^"]*"[^>]*>/g;
  let m, prev = null;
  while ((m = re.exec(html)) !== null) {
    if (prev) out.push(html.slice(prev.at, m.index));
    prev = { at: m.index };
  }
  if (prev) out.push(html.slice(prev.at));
  return out;
}

/* A click through the one delegated listener the screen installed. `closest` is
 * what the handler reads, so the target answers exactly the selectors named —
 * a target that answered everything would make every branch look alive. */
function clickOn(l, answers) {
  assert.strictEqual(l.clicks.length, 1, 'the screen must install exactly ONE delegated click listener');
  let prevented = false;
  const target = {
    closest: function (sel) {
      if (!Object.prototype.hasOwnProperty.call(answers, sel)) return null;
      const v = answers[sel];
      if (v === null) return null;
      return {
        getAttribute: function (k) {
          return Object.prototype.hasOwnProperty.call(v, k) ? v[k] : null;
        },
      };
    },
  };
  l.clicks[0]({ target: target, preventDefault: function () { prevented = true; } });
  return prevented;
}

/* ===================================================================================================
 * 1. THE SHAPE EVERY SCREEN SHARES
 * =================================================================================================== */

test('render(model) is a pure function returning a string, and model() is separable', () => {
  const l = load();
  assert.strictEqual(typeof l.Duty.render, 'function');
  assert.strictEqual(typeof l.Duty.model, 'function');
  assert.strictEqual(typeof l.Duty.seat, 'function');
  const f = fullHouse();
  const m = shell({ cache: f.cache });
  const a = l.Duty.render(m), b = l.Duty.render(m);
  assert.strictEqual(typeof a, 'string');
  assert.strictEqual(a, b, 'two renders of one model must be the same string');
});

test('the screen registers itself with the router under its own id', () => {
  const l = load();
  assert.strictEqual(l.win.Router.moduleFor('duty'), l.Duty);
});

test('the delegated listener returns early on a field BEFORE it reads data-act or data-nav', () => {
  const l = load();
  l.Duty.mount();
  /* One target that answers the field selector AND carries a data-act AND a
   * data-nav AND sits inside the screen, so the handler has every reason to act
   * on it except the one that must win. If the field test moved below the
   * data-act read, the checkbox in the pick list would throw the person off the
   * screen mid-entry — predeploy-gate.sh:508 and the sweep at :1073. */
  clickOn(l, {
    'input, select, textarea, label, .num': { },
    '[data-screen="duty"]': { 'data-screen': 'duty' },
    '[data-act]': { 'data-act': 'seat' },
    '[data-nav]': { 'data-nav': 'gate' },
  });
  assert.deepEqual(l.gone, [], 'a click on a field moved the route');
  assert.deepEqual(l.sheets, [], 'a click on a field opened a sheet');

  // …and the same target WITHOUT the field answer does act, so the case above
  // is proving an early return and not a handler that never worked.
  clickOn(l, {
    '[data-screen="duty"]': { 'data-screen': 'duty' },
    '[data-nav]': { 'data-nav': 'gate', 'data-check': 'gc-1' },
  });
  assert.strictEqual(l.gone.length, 1, 'the delegated listener does nothing at all');
});

/* ===================================================================================================
 * 2. THE COUNT — the reason this screen exists
 * =================================================================================================== */

test('the count reaches the ZERO SENTENCE when every running bus is crewed', () => {
  const l = load();
  const f = fullHouse();
  const html = l.Duty.render(shell({ cache: f.cache }));
  const m = l.Duty.model(shell({ cache: f.cache }));
  assert.strictEqual(m.total, 24, 'the denominator is tonight\'s picked buses');
  assert.strictEqual(m.need, 0, '24 buses with every seat filled still need somebody');
  assert(/Every bus tonight has a driver and a conductor/.test(html),
    'the zero state is a sentence, not a counter reading nought');
  assert(!/\b0 of 24\b/.test(html), 'a zero that still looks like a counter is still a counter');
  assert(/data-count="zero"/.test(html));
});

test('…and it does NOT reach zero while one seat that matters is empty', () => {
  const l = load();
  const f = fullHouse();
  // Take the conductor off bus 7: one dutylog append moving her to no bus, which
  // is what a seat being vacated actually looks like in an append-only store.
  f.cache.dutylog.push(log('dl-off-7', T - 3600000, 'c7c', 'Conductor 7', 'conductor', null, 'seat-taken'));
  const m = l.Duty.model(shell({ cache: f.cache }));
  const html = l.Duty.render(shell({ cache: f.cache }));
  assert.strictEqual(m.need, 1);
  assert(/1 of 24 buses still needs somebody/.test(html), html.slice(0, 400));
  assert(!/Every bus tonight has/.test(html));
});

test('the DENOMINATOR is tonight\'s picked buses and never the fleet (ba274f6)', () => {
  const l = load();
  const f = fullHouse();
  // 79 more buses in the yard that nobody picked for tonight. v1 counted these.
  for (let i = 25; i <= 103; i++) f.cache.buses.push(bus(i));
  const m = l.Duty.model(shell({ cache: f.cache }));
  const html = l.Duty.render(shell({ cache: f.cache }));
  assert.strictEqual(m.total, 24, 'the fleet leaked into the denominator');
  assert.strictEqual(m.buses.length, 24, 'the board drew a bus that does not run tonight');
  assert(!/ of 103 /.test(html), 'the fleet size reached the count');
  assert(!/RJ09PA6150/.test(html), 'a bus nobody picked for tonight was drawn');
  assert(/Every bus tonight has a driver and a conductor/.test(html));
});

test('a bus un-ticked for tonight leaves the count, and running:false is not the same as absent', () => {
  const l = load();
  const f = fullHouse();
  const rec = f.cache.nightlist[0];
  rec.buses.b7 = { running: false, at: T - 60000, by: 'u-ramesh' };   // somebody said no
  delete rec.buses.b8;                                                // nobody has said
  const m = l.Duty.model(shell({ cache: f.cache }));
  assert.strictEqual(m.total, 22, 'running:false or absent must both leave the denominator');
  assert(m.buses.every((b) => b.bus.id !== 'b7' && b.bus.id !== 'b8'));
});

test('a running entry is counted only on `=== true`, never on a truthy accident', () => {
  const l = load();
  const f = fullHouse();
  /* v2/night.js's own suite pins this on `Night.running`; the screen holds a
   * SECOND copy of the predicate because render() is synchronous and cannot
   * await a store read, so the second copy has to be pinned too. A truthy test
   * here would count a bus the server never agreed was running, and a count
   * built on a value nobody wrote is a count that cannot reach zero. */
  const rec = f.cache.nightlist[0];
  rec.buses.b7 = { running: 'no', at: T - 60000, by: 'u-ramesh' };
  rec.buses.b8 = { running: 1, at: T - 60000, by: 'u-ramesh' };
  const m = l.Duty.model(shell({ cache: f.cache }));
  assert.strictEqual(m.total, 22, 'a truthy non-true `running` was counted as running');
  // …and in the pick list those two are "somebody said no", not "nobody has said":
  // the entry exists, so silence is not what they are.
  const html = l.Duty.render(shell({ cache: f.cache, params: { entry: 1 } }));
  assert.strictEqual(count(html, /data-night="undecided"/g), 0);
  assert.strictEqual(count(html, /data-night="off"/g), 2);
});

test('zero buses picked reads a SENTENCE, not "0 of 0"', () => {
  const l = load();
  const f = fullHouse();
  // The holiday: a record saved with every bus un-ticked. A real and legal
  // answer (§4.6 empty (b)) and it must not look like a failure.
  const off = {};
  f.ids.forEach((b) => { off[b] = { running: false, at: T - 60000, by: 'u-ramesh' }; });
  f.cache.nightlist = [{ id: 'nl-' + DATE, date: DATE, buses: off, createdAt: T, updatedAt: T }];
  const html = l.Duty.render(shell({ cache: f.cache }));
  assert(!/0 of 0/.test(html), '"0 of 0" reads as a finished day with nothing in it');
  assert(/No buses run tonight/.test(html));
  assert(/data-count="none"/.test(html));
  // …and this one IS an empty state, unlike the first state in §4.2.
  assert(/class="state empty"/.test(html));
});

test('one bus tonight is written out in the singular, both ways', () => {
  const l = load();
  const cache = { nightlist: [night(['b1'])], buses: [bus(1)], drivers: [], dutylog: [], gatechecks: [] };
  assert(/1 bus tonight needs somebody/.test(l.Duty.render(shell({ cache: cache }))));
  const seated = {
    nightlist: [night(['b1'])], buses: [bus(1)], gatechecks: [],
    drivers: [crew('c1', 'Ramesh Kumar', 'driver', 1, 'b1'), crew('c2', 'Suresh', 'conductor', null, 'b1')],
    dutylog: [log('dl-a', T - DAY, 'c1', 'Ramesh Kumar', 'driver', 'b1'),
              log('dl-b', T - DAY, 'c2', 'Suresh', 'conductor', 'b1')],
  };
  assert(/The one bus tonight has a driver and a conductor/.test(l.Duty.render(shell({ cache: seated }))));
});

test('the relief seat does not hold the count open', () => {
  const l = load();
  const f = fullHouse();
  // Driver 2 is the relief driver on night and long routes, not a seat every bus
  // has. If an empty one counted, the count could never reach zero on a fleet
  // where most buses run one driver — which is ba274f6 with a new denominator.
  f.cache.dutylog = f.cache.dutylog.filter((r) => r.crewId.slice(-1) !== 'b');
  f.cache.drivers = f.cache.drivers.filter((r) => r.id.slice(-1) !== 'b');
  const m = l.Duty.model(shell({ cache: f.cache }));
  assert.strictEqual(m.need, 0, 'an empty relief seat held the count open');
  assert(m.buses.every((b) => b.seats.d2 === null), 'the fixture did not actually empty Driver 2');
});

/* ===================================================================================================
 * 3. THE ENTRY — the first state, which is not an empty state
 * =================================================================================================== */

test('with no record for tonight the screen shows the ENTRY, not an emptyState', () => {
  const l = load();
  const cache = { nightlist: [], buses: [bus(1), bus(2), bus(3)], drivers: [], dutylog: [], gatechecks: [] };
  const m = l.Duty.model(shell({ cache: cache }));
  const html = l.Duty.render(shell({ cache: cache }));
  assert.strictEqual(m.kind, 'entry');
  assert(!/class="state empty"/.test(html), 'a first state drawn as an empty state reads as a failure');
  assert(/Which buses run tonight\?/.test(html));
  assert(/data-act="save"/.test(html), 'the entry has no Save');
  assert.strictEqual(count(html, /type="checkbox"/g), 3, 'one checkbox per bus in the yard');
});

test('an unloaded cache is LOADING and is not the entry, and never draws a counter', () => {
  const l = load();
  const m = l.Duty.model(shell({ cache: {} }));            // nightlist undefined: not read yet
  const html = l.Duty.render(shell({ cache: {} }));
  assert.strictEqual(m.kind, 'loading');
  assert(!/0 of 0/.test(html), '"0 of 0" reads as a finished day');
  assert(/data-state="unknown"/.test(html), 'the count line is figure(null)');
  assert(/aria-busy="true"/.test(html), 'the list is a skeleton while it loads');
  assert(/role="tablist"/.test(html), 'the title and tabs draw first');
});

test('the pick list draws THREE visual states, each with its own word AND mark', () => {
  const l = load();
  const cache = {
    nightlist: [night(['b1'], ['b2'])],      // b1 runs, b2 does not, b3 undecided
    buses: [bus(1), bus(2), bus(3)], drivers: [], dutylog: [], gatechecks: [],
  };
  // Reopening the entry shows the saved ticks, so a second person ADDS rather
  // than replaces. That is also where the three states have to be visible.
  const html = l.Duty.render(shell({ cache: cache, params: { tab: 'tonight', entry: 1 } }));
  assert.strictEqual(count(html, /data-night="running"/g), 1);
  assert.strictEqual(count(html, /data-night="off"/g), 1);
  assert.strictEqual(count(html, /data-night="undecided"/g), 1);
  assert(/Somebody said this one does not run tonight/.test(html), 'a "no" that looks like silence');
  assert(/Nobody has said yet/.test(html), 'silence that looks like a "no"');
  assert.strictEqual(count(html, /checked/g), 1, 'only the running bus is ticked');
  // Three different marks, so the three states are not told apart by colour.
  const marks = (html.match(/data-night-mark="([a-z]+)"/g) || []).sort().join();
  assert.strictEqual(marks, 'data-night-mark="bus",data-night-mark="clock",data-night-mark="ok"', marks);
});

test('the entry becomes one row once the record exists, naming who saved it', () => {
  const l = load();
  const f = fullHouse();
  const html = l.Duty.render(shell({ cache: f.cache }));
  assert(/data-act="entry"/.test(html), 'the entry row is missing from the board');
  assert(/24 buses tonight/.test(html));
  assert(/Tap to change the list/.test(html));
});

test('"same as last night" is offered only when there IS a previous night', () => {
  const l = load();
  const base = { buses: [bus(1), bus(2)], drivers: [], dutylog: [], gatechecks: [] };
  const alone = Object.assign({ nightlist: [] }, base);
  assert(!/data-act="sameAsLast"/.test(l.Duty.render(shell({ cache: alone }))),
    'a control that would pre-tick nothing was drawn');
  const prev = { id: 'nl-2026-11-03', date: '2026-11-03',
                 buses: { b1: { running: true, at: T - DAY, by: 'u-ramesh' } },
                 createdAt: T - DAY, updatedAt: T - DAY };
  const withPrev = Object.assign({ nightlist: [prev] }, base);
  const html = l.Duty.render(shell({ cache: withPrev }));
  assert(/data-act="sameAsLast"/.test(html));
  assert(/Same 1 bus as last night/.test(html));
});

/* ===================================================================================================
 * 4. THE SEATS
 * =================================================================================================== */

test('the board draws a seat from the NEWEST dutylog row, not from buses', () => {
  const l = load();
  const b = bus(1);
  // The denormalised copy on `buses` says Stale Name, and `drivers` agrees with
  // it. dutylog, which is append-only, holds both appends and the newer one is
  // the truth: §4.6 "two people doing it at once" (b). This is a rule, not an
  // optimisation, so it is checked against a fixture where the two disagree.
  b.driverCrew = 'Stale Name';
  const cache = {
    nightlist: [night(['b1'])], buses: [b], gatechecks: [],
    drivers: [crew('c1', 'Stale Name', 'driver', 1, 'b1'), crew('c2', 'Newer Name', 'driver', 1, 'b1')],
    dutylog: [log('dl-old', T - 7200000, 'c1', 'Stale Name', 'driver', 'b1'),
              log('dl-new', T - 60000, 'c2', 'Newer Name', 'driver', 'b1', 'seat-taken')],
  };
  const m = l.Duty.model(shell({ cache: cache }));
  const html = l.Duty.render(shell({ cache: cache }));
  assert.strictEqual(m.buses[0].seats.d1.crewId, 'c2', 'the board read the denormalised copy');
  assert(/Newer Name/.test(html));
  assert(!/Stale Name/.test(html), 'the stale denormalised name reached the screen');
});

test('a person moved to another bus no longer holds the seat on the old one', () => {
  const l = load();
  const cache = {
    nightlist: [night(['b1', 'b2'])], buses: [bus(1), bus(2)], gatechecks: [],
    drivers: [crew('c1', 'Ramesh Kumar', 'driver', 1, 'b2')],
    dutylog: [log('dl-a', T - 7200000, 'c1', 'Ramesh Kumar', 'driver', 'b1'),
              log('dl-b', T - 60000, 'c1', 'Ramesh Kumar', 'driver', 'b2', 'seat-taken')],
  };
  const m = l.Duty.model(shell({ cache: cache }));
  const one = m.buses.filter((x) => x.bus.id === 'b1')[0];
  const two = m.buses.filter((x) => x.bus.id === 'b2')[0];
  assert.strictEqual(one.seats.d1, null, 'the old bus kept a driver who left it');
  assert(two.seats.d1 && two.seats.d1.crewId === 'c1');
});

test('filling the conductor seat leaves Driver 1 and Driver 2 BYTE-IDENTICAL (05 §4 row 26)', async () => {
  // The training manual currently tells the user that if a bus "looks like it
  // lost its driver after you assigned a conductor, that is a fault, tell the
  // office". This is the check that stops that shipping again.
  const l = load({ db: {
    buses: [Object.assign(bus(1), { driverCrew: 'Ramesh Kumar', conductor: '' })],
    drivers: [crew('c1', 'Ramesh Kumar', 'driver', 1, 'b1'),
              crew('c2', 'Suresh Meena', 'driver', 2, 'b1'),
              crew('c3', 'Kailash', 'conductor', null, null)],
    dutylog: [],
  } });
  const before = {
    d1: JSON.stringify(l.db._rawGet('drivers', 'c1')),
    d2: JSON.stringify(l.db._rawGet('drivers', 'c2')),
  };
  const ok = await l.Duty.seat('b1', 'conductor', 'c3');
  assert.strictEqual(ok, true, 'the seat write refused');
  assert.strictEqual(JSON.stringify(l.db._rawGet('drivers', 'c1')), before.d1, 'Driver 1 changed');
  assert.strictEqual(JSON.stringify(l.db._rawGet('drivers', 'c2')), before.d2, 'Driver 2 changed');
  // …and the bus's own denormalised driver field is left alone too, because the
  // same bug had a second home there.
  assert.strictEqual(l.db._rawGet('buses', 'b1').driverCrew, 'Ramesh Kumar');
  assert.strictEqual(l.db._rawGet('buses', 'b1').conductor, 'Kailash');
  // One append per seat change, and it carries a real time and no `by`: the
  // server forces `by` from the token (04 §4.4) and refuses a client's.
  const appended = l.db._rows('dutylog');
  assert.strictEqual(appended.length, 1);
  assert.strictEqual(appended[0].crewId, 'c3');
  assert.strictEqual(appended[0].role, 'conductor');
  assert.strictEqual(appended[0].busId, 'b1');
  assert(appended[0].at > 0, 'the duty log needs a real time');
  assert(!('by' in appended[0]), 'the client stamped `by`, which the server forces from the token');
});

test('a seat write names the seat it is taking over and never clears the other driver', async () => {
  const l = load({ db: {
    buses: [Object.assign(bus(1), { driverCrew: 'Ramesh Kumar' })],
    drivers: [crew('c1', 'Ramesh Kumar', 'driver', 1, 'b1'),
              crew('c2', 'Suresh Meena', 'driver', 2, 'b1'),
              crew('c4', 'Mahesh', 'driver', null, null)],
    // The incumbents' own appends. A seated driver with no duty-log row cannot
    // exist on a real device — the board reads the seat from this store — and a
    // fixture that pretended otherwise would test the wrong branch.
    dutylog: [log('dl-1', T - 2 * DAY, 'c1', 'Ramesh Kumar', 'driver', 'b1'),
              log('dl-2', T - 2 * DAY, 'c2', 'Suresh Meena', 'driver', 'b1')],
  } });
  const d2 = JSON.stringify(l.db._rawGet('drivers', 'c2'));
  await l.Duty.seat('b1', 1, 'c4');
  assert.strictEqual(JSON.stringify(l.db._rawGet('drivers', 'c2')), d2, 'slot 2 was cleared by a slot 1 write');
  assert.strictEqual(l.db._rawGet('drivers', 'c4').driverSlot, 1);
  assert.strictEqual(l.db._rawGet('drivers', 'c4').busId, 'b1');
  // The append-only store still holds the incumbents' rows; the new one is the
  // append, and it says a seat changed hands rather than that one was filled.
  const mine = l.db._rows('dutylog').filter((r) => r.crewId === 'c4');
  assert.strictEqual(mine.length, 1, 'one append per seat change');
  assert.strictEqual(mine[0].reason, 'seat-taken', 'taking an occupied seat is a seat-taken append');
  assert.strictEqual(l.db._rows('dutylog').length, 3, 'an append-only store lost a row');
});

test('a failed seat write says what is still true and leaves the seat empty', async () => {
  const l = load({ db: { buses: [bus(1)], drivers: [crew('c3', 'Kailash', 'conductor', null, null)], dutylog: [] } });
  l.win.DB.put = function () { return Promise.reject(new Error('quota')); };
  const ok = await l.Duty.seat('b1', 'conductor', 'c3');
  assert.strictEqual(ok, false);
  assert.strictEqual(l.toasts.length, 1);
  assert.strictEqual(l.toasts[0].kind, 'bad');
  assert(/Not saved\. Nobody was put on that seat\./.test(l.toasts[0].text),
    'an optimistic name that disappears on the next draw');
});

test('the seat sheet draws a person seated elsewhere unpressable, with the reason', () => {
  const l = load();
  const cache = {
    nightlist: [night(['b1', 'b2'])], buses: [bus(1), bus(2)], gatechecks: [],
    drivers: [crew('c1', 'Ramesh Kumar', 'driver', 1, 'b2'), crew('c9', 'Mahesh', 'driver', null, null)],
    dutylog: [log('dl-a', T - DAY, 'c1', 'Ramesh Kumar', 'driver', 'b2')],
  };
  const html = l.Duty.seatSheet(shell({ cache: cache }), 'b1', 1);
  assert(/Mahesh/.test(html) && /Ramesh Kumar/.test(html));
  // The free one is pressable; the seated one is drawn and is not, so the reader
  // can see WHY somebody is not offered rather than wondering where they went.
  assert.strictEqual(count(html, /<button[^>]*data-act="pick"/g), 1);
  assert(/On RJ09PA6102 as Driver 1/.test(html), html);
});

/* ===================================================================================================
 * 5. THE GATE STATE — words, never a pressable thing (DECISIONS.md §15)
 * =================================================================================================== */

const gc = (busId, status, extra) => Object.assign({
  id: 'gc-' + busId + '-' + status, busId: busId, regNo: 'RJ09PA6101', date: DATE,
  driverId: 'c1', driverName: 'Ramesh Kumar', startedAt: T - 3600000, status: status, items: {},
}, extra || {});

test('all six gate states draw a mark AND a word, and NOT ONE of them is pressable', () => {
  const l = load();
  const states = ['open', 'awaiting', 'released', 'approved', 'held'];
  const buses = [bus(1)], ids = ['b1'], checks = [];
  states.forEach((s, i) => {
    buses.push(bus(i + 2));
    ids.push('b' + (i + 2));
    checks.push(gc('b' + (i + 2), s, { items: { ac: { ok: true }, tyres: { ok: false } } }));
  });
  const cache = { nightlist: [night(ids)], buses: buses, drivers: [], dutylog: [], gatechecks: checks };
  const html = l.Duty.render(shell({ cache: cache, role: 'supervisor' }));
  // b1 has no check at all: the sixth state.
  ['none', 'open', 'awaiting', 'released', 'approved', 'held'].forEach((s) => {
    assert.strictEqual(count(html, new RegExp('data-gate="' + s + '"', 'g')), 1, 'gate state ' + s);
  });
  assert.strictEqual(count(html, /<button[^>]*data-gate=/g), 0,
    'the gate became pressable here, and the two counts empty at different hours (DECISIONS.md §15)');
  assert.strictEqual(count(html, /data-act="gate"/g), 0, 'the departure check is screen #13\'s');
  // Never colour alone: a mark per state, and a word per state.
  assert.strictEqual(count(html, /data-gate-mark=/g), 6);
  [/Not checked out yet/, /Check started/, /Waiting for a decision/, /Released/,
   /Allowed out/, /Held/].forEach((re) => assert(re.test(html), 'no word for ' + re));
});

test('the gate words are drawn for a crew manager too — the press is the capability, the sentence is not', () => {
  const l = load();
  const cache = { nightlist: [night(['b1'])], buses: [bus(1)], drivers: [], dutylog: [],
                  gatechecks: [gc('b1', 'released')] };
  const html = l.Duty.render(shell({ cache: cache, role: 'crewmanager' }));
  assert(/data-gate="released"/.test(html), 'a state the crew manager may read was hidden');
  assert.strictEqual(count(html, /<button[^>]*data-gate=/g), 0);
});

test('offline, the gate never claims a bus has not been checked — only not on THIS phone', () => {
  const l = load();
  const cache = { nightlist: [night(['b1'])], buses: [bus(1)], drivers: [], dutylog: [], gatechecks: [] };
  const html = l.Duty.render(shell({ cache: cache, offline: true }));
  assert(/Not checked on this phone yet/.test(html),
    'another supervisor may already have released that bus');
  assert(!/Not checked out yet/.test(html));
  assert(/No connection/.test(html), 'the count line must say the board may be out of date');
});

/* ===================================================================================================
 * 6. NO PERMISSION — a row a person may not act on is not drawn
 * =================================================================================================== */

test('without assignDriver the seats, the Change buttons and the entry are ABSENT, not disabled', () => {
  const l = load();
  // The hypothetical holder of gateCheck and not assignDriver: he sees tonight's
  // buses and their gate states and no seats (§4.6 "no permission").
  l.win.Caps.can = (role, cap) => cap === 'gateCheck';
  const f = fullHouse();
  const html = l.Duty.render(shell({ cache: f.cache }));
  assert.strictEqual(count(html, /data-act="seat"/g), 0, 'a seat control was drawn for a reader who may not use it');
  assert.strictEqual(count(html, /data-act="entry"/g), 0);
  assert.strictEqual(count(html, /aria-disabled/g), 0, 'a control they may not use is absent, never disabled');
  assert(/data-gate="none"/.test(html), 'the gate words went with the seats');
});

test('the lookup\'s link into the gate round is absent without gateCheck (01 §1.3)', () => {
  const l = load();
  const cache = { nightlist: [night(['b1'])], buses: [bus(1)], drivers: [], gatechecks: [gc('b1', 'released')],
                  dutylog: [log('dl-a', T - 3600000, 'c1', 'Ramesh Kumar', 'driver', 'b1')] };
  const params = { tab: 'lookup', bus: 'b1', date: DATE };
  l.win.Caps.can = (role, cap) => cap === 'assignDriver';
  const crewman = l.Duty.render(shell({ cache: cache, role: 'crewmanager', params: params }));
  assert.strictEqual(count(crewman, /data-nav="gate"/g), 0,
    'the duty lookup linked a crew manager into a screen needing a capability they do not hold');
  l.win.Caps.can = () => true;
  const sup = l.Duty.render(shell({ cache: cache, role: 'supervisor', params: params }));
  assert.strictEqual(count(sup, /data-nav="gate"/g), 1);
});

/* ===================================================================================================
 * 7. THE LOOKUP
 * =================================================================================================== */

test('the lookup lists the duty log newest first, unpressable, and names the horizon when empty', () => {
  const l = load();
  const cache = {
    nightlist: [night(['b1'])], buses: [bus(1), bus(2)], drivers: [], gatechecks: [],
    dutylog: [log('dl-a', Date.UTC(2026, 10, 4, 12, 52), 'c1', 'Ramesh Kumar', 'driver', 'b1'),
              log('dl-b', Date.UTC(2026, 10, 4, 13, 10), 'c2', 'Suresh Meena', 'conductor', 'b1')],
  };
  const html = l.Duty.render(shell({ cache: cache, params: { tab: 'lookup', bus: 'b1', date: DATE } }));
  assert(html.indexOf('Suresh Meena') < html.indexOf('Ramesh Kumar'), 'the log is not newest first');
  assert.strictEqual(count(html, /<button[^>]*data-log/g), 0, 'this is a record, not a route');
  assert(/18:22/.test(html), 'the time is the office\'s own, at the server\'s fixed +5:30');
  const none = l.Duty.render(shell({ cache: cache, params: { tab: 'lookup', bus: 'b2', date: DATE } }));
  assert(/Nobody was recorded on that bus that day/.test(none));
  assert(/The duty log starts on 2026-11-04/.test(none), 'the horizon is not named, so "nobody" reads as "ran empty"');
});

test('Show is aria-disabled until a bus and a date are both chosen', () => {
  const l = load();
  const cache = { nightlist: [night(['b1'])], buses: [bus(1)], drivers: [], dutylog: [], gatechecks: [] };
  const bare = l.Duty.render(shell({ cache: cache, params: { tab: 'lookup' } }));
  assert(/data-act="show"[^>]*aria-disabled="true"|aria-disabled="true"[^>]*data-act="show"/.test(bare));
  const both = l.Duty.render(shell({ cache: cache, params: { tab: 'lookup', bus: 'b1', date: DATE } }));
  assert(!/data-act="show"[^>]*aria-disabled="true"|aria-disabled="true"[^>]*data-act="show"/.test(both));
});

/* ===================================================================================================
 * 8. THE FOUR RULES EVERY SCREEN BRIEF CARRIES
 * =================================================================================================== */

test('no `at` on a figure inside a row: not one .v2row holds a .figure-note', () => {
  const l = load();
  const f = fullHouse();
  [shell({ cache: f.cache }),
   shell({ cache: f.cache, density: 'desk' }),
   shell({ cache: f.cache, params: { tab: 'lookup', bus: 'b1', date: DATE } }),
   shell({ cache: { nightlist: [], buses: f.cache.buses, drivers: [], dutylog: [], gatechecks: [] } }),
  ].forEach((m, i) => {
    const bad = rows(l.Duty.render(m)).filter((r) => /figure-note/.test(r));
    assert.strictEqual(bad.length, 0,
      'model ' + i + ': a figure note inside a row triples the row height and runs ageWords() per row');
  });
});

test('a row holding a form control is div.v2row or label.v2row, never button.v2row', () => {
  const l = load();
  const cache = { nightlist: [], buses: [bus(1), bus(2)], drivers: [], dutylog: [], gatechecks: [] };
  const html = l.Duty.render(shell({ cache: cache }));
  const bad = /<button[^>]*class="[^"]*v2row[^"]*"[^>]*>(?:(?!<\/button>)[\s\S])*?<input/.test(html);
  assert(!bad, 'a count field inside a pressable row threw the storekeeper off the screen mid-count');
  assert(/<label[^>]*class="[^"]*v2row/.test(html), 'the whole row must be the label for its checkbox');
});

test('the partial replica never draws an aggregate as final', () => {
  const l = load();
  const f = fullHouse();
  const html = l.Duty.render(shell({ cache: f.cache, complete: false }));
  assert(/data-replica="partial"/.test(html), 'a partial aggregate drawn as final (2170703)');
});

test('the board caps at 200 cards and says what it is not showing', () => {
  const l = load();
  const buses = [], ids = [];
  for (let i = 1; i <= 240; i++) { buses.push(bus(i)); ids.push('b' + i); }
  const cache = { nightlist: [night(ids)], buses: buses, drivers: [], dutylog: [], gatechecks: [] };
  const m = l.Duty.model(shell({ cache: cache }));
  const html = l.Duty.render(shell({ cache: cache }));
  assert.strictEqual(m.buses.length, 200);
  // …and it does NOT say "newest first", which is only true of the lookup: the
  // board is ordered by the buses that still need somebody, so a reader told
  // these 200 were the newest would draw the wrong conclusion from the 40 missing.
  assert(/200 of 240 shown/.test(html));
  assert(!/newest first/.test(html));
});

test('the lookup\'s remainder line DOES say newest first, because its order is time', () => {
  const l = load();
  const rows = [];
  for (let i = 0; i < 240; i++) {
    rows.push(log('dl-' + i, Date.UTC(2026, 10, 4, 10, 0) + i * 1000, 'c' + i, 'Crew ' + i, 'driver', 'b1'));
  }
  const cache = { nightlist: [night(['b1'])], buses: [bus(1)], drivers: [], dutylog: rows, gatechecks: [] };
  const html = l.Duty.render(shell({ cache: cache, params: { tab: 'lookup', bus: 'b1', date: DATE } }));
  assert(/200 of 240 shown, newest first/.test(html));
});

/* ===================================================================================================
 * 9. HINDI
 * =================================================================================================== */

test('every label this screen draws goes through the word table', () => {
  const l = load({ lang: 'hi' });
  const f = fullHouse();
  const html = l.Duty.render(shell({ cache: f.cache }));
  // No Hindi is written yet, so every id is pending — and a pending label draws
  // its English WITH ITS ID. That mark on every sentence is the proof that the
  // sentence came from the table rather than from the source.
  const sentences = ['Every bus tonight has a driver and a conductor [dtCountZero]',
                     'Driver 1', 'Conductor'];
  assert(/\[dtCountZero\]/.test(html), sentences[0] + ' did not come from the table');
  assert(/\[dtSeatDriver1\]/.test(html), 'the seat labels did not come from the table');
  assert(/\[dtGateNone\]/.test(html), 'the gate words did not come from the table');
});

/* =================================================================================================== */

Promise.all(waiting).then(() => {
  console.log('──');
  if (fails) { console.log('❌ ' + fails + ' duty board check(s) failed'); process.exit(1); }
  console.log('✅ the duty board\'s count can reach zero');
});

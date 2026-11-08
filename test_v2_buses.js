/* Tests for v2/screens/buses.js — screen #5, Buses. Run: node test_v2_buses.js
 *
 * At the repo ROOT and not in v2/, because scripts/run-tests.py auto-discovers
 * test_*.js at the root only and does not recurse: a test in v2/ would never
 * run, and a test nobody runs is not a test.
 *
 * WHAT THIS FILE IS FOR. Three properties, and every case below is a face of
 * one of them:
 *
 *   1. BUSES DOES NOT COMPUTE THE COST. v1 had five per-bus cost bases and they
 *      disagreed, so people stopped reading all five. `Cost.forBus` is the one
 *      basis and it is Money's. §A reads this screen's own source with comments
 *      and strings stripped and fails on a money identifier beside an
 *      arithmetic operator; §B hands the screen a Cost whose total is a number
 *      no sum of its parts could produce and asserts the screen draws THAT
 *      number — which only a screen that reads can do.
 *
 *   2. THERE IS NO PER-KM FIGURE ON THIS SCREEN AT ALL. 8db78e7: a per-km
 *      figure divided by a missing odometer read ₹45,000 of work as ₹45,000 per
 *      kilometre, topped the money-pit list, and sent the owner to inspect a
 *      healthy bus. §A greps for it in the source and §C greps for it in the
 *      markup, because per km has two homes and this is neither of them.
 *
 *   3. THE SEED'S ZEROES READ AS UNKNOWN. 0 of 89 bundled buses have a
 *      document, an odometer reading above zero, a last service, or a company
 *      and model. §C draws the fresh-device bus and requires eight em dashes
 *      with eight different sentences, and NOT ONE ZERO and NOT ONE red mark. A
 *      count that cannot reach zero is 5eb8c6e and ba274f6, and both of those
 *      numbers came off this screen.
 *
 * The screen is loaded in a vm context holding a stub `window` and nothing
 * else, in the shape of test_v2_duty.js, and every assertion is on the markup
 * STRING render() returns. That is why the screen keeps its DOM wiring in
 * mount(): a screen whose rules can only be checked in a browser is a screen
 * whose rules are checked by nobody.
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

const SRC = ['ui/icons.js', 'ui/words.js', 'ui/states.js', 'ui/photos.js', 'fmt.js', 'odo.js',
             'cost.js', 'caps.js', 'router.js', 'screens/buses.js'];

const SCREEN = read(V2('screens', 'buses.js'));

/* A Date whose now() is the fixture's afternoon, so a paper that expires in
 * nine days expires in nine days on every day of the year. */
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

const T = Date.UTC(2026, 10, 6, 8, 0);      // 6 November 2026
const DAY = 86400000;

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
    async _rawAll(store) { return Object.keys(data[store] || {}).map((k) => clone(data[store][k])); },
    async put(store, obj) {
      (data[store] || (data[store] = {}))[obj.id] = clone(obj);
      this.writes.push({ store, obj: clone(obj) });
      return obj;
    },
    _rows(store) { return Object.keys(data[store] || {}).map((k) => clone(data[store][k])); },
    dirtySnapshot() { return new Set(); },
    clearDirty() {},
  };
}

/* load(o) -> {win, Buses, db, clicks, inputs, sheets, confirms, toasts, gone} */
function load(o) {
  o = o || {};
  const html = { lang: o.lang || 'en', getAttribute: () => null, setAttribute: () => {} };
  const clicks = [], inputs = [], sheets = [], confirms = [], toasts = [], gone = [];
  const db = fakeDB(o.db);
  const sandbox = {
    navigator: { onLine: true, userAgent: 'node', language: 'en' },
    location: { href: 'http://localhost/v2/', pathname: '/v2/' },
    document: {
      documentElement: html,
      title: '',
      addEventListener(type, fn) {
        if (type === 'click') clicks.push(fn);
        if (type === 'input') inputs.push(fn);
      },
      removeEventListener() {},
      getElementById: () => null,
      querySelector: () => (o.form || null),
      querySelectorAll: () => [],
      createElement: () => ({ style: {}, setAttribute() {} }),
      head: { appendChild() {} },
      body: null,
    },
    setTimeout, clearTimeout,
    addEventListener() {}, removeEventListener() {},
    console: { warn() {}, error() {}, info() {}, log() {} },
    Date: fixedDate(o.now == null ? T : o.now),
    Math, JSON,
    DB: db,
    V2: {
      openSheet(title, body) { sheets.push({ title, body }); return { dialog: true }; },
      closeSheet() {},
      confirmDialog(text) { confirms.push(text); return Promise.resolve(o.confirm === true); },
      toast(text, opts) { toasts.push({ text, kind: opts && opts.kind }); },
    },
    Cache: { load: () => Promise.resolve({}), sig: () => '' },
    /* A sync that HAS a last-sync time, and that matters. Without one every
     * `at` this screen passes is null, `figure()` draws no age note at all, and
     * G5's "no `at` inside a row" could not fail however the rows were written
     * — the mutation proved it was decoration. A real timestamp is what makes
     * that check a tripwire. */
    Sync: { info: () => ({ lastSyncAt: (o.now == null ? T : o.now) - 20 * 60000,
                           lastRev: 1, tableMax: 1, notStored: 0 }) },
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  /* `o.src` replaces buses.js with a changed copy of itself, which is the
   * mutation seam A9's two mutants need: the memo and the filter order are
   * both invisible in the markup, so the only way to show their checks can
   * fail is to load the screen without them. */
  for (const f of SRC) {
    const src = (o.src && f === 'screens/buses.js') ? o.src : read(V2(f));
    vm.runInContext(src, ctx, { filename: V2(f) });
  }
  /* THE SHELL MOUNTS THE SCREEN, so the suite does too.
   *
   * Until INTEGRATION-NOTES 17 was fixed, `buses.js` called its own `mount()`
   * at script load and this loader relied on that: the listener was simply
   * there. That load-time call WAS the defect — a listener installed before
   * `boot.js` had created `S`, and never removed for the whole session — so
   * `Shell.mount` now calls `mount()` on the way in and `unmount()` on the way
   * out, and a screen's load registers and nothing more. This line stands where
   * the frame's call stands. The checks below are unchanged. */
  if (sandbox.Buses && typeof sandbox.Buses.mount === 'function') sandbox.Buses.mount();
  sandbox.Router.go = function (id, params) { gone.push({ id, params }); return true; };
  sandbox.S = { user: o.user || null, cache: o.cache || {}, route: null, stack: [] };
  return { win: sandbox, Buses: sandbox.Buses, db, clicks, inputs, sheets, confirms, toasts, gone };
}

/* The shell's model, which is what Shell.mount hands every screen's render(). */
function shell(o) {
  o = o || {};
  return {
    route: 'buses',
    params: o.params === undefined ? null : o.params,
    role: o.role || 'owner',
    density: o.density || 'yard',
    user: o.user === undefined ? { id: 'u-own', role: o.role || 'owner', name: 'Owner' } : o.user,
    cache: o.cache || {},
    replica: { behind: 0, complete: o.complete !== false },
    stale: o.complete === false,
    offline: o.offline === true,
  };
}

/* ===================================================================================================
 * THE FIXTURES — the bundled seed's shape first, because that is what a fresh
 * device actually draws for minutes on an office PC.
 * =================================================================================================== */

/* A seeded bus, exactly as seed-data.js leaves it: the keys that are ABSENT are
 * absent (lastServiceOdo, lastServiceDate, odometerAt), `odometer` is 0 and
 * `company`/`model`/`chassis`/`engine` are empty strings. */
function seedBus(n) {
  return {
    id: 'bus-RJ09PA' + (6100 + n), regNo: 'RJ09PA' + (6100 + n),
    company: '', model: '', chassis: '', engine: '',
    odometer: 0, serviceIntervalKm: 10000, docs: [], photos: [],
    source: 'route-import', updatedAt: 1,
  };
}

// The stores a fresh device holds: present and empty, which is "I asked and
// there are none" — NOT absent, which is "nobody has looked".
function freshCache(buses) {
  return {
    buses: buses, challans: [], jobcards: [], driverreports: [], reportai: [],
    components: [], drivers: [], dutylog: [], gpsevents: [],
    fuel: [], def: [], ledger: [], trips: [], incidents: [],
    meta: [{ key: 'garage', labourRate: 250 }],
  };
}

const esc = (s) => String(s);
const count = (html, re) => (String(html).match(re) || []).length;

/* Every `.v2row` element's own opening tag plus its contents up to the next
 * row. Deliberately crude: it only has to be good enough to prove a figure's
 * age note is not INSIDE a row, and a crude reader that over-reports fails
 * loudly rather than quietly. */
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

/* The source with comments, string literals AND regex literals blanked, line
 * numbers kept, so a check about CODE cannot be tripped by prose about itself.
 *
 * This is check-floor.py's lesson, in JS: its first version reported three
 * violations in ui/ that were all comments saying "no oklch(), no color-mix()",
 * and a checker that cannot tell a property from prose about it blocks honest
 * work and teaches people to delete checks.
 *
 * REGEX LITERALS ARE BLANKED TOO, and that is not fussiness. `esc()` contains
 * `.replace(/'/g, '&#39;')`: a scanner that knows only strings reads that
 * apostrophe as the start of one, and every quote after it is inverted — which
 * silently blanked HALF THIS FILE the first time, and the §A checks all passed
 * by looking at nothing. A regex start is a `/` whose previous non-space
 * character is one that cannot end an expression, which is sound here because
 * §A6 separately proves this file contains no division at all. */
function codeOnly(src) {
  const out = src.split('');
  const n = src.length;
  const BEFORE_RE = '(,=:[!&|?{;+*%\n';
  let i = 0, prev = '';
  let inBlock = false, inLine = false, inStr = false, inRe = false, inClass = false, quote = '';
  const blank = (k) => { if (src[k] !== '\n') out[k] = ' '; };
  while (i < n) {
    const two = src.slice(i, i + 2);
    if (inBlock) {
      if (two === '*/') { out[i] = out[i + 1] = ' '; i += 2; inBlock = false; continue; }
      blank(i); i++; continue;
    }
    if (inLine) {
      if (src[i] === '\n') inLine = false; else blank(i);
      i++; continue;
    }
    if (inStr) {
      if (src[i] === '\\') { blank(i); blank(i + 1); i += 2; continue; }
      if (src[i] === quote) inStr = false; else blank(i);
      i++; continue;
    }
    if (inRe) {
      if (src[i] === '\\') { blank(i); blank(i + 1); i += 2; continue; }
      if (src[i] === '[') inClass = true;
      else if (src[i] === ']') inClass = false;
      else if (src[i] === '/' && !inClass) inRe = false;
      blank(i); i++; continue;
    }
    if (two === '/*') { out[i] = out[i + 1] = ' '; i += 2; inBlock = true; continue; }
    if (two === '//') { out[i] = out[i + 1] = ' '; i += 2; inLine = true; continue; }
    if (src[i] === '"' || src[i] === "'" || src[i] === '`') { inStr = true; quote = src[i]; i++; prev = src[i - 1]; continue; }
    if (src[i] === '/' && BEFORE_RE.indexOf(prev) >= 0) { inRe = true; inClass = false; blank(i); i++; continue; }
    if (!/\s/.test(src[i])) prev = src[i];
    i++;
  }
  return out.join('');
}
const CODE = codeOnly(SCREEN);

/* ===================================================================================================
 * A. THE ONE RULE, READ OFF THE SOURCE — Buses does no arithmetic of its own
 * =================================================================================================== */

/* Every field and name on this screen's reach that IS money. `km`, `odometer`,
 * `litres`, `days` and `n` are deliberately NOT here: a kilometre is a distance
 * and the service-due figure is allowed to subtract two of them (§1.3), which
 * is the whole reason this check names money rather than banning arithmetic. */
const MONEY = ['cost', 'amount', 'labourRate', 'labourHours', 'allowance', 'expenses',
               'total', 'value', 'price', 'payable', 'fine', 'rupees', 'spend',
               'unitCost', 'externalCost', 'pendingPayable', 'pendingFine'];
const OPS = '[-+*/%]';

test('A1 no money identifier anywhere beside an arithmetic operator', () => {
  const bad = [];
  const word = MONEY.join('|');
  // Both halves: a property read (`j.externalCost + …`, `… - p.value`) and a
  // bare name (`total += …`). Case-insensitive, so one list covers every
  // spelling the stores use.
  const pats = [
    new RegExp('\\.(' + word + ')\\b\\s*' + OPS, 'i'),
    new RegExp(OPS + '\\s*[A-Za-z_$][\\w$]*\\.(' + word + ')\\b', 'i'),
    new RegExp('(?:^|[^\\w.$])(' + word + ')\\s*' + OPS, 'i'),
    new RegExp(OPS + '\\s*(' + word + ')(?:[^\\w$]|$)', 'i'),
  ];
  CODE.split('\n').forEach((line, i) => {
    if (pats.some((re) => re.test(line))) bad.push((i + 1) + ': ' + line.trim());
  });
  assert.strictEqual(bad.length, 0,
    'Buses must not compute the cost — Money computes, Buses reads:\n' + bad.join('\n'));
});

test('A2 …and no reduce, no index-and-combine, no money accumulator', () => {
  assert(!/\breduce\s*\(/.test(CODE), 'a reduce over the parts is the sixth cost basis');
  assert(!/\bparts\s*\[\s*\d/.test(CODE), 'the parts are drawn as they came, not indexed and combined');
  assert(!new RegExp('\\b(' + MONEY.join('|') + ')\\w*\\s*\\+=', 'i').test(CODE),
         'an accumulator over money is arithmetic by another name');
});

test('A3 the only two things it asks Cost for are forBus and reconciles', () => {
  const used = [];
  const re = /\bC\.([A-Za-z]+)|\bCost\.([A-Za-z]+)/g;
  let m;
  while ((m = re.exec(CODE)) !== null) used.push(m[1] || m[2]);
  const extra = used.filter((k) => ['forBus', 'reconciles'].indexOf(k) < 0);
  assert.deepStrictEqual(extra.sort().filter((v, i, a) => a.indexOf(v) === i), [],
    'Buses reached past forBus/reconciles into Cost: ' + extra.join(', '));
});

test('A4 no per-km anything, in the source', () => {
  [/perKm/i, /kmpl/i, /per\s+km/i, /\/\s*km/, /rankPerKm/, /fleetPerKm/].forEach((re) => {
    assert(!re.test(CODE), 'per km has two homes and this is neither (8db78e7): ' + re);
  });
});

test('A5 it consumes Odo.check and Odo.mayAsk, and never Odo.mileage or Odo.kmOver', () => {
  assert(/\bO\.check\s*\(|Odo\.check\s*\(/.test(CODE), 'the forward-only entry refusal is Odo.check');
  assert(/mayAsk\s*\(/.test(CODE), 'whether to ask for a reading at all is Odo.mayAsk');
  assert(!/mileage\s*\(/.test(CODE), 'mileage is a quotient this screen may not draw');
  assert(!/kmOver\s*\(/.test(CODE), 'kmOver is a divisor this screen may not draw');
});

test('A6 no denominator is defaulted, and nothing from a record is ever a divisor', () => {
  assert(!/\|\|\s*1\b/.test(CODE), 'a defaulted divisor is exactly 8db78e7');
  assert(!/\?\?/.test(CODE), 'a nullish default on a reading is a default on a reading');
  /* Every divisor in the file, named. The only ones allowed are this module's
   * own fixed time constants and bare integer literals — turning a span of
   * milliseconds into days is not a figure and cannot be wrong by a factor of
   * a missing odometer. A divisor that came off a RECORD is the 8db78e7 shape:
   * ₹45,000 over a reading nobody took. */
  const bad = [];
  const re = /[\w)\]]\s*\/\s*([A-Za-z_$][\w$.]*|\d[\d_]*)/g;
  let m;
  while ((m = re.exec(CODE)) !== null) {
    if (!/^(DAY|[0-9]+)$/.test(m[1])) bad.push(m[1]);
  }
  assert.deepStrictEqual(bad.filter((v, i, a) => a.indexOf(v) === i), [],
    'a divisor this screen cannot trust: ' + bad.join(', '));
  // And whatever it divides, it is never money and never an odometer.
  assert(!new RegExp('\\/\\s*[A-Za-z_$][\\w$]*\\.?(' + MONEY.join('|') + '|odometer|km)\\b', 'i').test(CODE),
         'per km has two homes and this is neither (8db78e7)');
});

test('A7 the field guard is read BEFORE [data-act], in this file', () => {
  assert(SCREEN.indexOf('input, select, textarea, label, .num') >= 0,
         'the field selector must be in the file, inline or named');
  const lines = SCREEN.split('\n');
  let guard = -1, act = -1;
  lines.forEach((l, i) => {
    if (guard < 0 && /closest\(/.test(l) && !/closest\('\[data-/.test(l)) guard = i;
    if (act < 0 && /closest\('\[data-(act|nav)\]'\)/.test(l)) act = i;
  });
  assert(guard >= 0, 'no field guard found');
  assert(act >= 0, 'no [data-act] read found — then this screen has no handler');
  assert(guard < act, 'a guard that runs after the [data-act] read is not a guard');
});

test('A8 nothing measures a row', () => {
  [/offsetHeight/, /getBoundingClientRect/, /getComputedStyle/].forEach((re) => {
    assert(!re.test(CODE), 'measuring a row is the shape that cost 277 ms a page: ' + re);
  });
});

/* ===================================================================================================
 * A9. THE COST SORT IS PAID ONCE PER DATA CHANGE, NOT ONCE PER REDRAW
 *
 * REV-FLOOR finding 2, measured: 89 buses on the fleet fixture, sorting by
 * running cost took 80-95 ms against 15 ms for registration, and 60 ms of it
 * was 89 `Cost.forBus` calls walking the money stores end to end. `boot.js`
 * re-mounts on every sync status change and the poller ticks every four
 * seconds, so it was re-paid every four seconds for as long as the owner left
 * that sort on — an estimated 320-480 ms of blocked main thread per tick on a
 * Core 2 Duo, against §9's 250 ms screen budget.
 *
 * Measured again after the memo, same fixture and machine, node, model build
 * only (no DOM): first build 116.5-119.2 ms either way, and the REDRAW
 * 33.1-41.3 ms with the memo against 109.4-126.4 ms without it. Narrowed to one
 * registration: 0.6-2.0 ms against 73.5-87.6 ms.
 *
 * CHECKED BY COUNTING THE CALLS, not by timing, because a timing check on a
 * shared machine passes or fails by how busy the machine is. The count is the
 * thing the measurement was about.
 * =================================================================================================== */

/* A Cache whose `sigOf` behaves like the real one: it moves when the content
 * moves and not otherwise. `cache.js`'s own signature is `rows.length + ':' +
 * newest updatedAt`, which is what makes it safe to key a memo on. */
function countingCost(o) {
  o = o || {};
  const buses = o.buses || Array.from({ length: 12 }, (_, i) => seedBus(i));
  const cache = freshCache(buses);
  const l = load({ cache: cache, src: o.src });
  const calls = [];
  l.win.Cost = {
    forBus: (id) => { calls.push(id); return costResult(1000 + calls.length, [1000, 0, 0, 0, 0, 0]); },
    reconciles: () => true,
  };
  l.win.Cache = {
    load: () => Promise.resolve({}),
    sig: () => '',
    sigOf: function () {
      const names = Array.prototype.slice.call(arguments);
      return names.map((n) => {
        const a = cache[n] || [];
        let max = 0;
        for (let i = 0; i < a.length; i++) {
          const t = (a[i] && (a[i].updatedAt || a[i].at)) || 0;
          if (t > max) max = t;
        }
        return a.length + ':' + max;
      }).join('|');
    },
  };
  return { l: l, cache: cache, calls: calls, buses: buses };
}

test('A9 a second redraw of the cost sort asks Cost for nothing: the memo is the data signature', () => {
  const c = countingCost();
  c.l.Buses.sort('cost');
  c.l.Buses.model(shell({ cache: c.cache }));
  const first = c.calls.length;
  assert.strictEqual(first, c.buses.length,
    'expected one forBus per bus on the first build, got ' + first);
  /* The redraw a sync tick causes: same screen, same data, nothing touched.
   * `now` moves — it is `Date.now()` on every build — and the review said a
   * memo "would not help" for exactly that reason, which is why the window end
   * is quantised into the key rather than left out of it. */
  c.l.Buses.model(shell({ cache: c.cache }));
  c.l.Buses.model(shell({ cache: c.cache }));
  assert.strictEqual(c.calls.length, first,
    'the cost sort was recomputed on a redraw: ' + (c.calls.length - first)
    + ' extra Cost.forBus call(s) for data nobody changed');
});

test('A9 a write to a money store DOES recompute it, or the figure would freeze', () => {
  const c = countingCost();
  c.l.Buses.sort('cost');
  c.l.Buses.model(shell({ cache: c.cache }));
  const first = c.calls.length;
  // One new fill. The signature moves, so the answer has to be rebuilt — a memo
  // that held through this would draw a cost that is quietly out of date, which
  // is worse than paying for it.
  c.cache.fuel.push({ id: 'f-new', busId: c.buses[0].id, litres: 100, amount: 9000,
                      at: T - DAY, updatedAt: T });
  c.l.Buses.model(shell({ cache: c.cache }));
  assert.strictEqual(c.calls.length, first * 2,
    'a new fuel fill did not move the memo key: the drawn cost would be stale');
});

test('A9 the search filter runs FIRST, so narrowing to one registration costs one call', () => {
  const c = countingCost();
  c.l.Buses.sort('cost');
  c.l.Buses.search(c.buses[3].regNo);
  c.l.Buses.model(shell({ cache: c.cache }));
  /* `costTotals` used to be handed the whole fleet before anything was filtered
   * out, so searching down to one bus still cost 89 full passes over the money
   * stores. Measured: 76 ms for one row. */
  assert.strictEqual(c.calls.length, 1,
    'searching for one registration asked Cost about ' + c.calls.length + ' buses');
});

test('A9 MUTANT must fail: the memo is dropped and every redraw pays again', () => {
  const src = SCREEN.replace(
    '    var by = (key !== null && costMemo.key === key && costMemo.by) ? costMemo.by : {};',
    '    var by = {};');
  assert.notStrictEqual(src, SCREEN, 'the memo mutation did not apply');
  const c = countingCost({ src: src });
  c.l.Buses.sort('cost');
  c.l.Buses.model(shell({ cache: c.cache }));
  const first = c.calls.length;
  c.l.Buses.model(shell({ cache: c.cache }));
  assert(c.calls.length > first,
    'the mutant still answered from a memo: this check cannot fail');
});

test('A9 MUTANT must fail: the totals are computed before the search filter again', () => {
  const src = SCREEN.replace(
    "    var totals = sort === 'cost' ? costTotals(shown, m, now) : {};",
    "    var totals = sort === 'cost' ? costTotals(buses, m, now) : {};");
  assert.notStrictEqual(src, SCREEN, 'the filter mutation did not apply');
  const c = countingCost({ src: src });
  c.l.Buses.sort('cost');
  c.l.Buses.search(c.buses[3].regNo);
  c.l.Buses.model(shell({ cache: c.cache }));
  assert(c.calls.length > 1,
    'the mutant asked Cost about one bus: this check cannot fail');
});

/* ===================================================================================================
 * B. THE TOTAL IS READ, NOT RECOMPUTED — and withheld when it cannot be trusted
 * =================================================================================================== */

function withCost(result, reconciles) {
  const l = load({ cache: freshCache([seedBus(26)]) });
  l.win.Cost = {
    forBus: () => result,
    reconciles: reconciles === undefined
      ? (r) => r && typeof r.total === 'number'
        && r.parts.reduce((s, p) => s + (typeof p.value === 'number' ? p.value : NaN), 0) === r.total
      : reconciles,
  };
  return l;
}
function costResult(total, values, why) {
  const ids = ['fuel', 'parts', 'labour', 'outside', 'trip', 'misc'];
  const labels = ['Fuel & AdBlue', 'Parts', 'Labour', 'Outside work', 'Trip cash', 'Misc'];
  return {
    busId: 'bus-RJ09PA6126', days: 30, from: T - 30 * DAY, to: T, total,
    parts: ids.map((id, i) => ({ id, label: labels[i], value: values[i],
                                 n: values[i] === null ? 0 : (values[i] === 0 ? 0 : 3) })),
    unknown: ids.filter((id, i) => values[i] === null),
    why: why === undefined ? (values.some((v) => v === null) ? 'unknown' : null) : why,
    notIn: ['bills', 'challans', 'shrinkage'],
  };
}
const oneBus = (o) => shell(Object.assign({ params: { busId: 'bus-RJ09PA6126' } }, o || {}));

test('B1 the drawn total is the one Cost returned, not a sum of what it drew', () => {
  // 4,24,242 against six parts that add up to 1. A screen that computed would
  // draw ₹1. The hero is the proof the screen read.
  const l = withCost(costResult(424242, [1, 0, 0, 0, 0, 0]), () => true);
  const html = l.Buses.render(oneBus({ cache: freshCache([seedBus(26)]) }));
  const card = html.slice(html.indexOf('bs-c5'), html.indexOf('bs-c6'));
  const hero = card.slice(card.indexOf('bs-total'), card.indexOf('bs-part'));
  assert(/₹4,24,242/.test(hero), 'the hero is not the total Cost handed over');
  assert(!/₹1</.test(hero), 'the hero looks computed from the parts');
});

test('B2 NO TOTAL IS DRAWN when the parts do not add up to it', () => {
  // The real reconciles(): 999 against parts summing to 1,000.
  const l = withCost(costResult(999, [1000, 0, 0, 0, 0, 0], null));
  const html = l.Buses.render(oneBus({ cache: freshCache([seedBus(26)]) }));
  const card = html.slice(html.indexOf('bs-c5'), html.indexOf('bs-c6'));
  const hero = card.slice(card.indexOf('bs-total'), card.indexOf('bs-part'));
  assert(/data-state="unknown"/.test(hero), 'a total that disagrees with its parts was drawn anyway');
  assert(!/₹999/.test(hero), 'the withheld total leaked into the hero');
  // …and the parts are still there, so the reader can see what does not add up.
  assert.strictEqual(count(card, /class="bs-part/g), 6, 'the parts went away with the total');
});

test('B3 a part that could not be read withholds the total and says so', () => {
  const l = withCost(costResult(null, [1200, null, 300, 0, 0, 0]));
  const html = l.Buses.render(oneBus({ cache: freshCache([seedBus(26)]) }));
  const card = html.slice(html.indexOf('bs-c5'), html.indexOf('bs-c6'));
  assert(/badge-warn/.test(card) && /Part of this is missing/.test(card),
         'a total with an unknown part must say a part is missing');
  const hero = card.slice(card.indexOf('bs-total'), card.indexOf('bs-part'));
  assert(/data-state="unknown"/.test(hero), 'a smaller number presented as complete is the failure');
});

test('B4 all parts unknown is the dash, never ₹0', () => {
  const l = withCost(costResult(null, [null, null, null, null, null, null]));
  const html = l.Buses.render(oneBus({ cache: freshCache([seedBus(26)]) }));
  const card = html.slice(html.indexOf('bs-c5'), html.indexOf('bs-c6'));
  assert(!/₹0/.test(card), 'unknown was drawn as zero — the one thing these three may never do');
  assert.strictEqual(count(card, /data-state="unknown"/g), 7, 'the total and all six parts are the dash');
});

test('B5 the total is never drawn alone — the parts are always beneath it', () => {
  const l = withCost(costResult(1500, [1000, 500, 0, 0, 0, 0]), () => true);
  const html = l.Buses.render(oneBus({ cache: freshCache([seedBus(26)]) }));
  const card = html.slice(html.indexOf('bs-c5'), html.indexOf('bs-c6'));
  assert(/₹1,500/.test(card), 'the total is missing');
  assert.strictEqual(count(card, /class="bs-part/g), 6, 'a total without its parts is a number you must trust');
  ['Fuel &amp; AdBlue', 'Parts', 'Labour', 'Outside work', 'Trip cash', 'Misc'].forEach((label) => {
    assert(card.indexOf(label) >= 0, 'the part ' + label + ' is not drawn');
  });
  assert(card.indexOf('₹1,500') < card.indexOf('bs-part'), 'the parts must sit beneath the total');
});

test('B6 a part that was read and found nothing is a real 0 with its own words', () => {
  const l = withCost(costResult(1000, [1000, 0, 0, 0, 0, 0]), () => true);
  const html = l.Buses.render(oneBus({ cache: freshCache([seedBus(26)]) }));
  const card = html.slice(html.indexOf('bs-c5'), html.indexOf('bs-c6'));
  assert(/No trips recorded/.test(card), 'a zero trip-cash part must say so in its own words');
  assert(!/Part of this is missing/.test(card), 'a real zero is not a missing part');
});

test('B7 the window and what is NOT in the total are both stated', () => {
  const l = withCost(costResult(10, [10, 0, 0, 0, 0, 0]), () => true);
  const html = l.Buses.render(oneBus({ cache: freshCache([seedBus(26)]) }));
  assert(/Running cost, last 30 days/.test(html), 'the window must be on the card');
  assert(/supplier bills, challans, audit shrinkage/.test(html),
         'what is deliberately not counted has to be said in one line');
});

test('B8 the real Cost tells a read-and-found-nothing zero from a store nobody read', () => {
  // No stub at all, and the distinction this card exists to keep. Every store
  // PRESENT and empty is "I asked, and there is nothing" — a real ₹0, with each
  // part saying so in its own words.
  const full = freshCache([seedBus(26)]);
  const zero = load({ cache: full }).Buses.render(oneBus({ cache: full }));
  const zeroCard = zero.slice(zero.indexOf('bs-c5'), zero.indexOf('bs-c6'));
  assert(/₹0/.test(zeroCard), 'six parts read and found empty is a real zero');
  assert(/No fills recorded/.test(zeroCard) && /No trips recorded/.test(zeroCard),
         'a zero part has to say what it looked at');
  assert(!/Part of this is missing/.test(zeroCard), 'a real zero is not a missing part');

  // One store ABSENT is "nobody has looked", and then the total is withheld —
  // which is the half that keeps unknown from reading as zero.
  const short = freshCache([seedBus(26)]);
  delete short.trips;
  const held = load({ cache: short }).Buses.render(oneBus({ cache: short }));
  const heldCard = held.slice(held.indexOf('bs-c5'), held.indexOf('bs-c6'));
  const hero = heldCard.slice(heldCard.indexOf('bs-total'), heldCard.indexOf('bs-part'));
  assert(/data-state="unknown"/.test(hero), 'a store nobody read must withhold the total');
  assert(/Part of this is missing/.test(heldCard), 'and say which part is missing');
});

/* ===================================================================================================
 * C. THE SEED'S ZEROES — eight unknown facts per bus, eight different sentences
 * =================================================================================================== */

test('C1 the fresh-device bus draws no zero and no red', () => {
  const l = load({ cache: freshCache([seedBus(26)]) });
  const html = l.Buses.render(oneBus({ cache: freshCache([seedBus(26)]) }));
  assert(!/>0</.test(html.replace(/0 km/g, '')), 'a zero appeared where nothing is known');
  assert(!/badge-bad/.test(html), 'nothing on a fresh device is a problem — it is unknown');
  assert(!/Overdue by/.test(html), '89 rows of red that cannot reach zero is 5eb8c6e rebuilt');
});

test('C2 the odometer is the dash and its own sentence, never 0 km', () => {
  const l = load({ cache: freshCache([seedBus(26)]) });
  const html = l.Buses.render(oneBus({ cache: freshCache([seedBus(26)]) }));
  const card = html.slice(html.indexOf('bs-c1'), html.indexOf('bs-c2'));
  assert(/No odometer reading/.test(card), 'the odometer must say it has no reading');
  assert(!/0<\/span> <span class="figure-u">km/.test(card), '0 is the broken-instrument value too');
  assert(/data-state="unknown"/.test(card), 'a zero odometer is figure(null), the em dash');
});

test('C3 papers are five fixed rows, all "Not recorded", with the line above', () => {
  const l = load({ cache: freshCache([seedBus(26)]) });
  const html = l.Buses.render(oneBus({ cache: freshCache([seedBus(26)]) }));
  const card = html.slice(html.indexOf('bs-c3'), html.indexOf('bs-c4'));
  ['Insurance', 'Fitness', 'PUC', 'Permit', 'Road tax'].forEach((p) => {
    assert(card.indexOf('>' + p + '<') >= 0, 'the fixed paper row ' + p + ' is missing');
  });
  assert.strictEqual(count(card, /class="v2row bs-paper"/g), 5, 'papers must be five fixed rows');
  assert(/No papers recorded for this bus\./.test(card), 'the line above is missing');
  assert.strictEqual(count(card, /Not recorded/g), 5, 'a missing paper has to be visible as missing');
  assert(count(card, /class="state empty"/g) === 0, 'the papers card is never empty');
});

test('C4 company, model, chassis and engine each read "Not recorded"', () => {
  const l = load({ cache: freshCache([seedBus(26)]) });
  const html = l.Buses.render(oneBus({ cache: freshCache([seedBus(26)]) }));
  const card = html.slice(html.indexOf('bs-c1'), html.indexOf('bs-c2'));
  assert.strictEqual(count(card, /Not recorded/g), 4,
    'all four empty strings read "Not recorded" — a register row cannot be "Volvo B9R"');
});

test('C5 the three empty collections are empty STATES, not counts of zero', () => {
  const l = load({ cache: freshCache([seedBus(26)]) });
  const html = l.Buses.render(oneBus({ cache: freshCache([seedBus(26)]) }));
  assert(/No tyres or batteries recorded on this bus/.test(html));
  assert(/No open reports for this bus/.test(html));
  assert(/No work recorded on this bus/.test(html));
});

test('C6 the crew card is never empty — three fixed seats, each "Empty"', () => {
  const l = load({ cache: freshCache([seedBus(26)]) });
  const html = l.Buses.render(oneBus({ cache: freshCache([seedBus(26)]) }));
  const card = html.slice(html.indexOf('bs-c8'), html.indexOf('bs-c9'));
  ['Driver 1', 'Driver 2', 'Conductor'].forEach((s) => {
    assert(card.indexOf(s + ' · Empty') >= 0, 'the fixed seat ' + s + ' is missing or filled');
  });
  assert.strictEqual(count(card, /class="v2row bs-seat"/g), 3, 'a bus that lost a seat must show the hole');
});

test('C7 challans: never checked, a real zero and the provider being down are three things', () => {
  const b = seedBus(26);
  const never = load({ cache: freshCache([b]) })
    .Buses.render(oneBus({ cache: freshCache([b]) }));
  assert(/Never checked/.test(never) && /data-state="unknown"/.test(never));

  const zeroCache = freshCache([b]);
  zeroCache.challans = [{ rc: 'RJ09PA6126', pendingCount: 0, pendingPayable: 0,
                          fetchedAt: T - 2 * 3600000, creditsLeft: 46 }];
  const zero = load({ cache: zeroCache }).Buses.render(oneBus({ cache: zeroCache }));
  assert(/No pending challans, checked/.test(zero), 'a real zero must read as a real zero');
  assert(/46 checks left this month/.test(zero), 'the credits left are part of the price');

  const downCache = freshCache([b]);
  downCache.challans = [{ rc: 'RJ09PA6126', providerUnavailable: true, fetchedAt: T - 3 * DAY }];
  const down = load({ cache: downCache }).Buses.render(oneBus({ cache: downCache }));
  assert(/Could not reach the challan service/.test(down), 'the provider being down is its own sentence');
});

test('C8 the register can read zero buses, in words', () => {
  const empty = freshCache([]);
  const l = load({ cache: empty });
  const html = l.Buses.render(shell({ cache: empty }));
  assert(/No buses yet/.test(html) && /Add the first bus to start\./.test(html));
  assert(!/>0 buses</.test(html), 'a count that says "0 buses" instead of "No buses" is the wrong zero');
});

test('C9 a seeded register row says what is true, not a blank line', () => {
  const cache = freshCache([seedBus(26), seedBus(37)]);
  const l = load({ cache });
  const html = l.Buses.render(shell({ cache }));
  assert.strictEqual(count(html, /No papers recorded</g), 2,
    'the one-urgent-thing line is "No papers recorded" on a fresh device, on every row');
  assert(/2 buses/.test(html));
});

test('C10 no per-km figure reaches the markup, on either state', () => {
  const cache = freshCache([seedBus(26)]);
  cache.fuel = [{ id: 'f1', busId: 'bus-RJ09PA6126', litres: 100, cost: 9000, odometer: 480000,
                  full: true, at: T - 20 * DAY }];
  const l = load({ cache });
  [shell({ cache }), oneBus({ cache })].forEach((m) => {
    const html = l.Buses.render(m);
    assert(!/\/km/i.test(html) && !/per km/i.test(html) && !/km\/l/i.test(html),
           'a per-km figure reached the screen that 8db78e7 came off');
  });
});

/* ===================================================================================================
 * D. THE ODOMETER — five service states, never a sixth, and never a default
 * =================================================================================================== */

const svc = (bus) => load({ cache: freshCache([bus]) }).Buses.serviceOf(bus, T);

test('D1 odometer and lastServiceOdo both known gives a km figure', () => {
  const b = Object.assign(seedBus(26), { odometer: 48210, lastServiceOdo: 44090, serviceIntervalKm: 10000 });
  const s = svc(b);
  assert.strictEqual(s.state, 'due');
  assert.strictEqual(s.km, 5880);
  assert(/5,880 km to the next service/.test(s.words));
});

test('D2 …and warns under 1,000 km, and goes bad when it is overdue', () => {
  const near = svc(Object.assign(seedBus(26), { odometer: 53500, lastServiceOdo: 44090 }));
  assert.strictEqual(near.tone, 'warn', 'under 1,000 km to go must warn');
  const over = svc(Object.assign(seedBus(26), { odometer: 54400, lastServiceOdo: 44090 }));
  assert.strictEqual(over.state, 'overdue');
  assert.strictEqual(over.tone, 'bad');
  assert(/Overdue by 310 km/.test(over.words));
});

test('D3 odometer known and no service recorded is the dash and one next step', () => {
  const s = svc(Object.assign(seedBus(26), { odometer: 48210 }));
  assert.strictEqual(s.state, 'noservice');
  assert.strictEqual(s.km, null);
  assert(/No service recorded\. Log one to start the count\./.test(s.words));
});

test('D4 no odometer with a service DATE falls back to the date, never to km', () => {
  const s = svc(Object.assign(seedBus(26), { lastServiceDate: Date.UTC(2026, 0, 3) }));
  assert.strictEqual(s.state, 'bydate');
  assert.strictEqual(s.km, null, 'there is no km basis, so there is no km figure');
  assert(/Last serviced 3 January 2026/.test(s.words));
  assert(!/km/.test(s.words), 'a date fallback that mentions km has invented a basis');
});

test('D5 nothing at all is the dash, both facts named, and one next step', () => {
  const s = svc(seedBus(26));
  assert.strictEqual(s.state, 'nothing');
  assert.strictEqual(s.km, null);
  assert(/No odometer reading and no service recorded\./.test(s.words));
  assert.strictEqual(s.next, 'Add a reading');
});

test('D6 a BROKEN odometer makes no request for a reading', () => {
  const b = Object.assign(seedBus(26), { odoBroken: true, odoBrokenAt: Date.UTC(2026, 9, 12),
                                         odometer: 48210, lastServiceOdo: 44090 });
  const s = svc(b);
  assert.strictEqual(s.state, 'broken', 'odoBroken beats every other basis');
  assert.strictEqual(s.km, null, 'a broken instrument measures nothing, even with a last service on file');
  assert(/Odometer broken since 12 Oct/.test(s.words), s.words);
  assert.strictEqual(s.next, null, 'asking for a reading is how a wrong number gets typed');
  const html = load({ cache: freshCache([b]) }).Buses.render(oneBus({ cache: freshCache([b]) }));
  assert(!/Add a reading/.test(html), 'the screen asked for a reading on a broken instrument');
});

test('D7 the service card draws no km figure in the three states with no km basis', () => {
  ['noservice', 'bydate', 'nothing'].forEach((want) => {
    const b = want === 'noservice' ? Object.assign(seedBus(26), { odometer: 48210 })
      : want === 'bydate' ? Object.assign(seedBus(26), { lastServiceDate: Date.UTC(2026, 0, 3) })
        : seedBus(26);
    const cache = freshCache([b]);
    const html = load({ cache }).Buses.render(oneBus({ cache }));
    const card = html.slice(html.indexOf('bs-c4'), html.indexOf('bs-c5'));
    const due = card.slice(card.indexOf('Next service'));
    assert(/data-state="unknown"/.test(due), want + ' drew a due figure with no basis');
  });
});

test('D8 a service sheet names the reading the person has to beat', () => {
  const b = Object.assign(seedBus(26), { odometer: 48210 });
  const l = load({ cache: freshCache([b]) });
  const html = l.Buses.serviceSheet(b);
  assert(/48,210 km/.test(html), 'the sheet must name the stored reading, never "Invalid odometer"');
  assert(/data-kind="whole"/.test(html) && /data-field="odometer"/.test(html));
  assert(!/value="0"/.test(html), 'a default 0 on an odometer is a wrong reading nobody typed');
});

test('D9 a service sheet will not save until a photo or the bill is there, and says why', () => {
  const html = load({}).Buses.serviceSheet(seedBus(26));
  assert(/aria-disabled="true"/.test(html), 'Save must wait for the photo');
  assert(/A photo or the bill is needed/.test(html), 'a silent dead button is the failure');
  assert(/photo-add/.test(html), 'there must be a way to add the photo');
});

/* ===================================================================================================
 * E. THE PHONE RULE — redacted and not-recorded must not look alike
 * =================================================================================================== */

function crewCache(driver) {
  const c = freshCache([seedBus(26)]);
  c.drivers = [Object.assign({ id: 'd1', name: 'Ramesh', crewRole: 'driver', driverSlot: 1,
                               busId: 'bus-RJ09PA6126', status: 'active' }, driver || {})];
  c.dutylog = [{ id: 'dl1', crewId: 'd1', busId: 'bus-RJ09PA6126', role: 'driver', at: T - 4 * DAY }];
  return c;
}

test('E1 a role outside PII_ROLES gets NO phone slot at all', () => {
  const cache = crewCache({ phone: '9876500000' });
  const l = load({ cache });
  ['office', 'store', 'mechanic', 'driver', 'conductor'].forEach((role) => {
    const seats = l.Buses.crewOf(cache.buses[0], { cache }, role);
    assert.strictEqual(seats[0].phone, undefined, role + ' was offered a phone slot');
    const html = l.Buses.render(oneBus({ cache, role, user: { id: 'u', role, name: 'X' } }));
    assert(!/9876500000/.test(html), role + ' saw a crew phone number');
    assert(!/tel:/.test(html), role + ' got a dial link');
    assert(!/No phone recorded/.test(html), 'an empty slot invites a number into a redacted copy');
  });
});

test('E2 a _redacted record gets no phone slot EVEN FOR THE OWNER', () => {
  const cache = crewCache({ phone: '', _redacted: true });
  const l = load({ cache });
  const seats = l.Buses.crewOf(cache.buses[0], { cache }, 'owner');
  assert.strictEqual(seats[0].phone, undefined,
    'the per-record flag is the test that survives a scope change, not the role');
  const html = l.Buses.render(oneBus({ cache }));
  assert(!/No phone recorded/.test(html), 'a redacted copy must not look like a missing number');
  assert(!/Hidden/.test(html), 'not an empty slot, not "Hidden" — no slot');
});

test('E3 not redacted with a number is a tel: link; not redacted and empty says so', () => {
  const withPhone = crewCache({ phone: '9876500000' });
  const a = load({ cache: withPhone }).Buses.render(oneBus({ cache: withPhone }));
  assert(/href="tel:9876500000"/.test(a), 'a supervisor must be able to dial the driver');

  const noPhone = crewCache({ phone: '' });
  const b = load({ cache: noPhone }).Buses.render(oneBus({ cache: noPhone }));
  assert(/No phone recorded/.test(b), 'a recorded-nothing phone says it is not recorded');
  assert(!/tel:/.test(b), 'an empty phone must not become a dial link');
});

test('E4 no emergency or reference contact and no crew photo, for ANY role', () => {
  const cache = crewCache({
    phone: '9876500000', altPhone: '9000000000',
    emgName: 'Sunita', emgPhone: '9111111111', emgRelation: 'wife',
    refName: 'Kailash', refPhone: '9222222222', photo: 'https://x/uploads/abc.jpg',
    license: 'RJ-14-2011',
  });
  const l = load({ cache });
  ['owner', 'supervisor', 'crewmanager', 'office', 'store'].forEach((role) => {
    const html = l.Buses.render(oneBus({ cache, role, user: { id: 'u', role, name: 'X' } }));
    ['Sunita', '9111111111', 'wife', 'Kailash', '9222222222', 'uploads/abc.jpg',
      'RJ-14-2011', '9000000000'].forEach((leak) => {
      assert(html.indexOf(leak) < 0,
        role + ' saw ' + leak + ' — _DRIVER_PRIVATE does not list these, so Buses renders none of them');
    });
    /* And the seat's VIEW MODEL carries only the four facts the card draws. A
     * field that reaches the model is one edit from reaching the screen, and
     * `emgPhone`, `refPhone` and `photo` reach every role today — so the place
     * to stop them is before any markup exists. */
    l.Buses.crewOf(cache.buses[0], { cache }, role).forEach((seat) => {
      assert.deepEqual(Object.keys(seat).sort(), ['name', 'phone', 'since', 'word'],
        role + "'s seat model grew a field: " + Object.keys(seat).join(', '));
    });
  });
});

test('E5 the seat says since when, or says that it does not know', () => {
  const cache = crewCache({ phone: '' });
  const a = load({ cache }).Buses.render(oneBus({ cache }));
  assert(/Since 2 Nov/.test(a), 'the newest dutylog row for the seat is the "since"');
  const bare = crewCache({ phone: '' });
  bare.dutylog = [];
  const b = load({ cache: bare }).Buses.render(oneBus({ cache: bare }));
  assert(/Since when: not recorded/.test(b), 'a filled seat with no dutylog row says so');
});

/* ===================================================================================================
 * F. DENY BY DEFAULT, PER ROW AND PER CONTROL — absent, never disabled
 * =================================================================================================== */

test('F1 the challan CARD is absent without the challans capability, not an empty card', () => {
  const cache = freshCache([seedBus(26)]);
  cache.challans = [{ rc: 'RJ09PA6126', pendingCount: 3, pendingPayable: 4500, fetchedAt: T - DAY }];
  const l = load({ cache });
  const sup = l.Buses.render(oneBus({ cache, role: 'supervisor', user: { id: 'u', role: 'supervisor' } }));
  assert(/bs-c6/.test(sup), 'a supervisor holds challans and must get the card');

  const other = l.Buses.render(oneBus({ cache, role: 'office', user: { id: 'u', role: 'office' } }));
  assert(!/bs-c6/.test(other), 'the whole card is absent — not an empty card');
  assert(!/Check challans/.test(other), 'the control is absent too');
  assert(!/3 unpaid challans/.test(other), 'the row kind is absent from card 2 as well');
});

test('F2 every write control is absent for a role without its capability', () => {
  const cache = freshCache([seedBus(26), seedBus(37)]);
  cache.driverreports = [{ id: 'dr1', busId: 'bus-RJ09PA6126', problem: 'Brakes pulling left',
                           status: 'open', at: T - DAY, category: 'brakes' }];
  const l = load({ cache });
  const none = { id: 'u', role: 'office' };
  const reg = l.Buses.render(shell({ cache, role: 'office', user: none }));
  assert(!/Add bus/.test(reg), '"Add bus" must be absent without addBus');
  const bus = l.Buses.render(oneBus({ cache, role: 'office', user: none }));
  assert(!/Log service/.test(bus), '"Log service" must be absent without logService');
  assert(!/Make a job/.test(bus), '"Make a job" must be absent without addJob');
  assert(!/Link GPS/.test(bus), '"Link GPS" must be absent without addBus');
  assert(!/aria-disabled/.test(bus), 'a control a person may not use is ABSENT, not disabled');
});

test('F2b the Last seen card declares liveMap of its own, not fleet', () => {
  // `liveMap` is all that survives of v1's full-screen fleet map. Owner and
  // supervisor hold both it and `fleet` today, so this costs nothing now — and
  // that is exactly when a per-action declaration has to be written, because a
  // role added later must inherit nothing.
  const cache = freshCache([seedBus(26)]);
  cache.gpsevents = [{ id: 'ev1', reg: 'RJ09PA6126', type: 'idle', at: T - 3 * 3600000 }];
  const l = load({ cache });
  const own = l.Buses.render(oneBus({ cache }));
  assert(/bs-c9/.test(own) && /Last seen 3 hours ago/.test(own));
  assert(!/live/i.test(own.replace(/lead/g, '')), 'nothing on this screen claims to be live');
  const no = l.Buses.render(oneBus({ cache, role: 'office', user: { id: 'u', role: 'office' } }));
  assert(!/bs-c9/.test(no), 'the card is absent for a role without liveMap');
});

test('F3 a driver report row STAYS without addJob — only the button goes', () => {
  const cache = freshCache([seedBus(26)]);
  cache.driverreports = [{ id: 'dr1', busId: 'bus-RJ09PA6126', problem: 'Brakes pulling left',
                           status: 'open', at: T - DAY, category: 'brakes' }];
  const l = load({ cache });
  const html = l.Buses.render(oneBus({ cache, role: 'office', user: { id: 'u', role: 'office' } }));
  assert(/Brakes pulling left/.test(html), 'the row must stay and show the report');
  assert(!/Make a job/.test(html), 'only the button is absent');
});

/* AN UNUSABLE FIGURE LEAVES A RANKING IN BOTH DIRECTIONS. 8db78e7 put an
 * unusable figure at the TOP of a list; the obvious fix puts it at the BOTTOM
 * ("scores zero, so it sorts last"), and that is the same bug facing the other
 * way — a bus with no running cost sorting as the cheapest in the fleet is a
 * bus nobody looks at. odo.js's header says the last fix only covered the first
 * half. So a bus with no figure is not sorted at all: it is listed after the
 * ranked ones, under a line that says why. */
test('F5 a bus with no figure is listed apart, never ranked at zero', () => {
  const cheap = Object.assign(seedBus(26), { odometer: 48210, lastServiceOdo: 44090 });
  const blind = seedBus(37);                 // no odometer, so no service-due km
  const cache = freshCache([cheap, blind]);
  const l = load({ cache });
  l.Buses.sort('service');
  const m = l.Buses.model(shell({ cache }));
  assert.strictEqual(m.rows.length, 1, 'only the bus with a figure may be ranked');
  assert.strictEqual(m.rows[0].id, cheap.id);
  assert.strictEqual(m.unranked.length, 1, 'the bus with no figure must be listed apart');
  assert.strictEqual(m.unranked[0].id, blind.id);
  assert.notStrictEqual(m.unranked[0].rank, 0, 'ranking it at zero is 8db78e7 facing the other way');
  const html = l.Buses.render(shell({ cache }));
  assert(/No figure yet — listed after the ranked buses/.test(html), 'the line that says why is missing');
  assert(html.indexOf(cheap.regNo) < html.indexOf('bs-unranked'), 'the ranked buses come first');
  l.Buses.sort('reg');
});

test('F4 the sort control is absent when there is one bus to order', () => {
  const one = freshCache([seedBus(26)]);
  assert(!/data-act="busSort"/.test(load({ cache: one }).Buses.render(shell({ cache: one }))));
  const two = freshCache([seedBus(26), seedBus(37)]);
  assert(/data-act="busSort"/.test(load({ cache: two }).Buses.render(shell({ cache: two }))));
});

/* ===================================================================================================
 * G. THE SHARED SHAPE
 * =================================================================================================== */

test('G1 render(model) is pure and touches no document', () => {
  const cache = freshCache([seedBus(26), seedBus(37)]);
  const l = load({ cache });
  let touched = 0;
  l.win.document.querySelector = () => { touched++; return null; };
  l.win.document.querySelectorAll = () => { touched++; return []; };
  const a = l.Buses.render(shell({ cache }));
  const b = l.Buses.render(shell({ cache }));
  assert.strictEqual(a, b, 'two renders of one model disagreed');
  assert.strictEqual(touched, 0, 'render reached into the document');
});

test('G2 mount installs exactly one click listener, and twice installs one', () => {
  const l = load({});
  l.Buses._reset();
  const before = l.clicks.length;
  l.Buses.mount();
  l.Buses.mount();
  assert.strictEqual(l.clicks.length, before + 1, 'mount must install ONE delegated listener');
});

test('G3 the one listener returns early on a form control, before [data-act]', () => {
  const l = load({});
  l.Buses._reset();
  l.Buses.mount();
  const handler = l.clicks[l.clicks.length - 1];
  const asked = [];
  // A target that is inside BOTH a field and a [data-act]: the field must win,
  // or typing a count navigates away. This is the regression the gate's static
  // ordering check guards and this is the behavioural half of it.
  const target = {
    closest(sel) {
      asked.push(sel);
      if (sel === 'input, select, textarea, label, .num') return { tag: 'input' };
      if (sel === '[data-act]') return { getAttribute: () => 'busAdd' };
      return null;
    },
  };
  const before = l.sheets.length;
  handler({ target, preventDefault() {} });
  assert.strictEqual(asked[0], 'input, select, textarea, label, .num',
    'the field selector must be the FIRST thing asked');
  assert.strictEqual(asked.indexOf('[data-act]'), -1, '[data-act] was read after a field was hit');
  assert.strictEqual(l.sheets.length, before, 'a click in a field opened a sheet');
});

test('G4 a register row opens the bus, and back returns to the register', () => {
  const l = load({ cache: freshCache([seedBus(26)]) });
  l.Buses._reset();
  l.Buses.mount();
  const handler = l.clicks[l.clicks.length - 1];
  const hit = (attr, value) => ({
    closest(sel) {
      if (sel === 'input, select, textarea, label, .num') return null;
      if (sel === '[' + attr + ']') return { getAttribute: () => value };
      if (sel === '[data-act]' && attr === 'data-act') return { getAttribute: () => value };
      return null;
    },
  });
  handler({ target: hit('data-bs-open', 'bus-RJ09PA6126'), preventDefault() {} });
  // JSON, not deepStrictEqual: objects minted inside the vm context carry that
  // context's Object.prototype, which strict deep equality compares.
  assert.strictEqual(JSON.stringify(l.gone[l.gone.length - 1]),
                     JSON.stringify({ id: 'buses', params: { busId: 'bus-RJ09PA6126' } }));
  handler({ target: hit('data-act', 'busBack'), preventDefault() {} });
  assert.strictEqual(JSON.stringify(l.gone[l.gone.length - 1]),
                     JSON.stringify({ id: 'buses', params: null }));
});

test('G5 no `at` on any figure inside a register row — the header states it once', () => {
  /* The buses need REAL odometer readings, and that is the whole reason this
   * check works: figure() returns the dash before it ever looks at `at`, so a
   * fixture of unknown readings cannot produce a note however the row is
   * written — which is what the mutation found the first time round. */
  const cache = freshCache([Object.assign(seedBus(26), { odometer: 48210 }),
                            Object.assign(seedBus(37), { odometer: 51044 })]);
  const l = load({ cache });
  ['yard', 'desk'].forEach((density) => {
    const html = l.Buses.render(shell({ cache, density }));
    rows(html).forEach((r) => {
      assert(r.indexOf('figure-note') < 0,
        'a figure note inside a row triples its height and runs the age words once per row');
    });
    assert(/class="bs-fresh"/.test(html), 'the list must state its freshness in its header');
  });
});

test('G6 the desk register row is one line and carries the reading without an age', () => {
  const cache = freshCache([Object.assign(seedBus(26), { odometer: 48210 })]);
  const l = load({ cache });
  const desk = l.Buses.render(shell({ cache, density: 'desk' }));
  assert(/48,210/.test(desk), 'the desk row carries the odometer reading');
  assert(desk.indexOf('class="sub"') < 0, 'a desk row is one line: the sub-line is not rendered');
  const yard = l.Buses.render(shell({ cache, density: 'yard' }));
  assert(yard.indexOf('class="sub"') >= 0, 'the yard row is two lines on purpose');
});

test('G7 offline KEEPS the rows it has, and only an empty-and-offline list is replaced', () => {
  const cache = freshCache([seedBus(26)]);
  const l = load({ cache });
  const kept = l.Buses.render(shell({ cache, offline: true }));
  assert(/RJ09PA6126/.test(kept), 'offline rows are local and real — only their age is in question');
  assert(/No connection\. Last updated/.test(kept), 'the header carries the age');
  assert(!/state-offline/.test(kept), 'a list with rows must not be replaced by offlineState');

  const none = freshCache([]);
  const gone = load({ cache: none }).Buses.render(shell({ cache: none, offline: true }));
  assert(/state-offline/.test(gone), 'an empty-and-offline list gets offlineState');
});

test('G8 offline says the challan check needs signal BEFORE it is pressed', () => {
  const cache = freshCache([seedBus(26)]);
  const l = load({ cache });
  const html = l.Buses.render(oneBus({ cache, offline: true }));
  assert(/Needs signal\. Check when you are online\./.test(html));
  // The one legal aria-disabled on this screen: a control whose reason is in
  // words beside it. Everything else a person may not use is ABSENT.
  assert(/data-act="busChallans" aria-disabled="true"/.test(html));
});

test('G9 loading draws a skeleton, never an empty state', () => {
  const l = load({});
  const html = l.Buses.render(shell({ cache: {} }));
  assert(/class="skeleton"/.test(html), 'a list that has not loaded is a skeleton');
  assert(!/class="state empty"/.test(html), 'emptyState means "I asked, and there are none"');
});

test('G10 the history is capped at 50 with a remainder line', () => {
  const cache = freshCache([seedBus(26)]);
  cache.jobcards = [];
  for (let i = 0; i < 60; i++) {
    cache.jobcards.push({ id: 'j' + i, busId: 'bus-RJ09PA6126', problem: 'Work ' + i,
                          status: 'verified', closedAt: T - i * DAY, createdAt: T - i * DAY });
  }
  const l = load({ cache });
  const html = l.Buses.render(oneBus({ cache }));
  const card = html.slice(html.indexOf('bs-c11'));
  assert.strictEqual(count(card, /data-bs-job=/g), 50, 'the history caps at 50');
  assert(/50 of 60 shown, newest first\./.test(card), 'the remainder has to be stated');
});

test('G11 a card at done is "Waiting for sign-off", never "Verified"', () => {
  const cache = freshCache([seedBus(26)]);
  cache.jobcards = [{ id: 'j1', busId: 'bus-RJ09PA6126', problem: 'Service — oil change',
                      status: 'done', closedAt: T - DAY, createdAt: T - DAY, afterPhotos: ['p'] }];
  const l = load({ cache });
  const html = l.Buses.render(oneBus({ cache }));
  assert(/Waiting for sign-off/.test(html), 'a closed card has not been signed off');
  assert(!/Verified/.test(html), 'the second signature has not arrived');
  assert(/Service · Service — oil change/.test(html), 'a service log is labelled Service');
});

test('G12 the service log stops at done — it never self-verifies', () => {
  const l = load({});
  const card = l.Buses.serviceCard('bus-RJ09PA6126', { problem: 'Oil and filters', odometer: '48210',
                                                       labourHours: '2', jobDate: '2026-11-06' },
                                   { id: 'u-own', role: 'owner' });
  assert.strictEqual(card.status, 'done', 'v1 wrote this card at verified; v2 may not');
  assert.strictEqual(card.verifiedBy, null, 'DECISIONS §10 removed self-sign-off for every role');
  assert.strictEqual(card.verifiedAt, null);
  assert.strictEqual(card.closedBy, 'u-own', 'the closer is the token holder');
  assert(/^j-/.test(card.id), 'a new card gets a minted id');
});

test('G13 the service write moves the odometer only forward, and never defaults it', async () => {
  const bus = Object.assign(seedBus(26), { odometer: 48210 });
  const l = load({ db: { buses: [bus] } });
  // A blank reading leaves the stored one exactly where it was.
  const empty = l.Buses.serviceCard('bus-RJ09PA6126', { odometer: '' }, null);
  assert.strictEqual(empty.odometer, null, 'a blank odometer is null, never 0');
  const lower = l.Buses.jobFromReport('bus-RJ09PA6126', 'dr1', { odometer: '100' }, null, null);
  assert.strictEqual(lower.odometer, 100);
  const nothing = l.Buses.jobFromReport('bus-RJ09PA6126', 'dr1', { odometer: '' }, null, null);
  assert.strictEqual(nothing.odometer, null,
    'never write a record to say nothing changed — a whole buses row is a chance to clobber');
});

test('G14 a new bus is a real row on the first save, with no invented id and no new field', () => {
  const l = load({});
  const rec = l.Buses.createBus({ regNo: ' rj09 pa 6126 ', serviceIntervalKm: '10000' });
  assert(/^b-/.test(rec.id), 'a new bus gets uid("b-") and never a constructed bus-<NORMREG>');
  assert.strictEqual(rec.regNo, 'rj09 pa 6126', 'the plate is stored as typed, trimmed');
  assert.strictEqual(rec.serviceIntervalKm, 10000);
  assert.strictEqual(JSON.stringify(rec.docs), '[]');
  // No new field on any record: v1 runs against the same database under
  // whole-record last-write-wins, so a field v2 invents is erased.
  const known = ['id', 'regNo', 'company', 'model', 'chassis', 'engine', 'serviceIntervalKm',
                 'docs', 'photos', 'source', 'createdAt', 'updatedAt'];
  Object.keys(rec).forEach((k) => assert(known.indexOf(k) >= 0, 'new field on buses: ' + k));
  assert.strictEqual(l.Buses.createBus({ regNo: '   ' }), null, 'a blank plate is not a bus');
});

test('G15 a duplicate plate is refused against tombstones too, and names the existing bus', async () => {
  const l = load({ db: { buses: [{ id: 'bus-RJ09PA6126', regNo: 'RJ09PA6126', _deleted: true }] } });
  l.Buses._reset();
  l.Buses.mount();
  const dupSlot = { textContent: '' };
  const form = {
    getAttribute: () => null,
    querySelector: (sel) => (sel === '[data-bs-dup]' ? dupSlot : null),
    querySelectorAll: () => ([
      { getAttribute: () => 'regNo', value: 'RJ 09 PA 6126' },
    ]),
  };
  l.win.document.querySelector = (sel) => (sel === '[data-sheet="addbus"]' ? form : null);
  const btn = { getAttribute: () => null, setAttribute() {}, removeAttribute() {}, textContent: '' };
  const handler = l.clicks[l.clicks.length - 1];
  handler({
    target: {
      closest(sel) {
        if (sel === 'input, select, textarea, label, .num') return null;
        if (sel === '[data-act]') return Object.assign(btn, { getAttribute: (k) => (k === 'data-act' ? 'busAddSave' : null) });
        return null;
      },
    },
    preventDefault() {},
  });
  await new Promise((r) => setTimeout(r, 10));
  assert(/RJ09PA6126 is already on the register/.test(dupSlot.textContent),
    'a deleted bus must not be silently re-created — the check reads the RAW rows');
  assert.strictEqual(l.db.writes.length, 0, 'a duplicate wrote a second row');
});

test('G16 checking challans asks first, writes nothing, and spends on confirm only', async () => {
  const cache = freshCache([seedBus(26)]);
  const l = load({ cache, confirm: false });
  l.Buses._reset();
  l.Buses.mount();
  l.win.S = { user: { id: 'u', role: 'owner' }, cache };
  const asked = [];
  l.win.Sync = { challans: (rc) => { asked.push(rc); return Promise.resolve({ pendingCount: 0 }); } };
  l.win.Router.current = () => ({ id: 'buses', params: { busId: 'bus-RJ09PA6126' } });
  const btn = { getAttribute: () => null, setAttribute() {}, removeAttribute() {}, textContent: '' };
  const handler = l.clicks[l.clicks.length - 1];
  handler({
    target: {
      closest(sel) {
        if (sel === 'input, select, textarea, label, .num') return null;
        if (sel === '[data-act]') return Object.assign(btn, { getAttribute: (k) => (k === 'data-act' ? 'busChallans' : null) });
        return null;
      },
    },
    preventDefault() {},
  });
  await new Promise((r) => setTimeout(r, 10));
  assert.strictEqual(l.confirms.length, 1, 'it spends money, so it asks first');
  assert(/one paid credit/.test(l.confirms[0]), 'the question has to name the cost');
  assert.strictEqual(asked.length, 0, 'a cancelled confirmation must not spend the credit');
  assert.strictEqual(l.db.writes.length, 0, 'challans is server-ingest only — the client writes nothing');
});

/* ===================================================================================================
 * H. HINDI
 * =================================================================================================== */

test('H1 every label this screen draws goes through the word table', () => {
  const cache = freshCache([seedBus(26)]);
  cache.challans = [{ rc: 'RJ09PA6126', pendingCount: 0, fetchedAt: T - 3600000 }];
  const l = load({ lang: 'hi', cache });
  const reg = l.Buses.render(shell({ cache }));
  const bus = l.Buses.render(oneBus({ cache }));
  // No Hindi is written yet, so every id is pending — and a pending label draws
  // its English WITH ITS ID. That mark on every sentence is the proof the
  // sentence came from the table rather than from the source.
  ['bsCount', 'bsSearch', 'bsAdd'].forEach((id) => {
    assert(reg.indexOf('[' + id + ']') >= 0, 'the register label ' + id + ' did not come from the table');
  });
  ['bsCardBus', 'bsCardNeeds', 'bsCardPapers', 'bsCardService', 'bsCardCost', 'bsCardChallans',
   'bsCardFitted', 'bsCardCrew', 'bsCardSeen', 'bsCardReports', 'bsCardHistory',
   'bsNotRecorded', 'bsSeatD1', 'bsSeatEmpty', 'bsServiceNil', 'bsPaperNone'].forEach((id) => {
    assert(bus.indexOf('[' + id + ']') >= 0, 'the bus label ' + id + ' did not come from the table');
  });
});

test('H2 no Hindi was guessed, and every id this file draws is registered', () => {
  const l = load({ cache: freshCache([seedBus(26)]) });
  // w() throws on an unregistered id BY DESIGN, so the two renders above are
  // already the check. This states the other half: nothing has a guessed value.
  const table = /var WORDS = \{([\s\S]*?)\n  \};/.exec(SCREEN);
  assert(table, 'the word table must be one literal a register() call can find');
  /* THE SCREEN'S OWN NAME IS EXEMPT, and it is the only exemption.
   *
   * `scBuses` is not one of this screen's 134 labels. It is the id `Caps.SCREENS.buses.word`
   * PROMISES, and nothing registered it, so `Shell`'s nameOf() fell through to the English `title`
   * and the nav drew "Buses" unmarked in Hindi mode -- ten of the thirteen screens were in that
   * state. Registering it closes that, and its value is the owner's own word copied out of
   * i18n-hi.js with the line it sits on, which `v2/ui/words.js` explicitly endorses and which
   * `me.js` already does 45 times. The rule below is about this file not GUESSING its own labels,
   * and it still is: the exemption is one line, named, and anything else in Devanagari fails. */
  const own = /^\s*scBuses: \{[^\n]*\n/m;
  assert(own.test(SCREEN), "the screen's own name is not registered here any more: drop this exemption");
  assert(!/[ऀ-ॿ]/.test(SCREEN.replace(own, '')), 'no Devanagari — the Hindi is the owner\'s to supply');
  const ids = Object.keys(l.Buses.render ? {} : {});
  assert(l.win.W.pending().length > 0, 'the pending count is the owner\'s list and it is printed below');
  void ids;
});

/* ===================================================================================================
 * I. NO EMOJI, AND NOTHING OUTSIDE THE 34-MARK SET
 * =================================================================================================== */

test('I1 every mark this screen draws is one of the 34, and no icon was added', () => {
  const l = load({ cache: freshCache([seedBus(26)]) });
  const known = Object.keys(l.win.ICONS);
  const asked = [];
  const re = /draw\('([a-z]+)'/g;
  let m;
  while ((m = re.exec(SCREEN)) !== null) asked.push(m[1]);
  const unknown = asked.filter((k) => known.indexOf(k) < 0);
  assert.deepStrictEqual(unknown.filter((v, i, a) => a.indexOf(v) === i), [],
    'the icon set is at its cap: ' + unknown.join(', '));
  assert.strictEqual(known.length, 34, 'the set is 34 marks and this slice spent none of a 35th');
});

/* =================================================================================================== */

Promise.all(waiting).then(() => {
  const l = load({});
  const pending = l.win.W.pending().filter((id) => /^bs/.test(id));
  console.log('──');
  console.log('  Hindi pending on Buses: ' + pending.length + ' id(s) — the owner\'s list');
  if (fails) { console.log('❌ ' + fails + ' Buses check(s) failed'); process.exit(1); }
  console.log('✅ Money computes; Buses reads — and the seed\'s zeroes read as unknown');
});

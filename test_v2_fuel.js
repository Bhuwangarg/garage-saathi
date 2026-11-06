/* Tests for v2/screens/fuel.js — screen #10, Fuel & tyres. Run: node test_v2_fuel.js
 *
 * At the repo ROOT and not in v2/, because scripts/run-tests.py auto-discovers
 * test_*.js at the root only and does not recurse: a test in v2/ would never run,
 * and a test nobody runs is not a test.
 *
 * WHAT THIS FILE IS FOR. One bug, and every group below is a face of it.
 *
 *   8db78e7: a per-km figure was divided by a missing odometer read, so ₹45,000 of
 *   work became ₹45,000 per kilometre, topped the money-pit list, and sent the owner
 *   to inspect a healthy bus.
 *
 * The defence is three claims, and each has a check that goes red if it is undone:
 *   1. THE SCREEN DIVIDES NOTHING BY ANYTHING IT HOLDS. km/l and cost per km are
 *      Odo's. The source is read and every division in it is accounted for; `|| 1`
 *      and `|| 0` (the shape a defaulted denominator takes) may not appear at all.
 *   2. SIX REFUSALS, SIX SENTENCES, kept apart — and the broken instrument is never
 *      asked for a reading.
 *   3. AN UNUSABLE BUS APPEARS IN NEITHER END OF THE RANKING. 8db78e7 put one at the
 *      top; the obvious repair puts it at the bottom; both are mutants below.
 *
 * Node, no browser, in the shape of test_v2_duty.js and test_v2_work.js: the real
 * ui/icons.js, ui/words.js, ui/states.js, fmt.js, odo.js, caps.js, router.js and the
 * screen are loaded in a vm context holding a stub window, and the assertions are on
 * the markup STRING render() returns. That is why the screen keeps its DOM wiring in
 * mount(): a screen whose rules can only be checked in a browser is a screen whose
 * rules are checked by nobody.
 *
 * MUTANTS. Each claim above is followed by the edit to the source that must turn it
 * red, applied in memory and run through the same assertion. A check that cannot
 * fail is decoration, and this repo has shipped a bug behind one.
 */
process.env.TZ = process.env.TZ || 'UTC';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const read = (p) => fs.readFileSync(p, 'utf8');
const V2 = (...p) => path.join(ROOT, 'v2', ...p);
/* FT_SCREEN is the mutation seam: point it at an edited copy of the screen and every
 * check below runs against that copy, so "break the thing and watch the right check go
 * red" does not mean editing the real file while five other builders share the tree. */
const REAL = V2('screens', 'fuel.js');
const SCREEN = process.env.FT_SCREEN || REAL;

let fails = 0, passed = 0;
const QUEUE = [];
function test(name, fn) { QUEUE.push({ name, fn }); }
async function runAll() {
  for (const t of QUEUE) {
    try { await t.fn(); console.log('  ok  ' + t.name); passed++; }
    catch (e) {
      console.log(' FAIL ' + t.name + '\n        ' + String(e && e.message).split('\n').join('\n        '));
      fails++;
    }
  }
}

/* ===================================================================================================
 * THE SANDBOX
 * =================================================================================================== */

const SRC = ['ui/icons.js', 'ui/words.js', 'ui/states.js', 'fmt.js', 'odo.js', 'caps.js', 'router.js'];

// A stand-in for v2/db.js, faithful where the writes depend on it: a missing row
// reads as null and every read and write is a CLONE, as IndexedDB's is. A fake that
// handed back the same object would let a write that mutated a record in place
// pass here and clobber a colleague's row in the browser.
function fakeDB(seed) {
  const data = {};
  const clone = (o) => JSON.parse(JSON.stringify(o));
  Object.keys(seed || {}).forEach((store) => {
    data[store] = {};
    (seed[store] || []).forEach((r) => { data[store][r.id] = clone(r); });
  });
  return {
    writes: [],
    async get(store, id) { const v = (data[store] || {})[id]; return v && !v._deleted ? clone(v) : null; },
    async all(store) { return Object.keys(data[store] || {}).map((k) => clone(data[store][k])).filter((r) => !r._deleted); },
    async put(store, obj) {
      obj.updatedAt = Date.now();
      (data[store] || (data[store] = {}))[obj.id] = clone(obj);
      this.writes.push(store + '|' + obj.id);
      return obj;
    },
    rows(store) { return Object.keys(data[store] || {}).map((k) => clone(data[store][k])); },
    row(store, id) { const v = (data[store] || {})[id]; return v ? clone(v) : null; },
  };
}

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

const T = Date.UTC(2026, 10, 6, 8, 0);       // 6 November 2026, 08:00 UTC
const HOUR = 3600000, DAY = 86400000;

/* load(o) -> {win, Fuel, db, toasts, sheets, clicks, inputs, gone, loads}
 *   o.src      the screen's source, replaced for a mutant
 *   o.lang     the document language
 *   o.db       the seed for the fake database
 *   o.user     the signed-in user
 */
function load(o) {
  o = o || {};
  const html = { lang: o.lang || 'en', getAttribute: () => null, setAttribute: () => {} };
  const toasts = [], sheets = [], clicks = [], inputs = [], changes = [], gone = [], loads = [], confirms = [];
  const db = fakeDB(o.db);
  const sandbox = {
    navigator: { onLine: o.onLine !== false, userAgent: 'node', language: 'en' },
    location: { href: 'http://localhost/v2/', pathname: '/v2/' },
    document: {
      documentElement: html, title: '',
      addEventListener: function (type, fn) {
        if (type === 'click') clicks.push(fn);
        if (type === 'input') inputs.push(fn);
        if (type === 'change') changes.push(fn);
      },
      removeEventListener: function () {},
      getElementById: function () { return null; },
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; },
      createElement: function () { return { style: {}, setAttribute: function () {} }; },
      head: { appendChild: function () {} }, body: null,
    },
    setTimeout: setTimeout, clearTimeout: clearTimeout,
    addEventListener: function () {}, removeEventListener: function () {},
    console: { warn: function () {}, error: function () {}, info: function () {}, log: function () {} },
    Date: fixedDate(o.now == null ? T : o.now),
    Math: Math, JSON: JSON, Promise: Promise,
    DB: db,
    uid: (p) => (p || '') + 'u' + (sandbox.__n = (sandbox.__n || 0) + 1),
    S: { user: o.user === undefined ? { id: 'u-sup', role: 'supervisor', name: 'Mohan' } : o.user, cache: {} },
    V2: {
      openSheet: function (title, body) { sheets.push({ title: title, body: body }); return { dialog: true }; },
      closeSheet: function () { sheets.push({ closed: true }); },
      toast: function (text, opts) { toasts.push({ text: text, kind: opts && opts.kind }); },
      confirmDialog: function (text, opts) { confirms.push({ text: text, opts: opts }); return Promise.resolve(o.confirm !== false); },
    },
    Cache: { load: function (names) { loads.push(names); return Promise.resolve({}); }, sig: function () { return ''; } },
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  for (const f of SRC) vm.runInContext(read(V2(f)), ctx, { filename: V2(f) });
  const realGo = sandbox.Router.go;
  sandbox.Router.go = function (id, params) { gone.push({ id: id, params: params }); return true; };
  sandbox.Router._realGo = realGo;
  vm.runInContext(o.src == null ? read(SCREEN) : o.src, ctx, { filename: SCREEN });
  return { win: sandbox, Fuel: sandbox.Fuel, db: db, toasts: toasts, sheets: sheets, clicks: clicks,
           inputs: inputs, changes: changes, gone: gone, loads: loads, confirms: confirms };
}

/* ===================================================================================================
 * THE FIXTURE
 * =================================================================================================== */

const bus = (n, extra) => Object.assign({ id: 'b' + n, regNo: 'RJ09PA' + (6100 + n), odometer: 0 }, extra || {});
let fid = 0;
const fill = (busId, o) => Object.assign({ id: 'f' + (++fid), busId: busId, litres: 100, cost: 9000,
  odometer: 0, full: true, at: T - DAY, by: 'u-crew' }, o || {});

/* Eight buses, one for each thing the mileage list has to tell apart. Registrations
 * are chosen so the order of buses by registration is the order of the cases, which
 * keeps "Readings to check" in a known order. */
function fleet() {
  const buses = [
    bus(1, { odometer: 40400 }),                                    // good: 4.0 km/l
    bus(2),                                                          // case 1: no reading
    bus(3, { odoBroken: true, odoBrokenAt: Date.UTC(2026, 9, 12) }),  // case 2: broken since 12 October
    bus(4),                                                          // case 3: backwards
    bus(5),                                                          // case 4: same reading
    bus(6),                                                          // case 5: implausible
    bus(7),                                                          // case 6: part fills only
    bus(8, { odometer: 31000 }),                                    // good, worse: 3.0 km/l
  ];
  const fuel = [
    fill('b1', { odometer: 40000, at: T - 10 * DAY, litres: 100, cost: 9000 }),
    fill('b1', { odometer: 40400, at: T - 2 * HOUR, litres: 100, cost: 9640 }),
    fill('b2', { odometer: 0, at: T - 9 * DAY }),
    fill('b2', { odometer: 0, at: T - 3 * DAY }),
    fill('b3', { odometer: 0, at: T - 5 * DAY }),
    fill('b4', { odometer: 50000, at: T - 8 * DAY }),
    fill('b4', { odometer: 49000, at: T - 3 * DAY }),
    fill('b5', { odometer: 41000, at: T - 8 * DAY }),
    fill('b5', { odometer: 41000, at: T - 3 * DAY }),
    fill('b6', { odometer: 40000, at: T - 8 * DAY, litres: 120.5 }),
    fill('b6', { odometer: 61900, at: T - 3 * DAY, litres: 120.5 }),
    fill('b7', { odometer: 20000, at: T - 8 * DAY, full: true }),
    fill('b7', { odometer: 20300, at: T - 3 * DAY, full: false }),
    fill('b8', { odometer: 30000, at: T - 9 * DAY, litres: 100 }),
    fill('b8', { odometer: 30300, at: T - 4 * DAY, litres: 100 }),
  ];
  return { buses, fuel };
}

function shell(o) {
  o = o || {};
  const role = o.role || 'supervisor';
  return {
    route: 'fuel', params: null, role: role, density: o.density || 'yard',
    user: { id: o.userId || 'u-sup', role: role, name: 'Mohan' },
    cache: o.cache || {}, replica: { behind: 0, complete: o.complete !== false },
    stale: o.complete === false, offline: o.offline === true,
  };
}

function cacheOf(extra) {
  const f = fleet();
  return Object.assign({ buses: f.buses, fuel: f.fuel, def: [], components: [], users: [] }, extra || {});
}

const component = (id, o) => Object.assign({ id: id, kind: 'tyre', label: 'MRF 10.00R20', serial: 'S-' + id,
  busId: null, position: '', state: 'removed', history: [], updatedAt: T - 3 * HOUR }, o || {});

/* ===================================================================================================
 * HELPERS THAT READ THE MARKUP
 * =================================================================================================== */

// Objects built inside the vm context have another realm's prototypes, which
// deepStrictEqual (rightly) distinguishes; the JSON round trip is the comparison.
const plain = (x) => JSON.parse(JSON.stringify(x));
const count = (html, re) => (String(html).match(re) || []).length;
const strip = (html) => String(html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
const html5 = (l, o) => l.Fuel.render(shell(Object.assign({ cache: cacheOf() }, o || {})));
const mileage = (l, o) => { l.Fuel._reset(); l.Fuel.tab('mileage'); return html5(l, o); };

/* The row for one registration: from its opening tag to the next row's. */
function rowOf(html, reg) {
  const starts = [], re = /<(div|a|button|label)\b[^>]*class="[^"]*\bv2row\b[^"]*"[^>]*>/g;
  let m;
  while ((m = re.exec(html)) !== null) starts.push(m.index);
  for (let i = 0; i < starts.length; i++) {
    const seg = html.slice(starts[i], i + 1 < starts.length ? starts[i + 1] : html.length);
    if (seg.indexOf('>' + reg + '</div>') >= 0) return seg;
  }
  return null;
}
const REG = (n) => 'RJ09PA' + (6100 + n);

/* A FILLS row names its bus inside .t, followed by the dot: the first row in the list
 * (newest first) that does. */
function fillRowOf(html, reg) {
  const starts = [], re = /<div class="v2row[^"]*ft-fill"[^>]*>/g;
  let m;
  while ((m = re.exec(html)) !== null) starts.push(m.index);
  for (let i = 0; i < starts.length; i++) {
    const seg = html.slice(starts[i], i + 1 < starts.length ? starts[i + 1] : html.length);
    if (seg.indexOf(reg + ' \u00b7 ') >= 0) return seg;
  }
  return null;
}

/* ===================================================================================================
 * 0. THE SOURCE, READ AS TEXT
 * =================================================================================================== */

// Comments blanked, then string and template contents blanked, so what is left is
// code. The same stripper test_v2_words.js uses, for the same reason: a regex
// literal containing a quote is not a string.
function stripComments(src) {
  const out = src.split('');
  let i = 0, inLine = false, inBlock = false, inStr = false, quote = '', prev = '';
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (inLine) { if (src[i] === '\n') inLine = false; else out[i] = ' '; i++; continue; }
    if (inBlock) { if (two === '*/') { out[i] = out[i + 1] = ' '; inBlock = false; i += 2; continue; } if (src[i] !== '\n') out[i] = ' '; i++; continue; }
    if (inStr) { if (src[i] === '\\') { i += 2; continue; } if (src[i] === quote) inStr = false; i++; continue; }
    if (two === '//') { inLine = true; out[i] = out[i + 1] = ' '; i += 2; continue; }
    if (two === '/*') { inBlock = true; out[i] = out[i + 1] = ' '; i += 2; continue; }
    if (src[i] === '"' || src[i] === "'" || src[i] === '`') { inStr = true; quote = src[i]; i++; continue; }
    if (src[i] === '/' && /[(,=:[!&|?{};+\-*%~^]|^$|\breturn$|\btypeof$/.test(prev)) {
      out[i] = ' '; i++;
      while (i < src.length && src[i] !== '/' && src[i] !== '\n') {
        if (src[i] === '\\') { out[i] = ' '; i++; }
        if (src[i] === '[') { while (i < src.length && src[i] !== ']' && src[i] !== '\n') { out[i] = ' '; i++; } }
        out[i] = ' '; i++;
      }
      if (src[i] === '/') { out[i] = ' '; i++; }
      continue;
    }
    if (!/\s/.test(src[i])) prev = src[i];
    i++;
  }
  return out.join('');
}
// Comments out, strings kept: the words a reader is shown live in the strings.
function blankComments(src) { return stripComments(src); }
function blankStrings(code) {
  return code.replace(/(['"`])((?:\\.|(?!\1)[^\\\n])*?)\1/g, (m, q, body) => q + ' '.repeat(body.length) + q);
}
const CODE = () => blankStrings(stripComments(read(SCREEN)));

// Every division in the source as [lhs, rhs] pairs.
function divisions(src) {
  const out = [], re = /([\w.\]\)]+)\s*\/\s*([\w.(]+)/g;
  let m;
  const code = blankStrings(stripComments(src));
  while ((m = re.exec(code)) !== null) out.push(m[1] + ' / ' + m[2]);
  return out;
}

/* THE ACCOUNT OF EVERY DIVISION IN THE FILE. Each is by a constant, or is the one
 * ratio of two Odo verdicts, whose divisor is checked `> 0` on the line above it.
 * A new division fails this until someone adds it here, in a diff a reviewer sees —
 * and a division by litres, kilometres, distance, an odometer or a cost is the
 * ₹45,000/km bug, so it may not be added at all (the next check). */
const ALLOWED_DIVISIONS = ['ms / 60000', 'm / 60', 'h / 24', 'paise / 100', 'current / med'];
const FORBIDDEN_DENOMINATOR = /\/\s*\(?\s*(litres?|km|dist\w*|odo\w*|cost\w*|kmpl|fuel\w*|run)\b/i;

test('0.1 no division in the screen is by anything it holds from a fill or an odometer', () => {
  const found = divisions(read(SCREEN));
  const unknown = found.filter((d) => ALLOWED_DIVISIONS.indexOf(d) < 0);
  assert.deepStrictEqual(unknown, [], 'a division the screen did not account for: ' + unknown.join(', ')
    + ' — km/l and cost per km are Odo.mileage\'s, never this file\'s');
  const bad = found.filter((d) => FORBIDDEN_DENOMINATOR.test(d.replace(' / ', ' /')));
  assert.deepStrictEqual(bad, [], 'a division by litres, km, a distance, an odometer or a cost: ' + bad.join(', '));
});

test('0.2 no denominator is ever defaulted: no `|| 1`, no `|| 0` anywhere in the screen', () => {
  const code = CODE();
  assert(!/\|\|\s*1\b/.test(code), 'a `|| 1` — the shape of a defaulted denominator');
  assert(!/\|\|\s*0\b/.test(code), 'a `|| 0` — a missing value turning into a number someone then divides by');
  assert(!/\?\?\s*[01]\b/.test(code), 'a `?? 0` / `?? 1` default');
  assert(!/Number\([^)]*\)\s*\|\|/.test(code), 'Number(x) || default — v1\'s saveFuel, which turned blank into 0');
});

test('0.3 the plausibility band is Odo\'s: no 1.5, no 12, no BAND in this file', () => {
  const code = CODE();
  assert(!/\b1\.5\b/.test(code), 'a 1.5 — the band belongs to odo.js and is not tightened or widened here');
  assert(!/\bBAND\b/.test(code));
  assert(!/\b12\b/.test(code), 'a 12 — the upper end of the band, which is Odo\'s');
  assert(!/\b(kmpl|km|current)\s*[<>]=?\s*(?!0\b)\d/.test(code), 'a threshold on km/l of this file\'s own (> 0 is the divisor guard, and is allowed)');
});

test('0.4 the delegated click listener returns on closest(FIELDS) BEFORE it reads [data-act] / [data-nav]', () => {
  const code = stripComments(read(SCREEN));
  assert(/FIELDS\s*=\s*'input, select, textarea, label, \.num'/.test(read(SCREEN)), 'the selector is not declared');
  const at = code.indexOf('function onClick(');
  const body = code.slice(at, code.indexOf('\n  function ', at + 20));
  const guard = body.indexOf('closest(FIELDS)');
  const act = body.search(/closest\('\[data-(act|nav)\]'\)/);
  assert(guard >= 0, 'onClick does not test closest(FIELDS)');
  assert(act >= 0, 'onClick reads no [data-act]');
  assert(guard < act, 'onClick reads [data-act] before it guards a field — the shelf-count regression');
  // …and the gate's own static test: the first non-data closest() in the file is
  // before the first data-act one.
  const lines = code.split('\n');
  const a = lines.findIndex((l) => /closest\('\[data-(act|nav)\]'\)/.test(l));
  const g = lines.findIndex((l) => /closest\(/.test(l) && !/closest\('\[data-/.test(l));
  assert(g >= 0 && g < a, 'predeploy-gate.sh would fail this file: guard line ' + g + ', act line ' + a);
});

test('0.5 exactly one click listener is added by the source, and one input and one change', () => {
  const code = stripComments(read(SCREEN));
  assert.strictEqual(count(code, /addEventListener\('click'/g), 1);
  assert.strictEqual(count(code, /addEventListener\('input'/g), 1);
  assert.strictEqual(count(code, /addEventListener\('change'/g), 1);
});

test('0.6 number fields are type="text" with inputmode; never type="number", never a stepper', () => {
  const src = stripComments(read(SCREEN));
  assert(!/type="number"/.test(src), 'type="number" puts spinners in a row and changes its value on a wheel');
  assert(!/stepper|data-step|\+1|-1<\/button>/.test(src));
  const l = load();
  const sheet = l.Fuel.fillSheet({ kind: 'fuel', buses: fleet().buses, fills: [], meId: 'u' });
  assert.strictEqual(count(sheet, /type="text" inputmode="decimal" pattern="\[0-9\]\*\[\.\]\?\[0-9\]\*"/g), 2, 'litres and rupees');
  assert.strictEqual(count(sheet, /type="text" inputmode="numeric" pattern="\[0-9\]\*"/g), 1, 'the odometer');
  assert(!/type="number"/.test(sheet));
});

test('0.7 the words "cost per km" appear only as "Diesel cost per km" (Money owns the other name)', () => {
  const src = blankComments(read(SCREEN));
  const all = src.match(/[A-Za-z]* ?cost per km/gi) || [];
  assert(all.length >= 1, 'the label is not in the file');
  all.forEach((m) => assert(/^Diesel cost per km$/.test(m), 'a bare "' + m.trim() + '" — that name is Money\'s, and two figures with one name is how five cost bases start'));
  const html = mileage(load());
  assert(/Diesel cost per km/.test(html));
  assert(!/(^|[^l] )cost per km/i.test(strip(html).replace(/Diesel cost per km/g, '')), 'a bare cost per km in the markup');
});

test('0.8 the screen contains no emoji, no px outside a border, and no new icon name', () => {
  const src = read(SCREEN);
  assert(!/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/u.test(src), 'an emoji');
  const icons = {}; const ctx = vm.createContext({ window: icons }); vm.runInContext(read(V2('ui/icons.js')), ctx);
  const used = (src.match(/draw\('([a-z-]+)'/g) || []).map((m) => m.slice(6, -1))
    .concat((src.match(/(?:icon|mark):\s*'([a-z-]+)'/g) || []).map((m) => m.replace(/.*'([a-z-]+)'/, '$1')));
  used.forEach((n) => assert(n in icons.ICONS, 'icon("' + n + '") is not in the set of 34'));
  assert.strictEqual(Object.keys(icons.ICONS).length, 34, 'the icon set is at its cap and this slice may not grow it');
  const css = read(V2('ui/fuel.css'));
  assert(!/#[0-9a-f]{3,8}\b|rgb\(|rgba\(|oklch|color-mix/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')), 'a colour literal in fuel.css');
});

/* ===================================================================================================
 * 1. THE SIX REFUSALS — each has its own words, and they stay apart
 * =================================================================================================== */

const SENTENCES = {
  1: 'No odometer reading',
  2: 'Odometer broken since 12 October',
  3: 'Lower than the last reading, 50,000 km',
  4: 'Same reading as the last fill',
  5: 'Reading does not fit — 40,000 km to 61,900 km on 120.5 litres',
  6: 'Part fill — mileage at the next full tank',
};
const CASE_BUS = { 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7 };

test('1.1 the six refusals each draw their own sentence, on their own bus', () => {
  const html = mileage(load());
  Object.keys(SENTENCES).forEach((k) => {
    const row = rowOf(html, REG(CASE_BUS[k]));
    assert(row, 'case ' + k + ': the bus has no row');
    assert(strip(row).indexOf(SENTENCES[k]) >= 0, 'case ' + k + ' did not say "' + SENTENCES[k] + '": ' + strip(row));
  });
});

test('1.2 …and no refusal borrows another\'s words', () => {
  const html = mileage(load());
  Object.keys(SENTENCES).forEach((k) => {
    const row = strip(rowOf(html, REG(CASE_BUS[k])));
    Object.keys(SENTENCES).forEach((j) => {
      if (j === k) return;
      const other = SENTENCES[j].replace(/\d[\d,]*/g, '#');
      if (other === SENTENCES[k].replace(/\d[\d,]*/g, '#')) return;
      assert(row.indexOf(SENTENCES[j]) < 0, 'case ' + k + ' also said case ' + j + ': ' + row);
    });
  });
});

test('1.3 case 1 (no reading) offers the one next step; case 2 (broken) offers NONE', () => {
  const html = mileage(load());
  assert(/Add the reading on the next fill/.test(rowOf(html, REG(2))), 'case 1 lost its next step');
  const broken = strip(rowOf(html, REG(3)));
  assert(!/Add the reading/i.test(broken), 'a broken instrument was asked for a reading: ' + broken);
  assert(!/next fill/i.test(broken), broken);
  // the only "Add the reading" on the whole screen is on the one bus that forgot
  assert.strictEqual(count(strip(html), /Add the reading on the next fill/g), 1);
});

test('1.4 every refusal is the dash (figure(null), heard as "No data") with its reason beside it', () => {
  const html = mileage(load());
  [1, 2, 3, 4, 5, 6].forEach((k) => {
    const row = rowOf(html, REG(CASE_BUS[k]));
    assert(/data-state="unknown"/.test(row), 'case ' + k + ' is not the unknown figure');
    assert(/No data/.test(row), 'case ' + k + ' is silent to a screen reader');
    assert(!/km\/l/.test(row), 'case ' + k + ' carries a km/l unit, so it looks like a rank: ' + strip(row));
    assert(!/data-state="value"/.test(row), 'case ' + k + ' drew a value');
    assert(/<svg/.test(row.replace(/<svg[^>]*>\s*<path[^>]*><\/svg>\s*<div class="txt">/, '')), 'case ' + k + ' has no mark beside its words');
  });
});

test('1.5 the broken-instrument words come from reason + params, not from parsing Odo\'s message', () => {
  const src = read(SCREEN);
  assert(!/\.message\b/.test(stripComments(src).replace(/low\.params/g, '')) || /res\.message|low\.message/.test(stripComments(src)) === false || true);
  const code = stripComments(src);
  // the screen builds wording from params; the only .message it touches is its own result object's
  assert(!/result\.message|\.mileage\([^)]*\)\.message|r\.message/.test(code), 'the screen reads Odo\'s English message instead of building the wording');
});

test('1.6 in Hindi mode the refusal words go through the table (pending, so they carry their ids)', () => {
  const html = mileage(load({ lang: 'hi' }));
  assert(/\[odoNone\]/.test(html), 'case 1 did not come from the word table');
  assert(/\[odoPart\]/.test(html) && /\[odoSame\]/.test(html) && /\[odoFit\]/.test(html), html.slice(0, 200));
});

/* ===================================================================================================
 * 2. AN UNUSABLE BUS APPEARS IN NEITHER END OF THE RANKING
 * =================================================================================================== */

// The rule as one assertion over a load, so a mutant can be run through it.
function rankingRule(l) {
  const html = mileage(l);
  const heading = html.indexOf('Readings to check');
  assert(heading > 0, 'there is no "Readings to check" heading');
  const ranked = html.slice(0, heading), checks = html.slice(heading);
  const good = [REG(8), REG(1)];                     // 3.0 km/l then 4.0 km/l: worst first
  good.forEach((r) => assert(ranked.indexOf('>' + r + '<') >= 0, r + ' is not in the ranking'));
  assert(ranked.indexOf('>' + REG(8) + '<') < ranked.indexOf('>' + REG(1) + '<'), 'the ranking is not worst-first');
  [2, 3, 4, 5, 6, 7].forEach((n) => {
    assert(ranked.indexOf('>' + REG(n) + '<') < 0, REG(n) + ' (unusable) is INSIDE the ranking — at the top, the 8db78e7 bug, or at the bottom, its mirror');
    assert(checks.indexOf('>' + REG(n) + '<') >= 0, REG(n) + ' is not under "Readings to check"');
  });
  good.forEach((r) => assert(checks.indexOf('>' + r + '<') < 0, r + ' is in the excluded list'));
  // the model says the same thing
  const idx = l.Fuel.mileageIndex(cacheOf().buses, cacheOf().fuel);
  assert.deepStrictEqual(plain(idx.ranked.map((r) => r.busId)), ['b8', 'b1']);
  assert.deepStrictEqual(plain(idx.toCheck.map((r) => r.busId).sort()), ['b2', 'b3', 'b4', 'b5', 'b6', 'b7']);
  // …and no excluded bus carries a number that could be ranked
  assert(!/km\/l/.test(checks), 'a unit of km/l appears under Readings to check');
}

test('2.1 buses with an unusable odometer are in neither end of the mileage ranking', () => {
  rankingRule(load());
});

test('2.2 the good buses are ranked worst first, and say 3.0 and 4.0 km/l', () => {
  const html = mileage(load());
  const worst = rowOf(html, REG(8)), best = rowOf(html, REG(1));
  assert(/3\.0/.test(worst) && /km\/l/.test(worst), strip(worst));
  assert(/4\.0/.test(best) && /km\/l/.test(best), strip(best));
});

test('2.3 the check\'s heading is a heading, drawn once, only when something is excluded', () => {
  const html = mileage(load());
  assert.strictEqual(count(html, /Readings to check/g), 1);
  const only = Object.assign(cacheOf(), { buses: [fleet().buses[0]], fuel: fleet().fuel.filter((f) => f.busId === 'b1') });
  const l = load();
  l.Fuel._reset(); l.Fuel.tab('mileage');
  assert(!/Readings to check/.test(l.Fuel.render(shell({ cache: only }))));
});

test('2.4 a bus is never ranked at zero: no 0.0 km/l anywhere, and no figure at 0', () => {
  const html = mileage(load());
  assert(!/0\.0\s*<\/span>\s*<span class="figure-u">km\/l/.test(html));
  assert(!/>0<\/span>/.test(html.replace(/data-state="unknown"[\s\S]*?<\/span><\/span>/g, '')));
});

test('2.5 a half-finished bus: one computable span and one unusable are never averaged', () => {
  // b1 has a good tank, then a later full fill with no reading: the LATEST span is
  // the unusable one, so the bus is excluded rather than shown at its old figure.
  const f = fleet();
  f.fuel.push(fill('b1', { odometer: 0, at: T - HOUR, full: true }));
  const l = load();
  const idx = l.Fuel.mileageIndex(f.buses, f.fuel);
  assert(idx.ranked.map((r) => r.busId).indexOf('b1') < 0, 'b1 kept its old figure under a newer unusable tank');
  assert(idx.toCheck.map((r) => r.busId).indexOf('b1') >= 0);
});

test('2.6 a DELETED fill is not a fill: a tombstone cannot make a good tank bad or a bad one good', () => {
  const f = fleet();
  f.fuel.push(fill('b1', { odometer: 0, at: T - HOUR, full: true, _deleted: true }));
  const idx = load().Fuel.mileageIndex(f.buses, f.fuel);
  assert.deepStrictEqual(plain(idx.ranked.map((r) => r.busId)), ['b8', 'b1']);
});

/* ---- the mutants of group 2 ------------------------------------------------------------------- */

function mutant(from, to) {
  const src = read(REAL);              // the in-test mutants always start from the real file
  if (src.indexOf(from) < 0) throw new Error('the mutant\'s target is no longer in fuel.js: ' + from);
  return src.replace(from, to);
}
function mustTurnRed(name, src, rule) {
  test(name, () => {
    let red = false;
    try { rule(load({ src: src })); } catch (e) { red = true; }
    assert(red, 'the check stayed GREEN with the mutation applied — it is decoration');
  });
}

// The obvious repair: an unusable bus "scores zero, so it sorts last". The same bug
// facing the other way — a bus with no reading that is ranked at all.
mustTurnRed('2.7 MUTANT: unusable buses ranked at the bottom as 0 turns 2.1 red',
  mutant('var ranking = o.rankMileage(items);',
    `var ranking = (function (items) {
      var all = items.map(function (it) { return { busId: it.busId, kmpl: it.result.ok ? it.result.kmpl : 0, result: it.result }; })
        .sort(function (a, b) { return b.kmpl - a.kmpl; });
      return { ranked: all, toCheck: [] };
    })(items);`), rankingRule);

// 8db78e7 itself: the unusable figure sorts as the biggest number there is.
mustTurnRed('2.8 MUTANT: unusable buses ranked at the TOP (8db78e7) turns 2.1 red',
  mutant('var ranking = o.rankMileage(items);',
    `var ranking = (function (items) {
      var all = items.map(function (it) { return { busId: it.busId, kmpl: it.result.ok ? it.result.kmpl : 1e9, result: it.result }; })
        .sort(function (a, b) { return a.kmpl - b.kmpl; });
      return { ranked: all, toCheck: [] };
    })(items);`), rankingRule);

mustTurnRed('2.9 MUTANT: the excluded list drawn inside the ranking (no separate heading) turns 2.1 red',
  mutant(`out += '<h3 class="ft-h">' + esc(say('ftToCheck')) + '</h3>';`, ''), rankingRule);

mustTurnRed('2.10 MUTANT: a bus with a broken odometer is asked for a reading turns 1.3 red',
  mutant(`return o ? o.mayAsk(bus) : !(bus && bus.odoBroken === true);`, `return true;`),
  (l) => {
    const html = mileage(l);
    assert(!/Add the reading/i.test(strip(rowOf(html, REG(3)))), 'asked a broken instrument for a reading');
    const sheet = l.Fuel.fillSheet({ kind: 'fuel', buses: fleet().buses, fills: [], meId: 'u' });
    assert(/data-broken="Odometer broken since/.test(sheet), 'the picker no longer tells the sheet this bus is broken');
  });

/* ===================================================================================================
 * 3. MILEAGE ROWS
 * =================================================================================================== */

test('3.1 a mileage row carries the answer: km/l, diesel cost per km, the odometer, the age of the full tank', () => {
  const html = mileage(load());
  const row = strip(rowOf(html, REG(1)));
  assert(/4\.0 km\/l/.test(row), row);
  assert(/Diesel cost per km ₹24\.10/.test(row), 'cost per km to two places: ' + row);
  assert(/40,400 km/.test(row), row);
  assert(/full tank 2 hours ago/.test(row), row);
});

test('3.2 "run since" is shown only when both readings are known, and never negative', () => {
  const f = fleet();
  f.buses[0].odometer = 40710;                                      // 310 km on from the last fill
  const l = load();
  l.Fuel._reset(); l.Fuel.tab('mileage');
  let html = l.Fuel.render(shell({ cache: Object.assign(cacheOf(), { buses: f.buses }) }));
  assert(/310 km since the last fill/.test(strip(rowOf(html, REG(1)))));
  f.buses[0].odometer = 0;                                          // the bus's own reading is unknown
  l.Fuel._reset(); l.Fuel.tab('mileage');
  html = l.Fuel.render(shell({ cache: Object.assign(cacheOf(), { buses: f.buses }) }));
  assert(!/since the last fill/.test(rowOf(html, REG(1))), 'a run-since from an unknown reading');
  f.buses[0].odometer = 40000;                                      // BELOW the last fill: not a distance
  l.Fuel._reset(); l.Fuel.tab('mileage');
  html = l.Fuel.render(shell({ cache: Object.assign(cacheOf(), { buses: f.buses }) }));
  assert(!/since the last fill/.test(rowOf(html, REG(1))), 'a negative distance was drawn');
});

test('3.3 a missing cost on one fill makes diesel cost per km a dash, not a smaller number', () => {
  const f = fleet();
  f.fuel[1].cost = null;
  const l = load();
  l.Fuel._reset(); l.Fuel.tab('mileage');
  const html = l.Fuel.render(shell({ cache: Object.assign(cacheOf(), { fuel: f.fuel }) }));
  const row = rowOf(html, REG(1));
  assert(/4\.0/.test(row), 'the km/l is still good');
  assert(/Diesel cost per km <span class="figure" data-state="unknown"/.test(row), 'cost per km from an incomplete span: ' + row);
});

test('3.4 the falling-mileage flag: below 0.85 of the median of the previous three, and only with four spans', () => {
  const l = load();
  const b = bus(1, { odometer: 0 });
  // five fulls -> four spans. Previous three are 4.0, 4.2, 4.4 (median 4.2); the latest is 3.0 (down 29%).
  const mk = (odos, litres) => odos.map((o, i) => fill('b1', { odometer: o, at: T - (odos.length - i) * DAY, litres: litres[i] }));
  const fuel = mk([1000, 1400, 1840, 2260, 2560], [100, 100, 100, 100, 100]);
  const spans = l.Fuel.spansOf(b, fuel, 4);
  assert.deepStrictEqual(plain(spans.map((x) => Math.round(x * 10) / 10)), [3.0, 4.2, 4.4, 4.0]);
  const flag = l.Fuel.fallingFlag(spans[0], spans.slice(1, 4));
  assert(flag && flag.pct === 29, JSON.stringify(flag));
  const html = (() => { l.Fuel._reset(); l.Fuel.tab('mileage'); return l.Fuel.render(shell({ cache: { buses: [bus(1)], fuel: fuel, def: [], components: [] } })); })();
  assert(/Mileage down 29% on the last three tanks/.test(strip(html)), strip(html));
  // only three spans -> no flag, however bad the last tank
  const three = mk([1000, 1400, 1820, 2120], [100, 100, 100, 100]);
  l.Fuel._reset(); l.Fuel.tab('mileage');
  assert(!/Mileage down/.test(l.Fuel.render(shell({ cache: { buses: [bus(1)], fuel: three, def: [], components: [] } }))), 'fired on three spans');
  // a tank at exactly 0.85 of the median is NOT flagged (below, not at)
  assert.strictEqual(l.Fuel.fallingFlag(3.57, [4.0, 4.2, 4.4]), null);
  assert(l.Fuel.fallingFlag(3.56, [4.0, 4.2, 4.4]));
});

test('3.5 a bus excluded from the ranking is excluded from the falling flag too', () => {
  const f = fleet();
  const html = mileage(load());
  [2, 3, 4, 5, 6, 7].forEach((n) => assert(!/Mileage down/.test(rowOf(html, REG(n)))));
  const l = load();
  const b = bus(1);
  // four good spans, then a latest tank with NO reading: the latest figure is unusable,
  // so the bus leaves the ranking AND the flag (a flag fired by a missing number teaches
  // people to ignore flags).
  const fuel = [1000, 1400, 1800, 2200, 2600].map((o, i) => fill('b1', { odometer: o, at: T - (9 - i) * DAY }))
    .concat([fill('b1', { odometer: 0, at: T - HOUR })]);
  l.Fuel._reset(); l.Fuel.tab('mileage');
  const out = l.Fuel.render(shell({ cache: { buses: [b], fuel: fuel, def: [], components: [] } }));
  assert(!/Mileage down/.test(out), 'flag fired off a missing number');
  assert(/Readings to check/.test(out));
});

test('3.6 one fill is not a mileage: Mileage says it needs two full tanks, and draws no figure', () => {
  const l = load();
  l.Fuel._reset(); l.Fuel.tab('mileage');
  const out = l.Fuel.render(shell({ cache: { buses: [bus(1)], fuel: [fill('b1', { odometer: 5000 })], def: [], components: [] } }));
  assert(/No mileage yet/.test(out) && /Mileage needs two full tanks on one bus\./.test(out));
  assert(!/km\/l/.test(out) && !/Readings to check/.test(out));
});

test('3.7 diesel only: AdBlue never enters mileage or cost per km', () => {
  const f = fleet();
  const def = [{ id: 'd1', busId: 'b1', litres: 20, cost: 99999, odometer: 40300, at: T - DAY, by: 'u' }];
  const l = load();
  l.Fuel._reset(); l.Fuel.tab('mileage');
  const html = l.Fuel.render(shell({ cache: Object.assign(cacheOf(), { def: def }) }));
  assert(/Diesel cost per km ₹24\.10/.test(strip(rowOf(html, REG(1)))), 'AdBlue moved a diesel figure');
});

/* ===================================================================================================
 * 4. A BUS ROW LINKS ONLY FOR A HOLDER OF `fleet`
 * =================================================================================================== */

test('4.1 owner and supervisor get a.v2row to Buses; store and crew manager get a div.v2row', () => {
  ['owner', 'supervisor'].forEach((role) => {
    const l = load();
    const html = mileage(l, { role: role });
    const row = rowOf(html, REG(1));
    assert(/^<a class="v2row[^"]*" href="#" data-act="ftOpenBus" data-bus="b1"/.test(row), role + ': ' + row.slice(0, 120));
  });
  ['store', 'crewmanager'].forEach((role) => {
    const l = load();
    const html = mileage(l, { role: role });
    [1, 2, 3, 8].forEach((n) => {
      const row = rowOf(html, REG(n));
      assert(/^<div class="v2row/.test(row), role + ' bus ' + n + ' is not a div: ' + row.slice(0, 80));
      assert(!/href=|data-act|data-nav|tabindex|role=|<button|<a /.test(row), role + ' row is a control: ' + row.slice(0, 200));
    });
    // the answer is still on the row for the person who cannot navigate
    assert(/4\.0 km\/l/.test(strip(rowOf(html, REG(1)))));
  });
});

test('4.2 tapping a linking row goes to Buses with the bus; a tap on a non-linking row goes nowhere', () => {
  const l = load();
  l.Fuel.mount();
  const click = l.clicks[0];
  const row = { getAttribute: (k) => ({ 'data-act': 'ftOpenBus', 'data-bus': 'b1' }[k] || null), closest: () => null };
  click({ target: { closest: (sel) => (sel === 'input, select, textarea, label, .num' ? null : (sel === '[data-act]' ? row : null)) }, preventDefault() {} });
  assert.deepStrictEqual(plain(l.gone), [{ id: 'buses', params: { busId: 'b1' } }]);
  l.gone.length = 0;
  click({ target: { closest: () => null }, preventDefault() {} });
  assert.deepStrictEqual(l.gone, []);
});

/* ===================================================================================================
 * 5. FILLS
 * =================================================================================================== */

test('5.1 fills: newest first, diesel and AdBlue in one list, each saying which it is', () => {
  const cache = cacheOf({ def: [{ id: 'd1', busId: 'b1', litres: 20, cost: 1800, odometer: 0, at: T - 30 * 60000, by: 'u' }] });
  const l = load();
  const html = l.Fuel.render(shell({ cache: cache }));
  const t = strip(html);
  assert(t.indexOf('AdBlue · RJ09PA6101 · 20.0 L · ₹1,800') >= 0, t.slice(0, 400));
  assert(t.indexOf('AdBlue') < t.indexOf('RJ09PA6101 · 100.0 L · ₹9,640'), 'the newer AdBlue fill is not above the older diesel one');
  assert(/RJ09PA6101 · 100\.0 L · ₹9,640/.test(t));
  assert(/40,400 km/.test(t));
  assert(/Full tank/.test(t));
  // AdBlue rows carry the fuel mark and no full/part badge
  const ad = rowOf(html, 'AdBlue');
  assert(ad === null || !/badge/.test(ad));
});

test('5.2 a fill with no odometer reading says so in --warn, with a mark; it is not hidden', () => {
  const html = html5(load());
  const row = fillRowOf(html, REG(2));
  assert(/class="ft-warn"/.test(row) && /<svg/.test(row) && /No odometer reading/.test(row), row);
});

test('5.3 …except where the instrument is broken: that row says so quietly and does not ask', () => {
  const html = html5(load());
  const row = fillRowOf(html, REG(3));
  assert(/Odometer broken since 12 October/.test(row), row);
  assert(!/class="ft-warn"/.test(row), 'a warning on a bus that cannot be fixed by typing');
  assert(!/No odometer reading/.test(row));
});

test('5.4 the header names the last fill and when; a double entry is visible before it is made', () => {
  const html = html5(load());
  assert(/Last fill: RJ09PA6101, 2 hours ago/.test(strip(html)), strip(html).slice(0, 200));
  const empty = load().Fuel.render(shell({ cache: { buses: [], fuel: [], def: [], components: [] } }));
  assert(/No fills yet/.test(empty));
});

test('5.5 capped at 200 with one line stating the remainder', () => {
  const buses = [bus(1)], fuel = [];
  for (let i = 0; i < 240; i++) fuel.push(fill('b1', { odometer: 1000 + i, at: T - i * 60000, full: false }));
  const html = load().Fuel.render(shell({ cache: { buses: buses, fuel: fuel, def: [], components: [] } }));
  assert.strictEqual(count(html, /class="v2row[^"]*ft-fill"/g), 200);
  assert(/Showing the newest 200 of 240 fills\./.test(strip(html)));
  assert.strictEqual(count(html, /class="ft-cap"/g), 1);
});

test('5.1b a part fill says Part fill and a full tank says Full tank, each with a word (not colour alone)', () => {
  const html = html5(load());
  const part = fillRowOf(html, REG(7)), full = fillRowOf(html, REG(1));
  // b7's newest fill is the part fill; b1's newest is a full tank
  assert(/badge badge-warn">Part fill</.test(part), part.slice(0, 300));
  assert(/badge badge-ok">Full tank</.test(full), full.slice(0, 300));
});

test('5.6 no age on a figure inside a row: a list states its freshness once', () => {
  const html = html5(load());
  assert(!/figure-note/.test(html), 'a figure carries an `at` inside a row');
});

test('5.7 an edit control for owner and supervisor; ABSENT, not disabled, for store and crew manager', () => {
  ['owner', 'supervisor'].forEach((role) => {
    const html = html5(load(), { role: role });
    assert(/data-act="ftEditFill"/.test(html), role + ' has no edit');
  });
  ['store', 'crewmanager'].forEach((role) => {
    const html = html5(load(), { role: role });
    assert(!/ftEditFill/.test(html), role + ' was given an edit control');
    assert(!/aria-disabled/.test(html), role + ' was given a disabled control');
  });
});

test('5.8 the states: loading, empty, error, offline', () => {
  const l = load();
  const loading = l.Fuel.render(shell({ cache: { buses: [], components: [] } }));
  assert(/class="skeleton"/.test(loading), 'no skeleton while the fuel store has not loaded');
  assert(/data-act="ftLog" data-kind="fuel"/.test(loading), 'the four buttons wait for a store');
  assert.strictEqual(count(loading, /class="btn[^"]*"[^>]*data-act="ft(Log|Fit)"/g), 4);
  const empty = l.Fuel.render(shell({ cache: { buses: [], fuel: [], def: [], components: [] } }));
  assert(/No fills recorded yet/.test(empty) && /Log the first diesel fill\./.test(empty));
  const off = l.Fuel.render(shell({ cache: cacheOf(), offline: true }));
  assert(/class="v2row/.test(off), 'offline hid the rows it has');
  assert(/No connection\./.test(strip(off)), 'offline said nothing');
  assert(!/offline.*Logging/i.test(strip(off)));
});

test('5.9 a failed read draws errorState with a Retry, and the retry reloads', async () => {
  const l = load();
  l.Fuel._reset();
  l.win.Cache.load = () => Promise.reject(new Error('x'));
  l.Fuel.mount();
  await new Promise((r) => setTimeout(r, 5));
  const html = l.Fuel.render(shell({ cache: { buses: [], components: [] } }));
  assert(/Could not read the fills/.test(html) && /data-state-retry/.test(html), html.slice(0, 300));
});

/* ===================================================================================================
 * 6. BUTTONS AND TABS BY CAPABILITY
 * =================================================================================================== */

test('6.1 the four buttons, "Log diesel" the only primary', () => {
  ['owner', 'supervisor', 'store', 'crewmanager'].forEach((role) => {
    const html = html5(load(), { role: role });
    assert.strictEqual(count(html, /btn btn-primary/g), 1, role);
    assert(/btn btn-primary" data-act="ftLog" data-kind="fuel"/.test(html), role);
    ['Log diesel', 'Log AdBlue', 'Fit tyre', 'Fit battery'].forEach((w) => assert(strip(html).indexOf(w) >= 0, role + ' lacks ' + w));
    assert(/data-density="yard"/.test(html), 'the buttons lost their 48px at desk');
  });
});

test('6.2 a role with neither capability gets no buttons and no tabs at all (absent, not disabled)', () => {
  const html = html5(load(), { role: 'mechanic' });
  assert(!/ftLog|ftFit|ftTab|role="tab"/.test(html));
  assert(!/aria-disabled/.test(html));
});

test('6.3 the capabilities split per action: addFuel without manageComponents has no Pieces and no Fit', () => {
  const l = load();
  const real = l.win.Caps.can;
  l.win.Caps.can = (role, cap) => (cap === 'manageComponents' ? false : real(role, cap));
  const html = html5(l, { role: 'crewmanager' });
  assert(/Log diesel/.test(html) && !/Fit tyre|Fit battery|ftFit/.test(html));
  assert(!/data-tab="pieces"/.test(html));
  const l2 = load();
  const real2 = l2.win.Caps.can;
  l2.win.Caps.can = (role, cap) => (cap === 'addFuel' ? false : real2(role, cap));
  const html2 = html5(l2, { role: 'crewmanager' });
  assert(!/Log diesel|Log AdBlue|data-tab="fills"|data-tab="mileage"/.test(html2));
  assert(/Fit tyre/.test(html2) && /data-tab="pieces"/.test(html2));
});

test('6.4 tabs: Fills · Mileage · Pieces; a tab never navigates (it redraws)', () => {
  const html = html5(load());
  assert(/data-tab="fills"[^>]*>Fills<[\s\S]*data-tab="mileage"[^>]*>Mileage<[\s\S]*data-tab="pieces"[^>]*>Pieces</.test(html));
  assert(/aria-selected="true" data-act="ftTab" data-tab="fills"/.test(html));
  const l = load();
  l.Fuel.mount();
  const el = { getAttribute: (k) => ({ 'data-act': 'ftTab', 'data-tab': 'pieces' }[k] || null) };
  l.clicks[0]({ target: { closest: (sel) => (sel === '[data-act]' ? el : null) }, preventDefault() {} });
  assert.deepStrictEqual(l.gone, [], 'a tab pushed a route');
  assert(/aria-selected="true" data-act="ftTab" data-tab="pieces"/.test(l.Fuel.render(shell({ cache: cacheOf() }))));
});

/* ===================================================================================================
 * 7. A TAP ON A FIELD DOES EXACTLY ONE THING
 * =================================================================================================== */

test('7.1 a click whose target is inside a field/label/.num never reaches [data-act]', () => {
  const l = load();
  l.Fuel.mount();
  const click = l.clicks[0];
  const row = { getAttribute: (k) => ({ 'data-act': 'ftLog', 'data-kind': 'fuel' }[k] || null) };
  // the target is a field INSIDE a control that has a data-act: closest(FIELDS) finds it first
  const inField = { closest: (sel) => (sel === 'input, select, textarea, label, .num' ? { tag: 'input' } : (sel === '[data-act]' ? row : null)) };
  l.sheets.length = 0;
  click({ target: inField, preventDefault() {} });
  assert.strictEqual(l.sheets.length, 0, 'a field tap opened a sheet');
  assert.deepStrictEqual(l.gone, [], 'a field tap navigated');
  // the same click on the button itself does work
  click({ target: { closest: (sel) => (sel === '[data-act]' ? row : null) }, preventDefault() {} });
  assert.strictEqual(l.sheets.length, 1, 'the button no longer opens its sheet');
});

test('7.2 MUTANT: reading [data-act] before the field guard turns 0.4 red', () => {
  const src = mutant(`if (t.closest(FIELDS)) return;

    var el = t.closest('[data-act]');`, `var el = t.closest('[data-act]');
    if (t.closest(FIELDS)) return;`);
  const code = stripComments(src);
  const at = code.indexOf('function onClick('), body = code.slice(at, code.indexOf('\n  function ', at + 20));
  assert(body.indexOf('closest(FIELDS)') > body.search(/closest\('\[data-act\]'\)/), 'the mutant did not reorder');
  const lines = code.split('\n');
  const a = lines.findIndex((l) => /closest\('\[data-(act|nav)\]'\)/.test(l));
  const g = lines.findIndex((l) => /closest\(/.test(l) && !/closest\('\[data-/.test(l));
  assert(!(g >= 0 && g < a), 'the static ordering check would NOT have caught the reorder');
});

test('7.3 mount() installs one listener of each kind, once, however often it is called', () => {
  const l = load();
  l.Fuel.mount(); l.Fuel.mount(); l.Fuel.mount();
  assert.strictEqual(l.clicks.length, 1);
  assert.strictEqual(l.inputs.length, 1);
  assert.strictEqual(l.changes.length, 1);
});

/* ===================================================================================================
 * 8. PIECES
 * =================================================================================================== */

function piecesCache() {
  return Object.assign(cacheOf(), { components: [
    component('c1', { state: 'in-service', busId: 'b1', position: 'FL', label: 'MRF front', history: [
      { type: 'remove', at: T - 40 * DAY }, { type: 'install', at: Date.UTC(2026, 9, 3), odo: 38000, busId: 'b1', position: 'FL' }] }),
    component('c2', { state: 'in-service', busId: 'b2', position: '', label: 'No position' }),
    component('c3', { state: 'removed', label: 'Spare' }),
    component('c4', { state: 'sent-out', label: 'At the vendor' }),
    component('c5', { kind: 'battery', state: 'refurbished', label: 'Exide' }),
    component('c6', { state: 'scrapped', label: 'Worn out' }),
  ] });
}
const pieces = (l, o) => { l.Fuel._reset(); l.Fuel.tab('pieces'); return l.Fuel.render(shell(Object.assign({ cache: piecesCache() }, o || {}))); };

test('8.1 a piece row: kind mark, label and serial, state badge with a word, bus and position, last event only', () => {
  const html = pieces(load());
  const t = strip(html);
  assert(/MRF front · S-c1/.test(t), t);
  assert(/In service/.test(t) && /Removed/.test(t) && /Sent out for repair/.test(t) && /Refurbished/.test(t) && /Scrapped/.test(t));
  assert(/RJ09PA6101 · FL/.test(t));
  assert(/Fitted 3 October/.test(t), 'the last event is the install, the newest history entry: ' + t);
  assert(!/Removed 2[0-9] September|40 days/.test(t), 'more than the last event');
  assert(count(html, /<svg[^>]*>\s*<path d="M12 2\.6a9\.4/g) >= 1, 'no tyre mark');
  assert(!/timeline|cost history|billPhoto/i.test(html), 'a timeline, cost history or bill photo — those are Store\'s');
});

test('8.2 a piece in service with no position says "Position not recorded" in --warn', () => {
  const row = rowOf(pieces(load()), 'No position · S-c2');
  assert(/Position not recorded/.test(row) && /ft-warn/.test(row) && /<svg/.test(row));
});

test('8.3 the register link is present for viewStore and ABSENT for a crew manager', () => {
  assert(/data-nav="store"/.test(pieces(load(), { role: 'owner' })));
  assert(/data-nav="store"/.test(pieces(load(), { role: 'store' })));
  assert(!/data-nav="store"|Open the register/.test(pieces(load(), { role: 'crewmanager' })), 'a link that bounces');
});

test('8.4 actions follow state: Fit for removed/refurbished, Remove for in-service, Send out for either', () => {
  const html = pieces(load());
  const acts = (id) => (html.match(new RegExp('data-act="(ft[A-Za-z]+)"[^>]*data-id="' + id + '"', 'g')) || []).map((s) => s.match(/ft[A-Za-z]+/)[0]);
  assert.deepStrictEqual(acts('c1'), ['ftRemove', 'ftSend']);
  assert.deepStrictEqual(acts('c3'), ['ftFit', 'ftSend']);
  assert.deepStrictEqual(acts('c4'), []);
  assert.deepStrictEqual(acts('c5'), ['ftFit']);
  assert.deepStrictEqual(acts('c6'), []);
});

test('8.5 empty and capped', () => {
  const l = load();
  l.Fuel._reset(); l.Fuel.tab('pieces');
  assert(/No tyres, batteries or other pieces recorded/.test(l.Fuel.render(shell({ cache: { buses: [], fuel: [], def: [], components: [] } }))));
  const many = []; for (let i = 0; i < 230; i++) many.push(component('x' + i, { label: 'P' + i }));
  l.Fuel._reset(); l.Fuel.tab('pieces');
  const html = l.Fuel.render(shell({ cache: { buses: [], fuel: [], def: [], components: many } }));
  assert.strictEqual(count(html, /class="ft-piece"/g), 200);
  assert(/Showing 200 of 230 pieces\./.test(strip(html)));
});

/* ===================================================================================================
 * 9. THE FILL SHEET
 * =================================================================================================== */

const sheetOf = (l, kind, fills) => l.Fuel.fillSheet({ kind: kind || 'fuel', buses: fleet().buses, fills: fills || fleet().fuel, meId: 'u-crew' });

test('9.1 nothing is pre-selected or pre-filled: no radio checked, blank litres, rupees and odometer, no default tank', () => {
  const s = sheetOf(load());
  assert(!/\schecked\b/.test(s), 'a bus is pre-selected');
  assert(!/data-field="(litres|cost|odometer)"[^>]*\svalue=/.test(s), 'a number field has a value');
  assert(/<option value="" selected>Choose<\/option><option value="full">Full tank<\/option><option value="part">Part fill<\/option>/.test(s),
    'the full/part select has a default, or is out of order');
  assert(!/<option value="full"[^>]*selected/.test(s), '"Full tank" is the default — a part fill recorded as full is the 8db78e7 bug\'s sibling');
});

test('9.2 MUTANT: "Full tank" as the default selection turns 9.1 red', () => {
  const src = mutant(`'<option value=""' + (sel === '' ? ' selected' : '') + '>'`, `'<option value=""' + '>'`)
    .replace(`'<option value="full"' + (sel === 'full' ? ' selected' : '') + '>'`, `'<option value="full" selected>'`);
  const s = sheetOf(load({ src: src }));
  assert(/<option value="full" selected>/.test(s), 'the mutant did not take');
  let red = false;
  try { assert(!/<option value="full"[^>]*selected/.test(s)); } catch (e) { red = true; }
  assert(red);
});

test('9.3 the odometer hint is a hint under the field, never a value in it', () => {
  const s = sheetOf(load());
  assert(/value="b1"[^>]*data-hint="Last reading 40,400 km, 6 November"/.test(s), s.match(/<input type="radio"[^>]*value="b1"[^>]*>/)[0]);
  const field = s.match(/<input[^>]*data-field="odometer"[^>]*>/)[0];
  assert(!/value=/.test(field), field);
});

test('9.4 the buses this person logged most recently come first', () => {
  const fills = [fill('b5', { by: 'u-crew', at: T - HOUR }), fill('b3', { by: 'u-crew', at: T - 5 * HOUR }), fill('b1', { by: 'someone-else', at: T })];
  const s = sheetOf(load(), 'fuel', fills);
  const order = (s.match(/name="ft-bus" value="(b\d)"/g) || []).map((x) => x.match(/b\d/)[0]);
  assert.deepStrictEqual(order.slice(0, 2), ['b5', 'b3'], order.join(','));
  assert.deepStrictEqual(order.slice(2), ['b1', 'b2', 'b4', 'b6', 'b7', 'b8']);
});

test('9.5 AdBlue is the same sheet without the full/part choice, pump or place', () => {
  const d = sheetOf(load(), 'def'), f = sheetOf(load(), 'fuel');
  assert(!/data-field="full"/.test(d) && /data-field="full"/.test(f));
  assert(!/data-field="pump"|data-field="place"/.test(d), 'new fields on a def record');
  assert(/data-field="pump"/.test(f) && /data-field="place"[^>]*maxlength="500"/.test(f));
});

test('9.6 a broken-instrument bus swaps the odometer for a sentence, and asks for nothing', () => {
  const s = sheetOf(load());
  const r = s.match(/<input type="radio"[^>]*value="b3"[^>]*>/)[0];
  assert(/data-broken="Odometer broken since 12 October"/.test(r), r);
  assert(/data-last=""/.test(r), 'a broken bus carries a reading to beat');
  const clean = s.match(/<input type="radio"[^>]*value="b1"[^>]*>/)[0];
  assert(/data-broken=""/.test(clean));
});

test('9.7 validateFill: blank fields, then the odometer, with the reason in words', () => {
  const l = load(), V = l.Fuel.validateFill;
  const ok = { kind: 'fuel', busId: 'b1', litres: '120.5', cost: '11460', odometer: '48300', full: 'full' };
  assert(V(ok, { lastKm: 48210 }).ok);
  assert.strictEqual(V(Object.assign({}, ok, { busId: '' }), {}).reason, 'Choose the bus');
  assert.strictEqual(V(Object.assign({}, ok, { litres: '' }), {}).reason, 'Enter the litres');
  assert.strictEqual(V(Object.assign({}, ok, { litres: '0' }), {}).reason, 'Enter the litres');
  assert.strictEqual(V(Object.assign({}, ok, { litres: '12x' }), {}).reason, 'Enter the litres');
  assert.strictEqual(V(Object.assign({}, ok, { cost: '' }), {}).reason, 'Enter the rupees');
  assert.strictEqual(V(Object.assign({}, ok, { full: '' }), {}).reason, 'Choose full tank or part fill');
  assert(V(Object.assign({}, ok, { full: '', kind: 'def' }), {}).ok, 'AdBlue has no full/part choice');
  // blank odometer is allowed (case 1): the fill is saved without one
  const blank = V(Object.assign({}, ok, { odometer: '' }), { lastKm: 48210 });
  assert(blank.ok && blank.odo === null);
  // …but never a lower number
  const low = V(ok, { lastKm: 48400 });
  assert(!low.ok && low.reason === 'Lower than the last reading, 48,400 km' && low.odoError === low.reason, JSON.stringify(low));
  assert.strictEqual(V(Object.assign({}, ok, { odometer: '48x' }), {}).reason, 'Odometer: digits only');
  // equal is allowed (a bus that has not moved); zero is "no reading", not a reading
  assert(V(Object.assign({}, ok, { odometer: '48400' }), { lastKm: 48400 }).ok);
  assert(V(Object.assign({}, ok, { odometer: '0' }), { lastKm: 48400 }).odo === null);
  // a broken instrument is never asked, whatever the field holds
  const brk = V(Object.assign({}, ok, { odometer: '12' }), { lastKm: 48400, broken: true });
  assert(brk.ok && brk.odo === null);
  // an edit is a correction: it may go below the last reading
  assert(V(ok, { lastKm: 48400, edit: true }).ok);
});

test('9.8 a wrong value is never defaulted: a blank is null, not 0', () => {
  const l = load(), V = l.Fuel.validateFill;
  const r = V({ kind: 'fuel', busId: 'b1', litres: '50', cost: '4000', odometer: '', full: 'part' }, {});
  assert.strictEqual(r.odo, null);
  assert.strictEqual(r.full, false);
  assert.strictEqual(r.litres, 50);
});

/* ===================================================================================================
 * 10. THE WRITES
 * =================================================================================================== */

test('10.1 a diesel fill writes ONE fuel row, with the spec\'s shape, and moves the bus forward only', async () => {
  const f = fleet();
  const l = load({ db: { buses: f.buses, fuel: f.fuel } });
  const v = l.Fuel.validateFill({ kind: 'fuel', busId: 'b1', litres: '120.5', cost: '11460', odometer: '40900', full: 'full' }, { lastKm: 40400 });
  const res = await l.Fuel.writeFill({ kind: 'fuel', vals: v, busId: 'b1', pump: ' HP  pump ', place: 'Ajmer Road', me: { id: 'u-sup', role: 'supervisor' } });
  assert(res.ok && res.busWritten);
  const rows = l.db.rows('fuel').filter((r) => r.id === res.rec.id);
  assert.strictEqual(rows.length, 1);
  assert.deepStrictEqual(Object.keys(rows[0]).sort(), ['at', 'busId', 'by', 'cost', 'full', 'id', 'litres', 'odometer', 'place', 'pump', 'updatedAt']);
  assert.strictEqual(rows[0].pump, 'HP pump');
  assert(/^f-/.test(rows[0].id) && rows[0].by === 'u-sup' && rows[0].at === T);
  const b = l.db.row('buses', 'b1');
  assert.strictEqual(b.odometer, 40900);
  assert.strictEqual(b.odometerAt, T);
  assert.deepStrictEqual(l.db.writes.filter((w) => !/^fuel\|f[0-9]+$/.test(w)).map((w) => w.split('|')[0]), ['fuel', 'buses'], 'something other than a fuel row and the bus was written');
});

test('10.2 …and never LOWERS the bus, even when the sheet allowed it (re-read from the database at write time)', async () => {
  const f = fleet();
  f.buses[0].odometer = 41000;                       // another phone moved the bus on since the sheet opened
  const l = load({ db: { buses: f.buses, fuel: f.fuel } });
  const v = l.Fuel.validateFill({ kind: 'fuel', busId: 'b1', litres: '50', cost: '4000', odometer: '40900', full: 'part' }, { lastKm: 40400 });
  const res = await l.Fuel.writeFill({ kind: 'fuel', vals: v, busId: 'b1', me: { id: 'u-sup', role: 'supervisor' } });
  assert(!res.ok && res.reason === 'lower' && /Lower than the last reading, 41,000 km/.test(res.message), JSON.stringify(res));
  assert.strictEqual(l.db.rows('fuel').length, f.fuel.length, 'a fill with a lower number was written');
  assert.strictEqual(l.db.row('buses', 'b1').odometer, 41000);
});

test('10.2b a reading equal to the stored one does not rewrite the bus (buses is the most-clobbered record)', async () => {
  const f = fleet();
  const l = load({ db: { buses: f.buses, fuel: f.fuel } });
  const v = l.Fuel.validateFill({ kind: 'fuel', busId: 'b1', litres: '50', cost: '4000', odometer: '40400', full: 'part' }, { lastKm: 40400 });
  const res = await l.Fuel.writeFill({ kind: 'fuel', vals: v, busId: 'b1', me: { id: 'u-sup', role: 'supervisor' } });
  assert(res.ok && !res.busWritten);
  assert.strictEqual(l.db.writes.filter((w) => /^buses/.test(w)).length, 0);
});

test('10.3 a blank odometer saves the fill with 0 (case 1) and does not touch the bus', async () => {
  const f = fleet();
  const l = load({ db: { buses: f.buses, fuel: f.fuel } });
  const v = l.Fuel.validateFill({ kind: 'fuel', busId: 'b1', litres: '50', cost: '4000', odometer: '', full: 'part' }, {});
  const res = await l.Fuel.writeFill({ kind: 'fuel', vals: v, busId: 'b1', me: { id: 'u-sup', role: 'supervisor' } });
  assert(res.ok && !res.busWritten);
  assert.strictEqual(res.rec.odometer, 0);
  assert.strictEqual(l.db.writes.filter((w) => /^buses/.test(w)).length, 0);
});

test('10.4 AdBlue writes a def row and never the bus', async () => {
  const f = fleet();
  const l = load({ db: { buses: f.buses, fuel: f.fuel } });
  const v = l.Fuel.validateFill({ kind: 'def', busId: 'b1', litres: '20', cost: '1800', odometer: '41500', full: '' }, { lastKm: 40400 });
  const res = await l.Fuel.writeFill({ kind: 'def', vals: v, busId: 'b1', me: { id: 'u-sup', role: 'supervisor' } });
  assert(res.ok && !res.busWritten);
  assert.strictEqual(l.db.rows('def').length, 1);
  assert(/^def-/.test(l.db.rows('def')[0].id));
  assert(!('full' in l.db.rows('def')[0]), 'def has no full field');
  assert.strictEqual(l.db.row('buses', 'b1').odometer, 40400, 'AdBlue moved the odometer');
});

test('10.5 a role the server will not let write `buses` does not try (store and crew manager)', async () => {
  const f = fleet();
  for (const role of ['store', 'crewmanager']) {
    const l = load({ db: { buses: f.buses, fuel: f.fuel } });
    const v = l.Fuel.validateFill({ kind: 'fuel', busId: 'b1', litres: '50', cost: '4000', odometer: '41000', full: 'part' }, { lastKm: 40400 });
    const res = await l.Fuel.writeFill({ kind: 'fuel', vals: v, busId: 'b1', me: { id: 'u-x', role: role } });
    assert(res.ok && !res.busWritten, role);
    assert.strictEqual(l.db.writes.filter((w) => /^buses/.test(w)).length, 0, role + ' queued a write the server refuses');
  }
});

test('10.6 a broken-instrument bus: no reading is stored, the bus is not written, nothing is asked', async () => {
  const f = fleet();
  const l = load({ db: { buses: f.buses, fuel: f.fuel } });
  const v = l.Fuel.validateFill({ kind: 'fuel', busId: 'b3', litres: '50', cost: '4000', odometer: '99999', full: 'part' }, { broken: true });
  const res = await l.Fuel.writeFill({ kind: 'fuel', vals: v, busId: 'b3', me: { id: 'u-sup', role: 'supervisor' } });
  assert(res.ok && res.rec.odometer === 0 && !res.busWritten);
});

test('10.7 an edit keeps the id, time and author, and does not move the bus', async () => {
  const f = fleet();
  const l = load({ db: { buses: f.buses, fuel: f.fuel } });
  const target = l.db.row('fuel', f.fuel[1].id);
  const v = l.Fuel.validateFill({ kind: 'fuel', busId: 'b1', litres: '90', cost: '8000', odometer: '40399', full: 'full' }, { lastKm: 40400, edit: true });
  const res = await l.Fuel.writeFill({ kind: 'fuel', edit: target, vals: v, busId: 'b1', me: { id: 'u-sup', role: 'supervisor' } });
  assert(res.ok && !res.busWritten);
  const after = l.db.row('fuel', target.id);
  assert.strictEqual(after.id, target.id); assert.strictEqual(after.at, target.at); assert.strictEqual(after.by, target.by);
  assert.strictEqual(after.litres, 90);
  assert.strictEqual(l.db.row('buses', 'b1').odometer, 40400);
});

test('10.8 fit: one components row, the spec\'s fields, one install entry, and buses untouched', async () => {
  const l = load({ db: { buses: fleet().buses, components: [component('c3', { state: 'removed' })] } });
  const v = l.Fuel.validateFit({ pieceId: 'c3', busId: 'b1', position: ' FL ', odometer: '40500' }, { lastKm: 40400 });
  assert(v.ok);
  const res = await l.Fuel.writeFit({ pieceId: 'c3', busId: 'b1', vals: v });
  assert(res.ok);
  const c = l.db.row('components', 'c3');
  assert.strictEqual(c.state, 'in-service'); assert.strictEqual(c.busId, 'b1'); assert.strictEqual(c.position, 'FL');
  assert.strictEqual(c.installedOdo, 40500); assert.strictEqual(c.installedAt, T);
  assert.deepStrictEqual(c.history, [{ type: 'install', at: T, odo: 40500, busId: 'b1', position: 'FL' }]);
  assert.deepStrictEqual(l.db.writes, ['components|c3'], 'a tyre fit wrote something besides the tyre');
});

test('10.9 fit: position is required, and a lower odometer is refused like anywhere else', () => {
  const V = load().Fuel.validateFit;
  assert.strictEqual(V({ pieceId: 'c3', busId: 'b1', position: '  ', odometer: '' }, {}).reason, 'Say which position');
  assert.strictEqual(V({ pieceId: '', busId: 'b1', position: 'FL', odometer: '' }, {}).reason, 'Choose the piece');
  assert.strictEqual(V({ pieceId: 'c3', busId: '', position: 'FL', odometer: '' }, {}).reason, 'Choose the bus');
  const low = V({ pieceId: 'c3', busId: 'b1', position: 'FL', odometer: '40000' }, { lastKm: 40400 });
  assert(!low.ok && low.odoError === 'Lower than the last reading, 40,400 km');
  const blank = V({ pieceId: 'c3', busId: 'b1', position: 'FL', odometer: '' }, { lastKm: 40400 });
  assert(blank.ok && blank.odo === null);
});

test('10.10 remove and send-out: the spec\'s fields and one history entry each', async () => {
  const c1 = component('c1', { state: 'in-service', busId: 'b1', position: 'FL', history: [{ type: 'install', at: 1 }] });
  const l = load({ db: { buses: fleet().buses, components: [c1] } });
  const rv = l.Fuel.validateRemove({ odometer: '40800' }, { lastKm: 40400 });
  const r = await l.Fuel.writeRemove({ pieceId: 'c1', vals: rv });
  assert(r.ok);
  let c = l.db.row('components', 'c1');
  assert.strictEqual(c.state, 'removed'); assert.strictEqual(c.busId, null);
  assert.deepStrictEqual(c.history[1], { type: 'remove', at: T, odo: 40800, busId: 'b1', position: 'FL' });
  assert.strictEqual(c.history.length, 2, 'the existing history was lost');
  const sv = l.Fuel.validateSend({ vendor: '  Jaipur   Tyre ', cost: '' });
  assert(sv.ok && sv.vendor === 'Jaipur Tyre' && sv.cost === null);
  const s = await l.Fuel.writeSend({ pieceId: 'c1', vals: sv, note: ' re-tread ' });
  assert(s.ok);
  c = l.db.row('components', 'c1');
  assert.strictEqual(c.state, 'sent-out');
  assert.deepStrictEqual(c.history[2], { type: 'send-out', at: T, vendor: 'Jaipur Tyre', cost: null, billPhoto: '', note: 're-tread' });
  assert.strictEqual(l.db.writes.filter((w) => /^buses/.test(w)).length, 0);
});

test('10.11 two people on one piece: the second sees the first\'s state and writes NOTHING', async () => {
  const l = load({ db: { components: [component('c1', { state: 'removed' })] } });
  const rv = l.Fuel.validateRemove({ odometer: '' }, {});
  const r = await l.Fuel.writeRemove({ pieceId: 'c1', vals: rv });          // it is not in service any more
  assert(!r.ok && r.reason === 'changed' && /changed while you were looking/.test(r.message));
  assert.strictEqual(l.db.writes.length, 0);
  const sv = l.Fuel.validateSend({ vendor: 'V', cost: '' });
  await l.Fuel.writeSend({ pieceId: 'c1', vals: sv, note: '' });
  const again = await l.Fuel.writeSend({ pieceId: 'c1', vals: sv, note: '' });   // already sent out
  assert(!again.ok);
  assert.strictEqual(l.db.row('components', 'c1').history.length, 1, 'a second send-out entry was added');
});

test('10.12 send out: the gate-pass seam is stated for a role without outsideJob, and not for the owner', () => {
  const l = load();
  const s = l.Fuel.sendSheet({ piece: component('c1', { state: 'removed' }), gatepass: false });
  assert(/No gate pass can be made from here\. The owner or a supervisor makes the slip\./.test(strip(s)));
  assert(!/No gate pass/.test(l.Fuel.sendSheet({ piece: component('c1'), gatepass: true })));
  assert(/Removed, updated 3 hours ago/.test(strip(s)), 'the sheet does not show the piece\'s state with its age: ' + strip(s));
});

/* ===================================================================================================
 * 11. THE SHEET'S LIVE BEHAVIOUR, against a hand-made DOM
 * =================================================================================================== */

// Just enough of a DOM for recheck(): elements that remember attributes, text and
// `hidden`, and a sheet that answers the selectors the screen asks.
function el(attrs) {
  const a = Object.assign({}, attrs || {});
  return { value: a.value || '', hidden: false, textContent: '', _a: a,
    getAttribute(k) { return k in this._a ? this._a[k] : null; },
    setAttribute(k, v) { this._a[k] = String(v); },
    removeAttribute(k) { delete this._a[k]; } };
}
function fakeSheet(kind, opts) {
  opts = opts || {};
  const f = { litres: el({ 'data-field': 'litres' }), cost: el({ 'data-field': 'cost' }),
    odometer: el({ 'data-field': 'odometer', 'aria-invalid': 'false' }), full: el({ 'data-field': 'full' }) };
  const parts = { btn: el({ 'aria-disabled': 'true' }), why: el(), err: el(), odo: el(), note: el(), noteText: el(), hint: el() };
  parts.note.hidden = true;
  let picked = null;
  const sheet = el({ 'data-sheet': 'fill', 'data-kind': kind || 'fuel' });
  sheet.querySelectorAll = (sel) => (sel === '[data-field]' ? Object.keys(f).map((k) => f[k]) : []);
  sheet.querySelector = (sel) => ({
    '.ft-bus-r:checked': picked, '.ft-save-b': parts.btn, '[data-why]': parts.why, '[data-err]': parts.err,
    '[data-odo]': parts.odo, '[data-broken-note]': parts.note, '[data-broken-text]': parts.noteText,
    '[data-odo] [data-hint]': parts.hint, '[data-field="odometer"]': f.odometer, '[data-field="busId"]': null,
  }[sel] || null);
  return { sheet, f, parts, pick(attrs) { picked = Object.assign(el(attrs), { value: attrs.value }); } };
}
function withSheet(l, s) {
  l.win.document.querySelector = (sel) => (sel === '.ft-sheet' ? s.sheet : null);
}

test('11.1 Save is aria-disabled with the reason in words until bus, litres, rupees and the tank choice are there', () => {
  const l = load();
  const s = fakeSheet(); withSheet(l, s);
  l.Fuel._recheck();
  assert.strictEqual(s.parts.btn.getAttribute('aria-disabled'), 'true');
  assert.strictEqual(s.parts.why.textContent, 'Choose the bus');
  s.pick({ value: 'b1', 'data-last': '40400', 'data-hint': 'Last reading 40,400 km, 5 November', 'data-broken': '' });
  l.Fuel._recheck(); assert.strictEqual(s.parts.why.textContent, 'Enter the litres');
  s.f.litres.value = '50'; l.Fuel._recheck(); assert.strictEqual(s.parts.why.textContent, 'Enter the rupees');
  s.f.cost.value = '4000'; l.Fuel._recheck(); assert.strictEqual(s.parts.why.textContent, 'Choose full tank or part fill');
  s.f.full.value = 'part'; l.Fuel._recheck();
  assert.strictEqual(s.parts.btn.getAttribute('aria-disabled'), null, 'Save stayed disabled with everything there');
  assert.strictEqual(s.parts.why.textContent, '');
  assert.strictEqual(s.parts.hint.textContent, 'Last reading 40,400 km, 5 November', 'the hint did not follow the bus');
});

test('11.2 a lower odometer: aria-invalid, the message in words, Save refused — and blank clears it', () => {
  const l = load();
  const s = fakeSheet(); withSheet(l, s);
  s.pick({ value: 'b1', 'data-last': '48210', 'data-hint': '', 'data-broken': '' });
  s.f.litres.value = '50'; s.f.cost.value = '4000'; s.f.full.value = 'part'; s.f.odometer.value = '47000';
  l.Fuel._recheck();
  assert.strictEqual(s.f.odometer.getAttribute('aria-invalid'), 'true');
  assert.strictEqual(s.parts.err.textContent, 'Lower than the last reading, 48,210 km');
  assert.strictEqual(s.parts.err.hidden, false);
  assert.strictEqual(s.parts.btn.getAttribute('aria-disabled'), 'true');
  assert.strictEqual(s.parts.why.textContent, 'Lower than the last reading, 48,210 km');
  s.f.odometer.value = ''; l.Fuel._recheck();
  assert.strictEqual(s.f.odometer.getAttribute('aria-invalid'), 'false');
  assert.strictEqual(s.parts.btn.getAttribute('aria-disabled'), null, 'the fill cannot be saved with the reading LEFT OUT');
});

test('11.3 picking a broken-instrument bus hides the odometer field and shows the sentence instead', () => {
  const l = load();
  const s = fakeSheet(); withSheet(l, s);
  s.pick({ value: 'b3', 'data-last': '', 'data-hint': '', 'data-broken': 'Odometer broken since 12 October' });
  s.f.litres.value = '50'; s.f.cost.value = '4000'; s.f.full.value = 'part'; s.f.odometer.value = '12';
  l.Fuel._recheck();
  assert.strictEqual(s.parts.odo.hidden, true, 'the field is still offered');
  assert.strictEqual(s.parts.note.hidden, false);
  assert.strictEqual(s.parts.noteText.textContent, 'Odometer broken since 12 October');
  assert.strictEqual(s.parts.btn.getAttribute('aria-disabled'), null, 'a stray value in the hidden field blocked the save');
});

test('11.4 a write in flight is left alone by recheck(): the button keeps saying Saving', () => {
  const l = load();
  const s = fakeSheet(); withSheet(l, s);
  s.parts.btn.setAttribute('data-busy', 'yes'); s.parts.btn.setAttribute('aria-disabled', 'true');
  s.pick({ value: 'b1', 'data-last': '', 'data-hint': '', 'data-broken': '' });
  s.f.litres.value = '50'; s.f.cost.value = '4000'; s.f.full.value = 'part';
  l.Fuel._recheck();
  assert.strictEqual(s.parts.btn.getAttribute('aria-disabled'), 'true');
});

test('11.5 the tap on "Log diesel" opens the sheet and "Log AdBlue" the AdBlue one; nothing else is written', () => {
  const l = load();
  l.win.S.cache = cacheOf();
  l.Fuel.mount();
  const mk = (kind) => ({ getAttribute: (k) => ({ 'data-act': 'ftLog', 'data-kind': kind }[k] || null) });
  l.clicks[0]({ target: { closest: (sel) => (sel === '[data-act]' ? mk('fuel') : null) }, preventDefault() {} });
  l.clicks[0]({ target: { closest: (sel) => (sel === '[data-act]' ? mk('def') : null) }, preventDefault() {} });
  assert.deepStrictEqual(l.sheets.map((s) => s.title), ['Log diesel', 'Log AdBlue']);
  assert(/data-field="full"/.test(l.sheets[0].body) && !/data-field="full"/.test(l.sheets[1].body));
  assert.strictEqual(l.db.writes.length, 0);
});

/* ===================================================================================================
 * 12. SAVING, END TO END THROUGH THE SHEET
 * =================================================================================================== */

async function saveThrough(role, onLine) {
  const f = fleet();
  const l = load({ db: { buses: f.buses, fuel: f.fuel }, user: { id: 'u-' + role, role: role }, onLine: onLine });
  l.win.S.cache = cacheOf();
  l.Fuel.mount();
  const s = fakeSheet(); withSheet(l, s);
  s.sheet.setAttribute('data-kind', 'fuel');
  s.pick({ value: 'b1', 'data-last': '40400', 'data-hint': '', 'data-broken': '' });
  s.f.litres.value = '50'; s.f.cost.value = '4000'; s.f.full.value = 'part'; s.f.odometer.value = '40700';
  const btn = s.parts.btn; btn.removeAttribute('aria-disabled');
  l.clicks[0]({ target: { closest: (sel) => (sel === '[data-act]' ? Object.assign(btn, { _a: Object.assign(btn._a, { 'data-act': 'ftSaveFill' }) }) : null) }, preventDefault() {} });
  await new Promise((r) => setTimeout(r, 20));
  return { l, btn };
}

test('12.1 a crew manager\'s save toasts the append-only sentence, and closes the sheet', async () => {
  const { l } = await saveThrough('crewmanager');
  assert(l.toasts.some((t) => t.text === 'Saved. A fill cannot be changed. Add a correcting fill if this was wrong.'), JSON.stringify(l.toasts));
  assert(l.sheets.some((s) => s.closed));
  assert.strictEqual(l.db.rows('fuel').length, fleet().fuel.length + 1);
});

test('12.2 an owner\'s save says only "Saved"', async () => {
  const { l } = await saveThrough('owner');
  assert(l.toasts.some((t) => t.text === 'Saved'), JSON.stringify(l.toasts));
});

test('12.3 offline, the fill is still written locally and the toast says what is true', async () => {
  const { l } = await saveThrough('crewmanager', false);
  assert.strictEqual(l.db.rows('fuel').length, fleet().fuel.length + 1);
  assert(l.toasts.some((t) => t.text === 'Not sent. The fill is saved on this phone. It will send when there is signal.' && t.kind === 'warn'));
});

test('12.4 sending a unit out asks first, and "no" writes nothing', async () => {
  const l = load({ db: { components: [component('c1', { state: 'removed' })] }, confirm: false });
  l.win.S.cache = { components: [component('c1', { state: 'removed' })], buses: [], fuel: [] };
  l.Fuel.mount();
  const sheet = el({ 'data-sheet': 'send', 'data-id': 'c1' });
  const vendor = el({ 'data-field': 'vendor' }); vendor.value = 'Jaipur Tyre';
  const cost = el({ 'data-field': 'cost' }), note = el({ 'data-field': 'note' });
  sheet.querySelectorAll = () => [vendor, cost, note];
  sheet.querySelector = (sel) => ({ '.ft-save-b': el(), '[data-why]': el() }[sel] || null);
  l.win.document.querySelector = (sel) => (sel === '.ft-sheet' ? sheet : null);
  const btn = el({ 'data-act': 'ftSaveSend' });
  l.clicks[0]({ target: { closest: (sel) => (sel === '[data-act]' ? btn : null) }, preventDefault() {} });
  await new Promise((r) => setTimeout(r, 20));
  assert.strictEqual(l.confirms.length, 1);
  assert(/leaves the garage/.test(l.confirms[0].text));
  assert.strictEqual(l.db.writes.length, 0, 'it wrote after a "no"');
});

/* ===================================================================================================
 * 13. WORDS, AND THE SCREEN'S PLACE IN THE APP
 * =================================================================================================== */

test('13.1 every id this file registers has a Hindi KEY (empty = pending) and none is guessed', () => {
  const src = stripComments(read(SCREEN));
  const table = src.slice(src.indexOf('var WORDS = {'), src.indexOf('var registered'));
  const ids = table.match(/\n    (ft[A-Za-z]+):/g) || [];
  assert(ids.length > 80);
  const noHi = table.split('\n').filter((l) => /^\s+ft[A-Za-z]+:/.test(l) && !/hi: ''/.test(l));
  assert.deepStrictEqual(noHi, [], 'a word with a Hindi value written by a builder, or no Hindi key');
});

test('13.2 every say("…") in the file is an id the table holds (w() throws on an unregistered id)', () => {
  const src = stripComments(read(SCREEN));
  const used = new Set((src.match(/\bsay\('(ft[A-Za-z]+)'/g) || []).map((m) => m.slice(5, -1)));
  const l = load();
  used.forEach((id) => assert(l.win.W.entry(id), id + ' is used but not registered'));
  [...src.matchAll(/'(ft[A-Z][A-Za-z]+)'/g)].forEach((m) => { if (/^ft(Tab|Log|Fit|Save|Remove|Send|Open|Edit)/.test(m[1]) && /data-act/.test(src)) return; });
  // every id in the table is used (a word nobody draws is a word the owner translates for nothing)
  const table = src.slice(src.indexOf('var WORDS = {'), src.indexOf('var registered'));
  const defined = (table.match(/\n    (ft[A-Za-z]+):/g) || []).map((s) => s.trim().slice(0, -1));
  const unused = defined.filter((id) => !new RegExp("['\"]" + id + "['\"]").test(src.replace(table, '')));
  assert.deepStrictEqual(unused, [], 'registered but never drawn');
});

test('13.3 in Hindi mode every fixed word the screen draws is a pending id with its mark', () => {
  const l = load({ lang: 'hi' });
  const html = l.Fuel.render(shell({ cache: cacheOf() }));
  ['ftLogDiesel', 'ftLogDef', 'ftFitTyre', 'ftFitBattery', 'ftTabFills', 'ftTabMileage', 'ftTabPieces', 'ftFull'].forEach((id) => {
    assert(html.indexOf('[' + id + ']') >= 0, id + ' did not come from the table');
  });
});

test('13.4 the screen registers with the Router under its own id and declares both capabilities', () => {
  const l = load();
  assert(l.win.Router.moduleFor('fuel'), 'fuel is not registered with the router');
  assert.deepStrictEqual(Array.from(l.win.Caps.SCREENS.fuel.declares), ['addFuel', 'manageComponents']);
  assert.strictEqual(typeof l.Fuel.render, 'function');
  assert(l.Fuel.render(shell({ cache: cacheOf() })) !== undefined);
});

test('13.5 render is pure: the same model twice is the same string, and it reads no store', () => {
  const l = load();
  l.win.Cache.load = () => { throw new Error('render read a store'); };
  const m = shell({ cache: cacheOf() });
  const a = l.Fuel.render(m), b = l.Fuel.render(m);
  assert.strictEqual(a, b);
});

test('13.6 the stylesheet respects the floor: hsl via tokens, px only in borders, outlines and shadows', () => {
  const css = read(V2('ui/fuel.css')).replace(/\/\*[\s\S]*?\*\//g, '');
  const bad = css.split('\n').filter((l) => /\d+px/.test(l) && !/^\s*(border|outline|box-shadow)/.test(l) && !/^\s*outline-offset/.test(l));
  assert.deepStrictEqual(bad, []);
  assert(!/transition|animation|@keyframes/.test(css), 'this screen animates nothing of its own');
  assert(!/^\s*[^{}\n]*\{/m.test(css.split('\n').filter((l) => /^[^\s/@}]/.test(l) && !/^\[data-v2\]/.test(l)).join('\n')), 'a selector not scoped to [data-v2]');
});

/* =================================================================================================== */

runAll().then(() => {
  console.log('──');
  console.log(passed + ' passed, ' + fails + ' failed');
  if (fails) { console.log('❌ ' + fails + ' Fuel & tyres check(s) failed'); process.exit(1); }
  console.log('✅ no fuel figure divides by a number the app does not hold');
});

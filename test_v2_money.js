/* Tests for v2 screen slice MO — Money (#7).
 * Run: node test_v2_money.js
 *
 * At the repo ROOT and not in v2/, because scripts/run-tests.py discovers
 * test_*.js at the root only and does not recurse. A test in v2/ would never
 * run, and a test nobody runs is not a test.
 *
 * Node, no browser, in the shape of test_v2_work.js: the real v2/ui/icons.js,
 * v2/ui/words.js, v2/ui/states.js, v2/fmt.js, v2/caps.js, v2/cost.js,
 * v2/odo.js, v2/router.js and the screen module are loaded in a vm context
 * holding a stub window, and the assertions are on the markup STRING the screen
 * returns. That is why render(model) is pure: a screen whose rules can only be
 * checked in a browser is a screen whose rules are checked by nobody.
 *
 * THE TWO CHECKS THIS FILE EXISTS FOR, and each has a commit behind it:
 *
 *   1. THE TOTAL IS WITHHELD WHEN THE SIX PARTS DO NOT ADD UP TO IT. v1 had
 *      five per-bus cost bases and they disagreed, so people stopped reading
 *      all five. The hero is the one number every other screen reads, and a
 *      wrong total is worse than no total. `Cost.forBus` withholds its own;
 *      this screen's FLEET aggregate is checked by a second path and withholds
 *      the hero too, and the mutant below proves that path is load-bearing.
 *
 *   2. NO PER-KM FIGURE WITHOUT A TRUSTED DIVISOR. [E] 8db78e7: ₹45,000 of work
 *      read as ₹45,000 PER KILOMETRE because the odometer was missing. It
 *      topped the money-pit list and the owner was sent to inspect a healthy
 *      bus. A bus whose reading cannot be trusted leaves the ranking in BOTH
 *      directions — the half of that fix that was never made — and is listed
 *      separately with its reason. The mutant below defaults the denominator
 *      and must redden.
 *
 * The clock is a FIXTURE, not Date.now(): every window on this screen is a
 * calendar month, so a suite run on the 1st of a month would place every
 * fixture outside its own period. NOW is mid-June 2026 and is passed into the
 * model, exactly as the module takes `now` as an argument and reads no clock.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const read = (p) => fs.readFileSync(p, 'utf8');
const V2 = (...p) => path.join(ROOT, 'v2', ...p);

let fails = 0;
const QUEUE = [];
function test(name, fn) { QUEUE.push({ name, fn }); }

async function runAll() {
  for (const t of QUEUE) {
    try {
      await t.fn();
      console.log('  ok  ' + t.name);
    } catch (e) {
      console.log(' FAIL ' + t.name + '\n        ' + String(e.message).split('\n').join('\n        '));
      fails++;
    }
  }
}

const MONEY_CSS = read(V2('ui', 'money.css'));
const MONEY_JS = read(V2('screens', 'money.js'));

/* =====================================================================================================
 * A SMALL CSS READER (the brace-depth reader from test_v2_shell.js / test_v2_work.js)
 * ===================================================================================================== */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const GROUPING = /^@(media|supports|layer|container)\b/;

function parseRules(text, ctx) {
  ctx = ctx || [];
  const rules = [];
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('{', i);
    if (open < 0) break;
    const prelude = text.slice(i, open).trim();
    let depth = 1, j = open + 1;
    while (j < text.length && depth) { if (text[j] === '{') depth++; else if (text[j] === '}') depth--; j++; }
    const body = text.slice(open + 1, j - 1);
    if (GROUPING.test(prelude)) rules.push(...parseRules(body, ctx.concat(prelude)));
    else {
      const listed = [];
      for (const d of body.split(';')) {
        const k = d.indexOf(':');
        if (k > 0 && !d.slice(0, k).includes('{')) listed.push([d.slice(0, k).trim(), d.slice(k + 1).trim()]);
      }
      rules.push({ ctx: ctx, selector: prelude, list: listed });
    }
    i = j;
  }
  return rules;
}
const rulesOf = (css) => parseRules(stripComments(css));
const declsOf = (css) => rulesOf(css).reduce((a, r) =>
  a.concat(r.list.map(([p, v]) => ({ sel: r.selector, ctx: r.ctx, prop: p, val: v }))), []);

const PX_OK_PROP = /^(?:border(?:-[a-z-]+)?|outline(?:-offset)?|box-shadow)$/;
function magicPx(css) {
  return declsOf(css)
    .filter((d) => /(?<![\w.-])-?\d*\.?\d+px\b/.test(d.val.replace(/var\(\s*--[\w-]+\s*,?/g, ' ')) && !PX_OK_PROP.test(d.prop))
    .map((d) => d.sel + ' { ' + d.prop + ': ' + d.val + ' }');
}
function literalColour(css) {
  return declsOf(css)
    .filter((d) => /(?:#[0-9a-fA-F]{3,8}\b|\b(?:hsla?|rgba?|oklch|oklab|color-mix)\s*\()/.test(d.val))
    .map((d) => d.sel + ' { ' + d.prop + ': ' + d.val + ' }');
}

test('the magic-px detector rejects a literal size and allows a border, an outline and a shadow', () => {
  for (const bad of ['height:56px', 'gap:8px', 'padding:0 16px', 'grid-template-columns:520px 1fr'])
    assert(magicPx('.a{' + bad + '}').length > 0, 'detector missed: ' + bad);
  for (const fine of ['border-top:1px solid var(--line)', 'box-shadow:inset 0 -1px 0 var(--line)',
    'grid-template-columns:minmax(0, 1.6fr) minmax(0, 1fr)', 'gap:var(--s4)'])
    assert.deepEqual(magicPx('.a{' + fine + '}'), [], 'false positive: ' + fine);
});

/* =====================================================================================================
 * 0. money.css: tokens only, and the four rules the spec names by hand
 * ===================================================================================================== */

test('money.css has declarations to check at all: an empty file would pass every rule below vacuously', () => {
  assert(declsOf(MONEY_CSS).length >= 20, 'only ' + declsOf(MONEY_CSS).length + ' declarations');
});

test('money.css sizes everything from the tokens: no px literal outside border, outline and box-shadow', () => {
  assert.deepEqual(magicPx(MONEY_CSS), [],
    'a px literal here is a size that does not move when a density token does');
});

test('money.css names every colour: no hex, no hsl(), no rgb() of its own', () => {
  assert.deepEqual(literalColour(MONEY_CSS), [],
    'a colour literal does not switch with the theme, and dark mode is a token swap');
});

test('§1.3 desk columns: a two-column grid in BOTH selector shapes, because data-density sits in two places', () => {
  const cols = rulesOf(MONEY_CSS).filter((r) => /\.mo-cols\b/.test(r.selector)
    && r.list.some(([p, v]) => p === 'grid-template-columns' && /fr/.test(v)));
  assert(cols.length === 1, 'expected one grid rule for .mo-cols, got ' + cols.length);
  assert(/\[data-v2\]\[data-density="desk"\]/.test(cols[0].selector)
    && /\[data-v2\] \[data-density="desk"\]/.test(cols[0].selector),
  'the app puts data-density on <html> and the gallery puts it on a wrapper: both or neither');
});

test('§1.6 the period report is this screen in print, so the desk columns collapse at equal specificity', () => {
  const printed = rulesOf(MONEY_CSS).filter((r) => r.ctx.some((c) => /^@media print/.test(c))
    && /\.mo-cols\b/.test(r.selector));
  assert(printed.length === 1, 'the print rule for .mo-cols is missing');
  assert(/\[data-v2\]\[data-density="desk"\] \.mo-cols/.test(printed[0].selector),
    'a lower-specificity print rule loses to the desk rule and the report prints two columns');
});

test('§1.5 a closed trip is frozen with both declarations the spec gives', () => {
  const frozen = declsOf(MONEY_CSS).filter((d) => /\.mo-frozen\b/.test(d.sel));
  assert(frozen.some((d) => d.prop === 'opacity' && d.val === '0.5'), 'opacity: 0.5 is missing');
  assert(frozen.some((d) => d.prop === 'cursor' && d.val === 'not-allowed'), 'cursor: not-allowed is missing');
});

/* =====================================================================================================
 * THE STATIC RULES, read off the source because an ordering is what matters
 * ===================================================================================================== */

test('the one delegated listener guards a field BEFORE it reads [data-act] — the shelf-count regression', () => {
  assert(MONEY_JS.includes("input, select, textarea, label, .num"), 'the field selector is not in the file');
  const lines = MONEY_JS.split('\n');
  const guard = lines.findIndex((l) => /closest\('input, select, textarea, label, \.num'\)/.test(l)
    && !/^\s*\*/.test(l));
  const act = lines.findIndex((l) => /closest\('\[data-(act|nav)\]'\)/.test(l));
  assert(guard >= 0, 'no field guard on a live line');
  assert(act >= 0, 'the screen reads no [data-act] at all');
  assert(guard < act, 'a guard that runs after the [data-act] read is not a guard '
    + '(guard at ' + (guard + 1) + ', data-act at ' + (act + 1) + ')');
});

test('mount() installs exactly ONE listener, however many times it is called', () => {
  const l = load();
  const before = l.clicks.length;
  l.win.Money.mount();
  l.win.Money.mount();
  assert.strictEqual(l.clicks.length, before, 'mount() is not idempotent');
  assert.strictEqual(before, 1, 'expected one listener at load, got ' + before);
});

/* NO DEFAULTED DENOMINATOR, read off the source as well as off the markup. A
 * `|| 1` or a `|| 0` beside a division is the exact shape of 8db78e7, and it is
 * the shape a well-meaning edit reaches for when a dash looks like a gap. */
test('§1.4 the source defaults no denominator: no `|| 1` or `|| 0` anywhere near a division', () => {
  const live = stripComments(MONEY_JS).replace(/\/\/[^\n]*/g, '');
  const hits = live.match(/\/\s*\(?[A-Za-z_$][\w$.]*\s*\|\|\s*[01]\s*\)?/g) || [];
  assert.deepEqual(hits, [], 'a defaulted divisor: ' + JSON.stringify(hits));
});

/* =====================================================================================================
 * LOADING: the screen in a stub window, the way a page loads it
 * ===================================================================================================== */

function el(tag) {
  const e = {
    tag: tag, html: '', inserts: 0, attrs: {}, classes: {}, find: null, parentNode: null,
    // `textContent` is a KEY, not just a value: the screen writes a working
    // label through `'textContent' in el`, and a stub without the key skips it.
    textContent: '',
    setAttribute: function (k, v) { e.attrs[k] = String(v); },
    getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(e.attrs, k) ? e.attrs[k] : null; },
    removeAttribute: function (k) { delete e.attrs[k]; },
    hasAttribute: function (k) { return Object.prototype.hasOwnProperty.call(e.attrs, k); },
    insertAdjacentHTML: function (pos, h) { e.inserts++; e.html += String(h); },
    addEventListener: function () {},
    querySelector: function (sel) { return e.find ? e.find(sel) : null; },
    querySelectorAll: function () { return []; },
    classList: { add: function (c) { e.classes[c] = true; }, remove: function (c) { delete e.classes[c]; },
                 contains: function (c) { return !!e.classes[c]; } }
  };
  Object.defineProperty(e, 'innerHTML', { get: () => e.html, set: (v) => { e.html = String(v); e.inserts++; } });
  Object.defineProperty(e, 'outerHTML', { get: () => e.html, set: (v) => { e.html = String(v); e.inserts++; } });
  return e;
}

const SRC = ['ui/icons.js', 'ui/words.js', 'ui/states.js', 'fmt.js', 'caps.js',
             'cost.js', 'odo.js', 'router.js'];

function fakeDB(seed) {
  const store = {};
  Object.keys(seed || {}).forEach((name) => {
    store[name] = {};
    (seed[name] || []).forEach((r) => { store[name][r.id] = JSON.parse(JSON.stringify(r)); });
  });
  return {
    puts: [],
    async all(name) { return Object.keys(store[name] || {}).map((k) => store[name][k]); },
    async get(name, id) {
      const row = (store[name] || {})[id];
      return row ? JSON.parse(JSON.stringify(row)) : null;
    },
    async put(name, obj) {
      this.puts.push({ store: name, obj: JSON.parse(JSON.stringify(obj)) });
      (store[name] || (store[name] = {}))[obj.id] = JSON.parse(JSON.stringify(obj));
      return obj;
    },
    markDirty() {}, dirtySnapshot() { return new Set(); }, clearDirty() {},
    _row(name, id) { const r = (store[name] || {})[id]; return r ? JSON.parse(JSON.stringify(r)) : null; }
  };
}

function load(o) {
  o = o || {};
  const html = el('html');
  html.lang = o.lang || 'en';
  html.setAttribute('data-v2', '');
  html.setAttribute('data-density', o.density || 'yard');

  const clicks = [];
  const logs = { warn: [], error: [] };
  const sheets = [];
  const toasts = [];
  const confirms = [];
  const routes = [];
  const prints = [];
  const db = fakeDB(o.seed || { trips: (o.cache && o.cache.trips) || [] });
  const forms = {};

  const sandbox = {
    navigator: { onLine: true, userAgent: 'node', language: 'en' },
    location: { href: 'http://localhost/v2/', pathname: '/v2/' },
    document: {
      documentElement: html,
      title: '',
      addEventListener: function (type, fn) { if (type === 'click') clicks.push(fn); },
      removeEventListener: function () {},
      getElementById: function () { return null; },
      querySelector: function (sel) { return forms[sel] || null; },
      querySelectorAll: function () { return []; },
      createElement: function () { return el('div'); },
      head: { appendChild: function () {} }, body: null
    },
    getComputedStyle: function () { return {}; },
    addEventListener: function () {}, removeEventListener: function () {},
    setTimeout: setTimeout, clearTimeout: clearTimeout,
    print: function () { prints.push(1); },
    console: { warn: (m) => logs.warn.push(String(m)), error: (m) => logs.error.push(String(m)),
               info: () => {}, log: () => {} },
    S: { user: o.me || null, route: null, stack: [], cache: o.cache || {} },
    DB: db,
    Sync: { info: () => ({ pending: 0, lastSyncAt: o.lastSyncAt === undefined ? NOW - 4 * 60000 : o.lastSyncAt,
                           lastError: '', status: 'synced' }) },
    Boot: { density: () => o.density || 'yard', replica: () => ({ behind: 0, complete: o.complete !== false }) },
    // '' means "no signature this screen can read", so nothing is memoised and
    // a fixture changed inside one context is never answered from a stale memo.
    Cache: { load: async () => ({}), sig: () => '', sigOf: () => (o.sig === undefined ? '' : o.sig),
             reads: () => 0 },
    Shell: { mount: function (id) { sandbox.S.route = id; return true; }, body: function () { return true; } },
    Router: null,
    V2: {
      openSheet: function (title, body) { sheets.push({ title: title, body: String(body) }); return el('dialog'); },
      closeSheet: function () { sheets.push({ closed: true }); },
      confirmDialog: function (text, opts) {
        confirms.push({ text: text, opts: opts });
        return Promise.resolve(o.confirm === true);
      },
      toast: function (text, opts) { toasts.push({ text: text, kind: opts && opts.kind }); return el('div'); }
    }
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  for (const f of SRC) vm.runInContext(read(V2(f)), ctx, { filename: V2(f) });
  vm.runInContext(o.src || MONEY_JS, ctx, { filename: V2('screens', 'money.js') });
  return { win: sandbox, db: db, root: html, clicks: clicks, logs: logs, sheets: sheets,
           toasts: toasts, confirms: confirms, routes: routes, prints: prints, forms: forms };
}

/* ---- the fixtures --------------------------------------------------------
 * Mid-June 2026, so "this month" is 1 June to the 15th and every fixture below
 * is inside it whatever day this suite is run on.
 *
 * Three buses, chosen so each is one of §1.4's cases:
 *   b1  two readings 1,300 km apart   -> km KNOWN, the only bus in the ranking
 *   b2  one reading in the window     -> km unknown, "Only one reading since…"
 *   b3  two readings 240 km apart     -> km unknown, "…too close to divide"
 */
const NOW = new Date(2026, 5, 15, 10, 0, 0, 0).getTime();
const D = (day) => new Date(2026, 5, day, 9, 0, 0, 0).getTime();

const USERS = [
  { id: 'u-own', role: 'owner', name: 'Owner' },
  { id: 'u-sup', role: 'supervisor', name: 'Mohan' },
  { id: 'u-store', role: 'store', name: 'Store' }
];
const BUSES = [
  { id: 'b1', regNo: 'RJ09PA6126' },
  { id: 'b2', regNo: 'RJ14PA1023' },
  { id: 'b3', regNo: 'RJ19PA7788' }
];

function fleet(over) {
  const c = {
    buses: BUSES,
    users: USERS,
    meta: [{ key: 'garage', labourRate: 250 }],
    fuel: [
      { id: 'f1', busId: 'b1', at: D(5), cost: 10000, litres: 100, odometer: 100000, full: true },
      { id: 'f2', busId: 'b1', at: D(12), cost: 12000, litres: 110, odometer: 101300, full: true },
      { id: 'f3', busId: 'b2', at: D(4), cost: 5000, litres: 60, odometer: 50000, full: true },
      { id: 'f4', busId: 'b3', at: D(3), cost: 2000, litres: 30, odometer: 70000, full: true },
      { id: 'f5', busId: 'b3', at: D(11), cost: 3000, litres: 40, odometer: 70240, full: true }
    ],
    def: [{ id: 'dd1', busId: 'b1', at: D(6), cost: 1000 }],
    jobcards: [{ id: 'j1', busId: 'b1', jobDate: '2026-06-07', enterAt: D(7), labourHours: 4,
                 externalCost: 2000, odometer: 100500,
                 partsUsed: [{ partId: 'p1', qty: 2, cost: 1800, reused: false }] }],
    ledger: [],
    trips: [{ id: 't1', busId: 'b1', driverId: 'dr1', startedAt: D(8), closedAt: D(9), status: 'closed',
              allowance: 5000, fromTo: '',
              expenses: [{ id: 'e1', amount: 1200, cat: 'diesel', mode: 'card' },
                         { id: 'e2', amount: 300, cat: 'food', mode: 'cash' }] }],
    incidents: [{ id: 'i1', busId: 'b1', at: D(10), cost: 700 }],
    components: [],
    purchases: [
      { id: 'pu1', supplier: 'Jaipur Auto', amount: 120000, paymentStatus: 'pending', at: NOW - 40 * 86400000 },
      { id: 'pu2', supplier: 'Tyre Mart', amount: 94700, paymentStatus: 'pending', at: D(2) },
      { id: 'pu3', supplier: 'Settled Co', amount: 5000, paymentStatus: 'paid', at: D(1) }
    ],
    challans: [{ rc: 'RJ14PA1023', pendingCount: 3, pendingFine: 18400, fetchedAt: D(13) },
               { rc: 'RJ09PA6126', pendingCount: 0, pendingFine: 0, fetchedAt: D(13) }],
    drivers: [{ id: 'dr1', name: 'Ramesh Kumar', busId: 'b1', driverSlot: 1 }],
    vendors: []
  };
  return Object.assign(c, over || {});
}

/* The arithmetic every assertion below is measured against, worked out by hand
 * from the fixture so the test knows the answer independently of the code:
 *   fuel    10000 + 12000 + 1000 + 5000 + 2000 + 3000 = 33000
 *   parts   1800            labour 4 x 250 = 1000
 *   outside 2000            trip   1200 + 300 = 1500
 *   misc    700             TOTAL  40000
 * and b1 alone is 30000 over 1300 km, so the fleet's cost per km is 23.1. */
const EXPECT = { fuel: 33000, parts: 1800, labour: 1000, outside: 2000, trip: 1500, misc: 700, total: 40000 };

function asRole(roleId, o) {
  o = o || {};
  const me = USERS.filter((u) => u.id === roleId)[0];
  const cache = o.cache || fleet();
  const l = load(Object.assign({}, o, { me: me, cache: cache,
                                        seed: { trips: cache.trips || [] } }));
  l.model = Object.assign({
    route: 'money', params: null, role: me.role, user: me,
    density: o.density || 'yard', cache: cache,
    replica: { behind: 0, complete: o.complete !== false },
    stale: o.complete === false, offline: !!o.offline, now: NOW
  }, o.model || {});
  return l;
}
// The hero is the one figure in `.stat .v` at the top of the total card.
const hero = (html) => String(html).slice(String(html).indexOf('class="v"'),
                                          String(html).indexOf('class="v"') + 400);
// A pressable with data-act set the way the markup sets it, so the screen's own
// getAttribute is the one under test and `aria-disabled` can be read back off it.
function actBtn(act) { const b = el('button'); b.setAttribute('data-act', act); return b; }
/* A click target INSIDE Money's container, which is what the live markup gives.
 * `.mo` must answer, because the screen reads its three generic attributes
 * (`data-period`, `data-pit`, `data-bus`) only inside its own container — every
 * screen's listener is on `document` and `data-bus` is not a name only Money
 * uses. `outside` is the same target with no container, for the opposite check. */
function inMo(map) {
  return { closest: (sel) => (sel === '.mo' ? el('div') : (map[sel] || null)) };
}
function outside(map) { return { closest: (sel) => map[sel] || null }; }
const spoken = (html) => String(html).replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&')
  .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

/* =====================================================================================================
 * 1. THE WINDOW. A month is 28, 29, 30 or 31 days and `Cost.forBus` takes a span.
 * ===================================================================================================== */

test('§1.2 "last month" is a window that ENDS at the last instant of last month, not a trailing 30 days', () => {
  const l = load();
  const w = l.win.Money.windowOf('last', NOW);
  assert.strictEqual(new Date(w.from).getMonth(), 4, 'from is not 1 May');
  assert.strictEqual(new Date(w.from).getDate(), 1);
  assert.strictEqual(new Date(w.to + 1).getTime(), new Date(2026, 5, 1).getTime(),
    'to is not the last instant of May');
  assert.strictEqual(Math.round(l.win.Money.daysOf(w)), 31, 'May is 31 days, not a hard-coded 30');
});

test('a month span is never zero or negative, so Cost.forBus is never handed a divisor it must refuse', () => {
  const l = load();
  const midnight = new Date(2026, 5, 1, 0, 0, 0, 0).getTime();
  for (const id of ['this', 'last', 'm3', 'year', 'dates']) {
    const d = l.win.Money.daysOf(l.win.Money.windowOf(id, midnight));
    assert(d > 0, id + ' spans ' + d + ' days at the first instant of a month');
  }
});

/* =====================================================================================================
 * 2. THE SIX PARTS, AND THAT THEY RECONCILE ON SCREEN
 * ===================================================================================================== */

test('§1.1 the six parts are drawn beneath the total, in order, with the names Cost.forBus itself uses', () => {
  const l = asRole('u-own');
  const html = l.win.Money.render(l.model);
  const words = spoken(html);
  for (const name of ['Fuel & AdBlue', 'Parts', 'Labour', 'Outside work', 'Trip cash', 'Misc']) {
    assert(words.includes(name), 'the ' + name + ' row is not on screen');
  }
  const order = ['Fuel & AdBlue', 'Parts', 'Labour', 'Outside work', 'Trip cash', 'Misc']
    .map((n) => words.indexOf(n));
  for (let i = 1; i < order.length; i++) {
    assert(order[i] > order[i - 1], 'the six are out of §1.1 order at ' + i);
  }
});

test('§1.1 the hero is the six parts summed, and every figure matches the fixture worked out by hand', () => {
  const l = asRole('u-own');
  const v = l.win.Money.model(l.model);
  assert.strictEqual(v.agg.total, EXPECT.total, 'the hero is ' + v.agg.total + ', not ' + EXPECT.total);
  for (const p of v.agg.parts) {
    assert.strictEqual(p.value, EXPECT[p.id], p.id + ' is ' + p.value + ', not ' + EXPECT[p.id]);
  }
  assert.strictEqual(v.agg.why, null, 'the total is withheld: ' + v.agg.why);
});

test('§1.1 the arithmetic is on screen in words, and its own terms add up to the figure after the equals', () => {
  const l = asRole('u-own');
  const line = l.win.Money.arith(l.win.Money.model(l.model));
  assert(/=/.test(line), 'no equals: ' + line);
  const [lhs, rhs] = line.split(' = ');
  const terms = lhs.split(' + ');
  assert.strictEqual(terms.length, 6, 'the line has ' + terms.length + ' terms, not six: ' + line);
  const num = (s) => Number(String(s).replace(/[^0-9]/g, ''));
  const sum = terms.reduce((a, t) => a + num(t), 0);
  assert.strictEqual(sum, num(rhs), 'the line does not add up: ' + line);
  assert.strictEqual(num(rhs), EXPECT.total, 'the line totals ' + num(rhs));
  assert(spoken(l.win.Money.render(l.model)).includes(line.replace(/&/g, '&')),
    'the arithmetic is computed and not drawn');
  assert(spoken(l.win.Money.render(l.model))
    .includes('These six add up to the total'), 'the card does not say what the line is');
});

/* THE CHECK THIS FILE EXISTS FOR, HALF ONE.
 *
 * `Cost` is replaced by one that answers a per-bus total its own parts do not
 * add up to — the five-bases bug, injected. The screen must not draw the hero
 * at all, and must say which fault it is. The real `reconciles`, `rankPerKm`
 * and `fleetPerKm` are kept, so the only thing changed is the disagreement. */
function liarCost(win) {
  const real = win.Cost;
  const ids = ['fuel', 'parts', 'labour', 'outside', 'trip', 'misc'];
  win.Cost = {
    NOT_IN: real.NOT_IN, COPY: real.COPY,
    reconciles: real.reconciles, rankPerKm: real.rankPerKm, fleetPerKm: real.fleetPerKm,
    forBus: function (busId) {
      return { busId: busId, total: 999,
               parts: ids.map((id) => ({ id: id, label: id, value: 100, n: 1 })),
               unknown: [], why: null, notIn: real.NOT_IN };
    }
  };
  return real;
}

test('§1.1 THE TOTAL IS NOT DRAWN WHEN THE PARTS DO NOT ADD UP TO IT — the five-bases bug, refused', () => {
  const l = asRole('u-own');
  liarCost(l.win);
  const v = l.win.Money.model(l.model);
  assert.strictEqual(v.agg.total, null, 'a total that disagrees with its parts was drawn: ' + v.agg.total);
  assert.strictEqual(v.agg.why, 'mismatch', 'the fault is named "' + v.agg.why + '", not "mismatch"');
  const html = l.win.Money.render(l.model);
  const words = spoken(html);
  assert(words.includes('The parts do not add up to the total'), 'the refusal is not on screen: ' + words.slice(0, 200));
  // The HERO is the figure that must be absent. The per-bus rows below it still
  // carry what Cost answered for each bus, which is the point of saying which.
  assert(/data-state="unknown"/.test(hero(html)), 'the withheld total was drawn anyway: ' + hero(html));
});

test('§1.7 one part that could not be read: its own row refuses, the other five stay, the hero is a dash', () => {
  // `incidents` absent, not empty: Misc could not be READ, which is not zero.
  const cache = fleet();
  delete cache.incidents;
  const l = asRole('u-own', { cache: cache });
  const v = l.win.Money.model(l.model);
  assert.deepEqual(v.agg.unknown, ['misc'], 'unknown is ' + JSON.stringify(v.agg.unknown));
  assert.strictEqual(v.agg.total, null, 'a partial total was drawn as final');
  assert.strictEqual(v.agg.why, 'unknown');
  const html = l.win.Money.render(l.model);
  const words = spoken(html);
  assert(words.includes('Could not read the incidents'), 'the part does not say what failed');
  assert(words.includes('One part could not be read, so the total is not shown'),
    'the hero does not say why it is absent');
  for (const name of ['Fuel & AdBlue', 'Parts', 'Labour', 'Outside work', 'Trip cash']) {
    assert(words.includes(name), 'the other five parts went with it: ' + name + ' is missing');
  }
  assert(/data-state="unknown"/.test(html), 'the hero is not figure(null)');
});

test('§5 rule 1 nothing is formatted before figure() sees it: a real zero is 0 and an unknown is the dash', () => {
  const bare = fleet({ fuel: [], def: [], jobcards: [], ledger: [], trips: [], incidents: [], components: [] });
  const l = asRole('u-own', { cache: bare });
  const v = l.win.Money.model(l.model);
  for (const p of v.agg.parts) assert.strictEqual(p.value, 0, p.id + ' is ' + p.value + ' on an empty period');
  assert.strictEqual(v.empty, true, 'a period with every part read and every one zero is not "empty"');
  const words = spoken(l.win.Money.render(l.model));
  assert(words.includes('No spending recorded'), 'the empty state is not drawn');
  assert(!/Fuel & AdBlue 0/.test(words), 'the six parts were drawn as six zeroes');
});

/* =====================================================================================================
 * 3. THE DENOMINATOR. Four refusals, and a ranking that an unusable figure leaves in BOTH directions.
 * ===================================================================================================== */

test('§1.4 THE PER-KM RANKING LEAVES OUT EVERY BUS WITH NO TRUSTED KM — in both directions', () => {
  const l = asRole('u-own');
  const v = l.win.Money.model(l.model);
  const ranked = v.ranked.map((r) => r.busId);
  assert.deepEqual(ranked, ['b1'], 'the ranking is ' + JSON.stringify(ranked)
    + ': a bus with no km must be neither first nor last');
  assert.deepEqual(v.toCheck.map((c) => c.busId).sort(), ['b2', 'b3'],
    'the excluded buses are not listed separately');
  l.win.Money.pitTab('perkm');
  const html = l.win.Money.render(l.model);
  const pit = html.slice(html.indexOf('data-pit="perkm"'));
  assert(/data-bus="b1"/.test(pit), 'the one rankable bus is missing from the list');
  // The two excluded buses appear ONLY in the stated section, never as a row of
  // the ranking: a row there is a position, and they have none.
  const rows = [];
  const re = /class="v2row v2row-why" href="#" data-bus="(b\d)"/g;
  let hit;
  while ((hit = re.exec(pit)) !== null) rows.push(hit[1]);
  assert.deepEqual(rows, ['b1'], 'an unrankable bus was given a position: ' + JSON.stringify(rows));
});

test('§1.4 the excluded section is always drawn, named with its count, and carries Odo\'s reason per bus', () => {
  const l = asRole('u-own');
  const words = spoken(l.win.Money.render(l.model));
  assert(words.includes('Cannot work out cost per km (2)'), 'the section is unnamed: ' + words.slice(0, 300));
  assert(/Only one reading since/.test(words), 'b2 does not say why it has no km');
  assert(/too close to divide/.test(words), 'b3 does not say why it has no km');
  assert(/240 km apart/.test(words), 'the reason does not name the distance the person has to beat');
});

test('§1.4 a bus with no km carries the words "No km" and a mark, never the dash on its own', () => {
  const l = asRole('u-own');
  l.win.Money.pitTab('total');
  const html = l.win.Money.render(l.model);
  assert(/badge badge-warn/.test(html), 'there is no badge beside the missing figure');
  assert(spoken(html).includes('No km'), 'status is colour alone: the words are missing');
});

test('§1.4 the fleet figure divides only the km it has, and the line names how many buses are out', () => {
  const l = asRole('u-own');
  const v = l.win.Money.model(l.model);
  assert.strictEqual(v.fleet.buses, 1, 'the fleet figure counted ' + v.fleet.buses + ' buses');
  assert.strictEqual(v.fleet.km, 1300, 'the fleet km is ' + v.fleet.km);
  assert.strictEqual(v.fleet.excluded, 2);
  // 30000 over 1300 km. Not 40000 over 1300, which is the whole fleet's money
  // against one bus's distance — 8db78e7 in aggregate.
  assert(Math.abs(v.fleet.perKm - 30000 / 1300) < 1e-9, 'the fleet per km is ' + v.fleet.perKm);
  const words = spoken(l.win.Money.render(l.model));
  assert(words.includes('Worked out over 1,300 km from 1 bus'), 'the line does not state its basis');
  assert(words.includes('2 buses have no km'), 'the line does not state what it left out');
});

test('§1.4 in the per-bus table, no km means a dash in BOTH the km and the cost-per-km cell', () => {
  const l = asRole('u-own', { density: 'desk' });
  l.win.Money.render(l.model);
  // "See all N buses" reveals the table in place, with no route change.
  l.clicks[0]({ target: { closest: (s) => (s === '[data-act]' ? { getAttribute: () => 'moSeeAll' } : null) },
                preventDefault: () => {} });
  const html = l.win.Money.render(l.model);
  const table = html.slice(html.indexOf('mo-bus-t'));
  const rows = table.split('<tr>').filter((r) => /RJ14PA1023/.test(r));
  assert.strictEqual(rows.length, 1, 'b2 is not in the table');
  const cells = rows[0].split('<td');
  // The last two cells are km and cost per km, and both must be the dash.
  assert(/data-state="unknown"/.test(cells[cells.length - 2]), 'the km cell is not a dash');
  assert(/data-state="unknown"/.test(cells[cells.length - 1]), 'the cost-per-km cell is not a dash');
  assert(/badge badge-warn/.test(cells[cells.length - 1]), 'the cost-per-km cell has no "No km" badge');
  // And b1, which HAS km, does carry both figures.
  const good = table.split('<tr>').filter((r) => /RJ09PA6126/.test(r))[0].split('<td');
  assert(/data-state="value"/.test(good[good.length - 2]), 'a bus with real km lost its km cell');
});

test('§1.4 the money pit opens on "By total", because rupees are knowable and per km is not', () => {
  const l = asRole('u-own');
  assert.strictEqual(l.win.Money.pitTab(), 'total', 'the default ranking is the one that can lie');
  const html = l.win.Money.render(l.model);
  assert(/data-pit="total" aria-selected="true"|aria-selected="true" data-pit="total"/.test(html)
    || /aria-selected="true" data-pit="total"/.test(html)
    || /data-pit="total"/.test(html.slice(0, html.indexOf('data-pit="perkm"'))),
  'By total is not the selected tab');
});

/* =====================================================================================================
 * 4. THE ROWS: no age in one, and none a person may not act on
 * ===================================================================================================== */

test('foundation §2.3 rule 4: no figure inside a row or a table cell carries an age note', () => {
  const l = asRole('u-own', { density: 'desk' });
  l.win.Money.render(l.model);
  l.clicks[0]({ target: { closest: (s) => (s === '[data-act]' ? { getAttribute: () => 'moSeeAll' } : null) },
                preventDefault: () => {} });
  const html = l.win.Money.render(l.model);
  for (const chunk of html.split(/class="v2row/).slice(1)) {
    const row = chunk.slice(0, chunk.indexOf('</a>') >= 0 ? chunk.indexOf('</a>') : chunk.length);
    assert(!/figure-note/.test(row), 'an age note inside a row triples its height and runs ageWords per row');
  }
  for (const cell of html.split('<td').slice(1)) {
    assert(!/figure-note/.test(cell.slice(0, cell.indexOf('</td>') + 1)),
      'an age note in a table cell runs ageWords 89 times');
  }
  assert(/figure-note|mo-fresh/.test(html), 'the screen states its freshness nowhere at all');
});

test('the screen states its freshness ONCE, and offline it says when the signal went, in words', () => {
  const on = spoken(asRole('u-own').win.Money.render(asRole('u-own').model));
  assert(/Updated/.test(on), 'no freshness line at all');
  const l = asRole('u-own', { offline: true });
  const html = l.win.Money.render(l.model);
  assert.strictEqual((html.match(/mo-fresh/g) || []).length, 2, 'more than one freshness line');
  assert(spoken(html).includes('No connection since'), 'offline does not say when');
  assert(/mo-fresh-off/.test(html), 'offline is not marked');
});

test('§7.1 item 5 a row a person may not act on is NOT DRAWN: no Buses, no money-pit row', () => {
  const l = asRole('u-own');
  const held = l.win.Caps.holds('owner', 'buses');
  assert.strictEqual(held, true, 'the fixture assumes an owner can open Buses');
  const model = Object.assign({}, l.model, { role: 'store', user: USERS[2] });
  const html = l.win.Money.render(model);
  assert(!/data-bus=/.test(html), 'a storekeeper was offered a link into a screen they do not hold');
});

test('§1.8 a period tab changes what is drawn and never pushes a route', () => {
  const l = asRole('u-own');
  l.win.Money.render(l.model);
  const before = l.win.S.route;
  l.clicks[0]({ target: inMo({ '[data-period]': { getAttribute: () => 'last' } }),
                preventDefault: () => {} });
  assert.strictEqual(l.win.Money.period(), 'last', 'the tab did not change the period');
  assert.strictEqual(l.win.S.route, 'money', 'a tab that pushes a route makes Back walk through filters');
  assert.strictEqual(before, null);
});

test('one listener on document, so the three generic attributes are read only inside Money', () => {
  const l = asRole('u-own');
  l.win.Money.render(l.model);
  // `data-bus` on ANOTHER screen's row must not navigate: Buses (#5) and Fuel &
  // tyres (#10) both list buses, and two screens fighting over one tap is the
  // shape of a navigation nobody asked for.
  const go = [];
  l.win.Router.go = function (id, params) { go.push([id, params]); return true; };
  l.clicks[0]({ target: outside({ '[data-bus]': { getAttribute: () => 'b1' } }), preventDefault: () => {} });
  assert.deepEqual(go, [], 'a bus row on another screen navigated through Money\'s handler');
  l.clicks[0]({ target: inMo({ '[data-bus]': { getAttribute: () => 'b1' } }), preventDefault: () => {} });
  assert.deepEqual(go, [['buses', { id: 'b1' }]], 'Money\'s own money-pit row does not go anywhere');
  // A sheet is appended OUTSIDE the container, so its actions are not scoped.
  l.clicks[0]({ target: outside({ '[data-act]': actBtn('moGive') }), preventDefault: () => {} });
  assert(l.sheets.length === 1, 'the sheet could not be opened from outside the container');
});

test('§1.8 tapping a .num in the trip sheet does exactly nothing — not a navigation, not a write', () => {
  const l = asRole('u-sup');
  let readAct = false;
  l.clicks[0]({ target: { closest: function (sel) {
    if (sel === 'input, select, textarea, label, .num') return { tag: 'input' };
    readAct = true;
    return null;
  } }, preventDefault: () => {} });
  assert.strictEqual(readAct, false, 'the handler read [data-act] after a field click');
  assert.deepEqual(l.db.puts, [], 'a field click wrote a record');
});

/* =====================================================================================================
 * 5. THE SUPERVISOR'S TRIP ENTRY (§1.5, DECISIONS.md §11)
 * ===================================================================================================== */

test('§1.5 the bus is NEVER pre-selected: the first option is a disabled prompt and it is the one chosen', () => {
  const l = asRole('u-sup');
  const sheet = l.win.Money.allowanceSheet(BUSES, [{ id: 'dr1', name: 'Ramesh', busId: 'b1' }],
                                           '2026-06-15', (id) => 'RJ09PA6126');
  const first = sheet.slice(sheet.indexOf('data-field="busId"'));
  const opts = first.slice(0, first.indexOf('</select>')).match(/<option[^>]*>/g) || [];
  assert(/value=""/.test(opts[0]) && /disabled/.test(opts[0]) && /selected/.test(opts[0]),
    'the first option is not a disabled, selected prompt: ' + opts[0]);
  for (const o of opts.slice(1)) {
    assert(!/selected/.test(o), 'a bus is pre-selected — [E] d738a6e charged a part to the wrong bus');
  }
});

test('§1.5 the amount is never pre-filled, and is type=text with inputmode so a wheel cannot change it', () => {
  const l = asRole('u-sup');
  const sheet = l.win.Money.allowanceSheet(BUSES, [], '2026-06-15', () => '');
  const at = sheet.indexOf('data-field="allowance"');
  const field = sheet.slice(sheet.lastIndexOf('<input', at), sheet.indexOf('>', at) + 1);
  assert(/type="text"/.test(field), 'a number input puts spinners in a 32px row and changes on a wheel');
  assert(/inputmode="decimal"/.test(field) && /pattern="\[0-9\]\*\[\.\]\?\[0-9\]\*"/.test(field),
    'the decimal keypad rules are missing: ' + field);
  assert(!/value=/.test(field), 'the amount is pre-filled — a default 0 on money is a figure nobody typed');
  assert(spoken(sheet).includes('Not saved until you press Save allowance'),
    'the sheet does not say that nothing is saved yet');
});

test('§1.5 Save writes ONE trips record, in v1\'s fields only, stamped from the date the person chose', () => {
  const l = asRole('u-sup');
  const rec = l.win.Money.create({ busId: 'b1', driverId: 'dr1', date: '2026-06-10', allowance: '4500' },
                                 { id: 'u-sup' }, NOW);
  assert.deepEqual(Object.keys(rec).sort(),
    ['allowance', 'busId', 'by', 'closedAt', 'driverId', 'expenses', 'fromTo', 'id', 'startedAt', 'status'],
    'the record shape changed: under whole-record last-write-wins a new field is erased by the next v1 write');
  assert.strictEqual(rec.allowance, 4500);
  assert.strictEqual(rec.status, 'active');
  assert.deepEqual(rec.expenses, []);
  assert.strictEqual(rec.by, 'u-sup');
  assert.strictEqual(new Date(rec.startedAt).getDate(), 10,
    'startedAt is the clock, not the chosen date — the round is at 20:00 and the entry may be at 02:00');
});

test('§1.5 Save refuses without a bus, and refuses an amount that is not above zero', () => {
  const l = asRole('u-sup');
  const c = (f) => l.win.Money.create(f, { id: 'u-sup' }, NOW);
  assert.strictEqual(c({ driverId: 'dr1', allowance: '400' }), null, 'saved with no bus');
  assert.strictEqual(c({ busId: 'b1', allowance: '0' }), null, 'saved a zero allowance');
  assert.strictEqual(c({ busId: 'b1', allowance: '' }), null, 'saved a blank allowance');
  assert.strictEqual(c({ busId: 'b1', allowance: '-5' }), null, 'saved a negative allowance');
});

test('§1.5 the three trip states never look alike: no trip, open with nothing back, closed having spent 0', () => {
  const trips = [
    { id: 'tA', busId: 'b1', startedAt: D(8), status: 'active', allowance: 5000, expenses: [] },
    { id: 'tB', busId: 'b2', startedAt: D(9), closedAt: D(9), status: 'closed', allowance: 2000, expenses: [] }
  ];
  const l = asRole('u-sup', { cache: fleet({ trips: trips }) });
  const html = l.win.Money.render(l.model);
  const words = spoken(html);
  assert(/Open since 09:00, expenses not back/.test(words), 'an open trip with nothing back does not say so');
  assert(words.includes('Closed, nothing spent'), 'a closed trip that spent nothing does not say so');
  // The open trip's figure is the dash and the closed one's is a REAL zero.
  const rows = html.split('class="v2row"').filter((r) => /RJ09PA6126|RJ14PA1023/.test(r));
  const open = rows.filter((r) => /expenses not back/.test(r))[0];
  const shut = rows.filter((r) => /nothing spent/.test(r))[0];
  assert(/data-state="unknown"/.test(open), 'an open trip with no expenses shows a number');
  assert(/data-state="value"/.test(shut) && new RegExp('>\u20B90<').test(shut),
    'a closed empty trip is not a real 0: ' + shut.slice(0, 220));
});

test('§1.5 closing is a separate control, it ASKS first, and the sheet comes back frozen with the words', async () => {
  const trips = [{ id: 'tA', busId: 'b1', startedAt: D(8), status: 'active', allowance: 5000, expenses: [] }];
  const l = asRole('u-sup', { cache: fleet({ trips: trips }), confirm: true });
  l.forms['[data-sheet="expenses"]'] = {
    querySelectorAll: () => [{ getAttribute: () => 'tripId', value: 'tA' }]
  };
  const btn = actBtn('moCloseTrip');
  const close = l.clicks[0];
  await close({ target: { closest: (s) => (s === '[data-act]'
    ? btn : null) }, preventDefault: () => {} });
  assert.strictEqual(l.confirms.length, 1, 'closing a trip did not ask');
  assert(l.confirms[0].text.includes('Expenses cannot be added here afterwards'),
    'the question does not say what is lost: ' + l.confirms[0].text);
  const wrote = l.db.puts.filter((p) => p.store === 'trips');
  assert.strictEqual(wrote.length, 1, 'the close wrote ' + wrote.length + ' records');
  assert.strictEqual(wrote[0].obj.status, 'closed');
  assert(typeof wrote[0].obj.closedAt === 'number', 'closedAt was not set');
  const sheet = l.sheets.filter((s) => s.body)[0];
  assert(/mo-frozen/.test(sheet.body), 'the sheet did not come back frozen');
  assert(spoken(sheet.body).includes('Closed trips cannot be changed here'),
    'the frozen sheet does not say why: a dimmed field is status as colour alone');
});

test('§1.5 a cancelled close writes nothing: only the Confirm button is a yes', async () => {
  const trips = [{ id: 'tA', busId: 'b1', startedAt: D(8), status: 'active', allowance: 5000, expenses: [] }];
  const l = asRole('u-sup', { cache: fleet({ trips: trips }), confirm: false });
  l.forms['[data-sheet="expenses"]'] = {
    querySelectorAll: () => [{ getAttribute: () => 'tripId', value: 'tA' }]
  };
  await l.clicks[0]({ target: { closest: (s) => (s === '[data-act]'
    ? actBtn('moCloseTrip') : null) }, preventDefault: () => {} });
  assert.strictEqual(l.confirms.length, 1);
  assert.deepEqual(l.db.puts, [], 'a cancelled close still closed the trip');
});

test('§1.5 expenses are APPENDED to the field the driver\'s rules already treat as append-only', async () => {
  const trips = [{ id: 'tA', busId: 'b1', startedAt: D(8), status: 'active', allowance: 5000,
                   expenses: [{ id: 'eOld', amount: 400, cat: 'food', mode: 'cash' }] }];
  const l = asRole('u-sup', { cache: fleet({ trips: trips }) });
  const rowNode = { querySelectorAll: () => [
    { getAttribute: () => 'cat', value: 'diesel' },
    { getAttribute: () => 'mode', value: 'card' },
    { getAttribute: () => 'amount', value: '1750' }
  ] };
  l.forms['[data-sheet="expenses"]'] = {
    querySelectorAll: (sel) => (sel === '[data-exp]'
      ? [rowNode] : [{ getAttribute: () => 'tripId', value: 'tA' }])
  };
  await l.clicks[0]({ target: { closest: (s) => (s === '[data-act]'
    ? actBtn('moSaveExpenses') : null) }, preventDefault: () => {} });
  const wrote = l.db.puts.filter((p) => p.store === 'trips');
  assert.strictEqual(wrote.length, 1, 'the save wrote ' + wrote.length + ' records');
  const exp = wrote[0].obj.expenses;
  assert.strictEqual(exp.length, 2, 'the existing line was overwritten instead of appended to');
  assert.strictEqual(exp[0].id, 'eOld', 'the order changed: the earlier line is no longer first');
  assert.strictEqual(exp[1].amount, 1750);
  assert.strictEqual(exp[1].mode, 'card');
  assert.strictEqual(exp[1].cat, 'diesel');
});

/* =====================================================================================================
 * 6. THE GATES. Absent, never disabled, never greyed — and a hidden field says so in words.
 * ===================================================================================================== */

test('§1.8 "Give allowance" is ABSENT for a role that cannot write trips, not disabled', () => {
  const l = asRole('u-own');
  const mine = spoken(l.win.Money.render(l.model));
  assert(mine.includes('Give allowance'), 'the owner cannot record trip cash');
  const theirs = l.win.Money.render(Object.assign({}, l.model, { role: 'store', user: USERS[2] }));
  assert(!spoken(theirs).includes('Give allowance'), 'a storekeeper was offered the cash entry');
  assert(!/aria-disabled/.test(theirs), 'a control the person may not use was drawn disabled, not absent');
});

test('§1.7 without `bills`: one total, the count, no vendor name, and ONE line that says it is hidden', () => {
  const l = asRole('u-own');
  assert.strictEqual(l.win.Caps.can('owner', 'bills'), true, 'the fixture assumes an owner holds bills');
  const seen = spoken(l.win.Money.render(l.model));
  assert(seen.includes('Jaipur Auto'), 'a role that holds bills cannot see the vendor');
  // `crewmanager` holds neither bills nor the screen; the gate is read per card,
  // so the model is asked directly with the narrower role.
  const hidden = l.win.Money.render(Object.assign({}, l.model, { role: 'crewmanager' }));
  const words = spoken(hidden);
  assert(!words.includes('Jaipur Auto'), 'a vendor name reached a login without `bills`');
  assert(!words.includes('Tyre Mart'), 'a vendor name reached a login without `bills`');
  assert(words.includes('2 bills, 1 of them over 30 days'), 'the count went with the names');
  assert(words.includes('Supplier names are not shown for your login'),
    'the field is hidden by drawing nothing, which is the silence that has had eight causes');
});

test('§1.7 without `challans` the row is ABSENT, and the lookup prices itself before it is pressed', () => {
  const l = asRole('u-own');
  const words = spoken(l.win.Money.render(l.model));
  assert(words.includes('Challans pending'), 'the liability is missing for a role that holds challans');
  assert(words.includes('Check challans (uses 1 credit)'),
    'the lookup does not price itself: each bus spends a billable credit');
  const no = l.win.Money.render(Object.assign({}, l.model, { role: 'crewmanager' }));
  assert(!spoken(no).includes('Challans pending'), 'the challan row reached a login without the gate');
  assert(!/data-act="moChallans"/.test(no), 'the control is greyed rather than absent');
});

test('§1.7 offline the challan check is ABSENT and the words say why; the figures keep their values', () => {
  const l = asRole('u-own', { offline: true });
  const html = l.win.Money.render(l.model);
  assert(!/data-act="moChallans"/.test(html), 'a button that cannot work was left on screen');
  assert(spoken(html).includes('Needs a connection'), 'nothing says why the control is gone');
  // These are local reads: the figures are real, only their age is in question.
  assert(new RegExp('₹40,000').test(spoken(html)), 'offline threw away a figure the device holds');
});

test('§1.8 the money total is still a number for a supervisor — DECISIONS.md §5 reversed 2 November', () => {
  const l = asRole('u-sup');
  const v = l.win.Money.model(l.model);
  assert.strictEqual(v.agg.total, EXPECT.total, 'the supervisor who reconciles the cash cannot see it');
  assert.strictEqual(v.mayTrip, true, 'the supervisor cannot record the trip cash they collect');
  assert.strictEqual(l.win.Caps.holds('supervisor', 'money'), true, 'Money is not in the supervisor\'s nav');
});

test('§1.6 the challan check spends ONE credit on ONE bus — the bus with no snapshot', async () => {
  const l = asRole('u-own');
  const asked = [];
  l.win.Sync.challans = function (rc) { asked.push(rc); return Promise.resolve({ pendingCount: 1, pendingFine: 500 }); };
  const btn = actBtn('moChallans');
  await l.clicks[0]({ target: { closest: (x) => (x === '[data-act]'
    ? btn : null) }, preventDefault: () => {} });
  // b1 and b2 already have snapshots in the fixture; b3 does not.
  assert.deepEqual(asked, ['RJ19PA7788'],
    'a button priced at 1 credit asked for ' + asked.length + ' lookups: ' + JSON.stringify(asked));
});

test('§1.6 a failed lookup says no credit was spent, and does not print sync.js\'s English at the reader', async () => {
  const l = asRole('u-own');
  l.win.Sync.challans = function () { return Promise.resolve({ error: 'eChallan credits exhausted — top up' }); };
  const btn = actBtn('moChallans');
  await l.clicks[0]({ target: { closest: (x) => (x === '[data-act]'
    ? btn : null) }, preventDefault: () => {} });
  assert(String(btn.textContent).includes('No credit was spent'), 'the button says: ' + btn.textContent);
  assert(!/credits exhausted/.test(String(btn.textContent)),
    'an unregistered English sentence from another module reached the screen');
  assert.strictEqual(btn.getAttribute('aria-disabled'), null, 'the control stayed in flight after it finished');
});

test('§1.9 a write made offline says it is on this phone, not that it went', async () => {
  const l = asRole('u-sup', { offline: true });
  l.win.navigator.onLine = false;
  l.forms['[data-sheet="allowance"]'] = { querySelectorAll: () => [
    { getAttribute: () => 'busId', value: 'b1' },
    { getAttribute: () => 'driverId', value: 'dr1' },
    { getAttribute: () => 'date', value: '2026-06-15' },
    { getAttribute: () => 'allowance', value: '3000' }
  ] };
  await l.clicks[0]({ target: { closest: (x) => (x === '[data-act]'
    ? actBtn('moSaveAllowance') : null) }, preventDefault: () => {} });
  assert.strictEqual(l.db.puts.length, 1, 'the offline write did not land locally');
  const said = l.toasts[l.toasts.length - 1];
  assert(said.text.includes('saved on this phone'), 'it claimed to be sent: ' + said.text);
  assert.strictEqual(said.kind, 'warn', 'a write that has not gone is reported as done');
});

test('§1.8 a press with nothing filled in SAYS SO rather than appearing to do nothing', async () => {
  const l = asRole('u-sup');
  l.forms['[data-sheet="allowance"]'] = { querySelectorAll: () => [
    { getAttribute: () => 'busId', value: '' },
    { getAttribute: () => 'allowance', value: '' }
  ] };
  await l.clicks[0]({ target: { closest: (x) => (x === '[data-act]'
    ? actBtn('moSaveAllowance') : null) }, preventDefault: () => {} });
  assert.deepEqual(l.db.puts, [], 'an empty sheet wrote a cash record');
  assert(l.toasts.length === 1 && l.toasts[0].text.includes('Choose the bus and type the amount'),
    'a silent no-op on a cash button is how a person presses twice');
});

/* THE DEVIATION FROM §1.5, PINNED SO IT CANNOT BE "FIXED" BACK WITHOUT READING WHY.
 *
 * §1.5's table says a bus with no trip record in the period shows figure(null)
 * in its Trip cash cell. It cannot: `Cost.forBus` answers 0 with `n: 0` for that
 * case (DECISIONS.md §19), so the row's Running cost INCLUDES that zero, and a
 * dash in a row whose columns must add up to its total asks the reader to read
 * the dash as a zero — the one thing figure() exists to prevent. The three trip
 * states are said in words in the Trip cash card instead, and the test above
 * covers them there. */
test('§1.1 every per-bus row adds up to its own Running cost, zero Trip cash included', () => {
  const l = asRole('u-own', { density: 'desk' });
  l.win.Money.render(l.model);
  l.clicks[0]({ target: { closest: (x) => (x === '[data-act]' ? { getAttribute: () => 'moSeeAll' } : null) },
                preventDefault: () => {} });
  const html = l.win.Money.render(l.model);
  const table = html.slice(html.indexOf('mo-bus-t'));
  const num = (c) => {
    if (/data-state="unknown"/.test(c)) return null;
    const m = /<span>([^<]*)<\/span>/.exec(c);
    return m ? Number(m[1].replace(/[^0-9]/g, '')) : null;
  };
  const rows = table.split('<tr>').filter((r) => /RJ\d/.test(r));
  assert.strictEqual(rows.length, 3, 'the table has ' + rows.length + ' bus rows, not three');
  for (const r of rows) {
    const cells = r.split('<td').slice(1);
    const total = num(cells[1]);
    const parts = cells.slice(2, 8).map(num);
    assert(parts.every((p) => p !== null), 'a part cell is a dash while the row total is a number: ' + r.slice(0, 120));
    assert.strictEqual(parts.reduce((a, b) => a + b, 0), total,
      'the row does not add up: ' + JSON.stringify(parts) + ' against ' + total);
  }
});

/* =====================================================================================================
 * 7. WORDS AND SHAPE
 * ===================================================================================================== */

test('every id this screen draws is registered: a render in English and in Hindi throws nothing', () => {
  for (const lang of ['en', 'hi']) {
    for (const who of ['u-own', 'u-sup']) {
      for (const density of ['yard', 'desk']) {
        const l = asRole(who, { lang: lang, density: density });
        l.win.Money.pitTab('perkm');
        assert.doesNotThrow(() => l.win.Money.render(l.model),
          'render threw for ' + who + '/' + lang + '/' + density);
        l.win.Money.pitTab('total');
        assert.doesNotThrow(() => l.win.Money.render(l.model));
      }
    }
  }
});

test('a pending Hindi label draws its English WITH ITS ID, so a Hindi reader can report it', () => {
  const l = asRole('u-own', { lang: 'hi' });
  const words = spoken(l.win.Money.render(l.model));
  assert(/\[moPit\]|\[moHero\]|\[moTripCash\]/.test(words),
    'the Hindi fallback is silent again, which is the whole defect v2/ui/words.js exists for');
});

test('render returns ONE string and the body is built once, not row by row', () => {
  const l = asRole('u-own');
  const html = l.win.Money.render(l.model);
  assert.strictEqual(typeof html, 'string');
  assert(html.length > 500, 'the screen drew almost nothing: ' + html.length + ' characters');
  assert(!/appendChild|offsetHeight|getBoundingClientRect|getComputedStyle/.test(MONEY_JS),
    'something measures a row, which is the 277 ms per page this shape exists to avoid');
});

test('§1.7 loading draws the strip at once, skeletons under it, and NEVER the hero mid-fill', () => {
  const l = asRole('u-own', { cache: {} });
  const html = l.win.Money.render(Object.assign({}, l.model, { cache: undefined }));
  assert(/class="tabs mo-tabs"/.test(html), 'the period strip waited for the data');
  assert(/skeleton/.test(html), 'nothing says the screen is loading');
  assert(/data-state="unknown"/.test(html), 'the hero is not a dash while the device is filling');
  assert(!/data-state="value"/.test(html), 'a figure was drawn as final mid-fill — [E] 2170703');
});

test('§1.8 while this device is still filling, every aggregate carries `stale` and says so in words', () => {
  const l = asRole('u-own', { complete: false });
  const html = l.win.Money.render(l.model);
  const hero = html.slice(html.indexOf('class="v"'), html.indexOf('class="v"') + 400);
  assert(/data-state="stale"/.test(hero), 'a partial fleet total was drawn as final — [E] 2170703');
  assert(/figure-note/.test(hero), 'the stale mark is an attribute alone, with no words beside it');
});

/* =====================================================================================================
 * 8. THE MUTANTS. A check that cannot fail is decoration, and this repo has shipped a bug behind one.
 * ===================================================================================================== */

function mutate(from, to) {
  assert(MONEY_JS.includes(from), 'the mutant target is no longer in the file: ' + from);
  return MONEY_JS.replace(from, to);
}
// Run one named check against a patched copy of the screen and report whether
// it went red. `fn` is handed a loader bound to the mutant.
async function underMutant(src, fn) {
  try { await fn(src); } catch (e) { return String(e.message); }
  return null;
}

test('MUTANT must fail: the second path removed, so a total that disagrees with its parts is drawn', async () => {
  const src = mutate("if (C && typeof C.reconciles === 'function' && !C.reconciles(out)) {",
                     'if (false) {');
  const why = await underMutant(src, (s) => {
    const l = asRole('u-own', { src: s });
    liarCost(l.win);
    const v = l.win.Money.model(l.model);
    assert.strictEqual(v.agg.total, null, 'a total that disagrees with its parts was drawn: ' + v.agg.total);
    assert.strictEqual(v.agg.why, 'mismatch');
    assert(spoken(l.win.Money.render(l.model)).includes('The parts do not add up to the total'));
  });
  assert(why !== null, 'the reconciliation check passed with the second path deleted: it is decoration');
  assert(/was drawn: \d+/.test(why), 'it went red, but not where the disagreement was: ' + why);
});

test('MUTANT must fail: the denominator defaulted, so a bus with no odometer gets a cost per km', async () => {
  const src = mutate('var pk = km !== null && total !== null ? total / km : null;',
                     'var pk = total === null ? null : total / (km || 1);');
  const why = await underMutant(src, (s) => {
    const l = asRole('u-own', { density: 'desk', src: s });
    l.win.Money.render(l.model);
    l.clicks[0]({ target: { closest: (x) => (x === '[data-act]' ? { getAttribute: () => 'moSeeAll' } : null) },
                  preventDefault: () => {} });
    const html = l.win.Money.render(l.model);
    const table = html.slice(html.indexOf('mo-bus-t'));
    const row = table.split('<tr>').filter((r) => /RJ14PA1023/.test(r))[0];
    const cells = row.split('<td');
    assert(/data-state="unknown"/.test(cells[cells.length - 1]),
      'a bus with no trusted odometer was given a cost per km — [E] 8db78e7');
  });
  assert(why !== null, 'the no-defaulted-denominator check passed with `|| 1` in the divisor');
  assert(/8db78e7/.test(why), 'it went red, but not on the denominator: ' + why);
});

test('MUTANT must fail: the field guard moved after the [data-act] read', async () => {
  const src = mutate("    if (t.closest('input, select, textarea, label, .num')) return;\n",
                     '');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v2money-'));
  const f = path.join(dir, 'money.js');
  fs.writeFileSync(f, src);
  const body = fs.readFileSync(f, 'utf8');
  const lines = body.split('\n');
  const guard = lines.findIndex((l) => /closest\('input, select, textarea, label, \.num'\)/.test(l)
    && !/^\s*\*/.test(l));
  const act = lines.findIndex((l) => /closest\('\[data-(act|nav)\]'\)/.test(l));
  assert(!(guard >= 0 && guard < act), 'the static guard check cannot see a missing guard');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('MUTANT must fail: a part dropped from the aggregate, so the six on screen are five', async () => {
  const src = mutate("for (i = 0; i < PARTS.length; i++) sums.push({ id: PARTS[i].id, value: 0, n: 0, bad: false });",
                     "for (i = 0; i < PARTS.length - 1; i++) sums.push({ id: PARTS[i].id, value: 0, n: 0, bad: false });");
  const why = await underMutant(src, (s) => {
    const l = asRole('u-own', { src: s });
    const line = l.win.Money.arith(l.win.Money.model(l.model));
    const terms = line.split(' = ')[0].split(' + ');
    assert.strictEqual(terms.length, 6, 'the line has ' + terms.length + ' terms, not six');
    const num = (x) => Number(String(x).replace(/[^0-9]/g, ''));
    assert.strictEqual(terms.reduce((a, t) => a + num(t), 0), num(line.split(' = ')[1]));
  });
  assert(why !== null, 'five parts passed as six: the arithmetic check is decoration');
});

test('MUTANT must fail: unknown read as zero, so a store that could not be read reports no spending', async () => {
  const src = mutate('if (!p || p.id !== sums[j].id || !isNum(p.value)) sums[j].bad = true;',
                     'if (!p || p.id !== sums[j].id) sums[j].bad = true;');
  const why = await underMutant(src, (s) => {
    const cache = fleet();
    delete cache.incidents;
    const l = asRole('u-own', { cache: cache, src: s });
    const v = l.win.Money.model(l.model);
    assert.deepEqual(v.agg.unknown, ['misc'], 'unknown is ' + JSON.stringify(v.agg.unknown));
    assert.strictEqual(v.agg.total, null, 'a partial total was drawn as final');
  });
  assert(why !== null, 'an unreadable part counted as zero and nothing noticed');
});

/* ===================================================================================================== */

runAll().then(() => {
  console.log('──');
  if (fails) {
    console.log('❌ test_v2_money.js: ' + fails + ' failed of ' + QUEUE.length);
    process.exit(1);
  }
  console.log('✅ test_v2_money.js: all ' + QUEUE.length + ' passed');
});

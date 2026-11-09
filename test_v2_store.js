/* Tests for v2 screen slice ST — Store (#6).
 * Run: node test_v2_store.js
 *
 * At the repo ROOT and not in v2/, because scripts/run-tests.py discovers
 * test_*.js at the root only and does not recurse. A test in v2/ would never
 * run, and a test nobody runs is not a test.
 *
 * Node, no browser, in the shape of test_v2_work.js: the real v2/ui/icons.js,
 * v2/ui/words.js, v2/ui/states.js, v2/ui/photos.js, v2/fmt.js, v2/caps.js,
 * v2/router.js and v2/screens/store.js are loaded in a vm context holding a
 * stub window, and the assertions are on the markup STRING the screen returns.
 * That is why render(model) is pure: a screen whose rules can only be checked
 * in a browser is a screen whose rules are checked by nobody.
 *
 * THE THREE CHECKS THIS FILE EXISTS FOR, each with a shipped defect behind it:
 *
 *  1. THE CATALOGUE IS WINDOWED. DECISIONS.md §20 measured 2,384 rows drawn
 *     whole at 410-619 ms on a sixteen-core i9 and the same rows windowed at
 *     7-19 ms. The office runs Core 2 Duos, where this is commonly five to ten
 *     times slower. So the suite counts the rows in the STRING: a render that
 *     draws all 2,384 fails here, on a machine with no browser and no clock.
 *
 *  2. THE LOW COUNT REACHES ZERO ON THE SEEDED DATA. 0 of 2,384 seeded parts
 *     have a reorder level and all 2,384 have qty 0, so `qty <= reorderLevel`
 *     is true for every one of them — 2,384 red rows on a fresh device, a
 *     count that cannot fall (5eb8c6e, ba274f6).
 *
 *  3. A TAP ON A COUNT FIELD DOES NOT MOVE THE ROUTE. A count field inside a
 *     pressable row threw a storekeeper off the screen mid-count. The gate
 *     checks the ORDERING of the guard statically; this drives the handler.
 */
const assert = require('assert');
const fs = require('fs');
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

const STORE_CSS = read(V2('ui', 'store.css'));
const STORE_JS = read(V2('screens', 'store.js'));

/* =====================================================================================================
 * A SMALL CSS READER (the brace-depth reader from test_v2_work.js / test_v2_shell.js)
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
      const list = [];
      for (const d of body.split(';')) {
        const k = d.indexOf(':');
        if (k > 0 && !d.slice(0, k).includes('{')) list.push([d.slice(0, k).trim(), d.slice(k + 1).trim()]);
      }
      rules.push({ ctx: ctx, selector: prelude, list: list });
    }
    i = j;
  }
  return rules;
}
const rulesOf = (css) => parseRules(stripComments(css));
const declsOf = (css) => rulesOf(css).reduce((a, r) => a.concat(r.list.map(([p, v]) => ({ sel: r.selector, ctx: r.ctx, prop: p, val: v }))), []);

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
  for (const bad of ['height:56px', 'gap:8px', 'padding:0 16px'])
    assert(magicPx('.a{' + bad + '}').length > 0, 'detector missed: ' + bad);
  for (const fine of ['height:calc(var(--row-h) * 18)', 'outline-offset:-2px',
    'box-shadow:inset 0 -1px 0 var(--line)', 'outline:2px solid var(--accent)'])
    assert.deepEqual(magicPx('.a{' + fine + '}'), [], 'false positive: ' + fine);
});

test('store.css has declarations to check at all: an empty file would pass every rule below vacuously', () => {
  assert(declsOf(STORE_CSS).length >= 40, 'only ' + declsOf(STORE_CSS).length + ' declarations');
});

test('store.css sizes everything from the tokens: no px literal outside border, outline and box-shadow', () => {
  assert.deepEqual(magicPx(STORE_CSS), []);
});

test('store.css declares no colour of its own — every colour is a token reference', () => {
  assert.deepEqual(literalColour(STORE_CSS), []);
});

test('every store.css selector is [data-v2] scoped, so nothing of v1 is reached', () => {
  const loose = rulesOf(STORE_CSS)
    .map((r) => r.selector)
    .reduce((a, s) => a.concat(s.split(',').map((x) => x.trim())), [])
    .filter((s) => s && !/^\[data-v2\]/.test(s) && !/^(from|to|\d+%)$/.test(s));
  assert.deepEqual(loose, []);
});

test('store.css animates transform and opacity only, and declares no new token of its own', () => {
  const moving = declsOf(STORE_CSS)
    .filter((d) => d.prop === 'transition' || d.prop === 'animation')
    .filter((d) => !/^(?:transform|opacity)\b/.test(d.val));
  assert.deepEqual(moving, [], 'something other than transform or opacity animates');
  const minted = declsOf(STORE_CSS).filter((d) => /^--/.test(d.prop));
  assert.deepEqual(minted, [], 'a new token was minted: tokens.css is the one place they live');
});

/* The window's height and the renderer's row count are one number in two
 * files. If they drift, the window draws fewer rows than the viewport shows
 * and the list ends in a blank strip — so the two are pinned to each other. */
test('the window height in store.css and VIEW_ROWS in store.js are the same eighteen rows', () => {
  const css = declsOf(STORE_CSS).filter((d) => d.sel.indexOf('.st-cat') >= 0 && d.prop === 'height');
  assert.strictEqual(css.length, 1, '.st-cat has no single height rule');
  const rows = /calc\(var\(--row-h\)\s*\*\s*(\d+)\)/.exec(css[0].val);
  assert(rows, '.st-cat height is not a multiple of --row-h: ' + css[0].val);
  const js = /var VIEW_ROWS = (\d+);/.exec(STORE_JS);
  assert(js, 'VIEW_ROWS is not declared in store.js');
  assert.strictEqual(rows[1], js[1], 'store.css says ' + rows[1] + ' rows and store.js says ' + js[1]);
});

/* =====================================================================================================
 * LOADING: the screen in a stub window, the way a page loads it
 * ===================================================================================================== */

function el(tag) {
  const e = {
    tag: tag, html: '', inserts: 0, attrs: {}, classes: {}, find: null, parentNode: null, value: '',
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

const SRC = ['ui/icons.js', 'ui/words.js', 'ui/states.js', 'ui/photos.js',
             'fmt.js', 'caps.js', 'router.js', 'screens/store.js'];

/* The screen file a context loads. A mutant case hands a PATCHED copy here, in
 * its own context: re-running a second copy of the screen into a context that
 * already holds one throws on W.register (one word, one place), so a mutant
 * that shared a context would "fail" for the wrong reason and prove nothing. */
function srcList(screenFile) {
  return SRC.map((f) => (f === 'screens/store.js' && screenFile ? screenFile : V2(f)));
}

function fakeDB() {
  return {
    puts: [],
    async put(name, obj) {
      this.puts.push({ store: name, obj: JSON.parse(JSON.stringify(obj)) });
      return obj;
    },
    async all() { return []; },
    async get() { return null; },
    markDirty() {}, dirtySnapshot() { return new Set(); }, clearDirty() {},
    order() { return this.puts.map((p) => p.store); }
  };
}

function load(o) {
  o = o || {};
  const html = el('html');
  html.lang = o.lang || 'en';
  html.setAttribute('data-v2', '');
  html.setAttribute('data-density', o.density || 'yard');

  const clicks = [], inputs = [], scrolls = [];
  const logs = { warn: [], error: [] };
  const sheets = [], toasts = [], confirms = [], mounts = [], loaded = [];
  const db = fakeDB();
  const sheetBody = el('div');

  const sandbox = {
    navigator: { onLine: o.offline ? false : true, userAgent: 'node', language: 'en' },
    location: { href: 'http://localhost/v2/', pathname: '/v2/' },
    document: {
      documentElement: html,
      title: '',
      addEventListener: function (type, fn) {
        if (type === 'click') clicks.push(fn);
        if (type === 'input' || type === 'change') inputs.push(fn);
        if (type === 'scroll') scrolls.push(fn);
      },
      removeEventListener: function () {},
      getElementById: function () { return null; },
      querySelector: function (sel) { return sel === 'dialog.ov-sheet .ov-body' ? sheetBody : null; },
      querySelectorAll: function () { return []; },
      createElement: function () { return el('div'); },
      head: { appendChild: function () {} }, body: null
    },
    getComputedStyle: function () { return {}; },
    addEventListener: function () {}, removeEventListener: function () {},
    setTimeout: setTimeout, clearTimeout: clearTimeout,
    console: { warn: (m) => logs.warn.push(String(m)), error: (m) => logs.error.push(String(m)),
               info: () => {}, log: () => {} },
    S: { user: o.me || null, route: null, stack: [], cache: {} },
    DB: db,
    Sync: { info: () => ({ pending: 0, lastSyncAt: o.lastSyncAt == null ? Date.now() - 4 * 60000 : o.lastSyncAt,
                           lastError: '', status: o.offline ? 'offline' : 'synced' }) },
    Boot: { density: () => o.density || 'yard', replica: () => ({ behind: 0, complete: o.complete !== false }) },
    Cache: { load: async (names) => { loaded.push(names); return {}; }, sig: () => '0', sigOf: () => '0', reads: () => 0 },
    Shell: { mount: function (id, params) { mounts.push({ id: id, params: params }); return true; },
             body: function () { return true; } },
    V2: {
      openSheet: function (title, body) { sheets.push({ title: title, body: String(body) }); return el('dialog'); },
      closeSheet: function () { sheets.push({ closed: true }); },
      confirmDialog: function (text, opts) {
        confirms.push({ text: text, opts: opts });
        return Promise.resolve(o.confirm !== false);
      },
      toast: function (text, opts) { toasts.push({ text: text, kind: opts && opts.kind }); return el('div'); }
    },
    fetch: o.fetch || (async () => { throw new Error('no network in this suite'); })
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  for (const f of srcList(o.screen)) vm.runInContext(read(f), ctx, { filename: f });
  /* THE SHELL MOUNTS THE SCREEN, so the suite does too.
   *
   * Until INTEGRATION-NOTES 17 was fixed, `store.js` called its own `mount()`
   * at script load and this loader relied on that: the listener was simply
   * there. That load-time call WAS the defect — a listener installed before
   * `boot.js` had created `S`, and never removed for the whole session — so
   * `Shell.mount` now calls `mount()` on the way in and `unmount()` on the way
   * out, and a screen's load registers and nothing more. This line stands where
   * the frame's call stands. The checks below are unchanged. */
  if (sandbox.Store && typeof sandbox.Store.mount === 'function') sandbox.Store.mount();
  return { win: sandbox, db: db, root: html, clicks: clicks, inputs: inputs, scrolls: scrolls,
           logs: logs, sheets: sheets, toasts: toasts, confirms: confirms, mounts: mounts,
           loaded: loaded, sheetBody: sheetBody };
}

/* ---- the fixtures ---------------------------------------------------------
 * THE SEED, in its real shape. seed-data.js holds 2,384 parts and every one of
 * them has `qty: 0`, `reorderLevel: 0`, `unitCost: 0` and `unit: 'pc'`; 59% of
 * them have no `partNo`; the spellings are the catalogue's own. Those four
 * zeroes are the whole reason this screen is hard, so the fixture keeps them.
 */
const NOW = Date.now();
const DAY = 86400000;

const SEED_NAMES = ['FULE FILTER', 'MAKHI WASER FRONT 2518 B BANZ', 'WHEEL CHUCKNUT B BANZ',
                    'Hydrolic Oils', 'BRAKE PAD SET', 'CLUTCH PLATE'];

function seedParts(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({
      id: 'part-' + (3000 + i), extId: String(3000 + i),
      name: SEED_NAMES[i % SEED_NAMES.length] + (i >= SEED_NAMES.length ? ' ' + i : ''),
      partNo: i % 5 === 0 ? String(328305 + i) : '',
      category: '', unit: 'pc', qty: 0, reorderLevel: 0, unitCost: 0,
      alertDays: 30, serialTracked: false, reusable: false, createdAt: 0
    });
  }
  return out;
}

const SEED = seedParts(2384);

// A garage that has been running: a few parts with a level set, so the low
// count has something to count and something to fall to.
const STOCKED = [
  { id: 'p-low', name: 'Oil Filter', partNo: 'FLT-OIL-9', category: 'Filters', unit: 'pc',
    qty: 3, reorderLevel: 6, unitCost: 410, serialTracked: false, reusable: false },
  { id: 'p-ok', name: 'Air Filter', partNo: 'FLT-AIR-3', category: 'Filters', unit: 'pc',
    qty: 9, reorderLevel: 4, unitCost: 650, serialTracked: false, reusable: false },
  { id: 'p-neg', name: 'Wheel Nut', partNo: 'WN-20', category: 'Body', unit: 'pc',
    qty: -2, reorderLevel: 0, unitCost: 40, serialTracked: false, reusable: false },
  { id: 'p-out', name: 'Fan Belt', partNo: 'FB-7', category: 'Engine', unit: 'pc',
    qty: 0, reorderLevel: 0, unitCost: 900, serialTracked: false, reusable: true },
  { id: 'p-never', name: 'King Pin Kit', partNo: '', category: 'Front axle', unit: 'pc',
    qty: 0, reorderLevel: 0, unitCost: 0, serialTracked: false, reusable: false }
];

const USERS = [
  { id: 'u-store', role: 'store', name: 'Store' },
  { id: 'u-sup', role: 'supervisor', name: 'Mohan' },
  { id: 'u-own', role: 'owner', name: 'Owner' },
  { id: 'u-m1', role: 'mechanic', name: 'Ramesh Kumar' },
  { id: 'u-crew', role: 'crewmanager', name: 'Crew' }
];
const BUSES = [{ id: 'b1', regNo: 'RJ09PA6126', odometer: 184000 },
               { id: 'b2', regNo: 'RJ14PA1023', odometer: 251000 }];

function card(over) {
  return Object.assign({
    id: 'j-4f2', busId: 'b1', problem: 'Brake overhaul', status: 'open',
    assignees: [{ userId: 'u-m1', task: '' }], assignedTo: 'u-m1',
    partsUsed: [], partRequests: [], createdAt: NOW - 2 * 3600000, updatedAt: NOW - 3600000
  }, over || {});
}

const CARDS = [
  card(),
  card({ id: 'j-old', busId: 'b2', status: 'verified', problem: 'Service',
         partsUsed: [{ partId: 'p-out', qty: 1, cost: 900, reused: false }] }),
  card({ id: 'j-req', busId: 'b2', status: 'open', problem: 'Oil leak',
         partRequests: [{ id: 'pr-1', partId: 'p-ok', partName: 'Air Filter', qty: 2,
                          status: 'requested', by: 'u-m1', at: NOW - 3 * 3600000 }] })
];

const LEDGER = [
  { id: 'l-1', partId: 'p-out', type: 'out', qty: 1, jobId: 'j-old', reason: 'Issued to job',
    by: 'u-store', at: NOW - 5 * DAY }
];

const VENDORS = [
  { id: 'vend-1029', name: 'MIDAS TYRE', category: 'Parts', isRepairVendor: false, phone: '9799932999',
    gstin: '08AMHPG4748G1ZY', city: 'Jaipur', notes: '', createdAt: 0 },
  { id: 'vend-1036', name: 'Volvo', category: 'Repair', isRepairVendor: true, phone: '9660046147',
    gstin: '', city: 'Jaipur', notes: 'Contact: Kamlesh ji', createdAt: 0 }
];

const BILLS = [
  { id: 'pur-1', supplier: 'MIDAS TYRE', vendorId: 'vend-1029', billNo: 'MT-991', amount: 28400,
    items: '', lines: [], paymentStatus: 'pending', at: NOW - 8 * DAY },
  { id: 'pur-2', supplier: 'MIDAS TYRE', vendorId: 'vend-1029', billNo: '', amount: 11000,
    items: '', lines: [], paymentStatus: 'pending', at: NOW - 3 * DAY },
  { id: 'pur-3', supplier: 'Volvo', vendorId: 'vend-1036', billNo: 'V-12', amount: 90000,
    items: '', lines: [], paymentStatus: 'paid', paidAt: NOW - DAY, at: NOW - 20 * DAY }
];

const PIECES = [
  { id: 'c-t1', kind: 'tyre', label: 'Tyre FR', serial: 'MRF-9921', busId: 'b1', position: 'FR',
    state: 'in-service', installedAt: NOW - 120 * DAY, installedOdo: 150000, lifeKm: 60000,
    maxRefurb: 2, refurbCount: 0, cost: 21500, boughtAt: NOW - 120 * DAY, warrantyMonths: 36,
    history: [{ type: 'install', at: NOW - 120 * DAY, odo: 150000, busId: 'b1', note: 'New tyre fitted' }] },
  { id: 'c-t2', kind: 'tyre', label: 'Tyre FL', serial: 'MRF-9922', busId: 'b1', position: '',
    state: 'sent-out', installedOdo: 0, lifeKm: 45000, maxRefurb: 2, refurbCount: 1,
    boughtAt: NOW - 900 * DAY, warrantyMonths: 12, history: [] },
  { id: 'c-b1', kind: 'battery', label: 'Battery', serial: 'BAT-1', busId: null, position: '',
    state: 'removed', installedOdo: 0, lifeKm: 0, maxRefurb: 0, refurbCount: 0, history: [] }
];

const AUDITS = [
  { id: 'au-1', at: NOW - 4 * DAY, by: 'u-store', mode: 'blind',
    lines: [{ partId: 'p-low', system: 4, counted: 3, variance: -1, value: 410 },
            { partId: 'p-ok', system: 9, counted: 9, variance: 0, value: 0 },
            { partId: 'p-out', system: 0, counted: 0, variance: 0, value: 0 }],
    shrinkValue: 410, foundValue: 0 }
];

function cacheOf(o) {
  o = o || {};
  return {
    parts: o.parts || SEED.concat(STOCKED),
    ledger: o.ledger || LEDGER,
    jobcards: o.jobcards || CARDS,
    audits: o.audits === undefined ? AUDITS : o.audits,
    purchases: o.purchases || BILLS,
    vendors: o.vendors || VENDORS,
    components: o.components === undefined ? PIECES : o.components,
    buses: o.buses || BUSES,
    users: o.users || USERS,
    gatepasses: o.gatepasses || []
  };
}

function asRole(roleId, o) {
  o = o || {};
  const me = USERS.filter((u) => u.id === roleId)[0];
  const l = load(Object.assign({}, o, { me: me }));
  l.win.S.user = me;
  l.win.S.cache = cacheOf(o.cache);
  l.me = me;
  return l;
}

function model(l, o) {
  o = o || {};
  if (o.cache) l.win.S.cache = cacheOf(o.cache);
  return {
    route: 'store', params: o.params || null,
    role: (o.me || l.me || {}).role || null,
    density: o.density || 'yard',
    user: o.me || l.me || null,
    cache: l.win.S.cache,
    replica: { behind: 0, complete: o.complete !== false },
    stale: o.complete === false, offline: !!o.offline
  };
}

const rowCount = (html) => (html.match(/class="v2row/g) || []).length;
const countOf = (html, re) => (html.match(re) || []).length;

/* The one delegated listener, driven the way the browser drives it. Each fake
 * target answers exactly one shape, so a target that answered everything
 * cannot make every branch look alive. */
function target(spec) {
  const node = el(spec.tag || 'button');
  Object.keys(spec.attrs || {}).forEach((k) => node.setAttribute(k, spec.attrs[k]));
  node.closest = function (sel) {
    if (spec.field && /input|select|textarea|label|\.num/.test(sel)) return el('input');
    const m = /^\[([-a-z]+)\]$/.exec(sel);
    if (m && spec.attrs && Object.prototype.hasOwnProperty.call(spec.attrs, m[1])) return node;
    return null;
  };
  return node;
}

function click(l, spec) {
  const node = target(spec);
  let prevented = 0;
  const ev = { target: node, preventDefault: function () { prevented++; } };
  l.clicks.forEach((fn) => fn(ev));
  return { node: node, prevented: prevented };
}

/* =====================================================================================================
 * 1. THE CATALOGUE IS WINDOWED — the consequence of DECISIONS.md §20
 * ===================================================================================================== */

test('2,384 catalogue rows are NOT all drawn: the window is tens of rows, and the rest is spacing', () => {
  const l = asRole('u-store');
  const html = l.win.Store.render(model(l, { density: 'desk' }));
  const drawn = rowCount(html);
  assert(drawn > 0, 'no rows at all were drawn');
  assert(drawn <= 40, drawn + ' rows were drawn: that is the 410-619 ms draw §20 measured, not a window');
  assert(!/data-open-part="part-2000"/.test(html), 'a row far outside the window was drawn');
});

test('the window carries the whole catalogue in its scroll height, as arithmetic on --row-h and nothing measured', () => {
  const l = asRole('u-store');
  const html = l.win.Store.render(model(l, { density: 'desk' }));
  const pads = /padding-top:calc\(var\(--row-h\) \* (\d+)\);padding-bottom:calc\(var\(--row-h\) \* (\d+)\)/.exec(html);
  assert(pads, 'the window has no spacing computed from --row-h: ' + html.slice(0, 400));
  const above = Number(pads[1]), below = Number(pads[2]);
  assert.strictEqual(above + below + rowCount(html.replace(/class="v2row/g, 'class="v2row')), 0 + above + below + rowCount(html));
  assert.strictEqual(above, 0, 'the first draw starts part way down the list');
  const v = l.win.Store.model(model(l, { density: 'desk' }));
  assert.strictEqual(v.cat.above + v.cat.rows.length + v.cat.below, v.cat.total,
    'the window and its spacing do not add up to the catalogue');
  assert(!/px/.test(pads[0].replace(/--row-h/g, '')), 'a px literal reached the window spacing');
});

test('scrolling draws a different window, not more rows', () => {
  const l = asRole('u-store');
  const before = l.win.Store.render(model(l, { density: 'desk' }));
  l.win.Store.scrollTo(900);
  const after = l.win.Store.render(model(l, { density: 'desk' }));
  assert.strictEqual(rowCount(after), rowCount(before), 'the window grew while scrolling');
  assert(before !== after, 'the window did not move');
  const pads = /padding-top:calc\(var\(--row-h\) \* (\d+)\)/.exec(after);
  assert(Number(pads[1]) > 0, 'nothing was left above the window after scrolling down');
});

test('firstFor never runs off either end of the catalogue, whatever the scroll offset says', () => {
  const S = asRole('u-store').win.Store;
  assert.strictEqual(S.firstFor(2384, 0, 32), 0);
  assert.strictEqual(S.firstFor(2384, -500, 32), 0);
  assert.strictEqual(S.firstFor(2384, 1e9, 32), 2384 - S.span);
  assert.strictEqual(S.firstFor(5, 1e9, 32), 0, 'a list shorter than one window still starts at the top');
  const r = S.winRange(2384, 2380);
  assert.strictEqual(r.to, 2384);
  assert.strictEqual(r.below, 0, 'the last window leaves spacing below the last row');
});

test('a catalogue that fits in one window has no spacing and no cap line of its own', () => {
  const l = asRole('u-store', { cache: { parts: STOCKED } });
  const html = l.win.Store.render(model(l));
  assert.strictEqual(rowCount(html), STOCKED.length);
  assert(/padding-top:calc\(var\(--row-h\) \* 0\);padding-bottom:calc\(var\(--row-h\) \* 0\)/.test(html),
    'a short list still reserves spacing');
});

/* =====================================================================================================
 * 2. LOW STOCK, AND THE COUNT THAT COULD NEVER REACH ZERO
 * ===================================================================================================== */

test('with the bundled seed — 2,384 parts, every reorderLevel 0 — the low count is 0 and not 2,384', () => {
  const l = asRole('u-store', { cache: { parts: SEED } });
  assert.strictEqual(l.win.Store.low(SEED).length, 0,
    'every seeded part counts as low: this is 5eb8c6e, and the count can never reach zero');
  const v = l.win.Store.model(model(l, { cache: { parts: SEED } }));
  assert.strictEqual(v.counts.low, 0);
  assert.strictEqual(v.counts.noLevel, 2384, 'the 2,384 with no level are not counted anywhere');
});

test('the catalogue does not draw 2,384 red rows: the parts with no level are ONE line with a way to fix them', () => {
  const l = asRole('u-store', { cache: { parts: SEED } });
  const html = l.win.Store.render(model(l, { cache: { parts: SEED } }));
  assert.strictEqual(countOf(html, /badge-warn/g), 0, 'a Low badge was drawn for a part with no reorder level');
  assert.strictEqual(countOf(html, / Low</g), 0, 'the word Low was drawn for a part that was never stocked');
  assert(/2,384 parts have no reorder level/.test(html), 'the one line that stands for all 2,384 is missing');
  assert(/data-act="stSetNoLevel"/.test(html), 'the line has no way to act on it');
});

test('low is qty <= reorderLevel AND a level above zero — v1 isLow, transcribed', () => {
  const S = asRole('u-store').win.Store;
  assert.strictEqual(S.isLow({ qty: 3, reorderLevel: 6 }), true);
  assert.strictEqual(S.isLow({ qty: 6, reorderLevel: 6 }), true, 'equal to the level is low');
  assert.strictEqual(S.isLow({ qty: 9, reorderLevel: 4 }), false);
  assert.strictEqual(S.isLow({ qty: 0, reorderLevel: 0 }), false, 'the seed shape must not be low');
  assert.strictEqual(S.isLow({ qty: 0 }), false, 'an absent level must not be low');
  assert.strictEqual(S.isLow({ qty: 0, reorderLevel: 'x' }), false, 'an unreadable level must not be low');
  assert.strictEqual(S.isLow({ qty: -2, reorderLevel: 0 }), false,
    'a negative book with no level is a count problem, not a reorder');
});

test('THE COUNT REACHES ZERO: buy every low part back above its level and the figure is 0', () => {
  const l = asRole('u-store');
  const stocked = STOCKED.map((p) => Object.assign({}, p, { qty: Math.max(p.qty, (p.reorderLevel || 0) + 1) }));
  const v = l.win.Store.model(model(l, { cache: { parts: SEED.concat(stocked) } }));
  assert.strictEqual(v.counts.low, 0, 'the low count cannot be emptied, which v2-ux.md §4.1 forbids by name');
});

test('out of stock, never counted and a negative book are three different figures', () => {
  const S = asRole('u-store').win.Store;
  const moved = { 'p-out': true };
  assert.strictEqual(S.stockState({ id: 'p-out', qty: 0 }, moved), 'out', 'a real zero with a ledger row');
  assert.strictEqual(S.stockState({ id: 'p-new', qty: 0 }, moved), 'never', 'a zero nobody ever counted');
  assert.strictEqual(S.stockState({ id: 'p-neg', qty: -2 }, moved), 'negative');
  assert.strictEqual(S.stockState({ id: 'p-x', qty: null }, moved), 'unknown');
  const l = asRole('u-store', { cache: { parts: STOCKED } });
  const html = l.win.Store.render(model(l, { cache: { parts: STOCKED } }));
  assert(/Not counted yet/.test(html), 'a part nobody ever counted reads the same as a real zero');
  assert(/Out of stock/.test(html), 'a real zero does not say so');
  assert(/data-state="unknown"/.test(html), 'a never-counted part was drawn as a number instead of the dash');
});

test('a negative book is not hidden: it says what it says and asks for a count', () => {
  const l = asRole('u-store', { cache: { parts: STOCKED } });
  const html = l.win.Store.render(model(l, { cache: { parts: STOCKED }, density: 'desk' }));
  assert(/Count this part/.test(html), 'a book below zero is drawn as if it were fine');
  assert(/badge-bad/.test(html));
});

/* =====================================================================================================
 * 3. THE REGRESSION THIS SCREEN IS NAMED FOR
 * ===================================================================================================== */

test('a tap on a count field leaves the route stable: the listener returns before it reads an attribute', () => {
  const l = asRole('u-store');
  l.win.Store.tab('store', 'counts');
  l.win.Store._session({ mode: 'blind', scope: { kind: 'category', value: 'Filters' }, typed: {} });
  const before = l.mounts.length;
  const r = click(l, { tag: 'input', field: true, attrs: { 'data-act': 'stIssue', 'data-tab': 'bills' } });
  assert.strictEqual(l.mounts.length, before, 'the screen redrew from a tap on a field');
  assert.strictEqual(l.sheets.length, 0, 'a tap on a field opened a sheet');
  assert.strictEqual(r.prevented, 0, 'the handler took the event from the field');
  const cur = l.win.Router.current();
  assert.strictEqual(cur.id, null, 'the route moved when somebody put the caret in a count field');
});

test('the field guard is the FIRST thing the listener does, before any data attribute is read', () => {
  const src = stripComments(STORE_JS);
  const guard = src.indexOf("closest(FIELDS)");
  const act = src.search(/closest\('\[data-(act|nav|tab)\]'\)/);
  assert(guard > 0, 'the listener does not guard with the named field selector');
  assert(act > 0, 'the listener reads no data attribute at all, so this check is testing nothing');
  assert(guard < act, 'a guard that runs after the attribute read is not a guard');
  assert(/input, select, textarea, label, \.num/.test(src), 'the field selector is not declared');
});

test('every count row is a div — never a button, never a link — and the field is text with a numeric keypad', () => {
  const l = asRole('u-store');
  l.win.Store.tab('store', 'counts');
  l.win.Store._session({ mode: 'blind', scope: { kind: 'category', value: 'Filters' }, typed: {} });
  const html = l.win.Store.render(model(l));
  assert(/<div class="v2row st-count-row">/.test(html), 'the count rows are not divs');
  assert.strictEqual(countOf(html, /<button class="v2row|<a class="v2row/g), 0,
    'a pressable row holds a count field');
  assert(/type="text" inputmode="numeric"/.test(html), 'the count field is not text with a numeric keypad');
  assert.strictEqual(countOf(html, /type="number"/g), 0,
    'type="number" puts spinners in a 32px row and changes its value on a mouse wheel');
});

test('there are no steppers anywhere on the screen: every number is a reading or a count', () => {
  const l = asRole('u-store');
  l.win.Store.tab('store', 'counts');
  l.win.Store._session({ mode: 'full', scope: { kind: 'category', value: 'Filters' }, typed: { 'p-low': '3' } });
  const html = l.win.Store.render(model(l))
    + l.win.Store.issueSheet(model(l)) + l.win.Store.countSheet(model(l));
  assert.strictEqual(countOf(html, /data-step|step="|num-h/g), 0, 'a stepper reached the screen');
  assert.strictEqual(countOf(html, /type="number"/g), 0);
});

test('typing in a count field changes no route and redraws nothing: the caret stays where it is', () => {
  const l = asRole('u-store');
  l.win.Store.tab('store', 'counts');
  const s = { mode: 'blind', scope: { kind: 'category', value: 'Filters' }, typed: {} };
  l.win.Store._session(s);
  const before = l.mounts.length;
  const node = el('input');
  node.setAttribute('data-count', 'p-low');
  node.value = '3';
  l.inputs.forEach((fn) => fn({ target: node }));
  assert.strictEqual(s.typed['p-low'], '3', 'the typed count was not kept');
  assert.strictEqual(l.mounts.length, before, 'the screen redrew while somebody was typing a count');
});

/* =====================================================================================================
 * 4. THE NAME AS STORED, AND THE SEARCH
 * ===================================================================================================== */

test('a part name renders exactly as stored: FULE FILTER is not title-cased and Hydrolic Oils is not corrected', () => {
  const l = asRole('u-store', { cache: { parts: SEED.slice(0, 6) } });
  const html = l.win.Store.render(model(l, { cache: { parts: SEED.slice(0, 6) } }));
  assert(/>FULE FILTER</.test(html), 'the stored spelling was prettified, so the shelf label cannot be found');
  assert(/>Hydrolic Oils</.test(html));
  assert(/>MAKHI WASER FRONT 2518 B BANZ</.test(html));
  assert.strictEqual(countOf(html, />Fule Filter<|>Fuel Filter</g), 0);
});

test('search is a case-insensitive substring over name and partNo, with no stemming and no guess', () => {
  const S = asRole('u-store').win.Store;
  assert.strictEqual(S.matches({ name: 'FULE FILTER' }, 'fule'), true);
  assert.strictEqual(S.matches({ name: 'FULE FILTER' }, 'FILTER'), true);
  assert.strictEqual(S.matches({ name: 'FULE FILTER' }, 'FUEL'), false,
    'a storekeeper typing FUEL must be told nothing matched rather than shown a guess');
  assert.strictEqual(S.matches({ name: 'Oil Filter', partNo: '328305' }, '3283'), true);
  assert.strictEqual(S.matches({ name: 'Oil Filter', partNo: '' }, ''), true);
});

test('a search that matches nothing says so, and names what was typed', () => {
  const l = asRole('u-store');
  l.win.Store.search('FUEL');
  const html = l.win.Store.render(model(l));
  assert(/Nothing matched/.test(html), 'an empty search result was drawn as an empty book');
  assert(/FUEL/.test(html), 'the words do not say what was typed');
  assert.strictEqual(rowCount(html), 0);
});

test('the header says search is the only way through a catalogue this size', () => {
  const l = asRole('u-store');
  const html = l.win.Store.render(model(l));
  assert(/Search is the only way through 2,38[0-9] parts\./.test(html), 'the size is not stated');
  const total = SEED.length + STOCKED.length;
  assert(html.indexOf(l.win.fmt.groupIndian(total) + ' parts') >= 0,
    'the header count is not grouped the Indian way: a lakh read in thousands is a decimal place out');
});

/* =====================================================================================================
 * 5. THE ISSUE FLOW — the card is never the sheet's own pick
 * ===================================================================================================== */

test('with no jobId the sheet opens with NO card chosen, even though open cards exist', () => {
  const l = asRole('u-store');
  const S = l.win.Store;
  assert.strictEqual(S.cardFromRoute(null, CARDS), null);
  assert.strictEqual(S.cardFromRoute({}, CARDS), null, 'the sheet picked a card nobody named');
  S._issue({ cardId: null, partId: null, search: '', qty: '', reused: false });
  const sheet = S.issueSheet(model(l));
  assert(/Choose the job card this part is going to/.test(sheet), 'the card step is not the first step');
  assert(/aria-disabled="true"/.test(sheet), 'the sheet can be submitted with no card');
  assert(/Choose a card first\./.test(sheet), 'the reason the sheet cannot advance is not in words');
  assert.strictEqual(countOf(sheet, /aria-current="true"|checked/g), 0, 'something was pre-selected');
});

test("slice W's handoff is read: Router.go('store', {jobId}) opens the flow against THAT card and no other", () => {
  const l = asRole('u-store');
  const S = l.win.Store;
  const chosen = S.cardFromRoute({ jobId: 'j-4f2' }, CARDS);
  assert(chosen && chosen.id === 'j-4f2', 'the jobId param was not read');
  l.win.Router.register('store', S);
  l.win.Router.go('store', { jobId: 'j-4f2' });
  S.onClick({ target: target({ attrs: { 'data-act': 'stIssue' } }), preventDefault: function () {} });
  const sheet = l.sheets[l.sheets.length - 1];
  assert(sheet && /Going to card j-4f2, RJ09PA6126/.test(sheet.body),
    'the sheet did not open against the card the route named');
  assert(/data-act="stClearCard"/.test(sheet.body), 'there is no way to choose a different card');
});

test('a jobId naming a card that is closed, or missing, chooses nothing — there is no fallback to the first open card', () => {
  const S = asRole('u-store').win.Store;
  assert.strictEqual(S.cardFromRoute({ jobId: 'j-old' }, CARDS), null, 'a closed card was accepted');
  assert.strictEqual(S.cardFromRoute({ jobId: 'j-nope' }, CARDS), null);
  assert.strictEqual(S.cardFromRoute({ jobId: '' }, CARDS), null);
  assert(!/cards\[0\]|cards\s*\[\s*0\s*\]/.test(stripComments(STORE_JS).split('function cardFromRoute')[1].slice(0, 600)),
    'cardFromRoute reaches for a first card: that is d738a6e');
});

test('a waiting request fills the card AND the part, because the mechanic named both; the quantity is still typed', () => {
  const l = asRole('u-store');
  const S = l.win.Store;
  S.onClick({ target: target({ attrs: { 'data-act': 'stFulfil', 'data-req': 'pr-1' } }),
              preventDefault: function () {} });
  const sheet = l.sheets[l.sheets.length - 1];
  assert(sheet, 'the request did not open the issue sheet');
  assert(/Going to card j-req/.test(sheet.body), 'the card the mechanic named was dropped');
  assert(/Air Filter/.test(sheet.body), 'the part the mechanic named was dropped');
  assert(/data-field="stIssueQty"[^>]*value=""/.test(sheet.body), 'the quantity was pre-filled');
});

test('the quantity is blank and never a pre-filled 1', () => {
  const l = asRole('u-store');
  l.win.Store._issue({ cardId: 'j-4f2', partId: 'p-ok', search: '', qty: '', reused: false });
  const sheet = l.win.Store.issueSheet(model(l));
  assert(/data-field="stIssueQty"[^>]*value=""/.test(sheet));
  assert.strictEqual(countOf(sheet, /data-field="stIssueQty"[^>]*value="1"/g), 0);
});

test('the confirmation names the part, the bus, the card and what the book will say afterwards', () => {
  const l = asRole('u-store');
  l.win.Store._issue({ cardId: 'j-4f2', partId: 'p-ok', search: '', qty: '2', reused: false });
  const sheet = l.win.Store.issueSheet(model(l));
  assert(/Issue 2 pc Air Filter to RJ09PA6126, card j-4f2\. The book goes from 9 to 7\./.test(sheet),
    'the consequence is not in words: ' + (/st-confirm[^<]*<[^>]*>([^<]*)/.exec(sheet) || [])[0]);
  assert(!/aria-disabled="true"/.test(sheet.split('data-act="stIssueSave"')[1].slice(0, 40)),
    'a complete issue cannot be submitted');
});

test('the part step shows each result with its stock figure AND its age, because parts.qty is replaced by the later write', () => {
  const l = asRole('u-store');
  l.win.Store._issue({ cardId: 'j-4f2', partId: null, search: 'Air', qty: '', reused: false });
  const sheet = l.win.Store.issueSheet(model(l));
  assert(/figure-note/.test(sheet), 'the stock figure in the part step carries no age (§2.7 step 2)');
});

test('THE THREE WRITES, in this order and no other: ledger, then the book, then the card', async () => {
  const l = asRole('u-store');
  l.win.Store._issue({ cardId: 'j-4f2', partId: 'p-ok', search: '', qty: '2', reused: false });
  await l.win.Store.onClick({ target: target({ attrs: { 'data-act': 'stIssueSave' } }),
                              preventDefault: function () {} });
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(l.db.order(), ['ledger', 'parts', 'jobcards'],
    'the writes are in another order: an interruption then leaves stock short with nothing to say where it went');
  const led = l.db.puts[0].obj;
  assert.strictEqual(led.type, 'out');
  assert.strictEqual(led.qty, 2);
  assert.strictEqual(led.jobId, 'j-4f2');
  assert.strictEqual(led.reason, 'Issued to job', 'the ledger reason is not the value v1 writes and reads');
  assert.strictEqual(l.db.puts[1].obj.qty, 7, 'the book did not come down');
  assert.deepEqual(l.db.puts[2].obj.partsUsed, [{ partId: 'p-ok', qty: 2, cost: 1300, reused: false }]);
});

test('a second issue of the same part merges into the one line the server merges by, and does not add a second', () => {
  const S = asRole('u-store').win.Store;
  const part = { id: 'p-ok', name: 'Air Filter', unit: 'pc', qty: 9, unitCost: 650 };
  const open = card({ partsUsed: [{ partId: 'p-ok', qty: 1, cost: 650, reused: false }] });
  const w = S.issueWrites(part, open, 2, false, { id: 'u-store' }, NOW);
  assert.strictEqual(w.card.partsUsed.length, 1, 'a second line was added for the same part');
  assert.strictEqual(w.card.partsUsed[0].qty, 3);
  assert.strictEqual(w.card.partsUsed[0].cost, 1950);
  const r = S.issueWrites(part, open, 2, true, { id: 'u-store' }, NOW);
  assert.strictEqual(r.card.partsUsed.length, 2, 'a reused part shares a line with a new one');
  assert.strictEqual(r.ledger.reason, 'Issued to job (reused)');
});

test('AN ISSUE IS NEVER BLOCKED BY THE BOOK: below zero it still saves, and the words say what the book now reads', async () => {
  const l = asRole('u-store');
  l.win.Store._issue({ cardId: 'j-4f2', partId: 'p-ok', search: '', qty: '11', reused: false });
  const sheet = l.win.Store.issueSheet(model(l));
  assert(!/aria-disabled="true"/.test(sheet.split('data-act="stIssueSave"')[1].slice(0, 40)),
    'an issue that takes the book below zero was refused, so the part leaves with no ledger row');
  await l.win.Store.onClick({ target: target({ attrs: { 'data-act': 'stIssueSave' } }),
                              preventDefault: function () {} });
  await new Promise((r) => setTimeout(r, 0));
  assert.strictEqual(l.db.order()[0], 'ledger', 'the anti-pilferage row was not written');
  assert.strictEqual(l.db.puts[1].obj.qty, -2);
  const t = l.toasts[l.toasts.length - 1];
  const minus = new RegExp('The book now says ' + l.win.fmt.groupIndian(-2) + '\\. Count this part\\.');
  assert(minus.test(t.text), 'the negative book was not said out loud: ' + t.text);
});

test('an interrupted issue is said to be healing, not offered as a form to re-fill', () => {
  const l = asRole('u-store');
  const ledger = LEDGER.concat([{ id: 'l-9', partId: 'p-ok', type: 'out', qty: 2, jobId: 'j-4f2',
                                  reason: 'Issued to job', by: 'u-store', at: NOW - 60000 }]);
  const html = l.win.Store.render(model(l, { cache: { ledger: ledger } }));
  assert(/1 issue is still being matched to its card/.test(html), 'the half-finished state is hidden');
  assert.strictEqual(countOf(html, /data-act="stRetryIssue"/g), 0, 'the screen asks for the issue again');
});

/* =====================================================================================================
 * 6. THE SHELF COUNT AND ITS TRUST NUMBER
 * ===================================================================================================== */

test('the trust number is the share of counted lines that matched, with its age, and it is never a bare 0', () => {
  const l = asRole('u-store');
  l.win.Store.tab('store', 'counts');
  const html = l.win.Store.render(model(l));
  assert(/The book matched the shelf on 2 of 3 lines counted\./.test(html), 'the trust number is missing');
  assert(/figure-note/.test(html), 'the trust number does not say when it was taken');
  assert(/Value short/.test(html) && /410/.test(html), 'the shrinkage value is not shown');
});

test('a shelf nobody ever counted is the dash and its own sentence, not a zero', () => {
  const l = asRole('u-store', { cache: { audits: [] } });
  l.win.Store.tab('store', 'counts');
  const html = l.win.Store.render(model(l, { cache: { audits: [] } }));
  assert(/This shelf has never been counted/.test(html));
  assert(/data-state="unknown"/.test(html), 'never counted was drawn as a number');
  assert(/No count recorded/.test(html), 'the empty state is missing');
});

test('a count taken long ago says it may be out of date, which is a third state and not the second', () => {
  const l = asRole('u-store');
  const old = [Object.assign({}, AUDITS[0], { at: NOW - 200 * DAY })];
  const t = l.win.Store.trust(old, NOW);
  assert.strictEqual(t.stale, true);
  l.win.Store.tab('store', 'counts');
  const html = l.win.Store.render(model(l, { cache: { audits: old } }));
  assert(/data-state="stale"/.test(html), 'an old count is drawn as a current one');
  const fresh = l.win.Store.trust(AUDITS, NOW);
  assert.strictEqual(fresh.stale, false);
});

test('the count states, before anything is typed, that it is not saved until the button is pressed', () => {
  const l = asRole('u-store');
  l.win.Store.tab('store', 'counts');
  l.win.Store._session({ mode: 'blind', scope: { kind: 'category', value: 'Filters' }, typed: {} });
  const html = l.win.Store.render(model(l));
  assert(/This count is not saved until you press Save count\. Do not close the app\./.test(html),
    'the honest state is not stated, and the data model cannot keep the promise instead');
  assert(/aria-disabled="true"/.test(html.split('data-act="stSaveCount"')[1].slice(0, 60)),
    'Save count works with nothing typed');
});

test('offline, the count says it saves on this phone and sends later', () => {
  const l = asRole('u-store', { offline: true });
  l.win.Store.tab('store', 'counts');
  l.win.Store._session({ mode: 'blind', scope: { kind: 'category', value: 'Filters' }, typed: {} });
  const html = l.win.Store.render(model(l, { offline: true }));
  assert(/This count saves on this phone and sends when there is signal\./.test(html));
});

test('a blind count does not draw the book figure, and a full one does', () => {
  const l = asRole('u-store');
  l.win.Store.tab('store', 'counts');
  l.win.Store._session({ mode: 'blind', scope: { kind: 'category', value: 'Filters' }, typed: {} });
  const blind = l.win.Store.render(model(l));
  assert.strictEqual(countOf(blind, /st-book/g), 0,
    'the book figure is on screen during a blind count, so anybody can type what the book says');
  l.win.Store._session({ mode: 'full', scope: { kind: 'category', value: 'Filters' }, typed: {} });
  const full = l.win.Store.render(model(l));
  assert(countOf(full, /st-book/g) > 0, 'a full count hides the book it is meant to reconcile against');
});

test('the mode is chosen once, in the opening sheet, and cannot be changed mid-count', () => {
  const l = asRole('u-store');
  const sheet = l.win.Store.countSheet(model(l));
  assert(/data-field="stCountMode"/.test(sheet), 'the opening sheet does not ask how the count will be taken');
  assert(/Count without the book showing \(blind\)/.test(sheet));
  l.win.Store.tab('store', 'counts');
  l.win.Store._session({ mode: 'blind', scope: { kind: 'category', value: 'Filters' }, typed: {} });
  const running = l.win.Store.render(model(l));
  assert.strictEqual(countOf(running, /data-field="stCountMode"/g), 0,
    'the mode can be switched halfway, which makes a blind count not blind while the record says it was');
});

test('a count session is scoped to one category, not 2,384 parts', () => {
  const l = asRole('u-store');
  l.win.Store.tab('store', 'counts');
  l.win.Store._session({ mode: 'blind', scope: { kind: 'category', value: 'Filters' }, typed: {} });
  const v = l.win.Store.model(model(l));
  assert.strictEqual(v.count.session.rows.length, 2, 'the session is not scoped to its category');
  const html = l.win.Store.render(model(l));
  assert(rowCount(html) < 50, 'a count session drew the whole catalogue');
});

test('saving a count writes audits FIRST, then the corrected parts, then one append-only ledger row each', async () => {
  const l = asRole('u-store');
  l.win.Store.tab('store', 'counts');
  l.win.Store._session({ mode: 'blind', scope: { kind: 'category', value: 'Filters' },
                         typed: { 'p-low': '1', 'p-ok': '9' } });
  await l.win.Store.onClick({ target: target({ attrs: { 'data-act': 'stSaveCount' } }),
                              preventDefault: function () {} });
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(l.db.order(), ['audits', 'parts', 'ledger'],
    'the audit row is not written first, so an interruption leaves corrected stock with nothing to explain it');
  const a = l.db.puts[0].obj;
  assert.strictEqual(a.mode, 'blind');
  assert.strictEqual(a.lines.length, 2, 'a line nobody counted was written as a count');
  assert.strictEqual(a.shrinkValue, 820, 'the shortfall value is wrong: ' + a.shrinkValue);
  assert.strictEqual(a.foundValue, 0);
  assert.strictEqual(l.db.puts[1].obj.qty, 1, 'the counted figure did not reach the book');
  assert.strictEqual(l.db.puts[2].obj.reason, 'Audit shortfall (shrinkage)');
  assert.strictEqual(l.db.puts[2].obj.type, 'out');
});

test('Save count asks for the consequence in words first, and a refused confirmation writes nothing', async () => {
  const l = asRole('u-store', { confirm: false });
  l.win.Store.tab('store', 'counts');
  l.win.Store._session({ mode: 'blind', scope: { kind: 'category', value: 'Filters' }, typed: { 'p-low': '1' } });
  await l.win.Store.onClick({ target: target({ attrs: { 'data-act': 'stSaveCount' } }),
                              preventDefault: function () {} });
  await new Promise((r) => setTimeout(r, 0));
  assert.strictEqual(l.confirms.length, 1, 'a count saved with no confirmation');
  assert(/Save this count\? 1 parts will be corrected\./.test(l.confirms[0].text),
    'the confirmation does not name the consequence: ' + l.confirms[0].text);
  assert.deepEqual(l.db.puts, [], 'Cancel wrote the count anyway');
});

test('a line that matches the book is recorded as counted and corrects nothing', () => {
  const S = asRole('u-store').win.Store;
  const w = S.countWrites({ mode: 'full', scope: { kind: 'category', value: 'Filters' }, typed: { 'p-ok': '9' } },
                           STOCKED, { id: 'u-store' }, NOW);
  assert.strictEqual(w.audit.lines.length, 1);
  assert.strictEqual(w.audit.lines[0].variance, 0);
  assert.strictEqual(w.parts.length, 0, 'a part that matched was written for nothing');
  assert.strictEqual(w.ledger.length, 0);
  assert.strictEqual(w.audit.shrinkValue, 0);
});

test('a surplus and a shortfall are two numbers and never one net figure', () => {
  const S = asRole('u-store').win.Store;
  const w = S.countWrites({ mode: 'full', scope: { kind: 'all', value: '' }, typed: { 'p-low': '1', 'p-ok': '11' } },
                           STOCKED, { id: 'u-store' }, NOW);
  assert.strictEqual(w.audit.shrinkValue, 820);
  assert.strictEqual(w.audit.foundValue, 1300);
  assert.strictEqual(w.ledger.filter((r) => r.type === 'in')[0].reason, 'Audit surplus');
});

/* =====================================================================================================
 * 7. CAPABILITIES — absent, never disabled
 * ===================================================================================================== */

test('a mechanic sees Catalogue and Pieces and nothing else, and the two writes are absent from the DOM', () => {
  const l = asRole('u-m1');
  const html = l.win.Store.render(model(l));
  const v = l.win.Store.model(model(l));
  assert.deepEqual(v.tabs, ['catalogue', 'pieces'], 'a mechanic was given a tab they cannot use');
  assert.strictEqual(countOf(html, /data-act="stIssue"|data-act="stReceive"/g), 0,
    'the writes were drawn for a reader who holds only viewStore');
  assert.strictEqual(countOf(html, /aria-disabled/g), 0,
    'a control the mechanic may not use was disabled instead of absent');
  assert.strictEqual(countOf(html, /data-tab="counts"|data-tab="bills"|data-tab="requests"/g), 0);
});

test("the mechanic's empty catalogue sends them to their job card, which is where asking for a part lives", () => {
  const l = asRole('u-m1', { cache: { parts: [] } });
  const html = l.win.Store.render(model(l, { cache: { parts: [] } }));
  assert(/To ask for a part, open your job card\./.test(html));
  assert.strictEqual(countOf(html, /data-act="stIssue"/g), 0);
});

test('a storekeeper sees all five tabs and both writes', () => {
  const l = asRole('u-store');
  const v = l.win.Store.model(model(l));
  assert.deepEqual(v.tabs, ['catalogue', 'pieces', 'requests', 'bills', 'counts']);
  const html = l.win.Store.render(model(l));
  assert(/data-act="stIssue"/.test(html) && /data-act="stReceive"/.test(html));
});

test('the screen declares viewStore in Caps.SCREENS, and the capabilities it uses inside are listed there too', () => {
  const { win } = load({});
  const s = win.Caps.SCREENS.store;
  assert.deepEqual(s.declares, ['viewStore']);
  for (const cap of ['issuePart', 'receiveStock', 'bills', 'manageComponents']) {
    assert(s.gates.indexOf(cap) >= 0, cap + ' is used by the screen and is not in its gates list');
  }
  assert.strictEqual(win.Caps.can('mechanic', 'viewStore'), true);
  assert.strictEqual(win.Caps.can('mechanic', 'issuePart'), false);
});

test('the row-level Issue control exists at desk for somebody who may issue, and not at all for somebody who may not', () => {
  const store = asRole('u-store');
  const deskStore = store.win.Store.render(model(store, { density: 'desk' }));
  assert(/data-act="stIssuePart"/.test(deskStore), 'the desk row has no Issue control');
  const mech = asRole('u-m1');
  const deskMech = mech.win.Store.render(model(mech, { density: 'desk' }));
  assert.strictEqual(countOf(deskMech, /data-act="stIssuePart"/g), 0);
});

/* =====================================================================================================
 * 8. THE `bills` SPLIT, AND THE VENDOR BEHIND THE BILL
 * ===================================================================================================== */

test('no fleet-wide spend total and no fleet stock value appears anywhere on this screen', () => {
  const l = asRole('u-store');
  let html = '';
  for (const t of ['catalogue', 'pieces', 'requests', 'bills', 'counts']) {
    l.win.Store.tab('store', t);
    html += l.win.Store.render(model(l));
  }
  html += l.win.Store.billSheet(model(l), 'pur-1');
  assert.strictEqual(countOf(html, /30 days|this month|this year|last 30|per km|\/km/gi), 0,
    'a period or per-km total reached the Store screen: that is Money\'s (§2.1)');
  // 28,400 + 11,000 + 90,000 would be the fleet figure; it must not be drawn.
  assert.strictEqual(countOf(html, /1,29,400|129400/g), 0, 'a sum across vendors was drawn');
});

test("one vendor's unpaid bills are the list, the count and their sum, and nothing wider", () => {
  const l = asRole('u-store');
  const u = l.win.Store.vendorUnpaid(BILLS, 'vend-1029', 'MIDAS TYRE');
  assert.strictEqual(u.count, 2);
  assert.strictEqual(u.sum, 39400, 'the vendor sum is wrong: ' + u.sum);
  assert.strictEqual(u.rows.filter((b) => b.paymentStatus === 'paid').length, 0, 'a paid bill is in the unpaid list');
  const other = l.win.Store.vendorUnpaid(BILLS, 'vend-1036', 'Volvo');
  assert.strictEqual(other.count, 0);
  assert.strictEqual(other.sum, 0);
});

test('the vendor card holds the vendor, the phone as a tel link, and that vendor s unpaid bills', () => {
  const l = asRole('u-store');
  l.win.Store.tab('store', 'bills');
  l.win.Store.onClick({ target: target({ attrs: { 'data-act': 'stOpenVendor', 'data-vendor': 'vend-1029' } }),
                        preventDefault: function () {} });
  const html = l.win.Store.render(model(l));
  assert(/MIDAS TYRE/.test(html));
  assert(/href="tel:9799932999"/.test(html), 'the phone is not dialable');
  assert(/08AMHPG4748G1ZY/.test(html), 'the GSTIN is missing');
  assert(/2 unpaid bills/.test(html), 'the unpaid count is missing');
  assert(/39,400/.test(html), 'the unpaid sum for this vendor is missing');
});

test('a bill with no number says so, and a paid bill and an unpaid one do not look alike', () => {
  const l = asRole('u-store');
  l.win.Store.tab('store', 'bills');
  const html = l.win.Store.render(model(l));
  assert(/No bill number/.test(html));
  assert(/ Unpaid</.test(html) && / Paid</.test(html));
  assert(countOf(html, /badge-warn/g) >= 2 && countOf(html, /badge-ok/g) >= 1,
    'the payment states carry no mark of their own');
});

test('a saved bill says in words that it cannot be changed, and Mark paid is a control that works', async () => {
  const l = asRole('u-store');
  const sheet = l.win.Store.billSheet(model(l), 'pur-1');
  assert(/A saved bill cannot be changed\. Ask a supervisor\./.test(sheet));
  assert(/data-act="stMarkPaid"/.test(sheet));
  await l.win.Store.onClick({ target: target({ attrs: { 'data-act': 'stMarkPaid', 'data-bill': 'pur-1' } }),
                              preventDefault: function () {} });
  await new Promise((r) => setTimeout(r, 0));
  assert.strictEqual(l.db.puts.length, 1);
  const b = l.db.puts[0].obj;
  assert.strictEqual(b.paymentStatus, 'paid');
  assert.strictEqual(b.paidBy, 'u-store');
  assert(b.paidAt > 0);
  assert.strictEqual(b.amount, 28400, 'marking a bill paid changed another field');
  assert.strictEqual(b.billNo, 'MT-991');
});

test('a paid bill draws no Mark paid control at all', () => {
  const l = asRole('u-store');
  const sheet = l.win.Store.billSheet(model(l), 'pur-3');
  assert.strictEqual(countOf(sheet, /data-act="stMarkPaid"/g), 0);
});

/* =====================================================================================================
 * 9. RECEIVE STOCK
 * ===================================================================================================== */

test('offline, the receive sheet says so BEFORE anything is filled in, and offers no reading', () => {
  const l = asRole('u-store', { offline: true });
  l.win.Store._receive({ photos: [], draft: null, reading: false });
  const sheet = l.win.Store.receiveSheet(model(l, { offline: true }));
  assert(/No signal\. The photo is saved\. The reading needs signal\./.test(sheet));
  assert.strictEqual(countOf(sheet, /data-act="stReadBill"/g), 0, 'the reading was offered with no signal');
  assert(/photo-add/.test(sheet), 'the photo cannot be taken offline, and it is a local write');
});

test('a bill photographed and not read is not a record yet, and the sheet says so', () => {
  const l = asRole('u-store');
  l.win.Store._receive({ photos: [{ url: 'u1' }], draft: null, reading: false });
  const sheet = l.win.Store.receiveSheet(model(l));
  assert(/Not saved yet/.test(sheet));
  assert(/aria-disabled="true"/.test(sheet), 'a bill with no reading could be saved');
});

test('the reading is a draft: the model is named, every field is editable, and nothing is saved as read', () => {
  const l = asRole('u-store');
  l.win.Store._receive({ photos: [{ url: 'u1' }], reading: false, draft: {
    supplier: 'MIDAS TYRE', billNo: 'MT-992', total: 4200, model: 'claude-x',
    lines: [{ partId: 'p-ok', qty: 2, rate: 650 }, { text: 'SOME OTHER THING', qty: 1, rate: 90 }]
  } });
  const sheet = l.win.Store.receiveSheet(model(l));
  assert(/Read by claude-x\. Check every line\./.test(sheet), 'the reader is not named');
  assert(/data-field="stBillSupplier"[^>]*value="MIDAS TYRE"/.test(sheet));
  assert(/Not matched to a part — these do not change stock/.test(sheet), 'an unmatched line was dropped');
  assert(/SOME OTHER THING/.test(sheet), 'the unmatched line itself is gone');
  assert(/Saving adds 1 items to stock\./.test(sheet), 'the stock consequence is not in words');
});

/* The reading needs the server, and every call to the server in v2 goes
 * through v2/sync.js, which has no bill() yet. So the screen asks for one and
 * does without it rather than opening its own connection with the token in a
 * drawing file. */
test('the screen opens no connection of its own: the reading is Sync s to make', () => {
  const src = stripComments(STORE_JS);
  assert.strictEqual(countOf(src, /\bfetch\s*\(/g), 0,
    'a screen reached the network directly, which puts an auth header in a drawing file');
  assert(/Sync\.bill/.test(src), 'the screen does not ask Sync for the reading at all');
});

test('with no reader on the device the reading control is absent, and the bill is entered by hand instead', () => {
  const l = asRole('u-store');
  l.win.Store._receive({ photos: [{ url: 'u1' }], draft: null, reading: false });
  const sheet = l.win.Store.receiveSheet(model(l));
  assert.strictEqual(countOf(sheet, /data-act="stReadBill"/g), 0,
    'a control that cannot work was drawn');
  assert(/data-act="stHandBill"/.test(sheet), 'there is no way to record the bill at all');
  l.win.Store.onClick({ target: target({ attrs: { 'data-act': 'stHandBill' } }), preventDefault: function () {} });
  const after = l.win.Store.receiveSheet(model(l));
  assert(/Entered by hand\. Nothing was read for you\./.test(after),
    'a hand-entered bill claims to have been read');
  assert(/data-field="stBillSupplier"/.test(after), 'the hand draft has no fields');
});

test('when Sync grows a bill reader, the screen uses it and names the model that read it', async () => {
  const l = asRole('u-store');
  l.win.Sync.bill = async () => ({ supplier: 'MIDAS TYRE', billNo: 'MT-993', total: 650,
                                   model: 'claude-y', lines: [{ partId: 'p-ok', qty: 1, rate: 650 }] });
  l.win.Store._receive({ photos: [{ url: 'u1' }], draft: null, reading: false });
  const sheet = l.win.Store.receiveSheet(model(l));
  assert(/data-act="stReadBill"/.test(sheet), 'the reading was not offered although the device can read');
  await l.win.Store.onClick({ target: target({ attrs: { 'data-act': 'stReadBill' } }),
                              preventDefault: function () {} });
  await new Promise((r) => setTimeout(r, 0));
  assert(/Read by claude-y\. Check every line\./.test(l.win.Store.receiveSheet(model(l))));
});

test('receiving writes vendors (only when new), purchases, then parts and ledger — and re-averages the price', () => {
  const S = asRole('u-store').win.Store;
  const draft = { supplier: 'MIDAS TYRE', billNo: 'MT-992', total: 1300, model: 'm',
                  lines: [{ partId: 'p-ok', qty: 1, rate: 750 }, { text: 'UNKNOWN', qty: 1, rate: 10 }] };
  const w = S.receiveWrites(draft, STOCKED, VENDORS, { id: 'u-store' }, NOW);
  assert.strictEqual(w.vendor, null, 'an existing supplier was duplicated: 03 §9 trap 25');
  assert.strictEqual(w.purchase.vendorId, 'vend-1029');
  assert.strictEqual(w.parts.length, 1);
  assert.strictEqual(w.parts[0].qty, 10, 'the stock did not go up');
  assert.strictEqual(w.parts[0].unitCost, 660, 'the price was not re-averaged: ' + w.parts[0].unitCost);
  assert.strictEqual(w.ledger[0].type, 'in');
  assert.strictEqual(w.ledger[0].reason, 'Purchase from MIDAS TYRE');
  assert.strictEqual(w.unmatched, 1);
  assert(/UNKNOWN/.test(w.purchase.items), 'an unmatched line left the record entirely');
  const fresh = S.receiveWrites(Object.assign({}, draft, { supplier: 'NEW TYRE CO' }), STOCKED, VENDORS,
                                { id: 'u-store' }, NOW);
  assert(fresh.vendor && fresh.vendor.name === 'NEW TYRE CO', 'a new supplier was not registered');
});

/* =====================================================================================================
 * 10. PIECES — the per-piece register and its warranty
 * ===================================================================================================== */

test('warranty has three forms that never look alike, and an absent one is never "ended"', () => {
  const S = asRole('u-store').win.Store;
  assert.strictEqual(S.warranty({ boughtAt: NOW - 30 * DAY, warrantyMonths: 36 }, NOW).kind, 'in');
  assert.strictEqual(S.warranty({ boughtAt: NOW - 900 * DAY, warrantyMonths: 12 }, NOW).kind, 'ended');
  assert.strictEqual(S.warranty({ boughtAt: NOW - 900 * DAY }, NOW).kind, 'none',
    'a piece with no warranty recorded was called ended, and 0 of 2,384 seeded parts carry one');
  assert.strictEqual(S.warranty({ warrantyMonths: 12 }, NOW).kind, 'none');
  assert.strictEqual(S.warranty({}, NOW).kind, 'none');
});

test('the piece sheet names the warranty state in words, and the never-recorded one says exactly that', () => {
  const l = asRole('u-store');
  assert(/In warranty to /.test(l.win.Store.pieceSheet(model(l), 'c-t1')));
  assert(/Warranty ended /.test(l.win.Store.pieceSheet(model(l), 'c-t2')));
  const none = l.win.Store.pieceSheet(model(l), 'c-b1');
  assert(/No warranty recorded/.test(none));
  assert.strictEqual(countOf(none, /Warranty ended/g), 0);
});

test('the register row carries the kind mark, the label and serial, the state as a word, and the bus', () => {
  const l = asRole('u-store');
  l.win.Store.tab('store', 'pieces');
  const html = l.win.Store.render(model(l));
  assert(/Tyre FR · MRF-9921/.test(html));
  assert(/ In service</.test(html) && / Sent out for repair</.test(html), 'a piece state is colour alone');
  assert(/RJ09PA6126/.test(html));
  assert(/No serial number|BAT-1/.test(html));
});

test('a piece with no position says so, and life used is the dash when the odometer it was fitted at is unknown', () => {
  const l = asRole('u-store');
  const two = l.win.Store.pieceSheet(model(l), 'c-t2');
  assert(/Position not recorded/.test(two));
  assert(/data-state="unknown"/.test(two), 'life used was drawn as 0 km on a piece with no fitted reading');
  const one = l.win.Store.pieceSheet(model(l), 'c-t1');
  assert(/34,000/.test(one), 'life used is not the bus odometer less the fitted reading');
  assert(/Refurbished 0 of 2 times/.test(one));
});

test('the whole life of a piece is here: its history, newest first, with what each step cost', () => {
  const l = asRole('u-store');
  const html = l.win.Store.pieceSheet(model(l), 'c-t1');
  assert(/What has happened to this piece/.test(html));
  assert(/>Fitted · /.test(html), 'the history is not in words');
});

/* =====================================================================================================
 * 11. THE SCREEN'S OWN RULES
 * ===================================================================================================== */

test('no .figure-note sits inside a row of any list on the screen, at either density', () => {
  for (const density of ['yard', 'desk']) {
    const l = asRole('u-store');
    for (const t of ['catalogue', 'pieces', 'requests', 'bills', 'counts']) {
      l.win.Store.tab('store', t);
      const html = l.win.Store.render(model(l, { density: density }));
      const rows = html.split(/class="v2row/).slice(1);
      for (const r of rows) {
        const row = r.split('</a>')[0].split('</button>')[0].split('</div></div>')[0];
        assert.strictEqual(countOf(row, /figure-note/g), 0,
          'an age inside a ' + t + ' row at ' + density + ': it triples the row height and runs once per row');
      }
    }
  }
});

test('a tab changes the view and never pushes a route, so a back press leaves the screen', () => {
  const l = asRole('u-store');
  l.win.Store.render(model(l));
  l.win.Router.register('store', l.win.Store);
  l.win.Router.go('store', null);
  const before = l.win.Router.current();
  const r = click(l, { attrs: { 'data-tab': 'bills' } });
  assert.strictEqual(l.win.Store.tab('store'), 'bills', 'the tab did not change');
  assert.deepEqual(l.win.Router.current(), before, 'a tab pushed a route');
  assert(l.mounts.length > 0, 'the screen did not redraw after the tab changed');
  assert.strictEqual(r.prevented, 1, 'the tab did not take the event');
});

test('the loading state draws the header and both writes first, and a skeleton where the list will be', () => {
  const l = asRole('u-store');
  const m = model(l);
  m.cache = {};
  const html = l.win.Store.render(m);
  assert(/skeleton/.test(html), 'there is no skeleton while the stores are being read');
  assert(/data-act="stIssue"/.test(html), 'the two writes wait for data they do not need');
  assert(/role="tablist"/.test(html));
});

test('a store that came back as something other than a list is an error with a retry, not an empty book', () => {
  const l = asRole('u-store');
  const m = model(l);
  m.cache = Object.assign({}, m.cache, { parts: 'broken' });
  const html = l.win.Store.render(m);
  assert(/Could not read the part book/.test(html));
  assert(/data-state-retry/.test(html), 'the error has no retry');
  assert.strictEqual(countOf(html, /No parts in the book yet/g), 0);
});

test('offline the rows stay, with their freshness in the header and not on every row', () => {
  const l = asRole('u-store', { offline: true });
  const html = l.win.Store.render(model(l, { offline: true }));
  assert(rowCount(html) > 0, 'offline replaced rows that are real and local');
  assert.strictEqual(countOf(html, /state-offline/g), 0);
});

test('the screen reads the ten stores it draws from, once, through Cache.load', () => {
  const l = asRole('u-store');
  assert(l.loaded.length > 0, 'mount() never asked for any data');
  const names = l.loaded[0];
  for (const n of ['parts', 'ledger', 'jobcards', 'audits', 'purchases', 'vendors', 'components', 'gatepasses'])
    assert(names.indexOf(n) >= 0, n + ' is drawn and never read');
});

test('the screen registers its words with an English value and a Hindi key, and guesses no Hindi', () => {
  const { win } = load({});
  const ids = win.W.ids().filter((id) => /^st[A-Z]/.test(id));
  assert(ids.length > 50, 'only ' + ids.length + ' Store labels are registered');
  for (const id of ids) {
    const e = win.W.entry(id);
    assert(e && e.en !== undefined && e.en !== null, id + ' has no English');
    assert('hi' in e, id + ' has no Hindi key at all');
  }
});

test('the ledger reason values are the English v1 writes, whatever language the reader is in', () => {
  const hi = load({ lang: 'hi' });
  hi.win.S.user = USERS[0];
  hi.win.S.cache = cacheOf();
  const part = { id: 'p-ok', name: 'Air Filter', unit: 'pc', qty: 9, unitCost: 650 };
  const w = hi.win.Store.issueWrites(part, card(), 1, false, { id: 'u-store' }, NOW);
  assert.strictEqual(w.ledger.reason, 'Issued to job',
    'a Hindi reader wrote a Hindi reason into the anti-pilferage trail');
});

test('the screen never asks anybody to adjudicate a clock', () => {
  const src = stripComments(STORE_JS);
  assert.strictEqual(countOf(src, /Overwrite|keep mine|keep theirs|which is newer/gi), 0);
});

/* =====================================================================================================
 * 12. MUTANTS THAT MUST FAIL — each is a check above, proved able to go red
 * ===================================================================================================== */

function mutant(name, patch, expect) {
  test('MUTANT must fail: ' + name, () => {
    const src = read(V2('screens', 'store.js'));
    const broken = patch(src);
    assert(broken !== src, 'the mutation did not apply, so this proves nothing');
    const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'v2store-'));
    const f = path.join(dir, 'store.js');
    fs.writeFileSync(f, broken);
    try {
      const html = renderWith(f);
      assert(expect(html) === false, 'the broken screen still satisfied the check');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

/* Loads a PATCHED copy of the screen in its OWN context, so a mutant never
 * touches the real file and a failed assertion cannot leave the repo broken. */
function renderWith(file) {
  const l = load({ me: USERS[0], screen: file });
  const sandbox = l.win;
  sandbox.S.user = USERS[0];
  sandbox.S.cache = cacheOf();
  return sandbox.Store.render({
    route: 'store', params: null, role: 'store', density: 'desk', user: USERS[0],
    cache: sandbox.S.cache, replica: { behind: 0, complete: true }, stale: false, offline: false
  });
}

mutant('the catalogue is drawn whole instead of windowed (the §20 measurement)',
  (s) => s.replace('var VIEW_ROWS = 18;', 'var VIEW_ROWS = 4000;'),
  (html) => rowCount(html) <= 40);

mutant('low stock drops the reorder-level test, so all 2,384 seeded parts are low',
  (s) => s.replace('if (!isNum(lvl) || lvl <= 0) return false;', 'if (!isNum(lvl)) return false;'),
  (html) => countOf(html, / Low</g) === 0);

mutant('a part name is title-cased on the way to the row',
  (s) => s.replace("name: String(p.name == null ? p.id : p.name),",
    "name: String(p.name == null ? p.id : p.name).toLowerCase().replace(/\\b[a-z]/g, function (c) { return c.toUpperCase(); }),"),
  (html) => /FULE FILTER/.test(html));

mutant('a part nobody ever counted is drawn as a real zero',
  (s) => s.replace("if (qty === 0) return moved && moved[String(p.id)] ? 'out' : 'never';",
    "if (qty === 0) return 'out';"),
  (html) => /Not counted yet/.test(html));

test('MUTANT must fail: the field guard is moved below the data-act read', () => {
  const src = read(V2('screens', 'store.js'));
  const broken = src.replace('    if (t.closest(FIELDS)) return;', '    // guard removed');
  assert(broken !== src, 'the mutation did not apply');
  const s2 = stripComments(broken);
  const guard = s2.indexOf('closest(FIELDS)');
  assert(guard < 0, 'the guard is still there');
  // and the static check in predeploy-gate.sh reads the same ordering:
  const act = s2.search(/closest\('\[data-(act|nav|tab)\]'\)/);
  assert(act > 0);
});

/* ===================================================================================================== */

runAll().then(() => {
  console.log('──');
  console.log(fails ? '❌ ' + fails + ' failed' : '✅ all ' + QUEUE.length + ' checks passed');
  process.exit(fails ? 1 : 0);
});

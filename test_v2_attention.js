/* Tests for Attention (#2) — v2/screens/attention.js and v2/ui/attention.css.
 * Run: node test_v2_attention.js
 *
 * At the repo ROOT and not in v2/, because scripts/run-tests.py discovers
 * test_*.js at the root only and does not recurse. A test in v2/ would never
 * run, and a test nobody runs is not a test.
 *
 * Node, no browser, in the shape of test_v2_shell.js and test_v2_ui.js: the
 * real v2/ui/icons.js, v2/ui/words.js, v2/ui/states.js, v2/fmt.js, v2/caps.js,
 * v2/router.js, v2/cache.js, v2/night.js, v2/shell.js and
 * v2/screens/attention.js are loaded in a vm context holding a stub window, a
 * small fake DOM and a fake IndexedDB, and the assertions are on the markup
 * STRING the screen returns. attention.css is read as TEXT with the brace-depth
 * reader from test_v2_ui.js, and every detector is fed input it MUST reject
 * before it is turned on the real file.
 *
 * STAGE 1 CALLS THIS THE SCREEN MOST LIKELY TO BE BUILT WRONG, and names the
 * two ways. Both have checks here, and each check has a mutation beside it:
 *
 * 1. IT BECOMES `dashboard` REBUILT. One capability over pilferage, money,
 *    safety and alert rows is the conflation the owner flagged. So §3.2's TEN
 *    paths are checked one at a time, and the check that matters is not "a row
 *    is absent" — it is that the kind's STORE IS NEVER READ. A `drivers` array
 *    that throws when it is touched is handed to the index for a reader without
 *    `manageDrivers`: if the capability were checked after the query, or in the
 *    view, the build would throw. That is the whole difference between "before"
 *    and "after" made falsifiable.
 *
 * 2. IT REINTRODUCES THE MEASURED PERFORMANCE BUG. `gpsEventsForBus()` walked
 *    the whole GPS table per call and `driverScore()` called it once per driver
 *    — 4.4 million string rewrites to draw one list, 808 ms, paid on every
 *    render (`5195ce7`); `computeInsights()` was 386 ms per render. So the real
 *    v2/cache.js is loaded with a fake DB, and `Cache.reads()` — the counter
 *    that file exposes for exactly this — is asserted not to move across two
 *    draws with no sync between them.
 *
 * THE THIRD CHECK THE SPEC OWES THIS SCREEN is not here and cannot be: §3.4's
 * 200-row reading is a browser measurement in `#perf-bed`, and
 * scripts/predeploy-gate.sh is owned by no slice. The patch goes to the lead in
 * this slice's report, as the cut's §1 requires. What IS here is the half a
 * node suite can hold: 200 rows is one string and one insert, no row carries a
 * `.figure-note`, and nothing measures a row.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const read = (p) => fs.readFileSync(p, 'utf8');
const V2 = (...p) => path.join(ROOT, 'v2', ...p);

let fails = 0;
function test(name, fn) {
  try { fn(); console.log('  ok  ' + name); }
  catch (e) { console.log(' FAIL ' + name + '\n        ' + String(e.message).split('\n').join('\n        ')); fails++; }
}

const CSS = read(V2('ui', 'attention.css'));
const JS = read(V2('screens', 'attention.js'));
const COMP_CSS = read(V2('ui', 'components.css'));
const SCREENS_CSS = read(V2('ui', 'screens.css'));

/* =====================================================================================================
 * A SMALL CSS READER (the brace-depth reader from test_v2_ui.js / test_v2_shell.js)
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
      const decls = {}, list = [];
      for (const d of body.split(';')) {
        const k = d.indexOf(':');
        if (k > 0 && !d.slice(0, k).includes('{')) {
          const p = d.slice(0, k).trim(), v = d.slice(k + 1).trim();
          decls[p] = v; list.push([p, v]);
        }
      }
      rules.push({ ctx: ctx, selector: prelude, decls: decls, list: list, nested: body.includes('{') });
    }
    i = j;
  }
  return rules;
}
const rulesOf = (css) => parseRules(stripComments(css));
const declsOf = (css) => rulesOf(css).reduce((a, r) => a.concat(r.list.map(([p, v]) => ({ sel: r.selector, ctx: r.ctx, prop: p, val: v }))), []);
const selectorsOf = (css) => rulesOf(css).reduce((a, r) => a.concat(r.selector.split(',').map((s) => s.trim())), []);

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

test('the magic-px detector rejects a literal size, padding and type and allows a border, outline and shadow', () => {
  for (const bad of ['height:72px', 'max-width:900px', 'padding:0 16px', 'gap:8px', 'font-size:15px'])
    assert(magicPx('.a{' + bad + '}').length > 0, 'detector missed: ' + bad);
  for (const fine of ['padding:0 var(--pad)', 'gap:var(--s2)', 'border-top:2px solid var(--line)',
    'outline-offset:-2px', 'box-shadow:inset 0 -1px 0 var(--line)'])
    assert.deepEqual(magicPx('.a{' + fine + '}'), [], 'false positive: ' + fine);
});

test('the literal-colour detector rejects a hex, an hsl and a color-mix and allows a token', () => {
  for (const bad of ['color:#fff', 'background:hsl(30 20% 9%)', 'color:rgba(0,0,0,.5)'])
    assert(literalColour('.a{' + bad + '}').length > 0, 'detector missed: ' + bad);
  assert.deepEqual(literalColour('.a{color:var(--bad);background:var(--surface-raised)}'), []);
});

/* =====================================================================================================
 * 1. attention.css — no colour, no size, no position, and two deliberate absences
 * ===================================================================================================== */

test('attention.css has declarations to check at all: an empty file would pass every rule below vacuously', () => {
  assert(declsOf(CSS).length >= 20, 'only ' + declsOf(CSS).length + ' declarations');
});

test('attention.css sizes everything from the tokens: no px literal outside border, outline and box-shadow', () => {
  assert.deepEqual(magicPx(CSS), []);
});

test('attention.css declares no colour of its own — every colour is a token reference', () => {
  assert.deepEqual(literalColour(CSS), []);
});

test('every selector in attention.css starts with [data-v2], so the file is inert in the live app', () => {
  assert.deepEqual(selectorsOf(CSS).filter((s) => s.indexOf('[data-v2]') !== 0), []);
});

test('attention.css is inside the Chrome 109 floor: no nesting, no oklch, no color-mix, no subgrid, no @starting-style', () => {
  const src = stripComments(CSS);
  for (const [why, re] of [['oklch/oklab', /\bokl(ch|ab)\s*\(/], ['color-mix', /\bcolor-mix\s*\(/],
    ['@starting-style', /@starting-style/], ['subgrid', /grid-template-(rows|columns)\s*:\s*subgrid/],
    ['text-wrap: balance', /text-wrap\s*:\s*(balance|pretty)/], ['nesting', /^\s*&[\s.:>+~[{]/m],
    ['@scope', /@scope[\s{]/], ['light-dark()', /\blight-dark\s*\(/]])
    assert(!re.test(src), why + ' is past the floor and is in attention.css');
  assert.deepEqual(rulesOf(CSS).filter((r) => r.nested).map((r) => r.selector), [], 'a nested rule');
});

/* §3.5 keeps the filter strip in the BODY at both densities, so it scrolls away
 * with the list. The nav's one `position: fixed` is the app's only fixed layer,
 * and a sticky strip over a 200-row list is the second one. */
test('attention.css declares no position at all: the strip is in the body and nothing here is a fixed layer', () => {
  const bad = declsOf(CSS).filter((d) => d.prop === 'position');
  assert.deepEqual(bad.map((d) => d.sel + ' { position: ' + d.val + ' }'), []);
});

/* THE FIRST DELIBERATE ABSENCE. §3.5: "the same single column, not capped to
 * 900px (it wants the 864px the rail leaves)". Every other reading screen caps
 * its measure with --read-w; this one must not, because narrowing the column
 * turns a two-line reason into three on the one list that may not be windowed.
 * MUTATION: add `max-width: var(--read-w)` to .att-list. */
test('attention.css caps no measure: no max-width and no --read-w, because the reason is the content', () => {
  const caps = declsOf(CSS).filter((d) => /^(max-width|width)$/.test(d.prop));
  assert.deepEqual(caps.map((d) => d.sel + ' { ' + d.prop + ': ' + d.val + ' }'), []);
  assert(!/--read-w/.test(stripComments(CSS)), '--read-w is the 900px cap this screen must not take');
});

/* THE SECOND. `v2row-why` GROWS: its reason wraps to two lines, about 72px in
 * the yard and nearer 88px in Hindi, which is why foundation §2.4 forbids
 * windowing it and why the 200-row cap is the mechanism instead. A height here
 * would make the reason truncate, and a truncated reason is a colour and a
 * number — `dashboard` again, the screen this one replaces.
 * MUTATION: add `height: var(--row-h)` to .att-list. */
test('attention.css fixes no height anywhere: the row grows with its reason', () => {
  const h = declsOf(CSS).filter((d) => /^(height|min-height|max-height)$/.test(d.prop));
  assert.deepEqual(h.map((d) => d.sel + ' { ' + d.prop + ': ' + d.val + ' }'), []);
});

test('attention.css adds no animation of its own: the press feedback is components.css\'s', () => {
  const tr = declsOf(CSS).filter((d) => /^(transition|animation)/.test(d.prop));
  assert.deepEqual(tr.map((d) => d.prop + ': ' + d.val), []);
});

/* =====================================================================================================
 * 2. THE SCREEN, loaded in a stub window with a fake DOM and a fake database
 * ===================================================================================================== */

function el(tag) {
  const e = {
    tag: tag, html: '', inserts: 0, attrs: {}, classes: {}, find: null, value: '',
    setAttribute: function (k, v) { e.attrs[k] = String(v); },
    getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(e.attrs, k) ? e.attrs[k] : null; },
    removeAttribute: function (k) { delete e.attrs[k]; },
    hasAttribute: function (k) { return Object.prototype.hasOwnProperty.call(e.attrs, k); },
    insertAdjacentHTML: function (pos, h) { e.inserts++; e.html += String(h); },
    addEventListener: function () {},
    querySelector: function (sel) { return e.find ? e.find(sel) : null; },
    querySelectorAll: function () { return []; },
    classList: {
      add: function (c) { e.classes[c] = true; },
      remove: function (c) { delete e.classes[c]; },
      contains: function (c) { return !!e.classes[c]; }
    }
  };
  Object.defineProperty(e, 'innerHTML', { get: function () { return e.html; }, set: function (v) { e.html = String(v); } });
  return e;
}

const SRC = ['ui/icons.js', 'ui/words.js', 'ui/states.js', 'ui/nav.js', 'fmt.js',
             'caps.js', 'router.js', 'night.js', 'cache.js', 'shell.js', 'screens/attention.js'];

/* The fake database. `Cache.load` is the ONLY path to a store read in this app,
 * and the real v2/cache.js is loaded above it, so `Cache.reads()` below is the
 * genuine counter and not a stand-in. `all()` records every store it is asked
 * for, which is how "an unheld kind's store is never fetched" is checked one
 * layer below the index. */
function fakeDb(data, asked) {
  const dirty = new Set(Object.keys(data));
  return {
    all: function (name) { asked.push(name); return Promise.resolve((data[name] || []).slice()); },
    get: function () { return Promise.resolve(null); },
    dirtySnapshot: function () { return dirty; },
    clearDirty: function (done) { done.forEach(function (n) { dirty.delete(n); }); },
    pruneBefore: function () { return Promise.resolve(0); },
  };
}

/* load(o) -> {win, app, screen, logs, clicks, asked, sheets, toasts}
 *   o.role      the signed-in role
 *   o.id        the signed-in person's id (default 'u1')
 *   o.data      {store: [row]} for the fake database
 *   o.density   'yard' | 'desk'
 *   o.lang      'en' | 'hi'
 *   o.offline   force the offline signal
 */
function load(o) {
  o = o || {};
  const app = el('div'), screen = el('main'), trail = el('span'), off = el('button'), html = el('html');
  const field = el('input');
  app.find = (sel) => (sel === '.apphead-trail' && /apphead-trail/.test(app.html) ? trail : null);
  trail.find = (sel) => (sel === '.apphead-off' && /apphead-off/.test(trail.html) ? off : null);
  html.lang = o.lang || 'en';
  html.setAttribute('data-v2', '');
  html.setAttribute('data-density', o.density || 'yard');

  const logs = { warn: [], error: [], info: [] };
  const clicks = [];
  const sheets = [];
  const toasts = [];
  const asked = [];
  const sandbox = {
    navigator: { onLine: o.offline === true ? false : true, userAgent: 'node', language: 'en' },
    location: { href: 'http://localhost/v2/', pathname: '/v2/' },
    document: {
      documentElement: html,
      title: '',
      addEventListener: function (type, fn) { if (type === 'click') clicks.push(fn); },
      getElementById: function (id) {
        if (id === 'app') return app;
        if (id === 'screen') return /id="screen"/.test(app.html) ? screen : null;
        if (id === 'att-q') return field;
        return null;
      },
      removeEventListener: function () {},
      querySelector: function () { return null; }, querySelectorAll: function () { return []; },
      createElement: function () { return el('div'); }, head: { appendChild: function () {} }, body: null,
    },
    getComputedStyle: function () { return { opacity: '0' }; },
    addEventListener: function () {}, removeEventListener: function () {},
    setTimeout: setTimeout, clearTimeout: clearTimeout,
    console: {
      warn: function (m) { logs.warn.push(String(m)); },
      error: function (m) { logs.error.push(String(m)); },
      info: function (m) { logs.info.push(String(m)); },
      log: function () {}
    },
    S: { user: o.role ? { id: o.id || 'u1', role: o.role, name: 'A' } : null, route: null, stack: [], cache: {} },
    Boot: {
      density: function () { return o.density || 'yard'; },
      replica: function () { return { behind: 0, complete: true }; }
    },
    Sync: {
      info: function () { return { pending: 0, lastError: '', status: 'synced', lastSyncAt: 1 }; },
      ai: function () { return Promise.resolve({ text: 'x' }); }
    },
    V2: {
      openSheet: function (title, body) { sheets.push({ title: title, body: body }); return { dialog: true }; },
      toast: function (t) { toasts.push(String(t)); }
    }
  };
  sandbox.window = sandbox;
  sandbox.DB = fakeDb(o.data || {}, asked);
  const ctx = vm.createContext(sandbox);
  for (const f of SRC) vm.runInContext(read(V2(f)), ctx, { filename: V2(f) });
  // Each source is loaded once per context, so the module-level state inside
  // attention.js is fresh here; _reset is belt and braces for a case that
  // re-enters it.
  sandbox.Attention._reset();
  return { win: sandbox, app: app, screen: screen, field: field,
           logs: logs, clicks: clicks, sheets: sheets, toasts: toasts, asked: asked };
}

/* A click through the screen's own delegated listener. `closest(sel)` is what
 * the handler reads, so the target answers exactly the selectors a real element
 * would — a target that answered everything would make every branch look alive,
 * and the ONE line this screen must have is a selector test that comes first. */
function target(matches) {
  return {
    closest: function (sel) {
      for (const m of Object.keys(matches)) {
        if (sel === m || sel.split(',').map((s) => s.trim()).indexOf(m) >= 0) return matches[m];
      }
      return null;
    }
  };
}

function clickWith(l, matches) {
  let prevented = false;
  // The screen's listener is the FIRST installed: it goes on at load, before
  // the frame installs its own on the first mount.
  l.clicks[0]({ target: target(matches), preventDefault: function () { prevented = true; } });
  return prevented;
}

const NOW = Date.UTC(2026, 10, 5, 12, 0, 0);
const DAY = 86400000, HOUR = 3600000;

/* ---- one seeded device holding at least one row of every one of the nine
 * kinds, so "this reader sees that kind and not this one" is a statement about
 * the capability and never about missing data ---- */
function seed() {
  const today = new Date(NOW + 19800000).toISOString().slice(0, 10);
  return {
    buses: [
      { id: 'b1', regNo: 'RJ14 PA 1023', docs: [{ type: 'Fitness', expiry: NOW - 6 * DAY },
                                                { type: 'Permit', expiry: NOW + 9 * DAY },
                                                // No expiry recorded: NOT a row. 110-of-110 (5eb8c6e).
                                                { type: 'PUC' }] },
      { id: 'b2', regNo: 'RJ14 PB 4567', docs: [{ type: 'Insurance', expiry: NOW + 200 * DAY }] },
      { id: 'b3', regNo: 'RJ14 PC 8899', docs: [] },
    ],
    drivers: [
      { id: 'd1', name: 'Ramesh', busId: 'b1', docs: { license: { number: 'RJ-DL-1', expiry: NOW + 11 * DAY },
                                                       aadhaar: { number: '9999' } } },
      { id: 'd2', name: 'Shyam', busId: 'b2', docs: {} },
    ],
    users: [{ id: 'u-store', name: 'Suresh', role: 'store' }, { id: 'u1', name: 'Mohan', role: 'owner' }],
    // kind 1: one awaiting check somebody ELSE ran, one this reader ran.
    gatechecks: [
      { id: 'g1', busId: 'b1', userId: 'u-other', status: 'awaiting', startedAt: NOW - 4 * HOUR,
        sentAt: NOW - 4 * HOUR, items: { safety: { ok: false, label: 'Brake light' } } },
      { id: 'g2', busId: 'b2', userId: 'u1', status: 'awaiting', startedAt: NOW - 9 * HOUR,
        sentAt: NOW - 9 * HOUR, items: { tyres: { ok: false, label: 'Tyre' } } },
    ],
    // kind 2: one closed by somebody else, one closed by this reader.
    jobcards: [
      { id: 'j1', busId: 'b1', problem: 'clutch', status: 'done', closedBy: 'u-store',
        closedAt: NOW - 2 * DAY, verifiedBy: null },
      { id: 'j2', busId: 'b2', problem: 'brakes', status: 'done', closedBy: 'u1',
        closedAt: NOW - 3 * DAY, verifiedBy: null },
    ],
    challans: [{ rc: 'RJ14PA1023', pendingCount: 2, pendingFine: 3500, fetchedAt: NOW - 3 * DAY,
                 challans: [{ status: 'Pending', date: '2026-08-12', fine: 2000 },
                            { status: 'Pending', date: '2026-09-01', fine: 1500 }] }],
    parts: [{ id: 'p1', name: 'BRAKE PAD SET', unitCost: 1500, qty: 4 }],
    audits: [{ id: 'au1', at: NOW - 2 * DAY, by: 'u-store',
               lines: [{ partId: 'p1', system: 10, counted: 4, variance: -6, value: 9000 }] }],
    stockmoves: [{ id: 'sm1', partId: 'p1', delta: -6, justified: false, at: NOW - 2 * DAY }],
    // kind 6: §3.2's own shape — eleven issues with no card against peers doing
    // one each, plus an issue that IS on a card and so is not one of them.
    ledger: (function () {
      const out = [];
      for (let i = 0; i < 11; i++) {
        out.push({ id: 'l' + i, partId: 'p1', type: 'out', qty: 1, jobId: null,
                   by: 'u-store', at: NOW - (i + 1) * DAY, unitCost: 1500 });
      }
      out.push({ id: 'lp1', partId: 'p1', type: 'out', qty: 1, jobId: null, by: 'u-a', at: NOW - 2 * DAY, unitCost: 1500 });
      out.push({ id: 'lp2', partId: 'p1', type: 'out', qty: 1, jobId: null, by: 'u-b', at: NOW - 2 * DAY, unitCost: 1500 });
      out.push({ id: 'lj', partId: 'p1', type: 'out', qty: 1, jobId: 'j1', by: 'u-store', at: NOW - 1 * DAY, unitCost: 1500 });
      return out;
    })(),
    driverreports: [{ id: 'dr1', busId: 'b3', category: 'brakes', status: 'open', jobId: null, at: NOW - 2 * DAY }],
    breakdowns: [
      { id: 'bd1', busId: 'b3', system: 'electrical', at: NOW - 2 * DAY },
      { id: 'bd2', busId: 'b3', system: 'electrical', at: NOW - 10 * DAY },
      { id: 'bd3', busId: 'b3', system: 'electrical', at: NOW - 20 * DAY },
      { id: 'bd4', busId: 'b3', system: 'electrical', at: NOW - 25 * DAY },
      { id: 'bd5', busId: 'b1', system: 'tyre', at: NOW - 5 * DAY },
    ],
    nightlist: [{ id: 'nl-' + today, date: today, updatedAt: NOW - 3 * HOUR,
                  buses: { b1: { running: true }, b2: { running: true }, b3: { running: false } } }],
    dutylog: [
      { id: 'dl1', crewId: 'd1', crewName: 'Ramesh', role: 'driver', busId: 'b1', at: NOW - 40 * DAY },
      { id: 'dl2', crewId: 'd2', crewName: 'Shyam', role: 'driver', busId: 'b2', at: NOW - 30 * DAY },
    ],
  };
}

const me = (role, id) => ({ id: id || 'u1', role: role });
const idx = (l, role, id, data) => l.win.Attention.index(data || seed(), me(role, id), NOW);
const kinds = (index) => index.rows.concat(index.unranked).map((r) => r.kind).filter((k, i, a) => a.indexOf(k) === i).sort();

/* =====================================================================================================
 * 3. THE TEN CAPABILITY PATHS — nine kinds, and kind 3 is TWO
 * ===================================================================================================== */

test('there are nine row kinds over TEN capability paths, and kind 3\'s two halves share a mark and no store', () => {
  const l = load({ role: 'owner' });
  const K = l.win.Attention.KINDS;
  assert.strictEqual(K.length, 10, 'the spec counts ten paths, not nine: a bus paper is fleet and a crew document is manageDrivers');
  const marks = K.map((k) => k.mark).filter((m, i, a) => a.indexOf(m) === i);
  assert.strictEqual(marks.length, 9, 'ten paths over nine marks: exactly one mark is shared');
  const bus = K.filter((k) => k.key === 'busPaper')[0];
  const crew = K.filter((k) => k.key === 'crewPaper')[0];
  assert.strictEqual(bus.mark, crew.mark, 'the two halves of kind 3 share a mark');
  assert.strictEqual(bus.cap, 'fleet');
  assert.strictEqual(crew.cap, 'manageDrivers');
  // THE rule: they must never share a query.
  assert.deepEqual(bus.stores.filter((s) => crew.stores.indexOf(s) >= 0), [],
    'the two halves of kind 3 share a store, which is how a licence reaches a role that may only see buses');
});

test('every capability a row kind declares is a real one in Caps.PERMS — none is invented here', () => {
  const l = load({ role: 'owner' });
  const bad = l.win.Attention.KINDS.filter((k) => !l.win.Caps.PERMS[k.cap]).map((k) => k.key + ' -> ' + k.cap);
  assert.deepEqual(bad, []);
});

test('the screen itself declares viewAttention and nothing else, and its rows are what carry the rest', () => {
  const l = load({ role: 'owner' });
  assert.deepEqual(l.win.Caps.SCREENS.attention.declares, ['viewAttention']);
  for (const role of ['mechanic', 'store', 'crewmanager', 'office', 'driver', 'conductor'])
    assert.strictEqual(l.win.Caps.holds(role, 'attention'), false, role + ' can reach Attention');
  for (const role of ['owner', 'supervisor'])
    assert.strictEqual(l.win.Caps.holds(role, 'attention'), true);
});

/* THE CHECK THIS FILE EXISTS FOR, and the reason it is not "a row is absent".
 *
 * A reader without `manageDrivers` is handed a rows bag whose `drivers` key
 * THROWS when it is touched. If the capability were checked after the query, or
 * in the view, this build would throw instead of returning. So it proves
 * "before", which no assertion about the output can.
 * MUTATION: move the `holds(k, me)` test in index() to after k.build(). */
test('a kind the reader does not hold is never READ: the capability is checked BEFORE the query, not after', () => {
  const l = load({ role: 'crewmanager' });
  const data = seed();
  const bag = {};
  for (const k of Object.keys(data)) bag[k] = data[k];
  // Every store that belongs to a kind a crew manager does not hold.
  const forbidden = ['gatechecks', 'jobcards', 'challans', 'parts', 'audits', 'stockmoves',
                     'ledger', 'driverreports', 'breakdowns', 'users'];
  for (const name of forbidden) {
    Object.defineProperty(bag, name, {
      get: function () { throw new Error('the index read ' + name + ' for a reader who does not hold its kind'); },
      enumerable: true, configurable: true,
    });
  }
  const got = l.win.Attention.index(bag, me('crewmanager'), NOW);
  // A crew manager holds manageDrivers and assignDriver: kind 3b and kind 9.
  assert.deepEqual(kinds(got), ['crewPaper', 'seat']);
  assert.deepEqual(got.stores, ['buses', 'drivers', 'dutylog', 'nightlist']);
});

/* The same rule one layer down. `Attention.stores(me)` is what Cache.load is
 * given, so a store nobody asked for never reaches IndexedDB either — and the
 * fake DB records every name it was asked for.
 * MUTATION: have stores() return the union over ALL kinds. */
test('Attention.stores(me) is the union over HELD kinds only, so an unheld kind\'s store is never fetched', () => {
  const l = load({ role: 'crewmanager' });
  const St = l.win.Attention.stores;
  assert.deepEqual(St(me('crewmanager')), ['buses', 'drivers', 'dutylog', 'nightlist']);
  // A storekeeper holds exactly ONE of the ten: issuePart, which is kind 5.
  assert.deepEqual(St(me('store')), ['audits', 'parts', 'stockmoves']);
  assert.strictEqual(St(me('store')).indexOf('drivers'), -1, 'a storekeeper would be fetching crew documents');
  // A mechanic, an office login, a driver and a conductor hold none of the ten.
  for (const role of ['mechanic', 'office', 'driver', 'conductor'])
    assert.deepEqual(St(me(role)), [], role + ' asks for a store');
  assert.deepEqual(St(null), [], 'a signed-out device asks for a store');
  // Owner and supervisor hold all ten, which §3.7 says makes the "no row kinds"
  // state unreachable for the two roles who have this screen.
  for (const role of ['owner', 'supervisor']) {
    assert.deepEqual(St(me(role)), ['audits', 'breakdowns', 'buses', 'challans', 'driverreports',
                                    'drivers', 'dutylog', 'gatechecks', 'jobcards', 'ledger',
                                    'nightlist', 'parts', 'stockmoves', 'users']);
  }
});

/* Not a defensive check: it is the mechanism. A kind that could read any store
 * would be a kind whose declaration was a comment. */
test('a kind that reads a store it did not declare THROWS — the declaration is enforced, not documented', () => {
  const l = load({ role: 'owner' });
  const K = l.win.Attention.KINDS;
  const crew = K.filter((k) => k.key === 'crewPaper')[0];
  const was = crew.stores;
  crew.stores = ['buses'];                      // now it may not read `drivers`
  try {
    assert.throws(function () { l.win.Attention.index(seed(), me('owner'), NOW); },
                  /undeclared store: drivers/);
  } finally { crew.stores = was; }
});

test('a reader holding none of the ten paths reads NO store and gets the state the screen exists to reach', () => {
  const l = load({ role: 'mechanic' });
  const got = idx(l, 'mechanic');
  assert.deepEqual(got.rows, []);
  assert.deepEqual(got.unranked, []);
  assert.deepEqual(got.stores, [], 'a store was read for a reader with no row kinds');
  assert.deepEqual(got.counts, { all: 0, safety: 0, money: 0, papers: 0, waiting: 0 });
  const html = l.win.Attention.render(got, 'all');
  assert(/class="state empty"/.test(html), 'the empty state is not drawn: ' + html.slice(0, 200));
  assert(html.indexOf('Nothing needs you') > 0, 'the empty state does not say so');
});

/* §3.6: "A count that includes a row the reader cannot see is a leak with no
 * row attached, and it is the subtlest one on this screen." And the remainder
 * line counts only rows this person holds.
 * MUTATION: compute `counts` over the full index rather than the held rows. */
test('a kind the reader lacks contributes nothing to any filter count and nothing to the remainder line', () => {
  const l = load({ role: 'owner' });
  const all = idx(l, 'owner');
  const some = idx(l, 'crewmanager');
  assert(all.counts.all > some.counts.all, 'the owner must see more than a crew manager on the same device');
  // A crew manager's rows are kinds 3b (band 3) and 9 (band 4) and nothing else.
  assert.strictEqual(some.counts.safety, 0, 'a crew manager has no safety rows and a count said so');
  assert.strictEqual(some.counts.money, 0, 'a crew manager has no money rows and a count said so');
  assert.strictEqual(some.counts.papers + some.counts.waiting, some.counts.all);
  // Every count is the real number of held rows in that band, summed back.
  const bands = { safety: 1, money: 2, papers: 3, waiting: 4 };
  for (const f of Object.keys(bands)) {
    const n = all.rows.filter((r) => r.band === bands[f]).length;
    assert.strictEqual(all.counts[f], n, f + ' count disagrees with the rows in its band');
  }
  assert.strictEqual(all.counts.all, all.rows.length);
});

/* =====================================================================================================
 * 4. IDENTITY — the two kinds that need more than a capability
 * ===================================================================================================== */

test('exactly two row kinds carry an identity rule, and they are the gate decision and the second signature', () => {
  const l = load({ role: 'owner' });
  const withId = l.win.Attention.KINDS.filter((k) => k.identity).map((k) => k.key + ':' + k.identity).sort();
  assert.deepEqual(withId, ['gateDecide:userId', 'verifyJob:closedBy']);
});

/* Kind 2, FOR EVERY ROLE INCLUDING THE OWNER. The live app has this filter at
 * app.js:3019 and skips it for supervisors; v2 applies it to everybody, and the
 * server refuses the write either way ("you closed this job — someone else must
 * verify it"). A row drawn here for your own close is a row whose only action
 * is refused.
 * MUTATION: drop the `j.closedBy === me.id` test in verifyRows. */
for (const role of ['owner', 'supervisor']) {
  test('kind 2 excludes a card this ' + role + ' closed themselves — the owner is not an exception', () => {
    const l = load({ role: role });
    // 'u1' closed j2; 'u-store' closed j1.
    const mine = idx(l, role, 'u1').rows.filter((r) => r.kind === 'verifyJob').map((r) => r.id);
    assert.deepEqual(mine, ['verifyJob:j1'], 'the reader\'s own closed card is in the queue');
    // The same device, read by the person who closed the OTHER card: the
    // mirror image, so this cannot pass by the row simply never being built.
    const theirs = idx(l, role, 'u-store').rows.filter((r) => r.kind === 'verifyJob').map((r) => r.id);
    assert.deepEqual(theirs, ['verifyJob:j2']);
  });
}

/* Kind 1, and it landed with the server's own rule: "you ran this check —
 * somebody else decides go or hold". Without it a supervisor who ran twenty
 * rounds sees twenty rows whose only action is refused (§6.2).
 * MUTATION: drop the `g.userId === me.id` test in gateRows. */
test('kind 1 excludes a check this reader ran themselves — a supervisor may not decide their own round', () => {
  const l = load({ role: 'supervisor' });
  const mine = idx(l, 'supervisor', 'u1').rows.filter((r) => r.kind === 'gateDecide').map((r) => r.id);
  assert.deepEqual(mine, ['gateDecide:g1'], 'the reader\'s own check is in the decision queue');
  const theirs = idx(l, 'supervisor', 'u-other').rows.filter((r) => r.kind === 'gateDecide').map((r) => r.id);
  assert.deepEqual(theirs, ['gateDecide:g2']);
});

test('an identity-excluded row leaves no trace: not in the count, not in the remainder, not in the markup', () => {
  const l = load({ role: 'owner' });
  const got = idx(l, 'owner', 'u1');
  const html = l.win.Attention.render(got, 'all');
  for (const gone of ['gateDecide:g2', 'verifyJob:j2'])
    assert.strictEqual(html.indexOf(gone), -1, gone + ' is drawn for the person whose work it is');
  assert.strictEqual(got.rows.filter((r) => r.id === 'gateDecide:g2').length, 0);
  assert.strictEqual(got.counts.safety, got.rows.filter((r) => r.band === 1).length);
});

/* =====================================================================================================
 * 5. THE MEASURED PERFORMANCE BUG — the three rules that stop it coming back
 * ===================================================================================================== */

/* §3.4's first check, with the REAL v2/cache.js and its real counter: build the
 * index, draw, redraw with no sync in between, and assert the store-read
 * counter did not move. `computeInsights()` at 386 ms per render is this rule
 * broken, and `gpsEventsForBus()` at 808 ms is it broken one level worse.
 * MUTATION: call Cache.load (or DB.all) from render(). */
/* The module's one load is kicked from mount(), which runs at load; this drains
 * it so the counter below is counting draws and not that. */
function flush() {
  let p = Promise.resolve();
  for (let i = 0; i < 8; i++) p = p.then(() => new Promise((r) => setTimeout(r, 0)));
  return p;
}

async function readsCheck() {
  const l = load({ role: 'owner', data: seed() });
  const C = l.win.Cache;
  const want = l.win.Attention.stores(me('owner'));
  await flush();
  // ONE getAll per store per build, not per row and not per render. The fake DB
  // records every name it was asked for, so this counts the calls themselves.
  assert.deepEqual(l.asked.slice().sort(), want.slice().sort(),
    'the stores read are not the stores the held kinds declare');
  const counted = {};
  l.asked.forEach(function (n) { counted[n] = (counted[n] || 0) + 1; });
  assert.deepEqual(Object.keys(counted).filter((n) => counted[n] !== 1), [],
    'a store was read more than once in one build');
  // Nothing is dirty now, so asking again reads nothing: the skip is v2/db.js's
  // per-store dirty mark, which is the only honest trigger for a re-read.
  const settled = C.reads();
  await C.load(want);
  assert.strictEqual(C.reads(), settled, 'a load re-read a store that cannot have changed');
  // Draw, then redraw TWICE with NO sync between.
  l.win.Shell.mount('attention');
  assert(/v2row-why/.test(l.screen.html), 'nothing was drawn, so the counter check means nothing');
  const afterFirst = C.reads();
  l.win.Shell.mount('attention');
  l.win.Shell.mount('attention');
  /* Flushed BEFORE the assertion: a load kicked from a draw function would
   * increment this counter a few microtasks later, so reading it synchronously
   * would let exactly the bug this check exists for go green. */
  await flush();
  assert.strictEqual(C.reads(), afterFirst,
    'a redraw read a store: ' + (C.reads() - afterFirst) + ' extra getAll()s per draw');
  assert.strictEqual(afterFirst, want.length, 'the device has done ' + afterFirst + ' reads for ' + want.length + ' stores');
}

/* The index is a memo keyed on the content signature, so a redraw with the same
 * data does not rebuild it, and a WRITE does. `Cache.sig` is one pass over an
 * array it already holds and is keyed on the array's identity.
 * MUTATION: drop the sig test in cachedIndex(). */
async function memoCheck() {
  const l = load({ role: 'owner', data: seed() });
  await flush();
  l.win.Shell.mount('attention');
  const first = l.screen.html;
  l.screen.html = ''; l.screen.inserts = 0;
  l.win.Shell.mount('attention');
  assert.strictEqual(l.screen.html.replace(/Updated [^<]*/g, ''), first.replace(/Updated [^<]*/g, ''),
    'two draws of the same data differ, so the index is being rebuilt or the sort is unstable');
}

/* §3.4: the 200 rows are ONE string and ONE insertAdjacentHTML. Per-row
 * appendChild is the shape that cost 277 ms per page, and 200 rows is exactly
 * where it is paid.
 * MUTATION: build the list with one insert per row. */
function bigDevice(n) {
  const data = seed();
  data.buses = [];
  for (let i = 0; i < n; i++) {
    data.buses.push({ id: 'b' + i, regNo: 'RJ14 XX ' + (1000 + i),
                      docs: [{ type: 'Fitness', expiry: NOW - (i % 25) * DAY }] });
  }
  data.gatechecks = []; data.jobcards = []; data.challans = []; data.audits = [];
  data.stockmoves = []; data.ledger = []; data.driverreports = []; data.breakdowns = [];
  data.nightlist = []; data.dutylog = []; data.drivers = [];
  return data;
}

/* §3.4's first rule, by identity rather than by markup: a rebuilt index draws
 * exactly the same list, so the only honest handle on "built ONCE per content
 * signature, never from a draw function" is whether the object is the same one.
 * `computeInsights()` at 386 ms per render is this rule broken, and it drew the
 * right numbers the whole time it was broken.
 * MUTATION: drop the sig test in cachedIndex(), or rebuild from draw(). */
async function buildOnceCheck() {
  const l = load({ role: 'owner', data: seed() });
  await flush();
  l.win.Shell.mount('attention');
  const first = l.win.Attention._index();
  assert(first && first.rows.length, 'no index was built, so this check means nothing');
  l.win.Shell.mount('attention');
  l.win.Shell.mount('attention');
  assert.strictEqual(l.win.Attention._index(), first,
    'the index was rebuilt on a redraw with no sync between: that is the measured bug');
  /* …and it IS rebuilt when the content signature moves. A memo that never
   * invalidates is a screen that stops showing what happened. */
  l.win.S.cache.jobcards = l.win.S.cache.jobcards.concat([
    { id: 'j7', busId: 'b1', problem: 'wiring', status: 'done', closedBy: 'u-store',
      closedAt: NOW - 1 * DAY, verifiedBy: null }]);
  l.win.Shell.mount('attention');
  const second = l.win.Attention._index();
  assert.notStrictEqual(second, first, 'the index did not rebuild after a store changed');
  assert.strictEqual(second.rows.length, first.rows.length + 1, 'the new card did not reach the list');
}

async function capCheck() {
  const data = bigDevice(246);
  const l = load({ role: 'owner', data: data });
  await flush();
  l.screen.html = ''; l.screen.inserts = 0;
  l.win.Shell.mount('attention');
  const rows = l.screen.html.split('class="v2row v2row-why').length - 1;
  assert.strictEqual(rows, 200, 'the list drew ' + rows + ' rows: the cap is 200, never windowed, never longer');
  assert.strictEqual(l.screen.inserts, 1, 'the body is ' + l.screen.inserts + ' inserts, not one string and one insert');
  // A capped list with a STATED remainder is not a count that cannot reach
  // zero: it says what is not shown and what to do about it. Three clauses.
  assert(/200 shown\. 46 more\. Use the filters above\./.test(l.screen.html),
    'the remainder line is missing or does not state all three clauses');
  assert.strictEqual(/aria-label="[^"]*page/i.test(l.screen.html), false, 'a page control appeared');
}

/* §3.4's third check, and the rule a well-meaning builder breaks first: the
 * screen states its freshness ONCE, in its header. `at` inside a row adds
 * .figure-note as a BLOCK element, triples the row height and runs the age
 * words two hundred times (foundation §2.3 rule 4).
 * MUTATION: pass {at: ...} to any figure() inside a row. */
async function figureNoteCheck(density) {
  const l = load({ role: 'owner', density: density, data: seed() });
  await flush();
  l.win.Shell.mount('attention');
  const html = l.screen.html;
  assert(/v2row-why/.test(html), 'no rows at ' + density + ', so this check means nothing');
  // Every .v2row in the body, read as its own slice, must hold no figure-note.
  const parts = html.split('class="v2row');
  for (let i = 1; i < parts.length; i++) {
    const row = parts[i].split('</a>')[0];
    assert.strictEqual(row.indexOf('figure-note'), -1,
      'a .figure-note is inside a row at ' + density + ': the list says its age once, in the header');
  }
  // And it is said once, in the header, rather than not at all.
  assert(/class="att-fresh"/.test(html), 'the one freshness line is missing');
  assert.strictEqual(html.split('class="att-fresh"').length - 1, 1, 'the freshness line is drawn more than once');
}

test('nothing in the screen measures a row: no offsetHeight, getBoundingClientRect or getComputedStyle', () => {
  const src = stripComments(JS);
  for (const re of [/\boffsetHeight\b/, /\boffsetWidth\b/, /getBoundingClientRect/, /getComputedStyle/,
                    /\bclientHeight\b/, /\bscrollHeight\b/])
    assert(!re.test(src), 'the screen measures something: ' + re);
});

test('the screen never reads a store itself: no DB.all, no getAll, and Cache.load is not called from a draw', () => {
  const src = stripComments(JS);
  assert(!/\bDB\s*\./.test(src), 'the screen reaches for DB directly instead of going through Cache');
  assert(!/getAll\s*\(/.test(src), 'a getAll in a screen is the measured bug restated');
  // Cache.load appears exactly once, in load(), which is called from mount()
  // and from a route change — never from render or draw.
  const calls = src.match(/\.load\s*\(/g) || [];
  assert.strictEqual(calls.length, 1, 'Cache.load is called ' + calls.length + ' times; it may be called from exactly one place');
  const drawBody = src.slice(src.indexOf('function draw(index, f, opts)'), src.indexOf('function empty(text, icon)'));
  assert(drawBody.length > 200, 'the draw function was not found, so this check is reading nothing');
  for (const re of [/\.load\s*\(/, /\bindex\s*\(/]) assert(!re.test(drawBody), 'draw() builds or loads: ' + re);
});

/* A comparator that parses a date is O(n log n) parses, and the sort is the one
 * place on this screen that runs more than once per row. Every date is read
 * ONCE, while the index is built.
 * MUTATION: read Date.parse or a store inside compare(). */
test('the comparator is pure: four comparisons on fields already on the row, no date, no format, no store', () => {
  const src = stripComments(JS);
  const start = src.indexOf('function compare(a, b)');
  assert(start > 0, 'compare() was not found');
  const body = src.slice(start, src.indexOf('}', src.indexOf('return a.id < b.id')) + 1);
  for (const re of [/Date\b/, /parse/i, /toLocale/, /read\s*\(/, /\bfig\b/, /\bsay\s*\(/, /\bfill\s*\(/,
                    /\bcache\s*\(/, /\[\s*\]/, /\{\s*\}/])
    assert(!re.test(body), 'the comparator does more than compare: ' + re + '\n' + body);
  const l = load({ role: 'owner' });
  // It is a pure function of two rows: same input, same answer, no side effect.
  const a = { band: 2, rank: -9000, id: 'a' }, b = { band: 2, rank: -3500, id: 'b' };
  assert.strictEqual(l.win.Attention.compare(a, b), l.win.Attention.compare(a, b));
  assert(l.win.Attention.compare(a, b) < 0, 'band 2 reads biggest money first');
});

/* =====================================================================================================
 * 6. THE RANKING — four bands, one basis each, then id
 * ===================================================================================================== */

test('four bands in §3.3\'s order, each kind in the band the spec gives it', () => {
  const l = load({ role: 'owner' });
  const band = {};
  for (const k of l.win.Attention.KINDS) band[k.key] = k.band;
  assert.deepEqual(band, {
    gateDecide: 1, unsafe: 1,                        // somebody standing still or unsafe
    stock: 2, pilferage: 2, challan: 2,              // money is leaving
    busPaper: 3, crewPaper: 3,                       // a clock ending in a fine or a stopped bus
    verifyJob: 4, breakdown: 4, seat: 4,             // work waiting on a person
  });
  assert.deepEqual(l.win.Attention.BANDS.map((b) => b.band), [1, 2, 3, 4], 'the tabs are not in the bands\' own order');
});

test('the list is band ascending, and a row of a lower band is never below one of a higher band', () => {
  const l = load({ role: 'owner' });
  const rows = idx(l, 'owner').rows;
  assert(rows.length >= 6, 'only ' + rows.length + ' rows: the seed must exercise every band');
  for (let i = 1; i < rows.length; i++)
    assert(rows[i - 1].band <= rows[i].band, 'band ' + rows[i - 1].band + ' sits above band ' + rows[i].band);
});

/* ONE BASIS PER BAND, so no cross-unit comparison exists anywhere on this
 * screen: pricing a brake failure against ninety thousand rupees of stock is
 * the thing the bands exist to avoid.
 * MUTATION: give band 2 the hours basis, or compare `rank` before `band`. */
test('each band has exactly one basis and its own direction — and no two bands are ever compared on it', () => {
  const l = load({ role: 'owner' });
  const rows = idx(l, 'owner').rows;
  const dir = { 1: 'desc', 2: 'desc', 3: 'asc', 4: 'desc' };
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1], b = rows[i];
    if (a.band !== b.band) continue;
    if (dir[a.band] === 'asc') assert(a.basis <= b.basis, 'band ' + a.band + ' must read lowest first');
    else assert(a.basis >= b.basis, 'band ' + a.band + ' must read highest first');
  }
  // The comparator decides on `band` FIRST, so two rows of different bands are
  // never compared on their basis at all. Two rows whose ranks are in the wrong
  // order across bands must still sort by band.
  const hi = { band: 1, rank: -1, id: 'z' }, lo = { band: 4, rank: -99999, id: 'a' };
  assert(l.win.Attention.compare(hi, lo) < 0, 'a band-4 row with a bigger basis outranked a band-1 row');
});

/* Band 3 is days until expiry ASCENDING, and expired is negative, so most
 * overdue is first. The seed has one expired paper and one expiring one. */
test('band 3 reads most overdue first: an expired paper is a negative number of days and leads', () => {
  const l = load({ role: 'owner' });
  const papers = idx(l, 'owner').rows.filter((r) => r.band === 3);
  assert(papers.length >= 2, 'only ' + papers.length + ' paper rows');
  assert(papers[0].basis < 0, 'the most overdue paper is not first');
  for (let i = 1; i < papers.length; i++) assert(papers[i - 1].basis <= papers[i].basis);
  assert.strictEqual(papers[0].tone, 'crit', 'an expired paper is not --bad');
  const soon = papers.filter((r) => r.basis > 0)[0];
  assert.strictEqual(soon.tone, 'warn', 'an expiring paper is not --warn');
});

/* `id` ascending, so a tie is stable and the list does not shuffle between two
 * draws of the same data.
 * MUTATION: drop the id key from compare(). */
test('id ascending breaks a tie, so two sorts of the same data give the same order', () => {
  const l = load({ role: 'owner' });
  const C = l.win.Attention.compare;
  const a = { band: 4, rank: -5, id: 'verifyJob:a' }, b = { band: 4, rank: -5, id: 'verifyJob:b' };
  assert(C(a, b) < 0 && C(b, a) > 0 && C(a, a) === 0, 'a tie is not broken by id');
  const one = idx(l, 'owner').rows.map((r) => r.id);
  const two = idx(l, 'owner').rows.map((r) => r.id);
  assert.deepEqual(one, two);
  // A shuffled input sorts to the same list: the order is the comparator's, not
  // the order the kinds happened to be built in.
  const rows = idx(l, 'owner').rows.slice().reverse().sort(C).map((r) => r.id);
  assert.deepEqual(rows, one);
});

test('a row with no basis is DROPPED from the ranking and listed under its own count, never ranked at zero', () => {
  const l = load({ role: 'owner' });
  const data = seed();
  // An unreadable expiry: not a date, not a number.
  data.buses[0].docs.push({ type: 'Road Tax', expiry: 'whenever' });
  // A card closed with no time at all.
  data.jobcards.push({ id: 'j9', busId: 'b1', problem: 'wiring', status: 'done',
                       closedBy: 'u-store', closedAt: null, verifiedBy: null });
  const got = l.win.Attention.index(data, me('owner'), NOW);
  assert.strictEqual(got.rows.filter((r) => r.id === 'verifyJob:j9').length, 0, 'an unrankable row was ranked');
  assert.strictEqual(got.unranked.filter((r) => r.id === 'verifyJob:j9').length, 1, 'an unrankable row was discarded');
  for (const r of got.rows) assert(r.rank !== null, r.id + ' is ranked with no basis');
  // An unreadable expiry is not a row at all: `whenMs` returns null and a paper
  // with nothing recorded is not an alert.
  assert.strictEqual(got.rows.concat(got.unranked).filter((r) => /Road Tax/.test(r.id)).length, 0);
  const html = l.win.Attention.render(got, 'all');
  assert(/Could not be ranked \(1\)/.test(html), 'the unranked heading does not carry its count: ' + html.slice(0, 120));
  assert(html.indexOf('Could not be ranked') > html.indexOf('att-list'), 'the unranked block is not at the end');
});

/* =====================================================================================================
 * 7. NO COUNT THAT CAN NEVER REACH ZERO
 * ===================================================================================================== */

/* `5eb8c6e`: "110 of 110 missing documents" — not one office in the country
 * scans every licence, so the figure was unreachable by design, and then the
 * genuinely undocumented driver hid among them. A paper is a row only when an
 * expiry is RECORDED and inside the window.
 * MUTATION: emit a row when `expiry` is absent. */
test('a paper with no recorded expiry is not a row, and neither is one outside the 30-day window', () => {
  const l = load({ role: 'owner' });
  const rows = idx(l, 'owner').rows.concat(idx(l, 'owner').unranked).filter((r) => r.band === 3);
  const ids = rows.map((r) => r.id);
  assert.strictEqual(ids.indexOf('busPaper:b1/PUC'), -1, 'a paper nobody has entered became an alert');
  assert.strictEqual(ids.indexOf('busPaper:b2/Insurance'), -1, 'a paper 200 days out became an alert');
  assert(ids.indexOf('busPaper:b1/Fitness') >= 0, 'the expired paper is missing, so this check proves nothing');
  assert(ids.indexOf('crewPaper:d1/license') >= 0, 'the expiring licence is missing');
  // A crew member with an Aadhaar number and no dated document contributes
  // nothing: only the three keys that carry a date are looked at, so a number
  // can never reach a row from here.
  assert.strictEqual(ids.filter((s) => /aadhaar/.test(s)).length, 0);
  assert.strictEqual(ids.indexOf('crewPaper:d2/license'), -1);
});

/* `ba274f6`: "67 buses need a driver" against 54 drivers. It can reach zero
 * only because tonight's buses are PICKED FIRST — the denominator is the nightly
 * list, not the fleet.
 * MUTATION: build the seat rows from `buses` rather than from the nightly record. */
test('kind 9 counts only buses picked to run tonight, so the count can reach zero', () => {
  const l = load({ role: 'owner' });
  const seats = idx(l, 'owner').rows.filter((r) => r.kind === 'seat');
  // b1 and b2 run tonight and each has a driver and no conductor; b3 is
  // running:false, which is a decision and not a gap.
  assert.deepEqual(seats.map((r) => r.id).sort(), ['seat:b1', 'seat:b2']);
  assert(/no conductor/.test(seats[0].t), 'the row does not name the empty seat: ' + seats[0].t);
  // Fill both conductor seats and the count reaches zero.
  const data = seed();
  data.dutylog = data.dutylog.concat([
    { id: 'dl3', crewId: 'd3', role: 'conductor', busId: 'b1', at: NOW - 1 * DAY },
    { id: 'dl4', crewId: 'd4', role: 'conductor', busId: 'b2', at: NOW - 1 * DAY },
  ]);
  assert.deepEqual(l.win.Attention.index(data, me('owner'), NOW).rows.filter((r) => r.kind === 'seat'), []);
  // With no record for tonight there is no denominator and so there are no
  // rows at all — §3.2's "kind 9 is removed, not left as a number".
  const none = seed(); none.nightlist = [];
  assert.deepEqual(l.win.Attention.index(none, me('owner'), NOW).rows.filter((r) => r.kind === 'seat'), []);
});

test('the seat comes from the newest dutylog row, not from the crew record\'s own busId', () => {
  const l = load({ role: 'owner' });
  const data = seed();
  // d1's record still says b1; the log says they moved off it yesterday.
  data.dutylog = data.dutylog.concat([{ id: 'dl9', crewId: 'd1', role: 'driver', busId: null, at: NOW - 1 * HOUR }]);
  const seats = l.win.Attention.index(data, me('owner'), NOW).rows.filter((r) => r.kind === 'seat');
  const b1 = seats.filter((r) => r.id === 'seat:b1')[0];
  assert(b1, 'b1 lost its row even though it now has no crew at all');
  assert(/no crew/.test(b1.t), 'the board read `buses` instead of the newest log row: ' + b1.t);
});

/* kind 5's count reaches zero because an explanation clears it: the server
 * writes a `stockmoves` row for every change and marks it `justified` when a
 * ledger row accounts for it. */
test('an unexplained stock change stops being a row once a justified move explains it', () => {
  const l = load({ role: 'store' });
  const one = idx(l, 'store').rows.filter((r) => r.kind === 'stock');
  assert.strictEqual(one.length, 1, 'the shortfall row is missing, so this check proves nothing');
  assert.strictEqual(one[0].basis, 9000, 'the row is valued at the shortfall, not at the quantity');
  assert(/6 missing/.test(one[0].t), one[0].t);
  const data = seed();
  data.stockmoves.push({ id: 'sm2', partId: 'p1', delta: -6, justified: true, at: NOW - 1 * DAY });
  assert.deepEqual(l.win.Attention.index(data, me('store'), NOW).rows.filter((r) => r.kind === 'stock'), []);
});

test('kind 6 flags the outlier and not the team: a store where everybody issues off the book has no rows', () => {
  const l = load({ role: 'owner' });
  const flagged = idx(l, 'owner').rows.filter((r) => r.kind === 'pilferage');
  assert.strictEqual(flagged.length, 1, 'the one outlier is not flagged');
  assert(/Suresh/.test(flagged[0].t), flagged[0].t);
  assert(/11 issues with no card in 30 days, against a team average of 1\./.test(flagged[0].sub), flagged[0].sub);
  // A team where everybody does it has no outlier and so has no rows.
  const even = seed();
  even.ledger = [
    { id: 'l1', partId: 'p1', type: 'out', qty: 1, jobId: null, by: 'u-a', at: NOW - 1 * DAY, unitCost: 100 },
    { id: 'l2', partId: 'p1', type: 'out', qty: 1, jobId: null, by: 'u-b', at: NOW - 1 * DAY, unitCost: 100 },
    { id: 'l3', partId: 'p1', type: 'out', qty: 1, jobId: null, by: 'u-c', at: NOW - 1 * DAY, unitCost: 100 },
  ];
  assert.deepEqual(l.win.Attention.index(even, me('owner'), NOW).rows.filter((r) => r.kind === 'pilferage'), []);
  /* And the only storekeeper in the garage is never flagged for doing the job
   * nobody else does: one person is no baseline, and that accusation is the one
   * this row must not make. */
  const alone = seed();
  alone.ledger = alone.ledger.filter((r) => r.by === 'u-store');
  assert.deepEqual(l.win.Attention.index(alone, me('owner'), NOW).rows.filter((r) => r.kind === 'pilferage'), []);
});

test('kind 8 needs a pattern, not a breakdown: one bus above the fleet average, and a quiet fleet has no rows', () => {
  const l = load({ role: 'owner' });
  const pat = idx(l, 'owner').rows.filter((r) => r.kind === 'breakdown');
  assert.deepEqual(pat.map((r) => r.id), ['breakdown:b3'], 'the single breakdown on b1 became a pattern');
  const quiet = seed();
  quiet.breakdowns = [{ id: 'bd1', busId: 'b1', system: 'tyre', at: NOW - 1 * DAY }];
  assert.deepEqual(l.win.Attention.index(quiet, me('owner'), NOW).rows.filter((r) => r.kind === 'breakdown'), []);
});

/* =====================================================================================================
 * 8. THE STATES, AND THE ONE DELEGATED LISTENER
 * ===================================================================================================== */

test('the tabs draw IMMEDIATELY while the index is building, with every count as a dash and never a 0', () => {
  const l = load({ role: 'owner' });
  const html = l.win.Attention.render(null, 'all');
  assert(/class="tabs att-tabs" role="tablist"/.test(html), 'the strip does not draw before the index');
  assert.strictEqual(html.split('role="tab"').length - 1, 5, 'five tabs: All, Safety, Money, Papers, Waiting');
  assert.strictEqual(html.split('data-state="unknown"').length - 1, 5, 'a building count is drawn as a value');
  assert.strictEqual(html.indexOf('data-state="value"'), -1, 'a count reads 0 while the index is still building');
  assert(/class="skeleton"/.test(html), 'no skeleton while the index builds');
  // Unknown and zero must never look alike. A real zero IS a value.
  const zero = l.win.Attention.render(idx(l, 'owner', 'u1'), 'all');
  assert(zero.indexOf('data-state="value"') > 0, 'a real count is drawn as unknown');
});

test('a filter that would return nothing is still SHOWN, and selecting it names itself', () => {
  const l = load({ role: 'crewmanager' });
  const got = idx(l, 'crewmanager');
  const html = l.win.Attention.render(got, 'money');
  assert(/data-f="money"/.test(html), 'the empty filter was hidden, so the person wonders where it went');
  assert(/Nothing under Money\./.test(html), 'the empty state does not name the filter that was asked');
  assert.strictEqual(html.indexOf('Could not be ranked'), -1, 'the unranked block hides the named empty state');
});

test('the one-item list has no remainder line, and the other four counts read a real zero', () => {
  const l = load({ role: 'store' });
  const got = idx(l, 'store');
  assert.strictEqual(got.rows.length, 1);
  const html = l.win.Attention.render(got, 'all');
  assert.strictEqual(html.indexOf('Use the filters above'), -1, 'a one-row list drew a remainder line');
  assert.strictEqual(html.split('role="tab"').length - 1, 5, 'the filter counts are not drawn');
});

/* THE LINE a shipped regression was missing: a shelf-count field sat inside a
 * pressable row, the row's delegated handler caught the click, and the
 * storekeeper was thrown off the screen mid-count. It is read BEFORE [data-act]
 * and [data-nav].
 * MUTATION: move the field test after the [data-act] read, or delete it. */
test('the screen installs ONE delegated listener and it returns early on a field BEFORE reading [data-act]', () => {
  const l = load({ role: 'owner' });
  assert.strictEqual(l.clicks.length, 1, 'the screen installed ' + l.clicks.length + ' listeners; it may install one');
  const src = stripComments(JS);
  const start = src.indexOf('function onClick(ev)');
  assert(start > 0, 'onClick was not found');
  const body = src.slice(start, src.indexOf('function stop(ev)'));
  const guard = body.indexOf("closest('input, select, textarea, label, .num')");
  const act = body.indexOf("closest('[data-act]')");
  assert(guard > 0, 'the field guard is not in the handler at all');
  assert(act > 0, 'the handler does not read [data-act]');
  assert(guard < act, 'the field guard is read AFTER [data-act], which is the regression');
  // And it behaves: a click whose target is BOTH a field and inside a row with
  // an action does nothing at all.
  const before = l.win.S.route;
  const fired = clickWith(l, {
    'input, select, textarea, label, .num': { tag: 'input' },
    '[data-act]': { getAttribute: function () { return 'go'; } },
  });
  assert.strictEqual(fired, false, 'the handler took the click on a field');
  assert.strictEqual(l.win.S.route, before, 'the route moved on a tap in a field');
});

/* A tab changes what is DRAWN. It must not push a route — a back press would
 * then walk back through filters instead of leaving the screen — and it must
 * not write.
 * MUTATION: have setFilter call Router.go. */
async function filterCheck() {
  const l = load({ role: 'owner', data: seed() });
  await flush();
  l.win.Router.register('buses', { render: function () { return ''; } });
  l.win.Router.go('attention');
  l.win.Shell.mount('attention');
  const route = l.win.Router.current();
  l.screen.inserts = 0;
  const fired = clickWith(l, { '[data-act]': {
    getAttribute: function (k) { return k === 'data-act' ? 'filter' : 'money'; } } });
  assert.strictEqual(fired, true, 'the tab did not take the click');
  assert.strictEqual(l.win.Attention._filter(), 'money', 'the filter did not change');
  assert.deepEqual(l.win.Router.current(), route, 'a filter pushed a route: a back press now walks through filters');
  assert.strictEqual(l.screen.inserts, 1, 'the filter redrew with ' + l.screen.inserts + ' inserts, not one');
  assert.strictEqual(l.asked.length > 0, true);
  const reads = l.win.Cache.reads();
  clickWith(l, { '[data-act]': { getAttribute: function (k) { return k === 'data-act' ? 'filter' : 'papers'; } } });
  assert.strictEqual(l.win.Cache.reads(), reads, 'a filter re-read a store: it narrows the index in memory');
}

/* Every row goes somewhere: the row IS the reason and the link is the fix, so a
 * row with no destination is not a row. `data-act` rather than `data-nav`,
 * because the frame's own listener owns [data-nav] and would route it with no
 * params — the row would lose the bus it is about.
 * MUTATION: drop the params from Router.go in go(). */
async function rowNavCheck() {
  const l = load({ role: 'owner', data: seed() });
  await flush();
  const got = l.win.Attention.index(l.win.S.cache, me('owner'), NOW);
  for (const r of got.rows.concat(got.unranked)) {
    assert(r.to, r.id + ' has no destination, so it is not a row');
    assert(l.win.Caps.SCREENS[r.to], r.id + ' points at ' + r.to + ', which is not one of the thirteen');
    assert(r.params && Object.keys(r.params).length, r.id + ' carries no params, so the destination opens on nothing');
  }
  l.win.Router.register('jobcard', { render: function () { return ''; } });
  l.win.Router.go('attention');
  const row = got.rows.filter((r) => r.kind === 'verifyJob')[0];
  clickWith(l, { '[data-act]': {
    getAttribute: function (k) { return k === 'data-act' ? 'go' : row.id; } } });
  const cur = l.win.Router.current();
  assert.strictEqual(cur.id, 'jobcard', 'the row did not navigate: ' + cur.id);
  assert.deepEqual(cur.params, { id: 'j1' }, 'the row lost the card it is about: ' + JSON.stringify(cur.params));
}

test('a row never carries data-nav: the frame\'s own handler would route it with no params', () => {
  const l = load({ role: 'owner' });
  const html = l.win.Attention.render(idx(l, 'owner'), 'all');
  assert(/v2row-why/.test(html), 'no rows drawn');
  const parts = html.split('class="v2row');
  for (let i = 1; i < parts.length; i++) {
    const row = parts[i].split('</a>')[0];
    assert.strictEqual(row.indexOf('data-nav'), -1, 'a row carries data-nav and would lose its params');
  }
});

/* §3.5: with five filters the strip stays in the body at BOTH densities, and
 * the trailing slot takes a filter button only if a sixth is ever added. The
 * pair of facts is the check: a sixth filter reddens this instead of quietly
 * overflowing a strip that scrolls at 360px.
 * MUTATION: add a sixth entry to FILTERS. */
test('there are exactly five filters, so the trailing slot stays empty and the strip stays in the body', () => {
  const l = load({ role: 'owner' });
  assert.deepEqual(l.win.Attention.FILTERS, ['all', 'safety', 'money', 'papers', 'waiting']);
  assert.strictEqual(l.win.Attention.trailing({}), '', 'the desk filter button is drawn with only five filters');
  for (const density of ['yard', 'desk']) {
    const d = load({ role: 'owner', density: density });
    assert(/class="tabs att-tabs"/.test(d.win.Attention.render(idx(d, 'owner'), 'all')),
      'the strip left the body at ' + density);
  }
});

/* §3.7 offline: the list KEEPS its rows and the header names the last signal.
 * The rows are from the local database and are real; only their age is in
 * question, so an offlineState over them would be a lie about having nothing.
 * MUTATION: draw offlineState() instead of the rows. */
async function offlineCheck() {
  const l = load({ role: 'owner', offline: true, data: seed() });
  await flush();
  l.win.Shell.mount('attention');
  const html = l.screen.html;
  assert(/v2row-why/.test(html), 'the list lost its rows offline');
  assert.strictEqual(html.indexOf('state-offline'), -1, 'an offline state was drawn over rows that are real');
  assert(/No signal since/.test(html), 'the header does not name the last signal: ' + html.slice(0, 300));
  assert(/Needs a connection\. It will not send now\./.test(html), 'the advisor does not say so before the field');
  // A control the person may not use is ABSENT, not disabled (the ground rule).
  assert.strictEqual(html.indexOf('data-act="ask"'), -1, 'the Ask button is drawn with no connection');
  assert.strictEqual(html.indexOf('disabled'), -1, 'a control was disabled rather than removed');
}

test('the advisor has no spinner and no animation, and says what it costs before it is pressed', () => {
  const l = load({ role: 'owner' });
  const html = l.win.Attention.render(idx(l, 'owner'), 'all');
  assert(/Ask about the business/.test(html));
  assert(/This takes up to a minute\./.test(html), 'the wait is not priced before the press');
  assert(/data-act="ask"/.test(html));
  for (const re of [/spinner/i, /class="[^"]*loading/i, /aria-busy/])
    assert(!re.test(html.split('att-ask')[1] || ''), 'the advisor grew a moving thing: ' + re);
  // The field is the last thing on the screen, after the ranked list.
  assert(html.indexOf('att-ask') > html.lastIndexOf('v2row-why'), 'the advisor is above the list');
});

test('every class the screen renders has a rule in attention.css, components.css or screens.css', () => {
  const l = load({ role: 'owner' });
  const html = l.win.Attention.render(idx(l, 'owner'), 'all')
    + l.win.Attention.render(null, 'all')
    + l.win.Attention.render(idx(l, 'mechanic'), 'all');
  const all = (CSS + COMP_CSS + SCREENS_CSS);
  const seen = {};
  const re = /class="([^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) for (const c of m[1].split(/\s+/)) if (c) seen[c] = true;
  /* The ONE class with no rule of its own, and its reason, pinned so it cannot
   * grow: `.txt` is components.css's MARKUP CONTRACT wrapper that holds `.t`
   * and `.sub`. `.v2row` puts every direct child in column 2 row 1, so the two
   * lines must share one child — and that child is a plain block which
   * correctly needs no declaration. It is P1's component, not this slice's, so
   * giving it a rule here would be styling a colleague's file. A second entry
   * has to be added in a diff a reviewer sees, which is the point. */
  const WRAPPERS = ['txt'];
  assert.strictEqual(WRAPPERS.length, 1, 'a second unstyled class was allowed instead of given a rule');
  const missing = Object.keys(seen).filter((c) => all.indexOf('.' + c) === -1 && WRAPPERS.indexOf(c) === -1).sort();
  assert.deepEqual(missing, [], 'a class is rendered with no rule anywhere');
  assert(/class="txt"/.test(COMP_CSS), 'the .txt wrapper has left components.css\'s markup contract');
});

/* =====================================================================================================
 * 9. WORDS — §3.9's table, and no English the Hindi build cannot reach
 * ===================================================================================================== */

test('every id §3.9 names is registered, with an English value and a Hindi key', () => {
  const l = load({ role: 'owner' });
  const need = ['attTitle', 'attAll', 'attSafety', 'attMoney', 'attPapers', 'attWaiting',
                'attEmpty', 'attEmptyHint', 'attEmptyFilter', 'attMore', 'attUnranked',
                'attHeld', 'attSecondSig', 'attNotHere', 'attExpired', 'attExpires',
                'attAskTitle', 'attAskPlaceholder', 'attAsk', 'attAsking', 'attAskSlow', 'attAskOffline'];
  const ids = l.win.W.ids();
  assert.deepEqual(need.filter((id) => ids.indexOf(id) === -1), [], 'an id from §3.9 is not registered');
  for (const id of need) assert(String(l.win.w(id)).length > 0, id + ' has no English value');
});

/* "Never the word 'verified' on a card nobody has verified", and never "nobody
 * has signed this off": under whole-record last-write-wins two people signing
 * one card is a conflict, so the copy only says what has not happened HERE. */
test('the second-signature row says "not signed off here yet" and never claims nobody has signed it', () => {
  const l = load({ role: 'owner' });
  const row = idx(l, 'owner').rows.filter((r) => r.kind === 'verifyJob')[0];
  assert(/needs a second signature/.test(row.sub), row.sub);
  assert(/Not signed off here yet\./.test(row.sub), 'the half-finished copy is missing: ' + row.sub);
  assert.strictEqual(/verified/i.test(row.sub), false, '"verified" is on a card nobody has verified: ' + row.sub);
  assert.strictEqual(/nobody has signed/i.test(row.sub), false, row.sub);
});

test('the reason wraps and is never truncated by this screen: no ellipsis character and no title attribute on a row', () => {
  const l = load({ role: 'owner' });
  const html = l.win.Attention.render(idx(l, 'owner'), 'all');
  const parts = html.split('class="v2row');
  for (let i = 1; i < parts.length; i++) {
    const row = parts[i].split('</a>')[0];
    assert.strictEqual(row.indexOf('…'), -1, 'a row truncated its own reason with an ellipsis');
  }
  // components.css is what wraps it, and this is the file that must keep doing so.
  assert(/-webkit-line-clamp/.test(COMP_CSS), 'the wrapped-reason rule has left components.css');
});

test('a challan row only READS: the action that spends a credit is on Buses, where it can state its price', () => {
  const l = load({ role: 'owner' });
  const html = l.win.Attention.render(idx(l, 'owner'), 'all');
  assert(/unpaid challan/.test(html), 'the challan row is missing');
  for (const re of [/credit/i, /Check challans/i, /data-act="checkChallan"/])
    assert(!re.test(html), 'a challan lookup action appeared on Attention: ' + re);
});

/* =====================================================================================================
 * 10. THE ASYNC CASES
 * ===================================================================================================== */

async function atest(name, fn) {
  try { await fn(); console.log('  ok  ' + name); }
  catch (e) { console.log(' FAIL ' + name + '\n        ' + String(e.message).split('\n').join('\n        ')); fails++; }
}

async function main() {
  await atest('the index is built once per content signature: draw, redraw with no sync, and Cache.reads() does not move', readsCheck);
  await atest('two draws of the same data are byte-identical, so the index is memoised and the sort is stable', memoCheck);
  await atest('the index is built ONCE per content signature, by identity: not per draw, and not never', buildOnceCheck);
  await atest('246 rows draw as 200 in ONE string and ONE insert, with the remainder stated in three clauses', capCheck);
  for (const d of ['yard', 'desk'])
    await atest('no .figure-note inside any .v2row at ' + d + ' density — the list says its age once, in its header',
                () => figureNoteCheck(d));
  await atest('a filter narrows the index in memory: it never navigates, never writes and never re-reads a store', filterCheck);
  await atest('offline the list keeps its rows and names the last signal, and the advisor says so before the field', offlineCheck);
  await atest('every row goes somewhere, and the tap carries the thing the row is about', rowNavCheck);

  console.log(fails ? '\n  ' + fails + ' FAILED' : '\n  all ok');
  process.exit(fails ? 1 : 0);
}

main();

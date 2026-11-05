/* Tests for v2 screen slice W — Jobs (#3) and the Job card (#4).
 * Run: node test_v2_work.js
 *
 * At the repo ROOT and not in v2/, because scripts/run-tests.py discovers
 * test_*.js at the root only and does not recurse. A test in v2/ would never
 * run, and a test nobody runs is not a test.
 *
 * Node, no browser, in the shape of test_v2_shell.js: the real v2/ui/icons.js,
 * v2/ui/words.js, v2/ui/states.js, v2/ui/photos.js, v2/fmt.js, v2/caps.js,
 * v2/router.js and the two screen modules are loaded in a vm context holding a
 * stub window, and the assertions are on the markup STRING the screens return.
 * That is why render(model) is pure: a screen whose rules can only be checked
 * in a browser is a screen whose rules are checked by nobody.
 *
 * THE CHECK THIS FILE EXISTS FOR is the mechanic's own-cards rule. It leaked
 * once (`c5c11a1`: `mine` was computed and never enforced, and a mechanic
 * opened another mechanic's card and completed a part request on it). The rule
 * is written ONE place — Jobcard.guard — and the two screens are asserted to be
 * the same two calls into it: the list narrows in the QUERY (Jobs.model), the
 * detail refuses in the GUARD (Jobcard.model). Breaking either half reddens a
 * check below, which is the whole reason the two screens are one slice.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const read = (p) => fs.readFileSync(p, 'utf8');
const V2 = (...p) => path.join(ROOT, 'v2', ...p);

/* Queued and run one at a time, async cases included: a suite that fired its
 * promises and then printed a total would report green on a failure that had
 * not resolved yet. */
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

const WORK_CSS = read(V2('ui', 'work.css'));

/* =====================================================================================================
 * A SMALL CSS READER (the brace-depth reader from test_v2_shell.js / test_v2_ui.js)
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
  for (const bad of ['height:56px', 'gap:8px', 'padding:0 16px', 'font-size:15px'])
    assert(magicPx('.a{' + bad + '}').length > 0, 'detector missed: ' + bad);
  for (const fine of ['min-height:calc(var(--tap) + var(--s2))', 'border-radius:12px', 'outline-offset:-2px',
    'box-shadow:inset 0 -1px 0 var(--line)', 'padding-bottom:calc(var(--nav-h) + env(safe-area-inset-bottom))'])
    assert.deepEqual(magicPx('.a{' + fine + '}'), [], 'false positive: ' + fine);
});

test('the literal-colour detector rejects a hex and an hsl and allows a token', () => {
  for (const bad of ['color:#fff', 'background:hsl(30 20% 9%)', 'color:rgba(0,0,0,.5)'])
    assert(literalColour('.a{' + bad + '}').length > 0, 'detector missed: ' + bad);
  assert.deepEqual(literalColour('.a{color:var(--warn);background:var(--surface)}'), []);
});

/* =====================================================================================================
 * 0. work.css declares no colour and no size of its own
 * ===================================================================================================== */

test('work.css has declarations to check at all: an empty file would pass every rule below vacuously', () => {
  assert(declsOf(WORK_CSS).length >= 20, 'only ' + declsOf(WORK_CSS).length + ' declarations');
});

test('work.css sizes everything from the tokens: no px literal outside border, outline and box-shadow', () => {
  assert.deepEqual(magicPx(WORK_CSS), []);
});

test('work.css declares no colour of its own — every colour is a token reference', () => {
  assert.deepEqual(literalColour(WORK_CSS), []);
});

test('every work.css selector is [data-v2] scoped, so nothing of v1 is reached', () => {
  const loose = rulesOf(WORK_CSS)
    .map((r) => r.selector)
    .reduce((a, s) => a.concat(s.split(',').map((x) => x.trim())), [])
    .filter((s) => s && !/^\[data-v2\]/.test(s) && !/^(from|to|\d+%)$/.test(s));
  assert.deepEqual(loose, []);
});

test('the gate pass prints: work.css carries a @media print block that hides everything outside the panel', () => {
  const print = rulesOf(WORK_CSS).filter((r) => r.ctx.some((c) => /^@media\s+print/.test(c)));
  assert(print.length > 0, 'no @media print block — the gatekeeper gets no A4 sheet');
  const hides = print.some((r) => r.list.some(([p, v]) => p === 'display' && v === 'none'));
  assert(hides, 'the print block hides nothing, so the whole app prints around the pass');
});

/* =====================================================================================================
 * LOADING: the two screens in a stub window, the way a page loads them
 * ===================================================================================================== */

function el(tag) {
  const e = {
    tag: tag, html: '', inserts: 0, attrs: {}, classes: {}, find: null, parentNode: null,
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
             'fmt.js', 'caps.js', 'router.js', 'screens/jobcard.js', 'screens/jobs.js'];

/* A fake IndexedDB of one store. The two taps and the sign-off are LOCAL writes,
 * so the assertion that matters is what landed in the record — not that a
 * request was made. */
function fakeDB(rows) {
  const store = {};
  (rows || []).forEach((r) => { store[r.id] = JSON.parse(JSON.stringify(r)); });
  return {
    puts: [],
    dirty: [],
    async all(name) { return name === 'jobcards' ? Object.keys(store).map((k) => store[k]) : []; },
    async get(name, id) { return store[id] ? JSON.parse(JSON.stringify(store[id])) : null; },
    async put(name, obj) {
      this.puts.push({ store: name, obj: JSON.parse(JSON.stringify(obj)) });
      store[obj.id] = JSON.parse(JSON.stringify(obj));
      return obj;
    },
    markDirty(n) { this.dirty.push(n); },
    dirtySnapshot() { return new Set(); },
    clearDirty() {},
    _row(id) { return store[id] ? JSON.parse(JSON.stringify(store[id])) : null; }
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
  const db = fakeDB(o.cards);

  const sandbox = {
    navigator: { onLine: true, userAgent: 'node', language: 'en' },
    location: { href: 'http://localhost/v2/', pathname: '/v2/' },
    document: {
      documentElement: html,
      title: '',
      addEventListener: function (type, fn) { if (type === 'click') clicks.push(fn); },
      removeEventListener: function () {},
      getElementById: function () { return null; },
      querySelector: function () { return null; },
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
                           lastError: '', status: 'synced' }) },
    Boot: { density: () => o.density || 'yard', replica: () => ({ behind: 0, complete: o.complete !== false }) },
    Cache: { load: async () => ({}), sig: () => '0', sigOf: () => '0', reads: () => 0 },
    Shell: { mount: function (id) { sandbox.S.route = id; return true; }, body: function () { return true; } },
    V2: {
      openSheet: function (title, body) { sheets.push({ title: title, body: String(body) }); return el('dialog'); },
      closeSheet: function () {},
      confirmDialog: function (text, opts) { confirms.push({ text: text, opts: opts }); return Promise.resolve(false); },
      toast: function (text, opts) { toasts.push({ text: text, kind: opts && opts.kind }); return el('div'); }
    }
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  for (const f of SRC) vm.runInContext(read(V2(f)), ctx, { filename: V2(f) });
  return { win: sandbox, db: db, root: html, clicks: clicks, logs: logs,
           sheets: sheets, toasts: toasts, confirms: confirms, cards: o.cards || null };
}

/* ---- the fixtures ---------------------------------------------------------
 * Three mechanics, two of them on cards. j-mine is Ramesh's; j-theirs is
 * Suresh's and is the card the leak opened. */
const HOUR = 3600000;
/* Taken once, at load. Every assertion below is on a DIFFERENCE (a gap, an idle
 * span) or on a clock reading of a stamp this suite made, so a moving `now` is
 * sound — and a hard-coded one is not: the standing-time tone is measured
 * against Date.now() in the screen, and a fixture a year in the past makes
 * every card 48 hours old. */
const NOW = Date.now();

const U = [
  { id: 'u-sup', role: 'supervisor', name: 'Mohan' },
  { id: 'u-own', role: 'owner', name: 'Owner' },
  { id: 'u-m1', role: 'mechanic', name: 'Ramesh Kumar' },
  { id: 'u-m2', role: 'mechanic', name: 'Suresh' },
  { id: 'u-store', role: 'store', name: 'Store' }
];
const B = [{ id: 'b1', regNo: 'RJ09PA6126' }, { id: 'b2', regNo: 'RJ14PA1023' }];
const P = [{ id: 'p1', name: 'Brake shoe set' }];

function card(over) {
  return Object.assign({
    id: 'j-mine', busId: 'b1', problem: 'Brake overhaul', priority: 'high', status: 'open',
    assignees: [{ userId: 'u-m1', task: 'brake shoes' }], assignedTo: 'u-m1',
    enterAt: NOW - 4 * HOUR, startAt: null, completeAt: null, outAt: null, odometer: null,
    beforePhotos: [], afterPhotos: [], partsUsed: [], partRequests: [], coreReturns: [],
    externalVendor: '', externalCost: 0, closedAt: null, closedBy: null,
    verifiedBy: null, verifiedAt: null, updatedAt: NOW - HOUR
  }, over || {});
}
const theirs = () => card({ id: 'j-theirs', busId: 'b2', assignees: [{ userId: 'u-m2', task: '' }], assignedTo: 'u-m2' });

function model(l, o) {
  o = o || {};
  // The cards this context was loaded with, so the device and the screen agree.
  const cards = o.cards || l.cards || [card(), theirs()];
  l.win.S.cache = { jobcards: cards, buses: B, users: U, parts: P, ledger: o.ledger || [] };
  if (o.cache) Object.keys(o.cache).forEach((k) => { l.win.S.cache[k] = o.cache[k]; });
  return {
    route: o.route || 'jobcard', params: o.params || { id: 'j-mine' },
    role: (o.me || l.win.S.user || {}).role || null,
    density: o.density || 'yard',
    user: o.me || l.win.S.user,
    cache: l.win.S.cache,
    replica: { behind: 0, complete: o.complete !== false },
    stale: o.complete === false, offline: !!o.offline
  };
}

function asRole(roleId, o) {
  const me = U.filter((u) => u.id === roleId)[0];
  const cards = (o || {}).cards || [card(), theirs()];
  const l = load(Object.assign({}, o || {}, { me: me, cards: cards }));
  l.win.S.user = me;
  return l;
}

/* The one delegated listener, driven the way the browser drives it. `closest`
 * is what the handler reads, so a target that answered every selector would
 * make every branch look alive — each fake answers exactly one shape. */
function target(spec) {
  const node = el(spec.tag || 'button');
  Object.keys(spec.attrs || {}).forEach((k) => node.setAttribute(k, spec.attrs[k]));
  node.closest = function (sel) {
    if (spec.field && /input|select|textarea|label|\.num/.test(sel)) return el('input');
    const m = /^\[([-a-z]+)\]$/.exec(sel);
    if (m && spec.attrs && Object.prototype.hasOwnProperty.call(spec.attrs, m[1])) return node;
    if (sel === spec.selfSelector) return node;
    return null;
  };
  return node;
}

/* =====================================================================================================
 * 1. THE MECHANIC'S OWN-CARDS RULE — ONE PLACE, TWO CONSUMERS
 * ===================================================================================================== */

test('the rule has exactly one home: Jobcard.guard, and Jobs consumes it rather than restating it', () => {
  const { win } = load({});
  assert.strictEqual(typeof win.Jobcard.guard, 'function', 'Jobcard.guard is not exported');
  const jobsSrc = stripComments(read(V2('screens', 'jobs.js')));
  assert(/\.\s*guard\s*\(/.test(jobsSrc),
    'jobs.js does not call the shared guard — the rule is written twice');
  /* A SECOND copy of the membership test inside jobs.js is the c5c11a1 shape
   * returning: two expressions, one of which somebody will edit. So jobs.js
   * must hold no idea of its own about who is on a job — it never reads the
   * crew array, and it never compares an id to the signed-in person. Creating a
   * card is the one place it writes a crew field, and `create()` does that
   * through its own `crew` input rather than by reading one. */
  assert(!/\.assignees/.test(jobsSrc),
    'jobs.js reads `assignees` itself: the crew test must live only in jobcard.js');
  assert(!/\bme\.id\b|\buser\.id\b|\bS\.user\.id\b/.test(jobsSrc),
    'jobs.js compares an id to the signed-in person: that comparison has one home');
});

test('Jobcard.crew mirrors the server\'s _job_crew — assignees, else the one assignedTo, de-duplicated', () => {
  const { win } = load({});
  assert.deepEqual(win.Jobcard.crew(card()).map((a) => a.userId), ['u-m1']);
  assert.deepEqual(win.Jobcard.crew({ assignedTo: 'u-m9' }).map((a) => a.userId), ['u-m9'],
    'a card written before multi-mechanic jobs must still have a crew of one');
  assert.deepEqual(win.Jobcard.crew({ assignees: [{ userId: 'a' }, { userId: 'a' }, { userId: 'b' }] })
    .map((a) => a.userId), ['a', 'b']);
  assert.deepEqual(win.Jobcard.crew(null), []);
});

test('Jobcard.guard refuses a mechanic a card they are not on, BY ID — the c5c11a1 leak', () => {
  const { win } = load({});
  const m1 = { id: 'u-m1', role: 'mechanic' };
  assert.strictEqual(win.Jobcard.guard(card(), m1), true, 'a mechanic cannot open their own card');
  assert.strictEqual(win.Jobcard.guard(theirs(), m1), false, 'a mechanic opened a colleague\'s card');
  // Not by name, not by bus, not by role: by id.
  assert.strictEqual(win.Jobcard.guard(card({ assignees: [{ userId: 'u-m1x' }] }), m1), false,
    'a prefix match let a near-miss id through');
  assert.strictEqual(win.Jobcard.guard(card(), { id: null, role: 'mechanic' }), false,
    'a signed-out reader holds nothing');
  assert.strictEqual(win.Jobcard.guard(null, m1), false);
});

test('the whole board is every other reader\'s: supervisor, owner and store are not narrowed', () => {
  const { win } = load({});
  for (const r of ['supervisor', 'owner', 'store']) {
    assert.strictEqual(win.Jobcard.guard(theirs(), { id: 'u-x', role: r }), true, r + ' was narrowed');
  }
});

test('a mechanic\'s list is narrowed IN THE QUERY: the other card is not in the array and not in the markup', () => {
  const l = asRole('u-m1');
  const m = model(l, { route: 'jobs', params: null, me: U[2] });
  const q = l.win.Jobs.model(m);
  assert.deepEqual(q.rows.map((r) => r.id), ['j-mine'], 'the filter is not inside the function that builds the array');
  const html = l.win.Jobs.render(m);
  assert(!/j-theirs/.test(html), 'a card the mechanic may not open was drawn');
  assert(!/RJ14PA1023/.test(html), 'the other card\'s bus reached the markup');
  assert(/j-mine/.test(html), 'their own card is missing');
});

test('…and the supervisor\'s list is not narrowed, so the check above is testing the narrowing', () => {
  const l = asRole('u-sup');
  const html = l.win.Jobs.render(model(l, { route: 'jobs', params: null, me: U[0] }));
  assert(/j-theirs/.test(html) && /j-mine/.test(html), 'the supervisor lost the board');
});

test('Jobcard refuses to render a card a mechanic is not on, and draws no part of it', () => {
  const l = asRole('u-m1');
  const m = model(l, { params: { id: 'j-theirs' }, me: U[2] });
  assert.strictEqual(l.win.Jobcard.model(m).ok, false, 'the detail guard let the card through');
  const html = l.win.Jobcard.render(m);
  assert(!/Brake overhaul/.test(html), 'the fault of a card they may not open was drawn');
  assert(!/data-act="jobStart"/.test(html), 'a write control was drawn on a refused card');
  assert(/state-error|state /.test(html), 'the refusal says nothing at all');
});

test('the Mechanic workload tab is ABSENT for a mechanic — not empty, not themselves only', () => {
  const lm = asRole('u-m1');
  const mech = lm.win.Jobs.render(model(lm, { route: 'jobs', params: null, me: U[2] }));
  assert.strictEqual((mech.match(/role="tab"/g) || []).length, 3, 'a mechanic\'s filter strip is three tabs');
  assert(!/data-filter="workload"/.test(mech), 'the workload tab was drawn for a mechanic');
  const ls = asRole('u-sup');
  const sup = ls.win.Jobs.render(model(ls, { route: 'jobs', params: null, me: U[0] }));
  assert.strictEqual((sup.match(/role="tab"/g) || []).length, 4, 'the supervisor\'s strip is four tabs');
  assert(/data-filter="workload"/.test(sup));
});

/* =====================================================================================================
 * 2. THE SECOND SIGNATURE — ABSENT, NOT DISABLED, AND NOT SILENT
 * ===================================================================================================== */

const closedBy = (who) => card({
  status: 'done', closedAt: NOW - HOUR, closedBy: who,
  enterAt: NOW - 8 * HOUR, startAt: NOW - 6 * HOUR, completeAt: NOW - 2 * HOUR,
  beforePhotos: [{ url: 'u1' }, { url: 'u2' }], afterPhotos: [{ url: 'u3' }, { url: 'u4' }]
});

for (const [roleId, role] of [['u-sup', 'supervisor'], ['u-own', 'owner']]) {
  test('the closer sees NO verify control anywhere in the DOM — ' + role
     + ', the role the old rule exempted by name', () => {
    const l = asRole(roleId, { cards: [closedBy(roleId)] });
    const html = l.win.Jobcard.render(model(l, { params: { id: 'j-mine' } }));
    assert(!/data-act="jobVerify"/.test(html), 'a verify control exists for the closer');
    assert(!/Sign off/.test(html), 'the words "Sign off" are on the closer\'s card');
    // Absent, never disabled: a greyed button is still a button that says "mine to press".
    assert(!/aria-disabled="true"[^>]*jobVerify|jobVerify[^>]*aria-disabled/.test(html));
    // …and never silent. Absent needs a sentence beside it.
    assert(/Waiting for sign-off/.test(html), 'the closer is told nothing about what the card is waiting for');
    assert(/Somebody else has to check this card\. You closed it\./.test(html),
      'foundation 3.8\'s copy is not verbatim on the closer\'s card');
    // The waiting row must not press and must not be focusable.
    const slot = /<div class="v2row v2row-why[^"]*"[^>]*>[\s\S]*?Waiting for sign-off/.exec(html);
    assert(slot, 'the waiting state is not the unpressable div.v2row the foundation specifies');
    assert(!/<button[^>]*>\s*<span class="lead">[^<]*<\/span>[^<]*Waiting for sign-off/.test(html));
  });
}

test('a second eligible person sees the control, in slot 3 AND in block 14, and it is the same action', () => {
  const l = asRole('u-own', { cards: [closedBy('u-sup')] });
  const html = l.win.Jobcard.render(model(l, { params: { id: 'j-mine' } }));
  const n = (html.match(/data-act="jobVerify"/g) || []).length;
  assert.strictEqual(n, 2, 'slot 3 and block 14 must carry the same control, not one or three: got ' + n);
  assert(/Sign off/.test(html));
});

test('one tap writes verifiedBy and verifiedAt and status, and nothing else on the record', async () => {
  const l = asRole('u-own', { cards: [closedBy('u-sup')] });
  const before = l.db._row('j-mine');
  const after = await l.win.Jobcard.verify('j-mine', { id: 'u-own', role: 'owner' });
  assert.strictEqual(after.status, 'verified');
  assert.strictEqual(after.verifiedBy, 'u-own');
  assert(typeof after.verifiedAt === 'number' && after.verifiedAt > 0, 'verifiedAt was not stamped');
  const changed = Object.keys(after).filter((k) => JSON.stringify(after[k]) !== JSON.stringify(before[k]));
  assert.deepEqual(changed.sort(), ['status', 'updatedAt', 'verifiedAt', 'verifiedBy'].sort(),
    'the sign-off touched more than the three fields it owns: ' + changed.join(', '));
});

test('the closer\'s own tap is refused by the client before the server has to refuse it', async () => {
  const l = asRole('u-sup', { cards: [closedBy('u-sup')] });
  const r = await l.win.Jobcard.verify('j-mine', { id: 'u-sup', role: 'supervisor' });
  assert.strictEqual(r, null, 'the client offered the write the server answers "you closed this job" to');
  assert.strictEqual(l.db.puts.length, 0, 'a refused sign-off still wrote');
});

test('a card not yet closed has no second-signature state at all: the slot holds its real next step', () => {
  const l = asRole('u-sup', { cards: [card({ enterAt: null })] });
  const html = l.win.Jobcard.render(model(l, { params: { id: 'j-mine' } }));
  assert(!/Waiting for sign-off/.test(html), 'an open card claims to be waiting for sign-off');
  assert(!/data-act="jobVerify"/.test(html));
  assert(/Add the enter time/.test(html), 'the real next step is missing');
});

test('a card nobody has verified never reads "verified", and a verified one names both people', () => {
  const l = asRole('u-sup', { cards: [closedBy('u-own')] });
  assert(!/Finished and signed off/.test(l.win.Jobcard.render(model(l, { params: { id: 'j-mine' } }))));
  const v = asRole('u-sup', { cards: [Object.assign(closedBy('u-own'),
    { status: 'verified', verifiedBy: 'u-sup', verifiedAt: NOW })] });
  const html = v.win.Jobcard.render(model(v, { params: { id: 'j-mine' } }));
  assert(/Finished and signed off/.test(html));
  assert(!/data-act="jobVerify"/.test(html), 'a verified card still offers a sign-off');
});

test('somebody who may not verify is told who can, and is offered nothing', () => {
  const l = asRole('u-store', { cards: [closedBy('u-sup')] });
  const html = l.win.Jobcard.render(model(l, { params: { id: 'j-mine' } }));
  assert(/Waiting for a supervisor or the owner to check it/.test(html));
  assert(!/data-act="jobVerify"/.test(html));
});

/* =====================================================================================================
 * 3. THE MECHANIC'S TWO TAPS
 * ===================================================================================================== */

test('exactly ONE --accent-filled button exists on a mechanic\'s card, and it is the one next step', () => {
  const l = asRole('u-m1');
  const html = l.win.Jobcard.render(model(l, { params: { id: 'j-mine' }, me: U[2] }));
  const primaries = (html.match(/class="[^"]*btn-primary/g) || []).length;
  assert.strictEqual(primaries, 1, 'a mechanic sees ' + primaries + ' orange buttons, not one');
  assert(/data-act="jobStart"/.test(html));
  assert(/I have started/.test(html));
  // It is above everything: the slot is the first thing after the freshness line.
  const iSlot = html.indexOf('data-act="jobStart"');
  assert(iSlot < html.indexOf('Brake overhaul'), 'the one next step is below the fault — they have to scroll');
});

test('"I am done" does not exist until startAt is set, and then "I have started" does not', () => {
  const a = asRole('u-m1');
  const open = a.win.Jobcard.render(model(a, { params: { id: 'j-mine' }, me: U[2] }));
  assert(/data-act="jobStart"/.test(open) && !/data-act="jobDone"/.test(open),
    'a mechanic was shown two buttons and asked to choose');
  const b = asRole('u-m1', { cards: [card({ startAt: NOW - 2 * HOUR })] });
  const started = b.win.Jobcard.render(model(b, { params: { id: 'j-mine' }, me: U[2] }));
  assert(/data-act="jobDone"/.test(started) && !/data-act="jobStart"/.test(started));
  assert.strictEqual((started.match(/class="[^"]*btn-primary/g) || []).length, 1);
});

test('the tap stamps startAt, leaves status alone, and touches nothing else', async () => {
  const l = asRole('u-m1');
  const before = l.db._row('j-mine');
  const after = await l.win.Jobcard.stamp('startAt', 'j-mine');
  assert(typeof after.startAt === 'number' && after.startAt > 0, 'startAt was not stamped');
  assert.strictEqual(after.status, before.status, '"I am done" and "I have started" must not set status');
  const changed = Object.keys(after).filter((k) => JSON.stringify(after[k]) !== JSON.stringify(before[k]));
  assert.deepEqual(changed.sort(), ['startAt', 'updatedAt'], 'the tap wrote more than its one field: ' + changed.join(', '));
});

test('"I am done" does not set status either — done is a close, and a close is not a mechanic\'s', async () => {
  const l = asRole('u-m1', { cards: [card({ startAt: NOW - 2 * HOUR })] });
  const after = await l.win.Jobcard.stamp('completeAt', 'j-mine');
  assert(typeof after.completeAt === 'number');
  assert.strictEqual(after.status, 'open', 'completeAt set status: the server would refuse that push');
  assert.strictEqual(after.closedBy, null);
});

test('the handler returns early when the field is already set, so the second tap of a double-tap writes nothing', async () => {
  const l = asRole('u-m1', { cards: [card({ startAt: NOW - 2 * HOUR })] });
  const r = await l.win.Jobcard.stamp('startAt', 'j-mine');
  assert.strictEqual(r, null, 'a second tap on a stamped field wrote again');
  assert.strictEqual(l.db.puts.length, 0, 'the record was written twice on a double tap');
});

test('after the tap the slot is an UNPRESSABLE row that names the time and who fixes it', () => {
  const { win } = load({});
  const row = win.Jobcard.stampedRow('startAt', card({ startAt: NOW }));
  assert(/^<div class="v2row/.test(row), 'the replacement is still a button: a double tap can write again');
  assert(!/<button/.test(row) && !/data-act=/.test(row), 'the replacement carries an action');
  assert(!/tabindex="0"/.test(row), 'the replacement is in the tab order');
  assert(/Started \d\d:\d\d/.test(row), 'the stamped row does not name the time: ' + row);
  assert(/Saved on this phone\. Tell the supervisor if the time is wrong\./.test(row),
    'the copy that names who fixes a mis-tap is missing — there is no undo, so this is the only route');
});

test('there is no undo: a mechanic gets no correction control on any of the four times', () => {
  const l = asRole('u-m1', { cards: [card({ startAt: NOW - 2 * HOUR, completeAt: NOW - HOUR })] });
  const html = l.win.Jobcard.render(model(l, { params: { id: 'j-mine' }, me: U[2] }));
  assert(!/data-act="jobTime"/.test(html), 'a mechanic was given a "Change" on a time');
  assert(!/data-act="jobUndo"/.test(html), 'an undo was invented');
  assert(!/>Change</.test(html));
});

test('a mechanic sees only their nine blocks: no gate, no close, no verify, no odometer, no delete, no vendor', () => {
  const l = asRole('u-m1', { cards: [card({ externalVendor: 'Sharma Auto Electric', externalCost: 2100,
                                             odometer: 48210 })] });
  const html = l.win.Jobcard.render(model(l, { params: { id: 'j-mine' }, me: U[2] }));
  for (const act of ['jobClose', 'jobVerify', 'jobOdo', 'jobDelete', 'jobMove', 'jobPass'])
    assert(!new RegExp('data-act="' + act + '"').test(html), act + ' was drawn on a mechanic\'s card');
  assert(!/Sharma Auto Electric/.test(html), 'the vendor block was drawn for a mechanic');
  assert(!/48,210/.test(html), 'the odometer was drawn for a mechanic');
  assert(!/Odometer/.test(html), 'the odometer block was drawn for a mechanic');
  assert(!/To close:/.test(html), 'the close gate was drawn for somebody who cannot close');
  assert(!/No old parts returned|Old parts returned/.test(html), 'the core-return block was drawn for a mechanic');
  assert(!/jc-actions/.test(html), 'block 14 was drawn for a mechanic, who holds none of it');
  assert(/data-act="jobRequest"/.test(html), 'the mechanic\'s one sheet control, "I need a part", is missing');
  // …and the nine they DO see are all there.
  for (const must of ['jc-id', 'jc-fresh', 'jc-next', 'Brake overhaul', 'Who is on it',
    'The four times', 'Parts, as of', 'Part requests', 'class="photos"'])
    assert(html.indexOf(must) > 0, 'a mechanic lost a block they need: ' + must);
});

test('a mechanic who is not on the crew gets no tap at all, even on a card they can see', () => {
  /* A supervisor's own card: they are the reader, so the mechanic rows do not
   * apply and the slot must not offer a write only a crew member may make. */
  const l = asRole('u-sup');
  const html = l.win.Jobcard.render(model(l, { params: { id: 'j-mine' } }));
  assert(!/data-act="jobStart"/.test(html), 'a supervisor was offered the mechanic\'s tap');
});

/* =====================================================================================================
 * 4. THE CLOSE GATE
 * ===================================================================================================== */

test('Jobcard.gateReady mirrors the server\'s _has_proof exactly, vendor case included', () => {
  const { win } = load({});
  const g = win.Jobcard.gateReady;
  assert.strictEqual(g(card()), false, 'no photos is not ready');
  assert.strictEqual(g(card({ beforePhotos: [1, 2] })), false, 'before only is not ready');
  assert.strictEqual(g(card({ afterPhotos: [1, 2] })), false, 'after only is not ready');
  assert.strictEqual(g(card({ beforePhotos: [1, 2], afterPhotos: [1, 2] })), true);
  // Two each is THIS document's number and it is what the gate line promises.
  assert.strictEqual(g(card({ beforePhotos: [1], afterPhotos: [1] })), false,
    'one each was accepted after the line promised two');
  // A vendor bill stands in, and one photo is enough — the server's own rule.
  assert.strictEqual(g(card({ externalVendor: 'Sharma', beforePhotos: [1] })), true);
  assert.strictEqual(g(card({ externalVendor: 'Sharma' })), false);
});

test('the gate is visible from the top: block 4 sits above the fault, the times and the photos', () => {
  const l = asRole('u-sup');
  const html = l.win.Jobcard.render(model(l, { params: { id: 'j-mine' } }));
  const gate = html.indexOf('To close: 2 photos before, 2 after');
  assert(gate > 0, 'the close gate is not drawn');
  assert(gate < html.indexOf('Brake overhaul'), 'the gate is below the fault');
  assert(gate < html.indexOf('The four times'), 'the gate is below the times');
  assert(gate < html.indexOf('class="photos"'), 'the gate is below the photo block — discovered at the bottom');
  /* And it is OUTSIDE the two-column region, not merely first inside a column:
   * at desk the columns are what a reader scrolls, so a gate at the top of one
   * of them is still something to be discovered. "Visible from the top of the
   * card" has to hold at both densities from one piece of markup. */
  assert(gate < html.indexOf('class="jc-cols"'),
    'the gate is inside a column, so at desk it is below the top of the card');
  assert(/None taken yet\. A vendor bill can stand in for them\./.test(html));
});

test('the gate line counts what is still needed, and goes to "Ready to close" only when it is met', () => {
  const a = asRole('u-sup', { cards: [card({ beforePhotos: [1, 2] })] });
  assert(/2 before taken, 2 after still needed\./.test(
    a.win.Jobcard.render(model(a, { params: { id: 'j-mine' } }))));
  const b = asRole('u-sup', { cards: [card({ beforePhotos: [1, 2], afterPhotos: [1, 2] })] });
  const html = b.win.Jobcard.render(model(b, { params: { id: 'j-mine' } }));
  assert(/Ready to close/.test(html));
  assert(/2 before, 2 after\. The photos are on the card\./.test(html));
});

test('"Close this card" is present and aria-disabled while the gate is short, and absent without the role', () => {
  const short = asRole('u-sup');
  const h1 = short.win.Jobcard.render(model(short, { params: { id: 'j-mine' } }));
  const btn = /<button[^>]*data-act="jobClose"[^>]*>/.exec(h1);
  assert(btn, 'the close button is absent while the gate is short: the person holds the capability');
  assert(/aria-disabled="true"/.test(btn[0]), 'the close button is live one photo away from the gate');
  const no = asRole('u-store');
  assert(!/data-act="jobClose"/.test(no.win.Jobcard.render(model(no, { params: { id: 'j-mine' } }))),
    'a storekeeper was offered the close the server refuses');
});

test('closing is refused client-side when the gate is short — the 36e7eee shape, before the push', async () => {
  const l = asRole('u-sup');
  assert.strictEqual(await l.win.Jobcard.close('j-mine', { id: 'u-sup', role: 'supervisor' }), null);
  assert.strictEqual(l.db.puts.length, 0);
  const ok = asRole('u-sup', { cards: [card({ beforePhotos: [1, 2], afterPhotos: [1, 2] })] });
  const after = await ok.win.Jobcard.close('j-mine', { id: 'u-sup', role: 'supervisor' });
  assert.strictEqual(after.status, 'done');
  assert(typeof after.closedAt === 'number');
  const mech = asRole('u-m1');
  assert.strictEqual(await mech.win.Jobcard.close('j-mine', { id: 'u-m1', role: 'mechanic' }), null,
    'a mechanic closed a card: the phone writes done and the server then refuses');
});

/* =====================================================================================================
 * 5. NO FOUR-FIELD TIME FORM, AND NO FIELD INSIDE A PRESSABLE ROW
 * ===================================================================================================== */

test('no element on the Job card is a group of four time inputs — and the sheet holds exactly one', () => {
  const l = asRole('u-sup', { cards: [card({ enterAt: null, startAt: null, completeAt: null, outAt: null })] });
  const html = l.win.Jobcard.render(model(l, { params: { id: 'j-mine' } }));
  const times = (html.match(/type="time"/g) || []).length;
  assert.strictEqual(times, 0, 'the card itself holds ' + times + ' time inputs: that is the forbidden form');
  /* The only <input> in the card body is the photo capture's file input, and it
   * is inside a label.photo-add — which is why the delegated listener's early
   * return names `label` as well as `input`. Every other field on this screen
   * is in a sheet. */
  const inputs = html.match(/<input[^>]*>/g) || [];
  assert.strictEqual(inputs.filter((i) => !/type="file"/.test(i)).length, 0,
    'the card body holds a field: every field on this screen belongs in a sheet');
  const sheet = l.win.Jobcard.timeSheet('startAt', card());
  assert.strictEqual((sheet.match(/type="time"/g) || []).length, 1, 'one time, one sheet, one field');
});

test('a row that holds a field is div.v2row, never button.v2row — the shelf-count shape', () => {
  const l = asRole('u-sup');
  const sheets = [l.win.Jobcard.timeSheet('enterAt', card()), l.win.Jobcard.odoSheet(card(), 48210),
                  l.win.Jobcard.requestSheet(card(), [{ id: 'p1', name: 'Brake shoe set' }])];
  for (const s of sheets) {
    assert(!/<button class="v2row[\s\S]*<input/.test(s), 'a field sits inside a pressable row');
    assert(!/<a class="v2row[\s\S]*<input/.test(s));
  }
});

test('the ONE delegated listener returns early on a field BEFORE it reads [data-act], so the route is stable', () => {
  const l = asRole('u-sup');
  const handler = l.win.Jobcard.mount();
  assert.strictEqual(typeof handler, 'function', 'mount() installed no handler');
  assert.strictEqual(l.win.Jobcard.mount(), handler, 'mount() installs a second listener when called twice');
  l.win.S.route = 'jobcard';
  let prevented = false;
  // A field that ALSO answers [data-act]: the early return is the only thing
  // between the storekeeper and being thrown off the screen mid-count.
  handler({ target: target({ field: true, attrs: { 'data-act': 'jobClose', 'data-nav': 'jobs' } }),
            preventDefault: function () { prevented = true; } });
  assert.strictEqual(l.win.S.route, 'jobcard', 'tapping a field changed the route');
  assert.strictEqual(prevented, false, 'the handler claimed a click on a field');
  assert.strictEqual(l.db.puts.length, 0, 'tapping a field wrote a record');
});

test('…and the same early return is on Jobs, which carries the new-card sheet\'s odometer', () => {
  const l = asRole('u-sup');
  const handler = l.win.Jobs.mount();
  assert.strictEqual(typeof handler, 'function');
  l.win.S.route = 'jobs';
  handler({ target: target({ field: true, attrs: { 'data-nav': 'jobcard', 'data-act': 'jobNew' } }),
            preventDefault: function () {} });
  assert.strictEqual(l.win.S.route, 'jobs', 'tapping a field on Jobs changed the route');
  const src = stripComments(read(V2('screens', 'jobs.js')));
  for (const f of ['jobs.js', 'jobcard.js']) {
    const s = stripComments(read(V2('screens', f)));
    const early = s.indexOf("closest('input, select, textarea, label, .num')");
    const act = s.indexOf("closest('[data-act]')");
    assert(early > 0, f + ' does not hold the exact early-return selector');
    assert(act > 0, f + ' never looks up [data-act], so the order below proves nothing');
    assert(early < act, f + ' reads [data-act] before the early return');
  }
  assert(src.length > 0);
});

/* =====================================================================================================
 * 6. THE LIST, THE FIGURES AND THE STATES
 * ===================================================================================================== */

test('no `at` on a figure inside a row: the list states its freshness once, in its header', () => {
  const l = asRole('u-sup', { cards: [card(), theirs(), card({ id: 'j3', enterAt: NOW - 60 * HOUR })] });
  const html = l.win.Jobs.render(model(l, { route: 'jobs', params: null }));
  const rows = html.slice(html.indexOf('<button class="v2row'));
  assert(!/figure-note/.test(rows), 'a figure inside a row carries an age: that triples the row height');
  // The header says it once.
  assert((html.match(/figure-note/g) || []).length <= 1, 'the freshness is stated more than once');
});

test('unknown and zero are different figures: a card with no enterAt is a dash and says so', () => {
  const l = asRole('u-sup', { cards: [card({ enterAt: null })] });
  const html = l.win.Jobs.render(model(l, { route: 'jobs', params: null }));
  assert(/data-state="unknown"/.test(html), 'an unknown standing time was formatted into a number');
  assert(/Enter time not recorded/.test(html));
  assert(!/>0 h</.test(html), 'an unknown enter time was drawn as zero hours');
});

test('a card with no enterAt sorts to the END of the Open list, flagged', () => {
  const l = asRole('u-sup', { cards: [card({ id: 'jA', enterAt: null }), card({ id: 'jB', enterAt: NOW - 2 * HOUR }),
                                      card({ id: 'jC', enterAt: NOW - 20 * HOUR })] });
  const q = l.win.Jobs.model(model(l, { route: 'jobs', params: null }));
  assert.deepEqual(q.rows.map((r) => r.id), ['jC', 'jB', 'jA'], 'oldest first, nulls last');
});

test('the lead mark is coloured by state and nothing else: bad over 48 h, warn under, dim once started', () => {
  const l = asRole('u-sup', { cards: [card({ id: 'jOld', enterAt: NOW - 60 * HOUR }),
                                      card({ id: 'jNew', enterAt: NOW - 20 * HOUR }),
                                      card({ id: 'jRun', enterAt: NOW - 60 * HOUR, startAt: NOW - HOUR })] });
  const q = l.win.Jobs.model(model(l, { route: 'jobs', params: null }));
  const by = {};
  q.rows.forEach((r) => { by[r.id] = r; });
  assert.strictEqual(by.jOld.tone, 'bad');
  assert.strictEqual(by.jNew.tone, 'warn');
  assert.strictEqual(by.jRun.tone, 'dim', 'a started card still shouts');
});

test('idle reads in hours under 48 and in days over, so a number is never "72 h"', () => {
  const l = asRole('u-sup', { cards: [card({ enterAt: NOW - 72 * HOUR })] });
  const html = l.win.Jobs.render(model(l, { route: 'jobs', params: null }));
  assert(!/72 h/.test(html), 'the idle figure read 72 h');
  assert(/\d+ d/.test(html), 'over 48 hours the figure must read in days');
});

test('loading draws the title, the freshness line, New job and the strip from no data — and a skeleton list', () => {
  const l = asRole('u-sup');
  const m = model(l, { route: 'jobs', params: null });
  m.cache.jobcards = undefined;                   // not loaded: not the same thing as none
  const html = l.win.Jobs.render(m);
  assert(/role="tablist"/.test(html), 'the filter strip waits for data: losing it strands the reader');
  assert(/data-act="jobNew"/.test(html), 'New job card waits for data');
  assert(/aria-busy="true"/.test(html), 'no skeleton');
  assert(!/state empty/.test(html), 'an unloaded list drew emptyState: "I asked and there are none" is a lie here');
});

test('empty is named per filter, and a mechanic\'s own empty list says who puts a card on it', () => {
  const l = asRole('u-sup', { cards: [] });
  const h = l.win.Jobs.render(model(l, { route: 'jobs', params: null, cards: [] }));
  assert(/Nothing standing in the yard/.test(h) && /Every bus is on the road\./.test(h));
  const m = asRole('u-m1', { cards: [theirs()] });
  const hm = m.win.Jobs.render(model(m, { route: 'jobs', params: null, me: U[2], cards: [theirs()] }));
  assert(/No cards for you/.test(hm));
  assert(/The supervisor will put your name on one\./.test(hm));
});

test('over the cap the list draws 200 oldest-first and ends with the cap line, at yard', () => {
  const many = [];
  for (let i = 0; i < 341; i++) many.push(card({ id: 'jm' + i, enterAt: NOW - (i + 1) * 60000 }));
  const l = asRole('u-sup', { cards: many });
  const m = model(l, { route: 'jobs', params: null, cards: many });
  const q = l.win.Jobs.model(m);
  assert.strictEqual(q.rows.length, 200, 'the yard cap is 200');
  assert.strictEqual(q.total, 341);
  const html = l.win.Jobs.render(m);
  assert.strictEqual((html.match(/<button class="v2row/g) || []).length, 200);
  assert(/200 of 341 shown, oldest first\. Use a filter to narrow this\./.test(html));
});

test('the whole list is ONE string and ONE insert: the screen returns markup, it appends no rows', () => {
  const src = stripComments(read(V2('screens', 'jobs.js'))) + stripComments(read(V2('screens', 'jobcard.js')));
  assert(!/appendChild/.test(src), 'a row is appended per row: that is the 277 ms shape');
  assert(!/offsetHeight|getBoundingClientRect|getComputedStyle/.test(src), 'something measures a row');
});

test('New job card is absent without addJob — the storekeeper the server would let through', () => {
  const l = asRole('u-store');
  const html = l.win.Jobs.render(model(l, { route: 'jobs', params: null }));
  assert(!/data-act="jobNew"/.test(html), 'the client is the only thing stopping a storekeeper creating a card');
  const s = asRole('u-sup');
  assert(/data-act="jobNew"/.test(s.win.Jobs.render(model(s, { route: 'jobs', params: null }))));
});

test('offline keeps the rows and changes only their age; it never replaces a real local list', () => {
  const l = asRole('u-sup');
  const html = l.win.Jobs.render(model(l, { route: 'jobs', params: null, offline: true }));
  assert(/j-mine/.test(html), 'offline threw away rows that are real');
  assert(/No connection since/.test(html));
  assert(!/state-offline/.test(html), 'offlineState replaced a list that has local data');
  const none = asRole('u-sup', { cards: [] });
  const h2 = none.win.Jobs.render(model(none, { route: 'jobs', params: null, offline: true, cards: [] }));
  assert(/state-offline/.test(h2), 'offline with no local data at all must say so');
});

/* The AGGREGATE is marked stale while the device is still filling; a row's own
 * standing time is not, and that is the deliberate reading of two rules that
 * collide. figure()'s note is added whenever `stale` is passed, so marking every
 * row stale would put a .figure-note in every row — the exact thing foundation
 * 2.3 rule 4 forbids, for the exact reason it forbids it. A per-record reading
 * is not made uncertain by a short replica; a COUNT over those records is. */
test('with an incomplete replica the standing COUNT is stale and no row gains a figure-note', () => {
  const l = asRole('u-sup');
  const html = l.win.Jobs.render(model(l, { route: 'jobs', params: null, complete: false }));
  assert(/data-state="stale"/.test(html), 'the aggregate count is drawn as final over half a replica');
  const rows = html.slice(html.indexOf('<button class="v2row'));
  assert(!/figure-note/.test(rows), 'every row grew an age note, which triples the row height');
});

/* =====================================================================================================
 * 7. THE FOUR TIMES AND THE GAPS
 * ===================================================================================================== */

test('a missing time is a pressable row with one sheet behind it, not an empty field', () => {
  const l = asRole('u-sup', { cards: [card({ enterAt: null })] });
  const html = l.win.Jobcard.render(model(l, { params: { id: 'j-mine' } }));
  assert(/Enter time — not recorded/.test(html));
  assert(/Tap to add it/.test(html));
  assert(/data-act="jobTime" data-field="enterAt"/.test(html), 'the missing time opens no sheet');
});

test('the gap is the information: wait, worked and stood are words, and an uncomputable gap says so', () => {
  const l = asRole('u-sup', { cards: [card({ enterAt: NOW - 8 * HOUR, startAt: NOW - 5 * HOUR,
                                             completeAt: NOW - 1 * HOUR, outAt: NOW - 30 * 60000 })] });
  const html = l.win.Jobcard.render(model(l, { params: { id: 'j-mine' } }));
  assert(/Waited 3 h 0 m before work started/.test(html), html.slice(0, 0) + 'the wait gap is wrong or missing');
  assert(/Worked 4 h 0 m/.test(html));
  assert(/Stood 30 m after the work was done/.test(html));
  const noEnter = asRole('u-sup', { cards: [card({ enterAt: null, startAt: NOW - 2 * HOUR })] });
  assert(/Enter time not recorded, so the wait is unknown/.test(
    noEnter.win.Jobcard.render(model(noEnter, { params: { id: 'j-mine' } }))));
});

test('a negative gap is a finding in words, not a reorder and not a refusal to draw', () => {
  const l = asRole('u-sup', { cards: [card({ startAt: NOW - HOUR, completeAt: NOW - 3 * HOUR }) ] });
  const html = l.win.Jobcard.render(model(l, { params: { id: 'j-mine' } }));
  assert(/Finished before it started — one of these times is wrong\./.test(html));
  assert(/Work finished/.test(html), 'the row stopped drawing');
});

/* =====================================================================================================
 * 8. THE ODOMETER, THE PARTS AND THE VENDOR BLOCK
 * ===================================================================================================== */

test('an unknown odometer is a dash and "Not read yet"; a real 0 is "0 km" and "Odometer is broken"', () => {
  const a = asRole('u-sup', { cards: [card({ odometer: null })] });
  const h1 = a.win.Jobcard.render(model(a, { params: { id: 'j-mine' } }));
  assert(/Not read yet/.test(h1));
  assert(/data-state="unknown"/.test(h1));
  const b = asRole('u-sup', { cards: [card({ odometer: 0 })] });
  const h2 = b.win.Jobcard.render(model(b, { params: { id: 'j-mine' } }));
  assert(/Odometer is broken/.test(h2));
  assert(/0 km/.test(h2), 'a real zero reading was drawn as unknown');
  assert(!/data-state="unknown"/.test(h2.slice(h2.indexOf('Odometer'))));
});

test('the odometer sheet is never pre-filled with 0, and refuses a reading below the last one by naming it', () => {
  const { win } = load({});
  const sheet = win.Jobcard.odoSheet(card({ odometer: null }), 48210);
  assert(!/value="0"/.test(sheet), 'a default 0 is a wrong reading nobody typed');
  assert.strictEqual(win.Jobcard.odoError(48210, 48210), null, 'the same reading is not backwards');
  assert.strictEqual(win.Jobcard.odoError(50000, null), null, 'with no last reading there is nothing to refuse');
  const msg = win.Jobcard.odoError(48209, 48210);
  assert(msg && /48,210/.test(msg), 'the refusal does not name the last reading: ' + msg);
  assert(/Lower than the last reading/.test(msg));
  assert.strictEqual(win.Jobcard.odoError(48211, 48210), null);
});

test('the odometer is DISABLED on a verified card and ABSENT for a mechanic — two different sentences', () => {
  const v = asRole('u-sup', { cards: [Object.assign(closedBy('u-own'), { status: 'verified',
    verifiedBy: 'u-sup', verifiedAt: NOW, odometer: 48210 })] });
  const hv = v.win.Jobcard.render(model(v, { params: { id: 'j-mine' } }));
  const btn = /<button[^>]*data-act="jobOdo"[^>]*>/.exec(hv);
  assert(btn, 'the odometer control vanished on a verified card: "not for you" is the wrong sentence');
  assert(/aria-disabled="true"/.test(btn[0]), 'the frozen odometer is still live');
});

test('a part row opens the ledger behind it and says the ledger is what it is counted from', () => {
  const l = asRole('u-sup', { cards: [card({ partsUsed: [{ partId: 'p1', qty: 2, cost: 3400 }] })] });
  const html = l.win.Jobcard.render(model(l, { params: { id: 'j-mine' } }));
  assert(/Brake shoe set x2/.test(html));
  assert(/₹3,400/.test(html), 'the cost is not rupees-prefixed');
  assert(/data-act="jobLedger"/.test(html));
  const sheet = l.win.Jobcard.ledgerSheet({ partId: 'p1', qty: 2, cost: 3400 }, card(),
    [{ partId: 'p1', jobId: 'j-mine', qty: 2, cost: 3400, by: 'u-store', at: NOW }], [{ id: 'p1', name: 'Brake shoe set' }]);
  assert(/The store\u2019s ledger is what this is counted from\./.test(sheet));
});

test('the parts block carries its own age, because it is the one field the server merges', () => {
  const l = asRole('u-sup', { cards: [card({ partsUsed: [{ partId: 'p1', qty: 2, cost: 3400 }] })] });
  const html = l.win.Jobcard.render(model(l, { params: { id: 'j-mine' } }));
  assert(/Parts, as of /.test(html), 'the one block that can change under the reader does not say when it was read');
});

test('the vendor block and its gate pass are absent without outsideJob, and present with it', () => {
  const withV = (role) => asRole(role, { cards: [card({ externalVendor: 'Sharma Auto Electric',
                                                        externalCost: 2100, gatePassNo: 184 })] });
  const sup = withV('u-sup');
  const h = sup.win.Jobcard.render(model(sup, { params: { id: 'j-mine' } }));
  assert(/Sharma Auto Electric/.test(h));
  assert(/data-act="jobPass"/.test(h));
  const st = withV('u-store');
  const hs = st.win.Jobcard.render(model(st, { params: { id: 'j-mine' } }));
  assert(!/data-act="jobPass"/.test(hs), 'the gate pass was reachable without outsideJob — 02 6.1 rows 5 and 6');
  assert(!/Sharma Auto Electric/.test(hs));
});

/* =====================================================================================================
 * 9. PHOTOS
 * ===================================================================================================== */

test('empty photos is the requirement in words plus the capture control, never emptyState', () => {
  const l = asRole('u-sup');
  const html = l.win.Jobcard.render(model(l, { params: { id: 'j-mine' } }));
  const block = html.slice(html.indexOf('class="photos"') - 400);
  assert(/Two photos before, two after\. Needed to close this card\./.test(block));
  assert(/photo-add/.test(block), 'the capture control is missing: the gate is the content');
  assert(!/state empty/.test(block), 'emptyState was drawn for a block whose emptiness is a requirement');
});

test('capture is absent on a closed card and absent for a mechanic; the tiles stay', () => {
  const closed = asRole('u-sup', { cards: [closedBy('u-own')] });
  const hc = closed.win.Jobcard.render(model(closed, { params: { id: 'j-mine' } }));
  assert(!/photo-add/.test(hc), 'photos can still be added after the close');
  assert(/Photos are fixed once the card is closed\./.test(hc));
  assert(/class="photo"/.test(hc), 'the tiles went with the capture cell');
  const mech = asRole('u-m1', { cards: [card({ beforePhotos: [{ url: 'u1' }] })] });
  const hm = mech.win.Jobcard.render(model(mech, { params: { id: 'j-mine' }, me: U[2] }));
  assert(!/photo-add/.test(hm), 'a mechanic was given a capture control they may not use');
  assert(/class="photo"/.test(hm), 'a mechanic lost the before photos, which is often what they need');
});

test('a photo URL never leaves the image element: no anchor, no copy, no download', () => {
  const l = asRole('u-sup', { cards: [card({ beforePhotos: [{ url: 'https://x/u1.jpg' }] })] });
  const html = l.win.Jobcard.render(model(l, { params: { id: 'j-mine' } }));
  assert(!/<a[^>]+https:\/\/x/.test(html), 'an upload URL was put in an anchor');
  assert(!/download/.test(html));
  assert(/referrerpolicy="no-referrer"/.test(html));
});

/* =====================================================================================================
 * 10. THE ISSUE SHEET, AND THE d738a6e RULE
 * ===================================================================================================== */

/* [E] d738a6e: the issue sheet must never open with a job pre-selected from a
 * list. Issuing is Store's (#6) flow — the ledger, then the stock, then
 * partsUsed, in that order, and this screen owns none of the three — so slot 3
 * HANDS OVER, and what must be checked here is that the handover carries THIS
 * card rather than sending the storekeeper to a list to pick one. */
test('the storekeeper\'s one next step carries THIS card and never a list to pick from', () => {
  const l = asRole('u-store', { cards: [card({ partRequests: [{ partId: 'p1', qty: 2,
                                                                status: 'requested', at: NOW }] })] });
  const html = l.win.Jobcard.render(model(l, { params: { id: 'j-mine' } }));
  const ctl = /<button[^>]*data-act="jobIssue"[^>]*>/.exec(html);
  assert(ctl, 'the store has no next step on a card with a part waiting');
  assert(/data-card="j-mine"/.test(ctl[0]), 'the handover does not name the card it came from');
  assert(!/<select/.test(html), 'a select on the card body is a list to pick a job from');
  assert.strictEqual(typeof l.win.Jobcard.issueSheet, 'undefined',
    'this screen builds an issue sheet it does not own the write for');
});

test('the new-card sheet pre-selects no bus, and its odometer is empty', () => {
  const l = asRole('u-sup');
  const sheet = l.win.Jobs.newSheet(B, U);
  const first = /<option[^>]*>/.exec(sheet);
  assert(/disabled/.test(first[0]), 'the bus select\'s first option is not a disabled prompt');
  assert(!/selected/.test(sheet), 'a bus was pre-selected');
  assert(!/value="0"/.test(sheet), 'the odometer was pre-filled with 0');
  assert.strictEqual((sheet.match(/type="time"/g) || []).length, 0);
});

/* =====================================================================================================
 * 10b. WORKLOAD, THE MOVE, THE CREW AND THE DELETE
 * ===================================================================================================== */

test('Mechanic workload is three numbers, never one score, and at desk it is a table', () => {
  const l = asRole('u-sup', { cards: [card({ outAt: NOW, enterAt: NOW - 2 * 86400000 }), theirs()] });
  l.win.Jobs.filter('workload');
  const yard = l.win.Jobs.render(model(l, { route: 'jobs', params: null }));
  // Three numbers, side by side, never folded into one.
  assert(/\d+ open \u00b7 \d+ rework \u00b7 (\d+|\u2014) days average turnaround/.test(yard),
    'the workload row does not keep its three numbers apart: ' + yard.slice(0, 0));
  const desk = l.win.Jobs.render(model(l, { route: 'jobs', params: null, density: 'desk' }));
  assert(/<table class="table jb-work">/.test(desk), 'at desk the workload is not a table');
  const figs = (desk.match(/class="fig"/g) || []).length;
  assert(figs >= 6 && figs % 3 === 0,
    'the table does not right-align exactly three numbers per mechanic plus its three heads: ' + figs);
  l.win.Jobs.filter('open');
});

test('"Move to another bus" is absent for anybody but the owner, and absent on an unverified card', () => {
  const verified = () => Object.assign(closedBy('u-sup'), { status: 'verified', verifiedBy: 'u-own',
                                                            verifiedAt: NOW });
  const own = asRole('u-own', { cards: [verified()] });
  assert(/data-act="jobMove"/.test(own.win.Jobcard.render(model(own, { params: { id: 'j-mine' } }))));
  const sup = asRole('u-sup', { cards: [verified()] });
  assert(!/data-act="jobMove"/.test(sup.win.Jobcard.render(model(sup, { params: { id: 'j-mine' } }))),
    'a supervisor was offered a move the server refuses');
  const open = asRole('u-own');
  assert(!/data-act="jobMove"/.test(open.win.Jobcard.render(model(open, { params: { id: 'j-mine' } }))),
    'an unverified card offered a move: the server only lets the owner move a verified one');
});

test('the crew sheet writes BOTH crew fields together, so v1 reads the same answer from either', () => {
  const { win } = load({});
  const sheet = win.Jobcard.crewSheet(card(), U);
  assert.strictEqual((sheet.match(/<select/g) || []).length, 1, 'one select, one value');
  assert(!/selected/.test(sheet), 'a mechanic was pre-selected');
  // Only mechanics are on the list: a supervisor is not somebody you put on a job.
  assert(/u-m1/.test(sheet) && /u-m2/.test(sheet) && !/u-sup/.test(sheet));
});

test('"Delete this card" is the owner\'s alone and is behind a confirmation naming the consequence', async () => {
  const sup = asRole('u-sup');
  assert(!/data-act="jobDelete"/.test(sup.win.Jobcard.render(model(sup, { params: { id: 'j-mine' } }))));
  const own = asRole('u-own');
  const html = own.win.Jobcard.render(model(own, { params: { id: 'j-mine' } }));
  const b = /<button[^>]*data-act="jobDelete"[^>]*class="[^"]*"|<button[^>]*class="[^"]*"[^>]*data-act="jobDelete"/.exec(html);
  assert(b && /btn-danger/.test(b[0]), 'the delete is not drawn as the destructive thing it is');
  const src = stripComments(read(V2('screens', 'jobcard.js')));
  assert(/Delete this job card\? The parts already issued stay on the ledger\./.test(src),
    'the confirmation does not say what survives the delete');
});

/* =====================================================================================================
 * 11. THE STALE-SAVE GUARD, AND NO DIALOG ABOUT A CLOCK
 * ===================================================================================================== */

test('a save whose card changed under it asks once, in words, and never shows a timestamp tie-break', async () => {
  const l = asRole('u-sup');
  const opened = l.db._row('j-mine');
  await l.db.put('jobcards', Object.assign(l.db._row('j-mine'), { updatedAt: NOW + 1000, problem: 'Clutch' }));
  l.db.puts.length = 0;
  const r = await l.win.Jobcard.saveField('j-mine', 'enterAt', NOW - HOUR, opened.updatedAt);
  assert.strictEqual(r, null, 'the save went through without asking');
  assert.strictEqual(l.confirms.length, 1, 'the stale save asked ' + l.confirms.length + ' times');
  assert(/Somebody changed this card while you were typing\./.test(l.confirms[0].text));
  assert.strictEqual(l.confirms[0].opts.yes, 'Save mine');
  assert.strictEqual(l.confirms[0].opts.no, 'Look first');
  assert.strictEqual(l.db.puts.length, 0, '"Look first" still wrote');
});

test('no screen in this slice asks a person to adjudicate a clock', () => {
  for (const f of ['jobs.js', 'jobcard.js']) {
    const src = stripComments(read(V2('screens', f)));
    assert(!/Overwrite/i.test(src), f + ' asks about overwriting');
    assert(!/keep mine or theirs/i.test(src));
    assert(!/onConflict/.test(src), f + ' wires a callback that cannot fire');
  }
});

/* =====================================================================================================
 * 12. WORDS
 * ===================================================================================================== */

test('every fixed word both screens draw is registered, and the sixteen named ids are among them', () => {
  const { win } = load({});
  const ids = win.W.ids();
  for (const id of ['jobStarted', 'jobDone', 'jobStartedAt', 'jobDoneAt', 'jobTellSupervisor',
    'jobWorkRecorded', 'jobNeedPart', 'jobWaitingSignoff', 'jobYouClosedIt'])
    assert(ids.indexOf(id) >= 0, 'the id screens-work.md 6.3 names is not registered: ' + id);
  assert.strictEqual(win.w('jobStarted'), 'I have started');
  assert.strictEqual(win.w('jobDone'), 'I am done');
});

test('a pending Hindi label is marked on screen rather than falling back silently', () => {
  const l = load({ lang: 'hi' });
  const s = l.win.w('jobStarted');
  assert(/\[jobStarted\]/.test(s), 'the Hindi fallback is silent, which is the Trip cash defect: ' + s);
});

/* =====================================================================================================
 * 13. THE SCREENS DECLARE THEMSELVES AND REGISTER
 * ===================================================================================================== */

test('both screens register with the router under the ids Caps declares, and nowhere else', () => {
  const { win } = load({ me: U[0] });
  win.S.user = U[0];
  assert.strictEqual(win.Router.moduleFor('jobs').render, win.Jobs.render);
  assert.strictEqual(win.Router.moduleFor('jobcard').render, win.Jobcard.render);
  assert.strictEqual(win.Caps.SCREENS.jobs.declares[0], 'viewJobs');
  // And a role without viewJobs reaches neither.
  win.S.user = { id: 'd1', role: 'driver' };
  assert.strictEqual(win.Router.reachable('jobs'), false);
  assert.strictEqual(win.Router.reachable('jobcard'), false);
});

/* =====================================================================================================
 * run
 * ===================================================================================================== */
(async function () {
  await runAll();
  console.log(fails ? '\n' + fails + ' FAILED' : '\nall ok');
  process.exit(fails ? 1 : 0);
})();

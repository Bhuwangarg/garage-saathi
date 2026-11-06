/* Tests for People (#8) — v2/screens/people.js and v2/ui/people.css.
 * Run: node test_v2_people.js
 *
 * At the repo ROOT and not in v2/, because scripts/run-tests.py discovers
 * test_*.js at the root only and does not recurse. A test in v2/ would never
 * run, and a test nobody runs is not a test.
 *
 * Node, no browser, in the shape of test_v2_me.js and test_v2_work.js: the real
 * ui/icons.js, ui/words.js, ui/states.js, ui/photos.js, fmt.js, caps.js,
 * router.js, cache.js and screens/people.js are loaded in a vm context holding
 * a stub window and a small fake DOM, and the assertions are on the markup
 * STRING the screen returns. people.css is read as TEXT with the brace-depth
 * reader, and every detector is fed input it MUST reject before it is turned on
 * the real file.
 *
 * THE FOUR RULES THIS FILE EXISTS FOR — three of them recorded leaks, the
 * fourth verified and fixed nowhere:
 *
 *   1. ANOTHER PERSON'S IDENTITY DOCUMENTS reach nobody outside
 *      `manageDrivers`-or-self, PER RECORD and on the READ and the WRITE path.
 *      [C] `02 §6.2`, commit `c5c11a1`: a driver and a conductor opened another
 *      driver's document locker. A flat route permission cannot say "or self",
 *      which is how that bug lived — so the check here is the predicate and the
 *      markup, for every role and for self and other.
 *   2. THE CONVERSATION LOG never reaches the person it is about. [E]
 *      `4a42e38`. The server denies by ROLE, which is a different question, so
 *      the check is by SUBJECT: a reader whose own crew record is the person on
 *      screen gets no log card and no note text anywhere in the body.
 *   3. SALARY shows only for a role holding `money` (§2.4) — absent, never
 *      masked, and the number appears nowhere in the body for a role without
 *      it.
 *   4. The crew EMERGENCY and REFERENCE numbers, the EXIT and REHIRE fields and
 *      the FACE PHOTO are hidden by the same per-record rule as the documents.
 *      The server still sends the face photo and the exit fields to every
 *      signed-in role (`LIVE-ISSUES.md §7.3, §7.4`), so this check is the only
 *      thing standing between a conductor's device and an HR record — and it is
 *      a screen rule, not a protection.
 *
 * Plus the shared shape every screen slice owes: ONE delegated click listener
 * that returns early on a field BEFORE it reads `[data-act]`, no `.figure-note`
 * inside a row, one string one insert, nothing measured per row, and the score
 * built once per content signature rather than once per render.
 *
 * AND EVERY ONE OF THEM IS MUTATED AT THE BOTTOM OF THIS FILE. A check that
 * cannot fail is decoration, and this repo has shipped a bug behind one, so the
 * suite patches the real source and asserts the right check goes red.
 *
 * NO PIN IS IN THIS FILE. Not a real one, not a fake one, not in a fixture —
 * the PIN path is tested through the shape of what it does with the server's
 * answer, with the server's answer stubbed by the test and the digits never
 * written down here.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const read = (p) => fs.readFileSync(p, 'utf8');
const V2 = (...p) => path.join(ROOT, 'v2', ...p);

let fails = 0;
const later = [];
function note(name, e) {
  if (e) { console.log(' FAIL ' + name + '\n        ' + String(e.message).split('\n').join('\n        ')); fails++; }
  else console.log('  ok  ' + name);
}
function test(name, fn) {
  let out;
  try { out = fn(); }
  catch (e) { note(name, e); return; }
  if (out && typeof out.then === 'function') { later.push({ name: name, p: out }); return; }
  note(name, null);
}

const PE_CSS = read(V2('ui', 'people.css'));
const PE_JS = read(V2('screens', 'people.js'));

/* =====================================================================================================
 * A SMALL CSS READER (the brace-depth reader from test_v2_me.js / test_v2_ui.js)
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
      rules.push({ ctx: ctx, selector: prelude, decls: decls, list: list });
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

test('the magic-px detector rejects a literal size and allows a token, a border and a ratio', () => {
  for (const bad of ['max-width:900px', 'min-height:44px', 'gap:8px', 'font-size:15px'])
    assert(magicPx('.a{' + bad + '}').length > 0, 'detector missed: ' + bad);
  for (const fine of ['max-width:var(--read-w)', 'gap:var(--s5)', 'letter-spacing:0.08em',
    'box-shadow:inset 0 -1px 0 var(--line)', 'outline-offset:-2px',
    'grid-template-columns:calc(var(--rail-w) * 2) minmax(0, 1fr)'])
    assert.deepEqual(magicPx('.a{' + fine + '}'), [], 'false positive: ' + fine);
});

test('the literal-colour detector rejects a hex and an hsl and allows a token', () => {
  for (const bad of ['color:#fff', 'background:hsl(30 20% 9%)', 'color:rgba(0,0,0,.5)'])
    assert(literalColour('.a{' + bad + '}').length > 0, 'detector missed: ' + bad);
  assert.deepEqual(literalColour('.a{color:var(--warn);background:var(--surface)}'), []);
});

/* =====================================================================================================
 * 1. people.css: no colour, no size, no edge, inside the floor
 * ===================================================================================================== */

test('people.css has declarations to check at all: an empty file would pass every rule below vacuously', () => {
  assert(declsOf(PE_CSS).length >= 20, 'only ' + declsOf(PE_CSS).length + ' declarations');
});

test('people.css sizes everything from the tokens: no px literal outside border, outline and box-shadow', () => {
  assert.deepEqual(magicPx(PE_CSS), []);
});

test('people.css declares no colour of its own — every colour is a token reference', () => {
  assert.deepEqual(literalColour(PE_CSS), []);
});

test('every selector in people.css starts with [data-v2], so the file is inert in the live app', () => {
  assert.deepEqual(selectorsOf(PE_CSS).filter((s) => s.indexOf('[data-v2]') !== 0), []);
});

test('people.css pins nothing to any edge: no position declaration at all', () => {
  assert.deepEqual(declsOf(PE_CSS).filter((d) => d.prop === 'position').map((d) => d.sel + ': ' + d.val), []);
});

test('the desk master-detail carries BOTH clauses of the condition, like shell.css', () => {
  const split = rulesOf(PE_CSS).filter((r) => /\.pe-(split|master|slave)/.test(r.selector));
  assert(split.length >= 3, 'the desk layout is not there to check');
  for (const r of split) {
    assert(r.ctx.some((c) => /min-width:\s*1024px/.test(c)), r.selector + ' is not behind the width clause');
    assert(/\[data-density="desk"\]/.test(r.selector), r.selector + ' is not behind the density clause');
  }
});

test('people.css is inside the Chrome 109 floor and declares no motion of its own', () => {
  const src = stripComments(PE_CSS);
  for (const [why, re] of [['oklch', /oklch\(/], ['color-mix', /color-mix\(/],
    ['light-dark', /light-dark\(/], ['@scope', /@scope/], ['@container', /@container/],
    ['@starting-style', /@starting-style/], ['subgrid', /grid-template-(rows|columns)\s*:\s*subgrid/],
    ['text-wrap', /text-wrap\s*:\s*(balance|pretty)/], ['nesting', /^\s*&[\s.:>+~[{]/m],
    ['@keyframes', /@keyframes/], ['animation', /\banimation\s*:/], ['transition', /\btransition\s*:/]])
    assert(!re.test(src), why + ' is outside the floor or is forbidden motion');
});

/* =====================================================================================================
 * 2. THE SCREEN — loaded in a stub window with a small fake DOM
 * ===================================================================================================== */

function el(tag) {
  const e = {
    tag: tag, html: '', attrs: {}, lang: 'en', hidden: false, textContent: '',
    setAttribute: function (k, v) { e.attrs[k] = String(v); },
    getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(e.attrs, k) ? e.attrs[k] : null; },
    removeAttribute: function (k) { delete e.attrs[k]; },
    insertAdjacentHTML: function (p, h) { e.html += String(h); },
    addEventListener: function () {},
    closest: function () { return null; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    classList: { add: function () {}, remove: function () {}, contains: function () { return false; } }
  };
  return e;
}

const SRC = ['ui/icons.js', 'ui/words.js', 'ui/states.js', 'ui/photos.js', 'fmt.js',
             'caps.js', 'router.js', 'cache.js', 'screens/people.js'];

/* load(o) -> {win, People, sheets, toasts, written, clicks, ...}
 *   o.role    the signed-in role
 *   o.user    the signed-in login id (default 'u-boss')
 *   o.cache   the stores this device holds; ABSENT means "not read yet"
 *   o.src     a mutated v2/screens/people.js source, for the mutation tests
 */
function load(o) {
  o = o || {};
  const html = el('html');
  html.lang = o.lang === 'hi' ? 'hi' : 'en';
  html.setAttribute('data-v2', '');
  html.setAttribute('data-density', o.density || 'yard');

  const logs = { warn: [], error: [] };
  const clicks = [], inputs = [], changes = [];
  const sheets = [], toasts = [], written = [], posted = [];
  const cache = o.cache || {};
  const fields = o.fields || {};
  const answer = o.confirm === false ? false : true;

  const sandbox = {
    navigator: { onLine: o.offline ? false : true, userAgent: 'node', language: 'en' },
    location: { href: 'http://localhost/v2/', pathname: '/v2/' },
    document: {
      documentElement: html,
      title: '',
      addEventListener: function (type, fn) {
        if (type === 'click') clicks.push(fn);
        if (type === 'input') inputs.push(fn);
        if (type === 'change') changes.push(fn);
      },
      removeEventListener: function () {},
      getElementById: function (id) {
        return Object.prototype.hasOwnProperty.call(fields, id) ? { value: fields[id] } : null;
      },
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; },
      createElement: function () { return el('div'); },
      head: { appendChild: function () {} }, body: null
    },
    getComputedStyle: function () { return { opacity: '0' }; },
    addEventListener: function () {}, removeEventListener: function () {},
    setTimeout: setTimeout, clearTimeout: clearTimeout,
    Promise: Promise,
    console: {
      warn: function (m) { logs.warn.push(String(m)); },
      error: function (m) { logs.error.push(String(m)); },
      info: function () {}, log: function () {}
    },
    S: { user: o.role ? { id: o.user || 'u-boss', role: o.role, name: 'मालिक' } : null,
         route: null, cache: cache },
    Boot: {
      density: function () { return o.density || 'yard'; },
      replica: function () { return { behind: o.behind || 0, complete: o.complete !== false }; }
    },
    Sync: {
      info: function () {
        return o.sync || { pending: 0, quarantined: 0, reasons: [], lastSyncAt: Date.now(),
                           lastError: '', status: o.offline ? 'offline' : 'ok' };
      },
      now: function () { return Date.now(); },
      uploadPhoto: function () { return Promise.resolve(null); },
      coachDecide: function (id, decision) { posted.push({ what: 'coachDecide', id: id, decision: decision }); return Promise.resolve({ ok: true }); },
      /* The server's answer, shaped like the real one and carrying no digits:
       * `pins` is a map of login id to the PIN it was given, and this suite
       * never puts one in it. What is asserted is what the screen DOES with the
       * answer — never a value. */
      registerRoster: function (crew) { posted.push({ what: 'registerRoster', crew: crew }); return Promise.resolve({ ok: true, created: 0, pins: {} }); },
      addStaff: function (u) { posted.push({ what: 'addStaff', name: u.name, role: u.role, hadPin: !!u.pin }); return Promise.resolve({ id: 'u-new' }); },
      deleteStaff: function (id) { posted.push({ what: 'deleteStaff', id: id }); return Promise.resolve({ ok: true }); }
    },
    DB: { put: function (store, rec) { written.push({ store: store, rec: rec }); return Promise.resolve(rec); } },
    V2: {
      openSheet: function (title, body) { sheets.push({ title: title, body: String(body) }); return {}; },
      closeSheet: function () { sheets.push({ closed: true }); },
      confirmDialog: function (text, opts) { sheets.push({ confirm: text, opts: opts }); return Promise.resolve(answer); },
      toast: function (text, opts) { toasts.push({ text: text, kind: opts && opts.kind }); return {}; }
    }
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  /* The primitives first, then the screen — and the listener count is taken
   * BETWEEN them. ui/photos.js has one delegated document listener of its own
   * (it is what opens a tile), so counting every listener on the document would
   * assert about that file rather than about this one. */
  let base = 0;
  for (const f of SRC) {
    if (f === 'screens/people.js') base = clicks.length;
    const src = (o.src && f === 'screens/people.js') ? o.src : read(V2(f));
    vm.runInContext(src, ctx, { filename: V2(f) });
  }
  sandbox.People._reset();
  return { win: sandbox, People: sandbox.People, sheets: sheets, toasts: toasts, posted: posted,
           written: written, logs: logs, clicks: clicks, inputs: inputs, changes: changes,
           cache: cache, root: html, base: base,
           mine: function () { return clicks.slice(base); } };
}

// The frame's own model (shell.js's `model()`), which is all render() is given.
function mdl(l, over) {
  const o = over || {};
  const S = l.win.S;
  const rep = l.win.Boot.replica();
  return {
    route: 'people', params: o.params || null, role: (S.user && S.user.role) || null,
    density: o.density || 'yard', user: S.user, cache: l.cache,
    replica: rep, stale: rep.complete !== true, offline: !!o.offline
  };
}

function clickAct(l, act, attrs) {
  const target = {
    closest: function (sel) {
      if (sel === 'input, select, textarea, label, .num') return null;
      if (sel === '[data-act]') return node;
      if (sel === '[data-tab]' || sel === '[data-view]' || sel === '[data-person]') {
        return attrs && Object.prototype.hasOwnProperty.call(attrs, sel.slice(6, -1)) ? node : null;
      }
      return null;
    }
  };
  const node = {
    getAttribute: function (k) {
      if (k === 'data-act') return act;
      return attrs && Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null;
    },
    setAttribute: function () {}, removeAttribute: function () {},
    textContent: '', querySelector: function () { return null; }
  };
  const handlers = l.mine();
  for (const h of handlers) h({ target: target, preventDefault: function () {} });
  return node;
}

/* ---------- the fixtures ----------------------------------------------------
 * Two crew members. `d-ravi` is a stranger to every login in this file except
 * the one explicitly signed in as him; `d-self` is the crew record of the login
 * `u-self`, which is what makes "or self" and "never its subject" testable.
 *
 * No PIN anywhere, by design. The upload URLs are the real shape — 32 hex
 * characters — because the whole point of rule 1 is that the name IS the
 * credential (`GET /uploads/<32 hex>` needs no login at all).
 */
const UP_LIC = '/uploads/' + 'a'.repeat(32) + '.jpg';
const UP_FACE = '/uploads/' + 'b'.repeat(32) + '.jpg';
const DAY = 86400000;
const SALARY = 18000;

function crewFixture() {
  const now = Date.now();
  return [
    { id: 'd-ravi', name: 'रवि', crewRole: 'driver', busId: 'b1', driverSlot: 1,
      userId: 'u-ravi', status: 'active', joinedAt: now - 400 * DAY,
      phone: '9800000012', altPhone: '9800000013', salaryMonthly: SALARY,
      emgName: 'सीता', emgPhone: '9700000044', emgRelation: 'पत्नी',
      refName: 'मोहन', refPhone: '9700000055',
      photo: UP_FACE, address: 'Jaipur', dob: '1988-04-02', bloodGroup: 'B+',
      docs: { license: { number: 'RJ14-20110012', expiry: isoIn(19), photo: UP_LIC } },
      createdAt: now, updatedAt: now },
    { id: 'd-self', name: 'सुरेश', crewRole: 'conductor', busId: null, driverSlot: null,
      userId: 'u-self', status: 'active', joinedAt: now - 100 * DAY,
      phone: '9800000099', salaryMonthly: 12000, photo: '', docs: {},
      createdAt: now, updatedAt: now },
    { id: 'd-gone', name: 'विक्रम', crewRole: 'driver', busId: null, userId: null,
      status: 'left', leftAt: now - 30 * DAY, leftReasonKey: 'dismissed',
      leftReason: 'Dismissed — took the bus home', leftNote: 'took the bus home',
      rehire: 'no', photo: '', docs: {}, createdAt: now, updatedAt: now }
  ];
}

function isoIn(days) {
  const d = new Date(Date.now() + days * DAY);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-'
    + String(d.getDate()).padStart(2, '0');
}

const NOTE_TEXT = 'He was warned about the night running';
const COACH_FIX = 'Brake earlier at the Ajmer turn';

function fullCache(opts) {
  const o = opts || {};
  const now = Date.now();
  const c = {
    drivers: crewFixture(),
    buses: [{ id: 'b1', regNo: 'RJ09PA6126' }, { id: 'b2', regNo: 'RJ09PA7200' }],
    users: [
      { id: 'u-boss', name: 'मालिक', role: 'owner' },
      { id: 'u-sup', name: 'सुपरवाइज़र', role: 'supervisor' },
      { id: 'u-office', name: 'दफ़्तर', role: 'office' },
      { id: 'u-self', name: 'सुरेश', role: 'office' },
      { id: 'u-ravi', name: 'रवि', role: 'driver' }
    ],
    incidents: [
      { id: 'i1', driverId: 'd-ravi', type: 'dent', at: now - 3 * DAY, cost: 12400, note: 'gatepost' },
      { id: 'i2', driverId: 'd-ravi', type: 'late', at: now - 9 * DAY, cost: 0, note: '' }
    ],
    crewnotes: [
      { id: 'cn1', crewId: 'd-ravi', at: now - 2 * DAY, by: 'u-boss', kind: 'warned', text: NOTE_TEXT },
      { id: 'cn2', crewId: 'd-self', at: now - 5 * DAY, by: 'u-boss', kind: 'talked', text: 'A note about Suresh' }
    ],
    coachai: [
      { id: 'ca1', crewId: 'd-ravi', week: '2026-W44', status: 'draft',
        en: { good: 'On time all week', fix: COACH_FIX, tip: 'Coast to the stop' },
        hi: { good: '', fix: '', tip: '' } }
    ],
    attendance: [
      { id: 'a1', userId: 'u-ravi', type: 'in', at: now - 2 * DAY, late: true },
      { id: 'a2', userId: 'u-ravi', type: 'in', at: now - 3 * DAY, late: false }
    ],
    gpsevents: [
      { id: 'g1', reg: 'RJ09PA6126', type: 'overspeed', at: now - DAY },
      { id: 'g2', reg: 'RJ09PA6126', type: 'harshbrake', at: now - 2 * DAY }
    ]
  };
  /* The office and the crew manager are not SENT `gpsevents` at all
   * (`02 §5.1`), and attendance is narrowed to a reader's own rows — which is
   * what makes "No GPS for your login" and the three-of-four score a real state
   * rather than a hypothetical one. */
  if (o.noGps) delete c.gpsevents;
  if (o.noCoach) delete c.coachai;
  return c;
}

const ROLES = ['owner', 'supervisor', 'crewmanager', 'office'];

test('every role that reaches this screen holds its declaration, and the four that do not are refused', () => {
  const l = load({ role: 'owner', cache: fullCache() });
  for (const r of ROLES) assert(l.win.Caps.holds(r, 'people'), r + ' cannot open People');
  for (const r of ['store', 'mechanic', 'driver', 'conductor']) {
    assert(!l.win.Caps.holds(r, 'people'), r + ' can open People and should not');
  }
});

test('the screen registers itself with the router under its one id', () => {
  const l = load({ role: 'owner', cache: fullCache() });
  assert.strictEqual(l.win.Router.moduleFor('people'), l.win.People);
});

/* =====================================================================================================
 * RULE 1 — identity documents are manageDrivers-or-self, PER RECORD
 * ===================================================================================================== */

/* Every field in §2.5's single block, plus rule 4's four, as the strings that
 * would be on screen if one leaked. Checked against the WHOLE body — not
 * against the documents card — because the leak that happened was a different
 * screen reaching the same fields. */
const DOC_LEAKS = [
  ['the licence number', /RJ14-20110012/],
  ['a document photo URL', new RegExp('a'.repeat(32))],
  ['the face photo URL', new RegExp('b'.repeat(32))],
  ['the crew phone', /9800000012/],
  ['the second phone', /9800000013/],
  ['the emergency contact phone', /9700000044/],
  ['the emergency contact name', /सीता/],
  ['the reference phone', /9700000055/],
  ['the reference name', /मोहन/]
];

test('RULE 1: for a login without manageDrivers, another person\'s document block is ABSENT and not one of its fields is on screen', () => {
  const l = load({ role: 'office', user: 'u-office', cache: fullCache({ noGps: true }) });
  const html = l.People.render(mdl(l, { params: { id: 'd-ravi' } }));
  for (const [why, re] of DOC_LEAKS) assert(!re.test(html), 'the office is shown ' + why);
  assert(/Documents are not shown for your login/.test(html), 'no line stands where the card was');
  // Absent, not a card of blanked rows: the document NAMES must not be there
  // either, because a row that exists and is empty teaches people to ask why.
  assert(!/Driving licence/.test(html), 'the card was drawn with its rows blanked');
  assert(!/data-act="peDocAdd"/.test(html), 'the write control was drawn');
});

test('RULE 1 is OR-SELF, which a route check cannot express: the same login sees its OWN block', () => {
  const l = load({ role: 'office', user: 'u-self', cache: fullCache({ noGps: true }) });
  const own = l.People.render(mdl(l, { params: { id: 'd-self' } }));
  assert(/Driving licence/.test(own), 'a person cannot see their own documents');
  assert(/data-act="peDocAdd"/.test(own), 'a person cannot add their own document');
  // …and still not a colleague's, from the same login in the same render pass.
  const other = l.People.render(mdl(l, { params: { id: 'd-ravi' } }));
  assert(/Documents are not shown for your login/.test(other), 'self leaked into other');
  for (const [why, re] of DOC_LEAKS) assert(!re.test(other), 'self-or-permission leaked ' + why);
});

test('RULE 1 is the same predicate for every role, and it is per record', () => {
  const l = load({ role: 'owner', cache: fullCache() });
  const P = l.People;
  const ravi = crewFixture()[0], self = crewFixture()[1];
  for (const role of ROLES) {
    const m = { role: role, user: { id: 'u-office' }, cache: fullCache() };
    const expect = l.win.Caps.can(role, 'manageDrivers');
    assert.strictEqual(P.canDocs(m, ravi), expect, role + ' / a stranger');
  }
  // Self, for a login holding nothing at all: the "or self" half.
  assert.strictEqual(P.canDocs({ role: 'office', user: { id: 'u-self' }, cache: {} }, self), true);
  assert.strictEqual(P.canDocs({ role: 'office', user: { id: 'u-self' }, cache: {} }, ravi), false);
  // A record with no login attached is nobody's self, including a null id's.
  assert.strictEqual(P.canDocs({ role: 'office', user: { id: null }, cache: {} }, crewFixture()[2]), false);
});

test('RULE 1 guards the WRITE path too, because the original bug was on both', () => {
  const l = load({ role: 'office', user: 'u-office', cache: fullCache({ noGps: true }) });
  l.People.mount();
  clickAct(l, 'peDocAdd', { 'data-person': 'd-ravi' });
  assert.strictEqual(l.sheets.length, 0, 'the add-a-document sheet opened for a login that may not');
  // And it opens for a login that may.
  const ok = load({ role: 'supervisor', cache: fullCache() });
  ok.People.mount();
  clickAct(ok, 'peDocAdd', { 'data-person': 'd-ravi' });
  assert(ok.sheets.length === 1, 'the sheet did not open for a login that holds manageDrivers');
});

test('a document URL never leaves the image element: no anchor, no copy, no share, no download', () => {
  const l = load({ role: 'owner', cache: fullCache() });
  const html = l.People.render(mdl(l, { params: { id: 'd-ravi' } }));
  assert(new RegExp('a'.repeat(32)).test(html), 'the fixture document is not on screen at all');
  const url = new RegExp('<a[^>]*' + 'a'.repeat(32));
  assert(!url.test(html), 'a document URL is inside an anchor');
  assert(!/href="\/uploads/.test(html), 'an upload path is an href');
  assert(!/download/.test(html), 'a download affordance is on screen');
  assert(!/target="_blank"/.test(html), 'a new-tab affordance is on screen');
  // The one way it is allowed to travel: the photo primitive's own tile.
  assert(/data-photo-src="[^"]*a{32}/.test(html), 'the photo is not drawn through photoGrid');
});

/* =====================================================================================================
 * RULE 2 — the conversation log never reaches the person it is about
 * ===================================================================================================== */

test('RULE 2: a reader looking at their OWN crew record gets no log card and no note text', () => {
  const l = load({ role: 'office', user: 'u-self', cache: fullCache({ noGps: true }) });
  const mine = l.People.render(mdl(l, { params: { id: 'd-self' } }));
  assert(!/Conversation log/.test(mine), 'the log card was drawn for its own subject');
  assert(!/A note about Suresh/.test(mine), 'a note reached the person it is about');
  assert(!/never sees this/.test(mine), 'the log label was drawn for its own subject');
  assert(!/data-act="peLogNew"/.test(mine), 'the write control was drawn for its own subject');
  // The same login, the same render pass, somebody else: the card is there.
  const other = l.People.render(mdl(l, { params: { id: 'd-ravi' } }));
  assert(/Conversation log/.test(other), 'the log is missing for a login that holds crewNote');
  assert(new RegExp(NOTE_TEXT).test(other), 'the note is not drawn');
});

test('RULE 2 is by SUBJECT and not by role, which is the half the server gets wrong', () => {
  const l = load({ role: 'owner', cache: fullCache() });
  const P = l.People, ravi = crewFixture()[0], self = crewFixture()[1];
  const cache = fullCache();
  // An OWNER whose own crew record is on screen still gets nothing: §2.6 rule 1
  // is "for any role, ever", which a role list cannot express.
  assert.strictEqual(P.canLog({ role: 'owner', user: { id: 'u-self' }, cache: cache }, self), false);
  assert.strictEqual(P.canLog({ role: 'owner', user: { id: 'u-self' }, cache: cache }, ravi), true);
  // And a role without crewNote gets nothing either way.
  assert.strictEqual(P.canLog({ role: 'store', user: { id: 'u-boss' }, cache: cache }, ravi), false);
});

test('RULE 2 guards the write path: no note sheet, and no note saved, about oneself', () => {
  const l = load({ role: 'owner', user: 'u-self', cache: fullCache(),
                   fields: { 'pe-note': 'written about myself', 'pe-kind': 'talked' } });
  l.People.mount();
  clickAct(l, 'peLogNew', { 'data-person': 'd-self' });
  assert.strictEqual(l.sheets.length, 0, 'the note sheet opened on its own subject');
  clickAct(l, 'peLogSave', { 'data-person': 'd-self' });
  assert.deepEqual(l.written, [], 'a note about oneself was saved');
});

test('the log is append-only in the interface because it is append-only in the store: no edit, no delete', () => {
  const l = load({ role: 'owner', cache: fullCache() });
  const html = l.People.render(mdl(l, { params: { id: 'd-ravi' } }));
  const log = /Conversation log[\s\S]*?(?=<div class="card"|$)/.exec(html);
  assert(log, 'the log card is not on screen');
  assert(!/data-act="peLogEdit"/.test(log[0]) && !/data-act="peLogDelete"/.test(log[0]),
         'the log carries an edit or a delete control');
  assert(!/aria-disabled/.test(log[0]), 'the log carries a disabled control instead of an absent one');
  assert(/Office record/.test(log[0]), 'the log is drawn without its label');
});

test('the label is ALWAYS above the list, including when there is nothing written down yet', () => {
  const cache = fullCache();
  cache.crewnotes = [];
  const l = load({ role: 'owner', cache: cache });
  const html = l.People.render(mdl(l, { params: { id: 'd-ravi' } }));
  assert(/never sees this/.test(html), 'the empty log drew no label');
  const label = html.indexOf('never sees this');
  const emptyLine = html.indexOf('Nothing written down yet');
  assert(emptyLine > label, 'the label is not above the list');
});

test('the coaching note and the log carry opposite labels and are never adjacent in the DOM', () => {
  const l = load({ role: 'owner', cache: fullCache() });
  const html = l.People.render(mdl(l, { params: { id: 'd-ravi' } }));
  const coach = html.indexOf('once you approve it');
  const log = html.indexOf('never sees this');
  assert(coach >= 0 && log >= 0, 'one of the two labels is missing');
  assert(coach < log, 'the log is above the coaching note');
  // The incidents card is between them, so the two can never read as one kind
  // of writing (§2.6's "never adjacent in the DOM order").
  const inc = html.indexOf('>Incidents<');
  assert(inc > coach && inc < log, 'the two cards are adjacent');
});

test('the coaching card is absent for a login the SERVER will not let decide', () => {
  // `office` holds crewNote and is not in COACH_DECIDERS (sync_server.py:2976).
  const off = load({ role: 'office', user: 'u-office', cache: fullCache({ noGps: true }) });
  const html = off.People.render(mdl(off, { params: { id: 'd-ravi' } }));
  assert(!/once you approve it/.test(html), 'the office was offered a decision the server refuses');
  assert(!new RegExp(COACH_FIX).test(html), 'the draft note was shown to a login that cannot act on it');
  const cm = load({ role: 'crewmanager', cache: fullCache({ noGps: true }) });
  assert(/once you approve it/.test(cm.People.render(mdl(cm, { params: { id: 'd-ravi' } }))),
         'the crew manager is a decider and was not offered the decision');
});

test('approving a coaching note posts the decision, and a login that may not decide posts nothing', () => {
  const l = load({ role: 'crewmanager', cache: fullCache({ noGps: true }) });
  l.People.mount();
  clickAct(l, 'peCoachOk', { 'data-note': 'ca1', 'data-person': 'd-ravi' });
  const sent = l.posted.filter((p) => p.what === 'coachDecide');
  assert.strictEqual(sent.length, 1, 'the decision was not sent');
  assert.deepEqual(sent[0], { what: 'coachDecide', id: 'ca1', decision: 'approve' });

  const off = load({ role: 'office', user: 'u-office', cache: fullCache({ noGps: true }) });
  off.People.mount();
  clickAct(off, 'peCoachOk', { 'data-note': 'ca1', 'data-person': 'd-ravi' });
  assert.deepEqual(off.posted.filter((p) => p.what === 'coachDecide'), [],
                   'a login the server refuses sent a decision anyway');

  // And offline it is not sent at all, rather than sent and withdrawn: on a
  // cold server a withdrawn button is one somebody presses twice.
  const dark = load({ role: 'crewmanager', cache: fullCache({ noGps: true }), offline: true });
  dark.People.mount();
  clickAct(dark, 'peCoachOk', { 'data-note': 'ca1', 'data-person': 'd-ravi' });
  assert.deepEqual(dark.posted.filter((p) => p.what === 'coachDecide'), [],
                   'a decision was sent with no connection');
});

/* =====================================================================================================
 * RULE 3 — salary behind one named gate
 * ===================================================================================================== */

test('RULE 3: the salary row is absent, and the number is nowhere in the body, without `money`', () => {
  for (const role of ['crewmanager', 'office']) {
    const l = load({ role: role, user: 'u-office', cache: fullCache({ noGps: true }) });
    assert(!l.win.Caps.can(role, 'money'), role + ' holds money and the fixture is wrong');
    for (const params of [null, { id: 'd-ravi' }, { id: 'd-self' }]) {
      const html = l.People.render(mdl(l, { params: params }));
      assert(!/18,000/.test(html), role + ' is shown the salary figure');
      assert(!/Salary/.test(html), role + ' is shown a salary row');
      assert(!/aria-disabled="true"[^>]*Salary/.test(html), role + ' is shown a greyed salary row');
    }
  }
});

test('RULE 3: the two roles holding `money` do see it, so the check is not passing vacuously', () => {
  for (const role of ['owner', 'supervisor']) {
    const l = load({ role: role, cache: fullCache() });
    const html = l.People.render(mdl(l, { params: { id: 'd-ravi' } }));
    assert(/Salary/.test(html), role + ' cannot see a salary row');
    assert(/18,000/.test(html), role + ' sees the row and not the figure');
  }
});

test('RULE 3 hangs off ONE named gate, so answering Q4 is a one-line change', () => {
  const src = stripComments(PE_JS);
  const gate = /var SALARY_GATE = '([a-zA-Z]+)'/.exec(src);
  assert(gate, 'the salary gate is not a named constant');
  assert.strictEqual(gate[1], 'money', 'the gate is not `money`, which is what §2.4 specifies until Q4 answers');
  // One call site: a second one is a second place to edit when Q4 lands.
  assert.strictEqual((src.match(/SALARY_GATE/g) || []).length, 2,
                     'the salary gate is read in more than one place');
  assert(/Q4/.test(PE_JS), 'the open question is not named in a comment');
});

/* =====================================================================================================
 * RULE 4 — the four field sets the server still sends to everybody
 * ===================================================================================================== */

test('RULE 4: the emergency and reference numbers, the face photo and the exit fields are behind the documents rule', () => {
  const l = load({ role: 'office', user: 'u-office', cache: fullCache({ noGps: true }) });
  for (const id of ['d-ravi', 'd-gone']) {
    const html = l.People.render(mdl(l, { params: { id: id } }));
    assert(!/9700000044/.test(html), 'the emergency phone reached a login without manageDrivers');
    assert(!/9700000055/.test(html), 'the reference phone did');
    assert(!new RegExp('b'.repeat(32)).test(html), 'the face photo did');
    assert(!/took the bus home/.test(html), 'the exit note did');
    assert(!/Dismissed/.test(html), 'the exit reason did');
  }
  // The list row and the roll still say the person LEFT — the status is not one
  // of the four field sets, and hiding it would be a different screen.
  const roll = l.People.render(mdl(l, { params: { id: 'd-gone' } }));
  assert(/Left/.test(roll), 'the roll does not say the person left at all');
});

test('RULE 4: a login holding manageDrivers does see all four, so the check is not vacuous', () => {
  const l = load({ role: 'crewmanager', cache: fullCache({ noGps: true }) });
  const html = l.People.render(mdl(l, { params: { id: 'd-ravi' } }));
  assert(/9700000044/.test(html), 'the emergency phone is missing for a holder');
  assert(/9700000055/.test(html), 'the reference phone is missing for a holder');
  assert(new RegExp('b'.repeat(32)).test(html), 'the face photo is missing for a holder');
  const gone = l.People.render(mdl(l, { params: { id: 'd-gone' } }));
  assert(/took the bus home/.test(gone), 'the exit note is missing for a holder');
});

test('and the file says the server still sends them, so nobody reads the screen rule as a protection', () => {
  for (const re of [/emgPhone/, /refPhone/, /leftReason/, /LIVE-ISSUES\.md §7\.3/, /§7\.4/]) {
    assert(re.test(PE_JS), 'the stage-3 server requirement ' + re + ' is not named in the file');
  }
  assert(/still sends/i.test(PE_JS), 'the file does not say the server still sends these fields');
});

/* =====================================================================================================
 * 3. THE SCORE — one number, its parts on screen, and three of four
 * ===================================================================================================== */

test('the score is drawn with its four parts, and the parts carry their own figures', () => {
  const l = load({ role: 'owner', cache: fullCache() });
  const html = l.People.render(mdl(l, { params: { id: 'd-ravi' } }));
  assert(/Crew score/.test(html), 'no score card');
  for (const part of ['Reviews', 'Incidents', 'Attendance', 'Safety events']) {
    assert(new RegExp(part).test(html), 'the ' + part + ' part is not on screen');
  }
  assert(/Worked out from 3 of 4 parts/.test(html), 'the score does not say how many parts it came from');
  // The review part cannot be read on a device, and says so rather than
  // counting as a zero.
  assert(/Reviews are traced on the server/.test(html), 'the unreadable part has no reason beside it');
});

test('a part that cannot be read is the dash WITH ITS REASON, and the score is still drawn', () => {
  const l = load({ role: 'crewmanager', cache: fullCache({ noGps: true }) });
  const html = l.People.render(mdl(l, { params: { id: 'd-ravi' } }));
  assert(/No GPS for your login/.test(html), '§2.3\'s own words for the missing GPS part are not used');
  assert(/Worked out from 2 of 4 parts/.test(html), 'the score did not say it lost a second part');
  assert(/Crew score/.test(html), 'the score was dropped because a part was missing');
});

test('an unknown score is the dash and sorts LAST, because unknown is not the worst', () => {
  const cache = fullCache({ noGps: true });
  // Nobody's attendance and no incidents read: every part is unknown.
  delete cache.attendance;
  delete cache.incidents;
  const l = load({ role: 'office', user: 'u-office', cache: cache });
  const html = l.People.render(mdl(l, {}));
  const scores = l.People.scoreIndex({ role: 'office', user: { id: 'u-office' }, cache: cache });
  assert.strictEqual(scores['d-ravi'].score, null, 'a score was invented from four unknown parts');
  assert(/Score —/.test(html.replace(/<[^>]*>/g, '')), 'an unknown score is not the dash in the row');
});

test('the score is built ONCE per content signature, not once per render and not once per row', () => {
  const l = load({ role: 'owner', cache: fullCache() });
  const m = mdl(l, {});
  l.People._reset();
  l.People.render(m);
  l.People.render(m);
  l.People.render(m);
  assert.strictEqual(l.People._stats().scoreBuilds, 1, 'the index was rebuilt per render');
});

test('no defaulted denominator: zero attendance days is the dash, never "never late"', () => {
  const cache = fullCache();
  cache.attendance = [];
  const l = load({ role: 'owner', cache: cache });
  const html = l.People.render(mdl(l, { params: { id: 'd-ravi' } }));
  assert(/No attendance on this device/.test(html), 'an empty attendance store read as a perfect record');
  assert(!/Late 0 of 0 days/.test(html), 'a zero denominator was drawn');
});

/* =====================================================================================================
 * 4. THE SHARED SHAPE every screen slice owes
 * ===================================================================================================== */

test('ONE delegated click listener, installed once however many times mount() is called', () => {
  const l = load({ role: 'owner', cache: fullCache() });
  l.People.mount(); l.People.mount(); l.People.mount();
  assert.strictEqual(l.mine().length, 1, 'this screen installed ' + l.mine().length + ' click listeners');
});

test('THE LINE: the field guard is read BEFORE [data-act] and before [data-person], in source order', () => {
  const src = stripComments(PE_JS);
  const field = src.indexOf("closest(FIELDS)");
  const sel = src.indexOf("'input, select, textarea, label, .num'");
  const act = src.indexOf("closest('[data-act]')");
  const person = src.indexOf("closest('[data-person]')");
  assert(sel >= 0, 'the field selector is not in the file at all');
  // Both halves: a guard that is GONE also reads as "before", and that is the
  // version of this check that would pass either way.
  assert(field >= 0, 'the field guard is not there at all');
  assert(act >= 0 && field < act, 'the field guard is read AFTER [data-act], which is the shipped regression');
  assert(person >= 0 && field < person, 'the field guard is read AFTER [data-person]');
});

test('a tap on a field returns early and never reaches a row or an action', () => {
  const l = load({ role: 'owner', cache: fullCache() });
  l.People.mount();
  const h = l.mine()[0];
  let prevented = false;
  h({ target: { closest: function (sel) { return sel === 'input, select, textarea, label, .num' ? {} : {}; } },
      preventDefault: function () { prevented = true; } });
  assert(!prevented, 'a tap on a field was taken by the screen');
  assert.deepEqual(l.sheets, [], 'a tap on a field opened a sheet');
});

function figureNotesInRows(html) {
  const bad = [];
  const re = /<(button|div|a)\b[^>]*class="v2row[^"]*"[\s\S]*?<\/\1>/g;
  let m;
  while ((m = re.exec(html)) !== null) if (/figure-note/.test(m[0])) bad.push(m[0].slice(0, 80));
  return bad;
}

test('the figure-note detector rejects a row holding one and allows a row holding a plain figure', () => {
  assert(figureNotesInRows('<div class="v2row"><span class="figure-note">x</span></div>').length === 1);
  assert.deepEqual(figureNotesInRows('<div class="v2row"><span class="figure" data-state="value">3</span></div>'), []);
});

test('no row carries a figure note, in any state, at either density — the list states its age once', () => {
  for (const role of ROLES) {
    for (const over of [{}, { offline: true }, { density: 'desk' }, { params: { id: 'd-ravi' } }]) {
      const l = load({ role: role, cache: fullCache({ noGps: role !== 'owner' }), density: over.density });
      const html = l.People.render(mdl(l, over));
      assert.deepEqual(figureNotesInRows(html), [], role + ' / ' + JSON.stringify(over));
      // …and the one place an age IS allowed: the header, once.
      assert((html.match(/figure-note/g) || []).length <= 1,
             'more than one age on screen for ' + role);
    }
  }
});

test('nothing measures a row: no offsetHeight, no getBoundingClientRect, no getComputedStyle', () => {
  const src = stripComments(PE_JS);
  for (const re of [/offsetHeight/, /offsetWidth/, /getBoundingClientRect/, /getComputedStyle/, /scrollHeight/]) {
    assert(!re.test(src), 'the screen measures the layout: ' + re);
  }
});

test('the body is ONE string and the screen inserts nothing itself', () => {
  const src = stripComments(PE_JS);
  assert(!/insertAdjacentHTML/.test(src), 'the screen writes to the DOM instead of returning a string');
  assert(!/appendChild/.test(src), 'the screen appends per row');
  const l = load({ role: 'owner', cache: fullCache() });
  assert.strictEqual(typeof l.People.render(mdl(l, {})), 'string');
});

test('render is pure: the same model twice gives the same string, and the model is not written to', () => {
  const l = load({ role: 'owner', cache: fullCache() });
  const m = mdl(l, { params: { id: 'd-ravi' } });
  const before = JSON.stringify(m.cache.drivers);
  assert.strictEqual(l.People.render(m), l.People.render(m));
  assert.strictEqual(JSON.stringify(m.cache.drivers), before, 'render edited the records it was given');
  assert.deepEqual(l.written, [], 'render wrote to the database');
});

test('the screen asks no question about a clock: no overwrite, no keep-mine, no confirm about a conflict', () => {
  const src = stripComments(PE_JS);
  for (const re of [/Overwrite/i, /keep mine/i, /keep theirs/i, /which copy/i]) {
    assert(!re.test(src), 'the screen asks somebody to adjudicate a clock: ' + re);
  }
});

/* =====================================================================================================
 * 5. THE STATES §2.10 names, each for the role it is the first screen for
 * ===================================================================================================== */

test('loading draws a skeleton and never a number: the score is not drawn mid-fill', () => {
  const l = load({ role: 'owner', cache: {} });
  const html = l.People.render(mdl(l, {}));
  assert(/skeleton/.test(html), 'a device that has read nothing draws no skeleton');
  assert(!/Crew score/.test(html), 'the score was drawn before the stores were read');
});

test('empty, error and offline are three different nothings', () => {
  const l = load({ role: 'owner', cache: { drivers: [] } });
  assert(/Nobody on the roll yet/.test(l.People.render(mdl(l, {}))), 'an empty roll is not the empty state');

  const off = load({ role: 'owner', cache: { drivers: [] }, offline: true });
  const offHtml = off.People.render(mdl(off, { offline: true }));
  assert(!/Nobody on the roll yet/.test(offHtml), 'no signal and no data read as "there is nobody"');

  const bad = load({ role: 'owner', cache: { drivers: [] },
                     sync: { lastError: 'pull 500', lastSyncAt: null, pending: 0, reasons: [] } });
  const badHtml = bad.People.render(mdl(bad, {}));
  assert(/Could not read the crew list/.test(badHtml), 'a failed read is not an error state');
  assert(/data-state-retry/.test(badHtml), 'the error state carries no Retry');
});

test('the "Left" filter with nobody in it names the filter, not "No data"', () => {
  const cache = fullCache();
  cache.drivers = crewFixture().slice(0, 2);          // nobody has left
  const l = load({ role: 'owner', cache: cache });
  l.People.view('left');
  const html = l.People.render(mdl(l, {}));
  assert(/Nobody marked as left/.test(html), 'the empty filter does not name itself');
  l.People.view('worst');
});

test('one person draws no count line, and more than one does', () => {
  const one = fullCache();
  one.drivers = [crewFixture()[0]];
  const l = load({ role: 'owner', cache: one });
  assert(!/pe-count/.test(l.People.render(mdl(l, {}))), 'one row drew a count line');
  const many = load({ role: 'owner', cache: fullCache() });
  assert(/pe-count/.test(many.People.render(mdl(many, {}))), 'three rows drew no count line');
});

test('far too many: the cap is 200 rows with the remainder stated, and the list is still one string', () => {
  const cache = fullCache();
  const crew = [];
  for (let i = 0; i < 1240; i++) {
    crew.push({ id: 'd' + i, name: 'नाम ' + i, crewRole: 'driver', busId: null,
                userId: null, status: 'active', docs: {}, photo: '' });
  }
  cache.drivers = crew;
  const l = load({ role: 'owner', cache: cache });
  const html = l.People.render(mdl(l, {}));
  assert.strictEqual((html.match(/class="v2row pe-person"/g) || []).length, 200,
                     'the cap is not 200 rows');
  assert(/1,240 people\. 200 shown\. Use the search or a filter\./.test(html),
         'the remainder is not stated');
});

test('offline keeps the rows and says when the last connection was; the network controls are absent', () => {
  const l = load({ role: 'owner', cache: fullCache(), offline: true });
  // The list's header is where a list states its freshness, once.
  const listHtml = l.People.render(mdl(l, { offline: true }));
  assert(/रवि/.test(listHtml), 'offline dropped the local rows');
  assert(/No connection since/.test(listHtml), 'offline does not say since when');
  const html = l.People.render(mdl(l, { offline: true, params: { id: 'd-ravi' } }));
  assert(/रवि/.test(html), 'offline dropped the person');
  assert(!/data-act="peDocAdd"/.test(html), 'the document upload is offered with no connection');
  assert(!/data-act="peCoachOk"/.test(html), 'the coaching approval is offered with no connection');
  assert(/Needs a connection/.test(html), 'the reason is not said in the body before anything is pressed');
  // And the writes that DO work offline are present.
  assert(/data-act="peLogNew"/.test(html), 'the conversation note cannot be written offline');
  assert(/data-act="peLeave"/.test(html), 'a leaver cannot be marked offline');
});

test('no permission: a missing inner gate makes a whole card or tab absent, never disabled', () => {
  const cm = load({ role: 'crewmanager', cache: fullCache({ noGps: true }) });
  const list = cm.People.render(mdl(cm, {}));
  assert(!/data-tab="pins"/.test(list), 'the crew manager was offered the Crew PINs tab');
  assert(!/data-tab="staff"/.test(list), 'the crew manager was offered the Staff logins tab');
  const office = load({ role: 'office', user: 'u-office', cache: fullCache({ noGps: true }) });
  const person = office.People.render(mdl(office, { params: { id: 'd-ravi' } }));
  assert(!/data-act="peAdd"/.test(person) && !/data-act="peLeave"/.test(person),
         'the office was offered a write it does not hold');
  assert(!/data-act="peIncLog"/.test(person), 'the office was offered the incident log');
  for (const html of [list, person, office.People.render(mdl(office, {}))]) {
    assert(!/aria-disabled/.test(html), 'a control the reader may not use was drawn disabled');
  }
});

test('the partially-redacted state is a whole screen and not a blank one: this is the office login', () => {
  const l = load({ role: 'office', user: 'u-office', cache: fullCache({ noGps: true }) });
  const html = l.People.render(mdl(l, { params: { id: 'd-ravi' } }));
  for (const present of ['रवि', 'RJ09PA6126', 'Crew score', 'Incidents', 'Conversation log',
                         'Documents are not shown for your login', 'No GPS for your login']) {
    assert(new RegExp(present).test(html), 'the office is missing ' + present);
  }
  // Every card that IS drawn has something under its heading.
  for (const m of html.match(/<h3>[^<]*<\/h3>/g) || []) {
    const after = html.slice(html.indexOf(m) + m.length, html.indexOf(m) + m.length + 40);
    assert(/\S/.test(after.replace(/<\/div>/g, '')), 'a heading was drawn with nothing under it: ' + m);
  }
});

test('one card throwing does not blank the person', () => {
  const l = load({ role: 'owner', cache: fullCache() });
  const m = mdl(l, { params: { id: 'd-ravi' } });
  const poisoned = {};
  for (const k of Object.keys(m.cache)) {
    if (k === 'incidents') Object.defineProperty(poisoned, k, { get: function () { throw new Error('boom'); }, enumerable: true });
    else poisoned[k] = m.cache[k];
  }
  const html = l.People.render(Object.assign({}, m, { cache: poisoned }));
  assert(/Conversation log/.test(html), 'one throwing card took the rest of the person with it');
  assert(/This part could not be drawn/.test(html), 'the failed card did not say so in place');
});

/* =====================================================================================================
 * 6. THE WRITES — the joiner, the leaver, the note, the PINs, the staff logins
 * ===================================================================================================== */

test('duplicate detection runs on a LOCAL read, over every status, by folded name and last 10 digits', () => {
  const l = load({ role: 'owner', cache: fullCache() });
  const m = mdl(l, {});
  const P = l.People;
  assert.strictEqual(P.duplicates(m, '  रवि ', '').length, 1, 'a case-folded, space-collapsed name did not match');
  assert.strictEqual(P.duplicates(m, '', '+91 98000 00012').length, 1, 'the last ten digits did not match');
  assert.strictEqual(P.duplicates(m, '', '9800000013').length, 1, 'altPhone is not matched');
  // A person who LEFT is exactly the record the office is about to retype.
  assert.strictEqual(P.duplicates(m, 'विक्रम', '').length, 1, 'a record with status left was not searched');
  assert.strictEqual(P.duplicates(m, 'कोई और', '9999999999').length, 0, 'a stranger matched');
});

test('the joiner stops at the duplicate list before the save, and "add anyway" is never the default', () => {
  const l = load({ role: 'owner', cache: fullCache(),
                   fields: { 'pe-name': 'रवि', 'pe-phone': '9800000012', 'pe-crew-role': 'driver' } });
  l.People.mount();
  clickAct(l, 'peJoinSave', {});
  assert.deepEqual(l.written, [], 'a duplicate was saved before the question was asked');
  // The list's own markup: three distinct controls, "add anyway" quiet.
  const dup = l.People.render(mdl(l, {}));       // the sheet body is built into .pe-dup
  assert(/btn-quiet/.test(PE_JS), 'the add-anyway control is not quiet');
  assert(/peDupAnyway/.test(PE_JS) && /peDupOpen/.test(PE_JS) && /peDupBack/.test(PE_JS),
         'the three duplicate controls are not all there');
  assert(typeof dup === 'string');
});

test('the joiner saves on the FIRST press with the minimum that makes a real record', () => {
  const l = load({ role: 'owner', cache: fullCache(),
                   fields: { 'pe-name': 'नया आदमी', 'pe-phone': '9811111111', 'pe-crew-role': 'conductor' } });
  l.People.mount();
  clickAct(l, 'peJoinSave', { 'data-force': 'yes' });
  assert.strictEqual(l.written.length, 1, 'the joiner did not save');
  const rec = l.written[0].rec;
  assert.strictEqual(l.written[0].store, 'drivers');
  assert.strictEqual(rec.status, 'active');
  assert.strictEqual(rec.crewRole, 'conductor');
  assert.strictEqual(rec.busId, null, 'a joiner was given a seat nobody assigned');
  // No field this store does not already have: under whole-record
  // last-write-wins an invented field is erased by the next v1 write.
  const known = ['id', 'name', 'crewRole', 'phone', 'altPhone', 'busId', 'driverSlot', 'userId',
                 'status', 'joinedAt', 'tripsLogged', 'salaryMonthly', 'docs', 'photo', 'source',
                 'createdAt', 'updatedAt'];
  assert.deepEqual(Object.keys(rec).filter((k) => known.indexOf(k) === -1), [],
                   'the joiner invented a field');
});

test('marking a leaver NAMES THE SEAT before the press, and writes one dutylog row with it', () => {
  const l = load({ role: 'owner', cache: fullCache(),
                   fields: { 'pe-exit-reason': 'dismissed', 'pe-exit-note': 'took the bus home',
                             'pe-exit-date': '', 'pe-exit-rehire': 'no' } });
  l.People.mount();
  clickAct(l, 'peLeaveSave', { 'data-person': 'd-ravi' });
  const ask = l.sheets.filter((s) => s.confirm)[0];
  assert(ask, 'no confirmation was asked at all');
  assert(/रवि/.test(ask.confirm), 'the confirmation does not name the person');
  assert(/RJ09PA6126/.test(ask.confirm), 'the confirmation does not name the seat that empties');
  assert.strictEqual(ask.opts.danger, true, 'the confirmation is not marked dangerous');
  // Two writes behind a dialog: the record, then the duty-log row. Waiting on a
  // macrotask rather than one microtask, so the assertion lands after both.
  return new Promise(function (r) { setTimeout(r, 0); }).then(function () {
    const drivers = l.written.filter((w) => w.store === 'drivers');
    const log = l.written.filter((w) => w.store === 'dutylog');
    assert.strictEqual(drivers.length, 1, 'the leaver was not written');
    assert.strictEqual(drivers[0].rec.status, 'left');
    assert.strictEqual(drivers[0].rec.busId, null, 'the seat was not freed');
    assert.strictEqual(drivers[0].rec.leftReasonKey, 'dismissed');
    assert.strictEqual(log.length, 1, 'no dutylog row was written');
    assert.strictEqual(log[0].rec.reason, 'left');
    assert.strictEqual(log[0].rec.by, 'u-boss', 'the dutylog row carries no author');
  });
});

test('a conversation note is saved whole, with its author and its time, and nothing else', () => {
  const l = load({ role: 'owner', cache: fullCache(),
                   fields: { 'pe-note': NOTE_TEXT, 'pe-kind': 'warned' } });
  l.People.mount();
  clickAct(l, 'peLogSave', { 'data-person': 'd-ravi' });
  return Promise.resolve().then(function () {
    assert.strictEqual(l.written.length, 1, 'the note was not saved');
    const rec = l.written[0].rec;
    assert.strictEqual(l.written[0].store, 'crewnotes');
    assert.strictEqual(rec.crewId, 'd-ravi');
    assert.strictEqual(rec.by, 'u-boss');
    assert.strictEqual(rec.kind, 'warned');
    assert(rec.at > 0, 'the note carries no time');
    const known = ['id', 'crewId', 'at', 'by', 'kind', 'text', 'scoreAt', 'starsAt', 'reviewsAt',
                   'createdAt', 'updatedAt'];
    assert.deepEqual(Object.keys(rec).filter((k) => known.indexOf(k) === -1), [],
                     'the note invented a field');
  });
});

/* THE PIN PATH. No digits in this file: the stub server returns an empty `pins`
 * map and what is asserted is the SHAPE of what the screen does — it sends only
 * the logins on that one bus, it does not mint for the whole roll, and the
 * source contains no path that writes a PIN anywhere that outlives the sheet. */
test('PINs are minted by bus, for that bus only, and only with the network', () => {
  const cache = fullCache();
  cache.drivers[1].busId = 'b1';                   // two crew on one bus
  // Both of them have a crew login, which is what a PIN is for. `u-self` is an
  // office login in every other test here, and it is the conductor's login in
  // this one: `registerRoster` only ever mints driver and conductor accounts.
  for (const u of cache.users) if (u.id === 'u-self') u.role = 'conductor';
  const l = load({ role: 'owner', cache: cache });
  l.People.tab('pins');
  const html = l.People.render(mdl(l, {}));
  assert(/Make PINs for this bus \(2\)/.test(html), 'the control does not say how many PINs it makes');
  l.People.mount();
  clickAct(l, 'pePins', { 'data-bus': 'b1' });
  const sent = l.posted.filter((p) => p.what === 'registerRoster')[0];
  assert(sent, 'nothing was sent to the server');
  assert.strictEqual(sent.crew.length, 2, 'the whole roll was minted instead of one bus');
  for (const c of sent.crew) assert(['driver', 'conductor'].indexOf(c.role) >= 0, 'a staff login was minted as crew');
  l.People.tab('crew');
});

test('a PIN is never written anywhere that outlives its sheet', () => {
  const src = stripComments(PE_JS);
  // Not stored, not logged, not toasted, not put on a record.
  for (const re of [/localStorage/, /sessionStorage/, /console\.(log|info|warn)/]) {
    assert(!re.test(src), 'the screen could persist or print a secret: ' + re);
  }
  // The one variable the digits ever live in reaches no toast, no record and no
  // row — only the sheet that shows them once.
  assert(!/toast\([^;]*mintedPins/.test(src), 'a PIN could reach a toast');
  assert(!/DB\.put\([^;]*mintedPins/.test(src), 'a PIN could reach a record');
  // Five: the declaration, the sheet that shows them, the mint that fills it,
  // the close that drops it, and the test seam that drops it too.
  assert.strictEqual((src.match(/mintedPins/g) || []).length, 5,
                     'the minted PINs are read in more places than the sheet, the mint and the drop');
  // The one variable that holds them is cleared when the sheet closes.
  assert(/mintedPins = null/.test(src), 'the minted PINs are never dropped');
  assert(/These PINs cannot be shown again/.test(src), 'closing the sheet does not say what it costs');
});

test('the staff role select offers only the roles this login may manage', () => {
  const sup = load({ role: 'supervisor', cache: fullCache() });
  sup.People.mount();
  clickAct(sup, 'peStaffNew', {});
  const body = sup.sheets[sup.sheets.length - 1].body;
  for (const yes of ['Storekeeper', 'Mechanic', 'Driver', 'Conductor']) {
    assert(new RegExp(yes).test(body), 'a supervisor cannot mint a ' + yes);
  }
  for (const no of ['Owner', 'Crew manager', 'Office']) {
    assert(!new RegExp('>' + no + '<').test(body), 'a supervisor was offered ' + no + ', which the server refuses');
  }
  const own = load({ role: 'owner', cache: fullCache() });
  own.People.mount();
  clickAct(own, 'peStaffNew', {});
  assert(/>Owner</.test(own.sheets[own.sheets.length - 1].body), 'the owner cannot mint an owner');
});

test('deleting a staff login is owner-only and never self, and the line says why', () => {
  const own = load({ role: 'owner', cache: fullCache() });
  own.People.tab('staff');
  const html = own.People.render(mdl(own, {}));
  assert(/You cannot delete your own login/.test(html), 'the owner\'s own row does not say why there is no control');
  const rows = html.split('class="v2row"');
  const mine = rows.filter((r) => /मालिक/.test(r))[0];
  assert(!/data-act="peStaffDel"/.test(mine), 'the owner was offered a delete on their own login');
  own.People.mount();
  clickAct(own, 'peStaffDel', { 'data-who': 'u-boss' });
  assert.deepEqual(own.posted.filter((p) => p.what === 'deleteStaff'), [], 'self-delete reached the server');

  const sup = load({ role: 'supervisor', cache: fullCache() });
  sup.People.tab('staff');
  assert(!/data-act="peStaffDel"/.test(sup.People.render(mdl(sup, {}))),
         'a supervisor was offered a delete control');
  sup.People.mount();
  clickAct(sup, 'peStaffDel', { 'data-who': 'u-office' });
  assert.deepEqual(sup.posted.filter((p) => p.what === 'deleteStaff'), [], 'a supervisor\'s delete reached the server');
  own.People.tab('crew');
  sup.People.tab('crew');
});

/* =====================================================================================================
 * 7. THE WORDS — every fixed word through w(), nothing hard-coded
 * ===================================================================================================== */

/* A pending label is drawn as "English [peId]" — marked, reportable, and the
 * whole point of the fallback. The English and its marker are removed as a
 * PAIR, so what is left is only English nothing ever marked. */
const MARKED = /([A-Za-z][^[\]\n]*?)\s*\[(pe[A-Za-z0-9]*|sc[A-Za-z0-9]*|[a-z][A-Za-z0-9]*)\]/g;

// Fixture data is not a word: registrations, document numbers, phone digits and
// the English in a coaching note the server wrote.
const DATA_PINNED = [/RJ\d+[A-Z]*\d*/g, /RJ14-20110012/g, /\d/g,
                     /On time all week/g, /Brake earlier at the Ajmer turn/g, /Coast to the stop/g,
                     new RegExp(NOTE_TEXT, 'g'), /A note about Suresh/g, /took the bus home/g,
                     /uploads/g, /jpg/g, /Dismissed/g, /gatepost/g, /Jaipur/g, /B\+/g];

function englishLeaks(html) {
  let text = html.replace(/<[^>]*>/g, '\n').replace(MARKED, ' ');
  for (const re of DATA_PINNED) text = text.replace(re, ' ');
  const bad = [];
  const re = /[A-Za-z][A-Za-z ']*/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const word = m[0].trim();
    if (word.length < 2) continue;
    bad.push(word);
  }
  return bad;
}

test('the English-leak detector rejects an unmarked word and allows a marked one', () => {
  assert.deepEqual(englishLeaks('<p>Crew score [peScore]</p>'), []);
  assert.deepEqual(englishLeaks('<p>रवि</p>'), []);
  assert(englishLeaks('<p>Crew score</p>').length === 1);
});

test('every fixed word reaches a Hindi reader through the table, marked when the Hindi is pending', () => {
  for (const role of ROLES) {
    const l = load({ role: role, lang: 'hi', user: role === 'office' ? 'u-office' : 'u-boss',
                     cache: fullCache({ noGps: role !== 'owner' && role !== 'supervisor' }) });
    for (const over of [{}, { params: { id: 'd-ravi' } }, { params: { id: 'd-gone' } }]) {
      const leaks = englishLeaks(l.People.render(mdl(l, over)));
      assert.deepEqual(leaks, [], role + ': unregistered English reached a Hindi reader: ' + leaks.join(', '));
    }
  }
});

test('the screen name is the ONE id the nav, the header and More read', () => {
  const l = load({ role: 'owner', cache: fullCache() });
  assert.strictEqual(l.win.Caps.SCREENS.people.word, 'scPeople');
  assert(/scPeople/.test(PE_JS), 'the screen does not register its own name');
  assert(l.win.W.ids().indexOf('scPeople') >= 0, 'scPeople is not in the one table');
});

test('no emoji anywhere in the screen or its stylesheet: Windows 7 draws a grey box', () => {
  const bad = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/u;
  assert(!bad.test(PE_JS), 'an emoji is in people.js');
  assert(!bad.test(PE_CSS), 'an emoji is in people.css');
});

test('every icon this screen draws is one of the 34 in the set', () => {
  const l = load({ role: 'owner', cache: fullCache() });
  const names = [];
  let m;
  const re = /draw\('([a-z]+)'/g;
  while ((m = re.exec(PE_JS)) !== null) if (names.indexOf(m[1]) < 0) names.push(m[1]);
  assert(names.length >= 6, 'no icons found to check');
  for (const n of names) {
    assert(!/missing/.test(l.win.icon(n)), n + ' is not in the icon set, so it draws the dotted square');
  }
});

/* =====================================================================================================
 * 8. THE CROSS-SLICE CONTRACT — People.crewIndex
 * ===================================================================================================== */

test('People.crewIndex is absent, deliberately, and the file records why rather than leaving a hole', () => {
  const l = load({ role: 'owner', cache: fullCache() });
  assert.strictEqual(typeof l.People.crewIndex, 'undefined',
                     'a half-built attribution index was exported');
  // The decision is recorded where the next builder will look for the function.
  for (const re of [/crewIndex/, /crew_trace/, /index_by_crew/, /itslookup/, /dutylog/]) {
    assert(re.test(PE_JS), 'the reason the index cannot be built names neither ' + re + ' nor its evidence');
  }
});

/* =====================================================================================================
 * 9. MUTATION — break each rule on purpose and watch the right check go red
 * ===================================================================================================== */

function mutate(from, to) {
  assert(PE_JS.indexOf(from) >= 0, 'the mutant target is no longer in people.js: ' + from);
  return PE_JS.split(from).join(to);
}

// Does the named check go red against this source? Returns the failure, or null.
function red(src, fn) {
  try { fn(); return null; } catch (e) { return e; }
}

test('MUTANT must fail: the documents rule written as a flat permission check, losing "or self"', () => {
  const src = mutate("    if (can(m, 'manageDrivers')) return true;\n    var u = user(m);\n    return !!(u && person.userId && person.userId === u.id);",
    "    return can(m, 'manageDrivers');");
  const e = red(src, function () {
    const l = load({ role: 'office', user: 'u-self', cache: fullCache({ noGps: true }), src: src });
    const own = l.People.render(mdl(l, { params: { id: 'd-self' } }));
    assert(/Driving licence/.test(own), 'a person cannot see their own documents');
  });
  assert(e, 'the or-self check did not notice a flat permission check');
});

test('MUTANT must fail: the documents rule written per ROUTE instead of per record', () => {
  const src = mutate("    if (!person) return false;\n    if (can(m, 'manageDrivers')) return true;",
    "    if (!person) return false;\n    if (can(m, 'crewPerf')) return true;");
  const e = red(src, function () {
    const l = load({ role: 'office', user: 'u-office', cache: fullCache({ noGps: true }), src: src });
    const html = l.People.render(mdl(l, { params: { id: 'd-ravi' } }));
    for (const [why, re] of DOC_LEAKS) assert(!re.test(html), 'the office is shown ' + why);
  });
  assert(e, 'the per-record check did not notice the gate widening to the screen declaration');
});

test('MUTANT must fail: the conversation log reaching the person it is about', () => {
  const src = mutate("    if (!person || !can(m, 'crewNote')) return false;\n    var mine = myCrew(m);\n    return !(mine && mine.id === person.id);",
    "    return !!(person && can(m, 'crewNote'));");
  const e = red(src, function () {
    const l = load({ role: 'office', user: 'u-self', cache: fullCache({ noGps: true }), src: src });
    const mine = l.People.render(mdl(l, { params: { id: 'd-self' } }));
    assert(!/A note about Suresh/.test(mine), 'a note reached the person it is about');
  });
  assert(e, 'the never-its-subject check did not notice the subject rule going away');
});

test('MUTANT must fail: the note WRITE path losing the subject rule', () => {
  const src = mutate("    if (!d || !canLog(m, d) || !D || writing) return;",
    "    if (!d || !D || writing) return;");
  const e = red(src, function () {
    const l = load({ role: 'owner', user: 'u-self', cache: fullCache(), src: src,
                     fields: { 'pe-note': 'written about myself', 'pe-kind': 'talked' } });
    l.People.mount();
    clickAct(l, 'peLogSave', { 'data-person': 'd-self' });
    assert.deepEqual(l.written, [], 'a note about oneself was saved');
  });
  assert(e, 'the write-path check did not notice the subject rule going away');
});

test('MUTANT must fail: salary drawn for a role without `money`', () => {
  const src = mutate("  function canSalary(m) { return can(m, SALARY_GATE); }",
    "  function canSalary(m) { return can(m, 'crewPerf'); }");
  const e = red(src, function () {
    const l = load({ role: 'crewmanager', cache: fullCache({ noGps: true }), src: src });
    const html = l.People.render(mdl(l, { params: { id: 'd-ravi' } }));
    assert(!/18,000/.test(html), 'the crew manager is shown the salary figure');
  });
  assert(e, 'the salary check did not notice the gate widening');
});

test('MUTANT must fail: the emergency numbers, the face photo and the exit fields outside the documents rule', () => {
  const src = mutate("    if (!canDocs(m, d)) {\n      return card(say('peDocs'), '<p class=\"pe-hidden\">' + esc(say('peDocsHidden')) + '</p>');\n    }",
    "    if (false) {\n      return card(say('peDocs'), '<p class=\"pe-hidden\">' + esc(say('peDocsHidden')) + '</p>');\n    }");
  const e = red(src, function () {
    const l = load({ role: 'office', user: 'u-office', cache: fullCache({ noGps: true }), src: src });
    const html = l.People.render(mdl(l, { params: { id: 'd-ravi' } }));
    assert(!/9700000044/.test(html), 'the emergency phone reached a login without manageDrivers');
    assert(!new RegExp('b'.repeat(32)).test(html), 'the face photo did');
  });
  assert(e, 'the rule-4 check did not notice the block opening up');
});

test('MUTANT must fail: the exit fields drawn for a login outside the rule', () => {
  const src = mutate("      if (canDocs(m, d)) {\n        var when = dateWords(d.leftAt);",
    "      if (true) {\n        var when = dateWords(d.leftAt);");
  const e = red(src, function () {
    const l = load({ role: 'office', user: 'u-office', cache: fullCache({ noGps: true }), src: src });
    const html = l.People.render(mdl(l, { params: { id: 'd-gone' } }));
    assert(!/took the bus home/.test(html), 'the exit note reached a login without manageDrivers');
  });
  assert(e, 'the exit-field check did not notice the HR record opening up');
});

test('MUTANT must fail: the field guard moved after [data-act], which is the shipped regression', () => {
  // Lifted out of its place and dropped in after the action is read — the exact
  // shape of the regression, not merely deleted.
  const src = mutate("    if (t.closest(FIELDS)) return;\n\n    var tabEl = t.closest('[data-tab]');",
    "    var tabEl = t.closest('[data-tab]');")
    .split("    var el = t.closest('[data-act]');")
    .join("    var el = t.closest('[data-act]');\n    if (t.closest(FIELDS)) return;");
  const moved = stripComments(src);
  const field = moved.indexOf('closest(FIELDS)');
  const act = moved.indexOf("closest('[data-act]')");
  assert(act < field, 'the mutation did not take');
  const e = red(src, function () {
    assert(field >= 0, 'the field guard is not there at all');
    assert(act >= 0 && field < act, 'the field guard is read AFTER [data-act], which is the regression');
  });
  assert(e, 'the source-order check did not notice the guard moving');

  // And the other half: a guard that is simply gone must redden the same check.
  const gone = stripComments(mutate("    if (t.closest(FIELDS)) return;\n", ''));
  const e2 = red(gone, function () {
    const f2 = gone.indexOf('closest(FIELDS)');
    assert(f2 >= 0, 'the field guard is not there at all');
  });
  assert(e2, 'the source-order check did not notice the guard being deleted');
});

test('MUTANT must fail: a part silently dropped from the score instead of stated', () => {
  const src = mutate("    body += '<p class=\"pe-parts\">' + esc(say('pePartsOf', { known: sc.known, total: sc.total })) + '</p>';",
    "    body += '';");
  const e = red(src, function () {
    const l = load({ role: 'crewmanager', cache: fullCache({ noGps: true }), src: src });
    const html = l.People.render(mdl(l, { params: { id: 'd-ravi' } }));
    assert(/Worked out from 2 of 4 parts/.test(html), 'the score did not say how many parts it came from');
  });
  assert(e, 'the parts-of check did not notice a silently blended score');
});

test('MUTANT must fail: an unknown part counted as a zero', () => {
  const src = mutate("      parts.push({ mark: 'clock', label: say('pePartAtt'), value: null, reason: say('peNoAtt') });",
    "      parts.push({ mark: 'clock', label: say('pePartAtt'), value: 0, line: say('peAttLate', { late: 0, days: 0 }), sub: 100 });");
  const e = red(src, function () {
    const cache = fullCache();
    cache.attendance = [];
    const l = load({ role: 'owner', cache: cache, src: src });
    const html = l.People.render(mdl(l, { params: { id: 'd-ravi' } }));
    assert(/No attendance on this device/.test(html), 'an empty attendance store read as a perfect record');
  });
  assert(e, 'the no-defaulted-denominator check did not notice an unknown reading as a zero');
});

test('MUTANT must fail: the score rebuilt on every render', () => {
  const src = mutate("    if (scoreMemo.key === key && scoreMemo.map) return scoreMemo.map;",
    "    if (false) return scoreMemo.map;");
  const e = red(src, function () {
    const l = load({ role: 'owner', cache: fullCache(), src: src });
    const m = mdl(l, {});
    l.People._reset();
    l.People.render(m); l.People.render(m);
    assert.strictEqual(l.People._stats().scoreBuilds, 1, 'the index was rebuilt per render');
  });
  assert(e, 'the once-per-signature check did not notice a per-render rebuild');
});

test('MUTANT must fail: an age put on a figure inside a row', () => {
  const src = mutate("      + '<span class=\"act\">' + fig(sc ? sc.score : null, { unit: '/100' }) + '</span></a>';",
    "      + '<span class=\"act\">' + fig(sc ? sc.score : null, { unit: '/100', at: Date.now() }) + '</span></a>';");
  const e = red(src, function () {
    const l = load({ role: 'owner', cache: fullCache(), src: src });
    const html = l.People.render(mdl(l, {}));
    assert.deepEqual(figureNotesInRows(html), [], 'a figure inside a row carries a note');
  });
  assert(e, 'the figure-note check did not notice an age inside a row');
});

test('MUTANT must fail: a fixed word hard-coded instead of registered', () => {
  const src = mutate("      return card(say('peDocs'), '<p class=\"pe-hidden\">' + esc(say('peDocsHidden')) + '</p>');",
    "      return card(say('peDocs'), '<p class=\"pe-hidden\">Documents are hidden</p>');");
  const e = red(src, function () {
    const l = load({ role: 'office', user: 'u-office', lang: 'hi', src: src,
                     cache: fullCache({ noGps: true }) });
    const leaks = englishLeaks(l.People.render(mdl(l, { params: { id: 'd-ravi' } })));
    assert.deepEqual(leaks, [], 'unregistered English reached a Hindi reader: ' + leaks.join(', '));
  });
  assert(e, 'the Hindi check did not notice a hard-coded English word');
});

test('MUTANT must fail: people.css pinning something to an edge', () => {
  const css = PE_CSS + '\n[data-v2] .pe-bar { position: fixed; bottom: 0; }\n';
  const e = red(css, function () {
    assert.deepEqual(declsOf(css).filter((d) => d.prop === 'position').map((d) => d.sel), []);
  });
  assert(e, 'the no-position check did not notice a fixed bar');
});

test('MUTANT must fail: people.css sizing the desk panel with a px literal', () => {
  const css = PE_CSS.replace('grid-template-columns: calc(var(--rail-w) * 2) minmax(0, 1fr);',
                             'grid-template-columns: 320px minmax(0, 1fr);');
  assert(css !== PE_CSS, 'the mutation did not take');
  assert(magicPx(css).length > 0, 'the magic-px check did not notice a 320px panel');
});

/* ===================================================================================================== */
Promise.all(later.map((t) => t.p.then(function () { note(t.name, null); },
                                      function (e) { note(t.name, e); })))
  .then(function () {
    console.log(fails ? '\n' + fails + ' failure(s)' : '\nall people checks pass');
    process.exit(fails ? 1 : 0);
  });

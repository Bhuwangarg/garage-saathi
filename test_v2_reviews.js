/* Tests for Reviews (#11) — v2/screens/reviews.js and v2/ui/reviews.css.
 * Run: node test_v2_reviews.js
 *
 * At the repo ROOT and not in v2/, because scripts/run-tests.py auto-discovers
 * test_*.js at the root only and does not recurse: a test in v2/ would never
 * run, and a test nobody runs is not a test.
 *
 * WHAT THIS FILE IS FOR. Three properties, and every case below is a face of
 * one of them.
 *
 *   1. THE OFFICE LOGIN SEES THE REVIEWS AND NOT THE PASSENGER.
 *      It has been wrong twice. `db6101f` fixed the office receiving no reviews
 *      at all — one check gated the review stores and the crew documents
 *      together, so the login whose only job is reading reviews got what a
 *      driver's phone gets. Then `DECISIONS.md §18`: `boardAt` was stripped,
 *      every office figure is computed from boarding time, and the screen read
 *      "Last 7 days 0, — average" for a year while a crew manager on identical
 *      data saw real numbers. So the cases here go red if a journey field or a
 *      label naming one ever appears, if `itslookup` is ever read, and — the
 *      §18 one — if a missing date is ever drawn as a number instead of said in
 *      a sentence. A permanent zero reads as "no complaints"; that is the bug.
 *
 *   2. ONE TAP MUST NOT SPREAD A WRONG ATTRIBUTION.
 *      The typed-name queue is the second-biggest friction in the business
 *      (`v2-ux.md §2.3`, 2–6 hours a week) and it is designed for one tap per
 *      name, which is only safe if the tap is deliberate and reversible. The
 *      cases go red if Claude's pick is ever pre-selected rather than
 *      pre-filled into a label, if a bulk confirm can be pressed before its
 *      rows are on screen, if an auto-confirmed row loses the three buttons
 *      that are its undo, or if the alias id this screen writes ever stops
 *      agreeing with `trace.js`.
 *
 *   3. FOUR THOUSAND ROWS ARE WINDOWED, AND NOTHING MEASURES A ROW.
 *      `DECISIONS.md §20` measured it: 2,384 rows drawn whole cost 410–619 ms
 *      on an i9, against 7–19 ms windowed, and the office runs Core 2 Duos.
 *      The cases go red if the list draws them all, if the scroll height stops
 *      being `rows × --row-h`, if a row grows a second line, or if anything
 *      reaches for `offsetHeight`.
 *
 * The screen is loaded in a vm context holding a stub `window` and nothing
 * else, in the shape of test_v2_duty.js, and every assertion is on the markup
 * STRING render() returns. reviews.css is read as TEXT with the brace-depth
 * reader from test_v2_shell.js. That is why the screen keeps its DOM wiring in
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

const CSS = read(V2('ui', 'reviews.css'));
const JS = read(V2('screens', 'reviews.js'));

/* ===================================================================================================
 * A SMALL CSS READER (the brace-depth reader from test_v2_shell.js / test_v2_attention.js)
 * =================================================================================================== */
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

test('the magic-px detector rejects a literal size and allows a border, outline and shadow', () => {
  for (const bad of ['height:72px', 'max-width:900px', 'padding:0 16px', 'gap:8px', 'font-size:15px'])
    assert(magicPx('.a{' + bad + '}').length > 0, 'detector missed: ' + bad);
  for (const fine of ['padding:0 var(--pad)', 'max-height:calc(var(--row-h) * 18)',
    'border-left:3px solid var(--line)', 'outline-offset:-2px', 'box-shadow:inset 0 -1px 0 var(--line)'])
    assert.deepEqual(magicPx('.a{' + fine + '}'), [], 'false positive: ' + fine);
});

test('the literal-colour detector rejects a hex and an hsl and allows a token', () => {
  for (const bad of ['color:#fff', 'background:hsl(30 20% 9%)', 'color:rgba(0,0,0,.5)'])
    assert(literalColour('.a{' + bad + '}').length > 0, 'detector missed: ' + bad);
  assert.deepEqual(literalColour('.a{color:var(--ink-dim);background:var(--surface-raised)}'), []);
});

/* ===================================================================================================
 * 1. reviews.css — no colour, no size, no position, and the ONE rule windowing depends on
 * =================================================================================================== */

test('reviews.css has declarations to check at all: an empty file would pass every rule below vacuously', () => {
  assert(declsOf(CSS).length >= 30, 'only ' + declsOf(CSS).length + ' declarations');
});

test('reviews.css sizes everything from the tokens: no px literal outside border, outline and shadow', () => {
  assert.deepEqual(magicPx(CSS), []);
});

test('reviews.css declares no colour of its own — every colour is a token reference', () => {
  assert.deepEqual(literalColour(CSS), []);
});

test('every selector in reviews.css starts with [data-v2], so the file is inert in the live app', () => {
  assert.deepEqual(selectorsOf(CSS).filter((s) => s.indexOf('[data-v2]') !== 0), []);
});

test('reviews.css is inside the Chrome 109 floor and adds no animation', () => {
  const src = stripComments(CSS);
  for (const [why, re] of [['oklch/oklab', /\bokl(ch|ab)\s*\(/], ['color-mix', /\bcolor-mix\s*\(/],
    ['@starting-style', /@starting-style/], ['subgrid', /grid-template-(rows|columns)\s*:\s*subgrid/],
    ['text-wrap: balance', /text-wrap\s*:\s*(balance|pretty)/], ['nesting', /^\s*&[\s.:>+~[{]/m],
    ['@scope', /@scope[\s{]/], ['light-dark()', /\blight-dark\s*\(/],
    ['an animation', /@keyframes|\banimation\s*:/]])
    assert(!re.test(src), why + ' is past the floor and is in reviews.css');
  assert.deepEqual(rulesOf(CSS).filter((r) => r.nested).map((r) => r.selector), [], 'a nested rule');
});

test('reviews.css pins nothing to any edge: no position declaration, so the list cannot grow a second fixed layer', () => {
  assert.deepEqual(declsOf(CSS).filter((d) => d.prop === 'position').map((d) => d.sel + ' { position: ' + d.val + ' }'), []);
});

/* THE ROW-HEIGHT RULE. The screen computes the spacing above and below the
 * window as `calc(var(--row-h) * n)` and never measures a row, so a row that
 * wraps to two lines puts every row below it in the wrong place. nowrap +
 * ellipsis is load-bearing here, not decoration. */
test('reviews.css keeps every list row to one line: the title column is nowrap and clipped, which is what rows x --row-h assumes', () => {
  const t = rulesOf(CSS).filter((r) => /\.rv-row \.t|\.rv-q \.t/.test(r.selector));
  assert(t.length >= 1, 'no rule sizes the row title column');
  const d = t[0].decls;
  assert.equal(d['white-space'], 'nowrap', 'the row title may wrap, which breaks the window arithmetic');
  assert.equal(d['text-overflow'], 'ellipsis');
  assert.equal(d.overflow, 'hidden');
});

test('reviews.css gives the list a scroll container whose height is counted in rows, not in pixels', () => {
  const list = rulesOf(CSS).filter((r) => r.selector === '[data-v2] .rv-list')[0];
  assert(list, 'no .rv-list rule');
  assert(/calc\(\s*var\(--row-h\)/.test(list.decls['max-height'] || ''),
         'the window height must be counted in --row-h, got ' + list.decls['max-height']);
  assert.equal(list.decls['overflow-y'], 'auto');
});

/* ===================================================================================================
 * 2. THE SOURCE, READ STATICALLY — the four rules a screen breaks first
 * =================================================================================================== */

const JS_CODE = stripComments(JS).replace(/\/\/[^\n]*/g, '');

/* THE PASSENGER-JOURNEY LOOKUP DOES NOT EXIST ON THIS SCREEN. Not disabled —
 * absent, and no label anywhere names one of its words (§3.2,
 * `v2-foundation-ui.md §6.3`). Checked in the SOURCE and not only in one
 * rendered state, because a field that exists behind a role check is a field
 * one wrong role check away from the office. */
test('the screen never reads itslookup: the store that carries a PNR, a seat and a journey is not in this file at all', () => {
  assert(!/itslookup/.test(JS_CODE), 'reviews.js reads itslookup');
});

test('no label on this screen names a PNR, a ticket id, a seat, a fare or a board point — for any role', () => {
  const words = JS.slice(JS.indexOf('var WORDS = {'), JS.indexOf('var registered = false'));
  for (const bad of [/\bPNR\b/i, /ticket\s*id/i, /\bseat\b/i, /\bfare\b/i, /board(ing)?\s*point/i,
                     /date of journey/i, /\bамount\b/i]) {
    assert(!bad.test(words), 'a registered label names a journey field: ' + bad);
  }
});

test('and no journey field is read off any record except the boarding time §18 is about', () => {
  /* The server strips five of §3.2's seven journey fields today; `boardAt` is
   * restored (§18) and `doj` is not stripped at all. So the screen reading them
   * is the only thing standing between the office and a passenger's travel
   * record: it reads `boardAt`, which is what §18 is a decision about, and
   * nothing else. A complaint's date is the CASE's `createdAt`. */
  for (const f of ['pnr', 'tin', 'seats', 'fare', 'amount', 'doj']) {
    assert(!new RegExp('\\.' + f + '\\b').test(JS_CODE), 'the screen reads a journey field: ' + f);
  }
  assert(/\.createdAt\b/.test(JS_CODE), 'the complaint has lost the one date that is its own');
  assert(/\.boardAt\b/.test(JS_CODE), 'the boarding time §18 is about is not read at all');
});

/* The exact line a shipped regression was missing: tapping a count field
 * navigated away instead of letting somebody type. predeploy-gate.sh:1416
 * checks the ordering statically across every screen; this repeats it here so
 * the screen's own suite fails too, rather than only the gate. */
test('mount() guards a form control BEFORE it reads [data-act], in that order', () => {
  assert(JS.indexOf("input, select, textarea, label, .num") >= 0, 'the field selector is not in the file');
  const guard = JS_CODE.search(/closest\(FIELDS\)/);
  const act = JS_CODE.search(/closest\('\[data-act\]'\)/);
  assert(guard >= 0, 'no field guard');
  assert(act >= 0, 'no [data-act] read');
  assert(guard < act, 'the field guard runs AFTER the data-act read, which is not a guard');
});

test('mount() installs ONE delegated click listener, not one per row', () => {
  const clicks = (JS_CODE.match(/addEventListener\(\s*'click'/g) || []).length;
  assert.equal(clicks, 1, 'found ' + clicks + " addEventListener('click') calls");
});

/* NOTHING MEASURES A ROW (`v2-foundation-ui.md §2.3` rules 2 and 6). The window
 * offset is read from --row-h ONCE, off the scroll container, which is what
 * gallery.html's windowed bed does. */
test('nothing measures a row: no offsetHeight, no getBoundingClientRect, and getComputedStyle is read once off the container', () => {
  assert(!/offsetHeight|offsetWidth|getBoundingClientRect|clientHeight/.test(JS_CODE),
         'something measures an element');
  const gcs = (JS_CODE.match(/getComputedStyle/g) || []).length;
  assert.equal(gcs, 1, 'getComputedStyle appears ' + gcs + ' times; once, on the container, is the budget');
});

test('render builds one string and inserts nothing itself: no appendChild, no innerHTML, no createElement', () => {
  assert(!/appendChild|innerHTML|insertAdjacentHTML|createElement/.test(JS_CODE),
         'the screen touches the DOM instead of returning a string');
});

/* THE ID RULE IS COPIED INTO THIS SCREEN, SO IT IS PINNED TO ITS ORIGINAL.
 * `_guard_rbalias` refuses a push whose id is not `_alias_id(name, regNo)`, so
 * the screen has to build the id; `trace.js` and `sync_server.py` are the two
 * copies `test_rbalias.py` keeps in step, and this is the third. */
test('the alias id this screen writes agrees with trace.js, character for character', () => {
  const T = require('./trace.js');
  const Reviews = require('./v2/screens/reviews.js');
  const cases = [['Kesar Dvr', 'mp44zf2538'], ['  Jitu  Ji!', 'RJ 09 PA 6141'],
                 ['Mukesh Sharma', 'MP44ZD471'], ['Staff', 'RJ09PA6141'],
                 ['A', 'xx1a1'], ['Anil  Jhansi', 'MP-44-ZD-0471']];
  for (const [n, r] of cases) {
    assert.equal(Reviews.aliasId(n, r), T.aliasId(n, r), 'alias id differs for ' + n + ' / ' + r);
    assert.equal(Reviews.normReg(r), T.normReg(r), 'normReg differs for ' + r);
  }
  assert.equal(Reviews.parseLocal('2026-10-07 06:15:00'), T.parseLocal('2026-10-07 06:15:00'));
  assert.equal(Reviews.parseLocal('Jaipur Sindhi Camp'), null,
               'an unreadable boarding time must be NULL, not a date');
});

/* NO NEW FIELD ON ANY RECORD. Under whole-record last-write-wins a field v2
 * invents is erased the next time a v1 device writes that record, and
 * `_guard_rbalias` strips Claude's `auto`, `reason` and `evidence` on a human
 * write — so the screen writes four fields and the record's own identity. */
test('a human confirm writes rbalias and nothing else on it: four decided fields plus the record identity', () => {
  const Reviews = require('./v2/screens/reviews.js');
  const rec = Reviews.aliasRecord({ id: 'al-RJ09PA6126-brijesh', typed: 'Brijesh', reg: 'RJ09PA6126',
                                    role: 'driver' }, 'crew', 'd-brij', { id: 'u-off' });
  assert.deepEqual(Object.keys(rec).sort(),
                   ['crewId', 'decidedAt', 'decidedBy', 'id', 'name', 'regNo', 'role', 'status']);
  assert.equal(rec.decidedBy, 'u-off');
  assert(!('auto' in rec) && !('reason' in rec) && !('evidence' in rec),
         "a human write must not carry Claude's auto, reason or evidence");
  const gen = Reviews.aliasRecord({ id: 'x', typed: 'Staff', reg: 'RJ09PA6141', role: 'driver' },
                                  'generic', 'd-brij', { id: 'u-off' });
  assert.equal(gen.crewId, null, '"not a person" must point at nobody, whatever was passed');
});

/* THE CROSS-SLICE ANSWER, RECORDED. Today (#1) reads `Reviews.crewIndex` and
 * falls back to an error state with a Retry when nobody provides it. The answer
 * is that it cannot be built in the client — two of the trace's seven inputs do
 * not reach the logins that reach this screen — and the requirement is that the
 * answer be WRITTEN DOWN rather than left as a missing function. */
test('Reviews.crewIndex is not exported, and the file says why in so many words', () => {
  const Reviews = require('./v2/screens/reviews.js');
  assert.notEqual(typeof Reviews.crewIndex, 'function',
                  'crewIndex is exported: if it can now be built, this check and the comment must change together');
  assert(/crewIndex/.test(JS), 'the decision about crewIndex is not recorded in the file at all');
  assert(/index_by_crew|seven/.test(JS), 'the recorded reason does not name the server trace');
});

/* Every registered id has a consumer, and every {n} is passed the count. A
 * word nobody draws is a Hindi string the one Hindi speaker on this project is
 * asked for and nobody reads (`DECISIONS.md §21`); a {n} left in the values
 * object instead of the count argument is BLANKED by words.js form(), which is
 * how "Confirm  high-confidence names" got onto a button. */
test('no registered word is dead copy, and every word carrying {n} is given the count as its own argument', () => {
  const words = JS.slice(JS.indexOf('var WORDS = {'), JS.indexOf('var registered = false'));
  const after = JS.slice(JS.indexOf('var registered = false'));
  const ids = (words.match(/^\s{4}([a-zA-Z][A-Za-z0-9]*): \{/gm) || []).map((s) => s.trim().replace(': {', ''));
  assert(ids.length > 40, 'only ' + ids.length + ' ids found; the reader is broken');
  const dead = ids.filter((id) => !new RegExp("'" + id + "'").test(after) && id !== 'scReviews');
  assert.deepEqual(dead, [], 'registered but never drawn');
  for (const id of ids) {
    const v = words.slice(words.indexOf(id + ': {'));
    if (!/^[^\n]*\{n\}/.test(v)) continue;
    const call = new RegExp("say\\('" + id + "'\\s*,[^)]*,[^)]*\\)");
    assert(call.test(after), id + ' carries {n} but is never called with the count as the third argument');
  }
});

/* The set is AT ITS CAP of 34 (`v2-foundation-ui.md`), so a screen may use a
 * mark and may not invent one. An unknown name draws a dotted square, which is
 * visible on screen and invisible to every other check. */
test('every mark this screen draws is one of the 34, and it adds none', () => {
  const icons = read(V2('ui', 'icons.js'));
  const set = new Set([...icons.matchAll(/^\s{4}'?([a-z]+)'?:\s*'M/gm)].map((m) => m[1]));
  assert(set.size >= 30, 'the icon reader found only ' + set.size + ' marks');
  const used = [...JS_CODE.matchAll(/draw\('([a-z]+)'/g)].map((m) => m[1]);
  assert(used.length > 0, 'the screen draws no mark at all');
  assert.deepEqual(used.filter((n) => !set.has(n)), [], 'a mark this screen draws is not in the set');
  assert(!/ICONS\s*\[|ICONS\./.test(JS_CODE), 'the screen reaches into the icon table');
});

test('the screen adds no emoji: Windows 7 renders one as a grey box', () => {
  const ranges = [[0x1F000, 0x1FAFF], [0x2600, 0x27BF], [0xFE0F, 0xFE0F], [0x2B00, 0x2BFF]];
  for (const ch of JS + CSS) {
    const c = ch.codePointAt(0);
    assert(!ranges.some(([a, b]) => c >= a && c <= b), 'emoji U+' + c.toString(16) + ' in the slice');
  }
});

/* ===================================================================================================
 * THE SANDBOX
 * =================================================================================================== */

const SRC = ['ui/icons.js', 'ui/words.js', 'ui/states.js', 'fmt.js', 'caps.js',
             'router.js', 'screens/reviews.js'];

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
    async all(store) { return Object.keys(data[store] || {}).map((k) => clone(data[store][k])); },
    async put(store, obj) {
      (data[store] || (data[store] = {}))[obj.id] = clone(obj);
      this.writes.push({ store: store, rec: clone(obj) });
      return obj;
    },
    _rows(store) { return Object.keys(data[store] || {}).map((k) => clone(data[store][k])); },
    dirtySnapshot() { return new Set(); },
    clearDirty() {},
  };
}

const T = Date.UTC(2026, 10, 6, 9, 0, 0);   // 6 Nov 2026
const RealDate = Date;
function fixedDate(t) {
  function D() {
    if (arguments.length === 0) return new RealDate(t);
    if (arguments.length === 1) return new RealDate(arguments[0]);
    /* Spread, not seven named parameters: `new Date(y, m, d, h, mi, s, undefined)`
     * is an Invalid Date, so a six-argument construction through a stub that
     * always passes seven silently turns every parsed boarding time into NaN —
     * which looks exactly like the §18 bug this suite is here to catch. */
    return new (Function.prototype.bind.apply(RealDate, [null].concat([].slice.call(arguments))))();
  }
  D.prototype = RealDate.prototype;
  D.now = () => t;
  D.parse = RealDate.parse;
  D.UTC = RealDate.UTC;
  return D;
}

function load(o) {
  o = o || {};
  const html = { lang: o.lang || 'en', getAttribute: () => null, setAttribute: () => {} };
  const toasts = [], sheets = [], clicks = [], inputs = [], scrolls = [], gone = [], mounted = [];
  const db = fakeDB(o.db);
  const sandbox = {
    navigator: { onLine: true, userAgent: 'node', language: 'en' },
    location: { href: 'http://localhost/v2/', pathname: '/v2/' },
    document: {
      documentElement: html,
      title: '',
      addEventListener: function (type, fn) {
        if (type === 'click') clicks.push(fn);
        if (type === 'input') inputs.push(fn);
        if (type === 'scroll') scrolls.push(fn);
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
    Math: Math, JSON: JSON, DB: db,
    V2: {
      openSheet: function (title, body) { sheets.push({ title: title, body: body }); return { dialog: true }; },
      closeSheet: function () {},
      confirmDialog: function () { return Promise.resolve(true); },
      toast: function (text, opts) { toasts.push({ text: text, kind: opts && opts.kind }); },
    },
    Shell: { mount: function (id, p) { mounted.push({ id: id, params: p }); } },
    Cache: { load: function () { return Promise.resolve({}); }, sig: function () { return ''; } },
    Sync: { info: function () { return { lastSyncAt: T - 3600000 }; } },
  };
  sandbox.window = sandbox;
  // The one click handler mount() installs, reachable by the cases below: the
  // tests drive the screen through its own listener rather than past it.
  sandbox.__clickFns = clicks;
  sandbox.__inputFns = inputs;
  const ctx = vm.createContext(sandbox);
  for (const f of SRC) vm.runInContext(read(V2(f)), ctx, { filename: V2(f) });
  /* THE SHELL MOUNTS THE SCREEN, so the suite does too.
   *
   * Until INTEGRATION-NOTES 17 was fixed, `reviews.js` called its own `mount()`
   * at script load and this loader relied on that: the listener was simply
   * there. That load-time call WAS the defect — a listener installed before
   * `boot.js` had created `S`, and never removed for the whole session — so
   * `Shell.mount` now calls `mount()` on the way in and `unmount()` on the way
   * out, and a screen's load registers and nothing more. This line stands where
   * the frame's call stands. The checks below are unchanged. */
  if (sandbox.Reviews && typeof sandbox.Reviews.mount === 'function') sandbox.Reviews.mount();
  const realGo = sandbox.Router.go;
  sandbox.Router.go = function (id, params) { gone.push({ id: id, params: params }); return true; };
  sandbox.Router._realGo = realGo;
  // Module state (tab, filter, search, window, bus) is per-load, so each case
  // starts from the screen's own defaults rather than the last case's.
  sandbox.Reviews.tab('reviews');
  sandbox.Reviews.filter('all');
  sandbox.Reviews.search('');
  sandbox.Reviews.windowFirst(0);
  sandbox.Reviews.busFilter(null);
  return { win: sandbox, Reviews: sandbox.Reviews, db: db, toasts: toasts, sheets: sheets,
           clicks: clicks, inputs: inputs, scrolls: scrolls, gone: gone, mounted: mounted };
}

/* ---------------------------------------------------------------------------
 * THE FIXTURE. One bus, one service, one night, three typed names, four
 * reviews. `withDates` is the §18 switch: the SAME data with and without a
 * boarding time, which is the pair the office/crew-manager split turns on.
 * ------------------------------------------------------------------------- */
const REG = 'RJ09PA6126';
const BOARD = '2026-11-02 21:30:00';

function review(n, extra) {
  return Object.assign({
    id: 'rv-' + n, reviewId: String(n), routeId: 'r-1', source: 'Jaipur', dest: 'Indore',
    boardAt: BOARD, stars: 2, comment: 'Driver drove rashly and we left late',
    tags: ['staff'], submittedOn: '2026-11-03', reviewStatus: 'open', replied: false
  }, extra || {});
}

function fixture(o) {
  o = o || {};
  const dated = o.withDates !== false;
  const strip = (r) => {
    if (dated) return r;
    // Exactly what `redact_for` did to the office before §18: the journey taken
    // out and the record marked partial.
    const c = Object.assign({}, r);
    delete c.boardAt;
    c._redacted = true;
    return c;
  };
  const n = o.reviews == null ? 4 : o.reviews;
  const rbreviews = [];
  for (let i = 1; i <= n; i++) {
    rbreviews.push(strip(review(i, { stars: i === 1 ? 1 : (i === 4 ? 5 : 2) })));
  }
  return {
    rbreviews: rbreviews,
    rbcomplaints: [{ id: 'cs-77', caseNumber: '77', doj: '2026-11-02 21:30:00',
                     createdAt: '2026-11-03 08:00:00', status: 'open', issue: 'Bus left early',
                     source: 'Jaipur', dest: 'Indore', resolution: '', refundStatus: '', notes: [] }],
    rbservices: [{ id: 's-4471', routeIds: ['r-1'], startTime: '21:00' }],
    rbassign: [{ id: 'as-1', serviceId: 's-4471', date: '2026-11-02',
                 obs: [{ at: Date.UTC(2026, 10, 2, 16, 0), vehicleNo: REG,
                         driver1: 'BRIJESH K', driver2: 'Kesar Dvr', cro: 'Staff' }] }],
    rbreviewai: [{ id: 'ai-rv-1', rv: 'rv-1', faults: ['driver'], topics: ['rash driving', 'late start'],
                   safety: true, severity: 2, en: 'the comment names the driving, and the bus left 40 minutes late',
                   hi: 'HINDI EVIDENCE' }],
    rbaliasai: o.aliasai || [
      { id: 'al-RJ09PA6126-brijesh_k', pick: 'd-brij', conf: 'high', generic: false,
        reason: 'name matches and the duty log agrees', nights: 14, onBus: 14 },
      { id: 'al-RJ09PA6126-kesar_dvr', pick: 'd-kesar', conf: 'medium', generic: false,
        reason: 'two drivers share this bus', nights: 6, onBus: 3 },
      { id: 'al-RJ09PA6126-staff', pick: null, conf: 'high', generic: true, reason: 'not a name', nights: 9 }
    ],
    rbalias: o.alias || [],
    drivers: [{ id: 'd-brij', name: 'Brijesh', role: 'driver' },
              { id: 'd-kesar', name: 'Kesar Singh', role: 'driver' },
              { id: 'd-anil', name: 'Anil Jhansi', role: 'conductor' }],
    crewnotes: [], incidents: []
  };
}

function S(role, o) {
  o = o || {};
  return Object.assign({
    user: { id: 'u-' + role, role: role },
    cache: o.cache || fixture(o),
    density: o.density || 'yard',
    offline: !!o.offline, stale: !!o.stale
  }, o.extra || {});
}

// The words a journey field would be named by, anywhere in the DOM.
const JOURNEY = [/\bPNR\b/i, /ticket\s*id/i, /\bseat\b/i, /\bfare\b/i, /board(ing)?\s*point/i,
                 /date of journey/i, /TR\d{4}/, /TIN-/];

function noJourney(html, where) {
  for (const re of JOURNEY) {
    assert(!re.test(html), where + ' names a journey field: ' + re);
  }
}

/* ===================================================================================================
 * 3. HOW THE OFFICE LOGIN IS SCOPED — the layer that has been wrong twice
 * =================================================================================================== */

test('the office reaches this screen and the four roles whose reviews are their own on Me do not', () => {
  const { win } = load();
  for (const role of ['owner', 'supervisor', 'crewmanager', 'office']) {
    assert(win.Caps.can(role, 'crewReviews'), role + ' cannot reach Reviews');
  }
  for (const role of ['store', 'mechanic', 'driver', 'conductor']) {
    assert(!win.Caps.can(role, 'crewReviews'), role + ' can reach Reviews');
  }
  assert.deepEqual(win.Caps.SCREENS.reviews.declares, ['crewReviews'],
                   'the screen must declare the capability it needs; a screen that declares nothing is unreachable by everybody');
});

test('the office gets the reviews, the complaints and Claude\u2019s fault reading, which is what the login is for', () => {
  const { Reviews } = load();
  const html = Reviews.render(S('office'));
  assert(/Driver drove rashly/.test(html) === false, 'the comment belongs in the opened review, not the row');
  const m = Reviews.model(S('office'));
  assert.equal(m.reviewTotal, 4, 'the office received no reviews: that is db6101f all over again');
  assert.equal(m.complaintTotal, 1);
  assert(/Reviews/.test(html) && /Complaints/.test(html));
});

test('THE CHECK FOR THE LEAK: no journey field and no label naming one reaches the office, in the list or in the opened review', () => {
  const { Reviews, win, sheets } = load();
  for (const role of ['office', 'crewmanager', 'owner', 'supervisor']) {
    for (const density of ['yard', 'desk']) {
      for (const tab of ['reviews', 'complaints', 'names']) {
        Reviews.tab(tab);
        for (const filt of ['all', 'low', 'conflict', 'untraced']) {
          Reviews.filter(filt);
          noJourney(Reviews.render(S(role, { density: density })), role + '/' + density + '/' + tab);
        }
      }
    }
    Reviews.tab('reviews');
    Reviews.filter('all');
    // And the opened review, which is where a lookup control would have lived —
    // in BOTH places it is drawn: the yard sheet and the desk panel.
    win.S = S(role);
    Reviews.openAt(null);
    Reviews.render(S(role, { density: 'yard' }));      // the next press opens a sheet
    sheets.length = 0;
    callReviewOpen(win, 'rv-1');
    assert(sheets.length === 1, 'the review did not open for ' + role);
    noJourney(sheets[0].title + sheets[0].body, role + "'s opened review");
    assert(!/look\s*up/i.test(sheets[0].body), 'a lookup control exists for ' + role);

    Reviews.render(S(role, { density: 'desk' }));      // the next press fills the panel
    callReviewOpen(win, 'rv-1');
    const desk = Reviews.render(S(role, { density: 'desk' }));
    assert(/class="rv-panel"/.test(desk), 'the desk review did not open as a panel for ' + role);
    noJourney(desk, role + "'s desk panel");
    assert(!/look\s*up/i.test(desk), 'a lookup control exists in ' + role + "'s panel");
    Reviews.openAt(null);
  }
});

/* The sheet is opened through the screen's own click path, so the test cannot
 * reach past the listener to a private function. */
function callReviewOpen(win, id) {
  findClick(win)({
    target: {
      closest: (sel) => {
        if (sel === 'input, select, textarea, label, .num') return null;
        if (sel === '[data-review]') return { getAttribute: () => id };
        return null;
      }
    },
    preventDefault() {}
  });
}
function findClick(win) {
  // The one listener mount() installed, captured off the stub document.
  return win.__clickFns[win.__clickFns.length - 1];
}

test('the office line stands where the journey would have been, so a reader stops looking rather than believing the data failed', () => {
  const { win, sheets } = load();
  win.S = S('office', { withDates: false });
  callReviewOpen(win, 'rv-1');
  assert.equal(sheets.length, 1);
  assert(/Passenger ticket details are not part of this screen\./.test(sheets[0].body),
         'the office review does not say why the ticket is absent');
});

test('the name queue is absent for the office — it is manageDrivers, which the office does not hold', () => {
  const { Reviews, win } = load();
  assert(!win.Caps.can('office', 'manageDrivers'), 'the office must not hold manageDrivers');
  const m = Reviews.model(S('office'));
  assert.deepEqual(m.tabs, ['reviews', 'complaints'], 'the office is offered the name queue');
  assert.equal(m.queueTotal, null);
  const html = Reviews.render(S('office'));
  assert(!/Names to confirm/.test(html), 'the office is shown the name queue tab');
  assert(!/Yes, Brijesh|Not a person|Someone else/.test(html), 'the office is shown a queue control');
  // A control a person may not use is ABSENT, never disabled.
  assert(!/aria-disabled/.test(html), 'a control is disabled rather than absent');
});

test('the crew manager DOES get the queue and the office does not, on identical data', () => {
  const { Reviews } = load();
  assert.deepEqual(Reviews.model(S('crewmanager')).tabs, ['reviews', 'complaints', 'names']);
  assert.deepEqual(Reviews.model(S('office')).tabs, ['reviews', 'complaints']);
});

/* §3.1: at desk the review opens in the remaining column as a PANEL and not a
 * <dialog>, "same markup, no <dialog>, because at desk the list and the review
 * are read together". Same markup means one builder, so the two cannot drift. */
test('at desk the review is a panel beside the list, not a dialog; at yard it is a sheet', () => {
  const { Reviews, win, sheets } = load();
  win.S = S('crewmanager');
  Reviews.render(S('crewmanager', { density: 'desk' }));
  callReviewOpen(win, 'rv-1');
  assert.deepEqual(sheets, [], 'a desk press opened a dialog over a list it is meant to be read beside');
  const desk = Reviews.render(S('crewmanager', { density: 'desk' }));
  assert(/class="rv-panel"[\s\S]*class="rv-sheet"/.test(desk), 'the panel does not reuse the sheet markup');
  assert(/rv-list[\s\S]*rv-panel/.test(desk), 'the panel is not beside the list, after it');
  // The list is still there: that is the whole reason for the panel.
  assert(/class="v2row rv-row"/.test(desk), 'the panel replaced the list');

  Reviews.render(S('crewmanager', { density: 'yard' }));
  callReviewOpen(win, 'rv-1');
  assert.equal(sheets.length, 1, 'a yard press did not open a sheet');
  assert(!/rv-panel/.test(Reviews.render(S('crewmanager', { density: 'yard' }))),
         'a 360px phone drew two columns');
  Reviews.openAt(null);
});

test('changing tab closes the desk panel: the open review is not on the complaints tab', () => {
  const { Reviews, win } = load();
  win.S = S('crewmanager');
  Reviews.render(S('crewmanager', { density: 'desk' }));
  callReviewOpen(win, 'rv-1');
  assert.equal(Reviews.openAt(), 'rv-1');
  Reviews.tab('complaints');
  assert.equal(Reviews.openAt(), null, 'the panel kept a review the list no longer holds');
  Reviews.tab('reviews');
});

/* ===================================================================================================
 * 4. DECISIONS.md §18 — A MISSING DATE IS A SENTENCE, NEVER A ZERO
 * =================================================================================================== */

test('THE §18 CHECK: with boardAt absent the screen SAYS the dates are not available instead of drawing a number', () => {
  const { Reviews } = load();
  const m = Reviews.model(S('office', { withDates: false }));
  assert.equal(m.dateless, true, 'the screen did not notice that no review carries a date');
  const html = Reviews.render(S('office', { withDates: false }));
  assert(/Review dates are not available to this login/.test(html),
         'a login with no dates is shown no sentence saying so');
  // A permanent zero reads as "no complaints", and that is the defect.
  assert(!/data-state="zero"/.test(html), 'a figure computed from a date it does not hold reads as zero');
  // The rows keep their dash, because a review whose date is unknown is unknown.
  assert(/\u2014/.test(html), 'an unknown date must still read as a dash in the row');
  assert.equal(m.reviewTotal, 4, 'the reviews themselves must still arrive');
});

test('and the two filters computed from a boarding time are ABSENT rather than two zeroes', () => {
  const { Reviews } = load();
  assert.deepEqual(Reviews.model(S('office', { withDates: false })).filters, ['all', 'low'],
                   'Conflict and Untraced are offered to a login that cannot compute either');
  const html = Reviews.render(S('office', { withDates: false }));
  assert(!/data-filter="untraced"/.test(html) && !/data-filter="conflict"/.test(html));
  // Low is 1-2 stars and needs no date at all, so it stays and still works.
  assert(/data-filter="low"/.test(html), 'a filter that needs no date was dropped with the ones that do');
  Reviews.filter('low');
  assert.equal(Reviews.model(S('office', { withDates: false })).total, 3, 'the star filter stopped working');
  Reviews.filter('all');
});

test('THE PAIR: the same data WITH a boarding time draws real dates, the four filters and no sentence', () => {
  const { Reviews } = load();
  const m = Reviews.model(S('crewmanager'));
  assert.equal(m.dateless, false);
  assert.deepEqual(m.filters, ['all', 'low', 'conflict', 'untraced']);
  const html = Reviews.render(S('crewmanager'));
  assert(!/Review dates are not available/.test(html), 'a login that HAS the dates is told it has not');
  assert(/2 Nov/.test(html), 'the row does not carry the date it has');
});

test('one review missing its date is a dash, not a sentence: unknown per record and unknown per login are different claims', () => {
  const { Reviews } = load();
  const cache = fixture();
  delete cache.rbreviews[0].boardAt;         // one of four
  const m = Reviews.model(S('crewmanager', { cache: cache }));
  assert.equal(m.dateless, false, 'one unknown date was read as a login-wide absence');
  const html = Reviews.render(S('crewmanager', { cache: cache }));
  assert(!/Review dates are not available/.test(html));
  assert(/\u2014/.test(html), 'the one dateless row lost its dash');
});

test('a dateless review sorts LAST and keeps a stable order, because unknown is not oldest', () => {
  const { Reviews } = load();
  const cache = fixture();
  delete cache.rbreviews[3].boardAt;
  const rows = Reviews.model(S('crewmanager', { cache: cache })).rows;
  assert.equal(rows[rows.length - 1].id, 'rv-4');
  assert.equal(rows[rows.length - 1].at, null);
});

test('a dateless review is not counted as Untraced: "we were not sent the date" is not "nobody could be found"', () => {
  const { Reviews } = load();
  Reviews.filter('untraced');
  assert.equal(Reviews.model(S('office', { withDates: false })).total, 0,
               'four thousand reviews reading Untraced is §18 in a new shape');
  Reviews.filter('all');
});

/* ===================================================================================================
 * 5. FOUR THOUSAND WINDOWED ROWS (DECISIONS.md §20)
 * =================================================================================================== */

function manyReviews(n) {
  const cache = fixture({ reviews: 0 });
  const day = 86400000;
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(2026, 9, 1) + i * 600000);
    const pad = (x) => (x < 10 ? '0' : '') + x;
    cache.rbreviews.push(review(i + 1, {
      boardAt: d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate())
        + ' ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':00',
      stars: (i % 5) + 1
    }));
  }
  return cache;
}

test('THE WINDOW: 4,012 reviews draw a window of rows, not 4,012 rows', () => {
  const { Reviews } = load();
  const cache = manyReviews(4012);
  const html = Reviews.render(S('crewmanager', { cache: cache, density: 'desk' }));
  const drawn = (html.match(/class="v2row rv-row"/g) || []).length;
  assert(drawn > 0, 'nothing drew');
  assert(drawn <= Reviews.WINDOW + 40,
         drawn + ' rows in one draw; §20 measured 2,384 at 410-619 ms on an i9 and the office runs Core 2 Duos');
  assert.equal(Reviews.model(S('crewmanager', { cache: cache })).total, 4012,
               'the window must not become a cap: a cap of 200 on a list somebody searches hides the answer');
});

test('and its scroll height is rows x --row-h in a calc(), computed from the token and never measured', () => {
  const { Reviews } = load();
  const cache = manyReviews(4012);
  Reviews.windowFirst(600);
  const html = Reviews.render(S('crewmanager', { cache: cache }));
  const m = /class="rv-win" style="padding: calc\(var\(--row-h\) \* (\d+)\) 0 calc\(var\(--row-h\) \* (\d+)\)"/.exec(html);
  assert(m, 'the window does not pad itself in --row-h: ' + (html.match(/rv-win[^>]*/) || ['missing'])[0]);
  assert.equal(Number(m[1]), 600, 'the rows above the window are not accounted for');
  assert.equal(Number(m[1]) + Number(m[2]) + (html.match(/class="v2row rv-row"/g) || []).length, 4012,
               'above + drawn + below must be every row, or the scrollbar lies');
  assert(!/\d+px/.test((html.match(/class="rv-win" style="[^"]*"/) || [''])[0]), 'a px literal in the window padding');
  Reviews.windowFirst(0);
});

test('the count line states the total and the window, in the words §3.8 gives', () => {
  const { Reviews } = load();
  const html = Reviews.render(S('crewmanager', { cache: manyReviews(4012) }));
  assert(/4,012 reviews\. 200 shown\. Narrow with a filter\./.test(html),
         'the count line is wrong: ' + (html.match(/rv-count">[^<]*/) || ['missing'])[0]);
});

test('one item draws one row and no count line', () => {
  const { Reviews } = load();
  const cache = fixture({ reviews: 1 });
  const html = Reviews.render(S('crewmanager', { cache: cache }));
  assert.equal((html.match(/class="v2row rv-row"/g) || []).length, 1);
  assert(!/rv-count/.test(html), 'a one-row list drew a count line');
  assert(!/rv-win/.test(html), 'a one-row list drew a window');
});

test('NO `at` ON A FIGURE INSIDE A ROW: the list states its freshness once, in its header', () => {
  const { Reviews } = load();
  const html = Reviews.render(S('crewmanager', { cache: manyReviews(300) }));
  const list = html.slice(html.indexOf('rv-win'));
  assert(!/figure-note/.test(list),
         'a row figure carries an age, which adds a block element, triples the row height and runs ageWords per row');
  const head = html.slice(0, html.indexOf('rv-tabs'));
  assert(/figure/.test(head), 'the header lost the one figure that may carry the age');
});

test('a review row carries exactly one thing in its action column, and it is the stars', () => {
  const { Reviews } = load();
  const html = Reviews.render(S('crewmanager'));
  const act = /<span class="act">([\s\S]*?)<\/span><\/button>/.exec(html);
  assert(act, 'no action column');
  assert.equal((act[1].match(/class="figure"/g) || []).length, 1);
  assert(!/badge|btn/.test(act[1]), 'the review row grew a second thing in .act');
});

/* ===================================================================================================
 * 6. THE TYPED-NAME QUEUE — one tap, never pre-committed, always reversible
 * =================================================================================================== */

test('a high-confidence pick is PRE-FILLED INTO THE LABEL and nothing is selected or written', () => {
  const { Reviews, db } = load();
  Reviews.tab('names');
  const html = Reviews.render(S('crewmanager'));
  assert(/Yes, Brijesh/.test(html), "Claude's high-confidence pick is not in the button label");
  assert(/data-crew="d-brij"/.test(html), 'the button does not carry the crew member it would write');
  /* Read the whole of each queue row — its OPENING TAG included, because a
   * pre-selection written before data-pair is exactly the one a check anchored
   * on data-pair cannot see. */
  const qrows = html.split('<div class="v2row rv-q').slice(1)
    .map((s) => '<div class="v2row rv-q' + s.slice(0, s.indexOf('</div>') + 6));
  assert(qrows.length >= 3, 'only ' + qrows.length + ' queue rows to check');
  for (const qrow of qrows) {
    assert(!/\bchecked\b|<option[^>]*\bselected\b|aria-selected="true"|aria-pressed="true"|\bdata-selected\b/.test(qrow),
           'a queue row is pre-selected: ' + qrow.slice(0, 160));
  }
  assert.deepEqual(db.writes, [], 'rendering the queue wrote an alias');
  Reviews.tab('reviews');
});

test('a medium-confidence suggestion is NOT in the primary button: it says "Choose the crew member" and the suggestion moves to the sub-line', () => {
  const { Reviews } = load();
  Reviews.tab('names');
  const html = Reviews.render(S('crewmanager', { density: 'yard' }));
  const row = /data-pair="al-RJ09PA6126-kesar_dvr"[\s\S]*?<\/div>/.exec(html);
  assert(row, 'the medium-confidence row is missing');
  assert(/Choose the crew member/.test(row[0]),
         'a medium-confidence guess is one tap from being accepted: ' + row[0].slice(0, 300));
  assert(!/Yes, Kesar/.test(row[0]));
  assert(/Claude: Kesar Singh \u2014 6 nights on this bus/.test(row[0]),
         "Claude's evidence is not on the row");
  Reviews.tab('reviews');
});

test('the queue offers the three buttons in one order, and the row itself does nothing', () => {
  const { Reviews } = load();
  Reviews.tab('names');
  const html = Reviews.render(S('crewmanager'));
  const row = /data-pair="al-RJ09PA6126-brijesh_k"[\s\S]*?<\/div>/.exec(html)[0];
  const order = ['rvConfirm', 'rvElse', 'rvGeneric'].map((a) => row.indexOf('data-act="' + a + '"'));
  assert(order.every((i) => i >= 0), 'a queue button is missing: ' + order.join(','));
  assert(order[0] < order[1] && order[1] < order[2], 'the three buttons are in a different order');
  assert(!/^<button class="v2row rv-q"/.test(row), 'the queue row is itself a button');
  Reviews.tab('reviews');
});

test("CLAUDE'S OWN AUTO-CONFIRMS STAY VISIBLE AND KEEP THE THREE BUTTONS: that is the undo, and burying it is how a wrong attribution spreads", () => {
  const { Reviews } = load();
  const cache = fixture({ alias: [
    { id: 'al-RJ09PA6126-brijesh_k', name: 'BRIJESH K', regNo: REG, role: 'driver', status: 'crew',
      crewId: 'd-brij', decidedBy: 'claude', decidedAt: T - 86400000, auto: true,
      reason: 'name matches', evidence: { nights: 14, onBus: 14 }, history: [] }
  ] });
  Reviews.tab('names');
  const html = Reviews.render(S('crewmanager', { cache: cache }));
  const row = /data-pair="al-RJ09PA6126-brijesh_k"[\s\S]*?<\/div>/.exec(html);
  assert(row, "Claude's own auto-confirm vanished from the queue, so there is no way back from it");
  assert(/Decided by Claude/.test(row[0]), 'the row does not say who decided it');
  for (const a of ['rvConfirm', 'rvElse', 'rvGeneric']) {
    assert(row[0].indexOf('data-act="' + a + '"') >= 0, 'the undo lost ' + a);
  }
  assert(/A row that Claude decided can be changed here\./.test(html),
         'nothing on screen says the auto-decided rows can be changed');
  Reviews.tab('reviews');
});

test('a name a PERSON decided leaves the queue, which is what lets the count reach zero', () => {
  const { Reviews } = load();
  const cache = fixture({ alias: [
    { id: 'al-RJ09PA6126-brijesh_k', name: 'BRIJESH K', regNo: REG, role: 'driver', status: 'crew',
      crewId: 'd-brij', decidedBy: 'u-off', decidedAt: T, history: [] },
    { id: 'al-RJ09PA6126-kesar_dvr', name: 'Kesar Dvr', regNo: REG, role: 'driver', status: 'crew',
      crewId: 'd-kesar', decidedBy: 'u-off', decidedAt: T, history: [] },
    { id: 'al-RJ09PA6126-staff', name: 'Staff', regNo: REG, role: 'driver', status: 'generic',
      crewId: null, decidedBy: 'u-off', decidedAt: T, history: [] }
  ] });
  Reviews.tab('names');
  const m = Reviews.model(S('crewmanager', { cache: cache }));
  assert.equal(m.queueTotal, 0, 'the queue cannot reach zero, which is the one thing it exists to do');
  const html = Reviews.render(S('crewmanager', { cache: cache }));
  assert(/Every name is matched/.test(html), 'the zero state is a counter saying nought, not an answer');
  assert(/Checked just now\./.test(html));
  Reviews.tab('reviews');
});

test('A BULK CONFIRM SHOWS ITS WORK: the button is below its rows, and it is aria-disabled until they are the list', () => {
  const { Reviews } = load();
  Reviews.tab('names');
  const html = Reviews.render(S('crewmanager', { cache: bulkFixture() }));
  const btn = html.indexOf('data-act="rvGroup"');
  const lastRow = html.lastIndexOf('class="v2row rv-q"');
  assert(btn >= 0, 'no group confirm offered');
  assert(lastRow < btn, 'the bulk button is above its rows, so it can be pressed before the list is read');
  assert(/Confirm \d+ high-confidence names on RJ09PA6126/.test(html),
         'the bulk button does not name its count and its bus');
  /* aria-disabled in the MARKUP until the rows are the list — the one place on
   * this screen aria-disabled is not a write in flight (§3.7). */
  const tag = /<button[^>]*data-act="rvGroup"[^>]*>/.exec(html)[0];
  assert(/aria-disabled="true"/.test(tag), 'the bulk button is live before its rows are the list: ' + tag);
  Reviews.busFilter(REG);
  const after = /<button[^>]*data-act="rvGroup"[^>]*>/.exec(Reviews.render(S('crewmanager', { cache: bulkFixture() })))[0];
  assert(!/aria-disabled/.test(after), 'the bulk button stays disabled after its rows are on screen: ' + after);
  Reviews.busFilter(null);
  Reviews.tab('reviews');
});

function bulkFixture() {
  const cache = fixture({ aliasai: [] });
  cache.rbassign = [{ id: 'as-1', serviceId: 's-4471', date: '2026-11-02', obs: [
    { at: Date.UTC(2026, 10, 2, 16, 0), vehicleNo: REG, driver1: 'BRIJESH K', driver2: 'Kesar Dvr', cro: 'Anil Jhansi' }
  ] }];
  cache.rbaliasai = [
    { id: 'al-RJ09PA6126-brijesh_k', pick: 'd-brij', conf: 'high', nights: 14, reason: 'a' },
    { id: 'al-RJ09PA6126-kesar_dvr', pick: 'd-kesar', conf: 'high', nights: 11, reason: 'b' },
    { id: 'al-RJ09PA6126-anil_jhansi', pick: 'd-anil', conf: 'high', nights: 9, reason: 'c' }
  ];
  return cache;
}

test('a queue narrowed to one bus says how many are left, because each confirm is its own write', () => {
  const { Reviews } = load();
  Reviews.tab('names');
  Reviews.busFilter(REG);
  const html = Reviews.render(S('crewmanager', { cache: bulkFixture() }));
  assert(/3 left on this bus/.test(html), 'the narrowed queue does not say what is left: '
         + (html.match(/rv-count">[^<]*/) || ['missing'])[0]);
  Reviews.busFilter(null);
  Reviews.tab('reviews');
});

test('a windowed queue is a one-line queue: the evidence sub-line is dropped rather than wrapping a row windowing positions by arithmetic', () => {
  const { Reviews } = load();
  const cache = bulkFixture();
  // Small queue at yard: the sub-line is there.
  Reviews.tab('names');
  assert(/class="sub"/.test(Reviews.render(S('crewmanager', { cache: cache, density: 'yard' }))),
         'the yard queue lost its evidence line while it was small enough to carry it');
  // At desk it is one line, always.
  assert(!/class="sub"/.test(Reviews.render(S('crewmanager', { cache: cache, density: 'desk' }))),
         'a desk row is 32px and cannot hold a second line');
  Reviews.tab('reviews');
});

/* ===================================================================================================
 * 7. CLAUDE'S READING OF FAULT, AND THE ONE THING THIS SCREEN CANNOT RECORD
 * =================================================================================================== */

test("Claude's reading is labelled a reading, shows the evidence beside the verdict, and never the verdict alone", () => {
  const { win, sheets } = load();
  win.S = S('office');
  callReviewOpen(win, 'rv-1');
  const body = sheets[0].body;
  assert(/Claude(?:'|&#39;)s reading, not a finding\./.test(body), 'the reading is presented as a finding');
  assert(/Fault: driver/.test(body));
  assert(/Safety: yes/.test(body));
  assert(/Severity 2 of 3/.test(body));
  assert(/Why: the comment names the driving/.test(body), 'the verdict is shown without its evidence');
});

test('the Hindi comes from the record\u2019s own hi field and is not translated in the client', () => {
  const { win, sheets } = load({ lang: 'hi' });
  win.S = S('office');
  callReviewOpen(win, 'rv-1');
  assert(/HINDI EVIDENCE/.test(sheets[0].body), "the client translated Claude's evidence instead of reading hi");
});

test('a review whose reading failed to load keeps the review and says so — never a blank card and never a fabricated verdict', () => {
  const { win, sheets } = load();
  win.S = S('office');
  callReviewOpen(win, 'rv-2');          // no ai-rv-2 in the fixture
  const body = sheets[0].body;
  assert(/Claude has not read this one yet/.test(body));
  assert(!/Fault:|Severity/.test(body), 'a verdict was drawn for a review nobody read');
  assert(/rv-said/.test(body), 'the passenger\u2019s words were dropped with the reading');
});

test('there is no "I disagree" control, because there is nowhere to record it: the three real paths are offered instead', () => {
  const { win, sheets } = load();
  win.S = S('office');
  callReviewOpen(win, 'rv-1');
  assert(!/disagree|wrong about/i.test(sheets[0].body), 'a control that writes nothing');
  assert(/Write what was said/.test(sheets[0].body), 'the office\u2019s one write is missing');
});

test('"Write what was said" is absent without crewNote and "Log an incident" absent without logIncident', () => {
  const { win, sheets } = load();
  // The office holds crewNote and not logIncident (02 §2.1).
  assert(win.Caps.can('office', 'crewNote'));
  assert(!win.Caps.can('office', 'logIncident'));
  win.S = S('office');
  callReviewOpen(win, 'rv-1');
  assert(/Write what was said/.test(sheets[0].body));
  assert(!/Log an incident/.test(sheets[0].body), 'the office is offered a write it does not hold');
  assert(!/aria-disabled/.test(sheets[0].body), 'a control is disabled rather than absent');
});

test('the conversation note carries its label above the box, and says it cannot be changed before the box', () => {
  const { Reviews } = load();
  const sheet = Reviews.noteSheet('Brijesh', 'd-brij');
  assert(/Office record\. Brijesh never sees this\./.test(sheet));
  assert(sheet.indexOf('Office record') < sheet.indexOf('<textarea'), 'the label is below the box');
  assert(/Once saved, this cannot be changed or deleted/.test(sheet));
  assert(!/data-act="rvNoteEdit"|data-act="rvNoteDelete"/.test(sheet),
         'an append-only store grew an edit or delete control');
  assert(/Not saved until you press Save/.test(sheet));
  /* §3.7: aria-disabled until there IS text. This one is a write that cannot be
   * made yet, not a write the person may not make, which is the one distinction
   * that makes a disabled control right rather than an absent one. */
  const save = /<button[^>]*data-act="rvNoteSave"[^>]*>/.exec(sheet)[0];
  assert(/aria-disabled="true"/.test(save), 'an empty note can be saved: ' + save);
});

test('a sheet\u2019s Save arms itself when there is text, and typing never redraws the sheet from under the hand', () => {
  const { win, mounted, inputs } = load();
  assert.equal(inputs.length, 1, 'mount() registered ' + inputs.length + ' input listeners, not one');
  win.S = S('office');
  const save = fakeEl({ 'data-act': 'rvNoteSave', 'aria-disabled': 'true' });
  const text = { value: '', tagName: 'TEXTAREA' };
  const form = {
    getAttribute: (k) => (k === 'data-sheet' ? 'rvnote' : null),
    querySelector: (sel) => (/textarea/.test(sel) ? text : save)
  };
  const field = {
    value: '', getAttribute: (k) => (k === 'data-field' ? 'text' : null),
    closest: (sel) => (sel === '[data-sheet]' ? form : null)
  };
  const before = mounted.length;
  const fn = inputs[inputs.length - 1];
  fn({ target: field });
  assert.equal(save.getAttribute('aria-disabled'), 'true', 'an empty box armed Save');
  text.value = 'We spoke about the late start.';
  fn({ target: field });
  assert.equal(save.getAttribute('aria-disabled'), null, 'text did not arm Save');
  assert.equal(mounted.length, before, 'typing redrew the sheet, which loses what was typed');
});

/* ===================================================================================================
 * 8. EVERY OTHER STATE (§3.6)
 * =================================================================================================== */

test('loading draws a skeleton and the tab counts are DASHES, because 14 and 0 must not look alike while it reads', () => {
  const { Reviews } = load();
  const html = Reviews.render({ user: { id: 'u-off', role: 'office' }, cache: {}, density: 'yard' });
  assert(/skeleton|aria-busy/.test(html), 'no skeleton while loading');
  const tabs = /class="tabs rv-tabs"[\s\S]*?<\/div>/.exec(html)[0];
  assert(!/data-state="zero"/.test(tabs), 'a count read zero before anything was read');
  assert((tabs.match(/data-state="unknown"/g) || []).length >= 2, 'the tab counts are not dashes while loading');
});

test('empty names the filter it is empty under, so the reader knows what to undo', () => {
  const { Reviews } = load();
  const cache = fixture({ reviews: 0 });
  Reviews.filter('low');
  assert(/No reviews with 1 or 2 stars/.test(Reviews.render(S('office', { cache: cache }))));
  assert(/Try All, or another month\./.test(Reviews.render(S('office', { cache: cache }))));
  Reviews.filter('all');
  assert(/No reviews yet/.test(Reviews.render(S('office', { cache: cache }))));
});

test('offline KEEPS the local rows and says the collector has not run, rather than implying the list is complete', () => {
  const { Reviews } = load();
  const html = Reviews.render(S('office', { offline: true }));
  assert((html.match(/class="v2row rv-row"/g) || []).length === 4, 'offline dropped local records that are real');
  assert(/No new reviews since \d\d:\d\d\./.test(html), 'offline does not say the collector is behind');
  assert(!/offline-state|offlineState/.test(html));
});

test('offline with nothing local shows the offline state rather than "there are none"', () => {
  const { Reviews } = load();
  const html = Reviews.render(S('office', { cache: fixture({ reviews: 0 }), offline: true }));
  assert(!/No reviews yet/.test(html), 'a list that has not synced was reported as empty');
});

test('the error state names the list and carries a Retry, and the empty state is not drawn for a list that failed', () => {
  const { Reviews } = load();
  const html = Reviews.render(S('office', { extra: { error: true } }));
  assert(/Could not read the reviews/.test(html), 'a failed read drew something else');
  assert(/data-state-retry/.test(html), 'the error state has no Retry');
  assert(!/No reviews yet|v2row rv-row/.test(html), 'a failed read was reported as "there are none"');
  assert(!/overwrite|keep mine/i.test(html), 'a refusal was turned into a question about a clock');
});

/* Everything on this screen is a local record and works offline. The two
 * exceptions are the server's own collector calls, and offline they are ABSENT
 * with the reason, not buttons that fail when pressed (§3.6). */
test('the two server asks are absent offline, with "Needs a connection" in their place', () => {
  const { Reviews, win, sheets } = load();
  Reviews.tab('names');
  const on = Reviews.render(S('crewmanager'));
  assert(/data-act="rvAskName"/.test(on), 'the name ask is missing online');
  const off = Reviews.render(S('crewmanager', { offline: true }));
  assert(!/data-act="rvAskName"/.test(off), 'a button that cannot work is offered offline');
  assert(/Needs a connection/.test(off), 'nothing says why the ask is gone');
  Reviews.tab('reviews');
  // And the per-review ask, which only appears where there is nothing to read.
  win.S = S('crewmanager');
  callReviewOpen(win, 'rv-2');
  assert(/data-act="rvAskRead"/.test(sheets[0].body), 'an unread review offers no way to ask');
  sheets.length = 0;
  callReviewOpen(win, 'rv-1');
  assert(!/data-act="rvAskRead"/.test(sheets[0].body), 'a review Claude has read offers to read it again');
});

test('a tab and a filter change what is drawn and never push a route: a back press must leave the screen', () => {
  const { win, mounted, gone } = load();
  win.S = S('crewmanager');
  const click = findClick(win);
  click({ target: { closest: (sel) => {
    if (sel === 'input, select, textarea, label, .num') return null;
    if (sel === '[data-act]') return null;
    if (sel === '[data-tab]') return { getAttribute: () => 'names' };
    return null;
  } }, preventDefault() {} });
  assert.equal(win.Reviews.tab(), 'names');
  assert.deepEqual(gone, [], 'a tab pushed a route');
  assert(mounted.length >= 1, 'the screen did not redraw');
  win.Reviews.tab('reviews');
});

test('a click that starts in the search field returns before [data-act] is read', () => {
  const { win, mounted } = load();
  win.S = S('crewmanager');
  let readAct = false;
  findClick(win)({ target: { closest: (sel) => {
    if (sel === 'input, select, textarea, label, .num') return { field: true };
    if (sel === '[data-act]') { readAct = true; return null; }
    return null;
  } }, preventDefault() {} });
  assert(!readAct, 'the handler read [data-act] after a field was clicked, which is the shipped regression');
});

/* ===================================================================================================
 * 9. THE WRITES
 * =================================================================================================== */

test('confirming a name writes one rbalias with the id trace.js would build, and toasts once', () => {
  const { win, db, toasts } = load();
  win.S = S('crewmanager');
  Object.assign(win.document, { querySelector: () => null });
  const el = fakeEl({ 'data-act': 'rvConfirm', 'data-crew': 'd-brij', 'data-pair': 'al-RJ09PA6126-brijesh_k' });
  win.Reviews.tab('names');
  return clickEl(win, el).then(() => {
    assert.equal(db.writes.length, 1, 'wrote ' + db.writes.length + ' records, not one');
    assert.equal(db.writes[0].store, 'rbalias');
    assert.equal(db.writes[0].rec.id, require('./trace.js').aliasId('BRIJESH K', REG));
    assert.equal(db.writes[0].rec.status, 'crew');
    assert.equal(db.writes[0].rec.crewId, 'd-brij');
    assert.equal(db.writes[0].rec.decidedBy, 'u-crewmanager');
    assert.deepEqual(toasts.map((t) => t.text), ['Name confirmed']);
    win.Reviews.tab('reviews');
  });
});

test('"Not a person" writes status generic and points at nobody', () => {
  const { win, db } = load();
  win.S = S('crewmanager');
  const el = fakeEl({ 'data-act': 'rvGeneric', 'data-pair': 'al-RJ09PA6126-staff' });
  return clickEl(win, el).then(() => {
    assert.equal(db.writes.length, 1);
    assert.equal(db.writes[0].rec.status, 'generic');
    assert.equal(db.writes[0].rec.crewId, null);
  });
});

test('a confirm whose write is refused says the name is kept on this phone, and never asks about a clock', () => {
  const { win, toasts } = load();
  win.S = S('crewmanager');
  win.DB.put = () => Promise.reject(new Error('refused'));
  const el = fakeEl({ 'data-act': 'rvConfirm', 'data-crew': 'd-brij', 'data-pair': 'al-RJ09PA6126-brijesh_k' });
  return clickEl(win, el).then(() => {
    assert(/Not sent\. The name is saved on this phone\./.test(toasts.map((t) => t.text).join('|')),
           'a refused write said something else: ' + JSON.stringify(toasts));
    assert(!/overwrite|keep mine|newer/i.test(JSON.stringify(toasts)),
           'a conflict was turned into a question about a clock');
  });
});

test('the group confirm reveals its rows on the first press and writes on the second, one toast naming the number', () => {
  const { win, db, toasts } = load();
  win.S = S('crewmanager', { cache: bulkFixture() });
  win.Reviews.tab('names');
  const el = fakeEl({ 'data-act': 'rvGroup', 'data-reg': REG });
  return clickEl(win, el).then(() => {
    assert.equal(db.writes.length, 0, 'the first press wrote before the rows were on screen');
    assert.equal(el.attrs['aria-disabled'], 'true', 'the button is pressable before its rows are the list');
    assert.equal(win.Reviews.busFilter(), REG, 'the queue was not narrowed to the bus');
    el.attrs['aria-disabled'] = null;
    return clickEl(win, el);
  }).then(() => {
    assert.equal(db.writes.length, 3, 'wrote ' + db.writes.length + ' of 3');
    assert.deepEqual(db.writes.map((w) => w.store), ['rbalias', 'rbalias', 'rbalias']);
    assert.deepEqual(toasts.map((t) => t.text), ['3 names confirmed'], 'one toast naming the number, after the writes');
    win.Reviews.tab('reviews');
    win.Reviews.busFilter(null);
  });
});

function fakeEl(attrs) {
  const el = {
    attrs: Object.assign({}, attrs),
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
    setAttribute(k, v) { this.attrs[k] = v; },
    removeAttribute(k) { delete this.attrs[k]; },
    textContent: '',
    closest(sel) {
      const m = /^\[([a-z-]+)\]$/.exec(sel);
      if (m && this.getAttribute(m[1]) !== null) return this;
      return null;
    }
  };
  return el;
}

function clickEl(win, el) {
  const r = findClick(win)({ target: {
    closest(sel) {
      if (sel === 'input, select, textarea, label, .num') return null;
      return el.closest(sel);
    }
  }, preventDefault() {} });
  return Promise.resolve(r).then(() => new Promise((res) => setTimeout(res, 0)));
}

/* A review whose bus was never traced -- most of them, until the duty log catches up -- used to draw
 * its title with the separator written in by hand on both sides of an empty bus: "1 star \u00b7  \u00b7 7 Nov".
 * A separator standing either side of nothing reads as a value that failed to load, on a row that
 * already carries very little. Reported from the office together with the row overlap. */
const DANGLING = /\u00b7\s*\u00b7|^\s*\u00b7|\u00b7\s*$/;
function danglingLines(html) {
  return String(html).replace(/<[^>]*>/g, '\n').split('\n')
    .map((l) => l.trim()).filter((l) => l && DANGLING.test(l));
}

/* The fixture's four reviews all board on the one night the duty log covers, so every one of them is
 * traced to a bus and the dangling separator never appears. THIS CASE SUPPLIES THE UNTRACED ONE -- a
 * review boarding on a night with no assignment, which is most of them in the office until the duty
 * log catches up. Without it the check below is green against the broken join too, and a check that
 * cannot fail is decoration. */
function untracedCache() {
  const c = fixture();
  c.rbreviews = c.rbreviews.concat([
    review(9, { stars: 3, boardAt: '2026-10-21 21:30:00' })   // no rbassign for that date
  ]);
  return c;
}

test('the dangling-separator detector catches one and passes a title that is fine', () => {
  assert.deepEqual(danglingLines('<p>1 star \u00b7  \u00b7 7 Nov</p>'), ['1 star \u00b7  \u00b7 7 Nov']);
  assert.deepEqual(danglingLines('<p>1 star \u00b7 RJ09PA6126 \u00b7 7 Nov</p>'), []);
  assert.deepEqual(danglingLines('<p>\u00b7 7 Nov</p>'), ['\u00b7 7 Nov']);
});

test('a review with no traced bus draws no separator standing either side of nothing', () => {
  for (const density of ['yard', 'desk']) {
    const { Reviews } = load();
    const html = Reviews.render(S('office', { density: density, cache: untracedCache() }));
    assert(/\u00b7/.test(String(html)), density + ': no separator was drawn at all, so nothing was tested');
    const bad = danglingLines(html);
    assert.deepEqual(bad, [], density + ': a dangling separator is drawn: ' + JSON.stringify(bad));
  }
});

/* ===================================================================================================
 * run
 * =================================================================================================== */
Promise.all(waiting).then(() => {
  console.log(fails ? '\n' + fails + ' failed' : '\nall passed');
  process.exit(fails ? 1 : 0);
});

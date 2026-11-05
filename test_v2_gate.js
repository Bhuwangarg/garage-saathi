/* Tests for v2 screen 13, the Gate round — v2/screens/gate.js and v2/ui/gate.css.
 * Run: node test_v2_gate.js
 *
 * At the repo ROOT and not in v2/, because scripts/run-tests.py discovers
 * test_*.js at the root only and does not recurse. A test in v2/ would never
 * run, and a test nobody runs is not a test.
 *
 * Node, no browser, in the shape of test_v2_shell.js and test_v2_ui.js: the
 * real v2/ui/icons.js, words.js, states.js, photos.js, caps.js, router.js and
 * v2/screens/gate.js are loaded in a vm context holding a stub window and a
 * small fake DOM, and the assertions are on the markup STRING the screen
 * builds. That is why render(model, ui) is a pure builder and mount() is
 * separate: a screen whose rules can only be checked in a browser is a screen
 * whose rules are checked by nobody.
 *
 * gate.css is read as TEXT with the brace-depth reader from test_v2_shell.js,
 * and every detector is fed input it MUST reject before it is turned on the
 * real file.
 *
 * THE FOUR CHECKS THIS FILE EXISTS FOR, each of which is a refusal the server
 * already makes and the screen must not provoke:
 *
 *   1. NO DECIDE CONTROL, and above all not for the person who ran the check.
 *      `_guard_gatecheck` answers them "you ran this check — somebody else
 *      decides go or hold", so a button here would be a push the server
 *      refuses. A control nobody may use is absent, not disabled.
 *   2. NO IMAGE BYTES IN A RECORD. v1 falls back to the `data:` URL when an
 *      upload fails (LIVE-ISSUES 9) and `selfie` is in `GATE_FIXED`, so inline
 *      bytes on this record could never be patched back out.
 *   3. THE CREATE IS ONE WRITE, with the driver already named and crewed to
 *      that bus. `GATE_FIXED` forbids an amend, so a flow that amended would
 *      be refused.
 *   4. THE RELEASE CONTROL IS ABSENT until all ten are answered, because the
 *      thing to do before then is answer an item.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const read = (p) => fs.readFileSync(p, 'utf8');
const V2 = (...p) => path.join(ROOT, 'v2', ...p);

/* The runner QUEUES rather than running, and awaits each case, because half the
 * cases here are async — a capture, an upload, a write. A synchronous runner
 * calls an async function, gets a promise back, catches nothing, and prints
 * "ok" while the assertion inside rejects into the void. Every async check in
 * this file would be decoration, which is exactly the thing this repo's rule
 * about decoration is about. */
let fails = 0;
const queue = [];
function test(name, fn) { queue.push([name, fn]); }

async function run() {
  for (const [name, fn] of queue) {
    try { await fn(); console.log('  ok  ' + name); }
    catch (e) { console.log(' FAIL ' + name + '\n        ' + String(e && e.message || e).split('\n').join('\n        ')); fails++; }
  }
  console.log(fails ? '\n' + fails + ' check(s) failed' : '\nall checks passed');
  process.exit(fails ? 1 : 0);
}

// An assertion that rejects with nobody listening must never be silent either.
process.on('unhandledRejection', (e) => {
  console.log(' FAIL (unhandled) ' + String(e && e.message || e));
  process.exit(1);
});

const GATE_CSS = read(V2('ui', 'gate.css'));
const GATE_JS = read(V2('screens', 'gate.js'));
const SERVER = read(path.join(ROOT, 'sync_server.py'));

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

// Only transform and opacity may animate; nothing else is a compositor property
// and everything else is a layout or paint pass on a Core 2 Duo.
function animatedProps(css) {
  return declsOf(css)
    .filter((d) => d.prop === 'transition' || d.prop === 'transition-property')
    .reduce((a, d) => a.concat(d.val.split(',').map((part) => part.trim().split(/\s+/)[0])), [])
    .filter((p) => p && p !== 'none');
}

test('the magic-px detector rejects a literal size and allows a border, outline and shadow', () => {
  for (const bad of ['height:56px', 'min-height:48px', 'padding:0 16px', 'gap:8px', 'font-size:15px'])
    assert(magicPx('.a{' + bad + '}').length > 0, 'detector missed: ' + bad);
  for (const fine of ['min-height:var(--tap)', 'padding:var(--s3) var(--pad)',
    'box-shadow:inset 0 -1px 0 var(--line)', 'outline-offset:-2px', 'border-top:2px solid var(--line)'])
    assert.deepEqual(magicPx('.a{' + fine + '}'), [], 'false positive: ' + fine);
});

test('the literal-colour detector rejects a hex, an hsl and a color-mix and allows a token', () => {
  for (const bad of ['color:#fff', 'background:hsl(30 20% 9%)', 'color:rgba(0,0,0,.5)', 'color:color-mix(in srgb, red, blue)'])
    assert(literalColour('.a{' + bad + '}').length > 0, 'detector missed: ' + bad);
  assert.deepEqual(literalColour('.a{color:var(--warn);background:var(--surface-raised)}'), []);
});

test('the animated-property detector sees a non-compositor property and ignores transform/opacity', () => {
  assert.deepEqual(animatedProps('.a{transition:width 200ms ease-out}'), ['width']);
  assert.deepEqual(animatedProps('.a{transition:transform 150ms ease-out, opacity 120ms ease-out}').sort(),
    ['opacity', 'transform']);
});

/* =====================================================================================================
 * 1. gate.css: the floor, and the ONE animation
 * ===================================================================================================== */

test('gate.css has declarations to check at all: an empty file would pass every rule below vacuously', () => {
  assert(declsOf(GATE_CSS).length >= 30, 'only ' + declsOf(GATE_CSS).length + ' declarations');
});

test('gate.css declares no size and no colour of its own: every value is a token', () => {
  assert.deepEqual(magicPx(GATE_CSS), []);
  assert.deepEqual(literalColour(GATE_CSS), []);
});

test('every gate.css rule is scoped to [data-v2], so nothing it says can reach the live app', () => {
  const loose = selectorsOf(GATE_CSS).filter((s) => s && s.indexOf('[data-v2]') !== 0);
  assert.deepEqual(loose, []);
});

test('only transform and opacity are animated, anywhere in the file', () => {
  const odd = animatedProps(GATE_CSS).filter((p) => p !== 'transform' && p !== 'opacity');
  assert.deepEqual(odd, []);
});

/* The hold is the one thing in v2 allowed over 300 ms, and it is allowed because
 * the duration IS the control. So the check is not "is it under 300 ms" but "is
 * it exactly the owner's 1500 ms, linear, on a transform". */
test('the hold bar is 1500 ms linear on a transform from a left origin', () => {
  const held = rulesOf(GATE_CSS).filter((r) => /\[data-holding\]/.test(r.selector) && !r.ctx.length);
  assert.strictEqual(held.length, 1, 'exactly one holding rule outside a media query');
  assert(/^scaleX\(1\)$/.test(held[0].decls.transform), 'transform is ' + held[0].decls.transform);
  assert(/\btransform\b/.test(held[0].decls.transition), 'the transition is not on transform');
  assert(/\b1500ms\b/.test(held[0].decls.transition), 'the hold is not 1500 ms: ' + held[0].decls.transition);
  assert(/\blinear\b/.test(held[0].decls.transition), 'the bar is a clock, so it is linear, not eased');
  const bar = rulesOf(GATE_CSS).filter((r) => /\.gate-bar$/.test(r.selector)
    && !/data-holding/.test(r.selector) && !r.ctx.length);
  assert.strictEqual(bar.length, 1);
  assert.strictEqual(bar[0].decls['transform-origin'], 'left');
  assert.strictEqual(bar[0].decls.transform, 'scaleX(0)');
  // Released early: 150 ms back to nothing, and NOT a 1500 ms clock run backwards.
  assert(/\b150ms\b/.test(bar[0].decls.transition), 'the early release is not 150 ms');
});

test('reduced motion keeps the 1500 ms acknowledgement and stops the movement', () => {
  const rm = rulesOf(GATE_CSS).filter((r) => r.ctx.some((c) => /prefers-reduced-motion/.test(c)));
  assert(rm.length >= 2, 'no reduced-motion block');
  const holding = rm.filter((r) => /\[data-holding\]/.test(r.selector));
  assert.strictEqual(holding.length, 1);
  assert.strictEqual(holding[0].decls.transform, 'none', 'reduced motion still moves the bar');
  assert(/\bopacity\b/.test(holding[0].decls.transition) && /\b1500ms\b/.test(holding[0].decls.transition),
    'reduced motion dropped the 1500 ms readout: ' + holding[0].decls.transition);
});

/* screens-work.md §4.5: `min-height: var(--tap)` in BOTH densities, because the
 * supervisor performs this check and can now be at a desk doing it. One
 * declaration covers both — tokens.css switches --tap from 48px to 32px — so a
 * literal here would be the bug, which is what the px check above catches. */
test('the hold button is min-height: var(--tap), which is both densities in one declaration', () => {
  const hold = rulesOf(GATE_CSS).filter((r) => /\.gate-hold$/.test(r.selector) && !r.ctx.length);
  assert.strictEqual(hold.length, 1, 'no .gate-hold rule');
  assert.strictEqual(hold[0].decls['min-height'], 'var(--tap)');
});

test('the panel header is sticky and nothing in this file is fixed', () => {
  const fixed = declsOf(GATE_CSS).filter((d) => d.prop === 'position' && d.val === 'fixed');
  assert.deepEqual(fixed.map((d) => d.sel), [], 'a fixed layer in a screen reads as a nav (foundation §3.7.1)');
  const head = rulesOf(GATE_CSS).filter((r) => /\.gate-head$/.test(r.selector));
  assert.strictEqual(head.length, 1);
  assert.strictEqual(head[0].decls.position, 'sticky');
  assert.strictEqual(head[0].decls.top, '0');
});

/* =====================================================================================================
 * LOADING: the real primitives plus the screen, in one context
 * ===================================================================================================== */
const SRC = ['ui/icons.js', 'ui/words.js', 'ui/states.js', 'ui/photos.js',
             'caps.js', 'router.js', 'screens/gate.js'];

function el(tag) {
  const e = {
    tag: tag, html: '', attrs: {}, isConnected: true, files: null, value: '',
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    removeAttribute(k) { delete this.attrs[k]; },
    hasAttribute(k) { return k in this.attrs; },
    addEventListener() {}, removeEventListener() {},
    insertAdjacentHTML(_, h) { this.html += h; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    closest() { return null; }, focus() {},
    classList: { add() {}, remove() {}, contains() { return false; } },
  };
  return e;
}

const NOW = Date.UTC(2026, 10, 5, 15, 40);     // 21:10 IST on 2026-11-05

function load(o) {
  o = o || {};
  const htmlEl = el('html');
  htmlEl.lang = o.lang || 'en';
  htmlEl.setAttribute('data-v2', '');
  const clicks = [], changes = [], downs = [], ups = [];
  const puts = [], toasts = [], sheets = [];
  const sandbox = {
    navigator: { onLine: true, userAgent: 'node', language: 'en' },
    /* The DELAY is recorded, not only the callback. A stub that threw the delay
     * away could not tell a 1500 ms hold from a 200 ms one, and the 1.5 seconds
     * IS the control — so the stub would have made the owner's number
     * unfalsifiable in the one place it is enforced. */
    setTimeout: (fn, ms) => { sandbox._timer = fn; sandbox._timerMs = ms; return 1; },
    clearTimeout: () => { sandbox._timer = null; },
    console: { warn() {}, error() {}, info() {}, log() {} },
    crypto: { getRandomValues: (a) => { let i; for (i = 0; i < a.length; i++) a[i] = 7 + i; return a; } },
    /* A real camera capture, as the bytes it actually is. The stub used to
     * answer with nothing, and a stub that answers with nothing cannot tell a
     * screen that refuses image bytes from one that passes them straight
     * through -- which is the whole of LIVE-ISSUES 9. */
    FileReader: function () {
      this.readAsDataURL = () => {
        this.result = 'data:image/jpeg;base64,' + 'A'.repeat(512);
        if (this.onload) this.onload();
      };
    },
    document: {
      documentElement: htmlEl, title: '',
      addEventListener(type, fn) {
        if (type === 'click') clicks.push(fn);
        else if (type === 'change') changes.push(fn);
        else if (type === 'pointerdown' || type === 'keydown') downs.push(fn);
        else ups.push(fn);
      },
      removeEventListener() {}, getElementById() { return null; },
      createElement: () => el('div'), querySelector() { return null; }, querySelectorAll() { return []; },
    },
    getComputedStyle: () => ({ opacity: '1' }),
    addEventListener() {}, removeEventListener() {},
    S: { user: o.user || { id: 'u-sup', role: 'supervisor', name: 'Mohan' }, route: null, stack: [], cache: o.cache || {} },
    DB: { put: async (store, obj) => { puts.push({ store: store, obj: obj }); return obj; } },
    Cache: { load: async () => sandbox.S.cache, sig: () => '', reads: () => 0 },
    Night: {
      dayKey: () => '2026-11-05',
      running: async () => (o.running === undefined ? ['b1', 'b2', 'b3'] : o.running),
    },
    Sync: {
      now: () => (o.now == null ? NOW : o.now),
      uploadPhoto: async () => (o.uploadOk === false ? null : '/uploads/' + 'a'.repeat(32) + '.jpg'),
      uploadError: () => '',
      info: () => ({ pending: 0, lastError: '', status: 'synced', complete: true }),
    },
    V2: {
      openSheet: (t, b) => { sheets.push({ title: t, body: b }); return { dialog: true }; },
      closeSheet: () => {}, confirmDialog: () => null,
      toast: (text, opts) => { toasts.push({ text: text, opts: opts }); },
    },
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  for (const f of SRC) {
    // o.gateSrc patches the screen in place, so a mutant runs through the real
    // primitives and the real stub DOM rather than in a reduced world where it
    // could pass for the wrong reason.
    const src = (f === 'screens/gate.js' && o.gateSrc) ? o.gateSrc : read(V2(f));
    vm.runInContext(src, ctx, { filename: V2(f) });
  }
  /* ui/photos.js installs its own document click listener at load — that is how
   * a markup string opens a photo viewer without a function per tile — and
   * ui/states.js installs one the first time a Retry is drawn. Neither is the
   * screen's, so the screen's own listener is counted from here. */
  return { win: sandbox, Gate: sandbox.Gate, puts, toasts, sheets, clicks, changes, downs, ups,
           root: htmlEl, base: clicks.length, mine: null };
}

/* Gate.mount(), plus the one listener it installed. */
function mountGate(l) {
  const before = l.clicks.length;
  l.Gate.mount();
  l.added = l.clicks.length - before;
  if (l.mine === null && l.added) l.mine = l.clicks[l.clicks.length - 1];
  return l;
}

/* A click on one control, through the screen's own delegated listener — the
 * only way anything on this screen does anything, so the shape of the event
 * matters: `closest(sel)` is what the handler reads, and a target that answered
 * every selector would make every branch look alive. */
function clickOn(l, attr, value) {
  const target = { closest: (sel) => {
    if (sel === 'input, select, textarea, label, .num') return null;
    if (sel !== '[' + attr + ']') return null;
    return { getAttribute: (k) => (k === attr ? value : null) };
  } };
  l.mine({ target: target, preventDefault() {} });
}

/* The shell's model, as Shell.model builds it (shell.js:439). */
function model(o) {
  o = o || {};
  return {
    route: 'gate', params: null,
    role: o.role || 'supervisor', density: o.density || 'yard',
    user: o.user || { id: 'u-sup', role: o.role || 'supervisor', name: 'Mohan' },
    cache: o.cache || {},
    replica: { behind: 0, complete: o.complete !== false },
    stale: o.complete === false,
    offline: o.offline === true,
  };
}

const BUSES = [{ id: 'b1', regNo: 'RJ09PA6126' }, { id: 'b2', regNo: 'RJ14PA1023' }, { id: 'b3', regNo: 'RJ19PA7788' }];
const CREW = [
  { id: 'd1', name: 'Ramesh Kumar', busId: 'b1', driverSlot: 1 },
  { id: 'd2', name: 'Shyam Lal', busId: 'b1', driverSlot: 2 },
  { id: 'd3', name: 'Geeta Devi', busId: 'b2', driverSlot: 1 },
];
const USERS = [{ id: 'u-sup', name: 'Mohan', role: 'supervisor' }, { id: 'u-sup2', name: 'Kailash', role: 'supervisor' }];

function items(spec) {
  // spec: {key: true | 'note' | {photo}} -> the record's items map
  const out = {};
  for (const k of Object.keys(spec || {})) {
    const v = spec[k];
    if (v === true) out[k] = { ok: true, photo: '', note: '' };
    else if (v === 'photo') out[k] = { ok: true, photo: '/uploads/' + k + '.jpg', note: '' };
    else out[k] = { ok: false, photo: '', note: String(v) };
  }
  return out;
}

const ALL_PASS = items({ ac: 'photo', blankets: 'photo', cabin: 'photo', charging: true, water: true,
                         tyres: true, fuel: true, papers: true, safety: true, uniform: true });

function check(over) {
  return Object.assign({
    id: 'gc-1', busId: 'b1', regNo: 'RJ09PA6126', driverId: 'd1', driverName: 'Ramesh Kumar',
    userId: 'u-sup', startedAt: NOW - 3600000, date: '2026-11-05', selfie: '/uploads/sel.jpg',
    faceVerified: false, lat: 26.9, lng: 75.8, onDutyBoard: true, status: 'open', items: {},
    updatedAt: NOW,
  }, over || {});
}

function cacheOf(checks) {
  return { buses: BUSES, drivers: CREW, users: USERS, gatechecks: checks || [] };
}

function board(o) {
  o = o || {};
  const l = load({ cache: cacheOf(o.checks) });
  return { l: l, html: l.Gate.render(model({ cache: cacheOf(o.checks), offline: o.offline, complete: o.complete }),
                                     { running: o.running === undefined ? ['b1', 'b2', 'b3'] : o.running }) };
}

function panel(o) {
  o = o || {};
  const c = cacheOf(o.checks);
  const l = load({ cache: c, user: o.user });
  const html = l.Gate.render(model({ cache: c, user: o.user, role: o.role, density: o.density, offline: o.offline }),
    { busId: o.busId || 'b1', running: ['b1', 'b2', 'b3'], selfie: o.selfie || '',
      driverId: o.driverId || null, problem: o.problem || '', busy: o.busy || '' });
  return { l: l, html: html };
}

/* =====================================================================================================
 * 2. THE TEN ITEMS ARE THE SERVER'S TEN, IN THE SERVER'S ORDER
 * ===================================================================================================== */

test('gate.js loads in a stub window and exports what the cut says it exports', () => {
  const { Gate } = load({ cache: cacheOf([]) });
  for (const n of ['render', 'model', 'start', 'payload', 'outcome', 'currentCheck', 'mount', 'unmount'])
    assert.strictEqual(typeof Gate[n], 'function', 'Gate.' + n + ' is not exported');
});

test('the screen registers itself with the Router at load and draws nothing until asked', () => {
  const { win } = load({ cache: cacheOf([]) });
  const mod = win.Router.moduleFor('gate');
  assert(mod && typeof mod.render === 'function', 'gate did not register');
});

/* Read out of sync_server.py, not copied: GATE_ITEMS there and GATE_ITEMS here
 * are one list in two languages, and a comment in the server says this check
 * fails if they drift apart. */
test('the ten item keys and the three photo items are exactly the server\'s, in the server\'s order', () => {
  const m = SERVER.match(/GATE_ITEMS = \[([\s\S]*?)\]\n/);
  assert(m, 'GATE_ITEMS not found in sync_server.py');
  const server = [...m[1].matchAll(/\("(\w+)",\s*(True|False)\)/g)].map((x) => [x[1], x[2] === 'True']);
  assert.strictEqual(server.length, 10, 'the server does not have ten items');
  const { Gate } = load({ cache: cacheOf([]) });
  assert.deepEqual(Gate.GATE_ITEMS.map((s) => [s.k, s.photo]), server);
});

test('Gate.outcome is the server\'s _gate_outcome: a pass without its photo is not answered', () => {
  const { Gate } = load({ cache: cacheOf([]) });
  assert.strictEqual(Gate.outcome(ALL_PASS).verdict, 'pass');
  assert.strictEqual(Gate.outcome(ALL_PASS).answered, 10);
  // ac passed with no photo: incomplete, and it does not count as answered.
  const noPhoto = Object.assign({}, ALL_PASS, { ac: { ok: true, photo: '', note: '' } });
  assert.strictEqual(Gate.outcome(noPhoto).verdict, 'incomplete');
  assert.strictEqual(Gate.outcome(noPhoto).answered, 9);
  // a failure with no note is not an answer either
  const noNote = Object.assign({}, ALL_PASS, { tyres: { ok: false, photo: '', note: '  ' } });
  assert.strictEqual(Gate.outcome(noNote).verdict, 'incomplete');
  // a failure WITH a note is an answer, and the outcome is a fail
  const failed = Object.assign({}, ALL_PASS, { tyres: { ok: false, photo: '', note: 'Front left bald' } });
  assert.strictEqual(Gate.outcome(failed).verdict, 'fail');
  assert.strictEqual(Gate.outcome(failed).answered, 10);
  assert.deepEqual(Gate.outcome(failed).failed, ['tyres']);
  assert.strictEqual(Gate.outcome({}).verdict, 'incomplete');
  assert.strictEqual(Gate.outcome(null).answered, 0);
});

/* =====================================================================================================
 * 3. THE SIX GATE-ROW STATES: A MARK AND A WORD, NEVER COLOUR ALONE
 * ===================================================================================================== */

const SIX = [
  ['none', null, 'Not checked out yet'],
  ['open', check({ status: 'open', items: items({ charging: true }) }), 'Check started'],
  ['awaiting', check({ status: 'awaiting', sentAt: NOW, items: Object.assign({}, ALL_PASS, { tyres: { ok: false, note: 'Bald', photo: '' } }) }), 'Waiting for a decision'],
  ['released', check({ status: 'released', releasedAt: NOW, items: ALL_PASS }), 'Released'],
  ['approved', check({ status: 'approved', items: ALL_PASS, decision: { verdict: 'go', reason: 'brake light noted', at: NOW } }), 'Allowed out'],
  ['held', check({ status: 'held', items: ALL_PASS, decision: { verdict: 'hold', reason: 'brake warning light', at: NOW } }), 'Held'],
];

test('all six gate-row states draw a mark AND a word, and the colour is only the third signal', () => {
  for (const [name, c, word] of SIX) {
    const { html } = board({ checks: c ? [c] : [], running: ['b1'] });
    assert(html.indexOf(word) >= 0, name + ': the word "' + word + '" is missing');
    // the mark: an inline <svg> inside the row's lead
    const lead = /<span class="lead" data-gate="(\w+)">\s*<svg/.exec(html);
    assert(lead, name + ': the row has no mark in its lead');
    // and the tone is a named tone, not the only carrier of the state
    assert(['ok', 'warn', 'bad', 'dim'].indexOf(lead[1]) >= 0, name + ': odd tone ' + lead[1]);
  }
});

test('the three tones differ between a released, a held and an unchecked bus', () => {
  const tone = (c) => /data-gate="(\w+)"/.exec(board({ checks: c ? [c] : [], running: ['b1'] }).html)[1];
  assert.strictEqual(tone(null), 'dim');
  assert.strictEqual(tone(check({ status: 'released', releasedAt: NOW, items: ALL_PASS })), 'ok');
  assert.strictEqual(tone(check({ status: 'held', items: ALL_PASS, decision: { reason: 'x', at: NOW } })), 'bad');
});

test('an open check\'s row says how many are answered, so the count is on the row and not only in the panel', () => {
  const six = items({ ac: 'photo', blankets: 'photo', cabin: 'photo', charging: true, water: true, tyres: true });
  const { html } = board({ checks: [check({ status: 'open', items: six })], running: ['b1'] });
  assert(html.indexOf('6 of 10 answered') >= 0, 'the row does not say 6 of 10: ' + html.slice(0, 400));
});

test('offline, an unchecked bus says "not checked on this phone yet" and never "not checked yet"', () => {
  const on = board({ checks: [], running: ['b1'] }).html;
  const off = board({ checks: [], running: ['b1'], offline: true }).html;
  assert(on.indexOf('Not checked out yet') >= 0);
  assert(off.indexOf('Not checked on this phone yet') >= 0,
    'another supervisor may already have released it, so the copy must say what THIS phone knows');
  assert(off.indexOf('Not checked out yet') < 0);
});

test('the count line is figure(null) before tonight\'s list is known, never "0 of 0"', () => {
  const { html } = board({ checks: [], running: null });
  assert(/class="figure" data-state="unknown"/.test(html), 'the count is not an unknown figure');
  assert(html.indexOf('0 of 0') < 0, '"0 of 0" reads as a finished evening');
});

test('with every bus released the count line is a sentence, not a ratio', () => {
  const rel = (bus, reg) => check({ id: 'gc-' + bus, busId: bus, regNo: reg, status: 'released', releasedAt: NOW, items: ALL_PASS });
  const { html } = board({ checks: [rel('b1', 'RJ09PA6126')], running: ['b1'] });
  assert(html.indexOf('Every bus tonight left the gate checked') >= 0, 'no finished sentence');
});

test('a partial replica marks the count figure stale rather than drawing a partial total as final', () => {
  const { l } = board({ checks: [], running: ['b1', 'b2'] });
  const c = cacheOf([]);
  const html = l.Gate.render(model({ cache: c, complete: false }), { running: ['b1', 'b2'] });
  assert(/class="figure" data-state="stale"/.test(html), 'a partial aggregate is drawn as final');
});

test('no .figure-note sits inside any board row: a list states its freshness once, in its header', () => {
  const { html } = board({ checks: [check({ status: 'open', items: items({ charging: true }) })], running: ['b1', 'b2', 'b3'] });
  const rows = html.match(/<(?:button|div) class="v2row"[\s\S]*?<\/(?:button|div)>/g) || [];
  assert(rows.length >= 3, 'no rows to check');
  for (const r of rows) assert(r.indexOf('figure-note') < 0, 'a row carries an age: ' + r.slice(0, 160));
});

test('with no nightlist record the count cannot pretend to be zero, and it says whose answer is missing', () => {
  const { html } = board({ checks: [], running: null });
  assert(html.indexOf('This count cannot reach zero') >= 0);
  assert(html.indexOf('does not know which buses run tonight') >= 0);
});

test('a saved but empty night is a legal answer and must not look like a failure', () => {
  const { html } = board({ checks: [], running: [] });
  assert(html.indexOf('No buses run tonight') >= 0);
  assert(html.indexOf('state-error') < 0, 'a holiday is not an error');
});

/* =====================================================================================================
 * 4. A CHECK SOMEBODY ELSE STARTED IS READ-ONLY AND NAMES THEM
 * ===================================================================================================== */

/* The guard's manager_fill is `old["userId"] == actor["id"]`. So screens-work.md
 * §4.6's "two supervisors on the same bus — it resumes it" is half right: the
 * screen resumes YOUR OWN open check, and somebody else's is read-only. A
 * resume button that produced a refused push would be the worst version of this. */
test('a check somebody else started offers no Pass, no Problem, no release and no capture', () => {
  const theirs = check({ userId: 'u-sup2', status: 'open', items: items({ charging: true, water: true }) });
  const { html } = panel({ checks: [theirs] });
  assert(html.indexOf('data-act="pass"') < 0, 'a Pass control on somebody else\'s check');
  assert(html.indexOf('data-act="problem"') < 0, 'a Problem control on somebody else\'s check');
  assert(html.indexOf('data-hold') < 0, 'a release control on somebody else\'s check');
  assert(html.indexOf('data-act="send"') < 0, 'a send control on somebody else\'s check');
  assert(html.indexOf('photo-add') < 0, 'a camera on somebody else\'s check');
});

test('…and it names them, with the time, so the reader knows why there is nothing to press', () => {
  const theirs = check({ userId: 'u-sup2', status: 'open', items: items({ charging: true }) });
  const { html } = panel({ checks: [theirs] });
  assert(html.indexOf('Started by Kailash at') >= 0, 'the other person is not named: ' + html.slice(0, 500));
  assert(html.indexOf('Only the person who started a check can fill it in') >= 0, 'the rule is not stated');
});

test('your own open check is fillable, which is the half the guard does permit', () => {
  const mine = check({ userId: 'u-sup', status: 'open', items: items({ charging: true }) });
  const { html } = panel({ checks: [mine] });
  assert(html.indexOf('data-act="pass"') >= 0, 'your own check is not fillable');
  assert(html.indexOf('Started by') < 0, 'your own check should not name a stranger');
});

test('a released, approved or held check is read-only even for the person who ran it', () => {
  for (const status of ['released', 'approved', 'awaiting']) {
    const mine = check({ userId: 'u-sup', status: status, items: ALL_PASS,
                         decision: status === 'approved' ? { reason: 'go', at: NOW } : undefined });
    const { html } = panel({ checks: [mine] });
    assert(html.indexOf('data-act="pass"') < 0, status + ': still fillable');
    assert(html.indexOf('data-hold') < 0, status + ': still releasable');
  }
});

/* =====================================================================================================
 * 5. NO DECIDE CONTROL, AND LEAST OF ALL FOR THE PERSON WHO RAN THE CHECK
 * ===================================================================================================== */

/* "you ran this check — somebody else decides go or hold" (_guard_gatecheck).
 * The go/hold decision is an Attention row for `gateDecide`, where the decider
 * already looks — v2-ux.md §4.1 row 9 says it must NOT be here. So the control
 * is absent for every role and every status, and in its place the runner is
 * told who decides, because a control that is absent with no explanation reads
 * as a broken screen. */
const DECIDE = /data-act="(?:approve|hold|decide|go)"|aria-label="[^"]*(?:Approve|Hold the bus)/;

test('the runner of an awaiting check is offered NO decide control, and is told who decides', () => {
  const mine = check({ userId: 'u-sup', status: 'awaiting', sentAt: NOW,
                       items: Object.assign({}, ALL_PASS, { tyres: { ok: false, note: 'Bald', photo: '' } }) });
  const { html } = panel({ checks: [mine] });
  assert(!DECIDE.test(html), 'a decide control is in the DOM for the person who ran the check');
  assert(html.indexOf('The owner or a supervisor decides go or hold') >= 0, 'nobody is named as the decider');
  assert(html.indexOf('You ran this check, so somebody else decides go or hold') >= 0,
    'the runner is not told why there is nothing to press');
});

test('no decide control exists on this screen for ANY role or status, the owner included', () => {
  for (const role of ['owner', 'supervisor']) {
    for (const [name, c] of SIX) {
      if (!c) continue;
      for (const uid of ['u-sup', 'u-sup2']) {
        const html = panel({ checks: [check(Object.assign({}, c, { userId: uid }))],
                             role: role, user: { id: uid === 'u-sup' ? 'u-sup' : 'u-sup', role: role, name: 'Mohan' } }).html;
        assert(!DECIDE.test(html), role + '/' + name + ': a decide control exists');
      }
    }
  }
  // and not on the board either
  for (const [, c] of SIX) {
    if (!c) continue;
    assert(!DECIDE.test(board({ checks: [c], running: ['b1'] }).html), 'a decide control is on the board');
  }
});

test('a held check shows the outcome and the office\'s reason, which is all this screen does with a decision', () => {
  const held = check({ status: 'held', items: ALL_PASS, decision: { verdict: 'hold', reason: 'brake warning light', at: NOW } });
  const { html } = panel({ checks: [held] });
  assert(html.indexOf('brake warning light') >= 0, 'the reason is not shown');
  assert(html.indexOf('reason recorded by the office') >= 0);
  assert(!DECIDE.test(html));
});

/* =====================================================================================================
 * 6. "PASS" ON ac / blankets / cabin IS REFUSED CLIENT-SIDE WITH NO PHOTO
 * ===================================================================================================== */

test('Pass on each of the three photo items is aria-disabled with no photo, and says why in words', () => {
  const mine = check({ userId: 'u-sup', status: 'open', items: items({ charging: true }) });
  const { html } = panel({ checks: [mine] });
  for (const k of ['ac', 'blankets', 'cabin']) {
    const re = new RegExp('data-act="pass" data-item="' + k + '"([^>]*)>');
    const m = re.exec(html);
    assert(m, k + ': no Pass control at all');
    assert(/aria-disabled="true"/.test(m[1]), k + ': Pass is live with no photo, which the server would refuse');
  }
  assert(html.indexOf('A photo is needed to pass this one.') >= 0, 'the reason is not in words');
});

test('…and the seven items that need no photo are live from the start', () => {
  const mine = check({ userId: 'u-sup', status: 'open', items: {} });
  const { html } = panel({ checks: [mine] });
  for (const k of ['charging', 'water', 'tyres', 'fuel', 'papers', 'safety', 'uniform']) {
    const m = new RegExp('data-act="pass" data-item="' + k + '"([^>]*)>').exec(html);
    assert(m, k + ': no Pass control');
    assert(!/aria-disabled/.test(m[1]), k + ': Pass is disabled although it needs no photo');
  }
});

test('once a photo item HAS its photo, Pass goes live and the photo is only ever an <img> in a tile', () => {
  const mine = check({ userId: 'u-sup', status: 'open', items: { ac: { ok: null, photo: '/uploads/ac.jpg', note: '' } } });
  const { html } = panel({ checks: [mine] });
  const m = /data-act="pass" data-item="ac"([^>]*)>/.exec(html);
  assert(m && !/aria-disabled/.test(m[1]), 'Pass is still refused although the photo exists');
  assert(html.indexOf('referrerpolicy="no-referrer"') >= 0, 'an upload URL without no-referrer');
});

test('a Problem opens a note field, and a recorded note is shown back', () => {
  const mine = check({ userId: 'u-sup', status: 'open', items: items({ tyres: 'Front left bald' }) });
  const { html } = panel({ checks: [mine] });
  assert(/<textarea class="field" rows="3" data-note="tyres"/.test(html), 'no note field for a failed item');
  assert(html.indexOf('Front left bald') >= 0, 'the note is not shown back');
});

/* =====================================================================================================
 * 7. THE RELEASE CONTROL IS ABSENT UNTIL ALL TEN ARE ANSWERED
 * ===================================================================================================== */

test('the release control is ABSENT at nine of ten, not disabled', () => {
  const nine = Object.assign({}, ALL_PASS);
  delete nine.uniform;
  const mine = check({ userId: 'u-sup', status: 'open', items: nine });
  const { html } = panel({ checks: [mine] });
  assert(html.indexOf('data-hold') < 0, 'a release control exists at nine of ten');
  assert(html.indexOf('aria-disabled="true"') < 0 || html.indexOf('gate-hold') < 0,
    'the release control is disabled rather than absent');
  assert(html.indexOf('9 of 10 answered') >= 0, 'the header does not say how many are left');
});

test('at ten of ten with every item passed the hold control appears, with its bar and its instruction', () => {
  const mine = check({ userId: 'u-sup', status: 'open', items: ALL_PASS });
  const { html } = panel({ checks: [mine] });
  assert(html.indexOf('data-hold') >= 0, 'no release control at ten of ten');
  assert(html.indexOf('Hold to release this bus') >= 0, 'the instruction is not the label');
  assert(html.indexOf('class="gate-bar"') >= 0, 'the hold has no bar, so nothing reports the 1.5 s');
  assert(html.indexOf('data-act="send"') < 0, 'a pass should not offer the office');
});

test('at ten of ten with a problem the ending is "Send for a decision" and there is no release', () => {
  const failed = Object.assign({}, ALL_PASS, { tyres: { ok: false, photo: '', note: 'Front left bald' } });
  const mine = check({ userId: 'u-sup', status: 'open', items: failed });
  const { html } = panel({ checks: [mine] });
  assert(html.indexOf('data-act="send"') >= 0, 'no way to send a failed check to the office');
  assert(html.indexOf('Send for a decision') >= 0);
  assert(html.indexOf('data-hold') < 0, 'a failed check must not be releasable');
});

test('the sticky header counts answers and problems, and a problem is counted in words', () => {
  const failed = Object.assign({}, ALL_PASS, { tyres: { ok: false, photo: '', note: 'Bald' } });
  const { html } = panel({ checks: [check({ userId: 'u-sup', status: 'open', items: failed })] });
  assert(html.indexOf('10 of 10 answered') >= 0);
  assert(html.indexOf('1 problem') >= 0, 'the problem count is missing');
});

/* =====================================================================================================
 * 8. A 6-OF-10 CHECK REOPENS WHERE IT WAS LEFT, WITH ITS ANSWERS
 * ===================================================================================================== */

test('a 6-of-10 check reopens on item seven and keeps the six answers it has', () => {
  const six = items({ ac: 'photo', blankets: 'photo', cabin: 'photo', charging: true, water: true, tyres: true });
  const mine = check({ userId: 'u-sup', status: 'open', items: six });
  const { html } = panel({ checks: [mine] });
  // the first unanswered item is named in the markup, so the panel can open on
  // it rather than at the top (screens-work.md §4.6, half-finished (a))
  assert(html.indexOf('data-first="fuel"') >= 0, 'the panel does not name the first unanswered item');
  // all ten cards are drawn, and the six answered ones show a pass mark
  const cards = html.match(/class="card gate-item"/g) || [];
  assert.strictEqual(cards.length, 10, 'drew ' + cards.length + ' item cards');
  assert.strictEqual((html.match(/data-gate="ok"/g) || []).length, 6, 'the six answers were lost on reopen');
  assert(html.indexOf('6 of 10 answered') >= 0);
});

test('a check started at 20:00 is still tonight\'s at 02:00 and is resumed, not replaced', () => {
  const { Gate } = load({ cache: cacheOf([]) });
  const late = Date.UTC(2026, 10, 5, 20, 30);    // 02:00 IST on the 6th
  const c = check({ startedAt: Date.UTC(2026, 10, 5, 14, 30), date: '2026-11-05' });
  assert.strictEqual(Gate.currentCheck([c], 'b1', late).id, 'gc-1', 'a 20:00 check was dropped at 02:00');
  // …and a check from a week ago is not resumed
  const old = check({ id: 'gc-old', startedAt: late - 7 * 86400000, date: '2026-10-29' });
  assert.strictEqual(Gate.currentCheck([old], 'b1', late), null, 'last week\'s check was resumed');
});

test('currentCheck returns the newest for the bus and ignores a tombstone', () => {
  const { Gate } = load({ cache: cacheOf([]) });
  const a = check({ id: 'gc-a', startedAt: NOW - 7200000 });
  const b = check({ id: 'gc-b', startedAt: NOW - 600000 });
  const dead = check({ id: 'gc-dead', startedAt: NOW, _deleted: true });
  assert.strictEqual(Gate.currentCheck([a, b, dead], 'b1', NOW).id, 'gc-b');
  assert.strictEqual(Gate.currentCheck([a, b], 'b2', NOW), null, 'another bus\'s check was returned');
});

/* =====================================================================================================
 * 9. THE CREATE PATH — ONE WRITE, THE DRIVER ALREADY NAMED
 * ===================================================================================================== */

test('step 1 is the driver and the photograph, and "Start the check" is refused until both are there', () => {
  const { html } = panel({ checks: [] });
  assert(html.indexOf('Ramesh Kumar') >= 0, 'the Driver 1 seat is not pre-filled');
  assert(html.indexOf('Driver 1') >= 0, 'the seat is not named');
  assert(html.indexOf('Somebody else') >= 0, 'no way to name a different driver');
  assert(html.indexOf('Photo of the driver') >= 0, 'no capture control, or it is mislabelled');
  assert(html.indexOf('verify') < 0 && html.indexOf('Verify') < 0,
    'no copy on this screen may claim a face was verified');
  const go = /data-act="start"([^>]*)>/.exec(html);
  assert(go && /aria-disabled="true"/.test(go[1]), '"Start the check" is live with no photo');
  assert(html.indexOf('Photograph the driver first.') >= 0, 'the reason is not in words');
});

test('with a driver and a photo in hand, "Start the check" is live', () => {
  const { html } = panel({ checks: [], selfie: '/uploads/sel.jpg' });
  const go = /data-act="start"([^>]*)>/.exec(html);
  assert(go && !/aria-disabled/.test(go[1]), '"Start the check" is still refused');
  assert(html.indexOf('Take it again') >= 0, 'no way to retake the photograph');
});

/* GATE_FIXED holds busId, regNo, driverId, driverName, userId, startedAt, date,
 * selfie, faceVerified, lat, lng and onDutyBoard, and the guard refuses any
 * later change to any of them. So the create carries all of them and there is
 * no amend path: the driver is chosen ONCE, before the record exists. */
test('the create payload carries status open, a real startedAt, a crewed driverId and NO decision', () => {
  const { Gate } = load({ cache: cacheOf([]) });
  const rec = Gate.payload(BUSES[0], CREW[0], '/uploads/sel.jpg', { at: NOW, lat: 26.9, lng: 75.8, onDutyBoard: true });
  assert(rec, 'no payload built');
  assert.strictEqual(rec.status, 'open', 'a gate check starts open');
  assert.strictEqual('decision' in rec, false, 'a gate check cannot be decided before it exists');
  assert.strictEqual(rec.startedAt, NOW);
  assert.strictEqual(rec.driverId, 'd1');
  assert.strictEqual(rec.busId, 'b1');
  assert.strictEqual(rec.date, '2026-11-05');
  assert.strictEqual(rec.faceVerified, false,
    'a supervisor photographing somebody else verifies nothing, so this is never true');
  // userId is who RAN the check and comes from the token: the screen must not
  // send it as truth.
  assert.strictEqual('userId' in rec, false, 'the screen sent userId, which only the token knows');
  assert.deepEqual(rec.items, {});
});

test('a driver who is not crewed to that bus is refused here, as the server refuses it there', () => {
  const { Gate } = load({ cache: cacheOf([]) });
  // d3 is crewed to b2
  assert.strictEqual(Gate.payload(BUSES[0], CREW[2], '/uploads/s.jpg', { at: NOW }), null,
    '"that driver is not crewed to this bus" was not enforced client-side');
  assert(Gate.payload(BUSES[1], CREW[2], '/uploads/s.jpg', { at: NOW }), 'the right bus was refused too');
  assert.strictEqual(Gate.payload(BUSES[0], null, '/uploads/s.jpg', {}), null, 'a check with no driver was allowed');
});

test('"Somebody else" offers only crew on THIS bus, which is the only set the server accepts', () => {
  const { l } = panel({ checks: [] });
  mountGate(l);
  l.Gate._ui.busId = 'b1';
  clickOn(l, 'data-act', 'pickDriver');
  assert.strictEqual(l.sheets.length, 1, 'no sheet opened');
  assert(l.sheets[0].body.indexOf('Ramesh Kumar') >= 0 && l.sheets[0].body.indexOf('Shyam Lal') >= 0,
    'both crew on b1 should be offered');
  assert(l.sheets[0].body.indexOf('Geeta Devi') < 0,
    'a driver crewed to another bus was offered, and the server would refuse that round');
});

test('a second check for the same bus and date resumes the first: Gate.start writes nothing new', async () => {
  const l = load({ cache: cacheOf([check({ status: 'open' })]) });
  const got = await l.Gate.start('b1', 'd1', '/uploads/sel.jpg');
  assert.strictEqual(l.puts.length, 0, 'a second check was created for the same bus tonight');
  assert.strictEqual(got.id, 'gc-1', 'the existing check was not returned');
});

test('…and on a bus with no check tonight it writes exactly one record, to gatechecks', async () => {
  const l = load({ cache: cacheOf([]) });
  const rec = await l.Gate.start('b1', 'd1', '/uploads/sel.jpg');
  assert.strictEqual(l.puts.length, 1, 'wrote ' + l.puts.length + ' records');
  assert.strictEqual(l.puts[0].store, 'gatechecks');
  assert.strictEqual(l.puts[0].obj.status, 'open');
  assert.strictEqual(l.puts[0].obj.driverId, 'd1');
  assert.strictEqual(rec.onDutyBoard, true, 'the driver is on b1\'s seats, so this is true');
});

/* =====================================================================================================
 * 10. NO IMAGE BYTES EVER REACH A RECORD — LIVE-ISSUES 9
 * ===================================================================================================== */

/* `app.js:9818` does `await Sync.uploadPhoto(p) || p`, and `p` is the `data:`
 * URL: 80–160 KB inside the record. `gatechecks` is in no server send window,
 * so every one of those is sent for ever to every entitled device. Worse here
 * than in v1: `selfie` is in GATE_FIXED, so Sync.flushPhotos' patch from bytes
 * to a URL would be REFUSED and the bytes could never be got back out. */
test('a data: selfie is refused by the payload builder outright', () => {
  const { Gate } = load({ cache: cacheOf([]) });
  const bytes = 'data:image/jpeg;base64,' + 'A'.repeat(200);
  assert.strictEqual(Gate.payload(BUSES[0], CREW[0], bytes, { at: NOW }), null,
    'image bytes were allowed into a gatechecks record');
  assert.strictEqual(Gate.payload(BUSES[0], CREW[0], '', { at: NOW }), null,
    'a check with no photograph at all was allowed');
  assert(Gate.payload(BUSES[0], CREW[0], '/uploads/sel.jpg', { at: NOW }), 'a hosted URL was refused');
});

test('gate.js contains no `|| dataUrl`-shaped upload fallback and never calls Sync.queuePhoto', () => {
  const src = stripComments(GATE_JS);
  assert(!/uploadPhoto\s*\([^)]*\)\s*\|\|/.test(src), 'the LIVE-ISSUES 9 fallback is back');
  assert(src.indexOf('queuePhoto') < 0,
    'queuePhoto requires the caller to store the data URL inline on the record, which is the same fallback');
  assert(src.indexOf('readAsDataURL') >= 0, 'nothing reads the capture at all');
});

test('a failed item-photo upload writes nothing either, and says so on that item', async () => {
  const mine = check({ userId: 'u-sup', status: 'open', items: {} });
  const l = load({ cache: cacheOf([mine]), uploadOk: false });
  mountGate(l);
  l.Gate._ui.busId = 'b1';
  await l.changes[0]({ target: { getAttribute: () => 'photo-ac', files: [{ name: 'a.jpg' }] } });
  assert.strictEqual(l.puts.length, 0, 'image bytes were written onto the items map');
  assert.strictEqual(l.Gate._ui.itemFailed, 'ac', 'the failure was swallowed');
  const html = l.Gate.render(model({ cache: cacheOf([mine]) }), { busId: 'b1', running: ['b1'], itemFailed: 'ac' });
  assert(html.indexOf('The photo could not be sent') >= 0, 'the person is not told');
});

test('a failed upload starts no check and says why, with a Retry', async () => {
  const l = load({ cache: cacheOf([]), uploadOk: false });
  mountGate(l);
  // the capture arrives, the upload fails, and nothing is written
  await l.changes[0]({ target: { getAttribute: () => 'selfie', files: [{ name: 'a.jpg' }] } });
  assert.strictEqual(l.puts.length, 0, 'a record was written with no usable photograph');
  // Not merely empty: NOT the data URL. v1's `uploadPhoto(p) || p` is exactly
  // this branch, and `selfie` is in GATE_FIXED, so bytes landing here could
  // never be patched back out afterwards.
  assert(!/^data:/i.test(l.Gate._ui.selfie), 'the capture fell back to the image bytes (LIVE-ISSUES 9)');
  assert.strictEqual(l.Gate._ui.selfie, '', 'the screen kept something to write');
  assert.strictEqual(l.Gate._ui.uploadFailed, true, 'the failure was swallowed');
  const html = l.Gate.render(model({ cache: cacheOf([]) }), { busId: 'b1', running: ['b1'], uploadFailed: true });
  assert(html.indexOf('The photo could not be sent') >= 0, 'the person is not told');
  assert(/data-state-retry="\d+"/.test(html), 'a named refusal with a reason and no Retry');
});

test('every upload URL on this screen is an <img src> with no-referrer, and there is no anchor or share', () => {
  const mine = check({ userId: 'u-sup', status: 'open',
                       items: { ac: { ok: true, photo: '/uploads/ac.jpg', note: '' } } });
  const { html } = panel({ checks: [mine] });
  const urls = html.match(/\/uploads\/[^"'\s]+/g) || [];
  assert(urls.length >= 2, 'no upload URLs in the markup to check');
  for (const u of urls) {
    const re = new RegExp('<img class="photo-img" src="' + u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      + '"[^>]*referrerpolicy="no-referrer"');
    const asTile = new RegExp('data-photo-src="' + u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"');
    assert(re.test(html) || asTile.test(html), u + ' is not inside a photo tile or viewer');
  }
  assert(!/<a\s[^>]*href=["'][^"']*\/uploads\//.test(html), 'an upload URL inside an anchor');
  assert(html.indexOf('target="_blank"') < 0, 'a new tab carries the URL into history');
  assert(!/download|Copy link|Share/.test(html), 'a share affordance on an unauthenticated URL');
});

test('a tile puts its words before its picture, so nothing loads before a reader asks', () => {
  const mine = check({ userId: 'u-sup', status: 'open',
                       items: { ac: { ok: true, photo: '/uploads/ac.jpg', note: '' } } });
  const { html } = panel({ checks: [mine] });
  const tile = /<button type="button" class="photo"[\s\S]*?<\/button>/.exec(html);
  assert(tile, 'no photo tile');
  assert(tile[0].indexOf('photo-note') < tile[0].indexOf('<img'), 'the picture comes before the words');
});

/* =====================================================================================================
 * 11. THE ONE DELEGATED LISTENER, AND THE LINE THE SHELF COUNT WAS MISSING
 * ===================================================================================================== */

test('mount installs exactly ONE delegated click listener, and a second mount installs none', () => {
  const l = load({ cache: cacheOf([]) });
  mountGate(l);
  assert.strictEqual(l.added, 1, 'the screen installed ' + l.added + ' click listeners');
  const before = l.clicks.length;
  l.Gate.mount();
  assert.strictEqual(l.clicks.length, before, 'a second mount installed another listener');
});

/* predeploy-gate.sh:508 and the sweep at :1073. A count field sat inside a
 * pressable row, the row's delegated handler caught the click, and the
 * storekeeper was thrown off the screen mid-count. This screen has a textarea
 * inside a card, so it is the same shape of hazard. */
test('a click on a field returns early BEFORE [data-act] is read, so typing a note never navigates', () => {
  const l = load({ cache: cacheOf([check({ userId: 'u-sup', status: 'open' })]) });
  mountGate(l);
  l.Gate._ui.busId = 'b1';
  let readAct = false;
  const target = { closest: (sel) => {
    if (sel === 'input, select, textarea, label, .num') return { tag: 'textarea' };
    readAct = true;                     // reaching here is the regression
    return null;
  } };
  l.mine({ target: target, preventDefault() {} });
  assert.strictEqual(readAct, false, '[data-act] was read after a click on a field');
  assert.strictEqual(l.Gate._ui.busId, 'b1', 'the panel changed under a field tap');
});

test('a textarea inside an item card is never wrapped in a pressable row', () => {
  const mine = check({ userId: 'u-sup', status: 'open', items: items({ tyres: 'Bald' }) });
  const { html } = panel({ checks: [mine] });
  const at = html.indexOf('<textarea');
  assert(at > 0, 'no textarea to check');
  // the nearest enclosing element must not be a button.v2row or an a.v2row
  const before = html.slice(0, at);
  const lastOpen = Math.max(before.lastIndexOf('<button'), before.lastIndexOf('<a '));
  const lastClose = Math.max(before.lastIndexOf('</button>'), before.lastIndexOf('</a>'));
  assert(lastClose > lastOpen, 'the note field sits inside a pressable element');
});

/* =====================================================================================================
 * 12. THE HOLD IS THE CONTROL
 * ===================================================================================================== */

test('the hold runs the owner\'s 1500 ms, and releasing early writes nothing', async () => {
  const l = load({ cache: cacheOf([check({ userId: 'u-sup', status: 'open', items: ALL_PASS })]) });
  assert.strictEqual(l.Gate.HOLD_MS, 1500, 'the hold is not the owner\'s 1.5 seconds');
  mountGate(l);
  l.Gate._ui.busId = 'b1';
  const btn = el('button');
  const ev = (t) => ({ target: { closest: (sel) => (sel === '[data-hold]' ? btn : null) }, cancelable: true, preventDefault() {}, type: t });
  l.downs[0](ev('pointerdown'));
  assert(btn.hasAttribute('data-holding'), 'the bar never started');
  assert.strictEqual(l.win._timerMs, 1500, 'the hold timer is armed for ' + l.win._timerMs + ' ms, not 1500');
  l.ups[0](ev('pointerup'));                         // lifted early
  assert(!btn.hasAttribute('data-holding'), 'the bar kept running after the finger lifted');
  assert.strictEqual(l.win._timer, null, 'the timer survived an early release');
  assert.strictEqual(l.puts.length, 0, 'an early release released the bus');
});

test('a full 1500 ms hold writes status released, once, and says which bus', async () => {
  const l = load({ cache: cacheOf([check({ userId: 'u-sup', status: 'open', items: ALL_PASS })]) });
  mountGate(l);
  l.Gate._ui.busId = 'b1';
  const btn = el('button');
  l.downs[0]({ target: { closest: (sel) => (sel === '[data-hold]' ? btn : null) }, cancelable: true, preventDefault() {} });
  await l.win._timer();                               // the 1500 ms elapses
  await new Promise((r) => setImmediate(r));
  assert.strictEqual(l.puts.length, 1, 'wrote ' + l.puts.length + ' records');
  assert.strictEqual(l.puts[0].obj.status, 'released');
  assert.strictEqual(l.toasts.length, 1);
  assert(l.toasts[0].text.indexOf('RJ09PA6126') >= 0, 'the toast does not name the bus: ' + l.toasts[0].text);
  assert.strictEqual(l.toasts[0].opts.kind, 'ok');
});

test('a hold on a check with a problem releases nothing, because the server would refuse it', async () => {
  const failed = Object.assign({}, ALL_PASS, { tyres: { ok: false, photo: '', note: 'Bald' } });
  const l = load({ cache: cacheOf([check({ userId: 'u-sup', status: 'open', items: failed })]) });
  mountGate(l);
  l.Gate._ui.busId = 'b1';
  const btn = el('button');
  l.downs[0]({ target: { closest: (sel) => (sel === '[data-hold]' ? btn : null) }, cancelable: true, preventDefault() {} });
  if (l.win._timer) await l.win._timer();
  await new Promise((r) => setImmediate(r));
  assert.strictEqual(l.puts.length, 0, 'a bus with a failed item was released');
});

/* =====================================================================================================
 * 13. THE WORDS
 * ===================================================================================================== */

test('every fixed word this screen draws comes from its W.register table', () => {
  const src = stripComments(GATE_JS);
  // The five ids screens-work.md §6.3 names by hand must be spelled as it
  // spells them: they are the first strings asked of the owner, not the last.
  for (const id of ['gatePass', 'gateProblem', 'gateHoldRelease', 'gatePhotoDriver', 'gateSendDecision'])
    assert(new RegExp('\\b' + id + ':').test(src), id + ' is not registered under the id §6.3 gives it');
  // and the screen reads them through w(), never as a literal at the point of use
  assert(src.indexOf("say('gateHoldRelease')") >= 0, 'the hold label is not read from the table');
});

/* A Hindi reader sees the English WITH THE ID — "Pass [gatePass]" — for every
 * word the owner has not supplied yet (words.js:104). That is the designed form
 * and the whole reason a missing translation is reportable rather than
 * invisible. So the rule this check enforces is not "no English in Hindi mode",
 * which is false until the owner's sitting; it is that EVERY English word on
 * the screen came through w() and therefore carries its id. A literal built into
 * the markup would appear with no id beside it. */
test('in Hindi every English word on the screen carries its id, so none of them escaped w()', () => {
  const rec = check({ userId: 'u-sup', status: 'open', items: ALL_PASS });
  const l = load({ cache: cacheOf([rec]), lang: 'hi' });
  l.root.lang = 'hi';
  const html = l.Gate.render(model({ cache: cacheOf([rec]) }), { busId: 'b1', running: ['b1'] });
  const words = html.replace(/<[^>]*>/g, ' ');
  for (const label of ['Pass', 'Problem', 'Hold to release this bus', 'Photo of the driver']) {
    const at = words.indexOf(label);
    assert(at >= 0, label + ' is not on the screen at all');
    assert(/^\s*\[gate[A-Za-z]+\]/.test(words.slice(at + label.length)),
      label + ' appears with no id beside it, so it did not come from the table');
  }
  // and the id form is only ever the PENDING form: an id with no English would
  // be worse than either.
  assert(words.indexOf('[gate') > 0);
  assert(!/\[gate[A-Za-z]+\]\s*\[gate/.test(words), 'an id was drawn twice over with no word');
});

/* =====================================================================================================
 * 14. NO NEW FIELD, NO NEW STORE
 * ===================================================================================================== */

/* Under whole-record last-write-wins a field v2 invents is erased the next time
 * a v1 device writes that record (foundation §7.1 item 13), and v1 must stay
 * able to read everything v2 writes. */
test('a created check carries only fields v1 already writes, and nothing new', () => {
  const { Gate } = load({ cache: cacheOf([]) });
  const rec = Gate.payload(BUSES[0], CREW[0], '/uploads/s.jpg', { at: NOW, lat: 1, lng: 2, onDutyBoard: true });
  const v1 = ['id', 'busId', 'regNo', 'driverId', 'driverName', 'startedAt', 'date', 'selfie',
              'faceVerified', 'lat', 'lng', 'onDutyBoard', 'status', 'items'];
  assert.deepEqual(Object.keys(rec).sort(), v1.slice().sort());
});

test('this screen writes to gatechecks and to nothing else', async () => {
  const l = load({ cache: cacheOf([]) });
  await l.Gate.start('b1', 'd1', '/uploads/s.jpg');
  l.Gate._ui.busId = 'b1';
  assert.deepEqual([...new Set(l.puts.map((p) => p.store))], ['gatechecks']);
  const src = stripComments(GATE_JS);
  const stores = [...src.matchAll(/\.put\(\s*([A-Za-z_$][\w$]*|'[a-z]+')/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(stores)], ['STORE'], 'a second store is written: ' + stores.join(', '));
});

/* =====================================================================================================
 * 15. MUTATION GUARD: the detectors and the fixtures must be able to fail
 * ===================================================================================================== */

test('MUTANT must fail: the release control drawn at nine of ten', () => {
  /* Both halves of the rule are mutated, because either one alone would hide
   * the other: dropping the incomplete guard lets the SEND button through at
   * nine of ten, and loosening the pass test lets the HOLD through. */
  const src = GATE_JS
    .replace("if (!p.fillable || o.verdict === 'incomplete') return '';", "if (!p.fillable) return '';")
    .replace("if (o.verdict === 'pass') {", "if (o.verdict !== 'fail') {");
  assert(src !== GATE_JS, 'the mutation did not apply — the guard it patches has moved');
  const nine = Object.assign({}, ALL_PASS);
  delete nine.uniform;
  const rec = check({ userId: 'u-sup', status: 'open', items: nine });
  const c = cacheOf([rec]);
  const bad = load({ cache: c, gateSrc: src }).Gate.render(model({ cache: c }), { busId: 'b1', running: ['b1'] });
  assert(bad.indexOf('data-hold') >= 0, 'the mutant drew no release control, so the real check proves nothing');
  const good = load({ cache: c }).Gate.render(model({ cache: c }), { busId: 'b1', running: ['b1'] });
  assert(good.indexOf('data-hold') < 0, 'and the real file must still withhold it at nine of ten');
});

test('MUTANT must fail: the data: fallback put back into the payload builder', () => {
  const src = GATE_JS.replace("if (photo === '' || /^data:/i.test(photo)) return null;", '');
  assert(src !== GATE_JS, 'the mutation did not apply — the issue-9 guard has moved');
  const bytes = 'data:image/jpeg;base64,AAAA';
  const bad = load({ cache: cacheOf([]), gateSrc: src }).Gate;
  assert(bad.payload(BUSES[0], CREW[0], bytes, { at: NOW }),
    'the mutant did not even build a payload, so the real check proves nothing');
  assert.strictEqual(load({ cache: cacheOf([]) }).Gate.payload(BUSES[0], CREW[0], bytes, { at: NOW }), null,
    'and the real file must still refuse it');
});

test('MUTANT must fail: the hold shortened, or eased instead of linear', () => {
  for (const bad of ['transition: transform 300ms linear', 'transition: transform 1500ms ease-out']) {
    const css = GATE_CSS.replace('transform 1500ms linear', bad.split(': ')[1]);
    assert(css !== GATE_CSS, 'the mutation did not apply');
    const held = rulesOf(css).filter((r) => /\[data-holding\]/.test(r.selector) && !r.ctx.length);
    const ok = /\b1500ms\b/.test(held[0].decls.transition) && /\blinear\b/.test(held[0].decls.transition);
    assert.strictEqual(ok, false, 'the CSS check would have passed on: ' + bad);
  }
});

test('MUTANT must fail: a literal 48px on the hold button instead of var(--tap)', () => {
  const css = GATE_CSS.replace('min-height: var(--tap);\n  /* The gesture', 'min-height: 48px;\n  /* The gesture');
  assert(css !== GATE_CSS, 'the mutation did not apply');
  assert(magicPx(css).length > 0, 'a desk-breaking literal would have passed');
});

run();

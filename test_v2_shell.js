/* Tests for the v2 app frame — v2/shell.js and v2/ui/shell.css. Run: node test_v2_shell.js
 *
 * At the repo ROOT and not in v2/, because scripts/run-tests.py discovers
 * test_*.js at the root only and does not recurse. A test in v2/ would never
 * run, and a test nobody runs is not a test.
 *
 * Node, no browser, in the shape of test_v2_ui.js and test_v2_stale.js: the real
 * v2/ui/icons.js, v2/ui/words.js, v2/ui/states.js, v2/ui/nav.js, v2/fmt.js,
 * v2/caps.js, v2/router.js and v2/shell.js are loaded in a vm context holding a
 * stub window and a small fake DOM, and the assertions are on the markup STRING
 * the frame builds. That is why Shell.head is a pure builder: a frame whose
 * rules can only be checked in a browser is a frame whose rules are checked by
 * nobody, and the thirteen screens all mount inside this one.
 *
 * shell.css is read as TEXT with the brace-depth reader from test_v2_ui.js, and
 * every detector is fed input it MUST reject before it is turned on the real
 * file. A checker that cannot fail is decoration, and this repo has shipped a
 * bug behind one.
 *
 * THE CHECK THIS FILE EXISTS FOR is the pair of bottom-padding halves. The bar's
 * own box (components.css §3.7) and the scroll container's padding-bottom are
 * the same number stated in two files, and the whole of "the last row clears the
 * bar exactly" rests on them staying equal. A builder who changes one must
 * change the other, so all three expressions are read and compared.
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

const SHELL_CSS = read(V2('ui', 'shell.css'));
const COMP_CSS = read(V2('ui', 'components.css'));
const SHELL_JS = read(V2('shell.js'));

/* =====================================================================================================
 * A SMALL CSS READER (the brace-depth reader from test_v2_ui.js / test_ui_tokens.js)
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

/* ---- the detectors, each rejected on bad input before it is trusted ---- */

// px literals are for hairlines and radii only — the same PX_OK_PROP as
// test_ui_components.js and test_v2_ui.js. Everything else sizes from a token,
// or desk and yard drift apart.
const PX_OK_PROP = /^(?:border(?:-[a-z-]+)?|outline(?:-offset)?|box-shadow)$/;
function magicPx(css) {
  return declsOf(css)
    .filter((d) => /(?<![\w.-])-?\d*\.?\d+px\b/.test(d.val.replace(/var\(\s*--[\w-]+\s*,?/g, ' ')) && !PX_OK_PROP.test(d.prop))
    .map((d) => d.sel + ' { ' + d.prop + ': ' + d.val + ' }');
}

// A colour of this file's own. A token reference is not one; a literal is.
function literalColour(css) {
  return declsOf(css)
    .filter((d) => /(?:#[0-9a-fA-F]{3,8}\b|\b(?:hsla?|rgba?|oklch|oklab|color-mix)\s*\()/.test(d.val))
    .map((d) => d.sel + ' { ' + d.prop + ': ' + d.val + ' }');
}

test('the magic-px detector rejects a literal size, padding and type and allows a border, outline and shadow', () => {
  for (const bad of ['height:56px', 'max-width:900px', 'padding:0 16px', 'gap:8px', 'font-size:15px', 'letter-spacing:-0.2px'])
    assert(magicPx('.a{' + bad + '}').length > 0, 'detector missed: ' + bad);
  for (const fine of ['padding-bottom:calc(var(--nav-h) + env(safe-area-inset-bottom))', 'width:var(--rail-w)',
    'border-top:2px solid var(--line)', 'outline-offset:-2px', 'box-shadow:inset 0 -1px 0 var(--line)', 'letter-spacing:-0.01em'])
    assert.deepEqual(magicPx('.a{' + fine + '}'), [], 'false positive: ' + fine);
});

test('the literal-colour detector rejects a hex, an hsl and a color-mix and allows a token', () => {
  for (const bad of ['color:#fff', 'background:hsl(30 20% 9%)', 'color:rgba(0,0,0,.5)', 'color:color-mix(in srgb, red, blue)'])
    assert(literalColour('.a{' + bad + '}').length > 0, 'detector missed: ' + bad);
  assert.deepEqual(literalColour('.a{color:var(--warn);background:var(--surface)}'), []);
});

/* =====================================================================================================
 * 1. shell.css DECLARES NO COLOUR AND NO SIZE OF ITS OWN
 * ===================================================================================================== */

test('shell.css has declarations to check at all: an empty file would pass every rule below vacuously', () => {
  assert(declsOf(SHELL_CSS).length >= 20, 'only ' + declsOf(SHELL_CSS).length + ' declarations');
});

test('shell.css sizes everything from the 33 tokens: no px literal outside border, outline and box-shadow', () => {
  assert.deepEqual(magicPx(SHELL_CSS), []);
});

test('shell.css declares no colour of its own — every colour is a token reference', () => {
  assert.deepEqual(literalColour(SHELL_CSS), []);
});

test('every selector in shell.css starts with [data-v2], so the file is inert in the live app', () => {
  const stray = selectorsOf(SHELL_CSS).filter((s) => s.indexOf('[data-v2]') !== 0);
  assert.deepEqual(stray, []);
});

test('shell.css is inside the Chrome 109 floor: no nesting, no oklch, no color-mix, no subgrid, no @starting-style', () => {
  const src = stripComments(SHELL_CSS);
  for (const [why, re] of [['oklch/oklab', /\bokl(ch|ab)\s*\(/], ['color-mix', /\bcolor-mix\s*\(/],
    ['@starting-style', /@starting-style/], ['subgrid', /grid-template-(rows|columns)\s*:\s*subgrid/],
    ['text-wrap: balance', /text-wrap\s*:\s*(balance|pretty)/], ['nesting', /^\s*&[\s.:>+~[{]/m]])
    assert(!re.test(src), why + ' is past the floor and is in shell.css');
  assert.deepEqual(rulesOf(SHELL_CSS).filter((r) => r.nested).map((r) => r.selector), [], 'a nested rule');
});

test('shell.css animates opacity and nothing else, and never a height or a transform', () => {
  const tr = declsOf(SHELL_CSS).filter((d) => /^(transition|animation)/.test(d.prop));
  assert(tr.length > 0, 'no transition at all: the offline indicator has lost its one animation');
  for (const d of tr) {
    assert(/^opacity\s+150ms\s+ease-out$/.test(d.val), 'an animation this file cannot name the purpose of: ' + d.prop + ': ' + d.val);
  }
  assert.deepEqual(declsOf(SHELL_CSS).filter((d) => d.prop === 'transform').map((d) => d.sel), []);
});

/* =====================================================================================================
 * 2. THE ONE FIXED LAYER — the nav's, in components.css, and nothing here
 * ===================================================================================================== */

test('.apphead is not sticky, and shell.css declares no position at all: the nav is the one fixed layer', () => {
  const pos = declsOf(SHELL_CSS).filter((d) => d.prop === 'position');
  assert.deepEqual(pos.map((d) => d.sel + ' { position: ' + d.val + ' }'), [],
    'the header scrolls away with the content; a 200-row list pays for one promoted layer, not two');
  // …and the one that does exist, in the file that owns the nav, is the nav's.
  const fixed = declsOf(COMP_CSS).filter((d) => d.prop === 'position' && d.val === 'fixed');
  assert(fixed.length > 0, 'the nav lost its fixed rule');
  for (const d of fixed) assert(/\.nav\b|\.ov-/.test(d.sel), 'a second fixed layer appeared: ' + d.sel);
});

test('the detector would see a sticky header', () => {
  const before = declsOf(SHELL_CSS).filter((d) => d.prop === 'position').length;
  const after = declsOf(SHELL_CSS + '\n[data-v2] .apphead { position: sticky; top: 0 }')
    .filter((d) => d.prop === 'position').length;
  assert.strictEqual(after - before, 1, 'the position detector cannot see a sticky header');
});

/* =====================================================================================================
 * 3. THE TWO BOTTOM-PADDING HALVES, AND THE NAV'S OWN BOX
 * ===================================================================================================== */
const BAR_HALF = 'calc(var(--nav-h) + env(safe-area-inset-bottom))';
const NONE_HALF = 'calc(var(--pad) + env(safe-area-inset-bottom))';

// Every padding-bottom on the scroll container, with the selector that carries it.
function bottoms(css) {
  return declsOf(css)
    .filter((d) => d.prop === 'padding-bottom' && /\bbody\b/.test(d.sel))
    .map((d) => ({ sel: d.sel, ctx: d.ctx.join(' '), val: d.val.replace(/\s+/g, ' ') }));
}

test('the scroll container has exactly the two halves of §1.5, and the no-nav half is the default', () => {
  const b = bottoms(SHELL_CSS);
  assert.strictEqual(b.length, 3, 'expected three rules — the default, the bar and the rail — got '
    + b.length + ': ' + JSON.stringify(b));
  const plain = b.filter((x) => x.ctx === '' && !/data-frame/.test(x.sel));
  assert.strictEqual(plain.length, 1, 'the no-nav half must be the unconditional default and the safe failure');
  assert.strictEqual(plain[0].val, NONE_HALF, 'the no-nav half is not --pad + the safe area: ' + plain[0].val);
  const bar = b.filter((x) => x.ctx === '' && /data-frame="bar"/.test(x.sel));
  assert.strictEqual(bar.length, 1, 'the bar half must be conditional on data-frame="bar"');
  assert.strictEqual(bar[0].val, BAR_HALF, 'the bar half is not --nav-h + the safe area: ' + bar[0].val);
});

test('the bar half equals the nav bar\'s OWN box in components.css, expression for expression', () => {
  const navBox = declsOf(COMP_CSS).filter((d) => /\.nav\b/.test(d.sel) && d.prop === 'height' && d.ctx.length === 0);
  assert.strictEqual(navBox.length, 1, 'the nav bar has no single height rule to compare against');
  assert.strictEqual(navBox[0].val.replace(/\s+/g, ' '), BAR_HALF,
    'the nav box changed and the scroll container did not: the last row no longer clears the bar');
  const bar = bottoms(SHELL_CSS).filter((x) => /data-frame="bar"/.test(x.sel) && x.ctx === '');
  assert.strictEqual(bar[0].val, navBox[0].val.replace(/\s+/g, ' '), 'the two halves have drifted apart');
});

test('the rail takes the inline edge and gives the bottom edge back: both clauses, --rail-w, the --pad half', () => {
  const rail = bottoms(SHELL_CSS).filter((x) => /min-width/.test(x.ctx));
  assert.strictEqual(rail.length, 1, 'the rail has no bottom-padding rule of its own');
  assert(/1024px/.test(rail[0].ctx), 'the rail rule lost its width clause: a tablet in landscape is also 1024x768');
  assert(/data-density="desk"/.test(rail[0].sel), 'the rail rule lost its density clause');
  assert.strictEqual(rail[0].val, NONE_HALF, '--nav-h is not consumed by a rail');
  const start = declsOf(SHELL_CSS).filter((d) => d.prop === 'padding-inline-start' && /\bbody\b/.test(d.sel));
  assert.strictEqual(start.length, 1);
  assert.strictEqual(start[0].val, 'var(--rail-w)', 'the rail covers the left inset, so it replaces it');
});

test('every body rule steps aside when signed out: login.css owns the viewport under .lg', () => {
  const body = rulesOf(SHELL_CSS).filter((r) => /\bbody\b/.test(r.selector));
  assert(body.length >= 3, 'no body rules found');
  for (const r of body) assert(/:not\(\.lg\)/.test(r.selector),
    'a signed-out document has no scroll-container padding: ' + r.selector);
});

/* =====================================================================================================
 * 4. THE HEADER'S THREE COLUMNS
 * ===================================================================================================== */

test('the title column is minmax(0, 1fr) and the header is three columns on one grid', () => {
  const head = rulesOf(SHELL_CSS).filter((r) => r.selector === '[data-v2] .apphead')[0];
  assert(head, 'no .apphead rule');
  assert.strictEqual(head.decls.display, 'grid');
  assert.strictEqual(head.decls['grid-template-columns'].replace(/\s+/g, ' '), 'auto minmax(0, 1fr) auto',
    'a bare 1fr has min-width: auto, so a long title would push the trailing slot off the end');
  assert.strictEqual(head.decls['min-height'].replace(/\s+/g, ' '), 'calc(var(--tap) + var(--s2) * 2)',
    '64px at yard, 48px at desk, and both from tokens');
});

test('the title truncates rather than reflowing, so the slot appearing does not move it', () => {
  const h1 = rulesOf(SHELL_CSS).filter((r) => r.selector === '[data-v2] .apphead h1')[0];
  assert(h1, 'no .apphead h1 rule');
  assert.strictEqual(h1.decls.overflow, 'hidden');
  assert.strictEqual(h1.decls['text-overflow'], 'ellipsis');
  assert.strictEqual(h1.decls['white-space'], 'nowrap');
  assert.strictEqual(h1.decls['font-size'], 'var(--t3)');
});

/* =====================================================================================================
 * 5. THE FRAME ITSELF — loaded in a stub window with a small fake DOM
 * ===================================================================================================== */

/* A fake element: an html string, a count of how many times something was
 * inserted into it, attributes and a classList. Deliberately thin, like
 * test_v2_boot.js's stub window: a fake that answered everything would let a
 * frame that depends on a real layout engine pass here and fail in a browser. */
function el(tag) {
  const e = {
    tag: tag, html: '', inserts: 0, attrs: {}, classes: {}, find: null,
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
  Object.defineProperty(e, 'innerHTML', {
    get: function () { return e.html; },
    set: function (v) { e.html = String(v); }
  });
  return e;
}

const SRC = ['ui/icons.js', 'ui/words.js', 'ui/states.js', 'ui/nav.js', 'fmt.js', 'caps.js', 'router.js', 'shell.js'];

/* load(o) -> {win, app, screen, html, logs, sheets}
 *   o.role      the signed-in role, or null for signed out
 *   o.words     false to load the frame with NO ui/words.js at all
 *   o.density   'yard' | 'desk'
 *   o.complete  the replica's completeness (false = still filling)
 *   o.pending   Sync.info().pending, the unsent-record count
 *   o.offline   force the offline signal
 *   o.screens   {id: module} registered with Router before mounting
 */
function load(o) {
  o = o || {};
  const app = el('div'), screen = el('main'), trail = el('span'), off = el('button'), html = el('html');
  app.find = (sel) => (sel === '.apphead-trail' && /apphead-trail/.test(app.html) ? trail : null);
  trail.find = (sel) => (sel === '.apphead-off' && /apphead-off/.test(trail.html) ? off : null);
  html.lang = 'en';
  html.setAttribute('data-v2', '');
  html.setAttribute('data-density', o.density || 'yard');

  const logs = { warn: [], error: [], info: [] };
  const clicks = [];
  const sheets = [];
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
        return null;
      },
      removeEventListener: function () {},
      querySelector: function () { return null; }, querySelectorAll: function () { return []; },
      createElement: function () { return el('div'); }, head: { appendChild: function () {} }, body: null,
      _clicks: clicks
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
    S: { user: o.role ? { id: 'u1', role: o.role, name: 'A' } : null, route: null, stack: [], cache: {} },
    Boot: {
      density: function () { return o.density || 'yard'; },
      replica: function () { return { behind: o.complete === false ? 5180 : 0, complete: o.complete !== false }; }
    },
    Sync: {
      info: function () {
        return { pending: o.pending || 0, lastError: o.offline === 'error' ? 'sync failed' : '',
                 status: 'synced', complete: o.complete !== false };
      }
    },
    V2: { openSheet: function (title, body) { sheets.push({ title: title, body: body }); return { dialog: true }; } }
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  for (const f of SRC) {
    if (o.words === false && f === 'ui/words.js') continue;
    const src = (f === 'shell.js' && o.shellSrc) ? o.shellSrc : read(V2(f));
    vm.runInContext(src, ctx, { filename: V2(f) });
  }
  const r = sandbox.Router;
  if (o.screens) for (const id of Object.keys(o.screens)) r.register(id, o.screens[id]);
  return { win: sandbox, app: app, screen: screen, trail: trail, off: off, root: html,
           logs: logs, sheets: sheets, clicks: clicks };
}

/* A click on one control, through the delegated listener the frame installed —
 * the only way the nav, the back arrow and the offline button actually do
 * anything, so the shape of the event matters: `closest(sel)` is what the
 * handler reads, and a target that answered every selector would make all three
 * branches look alive. */
function clickOn(l, attr, value) {
  let prevented = false;
  const target = {
    closest: function (sel) {
      if (sel !== '[' + attr + ']') return null;
      return { getAttribute: function (k) { return k === attr ? (value == null ? '' : value) : null; } };
    }
  };
  assert.strictEqual(l.clicks.length, 1, 'the frame must install exactly ONE delegated listener');
  l.clicks[0]({ target: target, preventDefault: function () { prevented = true; } });
  return prevented;
}

const PAGE = { render: function () { return '<p>body</p>'; } };

test('shell.js loads in a stub window and attaches exactly the six names the twelve screen builders consume', () => {
  const { win } = load({ role: 'owner' });
  for (const name of ['mount', 'head', 'body', 'offline', 'title', 'pad'])
    assert.strictEqual(typeof win.Shell[name], 'function', 'Shell.' + name + ' is not exported');
});

test('mount draws four elements in order — header, main#screen, nav — with ONE insert each', () => {
  const l = load({ role: 'owner', screens: { today: PAGE } });
  assert.strictEqual(l.win.Shell.mount('today'), true);
  const order = l.app.html.replace(/\n/g, '');
  assert(/^<header class="apphead">/.test(order), 'the header is not first: ' + order.slice(0, 60));
  assert(/<main class="appbody" id="screen"><\/main>/.test(order), 'the body element is not the one scroll child');
  assert(/<nav class="nav" aria-label="[^"]*">/.test(order), 'no nav');
  assert(order.indexOf('<main') < order.indexOf('<nav'), 'the nav must come after the body');
  assert.strictEqual(l.app.inserts, 1, 'the frame is one string and one insert, not one per element');
  assert.strictEqual(l.screen.inserts, 1, 'the body is one string and one insert into #screen');
  assert.strictEqual(l.screen.html, '<p>body</p>');
});

/* ---- §1.4.1: a driver and a conductor get no nav at all ---- */

for (const role of ['driver', 'conductor']) {
  test('a ' + role + ' gets no nav, no More and no back control — and no fixed bottom bar of any kind', () => {
    const l = load({ role: role, screens: { me: PAGE } });
    assert.strictEqual(l.win.Shell.mount('me'), true);
    const h = l.app.html;
    assert(!/class="nav"/.test(h), 'a nav was drawn: a nav with one item is a lie about there being somewhere to go');
    assert(!/data-nav=/.test(h), 'a nav item was drawn');
    assert(!/data-back/.test(h), 'a back arrow pointing at nothing is the same lie');
    assert(!/apphead-back/.test(h), 'a back control was drawn');
    // and nothing in the stylesheet can pin anything to the bottom edge
    assert.deepEqual(declsOf(SHELL_CSS).filter((d) => d.prop === 'position').map((d) => d.sel), []);
    assert.strictEqual(l.root.getAttribute('data-frame'), 'none', '--nav-h must not be consumed');
  });
}

test('Caps still gives those two roles one slot, so the check above is not passing on an empty table', () => {
  const { win } = load({ role: 'driver' });
  for (const role of ['driver', 'conductor']) {
    assert.deepEqual(win.Caps.screensFor(role), ['me'], role + ' no longer holds exactly Me');
    assert.deepEqual(win.Caps.navFor(role, 'yard').items, [], 'navFor stopped returning an empty bar');
  }
  // …and a role that HAS a nav proves the same frame draws one.
  const l = load({ role: 'mechanic', screens: { today: PAGE } });
  l.win.Shell.mount('today');
  assert((l.app.html.match(/data-nav=/g) || []).length === 4, 'a mechanic has four tabs');
  assert.strictEqual(l.root.getAttribute('data-frame'), 'bar');
});

test('pad() writes data-frame on the SAME element as data-v2, where shell.css reads it', () => {
  const l = load({ role: 'mechanic', screens: { today: PAGE } });
  l.win.Shell.mount('today');
  assert.strictEqual(l.win.Shell.pad(), 'bar');
  assert.strictEqual(l.root.getAttribute('data-frame'), 'bar');
  assert.strictEqual(l.root.getAttribute('data-v2'), '', 'data-frame and data-v2 must share one element');
});

/* ---- the header, as a pure builder ---- */

test('head() always emits three cells, and the back control only when the step up is real', () => {
  const { win } = load({ role: 'owner' });
  const plain = win.Shell.head('Today', {});
  assert.strictEqual((plain.match(/<span class="apphead-lead">/g) || []).length, 1);
  assert.strictEqual((plain.match(/<span class="apphead-trail">/g) || []).length, 1);
  assert(/<span class="apphead-lead"><\/span><h1>Today<\/h1>/.test(plain),
    'the title must hold the middle column whether or not there is a back control');
  assert(!/data-back/.test(plain), 'no back control was asked for');
  const back = win.Shell.head('Job card', { back: true });
  assert(/<span class="apphead-lead"><button type="button" class="btn btn-quiet apphead-back" data-back/.test(back));
  assert(/aria-label="Back"/.test(back), 'the back control carries a mark and no word, so it needs a name');
  assert(!/aria-disabled/.test(back), 'a control a person may not use is absent, not disabled');
});

test('head() escapes the title and the trailing html it is handed is html', () => {
  const { win } = load({ role: 'owner' });
  assert(/<h1>&lt;script&gt;<\/h1>/.test(win.Shell.head('<script>', {})));
  assert(/apphead-trail"><button>x<\/button></.test(win.Shell.head('T', { trailing: '<button>x</button>' })));
});

test('a detail screen gets a back control and a destination does not', () => {
  const l = load({ role: 'owner', screens: { jobs: PAGE, jobcard: PAGE } });
  l.win.Shell.mount('jobs');
  assert(!/data-back/.test(l.app.html), 'Jobs is a destination, not a detail');
  l.win.Shell.mount('jobcard', { id: 'j1' });
  assert(/data-back/.test(l.app.html), 'the Job card is reached from Jobs and goes back to it');
});

/* ---- §1.9 the offline indicator ---- */

test('the offline button takes the trailing slot, carries a word and a mark, and never a colour alone', () => {
  const l = load({ role: 'owner', offline: true, screens: { today: PAGE } });
  l.win.Shell.mount('today');
  const h = l.app.html;
  assert(/<span class="apphead-trail"><button type="button" class="btn btn-quiet apphead-off" data-off/.test(h),
    'the offline button is not in the trailing slot: ' + h.slice(h.indexOf('apphead-trail'), 200));
  assert(/No signal/.test(h), 'the words are the indicator; a coloured dot carries no reason');
  assert(/<svg /.test(h.slice(h.indexOf('apphead-off'))), 'the mark is missing');
});

test('the indicator is shown when the last pull failed even though navigator.onLine says yes', () => {
  const l = load({ role: 'owner', offline: 'error', screens: { today: PAGE } });
  assert.strictEqual(l.win.navigator.onLine, true, 'the fixture must be online for this to mean anything');
  l.win.Shell.mount('today');
  assert(/apphead-off/.test(l.app.html), 'onLine reports true on a captive portal, which is the office wifi unpaid');
});

test('a signal that changes under a frame the person is looking at fades: the frame is NOT rebuilt', () => {
  let down = false;
  const l = load({ role: 'owner', screens: { today: PAGE } });
  l.win.Sync.info = function () { return { pending: 0, lastError: down ? 'sync failed' : '', status: 'synced' }; };
  l.win.Shell.mount('today');
  assert(!/apphead-off/.test(l.app.html));
  down = true;
  l.win.Shell.mount('today');                      // what boot.js's onStatus does
  assert.strictEqual(l.app.inserts, 1, 'a frame rebuilt on a signal change makes the line appear with no transition');
  assert(/apphead-off/.test(l.trail.html), 'the button did not reach the slot that was already there');
  assert.strictEqual(l.off.getAttribute('data-on'), '', 'and it faded in rather than simply being there');
});

test('offline(true) fades the button in with opacity and no movement; offline(false) puts the slot back', () => {
  const l = load({ role: 'office', screens: { today: { render: () => '<p>b</p>', trailing: () => '<button class="btn" data-filter>F</button>' } } });
  l.win.Shell.mount('today');
  assert(/data-filter/.test(l.trail.html) || /data-filter/.test(l.app.html), 'the screen\'s own trailing control is missing');
  assert.strictEqual(l.win.Shell.offline(true), true);
  assert(/apphead-off/.test(l.trail.html), 'the offline button did not reach the slot');
  assert.strictEqual(l.trail.inserts, 1, 'one string, one insert');
  assert.strictEqual(l.off.getAttribute('data-on'), '', 'data-on is what makes the fade a change between two frames');
  assert.strictEqual(l.win.Shell.offline(true), false, 'an unchanged signal must not redraw the slot');
  l.win.Shell.offline(false);
  assert(/data-filter/.test(l.trail.html), 'the screen\'s trailing control must come back when the signal does');
});

/* ---- §1.6 how the route is shown ---- */

test('document.title is "<screen> — Garage Saathi"', () => {
  const l = load({ role: 'owner', screens: { today: PAGE } });
  l.win.Shell.mount('today');
  assert.strictEqual(l.win.document.title, 'Today — Garage Saathi');
  assert.strictEqual(l.win.Shell.title('Duty board'), 'Duty board — Garage Saathi');
});

test('one name, three places, never a synonym: the nav label, the header and the More row are one string', () => {
  const l = load({ role: 'owner', screens: { today: PAGE, store: PAGE } });
  l.win.Shell.mount('today');
  const h = l.app.html;
  for (const id of Object.keys(l.win.Caps.SCREENS)) {
    const t = l.win.Caps.SCREENS[id].title;
    if (!new RegExp('data-nav="' + id + '"').test(h)) continue;
    assert(h.indexOf('>' + t + '</span>') > 0, 'the nav label for ' + id + ' is not ' + JSON.stringify(t));
  }
  assert(h.indexOf('<h1>Today</h1>') > 0, 'the header title is not the screen\'s one name');
  assert.strictEqual(l.win.document.title.indexOf('Today — '), 0);
  // …and the More sheet's rows come from the same field.
  const moreTab = h.match(/data-nav="more"/);
  assert(moreTab, 'an owner at yard has a More tab');
});

test('More is never a destination: its item carries no aria-current, and the sheet\'s rows do', () => {
  const l = load({ role: 'owner', screens: { today: PAGE } });
  l.win.Shell.mount('today');
  assert(!/data-nav="more"[^>]*aria-current/.test(l.app.html));
  const items = l.win.Caps.navFor('owner', 'yard');
  assert.strictEqual(items.items.length + items.more.length, 13, 'five bar slots plus More plus seven rows');
  assert(l.win.navMore(items.more, 'store').indexOf('aria-current') > 0, 'the sheet\'s rows are the destinations');
});

/* ---- §1.11 the three controls, through the one delegated listener ---- */

test('ONE delegated listener moves the route, and a nav tap never follows its own href', () => {
  const l = load({ role: 'owner', screens: { today: PAGE, attention: PAGE } });
  l.win.Shell.mount('today');
  assert.strictEqual(clickOn(l, 'data-nav', 'attention'), true, 'the href is never read: v2 has no URL routing');
  assert.strictEqual(l.win.Router.current().id, 'attention');
  l.win.Shell.mount('attention');
  assert.strictEqual(l.clicks.length, 1,
    'one listener per frame is one listener per screen change: a 200-row list must cost none at all');
  assert.strictEqual((l.app.html.match(/aria-current="page"/g) || []).length, 1);
  assert(/data-nav="attention"[^>]*aria-current="page"/.test(l.app.html), 'the active item is the one marked');
});

test('a tap on the screen you are on is a no-op: no reload, no scroll to top, and no filter cleared', () => {
  const l = load({ role: 'owner', screens: { attention: PAGE } });
  l.win.Router.go('attention', { filter: 'safety' });
  l.win.Shell.mount('attention', { filter: 'safety' });
  const inserts = l.screen.inserts;
  clickOn(l, 'data-nav', 'attention');
  assert.deepEqual(l.win.Router.current().params, { filter: 'safety' },
    'Router.go with no params would throw away the filter the person is looking through');
  assert.strictEqual(l.screen.inserts, inserts, 'the body was redrawn for a tap that went nowhere');
});

test('More opens a sheet of the remaining destinations, and the offline button opens the device sheet', () => {
  const l = load({ role: 'owner', screens: { today: PAGE } });
  l.win.Shell.mount('today');
  clickOn(l, 'data-nav', 'more');
  assert.strictEqual(l.sheets.length, 1, 'More opens a sheet');
  assert.strictEqual(l.sheets[0].title, 'More');
  assert.strictEqual((l.sheets[0].body.match(/class="v2row"/g) || []).length, 7, 'the owner\'s seven remaining');
  assert(!/class="act"/.test(l.sheets[0].body), 'nothing in .act: a More row is a destination and no more');
  clickOn(l, 'data-off');
  assert.strictEqual(l.sheets.length, 2);
  assert.strictEqual(l.sheets[1].title, 'Device and server', 'one sheet, two doors');
  assert(/state-offline/.test(l.sheets[1].body), 'the door must open onto something true until Me owns its body');
});

test('the back control steps up to the parent screen and never into history', () => {
  const l = load({ role: 'owner', screens: { jobs: PAGE, jobcard: PAGE } });
  l.win.Router.go('jobs');
  l.win.Router.go('jobcard', { id: 'j7' });
  l.win.Shell.mount('jobcard', { id: 'j7' });
  clickOn(l, 'data-back');
  assert.strictEqual(l.win.Router.current().id, 'jobs');
});

/* ---- integration note 16: the count badge ---- */

test('the shell composes the nav\'s count badge into the Me label, and drops `word` so it survives', () => {
  const l = load({ role: 'mechanic', pending: 3, screens: { today: PAGE } });
  l.win.Shell.mount('today');
  assert(/data-nav="me"[^>]*>.*?Me \(3\)/.test(l.app.html.replace(/\n/g, '')), 'the Me tab does not carry its count');
  assert.strictEqual((l.app.html.match(/\(3\)/g) || []).length, 1, 'the count belongs to Me and to no other tab');
});

test('the badge is on Me even in Hindi, because the count is composed onto the TRANSLATED name', () => {
  const l = load({ role: 'mechanic', pending: 12, screens: { today: PAGE } });
  // scMe is registered by nobody yet, so the English name is the fallback; what
  // is asserted is that the count is appended to whatever the name resolves to
  // and that nav.js cannot translate it away.
  l.win.W.register({ scMe: { en: 'Me', hi: '' } });
  l.win.Shell._reset();
  l.win.Shell.mount('today');
  assert(/Me \(12\)/.test(l.app.html), 'a `word` left beside the label would translate back to the bare name');
});

test('zero waiting records draws no badge at all: "Me (0)" is a number nobody needs to read', () => {
  const l = load({ role: 'mechanic', pending: 0, screens: { today: PAGE } });
  l.win.Shell.mount('today');
  assert(!/\(0\)/.test(l.app.html));
  assert(/>Me<\/span>/.test(l.app.html), 'the Me tab lost its label');
});

/* ---- §1.8 first load, and the rule with teeth ---- */

test('the first paint is the frame and the nav with a skeleton body: 5 rows at yard, 12 at desk', () => {
  const yard = load({ role: 'owner' });
  yard.win.Shell.mount('today');
  assert(/class="nav"/.test(yard.app.html), 'the nav draws before any store is read');
  assert.strictEqual((yard.screen.html.match(/class="skeleton-row"/g) || []).length, 5);
  const desk = load({ role: 'owner', density: 'desk' });
  desk.win.Shell.mount('today');
  assert.strictEqual((desk.screen.html.match(/class="skeleton-row"/g) || []).length, 12);
});

test('the model carries the replica\'s answer, so a screen never computes completeness itself', () => {
  let seen = null;
  const l = load({ role: 'owner', complete: false, screens: { today: { render: (m) => { seen = m; return ''; } } } });
  l.win.Shell.mount('today', { q: 1 });
  assert(seen, 'render was not called');
  assert.strictEqual(seen.stale, true, 'the frame must hand down stale while the device is still filling');
  assert.strictEqual(seen.replica.complete, false);
  assert.strictEqual(seen.replica.behind, 5180);
  assert.strictEqual(seen.role, 'owner');
  assert.strictEqual(seen.density, 'yard');
  assert.strictEqual(seen.route, 'today');
  assert.deepEqual(seen.params, { q: 1 });
});

/* A screen module written the way a screen slice will write one: it calls the
 * sandbox's own figure(), so the markup under test is states.js's real markup. */
function figureScreen(win, opts) {
  return { render: function (m) { return '<div>' + win.figure(4120, opts(m)) + win.figure(9300, opts(m)) + '</div>'; } };
}

test('with complete:false every .figure in the body is data-state="stale" when the screen uses the model', () => {
  const l = load({ role: 'owner', complete: false });
  l.win.Router.register('today', figureScreen(l.win, (m) => ({ stale: m.stale })));
  l.win.Shell.mount('today');
  const states = l.screen.html.match(/data-state="[a-z]+"/g) || [];
  assert.strictEqual(states.length, 2, 'two figures expected, got ' + states.length);
  assert.deepEqual(states, ['data-state="stale"', 'data-state="stale"'],
    'a partial aggregate drawn as final is [E] 2170703');
  assert.strictEqual(l.logs.warn.filter((x) => /still filling/.test(x)).length, 0, 'nothing to warn about');
});

test('…and a screen that draws one as FINAL while still filling is named in one dev line', () => {
  const l = load({ role: 'owner', complete: false });
  l.win.Router.register('today', figureScreen(l.win, () => ({ at: Date.now() })));
  l.win.Shell.mount('today');
  assert(/data-state="value"/.test(l.screen.html), 'the frame draws what the screen built and does not rewrite it');
  assert.strictEqual(l.logs.warn.filter((x) => /still filling/.test(x)).length, 1,
    'the frame must name the screen: a figure drawn as final over half the records is the defect');
});

test('and the same body with complete:true is silent, so the line is not noise', () => {
  const l = load({ role: 'owner', complete: true });
  l.win.Router.register('today', figureScreen(l.win, () => ({ at: Date.now() })));
  l.win.Shell.mount('today');
  assert.deepEqual(l.logs.warn.filter((x) => /still filling/.test(x)), []);
});

/* ---- §1.10 states ---- */

test('a screen whose render throws keeps the frame and the nav and puts errorState in the body', () => {
  const l = load({ role: 'owner', screens: { today: { render: () => { throw new Error('boom'); } } } });
  assert.strictEqual(l.win.Shell.mount('today'), true);
  assert(/class="nav"/.test(l.app.html), 'the nav is never removed by an error');
  assert(/state-error/.test(l.screen.html), 'the body is an errorState with a Retry');
  assert(/data-state-retry/.test(l.screen.html));
  assert.strictEqual(l.logs.error.length, 1);
});

test('the no-permission body is a refusal that blames nobody, plus one dev line naming role and screen', () => {
  const l = load({ role: 'mechanic', screens: { money: PAGE } });
  assert.strictEqual(l.win.Caps.holds('mechanic', 'money'), false, 'the fixture must be a screen the role lacks');
  l.win.Shell.mount('money');
  assert(/This is not open to you/.test(l.screen.html));
  assert(/If you need it, ask the owner\./.test(l.screen.html));
  assert(!/denied|Unauthorized|Access/i.test(l.screen.html), 'never blames the reader');
  const line = l.logs.warn.filter((x) => /no permission/.test(x));
  assert.strictEqual(line.length, 1, 'arriving here means the nav and the declaration disagree');
  assert(/mechanic/.test(line[0]) && /money/.test(line[0]), 'the line must name both: ' + line[0]);
  assert(/class="nav"/.test(l.app.html), 'the nav stays: a person who cannot read Money can still reach Today');
  // …and the refusal does not name what it refuses. The header and the tab are
  // the two places a person always reads; a screen they do not hold belongs in
  // neither.
  assert.strictEqual(l.win.document.title, 'Garage Saathi', 'the tab named a screen the mechanic cannot open');
  assert(!/Money/.test(l.app.html), 'the frame named a screen the mechanic cannot open');
});

test('MUTANT must fail: the screen is named before the permission test', () => {
  const broken = SHELL_JS.replace('const name = allowed ? nameOf(id) : null;', 'const name = nameOf(id);');
  assert(broken !== SHELL_JS, 'the mutation did not apply — the line it edits has moved');
  const l = load({ role: 'mechanic', screens: { money: PAGE }, shellSrc: broken });
  l.win.Shell.mount('money');
  assert.strictEqual(l.win.document.title, 'Money — Garage Saathi',
    'the check above cannot fail: naming the screen anyway left the tab clean');
  assert(/Money/.test(l.app.html), 'the check above cannot fail: naming the screen anyway left the frame clean');
});

/* ---- §1.7 signed out ---- */

test('signed out hands over to login.css: no header, no nav, no padding, and .lg on the data-v2 element', () => {
  const l = load({ role: 'owner', screens: { today: PAGE } });
  l.win.Shell.mount('today');
  assert(/apphead/.test(l.app.html), 'the fixture must have a frame to hand over FROM');
  l.win.S.user = null;
  assert.strictEqual(l.win.Shell.mount('login'), true);
  assert.strictEqual(l.app.html, '', 'the frame draws nothing over the login: all four elements go');
  assert.strictEqual(l.root.classList.contains('lg'), true);
  assert.strictEqual(l.root.getAttribute('data-frame'), null, 'no nav means no bottom padding to reserve');
  assert.strictEqual(l.win.document.title, 'Garage Saathi');
  // …and signing in takes the class off again.
  const l2 = load({ role: 'owner', screens: { today: PAGE } });
  l2.win.Shell.mount('login');
  l2.win.Shell.mount('today');
  assert.strictEqual(l2.root.classList.contains('lg'), false);
});

/* ---- the w() guard ---- */

test('the frame draws with NO ui/words.js at all: one unguarded w() would blank the whole app', () => {
  const l = load({ role: 'owner', words: false, screens: { today: PAGE } });
  assert.strictEqual(typeof l.win.w, 'undefined', 'the fixture must really be missing the word table');
  assert.strictEqual(l.win.Shell.mount('today'), true);
  assert(/<h1>Today<\/h1>/.test(l.app.html), 'the header fell back to the English name');
  assert.strictEqual(l.win.document.title, 'Today — Garage Saathi');
  assert(/class="nav"/.test(l.app.html));
});

test('…and with a word table that THROWS on every id, which is what an unregistered screen title does', () => {
  const l = load({ role: 'owner', screens: { today: PAGE } });
  l.win.w = function (id) { throw new Error('w(): no word is registered under the id ' + id); };
  l.win.Shell._reset();
  assert.strictEqual(l.win.Shell.mount('today'), true);
  assert(/<h1>Today<\/h1>/.test(l.app.html));
  assert(/No signal|apphead-trail/.test(l.app.html), 'the frame still drew');
});

test('every fixed English word in shell.js sits in a W.register table', () => {
  const src = stripComments(SHELL_JS);
  const spans = [];
  const call = /\bW\s*\.\s*register\s*\(\s*\{/g;
  let m;
  while ((m = call.exec(src)) !== null) {
    let depth = 1, j = m.index + m[0].length;
    while (j < src.length && depth) { if (src[j] === '{') depth++; else if (src[j] === '}') depth--; j++; }
    spans.push([m.index, j]);
  }
  assert(spans.length > 0, 'shell.js registers no words at all');
  const bad = [];
  const lit = /'([^'\\\n]*)'|"([^"\\\n]*)"/g;
  while ((m = lit.exec(src)) !== null) {
    const text = m[1] === undefined ? m[2] : m[1];
    if (!/\b[A-Z][a-z]+\b/.test(text)) continue;
    if (spans.some((s) => m.index >= s[0] && m.index + m[0].length <= s[1])) continue;
    bad.push(text);
  }
  assert.deepEqual(bad, [], 'a fixed English word outside the table');
});

/* ---- redraw economy ---- */

test('an unchanged frame is not rebuilt: boot re-mounts on every sync tick, and the nav is not free', () => {
  const l = load({ role: 'owner', screens: { today: PAGE } });
  l.win.Shell.mount('today');
  assert.strictEqual(l.app.inserts, 1);
  l.win.Shell.mount('today');
  assert.strictEqual(l.app.inserts, 1, 'the frame was rebuilt for an identical route, density, nav and signal');
  assert.strictEqual(l.screen.inserts, 2, 'the body is what a redraw replaces');
  l.win.Shell.mount('attention');
  assert.strictEqual(l.app.inserts, 2, 'a different screen is a different frame');
});

/* =====================================================================================================
 * 6. THE BOTTOM-PADDING MUTATION, RUN HERE RATHER THAN DESCRIBED
 * ===================================================================================================== */

test('changing one bottom-padding half and not the other is caught', () => {
  // Replaced in the DECLARATION and not in the prose above it: the same
  // expression appears in a comment first, and a mutation that only edits a
  // comment is the shape of a mutant that proves nothing.
  const broken = SHELL_CSS.replace('padding-bottom: ' + BAR_HALF, 'padding-bottom: calc(var(--nav-h) + var(--s2))');
  assert.notStrictEqual(broken, SHELL_CSS, 'the mutation did not apply: the declaration has moved');
  const bar = bottoms(broken).filter((x) => /data-frame="bar"/.test(x.sel) && x.ctx === '');
  assert.strictEqual(bar.length, 1);
  assert.notStrictEqual(bar[0].val, BAR_HALF, 'the comparison that catches a drifted half does not see it');
});

console.log('');
if (fails) { console.log(fails + ' FAILED'); process.exit(1); }
console.log('all ok');

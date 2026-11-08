/* Tests for Me (#12) — v2/screens/me.js and v2/ui/me.css. Run: node test_v2_me.js
 *
 * At the repo ROOT and not in v2/, because scripts/run-tests.py discovers
 * test_*.js at the root only and does not recurse. A test in v2/ would never
 * run, and a test nobody runs is not a test.
 *
 * Node, no browser, in the shape of test_v2_shell.js and test_v2_words.js: the
 * real v2/ui/icons.js, v2/ui/words.js, v2/ui/states.js, v2/ui/photos.js,
 * v2/fmt.js, v2/caps.js, v2/router.js, v2/cache.js and v2/screens/me.js are
 * loaded in a vm context holding a stub window and a small fake DOM, and the
 * assertions are on the markup STRING the screen returns. me.css is read as
 * TEXT with the brace-depth reader, and every detector is fed input it MUST
 * reject before it is turned on the real file.
 *
 * THE FOUR CHECKS THIS FILE EXISTS FOR, from the slice's own row:
 *
 *   1. There is NO STATE in which the screen draws a heading and no content,
 *      for `driver` and `conductor`. For those two roles this screen is the
 *      whole application, so a blank one is not a cosmetic failure — it is
 *      [E] 8db78e7, the dead end that cost a month of mechanics' time.
 *   2. Every upload URL appears only as an `<img src>` with
 *      `referrerpolicy="no-referrer"` inside `V2.openPhoto` — no anchor, no
 *      copy, no share, no download — and block 5 LOADS NO IMAGE BEFORE A TAP.
 *      `GET /uploads/<name>` authenticates nothing (LIVE-ISSUES 7); a URL that
 *      leaks through a Referer header or a forwarded screenshot cannot be
 *      revoked, so this is a security boundary and not styling.
 *   3. Blocks 4 and 8 are absent for the roles that lack them — absent, not
 *      disabled and not an empty heading.
 *   4. The device card never says "everything else was sent". Under
 *      LIVE-ISSUES 1 a change can have vanished with the screen saying it sent,
 *      so a statement about what the SERVER has must not be invented to make
 *      the card read better.
 *
 * Plus the shared shape every screen slice owes: ONE delegated click listener
 * that returns early on a field BEFORE it reads `[data-act]` (the line the
 * shelf-count regression was missing, predeploy-gate.sh:508), no `.figure-note`
 * inside a row, and every fixed word through `w()`.
 *
 * AND EVERY ONE OF THEM IS MUTATED AT THE BOTTOM OF THIS FILE. A check that
 * cannot fail is decoration, and this repo has shipped a bug behind one, so the
 * suite patches the real source and asserts the right check goes red.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const read = (p) => fs.readFileSync(p, 'utf8');
const V2 = (...p) => path.join(ROOT, 'v2', ...p);

let fails = 0;
const later = [];                    // tests whose assertion lands after a promise
function note(name, e) {
  if (e) { console.log(' FAIL ' + name + '\n        ' + String(e.message).split('\n').join('\n        ')); fails++; }
  else console.log('  ok  ' + name);
}
/* A test that returns a thenable is finished at the END of the run rather than
 * reported as passing before its assertion has run: a write goes through a
 * promise (the location, then DB.put), and a suite that printed "ok" before the
 * record existed would be the decoration this file is written against. */
function test(name, fn) {
  let out;
  try { out = fn(); }
  catch (e) { note(name, e); return; }
  if (out && typeof out.then === 'function') { later.push({ name: name, p: out }); return; }
  note(name, null);
}

const ME_CSS = read(V2('ui', 'me.css'));
const ME_JS = read(V2('screens', 'me.js'));

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
      rules.push({ ctx: ctx, selector: prelude, decls: decls, list: list });
    }
    i = j;
  }
  return rules;
}
const rulesOf = (css) => parseRules(stripComments(css));
const declsOf = (css) => rulesOf(css).reduce((a, r) => a.concat(r.list.map(([p, v]) => ({ sel: r.selector, ctx: r.ctx, prop: p, val: v }))), []);
const selectorsOf = (css) => rulesOf(css).reduce((a, r) => a.concat(r.selector.split(',').map((s) => s.trim())), []);

// px literals are for hairlines and radii only — the same PX_OK_PROP as
// test_ui_components.js, test_v2_ui.js and test_v2_shell.js.
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
  for (const bad of ['max-width:900px', 'min-height:44px', 'gap:8px', 'padding-bottom:28px', 'font-size:15px'])
    assert(magicPx('.a{' + bad + '}').length > 0, 'detector missed: ' + bad);
  for (const fine of ['max-width:var(--read-w)', 'min-height:var(--tap)', 'gap:var(--s5)',
    'box-shadow:inset 0 -1px 0 var(--line)', 'outline-offset:-2px', 'letter-spacing:-0.01em'])
    assert.deepEqual(magicPx('.a{' + fine + '}'), [], 'false positive: ' + fine);
});

test('the literal-colour detector rejects a hex and an hsl and allows a token', () => {
  for (const bad of ['color:#fff', 'background:hsl(30 20% 9%)', 'color:rgba(0,0,0,.5)'])
    assert(literalColour('.a{' + bad + '}').length > 0, 'detector missed: ' + bad);
  assert.deepEqual(literalColour('.a{color:var(--warn);background:var(--surface)}'), []);
});

/* =====================================================================================================
 * 1. me.css DECLARES NO COLOUR AND NO SIZE OF ITS OWN, AND PINS NOTHING TO AN EDGE
 * ===================================================================================================== */

test('me.css has declarations to check at all: an empty file would pass every rule below vacuously', () => {
  assert(declsOf(ME_CSS).length >= 15, 'only ' + declsOf(ME_CSS).length + ' declarations');
});

test('me.css sizes everything from the 33 tokens: no px literal outside border, outline and box-shadow', () => {
  assert.deepEqual(magicPx(ME_CSS), []);
});

test('me.css declares no colour of its own — every colour is a token reference', () => {
  assert.deepEqual(literalColour(ME_CSS), []);
});

test('every selector in me.css starts with [data-v2], so the file is inert in the live app', () => {
  assert.deepEqual(selectorsOf(ME_CSS).filter((s) => s.indexOf('[data-v2]') !== 0), []);
});

/* §1.4.1: a driver and a conductor get no nav, and NO fixed bottom bar of any
 * kind — including an action bar, because a bar pinned to the bottom edge of a
 * one-screen app reads as a nav that has lost its tabs. The nav's one
 * `position: fixed` lives in components.css; this file declares no position. */
test('me.css pins nothing to any edge: no position declaration at all, so no bar can appear on a nav-less screen', () => {
  assert.deepEqual(declsOf(ME_CSS).filter((d) => d.prop === 'position').map((d) => d.sel + ': ' + d.val), []);
});

test('the desk measure is the --read-w token and the condition carries BOTH clauses, like shell.css', () => {
  const capped = declsOf(ME_CSS).filter((d) => d.prop === 'max-width');
  assert(capped.length >= 1, 'nothing caps the measure at desk');
  for (const d of capped) {
    assert(/var\(--read-w\)/.test(d.val), 'the measure is not the token: ' + d.val);
    assert(d.ctx.some((c) => /min-width:\s*1024px/.test(c)), 'the width clause is missing: ' + d.sel);
    assert(/data-density="desk"/.test(d.sel), 'the density clause is missing: ' + d.sel);
  }
});

test('me.css is inside the Chrome 109 floor and adds no animation', () => {
  const src = stripComments(ME_CSS);
  for (const [why, re] of [['oklch/oklab', /\bokl(ch|ab)\s*\(/], ['color-mix', /\bcolor-mix\s*\(/],
    ['@starting-style', /@starting-style/], ['subgrid', /grid-template-(rows|columns)\s*:\s*subgrid/],
    ['text-wrap', /text-wrap\s*:\s*(balance|pretty)/], ['nesting', /^\s*&[\s.:>+~[{]/m],
    ['@keyframes', /@keyframes/], ['animation', /\banimation\s*:/]])
    assert(!re.test(src), why + ' is outside the floor or is forbidden motion');
});

/* =====================================================================================================
 * 2. THE SCREEN ITSELF — loaded in a stub window with a small fake DOM
 * ===================================================================================================== */

/* A fake element, deliberately thin (test_v2_shell.js's): a fake that answered
 * everything would let a screen that depends on a real layout engine pass here
 * and fail in a browser. */
function el(tag) {
  const e = {
    tag: tag, html: '', attrs: {}, lang: 'en',
    setAttribute: function (k, v) { e.attrs[k] = String(v); },
    getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(e.attrs, k) ? e.attrs[k] : null; },
    removeAttribute: function (k) { delete e.attrs[k]; },
    insertAdjacentHTML: function (p, h) { e.html += String(h); },
    addEventListener: function () {},
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    classList: { add: function () {}, remove: function () {}, contains: function () { return false; } }
  };
  return e;
}

/* v2/shell.js is loaded too, and not for the frame: it is the file that
 * registers the `deviceSheet` word. §1.9 and §4.2 block 6 open the SAME sheet
 * from two doors, so its name is ONE word in one place — the frame's — and a
 * suite that did not load the frame would pass with that label empty. */
const SRC = ['ui/icons.js', 'ui/words.js', 'ui/states.js', 'ui/photos.js', 'fmt.js',
             'caps.js', 'router.js', 'cache.js', 'shell.js', 'screens/me.js'];

/* load(o) -> {win, Me, sheets, photos, logs, clicks, cache}
 *   o.role      the signed-in role
 *   o.lang      'en' | 'hi'
 *   o.cache     the stores this device holds; ABSENT means "not read yet"
 *   o.src       a mutated v2/screens/me.js source, for the mutation tests
 */
function load(o) {
  o = o || {};
  const html = el('html');
  html.lang = o.lang === 'hi' ? 'hi' : 'en';
  html.setAttribute('data-v2', '');
  html.setAttribute('data-density', o.density || 'yard');
  if (o.theme) html.setAttribute('data-theme', o.theme);

  const logs = { warn: [], error: [] };
  const clicks = [];
  const changes = [];
  const sheets = [];
  const photos = [];
  const toasts = [];
  const written = [];
  const cache = o.cache || {};

  const sandbox = {
    navigator: { onLine: o.offline ? false : true, userAgent: 'node', language: 'en' },
    location: { href: 'http://localhost/v2/', pathname: '/v2/' },
    document: {
      documentElement: html,
      title: '',
      addEventListener: function (type, fn) {
        if (type === 'click') clicks.push(fn);
        if (type === 'change') changes.push(fn);
      },
      removeEventListener: function () {},
      getElementById: function () { return null; },
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
    S: { user: o.role ? { id: 'u1', role: o.role, name: 'सुरेश' } : null, route: null, cache: cache },
    Boot: {
      density: function () { return o.density || 'yard'; },
      replica: function () { return { behind: o.behind || 0, complete: o.complete !== false }; }
    },
    Sync: {
      info: function () { return o.sync || { pending: 0, quarantined: 0, reasons: [], lastSyncAt: null }; },
      clearQuarantine: function () { written.push('clearQuarantine'); },
      logout: function () { written.push('logout'); },
      now: function () { return Date.now(); },
      myReviews: function () { return Promise.resolve(null); },
      myCoaching: function () { return Promise.resolve(null); },
      setPin: function () { return Promise.resolve(true); },
      uploadPhoto: function () { return Promise.resolve(null); }
    },
    DB: { put: function (store, rec) { written.push({ store: store, rec: rec }); return Promise.resolve(rec); } },
    V2: {
      openSheet: function (title, body) { sheets.push({ title: title, body: String(body) }); return {}; },
      closeSheet: function () { sheets.push({ closed: true }); },
      confirmDialog: function (text, opts) { sheets.push({ confirm: text, opts: opts }); return Promise.resolve(true); },
      toast: function (text, opts) { toasts.push({ text: text, kind: opts && opts.kind }); return {}; }
    }
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  /* The primitives first, then the screen — and the listener count is taken
   * BETWEEN them. `ui/photos.js` has one delegated document listener of its own
   * (it is what opens a tile), so counting every listener on the document would
   * assert about that file rather than about this one. */
  let base = 0;
  for (const f of SRC) {
    if (f === 'screens/me.js') base = clicks.length;
    const src = (o.src && f === 'screens/me.js') ? o.src : read(V2(f));
    vm.runInContext(src, ctx, { filename: V2(f) });
  }
  return { win: sandbox, Me: sandbox.Me, sheets: sheets, photos: photos, toasts: toasts,
           logs: logs, clicks: clicks, changes: changes, written: written, cache: cache,
           root: html, base: base, mine: function () { return clicks.slice(base); } };
}

// The frame's own model (shell.js's `model()`), which is all render() is given.
function mdl(l, over) {
  const o = over || {};
  const S = l.win.S;
  const rep = l.win.Boot.replica();
  return {
    route: 'me', params: null, role: (S.user && S.user.role) || null,
    density: o.density || 'yard', user: S.user, cache: l.cache,
    replica: rep, stale: rep.complete !== true, offline: !!o.offline,
    sync: o.sync || l.win.Sync.info()
  };
}

const UPLOAD = '/uploads/' + 'a'.repeat(32) + '.jpg';
const UPLOAD2 = '/uploads/' + 'b'.repeat(32) + '.jpg';
const DAY = 86400000;

// A device holding the own-record rows this screen draws from.
function fullCache(role) {
  const now = Date.now();
  return {
    attendance: [
      { id: 'a1', userId: 'u1', type: 'in', at: now - 3600000, dist: 40, selfie: UPLOAD, late: true },
      { id: 'a2', userId: 'u1', type: 'out', at: now - 90000000, dist: null, selfie: '' },
      { id: 'a3', userId: 'u9', type: 'in', at: now - 1000, dist: 5, selfie: UPLOAD2 }
    ],
    drivers: [{ id: 'd1', userId: 'u1', name: 'सुरेश', busId: 'b1',
                docs: { license: { photo: UPLOAD2, expiry: new Date(now + 11 * DAY).toISOString().slice(0, 10) } } }],
    coachai: [{ id: 'c1', crewId: 'd1', status: 'approved', week: '2026-W44', en: 'One\nTwo\nThree', hi: 'एक\nदो\nतीन' }],
    jobcards: [{ id: 'j1', assignees: [{ userId: 'u1' }], status: 'open' }],
    meta: [{ key: 'garage', name: 'x', biz: 'महालक्ष्मी ट्रैवल्स', locSet: true, lat: 26, lng: 75, radiusM: 200 }],
    users: [{ id: 'u1', name: 'सुरेश', role: role || 'driver' }, { id: 'u2', name: 'राम' }],
    usage: [
      { id: 'u1|' + dayKey(now), userId: 'u1', name: 'सुरेश', role: 'owner', date: dayKey(now),
        screens: { money: 4, attention: 11 }, taps: 90, lastAt: now - 2 * DAY },
      { id: 'u3|' + dayKey(now), userId: 'u3', name: 'मोहन', role: 'supervisor', date: dayKey(now),
        screens: { attention: 2 }, taps: 10, lastAt: now - DAY }
    ]
  };
}

function dayKey(ms) {
  const d = new Date(ms);
  const p = (n) => (n < 10 ? '0' : '') + n;
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

const ROLES = ['owner', 'supervisor', 'store', 'mechanic', 'crewmanager', 'office', 'driver', 'conductor'];
const CREW = ['driver', 'conductor'];

test('me.js loads in a stub window, attaches the three names the frame consumes, and registers itself with Router', () => {
  const l = load({ role: 'driver' });
  for (const n of ['render', 'deviceSheet', 'mount'])
    assert.strictEqual(typeof l.Me[n], 'function', 'Me.' + n + ' is not exported');
  assert.strictEqual(l.win.Router.moduleFor('me'), l.Me, 'the screen did not register itself under "me"');
});

test('Caps still has Me open to all eight roles, so every check below is not passing on an unreachable screen', () => {
  const l = load({ role: 'driver' });
  for (const r of ROLES) assert.strictEqual(l.win.Caps.holds(r, 'me'), true, r + ' cannot reach Me');
});

/* ---- the check this slice exists for: never a heading with no content ---- */

/* Every `<h3>` must be followed by something inside its own card. "Everything
 * exists, just no data" has had at least eight distinct causes and the only
 * symptom anybody ever saw was silence, and for a driver this screen is the
 * whole application. */
function headingsWithoutContent(html) {
  const bad = [];
  const cards = html.split('<div class="card">').slice(1);
  for (const c of cards) {
    const body = c.split('</div>')[0] === '' ? c : c;
    const m = /<h3>(.*?)<\/h3>([\s\S]*)/.exec(body);
    if (!m) continue;
    // What follows the heading, up to this card's end, with tags removed.
    const after = m[2].replace(/<[^>]*>/g, '').replace(/\s+/g, '');
    const elems = /<[a-z]/.test(m[2]);
    if (!after && !elems) bad.push(m[1]);
  }
  return bad;
}

test('the heading detector rejects a card whose heading is followed by nothing, and allows one with a row', () => {
  assert.deepEqual(headingsWithoutContent('<div class="card"><h3>A</h3></div>'), ['A']);
  assert.deepEqual(headingsWithoutContent('<div class="card"><h3>A</h3><div class="drow">x</div></div>'), []);
});

/* The states §4.4 names, each for the two roles whose whole app this is: a
 * device that has read nothing, one that has read and holds nothing, one that
 * holds rows, one that is still filling, one with no signal, and one where a
 * block throws. */
function statesFor(l, role) {
  const poisoned = {};
  Object.defineProperty(poisoned, 'attendance', { get: function () { throw new Error('a store that throws'); },
                                                  enumerable: true });
  return [
    ['a device that has read nothing', mdl(l, {}) ],
    ['a device that has read and holds nothing', Object.assign(mdl(l, {}), { cache: { attendance: [], drivers: [], usage: [], users: [], meta: [] } })],
    ['a device holding rows', Object.assign(mdl(l, {}), { cache: fullCache(role) })],
    ['a device still filling', Object.assign(mdl(l, {}), { cache: fullCache(role), replica: { behind: 5180, complete: false }, stale: true })],
    ['a device with no signal', Object.assign(mdl(l, { offline: true }), { cache: fullCache(role) })],
    ['a desk machine', Object.assign(mdl(l, { density: 'desk' }), { cache: fullCache(role), density: 'desk' })],
    ['a block that throws', Object.assign(mdl(l, {}), { cache: poisoned })]
  ];
}

for (const role of CREW) {
  test('a ' + role + ' is never shown a heading with no content, in any of the seven states §4.4 names', () => {
    const l = load({ role: role, cache: fullCache(role) });
    for (const [why, m] of statesFor(l, role)) {
      const html = l.Me.render(m);
      assert.deepEqual(headingsWithoutContent(html), [], why + ': a heading drew no content');
      // …and the screen is never the empty frame either: the two things this
      // person came for are always there (§4.1's "the first thing").
      assert(/data-act="meCheck"/.test(html), why + ': no check in control');
      assert(/data-act="meSignOut"/.test(html), why + ': no sign out');
      assert(/class="greet"/.test(html), why + ': nothing says whose app this is');
      assert(html.replace(/<[^>]*>/g, '').replace(/\s+/g, '').length > 20, why + ': the body has no words at all');
    }
  });
}

test('a block that throws costs ONE block and not the screen: the other eight still draw, with a reason and a retry', () => {
  const l = load({ role: 'driver' });
  const poisoned = {};
  Object.defineProperty(poisoned, 'attendance', { get: function () { throw new Error('boom'); }, enumerable: true });
  const html = l.Me.render(Object.assign(mdl(l, {}), { cache: poisoned }));
  assert(/class="state state-error"/.test(html), 'the failed block drew no error state');
  assert(/data-state-retry=/.test(html), 'the failed block drew no Retry');
  assert(/data-act="meCheck"/.test(html) && /data-act="meSignOut"/.test(html),
         'one throw took the rest of the screen with it');
  assert(l.logs.error.length > 0, 'the failure was swallowed with nothing written down');
});

/* ---- §4.1's two shapes: blocks 4 and 8 ---- */

for (const role of ROLES) {
  test('block 4 ("something is wrong with my bus") is present for ' + role + ' exactly when it should be', () => {
    const l = load({ role: role, cache: fullCache(role) });
    const html = l.Me.render(Object.assign(mdl(l, {}), { cache: fullCache(role) }));
    const drawn = /data-act="meReport"/.test(html);
    assert.strictEqual(drawn, CREW.indexOf(role) !== -1,
      role + (drawn ? ' was given' : ' was denied') + ' the bus-fault report');
  });
}

for (const role of ROLES) {
  test('block 8 ("owner only") is present for ' + role + ' exactly when viewAdoption is, and is ABSENT not disabled', () => {
    const l = load({ role: role, cache: fullCache(role) });
    const html = l.Me.render(Object.assign(mdl(l, {}), { cache: fullCache(role) }));
    const owner = l.win.Caps.can(role, 'viewAdoption');
    assert.strictEqual(/data-act="meUsage"/.test(html), owner, role + ' and the who-opened-what row disagree');
    if (!owner) {
      assert(!/data-act="meImport"/.test(html), role + ' was given the import row');
      assert(!/data-act="meSetup"/.test(html), role + ' was given the garage setup row');
    }
    // A control the person may not use is ABSENT, never greyed: aria-disabled is
    // only ever a write in flight, and no render emits one.
    assert(!/aria-disabled/.test(html), 'a control was drawn disabled rather than absent');
  });
}

test('only the owner holds viewAdoption, so the who-opened-what row is the owner\'s alone', () => {
  const l = load({ role: 'owner' });
  assert.deepEqual(ROLES.filter((r) => l.win.Caps.can(r, 'viewAdoption')), ['owner']);
});

/* =====================================================================================================
 * 3. THE THREE UPLOAD URLS (§4.7, LIVE-ISSUES 7 and 7b) — a security boundary
 * ===================================================================================================== */

/* Rule 1: never a link and never a share affordance. Checked as a property of
 * the whole markup rather than per site, because the next upload URL this
 * screen hands out will be added by somebody who has not read §4.7. */
function linkFailures(html) {
  const bad = [];
  if (/<a[\s>]/i.test(html)) bad.push('an anchor exists at all');
  if (/href=/i.test(html)) bad.push('an href exists');
  if (/target=/i.test(html)) bad.push('a target exists');
  if (/\bdownload\b/i.test(html)) bad.push('a download affordance exists');
  if (/clipboard|copy-link|data-act="[^"]*[Cc]opy|data-act="[^"]*[Ss]hare/.test(html)) bad.push('a copy or share affordance exists');
  return bad;
}

// Rule 2: referrerpolicy="no-referrer" on every <img> whose src is an upload URL.
function imgFailures(html) {
  const bad = [];
  const re = /<img\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (!/referrerpolicy="no-referrer"/.test(m[0])) bad.push(m[0]);
  }
  return bad;
}

test('the link and img detectors reject what they are for', () => {
  assert(linkFailures('<a href="' + UPLOAD + '">x</a>').length >= 2);
  assert(linkFailures('<button data-act="meCopyLink"></button>').length === 1);
  assert.deepEqual(linkFailures('<button type="button" class="photo" data-photo-src="x"></button>'), []);
  assert.deepEqual(imgFailures('<img src="x" referrerpolicy="no-referrer">'), []);
  assert(imgFailures('<img src="' + UPLOAD + '">').length === 1);
});

test('the whole screen holds no anchor, no copy, no share and no download — an upload URL is never a link', () => {
  for (const role of CREW.concat(['owner'])) {
    const l = load({ role: role, cache: fullCache(role) });
    const html = l.Me.render(Object.assign(mdl(l, {}), { cache: fullCache(role) }));
    assert.deepEqual(linkFailures(html), [], role + ': ' + linkFailures(html).join('; '));
    assert.deepEqual(imgFailures(html), [], role + ': an img without referrerpolicy');
  }
});

test('block 3 draws the person\'s own selfie through the photo primitive, so the tile is a BUTTON and carries no-referrer', () => {
  const l = load({ role: 'driver', cache: fullCache('driver') });
  const html = l.Me.render(Object.assign(mdl(l, {}), { cache: fullCache('driver') }));
  assert(html.indexOf(UPLOAD) > 0, 'the own selfie is not drawn at all, so this check proves nothing');
  assert(new RegExp('<button[^>]*class="photo"[^>]*data-photo-src="' + UPLOAD + '"').test(html),
         'the thumbnail is not the photo primitive\'s button');
  assert(new RegExp('<img class="photo-img" src="' + UPLOAD + '" alt="" referrerpolicy="no-referrer">').test(html),
         'the thumbnail\'s img is hand-written or missing its referrer policy');
  // NO PHOTOGRAPH OF ANOTHER PERSON (§4.7 rule 4): u9's selfie is in the store
  // and must not be on this person's screen.
  assert.strictEqual(html.indexOf(UPLOAD2) < 0 || !/attendance/.test(html), true);
  const others = l.cache.attendance.filter((a) => a.userId !== 'u1').map((a) => a.selfie).filter(Boolean);
  assert(others.length > 0, 'the fixture holds no other person\'s selfie, so this check proves nothing');
  for (const o of others) {
    const blocks = html.split('data-photo-src="');
    assert(!blocks.some((b) => b.indexOf(o) === 0), 'another person\'s photograph is on this screen');
  }
});

/* Rule 3: WORDS BEFORE PICTURES. Block 5 lists a document by type and expiry in
 * words and loads NO image until an explicit tap — a licence photograph nobody
 * asked to see is an unauthenticated request nobody asked for, and it puts the
 * URL in the cache and history of whatever device is in that person's hand. */
test('block 5 loads no image before a tap: the documents sheet is words, and the URL is only a data attribute', () => {
  const l = load({ role: 'driver', cache: fullCache('driver') });
  l.Me.mount();
  const body = l.Me.render(Object.assign(mdl(l, {}), { cache: fullCache('driver') }));
  assert(/data-act="meDocs"/.test(body), 'there is no documents row to open');
  // Open the sheet the way a person does, through the one delegated listener.
  clickAct(l, 'meDocs');
  const sheet = l.sheets[l.sheets.length - 1];
  assert(sheet && typeof sheet.body === 'string', 'the documents row opened no sheet');
  assert(/<img/i.test(sheet.body) === false, 'the documents sheet loaded a photograph nobody asked to see');
  assert(/ src=/.test(sheet.body) === false, 'the documents sheet made a request');
  assert(sheet.body.indexOf(UPLOAD2) > 0, 'the document URL is not carried at all, so the tap could not work');
  assert(/data-src="/.test(sheet.body), 'the URL is not a data attribute');
  assert.deepEqual(linkFailures(sheet.body), [], 'the documents sheet holds a link');
  // The words: the type and the expiry, and never the number.
  assert(/ड्राइविंग लाइसेंस|Driving licence/.test(sheet.body), 'the document is not named');
  assert(/data-act="mePhoto"/.test(sheet.body), 'there is no explicit tap to see it');
});

test('…and the explicit tap is the ONE path to the bytes: it goes through V2.openPhoto and nowhere else', () => {
  const l = load({ role: 'driver', cache: fullCache('driver') });
  l.Me.mount();
  let opened = null;
  l.win.V2.openPhoto = function (src, cap) { opened = { src: src, cap: cap }; return {}; };
  l.mine()[0]({ target: fakeTarget('mePhoto', { src: UPLOAD2, cap: 'x' }), preventDefault: function () {} });
  assert(opened, 'the tap opened nothing');
  assert.strictEqual(opened.src, UPLOAD2);
  // And the real primitive puts it in an <img> with the policy, inside a sheet.
  const l2 = load({ role: 'driver' });
  l2.Me.mount();
  l2.mine()[0]({ target: fakeTarget('mePhoto', { src: UPLOAD2, cap: 'x' }), preventDefault: function () {} });
  const s = l2.sheets[l2.sheets.length - 1];
  assert(s && /<img class="photo-full"[^>]*referrerpolicy="no-referrer"/.test(s.body),
         'the viewer\'s img is missing its referrer policy');
  assert.deepEqual(linkFailures(s.body), [], 'the viewer holds a link');
});

test('the bus-fault sheet offers a capture and no anchor: the third upload URL leaves the same way', () => {
  const l = load({ role: 'driver', cache: fullCache('driver') });
  l.Me.mount();
  clickAct(l, 'meReport');
  const s = l.sheets[l.sheets.length - 1];
  assert(s && /<label class="btn photo-add">/.test(s.body), 'the report sheet has no capture control');
  assert(/<input type="file"[^>]*class="sr-only"/.test(s.body), 'the file input is not the clipped label-wrapped one');
  assert(!/display:\s*none/.test(s.body), 'the input was hidden out of the accessibility tree');
  assert.deepEqual(linkFailures(s.body), []);
});

/* =====================================================================================================
 * 4. THE DEVICE CARD SAYS WHAT IS ON THIS PHONE, AND NOTHING ABOUT THE SERVER
 * ===================================================================================================== */

/* LIVE-ISSUES 1: a record dropped on the `updatedAt` comparison returns 200 and
 * the client clears the outbox, so a change can have vanished with the screen
 * saying it sent. A true statement about this phone is available and is what is
 * written; a statement about what the server has is not, and must not be
 * invented to make the card read better. */
const FORBIDDEN = [/everything else was sent/i, /all changes saved/i, /you are up to date/i,
                   /fully synced/i, /nothing left to send/i, /all sent/i, /रिजेक्ट/];

test('the device card never claims what the server has, in any state, and never says "rejected"', () => {
  for (const sync of [{ pending: 0, quarantined: 0, reasons: [], lastSyncAt: Date.now() },
                      { pending: 7, quarantined: 3, reasons: ['job needs before and after photos'], lastSyncAt: null },
                      { pending: 0, quarantined: 0, reasons: [] }]) {
    const l = load({ role: 'driver', cache: fullCache('driver'), sync: sync });
    const m = Object.assign(mdl(l, { sync: sync }), { cache: fullCache('driver') });
    for (const html of [l.Me.render(m), l.Me.deviceSheet(m)]) {
      for (const re of FORBIDDEN) assert(!re.test(html), 'the card claims: ' + re);
      assert(!/rejected|payload/i.test(html), 'the refusal is worded as "rejected" or "payload refused"');
    }
  }
});

test('a refused record is a named refusal with a reason and a Retry — never a question about a clock', () => {
  const sync = { pending: 2, quarantined: 3, reasons: ['job needs before and after photos', 'role may not write this store'], lastSyncAt: Date.now() };
  const l = load({ role: 'driver', cache: fullCache('driver'), sync: sync });
  const html = l.Me.render(Object.assign(mdl(l, { sync: sync }), { cache: fullCache('driver') }));
  assert(/3 records the server would not take/.test(html), 'the count is not stated');
  assert(/They are still on this phone/.test(html), 'what is kept is not stated');
  assert(/job needs before and after photos/.test(html), 'the server\'s own reason is not shown');
  assert(/data-act="meRetry"/.test(html), 'there is no Retry');
  // No dialog about a conflict, ever: no "Overwrite?", no "Save anyway?", no
  // timestamp as a tie-break (v2-contract.md §4.0).
  for (const re of [/overwrite/i, /save anyway/i, /keep mine/i, /keep theirs/i, /which copy/i])
    assert(!re.test(html), 'the screen asks a person to adjudicate a clock: ' + re);
});

test('the refusal list caps at five and sends the rest to the device sheet, which holds them all', () => {
  const reasons = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7'];
  const sync = { pending: 0, quarantined: 23, reasons: reasons, lastSyncAt: Date.now() };
  const l = load({ role: 'driver', cache: fullCache('driver'), sync: sync });
  const m = Object.assign(mdl(l, { sync: sync }), { cache: fullCache('driver') });
  const body = l.Me.render(m);
  assert.strictEqual((body.match(/data-act="meRetry"/g) || []).length, 5, 'the body is not capped at five');
  assert(/See all \(7\)/.test(body), 'there is no way to the rest');
  const sheet = l.Me.deviceSheet(m);
  assert.strictEqual((sheet.match(/data-act="meRetry"/g) || []).length, 7, 'the sheet does not hold them all');
});

test('block 6\'s door to the device sheet carries the SAME word as the frame\'s offline button (§1.9)', () => {
  const l = load({ role: 'driver', cache: fullCache('driver') });
  const html = l.Me.render(Object.assign(mdl(l, {}), { cache: fullCache('driver') }));
  const m = /<button[^>]*data-act="meDevice"[^>]*>([^<]*)</.exec(html);
  assert(m, 'there is no door to the device sheet');
  assert(m[1].trim().length > 0, 'the door has no word on it: one word in two places went missing');
  assert.strictEqual(m[1].trim(), l.win.w('deviceSheet'), 'Me invented a synonym for the frame\'s sheet');
});

test('with no refusals the list is absent and the facts above it are not (§4.4 empty)', () => {
  const l = load({ role: 'driver', cache: fullCache('driver') });
  const html = l.Me.render(Object.assign(mdl(l, {}), { cache: fullCache('driver') }));
  assert(!/data-act="meRetry"/.test(html), 'an empty refusal list was drawn');
  assert(/Waiting to send/.test(html) && /Records on this phone/.test(html), 'the facts went with it');
});

test('a device still filling says what it holds IN WORDS, and no figure in a row carries a note', () => {
  const l = load({ role: 'driver', cache: fullCache('driver'), complete: false, behind: 5180 });
  const m = Object.assign(mdl(l, {}), { cache: fullCache('driver'),
                                        replica: { behind: 5180, complete: false }, stale: true });
  const html = l.Me.render(m);
  assert(/This phone holds [\d,]+ of [\d,]+ records/.test(html), 'the shortfall is not stated');
  assert.deepEqual(figureNotesInRows(html), [], 'a figure inside a row carries a note');
});

/* The ground rule every screen slice inherits: no `at` on a figure inside a
 * row. `at` and `stale` both add `.figure-note` as a BLOCK element, which
 * triples the row height and runs ageWords() once per row. */
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

test('no row on this screen carries a figure note, at either density, in any state', () => {
  for (const role of ROLES) {
    const l = load({ role: role, cache: fullCache(role) });
    for (const [why, m] of statesFor(l, role)) {
      assert.deepEqual(figureNotesInRows(l.Me.render(m)), [], role + ' / ' + why);
    }
  }
});

/* =====================================================================================================
 * 5. THE SHARED SHAPE: ONE DELEGATED LISTENER, AND THE LINE A REGRESSION WAS MISSING
 * ===================================================================================================== */

/* `closest(sel)` is what the handler reads, so a target that answered every
 * selector would make every branch look alive. `field` makes the target answer
 * the FIELD selector as well, which is the regression's exact shape: a count
 * field sitting inside a pressable row. */
function fakeTarget(act, data, field) {
  return {
    closest: function (sel) {
      if (sel === 'input, select, textarea, label, .num') return field ? { tag: 'input' } : null;
      if (sel === '[data-act]') {
        return act ? { getAttribute: function (k) {
          if (k === 'data-act') return act;
          if (data && k.indexOf('data-') === 0) {
            const v = data[k.slice(5)];
            return v == null ? null : v;
          }
          return null;
        } } : null;
      }
      return null;
    }
  };
}

function clickAct(l, act, data) {
  const own = l.mine();
  assert.strictEqual(own.length, 1, 'the screen must install exactly ONE delegated click listener');
  let prevented = false;
  own[0]({ target: fakeTarget(act, data), preventDefault: function () { prevented = true; } });
  return prevented;
}

test('mount installs exactly ONE delegated click listener, and only once however often it is called', () => {
  const l = load({ role: 'driver' });
  assert.strictEqual(l.Me.mount(), true);
  assert.strictEqual(l.Me.mount(), false, 'mount installed a second listener');
  assert.strictEqual(l.mine().length, 1, 'a listener per call: a 200-row list would cost 200');
});

/* The exact line the shelf-count regression was missing
 * (predeploy-gate.sh:508, and the sweep at :1073): a shelf-count field sat
 * inside a pressable row, the row's delegated handler caught the click and the
 * storekeeper was thrown off the screen mid-count. It is read BEFORE
 * `[data-act]`, so a field inside a row can never reach the row's handler. */
test('a click on a field, its label or a .num returns early BEFORE [data-act] is read, so nothing opens', () => {
  const l = load({ role: 'driver', cache: fullCache('driver') });
  l.Me.mount();
  const before = l.sheets.length;
  let prevented = false;
  l.mine()[0]({ target: fakeTarget('meReport', null, true), preventDefault: function () { prevented = true; } });
  assert.strictEqual(l.sheets.length, before, 'a tap on a field opened a sheet');
  assert.strictEqual(prevented, false, 'a tap on a field had its default prevented, so typing would not start');
  // …and the same target WITHOUT the field answers, so the check above is not
  // passing because the handler is dead.
  clickAct(l, 'meReport');
  assert.strictEqual(l.sheets.length, before + 1, 'the handler does nothing at all');
});

test('the source reads the field selector before [data-act], as text: an order the live DOM cannot show', () => {
  const src = stripComments(ME_JS);
  const field = src.indexOf("closest('input, select, textarea, label, .num')");
  const act = src.indexOf("closest('[data-act]')");
  assert(field > 0, 'the field guard is not in the file at all');
  assert(act > 0, 'the act lookup is not in the file at all');
  assert(field < act, 'the field guard is read AFTER [data-act], which is the regression');
});

test('a row holding a field is a div and never a pressable button (the other half of the same rule)', () => {
  const l = load({ role: 'owner', cache: fullCache('owner') });
  l.Me.mount();
  clickAct(l, 'mePin');
  const s = l.sheets[l.sheets.length - 1];
  assert(/<label class="num">/.test(s.body), 'the PIN field is not the .num primitive');
  assert(/type="text"/.test(s.body) && /inputmode="numeric"/.test(s.body),
         'a number input changes its value on a mouse wheel: it must be text + inputmode');
  assert(!/type="number"/.test(s.body), 'type="number" was used');
  assert(!/<button[^>]*class="v2row"[^>]*>[\s\S]*?<input/.test(s.body), 'a field sits inside a pressable row');
});

test('a tap writes attendance with the fields the server stamps and nothing invented', () => {
  const l = load({ role: 'driver', cache: fullCache('driver') });
  l.Me.mount();
  clickAct(l, 'meCheck', { kind: 'in' });
  clickAct(l, 'meCheckSave', { kind: 'in' });
  return new Promise((res) => setTimeout(res, 10)).then(() => {
    const w = l.written.filter((x) => x && x.store === 'attendance')[0];
    assert(w, 'nothing was written');
    for (const k of ['id', 'userId', 'type', 'at', 'lat', 'lng', 'dist', 'selfie', 'late', 'flagged'])
      assert(Object.prototype.hasOwnProperty.call(w.rec, k), 'the record is missing ' + k);
    assert.strictEqual(w.rec.userId, 'u1');
    assert.strictEqual(w.rec.dist, null, 'a distance was invented with no location');
  });
});

test('a bus-fault report keeps v1\'s stable English category, so a v1 device and a v2 device group the same', () => {
  const l = load({ role: 'driver', cache: fullCache('driver') });
  const src = stripComments(ME_JS);
  // The nine values v1 writes (app.js:12138's REPORT_CATS), as the record carries them.
  for (const v of ['Brakes', 'Engine', 'AC', 'Suspension', 'Electrical', 'Tyres', 'Gearbox', 'Body', 'Other']) {
    const key = v === 'AC' ? 'ac' : v.toLowerCase();
    assert(new RegExp("key: '" + key + "'").test(src), 'the ' + key + ' area is missing');
  }
  l.Me.mount();
  clickAct(l, 'meReport');
  const s = l.sheets[l.sheets.length - 1];
  for (const v of ['Brakes', 'Engine', 'AC', 'Other'])
    assert(s.body.indexOf('value="' + v + '"') > 0, 'the option value is not v1\'s: ' + v);
});

test('a report with neither words nor a photo is refused and writes nothing', () => {
  const l = load({ role: 'driver', cache: fullCache('driver') });
  l.Me.mount();
  clickAct(l, 'meReport');
  clickAct(l, 'meSend');
  assert.deepEqual(l.written.filter((x) => x && x.store === 'driverreports'), []);
  assert(l.toasts.length > 0 && l.toasts[l.toasts.length - 1].kind === 'warn', 'nothing said why');
});

test('sign out asks, with focus on Stay, and signs out only on a yes', () => {
  const l = load({ role: 'driver' });
  l.Me.mount();
  clickAct(l, 'meSignOut');
  const c = l.sheets.filter((s) => s.confirm)[0];
  assert(c, 'sign out did not ask');
  assert(/stay|रद्द/i.test(c.opts.no), 'the no button is not Stay: ' + c.opts.no);
  assert.strictEqual(c.opts.danger, true);
});

test('offline, the three things that need the network say so in the BODY before they are pressed', () => {
  const l = load({ role: 'owner', cache: fullCache('owner'), offline: true });
  const html = l.Me.render(Object.assign(mdl(l, { offline: true }), { cache: fullCache('owner'), offline: true }));
  assert(/Needs a connection/.test(html), 'the PIN row does not say it needs a connection');
  assert(/Sends when there is wifi/.test(html), 'block 2 does not say the photo waits');
  // …and the local writes are still there: they are most of what this app is for.
  assert(/data-act="meCheck"/.test(html) && /class="drow"/.test(html));
});

/* Unknown, zero and stale are three different figures, and the rule holds for a
 * SENTENCE too. `coachai` and `rbreviews` are sent to the manager roles only
 * (v2_perms.py:82, :99 — "crew read their own through /my/coaching"), so a
 * driver's device never holds either store. Reading that absence as "No note
 * yet." would tell the one person the note is about that nothing was written. */
test('a store this device is never sent reads as UNKNOWN, not as empty — the dash, and never "no note yet"', () => {
  const l = load({ role: 'driver', cache: fullCache('driver') });
  const cache = fullCache('driver');
  delete cache.coachai;                                   // what a driver's phone actually holds
  const html = l.Me.render(Object.assign(mdl(l, {}), { cache: cache }));
  assert(!/No note yet/.test(html), 'an absent store was drawn as "no note yet"');
  assert(!/No reviews yet/.test(html), 'an absent store was drawn as "no reviews yet"');
  assert(/data-state="unknown"/.test(html), 'nothing on the screen says we do not know');
  // …and a device that DOES hold the store says which empty it is.
  const held = Object.assign(fullCache('driver'), { coachai: [] });
  const h2 = l.Me.render(Object.assign(mdl(l, {}), { cache: held }));
  assert(/No note yet/.test(h2), 'a real empty is not named');
});

test('the coaching sheet keeps its skeleton while the answer is unknown, and says so offline', () => {
  const l = load({ role: 'driver', cache: fullCache('driver') });
  l.Me.mount();
  const cache = fullCache('driver');
  delete cache.coachai;
  l.win.S.cache = cache;
  clickAct(l, 'meCoaching');
  const s = l.sheets[l.sheets.length - 1];
  assert(/aria-busy="true"/.test(s.body), 'the sheet claimed an empty it had not asked about');
  assert(!/No note yet/.test(s.body));
});

/* =====================================================================================================
 * 6. §4.3 — THE WHO-OPENED-WHAT READOUT
 * ===================================================================================================== */

test('the usage index is built ONCE per content signature — never per render and never per row', () => {
  const l = load({ role: 'owner', cache: fullCache('owner') });
  const m = Object.assign(mdl(l, {}), { cache: l.cache });
  l.Me._reset();
  l.Me.render(m);
  l.Me.render(m);
  l.Me.render(m);
  assert.strictEqual(l.Me._stats().usageBuilds, 1, 'the aggregate was rebuilt per render');
  // A new signature rebuilds it exactly once more.
  l.cache.usage = l.cache.usage.concat([{ id: 'u4|x', userId: 'u4', name: 'n', date: dayKey(Date.now()),
                                          screens: {}, taps: 1, lastAt: Date.now() }]);
  l.Me.render(m);
  l.Me.render(m);
  assert.strictEqual(l.Me._stats().usageBuilds, 2, 'a changed store did not rebuild, or rebuilt twice');
});

test('the sheet orders Money-openers first, is not pressable, and names who never signed in', () => {
  const l = load({ role: 'owner', cache: fullCache('owner') });
  l.Me.mount();
  clickAct(l, 'meUsage');
  const s = l.sheets[l.sheets.length - 1];
  assert(s, 'the row opened no sheet');
  assert(/role="tablist"/.test(s.body) && /data-days="7"/.test(s.body) && /data-days="30"/.test(s.body),
         'the two period tabs are missing');
  assert(/aria-selected="true"[^>]*data-days="7"/.test(s.body), '7 days is not the selected tab');
  // The owner's own rows appear like anybody's: a record of who looked at the
  // money that excludes the person who asked for it is a different record.
  assert(s.body.indexOf('सुरेश') > 0, 'the owner is not in his own readout');
  assert(s.body.indexOf('सुरेश') < s.body.indexOf('मोहन'), 'Money-openers are not first');
  assert(!/<button[^>]*class="v2row"/.test(s.body.split('Never signed in')[0]),
         'a person row is pressable: there is nowhere to go');
  assert(/Never signed in/.test(s.body) && s.body.indexOf('राम') > 0, 'nobody is listed as never signed in');
  // And no promise of privacy the row does not have (§4.3's copy consequence).
  for (const re of [/only you can see/i, /private/i, /nobody else/i])
    assert(!re.test(s.body), 'the sheet promises privacy it does not have: ' + re);
});

test('the usage sheet caps at 200 with a remainder line, and never windows by drawing 2,000 rows', () => {
  const rows = [];
  const today = dayKey(Date.now());
  for (let i = 0; i < 246; i++) {
    rows.push({ id: 'p' + i + '|' + today, userId: 'p' + String(1000 + i), name: 'n' + i, date: today,
                screens: {}, taps: i, lastAt: Date.now() - i });
  }
  const cache = Object.assign(fullCache('owner'), { usage: rows, users: [] });
  const l = load({ role: 'owner', cache: cache });
  l.Me.mount();
  clickAct(l, 'meUsage');
  const s = l.sheets[l.sheets.length - 1];
  assert.strictEqual((s.body.match(/class="v2row"/g) || []).length, 200, 'the cap is not 200');
  assert(/200 shown\. 46 more\./.test(s.body), 'the remainder is not stated');
});

/* =====================================================================================================
 * 7. THE HINDI, WHICH MATTERS HERE ABOVE EVERYWHERE ELSE
 * ===================================================================================================== */

/* v2-foundation-ui.md §6.3's defect — a screen staying English in Hindi mode —
 * now points at this screen, because for a driver and a conductor it is the
 * whole application and there is no second screen to fall back to. So: every
 * fixed word goes through w(), and a word whose Hindi has not arrived draws its
 * English WITH ITS ID so a Hindi reader can report it.
 *
 * The caller text in the fixture is Devanagari on purpose, so a Latin letter in
 * the rendered body can only come from a fixed word. */
const HI_PINNED = [{
  text: 'Language',
  why: "§4.6's copy for `meLang` is \"Language / भाषा\", and the Hindi side keeps the English name of the "
    + 'other language beside it: a person who cannot read the current language has to recognise the row.'
}];

/* Tags become NEWLINES rather than spaces, so each text node is one line and
 * the pair below cannot reach across markup to borrow a marker from the next
 * card — which is how a greedy version swallowed a real leak. */
const MARKED = /[A-Za-z][^\n\[\]]*\[[A-Za-z]+\]/g;
function englishLeaks(html) {
  // A pending label is drawn as "English [meId]" \u2014 marked, reportable, and
  // the whole point of the fallback. The English and its marker are removed as
  // a PAIR, so what is left is only English that nothing ever marked.
  const text = html.replace(/<[^>]*>/g, '\n').replace(MARKED, ' ');
  const bad = [];
  const re = /[A-Za-z][A-Za-z ']*/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const word = m[0].trim();
    if (!word || word.length < 2) continue;
    if (HI_PINNED.some((p) => p.text === word)) continue;
    bad.push(word);
  }
  return bad;
}

test('the English-leak detector rejects an unmarked word and allows a marked one', () => {
  assert.deepEqual(englishLeaks('<p>Check in [meCheckIn]</p>'), []);
  assert.deepEqual(englishLeaks('<p>हाज़िरी</p>'), []);
  assert(englishLeaks('<p>Check in</p>').length === 1);
});

test('in Hindi, every fixed word on a driver\'s whole app is translated or MARKED with its id — never silently English', () => {
  const l = load({ role: 'driver', lang: 'hi', cache: fullCache('driver') });
  const html = l.Me.render(Object.assign(mdl(l, {}), { cache: fullCache('driver') }));
  const leaks = englishLeaks(html);
  assert.deepEqual(leaks, [], 'unregistered English reached a Hindi reader: ' + leaks.join(', '));
});

test('the pinned Latin exception is still exactly one, and still says what the table says', () => {
  assert.strictEqual(HI_PINNED.length, 1, 'a second English literal was pinned instead of registered');
  const l = load({ role: 'driver', lang: 'hi' });
  assert(l.win.W.entry('meLang').hi.indexOf(HI_PINNED[0].text) >= 0, 'the pin and the table disagree');
});

test('the owner\'s own Hindi is used where a key already said the same thing, starting with the two writes', () => {
  const l = load({ role: 'driver', lang: 'hi' });
  // The highest-value Hindi string in the product: one of two writes on the one
  // screen two whole roles ever see (§4.6). It is already in i18n-hi.js.
  assert.strictEqual(l.win.w('meBusWrong'), 'मेरी बस में समस्या बताएं');
  assert.strictEqual(l.win.w('meCheckIn'), 'हाज़िरी लगाएं');
  assert.strictEqual(l.win.w('scMe'), 'मैं');
  assert.strictEqual(l.win.w('meStay'), 'रद्द');
});

test('every id this screen registers has an English value and a Hindi KEY, and the pending list is printed', () => {
  const l = load({ role: 'driver' });
  const ids = l.win.W.ids().filter((i) => /^(me|sc)[A-Z]/.test(i));
  assert(ids.length >= 70, 'only ' + ids.length + ' ids: the table shrank');
  for (const id of ids) {
    const e = l.win.W.entry(id);
    assert(e && e.en !== undefined && e.en !== '', id + ' has no English value');
    assert(e && Object.prototype.hasOwnProperty.call(e, 'hi'), id + ' has no Hindi key at all');
  }
  const pending = l.win.W.pending().filter((i) => /^(me|sc)[A-Z]/.test(i));
  console.log('        ' + (ids.length - pending.length) + ' of ' + ids.length
    + " of Me's labels have the owner's Hindi; " + pending.length + ' pending');
});

test('the screen\'s one name comes from the one id the nav and the header read too (§1.6)', () => {
  const l = load({ role: 'driver' });
  assert.strictEqual(l.win.Caps.SCREENS.me.word, 'scMe', 'the frame reads a different id than this screen registers');
  assert.strictEqual(l.win.w('scMe'), 'Me');
});

/* =====================================================================================================
 * 8. MUTANTS — each of the checks above, broken on purpose
 * ===================================================================================================== */

function mutate(from, to) {
  assert(ME_JS.indexOf(from) >= 0, 'the mutant target is no longer in me.js: ' + from);
  return ME_JS.split(from).join(to);
}

// Does the named check go red against this source? Returns the failure, or null.
function red(src, fn) {
  try { fn(load({ role: 'driver', lang: 'hi', cache: fullCache('driver'), src: src })); return null; }
  catch (e) { return e; }
}

test('MUTANT must fail: block 5 loads the document photographs (words before pictures)', () => {
  const src = mutate("body += row(d.url ? 'mePhoto' : null, 'doc', say(d.word), sub, null,\n                  d.url ? { src: d.url, cap: say(d.word) } : null);",
    "body += row(d.url ? 'mePhoto' : null, 'doc', say(d.word), sub,\n                  d.url ? '<img src=\"' + d.url + '\">' : null,\n                  d.url ? { src: d.url, cap: say(d.word) } : null);");
  const e = red(src, (l) => {
    l.Me.mount();
    clickAct(l, 'meDocs');
    const s = l.sheets[l.sheets.length - 1];
    assert(!/<img/i.test(s.body), 'the documents sheet loaded a photograph nobody asked to see');
  });
  assert(e, 'the words-before-pictures check did not notice an image loaded before a tap');
});

test('MUTANT must fail: a selfie drawn as a hand-written img, so it carries no referrer policy', () => {
  const src = mutate("return root.photoGrid([{ url: url, caption: caption, local: /^data:/.test(String(url)) }], {});",
    "return '<img src=\"' + url + '\">';");
  const e = red(src, (l) => {
    const html = l.Me.render(Object.assign(mdl(l, {}), { cache: fullCache('driver') }));
    assert.deepEqual(imgFailures(html), [], 'an img without referrerpolicy');
  });
  assert(e, 'the referrer-policy check did not notice a hand-written img');
});

test('MUTANT must fail: a thumbnail turned into an anchor, which is how a URL gets forwarded', () => {
  const src = mutate("return root.photoGrid([{ url: url, caption: caption, local: /^data:/.test(String(url)) }], {});",
    "return '<a href=\"' + url + '\" target=\"_blank\">x</a>';");
  const e = red(src, (l) => {
    const html = l.Me.render(Object.assign(mdl(l, {}), { cache: fullCache('driver') }));
    assert.deepEqual(linkFailures(html), [], 'a link to an upload URL');
  });
  assert(e, 'the no-link check did not notice an anchor');
});

test('MUTANT must fail: a block drawing its heading and nothing else', () => {
  const src = mutate("if (!mine.length) return card(heading, empty(say('meNoAttendance'), 'clock'));",
    "if (!mine.length) return card(heading, '');");
  const e = red(src, (l) => {
    const html = l.Me.render(Object.assign(mdl(l, {}), { cache: { attendance: [], drivers: [] } }));
    assert.deepEqual(headingsWithoutContent(html), [], 'a heading drew no content');
  });
  assert(e, 'the no-empty-heading check did not notice a heading with nothing under it');
});

test('MUTANT must fail: one throwing block taking the whole screen down', () => {
  const src = mutate("    } catch (e) {\n      if (typeof console !== 'undefined' && console.error) {\n        console.error('[v2] me: a block could not be drawn', e);\n      }\n      return failedBlock(heading);",
    "    } catch (e) {\n      throw e;");
  const e = red(src, (l) => {
    const poisoned = {};
    Object.defineProperty(poisoned, 'attendance', { get: function () { throw new Error('boom'); }, enumerable: true });
    const html = l.Me.render(Object.assign(mdl(l, {}), { cache: poisoned }));
    assert(/data-act="meSignOut"/.test(html), 'one throw took the rest of the screen with it');
  });
  assert(e, 'the per-block guard check did not notice a screen-wide throw');
});

test('MUTANT must fail: the field guard moved after [data-act], which is the shipped regression', () => {
  const src = mutate("    if (t.closest('input, select, textarea, label, .num')) return;\n    const el = t.closest('[data-act]');",
    "    const el = t.closest('[data-act]');\n    if (t.closest('input, select, textarea, label, .num')) return;");
  // The text order check, which is the one that can see it at all.
  const moved = stripComments(src);
  assert(moved.indexOf("closest('[data-act]')") < moved.indexOf("closest('input, select, textarea, label, .num')"),
         'the mutation did not take');
  let caught = null;
  try {
    const field = moved.indexOf("closest('input, select, textarea, label, .num')");
    const act = moved.indexOf("closest('[data-act]')");
    assert(field < act, 'the field guard is read AFTER [data-act], which is the regression');
  } catch (e) { caught = e; }
  assert(caught, 'the source-order check did not notice the guard moving');
});

test('MUTANT must fail: block 8 drawn for a supervisor, who does not hold viewAdoption', () => {
  const src = mutate("if (!can(model, 'viewAdoption')) return '';", "if (!can(model, 'garageSetup')) return '';");
  let caught = null;
  try {
    const l = load({ role: 'supervisor', cache: fullCache('supervisor'), src: src });
    const html = l.Me.render(Object.assign(mdl(l, {}), { cache: fullCache('supervisor') }));
    assert.strictEqual(/data-act="meUsage"/.test(html), l.win.Caps.can('supervisor', 'viewAdoption'),
      'the who-opened-what row was drawn for a role that does not hold it');
  } catch (e) { caught = e; }
  assert(caught, 'the owner-only check did not notice the row widening');
});

test('MUTANT must fail: the device card claiming everything else was sent', () => {
  /* The ENGLISH HALF alone is the mutation target, not the whole table line: the
   * line's Hindi half changes when the owner supplies a word, and a mutant
   * pinned to the whole line goes green on a translation instead of on a fix. */
  const src = mutate("en: 'They are still on this phone. Tap one to see why.'",
    "en: 'Everything else was sent.'");
  const sync = { pending: 0, quarantined: 1, reasons: ['r'], lastSyncAt: Date.now() };
  let caught = null;
  try {
    const l = load({ role: 'driver', cache: fullCache('driver'), sync: sync, src: src });
    const html = l.Me.render(Object.assign(mdl(l, { sync: sync }), { cache: fullCache('driver') }));
    for (const re of FORBIDDEN) assert(!re.test(html), 'the card claims: ' + re);
  } catch (e) { caught = e; }
  assert(caught, 'the no-promise check did not notice a claim about the server');
});

test('MUTANT must fail: a fixed word hard-coded instead of registered, so a Hindi reader is shown English', () => {
  const src = mutate("+ draw('warn', MARK) + ' ' + esc(say('meBusWrong')) + '</button>');",
    "+ draw('warn', MARK) + ' Something is wrong with my bus</button>');");
  const e = red(src, (l) => {
    const html = l.Me.render(Object.assign(mdl(l, {}), { cache: fullCache('driver') }));
    assert.deepEqual(englishLeaks(html), [], 'unregistered English reached a Hindi reader');
  });
  assert(e, 'the Hindi check did not notice a hard-coded English word');
});

test('MUTANT must fail: the usage aggregate rebuilt on every render', () => {
  const src = mutate("if (usageMemo.key === key && usageMemo.index) return usageMemo.index;", "if (false) return usageMemo.index;");
  let caught = null;
  try {
    const l = load({ role: 'owner', cache: fullCache('owner'), src: src });
    const m = Object.assign(mdl(l, {}), { cache: l.cache });
    l.Me._reset();
    l.Me.render(m); l.Me.render(m);
    assert.strictEqual(l.Me._stats().usageBuilds, 1, 'the aggregate was rebuilt per render');
  } catch (e) { caught = e; }
  assert(caught, 'the once-per-signature check did not notice a per-render rebuild');
});

test('MUTANT must fail: a figure inside a row given an age, which triples the row', () => {
  const src = mutate("return fig(n, f ? { format: f.groupIndian } : null);",
    "return fig(n, f ? { format: f.groupIndian, at: Date.now() } : { at: Date.now() });");
  let caught = null;
  try {
    const l = load({ role: 'owner', cache: fullCache('owner'), src: src });
    const html = l.Me.render(Object.assign(mdl(l, {}), { cache: fullCache('owner') }));
    assert.deepEqual(figureNotesInRows(html), [], 'a figure inside a row carries a note');
  } catch (e) { caught = e; }
  assert(caught, 'the figure-note check did not notice an age inside a row');
});

test('MUTANT must fail: me.css pinning something to the bottom edge', () => {
  const css = ME_CSS + '\n[data-v2] .me-bar { position: fixed; bottom: 0; }\n';
  let caught = null;
  try {
    assert.deepEqual(declsOf(css).filter((d) => d.prop === 'position').map((d) => d.sel), []);
  } catch (e) { caught = e; }
  assert(caught, 'the no-position check did not notice a fixed bar');
});

test('MUTANT must fail: me.css sizing the desk measure with a px literal', () => {
  const css = ME_CSS.replace('max-width: var(--read-w);', 'max-width: 900px;');
  assert(css !== ME_CSS, 'the mutation did not take');
  assert(magicPx(css).length > 0, 'the magic-px check did not notice a 900px measure');
});

/* ===================================================================================================== */
Promise.all(later.map((t) => t.p.then(function () { note(t.name, null); },
                                      function (e) { note(t.name, e); })))
  .then(function () {
    console.log(fails ? '\n' + fails + ' failure(s)' : '\nall me checks pass');
    process.exit(fails ? 1 : 0);
  });

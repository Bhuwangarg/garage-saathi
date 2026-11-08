/* Tests for Today (#1) — v2/screens/today.js and v2/ui/today.css.
 * Run: node test_v2_today.js
 *
 * At the repo ROOT and not in v2/, because scripts/run-tests.py discovers
 * test_*.js at the root only and does not recurse. A test in v2/ would never
 * run, and a test nobody runs is not a test.
 *
 * Node, no browser, in the shape of test_v2_shell.js: the real v2/ui/icons.js,
 * v2/ui/words.js, v2/ui/states.js, v2/fmt.js, v2/cost.js, v2/caps.js,
 * v2/router.js and v2/screens/today.js are loaded in a vm context holding a
 * stub window, and every assertion is on the markup STRING `render` returns.
 * That is why `render(model)` is pure: a screen whose rules can only be checked
 * in a browser is a screen whose rules are checked by nobody.
 *
 * THE THREE CHECKS THIS FILE EXISTS FOR, and each has a commit behind it.
 *
 *  1. THE FOUR-BLOCK CAP. Today is a doorway. Five cards each linking to a
 *     different ranked list is what Attention replaced (v2-ux.md §4.1 #1,
 *     "must NOT"), and the owner's Today is close to the line already. Checked
 *     for all six roles, in both densities, in the MARKUP and in the table the
 *     markup is built from — a cap that holds only in the data is a cap one
 *     render away from being wrong.
 *
 *  2. NO COUNT THAT CANNOT REACH ZERO. "110 of 110 missing documents"
 *     (5eb8c6e) and "67 buses need a driver" against 54 drivers (ba274f6). A
 *     number that can never be zero teaches people to scroll past red. Checked
 *     three ways: the seed's 2,384 parts at reorder level 0 are not low stock;
 *     tonight's departure count counts the checks OUTSTANDING, so a night where
 *     every bus is released reads a sentence and not "See all (24)"; and every
 *     seat count is over tonight's buses, reading a dash before they are picked.
 *
 *  3. THE EARLY RETURN IN THE ONE LISTENER. `ev.target.closest('input, select,
 *     textarea, label, .num')` must return BEFORE anything reads `[data-act]`.
 *     This is the line a shipped regression was missing: tapping a count field
 *     navigated away instead of letting the storekeeper type. Checked by
 *     source ORDER as well as behaviour, because a guard that is present but
 *     after the read is a guard that does nothing.
 *
 * Every detector below is fed input it MUST reject before it is turned on the
 * real file, and the mutants at the bottom break each check on purpose. A
 * checker that cannot fail is decoration, and this repo has shipped a bug
 * behind one.
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

const TODAY_JS = read(V2('screens', 'today.js'));
const TODAY_CSS = read(V2('ui', 'today.css'));

/* =====================================================================================================
 * THE SANDBOX
 * ===================================================================================================== */

const SRC = ['ui/icons.js', 'ui/words.js', 'ui/states.js', 'fmt.js', 'cost.js', 'caps.js', 'router.js'];

/* The clock is an ARGUMENT everywhere in today.js, so every assertion below is
 * on a model this file wrote. It is anchored to the real now rather than a
 * fixed date for one reason: `ui/states.js`'s `figure({at})` reads the real
 * clock itself and refuses a timestamp more than a minute in the future, so a
 * hard-coded 2026 date would make every tile say "Updated time unknown" and the
 * freshness assertions would be testing the stub and not the screen. */
const NOW = Date.now();
const DAY = 86400000;
const HOUR = 3600000;
/* THE GARAGE'S DAY, because this builds a NIGHTLIST ID and `v2/night.js` writes
 * those on UTC+5:30 -- fixed, matching the server's `_ist_day`. It must not be
 * the device's local date.
 *
 * It was the local date, and that is the second half of the defect today.js's
 * `dayKey` had: the screen read the device's day and so did this fixture, both
 * wrong in the same direction, so they agreed and the suite stayed green. Once
 * `dayKey` moved to the garage clock and this did not, they disagreed for the
 * 5.5 hours a day when IST is already on tomorrow -- `tonight()` found no row
 * for `nl-<device date>`, and four MUTANT checks below went green because the
 * count they watch had nothing to count either way. A check that cannot fail is
 * decoration, so the fixture moves with the screen. Measured under TZ=UTC. */
const dayKeyOf = (ms) => new Date(ms + 19800000).toISOString().slice(0, 10);
const NIGHT = 'nl-' + dayKeyOf(NOW);

/* load(o) -> {win, Today, logs, sheets}
 *   o.lang     'en' | 'hi'
 *   o.role     the signed-in role
 *   o.today    the module source, so a mutant can be loaded instead of the file
 *   o.extra    {name: module} put on the window before today.js loads (Attention)
 */
function load(o) {
  o = o || {};
  const logs = { warn: [], error: [], info: [] };
  const sheets = [];
  const clicks = [];
  const html = {
    lang: o.lang || 'en', attrs: { 'data-v2': '', 'data-density': 'yard' },
    getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(html.attrs, k) ? html.attrs[k] : null; },
    setAttribute: function (k, v) { html.attrs[k] = String(v); }
  };
  const sandbox = {
    navigator: { onLine: true, userAgent: 'node', language: 'en' },
    location: { href: 'http://localhost/v2/', pathname: '/v2/' },
    document: {
      documentElement: html, title: '', body: null,
      addEventListener: function (type, fn) { if (type === 'click') clicks.push(fn); },
      removeEventListener: function () {},
      getElementById: function () { return null; },
      querySelector: function () { return null; }, querySelectorAll: function () { return []; },
      createElement: function () { return { style: {}, setAttribute: function () {}, appendChild: function () {} }; },
      head: { appendChild: function () {} }
    },
    console: {
      warn: function (m) { logs.warn.push(String(m)); },
      error: function (m) { logs.error.push(String(m)); },
      info: function (m) { logs.info.push(String(m)); },
      log: function () {}
    },
    setTimeout: function () { return 0; }, clearTimeout: function () {},
    addEventListener: function () {}, removeEventListener: function () {},
    S: { user: o.role ? { id: 'u-me', role: o.role, name: 'A' } : null, route: null, stack: [], cache: {} },
    V2: { openSheet: function (title, body) { sheets.push({ title: title, body: body }); return true; } }
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  for (const f of SRC) vm.runInContext(read(V2(f)), ctx, { filename: V2(f) });
  if (o.extra) for (const k of Object.keys(o.extra)) sandbox[k] = o.extra[k];
  vm.runInContext(o.today || TODAY_JS, ctx, { filename: V2('screens', 'today.js') });
  return { win: sandbox, Today: sandbox.Today, logs: logs, sheets: sheets, clicks: clicks, root: html };
}

/* =====================================================================================================
 * THE WORLD. One fixture, shaped so that every role's Today has something on it
 * and every count in it can be driven to zero by the tests below.
 * ===================================================================================================== */

function world(over) {
  const w = {
    buses: [
      { id: 'b1', regNo: 'Bus 14' }, { id: 'b2', regNo: 'Bus 31' },
      { id: 'b3', regNo: 'Bus 9' }, { id: 'b4', regNo: 'Bus 23' }
    ],
    users: [{ id: 'u-me', name: 'Ravi' }, { id: 'u-other', name: 'Suresh' }, { id: 'u-mech', name: 'Imran' }],
    jobcards: [
      // standing in the yard, oldest first: b3 (3 days) then b1 (6 hours)
      { id: 'j1', busId: 'b1', problem: 'brake light', status: 'open', enterAt: NOW - 6 * HOUR },
      { id: 'j2', busId: 'b3', problem: 'clutch', status: 'in-progress', enterAt: NOW - 3 * DAY,
        startAt: NOW - 2 * DAY, assignees: [{ userId: 'u-me' }] },
      // the supervisor's own close, waiting on a second signature
      { id: 'j3', busId: 'b2', problem: 'tyre', status: 'done', enterAt: NOW - 5 * DAY,
        closedAt: NOW - 2 * DAY, closedBy: 'u-me' },
      // somebody ELSE's close: never on his waiting card
      { id: 'j4', busId: 'b4', problem: 'horn', status: 'done', enterAt: NOW - 5 * DAY,
        closedAt: NOW - 1 * DAY, closedBy: 'u-other' },
      // another mechanic's open card: never on a mechanic's own list
      { id: 'j5', busId: 'b4', problem: 'wiper', status: 'open', enterAt: NOW - 2 * HOUR,
        assignees: [{ userId: 'u-mech' }] }
    ],
    parts: [{ id: 'p1', name: 'FULE FILTER', qty: 4, reorderLevel: 10 }],
    purchases: [{ id: 'pu1', paymentStatus: 'pending', amount: 12000 }],
    gatechecks: [{ id: 'g1', busId: 'b1', status: 'released', startedAt: NOW - 2 * HOUR, releasedAt: NOW - 1 * HOUR }],
    nightlist: [{ id: NIGHT, buses: { b1: { running: true }, b2: { running: true } } }],
    drivers: [
      { id: 'd1', name: 'Mohan', busId: 'b1', crewRole: 'driver', driverSlot: 1, status: 'active' },
      { id: 'd2', name: 'Kiran', busId: 'b1', crewRole: 'conductor', status: 'active' },
      { id: 'd3', name: 'Free', busId: null, crewRole: 'driver', status: 'active' }
    ],
    coachai: [{ id: 'c1', crewId: 'd1', status: 'draft', week: '2026-11-02', at: NOW - 2 * DAY,
                en: { good: 'a', fix: 'b', tip: 'c' } }],
    digest: [{ id: 'dg1', week: '2026-11-02', headline: 'A quiet week', at: NOW - 3 * DAY,
               sections: [{ title: 'Money', lines: ['one', 'two', 'three', 'four'] }] }],
    rbreviews: [{ id: 'rv1', stars: 1, at: NOW - 3 * DAY, busId: 'b4' },
                { id: 'rv2', stars: 5, at: NOW - 4 * DAY, busId: 'b1' }],
    rbalias: [{ id: 'al1', name: 'MOHAN K', regNo: 'Bus 14', status: 'typed', updatedAt: NOW - DAY },
              { id: 'al2', name: 'KIRAN', regNo: 'Bus 14', status: 'crew', crewId: 'd2', updatedAt: NOW - 2 * DAY }],
    fuel: [], def: [], ledger: [], trips: [], incidents: [], components: []
  };
  return Object.assign(w, over || {});
}

// The frame's model — the exact shape v2/shell.js hands a screen, plus the
// three things a pure render cannot read for itself.
function frame(role, over) {
  const o = over || {};
  return Object.assign({
    route: 'today', params: null, role: role,
    density: 'yard',
    user: { id: 'u-me', role: role, name: 'Ravi' },
    cache: world(o.cache),
    replica: { behind: 0, complete: true },
    stale: false, offline: false,
    /* A fresh signature per frame, so no memo inside the screen can answer one
     * fixture's question with another fixture's number. The memo itself is
     * checked on purpose below, with a signature held still. */
    now: NOW, sig: 'sig-' + (++sigSeq),
    sync: { lastSyncAt: NOW - 4 * 60000, pending: 0, pendingKeys: [], status: 'synced', lastError: '' }
  }, o.model || {});
}

let sigSeq = 0;

const ROLES = ['owner', 'supervisor', 'mechanic', 'store', 'crewmanager', 'office'];

/* =====================================================================================================
 * A SMALL MARKUP READER, and it is fed input it must reject first
 * ===================================================================================================== */

// Every <tag …> opening in order, with its class list. Enough to answer "is
// this .figure-note inside a .v2row?" without a DOM.
function tags(html) {
  const out = [];
  const re = /<(\/?)([a-z0-9]+)([^>]*)>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[3] || '';
    const cls = (/\sclass="([^"]*)"/.exec(attrs) || [])[1] || '';
    out.push({ close: m[1] === '/', tag: m[2], attrs: attrs, classes: cls.split(/\s+/).filter(Boolean), at: m.index });
  }
  return out;
}

// Does any element carrying `inner` sit inside an element carrying `outer`?
function nestedIn(html, outer, inner) {
  const stack = [];
  for (const t of tags(html)) {
    if (t.close) { stack.pop(); continue; }
    if (/\/>$/.test('<' + t.tag + t.attrs + '>')) continue;      // self-closing
    if (t.classes.includes(inner) && stack.some((s) => s.includes(outer))) return true;
    if (t.tag === 'br' || t.tag === 'img' || t.tag === 'input' || t.tag === 'path' || t.tag === 'circle') continue;
    stack.push(t.classes);
  }
  return false;
}

test('the nesting reader can fail: it finds a figure-note inside a v2row and spares one outside it', () => {
  assert.strictEqual(nestedIn('<div class="v2row"><span class="figure-note">x</span></div>', 'v2row', 'figure-note'), true);
  assert.strictEqual(nestedIn('<div class="kpi"><span class="figure-note">x</span></div>', 'v2row', 'figure-note'), false);
});

// Every block the body drew: a .kpirow or a .card, in order.
function blocksOf(html) {
  return tags(html).filter((t) => !t.close && (t.classes.includes('kpirow') || t.classes.includes('card')));
}

test('the block reader can fail: it counts a kpirow and a card and ignores a v2row', () => {
  assert.strictEqual(blocksOf('<div class="kpirow"></div><section class="card"></section><div class="v2row"></div>').length, 2);
});

const headings = (html) => (html.match(/<h3>([^<]*)<\/h3>/g) || []).map((h) => h.replace(/<\/?h3>/g, ''));

/* =====================================================================================================
 * 1. THE SHAPE EVERY SCREEN OBEYS
 * ===================================================================================================== */

test('today.js exports render, model and mount, and registers itself with the router at load', () => {
  const l = load({ role: 'owner' });
  for (const n of ['render', 'model', 'mount']) assert.strictEqual(typeof l.Today[n], 'function', 'Today.' + n);
  assert.strictEqual(l.win.Router.moduleFor('today'), l.Today, 'today.js did not register itself at load');
});

test('render is pure: the same model twice gives the same string, and it reads no clock of its own', () => {
  const l = load({ role: 'supervisor' });
  const m = frame('supervisor');
  const a = l.Today.render(m);
  const b = l.Today.render(m);
  assert.strictEqual(a, b);
  assert(a.length > 0, 'the supervisor got an empty screen');
});

test('one string, and nothing in this file touches the DOM or measures a row', () => {
  const src = TODAY_JS.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  for (const banned of ['offsetHeight', 'getBoundingClientRect', 'getComputedStyle',
                        'appendChild', 'createElement', 'insertAdjacentHTML', 'innerHTML']) {
    assert(src.indexOf(banned) < 0, 'today.js uses ' + banned + ': the frame does the one insert, and nothing measures a row');
  }
  assert.strictEqual(typeof load({ role: 'owner' }).Today.render(frame('owner')), 'string');
});

test('Today declares no capability, and the two roles with no Today cannot reach it', () => {
  const l = load({ role: 'driver' });
  const C = l.win.Caps;
  assert.strictEqual(C.SCREENS.today.declares, C.OPEN_BY_DESIGN, 'Today stopped being open by design');
  assert(C.SCREENS.today.openReason, 'a sentinel with no reason beside it admits nobody');
  for (const r of ['driver', 'conductor']) {
    assert.strictEqual(C.holds(r, 'today'), false, r + ' can reach Today, which would be a shell ([E] 8db78e7)');
  }
  // …and the six that do hold it really do, so the line above is not passing on an empty table.
  for (const r of ROLES) assert.strictEqual(C.holds(r, 'today'), true, r + ' lost Today');
});

test('a role with no block draws nothing at all, rather than a heading over an empty card', () => {
  const l = load({ role: 'driver' });
  assert.strictEqual(l.Today.render(frame('driver')), '');
  assert(l.logs.warn.some((x) => /no block for role/.test(x)), 'it drew nothing and said nothing');
});

/* =====================================================================================================
 * 2. THE FOUR-BLOCK CAP — the check this file exists for
 * ===================================================================================================== */

test('AT MOST FOUR BLOCKS for every one of the six roles, in both densities', () => {
  for (const role of ROLES) {
    for (const density of ['yard', 'desk']) {
      const l = load({ role: role });
      const html = l.Today.render(frame(role, { model: { density: density } }));
      const n = blocksOf(html).length;
      assert(n >= 1, role + ' at ' + density + ' drew no block at all');
      assert(n <= 4, role + ' at ' + density + ' drew ' + n + ' blocks: Today is a doorway (§2.1)');
      assert.strictEqual(l.Today.model(role, modelRows(role, density)).blocks.length <= 4, true,
        role + "'s model carries more than four blocks");
    }
  }
});

function modelRows(role, density) {
  const w = world();
  w.me = { id: 'u-me', role: role, name: 'Ravi' };
  w.now = NOW; w.density = density; w.sig = 'sig-' + (++sigSeq);
  w.syncAt = NOW - 4 * 60000;
  return w;
}

test('…and the cap is structural: no role has more than four builders behind it', () => {
  const l = load({ role: 'owner' });
  for (const role of Object.keys(l.Today._blocks)) {
    assert(l.Today._blocks[role].length <= 4, role + ' has ' + l.Today._blocks[role].length + ' block builders');
  }
  assert.deepEqual(Object.keys(l.Today._blocks).sort(), ROLES.slice().sort(),
    'a role was added to or removed from Today without the cap being re-read');
});

test('no block links to more than one screen', () => {
  for (const role of ROLES) {
    const l = load({ role: role });
    const html = l.Today.render(frame(role));
    // Split on the block boundaries and read every destination inside each one.
    for (const chunk of html.split(/<section class="card">|<div class="kpirow/).slice(1)) {
      const names = [];
      for (const m of chunk.match(/data-(?:nav|screen)="([^"]*)"/g) || []) {
        const name = /"([^"]*)"/.exec(m)[1];
        if (names.indexOf(name) < 0) names.push(name);
      }
      // jobcard is Jobs' own detail (Caps.SCREENS.jobcard.parent === 'jobs'),
      // so a card whose rows open the card and whose "See all" opens the list
      // is ONE destination, not two.
      const family = names.map((n) => (n === 'jobcard' ? 'jobs' : n));
      const uniq = family.filter((v, i) => family.indexOf(v) === i);
      assert(uniq.length <= 1, role + ': one block links to ' + uniq.join(' + '));
    }
  }
});

test('a figure tile is not a control: nothing inside a kpirow is pressable', () => {
  for (const role of ['owner', 'store', 'crewmanager', 'office']) {
    const l = load({ role: role });
    const html = l.Today.render(frame(role));
    const row = /<div class="kpirow[^"]*">([\s\S]*?)<\/div><\/div><\/div><\/div>/.exec(html);
    if (!row) continue;
    for (const bad of ['data-act', 'data-nav', 'href', 'tabindex', '<button']) {
      assert(row[1].indexOf(bad) < 0, role + "'s figure row holds a " + bad + ': four tiles that navigate is four cards to four lists');
    }
  }
});

/* =====================================================================================================
 * 3. A BLOCK WHOSE CAPABILITY THE ROLE LACKS IS ABSENT — no heading, not greyed
 * ===================================================================================================== */

test('a block the role lacks the capability for is absent, with no heading', () => {
  const l = load({ role: 'supervisor' });
  const sup = l.Today.render(frame('supervisor'));
  assert(headings(sup).indexOf('Standing in the yard') >= 0, 'the supervisor lost his first card');

  // The office holds neither viewJobs nor gateCheck, so neither heading exists
  // ANYWHERE in its body — not empty, not greyed, absent.
  const off = load({ role: 'office' }).Today.render(frame('office'));
  for (const gone of ['Standing in the yard', 'Going out tonight', 'Your jobs', 'Parts asked for']) {
    assert(off.indexOf(gone) < 0, 'the office was shown "' + gone + '", a block it holds no capability for');
  }
  assert(off.indexOf('aria-disabled') < 0, 'a block was disabled instead of absent');
});

/* Every role's own four blocks sit behind capabilities that role HOLDS — §2.4
 * requires that, so none of the six can be used to watch a block disappear. The
 * guard is therefore proved by pointing one block at a capability the role does
 * not hold and watching it go: `money` is owner + supervisor, so the
 * storekeeper's fourth card must vanish entirely, heading and all. */
const STORE_GATED = () => swap("  function jobsWaiting(q) {\n    if (!can(q.role, 'viewJobs')) return null;",
                               "  function jobsWaiting(q) {\n    if (!can(q.role, 'money')) return null;");

test('…and the guard is what does it: a block pointed at a capability the role lacks disappears', () => {
  const held = load({ role: 'store' }).Today.render(frame('store'));
  assert(held.indexOf('Jobs waiting for parts') > 0, 'the storekeeper never had the block this check removes');
  const l = load({ role: 'store', today: STORE_GATED() });
  const html = l.Today.render(frame('store'));
  assert(html.indexOf('Jobs waiting for parts') < 0,
    'a block whose capability the role lacks was drawn anyway — heading, empty state and all');
  assert(blocksOf(html).length === blocksOf(held).length - 1, 'the block was emptied rather than removed');
});

test('the owner holds money and fleet, so the figure row is four tiles; a role with one half gets two', () => {
  const l = load({ role: 'owner' });
  const html = l.Today.render(frame('owner'));
  const tiles = (html.match(/<div class="kpi">/g) || []).length;
  assert.strictEqual(tiles, 4, 'the owner drew ' + tiles + ' tiles, not the four numbers of §2.3');
  assert(html.indexOf('Repair cost, 30 days') > 0 && html.indexOf('Buses on road') > 0);
  const st = load({ role: 'store' }).Today.render(frame('store'));
  assert.strictEqual((st.match(/<div class="kpi">/g) || []).length, 2, "the storekeeper's counter is two numbers");
  assert(st.indexOf('Repair cost, 30 days') < 0, 'the fleet-wide repair cost reached the store counter');
});

/* =====================================================================================================
 * 4. NO `.figure-note` INSIDE ANY `.v2row` — the rule a well-meaning builder breaks first
 * ===================================================================================================== */

test('no .figure-note inside any .v2row, for every role, both densities, stale and not', () => {
  for (const role of ROLES) {
    for (const density of ['yard', 'desk']) {
      for (const stale of [false, true]) {
        const l = load({ role: role });
        const html = l.Today.render(frame(role, { model: {
          density: density, stale: stale, replica: { behind: stale ? 5180 : 0, complete: !stale } } }));
        assert.strictEqual(nestedIn(html, 'v2row', 'figure-note'), false,
          role + '/' + density + (stale ? '/stale' : '') + ': a figure inside a row carries its age — '
          + 'that is a block element per row and one age call per row (foundation §2.3 rule 4)');
      }
    }
  }
});

test('…and the freshness line is where the age IS said, exactly once', () => {
  const l = load({ role: 'supervisor' });
  const html = l.Today.render(frame('supervisor'));
  assert.strictEqual((html.match(/class="today-fresh/g) || []).length, 1, 'the screen says its age once, or not at all');
  assert(/Updated 4 minutes ago/.test(html), 'the freshness line does not say how old this is: ' + html.slice(0, 200));
  const off = l.Today.render(frame('supervisor', { model: { offline: true } }));
  assert(/today-fresh-off/.test(off), 'offline, the line does not turn --warn');
  assert(/No signal since \d\d:\d\d/.test(off), 'offline, the line does not say when the signal went');
});

/* =====================================================================================================
 * 5. "SEE ALL" IS ABSENT AT A COUNT OF 0 OR 1
 * ===================================================================================================== */

test('"See all" is absent at a count of 1 and present at 2 — and the heading carries no count either', () => {
  const one = { jobcards: [{ id: 'j1', busId: 'b1', problem: 'brake light', status: 'open', enterAt: NOW - HOUR }] };
  const l = load({ role: 'supervisor' });
  const a = l.Today.render(frame('supervisor', { cache: one }));
  assert(a.indexOf('Standing in the yard') > 0, 'the one-row card vanished');
  assert(a.indexOf('See all') < 0, '"See all (1)" is a button that goes somewhere to show the same row');
  assert(headings(a).every((h) => !/\d/.test(h)), 'a heading carries a count');

  const two = { jobcards: one.jobcards.concat([{ id: 'j2', busId: 'b3', problem: 'clutch', status: 'open', enterAt: NOW - 2 * HOUR }]) };
  const b = l.Today.render(frame('supervisor', { cache: two }));
  assert(/See all \(2\)/.test(b), 'two rows and no way to the list');
});

test('a card capped at five rows says how many there are, and draws five', () => {
  const many = { jobcards: [] };
  for (let i = 0; i < 9; i++) many.jobcards.push({ id: 'j' + i, busId: 'b1', problem: 'x', status: 'open', enterAt: NOW - i * HOUR });
  const l = load({ role: 'supervisor' });
  const yard = l.Today.render(frame('supervisor', { cache: many }));
  const card = /Standing in the yard<\/h3>([\s\S]*?)<\/section>/.exec(yard)[1];
  assert.strictEqual((card.match(/class="v2row/g) || []).length, 5, 'the yard cap is five rows (§2.1)');
  assert(/See all \(9\)/.test(card), 'the cap did not say how many there are');
  const desk = l.Today.render(frame('supervisor', { cache: many, model: { density: 'desk' } }));
  const dcard = /Standing in the yard<\/h3>([\s\S]*?)<\/section>/.exec(desk)[1];
  assert.strictEqual((dcard.match(/class="v2row/g) || []).length, 9, 'the desk cap is twelve rows, so nine fit');
  assert(dcard.indexOf('class="sub"') < 0, 'a desk row drew its second line: a desk row is one line and 32px');
});

/* =====================================================================================================
 * 6. THE SUPERVISOR'S BLOCK 3 — only his own closes, and it does not press
 * ===================================================================================================== */

test('the waiting card shows ONLY closedBy === me.id, and never somebody else\'s close', () => {
  const l = load({ role: 'supervisor' });
  const html = l.Today.render(frame('supervisor'));
  const card = /Waiting for someone else<\/h3>([\s\S]*?)<\/section>/.exec(html);
  assert(card, 'the supervisor lost the card that tells him his closes are waiting (stage 1 §9 item 2)');
  assert(card[1].indexOf('Bus 31') > 0, 'his own close (j3, closedBy u-me) is not there');
  assert(card[1].indexOf('Bus 23') < 0, "somebody else's close (j4, closedBy u-other) is on his card");
});

test('…and those rows are information, not a task: div.v2row, no href, no press, not focusable', () => {
  const l = load({ role: 'supervisor' });
  const card = /Waiting for someone else<\/h3>([\s\S]*?)<\/section>/.exec(l.Today.render(frame('supervisor')))[1];
  const rows = card.match(/<(a|div|button)[^>]*class="v2row[^"]*"[^>]*>/g) || [];
  assert(rows.length > 0, 'no row at all');
  for (const r of rows) {
    assert(/^<div/.test(r), 'a waiting close is pressable: ' + r);
    for (const bad of ['href', 'data-act', 'data-nav', 'tabindex', 'role=']) {
      assert(r.indexOf(bad) < 0, 'a waiting close carries ' + bad + ': it is not a control (§2.5)');
    }
  }
});

test('the owner never sees his own closes on Today either', () => {
  const l = load({ role: 'owner' });
  const html = l.Today.render(frame('owner'));
  assert(html.indexOf('Waiting for someone else') < 0, "the owner was given the supervisor's waiting card");
});

/* =====================================================================================================
 * 7. THE MECHANIC IS NARROWED IN THE QUERY
 * ===================================================================================================== */

test("a mechanic's Today holds his own cards and nothing else in the business", () => {
  const l = load({ role: 'mechanic' });
  const html = l.Today.render(frame('mechanic'));
  assert.deepEqual(headings(html), ['Your jobs', 'Your score'], 'the mechanic got more than two blocks');
  const card = /Your jobs<\/h3>([\s\S]*?)<\/section>/.exec(html)[1];
  assert(card.indexOf('Bus 9') > 0, 'his own card (j2, assignees u-me) is missing');
  assert(card.indexOf('Bus 23') < 0, "another mechanic's card (j5, assignees u-mech) leaked (02 §6.2)");
  assert(html.indexOf('Bus 14') < 0, 'a card nobody assigned to him leaked');
});

test("and his next step is a BADGE, not a button: no write is one tap from a list row", () => {
  const l = load({ role: 'mechanic' });
  const card = /Your jobs<\/h3>([\s\S]*?)<\/section>/.exec(l.Today.render(frame('mechanic')))[1];
  assert(/<span class="badge badge-(ok|warn)">/.test(card), 'the next step is not a badge');
  assert(card.indexOf('<button') < 0, 'a one-tap write from a list row is how a part gets charged to the wrong bus');
  assert(card.indexOf('btn-primary') < 0, 'an accent-filled button on a list row');
});

test("his three score numbers are facts, in .drow, and none of them presses", () => {
  const l = load({ role: 'mechanic' });
  const card = /Your score<\/h3>([\s\S]*?)<\/section>/.exec(l.Today.render(frame('mechanic')))[1];
  assert.strictEqual((card.match(/class="drow"/g) || []).length, 3, 'three facts: open work, rework, turnaround');
  assert(card.indexOf('class="v2row') < 0, 'a fact was drawn as a row that presses');
  assert(/How this is counted/.test(card), 'nothing says what the three numbers mean');
  assert(card.indexOf('Imran') < 0, 'the team leaderboard reached the mechanic\'s Today');
});

/* =====================================================================================================
 * 8. A PARTIAL REPLICA MARKS EVERY AGGREGATE STALE
 * ===================================================================================================== */

test('with replica.complete false, every aggregate figure carries data-state="stale"', () => {
  for (const role of ['owner', 'store', 'crewmanager', 'office', 'mechanic']) {
    const l = load({ role: role });
    const html = l.Today.render(frame(role, { model: {
      stale: true, replica: { behind: 5180, complete: false } } }));
    // The aggregates are the tiles and the mechanic's three facts.
    for (const slot of ['kpi-v', 'drow-v']) {
      const re = new RegExp('class="' + slot + '"[^>]*>(<span class="figure" data-state="([a-z]+)")', 'g');
      let m;
      while ((m = re.exec(html)) !== null) {
        assert(m[2] === 'stale' || m[2] === 'unknown',
          role + ': an aggregate is drawn as final over half the records ([E] 2170703) — ' + m[2]);
      }
    }
  }
});

test('…and with a complete replica it is a value again, so the check above is not passing on a dash', () => {
  const l = load({ role: 'store' });
  const html = l.Today.render(frame('store'));
  assert(/class="kpi-v">(<span class="figure" data-state="value")/.test(html),
    'a complete replica still draws no final figure anywhere: ' + (/kpi-v[^>]*>[^<]*<span[^>]*>/.exec(html) || [''])[0]);
});

/* =====================================================================================================
 * 9. NO COUNT THAT CANNOT REACH ZERO — the check this file exists for, second half
 * ===================================================================================================== */

test('the seed shape: 2,384 parts at reorder level 0 are NOT low stock, and the count is 0 not 2,384', () => {
  const parts = [];
  for (let i = 0; i < 2384; i++) parts.push({ id: 'p' + i, name: 'PART ' + i, qty: 0, reorderLevel: 0 });
  const l = load({ role: 'store' });
  const html = l.Today.render(frame('store', { cache: { parts: parts } }));
  const tile = /Low stock<\/div>\s*<div class="kpi-v">([\s\S]*?)<\/div>/.exec(html);
  assert(tile, 'the low-stock tile is gone');
  assert(tile[1].indexOf('2,384') < 0, 'the seed made every never-stocked part low: that is 5eb8c6e exactly');
  assert(/>0</.test(tile[1]), 'the low-stock count is not 0: ' + tile[1]);
  assert(/data-state="value"/.test(tile[1]), 'a real count of zero must be a 0, not a dash');
  assert(/Nothing to order/.test(html), 'the catalogue drew 2,384 red rows');
});

test('…and the same count RISES when a reorder level is really set, and falls back to zero when stock returns', () => {
  const l = load({ role: 'store' });
  const low = l.Today.render(frame('store', { cache: { parts: [{ id: 'p1', name: 'FULE FILTER', qty: 4, reorderLevel: 10 }] } }));
  assert(/FULE FILTER/.test(low), 'a genuinely low part is not listed');
  assert(/FULE FILTER/.test(low) && low.indexOf('Fule Filter') < 0, 'a part name was title-cased');
  assert(/>1</.test(/Low stock<\/div>\s*<div class="kpi-v">([\s\S]*?)<\/div>/.exec(low)[1]), 'one low part, count of one');
  const back = l.Today.render(frame('store', { cache: { parts: [{ id: 'p1', name: 'FULE FILTER', qty: 40, reorderLevel: 10 }] } }));
  assert(/Nothing to order/.test(back), 'buying the stock back did not empty the list');
});

test("tonight's departures: the count is the checks OUTSTANDING, so a fully released night reaches zero", () => {
  const l = load({ role: 'supervisor' });
  // 24 buses out tonight, none checked: the count is 24 and it is real work.
  const buses = [], night = { id: NIGHT, buses: {} };
  for (let i = 0; i < 24; i++) { buses.push({ id: 'n' + i, regNo: 'Bus ' + (100 + i) }); night.buses['n' + i] = { running: true }; }
  const open = l.Today.render(frame('supervisor', { cache: { buses: buses, nightlist: [night], gatechecks: [] } }));
  assert(/See all \(24\)/.test(open), 'twenty-four unchecked departures and no count');
  assert(/badge-warn">Waiting/.test(open), 'an unchecked departure does not say it is waiting, in a word');

  // Every one released: the count has reached zero, so the card says so in a
  // sentence rather than reading "See all (24)" for ever.
  const gates = buses.map((b, i) => ({ id: 'g' + i, busId: b.id, status: 'released', startedAt: NOW - HOUR, releasedAt: NOW - HOUR }));
  const done = l.Today.render(frame('supervisor', { cache: { buses: buses, nightlist: [night], gatechecks: gates } }));
  const card = /Going out tonight<\/h3>([\s\S]*?)<\/section>/.exec(done)[1];
  assert(/Every bus tonight is checked out/.test(card), 'a fully checked night still shows a number: ' + card.slice(0, 180));
  assert(card.indexOf('See all') < 0, 'a count of zero drew a "See all"');
});

test('seats are counted over TONIGHT\'S buses, and read a dash before tonight is picked', () => {
  const l = load({ role: 'crewmanager' });
  // ba274f6: 67 buses needing a driver against 54 drivers. Fifty buses in the
  // yard and no night picked must NOT become "150 seats to fill".
  const buses = [];
  for (let i = 0; i < 50; i++) buses.push({ id: 'n' + i, regNo: 'Bus ' + (100 + i) });
  const unpicked = l.Today.render(frame('crewmanager', { cache: { buses: buses, nightlist: [] } }));
  const tile = /Seats to fill tonight<\/div>\s*<div class="kpi-v">([\s\S]*?)<\/div>/.exec(unpicked);
  assert(tile, 'the seat tile is gone');
  assert(/data-state="unknown"/.test(tile[1]), 'an unpicked night reads a number instead of a dash: ' + tile[1]);
  assert(tile[1].indexOf('150') < 0 && tile[1].indexOf('50') < 0, 'it counted buses that never needed a driver (ba274f6)');
  // `emptyState` escapes the sentence it is handed, so the apostrophe arrives
  // as &#39; — the assertion reads what the browser is actually sent.
  assert(/Tonight&#39;s buses are not picked yet/.test(unpicked), 'nothing says why there is no list');
  assert(/Pick tonight&#39;s buses/.test(unpicked), 'and no way to go and pick them');

  // Picked, with one bus short a conductor: a real number that reaches zero.
  const night = { id: NIGHT, buses: { b1: { running: true } } };
  const picked = l.Today.render(frame('crewmanager', { cache: { nightlist: [night] } }));
  const t2 = /Seats to fill tonight<\/div>\s*<div class="kpi-v">([\s\S]*?)<\/div>/.exec(picked)[1];
  assert(/>1</.test(t2), 'b1 has driver 1 and a conductor and wants a relief driver: one seat. Got ' + t2);
  assert(/No relief driver/.test(picked), 'the row does not say which seat is empty');

  // Every seat filled: zero, and the sentence.
  const full = l.Today.render(frame('crewmanager', { cache: { nightlist: [night], drivers: [
    { id: 'd1', busId: 'b1', crewRole: 'driver', driverSlot: 1, status: 'active' },
    { id: 'd2', busId: 'b1', crewRole: 'driver', driverSlot: 2, status: 'active' },
    { id: 'd3', busId: 'b1', crewRole: 'conductor', status: 'active' }] } }));
  assert(/Every seat tonight is filled/.test(full), 'a full board still shows a list');
  assert(/>0</.test(/Seats to fill tonight<\/div>\s*<div class="kpi-v">([\s\S]*?)<\/div>/.exec(full)[1]), 'a full board does not read 0');
});

test('"Buses on road" is unknown rather than "0 of 0" when the fleet is not known', () => {
  const l = load({ role: 'owner' });
  const html = l.Today.render(frame('owner', { cache: { buses: [] } }));
  const tile = /Buses on road<\/div>\s*<div class="kpi-v">([\s\S]*?)<\/div>/.exec(html)[1];
  assert(/data-state="unknown"/.test(tile), '"0 of 0" is the shape of "110 of 110": ' + tile);
});

test('an owed total of nothing is 0 and an unreadable one is a dash — they are not the same figure', () => {
  const l = load({ role: 'store' });
  const none = l.Today.render(frame('store', { cache: { purchases: [] } }));
  assert(/Owed to suppliers<\/div>\s*<div class="kpi-v"><span class="figure" data-state="(value|stale)"/.test(none),
    'nothing owed is a real 0');
  const unread = l.Today.render(frame('store', { cache: { purchases: [{ id: 'x', paymentStatus: 'pending', amount: null }] } }));
  const tile = /Owed to suppliers<\/div>\s*<div class="kpi-v">([\s\S]*?)<\/div>/.exec(unread)[1];
  assert(/data-state="unknown"/.test(tile), 'a bill with no money on it was counted as zero rupees');
});

/* =====================================================================================================
 * 9a. "WHAT NEEDS YOU" READS ATTENTION'S COMPARATOR AND DOES NOT BUILD A SECOND ONE
 * ===================================================================================================== */

/* Attention (#2) is a sibling slice. These two checks are deliberately loose
 * about its row CONTENT — that is its own suite's business — and strict about
 * the contract between the two screens: Today ranks nothing, and whatever
 * Attention hands over must still obey Today's row rules when it lands here. */
function withAttention(role) {
  const src = read(V2('screens', 'attention.js'));
  const l = load({ role: role });
  vm.runInContext(src, vm.createContext(l.win), { filename: 'attention.js' });
  return l;
}

test('this screen ranks nothing: with Attention absent the block says so, per block, with a Retry', () => {
  const l = load({ role: 'owner' });
  assert.strictEqual(typeof l.win.Attention, 'undefined', 'Attention loaded itself into this context');
  const html = l.Today.render(frame('owner'));
  const card = /What needs you<\/h3>([\s\S]*?)<\/section>/.exec(html);
  assert(card, 'the block vanished instead of saying what it could not read');
  assert(/state-error/.test(card[1]), 'an unreadable list was drawn as an empty one');
  assert(/data-state-retry/.test(card[1]), 'no Retry on the block that failed');
  // The other blocks keep their rows: one store failing is not a failed screen.
  assert(/<div class="kpirow/.test(html), "the owner's figure row went with it");
});

test('…and with Attention on the page its rows land here obeying THIS screen\'s row rules', () => {
  const l = withAttention('supervisor');
  assert.strictEqual(typeof l.win.Attention.index, 'function', 'attention.js changed its index export');
  const html = l.Today.render(frame('supervisor'));
  const card = /What needs you<\/h3>([\s\S]*?)<\/section>/.exec(html);
  assert(card, 'the block vanished with Attention present');
  assert(!/state-error/.test(card[1]), 'Attention is loaded and the block still says it could not be read');
  const rows = card[1].match(/<a class="v2row[^"]*"[^>]*>/g) || [];
  if (rows.length) {
    assert(/v2row-why/.test(card[1]), "Attention's rows lost the two-line reason row they are drawn as");
    for (const r of rows) assert(/data-screen="/.test(r), 'an adopted row opens nothing: ' + r);
    assert.strictEqual(nestedIn(card[1], 'v2row', 'figure-note'), false,
      "an age came across from Attention's figure into a row on Today");
    assert(rows.length <= 5, 'the yard cap does not apply to the adopted rows: ' + rows.length);
  } else {
    assert(/class="state empty"/.test(card[1]), 'no rows and no empty state either');
  }
});

/* =====================================================================================================
 * 9b. THE ONE COST BASIS — read, not recomputed
 * ===================================================================================================== */

const money30 = (over) => Object.assign({
  buses: [{ id: 'b1', regNo: 'Bus 14' }, { id: 'b2', regNo: 'Bus 31' }],
  jobcards: [{ id: 'j1', busId: 'b1', problem: 'brake light', status: 'open', enterAt: NOW - 6 * HOUR }],
  fuel: [{ id: 'f1', busId: 'b1', at: NOW - 2 * DAY, cost: 5000 },
         { id: 'f2', busId: 'b2', at: NOW - 40 * DAY, cost: 3000 }],
  def: [], ledger: [], trips: [], incidents: [], components: [], parts: [], purchases: []
}, over || {});

test("the owner's repair cost is Cost.forBus's answer, bus for bus — not a second basis", () => {
  const l = load({ role: 'owner' });
  const cache = money30();
  const html = l.Today.render(frame('owner', { cache: cache }));
  const tile = /Repair cost, 30 days<\/div>\s*<div class="kpi-v">([\s\S]*?)<\/div>/.exec(html);
  assert(tile, 'the repair-cost tile is gone');

  /* The screen buckets the rows by bus before it calls `Cost.forBus`, because
   * 102 calls over the whole ledger is §2.7's forbidden shape. This proves the
   * bucketing is only that — a performance detail — by asking the module
   * directly, with the WHOLE rows, and demanding the same number. If they ever
   * differ, Today has become a second cost basis, which is the failure the one
   * basis exists to prevent. */
  let direct = 0;
  for (const b of cache.buses) {
    const out = l.win.Cost.forBus(b.id, 30, cache, NOW);
    assert(out.total !== null, 'the fixture itself withholds a total: ' + JSON.stringify(out.unknown));
    direct += out.total;
  }
  assert.strictEqual(direct, 5000, 'the fixture does not price what this check thinks it prices');
  assert(tile[1].indexOf(l.win.fmt.rupees(direct)) > 0,
    'the tile says ' + tile[1] + ' and the one cost basis says ' + l.win.fmt.rupees(direct));
});

test('…and a total the basis WITHHOLDS is a dash on Today too, never a smaller number', () => {
  const l = load({ role: 'owner' });
  // A fill with no money on it: Cost.forBus makes the Fuel part unknown, so the
  // bus has no total, so the fleet has none. A smaller number presented as
  // complete is the failure (v2/cost.js's header).
  const html = l.Today.render(frame('owner', { cache: money30({
    fuel: [{ id: 'f1', busId: 'b1', at: NOW - 2 * DAY, cost: 5000 },
           { id: 'f3', busId: 'b2', at: NOW - 2 * DAY, cost: null }] }) }));
  const tile = /Repair cost, 30 days<\/div>\s*<div class="kpi-v">([\s\S]*?)<\/div>/.exec(html)[1];
  assert(/data-state="unknown"/.test(tile), 'a withheld total was drawn as a number: ' + tile);
  assert(tile.indexOf('schip') < 0, 'a trend chip was drawn against a total that does not exist');
});

/* §2.7 rule 4: each store is read once per CONTENT SIGNATURE, and a redraw with
 * no new records re-reads nothing. The falsifiable form the spec asks for is a
 * counter on the read and an assertion that a redraw did not move it — here the
 * expensive read is the per-bus cost, so the counter is on `Cost.forBus`. */
test('the cost basis is asked once per content signature, not once per redraw', () => {
  const l = load({ role: 'owner' });
  let calls = 0;
  const real = l.win.Cost.forBus;
  l.win.Cost.forBus = function () { calls++; return real.apply(null, arguments); };
  const m = frame('owner', { cache: money30() });
  l.Today.render(m);
  const first = calls;
  assert(first > 0, 'the cost basis was never asked at all');
  l.Today.render(m);
  assert.strictEqual(calls, first, 'a redraw with no new record re-read the whole fleet (that is computeInsights at 386 ms)');
  // …and a signature that moved DOES re-read, so the memo is not simply stuck.
  l.Today.render(Object.assign({}, m, { sig: 'moved' }));
  assert(calls > first, 'a new record did not invalidate the memo: a stale total cannot outlive its records');
});

test('a store this device does not hold stays ABSENT through the bucketing, so the total is withheld', () => {
  const l = load({ role: 'owner' });
  // `fuel` missing altogether — not empty, missing. Cost.forBus marks the Fuel
  // part unknown for that, and turning it into [] on the way in would turn "we
  // could not read it" into "it cost nothing".
  // `fuel: undefined` and not `delete`: `world()` merges over a default that
  // holds every store, so the absence has to be stated, which is also how the
  // cache really looks before `Cache.load` has read that store.
  const tile = /Repair cost, 30 days<\/div>\s*<div class="kpi-v">([\s\S]*?)<\/div>/.exec(
    l.Today.render(frame('owner', { cache: money30({ fuel: undefined }) })))[1];
  assert(/data-state="unknown"/.test(tile), 'an unread store was costed as zero rupees: ' + tile);
});

test('the trend chip says its direction in a word as well as a colour, or is absent', () => {
  const l = load({ role: 'owner' });
  // ₹5,000 this month against ₹3,000 the month before: a rise, so --bad.
  const html = l.Today.render(frame('owner', { cache: money30({
    fuel: [{ id: 'f1', busId: 'b1', at: NOW - 2 * DAY, cost: 5000 },
           { id: 'f2', busId: 'b1', at: NOW - 40 * DAY, cost: 3000 }] }) }));
  const chip = /<span class="schip ([a-z]+)">([\s\S]*?)<\/span><\/div>/.exec(html);
  assert(chip, 'no trend chip against two priced windows');
  assert.strictEqual(chip[1], 'crit', 'a rise in cost is not marked as one');
  assert(/▲/.test(chip[2]), 'the direction is a colour alone');
  assert(/sr-only/.test(chip[2]), 'the direction is never spoken: the same arrow means the opposite thing one tile along');
});

/* =====================================================================================================
 * 10. THE ONE DELEGATED LISTENER, AND ITS FIRST LINE
 * ===================================================================================================== */

// Where the guard sits in the source, and where the first [data-act] read sits.
function guardOrder(src) {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  return {
    guard: code.indexOf("closest('input, select, textarea, label, .num')"),
    read: code.indexOf("closest('[data-act]')")
  };
}

test('mount installs exactly ONE delegated listener, once, however often it is called', () => {
  const l = load({ role: 'store' });
  assert.strictEqual(l.Today.mount(), true);
  assert.strictEqual(l.Today.mount(), false, 'a second mount added a second listener');
  assert.strictEqual(l.clicks.length, 1, 'the screen installed ' + l.clicks.length + ' listeners, not one');
});

test('THE LINE: the field guard is in the listener and comes BEFORE the [data-act] read', () => {
  const o = guardOrder(TODAY_JS);
  assert(o.guard > 0, "the listener does not return early on closest('input, select, textarea, label, .num')");
  assert(o.read > 0, 'the listener never reads [data-act], so the order below proves nothing');
  assert(o.guard < o.read, 'the guard is AFTER the [data-act] read, so it does nothing: that is the regression');
});

test('…and it behaves: a tap inside a count field does not route, while a tap on a row does', () => {
  const l = load({ role: 'supervisor' });
  l.Today.mount();
  const routed = [];
  l.win.Router.register('jobcard', { render: function () { return ''; } });
  l.win.Router.go = function (id, params) { routed.push([id, params]); return true; };

  // A target inside a count field: `closest` answers the field selector.
  let prevented = false;
  l.clicks[0]({
    target: { closest: function (sel) { return sel.indexOf('input') === 0 ? { tag: 'input' } : { getAttribute: function () { return 'open'; } }; } },
    preventDefault: function () { prevented = true; }
  });
  assert.deepEqual(routed, [], 'tapping a count field navigated away — the exact shipped regression');
  assert.strictEqual(prevented, false, 'the field tap was swallowed as well as not routed');

  // A target on a row: the same listener routes it, so the guard is not simply off.
  l.clicks[0]({
    target: { closest: function (sel) {
      if (sel.indexOf('input') === 0) return null;
      if (sel === '[data-act]') return { getAttribute: function (k) {
        return k === 'data-act' ? 'open' : k === 'data-screen' ? 'jobcard'
             : k === 'data-params' ? 'id=j1' : null; } };
      return null;
    } },
    preventDefault: function () {}
  });
  assert.deepEqual(routed, [['jobcard', { id: 'j1' }]], 'a row tap did not open the thing: ' + JSON.stringify(routed));
});

test('the screen does not read [data-nav] — the frame owns it, and two handlers is two places to change it', () => {
  const code = TODAY_JS.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  assert(code.indexOf("closest('[data-nav]')") < 0, 'today.js reads [data-nav], which v2/shell.js already handles');
  // …and it still EMITS data-nav, so "See all" has somewhere to go.
  assert(/data-nav="attention"|data-nav="jobs"|data-nav="store"/.test(load({ role: 'supervisor' }).Today.render(frame('supervisor'))),
    'nothing on the screen carries data-nav, so no "See all" leads anywhere');
});

test('"Read it all" and "How this is counted" open a sheet and change no screen', () => {
  const l = load({ role: 'mechanic' });
  l.Today.mount();
  l.clicks[0]({ target: { closest: function (sel) {
    if (sel.indexOf('input') === 0) return null;
    if (sel === '[data-act]') return { getAttribute: function () { return 'howcounted'; } };
    return null;
  } }, preventDefault: function () {} });
  assert.strictEqual(l.sheets.length, 1, 'the sheet did not open');
  assert(/Open work is every card/.test(l.sheets[0].body), 'the sheet does not say what is counted');
});

/* =====================================================================================================
 * 11. THE WORDS
 * ===================================================================================================== */

test('every word this screen draws is registered, with an en value and an hi KEY', () => {
  const l = load({ role: 'owner' });
  const ids = Object.keys(l.Today._labels);
  assert(ids.length > 40, 'only ' + ids.length + ' labels: §2.6 is a longer table than that');
  for (const id of ids) {
    const e = l.win.W.entry(id);
    assert(e, id + ' is in the table but not registered');
    assert(e.en && String(e.en).length, id + ' has no English value');
    assert(Object.prototype.hasOwnProperty.call(e, 'hi'), id + ' has no hi KEY: a missing translation must be visible');
  }
});

test('a Hindi reader sees Hindi where there is Hindi, and the English WITH ITS ID where there is not', () => {
  const l = load({ role: 'supervisor', lang: 'hi' });
  const html = l.Today.render(frame('supervisor'));
  // The nine ids that already have the owner's own Hindi draw it.
  assert(html.indexOf('किसी और पर बाकी') > 0, "v1's own Hindi for the waiting card was not reused");
  // The pending ones draw marked English, never silent English.
  assert(/Standing in the yard \[cardStanding\]/.test(html),
    'a pending Hindi word drew bare English: that is the defect §6.3 exists for');
});

test('no quoted capitalised English sits outside the W.register literal', () => {
  const code = TODAY_JS.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  const open = code.indexOf('var LABELS = {');
  const close = code.indexOf('\n  };', open);
  assert(open > 0 && close > open, 'the label table moved: this check cannot find it');
  const outside = code.slice(0, open) + code.slice(close);
  const lits = outside.match(/'[^'\n]*'|"[^"\n]*"/g) || [];
  const bad = lits.filter((s) => /\b[A-Z][a-z]+\b/.test(s) && !/^['"](Error|TypeError)/.test(s));
  assert.deepEqual(bad, [], 'fixed English outside the table: ' + bad.join(' '));
});

/* =====================================================================================================
 * 12. THE STYLESHEET
 * ===================================================================================================== */

const stripCss = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

test('today.css adds only the rules §2.2 asks for, and no px outside a border, outline or shadow', () => {
  const css = stripCss(TODAY_CSS);
  const decls = css.match(/[-a-z]+\s*:\s*[^;}]+/g) || [];
  for (const d of decls) {
    const prop = d.split(':')[0].trim();
    if (/\d+px/.test(d) && !/^(border|outline|box-shadow)/.test(prop)) {
      assert.fail('a px literal outside border/outline/shadow: ' + d.trim() + ' — size comes from the tokens');
    }
  }
  for (const banned of ['oklch(', 'color-mix(', '@starting-style', 'hsl(', 'rgb(', '#']) {
    assert(css.indexOf(banned) < 0, 'today.css uses ' + banned + ': colour comes from the tokens');
  }
});

test('today.css declares nothing that components.css or screens.css already owns', () => {
  const mine = new Set((stripCss(TODAY_CSS).match(/^\s*\[data-v2\][^{]*\{/gm) || [])
    .map((s) => s.replace(/\{$/, '').trim()));
  const theirs = stripCss(read(V2('ui', 'components.css'))) + stripCss(read(V2('ui', 'screens.css')));
  for (const sel of mine) {
    // A density-scoped override of .kpirow is the §2.2 desk rule and is meant to
    // sit on top of screens.css; everything else must be new.
    if (/data-density/.test(sel)) continue;
    const bare = sel.replace('[data-v2] ', '').trim();
    assert(theirs.indexOf('\n[data-v2] ' + bare + ' {') < 0 && theirs.indexOf('\n[data-v2] ' + bare + ',') < 0,
      'today.css re-declares ' + bare + ', which another stylesheet owns');
  }
});

test('the freshness line, the desk figure row and the See-all row are all in the stylesheet', () => {
  const css = stripCss(TODAY_CSS);
  for (const sel of ['.today-fresh', '.today-fresh-off', '.kpi-b', '.today-all', '.today-line']) {
    assert(css.indexOf(sel) > 0, 'nothing styles ' + sel + ', which the screen draws');
  }
  assert(/data-density="desk"\][^{]*\.kpirow/.test(css), 'the desk figure row is not one line (§2.2)');
});

/* =====================================================================================================
 * MUTANTS: every check above, broken on purpose.
 *
 * A check that passes either way is decoration. Each case patches the real
 * source, loads the patched module, and asserts that the named check goes red.
 * ===================================================================================================== */

function swap(from, to) {
  assert(TODAY_JS.indexOf(from) >= 0, 'mutation target not found (the source changed under the self-test): ' + from);
  return TODAY_JS.split(from).join(to);
}

function mutant(name, src, run) {
  test('MUTANT must fail: ' + name, () => {
    const l = load({ role: 'owner', today: src });
    let threw = false;
    try { run(l); } catch (e) { threw = true; }
    assert(threw, 'the check stayed green with ' + name);
  });
}

mutant('a fifth block on the owner', swap(
  'owner: [kpiOwner, needsYou, thisWeek],',
  'owner: [kpiOwner, needsYou, thisWeek, standing, tonightOut],'), (l) => {
  const n = blocksOf(l.Today.render(frame('owner'))).length;
  assert(n <= 4, 'five blocks');
  assert(l.Today._blocks.owner.length <= 4, 'five builders');
});

/* The trim is the second half of the cap: `BLOCKS` holds at most four per role,
 * and if somebody adds a fifth the trim is what keeps the screen a doorway.
 * Broken with the fifth block in place, because a trim with nothing to trim
 * cannot be shown to work. */
test('MUTANT must fail: the four-block trim removed, so a fifth block reaches the screen', () => {
  const src = swap('owner: [kpiOwner, needsYou, thisWeek],',
                   'owner: [kpiOwner, needsYou, thisWeek, standing, tonightOut],')
    .split('      blocks.length = BLOCK_CAP;').join('      blocks.length = blocks.length;');
  const l = load({ role: 'owner', today: src });
  const n = blocksOf(l.Today.render(frame('owner'))).length;
  assert(n > 4, 'the mutant did not produce a fifth block, so the trim is untested');
  // and with the trim back in, the same five builders draw four blocks
  const trimmed = load({ role: 'owner', today: swap('owner: [kpiOwner, needsYou, thisWeek],',
    'owner: [kpiOwner, needsYou, thisWeek, standing, tonightOut],') });
  assert.strictEqual(blocksOf(trimmed.Today.render(frame('owner'))).length, 4, 'the trim did not hold at four');
  assert(trimmed.logs.warn.some((x) => /more than 4 blocks/.test(x)), 'the trim was silent about what it dropped');
});

mutant('a row figure given its age, so .figure-note lands inside a .v2row', swap(
  "    var opts = { unit: o.unit, format: o.format };",
  "    var opts = { unit: o.unit, format: o.format, at: o.at === undefined ? 1 : o.at };"), (l) => {
  assert.strictEqual(nestedIn(l.Today.render(frame('supervisor')), 'v2row', 'figure-note'), false, 'an age inside a row');
});

mutant('"See all" drawn at a count of one', swap(
  '    if (b.seeAll && b.seeAll.n > 1) {', '    if (b.seeAll && b.seeAll.n > 0) {'), (l) => {
  const one = { jobcards: [{ id: 'j1', busId: 'b1', problem: 'x', status: 'open', enterAt: NOW - HOUR }] };
  const html = l.Today.render(frame('supervisor', { cache: one }));
  assert(html.indexOf('See all') < 0, '"See all (1)"');
});

mutant("the supervisor's waiting card dropping the identity filter", swap(
  "      if (j.closedBy !== me) continue;               // narrowed in the query",
  "      if (!j.closedBy) continue;"), (l) => {
  const card = /Waiting for someone else<\/h3>([\s\S]*?)<\/section>/.exec(l.Today.render(frame('supervisor')))[1];
  assert(card.indexOf('Bus 23') < 0, "somebody else's close");
});

mutant("the waiting rows made pressable", swap(
      "      rows.push({ press: false, mark: 'clock', markTone: 'warn', t: cardTitle(q, j),",
      "      rows.push({ press: true, screen: 'jobs', mark: 'clock', markTone: 'warn', t: cardTitle(q, j),"), (l) => {
  const card = /Waiting for someone else<\/h3>([\s\S]*?)<\/section>/.exec(l.Today.render(frame('supervisor')))[1];
  for (const r of card.match(/<(a|div|button)[^>]*class="v2row[^"]*"[^>]*>/g) || []) {
    assert(/^<div/.test(r), 'pressable: ' + r);
  }
});

mutant("the mechanic's own-card narrowing moved out of the query", swap(
  '      if (live(j) && openCard(j) && onCard(j, me)) mine.push(j);',
  '      if (live(j) && openCard(j)) mine.push(j);'), (l) => {
  const card = /Your jobs<\/h3>([\s\S]*?)<\/section>/.exec(l.Today.render(frame('mechanic')))[1];
  assert(card.indexOf('Bus 23') < 0, "another mechanic's card");
});

mutant('the low-stock rule counting a part that was never stocked', swap(
  '    if (!isNum(lvl) || lvl <= 0) return false;', '    if (!isNum(lvl)) return false;'), (l) => {
  const parts = [];
  for (let i = 0; i < 2384; i++) parts.push({ id: 'p' + i, name: 'PART ' + i, qty: 0, reorderLevel: 0 });
  const html = l.Today.render(frame('store', { cache: { parts: parts } }));
  const tile = /Low stock<\/div>\s*<div class="kpi-v">([\s\S]*?)<\/div>/.exec(html)[1];
  assert(tile.indexOf('2,384') < 0, '2,384 low parts: every never-stocked part counted');
});

mutant("tonight's count counting departures instead of outstanding checks", swap(
  "             seeAll: { screen: 'gate', n: waiting.length } };",
  "             seeAll: { screen: 'gate', n: running.length } };"), (l) => {
  const buses = [], night = { id: NIGHT, buses: {} }, gates = [];
  for (let i = 0; i < 24; i++) {
    buses.push({ id: 'n' + i, regNo: 'Bus ' + (100 + i) });
    night.buses['n' + i] = { running: true };
    gates.push({ id: 'g' + i, busId: 'n' + i, status: 'released', startedAt: NOW - HOUR, releasedAt: NOW - HOUR });
  }
  // One bus left unchecked, so the card still draws: the count must be 1, not 24.
  gates.pop();
  const card = /Going out tonight<\/h3>([\s\S]*?)<\/section>/.exec(
    l.Today.render(frame('supervisor', { cache: { buses: buses, nightlist: [night], gatechecks: gates } })))[1];
  assert(card.indexOf('See all (24)') < 0, 'it counted every departure: that number never falls');
});

mutant('the seat count taken over the whole yard instead of tonight', swap(
  '    var running = tonight(q), crew = q.rows.drivers;\n    if (running === null || !crew) return null;',
  '    var crew = q.rows.drivers, running = (q.rows.buses || []).map(function (b) { return b.id; });\n    if (!crew) return null;'), (l) => {
  const buses = [];
  for (let i = 0; i < 50; i++) buses.push({ id: 'n' + i, regNo: 'Bus ' + (100 + i) });
  const html = l.Today.render(frame('crewmanager', { cache: { buses: buses, nightlist: [] } }));
  const tile = /Seats to fill tonight<\/div>\s*<div class="kpi-v">([\s\S]*?)<\/div>/.exec(html)[1];
  assert(/data-state="unknown"/.test(tile), 'it counted buses nobody said were running tonight');
});

mutant('an aggregate drawn as final while the replica is still filling', swap(
  '      if (mo.stale) opts.stale = true;', '      if (false) opts.stale = true;'), (l) => {
  const html = l.Today.render(frame('owner', { model: { stale: true, replica: { behind: 5180, complete: false } } }));
  const re = /class="kpi-v">(<span class="figure" data-state="([a-z]+)")/g;
  let m;
  while ((m = re.exec(html)) !== null) assert(m[2] !== 'value', 'a partial total drawn as final');
});

const GUARD = "    if (t.closest('input, select, textarea, label, .num')) return;\n";
const ACT_READ = "    var el = t.closest('[data-act]');\n";

test('MUTANT must fail: the field guard moved after the [data-act] read (the source-order half)', () => {
  const src = TODAY_JS.replace(GUARD, '').replace(ACT_READ, ACT_READ + GUARD);
  const o = guardOrder(src);
  assert(o.guard > 0 && o.read > 0, 'the mutant lost one of the two lines');
  assert(o.guard > o.read, 'the ORDER check stayed green: the guard is still read first');
});

test('MUTANT must fail: the field guard deleted, so a tap in a count field navigates (the behaviour half)', () => {
  const src = TODAY_JS.replace(GUARD, '');
  assert(guardOrder(src).guard < 0, 'the guard is still in the mutant');
  const l = load({ role: 'store', today: src });
  l.Today.mount();
  const routed = [];
  l.win.Router.go = function (id) { routed.push(id); return true; };
  // The same event the real check sends: a target INSIDE a count field, whose
  // row also carries data-act. With the guard gone it routes, which is the
  // regression, and the real check above must be the thing that catches it.
  l.clicks[0]({
    target: { closest: function (sel) {
      if (sel.indexOf('input') === 0) return { tag: 'input' };
      if (sel === '[data-act]') return { getAttribute: function (k) {
        return k === 'data-act' ? 'open' : k === 'data-screen' ? 'store' : null; } };
      return null;
    } },
    preventDefault: function () {}
  });
  assert.deepEqual(routed, ['store'], 'the mutant did not actually route, so the behavioural check proves nothing');
});

test('MUTANT must fail: the capability guard removed from a block the role does not hold', () => {
  const src = STORE_GATED().split("    if (!can(q.role, 'money')) return null;\n").join('');
  const l = load({ role: 'store', today: src });
  const html = l.Today.render(frame('store'));
  assert(html.indexOf('Jobs waiting for parts') > 0,
    'the mutant did not draw the block, so the absence check proves nothing');
});

mutant('the per-signature memo removed, so every redraw re-costs the fleet', swap(
  "    if (key !== null && has(_costMemo, key)) return _costMemo[key];",
  "    if (false) return null;"), (l) => {
  let calls = 0;
  const real = l.win.Cost.forBus;
  l.win.Cost.forBus = function () { calls++; return real.apply(null, arguments); };
  const m = frame('owner', { cache: money30() });
  l.Today.render(m);
  const first = calls;
  l.Today.render(m);
  assert.strictEqual(calls, first, 'a redraw re-read the whole fleet');
});

mutant('an absent store turned into an empty one on the way into the cost basis', swap(
  "        per[COST_STORES[k]] = m === null ? undefined : (m[bus.id] || []);",
  "        per[COST_STORES[k]] = m === null ? [] : (m[bus.id] || []);"), (l) => {
  const tile = /Repair cost, 30 days<\/div>\s*<div class="kpi-v">([\s\S]*?)<\/div>/.exec(
    l.Today.render(frame('owner', { cache: money30({ fuel: undefined }) })))[1];
  assert(/data-state="unknown"/.test(tile), 'an unread store costed as zero');
});

mutant('a figure tile made pressable', swap(
  "      out += '<div class=\"kpi\"><span class=\"kpi-ic\">' + draw(t.mark, 20) + '</span>'",
  "      out += '<a class=\"kpi\" href=\"#\" data-nav=\"money\"><span class=\"kpi-ic\">' + draw(t.mark, 20) + '</span>'"), (l) => {
  const html = l.Today.render(frame('owner'));
  const row = /<div class="kpirow[^"]*">([\s\S]*?)<\/div><\/div><\/div><\/div>/.exec(html);
  assert(row, 'the figure row vanished');
  for (const bad of ['data-nav', 'href']) assert(row[1].indexOf(bad) < 0, 'a pressable tile');
});

mutant('a desk row given back its second line', swap(
  "      + (mo.density === 'desk' || !r.sub ? '' : '<div class=\"sub\">' + esc(r.sub) + '</div>')",
  "      + (!r.sub ? '' : '<div class=\"sub\">' + esc(r.sub) + '</div>')"), (l) => {
  const html = l.Today.render(frame('supervisor', { model: { density: 'desk' } }));
  const card = /Standing in the yard<\/h3>([\s\S]*?)<\/section>/.exec(html)[1];
  assert(card.indexOf('class="sub"') < 0, 'a desk row is one line and 32px');
});

/* ===================================================================================================== */
console.log(fails ? '\n' + fails + ' check(s) failed' : '\nTODAY: every check passed');
process.exit(fails ? 1 : 0);

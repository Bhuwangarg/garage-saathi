/* Tests for the outside-repair entries in the piece timeline (Store, OR6).
 * Run: node test_v2_outside_store.js
 *
 * Root-level because run-tests.py only discovers test_*.js here. Rows are
 * built in-test: v2/db.js's seed belongs to the backend slice.
 *
 * Each group is phrased so that undoing the decision turns it red:
 *  1. a send-out names its pass, and while the piece is out says for how long
 *  2. a return says whether the serial matched, and names both when it did not
 *  3. a legacy entry's money is withheld from a reader without outsideJob, as
 *     an EMPTY .act (a dash would say "unknown")
 *  4. an entry with a passId has no money to withhold: same row for everyone
 *  5. an older entry with no `id` still draws
 */
process.env.TZ = process.env.TZ || 'UTC';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const SRC = ['ui/icons.js', 'ui/words.js', 'ui/states.js', 'ui/photos.js', 'fmt.js', 'caps.js',
             'router.js', 'outside.js', 'screens/store.js'];

function load(mutate) {
  const sandbox = {
    navigator: { onLine: true, userAgent: 'node', language: 'en' },
    location: { href: 'http://localhost/v2/', pathname: '/v2/' },
    document: { documentElement: { lang: 'en', getAttribute: () => 'yard', setAttribute() {} },
                addEventListener() {}, removeEventListener() {}, getElementById: () => null,
                querySelector: () => null, querySelectorAll: () => [], createElement: () => ({}), head: { appendChild() {} } },
    getComputedStyle: () => ({}), addEventListener() {}, removeEventListener() {},
    setTimeout, clearTimeout, console: { warn() {}, error() {}, info() {}, log() {} },
    S: { user: null, cache: {} }
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  for (const f of SRC) {
    let src = fs.readFileSync(path.join(ROOT, 'v2', f), 'utf8');
    if (mutate && f === 'screens/store.js') src = mutate(src);
    vm.runInContext(src, ctx, { filename: f });
  }
  return sandbox;
}

const DAY = 86400000;
const NOW = Date.now();
const SENT = NOW - 6 * DAY;
const BACK = NOW - 1 * DAY;
const dayOf = (ms) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

const PASS = { id: 'g1', no: 'OJ-261109-AB12', componentId: 'c1', vendorName: 'Sharma Auto Electricals',
               unitSerial: 'ALT-77120', status: 'out', issuedAt: SENT };
const PASS_BACK = Object.assign({}, PASS, { status: 'returned', returnedAt: BACK, returnSerial: 'ALT-77120',
                                            serialMismatch: false, cost: 4200, billPhoto: 'data:bill' });
const PASS_BAD = Object.assign({}, PASS_BACK, { returnSerial: 'ALT-77999', serialMismatch: true });

function piece(history, state) {
  return { id: 'c1', label: 'Alternator', serial: 'ALT-77120', state: state || 'sent-out', history: history };
}
function sheet(role, c, passes, mutate) {
  const w = load(mutate);
  const m = { role: role, cache: { components: [c], buses: [], gatepasses: passes } };
  return w.Store.pieceSheet(m, 'c1');
}
/* The .act of each timeline row, newest first, and the row's own markup. */
function rows(html) {
  return html.replace(/<\/div>$/, '').split('<div class="v2row').slice(1).map((r) => ({
    html: r,
    t: (/<div class="t">([^<]*)</.exec(r) || [])[1],
    sub: (/<div class="sub">([^<]*)</.exec(r) || [])[1],
    act: (/<div class="act">([\s\S]*)<\/div><\/div>$/.exec(r) || [])[1]
  }));
}

const SEND = { id: 'h1', type: 'send-out', at: SENT, vendor: 'Sharma Auto Electricals', passId: 'g1' };
const RET = { id: 'h2', type: 'return', at: BACK, vendor: 'Sharma Auto Electricals', passId: 'g1' };
const LEG_SEND = { type: 'send-out', at: SENT, vendor: 'Old Vendor', cost: 900, billPhoto: 'data:legacy' };
const LEG_RET = { type: 'return', at: BACK, vendor: 'Old Vendor', cost: 1800, billPhoto: 'data:legacy' };

let fails = 0;
function test(name, fn) {
  try { fn(); console.log('  ok  ' + name); }
  catch (e) { console.log(' FAIL ' + name + '\n        ' + String(e.message).split('\n').join('\n        ')); fails++; }
}

const ROLES = ['store', 'crewmanager', 'owner', 'supervisor'];

test('a send-out names its pass, and while the piece is out carries the days in .act', () => {
  const r = rows(sheet('store', piece([SEND]), [PASS]))[0];
  assert.strictEqual(r.t, 'Sent out · ' + dayOf(SENT));
  assert.strictEqual(r.sub, 'Sharma Auto Electricals · gate pass OJ-261109-AB12');
  assert(/data-state="known"|figure/.test(r.act) && />6</.test(r.act) && /d\b/.test(r.act),
    'no days figure in .act: ' + r.act);
});

test('a send-out whose piece is back carries no days', () => {
  const html = sheet('store', piece([SEND, RET], 'in-service'), [PASS_BACK]);
  const send = rows(html)[1];
  assert.strictEqual(send.act, '', 'days drawn on a slip that has come home');
});

test('a return says "Serial matched", and names BOTH serials when it did not', () => {
  const ok = rows(sheet('store', piece([SEND, RET], 'in-service'), [PASS_BACK]))[0];
  assert.strictEqual(ok.t, 'Came back · ' + dayOf(BACK));
  assert.strictEqual(ok.sub, 'Serial matched');
  const bad = rows(sheet('store', piece([SEND, RET], 'in-service'), [PASS_BAD]))[0];
  assert.strictEqual(bad.sub, 'Serial did not match — went out ALT-77120, came back ALT-77999');
});

test('the serial line wraps rather than truncates', () => {
  const bad = rows(sheet('store', piece([SEND, RET], 'in-service'), [PASS_BAD]))[0];
  assert(/^ v2row-why"/.test(bad.html), 'the return row is the single-line truncating kind');
  const css = fs.readFileSync(path.join(ROOT, 'v2/ui/components.css'), 'utf8');
  assert(/\.v2row-why \.sub \{[^}]*white-space: normal/.test(css), 'v2row-why no longer wraps');
});

test('a reader without outsideJob sees no figure and no photo on a legacy entry, and .act is EMPTY', () => {
  for (const role of ['store', 'crewmanager']) {
    const html = sheet(role, piece([LEG_SEND, LEG_RET], 'in-service'), []);
    for (const r of rows(html)) assert.strictEqual(r.act, '', role + ' .act is not empty: ' + r.act);
    assert(!/data:legacy|<img/.test(html), role + ' was handed the bill photo');
    assert(!/1,800|900/.test(html), role + ' was handed the amount');
  }
});

test('an owner and a supervisor see the legacy figure', () => {
  for (const role of ['owner', 'supervisor']) {
    const rs = rows(sheet(role, piece([LEG_SEND, LEG_RET], 'in-service'), []));
    assert(/1,800/.test(rs[0].act), role + ' lost the return amount: ' + rs[0].act);
    assert(/900/.test(rs[1].act), role + ' lost the send-out amount: ' + rs[1].act);
  }
});

test('an entry with a passId carries no money, so every reader sees the same row and no zero', () => {
  const c = piece([SEND, RET], 'in-service');
  assert(!('cost' in RET) && !('billPhoto' in RET), 'fixture is wrong');
  const base = sheet('owner', c, [PASS_BACK]);
  for (const role of ROLES) {
    const html = sheet(role, c, [PASS_BACK]);
    assert.strictEqual(html, base, role + ' reads a different timeline');
    assert(!/4,200|data:bill/.test(html), 'the pass money reached the piece register');
    assert(!/>0</.test(rows(html)[0].act), 'a zero was drawn');
  }
});

test('an older history entry with no id still renders, in every role', () => {
  for (const role of ROLES) {
    const html = sheet(role, piece([{ type: 'install', at: SENT, note: 'Fitted new' }, LEG_SEND], 'sent-out'), []);
    assert.strictEqual(rows(html).length, 2);
    assert(/Fitted new/.test(html));
  }
});

test('the three words are registered with a pending Hindi, and the listener guard still precedes [data-act]', () => {
  const src = fs.readFileSync(path.join(ROOT, 'v2/screens/store.js'), 'utf8');
  for (const id of ['stHistSendPass', 'stHistSerialOk', 'stHistSerialBad'])
    assert(new RegExp(id + ": \\{ en: '[^']+', hi: '' \\}").test(src), id);
  assert(src.indexOf("t.closest(FIELDS)") < src.indexOf("closest('[data-act]')"));
});

/* ---- the tripwires: each decision undone must turn its check red ---------------------------------- */
function mutantFails(name, mutate, fn) {
  test('TRIPWIRE ' + name, () => {
    let red = false;
    try { fn(mutate); } catch (e) { red = true; }
    assert(red, 'the mutant passed: the check is decoration');
  });
}
const money = (mut) => {
  for (const role of ['store', 'crewmanager']) {
    for (const r of rows(sheet(role, piece([LEG_SEND, LEG_RET], 'in-service'), [], mut))) assert.strictEqual(r.act, '');
  }
};
mutantFails('withholding off: the storekeeper is handed the bill',
  (s) => s.replace("can(m.role, 'outsideJob')", 'true'), money);
mutantFails('a dash instead of empty',
  (s) => s.replace("var sub = String(e.note || e.vendor || ''), act = ''", "var sub = String(e.note || e.vendor || ''), act = fig(null)"), money);
mutantFails('serial line forgets the second serial',
  (s) => s.replace("b: pass.returnSerial || ''", "b: ''"),
  (mut) => assert(/came back ALT-77999/.test(rows(sheet('store', piece([SEND, RET], 'in-service'), [PASS_BAD], mut))[0].sub)));
mutantFails('send-out stops naming its pass',
  (s) => s.replace("no: pass.no || ''", "no: ''"),
  (mut) => assert(/OJ-261109-AB12/.test(rows(sheet('store', piece([SEND]), [PASS], mut))[0].sub)));
mutantFails('an entry with an id is required',
  (s) => s.replace("e = e || {};", "e = e || {}; if (!e.id) throw new Error('no id');"),
  (mut) => sheet('store', piece([{ type: 'install', at: SENT }]), [], mut));

if (fails) { console.log('\n' + fails + ' failed'); process.exit(1); }
console.log('\nall checks passed');

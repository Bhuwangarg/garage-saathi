/* Tests for the overdue-unit row of Attention (#2) -- OR4, outside-repair-ui.md section 6.
 * Run: node test_v2_outside_attention.js
 *
 * Builds its own gatepasses rows in-test: v2/db.js's seed is not this slice's, and today's fixture
 * has no gatepasses record at all, so without these rows the kind has never been exercised.
 *
 * What is held here: the row exists for outsideJob and for nobody else; it DISAPPEARS when the slip
 * is returned (a count that can reach zero); it ranks through the existing comparator; a slip out
 * under the limit is not a row; a failed gatepasses read drops this kind and no other; the reason
 * says the limit in words; and the tap carries the card, or the piece when there is none.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const V2 = (...p) => path.join(__dirname, 'v2', ...p);
let fails = 0;
function test(name, fn) {
  try { fn(); console.log('  ok  ' + name); }
  catch (e) { console.log(' FAIL ' + name + '\n        ' + String(e.message).split('\n').join('\n        ')); fails++; }
}

const SRC = ['ui/icons.js', 'ui/words.js', 'ui/states.js', 'fmt.js', 'caps.js', 'outside.js', 'screens/attention.js'];
function load() {
  const sandbox = {
    navigator: { onLine: true, userAgent: 'node', language: 'en' },
    document: { documentElement: { lang: 'en', getAttribute: () => null, setAttribute() {} }, getElementById: () => null,
                addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({}) },
    console: { warn() {}, error() {}, info() {}, log() {} },
    S: { user: null, cache: {} },
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  for (const f of SRC) vm.runInContext(fs.readFileSync(V2(f), 'utf8'), ctx, { filename: V2(f) });
  return sandbox;
}
const win = load();
const A = win.Attention;

const NOW = Date.UTC(2026, 10, 9, 12, 0, 0);
const DAY = 86400000;
const me = (role) => ({ id: 'u1', role: role });
const pass = (id, daysAgo, o) => Object.assign({
  id: id, status: 'out', issuedAt: NOW - daysAgo * DAY, busId: 'b1', jobId: 'j-' + id,
  unitName: 'Alternator', unitSerial: 'ALT-77120', vendorName: 'Sharma Auto Electricals',
}, o || {});
const bus = [{ id: 'b1', regNo: 'MH12AB1234' }];
const rowsWith = (passes) => ({ gatepasses: passes, buses: bus });
const mine = (index) => index.rows.filter((r) => r.kind === 'outsideUnit');

test('the kind is declared as the spec states it: outsideJob, band 3, doc, warn, gatepasses + buses', () => {
  const k = A.KINDS.filter((x) => x.key === 'outsideUnit')[0];
  assert(k, 'no outsideUnit kind');
  assert.strictEqual(k.cap, 'outsideJob');
  assert.strictEqual(k.band, 3);
  assert.strictEqual(k.mark, 'doc');
  assert.strictEqual(k.tone, 'warn');
  assert.deepEqual(k.stores.slice().sort(), ['buses', 'gatepasses']);
});

test('(1) a unit out 21 days is a row for the owner, not for a storekeeper, and gone once returned', () => {
  const out = rowsWith([pass('p1', 21)]);
  assert.strictEqual(mine(A.index(out, me('owner'), NOW)).length, 1);
  assert.strictEqual(mine(A.index(out, me('supervisor'), NOW)).length, 1);
  const st = A.index(out, me('store'), NOW);
  assert.strictEqual(mine(st).length, 0, 'a storekeeper is told which vendor holds a unit');
  assert.strictEqual(st.stores.indexOf('gatepasses'), -1, 'a storekeeper read gatepasses');
  const back = rowsWith([pass('p1', 21, { status: 'returned', returnedAt: NOW - DAY })]);
  const gone = A.index(back, me('owner'), NOW);
  assert.strictEqual(mine(gone).length, 0, 'a returned slip is still a row: the count cannot reach zero');
  assert.strictEqual(gone.counts.papers, 0);
});

test('(2) a unit out 20 days ranks above one out 15 days, through the existing comparator', () => {
  const got = mine(A.index(rowsWith([pass('p15', 15), pass('p20', 20)]), me('owner'), NOW));
  assert.deepEqual(got.map((r) => r.id), ['outsideUnit:p20', 'outsideUnit:p15']);
  assert.deepEqual(got.map((r) => r.basis), [-6, -1]);
  assert.strictEqual(got[0].band, 3);
});

test('(3) a unit out 13 days is no row at all; 14 is the first', () => {
  assert.strictEqual(mine(A.index(rowsWith([pass('p13', 13)]), me('owner'), NOW)).length, 0);
  assert.strictEqual(mine(A.index(rowsWith([pass('p14', 14)]), me('owner'), NOW)).length, 1);
});

test('(4) a failed gatepasses read drops this kind only, and never ranks it at zero', () => {
  const data = rowsWith([pass('p1', 21)]);
  data.buses = [{ id: 'b1', regNo: 'MH12AB1234', docs: [{ type: 'Fitness', expiry: NOW + 3 * DAY }] }];
  const ok = A.index(data, me('owner'), NOW);
  assert.strictEqual(mine(ok).length, 1);
  const bad = A.index(data, me('owner'), NOW, ['gatepasses']);
  assert.strictEqual(mine(bad).length, 0);
  assert(bad.skipped.indexOf('outsideUnit') >= 0, 'the kind was not dropped');
  assert.strictEqual(bad.skipped.indexOf('busPaper'), -1, 'a kind whose stores read fine was dropped with it');
  assert(bad.rows.some((r) => r.kind === 'busPaper'), 'the other kinds stopped ranking');
  assert(!bad.unranked.some((r) => r.kind === 'outsideUnit'));
  assert.strictEqual(bad.counts.papers, ok.counts.papers - 1);
});

test('(5) the reason states the 14-day limit in words and is drawn whole', () => {
  const index = A.index(rowsWith([pass('p1', 21)]), me('owner'), NOW);
  const r = mine(index)[0];
  assert.strictEqual(r.sub, 'Out 21 days. 14 days is the limit.');
  assert.strictEqual(r.t, 'Alternator ALT-77120 · Sharma Auto Electricals');
  const html = A.render(index, 'all');
  assert(html.indexOf('Out 21 days. 14 days is the limit.') >= 0, 'the reason is not in the markup whole');
  assert(html.indexOf('Alternator ALT-77120') >= 0);
  assert(!/figure-note/.test(html), 'a row carries a figure-note');
  assert(!/\.\.\.|…/.test(r.sub), 'the reason is truncated');
});

test('(6) the tap goes to the job card with the slip, or to the piece when there is no card', () => {
  const withCard = mine(A.index(rowsWith([pass('p1', 21, { jobId: 'j9' })]), me('owner'), NOW))[0];
  assert.strictEqual(withCard.to, 'jobcard');
  assert.deepEqual(withCard.params, { id: 'j9', pass: 'p1' });
  const noCard = mine(A.index(rowsWith([pass('p2', 21, { jobId: '', componentId: 'c7' })]), me('owner'), NOW))[0];
  assert.strictEqual(noCard.to, 'store');
  assert.deepEqual(noCard.params, { pieceId: 'c7' });
});

test('the two sentences are registered, and Hindi is pending, not borrowed from English', () => {
  const pend = win.W.pending();
  assert(pend.indexOf('attOutsideUnit') >= 0 && pend.indexOf('attOutsideWhy') >= 0, 'not registered, or Hindi supplied by a builder');
});

if (fails) { console.log('\n' + fails + ' FAILED'); process.exit(1); }
console.log('\n  all ok');

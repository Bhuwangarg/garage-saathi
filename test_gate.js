/* Tests for gate.js — the departure checklist rules. Run: node test_gate.js */
const G = require('./gate.js');

let fails = 0;
function check(name, cond) { console.log((cond ? '  ok  ' : ' FAIL ') + name); if (!cond) fails++; }

const allPass = () => Object.fromEntries(G.GATE_ITEMS.map((s) => [s.k, { ok: true, photo: s.photo ? 'u/p.jpg' : '' }]));

check('ten items, AC/blankets/cabin need a photo',
  G.GATE_ITEMS.length === 10 && G.GATE_ITEMS.filter((s) => s.photo).map((s) => s.k).join() === 'ac,blankets,cabin');

let items = allPass();
check('everything passed → pass', G.outcome(items).verdict === 'pass');

items = allPass(); items.ac = { ok: true };
check('a photo item ticked without a photo is not done', G.outcome(items).missing.join() === 'ac');

items = allPass(); items.water = { ok: false };
check('a fail without a note is not done', G.outcome(items).verdict === 'incomplete');
items.water.note = '  ';
check('…a blank note does not count', G.outcome(items).verdict === 'incomplete');
items.water.note = 'only 20 bottles';
check('a fail with a note → fail, listed', G.outcome(items).verdict === 'fail' && G.outcome(items).failed.join() === 'water');

items = allPass(); items.blankets = { ok: false, note: 'short by 6' };
check('a photo item can fail without a photo', G.outcome(items).verdict === 'fail');

check('empty check is incomplete', G.outcome({}).missing.length === 10);

check('open + pass → released', G.releaseStatus({ status: 'open', items: allPass() }) === 'released');
items = allPass(); items.ac = { ok: false, note: 'not cooling' };
check('open + fail → awaiting the office', G.releaseStatus({ status: 'open', items }) === 'awaiting');
check('open + incomplete → cannot release', G.releaseStatus({ status: 'open', items: {} }) === null);
check('already awaiting → no second release', G.releaseStatus({ status: 'awaiting', items: allPass() }) === null);

const H = 3600 * 1000, now = Date.UTC(2026, 9, 5, 21, 0);
const checks = [
  { id: 'a', busId: 'b1', startedAt: now - 30 * H },
  { id: 'b', busId: 'b1', startedAt: now - 2 * H },
  { id: 'c', busId: 'b1', startedAt: now - 1 * H, _deleted: true },
  { id: 'd', busId: 'b2', startedAt: now - 1 * H },
];
check('current check = newest live one in the last 20h', G.currentCheck(checks, 'b1', now).id === 'b');
check('yesterday\'s check is not today\'s', G.currentCheck([checks[0]], 'b1', now) === null);
check('dayKey is YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(G.dayKey(now)));

console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);

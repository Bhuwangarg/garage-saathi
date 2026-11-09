/* Tests for v2/outside.js and the gatePass capability. Run: node test_v2_outside.js
 *
 * Root-level because run-tests.py only discovers test_*.js here.
 * Each group is phrased so that undoing the decision turns it red.
 */
process.env.TZ = process.env.TZ || 'UTC';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = __dirname;
let fails = 0;
function check(name, cond) { console.log((cond ? '  ok  ' : ' FAIL ') + name); if (!cond) fails++; }

function load(file, global, mutate) {
  let src = fs.readFileSync(path.join(ROOT, 'v2', file), 'utf8');
  if (mutate) src = mutate(src);
  const win = { W: { register() {} } };
  vm.runInContext(src, vm.createContext({ window: win }), { filename: file });
  return win[global];
}
const Outside = load('outside.js', 'Outside');
const Caps = load('caps.js', 'Caps');
const D = 86400000;
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

/* 1. capabilities */
const P = Caps.PERMS;
check('gatePass equals manageComponents exactly (owner decision 3)', sameSet(P.gatePass, P.manageComponents));
check('outsideJob is still exactly owner + supervisor', sameSet(P.outsideJob, ['owner', 'supervisor']));
check('Outside.CAP names the capability and it exists', Outside.CAP === 'gatePass' && Array.isArray(P[Outside.CAP]));
check('OVERDUE_DAYS is 14', Outside.OVERDUE_DAYS === 14);

/* 2. awayDays */
const now = 100 * D;
check('both stamps: frozen difference, ignores now',
  Outside.awayDays({ enterAt: 10 * D, outAt: 13 * D, status: 'closed' }, now) === 3
  && Outside.awayDays({ enterAt: 10 * D, outAt: 13 * D, status: 'closed' }, now + 50 * D) === 3);
check('enterAt only, card open: counted from now', Outside.awayDays({ enterAt: 90 * D, status: 'open' }, now) === 10);
const none = Outside.awayDays({ status: 'open' }, now);
check('neither stamp: null, and not 0', none === null && none !== 0);

/* 3. gateMet */
const card = { id: 'j1', outside: true, billPhotos: [] };
const before = Object.assign({}, card, { photos: ['before.jpg'] });
const ret = { id: 'p1', jobId: 'j1', status: 'returned', billPhoto: 'b.jpg', issuedAt: 1 };
check('one before photo, no bill: not met', Outside.gateMet(before, []) === false);
check('bill on the card: met', Outside.gateMet({ id: 'j1', billPhotos: ['x'] }, []) === true);
check('returned pass of this card with billPhoto: met', Outside.gateMet(card, [ret]) === true);
check('non-empty closeNoBillReason: met', Outside.gateMet({ id: 'j1', closeNoBillReason: 'vendor lost it' }, []) === true);
check('returned pass of ANOTHER card: not met', Outside.gateMet(card, [Object.assign({}, ret, { jobId: 'j2' })]) === false);
check('a pass still out, or returned with no bill: not met',
  Outside.gateMet(card, [Object.assign({}, ret, { status: 'out' }), Object.assign({}, ret, { id: 'p3', billPhoto: '' })]) === false);

/* 4. gateState */
check('gateState need-bill', Outside.gateState(card, []).key === 'need-bill');
check('gateState bill-card', Outside.gateState({ id: 'j1', billPhotos: ['x'] }, []).key === 'bill-card');
const gs = Outside.gateState(card, [Object.assign({}, ret, { no: 'OJ-261109-AB12' })]);
check('gateState bill-pass, carrying the pass number', gs.key === 'bill-pass' && gs.passNo === 'OJ-261109-AB12');
const gr = Outside.gateState({ id: 'j1', closeNoBillReason: 'lost' }, []);
check('gateState no-bill-reason, carrying the reason', gr.key === 'no-bill-reason' && gr.reason === 'lost');

/* 5. passesFor */
const ps = [{ id: 'a', jobId: 'j1', issuedAt: 1 }, { id: 'b', jobId: 'j1', issuedAt: 5 },
  { id: 'c', jobId: 'j2', issuedAt: 9 }, { id: 'd', jobId: null, issuedAt: 7 }];
check('newest issuedAt first, other cards excluded and unattached pass absent',
  Outside.passesFor({ id: 'j1' }, ps).map((p) => p.id).join() === 'b,a');
check('a pass with no jobId appears when card.gatePassId names it',
  Outside.passesFor({ id: 'j1', gatePassId: 'd' }, ps).map((p) => p.id).join() === 'd,b,a');

/* 6. passNo */
const at = Date.UTC(2026, 10, 9, 10);
const n1 = Outside.passNo('gp-ab12', at), n2 = Outside.passNo('gp-cd34', at);
check('passNo is OJ-YYMMDD-TAIL', n1 === 'OJ-261109-AB12');
check('not a counter: same millisecond, different ids differ', n1 !== n2);
const seen = new Set();
for (let i = 0; i < 10000; i++) seen.add(Outside.passNo('gp-' + (1e6 + i).toString(36), at));
check('10,000 generated ids collide 0 times', seen.size === 10000);

/* 7. mismatch (the contract 4.1 table) */
check('empty unitSerial: false', Outside.mismatch({ unitSerial: '' }, 'ALT-77120') === false);
check('alt 77120 vs ALT-77120: false', Outside.mismatch({ unitSerial: 'ALT-77120' }, 'alt 77120') === false);
check('ALT77120 vs ALT-77120: false', Outside.mismatch({ unitSerial: 'ALT-77120' }, 'ALT77120') === false);
check('ALT-77999 vs ALT-77120: true', Outside.mismatch({ unitSerial: 'ALT-77120' }, 'ALT-77999') === true);
check('typed empty vs a serial: true', Outside.mismatch({ unitSerial: 'ALT-77120' }, '') === true);

/* 8. outside */
check('isOutside: flag or vendor', Outside.isOutside({ outside: true }) && Outside.isOutside({ externalVendor: 'X' })
  && !Outside.isOutside({ externalVendor: '' }));

/* mutation proofs: break the source, confirm the check reddens */
function mutated(file, g, from, to) { return load(file, g, (s) => { if (!s.includes(from)) throw new Error('mutation target missing: ' + from); return s.replace(from, to); }); }
const mCaps = mutated('caps.js', 'Caps', "gatePass: ['owner', 'supervisor', 'store', 'crewmanager']", "gatePass: ['owner', 'supervisor', 'store']");
check('MUTATION: dropping a role from gatePass is caught', !sameSet(mCaps.PERMS.gatePass, mCaps.PERMS.manageComponents));
const mCaps2 = mutated('caps.js', 'Caps', "outsideJob: ['owner', 'supervisor'],", "outsideJob: ['owner', 'supervisor', 'store'],");
check('MUTATION: widening outsideJob is caught', !sameSet(mCaps2.PERMS.outsideJob, ['owner', 'supervisor']));
const mOut = mutated('outside.js', 'Outside', 'if (!card || !card.enterAt) return null;', 'if (!card || !card.enterAt) return 0;');
check('MUTATION: unknown-as-zero is caught', mOut.awayDays({}, now) === 0 && none !== 0);

if (fails) { console.log('\n' + fails + ' FAILED'); process.exit(1); }
console.log('\nall ok');

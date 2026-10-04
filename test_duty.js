/* Tests for duty.js — the dated duty log. Run: node test_duty.js */
const D = require('./duty.js');

let fails = 0;
function check(name, cond) { console.log((cond ? '  ok  ' : ' FAIL ') + name); if (!cond) fails++; }

const day = (n, h = 0) => Date.UTC(2026, 9, n, h) ;
const mahi = { id: 'u-drv-RJ14PC4417-0', name: 'Mahi Pal' };
const mahi2 = { id: 'u-drv-NL07B902-0', name: 'Mahi Pal' };         // same name, different man
const ravi = { id: 'crew-ravi', name: 'Ravi', crewRole: 'conductor' };
const B1 = 'bus-4417', B2 = 'bus-0902';

const log = [
  D.baselineRow({ crew: mahi, busId: B1, at: day(1), regNo: 'RJ14PC4417' }),
  D.baselineRow({ crew: mahi2, busId: B2, at: day(1), regNo: 'NL07B902' }),
  D.baselineRow({ crew: ravi, busId: B1, at: day(1) }),
  D.dutyRow({ crew: mahi, busId: B2, at: day(5, 12), reason: 'assign' }),        // Mahi moves to B2 at noon on the 5th
  D.dutyRow({ crew: mahi2, busId: null, at: day(5, 12), reason: 'seat-taken' }),  // …which frees the other Mahi Pal
  D.dutyRow({ crew: ravi, busId: null, at: day(8), reason: 'left' }),
];

check('row role comes from crewRole', log[2].role === 'conductor' && log[0].role === 'driver');
check('baseline id is fixed per crew (two phones, one record)', D.baselineRow({ crew: mahi, busId: B1, at: 99 }).id === log[0].id);
check('unknown reason falls back to assign', D.dutyRow({ crew: mahi, busId: B1, at: 1, reason: 'zzz' }).reason === 'assign');
check('regNo is blank when off a bus', D.dutyRow({ crew: mahi, busId: null, at: 1, regNo: 'X' }).regNo === '');

// Driver on B1 on the 3rd: Mahi (by id), not the other Mahi Pal.
let h = D.seatHoldersDuring(log, B1, 'driver', day(3), day(4));
check('who drove B1 on the 3rd', h.length === 1 && h[0].crewId === mahi.id);

// The 5th: Mahi on B1 until noon, then nobody. B2: Mahi2 until noon, then Mahi.
h = D.seatHoldersDuring(log, B1, 'driver', day(5), day(6));
check('B1 on the 5th: Mahi until noon only', h.length === 1 && h[0].until === day(5, 12));
h = D.seatHoldersDuring(log, B2, 'driver', day(5), day(6));
check('B2 on the 5th: both, in order, never merged by name',
  h.length === 2 && h[0].crewId === mahi2.id && h[1].crewId === mahi.id && h[1].since === day(5, 12));

// Roles stay apart: the conductor never answers "who drove".
h = D.seatHoldersDuring(log, B1, 'conductor', day(3), day(4));
check('conductor seat is separate', h.length === 1 && h[0].crewId === ravi.id);
check('left crew drop off from that moment', D.seatHoldersDuring(log, B1, 'conductor', day(9), day(10)).length === 0);

// Before the log began, empty means "not recorded" — coveredFrom tells the two apart.
check('coveredFrom is the first row', D.coveredFrom(log) === day(1));
check('coveredFrom of an empty log is null', D.coveredFrom([]) === null);

// stateAt and deleted rows.
const st = D.stateAt(log, day(6));
check('stateAt picks the latest row per crew', st.get(mahi.id).busId === B2 && st.get(mahi2.id).busId === null);
check('tombstoned rows are ignored', D.stateAt([Object.assign({}, log[0], { _deleted: true })], day(6)).size === 0);

// Baselines: only crew on a bus with no row yet.
const fresh = { id: 'crew-new', name: 'New', busId: B1 };
const idle = { id: 'crew-idle', name: 'Idle', busId: null };
const miss = D.missingBaselines(log, [mahi, fresh, idle], (d) => d.busId || (d === mahi ? B2 : null));
check('missingBaselines finds only the unlogged crew on a bus', miss.length === 1 && miss[0].id === 'crew-new');

// Two driver seats per bus.
const dA = { id: 'u-drv-RJ09PA6141-0', busId: 'b1' }, dB = { id: 'u-drv-RJ09PA6141-1', busId: 'b1' };
let s = D.driverSeats([dB, dA], 'b1');
check('imported -0/-1 drivers fill seat 1 then seat 2', s[0] === dA && s[1] === dB && s.overflow.length === 0);
s = D.driverSeats([dA, Object.assign({}, dB, { driverSlot: 1 })], 'b1');
check('an explicit seat wins over id order', s[0].id === dB.id && s[1] === dA);
const pinned2 = Object.assign({}, dA, { driverSlot: 2 });
s = D.driverSeats([pinned2], 'b1');
check('a lone driver pinned to seat 2 leaves seat 1 free', s[0] === null && s[1] === pinned2);
const dC = { id: 'u-drv-RJ09PA6141-2', busId: 'b1' };
s = D.driverSeats([dA, dB, dC], 'b1');
check('a third driver is overflow, never silently dropped', s.overflow.length === 1 && s.overflow[0] === dC);
s = D.driverSeats([Object.assign({}, dA, { driverSlot: 1 }), Object.assign({}, dB, { driverSlot: 1 })], 'b1');
check('two claims on one seat: lower id keeps it, the other moves', s[0].id === dA.id && s[1].id === dB.id);
check('other buses are ignored', D.driverSeats([dA, { id: 'x', busId: 'b2' }], 'b1')[1] === null);

console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);

/* Tests for trace.js — review → bus → crew. Run: TZ=Asia/Kolkata node test_trace.js */
process.env.TZ = process.env.TZ || 'Asia/Kolkata';
const T = require('./trace.js');

let fails = 0;
function check(name, cond) { console.log((cond ? '  ok  ' : ' FAIL ') + name); if (!cond) fails++; }

const at = (s) => T.parseLocal(s);
const H = 3600 * 1000;

check('parseLocal reads redPro\'s wall-clock time', at('2026-10-07 06:15:00') === new Date(2026, 9, 7, 6, 15).getTime());
check('parseLocal rejects junk', T.parseLocal('yesterday') === null);
check('normReg pads like the server', T.normReg('mp44zd471') === 'MP44ZD0471' && T.normReg('RJ 09 PA 6141') === 'RJ09PA6141');

const services = [
  { id: '125291', serviceNo: 'MHLMEERUT-JAIPUR-0930PM', startTime: '21:30', routeIds: ['46026242', '46026243'] },
  { id: '125687', serviceNo: 'MHLKOTA-RISHIKESH-0500PM', startTime: '17:00', routeIds: ['46346772'] },
  { id: '999', serviceNo: 'NO-TIME', routeIds: ['1'] },
];
const ix = T.routeIndex(services);
check('routeIndex maps every route of a service', ix.get('46026243') === '125291' && ix.get('46346772') === '125687');

// Departure: a 21:30 service; a passenger boards en route at 01:10 next day → the 21:30 of the day before.
check('departure before midnight for a 01:10 boarding', T.departureFor(services[0], at('2026-10-08 01:10:00')) === at('2026-10-07 21:30:00'));
check('departure same evening for a 22:15 boarding', T.departureFor(services[0], at('2026-10-07 22:15:00')) === at('2026-10-07 21:30:00'));
check('no start time → no departure', T.departureFor(services[2], at('2026-10-07 22:15:00')) === null);

const buses = [{ id: 'bus-6141', regNo: 'RJ09PA6141' }, { id: 'bus-2103', regNo: 'MP44ZF2103' }];
const crewAt = (busId, t) => (busId === 'bus-6141' ? [{ crewId: 'u-drv-RJ09PA6141-0', name: 'Ravindra', role: 'driver' }] : []);
const gate = [{ id: 'gc-1', busId: 'bus-6141', regNo: 'RJ09PA6141', serviceId: '125291', startedAt: at('2026-10-07 21:05:00'), driverId: 'u-drv-RJ09PA6141-0', status: 'released' }];
const assign = [{ id: 'as-125291-2026-10-07', serviceId: '125291', date: '2026-10-07', obs: [{ at: at('2026-10-07 18:00:00'), vehicleNo: 'RJ09PA6141', driver1: 'Ravindra' }] }];
const review = { pnr: '251365749', routeId: '46026243', boardAt: at('2026-10-08 01:10:00') };

let r = T.resolve(review, { services, gatechecks: gate, assign, buses, crewAt });
check('gate + redPro agree → high confidence, the gate check\'s bus', r.confidence === 'high' && r.agree === true && r.bus.busId === 'bus-6141');
check('crew comes from our records', r.crew.length === 1 && r.crew[0].crewId === 'u-drv-RJ09PA6141-0');
check('both sources recorded', !!r.sources.gate && !!r.sources.redpro && r.sources.redpro.driver1 === 'Ravindra');

r = T.resolve(review, { services, gatechecks: [], assign, buses, crewAt });
check('redPro alone → medium', r.confidence === 'medium' && r.why === 'redpro-assignment' && r.bus.busId === 'bus-6141');

const assignOther = [{ id: 'x', serviceId: '125291', date: '2026-10-07', obs: [{ at: at('2026-10-07 18:00:00'), vehicleNo: 'MP44ZF2103' }] }];
r = T.resolve(review, { services, gatechecks: gate, assign: assignOther, buses, crewAt });
check('gate and redPro disagree → conflict, never hidden', r.confidence === 'conflict' && r.agree === false && r.why === 'sources-disagree');
check('…the gate check\'s bus is still the one shown first', r.bus.regNo === 'RJ09PA6141');

r = T.resolve(review, { services, gatechecks: [], assign: [], buses, crewAt, its: { '251365749': { regNo: 'RJ09 PA 6141' } } });
check('ITS fallback alone → medium via its', r.confidence === 'medium' && r.why === 'its' && r.bus.busId === 'bus-6141');

r = T.resolve({ pnr: '1', routeId: 'unknown-route', boardAt: at('2026-10-07 22:00:00') }, { services, gatechecks: gate, assign, buses, crewAt });
check('unmapped route → none, service-unknown', r.confidence === 'none' && r.why === 'service-unknown');

r = T.resolve({ pnr: '1', routeId: '46026242', boardAt: at('2026-10-09 22:00:00') }, { services, gatechecks: gate, assign, buses, crewAt });
check('a different night → no source', r.confidence === 'none' && r.why === 'no-source');

// A gate check from the wrong night must not be used.
const lateGate = [Object.assign({}, gate[0], { startedAt: at('2026-10-06 21:05:00') })];
r = T.resolve(review, { services, gatechecks: lateGate, assign: [], buses, crewAt });
check('the previous night\'s gate check is not this trip\'s', r.sources.gate === null);

// A bus swapped mid-day in redPro is flagged.
const swapped = [{ serviceId: '125291', date: '2026-10-07', obs: [{ at: at('2026-10-07 12:00:00'), vehicleNo: 'MP44ZF2103' }, { at: at('2026-10-07 20:00:00'), vehicleNo: 'RJ09PA6141' }] }];
r = T.resolve(review, { services, gatechecks: [], assign: swapped, buses, crewAt });
check('redPro swap during the day is flagged, nearest-to-departure wins', r.sources.redpro.changed === true && r.sources.redpro.regNo === 'RJ09PA6141');

// Gate check driver not on the duty board is still named as crew.
r = T.resolve(review, { services, gatechecks: [Object.assign({}, gate[0], { driverId: 'u-drv-OTHER' })], assign: [], buses, crewAt });
check('the gate-check driver is always listed', r.crew.some((c) => c.crewId === 'u-drv-OTHER' && c.via === 'gate'));

// Classification.
check('drunk driving is safety', T.classify({ stars: 1, comment: 'driver was drunk and driving rashly' }) === 'safety');
check('stacked service gripes are not safety', T.classify({ stars: 1, comment: 'dirty, AC bad, no blanket, late', tags: ['Cleanliness'] }) === 'genuine');
check('refund question with no tags is FAQ', T.classify({ stars: 2, comment: 'when will I get my refund?' }) === 'faq');
check('5 stars is praise', T.classify({ stars: 5, comment: 'great' }) === 'praise');

console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);

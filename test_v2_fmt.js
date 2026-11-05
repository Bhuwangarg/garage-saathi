/* Tests for v2/fmt.js, v2/odo.js and v2/cost.js — the pure helpers. Run: node test_v2_fmt.js
 *
 * At the repo ROOT and not in v2/, because run-tests.py auto-discovers test_*.js
 * at the root only: a test in v2/ would never run, and a test nobody runs is not
 * a test.
 *
 * Two things here carry arithmetic that a real bug has already come out of, and
 * every group below is phrased so that undoing the decision turns it red:
 *
 *   - ONE COST BASIS, WHICH VISIBLY RECONCILES. Cost.forBus returns the six
 *     parts with the total; the parts sum to it to the rupee; a part that cannot
 *     be known withholds the total instead of becoming 0; and a total that
 *     disagrees with its parts is withheld too. (Five bases existed in v1 and
 *     disagreed, which is why people stopped reading them.)
 *
 *   - A MISSING ODOMETER IS NOT A NUMBER. 8db78e7: a per-km figure divided by a
 *     missing odometer read 45,000 rupees of work as 45,000 per km, topped the
 *     money-pit list, and sent the owner to inspect a healthy bus. The ranking
 *     checks below put the unusable bus in the list and assert it is in NEITHER
 *     end of the ranking — the second half of that fix was never made.
 *
 * Each module is loaded in a `vm` context holding a stub window and nothing
 * else, which is also the proof that none of them reaches for a DOM, a store or
 * a clock.
 */
process.env.TZ = process.env.TZ || 'UTC';   // nothing here may depend on the machine's zone

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
let fails = 0;
function check(name, cond) { console.log((cond ? '  ok  ' : ' FAIL ') + name); if (!cond) fails++; }
function throws(fn) { try { fn(); } catch (e) { return true; } return false; }

/* `mutate`, when given, rewrites a module's source before it runs: that is how
 * the mutation checks at the bottom break the real file without touching it. */
function load(file, mutate) {
  let src = fs.readFileSync(path.join(ROOT, 'v2', file), 'utf8');
  if (mutate) src = mutate(src);
  const registered = [];
  const win = { W: { register: (t) => registered.push(t) } };
  const ctx = vm.createContext({ window: win });
  vm.runInContext(src, ctx, { filename: file });
  return { api: win.fmt || win.Odo || win.Cost, registered };
}
const fmt = load('fmt.js').api;
const odoLoad = load('odo.js');
const Odo = odoLoad.api;
const Cost = load('cost.js').api;

/* ---------------------------------------------------------------- fmt ---- */
check('groupIndian(4500000) is 45,00,000 — lakh grouping, not thousands', fmt.groupIndian(4500000) === '45,00,000');
check('…1,00,000 and 1,23,45,678', fmt.groupIndian(100000) === '1,00,000' && fmt.groupIndian(12345678) === '1,23,45,678');
check('…and small numbers are left alone', fmt.groupIndian(0) === '0' && fmt.groupIndian(999) === '999' && fmt.groupIndian(1000) === '1,000');
check('rupees(45000) is ₹45,000, symbol in front', fmt.rupees(45000) === '₹45,000');
check('rupees(603410) is ₹6,03,410', fmt.rupees(603410) === '₹6,03,410');
check('a real zero is ₹0 — it is only UNKNOWN that must not be', fmt.rupees(0) === '₹0');
check('rupees(null) THROWS — never ₹0, that is unknown-reads-as-zero', throws(() => fmt.rupees(null)));
check('…and so do undefined, NaN, Infinity and a numeric string', throws(() => fmt.rupees(undefined)) &&
      throws(() => fmt.rupees(NaN)) && throws(() => fmt.rupees(Infinity)) && throws(() => fmt.rupees('45000')));
check('groupIndian(null) throws too — the guard is not only on rupees', throws(() => fmt.groupIndian(null)));
check('every formatter throws on null, none returns a default',
      ['oneDecimal', 'hours', 'days', 'km'].every((k) => throws(() => fmt[k](null))));
check('a negative keeps its sign in front of the symbol: −₹1,200', fmt.rupees(-1200) === '−₹1,200');
check('a figure that rounds to zero has no sign', fmt.rupees(-0.2) === '₹0');
check('oneDecimal keeps the decimal: 4 is 4.0, 4.26 is 4.3', fmt.oneDecimal(4) === '4.0' && fmt.oneDecimal(4.26) === '4.3');
check('oneDecimal groups the whole part: 123456.7', fmt.oneDecimal(123456.7) === '1,23,456.7');
check('hours/days/km carry their unit', fmt.hours(3.5) === '3.5 h' && fmt.km(48210) === '48,210 km' &&
      fmt.days(1) === '1 day' && fmt.days(30) === '30 days');
// Cross-check the hand-written grouping against Intl wherever this node has the
// full data. A node without it falls back to thousands grouping, and then this
// check would be asserting the fallback, so it is gated on 45,00,000 coming back.
if ((4500000).toLocaleString('en-IN') === '45,00,000') {
  let agree = true;
  for (let v = 0; v < 3e7; v = v * 3 + 7) if (fmt.groupIndian(v) !== v.toLocaleString('en-IN')) agree = false;
  check('groupIndian agrees with Intl en-IN across magnitudes', agree);
}

/* ------------------------------------------------------------ Odo.check -- */
const lower = Odo.check(48210, 40000, 0);
check('Odo.check refuses a lower reading', lower !== null && lower.reason === 'lower');
check('…and the message NAMES the number: "Lower than the last reading, 48,210 km"',
      lower.message === 'Lower than the last reading, 48,210 km');
check('…never "Invalid odometer"', !/invalid/i.test(lower.message));
check('…in lakh grouping when the reading is a lakh', Odo.check(148210, 1, 0).message.indexOf('1,48,210') >= 0);
check('an equal reading is allowed — the bus has not moved', Odo.check(48210, 48210, 0) === null);
check('a higher reading is allowed', Odo.check(48210, 48300, 0) === null);
check('a blank, a zero or a non-number is not refused here: it is "no reading", not "wrong reading"',
      Odo.check(48210, undefined, 0) === null && Odo.check(48210, 0, 0) === null && Odo.check(48210, 'abc', 0) === null);
check('no previous reading means nothing to be lower than', Odo.check(0, 5, 0) === null && Odo.check(undefined, 5, 0) === null);

/* ------------------------------------------------- the six odometer cases -- */
const T0 = Date.UTC(2026, 9, 1);
const fill = (at, odometer, litres, full, cost) => ({ at: T0 + at * 86400000, odometer, litres, full, cost });
const good = Odo.mileage({}, [fill(0, 48000, 100, true, 9000), fill(5, 48200, 20, false, 1800), fill(9, 48420, 80, true, 7200)]);
check('a computable tank: 420 km on 100 litres is 4.2 km/l, part fill counted',
      good.ok === true && good.km === 420 && good.litres === 100 && Math.abs(good.kmpl - 4.2) < 1e-9);
check('…the part fill before the earlier full tank is NOT counted (strictly after)',
      Odo.mileage({}, [fill(-3, 47900, 50, false, 1), fill(0, 48000, 100, true, 1), fill(9, 48420, 100, true, 1)]).litres === 100);
check('…fills given out of order are sorted by time', Odo.mileage({}, [fill(9, 48420, 80, true, 7200), fill(0, 48000, 100, true, 9000), fill(5, 48200, 20, false, 1800)]).km === 420);
check('…and the diesel cost over the same span (the fills after the earlier full tank) is returned', good.fuelCost === 9000 && Math.abs(good.costPerKm - 9000 / 420) < 1e-9);

const c1 = Odo.mileage({}, [fill(0, 48000, 100, true), fill(9, 0, 80, true)]);
check('case 1: a full fill with no reading -> reason none, "No odometer reading", with a next step',
      c1.ok === false && c1.reason === 'none' && c1.message === 'No odometer reading' && c1.next === 'Add the reading on the next fill');
check('case 1: a missing reading is never computed from the fill before',
      Odo.mileage({}, [fill(0, 48000, 100, true), fill(9, undefined, 80, true)]).ok === false);
const c2 = Odo.mileage({ odoBroken: true, odoBrokenAt: Date.UTC(2026, 9, 12) }, [fill(0, 48000, 100, true), fill(9, 48420, 80, true)]);
check('case 2: broken -> "Odometer broken since 12 October"', c2.reason === 'broken' && c2.message === 'Odometer broken since 12 October');
check('case 2: …and NO request for a reading (next is null, mayAsk is false)', c2.next === null && Odo.mayAsk({ odoBroken: true }) === false);
check('case 2: …broken wins even when the readings look fine', c2.ok === false);
check('case 2 vs 1: a missing reading DOES ask, a broken instrument does not', c1.next !== null && c2.next === null);
const c3 = Odo.mileage({}, [fill(0, 48210, 100, true), fill(9, 40000, 80, true)]);
check('case 3: a later reading below the earlier -> reason lower, naming 48,210',
      c3.reason === 'lower' && c3.message === 'Lower than the last reading, 48,210 km');
const c4 = Odo.mileage({}, [fill(0, 48210, 100, true), fill(9, 48210, 80, true)]);
check('case 4: the same reading -> "Same reading as the last fill", no number', c4.reason === 'same' && c4.message === 'Same reading as the last fill' && c4.kmpl === undefined);
const c5 = Odo.mileage({}, [fill(0, 48210, 5, true), fill(9, 61900, 120.5, true)]);
check('case 5: 13,690 km on 120.5 litres is 113 km/l — not a mileage, both readings shown',
      c5.reason === 'implausible' && c5.message === 'Reading does not fit — 48,210 km to 61,900 km on 120.5 litres');
check('case 5: below the band too (1 km/l)', Odo.mileage({}, [fill(0, 1000, 5, true), fill(9, 1100, 100, true)]).reason === 'implausible');
check('case 5: the band is 1.5 to 12, inclusive at the edges',
      Odo.mileage({}, [fill(0, 1000, 5, true), fill(9, 1150, 100, true)]).ok === true &&
      Odo.mileage({}, [fill(0, 1000, 5, true), fill(9, 2200, 100, true)]).ok === true &&
      Odo.mileage({}, [fill(0, 1000, 5, true), fill(9, 1149, 100, true)]).reason === 'implausible' &&
      Odo.mileage({}, [fill(0, 1000, 5, true), fill(9, 2201, 100, true)]).reason === 'implausible');
check('case 5: litres not recorded is a divisor the app does not hold — not a mileage',
      Odo.mileage({}, [fill(0, 1000, 5, true), fill(9, 1400, undefined, true)]).ok === false &&
      Odo.mileage({}, [fill(0, 1000, 5, true), fill(9, 1400, 0, true)]).ok === false);
const c6 = Odo.mileage({}, [fill(0, 48000, 100, true), fill(5, 48200, 20, false)]);
check('case 6: one full tank only -> "Part fill — mileage at the next full tank"',
      c6.reason === 'part-fill' && c6.message === 'Part fill — mileage at the next full tank');
check('case 6: no fills at all is the same, not a crash', Odo.mileage({}, []).reason === 'part-fill' && Odo.mileage({}, undefined).reason === 'part-fill');
check('the six cases are six different reasons',
      new Set([c1.reason, c2.reason, c3.reason, c4.reason, c5.reason, c6.reason]).size === 6);
check('the English copy is registered with W with an empty hi — pending, not silently English',
      odoLoad.registered.length === 1 && Object.keys(odoLoad.registered[0]).every((k) => odoLoad.registered[0][k].en && 'hi' in odoLoad.registered[0][k]));

/* ------------------------------------------- Odo.kmOver, the denominator -- */
const P0 = Date.UTC(2026, 9, 6), P1 = Date.UTC(2026, 10, 5);
const rd = (day, km) => ({ at: P0 + day * 86400000, km });
const ok = Odo.kmOver({}, [rd(1, 48000), rd(20, 48900)], P0, P1);
check('kmOver: two readings 900 km apart is 900', ok.ok === true && ok.km === 900);
check('kmOver: earliest against latest BY TIME, not min against max — a typo in the middle does not become the distance',
      Odo.kmOver({}, [rd(1, 48000), rd(10, 12), rd(20, 48900)], P0, P1).km === 900);
check('kmOver: a broken instrument is unknown, with the date', Odo.kmOver({ odoBroken: true, odoBrokenAt: Date.UTC(2026, 9, 12) }, [rd(1, 48000), rd(20, 48900)], P0, P1).message === 'Odometer marked broken on 12 Oct');
check('kmOver: one reading is not a distance', Odo.kmOver({}, [rd(1, 48000)], P0, P1).reason === 'one');
check('kmOver: no reading is not a distance', Odo.kmOver({}, [], P0, P1).reason === 'none');
check('kmOver: a zero reading is the seeded default, not a reading', Odo.kmOver({}, [rd(1, 0), rd(20, 48900)], P0, P1).reason === 'one');
check('kmOver: readings outside the period do not count', Odo.kmOver({}, [rd(-5, 100), rd(20, 48900)], P0, P1).reason === 'one');
check('kmOver: backwards is refused', Odo.kmOver({}, [rd(1, 48900), rd(20, 48000)], P0, P1).reason === 'lower');
const close = Odo.kmOver({}, [rd(1, 48000), rd(20, 48240)], P0, P1);
check('kmOver: 240 km apart is under 500 — "too close to divide"', close.reason === 'close' && close.message === 'Readings 240 km apart — too close to divide');
check('kmOver: exactly 500 km is enough', Odo.kmOver({}, [rd(1, 48000), rd(20, 48500)], P0, P1).km === 500);

/* ------------------------------------------ the ranking, in BOTH directions */
const rk = Cost.rankPerKm([
  { busId: 'b1', total: 45000, km: null },        // the 8db78e7 bus: money, no divisor
  { busId: 'b2', total: 30000, km: 6000 },
  { busId: 'b3', total: 20000, km: 10000 },
  { busId: 'b4', total: null, km: 5000 },         // no total
  { busId: 'b5', total: 0, km: 5000 },            // genuinely nothing spent
  { busId: 'b6', total: 45000, km: 0 },
  { busId: 'b7', total: 45000, km: '6000' },
]);
const ids = rk.ranked.map((r) => r.busId);
check('rankPerKm: a bus with money and NO km is not in the ranking at all (not first)', ids.indexOf('b1') < 0);
check('…nor last: an unusable figure leaves in both directions', ids[ids.length - 1] === 'b5' && ids.indexOf('b1') < 0 && ids.indexOf('b6') < 0 && ids.indexOf('b7') < 0);
check('…the order of the rest is by cost per km, highest first', ids.join() === 'b2,b3,b5');
check('…a bus with no total is excluded, not ranked at zero', ids.indexOf('b4') < 0 && rk.excluded.some((e) => e.busId === 'b4' && e.reason === 'no-total'));
check('…and each exclusion names its reason', rk.excluded.length === 4 && rk.excluded.find((e) => e.busId === 'b1').reason === 'no-km');
check('…km of 0 and a numeric string are not divisors', rk.excluded.some((e) => e.busId === 'b6') && rk.excluded.some((e) => e.busId === 'b7'));
check('…a real zero spend IS ranked (last) — known zero is not unknown', rk.ranked[2].perKm === 0);
const fleet = Cost.fleetPerKm([{ busId: 'b1', total: 45000, km: null }, { busId: 'b2', total: 30000, km: 6000 }, { busId: 'b3', total: 20000, km: 10000 }]);
check('fleetPerKm divides only the money of buses that HAVE km, by only their km',
      fleet.perKm === 50000 / 16000 && fleet.buses === 2 && fleet.excluded === 1 && fleet.km === 16000);
check('fleetPerKm with no usable bus is null, not 0 and not NaN', Cost.fleetPerKm([{ busId: 'x', total: 5, km: null }]).perKm === null);
const mr = Odo.rankMileage([
  { busId: 'm1', result: Odo.mileage({}, [fill(0, 1000, 5, true), fill(9, 1600, 100, true)]) },   // 6 km/l
  { busId: 'm2', result: c1 },
  { busId: 'm3', result: Odo.mileage({}, [fill(0, 1000, 5, true), fill(9, 1300, 100, true)]) },   // 3 km/l
  { busId: 'm4', result: c5 },
  { busId: 'm5', result: c2 },
  { busId: 'm6' },
]);
check('rankMileage: worst mileage first, over the buses that have one', mr.ranked.map((r) => r.busId).join() === 'm3,m1');
check('…every unusable bus is in "Readings to check" and in neither end of the ranking',
      mr.toCheck.map((r) => r.busId).join() === 'm2,m4,m5,m6' && mr.ranked.every((r) => r.kmpl > 0));
check('…each carries its reason, and the broken one still asks for nothing', mr.toCheck[0].reason === 'none' && mr.toCheck[2].next === null);

/* --------------------------------------------------------- Cost.forBus ---- */
const NOW = Date.UTC(2026, 10, 5, 12);
const ago = (d) => NOW - d * 86400000;
const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);
function rows() {
  return {
    garage: { labourRate: 250 },
    fuel: [
      { id: 'f1', busId: 'b1', at: ago(2), cost: 10000 }, { id: 'f2', busId: 'b1', at: ago(9), cost: 15000 },
      { id: 'f3', busId: 'b1', at: ago(40), cost: 99999 },     // outside the window
      { id: 'f4', busId: 'b2', at: ago(2), cost: 5000 },       // another bus
    ],
    def: [{ id: 'd1', busId: 'b1', at: ago(3), cost: 500 }],
    jobcards: [
      { id: 'j1', busId: 'b1', jobDate: ymd(ago(5)), partsUsed: [{ partId: 'p1', qty: 2, cost: 3000, reused: false }], labourHours: 4, externalCost: 2000 },
      // The card lost its part line to a stale save; the ledger knows the part left the store.
      { id: 'j2', busId: 'b1', jobDate: ymd(ago(7)), partsUsed: [], labourHours: 1.5, externalCost: 0 },
      { id: 'j3', busId: 'b1', jobDate: ymd(ago(60)), partsUsed: [{ partId: 'p9', qty: 1, cost: 88888 }], labourHours: 90, externalCost: 77777 },
      { id: 'j4', busId: 'b2', jobDate: ymd(ago(5)), partsUsed: [{ partId: 'p1', qty: 1, cost: 4242 }], labourHours: 1, externalCost: 4242 },
    ],
    ledger: [
      { id: 'l1', type: 'out', jobId: 'j1', partId: 'p1', qty: 2, unitCost: 1500, reused: false },   // already on j1: must not count twice
      { id: 'l2', type: 'out', jobId: 'j2', partId: 'p2', qty: 3, unitCost: 400, reused: false },    // healed onto j2: 1200
      { id: 'l3', type: 'in', jobId: null, partId: 'p2', qty: 50, unitCost: 400 },
      { id: 'l4', type: 'out', jobId: null, partId: 'p2', qty: 9, unitCost: 400 },                    // audit shrinkage: not a bus's cost
    ],
    components: [{ id: 'c1', busId: 'b1', history: [
      { type: 'send-out', at: ago(12), vendor: 'x' },                         // carries no cost
      { type: 'return', at: ago(10), cost: 3500 },
      { type: 'return', at: ago(50), cost: 777 },                             // outside the window
      { type: 'install', at: ago(4), cost: 12345 },                           // not send-out or return
    ] }],
    trips: [
      { id: 't1', busId: 'b1', startedAt: ago(6), expenses: [{ cat: 'diesel', amount: 800 }, { cat: 'toll', amount: 450 }] },
      { id: 't2', busId: 'b1', startedAt: ago(45), expenses: [{ cat: 'toll', amount: 9999 }] },
      { id: 't3', busId: 'b2', startedAt: ago(6), expenses: [{ cat: 'toll', amount: 9999 }] },
    ],
    incidents: [{ id: 'i1', busId: 'b1', at: ago(8), cost: 600 }, { id: 'i2', busId: 'b1', at: ago(70), cost: 5000 }],
    // Supplier bills buy stock; the stock is cost when ISSUED. Counting both counts it twice.
    purchases: [{ id: 'pu1', amount: 123456, at: ago(3) }],
  };
}
const r = Cost.forBus('b1', 30, rows(), NOW);
const val = (res, id) => res.parts.find((p) => p.id === id).value;
check('the six parts, in order: fuel, parts, labour, outside, trip, misc', r.parts.map((p) => p.id).join() === 'fuel,parts,labour,outside,trip,misc');
check('Fuel & AdBlue is fuel + def inside the window, this bus only: 25,500', val(r, 'fuel') === 25500);
check('Parts is the card lines PLUS what the ledger shows left the store and the card lost: 3,000 + 1,200', val(r, 'parts') === 4200);
check('…a part already on the card is not counted again from the ledger', val(r, 'parts') !== 4200 + 3000);
check('Labour is hours x the garage rate: 5.5 h x 250', val(r, 'labour') === 1375);
check('Outside is card externalCost + rotables sent out or returned: 2,000 + 3,500', val(r, 'outside') === 5500);
check('Trip cash is every expense of this bus\'s trips in the window, every category: 1,250', val(r, 'trip') === 1250);
check('Misc is incident cost in the window: 600', val(r, 'misc') === 600);
check('THE SIX PARTS SUM TO THE TOTAL TO THE RUPEE: 38,425',
      r.total === 38425 && r.parts.reduce((s, p) => s + p.value, 0) === r.total);
check('…Cost.reconciles agrees, and says false for a total that was edited', Cost.reconciles(r) === true && Cost.reconciles(Object.assign({}, r, { total: r.total + 1 })) === false);
check('…supplier bills are not in the total, and the result says what is not in it',
      r.total !== 38425 + 123456 && r.notIn.indexOf('bills') >= 0 && r.notIn.indexOf('challans') >= 0 && r.notIn.indexOf('shrinkage') >= 0);
check('…audit shrinkage on the ledger (jobId null) is not a bus\'s cost', val(r, 'parts') < 4200 + 3600);
check('…another bus\'s money is not this bus\'s', Cost.forBus('b2', 30, rows(), NOW).parts.find((p) => p.id === 'fuel').value === 5000);
check('…every part carries a label and a record count', r.parts.every((p) => p.label && typeof p.n === 'number'));
check('…a longer window picks up the old records: the number moves', Cost.forBus('b1', 90, rows(), NOW).total > r.total);
check('a bus with no records anywhere is ZERO with n:0 and a real total — read, and nothing found',
      (function () { const z = Cost.forBus('nobody', 30, rows(), NOW); return z.total === 0 && z.parts.every((p) => p.value === 0 && p.n === 0); })());
check('…so "no trips recorded" is n === 0 on a part that is 0, not a hidden total', (function () { const z = Cost.forBus('b2', 30, rows(), NOW); return val(z, 'trip') === 9999 && Cost.forBus('nobody', 30, rows(), NOW).parts[4].n === 0; })());

// UNKNOWN IS NEVER FOLDED INTO THE SUM.
function without(key) { const x = rows(); delete x[key]; return x; }
const noTrips = Cost.forBus('b1', 30, without('trips'), NOW);
check('trips not loaded: Trip cash is null and the TOTAL IS NULL — not a smaller number',
      val(noTrips, 'trip') === null && noTrips.total === null && noTrips.why === 'unknown');
check('…and the unknown part is named, the others still returned', noTrips.unknown.join() === 'trip' && val(noTrips, 'fuel') === 25500);
check('…every part has a missing-source case: no total from any of them',
      ['fuel', 'def', 'jobcards', 'ledger', 'components', 'trips', 'incidents'].every((k) => Cost.forBus('b1', 30, without(k), NOW).total === null));
check('…a fuel row with no cost makes Fuel unknown, it is not a zero fill', (function () { const x = rows(); delete x.fuel[0].cost; const y = Cost.forBus('b1', 30, x, NOW); return val(y, 'fuel') === null && y.total === null; })());
check('…an expense with no amount makes Trip cash unknown', (function () { const x = rows(); x.trips[0].expenses[0].amount = undefined; return Cost.forBus('b1', 30, x, NOW).total === null; })());
check('…labour hours with no garage rate: Labour is unknown, v1\'s silent 250 is not invented', (function () { const x = rows(); x.garage = {}; const y = Cost.forBus('b1', 30, x, NOW); return val(y, 'labour') === null && y.total === null; })());
check('…but no hours and no rate is a genuine 0, not unknown', (function () { const x = rows(); x.garage = {}; x.jobcards.forEach((j) => { j.labourHours = 0; }); return val(Cost.forBus('b1', 30, x, NOW), 'labour') === 0; })());
check('…a ledger row from before prices, on a card that lost the line, is unknown not zero', (function () { const x = rows(); delete x.ledger[1].unitCost; return val(Cost.forBus('b1', 30, x, NOW), 'parts') === null; })());
check('…a card with no date at all cannot be placed, so it is not guessed', (function () { const x = rows(); x.jobcards.push({ id: 'j9', busId: 'b1', partsUsed: [] }); return Cost.forBus('b1', 30, x, NOW).total === null; })());
check('the clock is an argument: no `now` throws, it is not read from the machine', throws(() => Cost.forBus('b1', 30, rows())));
check('deleted records do not count', (function () { const x = rows(); x.fuel[0]._deleted = true; return val(Cost.forBus('b1', 30, x, NOW), 'fuel') === 15500; })());

// THE PARTS STOP SUMMING -> THE TOTAL IS WITHHELD. This loads cost.js with its
// own summing loop broken by one rupee and asserts the second path catches it;
// it is red if the reconcile guard is removed, which is the failure that made
// five bases in v1.
const Drift = load('cost.js', (s) => {
  if (s.indexOf('total = t;') < 0) throw new Error('mutation anchor missing in cost.js');
  return s.replace('total = t;', 'total = t + 1;');
}).api;
const dr = Drift.forBus('b1', 30, rows(), NOW);
check('parts that do not sum to the total: the total is NOT returned (null, why "mismatch")', dr.total === null && dr.why === 'mismatch');
check('…the parts are still returned, so the screen can say what it does have', dr.parts.length === 6 && val(dr, 'fuel') === 25500);

/* ------------------------------------------------- source-level tripwires -- */
// Comments are stripped first: this file's own prose says "no || 1", and a check
// that trips on its own explanation teaches people to delete checks.
function code(file) {
  return fs.readFileSync(path.join(ROOT, 'v2', file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/.*$/gm, '');
}
['fmt.js', 'odo.js', 'cost.js'].forEach((f) => {
  const c = code(f);
  check(f + ': no defaulted denominator — no `|| 1`, and no `|| 0` inside a division', !/\|\|\s*1\b/.test(c) && !/\/\s*\([^)]*\|\|\s*[01]\b/.test(c) && !/\/\s*[\w.\[\]]+\s*\|\|\s*[01]\b/.test(c));
  check(f + ': pure — no DOM, store, network or storage', !/\b(document|fetch|indexedDB|localStorage|sessionStorage|XMLHttpRequest)\b/.test(c) && !/\b(DB|S)\.\w/.test(c));
  check(f + ': no clock read (Date.now / new Date() with no argument)', !/Date\.now\s*\(/.test(c) && !/new Date\s*\(\s*\)/.test(c));
  check(f + ': inside the Chrome 109 floor (no groupBy / toSorted / withResolvers / fromAsync)', !/groupBy|toSorted|toReversed|withResolvers|fromAsync/.test(c));
});

console.log(fails ? `\n${fails} FAILED` : '\nall ok');
process.exit(fails ? 1 : 0);

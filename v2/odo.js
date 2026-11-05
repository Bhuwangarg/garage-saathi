/* Garage Saathi v2 — what the odometer is allowed to mean.
 *
 * Pure: readings in, a verdict out. No DOM, no store, no clock (a date is only
 * ever formatted from a timestamp the caller hands over).
 *
 * THE BUG THIS FILE IS DESIGNED AGAINST. 8db78e7: a per-km figure divided by a
 * missing odometer read ₹45,000 of work as ₹45,000 per kilometre. It topped the
 * money-pit list, and the owner was sent to inspect a healthy bus. Every one of
 * the 89 seeded buses has `odometer: 0`, and 0 is ALSO the true value when the
 * instrument is broken, so "zero" cannot mean "zero kilometres" anywhere.
 *
 * Two rules come out of that, and they are the whole file:
 *
 *   1. NEVER DEFAULT A DENOMINATOR. No `|| 1`, no `|| 0` that is later divided
 *      by, no "assume the last reading". A missing reading is a missing reading,
 *      and everything computed from it is missing too — the dash, with the
 *      reason in words.
 *
 *   2. AN UNUSABLE FIGURE LEAVES A RANKING IN BOTH DIRECTIONS. 8db78e7 put an
 *      unusable figure at the TOP of a list. The obvious fix puts it at the
 *      BOTTOM ("scores zero, so it sorts last"), and that is the same bug
 *      facing the other way: a bus with no reading that sorts as the best in the
 *      fleet is a bus nobody looks at. The fix that was applied last time only
 *      covered the first half. rankMileage() therefore does not sort an unusable
 *      bus at all — it lists it separately, with its reason, under "Readings to
 *      check" (screens-assets.md §3.5).
 *
 * THE SIX CASES, kept apart because the fix for each is different:
 *   1 'none'     no reading on the fill        -> ask for it on the next fill
 *   2 'broken'   the instrument is broken      -> do NOT ask for a reading; the
 *                                                 fix is a workshop job, and asking
 *                                                 is how a wrong number gets typed
 *   3 'lower'    a reading below the last      -> refused at entry (927864c)
 *   4 'same'     zero distance                 -> no number; division by zero is
 *                                                 not a big number
 *   5 'implausible' km/l outside 1.5 to 12     -> not a mileage; show both readings
 *   6 'part-fill' no two full tanks yet        -> litres and rupees are facts, the
 *                                                 mileage waits
 *
 * THE 1.5 TO 12 km/l BAND IS A GUESS. The screen designer says so in so many
 * words (screens-assets.md §3.5: "a guess with its arithmetic shown, not a
 * measurement"). A full-size diesel coach realistically returns 3 to 6, so the
 * band is wide enough not to reject a real tank and narrow enough to catch a
 * transposed digit — but nobody has measured the fleet. The failure it carries
 * is silent: a band set too tight hides a REAL mileage as "does not fit" and
 * nothing anywhere says a true number was thrown away. The replacement is one
 * query — the median and spread of computable km/l across the `fuel` store —
 * and until it is run the band is held in one place (BAND, below) so changing
 * it is a one-line edit and the test file names the values it expects.
 *
 * ENGLISH COPY lives in COPY, registered with W where words.js has loaded, with
 * an empty `hi` so it shows up as pending on the owner's list rather than as a
 * silently English string in Hindi mode. Every refusal also returns `reason`
 * and `params`, so a screen that wants its own wording can build it from those
 * and never parse `message`.
 */
(function (root) {
  'use strict';

  // The band is on the RESULT, not on the distance: a plausibility test that
  // needs no knowledge of route lengths. A guess — see the header.
  const BAND = Object.freeze({ min: 1.5, max: 12 });
  // Under 500 km the per-km quotient is noise: ₹45,000 over 12 km is ₹3,750/km
  // and still a lie (screens-money-people.md §1.4).
  const MIN_SPAN_KM = 500;

  const COPY = {
    odoLower:        { en: 'Lower than the last reading, {km} km', hi: '' },
    odoNone:         { en: 'No odometer reading', hi: '' },
    odoNoneNext:     { en: 'Add the reading on the next fill', hi: '' },
    odoBroken:       { en: 'Odometer broken since {date}', hi: '' },
    odoBrokenUndated:{ en: 'Odometer broken', hi: '' },
    odoSame:         { en: 'Same reading as the last fill', hi: '' },
    odoFit:          { en: 'Reading does not fit — {from} km to {to} km on {litres} litres', hi: '' },
    odoFitNoLitres:  { en: 'Reading does not fit — {from} km to {to} km, litres not recorded', hi: '' },
    odoPart:         { en: 'Part fill — mileage at the next full tank', hi: '' },
    // The per-period km rule (money-people §1.4), a different question from
    // "what did this tank return": did the bus travel a distance we can divide by.
    odoSpanBroken:   { en: 'Odometer marked broken on {date}', hi: '' },
    odoSpanBrokenUndated: { en: 'Odometer marked broken', hi: '' },
    odoSpanNone:     { en: 'No readings since {date}', hi: '' },
    odoSpanOne:      { en: 'Only one reading since {date}', hi: '' },
    odoSpanBack:     { en: 'Readings go backwards — {from} km then {to} km', hi: '' },
    odoSpanClose:    { en: 'Readings {km} km apart — too close to divide', hi: '' },
  };
  if (root.W && typeof root.W.register === 'function') root.W.register(COPY);

  // en-IN grouping through Intl: this file must not depend on fmt.js (the three
  // helpers are independent of each other), and a message that names a lakh
  // figure is checked in test_v2_fmt.js.
  function num(v, maxFrac) {
    return Number(v).toLocaleString('en-IN', { maximumFractionDigits: maxFrac || 0 });
  }
  function dayLabel(ts, long) {
    if (ts == null || ts === '') return null;
    const d = new Date(ts);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: long ? 'long' : 'short' });
  }
  function say(id, params) {
    return COPY[id].en.replace(/\{(\w+)\}/g, function (_, k) { return params[k]; });
  }

  // A reading is a number the app can stand behind: finite and above zero.
  // A string "48210" is NOT one — it is exactly the shape a form field hands
  // back before somebody parses it, and guessing its meaning is how a wrong
  // number gets in. Zero is the seeded default AND the broken-instrument value.
  function isReading(v) { return typeof v === 'number' && isFinite(v) && v > 0; }

  function refuse(reason, id, params, next) {
    return { ok: false, reason: reason, message: say(id, params), params: params,
             // `next` is the one step the screen may offer. null means DO NOT ASK.
             next: next ? say(next, {}) : null };
  }

  /* Entry check: is this reading allowed to be saved over the last one?
   *
   * null = fine. Forward-only: a lower reading is never the newer truth, it is
   * a typo, and the message NAMES the number the person has to beat — never
   * "Invalid odometer" (927864c). A blank, a zero or a non-number is not
   * refused here: it means "no reading on this fill" (case 1), and the fill can
   * still be saved without one. Equal is allowed — a bus that has not moved.
   *
   * `atMs` is accepted for the signature the brief fixed and is deliberately not
   * used: whether a reading is lower does not depend on when it was taken, and
   * comparing by time here is how a late-synced old reading would be allowed to
   * overwrite a newer one. */
  function check(prevKm, nextKm, atMs) { // eslint-disable-line no-unused-vars
    if (!isReading(nextKm) || !isReading(prevKm)) return null;
    if (nextKm >= prevKm) return null;
    const params = { km: num(prevKm) };
    return { reason: 'lower', message: say('odoLower', params), params: params, prevKm: prevKm };
  }

  /* Should the screen ask for a reading at all? Not when the instrument is
   * broken (case 2): asking is how a wrong number gets typed. */
  function mayAsk(bus) { return !(bus && bus.odoBroken === true); }

  /* One tank's mileage, full-tank to full-tank (screens-assets.md §3.6).
   *
   *   bus   {odoBroken, odoBrokenAt}
   *   fills [{odometer, litres, cost, full, at}]  in any order
   *
   * Takes the two most recent `full: true` fills. Distance is the later reading
   * minus the earlier. Litres is every fill STRICTLY after the earlier full fill
   * up to and including the later one, so part fills in between are counted —
   * the partial-fill rule. km/l = distance / litres.
   *
   * Returns {ok:true, km, litres, kmpl, fuelCost, costPerKm, fromKm, toKm}
   *      or {ok:false, reason, message, params, next}.
   *
   * A fill with no usable `at` cannot be placed in order, so it is left out of
   * the sequence; a tank that silently included it would be guessing where it
   * went. */
  function mileage(bus, fills) {
    if (bus && bus.odoBroken === true) {
      const when = dayLabel(bus.odoBrokenAt, true);
      // Case 2. `next` is null on purpose: no request for a reading.
      return when ? refuse('broken', 'odoBroken', { date: when }, null)
                  : refuse('broken', 'odoBrokenUndated', {}, null);
    }
    const seq = (fills || []).filter(function (f) {
      return f && !f._deleted && typeof f.at === 'number' && isFinite(f.at);
    }).sort(function (a, b) { return a.at - b.at; });
    const fullIdx = [];
    seq.forEach(function (f, i) { if (f.full === true) fullIdx.push(i); });
    if (fullIdx.length < 2) return refuse('part-fill', 'odoPart', {}, null);          // case 6

    const ie = fullIdx[fullIdx.length - 2], il = fullIdx[fullIdx.length - 1];
    const from = seq[ie].odometer, to = seq[il].odometer;
    if (!isReading(from) || !isReading(to)) {
      return refuse('none', 'odoNone', {}, 'odoNoneNext');                            // case 1
    }
    if (to < from) return refuse('lower', 'odoLower', { km: num(from) }, null);       // case 3
    if (to === from) return refuse('same', 'odoSame', {}, null);                      // case 4

    const dist = to - from;
    let litres = 0, cost = 0, litresKnown = true, costKnown = true;
    for (let i = ie + 1; i <= il; i++) {
      const l = seq[i].litres, c = seq[i].cost;
      if (typeof l === 'number' && isFinite(l) && l >= 0) litres += l; else litresKnown = false;
      if (typeof c === 'number' && isFinite(c) && c >= 0) cost += c; else costKnown = false;
    }
    // Litres we do not hold, or zero of them, is a divisor the app does not
    // believe. It falls in case 5: there is no seventh case in the spec, and the
    // honest thing to show is the two readings so the person can see what to fix.
    if (!litresKnown || !(litres > 0)) {
      return refuse('implausible', 'odoFitNoLitres', { from: num(from), to: num(to) }, null);
    }
    const kmpl = dist / litres;
    if (kmpl < BAND.min || kmpl > BAND.max) {                                         // case 5
      return refuse('implausible', 'odoFit',
                    { from: num(from), to: num(to), litres: num(litres, 1) }, null);
    }
    return { ok: true, km: dist, litres: litres, kmpl: kmpl, fromKm: from, toKm: to,
             fuelCost: costKnown ? cost : null,
             // Diesel cost per km. Null when any cost in the span is missing —
             // a smaller number presented as complete is the failure.
             costPerKm: costKnown ? cost / dist : null };
  }

  /* Order buses by mileage, worst first — and leave out every bus that has no
   * mileage, in BOTH directions (the half of 8db78e7 that was never fixed).
   *
   *   items [{busId, result}]  result is what mileage() returned
   *
   * -> {ranked: [{busId, kmpl, result}], toCheck: [{busId, reason, message,
   *      next}]}. `toCheck` is "Readings to check" and is NOT sorted by anything
   * a reader could mistake for a rank: it keeps the order it came in. */
  function rankMileage(items) {
    const ranked = [], toCheck = [];
    (items || []).forEach(function (it) {
      const r = it && it.result;
      if (r && r.ok === true && typeof r.kmpl === 'number' && isFinite(r.kmpl) && r.kmpl > 0) {
        ranked.push({ busId: it.busId, kmpl: r.kmpl, result: r });
      } else {
        toCheck.push({ busId: it && it.busId,
                       reason: (r && r.reason) || 'none',
                       message: (r && r.message) || say('odoNone', {}),
                       next: (r && r.next) || null });
      }
    });
    ranked.sort(function (a, b) {
      return a.kmpl - b.kmpl || String(a.busId).localeCompare(String(b.busId));
    });
    return { ranked: ranked, toCheck: toCheck };
  }

  /* Distance a bus covered over a period — the denominator of every per-km
   * figure (money-people §1.4). It is a number only when all four hold:
   *   1. the bus is not `odoBroken`;
   *   2. at least TWO readings inside the period, each above zero;
   *   3. the later one is GREATER than the earlier (forward only);
   *   4. the difference is at least 500 km.
   * Otherwise km is null and so is everything downstream of it.
   *
   *   readings [{km, at}]  from fuel.odometer, jobcards.odometer and
   *                        buses.odometer/odometerAt — the caller gathers them
   *   sinceMs, untilMs     the period, inclusive
   *
   * Earliest against latest BY TIME, not min against max: one typo in the
   * middle of the window must not become the distance. */
  function kmOver(bus, readings, sinceMs, untilMs) {
    if (bus && bus.odoBroken === true) {
      const when = dayLabel(bus.odoBrokenAt, false);
      return when ? refuse('broken', 'odoSpanBroken', { date: when }, null)
                  : refuse('broken', 'odoSpanBrokenUndated', {}, null);
    }
    const inWin = (readings || []).filter(function (r) {
      return r && isReading(r.km) && typeof r.at === 'number' && isFinite(r.at) &&
             r.at >= sinceMs && r.at <= untilMs;
    }).sort(function (a, b) { return a.at - b.at; });
    const since = dayLabel(sinceMs, false) || '';
    if (inWin.length === 0) return refuse('none', 'odoSpanNone', { date: since }, null);
    if (inWin.length === 1) return refuse('one', 'odoSpanOne', { date: since }, null);
    const first = inWin[0], last = inWin[inWin.length - 1];
    if (last.km < first.km) {
      return refuse('lower', 'odoSpanBack', { from: num(first.km), to: num(last.km) }, null);
    }
    const dist = last.km - first.km;
    if (dist < MIN_SPAN_KM) return refuse('close', 'odoSpanClose', { km: num(dist) }, null);
    return { ok: true, km: dist, fromKm: first.km, toKm: last.km };
  }

  const api = { check: check, mayAsk: mayAsk, mileage: mileage, rankMileage: rankMileage,
                kmOver: kmOver, BAND: BAND, MIN_SPAN_KM: MIN_SPAN_KM, COPY: COPY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Odo = api;
})(typeof window !== 'undefined' ? window : this);

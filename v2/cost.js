/* Garage Saathi v2 — the one cost basis for a bus.
 *
 * Pure: arrays in, numbers out. No store, no DOM; the clock is an ARGUMENT.
 *
 * THERE IS ONE COST BASIS, AND IT IS COMPUTED HERE. v1 had five per-bus cost
 * lenses — busreport, busacct, the bus detail's "Lifetime repair cost", the
 * money-pit list, history — each with a different basis, and they disagreed, so
 * people stopped reading all of them. Money (#7) and Buses (#5) both READ this
 * and neither recomputes it, because the only arrangement in which two screens
 * cannot disagree is that exactly one of them computes
 * (screens-assets.md §1.2; money-people §1.1).
 *
 * The rule that makes it reconcile: ONE RUPEE, ONE SOURCE RECORD, ONE PART. A
 * part is defined by the records it reads, never by a category somebody typed,
 * so no rupee can land in two parts and none can go missing.
 *
 *   id      part              reads
 *   fuel    Fuel & AdBlue     fuel.cost + def.cost, for this bus, `at` in window
 *   parts   Parts             jobcards.partsUsed line costs, healed from ledger
 *   labour  Labour            jobcards.labourHours x garage.labourRate
 *   outside Outside work      jobcards.externalCost + components.history[].cost
 *                             where type is send-out or return
 *   trip    Trip cash         trips.expenses[].amount, every category
 *   misc    Misc              incidents.cost
 *
 * Deliberately NOT in the total — each would count a rupee twice or change the
 * question: supplier bills (a bill buys stock; the stock is cost when it is
 * ISSUED to a card, so counting both counts it twice), challans (a liability),
 * audit shrinkage (Store's number). `notIn` names them so a screen can say so in
 * one line. `rows.purchases` is accepted and ignored for that reason.
 *
 * THE TOTAL IS WITHHELD, NOT APPROXIMATED. Two ways it is null:
 *   - a part is UNKNOWN (null): its source could not be read, or a record that
 *     must carry money does not. The total is then not "a smaller number" — a
 *     smaller number presented as complete is the failure — it is absent, and
 *     `unknown` names the parts so the screen can say which.
 *   - the parts do not sum to the total. That cannot happen while this file is
 *     right, and it is checked anyway, by a second path, because a total that
 *     disagrees with its parts is exactly how five bases happened. `why` says
 *     'mismatch'. A wrong total is worse than no total.
 * Zero and unknown are different: a part that was read and found nothing is 0
 * with `n: 0`; a part that could not be read is null. `n` is how many records
 * the part counted, so a screen can say "no trips recorded" without the total
 * having to be hidden.
 *
 * What counts as unknown, so the next reader does not have to guess. A field
 * that IS the record — fuel.cost, def.cost, an expense's amount, a part line's
 * cost, a ledger row's price — missing or not a finite number means the part is
 * unknown. A field that is optional by design — labourHours, externalCost, an
 * incident's cost, a send-out (which carries no cost) — absent means nothing
 * was recorded against it, which is 0; present but not a number is unknown. The
 * garage labour rate is needed only if some card in the window has hours: with
 * hours and no rate, labour is unknown, and v1's silent fallback to 250 is not
 * carried over because it invents money.
 *
 * Each part is rounded to the whole rupee BEFORE the total is summed, so what
 * the screen draws adds up exactly: no card of six rounded figures whose sum is
 * a rupee away from the unrounded total's rounding.
 */
(function (root) {
  'use strict';

  const DAY = 86400000;

  const COPY = {
    costFuel:    { en: 'Fuel & AdBlue', hi: '' },
    costParts:   { en: 'Parts', hi: '' },
    costLabour:  { en: 'Labour', hi: '' },
    costOutside: { en: 'Outside work', hi: '' },
    costTrip:    { en: 'Trip cash', hi: '' },
    costMisc:    { en: 'Misc', hi: '' },
  };
  if (root.W && typeof root.W.register === 'function') root.W.register(COPY);

  const PARTS = [['fuel', 'costFuel'], ['parts', 'costParts'], ['labour', 'costLabour'],
                 ['outside', 'costOutside'], ['trip', 'costTrip'], ['misc', 'costMisc']];
  const NOT_IN = ['bills', 'challans', 'shrinkage'];

  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function same(a, b) { return a != null && b != null && String(a) === String(b); }
  // null / undefined = nothing recorded (0); a number is itself; anything else
  // present is not money and the part that read it is unknown.
  function optional(v) { return v == null ? 0 : (isNum(v) ? v : null); }
  function live(r) { return r && !r._deleted; }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(ms) {
    const d = new Date(ms);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  // Accumulator for one part. `unknown` is sticky: one bad record spoils the
  // part, it is never skipped.
  function acc() { return { sum: 0, n: 0, unknown: false }; }
  function add(a, v) { if (v === null) a.unknown = true; else { a.sum += v; a.n++; } }

  function forBus(busId, days, rows, now) {
    if (!isNum(days) || days <= 0) throw new TypeError('Cost.forBus needs a positive number of days');
    if (!isNum(now)) throw new TypeError('Cost.forBus needs `now` as an argument — the module reads no clock');
    rows = rows || {};
    const lo = now - days * DAY, hi = now;
    const loY = ymd(lo), hiY = ymd(hi);
    // true / false / null (cannot be placed in time).
    function inWin(at) { return isNum(at) ? (at >= lo && at <= hi) : null; }

    const A = { fuel: acc(), parts: acc(), labour: acc(), outside: acc(), trip: acc(), misc: acc() };
    const have = function (k) { return Array.isArray(rows[k]); };

    /* Fuel & AdBlue — two stores, and either one missing makes the part unknown. */
    if (!have('fuel') || !have('def')) A.fuel.unknown = true;
    ['fuel', 'def'].forEach(function (k) {
      if (!have(k)) return;
      rows[k].forEach(function (r) {
        if (!live(r) || !same(r.busId, busId)) return;
        const w = inWin(r.at);
        if (w === false) return;
        add(A.fuel, w === null ? null : (isNum(r.cost) ? r.cost : null));
      });
    });

    /* Cards in the window — the denominator of three parts. A card's date is its
     * jobDate, falling back to enter/create time; a card with none cannot be
     * placed, so it spoils Parts, Labour and Outside rather than being guessed. */
    let cards = [];
    if (!have('jobcards')) {
      A.parts.unknown = A.labour.unknown = A.outside.unknown = true;
    } else {
      rows.jobcards.forEach(function (j) {
        if (!live(j) || !same(j.busId, busId)) return;
        let day = typeof j.jobDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(j.jobDate) ? j.jobDate.slice(0, 10) : null;
        if (!day) {
          const t = isNum(j.enterAt) ? j.enterAt : (isNum(j.createdAt) ? j.createdAt : null);
          day = t === null ? null : ymd(t);
        }
        if (day === null) { A.parts.unknown = A.labour.unknown = A.outside.unknown = true; return; }
        if (day >= loY && day <= hiY) cards.push(j);
      });
    }

    /* Parts — the ledger is the record, the card is the copy. reconcileJobParts
     * heals a card from the ledger; this does the same sum without writing, so a
     * card that lost a line to a stale save still counts the part that left the
     * store. A line's `cost` is the LINE TOTAL (v1 writes qty x unit into it),
     * not a unit price. */
    if (!A.parts.unknown && !have('ledger')) A.parts.unknown = true;
    if (!A.parts.unknown) {
      const ids = {};
      cards.forEach(function (j) { ids[String(j.id)] = true; });
      const want = {};                       // jobId -> key -> {qty, cost, unknown}
      rows.ledger.forEach(function (l) {
        if (!live(l) || l.type !== 'out' || l.jobId == null || !ids[String(l.jobId)]) return;
        const qty = Number(l.qty);
        if (!(qty > 0)) return;
        const key = String(l.partId) + '|' + (l.reused ? 'r' : 'n');
        const m = want[l.jobId] || (want[l.jobId] = {});
        const c = m[key] || (m[key] = { qty: 0, cost: 0, unknown: false });
        c.qty += qty;
        // A ledger row older than the price column has no unitCost; v1 falls back
        // to the part's current price. We hold no parts table, so it is unknown —
        // and only matters if the card does not already cover that quantity.
        if (isNum(l.unitCost)) c.cost += qty * l.unitCost; else c.unknown = true;
      });
      cards.forEach(function (j) {
        const got = {};
        (j.partsUsed || []).forEach(function (line) {
          const key = String(line.partId) + '|' + (line.reused ? 'r' : 'n');
          if (!isNum(line.cost) || optional(line.qty) === null) { A.parts.unknown = true; return; }
          const g = got[key] || (got[key] = { qty: 0, cost: 0 });
          g.qty += line.qty == null ? 0 : line.qty; g.cost += line.cost;
          add(A.parts, line.cost);
        });
        const w = want[j.id] || {};
        Object.keys(w).forEach(function (key) {
          const g = got[key] || { qty: 0, cost: 0 };
          if (w[key].qty - g.qty > 1e-9) {          // the ledger saw more leave than the card shows
            if (w[key].unknown) A.parts.unknown = true;
            else add(A.parts, Math.max(0, w[key].cost - g.cost));
          }
        });
      });
    }

    /* Labour — hours on the same cards x the garage rate. */
    if (!A.labour.unknown) {
      let hours = 0, bad = false;
      cards.forEach(function (j) {
        const h = optional(j.labourHours);
        if (h === null) bad = true; else { hours += h; }
        A.labour.n++;
      });
      const rate = rows.garage && rows.garage.labourRate;
      if (bad) A.labour.unknown = true;
      else if (hours === 0) A.labour.sum = 0;
      else if (isNum(rate) && rate > 0) A.labour.sum = hours * rate;
      else A.labour.unknown = true;
    }

    /* Outside work — card externalCost, plus rotables sent out or returned, which
     * carry a cost and no card. */
    if (!A.outside.unknown) {
      cards.forEach(function (j) { add(A.outside, optional(j.externalCost)); });
    }
    if (!have('components')) A.outside.unknown = true;
    else rows.components.forEach(function (c) {
      if (!live(c)) return;
      (c.history || []).forEach(function (h) {
        if (!h || (h.type !== 'send-out' && h.type !== 'return')) return;
        // The entry names its bus when it was written with one; v1's send-out and
        // return entries do not, and then the piece's own bus is the best record.
        if (!same(h.busId != null ? h.busId : c.busId, busId)) return;
        const w = inWin(h.at);
        if (w === false) return;
        add(A.outside, w === null ? null : optional(h.cost));
      });
    });

    /* Trip cash — every expense on this bus's trips, every category, road-side
     * diesel included: that rupee is not in `fuel`, which is the pump log. */
    if (!have('trips')) A.trip.unknown = true;
    else rows.trips.forEach(function (t) {
      if (!live(t) || !same(t.busId, busId)) return;
      const w = inWin(t.startedAt);
      if (w === false) return;
      if (w === null) { A.trip.unknown = true; return; }
      (t.expenses || []).forEach(function (e) { add(A.trip, e && isNum(e.amount) ? e.amount : null); });
    });

    /* Misc — damage the business paid for that never became a card. */
    if (!have('incidents')) A.misc.unknown = true;
    else rows.incidents.forEach(function (i) {
      if (!live(i) || !same(i.busId, busId)) return;
      const w = inWin(i.at);
      if (w === false) return;
      add(A.misc, w === null ? null : optional(i.cost));
    });

    // Assemble. Round each part, then sum the ROUNDED parts.
    const parts = PARTS.map(function (p) {
      const a = A[p[0]];
      return { id: p[0], label: COPY[p[1]].en, value: a.unknown ? null : Math.round(a.sum), n: a.n };
    });
    const unknown = parts.filter(function (p) { return p.value === null; }).map(function (p) { return p.id; });

    let total = null, why = null;
    if (unknown.length) {
      why = 'unknown';
    } else {
      let t = 0;
      for (let i = 0; i < parts.length; i++) t += parts[i].value;
      total = t;
    }
    const out = { busId: busId, days: days, from: lo, to: hi, total: total, parts: parts,
                  unknown: unknown, why: why, notIn: NOT_IN.slice() };
    // The second path. If a future edit lets the parts and the total drift, the
    // total is withheld here, not drawn.
    if (total !== null && !reconciles(out)) { out.total = null; out.why = 'mismatch'; }
    return out;
  }

  /* Do the parts add up to the total, to the rupee? A screen re-asks this
   * before drawing the hero: if it is false, the hero is `figure(null)` and an
   * errorState, not a number. A null total never reconciles. */
  function reconciles(result) {
    if (!result || !isNum(result.total) || !Array.isArray(result.parts)) return false;
    return result.parts.reduce(function (s, p) {
      return s + (isNum(p.value) ? p.value : NaN);
    }, 0) === result.total;
  }

  /* Cost per km — a division, and so the place 8db78e7 lived. Never a seventh
   * part and never a basis of its own: it is the total over a km the caller got
   * from Odo.kmOver. Both must be real; neither is defaulted.
   *   entries [{busId, total, km}]   total is Cost.forBus().total, km is
   *                                  Odo.kmOver().km — either may be null
   * -> {ranked: [{busId, total, km, perKm}] highest first,
   *     excluded: [{busId, reason}]}   reason 'no-km' | 'no-total'
   *
   * A bus whose figure cannot be computed is not ranked at all — not at zero
   * (the bottom) and not as the quotient of a missing divisor (the top). */
  function usable(e) {
    const hasTotal = isNum(e.total) && e.total >= 0;
    const hasKm = isNum(e.km) && e.km > 0;
    return { hasTotal: hasTotal, hasKm: hasKm, ok: hasTotal && hasKm };
  }
  function rankPerKm(entries) {
    const ranked = [], excluded = [];
    (entries || []).forEach(function (e) {
      const u = usable(e);
      if (u.ok) ranked.push({ busId: e.busId, total: e.total, km: e.km, perKm: e.total / e.km });
      else excluded.push({ busId: e.busId, reason: u.hasKm ? 'no-total' : 'no-km' });
    });
    ranked.sort(function (a, b) {
      return b.perKm - a.perKm || String(a.busId).localeCompare(String(b.busId));
    });
    return { ranked: ranked, excluded: excluded };
  }

  /* The fleet's cost per km: only the rupees AND the km of buses that have both.
   * Dividing every bus's rupees by only the km that exist would be the
   * 8db78e7 error in aggregate — an excluded bus's money inflating the figure. */
  function fleetPerKm(entries) {
    let total = 0, km = 0, buses = 0, excluded = 0;
    (entries || []).forEach(function (e) {
      if (usable(e).ok) { total += e.total; km += e.km; buses++; } else excluded++;
    });
    return { perKm: km > 0 ? total / km : null, total: total, km: km, buses: buses, excluded: excluded };
  }

  const api = { forBus: forBus, reconciles: reconciles, rankPerKm: rankPerKm,
                fleetPerKm: fleetPerKm, COPY: COPY, NOT_IN: NOT_IN };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Cost = api;
})(typeof window !== 'undefined' ? window : this);

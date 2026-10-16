/* Garage Saathi — trace a redBus review (or complaint) to the bus and crew.
 *
 * A review says: PNR, redBus route id, the time the passenger boarded, stars.
 * It never says which bus or which people. Three sources can, and they are
 * kept apart so a disagreement shows instead of being averaged away:
 *
 *   gate   — the driver's gate check for that service that night (selfie, at the bus)
 *   redpro — redBus's own vehicle/driver assignment, snapshotted by the office collector
 *   its    — the bus the ITS reservation system ran that PNR on (fallback, step 3)
 *
 * Crew always come from Garage Saathi's own records: the gate check's driver and
 * the dated duty log. A driver NAME typed into redPro is shown, never matched —
 * two "Mahi Pal"s are two different men (see CREW_BANK.md).
 *
 * Pure functions only, so they run in the app and under node for the tests.
 */
(function (root) {
  'use strict';

  const H = 3600 * 1000;
  // A passenger can board many hours after the service left its origin
  // (Varanasi → Jaipur is a 20-hour run), so look back this far for the departure.
  const LOOKBACK = 30 * H;

  // "2026-10-07 06:15:00" (IST wall clock) → epoch ms. The app runs in IST.
  function parseLocal(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(s || ''));
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)).getTime();
  }
  const dayKey = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const normReg = (s) => {
    // Same rule as the server's norm_reg: MP44ZD471 and MP44ZD0471 are one bus.
    const r = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const m = /^([A-Z]{2})(\d{1,2})([A-Z]{1,3})(\d{1,4})$/.exec(r);
    return m ? m[1] + m[2].padStart(2, '0') + m[3] + m[4].padStart(4, '0') : r;
  };

  // A driver name as redPro has it typed ("Kesar Dvr", "Jitu Ji"), reduced to a stable key:
  // lower case, letters and digits only, single spaces. Nothing is dropped, so "Mukesh" and
  // "Mukesh Sharma" stay different keys. The server builds the same key (_alias_id in sync_server.py).
  const normName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  // One confirmed answer per typed name per bus: the same name on another bus may be another man.
  const aliasId = (name, reg) => `al-${normReg(reg)}-${normName(name).replace(/ /g, '_')}`;
  // Words that say nothing about who someone is, ignored only when suggesting a match.
  const FILLER = new Set(['dvr', 'driver', 'drv', 'ji', 'bhai', 'sahab', 'saab', 'sir', 'staff', 'stf', 'bus', 'flix', 'conductor', 'cond', 'khalasi', 'helper']);
  const nameTokens = (s) => normName(s).split(' ').filter((w) => w && !FILLER.has(w) && !/^\d+$/.test(w));
  // 0..1: how alike two names look, for ordering suggestions only. Never used to decide.
  function nameLike(a, b) {
    const x = nameTokens(a), y = nameTokens(b);
    if (!x.length || !y.length) return 0;
    let hit = 0;
    for (const w of x) if (y.some((v) => v === w || (w.length >= 4 && v.length >= 4 && (v.startsWith(w) || w.startsWith(v))))) hit++;
    return hit / Math.max(x.length, y.length);
  }
  // A typed name that names nobody.
  const isGenericName = (s) => !nameTokens(s).length;

  // routeId → serviceId, from the collector's service list (each service has many routes).
  function routeIndex(services) {
    const ix = new Map();
    for (const s of services || []) for (const r of s.routeIds || []) ix.set(String(r), String(s.id));
    return ix;
  }

  // The departure of `service` that a passenger boarding at `boardAt` was on:
  // the latest start at its HH:MM that is not after boarding and within LOOKBACK.
  // Without a known start time, null (callers fall back to the whole window).
  function departureFor(service, boardAt) {
    const m = /^(\d{1,2}):(\d{2})/.exec((service && service.startTime) || '');
    if (!m || boardAt == null) return null;
    const d = new Date(boardAt);
    let dep = new Date(d.getFullYear(), d.getMonth(), d.getDate(), +m[1], +m[2]).getTime();
    while (dep > boardAt) dep -= 24 * H;
    return boardAt - dep <= LOOKBACK ? dep : null;
  }

  // The window in which this trip's gate check / assignment must fall.
  function tripWindow(dep, boardAt) {
    if (dep != null) return { from: dep - 6 * H, to: dep + 3 * H };
    return { from: boardAt - LOOKBACK, to: boardAt };
  }

  function fromGate(checks, serviceId, win) {
    const hits = (checks || []).filter((c) => c && !c._deleted && String(c.serviceId || '') === serviceId
      && c.startedAt >= win.from && c.startedAt <= win.to);
    if (!hits.length) return null;
    // A re-check after a hold is the same departure: the newest check wins.
    const c = hits.sort((a, b) => b.startedAt - a.startedAt)[0];
    return { busId: c.busId, regNo: c.regNo, at: c.startedAt, checkId: c.id, driverId: c.driverId, status: c.status };
  }

  function fromRedpro(assign, serviceId, win) {
    const days = new Set([dayKey(win.from), dayKey(win.to)]);
    const rows = (assign || []).filter((a) => a && String(a.serviceId) === serviceId && days.has(a.date));
    const obs = [];
    for (const a of rows) for (const o of a.obs || []) if (o.vehicleNo && o.at >= win.from - 12 * H && o.at <= win.to + 12 * H) obs.push(o);
    if (!obs.length) return null;
    // The observation closest to the departure is what redBus believed for this run.
    const mid = (win.from + win.to) / 2;
    const o = obs.sort((x, y) => Math.abs(x.at - mid) - Math.abs(y.at - mid))[0];
    const distinct = new Set(obs.map((x) => normReg(x.vehicleNo)));
    return { regNo: o.vehicleNo, driver1: o.driver1 || '', driver2: o.driver2 || '', cro: o.cro || '', at: o.at, changed: distinct.size > 1 };
  }

  /* Resolve one review/complaint.
   *   item:  { pnr, routeId, serviceId?, boardAt (ms) }
   *   ctx:   { services, routeIx?, gatechecks, assign, its: {pnr: {regNo}}, buses, crewAt(busId, at) → [{crewId,name,role}] }
   * Returns { serviceId, dep, bus, crew, sources, agree, confidence, why }.
   */
  function resolve(item, ctx) {
    const out = { serviceId: null, dep: null, bus: null, crew: [], sources: { gate: null, redpro: null, its: null }, agree: null, confidence: 'none', why: '' };
    const ix = ctx.routeIx || routeIndex(ctx.services);
    const serviceId = item.serviceId ? String(item.serviceId) : ix.get(String(item.routeId || '')) || null;
    out.serviceId = serviceId;
    const busByReg = new Map((ctx.buses || []).map((b) => [normReg(b.regNo), b]));

    if (serviceId && item.boardAt != null) {
      const svc = (ctx.services || []).find((s) => String(s.id) === serviceId);
      out.dep = departureFor(svc, item.boardAt);
      const win = tripWindow(out.dep, item.boardAt);
      out.sources.gate = fromGate(ctx.gatechecks, serviceId, win);
      out.sources.redpro = fromRedpro(ctx.assign, serviceId, win);
    }
    const its = item.pnr && ctx.its ? ctx.its[String(item.pnr)] : null;
    // ITS gives the driver (matched by phone) and, through our duty log, that driver's bus then.
    if (its && (its.regNo || its.crewId)) out.sources.its = { regNo: its.regNo || '', crewId: its.crewId || null, at: its.at || null };

    // Each source's answer as a bus key, so they can be compared.
    const keyOf = (s) => (s ? normReg(s.regNo) : null);
    const g = keyOf(out.sources.gate), r = keyOf(out.sources.redpro), i = out.sources.its && out.sources.its.regNo ? keyOf(out.sources.its) : null;
    const answers = [g, r, i].filter(Boolean);
    if (!answers.length && out.sources.its && out.sources.its.crewId) {
      // ITS knows who drove but our records do not say which bus they were on: the driver is still known.
      out.crew = [{ crewId: out.sources.its.crewId, role: 'driver', via: 'its', vias: ['its'] }];
      out.confidence = 'medium'; out.why = 'its-driver';
      return out;
    }
    if (!answers.length) {
      out.why = !serviceId ? 'service-unknown' : item.boardAt == null ? 'no-time' : 'no-source';
      return out;
    }
    out.agree = answers.every((a) => a === answers[0]);
    // Gate check outranks redPro, which outranks ITS — but a disagreement is never hidden.
    const pick = g || r || i;
    const bus = busByReg.get(pick) || null;
    out.bus = { regNo: (out.sources.gate || out.sources.redpro || out.sources.its).regNo, busId: bus ? bus.id : (out.sources.gate ? out.sources.gate.busId : null) };
    out.confidence = !out.agree ? 'conflict' : g ? 'high' : 'medium';
    out.why = !out.agree ? 'sources-disagree' : g ? 'gate-check' : r ? 'redpro-assignment' : 'its';

    // Crew from our own records only.
    const at = out.sources.gate ? out.sources.gate.at : out.dep != null ? out.dep : item.boardAt;
    if (out.bus.busId && typeof ctx.crewAt === 'function') out.crew = ctx.crewAt(out.bus.busId, at) || [];
    out.crew = out.crew.map((c) => Object.assign({ via: 'duty', vias: ['duty'] }, c));
    const add = (crewId, role, via) => {
      const have = out.crew.find((c) => c.crewId === crewId);
      if (have) { if (!have.vias.includes(via)) have.vias.push(via); return; }
      const entry = { crewId, role, via, vias: [via] };
      if (via === 'gate') out.crew.unshift(entry); else out.crew.push(entry);
    };
    if (out.sources.gate && out.sources.gate.driverId) add(out.sources.gate.driverId, 'driver', 'gate');
    // ITS's driver (by phone) for this PNR, when ITS's bus is the bus shown or ITS gave no bus.
    if (out.sources.its && out.sources.its.crewId && (!i || i === normReg(out.bus.regNo))) add(out.sources.its.crewId, 'driver', 'its');
    // redBus's own assignment names who drove; a name the office confirmed once for this bus is
    // that person. Only when redBus's bus is the bus shown, and never an unconfirmed name.
    const rp = out.sources.redpro;
    if (rp && typeof ctx.aliasCrew === 'function' && normReg(rp.regNo) === normReg(out.bus.regNo)) {
      for (const [name, role] of [[rp.driver1, 'driver'], [rp.driver2, 'driver'], [rp.cro, 'conductor']]) {
        const id = name ? ctx.aliasCrew(name, rp.regNo) : null;
        if (id) add(id, role, 'redpro');
      }
    }
    return out;
  }

  // Sort a review into FAQ / genuine / safety from redBus's own tags and the text.
  // Safety is gated on a hard signal, the same rule as the Passenger Issue Desk:
  // stacked service gripes never make a review "safety".
  const SAFETY_RX = /drunk|alcohol|rash|accident|collid|hit (a|the)|overspeed|speeding|unsafe|molest|harass|misbehav|abus|threat|police|stranded|left (us|me) on/i;
  const FAQ_RX = /refund|cancel(l)?ation (policy|charge)|boarding point (change|address)|where (is|was) the bus|bus number|contact number|reschedul/i;
  function classify(r) {
    const text = `${(r.comment || '')} ${(r.tags || []).join(' ')} ${r.issue || ''}`;
    if (SAFETY_RX.test(text)) return 'safety';
    if ((r.stars || 5) >= 4 && !r.issue) return 'praise';
    if (FAQ_RX.test(text) && !(r.tags || []).length) return 'faq';
    return 'genuine';
  }

  const api = { parseLocal, dayKey, normReg, normName, aliasId, nameLike, isGenericName, routeIndex, departureFor, tripWindow, resolve, classify, LOOKBACK };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Trace = api;
})(typeof window !== 'undefined' ? window : this);

/* Mahalaxmi redPro Sync — the logic, kept free of Chrome APIs so node can test it (test_lib.js).
 *
 * What a sync sends is decided here: every row is rebuilt from an allow-list of fields, so a
 * passenger's name, phone or e-mail, and a redBus agent's name, never leave the browser.
 * Garage Saathi rebuilds the rows from its own allow-list again (sync_server.py _clean_*).
 */
(function (root) {
  'use strict';

  const OPERATOR_ID = '5269';
  const s = (v, n = 200) => (typeof v === 'string' ? v.trim().slice(0, n) : v == null ? '' : String(v).slice(0, n));

  function mapReview(r) {
    const rd = r.ratingData || {}, rv = r.reviewData || {}, op = rv.opReply || {};
    const st = r.reviewStatus;
    return {
      reviewId: s(r.reviewId || r.tin, 60), tin: s(r.tin, 40), pnr: s(r.pnr, 30), routeId: s(r.routeId, 30),
      source: s(r.sourceLocation, 80), dest: s(r.destinationLocation, 80), boardAt: s(r.dojInLocal, 25),
      fare: s(r.finalFare, 20), seats: (r.seatName || []).map((x) => s(x, 10)).slice(0, 12),
      stars: typeof rd.value === 'number' ? rd.value : null, submittedOn: s(rd.submittedOn, 25),
      comment: s(rv.userComment, 2000), tags: (rv.tags || []).map((x) => s(x, 60)).slice(0, 12),
      reviewStatus: s(typeof st === 'string' ? st : (st || {}).status, 30), replied: !!(op.reply || rv.operatorReply),
    };
  }

  function mapComplaint(c) {
    const notes = (c.caseComment || []).filter((n) => n && (n.comment || n.custComment))
      .map((n) => ({ at: s(n.createdTime, 25), text: s(n.comment || n.custComment, 1000) })).slice(0, 30);
    return {
      caseNumber: s(c.caseNumber, 40), pnr: s(c.pnr, 30), doj: s(c.doj, 25), createdAt: s(c.createdDateTime, 25),
      status: s(c.status, 40), issue: s(c.subIssueType || c.issueType, 200), source: s(c.source, 80),
      dest: s(c.destination, 80), amount: s(c.ticketAmount, 30), seats: Number.isInteger(c.noOfSeats) ? c.noOfSeats : null,
      resolution: s(c.instantRefund, 200), refundStatus: s(c.expRefundStatus, 80), notes,
    };
  }

  // Driver and conductor NAMES are what redBus believes; Garage Saathi shows them, never matches on
  // them. Their phone numbers are not sent.
  function mapAssignment(a) {
    return {
      serviceId: s(a.serviceID, 30), serviceNo: s(a.serviceNo, 80), origin: s(a.originCity, 80), dest: s(a.destCity, 80),
      startTime: s(a.startTime, 8), vehicleNo: s(a.vehicleNo, 20), driver1: s(a.driver1Name, 60),
      driver2: s(a.driver2Name, 60), cro: s(a.croName, 60), isRunning: a.isRunning !== false,
    };
  }

  // redPro's ratings-by-service answer → [{serviceId, routeIds, label, startTime}]. Its exact shape was
  // not seen yet, so it walks the JSON for any object with a service id and route ids under it.
  const SID = /^(service_?id|serviceid|sid)$/i, RID = /^(route_?id|routeid|rid)$/i;
  const ROUTE_LISTS = ['routeids', 'route_ids', 'routes', 'routelist', 'route_list'];
  const TIME_LABEL = /^\s*(\d{1,2}):(\d{2})\s*,/;
  const digits = (v) => (typeof v === 'number' || typeof v === 'string') && /^\d+$/.test(String(v));
  function parseServicewise(resp) {
    const out = new Map();
    const routeIds = (o, acc) => {
      if (Array.isArray(o)) { o.forEach((x) => routeIds(x, acc)); return; }
      if (!o || typeof o !== 'object') return;
      for (const [k, v] of Object.entries(o)) {
        if (RID.test(k) && digits(v)) acc.add(String(v));
        else if (ROUTE_LISTS.includes(k.toLowerCase()) && Array.isArray(v)) v.forEach((x) => (digits(x) ? acc.add(String(x)) : routeIds(x, acc)));
        else routeIds(v, acc);
      }
    };
    const walk = (o) => {
      if (Array.isArray(o)) { o.forEach(walk); return; }
      if (!o || typeof o !== 'object') return;
      const sidEntry = Object.entries(o).find(([k, v]) => SID.test(k) && digits(v));
      if (sidEntry) {
        const sid = String(sidEntry[1]);
        const acc = new Set();
        routeIds(Object.fromEntries(Object.entries(o).filter(([k]) => !SID.test(k))), acc);
        const label = (Object.values(o).find((v) => typeof v === 'string' && TIME_LABEL.test(v)) || '').slice(0, 120);
        const m = TIME_LABEL.exec(label);
        const row = out.get(sid) || { serviceId: sid, routeIds: new Set(), label, startTime: m ? `${m[1].padStart(2, '0')}:${m[2]}` : '' };
        acc.forEach((x) => row.routeIds.add(x));
        out.set(sid, row);
      }
      Object.values(o).forEach(walk);
    };
    walk(resp);
    return [...out.values()].map((r) => Object.assign({}, r, { routeIds: [...r.routeIds].sort() })).filter((r) => r.routeIds.length || r.label);
  }

  // ---- timetable (IST wall clock; the office laptop runs in IST) ----
  const SLOTS = { reviews: ['06:15', '18:15'], complaints: ['07:30', '13:30', '19:30'], services: ['05:30'] };
  const CATCH_UP_MS = 6 * 3600 * 1000;
  const ASSIGN_EVERY_MS = 55 * 60 * 1000;
  const QUIET = [2, 5];   // no hourly assignment reads 02:00–05:00
  const JOBS = ['services', 'assignments', 'reviews', 'complaints'];

  function due(job, now, state) {
    const last = (state[job] || {}).last || null;      // epoch ms
    const d = new Date(now);
    if (job === 'assignments') {
      if (d.getHours() >= QUIET[0] && d.getHours() < QUIET[1]) return false;
      return !last || now - last >= ASSIGN_EVERY_MS;
    }
    if (!last) return true;
    return SLOTS[job].some((hm) => {
      const [h, m] = hm.split(':').map(Number);
      let slot = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).getTime();
      if (slot > now) slot -= 24 * 3600 * 1000;
      return last < slot && now - slot <= CATCH_UP_MS;
    });
  }

  // Dates of journey for a reviews run: 45 days the first time, then 14 in the morning slot, 3 in the evening.
  function reviewWindow(now, state) {
    const days = !(state.reviews || {}).last ? 45 : new Date(now).getHours() < 12 ? 14 : 3;
    const ymd = (t) => { const x = new Date(t); return Number(`${x.getFullYear()}${String(x.getMonth() + 1).padStart(2, '0')}${String(x.getDate()).padStart(2, '0')}`); };
    return { start: ymd(now - days * 86400000), end: ymd(now), days };
  }

  function reviewsBody(win) {
    return { filterBy: { operatorId: OPERATOR_ID, startDateInLong: win.start, endDateInLong: win.end, country: 'IND', status: 'all' },
      sortBy: { doj: true }, orderBy: { order: 'DESC' }, countValue: true };
  }

  // Badge: what the office sees on the extension icon.
  function badge(state, now) {
    if (state.problem) return { text: '!', color: '#B93124', title: state.problem };
    const a = (state.assignments || {}).last;
    if (!a) return { text: '…', color: '#655E52', title: 'Not synced yet' };
    const stale = now - a > 3 * 3600 * 1000 && !(new Date(now).getHours() >= QUIET[0] && new Date(now).getHours() < QUIET[1] + 1);
    const t = new Date(a);
    return { text: stale ? 'OLD' : 'OK', color: stale ? '#8A5806' : '#1A7443',
      title: `Last sync ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}` };
  }

  const api = { OPERATOR_ID, mapReview, mapComplaint, mapAssignment, parseServicewise, due, reviewWindow, reviewsBody, badge, JOBS, SLOTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RP = api;
})(typeof self !== 'undefined' ? self : this);

/* Garage Saathi — the dated duty log.
 *
 * The duty board answers "who is on this bus now". A redBus review, a complaint
 * or a challan asks "who was on this bus on the 21st", and the board cannot
 * answer that: an assignment is one field on the crew record, and each change
 * overwrote the last. This log is the history. One row per seat change, never
 * edited and never deleted (the server refuses both).
 *
 * A row says: from `at`, crew member `crewId` sits in seat `role` on `busId`
 * (null = on no bus). Whoever held a seat at a moment is found by replaying
 * each crew member's latest row at or before it.
 *
 * Pure functions only, so they run in the app and under node for the tests.
 */
(function (root) {
  'use strict';

  const DUTY_REASONS = ['baseline', 'assign', 'seat-taken', 'joined', 'left', 'archived', 'restored', 'rejoined'];

  function dutyRow({ crew, busId, at, reason, by, regNo }) {
    const role = crew && crew.crewRole === 'conductor' ? 'conductor' : 'driver';
    return {
      id: 'dl-' + at.toString(36) + '-' + crew.id + '-' + Math.random().toString(36).slice(2, 6),
      at,
      crewId: crew.id,
      // Snapshots, so the row still reads correctly after a rename or a bus is retired.
      // Lookups always go by id: crew are never matched by name.
      crewName: crew.name || '',
      role,
      busId: busId || null,
      regNo: busId ? (regNo || '') : '',
      reason: DUTY_REASONS.includes(reason) ? reason : 'assign',
      by: by || null,
      updatedAt: at,
    };
  }

  // The baseline id is fixed per crew member, so two phones that both write one
  // produce the same record and not two competing histories.
  function baselineRow({ crew, busId, at, by, regNo }) {
    const r = dutyRow({ crew, busId, at, reason: 'baseline', by, regNo });
    r.id = 'dl-base-' + crew.id;
    return r;
  }

  const _live = (log) => (log || []).filter((r) => r && !r._deleted && r.crewId && typeof r.at === 'number');

  // Rows for one crew member, oldest first. Ties keep a stable order by id.
  function timelineOf(log, crewId) {
    return _live(log).filter((r) => r.crewId === crewId)
      .sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  // Where each crew member was at moment `t`: Map crewId -> row in force.
  function stateAt(log, t) {
    const out = new Map();
    for (const r of _live(log)) {
      if (r.at > t) continue;
      const cur = out.get(r.crewId);
      if (!cur || r.at > cur.at || (r.at === cur.at && r.id > cur.id)) out.set(r.crewId, r);
    }
    return out;
  }

  // Who sat in `role` on `busId` at any point in [from, to).
  // Returns [{ crewId, crewName, role, since, until }] with since/until clipped
  // to the window, in the order they held the seat. An empty list means the
  // log knows nobody was there — or knows nothing yet (check `coveredFrom`).
  function seatHoldersDuring(log, busId, role, from, to) {
    const rows = _live(log);
    const ids = [...new Set(rows.map((r) => r.crewId))];
    const out = [];
    for (const id of ids) {
      const tl = timelineOf(rows, id);
      for (let i = 0; i < tl.length; i++) {
        const r = tl[i];
        if (r.busId !== busId || r.role !== role) continue;
        const start = r.at, end = i + 1 < tl.length ? tl[i + 1].at : Infinity;
        if (end <= from || start >= to) continue;
        out.push({ crewId: id, crewName: r.crewName, role, since: Math.max(start, from), until: Math.min(end, to) });
      }
    }
    return out.sort((a, b) => a.since - b.since);
  }

  // The earliest moment the log can speak for: before the first row, an empty
  // answer means "not recorded", never "nobody was on the bus".
  function coveredFrom(log) {
    const rows = _live(log);
    return rows.length ? Math.min(...rows.map((r) => r.at)) : null;
  }

  // Crew whose current seat the log does not know yet: they need a baseline row.
  // `effectiveBus(d)` is the bus the crew member actually holds (null if off duty).
  function missingBaselines(log, crew, effectiveBus) {
    const now = stateAt(log, Infinity);
    return (crew || []).filter((d) => {
      const bus = effectiveBus(d);
      const r = now.get(d.id);
      return r ? false : !!bus;
    });
  }

  /* A bus has two driver seats (night and long routes carry a relief driver)
   * and one conductor seat. Returns [seat1, seat2] for `busId` from a list of
   * active drivers, plus `overflow` for any third or later driver.
   *
   * Records carry `driverSlot` once someone is placed through the seat picker.
   * Older records have none: they fill the free seats in id order, which maps
   * the imported `u-drv-<REG>-0` / `-1` ids to seat 1 / seat 2. If two records
   * claim the same seat, the lower id keeps it and the other is re-placed. */
  function driverSeats(drivers, busId) {
    const on = (drivers || []).filter((d) => d && d.busId === busId)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const seats = [null, null], loose = [];
    for (const d of on) {
      const s = d.driverSlot === 1 || d.driverSlot === 2 ? d.driverSlot : 0;
      if (s && !seats[s - 1]) seats[s - 1] = d; else loose.push(d);
    }
    const overflow = [];
    for (const d of loose) {
      const free = seats.indexOf(null);
      if (free === -1) overflow.push(d); else seats[free] = d;
    }
    seats.overflow = overflow;
    return seats;
  }

  const api = { DUTY_REASONS, driverSeats, dutyRow, baselineRow, timelineOf, stateAt, seatHoldersDuring, coveredFrom, missingBaselines };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Duty = api;
})(typeof window !== 'undefined' ? window : this);

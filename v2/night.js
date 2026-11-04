/* Garage Saathi v2 — tonight's running list.
 *
 * The office keeps tonight's list in a register on paper and the app has no
 * schedule at all, which is why the duty board could count buses that never
 * needed a driver ("the duty board counts buses that need a driver, not every
 * bus in the yard", ba274f6). A count that cannot reach zero teaches people to
 * scroll past red, so the record that lets it reach zero is this one: which
 * buses run tonight, decided once per night, before the seats are filled.
 *
 * One record per night, `nl-<YYYY-MM-DD>` (contract §5). It is a new store, and
 * that is the whole reason it is safe: a v1 device discards a pulled record
 * whose store it does not know (sync.js:1040), markDirty returns early for an
 * unknown store so v1 can never push it (sync.js:677), and v1's onupgradeneeded
 * never creates the object store at all. Everything else was worse for a reason
 * that is a property of the system rather than a preference — a field on `buses`
 * is erased the next time any v1 device writes that bus, `dutylog` needs crew
 * AND seat AND a real time and is immutable, `meta` syncs one row a crewmanager
 * may not write, and deriving the list from filled seats is circular because the
 * list exists to say which seats are still empty.
 *
 * Two things here are decisions, not details:
 *
 *  - `buses` is a MAP keyed by bus id, not a list of the ones running. A list can
 *    only be unioned under merge, so a bus ticked by mistake could never be
 *    un-ticked and the count could never reach zero — the one thing this record
 *    exists to make possible. Per-bus entries give last-write-wins per bus: no
 *    tick is lost and a tick can be taken back.
 *
 *  - each entry's `at` is stamped by the SERVER, never here. setRunning sends the
 *    entry with no timestamp and _guard_write stamps `at` from server time and
 *    `by` from the token, exactly as attendance.receivedAt, dutylog.by and
 *    gatechecks.decision.at are stamped today (contract §4.4, strategy S). That
 *    is what makes per-bus ordering independent of the device clock, and it is
 *    why a new store is safer here than a field on an existing one: a phone set
 *    forward cannot win every tick and a phone set back cannot lose every one.
 *    A client stamp would pass every test that did not look for it, so
 *    test_v2_night.js looks — on the pushed payload, not on the stored record.
 *
 * And `running:false` is a real state, NOT the same as absent. Absent means
 * nobody has decided about that bus tonight; false means somebody said it does
 * not run. Unknown and no must never look alike (v2-foundation-ui.md §3.6), and
 * ux §7 measures 5 and 6 read this record against `dutylog` and
 * `gatechecks._byRole`, so a `false` has to be queryable rather than inferred
 * from silence. That is what undecided() is for.
 *
 * Written by screen #9 (Duty board); read by #9 and by #13 (Gate round), which
 * needs to know which buses it is still waiting on (DECISIONS.md §15).
 */
(function (root) {
  'use strict';

  const STORE = 'nightlist';

  /* IST is UTC+5:30, as a fixed offset rather than a timezone lookup — the same
   * arithmetic sync_server.py's _ist_day does. It has to be the same, because
   * _guard_write refuses a record whose `date` is not the id's suffix, and a
   * device left on another timezone would otherwise file its ticks under a night
   * the office does not recognise. */
  const IST_MS = 19800000;

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  /* The night's key. `d` is a Date or an epoch; omitted means now. */
  function dayKey(d) {
    const ms = d == null ? Date.now() : (d instanceof Date ? d.getTime() : Number(d));
    return new Date(ms + IST_MS).toISOString().slice(0, 10);
  }

  // Stable per night, and derived from the date ALONE: two people opening the
  // board tonight must write one record and not two competing ones (03 §9.25).
  // Nothing about the device or the person may enter it.
  const idFor = (date) => 'nl-' + date;

  /* The data layer, resolved at call time rather than captured at load.
   *
   * v2/db.js declares `DB` as a top-level const in a classic script, so it is a
   * global lexical binding the browser hands us; under node the test installs
   * its own. Looked up per call so neither load order nor a test's fake has to
   * be arranged before this file is read. */
  function db() {
    if (typeof DB !== 'undefined' && DB) return DB;
    if (root && root.DB) return root.DB;
    throw new Error('night.js needs v2/db.js (DB) — not loaded');
  }

  /* Tonight's record, or null.
   *
   * null is "nobody has decided yet", and it is NOT "no buses run tonight". The
   * two must never be drawn the same way; a screen that collapses them is the
   * defect this store was shaped to avoid. */
  async function get(date) {
    return (await db().get(STORE, idFor(date))) || null;
  }

  /* Tick, or un-tick, exactly one bus.
   *
   * Every other bus's entry is copied through byte-for-byte, server stamps and
   * all. That is not tidiness: this write is whole-record on the wire, so if it
   * rewrote the other entries it would be clobbering ticks the server had
   * already ordered, and the server's per-bus merge would have nothing left to
   * merge. One key changes per call.
   *
   * The changed entry carries `running` and NOTHING else — no `at`, no `by`. The
   * server stamps both; see the header. */
  async function setRunning(date, busId, on) {
    if (!DATE_RE.test(String(date))) throw new Error('nightlist: date must be YYYY-MM-DD, got ' + date);
    const id = idFor(date);
    const cur = await db().get(STORE, id);
    const prev = (cur && cur.buses) || {};
    const buses = {};
    for (const k of Object.keys(prev)) buses[k] = prev[k];
    buses[String(busId)] = { running: !!on };
    return db().put(STORE, {
      id: id,
      date: date,                                  // _guard_write checks it against the id
      buses: buses,
      createdAt: (cur && cur.createdAt) || Date.now(),
      // updatedAt is DB.put's, and it is the record's, not an entry's: it orders
      // nothing per bus. Per-bus ordering is the server's `at`.
    });
  }

  /* The buses running tonight.
   *
   * `=== true` on purpose. A `running:false` entry and a bus nobody has decided
   * about are both "not running", and neither may be counted — but they are not
   * the same thing, which is what undecided() answers. */
  async function running(date) {
    const rec = await get(date);
    const buses = (rec && rec.buses) || {};
    return Object.keys(buses).filter((b) => buses[b] && buses[b].running === true);
  }

  /* The honest third state: buses with no entry at all tonight.
   *
   * A `running:false` is NOT undecided — somebody said that bus does not run,
   * and the board must stop asking about it. Only silence counts here. */
  async function undecided(date, allBusIds) {
    const rec = await get(date);
    const buses = (rec && rec.buses) || {};
    return (allBusIds || []).filter((b) => !Object.prototype.hasOwnProperty.call(buses, String(b)));
  }

  const api = { dayKey: dayKey, get: get, setRunning: setRunning,
                running: running, undecided: undecided };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Night = api;
})(typeof window !== 'undefined' ? window : this);

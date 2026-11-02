/* Which pulled records win over the copy already on the device.
 *
 * This was a loop inside sync.js's pullPage(), and it did two awaited IndexedDB
 * operations per record: a get to compare timestamps, then a put. At 600 records
 * a page that is 1,200 serialised transactions, and a fleet-sized first sync is
 * 135 pages -- measured at 277ms per page against 54ms for the same work done as
 * one transaction, so about 37 seconds of pure IndexedDB before any data appears,
 * on a fast machine. On the office PCs and the drivers' phones, minutes.
 *
 * Batching that needs the decision separated from the IO, so it lives here, pure:
 * no IndexedDB, no network, and no clock beyond the `now` it is handed. Everything
 * it decides is from its arguments, which is also what makes it testable -- the
 * rules below were each written for a failure somebody actually hit, and a faster
 * sync that loses one record is worse than a slow one.
 */
(function (root) {
  'use strict';

  /* How far ahead of us a local timestamp may be before we stop believing it.
   * A device with a wrong clock -- or a forged write pulled before the server
   * started clamping timestamps -- would otherwise outrank every later correction
   * for as long as that clock says so. */
  const FUTURE_MS = 86400000;   // 24h

  /* records: the page, already validated (store known, data an object, key matching).
   * locals:  { "store|id": row|null } for exactly those records, read in bulk.
   * opts.now:       the clock, injected so this is testable.
   * opts.inOutbox:  (key) => boolean, whether we still owe the server that record.
   *
   * Returns { winners, conflicts }:
   *   winners   - records to write, in page order
   *   conflicts - keys where the server copy beat a local edit we had not pushed;
   *               last-write-wins still applies, but the editor has to be told,
   *               or they keep trusting a screen that has already been overruled.
   */
  function decidePage(records, locals, opts) {
    const o = opts || {};
    const now = typeof o.now === 'number' ? o.now : Date.now();
    const inOutbox = typeof o.inOutbox === 'function' ? o.inOutbox : function () { return false; };
    const ls = locals || {};
    const winners = [];
    const conflicts = [];

    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      const key = r.store + '|' + r.id;
      const local = ls[key] || null;

      /* A record the server has stopped redacting must overwrite the redacted copy
       * even though its timestamp has not moved: that is how a login that gains an
       * entitlement ever sees the full row. Without this the office kept the
       * stripped copy of every review it had already stored. */
      const unredact = !!(local && local._redacted && !(r.data && r.data._redacted));

      const localTs = local ? (local.updatedAt || 0) : 0;
      const localAt = localTs > now + FUTURE_MS ? 0 : localTs;
      const remoteTs = (r.data && r.data.updatedAt) || 0;

      if (!local || unredact || remoteTs > localAt) {
        if (inOutbox(key)) conflicts.push(key);
        winners.push(r);
      }
    }
    return { winners: winners, conflicts: conflicts };
  }

  /* The page's records grouped by store, so each store's reads and writes can be
   * one transaction each. Order inside a store is preserved, because two records
   * for the same id in one page must still be applied oldest-rev first. */
  function byStore(records) {
    const out = {};
    for (let i = 0; i < records.length; i++) {
      const s = records[i].store;
      (out[s] || (out[s] = [])).push(records[i]);
    }
    return out;
  }

  /* Which drains one pull should run, from where the two cursors are standing.
   *
   * Pure because getting it wrong is expensive in both directions, and both have
   * already happened. Running the deferred drain every tick costs a second request
   * every four seconds on every device, for ever, to fetch nothing -- shipped once
   * and caught by watching production. Not running it when the deferred cursor is
   * behind loses those records permanently, because the main cursor has already
   * moved past them and will never ask again.
   *
   * Returns a list of drains in the order they must run:
   *   'defer'  - everything EXCEPT the deferred stores, on the main cursor
   *   'only'   - nothing BUT the deferred stores, on their own cursor
   *   'plain'  - everything, on the main cursor, carrying both forward
   */
  function drainPlan(lastRev, lastRevDeferred) {
    const main = lastRev || 0;
    const dfr = lastRevDeferred || 0;
    // Nothing yet: the screens people open first come before the telemetry.
    if (!main) return ['defer', 'only'];
    // An interrupted first sync. Finish the deferred stores on their own cursor
    // before anything else, then carry on normally.
    if (dfr < main) return ['only', 'plain'];
    // Caught up: one drain, one request.
    return ['plain'];
  }

  /* Has this device got everything the server had, and if not, by how much?
   *
   * The server has returned tableMax on every pull since paging was added and
   * nothing ever read it, so the app could not tell "this is the total" from
   * "this is the total so far" -- and drew both the same way. Pure, because the
   * two edges below are each a way of lying to somebody about their own figures.
   */
  function replicaState(lastRev, tableMax, skipCount) {
    var lr = lastRev || 0, tm = tableMax || 0, sk = skipCount || 0;
    return {
      // Zero when caught up AND when nothing is known yet. An unknown must not be
      // announced as a shortfall, or a brand-new or offline device wears the
      // warning permanently and it stops meaning anything.
      behind: tm > lr ? tm - lr : 0,
      // tableMax 0 means no pull has ever come back: the honest answer is "we do
      // not know", which must read as NOT complete -- otherwise a fresh device
      // declares a complete replica while holding only the bundled seed. A record
      // that would not store counts against it too, because the cursor is held
      // behind it and the replica really is short.
      complete: tm > 0 && lr >= tm && sk === 0,
    };
  }

  const api = { decidePage: decidePage, byStore: byStore, drainPlan: drainPlan,
                replicaState: replicaState, FUTURE_MS: FUTURE_MS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PullApply = api;
})(typeof window !== 'undefined' ? window : this);

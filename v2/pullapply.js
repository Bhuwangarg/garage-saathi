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

  const sameVal = function (a, b) {
    return JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
  };

  /* records: the page, already validated (store known, data an object, key matching).
   * locals:  { "store|id": row|null } for exactly those records, read in bulk.
   * opts.now:       the clock, injected so this is testable.
   * opts.inOutbox:  (key) => boolean, whether we still owe the server that record.
   * opts.touched:   { "store|id": [field names] } for the keys we still owe, read in
   *                 bulk from DB.touched() before this runs. A map rather than a
   *                 callback because DB.touched() is async and this function is not:
   *                 the whole reason the module exists is that the decision is pure
   *                 and the IO happens once per store, not once per record.
   *
   * Returns { winners, merges, conflicts }:
   *   winners   - records to write, in page order. A record whose key is still in
   *               the outbox is written with this device's own pending fields put
   *               back on top, so the server's copy lands without the local edit
   *               being erased off the screen that is still showing it.
   *   merges    - keys whose pending edit is kept for the SERVER to reconcile. They
   *               stay in the outbox and push again; contract §4.4 merges them by
   *               the domain rule for that store.
   *   conflicts - [{ key, store, id, reason, fields }] for a residual R collision:
   *               a field this device changed is not the field the server is
   *               holding, and no domain rule decides between them. Named with a
   *               reason so it can be surfaced with a Retry -- never as a number in
   *               a toast, and never as a dialog.
   *
   * Why this file no longer discards a pending edit. v1 removed the key from the
   * outbox and counted a conflict, so the local change was gone and the user was
   * told only that "N record(s) updated on another device". That was survivable
   * while a stale push was silently dropped too -- both ends lost the same edit --
   * and the moment the stale push became recoverable (contract §4.3, §4.5) this
   * became THE remaining way a v2 edit vanishes, and it would have quietly undone
   * that fix.
   *
   * The division of labour is the point. The client cannot order two writes: both
   * timestamps came off device clocks, which is the clock the original bug depends
   * on (§4.0). The server can, because it issued the `rev`. So the client's only
   * job here is not to throw the edit away before the server gets a second look at
   * it, and no screen is ever asked to adjudicate a clock.
   */
  function decidePage(records, locals, opts) {
    const o = opts || {};
    const now = typeof o.now === 'number' ? o.now : Date.now();
    const inOutbox = typeof o.inOutbox === 'function' ? o.inOutbox : function () { return false; };
    const touched = o.touched || {};
    const ls = locals || {};
    const winners = [];
    const merges = [];
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
        winners.push(inOutbox(key) ? keepPending(r, local, unredact, touched[key], merges, conflicts) : r);
      }
    }
    return { winners: winners, merges: merges, conflicts: conflicts };
  }

  /* The remote record to write for a key we still owe the server, and which bucket
   * that key belongs in. Returns a record; pushes the key into `merges` or an entry
   * into `conflicts`. Never mutates what it is handed -- sync.js writes these same
   * objects and also computes the cursor from them.
   *
   * `fields` is what DB.touched() named: the top-level fields this device altered,
   * measured against the base recorded when the edit was made. Only contract §4.4's
   * **R** fields are ever recorded, because every F store is merged on the server
   * and never reaches a collision at all.
   */
  function keepPending(r, local, unredact, fields, merges, conflicts) {
    /* Nothing of ours to name: either the store has no R fields at all -- the
     * ordinary case -- or the base was never recorded or was too large to hold.
     * Both are the same answer here, and it is the same answer sync.js gives on a
     * stale refusal: do not guess which field was whose. Keep the key, write the
     * server's copy, and let the next push have the second look. If the server
     * refuses that push as stale and there is still nothing to name, sync.js
     * surfaces it with a reason and a Retry, which is where an unnameable
     * collision belongs.
     *
     * Say what this does NOT fix, because it looks fixed. DB.touched() records a
     * base only for contract §4.4's R stores -- correct for the push path it was
     * built for, where every F store is merged on the server and never refused.
     * Pull-apply is a different path and an F store does reach it: a pending
     * `routes` or `meta` edit that has not been pushed yet is overwritten by the
     * arriving copy, and the key kept here then pushes the server's own data back.
     * The key is no longer dropped, which is this slice; the payload behind it is
     * only as good as the base DB.touched() has. Widening that base to the F
     * stores is a change to v2/db.js and belongs to whoever owns it. */
    const names = Array.isArray(fields) ? fields : [];
    /* An unredaction is not an edit of ours and the local copy is strictly less
     * information, so putting its fields back would write a stripped value over a
     * full one -- and a `_redacted` copy is never written back. */
    if (!names.length || unredact || !local || local._redacted) {
      merges.push(r.store + '|' + r.id);
      return r;
    }

    const data = {};
    for (const k in r.data) if (Object.prototype.hasOwnProperty.call(r.data, k)) data[k] = r.data[k];
    const collided = [];
    for (let i = 0; i < names.length; i++) {
      const f = names[i];
      /* The server's copy of a field we changed is not our value. Whether the other
       * device set it or simply carried the old one forward, the effect is the same:
       * there is one value and two authors, and §4.4 gives no domain rule that
       * decides an R field. That is the residual the contract says must be surfaced
       * rather than resolved. */
      if (!sameVal(local[f], r.data[f])) collided.push(f);
      if (local[f] === undefined) delete data[f];
      else data[f] = local[f];
    }

    if (collided.length) {
      conflicts.push({ key: r.store + '|' + r.id, store: r.store, id: r.id,
                       reason: 'stale-conflict', fields: collided });
    } else {
      merges.push(r.store + '|' + r.id);
    }
    return { store: r.store, id: r.id, rev: r.rev, data: data };
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
    /* Nothing yet. Fetch what the FIRST SCREEN needs before anything else.
     *
     * A first sync walks the table in rev order, so the few hundred rows the home
     * actually draws -- buses, crew, open jobs, parts, challans -- are scattered
     * through tens of thousands of log rows and arrive whenever their rev comes
     * up. That is why the app could be "loaded" and still show empty figures for
     * a minute: the screens were waiting on records that had no reason to be last.
     *
     * 'first' asks for those stores alone, on their own cursor. It is one or two
     * pages, so the home fills almost immediately, and the full drain behind it
     * re-sends those same records -- which costs a little bandwidth and nothing
     * else, because decidePage() sees they are not newer and skips them. Paying
     * that twice on one sync is worth a home screen that is right in a second.
     */
    if (!main) return ['first', 'defer', 'only'];
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

  /* The stores a first screen draws from. Deliberately short: everything else can
   * arrive behind it, and a list that grows to cover every screen is the same as
   * no list at all.
   *
   * `gatechecks`, `driverreports` and `crewnotes` were missing, and the two safety
   * stores are the whole reason the Attention screen exists: a departure check
   * waiting on a hold decision and a "something is wrong with my bus" report are
   * its top band. Behind the full drain they arrived whenever their rev came up,
   * so a re-synced phone showed an empty Attention screen while the records that
   * belong at the top of it were somewhere in the log rows. `crewnotes` is the
   * same position for a driver, whose entire app is Me.
   *
   * `dutylog` is deliberately NOT here even though it was missing too. It is
   * append-only with a 365-day window and its only consumer is the historical
   * "who was on bus X on date Y" lookup, which nobody asks on arrival; adding it
   * would slow the first screen to serve a query that is not a first-screen
   * question.
   *
   * One cost that is not obvious and is not ours to fix: `gatechecks` has no
   * server send window at all -- stored forever, and absent from HISTORY_DAYS --
   * so this pass now pulls every gate check ever recorded, each with a selfie and
   * up to three item photos, when the only ones Attention needs are `awaiting`.
   * The pull page is byte-governed (2.5 MB, trimmed on a rev boundary), so the
   * failure mode is an extra page or two rather than a hang. A
   * GATECHECKS_HISTORY_DAYS send window would be strictly better; that is
   * retention policy and therefore the owner's call, so it sits in contract §9(g)
   * rather than here. v1 has the identical gap and v1's copy of this file is not
   * changed -- that too goes to the owner. */
  const FIRST_STORES = ['meta', 'users', 'buses', 'parts', 'jobcards', 'drivers',
                        'challans', 'fuel', 'rbreviews', 'incidents', 'routes',
                        'vendors', 'components', 'attendance', 'stockmoves', 'breakdowns',
                        'gatechecks', 'driverreports', 'crewnotes'];

  const api = { decidePage: decidePage, byStore: byStore, drainPlan: drainPlan,
                FIRST_STORES: FIRST_STORES,
                replicaState: replicaState, FUTURE_MS: FUTURE_MS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PullApply = api;
})(typeof window !== 'undefined' ? window : this);

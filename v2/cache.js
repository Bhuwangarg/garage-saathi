/* Garage Saathi v2 — the device's in-memory copy of the stores, and how long
 * history is kept on the device at all.
 *
 * Two jobs that look unrelated and are the same job: deciding what this device
 * holds. `load()` decides what it holds in memory right now; `prune()` decides
 * what it holds on disk at all.
 *
 * ## Retention
 *
 * v2 had no client retention table of any kind (`INTEGRATION-NOTES` 1), so no
 * store was ever pruned on the device. That is the shape of a bug that only
 * appears after a year: nothing is wrong on day one, and on day four hundred a
 * phone is carrying four hundred days of GPS events it will never draw.
 *
 * The windows sit a month beyond the server's send windows so the two can never
 * fight: a row the server would still send is never pruned here. That rule is
 * `03 §7`'s and it is why `nightlist` is 395 and not 365 — the server's window
 * for it is `NIGHTLIST_HISTORY_DAYS`, 365 days, aligned with `dutylog`
 * (`v2-contract.md §5`). Pruning on the server's own number would delete rows
 * the next pull puts straight back, every night, for ever.
 *
 * The whole table is here rather than only the new row. v1 keeps its copy in
 * `app.js` and v2 reads nothing of v1's, so a table with six of the seven rows
 * would be a table that is silently wrong about one store rather than obviously
 * missing.
 *
 * ## The in-memory copy
 *
 * `load()` reads a store with ONE `getAll()` and nothing per row, and only when
 * the store could have changed since the last read. The per-store dirty marks
 * are `v2/db.js`'s, and they are the only honest trigger: a content signature
 * cannot be consulted without reading the content, so the question "has this
 * changed?" is answered by the write path, not by the read path.
 *
 * This is the rule `computeInsights()` broke at 386 ms per render — re-reading
 * stores it had already read, per call, because nothing was tracking whether a
 * read was needed. `reads()` exposes the counter so that cost is assertable
 * rather than a thing somebody notices on a slow phone.
 */
(function (root) {
  'use strict';

  const DAY_MS = 86400000;

  /* Days of history kept on THIS DEVICE, per store. A store absent from here is
   * never pruned locally, which is correct for the stores that are small, are
   * the current state of something, or are the record of record (`users`,
   * `buses`, `jobcards`, `meta` …) and wrong for a history store.
   *
   * Every number is the server's send window plus 30. Do not lower one to the
   * server's number: see the header. */
  const LOCAL_HISTORY_DAYS = {
    gpsevents: 60,
    triplog: 150,
    stockmoves: 210,
    usage: 120,
    audits: 395,
    dutylog: 395,
    nightlist: 395,        // contract §5: the server sends 365, so this is 395
  };

  /* The data layer and the app state, resolved at CALL time rather than captured
   * at load.
   *
   * `DB` is a top-level const in a classic script and `S` is created by
   * `boot.js`, which loads after this file. A reference captured at load would
   * be `undefined` for ever — `v2/night.js` and `v2/router.js` resolve their
   * dependencies the same way, for the same reason. */
  function db() {
    if (typeof DB !== 'undefined' && DB) return DB;
    if (root && root.DB) return root.DB;
    throw new Error('cache.js needs v2/db.js (DB) — not loaded');
  }
  function state() {
    const s = (typeof S !== 'undefined' && S) || (root && root.S) || null;
    if (!s) throw new Error('cache.js needs boot.js (S) — not loaded');
    if (!s.cache) s.cache = {};
    return s;
  }

  /* A store's signature: the row count and the newest timestamp.
   *
   * Transcribed from v1 (`app.js:1107`) because the reasoning is measured, not
   * guessed. It is cheap — one pass, no allocation — and it moves whenever a
   * record is added, removed or written, since every write in this app stamps
   * `updatedAt` and the server stamps it again on push. An edit that changed
   * nothing and left the timestamp alone would be missed, and such a write does
   * not exist here. */
  function storeSig(arr) {
    if (!arr || !arr.length) return '0';
    let max = 0;
    for (let i = 0; i < arr.length; i++) {
      const r = arr[i];
      const t = (r && (r.updatedAt || r.at)) || 0;
      if (t > max) max = t;
    }
    return arr.length + ':' + max;
  }

  /* A store's signature, remembered alongside the array it was taken from.
   *
   * storeSig walks every row, which is the right cost when a memo is checked
   * once per render and the wrong one when it is checked once per crew member:
   * v1's driverOverall runs for all 110 of them, and re-reading forty thousand
   * GPS rows on each check cost 200 ms — the same shape of waste as the scan it
   * was written to replace.
   *
   * An array's signature cannot change while it is the same array, unless a
   * record inside it is edited in place. Every write path here replaces the
   * array (`load()` re-reads whatever was written before anything looks at it
   * again), so identity is a sound thing to key on. */
  const _sigSeen = Object.create(null);
  function sig(name) {
    const arr = state().cache[name];
    const seen = _sigSeen[name];
    if (seen && seen.arr === arr) return seen.sig;
    const s = storeSig(arr);
    _sigSeen[name] = { arr: arr, sig: s };
    return s;
  }
  const sigOf = function () {
    const names = Array.prototype.slice.call(arguments);
    return names.map(sig).join('|');
  };

  // How many getAll()s this device has done. The screen slices' perf checks
  // assert on it; nothing in the app reads it.
  let reads = 0;

  /* Read the named stores into `S.cache`, skipping any that cannot have changed.
   *
   * A store is re-read when it has no copy yet, or when `v2/db.js` marked it
   * dirty since the last read. The dirty marks are cleared for exactly the names
   * this call finished reading, never for all of them: a write that lands while
   * this is awaiting its reads must stay dirty, or that write is the one that
   * goes missing (`v2/db.js:204`).
   *
   * When a re-read turns out to carry the same signature as the copy already in
   * hand, the OLD array is kept. The bytes are identical either way; the array's
   * identity is what every `sig()`-keyed memo downstream is holding, and
   * replacing it would invalidate all of them for no change in content.
   *
   * A store that fails to read is left with whatever it had, or an empty list if
   * it had nothing — never left `undefined`, because `undefined` is how a screen
   * tells "not loaded" from "empty" and a failed read is neither. */
  async function load(names) {
    const s = state();
    const want = (names && names.length) ? names : Object.keys(s.cache);
    const dirty = db().dirtySnapshot();
    const todo = [];
    for (let i = 0; i < want.length; i++) {
      const n = want[i];
      if (todo.indexOf(n) >= 0) continue;                 // the same store twice
      if (s.cache[n] !== undefined && !dirty.has(n)) continue;
      todo.push(n);
    }
    const done = new Set();
    for (let i = 0; i < todo.length; i++) {
      const n = todo[i];
      try {
        const rows = await db().all(n);
        reads++;
        const had = s.cache[n];
        s.cache[n] = (had !== undefined && storeSig(had) === storeSig(rows)) ? had : rows;
        done.add(n);
      } catch (e) {
        if (s.cache[n] === undefined) s.cache[n] = [];
        // Not added to `done`: the store stays dirty so the next load retries it.
      }
    }
    if (done.size) db().clearDirty(done);
    return s.cache;
  }

  /* Drop history older than this device keeps.
   *
   * One transaction per store rather than one per row — see `DB.pruneBefore` for
   * what that cost and who was paying it. A store that fails is skipped, not
   * fatal: this is housekeeping, and the app is fine with a little extra
   * history. A store that genuinely dropped rows is marked dirty by
   * `pruneBefore` itself, so the in-memory copy stops showing rows that are no
   * longer on disk — pruning used to leave them on screen until the next full
   * read happened to come along. */
  async function prune() {
    const stores = Object.keys(LOCAL_HISTORY_DAYS);
    let dropped = 0;
    for (let i = 0; i < stores.length; i++) {
      const store = stores[i];
      const cutoff = Date.now() - LOCAL_HISTORY_DAYS[store] * DAY_MS;
      try { dropped += await db().pruneBefore(store, cutoff); } catch (e) { continue; }
    }
    if (dropped) console.info('pruned ' + dropped + ' old history row(s) from this device');
    return dropped;
  }

  const api = {
    LOCAL_HISTORY_DAYS: LOCAL_HISTORY_DAYS,
    load: load,
    prune: prune,
    reads: function () { return reads; },
    storeSig: storeSig,
    sig: sig,
    sigOf: sigOf,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Cache = api;
})(typeof window !== 'undefined' ? window : this);

/* Garage Saathi v2 — the device's in-memory copy of the stores, and how long
 * history is kept on the device at all.
 *
 * Four jobs that look unrelated and are the same job: deciding what this device
 * holds. `load()` decides what it holds in memory right now; `prune()` decides
 * what it holds on disk at all; `unread()` is how it says "could not read this"
 * without saying "there is nothing here"; and `scopeTo()` decides WHOSE the
 * rows on the disk are, which is the question `load()` never asked and
 * REV-AUTH F1 is the cost of.
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

  /* ---------- "could not read" is a third answer, not the empty one -------
   *
   * `load()` turns a failed read into `[]` when the store had nothing, and that
   * line's own comment names the problem it then walks into: *"a failed read is
   * neither"* not-loaded nor empty — and it stores it as empty anyway. So one
   * layer below all thirteen screens, "this store could not be read" and "this
   * store has no rows" were the same value, which is `v2-ux.md §4.1` #7 broken
   * at the foundation: *"'unknown' and 'zero' must never look alike"*.
   *
   * `undefined` is not the fix. A screen reads `undefined` as "still loading"
   * and draws a skeleton, so a permanently failing store would skeleton for
   * ever — the blanking failure this repo has been bitten by most. The fix is a
   * THIRD place to put the fact:
   *
   *   S.cache[name]   unchanged: the rows, or `[]`, or `undefined` if unread
   *   Cache.unread()  the names whose last read attempt failed or was refused
   *
   * And it is load-bearing rather than available: `Boot.replica()` ANDs
   * `complete` with "nothing is unread", so a store that could not be read
   * makes this device incomplete, which is §1.8's rule — no aggregate figure
   * may be drawn without `stale: true` — firing on every screen at once. */
  const _unread = Object.create(null);

  function unread() { return Object.keys(_unread); }
  function isUnread(name) { return !!_unread[name]; }
  function markUnread(name, why) { _unread[name] = String(why || 'read failed'); }
  function clearUnread(name) { delete _unread[name]; }

  /* ---------- whose replica is on this disk ------------------------------
   *
   * REV-AUTH F1. `boot.js`'s `signOut()` leaves IndexedDB alone and says why —
   * *"a sign-out is not a device wipe, and the next `Cache.load` re-reads them
   * under whoever is signed in then"*. The second half of that sentence was the
   * protection, and it was stated in words the code did not provide:
   * `Cache.load` takes no role, does `db().all(store)` and puts every row into
   * `S.cache`. So a yard phone that an owner filled handed the next person —
   * measured: a conductor holding zero capabilities, signed in offline —
   * another crew member's salary, licence, Aadhaar URL, crew notes and
   * gate-check selfies, including a `crewnotes` row about a driver sitting in
   * that driver's own cache, which is the one rule the product states outright.
   *
   * THE FIX IS A PURGE, NOT A FILTER, and that is the decision worth arguing.
   * A role-scoped read here would be a second copy of `v2_perms.redact_for` and
   * `OWN_ROWS_ONLY` living on the device, and it would be the copy that drifts:
   * `caps.js` says the narrowing belongs *"IN THE QUERY, not in the view"*, and
   * the query is the server's. Worse, the client cannot express the rules it
   * would need — `crewnotes` must be withheld from the person it is ABOUT,
   * which is not a row-ownership filter but its inverse — so a filter would
   * either leak or blank, and it could not tell you which. Rows fetched under
   * one person's entitlement are simply not the next person's to hold.
   *
   * So the replica belongs to ONE person, this records who, and when that
   * changes the replica is rebuilt under the new one.
   *
   * KEPT THROUGH A REBUILD, two stores, each for a reason that is not comfort:
   *
   *   users       the login roster. Purging it locks the next person OUT — the
   *               role and name picker reads it and `askRoster()` needs the
   *               network. It carries `{id, name, role, updatedAt}` and nothing
   *               else (REV-AUTH verified it: no salt, no hash), and `/roster`
   *               publishes the same names unauthenticated.
   *   outboxbase  device-local, never synced: what a pending change is measured
   *               against (`v2/db.js:82`). Dropping it would make every
   *               unpushed edit unrebaseable.
   *
   * Everything else goes, which is deny-by-default applied to retention: a
   * store added to `v2/db.js` tomorrow is purged without anyone remembering to
   * list it, and the gate checks that this list stays two names long. */
  const KEEP_THROUGH_REBUILD = ['users', 'outboxbase'];

  // Who the rows on this disk were fetched for. localStorage, like `sync.js`'s
  // own `lastRev` and `pullScope`: a `meta` row would be pushed to the server,
  // and this is the device's business and nobody else's.
  const OWNER_KEY = 'v2ReplicaFor';

  function ls() {
    const l = (root && root.localStorage) || null;
    return (l && typeof l.getItem === 'function') ? l : null;
  }
  function sync() { return (typeof Sync !== 'undefined' && Sync) || (root && root.Sync) || null; }

  function replicaFor() {
    const l = ls();
    if (!l) return null;
    try { const v = l.getItem(OWNER_KEY); return v ? String(v) : null; } catch (e) { return null; }
  }

  /* Every store db.js knows about, minus the two above. Read from `db.js`'s own
   * table rather than restated here: a second list of the stores is a second
   * list to forget, which is the lesson `index.html` and `sw.js` already carry.
   * `STORES` is a top-level const in a classic script, so it is in scope here
   * in the browser; under node the suites hand it over on the DB stub. */
  function replicaStores() {
    let table = null;
    if (typeof STORES !== 'undefined' && STORES) table = STORES;
    else if (root && root.STORES) table = root.STORES;
    else { const d = db(); table = (d && d._STORES) || null; }
    /* THROWS rather than returning an empty list, and that is the whole point
     * of this line. An empty list would mean "there is nothing to purge", the
     * rebuild would record itself as finished, and the next person would read
     * the last person's rows with every check green — a fail-OPEN on the worst
     * finding in the authorization pass. `scopeTo` turns this throw into a
     * device that reads nothing at all. */
    if (!table) throw new Error('cache: cannot see v2/db.js STORES — the replica cannot be scoped');
    return Object.keys(table).filter(function (n) { return KEEP_THROUGH_REBUILD.indexOf(n) < 0; });
  }

  /* The scope could not be decided AT ALL, so nothing on this disk may be read.
   *
   * Distinct from a sealed store, which is one name this device knows is the
   * previous person's. This is not knowing — and "not knowing whose these rows
   * are" has exactly one safe answer. Every screen then draws an incomplete
   * replica off an empty cache, which is loud, honest, and not a leak. It is
   * cleared by a scope check that reaches an answer. */
  let unscoped = false;

  /* Drop one store's rows with the API db.js already exposes. `pruneBefore`
   * deletes every row older than a cutoff in ONE transaction per store, which
   * is the same call `prune()` below makes and the reason this needs no new
   * data-layer function: a cutoff in the future is every row that carries a
   * timestamp, and every synced row does — the server stamps `updatedAt` on
   * push. It marks the store dirty itself, so the in-memory copy is re-read
   * rather than left showing rows that are no longer on disk. */
  async function dropStore(name) {
    const d = db();
    await d.pruneBefore(name, Date.now() + DAY_MS);
    /* AND THEN IT CHECKS. `pruneBefore` deletes by timestamp and skips a row
     * that carries none (`v2/db.js`: `if (!at) continue`), and although every
     * row that reaches this disk is stamped — `bulkPut` writes
     * `updatedAt || 1`, and the server stamps on push — "should be stamped" is
     * not a thing to take on trust when what is left behind is somebody's
     * Aadhaar URL. So the drop reads the store back, and a store that is not
     * empty afterwards THROWS, which the caller turns into a sealed store:
     * nothing read, nothing invented, and the marker not written, so the next
     * sign-in tries again. Fail closed. */
    const left = await d.all(name);
    if (left && left.length) {
      throw new Error('cache: ' + name + ' still holds ' + left.length + ' row(s) after a rebuild');
    }
    return true;
  }

  /* Declare whose entitlement may fill this device, and rebuild if it changed.
   *
   * Returns `{action, dropped, kept}`. `action` is one of:
   *   'same'     the same person: nothing is touched
   *   'claimed'  no pull has ever come back, so there is nothing to have
   *              belonged to anybody — the marker is simply written
   *   'rebuilt'  somebody else's rows were here and are gone; the cursor is
   *              rewound so the next pull refetches them under this person
   *   'held'     a rebuild was needed and could not finish, because a store
   *              still holds work this device owes the server. Those stores are
   *              marked UNREAD rather than read, so nothing of the previous
   *              person's reaches memory, and the marker is NOT written — the
   *              next sign-in tries again.
   *
   * 'held' is the one that needs its reason. `sync.js`'s push reads the row from
   * the store at push time and drops the outbox key when the row has vanished
   * (`recordForKey` -> `dropKey`), so purging a store with a pending row throws
   * away the previous person's unsent work silently. A shelf count or a gate
   * check is worth more than one handover's delay, and a sealed store leaks
   * nothing while it waits.
   *
   * CALLED WITHOUT BEING AWAITED, and awaited later — see `boot.js`'s `enter`.
   * Everything down to the seal below is SYNCHRONOUS, which is what makes that
   * safe: between the call and the await, `Shell.mount` runs the first screen's
   * `mount()`, and three screens kick a `Cache.load` from there. A seal that
   * landed one microtask later would be a seal the first screen read straight
   * past. Holding the first paint behind the rebuild instead is forty IndexedDB
   * transactions in front of the frame, which is a white page on a Core 2 Duo
   * and the thing §1.8's order exists to prevent.
   *
   * It NEVER REJECTS, for the same reason: a promise nobody is awaiting yet
   * must not be able to become an unhandled rejection. A scope it cannot decide
   * comes back as `action: 'unscoped'`, with the device sealed. */
  const UNKNOWN_SCOPE = 'the scope of this device is unknown';

  async function scopeTo(userId) {
    const who = userId == null || userId === '' ? null : String(userId);
    if (!who) return { action: 'same', dropped: [], kept: [] };
    const held = replicaFor();
    if (held === who) {
      /* The rows ARE this person's, so any seal left over from a rebuild
       * attempted for somebody else in this session comes off. Without this, a
       * handover that was held for unsent work and then handed BACK would leave
       * the owner's own store sealed until the page reloaded. */
      unscoped = false;
      unread().forEach(function (n) { if (sealed(n)) clearUnread(n); });
      return { action: 'same', dropped: [], kept: [] };
    }

    /* No marker is NOT "nothing was ever here": every device in the yard on the
     * deploy that lands this has a full replica and no marker. So the honest
     * question is whether anything was ever FETCHED, which `lastRev` answers —
     * a cursor at zero means no pull has come back and the bundled seed is all
     * there is. Anything else is a replica of unknown provenance and is rebuilt
     * once, which is the shape `sync.js`'s own `healOnce` already uses. */
    if (held === null && !everPulled()) {
      write(who);
      unscoped = false;
      return { action: 'claimed', dropped: [], kept: [] };
    }

    // THE SEAL, and it is the last synchronous statement before the first await.
    unscoped = true;
    state().cache = {};

    let names;
    try { names = replicaStores(); } catch (e) {
      // Nothing is known about what is here, so nothing here is read, and the
      // device stays sealed. `boot.js` writes the reason down once.
      return { action: 'unscoped', dropped: [], kept: [], why: String(e && e.message) };
    }
    const dropped = [], kept = [];
    for (let i = 0; i < names.length; i++) {
      const n = names[i];
      /* Sealed, and the in-memory copy goes TOO. The rows stay on disk because
       * this store holds unsent work; what must not survive is the copy a
       * previous `Cache.load` already put in `S.cache` — a signed-out boot
       * reads nothing now (see `boot.js`'s `enter`), but a sealed store that
       * was read earlier in this session would otherwise sit in memory for the
       * next person with nothing to take it out. */
      if (owes(n)) {
        kept.push(n);
        markUnread(n, 'belongs to the previous person');
        delete state().cache[n];
        continue;
      }
      try { await dropStore(n); dropped.push(n); clearUnread(n); delete state().cache[n]; }
      catch (e) { kept.push(n); markUnread(n, 'could not be rebuilt'); }
    }
    /* The cursor is rewound either way: the stores that WERE dropped have to be
     * refetched, and a partial rebuild that left the cursor ahead would leave
     * them empty for ever. `reset()` is not awaited — it ends in a `tick()`,
     * which is a network round trip nobody here is waiting for. */
    try { const s = sync(); if (s && s.reset) Promise.resolve(s.reset()).catch(function () {}); }
    catch (e) { /* offline: the 4 s tick picks it up */ }
    if (!kept.length) write(who);
    unscoped = false;
    /* The stores a read SKIPPED while the device was sealed were never tried,
     * so they are not unread — they are just unloaded, and the next `load()`
     * reads them. The ones genuinely held are marked in the loop above and stay
     * marked. Leaving these behind would keep `replica().complete` false for
     * the rest of the session over stores that are perfectly readable. */
    unread().forEach(function (n) { if (_unread[n] === UNKNOWN_SCOPE) clearUnread(n); });
    return { action: kept.length ? 'held' : 'rebuilt', dropped: dropped, kept: kept };
  }

  /* Has anything ever been fetched onto this device? `lastRev` and `tableMax`
   * both zero means no pull has come back and the bundled seed is all there is,
   * so there is nothing that could have belonged to anybody. Unanswerable reads
   * as "yes, there is something here", which is the conservative way round. */
  function everPulled() {
    const s = sync();
    try { const i = s && s.info ? s.info() : null; return !!(i && (i.lastRev || i.tableMax)); }
    catch (e) { return true; }
  }

  // Ids in this store this device has changed and not yet pushed.
  function owes(name) {
    const s = sync();
    if (!s || typeof s.pendingIds !== 'function') return false;
    try { const ids = s.pendingIds(name); return !!(ids && ids.length); } catch (e) { return false; }
  }

  function write(who) {
    const l = ls();
    if (!l || typeof l.setItem !== 'function') return false;
    try { l.setItem(OWNER_KEY, who); return true; } catch (e) { return false; }
  }

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
   * tells "not loaded" from "empty". That is kept, and it is not the whole
   * answer: a failed read is NEITHER of those two things, so the name also goes
   * into `unread()`, which is the third answer and the one `Boot.replica()`
   * reads. See the block above it.
   *
   * A store that is UNREAD because it belongs to the previous person is not
   * read at all, and is not given an empty list either: reading it is the leak,
   * and `[]` would tell a screen there is nothing when the truth is that this
   * device may not look. REV-AUTH F1. */
  async function load(names) {
    const s = state();
    const want = (names && names.length) ? names : Object.keys(s.cache);
    const dirty = db().dirtySnapshot();
    const todo = [];
    for (let i = 0; i < want.length; i++) {
      const n = want[i];
      if (todo.indexOf(n) >= 0) continue;                 // the same store twice
      /* SEALED: the rebuild for this store has not finished, so its rows are
       * still the previous person's. Fails CLOSED — nothing is read and nothing
       * is invented — and stays in `unread()`, which keeps this device
       * incomplete and every figure on every screen marked stale. */
      if (sealed(n)) { markUnread(n, _unread[n] || UNKNOWN_SCOPE); continue; }
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
        clearUnread(n);
        done.add(n);
      } catch (e) {
        if (s.cache[n] === undefined) s.cache[n] = [];
        markUnread(n, 'read failed');
        // Not added to `done`: the store stays dirty so the next load retries it.
      }
    }
    if (done.size) db().clearDirty(done);
    return s.cache;
  }

  /* Sealed, not merely unread. A read that failed is retried on the next load
   * — the device is trying and the rows are its own. A store whose rows belong
   * to the previous person must not be retried until the rebuild clears it. */
  function sealed(name) {
    if (unscoped) return true;
    return _unread[name] === 'belongs to the previous person'
      || _unread[name] === 'could not be rebuilt';
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
    KEEP_THROUGH_REBUILD: KEEP_THROUGH_REBUILD,
    OWNER_KEY: OWNER_KEY,
    load: load,
    prune: prune,
    reads: function () { return reads; },
    storeSig: storeSig,
    sig: sig,
    sigOf: sigOf,
    // The third answer, and who the replica belongs to. See the two blocks
    // above `load()`.
    unread: unread,
    isUnread: isUnread,
    scopeTo: scopeTo,
    replicaFor: replicaFor,
    replicaStores: replicaStores,
    // Test seam only, the shape of `Router._reset`: a node suite cannot reload
    // a classic script per case.
    _reset: function () {
      reads = 0;
      unscoped = false;
      Object.keys(_unread).forEach(function (k) { delete _unread[k]; });
      Object.keys(_sigSeen).forEach(function (k) { delete _sigSeen[k]; });
    },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Cache = api;
})(typeof window !== 'undefined' ? window : this);

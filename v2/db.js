/* Garage Saathi — local-first data layer (IndexedDB).
 * Designed offline-first: everything is stored on the device and works with no
 * network. Each record carries an `updatedAt` so a future cloud-sync layer can
 * merge devices later (Phase 2) without changing any of the screens.
 */

/* v2's OWN database, not v1's.
 *
 * Both clients are served from one origin, so one database name means one
 * database between them -- and IndexedDB versions it globally. The moment v2
 * bumps DB_VERSION for a new store, every device that has opened v2 has the
 * shared database at the higher version, and v1's open(name, 28) throws
 * VersionError. v1 would come up with no database at all, on the office's own
 * machines, for a store v1 does not even use.
 *
 * Same shape as the service-worker hazard and missed by all eleven of the
 * original isolation invariants, which guarded the worker and the paths and
 * never thought about the database name. There is a twelfth now.
 *
 * The cost is that v2 starts empty and does a full first sync. That is correct:
 * a separate app has a separate database, and sharing one was never a feature. */
const DB_NAME = 'garage-saathi-v2';
/* 29, not 1, although the database is v2's own and starts empty.
 *
 * The rename above already shipped into this tree at 28, so a machine that has
 * opened v2 since then holds `garage-saathi-v2` AT 28 and without the two stores
 * below -- and onupgradeneeded only fires on a bump, so a version line that
 * started again at 1 would throw VersionError on exactly the devices doing the
 * testing. Contract §5 says 28 -> 29 for the same reason. A fresh device creates
 * every store in one upgrade either way, so the higher number costs nothing. */
const DB_VERSION = 29;  // v29 adds nightlist (tonight's running list) and outboxbase (device-local, never synced); v28 adds crewnotes; v27 adds digest; v26 adds coachai; v25 adds reportai; v24 adds coreai; v23 adds gateai; v22 adds rbaliasai; v21 adds rbreviewai; v20 adds itslookup; v19 adds rbalias; v18 adds the redPro stores; v17 adds gatechecks; v16 adds dutylog (dated crew seat changes); v12 adds the usage store (daily per-person feature counters) — onupgradeneeded creates any missing

const STORES = {
  users: 'id',
  buses: 'id',
  parts: 'id',
  jobcards: 'id',        // outside-repair delta (contract 4.2), four NEW fields on top of v1's outside/
                        //   outsideCity/externalVendor/externalCost/enterAt/outAt:
                        //   billPhotos [string] MAX 4, union by URL; closeNoBillReason string <= 500;
                        //   gatePassNo / gatePassId string, the MOST RECENT pass -- a pointer, not the
                        //   record: the authoritative list is every gatepasses row with jobId == card.id.
  ledger: 'id',      // stock movement ledger (in/out) — the anti-pilferage trail
  attendance: 'id',
  purchases: 'id',
  drivers: 'id',         // driver profiles, assigned to a bus
  incidents: 'id',       // driver performance data points (scratch, dent, accident…)
  driverreports: 'id',   // trip-end problems the driver reports → feed maintenance
  routes: 'id',          // a bus's route: ordered geofenced stops + scheduled go-times
  triplog: 'id',         // per-day actual arrival at each stop → punctuality + auto-learn
  fuel: 'id',            // fuel fills (litres + ₹ + odometer) → mileage (km/l) & fuel ₹/km
  gpsevents: 'id',       // auto safety/misuse events from live GPS (overspeed/harshbrake/night/idle)
  audits: 'id',          // physical stock counts → shrinkage reconciliation + store scorecard
  components: 'id',      // rotable/refurbishable units (tyres, alternators…) — per-unit life + send-out-for-repair history
                        // history[] entries (outside-repair contract 4.3):
                        //   id 'h-…' minted on the device WITH the entry (a replay unions by id; entries
                        //   from before this feature, and v1's, have none and union by (type, at));
                        //   passId string|null, the gate pass the entry belongs to. The money lives in ONE
                        //   place: with a pass, cost/billPhoto are on the pass and the entry carries
                        //   passId and no money; with NO pass (the piece that left before passes were
                        //   kept, which must stay returnable) the entry carries cost and billPhoto itself.
                        //   state is an R field (db.js R_FIELDS): a stale refusal re-applies it.
  def: 'id',            // AdBlue / DEF (diesel exhaust fluid) top-ups for BS6/Volvo SCR buses → consumption + cost
  vendors: 'id',        // supplier registry — maps bills/invoices (incl. emailed ones) to a known vendor
  trips: 'id',          // a driver's trip = cash session (₹ allowance + categorised expenses) → per-bus accounting
  challans: 'rc',       // eChallan snapshot per registration — keyed by RC, one row per bus, replaced on each refresh
  usage: 'id',          // one row per person per day: which screens and actions were used, and how often
  breakdowns: 'id',     // a failure on the road: what let go, where, how long the bus was off.
                        // The point of the whole system is to stop needing these, so they have
                        // to be recorded in a shape that can be counted and compared.
  stockmoves: 'id',     // server-written, append-only: every change to a part's qty, who made it,
                        // and whether a ledger row justified it. Clients pull it and never push it.
  gatepasses: 'id',     // outside-job gate pass: the printed slip a unit leaves the garage on,
                        // and the record the returning unit's serial is checked against.
                        // Shape (outside-repair contract 4.1). Nobody deletes a pass.
                        //   id 'gp-…' and no 'OJ-YYMMDD-XXXX' are minted when the sheet OPENS, never
                        //   at save, so a second save is an upsert of the same row; no is never a counter.
                        //   status 'out' | 'returned' (one way); vendorName; busId (required);
                        //   jobId string|null (the card it came from; null from the piece door);
                        //   componentId string|null; regNo/engineNo/chassisNo COPIED at issue and frozen;
                        //   unitName; unitSerial (may be ''); remark; issuedBy (server truth); issuedAt.
                        //   Added on return only: returnedAt, returnedBy, returnSerial,
                        //   serialMismatch (server truth, derived), cost (null, never 0, when unknown),
                        //   returnRemark, billPhoto (ONE photo: a URL, or a data: URL while it uploads).
  rbservices: 'id',    // redPro: services (id = redBus service id, routeIds, start time, last bus)
  rbreviews: 'id',     // redPro: reviews — no passenger name/phone (server-written)
  rbcomplaints: 'id',  // redPro: complaint cases (server-written)
  rbassign: 'id',      // redPro: redBus's bus/driver per service per day, as observed (server-written)
  itslookup: 'id',
  rbreviewai: 'id',
  rbaliasai: 'id',
  gateai: 'id',
  coreai: 'id',
  reportai: 'id',
  coachai: 'id',
  crewnotes: 'id',     // the office's conversation log — append-only on the server
  digest: 'id',        // the Monday summary (server-written; owner and supervisor only)       // weekly coaching notes: Claude's drafts and their approval (server-written)      // Claude's draft job card for each driver report (server-written)        // Claude's look at each returned old part's photo (server-written)        // Claude's look at each gate check's photos (server-written)     // Claude's answer for each typed redBus name (server-written)    // Claude's reading of whose fault each review is (server-written)     // ITS PNR lookups: trip + crew matched by the driver's number (server-written)
  rbalias: 'id',       // "this redBus name on this bus is this crew member", confirmed once by the office
  gatechecks: 'id',    // departure checklist: one per bus departure — selfie, items, release / office decision
  dutylog: 'id',       // append-only: one row per crew seat change, with when. The duty board
                        // only knows who is on a bus now; this is who was on it on a given day.
  nightlist: 'id',     // one record per night (nl-<YYYY-MM-DD>): which buses run tonight, as a
                        // map keyed by bus so a tick can be taken back and the count can reach
                        // zero. New store, so v1 never has it and cannot clobber it. Contract §5.
  outboxbase: 'key',   // DEVICE-LOCAL, never synced: what a pending change is measured against.
                        // Deliberately absent from sync.js's STORES, so markDirty() returns
                        // early for it exactly as it does for meta.seeded.
  meta: 'key',
};

let _db = null;

/* Open the database, and survive a version bump with the app open twice.
 *
 * A new store means a higher DB_VERSION, and an upgrade cannot run while an
 * older connection is still open. Without the two handlers below that is not a
 * slow path, it is a hang: `open()` fires `blocked` and then nothing — no
 * success, no error — so every await behind it waits for ever and the app comes
 * up blank with nothing in the console to explain it. A phone with the PWA open
 * in two tabs is entirely ordinary, and this is the shape it fails in.
 *
 * `onversionchange` is the other half and the one that actually fixes it: the
 * OLD tab is told another connection wants to upgrade, and closes so it can.
 * That tab's next write reopens at the new version on its own. */
function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      for (const [name, keyPath] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath });
        }
      }
    };
    // Another connection is holding the old version open. Say so and fail the
    // promise rather than hanging: a caller that sees an error can retry or
    // degrade, but one that is never called back can do nothing at all.
    req.onblocked = () => {
      console.warn('IndexedDB upgrade blocked — another tab has Garage Saathi open. Close it.');
      setTimeout(() => {
        if (!_db) reject(new Error('database upgrade blocked by another tab'));
      }, 3000);
    };
    req.onsuccess = () => {
      _db = req.result;
      // Let a future upgrade through instead of blocking it from this tab.
      _db.onversionchange = () => {
        try { _db.close(); } catch (e) { /* already closing */ }
        _db = null;                       // next call reopens at the new version
      };
      resolve(_db);
    };
    req.onerror = () => reject(req.error);
  });
}

function tx(store, mode = 'readonly') {
  return openDB().then((db) => db.transaction(store, mode).objectStore(store));
}

/* Which object stores have been written since load() last read them.
 *
 * load() rebuilds the whole in-memory cache, and it runs after every write and on
 * every sync tick. Re-reading stores nobody had touched was the largest single cost
 * in the app: measured on a fleet-sized device, writing one row took 1ms and the
 * reload behind it took 880ms, all of it spent deserialising rows that had not
 * changed. That gap is what a tap on a button waits for.
 *
 * Marked here, at the only four places a row is ever written, so no caller has to
 * remember to declare what it touched -- the sync engine's putRaw() included, which
 * is where most writes actually come from. */
const _dirtyStores = new Set();
const _markDirty = (store) => { _dirtyStores.add(store); };

/* What a pending change is measured against -- for the residual stores only.
 *
 * A stale refusal is the one case where this device has to re-apply its own
 * change on top of the server's copy, and to do that it has to know WHICH fields
 * it changed. It cannot ask (contract §4.0: no screen ever asks a person to
 * adjudicate a clock) and it cannot work it out by diffing against the server's
 * copy, because that diff cannot tell this device's edit from the other device's.
 *
 * Only the fields contract §4.4 marks **R** ever reach this path: everything else
 * is merged on the server by a domain rule and is never refused at all. So this is
 * a handful of named fields on five stores rather than a copy of every record --
 * which is what the first draft of the contract proposed and then retired, because
 * a job card's photo array can carry a failed upload inline as a `data:` URL.
 *
 * `parts` is deliberately NOT here. §4.4 says in plain words that a lost qty
 * decrement is unfixed, and a base snapshot for it would make it look otherwise. */
const R_FIELDS = {
  jobcards:   ['problem', 'priority', 'remark', 'notes', 'status'],
  buses:      ['regNo', 'company', 'model', 'chassis', 'engine'],
  drivers:    ['busId', 'driverSlot'],
  components: ['state'],
  gatechecks: ['items'],
};
/* A base value this big is not something one person typed into one field --
 * gatechecks.items carries an item's photos. Rather than store it, the snapshot
 * records that it HAS no usable base: touched() then reports nothing, so sync
 * surfaces the refusal with a reason and a Retry instead of guessing. Bounded by
 * construction beats bounded by hope, which is the claim §4.2 retired. */
const BASE_MAX_BYTES = 16384;
const BASE_STORE = 'outboxbase';
const baseKey = (store, id) => store + '|' + id;
const _sameVal = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);

// The snapshot row for `row`'s R fields, or null for a store that has none.
function _baseRow(store, id, row) {
  const fields = R_FIELDS[store];
  if (!fields) return null;
  const out = { key: baseKey(store, id), store, id, base: {}, at: Date.now() };
  for (const f of fields) {
    const v = row ? row[f] : undefined;
    if (v === undefined) continue;                 // absent is itself a base: see touched()
    if (v !== null && typeof v === 'object' && JSON.stringify(v).length > BASE_MAX_BYTES) {
      return { key: out.key, store, id, unbounded: true, at: out.at };
    }
    out.base[f] = v;
  }
  return out;
}

const DB = {
  // A copy, deliberately NOT cleared here: a write that lands while load() is
  // awaiting its reads must stay dirty, or that write is the one that goes missing.
  // load() clears exactly the names it finished reading.
  dirtySnapshot() { return new Set(_dirtyStores); },
  clearDirty(names) { (names || new Set(_dirtyStores)).forEach((n) => _dirtyStores.delete(n)); },
  markDirty: _markDirty,
  async all(store) {
    const os = await tx(store);
    return new Promise((res, rej) => {
      const r = os.getAll();
      // Tombstones (_deleted) are kept on disk so the deletion can sync, but are
      // invisible to the app — callers see a clean, live-only list.
      r.onsuccess = () => res((r.result || []).filter((x) => x && !x._deleted));
      r.onerror = () => rej(r.error);
    });
  },
  async get(store, id) {
    const os = await tx(store);
    return new Promise((res, rej) => {
      const r = os.get(id);
      r.onsuccess = () => { const v = r.result; res(v && !v._deleted ? v : null); };
      r.onerror = () => rej(r.error);
    });
  },
  // Local write: stamps updatedAt and notifies the sync engine (outbox).
  async put(store, obj) {
    obj.updatedAt = Date.now();
    await this._write(store, obj);
    // By the store's OWN key path. This said obj.id, which is right for nearly
    // every store and silently wrong for the two that are not keyed that way:
    // a `meta` row (keyed by `key`) reported an id of undefined, so the garage
    // settings could never enter the outbox even once the store was synced.
    if (typeof DB.onChange === 'function') DB.onChange(store, obj[STORES[store] || 'id']);
    return obj;
  },
  /* Several records across several stores in ONE readwrite transaction.
   *
   *   entries: [{ store, obj }, ...]
   *
   * A return writes the pass, the piece and the card. Three put() calls are three
   * transactions, and a per-row cursor is an event-loop turn each; both shapes
   * shipped in this repo and both had to be undone. So: one transaction over the
   * stores named (plus outboxbase when one of them is an R store), every read the
   * rebase needs issued up front and every write issued together after, awaited
   * once at the transaction. Nothing here awaits between a request and the next.
   *
   * One outbox entry per RECORD (onChange takes a store and an id, so a record
   * that skipped it would never be pushed) and one DIRTY mark per STORE: load()
   * re-reads a dirty store whole, and marking per row or marking everything is the
   * 884ms-per-tap shape. Marks go on after the commit, so a load() that runs
   * mid-write cannot clear a mark for rows that had not landed yet.
   *
   * The base snapshot is taken exactly as _rebase does for a local write: the row
   * as it stood before this write, and only when the key holds none already. */
  async putMany(entries) {
    const list = (entries || []).filter((e) => e && e.store && e.obj);
    if (!list.length) return;
    for (const e of list) if (!STORES[e.store]) throw new Error('putMany: no store ' + e.store);
    const names = [];
    list.forEach((e) => { if (names.indexOf(e.store) < 0) names.push(e.store); });
    const needsBase = names.some((n) => R_FIELDS[n]);
    const db = await openDB();
    const now = Date.now();
    list.forEach((e) => { e.obj.updatedAt = now; });
    await new Promise((res, rej) => {
      const t = db.transaction(needsBase ? names.concat(BASE_STORE) : names, 'readwrite');
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error || new Error('putMany aborted'));
      const writeAll = (prev, held) => {
        list.forEach((e, i) => {
          const id = e.obj[STORES[e.store]];
          if (R_FIELDS[e.store] && id != null && !held[i]) {
            const row = _baseRow(e.store, id, prev[i]);
            if (row) t.objectStore(BASE_STORE).put(row);
          }
          t.objectStore(e.store).put(e.obj);
        });
      };
      const prev = [], held = [];
      let left = 0;
      list.forEach((e, i) => {
        const id = e.obj[STORES[e.store]];
        if (!R_FIELDS[e.store] || id == null) return;
        left += 2;
        const done = () => { if (--left === 0) writeAll(prev, held); };
        const a = t.objectStore(e.store).get(id);
        a.onsuccess = () => { prev[i] = a.result; done(); };
        const b = t.objectStore(BASE_STORE).get(baseKey(e.store, id));
        b.onsuccess = () => { held[i] = b.result; done(); };
      });
      if (left === 0) writeAll(prev, held);
    });
    names.forEach(_markDirty);
    if (typeof DB.onChange === 'function') list.forEach((e) => DB.onChange(e.store, e.obj[STORES[e.store]]));
  },
  // Bulk insert/update in ONE transaction — for Excel/master imports (thousands
  // of rows). Stamps updatedAt and notifies onChange per record so they still sync.
  // `stamp: false` keeps each row's own updatedAt instead of marking it as
  // changed now. Bundled defaults must use it: stamping them "newest" is what
  // let seed data outrank the server and become impossible to correct.
  async bulkPut(store, arr, notify = true, stamp = true) {
    if (!arr || !arr.length) return 0;
    // Local writes, so each row's base is the row as it stood before the import —
    // read once for the whole batch rather than once per row, for the reason the
    // two bulk methods exist at all.
    await this._rebaseMany(store, arr.map((o) => o[STORES[store] || 'id']));
    _markDirty(store);
    const now = Date.now();
    const os = await tx(store, 'readwrite');
    await new Promise((res, rej) => {
      let i = 0;
      const next = () => { if (i >= arr.length) return; const o = arr[i]; o.updatedAt = stamp ? now : (o.updatedAt || 1); const r = os.put(o); r.onsuccess = () => { i++; next(); }; r.onerror = () => rej(r.error); };
      os.transaction.oncomplete = () => res();
      os.transaction.onerror = () => rej(os.transaction.error);
      next();
    });
    // notify=false for bundled-seed loads: every device gets the data from the
    // bundle, so we must NOT re-broadcast thousands of rows into the sync outbox.
    if (notify && typeof DB.onChange === 'function') arr.forEach((o) => DB.onChange(store, o[STORES[store] || 'id']));
    return arr.length;
  },
  // Remote write: applies a record from the server AS-IS (keeps its updatedAt,
  // does NOT re-notify the outbox) so sync never echoes a change back.
  //
  // `baseFrom` is the copy the written record should be measured against from now
  // on, and it exists for exactly one caller: a stale re-apply writes the server's
  // copy with this device's change back on top, so the record it stores is NOT its
  // own base -- the server's copy is. Default (and the pull's case): the record
  // written is the new base, because it is what the server has.
  async putRaw(store, obj, baseFrom) {
    await this._write(store, obj, true, baseFrom);
    return obj;
  },
  /* The two below are putRaw and _rawGet done a page at a time, for sync's pull.
   *
   * pullPage() asked for each row on its own and then wrote it on its own: two
   * awaited IndexedDB transactions per record, 600 records to a page, 135 pages in
   * a fleet-sized first sync. Measured at 277ms per page against 54ms for the same
   * work in one transaction each way -- about 37 seconds of IndexedDB before any
   * data appears, on a fast machine, and minutes on the office PCs.
   *
   * Both issue every request up front and wait on the TRANSACTION rather than
   * chaining request to request, which is where the time actually went: a chained
   * get/put cannot overlap, and one transaction per record cannot either. */
  async bulkRawGet(store, ids) {
    if (!ids || !ids.length) return {};
    const os = await tx(store);
    return new Promise((res, rej) => {
      const out = {};
      let left = ids.length;
      os.transaction.onerror = () => rej(os.transaction.error);
      os.transaction.onabort = () => rej(os.transaction.error || new Error('bulkRawGet aborted'));
      ids.forEach((id) => {
        const r = os.get(id);
        r.onsuccess = () => { if (r.result) out[id] = r.result; if (--left === 0) res(out); };
        r.onerror = () => rej(r.error);
      });
    });
  },
  // Remote writes for one store in one transaction: keeps each row's own
  // updatedAt and does NOT notify onChange, exactly as putRaw does, so sync never
  // echoes the server's own records back at it as local edits.
  async bulkPutRaw(store, rows) {
    if (!rows || !rows.length) return 0;
    // Remote writes: what the server has is the new base for every row in the page.
    if (R_FIELDS[store]) {
      for (const o of rows) {
        const row = _baseRow(store, o[STORES[store] || 'id'], o);
        if (row && row.id != null) await this._putBase(row);
      }
    }
    _markDirty(store);
    const os = await tx(store, 'readwrite');
    await new Promise((res, rej) => {
      os.transaction.oncomplete = () => res();
      os.transaction.onerror = () => rej(os.transaction.error);
      os.transaction.onabort = () => rej(os.transaction.error || new Error('bulkPutRaw aborted'));
      // One bad row aborts the whole transaction, which is why the caller falls
      // back to writing that store a record at a time -- that path is where a
      // record that cannot be stored gets counted and the cursor held back.
      rows.forEach((o) => { const r = os.put(o); r.onerror = () => rej(r.error); });
    });
    return rows.length;
  },
  async _write(store, obj, remote, baseFrom) {
    await this._rebase(store, obj[STORES[store] || 'id'], remote, baseFrom || obj);
    _markDirty(store);
    const os = await tx(store, 'readwrite');
    return new Promise((res, rej) => {
      const r = os.put(obj);
      r.onsuccess = () => res(obj);
      r.onerror = () => rej(r.error);
    });
  },
  /* Record the base, at the only places a row is ever written, so no caller has to
   * remember to declare what it touched -- the same reason the dirty marks live
   * there and not in the feature code.
   *
   * A REMOTE write (the pull, or a stale re-apply) sets the base to the copy the
   * server has. A LOCAL write sets it to the row as it stood BEFORE the write, and
   * only once: a second edit made before the first has been pushed still measures
   * against the last state the server knew, which is what a re-apply has to put
   * its change on top of.
   *
   * Two extra reads per local write, on five stores. The write itself was measured
   * at ~1ms and this is the path a tap waits on, so it is worth saying that it is
   * two reads and not a scan -- and that it buys the difference between a change
   * being re-applied and a change being lost while the screen says it sent. */
  async _rebase(store, id, remote, from) {
    if (!R_FIELDS[store] || id == null) return;
    const key = baseKey(store, id);
    if (remote) {
      const row = _baseRow(store, id, from);
      if (row) await this._putBase(row);
      return;
    }
    if (await this._rawGet(BASE_STORE, key)) return;        // first base wins
    const row = _baseRow(store, id, await this._rawGet(store, id));
    if (row) await this._putBase(row);
  },
  // _rebase for a whole local batch: one read of the prior rows, one read of the
  // bases already held, then only the rows that have none.
  async _rebaseMany(store, ids) {
    if (!R_FIELDS[store]) return;
    const live = (ids || []).filter((id) => id != null);
    if (!live.length) return;
    const prev = await this.bulkRawGet(store, live);
    const held = await this.bulkRawGet(BASE_STORE, live.map((id) => baseKey(store, id)));
    for (const id of live) {
      if (held[baseKey(store, id)]) continue;
      const row = _baseRow(store, id, prev[id]);
      if (row) await this._putBase(row);
    }
  },
  // Written straight to its own store rather than through _write: the base is not
  // app data, so marking it dirty would make load() re-read it for nobody.
  async _putBase(row) {
    const os = await tx(BASE_STORE, 'readwrite');
    return new Promise((res, rej) => {
      const r = os.put(row);
      r.onsuccess = () => res(row);
      r.onerror = () => rej(r.error);
    });
  },
  /* The top-level fields of a pending change, measured against the base above:
   * what this device altered and the server's copy therefore does not have.
   *
   * [] means "cannot say" as well as "nothing" -- no base recorded, or one too
   * large to hold. Both are the same answer to sync: it must not guess, so the
   * refusal is surfaced with a reason and a Retry rather than resolved silently. */
  async touched(store, id) {
    const fields = R_FIELDS[store];
    if (!fields) return [];
    const snap = await this._rawGet(BASE_STORE, baseKey(store, id));
    if (!snap || snap.unbounded || !snap.base) return [];
    const row = await this._rawGet(store, id);
    if (!row) return [];
    return fields.filter((f) => !_sameVal(snap.base[f], row[f]));
  },
  /* touched() for a whole page's pending keys, in two reads instead of two per
   * record. PullApply.decidePage is pure and this is not, so the fields have to be
   * handed to it as data -- which is only affordable if the IO is once per store,
   * the same reason bulkRawGet exists. Returns { id: [field names] }. */
  async touchedMany(store, ids) {
    const fields = R_FIELDS[store];
    const out = {};
    const live = (ids || []).filter((id) => id != null);
    if (!fields || !live.length) return out;
    const snaps = await this.bulkRawGet(BASE_STORE, live.map((id) => baseKey(store, id)));
    const rows = await this.bulkRawGet(store, live);
    for (const id of live) {
      const snap = snaps[baseKey(store, id)];
      const row = rows[id];
      if (!snap || snap.unbounded || !snap.base || !row) continue;   // cannot say: see touched()
      out[id] = fields.filter((f) => !_sameVal(snap.base[f], row[f]));
    }
    return out;
  },
  /* Say explicitly what a record's base is.
   *
   * bulkPutRaw takes each row it writes as that row's own base, which is right for
   * an ordinary pull and wrong for a key this device still owes: the row written
   * then carries the local change back on top, a base taken from it would report
   * nothing as pending, and the next stale refusal would be unresolvable. The
   * server's copy is the base. (putRaw's third argument is the same thing for one
   * record; this is the bulk path, which has to re-base after the write.) */
  async rebase(store, id, from) {
    const row = _baseRow(store, id, from);
    if (row) await this._putBase(row);
  },
  // A key that is no longer pending has no base. Left behind, the next edit to
  // that record would be measured against a state two saves old, and a re-apply
  // would put back a value somebody had already corrected.
  async untouch(store, id) {
    if (!R_FIELDS[store]) return false;
    const os = await tx(BASE_STORE, 'readwrite');
    return new Promise((res, rej) => {
      const r = os.delete(baseKey(store, id));
      r.onsuccess = () => res(true);
      r.onerror = () => rej(r.error);
    });
  },
  async del(store, id) {
    // A hard delete leaves nothing pending, so nothing to measure. (softDel is a
    // local write of a tombstone and goes through _write like any other edit.)
    await this.untouch(store, id);
    _markDirty(store);
    const os = await tx(store, 'readwrite');
    return new Promise((res, rej) => {
      const r = os.delete(id);
      r.onsuccess = () => res(true);
      r.onerror = () => rej(r.error);
    });
  },
  // Sync-safe delete (tombstone). Instead of dropping the row locally and hoping
  // the server forgets it too, we stamp a tombstone {_deleted:true, updatedAt}
  // and DIRTY it so the outbox pushes the deletion to every device. The tombstone
  // is filtered out of all()/get() so the UI treats it as gone. Use this anywhere
  // a delete must propagate (wrong bill, cancelled report, etc.).
  async softDel(store, id) {
    const cur = await this._rawGet(store, id);
    const obj = Object.assign({}, cur || { id }, { id, _deleted: true, updatedAt: Date.now() });
    await this._write(store, obj);
    if (typeof DB.onChange === 'function') DB.onChange(store, id);
    return obj;
  },
  /* Drop a history store's rows older than `cutoff`, in ONE transaction.
   *
   * pruneOldHistory() read the whole store, then awaited del() once per expired
   * row -- and del() opens a transaction of its own, so the cost was one
   * transaction per row, paid while somebody watched a progress screen. Measured
   * on a fleet-sized device: 8,000 expired GPS events took 3,567ms on a fast Mac,
   * and the office machines are Core 2 Duos. It is the owner's and supervisor's
   * logins that pay it, because gpsevents is the only history store of that size
   * and they are the only two roles sent it.
   *
   * One getAll, then the deletes issued together on the same store and awaited
   * once, at the transaction. Written as a per-row cursor first, which is the
   * obvious shape and the wrong one: a cursor costs an event-loop turn per row,
   * so walking 40,000 rows to delete none of them took 1,504ms against the old
   * code's 416ms. The read is not the expensive part -- the transactions were.
   *
   * readWRITE for the read too, so the scan and the deletes are one transaction:
   * nothing can rewrite a row in between and have it deleted on the strength of
   * the timestamp it used to have. The old read-then-delete had that race; it
   * cost nothing in practice because the server trims this history at 30 days and
   * never re-sends it, but one transaction removes the question.
   *
   * Nothing here needs the row's key path for anything but the delete, which is
   * also how the old code's `challans` special case disappears -- that store is
   * not in LOCAL_HISTORY_DAYS, so that branch never ran.
   *
   * `at` is read the same three ways the caller read it, because the history
   * stores disagree on the field: gpsevents and triplog carry `at`, usage carries
   * `lastAt`, the rest fall back to updatedAt. A row with NO timestamp is kept --
   * a missing date is not an old date, and dropping those would silently delete
   * any row written before its store grew a date field.
   *
   * Tombstones are pruned along with everything else, which is what the old code
   * did too (it read _rawAll): a deletion old enough to fall outside the window
   * has long since been pushed to the server.
   *
   * Dirty is marked only on completion, and only if something actually went: the
   * store genuinely changed at that point, and a prune that dropped nothing must
   * not make load() re-read the largest store in the app for no reason. */
  async pruneBefore(store, cutoff) {
    const key = STORES[store] || 'id';
    const os = await tx(store, 'readwrite');
    return new Promise((res, rej) => {
      let dropped = 0;
      const r = os.getAll();
      r.onsuccess = () => {
        for (const v of r.result || []) {
          const at = Number((v && (v.at || v.lastAt || v.updatedAt)) || 0);
          if (!at || at >= cutoff) continue;
          const k = v[key];
          if (k == null) continue;
          os.delete(k); dropped++;        // queued on this transaction, not awaited
        }
      };
      r.onerror = () => rej(r.error);
      os.transaction.oncomplete = () => { if (dropped) _markDirty(store); res(dropped); };
      os.transaction.onerror = () => rej(os.transaction.error);
    });
  },
  // Raw get that DOES return tombstones (sync internals only).
  // Every row INCLUDING tombstones. `all()` hides deleted records, which is right
  // for the app but wrong for anything deciding whether a record is already known
  // — a deleted record is known, and must not be re-created.
  async _rawAll(store) {
    const os = await tx(store);
    return new Promise((res, rej) => {
      const r = os.getAll();
      r.onsuccess = () => res(r.result || []);
      r.onerror = () => rej(r.error);
    });
  },
  async _rawGet(store, id) {
    const os = await tx(store);
    return new Promise((res, rej) => {
      const r = os.get(id);
      r.onsuccess = () => res(r.result || null);
      r.onerror = () => rej(r.error);
    });
  },
  // Wipe every store — used by "Start fresh" to clear demo data so a real
  // garage can begin empty. Caller is responsible for re-seeding/reloading.
  async clearAll() {
    const db = await openDB();
    const names = Object.keys(STORES);
    // Everything changed, so everything is dirty. A restore that left the dirty set
    // empty would reload nothing and leave the old data on screen.
    names.forEach(_markDirty);
    await new Promise((res, rej) => {
      const t = db.transaction(names, 'readwrite');
      t.oncomplete = () => res(true);
      t.onerror = () => rej(t.error);
      for (const n of names) t.objectStore(n).clear();
    });
  },
};

// Small id helper. Crypto-based so two offline devices won't collide.
function uid(prefix = '') {
  const rnd = crypto.getRandomValues(new Uint32Array(2));
  return prefix + rnd[0].toString(36) + rnd[1].toString(36);
}

/* ----------------------------- Seed data ----------------------------------
 * A realistic slice of a Jaipur garage so the owner can click through every
 * flow on first open. Runs only once (guarded by a meta flag).
 */
// demo=true seeds the full demo dataset (local/dev). On production (demo=false)
// we seed ONLY the staff roster (so the login screen has names) + a default
// garage config — never demo buses/jobs/drivers. Stops test data on real devices.

/* NOTHING IN V2 CALLS THIS, AND NOTHING SHOULD. It is v1's, carried over with
 * the rest of this file, and it is not v2's answer to an empty login screen —
 * it is the trap beside that answer. Three reasons, and the first is the one
 * that gets noticed last:
 *
 *  1. It writes with `DB.put`, which stamps `updatedAt` NOW and notifies the
 *    outbox. So the bundled roster outranks the server and is then pushed to
 *    it: exactly the defect `bulkPut`'s `stamp: false` comment above was
 *    written about, on the one store that decides who can sign in.
 *  2. Every name on it is fictional. On a real phone it replaces an honest dead
 *    end with eight doors that none of the hundred people can open, because the
 *    server has never heard of any of them and there is no device PIN behind
 *    them either. A sentence somebody can act on beats a login that refuses.
 *  3. It writes a `meta.garage` row with a placeholder geofence and a
 *    hard-coded business name, which is the row `v2/login.js` draws the name at
 *    the top of the login from.
 *
 * What an empty login screen on a never-synced device needs is the untokened
 * roster: `v2/sync.js`'s `roster()`, asked by `v2/login.js`'s `askRoster()`.
 * `test_v2_login.js` section 9 holds the check that keeps this uncalled — a
 * grep for a CALL, with comments stripped, so this paragraph does not trip it. */
async function seedIfEmpty(demo) {
  const seeded = await DB.get('meta', 'seeded');
  if (seeded) return;

  const now = Date.now();
  const day = 86400000;

  // No PINs here — credentials are validated server-side (hashed) and cached
  // per-device by app.js (seedCreds). The synced roster carries name/role only.
  const users = [
    { id: 'u-owner', name: 'Bhuwan (Owner)', role: 'owner' },
    { id: 'u-sup',   name: 'Vajid (Supervisor)', role: 'supervisor' },
    { id: 'u-store', name: 'Suresh (Store)', role: 'store' },
    { id: 'u-m1',    name: 'Mukesh', role: 'mechanic' },
    { id: 'u-m2',    name: 'Imran',  role: 'mechanic' },
    { id: 'u-m3',    name: 'Vijay',  role: 'mechanic' },
    { id: 'u-d1',    name: 'Ramlal (Driver)', role: 'driver' },
  ];

  const buses = [
    { id: 'b1', regNo: 'RJ14 PA 1023', company: 'Pink City Travels', model: 'Tata Starbus', chassis: 'MAT4470', engine: 'ENG88231', odometer: 184320,
      serviceIntervalKm: 10000, lastServiceOdo: 178000, usesDef: true,
      docs: [
        { type: 'Insurance', number: 'INS-9921', expiry: now + 40*day },
        { type: 'Fitness',   number: 'FIT-3320', expiry: now + 9*day },
        { type: 'Permit',    number: 'PMT-1180', expiry: now + 120*day },
        { type: 'PUC',       number: 'PUC-7741', expiry: now - 2*day },
      ], photos: [] },
    { id: 'b2', regNo: 'RJ14 PB 4567', company: 'Rajasthan Roadlinks', model: 'Ashok Leyland Viking', chassis: 'ALV2231', engine: 'ENG44120', odometer: 251000,
      serviceIntervalKm: 10000, lastServiceOdo: 242000,
      docs: [
        { type: 'Insurance', number: 'INS-7740', expiry: now + 200*day },
        { type: 'Fitness',   number: 'FIT-9981', expiry: now + 60*day },
        { type: 'PUC',       number: 'PUC-2210', expiry: now + 25*day },
      ], photos: [] },
    { id: 'b3', regNo: 'RJ45 CC 8890', company: 'Pink City Travels', model: 'Eicher Skyline', chassis: 'EIC5567', engine: 'ENG10093', odometer: 98700,
      serviceIntervalKm: 10000, lastServiceOdo: 88000,
      docs: [
        { type: 'Insurance', number: 'INS-3312', expiry: now + 5*day },
        { type: 'Fitness',   number: 'FIT-1102', expiry: now + 320*day },
      ], photos: [] },
  ];

  const parts = [
    { id: 'p1', name: 'Brake Pad Set (front)', partNo: 'BP-FR-22', category: 'Brakes', qty: 12, unit: 'set', reorderLevel: 4, unitCost: 1800 },
    { id: 'p2', name: 'Engine Oil 15W-40 (1L)', partNo: 'OIL-1540', category: 'Lubricants', qty: 60, unit: 'L', reorderLevel: 20, unitCost: 320 },
    { id: 'p3', name: 'Oil Filter', partNo: 'FLT-OIL-9', category: 'Filters', qty: 3, unit: 'pc', reorderLevel: 6, unitCost: 410 },
    { id: 'p4', name: 'Air Filter', partNo: 'FLT-AIR-3', category: 'Filters', qty: 9, unit: 'pc', reorderLevel: 4, unitCost: 650 },
    { id: 'p5', name: 'Clutch Plate', partNo: 'CLT-PL-7', category: 'Transmission', qty: 5, unit: 'pc', reorderLevel: 2, unitCost: 5200 },
    { id: 'p6', name: 'Wiper Blade', partNo: 'WPR-21', category: 'Body', qty: 18, unit: 'pc', reorderLevel: 6, unitCost: 240 },
    { id: 'p7', name: 'Tyre 10.00-20', partNo: 'TYR-1020', category: 'Tyres', qty: 2, unit: 'pc', reorderLevel: 4, unitCost: 21500 },
  ];

  const jobcards = [
    { id: 'j1', busId: 'b1', problem: 'Front brakes weak, noise while stopping', priority: 'high',
      status: 'verified', reportedBy: 'u-sup', assignedTo: 'u-m1',
      beforePhotos: [], afterPhotos: [], partsUsed: [{ partId: 'p1', qty: 1, cost: 1800 }],
      labourHours: 2.5, notes: 'Replaced front pad set, cleaned caliper.',
      externalVendor: '', externalCost: 0,
      createdAt: now - 6*day, closedAt: now - 5*day, verifiedBy: 'u-sup', verifiedAt: now - 5*day },
    { id: 'j2', busId: 'b2', problem: 'Engine service due (10000 km)', priority: 'medium',
      status: 'in-progress', reportedBy: 'u-sup', assignedTo: 'u-m2',
      beforePhotos: [], afterPhotos: [], partsUsed: [{ partId: 'p2', qty: 12, cost: 3840 }, { partId: 'p3', qty: 1, cost: 410 }],
      labourHours: 0, notes: '', externalVendor: '', externalCost: 0,
      createdAt: now - 1*day, closedAt: null, verifiedBy: null },
    { id: 'j3', busId: 'b3', problem: 'AC not cooling — sent to outside AC specialist', priority: 'medium',
      status: 'open', reportedBy: 'u-sup', assignedTo: 'u-m3',
      beforePhotos: [], afterPhotos: [], partsUsed: [],
      labourHours: 0, notes: 'Quoted by CoolAir Jaipur', externalVendor: 'CoolAir Jaipur', externalCost: 4500,
      createdAt: now - 3600000, closedAt: null, verifiedBy: null },
  ];

  const ledger = [
    { id: uid('l-'), partId: 'p1', type: 'out', qty: 1, jobId: 'j1', reason: 'Issued to job', by: 'u-store', at: now - 5*day },
    { id: uid('l-'), partId: 'p2', type: 'out', qty: 12, jobId: 'j2', reason: 'Issued to job', by: 'u-store', at: now - 1*day },
    { id: uid('l-'), partId: 'p3', type: 'out', qty: 1, jobId: 'j2', reason: 'Issued to job', by: 'u-store', at: now - 1*day },
  ];

  const attendance = [
    { id: uid('a-'), userId: 'u-m1', type: 'in', at: now - 5*3600000, lat: 26.9124, lng: 75.7873, selfie: '', late: false },
    { id: uid('a-'), userId: 'u-m2', type: 'in', at: now - 4.2*3600000, lat: 26.9124, lng: 75.7873, selfie: '', late: true },
  ];

  const purchases = [
    { id: uid('pur-'), supplier: 'Jaipur Auto Spares', billPhoto: '', amount: 28400, items: 'Brake pads x10, Oil filters x6', paymentStatus: 'pending', at: now - 8*day },
  ];

  // Vendor registry — suppliers we buy from / send work to. `email` is the address
  // they send invoices from, so emailed bills can be mapped back to the vendor.
  const vendors = [
    { id: 'v-jas',  name: 'Jaipur Auto Spares',      category: 'Parts',        phone: '98290 40001', email: 'billing@jaipurautospares.in', gstin: '08ABCDE1234F1Z5', notes: '', createdAt: now - 300*day },
    { id: 'v-tyre', name: 'Jaipur Tyre Remould',     category: 'Tyre remould', phone: '98290 40002', email: 'jaipurtyre@gmail.com',         gstin: '', notes: 'Remould turnaround ~5 days', createdAt: now - 260*day },
    { id: 'v-elec', name: 'Sharma Auto Electricals', category: 'Electricals',  phone: '98290 40003', email: 'sharma.autoele@gmail.com',      gstin: '', notes: 'Alternator/starter rewind', createdAt: now - 220*day },
    { id: 'v-def',  name: 'BluDEF Distributors',     category: 'AdBlue/DEF',   phone: '98290 40004', email: 'sales@bludef.in',             gstin: '08XYZAB6789K1Z2', notes: '', createdAt: now - 120*day },
  ];

  // Drivers, each fixed to a bus (so reports & wear map to the same vehicle).
  const drivers = [
    { id: 'd1', name: 'Ramlal', phone: '98290 11111', license: 'RJ-DL-2210', busId: 'b1', userId: 'u-d1', tripsLogged: 142, joinedAt: now - 400*day, photo: '' },
    { id: 'd2', name: 'Shyam Lal', phone: '98290 22222', license: 'RJ-DL-3398', busId: 'b2', userId: null, tripsLogged: 96, joinedAt: now - 230*day, photo: '' },
    { id: 'd3', name: 'Geeta Devi', phone: '98290 33333', license: 'RJ-DL-7741', busId: 'b3', userId: null, tripsLogged: 61, joinedAt: now - 120*day, photo: '' },
  ];

  // Performance data points (penalty applied by type in app.js). Stable ids so
  // the boot migration in app.js can't create duplicates across devices.
  const incidents = [
    { id: 'inc-1', driverId: 'd1', busId: 'b1', type: 'scratch', note: 'Left rear panel scratch, parking', photo: '', cost: 0, at: now - 12*day, by: 'u-sup' },
    { id: 'inc-2', driverId: 'd2', busId: 'b2', type: 'dent', note: 'Front bumper dent', photo: '', cost: 2500, at: now - 20*day, by: 'u-sup' },
    { id: 'inc-3', driverId: 'd2', busId: 'b2', type: 'harsh-brake', note: 'Repeated harsh braking flagged', photo: '', cost: 0, at: now - 6*day, by: 'u-sup' },
    { id: 'inc-4', driverId: 'd3', busId: 'b3', type: 'accident', note: 'Minor side collision, gate pillar', photo: '', cost: 9000, at: now - 30*day, by: 'u-sup' },
    { id: 'inc-5', driverId: 'd3', busId: 'b3', type: 'scratch', note: 'Door scratch', photo: '', cost: 0, at: now - 4*day, by: 'u-sup' },
  ];

  // Trip-end problem reports from drivers → feed the maintenance team.
  const driverreports = [
    { id: 'dr-1', driverId: 'd1', busId: 'b1', category: 'Brakes', problem: 'Brakes feel weak at high speed, slight noise', at: now - 6*day, status: 'addressed', jobId: 'j1', resolvedAt: now - 5*day },
    { id: 'dr-2', driverId: 'd3', busId: 'b3', category: 'AC', problem: 'AC not cooling and a rattling noise from the rear', at: now - 2*day, status: 'open', jobId: null, resolvedAt: null },
    { id: 'dr-3', driverId: 'd2', busId: 'b2', category: 'Engine', problem: 'Engine feels low on power on inclines', at: now - 1*day, status: 'open', jobId: null, resolvedAt: null },
  ];

  // Rotable/refurbishable components — durable units tracked per-piece with life
  // + send-out-for-repair (remould / rewind) history. Tyres carry a life in km;
  // an alternator sitting at an outside vendor for repair shows the send-out flow.
  const components = [
    { id: 'c-t1', kind: 'tyre', label: 'Tyre FR', serial: 'MRF-9921', busId: 'b1', position: 'FR', state: 'in-service',
      installedAt: now - 120*day, installedOdo: 150000, lifeKm: 60000, maxRefurb: 2, refurbCount: 0, cost: 21500,
      history: [{ type: 'install', at: now - 120*day, odo: 150000, busId: 'b1', position: 'FR', note: 'New tyre fitted' }] },
    { id: 'c-t2', kind: 'tyre', label: 'Tyre FL', serial: 'MRF-9922', busId: 'b1', position: 'FL', state: 'in-service',
      installedAt: now - 20*day, installedOdo: 179000, lifeKm: 45000, maxRefurb: 2, refurbCount: 1, cost: 21500,
      history: [
        { type: 'install', at: now - 300*day, odo: 120000, busId: 'b1', position: 'FL', note: 'New tyre fitted' },
        { type: 'send-out', at: now - 26*day, odo: 178000, vendor: 'Jaipur Tyre Remould', note: 'Tread worn — sent for remould' },
        { type: 'return', at: now - 20*day, odo: 179000, vendor: 'Jaipur Tyre Remould', cost: 4200, note: 'Remoulded, refitted' }] },
    { id: 'c-t3', kind: 'tyre', label: 'Tyre (spare)', serial: 'CEAT-3310', busId: null, position: '', state: 'refurbished',
      installedAt: null, installedOdo: 0, lifeKm: 45000, maxRefurb: 2, refurbCount: 1, cost: 20000,
      history: [{ type: 'return', at: now - 8*day, vendor: 'Jaipur Tyre Remould', cost: 4000, note: 'Remoulded — ready as spare' }] },
    { id: 'c-a1', kind: 'alternator', label: 'Alternator', serial: 'ALT-77120', busId: 'b1', position: '', state: 'sent-out',
      installedAt: now - 200*day, installedOdo: 130000, lifeKm: 0, maxRefurb: 5, refurbCount: 1, cost: 8500,
      history: [
        { type: 'install', at: now - 200*day, odo: 130000, busId: 'b1', note: 'Fitted' },
        { type: 'send-out', at: now - 3*day, odo: 184000, vendor: 'Sharma Auto Electricals', note: 'Weak charging — sent for rewind' }] },
  ];

  // AdBlue / DEF top-ups for the SCR (BS6/Volvo) bus b1 — litres + ₹ + odometer,
  // so consumption (L/100km) and cost can be tracked like fuel.
  const def = [
    { id: 'def-1', busId: 'b1', litres: 12, cost: 720, odometer: 176500, at: now - 34*day, by: 'u-store' },
    { id: 'def-2', busId: 'b1', litres: 10, cost: 620, odometer: 180200, at: now - 16*day, by: 'u-store' },
    { id: 'def-3', busId: 'b1', litres: 11, cost: 680, odometer: 183900, at: now - 3*day, by: 'u-store' },
  ];

  // Outside-repair fixtures (contract 10). Ids are contract. The pass number is the
  // same scheme as Outside.passNo: YYMMDD of issuedAt, then 4 chars off the id.
  const passNo = (id, at) => {
    const d = new Date(at), p = (n) => (n < 10 ? '0' : '') + n;
    let tail = id.replace(/[^a-z0-9]/gi, '').slice(-4).toUpperCase();
    while (tail.length < 4) tail = '0' + tail;
    return 'OJ-' + String(d.getFullYear()).slice(2) + p(d.getMonth() + 1) + p(d.getDate()) + '-' + tail;
  };
  const gp1At = now - 21*day, gp0At = now - 26*day;
  const gatepasses = [
    // Out for three weeks: the Attention row has never been drawn without a record like this.
    { id: 'gp-1', no: passNo('gp-1', gp1At), status: 'out', vendorName: 'CoolAir Jaipur', busId: 'b3', jobId: 'j3',
      componentId: null, regNo: 'RJ45 CC 8890', engineNo: 'ENG10093', chassisNo: 'EIC5567',
      unitName: 'AC compressor', unitSerial: 'ACC-5512', remark: '', issuedBy: 'u-sup', issuedAt: gp1At },
    // Back, from a piece (no card), serial matched, one bill photo.
    { id: 'gp-0', no: passNo('gp-0', gp0At), status: 'returned', vendorName: 'Jaipur Tyre Remould', busId: 'b1', jobId: null,
      componentId: 'c-t2', regNo: 'RJ14 PA 1023', engineNo: 'ENG88231', chassisNo: 'MAT4470',
      unitName: 'Tyre FL', unitSerial: 'MRF-9922', remark: '', issuedBy: 'u-sup', issuedAt: gp0At,
      returnedAt: now - 20*day, returnedBy: 'u-sup', returnSerial: 'MRF-9922', serialMismatch: false,
      cost: 4200, returnRemark: 'Remoulded, refitted', billPhoto: 'bill-gp-0.jpg' },
  ];
  // j3 points at its pass but stays outside:false (vendor typed, bus in our yard); j4 is away, no vendor yet.
  jobcards[2].gatePassNo = gatepasses[0].no;
  jobcards[2].gatePassId = 'gp-1';
  jobcards[2].outside = false;
  jobcards[2].billPhotos = [];
  jobcards.push({ id: 'j4', busId: 'b2', problem: 'Gearbox rebuild at outside workshop', priority: 'medium',
    status: 'open', reportedBy: 'u-sup', assignedTo: 'u-m2',
    beforePhotos: [], afterPhotos: [], partsUsed: [], labourHours: 0, notes: '',
    outside: true, outsideCity: 'Jaipur', enterAt: now - 2*day, outAt: null,
    externalVendor: '', externalCost: 0, billPhotos: [],
    createdAt: now - 2*day, closedAt: null, verifiedBy: null });

  for (const u of users) await DB.put('users', u);   // staff roster — bootstraps the login screen (always)
  if (demo) {                                          // demo operational data — local/dev only
    for (const b of buses) await DB.put('buses', b);
    for (const c of components) await DB.put('components', c);
    for (const d of def) await DB.put('def', d);
    for (const vn of vendors) await DB.put('vendors', vn);
    for (const p of parts) await DB.put('parts', p);
    await DB.bulkPut('jobcards', jobcards);
    await DB.bulkPut('gatepasses', gatepasses);
    for (const l of ledger) await DB.put('ledger', l);
    for (const a of attendance) await DB.put('attendance', a);
    for (const pu of purchases) await DB.put('purchases', pu);
    for (const dv of drivers) await DB.put('drivers', dv);
    for (const ic of incidents) await DB.put('incidents', ic);
    for (const dr of driverreports) await DB.put('driverreports', dr);
  }

  // Garage location (geofence centre for attendance). Default: central Jaipur —
  // a PLACEHOLDER, not a real capture. locSet:false marks it as unconfigured so the
  // UI nags to set it and attendance never trusts distance-from-Jaipur as if it
  // were real. Owner sets the true point via Garage setup → "Use my current location".
  await DB.put('meta', { key: 'garage', lat: 26.9124, lng: 75.7873, radiusM: 200, locSet: false, name: 'Mahalaxmi Travels Garage, Jaipur', biz: 'Mahalaxmi Travels', labourRate: 250 });
  await DB.put('meta', { key: 'seeded', value: true });
}

/* DB joins the global object, which every other module in v2 already does and
 * this file did not.
 *
 * `const DB` at the top level of a classic script goes into the global LEXICAL
 * environment, not onto `window`. So a bare `DB` resolved and `window.DB` was
 * `undefined` -- measured in Chrome: `typeof DB` "object", `typeof window.DB`
 * "undefined", while Cache, Shell, Boot and Caps all answered. Ten modules
 * resolve this one as `(typeof DB !== 'undefined' && DB) || root.DB` and were
 * fine. NINE screens go straight to `root.DB`, and every write behind that
 * reference was a silent no-op on the real page: a storekeeper issued a part
 * and the book never moved, a mechanic tapped "I have started" and nothing was
 * stamped, a supervisor saved a job card that was never created. No error, no
 * toast, no console line -- the guards read `if (!root.DB) return;`.
 *
 * Publishing here rather than rewriting sixty-six call sites, because the nine
 * screens are not wrong about the idiom: every other v2 module IS on the global
 * object, and this file and `sync.js` were the two outliers. */
if (typeof window !== 'undefined') window.DB = DB;

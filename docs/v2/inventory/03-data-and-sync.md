# 03 - Data model and sync protocol (as built, read from source)

Scope: the object stores, their record shapes, who writes them, retention, and how sync works.
Sources read: `db.js`, `sync.js`, `pullapply.js`, `app.js` (cache layer, retention, record creation sites),
`sync_server.py` (schema, write guards, pull, redaction), `duty.js`, `gate.js`, `seed-data.js`, plus the
AI helper modules for the shapes of server-written records. Nothing was run.

Legend for field confirmation: **C** = confirmed at a creation or write site in code. **I** = inferred (reasoning
from reads, not from a write site). **U** = UNDETERMINED (reason given).

## 0. Findings that differ from the brief (read first)

1. **There are 41 IndexedDB object stores, not 40.** `db.js` `STORES` has 41 keys. `app.js` `CACHE_STORES`
   (what `S.cache` holds) has 40; the 41st is `meta`, which is never in `S.cache` as an array - only its
   `garage` row is cached, as `S.cache.garage`. Several comments in `app.js` say "all forty object stores"; they
   count the cache, not the database. `Sync.STORES` (the stores that sync) lists the same 41. `DB_VERSION = 28`,
   DB name `garage-saathi`. There are no secondary indexes anywhere; every read is `getAll()` plus a JS filter.
2. **The pull page size is no longer 600.** 600 was `PULL_LIMIT`'s default until commit `d348232` (2 Nov 2026).
   Current server: `PULL_LIMIT` default **2000** records as a backstop, governed by `PULL_MAX_BYTES` default
   **2,500,000** bytes (~2.5 MB), counting `len(data) + 160` per record. The client sends no limit parameter. The
   figure 600 survives only in client comments (sync.js:935, 1025; pullapply.js:4) and in the test default
   (`test_pullscope.py` `drain(limit=600)`).
3. **`rev` is not a sequence and not "one rev per batch".** `_upsert_record` assigns `MAX(rev)+1` per record, so
   every record gets its own rev within a process. Comments in `pull()` that say "push() gives every record in
   one batch the same rev" are stale, but the rev-group paging rule is still needed because concurrent serverless
   containers can allocate the same number (see traps).
4. **The server never deletes from `records`.** Server-side "retention" is only a send window applied in
   `redact_for()` on read. Rows live forever. `GPS_HISTORY_MS` (sync_server.py:3695) is defined and never used.
5. **Not every "server-written" store is server-only.** `rbalias`, `buses`, `users` and `drivers` are written by
   clients AND by server code paths (details in section 6).
6. The figure "80,700" is not in any of the five code files. It appears in `docs/v2/PIPELINE.md` and the v2 design
   spec as the size of the fleet-sized fixture. The code and git history record **81,680 rows** in the production
   `records` table (sync_server.py:557 and commit `8647a37`) and a pull cursor of **136,050** (commit `3d68153`).

## 1. Storage layout

### 1.1 Client (IndexedDB)

- One database `garage-saathi`, version 28. `onupgradeneeded` only creates missing stores, using each store's
  `keyPath` from `STORES`; it never migrates data. Adding a store means bumping `DB_VERSION`.
- Key paths: every store is `id` except `challans` (`rc`, the normalised registration) and `meta` (`key`).
- A second tab holding the old version open blocks an upgrade; `openDB` rejects after 3 s and `onversionchange`
  closes the old connection.
- Tombstones: `DB.softDel(store,id)` writes the whole existing row plus `{_deleted:true, updatedAt:now}` and
  notifies the outbox. `DB.all()`/`DB.get()` hide `_deleted` rows; `DB._rawAll()`/`_rawGet()` return them.
  Tombstones exist in practice for `buses`, `jobcards`, `routes`, `users` (the only `softDel`/`Sync.remove` call
  sites in app.js). `DB.del()` (hard delete, no outbox, no tombstone) is used only by `pruneBefore`.

### 1.2 Server (Supabase Postgres, `DATABASE_URL`; SQLite/Turso fallbacks exist)

One generic table holds every synced store:

```
records(store TEXT, id TEXT, data TEXT, updatedAt BIGINT, rev BIGINT, PRIMARY KEY(store, id))
CREATE INDEX records_rev ON records(rev)
CREATE INDEX records_store_rev ON records(store, rev)
```

- `data` is **TEXT holding a JSON string** (`json.dumps(data)`, default `ensure_ascii=True`, so non-ASCII such as
  Hindi names is stored as `\uXXXX` escapes). It is not `jsonb`. Readers must `json.loads`.
- `updatedAt` is created unquoted, so on Postgres the real column name is lower-case `updatedat` (I: standard
  identifier folding; the code only ever uses it unquoted). A rebuild reading prod directly must not quote it.
- The two indexes are created best-effort at boot (try/except) and are meant to be created in prod with
  `CREATE INDEX CONCURRENTLY` from `DEPLOY.md`.
- Other tables (not synced to clients): `users(id, name, role, salt, pin_hash, last_login)`, `pushsubs`, `sys`
  (key/value; holds `schema_version`, `SCHEMA_VERSION = 1`), `gpslive(reg, data, at)` (latest position per bus),
  `loginfails`, `disabledlogins`, `aiusage`, `ratelimit`.
- Stores that live in `records` but are not in `db.js` and are never applied by a client: `aimeta` (never sent to
  any device), `odometerlogs`, `waconv` (keyed by a phone-number tail). `odometerlogs` rows are still sent to the
  PII roles (owner, supervisor, crewmanager) and discarded client-side because `Sync.STORES` does not list them.
- The Postgres connection is one shared connection per process, `autocommit=False`, `prepare_threshold=None`
  (PgBouncer transaction mode), guarded by a per-process lock. Isolation is READ COMMITTED (stated in a
  comment at `pull()`).

### 1.3 Wire envelope

```
GET  /pull?since=<rev>&deviceId=<id>[&store=a,b][&defer=a,b]
  -> { records:[{store,id,data,updatedAt,rev}], maxRev, more, tableMax, serverTime, flags:[...], protocol:1 }
POST /push  { deviceId, records:[{store,id,data,updatedAt}] }
  -> { ok, applied, rejected, refused:[{store,id,reason}], maxRev }
```

`/v1/...` is accepted as an alias for the bare paths. Auth is `Authorization: Bearer <token>` (12-hour HMAC
token). Store names in `store=`/`defer=` must match `^[a-z][a-z0-9]{1,30}$`, at most 40 names.

### 1.4 Fields the server adds to client-written records

On every `/push` with an authenticated actor the server overwrites, from the token: `_by` (user id), `_byRole`,
`_org` (`"mahalaxmi"`), and sets `_createdBy`/`_createdRole` on first write (preserved on later edits).
It sets `data.updatedAt` to the (clamped) envelope timestamp. Store-specific stamps are listed per store.
Any rebuilt client must tolerate these fields on read; the server will overwrite them on write.

## 2. The 41 stores

Columns: **Written by** is the server's `WRITE_ROLES` (authoritative; owner is in every listed set). "server only"
means the store is in `SERVER_INGEST_ONLY`: `may_write()` returns False for every role including owner, and
`/push` answers `refused: "role may not write this store"`.
**Client retention** is `LOCAL_HISTORY_DAYS` (app.js:1377), applied by `pruneOldHistory()`; "none" = never pruned.
**Server retention** is the *send window* in `HISTORY_DAYS` (rows older than this are not sent in `/pull`); no
store is ever deleted server-side, so "stored forever" applies to all.

| # | Store | Primary key | Written by | Client retention (days) | Server retention | Approx. production volume | Purpose |
|---|---|---|---|---|---|---|---|
| 1 | users | id | owner, supervisor; also the server (create/rename/login stamp/delete) | none | stored forever; no window | 164 in the bundled seed (107 drivers + 57 conductors) plus staff | Login roster: id, name, role only; never a PIN |
| 2 | buses | id | owner, supervisor; also the server (WhatsApp odometer capture) | none | stored forever | 89 buses | Fleet register: registration, documents, odometer, service state |
| 3 | parts | id | owner, supervisor, store | none | stored forever | 2,384 in seed; 2,391 per live picker comment | Spare-parts catalogue with current stock qty |
| 4 | jobcards | id | owner, supervisor, store, mechanic | none | stored forever | UNDETERMINED (no figure in code) | Repair job card: problem, crew, photos, parts used, hours, sign-off |
| 5 | ledger | id | owner, supervisor, store (append-only) | none | stored forever | ~6,000 rows in the perf fixture | Stock in/out movement trail; the anti-pilferage record |
| 6 | attendance | id | all 8 roles | none | stored forever | UNDETERMINED | Staff check-in/out with selfie and GPS |
| 7 | purchases | id | owner, supervisor, store | none | stored forever | UNDETERMINED | Supplier bills, optionally AI-read |
| 8 | drivers | id | owner, supervisor, crewmanager; server (contact backfill) | none | stored forever | 107 drivers + 57 conductors seeded; "110" crew in a perf comment | Crew bank: drivers AND conductors, documents, bus seat |
| 9 | incidents | id | owner, supervisor | none | stored forever | UNDETERMINED | Driver performance data points (scratch, dent, accident...) |
| 10 | driverreports | id | owner, supervisor, store, mechanic, driver, conductor | none | stored forever | UNDETERMINED | Trip-end problem reports from crew; feed job cards |
| 11 | routes | id | owner, supervisor | none | stored forever | at most one per bus | A bus's ordered geofenced stops and scheduled times |
| 12 | triplog | id | owner, supervisor, driver | 150 | 120 | ~55,000 rows/year growth (comment); "12k trips" in fixture, store not named | Per-day actual stop arrival vs schedule |
| 13 | fuel | id | owner, supervisor, store, crewmanager | none | stored forever | UNDETERMINED | Diesel fills: litres, rupees, odometer |
| 14 | gpsevents | id | **server only** (GPS ingest) | 60 | 30 (env `GPS_HISTORY_DAYS`); owner and supervisor only | ~40,000 on device; table peaked past 42,000 before the window | Auto safety events: overspeed, harshbrake, night, idle |
| 15 | audits | id | owner, supervisor, store (append-only for staff) | 395 | 365 (env `AUDITS_HISTORY_DAYS`); owner, supervisor, store | UNDETERMINED | Physical stock counts and shrinkage |
| 16 | components | id | owner, supervisor, store, crewmanager | none | stored forever | UNDETERMINED | Rotable units (tyres, alternators...) with life and repair history |
| 17 | def | id | owner, supervisor, store, crewmanager (append-only for staff) | none | stored forever | UNDETERMINED | AdBlue/DEF top-ups |
| 18 | vendors | id | owner, supervisor, store | none | stored forever | 11 in seed | Supplier registry |
| 19 | trips | id | owner, supervisor, driver | none | stored forever | UNDETERMINED | A driver's cash session: allowance and categorised expenses |
| 20 | challans | **rc** | **server only** (`/challans` proxy) | none (not in LOCAL_HISTORY_DAYS) | stored forever | at most one per bus (~89) | eChallan snapshot per registration, replaced on refresh |
| 21 | usage | id (`userId\|YYYY-MM-DD`) | all 8 roles | 120 | 90 (env `USAGE_HISTORY_DAYS`); owner, supervisor only | one row per person per day | Daily per-person screen/action counters |
| 22 | breakdowns | id | owner, supervisor | none | stored forever | UNDETERMINED | Road failures: what failed, where, downtime |
| 23 | stockmoves | id | **server only** (`_log_stock_moves`) | 210 | 180 (env `STOCKMOVES_HISTORY_DAYS`); owner, supervisor, store | UNDETERMINED | Tamper-evident log of every change to a part's qty |
| 24 | gatepasses | id | owner, supervisor | none | stored forever | UNDETERMINED | Outside-job gate pass: slip a unit leaves on, checked on return |
| 25 | rbservices | id | **server only** (redPro collector) | none | stored forever | UNDETERMINED (largest services carry ~400 via-routes) | redBus services: route ids, start time, last bus |
| 26 | rbreviews | id | **server only** (redPro collector) | none | stored forever | ~4,000 (fixture); first AI backlog "4,700" | Passenger reviews, no name or phone |
| 27 | rbcomplaints | id | **server only** (redPro collector) | none | stored forever | UNDETERMINED | redBus complaint cases |
| 28 | rbassign | id | **server only** (redPro collector) | none | stored forever | one row per service per day | redBus's observed bus/driver per service per day |
| 29 | itslookup | id | **server only** (`/its/lookup`) | none | stored forever | UNDETERMINED | ITS PNR lookups: trip plus matched crew |
| 30 | rbreviewai | id | **server only** (`/ai/reviews`) | none | stored forever | one per AI-read review | Claude's reading of whose fault a review is |
| 31 | rbaliasai | id | **server only** (`/ai/names`) | none | stored forever | UNDETERMINED | Claude's answer for each typed redBus name |
| 32 | gateai | id | **server only** (`/ai/gate`) | none | stored forever | one per gate check looked at | Claude's look at a gate check's photos |
| 33 | coreai | id | **server only** (`/ai/core`) | none | stored forever | one per returned old part | Claude's look at a returned old part's photo |
| 34 | reportai | id | **server only** (`/ai/reports`) | none | stored forever | one per driver report | Claude's draft job card for a driver report |
| 35 | coachai | id | **server only** (`/ai/coaching`, `/ai/coaching/decide`) | none | stored forever | one per crew member per week | Weekly coaching note: draft, then approved/skipped |
| 36 | crewnotes | id | owner, supervisor, crewmanager, office (append-only) | none | stored forever | UNDETERMINED | The office's conversation log about a crew member |
| 37 | digest | id | **server only** (`/ai/digest`) | none | stored forever | one per week | Monday summary; owner and supervisor only |
| 38 | rbalias | id | owner, supervisor, crewmanager; also the server (Claude auto-confirm) | none | stored forever | UNDETERMINED | "This redBus name on this bus is this crew member" |
| 39 | gatechecks | id | owner, supervisor, driver | none | stored forever | UNDETERMINED | Departure checklist per bus departure |
| 40 | dutylog | id | owner, supervisor, crewmanager (append-only) | 395 | 365 (env `DUTYLOG_HISTORY_DAYS`) | UNDETERMINED | Dated crew-seat changes: who was on which bus on a given day |
| 41 | meta | **key** | owner, supervisor (only the `garage` row syncs) | none | stored forever | 1 synced row (`garage`) | Garage settings: labour rate, geofence, late cutoff, business name |

**Server-written-only stores in `db.js` (15):** gpsevents, challans, stockmoves, rbservices, rbreviews,
rbcomplaints, rbassign, itslookup, rbreviewai, rbaliasai, gateai, coreai, reportai, coachai, digest.
`SERVER_INGEST_ONLY` also names four stores that are not in `db.js`: `gpslive`, `odometerlogs`, `waconv`, `aimeta`.

**Server-origin write paths into client-writable stores:** `users` (rename, login `lastLoginAt` stamp,
tombstone on delete/purge), `buses` (WhatsApp odometer: sets `odometer` and `odometerAt`), `drivers` and `buses`
(`/admin/backfill-contacts`: merges only `phone`/`altPhone`/`crewPhone`/`docsFolderId` when missing), `rbalias`
(Claude auto-confirms with `decidedBy:"claude"`).

### 2.1 What each role is sent on `/pull` (`_never_for` + `redact_for`)

- All roles: every store except the withheld ones below. `aimeta` goes to no one.
- `gpsevents`: owner, supervisor only (also time-windowed). `usage`: owner, supervisor. `stockmoves`: owner,
  supervisor, store. `audits`: owner, supervisor, store. `digest`: owner, supervisor. `crewnotes`: owner,
  supervisor, crewmanager, office.
- `triplog`, `dutylog`: all roles, time-windowed only.
- PII roles = owner, supervisor, crewmanager: full records. Everyone else gets other people's `drivers` rows with
  `phone, altPhone, address, dob, bloodGroup, license, docs, salaryMonthly` removed and `_redacted:true` added (own
  record, matched on `userId`, is full), and `buses` without `crewPhone`. Note: `_DRIVER_PRIVATE` does not list
  `emgName/emgPhone/emgRelation/refName/refPhone` or `photo`, so those pass through to non-PII roles (confirmed by
  reading the tuple; whether intended is U).
- Non-PII roles never get `itslookup, rbaliasai, gateai, coreai, reportai, coachai`. They get
  `rbreviews, rbcomplaints, rbassign, rbreviewai` only if role is `office` (and `office` gets `rbreviews` and
  `rbcomplaints` with `pnr, tin, seats, fare, boardAt, doj, amount` removed and `_redacted:true`).
  `rbservices` goes to everyone (no names in it).
- A record withheld by redaction still counts as sent: the cursor is taken before redaction.

## 3. Record shapes

Conventions that hold for every store: `id` is a string. Client ids come from `uid(prefix)` =
`prefix + base36(uint32) + base36(uint32)` (crypto random), e.g. `j-…`, `b-…`, `l-…`, `pur-…`. Timestamps are
epoch milliseconds (numbers) unless noted. `updatedAt` is always present on stored records (stamped by `DB.put`;
bulk seed rows carry `updatedAt: 1`). `_deleted:true` marks a tombstone. `_redacted:true` marks a partial copy
that must never be pushed. Provenance fields in section 1.4 are on server-stored records and not repeated below.

### 3.1 jobcards (id `j-…`; seed ids like `j1`)

Creation literal `saveJob()` app.js:6223 (C):

| Field | Type | Notes |
|---|---|---|
| id | string | `uid('j-')` |
| busId | string | |
| problem | string | |
| priority | string | `high`, `medium`, `low` appear in code (C); the full select list is I |
| status | string | `open`, `in-progress`, `done`, `verified` (C: all four are assigned in code) |
| reportedBy | string | user id |
| assignedTo | string or null | first assignee's `userId` |
| assignees | array of `{userId:string, task:string}` | C (`parseCrew`) |
| beforePhotos, afterPhotos | array of string | hosted URL, or inline `data:` URL when upload failed |
| partsUsed | array of `{partId, qty:number, cost:number, reused:boolean}` | server merges, see section 5 |
| labourHours | number | |
| jobDate | string `YYYY-MM-DD` | |
| enterAt, startAt | number or null | |
| completeAt, outAt | number or null | created as null; setters exist (C) |
| odometer | number | 0 when the odometer is broken |
| remark | string | |
| externalVendor | string; externalCost number | vendor job |
| outside | boolean; outsideCity string; outsideLat, outsideLng number or null | bus is in another city |
| reportIds | array of driverreport ids | |
| breakdownId | string or null | |
| notes | string | |
| createdAt | number | |
| closedAt | number or null | |
| verifiedBy | string or null | |

Added after creation (C at write sites): `verifiedAt`; `closedBy` (server truth); `reworkCount` number;
`partRequests` array of `{id:'pr-…', partId, partName, qty, status:'requested'|'fulfilled', by, at,
fulfilledBy?, fulfilledAt?}`; `coreReturns` array of `{id:'cr-…', partId, photo, condition:'worn'|'partial'|
'suspect', note, at, by}` (a read at app.js:8092 also touches `c.ai.verdict`; where it is written is U);
`busMoves` array of `{from, to, by, at, reason}`; `deletedBy, deletedAt, deleteReason` plus `_deleted:true`
when the owner deletes. The scheduled-service quick log (`confirmLogService`) writes a card directly at
`status:'verified'` with `closedAt/verifiedBy/verifiedAt` set, no photos, `assignedTo` = the logger.
Server-enforced state machine is in section 5.4.

### 3.2 buses (id `b-…`, `bus-<NORMREG>` for imported/seeded, `b1..b3` demo)

Creation literals: `saveBus` (app.js:5741), AirFi import (:3532), route import (:6937), seed (seed-data.js).

| Field | Type | Confirmation |
|---|---|---|
| id | string | C |
| regNo | string | C (e.g. `RJ09PA6126`; no fixed spacing: demo uses `RJ14 PA 1023`) |
| company, model, chassis, engine | string | C (empty string when unknown) |
| odometer | number | C; 0 for all 89 seeded buses until capture |
| serviceIntervalKm | number | C (default `SERVICE_INTERVAL_KM`; seed shows 10000) |
| lastServiceOdo | number | C |
| lastServiceDate | number | C (`confirmLogService`) |
| docs | array of `{type, number, expiry:number\|null, photo?}` | C; `type` in Insurance, Fitness, PUC, Permit, Road tax |
| photos | array of string | C |
| source | string | C: `airfi`, `route-import`, `drive-doc` (soft-deleted by cleanup), `klm-excel` (read, I) |
| routeLabel, driverCrew, conductor, conductorUserId, crewPhone | string | C (route import); `crewPhone` is PII-redacted |
| docsFolderId | string | C (Drive folder link, merged by the server backfill) |
| usesDef | boolean | C |
| odoBroken boolean, odoBrokenAt number or null | | C |
| odometerAt | number | C, server-set by WhatsApp capture |
| hidden, disabled | | U: assigned in app.js but meaning not traced |

### 3.3 drivers (id `d-…`, `drv-<NORMREG>-<n>`, `con-<REGKEY>`; holds drivers AND conductors)

C from `saveCrew` (app.js:11519), `saveCrewProfile`, `saveDriverDoc`, conductor backfill (:11872), seed.

| Field | Type | Notes |
|---|---|---|
| id, name | string | |
| crewRole | `'driver'` or `'conductor'` | absent on older rows; absent is read as driver (`crewRoleOf`) |
| status | `'active'`, `'left'`, `'archived'` | absent is read as active |
| phone, altPhone | string | PII-redacted |
| license | string | PII-redacted; legacy single field |
| busId | string or null | current seat; overwritten on every change (history lives in `dutylog`) |
| driverSlot | 1, 2 or null | which driver seat |
| userId | string or null | linked login id in `users` |
| photo | string | URL or inline data URL |
| tripsLogged | number | |
| joinedAt | number | |
| dob | number or null; address, bloodGroup string | PII-redacted |
| emgName, emgPhone, emgRelation, refName, refPhone | string | not in the redaction list |
| salaryMonthly | number | PII-redacted; only written when the editor may see pay |
| docs | object keyed `license`, `aadhaar`, `photo`, `pan`, `police`, `medical`; each `{number?, photo?, photoBack?, expiry?:number, at, by}` | C; PII-redacted |
| leftAt, leftReason, leftReasonKey, leftNote, rehire, archivedAt, rejoinedAt | | C (assigned in the leave/rejoin flow) |
| source | string | `route-import`, `conductor-backfill` |

### 3.4 parts (id `p-…`, `part-<extId>` for master import, `p1..` demo)

C from `saveAddPart` (:6465), `confirmAddStock` (:6536), `mapPartRows` (:~6830), seed.

`id`, `name`, `partNo` string; `category` string (`''` in seed and import, `'General'` default in forms);
`unit` string (`pc` default; `set`, `L` in demo); `qty` number (**mutable scalar, decremented in place**);
`unitCost` number (weighted-average on receive); `reorderLevel` number; optional `supplier` string,
`warrantyMonths`, `lifeMonths` number; from master import/seed: `extId` string, `alertDays` number,
`serialTracked` boolean, `reusable` boolean, `createdAt` number. `img` string optional (read by `partImg`, never
seen written: U).

### 3.5 ledger (id `l-…`; append-only, server refuses any edit or delete of an existing id)

C (`issuePart` :1343, `receiveStock` :1608, `saveAudit` :4614, `saveAddPart` :6473):
`{id, partId, type:'in'|'out', qty:number, jobId:string|null, reason:string, by:userId, at:number}`;
the issue-to-job row additionally has `reused:boolean` and `unitCost:number`.
`reason` values seen: `Issued to job`, `Issued to job (reused)`, `Stock received`, `Stock added`,
`Purchase from <supplier>`, `Opening stock`, `Audit shortfall (shrinkage)`, `Audit surplus`.
The ledger is the source the app uses to heal `jobcards.partsUsed` (`reconcileJobParts`).

### 3.6 gpsevents (id `ev-<10 hex>`; created only by the server, `ingest_gps`)

C (sync_server.py:4143): `{id, reg:string (display plate), type:'overspeed'|'harshbrake'|'night'|'idle',
value:number (km/h, km/h drop, km/h, or idle minutes; rounded to 1 dp), lat, lng, at:number (device timestamp)}`
plus server `updatedAt` (receipt time), `_by` is not set (ingest passes `actor=None`). Thresholds: overspeed at
`OVERSPEED_KPH` default 80, harsh brake at `HARSH_DROP_KPH` 30, idle at `IDLE_MIN` 15, night debounce 30 min.
`reg` is not a bus id; clients join on a normalised registration (`_normReg`).

### 3.7 Small and simple client-written stores

| Store | Fields (C unless marked) |
|---|---|
| users | `{id, name, role}`; server also adds `lastLoginAt:number`; tombstone `{id,_deleted:true}`. Roles: owner, supervisor, crewmanager, office, store, mechanic, driver, conductor. The login handler **replaces** the record with `{id,name,role,lastLoginAt}` (no merge); `rename_user` merges. |
| attendance | `{id, userId, type:'in'\|'out', at, lat, lng, dist, selfie, late:boolean, faceVerified:boolean, flagged:boolean}`; server stamps `userId` from token, `receivedAt`, and `atUnverified:true` when `at` is >10 min before receipt; `at` is replaced by server time if absent or >5 min in the future. Non-managers cannot change a row once written. |
| purchases | `{id, supplier, vendorId\|null, amount, items:string, lines:[{partId,qty,cost}], paymentStatus, paidAt\|null, billPhoto, at}` plus optional `billNo, billDate, gstin, gst, readByAi:{lines,subtotal,total,model}`; `paidBy` is allowed by the server guard (I: written by `togglePaid`). Staff may change only `paymentStatus, paidAt, paidBy`. |
| incidents | `{id, driverId, busId, type, note, cost, photo, at, by}`; `type` in scratch, dent, harsh-brake, overspeed, late, cleanliness, accident, other. |
| driverreports | `{id, driverId\|null, busId, category, problem, photo, at, status:'open'\|'addressed'\|'cancelled', jobId\|null, resolvedAt\|null}`. Reporter may only cancel while open and unlinked. |
| routes | `{id, busId, name, stops:[{id, name, lat, lng, radiusM, schedTime:'HH:MM'}]}`; tombstoned when the last stop is removed. |
| triplog | `{id, routeId, busId, stopId, day:'YYYY-MM-DD', at, actualMin, scheduledMin\|null, deltaMin\|null, source}`. Driver may log once per stop per bus per day; never edit. |
| fuel | `{id, busId, litres, cost, odometer, full:boolean, at, by}` plus optional `pump`, `place` (<=500 chars), `lat`, `lng`. Append-only for non-managers. |
| audits | `{id, at, by, mode:'blind'\|'full', lines:[{partId, system, counted, variance, value}], shrinkValue, foundValue}`. |
| components | `{id, kind:'tyre'\|'alternator'\|'starter'\|'battery'\|'injector'\|'other', label, serial, partId\|null, partExtId, busId\|null, position, state:'in-service'\|'removed'\|'sent-out'\|'refurbished'\|'scrapped', installedAt\|null, installedOdo, lifeKm, maxRefurb, lifeMonths, warrantyMonths, boughtAt, refurbCount, cost, history:[{type:'install'\|'remove'\|'send-out'\|'return'\|'scrap', at, odo?, busId?, position?, vendor?, cost?, billPhoto?, note}], createdAt, updatedAt}`. |
| def | `{id, busId, litres, cost, odometer, at, by}`. Append-only for non-managers. |
| vendors | `{id, name, category, phone, email, gstin, notes, createdAt}` plus from import `extId, isRepairVendor, city`. |
| trips | `{id, busId, driverId, fromTo, allowance, startedAt, closedAt\|null, status:'active'\|'closed', expenses:[{id,cat,mode:'card'\|'cash',amount,note,photo,at,by}], by}`. Driver cannot change bus, allowance or start; expenses are append-only; a closed trip is frozen. |
| usage | `{id:'<userId>\|<YYYY-MM-DD>', userId, name, role, date, screens:{name:count}, acts:{name:count}, slow:{name:{n,worstMs}}, taps, firstAt, lastAt}`; flushed every 20 s and on hide/pagehide. |
| breakdowns | `{id, busId, system:'engine'\|'brakes'\|'tyre'\|'gearbox'\|'electrical'\|'suspension'\|'ac'\|'fuel'\|'other', description, at, place, odometer, downtimeHours, towed:boolean, jobId\|null, reportedBy}`. |
| gatepasses | `{id, no, status:'out'\|'returned', vendorName, busId, regNo, engineNo, chassisNo, componentId, unitName, unitSerial, remark, issuedBy, issuedAt, updatedAt}`; on return adds `returnedAt, returnedBy, returnSerial, serialMismatch:boolean, cost, returnRemark, billPhoto`. Identifiers are copied, not referenced. |
| gatechecks | see 3.8 |
| dutylog | `{id, at, crewId, crewName, role:'driver'\|'conductor', busId\|null, regNo, reason, by, updatedAt}`; `reason` in baseline, assign, seat-taken, joined, left, archived, restored, rejoined. Baseline id is fixed `dl-base-<crewId>`; other ids `dl-<base36 at>-<crewId>-<rand4>`. Server: never edited or deleted once written; a second baseline is a no-op. |
| crewnotes | `{id:'cn-…', crewId, at, by, kind:'talked'\|'warned'\|'praised'\|'other', text, scoreAt\|null, starsAt\|null, reviewsAt, createdAt, updatedAt}`. Written once, never edited or deleted. |
| rbalias | `{id:'al-<NORMREG>-<name_with_underscores>', name, regNo, role:'driver'\|'conductor', status:'crew'\|'generic'\|'unsure', crewId\|null, decidedBy, decidedAt}`; server adds `history` (last 20 changes). A Claude auto-confirm also carries `auto:true, reason, evidence:{nights,onBus}`; a human write strips those. Never deleted. |
| meta | the `garage` row: `{key:'garage', name, biz, lat\|null, lng\|null, locSet:boolean, radiusM:200, lateCutoff:'HH:MM' (default '09:30'), labourRate:number (default 250), latePenalty, lateGraceDays, latePenaltyCap, dailyRevenue}`. The `seeded` row is device-local and never syncs (`markDirty` skips it; the server refuses any `meta` id other than `garage`). |

### 3.8 gatechecks (id `gc-…`)

Created by the driver (`gateStart` app.js:9805): `{id, busId, regNo, driverId, driverName, startedAt, date (Gate.dayKey),
selfie, faceVerified, lat, lng, onDutyBoard:boolean, status:'open', items:{}}`. Server sets `userId` (from token).
Then: `items` = object keyed `ac, blankets, cabin, charging, water, tyres, fuel, papers, safety, uniform`, each
`{ok:true, photo, at}` or `{ok:false, note, photo, at}` (`ac, blankets, cabin` require a photo to pass).
`status` flow: `open` -> `released` (all pass; server sets `releasedAt`) or `awaiting` (a failed item; server sets
`sentAt`) -> `approved` or `held` (owner/supervisor, with `decision:{reason, by, byRole, at, verdict:'go'|'hold'}`;
server keeps `pastDecisions`). Also `serviceId` (string, <=30 chars), `failedBefore` (server-accumulated array of item
keys). Fields in `GATE_FIXED` cannot change after creation.

### 3.9 Server-written stores

| Store | Id | Fields |
|---|---|---|
| challans | `rc` = padded normalised registration | `{rc, updatedAt, fetchedAt, creditsUsed, creditsLeft, providerUnavailable, total, pendingCount, disposedCount, pendingFine, pendingPayable, courtCount, challans:[{challanNo, rc, date, status, fine, payable, serviceCharge, gst, offence, place, state, department, courtName, sentToCourt, accused, offlinePayable}]}`. Snapshots written before the padding fix sit under an older key spelling (app reconciles both). |
| stockmoves | `sm-<32 hex>` | `{id, partId, was, now, delta, by, byRole, justified:boolean, at}`; `justified` is true only when ledger rows stored in the same push net to exactly the qty change. |
| rbservices | redBus service id | `{id, serviceNo, origin, dest, startTime, label, routeIds:[<=1000], lastVehicle}` (empty fields omitted). |
| rbreviews | `rv-<reviewId>` | `{id, reviewId, tin, pnr, routeId, source, dest, boardAt, fare, seats:[<=12], stars:1-5\|null, submittedOn, comment, tags:[<=12], reviewStatus, replied:boolean, firstSeen}` + `_by:'redpro-collector'`. |
| rbcomplaints | `cs-<caseNumber>` | `{id, caseNumber, pnr, doj, createdAt, status, issue, source, dest, amount, seats:int\|null, resolution, refundStatus, notes:[{at,text}<=30], firstSeen}`. |
| rbassign | `as-<serviceId>-<IST YYYY-MM-DD>` | `{id, serviceId, date, serviceNo, startTime, obs:[{vehicleNo, driver1, driver2, cro, at}] (last 48, one entry per change)}`. |
| itslookup | `it-<pnr>` | `{id, pnr, found, lookedUpAt, by, v:3, matchReason, driverPhoneMasked, crewId\|null, routeId, timeId, journeyDate, startTime, cityTime, routeName, fromCity, toCity, ticketStatus, _by:'its-lookup'}`; the raw driver phone is never stored. |
| rbreviewai | `ai-<review id>` | `{id, rv, v, h, model, at, faults:[...], topics:[...], safety:boolean, severity:0-3, en, hi}`. |
| rbaliasai | same id as the `rbalias` pair | `{id, pick\|null, generic:boolean, conf:'high'\|'medium'\|'low', reason, v, eh, at, model, nights, onBus}`. |
| gateai | `ga-<check id>` | `{id, check, busId, v, h, items:{<item key>:{verdict, reason, hi}}, dup, error, model, at}`. |
| coreai | `ca-<coreReturn id>` | `{id, cr, job, partId, by, claimed, dupOf, flags:[...], error, v, h, model, at, what, matches, wear:0-100\|null, verdict, partNo, reason, hi}`. |
| reportai | `ra-<report id>` | `{id, report, busId, v, h, model, at, title, hi, trade, priority, unsafe:boolean, cause, checks:[<=3], parts:[{name,why}<=4], repeat:boolean}`. |
| coachai | `co-<week>-<crewId>` | `{id, week, crewId, role, facts, status:'draft'\|'approved'\|'skipped', model, at, hi:{good,fix,tip}, en:{good,fix,tip}, aiHi?, decidedBy, decidedAt}`. |
| digest | `dg-<week>` | `{id, week, model, at, headline, hi, sections:[{title, lines:[<=4]}<=6], actions:[<=3]}`. |
| gpsevents | see 3.6 | |

Exact enum values for `faults`, `topics`, `verdict`, `trade`, `priority` live in the `*_ai.py` modules and were not
enumerated here (U).

## 4. How sync works

### 4.1 Constants

| Thing | Value | Where |
|---|---|---|
| Tick interval | **4,000 ms** (`setInterval(tick, 4000)`) | sync.js `start()` |
| Debounce after a local write | 600 ms (`kick()`), plus a tick on the browser `online` event and after login | sync.js |
| Records per push tick | 250, and 1,500,000 bytes (first cap hit ends the batch; an oversize single record still goes alone) | `PUSH_PER_TICK`, `PUSH_MAX_BYTES` |
| Server push limits | 1,000 records (`MAX_PUSH_RECORDS`), 6 MB body (`MAX_PUSH_MB`) -> 413 | sync_server.py |
| Pull page | up to **2,000 records or ~2.5 MB**, whichever is hit first, always ending on a rev boundary | `PULL_LIMIT`, `PULL_MAX_BYTES` |
| Pages per drain | at most 200 per drain per tick (`guard`), loop also stops if the cursor does not advance | sync.js `drain()` |
| Request timeouts | pull 25,000 ms (covers body read), push 15,000 ms, login 8,000 ms (60,000 ms for roles with no offline fallback), warm-up ping 9,000 ms | sync.js |
| Backoff | after each failed tick: `4000 * 2^(fails-1)` ms, capped at 300,000 ms, +/-20% jitter; one success resets | sync.js |
| 429 handling | honours `retryAfterSec`/`Retry-After`, clamped to 5-900 s, stored in `syncPauseUntil` | sync.js |
| Server rate limit | 120 requests/minute/user for `/pull`+`/push` (bucket `sync`), 240 uploads/hour/user | `RL_SYNC_PER_MIN`, `RL_UPLOAD_PER_HOUR` |
| Session | 12 h HMAC token; 401 clears it and sets status `signedout` | `SESSION_TTL` |
| UI refresh after applied records | debounce 700 ms, ceiling 2,500 ms | app.js `APPLY_COALESCE_MS`, `APPLY_MAX_WAIT_MS` |
| Future-timestamp guards | server clamps a push timestamp to now if more than 5 min ahead; client ignores a *local* timestamp more than 24 h ahead when deciding a pull | `MAX_FUTURE_SKEW_MS`, `FUTURE_MS` |

### 4.2 Client state in localStorage

`deviceId` (`dev-<7 chars>`), `lastRev`, `lastRevDeferred`, `tableMax`, `lastSyncAt`, `clockOffset`, `outbox`
(JSON array of `store|id` keys), `outboxBy` (key -> user id), `syncActor`, `photoQueue`, `quarantine`, `token`,
`lastSyncError`, `lastSyncErrorAt`, `syncPauseUntil`, `featureFlags`, `pullSkips`, `pullScope`, `syncUrl`, and
one-shot flags `syncBackfill_compdefvendtrip_v1`, `syncHeal_pullPaging_v1`. The first-screen cursor `scratchRev`
is memory-only.

### 4.3 One tick (`tick()`), in order

1. If a tick is already running, return. If `pauseUntil` is in the future, set status `waiting` and return.
2. **Order depends on the cursor:** if `lastRev` is 0 (never synced) do `pull()` then `push()`; otherwise `push()`
   then `pull()`. (Reason in the code: a fresh device's outbox can start full, and an old build pushed one record
   per request, so pushing first starved the first pull.)
3. **push():**
   a. `flushPhotos()` - re-uploads queued offline photos (needs a token) and patches the record.
   b. Take outbox keys that are not quarantined and whose recorded author is the current signed-in user (or has
      no author); at most 250.
   c. Read each record's *current* row from IndexedDB (tombstones included). The outbox stores keys only, so
      several edits to one record collapse into the latest state. Rows that vanished are dropped; rows with
      `_redacted` are dropped (a partial copy is never written back).
   d. Send one `POST /push` with the whole batch.
   e. 401 -> session dead; 429 -> pause; 5xx or timeout -> throw (keys stay, backoff). A 200 with `refused` ->
      those keys go to **quarantine** (never retried until a manual "retry refused" clears it) and a toast is
      raised; every other key is removed from the outbox. A 200 without `refused` (old server) clears the whole
      batch. A 4xx for the whole batch -> walk the records one request each to find the offender.
4. **pull():** `PullApply.drainPlan(lastRev, lastRevDeferred)` chooses the drains (4.5).
5. After each page: write `serverTime - Date.now()` to `clockOffset`; raise `tableMax`; store `flags`; apply records
   (4.4); move the cursor; call the `onApplied` callback (the app coalesces and runs `load()` +
   `reconcileJobParts()` + re-render).
6. On success: set `lastSyncAt`, status `synced`, clear stored error and backoff. On failure: store the message,
   increment `failStreak`, set `pauseUntil` from the backoff, status `offline` (or `signedout`).

### 4.4 Applying a pull page (`pullPage` + `PullApply.decidePage`)

1. Keep only records whose `store` is in `Sync.STORES`, whose `data` is a non-array object, and whose
   `data[keyField]` equals the record `id` (`keyField` is `key` for meta, `rc` for challans, else `id`).
2. Group by store. For each store, read all local rows in one transaction (`bulkRawGet`).
3. A remote record **wins** if: there is no local row, OR the local row is `_redacted` and the remote is not
   (un-redaction wins at an equal timestamp), OR `remote.data.updatedAt > localAt`, where `localAt` is the local
   `updatedAt` unless that is more than 24 h in the future (then 0). Equal timestamps lose. If a winner's key is
   still in the outbox the local edit is **discarded** (key removed from the outbox) and counted as a conflict.
4. Winners are written in one transaction per store (`bulkPutRaw`: keeps the row's own `updatedAt`, does not touch
   the outbox, marks the store dirty). If that transaction aborts, or the store will not read, fall back to one
   record at a time to find the failing row.
5. A record that will not store is tracked in `pullSkips` (tries, rev). The cursor is held at `rev - 1` of the
   lowest failing record until `PULL_STORE_TRIES = 5` failures, after which it moves past (the replica is then
   permanently short; `info().notStored` and `complete:false` report it).
6. Cursor update: `next = min(maxRev, holdRev - 1)` if held, else `maxRev`; only stored if `next > since`.
7. Return `more && cursor advanced`.

### 4.5 Cursor semantics and the drain plan

- `rev` is one global integer across all stores. Each write sets the row's `rev = MAX(rev over whole table) + 1`.
  Tombstones are ordinary rows and travel the same way. The server query is
  `WHERE rev > since AND rev <= maxrev [AND store NOT IN (...) | AND store IN (...)] ORDER BY rev ASC LIMIT n`.
- `maxrev` is read **before** the page and the page is clamped to it. The page is trimmed to the byte budget, then
  to a rev boundary (drop the trailing partial rev group unless it is the whole page). If the very first rev group
  alone is over budget it is sent whole.
- `maxRev` in the response is the cursor to store: `tableMax-at-read` if the page did not fill, otherwise the last
  rev actually sent. `more = cursor < maxrev`. `tableMax` is the table maximum, used only for progress
  (`behind = tableMax - lastRev`, `complete = tableMax > 0 && lastRev >= tableMax && no skips`).
- Stores the actor can never receive (`_never_for`) are excluded in SQL, so the cursor jumps past them.
- Two cursors exist. `lastRev` is the main one. `lastRevDeferred` covers `DEFERRED_STORES = ['gpsevents']`.
  `drainPlan(lastRev, lastRevDeferred)`:
  - `lastRev == 0` (nothing yet): `['first','defer','only']`
  - `lastRevDeferred < lastRev` (interrupted first sync): `['only','plain']`
  - otherwise (caught up): `['plain']` - one request per tick.
  Step meanings: `first` = pull only `FIRST_STORES` (meta, users, buses, parts, jobcards, drivers, challans, fuel,
  rbreviews, incidents, routes, vendors, components, attendance, stockmoves, breakdowns - 16 stores) on a memory-only
  scratch cursor; `defer` = everything except gpsevents on `lastRev`; `only` = gpsevents alone on
  `lastRevDeferred`; `plain` = everything on `lastRev`, and a plain page also carries `lastRevDeferred` forward.
  A device that asks for a store it may not see via `store=` gets nothing and its cursor stays where it was.
- The `first` pass re-sends records that the `defer` drain later sends again; `decidePage` skips them as not
  newer. The extra bandwidth is intentional.

### 4.6 First sync on a new device

1. Boot opens the DB (creates all 41 stores), seeds the staff roster, draws the login pad from `loadForLogin()`
   (`users` + `garage` only), then in the background applies the bundled seed (`seed-data.js`, version
   `2026-07-08-pin0000`: 11 vendors, 2,384 parts, 89 buses, 107 drivers, 164 users = 2,755 rows) with
   `bulkPut(notify=false, stamp=false)` so rows carry `updatedAt: 1` and are not queued for push.
2. Login obtains the token and compares `pullScope` (`full|redacted` + `:v2`); a widened scope rewinds both cursors.
3. `Sync.start()`: begins the 4 s interval, runs `backfillOnce()`, `tick()`, and `healOnce()` (a one-time
   `reset()`: clears `lastRev`, `lastRevDeferred`, `tableMax`).
4. With `lastRev == 0`: pull before push. Plan `first` -> `defer` -> `only` as in 4.5. Wire requests are, in order:
   `/pull?since=<scratch>&deviceId=...&store=meta,users,...` until `more` is false, then
   `/pull?since=<lastRev>&deviceId=...&defer=gpsevents` until `more` is false, then
   `/pull?since=<lastRevDeferred>&deviceId=...&store=gpsevents` until `more` is false (owner and supervisor only
   receive any gpsevents).
5. The UI refreshes at most every 2.5 s during the drain and once more when it stops.
6. Measured cost of this path is in section 8. Seed rows (`updatedAt:1`) are overwritten by any server row.

### 4.7 Other protocol facts

- `/pull` also returns `flags` (from the `FEATURE_FLAGS` env) on every response; the client stores them and
  `Sync.flagOn(name)` is false unless named.
- `GET /roster` is unauthenticated and returns `{users:[{id,name,role}]}` so a never-synced device can draw the
  login pad.
- A push response `maxRev` is returned but the client does not use it for the pull cursor.
- Photos: `POST /upload` (data URL, 4 MB cap on Vercel) returns a URL. Failure leaves the inline `data:` URL in the
  record, which then syncs as part of the record (the push byte cap exists because of this).

## 5. Conflict resolution

### 5.1 The rule

**Whole-record last-write-wins on `updatedAt`.** Nothing is merged per field except the cases in 5.3.

- A local write stamps `obj.updatedAt = Date.now()` using the **device clock** (not server-corrected;
  `Sync.now()`/`clockOffset` is used only for attendance and gate checks).
- Server push: for each record it reads the stored row; the incoming record is applied only if there is no row or
  `incoming.updatedAt > stored.updatedAt` (strictly). A record that loses is **silently dropped**: it is not
  counted as rejected and not in `refused`, the response is 200, and the client removes it from its outbox.
  Incoming timestamps more than 5 minutes in the future are clamped to server now first (both envelope and
  `data.updatedAt`).
- Client pull: remote wins only if strictly newer (4.4), with the 24 h local-future guard and the un-redaction
  exception.

### 5.2 Same record edited on two devices (A then B, both offline, then both sync)

Let `tA < tB` be their `updatedAt` stamps.
1. Whichever pushes first is stored. Say A pushes: server stores A. B pushes: `tB > tA` so B replaces A on the
   server. **B's whole record wins; every field A changed that B did not also change is lost** (B started from
   the old copy).
2. If B pushes first and A second, A is dropped silently (`tA < tB`), nothing is reported to A's user at push time.
   A's device later pulls B's row (newer) and overwrites its own copy; if A's key was still in the outbox at that
   moment it is counted as a conflict (toast "N record(s) updated on another device"); if A had already pushed and
   been dropped the overwrite is silent.
3. Equal `updatedAt`: the server keeps the first stored; a device holding the other version keeps its own on pull
   (equal does not win). They would stay diverged until someone edits again (I; needs a same-millisecond collision,
   likely only for bulk-stamped rows, since `bulkPut` stamps every row in the call with one `now`).
4. A device with a clock set back writes smaller timestamps; its edits can lose to older server copies and
   disappear silently. A clock set forward by more than 5 minutes is clamped to server now.
5. Delete versus edit: a tombstone is just a row with a later `updatedAt`. A later edit by a device that never saw
   the delete **resurrects** the record (its copy has no `_deleted`); a later delete wins over an earlier edit.
6. The server does not detect or report a lost update. The client's conflict toast only fires in case 2 above.

### 5.3 Where the server (or the client) merges or corrects instead

- **jobcards.partsUsed** (server, `_merge_parts_used`): lines are unioned by `(partId, reused)`; a line missing from
  the incoming write is restored from the stored card, and the larger `qty` (with its `cost`) wins. Rationale in the
  code: a missing line is a stale device, not a removal, because the stock already left the store. The corrected
  payload is given a later `updatedAt` (`max(upd+1, now)`) so the author's own device pulls the correction.
- **jobcards crew for mechanics**: `assignees` and `assignedTo` are carried over from the stored card whatever
  the mechanic sends. `closedBy`, `closedAt` (on done), `verifiedBy`, `verifiedAt` are set from the token and the
  stored copy, never from the body.
- **Client heal**: `reconcileJobParts()` re-adds any ledger-issued part missing from a card's `partsUsed` after every
  applied pull (roles that may issue parts only).
- **dutylog**: first write wins. A second baseline row with the same fixed id is overwritten with the stored one.
- **gatechecks**: `failedBefore` and `pastDecisions` accumulate across writes; fixed fields cannot change.
- **rbalias**: `history` keeps up to 20 previous decisions.
- **Append-only stores** (no conflict possible; second writer is refused): ledger, crewnotes, dutylog, stockmoves,
  and for non-managers attendance, audits, fuel, def, triplog, closed trips.
- **Server-first fields** (client value ignored): `_by`, `_byRole`, `_org`, `_createdBy`, `_createdRole`,
  `attendance.userId/receivedAt/atUnverified`, `dutylog.by`, `crewnotes.by`, `gatechecks.userId/releasedAt/sentAt/
  decision.by/at`, jobcard sign-off fields.

### 5.4 Server guards that can refuse a write (returned in `refused`, then quarantined on the device)

Role not allowed for the store; `rid` longer than 200 chars or containing `< > " ' ` & \x00-\x1f`; `data` not an
object; `data[keyPath] != rid`; `data._redacted`; plus per-store rules: jobcards (only owner deletes; mechanic
cannot create/delete and must be on the crew; closing/verifying needs owner or supervisor; photos or vendor bill
required to reach done/verified; the person who closed cannot verify unless supervisor; a verified card's hours,
costs, `outside` and parts are frozen for non-managers; only the owner moves a verified card to another bus;
re-opening a verified card needs owner or supervisor), ledger/crewnotes/dutylog append-only, purchases (staff may
only mark paid), driverreports (reporter may cancel while open), trips and triplog (driver restrictions),
gatechecks, rbalias (must name a real crew record), meta (`garage` only).

### 5.5 Stores where concurrent edits are known or likely to be lossy

| Store | Why | Confirmed or inferred |
|---|---|---|
| jobcards | Client edits are read-modify-write of the whole card (`j[field] = [...]; DB.put`). Two devices adding photos, part requests, core returns or bus moves to one card each lose the other's additions. Only `partsUsed` is rescued. | C (write pattern) + C (server merge scope) |
| parts | `qty` is a scalar updated in place (`part.qty -= qty; put`). Two stores issuing the same part offline: the later write replaces the other's decrement. The `stockmoves` `justified` flag and the ledger exist to expose this, not prevent it. | C |
| meta | One `garage` row; every setting edit rewrites the whole row from the editor's cache. | C |
| buses | Whole-row writes from many paths (odometer carry-forward from job cards, fuel, breakdowns, documents). Also written by the server (WhatsApp odometer) with a bumped `updatedAt`. | C |
| drivers | Whole-row writes: profile edit, document vault, seat change, leave/rejoin, contact backfill. | C |
| usage | One row per user per day. A second device for the same user and day starts from zero counters (non-owner roles are not sent `usage`), so its later write replaces the first device's counts. | I (id format C, entitlement C, effect inferred) |
| users | `lastLoginAt` stamp replaces the whole synced record at each login. | C |
| components, trips (while active), routes, vendors, challans | Whole-record arrays (`history`, `expenses`, `stops`) rewritten by the editor. Trip expenses are protected only against removal by a driver. | C (pattern) |

## 6. Offline behaviour

- **Works offline:** everything that reads or writes IndexedDB. All screens read `S.cache`; every write is local
  first. The service worker (`sw.js`, cache `garage-saathi-v149`) serves the shell cache-first and answers
  navigations with the cached shell when offline; cross-origin and non-GET requests bypass it.
- **What queues:** every `DB.put`/`softDel`/`bulkPut(notify=true)` adds a `store|id` key to the persisted outbox
  (`localStorage`), tagged with the signed-in user (`outboxBy`). Photos that could not be uploaded stay inline in
  the record (`data:` URL) and travel with it; the only place `Sync.queuePhoto` is used is the crew photo
  (`drivers.photo`), stored in `photoQueue` and re-uploaded by `flushPhotos()` at the start of each push.
  `tools > tidyPhotos` (`repairInlineMedia`) later uploads inline images and rewrites the records.
- **Drain:** the next tick that can reach the server pushes up to 250 records or 1.5 MB per tick; a backlog clears
  over successive 4 s ticks. Failed ticks back off up to 5 minutes; the `online` event and any local write trigger
  an immediate tick. A change made by user X waits in the outbox until X signs in again if another user is signed in
  (`heldForOthers`).
- **What fails offline:** login for owner, supervisor and crewmanager (their PINs are not kept on the device; other
  roles can fall back to a locally cached PIN, with a 5-try / 60 s local lockout); `/upload`, `/ai*`, `/challans`,
  `/its/lookup`, `/gps*` live telemetry, `/my/reviews`, `/my/coaching`, staff creation/rename/delete/PIN set,
  `/push/subscribe`. Server-written stores (reviews, AI notes, stockmoves, gpsevents, challans, digest) simply stop
  updating; the last pulled copy is shown.
- **Not offline-safe:** a record refused by the server after reconnect (role or guard) ends in quarantine and stays
  only on that device. Attendance times queued offline are marked `atUnverified` by the server.
- **Dead session:** a 401 clears the token, status becomes `signedout`, nothing is pulled or pushed until sign-in;
  the outbox is kept.

## 7. Client cache (`S.cache`, `load()`, `loadForLogin()`)

- `S = { user, route, stack, cache: {} }` (app.js:475). `CACHE_STORES` maps cache key -> `[object store, tolerant]`.
  Keys that differ from the store name: `jobs` -> `jobcards`, `att` -> `attendance`. `tolerant` (second element `1`)
  means a missing object store yields `[]`; the original 19 stores are not tolerant (an unreadable `buses` should
  surface). `S.cache.garage` is `DB.get('meta','garage')`.
- `load(force)`: `all = force || !_cacheLoaded`. Takes `dirty = DB.dirtySnapshot()` (a copy). When not `all`, reads
  only stores in `dirty`; `gpsevents` additionally throttled by `SLOW_STORES = { gpsevents: 20000 }` (at most one
  re-read per 20 s; a forced load always reads it). Reads run in parallel, results are written into the **live**
  `S.cache` (or a fresh `{}` when `all`), then `DB.clearDirty(done)` clears exactly the stores actually read. The
  throttled/missed ones stay dirty.
- Dirty marks are set in four places in `db.js`: `_write` (used by `put`, `putRaw`, `softDel`), `bulkPut`,
  `bulkPutRaw`, `del`; `clearAll` marks everything; `pruneBefore` marks only if it dropped something.
- `loadForLogin()`: sets every `CACHE_STORES` key to `[]`, reads only `users` and `garage`, and deliberately does not
  set `_cacheLoaded`, so the next `load()` reads everything.
- `LOCAL_HISTORY_DAYS = { gpsevents: 60, triplog: 150, stockmoves: 210, usage: 120, audits: 395, dutylog: 395 }`;
  `pruneOldHistory()` calls `DB.pruneBefore(store, now - days)` for each, scheduled on `requestIdleCallback`
  (15 s timeout, else a 5 s timer), never awaited. Each window is 30 days longer than the server's send window by
  design so the two can never fight. The timestamp is `at || lastAt || updatedAt`; a row with none is kept;
  tombstones are pruned too; deletions are hard and not pushed.

## 8. Volumes and cost (measured figures recorded in code and commit messages)

Fixture/production sizes: production `records` table **81,680 rows** (sync_server.py:557); pull cursor **136,050**
(commit `3d68153`); v2 fixture **80,700 rows, 40,000 GPS events** (docs/v2); perf comment fixture (app.js:1090) **40k
GPS events, 12k trips, 6k ledger rows, 4k reviews**; bundled seed 2,755 rows (comments say ~2,900 and 2,800).

Treat the following as budgets the rebuild must at least match. All were measured by the previous team on a Mac
unless stated; the office PCs are Windows 7 / Chrome 109, several Core 2 Duo.

| What | Figure | Source |
|---|---|---|
| `load()` after one write, old (read all stores) | write 1.1 ms, reload 880-884 ms | db.js:116, commit `cd240f7` |
| One button tap after dirty-store tracking | 884 ms -> 14 ms | commit `cd240f7` |
| Idle sync tick after dirty tracking | 880 ms -> 0 ms | commit `cd240f7` |
| Cold boot | 904 -> 798 ms; boot marks: pad drawn at ~120 ms, bundled seed done 847 ms, all boot work done 928 ms | commits `cd240f7`, `f96f09b` |
| Full `load()` of all stores | 535 ms (comment), 674 ms post-PIN wait, ~95% of it reading the 40,000 GPS events | app.js:14068, commit `4732dac` |
| `gpsevents` re-read cost per batch | 357 ms every few seconds before throttling; throttle now 20,000 ms | commit `cd240f7` |
| Per-record pull apply (old) vs batched | 277-278 ms per page -> 54 ms per page | db.js:193, sync.js:1027 |
| First sync, old: pages x apply time | 135 pages x 600 records; ~162,000 serialised IndexedDB transactions; ~37 s of IndexedDB; 13 s request overhead floor (96 ms x 135); total ~50-90 s on a Mac, "several times that" on Win7/old Android | commit `d348232`, pullapply.js:4 |
| Pull request overhead | 96 ms median per `/pull` before any DB work | sync_server.py:3667 |
| Server: poll that returns nothing (no index) | 94 ms -> 0.1 ms with `records_rev` | commit `8647a37` |
| Server: next-rev allocation (`MAX(rev)`) per push | 43 ms -> 0.03 ms | commit `8647a37` |
| Server: first-screen pass | 888 ms -> 195 ms (`records_store_rev`) | sync_server.py:570 |
| Server: full first-sync drain | 2,359 ms -> 536 ms, 19 requests | sync_server.py:570, commit `8647a37` |
| Database load of idle polling | 100 devices x 15 polls/min = 1,500 polls/min = 141 s of DB time per minute before the index | commit `8647a37` |
| `pruneBefore` | 8,000 expired GPS rows: 3,567 ms (per-row `del`) -> ~1,800 ms in one transaction; walking 40,000 rows with a cursor to delete none: 1,504 ms vs 416 ms for getAll; post-PIN wait with a week of backlog ~4,100 ms -> 674 ms once deferred | db.js:267-276, commit `4732dac` |
| `computeInsights()` | 386 ms uncached, ran every render | app.js:1090, :12441 |
| Review index 178 ms; home render 432 ms (uncached) | every 4 s before memoisation | app.js:1090 |
| `gpsEventsForBus` grouping | 808 ms for 110 crew x 40,000 rows (~4.4 million string rewrites) before grouping once | app.js:1886 |
| `driverOverall` per-check `storeSig` over 40,000 rows | 200 ms | app.js:1121 |
| App rebuild count per first sync | ~40 cache loads/re-renders (one per page) -> 1 load per login after coalescing | commit `3b1e7e8`, app.js:1200 |
| Server cold start | ~10 s assumed in an old comment (sync.js:338); **30-36 s measured** against production (app.js:13459, :13822); roughly 1 request in 25 answers in 30-36 s while still succeeding (sync.js:124) | as cited |
| Request ceilings | pull 25 s, push 15 s, login 8 s / 60 s | sync.js |
| Payload ceilings | Vercel body limit 4.5 MB; pull budget 2.5 MB; push 1.5 MB client / 6 MB server; upload 4 MB | sync_server.py |
| Table growth | triplog ~55,000 rows/year; gpsevents passed 42,000 rows before the 30-day send window | sync_server.py:3701 |

Unmeasured in code: per-store row counts for jobcards, attendance, purchases, fuel, incidents, driverreports,
gatechecks, dutylog, crewnotes, usage (U). A rebuild should count them from production, not from this document.

## 9. Traps (pitfalls recorded in comments or visible in code)

1. **`S.cache` starts as `{}`, which is truthy.** Never test `!S.cache` for "first load"; that made the very first
   `load()` read nothing and boot a blank app with no error. Use the `_cacheLoaded` flag (app.js:1199, commit `cd240f7`).
2. **Dirty set: snapshot, do not consume.** `load()` copies the set, reads, then clears only the names it actually
   read. Clearing at the start loses any write that lands during the awaits; clearing a name that was skipped
   (SLOW_STORES) loses that store's update for good.
3. **A page emptied by redaction still advances the cursor.** The server takes the cursor before `redact_for`. The
   consequence: widening a role's entitlement requires rewinding the client cursors, which is why `SCOPE_V` exists
   (`v2`). **Both** cursors (`lastRev` and `lastRevDeferred`) must be rewound together or the stores gained are the
   only ones not re-read. Switching user on a shared phone must not rewind each time (that is why it is a marker,
   not a role flag).
4. **Deferred stores are only safe because of the second cursor.** The main drain's cursor moves past `gpsevents`;
   dropping the catch-up pass loses them permanently with no warning. Conversely, running the deferred pass every
   tick doubled sync load for nothing (shipped once, commit `3d68153`); `drainPlan` pins both directions. Anywhere a
   cursor is reset (`reset()`, the login scope rewind) both must be.
5. **Cursor must never pass a record the device failed to store** (`pullSkips`/`holdRev`), until 5 tries, after which
   it does and the replica is short. A device can silently miss data: 22 crew added on one phone showed 5 on another.
6. **`maxrev` is read before the page** and the page clamped to it, because the connection is READ COMMITTED and
   `_lock` is per-process while production runs several serverless containers. `rev = MAX(rev)+1` is not an
   atomic sequence; two containers can allocate the same rev, and (I) a long transaction can commit a lower rev
   after a device has already stored a higher cursor. The page rule "never split a rev group" and the byte-trim on a
   rev boundary exist for this. A rebuild should use a real sequence or accept the same window.
7. **Pages are governed by bytes, not rows.** 600 text rows and 600 rows with inline photos are very different
   responses. A page's first rev group over budget is still sent whole (else the device asks for it forever).
8. **Never write a redacted copy back.** `_redacted` records are dropped from the outbox client-side and refused
   server-side. A full copy replaces a redacted one at an unchanged timestamp (`unredact`).
9. **Seed data must not outrank the server.** Bundled defaults are written with `stamp:false` and `updatedAt:1`,
   `notify:false`. Stamping seed rows "now" made them beat corrections and be unfixable; `healSeedClobberOnce` lowers
   poisoned rows back to `updatedAt:1` once, after pushing pending edits.
10. **Tombstones must be read raw by anything deciding whether a record is known** (`_rawAll`), else a deleted record
    is re-created (seed fill, backfills). `all()`/`get()` hide them.
11. **The server corrects some writes and must re-stamp them**, or only other devices see the correction (the author's
    device thinks its own copy is already current). Guard-modified payloads get `updatedAt = max(upd+1, now)`.
12. **Server-side writes into synced stores must set `data.updatedAt`.** Devices order by `data.updatedAt`, not the
    envelope; `_upsert_record` stamps it. A rename that only bumped the envelope was invisible on every phone that
    already had the record.
13. **Clamp future timestamps** (server 5 min, client trusts at most 24 h ahead), or a wrong-clock write is permanent
    under last-write-wins.
14. **The outbox is device-wide but writes carry an author.** Changes made by user X are only sent under X's session
    (`outboxBy`); on a shared yard phone they sit until X signs in again (`heldForOthers`). `Sync.setActor` must be set
    on sign-in.
15. **A refused push is quiet.** It drops "Waiting to send" to zero while the server never has the data. The device
    keeps a quarantine and a toast; clearing it is manual. Likewise an LWW-losing push is dropped without any signal.
16. **`DB.put` computes the outbox key from the store's own key path** (`obj[STORES[store]||'id']`). Using `obj.id`
    made `meta` (keyed `key`) report `undefined` and never enter the outbox. `challans` is keyed `rc`.
17. **`pruneBefore` rules:** one read-write transaction (a cursor or per-row `del` is 3-4x slower); keep rows with no
    timestamp; client windows must be longer than server send windows; never awaited on the login path; it hard-
    deletes without tombstones or outbox so it must never touch a store whose rows the server needs.
18. **Never read all stores on every write** (880 ms). Any rebuilt cache needs per-store dirtiness and must replace
    arrays rather than push into them (`S.cache.x = S.cache.x.concat([row])`) because memo keys use array identity.
    `storeSig` is `count:maxTimestamp`; an edit that does not change `updatedAt`/`at` is invisible to it.
19. **Do not rebuild the screen per arriving page.** Coalesce (700 ms debounce, 2.5 s ceiling) or a first sync does
    ~40 full reloads and renders.
20. **Do not guess the record count from `rev`.** The cursor (136,050) exceeds the row count (81,680); every update
    consumes a new rev.
21. **Do not show a total while the sync is partial.** `tableMax` vs `lastRev` exists so screens can say a figure is
    only the total so far; `complete` is false when `tableMax` is 0, which includes any brand-new device.
22. **The server stores `data` as text with ASCII-escaped JSON and an unquoted `updatedAt` column** (lower-cased by
    Postgres). Any direct reader of production must match both.
23. **Inline photos ride inside records** until uploaded; a driver phone once failed to store crew because of 21 MB of
    inline images. The photo queue itself is also in `localStorage` (5 MB-class quota, no try/catch in `savePhotoQ`): I.
24. **IndexedDB upgrade with the app open in two tabs hangs** unless `onblocked` and `onversionchange` are handled.
25. **Seeded and server-created ids are stable by design** (`dl-base-<crewId>`, `bus-<NORMREG>`, `rv-<id>`, `as-<svc>-<day>`,
    `usage` `<user>|<date>`, `al-<REG>-<name>`) so two writers produce one record, not two. A rebuild that changes id
    formats forks production data.
26. **Redaction list is narrower than the crew record**: `emg*`, `ref*` and `photo` are not removed for non-PII roles.
27. **Last login stamp replaces the whole `users` record** (no merge), and `purge_demo_users` writes a bare tombstone
    `{id,_deleted:true}` (all other fields gone).

## 10. Open items (UNDETERMINED)

- Per-store production row counts other than those in section 8 (no figure in code).
- Whether `jobcards.priority` has more than `high/medium/low`; the `assignees` entry may carry more than
  `{userId,task}`; what writes `coreReturns[].ai`; enum values inside the
  `*_ai.py` outputs; meaning of `buses.hidden`/`buses.disabled` and `parts.img`.
- Whether the missing `emg*`/`ref*` redaction is intended.
- Production `PULL_LIMIT`/`PULL_MAX_BYTES` env overrides (the repo's `vercel.json` sets none; the real Vercel
  environment was not inspectable).
- The stale comment at sync.js:722 says the bundled seed marks every record dirty; `seedFill` uses `notify=false`,
  so in current code the outbox should not start full. Not verified by running.

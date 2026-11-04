# v2 backend contract

Stage 3, server side. **This file is a promise.** The frontend lead builds against
it; if anything here changes after they start, they are told in the same breath and
the change is logged in §10.

Written before any dispatch, from `v2-ux.md`, `DECISIONS.md` (all 14),
`LIVE-ISSUES.md`, `03-data-and-sync.md` and `04-server-and-integrations.md`, and
from the source itself — every line number below was read, not inferred.

**Scope rule that governs everything here.** v1 keeps serving the office against
the same server and the same database for the whole build (`DECISIONS.md §2`). So
this contract has two columns wherever the two clients disagree: what v2 is
entitled to, and what the shared server actually enforces today. Where they
differ, the difference is named, the removal is one edit in one place, and it is
the owner's to approve. A contract that quietly narrowed a live screen would be a
production change made by a document.

---

## 0. The seven things to read first

1. **The read boundary inverts.** `STORE_READ_ROLES` (new, one table) replaces
   "everything not named is sent to every authenticated role". A store absent from
   the table is sent to **nobody**. `_never_for` and `redact_for` are both derived
   from it; neither restates a rule. §3.
2. **The silent write loss is fixed by merging, not by asking.** `updatedAt` comes
   from the pushing device's clock — the same clock the bug depends on — so **no
   screen ever asks a person to adjudicate a clock**. The server merges where
   fields are independent, orders from server-issued facts where a real conflict
   exists, and names a refusal with a reason and a Retry for the residual. Four
   strategies, assigned per store, with one store where the honest answer is "last
   write wins and somebody loses data". §4.
3. **One new store, `nightlist`.** Accepted — §5 says why, and what was verified
   before accepting. Its ordering is **server-stamped**, so it is immune to a wrong
   clock by construction.
4. **No record v1 reads changes shape.** Not one field is added to an existing
   store. §6 says what that forbids.
5. **v2 gets its own IndexedDB name.** `garage-saathi-v2`, not `garage-saathi`.
   This is not tidiness; sharing the name makes v2's first `DB_VERSION` bump break
   v1 on every device that opened v2. §7.
6. **Every v2 write is checked against `_guard_write` before anything is built on
   it.** §10 is that table, and it exists because "Log service" has been
   half-failing for eight weeks (`LIVE-ISSUES.md` issue 8) for want of exactly this
   audit. One row in it is already red.
7. **The first pass is missing the two safety stores.** `gatechecks` and
   `driverreports` — the top band of Attention — arrive behind the full drain on a
   new device. §11.

---

## 1. Transport, envelope, auth

Unchanged from v1 and **frozen**: phones update lazily and old builds call these
paths for weeks (`04 §0.4`).

- Base: same origin. Every path also answers under `/v1/<path>`; any other version
  prefix is 404. v2 calls the **bare** paths.
- `Content-Type: application/json`, UTF-8, both directions.
- Auth: `Authorization: Bearer <uid>.<exp>.<hmacHex>` from `POST /auth/login`.
  12 h, no refresh endpoint, no revocation list, no logout endpoint. A PIN change
  invalidates every outstanding session for that account (the salt is inside the
  signed message, `sync_server.py` §4.3 of `04`).
- Errors: `{"error":"<message>"}` with the HTTP status. Some carry extra keys:
  `retryAfterSec`, `known`, `refused`, `storage`.
- Unknown path: `404 {"error":"not found","sawPath":...,"sawMethod":...}`.
- `OPTIONS` on any path: `204` with CORS headers. Allowed request headers are
  `Content-Type, Authorization` **only** — a browser cannot send `X-Import-Token`.
- Rate limit, keyed on **user id, never IP**: bucket `sync` = 120 req/min across
  `/pull`, `/push`, `/my/coaching`, `/my/reviews`; bucket `upload` = 240/hour on
  `/upload`. Over the line: `429 {"error":"too many requests","retryAfterSec":N}`
  plus `Retry-After`. **It fails open** — if the counter query throws, the request
  proceeds. v2 must not treat absence of a 429 as proof it is under the limit.
- Body: `Content-Length` validated before any read. Missing, negative or over
  6 MiB → `413`. `/push` also caps 1,000 records / 6 MiB. `/upload` caps 4 MiB on
  Vercel.
- Cold start is the dominant latency: ~10 s typical, **30–36 s measured** worst
  case, roughly 1 request in 25. v2 keeps v1's warm-up ping on the PIN pad and the
  60 s login timeout for owner/supervisor/crewmanager (they have no offline login
  at all).

### 1.1 Roles

`owner, supervisor, crewmanager, office, store, mechanic, driver, conductor`.
`MANAGER_ROLES = (owner, supervisor)`. `PII_ROLES = (owner, supervisor,
crewmanager)` — **PII_ROLES stops being a read-authorisation set in v2** and
becomes only the field-redaction set (§3.3).

---

## 2. Endpoints

44 API routes. **v2 calls 14 of them** (marked ★). The rest are listed because the
contract is the whole server surface and a slice must not invent a 45th.

Auth key: **S** = session bearer. **—** = none. **GPS** = `GPS_INGEST_TOKEN`.
**AK** = `Authorization: Agent <key>` + scope. **T** = trigger token
(`REDPRO_INGEST_TOKEN` or `AI_CRON_TOKEN`).

| # | Method | Path | Auth | Roles | Request | Success | Errors | Idempotent |
|---|---|---|---|---|---|---|---|---|
| 1 ★ | GET | `/health` | — | anyone | — | `200 {ok,db,dbMode,dbOk,commit,build,schemaVersion,protocol,flags,rateLimit{},photos,r2{},gpsIngest,…}` | never non-200 — **the truth is in the body, not the status** | yes |
| 2 | GET | `/` + static | — | anyone | — | the shell; `s-maxage=600`, `sw.js` `no-cache` | 404 | yes |
| 3 | GET | `/uploads/<32hex>.(jpg\|png\|pdf)` | — | anyone | — | the file | 404 | yes; dead on Vercel (photos are on R2) |
| 4 ★ | GET | `/roster` | — | anyone | — | `200 {users:[{id,name,role}]}` | — | yes |
| 5 ★ | GET | `/my/coaching` | S | all 8 | — | `200 {notes:[{week,hi,en,at}]}` ≤6, newest first | 401, 429 | yes |
| 6 ★ | GET | `/my/reviews` | S | all 8 | — | `200 {crewId,reviews:[…],days:90}` ≤300, no PNR/seat/time; `{crewId:null,reviews:[]}` if the login has no crew record | 401, 429 | yes |
| 7 ★ | GET | `/pull` | S | all 8 | §2.1 | §2.1 | 401, 429; non-integer `since` **drops the connection with no 400** (`04 §8.5.8`) — v2 must never send one | yes (cursor) |
| 8 | GET | `/gps?busId=&odo=&reg=` | S | all 8 | query | `200` provider record, **or a simulated track** with `source:"simulated"` | `400 busId required`; non-numeric `odo` uncaught | yes |
| 9 | GET | `/push/vapid` | — | anyone | — | `200 {publicKey,enabled,webpush,keyEnv,secretFile}` | — | yes |
| 10 | GET | `/gps/latest?reg=` | GPS \| AK(`gps`) \| S | provider, agents, all 8 | query | `200` stored record | `404 no telemetry for reg`, `403` | yes |
| 11 | GET | `/gps/fleet` | AK(`gps`) \| S | agents, all 8 | — | `200 {buses:[{reg,odometer,lastPing,lat,lng,speedKph,ignition}]}` | `401` for the GPS token | yes |
| 12–14 | GET | `/agent/crew`, `/agent/coaching`, `/agent/bus-papers` | AK(`crew`\|`coaching`\|`papers`) | agents only | see `AGENT_API.md` | per `AGENT_API.md`, field by field | `401`, `403`, `404 unknown bus` | yes |
| 15 | GET | `/wa/webhook` | `WA_VERIFY_TOKEN` in query | Meta | handshake | `200` echo of `hub.challenge` | `403` | yes |
| 16 ★ | GET | `/challans?rc_no=` | S | owner, supervisor | query, plate padded server-side | `200` + **writes** the `challans` snapshot | `400 rc_no required`, `402 credits exhausted`, `501` key unset, `502` | **no — each uncached call bills a credit.** The UI shows the price before the button (`ux §5.1`) |
| 17 ★ | POST | `/auth/login` | — | anyone | `{userId,pin}` | `200 {token,user:{id,name,role}}` | `401 {error:"invalid PIN",known}`, `403 demo_pin\|default_pin\|account_disabled` (all `known:true`), `429 {retryAfterSec}` | no — stamps `lastLoginAt`, writes a `users` revision |
| 18 | POST | `/odometer/submit` | S | owner, supervisor | `{phone,image,dry?}` | `200 {status:enrol\|unreadable\|held\|accepted,reply,…}` | `400` | no |
| 19 | POST | `/wa/webhook` | Meta HMAC | Meta | Meta payload | `200 {ok:true}` always | `403` bad sig, `503` no secret | no (no message-id dedupe) |
| 20 ★ | POST | `/auth/users` | S | owner any role; supervisor store/mechanic/driver/conductor | `{name,role,pin}` | `200 {user:{id,name,role}}` | `400`, `403` | **no — a second call makes a second account** |
| 21 ★ | POST | `/auth/users/rename` | S | owner, supervisor (not an owner account) | `{id,name}` | `200 {ok,user:{id,was,name,role}}` | `404`, `403` | yes |
| 22 ★ | POST | `/auth/users/delete` | S | owner | `{id}` | `200 {ok,deleted:{…}}` + tombstone | `400` self/last owner, `404` | yes |
| 23 ★ | POST | `/auth/setpin` | S | self any role; owner any; supervisor store/mechanic/driver/conductor | `{pin,userId?}` | `200 {ok}` | `400` not 4 digits / retired, `404` | yes; **not rate limited** |
| 24 | POST | `/admin/backfill-contacts` | S | owner, supervisor | `{records:[…]}` | `200 {ok,added,merged}` | `413` | yes (fills empty fields only) |
| 25 ★ | POST | `/auth/register-roster` | S | owner, supervisor | `{crew?:[…]}` | `200 {ok,created,pins:{id:pin},reset}`, `no-store` | — | yes for existing; creating is one-shot | 
| 26 ★ | POST | `/push` | S | all 8, per-store matrix | §2.2 | §2.2 | `413`, 401, 429; `403` only for a **single-record** push where nothing applied | §4 |
| 27 ★ | POST | `/admin/import` | S **and** `X-Import-Token` | owner | `{records:[…],force?}` | `200` | `403`, `409` non-empty DB | yes; **bypasses the write matrix and every guard** |
| 28 | POST | `/upload/delete` | S | owner, supervisor, crewmanager | `{urls:[≤200]}` | `200 {ok,removed}` | — | yes |
| 29 ★ | POST | `/upload` | S | all 8 | `{data:"data:…;base64,…"}` | `200 {url}` | `400` bad base64 / not JPEG-PNG-PDF (magic bytes, declared MIME ignored), `413`, `503 {storage:true}` | **no — new random name each call** |
| 30 | POST | `/ai` | S | owner, supervisor | `{question≤2000,context,biz≤80}` | `200 {text,looked:[…]}` | `400`, `429`, `501`, `502` | no |
| 31 | POST | `/ai/vision` | S | owner, supervisor | `{image,prompt}` | `200 {text}` | as above | no |
| 32 ★ | POST | `/push/subscribe` | S | all 8 | `{subscription:{endpoint,keys}}` | `200 {ok}` | `400 {ok:false}` — endpoint must be https:443 on the push-host allow-list (SSRF guard) | yes (upsert by endpoint) |
| 33 | POST | `/push/test` | S | all 8 | — | `200 {ok,sent,webpush}` | — | no |
| 34 | POST | `/its/lookup` | S | owner, supervisor (`diag`: owner) | `{pnrs:[≤10],diag?}` | `200 {ok,asked,lookedUp,found,driverMatched,skipped,left}` | `400`, `501`, `502`, `503` | yes in effect (per-PNR cache) |
| 35 ★ | POST | `/ai/bill` | S | owner, supervisor, store | `{photo}` | `200 {ok,bill:{…},checks:{…},model}` | `400`, `403`, `422` unreadable, `429`, `501`, `502` | no |
| 36–43 | POST | `/ai/digest`, `/ai/coaching`, `/ai/coaching/decide`, `/ai/reports`, `/ai/core`, `/ai/gate`, `/ai/names`, `/ai/reviews` | T \| S | per `04 §1` rows 36–43 | per `04 §6` | per `04 §6` | `501`, `502`, `429` | yes (hash/week keyed) except `decide` |
| 44 | POST | `/redpro/ingest` | `REDPRO_INGEST_TOKEN` only | office collector | `{kind,rows:[≤2000],capturedAt}` | `200 {ok,kind,written,skipped,maxRev}` | `400`, `401`, `503` | yes |
| 45 | POST | `/gps/ingest` | GPS only | provider | `{events:[…]}` | `200 {ok,accepted,events}` | `400`, `401`, `503` | **no — a retry duplicates events** |

(Rows 1 and 3–45 are the 44; row 2 is the shell.) **No endpoint is added by v2.**
Every v2 need is served by `/pull`, `/push` and the existing account routes. A
slice that wants a 45th route escalates to the lead instead of adding one.

### 2.1 `GET /pull`

```
GET /pull?since=<int>&deviceId=<id>[&store=a,b][&defer=c,d]
→ 200 { records: [{store,id,data,updatedAt,rev}],
        maxRev: <int>, more: <bool>, tableMax: <int>,
        serverTime: <ms>, flags: [<string>], protocol: 1 }
   Cache-Control: no-store
```

- `since` **must** be an integer. A non-integer raises uncaught in the handler and
  the connection drops — there is no 400 to handle.
- `store=` fetches only those; `defer=` skips those for now. Names must match
  `^[a-z][a-z0-9]{1,30}$`, ≤40 each. **Neither can widen what a role may see**, and
  asking for a store the role may not see returns nothing and leaves the cursor
  where it was.
- Paging: `ORDER BY rev`, `LIMIT 2000`, trimmed to ~2.5 MB **at a rev boundary**; a
  page never splits a rev group; if the first group alone is over budget it is sent
  whole. `MAX(rev)` is read **before** the page and the page clamped to it.
- `maxRev` is the cursor to store: the last rev actually sent, or the table maximum
  when the page did not fill. `more = cursor < maxrev`. `tableMax` is for progress
  only (`behind = tableMax - lastRev`).
- **A record withheld by redaction still advances the cursor.** Widening a role's
  entitlement therefore requires rewinding **both** client cursors (`lastRev` and
  `lastRevDeferred`), which is what `pullScope`/`SCOPE_V` exists for. §3.5.
- `flags` is the `FEATURE_FLAGS` env list; a flag is off unless named.

### 2.2 `POST /push`

```
POST /push  { deviceId, records: [{store,id,data,updatedAt}] }   ≤1000 recs, ≤6 MiB
→ 200 { ok:true, applied:<int>, rejected:<int>,
        refused: [{store,id,reason, server?:{data,updatedAt}}],
        maxRev:<int> }
```

Per record, in this order (do not reorder — each step depends on the one before):

1. `may_write(role, store)` — `SERVER_INGEST_ONLY` first, **owner included**, then
   the `WRITE_ROLES` allow-list; an unknown store is denied for every role except
   owner. Refusal reason: `role may not write this store`.
2. `id` is a string ≤200 chars with no `< > " ' \` &` or control characters; `data`
   is an object; `data[keyPath] == id` (`key` for `meta`, `rc` for `challans`, else
   `id`); `_redacted` copies are refused.
3. Server stamps from the token, overwriting the body: `_by`, `_byRole`,
   `_org="mahalaxmi"`, and `_createdBy`/`_createdRole` preserved from the first
   write. **v2 must tolerate these on read and never send them as truth.**
4. `updatedAt` clamped to now + 5 min.
5. `_guard_write` — may refuse, **or correct**. A corrected payload gets
   `updatedAt = max(upd+1, now)` so the author's own device pulls the correction.
6. **Write only if the row is new or `updatedAt` is strictly greater.** This is the
   step `LIVE-ISSUES.md` issue 1 lives in. §4 changes it.
7. Side effects: a `parts` qty change logs `stockmoves`; a `drivers` write syncs
   `disabledlogins`; a `gatechecks` record newly `awaiting` web-pushes
   owner/supervisor.

**New in v2 (§4).** Step 6 gains an else branch. A record that loses the comparison
is named in `refused` with `reason:"stale"` and, when it fits the byte cap, the
stored copy in `server`. It is **not** counted in `applied` and **is** counted in
`rejected`.

**Idempotency, per write.** Replaying an unchanged text record is harmless
(last-write-wins, equal timestamp does not apply). Replaying into an append-only
store (`ledger`, `dutylog`, `crewnotes`, and `fuel`/`def`/`audits`/`attendance` for
non-managers) is **refused today even though the first write landed** — a real gap
named in `04 §3.2`. **v2 closes it:** same store, same id, byte-identical payload
after server stamps are removed ⇒ `applied`, not `refused`. This is a server change
that also helps v1 (it only turns a refusal into a success) and it is slice B3.

---

## 3. The read boundary

> `LIVE-ISSUES.md` issue 2. `ux §4.3`: *"it is cosmetic unless the server changes."*
> This is the single largest item in stage 3.

### 3.1 What is wrong today, in one sentence

`redact_for` (`sync_server.py:3775`) names the stores it withholds and returns
**everything else to every authenticated role**, so a `conductor` token — which
holds **zero** capabilities in `PERMS` and reaches **zero** routes — can `/pull`
supplier bills, purchases, the vendor registry, parts, the stock ledger, job-card
costs, fuel, driver trip cash, challan liabilities, garage settings, all-staff
attendance, and gate checks with their selfies. Plus crew `emgPhone` and `refPhone`,
which are not in `_DRIVER_PRIVATE`.

### 3.2 The mechanism

One table, `STORE_READ_ROLES`, is the only place a read rule is written.

```python
# Deny by default. A store absent from this table is sent to NOBODY.
# `_never_for` and `redact_for` are both DERIVED from it; neither restates it.
STORE_READ_ROLES = { "<store>": frozenset({...roles...}), ... }
```

Derived, not duplicated:

- `_never_for(actor)` = every store whose read set does not contain the actor's
  role, **plus** every store in `OWN_ROWS_ONLY` is *kept* (it still needs reading;
  the per-record predicate narrows it in SQL, §3.4).
- `redact_for(actor, rec)` returns `None` when `role not in
  STORE_READ_ROLES[store]`, before anything else. The age window and the field
  redaction run after, unchanged in spirit.
- An **unknown** store is `None` for every role — the inverse of today. (A new
  store therefore reaches nobody until it is added to the table, which is the
  property that makes `nightlist` safe to add.)

The asymmetry that `_never_for`'s own docstring warns about still holds and is
preserved: naming one store too few in the SQL skip costs a little reading; naming
one too many means every device with that role silently never receives it. The
derivation removes the chance of the two disagreeing, which is the whole point.

### 3.3 The matrix

`v2` = what the v2 screens entitle a role to, derived from `ux §4.1`/`§4.2`.
`v1-compat` = extra roles kept **only** because a live v1 screen reads the store
(route lists from `02 §1`); every one is a row to delete at cutover and is the
owner's to approve early. `·` = same as `v2`.

| Store | v2 read roles | v1-compat adds | Why the compat row exists |
|---|---|---|---|
| `users` | all 8 | · | login roster, names everywhere |
| `meta` | all 8, money fields stripped below manager (§3.3a) | · | geofence + late cutoff for check-in |
| `buses` | all 8, `crewPhone` stripped below PII | · | bus picker on Me's "something is wrong with my bus" |
| `drivers` | owner, sup, crewmgr full; office stripped; **driver/conductor own row only** | · | — |
| `parts` | owner, sup, store, mechanic | · | mechanic reads Store |
| `jobcards` | owner, sup, store, mechanic | · | mechanic own-card narrowing is **deferred**, see §9 R3 |
| `ledger` | owner, sup, store | mechanic | v1 `store` route is in mechanic's 5; blanking its movement trail is a live regression |
| `purchases` | owner, sup, store | — | — |
| `vendors` | owner, sup, store | — | — |
| `audits` | owner, sup, store | — | unchanged from today |
| `stockmoves` | owner, sup, store | — | unchanged from today |
| `components` | owner, sup, store, crewmgr | — | — |
| `def` | owner, sup, store, crewmgr | — | — |
| `fuel` | owner, sup, store, crewmgr | — | — |
| `attendance` | owner, sup all rows; **every other role own rows only** | · | — |
| `usage` | **owner** all rows; every role own row only | supervisor | v1's `usage` route is a supervisor route; `ux §4.1 #5` and `§4.3` ask for owner-only |
| `incidents` | owner, sup, crewmgr, office | — | — |
| `driverreports` | owner, sup, store, mechanic all; **driver/conductor own only** | · | — |
| `routes` | owner, sup | — | screen dropped, data kept |
| `triplog` | owner, sup | driver (own rows) | v1 driver logs stop arrivals |
| `trips` | owner, sup | driver (own rows) | v1 driver's trip-cash card |
| `challans` | owner, sup | — | — |
| `breakdowns` | owner, sup | — | — |
| `gatepasses` | owner, sup, store | — | — |
| `gatechecks` | owner, sup, crewmgr | driver (own rows) | v1 driver's `gate` route — their **only** route |
| `dutylog` | owner, sup, crewmgr | — | today: all roles |
| `nightlist` | owner, sup, crewmgr | — | new (§5) |
| `gpsevents` | owner, sup | — | unchanged |
| `rbservices` | owner, sup, crewmgr, office | driver | v1 gate check's service picker |
| `rbreviews`, `rbcomplaints` | owner, sup, crewmgr; office with `pnr,tin,seats,fare,boardAt,doj,amount` stripped | — | unchanged |
| `rbassign`, `rbreviewai` | owner, sup, crewmgr, office | — | unchanged |
| `rbalias` | owner, sup, crewmgr, office | — | office displays traced reviews |
| `rbaliasai` | owner, sup, crewmgr | — | the name queue is `manageDrivers` |
| `itslookup` | owner, sup | — | carries a PNR; crewmgr loses it |
| `gateai` | owner, sup | — | unchanged |
| `coreai`, `reportai` | owner, sup, store | — | unchanged |
| `coachai` | owner, sup, crewmgr | — | crew read their own via `/my/coaching` |
| `crewnotes` | owner, sup, crewmgr, office | — | unchanged; **never reaches its subject** |
| `digest` | owner, sup | — | unchanged |
| `aimeta` | **nobody** | — | unchanged |
| `gpslive` | **nobody** | — | never was a client store |
| `odometerlogs` | **nobody** | — | not in any client's `STORES`; was being sent to PII roles and discarded |
| `waconv` | **nobody** | — | keyed by a crew member's phone number |

**What closes immediately, with zero v1 risk.** `conductor` reaches zero routes in
v1, so after this table a conductor token receives exactly `users`, `meta`, `buses`
(no `crewPhone`), its own `drivers` row, its own `attendance`, its own
`driverreports` and its own `usage` row. The headline of issue 2 is gone the day
this lands. `mechanic`, `office` and `crewmanager` lose most of the financial
stores on the same day — `crewmanager` stops receiving supplier bills and the stock
ledger, `office` stops receiving the entire workshop and money side, `mechanic`
stops receiving purchases, vendors, fuel, trips, challans and gate selfies.

**What does not close until the owner says so.** Six `v1-compat` rows. Each is one
line in one table; §9 hands over the list and what each role stops being able to
see on its v1 screens.

#### 3.3a Field redaction (second layer, after the store check)

| Applies to | Fields removed | For | Change |
|---|---|---|---|
| `drivers` (not own row) | `phone, altPhone, address, dob, bloodGroup, license, docs, salaryMonthly` **+ `emgPhone`, `emgName`, `emgRelation`, `refPhone`, `refName`** | roles below PII | **`emg*`/`ref*` added** — `LIVE-ISSUES.md` 2, `03 §9.26`, Q11 |
| `buses` | `crewPhone` | roles below PII | unchanged |
| `odometerlogs` | — | — | store now reaches nobody |
| `rbreviews`, `rbcomplaints` | `pnr, tin, seats, fare, boardAt, doj, amount` | `office` | unchanged |
| `meta` (`garage`) | `labourRate, latePenalty, lateGraceDays, latePenaltyCap, dailyRevenue` | roles below manager | **new** — one row currently hands the labour rate and daily revenue to every login |

Any record that lost a field carries `_redacted:true`, is never pushed back by the
client, and is refused by `/push` if it is. A full copy replaces a redacted one at
an **equal** timestamp (the un-redaction exception in `pullapply`).

### 3.4 Per-record ownership, in SQL not after it

Four stores are "own rows only" for some roles. These **must not** be filtered
after the page is read: `attendance` alone grows ~100 people × 2 × 365 rows a year,
and handing a driver's phone the whole table to drop 99% of it recreates exactly
the bug `_never_for` was written to cure — a new device spending its first sync on
pages that redaction empties.

```python
OWN_ROWS_ONLY = { "attendance":    ("userId",  <roles restricted>),
                  "usage":         ("userId",  ...),
                  "drivers":       ("userId",  ...),
                  "driverreports": ("_createdBy", ...),
                  "trips":         ("driverId", ...),
                  "triplog":       (<own bus>, ...),
                  "gatechecks":    ("userId",  ...) }
```

`pull()` adds a dialect-aware predicate to **both** of its statements (the bound
read and the page read — they must use the same filter or completing a rev group
readmits an excluded row). Postgres `(data::jsonb->>'<field>') = %s`, SQLite
`json_extract(data,'$.<field>') = ?`. `redact_for` enforces the same predicate as
the backstop, derived from the same map. `triplog`'s "own bus" needs the actor's
crew record, so it falls back to post-filtering with the store still in the page —
named as a known cost, not hidden.

### 3.5 Rewinding the cursor when entitlement changes

Narrowing is safe. **Widening is not**, because a record withheld by redaction
still advanced the cursor. So:

- `pullScope` gains `:v3`. Any login whose stored scope marker differs rewinds
  **both** `lastRev` and `lastRevDeferred` to 0. Both, together, always — rewinding
  one leaves the stores gained as the only ones not re-read (`03 §9.3`, `§9.4`).
- Switching user on a shared phone must **not** rewind. It is a marker, not a role
  flag.

### 3.6 The test that makes this real

`test_readscope.py`, extending `test_pullscope.py`'s pattern rather than restating
rules (the brief's instruction, and the existing file's own design):

1. For **all 8 roles × all 45 store names**: if the role is not in
   `STORE_READ_ROLES[store]`, `redact_for` returns `None` **and** the store is in
   `_never_for`. Both directions, every pair — 360 assertions.
2. The sweep list of store names is spelled out, not imported, so adding a store
   and forgetting it shows up as a gap rather than as silence (this is why
   `test_pullscope.py` does the same).
3. End to end: seed one record per store plus a wall of GPS events, drain `/pull`
   for each role, and assert the received set **equals** the entitled set — not
   merely that nothing extra arrived, which a scoping bug would also satisfy.
4. Named regressions, each its own check, each failing today:
   a conductor receives no `purchases`, no `ledger`, no `jobcards`, no `fuel`, no
   `trips`, no `challans`, no `meta.labourRate`, no `gatechecks`, no other
   person's `attendance`; a mechanic receives no `purchases`/`vendors`; an office
   login receives no `jobcards`/`ledger`; a crewmanager receives no
   `purchases`/`ledger`; `emgPhone` and `refPhone` are absent from every non-PII
   role's `drivers` records.
5. Per-record: role × store in `OWN_ROWS_ONLY` receives its own row and not a
   colleague's, **and the page it arrives in is not empty** (the scoping, not just
   the redaction).
6. The v1-compat rows are asserted **present**, each named with the v1 route that
   needs it. Deleting a compat row must be a deliberate edit in two places, so
   nobody removes one by accident mid-build.

Every Python test here pops `DATABASE_URL`/`TURSO_URL`/`TURSO_DATABASE_URL` and
points `DB_PATH` at a tempfile, exactly as the existing 38 do. No test touches
production.

---

## 4. The silent write loss, and the clock it depends on

> `LIVE-ISSUES.md` issue 1. `DECISIONS.md §14`: v2 starts from the same code, so
> **v2 starts with the same bug**, and fixing it is a stage-3 slice.

### 4.0 The correction that reshaped this whole section

The first version of this contract fixed the drop by naming it in `refused` and
having the client re-apply its change on top. That is still the fallback, and it is
still needed — but it was the wrong *primary* answer, and the stage-2 Job card
designer caught why before anything was built: **`updatedAt` is stamped by the
pushing device's clock, and it is the same clock the bug depends on.**

```python
if row is None or upd > (row[0] or 0):   # upd comes from the phone
```

- A phone set **forward** wins every comparison. Its writes always land, everybody
  else's are dropped — silently today, and under a naive fix with a prompt blaming
  the wrong person.
- A phone set **back** loses every comparison. Its user is asked to confirm an
  overwrite on *every save*, learns the dialog means nothing, and clicks through. A
  confirmation people have been trained to dismiss is worse than none, because it
  launders data loss into consent.

So this section is now built on one rule:

> **No screen ever asks a person to adjudicate a clock.** There is no "Overwrite?",
> no "this changed on another device — keep mine or theirs?", no timestamp shown as
> a tie-break. A conflict a person must see is a **named refusal with a reason and
> a Retry**, nothing else. Both stage-2 designers have already written their screens
> that way and this contract does not require them to change.

And on one consequence: wherever ordering is genuinely needed, it comes from
**server-issued** facts — `rev`, server time, `_by` from the token — never from
`data.updatedAt`. The server already clamps future skew (`MAX_FUTURE_SKEW_MS`, 5
min) and already marks a suspicious clock (`attendance.atUnverified` when a stated
time is >10 min before receipt). Those are the signals to use; `updatedAt` is not
one.

### 4.1 The four strategies, and the fifth honest answer

Every store gets exactly one of these. §4.4 assigns them.

| | Strategy | When it applies | What it costs |
|---|---|---|---|
| **F** | **Field-level merge, by domain rule** | The fields are independent, so there is no ordering question to answer. The server merges and **re-stamps** — nothing is dropped and no clock is consulted. | A domain rule per store that is decidable without knowing intent. `_merge_parts_used` already is one: *"a missing line is a stale device, not a removal, because the stock already left the store."* |
| **S** | **Server-ordered sequencing** | A real conflict exists on one value, and the server can order the two writes from something it issued itself. | Only works where the server can see which value changed. |
| **A** | **Append-only** | The data allows restructuring so no two writers ever touch one row. `stockmoves` already demonstrates it in this codebase, as do `ledger`, `dutylog` and `crewnotes`. | Costs a shape, not a mechanism — and it is the only strategy with no conflict at all. |
| **R** | **Named refusal** | The residual: a genuine same-value collision that no domain rule decides. The server names it in `refused` with a distinct reason; the client re-reads the server's copy, re-applies, and after a bounded number of rounds surfaces it with a reason and a Retry. | Visible to a person — which is the point. Never a dialog. |
| **—** | **"Last write wins and somebody loses data"** | Nowhere this contract can honestly claim otherwise. | Said in those words, in §4.4, rather than left looking solved. |

### 4.2 Why **F** is the primary answer, and why it needs no new mechanism

The server already has the machine for this, and it is already live for one field.
`push()` step 5 runs `_guard_write`, which *"does not only accept or refuse: it
**corrects**"* — and step 5's own comment explains the rest:

> A changed payload gets a later timestamp so its author sees it too.
> `upd = max(upd + 1, now_ms())`

A payload corrected by `_guard_write` is **re-stamped above the stored row**, so
step 6's comparison cannot drop it. That is why `partsUsed` has never been lost to
staleness while the rest of the card has. **Extending the merge is therefore the
whole fix for every F store, and it changes the ordering condition not at all.**

Three things follow, and they are the reason this is better than what I published
first:

1. **Nothing is dropped and nothing is surfaced** for an F store. Two people on one
   job card touching different fields is the ordinary case, and *losing the whole
   record over one collision is the actual defect* — not the absence of a prompt.
2. **The client-side three-way merge mostly disappears.** It is needed only for R
   stores, and for those the honest client behaviour is re-read, re-apply, then
   surface — not a reconstruction from a base snapshot. The `outboxbase` store
   shrinks to the R stores and the merge classes collapse into the table below.
   This also retires the riskiest claim in the first draft of this contract (that a
   base snapshot is bounded by what the user edited — false for a job card photo
   array with a failed upload riding inline).
3. **It helps v1 too, in the direction of losing less.** Named as a behaviour
   change in §9(f), because it is one: a v1 push that loses the comparison today
   would be merged instead. It adds no new refusal and removes no data. The owner
   can veto it; nothing else in stage 3 depends on it.

### 4.3 What the server does, in order

`sync_server.py:3495` today, with **no else branch**:

```python
if row is None or upd > (row[0] or 0):
    ...
    applied += 1
# ← the record falls off the end of the loop and the response says 200
```

v2's server:

1. **`_guard_write` merges** per the F rule for that store (§4.4) and the payload is
   re-stamped by the existing `max(upd+1, now)` line. The record applies. **This is
   the path almost every write takes.**
2. If no F rule decides it, the else branch fires:

```python
else:
    rejected += 1
    entry = {"store": store, "id": rid, "reason": "stale"}
    if <stored copy under STALE_COPY_MAX_BYTES>:
        entry["server"] = {"data": <stored data>, "updatedAt": row[0], "rev": row[1]}
    refused.append(entry)
```

- `reason` is the literal string `"stale"`, distinct from every existing refusal
  reason (all of which are prose sentences). v2's client switches on it; v1, which
  is not changed, treats it as a refusal and quarantines — **strictly better than
  today**, where v1 loses the record silently and says it sent. That is the one way
  this fix touches v1's behaviour and it is an improvement.
- `rev` is returned beside the copy because it is the one ordering fact the client
  can trust. It is **not** used as a count or assumed unique (`03 §9.20`: the cursor
  136,050 already exceeds the row count 81,680; and issue 3's collision window is
  real). It is used only as "the server issued this after that".
- `server` is omitted above `STALE_COPY_MAX_BYTES` (256 KiB, env-overridable) so one
  stale job card with inline photos cannot become a 6 MiB response.
- **Idempotent replay** (§2.2) is checked before any of this: same store, same id,
  payload byte-identical after server stamps ⇒ `applied`. A retry into an
  append-only store after a lost response stops being a refusal.

### 4.4 Per store: the strategy, and the rule

| Store | | The rule, stated so a builder cannot interpret it two ways |
|---|---|---|
| `jobcards` | **F** + R | Arrays union **by element id**, never replaced: `partRequests` (`pr-…`), `coreReturns` (`cr-…`), `busMoves` (by `at`+`by`), `beforePhotos`/`afterPhotos` (by URL string). `partsUsed` keeps the existing `_merge_parts_used` untouched. Scalars written by exactly one role resolve by **non-null wins, then larger**: `startAt`, `completeAt` (mechanic only — `DECISIONS.md §6`), `labourHours`, `odometer`, `enterAt`, `outAt`. Sign-off (`closedBy, closedAt, verifiedBy, verifiedAt`) and a mechanic's `assignees`/`assignedTo` are server-truth and are never taken from the body — unchanged. **R only** for `problem`, `priority`, `remark`, `notes`, `status` — free text and state two people genuinely can disagree on. This is safe *because* v2 divides the card's fields between people (`ux §6`); the division is not relaxed by the merge getting better. |
| `parts` | **—** | **Honest answer: last write wins and somebody's decrement is lost.** `qty` is a mutable scalar two storekeepers can both decrement offline; there is no domain rule that decides it and no server-issued fact that orders it, because the server cannot tell a correction from a second issue. `ledger` is the authority and is append-only; `stockmoves.justified=false` is what *exposes* the loss. `03 §5.5` says it plainly — those two stores "exist to expose this, not prevent it." **v2 does not fix this and must not look as though it has.** A later `Night`-style restructuring (qty derived from the ledger) would, and it is a shape change to the hottest store in the app: not stage 3's. |
| `ledger`, `crewnotes`, `dutylog`, `stockmoves` | **A** | No conflict possible. A replay is now success (§2.2) rather than a refusal. A second `dl-base-<crewId>` is already a server no-op. |
| `audits`, `fuel`, `def` | **A** for non-managers (already enforced), **F** for managers | Independent scalar fields; `lines` union by `partId`. |
| `attendance` | **A** for non-managers (already enforced), **F** for managers | `userId`, `receivedAt`, `atUnverified` are server-truth. **Use `atUnverified`** — it is already the server's verdict on a suspicious clock; do not re-derive one. |
| `purchases` | **F**, narrowed | A non-manager may only ever change `paymentStatus, paidAt, paidBy`, so that is the entire merge surface and it cannot collide with a manager editing amounts. `lines` union by `partId`. |
| `buses` | **F** | The high-traffic store: odometer arrives from a fuel fill, a job card, the WhatsApp capture and document edits. `odometer`, `odometerAt`, `lastServiceOdo` merge as **max** — *a lower reading is never the newer truth*, which is a domain rule and needs no clock. `docs` union by `(type, number)`. `photos` union by URL. **R** for `regNo`, `company`, `model`, `chassis`, `engine`. |
| `drivers` | **F** + R | `docs` merge by document key; scalar profile fields independent. **R** for `busId`/`driverSlot` — a seat change is single-owner and a real collision. A `_redacted` copy is never pushed, so a non-PII device can never merge away a field it cannot see. |
| `meta` (`garage`) | **F** | One row, rewritten whole from each editor's cache today. Every setting is an independent field, so field merge is the entire value here: two people changing the labour rate and the late cutoff stop overwriting each other. |
| `users` | server-truth | Only `name` is client-written; `lastLoginAt` replaces the whole record on login (`03 §9.27`). `name` merges, nothing else. |
| `trips` | **F** + R | `expenses` union by element id; an already-claimed expense cannot be changed or removed (already enforced). Bus, allowance and start are frozen; a closed trip is frozen entirely, so a stale push onto one is a refusal, not a merge. |
| `triplog` | **A** | One arrival per stop per bus per day; never edited. |
| `components` | **F** | `history` union by element — append-only in effect. `state` is **R**. |
| `gatechecks` | **F** + R | `items` merge **per item key**, with the `_merge_parts_used` domain rule applied: *an item absent from the incoming write is a stale device, not an un-tick*, so it is restored from the stored copy. An item present in both with different content is **R** — rare by construction, since the gate round is one person with one phone (`DECISIONS.md §12`). `GATE_FIXED`, `releasedAt`, `sentAt`, `decision.*`, `failedBefore`, `pastDecisions` stay server-accumulated. |
| `driverreports` | **F**, narrowed | A reporter may only move `status` to `cancelled` while open and unlinked; that is the whole surface. |
| `incidents`, `breakdowns`, `vendors`, `gatepasses` | **F** | Independent fields; `gatepasses` return fields are single-owner. |
| `routes` | **F** | `stops` union by stop `id`. |
| `usage` | **F**, additive | `screens`, `acts`, `taps` **add**; `slow` merges per key keeping the worse `worstMs`; `firstAt` min, `lastAt` max. Addition is a domain rule — no ordering, no clock. This also fixes the known two-devices-one-day clobber (`03 §5.5`) now that a role receives its own row (§3.3). |
| `nightlist` | **S** | Per-bus entries, ordered by **server time**: `_guard_write` stamps each changed entry's `at` from the server and its `by` from the token, exactly as `attendance.receivedAt`, `dutylog.by` and `gatechecks.decision.at` are stamped today. So per-bus last-write-wins is **server-ordered, not clock-ordered**, and a phone with a wrong clock cannot win or lose a tick. The store is new, so there is no v1 copy to keep compatible — it is immune by construction, which is the advantage of adding a store rather than a field. §5. |
| `challans`, `gpsevents`, `gpslive`, `odometerlogs`, `waconv`, `itslookup`, `rb*` ingest, all `*ai`, `digest`, `aimeta` | — | Server-written; no client pushes them, so staleness cannot arise. |
| `rbalias` | **F** | A person's write clears the AI's `auto/reason/evidence`; `history` is server-accumulated. |

### 4.5 What the client does (`v2/sync.js` only — v1's `sync.js` is not touched)

Today, `v2/sync.js:850` clears the whole batch under `// everything else landed`.
That comment is false for a staleness drop. Make it true:

- `reason === 'stale'` is **not** a refusal. Take `server.data`, re-apply this
  device's change, stamp `updatedAt = max(server.updatedAt + 1, Sync.now())` — the
  `+1` because the server compares **strictly** greater and an equal timestamp
  loses silently, which is the bug — write with `putRaw`, **keep the key in the
  outbox**, push on the next tick.
- `server` omitted (over the cap) ⇒ defer the key one tick and let the next `/pull`
  deliver the copy, inside the same retry budget.
- `STALE_RETRIES = 2` rounds, then quarantine with `reason:"stale-unresolved"` and
  surface through the existing `cbRefused` path with a reason and a Retry. **Never
  an unbounded loop, and never a dialog.** This is `ux §7` measure 7: *every one
  surfaced, with a reason and a retry.*
- Every other reason quarantines exactly as today. That path was fixed deliberately
  and its comment says why; do not regress it.

Because the server now merges the F stores, this client path carries only the R
cases — a much smaller surface than the first draft of this contract assumed.

### 4.6 The tests

`test_pushstale.py`: a losing push on an **R** field is in `refused` with
`reason:"stale"`, counted in `rejected`, not in `applied`, carries `server` under
the cap and omits it over; an identical replay into `ledger`, `dutylog` and
`crewnotes` returns `applied`.
`test_guardmerge.py`: for every **F** store, a stale push whose fields do not
collide **applies** and the stored record holds both devices' changes — and the
re-stamp means the author's own device pulls the merged copy. `buses.odometer`
merges as max **even when the newer write carries the lower reading**, which is
the clock-independence proof.
`test_v2_stale.js`: the client treats `"stale"` as re-apply, not quarantine;
stamps `server.updatedAt + 1`; quarantines with `stale-unresolved` after exactly 2
rounds; and **contains no confirmation path at all** — asserted by grepping the
module for a confirm/overwrite affordance, so a future builder cannot add one
quietly.

Break the else branch and `test_pushstale.py` goes red. Break a merge rule and
`test_guardmerge.py` goes red. Add a dialog and `test_v2_stale.js` goes red.

## 5. The new store: `nightlist`

**Accepted.** The claim it rests on was verified in source before accepting, not
taken from the UX doc:

- `sync.js:1040` — `if (!STORES.includes(r.store) || !r.data) continue;`. A v1
  device **discards** a pulled record whose store it does not know.
- `sync.js:677` — `markDirty` returns early for a store not in `STORES`, so a v1
  device can never push it.
- `db.js` `STORES` has 41 keys and `onupgradeneeded` creates only those, so a v1
  device never even has the object store.
- `aimeta`, `odometerlogs` and `waconv` already behave exactly this way — they live
  in the server's `records` table and are applied by no client.

So: **no record v1 reads changes shape, and v1 cannot read, write or clobber the
new store.** It is the safest of the available changes, and the alternatives are
all worse for reasons that are properties of the system rather than preferences — a
field on `buses` is erased the next time any v1 device writes that bus (and `buses`
is written constantly); `dutylog` requires crew *and* seat *and* a real time and is
immutable, so it cannot say "this bus runs, nobody on it yet"; `meta` syncs only
the single `garage` row and a crewmanager may not write `meta` at all; deriving it
from filled seats is circular.

**One cost named honestly.** v1 devices in the roles that may read it will download
these records and throw them away. It is one record per night, so the cost is a
rounding error — but it is not zero, and it is only this small because the record
is one per night rather than one per bus per night. That shaped the record below.

```
store:  nightlist            keyPath: id        (matches ^[a-z][a-z0-9]{1,30}$)
id:     nl-<YYYY-MM-DD>      one per night, stable — two writers produce one record
{
  id:        "nl-2026-11-04",
  date:      "2026-11-04",          // IST day key, the same key the duty board uses
  buses:     { "<busId>": { running: true|false, at: <ms>, by: "<userId>" } },
  createdAt: <ms>,
  updatedAt: <ms>
}
```

- **Stable id** per `03 §9.25`: two people opening the board tonight write one
  record, not two.
- **A map, not a list.** A list of running buses can only be unioned, so a bus
  ticked by mistake could never be un-ticked, and the count could never reach
  zero — which is the one thing this record exists to make possible
  (`DECISIONS.md §8`). Per-bus entries give last-write-wins **per bus**: no tick is
  ever lost, and a tick can be taken back.
- **Each entry's `at` is stamped by the server, not by the phone.** This is the one
  thing that makes the store immune to §4.0's clock problem by construction: per-bus
  ordering comes from server time, so a phone set forward cannot win every tick and
  a phone set back cannot lose every one. The store is new, so there is no v1 copy
  to keep compatible — which is the quiet advantage of adding a store rather than a
  field. Strategy **S** in §4.4.
- **`DECISIONS.md §15` changes this record's consumer, not its shape.** The Duty
  board split in two — #9 Duty board (`assignDriver`) keeps tonight's running list
  and the seats; #13 Gate round (`gateCheck`) takes the ten items, the photograph
  and the hold decision. Thirteen screens, not twelve. `nightlist` is read by #9 and
  by #13 (to know which buses it is waiting on), and is written only by #9. Nothing
  in §5 moves.
- `running:false` is a real state and is **not** the same as absent. Absent means
  nobody has decided about that bus tonight; `false` means somebody said it does
  not run. "Unknown" and "no" must never look alike
  (`v2-foundation-ui.md §3.6`).

| Property | Value |
|---|---|
| `WRITE_ROLES["nightlist"]` | `{owner, supervisor, crewmanager}` — the duty board's three roles |
| `SERVER_INGEST_ONLY` | no |
| `STORE_READ_ROLES` | `{owner, supervisor, crewmanager}` |
| `_guard_write` | `date` must match `^\d{4}-\d{2}-\d{2}$` and equal the id's suffix; `buses` must be an object with ≤200 entries; each entry's `by` is **forced from the token** and each changed entry's `at` is **stamped from server time** (the pattern `attendance.receivedAt`, `dutylog.by` and `gatechecks.decision.at` already follow), so per-bus ordering never depends on a device clock. No delete (a night that happened happened). Not append-only: the whole point is that it is edited through the evening. |
| Server send window | `DUTYLOG_HISTORY_DAYS`-aligned: **365 days**, env `NIGHTLIST_HISTORY_DAYS`, in `HISTORY_DAYS` + `HISTORY_ROLES` |
| Client retention | **395 days** in `LOCAL_HISTORY_DAYS` — 30 more than the server's window, per the existing rule that the two must never fight (`03 §7`) |
| Idempotency | id is the night; a replay of an identical map is a no-op under §2.2 |
| v2 client | add to `v2/db.js` `STORES` and `v2/sync.js` `STORES`; **`v2/db.js` `DB_VERSION` 28 → 29**, which is only safe because of §7 |

**Measure 5 depends on this record existing** (`ux §7`): "buses on tonight's board
still showing an empty seat at departure" is read as `nightlist` against `dutylog`,
and measure 6 as `gatechecks._byRole` against `nightlist`. A `running:false` entry
must therefore be queryable, which is why it is stored rather than inferred from
absence.

---

## 6. What v2 may not change

From `DECISIONS.md §2` and `§14`, and `ux §6` — stated as rules a slice can be held
to, because each has a way of looking harmless in a diff.

1. **No new field on an existing store.** Under whole-record last-write-wins a
   field v2 invents is erased the next time a v1 device writes that record. Every
   v2 write lands in a field that exists today. `nightlist` is the only data
   addition in the plan and it is a new store, not a new field.
2. **No id-format change.** `dl-base-<crewId>`, `bus-<NORMREG>`, `rv-<id>`,
   `as-<svc>-<day>`, `<userId>|<date>`, `al-<REG>-<name>` are stable by design so
   two writers produce one record. Changing one forks production data.
3. **No change to `WRITE_ROLES` for an existing store.** Narrowing a write role
   breaks v1 (a v1 driver writes `trips`, `triplog`, `gatechecks` today). `v2` only
   *adds* `nightlist`.
4. **`_guard_write`'s jobcards verify clause is NOT tightened.** `sync_server.py:1668`
   reads `if closer and closer == actor["id"] and actor["role"] != "supervisor"`.
   `DECISIONS.md §10` wants `closedBy != verifiedBy` for every role — and says in
   the same breath that **v1 is deliberately not changed**, and `selfSignsOff` is
   live at `app.js:3873` with supervisors signing off their own work today.
   Tightening the shared guard is a production behaviour change for ~100 users. So
   v2's second signature **lives in the v2 client**, exactly as `ux §4.3` and
   `ux §6` already say, and the two-line server patch is handed over in §9 rather
   than applied. Named consequence, already in `ux §6`: while both apps run, a
   supervisor who wants to verify his own card can open v1 and do it. That is why
   measure 12 counts `closedBy == verifiedBy` across both clients instead of
   testing the v2 button.
5. **No change to `v1/sync.js`, `db.js`, `pullapply.js`, `app.js`, `sw.js` or
   `ui/`.** v2's copies are byte-identical to v1's today (verified: `diff` is
   empty for all three data-layer files). Every v2 fix lands in `v2/`. Anything v1
   also needs is back-ported deliberately, as its own commit with its own gate run.
6. **`scripts/check-v2-isolation.sh`'s eleven invariants are not weakened.** Read
   it before touching the static handler, `sw.js` or `vercel.json`. One invariant
   is **added** (§7); none is changed.
7. **The `/v1/` alias and the single-record `403` shape stay.** Old builds call
   both for weeks.

---

## 7. v2 gets its own IndexedDB — and why this is urgent

`v2/db.js:7-8` today:

```js
const DB_NAME = 'garage-saathi';   // ← the SAME database as v1
const DB_VERSION = 28;
```

v1 and v2 are the same origin, so this is one IndexedDB database with one version
number. `nightlist` needs `DB_VERSION` 29 (`onupgradeneeded` only fires on a bump,
and without it `tx('nightlist')` throws `NotFoundError`). The moment a tester opens
v2 and that upgrade runs, **v1's `indexedDB.open('garage-saathi', 28)` fails with a
`VersionError`**, `openDB` rejects (`db.js`, `req.onerror = () => reject(req.error)`),
and v1 comes up with no database on that device. Same shape as the service-worker
hazard `DECISIONS.md §2` calls "the single most dangerous detail in the cutover",
and it is not covered by any of the eleven isolation invariants.

**Decision: `v2/db.js` uses `DB_NAME = 'garage-saathi-v2'`**, with its own version
line starting at 1. This is squarely inside `DECISIONS.md §14` — v2 owns its copy
of the data layer, and *"the only shared surface is the server and the database"*
means the server's `records` table, which stays shared and is where both clients
meet.

Costs, named rather than discovered:

- A tester's device holds **two replicas**. Owner and supervisor replicas include
  `gpsevents`, so this is real storage, on a small number of machines.
- v2 does a **full first sync** rather than inheriting v1's. That is work v2 has to
  get right anyway, and §3.5's cursor rewind means it would largely happen even
  with a shared database.
- It also removes a whole class of divergence hazard: two code copies writing the
  same local rows.
- It protects the other direction too — a future v1 bump can no longer break v2.

**A twelfth isolation invariant** is added to `scripts/check-v2-isolation.sh`:
`v2/db.js`'s `DB_NAME` is not v1's, asserted by comparing the two literals rather
than matching a string, so renaming either one still trips it. Adding a check is
not re-doing the script; nothing existing is touched.

---

## 8. Performance, and the one measurement that is stage 3's

The budgets this contract must at least match are in `03 §8`. The ones a backend
slice can break:

| What | Budget | Where it comes from |
|---|---|---|
| `/pull` with nothing new | **0.1 ms** of DB time (94 ms without the `records_rev` index) | commit `8647a37` |
| Server first-screen pass | **195 ms** (888 ms without `records_store_rev`) | `sync_server.py:570` |
| Full first-sync drain | **536 ms**, 19 requests | commit `8647a37` |
| Next-rev allocation per push | **0.03 ms** | commit `8647a37` |
| `/pull` request overhead | 96 ms median before any DB work | `sync_server.py:3667` |
| Pull page | ≤2,000 records **and** ≤2.5 MB, ending on a rev boundary | `PULL_LIMIT`, `PULL_MAX_BYTES` |

Both `records` indexes are **required**, and in production they are created by hand
with `CREATE INDEX CONCURRENTLY` (`DEPLOY.md`). §3.4's per-record predicates are
`json_extract`/`->>` on an unindexed expression; they are applied **after** the
`store`/`rev` predicates that the composite index serves, so they filter a page,
not a table — but that is a claim, and slice B2 proves it on the fleet-sized
fixture rather than asserting it.

**`DECISIONS.md §9` assigns stage 3 one measurement**: the "200 dense desk rows
inside 250 ms" budget is a placeholder set on a developer's Mac, and every density
rule in `v2-foundation-ui.md` is sized against it. **It is a front-end reading on
an actual office PC**, and it needs a Windows 7 / Chrome 109 machine in the office,
which this session does not have. It is called out in `v2-backend-slices.md` as
the frontend lead's and the owner's, not silently dropped — it is the one number in
the plan that can move a published budget, and leaving it unassigned is how it
would be discovered in stage 5.

---

## 9. For the owner — nothing here is run from this session

**Never a production write, never a production deploy.** Each item below is the
command or the diff, for the owner to run.

**(a) Settle the rev collision before fixing it.** Read-only, from the Supabase SQL
editor. One push has one actor, so a rev holding two actors means two pushes
collided on it:

```sql
SELECT rev, COUNT(*) AS rows, COUNT(DISTINCT data::jsonb->>'_by') AS actors
FROM records
WHERE data::jsonb->>'_by' IS NOT NULL
GROUP BY rev
HAVING COUNT(DISTINCT data::jsonb->>'_by') > 1
ORDER BY rev DESC
LIMIT 20;
```

Rows returned is strong evidence. **Zero rows does not clear it** — two pushes from
the same person collide invisibly, so this is a lower bound. My verdict on what to
do either way is in §9(d).

**(b) The six `v1-compat` read rows.** Deleting each one closes a hole and costs a
live v1 screen. `ledger`→mechanic (v1 store screen's movement trail);
`usage`→supervisor (v1 supervisor's adoption screen — `ux` asks for this one);
`gatechecks`, `trips`, `triplog`, `rbservices`→driver (v1's `gate` route and the
trip-cash card, the driver's only screens) — and those four driver rows are
per-record "own rows" grants, not whole-store ones, so a v1 driver still never
receives a colleague's trip cash or gate selfie. Each is one line in
`V1_COMPAT_READ`. This is permission policy, which `CLAUDE.md` names as the
owner's call.

**(c) The second signature in v1.** Two lines in `_guard_write`
(`sync_server.py:1668-1673`): drop `and actor["role"] != "supervisor"` and drop the
close-and-verify-in-one-write shortcut below it. That makes the server enforce
`closedBy != verifiedBy` for every role, which is `DECISIONS.md §10` — and it
changes behaviour for supervisors signing off today. Its own branch, its own gate
run, the owner's deploy window.

**(d) The rev collision — my verdict: this is a v1 production fix to hand over, not
a v2 slice.** `rev = SELECT MAX(rev)+1` under a per-process `threading.Lock()`
(`sync_server.py:153`) on a platform running several containers. `/pull` already
refuses to split a rev group, so this is not the paging bug it looks like; the
residual hazard is narrower and real — push A reads max 500, spends time validating
and logging stock moves, push B commits 501, a pull drains 501 and advances, A then
commits at 501 and `WHERE rev > 501` excludes it for that device for ever. Why it
is handed over:

1. **It is not a v2 defect.** It is a shared-server defect affecting the ~100 people
   using v1 today. "Fixing it in v2" fixes it for nobody, because the cursor lives
   on the server.
2. **It is the hottest shared code path in the system** — `push()`, reached every
   4 s by every device. Changing rev allocation can silently break cursor semantics
   for every phone in the field, and the failure mode is a device that never asks
   again. That earns its own branch and its own deploy window, not a slot inside a
   twelve-screen rebuild.
3. **It is unconfirmed.** §9(a) is the query. `CLAUDE.md`: get the number, then fix
   the thing the number names.
4. **v2 does not depend on it.** Two things v2 owes it, and both are slices here:
   §4.1 returns the stored copy **in the refusal** rather than making the client
   re-read by cursor, so the write-loss fix is correct even when a rev is skipped;
   and nothing in v2 treats `rev` as unique or as a count (`03 §9.20`: the cursor
   136,050 already exceeds the row count 81,680).

The fix, when the owner wants it: allocate the rev inside the writing statement
rather than reading a maximum and adding one — a Postgres sequence, or
`INSERT … rev = (SELECT COALESCE(MAX(rev),0)+1 FROM records)` in one statement
inside one transaction — keeping `since`-cursor semantics and the rev-group paging
rule for phones already in the field. The same per-process-lock pattern also guards
the login lockout counter, the rate limiter and the AI daily counters (`04 §R1`),
and they want the same treatment in the same change.

**(f) `_guard_write` gains merge rules, which changes v1's conflict resolution — in
the direction of losing less.** §4.2: a v1 push that loses the `updatedAt`
comparison today is dropped silently; after this it is merged by the domain rule
for that store and re-stamped, exactly as `partsUsed` already is. It adds no new
refusal, removes no data, and needs no client change to benefit v1. It is still a
behaviour change on the shared server for ~100 live people, so it is named here and
the owner can veto it; nothing else in stage 3 depends on it. The `parts.qty` case
is **not** included and §4.4 says why in plain words.

**(g) Two retention/first-pass items that touch v1.** `gatechecks` has no server
send window at all (`03 §2` row 39, "stored forever"), so a first sync pulls every
gate check ever recorded with its selfie and item photos; a
`GATECHECKS_HISTORY_DAYS` window of 90 days would cover every screen that reads it.
And v1's `pullapply.js` has the identical `FIRST_STORES` gap as v2's (§11) — the
departure checks and the "something is wrong with my bus" reports arrive behind the
full drain on every v1 device too. **v1's `pullapply.js` is not changed by this
cut** (§6 rule 5); both go to the owner as separate production changes.

**(h) "Log service" (`LIVE-ISSUES.md` issue 8).** Not mine to fix — the fix is a
design question, because making v1 require a photograph and a second signature for
a preventive service means a supervisor can no longer log one in a single tap, and
that is a daily habit. What stage 3 does about it is in §10: v2's own service log
is specified to stop at `done` with a photo, and the audit table makes a v2 slice
unable to copy the failing shape by accident.

**(i) Not mine, recorded so it is not lost.** No documented database backup
(`04 §8.5.1`); no server test in CI, so `scripts/run-tests.py`'s 48 suites run only
by hand; two uncoordinated AI schedulers at Opus pricing with non-atomic counters;
`GET /uploads/<name>` and `GET /roster` need no login; the login lockout is
SELECT-then-INSERT so a parallel burst can all read "under the limit" — which for a
4-digit PIN matters more than the hash does.

---

## 10. Every v2 write, checked against `_guard_write` before anything is built on it

> The general lesson of `LIVE-ISSUES.md` issue 8, applied now because it is cheap
> now and expensive later.

**What issue 8 is.** `confirmLogService` (`app.js:9376`) writes a job card
**straight at `status:'verified'` with empty photo arrays**. The server has refused
that card since 10 September (`2299533`), word for word:
`job needs before and after photos (or a vendor bill) to close`. The bus's service
*date* lands, because that is a separate record and it is accepted. So for eight
weeks the screen has said "Service logged" while the cost, the hours and the audit
trail never left the device, and the running-cost total for that bus is short by the
amount. Nobody reported it because the client reports success from IndexedDB and the
refusal arrives later as a context-free toast beside a screen that has moved on.

The commit that added the photo rule was right. **What it did not do was audit the
client's write paths against the new rule.** That is the failure this section
exists to make impossible for v2, and it is why the table below is part of the
contract rather than a stage-5 finding.

**The rule.** No v2 slice, and no frontend screen, is built against a write that is
not in this table with its `_guard_write` clause named and its verdict recorded.
A write whose verdict is **REFUSED TODAY** is a design question for stage 1 or the
owner, not something to code around.

| v2 write | Store → fields | `_guard_write` clause it must satisfy | Verdict |
|---|---|---|---|
| Create a card at step 1 (`ux §3.1`) | `jobcards` → `status:'open'` | owner/supervisor/store may create; mechanic may not | ✅ allowed |
| **Mechanic's two taps** (`DECISIONS.md §6`) | `jobcards` → `startAt`, `completeAt` | mechanic must be on the card's crew, **read from the stored card**; cannot create or delete; cannot change `assignees`/`assignedTo` (carried over whatever is sent) | ✅ allowed, **no new capability, no shape change** — as `DECISIONS.md §6` claims. Verified against the clause, not assumed. |
| Supervisor closes a card | `jobcards` → `status:'done'` | owner/supervisor only; **before and after photos required** (or a vendor bill); `closedBy`/`closedAt` server-stamped | ✅ allowed |
| Second signature (`DECISIONS.md §10`) | `jobcards` → `status:'verified'` | owner/supervisor only; `closer == actor` refused **unless the actor is a supervisor** | ⚠️ **the server still permits a supervisor to self-verify.** v2's control is client-side; the patch is §9(c). Already in `ux §4.3` and `§6`; restated here because this table is where a builder will look. |
| **Log a scheduled service** (`ux §4.1` #5) | `jobcards` → a card carrying labour hours and cost; `buses` → `lastServiceOdo`, `lastServiceDate` | the photo rule above | 🔴 **REFUSED TODAY if written as v1 writes it.** This is issue 8. **v2's service log stops at `done` and requires a photo**, and must never write `verified` with empty photo arrays. A v2 slice or screen that copies `confirmLogService`'s shape ships the same eight-week silent failure. |
| Issue a part against a card | `ledger` → new row; `parts` → `qty`; `jobcards` → `partsUsed` | `ledger` append-only for everyone; `partsUsed` merged server-side | ✅ allowed. Ledger row written first, so an interruption leaves an issue to finish rather than stock short (`ux §6`). |
| Part request / fulfilment | `jobcards` → `partRequests[]` | verified cards freeze parts for non-managers | ✅ allowed while unverified |
| Old-part return | `jobcards` → `coreReturns[]` | as above | ✅ allowed |
| Receive stock, supplier bill | `parts`, `purchases`, `ledger`, `vendors` | non-managers may change only `paymentStatus, paidAt, paidBy` after entry; no delete | ✅ allowed |
| Shelf count | `audits` | append-only for non-managers | ✅ allowed |
| **Supervisor's trip cash** (`DECISIONS.md §11`) | `trips` → bus, date, allowance, expenses | driver restrictions do not bind a supervisor; bus/allowance/start frozen after creation; closed trip frozen | ✅ allowed — `ux §4.3` says "no new capability and no server change" and that is **confirmed**: `WRITE_ROLES["trips"]` already holds supervisor. |
| **Gate round** (`DECISIONS.md §12`, now screen #13 per `§15`) | `gatechecks` → `items`, selfie, decision | starts `open`; `GATE_FIXED` frozen after creation; `released` only if all 10 pass; `awaiting` only if one failed; `approved`/`held` only from `awaiting`, with a reason, decided by owner/supervisor; `by/byRole/at/verdict` from the token | ⚠️ **allowed, with one thing to check in stage 1, not here.** The clause says *"driver fills only own check on own bus"*. The owner has moved the round to the supervisor (`§12`), and `WRITE_ROLES["gatechecks"]` holds owner/supervisor/driver — so a supervisor may write it. But the **selfie is now of the driver and taken by the supervisor**, and `driverId`/`driverName`/`selfie` are in `GATE_FIXED`, set at creation. A supervisor creating the check with the driver's identity in it is legal; a supervisor *amending* it afterwards is not. The flow must create the record once, with the driver already chosen. Flagged rather than assumed. |
| Fill a seat | `dutylog` → new row; `drivers` → `busId`, `driverSlot` | `dutylog` nobody edits or deletes, owner included; needs `crewId`, role, a real `at`; `by` from the token; a second baseline is a no-op | ✅ allowed |
| **Tonight's running list** (`DECISIONS.md §8`, `§15`) | `nightlist` → `buses{}` | new clause, §5 | ✅ by construction |
| Conversation log | `crewnotes` | write-once, no delete, needs `crewId` and `text`; `by` from the token | ✅ allowed |
| Approve a coaching note | — | `POST /ai/coaching/decide`, not `/push` | ✅ allowed (owner/supervisor/crewmanager) |
| Confirm a redBus name | `rbalias` | id must equal `al-<normreg>-<normname>`; crew must exist in `drivers`; no delete; a person's write clears the AI's `auto/reason/evidence` | ✅ allowed |
| Diesel, AdBlue, fit a tyre | `fuel`, `def`, `components` | `fuel`/`def` append-only for non-managers | ✅ allowed |
| Check in / out | `attendance` | `userId` forced from token; `receivedAt` server time; `at` clamped and marked `atUnverified` if >10 min stale; non-managers cannot change a row once written | ✅ allowed |
| "Something is wrong with my bus" | `driverreports` | reporter may only cancel while open and unlinked | ✅ allowed for driver and conductor |
| Garage settings | `meta` | only id `garage` syncs; owner/supervisor only | ✅ allowed |

**The check that keeps this table true.** `test_guardwrite_v2.py` replays one
representative push for **every row above** against `_guard_write` and asserts the
recorded verdict — so a row that says ✅ and is actually refused fails the build,
and the next commit that tightens a server rule breaks this file instead of
breaking a screen eight weeks later. That is the whole lesson of issue 8 turned
into a check. It belongs to slice B1.

---

## 11. The first pass is missing the two safety stores

`pullapply.js:144` — `FIRST_STORES` is sixteen names:

```
meta, users, buses, parts, jobcards, drivers, challans, fuel, rbreviews,
incidents, routes, vendors, components, attendance, stockmoves, breakdowns
```

It does **not** include `gatechecks`, `driverreports`, `dutylog` or `crewnotes`.
Verified in source.

So on a new or re-synced device the departure checks awaiting a hold decision and
the "something is wrong with my bus" reports arrive **behind the full drain** — and
those two are the top band of Attention, the first thing that screen exists to
show. A crew member's coaching conversation is in the same position, and for a
driver, Me is the entire app.

**Accepted, with the reasoning, and with `dutylog` left out as proposed.**

| Store | First pass? | Why |
|---|---|---|
| `gatechecks` | **add** | Attention's top band and screen #13's whole subject |
| `driverreports` | **add** | the other top-band row; it is also the one thing a driver or conductor writes |
| `crewnotes` | **add** | small, text-only, and People's append-only log reads as empty without it |
| `dutylog` | **leave out** | Append-only with a 365-day window, and its only consumer is the historical "who was on bus X on date Y" lookup. That is not a first-screen question, and adding it would slow the first screen to serve a query nobody makes on arrival. **Agreed, for that reason.** |

**One cost I am not going to leave unsaid.** `gatechecks` has **no server send
window** — `03 §2` row 39 says "stored forever", and it is not in `HISTORY_DAYS`.
So the first pass will pull *every gate check ever recorded*, each with a selfie and
up to three item photos, when the only ones Attention needs are those in
`awaiting`. Two mitigations, and I am taking the first and recommending the second:

1. The pull page is **byte**-governed (2.5 MB, trimmed on a rev boundary), so the
   failure mode is "the first screen takes an extra page or two", not a hang. The
   first pass already re-sends records the `defer` drain sends again and that extra
   bandwidth is intentional. Acceptable.
2. A `GATECHECKS_HISTORY_DAYS` send window (90 days would cover every screen that
   reads it) would make this strictly better. **That is retention policy, which
   `CLAUDE.md` names as the owner's call**, and it would change what v1's driver
   phones receive. It goes in §9(g), not into a slice.

**v1 has the identical gap and v1's `pullapply.js` is not changed** (contract §6
rule 5). It goes to the owner in §9(g) as a separate production change.

---

## 12. `/uploads` is not in this cut — and what v2 needs from whoever fixes it

`LIVE-ISSUES.md` issue 7: `GET /uploads/<name>` needs no login, and neither does
`GET /roster`. Fixing the first means either a service worker attaching a token to
every `<img>`, or short-lived signed URLs — and a wrong move stops photographs
rendering on a hundred devices. **Out of this cut, to the owner as a v1 decision.**
No slice touches `/upload`, `/upload/delete` or `/uploads/<name>`.

What v2 needs whoever fixes it to cover, stated now so it is not discovered after
the choice is made. **The Me screen alone hands out three upload URLs**, and all
three are own-record paths available to every one of the eight roles including the
two that hold zero capabilities:

| Me's upload | Store → field | Who |
|---|---|---|
| Check-in selfie | `attendance` → `selfie` | all 8 |
| Own identity documents | `drivers` → `docs.<key>.photo` / `photoBack` | all 8 (own record) |
| "Something is wrong with my bus" photo | `driverreports` → `photo` | all 8 |

Two consequences for any design:

- **A signed URL has to survive the record.** These URLs are stored *inside* synced
  records that live for ever, are pulled by other devices, and are read months
  later from a job card's history. A URL that expires makes the historical record
  unreadable rather than private — the photograph is the evidence.
- **It must work offline-first.** When an upload fails the photo stays **inline in
  the record as a `data:` URL** and travels in every pull and push (`03 §6`; a
  driver phone once failed to store crew because of 21 MB of it). Whatever replaces
  the open URL must not make that fallback path worse, because that path is the one
  a yard phone with no signal actually takes.

---

## 13. Change log after publication

Nothing yet. Any change here is told to the frontend lead in the same breath, per
`backend-lead.md`.

| Date | What changed | Who was told |
|---|---|---|
| 2026-11-04 | **§4 rebuilt.** The staleness fix was published as "name it in `refused`, client re-applies". That is now the fallback (**R**) and not the primary answer, because `updatedAt` comes from the same device clock the bug depends on. Server-side field merge (**F**) is primary, server-ordered sequencing (**S**) covers `nightlist`, and `parts.qty` is stated as unfixed rather than left looking solved. **No screen adjudicates a clock.** The client-side base-snapshot machinery shrinks to the R stores, which retires the riskiest claim in the first draft. | Coordinator; both stage-2 designers (their screens already assumed this and are unaffected) |
| 2026-11-04 | The new store is **`nightlist`**, not `nightplan` — one name for one store, matching the coordinator's and stage 2's usage. Ids `nl-<YYYY-MM-DD>`. Shape unchanged. | Coordinator |
| 2026-11-04 | **§10 added** — every v2 write audited against `_guard_write`, with slice B1 owning `test_guardwrite_v2.py`. One row is red: v2's service log must stop at `done` with a photo and must never copy `confirmLogService`'s shape (`LIVE-ISSUES.md` issue 8). One row is flagged for stage 1: the gate round must create the record once with the driver already chosen, because `driverId`/`selfie` are in `GATE_FIXED`. | Coordinator; stage 1 for the gate-round row |
| 2026-11-04 | **§11 added** — `gatechecks`, `driverreports` and `crewnotes` join the first pass; `dutylog` stays out, for the reason given. Slice B3 owns it. | Coordinator |
| 2026-11-04 | **§12 added** — `/uploads` is out of this cut; what Me's three upload URLs need from whoever fixes it is written down now rather than after the choice. | Coordinator; shell designer |

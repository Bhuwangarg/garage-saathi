# 04 - Server, AI jobs, integrations and ops

Source of truth read for this document: `sync_server.py` (6,060 lines), `advisor_ai.py` and the other `*_ai.py` modules, `its_lookup.py`, `wa_client.py`, `crew_trace.py`, `api/index.py`, `vercel.json`, `.vercelignore`, `.github/workflows/*.yml`, `DEPLOY.md`, `GO_LIVE.md`, `LAUNCH_CHECKLIST.md`, `AGENT_API.md`, `GPS_API.md`, `redpro-extension/*`, and the client files that call the server (`sync.js`, `app.js` login code, `db.js`). Nothing was executed, no network request was made, no deploy command was run. This document names every secret by its variable name and where it is configured; it contains no secret value.

Line numbers refer to `sync_server.py` at commit `4732dac` on branch `launch-v2`.

---

## 0. Corrections to the brief, and the headline facts

1. **Four names in the brief are not routes.** `/data` is a disk mount path used to decide whether SQLite is on a persistent disk (line 64); it is not an endpoint. `/messages`, `/messages/batches` and `/results` are paths on **Anthropic's** API (`https://api.anthropic.com/v1/...`, used by `_anthropic()`, lines 2204-2211 and the review batch code); the garage server does not serve them.
2. **Routes the brief did not list** (all verified in the dispatch code): `GET /` (the app shell), `GET /uploads/<name>`, `POST /upload`, `POST /upload/delete`, `POST /ai` (the advisor itself, as distinct from `/ai/*`), `POST /ai/bill`, `POST /ai/digest`, `POST /ai/coaching/decide`, `GET /wa/webhook`, `POST /wa/webhook`, `GET /agent/crew`, `GET /agent/coaching`, `GET /agent/bus-papers`, plus a catch-all static file server and a universal `OPTIONS` handler.
3. **Endpoint count: 44 API routes** = 15 `GET` + 29 `POST`, over 43 distinct paths (`/wa/webhook` is both). Not counted in the 44: `GET /` (app shell, falls back to the health body only if `index.html` is not bundled), the static-file catch-all for `GET`, and `OPTIONS` on any path (always `204` with CORS headers). There are no `PUT`, `PATCH`, `DELETE` or `HEAD` handlers (the Python base class answers `501`).
4. **Every path also answers under `/v1/<path>`** (`_strip_version`, line 285). Any other version prefix (`/v2/...`) returns 404. The rebuild must keep serving the un-prefixed paths: phones update lazily and old builds will call them for weeks.
5. **The server is a schemaless record store with ~60 store names plus a rule engine.** Almost all business data moves through two endpoints, `GET /pull` and `POST /push`, over one table `records(store, id, data JSON text, updatedAt, rev)`. The rules that matter most (who may write which store, what is append-only, what is redacted per role) are code in `may_write`, `WRITE_ROLES`, `_guard_write`, `redact_for` and `_never_for`, and are documented in section 3.2.
6. **AI:** 7 scheduled/triggered jobs that write a "server-written" store, plus 4 on-demand AI functions that write nothing (advisor, free-form vision, supplier-bill reader, odometer reader). Every Claude call uses one model setting, `AI_MODEL`, default `claude-opus-5-5` (owner decision of 18 Oct 2026, comment at line 4323).
7. **Alerting is one thing:** a failed GitHub Actions scheduled run emails the repository owner. The Vercel cron that hits `/health` raises no alert of its own.

---

## 1. Endpoint table

Auth key: **Session** = `Authorization: Bearer <uid>.<exp>.<sig>` from `/auth/login` (section 4). **None** = unauthenticated. **GPS token** = `Authorization: Bearer <GPS ingest token>` (env `GPS_INGEST_TOKEN`). **Agent key** = `Authorization: Agent <key>`, checked by SHA-256 against env `AGENT_KEYS`, with scope from env `AGENT_SCOPES`. **Trigger token** = `Authorization: Bearer <token>` equal to env `REDPRO_INGEST_TOKEN` or env `AI_CRON_TOKEN` (each must be at least 24 characters or it is treated as unset). "Sync bucket" = 120 requests per user per minute; "Upload bucket" = 240 per user per hour.

| # | Method | Path | Auth | Roles / principals allowed | Limit or budget | Idempotent? |
|---|--------|------|------|----------------------------|-----------------|-------------|
| 1 | GET | `/health` (also `/` if no bundle) | None | anyone | none; runs a DB `SELECT 1` and a cached (5 min) R2 `HeadBucket` | yes (read) |
| 2 | GET | `/` and any static asset | None | anyone | CDN cached (below) | yes |
| 3 | GET | `/uploads/<32hex>.(jpg\|png\|pdf)` | None | anyone | none | yes. Local-disk only; dead on Vercel (photos are on R2) |
| 4 | GET | `/roster` | None | anyone | none | yes |
| 5 | GET | `/my/coaching` | Session | any role (non-crew get an empty list) | Sync bucket | yes |
| 6 | GET | `/my/reviews` | Session | any role (non-crew get empty) | Sync bucket | yes |
| 7 | GET | `/pull` | Session | any role; output redacted per role | Sync bucket; page <= 2,000 rows and ~2.5 MB | yes (cursor based) |
| 8 | GET | `/gps` | Session | any role | none | yes |
| 9 | GET | `/push/vapid` | None | anyone | none | yes |
| 10 | GET | `/gps/latest` | GPS token, or Agent key (scope `gps`), or Session | provider, agents, any user | none | yes |
| 11 | GET | `/gps/fleet` | Agent key (scope `gps`) or Session. GPS token is NOT accepted | agents, any user | none | yes |
| 12 | GET | `/agent/crew` | Agent key, scope `crew` | agents only | none | yes |
| 13 | GET | `/agent/coaching` | Agent key, scope `coaching` | agents only | <= 200 notes per answer | yes |
| 14 | GET | `/agent/bus-papers` | Agent key, scope `papers` | agents only | none | yes |
| 15 | GET | `/wa/webhook` | Meta verify token (env `WA_VERIFY_TOKEN`) in query | Meta only | none | yes |
| 16 | GET | `/challans` | Session | owner, supervisor | spends a billable eChallan credit per uncached lookup; no server-side limit | NOT idempotent in cost; writes `challans` snapshot |
| 17 | POST | `/auth/login` | None (PIN in body) | anyone | 5 failures per user and 50 per IP per 5 min | no (side effect: stamps last login, adds a `users` revision) |
| 18 | POST | `/odometer/submit` | Session | owner, supervisor | one vision call per request; no counter | not idempotent (second photo is a second reading); `dry:true` writes nothing |
| 19 | POST | `/wa/webhook` | Meta HMAC (`X-Hub-Signature-256`, env `WA_APP_SECRET`) | Meta only | none | not idempotent (Meta retries; no message-id dedupe) |
| 20 | POST | `/auth/users` | Session | owner (any role); supervisor (store, mechanic, driver, conductor) | none | no (a second call makes a second account with a new random id) |
| 21 | POST | `/auth/users/rename` | Session | owner, supervisor (supervisor may not rename an owner account) | none | yes |
| 22 | POST | `/auth/users/delete` | Session | owner only | none | yes (second call is 404) |
| 23 | POST | `/auth/setpin` | Session | self (any role); owner any account; supervisor for store/mechanic/driver/conductor | none (not rate limited) | yes (same PIN again is accepted) |
| 24 | POST | `/admin/backfill-contacts` | Session | owner, supervisor | body size cap | yes (fills empty fields only) |
| 25 | POST | `/auth/register-roster` | Session | owner, supervisor | none | yes for existing accounts (never touched); creating is one-shot per id |
| 26 | POST | `/push` | Session | any role; per-store write matrix | Sync bucket; <= 1,000 records; <= 6 MiB declared body | yes for text stores (last-write-wins); append-only stores refuse a replay (see 3.2) |
| 27 | POST | `/admin/import` | Session AND header `X-Import-Token` (env `IMPORT_TOKEN`) | owner only | refuses a non-empty database unless `force:true` | yes (upsert; bypasses the write matrix) |
| 28 | POST | `/upload/delete` | Session | owner, supervisor, crewmanager | <= 200 urls per call | yes |
| 29 | POST | `/upload` | Session | any role | Upload bucket; body <= `MAX_UPLOAD_MB` (4 MiB on Vercel) | no (new random file name each time) |
| 30 | POST | `/ai` | Session | owner, supervisor | `AI_DAILY_LIMIT` = 60 per user per UTC day (shared with `/ai/vision`) | no |
| 31 | POST | `/ai/vision` | Session | owner, supervisor | same 60/day counter | no |
| 32 | POST | `/push/subscribe` | Session | any role (role is taken from the session) | none | yes (upsert by endpoint) |
| 33 | POST | `/push/test` | Session | any role | none | no (sends a notification each call) |
| 34 | POST | `/its/lookup` | Session | owner, supervisor (`diag` mode: owner only) | <= 10 PNRs per call; `ITS_BUDGET_S` = 40 s | yes in effect (per-PNR cache with re-check windows) |
| 35 | POST | `/ai/bill` | Session | owner, supervisor, store | `AI_BILL_DAILY` = 60 per user per UTC day | no |
| 36 | POST | `/ai/digest` | Trigger token, or Session | tokens; owner, supervisor | one per ISO week unless `{now:true}` | yes (once per week key) |
| 37 | POST | `/ai/coaching` | Trigger token, or Session | tokens; owner, supervisor, crewmanager | `AI_COACH_DAILY_CALLS` 400/day; 4 notes per call | yes (a drafted note is never redrafted) |
| 38 | POST | `/ai/coaching/decide` | Session | owner, supervisor, crewmanager | none | yes |
| 39 | POST | `/ai/reports` | Trigger token, or Session | tokens; owner, supervisor | `AI_REPORT_DAILY_CALLS` 300/day; 3 per call | yes (hash-keyed) |
| 40 | POST | `/ai/core` | Trigger token, or Session | tokens; owner, supervisor | `AI_CORE_DAILY_CALLS` 300/day; 3 per call | yes (hash-keyed) |
| 41 | POST | `/ai/gate` | Trigger token, or Session | tokens; owner, supervisor | `AI_GATE_DAILY_CALLS` 300/day; 2 per call | yes (hash-keyed) |
| 42 | POST | `/ai/names` | Trigger token, or Session | tokens; owner, supervisor, crewmanager | `AI_NAMES_DAILY_CALLS` 60/day; 12 names per call | yes (evidence-hash keyed) |
| 43 | POST | `/ai/reviews` | Trigger token, or Session | tokens; owner, supervisor | `AI_REVIEW_DAILY_CALLS` 200/day direct; backlog >= 120 goes as one Batch | yes (content-hash keyed) |
| 44 | POST | `/redpro/ingest` | `REDPRO_INGEST_TOKEN` only (the AI cron token is refused here) | the office collector | <= 2,000 rows per post | yes (unchanged rows are not rewritten) |
| 45 | POST | `/gps/ingest` | GPS token only | the GPS provider | none beyond body size | NOT idempotent (replays duplicate events, see 3.8) |

Row 2 is the app shell and is not part of the count of 44. Rows 1 and 3-45 are the 44 counted routes.

**Static serving (row 2).** `_serve_static` serves only extensions `.html .js .css .webmanifest .svg .png .jpg .jpeg .ico .woff2`, refuses any path that starts with a dot, any file whose name contains "backup", and these directories: `scripts mobile api uploads __pycache__ node_modules redpro-extension`. `sw.js` is `no-cache`; everything else is `public, max-age=0, s-maxage=600, stale-while-revalidate=86400`. `vercel.json` rewrites every path (`/(.*)`) to `/api/index?__p=/$1`, and `parse_request` (line 5112) restores the original path from `__p` before routing.

---

## 2. Cross-cutting behaviour

**Envelope.** JSON in and out, UTF-8. Errors are `{"error": "<message>"}` with an HTTP status; extra keys exist on some (`retryAfterSec`, `known`, `refused`). Unknown path: `404 {"error":"not found","sawPath":..., "sawMethod":...}`.

**CORS.** `Access-Control-Allow-Origin` echoes the request `Origin` only if it is the production origin list (env `ALLOWED_ORIGIN`, default is the retired GitHub Pages origin), any `http://localhost` / `127.0.0.1` port, or a native-app origin (`capacitor://localhost`, `ionic://localhost`, `https://localhost`). Otherwise it returns the first allowed origin (so the browser blocks the response). Allowed methods `GET, POST, OPTIONS`; allowed request headers `Content-Type, Authorization` only (so a browser cannot send `X-Import-Token`; the restore script is not a browser). The hosted PWA is same-origin and needs no CORS.

**Body limits.** `Content-Length` is validated before any read: missing/negative/over `MAX_REQUEST_BYTES` (6 MiB) gives `413`. `/push` additionally caps `MAX_PUSH_MB` (6) and `MAX_PUSH_RECORDS` (1,000). `/upload` caps `MAX_UPLOAD_MB` (4 on Vercel because the platform limit is ~4.5 MB; 8 elsewhere).

**Rate limiting** (`_rate_ok`). Keyed on user id, never IP. Table `ratelimit(k, n, win)`. Buckets: `sync` (120 per minute) on `/pull`, `/push`, `/my/coaching`, `/my/reviews`; `upload` (240 per hour) on `/upload`. Over the line: `429 {"error":"too many requests","retryAfterSec":N}` plus a `Retry-After` header. **It fails open**: if the counter query throws, the request goes through. `RATE_LIMIT_OFF=1` disables it with no redeploy. No other endpoint is rate limited except login (lockout) and the AI daily counters.

**Feature flags.** `FEATURE_FLAGS` env (comma list) is returned on every `/pull` as `flags` and in `/health`. Off unless named.

**Serverless state.** The process keeps `LIVE_GPS` (latest position per registration), `_PG_CONN` (one shared Postgres connection per container, serialised by a lock), review-trace memos, and `_lock` (a `threading.Lock`). None of this is shared between containers. See risk R1.

**Logging.** `log_message` is suppressed, so there is no access log. Only `print()` lines exist (push refusals, agent reads, rate-limit hits, boot errors).

**Server tables** (created idempotently on first connection per process, `db()` line 546): `records(store,id,data,updatedAt,rev)` with indexes `records_rev` and `records_store_rev`; `users(id,name,role,salt,pin_hash,last_login)`; `pushsubs(endpoint,sub,role,at)`; `sys(k,v)` (holds `session_secret` and `schema_version`); `gpslive(reg,data,at)`; `loginfails(k,at,nonce)`; `disabledlogins(id,at)`; `aiusage(k,n)`; `ratelimit(k,n,win)`. `SCHEMA_VERSION = 1`, `PROTOCOL_VERSION = 1`.

---

## 3. Per-endpoint detail

### 3.1 Platform and read-only public endpoints

**`GET /health`** (also `GET /` when `index.html` is not bundled). Always `200 {"ok":true,...}`, even when the database is down; the truth is in the body. Fields: `service`, `db`, `dbMode` (`postgres` | `postgres-unreachable` | `turso` | `sqlite-disk` | `sqlite-ephemeral`), `dbOk`, `dbError` (credential-redacted), `dbPath`, `bootstrapped`, `bootstrapError`, `importTokenSet` (boolean only), `deployId`, `commit` (7-char git SHA from `VERCEL_GIT_COMMIT_SHA`), `build` (hand-bumped `BUILD_TAG`, currently `2026-08-22-vercel-10`, so it is stale; trust `commit`), `pgHost` (host:port parsed from `DATABASE_URL`), `persistent`, `aiKeySet`, `vapidReady`, `echallanKeySet`, `schemaVersion`, `protocol`, `flags`, `rateLimit{syncPerMin,uploadPerHour,off}`, `vision{provider,model}`, `photos` (`r2`|`disk`), `photosPersistent`, `r2Vars{...booleans}`, `r2{configured,ok,error,detail}`, `gpsIngest` (token configured), `gpsLiveRegs` (count). It is unauthenticated and discloses configuration state; the rebuild should keep the shape (GitHub Actions and Vercel cron depend on `dbOk` and `commit`) but consider trimming the rest. Each call hydrates `gpslive` from the database, runs `SELECT 1`, and may run an R2 `HeadBucket`.

**`GET /roster`** - no auth. `{"users":[{"id","name","role"}...]}` from the `users` table, ordered by role then name. Carries no PIN, hash or salt. Exists so a never-synced phone can draw the login tiles. It exposes every login id, so ids are effectively public.

**`GET /push/vapid`** - no auth. `{publicKey, enabled, webpush, keyEnv, secretFile}`. `publicKey` is the VAPID public key (default baked into the source, overridable by env `VAPID_PUBLIC`); `enabled` is true only when `pywebpush` imported and a private key is available; `keyEnv` and `secretFile` say where the private key was found (booleans).

**`GET /uploads/<name>`** - no auth; file name must match `^[0-9a-f]{32}\.(jpg|png|pdf)$`; reads from the local `UPLOADS_DIR`. With R2 configured, `/upload` returns an R2 public URL and this route is never used.

### 3.2 Sync engine: `GET /pull` and `POST /push`

These two endpoints carry nearly all business data and are called by every phone every 4 seconds (client `setInterval(tick, 4000)`; failures back off 4 s, 8 s, 16 s ... capped at 5 minutes with jitter; a `429` makes the client stand down for `Retry-After`).

**`GET /pull?since=<rev>&store=<a,b>&defer=<c,d>`**

- Auth: Session. Rate: Sync bucket. `since` must be an integer; a non-integer raises an uncaught `ValueError` (the connection drops; there is no 400). UNDETERMINED whether the platform turns that into a 500; code path has no handler.
- `store` = fetch only these stores (the deferred drain); `defer` = skip these stores for now. Both are names matching `^[a-z][a-z0-9]{1,30}$`, at most 40 each, and neither can widen what a role is allowed to see.
- Response: `{"records":[{"store","id","data","updatedAt","rev"}], "maxRev": <cursor>, "more": bool, "tableMax": <int>, "serverTime": <ms>, "flags": [...], "protocol": 1}`, header `Cache-Control: no-store`.
- Paging: ordered by `rev`; `LIMIT PULL_LIMIT` (2,000); trimmed to `PULL_MAX_BYTES` (2.5 MB) at a rev boundary; a page never splits a rev group (all records of one push share one rev). The upper bound `MAX(rev)` is read before the page and the page is clamped to it. The cursor returned is the last rev actually sent (or the table max when the page did not fill). Omitted (redacted) records still advance the cursor.
- Redaction happens after the cursor is computed (`redact_for`, `_never_for`). Per role:
  - `aimeta`: never sent to anyone.
  - `digest`: owner, supervisor only.
  - `crewnotes`: owner, supervisor, crewmanager, office only.
  - History stores trimmed by age and role: `gpsevents` (30 days; owner, supervisor), `stockmoves` (180 d; owner, supervisor, store), `usage` (90 d; owner, supervisor), `audits` (365 d; owner, supervisor, store), `triplog` (120 d; all roles), `dutylog` (365 d; all roles). Windows are env-tunable (`GPS_HISTORY_DAYS`, `TRIPLOG_HISTORY_DAYS`, `STOCKMOVES_HISTORY_DAYS`, `USAGE_HISTORY_DAYS`, `AUDITS_HISTORY_DAYS`, `DUTYLOG_HISTORY_DAYS`).
  - PII roles (full records): owner, supervisor, crewmanager. Everyone else (`office`, `store`, `mechanic`, `driver`, `conductor`): `waconv` removed; `itslookup`, `rbaliasai`, `gateai`, `coreai`, `reportai`, `coachai` removed; `rbreviews`, `rbcomplaints`, `rbassign`, `rbreviewai` removed unless the role is `office`; for `office`, `rbreviews` and `rbcomplaints` have `pnr, tin, seats, fare, boardAt, doj, amount` stripped and `_redacted:true` set; other people's `drivers` records lose `phone, altPhone, address, dob, bloodGroup, license, docs, salaryMonthly` (a user's own crew record is complete); `buses` lose `crewPhone`; `odometerlogs` lose `phone`. A record that had fields stripped carries `_redacted:true`, and the client never pushes it back (the server refuses a push with that flag).
- Performance contract (from `DEPLOY.md`): the two indexes `records(rev)` and `records(store, rev)` are required. Without them a no-change poll is a full scan (94 ms at 81,680 rows).

**`POST /push`** - body `{"records":[{"store","id","data","updatedAt"}...]}`.

- Auth: Session. Rate: Sync bucket. Over 1,000 records or declared body over 6 MiB gives `413`.
- Response `200 {"ok":true,"applied":n,"rejected":n,"refused":[{"store","id","reason"}],"maxRev":n}`. A batch never returns 403 (part of it may have committed). A **single-record** push where nothing applied and something was rejected returns `403` with the same body plus `error:"role not permitted to write this record"` (older clients read that shape). The client quarantines each refused record by key and shows the reasons.
- Per record, in order: (1) `may_write(role, store)`; (2) the id must be a string of at most 200 characters without `< > " ' \` & ` or control characters, `data` must be an object, `data.id` must equal the envelope id (for `meta` the key is `key`, for `challans` it is `rc`), and `_redacted` copies are refused; (3) server stamps `_by` (user id), `_byRole`, `_org="mahalaxmi"`, and `_createdBy/_createdRole` (preserved from the first write); (4) `updatedAt` is clamped to now + 5 minutes; (5) `_guard_write` (store rules below), which may rewrite the payload; if it did, `updatedAt` is bumped by at least 1 so the author's own device re-pulls the correction; (6) write only if the row is new or `updatedAt` is strictly greater than the stored one (last-write-wins by the client's timestamp; an equal or older replay is silently not applied and not counted as applied, rejected or refused); (7) side effects: `parts` quantity changes are logged to `stockmoves` (immutable, server-only, with `justified` = matching ledger rows in the same push); a `drivers` write syncs the `disabledlogins` table; a `gatechecks` record newly in status `awaiting` sends a web push to owner/supervisor.
- All records in one push share a single `rev` (MAX(rev)+1 computed inside the process lock; see risk R1).
- **Server-written stores (no client push accepted, owner included)** - `SERVER_INGEST_ONLY`: `gpsevents, gpslive, challans, odometerlogs, waconv, itslookup, stockmoves, rbservices, rbreviews, rbcomplaints, rbassign, rbreviewai, aimeta, rbaliasai, gateai, coreai, reportai, coachai, digest`. (`gpslive` and `challans` also have an empty entry in `WRITE_ROLES`.)
- **Write matrix** (`WRITE_ROLES`; the owner passes every store not in the server-only list, including store names the server has never heard of; any other role is denied for an unknown store):

| Store | Roles allowed to write |
|-------|------------------------|
| `ledger`, `purchases`, `vendors`, `parts`, `audits` | owner, supervisor, store |
| `components`, `def`, `fuel` | owner, supervisor, store, crewmanager |
| `buses`, `meta`, `routes`, `incidents`, `breakdowns`, `gatepasses`, `users` | owner, supervisor |
| `drivers` | owner, supervisor, crewmanager |
| `jobcards` | owner, supervisor, store, mechanic |
| `dutylog` | owner, supervisor, crewmanager |
| `gatechecks` | owner, supervisor, driver |
| `rbalias` | owner, supervisor, crewmanager |
| `crewnotes` | owner, supervisor, crewmanager, office |
| `trips`, `triplog` | owner, supervisor, driver |
| `attendance`, `usage` | all eight roles |
| `driverreports` | owner, supervisor, store, mechanic, driver, conductor |

- **Per-store invariants in `_guard_write`** (the real business spec; the rebuild must reproduce these exactly):
  - `ledger`: append-only for everyone (no edit, no delete).
  - `audits`, `fuel`, `def`: non-managers (not owner/supervisor) may create only; no edit, no delete.
  - `purchases`: non-managers may change only `paymentStatus, paidAt, paidBy` after entry; no delete.
  - `attendance`: non-managers cannot change a row once written; `userId` is forced to the token's user; `receivedAt` is server time; `at` is clamped to now and marked `atUnverified` if more than 10 minutes in the past.
  - `dutylog`: nobody edits or deletes (owner included); a second identical "baseline" row is a silent no-op; `by` forced to the token's user; needs `crewId`, role `driver|conductor`, a real `at`.
  - `crewnotes`: write-once, no delete, needs `crewId` and `text`; `by` forced to the token's user.
  - `driverreports` (non-managers): only the reporter (`_createdBy`, or the crew record linked to the user) may change it, only while `status=open` with no `jobId`, and only to `cancelled`.
  - `trips` (driver): only the driver's own crew record; no delete; closed trips are frozen; bus, allowance and start are fixed; already-claimed expenses cannot be changed or removed.
  - `triplog` (driver): only for the driver's own bus; one arrival per stop per bus per day; never edited.
  - `meta`: only the record with id `garage` is shared.
  - `gatechecks`: driver fills only own check on own bus; starts `open`; fixed fields (`busId, regNo, driverId, driverName, userId, startedAt, date, selfie, faceVerified, lat, lng, onDutyBoard`) are frozen; `released` only if all 10 items pass; `awaiting` only if an item failed; manager decides `approved|held` only from `awaiting`, with a reason; decision `by/byRole/at/verdict` stamped from the token; prior decisions kept in `pastDecisions`; `failedBefore` accumulates; no delete. The 10 items and which need photos live in `GATE_ITEMS` (`ac, blankets, cabin` need photos).
  - `rbalias`: id must equal `al-<normreg>-<normname>`; crew must exist in `drivers`; no delete; `history` keeps the last 20 prior decisions; a person's write clears any `auto/reason/evidence` fields set by the AI.
  - `jobcards`: only the owner may delete; verified cards: non-managers cannot change `labourHours, externalCost, externalVendor, outside, outsideCity` or reduce parts; only the owner may move a verified card to another bus; parts lines already on the card are merged back if a stale device drops them; mechanics cannot create or delete cards, must be on the card's crew (read from the stored card), cannot change `assignees`/`assignedTo`; moving to `done`/`verified` needs before and after photos (or a vendor bill); only owner/supervisor close, verify or re-open; `closedBy`, `closedAt`, `verifiedBy`, `verifiedAt` are server-stamped; the owner may not verify a card the owner closed (a supervisor may).
- **Idempotency:** replaying an unchanged text record is harmless. Replaying a record into an append-only store (`ledger`, `dutylog`, `crewnotes`, and `fuel/def/audits/attendance` for non-managers) after a lost response is **refused with a reason** and quarantined on the phone, even though the first write landed. This is a real gap; the rebuild should treat "same id, identical payload" as success.

### 3.3 Authentication and account endpoints

**`POST /auth/login`** body `{"userId","pin"}`. Order of checks: reserve an attempt (lockout), refuse retired PINs, verify, check account disabled. Responses:
- `200 {"token","user":{"id","name","role"}}`.
- `401 {"error":"invalid PIN","known":<bool: account exists>}`.
- `403 {"error":"demo_pin"|"default_pin","known":true}` - the PIN is correct but is a PIN printed in the public source (demo PINs when `ENABLE_DEMO_SEED` is not `1`; `0000` for driver/conductor accounts). Does not count as a failed attempt.
- `403 {"error":"account_disabled","known":true}` - correct PIN, but the crew record is left/archived/deleted.
- `429 {"error":"too many attempts","retryAfterSec":N}` - 5 attempts per user id (`MAX_LOGIN_FAILS`) or 50 per client IP (`MAX_IP_FAILS`) inside 300 s (`LOGIN_LOCK_SEC`). Attempts are counted before the PIN is checked (reserve), and a correct PIN removes its own reservation. IP comes from `x-real-ip` on Vercel.
- Side effect on success: `users.last_login` updated and a revision of the synced `users` record written (`lastLoginAt`) so managers see it. Anyone can lock a known user id out for 5 minutes by failing 5 times (ids are public through `/roster`).

**`POST /auth/users`** body `{"name","role","pin"}` (role default `mechanic`). `400` if name/pin missing, role unknown, PIN not 4 digits, or PIN refused. `403` if the caller may not manage that role (`may_manage`: owner any of the 8 roles; supervisor only store, mechanic, driver, conductor). `200 {"user":{"id","name","role"}}`; id is `u-` plus 6 hex characters. Also writes a PIN-free `users` record.

**`POST /auth/users/rename`** body `{"id","name"}`; name whitespace-collapsed and cut to 60 characters. `404` if no such account; `403` if the target is an owner and the caller is not. Updates both the `users` table and the synced `users` record. `200 {"ok":true,"user":{"id","was","name","role"}}`.

**`POST /auth/users/delete`** body `{"id"}`; owner only. `400` for self-delete or deleting the last owner; `404` if absent. Deletes the login row and writes a tombstone `{"id","_deleted":true}` to the synced `users` record. `200 {"ok":true,"deleted":{"id","name","role"}}`. Historic `_by` provenance is left in place.

**`POST /auth/setpin`** body `{"pin","userId"?}` (target defaults to the caller). `pin` must be 4 digits and not a retired PIN. Self always allowed; others per `may_manage`. Sets a fresh salt, which invalidates every session issued under the old PIN (section 4). `200 {"ok":true}`; `404 no such user`.

**`POST /auth/register-roster`** body `{"crew":[{"id","name","role"}]}` (optional; if omitted the server scans synced `users` records). Creates a login with its own random 4-digit PIN for every driver/conductor id that has none, skips ids whose synced `users` record is a tombstone, and re-PINs any crew account still on the old shared `0000`. Response `200 {"ok":true,"created":n,"pins":{"<id>":"<pin>"},"reset":n}` with `Cache-Control: no-store`. **This is the only time a PIN exists in the clear**; it is returned to the manager's device and shown on the Crew PINs screen.

**`POST /admin/backfill-contacts`** body `{"records":[{store,id,data}]}` for `drivers` (`phone, altPhone`) and `buses` (`crewPhone, docsFolderId`) only. Adds a missing record with a low timestamp, or fills empty fields of an existing one; never overwrites. `200 {"ok":true,"added":n,"merged":n}`.

**`POST /admin/import`** body `{"records":[...],"force"?:bool}`. Requires an owner session AND header `X-Import-Token` equal to env `IMPORT_TOKEN`; if the token is unset, or the header is wrong, `403`. Refuses with `409` if any record exists outside the `users` store unless `force:true`. Calls `push(recs, None)` - **no actor, no write matrix, no guards, provenance in the file is preserved**. Used only by `scripts/restore-backup.py`.

### 3.4 Photos

**`POST /upload`** body `{"data":"data:...;base64,..."}`. Magic-byte sniffing accepts only JPEG, PNG, PDF (the declared MIME type is ignored). Stored with a random 32-hex name. With R2 configured: object put to the bucket, response `{"url":"<R2_PUBLIC_URL>/<name>"}`. R2 failure falls back to local disk, which does not exist on Vercel: `503 {"error":"photo storage unavailable on the server","storage":true}` and the client keeps the picture inline inside the record. Other errors: `400 not valid base64 / only JPEG, PNG or PDF`, `413`.

**`POST /upload/delete`** body `{"urls":[...]}` (first 200 used). Removes only objects whose name matches the generated pattern, from R2 (if the URL is under `R2_PUBLIC_URL`) or local disk. `200 {"ok":true,"removed":n}`. There is no check that the caller's role owns the photo beyond the role list.

### 3.5 Push notifications

**`POST /push/subscribe`** body `{"subscription":{endpoint,keys...}}`. The endpoint must be `https`, port 443, no credentials, and on an allow-list of push-service hosts (FCM, Mozilla, Apple, Windows notify) - an SSRF guard. Stored in `pushsubs` keyed by endpoint with the **session's role** (not the body's). `200 {"ok":true}` or `400 {"ok":false}`.

**`POST /push/test`** sends a test notification to subscriptions of the caller's own role. `200 {"ok":true,"sent":n,"webpush":bool}`.

Server-initiated pushes: night-movement GPS event (owner/supervisor), gate check waiting at the gate (owner/supervisor), unsafe bus from a driver report (owner, supervisor), Monday summary written (owner, supervisor). Dead subscriptions (HTTP 404/410) are deleted; all other send failures are swallowed.

### 3.6 Reads on behalf of a crew member, and agents

**`GET /my/coaching`** `{"notes":[{"week","hi","en","at"}]}`: the signed-in crew member's own approved notes, newest first, at most 6. `Cache-Control: no-store`.

**`GET /my/reviews`** `{"crewId","reviews":[...],"days":90}`: reviews of trips the caller's crew record was on, traced on the server (`crew_trace.py`, which must give the same answer as the client `trace.js`; tests compare them), at most 300, no PNR, seat or time. `{"crewId":null,"reviews":[]}` if the login has no crew record.

**`GET /gps?busId=<id>&odo=<n>&reg=<plate>`** (Session). `400 busId required`. Returns the live provider record `{"busId","source":"provider",lat,lng,speedKph,ignition,odometer,lastPing,deviceId,reg,...}` if the provider has pushed this registration, **otherwise a simulated track** `{"source":"simulated",...}` computed from a hash of the bus id around Jaipur. `odo` non-numeric raises uncaught.

**`GET /gps/latest?reg=<plate>`** - `200` with the stored record (including internal `_idleStart`, `_idleLogged`, `_lastNight` fields), `404 {"error":"no telemetry for reg"}`. Accepts the GPS token, an agent key with scope `gps`, or a session. An agent key without the scope gets `403`.

**`GET /gps/fleet`** - `{"buses":[{"reg","odometer","lastPing","lat","lng","speedKph","ignition"}]}` sorted by reg. Agent key (scope `gps`) or a session; the GPS token gets `401`.

**Agent routes** (`GET /agent/crew`, `/agent/coaching?approvedSince=<ms>`, `/agent/bus-papers?reg=<plate>`). Full field-by-field contract is in `AGENT_API.md` and is verified against the code: every answer is built field by field (a new record field is not exposed until the code names it); answers carry `Cache-Control: no-store`; `401 {"error":"unauthorized"}` for no valid key; `403 {"error":"forbidden"}` for a valid key without the route's scope, and for any unknown path under `/agent/`; `bus-papers` returns `404 {"error":"unknown bus"}` for an unknown plate. `crew` lists only active crew with `id,name,role,phone,busReg`; `coaching` lists approved, whole notes with `decidedAt >= approvedSince`, oldest decision first, at most 200; `bus-papers` returns `{reg, docs:[{type,expiry,status}], challans:{pending,pendingFine,checkedAt}|null}` with status computed in whole IST days (expired < 0, expiring 0-15, else valid, unknown if no date). The agent scope default is `gps` only.

**`GET /challans?rc_no=<plate>`** (Session; owner, supervisor). `501` if `ECHALLAN_API_KEY` is unset. The plate is normalised to the official padded form (district 2 digits, number 4 digits). On success returns and **stores** (in synced store `challans`, keyed by plate) `{rc, updatedAt, fetchedAt, creditsUsed, creditsLeft, providerUnavailable, total, pendingCount, disposedCount, pendingFine, pendingPayable, courtCount, challans:[...]}`. Errors: `400 rc_no required`, `402 {"error":"eChallan credits exhausted"}`, `502` (key rejected, upstream error, unreachable). `pendingFine` (liability) and `pendingPayable` (fine + platform charges + GST) are deliberately separate; only `pendingFine` is ever exposed to agents.

### 3.7 Odometer and WhatsApp

**`POST /odometer/submit`** (Session; owner, supervisor) body `{"phone","image":"data:...","dry"?:bool}`; `400` if either missing. The phone's last 10 digits find a bus (active crew's bus wins over `buses.crewPhone`; numbers of departed crew bind nothing). The image goes to a vision model that must reply with digits only or `NONE`. Result `{"status": enrol|unreadable|held|accepted, "reply": "<Hinglish text for a driver>", ...}`. Holds (written to `odometerlogs`, bus not changed): meter marked broken, first-ever reading from WhatsApp, reading below the previous one, jump over `ODO_MAX_DAILY_KM` (1,600), a day's WhatsApp total over that limit, or the bus record changed while the vision call was in flight. `accepted` updates the bus `odometer`, `odometerAt` and writes an `odometerlogs` row. `dry:true` runs everything but writes nothing.

**`GET /wa/webhook`** Meta handshake: `200` plain text echo of `hub.challenge` when `hub.mode=subscribe` and `hub.verify_token` equals `WA_VERIFY_TOKEN`, else `403`.

**`POST /wa/webhook`** `503` if `WA_APP_SECRET` is unset (unless `WA_ALLOW_UNSIGNED=1`, local testing); `403` on a bad `X-Hub-Signature-256`; otherwise always `200 {"ok":true}` and processes the message on a background thread: records the inbound (`waconv`, keyed by the sender's last 10 digits; opens the 24-hour service window), marks it read, downloads the image, calls the same `odometer_submit`, and replies by free-form text inside the window or by the approved template (`WA_PROMPT_TEMPLATE`) outside it. UNDETERMINED whether this works on Vercel: the work runs on a daemon thread after the response is sent, and a serverless instance may be frozen when the response returns. The header comment says the live WhatsApp account was not yet approved; confirm status before rebuilding it.

### 3.8 Ingest endpoints

**`POST /gps/ingest`** body `{"events":[{"deviceId","vehicleReg","lat","lng","speedKph","ignition","odometerKm","timestamp"}]}`; `503` if no real token is configured (a token containing "demo" or "change-me" counts as unset); `401` if the header is not exactly `Bearer <token>` (plain string compare, not constant time); `400` if `events` is missing. Response `{"ok":true,"accepted":n,"events":n}`.
- The registration (`vehicleReg`, falling back to `deviceId`) is normalised with `norm_reg` (upper case, no spaces or dashes, district padded to 2 digits and number to 4 when a series letter separates them, so `MP44ZD471` and `MP44ZD0471` are the same bus).
- Per event it compares with the previous stored position and may emit `gpsevents` records: `overspeed` (speed crosses `OVERSPEED_KPH`, default 80, once per episode), `harshbrake` (speed drop of at least `HARSH_DROP_KPH`, default 30, between fixes), `night` (ignition on, speed above 5, between 23:00 and 05:00 IST, debounced to once per 30 minutes), `idle` (ignition on, speed under 2 for at least `IDLE_MIN`, default 15 minutes, once per episode). A `night` event also sends a push to owner/supervisor.
- It then writes the latest position per registration to `gpslive` and in-memory `LIVE_GPS`.
- **Not idempotent.** Event ids are random, so a provider retry after a 5xx duplicates events; an out-of-order older fix overwrites a newer position; one malformed number (`float()` of `speedKph`) throws and fails the whole batch with no per-event isolation. `GPS_API.md` tells the provider to batch up to ~500 events and send every 30-60 s, but the code enforces only the 6 MiB body cap.

**`POST /redpro/ingest`** body `{"kind":"reviews|complaints|assignments|services","rows":[...],"capturedAt":<ms>}`; `503` if `REDPRO_INGEST_TOKEN` is shorter than 24 characters; `401` on a wrong token (constant-time compare); `400` for a bad `kind`, non-list `rows`, or over 2,000 rows. Every row is rebuilt from a field allow-list with length caps, so passenger names/phones/emails are dropped even if the collector sent them. Writes `rbreviews` (`rv-<id>`), `rbcomplaints` (`cs-<case>`), `rbassign` (`as-<serviceId>-<IST day>`, appending an observation only when vehicle/drivers change, last 48 kept) and `rbservices` (merged route ids, up to 1,000). Unchanged rows are not rewritten, so phones do not re-download them. Response `{"ok":true,"kind","written","skipped","maxRev"}`.

### 3.9 ITS lookup

**`POST /its/lookup`** body `{"pnrs":["<5-15 digits>"...],"diag"?:true}`. Only the first 10 distinct valid PNRs are used. `503` if `ITS_LOOKUP_USER` / `ITS_LOOKUP_PASSWORD` are unset; `501` if `its_lookup.py` failed to import; `400` if no valid PNR. PNRs already resolved are skipped: matched to a crew member = never again; not found = re-asked after 24 h; found but driver unmatched = re-asked after 1 h (`not-in-crew-bank`, `number-shared`) or 24 h (`no-driver-number`); results from an older `ITS_LOOKUP_VERSION` (now 3) are re-asked. Lookups run one after another on a single ITS web session and stop when 40 s (`ITS_BUDGET_S`) have elapsed; the rest are reported as `left`. Result stored per PNR in `itslookup` (`it-<pnr>`): trip fields, `driverPhoneMasked` (last 4 digits only), `crewId` (exact phone match against the crew bank, never a name), `matchReason`; passenger details are never stored. Response `{"ok","asked","lookedUp","found","driverMatched","skipped","left"[, "error"]}` with status `200`, or `502` if ITS failed before anything was read. `diag:true` (owner only) returns the shape of ITS's answer (field names, messages, never values) and stores nothing.

### 3.10 AI endpoints

Detailed in section 6. Shared behaviour: `501 {"error":"AI not configured on server (ANTHROPIC_API_KEY)"}` when the key is unset; an HTTP error from Anthropic becomes `502 {"error":"Claude answered <code>"}` and any other exception `502 {"error":"AI upstream error: <ExceptionName>"}`. The seven scheduled jobs accept a trigger token or an owner/supervisor session (names also crewmanager; coaching also crewmanager); the daily counters live in `aiusage` and are keyed by **UTC** date.

- `POST /ai` body `{"question"<=2000 chars,"context","biz"<=80}` -> `{"text","looked":[{"tool","args"}]}`. `400 question required`. Runs the advisor tool loop (6.1); if that raises, falls back to one Anthropic call with `max_tokens` 500 and the supplied `context`, returning `{"text"}`.
- `POST /ai/vision` body `{"image":"data:...","prompt"}` -> `{"text"}` (`max_tokens` 300). The caller supplies the prompt; owner/supervisor only.
- `POST /ai/bill` body `{"photo":"<https url or data URL, under 7,000,000 chars>"}` -> `{"ok":true,"bill":{...},"checks":{...},"model"}`; `403` for other roles; `429 daily bill-reading limit reached`; `422` if Claude cannot open or read the photo; `400` bad photo. Nothing is stored.
- `POST /ai/reviews` body `{}` or `{"diag":true}` or `{"retry":true}`. `diag` returns the last Batch's status and per-fault summary (no review text); `retry` clears a failure pause (409 if a batch is still open).
- `POST /ai/digest` body `{}` or `{"now":true}` (session callers only; forces a mid-week write).
- `POST /ai/coaching/decide` body `{"id","decision":"approve|skip","hi"?:{good,fix,tip}}`: `400` bad decision, `404 no such note`, `403` wrong role; approved lines are capped at 200 characters each and the AI's original is kept as `aiHi` if edited. `200 {"ok":true,"status"}`.

---

## 4. Authentication and sessions

### 4.1 Principals

| Principal | Presented as | Verified how | Configured where |
|-----------|--------------|--------------|------------------|
| Staff user (8 roles: owner, supervisor, crewmanager, office, store, mechanic, driver, conductor) | `Authorization: Bearer <uid>.<exp>.<sig>` | HMAC-SHA-256 check plus a database lookup on every request (4.3) | issued by `/auth/login` |
| GPS provider (AirFi) | `Authorization: Bearer <GPS ingest token>` | exact string compare (not constant time) | env `GPS_INGEST_TOKEN` on Vercel, or git-ignored file `.gps_ingest_token`, or `/etc/secrets/GPS_INGEST_TOKEN`; shared with the provider out of band |
| Agent (read-only programs) | `Authorization: Agent <key>` | SHA-256 of the key compared (constant time) to the digests in env `AGENT_KEYS` (`name:digest,name2:digest2`); scopes from env `AGENT_SCOPES` (`name:gps,crew;name2:papers`); both read on every request, never cached | Vercel env; the key itself is held only by the agent as `GS_AGENT_KEY`; a change needs a redeploy to reach a running deployment |
| redPro collector (Chrome extension) | `Authorization: Bearer <token>` | constant-time compare to env `REDPRO_INGEST_TOKEN` (min 24 chars) | Vercel env, or git-ignored file `.redpro_ingest_token`; pasted into the extension's Settings on the office laptop |
| AI scheduler (GitHub Actions) | `Authorization: Bearer <token>` | constant-time compare to env `AI_CRON_TOKEN` (min 24 chars); opens ONLY the seven `/ai/<job>` triggers, not `/redpro/ingest` | Vercel env and GitHub repository secret `AI_CRON_TOKEN` (same value) |
| Restore operator | session as owner plus header `X-Import-Token` | exact compare to env `IMPORT_TOKEN` | Vercel env, set temporarily during a restore |
| Meta WhatsApp | `X-Hub-Signature-256`; GET handshake `hub.verify_token` | HMAC-SHA-256 of the raw body with `WA_APP_SECRET`; verify token string compare | Vercel env `WA_APP_SECRET`, `WA_VERIFY_TOKEN` |
| Anyone | none | n/a | `/health`, `/`, static assets, `/roster`, `/push/vapid`, `/uploads/*`, `/auth/login` |

A session token is not accepted on `/gps/ingest` or `/redpro/ingest`; an agent key and the GPS token are not accepted on any session endpoint other than the GPS reads listed in section 1; the AI cron token is not accepted on `/redpro/ingest`.

### 4.2 PIN storage and verification

- Table `users(id, name, role, salt, pin_hash, last_login)`. `salt` is a fresh `uuid4().hex`. `pin_hash = SHA-256(salt + pin)` as hex: **one round of an unkeyed fast hash over a 4-digit secret**. If the `users` table is ever read, all 10,000 PINs of an account fall in milliseconds. The rebuild should use a slow keyed hash (argon2id or scrypt) and treat PIN length as a product decision (`DEPLOY.md` lists "consider 6-digit PINs for owner/supervisor" as undone).
- PINs are exactly 4 digits (`/auth/users`, `/auth/setpin`). PINs are never synced to devices; the synced `users` record is name and role only.
- Retired PINs are refused at login even if correct: the seven demo PINs (published in the repo source) unless `ENABLE_DEMO_SEED=1`; and `0000` for driver/conductor. `ENABLE_DEMO_SEED=1` seeds the seven demo accounts at boot; `ENABLE_DEMO_SEED=0` deletes any demo account whose hash still matches its published PIN (and writes a tombstone so phones drop the tile); unset does neither but still refuses the published PINs.
- Crew accounts are created by `/auth/register-roster` with random PINs (never `0000`). The plaintext PIN is returned once in that response and then only the hash exists.
- Brute force: `loginfails` rows (user key `u:<id>`, IP key `ip:<addr>`) inside a 300-second window; limit 5 per user and 50 per IP; the reservation is made before the PIN is verified, in one locked step. Lockout state is in the database, so it holds across containers (the check-then-insert itself is guarded only by a per-process lock, see R1).
- Account disablement: table `disabledlogins` is derived from the crew bank (`drivers` records with a `userId` whose `status` is `left` or `archived`, or that are deleted; a login linked to any live crew record stays enabled). Kept in step on every `drivers` push and rebuilt at each container's first request. A disabled login can still reach the PIN check but gets `account_disabled`, and any existing token stops working.
- Recovery without a login: `scripts/reset-owner-pin.py` (directly against the database, or `--sql` to print one statement for the Supabase SQL editor), because no login may reset an owner's PIN other than the owner.

### 4.3 What a session is

- Token string: `<userId>.<expirySeconds>.<hmacHex>`. No server-side session table (the in-memory `SESSIONS` dict is unused).
- Signature: HMAC-SHA-256 over `"<uid>.<exp>.<pin salt>"` keyed by a 32-byte random secret stored in `sys.session_secret` (created on first use, persisted in the same database as the users). Because the account's current salt is part of the signed message, **changing or resetting a PIN invalidates every outstanding session for that account**. A database leak exposes both the secret and the salts, so it exposes the ability to forge tokens.
- Lifetime: `SESSION_TTL_SEC`, default 43,200 (12 hours). **There is no refresh endpoint**; the token is simply re-issued by logging in again. `DEPLOY.md` lists token refresh as not done.
- Validation on every authenticated request: parse, check expiry, `SELECT ... FROM users WHERE id=? AND id NOT IN disabledlogins`, recompute HMAC with that row's salt, constant-time compare. That is one database round trip per request before any work (plus one for the rate-limit counter on sync endpoints).
- A legacy branch accepts tokens signed without the salt only if they expire before `LEGACY_TOKEN_CUTOFF` (1789668000, 17 Sep 2026 18:00 UTC), which has passed; that branch is dead code and should not be rebuilt.
- Revocation: no per-token revocation and no logout endpoint (the client just discards the token). Ways a session ends: expiry; PIN change/reset; account deletion; crew record marked left/archived/deleted.
- Client side: token stored in `localStorage.token`; sent as `Bearer`; a `401` on `/pull` or `/push` makes the client drop the token and ask the user to sign in again.

### 4.4 `PIN_NO_CACHE_ROLES` (client rule, `app.js` lines 13621-13622)

`const PIN_NO_CACHE_ROLES = ['owner','supervisor','crewmanager']`; `mayCachePin(role)` is true for every other role (and for everyone in demo mode on a local host). Effect:
- After an online login, the PIN is stored in `localStorage.creds` only for store, mechanic, driver, conductor and office. For owner, supervisor and crewmanager any cached copy is deleted, once per device by `dropManagerPins()`, and again on every login.
- Those three roles have **no offline login at all**: the server request is the login. The client therefore waits up to 60 s for them (cold starts measured at 30-36 s) and retries once after a failed attempt; a device that can fall back to a cached PIN gives up after 8 s and signs in offline.
- The server has no knowledge of this rule and no offline concept; it always verifies online. The server-side consequences a rebuild must keep: the login endpoint must answer within the client's 60 s, `401 known:true` must be treated by the client as final (it then deletes its cached PIN), and retired-PIN/disabled replies carry `known:true`.
- Offline PIN entry on the device is separately rate-limited by the client (5 wrong tries then 60 s).

### 4.5 Agent / API key mechanism (`AGENT_API.md`)

Keys are 32-byte URL-safe random strings minted by the operator on any machine; only the SHA-256 hex digest is stored, in env `AGENT_KEYS`. An agent holds scopes from env `AGENT_SCOPES`; an agent not listed holds `gps` only (the pre-scope behaviour); a listed agent holds exactly what is listed; unknown scope names are ignored. Scopes: `gps` (`/gps/latest`, `/gps/fleet`), `crew`, `coaching`, `papers` (one `/agent/` route each). Revoke a key by deleting its entry in `AGENT_KEYS`; withdraw access by editing `AGENT_SCOPES`; both need a redeploy to reach a running deployment. Every request with a valid key prints `[agent] agent:<name> <path>` (path only, so a plate in the query string is not logged); the GPS reads print `[gps] agent:<name> <path>`. The one named agent in the docs is `operator-agents` (Mahalaxmi's passenger-facing agent). Agents never appear in `/roster` and cannot use `/pull`, `/push`, `/upload` or `/auth/*`.

---

## 5. Who may call what (role summary)

| Capability | owner | supervisor | crewmanager | office | store | mechanic | driver | conductor |
|------------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Sign in, `/pull`, `/push` (per-store matrix), `/upload`, `/gps`, `/my/*`, push subscribe/test, `/auth/setpin` (own) | yes | yes | yes | yes | yes | yes | yes | yes |
| `/auth/users` create | any role | store, mechanic, driver, conductor | no | no | no | no | no | no |
| `/auth/setpin` for others | any | store, mechanic, driver, conductor | no | no | no | no | no | no |
| `/auth/users/rename` | yes | yes (not owner accounts) | no | no | no | no | no | no |
| `/auth/users/delete`, `/admin/import` | yes | no | no | no | no | no | no | no |
| `/auth/register-roster`, `/admin/backfill-contacts` | yes | yes | no | no | no | no | no | no |
| `/upload/delete` | yes | yes | yes | no | no | no | no | no |
| `/challans`, `/odometer/submit`, `/its/lookup` | yes | yes | no | no | no | no | no | no |
| `/ai`, `/ai/vision` | yes | yes | no | no | no | no | no | no |
| `/ai/bill` | yes | yes | no | no | yes | no | no | no |
| `/ai/reviews`, `/ai/gate`, `/ai/core`, `/ai/reports`, `/ai/digest` (session path) | yes | yes | no | no | no | no | no | no |
| `/ai/names`, `/ai/coaching`, `/ai/coaching/decide` | yes | yes | yes | no | no | no | no | no |
| Full crew PII in `/pull` | yes | yes | yes | no | no | no | own record only | own record only |

The role ids are fixed lists in `ALL_ROLES`, `MANAGER_ROLES` (owner, supervisor), `PII_ROLES` (owner, supervisor, crewmanager), `COACH_DECIDERS`, and the `WRITE_ROLES` matrix in 3.2. A comment in `scripts/predeploy-gate.sh` says mechanics no longer sign in; that is a client-picker choice. The server still accepts a mechanic login and enforces mechanic rules.

---

## 6. AI job catalogue

**Common facts.**
- One model setting for everything: env `AI_MODEL`, default `claude-opus-5-5`, chosen by the owner on 18 Oct 2026. The odometer reader uses the same model when `ANTHROPIC_API_KEY` is set (a `VISION_MODEL` that does not start with `claude-` is never sent to Anthropic).
- Transport: `POST https://api.anthropic.com/v1/messages` with header `anthropic-version: 2023-06-01`, key from env `ANTHROPIC_API_KEY` (never reaches a device). Default HTTP timeout 50 s. Message Batches (`/v1/messages/batches`) are used only by the review job.
- Output discipline: every scheduled job forces the answer through a tool schema with fixed enums (`tool_choice: auto`, instruction "answer by calling `<tool>` once, write nothing else"), and treats the input text (reviews, names, bills, facts) as untrusted data. Output is whitelisted field by field before it is stored.
- Idempotence: each job keys its output record by the source record's id plus a prompt version (`PROMPT_V`, all currently 1) and a content hash. A reading is redone only when the input changes or `PROMPT_V` is bumped. A call that returns no usable tool result is not stored and is retried next tick.
- Triggers: two independent schedulers call the same endpoints every ~10 minutes, **GitHub Actions** (`ai-jobs.yml`, cron `3-59/10 * * * *`, all seven jobs, token `AI_CRON_TOKEN`) and the **redPro Chrome extension** on the office laptop (alarm every 10 minutes, token `REDPRO_INGEST_TOKEN`; calls reviews and names after the corresponding sync, and gate, core, reports, coaching, digest each tick). Staff can also press buttons in the app. There is no queue and no cross-container lock, so two triggers can do the same work twice (R3).
- Daily caps are counted in table `aiusage` per UTC day (so the day rolls over at 05:30 IST) with a read-then-write, not an atomic increment.
- Failure behaviour: a missing key is `501`; Anthropic errors become `502`; photo URLs Claude cannot open (`400`) are recorded once as an error on the reading (gate, core) or fall back to text-only (reports) rather than retried forever.

| Job | Endpoint and trigger | Input | Prompt / model task | Output store (all "server-written") | Budget constants | Cost driver |
|-----|----------------------|-------|---------------------|-------------------------------------|------------------|-------------|
| **Review fault reader** (`review_ai.py`) | `POST /ai/reviews`; Actions every ~10 min; extension after each review sync; owner/supervisor button. Body `{diag}` / `{retry}` for support | Reviews in `rbreviews` that have text or tags and no current reading: stars, tags (12), comment (1,500 chars), route | Decide whose fault each complaint is: faults from `driver, conductor, crew, bus, office, redbus, passenger`; topics from a 15-value list; `safety` bool; `severity` 0-3; `en` and `hi` summaries of at most 12 words. Tool `record_reviews`; `max_tokens` = 400 x reviews + 400 | `rbreviewai` record `ai-<reviewId>` (`faults, topics, safety, severity, en, hi, v, h, rv, model, at`). Bookkeeping in `aimeta` record `rv-batch` (open batch id, chunk map, content hashes, last result, `pauseUntil`), which no phone receives | `CHUNK` 10 reviews per call; `AI_REVIEW_DAILY_CALLS` 200 per day (direct calls); a backlog of at least `AI_REVIEW_BATCH_MIN` 120 (env-tunable) goes as one Message Batch, at most 6,000 reviews; a batch where failures >= successes pauses the job 6 hours | Review volume (first run read about 4,700). Batch path costs half price and answers asynchronously: collected on a later tick |
| **Redbus name matcher** (`name_ai.py`) | `POST /ai/names`; Actions; extension after each assignment sync; owner/supervisor/crewmanager | Each unconfirmed (typed driver name, bus, seat) pair seen in `rbassign`, with candidate crew from the duty log (nights on that bus in that seat) plus name-alike crew; evidence hash | Pick the crew member, flag generic text ("Staff"), confidence high/medium/low, reason of at most 15 words. Tool `record_matches` | `rbaliasai` record per pair (answer + `eh`, `nights`, `onBus`). Code (not the model) then auto-writes `rbalias` (`decidedBy:"claude"`, `auto:true`) when confidence is high AND the duty log has that person on that bus in that seat on at least 2 nights and at least 60% of the nights the name appeared (or the name is generic and high confidence). Anything else is a suggestion for the office. A pair a person already decided is never touched | `CHUNK` 12 pairs per call; `AI_NAMES_DAILY_CALLS` 60 per day (one call per tick) | Number of distinct typed names per bus; re-asked when evidence changes |
| **Gate photo checker** (`gate_ai.py`) | `POST /ai/gate`; Actions; extension each tick; owner/supervisor | Gate checks submitted (`released, awaiting, approved, held`) in the last 7 days with photos for `ac, blankets, cabin`; photos as base64 data URLs or `https://` URLs (up to 3 images per call) | Per photo: verdict `ok` / `doubt` / `wrong`, reason, Hindi text. Told never to identify people. Tool `record_photos`, `max_tokens` 1,500. Code adds duplicate-photo detection against all earlier checks | `gateai` record `ga-<checkId>` (`items, dup, error, v, h, model, at`). Advisory only; nothing is held or released by it | `AI_GATE_DAYS` 7; `AI_GATE_PER_CALL` 2 checks per tick; `AI_GATE_DAILY_CALLS` 300 per day | **Images**: up to 3 per check. Largest per-call input of any job |
| **Returned-part checker** (`core_ai.py`) | `POST /ai/core`; Actions; extension each tick; owner/supervisor | Job-card `coreReturns` with a photo, last 30 days, plus the part's name/category and the returner's stated condition | What the photo shows, matches the part (yes/no/unsure), wear 0-100, verdict `worn/partial/looks_new/unclear`, readable part number, reasons (English and Hindi). Tool `record_part`, `max_tokens` 1,200. Code adds the "same photo used twice" flag and a claim-vs-photo flag | `coreai` record `ca-<returnId>` (`flags, dupOf, claimed, ...`) | `AI_CORE_DAYS` 30; `AI_CORE_PER_CALL` 3; `AI_CORE_DAILY_CALLS` 300 per day | One image per return |
| **Driver report to draft job card** (`report_ai.py`) | `POST /ai/reports`; Actions; extension each tick; owner/supervisor | Open `driverreports` of the last 14 days with words or a photo, the bus record and its recent job cards | Senior-mechanic persona: title (10 words), Hindi title, trade (10-value enum), priority (`high/medium/low`), `unsafe` flag, likely cause, what to check, parts it may need, whether it repeats a recent repair. Tool `record_draft`, `max_tokens` 1,600. If the photo is unreadable it retries text-only | `reportai` record `ra-<reportId>`. If `unsafe`, also sends a web push to owner and supervisor now | `AI_REPORT_DAYS` 14; `AI_REPORT_PER_CALL` 3; `AI_REPORT_DAILY_CALLS` 300 per day | One optional image plus the bus's repair history |
| **Weekly coaching notes** (`coach_ai.py`) | `POST /ai/coaching`; Actions; extension each tick; owner/supervisor/crewmanager. Human step: `POST /ai/coaching/decide` | For each active crew member with something in the last complete IST Monday-to-Monday week: their own (not other parties') review counts and low-review topics, incidents, GPS driving events while the duty log had them in the driver seat, gate checks, reports (counts and short lines; no passenger data) | Warm, respectful Hindi (and English) note: `good`, `fix`, `tip`, each at most 18 words. Tool `record_note`, `max_tokens` 2,500 | `coachai` record `co-<weekMonday>-<crewId>` (`status:draft`, then `approved` or `skipped` with `decidedBy`, `decidedAt`; edited text kept alongside the AI's original as `aiHi`). Only `approved` notes reach `/my/coaching` and `/agent/coaching` | `AI_COACH_PER_CALL` 4; `AI_COACH_DAILY_CALLS` 400 per day | Crew count (about 165 people); Opus-class model with long structured facts |
| **Monday summary** (`digest_ai.py`) | `POST /ai/digest`; Actions; extension each tick; owner/supervisor can force with `{now:true}` | Facts gathered with the advisor's read-only tools (money 7 and 28 days, costliest buses, oldest open jobs, review fault/topic mix, worst drivers and buses, gate-check coverage, incidents, challans, low stock) plus flags (open unsafe reports, doubted gate photos, flagged old parts, notes awaiting approval). Passenger text never included | One page: headline with a number, Hindi headline, 3-5 sections, up to 3 actions. Every figure comes from the gathered facts. Tool `record_summary`, `max_tokens` 3,000 | `digest` record `dg-<weekMonday>` (owner and supervisor phones only). Sends push "Monday summary" to owner and supervisor | Written once per week key after Monday 07:00 IST (`DIGEST_HOUR_IST`); no daily counter | One call per week, large JSON (clipped at 30,000 chars) |
| **Advisor** (`advisor_ai.py`, `POST /ai`) | On demand, owner/supervisor | The question (<= 2000 chars) and business name; tools read these stores: `buses, drivers, jobcards, parts, purchases, vendors, incidents, gatechecks, driverreports, fuel, challans, coachai, gateai, meta` plus traced reviews (last 365 days; date, stars, route, bus, crew, fault, one-line summary; no PNR/seat/name/text) | System prompt: operations advisor for the company; look things up with tools, never guess a number, rupees, short, answer in the question's language. Tools (all read-only): `find`, `bus_overview`, `crew_overview`, `rank` (13 metrics), `reviews`, `stock`, `money`. `max_tokens` 1,500 per turn | None (answer returned to the caller) | `AI_ADVISOR_TURNS` 6; `AI_ADVISOR_BUDGET_S` 30 s (after that, or on the last turn, the model is told to answer from what it has); each model call's HTTP timeout is `max(10, 55 - elapsed)`; each tool result clipped to 12,000 chars; `AI_DAILY_LIMIT` 60 per user per day | Up to 6 sequential calls with growing context; most expensive per-question path |
| **Free-form vision** (`POST /ai/vision`) | On demand, owner/supervisor | Photo and a caller-supplied prompt (part-wear grading, serial reading) | `max_tokens` 300, HTTP timeout 40 s | None | Same 60 per user per day counter as the advisor | One image per call |
| **Supplier bill reader** (`bill_ai.py`, `POST /ai/bill`) | On demand, owner/supervisor/store | One bill photo (https URL or data URL) | Reads supplier, GSTIN, bill number and date, every line (name, part no., HSN, qty, unit, rate, amount, GST %), subtotal, GST, round-off, total, handwritten flag, legibility. The code re-adds lines and checks subtotal + GST against the total (`checks`). Tool `record_bill`, `max_tokens` 4,000 | None stored by the server; the app pre-fills the purchase form and the person saves | `AI_BILL_DAILY` 60 per user per day | One image per bill |
| **Odometer reader** (in `sync_server.py`, used by `POST /odometer/submit` and the WhatsApp webhook) | On demand, owner/supervisor; WhatsApp when live | Dashboard photo | Reply digits only or `NONE` (`max_tokens` 16). Provider order: Anthropic whenever `ANTHROPIC_API_KEY` is set, otherwise `VISION_PROVIDER` (`gemini` default model `gemini-2.5-flash`, or `openai`-compatible default `gpt-4o-mini`) with `VISION_KEY`, `VISION_MODEL`, `VISION_BASE` | `odometerlogs` row and, if accepted, the bus's `odometer` | `ODO_MAX_DAILY_KM` 1,600; 45 s HTTP timeout; no call counter | One image per reading |

Not an AI job but the same shape: **ITS PNR lookup** (`ITS_BUDGET_S` 40, batch of 10) writes store `itslookup`; see 3.9 and section 7.

### 6.1 Server-written stores, producer and consumer

| Store (`db.js`) | Written only by | Read by |
|-----------------|-----------------|---------|
| `rbreviews`, `rbcomplaints`, `rbassign`, `rbservices` | `/redpro/ingest` | managers; `office` gets reviews/complaints with PNR-class fields stripped; drivers receive only `rbservices` |
| `rbreviewai` | `/ai/reviews` | managers, office; crew indirectly via `/my/reviews` |
| `rbaliasai` | `/ai/names` | managers |
| `gateai` | `/ai/gate` | managers |
| `coreai` | `/ai/core` | managers |
| `reportai` | `/ai/reports` | managers |
| `coachai` | `/ai/coaching`, `/ai/coaching/decide` | managers; approved notes via `/my/coaching` and `/agent/coaching` |
| `digest` | `/ai/digest` | owner, supervisor only |
| `itslookup` | `/its/lookup` | managers only |
| `aimeta` | review job | nobody (server only) |
| `gpsevents`, `gpslive` | `/gps/ingest` | `gpsevents`: owner, supervisor |
| `challans` | `/challans` | managers (agents get totals via `/agent/bus-papers`) |
| `odometerlogs`, `waconv` | odometer flow / WhatsApp | managers; `waconv` never leaves the server except for owner/supervisor/crewmanager |
| `stockmoves` | `/push` (as a side effect of `parts` quantity changes) | owner, supervisor, store |
| `rbalias` | people via `/push`; the name matcher via the server | managers |

---

## 7. External integrations and their failure modes

Every secret is referred to by variable name. "Vercel env" means the project `garage-saathi-sync` environment variables (Production).

| Integration | What it does | Direction and protocol | Credential (name, where configured) | Failure modes and what the system does |
|-------------|--------------|------------------------|-------------------------------------|----------------------------------------|
| **GPS provider (AirFi)** | Live position, speed, ignition, odometer for ~80-100 buses; feeds live map, safety events, driver coaching, service-due | Provider pushes JSON to `POST /gps/ingest`; self-check `GET /gps/latest`. Pull mode is documented in `GPS_API.md` but is not implemented server-side | **The GPS ingest token**: Vercel env `GPS_INGEST_TOKEN` (fallbacks: git-ignored file `.gps_ingest_token` next to the server, `/etc/secrets/GPS_INGEST_TOKEN`). Shared with the provider out of band. `DEPLOY.md` lists "rotate it" as not done. Optional provider IP allow-list not done | No token configured: ingest answers `503`, `/health.gpsIngest=false`. Wrong token: `401`. Provider silent: positions go stale; there is no server-side staleness alarm, and `GET /gps` for an unmatched or silent registration returns a **simulated** track with `source:"simulated"`. Plates that differ in zero padding are unified by `norm_reg`; an ambiguous plate without a series letter is kept as written, so two spellings can split one bus. Retries duplicate events (3.8). Each GPS read and each ingest re-reads the whole `gpslive` table because containers are stateless |
| **redBus / redPro** | Reviews, complaints, and redBus's own bus and driver assignment per service per day, so reviews can be traced to a bus and crew | There is no API: a Chrome extension on one office laptop reads redPro through the logged-in tab (redBus bot protection refuses automation) and posts to `POST /redpro/ingest` in chunks. Timetable (IST): assignments hourly except 02:00-05:00; reviews 06:15 (14 days) and 18:15 (3 days), first run 45 days; complaints 07:30, 13:30, 19:30; service list 05:30. A slot missed while the laptop slept runs once on wake if under 6 hours late. After each sync it also triggers the AI jobs (section 6) | **The redPro collector token**: Vercel env `REDPRO_INGEST_TOKEN` (or git-ignored `.redpro_ingest_token`); pasted into the extension Settings. The extension never sees the redPro password; the sign-in is the person's own browser session | Laptop asleep or Chrome closed: data stops; the extension icon shows OLD after 3 hours and `!` when signed out, but **only on that laptop**; the server has no freshness check and sends no alert. redPro returns empty answers for its ~10 largest services (200-400 via-routes), which keep only their main route. If redPro changes its internal API, the extension breaks silently. Token shorter than 24 characters: ingest `503` |
| **ITS passenger lookup (itspl.net)** | Turns a review's PNR into trip details and the driver's phone number, matched exactly (never by name) to the crew bank | Server logs in to ITS's ASP.NET WebForms site as a dedicated branch user and posts the PNR page form (HTML scraping with a hand-written form parser, `its_lookup.py`); session cookies per batch | Vercel env `ITS_LOOKUP_USER`, `ITS_LOOKUP_PASSWORD`, `ITS_BRANCH_CODE`; optional `ITS_BASE_URL`, `ITS_LOGIN_AS` (default `rbtBranch`). Must never be the office's everyday login: on 16 Oct 2026 using the company session signed it out | Not configured: `503`. ITS refuses login, wants an OTP, or logs the session out: `ItsAuthError` -> `502` with a message. ITS page markup changes: lookups read as "not found" (the 17 Oct 2026 incident, where unselected dropdowns made ITS crash on every PNR); `ITS_LOOKUP_VERSION` forces re-asking after a fix. `/its/lookup` `diag` mode (owner) shows the shape of ITS's answers without values. 40 s budget; per-request ITS timeout 30 s |
| **eChallan.app** | Pending traffic challans per registration | `GET {ECHALLAN_BASE}/vahanfin/echallan?rc_no=<padded plate>` with header `X-API-Key`, via the server proxy `GET /challans` (key never reaches a device) | Vercel env `ECHALLAN_API_KEY`; optional `ECHALLAN_BASE` | Key unset: `501`. Provider `402`: credits exhausted -> `402` to the app. Provider `401/403`: `502 key rejected`. Other errors: `502`. `provider_unavailable` is passed through as `providerUnavailable` so an empty result is not read as a clean bus. The edge blocks the default Python user agent, so a browser-like UA is set. Each fresh lookup bills a credit (a repeat inside the provider's cache window bills 0); `creditsUsed` and `creditsLeft` are surfaced. The result is stored once in `challans` so the whole fleet is fetched once, not once per phone. A plate spelled without zero padding returns an empty result that looks clean, which is why the plate is padded before the call |
| **Google Drive document links** | A folder of RC, permit, fitness, insurance scans per bus | A plain link only: `https://drive.google.com/drive/folders/<id>` built in the app from the bus record's `docsFolderId`. The server has no Drive API, OAuth or Google credential; it only carries the field (`/admin/backfill-contacts` fills it) | None | Link rot, a folder that is not shared with the viewer, or a wrong id fails in the user's browser; nothing detects it. The server's own bus-papers answer (`/agent/bus-papers`) uses the expiry dates stored in the bus record, not Drive |
| **Web Push (VAPID)** | Alerts to owner/supervisor phones (night movement, gate check waiting, unsafe bus, Monday summary) | Browser subscribes via `GET /push/vapid` and `POST /push/subscribe`; the server sends with `pywebpush` | Public key: baked into the source as a default, overridable with `VAPID_PUBLIC`. **The VAPID private key**: Vercel env `VAPID_PRIVATE_KEY` (PEM, `\n` escaped), or a local `.vapid_private.pem`, or `/etc/secrets/vapid_private.pem`; the env value is written to `/tmp/vapid_private.pem` on use. Contact claim: `VAPID_SUBJECT` (default is a mailto of the business in source) | `pywebpush` missing or no private key: sends do nothing and return 0 (`/health.vapidReady=false`). `GO_LIVE.md` records `VAPID_PRIVATE_KEY` unset at that time; current state UNDETERMINED. Subscriptions answered 404/410 are deleted; any other error is swallowed. Sends happen inside the request that triggered them (10 s timeout each, sequential), so a slow push service slows the triggering request. Endpoint host allow-list prevents the server being aimed at internal addresses |
| **Anthropic API** | All AI jobs (section 6) | HTTPS to `api.anthropic.com/v1` | Vercel env `ANTHROPIC_API_KEY` (the extension and GitHub hold only trigger tokens, never this key) | Key unset: `501`. Anthropic 4xx/5xx: `502 Claude answered N`. Batch failures pause the review job for 6 hours (`aimeta.pauseUntil`). Cost control is only the daily counters above and the single model setting; there is no spend monitor |
| **Supabase Postgres (via PgBouncer transaction pooler)** | Only durable store for `records`, `users` and the other tables | `psycopg` 3, one shared connection per container, `prepare_threshold=None` (required through PgBouncer), `autocommit=False` | Vercel env `DATABASE_URL` (transaction pooler URI, Mumbai region, port 6543). The project is on the Pro plan per `health.yml` | If `DATABASE_URL` is set and Postgres is unreachable the server **refuses to fall back to SQLite** and raises `DatabaseUnavailable`; the failure is cached for `PG_RETRY_AFTER_SEC` (20 s) so a bad credential cannot flood the pooler's circuit breaker. `/health` still answers `200` but with `dbOk:false` and `dbMode:"postgres-unreachable"`. A dropped idle connection is reconnected once per statement. Cold start plus first connect is ~10 s typical and 30-36 s in the worst measured case |
| **Cloudflare R2** | Photo and PDF storage with permanent public URLs | boto3 S3 client to `https://<account>.r2.cloudflarestorage.com`; `certifi` CA bundle | Vercel env `R2_ACCOUNT_ID` (32 hex chars), `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL` | A mistyped account id previously made every upload fail with an opaque `SSLError` for months; `/health.r2` now reports config hints and a cached `HeadBucket` result. If R2 fails, uploads return `503` on Vercel and the app stores the image inline in the record (inflating `/pull` and `/push`) |
| **WhatsApp Cloud API (Meta)** | Odometer capture by photo; replies to drivers | Webhook `GET/POST /wa/webhook`; sends via `graph.facebook.com/v21.0` (`wa_client.py`) | Vercel env `WA_TOKEN`, `WA_PHONE_ID`, `WA_VERIFY_TOKEN`, `WA_APP_SECRET`, `WA_PROMPT_TEMPLATE`, `WA_TEMPLATE_LANG`, `WA_ALLOW_UNSIGNED` (test only) | Without `WA_APP_SECRET` the webhook is `503` by design. Free-form replies only within 24 h of the driver's last message, otherwise the template or no reply. Background-thread processing may not complete on serverless (3.7). The brief's integration list does not include WhatsApp, but the code is present; live status UNDETERMINED |
| **Alternative vision providers** | Fallback odometer OCR | Google Generative Language API or any OpenAI-compatible chat-completions endpoint | Vercel env `VISION_PROVIDER`, `VISION_KEY`, `VISION_MODEL`, `VISION_BASE` | Used only when `ANTHROPIC_API_KEY` is unset. HTTP status is surfaced in the raw field so a quota failure is distinguishable from a bad key |
| **Dormant** | Turso/libSQL (`TURSO_URL`, `TURSO_AUTH_TOKEN`) and local SQLite (`DB_PATH`) | n/a | n/a | Not used in production (`tursoConfigured:false`); code remains. The rebuild need not carry it |

---

## 8. Ops: deploy, crons, warming, alerting, known gaps

### 8.1 Deploy path

- **Platform:** one Vercel project, `garage-saathi-sync`, region `bom1` (Mumbai) via `vercel.json`. One Python function `api/index.py` re-exports `sync_server.Handler` as a class named `handler` (Vercel's Python detector does not follow an aliased import). `maxDuration` is 300 seconds (the code and comments assume ~60 s; see gaps). `includeFiles` bundles the `.py` modules and every static asset so the function serves the PWA itself, because Vercel detects no framework and would otherwise publish no static output.
- **Trigger:** `git push` to `main`. `DEPLOY.md` states "one push to main ships everything" and `AGENT_API.md` says a push to `main` runs `.githooks/pre-push`, which runs `scripts/predeploy-gate.sh` (a headless-browser smoke and regression suite against a local static serve; `GO_LIVE.md` says about 60 s, `AGENT_API.md` says about 3 minutes), and Vercel then deploys `main`. The hook is client-side (enabled with `git config core.hooksPath .githooks`) and bypassable with `--no-verify`. **A comment inside the `/health` handler (line 5198) says "auto-deploy is off", while the comment above `BUILD_TAG` (line 145) and `DEPLOY.md` say Vercel deploys on push. UNDETERMINED which is current; check the Vercel Git integration settings before relying on either.**
- **Env changes:** an environment-variable change does not redeploy; it reaches only the next deployment (a restart can run old code with new variables). `BUILD_TAG` is hand-bumped and has not moved since 2026-08-22, so `/health.commit` (the git SHA) is the real build identity.
- **Verify a deploy:** `GET /health`: `commit` equals the pushed SHA, `dbMode:"postgres"`, `dbOk:true`, `persistent:true`, `photos:"r2"`.
- **First-time/rollback data path:** device backup (`export.html`) -> `scripts/clean-backup.py` -> `scripts/restore-backup.py` -> `/admin/import` (needs `IMPORT_TOKEN`, then delete it). Order and traps are in `GO_LIVE.md` (steps 1, 5 and 7 lose data or access if skipped).
- **Operator scripts** (run from a laptop, never deployed because `.vercelignore` excludes `scripts/`): `rotate-pins.py`, `reset-owner-pin.py` (direct database or a pasteable SQL statement), `remove-crew.py`, `clean-backup.py`, `restore-backup.py`, SQL helpers `check-login.sql`, `check-crew-sync.sql`, `trace-part-issues.sql`.
- **Mobile builds** (not backend): `android-build.yml` builds a debug APK on pushes touching app files; `ios-build.yml` is manual (needs paid Apple credentials in repository secrets `APPSTORE_KEY_ID`, `APPSTORE_ISSUER_ID`, `APPSTORE_PRIVATE_KEY`). The native apps call the same Vercel origin.
- **Schema:** built at boot by idempotent `CREATE ... IF NOT EXISTS` / `ALTER`, guarded so a failing index creation cannot take `db()` down; no migration tool. The two records indexes should be created once by hand with `CREATE INDEX CONCURRENTLY` (SQL in `DEPLOY.md`).

### 8.2 Scheduled work

| Schedule | Mechanism | What it does |
|----------|-----------|--------------|
| `*/2 * * * *` | Vercel cron, `GET /health` (`vercel.json`) | Keeps the function container, its Postgres connection and its R2 probe warm; also exercises the database. Raises no alert. (Vercel's cron frequency limits depend on plan; plan not stated in the repo: UNDETERMINED) |
| `*/10 * * * *` | GitHub Actions `health.yml` (+ manual dispatch) | `curl` `/health`; up to four tries 20 s apart (90 s timeout each) tolerates a cold start; fails the run if status is not 200 for four tries, or if `dbOk` is not `true` (prints `dbMode`, `dbError`, `commit`). Replaced the old `keepalive.yml`, which existed to stop a free Supabase project pausing; the project is now Pro |
| `3-59/10 * * * *` | GitHub Actions `ai-jobs.yml` (+ manual dispatch) | For each of `reviews names gate core reports coaching digest`: `POST /ai/<job>` with the AI cron token, `--max-time 75`; any non-200 is counted and fails the run after all seven have been tried. Timeout 12 minutes; `concurrency: ai-jobs` without cancelling. A `200` carrying `limited`, `paused` or an `error` field passes silently |
| every 10 min, with 1 min delay | redPro extension alarm on the office laptop | Runs due redPro reads and posts them; also triggers the AI endpoints (6). Hourly/daily slots per 7 |
| weekly | `digest` job inside the 10-minute tick | Writes the Monday summary once after Monday 07:00 IST |

GitHub disables scheduled workflows in a public repository after 60 days without repository activity, and scheduled runs can be delayed or dropped under load; neither is mentioned anywhere in the repo.

### 8.3 Warming strategy (cold starts)

Cold start is the dominant latency risk: a Python container boot plus first Postgres connection is ~10 s, and roughly one request in 25 takes 30-36 s (measured, per comments in `sync.js` and `sync_server.py`). Layers:
1. Vercel cron every 2 minutes on `/health`.
2. GitHub Actions health check every 10 minutes (and it retries so a cold answer is not an outage).
3. Client `Sync.warmUp()`: a fire-and-forget `GET /health` (9 s abort, throttled to once per 30 s) when the PIN pad opens, to hide the cold start behind four digits of typing.
4. Client login timeout 60 s for roles with no offline fallback (owner, supervisor, crewmanager), 8 s for roles that can fall back; one automatic retry; every other sync request has an abort timeout and backs off.
5. Static assets are served with `s-maxage=600, stale-while-revalidate=86400` so the CDN answers instantly and refreshes in the background; `sw.js` is `no-cache`; the service worker is network-first.
6. One Postgres connection kept per container, a 20 s negative cache on connection failure, and boot work (`bootstrap`) done once per container behind a flag.

### 8.4 Alerting

The entire alerting system is: **a failed scheduled GitHub Actions run emails the repository owner.** That covers (a) `health.yml`: server down, `/health` not 200 after four tries, or `dbOk:false`; and (b) `ai-jobs.yml`: any AI endpoint not answering 200. There is no pager, no uptime service, no error tracker, no log drain, no dashboard alarm, no spend alarm on the Anthropic key, and no alert on stale GPS or stale redPro data. `/health` is the single health signal. Application errors are `print()` lines in Vercel's function logs (retention and visibility depend on the plan; the code comments say the plan cannot read them).

### 8.5 Known gaps (observed in the repo)

1. **No automated database backup is documented or scripted.** `LAUNCH_CHECKLIST.md` leaves "Backups of sync.db" unchecked and still describes SQLite. The only restore source documented is a manual device export. Whether Supabase Pro daily backups or point-in-time recovery are enabled is UNDETERMINED (no setting is in the repo).
2. **No server test run in CI.** About 45 `test_*.py` files exist and run only by hand. The only automated gate is the local pre-push browser suite (bypassable). GitHub workflows run no tests.
3. **Per-process locks and counters across multiple containers** (R1).
4. **Two schedulers for the same AI work** with no dedupe (R3).
5. **`/challans` and `/ai*` spend money with no global limit** beyond the per-day counters; `/challans` has none.
6. **Stale or contradictory docs:** `DEPLOY.md` says login lockout is "5 failures / 15 min" (code: 300 s) and CORS default `*` (code: the retired GitHub Pages origin plus localhost and native origins); `GO_LIVE.md` still refers to `keepalive.yml` and Render; `LAUNCH_CHECKLIST.md` says sessions are in memory (they are signed and stateless); `.vercelignore` says only API prefixes are rewritten (the rewrite is a catch-all); a comment in the `/health` handler says auto-deploy is off while `DEPLOY.md` says it is on; `review` job comment says 15 reviews per call (code: 10); `vercel.json` allows 300 s while the code budgets for ~60 s.
7. **`GET /health` is public and verbose** (database host, deployment id, configuration booleans, R2 error detail).
8. **Uncaught parse errors** on `since`, `odo` query values and on `float(speedKph)` in GPS events produce dropped connections rather than 400s.
9. **Secrets handling:** `GPS_INGEST_TOKEN` rotation is an open item; the seven demo PINs are printed in a public source file and in docs; the VAPID public key and a business e-mail are defaults in source (public by design). `.env*`, `.vapid_private.pem`, `.gps_ingest_token`, `.redpro_ingest_token`, `.ai_cron_token`, crew backups and `sync.db` are git-ignored and excluded from deployment by `.vercelignore`.
10. **Photos that fail to upload live inline in records** and then travel in every pull/push, in AI calls and in the 4.5 MB request limit.
11. **Local-disk `/uploads` route and SQLite/Turso paths are dead code on Vercel.**

---

## 9. Configuration inventory (names only)

Where configured: **Vercel env** unless stated. Required for production in bold.

- Database and storage: **`DATABASE_URL`**, `PG_RETRY_AFTER_SEC`, **`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`**, `MAX_UPLOAD_MB`, `MAX_PUSH_MB`, `MAX_PUSH_RECORDS`, `PULL_LIMIT`, `PULL_MAX_BYTES`; dormant: `TURSO_URL`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `DB_PATH`, `UPLOADS_DIR`, `DB_DISK_PERSISTENT`, `ALLOW_SQLITE_FALLBACK`.
- Auth and access: `SESSION_TTL_SEC`, `MAX_LOGIN_FAILS`, `MAX_IP_FAILS`, `LOGIN_LOCK_SEC`, `TRUSTED_PROXY_HOPS` (ignored on Vercel), `ENABLE_DEMO_SEED` (`0` in production), `ALLOWED_ORIGIN`, **`AGENT_KEYS`, `AGENT_SCOPES`**, `IMPORT_TOKEN` (temporary).
- Ingest and triggers: **`GPS_INGEST_TOKEN`, `REDPRO_INGEST_TOKEN`, `AI_CRON_TOKEN`** (also GitHub repository secret `AI_CRON_TOKEN`).
- AI: **`ANTHROPIC_API_KEY`**, `AI_MODEL`, `AI_DAILY_LIMIT`, `AI_BILL_DAILY`, `AI_REVIEW_DAILY_CALLS`, `AI_REVIEW_BATCH_MIN`, `AI_NAMES_DAILY_CALLS`, `AI_GATE_DAILY_CALLS`, `AI_CORE_DAILY_CALLS`, `AI_REPORT_DAILY_CALLS`, `AI_COACH_DAILY_CALLS`; hard-coded (no env): `ITS_BUDGET_S` 40, `ITS_BATCH_MAX` 10, `AI_ADVISOR_BUDGET_S` 30, `AI_ADVISOR_TURNS` 6, `AI_GATE_DAYS` 7, `AI_GATE_PER_CALL` 2, `AI_CORE_DAYS` 30, `AI_CORE_PER_CALL` 3, `AI_REPORT_DAYS` 14, `AI_REPORT_PER_CALL` 3, `AI_COACH_PER_CALL` 4, `AI_REVIEW_BATCH_MAX` 6000, `DIGEST_HOUR_IST` 7, `AGENT_COACHING_MAX` 200.
- Vision fallback: `VISION_PROVIDER`, `VISION_KEY`, `VISION_MODEL`, `VISION_BASE`, `ODO_MAX_DAILY_KM`.
- Integrations: `ECHALLAN_API_KEY`, `ECHALLAN_BASE`, `ITS_LOOKUP_USER`, `ITS_LOOKUP_PASSWORD`, `ITS_BRANCH_CODE`, `ITS_BASE_URL`, `ITS_LOGIN_AS`, `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC`, `VAPID_SUBJECT`, `WA_TOKEN`, `WA_PHONE_ID`, `WA_VERIFY_TOKEN`, `WA_APP_SECRET`, `WA_PROMPT_TEMPLATE`, `WA_TEMPLATE_LANG`, `WA_ALLOW_UNSIGNED`.
- Behaviour: `FEATURE_FLAGS`, `RL_SYNC_PER_MIN`, `RL_UPLOAD_PER_HOUR`, `RATE_LIMIT_OFF`, `OVERSPEED_KPH`, `HARSH_DROP_KPH`, `IDLE_MIN`, `GPS_HISTORY_DAYS`, `TRIPLOG_HISTORY_DAYS`, `STOCKMOVES_HISTORY_DAYS`, `USAGE_HISTORY_DAYS`, `AUDITS_HISTORY_DAYS`, `DUTYLOG_HISTORY_DAYS`.
- Platform-supplied: `VERCEL`, `VERCEL_DEPLOYMENT_ID`, `VERCEL_URL`, `VERCEL_GIT_COMMIT_SHA`, `PORT`.
- Elsewhere: the redPro token lives in the Chrome extension's local settings on the office laptop; `GS_AGENT_KEY` lives with the agent; iOS signing secrets live in GitHub repository secrets.

---

## 10. Risks for a rebuild

**R1. The sync cursor depends on `rev = MAX(rev)+1` computed under a lock that exists in only one container.** `_lock` is a `threading.Lock`; Vercel runs several containers. Two simultaneous pushes can read the same maximum and write the same `rev`, and a phone that pulled between them has a cursor that skips the second write ("rev > cursor") with no error anywhere. `pull()` already works around one such window; the same pattern guards the login lockout counter, the rate limiter and the AI daily counters (each is a read-then-write guarded only by that per-process lock). The rebuild needs a database-issued monotonic sequence (or one transaction that allocates revs) and idempotent counters, while keeping `since`-cursor semantics, 4-second polling load (every poll is 4-5 queries on one serialized connection), and the rev-group paging rule for phones already in the field.

**R2. The real specification is implicit in code and in phones.** Roughly 60 untyped JSON "stores" live in one table; the per-store write matrix, the append-only and ownership rules in `_guard_write`, server-stamped provenance (`_by`, `_byRole`, `_createdBy`, `verifiedBy`), and per-role redaction (`redact_for`, `_never_for`, which must agree and are checked by tests) are the business rules. Client logic is mirrored on the server and must stay equal (`gate.js` items vs `GATE_ITEMS`, `trace.js` vs `crew_trace.py`, ITS recheck windows in `app.js`). Old app builds keep calling today's shapes (`/v1` frozen, single-record 403 shape, `refused[]` list, `_redacted` flag, quarantine behaviour), and a lost-response retry into an append-only store is refused today. The rebuild must carry these as tests before changing anything.

**R3. Operational fragility around jobs and integrations.** (a) Seven AI jobs run on Opus-class pricing from two uncoordinated schedulers (GitHub Actions and an office-laptop Chrome extension), with non-atomic daily counters and no queue, so work and spend can double. (b) redPro data depends on one laptop with a pinned, signed-in tab; ITS lookups depend on scraping an ASP.NET site; WhatsApp relies on a thread outliving the HTTP response. (c) Alerting is only the GitHub failure e-mail, there is no documented database backup, and no CI runs the server tests. A rebuild should put jobs on a real queue with idempotency keys and a spend meter, and give each integration a freshness signal.

Other items worth tracking: 4-digit PINs with a single unkeyed SHA-256 round and a session secret stored beside them; 12-hour tokens with no refresh and no revocation list; owner/supervisor/crewmanager have no offline login so a cold start blocks them; public `/roster` and `/health`; per-request database lookup in token validation.

---

## 11. UNDETERMINED items (not guessed)

- Whether Vercel auto-deploys on push to `main` (code comments and docs disagree, section 8.1).
- Vercel plan and the effective limits on the 2-minute cron and on log retention.
- Whether Supabase backups / point-in-time recovery are enabled (not in the repo).
- Whether `VAPID_PRIVATE_KEY` is currently set (`GO_LIVE.md` says it was not; `/health.vapidReady` would say, and was not queried).
- Whether the WhatsApp webhook is live and whether its background thread completes on Vercel.
- Current values of any environment variable (only names and defaults are knowable from the repo); which agents exist besides `operator-agents`; whether AirFi is currently pushing.
- HTTP status produced by the platform for the uncaught parse errors listed in 8.5 item 8.
- How many containers Vercel actually runs concurrently for this project (R1 severity depends on it).

# BUILD SPEC — Device-bound identity + server write-enforcement

Owner decision (2026-07-29): keep **PIN 0000** for humans, but make the **device**
carry a real, server-verifiable identity so attribution (job cards, trip cash,
Pilferage Radar) and money writes can be trusted. Closes Open Items: shared-PIN
identity collapse + zero server write-validation/tenant scoping.

Nothing deploys until `/g-saathi` passes all 5 roles against the enforcing server
and a review subagent returns SHIP. autoDeploy is OFF (manual Render deploy; Pages
on push).

## Problem recap (verified in code 2026-07-29)
- `app.js:4488` `_pin4 = () => '0000'` — all 107 drivers + 57 conductors share it.
- Bulk-seeded crew are **local-only** accounts → no server token → their pushes 401
  → trip/attendance data never leaves the phone AND is unattributable.
- `sync_server.py push()` blind-upserts any store/id for any valid token: no role
  gate, no author check, no tenant scope. A crafted request writes a `ledger` row.

## Design

### Phase 1 — Real server accounts for the whole roster (foundation, additive/low-risk)
The client already holds the full roster in `seed-data.js`. Add an owner-token-gated
endpoint `POST /auth/register-roster` that upserts every driver/conductor as a real
server user (name, role, PIN 0000 hashed). Idempotent by a stable id derived from the
seed (`u-drv-<extId>` / `u-con-<extId>`), so re-runs don't duplicate. After this,
crew `/auth/login` with 0000 returns a **real token** → their pushes authenticate and
are attributable. Client: owner "Crew logins & PINs" screen gets a "Register roster
on server" action; also auto-run once post-seed (versioned flag).

Device-bound part: the token already persists per-device in `localStorage.token`.
On successful crew login we also stamp `localStorage.deviceUser = uid` so the app's
attribution uses the *bound* account, not merely whoever typed 0000.

### Phase 2 — Server stamps immutable provenance (anti-forgery)
In `push()`, derive `(uid, role)` from the Bearer token (`user_for_token`). On every
upserted record, the server **overwrites** two reserved fields from the token, which
the client can never set:
- `_by`   = uid of the pushing account
- `_byRole` = role of the pushing account
The Pilferage Radar / audits read `_by` (server truth) instead of client-set
attribution fields, so a borrowed phone or crafted body can't blame someone else.
`_by` is additive — existing attribution fields stay for display; `_by` is the
trust anchor.

### Phase 3 — Role → store write matrix (mirrors client PERMS, so nothing breaks)
`push()` rejects (403, record quarantined client-side, never wedges the outbox) a
write to a store the pushing role may not write. Matrix derived from `app.js` PERMS +
the write-site survey:

| store          | roles allowed to push                    | basis |
|----------------|------------------------------------------|-------|
| ledger         | owner, supervisor, store                 | issuePart/receiveStock/audits |
| purchases      | owner, supervisor, store                 | addPurchase |
| vendors        | owner, supervisor, store                 | addPurchase |
| components     | owner, supervisor, store                 | issuePart |
| def            | owner, supervisor, store                 | addFuel |
| fuel           | owner, supervisor, store                 | addFuel |
| buses          | owner, supervisor                        | addBus |
| routes         | owner, supervisor                        | manageRoutes |
| drivers        | owner, supervisor                        | manageDrivers |
| parts          | owner, supervisor, store                 | catalogue/stock |
| jobcards       | owner, supervisor, store, mechanic       | create/verify + mechanic work + store fulfil |
| audits         | owner, supervisor, store                 | reconciliation |
| attendance     | ALL roles                                | everyone checks in |
| trips          | owner, supervisor, driver                | driver cash session (+ mgmt salary edits) |
| driverreports  | ALL roles                                | driver raises, mgmt resolves |
| incidents      | owner, supervisor                        | manageDrivers |
| users          | owner, supervisor                        | staff mgmt (server also self-guards) |
| gpsevents      | server-ingest only (no client push)      | AirFi ingest path |

Enforcement is **allow-list**: unknown store or role-not-in-list → 403. Owner passes
everything. The pre-push gate + g-saathi drive every role's real write flows to prove
no legitimate path 403s before deploy.

### Tenant scoping
Single garage today (Mahalaxmi) → one implicit tenant. Stamp `_org` = "mahalaxmi" on
writes now so multi-garage is a later filter, not a schema migration. No functional
change yet; provenance only.

## Client changes
- `sync.js`: on 403 (role-denied) treat like existing 4xx → quarantine + surface a
  toast; do not retry-wedge.
- Attribution readers (Pilferage Radar `pilferageRadar()`, audits, trip accounting)
  prefer `_by` when present, fall back to legacy field.
- Crew login binds `deviceUser`; "Register roster on server" button + auto-run.

## Verification gate (per repo convention)
1. `node --check` on every touched JS; server `python -c 'import sync_server'`.
2. `/g-saathi` — all 5 roles login + each role's key WRITE flows land server-side
   (assert store grew by 1) against the enforcing server. Any legitimate 403 = bug.
3. A negative test: a driver-token push to `ledger` returns 403 and is quarantined.
4. Review subagent SHIP.
5. Only then: push (Pages) + Manual Deploy (Render).

## Status
- [x] Design (this file)
- [x] Phase 1 — roster registration + real crew tokens
      (`/auth/register-roster` accepts a SENT roster — the seed loads crew with
      notify=false and never pushes them, so scanning records alone would create 0;
      records-scan kept as fallback. Client sends `crewRoster()`; auto-runs once per
      manager login + manual button in Crew logins & PINs.)
- [x] Phase 2 — server `_by`/`_byRole`/`_org` provenance (overwritten from token)
- [x] Phase 3 — role→store enforcement (WRITE_ROLES allow-list, mirrors PERMS)
- [x] Client 403 handling — existing sync.js quarantine covers 403 (no wedge)
- [x] Server verification — `test_enforcement.py` 34/34 PASS + live HTTP wire test
      (owner→roster→driver 0000 token→ledger 403 & not stored→attendance _by from
      token→unauth 401). Static audit: every synced store's real writers ⊆ matrix
      (drivers/triplog/ledger confirmed manager/store-only paths — no false denials).
- [x] `/g-saathi` 5-role CLIENT regression (2026-07-29) — **ALL 5 PASS** (owner,
      supervisor, store, mechanic, driver). Confirmed: login intact all roles;
      auto-activation fires ONLY for owner/supervisor (mechanic/driver post-login
      console clean, no throw); crewpins shows both buttons + offline activate toasts
      "Sign in online first" with stable route; geofence honesty (locSet=false →
      setup "Not set", markAttendance no throw); write flows persist (new-job,
      reassign, full-count audit +1, add-stock ledger+1, driver report +1); full-count
      field-tap regression still fixed; role scoping clean (crew can't see owner acts
      incl. activateCrewServer). 42 screenshots in /tmp/g-saathi/.
- [ ] OPTIONAL: review subagent on the diff (security code — cheap insurance)
- [ ] Deploy: push (Pages) + **Manual Deploy on Render** (server change → required).
      After deploy, the FIRST owner/supervisor login online auto-runs register-roster
      (materializes ~164 crew accounts) — verify /health + one crew online login.

## Note on `_by` (attribution readers)
Server now records immutable `_by` on every write. Readers (Pilferage Radar, audits)
still key off their business fields (e.g. `assignedTo`) — `_by` is the forensic trust
anchor and the enforcement is what stops cross-role forgery. Wiring specific readers
to cross-check `_by` (e.g. attendance.userId === _by) is a future refinement, not
required for the security property.

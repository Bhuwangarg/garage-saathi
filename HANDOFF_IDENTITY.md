# HANDOFF — Device-bound identity + server write-enforcement (Fix C, and A/B)

**Date:** 2026-07-29/08-02  ·  **Status:** BUILT + VERIFIED, **NOT YET DEPLOYED**
**Session:** `c0f2f068-6289-4051-a40e-bbb5cee20c6d`
**Transcript:** `~/.claude/projects/-Users-bhuwangarg-Downloads-claude-test/c0f2f068-6289-4051-a40e-bbb5cee20c6d.jsonl`
**Design + status detail:** `BUILD_SPEC_IDENTITY.md` (same repo)

## Why this work exists
Four confirmed holes were raised:
1. All 164 crew share PIN `0000` → attribution / Pilferage Radar was theater.
2. `components`, `def`, `vendors`, `trips` were absent from `Sync.STORES` → single-device, no backup.
3. Server `push()` did zero write-validation / tenant scoping → a crafted request forges a `ledger` row.
4. Geofence still Jaipur placeholder `26.9124/75.7873` masquerading as configured → attendance distance meaningless.

Owner decision: **device-bound identity** — keep `0000` for humans, make the *device* carry a server-verified identity.

## What changed (all local/staged)

### Fix A — sync the 4 orphaned stores  (`sync.js`)
- Added `components, def, vendors, trips` to `STORES`.
- `backfillOnce()` (versioned flag `syncBackfill_compdefvendtrip_v1`) enqueues already-stranded records once.
- Caveat: trips created by offline-only crew still won't push until Fix C gives them a token.

### Fix B — geofence honesty  (`db.js`, `app.js`)
- Default garage meta now carries `locSet:false`.
- Setup UI nags "⚠️ Not set" on `!locSet` (not `lat!=null`); `saveGarage` sets `locSet:true` only on real capture.
- `markAttendance` computes/trusts `dist` only when `locSet` (else `dist=null`, no bogus "12000m" nag; owner gets a toast to set it).
- **OPEN:** still needs the real garage lat/long captured on-site (Garage setup → "Use my current location") or pasted in.

### Fix C — device-bound identity + server enforcement  (`sync_server.py`, `sync.js`, `app.js`)
- **Phase 1 — roster materialization.** New `POST /auth/register-roster` (owner/supervisor-gated) creates real crew accounts (PIN `0000`) from a roster the owner device **sends** (`crewRoster()`). The bundled seed loads crew with `notify=false` and never pushes them, so scanning server records alone would create ZERO — sending the list is essential; records-scan kept as fallback. Client auto-runs once per manager login (`maybeAutoActivateCrew` in `enterApp`, flag `gsRosterActivated`) + a manual "🔐 Activate crew server logins" button in Crew logins & PINs. After this, crew log in online with `0000` → real server token → their writes authenticate and are attributable.
- **Phase 2 — immutable provenance.** `push()` overwrites reserved `_by` / `_byRole` / `_org` from the TOKEN (client can't set them). `_by` is the forensic trust anchor.
- **Phase 3 — role→store enforcement.** `WRITE_ROLES` allow-list mirrors the client `PERMS` matrix. Driver/conductor/mechanic can't write `ledger`/`vendors`/`purchases`/`buses`/etc.; owner passes all; unknown store denied. `/push` returns 403 on a denied (single-record) push; the client already quarantines 4xx (sync.js:221) so nothing wedges the outbox.

## Files touched
- `sync_server.py` — `WRITE_ROLES`, `may_write()`, `push(records, actor)`, `register_roster(crew)`, `/auth/register-roster` + `/push` handlers.
- `sync.js` — `STORES` +4, `backfillOnce()`, `registerRoster(crew)` + export.
- `app.js` — `crewRoster()`, `activateCrewServer()`, `maybeAutoActivateCrew()` (in `enterApp`), crewpins button, geofence guards in `markAttendance`/`saveGarage`/setup UI.
- `db.js` — default garage `locSet:false`.
- `test_enforcement.py` — 34-check server test (NEW).
- `BUILD_SPEC_IDENTITY.md` — design + status (NEW).

## Verification (DONE)
- **`python3 test_enforcement.py` → 34/34 PASS** (roster both paths, full role×store matrix, provenance forgery-resistance).
- **Live HTTP wire test** — owner→register-roster→driver logs in with `0000`→ forged `ledger` push **403 & not stored** → attendance stored with `_by` from token (body's forged `_by` overwritten) → unauth push **401**.
- **`/g-saathi` 5-role client regression → ALL 5 PASS** (owner, supervisor, store, mechanic, driver). Login intact; auto-activation fires only for owner/supervisor (mechanic/driver clean); crewpins buttons + offline toast correct; geofence honesty holds; write flows persist (new-job, reassign, full-count audit +1, add-stock ledger+1, driver report +1); full-count field-tap regression still fixed; role scoping clean. 42 screenshots in `/tmp/g-saathi/`.
- `node --check` clean on all JS; `sync_server.py` parses.

## TO DEPLOY (owner action — nothing is live yet)
1. **Frontend (GitHub Pages):** commit + push `sync.js`, `app.js`, `db.js` to `main`. (No seed-version bump needed for the `locSet` default — existing devices read undefined as not-set, the honest default.)
2. **Backend (Render):** **Manual Deploy** — REQUIRED, `sync_server.py` changed. Without it the client pushes to an old server that still accepts forged writes. (autoDeploy is OFF.)
3. **Post-deploy check:** first owner/supervisor login online auto-runs `register-roster` (~164 crew accounts); confirm `/health` green + one crew member logs in online with `0000` and syncs a trip.
4. **Close Fix B:** capture the real garage geofence on-site.

## Server env already on Render (unchanged)
`TURSO_URL`, `TURSO_AUTH_TOKEN`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`.

## Known follow-ups / notes
- `_by` is recorded server-side but readers (Pilferage Radar, audits) still key off business fields (e.g. `assignedTo`). Wiring readers to cross-check `_by` (e.g. attendance.userId === _by) is a future refinement, not required for the security property.
- Tenant scoping is provenance-only for now (`_org="mahalaxmi"`); multi-garage filtering is a later step, no schema migration needed.
- Crew PIN stays `0000` per owner; the security now rides the server token + enforcement, not the human secret.

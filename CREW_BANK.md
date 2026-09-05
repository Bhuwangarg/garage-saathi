# Crew Data Bank — drivers & conductors

**Built:** 2026-09-05 · **Where:** People tab → *Crew data bank* · **Status:** built + verified locally, **not deployed**

One register for every driver and conductor the company has ever employed —
licence, Aadhaar, phone, photo, next-of-kin, joining and leaving.

## What it replaced

Garage Saathi already had a driver document vault (licence / Aadhaar / PAN /
police / medical, with photos, OCR and expiry alerts). Three things were missing:

1. **Conductors were not in it at all.** All 56 of them existed only as a name
   typed on a bus row plus a login account — no phone, no photo, no documents,
   nothing searchable. Half the register was missing.
2. **No way to look anybody up.** The Drivers screen sorts 107 people by
   performance score. There was no search, so "who is the man on MP44ZE2704"
   had no answer.
3. **No joining or leaving.** No new-joiner form, no employment status, and
   nothing stopping the office from rehiring a man who was sacked.

## Design decisions worth not re-litigating

**Conductors live in the `drivers` store, with `crewRole: 'conductor'`.** The
office asks the same questions about both, that store already syncs, and the
server already gates writes to it (`WRITE_ROLES["drivers"] = owner, supervisor`).
A new store would have meant a Render deploy and a second place for the same
truth. **This change is frontend-only — GitHub Pages push, no backend deploy.**

A record with **no** `crewRole` is a driver. Every record that existed before
this was one, so the absent value is the safe default and nothing needed
backfilling.

**Nothing is ever deleted.** `status` is `active` or `left`; marking someone as
left frees his bus and drops him off every working list but keeps the record —
including *why* he went and whether you would take him back. That is the whole
point of a bank rather than a list.

**Mandatory documents depend on the job.** Driver: licence + Aadhaar + photo.
Conductor: Aadhaar + photo. **PAN was demoted from mandatory to optional** — a
conductor earning below the threshold has no PAN, and demanding one of him
forever only teaches the office to ignore the nag list.

**Aadhaar is masked everywhere** (`XXXX XXXX 1234`). Full numbers are never
printed in a list, never exported, and revealing one is a separate deliberate
tap available only to owner/supervisor. The Aadhaar Act forbids publishing the
number, and nobody working a list needs all twelve digits — the last four are
enough to tell two Rameshs apart, and search works on them.

**Duplicate detection searches ex-staff too.** Adding a joiner whose phone,
Aadhaar or licence matches anyone in the bank raises a warning naming that
person, when they left, why, and whether they were marked do-not-rehire.
Rejoining someone flagged `rehire: no` warns again. This is the single most
valuable thing in the register.

## Where things are (`app.js`)

| Thing | Search for |
|---|---|
| Crew helpers, roles, Aadhaar mask | `===== Crew records` |
| Mandatory-document matrix | `DRIVER_DOCS` |
| The bank screen, search, filters | `viewCrewBank` / `renderCrewList` |
| New joining | `sheetAddCrew` / `saveCrew` |
| Duplicate check | `crewDuplicates` / `crewDupLine` |
| Leaving & rejoining | `sheetCrewExit` / `rejoinCrew` |
| CSV export (Aadhaar masked) | `exportCrewCsv` |
| One-time conductor backfill | `backfillConductorProfiles` |

## The backfill

`maybeBackfillConductors` runs **once per device, on the first owner/supervisor
login** (flag `gsCrewBankV1`), and creates one crew record per bus conductor,
keyed `con-<REG>` so a second device cannot duplicate it. It is gated to roles
the server lets write `drivers` — a driver's phone doing it would just collect
403s in its outbox. Verified idempotent (second run creates 0) and it skips
blank/`-` conductor names.

## Also changed, because conductors now share the store

- `driverOfBus` / `viewDrivers` / `viewAssignments` / the scoreboard and worst-
  driver insight are **drivers only** — a conductor must not turn up as the
  driver of a bus.
- `saveAssignBus` clears the **same-role** seat: moving a conductor onto a bus
  no longer throws its driver off.
- `createCrewLogins` gives a conductor record a **conductor** account, and
  reuses `d.userId` when set — otherwise a conductor got two accounts, one from
  each direction.
- The 166 per-person "docs incomplete" insights **roll into one card** past a
  handful. Individually they buried every other finding on the Insights screen
  (238 findings → 73).
- A conductor now reaches his own document locker from **Me**, as a driver does.

## Verified

- `probe_cb.html` — read paths: roles, mandatory matrix, filters, search by
  Aadhaar last-4, masking, duplicate detection, profile, doc sheet. 0 errors.
- `probe_cb2.html` — write paths against the real IndexedDB: backfill +
  idempotence, new joining, duplicate blocking, mark-as-left, do-not-rehire
  warning, login minting. 0 errors.
- `probe_dv.html`, `probe_core.html`, `probe_login.html` — unchanged, pass.
- `scripts/predeploy-gate.sh` — **14 passed, 0 failed.**

## To deploy

Frontend only: commit + push `app.js` to `main` (GitHub Pages). **No Render
deploy** — `sync_server.py` is untouched. On the first owner/supervisor login
after the push, the conductor backfill runs and syncs the new records to every
other device.

## Open

- Conductor phone numbers come from `bus.crewPhone` where one was recorded;
  most are blank and need filling from the office register.
- Document *photos* are still to be collected for everyone — the bank shows the
  worklist under the "Docs missing" filter.

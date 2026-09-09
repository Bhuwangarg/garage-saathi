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
A new store would have meant server work and a second place for the same truth.

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

## Hindi (Sep 2026)

Every crew-bank screen is bilingual through the existing `I18N` / `t()` table —
the bank, the joining form, the profile and details card, leaving and
rejoining, the duplicate warnings, and the document vault. 301 keys, en/hi at
full parity.

Three things worth knowing:

- **Labels are keys, resolved at render time.** `CREW_ROLE_META` and
  `DRIVER_DOCS` hold `roleDriver` / `docLicense` rather than words, read through
  `crewRoleLabel()` and `docLabel()`. Storing the words would freeze them in
  whatever language the app was loaded in, because the language toggle only
  re-renders — it does not reload.
- **The reason someone left is stored as a key** (`leftReasonKey`) plus a free
  note, so it reads in whichever language you open it. `leftReason` is still
  written as English text for the CSV and for records made before this existed;
  `crewLeftReason()` prefers the key and falls back to the old string.
- **The CSV export stays English.** It is a data file for the office's own
  spreadsheets, and translating the column headers would break any formula
  built on top of it. `enLabel()` forces English for those cells.

Hindi screen titles are kept deliberately short (`ड्यूटी`, `स्टाफ बैंक`, `आज`):
the topbar's side columns leave the title little room and Devanagari is wider
than Latin at the same size, so a longer title gets ellipsised. Verified
unclipped in both languages.

## The Crew Manager login (Sep 2026)

A single-job role — `crewmanager` — for the person who assigns crew to buses
each day and keeps their records. It has exactly two permissions,
`assignDriver` and `manageDrivers`, and nothing else: verified against 18 other
permissions and 13 restricted routes, all denied.

What it deliberately does NOT get:
- **Money** — no Money tab, and the salary field is hidden from the joining
  form, the edit form and the details card (`can(role,'money')` gates all
  three). Pay is not part of who somebody is.
- **Crew logins & PINs** — `crewpins` moved off `manageDrivers` onto its own
  `manageCrewLogins` permission. Minting logins for the whole crew is an
  owner's job, not part of keeping their records.
- **Performance scoring and problem reports** — `+ Data point` and `Log report`
  now sit behind a new `logIncident` permission (owner/supervisor). Judging
  somebody's driving is not record-keeping, and the server refuses `incidents`
  writes from anyone else regardless.

Server-side the role may write exactly `drivers` and `attendance` — verified;
`ledger`, `users`, `buses`, `incidents` and `driverreports` are all refused.
That required a `WRITE_ROLES` change in `sync_server.py`, which deploys with the
same push as the client (see **To deploy**).

**The duty board** (`viewAssignments`, formerly "Driver ↔ Bus") gained a
role chip, because a bus carries a driver *and* a conductor and assigning the
conductor was not possible before. `sheetAssignDriverToBus` and
`saveAssignDriver` take a seat argument and clear only the same-role seat —
filling the conductor's chair must never take the driver off the bus.

His home (`viewCrewManagerHome`) is just: which buses are short a driver, which
are short a conductor, and a way into the bank.

## To deploy

**One `git push` to `main` ships everything.** Vercel serves the PWA and the
Python sync server from a single origin (`garage-saathi-sync.vercel.app`) via
`api/index.py` + `vercel.json`, and deploys automatically on push — frontend and
`sync_server.py` together. There is no manual step and no ordering problem, so
the `WRITE_ROLES` change for `crewmanager` lands with the client that needs it.

Verify after pushing: `/health` reports the deployed `commit`, and the live
`app.js` should match `git show HEAD:app.js`.

**`render.yaml`, `Procfile` and `Dockerfile` have been deleted** (Sep 2026). They
were left from the Render era (the app moved to Vercel in Aug 2026, commit
`4d23aea`) and described a manual-deploy workflow that no longer exists — they had
already produced one wrong deploy plan.

**Creating the login itself is an owner action** — Me → Staff → Add staff →
Crew Manager, with a 4-digit PIN the owner chooses. Only the owner sees that
option in the dropdown, and `saveStaff` re-checks it rather than trusting the
form.

## Open

- Conductor phone numbers come from `bus.crewPhone` where one was recorded;
  most are blank and need filling from the office register.
- Document *photos* are still to be collected for everyone — the bank shows the
  worklist under the "Docs missing" filter.

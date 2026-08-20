# Go live — ordered runbook

Takes the backend off Turso onto the persistent disk Render already mounts, restores
the real dataset from a device backup, and closes the published-PIN hole before
anyone gets a phone.

Every step below was rehearsed end to end against the real 2026-08-20 backup:
2,893 records restored, 0 rejected, and a clean device pulled back 103 buses,
2,384 parts and a 171-person roster.

**Do these in order.** Steps 1, 5 and 7 lose data or access if skipped or reordered.

---

## 1. Back up the owner's device — before touching anything

On the phone holding the garage data:

    https://bhuwangarg.github.io/garage-saathi/export.html

Check the counts, tap **Save backup file**, get it off the phone.

*"No data on this device"* means the page was opened from a different address than
the app, or that phone isn't the one with the data. IndexedDB is per-origin.

> Turso will not connect, so do not assume the server has a copy.

## 2. Clean the backup

```bash
python3 scripts/clean-backup.py backup.json -o backup-clean.json --drop-store gpsevents
python3 scripts/restore-backup.py backup-clean.json --check-only
```

The app soft-deletes, so a raw export carries every row ever deleted alongside the
live ones — the 2026-08-20 export was 184 bus rows: **103 live plus 81 tombstones**.
The cleaner drops tombstones and merges nothing. If it ever finds two *live* rows
for one registration it stops and tells you, rather than guessing which is the real
bus.

`--drop-store gpsevents` skips ~56k derived GPS safety events (95% of the file).
Driver safety scores restart from zero and rebuild from new telemetry. Drop the flag
to keep the history.

## 3. Create the Supabase database

Render persistent disks need a paid instance, so the durable store is Supabase
Postgres (free tier, 500 MB — the full garage is ~3 MB).

1. supabase.com → **New project**. Pick a region near Jaipur (Mumbai / ap-south-1).
2. Project Settings → **Database** → **Connection string** → **URI**. It looks like
   `postgresql://postgres:PASSWORD@db.<ref>.supabase.co:5432/postgres`.
3. Substitute the password you set for the project into the URI.

Nothing needs creating inside the database — the server builds its own schema on
first boot.

> Free Supabase projects **pause after ~7 days of inactivity**. The existing
> `keepalive.yml` cron pings the web service; because every request now reads
> Postgres, that also keeps the database warm. Leave it enabled.

## 4. Set the environment on Render, then deploy

**Add:**

| Variable | Value |
|---|---|
| `DATABASE_URL` | the Supabase URI from step 3 |
| `IMPORT_TOKEN` | a long random string (temporary, for step 5) |

**Remove:**

| Variable | Action |
|---|---|
| `TURSO_URL` | delete |
| `TURSO_AUTH_TOKEN` | delete |

Leave `ENABLE_DEMO_SEED` unset for now — the seeded owner account is how you get
into a fresh database. Step 7 removes it.

Then **Manual Deploy** (`autoDeploy: false` is deliberate).

```bash
curl -s https://garage-saathi-sync.onrender.com/health | python3 -m json.tool
```

Required:

```
"dbMode": "postgres",   "persistent": true,
"pgHost": "db.<ref>.supabase.co:5432",
"build": "2026-08-20-postgres"
```

`pgHost` is parsed from the URI so the password can never appear on this public
endpoint. If `dbMode` is anything other than `postgres`, `DATABASE_URL` did not
reach the process — fix that before restoring.

The server **refuses to start** if `DATABASE_URL` is set but Postgres is
unreachable, rather than quietly serving an empty local file. A failed deploy here
is the guard working: Render keeps routing to the previous container.

## 5. Restore

```bash
python3 scripts/restore-backup.py backup-clean.json \
  --server https://garage-saathi-sync.onrender.com \
  --user u-owner --pin 1111 --import-token "$IMPORT_TOKEN" --dry-run
```

Check the per-store counts, then run without `--dry-run`. Expect `rejected = 0`.

It restores through `/admin/import`, not `/push`: `push()` stamps `_by`/`_byRole`
from the caller's token, so a normal replay would re-attribute every record to
whoever ran the restore and destroy the actor trail the Pilferage Radar reads.

The PIN-free `users` roster **is** restored — without it the login screen has nobody
to list. It cannot create logins; that's step 6.

## 6. Recreate the login accounts

A fresh database has only the seeded accounts. Two groups need attention.

**Crew (165 drivers + conductors).** On the owner device open **Crew PINs** and
register the roster. This calls `/auth/register-roster`, which creates a login for
every driver and conductor with PIN `0000`.

**Management.** `u-sup` Ramesh, `u-store` Suresh and `u-m1/2/3` Mukesh, Imran and
Vijay *are* the seeded identities — the same ones whose PINs are published in this
repo. From the owner device, **set a real PIN for every one of them** (Staff
accounts → reset PIN), not just your own.

> This is the trap in step 7. The purge removes any seeded account still using its
> published PIN. Change all six first and they survive; skip one and that person is
> deleted along with the demo accounts.

## 7. Close the published-PIN hole

| Variable | Value |
|---|---|
| `ENABLE_DEMO_SEED` | `0` |
| `IMPORT_TOKEN` | delete — restore is done |

Redeploy. On boot the server removes every seeded account still on its published PIN
and logs which. Verify all of these return **401**:

```bash
for u in u-owner:1111 u-sup:2222 u-store:3333 u-m1:0001 u-m2:0002 u-m3:0003 u-d1:0010; do
  printf "%-9s " "${u%%:*}"
  curl -s -o /dev/null -w "%{http_code}\n" -X POST https://garage-saathi-sync.onrender.com/auth/login \
    -H 'Content-Type: application/json' -d "{\"userId\":\"${u%%:*}\",\"pin\":\"${u##*:}\"}"
done
```

Any `200` means anyone who has read this public repo can log into your garage.

## 8. Garage setup — on the owner device

- **Capture the garage location.** Standing at the garage: *Garage setup → "Use my
  current location"*. Until then `locSet` is false and every attendance distance is
  measured from a placeholder point in central Jaipur.
- **Labour rate** — still the ₹250 default; drives every cost and bill figure.
- **Business name**, **late cutoff**.

## 9. Handing out phones

**Sign in as owner once on each phone before giving it to staff.** A brand-new
device only knows the seven seeded names — the real 165-person roster lives behind
`/pull`, which needs a session. Verified: before an owner login the picker showed 1
driver; after, 108 drivers and 57 conductors.

Then each staff member signs in **online once on their own phone** so their PIN
caches there for offline use.

```bash
bash scripts/predeploy-gate.sh     # 14 checks, ~60s
```

---

## Still open after this

- **`VAPID_PRIVATE_KEY` unset** → `vapidReady: false`, no push notifications.
- **Crew PIN is uniform `0000`** for all 165 drivers and conductors. Anyone who
  knows a name can sign in as them. Lowest-privilege roles, and route scoping was
  tightened on 2026-08-18, but it deserves a policy decision.
- **`S.cache` is unscoped on crew devices** — the full fleet, roster and ledger sit
  in every driver's IndexedDB regardless of what the UI shows.
- **Trip-cash flow is English-only in Hindi mode** — the driver's money screen.
- **Check-in fails silently without a camera** — no sheet, no toast, no error.
- **Supabase free tier**: 500 MB (the garage is ~3 MB) and projects pause after
  ~7 days idle. The keepalive cron prevents that; if it is ever disabled, the first
  request after a pause fails while the database wakes.
- **Duplicate bus writes.** 81 of 184 bus rows were tombstones from a write-repeat
  burst between 2 and 10 Aug (up to 9 rows for one registration, all `source: airfi`,
  all by `u-owner`). The app's `cleanupFleet` cleaned up after it, but whatever
  created them was never found.
- **Firebase** needs the Blaze plan for Functions, so PIN auth, GPS ingest, challans
  and the WhatsApp webhook cannot move there on Spark.

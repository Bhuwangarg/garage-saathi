# Go live — ordered runbook

Takes the backend off Turso and onto the persistent disk Render already mounts,
restores the real dataset from a device backup, and closes the published-PIN hole
before anyone gets a phone.

**Do these in order.** Steps 3 and 7 are the ones that lose data or leak access if
skipped.

---

## 1. Back up the owner's device — before touching anything

On the phone that holds the garage data, open:

    https://bhuwangarg.github.io/garage-saathi/export.html

Check the counts look like your garage (buses ≈ 89, drivers ≈ 107, parts ≈ 2,384),
tap **Save backup file**, and send the `.json` somewhere off the phone.

If it says *"No data on this device"* the page was opened from a different address
than the app, or that phone is not the one holding the data. IndexedDB is per-origin
— the counts are the proof you are looking at the right database.

> This file is the only guaranteed copy. Turso currently will not connect, so do not
> assume the server has one.

## 2. Set the environment on Render

**Remove** — this is what takes Turso out of the picture:

| Variable | Action |
|---|---|
| `TURSO_URL` | delete |
| `TURSO_AUTH_TOKEN` | delete |

With both unset the server uses `DB_PATH=/data/sync.db` on the 1 GB disk the
blueprint mounts. That disk survives redeploys — `/health` will now say so
(`dbMode: sqlite-disk`) instead of mislabelling it ephemeral.

**Add**, temporarily, for the restore in step 4:

| Variable | Value |
|---|---|
| `IMPORT_TOKEN` | a long random string |

Leave `ENABLE_DEMO_SEED` **unset** for now — the demo owner account is how you get
in on a fresh database. Step 7 removes it.

## 3. Manual Deploy, then confirm where the data lives

Render → the service → **Manual Deploy**. (`autoDeploy: false` is deliberate.)

```bash
curl -s https://garage-saathi-sync.onrender.com/health | python3 -m json.tool
```

Required:

```
"dbMode": "sqlite-disk",   "persistent": true,
"tursoConfigured": false,  "build": "2026-08-20-disk-strict"
```

If `dbMode` is `sqlite-ephemeral`, `DB_PATH` is not on `/data` — stop and fix the
mount, or every restart wipes the garage.

The server now **refuses to start** if `TURSO_URL` is set but unreachable, rather
than quietly serving an empty database. A failed deploy here is the guard working:
read the log, and Render keeps routing to the last healthy container.

## 4. Restore the backup

```bash
python3 scripts/restore-backup.py ~/Downloads/garage-saathi-backup-*.json \
  --server https://garage-saathi-sync.onrender.com \
  --user u-owner --pin 1111 \
  --import-token "$IMPORT_TOKEN" --dry-run
```

Check the per-store counts against step 1, then run it again without `--dry-run`.

It restores through `/admin/import`, not `/push`, on purpose: `push()` stamps
`_by`/`_byRole` from the caller's token, so a normal replay would re-attribute
every record to whoever ran the restore and destroy the actor trail the Pilferage
Radar reads. `/admin/import` writes the provenance already in the backup.

Expect `applied = total, rejected = 0`.

## 5. Change the owner PIN

Log in as owner and set a real PIN (**Me → Change my PIN**). Do this before step 7
— the purge keeps any account whose PIN has been changed and removes the ones still
on their published defaults. Change it first and you keep your account; skip it and
the owner login is removed with the rest.

## 6. Garage setup — on the owner device

- **Capture the garage location.** Standing at the garage, *Garage setup → "Use my
  current location"*. Until this is done `locSet` is false and every attendance
  distance is measured from a placeholder point in central Jaipur.
- **Labour rate** — still the ₹250 default; drives every cost and bill figure.
- **Business name**, **late cutoff**.

## 7. Close the published-PIN hole

On Render set:

| Variable | Value |
|---|---|
| `ENABLE_DEMO_SEED` | `0` |
| `IMPORT_TOKEN` | delete — the restore is done |

Redeploy. On boot the server removes every demo account still using its published
PIN and logs which. Verify all of these return **401**:

```bash
for u in u-owner:1111 u-sup:2222 u-store:3333 u-m1:0001 u-m2:0002 u-m3:0003 u-d1:0010; do
  printf "%-9s " "${u%%:*}"
  curl -s -o /dev/null -w "%{http_code}\n" -X POST https://garage-saathi-sync.onrender.com/auth/login \
    -H 'Content-Type: application/json' -d "{\"userId\":\"${u%%:*}\",\"pin\":\"${u##*:}\"}"
done
```

Any `200` here means anyone who has read this public repo can log into your garage.

## 8. Verify before handing out phones

```bash
bash scripts/predeploy-gate.sh     # 14 checks, ~60s
```

Then log in on a real device as each role and confirm the fleet, jobs and parts
match. Every staff member needs **one online login on their own phone** before
offline mode works there.

---

## Still open after this

- **`VAPID_PRIVATE_KEY` is unset** → `vapidReady: false`, no push notifications.
  Document-expiry alerts appear in-app only.
- **Crew PIN is uniform `0000`** for all 165 drivers and conductors
  (`_pin4`, `register_roster`). Anyone who knows a name can sign in as them.
  They are the lowest-privilege roles, and route scoping was tightened on
  2026-08-18, but it is worth a policy decision.
- **`S.cache` is unscoped on crew devices** — the full fleet, roster and ledger sit
  in every driver's IndexedDB regardless of what the UI shows. Route gating is a UI
  boundary, not a data boundary.
- **Trip-cash flow is English-only in Hindi mode** — the driver's money screen.
- **Check-in fails silently without a camera** — no sheet, no toast, no error.
- **Firebase** — Functions need the Blaze plan, so PIN auth, GPS ingest, challans
  and the WhatsApp webhook cannot move there on Spark.

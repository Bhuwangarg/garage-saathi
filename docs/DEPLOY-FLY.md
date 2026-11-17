# Moving the server to Fly.io, Mumbai

Status: **prepared, not deployed.** `Dockerfile`, `.dockerignore` and `fly.toml`
are written and `fly config validate` passes. Nothing has been deployed and no
production setting has been changed. Production redeploys are the owner's call,
so every command below is one for the owner to run, in order.

## Why

| | Vercel today | A long-lived process |
|---|---|---|
| Cold start | ~10s typical, 30-36s worst, ~1 request in 25 | once, at boot |
| Manager login at 6.40am | that cold start **is** the login — owner, supervisor and crew manager cache no PIN | instant |
| Warming | three layers: Vercel cron every 2 min, GitHub Action every 10 min, a client ping when the PIN pad opens | none needed |
| WhatsApp webhook | processes on a daemon thread after the 200; `04 §3.7` records it as **UNDETERMINED** whether that survives | works, because the process does |
| `LIVE_GPS` | re-reads the whole `gpslive` table per request; containers are stateless | a real in-memory cache |
| `bootstrap()` | a flag checked on every request | runs once at startup |

**What it does not fix.** The 50-90s first sync was never cold-start — it was
~162,000 serialised IndexedDB transactions on the phone. That is client-side and
already largely fixed: `DEPLOY.md` records 135 pages collapsed to 19 requests and
the full first-sync drain going 2,359ms to 536ms. What is outstanding there is
proof on real Windows 7 and old-Android hardware, not server work.

**What it costs.** You start owning uptime. Vercel gives restarts, TLS, a CDN and
DDoS absorption for free. Here, a crash stays crashed until Fly restarts it, and
a deploy on a single machine with a volume is a stop-and-start — a few seconds
of downtime, not an atomic swap. `health.yml` already fails when `/health` is not
200; make sure its failure actually reaches a human.

## Step 0 — the domain, in two phases

**Production is the raw `https://garage-saathi-sync.vercel.app`. There is no
custom domain, and that is the one expensive thing about this move.**

`sync.js`'s `baseUrl()` falls through to `location.origin` for the hosted app, so
whatever origin serves the page is the API. That is what makes the migration
nearly client-free — and it also means **changing host changes origin**, and a
browser binds IndexedDB, localStorage and the service worker to an origin.
Moving ~100 staff from `*.vercel.app` straight to `*.fly.dev` gives every one of
them a brand-new empty device: re-login and a full first sync, on the old phones
this is slowest on.

A domain in front costs that once and never again. Decided: do it.

**Use a subdomain, not the apex** — `app.example.com`, not `example.com`. A
subdomain is a single CNAME on both platforms. An apex needs an A record on
Vercel and A+AAAA plus an allocated IP on Fly, and an apex CNAME is invalid
unless the provider supports flattening. The subdomain also leaves the apex free
for anything else the business wants later.

### Phase A — the domain points at Vercel

Nothing about the server changes. The only goal is to get staff onto the final
origin while the thing behind it is the server they already use.

```bash
vercel domains add app.example.com garage-saathi-sync
```

Then, at the registrar, add the CNAME that Vercel's **Settings > Domains** page
shows for this project.

> **Read that value off the page; do not copy one from anywhere else, including
> older runbooks.** Vercel's per-project CNAME target is now unique per project
> and looks like `d1d4fc829fe7bc7c.vercel-dns-017.com` — the generic
> `cname.vercel-dns.com` of older documentation is not it.

**Set the record's TTL to 60 seconds now, not at flip time.** TTL is itself
cached, so a 3600s TTL means the flip in Phase B takes up to an hour to reach
everyone and a rollback takes just as long. Lowering it a day ahead makes both
instant.

Then:

```bash
fly secrets set ALLOWED_ORIGIN=https://app.example.com --app garage-saathi
```

and set the same value on the Vercel project, which also closes the
`ALLOWED_ORIGIN` item that has been open on `DEPLOY.md`'s checklist. Tell staff
the new address and let them re-add it to their home screens. **This is the one
re-onboard.** Wait until it has settled before Phase B.

**Point the native apps at the domain in this phase too.** The packaged
iOS/Android build serves itself from `capacitor://localhost`, so it has no useful
origin and is the one client that reads `PROD_SYNC` instead of
`location.origin`. Change it in **both** places — `sync.js:93` and
`v2/sync.js:100` — from `https://garage-saathi-sync.vercel.app` to
`https://app.example.com`, then rebuild via the `android-build.yml` and
`ios-build.yml` workflows.

Doing it here rather than at cutover is the whole trick: once `PROD_SYNC` is the
domain, **Phase B needs no client change of any kind** and the native apps follow
the DNS like everything else. Leave it until later and every phone needs a store
update on the day you flip.

### Phase B — the same domain points at Fly

Do steps 1 to 4 below first, so a tested server is waiting.

**Get the certificate issued before any traffic moves.** Fly will not serve
HTTPS on a domain it has no certificate for, and if the CNAME moves first there
is a window where every staff member gets a browser security error. Fly can
validate ownership without traffic:

```bash
fly certs add app.example.com --app garage-saathi
fly certs setup app.example.com --app garage-saathi
```

That prints what Fly needs. Add the `_acme-challenge` CNAME or the
`_fly-ownership` TXT record it names — **while the main CNAME still points at
Vercel** — and wait for:

```bash
fly certs check app.example.com --app garage-saathi
```

to report the certificate issued. Only then change the main CNAME from Vercel's
target to `garage-saathi.fly.dev`.

At 60s TTL the switch lands in about a minute. **No device notices**: same
origin, same database, same data. Rollback is pointing the CNAME back.

Afterwards, remove the domain from the Vercel project so the two cannot both
claim it — but not before the Fly server has held production for a while, since
`vercel.json` and `api/index.py` are the rollback.

## Step 1 — create the app and the volume

```bash
fly apps create garage-saathi
```

```bash
fly volumes create garage_data --region bom --size 3 --app garage-saathi
```

3GB is generous: photos live in R2 and `/data/uploads` is only the fallback for
an R2 outage. The volume exists so that fallback is not written to a disk that
vanishes at the next restart.

## Step 2 — secrets

Set every one of these. They are the same names the Vercel project uses; copy the
values from Vercel's dashboard. **Do not put any of them in a file in this repo.**

```bash
fly secrets set --app garage-saathi \
  DATABASE_URL=... \
  R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... R2_BUCKET=... R2_PUBLIC_URL=... \
  ANTHROPIC_API_KEY=... \
  VAPID_PRIVATE_KEY=... VAPID_SUBJECT=... \
  GPS_INGEST_TOKEN=... REDPRO_INGEST_TOKEN=... \
  ECHALLAN_API_KEY=... \
  ITS_LOOKUP_USER=... ITS_LOOKUP_PASSWORD=... ITS_BRANCH_CODE=... \
  WA_TOKEN=... WA_PHONE_ID=... WA_VERIFY_TOKEN=... WA_APP_SECRET=... \
  AI_MODEL=... \
  ALLOWED_ORIGIN=...
```

Three that are easy to get wrong:

- **`ALLOWED_ORIGIN`** — the origin the PWA is served from. Leave it unset and
  CORS is `*`, which `DEPLOY.md` has had as an open checklist item. Once the app
  is same-origin on Fly there is no CORS surface for the browser, but the
  packaged iOS/Android apps have no useful origin and do rely on it.
- **`ENABLE_DEMO_SEED`** — leave it UNSET in production. Set to 1 it seeds staff
  accounts whose PINs are published in this repo. `sync_server.py`'s `__main__`
  prints a line at boot saying which way it went; read it.
- **`AI_MODEL`** — `DECISIONS.md §25.7` narrows the 18 Oct Opus decision for the
  WhatsApp surface. Until routing is split per call site, this one variable sets
  the model for every AI call.

Anything listed in `.dockerignore` as a local secret file is deliberately absent
from the image. Secrets reach the server through `fly secrets`, never a layer.

## Step 3 — deploy, without sending anyone to it

```bash
fly deploy --app garage-saathi
```

The image has never been built in CI or locally — Docker was not running on the
machine that prepared this — so **expect the first build to be the first real
test of it.** If it fails it will be on `libsql-experimental`, a Rust extension
that is dormant (imported only when `TURSO_URL` is set; production uses Postgres).
The fix is to drop that line from `requirements.txt`, not to add a Rust toolchain.

Then check it is actually healthy, not merely listening:

```bash
curl -s https://garage-saathi.fly.dev/health | python3 -m json.tool
```

`commit` should be the deployed SHA, `dbMode` `"postgres"`, `dbOk` `true`,
`persistent` `true`, `photos` `"r2"`. **A green Fly health check does not mean
this is true** — `/health` answers 200 even when Postgres is unreachable, which is
why `health.yml` checks the body and Fly cannot.

## Step 4 — test it from a real device, before cutover

Both servers talk to the same Supabase, so they can run side by side with no risk
of split-brain. `sync.js` reads a `syncUrl` override from localStorage before
anything else, so one device can be pointed at Fly while everyone else carries on:

```js
localStorage.setItem('syncUrl', 'https://garage-saathi.fly.dev'); location.reload()
```

Undo with `localStorage.removeItem('syncUrl')`. There is also a UI for it —
`sync.js:1176` and `v2/sync.js:1367` write the same key.

Worth exercising specifically, because these are the things serverless changed:
login as owner (the no-cached-PIN path), a photo upload, `/gps/ingest`, and a
restart (`fly machine restart`) to confirm `_record_boot` shows storage survived.

## Step 5 — cutover

**Phase B of step 0 is the cutover**: certificate first, then move the CNAME.
Nothing is repeated here, because a runbook with two descriptions of the same
step is a runbook where one of them is out of date.

The only thing to add: **leave the Vercel deployment running afterwards.** Old
service workers keep serving old copies of the app to devices that have not
reloaded, and those copies still resolve the same domain — but if anyone has a
stale bookmark to `garage-saathi-sync.vercel.app`, that host answering keeps them
working rather than stranding them. Both hosts read and write the same Supabase,
so there is no split-brain to fear; the worst case is a user on an older build.

## Step 6 — afterwards

- `.github/workflows/health.yml:31` and `ai-jobs.yml:34` hardcode the Vercel URL.
  Both must point at the new address or the alarm watches a server nobody uses.
- Delete the warming layers, which exist only for cold starts: the `crons` block
  in `vercel.json`, and `Sync.warmUp()`'s ping at the PIN pad.
- The GitHub Actions crons can move in-process now that there is a process, but
  they work as they are. Not urgent, and moving them loses the audit trail of a
  CI run.
- `vercel.json` and `api/index.py` stay until the Fly server has held production
  for a sensible stretch. They are the rollback.

## Rollback

Point the CNAME back at Vercel's target. At 60s TTL that is about a minute.

The database is untouched: both hosts were always reading and writing the same
Supabase, which is what makes this reversible at all. Nothing needs to be
restored, no data needs to be reconciled, and no client needs to be rebuilt —
`PROD_SYNC` and `ALLOWED_ORIGIN` both name the domain, not the host behind it.

Keep `vercel.json` and `api/index.py` in the repo until the Fly server has held
production for a sensible stretch. They are not dead code; they are the rollback.

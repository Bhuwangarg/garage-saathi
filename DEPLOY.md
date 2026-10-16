# Deploying Garage Saathi

**One `git push` to `main` ships everything.** Vercel serves the PWA *and* the
Python sync server from a single origin — <https://garage-saathi-sync.vercel.app> —
and deploys automatically on push. There is no manual step, no separate frontend
deploy, and no ordering problem between client and server.

- `vercel.json` + `api/index.py` wrap `sync_server.py` as one Vercel function.
  `includeFiles` lists the static assets (`index.html`, `app.js`, `styles.css`,
  `icons/**`, …) so the function serves them too — Vercel detects no framework
  here and would otherwise ship no static output at all.
- The durable store is **Supabase Postgres** (`DATABASE_URL`), photos are on
  **Cloudflare R2**. Neither lives in the repo; both are environment variables in
  the Vercel project.
- The app talks to `location.origin`, so there is no CORS surface for the hosted
  PWA (commit `4d23aea`). `PROD_SYNC` in `sync.js` covers only the packaged
  iOS/Android app, which has no origin of its own.

Verify after pushing:

```bash
curl -s https://garage-saathi-sync.vercel.app/health | python3 -m json.tool
```

`commit` should be the SHA you just pushed, `dbMode` `postgres`, `persistent`
`true`. The live `app.js` should match `git show HEAD:app.js`.

> **The GitHub Pages copy is retired.** Served from `bhuwangarg.github.io` the app
> looks for an API on that host, which does not exist. Vercel is the URL to
> install from.

---

## Local development
One server: `sync_server.py` serves the app and the sync API from the same port.

```bash
export GPS_INGEST_TOKEN="$(cat .gps_ingest_token)"
ENABLE_DEMO_SEED=1 python3 sync_server.py    # open http://localhost:8766
```

Do not serve the repository with `python3 -m http.server`: it publishes every file
in the folder, including `sync.db`, keys and any backup, to anyone on the network.
`sync_server.py` serves only app files. On `localhost` the app targets `:8766` of
its own host automatically. To expose a
local server to an outside integrator for an hour, `cloudflared tunnel --url
http://localhost:8766` prints a temporary HTTPS URL — it changes each run and dies
with the process, so it is a test tool, never production.

---

## Production hardening checklist (before real staff/vendor use)
Done:
- [x] **Rate limiting on the sync endpoints** — `/pull`, `/push` and `/upload` are capped
      **per user**, never per IP: the yard shares one wifi, and an IP cap would stop every
      conductor because one phone was stuck. Defaults are `RL_SYNC_PER_MIN=120` (a working
      device makes about 15) and `RL_UPLOAD_PER_HOUR=240`. Over the line the server answers
      `429` with `Retry-After`, and the client stands down for exactly that long instead of
      asking again in four seconds. **It fails open**: if the counter table cannot be read
      the request goes through and the reason is logged — a limiter that refuses work
      because of its own hiccup is a worse outage than the bill it caps.
      `RATE_LIMIT_OFF=1` turns it off with no redeploy.
- [x] **Retries back off** — a failed sync doubles its wait (4s → 8 → 16 …, capped at five
      minutes) with ±20% jitter so ninety phones do not return in step. One good tick clears it.
- [x] **Push size ceiling** — `MAX_PUSH_MB` (default 6) refused before the body is read,
      alongside the existing `MAX_PUSH_RECORDS` (1000). A thousand rows of text and a
      thousand rows carrying inline photos are very different requests.
- [x] **Wire protocol is versioned** — `PROTOCOL_VERSION`, with `/v1/<path>` accepted as an
      alias for every endpoint today. Phones update lazily, so a breaking change must arrive
      as `/v2` while `/v1` keeps answering old builds; an unknown version 404s rather than
      being quietly served the current shape.
- [x] **Schema version recorded** — `SCHEMA_VERSION` is written to `sys` at boot and logged
      when it moves. Bump it whenever the shape changes.
- [x] **Feature flags** — off unless named in `FEATURE_FLAGS` (comma-separated, set in
      Vercel, no redeploy to flip one). The list rides along on `/pull`; the client reads it
      with `Sync.flagOn('name')`, which is false for anything the server did not name.
- [x] **Login brute-force lockout** — `/auth/login` locks a user after 5 failed PINs / 15 min,
      with a generous per-IP backstop (50) so a shared garage IP isn't locked by one person.
      Tune via `MAX_LOGIN_FAILS`, `MAX_IP_FAILS`, `LOGIN_LOCK_SEC`.
- [x] **PINs never sync** — stored only as salted SHA-256 hashes server-side; the synced
      roster carries name/role only. The server validates online; devices cache only PINs
      that have signed in there.
- [x] **Session expiry** — tokens expire after `SESSION_TTL_SEC` (default 12h).
- [x] **CORS is configurable** — set `ALLOWED_ORIGIN` to your app's domain (default `*`).
- [x] **Durable database** — Supabase Postgres via `DATABASE_URL`
      (`aws-0-ap-south-1.pooler.supabase.com`); `/health` reports `dbMode: postgres`,
      `persistent: true`. The server refuses to start if `DATABASE_URL` is set but
      Postgres is unreachable, rather than quietly serving an empty database.
- [x] **Photos in object storage** — Cloudflare R2 (`R2_*` env vars); `/health` reports
      `photos: r2`, `photosPersistent: true`. No photo depends on the function's disk.

Still to do:
- [ ] **Rotate** `GPS_INGEST_TOKEN`; never commit it (already in `.gitignore`).
- [ ] Set `ALLOWED_ORIGIN` to the real app domain once deployed (don't leave `*`).
- [ ] Add token **refresh** (so 12h expiry doesn't interrupt a working shift).
- [ ] Optional: IP-allowlist AirFi's egress on `/gps/ingest`.
- [ ] Consider 6-digit PINs for higher-privilege (owner/supervisor) accounts.

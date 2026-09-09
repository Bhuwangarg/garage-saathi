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
Two small servers: one serves the app, one is the local "cloud" for sync.

```bash
export GPS_INGEST_TOKEN="$(cat .gps_ingest_token)"
python3 -m http.server 8765        # the app  (terminal 1)
python3 sync_server.py             # sync/cloud (terminal 2)
```

On `localhost` the app targets `:8766` of its own host automatically. To expose a
local server to an outside integrator for an hour, `cloudflared tunnel --url
http://localhost:8766` prints a temporary HTTPS URL — it changes each run and dies
with the process, so it is a test tool, never production.

---

## Production hardening checklist (before real staff/vendor use)
Done:
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

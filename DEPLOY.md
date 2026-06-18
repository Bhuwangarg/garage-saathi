# Deploying Garage Saathi

Two pieces ship separately:
- **Backend** (`sync_server.py`) — sync + auth + photo storage + GPS ingest. Needs a host that runs Python and gives an HTTPS URL.
- **App** (the PWA: `index.html`, `app.js`, …) — static files. Any static host (Netlify, Vercel, Cloudflare Pages).

---

## A. Right now (interim) — public URL via tunnel
For letting AirFi test immediately, a Cloudflare quick-tunnel exposes the local server:

```bash
export GPS_INGEST_TOKEN="$(cat .gps_ingest_token)"
python3 sync_server.py &                       # terminal stays open
cloudflared tunnel --url http://localhost:8766 # prints https://xxxx.trycloudflare.com
```

⚠️ **This URL is temporary**: it changes each run and stops when your laptop sleeps or the
process ends. Good for a first integration test — **not** for production.

---

## B. Permanent backend — Render.com (recommended, free tier)
The repo already contains `Dockerfile` + `render.yaml`.

1. Push this folder to a **GitHub** repo.
2. Go to **render.com → New → Blueprint** and pick the repo. Render reads `render.yaml`,
   builds the `Dockerfile`, attaches a 1 GB disk at `/data` (SQLite + photos persist).
3. In the service's **Environment**, set `GPS_INGEST_TOKEN` to the value in
   `.gps_ingest_token` (a strong random token — keep it secret).
4. Deploy → you get a stable URL like `https://garage-saathi-sync.onrender.com`.

That stable URL is what goes to AirFi. (Fly.io or Railway work the same way from the
`Dockerfile`; Render is the least-clicks path.)

## C. App (PWA) — Netlify / Vercel / Cloudflare Pages
1. Deploy the folder as a static site (drag-and-drop on Netlify works).
2. The app auto-targets the backend at `:8766` of its own host; for production set the
   backend URL once in the app under **Me → Sync → Server URL** (e.g. your Render URL),
   on each device. HTTPS here also unlocks phone **camera + GPS**.

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

Still to do:
- [ ] **Rotate** `GPS_INGEST_TOKEN`; never commit it (already in `.gitignore`).
- [ ] Set `ALLOWED_ORIGIN` to the real app domain once deployed (don't leave `*`).
- [ ] Move photos from local disk to **object storage** (S3 / Supabase Storage / R2).
- [ ] Add token **refresh** (so 12h expiry doesn't interrupt a working shift).
- [ ] Optional: IP-allowlist AirFi's egress on `/gps/ingest`.
- [ ] Consider 6-digit PINs for higher-privilege (owner/supervisor) accounts.
```
```

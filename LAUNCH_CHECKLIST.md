# Garage Saathi — Launch Checklist

What's been made **launch-appropriate in code** (no longer hardcoded), and what **you (owner) or ops must set** before going live. Items marked 🔧 are done in the app; ⚙️ are server/ops; 👤 are owner decisions.

---

## 1. Make it yours — in-app setup (owner, on the device)

Do these as the **owner** login, then hand devices to staff.

- [ ] 👤 **Garage setup → Business name + Garage full name.** No longer hardcoded to "Mahalaxmi Travels" — the app now shows whatever you set here (greetings, login, bills, AI advisor). *(Me → Garage setup)*
- [ ] 👤 **Capture the garage GPS location.** **Critical** — attendance distance/"too far" is meaningless until you tap *"Use my current location as the garage"* **standing at the garage**. Set the geofence radius (default 200 m).
- [ ] 👤 **Late cutoff time** (default 09:30) — set your real shift start.
- [ ] 👤 **Labour rate (₹/hr)** — no longer hardcoded to ₹250; set your real rate. Drives every cost/bill figure.
- [ ] 👤 **Start fresh (clear demo data).** *(Me → Garage setup → 🗑 Start fresh)* — wipes the demo buses/parts/drivers/jobs/bills and turns **demo mode off** (which also hides the demo-PIN hint on the login screen). Do this before real data entry.
- [ ] 👤 **Change the owner PIN** from the demo default `1111`. *(Me → Change my PIN)*
- [ ] 👤 **Add real staff & drivers** with their own 4-digit PINs *(Me → Staff / Drivers)*, then **real buses → documents (insurance/fitness/PUC/permit + expiry) → parts/opening stock**.

> Each staff member must **sign in online once on each device** so their PIN caches there for offline use.

---

## 2. Hosting & data (ops) — required for a real deployment

- [ ] ⚙️ **Serve over HTTPS.** Phone **camera (selfies, job photos) and GPS only work on `https`** (or `localhost`). The bundled `python3 -m http.server` + `sync_server.py` are **dev servers** — host on a real platform (`render.yaml`/`Dockerfile` are included; or Netlify/Vercel for the static app + a hosted sync service).
- [ ] ⚙️ **Persistent storage for `sync.db` and `uploads/`.** On free tiers the disk is **ephemeral → data loss on restart/redeploy**. Attach a persistent disk, or move to managed Postgres + object storage (the sync protocol is two endpoints — see `DEPLOY.md`/`README.md`; Supabase is a drop-in).
- [ ] ⚙️ **Backups** of `sync.db` (the shared source of truth).
- [ ] ⚙️ **Set a strong `GPS_INGEST_TOKEN`** (in `.gps_ingest_token`, already git-ignored) if you ingest real GPS; rotate it.

---

## 3. Integrations (owner decision)

- [ ] 👤 **Live GPS provider.** `GpsProvider` in `app.js` is **"Simulated (demo)"** (served by `sync_server.py`). To use your real tracker: point `GpsProvider.live()` at the provider URL, add its auth header, and map the response fields (one line — see `GPS_API.md`). Until then, "Live GPS" shows demo telemetry.
- [ ] 👤 **AI Insights advisor (optional).** The "Ask the advisor" box calls the Anthropic API **directly from the browser** with a key pasted per-device (`anthropic-dangerous-direct-browser-access`). For production this **exposes the key on the device and bypasses cost control** — either (a) leave it disabled (no key = the rest of Insights still works fully offline), or (b) **proxy the call through your server** so the key stays server-side. The local pilferage/cost/predictive insights need **no key and no internet**.

---

## 4. Security posture (verify before launch)

- [x] 🔧 Demo PINs (`1111/2222/3333…`) and the on-login PIN cheat-sheet **only appear in demo mode** — "Start fresh" turns demo mode off.
- [x] 🔧 **Logout clears that device's cached PIN**; **offline PIN entry is rate-limited** (5 tries → 60 s) against a stolen-phone brute force.
- [x] 🔧 **Only the owner can create supervisors**; PIN change/reset is server-authoritative (`/auth/setpin`, self or owner-only).
- [x] 🔧 `sync.db`, `uploads/`, `.gps_ingest_token`, `.public_url` are **git-ignored** (no secrets in the repo).
- [ ] 👤 Decide a **PIN policy** (PINs are 4 digits; consider banning `0000/1234` and periodic rotation).

---

## 5. Server environment variables (set on your host before launch)

| Var | Purpose | Launch value |
|---|---|---|
| `ALLOWED_ORIGIN` | CORS — which domain may call the API | your PWA URL, e.g. `https://garage.example.com` (server warns if left `*`) |
| `ENABLE_DEMO_SEED` | seed demo staff accounts | `0` for a real garage (then create the owner via your bootstrap) |
| `GPS_INGEST_TOKEN` | auth for real GPS provider push | a long random secret; `/gps/ingest` is **disabled** until set (demo/placeholder values are rejected) |
| `ANTHROPIC_API_KEY` | enables the **server-side `/ai` proxy** so the AI advisor key never ships to devices | your key (optional; advisor stays off if unset) |
| `MAX_UPLOAD_MB` | photo upload size cap (DoS guard) | default `8` |
| `SESSION_TTL_SEC` | login token lifetime | default 12 h |
| `DB_PATH` / `UPLOADS_DIR` | point at the **persistent disk** | e.g. `/data/sync.db`, `/data/uploads` |

> Still recommended (not yet automated): persist `SESSIONS` across restarts (currently in-memory → everyone re-logs in after a redeploy), move off the stdlib dev HTTP server for high load, and add `garage_id` tenancy if one server serves multiple garages.

## 6. Already launch-ready (no action needed)

Offline-first operation + multi-device sync (with offline photo re-upload, poison-record quarantine, syncing deletes) · role-based access & per-role navigation · Hindi/English with a pre-login toggle · installable PWA · anti-pilferage stock ledger (parts only leave against a job) · proof-photo gates on job close/verify.

---

### Code changes shipped for launch this round
- Business name → configurable (`garage.biz`, Garage setup) instead of hardcoded.
- Labour rate → configurable (`garage.labourRate`, Garage setup) instead of hardcoded ₹250.
- Demo garage seed carries `biz` + `labourRate`; "Start fresh" seeds a clean configurable garage.
- **Demo mode auto-OFF on public domains** (demo PINs + login cheat-sheet only show on localhost/LAN).
- **AI advisor now uses a server-side `/ai` proxy** (`ANTHROPIC_API_KEY`); the per-device direct-browser key is only a dev/demo fallback.
- **GPS ingest hardened** — no insecure default token; `/gps/ingest` disabled until a real `GPS_INGEST_TOKEN` is set. GPS screen shows a clear "Demo GPS — simulated" banner until a real provider is wired.
- **Server hardening** — demo-seed env gate, `/upload` size cap (`MAX_UPLOAD_MB`), CORS-wildcard startup warning.
- **Bug fixes**: cost-per-km math corrected (was producing nonsense ₹/km → wrong money-pit flag); concurrent-edit conflict notification now actually surfaces to the user (was silently dropped); HTTPS warning on plain-http public hosts.
- Service-worker cache → **v23**. (`FEATURES.md` has the full 190-feature inventory + QA status.)

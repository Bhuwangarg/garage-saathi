# Garage Saathi — Bus Garage Maintenance App (MVP)

A mobile-first, **offline-first** app for managing bus maintenance in your Jaipur garage.
Built as an installable PWA — runs on any phone or tablet, no app store, no internet needed
after first load. Data is stored on the device (IndexedDB).

## What this MVP does (mapped to your problems)

| Your problem | What the app does |
|---|---|
| Everything on paper, can't track | Every repair is a **digital job card** tied to a bus |
| No photos of work done | Job **cannot be closed without before + after photos** |
| Parts pilferage | Parts can **only be issued against a job card**; every movement logged in a stock ledger |
| Staff late / no attendance | **Selfie + GPS geofenced** check-in, auto-flags "late" |
| High cost, no visibility | Dashboard: cost per bus, **cost per company** (to bill owners), 30-day spend |
| Outside repairs | Logged on the job card with vendor + amount |
| Inventory bills | Supplier bills with photo + pending-payment total |
| Bus records | Bus profile, service history, **document expiry alerts** (insurance/fitness/PUC/permit) |
| GPS via API | "Live GPS" slot on each bus, ready for your provider's API (Phase 3) |

Also: **Hindi/English toggle**, role-based access (Owner / Supervisor / Store / Mechanic).

## Run it

Two small servers: one serves the app, one is the shared "cloud" for sync.
Both use Python, already on your Mac.

```bash
cd garage-saathi
python3 -m http.server 8765        # the app  (terminal 1)
python3 sync_server.py             # sync/cloud (terminal 2)
```

- **On this computer:** open <http://localhost:8765>
- **On your phone** (same WiFi): open `http://192.168.29.219:8765`
  - In Chrome/Safari → menu → **Add to Home Screen** to install it like a real app.
  - For sync on the phone: open **Me → Sync** and set the server URL to
    `http://192.168.29.219:8766`.
  - Note: phone camera/GPS need `https`. For full phone testing, host it (Netlify/Vercel
    free tier) or use a tunnel like `cloudflared`. On `localhost` (the computer) everything works.

## Development & tests

**One-time setup after cloning** — enable the pre-deploy gate:

```bash
git config core.hooksPath .githooks
```

This turns on a `pre-push` hook that runs an automated smoke + regression suite
before any push to **`main`** (the GitHub Pages deploy branch) and **blocks the
push if a deploy-critical flow breaks**. It's git-local config, so every fresh
clone must run that line once.

- **What it checks** (`scripts/predeploy-gate.sh`, ~60s, no network/LLM): all five
  roles log in; the stock-count flow works (tapping a count field must not navigate
  away, and a Full count must persist + close its sheet); form controls never trigger
  navigation. Requires the [gstack](https://garryslist.org) `browse` binary; if it's
  absent the gate warns and allows the push.
- **Run it manually:** `bash scripts/predeploy-gate.sh`
- **Bypass once** (e.g. hotfix): `git push --no-verify`
- **Deeper, exploratory QA:** the `/g-saathi` Claude Code skill drives every role
  through its screens and write flows and hunts for new bug classes. Run it
  periodically; promote anything it finds into the gate above.

## See sync working (Phase 2)
Each device keeps its own offline copy and reconciles through the sync server.
The top bar shows **● Synced / ◐ Sync… / ○ Offline**.

1. Make sure `sync_server.py` is running.
2. Open the app in **two different browsers** (e.g. Chrome **and** Safari, or a normal
   **and** an incognito window — they need separate local storage to act as two devices).
3. In one, create a job / issue a part / check in. Within a few seconds it appears in the other.
4. Stop `sync_server.py` → the chip goes **Offline**, the app keeps working, and changes
   **queue**. Start it again → everything catches up automatically.

> This Python server demonstrates the architecture locally. For real production, point
> `sync.js` at **Supabase** (free Postgres + realtime + auth + file storage) or a small
> hosted Node service — it speaks the same endpoints, so the app code doesn't change.

## Accounts & security (real auth)
- Users live **on the server** with salted, SHA-256 **hashed PINs**. Login (`/auth/login`)
  returns a **token**; `/push`, `/pull` and `/upload` reject any request without a valid one
  (401). Wrong PIN → 401.
- **Offline-first login still works:** the matching user record (with PIN) syncs to the
  device, so staff can sign in with no network; the app authenticates with the server in the
  background when it's reachable to get a sync token.
- **Add staff on the server:** Owner/Supervisor → **Me → Staff → Add staff** creates the
  account server-side (role-gated — a mechanic attempting it gets 403). The new account
  syncs to every device and can log in immediately.

## Photos → object storage
- Captured photos (job before/after, attendance selfies, supplier bills) are **uploaded to
  the server** (`/upload`) and stored as files under `uploads/`. Only the **URL** is kept in
  the record, so sync payloads stay tiny.
- **Offline fallback:** if the upload can't reach the server, the photo is kept inline so the
  job can still be completed; (production hardening: re-upload from a queue when back online).

## Demo logins (PINs)

| User | Role | PIN |
|---|---|---|
| Bhuwan | Owner | `1111` |
| Ramesh | Supervisor | `2222` |
| Suresh | Store | `3333` |
| Mukesh | Mechanic | `0001` |

Seed data (3 buses, 7 parts, 3 job cards, attendance, a supplier bill) loads on first run so
you can click through everything immediately.

## Try this flow (2 minutes)
1. Log in as **Mechanic (0001)** → tap a job → add a **before** and **after** photo → **Mark Done**
   (try without photos — it blocks you).
2. Log in as **Store (3333)** → **Issue Part** → notice you must pick a job card.
3. Log in as **Supervisor (2222)** → open the "done" job → **Verify**.
4. Log in as **Owner (1111)** → Home shows cost dashboard + document alerts.
5. Anyone → **Me** tab → **Check In** (grants selfie + location).

## Phase 3 — GPS, preventive maintenance & AI

**Live GPS** (Bus detail → *Live GPS & service*): location on a map, speed, ignition,
last ping, and a **live odometer**. The demo tracker is served by `sync_server.py`
(`/gps`); `GpsProvider` in `app.js` is a one-function adapter — point it at your real
provider and map the response fields, nothing else changes.

**Preventive maintenance:** every bus has a service interval (default 10,000 km). The live
odometer drives a **service-due** status shown on the dashboard ("Service due"), on each bus,
and on the GPS screen — **OVERDUE / DUE SOON / OK**. *Mark service done* resets the counter and
writes a service record into the bus history. Servicing on time is the single biggest lever on
your maintenance cost (planned service ≪ breakdown).

**AI Insights** (dashboard → *AI Insights*): runs **on the device** (no data leaves the
garage) and surfaces what paper hides:
- **Pilferage radar** — parts billed with no 'after' photo; parts issued on jobs left open.
- **Cost** — money-pit buses (₹/km outliers); reorder-ahead to avoid emergency buys.
- **Predictive** — services about to slip; documents expiring; jobs aging in the bay.
- **Ask the advisor** — optional natural-language Q&A powered by **Claude (Haiku)**. Add your
  Anthropic API key in **Me → Sync** (stored only on your device) to enable it; the garage
  snapshot is sent as grounding context.

## What's NOT in this MVP (next phases)
- **Phase 2 (done — dev version):** cross-device sync, **server-side accounts with hashed
  PINs + login tokens + protected endpoints**, **staff management**, and **photo object
  storage** — all via `sync_server.py`. Still to harden for production: move onto a hosted
  backend (Supabase/Node), token expiry/refresh, re-upload queue for offline photos,
  WhatsApp alerts for expiring documents, payroll export from attendance.
- **Phase 3:** live GPS provider API integration, preventive-maintenance auto-scheduling from
  odometer, PDF reports per company.

## Architecture notes (for whoever builds Phase 2)
- `db.js` — IndexedDB wrapper. Every record has `updatedAt` so a sync layer can merge devices.
- `app.js` — all screens + business rules. Anti-pilferage rule lives in `issuePart()`.
- `sw.js` — service worker (offline shell cache).
- No build step, no dependencies. To move to a server backend, replace the `DB` object in
  `db.js` with API calls — the screens don't change.

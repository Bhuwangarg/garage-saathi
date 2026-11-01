# Garage Saathi — GPS Integration API

For: **AirFi** (GPS tracker provider) · App: **Mahalaxmi Travels** bus maintenance system

This document defines the API for feeding live tracker telemetry (location, speed,
ignition, odometer) into the Garage Saathi app for ~80 buses. Two integration modes are
supported — **Push (recommended)** and **Pull**. The app maps every vehicle by its
**registration number** (e.g. `RJ14 PA 1023`), so please send that with each event.

```
Base URL : https://garage-saathi-sync.vercel.app   # live (the old onrender.com host is retired)
Format   : JSON over HTTPS (UTF-8)
```

---

## Option A — PUSH (recommended): you POST telemetry to us

Send batched telemetry as vehicles report. Real-time and efficient.

### `POST /gps/ingest`

**Headers**
```
Authorization: Bearer <GPS_INGEST_TOKEN>      # provisioned & shared securely
Content-Type: application/json
```

**Body**
```json
{
  "events": [
    {
      "deviceId":   "AIRFI-000123",            // your tracker/device id
      "vehicleReg": "RJ14 PA 1023",            // bus registration (REQUIRED for mapping)
      "lat":        26.9124,                    // decimal degrees
      "lng":        75.7873,                    // decimal degrees
      "speedKph":   42.5,                       // number, km/h
      "ignition":   true,                       // boolean
      "odometerKm": 184321,                     // number, total km (used for service-due)
      "timestamp":  "2026-06-19T08:30:00Z"      // ISO 8601 UTC
    }
  ]
}
```

**Response** `200 OK`
```json
{ "ok": true, "accepted": 1 }
```

**Notes**
- Batch up to ~500 events per call; send every **30–60 s**, or on each fix.
- Retry with backoff on `5xx`/timeout; `401` = bad/expired token.
- Either `vehicleReg` or `deviceId` must be present; `vehicleReg` is preferred (it's our key).

### `GET /gps/latest?reg=RJ14%20PA%201023`  (your self-test)
Returns the last telemetry we stored for a registration, so you can confirm a push landed.
Send the same `Authorization: Bearer <token>` header you use for ingest.
`200` with the record, `404` if none yet, or `401` without the header.

---

## Option B — PULL: we call your API

If you'd rather expose an endpoint we poll, we need **one** of these per request and the
same fields back. Tell us the URL + auth and we'll map your field names to ours.

Expected shape we can consume (per vehicle, or an array for all):
```
GET https://<your-api>/vehicles/{deviceId}/telemetry
Authorization: Bearer <key you issue us>

200 OK
{
  "lat": 26.9124, "lng": 75.7873,
  "speedKph": 42.5, "ignition": true,
  "odometerKm": 184321,
  "timestamp": "2026-06-19T08:30:00Z"
}
```
We'd poll every 30–60 s. If your field names differ (e.g. `latitude`, `speed`, `odo`),
just send a sample response and we'll map it — no change needed on your side.

---

## Field reference
| Field | Type | Required | Meaning |
|------|------|----------|---------|
| `vehicleReg` | string | yes (push) | Bus registration — our mapping key |
| `deviceId` | string | recommended | Your tracker id |
| `lat`, `lng` | number | yes | Position, decimal degrees |
| `speedKph` | number | yes | Speed in km/h |
| `ignition` | boolean | yes | Engine on/off |
| `odometerKm` | number | yes | Total odometer (drives preventive-service alerts) |
| `timestamp` | string (ISO 8601 UTC) | yes | Fix time |

## Security
- All traffic over **HTTPS**.
- Push uses a dedicated **Bearer token** (separate from app user auth); rotated on request.
- We can also IP-allowlist your egress addresses — send us the ranges.

## Read-only agent keys (for Mahalaxmi's own agents, not for AirFi)

The passenger agent (operator-agents) reads where a bus is, who is on it and what its papers say with its own key.
An agent key never signs anyone in, never appears in `/roster`, and cannot use `/pull`, `/push`, `/upload` or
`/auth/*`. What it can read is set per agent by `AGENT_SCOPES` (see **Agent endpoints** below). With no
`AGENT_SCOPES` it opens exactly two endpoints, `GET /gps/latest?reg=…` and `GET /gps/fleet`, as it always did. Each
agent request is logged as `agent:<name> <path>`.

**Mint a key** (on any computer with Python):

```bash
python3 -c "import secrets, hashlib; k = secrets.token_urlsafe(32); print(k); print(hashlib.sha256(k.encode()).hexdigest())"
```

The first line is the key; the second is its digest.

1. In Vercel (garage-saathi-sync → Settings → Environment Variables), set `AGENT_KEYS` to `operator-agents:<digest>`.
   Several agents are comma-separated: `name1:<digest1>,name2:<digest2>`. Only digests are stored here.
2. Give the key itself to operator-agents as `GS_AGENT_KEY`. It sends `Authorization: Agent <key>`.
3. To revoke a key, delete its entry from `AGENT_KEYS`. The server reads `AGENT_KEYS` on every request and never
   caches it, but Vercel gives an environment change to a deployment only through a new deployment. Redeploy after
   the change: the key stops working on the first request the new deployment serves.

## Agent endpoints (read-only, for Mahalaxmi's own agents)

Three routes under `/agent/` answer an agent key, each behind its own **scope**. `AGENT_SCOPES` lists, per agent,
the scopes it holds:

```
AGENT_SCOPES="operator-agents:gps,crew,coaching,papers"
```

| Scope | Opens |
|-------|-------|
| `gps` | `GET /gps/latest?reg=…` and `GET /gps/fleet` |
| `crew` | `GET /agent/crew` |
| `coaching` | `GET /agent/coaching?approvedSince=…` |
| `papers` | `GET /agent/bus-papers?reg=…` |

- Agents are separated by `;`, an agent's scopes by `,`, and spaces around names do not matter:
  `AGENT_SCOPES="operator-agents:gps,crew,coaching,papers;other-agent:papers"`.
- An agent that `AGENT_SCOPES` does not list, or no `AGENT_SCOPES` at all, holds `gps` only. That is exactly what a
  key could do before scopes, so nothing that worked stops working.
- A listed agent holds exactly the scopes it lists, so leaving `gps` out takes both GPS reads away from that agent
  without touching its key. The AirFi token and a signed-in user keep `/gps/*` whatever an agent holds. An unknown
  scope name is ignored.
- `AGENT_SCOPES` is read on every request, like `AGENT_KEYS`. Set on Vercel (project `garage-saathi-sync`,
  production) it reaches a deployment only through a new deployment.

Every request sends `Authorization: Agent <key>`. Only an agent key opens these routes: a signed-in user's session
or the AirFi token gets 401.

| Status | Meaning |
|--------|---------|
| `200` | The answer. |
| `401` | No valid agent key. |
| `403` | A valid key whose agent does not hold the route's scope, with body `{"error":"forbidden"}`. Any other path under `/agent/` is a 403 too, since no scope opens it. |
| `404` | `/agent/bus-papers` only: no such bus, with body exactly `{"error":"unknown bus"}`. |

Answers carry `Cache-Control: no-store`. Each request prints one log line, `[agent] agent:<name> <path>`, with the
path only, so a plate in the query string is never logged. Every answer is built field by field: a field added to a
record later is not sent until the server is changed to send it.

### `GET /agent/crew`

```json
{ "crew": [ { "id": "d1", "name": "Mohan Lal", "role": "driver", "phone": "+91 98290-12345", "busReg": "MP44ZD0471" } ] }
```

- Only crew who are working now: `status` missing or `active`. Anyone who left, was archived, is on leave, or has any
  other status is not listed.
- `role` is `conductor` or `driver`. `phone` is as the office typed it, `""` when there is none. `busReg` is the
  padded plate of the person's bus, or `null` when they have no bus (or it was deleted or has no plate).
- By name, then id.
- Never sent: alternate phone, address, birth date, blood group, licence, Aadhaar, documents, photos.

### `GET /agent/coaching?approvedSince=<ms>`

```json
{ "notes": [ { "id": "co-2026-10-19-d1", "crewId": "d1", "week": "2026-10-19",
               "hi": { "good": "…", "fix": "…", "tip": "…" }, "decidedAt": 1793600000123 } ] }
```

- Only notes a manager approved, with `decidedAt >= approvedSince`, oldest decision first, at most 200. To read on,
  ask again from the last `decidedAt` you were given: that note comes back too, and you tell it apart by `id`. A note
  the manager edits and approves again gets a new `decidedAt`, so it comes back.
- `approvedSince` missing, blank, negative or not a whole number of milliseconds (`soon`, `2000.5`) reads as 0.
- `hi` holds the three Hindi lines the crew member reads. Never sent: the facts behind a note, the English text,
  Claude's first draft, the model, who decided it.

### `GET /agent/bus-papers?reg=<reg>`

```json
{ "reg": "MP44ZD0471",
  "docs": [ { "type": "Insurance", "expiry": "2026-12-13", "status": "valid" },
            { "type": "PUC",       "expiry": "2026-11-13", "status": "expiring" },
            { "type": "Permit",    "expiry": "2026-10-14", "status": "expired" },
            { "type": "Fitness",   "expiry": null,         "status": "unknown" } ],
  "challans": { "pending": 2, "pendingFine": 700, "checkedAt": 1793600000123 } }
```

- The bus is found the way GPS finds one: case, spaces and dashes do not matter, and `MP44ZD471` and `MP44ZD0471`
  are the same plate. `reg` in the answer is the padded plate. No such bus, no plate, a blank one, or a deleted bus is
  `404` `{"error":"unknown bus"}`.
- `docs` are in the order the office keeps them. `expiry` is the date in IST, `YYYY-MM-DD`. `status` follows the
  app's 15-day rule, counted in whole days in IST: `expired` is before today, `expiring` is today up to 15 days
  away, `valid` is more. A paper that expires today is `expiring` until IST midnight. `unknown` means no expiry was
  entered, or it cannot be read, and then `expiry` is `null` (the app would show such a paper as expired).
- `challans` comes from the last saved eChallan lookup of that plate. `pending` is how many challans are pending,
  `pendingFine` what they add up to in fines, which is what is owed to the government, and `checkedAt` is when the
  lookup was made, in epoch milliseconds. The larger "payable" figure eChallan bills to settle through its own
  platform is never sent.
- `challans` is `null` when the bus was never looked up, and also when the last lookup could not reach the registry
  or cannot be read, because "nothing found" then does not mean "nothing owed". A bus that was looked up and found
  clean is `{"pending": 0, ...}`, not `null`.
- Never sent: document numbers and photos, the bus's owner, chassis and engine details, challan numbers, offences,
  places and names, and the payable figure.

## What we need from you to finalise
1. Which mode you prefer — **Push** or **Pull**.
2. A **sample telemetry payload** from one live tracker (so we confirm field mapping).
3. Your reporting **frequency** and how `odometerKm` is sourced (GPS-derived vs CAN/OBD).
4. For Pull: your endpoint URL + auth. For Push: confirm you can send the `Authorization` header.

Contact: Bhuwan — Mahalaxmi Travels.

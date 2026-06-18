# Garage Saathi — GPS Integration API

For: **AirFi** (GPS tracker provider) · App: **Mahalaxmi Travels** bus maintenance system

This document defines the API for feeding live tracker telemetry (location, speed,
ignition, odometer) into the Garage Saathi app for ~80 buses. Two integration modes are
supported — **Push (recommended)** and **Pull**. The app maps every vehicle by its
**registration number** (e.g. `RJ14 PA 1023`), so please send that with each event.

```
Base URL : https://<to-be-provisioned>        # staging/prod URL shared on go-live
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
`200` with the record, or `404` if none yet.

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

## What we need from you to finalise
1. Which mode you prefer — **Push** or **Pull**.
2. A **sample telemetry payload** from one live tracker (so we confirm field mapping).
3. Your reporting **frequency** and how `odometerKm` is sourced (GPS-derived vs CAN/OBD).
4. For Pull: your endpoint URL + auth. For Push: confirm you can send the `Authorization` header.

Contact: Bhuwan — Mahalaxmi Travels.

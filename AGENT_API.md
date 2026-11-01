# Garage Saathi — Agent API

For: **Mahalaxmi's own agents** (today, operator-agents) and whoever runs them. This is an internal document.
It is not for AirFi or any other vendor: their integration is `GPS_API.md`.

An agent is a program with its own key. It never signs anyone in, never appears in `/roster`, and cannot use
`/pull`, `/push`, `/upload` or `/auth/*`. It can read only what its **scopes** allow, and every answer is read-only.

```
Base URL : https://garage-saathi-sync.vercel.app
Format   : JSON over HTTPS (UTF-8), GET only
Auth     : Authorization: Agent <key>
```

## Keys

**Mint a key** (on any computer with Python):

```bash
python3 -c "import secrets, hashlib; k = secrets.token_urlsafe(32); print(k); print(hashlib.sha256(k.encode()).hexdigest())"
```

The first line is the key; the second is its digest.

1. In Vercel (garage-saathi-sync → Settings → Environment Variables), set `AGENT_KEYS` to `operator-agents:<digest>`.
   Several agents are comma-separated: `name1:<digest1>,name2:<digest2>`. Only digests are stored here.
2. Give the key itself to operator-agents as `GS_AGENT_KEY`. It sends `Authorization: Agent <key>`. A key sent any
   other way (for example as `Bearer`) is refused.
3. To revoke a key, delete its entry from `AGENT_KEYS` and redeploy (see **Going live**).

## Scopes

`AGENT_SCOPES` lists, per agent, the scopes it holds:

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
  key could do before scopes existed, so nothing that worked stops working.
- A listed agent holds exactly the scopes it lists, so leaving `gps` out takes both GPS reads away from that agent
  without touching its key. The AirFi token and a signed-in user keep `/gps/*` whatever an agent holds. An unknown
  scope name is ignored.
- Only an agent key opens the `/agent/` routes: a signed-in user's session or the AirFi token gets 401.

## Status codes, caching, logging

| Status | Meaning |
|--------|---------|
| `200` | The answer. |
| `401` | No valid agent key. Body `{"error":"unauthorized"}`. |
| `403` | A valid key whose agent does not hold the route's scope. Body `{"error":"forbidden"}`. Any other path under `/agent/` is a 403 too, since no scope opens it. |
| `404` | `/agent/bus-papers` only: no such bus. The body is JSON equal to `{"error": "unknown bus"}`; operator-agents tells an unknown bus from an outage by it. |

- The 200 answers carry `Cache-Control: no-store`, and so does the bus-papers 404. The 401 and 403 are sent without it.
- Each request made with a valid key prints one log line, `[agent] agent:<name> <path>` (a refused one included), with
  the path only, so a plate in the query string is never logged. A request with no valid key has no name to log. The
  GPS routes keep their own `[gps]` line.
- Every answer is built field by field: a field added to a record later is not sent until the server is changed to
  send it.

## `GET /agent/crew`

```json
{ "crew": [ { "id": "d1", "name": "Mohan Lal", "role": "driver", "phone": "+91 98290-12345", "busReg": "MP44ZD0471" } ] }
```

- Only crew who are working now: `status` missing or `active`. Anyone who left, was archived, is on leave, or has any
  other status is not listed.
- `role` is `conductor` or `driver`. `phone` is as the office typed it, `""` when there is none. `busReg` is the
  padded plate of the person's bus, or `null` when they have no bus (or it was deleted or has no plate).
- By name, then id.
- Never sent: alternate phone, address, birth date, blood group, licence, Aadhaar, documents, photos.

## `GET /agent/coaching?approvedSince=<ms>`

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

## `GET /agent/bus-papers?reg=<reg>`

```json
{ "reg": "MP44ZD0471",
  "docs": [ { "type": "Insurance", "expiry": "2026-12-13", "status": "valid" },
            { "type": "PUC",       "expiry": "2026-11-13", "status": "expiring" },
            { "type": "Permit",    "expiry": "2026-10-14", "status": "expired" },
            { "type": "Fitness",   "expiry": null,         "status": "unknown" } ],
  "challans": { "pending": 2, "pendingFine": 700.0, "checkedAt": 1793600000123 } }
```

- The bus is found the way GPS finds one: case, spaces and dashes do not matter, and `MP44ZD471` and `MP44ZD0471`
  are the same plate. `reg` in the answer is the padded plate. No such bus, no plate, a blank one, or a deleted bus is
  a `404`.
- `docs` are in the order the office keeps them. `type` is the text the office chose. `expiry` is the date in IST,
  `YYYY-MM-DD`. `status` uses the app's 15-day thresholds, counted in whole IST calendar days: `expired` is before
  today, `expiring` is today up to 15 days away, `valid` is more. A paper that expires today is `expiring` until IST
  midnight. (The app rounds the difference of two instants instead, so it flips about noon.) `unknown` means no
  expiry was entered, or it cannot be read, and then `expiry` is `null` (the app would show such a paper as expired).
- `challans` comes from the last saved eChallan lookup of that plate. `pending` is how many challans are pending,
  `pendingFine` is what they add up to in fines, and `checkedAt` is when the lookup was made, in epoch milliseconds.
  `pendingFine` is a number and may be a float, for example `700.0`. It is what is owed to the government. The larger
  "payable" figure eChallan bills to settle through its own platform is never sent.
- `challans` is `null` when the bus was never looked up, and also when the last lookup could not reach the registry
  or cannot be read (the counts are not numbers, or are too large to be real), because "nothing found" then does not
  mean "nothing owed". A bus that was looked up and found clean is `{"pending": 0, ...}`, not `null`.
- Never sent: document numbers and photos, the bus's owner, chassis and engine details, challan numbers, offences,
  places and names, and the payable figure.

## Going live

The routes are in the code, but they answer 403 until an agent is given their scopes. The GPS reads are unaffected.

1. Set `AGENT_SCOPES` in Vercel (project `garage-saathi-sync`, Production) to
   `operator-agents:gps,crew,coaching,papers`. Keep `gps` in the list: leaving it out takes the GPS reads away from
   the agent.
2. Vercel gives an environment change to a deployment only through a new deployment. The server reads
   `AGENT_KEYS` and `AGENT_SCOPES` on every request and never caches them, but a running deployment keeps the values
   it was built with. Set `AGENT_SCOPES` before the deploy that carries the routes and one deployment does both;
   set it after and redeploy.
3. Deploys go through the pre-push gate: a push to `main` runs `.githooks/pre-push`, which runs
   `scripts/predeploy-gate.sh` (about 3 minutes), and Vercel then deploys `main`.
4. Check it with the agent's key in `$KEY`:
   `curl -s -H "Authorization: Agent $KEY" "https://garage-saathi-sync.vercel.app/agent/bus-papers?reg=MP44ZD471"`
   answers 200 with the papers. An agent without the `papers` scope gets 403 instead.
5. To take an agent's access back, remove the scope from its `AGENT_SCOPES` entry (removing the whole entry returns
   it to `gps` only) and redeploy. To revoke the key itself, delete it from `AGENT_KEYS` and redeploy.

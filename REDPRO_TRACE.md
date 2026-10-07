# redBus reviews → bus → crew

Week 3 of the rating-trace plan, step 1 (the Garage Saathi side). The office
collector, step 2, reads redPro and posts here. The ITS PNR fallback is step 3.

## Data in

`POST /redpro/ingest` with `Authorization: Bearer $REDPRO_INGEST_TOKEN`. The
token is at least 24 characters, set in Vercel, or `.redpro_ingest_token`
locally (git-ignored). Unset means the door is closed (503).

Body: `{kind, rows, capturedAt}`. `kind` is one of:

| kind | stored in | id | notes |
|---|---|---|---|
| `reviews` | `rbreviews` | `rv-<reviewId>` | unchanged rows are not rewritten |
| `complaints` | `rbcomplaints` | `cs-<caseNumber>` | agent names on notes are dropped |
| `assignments` | `rbassign` | `as-<serviceId>-<IST day>` | redBus shows **today only**, so we keep the history: one `obs` entry per change |
| `services` | `rbservices` | `<serviceId>` | `routeIds` only grow; `lastVehicle` comes from assignments |

Every row is **rebuilt from an allow-list** (`_clean_*`). Passenger names,
phones and e-mails can't land here, even if the collector sends them. Only
the server writes these stores (`SERVER_INGEST_ONLY`). Drivers' phones get
`rbservices` (they pick the service on the gate check); reviews, complaints and
redBus's typed driver names go only to owner, supervisor and crew manager
(`redact_for`).

## Matching (`trace.js`, pure, `TZ=Asia/Kolkata node test_trace.js`)

review `routeId` → service (via `rbservices.routeIds`) → that night's departure
(the service's start time, up to 30 h before boarding) → three separate answers:

1. **gate**: the gate check for that service in [departure −6 h, +3 h]. Strongest: selfie at the bus.
2. **redpro**: redBus's assignment observed nearest to the departure.
3. **its**: step 3, the bus ITS ran the PNR on.

Confidence: `high` means the gate check agrees with the others. `medium` means
redPro or ITS alone. `conflict` means the sources name different buses; it is
**shown, never averaged**. `none` means not traced.
**Crew come only from our records**: the gate check's driver plus the dated duty
log at that time. A driver name typed into redPro is displayed, never matched.

Complaints carry no route id. They borrow it from a review with the same PNR,
otherwise they wait for ITS.

## Screens

- Today (owner, supervisor): **redBus reviews (7 days)**. Average, 1★ share, how many were traced, disagreements.
- **redBus reviews** screen: filters for 1–3★, Safety, Disagree, Not traced and All, plus a Complaints tab. The detail view shows where each answer came from.
- Bus page: last 30 days. Crew page: reviews on trips they worked. **No average under 10 rated trips.**
- Gate check: a **Service** row. Suggestions come first (redBus's last bus on that service, and this bus's earlier checks). Once the service list exists, release waits until a service is picked.

Sorting (`Trace.classify`): safety only on a hard signal (drunk, rash, accident,
police…). Stacked service gripes never count as safety. FAQ means a
refund/cancellation question with no redBus tags.

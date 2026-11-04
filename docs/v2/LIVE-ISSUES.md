# Live issues in v1, found while mapping it for the rebuild

These are about the app the office is using today, not about v2. Each one below
was read in the source and confirmed, not inferred from a summary. Where a claim
needs production data to settle, that is said plainly and the query is given.

Nothing here has been fixed. Production changes are the owner's call.

---

## 1. A saved change can vanish with the screen saying it sent

**Severity: highest.** This is silent data loss, and the loss is invisible to
the person who made it.

**The server.** `push()` applies a record only if it is newer than the stored
one (`sync_server.py:3495`):

```python
if row is None or upd > (row[0] or 0):
    ...
    rev = _upsert_record(c, store, rid, data, upd, rev)
    applied += 1
```

There is **no else branch**. A record that loses that comparison is not
applied, not counted in `rejected`, and not named in `refused`. It falls off
the end of the loop and the response says 200.

**The client.** `sync.js:851` then clears the whole batch from the outbox:

```js
for (const key of byKey.values()) outbox.delete(key);   // everything else landed
```

"Everything else landed" is not true for a record dropped on staleness. The
change stays in that phone's own database, "Waiting to send" drops to zero, and
the server never has it.

**Why this is worth fixing properly rather than patching:** the code already
knows this failure mode. Three lines above, about *refused* writes:

> A refused write is the quietest way to lose work: the change sits in this
> phone's database, "Waiting to send" drops to zero, and the server never has
> it. The server says WHY — pass it on.

That was fixed for refusals. The identical hole is still open for staleness.

**What makes it fire.** `updatedAt` comes from the device clock. Two people
editing the same job card, or one phone with a slow clock, is enough. Only
`partsUsed` is merged; everything else on the record is whole-record
last-write-wins, so the loser's photos, notes and part requests go.

**The fix shape** (not applied): the server names staleness-dropped records in
`refused` with a distinct reason, and the client treats that reason as "re-read
the server's copy and re-apply my change on top" rather than as a refusal to
quarantine. That is a real merge decision per store and should go through the
pipeline, not a quick patch.

---

## 2. The server's read boundary is much narrower than the screens suggest

**Severity: high**, for confidentiality rather than correctness.

`redact_for` (`sync_server.py:3779`) denies, by store: `aimeta`, `digest`,
`crewnotes`, the review and AI-draft stores, and the history stores by role.
Then it field-redacts `_DRIVER_PRIVATE` on driver records. **Everything not
named is returned to every authenticated role.**

`_DRIVER_PRIVATE` is exactly:

```python
("phone", "altPhone", "address", "dob", "bloodGroup", "license", "docs", "salaryMonthly")
```

So a token for any signed-in role — including `conductor`, which holds **zero**
capabilities in `PERMS` — can call `/pull` directly and receive supplier bills
and purchases, the vendor registry, parts and the stock ledger, job-card costs,
fuel entries, driver trip cash, challan liabilities, garage settings, all-staff
attendance, and gate checks with their selfies. Also crew **emergency-contact
and reference phone numbers** (`emgPhone`, `refPhone`), which are not in
`_DRIVER_PRIVATE` and so reach every role.

`redact_for`'s own docstring describes the old version of this bug and says the
client hid what the server did not. That fix covered crew PII fields. It did
not cover the financial stores.

**The consequence for the supervisor decision.** On 2 Nov the owner decided a
supervisor should lose company money visibility. Taking `dashboard` and `bills`
away in `PERMS` would hide the screens and change nothing about what that token
can download. Deny-by-default has to land on the server's read path, not only
in the client's route table, or the decision is cosmetic.

No test asserts any of this. `test_pullscope.py` and `test_office.py` cover
crew PII, GPS, reviews and `crewnotes` only.

---

## 3. Two simultaneous pushes can share a rev

**Severity: medium, and unconfirmed in production.**

`push()` allocates `rev = SELECT MAX(rev)+1` under `_lock`, a
`threading.Lock()` at `sync_server.py:153` — one lock per process. Vercel runs
several containers, so two concurrent pushes can read the same maximum.

This is **not** the paging bug it looks like: `/pull` deliberately never splits
a rev group (`sync_server.py:3866`), because `push()` gives a whole batch one
rev. Two batches sharing a rev are delivered together.

The residual hazard is narrower. Push A reads max=500, then spends time
validating its batch and logging stock moves. Push B commits 501. A pull drains
501 and advances its cursor. Push A then commits its own records at 501, and
`WHERE rev > 501` excludes them for that device for ever.

**To find out whether it has happened.** One push has one actor, so a rev
holding two users' records means two pushes collided on it. Read-only:

```sql
SELECT rev, COUNT(*) AS rows, COUNT(DISTINCT data::jsonb->>'_by') AS actors
FROM records
WHERE data::jsonb->>'_by' IS NOT NULL
GROUP BY rev
HAVING COUNT(DISTINCT data::jsonb->>'_by') > 1
ORDER BY rev DESC
LIMIT 20;
```

Rows returned is strong evidence. **Zero rows does not clear it** — two pushes
from the same person collide invisibly, so this is a lower bound.

---

## 4. A correction to earlier advice about GPS retention

Recorded because the owner was asked to decide on it with a wrong reason given.

The device keeps 60 days of `gpsevents`; the server's window is 30. That was
described as "losing history the server has already discarded." **The server has
not discarded it.** There is no `DELETE FROM records` anywhere in
`sync_server.py`; `HISTORY_DAYS` is a filter inside `redact_for` that withholds
old rows from a pull (`sync_server.py:3795`).

So pruning the device to 30 days means that history is gone *from that device*
and cannot come back, because `/pull` will not send it — while the rows stay in
the database and keep being paid for. The speed gain is real; the cost is worse
than it was presented as.

---

## 5. Relayed but not verified

From the inventory agents, recorded as leads rather than findings:

- No database backup is documented anywhere in the repo.
- Two uncoordinated schedulers (GitHub Actions and a laptop extension) can
  trigger the same AI job, with no queue, at Opus pricing.
- The ITS integration depends on scraping HTML.
- `DEPLOY.md` says Vercel auto-deploys on push; a comment in the `/health`
  handler says it does not.
- `receiveStock` appears to be a dead capability — nothing checks it, and the
  Receive button uses `issuePart`.
- `GET /uploads/<name>` and `GET /roster` need no login.
- The login lockout is database-backed so it survives across containers, but it
  is SELECT-then-INSERT, so a parallel burst can all read "under the limit" and
  proceed together. For a 4-digit PIN that matters more than the hash does.

---

## 6. The real permission model is the navigation, and the navigation is accidental

**Severity: high**, and it changes how the supervisor decision should be read.

`viewHome()` dispatches to a per-role home for all eight roles
(`app.js:3145`). The supervisor's is `viewSupervisorHome()`, 55 lines, and it
offers exactly seven destinations:

```
openAlerts  openAssignments  openGateChecks  openScoreboard
data-nav=fleet  data-nav=jobs  data-nav=store
```

Their tabs are Today, Jobs, Fleet, Store, Me. `viewMe()` holds only settings —
PIN, language, theme, sync, usage, import, documents, logout. So a supervisor
who holds **35 of the 37 capabilities** has no way through the interface to
reach fuel logging, supplier bills, reports, vendors, the crew bank, crew PINs
or coaching. Those openers live in `viewMoney`, `viewOwnerHome`,
`viewStoreHome` and `viewCrewManagerHome`, which the supervisor never sees.

Two screens are reachable by nobody at all. Nothing anywhere renders
`data-act="openWarranty"` or `data-act="openForecast"` — the `switch` cases
exist and no button leads to them.

And the ~110 lines of `viewHome()` after the eight role branches are dead
code, because every role returns before reaching them. Two of the openers
stranded in there are `openReports` and `openRoutes`.

**Why this matters for the decision in front of the owner.** The question was
whether a supervisor should keep company money visibility. The answer today is
split in a way nobody intended: through the interface they already cannot reach
most of it, while their token can download all of it (see issue 2). So the
permission table, the navigation and the server's read boundary each enforce a
different policy, and none of the three is the one that was decided.

This is the single strongest argument for the rebuild in this document. The
v2 rule — a screen declares the capability it needs, and a screen that declares
nothing is unreachable by everybody — replaces three disagreeing mechanisms
with one.

---

## 7. Uploaded files are served to anyone holding the URL

**Severity: medium-high.** Verified in source, not relayed.

`GET /uploads/<name>` at `sync_server.py:5231` has **no authentication of any
kind**. It checks that the file exists, that the name matches `_UPLOAD_NAME`
(32 hex characters plus an extension), and serves the bytes.

So the only protection is that the name is unguessable. At 32 hex characters
that is 128 bits, which is genuinely infeasible to brute-force — this is the
capability-URL pattern, and it is a legitimate one. The weaknesses are the
pattern's, not the implementation's:

- A URL leaks through a `Referer` header, a server log, browser history, a
  screenshot, a forwarded WhatsApp message, or a shared device.
- There is no revocation. Anybody who has ever held the URL holds it for ever,
  including somebody who has left.
- The role model does not reach it at all. Every rule in `redact_for` about who
  may see a crew member's documents is bypassed by having the link.

**What is behind these URLs matters.** Crew identity documents — Aadhaar and
licence photographs — gate-check selfies, supplier bills, and before/after
repair photographs. An Aadhaar image on an unauthenticated URL is the most
sensitive thing in the system.

**Probably not deliberate.** Compare `/roster`, two handlers below, which is
also unauthenticated and carries a comment saying exactly why that is safe and
what it does not expose. `/uploads/` carries no such note, which suggests it
was not a decision so much as the shortest path to a working photo.

**Not fixed, and the fix is the owner's call** because it is not free. Requiring
a session token would mean every `<img src>` in the app sends one, which for an
offline-first PWA means either the service worker attaching it or short-lived
signed URLs. Either is real work, and a wrong move there breaks photographs on
a hundred devices. Worth doing for the documents; arguably not worth it for a
repair photograph.

Note also that uploads may be served from Cloudflare R2 (`R2_PUBLIC_URL` is in
the health probe), in which case the same reasoning applies to the bucket's own
public URLs and the fix has to cover both.

---

## 8. "Log service" has been half-failing for eight weeks

**Severity: high**, because the half that fails is the money, and the half that
succeeds makes it look done. Verified by reproducing the exact push against both
the current server and the one deployed this morning.

`confirmLogService` (`app.js:9376`) writes two records: it updates the bus with
a new `lastServiceOdo` and `lastServiceDate`, and it creates a job card holding
the labour hours and the cost. The card is created **straight at
`status: 'verified'`, with `verifiedBy` set to the person logging it and empty
photo arrays.**

The server refuses that card:

```
  buses update : applied=1   (the service DATE lands)
  service card : applied=0   (the COST and history do not)
  reason: "job needs before and after photos (or a vendor bill) to close"
```

So the bus records that it was serviced, and the cost, the hours and the audit
trail never leave the device. The screen says "Service logged". The repair
history is missing a record that the bus's own service date implies exists, and
the running-cost total for that bus is short by the amount.

**It has been like this since 10 September 2026**, commit `2299533`, "Enforce
the anti-theft rules on the server, not just in the browser". That commit was
right to require photographs. What it did not do was audit the client's write
paths against the new rule, and `confirmLogService` had been writing a photoless
verified card since 22 June (`1b42850`). Eight weeks.

**I did not cause this, and I checked rather than assumed.** The second-signature
change deployed today (`b1fb43b`) refuses the same push for a second reason —
a card must be closed before it is signed off — but the photo rule is evaluated
first and was already refusing it. Running the identical push against `4732dac`,
the commit that was live this morning, gives the same refusal word for word.

**Why nobody reported it.** The client writes to IndexedDB first and reports
success from that, so the person sees "Service logged" and moves on. The refusal
arrives later, on a sync tick, as a toast with no context next to a screen that
has already moved. And the bus's service date — the thing anybody would check —
is correct, because that record was accepted.

**The fix is a design question, not a patch**, which is why it is recorded rather
than done. A preventive service is work somebody did, so under `DECISIONS.md`
§10 it needs a photograph and a second signature like any other work. The v2
specification already says so: the service log stops at `done` and requires a
photo. Making v1 behave that way means a supervisor can no longer log a service
in one tap, which is a real change to a daily habit and therefore the owner's
call.

What should not continue is the current state, where the app says it saved
something it did not.

---

## 9. Gate-check selfies can be stored inline, and gate checks are never aged out

**Severity: medium, and it grows on its own.** Verified in source. Found because
B5 assumed the record holds a URL, said in its report that the assumption was
unverified, and was right to flag it — it holds a URL most of the time and the
whole image some of the time, and the exception is the common case on the device
that matters.

**The mechanism.** `app.js:9818`:

```js
const selfie = cap.photo ? (await Sync.uploadPhoto(cap.photo) || cap.photo) : '';
```

`Sync.uploadPhoto` returns `null` when it cannot reach the server — offline, a
503 from storage, a 401, or a payload over the limit. The `||` then falls back to
`cap.photo`, which is the `data:` URL itself: a JPEG capped at 720px at quality
0.72, base64-encoded, so roughly 80–160 KB **inside the record**. That estimate
is arithmetic from the capture settings at `app.js:961` and `app.js:965`, not a
measurement of a real one.

A driver at the gate, outside in a yard, is exactly who takes the offline path.
So the inline case is not the rare one for this store; it is the normal one for
the devices that produce most of its rows.

**Why it accumulates.** `HISTORY_DAYS` in `sync_server.py:3706` windows six
stores — `gpsevents`, `triplog`, `stockmoves`, `usage`, `audits`, `dutylog`.
`gatechecks` is not among them, so **every gate check ever recorded is still
sent, for ever, to every device entitled to it.** One departure per bus per day
across a hundred buses is tens of thousands of rows a year, and whatever
fraction of them carry an inline image carry it permanently.

**This is live in v1 today**, not a v2 concern. Every device that syncs pulls the
whole history. It is also why v2 adding `gatechecks` to the first sync pass —
correct in itself, because a departure check awaiting a hold decision is the top
band of the Attention screen — makes a pre-existing cost land on the first
screen instead of later.

**Two fixes, and they are independent.** Either is worth having; both is better.

- **A send window.** `GATECHECKS_HISTORY_DAYS`, the same shape as the other six.
  A departure check from last March answers no question anybody asks. This is
  retention policy, so it is the owner's: contract §9(g).
- **Never store the image inline.** A failed upload should queue the photo for
  retry and leave the record referring to where it will be, rather than carrying
  the bytes into the sync stream for ever. That is a real piece of work and it
  interacts with issue 7, because the same offline fallback is the reason a
  signed-URL scheme cannot simply expire these links.

**Not measured, and it is the number that decides the priority:** how many
production `gatechecks` rows currently hold a `data:` URL rather than a path. A
read-only query settles it, and until somebody runs it this is a mechanism with
an unknown multiplier:

```sql
SELECT COUNT(*) AS total,
       COUNT(*) FILTER (WHERE data::jsonb->>'selfie' LIKE 'data:%') AS inline,
       COUNT(*) FILTER (WHERE data::jsonb->>'selfie' LIKE '/uploads/%') AS uploaded
FROM records WHERE store = 'gatechecks';
```

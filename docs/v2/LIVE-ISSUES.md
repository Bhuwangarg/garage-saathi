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

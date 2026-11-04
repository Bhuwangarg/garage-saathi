# v2 backend slices

Stage 3, server side. The cut, not the build. **This session does not dispatch
builders** — the dispatching session does, from this table.

Read `docs/v2/plan/v2-contract.md` first. It is the promise the frontend is
building against; every brief below implements a part of it and may not contradict
it. If a builder finds the contract wrong, it comes back to the lead and §10 of the
contract records the change — a builder never changes the contract by changing the
code.

---

## The table

| Order | Slice | What it is | Files it **owns** (nothing else may touch them) |
|---|---|---|---|
| **0** | **B1 — The server boundary** | Everything the server enforces: deny-by-default reads, the merge rules that stop the silent loss, the named refusal, idempotent replay, the new store's write rules, and the audit of every v2 write against `_guard_write` | `sync_server.py`, `v2_perms.py` ✱, `test_readscope.py` ✱, `test_pushstale.py` ✱, `test_guardmerge.py` ✱, `test_guardwrite_v2.py` ✱, `test_nightlist.py` ✱ |
| **0** | **B2 — v2's own database, and the client half of the refusal** | v2 stops sharing v1's IndexedDB; `"stale"` becomes a re-apply with a reason and a Retry, and **never a dialog** | `v2/db.js`, `v2/sync.js`, `test_v2_stale.js` ✱, `scripts/check-v2-isolation.sh`, `vercel.json` |
| **1** | **B3 — pull-apply: the pending edit, and the first pass** | The second silent-loss path, plus the two safety stores that arrive behind the full drain | `v2/pullapply.js`, `test_v2_pullapply.js` ✱ |
| **1** | **B4 — the `nightlist` client module** | Tonight's running list, with the per-bus merge that lets the count reach zero | `v2/night.js` ✱, `test_v2_night.js` ✱ |
| **2** | **B5 — the pull-cost proof** | B1's riskiest claim, measured on the fleet-sized fixture instead of asserted | `test_pullcost.py` ✱, `scripts/measure-pull.py` ✱ |

✱ = new file. 18 files, **each appearing in exactly one row.** Checked mechanically, not by eye.

### Why there is one server slice and not three

`backend-lead.md` says a slice owns its files and no two builders sit in the same
file, and the brief repeats it: *no two slices may list the same file.* Four
separate server changes are needed — the read boundary, the staleness else-branch,
idempotent replay, the merge rules, the write-path audit and `nightlist`'s write
rules — and all of them live inside `push()`, `pull()`, `_guard_write()` and
`redact_for()` in one 6,000-line module. Three builders in
that file would mean three-way merges in the hottest code in the system.

I considered extracting `push()`'s record loop into a module per change and
rejected it: a refactor of the one function every device calls every four seconds,
performed by three builders in parallel, during a rebuild, is a worse bet than one
builder doing four related things. The four **are** one job family — what the
server permits — which is what a slice is supposed to be. B1 is the largest slice
and the most important; it gets the strongest builder.

`v2_perms.py` is still extracted, for a different reason: the read matrix should be
readable as data by somebody who is not reading the server, and it is the file the
owner will edit at cutover to delete the six `v1-compat` rows.

### Dependencies

```
B1 ──────────────┐
                 ├── B5   (measures what B1 built)
B2 ──┬── B3      │
     └── B4 ─────┘
```

- B1 and B2 are both order 0 and **genuinely parallel**: no shared file, and B2
  builds against the wire format written down in the contract (§2.2, §4.1) rather
  than against B1's code. B2's tests use a fake server, so B2 can go green before
  B1 lands.
- B3 and B4 need B2's exports (`outboxbase`, `DB.touched`, the v2 database name).
- B5 needs B1 in the tree to measure it.
- First integration point: B1 + B2 together, end to end, against a local server —
  that is the integrator's seam (stage 4) and it is named here so it is not a
  surprise: **the wire format in contract §4.1 is the seam.**

### Ground rules every brief inherits

- `scripts/run-tests.py` runs all 48 suites (`--fast` skips the one slow UI suite);
  it must stay green. **It auto-discovers `test_*.py` and `test_*.js` at the repo
  root only — it does not recurse into `v2/`.** That is why the JS suites above are
  named `test_v2_*.js` at the root and not `v2/test_*.js`. A test in `v2/` would
  never run, and a test nobody runs is not a test.
- Every Python test pops `DATABASE_URL`, `TURSO_URL` and `TURSO_DATABASE_URL` and
  points `DB_PATH` at a tempfile. Copy `test_pullscope.py`'s header exactly. No
  test reaches production; that is why the harness needs no flag to be safe.
- Two suites must not bind the same port. If a brief binds one, it goes in
  `run-tests.py`'s `PORT_BOUND` — but `run-tests.py` is owned by no slice, so a
  builder that needs an entry **asks the lead** rather than editing it.
- `scripts/predeploy-gate.sh` and `scripts/check-css-floor.sh` are hard gates.
  **Never weaken or delete a check to make a change pass.** If a check is wrong,
  say so and fix it deliberately, in its own commit.
- After adding a check, **break the thing it covers and confirm it goes red.** A
  check that cannot fail is decoration. Each brief below names the check and the
  mutation that must make it fail.
- Never print, log, commit or paste a secret, token, PIN or connection string.
- **Never run a production write or a production deploy.** Hand over the SQL or the
  command. Contract §9 is the hand-over list; add to it rather than acting.
- v1 must keep working against the same database throughout. Anything v2 writes
  stays legible to v1. Contract §6 is the list of things that must not change, and
  it is a list of things that each look harmless in a diff.
- Measure before you claim. If you report a number you did not measure, say so in
  the same sentence.

---

## B1 — The server boundary **(order 0)**

**Owns:** `sync_server.py`, `v2_perms.py` (new), `test_readscope.py` (new),
`test_pushstale.py` (new), `test_guardmerge.py` (new), `test_guardwrite_v2.py`
(new), `test_nightlist.py` (new).
**Touches nothing else.** In particular not `v2/`, not `sync.js`, not `app.js`.

**Why this is first.** Every other slice is written against it, and
`LIVE-ISSUES.md` issue 2 is the largest security item in the rebuild: a
`conductor` token, which holds **zero** capabilities and reaches **zero** routes in
v1, can `/pull` supplier bills, purchases, vendors, parts, the stock ledger,
job-card costs, fuel, driver trip cash, challan liabilities, garage settings,
all-staff attendance and gate checks with their selfies. v2's whole permission
model — *a screen declares the capability it needs; a screen declaring nothing is
unreachable by everybody* — is **cosmetic until this moves**.

### What it exports

`v2_perms.py`, imported by `sync_server.py` and by the tests:

```python
STORE_READ_ROLES  # {store: frozenset(roles)} — DENY BY DEFAULT. Absent ⇒ nobody.
V1_COMPAT_READ    # {store: frozenset(roles)} — the six rows that keep a live v1
                  #   screen working, each with the v1 route in a comment.
                  #   Deleting a row is the cutover. It is the owner's call (§9b).
OWN_ROWS_ONLY     # {store: (json_field, frozenset(roles_restricted_to_own))}
FIELD_REDACT      # {store: (fields...)} — the second layer, after the store check
read_roles(store)         -> frozenset          # STORE_READ_ROLES | V1_COMPAT_READ
may_read(role, store)     -> bool
never_for(actor)          -> frozenset          # derived, never restated
own_rows_predicate(store, actor, dialect) -> (sql_fragment, params) | None
```

### What it changes in `sync_server.py`

1. **`_never_for(actor)`** becomes `v2_perms.never_for(actor)`. Keep the existing
   docstring's warning — it is still true and it is the reason the derivation
   exists: naming one store too few in the SQL skip costs a little reading; naming
   one too many means every device with that role silently never receives it.
2. **`redact_for(actor, rec)`** gains, as its **first** check, `if not
   may_read(role, store): return None`. The age window and field redaction run
   after. `_DRIVER_PRIVATE` gains `emgName, emgPhone, emgRelation, refName,
   refPhone` (contract §3.3a — `LIVE-ISSUES.md` 2, `03 §9.26`). `meta`'s money
   fields are stripped below manager. `PII_ROLES` stops being a read-authorisation
   set and becomes only the field-redaction set.
3. **`pull()`** adds `own_rows_predicate` to **both** statements — the bound read
   and the page read. They must use the same filter or completing a rev group
   readmits a row the page just excluded; the existing comment says exactly this
   about `skip` and it now applies to the predicate too. Dialect-aware:
   Postgres `(data::jsonb->>'f') = %s`, SQLite `json_extract(data,'$.f') = ?`.
4. **`_guard_write` gains the field-level merge rules** for every **F** store in
   contract §4.4. This is the primary fix for the silent write loss, and it needs
   no new mechanism: a payload `_guard_write` corrects is already re-stamped
   `max(upd+1, now)` by the existing line in step 5, so step 6's comparison cannot
   drop it. That is why `partsUsed` has never been lost to staleness while the rest
   of the card has — **extend the merge and the clock stops deciding anything.**
   Each rule is a *domain* rule, decidable without knowing the pushing device's
   intent, in the shape `_merge_parts_used` already demonstrates: arrays union by
   element id; `buses.odometer`/`lastServiceOdo` take the **max**, because a lower
   reading is never the newer truth; `usage` counters **add**. Transcribe §4.4; do
   not invent a rule it does not give, and do not add one for `parts.qty` — §4.4
   says in plain words that it is unfixed and must not look otherwise.
5. **`push()` step 6** — `sync_server.py:3495`, today `if row is None or upd >
   (row[0] or 0):` with **no else**. Add the else, for the residual **R** cases
   only: `rejected += 1` and
   `refused.append({"store","id","reason":"stale"})`, carrying
   `server:{data,updatedAt,rev}` when the stored copy is under
   `STALE_COPY_MAX_BYTES` (default 256 KiB, env-overridable). The reason string is
   the literal `"stale"` and must stay distinct from every existing refusal reason,
   all of which are prose sentences — v2's client switches on it. **Do not change
   the comparison itself**: `upd > row[0]` stays exactly as it is, because changing
   it changes conflict resolution for every v1 device in the field. The fix is step
   4 merging first, not step 6 ordering differently.
6. **Idempotent replay.** Same store, same id, payload byte-identical after the
   server stamps (`_META`) are removed ⇒ counted in `applied`, not `refused`. This
   closes the gap `04 §3.2` names: a retry into `ledger`/`dutylog`/`crewnotes`
   after a lost response is refused today even though the first write landed.
   `_same_except` already exists for this shape — reuse it rather than writing a
   second comparison.
7. **`nightlist`**: add to `WRITE_ROLES` (`{owner, supervisor, crewmanager}`), to
   `HISTORY_DAYS` (365, env `NIGHTLIST_HISTORY_DAYS`) and `HISTORY_ROLES`, to
   `STORE_READ_ROLES`, and a `_guard_write` branch per contract §5: `date` matches
   `^\d{4}-\d{2}-\d{2}$` **and** equals the id's suffix; `buses` is an object with
   ≤200 entries; each entry's `by` is forced from the token and each **changed**
   entry's `at` is **stamped from server time** — that stamp is what makes the
   store's ordering clock-independent (contract §4.4, strategy **S**), so it is not
   optional tidying; no delete; **not** append-only. Not in `SERVER_INGEST_ONLY`.
8. **The write-path audit** — contract §10, `test_guardwrite_v2.py`. Replay one
   representative push for **every row** of that table against `_guard_write` and
   assert the recorded verdict. This is `LIVE-ISSUES.md` issue 8 turned into a
   check: "Log service" has been half-failing since 10 September because the commit
   that added the photo rule never audited the client's write paths against it, and
   for eight weeks the screen has said "Service logged" while the cost and the
   hours never left the device. The one row that must stay **red** is the v1
   service-log shape; the next commit that tightens a server rule now breaks this
   file instead of breaking a screen eight weeks later.

### What it must NOT change

- `WRITE_ROLES` for any existing store. A v1 driver writes `trips`, `triplog` and
  `gatechecks` today; narrowing a write role breaks a live screen.
- The jobcards verify clause at `sync_server.py:1668`. `DECISIONS.md §10` wants
  `closedBy != verifiedBy` for every role **and says in the same breath that v1 is
  deliberately not changed**; `selfSignsOff` is live at `app.js:3873` and
  supervisors sign off their own work in the office today. Tightening the shared
  guard is a production behaviour change for ~100 people. The two-line patch goes
  in contract §9(c) for the owner. v2's second signature lives in the v2 client,
  exactly as `ux §4.3` and `§6` already say.
- `rev` allocation. Contract §9(d) is the verdict and the reasoning: it is a v1
  production fix to hand over, not a v2 slice. Do not touch `_lock` or
  `MAX(rev)+1`. Do not make anything in this slice depend on `rev` being unique —
  that is why the stale refusal carries the stored copy instead of asking the
  client to re-read by cursor.
- The eleven invariants in `scripts/check-v2-isolation.sh`, the `/v1/` alias, and
  the single-record `403` shape.

### The checks it must add, and the mutation that must make each fail

| Check | Red when you |
|---|---|
| `test_readscope.py` — all 8 roles × all 45 stores, both directions: role not in `read_roles(store)` ⇒ `redact_for` is `None` **and** the store is in `never_for` | add any role to any `STORE_READ_ROLES` row; or make `never_for` return `frozenset()` |
| the same file: received set **equals** entitled set after a full drain per role (not merely "nothing extra") | drop a store from `never_for` while leaving it in `redact_for`, which a scoping bug does and an "extra only" assertion would not catch |
| named regressions, each failing on today's code: a conductor receives no `purchases`, `ledger`, `jobcards`, `fuel`, `trips`, `challans`, `gatechecks`, no `meta.labourRate`, no other person's `attendance`; a mechanic no `purchases`/`vendors`; an office login no `jobcards`/`ledger`; a crewmanager no `purchases`/`ledger`; `emgPhone`/`refPhone` absent from every non-PII `drivers` record | revert any one of the six changes above |
| per-record: an own-rows role gets its own row, not a colleague's, **and its page is not empty** | move the predicate from SQL into a post-filter — the page empties and the check names it |
| the six `v1-compat` rows asserted **present**, each with its v1 route named | delete a compat row (so nobody removes one by accident mid-build; removing one on purpose is two deliberate edits) |
| `test_pushstale.py` — a losing push on an **R** field is in `refused` with `reason:"stale"`, counted in `rejected` and not in `applied`, carries `server` under the cap and omits it over | delete the else branch |
| `test_guardmerge.py` — for every **F** store, a stale push whose fields do not collide **applies**, and the stored record holds both devices' changes | drop a merge rule — the record is dropped again, silently, which is the original bug |
| the same file: `buses.odometer` merges as **max even when the newer write carries the lower reading** | make it take the newer value — this is the clock-independence proof and it must be the check that proves it |
| `test_guardwrite_v2.py` — every row of contract §10 replayed against `_guard_write`, verdict asserted, including the red one | mark the v1 service-log shape as allowed |
| the same file: an identical replay into `ledger`, `dutylog`, `crewnotes` returns `applied` | revert the idempotency change |
| `test_nightlist.py` — write roles, the four guard rules, the retention window, `by` forced from the token, delete refused | loosen any one guard rule |

The sweep's list of store names is **spelled out, not imported**, so adding a store
and forgetting it shows up as a gap in the sweep rather than as silence. That is
why `test_pullscope.py` does the same, and the brief is to extend that pattern
rather than restate rules.

### Also hand over, do not do

Add to contract §9 anything this slice finds that is a production change. The list
already holds: the rev-collision query, the six compat rows, the v1 second
signature.

---

## B2 — v2's own database, and the client half of the refusal **(order 0)**

**Owns:** `v2/db.js`, `v2/sync.js`, `test_v2_stale.js` (new),
`scripts/check-v2-isolation.sh`, `vercel.json`.
**Touches nothing else — and never v1's `db.js`, `sync.js`, `pullapply.js` or
`app.js`.** v2's three data-layer files are byte-identical to v1's today
(`diff` is empty for all three); every fix lands in `v2/`.

**This slice shrank after the contract was revised.** It was going to carry a
client-side three-way merge engine (`v2/merge.js`) with a base snapshot per outbox
key. Contract §4.2 moved the merge to the **server**, where `_guard_write` already
re-stamps a corrected payload above the stored row, so nothing is dropped and no
clock is consulted. What is left here is the honest client half: a re-apply for the
residual refusals, a reason, and a Retry. That is a smaller, safer slice, and it
also retired the riskiest claim in the first draft of the contract — that a base
snapshot is bounded by what the user edited, which is false for a job card photo
array with a failed upload riding inline as a `data:` URL.

**Two jobs, one file set**, because neither is safe without the other: the outbox
work needs a device-local store, a new store needs a `DB_VERSION` bump, and a bump
on a shared database name breaks v1.

### Job 1 — v2 gets its own IndexedDB

`v2/db.js:7-8` today: `DB_NAME = 'garage-saathi'` — **the same database as v1**,
same origin, one version number. `nightlist` needs a bump
(`onupgradeneeded` only fires on one; without it `tx('nightlist')` throws
`NotFoundError`). The moment a tester opens v2 and that upgrade runs, v1's
`indexedDB.open('garage-saathi', 28)` fails with a `VersionError`, `openDB`
rejects at `req.onerror = () => reject(req.error)`, and **v1 comes up with no
database on that device**. Same shape as the service-worker hazard
`DECISIONS.md §2` calls the single most dangerous detail in the cutover, and not
covered by any of the eleven invariants.

Do: `DB_NAME = 'garage-saathi-v2'`, own version line starting at 1, with
`nightlist` and `outboxbase` in `STORES`. Keep `onblocked` and `onversionchange` —
without both, an upgrade with the app open twice is not a slow path, it is a hang
with nothing in the console. Add `nightlist` to `v2/sync.js`'s `STORES` (so it
syncs) and **not** `outboxbase` (device-local, never synced — `markDirty` must
return early for it, the way it already does for `meta.seeded`).

Name the costs in the commit message, they are already in contract §7: a tester's
device holds two replicas, and v2 does a full first sync.

**Also:** `vercel.json`'s `includeFiles` is an allow-list and does **not** name
`v2/**`, while every other served directory (`ui/**`, `icons/**`, `assets/**`) is
named and every file the static handler serves is listed individually. On the
evidence of the list, `/v2` 404s in production today. Add `v2/**`. **This session
could not verify it against a real deployment** — say so in the commit, and the
owner confirms with `GET /v2/` after the next deploy. Do not weaken the isolation
script's `grep -c "Service-Worker-Allowed" vercel.json` check while editing the
file.

### Job 2 — `"stale"` becomes a re-apply, not a loss

`v2/sync.js:850` today clears the whole batch under the comment
`// everything else landed`. That comment is false for a staleness drop
(`LIVE-ISSUES.md` 1; `DECISIONS.md §14`: v2 starts from the same code, so **v2
starts with the same bug**). Make the comment true.

In `push()`'s `refused` handler, split by reason:

- `reason === 'stale'` ⇒ **not** a refusal. Take `refused[].server`, merge per
  contract §4.4, stamp `updatedAt = max(server.updatedAt + 1, Sync.now())` — the
  `+1` because the server compares **strictly** greater and an equal timestamp
  loses silently, which is the bug — write with `putRaw` (no re-stamp), **keep the
  key in the outbox**, let the next tick push it.
- `server` omitted (over the cap) ⇒ defer the key one tick and let the next `/pull`
  deliver the copy. Bounded by the same retry budget.
- `STALE_RETRIES = 2` rounds per key, then quarantine with
  `reason:"stale-unresolved"` and surface through the existing `cbRefused` path.
  **Never an unbounded loop** against a record two people are both editing.
- Every other reason ⇒ quarantine exactly as today. Do not regress that path; it
  was fixed deliberately and its comment says why.

**The one rule above every detail of this job.** Contract §4.0: `updatedAt` comes
from the pushing device's clock, which is the same clock the bug depends on. A
phone set forward wins every comparison; a phone set back loses every one and its
user is asked to confirm an overwrite on every save, learns the dialog means
nothing, and clicks through. **A confirmation people have been trained to dismiss
is worse than none, because it launders data loss into consent.** So:

> **No dialog. Ever.** No "Overwrite?", no "keep mine or theirs?", no timestamp
> shown as a tie-break. A conflict a person must see is a named refusal with a
> reason and a Retry. Both stage-2 designers have already written their screens
> that way; do not make them change.

`v2/db.js` records, per outbox key, the touched top-level field names and their
**base** values in `outboxbase` — **only for the R stores in contract §4.4**, which
is a short list, because every F store is merged on the server and never reaches
this path. Write it at the four places a row is ever written (`_write`, `bulkPut`,
`bulkPutRaw`, `del`), so no caller has to remember to declare what it touched,
which is the same reason dirty marks live there.

**One rule that does not relax.** `ux §6`: *v2 must not design any flow that
depends on it being fixed.* The field division between people — supervisor owns the
card, mechanic writes two fields nobody else writes, storekeeper writes the one
field the server already merges — is what makes the job card safe on the existing
protocol, and it stays. This slice makes the protocol honest; it does not license a
two-editor screen.

### What it exports (the frontend lead builds against these)

```js
Sync.info()   // + { stale, staleUnresolved, quarantined, reasons[] }
              //   ux §7 measure 7: every record a person was told about,
              //   with a reason and a retry. This is Me's device-state row.
DB.touched(store, id) -> [field names]        // for a pending R-store key
```

There is deliberately **no** `confirm`-shaped export. The frontend has nothing to
ask the user, because there is nothing a user can usefully be asked about a clock.

### The checks it must add

| Check | Red when you |
|---|---|
| `test_v2_stale.js` — `"stale"` re-applies and does **not** quarantine; `updatedAt` is `server.updatedAt + 1`; quarantines with `stale-unresolved` after exactly 2 rounds | make `"stale"` fall through to the quarantine branch; or stamp `server.updatedAt` without the `+1` (the record then loses again, silently — which is the original bug wearing the fix's clothes) |
| the same file: every non-`stale` reason still quarantines, and `cbRefused` still fires | regress the existing refusal path |
| the same file: the module **contains no confirmation path at all**, asserted by grepping it for a confirm/overwrite/keep-mine affordance | add a dialog — this check exists so a future builder cannot add one quietly, and it is the only check in the cut that guards a thing's *absence* |
| `scripts/check-v2-isolation.sh` — a **twelfth** invariant: `v2/db.js`'s `DB_NAME` is not v1's, asserted by comparing the two literals rather than matching a string, so renaming either still trips it. A **thirteenth**: `vercel.json`'s `includeFiles` names `v2` | set `v2/db.js`'s `DB_NAME` back to `'garage-saathi'`; drop `v2` from `includeFiles` |

Adding invariants is not re-doing the isolation script. **Change none of the
eleven.** Read the whole file before editing it — its own comments record a check
that tripped on prose about itself, and the lesson written there is that a check
which trips on its own documentation teaches people to delete checks.

---

## B3 — pull-apply: the pending edit, and the first pass **(order 1, after B2)**

**Owns:** `v2/pullapply.js`, `test_v2_pullapply.js` (new).

Two jobs, both in `FIRST_STORES`' file and `decidePage`'s file, which is the same
file.

**The second silent-loss path, and nobody has named it yet.** `03 §4.4` step 3:
when an arriving remote record wins, *"if a winner's key is still in the outbox the
local edit is **discarded** (key removed from the outbox) and counted as a
conflict."* The user gets a toast saying "N record(s) updated on another device" and
their own change is gone. That was tolerable while a stale push was also silently
dropped — both ends lost the same edit. Once B1 and B2 make a stale push
recoverable, this path becomes **the** remaining way a v2 edit vanishes, and it
would quietly undo the fix.

Change: when a remote record wins and its key is in the outbox, do not discard the
local edit. **Keep the key in the outbox and let it push again** — the server now
merges it by the domain rule for that store (contract §4.4), so the second push is
where the two versions are reconciled, by the side that can do it without
consulting a clock. Count it as a merge rather than a conflict. Only the residual
**R** stores can still collide, and those surface with a reason and a Retry, never
as a toast with a number and never as a dialog.

This is the right division and it is worth stating why: the client cannot order two
writes (both timestamps are device clocks), and the server can (it issued the
`rev`). So the client's only job here is **not to throw the edit away** before the
server gets a second look at it.

Everything else in `decidePage` stays exactly as it is, and that matters:

- A remote record wins on **no local row**, or **local `_redacted` and remote not**
  (un-redaction wins at an equal timestamp), or **strictly newer** with the 24 h
  local-future guard. Equal timestamps lose. Do not touch this; `test_pullapply.js`
  checks it against a transcription of the old condition across every combination
  of timestamp and redaction flag, and that is the file this one is modelled on.
- One transaction per store (`bulkPutRaw`), with the one-at-a-time fallback to find
  a failing row. **Not** per-row and **not** a cursor — both have been shipped and
  both had to be undone (277 ms per page → 54 ms).
- The cursor is held at `rev - 1` of the lowest failing record until
  `PULL_STORE_TRIES = 5`, then moves past and the replica is **permanently short**.
  A device silently missing data is on record: 22 crew added on one phone showed 5
  on another.
- The `first` → `defer` → `only` drain plan and **both** cursors. Dropping the
  deferred catch-up pass loses `gpsevents` permanently with no warning; running it
  every tick doubled sync load for nothing and shipped once. Anywhere a cursor is
  reset, both are reset.
- Never write a `_redacted` copy back.

### The checks it must add

| Check | Red when you |
|---|---|
| `test_v2_pullapply.js` — a remote winner whose key is in the outbox **merges**, the key **stays** in the outbox, and the local field survives | restore the discard (`outbox.delete(key)`) — this is the whole slice |
| a same-field collision surfaces as `stale-conflict` with a reason, and is not silently counted | make the collision pick a side |
| the existing win rules are unchanged, transcribed across every timestamp × redaction-flag combination, as `test_pullapply.js` does | flip "equal timestamps lose", or break the un-redaction exception |
| one transaction per store, asserted by counting transactions, not by timing | go back to per-row |

### Job 2 — the first pass is missing the two safety stores

`pullapply.js:144` lists sixteen stores for the first pass and does **not** include
`gatechecks`, `driverreports`, `dutylog` or `crewnotes`. So on a new or re-synced
device the departure checks awaiting a hold decision and the "something is wrong
with my bus" reports arrive **behind the full drain** — and those two are the top
band of Attention, the first thing that screen exists to show. A crew member's
coaching conversation is in the same position, and for a driver, Me is the entire
app.

**Add `gatechecks`, `driverreports` and `crewnotes`. Leave `dutylog` out** —
append-only with a 365-day window, and its only consumer is the historical "who was
on bus X on date Y" lookup, which is not a first-screen question; adding it would
slow the first screen to serve a query nobody makes on arrival. Contract §11 has
the reasoning and the one cost that is not obvious: `gatechecks` has **no server
send window at all**, so the first pass pulls every gate check ever recorded with
its selfie and item photos. The page is byte-governed, so that degrades to an extra
page or two rather than a hang — but say the figure in the commit after measuring
it against the fixture, do not assert it.

**v1 has the identical gap and v1's `pullapply.js` is not changed** (contract §6
rule 5, §9(g)). It goes to the owner as a separate production change.

| Check | Red when you |
|---|---|
| `test_v2_pullapply.js` — `FIRST_STORES` contains `gatechecks`, `driverreports` and `crewnotes`, and does **not** contain `dutylog` | add `dutylog`, or drop one of the three — the second is the live defect and the first is the thing we decided against on a stated reason |
| a first-pass drain for a role entitled to them delivers an `awaiting` gate check and an open driver report **before** the full drain completes | revert the list — and note this is the check that actually proves the point, because the list itself passing proves only that somebody typed three names |

---

## B4 — the `nightlist` client module **(order 1, after B2)**

**Owns:** `v2/night.js` (new), `test_v2_night.js` (new).
**Consumes:** `v2/db.js`'s DB API (B2). Does not touch it.

**Design accepted, and why.** `DECISIONS.md §8`: the duty board gets a quick daily
entry — pick the buses that run tonight, then fill their seats — so the count can
reach **zero**, which is the whole point, because a number that cannot reach zero
teaches people to scroll past red. The record it needs cannot be a field on `buses`
(written constantly by v1, so a field v1 does not know is erased the next time any
v1 device writes that bus), cannot be `dutylog` (needs crew *and* seat *and* a real
time, and is immutable even for the owner, so it cannot say "this bus runs, nobody
on it yet"), cannot be `meta` (only the `garage` row syncs and a crewmanager may
not write `meta` at all), and cannot be derived (the point of the list is to know
which buses still need a seat filled, so deriving it from filled seats is circular).

So it is one new store, and the reason that is safe was **verified in source, not
taken from the UX doc**: `sync.js:1040` discards a pulled record whose store is not
in v1's `STORES`; `sync.js:677` `markDirty` returns early for an unknown store so
v1 can never push it; `db.js`'s `STORES` has 41 keys and `onupgradeneeded` creates
only those, so a v1 device never has the object store at all. `aimeta`,
`odometerlogs` and `waconv` already behave exactly this way.

Record shape, retention and guard rules: contract §5. Read it; do not re-derive it.

### Two things about the shape that are decisions, not details

- **A map keyed by bus id, not a list of running buses.** A list can only be
  unioned under merge, so a bus ticked by mistake could never be un-ticked — and
  the count could never reach zero, which is the one thing this record exists to
  make possible. Per-bus entries give last-write-wins per bus: no tick is ever
  lost, and a tick can be taken back.
- **Each entry's `at` comes from the server, not from this module.** `setRunning`
  sends the entry without a timestamp and the server stamps it (B1 step 7). That is
  what makes per-bus ordering independent of the device clock — contract §4.0 and
  §4.4 strategy **S** — and it is the whole reason a new store is safer here than a
  field on an existing one. **Do not stamp `at` on the client**; a client stamp
  would pass every test that did not look for it, so `test_v2_night.js` looks.
- **`running:false` is a real state and is not the same as absent.** Absent means
  nobody has decided about that bus tonight; `false` means somebody said it does
  not run. "Unknown" and "zero" must never look alike
  (`v2-foundation-ui.md §3.6`), and `ux §7` measures 5 and 6 read this record
  against `dutylog` and `gatechecks._byRole`, so a `false` must be queryable rather
  than inferred from silence.

### What it exports

```js
Night.dayKey(d?)                      // IST day key, the same one the duty board uses
Night.get(date)                       // the record, or null — null is "not yet decided",
                                      //   never "no buses run tonight"
Night.setRunning(date, busId, on)     // one bus; server stamps at/by; id nl-<date>
Night.running(date)                   // [busId] where running === true
Night.undecided(date, allBusIds)      // the honest third state, for the screen
```

### The checks it must add

| Check | Red when you |
|---|---|
| `test_v2_night.js` — two writers on one night produce **one** record (`nl-<date>`), and both ticks survive | change the id to include a device or a user |
| a bus can be un-ticked, and `running(date)` then excludes it — i.e. **the count reaches zero** | make the merge a union |
| `get()` returns null for a night nobody has touched, and null is distinguishable from "no buses run" | collapse the two |
| `undecided()` counts buses with no entry, separately from `running:false` | treat absent as false |
| the record carries no field v1 would need and the store is absent from v1's `STORES` | add the store to v1's lists |
| **no entry carries a client-stamped `at`** — asserted on the pushed payload, not on the stored record | stamp `at` locally; the store then inherits exactly the clock problem it was shaped to avoid |

**`DECISIONS.md §15` changes this module's consumer, not its shape.** The Duty
board split in two: **#9 Duty board** (`assignDriver`) keeps tonight's running list
and the seats; **#13 Gate round** (`gateCheck`) takes the ten items, the driver's
photograph and the hold decision. Thirteen screens, not twelve. So `nightlist` is
**written** only by #9 and **read** by both — #13 needs to know which buses it is
waiting on. The record, the id, the guard rules and the retention are all
unchanged; only `Night.running(date)` gains a second caller.

---

## B5 — the pull-cost proof **(order 2, after B1)**

**Owns:** `test_pullcost.py` (new), `scripts/measure-pull.py` (new).
Touches no source file. It exists to make B1's riskiest claim falsifiable.

**The claim.** Contract §3.4 adds per-record predicates
(`json_extract`/`->>`) to `pull()`'s two statements, and §8 asserts they filter a
page rather than a table because they are applied **after** the `store`/`rev`
predicates that `records_store_rev` serves. That is reasoning, not a measurement,
and `CLAUDE.md` is explicit: days have been lost here to fixes aimed at plausible
causes that were not the cause.

**What to measure, on the fleet-sized fixture** (80,700 rows, 40,000 GPS events —
build it if it is not in the tree, and say which it was):

| Budget | Figure | Source |
|---|---|---|
| `/pull` with nothing new | 0.1 ms of DB time (94 ms without `records_rev`) | commit `8647a37` |
| server first-screen pass | 195 ms (888 ms without `records_store_rev`) | `sync_server.py:570` |
| full first-sync drain | 536 ms, 19 requests | commit `8647a37` |
| next-rev allocation per push | 0.03 ms | commit `8647a37` |

Then the new number nobody has: the same drain **for a role with an own-rows
predicate** (a driver, a conductor), against the same drain without it. Report both
and the delta. If the predicate costs a scan, the finding is that §3.4 needs an
expression index and the lead hands the `CREATE INDEX CONCURRENTLY` to the owner —
which is a result, not a failure.

Also assert the thing that would silently undo all of it: **both `records` indexes
exist**. Without them a no-change poll is a full scan, and 100 devices × 15
polls/min was measured at 141 s of database time per minute before the index.

### The checks it must add

| Check | Red when you |
|---|---|
| `test_pullcost.py` — a drain for an own-rows role stays inside the budget above, measured not assumed, with the figure printed so a regression is readable | drop the predicate into a post-filter, or drop an index |
| the page never splits a rev group, and a first rev group over budget is still sent whole | trim mid-group — a device would then advance past records it never received, or ask for an oversized group for ever |
| a page emptied by redaction still advances the cursor (today's behaviour, deliberately kept) and `complete`/`tableMax` report it | make redaction hold the cursor — screens would then show a total while the sync is partial |

**Do not fail the build on a figure measured on this machine.** Every budget in
`03 §8` was taken on a Mac and the office runs Core 2 Duos on Chrome 109. Print the
machine beside the number, compare against the recorded figure as a ratio, and fail
only on a regression against the previous run on the same machine.

---

## Explicitly not in this cut

**`/uploads` and `/roster` (`LIVE-ISSUES.md` issue 7).** No slice touches
`/upload`, `/upload/delete` or `GET /uploads/<name>`. Fixing the open URL means
either a service worker attaching a token to every `<img>` or short-lived signed
URLs, and a wrong move stops photographs rendering on a hundred devices. It goes to
the owner as a v1 decision. Contract §12 records what v2 needs whoever fixes it to
cover: **Me alone hands out three upload URLs** (check-in selfie, own identity
documents, "something is wrong with my bus" photo), all own-record, all available
to every one of the eight roles including the two holding zero capabilities — and
any design has to survive both a URL stored inside a record that lives for ever and
the offline fallback where the photo rides inline as a `data:` URL.

**"Log service" (`LIVE-ISSUES.md` issue 8).** Not fixed here; the fix is a design
question, because making v1 require a photograph and a second signature for a
preventive service takes away a one-tap daily habit. What stage 3 does about it is
B1's write-path audit (contract §10): v2's own service log is specified to stop at
`done` with a photo, and the audit makes a v2 slice unable to copy the failing
shape by accident.

**`rev` allocation (`LIVE-ISSUES.md` issue 3).** Contract §9(d) is the verdict and
the reasoning. Hand over, do not build.

---

## Not a backend slice, and not dropped

`DECISIONS.md §9` assigns stage 3 **one measurement**: the "200 dense desk rows
inside 250 ms" budget is a placeholder set on a developer's Mac, and every density
rule in `v2-foundation-ui.md` is sized against it. *"Stage 3 takes the reading on
an actual office PC and the budget moves to whatever that says. Until then it is an
assumption wearing a number's clothes."*

It is a **front-end** reading and it needs a Windows 7 / Chrome 109 machine in the
office. No backend slice can take it, and this session has no such machine. It is
named here, with the frontend lead and the owner, so it is not discovered unassigned
in stage 5 — it is the one number in the plan that can move a published budget.

Likewise unassigned and recorded in contract §9(e) rather than silently dropped: no
documented database backup; no server test in CI, so these 48 suites run only by
hand; two uncoordinated AI schedulers at Opus pricing with non-atomic counters;
`GET /uploads/<name>` and `GET /roster` need no login; the login lockout is
SELECT-then-INSERT, so a parallel burst can all read "under the limit" — which for
a 4-digit PIN matters more than the hash does.

---

## Review, per slice

From `backend-lead.md`, unchanged: it matches the contract; auth is enforced
**server-side** and there is a test proving the forbidden role is refused; the gate
is green; and a test fails when you break the slice's own behaviour. Escalation is
the same as any lead — back once with specifics, then fresh on a stronger model,
then report up.

One addition for this stage, because it is the rule the whole build turns on:
**every slice is also reviewed against v1 still working.** The question is not "did
the tests pass" but "which v1 screen reads what this changed". Contract §6 is the
checklist, and every item on it looks harmless in a diff.

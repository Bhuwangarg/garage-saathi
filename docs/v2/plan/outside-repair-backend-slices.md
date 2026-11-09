# Outside repair — backend slices

Stage 3, server and sync side. **The cut, not the build.** This session does not
dispatch builders; the dispatching session does, from the table below.

Read `docs/v2/plan/outside-repair-contract.md` first. It is the promise the frontend is
building against. Every brief here implements a part of it and **may not contradict it**.
If a builder finds the contract wrong, it comes back to the lead and §12 of the contract
records the change — a builder never changes the contract by changing the code.

---

## The table

| Order | Slice | What it is | Files it **owns** (nothing else may touch them) |
|---|---|---|---|
| **0** | **OB1 — Auth, the read boundary, and the entitlement rewind** | Who may receive a gate pass, derived from who may send a unit out; and the cursor rewind that makes a widening actually arrive | `v2_perms.py`, `v2/sync.js`, `test_outside_readscope.py` ✱, `test_readscope.py`, `test_pullscope.py` |
| **1** | **OB2 — The server write guard** | The away state frozen to two roles on every card state; the gate-pass state machine; the close gate; the two role lists held equal | `sync_server.py`, `v2_outside.py` ✱, `test_outside_guard.py` ✱, `test_outside_roles.py` ✱, `test_guardwrite_v2.py`, `test_thief.py`, `test_servicelog.py` |
| **1** | **OB3 — The stores: shape, one transaction, fixture** | The record shapes on the device, the **one** transaction every outside write goes through, the three fixture rows nothing has ever drawn, and the test that proves the frontend's writes used it | `v2/db.js`, `test_v2_outside_db.js` ✱ |
| **2** | **OB4 — The two numbers this cut asserts** | The push delta and the crew manager's drain, measured on the fleet-sized fixture instead of asserted | `scripts/measure-outside.py` ✱, `test_outside_cost.py` ✱ |

✱ = new file. **16 files, each appearing in exactly one row.** Check it mechanically
before dispatch, not by eye — and check them against
`docs/v2/plan/outside-repair-frontend-slices.md` §1 as well: the two cuts are landing in
one tree. **No file is claimed by both**, now that contract §11 has moved the local write
path (§12 of the contract records it; the frontend lead was told in the same breath).

### Dependencies

```
OB1 ──┬── OB2 ──── OB4   (OB4 measures what OB2 built)
      └── OB3           (OB3's putMany is what the frontend's OR2 writes through)
```

- **OB1 is order 0 and everything is written against it.** It exports the one decision
  about who may read a pass and the one digest that makes a widening arrive.
- **OB1's client half is written against the contract, not against OB2's code.**
  `v2/sync.js` consumes `readScope` from the login response, which contract §2.3
  specifies and OB2 wires in. Its tests use a fake login payload, so OB1 goes green
  before OB2 lands, and the absent-field fallback means the two can land in either
  order without a broken tree. Same device as `v2-backend-slices.md`'s B1/B2 seam.
- **OB3 consumes nothing from OB2.** Both are order 1 and genuinely parallel: no shared
  file, and OB3 builds the record shapes from contract §4.
- **OB4 is order 2** because it needs OB2 in the tree to measure it.
- **OB3 lands before the frontend's OR2 starts writing.** `DB.putMany` is the transaction
  OR2's `issueWrite`/`returnWrite` must go through (contract §11), so it has to exist
  first; OB3 is order 1 and OR2 is their order 1, which is tight. If OR2 is dispatched
  first, it builds against the signature in contract §11 and not against OB3's code.
- First integration point for the integrator (stage 4): OB2 + the frontend's OR2 end to
  end against a local server. Two named seams: **contract §6.3's refusal strings** (the
  server produces them, the client surfaces them) and **`DB.putMany`** (OR2 calls it,
  OB3's test proves it called it once).

### Ground rules every brief inherits

- **No builder runs any git command.** You work concurrently in one tree; the integrator
  commits. Do not stage, commit, branch, stash or push.
- `scripts/run-tests.py` must stay green. It auto-discovers `test_*.py` and `test_*.js`
  **at the repo root only** — it does not recurse into `v2/`. That is why the JS suites
  are `test_v2_*.js` at the root. A test in `v2/` never runs, and a test nobody runs is
  not a test.
- Every Python test pops `DATABASE_URL`, `TURSO_URL` and `TURSO_DATABASE_URL` and points
  `DB_PATH` at a tempfile. Copy `test_readscope.py`'s header exactly. **No test reaches
  production.** Call the server's functions in-process; do not bind a port. If you think
  you need one, you need an entry in `run-tests.py`'s `PORT_BOUND` — that file is owned
  by no slice, so **ask the lead** rather than editing it.
- `scripts/predeploy-gate.sh` and `scripts/check-css-floor.sh` are hard gates.
  **Never weaken or delete a check to make a change pass.** Where a brief below flips an
  existing assertion, it flips it to assert the *new* boundary with the owner's decision
  named in the check — it never deletes the check.
- **After adding a check, break the thing it covers and confirm it goes red.** Each brief
  names the check and the mutation. A check that cannot fail is decoration.
- **Measure before you claim.** If you report a number you did not measure, say so in the
  same sentence.
- Never print, log, commit or paste a secret, token, PIN or connection string.
- **Never run a production write or a production deploy.** Contract §9 is the hand-over
  list; add to it rather than acting.
- v1 stays live on ~100 phones against the same database throughout. Anything v2 writes
  stays legible to v1, and contract §4.2's "absent means keep, not clear" is the rule
  that makes that true for this feature.

---

## OB1 — Auth, the read boundary, and the entitlement rewind **(order 0)**

**Owns:** `v2_perms.py`, `v2/sync.js`, `test_outside_readscope.py` (new),
`test_readscope.py`, `test_pullscope.py`.
**Touches nothing else.** In particular not `sync_server.py` — `_never_for` and
`redact_for` already delegate to this module (`sync_server.py:4264`, `:4293`), so the
read change is a table change and nothing more.

**Spec:** contract §1, §2.3, §3 (all of it), §8 row 4.

**Why it is first.** Decision 3 gives a crew manager and a storekeeper the slip. Until
`gatepasses` is readable by the crew manager the feature cannot work for them, and until
the cursor rewinds they will never see a pass that existed before the deploy — silently,
with nothing anywhere saying so. Every other slice assumes this is settled.

### What it exports

```python
PAPER_FOLLOWS_UNIT = ("gatepasses", "components")   # decision 3, as one rule
STORE_READ_ROLES["gatepasses"] = STORE_READ_ROLES["components"]   # one list, two keys
OUTSIDE_CARD_FIELDS                 # the frozen set, contract §6.1 — OB2 consumes it
def may_set_outside(role) -> bool   # {owner, supervisor}. THE single place that decides
def assert_write_roles_follow(write_roles)  # raises if the two write sets drifted
def read_scope_digest(role) -> str  # 8 lowercase hex, sha256, stable across processes
```

- `may_set_outside` and `OUTSIDE_CARD_FIELDS` live here rather than in the guard for the
  reason the module exists: the decision is read as data, and OB2 consumes it instead of
  restating it. **Two copies of a permission rule are how they drift apart** — that
  sentence is already in this file's docstring about `_never_for`.
- `read_scope_digest` must use `hashlib.sha256` over a canonically built string (sorted
  store names, each with an own-rows flag, then sorted field-redaction keys for the
  role). **Never Python's `hash()`**: it is salted per process by `PYTHONHASHSEED`, so
  the digest would change on every cold start and every device would rewind on every
  login. Contract §2.3 says this; it is the trap in this slice.

### The client half (`v2/sync.js`)

Store `readScope` from the login response beside `pullScope`. When a stored value exists
and differs: rewind **`lastRev` and `lastRevDeferred` together** and clear `pullSkips`.
When the field is absent, change nothing and keep today's `SCOPE_V` comparison.

`03 §9.4` is why both cursors move together: a reset that moves one and not the other
loses exactly the stores it was meant to re-read. **Do not bump `SCOPE_V`** — that
rewinds every device of every role for a widening that affects one, and contract §8 holds
this slice to the opposite.

### Checks to add, and the mutation that must redden each

1. `test_outside_readscope.py` — **a crew manager and a storekeeper receive gate
   passes**, as an exact set, and `redact_for` returns a full record (no `_redacted`).
   *Mutation:* drop `crewmanager` from the derivation ⇒ red.
2. The same file — **a mechanic, a driver, a conductor and the office receive zero gate
   pass records, and `gatepasses` is in `never_for` for each of them**, so the SQL skips
   the store. Assert both halves: the record is withheld *and* the store is skipped.
   *Mutation:* add the store back to any of those roles ⇒ red.
3. The same file — **`read_roles("gatepasses") == read_roles("components")`** and
   `assert_write_roles_follow` raises on a drifted dict. *Mutation:* make the two read
   sets separate literals that differ by one role ⇒ red.
4. The same file — `read_scope_digest` is **stable** across two calls in different
   subprocesses with different `PYTHONHASHSEED`, and **changes** when a role gains a
   store. *Mutation:* implement it with `hash()` ⇒ red.
5. `test_readscope.py` — update the per-role exact sets for the one new row (line 57-59
   and the store-role list near line 286). It asserts **both directions** on purpose:
   nothing arrives that the role is not entitled to, **and** everything the role is
   entitled to still arrives. Keep both.
6. `test_pullscope.py` — derived, so it should stay green. If it reddens, it is yours;
   nobody else touches `v2_perms`.
7. A client check in whichever existing v2 sync suite you can assert from without
   editing another slice's file — **if you cannot, say so in your report rather than
   editing `test_v2_stale.js`**: a changed `readScope` rewinds both cursors; an absent
   one rewinds neither.

**Report:** the exact role sets before and after, and whether anything other than
`gatepasses` moved (nothing should).

---

## OB2 — The server write guard **(order 1)**

**Owns:** `sync_server.py`, `v2_outside.py` (new), `test_outside_guard.py` (new),
`test_outside_roles.py` (new), `test_guardwrite_v2.py`, `test_thief.py`,
`test_servicelog.py`.
**Touches nothing else.** Not `v2_perms.py` (OB1's), not anything under `v2/`.

**Spec:** contract §2.2, §2.5, §4.1, §4.2, §4.3, §5, §6 (all of it), §7, §8 rows 1-2.

**Why one slice and not three.** The three rule sets all live inside `_guard_write` in
one 6,700-line module, and so do `WRITE_ROLES`, `_has_proof` and `/health`. Three
builders in the hottest function in the system, in parallel, during a rebuild, is a worse
bet than one builder doing one job family — and *what the server permits* is one family,
which is what a slice is. The same reasoning is written out in `v2-backend-slices.md`.

### What it builds

1. **`WRITE_ROLES["gatepasses"]` from the same literal as `"components"`** — one list,
   two keys — and `v2_perms.assert_write_roles_follow(WRITE_ROLES)` called at import.
   Decision 3. Keep the existing comment's spirit and replace its content: the old one
   explains the restriction that is being removed, and a comment describing a rule the
   code no longer has is worse than none.
2. **`v2_outside.py`**, pure functions, no I/O of its own:
   ```python
   OUTSIDE_SET = v2_perms.OUTSIDE_CARD_FIELDS      # consumed, never restated
   def norm_serial(s) -> str                        # upper, strip spaces and hyphens
   def guard_jobcard_outside(data, actor, old) -> str | None      # contract §6.1
   def guard_gatepass(data, actor, old) -> str | None             # contract §6.2
   def has_proof(data, passes_of_card) -> bool                    # contract §7
   def derive_refurb_count(history) -> int                        # contract §4.3
   def merge_history(old_history, new_history) -> list            # union by id, then (type, at)
   def external_cost_of(passes_of_card) -> float | None           # contract §5
   ```
   `passes_of_card` is passed **in** by the caller, so the module stays free of the
   connection and the tests need no database.
3. **The `jobcards` guard** per contract §6.1: the outside set is the owner's and the
   supervisor's on **every** card state (today `sync_server.py:1698` freezes it only on
   an already-`verified` card, which is the hole UX §6 names); compare values so a
   carry-over is not refused; absent means keep, not clear; `billPhotos` capped at 4;
   `closeNoBillReason` frozen after close except for a manager.
4. **The `gatepasses` guard** per contract §6.2: the one-way status machine, the required
   fields, the frozen identifiers, `issuedBy`/`returnedBy` from the token,
   `serialMismatch` **derived** and overwritten, no delete, a returned pass correctable
   only by a manager, a byte-identical replay `applied`.
5. **`components`**: `refurbCount` derived from the merged history; `history` unioned by
   entry `id` with the `(type, at)` fallback for v1-written entries.
6. **`externalCost` recomputed** for an outside card that names a pass, per contract §5 —
   and **measured by OB4 against the 5 ms budget**. If it misses, apply the fallback the
   contract already names (recompute on the close transition only) and report the
   residual; do not improvise a third answer.
7. **`_has_proof` replaced** per contract §7, with the bounded pass lookup, only on the
   close transition.
8. **`/health` gains `permsOk`** (contract §2.5). Always 200; the truth is in the body.

### Checks to add, and the mutation that must redden each

1. `test_outside_guard.py` — **the forbidden role is refused, server-side.** A mechanic
   token and a storekeeper token each setting `outside`, `outsideCity`,
   `externalVendor`, `externalCost`, `billPhotos` and `closeNoBillReason` on an **open**
   card: refused, with the §6.3 string. *Mutation:* restore the `prev == "verified"`
   condition ⇒ red. **This is the check the lead reads first.**
2. Same file — the same storekeeper write that **carries the stored outside values
   unchanged applies**, so part issuing on an outside card still works. *Mutation:*
   refuse on presence instead of on change ⇒ red.
3. Same file — a v2 write that omits `outsideLat`/`outsideLng` **does not erase them**.
   *Mutation:* drop the carry-over ⇒ red. (This is v1 staying alive.)
4. Same file — the gate-pass machine: `returned → out` refused; a second different
   return refused; a byte-identical replay `applied`; `serialMismatch` **derived** —
   push a return claiming `serialMismatch: false` with a different serial and assert the
   stored record says true. *Mutation:* trust the body ⇒ red.
5. Same file — a return **with no pass** clears a piece stuck at `sent-out`: state
   `in-service` on its bus, `refurbCount` incremented **once** across two identical
   pushes, one `return` history entry. *Mutation:* increment instead of derive ⇒ red.
6. Same file — `externalCost` after two passes of one card return from two devices is
   the **sum**, not the last one. *Mutation:* take the body's value ⇒ red.
7. `test_outside_roles.py` — both halves of contract §3.2's equality, and `permsOk`.
   *Mutation:* remove one role from `WRITE_ROLES["gatepasses"]` ⇒ red, and `permsOk`
   false.
8. `test_servicelog.py:74` — **flip it:** an outside card with no bill and no typed
   reason is refused at `done`; with a bill photo it closes; with a typed reason it
   closes and the reason is on the stored card. Name decision 1 in the check text.
9. `test_thief.py:285-302` — **flip the storekeeper rows and keep the rest.** A
   storekeeper and a crew manager may now write and return a pass (decision 3); a
   **mechanic, driver, conductor and office still may not**, and that half of the test
   must stay and must still pass. Do not delete the file's framing: it is the one suite
   that reads as an attacker.
10. `test_guardwrite_v2.py` — it asserts the old proof sentence (line 168) and the
    `gatepasses` **F** merge (line 539). Update the proof assertion to the new rule and
    keep the merge assertion green.

**Report:** every refusal string you implemented against contract §6.3 (they must match
exactly — they are what a person reads), and the measured push delta if OB4 has landed.

---

## OB3 — The stores: shape, one transaction, fixture **(order 1)**

**Owns:** `v2/db.js`, `test_v2_outside_db.js` (new).
**Touches nothing else.** Not `v2/outside.js` or `v2/ui/passes.js` (the **frontend's**,
contract §11), not `v2/sync.js` (OB1's), not `test_v2_browserpath.js` or
`test_v2_boot.js` (not this cut's).

**Spec:** contract §4 (all of it), §4.4, §5, §8 row 6, §10, §11.

### What it builds

1. **The record shapes documented in the store comments**, per contract §4.1-§4.3: the
   `gatepasses` fields including `jobId`, `jobcards`'s four new fields with the cap of 4
   on `billPhotos`, and `components.history[].id` / `[].passId`. `v2/db.js` is where a
   shape is described for the next reader; describe them there and nowhere else.
2. **`DB_VERSION` stays 29.** No store is added, so `onupgradeneeded` has nothing to do.
   **Do not bump it** and do not add an index: v2 reads `getAll()` plus a JS filter
   everywhere, and `gatepasses` is the 24th of 41 stores and small. A first index on one
   store is a pattern to maintain for a store that does not need it.
3. **`DB.putMany(entries)` — the one new API, and the reason this slice exists.**
   ```js
   // entries: [{store, obj}, …]  possibly spanning several stores
   // ONE readwrite transaction over the stores named. One outbox entry per record.
   // One dirty mark per STORE (not per row) and one onChange per store.
   // The existing outboxbase rebase still applies to the R fields (components.state).
   DB.putMany(entries) -> Promise<void>
   ```
   A return writes the pass, the piece and the card. Three `DB.put` calls are three
   transactions; a per-row cursor is an event-loop turn each. **Both shapes have already
   shipped in this repo and both had to be undone** (`03 §9.17`, `03 §9.18`). This is the
   transaction the frontend's `Passes.issueWrite`/`returnWrite` must go through
   (contract §11), so **it must exist before they write**, and its signature is already
   published for them to build against.
4. **The fixture rows of contract §10**, added in one `bulkPut` per store inside the
   existing demo-seed branch — not a per-row loop for a new store. `gp-1` (out, 21 days,
   from `j3`), `gp-0` (returned, with a bill photo, from a piece, `jobId: null`), `j4`
   (away in Jaipur, no vendor yet), `j3` gaining the pass pointer, and **`c-a1` left
   exactly as it is**: pass-less at `sent-out`, because the piece that left before
   passes were kept must stay returnable (UX §6). Both pass numbers must match contract
   §5's format `^OJ-\d{6}-[A-Z0-9]{4}$`.

### Checks to add, and the mutation that must redden each

1. `test_v2_outside_db.js` — **`putMany` opens exactly one transaction** for a
   three-store write, marks exactly those three stores dirty, and fires `onChange` once
   per store. Count the transactions with a counting wrapper, not by reading the code.
   *Mutation:* implement it as a loop of `DB.put` ⇒ red.
2. Same file — the three stores it wrote are dirty and **nothing else is**. *Mutation:*
   mark everything dirty ⇒ red. (Reading all forty stores after a write cost 884 ms per
   tap; the dirty set is what fixed it, and a reader clears only what it read.)
3. Same file — one outbox entry per record, and the `outboxbase` snapshot exists for
   `components.state`. *Mutation:* skip the rebase ⇒ red.
4. Same file — **the three requirements contract §11 places on the frontend's write
   functions, asserted here because this is the slice that owns the proof.** Load
   `v2/ui/passes.js` (read it; never edit it) and assert: `returnWrite` performs
   **one** `putMany` and no `DB.put`; calling `issueWrite` **twice with one draft**
   leaves one `gatepasses` row, one number and one history entry; a return with no pass
   still writes and puts `cost`/`billPhoto` on the history entry. *Mutation:* make
   `issueWrite` mint its own id ⇒ red; make it call `DB.put` three times ⇒ red.
   **If `v2/ui/passes.js` has not landed yet, skip-with-a-reason rather than passing
   silently** — a test that quietly passes on a missing file is the decoration this repo
   has been bitten by. Report the skip.
5. Same file — the fixture: `gp-1` is 21 days old and `status:'out'`; `gp-0` is
   `returned` with a `billPhoto` and `jobId: null`; `c-a1` is `sent-out` with **no pass
   anywhere referencing it**; both pass numbers match the regex. *Mutation:* age `gp-1`
   to 3 days ⇒ red (and the Attention row stops being drawable, which is the whole point
   of that row).
6. `DB_VERSION` is still 29 and `STORES` gained no key. *Mutation:* bump it ⇒ red.

**Report:** the transaction count you measured for a three-store write; whether check 4
ran or skipped; and whether adding the fixture reddened `test_v2_browserpath.js` or
`test_v2_boot.js`. **If it did, do not edit either file** — they belong to the frontend
cut and to the integrator. Report it to the lead.

---

## OB4 — The two numbers this cut asserts **(order 2)**

**Owns:** `scripts/measure-outside.py` (new), `test_outside_cost.py` (new).
**Touches nothing else.** It reads OB2's code; it does not edit it.

**Spec:** contract §8.

**Why it exists.** Contract §5 puts a bounded `gatepasses` scan inside `/push`, the one
endpoint every device calls every four seconds, and contract §2.3 claims a rewind that
costs one role's devices instead of the whole fleet. Both are claims. **Three separate
rounds of "the login is slow" were each spent on a layer that turned out not to be the
cost**, which is why the number comes before the opinion.

### What it builds

1. `scripts/measure-outside.py` — against a fleet-sized local fixture (80,700 rows,
   2,000 `gatepasses`, built by the script, never production):
   - `/push` of an outside job card, with and without the `externalCost` recompute:
     report both medians and the delta.
   - `/push` of a record in an unrelated store: the delta must be **0 ms**.
   - the close transition's bounded pass lookup, separately — it runs on one write in a
     card's life and must not be confused with the recompute.
   - the drain a crew manager performs after the rewind: pages, bytes, rows.
   It prints a table and **no secret and no connection string**, and it never runs
   against production.
2. `test_outside_cost.py` — the budgets as a check, fastest of three runs, so a
   regression reddens rather than being noticed later: the push delta under the
   contract's 5 ms, and the unrelated-store delta at zero.

### The check and its mutation

*Mutation:* make the recompute scan every store instead of `gatepasses` ⇒ red. Mutation
for the zero-delta check: call the recompute for every store ⇒ red.

**Report:** the measured numbers, the machine they were measured on, and **whether the
budget held**. If the push delta misses 5 ms, say so plainly and apply the fallback
contract §8 already names (recompute on the close transition only, residual reported) —
the contract chose the fallback in advance precisely so this slice does not have to
invent one under time pressure. If any number here contradicts the contract, the contract
is what changes, through the lead, in §12.

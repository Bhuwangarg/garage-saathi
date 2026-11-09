# Outside repair — the backend contract

**Stage 3 (build), server and sync side. Slug: `outside-repair`.**
Published 2026-11-09, **before any builder was dispatched.**
Inputs: `docs/v2/plan/outside-repair-ux.md` (ready for stage 2, the owner's three
decisions recorded), `docs/v2/plan/outside-repair-ui.md` (ok = true),
`docs/v2/inventory/03-data-and-sync.md`, `docs/v2/inventory/04-server-and-integrations.md`,
and the code the feature lands on. It does not restate `docs/v2/plan/v2-contract.md`;
where that contract already decides something (the read boundary's mechanism, the
staleness refusal, the merge strategies) this one names the section and adds the delta.

**This file is a promise.** The frontend lead builds against it. Anything that changes
after publication is in §12 and is told to them in the same breath — not left for them
to find.

---

## 0. The seven things to read first

1. **No new HTTP route.** Every write in this feature rides `POST /push` and every read
   rides `GET /pull`. The bill photo rides the existing `POST /upload`. One response
   field is added to `POST /auth/login` (§2.3) and one to `GET /health` (§2.5).
2. **Three stores change shape, no store is added, `DB_VERSION` stays 29.**
   `gatepasses` gains `jobId`; `jobcards` gains `billPhotos`, `closeNoBillReason`,
   `gatePassNo`, `gatePassId`; `components` gains `history[].id` and `history[].passId`.
   No new object store means no upgrade, and no index is added — `gatepasses` is the
   24th of 41 stores and small (§8).
3. **Two role lists change, both are the owner's policy, both are LIVE behaviour
   changes.** `gatepasses` write roles become `components`' write roles (decision 3);
   the close gate becomes the vendor's bill or a typed reason (decision 1). The server
   half of each ships on the owner's own deploy, not ours. §9.
4. **The away state is `{owner, supervisor}` and is frozen for every other role on
   every card state, not only a verified one.** Today `sync_server.py:1698` freezes
   `outside`, `outsideCity`, `externalVendor` and `externalCost` only when a card is
   already `verified`, so a mechanic's phone can set them on an open card and the server
   accepts it (UX §6). That is the security half of this feature and it lands first.
5. **Deny by default, and the scope derived from it.** `gatepasses` reaches exactly the
   four roles that may write it, **derived** from `components`' list rather than typed
   twice, with the equality asserted at import. A mechanic, a driver, a conductor and
   the office receive **zero** gate-pass records and `/pull`'s SQL skips the store for
   them, so no device spends a page being handed rows redaction then empties (§3).
6. **What the read boundary cannot do here, said rather than implied.** A role that
   *writes* a store cannot be sent a `_redacted` copy of it — a redacted record is
   dropped from the outbox client-side and refused server-side (`03 §9.8`), so field
   redaction on `components` or `jobcards` for a storekeeper would cost them the ability
   to write the record at all. The vendor's money is therefore bounded by **the write
   freeze and by withholding the pass**, not by stripping fields. §3.4 names the exact
   residual so the owner can see it.
7. **Three writes are only idempotent if the client mints an id before the save, not
   at it.** The pass id and its number, and the piece's history-entry id, are minted
   **when the sheet opens** (§5) — a requirement on the frontend's write functions, §11,
   with the backend's test for it. A double tap on a slow machine is the normal case, and
   a random id minted at save means two slips with two numbers for one unit.

---

## 1. Transport, auth, roles

Unchanged from `v2-contract.md` §1. Bearer session token, 12 h, HMAC. Eight roles.
`/v1/<path>` stays an alias. The four roles this feature touches:

| Role | What this feature gives it | What it still may not do |
|---|---|---|
| `owner` | everything | — |
| `supervisor` | everything | — |
| `store` | issue a pass, receive a unit back, write the piece | mark a bus away; set the outside cost on a card; browse a vendor's bill in the piece register (§4.3) |
| `crewmanager` | the same four | the same, plus it is newly entitled to **read** `gatepasses` (§3.3) |
| `mechanic`, `driver`, `conductor`, `office` | nothing | receive no gate pass at all; cannot set any outside field on any card |

`outsideJob` on the client stays `['owner','supervisor']` (UX §8). The pass's own client
capability is the frontend's file (`v2/caps.js`) and is **not** in this cut; §11 names
the seam and the value it must hold.

---

## 2. Endpoints

| # | Method | Path | Auth | Roles | What changes here | Idempotent? |
|---|---|---|---|---|---|---|
| 1 | GET | `/pull` | Session | any role, output scoped per role | `gatepasses` reaches a fourth role; the store is skipped in SQL for the other four | yes (cursor) |
| 2 | POST | `/push` | Session | per-store matrix | `gatepasses` write roles; the jobcard outside freeze; the gate-pass state machine; the close gate | per §5 |
| 3 | POST | `/auth/login` | none (PIN in body) | anyone | response gains `readScope` (§2.3) | unchanged |
| 4 | POST | `/upload` | Session | any role | unchanged; the bill photo uses it | no — a new URL per call (§5) |
| 5 | GET | `/health` | none | anyone | body gains `permsOk` (§2.5) | yes |

Nothing else is touched. No `PUT`, no `DELETE`, no new path, no new auth principal.

### 2.1 `GET /pull` — the delta

Request and response envelope unchanged (`03 §1.3`). The delta is who receives
`gatepasses`:

```
read_roles("gatepasses")  ==  read_roles("components")   # asserted at import, §3.2
                          ==  {owner, supervisor, store, crewmanager}
```

- For the other four roles `gatepasses` is in `never_for(actor)` and the page's SQL
  excludes it, so the cursor steps past it without reading it. **This is the rule a
  pull must not break:** a new device must not be handed pages that redaction empties
  (`03 §9.3`, and the `_never_for` docstring is where that failure is written down).
- `gatepasses` carries no PII and no own-rows narrowing: a storekeeper who may issue a
  pass may read every pass. There is no per-record rule and none is invented.
- **Error cases:** unchanged — 401 on a dead session, 429 with `retryAfterSec` over the
  sync bucket, and a non-integer `since` is still the pre-existing uncaught `ValueError`
  (`04 §3.2`); this feature does not fix it and does not make it worse.

### 2.2 `POST /push` — the delta

Envelope unchanged. Per-record order unchanged (`04 §3.2`, steps 1-7). What changes is
step 1 for one store and step 5 for three:

- **step 1, `may_write`:** `WRITE_ROLES["gatepasses"]` is assigned from the same literal
  as `WRITE_ROLES["components"]` — one list, two keys — and `v2_perms` asserts they are
  equal at import. Decision 3's words: *whoever may send it out may paper it.*
- **step 5, `_guard_write`:** three new rule sets, §6. A guard that rewrites the payload
  is re-stamped `max(upd+1, now)` by the existing line, so the author's own device pulls
  the correction (`03 §9.11`). Every correction in §6 relies on that and none of them
  invents a second mechanism.
- **Response:** unchanged shape. New refusal reasons are the exact strings in §6.3; they
  are prose sentences, so v2's client quarantines them and shows them, exactly as today.
  `reason:"stale"` keeps its special meaning (`v2-contract.md` §4.3) and is not used by
  anything here.

### 2.3 `POST /auth/login` — one new response field

```
200 { token, user:{id,name,role}, ..., readScope: "<8 lowercase hex>" }
```

`readScope` is a digest of **what this role may read**, so a device can tell that its
entitlement widened and rewind its cursors — instead of every device in the fleet
re-draining because one role gained one store.

- Computed by `v2_perms.read_scope_digest(role)`: `sha256` over a canonical string built
  from the sorted store names the role may read, each with a flag for own-rows-only, and
  the sorted field-redaction keys that apply to it. First 8 hex characters.
- **It must be `sha256`, never Python's `hash()`** — `hash()` is salted per process by
  `PYTHONHASHSEED`, so the digest would change on every cold start and every device
  would rewind on every login. That is the trap this field could create, so it is named
  here rather than discovered in production.
- **Client (`v2/sync.js`):** store it next to `pullScope`. When the stored value exists
  and differs, rewind **both** `lastRev` and `lastRevDeferred`, together, and clear
  `pullSkips` — `03 §9.4`: a cursor reset that moves one and not the other loses exactly
  the stores it was meant to re-read. When the field is **absent** (an older server), do
  nothing and fall back to today's `pullScope`/`SCOPE_V` comparison. A narrowing also
  changes the digest and also rewinds; that costs one re-drain and is correct.
- v1's login reads named keys and ignores an extra one; this field is safe for the ~100
  live phones and changes nothing for them.
- **Why not bump `SCOPE_V` to `v3`:** it is one line, and it rewinds every device of
  every role for a widening that affects one role. The measured cost of a full drain is
  536 ms of server time and 50-90 s on the device *on a Mac* (`03 §8`), and the office
  machines are Core 2 Duos. §8 holds this to a number.

### 2.4 `POST /upload` — unchanged, and what the contract requires of its callers

The bill photo is uploaded through the existing route and the record holds the returned
URL. If the upload fails the inline `data:` URL stays in the record and travels with it
(`03 §4.7`), which is why `gatepasses.billPhoto` is **one** photo and
`jobcards.billPhotos` is capped at **4** (§4.2): bounded by construction, not by hope.
**The return must save with the photo still in flight** (UI §3.3) — the man at the gate
does not wait — so no guard in §6 may require `billPhoto` to be a URL.

### 2.5 `GET /health` — one new boolean

Body gains `permsOk: true|false`: true only when the two derived equalities in §3.2 and
§2.2 hold. Always 200, as today — **the truth is in the body.** The owner's post-deploy
check reads the field; a check that reads only the HTTP status has already stayed green
through the outage it existed to catch, which is why this is a field and not a status.

---

## 3. The read boundary

Mechanism unchanged: `v2_perms.STORE_READ_ROLES` is the one table, and `_never_for` and
`redact_for` are both **derived** from it (`v2-contract.md` §3.2; `sync_server.py:4293`
and `:4264` already delegate). This feature adds no second place where a read rule is
written.

### 3.1 The matrix delta

| Store | Was | Becomes | Why |
|---|---|---|---|
| `gatepasses` | `{owner, supervisor, store}` | `{owner, supervisor, store, crewmanager}` | decision 3. Derived from `components`, not typed |
| everything else | — | unchanged | — |

### 3.2 Derived, and asserted at import

`v2_perms` exports the rule rather than its result:

```python
# "Whoever may send a unit out may paper it" — the owner's decision 3, as one rule.
PAPER_FOLLOWS_UNIT = ("gatepasses", "components")

STORE_READ_ROLES["gatepasses"] = STORE_READ_ROLES["components"]   # one list, two keys

def assert_write_roles_follow(write_roles):
    """Raise if the two write-role sets have drifted. Called by sync_server at import."""
```

- The read sets are **the same object**, so they cannot drift. The write sets live in
  `sync_server.WRITE_ROLES` and are checked by the function above, which raises at import
  — a loud failure in CI and in a test, and `permsOk` in `/health` for anyone who cannot
  read a traceback.
- **This is the rule UX §8 asks for**, both halves: server
  `WRITE_ROLES["gatepasses"] == WRITE_ROLES["components"]`, and the client half
  (`gatePass == manageComponents`) which is the frontend's, §11.
- Break it by removing one role from either side: `test_outside_roles.py` goes red and
  `permsOk` goes false. That mutation is named in the slice brief.

### 3.3 The rewind this widening needs

A crew manager's device has a `lastRev` that has already stepped past every existing
gate pass, and the server takes its cursor **before** redaction (`03 §9.3`). Without a
rewind the crew manager receives no pass that existed before the deploy, for ever, with
nothing anywhere saying so. §2.3 is that rewind, and it is scoped to the role whose
digest changed.

### 3.4 What redaction cannot do here, and the residual

Three roles both **write** and must not **browse** some part of this data. A redacted
record is refused on push and dropped from the outbox, so these two cannot both be true
of one record. The honest positions:

| Want | Mechanism | Enforced where |
|---|---|---|
| `store`, `crewmanager` must not browse vendor bills in the piece register (UX §4, Store row) | The amount and the photo **are not on the piece**: they live on the `gatepasses` record (§4.1), which is the single capture decision UX §5 already made. `components.history` carries `passId` and no money whenever a pass exists | By the record shape, §4.3. Nothing to redact, nothing to hide, nothing for a client to be trusted with |
| A mechanic must not know which vendor holds the unit (UX §4, Jobs row) | `gatepasses` is refused to them store-wide (§3.1), so the pass, the serial, the bill and the vendor on the slip never reach them | `redact_for`, server-side |
| A mechanic must not set or change an away state or an outside cost | The write freeze, §6.1, on **every** card state | `_guard_write`, server-side |
| **Residual, named for the owner:** a mechanic's own card still carries `externalVendor` and `externalCost` in the copy their device receives | Not fixed. Field-redacting `jobcards` for a mechanic would mark the record `_redacted` and cost them the ability to write their own card's photos and hours — the whole of their job | Nowhere. §9(c) asks the owner whether it is worth the only real fix (moving outside money off the card into a store a mechanic does not read, which v1 cannot read either) |

A role that may not see a **store** is refused server-side. A **field** on a store the
role writes is a different question with a different answer, and conflating the two is
how a boundary gets claimed that does not exist.

---

## 4. The stores

### 4.1 `gatepasses` — the slip

**Writers:** owner, supervisor, store, crewmanager (§3.2). **Readers:** the same four.
**Retention:** client never pruned; server stored for ever, no send window — the slip is
the evidence a unit left the premises, and the store is small (§8).
**Nobody deletes a pass, owner included.**

```
{
  id            'gp-…'   minted on the device WHEN THE SHEET OPENS (§5)
  no            'OJ-YYMMDD-XXXX'  date first, 4-char tail from the record id,
                         minted with the id, never a counter (UX §6: two supervisors
                         on alternate shifts, both offline, must not collide)
  status        'out' | 'returned'          one way only
  vendorName    string, required, <= 120
  busId         string, required            decision 2: nothing leaves that belongs to no bus
  jobId         string | null   NEW         the card it was issued from; null when the
                                            door was the piece on Fuel & tyres
  componentId   string | null               the tracked piece, when there was one
  regNo         string  }
  engineNo      string  }  COPIED at issue, frozen after it (03 §3, store 24:
  chassisNo     string  }  "identifiers are copied, not referenced")
  unitName      string, required, <= 80
  unitSerial    string, may be empty        an untracked unit may carry no stamped number
  remark        string, <= 500
  issuedBy      string   SERVER TRUTH from the token; a client value is overwritten
  issuedAt      number   device clock, clamped to now+5min by the existing rule
  updatedAt     number
  -- added on return, never before:
  returnedAt    number
  returnedBy    string   SERVER TRUTH
  returnSerial  string                      read off the unit; never pre-filled (UI §16.1)
  serialMismatch bool    SERVER TRUTH — DERIVED, see below
  cost          number | null               null, never 0, when nothing is known
  returnRemark  string, <= 500
  billPhoto     string   one photo: a URL, or an inline data: URL while it uploads
}
```

- **`serialMismatch` is computed by the server, not sent.**
  `mismatch = norm(returnSerial) != norm(unitSerial)` where `norm` upper-cases and
  removes spaces and hyphens; when `unitSerial` is empty it is `False` — there is no
  paper to disagree with. The client computes the same thing to draw the confirmation,
  but the record's value is the server's, so a device cannot file a mismatch as a match.
  The server's copy lives in `v2_outside.norm_serial`; the client's is
  `Outside.mismatch(pass, typedSerial)` (frontend, §11). **Both sides test against this
  published table**, so neither needs to read the other's code:

  | on the pass | typed back | mismatch |
  |---|---|---|
  | `ALT-77120` | `ALT-77120` | false |
  | `ALT-77120` | `alt 77120` | false |
  | `ALT-77120` | `ALT77120` | false |
  | `ALT-77120` | `ALT-77999` | **true** |
  | `` (empty) | `ALT-77120` | false — there is no paper to disagree with |
  | `ALT-77120` | `` (empty) | **true** |
- **A mismatch never refuses the return** (UX §3.3, `app.js:5043-5046`). It is recorded.
- Merge strategy: **F** per `v2-contract.md` §4.4 (independent fields; the return fields
  are single-owner). `jobId`, `componentId`, the three identifiers and `no` are frozen
  after issue (§6.2).

### 4.2 `jobcards` — the delta

**Writers:** owner, supervisor, store, mechanic (unchanged), with the outside set frozen
to owner and supervisor (§6.1). **Readers:** unchanged, mechanic narrowed to their own
cards. **Retention:** unchanged — never pruned, stored for ever.

| Field | Type | New? | Who may write it | Merge |
|---|---|---|---|---|
| `outside` | bool | no (v1's) | owner, supervisor | F, keep-stored when absent |
| `outsideCity` | string | no (v1's) | owner, supervisor | F, keep-stored when absent |
| `outsideLat`, `outsideLng` | number\|null | no (v1's) | **nobody in v2** | F, **keep-stored** — v2 drops the pin (UX §5) and must not erase v1's |
| `externalVendor` | string | no | owner, supervisor | F |
| `externalCost` | number | no | owner, supervisor | F, and **recomputed** — §5, §8 |
| `enterAt`, `outAt` | number\|null | no | owner, supervisor | F, non-null wins then larger (`v2-contract.md` §4.4, unchanged — the away days are a difference formatted in days, so a retry seconds later cannot move the figure) |
| `billPhotos` | array of string, **max 4** | **yes** | owner, supervisor | F, **union by URL string** |
| `closeNoBillReason` | string, <= 500 | **yes** | owner, supervisor | F; frozen once `status` is `done`/`verified` except for owner and supervisor |
| `gatePassNo` | string | **yes** | owner, supervisor, store, crewmanager | F, see below |
| `gatePassId` | string | **yes** | owner, supervisor, store, crewmanager | F, see below |

- **`gatePassNo` / `gatePassId` were live fiction** (`jobcard.js:809`, `:1368`) and are
  now real. They hold the **most recent** pass and are a **pointer, not the record**:
  the authoritative list of a card's passes is every `gatepasses` row with
  `jobId == card.id` (UI §3.1). So a collision on the pointer is not a conflict: the
  merge keeps the stored value when both are non-null and different, and nothing is
  refused. A pointer that is one pass behind costs a row's ordering on one screen; a
  refusal there would cost a slip at a gate.
- **`c.outsidePlace` does not exist and never did** (UI §14.3). The field is
  `outsideCity`. Nothing in this cut writes `outsidePlace`, and a push carrying it is
  not refused — it is simply not a field anybody reads.
- The four roles may write `gatePassNo`/`gatePassId` because issuing a pass from the
  piece door sets them on the card; they may write **nothing else** in the outside set.

### 4.3 `components` — the delta

**Writers:** owner, supervisor, store, crewmanager (unchanged). **Readers:** the same
four plus the v1-compat mechanic row (`v2_perms.V1_COMPAT_READ`), unchanged.
**Retention:** unchanged — never pruned, stored for ever.

```
history: [{
  id        'h-…'   NEW. minted on the device WITH the entry (§5)
  type      'install' | 'remove' | 'send-out' | 'return' | 'scrap'
  at, odo, busId, position, vendor, note      unchanged
  passId    string | null  NEW. the gate pass this entry belongs to
  cost      number | null  }  written ONLY when passId is null — see below
  billPhoto string         }
}]
refurbCount  number   SERVER TRUTH — DERIVED: the number of `return` entries in the
                      merged history. A replay cannot increment it twice, and a v1
                      record that already agrees stays unchanged.
state        'in-service' | 'removed' | 'sent-out' | 'refurbished' | 'scrapped'
```

- **The money lives in one place.** When a return has a pass, the amount and the bill
  photo are on the pass and the history entry carries `passId` and no money. When there
  is no pass — the legacy pieces already at `sent-out`, which **must stay returnable**
  (UX §6) — the entry carries `cost` and `billPhoto`, because there is nowhere else for
  them to be. `figure(null)` draws a dash, not a zero, so an entry with no money reads as
  "on the slip", never as "free".
- `history` merge: **union by element `id`**; entries written before this feature (and by
  v1) have no id and union by `(type, at)`. `v2-contract.md` §4.4 already assigns
  `components` strategy **F** with `history` unioned by element and `state` as **R**;
  this names the union key.
- `state` stays **R** (a named refusal), which is what makes the return sheet's "how old
  is this reading" line (UI §4.5 row 2) the right answer to two people at once.

### 4.4 No new store, no new index, no version bump

`gatepasses` and `components` already exist in `v2/db.js`'s `STORES`. `DB_VERSION` stays
**29**: `onupgradeneeded` only creates missing stores, and this feature adds none. No
IndexedDB index is added — v2 reads with `getAll()` plus a JS filter everywhere, and
`gatepasses` is small (§8). Adding the first index to one store would be a new pattern
to maintain for a store that does not need it.

---

## 5. Idempotency — what makes each write safe to arrive twice

Every write arrives twice eventually: a retry, a flaky tunnel, a double tap on a machine
that takes 884 ms to redraw. For each write: the key, and the thing a replay must not do.

| Write | What makes it idempotent | A replay must not |
|---|---|---|
| Mark a bus away | The card id. `outside: true` is a **value**, not an increment | — |
| Record the reached time | `enterAt`: non-null wins, then larger | move the figure (days, so seconds cannot) |
| Back in our yard | `outside: false` plus `outAt` | re-open the card |
| **Issue a gate pass** | **The pass `id` and `no` are minted when the sheet OPENS**, not at save, so a second save of the same sheet is an upsert of the same row. A byte-identical replay is `applied` (`v2-contract.md` §2.2) | create a second slip with a second number for one unit |
| Record a return — the pass | The pass id plus the one-way `out → returned`. An identical replay is `applied`; a **different** return of a returned pass is refused by name (§6.3) | write a second `returnedAt` or a second serial |
| Record a return — the piece | The history entry `id`, minted with the entry; union by id | append a second `return` entry |
| `refurbCount` | **Derived** server-side from the `return` entries | count a refurbishment twice |
| `externalCost` on the card | **Recomputed** server-side as the sum of `cost` over the **returned** passes of that card, whenever the card is an outside card that names a pass. Setting, never adding | double the vendor's charge, or let two people returning two passes clobber each other to one charge |
| Close without the bill | `closeNoBillReason` plus `status: 'done'`. `closedBy`/`closedAt` are stamped on the **transition only**, as today | re-stamp `closedAt`, or re-close a closed card |
| The bill photo | **Not idempotent:** `POST /upload` returns a new URL per call (`04 §1` row 29). `billPhotos` unions by URL, so a double upload of one bill shows two tiles. Bounded by the cap of 4 and named here as a known cosmetic, not a data loss |

The pass number's format is normative, because two implementations exist (the minting
helper and the fixture) and they must agree:
**`^OJ-\d{6}-[A-Z0-9]{4}$`** — `YYMMDD` from `issuedAt` in local time, then four
characters taken from the record id. Never a counter. The client's helper is
`Outside.passNo(recordId, atMs)` (frontend, §11); the fixture in §10 matches the same
regex, and that regex is what holds the two together.

---

## 6. The write guard, rule by rule

All three rule sets live in **`v2_outside.py`**, pure functions over
`(store, rid, data, actor, existing, c)`, called from `_guard_write`. They are in their
own module for the reason `v2_perms.py` is: the rules should be readable by somebody who
is not reading a 6,700-line server, and they are what the owner's two policy decisions
land in.

### 6.1 `jobcards` — the outside set is the owner's and the supervisor's

```python
OUTSIDE_CARD_FIELDS = ("outside", "outsideCity", "outsideLat", "outsideLng",
                       "externalVendor", "externalCost", "enterAt", "outAt",
                       "billPhotos", "closeNoBillReason")
# `gatePassNo`/`gatePassId` are deliberately NOT here: the piece door sets them, §4.2.
```

- For a role outside `{owner, supervisor}`: **any change** to a field in that set is
  refused, on **every** card state. Today the same list is frozen only when a card is
  already `verified` (`sync_server.py:1698`), which is the hole UX §6 names.
- **Compare values, do not refuse the carry-over.** A storekeeper attaching a part sends
  the whole card back, outside fields included, unchanged. Refusing that would break part
  issuing on an outside card — so only a *different* value is refused.
- **On create** by a non-manager, every field in the set must be absent or falsy.
- **Absent means keep, not clear.** A field in the set that is missing from the incoming
  payload but present on the stored card is carried over. This is what stops a v2 write
  erasing v1's `outsideLat`/`outsideLng` (§4.2) and it is the reason v1 keeps working.
- `billPhotos` longer than 4 is refused.
- `closeNoBillReason` cannot be changed by anyone once `status` is `done` or `verified`,
  except by owner or supervisor — who can re-open the card anyway, so this costs nothing
  and stops the reason being quietly rewritten after the fact. Decision 1: *not a silent
  override.*

### 6.2 `gatepasses` — the state machine

- `status` must be `out` or `returned`; **`returned → out` is refused.**
- A new pass requires `busId`, `vendorName` and `unitName`. `unitSerial` may be empty.
- `issuedBy` is stamped from the token; `returnedBy` likewise, on the transition.
- `serialMismatch` is derived (§4.1) and overwritten whatever the body says.
- Frozen after issue, for everyone: `no`, `busId`, `jobId`, `componentId`, `regNo`,
  `engineNo`, `chassisNo`, `issuedBy`, `issuedAt`. The paper in the vendor's file cannot
  change because a bus record was corrected next month.
- A **returned** pass may only be corrected by owner or supervisor. For `store` and
  `crewmanager` a byte-identical replay is `applied` and anything else is refused.
- **No delete, by anyone.**

### 6.3 The exact refusal strings

They reach a person through the quarantine toast, so they are contract, not prose:

| Reason | When |
|---|---|
| `only an owner or supervisor may mark a bus away or set the outside cost` | §6.1, a changed outside field from another role |
| `at most 4 bill photos on a job card` | §6.1 |
| `the reason a card closed without a bill cannot be rewritten` | §6.1 |
| `a gate pass must name a bus` | §6.2, decision 2 |
| `a gate pass must name the vendor and the unit` | §6.2 |
| `a gate pass cannot be moved to another bus` | §6.2, a frozen identifier changed |
| `this gate pass is already returned` | §6.2, a second, different return |
| `a returned gate pass is a manager's to correct` | §6.2, store/crewmanager editing a returned pass |
| `a gate pass cannot be un-returned` | §6.2, `returned → out` |
| `a gate pass cannot be deleted` | §6.2 |
| `a job card needs the vendor's bill, or a reason typed in, to close` | §7 |
| `role may not write this store` | existing, `may_write` |

---

## 7. The close gate

`_has_proof` (`sync_server.py:1291`) today drops the requirement from two-before and
two-after photos to **any one photo on either side** the moment `externalVendor` is set,
and the card then reads "Ready to close — the vendor bill stands in for the photos". The
app's own promise has always been stricter — *"outside repairs: a bill photo"*
(`app.js:30`). Decision 1 settles it. The replacement, exactly, and the client mirrors it
(`jobcard.js:320`, the frontend's file):

```
outside   = bool(d.outside) or bool(d.externalVendor)
if outside:
    met = len(d.billPhotos or []) >= 1
       or str(d.closeNoBillReason or "").strip() != ""
       or any returned pass of this card carries a billPhoto
else:
    met = bool(d.beforePhotos) and bool(d.afterPhotos)        # unchanged
```

- **The pass's bill counts**, because UX §5 drops capturing the bill twice: *one event,
  one amount, one photo*. Requiring a second photograph of the same bill onto the card
  would reinstate exactly what this feature removes.
- **The pass lookup is bounded and only runs on the close transition.** First a point
  read of `d.gatePassId`; only if that pass has no bill does it scan `gatepasses` for
  `jobId == card.id`. `status in ('done','verified') and prev not in ('done','verified')`
  is already the condition the existing call sits behind, so no ordinary card write pays
  for this.
- **This is a LIVE behaviour change** affecting cards being closed today, by v1 devices
  as well as v2 ones. It ships on the owner's deploy, §9(a).
- Two existing suites assert the old gate and the old gate-pass roles and **must be
  rewritten, not deleted**: `test_servicelog.py:74` (an outside card closing on no after
  photos) and `test_thief.py:285-302` (a storekeeper refused a pass). Each flips to
  assert the new boundary with the owner's decision named in the check, and each keeps
  asserting that the roles who are *still* refused are refused. Never weaken a check to
  make a change pass.

---

## 8. Performance, and the numbers this cut must measure

Budgets this feature is held to, and which are measured rather than asserted. **Nothing
below is a figure I have measured**; §11 of the slice table makes taking them an
instruction.

| What | Budget | Why it is the thing to watch |
|---|---|---|
| `/push` of an outside job card | **< 5 ms** added per record at 2,000 passes in the fixture | §5's `externalCost` recompute is a bounded scan of `gatepasses` in the only hot endpoint in the system. **If it misses the budget, the fallback is named now, not improvised later:** recompute on the close transition only, and the two-passes-two-devices clobber is reported as a residual rather than hidden |
| `/push` of any other record | **0 ms** added | No guard in §6 touches a store it was not already given |
| `/pull` for a crew manager | the full first drain grows by **< 1 page** | `gatepasses` is the 24th of 41 stores. Measured against `scripts/measure-pull.py`'s existing harness |
| Devices that re-drain because of this deploy | **crew managers only** | The alternative (a `SCOPE_V` bump) is every device of every role: 536 ms of server drain each and 50-90 s on the device on a Mac (`03 §8`). §2.3 exists for this number |
| A client write (away, issue, return) | **one** IndexedDB transaction, **three** stores marked dirty | `03 §9.17`, `03 §9.18`: a per-row transaction and a per-row cursor have both already shipped here and both had to be undone. The return writes pass + piece + card in one transaction, and the screens re-read only what changed — reading all forty stores after a write cost 884 ms per tap |
| The Attention row | reads `gatepasses` and nothing else | UI §6: an unheld kind never reads a store |

**Measure before you optimise.** Three rounds of "the login is slow" were each spent on a
layer that was not the cost. The two numbers above that can fail — the push delta and the
crew manager's drain — are a slice of their own (OB4), measured on the fleet-sized
fixture, and they decide the fallback rather than an opinion doing it.

---

## 9. For the owner — nothing here is run from this session

No production write and no production deploy happens in this stage. Deployment is
automatic on a push to the deploying branch (`DEPLOY.md`), so **the two live behaviour
changes below land when the owner merges, and that is the handover.**

**(a) Two live behaviour changes, both already decided, neither ours to ship.**

1. *Decision 1, the close gate.* After the merge, an outside card can no longer be closed
   on one photo anywhere in the fleet — v1 devices included, because the rule is the
   server's. A supervisor closes without a bill by typing a reason, which stays on the
   card. Cards currently sitting at `done` are untouched; only new closes are judged.
2. *Decision 3, the gate pass.* After the merge a storekeeper and a crew manager can
   issue and receive passes, and their devices begin receiving every pass in the store.
   `test_thief.py`'s storekeeper assertion flips with it, on purpose and by name.

**(b) Two read-only counts for the baseline UX §7 asks for.** Run against production by
the owner; this session runs nothing. Postgres, and note `updatedat` is the real
lower-case column name — do not quote it (`03 §9.22`):

```sql
-- v1's monthly rate of away cards, the UNKNOWN in UX §7
SELECT COUNT(*) FROM records
 WHERE store = 'jobcards' AND (data::jsonb->>'outside') = 'true';

-- and gate passes by month
SELECT to_char(to_timestamp(updatedat/1000), 'YYYY-MM') AS month, COUNT(*)
  FROM records WHERE store = 'gatepasses' GROUP BY 1 ORDER BY 1;

-- how many pieces are stuck at sent-out with no pass (UX §7's target of 0)
SELECT COUNT(*) FROM records
 WHERE store = 'components' AND (data::jsonb->>'state') = 'sent-out';
```

**(c) Four policy questions, each one sentence from the owner, none of them blocking.**
Stage 3 builds the narrow reading of all four, which is the smaller change in every case.

1. **May a crew manager read the `vendors` registry?** They can now issue a pass, and the
   vendor suggestion list on the sheet is built from `vendors` — which they are not sent.
   Stage 3 builds their list from the vendor names already on the passes and piece
   history they *do* receive, so nothing is widened and the list is shorter. One sentence
   changes one row in `v2_perms`.
2. **A mechanic's own card still carries the vendor's name and the outside cost** in the
   copy their device holds (§3.4). The only real fix moves outside money off the job card
   into a store a mechanic does not read, which v1 cannot read either. Not stage 3's, and
   not safe to do quietly.
3. **May `store` and `crewmanager` re-read a vendor's bill later?** Stage 3 says no, and
   §4.3 makes it structural: the money is on the pass, not on the piece.
4. **Is 14 days still the overdue threshold?** Stage 3 uses 14 and the row says so.

**(d) Tests run in-process against a tempfile database.** Every Python suite pops
`DATABASE_URL`, `TURSO_URL` and `TURSO_DATABASE_URL` and points `DB_PATH` at a tempfile
(`test_readscope.py`'s header is the template). No test reaches production, which is why
the harness needs no flag to be safe.

---

## 10. Fixtures — what the frontend may build against

Added to `v2/db.js`'s demo seed by slice OB3, in one `bulkPut` per store, not a per-row
loop. **These ids are contract**; the frontend's checks may name them.

| Id | Store | What it is | Which check needs it |
|---|---|---|---|
| `gp-1` | gatepasses | `status:'out'`, issued **21 days** ago, `busId:'b3'`, `jobId:'j3'`, `componentId:null`, unit "AC compressor" / `ACC-5512`, vendor "CoolAir Jaipur" | UI §15.9 — the Attention row has **never been drawn**, because there are no `gatepasses` records at all today |
| `gp-0` | gatepasses | `status:'returned'`, `componentId:'c-t2'`, `jobId:null`, serial matched, `cost`, one `billPhoto` | the slip's return view; the close gate's "the bill is on gate pass …" state; a pass with no `jobId` |
| `c-a1` | components | **unchanged** — stays `sent-out` with **no pass** | UI §15.3 — the piece that left before passes were kept must be returnable |
| `j3` | jobcards | gains `gatePassNo`/`gatePassId` for `gp-1`; keeps `outside:false` with a vendor set | the "vendor typed, bus in our yard" case the Away tab used to get wrong |
| `j4` | jobcards | **new**: `busId:'b2'`, `outside:true`, `outsideCity:'Jaipur'`, `enterAt: now-2d`, `externalVendor:''`, `billPhotos:[]` | the away rows, the days figure, the Away tab, and "away with no vendor yet" |

`test_v2_browserpath.js` builds its own cache literals and is **not** this cut's file to
edit. If a seeded row reddens it, OB3 reports it to the lead and the lead routes it to
whoever owns that file. §11.

---

## 11. The seams — what the frontend may rely on, and what is theirs

**Changed after publication, see §12.** `docs/v2/plan/outside-repair-frontend-slices.md`
was published the same day and claims `v2/outside.js`, `test_v2_outside.js` and
`v2/caps.js`. Two builders in one file is the one thing a cut may not do, so the local
write path moved: **the frontend owns the module and performs the writes; the backend owns
the transaction they go through and the test that proves they went through it.**

| Seam | Owned by | The promise |
|---|---|---|
| `v2/caps.js` — the pass's own client capability | **frontend** (OR1) | `PERMS.gatePass = ['owner','supervisor','store','crewmanager']`, **equal to `manageComponents`**, with `outsideJob` left at `['owner','supervisor']` (UX §8). The client half of §3.2's equality check is theirs; the server half is ours |
| `v2/outside.js` — the pure rules | **frontend** (OR1) | `isOutside`, `awayDays`, `daysOut`, `passesFor`, `gateMet`, `gateState`, `passNo(recordId, atMs)`, `mismatch(pass, typed)`, `OVERDUE_DAYS`, `CAP`. No `DB`, no clock. §7's gate rule and §5's number format are what they implement |
| `v2/ui/passes.js` — `issueWrite`, `returnWrite` | **frontend** (OR2) | **Three requirements this contract places on them, and the backend tests all three:** (a) every save goes through **one** `DB.putMany` call — never two or three `DB.put`s; (b) the pass `id` and `no`, and the piece's history-entry `id`, come from the **draft built when the sheet opened**, never minted inside the write (§5); (c) a return with no pass still writes, and writes `cost`/`billPhoto` on the history entry (§4.3) |
| `DB.putMany(entries)` — one transaction over several stores | **backend** (OB3) | `[{store, obj}, …]` in **one** readwrite transaction; one outbox entry per record; **one dirty mark per store, not per row**; one `onChange` per store; the existing `outboxbase` rebase still applied to the fields §4 marks **R** (`components.state` is one). Available before OR2 starts |
| The serial normalisation | **contract** | The published table in §4.1. Server tests it in `v2_outside.norm_serial`, client tests it in `Outside.mismatch`; neither reads the other's code |
| `v2/index.html`, `v2/sw.js`, `test_v2_boot.js` | **integrator** | No new backend script is added, so the only glue is the two the frontend's §4 already names |
| `v2/db.js` | **backend** (OB3) | The record shapes of §4 and the fixture rows of §10. The frontend's cut states that no frontend slice owns this file, and every frontend check builds its own rows, so nothing there waits on the seed |
| `sync_server.py`, `v2_perms.py`, `v2_outside.py` | **backend** | No frontend slice names them |
| `v2/screens/*`, `v2/ui/*.css`, `v2/cost.js`, `v2/ui/words.js` | **frontend** | No backend slice edits any of them |

## 12. Change log after publication

Published 2026-11-09 before any builder was dispatched. **One change since, recorded
below.** Any change here is told to the frontend lead in the same breath, per the
standing rule — a contract that changes quietly after they start is not a contract.

| Date | What changed | Who was told |
|---|---|---|
| 2026-11-09, same day, before any builder was dispatched | **§11 only.** Published: `v2/outside.js` (and `test_v2_outside.js`) as a backend-owned module performing the local writes, plus a third `<script>` tag. Changed to: the frontend owns that module and performs the writes; the backend owns `DB.putMany` and the three requirements above, and tests them. Nothing else moved — §4, §5, §6, §7 and the record shapes are unchanged, and the frontend's own cut was already written against them | Tried to tell the frontend lead directly in the same breath and **could not reach them** (no agent of that name is live), so it is in the backend report to the dispatching session **to relay**, verbatim, before any frontend builder is dispatched. **No builder had been dispatched from either cut when this changed**, and the change is in the frontend's favour — they keep every file they claimed |

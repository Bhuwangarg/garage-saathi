# Outside repair — review, authorization only

**Stage 5 of `docs/v2/PIPELINE.md`. Slug: `outside-repair`. One lens: who the SERVER
lets in.** Reviewed 2026-11-09 at `f074302` on `launch-v2`.
Read against `outside-repair-ux.md`, `outside-repair-ui.md`,
`outside-repair-contract.md` and `outside-repair-assembly.md`.

## Verdict: FIX FIRST

The boundary itself is right and it is held by the server, not by the screens. Every
role that must not reach a gate pass is refused by `/push` and receives zero rows from
`/pull`, on the full drain, on the `?store=` path and through the `/v1/` alias; the
outside set on a job card is frozen for every non-manager on an **open** card, which is
the hole UX §6 named; the state machine, the server-derived `serialMismatch` and the
close gate all refuse by name. I attacked each of those as the eight roles over real
HTTP and could not get past any of them.

Two things must be fixed before this is called shipped, and neither is a boundary that
is too loose:

1. the flow decision 3 created makes the **storekeeper and the crew manager push a
   job-card write the server is right to refuse** — so the vendor's charge does not
   reach the card, and those two roles get a permanent, unactionable refusal;
2. the residual the owner is being asked to decide on (contract §9(c)2, assembly §7.4)
   **understates what a mechanic, a storekeeper and a crew manager actually hold**.

Everything below was reproduced before it was written down. Every probe ran in-process
or on loopback against a throwaway SQLite file with `DATABASE_URL`/`TURSO_*` popped.
**Nothing in this review touched production, and no PIN of any real account was minted
or read** — the fixture logins are throwaway accounts in a tempfile database.

---

## Findings, worst first

### 1. The storekeeper's and the crew manager's return writes a job card the server refuses — and the vendor's charge never reaches the card

`v2/ui/passes.js:434-444` — `returnWrite` appends a `jobcards` entry carrying
`card.externalCost` whenever `pass.jobId` is set and a cost was typed. There is no role
test on it. `v2/screens/fuel.js:1612` reaches that path for the two roles decision 3
added: `openPassOf(piece, gatepasses)` picks the piece's open pass **whatever its
`jobId`**, so a pass issued from a job card by a supervisor is received on Fuel & tyres
by a storekeeper or a crew manager. The server then refuses that one record at
`sync_server.py:1798` → `v2_outside.py:81-88` (`store`) and at `sync_server.py:3935`
(`crewmanager`, who may not write `jobcards` at all).

The concrete case, run over HTTP:

```
supervisor  issues gp1 on card j1 (jobId=j1, componentId=c1), card gets the pointer
storekeeper pushes exactly what returnWrite builds — pass + card, one batch:
  -> 200 applied=2 rejected=1
     refused: {store:"jobcards", id:"j1",
               reason:"only an owner or supervisor may mark a bus away or set the outside cost"}
     pass status on the server   = returned
     piece state on the server   = in-service
     card externalCost on server = None        (the typed 3200 did not land)
supervisor later closes the card
     card externalCost on server = 3200.0      (the server's own recompute fixes it)
```

As the crew manager the same push is refused with `role may not write this store`.

What it costs:

- **The outside cost is absent from the places it is read** between the return and the
  next manager write of that card: `v2/screens/jobcard.js:1038` draws `c.externalCost`
  and `v2/cost.js:201` sums it into the outside-work total on Money. The money itself is
  not lost — it is on the pass — and `_recompute_external_cost`
  (`sync_server.py:1505-1522`, called at `:1947`) sets the figure correctly the next time
  a manager writes the card. Until then the owner reads a repair with no vendor cost.
- **A permanent quarantine entry on the device of the person who did the job.**
  `v2/sync.js:970` stores the refusal as `{status:403, reason}` and `Sync.info().reasons`
  draws it with a Retry that will be refused again for ever. The storekeeper is told
  "only an owner or supervisor may mark a bus away or set the outside cost" after
  receiving an alternator; the crew manager is told "role may not write this store".
  Neither sentence describes anything they did or can fix.
- The two devices diverge: theirs holds a card copy with the cost, the server's does not,
  and nothing re-pulls it because the server row never moved.

This is stage 1 and stage 3 disagreeing, not a bug in either. UX §8 says in as many
words: *"a storekeeper and a crew manager will now type vendor money. That is inside
decision 3"*. Contract §6.1 then froze `externalCost` to owner and supervisor **on every
card state**, which is also correct. Nobody reconciled the two for a pass that hangs off
a job card.

**Fix in OR2 (`v2/ui/passes.js`), not in the guard.** The card entry is unnecessary: the
server recomputes the figure from the card's returned passes anyway. Build the `jobcards`
entry only when the actor holds `outsideJob` (`v2/caps.js:107`), and let the server's
recompute carry it for the other two roles. Do not widen `OUTSIDE_CARD_FIELDS` and do not
widen `outsideJob` — UX §8 explains what else that would hand over.

### 2. The residual the owner is deciding on is understated: a mechanic receives the vendor, the amount and the bill photo

Contract §3.4 row 2 states the boundary as *"A mechanic must not know which vendor holds
the unit … Enforced where: `redact_for`, server-side"*, and the residual row names only
`externalVendor` and `externalCost` on the mechanic's own card. Verified on `/pull` as a
mechanic, two carriers the row does not mention:

- **`components.history`.** `v2_perms.py:184` grants `components` to the mechanic as a
  v1-compat row (v1's `viewPartDetail` needs it). Nothing redacts fields on that store, so
  a mechanic's device receives every piece's history entries in full:

  ```
  components /pull as mechanic ->
    [{'type':'return','vendor':'Sharma Auto Electric','cost':4100,
      'billPhoto':'/uploads/cccc….jpg'}, {'type':'send-out','vendor':'Sharma Auto Electric'}]
  ```

  The `vendor`/`cost`/`billPhoto` shape is not new — `app.js:5591` has been writing it in
  v1 all along, which is why I am not calling this a leak this feature opened. What is new
  is that contract §4.3 keeps writing money onto that entry for the **no-pass** return,
  which is exactly the path UX §6 requires to keep working (`c-a1`), while §3.4 tells the
  owner the mechanic boundary is enforced server-side. It is not enforced on this store at
  all.
- **`jobcards.billPhotos` and `closeNoBillReason`** — both genuinely new in this cut —
  reach every `jobcards` reader. Verified: `billPhotos:['/uploads/aaaa….jpg']` and the
  typed reason arrive on `/pull` for the mechanic (their own card, narrowed correctly by
  `OWN_ROWS_MEMBER`), for `store` (every card), and for `crewmanager` (every card, through
  the v1-compat duty-board row at `v2_perms.py:191`). Holding the URL is holding the bill:
  `/uploads/` authenticates nothing by design (`sync_server.py`'s own comment on that
  route, `LIVE-ISSUES.md` issue 7).

What it costs: contract §9(c)2 asks the owner to decide whether outside money should move
off the job card, and assembly §7.4 hands him that question. He would be answering it
against an inventory that misses the piece register and the bill photo. **Correct §3.4 and
the handover before the owner answers** — this is a one-paragraph change to the documents
plus a decision, not a code change, and it must not be made quietly.

### 3. A mechanic may write `gatePassNo`/`gatePassId`; a crew manager may write neither

Contract §4.2 names exactly `owner, supervisor, store, crewmanager` for those two fields,
and `v2_perms.py:120` deliberately keeps them out of `OUTSIDE_CARD_FIELDS` (asserted at
`test_outside_readscope.py:114`). The implemented set is therefore "whoever may write
`jobcards`" — `owner, supervisor, store, mechanic` (`sync_server.py:1224`). Mechanic in,
crew manager out. Verified:

```
owner: card j-x outside, vendor Sharma, externalCost typed 50000
store: pass gp-x on j-x returned with cost 3200
MECHANIC pushes the card with gatePassId='gp-x' -> 200 applied=1
   stored gatePassId='gp-x'  externalCost=3200.0  _by=the mechanic
MECHANIC pushes gatePassNo='OJ-000000-FAKE'      -> 200 applied=1, stored verbatim
```

Bounded, and I checked both bounds: the merge at `sync_server.py:3782` keeps the stored
pointer when both are set and differ, so a mechanic can only fill an **empty** pointer;
and `_passes_of_card`/`_all_passes_of_card` test `jobId == card.id`, so no card can borrow
another's bill. Cost: a mechanic's phone can move the outside cost figure on their own
card once, on the field whose refusal string says only an owner or supervisor may set it,
and can write the pass number the card prints. No check covers either. The crew-manager
half costs nothing today (their only door issues passes with `jobId: null`), but contract
§4.2's role list for these two fields is not what the server implements and should be
corrected in §12 rather than left to be rediscovered.

### 4. "store and crewmanager may not re-read a vendor's bill" is a drawing decision, not a boundary

Contract §3.4 row 1 claims the want is met *"by the record shape … nothing to redact,
nothing to hide, nothing for a client to be trusted with"*. The shape moves the money from
the piece to the pass — and both roles read the pass. Verified: `/pull?store=gatepasses`
as `store` and as `crewmanager` returns `cost`, `billPhoto`, `vendorName` and `unitSerial`
in full, which is exactly what contract §4.1 says it should (*"a storekeeper who may issue
a pass may read every pass"*). The only thing withholding it is `v2/screens/store.js:1529`,
`money = can(m.role,'outsideJob')`, which does not draw it.

That matches UX §4's Store row, which asks only that the money not be in the register's
timeline — so the code is right. The documents are not: assembly §7.4 tells the owner that
"whether `store` and `crewmanager` may re-read a bill later" was **built as "no"**. It was
built as "not drawn". Both devices hold every bill URL and every amount, for ever
(`gatepasses` is never pruned, §4.1). Fix the sentence in the handover, so the owner's
answer to §9(c)3 is given against what is true.

### 5. `/health`'s `permsOk` cannot go false for the drift it exists to catch

`WRITE_ROLES["gatepasses"]` and `WRITE_ROLES["components"]` are **the same object**
(`sync_server.py:1188, 1198, 1222`), so narrowing the literal narrows both and
`assert_write_roles_follow` still passes. Verified by mutation, on a copy of the tree:

```
drop "crewmanager" from _PIECE_WRITERS:
  test_outside_roles.py   3 failed      test_outside_guard.py  7 failed
  test_thief.py           54/56 blocked, 2 STOLEN
  perms_ok()              True          <-- the owner's post-deploy signal stays green
re-assign WRITE_ROLES["gatepasses"] to a wider list:
  RuntimeError at import: "gatepasses write roles differ from components: only-gatepasses=['mechanic']"
```

So the suites do catch it — loudly — and `permsOk` catches only a re-assignment of one
key. Contract §2.5 describes `permsOk` as the thing to read after a deploy *"for anyone
who cannot read a traceback"*. It is weaker than that reads. Low cost, worth one sentence
in §2.5 or one extra equality (`set(WRITE_ROLES["gatepasses"]) == the four roles`).

---

## What I checked and found correct — do not redo this

All of it over real HTTP against a loopback server and a tempfile database, as throwaway
logins for all eight roles.

**The gate pass, write side.** `POST /push` of a new pass: `owner`, `supervisor`, `store`,
`crewmanager` applied; `mechanic`, `driver`, `conductor`, `office` refused `403` with
`role may not write this store`, and no row stored. Same answer through the `/v1/push`
alias. A batch containing one forbidden gate pass applied the other record and stored
nothing for the forbidden one (`200 applied=1 rejected=1`).

**The gate pass, read side.** `GET /pull?since=0` and `GET /pull?since=0&store=gatepasses`
and `GET /v1/pull?…`: four roles receive the rows, the other four receive **zero** — not a
redacted copy, no rows at all, because `_never_for` (`sync_server.py:4411` →
`v2_perms.never_for`) skips the store in SQL. The `store=`/`defer=` query parameters cannot
widen: as a mechanic, naming the store by hand still returned nothing.

**The outside set on a job card, field by field.** On an **open** card (the state the old
rule left unguarded): `outside`, `outsideCity`, `outsideLat`, `outsideLng`,
`externalVendor`, `externalCost`, `enterAt`, `outAt`, `billPhotos`, `closeNoBillReason` —
each one, changed alone, refused for `store` and for `mechanic` with contract §6.3's exact
string; refused as `role may not write this store` for `crewmanager`, `driver`, `conductor`
and `office`; and nothing of any attempt stored. A storekeeper attaching a part and
carrying the outside fields back **unchanged** was applied, which is the case §6.1 exists
to protect. A field omitted from the body is carried over from the stored row
(`sync_server.py:3813-3815`), so a non-manager cannot clear the away state by omission —
I tried.

**Own-rows narrowing.** A second mechanic, not on the card, receives zero `jobcards` rows;
the assigned mechanic receives exactly their own (`OWN_ROWS_MEMBER`, `v2_perms.py:255`).

**The state machine and server truth.** Each refusal reproduced with its §6.3 string: a
second different return (`this gate pass is already returned`), a storekeeper editing a
returned pass (`a returned gate pass is a manager's to correct`), `returned → out`
(`a gate pass cannot be un-returned`), `_deleted` (`a gate pass cannot be deleted`), a
changed `busId` (`a gate pass cannot be moved to another bus`), a pass with no bus
(`a gate pass must name a bus`). `issuedBy` is stamped from the token — a body claiming
the owner's id stored the storekeeper's. `serialMismatch` is the server's: a storekeeper
pushing `serialMismatch: false` with `returnSerial: ALT-9` against `unitSerial: ALT-1`
stored `True`; `alt 77120` against `ALT-77120` stored `False`, and an empty `unitSerial`
stored `False`. A storekeeper cannot file a mismatch as a match.

**The close gate.** An outside card with no bill photo and no typed reason is refused
`a job card needs the vendor's bill, or a reason typed in, to close`; with a typed reason
it closes; `closedBy` is the token's; a storekeeper rewriting `closeNoBillReason` on the
closed card is refused `the reason a card closed without a bill cannot be rewritten`.
A returned pass carrying a bill also meets the gate (verified in finding 1's trace).

**Deny by default for something named nowhere.** A store with no entry in
`STORE_READ_ROLES`, `V1_COMPAT_READ` or `WRITE_ROLES`: `may_read` is False for **every**
role including the owner, it is in `never_for` for every role, and `/pull?store=newstore`
returns nothing. On the write side it is denied for every role **except the owner**, who
short-circuits at `sync_server.py:3552` — so an owner token can create rows in a store
nobody can read. That is junk, not exposure, and `SERVER_INGEST_ONLY` is checked ahead of
the owner (`:3550`); recorded here so the next reviewer does not re-derive it.

**No new route, as contract §0.1 promised.** `gatepasses` appears nowhere in `do_GET` or
`do_POST` except the write matrix, the guard and the two bounded SQL lookups. `/pull` and
`/push` are `401` with no token; `/agent/*` is `401` without an agent key and has no
gate-pass route; `/admin/import` (the one path that calls `push(..., actor=None)` and so
bypasses the matrix) is still owner + `IMPORT_TOKEN` + non-empty-database refusal.

**The client half of the equality.** `v2/caps.js:168` `gatePass` equals `:163`
`manageComponents`, and `:107` `outsideJob` is still `['owner','supervisor']` — so the
away block and the vendor money on the card stay with two roles, which is UX §8's narrow
reading. `jobcard.js:1149` requires both caps to issue or receive from the card, so the
job-card door is owner/supervisor only.

**The checks are not decoration.** Three mutations run on a copy of the tree, each red:
dropping a role from `_PIECE_WRITERS` (3 + 7 failures, 2 of `test_thief.py`'s 56 attacks
suddenly succeeding); re-assigning `WRITE_ROLES["gatepasses"]` (RuntimeError at import);
`may_set_outside` returning True for every role (16 failures in `test_outside_guard.py`,
2 more thefts in `test_thief.py`). The baseline copy is green on
`test_outside_roles.py`, `test_outside_guard.py`, `test_outside_readscope.py` and
`test_thief.py` (56/56 blocked).

---

## What I could not check

- **A deployed server.** Everything here is loopback + tempfile SQLite. The Postgres
  dialect of `own_rows_predicate`/`member_rows_predicate` was not exercised, so the
  narrowing SQL that runs in production is read, not run.
- **The `readScope` rewind on a device that exists today.** Assembly §6.1 already names it
  and I confirmed by reading that `do_login` carries the field and that a first digest is
  stored without a rewind. I did not run a device through a deploy, so I cannot add
  anything to what §6.1 already says: a crew manager will see passes from the deploy
  onward and not before.
- **Whether any production `components.history` entry carries a vendor amount today.**
  Finding 2 rests on `app.js:5591` writing that shape and on the field reaching a mechanic
  on my fixture. I did not query production and will not; the count is the owner's SQL in
  contract §9(b).
- **Anything on Windows 7 / Chrome 109**, the printed slip, and the client-side quarantine
  toast as a person sees it — I verified the refusal reaches `Sync`'s quarantine by reading
  `v2/sync.js:942-971`, not by watching it on a Core 2 Duo.
- **The non-authorization half of this feature.** Attention's dead deep link, the drain
  budget, the crew manager's empty vendor list and the three pending Hindi ids are assembly
  §6 items 2-5 and are out of this review's lens.

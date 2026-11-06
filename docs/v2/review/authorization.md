# REV-AUTH — can anybody reach anything they should not?

Stage 5, authorization only. Branch `launch-v2`, HEAD `90aaec1`.
Read-only on source: no application file was changed and no git command was run.

**Verdict: FIX FIRST.** Do not put this in front of a hundred people yet.

The deny-by-default model itself is sound — I attacked `Caps.holds` with every
shape I could think of and could not open a screen with it (see *Checked and
found correct*). The leaks are not in the predicate. They are in the two places
the predicate does not reach: **what the server sends**, and **what is already
on the phone from the last person who used it**.

Findings are ranked by what they cost the business. Each says whether I
**verified it by running something** or read it.

---

## F1. A shared yard phone hands the previous person's whole replica to the next person

**NEW. Not in LIVE-ISSUES, not in DECISIONS, not in any slice report. Verified
by running the real `caps.js`, `router.js`, `shell.js`, `login.js` and `boot.js`
in a sandbox.**

### The path

1. The owner signs in on a yard phone, online. `/pull` fills IndexedDB with the
   full-entitlement copy of everything: every crew member's `phone`, `address`,
   `dob`, `license`, `salaryMonthly` and `docs` (the Aadhaar and PAN image
   URLs), every `crewnotes` row, every `gatechecks` selfie.
2. The owner taps sign out.
3. A **conductor** picks the phone up and types their own four-digit PIN.
   A conductor holds zero capabilities; `Me` is their whole app. They need no
   network: `NO_DEVICE_PIN` is `owner, supervisor, crewmanager`, so a
   conductor's PIN *is* cached and the offline branch of `attempt()` signs them
   in with no server round trip at all.
4. `login.js` calls `Boot.enter(user)`. `enter()` calls
   `Cache.load(PullApply.FIRST_STORES)`.
   `FIRST_STORES` (`v2/pullapply.js:263`) includes **`drivers`, `crewnotes` and
   `gatechecks`**.
   `Cache.load` (`v2/cache.js:146`) is role-blind — it does `db().all(store)`
   and puts every row into `S.cache[store]`.

### What I measured

A conductor, after one offline PIN login, with 19 stores in `S.cache`:

```
S.cache.drivers    = [{"id":"d9","userId":"u-other","name":"Someone Else",
                       "salaryMonthly":21000,"license":"DL-999",
                       "docs":[{"kind":"aadhaar","url":"/uploads/aadhaar-other.jpg"}]}]
S.cache.crewnotes  = [{"id":"n5","crewId":"d1","text":"Warned Ramlal about the fuel book"}]
S.cache.gatechecks = [{"id":"g2","userId":"u-other","selfie":"/uploads/selfie-other.jpg"}]
```

Same result for a `driver`. Same result for a `mechanic`, which additionally
picks up `jobcards` with another mechanic's hours, outside cost and notes.

Note the `crewnotes` row: `crewId: d1` is driver `u-d1`'s own crew record, and
it was sitting in `u-d1`'s own `S.cache` on `u-d1`'s own phone. **That is the
conversation log reaching the person it is about** — the rule the brief named,
broken by the device rather than by the screen.

### Why nothing cleans up — three independent reasons, all of them needed

1. **`Boot.signOut()` (`v2/boot.js`) deliberately leaves IndexedDB alone.** Its
   comment: *"The stores on disk are untouched: a sign-out is not a device wipe,
   and the next `Cache.load` re-reads them under whoever is signed in then."*
   The second half of that sentence is not true. `Cache.load` does not know who
   is signed in and has no role parameter. `signOut()` clears `S.cache`, and
   `enter()` refills it from the same disk two lines later.
2. **`Sync.login` has no narrowing branch** (`v2/sync.js`, the `pullScope`
   block). It handles `widened` (redacted → full) and `entitlementMoved`
   (`SCOPE_V` change) and nothing else. For `full:v2` → `redacted:v2` I
   evaluated the two expressions directly: `widened = false`,
   `entitlementMoved = false`, so the cursor is **not** rewound and the redacted
   copies are never fetched. There is no purge branch anywhere.
3. **`redact_for`'s whole second layer is therefore bypassed.** The server's
   rules govern what it *sends*. These records were already sent, to a different
   person, on the same device.

The offline path only makes it free. An **online** conductor sign-in leaks
exactly the same rows, because the cursor is not rewound: the server would
happily send redacted copies, and is never asked.

### What it costs

An Aadhaar photograph is the most sensitive thing in this system, and its URL is
on an unauthenticated `/uploads/` route (`LIVE-ISSUES §7`), so the URL alone is
the document. Add the whole crew's pay and a named disciplinary note, on a phone
that is handed round a yard, readable by the devtools console and by any screen
that reads those stores. This is leak number seven and it has the same shape as
the six: the client looked fine.

---

## F2. A mechanic receives every job card in the fleet

**Verified by running against a local server.** This is `02 §6.2`'s named edge,
on the read side.

`v2_perms.STORE_READ_ROLES["jobcards"] = WORKSHOP` (owner, supervisor, store,
mechanic), and `jobcards` has **no entry in `OWN_ROWS_ONLY`**. `caps.js` says
the narrowing happens *"IN THE QUERY, not in the view"* — and the query is the
client's.

Mechanic `u-m2`'s token, both pull paths:

```
/pull?since=0            -> j-m1 (u-m1's, hours 4), j-m2, j-legacy
/pull?since=0&store=jobcards -> the same three
j-m1 carries: labourHours=4, notes='m1 private note'
j-m2 carries: externalCost=7400, externalVendor='Shyam Motors'
```

The **write** side is enforced per record from the stored card
(`"you are not on this job"` — verified refused). Only the read is open.

**Cost:** every mechanic's phone holds every other mechanic's hours, the
garage's outside-repair costs and vendors, and the notes on cards they are not
on. Mechanics are paid against their hours; this is the other mechanics'
piecework visible to each of them. `02 §6.2` records this leaking once already.

**Shape of the fix is already in the file:** `jobcards` wants an `OWN_ROWS_ONLY`
row for `{"mechanic"}`, keyed the way `_job_crew` reads membership — which is
`assignees[].userId` with an `assignedTo` fallback, i.e. **not** a single JSON
scalar, so it does not fit the existing `(field, roles)` shape and needs a
decision rather than a one-liner. That is why I am reporting it rather than
calling it mechanical.

---

## F3. The crew manager gets the whole crew's pay, and only the browser hides it

**Recorded as `LIVE-ISSUES §7.2` and in `people.js`'s own header. Verified by
running.**

`redact_for`'s chain (`sync_server.py:4336`) is
`elif not actor or role in PII_ROLES: return rec` — the record in full.
`PII_ROLES` includes `crewmanager`. Verified: the crew manager's pull carried
`salaryMonthly: 22000` for every crew record.

The client gate is `SALARY_GATE = 'money'` (`v2/screens/people.js:110`), and a
crew manager does not hold `money`. `people.js` says it plainly itself: *"A
client rule here is a SCREEN rule and not protection."*

**This is owner question Q4, and until it is answered the de-facto answer is
"the crew manager has it."** Whichever way Q4 goes, the server has to move:
if pay is a money matter, `salaryMonthly` must be withheld from `crewmanager`;
if it is a people matter, the client gate becomes `manageDrivers` and the server
is already right. The decision is the owner's; the drift is not.

---

## F4. The crew manager gets the PNR, seats and fare on every review — the exact fields `itslookup` is withheld for

**NEW. Verified by running.**

`redact_for` strips `pnr/tin/seats/fare/amount` from `rbreviews` and
`rbcomplaints` only under `elif st in ("rbreviews","rbcomplaints") and role ==
"office"`. `crewmanager` reaches `return rec` one branch earlier.

```
owner        pnr='TR7788991122' seats=['L3','L4'] fare='1450'
crewmanager  pnr='TR7788991122' seats=['L3','L4'] fare='1450'   <-- full
office       pnr=None           seats=None        fare=None     <-- correct
```

Meanwhile `itslookup` is `MANAGERS` only, and `v2_perms.py` says why: it
*"carries a PNR, a seat and a fare"*. `redact_for`'s own comment then argues
that *"withholding one and not the other was a rule that only looked strict"* —
and applies that argument to the office and not to the crew manager, who is
denied `itslookup` for carrying fields they are handed on every review.

**Cost:** a PNR plus a date is a booking-lookup credential on the company's own
portal. The crew manager's job is the duty board and the crew bank; nothing on
`Reviews` or `People` asks for a seat number or a fare. One role, every review.

---

## F5. The office receives every crew member's face photo and exit record

**`LIVE-ISSUES §10`. Verified by running — and the document overstates the
breadth, which matters for the fix.**

```
office       photo='/uploads/face-ramlal.jpg'  leftReason='Dismissed for theft'
             leftNote='caught siphoning diesel'  rehire=False
mechanic     withheld
driver       withheld
conductor    withheld
```

§10 says these reach *"every signed-in role, including a conductor who holds
zero capabilities"*. That is now **stale**: `drivers` is `OWN_ROWS_ONLY` for
store, mechanic, driver and conductor, so those four receive only their own row
— verified by asking for `?store=drivers` as each of them. The residual
exposure is `office` (and `crewmanager`, who holds `manageDrivers` and is
therefore within policy). The one-line fix §10 describes still applies and is
now narrower than it reads.

---

## F6. The two-person rule does not apply to a `done` card that carries no `closedBy`

**NEW. Verified by running. The brief's premise here is stale and should be
corrected.**

**The brief says the server still permits self-verification. It does not.**
`sync_server.py` refuses it for every role including the owner:

```
closer = old.get("closedBy") or data.get("closedBy")
if closer and closer == actor["id"]:
    return "you closed this job — someone else must verify it"
```

Verified: the owner closed a card and was then refused the sign-off
(`"you closed this job — someone else must verify it"`); the supervisor's
sign-off on the same card succeeded. Disabling that one line turns three checks
red in `test_guardwrite_v2.py`, including *"an OWNER still may not sign off what
the owner closed"*. `DECISIONS.md §10` is enforced server-side.

**The residual gap is `closer and ...`.** When the stored `done` card has no
`closedBy`, `closer` is falsy and the rule never fires. Verified: a `done` card
with `closedBy` deleted was signed off by the same owner who would otherwise
have been refused, and stored as `verifiedBy: u-owner, closedBy: None`.

Every honest close through this server stamps `closedBy` from the token, so the
reachable set is rows that reached `done` another way:

- data written before the stamping landed;
- `/admin/import`, which calls `push` with `actor=None`, and `_guard_rules`
  returns on its first line when there is no actor — so a restore writes any
  card in any state with no stamping at all.

**How many such rows exist is the owner's to check, in production, with the
owner's own hands.** I did not and will not probe it. The code fix is to treat a
missing `closer` as "unknown, so refuse" rather than "absent, so allow", but
that would also refuse the legitimate second signature on legacy cards — so it
needs the owner's call, not a reviewer's.

---

## F7. `Shell.mount(null)` draws the login over a live session

**Verified by running. A lockout, not a leak.**

With `S.user = {id:'u-owner', role:'owner'}` and a valid token:

```
Shell.mount(null) -> true
html gains .lg = true,  data-frame removed = true
drawn text: "Garage Saathi  Sign in to carry on  Loading"
S.user still signed in = {"id":"u-owner","role":"owner"}
```

Reachable whenever `firstScreen()` answers `LOGIN` or `null` while `S.user` is
set — in practice a `users` row on the device with no `role`.
`restoreSession()` sets `S.user` from `DB.get('users', id)` and never checks
that the row has a role; `firstScreen()` then returns `LOGIN`, and
`redraw()`'s `S.user ? ... : null` guard does not help because `S.route` is
already `'login'`.

**It is not a permission bypass** — nothing is drawn that the role does not
hold. It is the state `boot.js` says in its own comment *"must not be quietly
turned into the login screen"*, and it currently is. The cost is a person at a
gate or a pump looking at a sign-in screen while their session is actually
valid; online the next PIN heals it, because the server's `user` object
overrides the stale local row. Offline it does not heal.

**Decision I would ask for:** `mount(null)` with `S.user` set should draw
`§1.7`'s no-permission body under the normal frame, not `signedOut()`. Routing
"holding nothing" and "nobody is here" to the same function is the thing that
makes this reachable at all.

---

## Checked and found correct, so the next reviewer does not redo it

**The predicate — attacked and held.** `Caps.holds` returned `false` for every
one of: unknown screen id; missing, empty and non-array `declares`; unknown
capability name; a sentinel with no `openReason`; an unrecognised `openTo`;
`null`, `undefined`, an object, mis-cased (`"Owner"`) and whitespace-padded
(`"owner "`) roles; and the `Object.prototype` keys `__proto__`, `constructor`,
`toString`, `hasOwnProperty`. Deny-by-default holds for the owner too.
45 capabilities, 13 screens. `screensFor` per role matches `§4.4`'s slot table,
driver and conductor get `['me']` and an empty nav, an unknown role gets `['me']`
and nothing else.

**A fourteenth screen with no `declares` is reachable by nobody** — I added one
and `holds()` returned false for owner, supervisor and conductor. `test_v2_router.js`
goes red on it (2 failures). *Correction to my own first run:* that mutant
appeared to stay green because my scratch harness symlinked the test file and
Node resolved `__dirname` through the symlink to the real `caps.js`. The check
is real, not decoration. `SCREEN_IDS` is `Object.keys(Caps.SCREENS)`, live.

**Checks are load-bearing — two broken on purpose:**
- disabling `v2_perms.own_row_ok`'s backstop in `redact_for` turns **24** checks
  red in `test_readscope.py` (every *"does not get a colleague's"* case);
- disabling the self-verification line turns **3** red in
  `test_guardwrite_v2.py`, owner case included.

**`Router`.** No URL routing, so no deep link and no history to guard. `go()`
consults `reachable` before moving anything; `back()` re-checks the parent like
any route; `moduleFor` uses `hasOwnProperty`; `moreItems` comes from
`navFor(role)`; no toast, sheet or dialog on refusal.

**`Shell.mount` re-checks at mount time, so a stale route is refused.** Verified
by swapping `S.user` from owner to mechanic with `Router.current()` still
`money` and a screen module registered that renders a marker: body was
`refused()`, the marker did **not** render, the nav came out empty.
**One cosmetic residue:** `title(nameOf(id))` runs before the `allowed` test, so
the header reads "Money" over the refusal — it tells the next person on the
phone which screen the last person was on. Worth fixing with F7, not on its own.

**Offline sign-in cannot escalate to a privileged role.** `NO_DEVICE_PIN` is
owner, supervisor, crewmanager and `mayKeep()` is consulted against the role on
the record being signed in as, so those three have no offline branch at all.
The `known: true` ordering (a server-rejected PIN never falls through to the
cached one) is covered by `test_v2_login.js`'s own mutants, which I ran green.
One narrow residue, stated as an observation rather than a finding: if a device
syncs a promotion into a *non*-PII role (say conductor → office) and then goes
offline, the stale pre-promotion cached PIN opens the new role's screens. It
cannot reach the three PII roles, and `verified` overrides the local row the
moment the server is reachable.

**Sign-out drops what it claims to.** Token removed (`ls.removeItem('token')`),
actor cleared then reset — verified sequence `["u-owner", "", "u-m1"]` —
`S.user` null. `creds` and `gs-recent` survive by design and are documented;
`gs-recent` holds ids and names only, the PIN is still required, and `/roster`
publishes the same names anyway. Not a finding. F1 is about the replica, not
these two keys.

**Mechanic job-card writes.** Membership is read from the card *as stored*, never
from the body; `assignees`/`assignedTo` are carried over from storage; a
mechanic cannot open or delete a card. All verified refused.

**A conductor's token receives nothing it should not.** `jobcards`, `drivers`,
`crewnotes`, `gatechecks`, `usage`, `attendance` all returned zero records —
asked for each **by name** through `?store=`, which is the second path through
`pull()` and the one the `own_row_ok` backstop exists for.

**`users` records carry `{id, name, role, updatedAt}` only.** No salt, no hash.
Verified.

**`office` and the passenger.** Correctly stripped of `pnr`, `tin`, `seats`,
`fare`; correctly receives `stars`, `comment`, `source`, `dest`. There is **no
separate "board point" field** in the record — `_clean_review` has `boardAt`,
which is a boarding *time*. It does reach the office, deliberately, documented
in `v2_perms.py` as a widening that fixes a live defect and is named as the
owner's call. **It is live today and I found nothing recording that the owner
agreed to it.** Worth one line in the hand-over rather than a finding.

**`/roster` is unauthenticated** and lists every login id, name and role.
Pre-existing, documented, and `reserve_attempt` lockout stands behind the
four-digit PIN. Out of v2's scope; noted so it is not re-discovered.

---

## What I could not check

- **Production.** How many `done` job cards carry no `closedBy` (F6). Never
  probed, and the owner should run that count.
- **`/uploads/<name>` with real bytes.** My fixture uploaded none, so I
  confirmed only that the handler has no authentication in source.
  `LIVE-ISSUES §7` already verifies the behaviour.
- **A real browser.** Everything client-side above was driven through the real
  v2 sources in a Node sandbox (reusing `test_v2_login.js`'s own loader), not a
  browser. The `else` branch that calls `mount()` against a live document is
  still covered only by the project's own note on that gap. F1 in particular
  would be worth re-confirming once in a browser with IndexedDB, though the leak
  is in `Cache.load` and `FIRST_STORES`, which the sandbox exercises verbatim.
- **Measured budgets, the hardware floor, the flows as a person.** Out of scope
  for this pass — authorization only, as briefed.

## Method

Local server only: a fresh sqlite fixture under `scratchpad/rev/`, started with
`DB_PATH=... ENABLE_DEMO_SEED=1 PORT=8791`, seeded through the server's own
`/auth/users` and `/push`. Mutation testing was done in a scratch tree of
symlinks to the repo with only the mutated file replaced by a copy — no
application file in the repo was modified, and no git command was run.

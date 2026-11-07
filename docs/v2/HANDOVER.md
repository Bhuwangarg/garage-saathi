# v2 — what is done, and the nine things only you can decide

Written 2026-11-07, at the end of the build. Branch `launch-v2`, not pushed,
not deployed. Everything below is committed and green: 78 test files, 392 gate
checks, the Chrome 109 floor, v1/v2 isolation.

**Nothing here touches production.** The live app on `/` is unchanged and has
been throughout.

---

## Where v2 actually is

Thirteen screens plus a login, the shell that mounts them, the sync and
permission layers. Proven by booting `/v2/index.html` in a real browser and
watching a record reach disk — not inferred from a green suite, because for most
of this build a green suite was exactly what was hiding the defects.

Five stages ran: UX, UI, build, assemble, review. Three reviewers walked the
finished product — authorization, the hardware floor, and eight roles doing a
day's work. All three reports are in `docs/v2/review/`.

**What the pipeline found, and where.** Not one of the serious defects was
inside a slice. A screen nobody was asked to build (there was no login at all,
and `/v2` opened white). Four screens that answered no taps, because nothing
ever called their `mount()`. A `const` that never reached `window`, so every
write on nine screens was a silent no-op — a storekeeper issued a part and the
book never moved. And a test harness that manufactured the exact condition
hiding the bug it existed to catch. Every one lived between the slices, or in
the tooling.

---

## The nine decisions

Five are permission policy, which `CLAUDE.md` says is yours because this is a
business that handles cash. Two are cost. One is a query only you can run. One
is scheduling.

### 1. Q4 — does a crew manager hold salary? *(policy, live today)*
`redact_for` sends `salaryMonthly` for every crew record to `crewmanager`,
because the role is in `PII_ROLES`. The browser hides it (`people.js`'s gate is
`money`, which they do not hold), so **the de-facto answer today is yes, they
have it.** A field withheld by a screen's discipline is not withheld. Either
answer needs a server change; "leave it" means deciding that they hold it.

### 2. Does a crew manager hold passenger PNR, seats and fare? *(policy, live today)*
The strip is `and role == "office"` only, and `crewmanager` returns a branch
earlier. These are the exact fields `itslookup` is withheld for. The code's own
argument for stripping the office — that withholding one and not the other "only
looked strict" — was never applied here. **Verified live:** crewmanager gets
`pnr`, `seats`, `fare`; office correctly gets none.

### 3. `FIELD_REDACT` for live issue 10 — the face photo and the exit record *(policy, one tuple)*
`office` still receives every crew member's `photo`, `leftAt`, `leftReason`,
`leftReasonKey`, `leftNote` and `rehire`. §10 says in its own words that the
only reason it is recorded rather than done is that it changes what a live role
receives. **Narrowed since it was written:** the residual is `office` alone — a
conductor no longer reaches another crew member's photo, because `drivers` is
own-rows-only for store, mechanic, driver and conductor. Nothing in v2 breaks
when the server stops sending them.

### 4. §18 — the office and the review figure. In the branch, not deployed.
### 5. §22 — the gate round cannot pass a photo item offline.
A genuine trade-off, not a bug, and it needs an answer before screen #13 is used
in a yard at night.

### 6. Live issue 7 — uploaded files are served to anyone holding the URL
Partly hardened: `private, no-store`, nosniff and no CORS are in. The URL itself
is still the only credential.

### 7. §21 — the Hindi *(cost)*
§21 says 504 words, 459 new. **The live page reports 1,246 pending.** Worst
where it matters most: `login.js` is 29/29 pending and Me is 74/108 — the two
screens a driver cannot avoid, and Me is their whole app. One word for your eye
rather than mine: check-out currently renders as **"छुट्टी"**, which ordinarily
means *leave*.

### 8. A count only you can run *(production query)*
`DECISIONS §10` — the closer is never the verifier — **is** enforced on the
server for every role including the owner. The residual is narrower than it was
written: a `done` card with **no `closedBy`** lets the same person verify it.
Honest closes always stamp, so the reachable set is pre-stamping rows and
`/admin/import`, which pushes with `actor=None`. How many such rows exist is a
production question; I did not probe it.

```sql
SELECT COUNT(*) FROM records
 WHERE store = 'jobcards'
   AND (data::jsonb->>'status') = 'done'
   AND COALESCE(data::jsonb->>'closedBy', '') = '';
```

### 9. Two deploys that want a watched day *(scheduling)*
- **The replica rebuild.** A device whose signed-in person changes now rebuilds
  its replica, which costs one full sync per device. A phone offline at that
  moment has an honestly-stale app until it next has signal. Land it on a day
  the yard has wifi.
- **The job-card narrowing.** The one change in this branch that alters what a
  live device receives. Measured as invisible to v1 — its mechanic screens
  already filter to the same rule — but it should still go out when somebody can
  watch a mechanic open Jobs.

---

## Two things named and deliberately not solved

There is **no offline brute-force lock** on the PIN pad; v1 has one. Unlimited
offline guessing against a lost phone is your call, not mine.

v1's hard refusal of the retired public crew PIN is **not ported**, because a PIN
literal in source is what the rules here forbid. A device still holding a v1-
cached retired PIN could therefore use it offline. Named rather than solved
quietly.

---

## What is still engineering, and is not blocked on you

Hindi aside, the review left a short list that wants one more slice: no screen
reads `Cache.unread()` by name yet, so a store that could not be read is
distinguished internally but no screen says "Gate checks could not be read on
this phone". `title(nameOf(id))` still runs before the permission test, so the
header names the screen over a refusal. And the gate round's photo paths —
camera, the three photos, the 1.5-second hold — are unexercised by anybody,
because no automated browser can hold a camera up to a bus.

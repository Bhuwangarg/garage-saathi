# Decisions already made

Every stage reads this before it starts. A decision here is not re-opened by an
agent; if one looks wrong, say so in your report and leave it standing until the
owner changes it.

Dated 2026-11-04 unless noted.

## 1. The hardware floor stands — Chrome 109 on Windows 7

Confirmed by the owner. Not an assumption, not a thing to design around later.

- No framework runtime. No polyfills.
- No `oklch()`, `color-mix()`, CSS nesting, `@starting-style`, view transitions,
  subgrid, `@scope`, relative colour syntax, `light-dark()`, `text-wrap: balance`.
- No `Object.groupBy`, `Array.prototype.toSorted` and kin, `Promise.withResolvers`.
- Colour ramps are hand-written HSL.
- Icons are inline SVG. Never emoji — Windows 7 never shipped the full set, so
  emoji are grey boxes on the machines the office uses all day.
- Animate `transform` and `opacity` only.
- Budgets are measured on the fleet-sized fixture, on the slowest machine we can
  get, not on a developer's Mac.

`scripts/check-css-floor.sh` enforces the list. It is a hard gate.

## 2. v2 is built alongside v1, at its own path

Confirmed by the owner. v1 keeps serving the office, untouched, the whole way
through. v2 is reachable at `/v2` for the owner and a few testers, and becomes
the default only when the owner says so.

What this requires, and whose job it is:

- **Backend**: the static handler serves the v2 bundle under `/v2` without
  touching how `/` is served. Same server, same endpoints, same database — v2
  is a second client against the existing sync API, not a second system.
- **Service worker**: v2's worker must be scoped to `/v2` only. A worker that
  claims `/` would hijack the live app for every device that ever opened v2,
  and the office would have no way to get back. This is the single most
  dangerous detail in the cutover; it gets its own gate check.
- **Data**: v2 reads and writes the same stores as v1. A record written in v2
  must be legible to v1 and the reverse, for as long as both are running —
  which means v2 does not get to change a record's shape unilaterally. A shape
  change is a migration, with v1 taught to read it first.
- **Cutover** is one line changing what `/` serves, and is therefore also one
  line to undo. Keep it that way.

**What is proved about the worker scope, and what is not.** Worth stating
exactly, because the claim is load-bearing and I over-tested it before I could
not test it at all.

Proved: `/v2/sw.js` is served from inside `v2/` with `Content-Type:
text/javascript` and `Cache-Control: no-cache`; the registration passes no
`scope` option; neither the server nor `vercel.json` sends
`Service-Worker-Allowed`; and v1's worker returns early for `/v2` and anything
under `/v2/`. Each of those four has a check in
`scripts/check-v2-isolation.sh`, and each check was mutation-tested by breaking
the thing it guards.

Not proved: the live behaviour in a real Chrome. Service workers do not
register at all in the browser available here -- v1's own worker fails the same
way, and no network request for the script is even attempted -- so the cap was
never observed, only derived. It rests on the HTML specification, which bounds a
worker's scope by its own directory unless `Service-Worker-Allowed` widens it,
and on that header being absent.

So before `/` is switched to v2, somebody opens `/v2/` on a real machine and
reads `navigator.serviceWorker.getRegistrations()` in the console. Two
registrations should appear, one scoped to the origin root and one to `/v2/`,
and `navigator.serviceWorker.controller` on a `/v2/` page should name
`/v2/sw.js`. That is a one-minute check and it is the last thing standing
between a derived guarantee and an observed one.

## 3. The product direction from the approved v2 design stands

From `docs/superpowers/specs/2026-11-01-garage-saathi-v2-design.md` (committed).
47 screens become 14. Permissions invert to deny-by-default. ~968 emoji icons
become ~25 inline SVGs. Tenancy goes in the data model but no signup or billing
surfaces are built. These are not re-litigated per feature.

## 4. Still open — the owner decides, nobody else

- Whether a supervisor keeps company-level money visibility, in a business that
  handles cash. Today a supervisor reaches all 47 screens, identical to the
  owner. The proposed split is `dashboard` → `viewAlerts` / `viewCompanyBilling`
  and `bills` → `manageSupplierBills` / `viewSpendTotals`.
- Whether any supervisor actually does cash reconciliation — needs asking at the
  office, not inferring from the code.
- Device-level confirmation on the driver phones: versions are unmeasured.
- GPS retention on the device: 60 days locally against the server's 30. Halving
  it halves the login's cache read and loses history the server already discarded.

---

# Owner's answers, 2026-11-04

These came from the owner directly and override anything written before them,
including the 2 November decision and `v2-ux.md` as first written. Stage 1 is
being revised against them.

## 5. A supervisor DOES reconcile cash — the 2 November decision is reversed

The 2 Nov decision was that a supervisor loses company money visibility. The
owner says a supervisor actually does the cash reconciliation, so taking Money
away would stop a real job.

- The supervisor keeps **Money** (`v2-ux.md` #7).
- `dashboard` still splits, but into `viewAlerts` and `viewCompanyBilling`, with
  the supervisor holding both; the split stays worth having because it stops a
  future role inheriting money by accident.
- Because the money is deliberately shared, the owner should be able to see who
  looked at what. The `usage` store already records per-person screen use, so
  this is a screen on existing data, not new plumbing.
- **This does not soften `LIVE-ISSUES.md` issue 2.** A conductor token can still
  pull supplier bills, the ledger, job costs and gate selfies. Supervisor
  visibility being intended does not make everyone else's accidental.

## 6. Mechanics have phones, and may record their own start and finish

The friction worth the most in the whole inventory: supervisors key mechanics'
job cards, 3–13 hours a week. The owner confirms mechanics have usable phones
and may tap their own times.

So v2 gives a mechanic exactly **two one-tap writes** — `startAt` and
`completeAt` — on fields that already exist, which the server already permits a
mechanic to write.

- No record-shape change, so v1 keeps reading everything v2 writes.
- No new capability, no server change.
- A mechanic still cannot close or verify their own card. Sign-off stays with
  whoever may verify, which `02 §4.4` requires and which is the one rule the
  job card must not bend.

## 7. Drivers and conductors have logins but do not use them

Fourteen screens becomes **twelve**. Dropped as destinations:

- **Gate check** — becomes the supervisor's screen. The departure check still
  happens; it is recorded by the person who is actually holding a phone.
- **Trip cash** — moves into Money as the per-bus running cost it feeds.

Two consequences stage 1 must resolve rather than leave implied:

- The known Hindi defect was in the driver's trip-cash screen. If no driver
  opens it, that defect was never costing the hours it was ranked for, and the
  friction ranking changes. Say so rather than quietly keeping the estimate.
- A driver who does sign in must still land somewhere honest. A login with no
  screen is the dead end that cost a month of mechanics' time (`8db78e7`), and
  the conductor role already holds zero capabilities. Decide what a driver and
  a conductor see, or decide the logins go.

## 8. Tonight's running list lives in a register in the office

There is no schedule anywhere in the app, which is why the duty board could
count buses that never needed a driver (`ba274f6`).

The duty board gets a quick daily entry: pick the buses that run tonight, then
fill their seats. The count can then reach zero, which is the whole point — a
number that cannot reach zero teaches people to scroll past red.

No WhatsApp integration and no file import. Neither was asked for.

## 9. One budget in the foundation is a placeholder, not a measurement

Recorded because it would otherwise be mistaken for a measured number. The
"200 dense desk rows inside 250 ms" budget comes from the existing gate, which
admits the figure was set on a developer's Mac. Every density rule in
`v2-foundation-ui.md` is sized against it.

Stage 3 takes the reading on an actual office PC and the budget moves to
whatever that says. Until then it is an assumption wearing a number's clothes.

---

# Owner's answers, second round, 2026-11-04

Asked because the first round's answers, each sensible alone, put the parts, the
cash reconciliation, the departure record and sign-off on a supervisor's own
closed work into one pair of hands. The owner was shown that and chose two
controls rather than accepting it.

## 10. A supervisor's closed work needs a second signature again

**This reverses the 15 September decision** (`fbcd246`, hardcoded at
`app.js:3873` as `const selfSignsOff = (role) => role === 'supervisor'`), which
the commit records as the owner's own call at the time. The owner has now
changed it, knowing that is what it is.

In v2: a job closed by a supervisor sits in a verify queue for somebody else —
the owner, or the other supervisor. One tap by a second person per job.

- The existing shape already supports this. `closedBy` is written on close and
  `verifiedBy` on verify, both from the token, and `app.js:3019` already filters
  a verify list to `closedBy !== S.user.id`. The v2 rule is that filter applied
  to everyone, rather than skipped for supervisors.
- No record-shape change, so v1 keeps reading it.
- The owner still cannot sign off what the owner closed. That was true before
  and stays true, so the rule is now the same for every role.

**v1 is NOT changed by this.** `selfSignsOff` is live and supervisors are
signing off their own work today. Bringing v1 into line is a production
behaviour change and a separate decision — if it is wanted, say so and it goes
on its own branch through the gate. Until then v1 and v2 differ here on purpose,
and that difference is worth knowing when the two are compared.

## 11. The supervisor records trip cash

Dropping the driver's Trip cash screen left Money's per-bus running cost with no
input, which would have made that number wrong rather than absent. The
supervisor enters it: bus, date, allowance given, expenses back, on Money.

Noted honestly: this adds to the same supervisor's load, and it is money entered
and reconciled by one person. Decision 10 is the control that offsets it, and
the owner chose it knowing both.

## 12. The departure check keeps everything, selfie included

The ten items, the photo and the hold decision all stay, and the supervisor
photographs the driver at the gate. So the record still evidences who took which
bus out, which is what it was for — recorded by a different pair of hands than
before, but about the same person.

This is the second control the owner chose, and it is why moving the check off
the driver does not cost what it looked like it would.

## 13. Building without the job-card measurement, on the owner's instruction

`MEASURE-JOBCARD.md` was written, the owner was told the plan's largest claim is
currently unfalsifiable, and he chose to time it. Asked again, he said to carry
on and build. So stage 2 and stage 3 proceed without the reading.

What that means, stated here so it is not discovered later as a surprise:

- "Supervisors lose 3 to 13 hours a week keying mechanics' job cards" remains an
  **estimate built on two inferred numbers**. It is the stated justification for
  the Job card screen and the mechanic's two taps.
- The mechanic's two taps are cheap and almost certainly worth having whatever
  the reading says — they remove retyping, and they cost no new capability, no
  record-shape change and no server work.
- What the reading could still overturn is the **ranking**, not the feature. If a
  card takes ninety seconds, or if most of the time is interruption rather than
  typing, then this was not the biggest friction in the business and something
  else should have been first.
- The protocol stays in the repository. It is five cards and one afternoon, and
  it is worth taking at any point — before the screens are built, while they are
  being built, or after, as the before-number that says whether v2 helped.

Nothing else in the plan depends on it.

## 14. v2 owns its own copy of the shared layer

v2 needs the data layer (`db.js`, `sync.js`, `pullapply.js`) and the design
system (`ui/`). There were two options and only one of them survives contact
with "v1 keeps serving the office".

**Rejected: v2 references v1's files.** One design system, no divergence — and
every edit v2 makes lands in the live app the same minute. A token tweak for a
v2 screen would repaint v1 for a hundred people who did not ask for it, and a
mistake in the data layer would take the business down with it. The isolation
check exists precisely to stop v2 reaching across that line.

**Chosen: v2 has its own copy under `v2/`.** `v2/db.js`, `v2/sync.js`,
`v2/pullapply.js` and `v2/ui/`. v1 is untouched by anything v2 does, and the
only shared surface is the server and the database — which is the surface we
deliberately keep shared so both clients read the same records.

The cost is real and worth naming: **the two will diverge.** A fix made in one
does not reach the other, and six months of that is two codebases. Mitigations,
in order of how much they are worth:

- v2 is meant to replace v1. Divergence is a cost that ends at cutover, not a
  permanent tax — so the answer to "we are maintaining two" is to finish.
- Anything fixed in v2's copy that v1 also needs is back-ported deliberately, as
  its own commit with its own gate run, never by sharing a file.
- The copies start byte-identical, so the first `diff` after cutover shows
  exactly what v2 changed and nothing else.

One thing this copy is NOT allowed to inherit quietly. `LIVE-ISSUES.md` issue 1
is live in `sync.js`: a push that loses the `updatedAt` comparison is dropped
with no else branch and the client clears the batch under the comment
"everything else landed", so a change can vanish with the screen saying it sent.
v2 starts from the same code, so **v2 starts with the same bug**, and fixing it
in v2's copy is a stage-3 backend slice rather than something to be noticed
later by somebody losing a job card.

## 15. Duty board splits in two — thirteen screens, not twelve

Stage 1 named Duty board the weakest point in its own plan: it answered two
questions, and was merged that way because of the twelve-screen budget rather
than because the questions belong together. Stage 2 specified it as one screen,
confirmed it works, and then recommended the split anyway, with the reason that
decides it:

**The two counts empty at different hours of the evening.** Seats are filled
before the buses leave; departure checks arrive as each one goes. One screen
showing both therefore always has a number that is not yet zero, which is
exactly the `ba274f6` defect — a count that cannot reach zero teaches people to
scroll past red, and this plan exists partly to stop that.

So:

- **#9 Duty board** (`assignDriver`) — tonight's running list ticked off the
  office register, the three seats per bus, who is free, and the duty-log
  lookup. Gate state appears here as words, not as a pressable thing.
- **#13 Gate round** (`gateCheck`) — the ten items, the driver's photograph
  taken by the supervisor, and the hold decision.

The cost is one screen, one row in the rail for the owner and supervisor, and
nothing else: no new icon, no new token, no new capability. The owner approved
"about fourteen"; thirteen is inside that.

This is a design judgment made on evidence, not an owner decision, and it is
recorded here so it can be overruled in one line if he disagrees.

## 16. `gateCheck` loses `driver` in v2's capability table

F1 transcribed v1's 37 capabilities verbatim, as instructed, and then flagged one
it could not transcribe without creating a leak. It was right, and this records
why so nobody "restores" it later.

v1 has `gateCheck: ['owner', 'supervisor', 'driver']`. In v2, **both** Duty board
and Gate round declare `gateCheck` — so a driver holding it reaches both screens.
That contradicts `DECISIONS.md` §7 and `v2-ux.md` §4.2 and §4.4, which give a
driver **one slot, Me, and no capabilities at all**. It would have been
LIVE-ISSUES issue 2's shape — a screen open to a role nobody intended — produced
by faithful transcription rather than by carelessness.

So v2's table drops `driver` from `gateCheck`. One line, flagged rather than
done quietly, and it changes nothing on the server: `_guard_gatecheck` still
lets a driver create their own check, which is v1's live flow and must keep
working.

**Two v1 capabilities are retired rather than transcribed**, both orphaned in v2
because no screen declares them: `manageRoutes` (owner, supervisor) and
`liveMap` (crewmanager). They are in `Caps.RETIRED` with the line of §5.2 that
retires each, and the check asserts the computed orphan set **equals** that list
— so a capability that becomes orphaned later cannot drift out of sight, and one
that stops being orphaned cannot stay listed.

## 17. The thirteen screen titles stay English in `Caps.SCREENS`, and P3 exempts them

F1 raised this as a seam it would not decide alone, which was right.

`Caps.SCREENS` holds thirteen English titles plus "More". P3's rule — no
capitalised English outside a `W.register` literal — would flag every one.

**Decision: P3 exempts `Caps.SCREENS`'s `title` field specifically**, not
`caps.js` as a whole. The reason is `screens-shell.md` §1.6: one name, three
places, never a synonym. That table is the single source of the thirteen names,
and a check that can see all thirteen in one literal can verify the rule; the
same names reached through word ids could not be verified in one place.

`word` already exists beside `title` for the Hindi id, so nothing is lost: the
English is canonical and verifiable, the translation is keyed, and P3's rule
still binds everywhere else — which is where English actually leaks.

## 18. Pending the owner: the office has never seen a review figure

**This needs a yes or no before it reaches production.** It is in the branch and
not deployed.

The role walk found the office login showing "Last 7 days 0, — average, — 1★"
on its own landing screen, every review dated "—", while a crew manager on
identical data saw "4 / 2.75 average / 25% 1★". The cause is one field:
`redact_for` strips `boardAt` from `rbreviews`/`rbcomplaints` for the office,
and **every** office figure — the last-N-days counts, the scorecard, the trace —
is computed from boarding time. Restoring it in memory made the screens correct,
which is causation rather than correlation.

**It is not a v2 regression.** v1 strips the same field for the same role and the
contract's §3.3a called that "unchanged", so this has been true in production
since the office login existed. It is the **second** time this login has been
broken by a redaction rule: commit db6101f fixed it receiving no reviews at all,
and the same screen has been showing zeroes ever since for a different reason.

**Why it is the owner's and not a bug fix.** Restoring the field **widens** what
a live role receives. The office is deliberately outside `PII_ROLES` — it may
never hold an Aadhaar, a licence or a salary — and this gives it the time a
passenger boarded a bus. The argument for is that a date is not a booking
credential: the PNR, the ticket id, the seat, the fare and the amount are, and
all five are still withheld. The argument against is that it is still a
passenger's movement, and the owner may prefer the office to work from stars and
text alone.

Pick one:

- **Restore `boardAt` for the office.** The screens work. The office learns when
  passengers boarded buses, and nothing else new.
- **Leave it stripped and change the screens instead**, so they stop computing
  from a field the office does not have and say plainly that dates are not
  available to this login rather than showing zero. More work, and the trace
  gets weaker, but no widening.

What must not continue is the current state, where the screen shows a number
that is always zero and reads as "no complaints" rather than "no data".

A wrong fixture helped hide this: `test_office.py` had `boardAt` set to a place
name, `"Jaipur Sindhi Camp"`, which the date parser rejects — so the test passed
while asserting nothing about dates at all.

## 19. The one cost basis, settled where two specs disagreed

The whole point of "one cost basis per bus" is that two screens cannot show
different numbers for the same thing. Two specs then described it differently,
which is the same failure one level up.

- `screens-money-people.md` §1.1: **six** parts, trip cash as `trips.expenses[].amount`.
- `screens-assets.md`: **five** parts, trip cash as allowance minus returned.

**Money's spec wins, and the six parts stand**, for the reason the specs
themselves give: Money computes and Buses reads, so the computing screen's
definition is the definition. P2 built it that way and flagged the conflict
rather than picking quietly.

On trip cash specifically, the six-part version is also the right one under the
rule the basis is built on — *one rupee, one source record, one part*. Each
expense is a record. "Allowance minus returned" is a derived figure that happens
to equal the same number **only when every expense was written down**, and when
it does not, the two silently disagree and neither says which is short.

**A spec bug came out of the same review and is fixed in the file.** The Parts
row said `sum(qty × cost)`. In v1, `partsUsed[].cost` is already the line total —
`app.js:1638` sums it alone and `app.js:7682` accumulates it the same way — so
`qty × cost` would have multiplied every parts figure by its quantity. Two brake
pads at ₹900 would have read ₹1,800, on the screen whose job is to reconcile.

**Two smaller resolutions from the same slice**, recorded so they are not
re-decided:

- A bus with no trips returns `0` with `n: 0`, not `null`, so a screen can say
  "no trips recorded" without withholding the whole total. `null` is reserved
  for *unknown*, which is a different thing from *none* (`v2-foundation-ui.md`
  §3.6).
- Component send-out and return entries carry no `busId` in v1, so the
  component's own `busId` is used. That is an inference, and if a component is
  moved between buses mid-repair it attributes the cost to where it ended up.

## 20. The row budget, measured at last — and what it already decides

§9 recorded that "200 dense desk rows inside 250 ms" was a placeholder taken
from a developer's Mac. M1 built the instrument and took real readings. The
placeholder is still not the office's number, but it is no longer the only
number.

**On an i9-9880H, Chrome 156 headless, 1024×768, load 0.23 per core.** All three
runs, never the best, because two beds disagree with themselves:

| Bed | Run 1 | Run 2 | Run 3 |
|---|---|---|---|
| 200 desk rows | 51.3 ms | 42.8 ms | 42.7 ms |
| 200 Attention reason rows (wrap rule, scratch) | 56.5 ms | 43.1 ms | 42.2 ms |
| **2,384 catalogue rows, all drawn** | **619.4 ms** | **525.7 ms** | **409.6 ms** |
| 2,384 windowed, first draw | 18.6 ms | 6.9 ms | 9.3 ms |
| 2,384 windowed, 10 scroll steps | 88.9 ms | 84.5 ms | 87.1 ms |

**What this already decides: the Store catalogue must be windowed, and that is
no longer a preference.** Drawing all 2,384 rows costs 410–619 ms on a fast
machine with sixteen cores. The office runs Core 2 Duos, where this class of DOM
work is commonly five to ten times slower — so the full draw is plausibly two to
six seconds there, and the windowed draw stays in the tens of milliseconds. The
Store designer wrote that its desk catalogue "rests on three compounded
guesses"; one of the three is now a measurement, and it says do not draw them
all.

**200 rows is comfortable** — about 43 ms against a 250 ms placeholder, roughly
six times of headroom on this machine. That is reassuring and it is not proof:
the headroom is on the wrong hardware.

**What the instrument does not model**, printed in its own output so nobody
over-reads it: the Core 2 Duo, Chrome 109 and Windows 7; paint and compositing;
scroll smoothness; Hindi fonts; real data; the 864 px desk width; memory
pressure. Two beds vary by 1.5× and 2.7× run to run, and it flags that rather
than averaging it away.

**It asserts no time threshold**, by design. It exits 1 only when a bed draws too
few rows or a row is missing a part — proven by breaking a scratch copy two ways
— and exits 0 with a loud NOT MEASURED banner when load per core exceeds 0.7 or
the steadiness probe wobbles. A test that hard-codes today's milliseconds fails
on a busy machine and teaches people to delete it.

**To get the office's number** (five minutes, needs no developer): copy `v2/ui`
to a Windows 7 machine, open `gallery.html`, type the machine's name in the box,
press each Draw button once on a fresh page, photograph the screen. The gate
threshold is then a one-line edit, and it is mine, not a builder's.

One honest gap: bed 2 cannot measure the real Attention row yet, because
`.v2row-why` does not exist until P1 lands. M1 measured a scratch copy with the
wrap rule added and reported both numbers rather than the convenient one.

## 21. Pending the owner: the Hindi. 504 words, of which 459 are genuinely new

**You are the only Hindi speaker on this project.** Every Hindi string in v2 has
to come from you, and this records exactly what is needed so it is a short task
rather than an open-ended one.

**Where it stands:** 21 chrome words — the frame, the nav, the states, the
buttons — are **done and translated**. An empty Hindi value on any one of them
fails the test run, so they cannot rot. 28 screen labels are registered with
English only and are **pending**. The total will be roughly 130 by the time
thirteen screens are built.

**What a pending label looks like to a Hindi reader, right now:** `Me [meTitle]`
— the English, with its id in brackets. Always, not in a developer mode. v2 has
no build step, so a mark only developers see is a mark nobody acts on. It is
deliberately ugly, because the alternative is a Hindi user seeing clean English
and assuming that is the design. That is the defect `v2-foundation-ui.md` §6.3
records.

**Why this matters more than it looks.** The owner's answer that drivers and
conductors do not use their logins collapsed the trip-cash Hindi estimate from
about five hours a week to zero, and the ranking was honestly withdrawn. The
*mechanism* did not collapse with it: it now points at **Me**, which for a
driver and a conductor is their entire application. A Hindi gap there is worse
than it was on one screen.

**How to supply them.** `test_v2_words.js` prints the pending ids on every run,
pass or fail, with the English beside each. Give that list back with the Hindi
and it goes straight into `v2/ui/words.js`. Nobody has to interpret anything.

**The target is zero, and the count is the measure.** If it never falls, the
mechanism has become the fallback it was built to replace — which P3 said about
its own design before anyone else could, and it was right to.

## 22. Pending the owner: the gate round cannot pass a photo item offline

**A genuine trade-off, not a bug, and it needs a decision before screen #13 is
used in a yard at night.**

Three of the ten departure items need a photograph — `ac`, `blankets`, `cabin`.
In v2's gate round, **the photograph is uploaded before the check is created**,
and if the upload fails nothing is created: the supervisor sees a named refusal
with a Retry. So **offline, the round cannot start a check and cannot pass those
three items.** It can still record a Problem on all ten, send the check to the
office, and release a bus.

**Why it was built that way.** `LIVE-ISSUES.md` issue 9: v1 falls back to storing
the image **inline as a `data:` URL** when the upload fails — which is the normal
path for a phone in a yard — and `gatechecks` is in no server send window, so
every one of those images is sent for ever to every entitled device. v2 refusing
to inline is what stops that accumulating.

**And the obvious middle option does not work today.** Queue the photo, create
the check, patch the image in later — except `selfie` is in `GATE_FIXED`, so the
server **refuses** any later write to it. The builder's own words: that path
would be worse than v1, because the work would be lost rather than merely heavy.

So there are three real options and they cost different things:

- **Accept it as built.** Offline, a supervisor can fail a bus but not pass the
  three photo items. Simple, safe, and it means the screen is degraded exactly
  where it is most likely to be used — outside, at night.
- **Fund a photo queue outside the record.** The image goes to a local queue with
  its own id, the record refers to it, and a background flush uploads it and
  rewrites nothing the server protects. Real work, and it needs the server to
  accept a late reference without `GATE_FIXED` refusing it.
- **Accept inline bytes deliberately**, as v1 does, and add a
  `GATECHECKS_HISTORY_DAYS` send window so they stop accumulating for ever. This
  is the cheapest of the three and it trades privacy exposure for function: the
  images then live in the sync stream of every entitled device until the window
  drops them.

**My recommendation is the third**, with a short window — because a departure
check is worthless if it cannot be completed where departures happen, and a send
window turns "for ever" into "a fortnight", which is the part of issue 9 that
actually hurts. But it widens what sits on devices, so it is the owner's call
and not mine.


### §21 corrected, 2026-11-05: the number was 28, then 130, and it is 504

I told the owner 28 pending labels and about 130 by the end. With six screens
built, `test_v2_words.js` reports **567 registered, 525 pending**, and a parse of
the registrations puts it at **504 with an empty Hindi value**. The estimate was
out by a factor of four, and the reason is simply that each screen registers far
more labels than the chrome did — Me alone registers 107.

**How much of it is already translated somewhere in the owner's own app**, since
the Me builder found 34 by hand and that suggested a shortcut:

| | |
|---|---|
| v1's `i18n-hi.js` | 1,116 translated ids |
| v2 pending | 504 |
| **already translated under the same id** | **1** |
| **same English text under a different id** | **44** |
| **genuinely new, needs the owner** | **459** |

So mining v1 saves **45 of 504, about 9%** — worth doing because it is free and
mechanical, and not the shortcut I was hoping for. v2's copy is mostly new
wording, which is what a rewritten interface means.

**The honest ask is therefore 459 strings, not 130.** That is a real afternoon's
work for the only Hindi speaker on the project, and it is better to know now than
at the end. Two things make it smaller than it sounds: `test_v2_words.js` prints
every pending id with its English beside it, so it is a list to work down rather
than a hunt; and a pending label is visibly marked in the app, so shipping
before it is finished degrades honestly instead of silently.

**A note on how this number was got.** My first measurement returned "0
reusable", which was not a finding but a broken regex — I had guessed at the
shape of `i18n-hi.js` instead of reading it, and the table is
`window.I18N_HI = {...}` with several pairs per line. A zero from a parse that
matched nothing looks exactly like a zero from a real search, which is the same
trap three separate checks fell into earlier in this project.

## 23. Two rulings the screen builders asked for, and one correction to my own briefs

**Ruling 1: a row figure is not marked stale; the aggregate is.**

S1's shell says "every figure is stale when the replica is incomplete".
`figure()` adds a `.figure-note` whenever `stale` is passed, so obeying that
literally puts a note on **every row** while a device is still filling. Slice W
and slice T both stopped and asked.

The ruling: **mark an aggregate stale, leave a per-record reading plain.** A
count over a store that is still arriving really is provisional. A single
record's odometer reading is not — it is that record's, complete, and a note
beside it says something untrue. `Shell.body`'s `guardFigures` is therefore
over-broad and will warn-name screens during a first fill; that warning is
S1's to narrow, and it is a warning rather than a failure, so it does not block.

**Ruling 2: `closeJob` and `moveJobBus` are real capabilities now.**

Slice W found that `mayCloseJob` was never a capability — v1's is a role helper
at `app.js:3887` — so `Caps.can(role, 'mayCloseJob')` answered **false for
everybody** and the close button would have been absent for the two people who
hold it. Slice T found the same for `manageSupplierBills`, an unbuilt half of
the `bills` split, and aliased it.

Both are minted in `caps.js` from the **server's** rules, not from a screen's
belief: `closeJob` is owner and supervisor (`sync_server.py:1760`), `moveJobBus`
is the owner alone (`:1702`, because it moves money after sign-off). They are
`gates` on the Job card rather than declarations, which is the distinction F1
built `gates` to carry, and `test_v2_router.js` now asserts both role lists
against those server lines rather than merely counting capabilities.

The principle: a role list inside a screen file is the v1 pattern that let
permission and reachability diverge. If something is a permission, it lives in
the one table where the matrix can be read and checked.

**A correction to six briefs I wrote.**

Every screen brief said the field-guard rule — return early on
`input, select, textarea, label, .num` **before** reading `[data-act]` — was
"checked by `predeploy-gate.sh:508` and the sweep at `:1073`". That was wrong.
Line 508 is a comment, 1073 is a timing line, and **the gate never opens `/v2`
at all**; both of those blocks are v1's. I repeated line numbers out of the
frontend cut without opening the file.

Every builder implemented the rule and wrote its own check, so nothing shipped
broken — but nothing enforced it *across* v2, so a fourteenth screen could have
omitted it in silence. Slice T found it and supplied a static check, now in the
gate: for each `v2/screens/*.js`, the guard's line number must be lower than the
`[data-act]` read's. Static on purpose — the ordering is the whole point, and a
grep can see an ordering a click cannot.

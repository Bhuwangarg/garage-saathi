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

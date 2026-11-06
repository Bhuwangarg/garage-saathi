# Garage Saathi v2 — UX plan (whole product)

Stage 1 of the pipeline (`docs/v2/PIPELINE.md`). Written 2026-11-04.
**Revised 2026-11-04 against the owner's answers** in `DECISIONS.md §5–9`, and
reconciled with `docs/v2/plan/v2-foundation-ui.md` (stage 2a).
Input read in full: `docs/v2/inventory/README.md` and all five inventory documents,
`docs/v2/DECISIONS.md`, `docs/v2/LIVE-ISSUES.md`,
`docs/superpowers/specs/2026-11-01-garage-saathi-v2-design.md`,
`docs/v2/plan/v2-foundation-ui.md`, and the git commit bodies named below.

**Target:** 53 routes (`01 §0`) become **12 screens** — fourteen as first written,
twelve after the owner's answer on crew logins (`DECISIONS.md §7`). The reduction
itself is settled (`DECISIONS.md §3`). What is decided here is *which* twelve, and
what is lost.

### What the owner's answers changed in this document

| Answer | Effect here |
|---|---|
| **A supervisor does reconcile cash; the 2 Nov decision is reversed** (`DECISIONS.md §5`) | The supervisor **keeps Money (#7)**. `dashboard` still splits into `viewAlerts` + `viewCompanyBilling` with the supervisor holding both. A **who-opened-what** surface is added to Me (#12), reading the `usage` store. Q1 and Q2 closed |
| **Mechanics have usable phones and may record their own times** (`DECISIONS.md §6`) | §3.2 is approved as argued: two one-tap writes, `startAt` and `completeAt`, existing fields, no new capability. Q3 closed |
| **Drivers and conductors have logins but do not use them** (`DECISIONS.md §7`) | **Gate check and Trip cash are dropped as screens.** 14 → 12. *(Corrected 2026-11-06: this arithmetic is wrong and the outcome is right. Trip cash was never one of `spec §5`'s fourteen. The actual delta is **three** dropped — Map (#10), Gate check (#12) and Challans (#13) — and **one** added, Job card, which §5 folded into Jobs. Map's content lives on Buses as the bus's own position and Link GPS; Challans' lives on Attention as a ranked row and on Buses as its own card. Reconciling the two documents without this note reads as two screens having gone missing, which is what it cost me once — see `plan/INTEGRATION-NOTES.md §18`.)* The departure check moves to the Duty board as the supervisor's. Trip cash folds into Money. The trip-cash Hindi friction is **re-ranked to zero** (§2.3). A driver and a conductor now land on **Me and nothing else** (§4.2), which is resolved here rather than left implied. Q5 closed |
| **Tonight's running list is a register in the office** (`DECISIONS.md §8`) | The Duty board gets a quick daily entry: pick tonight's buses, then fill their seats, so the count can reach zero. **This is the one thing in the plan that needs a data addition**, and §6 states the only safe shape for it. Q8 closed |
| **The 200-row / 250 ms desk budget is a placeholder, not a measurement** (`DECISIONS.md §9`) | §7 measure 10 no longer implies it is measured |
| **A supervisor's closed work needs a second signature again** (`DECISIONS.md §10`) | **Job card (#4)** and the verify queue on **Attention (#2)**: the closer is never the verifier, for every role including the owner. One line, no shape change — and §6 names the two places it is **not** enforced (the server still permits it; v1 still self-signs). §7 measure 12 counts it. Q14 closed |
| **The supervisor records trip cash** (`DECISIONS.md §11`) | **Money (#7)** gains a quick entry — bus, date, allowance given, expenses back — filled on the gate round (§3.3). Money entered and reconciled by one person, offset by the decision above. Q15 closed |
| **The departure check keeps everything, selfie included** (`DECISIONS.md §12`) | **Duty board (#9)** keeps the ten items, the photos, the hold and the selfie of the driver, now taken by the supervisor. The record still evidences who took which bus out. Q16 closed, and §5's "what is lost" item 8 is withdrawn |

**Eight of the sixteen owner questions are closed.** Eight remain — Q4, Q6, Q7, Q9,
Q10, Q11, Q12, Q13 — and none of them blocks stage 2; only Q9 could change whether a
screen exists. The concern I raised about separation of duties was answered with two
controls rather than accepted: §8 and §9.

## Evidence labels used throughout

| Label | Means |
|---|---|
| **[E]** | A commit body, a `.md` in the repo, or the training manual states it. Strongest available. |
| **[C]** | Read from source by the inventory (01–04). A fact about the code, not about a person. |
| **[D]** | A document is written in a way that only makes sense if it is true. |
| **[I]** | I inferred it. **Treat as a question, not a finding.** |
| **UNKNOWN:** | I do not know and will not guess. The question follows. |

**`USECASE_REVIEW.md` is not used as evidence anywhere in this document.** It is a
reviewer's reading of a ~1,900-line version of an app that is now 14,184 lines, and
every "user need" in it is an imagined persona (`05 §0`). Nothing here rests on it.
The strongest real evidence is the commit bodies, which repeatedly name a reported
problem and what it cost.

**Three facts are taken as settled and are not re-derived** (per the brief):
all 8 roles have a login (`NO_LOGIN_ROLES` is empty, `02 §1`; `SITEMAP.html` and the
training manual are both wrong, `01 §7.3`); permission, reachability and the server's
read boundary enforce three different policies today (`LIVE-ISSUES 2, 6`); v2 is a new
client against the same server and the same 41 stores, at `/v2`, and may not change a
record's shape (`DECISIONS.md §2`).

---

## 1. The job

**The product.** About a hundred people at one bus company, on a Tuesday, each with
ninety seconds and one question. A supervisor at a desk at 7am with a paper slip in
his hand, typing yesterday evening's four workshop times into a card for a mechanic
who wrote them on paper at six ([E] 927864c; [D] manual Part 2). A storekeeper at a
counter with a mechanic waiting, handing out a part that must come down off a job card
or not at all ([E] manual, 2299533). A crew manager at the diesel pump with a phone,
or at a desk filling three seats on every bus that runs tonight ([E] 2e5c4cd,
ba274f6). Somebody at the bus at 20:00 in bad light, ten checklist items and a 1.5-second hold
between that bus and the gate — which the owner has now decided is the supervisor
rather than the driver, because the driver does not open the app ([E] 8a8cde5;
`DECISIONS.md §7`). A mechanic under a bus with dirty hands and no signal ([D] manual Part 1). And the owner
at 6.40am, phone in one hand, having typed the fourth digit of his PIN, waiting 30–36
seconds for a cold server because his role's PIN is deliberately never stored on the
device ([E] 6fa0a6d; `02 §4.3`). Every one of them is trying to finish one thing and
put the phone down. The app they have asks them to find it among 53 routes first.

**Per front door** (the spec's four, `spec §6`):

| Front door | Roles | The moment | What they are trying to finish |
|---|---|---|---|
| **Floor** | driver, conductor | At the bus, before departure or on the road | **Revised:** they have logins and do not use them (`DECISIONS.md §7`). What is left that is genuinely theirs: be recorded as present (attendance is wages), hold their own documents, read their own rating and their own coaching note, and say something is wrong with their bus. One screen. §4.2 says why that is the honest answer rather than a dead end |
| **Workshop** | mechanic | Under a bus, mid-shift | Know which bus is next and what is wrong with it; get the work recorded as mine without writing anything ([E] 38e1914) |
| **Specialist** | store, crewmanager, office | At a counter, at a pump, at a desk | One narrow job, completely: parts and bills; seats and consumables; crew performance ([E] 2e5c4cd, CREW_BANK.md, 2c72951) |
| **Command** | owner, supervisor | Office desk (Windows 7, Chrome 109) and phone | Owner: is today under control, and what only I can settle. Supervisor: is every bus moving, is nothing standing idle ([E] 000c3dd) |

`000c3dd` is the clearest single statement of the owner/supervisor split in the whole
record, written when they were given different home screens: *"the supervisor's home
now leads with what is in the workshop right now… the owner's home leads with money…
nothing on it is a task they would do themselves."*

**UNKNOWN: who the hundred people are.** No document in the repo says ([E] `05 §0`).
Headcounts for mechanic, store and office are all [I]; driver counts disagree across
five sources (54 / 107 / 108 / 110 / 165 logins — contradiction C6). The app's own
Usage and adoption report answers this exactly and nobody has read its output. This is
owner question 1 below, and it is the cheapest question in this document to answer.

---

## 2. What they do today

### 2.1 The shape of the thing

| | Today | v2 |
|---|---|---|
| Routes / screens | 53 routes, 59 view functions, 69 `view*` functions (`01 §0`) | **12 screens** |
| Modal sheets (where most writes happen) | 45 (`01 §1.2`) | not counted here; stage 2's problem |
| Bottom-nav slots across roles | 29 (`01 §0`) | ~45 (see §4.4) |
| Screens reachable by nobody | 2 (`warranty`, `forecast`) + 2 more with only dead-code openers (`company`, `routes`) + the `buses` list (`01 §1.3`) | 0 — a screen declaring no capability is a build error (`spec §7`) |
| Roles whose login lands on a screen with nothing on it | 2 would, after `DECISIONS.md §7`, if Today were kept for them — which is why it is not (§4.2) | 0 |
| Dead code in the home dispatcher | ~110 lines after the 8 role branches; `openReports` and `openRoutes` are stranded in it (`01 §1.2`, LIVE-ISSUES 6) | — |
| Enforcement mechanisms | 3, disagreeing: `PERMS` (37 capabilities), navigation, server `redact_for` (LIVE-ISSUES 6) | 1 |
| URL routing / deep links | none; login always lands on `home` (`01 §1.2`) | out of scope here |

### 2.2 Counted costs of the current flows

Tap counts below are derived from the openers traced in `01 §1.3` and `01 §3.2`.
They are [I-count]: read from the code's navigation, not observed over a shoulder.

| Flow | Today | Cost |
|---|---|---|
| Supervisor: a mechanic's four workshop times onto a card | Mechanic writes them on paper at six; supervisor types them next morning. Card entry is a 3-step wizard with a draft (`01 §4.4`) | **Two people, two media, one record.** 2 × 40–80 cards/week × 5–10 min = **3.3–13 h/week, midpoint 8** ([E] 927864c; [D] manual; `05 §3` row 1 — the top friction by its own ranking) |
| Mechanic: "the work is done" | Said aloud to the supervisor. There is no button ([D] manual Mechanic chapter) | ~1.5 h/week (`05 §3` row 5) and the supervisor's clock stays manual |
| Owner: reach the job board | No Jobs tab. Must go via the "In the workshop now" card — the manual teaches this as a workaround (`05 §4` row 14) | 3 taps where 1 is possible |
| Supervisor: reach fuel, bills, reports, vendors, crew bank, crew PINs, coaching | **Impossible through the interface**, while holding the capability for all of them. `viewSupervisorHome` is 55 lines offering 7 destinations; `viewMe` is settings (LIVE-ISSUES 6; `01 §1.3` item 4) | ∞ taps |
| Anyone: "what is wrong?" | 5 screens answer it from different angles — `alerts`, `insights`, `pilferage`, `safety`, `breakdowns` — plus triage rows on two homes (`01 §5.2`) | 5 screens nobody opens (`spec §5`) |
| Anyone: "what is it costing us?" | 8 screens with **at least five different per-bus cost bases** (`01 §5.2`) | the numbers disagree, so people stop reading them |
| Driver: log a trip expense | Trip-cash card on the driver home; the screen is **English-only in Hindi mode** ([E] GO_LIVE "Still open") | **Re-ranked to zero — see §2.3.** The 3.6–7 h/week in `05 §3` row 3 assumed 54 drivers × 4 trips, both [I]. No driver opens the app, so that cost never existed |
| Owner / supervisor / crewmanager: sign in | PIN never cached for these three roles, so that one request **is** the login: 30–36 s on a cold server, worst first thing in the morning ([E] 6fa0a6d) | 0.1–0.5 h/week, but this is the abandonment risk for the three people who run the garage |

### 2.3 The friction ranking, re-ranked honestly after the owner's answer

`05 §3` ranked ten frictions by people-hours lost per week, and said so plainly about
its own method: *"Treat the ordering as a ranking of my assumptions, not of reality"*,
and *"Rows 3, 6 and 8 depend on crew signing in at all. If they do not, rows 3 and 8
collapse to zero and the real friction is that those people have no tool."* The owner
has now answered: they do not sign in. So the ranking moves, and the number I carried
at **mid 5 h/week goes to 0**.

| Was | Friction | Was (h/wk) | Now | Why it moved |
|---|---|---|---|---|
| #1 | Supervisor keys the whole job card | 3.3–13, mid **8** | **unchanged, still #1** — and now partly answerable: two of the four workshop times stop being double-entered (`DECISIONS.md §6`) | Confirmed by the owner, not re-ranked |
| #2 | Matching passenger reviews to crew by hand | 2–6, mid **4** | **now #2 outright** | Unchanged. 1,025 reviews in 16 days is [E]; the human share is [I] |
| #3 | Driver trip cash, English-only in Hindi mode | 3.6–7, mid **5** | **0** | **This is the estimate that had nobody behind it.** Its two biggest factors — 54 drivers and 4 trips each per week — were both [I], and the screen it describes is one no driver opens. The defect is real and was never costing those hours |
| #4 | A phone that shows nothing, or only part | 1–3.3, mid **2.2** | unchanged, now #3 | Eight distinct causes, all [E]; still the thing v2 must show in place |
| #5 | Mechanic cannot say "done" or "I need X" | ~**1.5** | unchanged, now #4 — and addressed (§3.2) | Approved by the owner |
| #6 | Crew login logistics: 165 PINs minted and read out one by one | 0.5–1 steady, **5–6 h one-time** | unchanged in size, **changed in meaning** | It is now **confirmed waste**: 165 logins were minted, individually, for an app those people do not open ([E] GO_LIVE step 6; `DECISIONS.md §7`). That argues the logins should go — and §4.2 says why they should not, yet |
| #8 | Check-in fails silently with no camera | 0.4–1.2 | **reduced, not zeroed** | It was counted for "any attendee". It no longer applies to crew, but it still applies to every staff member who does check in — and if attendance decides wages (Q10), a silent failure is a wages bug, not a UX bug |

**What the re-rank changes about the plan.** Removing row 3 concentrates the top of
the ranking further onto two desks: rows 1, 2 and 5 (mid 8, 4 and 1.5) are all
supervisor-, office- or workshop-side. **Nothing in the top five is now a floor-role
friction at all.** That is the strongest argument for the twelve screens being shaped
the way §4 shapes them, and it is also the thing to be suspicious of: a ranking built
from documents written by the office will tend to find the office's problems. The
floor's absence from this list is as likely to be silence as satisfaction — exactly
the reading §2.4 makes of the mechanics.

**And it leaves a hole.** If no driver logs trip cash, then the trip cash that Money
(#7) reports as part of a bus's running cost **has no input**. Somebody is recording
that money somewhere — it is the cash the supervisor reconciles (`DECISIONS.md §5`) —
and this document does not know where. That is new owner question **Q15**.

### 2.4 The highest-value question in this redesign

**Mechanics have a login, job rows on their home, and a part-request sheet written for
them, and apparently do not use any of it. Why?**

The brief is right that the answer must not be assumed to be "the screens were ugly".
Here is the whole record, and it points somewhere else:

1. [E] 927864c (9 Sep): mechanics were taken off the login screen because *"mechanics
   never wanted the paperwork"*, and the supervisor took the card. Floor-sourced.
2. [E] 38e1914 (11 Sep): logins restored two days later, deliberately read-only —
   *"mechanics log in again, but only to find out what is waiting for them… Closing is
   the supervisor's and the owner's."*
3. [E] 8db78e7 (12 Oct): **for up to a month the mechanic login was a dead end.**
   `viewJobs`/`viewStore`/`viewScoreboard` omitted `mechanic`, so *"every tap on their
   home screen and their own Store tab bounced back to home: no opening a card, no
   hours, no proof photo, no marking work done."* Found by a code-and-data audit.
   **No mechanic is recorded as reporting it** (`05 §3`, "Frictions I could not size").
4. [C] `02 §2`: a mechanic holds **3 capabilities and all three are reads** —
   `viewStore`, `viewJobs`, `viewScoreboard`.
5. [C] `02 §4.2` item 2: `requestPart` is `['supervisor','owner']`, so the mechanic
   branch of the part-request button *can never be true* — although commit `d2d8afa`
   (2 Aug) says the mechanic "now gets the request-part button" and the sheet is titled
   for mechanics. Either `PERMS` regressed or it was taken away; which is UNDETERMINED.
6. [D] manual: a mechanic is told to *tell* the supervisor the work is done.

So the defensible reading is not "the screens were ugly". It is:

> **A mechanic's app contains nothing a mechanic can do.** It is a window. The one
> write it was given was removed or regressed. And when it was wholly broken for a
> month, the business had no channel through which that fact could arrive.

That last point is the most important thing on this page, because it means **we have no
mechanic feedback and must not invent any.** Two things follow, and they are the
difference between this plan and a dozen screens built for nobody:

- v2 gives a mechanic **exactly two writes**, both one tap, both no typing, both on a
  field that already exists: "I have started" → `startAt`, "I am done" → `completeAt`
  (`03 §3.1` confirms `enterAt, startAt, completeAt, outAt` exist as `number | null`;
  `02 §4.4` confirms the server already lets a mechanic write a card whose crew
  includes them). **This needs no data-shape change, no server change, and no new
  server capability** — only lifting the client's own block. That is the cheapest
  possible test of the whole hypothesis.
- We do **not** build a mechanic time-entry form. That is the paper slip on a screen
  again, and a flow one tap longer than the paper form loses to the paper form and
  nobody tells you (planner rule 2).

**ANSWERED (`DECISIONS.md §6`).** Mechanics have usable phones and may record their own
start and finish. The recommendation above is approved exactly as argued: two one-tap
writes on existing fields, no record-shape change, no new capability, no server change,
and a mechanic still cannot close or verify. **Q3 is closed.**

One thing the answer does *not* settle, and it is now on the critical path rather than
a side note: **can a mechanic read the two button labels?** `05 §7` question 12 asks
which staff read Hindi only and which cannot read at all. Two buttons on the busiest
card in the business are now the product's most important Hindi surface, and the
foundation's word table covers the app's fixed chrome, not screen labels
(`v2-foundation-ui.md §6.3`). Carried as Q12, re-scoped from drivers to mechanics.

---

## 3. The flow

Six flows, chosen because they carry the ranked friction (`05 §3`). Each step is what
the person sees, what they do, and what the system writes. No visual description.

### 3.1 The job card — the supervisor's flow (friction #1, mid 8 h/week)

1. **Opens the app, lands on Today.** Sees the workshop: every bus standing in the
   yard, oldest first, how long it has stood, whether work has started. This is the
   question `000c3dd` says a supervisor opens the app with. Writes: nothing.
2. **Taps a bus that is standing.** Sees the Job card: the bus, the fault, who is on
   it, the four workshop times with the gaps between them, parts down against it,
   photos, and the one next step. Writes: nothing.
3. **Taps the time that is missing.** The card asks for one time, not four. Enter and
   Out are the supervisor's own observation (the bus arriving and leaving the yard);
   Start and Done arrive from the mechanic's tap when there is one (§3.2). Writes:
   `jobcards.enterAt` / `.outAt` — existing fields.
4. **A bus arrives with a new fault: taps new job from Today or from the bus.** Gives
   bus, fault, priority, who is on it, odometer. The card is created on the first
   screen and the rest is added to a card that already exists, so an interrupted entry
   leaves a real card rather than a draft — [E] 4f0691e is a reported complaint about
   exactly that ("while filling the job card it was not showing the data I filled
   above", plus a phone call losing a half-filled card). Writes: `jobcards`, marks
   linked `driverreports` resolved, updates `buses.odometer` (forward only — a lower
   reading is a typo, [E] 927864c).
5. **Issues a part against the card** — or the storekeeper does (§3.4). The card is
   chosen first and never pre-selected: [E] d738a6e is a floor report of a part charged
   to the wrong bus because the sheet pre-picked the first open job. Writes: `ledger`
   first, then `parts`, then the card's `partsUsed` — in that order, because an
   interruption must leave an issue to finish rather than stock short with nothing to
   explain it ([E] d738a6e).
6. **Closes it.** Before-and-after photos (or a vendor bill) are the gate, and the gate
   is visible from step 2 so it is never a surprise at the end — *"once the part is off
   the bus you can never take it again"* ([D] manual Part 2; the server enforces it,
   `02 §4.4`). Writes: `jobcards.status = done`, `closedAt`, `closedBy` (server truth).
7. **Sign-off is one row on somebody else's Today, and it is now always somebody
   else's.** The owner has reversed the 15 September decision knowingly
   (`DECISIONS.md §10`): a card closed by a supervisor waits for the owner or the other
   supervisor. **One rule for every role, the owner included** — the closer is never
   the verifier. The shape already carries it: `closedBy` and `verifiedBy` are both
   written from the token, and `app.js:3019` already filters a verify list to
   `closedBy !== S.user.id`; v2 applies that filter to everybody instead of skipping it
   for supervisors. No record-shape change. The cost is one tap by a second person per
   card, and the supervisor's own closed work is no longer finished when he closes it —
   which is the point, and he should see it as "waiting for sign-off" rather than
   discover it later (v1 already shows him that note, [E] 000c3dd). Writes:
   `status = verified`, `verifiedBy`, `verifiedAt`.

### 3.2 The mechanic's two taps — **approved** (`DECISIONS.md §6`)

1. **Opens the app, lands on Today.** Their own open cards, most urgent first, carried
   over from earlier days — *"an unfinished job does not stop mattering at midnight"*
   ([E] 38e1914). No other role's work. Writes: nothing.
2. **Taps the card they are about to start, then one button: "I have started."** The
   time is stamped by the system at the moment of the tap, not typed from a slip the
   next morning. Writes: `jobcards.startAt`.
3. **Taps "I am done" when the work is finished.** This is a claim, not a close: the
   card goes to the top of the supervisor's list with the completion time already on
   it. The mechanic still cannot close or verify, and the server still refuses it
   ([C] `02 §4.4`). Writes: `jobcards.completeAt`.
4. **Needs a part: taps "I need a part" on the card.** Writes: `jobcards.partRequests`
   — an existing field, and the server has no rule against a mechanic writing it
   ([C] `02 §4.4`, "Where the server is looser"). It appears in the storekeeper's
   queue (§3.4 step 2).

Everything else on a mechanic's card stays read-only. No hours field, no photo
requirement, no close button.

### 3.3 The supervisor's gate round — out with a check, back with the cash

**Rewritten twice.** As first drafted the departure check was a driver flow on a driver
screen; `DECISIONS.md §7` removed the person. `DECISIONS.md §11` and `§12` then put
both halves of the gate on the same round, which is where they belong: the same person,
the same place, twice in a shift.

**Out, at departure:**

1. **The supervisor opens the Duty board in the evening.** Tonight's buses, picked
   earlier from the office register (§3.6 step 1), each showing its three seats and
   whether it has been checked out of the gate. Writes: nothing.
2. **Walks the line. Taps a bus, runs the ten items.** Three need a photo; the live
   capture and the 1.5-second hold stay, because the hold is the control, not
   decoration ([E] 8a8cde5; `v2-foundation-ui.md §5.7`). **And the selfie stays, of the
   driver, taken by the supervisor** (`DECISIONS.md §12`) — so the record still
   evidences who took which bus out, which is what it was always for. All pass →
   released, and the bus goes. Writes: `gatechecks` (server state machine, `02 §4.4`).
3. **A fail does not block him.** The check waits and becomes a row on Attention for
   whoever holds `gateDecide` — go or hold, with a reason either way ([E]
   GATE_CHECK.md). A 20:00 check still counts at 02:00. Writes: `gatechecks`.
4. **Gives the driver his allowance, and records it** — bus, date, amount — on Money
   (#7), two fields and a save (`DECISIONS.md §11`). Writes: `trips`.

**Back, on return:**

5. **Takes the expenses back and enters them** against the same trip, then closes it;
   a closed trip is frozen by the server ([C] `02 §4.4`). Writes: `trips`.
6. **A driver's fault report still reaches the app**, but from Me (§3.4) rather than
   from a screen he does not open. Writes: `driverreports`. The server already drafts
   a job card from it within ten minutes and pushes the owner if it reads as unsafe
   ([C] `04 §6`, report_ai).

**Said plainly, because it is the one place this plan asks something uncomfortable.**
Steps 4 and 5 are **money entered and reconciled by the same person** — the supervisor
hands out the allowance, takes the change back, types both, and is also the person who
reconciles the cash (`DECISIONS.md §5`). The owner chose it knowing that, and chose the
offsetting control in the same breath: his closed job cards now need a second signature
(`DECISIONS.md §10`, §3.1 step 7). What makes the trip entry safe is not the screen, it
is that the figures land in a store the server treats as a trip with a start and an end
rather than a free-text total, and that the entry is visible to the owner on the same
screen he reads the cost from. The alternative was worse than uncomfortable: without
these two steps, Money's per-bus running cost would have been **wrong rather than
absent**, which is the failure this document objects to most (§4.1, [E] 8db78e7).

Also honest: this is **additional load on the busiest person in the business**, on top
of the job cards that already cost him 3–13 hours a week (`05 §3` row 1). It is two
fields twice per trip and it replaces nothing. §7 measure 13 watches whether it is
actually done.

### 3.4 A driver or a conductor who does sign in

Few do (`DECISIONS.md §7`). Some will, and a login that lands nowhere is the dead end
that cost a month of mechanics' time ([E] 8db78e7). So their whole app is Me (#12), and
everything on it is theirs and already exists on the server:

1. **Signs in, lands on Me.** No Today — for these two roles Today would be a shell,
   and a shell is the dead end. Writes: nothing.
2. **Checks in, or out.** Live face and location; late and too-far flags. This is the
   one thing on the list the *business* needs from them, because attendance is wages
   in practice [I] (Q10). Writes: `attendance` (append-only for non-managers; `userId`
   from the token; server receive time, `02 §4.4`).
3. **Reads what is his:** own documents and their expiry (licence matters most), own
   rating and own passenger reviews, own approved coaching note. All three already
   have their own server paths that return the caller's rows only — `/my/reviews`,
   `/my/coaching`, and `driverdocs` permission-or-self ([C] `04 §1` rows 5–6,
   `02 §4.3`). Writes: `drivers` (a document he adds).
4. **Says something is wrong with his bus**, by area, by voice or photo. Writes:
   `driverreports` (the server permits `driver` and `conductor`, `02 §4.4`).
5. The conversation log about him is **never** here and never reaches him ([E]
   4a42e38).

**Why not simply remove the logins**, which friction #6 now shows cost 5–6 hours to
mint for an app nobody opens? Because of step 2. If attendance decides wages (Q10,
unanswered) then removing the login removes the wage record, and nothing in this
document says who would record it instead. **The recommendation is: keep the logins,
give them one honest screen, and revisit after measure 11 in §7** — which counts how
many of them are ever used. If that comes back at zero after four weeks and Q10 says
attendance is not what decides pay, the logins should go, and I will say so then with
a number instead of an assumption.

### 3.5 The storekeeper at the counter (anti-pilferage is the product, not a feature)

1. **Opens the app, lands on Store**: what is low, what is owed, what jobs are waiting
   for parts. Writes: nothing.
2. **A part request is waiting**: taps it, confirms the part and quantity against the
   named card. Writes: `ledger`, `parts`, the card's `partRequests[].status`.
3. **A mechanic is standing there**: searches the part, picks the card (never
   pre-selected, §3.1 step 5), issues. Cannot issue without a card ([E] manual,
   2299533). Writes: `ledger`, `parts`, `partsUsed`.
4. **Stock arrives with a paper bill**: photographs the bill, Claude reads supplier,
   number, date and every line, and the storekeeper corrects and saves ([E] c896478;
   `/ai/bill` is already open to `store`, `04 §1` row 35). Writes: `purchases`,
   `parts`, `ledger`, `vendors`.
5. **Counts the shelf against the book.** The book is corrected *by counting, not by
   typing*; a typed correction shows up as Unexplained and lands on the owner's
   Attention queue ([D] manual Part 2; `01 §4.4`). Writes: `audits`, `parts`, `ledger`.

### 3.6 The crew manager: three seats on every bus that runs tonight

1. **Picks tonight's buses first** — new, from `DECISIONS.md §8`. The register that
   says which buses run tonight is on paper in the office, and the app has never had
   any notion of it, which is why the duty board could count buses that never needed a
   driver: *"67 buses need a driver"* against 54 drivers and about 100 buses, a number
   that could not reach zero ([E] ba274f6). So the day starts with one entry: tick
   tonight's buses off the register. Then the board shows only those, and the count
   **can** reach zero. No WhatsApp integration and no file import — neither was asked
   for (`DECISIONS.md §8`). Writes: a dated nightly record; **this is the one data
   addition the plan needs and §6 states the only safe shape for it.**
2. **Opens the app, lands on Today**: how many of tonight's buses have no driver and
   no conductor, and who is free. Writes: nothing.
3. **Taps a bus with an empty seat, picks a free person.** Each bus has Driver 1,
   Driver 2, Conductor; filling one must never clear another — the manual currently
   tells the user that if a bus "looks like it lost its driver after you assigned a
   conductor, that is a fault — tell the office" (`05 §4` row 26, a workaround for a
   same-role seat-clearing bug). Writes: `drivers`, `dutylog` (immutable once written,
   even for the owner, `02 §4.4`), `buses`.
4. **At the pump, or at the tyre shop**, with a phone: records diesel (pump and place),
   AdBlue, a tyre fitted, a battery fitted ([E] 2e5c4cd names exactly this person at
   exactly these two places). Writes: `fuel`, `def`, `components`.
5. **Approves the week's coaching notes** — Claude drafts three lines per crew member,
   the manager edits and approves or skips, and only approved notes reach the crew
   member ([E] 731a14a; `04 §6`). Writes: `coachai` via `/ai/coaching/decide`.

### 3.7 The owner at 6.40am

1. **Signs in.** This is the flow with the worst measured number in the product and it
   is not a screen: 30–36 s, because his PIN is deliberately not on the device ([E]
   6fa0a6d; `02 §4.3`, `03 §6`). v2 inherits the enrolment decision from `spec §1`
   (enrol the device once, short PIN after). Out of scope for this document except as
   the first thing stage 2 must not make worse.
2. **Lands on Today**: the 30-day cost with its trend, what is owed to suppliers, buses
   on road / in shop / away, the Monday summary when there is one, and the top of the
   Attention queue. Four numbers and a short list ([E] 000c3dd; [D] manual Part 2).
   **Every number says when it was last true** (`spec §4.7`) — see §6.
3. **Taps into Attention** for the things only he can settle: work waiting on his
   signature — **never his own closes, which was already true for him alone ([E]
   000c3dd) and is now the rule for everybody** (`DECISIONS.md §10`), so this queue is
   where a supervisor's closed cards arrive — unexplained stock changes, pilferage
   flags, challans, expired documents, gate checks waiting for a decision. One ranked
   list, each row carrying the reason and the money or the safety it represents.
4. **Taps Money** when he wants the cost itself rather than a flag. He is no longer the
   only one there: the supervisor keeps Money (`DECISIONS.md §5`).
5. **Checks who looked at the money** — new, from the same answer. Because the money is
   now deliberately shared, the owner should be able to see who opened what. The
   `usage` store already holds one row per person per day with per-screen counters
   ([C] `03 §2`; the v1 adoption report reads exactly this, `01 §4.7`), so this is a
   read of existing data, not new plumbing. It lives as a row in **Me (#12)**, not as
   a thirteenth screen: one person, one rare moment. **One precision the owner should
   know:** the server sends `usage` to owner **and supervisor** today ([C] `03 §2.1`),
   so as it stands a supervisor can read the record of who looked at the money,
   including their own. Making it owner-only is a change to the server's read
   boundary, not a client setting — carried into §4.3.
6. Rare admin — a new login, a new PIN, garage settings, deleting a mistaken card,
   moving a verified card to the right bus — lives where the thing lives (People, Me,
   the Job card), not in an admin screen.

---

## 4. Screens

**Twelve.** Fourteen as first written; Gate check and Trip cash were dropped by
`DECISIONS.md §7`. `viewPhoto` is a component, not a screen (`spec §5`).

### 4.1 The twelve

| # | Screen | The job it serves | Role that does that job | What must be on it | What must NOT be on it |
|---|---|---|---|---|---|
| 1 | **Today** | "What needs me, now?" — role-shaped | owner, supervisor, store, mechanic, crewmanager, office — **not driver or conductor** (§4.2) | The person's own queue: a supervisor's standing buses oldest-first with idle time, and tonight's unchecked departures; a mechanic's own cards; a storekeeper's low stock and waiting requests; a crew manager's empty seats among tonight's buses; the owner's four numbers and the top of Attention; the Monday summary when there is one | Anything that is not this person's to act on. No five cards that each link to a different ranked list — that is Attention's job (#2). **No Today at all for a driver or a conductor**: for them it would be a shell, and a shell is the dead end of [E] 8db78e7 |
| 2 | **Attention** | "What is wrong across the business, ranked by money and safety?" — one list instead of five screens | owner, supervisor (per-row, see §4.3) | Every open flag as a row, ranked, each with the reason attached and a link to where it is fixed: gate checks awaiting a decision, **work awaiting a second signature — never the reader's own closes, for any role including the owner** (`DECISIONS.md §10`), unexplained stock changes, pilferage flags, documents expiring or expired, unpaid challans, open unsafe driver reports, breakdown patterns, buses with no driver | Anything a person cannot act on. Any row whose capability this person does not hold (§4.3). Any count that can never reach zero — [E] 5eb8c6e ("110 of 110 missing documents") and [E] ba274f6 ("67 buses need a driver" with 54 drivers) are the app teaching its user to scroll past red |
| 3 | **Jobs** | "What is standing in the yard, for how long, and has it been started?" | supervisor; owner; store (read); mechanic (own only) | Every open card oldest-first with idle time, who is carrying what, filters for completed and for away-for-repair, new job, and mechanic workload where a card needs an owner (open work, rework, turnaround — [E] 38e1914: "who should take this job" is not a question one score answers) | The card's contents. A mechanic must never see another mechanic's card here ([C] `02 §4.3`; it leaked once, `02 §6.2`) |
| 4 | **Job card** | "What is the state of this one repair, and what is the one next step?" | supervisor (keeps it); mechanic (two taps); owner (verify, move, delete); store (parts) | Bus, fault, priority, crew and their tasks, the four workshop times with the gaps between them, odometer, parts down with the ledger behind them, part requests, old-part returns, before/after photos with the close gate visible from the top, outside-vendor and its printable gate pass, and **one** next step for whoever is looking — which for a card the reader closed themself is "waiting for somebody else", not a button | Four empty time fields presented as a form. The close button for anyone who may not close. A pre-selected job on the issue sheet ([E] d738a6e). **A verify button for the person who closed the card — any person, any role, the owner and a supervisor alike** (`DECISIONS.md §10`, reversing 15 Sep). A supervisor's own closed card must read "waiting for sign-off", never "verified" |
| 5 | **Buses** | "What does this bus need, and what has it cost?" | owner, supervisor | Searchable register; per bus: papers with expiry, service due, odometer, pending challans, tyres and batteries fitted, assigned crew, live position, open driver reports with "make a job", and the repair history. Add a bus, and log a scheduled service | Five different cost bases for one bus (`01 §5.2` — there are five today). Crew phone numbers for a role not in `PII_ROLES` ([C] `03 §2.1`) |
| 6 | **Store** | "Hand out a part against a card without the count drifting, and record what arrived." | store; supervisor; owner; mechanic (read) | Catalogue with stock and reorder, waiting part requests, issue against a chosen card, receive stock, the supplier bill (photographed and read), the shelf count and the trust number, the per-piece register for tyres/batteries/rotables including warranty state, and the vendor behind each bill | Fleet-wide spend totals — those are Money's (#7). This is the `bills` split: **manage the bill here, read the total there** (`spec §6`) |
| 7 | **Money** | "What did running the fleet cost, where did it go, and what do we owe?" | **owner and supervisor** — the 2 Nov decision is reversed because a supervisor does the cash reconciliation (`DECISIONS.md §5`) | One total that reconciles to its parts (fuel and AdBlue, parts, labour, outside, misc), the trend, cost per km and the money-pit list, running cost per bus including trip cash, supplier dues, the period report, and — new — **the quick trip entry the supervisor fills at the gate: bus, date, allowance given, expenses back** (`DECISIONS.md §11`, §3.3 steps 4–5) | Any per-km figure divided by a missing odometer — [E] 8db78e7: ₹45,000 of work read as ₹45,000/km and topped the money-pit list, sending the owner to inspect a healthy bus. **A trip-cash figure presented as complete** when trips are missing: a bus with no trip entered reads "no trips recorded", never ₹0 — "unknown" and "zero" must never look alike (`v2-foundation-ui.md §3.6`). A free-text cash total: it is a trip with a start and an end, or it is not recorded |
| 8 | **People** | "Who is on the roll, how are they doing, and what did we do about it?" | crewmanager, office (read), owner, supervisor | Crew worst-first with the blended score; one person: documents and expiry, incidents, their reviews, the append-only conversation log, the week's coaching note to approve; add a joiner with duplicate detection, mark a leaver; crew logins and PINs; staff logins | Salary for a role that should not hold it — **Q4 is open and this screen changes on the answer.** Another person's identity documents for anyone outside `manageDrivers`-or-self ([C] `02 §4.3`; it leaked once, `02 §6.2`). The conversation log must never reach the person it is about ([E] 4a42e38) |
| 9 | **Duty board** | "Is every bus that runs tonight staffed, and has it left the gate fit?" | crewmanager (tonight's buses and the seats); supervisor (the departure check); owner | **Tonight's buses first**, ticked off the office register (`DECISIONS.md §8`) — then three seats per bus, who is free, fill and change a seat, "who was on bus X on date Y" from the duty log, and **per bus whether it has been checked out of the gate**: the ten items, the three photos, the 1.5-second hold, and **the selfie of the driver, taken by the supervisor** — everything is kept (`DECISIONS.md §12`; [E] 8a8cde5) | A count that can never reach zero — which is exactly what picking tonight's buses fixes ([E] ba274f6). Anything that clears a seat the person did not touch (`05 §4` row 26). The go/hold **decision**, which is a row on Attention where the decider already looks. Status by colour alone (`spec §4.3`) |
| 10 | **Fuel & tyres** | "Record what went into or onto a bus away from the workshop." | crewmanager, store; owner, supervisor | Diesel (litres, rupees, pump and place, last-fill panel, run since), AdBlue, fit a tyre, fit a battery, km/l per bus with the partial-fill rule, and the falling-mileage flag | Per-bus cost reports — the row tap into `busreport` is a dead end for store and crewmanager today ([C] `01 §1.3` item 7). The piece's whole life history — that is Store's register (#6) |
| 11 | **Reviews** | "Which crew member did this passenger mean, and whose fault was it?" | crewmanager, office, owner, supervisor | Reviews and complaints traced to bus and crew, filters (low, conflict, untraced), Claude's reading of fault and topic, the typed-redBus-name confirmation queue, and why a review could not be pinned on anybody | Passenger journey fields for `office` — PNR, seat, fare, board point are stripped by the server for that role and must not be re-added ([E] bd11e75, `03 §2.1`) |
| 12 | **Me** | "Am I checked in, what is mine, and what is this device doing?" | all 8 — and for driver and conductor it is **the whole app** (§3.4) | Check in / out with the live face and location, own attendance, own documents, own reviews, own coaching note, own score (a mechanic's included), **"something is wrong with my bus"** for a driver or conductor, PIN, language, theme, and **what this device is missing and why** — plus, owner only, Excel import and **who opened what** (`DECISIONS.md §5`) | A normal-looking empty screen. [E] 2170703, 8eb73dc, 7c3f5f8, 0c8f434, 5d125d2, 241af2c: "everything exists, just no data" has had at least **eight distinct causes** and the only symptom the user ever saw was silence (`05 §3` row 4). The conversation log about a crew member, ever ([E] 4a42e38) |

### 4.2 Front doors

| Front door | Screens | Count |
|---|---|---|
| Floor — driver | **Me only** | 1 |
| Floor — conductor | **Me only** | 1 |
| Workshop — mechanic | Today, Jobs (own), Job card (own, two taps), Store (read), Me | 5 destinations, **4 tabs** (Jobs and the Job card are one tab) |
| Specialist — store | Today, Store, Jobs (read), Job card (parts), Fuel & tyres, Me | 6 destinations, **5 tabs** (same reason) |
| Specialist — crewmanager | Today, Duty board, People, Fuel & tyres, Reviews, Me | 6 destinations, **6 tabs** — none is a detail of another (§4.4) |
| Specialist — office | Today, People (read + conversation log), Reviews, Me | 4 |
| Command — supervisor | all twelve | 12 |
| Command — owner | all twelve | 12 |

**A driver and a conductor get one screen each**, down from four and two as first
drafted. This is the resolution `DECISIONS.md §7` asked for, and it is deliberately
not "no login":

- Their logins exist and some will be used. A login that lands on an empty Today is
  precisely the dead end that cost a month of mechanics' time and that **no mechanic
  reported** ([E] 8db78e7). One full screen is not a dead end.
- With the gate check moved to the supervisor, a driver holds **zero capabilities**,
  the same as a conductor already does ([C] `02 §1`). Everything on their Me is
  own-record — `/my/reviews`, `/my/coaching`, own documents, own attendance, a report
  about their own bus — and every one of those paths already exists and is already
  own-record on the server ([C] `04 §1` rows 5–6; `02 §4.3`, `02 §4.4`). **No new
  capability is created for either role.**
- **Removing the logins is the alternative and it is blocked on Q10.** Attendance is
  wages in practice [I]; if the login goes, the wage record goes with it, and nothing
  here says who records it instead. §7 measure 11 counts how many crew logins are ever
  used; if that is zero after four weeks and Q10 says attendance does not decide pay,
  the logins should go on evidence rather than on this inference.

### 4.3 The one enforcement mechanism, and the trap inside Attention

The v2 rule (`spec §7`, `DECISIONS.md §3`): **a screen declares the capability it
needs; a screen that declares nothing is unreachable by everybody including the owner,
and that is a build-time error.**

| Screen | Declares | Notes |
|---|---|---|
| Today | *(none — the one deliberate exception, as `home` is today)* | Its **contents** are capability-scoped row by row, like Attention below |
| Attention | `viewAttention` + **per row kind** | See the warning below |
| Jobs | `viewJobs` | mechanic narrowed to own cards in the query, not the view |
| Job card | `viewJobs`; `addJob` to create; `mayCloseJob` to close; `verifyJob` to verify **plus the per-record rule `closedBy !== me`, for every role**; `deleteJob`, `changeJobBus` owner-only | The mechanic's two taps need **no new capability** — the server already permits them ([C] `02 §4.4`). The second signature needs no new capability either, only the removal of `selfSignsOff` — but see §6: **the server will still permit a supervisor to verify their own close**, so in v2 this control lives in the client until `_guard_write` is tightened |
| Buses | `fleet`; `addBus` to add; `logService`; `challans` for the liability card | |
| Store | `viewStore`; `issuePart`; `receiveStock` (**decide: Q6**); `manageSupplierBills`; `manageComponents` | |
| Money | `viewSpendTotals` (new, from the `bills` split) + `money`; `viewCompanyBilling` for anything company-level; the trip entry is `trips`, which the server already lets a supervisor write ([C] `02 §4.4`) — **no new capability and no server change** | **Owner and supervisor both hold all of these** (`DECISIONS.md §5`). The split still happens, and the reason is now explicitly forward-looking rather than restrictive: it stops a *future* role inheriting money because it was granted an operational capability |
| People | `crewPerf` to read; `manageDrivers` to write; `crewNote`; `manageCrewLogins`; `manageStaff`; salary behind **Q4** | `crewPerf`/`manageDrivers` were split once already and the split was right ([E] 2c72951) |
| Duty board | `assignDriver` for tonight's buses and the seats; **`gateCheck`** for the departure check; the go/hold decision is `gateDecide`, on Attention | Two capabilities on one screen, row-scoped exactly as Attention is: a crew manager holds `assignDriver` and not `gateCheck`, so he sees tonight's buses and their seats and no check action; a supervisor holds both ([C] `02 §2`) |
| Fuel & tyres | `addFuel`; `manageComponents` | |
| Reviews | `crewReviews`; `manageDrivers` for the name queue | |
| Me | *(none — second deliberate exception; every row inside is own-record or capability-scoped)* | `openUsage` → `dashboard` today; becomes **`viewAdoption`**, which now also guards the who-opened-what row (`DECISIONS.md §5`). **The server must narrow with it:** `usage` is sent to owner *and supervisor* today ([C] `03 §2.1`), so unless the read boundary moves, a supervisor reads the record of who looked at the money — including their own |

**The trap, named so stage 3 does not walk into it.** Attention merges five screens
that today sit behind four different capabilities. If Attention declares one capability
and then shows pilferage, money, safety and alert rows, **we have rebuilt `dashboard` —
the exact conflation the owner flagged**, where one capability guards 11 routes, the
digest, the ITS lookup and the Usage menu (`spec §6`, `02 §8.2`). So:

> Attention is **one destination whose rows each declare their own capability.** A
> person sees only the row kinds they hold. Granting Attention grants nothing but the
> empty list. The same rule governs Today's cards.

**And it is cosmetic unless the server changes.** Today a conductor token with zero
capabilities can `/pull` supplier bills, the stock ledger, job-card costs, fuel, trip
cash, challan liabilities, garage settings, all-staff attendance, and gate checks with
their selfies (LIVE-ISSUES 2; `02 §0`). This is **not softened by the supervisor
keeping Money** — `DECISIONS.md §5` says so itself: *"Supervisor visibility being
intended does not make everyone else's accidental."* The reversal removes the one
decision that would have *forced* the server work; it does not remove the need for it.
A conductor who holds zero capabilities and opens one screen should receive the records
for one screen. The same declaration must drive what the server sends (`spec §7`).
**This is stage 3's single largest security item and it is now less likely to be done,
which is why it is restated here.**

### 4.4 Navigation — corrected, and agreeing with §4.2

The first draft of this section said "crewmanager 5" while §4.2 listed six
destinations for that role. `v2-foundation-ui.md §3.7` caught it, took §4.2's list and
gave six slots, and asked for the answer back here. **Six is correct**, and the
foundation's reasoning is the reason: none of the crew manager's six is a detail of
another — unlike store and mechanic, where Jobs and the Job card legitimately share a
tab. The table below is now the single source and matches the foundation's exactly,
with two rows the foundation must update for the twelve screens:

| Role | Tabs | Slots | Agrees with `v2-foundation-ui.md §3.7`? |
|---|---|---|---|
| driver | **Me** | 1 | **No — must change there.** The foundation has driver at 4 (Today, Gate check, Trip cash, Me) |
| conductor | **Me** | 1 | **No — must change there.** The foundation has conductor at 2 |
| mechanic | Today, Jobs, Store, Me | 4 | yes |
| store | Today, Store, Jobs, Fuel & tyres, Me | 5 | yes |
| crewmanager | Today, Duty board, People, Fuel & tyres, Reviews, Me | 6 | yes — this was the disagreement, now resolved in the foundation's favour |
| office | Today, People, Reviews, Me | 4 | yes |
| supervisor | Today, Attention, Jobs, Buses, More, Me | 6 | yes |
| owner | Today, Attention, Money, Buses, More, Me | 6 | yes |

**One slot each for driver and conductor means no bottom nav at all for those two
roles.** A nav with one item is a lie about there being somewhere else to go, and the
foundation's own nav spec says a tab a role does not hold is *absent*, not disabled.
This also corrects the foundation's claim that an empty nav "cannot occur: every role
has at least Today and Me" — after `DECISIONS.md §7`, two roles have only Me.

The rule stage 1 sets, unchanged: **no screen is reachable only from another role's
home, and no capability is held without a path.** A check enumerating (role × declared
capability) against (role × reachable screens), failing on any mismatch, is the
falsifiable form of it; it would have caught two of today's four orphans and all 16 of
the supervisor's unreachable capabilities (LIVE-ISSUES 6). The supervisor now holds
**all twelve screens**, so six of them live behind the More sheet — which makes the
foundation's own doubt about a phone-shaped nav on a 1024×768 desk machine
(`v2-foundation-ui.md §8.2` item 2) more pressing, not less. I agree with it: if the
supervisor lives in the More sheet, the desk wants a rail.

### 4.5 Reconciliation with `v2-foundation-ui.md` (stage 2a)

Read in full. Four of its decisions touch my screens; **none contradicts one**, and I
say so item by item because "no contradiction" is only worth reading if it was checked.

| Foundation decision | Effect on these screens |
|---|---|
| **Two new tokens, `--nav-h` and `--thumb`** (§1.2) | Both keep named consumers. `--nav-h` is on **ten** screens, not fourteen — driver and conductor have no nav (§4.4) — and still governs every screen's bottom scroll padding, so the token stands and only its wording moves. `--thumb`'s consumers survive the two dropped screens: the Job card's before/after photos and close gate, the **three departure-check photos now on Duty board (#9)**, the supplier bill on Store (#6), and a driver's report photo now on **Me (#12)** rather than Today |
| **Zero new colour tokens; `--surface-pick` rejected** because `--accent` lands at **2.83:1** on it where WCAG 1.4.11 needs 3:1 (§1.3) | **No contradiction, and I confirm the premise it rests on.** Every filter in this document is a *mutually exclusive view*, never an additive flag: Jobs open / completed / away for repair; Reviews low / conflict / untraced; Store catalogue / waiting requests / counts; People crew / staff / logins. **No screen here multi-selects, and no list row here is selectable** — a tap on a Jobs row opens the Job card. So the rejected token has no consumer in my twelve either, and `.tabs` (accent text plus a 2px bar, never colour alone) is the right primitive. The two dropped screens remove nothing from this |
| **Three new icons — `seat`, `challan`, `count` — bringing the set to 34, which is the cap** (§4.3–4.4) | All three consumers are on screens that survive: `seat` on Duty board (#9) and Attention's "bus with no driver" row; `challan` on Attention and Buses (#5); `count` on Store (#6) and Attention. **Dropping two screens does not free a slot**, and the `gate` mark is not released either — it loses a nav slot but keeps two row consumers (the departure check on Duty board, the awaiting-decision row on Attention). The foundation's §4.1 rows 11 and 13 need rewriting for the twelve, and the cap stays reached: stages 3–5 have no headroom |
| **No stepper buttons on the number entry** (§4.4) | **No contradiction.** Every number this document asks for is a *reading or a counted quantity*, not a value you nudge: the odometer, litres and rupees at the pump, an issued quantity, a part-request quantity, and the shelf count. None of them is arrived at by incrementing, and a stepper on a shelf count would invite exactly the typed correction the storekeeper is told not to make ("correct the book by counting, not by typing", `05 §4` row 25). I asked for no steppers and I still ask for none |
| **Attention is capped at 200 ranked rows** with one line saying how many more and which filter narrows them (§2.4) | Accepted, and it answers my own §9 warning about Attention and the measured performance bug. The cap also satisfies the rule it must not break: a capped list with a stated remainder is not a count that cannot reach zero |
| **The 200-row / 250 ms desk budget is a placeholder** (§8.2 item 1; `DECISIONS.md §9`) | Carried into §7 measure 10, which no longer implies it was measured |

---

## 5. Dropped

The most valuable section. **Every one of the 53 routes is accounted for below**, and
every job in `05 §2` and `05 §5` is either covered in §4 or dropped here with a reason.

**The count, revised for twelve screens. 44 of the 53 routes stop being
destinations:** 38 become a filter, an action, a document, a row or a card inside one
of the twelve (5.1), and **6 are dropped outright with nothing in their place** (5.2).
**Nine** routes survive as screens — `home`, `me`, `money`, `people`, `jobs`, `buses`,
`store`, `assignments`, `reviews` — and the other three screens are new or promoted:
Attention is new, Job card is promoted out of `jobs/<id>`, and Fuel & tyres is merged
from `fuel` + `def` + `components`.

**What changed from the first draft.** `gate` was a surviving screen and is now folded
(it moves into Duty board, row 1 of 5.1 below), so survivors go 10 → 9 and folded
routes go 37 → 38. Trip cash was never a route — it was a card on the driver's home —
so the route arithmetic does not move for it, but it is no longer a promoted screen.
9 + 38 + 6 = 53. ✓

### 5.1 Dropped as a screen, kept as something smaller

| Today's route | Becomes | Why it is not a screen |
|---|---|---|
| **`gate`** (new to this table) | The departure check on **Duty board (#9)**, run by the supervisor | **`DECISIONS.md §7`: drivers have logins and do not use them.** The check still happens; the person recording it changes. It belongs on the board that already knows which buses run tonight and who is on them — one evening, one round, one list. **Everything is kept — ten items, three photos, the hold and the selfie of the driver, now taken by the supervisor** (`DECISIONS.md §12`; [E] 8a8cde5), so the record still evidences who took which bus out. The concern I raised about this is answered, and §9 says so |
| *(the driver home's trip-cash card)* | **A quick entry on Money (#7), filled by the supervisor at the gate** — bus, date, allowance given, expenses back (`DECISIONS.md §11`); the driver's own things move to **Me (#12)** | Same answer. Not a route today, so it does not move the route count — and it was a promoted screen in the first draft and is not one now. **This closes Q15.** Without it Money's running cost would have been wrong rather than absent, which is worse; §3.3 states what it costs and what offsets it |
| `newjob` | An action on Jobs that creates a real card at step 1 | A 3-step wizard with a `localStorage` draft is a form pretending to be a place. [E] 4f0691e: a phone call lost a half-filled card |
| `history` | A filter on Jobs | It is a subset of the job board ([C] `01 §5.2`) |
| `outsidejobs` | A filter on Jobs ("away for repair") | Same list, different status. The "away for repair" tick is also overloaded onto the vendor field today and gets its own state (`05 §4` row 21) |
| `gatepass` | A printable document from a Job card | A document, not a destination. The serial number is the whole point and stays ([E] 2b35e74) |
| `storehealth` | A state of Store (the count, the trust number); unexplained changes become Attention rows | "Is stock disappearing?" is a *finding*, and findings belong in one ranked list |
| `pilferage` | Attention rows (per mechanic, with the reason) | One of the five screens that each answered "what is wrong?" (`spec §5`) |
| `insights` | Attention rows; the advisor's free-text question moves onto Attention as one field | Same. The advisor is the most expensive path in the product (6 sequential Opus calls, `04 §6`) and should be asked from where the question arises |
| `safety` | Attention rows + per-crew on People | Same |
| `breakdowns` | Attention rows (the pattern) + logging on the bus it happened to | A breakdown, a driver report and a job card are three records for one event; the manual has to explain that (`05 §4` row 31). One timeline |
| `alerts` | Attention rows (documents expiring) | Same |
| `challans`, `buschallans` | Per-bus liability on Buses + unpaid rows on Attention + a check action **that shows what the lookup costs before you press it** | Each lookup spends a billable credit and the manual has to teach "use *Check unchecked*, not the whole fleet out of habit" (`05 §4` row 36). Show the price at the button |
| `gatechecks` | The decision queue on Attention; tonight's checked/unchecked state on Duty board | A list of decisions is a queue, and the queue belongs where the decider already looks |
| `accounting`, `busacct`, `reports`, `busreport` | Money | Four of the eight screens answering "what is it costing us?" with **five different per-bus bases** ([C] `01 §5.2`). One basis, stated |
| `bills`, `purchases` | **Split**: managing the bill → Store; the spend total → Money | Two routes rendering one function today, kept apart only because dropping the alias made the `bills` permission bypassable ([C] `01 §5.1`, `02 §6.1`). The split was the prerequisite for the 2 Nov decision; **that decision is reversed and the split still happens** (`DECISIONS.md §5`), because `bills` guarding bill management and purchase totals together is bad modelling whoever holds it, and because `store` must keep the operational half |
| `vendors` | Store (the supplier behind a bill; vendor detail is a filter) | A vendor is an attribute of a bill, not a place |
| `components` | Piece register in Store; fitting in Fuel & tyres | Two halves of one thing in one screen today, reachable by four roles through three different homes |
| `fuel`, `def` | Fuel & tyres | "Fuel and AdBlue are separate screens with the same layout and the same permission" ([C] `01 §5.2`) |
| `linkgps` | A fix-it action on a bus with no GPS match | Reachable from exactly one conditional branch today ([C] `01 §1.3` item 2) |
| `drivers` | People | |
| `crewbank` | People | |
| `crewpins` | People (logins belong to the person; "rename when the post changes, and also New PIN, otherwise the leaver can still sign in", `05 §4` row 27) | |
| `driverdocs` | People (manager) and Me (own) | Already one screen reached two ways ([C] `01 §5.1`) |
| `coaching` | People (approve) and Me (own note) | |
| `rbnames` | A queue inside Reviews | |
| `whynodriver` | A filter inside Reviews | "A state, not a screen" (`spec §5`) |
| `scoreboard`, `scorecard` | Mechanic workload on Jobs and the Job card; own score in Me | Five ordered lists of the same people with three different score functions today ([C] `01 §5.2`). The mechanic leaderboard exists to answer "who should take this card", so it belongs on the card |
| `digest` | A card on Today for the roles the server sends it to | One record per week ([C] `03 §2`), read once |
| `usage` | A row in Me, owner only | Rare, one person — but **do not lose it**: it is the instrument that answers most of the UNKNOWNs in this document |
| `import` | A row in Me, owner only | One-time; `/admin/import` is owner + token and refuses a non-empty database ([C] `04 §1` row 27) |
| `fleet` + `buses` list | One Buses screen | They show the same data, and today **only the orphaned list can add a bus** ([C] `01 §1.3` item 1) |

### 5.2 Dropped outright, and nothing replaces it

| Today's route | Reachable today by | Why it is gone |
|---|---|---|
| `company` | **Nobody** — the only opener is inside dead code ([C] `01 §1.3`) | Contradiction C4: commit 7fc8053 says *"Owner runs their own buses, so there's no invoicing companies"* and deleted the billing worksheet, while README and FEATURES still describe billing transport companies. The capability split in `spec §6` even names `viewCompanyBilling` for it. **I am dropping it and asking.** If the owner says he does bill someone, Money gains a job and this is wrong (Q7) |
| `forecast` | **Nobody** ([C] `01 §1.3`; the app's own usage report lists it under "built but never opened") | It needs a daily-revenue figure per bus that somebody has to type into `meta`, and there is no evidence anybody ever did. Downtime hours stay on Attention; the rupee conversion goes |
| `warranty` | **Nobody** ([C] `01 §1.3`) | "Which fitted parts are still under supplier warranty" is a *property of a part and a piece*, so it becomes a flag in Store and on the Job card. Making the claim happens elsewhere entirely (`05 §5`), so a list of claimable parts with no claim flow is a report nobody acts on |
| `routes` | **Nobody** (only dead code) | Per-bus stops and late-pickup risk. And the real job underneath it — **"which buses run today"** — is *not served at all* and is the biggest hole in the duty board ([E] ba274f6). Rebuilding the stop list without that is building the roof first (Q8) |
| `livemap` / `track` | owner, supervisor, crewmanager | **UNKNOWN: who opens the live map, and to answer what?** No role's job list in `05 §2` includes it. It needs internet and a map library on Chrome 109 machines. The bus's position stays on the bus; the full-screen fleet map is dropped until somebody names the moment (Q9) |

**Jobs in `05 §5` that v2 still does not serve, said plainly so it is a decision.**
One has come off this list: **"which buses run today"** is now served, by the Duty
board's quick daily entry off the office register (`DECISIONS.md §8`) — it was the
biggest hole in the duty board ([E] ba274f6) and it is closed. Still not served:
crew pay and payroll (Q10 — attendance feeds wages in
practice [I], and `README` has listed "payroll export from attendance" as to-do);
**a trip's cash, now that no driver records one (Q15 — this is new, and it is a
regression on paper even though nobody was using the screen);**
bus-paper renewal itself (we alert, the agent and the RTO visit are elsewhere);
challan payment, towing and court; tyre warranty claims; passenger complaint replies
in the redBus portal; the outside-job slip's signatures and the vendor's paper copy;
breath tests (planned, when the devices arrive, [E] GATE_CHECK.md); invoicing (Q7).

**What is lost by the 53 → 12 reduction, honestly:**

1. **Five lenses on cost become one.** Somebody who has learned that `busacct`
   includes trip cash while `busreport` does not will find one number where he had
   two, and it will not match either. That is the point, and it will still feel like a
   loss for a week.
2. **The per-bus route and late-pickup monitor goes** with nothing in its place. It was
   reachable by nobody, so nobody will notice — which is itself the argument.
3. **The fleet map goes.** If it turns out the crew manager watched it every evening,
   that is a real loss and my fault, and Q9 is how we find out before stage 3.
4. **Downtime expressed in rupees goes.** The hours stay; the conversion to lost
   revenue goes, and with it a number the owner might have wanted.
5. ~~A supervisor loses company money.~~ **Withdrawn.** The owner has answered: a
   supervisor does the cash reconciliation, so the 2 Nov decision is reversed and the
   supervisor keeps Money (`DECISIONS.md §5`). The loss I warned about would have been
   real, and it is not being taken.
6. **Five separate "worst-first" crew lists become one.** Anyone who used the
   crewmanager home's ratings card rather than People will have to learn one list.
7. **A driver loses four screens and keeps one** (§4.2). Nobody is using the four, so
   on today's evidence nothing is lost — but the evidence is an absence, and an
   absence is what the mechanics' month-long dead end also looked like ([E] 8db78e7).
   If a handful of drivers *do* use the app, they lose the gate check and the trip
   screen and keep their documents, their rating and their coaching note. Measure 11
   in §7 is how we find out, and it should be read before stage 3 touches crew.
8. ~~The departure check stops being self-certification.~~ **Withdrawn.** The owner
   kept the whole check including the selfie, with the supervisor photographing the
   driver at the gate (`DECISIONS.md §12`), so the record still evidences who took
   which bus out — about the same person, recorded by different hands. Nothing is lost
   here that I can name.
9. **The supervisor gains two jobs rather than losing any**: a trip's cash twice per
   trip (`DECISIONS.md §11`) and a second signature to collect on every card he closes
   (`DECISIONS.md §10`). Neither is a loss to the business and both are load on the
   person who already carries the top friction in it. That is the honest cost of the
   last three answers, and §7 measures 12 and 13 are how we find out whether it holds.

---

## 6. Edge cases that matter here

**Offline.** Everything that reads or writes the local database works offline ([C]
`03 §6`). Three things do not and must be designed as states, not errors:

- **Owner, supervisor and crew manager cannot sign in at all offline** — their PIN is
  never kept on the device ([C] `02 §4.4`, `03 §6`). The three people who run the
  garage are the three who cannot start the app without a network. v2's enrolment
  decision (`spec §1`) is aimed at exactly this and stage 2 must not make it worse.
- **Live things stop**: map, challan lookups, ITS, uploads, every AI reading, reviews,
  coaching, digest, staff creation and PIN setting ([C] `03 §6`). Each must say "last
  true at ..." rather than draw a stale number as current (`spec §4.7`).
- **A photo that could not be uploaded travels inside the record** as a data URL ([C]
  `03 §6`) and can be twenty megabytes; the manual currently tells users to upload on
  wifi (`05 §4` row 38).

**A half-finished entry.** The job card is created at step 1 and added to afterwards
(§3.1 step 4), so an interruption leaves a real card rather than a draft on one phone.
A part issue writes the ledger row first, so an interruption leaves an issue to finish
rather than stock short with nothing to explain it ([E] d738a6e). Nothing important
lives only in `localStorage`.

**Two people doing it at once.** This is the sharpest edge in the product and it is a
live data-loss bug, not a hypothetical:

- Conflict is **whole-record last-write-wins on `updatedAt`, taken from the device
  clock**; only `partsUsed` is merged ([C] `03 §5.1`). Two people editing one job card,
  or one phone with a slow clock, is enough to lose the loser's photos, notes and part
  requests.
- **A record that loses that comparison is dropped silently**: not applied, not counted
  in `rejected`, not named in `refused`, response 200 — and the client then clears the
  whole batch from the outbox under the comment "everything else landed"
  (LIVE-ISSUES 1, verified in source). The change stays on one phone, "Waiting to send"
  drops to zero, and the server never has it.
- **Therefore v2's job card must not be a screen two people edit at once.** The
  supervisor owns the card; the mechanic's two taps write two fields that nobody else
  writes; the storekeeper's issue writes `partsUsed`, which is the one field the server
  already merges. That is a deliberate division of fields between people, and it is
  the only reason this is safe on the existing protocol.
- Fixing the silent drop properly is a merge decision per store and belongs in the
  pipeline, not in a patch (LIVE-ISSUES 1). **v2 must not design any flow that depends
  on it being fixed.**

**A role that must not see it.** Deny by default, per §4.3 — and the server's read
boundary has to move with it or the whole thing is a curtain (LIVE-ISSUES 2). Six
route bypasses are on record, each fixed by adding one line, and nothing prevents a
seventh ([C] `02 §6.1`). Specific carried rules: the conversation log never reaches
the person it is about ([E] 4a42e38); `office` never receives passenger journey fields
([E] bd11e75); crew identity documents are permission-or-self ([C] `02 §4.3`); crew
emergency and reference phone numbers reach **every** role today and are not in
`_DRIVER_PRIVATE` (LIVE-ISSUES 2) — Q11.

**The second signature, and the two places it is not enforced.** `DECISIONS.md §10`
reverses the 15 September decision: a supervisor's closed card waits for somebody else.
The rule is a one-line change in v2 and no record changes shape — but it is a *control*
now, and a control is worth exactly what enforces it, so both gaps are named here
rather than discovered in stage 5.

1. **The server still permits it.** `_guard_write` says `verified` needs owner or
   supervisor and *"the closer cannot be the verifier **unless the verifier is a
   supervisor**"* ([C] `02 §4.4`). So a supervisor self-verifying is a legal push
   today. v2's rule therefore lives in the client until that clause is tightened to
   `closedBy != verifiedBy` for every role. Until then this is a UI convention, not a
   boundary — and this codebase has six recorded cases of a client-only rule being
   walked around ([C] `02 §6.1`, `02 §6.2`).
2. **v1 is deliberately not changed, and v1 is the bypass.** `selfSignsOff` is live at
   `app.js:3873` and supervisors are signing off their own work in the office today;
   bringing v1 into line is a production behaviour change and a separate decision
   (`DECISIONS.md §10`). Both apps run against the same server for the whole build
   (`DECISIONS.md §2`), so while that holds, **a supervisor who wants to verify his own
   card can open v1 and do it.** That is not an argument against the decision — it is
   the reason §7 measure 12 counts cards where `closedBy == verifiedBy` across *both*
   clients rather than testing the v2 button. The two apps differ here on purpose and
   the difference is worth knowing when they are compared.

**Anything v2 writes must stay legible to v1** (`DECISIONS.md §2`). Under whole-record
last-write-wins this is stronger than it sounds: **a field v2 invents is erased the
next time a v1 device writes that record.** Every write in §3 lands in a field that
exists today — `enterAt`, `startAt`, `completeAt`, `outAt`, `partsUsed`,
`partRequests`, `trips`, `gatechecks`, `dutylog`, `fuel`, `def`, `components`,
`purchases`, `audits`, `ledger`, `crewnotes` ([C] `03 §3.1`, `03 §2`). **No new field
is required by this plan**, with one exception that `DECISIONS.md §8` creates and that
this section must specify rather than leave to stage 3.

**Tonight's running list needs somewhere to live, and the obvious places are all
wrong.** The owner's answer — pick tonight's buses, then fill their seats — needs a
dated record of "these buses run tonight". Checked against the data model:

- **A field on `buses` is the worst option.** `buses` is written by v1 constantly —
  odometer from every fuel fill, from the WhatsApp capture, from a job card, plus
  document edits ([C] `03 §2`, `03 §3.2`). Under whole-record last-write-wins a field
  v1 does not know about is **erased the next time a v1 device writes that bus**
  ([C] `03 §5.1`). This would fail intermittently and look like the duty board
  forgetting the night's list.
- **`dutylog` cannot express it.** The server requires crew *and* seat *and* a real
  time, and the row is immutable once written, even for the owner ([C] `02 §4.4`).
  "This bus runs, nobody on it yet" is exactly what it cannot say.
- **`meta` cannot hold it**: only the single row id `garage` syncs, and a crew manager
  may not write `meta` at all ([C] `02 §4.4`).
- **Deriving it from filled seats is circular** — the point of the list is to know
  which buses still need one.

**So it is one new store** — a record per night naming the buses that run, writable by
owner, supervisor and crew manager. That is the *safest* of the available changes, and
the reason is a property of the existing system rather than a preference: **v1
discards a store it does not know.** `aimeta`, `odometerlogs` and `waconv` already
live in the server's `records` table and are never applied by any client ([C]
`03 §1.2`), so a new store cannot be read, written or clobbered by v1, and **no
record v1 reads changes shape.** What it does need is the server's `WRITE_ROLES` and
`may_write` extended — an unknown store is denied today ([C] `02 §4.4`) — which is a
server change, not a migration.

That is a decision for the backend lead to accept or refuse, and it is the only data
addition in this plan. If it is refused, the Duty board's daily entry has no home and
`DECISIONS.md §8` cannot be built as written — in which case it comes back here
rather than being solved quietly with a field on `buses`.

**The slowest machine in the office.** Windows 7, Chrome 109, some Core 2 Duos, 1024×768
(`DECISIONS.md §1`, `spec §2`). The owner's report that it is slow *"on MacBook also
and iPhone too"* ([E] 3b1e7e8) is the most important sentence in the log, because it
ruled out hardware as the whole story: the causes were structural ([C] `spec §2`). The
shape that must not come back is **work proportional to the whole dataset, performed
per item, inside something that runs on every render.** For this plan specifically:
Attention ranks across many stores and is the screen most likely to reintroduce it, and
a supervisor's standing-bus list on Today is the most frequently drawn list in the
product. There are **no secondary indexes anywhere** — every read is `getAll()` plus a
JS filter ([C] `03 §1.1`).

**The empty screen.** "Everything exists, just no data" has had at least eight distinct
causes and the user saw silence every time (`05 §3` row 4; [E] 2170703, 8eb73dc,
7c3f5f8, 0c8f434, 5d125d2, 241af2c). A v2 screen with nothing on it must say which of
these it is: still filling, nothing to show, this device could not save records, held
for another person, or no signal since a stated time. A figure that is still filling
must never be drawn as final — [E] 2170703: *"Nothing is going missing. The figures are
incomplete and the app draws them as final."*

**Hindi.** First-class, not a layer (`spec §4.2`). **Re-scoped by the owner's answers.**
The one named hole was Trip cash ([E] GO_LIVE), which I called "a screen used by the
largest role" — it is a screen used by nobody, and it is now gone. So the Hindi risk
moves to where the people actually are: **the mechanic's two buttons** on the Job card
(`DECISIONS.md §6`), the storekeeper's counter, and the supervisor's evening round. The
foundation diagnosed the mechanism correctly and it is the mechanism that matters more
than any one screen: `t()` falls back to English, so a missing translation is
indistinguishable from a present one until a Hindi reader opens the screen, nothing
fails and nobody is told (`v2-foundation-ui.md §6.3`, quoting `i18n-hi.js`). Its rule —
**a missing Hindi value is a build error, not an English fallback** — is the right one
and I adopt it for screen labels too, not only the 21 fixed chrome words. Q12 still
needs the owner: who reads Hindi only, and who cannot read at all.

---

## 7. How we will know it worked

Numbers readable afterwards, from the `usage` store and the records themselves. Two of
these need a **before** reading taken before stage 3 starts, or the comparison is lost.
Fourteen measures for twelve screens; **measures 12 and 13 exist because the owner's
last three answers added two controls and one piece of work, and a control that stops
happening quietly has failed** — which is the whole reason they are counted rather than
assumed.

| # | Measure | Today | Target | Where to read it |
|---|---|---|---|---|
| 1 | Job cards whose `startAt` or `completeAt` was stamped by a mechanic's tap rather than typed by a supervisor | **0** (no such button exists) | > 0 in week 1; > 50% of cards by week 6 | `jobcards`, comparing `_by`/`_byRole` on the writing push against the card's crew |
| 2 | Minutes a supervisor spends per job card | 5–10 [I], **never measured** | half | **Take the before reading by hand, this week.** Without it #1 proves activity, not saving |
| 3 | Distinct people who opened the app in a week, by role | unknown | names a real number for the first time | the adoption report — **read it before anything is built**, it answers Q13 and most of the UNKNOWNs here |
| 4 | Screens with zero opens after four weeks | 3 already listed "built but never opened" (`warranty`, `forecast`, `routes`) plus 2 more orphans | **0 of the twelve.** Any v2 screen with zero opens in four weeks is a screen I got wrong | `usage` screen counters |
| 5 | **Replaced.** Buses on tonight's board still showing an empty seat at departure | the number could not reach zero at all, because the app had no notion of which buses run ([E] ba274f6) | **a number that reaches zero on a good night** — that is the whole point of `DECISIONS.md §8` | the nightly board record against `dutylog` |
| 6 | Departure checks recorded per night, and by which role | unknown. **Restated:** this was going to settle contradiction C2; the owner has settled it, so the query's job changes — it now tells us whether the *supervisor* is actually doing the round, and the kept selfie (`DECISIONS.md §12`) means the record still says which driver each bus left with | tonight's buses checked, not a sample | `gatechecks._byRole` against the nightly board record |
| 7 | Records a person was told about: refused, quarantined, or dropped | 0 surfaced for the staleness case (LIVE-ISSUES 1) | every one surfaced, with a reason and a retry | the Me screen's device state |
| 8 | Capabilities held with no reachable screen | 16 for a supervisor today (LIVE-ISSUES 6) | **0, enforced by a build check** (§4.4) | the (role × capability) vs (role × screen) check |
| 9 | Screens answering "what is wrong?" / "what did it cost?" | 5 and 8 | 1 and 1 | the screen list |
| 10 | Tap to visible response, screen change, first paint, idle sync | 884 ms / — / — / 880 ms before the October fixes, on a Mac | `spec §8`: < 100 ms, < 250 ms, < 1 s, ~0 ms. **None of these is a measured office number yet**, and neither is the 200-row / 250 ms desk budget every density rule in the foundation is sized against — `DECISIONS.md §9` records that it was set on a developer's Mac. The reading on an actual office PC is stage 3's, and the budgets move to whatever it says | the fleet-sized fixture, failing the build |
| 11 | **New.** Crew logins (driver, conductor) that have ever been used, and by how many people | unknown; 165 were minted and read out one by one ([E] GO_LIVE step 6) | **a number, not an assumption.** If it is zero after four weeks and Q10 says attendance does not decide pay, recommend the logins go (§4.2) | `users.lastLoginAt`, and the `usage` store's per-person rows |
| 12 | **New, and the one that matters most.** Verified cards where `closedBy == verifiedBy` — i.e. the second signature did not happen | **every supervisor-closed card today**, by design: `selfSignsOff` is live at `app.js:3873` | **0 among cards closed in v2.** Any non-zero count is the control failing, and because v1 still self-signs and both run on one server (§6), a non-zero count tells you *which client* it came through. Also read the companion number — **median hours a closed card waits for its signature** — because a control nobody gets round to is a queue, not a control (`DECISIONS.md §10`) | `jobcards`: `closedBy`, `verifiedBy`, `closedAt`, `verifiedAt`, all server-written from the token |
| 13 | **New.** Trips with an allowance recorded, and trips also closed with expenses back | **0** — the driver screen that was meant to collect this is opened by nobody | one entry per trip that ran, and a closing entry for most. **A falling ratio is the measure to watch**: it means Money's running cost is drifting back to wrong-rather-than-absent, which is the failure §3.3 exists to prevent (`DECISIONS.md §11`) | `trips`, with `_byRole` to confirm it is the supervisor entering them |
| 14 | **New.** Who opened Money, and when | nothing surfaces it, although the data has been recorded all along | the owner can read it without asking anybody (`DECISIONS.md §5`) | the `usage` store's per-screen counters, through Me's who-opened-what row — and see §4.3 on narrowing `usage` to the owner on the server |

---

## 8. Owner must decide

Carried from `05 §7`, `02 §8` and the contradictions in `05 §6` — only the ones that
change a screen in this plan. **Eight of the sixteen are now closed** by
`DECISIONS.md §5–12`, and they are kept in the table with their answers rather than
deleted, because the answer is what the screens now rest on.

**Still open: Q4, Q6, Q7, Q9, Q10, Q11, Q12, Q13** — eight, and none of them blocks
stage 2 from specifying a screen. Each is listed with the screen it would change, and
the one that changes a screen's *existence* rather than its contents is Q9.

| # | Question | Status | Which screen changes |
|---|---|---|---|
| **Q1** | Does either supervisor do the cash reconciliation today — yes or no? | **CLOSED — yes** (`DECISIONS.md §5`) | **Money (#7)** stays with the supervisor. The daily job I warned about being taken away is not taken away |
| **Q2** | Does the 2 Nov decision stand? And does a supervisor keep *challans*? | **CLOSED — reversed** (`DECISIONS.md §5`) | **Money (#7), Attention (#2), Buses (#5).** The supervisor keeps all of it, challans included. `dashboard` still splits into `viewAlerts` + `viewCompanyBilling`, with the supervisor holding both, so a future role cannot inherit money by accident |
| **Q3** | Do you want a mechanic to mark "work done" with one tap? Do they have phones? | **CLOSED — yes to both** (`DECISIONS.md §6`) | **Job card (#4)** gets the two buttons, exactly as §3.2 argued them |
| **Q4** | Is crew pay a *money* matter or a *people* matter? (The server already sends salary to the crew manager while the client hides it) | **OPEN** | **People (#8).** Decides whether salary appears there at all. Note the answer to Q1 changes its shape but not its need: the supervisor keeps `money`, so the question is now only about `crewmanager` |
| **Q5** | Do drivers and conductors sign in on a normal day? | **CLOSED — they have logins and do not use them** (`DECISIONS.md §7`) | **Gate check and Trip cash are dropped**; 14 → 12. A driver and a conductor land on **Me (#12)** and nothing else (§4.2) |
| **Q6** | Is receiving stock the same permission as issuing it, or its own? (`receiveStock` exists and nothing ever checks it; the Receive button uses `issuePart`) | **OPEN** | **Store (#6)** |
| **Q7** | Do you bill any transport company for repairs, or only run your own buses? (Commit 7fc8053 says the second; README says the first) | **OPEN** | **Money (#7).** A yes means I was wrong to drop `company`, and Money gains a job |
| **Q8** | Where is the daily list of which buses run tonight, and who keeps it? | **CLOSED — a register in the office** (`DECISIONS.md §8`) | **Duty board (#9)** gets the quick daily entry, so the count can reach zero. It also needs the one new store in §6, which is the backend lead's to accept |
| **Q9** | Who opens the live map, and to answer what? | **OPEN** | **Buses (#5).** A real answer restores a thirteenth screen; no answer and it stays dropped. The `map` mark keeps a consumer either way (`v2-foundation-ui.md §4.1`) |
| **Q10** | How is crew pay worked out, and is the attendance record what decides it? | **OPEN — and now load-bearing** | **Me (#12) and whether the crew logins exist at all.** If attendance decides wages, the crew login cannot be removed without saying who records attendance instead (§4.2), and "check-in fails silently with no camera" ([E] GO_LIVE) is a wages bug rather than a UX bug |
| **Q11** | Who may see a crew member's emergency and reference phone numbers? (Today: every signed-in role) | **OPEN** | **People (#8)** and the server's read boundary |
| **Q12** | Which staff read Hindi only, and which cannot read at all — voice or pictures only? | **OPEN — re-scoped** | No longer the floor roles' screens, which are gone. Now **the mechanic's two buttons on the Job card (#4)**, Store (#6) at the counter, and Duty board (#9) on the evening round (§6) |
| **Q13** | Please open Usage and adoption and send the list of logins that have never been used. | **OPEN — partly answered** by Q5, still worth the two minutes | All twelve. It replaces most of the `[I]` labels in this document, and §7 measures 3 and 11 are the same reading |
| **Q14** | Does a supervisor closing their own job without a second signature still stand (your 15 Sep decision)? | **CLOSED — no, it is reversed** (`DECISIONS.md §10`) | **Job card (#4)** and the verify queue on **Attention (#2)**. The closer is never the verifier, for every role including the owner. I agree it is answered in substance and close it — with the two enforcement gaps named in §6, which are stage 3's work and not a further question for the owner |
| **Q15** | If no driver records a trip, who records a trip's cash, and where? | **CLOSED — the supervisor, on Money** (`DECISIONS.md §11`) | **Money (#7)** gains the quick entry: bus, date, allowance given, expenses back (§3.3 steps 4–5). Money entered and reconciled by one person, offset by Q14's answer |
| **Q16** | Now that a supervisor records the departure check: is the live selfie still wanted, and whose face? | **CLOSED — kept, the driver's, taken by the supervisor** (`DECISIONS.md §12`) | **Duty board (#9)** keeps the whole check. The record still evidences who took which bus out |

**On separation of duties: what the owner decided.** I raised this as the one thing
worth weighing again — not any single screen, but the accumulation across the answers:
with the 2 November decision reversed, the same two people would have held the workshop
clock, the parts, the cash reconciliation, the departure record and a sign-off on their
own closed work. **The owner did not accept the concentration. He chose two controls**
(`DECISIONS.md §10` and `§12`), and he chose them knowing what each costs:

- **A second signature on every supervisor-closed card**, reversing his own 15 September
  decision. One tap by a second person per card, and the rule is now identical for
  every role — the owner could never sign off his own closes and now nor can anybody.
- **The departure check keeps its selfie**, so the gate record still names the driver
  who took the bus, recorded by a different pair of hands.

What that leaves, stated so nobody has to reconstruct it: the supervisor still enters
and reconciles the same cash (`DECISIONS.md §11`, and the owner says so himself), and
the two controls are a second pair of eyes on the *work* and a photograph at the
*gate*, not on the money. The money's check is that the owner reads the same screen the
entry lands on, and can now see who opened it (`DECISIONS.md §5`, §7 measure 14). That
is a judgement the owner is entitled to make about his own business, it is written down
rather than implied, and §7 measures 12 and 13 are how anyone later can tell whether
the controls he chose actually ran.

**Not re-opened here, by instruction:** the Chrome 109 floor; v2 at `/v2` alongside v1;
53 → 14 (now 12, by the owner's own later answer); deny-by-default; emoji → inline SVG; tenancy in the data model with no signup
surfaces (`DECISIONS.md §1–3`).

---

## 9. Status

**ok = true, and this document is ready for stage 2 to specify all twelve screens
against.** Every one of the twelve has a person and a moment from `[E]` or `[D]`
evidence. The one exception in the first draft is gone: Trip cash and Gate check rested
on drivers signing in, the owner answered that they do not, and both were dropped
rather than kept on a persona.

The twelve: **Today · Attention · Jobs · Job card · Buses · Store · Money · People ·
Duty board · Fuel & tyres · Reviews · Me.**

Eight of the sixteen owner questions are closed. **Eight remain — Q4, Q6, Q7, Q9, Q10,
Q11, Q12, Q13 — and none blocks stage 2**: seven change what is *on* a screen, and only
Q9 could change whether one exists (a live map would be a thirteenth). Each is listed
in §8 with the screen it touches.

### The concern I raised, and what the owner did with it

I said the problem was not any single screen but the accumulation: with the 2 November
decision reversed, one pair of hands would have held the workshop clock, the parts, the
cash reconciliation, the departure record and a sign-off on their own closed work. I
offered three remedies and said any one would do.

**He took two of them** (`DECISIONS.md §10`, `§12`), knowing what each costs: the second
signature is back, reversing his own 15 September decision, with the rule now identical
for every role including himself; and the departure check keeps its selfie, so the gate
record still names the driver who took the bus. §8 states what that leaves and §7
measures 12 and 13 are how anyone later can tell whether the controls actually ran.
**I have nothing further to put in front of him on this.**

### Do the three new decisions create a problem I can see? Yes — three, all small

1. **The second signature is a client-only control for now.** `_guard_write` still
   permits a supervisor to verify their own close, and v1 — which is still self-signing
   and still on the same server by design — can do it today. Named in §6 with both
   gaps, and §7 measure 12 counts the outcome rather than testing the button. Stage 3's
   work, not a question for the owner.
2. **A second signature can become a queue instead of a control.** Two supervisors on
   alternate shifts ([E] manual Part 5) and one owner means a card closed at the end of
   a shift may wait. If the median wait is days, people will route around it. That is
   why measure 12 reads the wait alongside the count, and why the Job card must show a
   supervisor's own closed card as "waiting for sign-off" rather than letting him
   discover it later.
3. **Load, not risk.** The three answers give the supervisor a trip entry twice per
   trip and a signature to chase per card, and take nothing off him. He already carries
   the top friction in the business at 3–13 hours a week. The mechanic's two taps pull
   the other way, which is the only reason this nets out defensibly — and measure 2
   (minutes per card, which has **never been measured**) is the number that would
   settle it. Take that reading before stage 3.

### The three things in this plan most likely to be wrong

1. **Attention (#2) is still the one new idea and the one most likely to fail.** Its
   rows must each declare their own capability or it *is* `dashboard` rebuilt — and the
   decision that would have forced the server-side half of that work has been withdrawn
   (§4.3), so the pressure to do it properly is now entirely internal. The foundation's
   200-row cap handles the performance half; nothing but discipline handles this half.
2. **Duty board (#9) now answers two questions and may be two screens.** "Is every bus
   staffed?" and "has every bus left the gate fit?" are one list and one evening to me,
   and they belong to two roles with two capabilities. It is the most strained merge in
   the document and it is strained because the budget is twelve. If supervisors record
   checks from somewhere else, I was wrong and Gate check comes back as a thirteenth.
3. **Today (#1) and Attention (#2) may still be one screen for the owner**, and the
   case is thinner than it was: Today now serves six roles rather than eight, and for
   the owner "what do I do next" and "what is wrong, ranked" are close to one question.
   If his Today is only ever a doorway to Attention, I was wrong; measure 4 says so
   within a month.

The mechanic's two taps are no longer on this list — the owner confirmed the phones and
the intent (`DECISIONS.md §6`), which removes the inference the claim rested on. What
remains there is a reading risk, not a design risk: Q12.

### Contradictions with `v2-foundation-ui.md`, named rather than left for stage 2

Checked again after these three decisions. **Nothing in the foundation's own
decisions — tokens, colour, icons, motion, copy — is contradicted** (§4.5). Three
things in it need editing for the twelve screens, all of them mechanical:

| In the foundation | Needs |
|---|---|
| §3.7 nav table: driver 4 slots, conductor 2 | **driver 1, conductor 1** — Me only, and therefore no bottom nav for either (§4.4). Its nav "empty" state also says this cannot occur; after `DECISIONS.md §7` it can |
| §4.1 icon coverage rows 11 (Gate check) and 13 (Trip cash) | Rewrite as rows of **Duty board (#9)** and **Money (#7)**. The `gate` mark keeps consumers — the departure check and Attention's awaiting-decision row — and `money` keeps its nav slot, so **the set stays at 34 and the cap stays reached** |
| §5.7 hold-to-release, which says the bar exists so *"a driver cannot release a bus by brushing a cracked screen"* | The reason stands, the person changes: it is now the supervisor's phone at the gate. The specification itself does not move |

One thing in the foundation deserves a direct answer because it asked for one. Its
§8.2 item 2 doubts a phone-shaped bottom nav on a 1024×768 Windows 7 desk machine, and
says the usage counters will settle it. **I agree with the doubt**, and the supervisor
now holds all twelve screens with six behind the More sheet, which strengthens it — but
I would not change the primitive on my say-so, and that is stage 2's call with a
measurement behind it, not stage 1's.

**Written to:** `docs/v2/plan/v2-ux.md`
**Accounts for:** all 53 v1 routes (§5: 9 survive as screens, 38 fold, 6 dropped
outright).
**Blocking for stage 3, not stage 2:** the one new store for tonight's running list
(§6 — the backend lead's to accept or refuse), and tightening `_guard_write` so the
second signature is a boundary rather than a convention (§6).
**Next stage:** 2b — the twelve screens.

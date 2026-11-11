# Garage Saathi over WhatsApp — UX plan

Stage 1 of the pipeline (`docs/v2/PIPELINE.md`). Slug `whatsapp`. Written 2026-11-10/11.
**Revised 2026-11-11** against three owner answers: Q1 reversed (AI is wanted wherever
it helps — §0.1), Q2 accepted (typed digits after a one-number ask — §0.1), Q9 decided
(90-day photo retention — §9.4). The revision changed the design, not the notes: §4.4 is
new, §10 is rewritten because AI brings four killed flows back, and §8 now carries **two
cost lines** of which AI is the larger.

**Read in full before writing this:** `wa_client.py` (all 197 lines), `test_wa_client.py`,
`sync_server.py` lines 5300–5660 (`wa_send`, `wa_prompt_odometer`, `_wa_last_inbound`,
`_wa_note_inbound`, `_wa_handle`, `bus_by_phone`, `vision_read_odometer`,
`odometer_submit`), lines 6150–6180 and 6300–6355 (the `/wa/webhook` GET handshake and
POST route, and `/odometer/submit`), lines 150–175 and 1075–1100 (the session token),
`docs/v2/plan/v2-ux.md`, `docs/v2/plan/v2-contract.md`,
`docs/v2/inventory/02-roles-and-permissions.md`, `03-data-and-sync.md`,
`04-server-and-integrations.md` §3.7, `05-user-needs.md`, `docs/v2/DECISIONS.md`,
`docs/superpowers/specs/2026-11-01-garage-saathi-v2-design.md`.

**This document does not restate `v2-ux.md`.** The twelve web screens, their
capabilities and their contents are settled there and are referenced, not re-derived.
This document adds one surface and says what it carries, what it does not, and what it
costs per day.

### Format note

My stage-1 definition requires seven sections in order. They are all here, in order,
with the five sections this surface specifically needs interleaved where they are
needed to read the next one:

| Required | Here |
|---|---|
| 1. The job | §1 |
| 2. What they do today | §2 |
| 3. The flow | §5 (with §3 enrolment/identity and §4 menus as its prerequisites) |
| 4. Screens | §6 |
| 5. Dropped | §10 |
| 6. Edge cases | §11 |
| 7. How we will know | §12 |

Surface-specific additions: §3 enrolment and silence, §4 the menu per role **and §4.4
the AI path**, §7 the deep-link contract, §8 the cost of talking **in two lines**, §9 the
named trade-offs **including §9.4 retention**, §13 owner must decide, §14 the
`DECISIONS.md` entry this needs, §15 where the existing code contradicts this plan.

### Evidence labels

Same as `v2-ux.md`: **[E]** a commit body, repo document or the manual states it;
**[C]** read from source (by me, in this session, or by the inventory with the file and
section cited); **[D]** a document only makes sense if it is true; **[I]** I inferred
it — treat as a question; **UNKNOWN:** followed by the question to ask.

---

## 0. What this reverses, and the four decisions it rests on

**`docs/v2/DECISIONS.md` line 161 says, in §8:** *"No WhatsApp integration and no file
import. Neither was asked for."* [C — read at that line].

**That is now wrong, and only about WhatsApp.** The owner has asked for it, in these
words: *"I want to build this software on whatsapp fully… like a store does in
whatsapp."* The decision log must say so, or the next reader finds a shipped surface
that the log forbids. §14 states exactly what the new entry must contain. **I have not
edited `DECISIONS.md`** — that is the owner's log, not mine.

What is *not* reversed: file import. `DECISIONS.md §8`'s other half stands. The
nightly running list still comes off the office register into the Duty board
(`v2-ux.md §3.6` step 1), not out of a spreadsheet and not out of a WhatsApp group.

**The four decisions taken as settled, recorded as given:**

1. **Scope split.** The chat does the daily field jobs — attendance, odometer, fuel,
   problem reports, job-card updates, part issue/return. The heavy screens — reports,
   live map, full store counts, people, money — are reached by a signed one-tap deep
   link into the v2 web app. Each job stays in the surface that suits it.
2. **Identity.** An enrolled phone number identifies the person. Anything touching
   cash, stock or a gate pass asks for the 4-digit PIN they already have, once per day.
   **An unenrolled number gets complete silence — no reply at all.** This is a change
   from today's behaviour (§2, §15).
3. **Attendance proof.** A check-in asks for live location *and* a photo. Both are
   stored against the record.
4. **Input style — superseded on 2026-11-11, see §0.1.** As originally given: buttons
   and interactive lists only, in the Hinglish register the existing replies already
   use; no typing, no AI, no voice notes; a free-text message gets a menu back, not an
   error. **The "no AI" and "no voice notes" clauses are withdrawn by the owner and the
   "no typing" clause is narrowed.** Buttons and lists remain the primary path.

### 0.1 The AI reversal, and the two other answers

Three of the ten questions in §13 came back on 2026-11-11.

**Q1 — reversed, and further than I asked.** The owner's words: *"i want to use ai
wherever possible. by mistake would hsve written it."* The "no AI" clause in decision 4
was a mis-click. What this document now assumes:

- **Buttons and lists stay the primary, cheapest path.** They are still the fastest
  thing for a driver at 05:00 and still the lowest message cost. **This is not a rewrite
  into a chatbot** and §4.1's menus are unchanged.
- **Free text and Hindi voice notes are a first-class alternative on every flow where a
  person might reasonably just say what they want.** Voice especially: it is how this
  workforce communicates, and it answers `05 §7` Q12 — *"which staff read Hindi only,
  and which cannot read at all"* — which the button-only design was working around
  rather than solving. The question stays open; the surface no longer depends on its
  answer.
- **The free-text→menu fallback is replaced by AI intent routing.** It was §4.3
  collision 4's load-bearing escape hatch and it is now a real path.
- **The 10-row cap is much less binding.** A person can say *"RJ14 PA 1023"* or
  *"Shanti ki bus"* instead of finding a bus in a list. §10 is rewritten: **four flows
  I killed on the cap come back**, and the ones that stay links now stay for better
  reasons than the cap.

**Q2 — my recommendation, accepted.** Typed digits are allowed, **but only immediately
after the bot has asked for exactly one number** — a PIN, a reading, a quantity.
Everything else stays tappable or spoken. PIN-gated money and stock work therefore
**stays in the chat**, the storekeeper's counting job included. With AI in scope this
exception is narrower than it looks: AI handles the general case, and this rule is
specifically about the unambiguous numeric prompt, where routing a four-digit PIN
through a language model would be both more expensive and less safe than reading four
digits.

**Q9 — decided: 90 days for the image, forever for the record.** §9.4.

### 0.2 The safety shape, which is the coordinator's and which the owner may overrule

Recorded as not mine, so the owner knows whose judgement to overrule:

> **AI reads and proposes. The person confirms with a tap. The server still validates
> through its existing ladders. No AI output writes to a record unconfirmed.**

This mirrors `odometer_submit` exactly, and that is the argument for it: OCR reads a
number, and then held-broken, held-first, held-backwards, held-jump, held-daily and
held-changed stand between the reading and the fleet record [C `sync_server.py:5541`].
The vision model has been allowed to be wrong there since the day it shipped, and the
ladder is why nobody has had to care.

Applied here: **an extracted quantity, amount, part, bus, category or time is a proposal
shown back for one tap, never a silent write.** Where a flow would need an unconfirmed
AI write to be worth having, this document says so and flags it rather than designing
it — there is exactly one such flow and it is the shelf count (§10.1).

**What the shape costs, stated once:** a confirmation is a bot message, so every AI path
is at least one message more expensive than the button path it replaces, on top of the
inference. §8 counts both.

---

## 1. The job

**Ramlal, a driver, 05:02, standing at the gate in the dark with a bus to take out and
a phone in his hand that already has WhatsApp open** — because WhatsApp is the thing on
that phone that has never once failed to open. He needs to be recorded as present,
because attendance is what wages are worked out from in practice ([I], `05 §7` Q8 —
still unanswered, and load-bearing here as it is in `v2-ux.md §4.2`). Today he does not
do that, because the app he was given a PIN for is an app he does not open
(`DECISIONS.md §7`), and on his phone its first sync took 50–90 seconds on a fast
machine and *"several times that"* on an old Android (`05 §3` row 4). The same phone,
the same thumb, the same ninety seconds: he sends a location pin and a photo of his own
face to a number he has already got saved, and gets back one line that says his name,
the time, and whether it counted. Nothing is installed. Nothing is signed into.

Behind him in the same surface: **Mukesh under a bus with dirty hands** who has no way
to say the work is done and tells the supervisor instead ([D] manual, `05 §2.5` job 5);
**Suresh at the parts counter** with a mechanic waiting; **Vajid the supervisor** on the
yard at 18:05 watching a bus leave, who will type that time into a card tomorrow
morning from a paper slip ([E] 927864c — the top friction in the product, mid 8
h/week); and **the owner at 6.40am** who wants four numbers and would rather not wait
30–36 seconds for a cold login to get them ([E] 6fa0a6d).

**The one-line test:** every flow in this document is a job somebody does standing up,
outdoors or at a counter, in under ninety seconds, that is listed against their role in
`05 §2`. Anything that needs a desk, a keyboard, a second screen or a decision about
money is a deep link out, not a conversation.

---

## 2. What they do today

### 2.1 What exists in the code already

A third of this surface is built and tested. Stated precisely, because the rest of this
document depends on which third.

| Piece | State | Where [C] |
|---|---|---|
| Cloud API transport | Built, stdlib only, no dependency | `wa_client.py` 197 lines |
| Service-window rule | Built and tested at the boundary | `can_send_freeform`; `test_wa_client.py` asserts 23 h open, 24 h shut, 25 h shut, never-messaged shut |
| Webhook signature | Built; the route refuses to run without `WA_APP_SECRET` (`503`), `403` on a bad signature | `verify_signature`; route at `sync_server.py:6328` |
| GET verify handshake | Built; echoes `hub.challenge` only on a token match, else `403` | `sync_server.py:6155` |
| Inbound parsing | Built for text, image/document/video/audio/sticker, button, interactive | `extract_entries`, `normalize_message` |
| Media fetch for OCR | Built — two hops, bearer token on the second | `media_data_url` |
| Delivery-status ordering | Built: never regresses, never un-fails | `status_should_update` |
| Reply policy | Built: free-form inside the window, approved template outside, `False` if neither is possible | `wa_send` at `sync_server.py:5318` |
| Bot-initiated odometer prompt | Built, template-only by construction | `wa_prompt_odometer` |
| Service-window bookkeeping | Built: `waconv`, keyed by the last 10 digits, written **before** the reply | `_wa_note_inbound` |
| **One live job: odometer by photo** | Built end to end, with a five-rung hold ladder and Hinglish replies | `odometer_submit` at `sync_server.py:5541` |
| Transport-independent test path | Built: `POST /odometer/submit`, owner/supervisor, with `dry` | `sync_server.py:6307` |

### 2.1a The AI plumbing that exists, and the three pieces that do not

The owner's *"use ai wherever possible"* lands on a codebase that already runs seven AI
jobs, so the question is which parts transfer.

| Piece | State [C] |
|---|---|
| Anthropic / Gemini / OpenAI-compatible adapters, one prompt shape, digits-or-`NONE` discipline | `vision_read_odometer`, `sync_server.py:5471`; provider resolved by `vision_config()` |
| Vision on a photo, in production, with a hold ladder in front of it | `odometer_submit`; this is the model §0.2 copies |
| A read-only tool-calling agent over the business's own data | `advisor_ai.py` / `POST /ai` — 13 tools over `buses, drivers, jobcards, parts, purchases, vendors, incidents, gatechecks, driverreports, fuel, challans, coachai, gateai, meta` (`04 §6`) |
| Document reading with a human correction step | `bill_ai.py` / `POST /ai/bill`, live since 18 Oct for supplier bills ([E] c896478) — **the closest existing thing to §0.2's shape** |
| A per-user daily AI budget with a counter table | `ai_allowed`, `sync_server.py:5059`; `AI_DAILY_LIMIT` 60 per user per UTC day, shared between `/ai` and `/ai/vision` (`04 §1` row 30) |
| **Audio arriving on the webhook** | **Already parsed.** `normalize_message`'s media branch covers `audio`, so a voice note's `media_id` and `mime` already come through, and `media_data_url` already fetches the bytes with the bearer token [C `wa_client.py:162`, `:103`] |

**Three pieces do not exist, and the first two are the AI reversal's real cost:**

- **No transcription path of any kind.** A grep of `sync_server.py` for audio,
  transcribe, whisper and voice returns nothing relevant [C]. Every AI path in the repo
  is text or image. Hindi speech-to-text is new work and a new per-minute line on the
  bill (§8.6).
- **`ai_allowed` refuses every role except owner and supervisor.** Its first line is
  `if user.get("role") not in ("owner", "supervisor"): return "forbidden"`
  [C `sync_server.py:5062`]. **No driver, conductor, mechanic, storekeeper or crew
  manager can make an AI call today**, by a deliberate check whose comment says why:
  *"Any login could use it as a general proxy, with any model."* An AI-assisted chat for
  110 crew needs a budget this function does not have a shape for (§8.7).
- **The vision path this surface already uses is uncapped and uncounted.**
  `ai_allowed` is called at exactly two sites, both HTTP routes [C `sync_server.py:6573`,
  `:6610`]. `odometer_submit` calls `vision_read_odometer` directly and passes through
  neither, so **every WhatsApp odometer photo today is an unbudgeted, uncounted,
  Opus-priced call** — which matches `04 §5` row Odometer reader: *"no call counter"*,
  and R3(a): *"no queue and no spend meter"*. §15 raises this to blocking.

One more fact that decides the bigger half of the bill: `AI_MODEL` defaults to
`claude-opus-5-5` and its comment reads *"Opus by the owner's decision (18 Oct 2026):
every AI call in the app uses it"* [C `sync_server.py:5055`]. Routing a driver's
twelve-second voice note through an Opus-class model is a ~20× cost decision taken by a
default. It is §13 Q11.

**What does not exist on the transport side and this design needs.** All four are
stage-3 work, named here so nobody plans around a capability that is absent:

1. **No interactive sender.** `wa_client.py` can send exactly two things: free-form
   text (`send_text`) and an approved template (`send_template`). There is **no**
   function that sends buttons, a list, or a location request. Owner decision 4 is
   "buttons and interactive lists only" and the client cannot send one today [C — read
   `wa_client.py` in full].
2. **No location handling inbound.** `normalize_message`'s type chain covers text,
   image/document/video/audio/sticker, button and interactive. A `location` message
   falls through all of them and comes out as `{type:"location", text:"",
   media_id:None}` with the latitude and longitude discarded [C]. Owner decision 3
   needs them.
3. **No stable id off an interactive reply.** `normalize_message` takes
   `reply.get("title")` — the display text — and drops the `id` [C]. Routing on display
   text means re-wording a button silently breaks the flow, and the wording is Hinglish
   that will be revised. Stage 3 must carry the id.
4. **Whether any of this runs on Vercel is UNDETERMINED.** `_wa_handle` is dispatched
   on a daemon thread *after* the 200 is sent (`sync_server.py:6349`), and
   `04 §3.7` records that a serverless instance may be frozen when the response
   returns. If that is what happens, every reply in this document silently never
   arrives, and the symptom is a surface that looks deployed. **This is the single
   biggest delivery risk in the plan and it is a measurement, not an opinion** — it is
   §12 measure 0 and it must be taken before stage 3 starts.

### 2.2 The odometer flow is the model for every write here

`odometer_submit` is worth copying rather than paraphrasing. A driver sends a photo; it
is OCR'd; and then **five separate holds** stand between the reading and the fleet
record, each one writing an `odometerlogs` row and changing nothing: meter marked
broken, first-ever reading from WhatsApp, a reading lower than the last, a jump over
`ODO_MAX_DAILY_KM` (1,600), and a day's WhatsApp readings totalling over that cap
measured from the reading before the first WhatsApp update of the last 24 hours. Then it
re-reads the bus under the lock and holds again if it changed while the vision call was
in flight [C `sync_server.py:5541–5660`].

Every reply is written for a driver, in Hinglish, and names the bus:
*"{reg}: {km} km pichhli reading ({prev} km) se kam hai. Office check karega. Dobara
photo bhej sakte hain."*

**The rule this surface inherits:** a message can be sent by anyone from anywhere, so
every write from the chat guards itself on the server, holds rather than refuses when it
is unsure, tells the person what happened in their own register, and leaves a row
somebody can review. Nothing in this document is allowed to write a number straight
through because a button was tapped.

### 2.3 The counted cost of the jobs this surface takes over

| Job | Today | Cost today |
|---|---|---|
| **Driver attendance** | Not done. Drivers have logins and do not use them (`DECISIONS.md §7`). When it was attempted, check-in failed silently with no camera — no sheet, no toast, no error ([E] GO_LIVE "Still open", `05 §3` row 8) | **Zero records for most of ~110 crew.** The thing wages are worked out from is not being captured [I] |
| **Odometer** | Crew photograph the dashboard and send it on WhatsApp already — *"29 of 89 buses had no crew number to route to"* ([E] 19ece40, `05 §5`) | Works for the buses that have a number; the other 29 are invisible |
| **Mechanic: "work is done"** | Said aloud to the supervisor. There is no button ([D] manual, `05 §2.5`) | ~1.5 h/week (`05 §3` row 5), and the supervisor's clock stays manual |
| **Supervisor: workshop in/out times** | Written on paper at six, typed next morning ([E] 927864c) | **Mid 8 h/week — the top friction in the product** (`05 §3` row 1) |
| **Driver: report a problem on the bus** | "Report problems to the supervisor directly" — a phone call or a WhatsApp message to a human, by definition ([D] manual, `05 §5`) | Unsized. No record, so no pattern and no job card |
| **Owner: morning glance** | Open the app; the PIN is deliberately not stored for his role, so that one request *is* the login: 30–36 s on a cold server, worst first thing in the morning ([E] 6fa0a6d) | 0.1–0.5 h/week and the abandonment risk for the three people who run the garage |

### 2.4 Taps, counted honestly — and they go up

My own rule is to count the taps, so here is the count, and it does not favour this
surface:

| | Taps | Screens |
|---|---|---|
| Check-in in the app today, PIN already cached for crew | open app, Me tab, Check in, face capture = **4** | 2 (`01 §3.1` item 1) |
| Check-in on WhatsApp, fast path | open chat, attach, Location, Send, attach, Camera, shutter, Send = **8** | 1 (the chat) |
| Check-in on WhatsApp, via the menu | open chat, send anything, tap Hajri, then the 6 above = **9** | 1 |
| Check-in on WhatsApp, spoken (§4.4) | open chat, hold mic, speak, release, then the 6 above = **10** | 1 — **and zero of them require reading** |

**WhatsApp attendance is twice the taps of the app's.** I am not going to pretend
otherwise. It wins anyway, and the reason has to be stated or this whole surface rests
on a wish:

- **The competition is not the app, it is nothing.** Nobody does this today
  (`DECISIONS.md §7`). A flow one tap longer than the paper form loses to the paper
  form; there is no paper form here.
- **The four taps the app asks for are not the cost.** The cost is the install, the
  PWA, the PIN, the first sync of 50–90 s (*"several times that"* on an old Android),
  the camera permission that fails silently, and the eight distinct causes of
  "everything exists, just no data" (`05 §3` rows 4 and 8; `v2-ux.md §4.1` #12).
  WhatsApp has none of those and is already open.
- **Eight taps inside one app a person uses all day** is a different thing from four
  taps inside an app they have to be persuaded to open.
- **And after §0.1, the tap count stops being the only measure.** The spoken path is the
  *most* taps of all — ten — and is the only path that works for somebody who cannot
  read the menu (`05 §7` Q12, still open). *"Count the taps"* is the right rule when two
  flows do the same job for the same person; it is the wrong rule when one of them
  reaches a person the other cannot. Both are built, the cheap one is the default, and
  §12 measures 3 and 15 count which gets used.

Where taps genuinely fall: the mechanic's "ho gaya" (2 taps in chat against a
conversation with a supervisor that does not reliably happen), the supervisor's
"bus nikal gayi" (2 taps against writing it on paper and typing it tomorrow), and the
owner's morning glance (2 taps against a 30–36 second login).

---

## 3. Enrolment, identity and silence

### 3.1 Phone-to-person, not phone-to-bus

Today's resolution is `bus_by_phone`, and it resolves to a **bus**, not a person
[C `sync_server.py:5417`]. It takes the last 10 digits, prefers an active crew member's
`busId` from the crew bank over the stale `buses.crewPhone` copy, and binds nothing for
a number that belongs only to crew who have left. That is the right precedence and the
comment explains why (*"a driver who left kept writing his old bus's odometer"*). It is
the wrong *output* for everything except the odometer.

**What the new resolution must be.** One number resolves to **one person and their
role**, and the bus (where a bus is needed) is derived from the person:

| Role | Where the number lives today [C] | How the person is found | The bus |
|---|---|---|---|
| driver, conductor | `drivers.phone` / `drivers.altPhone`, PII-redacted (`03 §3.3`) | active `drivers` row with that 10-digit tail, then `drivers.userId` → the `users` row for the role | `drivers.busId` — the current seat; history lives in `dutylog` |
| owner, supervisor, store, mechanic, crewmanager, office | **Nowhere.** `users` is `{id, name, role}` and never holds a phone (`03 §3.7`) | **A new enrolment record is unavoidable** — see §3.2 | not applicable; staff pick from a context list or follow a link |

**This is the one data addition the surface needs**, and it is the same kind of
addition `DECISIONS.md §8` already accepted for the nightly list, so it is named for
the backend lead to accept or refuse rather than assumed:

> A store keyed by the last 10 digits of a phone number, holding: the number, the
> `users.id` it maps to, the role at the time of enrolment, who enrolled it, when,
> whether it is revoked and when, and when the PIN was last satisfied on this number.
> **Server-ingest-only, readable by nobody on a device** — the same scope `waconv`
> already has (`v2-contract.md` ~line 307, `02 §5` `SERVER_INGEST_ONLY`). It must not
> change the shape of any existing record, per `DECISIONS.md §2`.

Revocation does not need its own act for crew: marking somebody `left` or `archived` in
the crew bank must revoke their number the same day, which is exactly the rule
`bus_by_phone` already enforces [C]. For staff, revocation is a write on the enrolment
record, never a deletion, so there is a trail.

**One number, two people.** This happens: a shared handset, a family number entered as
one person's `phone` and another's `altPhone`, or `emgPhone`/`refPhone` reused. Today
`bus_by_phone` loops the crew bank and **returns the first active match it finds**
[C `sync_server.py:5444`] — iteration order decides whose bus gets the reading, silently.
That must not survive.

- **Two or more active people match:** the bot does not guess. First inbound of the day
  gets one message with a pick-your-name list (at most 10 — and a number matching more
  than 10 people is not a person's phone, it is a mistake, so it goes silent and onto
  the owner's review row). The choice holds for the rest of that calendar day, then
  expires. Every record written in that session carries which person was chosen.
- **Nobody matches:** complete silence (§3.3).
- **The number matches only people who have left:** complete silence. Not "you are no
  longer enrolled" — that is a reply, and a reply to a departed driver's phone tells
  whoever holds it now that the number was once inside the business.

### 3.2 Enrolment

**How a number becomes enrolled.** It is not a self-service act and there is no code to
send. One act, on the existing web screen:

- A crew member's number is already on their crew-bank record, so enrolment is one
  switch on **People (#8)** (`v2-ux.md §4.1`) against a person who already exists:
  *"this number may use WhatsApp."* It declares `manageDrivers`.
- A staff member has no number anywhere, so enrolment on **People (#8)** is: pick the
  login, add the number, switch it on. It declares `manageStaff`.
- Both write the enrolment record in §3.1. Neither is reachable from the chat.

**Who may do it is the owner's call, not mine** — CLAUDE.md puts minting or changing
anyone's PIN or login with the owner, and an enrolment is a login by another name. Today
a supervisor may create and reset `store, mechanic, driver, conductor` accounts
(`SUPERVISOR_MANAGES`, `02 §1`) and may not touch the four manager roles, so the
consistent answer is that a supervisor may enrol exactly the numbers of the roles whose
logins he may already mint. **That is §13 Q3 and it is the owner's to answer.**

**No PIN ever travels over WhatsApp, in either direction.** Not at enrolment, not at
reset, not as a reminder. The PIN the chat asks for is the one the person already has
(owner decision 2). A person who has forgotten it is told to see the office — one line,
no new number minted, no code sent.

**The enrolment welcome is the one message the bot sends to a person who has never
written to it, so it is a template and it is paid** (§8). It must carry the person's
name, that this number is now linked, the two things to send for attendance in the
order to send them, and that a reply to this number reaches a machine and not a human.
One per person, once.

### 3.3 Silence, and how the owner ever finds out

**An unenrolled number gets nothing.** No reply, no error, no read receipt.
Specifically, three things that are easy to get wrong:

1. **No outbound message of any kind.** Not even a one-liner.
2. **No read receipt.** Today `_wa_handle` calls `mark_read` *before* it knows who the
   sender is [C `sync_server.py:5390`]. Blue ticks are a reply — they tell the sender a
   business is on the other end. `mark_read` must move after the enrolment check.
3. **The webhook still answers `200`.** Meta retries any non-200 and the route's own
   comment says so [C `sync_server.py:6330`]. Silence is "we sent nothing", never
   "we failed the delivery".

**What is lost by this, said plainly.** Today an unenrolled number gets
*"Yeh number kisi bus se linked nahi hai. Office se apna number register karwayein."*
[C `odometer_submit`, status `enrol`] — which is a genuinely useful sentence that tells
a driver with a new SIM exactly what to do. **That sentence is being removed on the
owner's instruction.** The cost is a crew member whose number changed, who sends his
meter photo for a week and is answered by nothing, and who has no way to find out why.
The mitigations are in §3.4, and they are a worse experience for that person than the
sentence was. The owner should know that is the trade.

### 3.4 How the owner sees the silence

A silent bot with no visibility is a support problem, so three things, none of them a
new screen:

1. **Every inbound is already recorded.** `_wa_note_inbound` writes a `waconv` row for
   **every** sender, enrolled or not, keyed by the last 10 digits, before any reply
   [C `sync_server.py:5370`]. The instrument exists; nothing reads it.
2. **One row on Attention (#2)** (`v2-ux.md §4.1`): *"N unknown numbers have messaged
   this week"*, ranked with everything else, tapping through to the list. It declares
   `manageDrivers` — the capability that can act on it by enrolling somebody. The list
   shows **the number and the time and the count, and never the content of the message
   or the media**. Content stays where `waconv` already is: nowhere a device can read
   it. Do not widen `waconv`'s scope to build this; derive the count on the server.
3. **A number that matched a departed person is a separate line on that row**, because
   it is a different problem with a different fix (re-enrol the new holder, or nothing).

**Rate limiting the silence.** An unenrolled number that sends 400 messages must cost
nothing and raise nothing beyond one line. The bot's cost for silence is zero outbound
messages, which is the one good property of this requirement.

---

## 4. The menu, per role

WhatsApp caps an interactive list at **10 rows** and a button message at **3 buttons**.
Every menu below is inside those caps, and §4.3 lists where the cap decided the design
rather than the design choosing freely.

**The rule that resolves most of the cap pressure — stated once and applied
everywhere: a bus is never picked from a list in chat.** The fleet is 89–103 buses
(`03 §2` row 2; the owner says ~40 run) and 10 rows cannot hold it. A bus is either
**derived from the person** (a crew member's own seat, which `bus_by_phone` already
does) or **picked from a context list that is naturally short** (the buses standing in
the workshop; the cards a mechanic is on). Any job needing an arbitrary bus out of the
fleet is a deep link.

### 4.1 Root menus

Root menu = what a free-text message gets back (owner decision 4). Rows marked **→ web**
hand over a signed link instead of continuing the conversation.

**driver** — list, 6 rows:

| Row | Where it goes |
|---|---|
| Hajri lagao | §5.1 |
| Chhutti (ghar jaana) | §5.1, the second pair of the day |
| Meter ka photo | the live `odometer_submit` flow, unchanged |
| Bus mein kharabi hai | §5.2 |
| Diesel daala | §5.6 |
| Meri rating aur coaching | **→ web**, phone-only |

**conductor** — list, 4 rows: Hajri lagao · Chhutti · Bus mein kharabi hai · Meri
rating aur coaching (**→ web**). A conductor holds **zero** capabilities today
(`02 §1`) and everything here is own-record, so no capability is created for the role —
the same argument `v2-ux.md §4.2` makes for their one web screen.

**mechanic** — **no root menu.** His first inbound gets the thing he came for: a list
of his own open cards, oldest first, up to 9 rows, with a 10th row *"Baaki sab — app
kholein"* (**→ web**). A root menu in front of a one-job role is a message he has to
pay for to get past.

**store** — list, 5 rows: Part dena (request se) · Part wapas aaya · Stock aaya — bill
ka photo · Kam stock (**→ web**) · Ginti (**→ web**). The first three are PIN-gated
(owner decision 2 — stock).

**supervisor** — list, 8 rows. He holds 35 of 37 capabilities (`02 §0`) and a root menu
cannot carry them, so the menu carries **the jobs he does standing on the yard** and
everything else is one link:

| Row | Where it goes |
|---|---|
| Bus workshop se nikal gayi | §5.4 — writes `jobcards.outAt` |
| Bus workshop mein aa gayi | **→ web** (a new card needs a bus that is on no list, and photos) |
| Hajri lagao | §5.1 |
| Gate round — aaj ki buses | **→ web**, phone-only (ten items, three photos, a 1.5 s hold, a selfie) |
| Sign-off chahiye — N card | **→ web** |
| Dhyaan dene wali cheezein — N | **→ web** |
| Store aur bills | **→ web** |
| Paisa aur hisaab | **→ web**, PIN-gated |

**crewmanager** — list, 5 rows: Aaj raat ki buses (**→ web**) · Khaali seat — N
(**→ web**) · Diesel / AdBlue (**→ web**, §10) · Hajri lagao · Coaching approve karein
(**→ web**).

**owner** — **not a list. One plain text message carrying up to five signed links.**
See §4.2; it is the one place I recommend departing from owner decision 4, and the
reason is money.

**office** — **no chat surface at all.** §10.

### 4.2 The one recommended departure from "buttons and lists only"

A list row tap returns a value to the bot; it cannot open a URL. So a link always costs
**two** bot messages: the menu, then the message carrying the link. A plain text message
with five tappable URLs in it costs **one**.

For a menu that is *entirely* links — the owner's, and the crewmanager's four-of-five —
a text message with labelled links halves the cost and loses nothing, because the next
thing that happens is a browser either way. For every menu that continues the
conversation, lists and buttons are right and cheaper, because a list keeps the person
inside one round trip.

**Recommended:** lists and buttons everywhere a flow continues in the chat; a plain text
message with labelled links where every row is a link. It saves roughly 30–50 bot
messages a day (§8) and it is a departure from a settled decision, so it is **§13 Q5**
for the owner rather than something I take.

Two things the owner should know about it: a signed URL is long and ugly in a chat
bubble, and WhatsApp will draw a link preview for the first one — so the links must be
labelled in Hinglish on their own lines, and the preview must be suppressed or the page
must have no title worth previewing. That is stage 2's problem, named here so it is not
a surprise.

### 4.3 Where the cap decided the design — five collisions, four of them relieved

The 10-row and 3-button caps still bind **the tapping path**. They no longer bind the
surface, because §4.4 gives every one of them a spoken way round. The column that
matters now is the last one.

| # | Cap | What collided | The tapping path | What §4.4 changes |
|---|---|---|---|---|
| 1 | 10 rows | **The parts catalogue: ~2,400 parts** (`05 §2.4`) | Issue only against a request already raised from a card; free choice is a link | **Relieved.** The person says the part; AI matches the catalogue and proposes **at most three** candidates — which is exactly the button cap, so the shortlist is tappable. A name matching nothing, or more than three, falls to the link. **This brings back free-choice issue and the mechanic's named part** (§10) |
| 2 | 10 rows | **The fleet: 89–103 buses** (`03 §2`) | A bus is derived from the person or taken from a short context list, never from the fleet | **Relieved, and this was the collision that shaped the most flows.** A spoken registration or *"Shanti ki bus"* resolves against the fleet register with a proposal back. **Brings back diesel-by-chat and `jobcards.enterAt`'s bus** (§10). The §4 rule survives for the *tapping* path only |
| 3 | 10 rows | **The supervisor's 35 capabilities** (`02 §0`) | 8 rows of yard jobs, five of them links | **Relieved for reach, not for design.** He can ask for anything in one sentence. The overflow — challans, vendors, duty board, reviews, people, gate decisions, the period report — is still desk work and still answered with a link, because the constraint there was never the menu |
| 4 | 3 buttons | **Shuru kiya / Ho gaya / Part chahiye** is exactly three, with nothing to spare | No "wapas" button; going back was a free-text message that returned the menu | **Relieved, and this is the one that was load-bearing.** The escape hatch is no longer a menu-shaped apology — a person who says anything at all gets routed. The three buttons stay as the fast path |
| 5 | 10 rows | **The gate check: 10 items, 3 needing a photo, a selfie and a 1.5 s hold** ([E] 8a8cde5; `DECISIONS.md §12`) | Not in the chat; a phone-only link to Duty board (#9) | **Not relieved, and now refused for a better reason.** Ten items are a list cap problem; three photos and a 1.5-second hold are an *evidence ritual*, and the hold exists precisely so the act cannot be casual. Speech makes it more casual, not less |

One cap that never collided: the driver's 9 report categories (`REPORT_CATS` at
`app.js:12138` — Brakes, Engine, AC, Suspension, Electrical, Tyres, Gearbox, Body,
Other) fit a 10-row list with one spare [C].

### 4.4 Free text and voice: AI reads, the person taps, the server validates

Available on every flow in §5, as an alternative to the menu and never a replacement
for it.

**What a person may send instead of tapping:**

- **A Hindi or Hinglish voice note.** Transcribed, then routed. This is the path the
  owner cares most about and the one the repo has nothing for yet (§2.1a).
- **A free-text message**, in Hindi, Hinglish or English. Routed the same way.
- **A photo with a spoken or typed caption.** The caption is what makes an image
  unambiguous, which is what dissolves §16's old first risk.

**What happens to it, in four steps, every time:**

1. **Transcribe, if it is audio.** Failure here is a real state, not an error: *"Aapki
   baat saaf sunai nahi di. Dobara bolein, ya neeche se chunein."* with the menu
   attached — one message, both paths offered.
2. **Route to a flow, using only what this person may reach.** The intent router is
   given this person's role, their capabilities, their own bus or their own open cards —
   **and nothing else.** Deny-by-default applies to an AI's reads exactly as it applies
   to a screen (`spec §7`): the router may not see a store the person could not open.
   An intent the person's role cannot perform is answered with the same sentence as a
   menu row they do not have — which is to say they never see it at all.
3. **Extract the slots and propose them back for one tap.** Never a silent write
   (§0.2). The proposal always names what it understood in full — the bus by
   registration, the quantity in digits, the part by its catalogue name — because the
   thing being confirmed is the system's reading, not the person's memory.
4. **Write through the server's existing guard.** The ladder is the ladder: the odometer
   holds, the stock floor, the append-only rules, `_guard_write`. **An AI-proposed
   number that a person taps is still an untrusted number** and gets the same treatment
   as a typed one.

**The ambiguity rule.** Where the router is not confident, it asks — one message, with
at most three candidates as buttons. It never guesses between two buses, two people or
two parts. This is the §3.1 rule about one number matching two people, generalised:
**the bot does not guess about identity, money or stock.**

**Where this costs more than tapping, said plainly.** A spoken flow is: inbound voice
(free) → bot proposes (1 message) → tap → bot confirms (2 messages). That is **two bot
messages plus one transcription plus one intent call**, against the one bot message of
the attendance fast path and zero inference. **Speech is the expensive path and the
accessible one.** It is right that it exists and it would be wrong to make it the
default, which is why §4.1's menus are unchanged and why the receipt in §5.1 teaches the
cheap habit rather than the eloquent one.

**Two things the AI is not allowed to do, by this document rather than by the owner:**

- **It does not answer questions.** The advisor exists, costs up to six sequential
  Opus-class calls per question (`04 §6`), and is an owner/supervisor screen. *"Is bus ka
  kharch kitna hai"* from a driver's handset is routed to nothing and answered with his
  own menu. If the owner wants the advisor on WhatsApp that is a separate request with
  its own cost line.
- **It does not write what it was not asked for.** A voice note that mentions three
  things does one of them and says which — *"Pehle hajri laga di. Diesel ke liye phir
  bolein."* A model that fans one sentence out into three writes is the shape of an
  incident nobody can reconstruct.

---

## 5. The flow

Six flows, walked message by message — the most important job for each of driver,
mechanic, store, supervisor, crewmanager, owner. Bot messages are numbered **B1, B2…**
because the count is the bill (§8). Inbound messages are free.

The register is the existing one, taken from `odometer_submit`'s replies [C]: short
sentences, Hinglish, the bus named by registration, no emoji (consistent with the house
rule in CLAUDE.md, and because these strings will be reviewed by the same people who
read the app's), and a hold always says who will sort it out — *"Office confirm
karega."*

**Every flow below has a spoken alternative** under the §4.4 rules, and three of them
are walked both ways because the two paths cost different amounts and that is now a
design fact rather than a footnote. Where only the tapping path is written out, the
spoken one is the same four steps: say it, see the proposal, tap once, get the receipt.

### 5.1 Driver attendance — the required walk-through

**The fast path, 1 bot message.** Ramlal, 05:02, at the gate.

> **Ramlal** → sends a location pin (attach · Location · Send)
> **Ramlal** → sends a photo of himself (attach · Camera · shutter · Send)
>
> **B1** — *"Ramlal — hajri lag gayi. 05:02 baje, garage se 40 meter. Jaane ke waqt
> phir location aur photo bhejein, chhutti darj ho jayegi."*

Writes: one `attendance` row — `{userId, type:'in', at, lat, lng, dist, selfie, late,
flagged}`; the server stamps `userId` from the token, `receivedAt`, and
`atUnverified:true` when `at` is more than 10 minutes before receipt (`03 §3.7`) — plus
the chosen person if the number matched more than one (§3.1).

**Why a pair and not a menu.** The first location+photo pair of a person's day is the
check-in; the second is the check-out. No extra question, no extra message, no state to
explain. The driver learns one habit and it serves both ends of the shift.

**The prompted path, 2 bot messages.** He sends the location and forgets the photo.

> **Ramlal** → location pin, then nothing
> *(three minutes pass)*
> **B1** — *"Location mil gaya. Ab apna photo bhejein — hajri ke liye dono zaroori
> hain."*
> **Ramlal** → photo
> **B2** — *"Ramlal — hajri lag gayi. 05:06 baje, garage se 40 meter."*

The three-minute wait is deliberate: it is cheaper to wait than to send a message a man
holding a phone was about to make unnecessary. **One reminder, then the half-entry
expires silently** (§11). A second reminder is a message we pay for to tell somebody
something they have already ignored.

**The menu path, 3 bot messages.** He has forgotten the habit and types "hi".

> **Ramlal** → *"hi"*
> **B1** — list: *"Ramlal — kya karna hai?"* · Hajri lagao · Chhutti · Meter ka photo ·
> Bus mein kharabi hai · Diesel daala · Meri rating aur coaching
> **Ramlal** → taps *Hajri lagao*
> **B2** — *"Location bhejein (neeche button se), aur apna ek photo bhi."* with the
> one-tap location-request button
> **Ramlal** → location, then photo
> **B3** — the receipt as above

**The failure replies, in full.**

| What happened | Bot says | Writes |
|---|---|---|
| Number not enrolled | *(nothing — complete silence, §3.3)* | a `waconv` row only |
| Late, past `meta.lateCutoff` (default 09:30, `03 §3.7`) | *"Ramlal — hajri lag gayi. 09:48 baje, LATE. Garage se 60 meter."* | the row, `late:true` |
| Outside the garage radius (`meta.radiusM`, default 200) | *"Ramlal — hajri lag gayi, lekin garage se 7.4 km door. Office check karega."* | the row, `flagged:true` |
| Photo already sent before | *"Ramlal — hajri lag gayi, lekin yeh photo pehle bhi aaya tha. Office check karega."* | the row, `flagged:true`. **Held, never refused** — the §2.2 rule |
| Media would not download | *"Photo nahi mila. Dobara bhejein."* *(the existing string, `_wa_handle`)* | nothing |
| Already two pairs today | *"Ramlal — aaj hajri (05:02) aur chhutti (18:40) dono darj hain. Aur kuch badalna ho to office se kahein."* | nothing |
| The message is a WhatsApp **live location** rather than a pin | **UNKNOWN: does Meta's webhook deliver a live-location share as a `location` message with coordinates, and does it keep updating?** If it updates, a check-in record must take the first fix and ignore the rest, or a driver's attendance quietly follows him up the highway. Must be tested against a real account before stage 3 |

**The spoken path, 2 bot messages plus one transcription and one intent call.** For the
driver who cannot read the menu — which is the reason the owner wanted voice, and
`05 §7` Q12's open question made concrete.

> **Ramlal** → voice note: *"Bhai hajri laga do, main gate pe hoon"*
> **B1** — *"Ramlal — hajri lagani hai? Location bhejein (neeche button se) aur apna ek
> photo."* with the one-tap location-request button
> **Ramlal** → location, then photo
> **B2** — *"Ramlal — hajri lag gayi. 05:06 baje, garage se 40 meter."*

The spoken path **cannot be shorter than this**, and the reason is worth stating because
it is the one place where §0.2's safety shape and the message cost pull the same way: a
voice note carries no location and no photograph, so the proof still has to be asked
for. Speech gets a person *into* attendance; it cannot complete it. **A voice note alone
must never produce an attendance record** — that would be a wage record created by a
sentence, which is exactly the fraud §9.1 is already conceding too much ground on.

### 5.2 Driver: something is wrong with the bus — 3 bot messages

> **Ramlal** → taps *Bus mein kharabi hai* from B1
> **B2** — list: *"MH12 AB 1234 — kya kharabi hai?"* · Brake · Engine · AC ·
> Suspension · Electrical · Tyre · Gearbox · Body · Doosri
> **Ramlal** → taps *Brake*
> **B3** — *"MH12 AB 1234 — brake ki shikayat darj. Supervisor dekhega. Photo bhej
> sakte hain, usse jaldi hoga."*

Writes `driverreports` — `{driverId, busId, category, problem, photo, at,
status:'open', jobId:null}` (`03 §3.7`); the server already permits `driver` and
`conductor` to write it (`02 §4.4`). The bus comes from the crew bank, not from a list.

**The spoken path, 2 bot messages, and it is the better one here.** This is the flow the
AI reversal improves most, because a fault *is* a sentence:

> **Ramlal** → voice note: *"Left side ke brake se awaaz aa rahi hai, subah se"*
> **B1** — *"MH12 AB 1234 — brake, left side se awaaz, subah se. Supervisor ko bhej
> dein?"* buttons: *Haan* · *Nahi, doosri kharabi* · *Photo bhi bhejna hai*
> **Ramlal** → taps *Haan*
> **B2** — *"Darj ho gaya. Supervisor dekhega."*

Writes `category` (proposed from the 9 values, so the existing grouping and linking keep
working) **and `problem` in the driver's own words**, which the tapping path cannot
produce. Two consequences worth naming: the supervisor gets *"left side se awaaz"*
instead of *"Brake"*, which is the difference between a job card he can plan and one he
has to go and ask about; and `reportAiLine`, the existing reader that classifies these
descriptions ([E] db6101f), has text to read again. **The category list stays** as the
one-tap path for a driver who does not want to talk.

### 5.3 Mechanic: "ho gaya" — 3 bot messages

> **Mukesh** → *"ok"* (anything)
> **B1** — list: *"Mukesh — aapke kaam"* · *MH12 AB 1234 — brake se awaaz · 2 din se* ·
> *MH14 CD 5678 — AC band · aaj* · … up to 9 · *Baaki sab — app kholein*
> **Mukesh** → taps the first
> **B2** — buttons: *Shuru kiya* · *Ho gaya* · *Part chahiye*
> **Mukesh** → taps *Ho gaya*
> **B3** — *"MH12 AB 1234 — 14:20 baje 'ho gaya' darj. Supervisor check karega. Card
> aap band nahi kar sakte."*

Writes `jobcards.completeAt` only — the approved two-tap write from
`v2-ux.md §3.2`/`DECISIONS.md §6`. The server already refuses a mechanic a close, a
verify, a re-open or a crew change (`02 §4.4`), and nothing here asks it to stop.

| Failure | Bot says |
|---|---|
| The card was reassigned since B1 | *"Yeh card ab aapke naam nahi hai. 'kaam' likh kar apni list dobara dekhein."* — and the bot does **not** resend the list unprompted |
| Already marked done | *"MH12 AB 1234 — 'ho gaya' pehle hi darj hai (14:20). Supervisor ke paas hai."* |
| *Part chahiye* tapped | *"Kaun sa part chahiye? Bol kar bata dein."* — the one place the button path deliberately hands over to §4.4 |

**The named part comes back, and this is the clearest thing the AI reversal buys.** As
first written, the chat could only raise a request saying *a* part was needed on this
card and not *which* — because 2,400 parts do not fit ten rows — and the storekeeper got
a name and a card and had to go and ask. Now:

> **Mukesh** → voice note: *"MH12 ki brake pad chahiye, do piece"*
> **B4** — *"Brake pad (front, Tata 1512) × 2, MH12 AB 1234 ke card par. Stock mein 9
> hain. Request bhejein?"* buttons: *Haan* · *Nahi, doosra part* · *Store se baat karni
> hai*
> **Mukesh** → taps *Haan*
> **B5** — *"Request bhej di. Suresh ko dikh gaya."*

Writes a `jobcards.partRequests` entry **with the part and the quantity named**. Four
things about it, all from §4.4:

- The proposal names the catalogue part in full, not Mukesh's words, because what he is
  confirming is the system's match.
- At most three candidates. *"Brake pad"* across 2,400 rows may match several; the
  router proposes the three best and *"Nahi, doosra part"* re-asks rather than guessing.
- No match at all, or more than three plausible ones: *"Yeh part nahi mila. Store se
  phone par baat kar lein."* and the request is raised un-named, exactly as before. The
  old weak behaviour survives as the floor, not as the design.
- **A request is not an issue.** Nothing leaves the shelf on Mukesh's word; §5.5 is
  still a storekeeper, a PIN and a tap.

### 5.4 Supervisor: the bus left the workshop — 2 bot messages

The top friction in the product (mid 8 h/week, `05 §3` row 1), and the half of it that
is a yard observation rather than desk entry.

> **Vajid** → *"nikal gayi"* (anything)
> **B1** — list: *"Workshop mein khadi buses"* · *MH12 AB 1234 — 2 din 4 ghante* ·
> *MH14 CD 5678 — 6 ghante* · … up to 9 · *Baaki sab — app kholein*
> **Vajid** → taps the first
> **B2** — *"MH12 AB 1234 — 18:05 baje bahar darj. Workshop mein 2 din 4 ghante khadi
> rahi. Band karne ke liye photo chahiye: <link>"*

Writes `jobcards.outAt` — an existing field (`v2-ux.md §3.1` step 3). The list is the
buses with an open card, which is the short context list of §4, and it is also the
answer to the question `000c3dd` says he opens the app with.

| Failure | Bot says |
|---|---|
| `outAt` already set | *"MH12 AB 1234 ka bahar ka time pehle hi darj hai (kal 18:10). Badalna ho to app kholein: <link>"* |
| Somebody else set it between B1 and the tap | the same message, naming who and when. **Last writer does not win on a time somebody observed** (§11) |

**Not in the chat:** `enterAt` — a bus arriving with a new fault is not on any list yet,
so it needs a bus picked out of the fleet (cap collision 2) and photographs of the
fault. That is B1's *"Bus workshop mein aa gayi"* row and it is a phone-only link.

### 5.5 Storekeeper: issue a part against a request — 4 bot messages the first time, 3 after

PIN-gated: stock (owner decision 2).

> **Suresh** → *"part"* (anything), first message of the day
> **B1** — *"Suresh — apna 4 ank ka PIN bhejein. Aaj ek hi baar poochha jayega."*
> **Suresh** → the four digits
> **B2** — list: *"Kaun sa request?"* · *MH12 AB 1234 — brake pad — Mukesh* ·
> *MH14 CD 5678 — AC belt — Imran* · … up to 9 · *Poora store — app kholein*
> **Suresh** → taps the first
> **B3** — buttons: *1 piece* · *2 piece* · *Zyada — app kholein*
> **Suresh** → taps *1 piece*
> **B4** — *"Brake pad × 1, MH12 AB 1234 ke card par. Stock ab 7. Ho gaya."*

Writes, **in this order and for this reason**: `ledger` first, then `parts`, then the
card's `partsUsed` — because an interruption must leave an issue to finish rather than
stock short with nothing to explain it ([E] d738a6e, carried from `v2-ux.md §3.1`
step 5). The card is chosen first and is never pre-selected ([E] d738a6e again — a part
was charged to the wrong bus because the sheet pre-picked the first open job).

| Failure | Bot says |
|---|---|
| Wrong PIN | *"PIN galat. Dobara bhejein."* After the fifth wrong attempt the existing lock applies — 5 per 5 minutes per account (`MAX_FAILS`, `LOCK_WINDOW`, `sync_server.py:344`) — and the bot says *"PIN kai baar galat gaya. Kuch minute baad dobara karein."* It must not say which of the two happened at a finer grain than that |
| Stock would go below zero | *"Brake pad ka stock 0 hai. Pehle stock aana chahiye, ya app se ginti karein: <link>"* — **nothing is written** |
| The mechanic cancelled the request between B2 and the tap | *"Yeh request ab khuli nahi hai. 'part' likh kar list dobara dekhein."* |
| A second storekeeper issued it first | *"Yeh request 11:04 baje Suresh ne pehle hi poora kar diya."* |

The PIN is remembered against the number for the calendar day and is re-asked by any of:
a new day, a PIN change (which already ends every session issued under the old PIN, by
the salt in `_token_sig` [C]), or an enrolment revoke.

**Free-choice issue comes back, behind the PIN.** As first written, issuing a part that
was not already on a request meant a link, on cap collision 1. Now Suresh can say
*"MH14 ko AC belt de do, ek"* and get a proposal naming the catalogue part, the card and
the quantity, with *Haan* / *Nahi* / *Poora store — app kholein*. Three guards stay
exactly where they were, and none of them is an AI's judgement:

- **The PIN first.** Speech does not bypass the day's PIN; stock is stock.
- **A card is still required and still never pre-selected** ([E] d738a6e). If the
  sentence names no card and the bus has more than one open, the bot asks which — it
  does not pick the first, which is the bug that commit existed to fix.
- **The stock floor is the server's**, so *"de do"* on a part at zero is refused with
  nothing written, the same as the tapping path.

**The quantity is the one slot where the Q2 digit exception and speech meet.** A spoken
*"do piece"* is proposed as `2` for a tap. A number the router is unsure of is asked for
as digits — *"Kitne piece? Sirf number bhejein."* — which is precisely the unambiguous
numeric prompt Q2 allows and is cheaper and safer than a second guess.

### 5.6 Crew manager / driver at the pump: diesel — 4 bot messages

> **taps** *Diesel daala* from the root menu
> **B2** — *"Pump ki slip ka photo bhejein."*
> → photo
> **B3** — *"MH12 AB 1234 — 142 litre, ₹14,200, pump: HP Ajmer Road, meter 2,45,118.
> Sahi hai?"* buttons: *Haan* · *Nahi — app kholein*
> → taps *Haan*
> **B4** — *"Darj ho gaya. Pichhli fill se 418 km, 2.9 km/litre."*

Writes `fuel` — `{busId, litres, cost, odometer, full, at, by, pump, place}` (`03 §3.7`),
append-only for non-managers.

**Two things I will not pretend about.**

- **The litres are never typed freely.** A diesel fill is a three-digit number that
  cannot be a button, so it arrives one of three ways and all three end in a read-back:
  off a photograph of the slip, spoken (below), or as digits in answer to a one-number
  prompt under Q2. **Whether the existing bill reader can read a pump slip is still
  UNKNOWN** — `/ai/bill` is built and in use for *supplier bills* (`04 §1` row 35, [E]
  c896478) and a pump slip is a different document. CLAUDE.md says get the number first:
  this must be measured on real slips, in `dry` mode, before it is designed further. **The
  AI reversal reduces what rides on that measurement** — if the slip reads badly, diesel
  keeps the spoken path instead of leaving the chat entirely.
- **The bus used to be the blocker and is not any more.** For a driver it comes from the
  crew bank. For a crew manager or a storekeeper at the pump with somebody else's bus it
  did not, and cap collision 2 said it could not be a list, so diesel was a link for
  those two roles. **It comes back:**

> **crew manager** → voice note: *"RJ14 PA 1023 mein ek sau bayalis litre, chaudah hazaar
> do sau rupaye"*
> **B1** — *"RJ14 PA 1023 — 142 litre, ₹14,200. Meter kitna hai? Sirf number bhejein."*
> → *"245118"*
> **B2** — *"RJ14 PA 1023: 142 litre, ₹14,200, meter 2,45,118. Darj karein?"*
> *Haan* · *Nahi — app kholein*
> → *Haan*
> **B3** — *"Darj ho gaya. Pichhli fill se 418 km, 2.9 km/litre."*

  Three bot messages, one transcription, one intent call — against four bot messages and
  one vision call for the slip-photo path. **The spoken path is cheaper here**, which is
  the only flow in the document where that is true, and it is true because the slip photo
  needed its own round trip to be asked for.

  **Two guards that are not negotiable, because this is money.** The amount and the
  litres are read back in full before anything is written, per §0.2 — a misheard
  *"chaudah hazaar"* as ₹1,400 or ₹1,40,000 is a tenfold error in the fuel line and
  `v2-ux.md §4.1` #7 already names a tenfold cost error that sent the owner to inspect a
  healthy bus ([E] 8db78e7). And the odometer in a fuel row feeds km/l, so it goes
  through the **same forward-only and daily-jump checks as `odometer_submit`'s** rather
  than a second, laxer path — one ladder for one number, wherever it arrives from.

  **The slip photo stays** and stays preferred where there is a slip, because a
  photograph is evidence and a sentence is not. Speech is for the pump that gives no
  slip, and for the person who cannot read the menu.

### 5.7 Owner: the morning glance — 1 bot message

> **Owner** → anything
> **B1** — plain text (§4.2):
> *"Aaj — 10 November"*
> *"30 din ka kharch: <link>"*
> *"Sign-off chahiye — 3 card: <link>"*
> *"Dhyaan dene wali 7 cheezein: <link>"*
> *"Workshop mein 5 bus: <link>"*
> *"Naye number jo message kiye — 2: <link>"*

Writes nothing. Four numbers and a short list, which is what `000c3dd` says his home is
for, against 30–36 seconds of cold login today ([E] 6fa0a6d). The counts are in the
message so that on a morning when everything is zero he does not tap anything at all —
which is the cheapest possible version of this job and the one worth designing for.

If the owner declines §4.2 and wants a list, this becomes 2 bot messages and the counts
move into the row labels.

---

## 6. Screens

"Screen" here means one of three things, and the kind matters because only one of them
has to survive Chrome 109:

- **chat** — a conversation state on a phone. The hardware floor does not apply.
- **link · phone** — a web screen reached by a signed link, opened on a modern phone.
- **link · floor** — a web screen reached by a signed link that **will** be opened on
  Windows 7 / Chrome 109 on a Core 2 Duo, because that is what the office has
  (`spec §2`). Every rule in `v2-foundation-ui.md` applies: no `oklch()`, no
  `color-mix()`, no CSS nesting, no emoji in rendered strings,
  `scripts/check-css-floor.sh` is the gate.

Every row declares a capability. **A chat flow that declares nothing is unreachable by
everybody, including the owner** — the same deny-by-default rule as the web
(`spec §7`, `DECISIONS.md §3`), and it has to be said again here because a webhook has
no router to forget to add a line to.

### 6.1 Chat surfaces

| Surface | The job it serves | Role (capability) | Must be on it | Must NOT be on it |
|---|---|---|---|---|
| **Root menu** | "What can I do from here?" | every enrolled role; each row declares its own flow's capability | Only the rows this person's role can actually complete; at most 10; the person's own name so a shared handset shows whose session it is | Any row that ends in "you cannot do this". A row for a capability the role lacks. Any count the person cannot act on |
| **Hajri** (check-in / check-out) | "Record that I am here, so I am paid" | driver, conductor, mechanic, store, supervisor, crewmanager (own record only; no capability — `attendance` is append-only for non-managers, `02 §4.4`) | Location, photo, the time as the message's own timestamp, the distance from the garage, the late flag, the name of the person it was recorded against | Anyone else's attendance. The total for the month. Any correction of a past record — that is a manager act on the web |
| **Meter** | "Record this bus's odometer" | driver, conductor (own bus) | Exactly today's live behaviour: the photo, the five holds, the Hinglish reply naming the bus [C `odometer_submit`] | A typed number. Any reading that bypasses a hold |
| **Kharabi** (problem report) | "Something is wrong with my bus" | driver, conductor (`driverreports`, own bus) | The 9 categories, an optional photo, the bus derived from the crew bank | A free-text field. Another bus. The status of the report afterwards — it goes to the supervisor, not into a thread |
| **Mera kaam** (job-card taps) | "Say I started, say I am done, say I need a part" | mechanic (own cards; `jobcards` per-record rule, `02 §4.4`) | Own open cards oldest-first with the bus, the fault and the age; the three buttons | Another mechanic's card — **it leaked once** (`02 §6.2`). A close button. A verify button. An hours field |
| **Bus nikal gayi** | "Stamp the time this bus left the yard" | supervisor, owner (`addJob`-holders; writes an existing `jobcards` field) | Only buses with an open card, with how long each has stood | The fleet list. `enterAt`. The close gate |
| **Part dena / wapas** | "Hand out a part against a card without the count drifting" | store, supervisor, owner (`issuePart`) — **PIN-gated** | Waiting requests only; quantity 1 or 2 or a link; the resulting stock number in the receipt | The 2,400-part catalogue. A pre-selected card ([E] d738a6e). Any issue with no card |
| **Diesel** | "Record what went into this bus at the pump" | driver and conductor for their own bus; `addFuel` holders by link only (§5.6) | The slip photo, the read-back of every number for confirmation, the km/l since the last fill | A typed litre or rupee figure. A bus the sender is not crewing |
| **PIN gate** | "Prove this is the person, not the handset" | any role whose next act touches cash, stock or a gate pass | One ask per calendar day per number; the existing lock behaviour; a re-ask after a PIN change or a revoke | The PIN in any outbound message, ever. Any hint of which digit was wrong. A PIN for a read-only act |
| **Enrolment welcome** | "This number is now linked, and here is the one habit" | sent once per person, by the enroller's act | The person's name, the two things to send and the order, that the replies come from a machine | A PIN. A code. A link to anything that writes |
| **Silence** | *(no surface — §3.3)* | — | Nothing. No text, no read receipt. The webhook still answers 200 | Any outbound byte |
| **Bol kar bataiye** (voice or free text, §4.4) | "Let me just say what I want" — and for the person who cannot read a menu at all (`05 §7` Q12) | every enrolled role; **the flow it routes to declares the capability, and the router may read only what that person could already open** | The transcription shown back inside the proposal, so a person can see what was heard; at most three candidates when it is unsure; one flow per message, named | **Answers to questions** — the advisor is an owner/supervisor screen costing up to six sequential calls (`04 §6`), and this is not it. Any write the person has not tapped. Any store the person's role cannot see. More than one write from one sentence |
| **Proposal** (the confirm step) | "Is this what you meant?" | whichever flow proposed it | What was understood, in full and in the person's register — the bus by registration, the quantity in digits, the part by its catalogue name; and the one tap that commits it | A pre-ticked default. A proposal for an act the person's capability does not cover. A silent write if nobody taps — **an unconfirmed proposal expires and writes nothing** (§11) |

### 6.2 Web screens reached by a link — and which must survive the floor

No new web screen. Every link lands on one of the twelve in `v2-ux.md §4.1`, deep into
the one state the message was about.

| Link | Lands on | Role (capability) | Device |
|---|---|---|---|
| Aaj ka kharch / 30-din | **Money (#7)** | owner, supervisor (`money` + `viewSpendTotals`) | **link · floor** |
| Sign-off chahiye — N card | **Attention (#2)**, the verify queue | owner, supervisor (`verifyJob`, and `closedBy !== me` per `DECISIONS.md §10`) | **link · floor** |
| Dhyaan dene wali cheezein | **Attention (#2)** | owner, supervisor (`viewAttention`, per row) | **link · floor** |
| Naye number jo message kiye | **Attention (#2)**, the row from §3.4 | owner, supervisor (`manageDrivers`) | **link · floor** |
| Workshop mein N bus | **Jobs (#3)** | supervisor, owner, store (read), mechanic (own) (`viewJobs`) | **link · floor** |
| Card band karna — photo chahiye | **Job card (#4)** | supervisor, owner (`mayCloseJob`) | **link · phone** — the camera is the point |
| Bus workshop mein aa gayi | **Job card (#4)**, new | supervisor, owner (`addJob`) | **link · phone** |
| Gate round — aaj ki buses | **Duty board (#9)** | supervisor (`gateCheck`) | **link · phone** — selfie, three photos, a 1.5 s hold |
| Aaj raat ki buses / khaali seat | **Duty board (#9)** | crewmanager, supervisor, owner (`assignDriver`) | **link · floor** |
| Poora store / ginti / kam stock | **Store (#6)** | store, supervisor, owner (`viewStore`, `issuePart`, `receiveStock` — and `receiveStock` is Q6 in `v2-ux.md §8`, still open) | **link · floor** |
| Diesel galat — theek karein | **Fuel & tyres (#10)** | crewmanager, store, owner, supervisor (`addFuel`) | **link · phone** |
| Coaching approve karein | **People (#8)** | crewmanager, owner, supervisor (`crewNote`) | **link · floor** |
| Meri rating aur coaching | **Me (#12)**, own rows only | driver, conductor, mechanic (own; `/my/reviews`, `/my/coaching`) | **link · phone** |
| Mere documents | **Me (#12)**, own | driver, conductor (own; `driverdocs` permission-or-self) | **link · phone** |

**No link to a live map.** `v2-ux.md §5.2` dropped it pending Q9 (*who opens it, to
answer what?*) and this surface does not restore a screen that question has not
answered.

---

## 7. The deep-link contract

Requirements only. The crypto is not mine to design, and the shape below exists only
because the server already has one that satisfies most of it.

**What a link must carry:** who it was minted for (a `users.id`), the one screen and the
one record it opens, when it was minted, when it dies, and a signature that nothing on
a phone can forge.

**What it must NOT carry:** a PIN. A password. A normal 12-hour session token. Any name,
registration number or rupee figure **in the URL itself** — the link sits in a chat
thread forever, gets forwarded, and WhatsApp draws a preview of it. Anything legible in
the URL is legible to whoever the thread is forwarded to.

**What it grants:** the one screen it names, for the one person it names, at that
person's existing capabilities — never more. Tapping a link must not create a session
that can then be navigated out of into Money. A link is a key to a door, not to the
building.

**How long it lives:** minutes, not hours. **Recommended: 15 minutes and one use.** The
flows it serves are all "I am looking at this now" — a photo to close a card, a verify
queue, a stock count. The cost of being wrong on the short side is one extra bot message
to mint a new one (₹0.115 by the secondary-source rate in §8); the cost of being wrong
on the long side is a forwarded link into the money screen.

**The server already has most of this** [C `sync_server.py:1075–1100`]: a token is
`uid.exp.sig` where `sig` is an HMAC over `uid`, `exp` and **the account's current PIN
salt** — so `set_pin` ends every token issued under the old PIN. Two properties come
free and both matter here: changing somebody's PIN kills every link already sitting in
their chat history, and the verification is stateless, so a link does not die when a
serverless instance restarts (which the comment says was the reason for the design). A
link token is the same shape with a much shorter `exp` and a screen and record bound
into the signature.

**When an expired link is tapped:** a page, in Hinglish, that says the link has expired
and that a fresh one can be asked for in the chat — and **nothing else on it**. Not a
login screen (a person who taps an expired link and then signs in with a PIN has been
taught to type their PIN into whatever a link opens, which is the whole of phishing).
Not a `403`. Not a blank page. The page must survive the floor, because an expired link
is as likely to be tapped on the office PC as on a phone.

**Revocation:** an enrolment revoke must kill that number's outstanding links
immediately, by the same mechanism as a PIN change.

---

## 8. The cost of talking

**Two lines, kept apart on purpose, because they are controlled by different decisions
and the second is the larger.**

| Line | What drives it | Mid estimate | Where |
|---|---|---|---|
| **A — Meta messages** | every message the bot sends | **≈ ₹1,700 / month** | §8.1–§8.4 |
| **B — AI inference** | every voice note and free-text message, and every photo | **≈ ₹4,600 / month** at a small-model routing tier, **≈ ₹22,300 / month** if routing stays on Opus | §8.6 |

**Do not add these into one number.** Line A moves on how many round trips the flows
take; line B moves on a model choice and a per-role cap, neither of which exists in the
code yet. **The single most valuable cost decision in this document is §13 Q11, the
routing model tier, and it is worth about ₹17,700 a month** — ten times the whole of
line A.

**The Meta pricing premise in my brief was corrected mid-task and the correction is
structural.** The version below is the one this document is designed against.

### 8.1 The rules, as given to me

1. **Inbound messages from people are free.** Unchanged.
2. **Every message the bot sends is a service message and is charged**, beyond a free
   tier of **1,000 delivered service messages per month per business phone number**.
   Unused ones do not roll over; the tier resets monthly in the account's timezone.
3. **Utility templates sent inside the open 24-hour window are now charged too**, since
   1 October 2026. Only utility messages inside a free-entry-point window remain free.
4. **The India rate card is not on Meta's pricing page.** Secondary sources put India
   utility at roughly **₹0.115** and marketing at roughly **₹0.86** per delivered
   message, with volume tiers on utility. **Both figures are unverified secondary-source
   estimates. The owner must confirm them against Meta's own rate card before agreeing
   to any budget**, and every rupee figure below moves with them.

**What this changes about the design.** The cost driver is no longer "how many prompts
the bot starts". It is **every message the bot sends**, including replies to somebody
who wrote first. 1,000 free a month across ~100 staff is about **10 bot messages per
person per month** — roughly one working day of this surface. So **round trips are the
cost unit and minimising them is a first-class constraint**, which is why §5 counts
them, why attendance is a pair of inbound messages answered by one receipt rather than a
four-message interview, and why §4.2 recommends a text-with-links menu over a list
whose rows are all links.

### 8.2 Bot messages per flow

Line A only. The inference each spoken flow also costs is in §8.6.

| Flow | Bot messages | Note |
|---|---|---|
| Attendance, fast path (location + photo sent unprompted) | **1** | the designed-for path |
| Attendance, prompted (location only, then asked) | **2** | one reminder, then silence |
| Attendance, via the menu | **3** | the fallback |
| Odometer (photo sent unprompted) | **1** | today's live behaviour |
| Odometer, via the menu | **3** | |
| Problem report | **3** | menu, categories, receipt |
| Mechanic start / done / part | **3** | own cards, three buttons, receipt |
| Supervisor "bus nikal gayi" | **2** | standing buses, receipt |
| Store part issue, first of the day | **4** | PIN, requests, quantity, receipt |
| Store part issue, later the same day | **3** | |
| Diesel from a slip photo | **4** | menu, ask slip, read-back, receipt |
| Owner / any all-links menu, as text (§4.2) | **1** | **2** if the owner keeps lists |
| Any other deep link out | **2** | menu, then the link |
| Enrolment welcome | **1** | template, once per person, ever |
| Shift-end odometer prompt | **1** | template, bot-initiated |
| Missed-checkout nudge | **1** | template, bot-initiated |
| Stray free-text → menu | **1** | **withdrawn by §0.1** — a free-text message is now routed, not deflected. Kept in the table as the floor for a message that routes to nothing |
| **Unenrolled number** | **0** | the only free conversation in the product |
| **Any spoken flow** (§4.4): propose, then receipt | **2** | **plus** one transcription and one intent call. Attendance spoken is 2 against 1 tapped; diesel spoken is 3 against 4 — the only flow where speech is cheaper on line A |
| Transcription failed, menu offered | **1** | and the transcription is still paid for on line B |
| Router unsure, up to three candidates offered | **+1** | the §4.4 ambiguity rule, and the reason it is capped at three |

### 8.3 Bot-initiated flows — the templates, counted

**Four**, and only four. Each is a message the bot sends to somebody who has not just
written to it, so each is a Meta-approved template, each costs money, and each must say
everything it needs to say in one shot because the person cannot be mid-conversation.

| # | Template | To | When | Must contain | Volume/day |
|---|---|---|---|---|---|
| 1 | **Enrolment welcome** | one person | once, at enrolment | the person's name; that this number is linked to Garage Saathi; the two things to send for attendance and the order; that replies come from a machine, not a person; **no PIN, no code, no link** | ~0 steady; ~110 once at rollout |
| 2 | **Shift-end odometer** | the crew of a bus whose reading is missing | once per bus per day, end of shift | the bus registration; that a meter photo is wanted; nothing else. *(This already exists — `wa_prompt_odometer`, template-only by construction [C])* | 20 (half of ~40 running buses are already inside the window) |
| 3 | **Missed checkout** | a person checked in and not out | once, after the shift-end cutoff | the person's name; the check-in time; that location + photo closes the day | 10 |
| 4 | **Monday summary** | owner | weekly | that the week's summary is ready, and the link | 0.2 |

Everything else in this document is person-first and therefore free-form inside the
window — which, since 1 October 2026, is no longer free, only unconstrained. **No
template for a document expiry, a challan, a low stock level or a gate hold.** Those are
findings with no deadline inside a working day; they belong on **Attention (#2)** where
the decider already looks (`v2-ux.md §4.1`), and paying per push for each one is how a
business ends up muting its own bot.

### 8.4 Line A — the Meta per-day estimate, and every assumption in it

**Assumptions, each a number the owner can argue with.** Where the repo and the owner
disagree, both are shown.

| # | Assumption | Value | Source / why |
|---|---|---|---|
| A1 | Enrolled crew (drivers + conductors) | **110** | `05 §1`: drivers 54/107/108/110 disagree, conductors 56–57, 110 active crew ([E] 5eb8c6e), 165 logins minted. 110 is the figure to argue with first |
| A2 | Enrolled staff (owner, 2 supervisors, 1 crewmanager, 1 store, 3 mechanics, office) | **9** | `05 §1`; mechanic, store and office counts are [I] |
| A3 | Buses running per night | **40** | the owner's figure. The repo says 89–103 buses exist (`03 §2`). If 90 run, the odometer lines treble |
| A4 | Working days per month | **26** | [I] |
| A5 | Attendance events per crew member per day | **2** | in and out |
| A6 | Share of check-ins on the 1-message fast path | **60%** | [I] — **the single most important assumption in this table.** At 0% the bill roughly doubles |
| A7 | Problem reports per driver per week | **1** | [I] |
| A8 | Mechanic card actions per mechanic per day | **2** | start and done |
| A9 | Part issues per day | **15** | [I] |
| A10 | Supervisor chat actions per supervisor per day | **10** | [I] |
| A11 | Stray free-text messages answered with a menu, per day | **20** | [I] |
| A12 | India utility rate per delivered message | **₹0.115** | **unverified secondary source.** Owner must confirm against Meta's rate card |
| A13 | Free tier | **1,000 service messages/month**, no rollover | as given |
| **A14** | **Share of interactions done by voice or free text rather than tapping** | **20%** | **New, from §0.1.** [I], and the assumption line B hangs on exactly as line A hangs on A6. At 60% line B triples |

**Mid case — everything in scope, the paths mixed as above:**

| Line | Arithmetic | Bot msgs/day |
|---|---|---|
| Crew attendance, in and out | 110 × 2 × 1.5 avg (60% at 1, 40% at 2) | 330 |
| Odometer replies | 40 buses × 1 | 40 |
| Shift-end odometer templates | 40 × 50% out of window | 20 |
| Missed-checkout templates | | 10 |
| Driver problem reports | 54 × (1/5 per day) × 3 | 33 |
| Mechanic card actions | 3 × 2 × 3 | 18 |
| Store part issues | 15 × 4, +1 PIN | 61 |
| Supervisor actions | 2 × 10 × 2, +2 PIN | 42 |
| Crew manager | 6 × 3, +1 PIN | 19 |
| Owner | 3 sessions × 2 (lists, not §4.2) | 6 |
| Stray free-text → menu | | 20 |
| **Total** | | **≈ 600 / day** |

- **600 × 26 = 15,600 bot messages a month.** Less the 1,000 free = **14,600 billable**.
- At A12, **₹1,679 ≈ ₹1,700 a month, about ₹65 per working day.**
- **The free tier is 1.7 working days of this surface.** It is not a cost control; it is
  a trial.

**Low case** — attendance and odometer only, fast paths favoured (A6 at 80%), no store
or supervisor flows: ≈ **420/day** → 10,920/month − 1,000 = 9,920 → **≈ ₹1,140/month**.

**High case** — nobody learns the habit (A6 at 0%, every attendance via the menu at 3
messages), every menu a list, double the stray traffic: ≈ **1,000/day** → 26,000/month
− 1,000 = 25,000 → **≈ ₹2,875/month**.

**Line A range: ₹1,150 – ₹2,900 a month, mid ₹1,700 (₹44 – ₹112 per working day, mid
₹65), on an unverified rate.**

**What the AI reversal does to line A: almost nothing, and that is the finding.** At
A14's 20%, attendance's blended cost moves from 1.5 to 1.6 bot messages (speech is 2
against the fast path's 1), while the problem report, the mechanic's taps and diesel all
get *cheaper* on line A because a sentence replaces a menu step. Net ≈ **620/day
instead of 600, about ₹1,760 a month.** Inside the noise of A6 and A12.

**So the reversal is not a message-cost decision at all. It is an inference-cost
decision, and §8.6 is where it lands.** Against the 8 h/week the supervisor spends on
the workshop clock alone (`05 §3` row 1), line A was never the question; the question is
A12, line B, and whether 100 people actually use it.

**Three levers, if the number comes back too high:** push A6 up (teach the pair, make
the receipt name the habit); take §4.2 (every all-links menu goes 2 → 1); and **find out
whether an interactive list already sitting in the chat can be re-opened later** — see
§11, it could remove a menu message from most repeat flows and I do not know the answer.

### 8.5 What line A does not include

- **Nothing for inbound.** Unenrolled numbers cost zero, which is the one thing the
  silence requirement buys.
- **No inference.** Every vision call, transcription and intent call is line B.
- **Vision was already uncounted before the reversal.** Every odometer photo is an
  Opus-priced call that passes through neither `ai_allowed` site [C `sync_server.py:6573`,
  `:6610`], so a driver who sends ten photos because the first was blurry costs ten
  calls that nothing records. `04 §5` R3(a) names the gap — *"no queue and no spend
  meter"* — and **§15 now treats it as blocking**, because an uncapped and uncounted AI
  surface on a live system is how a cost becomes an invoice nobody predicted. The
  server's own code says this in another context: the sync rate limiter exists because
  *"on a per-request serverless bill that is a runaway cost with nobody watching, and the
  first anybody learns of it is the invoice"* [C `sync_server.py:272`]. The same
  sentence applies here and there is no limiter.

### 8.6 Line B — AI inference, the larger half

**Model assumption, stated first because it dominates everything else.** `AI_MODEL`
defaults to `claude-opus-5-5`, and its comment records *"Opus by the owner's decision
(18 Oct 2026): every AI call in the app uses it"* [C `sync_server.py:5055`]. That
decision was taken for seven analytical jobs run a few times a day by two people. This
surface would run intent routing on ~320 short utterances a day from 110 people, which
is a different kind of work: short input, short output, no reasoning, no tool chain.
**Routing on an Opus-class model costs roughly twenty times a small/fast tier for no
gain this surface can use.** Priced both ways below; the choice is §13 Q11.

**Rates. All four are unverified secondary-source estimates and the owner must confirm
them against the providers' own price lists before agreeing a budget — exactly as with
Meta's ₹0.115** (A12). They are written as arithmetic so a real figure can be
substituted without redoing the design.

| | Assumption | Value | Label |
|---|---|---|---|
| B1 | Voice note length | **12 s** average | [I] |
| B2 | Hindi speech-to-text | **₹1.00 per minute** → **₹0.20 per note** | unverified estimate; no such path exists in the repo (§2.1a) |
| B3 | Intent + slot call, token size | **~1,500 input + ~100 output** — a system prompt, this person's role and capabilities, their own bus or cards, the utterance | derived from the §4.4 design, not a guess |
| B4 | B3 priced on an **Opus-class** model | **≈ ₹2.25 per call** | unverified order-of-magnitude estimate |
| B5 | B3 priced on a **small/fast** model | **≈ ₹0.12 per call** | unverified; ~1/20th of B4 is the industry shape, not a quoted price |
| B6 | A vision call (odometer photo, pump slip) | **≈ ₹2.00 per image** | unverified. Vision stays on a capable model either way — reading a dusty instrument cluster is the one job here that earns it |

**Volumes per working day**, from A1–A3 and A14:

| Line | Arithmetic | Calls/day |
|---|---|---|
| Transcriptions | 110 crew × 1.5 spoken messages + 9 staff × 3 | **190** |
| Intent calls on voice | one per transcription | **190** |
| Intent calls on free text | 110 × 1 + 9 × 2 | **130** |
| Vision — odometer | 40 running buses × 1 | **40** |
| Vision — pump slips | | **10** |
| Re-asks (router unsure, transcription failed) | ~10% of the above | **55** |

**The two totals:**

| | STT | Intent | Vision | Per day | **Per month (×26)** |
|---|---|---|---|---|---|
| **Routing on Opus-class (B4)** | 190 × ₹0.20 = ₹38 | 375 × ₹2.25 = ₹844 | 50 × ₹2.00 = ₹100 | **≈ ₹982** | **≈ ₹25,500** |
| **Routing on small/fast (B5)** | ₹38 | 375 × ₹0.12 = ₹45 | ₹100 | **≈ ₹183** | **≈ ₹4,760** |

Rounding to the honesty the inputs deserve: **line B is ≈ ₹4,600–₹5,000 a month if
routing moves to a small model, and ≈ ₹22,000–₹25,500 a month if it stays on Opus.**

**Three things the owner should take from this:**

1. **Line B is 3× to 15× line A.** The Meta bill was never the thing to worry about.
2. **The model tier is worth ~₹17,700 a month** and is currently decided by an
   environment variable's default and a comment about a decision taken for different
   work.
3. **At A14 = 60% instead of 20%, line B roughly triples.** The more the owner gets what
   he asked for, the faster this grows — which is the argument for §8.7 and not an
   argument against voice.

### 8.7 Caps, because 110 people with unlimited voice notes is an unbounded bill

`AI_DAILY_LIMIT` is 60 per user per UTC day, counted in an `aiusage` table keyed
`userId:date`, shared between `/ai` and `/ai/vision` [C `sync_server.py:5056`, `:5063`;
`04 §1` row 30]. Two things about it matter here:

- **It does not apply to crew, because nothing applies to crew.** `ai_allowed`'s first
  line refuses any role that is not owner or supervisor
  [C `sync_server.py:5062`]. So the existing cap cannot be reused by widening it: the
  function has to learn a per-role budget it does not have.
- **60 is the wrong number for this surface.** It was sized for an advisor question, of
  which a supervisor asks a handful. 110 crew × 60 would be a 6,600-call-a-day ceiling,
  which at B4 is ₹14,850 **a day**.

**What this design needs, as a requirement rather than a number I get to pick:**

| | Requirement | My recommendation |
|---|---|---|
| 1 | **Crew get their own, much lower daily cap** | **10 AI-assisted interactions per crew member per day.** Three attendance events, an odometer, a report and a few re-asks is a full day's honest use; the eleventh is a loop or a game |
| 2 | **The cap is counted per *number* as well as per user** | A shared handset must not get two people's budgets, and an enrolment matching two people (§3.1) must not double it |
| 3 | **Hitting the cap must not take the surface away** | The person falls back to **buttons and lists**, which cost nothing on line B: *"Aaj bol kar bahut baar poochha. Neeche se chunein."* **§13 Q12** — the alternative is silence, and silence to a driver who has hit a limit he was never told about is the worst outcome available |
| 4 | **A fleet-wide daily ceiling, not only a per-person one** | Per-person caps multiply. One number the owner can set that stops the whole surface spending more than he agreed, and says so on `/health` |
| 5 | **Every inference call is counted, including vision** | The gap in §8.5. Without it none of the above is checkable and §12 measure 14 cannot be read |

**The ceiling this buys:** 110 crew × 10 + 9 staff × 60 = **1,640 interactions/day**
worst case. At B5 that is ≈ ₹295/day (₹7,670/month); at B4 ≈ ₹3,700/day
(₹96,000/month). **The cap alone does not make this safe — the model tier does.** Both
are needed and that is the point of stating them together.

---

## 9. The trade-offs and the retention rule, named rather than listed

### 9.1 Attendance integrity drops, and this is an accepted trade

Today's check-in is camera + GPS with a live face capture (`captureFace`, `01 §3.1`
item 1) and `faceVerified` on the record (`03 §3.7`). A WhatsApp message can be sent by
anybody holding the phone, from anywhere. Location and a photo recover most of the
proof; **there is no liveness check**, so the photo can be a gallery picture and the
location can be a dropped pin. **Buddy-punching gets easier, in a business that handles
cash.**

**This is accepted on the owner's instruction (decision 3), not mitigated away.** What
can be done, and is:

- **Both halves are stored on the record** and both are already in the shape:
  `lat`, `lng`, `dist`, `selfie` (`03 §3.7`). No shape change.
- **Outside `meta.radiusM` (default 200 m) sets `flagged:true`** — recorded, never
  refused, following the §2.2 rule.
- **A photo the system has seen before sets `flagged:true`.** Same photo twice is the
  cheapest form of the fraud and the cheapest thing to catch.
- **The time is the message's own timestamp**, which `normalize_message` already keeps
  [C], and the server already sets `atUnverified:true` when `at` is more than 10 minutes
  before receipt (`03 §3.7`). A check-in that sat in a queue on a phone with no signal is
  marked as such rather than being quietly believed or quietly refused.
- **UNKNOWN: whether Meta's inbound payload distinguishes a camera capture from a
  gallery pick.** `normalize_message` surfaces `mime` and nothing more [C]. If it does
  not, no amount of design recovers liveness here, and that should be stated to the
  owner in one sentence rather than discovered later.
- **AI helps here slightly, and it would be dishonest to claim more.** A vision call can
  tell a face from an instrument cluster (which is what §16 item 1 now rests on), can
  flag an image that is a photograph of a screen rather than of a person, and can notice
  the same background twice. **It cannot establish liveness**, and a model's opinion that
  a photo looks live is not evidence to settle a wage dispute with. Every AI judgement
  here raises a `flagged` for a human, under §0.2, and decides nothing.
- **A WhatsApp attendance record should be distinguishable from an app one.** The
  odometer flow already does exactly this with `source: "whatsapp"` [C], and the holds
  branch on it. **§13 Q6:** does the owner want WhatsApp attendance marked as a
  different grade of proof — so that if it is ever used to settle a wage dispute,
  whoever is settling it knows which kind they are looking at?

### 9.2 The hardware floor does not apply to the chat, and fully applies to every link

Phones are modern; the chat never touches Chrome 109. **But the office is Windows 7 on
Chrome 109, some of it on Core 2 Duos** (`spec §2`), and a link from a chat opens in a
browser. §6.2 marks every link **phone** or **floor**. The floor ones — Money,
Attention, Jobs, Store, Duty board seats, People — are screens the office opens all day
and already have to pass `scripts/check-css-floor.sh`. The phone-only ones are exactly
the ones that need a camera: closing a card, a new fault, the gate round, a fuel
correction, a crew member's own documents.

**The expired-link page is the one new page this surface implies, and it is a floor
page**, because an expired link is as likely to be tapped at the office desk as at the
gate (§7).

### 9.3 Silence costs the person it is protecting against

Covered in §3.3: the one genuinely helpful sentence in today's flow is being removed,
and the crew member with a new SIM is the person who pays for it. The mitigation is an
owner-facing row, which does nothing for him until somebody reads it.

### 9.4 Retention — 90 days for the image, forever for the record (Q9, decided)

**The owner's decision:** the attendance image is deleted after 90 days; the attendance
record, its time and its location are kept permanently.

**As one configurable setting with 90 as its value**, so changing it later is a config
change and not a migration — one environment variable in the shape the server already
uses for every other knob (`AI_DAILY_LIMIT`, `ODO_MAX_DAILY_KM`, `SESSION_TTL_SEC` are
all this pattern [C]). Not a constant, not a number in three places.

**What is deleted, precisely, and why the precision matters.** Photos in this system are
not rows. `/upload` stores them in **Cloudflare R2 behind permanent public URLs**, and
the local-disk `/uploads/<32hex>.(jpg|png|pdf)` route has **no auth at all — "anyone"**
(`04 §1` row 3, `04 §8`). So:

- **Clearing the field on the `attendance` record is not deletion.** The image stays at
  a public URL for ever and anyone who ever saw the link still has it. **Deletion means
  the R2 object is gone.** `POST /upload/delete` exists (`04 §1`) and this is what it is
  for.
- **Both halves, in an order that cannot leave an orphan.** Delete the object, then
  clear the reference — the other order leaves an unreferenced public photo that nothing
  knows about, which is worse than either failure alone.
- **The record keeps everything else for ever**: the time, the location, the distance,
  the late and flagged marks, who it was recorded against. A wage dispute in year two is
  settled on those; the face was only ever the proof at the moment.

**One thing not in our control, and the owner should know it:** Meta holds the inbound
media on its own side for its own period. Our 90 days is our copy.

**Where the job runs.** On **GitHub Actions**, which is the only scheduler in this repo
with a cron — `.github/workflows/ai-jobs.yml` (every 10 minutes) and `health.yml` (every
10 minutes) [C]. Once a day is enough; it calls a server route that does the work.
**Not** on the office-laptop Chrome extension: `04 §5` R3(b) records that the redPro
path *"depends on one laptop with a pinned, signed-in tab"*, and a deletion guarantee
must not depend on somebody leaving a laptop open.

**What proves it ran** — because a retention rule nobody can verify is the same
decoration as a check that cannot fail (CLAUDE.md):

1. **A number on `/health`:** the age in days of the **oldest surviving attendance
   image**. If retention is working it is ≤ 90, always. If it is 94, the job has not run
   for four days and the one number says so. `/health` is already the place this
   codebase puts this kind of truth — it reports the build tag and a cached R2
   `HeadBucket` result for exactly this reason (`04 §8`, `sync_server.py:150`).
2. **The last run's timestamp and its delete count**, on the same endpoint. A run that
   deleted zero on a day when images turned 91 is a failure that looks like success.
3. **A gate check, and it must be made to go red.** A fixture with a 91-day-old image
   must come back deleted and its R2 object gone. Then break the job and confirm the
   check fails — CLAUDE.md: *"A check that cannot fail is decoration. After adding one,
   break the thing it covers and confirm it goes red."* This is the one assertion that
   makes the owner's decision real rather than written down.

**The deletion is a production database write and a production object delete, so it is
the owner's to run the first time.** Hand over the command; do not run it. And the first
run on a live system will have 90 days of backlog in it, so it needs a count before it
needs a schedule.

### 9.5 AI is a new integrity surface, not only a new input

Three consequences of §0.1 that are not cost and not UX, stated so they are decisions:

- **Everything a person says is now sent to a model.** A voice note recorded in a yard
  may contain a passenger's name, a rate, an argument. Line B's inference is a third
  party receiving staff speech. `04 §6` already lists what the advisor sends and
  deliberately strips PNR, seat, fare and passenger names from reviews; **the intent
  router must be held to the same standard, and it sees raw human speech, which is
  harder.** It gets this person's role, their capabilities, their own bus or cards, and
  the utterance — and §4.4 step 2 is the whole rule.
- **An utterance is an instruction from an untrusted source.** A driver forwarding a
  passenger's message, or reading one aloud, is text from outside the business arriving
  at something that can write. The router must treat every utterance as data about what
  *this person* wants, never as instructions — and §0.2's confirm step is the backstop
  that makes a bad route visible before it is a write.
- **`waconv` now holds speech, not just timestamps.** Today it is `{phone, lastInboundAt,
  lastMessageId}` [C `_wa_note_inbound`]. If transcripts are kept there, the store that
  is readable by nobody on a device (`v2-contract.md` ~line 307) becomes a record of
  what staff said. **My position: transcripts are not retained beyond the conversation
  that needed them**, on the same reasoning as §9.4. It is listed in §13 Q15 because
  retention is the owner's call, not mine.

---

## 10. Dropped

Never empty, and the most useful section here. **Every job in `05 §2` and `05 §5` is
either carried into the chat (§5), reached by a link (§6.2), or dropped below with a
reason.**

### 10.0 What the AI reversal brought back

Four flows were killed on the 10-row cap. **Three come back into the chat and one comes
back in half.** This is the most useful consequence of §0.1 and it is recorded before the
drops so the change is visible rather than quietly absorbed.

| Flow | Was dropped because | Comes back as | Where |
|---|---|---|---|
| **The mechanic's part request names the part** | 2,400 parts vs 10 rows, so the request said *a* part was needed and not which | He says it; the catalogue match is proposed; one tap. The un-named request survives as the floor when nothing matches | §5.3 |
| **Free-choice part issue** (not against a request) | Same cap; a search box was typing | The storekeeper says it, behind the same PIN, the same card requirement and the same stock floor | §5.5 |
| **Diesel for a bus the sender is not crewing** | 89–103 buses vs 10 rows | A spoken registration resolves against the fleet; litres and amount read back in full before any write | §5.6 |
| **`jobcards.enterAt` — half of it** | The bus was on no list, and the fault needs photographing | **The bus and the time come back** — a supervisor can say *"RJ14 PA 1023 andar aa gayi"* and the card is opened and stamped. **The fault's photograph stays a link**, because a camera is not a sentence. This is a genuine half, not a win dressed up |
| **The shelf count** | Dozens of lines, each one money | **Candidate, and I am not taking it — see §10.1.** It is the one flow where §0.2's confirm step makes the AI path *worse* than typing |

### 10.1 Jobs the owner put in scope that the chat still does not carry

Every reason below is now something other than the cap, because §0.1 removed the cap as
an excuse. Where a flow stays out, it stays out for what it *is*.

| Job | Why not — and why it is not the cap | Where it goes instead |
|---|---|---|
| **The shelf count** | **Re-examined and still out, with a new reason.** Speaking a count at a shelf — *"brake pad sattais, AC belt chaar"* — is genuinely faster than typing, and I considered it seriously. But it sets `shrinkValue`, which is the anti-pilferage number the whole store design exists to protect, and *sattais* (27) misheard as *saat* (7) is a shrink figure nobody can unpick later. §0.2 says every number is confirmed by a tap; **confirming fifty lines one tap at a time is worse than typing fifty lines.** So this is the one flow where the safety shape and the flow are incompatible, and per the coordinator's instruction I **flag it rather than build it**. If the owner wants it, it needs a different confirm model — a read-back of the whole sheet at the end, accepted as one act — and that is a request of its own | **link · floor**, Store (#6) |
| **Part quantity the router is unsure of** | Not a cap and not a drop — it becomes the Q2 digit prompt: *"Kitne piece? Sirf number bhejein."* | stays in the chat (§5.5) |
| **Closing a job card** | The close gate is before/after photos or a vendor bill, and the server enforces it (`02 §4.4`). *"Once the part is off the bus you can never take it again"* ([D] manual Part 2). **AI changes nothing here: a photograph cannot be spoken** | **link · phone**, Job card (#4) |
| **Verifying a job card** | A second signature is a judgement about somebody else's work, and it now applies to every role including the owner (`DECISIONS.md §10`). A tap in a chat was already too cheap for it; **a sentence is cheaper still**, and the control is three weeks old | **link · floor**, Attention (#2) |
| **The departure gate check** | Cap collision 5, **now refused for the better reason**: three photos and a 1.5-second hold are an evidence ritual, and the hold exists so the act cannot be casual ([E] 8a8cde5; `DECISIONS.md §12`). Speech makes it more casual | **link · phone**, Duty board (#9) |
| **Picking tonight's buses** | Not the cap: it is **40 separate decisions read off a register**, and saying forty registrations aloud is worse than ticking forty boxes on one screen. This is a planning act with the whole board in view | **link · floor**, Duty board (#9) |
| **Filling a duty seat** | Same: a seat is filled by looking at who is free, which means seeing the board. Resolving *"Ramlal ko Shanti ki bus pe daal do"* is easy; knowing it is the right call needs the screen | **link · floor**, Duty board (#9) |
| **Trip cash** | `DECISIONS.md §11` placed it with the supervisor on Money three weeks ago, as the entry *and* the reconciliation. **It is now technically speakable** — *"RJ14 ko paanch hazaar allowance diya"* — and I am still not taking it, because the person doing it is at a desk doing the reconciliation anyway and because moving a brand-new control's input to a new surface before anyone has used it once is how controls quietly stop running (`v2-ux.md §7` measure 13 is watching exactly that). **Candidate for later, named here so it is a decision** | **link · floor**, Money (#7) |
| **Challan checks** | Not the cap: *each lookup spends a billable credit*, and the manual has to teach people not to run the fleet "out of habit" (`05 §4` row 36). **A spoken request that spends money is worse than a button that spends money**, because the price cannot be shown next to a sentence | **link · floor**, Buses (#5) |
| **Anything on People, Money or Reviews** | Desk work and long lists. A person can now *ask* for them and get a link, which is §4.3 collision 3's relief — the screens themselves stay screens | **link · floor** |
| **Questions of any kind** | The advisor costs up to six sequential Opus-class calls per question (`04 §6`) and is an owner/supervisor screen. Putting it on 110 handsets is a separate request with its own cost line, and at B4 rates it would dwarf both lines in §8 | not built |

### 10.2 Dropped outright, nothing replaces it

| Dropped | Reason |
|---|---|
| **A chat surface for `office`** | Its whole job is reading a worst-first scoreboard and recording that a conversation happened, at a desk, on a Windows 7 PC (`05 §2.8`, [E] 2c72951). Nothing about it is a field job, it holds 3 read capabilities, and the role has been in anybody's hands for a week at most with no use evidence. It gets no root menu. If somebody enrols an office number, it should resolve and go silent rather than offer a menu with nothing on it |
| ~~**Free text understanding of any kind**~~ | **WITHDRAWN by §0.1.** It is now a first-class path (§4.4) |
| ~~**Voice notes**~~ | **WITHDRAWN by §0.1**, and this is the owner's main point: voice is how this workforce communicates, and it answers the literacy question (`05 §7` Q12) that the button-only design was routing around |
| ~~**The driver's typed problem description**~~ | **WITHDRAWN by §0.1**, and it brings a second thing back with it: the supervisor gets *"brake se awaaz aa rahi hai left side"* again instead of *"Brake"* plus a photo, and **the AI report reader that classifies free text has something to read again** ([E] db6101f, `reportAiLine`). The category list stays as the fast tapping path |
| **A free-text message answered with a menu instead of being understood** | Replaced by routing (§4.4). The menu is still what a message that routes to *nothing* gets, which is a different and much rarer thing |
| **The named part on a mechanic's part request** | Cap collision 1. The storekeeper gets a card and a name and has to ask which part. Weaker than the app's and worse for him |
| **Group chats** | Everything here is one person's identity and one person's capabilities. A group has neither. A bot in a group would reply to an unenrolled member's message in front of everybody, which breaks decision 2 in the most public way available |
| **Status / broadcast / marketing messages** | Marketing is roughly 7× the utility rate (§8.1) and there is nothing to market to one's own staff |
| **Any notification the business pushes that is not one of §8.3's four templates** | Document expiries, challans, low stock, gate holds, pilferage flags. All are findings with no within-the-day deadline; they live on Attention (#2) and paying per push is how a bot gets muted |
| **The "Yeh number kisi bus se linked nahi hai" reply** | Removed on owner decision 2. The only useful sentence lost in this document, and §3.3 says what it cost |
| **A link to the live map** | `v2-ux.md §5.2` dropped the screen pending Q9. This surface does not revive it |
| **Carrying a PIN or an enrolment code over WhatsApp** | CLAUDE.md: minting or changing anyone's PIN is the owner's call, and a credential in a chat thread is a credential in everybody's backup. `spec §10` Q2 asks *"whether WhatsApp can carry enrolment codes to every crew member"* — **the answer this document gives is no, and the reason is that there is no code: enrolment is an act on a screen** |

### 10.3 Jobs from `05 §5` still not served, after this surface

Shorter than before, and worth saying which ones moved.

**Now served that was not:** a driver's problem report with a record behind it
(`05 §5`: *"Report problems to the supervisor directly… phone call or WhatsApp by
definition"*); a mechanic saying "work is done" (`05 §5`: **not served**); odometer
coverage for the 29 of 89 buses that had no crew number to route to ([E] 19ece40) —
**if and only if their crew's numbers get enrolled**, which is §12 measure 7.

**Still not served, and this surface does not change it:** crew pay and payroll (Q10,
and this surface makes it more urgent, because attendance will now actually be
captured); bus-paper renewal; challan payment, towing and court; tyre warranty claims;
passenger complaint replies in the redBus portal; the outside-job slip's signatures and
the vendor's paper copy; breath tests (planned, when the devices arrive, [E]
GATE_CHECK.md); invoicing (Q7).

---

## 11. Edge cases that matter here

**No signal at the gate.** WhatsApp queues the message on the phone and sends it when
there is signal; the bot never sees it until then. So a check-in sent at 05:02 can arrive
at 07:30, and the record must take **the message's own timestamp**, which
`normalize_message` already keeps [C], not the receipt time. The server already marks
`atUnverified:true` when `at` is more than 10 minutes before receipt and replaces an `at`
more than 5 minutes in the future with server time (`03 §3.7`) — **reuse that, do not
invent a second concept.** And the receipt the driver gets at 07:30 must say the time
the record holds (05:02), not the time he is reading it, or he will send it again.

**A half-finished entry.** Location with no photo; a menu tapped and then nothing; a PIN
asked for and never sent. Rules: **nothing is written until the entry is complete**;
exactly **one** reminder, after three minutes, and only for attendance (§5.1); then the
partial expires silently after 30 minutes. A partial must never become a record with a
missing half — an attendance row with no photo looks like an app check-in whose camera
failed, which is a known silent failure already ([E] GO_LIVE, `05 §3` row 8). And the
expiry must be silent: a second message to tell somebody their abandoned entry was
abandoned is a message we pay for.

**Two people doing it at once.** Three real shapes:

- *Two storekeepers, one request.* Second tap gets *"Yeh request 11:04 baje Suresh ne
  pehle hi poora kar diya."* The write order in §5.5 (`ledger`, `parts`, `partsUsed`)
  decides this correctly.
- *A supervisor stamping `outAt` on the web while another stamps it from the chat.*
  Last writer must **not** win: these are two people's observations of one event, and the
  first one recorded is the one that was observed. The second gets told who, and when.
- *One handset, two people.* §3.1: the pick-your-name list, the choice held for the
  calendar day, and the chosen person written onto every record from that session.

**A role that must not see it.** Two hard ones:

- **Conversation content never reaches a screen.** `waconv` is readable by nobody on a
  device (`v2-contract.md` ~line 307; `SERVER_INGEST_ONLY`, `02 §5`) and **that scope
  must not be widened to build the unknown-numbers row.** Derive the count on the
  server; show the number and the time, never the message.
- **A crew member must never receive the conversation log about them** ([E] 4a42e38),
  and WhatsApp is the surface where that leak would be one mistaken send. `crewnotes`
  has no path into this surface at all, by construction: there is no flow that reads it.

**Every write arriving from an unauthenticated transport.** A Meta webhook is not a
signed-in session. The route already refuses to run without `WA_APP_SECRET` (`503`) and
`403`s a bad signature [C `sync_server.py:6328`] — **keep both; neither is ceremony.**
`WA_ALLOW_UNSIGNED=1` is local-only and must never be set in production. Beyond the
signature, every write guards itself again on the server, per §2.2.

**The odometer / attendance photo collision — largely dissolved by §0.1.** Today a bare
image from a crew phone means "read this odometer" [C `_wa_handle`], and adding an
attendance photo made a bare image ambiguous. My original resolution was that a location
pin within ten minutes marked a photo as attendance, which was fragile and was my first
likely-wrong item. **With AI in scope the image identifies itself**: one vision call
classifies a dashboard from a face, and a caption or an accompanying voice note settles
anything left. So:

- **A dashboard goes to the odometer ladder.** Unchanged, including all five holds.
- **A face goes to attendance**, and if no location has arrived it gets the one reminder
  rather than being OCR'd and answered with *"Meter clear nahi dikha"* — which was the
  day-one failure I was most worried about.
- **The location is still what makes attendance *valid*** (§9.1); it is no longer what
  makes it *identifiable*. Those were conflated in the first draft.
- **Where the classifier is unsure it asks** — one message, two buttons, *"Yeh meter ka
  photo hai ya hajri ka?"* — under §4.4's ambiguity rule.

**The new risk this creates, which replaces the old one:** a misclassification sends a
selfie to the odometer (harmless — a hold catches it) or **a meter photo to attendance
(not harmless — it is a wage record created from the wrong thing)**. The asymmetry
decides the design: **attendance requires a location, so a misclassified meter photo
cannot complete a check-in on its own.** The ladder catches the other direction. This is
§16 item 2.

### AI-specific edge cases

**A noisy yard.** A bus idling three metres away is the normal recording condition, not
the exception. Transcription failure is a first-class state with the menu attached
(§4.4 step 1) and **it must never be a silent non-answer** — a driver who speaks and
hears nothing back has learned the surface does not work. Cost: one message and one
wasted transcription, both paid.

**A misheard number.** The whole reason §0.2 exists. Every number is read back in full
before a write, and the server's ladder sits behind the tap. The two places this matters
most are the fuel amount (a tenfold error, §5.6) and the shelf count (which is why it is
not built, §10.1).

**Two instructions in one sentence.** *"Hajri laga do aur diesel bhi daal diya"* does
**one** thing and says which: *"Pehle hajri laga di. Diesel ke liye phir bolein."*
(§4.4). A model that fans one utterance into three writes is an incident nobody can
reconstruct afterwards.

**An utterance that is not from the sender.** A driver forwarding or reading out a
passenger's message is text from outside the business arriving at something that can
write. Every utterance is data about what *this person* wants, never an instruction
(§9.5), and the confirm step is the backstop.

**A proposal nobody taps.** It expires with the half-finished entry — 30 minutes,
silently, **writing nothing**. A proposal is not a pending write.

**The daily AI cap is reached mid-sentence.** The person falls back to buttons, which
cost nothing on line B, and is told so in one line (§8.7 requirement 3). Not silence.

**A person who only ever speaks.** Entirely supported, and it is the point. But note
they will never discover the one-message fast path, so they are the most expensive user
on both lines — which is the right trade for somebody who cannot read the menu, and the
wrong one for somebody who can. The receipt teaches the cheap habit either way (§5.1).

**The cap arithmetic under a stuck app.** The sync rate limiter is keyed on the user and
*"fails open, deliberately"* [C `sync_server.py:5076`], because refusing work on a
counter hiccup would strand a yard. **An AI budget must fail the other way: closed.** A
limiter that fails open on inference is an unbounded bill, and the cost of failing closed
is a person falling back to buttons. Different failure, different direction, and the
reasoning for each is in the code and in §8.7.

**The slowest machine in the office.** Not the chat — the links (§9.2). And the
unenrolled case costs the office nothing at all, because silence is zero work.

**Meta retries.** Any non-200 is retried [C the route's comment], and OCR takes seconds
against a 20-second webhook timeout, which is why the handler is already asynchronous.
**Every chat write must be idempotent on the inbound message id** (`normalize_message`
keeps `id`, and `waconv` already stores `lastMessageId` [C]), or a retried delivery
books the same part twice. Today's odometer path is protected by its daily cap rather
than by idempotency, which is a hold rather than a fix.

**The service window closing mid-flow.** 24 hours from the person's last inbound. A
conversation cannot run that long, so in practice this bites only when the bot speaks
first — which is §8.3's four templates and nothing else. `wa_send` already branches
rather than sending and hoping, and returns `False` when neither a free-form nor a
template send is possible [C]. **That `False` must be visible somewhere**: a reply that
could not be sent is currently indistinguishable from a reply nobody read.

**UNKNOWN: can an interactive list already in the chat be re-opened later?** If a list
message's button stays tappable, most repeat flows lose a menu message and the bill drops
materially (§8.4). I could not determine this from the repo — `wa_client.py` has no
interactive sender to read [C] — and it must be tested against a real account, not
assumed, before stage 3 sizes anything on it.

---

## 12. How we will know it worked

Numbers readable afterwards. Two need a **before** reading taken before stage 3 starts.

| # | Measure | Today | Target | Where to read it |
|---|---|---|---|---|
| **0** | **Does a reply arrive at all on the production deployment?** `_wa_handle` runs on a daemon thread after the 200 and `04 §3.7` says a serverless instance may be frozen by then | **UNDETERMINED** | one reply, received on a real handset, from the real deployment | **Take this reading first. Nothing else in this table means anything until it is green** |
| 1 | **Bot messages sent per working day, by flow** | 0 | ≤ 600/day (§8.4 mid). A month above 1,000 total is the free tier gone, which is expected; a week above 900/day means A6 is wrong | a send counter in the server, and Meta's own messaging analytics as the check — the bill is the measure |
| 2 | Attendance records with `source` = whatsapp, per day | **0** | ≥ 150/day by week 4 (A1 × A5 × a 70% participation guess) | `attendance` |
| 3 | **Share of check-ins on the 1-message fast path** | n/a | > 60% by week 4 — this is A6, the assumption the bill hangs on | the message count per completed check-in |
| 4 | Crew members who have ever checked in by WhatsApp | **0** | a real number against A1's 110, for the first time | `attendance` by `userId` |
| 5 | Mechanic taps: cards with `completeAt` stamped from the chat | **0** (no such button exists anywhere) | > 0 in week 1; this is `v2-ux.md §7` measure 1 arriving by a second route | `jobcards` |
| 6 | Supervisor `outAt` stamps from the chat vs typed next morning | all typed next morning ([E] 927864c) | > half from the chat by week 6. **And take the before reading by hand this week** — minutes per card is `v2-ux.md §7` measure 2 and without it this proves activity, not saving | `jobcards`, with the writing route |
| 7 | **Buses whose crew number is enrolled** | *29 of 89 had no crew number to route to* ([E] 19ece40) | 0 unenrolled among the buses that run | the enrolment store against `drivers.busId` |
| 8 | Unknown numbers that messaged, per week | recorded in `waconv` and read by nobody | a number the owner has actually looked at once | the Attention row from §3.4 |
| 9 | Flagged WhatsApp attendance — outside the radius, or a repeated photo — as a share | n/a | **no target, and that is deliberate.** This is the buddy-punching instrument from §9.1. A share of exactly zero means the check is not working, not that nobody is cheating | `attendance.flagged` by source |
| 10 | Deep links minted, tapped, and tapped after expiry | n/a | expired taps < 10%. Above that, 15 minutes (§7) is too short and should move on this number rather than on taste | the link mint/verify path |
| 11 | Messages sent to a number whose person has left | n/a | **0.** Leaving must revoke the same day, which `bus_by_phone`'s rule already does for crew [C] | the enrolment store against `drivers.status` |
| 12 | Crew logins (driver, conductor) ever used | unknown; 165 minted and read out one by one ([E] GO_LIVE step 6) | `v2-ux.md §7` measure 11, now with a second meaning: if chat attendance works and this stays at zero, **the crew logins can be retired and §13 Q7 is answerable with a number** | `users.lastLoginAt`, `usage` |
| 13 | Vision calls per accepted odometer reading | no call counter exists at all (`04 §5` R3) | < 1.5. Above 2 means the photo instruction is not working | a call counter, which has to be added |
| **14** | **Inference spend per working day, split into transcription, intent and vision** | **not measurable at all today** — `ai_allowed` is bypassed by this surface's only live path (§8.5) | **≤ ₹200/day** at the small-model tier (§8.6). **This is line B and it is the bigger half of the bill**, so it is the number to put on a dashboard rather than in a monthly invoice | the per-call counter from §8.7 requirement 5, reported on `/health` next to the message count |
| **15** | **A14: share of interactions done by voice or free text** | 0 | **a number, not an assumption.** It drives line B directly; at 60% instead of 20% line B triples. If it comes back near zero, the owner paid for a capability nobody used and I should say so plainly | the router's own call count against total inbound |
| **16** | **Proposals offered vs confirmed vs abandoned** (§0.2's shape, working or not) | n/a | **confirm rate > 85%.** Below that the router is guessing badly and every bad guess costs a message and a call. A high *abandon* rate is different and worse: it means people are being shown things they did not mean and giving up | the proposal/confirm pair per flow |
| **17** | **Crew who hit the daily AI cap** | n/a | **near zero.** Anything else means 10/day is the wrong number (§8.7), or one handset is in a loop | the per-number counter |
| **18** | **Transcription failures as a share of voice notes** | n/a | < 15%. Above that the yard is too noisy for this to be the accessible path it is meant to be, and the honest answer is to say so rather than keep paying for it | the router's own outcome |
| **19** | **Retention: age in days of the oldest surviving attendance image** | **no retention job exists anywhere in the server** [C — no purge or cleanup of records at all; `03 §2` says stores are kept "stored forever"] | **≤ 90, always** (§9.4). Plus the last run's timestamp and delete count, and **a gate check that goes red when the job is broken** | `/health`, alongside the build tag and the R2 check it already reports |

---

## 13. Owner must decide

**Three are now answered** (Q1, Q2, Q9 — 2026-11-11) and are kept in the table with
their answers rather than deleted, because the design now rests on them.
**Seven stay open**, and the reversal adds five more. **Q11 blocks stage 3's budget;
nothing blocks stage 2.**

| # | Question | Why it is yours | What breaks either way |
|---|---|---|---|
| **Q1** | **"No AI" (decision 4) — does that exclude the odometer photo reader?** | — | **CLOSED — reversed, and further.** *"i want to use ai wherever possible. by mistake would hsve written it."* §0.1 is the answer and §4.4, §8.6 and §10.0 are what it changed. My reading about the vision reader was right and it stays |
| **Q2** | **May a digits-only reply be typed when the bot has just asked for exactly one number?** | — | **CLOSED — yes, and only then.** PIN-gated money and stock work stays in the chat, the storekeeper's counting job included. Narrower than it looks now that AI handles the general case (§0.1) |
| **Q9** | **How long do we keep what people send?** | — | **CLOSED — 90 days for the image, forever for the record**, as one configurable setting. §9.4 states where the job runs, what proves it ran, and the gate check that has to be made to go red |
| **Q3** | **Who may enrol and revoke a number?** | CLAUDE.md puts minting or changing anyone's PIN or login with you, and an enrolment is a login by another name | Today a supervisor may create and reset `store, mechanic, driver, conductor` accounts and may not touch the four manager roles (`SUPERVISOR_MANAGES`, `02 §1`). The consistent answer is that he may enrol exactly those. **Say so, or say owner-only** |
| **Q4** | **May a supervisor do a PIN-gated money or stock job over WhatsApp at all?** | *"What a supervisor may see in a business that handles cash is a business decision"* — CLAUDE.md | The chat has no device enrolment: the only thing between a handset and a stock write is a 4-digit PIN. The web has the same PIN plus an enrolled device (`spec §1`). If the answer is no, part issue leaves the chat and the storekeeper keeps the counter screen |
| **Q5** | **For a menu whose rows are all links — yours and the crew manager's — may the bot send one plain text message with labelled links instead of an interactive list?** | It is a departure from decision 4, and the reason is money | Yes saves roughly 30–50 bot messages a day (§4.2, §8.4) and costs an uglier bubble with a link preview in it. No costs about ₹100/month and keeps one input style everywhere |
| **Q6** | **Should a WhatsApp attendance record be marked as a different grade of proof from an app one?** | If attendance decides wages, this is a question about wages | The app's record has a live face capture and `faceVerified`; WhatsApp's has a photo that could be from the gallery (§9.1). Marking it (as the odometer already marks `source: "whatsapp"` [C]) means anyone settling a dispute later knows which kind they are holding. Not marking it means the two are treated as equal evidence |
| **Q7** | **Once chat attendance works, do the crew logins go?** | 165 PINs were minted and read out one by one ([E] GO_LIVE step 6) for an app nobody opens | `v2-ux.md §4.2` kept them **only** because attendance might decide wages (Q10 there, still open). If the chat captures attendance, that reason is gone. Measures 4 and 12 answer this with a number in four weeks — **please do not answer it before then** |
| **Q8** | **Confirm the India utility rate against Meta's own rate card.** | It is your bill | Every rupee figure in §8 moves with it. ₹0.115 is a secondary-source estimate and I have labelled it as one everywhere |
| **Q10** | **Do you accept the loss of the "Yeh number kisi bus se linked nahi hai" reply?** | You asked for complete silence (decision 2) and I have designed it | It is the only genuinely helpful sentence being removed, and the person it costs is a crew member whose number changed (§3.3) |
| **Q11** | **Which model tier routes a driver's voice note and free text?** **The most valuable decision in this document.** | `AI_MODEL` defaults to `claude-opus-5-5` and its comment records *"Opus by the owner's decision (18 Oct 2026): every AI call in the app uses it"* [C `sync_server.py:5055`]. That decision was taken for seven analytical jobs run a few times a day by two people | **≈₹17,700 a month.** Routing on Opus: line B ≈ ₹22,000–25,500/month. Routing on a small/fast tier: ≈ ₹4,600–5,000/month, for work that is short in, short out, no reasoning, no tools (§8.6). **My recommendation: move routing and transcription to a small/fast model and keep the capable model for vision and the advisor** — which is a narrowing of your 18 Oct decision, so it is yours and not mine |
| **Q12** | **What is a crew member's daily AI allowance, and what happens when they hit it?** | It is a spending limit on your staff and a service limit on their day | `ai_allowed` **refuses every role except owner and supervisor today** [C `sync_server.py:5062`], so there is no existing answer to widen. My recommendation: **10 AI-assisted interactions per crew member per day**, counted per number as well as per user, and on reaching it **the person falls back to buttons with one line telling them so — never silence** (§8.7). 110 people with no cap is an unbounded bill |
| **Q13** | **May an AI-read number ever write without a tap?** | §0.2 is the coordinator's decided shape and you may overrule it | **My position and the coordinator's: no, never.** The one flow where the confirm step makes things worse is the shelf count — fifty lines, fifty taps — and per instruction I have **flagged it rather than built it** (§10.1). If you want spoken counting, it needs a whole-sheet read-back accepted as one act, and that is a request of its own |
| **Q14** | **May a crew member's intent router read the parts catalogue — names and stock levels?** | It is a read boundary, which is permission policy | §4.4 step 2 says the router may read only what the person could already open, and a driver holds no `viewStore` (`02 §1`). But the mechanic's named-part flow (§5.3) **needs** the catalogue to match *"brake pad"* to a row. Narrowest answer: a mechanic's router may read part **names** to match, and never **stock levels or prices**. Your call because it is a read boundary, and because `02 §0` records that the read side has leaked six times by defaulting the other way |
| **Q15** | **Are voice transcripts kept, and for how long?** | Retention policy, same as Q9 | `waconv` is `{phone, lastInboundAt, lastMessageId}` today [C] and is readable by nobody on a device. Keeping transcripts there turns it into a record of what staff said. **My position: not retained beyond the conversation that needed them**, on the same reasoning as your 90-day answer. Say so either way (§9.5) |

---

## 14. The `DECISIONS.md` entry this needs

**I have not edited `DECISIONS.md`.** Here is what the new entry must say, for the owner
or whoever maintains that log to add. The existing §8 text at line 161 must not be
deleted — a reversal reads as a reversal only if the thing it reverses is still there.

> **§N. WhatsApp is now a surface. This reverses half of §8.**
>
> §8 said *"No WhatsApp integration and no file import. Neither was asked for."* As of
> 10 November 2026 WhatsApp **is** asked for, by the owner, in these words: *"I want to
> build this software on whatsapp fully… like a store does in whatsapp."* **File import
> is not reversed; the other half of §8 stands.**
>
> What is settled with it:
> 1. **Scope split.** The chat does the daily field jobs — attendance, odometer, fuel,
>    problem reports, job-card updates, part issue/return. Reports, the live map, full
>    store counts, people and money are reached by a signed one-tap deep link into the
>    v2 web app.
> 2. **Identity.** An enrolled phone number identifies the person. Cash, stock and gate
>    passes ask for the existing 4-digit PIN, once per day. **An unenrolled number gets
>    no reply at all** — which removes today's *"Yeh number kisi bus se linked nahi
>    hai…"*.
> 3. **Attendance proof is location + photo**, both stored, with no liveness check. The
>    integrity drop is accepted (`plan/whatsapp-ux.md §9.1`).
> 4. **Buttons and lists are the primary path; AI free text and Hindi voice notes are a
>    first-class alternative.** The "no AI, no voice notes" wording of 10 November was a
>    mis-click and is withdrawn — *"i want to use ai wherever possible"*. Typed digits
>    are allowed **only immediately after the bot asks for exactly one number** (a PIN, a
>    reading, a quantity). A message that routes to nothing gets a menu.
> 5. **AI reads and proposes; the person confirms with a tap; the server still validates
>    through its existing ladders. No AI output writes to a record unconfirmed.** This
>    mirrors `odometer_submit`, where vision reads a number and six holds stand between
>    it and the fleet record.
> 6. **Two cost lines, and AI is the larger.** **(a) Meta messages:** since 1 October
>    2026 every message the bot sends is charged beyond 1,000 free per month —
>    **₹1,150–₹2,900/month, mid ₹1,760**, on an unverified India utility rate of ₹0.115.
>    **(b) AI inference: ₹4,600/month if intent routing runs on a small/fast model,
>    ₹22,000–₹25,500/month if it stays on Opus** per the 18 Oct decision. Both rest on
>    unverified rates the owner must confirm. **The model-tier choice is worth about
>    ₹17,700 a month** and is open as Q11.
> 7. **Crew need an AI budget that does not exist.** `ai_allowed` refuses every role
>    except owner and supervisor, so the existing `AI_DAILY_LIMIT` of 60 cannot simply be
>    widened. Recommended: 10 AI-assisted interactions per crew member per day, counted
>    per number, falling back to buttons rather than to silence. **Every inference call
>    must be counted, including the vision calls that are uncounted today.**
> 8. **Four bot-initiated templates and no more:** enrolment welcome, shift-end odometer,
>    missed checkout, Monday summary.
> 9. **One new store** — WhatsApp enrolment, keyed by the last 10 digits, server-ingest-
>    only, readable by nobody on a device. No existing record shape changes (§2 stands).
> 10. **Attendance photo retention: 90 days, as one configurable setting.** The image is
>    deleted — the R2 object, not merely the field — after 90 days; the record, its time
>    and its location are kept permanently. The job runs on GitHub Actions, and `/health`
>    reports the age of the oldest surviving image plus the last run's count, with a gate
>    check that goes red when the job is broken.
>
> Still open and recorded as open: who may enrol and revoke; whether a supervisor may do
> PIN-gated money or stock jobs over the chat; the two rate cards; the routing model tier
> (Q11); the crew AI cap (Q12); whether an AI-read number may ever write unconfirmed
> (Q13); whether a mechanic's router may read the parts catalogue (Q14); and whether
> voice transcripts are retained (Q15). `plan/whatsapp-ux.md §13` is the list.

---

## 15. Where the existing code contradicts this plan

Everything here was read in this session, from the file named. Nothing is assumed.

**The AI reversal took the list from nine blockers to thirteen** (the four new ones are
#11, #12, #13 and #15), and added two more rows that are not blockers: a model-tier
decision (#14) and a storage step (#16). Of the original nine, **one got easier (#3), two
got worse (#8 and #9), and six are untouched.**

The shape of that change is worth naming: **three of the four new blockers are about
counting and capping spend, not about making anything work.** The reversal did not make
this surface harder to build. It made it possible to deploy something that functions
perfectly and bills unboundedly, which is a worse failure because it looks like success.

| # | What the code does | What this plan needs | Severity |
|---|---|---|---|
| 1 | `wa_client.py` can send **text** and **templates** and nothing else. There is no interactive, button, list or location-request sender | Buttons and lists are still the primary path (§0.1), and decision 3 needs the one-tap location request | **Blocking for stage 3.** Three new senders, in a file that is deliberately stdlib-only and 197 lines |
| 2 | `normalize_message` has no `location` branch — a location message comes out with its coordinates discarded | Attendance is location + photo | **Blocking.** One branch |
| 3 | `normalize_message` routes on `reply.get("title")`, the display text, and drops the reply `id` | Buttons remain the primary path, so this still bites | **Blocking, but relieved by §0.1** — an intent router means a broken button no longer leaves a person stranded, it leaves them in the expensive path. Still fix it |
| 4 | `_wa_handle` calls `mark_read` **before** it knows who the sender is (`sync_server.py:5390`) | Complete silence for an unenrolled number. A read receipt is a reply | **Blocking.** Move the call after the enrolment check |
| 5 | `_wa_handle` replies to **every** sender: `odometer_submit`'s `enrol` status for an image, *"Meter ka photo bhejein — bas photo, aur kuch nahi."* for anything else | Silence | **Blocking.** This is the behaviour decision 2 removes |
| 6 | `bus_by_phone` resolves a phone to a **bus**, and when two active crew share a number it **returns the first one the loop finds** (`sync_server.py:5444`) | A phone resolves to a **person**; two matches ask, never guess | **Blocking for anything but the odometer**, and **wider after §0.1**: a person can now name any bus aloud, so resolution is person → capabilities → named bus, with a check that this person may write to *that* bus |
| 7 | `users` is `{id, name, role}` and holds no phone number anywhere (`03 §3.7`) | Staff — owner, supervisor, store, mechanic, crewmanager — must be reachable by number | **Blocking.** It is why §3.1 needs one new store |
| 8 | `_wa_handle` runs on a daemon thread **after** the 200 is sent, and `04 §3.7` records that a serverless instance may be frozen by then. *"UNDETERMINED whether this works on Vercel"* | Every reply in this document | **The largest unknown in the plan, and WORSE after §0.1**: transcription plus an intent call plus possibly a vision call now run in that window, so the work outliving the response got longer, not shorter. §12 measure 0, before stage 3 starts |
| 9 | No idempotency on the inbound message id. Meta retries any non-200 | A retried delivery must not book a part twice | **Needed before any stock or cash write, and WORSE after §0.1**: a retried delivery now costs a transcription and an intent call as well as risking a duplicate write. Idempotency is now a cost control too |
| 10 | `wa_send` returns `False` when it can neither send free-form nor send a template, and nothing anywhere looks at the return value | A reply that could not be sent must be distinguishable from a reply nobody read | **Should fix.** Silent by construction today |
| 11 | **`ai_allowed`'s first line is `if user.get("role") not in ("owner", "supervisor"): return "forbidden"`** (`sync_server.py:5062`) | 110 crew making AI-assisted requests | **NEW and blocking.** No crew member can make an AI call at all today, by a deliberate check. The function needs a per-role budget it has no shape for (§8.7) |
| 12 | **No transcription path of any kind.** A grep for audio, transcribe, whisper and voice in `sync_server.py` returns nothing relevant | Hindi voice notes, which are the owner's main point | **NEW and blocking.** Audio already arrives parsed (`normalize_message`'s media branch covers `audio`, and `media_data_url` fetches the bytes [C]) — it is the speech-to-text that does not exist |
| 13 | **`ai_allowed` is called at exactly two sites, both HTTP routes** (`sync_server.py:6573`, `:6610`). `odometer_submit` calls `vision_read_odometer` directly, through neither | A counted, capped inference surface | **NEW and RAISED TO BLOCKING** at the coordinator's instruction. Every WhatsApp odometer photo today is an unbudgeted, uncounted, Opus-priced call. `04 §5` R3(a) names it — *"no queue and no spend meter"* — and the server's own rate-limiter comment names the consequence: *"a runaway cost with nobody watching, and the first anybody learns of it is the invoice"* [C `sync_server.py:272`] |
| 14 | **`AI_MODEL` defaults to `claude-opus-5-5`**, commented *"every AI call in the app uses it"* by the 18 Oct decision (`sync_server.py:5055`) | A routing tier chosen for routing | **NEW.** Not a defect — a decision taken for different work that this surface would inherit by default, at ~₹17,700/month. §13 Q11 |
| 15 | **No retention or deletion job exists anywhere.** No purge or cleanup of records; `03 §2` says stores are kept *"stored forever"*; photos live in Cloudflare R2 behind **permanent public URLs** and `/uploads/<name>` has **no auth, "anyone"** (`04 §1` row 3, `04 §8`) | The owner's 90-day rule | **NEW and blocking for the retention decision.** Entirely new machinery: a scheduled route, an R2 object delete (not just a cleared field), a `/health` number and a gate check that can go red (§9.4) |
| 16 | **WhatsApp media is never persisted today.** `media_data_url` returns an inline data URL; `odometer_submit` keeps only the model's text in `odometerlogs.raw`, and that record has no image field [C] | Attendance photos must be stored and then deleted at 90 days | **NEW.** Attendance would be the first image this path keeps, so an upload step is new work — and it is the step §9.4's deletion has to undo |
| 17 | `WA_PROMPT_TEMPLATE` is a **single** template name in the environment (`sync_server.py:5310`) | §8.3 needs **four** distinct templates with different content | **Needed.** One environment variable becomes a small set |
| 18 | `POST /odometer/submit` is owner/supervisor-only and exists so the whole path can be measured without sending real messages, including `dry` mode [C `sync_server.py:6307`] | **Not a contradiction — this is the best thing in the existing code for this plan**, and it matters more after §0.1. Every new chat write, and every AI path, should have the same transport-independent, `dry`-capable entry point, or none of it can be measured before Meta approves anything and before anyone commits to a model tier | — |
| 19 | `bill_ai.py` / `POST /ai/bill` already does read-then-correct on a photographed document, live since 18 Oct ([E] c896478) | **Also not a contradiction — it is the existing proof that §0.2's shape works on this codebase and these users.** The diesel slip path (§5.6) is the same pattern on a different document | — |
| 20 | `docs/v2/DECISIONS.md:161` forbids this surface | §0 and §14 | Documented, not edited |

---

## 16. Status, and the three things in this document most likely to be wrong

**ok = true, and stage 2 may specify the chat states, the proposal/confirm pattern and
the expired-link page against this document.** Q1, Q2 and Q9 are answered. **Q11 — the
routing model tier — does not block stage 2, but it must be answered before stage 3 is
funded**, because it is worth ten times the whole Meta bill.

Every flow traces to a named person, a moment, and a job listed against their role in
`05 §2` or `05 §5`. Every job the owner put in scope is either in §5, linked in §6.2, or
dropped in §10 with a reason. Four flows that §10 dropped on the row cap came back
(§10.0), and the ones that stayed out stayed out for what they are.

**The three things most likely to be wrong — revised, because the reversal retired my
old first item:**

1. **The cost model, and specifically that line B is affordable.** This is now the
   biggest risk in the document and it is not a design risk. AI inference is 3× to 15×
   the Meta bill (§8.6), both rate sets are unverified secondary estimates, and the
   difference between my two scenarios is a single environment variable that currently
   defaults the expensive way by a decision taken for different work. **If the owner
   reads ₹25,000 a month and says no, I will have designed a surface nobody can
   afford** — and the honest fallback is narrow: buttons and lists only, AI kept for
   vision and for the few people who genuinely cannot read a menu, which is most of
   §0.1's value gone. §12 measures 14 and 15 are the first two numbers to read, and they
   should be read in week one, not month three.
2. **The AI classification of an inbound photo (§11).** My old first item — the
   location-pin disambiguation — is retired, because an image can now identify itself
   and that is a genuine improvement. What replaces it is thinner but real: a
   misclassified **meter photo sent to attendance** would be a wage record made from the
   wrong thing. I have leaned on an asymmetry — attendance needs a location, so a
   misclassified meter photo cannot complete a check-in alone — and asymmetries are
   exactly the kind of reasoning that turns out to have a third case nobody listed.
3. **A14: that 20% of interactions are spoken, and A6: that 60% of check-ins take the
   one-message fast path.** These now pull against each other, which is new and which I
   do not think I have right. **AI makes the slow path pleasant, and a pleasant path is
   the one people use** — so voice may cannibalise the cheap habit rather than serve the
   people who need it, raising both bills at once. If A14 comes back at 60% and A6 at
   20%, the figures in §8 are badly out in the same direction, and the design will have
   been right while the budget was wrong.

**A fourth, unchanged and still the thing that decides whether any of it ships:** §15
item 8 — whether a reply survives the serverless response at all, now with transcription
and an intent call inside that same window. Take the reading before stage 3 is funded.

**And one I will name as mine rather than leave implied:** the supervisor's *"bus nikal
gayi"* (my old item 3) is still a two-tap flow against the top friction in the product,
and I still believe a man who writes a time on paper at six does it because at six he is
not holding a phone. It has moved off the list only because the three above are now
likelier to be wrong, not because I have become confident about it. §12 measure 6.

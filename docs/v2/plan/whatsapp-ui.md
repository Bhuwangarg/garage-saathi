# Garage Saathi over WhatsApp — UI specification

Stage 2 of the pipeline (`docs/v2/PIPELINE.md`). Slug `whatsapp`. Written 2026-11-11.

**Input, read in full before this was written:** `docs/v2/plan/whatsapp-ux.md` (1,879 lines),
`docs/v2/DECISIONS.md` §25 (lines 780–884 — **the authority wherever it and anything else
disagree**), `wa_client.py` (all 197 lines), `sync_server.py` lines 5055–5063, 5286–5480
and 5541–5680, `app.js` lines 12136–12149 (`REPORT_CATS`), `v2/ui/tokens.css`,
`v2/ui/components.css`, `v2/ui/icons.js`, `v2/index.html`, `v2/ui/gallery.html`,
`docs/v2/plan/screens-shell.md` §3.2–§3.4, `scripts/check-floor.py`,
`scripts/check-v2-isolation.sh`.

---

## 0. What this document is, and what it deliberately does not contain

**WhatsApp renders this surface. We control none of it.** There is no layout, no type
scale, no colour, no spacing, no radius, no shadow and no motion to specify for a chat
message, because every one of those belongs to a client we do not ship. A UI spec that
defined a token for a chat bubble would be describing something nobody can build.

So on this surface, stage 2's deliverable is four things and nothing else:

| Normally stage 2 gives | Here it gives |
|---|---|
| Tokens, structure, density | **§3–§9: the exact copy of every message, final** |
| Interaction per control | **§2: every button and list row as `{id, title}`, the id stable and English** |
| Motion per animation | **§1.3: WhatsApp's caps, honoured and counted** |
| States per screen | **§11: the states — empty, failure, no permission, too much data, one item, offline, silence** |

**Two things on this surface *are* ordinary UI work and get ordinary specs:** the two web
pieces a chat link can land on that do not exist yet — the expired-link page and the
owner's unknown-numbers row and list (§13). Those are **Chrome 109 on Windows 7** work
and the floor applies in full.

### 0.1 Where the copy lives

**One new server-side module, `wa_copy.py`**, holding one dict:

```
COPY = { "<string-id>": "<the text, with named {placeholders}>", ... }
```

- **It is not the app's `W.register` system.** `v2/ui/words.js` exists for the web app's
  fixed words, has a translated / pending / unregistered state machine and draws
  `"Me [meTitle]"` for a missing key [C read in full]. **None of that applies here.**
  These strings are one register (Hinglish in Latin script), rendered by WhatsApp, read
  by crew, and they have no Hindi variant to fall back from — Hinglish *is* the
  translation. A second register on this surface would be a second thing to review.
- **It is a flat dict of strings, not of objects**, so a reviewer who reads Hinglish and
  no Python can read and correct it without touching a flow.
- **Every string in it is keyed by the id in §3–§9, and nothing reads a literal.** The
  ten strings that already exist inside `odometer_submit` and `_wa_handle` move here
  unchanged (§4), which is the only reason this module is worth creating now rather than
  later: the copy is already duplicated in two functions.
- **Placeholders are named, never positional** — `{name}`, `{reg}`, `{km}`, `{time}`.
  A positional placeholder in a Hinglish sentence will be reordered by the first
  reviewer and silently swap a bus for a person.
- **No string in `wa_copy.py` contains an emoji.** CLAUDE.md's house rule, and the
  register already has none [C `odometer_submit`]. `scripts/check-floor.py`'s emoji scan
  defaults to `v2/` and so does not see this file — so **the gate for `wa_copy.py` is a
  unit test that asserts the dict is free of the emoji ranges and free of Devanagari**,
  not the floor script. (Devanagari because the whole register is Latin-script Hinglish
  and one Devanagari string would render in a font the office PCs may not have — the
  same reason `test_ui_states.js` pins two files to pure ASCII [C `words.js` header].)

### 0.2 The register, taken from the code and not invented

Every string below is written to match what is already live. The standard:

> *"Meter clear nahi dikha. Thoda paas se, seedha photo bhejein."*
> *"{reg}: {km} km pichhli reading ({prev} km) se kam hai. Office check karega. Dobara
> photo bhej sakte hain."*
> [C `sync_server.py:5561`, `:5600`]

The six rules that register follows, so new copy matches it rather than approximating it:

1. **Short sentences. Two or three, never four.**
2. **The bus is named by registration, first**, with a colon: `MH12 AB 1234: …`.
3. **A person is named by their first name**, first, with an em dash: `Ramlal — …`.
4. **A hold always says who sorts it out** — *"Office confirm karega."* /
   *"Office check karega."* / *"Supervisor dekhega."* Never *"error"*, never a code.
5. **A failure always says the one thing to do next** — *"Dobara photo bhejein."*
6. **No emoji, no exclamation marks, no English jargon** (no "sync", "submit", "invalid",
   "session").

### 0.3 Figures: Indian grouping in all new copy, and the inconsistency it inherits

**Decided 2026-11-11.** A figure in this register is read by somebody in a hurry who reads
money as `₹4,12,500`, not `₹412,500`.

| | Rule |
|---|---|
| **All new copy in this document** | **Indian grouping** — `2,45,118`, `₹4,12,500`, `₹14,200`. Rendered by **one helper used only by `wa_copy.py`'s renderer**, so it is one function with one test and it touches nothing else |
| **The ten inherited strings in §4** | **Unchanged.** They print Python's `{:,}`, which gives `245,118` and not `2,45,118` [C `sync_server.py:5590`] |
| **So the surface is inconsistent on day one, and says so** | A meter reading in `wa.odo.accepted` groups western; the meter reading inside `wa.fuel.propose` groups Indian. **This is a pre-existing inconsistency this surface inherits and does not fix** |

**Why it is not fixed here.** Correcting `{:,}` means one formatting helper applied to
every rupee and kilometre figure **in the whole app**, which is a change to the app and
not to this surface, and it would mean editing ten strings that 89 buses' crews read
today. **It is named as its own task, with its citation, in §16.** The inconsistency is
visible only to somebody who sees both a fuel proposal and an odometer receipt in the same
thread, and it is cosmetic on a kilometre reading. It is **not** cosmetic on money, which
is why all new money copy groups Indian and why the task is worth doing.

---

## 1. The three caps, and the id rule that is the point of this document

### 1.1 The caps, as confirmed

| Thing | Cap | Where it bites here |
|---|---|---|
| List: rows total | **10** (across ≤10 sections) | every root menu; every pick-list |
| List: row title | **24 chars** | five labels collided — §1.4 |
| List: row description | **72 chars** | card previews, counts |
| List: section title | **24 chars** | §3.2 |
| List: button text | **20 chars** | "Chunein" (7) everywhere |
| List: header (text) | **60 chars** | |
| List: body | **4,096 chars** | why an explanatory line never costs a message (§8.4) |
| List: footer | **60 chars** | |
| Reply buttons: count | **3** | the mechanic's three; every proposal |
| Reply buttons: title | **20 chars** | four labels sit at exactly 20 — §1.4 |
| Reply buttons: **titles unique within a message** | — | **§2.6 checks every 3-button set** |
| Reply buttons: body | **1,024 chars** | every AI proposal is a buttons message — §8.2 |
| Reply buttons: footer | **60 chars** | |
| Row id | **200 chars** | so ids are long and self-describing |
| Button id | **256 chars** | so a proposal id rides inside the button id |
| Buttons **or** a list, never both | — | §2.5 |

### 1.2 Counting rule for this document

Every label below is counted in characters, by `len()` on the exact string. A label
within two characters of its cap is marked **`AT CAP`** and carries this rule:

> **A label marked `AT CAP` may not be reworded without re-counting.** Hinglish labels
> will be revised; a revision that adds one character is a send-time rejection from Meta,
> not a layout bug, and it will look like "the bot stopped working".

**Counts never go in a row title.** `"Sign-off chahiye — 3 card"` is 25 characters and
`"— 12 card"` is 27. Every count lives in the row **description** (72) or the list
**body** (4,096). This is a rule and not a preference: a title that fits today and
breaks when a number reaches two digits is a failure that waits for a busy week.

### 1.3 The id rule

**`wa_client.py:172` is the bug this section exists to fix:**

```
out["text"] = str(reply.get("title") or "")
```

The display title is kept and the reply `id` is discarded [C read in full, line 172].
Every flow that routed on that text would break the day a Hinglish label was reworded —
and these labels *will* be reworded, by somebody who reads Hinglish and not Python.

So, for every interactive element in this document:

| | Rule |
|---|---|
| 1 | **Every button and every list row is `{id, title}`.** The `title` is Hinglish and is shown. The `id` is **English, lower-case, dotted, machine-readable, never shown to anyone, and never changed.** |
| 2 | **The backend routes on the `id` only.** It may not read `title` for any purpose. |
| 3 | **Ids are long and self-describing** — `attendance.checkin.start`, not `ac1`. 200/256 characters is not a constraint; a reader of the routing table must never have to guess. |
| 4 | **A dynamic id carries the record it refers to, after a colon**: `jobcard.pick:<jobId>`, `store.request.pick:<requestId>`, `identity.person:<userId>`, `proposal.confirm:<proposalId>`. The suffix is a server-minted id, never anything a person typed. |
| 5 | **Any id that commits a write carries a server-minted proposal id.** A tap that arrives twice (Meta retries any non-200 [C route comment at `sync_server.py:6327-6330`]) or arrives on a message from yesterday is then detectable rather than a second write. This is the UI half of `whatsapp-ux.md §15` item 9. |
| 6 | **An id that no longer exists is not an error, it is a state** — `wa.sys.stale.tap`, §11.6. |
| 7 | **Ids are versioned by addition, never by edit.** If a flow changes meaning, a new id is minted and the old one keeps answering `wa.sys.stale.tap` for thirty days. |

### 1.4 The labels that did not fit, and what I did about them

The UX doc's §4.3 records five *cap collisions* about row **counts** and resolves them. It
does not count **characters**, and six of its own row titles are over the 24-character
cap. Resolutions below are mine.

**The standard applied, after a second pass: a label at exactly its cap is shippable.**
24 is a cap, not a budget, so the UX doc's own wording at 24 beats a shorter paraphrase at
19. A shortened form is kept **only** where the original genuinely exceeds 24, and where
it does, punctuation is changed before words are.

| UX doc label | Count | Shipped title | Count | What changed |
|---|---|---|---|---|
| `Meri rating aur coaching` | 24 | **`Meri rating aur coaching`** | **24 AT CAP** | **Nothing. It fits.** First draft shortened it to `Meri rating` (11); that was the one change in this table that lost a *meaning* rather than trimming one, because coaching is half of what a conductor is reviewed on (`v2-ux.md §4.2`). Restored |
| `Poora store — app kholein` | **25** | `Poora store, app kholein` | **24 AT CAP** | The em dash became a comma. **Punctuation, not wording** — every word is kept, including *"app kholein"*, which is the half that tells the person the chat is about to end |
| `Gate round — aaj ki buses` | **25** | `Gate round, aaj ki buses` | **24 AT CAP** | Same: a comma for the dash. The description drops the words the title now carries and reads `"Photo, selfie aur 1.5 second ka hold."` (37) |
| `Stock aaya — bill ka photo` | **26** | `Stock aaya — bill photo` | 23 | "ka" dropped; reads the same. **Over by 2, so a word had to go** |
| `Bus workshop se nikal gayi` | **26** | `Workshop se nikal gayi` | 22 | "Bus" dropped — the list header already says `Yard ka kaam` and the rows below it are buses. Over by 2 |
| `Bus workshop mein aa gayi` | **25** | `Workshop mein aa gayi` | 21 | same word, same reason. No comma rescue exists here: there is no punctuation in the original to trade |
| `Dhyaan dene wali cheezein` | **25** | `Dhyaan chahiye` | 14 | **Over by 1, and every ≤24 form that keeps all four words is a paraphrase.** `Dhyaan dene wali baatein` is exactly 24 but swaps *cheezein* for *baatein*, which is a paraphrase **at** the cap — the cap risk with none of the fidelity that justifies it elsewhere in this table. So the clearest short form with headroom wins, and the count moves to the description: `"7 cheezein dhyaan maang rahi hain."` |
| `Sign-off chahiye — N card` | **25 at N=1** | `Sign-off chahiye` | 16 | **Not a character shortfall — the count rule** (§1.2). At N=12 it is 26. A title that fits today and breaks in a busy week is the failure this rule exists for, and no rewording can fix it |

**Four labels now ship at exactly their cap**, all marked `AT CAP` and all covered by
§1.2's rule: `Meri rating aur coaching` (24), `Poora store, app kholein` (24),
`Gate round, aaj ki buses` (24), and the button `Nahi, doosri kharabi` (20).

**Nothing in this document is silently truncated, and nothing loses a meaning.** The three
remaining shortened titles drop one word each that the list header or the description
already carries.

---

## 2. The routing table: every interactive element, id and title

This is the table the backend builds against. **54 ids**, eleven of them dynamic families
whose suffix is a server-minted record id (§1.3 rule 4). Titles are counted.

### 2.1 Root menu rows — driver (list, 6 rows)

Header: `"Garage Saathi"` (13). Body: `"{name} — kya karna hai?"`. List button text:
`Chunein` (7). Footer: `"Bol kar bhi bata sakte hain."` (28).

**A list's open button carries text only and has no id** — tapping it opens the row picker
rather than sending a reply, so there is nothing for the backend to route on. Every list
below therefore names its button text and no id for it.

| id | title | len | Goes to |
|---|---|---|---|
| `attendance.checkin.start` | Hajri lagao | 11 | §5 |
| `attendance.checkout.start` | Chhutti (ghar jaana) | 20 | §5 |
| `odometer.photo.start` | Meter ka photo | 14 | §4 |
| `report.start` | Bus mein kharabi hai | 20 | §6 |
| `fuel.start` | Diesel daala | 12 | §7.4 |
| `link.me.reviews` | Meri rating aur coaching | **24 AT CAP** | link · phone → **Me (#12)** |

Descriptions (≤72), in row order: `"Location aur photo bhejein."` · `"Din khatm — phir
location aur photo."` · `"Dashboard ka saaf photo."` · `"Brake, engine, AC — jo bhi
ho."` · `"Pump ki slip ka photo."` · `"App mein khulega."`

### 2.2 Root menu rows — conductor (list, 4 rows)

`attendance.checkin.start` · `attendance.checkout.start` · `report.start` ·
`link.me.reviews`. Same ids, same titles, same descriptions. **A conductor holds zero
capabilities** (`02 §1`) and every row here is his own record, so no capability is
created for the role.

### 2.3 Root menu rows — store (list, 5 rows), supervisor (8), crewmanager (5)

**store** — header `"Store"` (5), list button `"Chunein"`:

| id | title | len |
|---|---|---|
| `store.issue.start` | Part dena (request se) | 22 |
| `store.return.start` | Part wapas aaya | 15 |
| `store.receive.start` | Stock aaya — bill photo | 23 |
| `link.store.low` | Kam stock | 9 |
| `link.store.count` | Ginti | 5 |

**supervisor** — header `"Yard ka kaam"` (12), list button `"Chunein"`:

| id | title | len | description (≤72) |
|---|---|---|---|
| `jobcard.out.start` | Workshop se nikal gayi | 22 | `"Bahar nikalne ka time darj karein."` |
| `link.jobcard.new` | Workshop mein aa gayi | 21 | `"Naya card — photo chahiye, app mein khulega."` |
| `attendance.checkin.start` | Hajri lagao | 11 | `"Location aur photo bhejein."` |
| `link.gate.round` | Gate round, aaj ki buses | **24 AT CAP** | `"Photo, selfie aur 1.5 second ka hold."` |
| `link.attention.verify` | Sign-off chahiye | 16 | `"{n} card doosre dastakhat ka intezaar kar rahe hain."` |
| `link.attention.all` | Dhyaan chahiye | 14 | `"{n} cheezein dhyaan maang rahi hain."` |
| `link.store.all` | Store aur bills | 15 | `"Poora store, ginti aur bill."` |
| `link.money.all` | Paisa aur hisaab | 16 | `"PIN lagega."` |

**crewmanager** — header `"Aaj raat"` (8):

| id | title | len |
|---|---|---|
| `link.duty.tonight` | Aaj raat ki buses | 17 |
| `link.duty.empty` | Khaali seat | 11 |
| `link.fuel.all` | Diesel / AdBlue | 15 |
| `attendance.checkin.start` | Hajri lagao | 11 |
| `link.people.coaching` | Coaching approve karein | 23 |

**owner** — not a list. §7.5.

**mechanic** — no root menu; his first inbound gets his own cards (§2.4).

**office** — no menu, and **one message**: `wa.office.nosurface` (§3.4). The role's whole
job is a desk and a Windows 7 PC (`whatsapp-ux.md §10.2`), so there is nothing here it
could do — but it is enrolled, so it is answered.

### 2.4 Pick-lists (dynamic rows)

| List | Row id | Row title | Row description (≤72) | Row 10 |
|---|---|---|---|---|
| Mechanic's own cards, oldest first, ≤9 | `jobcard.pick:<jobId>` | the registration, e.g. `MH12 AB 1234` (12) | `"brake se awaaz · 2 din 4 ghante"` | `{id: link.jobs.all, title: "Baaki sab — app kholein"}` (23) |
| Buses standing in the workshop, ≤9 | `jobcard.out.pick:<jobId>` | the registration | `"AC band · 6 ghante khadi"` | `link.jobs.all` |
| Open part requests, ≤9 | `store.request.pick:<requestId>` | the registration | `"brake pad · Mukesh · 2 ghante"` | `{id: link.store.all, title: "Poora store, app kholein"}` (24 **AT CAP**) |
| This bus's open cards, when a spoken part issue names no card, ≤9 | `store.card.pick:<jobId>` | the registration | `"clutch · khula 3 din se"` | `link.store.all` |
| Parts issued recently that can come back, ≤9 | `store.return.pick:<issueId>` | the part's catalogue name, truncated to 24 by the **server**, with the full name in the description | `"Brake pad (front, Tata 1512) · MH12 AB 1234 · 2 piece"` | `link.store.all` |
| The people one number matches, ≤10, **no 10th link row** | `identity.person:<userId>` | the person's first name | `"Driver · MH12 AB 1234"` | — (§11.4) |

**The registration is the title in four of these six lists** because it is 12 characters,
never grows, and is the one string a person at a bus can check against the thing in front
of them. The fault, the age and the person go in the description.

**A catalogue part name is the one title this spec cannot guarantee fits.** `"Brake pad
(front, Tata 1512)"` is 27 characters. The server truncates the title at 24 on a word
boundary and puts the **full** name in the description — and the **proposal message**
(§8.2), where a person confirms a part, is a buttons message whose body has 1,024
characters and shows the full catalogue name. **No write is ever confirmed against a
truncated name.**

### 2.5 Fixed-row lists

**Report categories (9 rows).** Ids carry the exact value stored on the record, read from
`REPORT_CATS` [C `app.js:12138–12148`], so the existing grouping, `reportAiLine` and every
analytic keep working and the Hinglish title is free to change:

| id | title | len |
|---|---|---|
| `report.cat:Brakes` | Brake | 5 |
| `report.cat:Engine` | Engine | 6 |
| `report.cat:AC` | AC | 2 |
| `report.cat:Suspension` | Suspension | 10 |
| `report.cat:Electrical` | Electrical | 10 |
| `report.cat:Tyres` | Tyre | 4 |
| `report.cat:Gearbox` | Gearbox | 7 |
| `report.cat:Body` | Body | 4 |
| `report.cat:Other` | Doosri kharabi | 14 |

Header `"{reg} — kya kharabi hai?"` (≤60 for any registration). List button
`"Kharabi chunein"` (15). Nine rows in a 10-row list, one spare — the one cap in the UX
doc that never collided [C confirmed by counting `REPORT_CATS`].

### 2.6 Reply-button sets — all 11, checked for duplicate titles

**Three buttons maximum, titles unique within the message, 20 characters each.** Every
set below was checked for a repeated title; the two that would have repeated *"Haan"* are
marked.

| Set | Buttons (id → title, len) | Unique? |
|---|---|---|
| Mechanic's card actions | `jobcard.act.start` → `Shuru kiya` (10) · `jobcard.act.done` → `Ho gaya` (7) · `jobcard.act.partneeded` → `Part chahiye` (12) | yes |
| Part quantity | `store.qty.1` → `1 piece` (7) · `store.qty.2` → `2 piece` (7) · `store.qty.more` → `Zyada — app kholein` (19) | yes |
| Which kind of photo | `photo.kind.odometer` → `Meter ka photo` (14) · `photo.kind.attendance` → `Hajri ka photo` (14) | yes (2 buttons) |
| Problem-report proposal | `proposal.confirm:<id>` → `Haan, bhej do` (13) · `proposal.reject:<id>` → `Nahi, doosri kharabi` (20 **AT CAP**) · `proposal.photo:<id>` → `Photo bhi bhejna` (16) | yes |
| Part-request proposal | `proposal.confirm:<id>` → `Haan, bhej dein` (15) · `proposal.reject:<id>` → `Nahi, doosra part` (17) · `proposal.escalate:<id>` → `Store se poochhein` (18) | yes — **and this is where "Haan" twice would have been rejected**: the first draft had `Haan, bhej do` here too, which is fine across messages and fatal inside one |
| Fuel proposal | `proposal.confirm:<id>` → `Haan, darj karein` (17) · `proposal.reject:<id>` → `Nahi — app kholein` (18) | yes (2 buttons) |
| Attendance-intent proposal | `proposal.confirm:<id>` → `Haan, lagao` (11) · `proposal.reject:<id>` → `Nahi, menu dikhao` (17) | yes |
| Part-issue proposal (spoken, storekeeper) | `proposal.confirm:<id>` → `Haan, de do` (11) · `proposal.reject:<id>` → `Nahi, badal do` (14) · `proposal.escalate:<id>` → `Poora store kholein` (19) | yes |
| Generic value read-back (odometer typed in, quantity) | `proposal.confirm:<id>` → `Haan, theek hai` (15) · `proposal.reject:<id>` → `Nahi, badal do` (14) | yes |
| Transcription retry | `ai.speak.again` → `Phir se bolunga` (15) · `menu.open.buttons` → `Menu dikhao` (11) | yes — **used only where no list is being sent**; normally the menu rides in a list body instead and costs nothing (§8.4) |
| Checkout confirm (a second pair arriving before 11:00, §5.4) | `proposal.confirm:<id>` → `Haan, chhutti` (13) · `proposal.reject:<id>` → `Nahi, hajri hai` (15) | yes |

**One label is deliberately two different strings in two places, and it must stay that
way.** The store link is `Poora store, app kholein` (24) as a **list row** and
`Poora store kholein` (19) as a **button**, because the button cap is 20 and the row cap
is 24. Making them match would either waste 5 characters of a row title or exceed a
button by 4 and be rejected at send time. **This is not an inconsistency to tidy.**

### 2.7 The one message that is neither a list nor buttons

The **location request** (`wa.att.ask.both`, §5.2) is WhatsApp's own
`interactive / location_request_message`: a body plus a single send-location button whose
label **WhatsApp supplies and we cannot set or translate**. So the body must name both
things the person has to send, because the button only covers one of them.

**Unverified:** I could not confirm the body cap for this message type from either the
repo (`wa_client.py` has no interactive sender at all [C]) or the caps I was given.
The body specified in §5.2 is 86 characters, so any plausible cap holds.

---

## 3. Enrolment, identity, and the message that starts everything

### 3.1 `wa.enrol.welcome` — template T1, §10

The only message the bot sends to a person who has never written to it. Once per person,
ever. Text in §10; it carries the name, that the number is linked, the two things to send
for attendance **in the order to send them**, and that replies come from a machine. **No
PIN, no code, no link** (`whatsapp-ux.md §3.2`).

### 3.2 `wa.identity.pick` — one number, two people

List, ≤10 rows, rows per §2.4. First inbound of the calendar day only; the choice holds
until midnight.

- Header: `"Aap kaun hain?"` (14)
- Body: `"Yeh number do naam par darj hai. Apna naam chunein — aaj ke liye yaad rakh
  lenge."`
- Footer: `"Galat naam chun liya? Office se kahein."` (39)
- List button: `"Naam chunein"` (12)

**After the pick, the bot continues straight into the flow the person was trying to do.**
It does not send a "thank you". If the pick was the first thing that happened and there
was no intent, the next message is their root menu — which is the same one message they
would have got anyway.

### 3.3 `wa.pin.ask` and its three failures

| id | Copy | Notes |
|---|---|---|
| `wa.pin.ask` | *"{name} — apna 4 ank ka PIN bhejein. Aaj ek hi baar poochha jayega."* | Plain text, not a list. The reply is four typed digits — the one place `DECISIONS.md §25.4` allows typing |
| `wa.pin.wrong` | *"PIN galat. Dobara bhejein."* | Verbatim from UX §5.5. **Never says which digit, never says how many tries are left** |
| `wa.pin.locked` | *"PIN kai baar galat gaya. Kuch minute baad dobara karein."* | After `MAX_FAILS` = 5 in `LOCK_WINDOW` = 300 s [C `sync_server.py:344`, `:353`]. **Says "kuch minute", not "5 minutes"**, because the lock window is an env var and a number in the copy would become a lie the first time it changed |
| `wa.pin.forgot` | *"PIN office se hi milega. Is number par PIN nahi bhejte."* | Sent when the router hears "PIN bhool gaya". **No new PIN is minted and nothing is sent** — CLAUDE.md puts that with the owner |

**`wa.pin.wrong` and `wa.pin.locked` must not be distinguishable at a finer grain than
this** (UX §5.5). A message that said *"ab 2 koshish bachi hain"* is a brute-force
oracle delivered by us.

### 3.4 `wa.office.nosurface` — the one message for a role with no surface

| id | Copy |
|---|---|
| `wa.office.nosurface` | *"Yeh kaam app par hota hai, chat par nahi. Office ki screen kholein."* |

One message, per enrolled office number per inbound, plain text. **Decided 2026-11-11 and
it resolves a contradiction between two upstream documents in favour of `DECISIONS.md`.**

`whatsapp-ux.md §10.2` says an enrolled office number "should resolve and go silent rather
than offer a menu with nothing on it". **That side was wrong.** Silence to a **stranger**
is `DECISIONS.md §25.2`, is deliberate, and is built (§11.7). Silence to **a colleague
somebody went and enrolled** is a different act, and `DECISIONS.md §25.8` settles the
principle for exactly this shape: fall back with one explanatory line, **never to
silence.** §25 is the authority, so the one line ships.

Two notes on the cost, because it is a message we pay for:

- **The right half of UX §10.2 is kept:** there is still no menu, because a menu of rows
  the role cannot complete is a message somebody pays for to get past (`whatsapp-ux.md
  §6.1`).
- **One per inbound, not one per day.** An office person who gets this once stops; the
  volume of a role with no flows is a handful of messages at rollout and zero afterwards.
  If it is not zero, that is somebody trying to do a job in the wrong place and the
  message is the only thing that will tell them.

---

## 4. Odometer — the live flow, ten strings, unchanged

These ten strings are **live today** and were read from the file. They move into
`wa_copy.py` **character for character**. A stage-2 rewrite of working copy that 89 buses'
crews already see would be change for its own sake.

| id | Copy, exactly as it is today | Source |
|---|---|---|
| `wa.odo.unreadable` | *"Meter clear nahi dikha. Thoda paas se, seedha photo bhejein."* | `sync_server.py:5561` |
| `wa.odo.held.broken` | *"{reg}: meter kharab mark hai, reading darj nahi hui. Office ko batayein."* | `:5581` |
| `wa.odo.held.first` | *"{reg}: pehli reading {km} km. Office confirm karega."* | `:5590` |
| `wa.odo.held.backwards` | *"{reg}: {km} km pichhli reading ({prev} km) se kam hai. Office check karega. Dobara photo bhej sakte hain."* | `:5600` |
| `wa.odo.held.jump` | *"{reg}: {km} km — pichhli baar se {delta} km zyada. Office confirm karega."* | `:5611` |
| `wa.odo.held.daily` | *"{reg}: aaj ki readings milakar {delta} km ho gaye. Office confirm karega."* | `:5637` |
| `wa.odo.held.changed` | *"{reg}: bus ki details abhi badli hain. Office check karega."* | `:5662` |
| `wa.odo.accepted` | *"{reg}: {km} km darj ho gaya{delta_clause}. Dhanyavaad."* — `delta_clause` is `" (+{delta} km)"` when there was a previous reading, empty otherwise | `:5673` |
| `wa.media.fail` | *"Photo nahi mila. Dobara bhejein."* | `_wa_handle`, `:5400` |
| `wa.odo.dry` | *"[dry] {reg}: {km} km read, nothing written."* | `:5642`. **Never sent to a person** — it is the `POST /odometer/submit` dry reply and stays English |

**One live string is deleted and one is retired:**

| id | Copy today | What happens to it |
|---|---|---|
| `wa.odo.enrol` | *"Yeh number kisi bus se linked nahi hai. Office se apna number register karwayein."* [C `:5555`] | **Deleted.** `DECISIONS.md §25.2` replaces it with no reply at all. §11.7 |
| `wa.fallback.menu` | *"Meter ka photo bhejein — bas photo, aur kuch nahi."* [C `:5405`] | **Retired.** It is today's answer to every non-image message from every sender. It is replaced by the sender's own root menu (enrolled) or by nothing (not enrolled) |

**Two new odometer messages:**

| id | Copy |
|---|---|
| `wa.odo.ask.photo` | *"Meter ka photo bhejein — dashboard saaf dikhe, paas se."* |
| `wa.photo.kind.ask` | Buttons `photo.kind.*` (§2.6). Body: *"Yeh photo meter ka hai ya hajri ka?"* Sent **only** when the image classifier is not confident (`whatsapp-ux.md §11`) |

---

## 5. Attendance — the flow the surface exists for

### 5.1 The receipt, built from a stem and three clauses

**One message id, three optional clauses**, rather than four near-identical messages. The
clauses are separately keyed so a reviewer can fix one without reading the other three.

| id | Copy |
|---|---|
| `wa.att.in.ok` | *"{name} — hajri lag gayi. {time} baje, garage se {dist}.{clauses} {habit}"* |
| `wa.att.clause.late` | *" LATE."* — appended straight after the distance. Capitalised, as the UX doc has it, because it is the one word in the register that is a mark and not a sentence |
| `wa.att.clause.far` | *" Garage se {dist} door — office check karega."* — replaces the normal distance clause, it does not stack with it |
| `wa.att.clause.dupphoto` | *" Yeh photo pehle bhi aaya tha — office check karega."* |
| `wa.att.habit.first` | *"Jaane ke waqt phir location aur photo bhejein, chhutti darj ho jayegi."* — appended **only to a person's first-ever check-in receipt**, never after |

Worked, exactly as sent:

- Happy: *"Ramlal — hajri lag gayi. 05:02 baje, garage se 40 meter. Jaane ke waqt phir
  location aur photo bhejein, chhutti darj ho jayegi."*
- Second day onward: *"Ramlal — hajri lag gayi. 05:02 baje, garage se 40 meter."*
- Late: *"Ramlal — hajri lag gayi. 09:48 baje, garage se 60 meter. LATE."*
- Far: *"Ramlal — hajri lag gayi, lekin garage se 7.4 km door — office check karega."*
- Repeated photo: *"Ramlal — hajri lag gayi. 05:02 baje, garage se 40 meter. Yeh photo
  pehle bhi aaya tha — office check karega."*

**Why the habit line is first-time only.** It is the one sentence that teaches the
1-message fast path, which is assumption A6 and the thing the Meta bill hangs on
(`whatsapp-ux.md §8.4`). Repeating it every day would make the receipt a paragraph
somebody stops reading, which is how the habit line stops working.

### 5.2 The prompts

| id | Type | Copy |
|---|---|---|
| `wa.att.need.photo` | text | *"Location mil gaya. Ab apna photo bhejein — hajri ke liye dono zaroori hain."* |
| `wa.att.need.location` | text | *"Photo mil gaya. Ab location bhejein — hajri ke liye dono zaroori hain."* |
| `wa.att.ask.both` | location request (§2.7) | *"Location bhejein — neeche ke button se. Uske baad apna ek photo bhi."* (68 chars) |

**One reminder, after three minutes, for attendance only. Then the partial expires
silently after 30 minutes** (`whatsapp-ux.md §11`). **There is no second reminder and no
expiry message** — a message we pay for to tell somebody their abandoned entry was
abandoned.

### 5.3 Check-out

| id | Copy |
|---|---|
| `wa.att.out.ok` | *"{name} — chhutti darj. {time} baje. Aaj {hours} ghante."* |
| `wa.att.out.ok.far` | *"{name} — chhutti darj. {time} baje, garage se {dist} door — office check karega."* |

### 5.4 Attendance failures and edges

| What happened | id | Copy |
|---|---|---|
| Both pairs already done today | `wa.att.already` | *"{name} — aaj hajri ({in_time}) aur chhutti ({out_time}) dono darj hain. Aur kuch badalna ho to office se kahein."* |
| A second pair before 11:00, which is more likely a repeated check-in than a shift ending | `wa.att.out.confirm` | Buttons (§2.6). Body: *"{name} — hajri {in_time} baje lagi thi. Yeh chhutti hai?"* |
| Media would not download | `wa.media.fail` | the existing string (§4) |
| The person has no `users` row the number resolves to | — | **nothing** (§11.7) |
| A live-location share rather than a pin | — | **No new message.** The first fix is taken and every later update for the same share is dropped. `whatsapp-ux.md §5.1` marks the webhook behaviour UNKNOWN and it **must be tested against a real account before stage 3**; this spec states the rule either way, because the failure it prevents — a driver's attendance following him up the highway — has no message that could fix it afterwards |

**Nothing is written until both halves are in.** An attendance row with a location and no
photo looks exactly like an app check-in whose camera failed silently, which is a known
live defect ([E] GO_LIVE, `05 §3` row 8) and must not be reproduced by a new surface.

---

## 6. Problem report

| id | Type | Copy |
|---|---|---|
| `wa.report.ask.cat` | list, 9 rows (§2.5) | Header *"{reg} — kya kharabi hai?"*; body *"Kaun si cheez mein kharabi hai?"*; footer *"Bol kar bhi bata sakte hain."* |
| `wa.report.ok` | text | *"{reg} — {cat_hi} ki shikayat darj. Supervisor dekhega. Photo bhej sakte hain, usse jaldi hoga."* |
| `wa.report.ai.propose` | buttons | *"{reg} — {cat_hi}, {problem}. Supervisor ko bhej dein?"* |
| `wa.report.ai.ok` | text | *"Darj ho gaya. Supervisor dekhega."* |
| `wa.report.nobus` | text | *"Aapke naam par abhi koi bus nahi hai. Office se poochh lein."* |

`{cat_hi}` is the Hinglish title from §2.5 (`Brake`, `Engine`, …); the record stores the
id's suffix (`Brakes`, `Engine`, …). **The two are never the same string and the record
never stores the Hinglish.**

`{problem}` is the person's own words from the transcript, **quoted back and never
rewritten by the model** — *"left side se awaaz, subah se"*. That is the whole value of
the spoken path here (`whatsapp-ux.md §5.2`): the supervisor gets a fault he can plan for
instead of the word *"Brake"*.

**On reject** (`proposal.reject`): the category list, `wa.report.ask.cat`, with the body
replaced by *"Theek hai — list se chunein."* One message, no second model call (§8.3).

---

## 7. Mechanic, supervisor, store, diesel, owner

### 7.1 Mechanic

| id | Type | Copy |
|---|---|---|
| `wa.jobs.list` | list ≤10 (§2.4) | Header *"Aapke kaam"* (10); body *"{name} — kaun sa kaam?"*; list button *"Kaam chunein"* (12) |
| `wa.jobs.actions` | buttons (§2.6) | *"{reg} — {fault}. Kya hua?"* |
| `wa.jobs.started` | text | *"{reg} — {time} baje 'shuru kiya' darj."* |
| `wa.jobs.done` | text | *"{reg} — {time} baje 'ho gaya' darj. Supervisor check karega. Card aap band nahi kar sakte."* |
| `wa.jobs.done.already` | text | *"{reg} — 'ho gaya' pehle hi darj hai ({time}). Supervisor ke paas hai."* |
| `wa.jobs.reassigned` | text | *"Yeh card ab aapke naam nahi hai. 'kaam' likh kar apni list dobara dekhein."* |
| `wa.jobs.empty` | text | *"Aapke naam par abhi koi khula card nahi hai."* |
| `wa.jobs.part.ask` | text | *"Kaun sa part chahiye? Bol kar bata dein."* |
| `wa.jobs.part.propose` | buttons (§2.6) | *"{part_full} × {qty}, {reg} ke card par. Stock mein {stock} hain. Request bhejein?"* |
| `wa.jobs.part.sent` | text | *"Request bhej di. Store ko dikh gaya."* |
| `wa.jobs.part.nomatch` | text | *"Yeh part nahi mila. Store se phone par baat kar lein. Request bina naam ke bhej di hai."* |

`wa.jobs.done` keeps *"Card aap band nahi kar sakte"* because the server refuses a
mechanic a close, a verify, a re-open and a crew change (`02 §4.4`) and a person who
does not know that will go looking for the button.

**`wa.jobs.part.sent` says "Store ko dikh gaya", not "Suresh ko dikh gaya".** The UX
doc's walk-through names Suresh; naming a specific storekeeper in a receipt is a promise
about who is on shift that the bot cannot keep. My change, and it costs nothing.

### 7.2 Supervisor — the bus left the workshop

| id | Type | Copy |
|---|---|---|
| `wa.out.list` | list ≤10 (§2.4) | Header *"Workshop mein khadi bus"* (23); body *"Kaun si bus bahar nikli?"*; list button *"Bus chunein"* (11) |
| `wa.out.ok` | text | *"{reg} — {time} baje bahar darj. Workshop mein {age} khadi rahi. Band karne ke liye photo chahiye: {link}"* |
| `wa.out.already` | text | *"{reg} ka bahar ka time pehle hi darj hai ({when}). Badalna ho to app kholein: {link}"* |
| `wa.out.raced` | text | *"{reg} ka bahar ka time {who} ne {when} darj kar diya. Pehle dekha hua time hi rehta hai. Badalna ho to app kholein: {link}"* |
| `wa.out.empty` | text | *"Workshop mein abhi koi bus khadi nahi hai."* |

`wa.out.raced` carries the rule from `whatsapp-ux.md §11` in one sentence: *"Pehle dekha
hua time hi rehta hai"* — two people's observations of one event, and the first recorded
one wins. **Last writer does not win on a time somebody observed**, and the person who
lost the race is told why rather than left to wonder which time is in the card.

### 7.3 Store

| id | Type | Copy |
|---|---|---|
| `wa.store.req.list` | list ≤10 | Header *"Kaun sa request?"* (16); body *"Khule request — ek chunein."*; list button *"Request chunein"* (15) |
| `wa.store.req.empty` | text | *"Koi khula request nahi hai. Poora store app mein: {link}"* |
| `wa.store.qty.ask` | buttons (§2.6) | *"{part_full} — {reg} ke card par. Kitne piece?"* |
| `wa.store.qty.ask.digits` | text | *"Kitne piece? Sirf number bhejein."* |
| `wa.store.issued` | text | *"{part_full} × {qty}, {reg} ke card par. Stock ab {stock}. Ho gaya."* |
| `wa.store.req.gone` | text | *"Yeh request ab khuli nahi hai. 'part' likh kar list dobara dekhein."* |
| `wa.store.req.taken` | text | *"Yeh request {time} baje {who} ne pehle hi poora kar diya."* |
| `wa.store.stock.zero` | text | *"{part_full} ka stock {stock} hai. Pehle stock aana chahiye, ya app se ginti karein: {link}"* |
| `wa.store.card.ask` | list ≤10 (§2.4) | Header *"{reg} — kaun sa card?"*; body *"Is bus par {n} card khule hain. Part kis par lagega?"*; list button *"Card chunein"* (12) |
| `wa.store.free.propose` | buttons (§2.6) | *"{part_full} × {qty}, {reg} ke card par. Stock {stock} se {new_stock} ho jayega. De dein?"* |
| `wa.store.return.list` | list ≤10 (§2.4) | Header *"Kaun sa part wapas?"* (19); body *"Pichhle 7 din ke issue. Jo wapas aaya hai woh chunein."*; list button *"Part chunein"* (12) |
| `wa.store.return.ok` | text | *"{part_full} × {qty} wapas darj. Stock ab {stock}."* |
| `wa.store.return.empty` | text | *"Pichhle 7 din mein koi part issue nahi hua. Poora store app mein: {link}"* |
| `wa.store.receive.ask` | text | *"Bill ka photo bhejein — poora bill, saaf dikhe."* |
| `wa.store.receive.handoff` | text | *"Bill mil gaya. Lines check karke daalne ke liye app kholein: {link}"* |

**`wa.store.stock.zero` prints the real stock figure, not the word zero**, because the
refusal applies at any quantity above stock and a storekeeper holding one piece needs to
know the book says one.

**The card is never pre-selected.** `wa.store.card.ask` exists because a part was once
charged to the wrong bus by a sheet that pre-picked the first open job ([E] d738a6e,
carried in UX §5.5). If the bus has exactly one open card, §11.5's one-item rule applies
and the card is named in the proposal body instead — **named, not assumed**.

**Stock receipt is a handoff, not a flow.** Reading a supplier bill into lines is
`/ai/bill`'s job on a screen with a correction step ([E] c896478); confirming twenty
lines one tap at a time is the shelf-count problem (`whatsapp-ux.md §10.1`). The chat
takes the photo and hands over a link. **This is my decision**; the UX doc gave the row a
title and never walked the flow.

### 7.4 Diesel

| id | Type | Copy |
|---|---|---|
| `wa.fuel.ask.slip` | text | *"Pump ki slip ka photo bhejein."* |
| `wa.fuel.propose` | buttons (§2.6) | *"{reg} — {litres} litre, ₹{amount}, pump: {pump}, meter {odo}. Sahi hai?"* |
| `wa.fuel.ok` | text | *"Darj ho gaya. Pichhli fill se {km} km, {kmpl} km/litre."* |
| `wa.fuel.ok.nofirst` | text | *"Darj ho gaya. Agli fill par km/litre dikhega."* |
| `wa.fuel.slip.unreadable` | text | *"Slip saaf nahi dikhi. Dobara photo bhejein, ya bol kar bata dein — kitne litre aur kitne rupaye."* |
| `wa.fuel.ask.meter.digits` | text | *"{reg} — meter kitna hai? Sirf number bhejein."* |
| `wa.fuel.odo.held` | text | *"{reg} — meter {odo} darj nahi hua: {reason}. Diesel darj ho gaya. Office check karega."* |
| `wa.fuel.nobus` | text | *"Kaun si bus? Registration bol kar bata dein."* |

**`wa.fuel.propose` reads back all four numbers before anything is written**, per
`DECISIONS.md §25.5`, because a misheard *"chaudah hazaar"* is ₹1,400 or ₹1,40,000 and
`v2-ux.md §4.1` #7 already records a tenfold cost error that sent the owner to inspect a
healthy bus ([E] 8db78e7). Longest realistic body: **81 characters** against the
1,024-character buttons cap.

**`wa.fuel.odo.held` is new and it matters.** The odometer inside a fuel row feeds km/l,
so it goes through the **same** ladder as `odometer_submit` (UX §5.6). That means a fuel
entry can succeed while its meter reading is held — two outcomes in one act, and the
person must be told both in one message rather than being left to think the fill did not
record. `{reason}` is the short clause from the matching `wa.odo.held.*` string, not a
second sentence.

### 7.5 Owner's morning glance

Q5 (plain text with links vs a list) is **open** — `DECISIONS.md §25` does not settle it.
Both are specified; the builder ships the one the owner answers.

**`wa.owner.glance.text`** — one message, five labelled links, each on its own line:

```
Aaj — {date}
30 din ka kharch: {link_money}
Sign-off chahiye — {n_verify} card: {link_verify}
Dhyaan dene wali {n_attention} cheezein: {link_attention}
Workshop mein {n_workshop} bus: {link_jobs}
Naye number jo message kiye — {n_unknown}: {link_unknown}
```

- **A line whose count is zero is omitted**, not sent as "0". The purpose of the counts in
  the message is that on a morning when everything is zero he taps nothing at all.
- **Link previews must be suppressed** on this message (`"preview_url": false` on the
  text payload), or WhatsApp draws a card for the first URL and the other four scroll
  out of view. UX §4.2 raised this as stage 2's problem; this is the answer.
- The five destination pages must carry **no title worth previewing** as a second
  defence, because preview suppression is a flag we may get wrong once.

**`wa.owner.glance.list`** — the same five as list rows, 2 messages (the list, then the
link message), ids `link.money.all` · `link.attention.verify` · `link.attention.all` ·
`link.jobs.all` · `link.unknown.numbers`, counts in descriptions per §1.2.

**`wa.owner.glance.clear`** — *"Aaj kuch pending nahi. {date}."* Sent when all five counts
are zero. **One message instead of a menu of five zeroes**, and it is the cheapest
possible version of this job.

### 7.6 The link carrier

| id | Copy |
|---|---|
| `wa.link.send` | *"{label}: {link}"* — one line, nothing else |
| `wa.link.send.phone` | *"{label}: {link}\nPhone par kholein — camera chahiye."* |

`{label}` comes from a fixed table of 14, one per destination in `whatsapp-ux.md §6.2`:
`Paisa aur hisaab` · `Sign-off chahiye` · `Dhyaan chahiye` · `Naye number` ·
`Workshop ki buses` · `Card band karna` · `Naya card` · `Gate round` · `Aaj raat ki
buses` · `Poora store` · `Diesel theek karein` · `Coaching` · `Meri rating` ·
`Mere documents`.

`wa.link.send.phone` is used for the five phone-only destinations (UX §6.2) and exists so
that somebody at an office PC is told before the tap, not after the camera fails to open.

---

## 8. The AI paths' surface

`DECISIONS.md §25.5`: **AI reads and proposes; the person confirms with a tap; the server
still validates.** §25.13: an AI-read number **never** writes without a tap. That makes
the proposal the single most important message shape on this surface, so it has one shape
everywhere.

### 8.1 The four steps a person sees

| Step | What they see | Cost |
|---|---|---|
| They speak or type | **the blue tick** (§12.1) | 0 |
| Bot proposes | **one buttons message** — §8.2 | 1 |
| They tap once | nothing new | 0 |
| Bot confirms | **the same receipt the tapping path would have sent** | 1 |

**The receipt is never a special "AI" receipt.** `wa.report.ai.ok` differs from
`wa.report.ok` only because the tapping path has a photo hint to offer and the spoken one
does not. Everything else reuses the flow's own receipt, so a person learns one sentence
per job regardless of how they did it.

### 8.2 The proposal, specified once

**Type:** reply buttons. **Body cap 1,024** — every proposal in this document is under
100 characters, and the longest, `wa.store.free.propose` with a full catalogue name, is
**92**. There is no proposal anywhere near the cap, which is worth stating because the
limit for a buttons body is a quarter of a list's.

Rules, all of them from `DECISIONS.md §25.5`:

1. **Name every slot in full, in the record's own vocabulary, not the person's.**
   The bus by registration (`MH12 AB 1234`), the part by its full catalogue name
   (`Brake pad (front, Tata 1512)`), the quantity in digits, money with `₹`, a time as
   `HH:MM`. *"brake pad"* spoken becomes the catalogue row in the proposal, because what
   is being confirmed is **the system's reading, not the person's memory**.
2. **Show the consequence where there is one**: `"Stock {stock} se {new_stock} ho
   jayega"`, `"Stock mein {stock} hain"`. A storekeeper confirming an issue is confirming
   a number going down.
3. **Nothing is pre-ticked and no button is a default.** WhatsApp gives no default; do not
   simulate one with a footer that says which to press.
4. **End with a question**: *"Sahi hai?"*, *"De dein?"*, *"Request bhejein?"*
5. **One act per proposal.** A sentence naming two jobs does the first and says so in the
   receipt — `wa.ai.multi` (§8.5) — and never proposes two writes.
6. **The transcript is visible to the person.** Where the proposal does not already quote
   their words back (the problem report does, via `{problem}`), the footer carries
   *"Suna: {transcript_short}"* — 60 characters, truncated on a word boundary by the
   server. A person who cannot read the menu can still hear the mismatch when somebody
   reads it to them, and §12 measure 16's abandon rate is uninterpretable without it.

### 8.3 Reject

**Reject is never silence and never a retry of the model.**

| Flow | `proposal.reject` sends | Count |
|---|---|---|
| Problem report | `wa.report.ask.cat`, the 9-row list, body *"Theek hai — list se chunein."* | 1 |
| Part request | `wa.jobs.part.ask`, *"Kaun sa part chahiye? Bol kar bata dein."* — **one more attempt at speech is allowed here, because 2,400 parts have no list** | 1 |
| Part issue (storekeeper) | `wa.store.req.list` | 1 |
| Fuel | `wa.link.send.phone` with label `Diesel theek karein` | 1 |
| Attendance intent | the person's root menu | 1 |
| Generic value read-back | `wa.store.qty.ask.digits` or `wa.fuel.ask.meter.digits` — **the one-number prompt, which `DECISIONS.md §25.4` allows to be answered with typed digits** | 1 |

**The model is not called a second time on the same utterance.** A second guess costs a
second inference call and is a worse answer than a list, and `whatsapp-ux.md §4.4` already
forbids guessing between two buses, two people or two parts.

### 8.4 When the router understood nothing — and the rule that keeps it to one message

| id | Type | Copy |
|---|---|---|
| `wa.ai.none` | **the person's own root menu as a list** | body: *"Samajh nahi aaya. Neeche se chunein."* |
| `wa.ai.transcribe.fail` | **the person's own root menu as a list** | body: *"Aapki baat saaf sunai nahi di. Dobara bolein, ya neeche se chunein."* |
| `wa.ai.forbidden` | **`wa.ai.none`, byte for byte** | — |

> **The rule: an explanatory line never gets its own message. It rides in the list body
> (4,096 characters) or in the footer (60).**

This is the one place where honouring the caps *saves* money rather than costing design:
UX §8.2 budgets 1 message for a failed transcription and 1 for the menu, and this is 1
total. Three flows use it (§9).

**`wa.ai.forbidden` is deliberately identical to `wa.ai.none`.** An intent the person's
role cannot perform must be indistinguishable from an intent nobody understood
(`whatsapp-ux.md §4.4` step 2). A distinct message — *"iske liye aapko permission nahi
hai"* — tells a driver that a money flow exists and is reachable from this number, which
is deny-by-default leaking through the copy instead of through the router.

**Questions are not answered.** *"Is bus ka kharch kitna hai"* from a crew handset routes
to `wa.ai.none`. The advisor costs up to six sequential capable-model calls per question
(`04 §6`) and is an owner/supervisor screen; putting it on 110 handsets is a separate
request (`whatsapp-ux.md §10.1`).

### 8.5 The two AI messages that are not proposals

| id | Type | Copy |
|---|---|---|
| `wa.ai.multi` | appended to the receipt, **not a second message** | *" {next_job} ke liye phir bolein."* → *"Pehle hajri laga di. Diesel ke liye phir bolein."* |
| `wa.ai.ambiguous` | buttons, **at most 3 candidates** | *"{slot_label} — kaun sa?"* with the three candidates as the button titles, ids `ai.candidate:<recordId>` |

`wa.ai.ambiguous`'s three button titles are **data, not copy**: a registration (12), a
first name, or a catalogue part name. **The server truncates each to 20 characters on a
word boundary** and the full strings go in the body, one per line. Three registrations fit
trivially; three long part names do not, which is why the body carries them and why a
fourth candidate is not offered — *"at most three"* is a cap, not a preference
(`whatsapp-ux.md §4.4`).

### 8.6 The daily cap message — `DECISIONS.md §25.8`

Ten AI-assisted interactions per crew member per day, counted per number as well as per
user, **falling back to buttons with one explanatory line, never to silence.**

| id | Type | Copy |
|---|---|---|
| `wa.ai.cap` | **the person's own root menu as a list** | body: *"Aaj bol kar bahut baar poochha. Ab neeche se chunein — kal se phir bol sakte hain."* |

Three things this copy does on purpose:

1. **It names tomorrow.** A limit with no end reads as the surface breaking.
2. **It does not say "10" and does not say "limit".** The number is a config value
   (`DECISIONS.md §25.8` sets it, §12 measure 17 may move it), and a number in the copy
   becomes wrong silently. "Bahut baar" is true at any setting.
3. **It is one message, carrying the whole menu**, so the person's day continues in the
   same tap they were going to make. Per §8.4's rule, the cap costs **0 extra messages**.

**On `wa.ai.cap` the list's footer is omitted.** Every root menu carries the footer
*"Bol kar bhi bata sakte hain."* (§2.1), and for the rest of that day it is not true.
A footer that contradicts the body is how a person decides the bot is broken rather than
rationed. The same omission applies to `wa.ai.transcribe.fail` only if the cap is also
reached; otherwise speaking again is exactly what they should do.

The fleet-wide ceiling (`whatsapp-ux.md §8.7` requirement 4) uses **the same string**. A
person who is told the garage's budget is spent learns a fact about the business from a
bot; a person told to use the menu just uses the menu.

---

## 9. Message count per flow, carried forward

`whatsapp-ux.md §8.2` costed every flow, and **every message on this surface is billed**
beyond 1,000 a month (`DECISIONS.md §25.6a`). This table is that one, with my column.

| Flow | UX §8.2 | This spec | Why |
|---|---|---|---|
| Attendance, fast path | 1 | **1** | — |
| Attendance, prompted | 2 | **2** | — |
| Attendance, via the menu | 3 | **3** | — |
| Odometer, photo unprompted | 1 | **1** | — |
| Odometer, via the menu | 3 | **3** | — |
| Problem report, tapped | 3 | **3** | — |
| Problem report, spoken | 2 | **2** | — |
| Mechanic start / done | 3 | **3** | — |
| Mechanic, **one open card** | 3 | **2** | §11.5: a one-row pick-list is replaced by the next step with the item named in the body |
| Supervisor `outAt` | 2 | **2** | — |
| Supervisor `outAt`, **one bus standing** | 2 | **1** | §11.5 |
| Store issue, first of the day | 4 | **4** | — |
| Store issue, later | 3 | **3** | — |
| Store issue, spoken, **bus has 2+ open cards** | — | **+1** | `wa.store.card.ask`. **Earned:** the alternative is picking the first open card, which is the bug [E] d738a6e exists to fix |
| **Store part return** | not costed | **4 / 3** | **New.** UX §4.1 gives the row a title and §5 never walks it. Same shape as issue: PIN, list, quantity, receipt |
| **Stock receive (bill photo)** | not costed | **2** | **New.** `wa.store.receive.ask`, then `wa.store.receive.handoff` with the link |
| Diesel from a slip | 4 | **4** | — |
| Diesel, spoken | 3 | **3** | — |
| Owner glance, text | 1 | **1** | — |
| Owner glance, **everything zero** | 1 | **1** | `wa.owner.glance.clear` — same count, one tap saved |
| Any other deep link | 2 | **2** | — |
| **Transcription failed** | 1 + menu | **1** | §8.4: the line rides in the list body |
| **Router understood nothing** | 1 | **1** | §8.4 |
| **Daily AI cap reached** | 1 + menu | **1** | §8.4 |
| Router unsure, ≤3 candidates | +1 | **+1** | — |
| **Two intents in one sentence** | — | **0** | §8.5: appended to the receipt |
| **Any empty state** | — | **0 extra** | §11.2: an empty state always *replaces* the list, never follows it |
| **A tap on an expired or stale proposal** | — | **+1** | `wa.sys.stale.tap`. Failure branch only |
| **Enrolled `office` number, any inbound** | not costed | **1** | **New**, §3.4. Volume ≈ 0 — the role has no flows and a person stops after one. It replaces a silence `DECISIONS.md §25.8` forbids |
| Unenrolled number | 0 | **0** | §11.7 |

**Net against UX §8.4's ≈600/day mid case: lower, not higher.** Three message-saving
rules (§8.4, §11.5, §11.2), two new flows that were already in the menus and had to cost
something, one conditional `+1` that buys back a known data-integrity bug, and one new
message at a volume of about zero (§3.4).

**I have not re-run the ₹ arithmetic.** §8.4's totals rest on A6 and A12, both of which
the owner must still confirm (`DECISIONS.md §25.6a`), and a second estimate on top of an
unverified rate adds precision and no information.

---

## 10. The four Meta templates, submission-ready

`DECISIONS.md §25.10`: **four, and no more.** Each is sent to somebody who has not just
written, so each is business-initiated, each is charged, and each must say everything in
one shot.

**Four construction rules applied to all of them**, because a rejection is days of delay:

1. **The body never begins or ends with a variable, and no two variables are adjacent.**
   Every one below starts with literal text. *(I applied this as a safety margin; I could
   not verify Meta's exact current validation from the repo or from the reference I was
   given, and the margin costs us one word.)*
2. **No URL in any body.** T4 needs a link, so it carries a **URL button with a dynamic
   suffix**, declared in the template. `wa_client.send_template` builds only a `body`
   component [C lines 75–87] — **a dynamic URL button needs a `button` component it does
   not build**, which is stage-3 work and is named here so nobody plans around it.
3. **No promotional wording anywhere** — no "naya", no "behtar", no invitation. All four
   are UTILITY and must read as account activity.
4. **Language `en`, body in Latin-script Hinglish.** The register is Hinglish written in
   Latin letters [C `odometer_submit`], and `hi` tells a reviewer to expect Devanagari.
   `WA_TEMPLATE_LANG` already defaults to `"en"` [C `sync_server.py:5309`]. *(The
   reviewer-behaviour half of this is my judgement, not something I could verify.)*

### T1 — `gs_enrol_welcome_v1`

**Category: UTILITY.** Language: `en`. Sent once per person, by the enroller's act.

> Namaste {{1}} ji. Yeh number ab Garage Saathi se jud gaya hai.
>
> Hajri ke liye do cheezein bhejein, isi order mein: pehle apna location, phir apna
> photo. Dono aane par hajri darj ho jaegi.
>
> Is number par jawab machine deta hai, koi insaan nahi.

| Variable | Is | Example |
|---|---|---|
| `{{1}}` | the person's first name, from their crew-bank or `users` row | `Ramlal` |

No PIN, no code, no link — `whatsapp-ux.md §3.2`. **Volume:** ~0 steady, ~110 once at
rollout (`§8.3`).

### T2 — `gs_odometer_shift_end_v1`

**Category: UTILITY.** Language: `en`. This replaces the single `WA_PROMPT_TEMPLATE`
whose name is in one env var today [C `sync_server.py:5308`] — one variable becomes four.

> Garage Saathi: bus {{1}} ka aaj ka meter reading nahi aaya. Meter ka ek photo bhej
> dein — bas photo, paas se, saaf dikhe.

| Variable | Is | Example |
|---|---|---|
| `{{1}}` | the bus registration | `MH12 AB 1234` |

The registration and the photo ask, **and nothing else** (UX §8.3). **Volume:** ~20/day.

### T3 — `gs_missed_checkout_v1`

**Category: UTILITY.** Language: `en`. After the shift-end cutoff, once.

> Garage Saathi: {{1}} ji, aapki hajri aaj {{2}} baje lagi thi, par chhutti darj nahi
> hui. Apna location aur apna photo bhejein — din band ho jaega.

| Variable | Is | Example |
|---|---|---|
| `{{1}}` | first name | `Ramlal` |
| `{{2}}` | the check-in time, `HH:MM` | `05:02` |

**Volume:** ~10/day.

### T4 — `gs_week_summary_v1`

**Category: UTILITY.** Language: `en`. Owner only, Monday. **One URL button.**

> Garage Saathi: pichhle hafte {{1}} bus chali, {{2}} card band hue, kharch {{3}}. Poora
> hisaab neeche ke button se dekhein.

| Variable | Is | Example |
|---|---|---|
| `{{1}}` | buses that ran | `38` |
| `{{2}}` | job cards closed | `11` |
| `{{3}}` | the week's spend, with the symbol | `₹4,12,500` |

**Button:** type `URL`, text `Hisaab dekhein` (14), base
`https://<host>/v2/l/`, dynamic suffix `{{1}}` = the signed link token. **Nothing legible
is in the URL** — no name, no registration, no rupee figure (`whatsapp-ux.md §7`).

**The one rejection risk in the four, and what happens then — decided 2026-11-11.** A
weekly summary is account activity, which is why it is UTILITY. It is also the only one of
the four a reviewer could read as a nudge to come back and look at a product, and
marketing is roughly **7× the price**.

> **If T4 is rejected, it is deleted. That is the decision, not a contingency.** Do not
> resubmit it as MARKETING and do not negotiate the wording with a reviewer.

The reason it is settled in advance rather than left to the week it happens: the fallback
costs **one message and needs no approval at all.** The owner sends anything on Monday
morning — free inbound — and gets `wa.owner.glance.text` free-form inside the window for
one message, which is the same one message T4 would have cost. So the entire value at
stake in a resubmission cycle is a push he does not have to remember, and the price of
chasing it is a week of somebody's attention on the least important of the four
templates. **Nobody should spend that week.** T2 and T3 are the templates worth arguing
for; they reach people who are not in a conversation and have no free path.

---

## 11. The states, specified at the same time as the happy path

### 11.1 Loading

**There is no loading message, and `mark_read` is the loading state.** `wa_client.mark_read`
exists and its docstring says exactly this: *"Cheap courtesy: the driver sees their photo
was received while OCR runs"* [C `wa_client.py:91`]. So:

- The blue tick is sent **immediately after the enrolment check** (§11.7) and **before**
  any vision, transcription or intent call.
- **No "ek minute" message.** It costs money and it tells the person something the tick
  already told them.
- A typing indicator is **not available**: `wa_client.py` can send text and templates and
  nothing else [C read in full]. Do not design against one.

### 11.2 Empty

Every pick-list has an empty string, and **the empty string replaces the list rather than
following it**, so an empty state costs the same one message the list would have.

| List | Empty message |
|---|---|
| Mechanic's cards | `wa.jobs.empty` |
| Buses standing in the workshop | `wa.out.empty` |
| Open part requests | `wa.store.req.empty` |
| Recent issues that can come back | `wa.store.return.empty` |
| The owner's glance, all five zero | `wa.owner.glance.clear` |

**An empty state is never a heading with nothing under it.** `whatsapp-ux.md` names the
live defect this prevents — screens that draw every heading and no data, the eight causes
of "everything exists, just no data" (`05 §3` rows 4 and 8).

### 11.3 Failure

Every failure string is in §4–§7 beside its happy path. The shape, from `odometer_submit`:
**what happened · who sorts it out · the one thing to do next.** Three failure classes and
the rule for each:

| Class | Rule | Example |
|---|---|---|
| **Held** — written somewhere, not applied | Say it is held and who will look. **Never "error", never "failed".** | `wa.odo.held.*`, `wa.fuel.odo.held` |
| **Refused** — nothing written | Say nothing was written and what makes it possible | `wa.store.stock.zero` |
| **Raced** — somebody else got there | Name who and when | `wa.store.req.taken`, `wa.out.raced` |

### 11.4 Too much data

| Situation | What happens |
|---|---|
| More than 9 rows for a pick-list | 9 rows, oldest or longest-standing first, **plus row 10 = the `link.*` row for the full screen** (§2.4) |
| More than 10 people match one number | **Silence, and one line on the owner's row** (§13.2). `whatsapp-ux.md §3.1`: a number matching more than ten people is not a person's phone, it is a mistake |
| A fleet-wide ask from the tapping path | **A bus is never picked from a list in chat** (UX §4). Derived from the person, or from a short context list, or spoken |
| More than 3 AI candidates | **The link, not a fourth button** (§8.5) |

### 11.5 One item

**A pick-list with exactly one row is replaced by the next step's message, with the item
named in the body.** It saves a message in two flows (§9) and it is only safe because the
next step is itself a choice — the three mechanic buttons, or a proposal with a confirm —
so **nothing is committed by the saving.**

**Three exceptions, and each has a reason:**

1. **`wa.identity.pick`** — a single match is not a pick. The flow proceeds silently.
2. **The 9-row category list** — fixed rows; "one item" cannot arise.
3. **`wa.store.card.ask` with one open card** — the card is named in the proposal body
   and still confirmed by a tap, because the bug this guards against ([E] d738a6e) was a
   pre-selected card, and a *named* single card is not a pre-selection.

### 11.6 Stale and expired taps

| id | Copy |
|---|---|
| `wa.sys.stale.tap` | *"Yeh sawaal purana ho gaya. Dobara bhejein, ya neeche se chunein."* |

Sent when a tap arrives carrying an id whose proposal has expired (30 minutes, silently,
writing nothing — `whatsapp-ux.md §11`), whose record is gone, or whose id was retired
(§1.3 rule 7). **A proposal nobody taps writes nothing and gets no message.** Only a *tap*
on a dead id gets this, because a tap is a person waiting for an answer.

### 11.7 Silence — the state with nothing in it

**`DECISIONS.md §25.2`: an unenrolled number gets no reply at all.** Specified as a state
because it has to be built, not merely omitted:

| id | Contains |
|---|---|
| `wa.state.silence` | **Nothing. Zero bytes outbound.** |

Four things in it, each of which can be got wrong independently:

1. **No message of any kind.** Not a one-liner, not a template, not an apology.
2. **No read receipt.** `_wa_handle` calls `mark_read` at **`sync_server.py:5393`**, two
   lines after `_wa_note_inbound` and **before it knows who the sender is** [C read; the
   UX doc cites 5390 and `DECISIONS.md §25.2` cites 5392 — **the line is 5393 in the file
   today** and the ±3 is a drift in the citation, not in the behaviour]. **A blue tick is
   a reply.** The call moves after the enrolment check, which also makes it the loading
   state for everybody who *is* enrolled (§11.1).
3. **The webhook still answers `200`.** Meta retries any non-200 [C the route's comment,
   `sync_server.py:6327-6330`]. Silence is "we sent nothing", never "we failed the delivery".
4. **`_wa_note_inbound` still runs**, for every sender, enrolled or not
   [C `sync_server.py:5391`]. It is the only record that the message happened and it is
   what §13.2 counts.

**Three cases resolve to silence**, and each must be reached by a different check so the
owner's row can tell them apart (§13.2). The fourth used to and no longer does:

| Case | Owner sees |
|---|---|
| The number matches nobody | "unknown number" |
| The number matches only people who have left | "a number that belonged to somebody who left" — a different problem with a different fix |
| The number matches more than 10 active people | "a number that looks wrong" |
| ~~The number belongs to an enrolled **`office`** role~~ | **Not a silence case any more.** It gets `wa.office.nosurface`, one line — §3.4. An enrolled colleague is not a stranger |

**What this costs, said once more because it is the only sentence being deleted:** today
an unenrolled number gets *"Yeh number kisi bus se linked nahi hai. Office se apna number
register karwayein."* [C `:5555`] — which tells a driver with a new SIM exactly what to
do. It is removed on the owner's instruction (`DECISIONS.md §25.2`, UX Q10). **The person
who pays is a crew member whose number changed, who sends his meter photo for a week and
is answered by nothing.** §13 is the only mitigation and it does nothing for him until
somebody reads it.

### 11.8 Offline

The person's phone queues the message and WhatsApp sends it when there is signal; the bot
never sees it until then.

- **The record takes the message's own timestamp**, which `normalize_message` already
  keeps [C `wa_client.py:159`] — not the receipt time. The server already stamps
  `atUnverified:true` when `at` is more than 10 minutes before receipt and replaces an
  `at` more than 5 minutes in the future with server time (`03 §3.7`). **Reuse that; do
  not invent a second concept.**
- **The receipt must print the time the record holds, not the time he is reading it.**
  Every `{time}` placeholder in §5 is the record's time. A driver who checked in at 05:02
  and reads *"07:30 baje"* at 07:30 will send it again, and will be right to.

### 11.9 No permission

- **The root menu carries only rows this person's role can complete.** No greyed row, no
  row that ends in "you cannot do this" (`whatsapp-ux.md §6.1`).
- **A spoken intent the role cannot perform gets `wa.ai.forbidden`, which is byte-for-byte
  `wa.ai.none`** (§8.4).
- **Every chat flow declares a capability**, as on the web (`DECISIONS.md §3`). The table
  is `whatsapp-ux.md §6.1` and this document does not restate it.

---

## 12. Interaction, as it exists on this surface

### 12.1 Per control

| Control | What it does | "Pressed" | "Disabled" | While working |
|---|---|---|---|---|
| **List row** | Sends `{id, title}` back; the bot routes on `id` | WhatsApp's own; we cannot style it | **There is no disabled state.** A row that cannot be acted on is not in the list | the blue tick, then the next message |
| **Reply button** | Same | WhatsApp's own | Same — a button that cannot act is not sent | same |
| **Location-request button** | Opens WhatsApp's own location picker | WhatsApp's own | n/a | `wa.att.need.photo` once the location lands |
| **A URL in a message** | Opens the browser | WhatsApp's own | n/a | the page (§13.1 if the link is dead) |
| **A tapped row whose record has gone** | `wa.sys.stale.tap` | — | — | — |

**The one piece of feedback we control is the read receipt, and it is load-bearing.** On a
slow path — a vision call on a dusty instrument cluster, a transcription — the gap between
the tap and the receipt can be seconds. A control that gives no feedback reads as broken,
and on this surface the tick is the only feedback there is. **It is sent after the
enrolment check and before the first model call** (§11.1, §11.7).

**An old list stays tappable in the thread.** `whatsapp-ux.md §11` records this as UNKNOWN
and worth money, and I could not determine it either — `wa_client.py` has no interactive
sender to read [C]. **This spec does not depend on the answer:** every id that commits
carries a server-minted proposal id (§1.3 rule 5), so a tap on a week-old message is
detected and answered with `wa.sys.stale.tap` rather than writing. If the answer comes
back "yes, re-tappable", the saving is a separate change and a happy one.

### 12.2 Motion

**None. There is no animation anywhere in this specification**, and that is a finding
rather than an omission:

- **The chat has no motion we control.** WhatsApp animates its own bubbles.
- **The expired-link page (§13.1) has no animation at all.** Nothing on it moves, because
  nothing on it can be interacted with and there is nothing to signal. An animation whose
  purpose cannot be named is deleted.
- **The new Attention row (§13.2) inherits exactly one transition and one press**, from
  `components.css`: `transform 120ms ease-out, opacity 120ms ease-out` and
  `transform: scale(0.97)` on `:active` [C `v2/ui/components.css:129–141`]. **The builder
  adds nothing.** It is the press feedback every row in the app already has, it animates
  `transform` only, and it triggers no layout.

---

## 13. The two web pieces that do not exist yet

Everything else a link opens is one of the thirteen screens in `v2-ux.md §4.1`, deep into
one state (`whatsapp-ux.md §6.2`, fourteen links, five phone-only, nine on the floor).
**No new screen and no new token for any of them.** Two things are genuinely new.

### 13.1 The expired-link page — **link · floor**

An expired link is as likely to be tapped at the office desk as at the gate, so
**Chrome 109 on Windows 7, Core 2 Duo** (`whatsapp-ux.md §9.2`).

**Where it lives.** `v2/link-expired.html`, inside `v2/`, so it reads `ui/tokens.css` and
`ui/components.css` through the existing `<base href="/v2/">` pattern [C `v2/index.html`]
and reaches outside `/v2/` for nothing — which is what `scripts/check-v2-isolation.sh`
checks. **It must not register the service worker, and it must not be added to `sw.js`'s
precache list** (`test_v2_boot.js` compares that list [C the isolation script's comments]):
a cached copy of an expiry page is nonsense, and the page must always come from the server.

**Served with:** `200`, `Cache-Control: no-store`, `X-Robots-Tag: noindex`. **Not `403`** —
`whatsapp-ux.md §7` refuses a raw error page, and a 403 is also the status a hosting layer
is most likely to replace with its own. The server still records the failed verify, because
§12 measure 10 (expired taps as a share) cannot be read otherwise.

**Structure — phone width first (360px), then desk.**

| | Phone | Desk (≥1024px) |
|---|---|---|
| Root | `<html lang="en" data-v2 data-density="yard">` | same document; `data-density` stays `yard` — **there is one element and a 48px target is right on both** |
| Wrapper | `<main>` with `padding: var(--pad)`, `min-height: 100vh`, centred | `max-width: var(--read-w)`, `margin: 0 auto` |
| Block | `<div class="state" role="status">` — the existing component [C `components.css:508`] | same |

**Contents, in order, with the token for each:**

| Element | Markup | Tokens |
|---|---|---|
| Mark | inline SVG, `icons.js` `clock` at 32px | colour `var(--ink-dim)` via `.state > svg` |
| Line 1 | `<p class="state-text">` | `--t4`, weight 600, `--lh`, `var(--ink)` |
| Line 2 | `<p class="state-hint">` | `--t6`, `var(--ink-dim)`, `--lh` |
| Line 3 | `<p class="state-hint">` | same |
| Page background / text | `body { background: var(--surface); color: var(--ink); font-family: var(--font); }` | the only three declarations the page adds beyond the two stylesheets |

**Copy, final. Two languages on one page, and here is why:** the token is invalid, so
**there is no person and the page cannot know which language to use.** Both, always.

- Line 1: *"Yeh link purana ho gaya."*
- Line 2: *"WhatsApp par chat kholein aur phir se bhejein — naya link mil jayega."*
- Line 3: *"This link has expired. Open the WhatsApp chat and ask again."*

**What is NOT on the page, and each one is deliberate:**

| Absent | Why |
|---|---|
| **A login form or a PIN field** | `whatsapp-ux.md §7`: a person who taps an expired link and then types their PIN into whatever it opened has been taught the whole of phishing |
| **A "retry" or "get a new link" button** | There is nothing it could do. A new link is minted in the chat, by the bot, for the person the chat knows. A button that cannot work is worse than no button |
| **Any JavaScript** | Zero scripts. On a Core 2 Duo this page is a parse and a paint |
| **The name of the screen or record the link was for** | The URL carries nothing legible and neither does the page (`whatsapp-ux.md §7`) |
| **Any emoji** | CLAUDE.md; and Windows 7 draws grey boxes |
| **A webfont** | `--font` is the system stack; a 60KB font for 24 words on a Core 2 Duo is not a trade |
| **Any animation** | §12.2 |

**Floor check:** `oklch()`, `color-mix()`, nesting, `@starting-style`, view transitions,
`subgrid`, `text-wrap: balance` — **none used.** Every colour is a token from
`tokens.css`, which is hand-tuned HSL [C read in full]. The page adds **no new token**.
`scripts/check-css-floor.sh` scans `v2/` by default [C `check-floor.py` docstring] so this
file is inside its default path and will be checked without a flag.

**Row budget:** not applicable — one element. **Dark mode:** free, from
`tokens.css`'s `prefers-color-scheme` block, with `data-theme` absent so the OS decides
(there is no person and therefore no stored preference).

### 13.2 The owner's unknown-numbers row and list — **link · floor**

`whatsapp-ux.md §3.4`: silence with no visibility is a support problem, and the
instrument already exists — `_wa_note_inbound` writes a `waconv` row for **every** sender
[C `sync_server.py:5391`] and nothing reads it.

**Two new Attention row kinds, numbered after the nine in `screens-shell.md §3.2`** and
built to that table's exact shape (`a.v2row.v2row-why`; `.lead` = mark, `.t` = the thing,
`.sub` = the reason wrapped to two lines and never truncated, `.act` = `figure()` only):

| # | Row kind | Capability | Identity rule | Mark | Colour | Band | `.t` | `.sub` | `.act` | Goes to |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | Unknown numbers have messaged | `manageDrivers` | none | `person` | `--warn` | **4** | "3 unknown numbers" | "They sent 11 messages in the last 7 days. None of them is enrolled." | `figure(3)` | **People (#8)**, the Unknown numbers list |
| 11 | A number that belonged to somebody who left | `manageDrivers` | none | `person` | `--warn` | **4** | "Ramlal's old number messaged" | "He left on 3 October. The number has sent 4 messages in the last 7 days. Somebody else may be holding it." | `figure(4)` | **People (#8)**, that number |

- **Band 4** ("work waiting on a person"), basis **hours since it became true,
  descending**, which is band 4's own basis [C `screens-shell.md §3.3`]. **No new band and
  no new basis** — the comparator does not learn a case.
- **Two kinds and not one**, because `whatsapp-ux.md §3.4` is explicit that a departed
  person's number is a different problem with a different fix, and because kind 11 names a
  person while kind 10 cannot.
- **English `.t` and `.sub`**, like all nine existing kinds, with the Hindi registered in
  `W.register` per screen — **this is the app's i18n system and it is not `wa_copy.py`**
  (§0.1). The two registers never meet: no string is shared between a chat message and a
  screen.
- **Capability `manageDrivers`** — the narrowest existing capability that can act on the
  row by enrolling somebody (`whatsapp-ux.md §3.4`).

**The count must be able to reach zero, and that is a requirement, not a nicety.**
`screens-shell.md §3.2` bans any count that can never reach zero — it is the app teaching
its user to scroll past red. A stranger's wrong number will never be enrolled, so without
a second action the count never falls. **So the list has two actions per row and the
Attention rows count only numbers that are neither enrolled nor set aside.** This was left
open by stage 1; I decided it (§15 item 5), and whether a set-aside number ever comes
back is the one question left with the owner (§15).

**The list, on People (#8).** A new section, **not a new screen** — People is where
enrolment happens (`whatsapp-ux.md §3.2`) and the only action here is to enrol.

| | Phone | Desk |
|---|---|---|
| Container | the existing People list region | `data-density="desk"` as the rest of the screen |
| Row | `div.v2row` (not a link — the actions are on the row) | same, `--row-h` 32px |
| `.t` | the number, in full: `98765 43210` | same |
| `.sub` | "First messaged Monday 05:12. 11 messages." | same |
| `.act` | two `.btn` — `.btn-primary` "Enrol" and `.btn-quiet` "Set aside" | same |

- **The full number is shown, unmasked**, because the only thing anybody can do with this
  row is work out who it is and call them.
- **Never the content of the message and never the media.** `waconv` is
  `SERVER_INGEST_ONLY` and readable by nobody on a device (`v2-contract.md` ~line 307),
  and **that scope must not be widened to build this** — the count and the times are
  derived on the server (`whatsapp-ux.md §11`).
- **"Set aside" is reversible**, from a `.tabs` filter on the same section ("Waiting" /
  "Set aside"), because a number set aside by mistake must come back without a database
  write by hand.
- **Capped at 200 rows with a stated remainder**, the same rule as Attention
  [C `screens-shell.md §3.4`]. A week of strangers will not reach it; the cap is there so
  a wrong-number robocaller cannot make the screen the slowest thing in the office.
- **Row budget:** rows are plain `.v2row`, which is bed 1 in `v2/ui/gallery.html`'s
  measurement, not the taller `v2row-why` — so this section is **inside the measured desk
  budget by construction** and adds no new shape to measure. **I did not take a reading;
  the claim is "no new shape", not "I measured it".**
- **Tokens used:** `--surface`, `--surface-raised`, `--line`, `--ink`, `--ink-dim`,
  `--warn`, `--accent`, `--accent-ink`, `--accent-text`, `--s2`, `--s3`, `--pad`, `--tap`,
  `--row-h`, `--t4`, `--t5`, `--t6`, `--lh`, `--font`. **No new token.** The only radius
  and shadow in play are `.btn`'s existing `border-radius: 8px` and `box-shadow: none`
  [C `components.css:144–166`], which are the component's, not this section's.

---

## 14. What a builder must not change, and what they may

### Must not change

1. **Any `{id}` in §2.** They are the routing table. Changing one is a flow that stops
   working for everybody holding an old message.
2. **The rule that routing reads `id` and never `title`.** This is the whole point of the
   document and the fix for `wa_client.py:172`.
3. **The ten live odometer strings in §4**, character for character. They work and crews
   see them today.
4. **Any label marked `AT CAP`**, without re-counting.
5. **`wa.ai.forbidden` being byte-for-byte `wa.ai.none`** — and **this one is a check
   stage 3 must add, not a note it must respect.**
   **Why:** a distinct message — *"iske liye aapko permission nahi hai"* — tells a driver
   that a money flow **exists and is reachable from his handset**. That is
   deny-by-default leaking through the copy instead of through the router, and the copy is
   the one layer nobody reviews for permissions. `02 §0` records that the read side has
   leaked six times by defaulting the other way; this is the same defect with a friendlier
   face. An intent a role cannot perform must be indistinguishable from an intent nobody
   understood (`whatsapp-ux.md §4.4` step 2).
   **The check:** a unit test asserting `COPY["wa.ai.forbidden"] == COPY["wa.ai.none"]`,
   plus a routing test asserting that a forbidden intent and an unroutable one produce the
   **same outbound payload byte for byte** — the same body, the same rows, the same footer.
   Then break it (change one word of `wa.ai.forbidden`) and confirm both go red, per
   CLAUDE.md: a check that cannot fail is decoration.
6. **The read receipt moving after the enrolment check** (§11.7, `DECISIONS.md §25.2`).
7. **The four template categories and the no-URL-in-body rule** (§10).
8. **"An explanatory line never gets its own message"** (§8.4). It is three messages a day
   and it is also the difference between a limit that reads as a limit and one that reads
   as a breakage.
9. **The counts in §9.** A new message in a flow needs a line in that table saying what it
   earned.
10. **No emoji, anywhere, in any string.** CLAUDE.md, and the office machines.
11. **`wa.office.nosurface` existing at all** (§3.4). It is one line against silence to a
    colleague, and it resolves UX §10.2 against `DECISIONS.md §25.8` in §25's favour.
12. **Indian grouping in new copy** (§0.3), and **the ten inherited strings staying
    western**. Do not "harmonise" either half on your own: the first is decided, the second
    is an app-wide task with its own citation (§16).

### May change

1. **Any Hinglish wording not marked `AT CAP`** — provided the id stays, the character
   count is re-run, and the six register rules in §0.2 still hold. **This is expected.**
   The register will be revised by somebody who speaks it better than this document does.
2. **Row order inside a root menu**, if use shows a different order is faster. Ids do not
   move.
3. **The descriptions in §2**, freely, within 72 characters.
4. **The 7-day window on the return list and on the unknown-numbers count**, which are my
   numbers and not measured.
5. **The `clock` icon on the expired-link page**, for any other `icons.js` mark. It is
   decoration; the words are the state.

---

## 15. Decisions taken since drafting, and the one left with the owner

Five questions the copy work reached that stage 1 did not ask. **Four were decided on
2026-11-11 and are applied above.** One is the owner's and is deliberately not chosen
here.

### Decided, and where each landed in this document

| | Question | Decision | Applied in |
|---|---|---|---|
| 1 | If Meta rejects T4 (Monday summary) as marketing, delete or resubmit? | **Delete. The fallback is the decision, not a contingency** — the free-form Monday path costs the same one message and needs no approval, so a resubmission cycle can only spend a week on the least important of the four | §10, T4 |
| 2 | The conductor's coaching label | **Keep the UX doc's full wording.** `Meri rating aur coaching` is exactly 24 against a 24-char cap, so it fits and ships `AT CAP`. My first draft shortened it to `Meri rating` and that was over-cautious — it was the one change that lost a meaning rather than trimming one | §1.4, §2.1, §2.2 |
| 3 | An enrolled `office` number: silence or one line? | **One line.** `wa.office.nosurface`. Silence to a stranger is `§25.2` and deliberate; silence to a colleague somebody went and enrolled is a different act, and `§25.8` settles it — fall back with one line, never to silence. **UX §10.2 is the side that was wrong** | §3.4, §11.7 |
| 4 | Thousands separators | **All new copy groups Indian; the ten inherited strings stay as they are.** The app-wide helper is its own task and not a copy fix | §0.3, §16 |
| 5 | "Set aside" on an unknown number | **`manageDrivers` may set aside; reversible from a filter on the same list; non-expiring.** Non-expiring is the conservative default because nothing silently disappears | §13.2 |

**The second pass the label decision forced, and what it turned up.** Re-reading all eight
over-cap labels against "an at-cap label is shippable" changed three of them, not one:
`Poora store, app kholein` and `Gate round, aaj ki buses` both fit at exactly 24 **by
trading an em dash for a comma**, which is punctuation and not wording — so neither needs
to lose *"app kholein"* or *"aaj ki buses"* to a description. **Three labels now carry the
UX doc's full wording that the first draft paraphrased.** Four labels in total ship
`AT CAP`. The three that still lose a word genuinely exceed 24, and one —
`Dhyaan dene wali cheezein` — exceeds by exactly 1 with no punctuation to trade, where I
chose a clear short form with headroom over a paraphrase sitting at the cap. §1.4 shows
the arithmetic for all eight.

### Left with the owner

**Does a set-aside unknown number ever come back?** Non-expiring ships (item 5 above). The
alternative — it expires after 30 days and the number reappears on Attention — is
defensible: a number set aside in March may be a new crew member's in June, and a row that
never returns is a row somebody has to remember. It is a **retention-shaped** decision,
and CLAUDE.md puts retention and permission policy with the owner. **The reason the action
exists at all is not in question** and must not be removed while this is open:
`screens-shell.md §3.2` forbids any count that can never reach zero — "the app teaching
its user to scroll past red" — and a stranger's wrong number will never be enrolled, so
without set-aside the unknown-numbers count never falls (§13.2).

---

## 16. Status

### What this document contains, counted

| | Count |
|---|---|
| Copy string ids in `wa_copy.py` | **90** |
| Of those, **messages a person can receive** | **84** (the 81 free-form and list/button messages plus T2, T3 and T4; T1 is `wa.enrol.welcome` and is already in the 81) |
| Not messages, and why | **9** — 4 appended clauses (`wa.att.clause.*`, `wa.att.habit.first`), 1 appended note (`wa.ai.multi`), 1 internal English string never sent to a person (`wa.odo.dry`), 1 state with zero bytes (`wa.state.silence`), 1 deleted (`wa.odo.enrol`), 1 retired (`wa.fallback.menu`) |
| Strings reused unchanged from live code | **10** (§4) |
| Interactive ids | **54**, of which 11 are dynamic families |
| Lists specified | **13** (6 root menus, 6 pick-lists, 1 fixed 9-row category list) |
| Reply-button sets specified | **11**, every one checked for a duplicate title (§2.6) |
| Row titles over the 24-char cap in the UX doc | **6**, resolved in §1.4 — three keep the full wording at exactly 24, three lose one word each |
| Plus one title that fits but breaks on a two-digit count | **1** (`Sign-off chahiye — N card`), resolved by the count rule (§1.2) |
| Labels at exactly their cap, marked `AT CAP` | **4** — `Meri rating aur coaching` (24), `Poora store, app kholein` (24), `Gate round, aaj ki buses` (24), `Nahi, doosri kharabi` (20) |
| Meta templates | **4**, all UTILITY, language `en` |
| New web pages | **1** (`v2/link-expired.html`) |
| New Attention row kinds | **2** (#10, #11) |
| New design tokens | **0** |
| Animations specified | **0** (§12.2) |

### Two transport gaps this spec creates — both build-blocking

**Neither is a defect in existing code and both are easy to miss, because each is one line
of a file that otherwise works.** They belong beside the thirteen blockers in
`whatsapp-ux.md §15` rather than inside prose here.

| | Gap | Read from | Consequence if missed |
|---|---|---|---|
| **A** | **`wa_client.send_template` builds a `body` component and nothing else.** It appends one `{"type": "body", "parameters": [...]}` and sends; there is no `button` component anywhere in the function | [C `wa_client.py:75–87`, read in full] | **T4's declared URL button has no sender.** The template is approved by Meta, the send succeeds, and the owner gets a weekly summary with no way to open it. It will look like a page problem, not a payload problem |
| **B** | **`WA_PROMPT_TEMPLATE` is one environment variable holding one template name**, with `WA_TEMPLATE_LANG` beside it | [C `sync_server.py:5308–5309`] | **§10 needs four distinct templates with four different bodies.** Today every out-of-window send — whatever it is about — would go out as the shift-end odometer prompt. `wa_send` falls back to `WA_PROMPT_TEMPLATE` for *any* message outside the window [C `sync_server.py:5328`], so a missed-checkout nudge would arrive asking for a meter photo |

**And one task that is not this surface's, named so it is not lost:** the app-wide figure
helper for Indian digit grouping. `{:,}` at `sync_server.py:5590` prints `245,118`;
`₹4,12,500` is how this country reads money. New WhatsApp copy groups Indian (§0.3) and
the ten inherited strings do not, so **the surface ships with a visible inconsistency it
inherited.** Fixing it properly touches every rupee and kilometre figure in the app and
means editing ten strings crews read today — a change to the app, not to this surface.

### Status

**ok = true.** Every message the bot can send is written out; every interactive element
has a stable English id separate from its Hinglish title; every label is counted against
its cap and the seven that did not fit are resolved in §1.4 rather than truncated, with
four shipping at exactly their cap and marked; the
four templates are submission-ready with categories and numbered variables; the per-flow
message counts are carried forward with every change named; silence is a built state
including the read receipt; and the two web pieces that do not exist yet are specified
inside the Chrome 109 floor with no new token.

**Three things in here most likely to be wrong**, in the order I would check them:

1. **The register.** Every string is written against the voice of `odometer_submit`, which
   is one function by one author. Ten of these strings are live and the other ninety-odd
   are not, and the only test that matters is a storekeeper and a driver reading them
   aloud. **The ids are built so that failing this test costs nothing** — rewrite the
   Hinglish, keep the id, re-count the label.
2. **T4's category.** UTILITY is the right reading of a weekly account summary and it is a
   reading, not a fact. §10's fallback is now the decision rather than a hedge, so being
   wrong here costs a deletion and not a delay.
3. **The one-item rule (§11.5) saving a message.** It is correct that nothing commits
   without a tap. It is a guess that a mechanic with one card prefers the three buttons to
   a one-row list he can see the registration in.

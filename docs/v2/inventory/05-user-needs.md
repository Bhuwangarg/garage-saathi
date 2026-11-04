# 05 - What the people who use this app actually need

Written 2026-11-04 from documents and git history only. No code was read, no app was run, no user was
interviewed. Every claim below carries one of these labels:

- **[E] evidence** - a commit message, a doc, or a manual passage states it.
- **[D] doc implies** - a document is written in a way that only makes sense if it is true.
- **[I] inference** - I worked it out. Treat as a question, not a finding.

Confidence on a friction means: HIGH = a user complaint or a commit message states it; MEDIUM = a doc
implies it; LOW = I inferred it.

## 0. Read this first: how much each source can be trusted

| Source | What it really is | Weight |
|---|---|---|
| `git log` bodies | Written by the person fixing the bug, often quoting what the owner or the floor reported. Several are self-corrections ("it was my own measurement"). | Strongest. Still second-hand: the reporter is rarely named. |
| `TRAINING_MANUAL.html` | What staff were told. Last substantive edits 9-16 Sep 2026. Has **no chapter** for the office role, the gate check, redBus reviews, coaching notes or conversations (grep: zero hits). | Good for "what needed teaching". Stale for anything after mid-September. |
| `USECASE_REVIEW.md` | **Not user research.** 76 suggestions produced by reading `app.js` when it was ~1,900 lines (today 14,184), five roles, one Jaipur garage assumed. Every "User need" line is a reviewer's imagined persona. | Weakest as evidence of need. Useful as a list of hypotheses. Many are already shipped (section 8). |
| `ROLES.md`, `FEATURES.md`, `README.md` | Five-role era. Describe intent, not use. | Context only. |
| `CREW_BANK.md`, `GO_LIVE.md`, `LAUNCH_CHECKLIST.md`, `MOBILE.md` | Rollout record. GO_LIVE's "Still open" list is real evidence of known gaps. | Good. |
| v2 design spec, `DECISIONS.md` | The direction, not the need. | Constraint, not evidence. |

The caller said about 100 people use the app daily. I could not find a document that says **who** those
100 are. The app has a Usage and adoption report (commit 6369307, owner and supervisor only) that answers
this exactly; I have not seen its output. Reading it would replace most of my [I] frequency guesses below.

## 1. Who is actually in the building (headcounts and devices)

| Role | How many | Source |
|---|---|---|
| Owner | 1 | [D] |
| Supervisor | 2, on alternate shifts (the manual names them) | [E] manual Part 5 |
| Crew manager | probably 1 - five accounts exist under one first name, all crew manager | [E] commit 0145007; one person is [I] |
| Storekeeper | 1 is [I] - only a seeded identity is documented | [I] |
| Mechanic | 3 seeded identities; real number unknown | [I] |
| Driver | **54 / 107 / 108 / 110 - sources disagree** (see section 6) | |
| Conductor | 56-57 | [E] commits 22eca75, 2e59010 |
| Office | unknown; "one office person" is asked to test a sign-in in the spec | [I] |
| Fleet | about 100 buses (89 early, 92-103 later) | [E] |

Devices:
- **Office desk PCs: Windows 7, Chrome 109, some Core 2 Duo.** [E] spec section 2 and `DECISIONS.md`. Not yet measured: the device check sent on 1 Nov is outstanding.
- **Owner: a MacBook and an iPhone.** [D] The owner's report that the slowness is "on MacBook also and iPhone too" (commit 3b1e7e8) is the single most important sentence in the log: it ruled out "old hardware" as the whole story. The speaker is not named; that it is the owner is [I].
- **Office Mac** exists (the owner-PIN recovery procedure runs on it). [E] manual Part 7.
- **Crew phones: old Android, versions unmeasured.** [E] `DECISIONS.md`. Cheap-phone storage fills and evicts the database ([E] commits 8eb73dc, 5d125d2).
- Phones were first given an installed APK that froze at build time and went five weeks stale without any sign ([E] commit 241af2c); everyone is meant to be on the web app now.

## 2. Per role

Frequencies are [I] unless marked. The manual's "daily routine" lines are [D].

### 2.1 Owner
- **Who:** runs Mahalaxmi; the person who decides, signs off, and pays. One person.
- **Where:** office or on the move; first thing in the morning is when the login hurts most ([E] 6fa0a6d: worst "first thing in the morning").
- **Device:** phone and MacBook/iPhone, plus the office Mac for recovery.
- **Trying to finish:** know in five minutes whether today is under control. The manual states the routine as open Today, clear "Needs you now", verify jobs someone else closed, look at what is standing in the workshop, glance at the money number [D].
- **Jobs, most to least frequent:**
  1. Morning glance: 30-day cost with trend, what is owed to suppliers.
  2. Sign off work other people closed (the owner never signs off their own closes).
  3. Decide on flags only the owner can settle: unexplained stock changes, pilferage radar, challans, expired documents.
  4. Look at what is standing in the workshop and for how long.
  5. Rare admin: new staff login, New PIN for someone, garage settings, delete a mistaken job card, move a verified job to the right bus. Owner-only items.
  6. Weekly: the Monday summary Claude writes (shipped 18 Oct, [E] 50a8afd).
- **The moment:** 6.40am, phone in one hand, typed the fourth digit, and the screen waits. For owner, supervisor and crew manager the PIN is not stored on the phone, so that one request *is* the login and it can take 30-36 seconds on a cold server ([E] 6fa0a6d).

### 2.2 Supervisor (2 people)
- **Who:** runs the floor. Since 9 Sep the supervisor also *keeps the job card on behalf of the mechanics* ([E] 927864c).
- **Where:** on the workshop floor, and at the office desk where "the supervisor now does all of this" ([E] 927864c). Interrupted by calls ([E] d738a6e: a part issued "while on a call").
- **Device:** phone on the floor, desk PC for card entry ([D] the desktop table layout was built for him: thirty cards on screen).
- **Trying to finish:** every bus in the yard is moving, nothing stands idle, no work leaves without paper and photos.
- **Jobs, most to least frequent:**
  1. See what is in the workshop now: oldest first, how long, started or not ([E] 000c3dd).
  2. Open or keep a job card; fill the four workshop times ([E] 927864c; the manual allows paper at 6pm, typed next morning).
  3. Assign or reassign a mechanic ([D] manual: "a job with nobody on it does not get done").
  4. Issue a part against a card, or have the storekeeper do it.
  5. Take before / after / returned-old-part photos and close the card.
  6. Gate check holds: go or hold, always with a reason ([E] GATE_CHECK.md).
  7. Send work outside on a printed gate pass; check it back in by serial number ([E] 2b35e74).
  8. Documents expiring, services due, driver complaints to turn into cards.

### 2.3 Crew manager (probably 1 person)
- **Who:** runs the daily duty board - which driver and conductor is on which bus.
- **Where:** at a desk with the board, and "usually the one standing at the pump and at the tyre shop" ([D] 2e5c4cd, the commit's own assumption).
- **Device:** a phone; a laptop for creating logins ([E] 670dd25).
- **Trying to finish:** every bus that runs tonight has a driver and a conductor.
- **Jobs:**
  1. Fill and change duty-board seats (each bus has Driver 1, Driver 2, Conductor).
  2. At the pump / tyre shop: log diesel (pump and place), AdBlue, tyres, batteries ([E] 2e5c4cd).
  3. Crew bank: new joiner, leaver, documents, duplicate check ([E] CREW_BANK.md).
  4. Approve each crew member's weekly coaching note, shipped 18 Oct ([E] 731a14a).
  5. Confirm which crew member a typed redBus driver name is ([E] c66a79a).
  6. Look up "who was on bus X on date Y" ([E] 35027b0).

### 2.4 Storekeeper
- **Who:** guards a catalogue of about 2,400 parts; the app's anti-pilferage rules are aimed at this desk.
- **Where:** at the parts counter, with a mechanic or supervisor waiting.
- **Device:** phone or tablet [I].
- **Trying to finish:** hand out a part against a job card without the count drifting, record what arrived, and never be the person blamed for a shortage.
- **Jobs:**
  1. Issue a part against a job card (cannot issue without one; [E] manual and 2299533).
  2. Fulfil part requests raised from inside a job card.
  3. Receive stock and record the supplier bill (photographed bill read by Claude since 18 Oct, [E] c896478).
  4. Work the reorder list.
  5. Count the shelf against the book (Store health).
  6. Diesel, AdBlue and tyre entries - the storekeeper already had these ([E] 2e5c4cd).

### 2.5 Mechanic
- **Who:** does the repair. Was taken off the login screen on 9 Sep because "mechanics never wanted the paperwork" ([E] 927864c), then given a login back on 11 Sep, read-only, to see their own work ([E] 38e1914).
- **Where:** "inside the workshop, under a bus, on the highway" with no signal ([D] manual Part 1); hands dirty [I].
- **Device:** a phone, own or shared [I].
- **Trying to finish:** know which bus is next and what is wrong with it; get the work signed as theirs.
- **Jobs, as the manual describes them today:**
  1. Open the app to see my jobs, most urgent first, with the bus, the fault, the time in, started or not.
  2. Check in and out.
  3. Look a part up in the store before asking for it.
  4. See my score and the leaderboard.
  5. **Not in the app:** telling the supervisor the work is done. The manual says to tell them; there is no button ([D] manual Mechanic chapter).

### 2.6 Driver
- **Who:** about 54 drivers; the person passengers rate.
- **Where:** at the bus before departure (night departures, a 20:00 check still counts at 02:00 - [E] GATE_CHECK.md); on the road.
- **Device:** old Android, Hindi-first [I from the Hindi toggle, the voice option, and the Hindi-only lockout wording in 3a0f0c2].
- **Trying to finish:** leave on time without a gate hold; get the trip's cash right; get the bus's fault looked at.
- **Jobs:**
  1. Attendance in and out (selfie plus location).
  2. Gate check at the bus: live selfie, ten items, three need photos, hold 1.5s to release ([E] 8a8cde5).
  3. Trip cash: start trip, add each expense as it happens, end trip ([D] manual).
  4. Report a problem on the bus, by area, by voice or photo ([D] manual).
  5. See own rating and own redBus reviews ([E] e8da386), and own coaching note.
  6. Own documents (licence expiry matters most).
- **Standing caveat:** the manual says driver logins are "being withdrawn" (section 6, contradiction C2). Everything above assumes they sign in.

### 2.7 Conductor
- **Who:** about 56 conductors; ride the bus, face the passenger.
- **Where:** on the bus, at the gate.
- **Device:** old Android [I].
- **Trying to finish:** know which bus and route today and who the driver is.
- **Jobs:**
  1. Attendance in and out.
  2. See my bus, route, paired driver, and a tap-to-call number ([D] manual).
  3. See my own reviews and weekly coaching note ([E] e8da386, 8861828: a conductor's page shows reviews, not bus GPS events).
  4. Own documents (Aadhaar and photo are mandatory; no licence demanded).
  - Only a driver starts a gate check ([E] GATE_CHECK.md), so the conductor has no departure job. [I] This is the thinnest role in the app.

### 2.8 Office
- **Who:** a desk role added 23 Oct that can read crew performance and "change nothing" ([E] 2c72951). Note the word "office" is also used loosely for the human office staff (owner, supervisor, crew manager) throughout the commits; I have kept them apart.
- **Where:** at a desk, Windows 7 [E] spec.
- **Device:** desk PC.
- **Trying to finish:** find which crew member needs "a word this week" (worst score first on purpose, [E] 2c72951), with the passenger reviews behind it.
- **Jobs:**
  1. Open the scoreboard, worst first; crew with fewer than ten rated trips listed apart.
  2. Read the passenger reviews and Claude's reading of whose fault each was ([E] db6101f).
  3. Record that a conversation happened (append-only, with the score as it stood that day) ([E] 4a42e38).
- **Gap:** the office role has no manual chapter and its screen drew no reviews at all until 1 Nov because the server never sent them ([E] db6101f). It has been in the hands of staff for a week at most; there is no use evidence.

## 3. Friction, ranked by people-hours lost per week

### How I estimated
`hours/week = people affected x times per week x minutes lost each time / 60`, given as a low-high range.
Ranked by the midpoint. Every factor is labelled E, D or I. **Treat the ordering as a ranking of my
assumptions, not of reality** - the headcounts of mechanics, store and office are [I], and every frequency
except where marked is [I]. The Usage and adoption report would fix most of these. I count total time
spent, not "avoidable" time; the avoidable fraction needs asking.

Minutes lost are only counted for what the app costs, not the work itself, except row 1 where the work *is*
the cost (the app makes the supervisor the typist).

### The ranking

| # | Friction | Role | People x per wk x min | h/wk | Exists? | Status at HEAD |
|---|---|---|---|---|---|---|
| 1 | Supervisor keys the whole job card for mechanics who "never wanted the paperwork": three steps, four clock times, odometer, photos, old-part photo, close. Times written on paper at six, typed next morning. | Supervisor | 2 x 40-80 cards [I] x 5-10 min [I] | 3.3-13 (mid 8) | MEDIUM | Open by design |
| 2 | Matching passenger reviews to crew by hand: typed redBus names ("Kesar Dvr"), PNR lookups, "why no driver?" buckets. 1,025 reviews in 16 days [E] is about 450 a week. | Crew manager, owner, supervisor | 1-2 x daily x 15-45 min [I] | 2-6 (mid 4) | HIGH (exists), LOW (size) | Tooling built 8-17 Oct; use unknown |
| 3 | Driver trip-cash screen is English-only in Hindi mode; expenses logged at week end from memory instead of as they happen. | Driver | 54 x 4 trips [I] x 1-2 min [I] | 3.6-7 (mid 5) | MEDIUM | Open ([E] GO_LIVE) - only if drivers sign in |
| 4 | A phone that shows nothing, or only part: first sync 50-90 s on a fast Mac and "several times that" on Windows 7 / old Android; evicted or full database looks like a brand-new device; totals drawn as final while still filling. | All; worst for old phones, office PCs | 120 x 1 re-sync per 6 weeks [I] x 3-10 min [E-based] | 1-3.3 (mid 2.2) | HIGH | Mostly fixed 8 Oct - 3 Nov; real-hardware proof outstanding |
| 5 | Mechanic cannot say "done" or "I need X" in the app; tells the supervisor. | Mechanic, supervisor | 3 x 30 handoffs [I] x 1 min | ~1.5 | MEDIUM | Open ([D] manual) |
| 6 | Crew login logistics: 165 PINs minted, read out one by one; 57 conductor logins deleted then accidentally restored; a decision flipped three times. | Owner, supervisor | steady 0.5-1; one-time about 5-6 h [I] | 0.5-1 | HIGH | Unclear: depends on C2 |
| 7 | "It is fixed" while the user's screen shows the old build; a day lost guessing which build was on screen. | Owner (and the developer) | 1 x several x 15 min [I] | 1-2 | HIGH | Fixed 2 Nov (network-first shell, build stamp on the login screen) |
| 8 | Check-in fails silently with no camera: no sheet, no toast, no error. | Any attendee | unknown N [I] | 0.4-1.2 | HIGH (exists), LOW (size) | Open ([E] GO_LIVE) |
| 9 | Manager login: cold server 30-36 s, no stored PIN, "Wrong PIN" meaning changed overnight, owner reset needs a terminal and a database console. | Owner, supervisor, crew manager | 4 x 6 logins x (1/4 x 0.6 min + 0.3 min) | 0.1-0.5 | HIGH | Wait raised to 60 s plus one retry on 2 Nov; owner recovery still developer-only |
| 10 | Office-PC tap lag. Measured pre-fix on an M-series Mac: 884 ms per button, 988 ms first home; the office is "4-10x slower" [D spec, unmeasured]. | Owner, supervisor, crew mgr, office, store | 7 x 900 taps [I] x 0.1 s post-fix | 0.2-0.5 post-fix. **6-15 pre-fix** (paid for months) | HIGH | Fixed on a Mac; **not proven on a Windows 7 PC** |

Rows 3, 6 and 8 depend on crew signing in at all (contradiction C2). If they do not, rows 3 and 8 collapse
to zero and the real friction is that those people have no tool.

### Detail per friction

**1. Supervisor as typist.**
- [E] 927864c: mechanics were taken off the login screen because they never wanted the paperwork; the supervisor "keeps the card on their behalf"; the workshop clock is "the supervisor's paper slip, on screen".
- [D] Manual: "Times written on paper at six in the evening and typed in next morning are still fine." That sentence only exists because supervisors do double entry.
- [E] 4f0691e: a reported complaint, "while filling the job card it was not showing the data I filled above", plus a phone call losing the half-filled card. Both fixed 11 Sep.
- The card-making screen is now three steps with a draft saved. The cost that remains is volume and double entry; nobody has said what the supervisor thinks of it.

**2. Reviews to crew.**
- [E] c66a79a, 49ab371, 1934522: redBus shows only typed names, today only; ITS needs a separate sign-in; every untraced 1-3 star review needs a human decision or a lookup. The "why no driver" screen exists because "no source for that night" was common.
- [E] The log shows five sources being stitched (gate check, duty log, redPro assignment, ITS PNR, typed-name aliases). A human reconciles them when they disagree ("shown, never averaged").
- [I] How many reviews per week need a human is unknown. Size LOW.

**3. Trip cash in English.**
- [E] GO_LIVE "Still open". [D] Manual tells drivers to log "as they happen, not from memory at the end of the week", implying the week-end habit exists.
- [E] 3a0f0c2 shows someone checking that a driver-facing message reads in both languages, so a Hindi-first driver population is intended.

**4. Empty, partial, or stale phones.** (All HIGH; reported by the owner, the crew manager and "the office" repeatedly.)
- [E] d348232: "Owner doesn't open and the data takes forever to appear after login" - was a 50-90 s first sync, ~95% of it GPS events only the owner is sent.
- [E] 3b1e7e8: the screen was rebuilt forty times during a first sync; "it loads but not fully".
- [E] 2170703: figures drawn as final while only the total so far; "Nothing is going missing. The figures are incomplete and the app draws them as final."
- [E] 8eb73dc: crew manager added 22 drivers, his login showed 5 - the phone could not store the records and nothing said so.
- [E] 7c3f5f8: crew manager could not assign a driver; the dropdown was empty because the phone never stored the buses.
- [E] 0c8f434: two production devices were refused on every pull "for as long as the logs go back" yet looked entirely normal.
- [E] 5d125d2: a browser may silently drop the whole database; looks like a brand-new device. Unproven as the cause here.
- [E] 241af2c: the frozen APK silently stopped receiving anything.
- Net: the only symptom the user sees is "everything exists, just no data". That symptom has had at least eight distinct causes. v2 must show *what is missing and why*, not a normal-looking empty screen.

**5. Mechanic verbal handoff.** [D] manual Mechanic chapter: "Tell the supervisor when the work is done". [E] 38e1914 chose read-only deliberately. The cost is a message the app cannot carry. [I] volume.

**6. Crew login whiplash.** [E] 770df9e (owner request: every crew PIN to the same value), then 0145007 and 389b4e4 (owner instruction to delete all conductors), then 2e59010 (a recovery step re-created the 57 deleted logins within 12 minutes), then GO_LIVE mints 165 individual PINs to be "read out" to each person, then the manual says logins are being withdrawn. The direction on crew logins has changed at least three times between July and October (one shared PIN, delete the conductors, individual PINs, then withdrawn); see contradiction C2 and owner question 1.

**7. "Fixed" but not visible.** [E] 0f53a40: a fix was verified live, the reporter still saw the bug, and was told it was fixed, "twice today". [E] 5d125d2: "A day went into a fix that was already deployed." The login now prints its build.

**8. Check-in without a camera.** [E] GO_LIVE. Also silently drops the person's attendance, which is wages.

**9. Manager login.** [E] 6fa0a6d, 54a7561, 44049f6, bd08c78: the three roles that never cache a PIN hit every cold start; owner PIN recovery is a Python script plus a pasted SQL block in a database console ([E] manual Part 7). A bare "can't reach server" at the pad was the reported symptom ([E] 54a7561). Hours are tiny; this is the abandonment risk for the three people who run the garage.

**10. Office-PC speed.** The owner's own word for the app is "very slow and old" ([E] spec section 1). Slow on MacBook and iPhone too ([E] 3b1e7e8), so hardware was not the whole cause: the app rebuilt itself on every arriving page, read every store after every write, and scanned 40,000 GPS rows per driver. The numbers in the spec are Mac numbers.

### Frictions I could not size but should not be lost
- **Numbers that can never be good, so people stop reading them.** [E] 5eb8c6e: crew bank said 110 of 110 were missing every mandatory document (a photo-only test). [E] ba274f6: "67 buses need a driver" could never reach zero with 54 drivers and about 100 buses. [E] 8db78e7: Rs 45,000 of work read as Rs 45,000 per km on a bus with no odometer and topped the "money-pit" list; stock value read zero when a part had no cost. Each is the app teaching its user to scroll past red.
- **Duplicates by double tap.** [E] 5e62874: four accounts for one Sumit; the same shape sat under fuel, bills, issues and trips. Fixed with a click lock and a warning.
- **The part issued to the wrong bus.** [E] d738a6e, reported from the floor: the issue sheet pre-selected the first open job, so one distracted tap charged another bus; an interruption left stock down and the card empty.
- **Mechanic login was a dead end.** [E] 8db78e7 (12 Oct): every tap on the mechanic's home and Store tab bounced back to home. The login came back on 11 Sep, so up to a month [I]. Found by a code and data audit, not by a mechanic's complaint; no mechanic is recorded as reporting it, which is itself a signal about who tells anyone.
- **Login screen printed a way in.** [E] 26e5458 (removed 11 Sep); USECASE_REVIEW also flagged demo credentials seeded in production and LAUNCH_CHECKLIST says that is fixed.
- **Hindi.** USECASE_REVIEW's claim that most screens leak English is a reviewer's reading of an early build [I]; GO_LIVE confirms one remaining hole (trip cash). Crew bank is at en/hi parity (301 keys, [E] CREW_BANK.md).

## 4. What the manual has to explain

Every row is a concept that needed a paragraph. Each is a candidate for being designed away. "Workaround"
marks a place where the manual tells the user to do something *because* the app could not.

| # | Concept (manual part) | Screen | Why it needed teaching | Design-away candidate |
|---|---|---|---|---|
| 1 | One link, three shapes: phone, tablet, office computer (P1) | Whole app | App rearranges itself by device | Yes: one layout rule, no paragraph |
| 2 | Install: open the link, add to home screen; iPhone must be Safari; delete the old installed app (P1, PWA_ROLLOUT) | Browser | Web app, not a store app | Partly: enrolment flow in spec |
| 3 | Search box on every long list (P1) | All lists | Lists too long to scan | Yes: a list that is rarely long |
| 4 | "Works offline", never wait for signal (P1) | Whole app | Users believe saving needs signal | Yes: show saved state on the thing saved |
| 5 | Pick job, then name, then PIN; "Recent on this phone" (P1) | Login | Large roster | Yes: enrolled device skips |
| 6 | **Same name twice: a short code appears; "ask the office which is yours, and use the same one every time" (P1) - workaround** | Login | Five accounts for one person | Yes: unique display names |
| 7 | Five login messages: Wrong PIN, Too many wrong PINs (locked, correct PIN refused too), That PIN no longer works, This login has been switched off, cannot reach server (P6) | Login | Each is a different state | Yes: collapse to "what to do next" |
| 8 | Manager PINs are not kept on the phone; sign in online every time; 12-hour session (P1, P6) | Login | Security decision | Needs the enrolment redesign |
| 9 | Change your PIN on day one; shared PIN retired (P1) | Me | Shared PIN history | Yes with enrolment |
| 10 | Attendance: live face, location, LATE, geofence confirm, permission for camera and location in phone settings (P1, P6) | Me | Fraud control | Partly: permissions explained at use |
| 11 | Sync: three phrases, pending count, "Held for another person", two marks, "no mark means nothing to do"; Re-download everything; "Records this phone could not save"; free up space (P1, P6) | Me, Sync | Sync state leaks | Yes: the app says what is missing in place (spec 4.7) |
| 12 | **Old information vs old version of the app are different problems; wait for it to swap itself (P6) - workaround** | Whole app | Stale-while-revalidate | Yes |
| 13 | **"Close the app fully and open it again" (P6) - workaround** | Whole app | Stale screens | Yes |
| 14 | **Owner has no Jobs tab; reach jobs through the "In the workshop now" card (P2) - workaround** | Owner Today | Missing nav | Yes |
| 15 | Money: one number, five parts that always add to the total; money-pit vs median; pilferage score is "a reason to look, not a verdict" (P2, P7) | Money, Insights | Derived figures | Partly |
| 16 | Workshop clock: four times, Idle in the workshop; paper at six, typed next morning (P2) | Job card | Paper slip on screen | Yes: auto-stamp the transitions |
| 17 | Before photo before anything is taken apart, "once the part is off the bus you can never take it again"; no close without both photos or a vendor bill (P2, P4) | Job card | Evidence rule | No - it is the product; make the gate visible |
| 18 | Odometer on every card; lower reading ignored; "odometer not working" tick instead of a guessed number (P2) | Job card, Fuel | Data quality | Partly |
| 19 | **Who signs off whom: owner never signs off their own; supervisor self-signs; two supervisors exist for cover (P2, P5) - footnotes** | Job card | Rule changed 15 Sep | Yes: show the one next step |
| 20 | Mechanic signs in to see, not to close; no close button (P2) | Mechanic Today | Reversed twice | Yes |
| 21 | Away-for-repair tick: bus leaves the workshop list, mechanic optional (P2) | Job card | Overloaded vendor field | Yes: separate state |
| 22 | Delete a job card: owner only, why asked, parts go back (P2) | Job card | Pilferage side-effect | Hide behind owner |
| 23 | Wrong bus on a card: supervisor fixes while open, owner only after verified (P2) | Job card | Cost-per-km integrity | Yes |
| 24 | Used / second-hand tick: "changes the price, never the count"; add it first at salvage value (P2) | Issue part | Count vs price | Yes: two fields, not a tick |
| 25 | Stock count: correct the book "by counting, not by typing"; typed corrections show as Unexplained (P2) | Store health | Anti-theft side-effect | Partly |
| 26 | Duty board chips: Driver / Conductor / By bus; each bus has three seats; **"if a bus looks like it lost its driver after you assigned a conductor, that is a fault - tell the office" (P2) - workaround** | Duty board | Same-role seat clearing | Yes |
| 27 | Rename a login when the post changes; also New PIN, otherwise the leaver can still sign in (P2) | Staff | Logins belong to posts | Yes |
| 28 | Crew bank: Reuse this record vs Add as a different person; red do-not-rehire line; Mark as left vs Archive ("never use left for tidying"); Archive whole register (P3) | Crew bank | Two buttons, one lie risk | Yes: one flow with a branch |
| 29 | Documents: on file vs scanned vs nothing; mandatory by job; Aadhaar masked; PDF under 3 MB needs internet and cannot be scanned (P3) | Crew documents | Three states | Partly |
| 30 | Gate pass: serial number is the whole point; slip number is date-first, not 1, 2, 3 (P4) | Outside job | Offline numbering | Explain once at the field |
| 31 | Breakdown vs driver report vs job card are three records (P4) | Fleet | Three events | Yes: one timeline |
| 32 | Completed work: groups by reading the fault text; "write it plainly or it lands in Other" (P4) | Completed work | Free text drives classification | Yes: pick the system |
| 33 | Fuel: last-fill panel, run since, red reading asks twice, part fills carry over (P2) | Log fuel | Mileage maths | Partly |
| 34 | Tyres: set of rows, old tyre must be picked or "Not tracked"; batteries counted in months, warranty field (P2) | Components | Claims | Partly |
| 35 | Driver: Start trip and cash, company card vs cash, expense cannot be edited, trip locked after End (P2) | Trips | Cash control | Partly |
| 36 | Challan check costs a paid credit per bus; use "Check unchecked", not the whole fleet "out of habit" (P7) | Challans | Money per tap | Yes: show the cost at the button |
| 37 | **A warning that something already exists: carrying on creates a second record (P6) - workaround for duplicates** | Add forms | One Sumit became four | Yes |
| 38 | **Pictures kept inside records: upload on wifi, it can be twenty megabytes (P2) - workaround** | Device and server | Old photo format | Yes: migrate once |
| 39 | **One phone showing fewer people: free space then Re-download everything (P2) - workaround** | Device and server | Silent store failure | Yes |
| 40 | **"The app looks different... tell the staff before they open it" (P2) - workaround for change** | Whole app | Orange accent | Yes: a "what changed" card |
| 41 | Set-up: stand at the garage to capture location; labour rate; late cutoff; import from Excel; phone alerts (P7) | Garage setup | One-time | Yes: a first-run flow |
| 42 | **Owner PIN recovery: Python script on the office Mac plus SQL in the database console; "keep the owner PIN written down" (P7) - workaround** | none | Owner cannot be reset in-app | Yes: designed recovery |
| 43 | Server settings on Vercel in a staff manual (P7) | none | Wrong audience | Remove from the staff manual |

**Not in the manual at all, so no one has been taught it:** gate check (ten items, selfie, hold 1.5 s),
redBus reviews and the traced rating, redBus names, "why no driver", weekly coaching notes, the
conversations log, the whole office role, Claude drafting job cards and reading bills, the Monday summary.
Gate check and reviews are among the newest, highest-use screens for drivers. [E] grep of the HTML.

Eighteen of the 43 rows say "Yes" to design-away. The manual's own header says it covers "owner,
supervisor, storekeeper, driver and conductor" - five roles, while the app has eight.

## 5. Jobs the app does not serve yet

Things the documents show people doing on paper, WhatsApp, phone, spreadsheets, or other portals.

| Job | Where it happens now | Evidence | Served by the app? |
|---|---|---|---|
| Recording workshop in/start/done/out times | Paper slip at the garage, typed next morning | [E] 927864c; [D] manual | Partly: the app is the second entry |
| Outside-job gate slip, with signatures and the vendor's copy | Printed paper in the garage's own format; vendor keeps a copy | [E] 2b35e74 | App prints it; signatures and the vendor file stay on paper |
| Odometer readings | Crew photograph the dashboard and send it by WhatsApp; 29 of 89 buses had no crew number to route to | [E] 19ece40 | Server path exists; not an in-app job; not a screen anyone opens |
| Which buses run today | Unknown; "the app has no notion of which buses run today" | [E] ba274f6 | **Not served at all.** Biggest hole in the duty board |
| Bus papers: RC, permit, fitness, insurance | Google Drive folders, then expiry dates extracted by hand into the app | [E] c15673d, 8454efc | Alerts yes; renewal itself (agent, RTO visit) no |
| Parts and vendor catalogue | "The billing system's Excel", imported once | [E] 86d8815, manual P7 | Import yes; two-way no. Is the Excel still the book of record? |
| Supplier bills | Paper bills, photographed, read by Claude | [E] c896478 | Mostly |
| Fleet roster, routes | `.xlsx` imports | [E] a03120d | Import only |
| Crew pay | Not in the app (salary is hidden from the crew manager); README lists "payroll export from attendance" as still to do | [E] README, CREW_BANK | **Not served.** Attendance feeds wages in practice [I] |
| Daily-wage disputes ("did I get paid for every day") | Unknown | USECASE_REVIEW only, [I] | Not served; a reviewer's idea |
| Mechanic: "work is done" | Said aloud to the supervisor | [D] manual | **Not served** |
| Driver faults while logins are withdrawn | "Report problems to the supervisor directly" | [D] manual | Phone call or WhatsApp by definition |
| Passenger complaint reply and redBus escalation | In redPro / redBus portal; staff read it via a browser extension | [E] a41684c | Read only |
| Passenger PNR to trip to driver | ITS portal, a separate login, one PNR form | [E] 1934522, edaff7e | Lookup by robot, owner/supervisor only |
| A conversation with a driver | Verbal; no place to record it before 23 Oct | [E] 4a42e38 | Served since |
| Crew documents collected from people | In person; photos still missing for most ([E] CREW_BANK "Open") | [E] | Collection worklist exists |
| Challan payment, towing, court | Words appear in the challan sheet; payment is not described | [I] LOW | Not served |
| Breath-test at departure | "No breath test yet. Add it when the devices arrive." | [E] GATE_CHECK.md | Planned |
| Tyre remoulds and warranty claims | Records support the claim; making the claim is elsewhere | [I] LOW | Evidence only |
| Who the owner bills | Commit 7fc8053 says the owner has no invoicing; README says "bill the company" | see C4 | Unclear |

**Not served at all, strongest:** which buses run today; crew pay and payroll; the mechanic's "done"
signal; bus-paper renewal; and (if the owner does bill anyone) invoicing.

## 6. Contradictions

| # | Sources | What they disagree about | What it changes |
|---|---|---|---|
| C1 | Commit 927864c vs 38e1914; manual P2 (mechanic signs in) vs manual P7 ("Mechanics have no PIN - they do not sign in") vs SITEMAP.html ("A mechanic has no login at all") vs spec section 6 ("Mechanics do not sign in today") | Do mechanics sign in? Code says yes since 11 Sep. The spec and SITEMAP are stale | Workshop front door design |
| C2 | Manual P1/P2/P3 ("crew logins are being withdrawn") vs GO_LIVE step 6 (mint 165 crew PINs) vs Oct commits (gate check released by the driver, drivers and conductors see own reviews and coaching) vs spec section 6 (floor roles are a front door) | Are drivers and conductors supposed to sign in? Four decisions in two months | Whether a whole front door exists |
| C3 | Spec section 6 ("owner's decision 2 Nov: operations only, no company money") vs `DECISIONS.md` section 4 (still open, owner decides) vs manual ("Money tab stays with the owner") | Is the supervisor money question settled? Today the supervisor holds 35 of 37 permissions ([E] cfa254a) | Permission split, Money screen |
| C4 | README, FEATURES.md, USECASE_REVIEW (owner "bills each transport company", cost-by-company is the owner's reason to use it) vs commit 7fc8053 ("Owner runs their own buses, so there's no invoicing companies"; billing worksheet deleted) vs FEATURES.md still listing a billing worksheet | Does the owner bill anyone? | Whether Money has a billing job |
| C5 | README ("Supervisor... Verify") and manual P4 flow ("Owner or another supervisor verifies") vs manual P2 and P5 ("a supervisor's own work signs itself off"; owner dropped the second signature, 15 Sep) | Is there a second pair of eyes on every job? The manual contradicts itself | The core trust model |
| C6 | Driver counts: 54 drivers ([E] ba274f6) / 107 driver records ([E] 22eca75) / 108 drivers and 57 conductors on a phone ([E] GO_LIVE) / 110 active crew ([E] 5eb8c6e) / 165 crew logins ([E] GO_LIVE) | How many drivers are there and how many are real | The "short of drivers" arithmetic |
| C7 | Spec: office desk machines are Windows 7 / Chrome 109 vs manual Part 7 "office Mac" vs owner's MacBook and iPhone | What the owner and office actually hold | The Chrome 109 floor covers some people, not all |
| C8 | Who takes the photos: USECASE_REVIEW and FEATURES.md ("mechanic captures before/after photo") vs manual P2/P4 (every step on the card is the supervisor's) | Who stands at the bus with the camera | The job-card flow |
| C9 | Roles: ROLES.md and FEATURES.md (5) vs manual (7, no office) vs the brief (8) | How many roles | Training scope |
| C10 | Manual Part 4 table: owner/supervisor fill the workshop clock; store "Receive stock" vs ROLES.md target (store only reads Jobs) | Minor; store reads jobs and issues against them | None |
| C11 | USECASE_REVIEW says supervisors want a 30-45 day document warning; manual and AGENT docs say fifteen | Did anyone ask for longer warning | Alerts |
| C12 | The word "office": the role added 23 Oct (read-only) vs "the office" meaning owner, supervisor and crew manager (e.g. "so the office can add it", 49ab371) | Who confirms redBus names and adds ITS numbers | Permissions per screen |

## 7. Questions only the owner can answer

1. Who actually signs in on a normal day - drivers and conductors included? Please open Usage and adoption and send the list of logins that have never been used. The manual says crew logins are being withdrawn; the October work assumes they exist.
2. Do you bill any transport company for repairs, or only run your own buses? (Commit 7fc8053 says the second; the README says the first.)
3. Does either supervisor do the cash reconciliation today? If yes it must move before the permission changes.
4. Where is the daily schedule of which buses run, and who keeps it - paper, a WhatsApp group, ITS?
5. 54 drivers for about 100 buses: is that a hiring gap, a part-fleet-idle fact, or a data error?
6. Who are the mechanics, how many, do they own phones, and do you want them to be able to mark "work done" with a tap even though they may not close the card?
7. Who is the office - how many people, which PCs - and what do they open the app for first?
8. How is crew pay worked out, and is the attendance record what decides it?
9. Is the Excel billing system still where the parts and vendor books live, and does the storekeeper retype bills into it?
10. Who renews insurance, fitness, permit and PUC, how do they hear it is due, and is fifteen days enough notice?
11. Does a supervisor closing their own job without a second signature still stand (15 Sep)?
12. Which staff read Hindi only and which cannot read at all (voice or pictures only)?
13. What is each person's phone, and has the device check from 1 Nov been returned by anyone?
14. If a driver changes, do you want the login to follow the post or the person?

## 8. Appendix: USECASE_REVIEW claims cross-checked against other documents

I did not read code. "Shipped" means a manual, launch checklist or commit message says so. This is a list of
what another document corroborates, not a statement about the current app.

**Shipped per other documents:** change own PIN and owner-only PIN reset, owner-only supervisor creation,
demo PINs removed, logout clears cached PIN, offline PIN rate limit, Start fresh, garage location and
labour rate configurable, Hindi pre-login toggle, deletes sync, poison-record handling, conflict notice,
offline photo re-upload, job reassign and edit, Send back for rework, mechanic part request, search boxes
on long lists, report by voice or photo, driver can cancel a report, driver sees why the rating is what it
is, stock count, dedupe on add, odometer not-working tick, per-bus odometer capture (via WhatsApp rather
than a field).

**No other document corroborates either way (unknown): ** partial supplier payments, supplier-wise
outstanding, payment due dates, attendance daily reset and hours per day, GPS accuracy handling, document
photo wallet for buses, one-tap renewed, service-due badge on the bus list, edit part reorder level, return
part to stock from a job, running balance on the ledger, advisor chips and offline note.

**Contradicted:** the 30/45-day document warning (docs still say fifteen days).

**What I did not read:** `app.js`, `db.js`, `sync.js`, `sync_server.py`; the other inventory files in this
folder; SITEMAP beyond its first 4,000 characters; `FEATURES.md` after line 80.

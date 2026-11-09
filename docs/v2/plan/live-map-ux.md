# Where the buses are — the live map

**Stage 1 (UX) of `docs/v2/PIPELINE.md`. Slug: `live-map`.**
Written 2026-11-09. Trigger: the owner's own words, *"i want the live maps too."*
Input: `docs/v2/GAPS-FROM-V1.md` §A5, the inventory, and the approved v2 direction
in `docs/v2/plan/v2-ux.md` §5.2 and §Q9.

**Status: NOT cleared for stage 2.** The flow below is complete and buildable, but
the thing that got this screen dropped in the first place is still missing, and it
is one sentence from the owner, not a research task. See §8. Everything else in
this document holds whichever way he answers; what his answer changes is the
refresh rate, where the entry row sits, and whether the crew manager keeps it.

This document does not touch `docs/v2/plan/outside-repair-ux.md`, which is signed
off and whose §0 names this feature as out of its scope. Nothing here re-opens any
decision in it — see §9.

---

## 0. What Q9 asked, and what has and has not been answered

`v2-ux.md:665` dropped v1's `livemap` and `track` with a reason that was a
question: *"UNKNOWN: who opens the live map, and to answer what? No role's job
list in `05 §2` includes it. It needs internet and a map library on Chrome 109
machines."* `v2-ux.md:917` records the consequence: a real answer restores a
screen, and `v2/caps.js:453` holds `RETIRED.liveMap: ['crewmanager']` — a
capability with no screen behind it — as the standing record of the drop.

What has changed today: **the owner has said he wants it.** That answers *whether*.
It does not answer *to answer what*, and I cannot answer that from the inventory:

- `inventory/05 §2.1` (owner's six jobs) — no map. The nearest is item 4, *"look
  at what is standing in the workshop and for how long"*, which is Jobs, not a map.
- `inventory/05 §2.2` (supervisor's eight jobs) — no map.
- `inventory/05 §2.3` (crew manager's six jobs) — no map, and he is the role v1
  gave it to most prominently (`inventory/01 §4`: his home carries a **Live map**
  shortcut; `01 §2` row 34 gives `livemap` to owner, supervisor, crewmanager).
- `inventory/01 §6` lists *"Where is the bus?"* as a question the app answers —
  `livemap`, `track`, the bus list status chip — but records nobody asking it.

So three candidate moments, with what each rests on, said plainly:

| Candidate moment | Who | Evidence |
|---|---|---|
| A bus is moving with the ignition on between 23:00 and 05:00 and the server sends a push about it | owner, supervisor | **Evidenced that the push exists** (`inventory/04 §: server-initiated pushes`, night-movement GPS event to owner/supervisor; the `night` event itself in `04 §3`, `/gps/ingest`). **Inference:** that the reader then wants the position. Nothing records what he does next |
| A bus has failed on the road and somebody has to say where it is | owner, supervisor | **Evidenced that the place is asked for:** `breakdowns.place` is a typed field (`inventory/03 §3`, store 22). **Inference:** that the answer comes off a map rather than off a phone call to the driver |
| It is evening, a bus is due back to be turned round with a fresh crew, and the question is whether it is close | crew manager | **No evidence either way.** This is the loss `v2-ux.md:688` named: *"If it turns out the crew manager watched it every evening, that is a real loss and my fault, and Q9 is how we find out"* |

I am not choosing between them silently. §8 asks. The design below is deliberately
the same screen for all three, so the wait does not block the drawing.

**Two things about the data that matter more than the screen, and both are
measured facts about today, not opinions:**

1. **`GET /gps` invents a position when it does not have one.** For a registration
   the provider has not pushed, it returns *a simulated track computed from a hash
   of the bus id around Jaipur* (`inventory/04 §3`, `GET /gps`). `v2/sync.js:679`
   (`Sync.gps`) calls exactly that endpoint. **This screen must never call it.**
   The honest endpoints are `/gps/fleet` (real positions only, `04 §1` row 11) and
   `/gps/latest` (`404 no telemetry for reg`, row 10), both already wrapped in
   `v2/sync.js:636` and `:645` and called by nothing in v2.
2. **A position can be silently old.** There is no server-side staleness alarm and
   no alert on stale GPS (`inventory/04 §: alerting`). So no pin, row or sentence
   on this screen may say "live" without the age of the fix next to it — which is
   the rule `v2/screens/buses.js:896` already set for itself: *"the most recent
   position THIS DEVICE HOLDS, with its age, and never the word 'live'."*

---

## 1. The job

It is 1.07am. **The owner** is in bed with his phone, and it has just buzzed: one
of his buses has its engine on and is moving, at an hour when every bus should be
standing in the yard (the server sends him exactly this push, `inventory/04
§: server-initiated pushes`). He wants to know, in the ten seconds before he
decides whether to ring somebody, **which bus, where it is now, and whether it is
still moving.** He is one person, half asleep, on a phone, and the next thing he
does is either put the phone down or make a call. The same screen, at 4pm, is **a
supervisor** with a driver on the line saying the bus has stopped on the highway
and he is not sure where he is; the supervisor has to type a place into a
breakdown record (`inventory/03 §3`, store 22) and send help to it.

The third person is **the crew manager**, at his desk with the duty board at 7pm,
and whether he has this job at all is the open question of §8.

Nobody in this document is standing in a pit with dirty hands. This is the rare
screen where the owner *is* the user — which is also why it must not grow a tab in
everybody else's bottom nav (§4).

---

## 2. What they do today

**v1 — the fleet map** (`viewLiveMap`, `app.js:3561`; `inventory/01 §2` row 34).
From the owner's home there is a whole card for it (`app.js:3235`) and from the
Fleet tab a row, *"Live map — Track every bus, Uber-style"* (`app.js:2281`); the
crew manager's home has the same shortcut (`inventory/01 §4`). So: **1 tap from a
home, 2 via Fleet, 1 screen.** It loads Leaflet from a CDN on demand
(`app.js:658`, pinned by version and hash at `app.js:626`), draws one coloured
circle per bus from `Sync.fleet()`, and re-reads every 20 seconds
(`app.js:3572`). A bus the provider has not pushed is **silently absent** —
`refreshMap` does `if (f.lat == null || f.lng == null) return;` (`app.js:3588`) — so a dead tracker
and a bus that is not on the road look identical: nothing.

**v1 — follow one bus** (`viewTrackBus`, `app.js:3635`; `01 §2` row 35). Tap a pin,
then its popup (**2 more taps**), or 1 tap from bus detail. It takes over the whole
screen with no topbar and its own floating back button (`app.js:3639-3644`), polls
`Sync.latest(reg)` **every second** (`app.js:3654`), pans the map to follow, and
draws an SVG speedometer needle (`speedGauge`, `app.js:3610`).

**v1 — no signal.** Both screens, with no internet or no map library, end at one
sentence with an emoji in it: *"Live map needs an internet connection"*
(`app.js:3563`, `:3638`). A bus whose plate matches no tracker offers **Link GPS**
(`app.js:3670`) — the only way into `linkgps` in the whole app (`inventory/01 §1.3`
item 2).

**v2 — there is no map, and the nearest answer is thinner than it looks.** Buses
card 9 (`buses.js:896`) shows the last position **this device holds, with its age**
— 2 to 3 taps, and honest about staleness. But it is built from `gpsevents`
(`buses.js:772`), and `gpsevents` are **safety** events: overspeed, harsh brake,
night movement, idle (`inventory/03 §3.6`). A bus driven well generates none, so
its card reads *"Position not recorded"* (`bsNoPosition`, `buses.js:194`) however
alive its tracker is. And `gpsevents` reaches **owner and supervisor only**
(`inventory/03 §2`, store 14), so the crew manager's device holds no positions at
all. **"Where is every bus right now" is unanswerable in v2 at any number of
taps.**

---

## 3. The flow

One new screen, reached from where the question gets asked. No writes anywhere in
§3.1-§3.3 — this screen reads.

### 3.1 "Where is every bus" — the owner, woken, or the supervisor at his desk

1. **He arrives** either by tapping the push that woke him, or by one tap on the
   Buses screen's **"Where the buses are"** row.
   *He sees, before any map exists:* **a list, ranked, worst first** — the buses
   that are moving now (newest fix first, with speed and how old the fix is), then
   the buses standing with the engine on, then the parked ones, and last, under
   its own heading, **every bus with no position at all and how long it has been
   silent.** This list is the answer; it paints from the first read and does not
   wait for a map library.
2. **The map fills in above the list** when the library and the tiles arrive, with
   one dot per bus that has a position, and the usual map attribution. If the
   library or the tiles never arrive, the list stays and one sentence says the
   picture is not available — not that the data is not.
   *The system writes:* nothing.
3. **It refreshes itself** while he is on the screen, and **stops the moment he
   leaves it** (v1 did this correctly at `app.js:12814`; this must too, and §6 says
   how we prove it).

**1 tap from Buses, 2 from anywhere, 0 from the push** — v1's best path was 1 tap
from a home card, so this is equal or better only if the entry row is in the right
place, which is §8's second question.

### 3.2 "Where is this one bus" — either of them, from the bus

1. **He is on the bus** (Buses, card 9) and sees the last position this device
   holds with its age, as today.
   *He taps:* **"Where is it now"**.
2. **He sees the same screen as §3.1, centred on that bus**, with that bus's row at
   the top: moving or standing or parked, the speed, the age of the fix. The rest
   of the fleet is still drawn — he came for one bus but he is looking at a map, and
   hiding the others would mean a second screen that answers the same question.
3. **If that bus has no position**, he sees *why* in the words v2 already uses:
   either nothing has been recorded for it (`bsSeenNone`, `buses.js:205`) or its
   plate matches no tracker (`bsSeenNoMatch`, `:206`) — and in the second case the
   row carries **Link GPS**, which is already a real control on bus detail
   (`buses.js:1016-1022`, `bsLinkGps`). That is the only write this feature can
   reach, it exists today, and it does not change.

**2 taps** from the bus (v1: 1 from bus detail, 3 from the fleet map via a pin and
its popup).

### 3.3 No signal, which is half the reason this was dropped

1. **He opens it with no internet.** The screen says so in v2's own idiom and then
   shows **the last positions this device holds** — for owner and supervisor, from
   `gpsevents`, each with its age, which is what card 9 already does per bus.
2. **For the crew manager, offline, the honest answer is "nothing"**, because his
   device is not sent position history at all (`inventory/03 §2`, store 14). The
   screen must say that in one sentence rather than draw an empty map. It is not a
   fault, it is a retention and permission rule the owner set, and it is §8's third
   question.
3. **No timer runs** while there is no connection, and nothing retries in a loop:
   the screen offers one way to ask again, and asking again is a tap.

### 3.4 The one thing this screen must refuse to do

If the fleet read returns nothing, the screen says *no positions have arrived*.
It must **never** fall back to the single-bus `/gps` endpoint to fill the gap,
because that endpoint answers with a **simulated** track around Jaipur for a
registration the provider has not pushed (`inventory/04 §3`). A map that invents
pins is worse than no map: it would send a supervisor to a highway at 4pm on a
hash of a bus id.

---

## 4. Screens

**v2 goes from thirteen screens to fourteen, and from twelve nav tabs to twelve.**
The map is `nav: false`, like the Job card (`caps.js:302`): you reach it from a bus
or from the thing that made you ask. A driver, a conductor, a mechanic, a
storekeeper and the office role do not get a new tab, do not get a new row, and
cannot reach it — the capability is the fence (`caps.js:184`,
`liveMap: ['owner','supervisor','crewmanager']`, which already exists and is not
being widened by this feature).

| Screen | The job it serves | Role that does that job | What must be on it | What must NOT be on it |
|---|---|---|---|---|
| **Where the buses are** (new, #14, `nav: false`) | "Where is every bus right now, and which ones can I not see?" | **owner**, supervisor, crewmanager — declared on `liveMap`; absent for the other five roles | The ranked list first and always: moving, then standing with the engine on, then parked, then **no position, with how long silent** — each row with the plate, the state in one word, the speed where there is one, and **the age of the fix**. The map above it when it loads, one dot per bus, with map attribution. A centred bus when it was opened from one. Its own refresh, which stops on leaving | The word "live" next to a position with no age beside it. Any pin whose source is the simulated `/gps` endpoint (§3.4). A bus with no position left silently off the screen, as v1 did (`app.js:3588`). A speedometer gauge. A second navigation idiom — no topbar-less full-screen takeover with a floating back button (`app.js:3639-3644`). Any write: this screen reads |
| **Buses** (#5) | "What is the state of this one bus?" | owner, supervisor (`fleet`) | One row, under card 9's existing last-seen line, opening the map on this bus — **"Where is it now"**, gated on `liveMap` as card 9 already is (`buses.js:802`, `maySeen`). One row on the screen's own head opening the fleet answer | A map drawn inside the bus card. A second position with a different number on it: card 9 and the map must agree, so the map's own read of this bus is what card 9 shows once it has been read |
| **Attention** (#2) | "What is wrong across the business, ranked by money and safety?" | owner, supervisor | **Nothing new from this feature.** Named here because it is the tempting place to put "12 trackers have been silent for three days", and that is a different question — see §5 | A row per silent tracker, which is a count that may never reach zero (`v2-ux.md §4.1` #2) |

No screen is emptied by this feature and none is removed. `Caps.RETIRED.liveMap`
(`caps.js:453`) empties, which is the one honest bookkeeping consequence: the
crew manager's capability stops being a permission with nowhere to go.

---

## 5. Dropped

Everything v1's two map screens did that this does not carry forward.

| Dropped | Why |
|---|---|
| **`track` as its own screen** (`viewTrackBus`, `app.js:3635`; `01 §2` row 35) | Two screens answering "where is a bus" from different distances is the five-lenses mistake in miniature. One screen, centred on the bus you came from |
| **The one-second poll** (`app.js:3654`) | Nothing in `05 §2` describes anybody watching a bus move second by second, and each request makes the server **re-read the whole `gpslive` table**, because containers are stateless (`inventory/04 §: integrations`, AirFi row). The new screen refreshes on one interval for fleet and for one bus. **The interval itself is unmeasured and must be measured on the office machine before stage 3 reports done** — I am not putting a number in this document that nobody has read off a Core 2 Duo |
| **The SVG speedometer** (`speedGauge`, `app.js:3610`) | A needle, an arc and a 30px numeral animating once a second to say what one number and one word say. v2 has no gauge idiom and this is not the screen to invent one |
| **The immersive full-screen layout with a floating back button** (`app.js:3639-3644`) | A second way out of a screen, used by one screen in the whole of v1. v2's shell has one |
| **The 60-bus parallel fallback** (`app.js:3578-3583`: up to 60 `Sync.latest` calls per refresh when `/gps/fleet` lacks coordinates) | It exists for *"older servers"*, and ours returns `lat`/`lng` in `/gps/fleet` (`inventory/04 §1` row 11). One request per refresh. If the fleet read ever stops carrying coordinates, that is a server fault to fix, not sixty requests to fire off a Windows 7 machine |
| **Silently skipping a bus with no position** (`app.js:3588`) | This is the one behaviour change that is a feature rather than a deletion. "No position" is the answer somebody acts on — it means a tracker is dead, a plate is mismatched, or the provider has stopped pushing — and v1 drew it as absence, which is indistinguishable from a bus that is fine |
| **"Uber-style"** (`app.js:2281`) | The row says what the screen answers. The owner's own words for it already exist in Hindi: `cmLiveMap` *"लाइव नक्शा"* and `cmLiveMapSub` *"अभी बसें कहाँ हैं"* (`i18n-hi.js:45`) |
| **The emoji in both empty states** (`app.js:3563`, `:3638`, and the Link GPS button at `:3670`) | Windows 7 draws them as boxes — `CLAUDE.md` hardware floor, enforced by `scripts/check-floor.py` |
| **`linkgps` as a route reachable only from the map** (`app.js:3670`, whose button is the only opener; `01 §1.3` item 2) | v2 already made it a control on the bus that needs it (`buses.js:1016`). The map's "no tracker" row points at that same control; it does not restore a screen |
| **A map pin's click-through to a bus that v1 could not find** (`app.js:3598`: the pin looks up the bus by normalised plate and, finding none, does nothing at all) | A tap that does nothing is a broken screen. A plate that matches no bus is a row that says so, in the words `buses.js:206` and `:1021` already use |
| **An Attention row for a silent tracker** — *not carried forward, and it was never v1's* | Named so nobody adds it in stage 2 as an obvious win. "Is our tracker contract working" is a question about a supplier, asked once a month, and as a row it is a count that may never reach zero. It belongs with whoever renews the AirFi contract, and that is not this screen |
| **Caching map tiles for offline use** | Tiles are another origin; `v2/sw.js:184` passes other origins straight through and caches nothing from them, deliberately. The picture is online-only by construction. **The list is not**, which is why the list is the answer and the map is the illustration |

---

## 6. Edge cases that matter here

**Offline, which is the whole reason this was dropped.** §3.3 is the behaviour.
The rule: the screen must paint its answer with no network and no third-party
library, and must never say "could not send" — there is nothing to send. The map
library itself is third-party code loaded from a CDN, pinned to a version and to a
hash of its bytes (`app.js:620-631` explains why: *"third-party code runs inside
the app, next to the session token"*). Stage 2 inherits that pinning or does not
load the library at all; it does not load a map from an unpinned URL.

**The slowest machine in the office.** Chrome 109 on a Core 2 Duo, with no
framework runtime (`CLAUDE.md`). Leaflet 1.9.4 is what v1 pins (`app.js:626`) and
is the known-good option, but **nobody has opened a hundred-marker map on that
machine and timed it.** The requirement, not the implementation: the list must be
on screen and readable before the map exists, the refresh must not rebuild the
list from scratch, and the whole screen must be measured on the office machine —
with the fleet-sized fixture, the way every other number in this repo was got
(`CLAUDE.md`, "measure before you claim"). If the map costs more than the list is
worth on that machine, ship the list.

**A timer that outlives its screen.** v1 got this right (`stopMap`/`stopTrack`
called on every navigation, `app.js:12814-12815`). A 20-second timer left running
behind twelve other screens is the kind of fault that shows up as "the app got
slow" three weeks later and is never traced back. **This needs a check that goes
red:** leave the screen, assert nothing polls. Break it by removing the stop and
confirm the check fails.

**A role that must not see it.** A driver must not see where other drivers are;
that is colleague surveillance, and it is also five roles' worth of data nobody
asked for. The screen declares `liveMap`, so it is absent — not disabled — for
driver, conductor, mechanic, store and office. **The client deny is not a boundary
here and stage 2 must say so in the handover:** `/gps/fleet`, `/gps/latest` and
`/gps` accept **any signed-in session** (`inventory/02 §4.4` and `02 §: open
questions` item 9, which asks whether that is intended). Narrowing them to the
three `liveMap` roles is a live behaviour change *and* must not break the
`operator-agents` agent key, which reads `/gps/fleet` with scope `gps`
(`inventory/04 §: agent keys`). That is the owner's deploy, not ours.

**A position that is old, and a provider that has gone quiet.** Every position
carries its age; nothing carries the word "live" without it. Whether AirFi is
pushing at all today is **UNKNOWN and unknowable from this repo** (`inventory/04
§: not knowable`, "whether AirFi is currently pushing"). It is measurable in one
read — `gpsLiveRegs` in the unauthenticated `/health` body (`inventory/04 §: health`)
is a count of registrations with telemetry — and the owner or whoever holds the
deploy can read it today. **If that count is near zero, this screen is a blank map
and the finding is about the tracker contract, not about the UI.** Stage 2 should
not start before somebody reads that number.

**Two people at once.** Nothing on this screen writes, so there is no conflict.
The one exception is Link GPS, which writes a bus's registration and already lives
on bus detail with the screen's existing whole-row conflict behaviour; this feature
does not change it.

**A plate that matches no bus, and a bus that matches no plate.** Both exist:
`gpsevents.reg` and `gpslive.reg` are display plates, not bus ids, and the join is
on a normalised registration (`inventory/03 §3.6`; `buses.js:373` and `:897`
explain the rule). The server's `norm_reg` unifies plates differing in zero
padding but *"an ambiguous plate without a series letter is kept as written, so two
spellings can split one bus"* (`inventory/04 §: integrations`). So the list has two
named states, not one: **a bus we hold no position for**, and **a position whose
plate we cannot attach to a bus.** The second one must appear somewhere or it is a
bus running around that the office cannot see — it belongs at the bottom of the
list, by its plate, with no bus behind it.

**A bus that is away for repair.** The other feature in flight marks a bus as
standing at a vendor's workshop in another town, in words, and deliberately drops
v1's coordinate field (`outside-repair-ux.md §5`). If that bus's tracker is alive
it will appear on this map at the vendor's yard in Jaipur, which is the correct
behaviour and needs no new field: the card says the state, the map says the
position. The two must not be made to agree by writing a position onto the card.

**The desk row.** Every row here is one line and uses the row markup contract
`<div class="txt"><div class="t">…</div><div class="sub">…</div></div>`
(`CLAUDE.md`; the two other forms were defects, fixed in 1135153 and 8520c54).

**Words.** The screen's own name needs a registered id (`Caps.SCREENS[].word`, or
`test_v2_words.js` fails) — and the Hindi for it already exists and is the owner's
own: `cmLiveMap` *"लाइव नक्शा"* and `cmLiveMapSub` *"अभी बसें कहाँ हैं"*
(`i18n-hi.js:45`). Copy, do not rewrite. The states reuse what v2 has:
`bsNoPosition` (`buses.js:194`), `bsSeenNone` (`:205`), `bsSeenNoMatch` (`:206`),
`bsLinkGps` (`:208`), `bsNeedLinkGps`/`bsNeedLinkWhy` (`:221-222`). Genuinely new
ones — moving, standing, parked, "no position for N days", the no-picture
sentence — are registered with `hi: ''` (PENDING) and go to the owner, and no
builder guesses a Hindi sentence (`attention.js:147`).

---

## 7. How we will know it worked

Read after one week, then after one month. **This is the measurement Q9 was
missing**, and it is the reason the screen can be built on an unanswered question:
the screen is cheap, and it reports on its own usefulness.

| Number | Today | What success looks like |
|---|---|---|
| Who opens it, per person per day | 0 — the screen does not exist | The `usage` counter (`inventory/01 §2`), which is the instrument v2 kept for exactly this. **If only the owner opens it, the crew manager loses it and `caps.js` says why.** If nobody opens it twice in a month, it goes back on the dropped list and §5 of `v2-ux.md` was right |
| Taps to answer "where is every bus" | Unanswerable in v2 at any number of taps (§2) | **1 from Buses, 0 from the push that asked the question.** v1's best was 1 from a home card; if this ends up at 2, the entry row is in the wrong place (§8 question 2) |
| Taps to answer "where is this bus now" | 2-3 to a position that only exists if the bus misbehaved (`gpsevents`, §2) | **2**, to a position from live telemetry |
| Buses with a position drawn, against buses in the fleet | **UNKNOWN today, and must be read before stage 2** — `gpsLiveRegs` in `/health` (`inventory/04 §: health`) | Read once before building and once a week after. A map that draws 30 of 100 buses is not a UI result, it is a finding about the tracker contract, and it must be reported as one |
| Buses listed as "no position" that somebody then fixed — a plate linked, a tracker chased | 0; v1 drew them as absence (`app.js:3588`) so nobody could act | Any number above zero is this feature's own invention earning its place |
| Screens | 13 (12 nav) | **14, still 12 nav.** No new bottom tab, and `Caps.RETIRED.liveMap` empties (`caps.js:453`) |
| Simulated positions shown to anybody | v1 never showed them on these screens; `v2/sync.js:679` can fetch them | **0, by construction** — `/gps` is not called by this screen, and that should be a check that goes red if somebody wires it in |
| Time to first readable answer on the office machine | Unmeasured | Measured on the office machine with the fleet fixture, and written down with the number, before stage 3 reports done. No estimate in a commit message |

---

## 8. Owner must decide

Three questions. The first is the one that got this screen dropped, and it is the
reason this document is not cleared for stage 2 on its own.

1. **When do you open it?** Pick the moment, in one sentence: *the push at 1am*,
   *a bus broken down on the road*, *the morning glance*, or *something I have not
   listed*. This decides the refresh interval (a push at 1am needs a position now;
   a morning glance does not need one every 20 seconds), and it decides whether
   the list is ranked by *moving first* or by *silent first*. **I will not choose
   this one: `inventory/05 §2` records no role asking for a map, and guessing it
   is how a screen gets built that nobody opens** — which is the exact history of
   five screens this app has already deleted.

2. **Where should the way in be?** On **Buses**, which is the screen whose question
   is nearest (my default, 1 tap, 2 from anywhere), or on **Today**, which is where
   v1 put it for the owner (1 tap from his home, and a row on the most valuable
   screen in the app). If the answer to question 1 is "the morning glance", it
   belongs on Today and my default is wrong.

3. **Does the crew manager keep it?** He holds `liveMap` today in both v1 and
   `v2/caps.js:184`, v1 put a shortcut on his home, and **nothing in his job list
   explains why** (`inventory/05 §2.3`). Restoring the screen restores it to him,
   because the capability already names him — that is not a new grant, it is the
   existing list. Two consequences if you say yes: his device is sent **no**
   position history (`gpsevents` is owner and supervisor only, `inventory/03 §2`
   store 14), so his screen is empty whenever he is offline; and he would be able
   to see where every bus is at any hour. **Who may watch a bus is a people
   question in a business that handles cash, and `CLAUDE.md` says that is yours.**

**Also unknown, and smaller:**

- **Who pays for the map tiles, and whose tiles?** v1 draws OpenStreetMap's public
  tiles (`app.js:3568`). A hundred-bus fleet watched daily from an office is not
  what those public tiles are donated for, and a paid provider means a key that
  somebody has to hold (and that never goes in a document, a log or a commit —
  `CLAUDE.md`). This is a money-and-licence question, so it is yours, and it has no
  effect on anything else in this document.
- **Is the tracker feed alive?** Not a decision — a reading, `gpsLiveRegs` in
  `/health`. Somebody must read it before stage 2 starts, because a blank map is
  not a screen anybody can review.
- **Should any signed-in person be able to read any bus's position from the
  server?** The inventory has been asking since it was written (`02 §: open
  questions` item 9). Tightening it is a live behaviour change and your deploy;
  this feature does not depend on it, but it is the difference between a hidden
  screen and a real fence.

---

## 9. What this does not touch

- **`docs/v2/plan/outside-repair-ux.md` stands exactly as signed off.** Its §0
  names the live map as *"not in scope, named so nobody waits for it … its own
  feature"*, and that is this document. Its §5 drops v1's away-card latitude,
  longitude and map link with the line *"if the owner wants the pin it arrives with
  the live map, which is its own feature"* — and **the drop stays dropped**: this
  screen gets a position from the bus's tracker, so there is nothing for a
  supervisor to type and no coordinate field to restore (§6, "a bus that is away").
- **No capability is widened.** `liveMap` keeps the three roles it has held in both
  codebases. The only `caps.js` change is that `RETIRED.liveMap` empties because
  the capability finally has a screen.
- **No permission policy is decided here.** §8 question 3 and the `/gps` scope
  question are the owner's, and are written down rather than chosen.
- **No new store, no new field, no server write.** This feature reads
  `/gps/fleet`, `/gps/latest` and the `gpsevents` the device already holds. The one
  write it can reach — Link GPS on a bus — exists today and is unchanged.

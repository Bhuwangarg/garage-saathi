# INT — assembling the screen lifecycle

Stage 4. Branch `launch-v2`, HEAD at dispatch `86f66e5`. **Nothing committed and
no git command run** — the tree is dirty and the index is the owner's.

The brief was seven items that had "converged on one seam: how a screen is
mounted, unmounted, and whose data it holds". They are one defect with seven
faces, and this document is the seam first and the seven second.

---

## 1. The seam, settled

**`Shell.mount` owns the whole of a screen's life. A screen's load registers and
does nothing else.**

Before, `Shell.mount` rendered and nothing more, so a screen's own script-load
`mount()` was the only thing that ever installed its delegated `document`
listener. That one fact produced two opposite defects:

- the **nine** screens that called `mount()` at load — attention, buses, fuel,
  jobcard, jobs, money, people, reviews, store — installed a listener that
  outlived the screen for the whole session, and three of them (store, fuel,
  attention) kicked a `Cache.load` from there, before `boot.js` had created `S`;
- the **four** that did not — duty, gate, me, today — had no listener at all,
  because nothing else called `mount()` either. In a browser, Today (the owner's
  front door) and Me (a driver's and a conductor's whole app) answered no tap.

**And one of those four lost more than its taps.** `gate.js`'s `mount()` calls
`reload()`, which is the only place that fills `ui.running` from
`Night.running(date)` — tonight's list of buses that are actually going out.
With `mount()` never called, `ui.running` stayed `null` on first entry, and
`model()` falls back (`gate.js:478-482`) to *"the buses that already have a
check today"*. So the Gate round opened listing the buses somebody had already
started a check on, and **not the ones still due to depart** — which is the
exact shape of `v2-ux.md §4.1` #9's rule for this screen, "a count that can
never reach zero … which is exactly what picking tonight's buses fixes". A
supervisor at the gate saw the work that was done and not the work that was
left. It is fixed by the same one line as the taps: the frame calls `mount()`.

So:

```
Shell.mount(id, params)
  leave(id)                      <- the OUTGOING screen's unmount(), if it differs
  ... frame, nav, body as before ...
  if (allowed) enter(id)         <- the INCOMING screen's mount(), after body()
  listen()                       <- the frame's own one handler, installed once
```

`mounted` is the id whose module is live. `enter` runs on a **change**, not per
redraw, because `boot.js` re-mounts on every sync status change and re-entering
a screen forty times a minute would re-kick its store read forty times.
`Router.register` already stored the module whole and validated only `render`,
so `unmount` was reachable with **no router change**, exactly as the brief said.

Three consequences that are the rest of this document:

1. **A screen's listeners exist exactly while it is on the page.** Twelve
   `unmount`s written, gate's extended to remove its seven.
2. **Nothing runs at script load**, so `S` always exists by the time a screen
   reads a store.
3. **`[data-nav]` is the frame's attribute alone.** `duty.js` was the one screen
   reading it in its own handler, which only worked while every screen's
   listener happened to be installed before the frame's. Its gate row is now
   `data-act="gate"` + `data-to` + `data-check`, which is the decision
   `attention.js:1116` had already written down and acted on.

### Whose data a screen holds

**The replica belongs to one person, and when the person changes it is rebuilt.**

`Cache.scopeTo(userId)` records the id of the person the rows on this disk were
fetched for, in `localStorage['v2ReplicaFor']`, and `boot.js`'s `enter()` calls
it before a single store is read. A different person ⇒ every store is dropped
(`DB.pruneBefore` with a cutoff in the future, one transaction per store),
`Sync.reset()` rewinds both cursors, and the next pull refetches under the new
entitlement.

**Why a rebuild and not a role-scoped read**, which is the argument the brief
asked for:

- A read-side filter is a second copy of `v2_perms.redact_for` and
  `OWN_ROWS_ONLY` living on the device, and it is the copy that drifts.
  `caps.js` says the narrowing belongs *"IN THE QUERY, not in the view"*, and
  the query is the server's.
- The client **cannot express** the rules it would need. `crewnotes` must be
  withheld from the person it is *about* — not a row-ownership filter but its
  inverse — so a client filter would either leak or blank, and could not tell
  you which. That is the failure mode this repo has been bitten by most.
- Rows fetched under one person's entitlement are simply not the next person's
  to hold. That is a statement about provenance, which the client *can* know.

**Two stores are kept through a rebuild**, each for a reason that is not comfort:

| kept | why |
|---|---|
| `users` | the login roster. Purging it **locks the next person out** — the role and name picker reads it and `askRoster()` needs the network. It carries `{id, name, role, updatedAt}` and nothing else (REV-AUTH verified: no salt, no hash), and `/roster` publishes the same names unauthenticated. |
| `outboxbase` | device-local, never synced: what a pending change is measured against (`db.js:82`). Dropping it makes every unpushed edit unrebaseable. |

Everything else goes, read from `db.js`'s **own** `STORES` table rather than
restated — deny-by-default applied to retention, so a store added tomorrow is
rebuilt without anybody remembering to list it. The gate checks the keep-list
stays two names long.

**Four edges, each with a stated answer:**

- **The same person signing back in keeps their replica.** The rebuild is keyed
  on *who*, not on the fact of a sign-in. A purge on sign-out would mean an
  owner who signed out and back in at a gate with no network had nothing.
- **A device that has never pulled is claimed, not rebuilt** (`lastRev` and
  `tableMax` both zero ⇒ nothing was ever fetched under anybody's entitlement),
  so a first sign-in costs no sync.
- **A replica with no marker and a moved cursor is of unknown provenance and is
  rebuilt once.** Every device in the yard on the deploy that lands this has a
  full replica and no marker; treating that as "nothing was ever here" would
  leak for exactly one handover, which is the handover that matters. This is the
  same one-time-heal shape `sync.js`'s own `healOnce` already uses, and it costs
  one full sync per device.
- **A store holding unsent work is not purged.** `sync.js`'s push reads the row
  from the store at push time and drops the outbox key when the row has gone
  (`recordForKey` → `dropKey`), so purging it destroys the previous person's
  work in silence. Such a store is **sealed** instead: not read, not handed over
  as `[]`, and the marker is not written, so the next sign-in tries again.

And the fail-closed floor: if `cache.js` cannot see `db.js`'s store table at
all, it reads **nothing** rather than deciding there is nothing to purge. The
first draft of this returned an empty list there, which would have recorded the
rebuild as finished with every check green.

---

## 2. The seven, each with what was done

### 1. `store.js` threw on every page load — fixed at the root

`Uncaught (in promise) Error: cache.js needs boot.js (S) — not loaded`,
reproduced in the harness below before the fix and gone after it. Not patched
with a guard in `Cache.load`: the load-time `mount()` is gone, so the read now
happens when the frame asks, which is after `boot.js` has created `S`. fuel and
attention had the same call; fuel's was swallowed by its own rejection handler
and left the screen in a `failed` state until the next route change, which is
why nobody had seen it.

### 2. The listener leak — note 17's prescription, in its order

Twelve `unmount`s written; gate's extended from "clears a timer and resets
state" to also removing its seven listeners. **Then** the gate check, not
before. Every handler removed is the same named module-level function `mount()`
registered, and the two capture-phase listeners (`store`, `reviews` on `scroll`)
are removed **with the phase** — a removal that forgets `true` matches a
different listener, removes nothing, and reports nothing.

`attention.js` and `fuel.js` keep their `Router.onChange` subscription: the
router exposes no counterpart, their `onRoute` returns on any route that is not
theirs, and the `watching` flag keeps it to one. Clearing that flag without
removing the listener is what *would* stack a second one, so neither `unmount`
touches it. Stated rather than silently left.

### 3. Gate's hold timer

`unmount` already cleared it; nothing called `unmount`. It is called now, so the
path that handles navigating away mid-hold is live code. Checked by pressing the
hold control and leaving the screen before `HOLD_MS`.

### 4. The shared yard phone — REV-AUTH F1

See the seam above. `boot.js`'s `signOut()` comment — *"the next `Cache.load`
re-reads them under whoever is signed in then"* — is now true, and the comment
says where.

**One extra exposure found and closed on the way:** `boot.js`'s `enter()` read
all sixteen `FIRST_STORES` into `S.cache` **on a signed-out boot**, for a login
screen that reads `users` and `meta` itself. On a shared phone that put the last
person's rows into memory with nobody signed in to hold them — the same shape as
F1, one step earlier — and it bought the login nothing. It now loads only when
`S.user` is set.

### 5. `Shell.mount(null)` over a live session — REV-AUTH F7

`null` and `'login'` no longer route to the same place. `'login'` is
`signedOut()`; `null` with nobody signed in is `signedOut()`; `null` with
somebody signed in falls through to the normal frame and gets §1.10's
no-permission body, with its own dev line (`signed in holding nothing:
role=…`) because the cause is not a nav/declaration disagreement. `boot.js:267`
already said this state *"must not be quietly turned into the login screen"*.

### 6. Buses' cost sort — measured

Memoised on `Cache.sigOf` over the seven stores `Cost` reads, with the window
end **quantised to the minute and the quantised value passed to `Cost`**, so the
figure is exact for the instant it claims rather than approximately right for
now. The review said a memo "would not help: `now = Date.now()` is a fresh
argument each time" — true of a memo keyed on data alone, which is why the
bucket is in the key. Not a day key: a fill entered at 20:01 must show before
midnight. And `costTotals` now runs **after** the search filter.

Measured in node, model build only, no DOM — 89 buses, 9,570 rows at
`measure-pull.py` SHAPE volumes for the money stores, same machine, three runs
of each, the before-copy produced by inverting exactly these two changes:

| | before | after |
|---|---|---|
| first build, sort = running cost | 117.0 – 120.5 ms | 116.5 – 119.2 ms |
| **redraw (what a 4 s sync tick costs)** | **109.4 – 126.4 ms** | **33.1 – 41.3 ms** |
| redraw, sort = registration | 32.9 – 35.1 ms | 33.1 – 41.3 ms |
| narrowed to ONE registration | 73.5 – 87.6 ms | 0.6 – 2.0 ms |

So the ~75 ms of `Cost.forBus` is paid once per data change or per minute
instead of every four seconds, and the cost-sorted redraw now costs the same as
the registration-sorted one. **These are not the review's numbers and must not
be compared to them**: REV-FLOOR measured mount + forced style/layout in a real
browser (80–95 ms vs 15 ms) and this measures the model build in node. The
*ratio* and the *shape* agree; the absolute figures are from a different
instrument. Nothing here was measured on a Core 2 Duo.

### 7. `Cache.load` turning a failed read into `[]`

**`load`'s own comment already named the problem and then walked into it:** *"A
store that fails to read is left with whatever it had, or an empty list if it
had nothing — never left `undefined`, because `undefined` is how a screen tells
'not loaded' from 'empty' and a failed read is neither."* It is right that a
failed read is neither, and it stored it as "empty".

`undefined` is not the fix — a screen reads it as "still loading" and skeletons
for ever, which is the blanking failure. So there is a **third** place for the
fact:

```
S.cache[name]    unchanged: the rows, or [] , or undefined if never read
Cache.unread()   the names whose last read failed or was refused
```

and it is **load-bearing rather than available**: `Boot.replica()` ANDs
`complete` with "nothing is unread", so a store that could not be read makes
this device incomplete — which is `screens-shell.md §1.8`'s rule firing on all
thirteen screens at once, no aggregate figure drawn without `stale: true`. The
model also carries `unread` so a screen *can* say "could not read this" rather
than "there is nothing here" (`v2-ux.md §4.1` #7), and `load`'s comment now says
what it does.

---

## 3. What was added, and the proof

### `test_v2_browserpath.js` — the missing test seam

Every v2 module ends `if (module.exports) … else { root.Thing = api; … }`, and
all fourteen suites took the first branch. The `else` — the browser's — was
exercised by nothing, *which is how item 1 shipped*. `v2/login.js` says so in
its own registration comment.

This suite takes `v2/index.html`'s own script list, in index.html's own order,
runs every file as a classic script in **one shared context** with `#app`
already in the document (which is what makes `boot.js` boot), and then asks what
happened. `caps.js`, `router.js`, `cache.js`, `shell.js`, `login.js` and all
thirteen screens are the real files. `DB` and `Sync` are the real objects too,
with only the methods that would reach IndexedDB or the network replaced — and
the replacement happens **inside the load loop**, immediately after the file
that declares them, so every screen and the frame and boot run against a data
layer that answers rather than one that cannot open a database.

Two things it taught about itself, written into it so the next person does not
rediscover them:

- `DB`, `Sync` and `STORES` are top-level `const`s in classic scripts, so they
  are in the global **lexical** scope and not on `window`. A stub hung on
  `window` alone is a stub none of the modules can see.
- An unhandled rejection is reported to `process`, not to the page that caused
  it. The first version ran its cases concurrently and section 9's store.js
  mutant — which is *supposed* to reject — handed its rejection to section 1,
  which then failed for the right reason about the wrong page. Cases run one at
  a time.

40 checks. **This is a faithful page loader, not a browser**: there is no layout
engine, so it proves load order, listener lifetime, timers, routing, the cache
and the replica, and it proves nothing about paint. The real-browser half is
next.

### And a real browser, which is the other half

`/v2/index.html` served over http and driven in the same headless Chrome the
gate uses (`gstack`), with real IndexedDB. Verbatim:

```
== FIXED TREE ==
console errors      : 3 x net::ERR_CONNECTION_REFUSED   (the absent sync server)
S.route             : login
S.user              : null
#app children       : 1          <- the login DREW (note 18 is closed)
Shell._mounted()    : null       <- no screen is live before anybody signs in

-- driving the lifecycle, with document.addEventListener instrumented --
after sign-in,   mounted = today   listeners added/removed : 2/0
after go(store), mounted = store   listeners added/removed : 6/1
after go(today), mounted = today   listeners added/removed : 7/5

Shell.mount(null) over a live session:
  html.lg (login drawn) : false
  data-frame kept       : bar
  body says             : This is not open to youIf you need it, ask the owner.
  session still live    : {"id":"u-gatecheck","role":"owner","name":"Gate check"}
```

Seven installs and five removals across two route changes, netting the two a
single live screen plus the frame should hold — in real Chrome, on real
listeners. And F7 drawn the right way round, with the frame kept and the session
intact. The session was handed over through `Boot.enter`, which is the API
`login.js` itself calls; **no PIN was typed, read or logged**.

**What the real browser could NOT prove, and why.** Putting store.js's load-time
`mount()` back produced *no* console line at all — not the rejection the brief
quotes. That is a limitation of the instrument, not evidence the bug is absent:
`gstack`'s console collects console API calls, and an unhandled promise
rejection reaches Chrome as an uncaught exception instead. **The gate already
knows this** and says so beside its gallery check — *"The console log does not
hold an uncaught exception, so the page keeps its own list"* — and works around
it with a page-level error array, which `/v2/index.html` does not have and which
is not worth adding to the live document for a test.

So item 1 is proven in the page loader, where `process.on('unhandledRejection')`
catches it exactly: the message before the fix, nothing after it, and the mutant
reddens. The real browser proves the fixed tree is clean and proves the
lifecycle, the removals and F7. Neither half is the whole proof and both are
stated.

### The gate

`scripts/predeploy-gate.sh` grew a `── v2 screen lifecycle ──` section: per
screen, that a file installing a listener also removes one, exports `unmount`,
removes its capture-phase listeners in the capture phase, does not call its own
`mount()` at load, and leaves `[data-nav]` to the frame; plus the frame's three
lines and the replica's six. **250 → 337 checks, 0 failed.**

Note 17's ordering rule was followed: step 2 (all thirteen screens) was finished
and green before step 3 (the check) was written, so the check has never failed
thirteen times and nobody has had cause to bypass it.

**Every one of those checks was then broken on purpose and watched go red**, and
two of the fourteen mutants came back alive. One was a bad mutant — it added a
comment, which is not a break. The other was a genuine hole and is the most
useful thing in this section:

> **`store.js stops removing its listeners` SURVIVED.** The check asked whether
> the file contained *at least one* `removeEventListener`. Deleting store.js's
> click, input and change removals left its scroll removal behind, so the check
> passed a file that installs four listeners and removes one. A check that
> cannot tell four-of-four from one-of-four is decoration with a tick beside it.

It now compares the **sorted list of event types added against the list
removed**, plus a matching pair for the types registered through a loop (which
is how `gate.js` installs its five hold-stop handlers from one literal). The
same mutant, re-run against the strengthened check:

```
✗ store.js removes every event type it adds
    (got "'change' 'click' 'input' 'scroll' ", expected "'scroll' ")
RESULT: 336 passed, 1 failed
```

Two other things about that section worth keeping. Its first version stripped
comments with `sed` and `tr`, and **the strip was the bug** — it mangled
`buses.js`'s export line and reported a file with three listeners as installing
none, wrong in the direction that passes. Every pattern now tells code from
prose on its own: a leading dot (`.removeEventListener(`), a line-anchored
statement (`^  mount();`), or a full call (`closest('[data-nav]')`). And the
check on the replica scope follows **both** halves of the call — the one that
seals the device and the `await` that happens before anything is read — because
a check that followed only the first would pass a version that seals and never
finishes.

Every mutation was applied to the file on disk, the gate was run, the file was
restored, and the restore was verified by `sha256`. All of them matched.

---

## 4. Still broken, or still somebody's call

Never softened. A known break that is written down is a decision.

1. **The one-time rebuild costs one full sync per device.** Every phone in the
   yard has a replica and no marker, so the first sign-in after this deploy
   drops and refetches it. A device that is offline at that moment has an empty,
   honestly-stale app until it next has signal. This is the same cost
   `sync.js`'s `healOnce` already accepted, and it is the owner's call whether
   to land it on a day the yard has wifi.
2. **A store holding unsent work stays on disk for one more handover**, sealed.
   Deliberate: the alternative is destroying a supervisor's gate check or a
   storekeeper's shelf count. Nothing is read from it meanwhile.
3. **`v2_perms.OWN_ROWS_ONLY` is not mirrored and must not be.** The rebuild
   means the next person refetches under their own entitlement, so what they end
   up holding is whatever the *server* sends them. **F2 is therefore still live**
   — a mechanic still receives every job card in the fleet, because `jobcards`
   has no `OWN_ROWS_ONLY` row. That is a server change and the owner's call, and
   nothing on the client can stand in for it.
4. **F3, F4, F5, F6 are untouched.** All four are `sync_server.py` /
   `v2_perms.py`, which this stage was told not to reach into, and F3 and F6 are
   explicitly the owner's decisions (Q4; and whether a `done` card with no
   `closedBy` should be refused).
5. **`title(nameOf(id))` still runs before the `allowed` test**, so a refused
   screen draws the right body under the wrong header — the cosmetic residue
   REV-AUTH logged beside F7. Left alone: it is a one-line change to the frame's
   draw order and it belongs with whoever next touches the header, not folded
   into a lifecycle commit.
6. **No Core 2 Duo, and no real Windows 7 Chrome 109.** Every number in section
   2.6 is from this machine.
7. **`unread` is in the model and no screen reads it yet.** The *distinction* is
   restored at the foundation and is load-bearing through `replica().complete`,
   but a screen that wants to say "Gate checks could not be read on this phone"
   rather than marking its figures stale needs a line of its own — which is a
   stage-3 edit on thirteen screens, not a stage-4 one.

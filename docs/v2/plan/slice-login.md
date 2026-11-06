# Slice LG — the login screen

Wave 6, slice 1 of 1. **Blocking: v2 cannot be opened by a person until this
exists.** Integration note 18 is the finding; this is the work.

## Why this slice exists and no earlier one did

Login is not one of the twelve screens, and that is correct. In v1 it lives
outside `render()` (`inventory/01-screens-and-nav.md:38`: `renderLogin` →
`renderRolePick` → `renderPin`), so the reduction that produced the twelve — a
reduction *of routes* — never saw it. Deny-by-default finishes the job: login
must be reachable holding **no capability**, so it can never appear in
`Caps.SCREENS`, and `Caps.SCREENS` is the list every dispatch, suite and gate was
derived from. Four plan documents each scope login out of themselves and none
scopes it in; `screens-shell.md §1.7` is explicit — "the shell's only job here is
the handover".

Stage 1 and stage 2 are already done for this screen. You are stage 3.

- **UX** — `v2-ux.md §6` and the facts below.
- **UI** — `v2/ui/login.css` is built: 154 lines, the whole `.lg*` family
  (`.lg-mark`, `.lg-biz`, `.lg-top`, `.lg-back`, `.lg-list`, `.lg-who`,
  `.lg-ava`, `.lg-tag`, `.lg-label`, `.lg-search`, `.lg-pad`, `.lg-dot`,
  `.lg-dots`, `.lg-crumb`, `.lg-cancel`, `.lg-build`, `.pinpad`, `.userpick`),
  plus `[data-v2].lg`. **Read it first and build to the markup it already
  expects.** Do not add a stylesheet; do not restyle it. If you need a class it
  does not have, say so in your report rather than inventing one.

## Where the file goes, and why not in `screens/`

**`v2/login.js`**, beside `boot.js` and `shell.js` — **not** `v2/screens/login.js`.

`screens/` is exactly the thirteen capability-guarded modules, and several checks
depend on `readdirSync('v2/screens')` agreeing with `Caps.SCREENS`
(`test_v2_boot.js`'s `SCREENS_SLOT`). Login is definitionally outside that set,
so a file in `screens/` would put those two lists permanently at odds.
`v2/shell.js:61` already says it: `const LOGIN = 'login'; // not one of the
thirteen: nobody is signed in`.

It registers **nothing** with `Router` and appears **nowhere** in `caps.js`.

## The two seams you must add, and they are the hard part

### 1. The shell hand-off has no other side

`Shell.mount('login')` (`v2/shell.js:553`) delegates to `signedOut()` (`:504`),
which empties `#app`, removes `data-frame` and adds `lg` so `login.css` owns a
bare viewport. **That is correct and must stay.** But nothing then draws, which
is why `/v2` is a white page today.

Add the call, in `signedOut()`, after it has cleared `#app` — the same shape as
`renderBody`'s `allowed ? … : refused(…)`: if a login module is present, put its
markup into `#app`; if it is absent, `signedOut()` must behave exactly as it does
now. Keep `signedOut()`'s return contract.

### 2. There is no path from "just signed in" to "app running"

`Boot.start()` opens with `if (started) return` (`v2/boot.js:270`) and
`restoreSession()` runs once inside it. `redraw()` and `wireSync()` are private
and `Boot`'s api is `{S, DESK_WIDTH, DESK_POINTER, DENSITY_MS, density, replica,
start}`. So after a successful `Sync.login` there is no supported way to enter the
app. v1 had `enterApp(user)` (`app.js:13947`); v2 has no equivalent.

Add one to `boot.js` — the smallest thing that re-runs the post-session half of
`start()`: restore the session, route to `firstScreen()`, wire sync, load
`FIRST_STORES`, redraw. **Do not** remove or weaken the `started` guard, and do
not make `start()` re-entrant: a second full boot would re-install the density
watcher and the `onChange` subscription. Give the new entry point its own name
and let both it and `start()` share the one body they need.

Sign-out needs the mirror of it: back to `login` without reloading the document.

## The flow, from v1, and what changes

Three steps, as v1 has them — role tiles → names → PIN pad:

| Step | v1 anchor | v2 |
|---|---|---|
| Role tiles, plus "recent on this phone" | `app.js:13509` `renderLogin` | `.lg-list` of `a.v2row`; roles that have at least one user, from the local `users` store. `NO_LOGIN_ROLES` is empty (`app.js:13438`) so all 8 roles sign in |
| Name list, searchable past 6 | `app.js:13562` `renderRolePick` | `.lg-who` / `.lg-ava`; `.lg-search` only when the list is longer than six |
| PIN pad, auto-submits on the 4th digit | `app.js:13602` `renderPin` | `.lg-pad` / `.pinpad`, `.lg-dots` of `.lg-dot`. **No `[data-k]` digit may be echoed anywhere** |

`.lg-back` / `.lg-top-back` walks back a step; `.lg-crumb` shows where you are.

## The authentication contract — read `v2/sync.js:280` before you write a line

`Sync.login(userId, pin, opts)` already exists and is the only thing you call. Its
answers, each of which needs its own visible state:

| Answer | Meaning | What the screen does |
|---|---|---|
| success | `{token, user}`, `user.id === userId` asserted; token persisted | enter the app via your new boot seam |
| `{rejected: true, known: true}` | server holds the account, PIN is wrong — **final** | refuse. Do **not** try the device PIN |
| `{rejected: true, known: false}` | account exists only on this device (bulk-seeded crew) | fall back to the device PIN |
| `{rejected: true, known: true, reason}` | `403` — a PIN printed in public source, or `'mismatch'` | refuse, finally, offline too |
| `{locked: true, retryAfter}` | `429`, too many attempts | say so, with the wait, and stop accepting digits |
| throws / network | cold or unreachable server | fall back to the device PIN; never a silent dead keypad |

Three things that are easy to get wrong and are not negotiable:

1. **`known: true` must never fall back to the device PIN.** That is the whole
   point of the flag — a wrong PIN the server is sure about stays wrong offline.
2. **The owner, supervisor and crew manager have no device PIN at all** (stage 1
   §6), so for those three the login *is* one network request, and a cold
   container is 30–36 s ([E] 6fa0a6d). `warmUp()` must fire when the pad opens,
   not when the 4th digit lands. The waiting state is `login.css`'s.
3. `opts.timeoutMs` defaults to 8 s and `sync.js`'s own comment says to pass
   longer for exactly those three roles, who have nothing to fall back to.

## Rules that bind this slice

- **Deny-by-default is not weakened.** Login holds no capability and grants none.
  Nothing here may read or write `Caps`, and signing in must not be able to put a
  role on a screen `Caps.screensFor` does not return.
- **The floor**: Chrome 109 / Windows 7. No `oklch()`, `color-mix()`, CSS
  nesting, `@starting-style`, subgrid, `text-wrap: balance`, `Object.groupBy`,
  `toSorted`, `Promise.withResolvers`. No emoji — inline SVG via `ui/icons.js`.
  `scripts/check-floor.py` enforces it.
- **Never render a PIN.** Not in the DOM, not in a title, not in a log, not in a
  test fixture's expected output. The dots are a count, never the digits.
- **Zero and unknown must never look alike** (`v2-foundation-ui.md §3.6`) — "no
  recent users on this device" is not an empty list drawn as nothing.
- The field-guard rule every screen carries: declare the field selector and guard
  a field **before** reading `data-act`. The gate checks both per file.
- `window` globals only, classic script, IIFE, `module.exports` test seam. Match
  the shape of the thirteen — but note that the `else` branch of that seam is
  **never exercised by a node suite**, which is how six screens came to call
  `mount()` at load time and how `store.js` came to throw against a `boot.js`
  that had not loaded yet. Your browser path needs a check that is not a node
  suite: say in your report how you proved it.

## What to wire, and what not to

Wire `v2/login.js` into `v2/index.html`, `v2/sw.js`'s precache and
`test_v2_boot.js`'s `ORDER`/`DEPS` tables. index.html's list and sw.js's precache
must stay **identical, entry for entry and in order** — `test_v2_boot.js` checks
exactly that. It loads after `shell.js` and before `boot.js`.

**Run no git command at all** — not `status`, not `add`, not `commit`. I hold the
index. Leave the tree dirty and tell me what you changed.

## Proof I will accept

A suite `test_v2_login.js` in the shape of the other thirteen, and **mutation
tested**: for each rule above that matters, break it in the source, show the check
that reddens, restore the file byte-identically. A check that cannot fail is
decoration. Report the mutants that initially *survived* — those are the holes,
and the two slices that found their own survivors last wave produced the
strongest suites.

Then: `node test_v2_login.js`, `node test_v2_boot.js`,
`python3 scripts/check-floor.py v2 ui`, `bash scripts/check-v2-isolation.sh`,
and `bash scripts/predeploy-gate.sh` (250 checks today; it must not fall).

Report: status, checks, mutants reddened, mutants that survived and what you did
about them, anything you believe is wrong in this brief, and anything you found
outside your slice.

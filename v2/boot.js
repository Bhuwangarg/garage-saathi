/* Garage Saathi v2 — boot. The last script, and the only one that calls anything.
 *
 * Every other module in v2 declares and returns: `db.js`, `sync.js`,
 * `pullapply.js`, `night.js`, `caps.js`, `router.js`, `cache.js`, the `ui/*`
 * builders and every screen. None of them runs anything at load. This file is
 * where the app starts, which is why it is last in `index.html` and why there is
 * exactly one of it.
 *
 * It owns four things:
 *
 *  1. `S` — the app state. Created here because `router.js` reads the role from
 *     `S.user` at call time, `cache.js` writes `S.cache`, and the screens read
 *     both. One object, created by the script that loads last, so nothing can
 *     capture it before it exists.
 *
 *  2. Density. The machine chooses it, not the role (`screens-shell.md §1.2`),
 *     and it is re-evaluated on the only `resize` listener in the app.
 *
 *  3. The sync wiring. Four callbacks, and the absence of a fifth — see
 *     `wireSync()`.
 *
 *  4. `replica()` — `{behind, complete}` from one place, so the frame and all
 *     thirteen screens cannot disagree about whether this device has everything.
 *     `screens-shell.md §1.8` turns that into a rule with teeth: no aggregate
 *     figure may be drawn without `stale: true` while `complete` is false, and a
 *     screen that computed its own answer would be the way that rule rots.
 *
 * What it deliberately does NOT do: draw. The frame, the nav and the screen are
 * `Shell.mount(screenId)`'s, which is the integrator's named seam. Boot decides
 * WHICH screen and when; it writes no markup.
 */
(function (root) {
  'use strict';

  /* The app state. Four fields and no more:
   *   user  — the signed-in person, or null. The role lives here, and `caps.js`
   *           and `router.js` read it at call time.
   *   route — the current screen id, mirrored from Router.onChange so a screen
   *           can read it without reaching into the router.
   *   stack — the one-deep back stack, mirrored the same way (`router.js`).
   *   cache — the in-memory store copies, written only by `Cache.load`.
   * A fifth field here would be state with no owner, which is how v1's globals
   * got to where they are. */
  const S = { user: null, route: null, stack: [], cache: {} };

  /* Both clauses of the density rule, evaluated separately.
   *
   * `screens-shell.md §1.2` writes them as one media query. They are two here so
   * that each can be observed on its own, because dropping either one is a
   * DIFFERENT bug and a check has to be able to tell them apart: width alone
   * puts a desk rail on a tablet in landscape, which is also 1024x768 and is
   * held in two hands; `pointer: fine` alone puts 32 px rows on a 1366x768
   * touchscreen laptop. Both failures were named in the foundation (§3.7.2)
   * before either was written, and neither is visible in a number. */
  const DESK_WIDTH = '(min-width: 1024px)';
  const DESK_POINTER = '(pointer: fine)';

  // One evaluation per 250 ms, per §1.2. A resize is a stream of events, and
  // re-reading two media queries per event would be the cheapest possible way to
  // make a window drag feel like the app is thinking.
  const DENSITY_MS = 250;

  /* Housekeeping runs after the first paint, never before it. Pruning a year of
   * GPS events is one transaction per store and the yard is waiting on a screen;
   * the rows have been there for a year and can wait eight more seconds. */
  const PRUNE_DELAY_MS = 8000;

  /* Redraws are coalesced. `onStatus` fires several times per sync tick and the
   * poller ticks every four seconds, so an un-coalesced redraw would re-mount
   * the whole screen on a timer for a device that is merely online. */
  const REDRAW_MS = 120;

  // The one screen outside the capability table, because nobody is signed in
  // when it is drawn and a signed-out device holds nothing (`router.js`).
  const LOGIN = 'login';

  /* Every dependency is resolved at CALL time, never captured at load.
   *
   * `DB` and `Sync` are top-level consts in classic scripts, the rest are
   * globals their own file assigns. Resolving per call is this codebase's idiom
   * (`v2/night.js`, `v2/router.js`) and it is what makes the load order a
   * dependency order rather than a load-time coupling: a module that captured
   * its neighbours at load would turn every ordering mistake into a blank page,
   * which is exactly what `test_v2_boot.js` is checking cannot happen. */
  function pick(name) {
    if (typeof root !== 'undefined' && root && root[name]) return root[name];
    return undefined;
  }
  function db() { return (typeof DB !== 'undefined' && DB) || pick('DB') || null; }
  function sync() { return (typeof Sync !== 'undefined' && Sync) || pick('Sync') || null; }
  function caps() { return (typeof Caps !== 'undefined' && Caps) || pick('Caps') || null; }
  function router() { return (typeof Router !== 'undefined' && Router) || pick('Router') || null; }
  function cache() { return (typeof Cache !== 'undefined' && Cache) || pick('Cache') || null; }
  function pullApply() { return (typeof PullApply !== 'undefined' && PullApply) || pick('PullApply') || null; }
  function shell() { return (typeof Shell !== 'undefined' && Shell) || pick('Shell') || null; }

  /* ===== Density ========================================================= */

  function mq(q) {
    const m = root && root.matchMedia;
    // No matchMedia at all → yard. Yard is the default AND the safe failure:
    // a 64 px row on a desk is merely roomy, a 32 px row in a yard is unusable.
    if (typeof m !== 'function') return false;
    try { return !!m.call(root, q).matches; } catch (e) { return false; }
  }

  // 'desk' or 'yard'. Role is not in this rule: a supervisor at the gate on a
  // phone gets yard and the same supervisor at the office desk gets desk.
  function density() {
    return (mq(DESK_WIDTH) && mq(DESK_POINTER)) ? 'desk' : 'yard';
  }

  /* `data-density` goes on `<html>`, beside `data-v2` — `tokens.css` requires
   * them on the SAME element, because its dark guard is
   * `[data-v2]:not([data-theme="light"])` and that selector only sees
   * `data-theme` where `data-v2` is. `index.html` ships `data-density="yard"`
   * already, so the first paint is never undensified and this only ever
   * corrects it. */
  let applied = null;
  function applyDensity() {
    const d = density();
    const el = root && root.document && root.document.documentElement;
    if (el && el.setAttribute) el.setAttribute('data-density', d);
    // The nav is a bar at yard and a rail at desk, so a density CHANGE is a
    // different frame and not a restyle of the same one. The first evaluation is
    // not a change: start() draws the frame itself, immediately after this, and
    // a redraw queued here would be a second mount of the same screen.
    const changed = applied !== null && d !== applied;
    applied = d;
    if (changed) redraw();
    return d;
  }

  let densityTimer = null;
  let watching = false;
  /* The only `resize` listener in the app (§1.2). Guarded so a second call
   * cannot add a second one: two listeners is two evaluations per event, which
   * is the debounce defeated by the thing it was added for. */
  function watchDensity() {
    if (watching || !root || typeof root.addEventListener !== 'function') return;
    watching = true;
    root.addEventListener('resize', function () {
      if (densityTimer) clearTimeout(densityTimer);
      densityTimer = setTimeout(function () { densityTimer = null; applyDensity(); }, DENSITY_MS);
    });
  }

  /* ===== The replica, in one place ======================================= */

  /* `{behind, complete}`, the only answer in the app to "does this device have
   * everything yet?".
   *
   * `skipCount` is `Sync.info().notStored` — records the pull could not store.
   * They count against completeness because the cursor is held behind them and
   * the replica really is short (`v2/pullapply.js:219`). Reading it from
   * anywhere else is how a screen ends up drawing an incomplete total as final,
   * which is [E] 2170703. */
  function replica() {
    const pa = pullApply();
    const s = sync();
    const i = (s && s.info) ? s.info() : {};
    if (!pa || !pa.replicaState) return { behind: 0, complete: false };
    return pa.replicaState(i.lastRev, i.tableMax, i.notStored);
  }

  /* ===== Drawing, which is Shell's ======================================= */

  let redrawTimer = null;
  function redraw() {
    if (redrawTimer) return;
    redrawTimer = setTimeout(function () {
      redrawTimer = null;
      const sh = shell();
      if (!sh || typeof sh.mount !== 'function') return;
      const cur = router() && router().current ? router().current() : null;
      /* A screen that throws must not stop the next redraw: the timer has
       * already been cleared, so swallowing this leaves the app drawing. The
       * console line is the half that matters — a swallowed exception with
       * nothing written down is how a screen stops redrawing and nobody finds
       * out (`v2/router.js:111` learnt the same thing about its listeners). */
      try { sh.mount(cur && cur.id ? cur.id : S.route); } catch (e) {
        if (typeof console !== 'undefined' && console.error) {
          console.error('[v2] Shell.mount failed for ' + (cur && cur.id), e);
        }
      }
    }, REDRAW_MS);
  }

  /* ===== Sync ============================================================= */

  /* Four callbacks, and the absence of a fifth.
   *
   * `v2/sync.js` also accepts a callback that counted discarded local edits.
   * It is not wired here and is not named here, because `INTEGRATION-NOTES` 4
   * says it can no longer fire at all: B3 keeps the key in the outbox and the
   * server merges it, so there is no discarded edit left to count. A callback
   * that cannot fire is worse than none — the next person reads the wiring and
   * believes conflicts are handled.
   *
   * An absence has to be checked or it comes back, so `test_v2_boot.js` greps
   * this file for that callback's name. Which is also why this comment describes
   * it instead of spelling it: a check that trips on prose about itself teaches
   * people to delete checks (`scripts/check-v2-isolation.sh` learnt that the
   * hard way on its own invariant 3).
   *
   * What replaces it is `onRefused(n, reasons)`: a refusal the device could not
   * resolve, which is a named reason and a Retry rather than a dialog
   * (`v2-contract.md §4.0`). It reaches the person through `Sync.info()` —
   * Me's device card and the nav's "Me (3)" count — so the handler's whole job
   * is to redraw. */
  function wireSync() {
    const s = sync();
    if (!s || typeof s.start !== 'function') return false;
    s.start({
      onStatus: function () { redraw(); },
      onApplied: function () { refresh().catch(function () {}); },
      onRefused: function () { redraw(); },
      onStoreFail: function () { redraw(); },
    });
    return true;
  }

  /* Re-read whatever the screens are already holding, then redraw.
   *
   * `Cache.load` with no names re-reads only the stores that already have a copy
   * and that `v2/db.js` marked dirty, so a pull that applied nothing this device
   * cares about costs nothing here. */
  async function refresh() {
    const c = cache();
    if (c) await c.load();
    redraw();
  }

  /* ===== The session ====================================================== */

  // The signed-in person, or null. The token carries the user id and nothing
  // else (`Sync.tokenUser`), so the role is one get by id — never a store scan,
  // because the nav is the one thing on screen that must not wait for data.
  async function restoreSession() {
    const s = sync(), d = db();
    const id = (s && s.tokenUser) ? s.tokenUser() : '';
    if (!id || !d || !d.get) { S.user = null; return null; }
    try { S.user = (await d.get('users', id)) || null; } catch (e) { S.user = null; }
    return S.user;
  }

  /* The screen this device opens on.
   *
   * `screensFor` is capability-ordered, so the first held screen is the role's
   * front door. Null means signed in and holding nothing, which is a real state
   * with its own frame (`screens-shell.md` §1.7's no-permission body) and must
   * not be quietly turned into the login screen. */
  function firstScreen() {
    const r = S.user && S.user.role ? String(S.user.role) : null;
    if (!r) return LOGIN;
    const c = caps();
    const held = (c && c.screensFor) ? c.screensFor(r) : [];
    return held.length ? held[0] : null;
  }

  /* ===== start ============================================================ */

  let started = false;

  /* The boot sequence, in the order `screens-shell.md §1.8` specifies — the
   * frame and the nav first, from the session alone, and data behind them.
   * Eight distinct causes of "everything exists, just no data" is why the order
   * is a specification and not an implementation detail. */
  async function start() {
    if (started) return;                   // one boot per document
    started = true;

    applyDensity();
    watchDensity();

    const r = router();
    if (r && r.onChange) {
      /* `S.route` is a mirror, not the route. `router.js` owns it and is the
       * only thing that may change it; this copy exists so a screen can read
       * where it is without reaching into the router.
       *
       * `S.stack` is NOT mirrored. The one-deep back stack is the router's and
       * it exposes no accessor for it (`onChange` hands over `{id, params}`),
       * so a copy here could only be a second stack that disagrees with the
       * first. It stays the empty array the state shape declares. */
      r.onChange(function (cur) {
        S.route = cur && cur.id ? cur.id : null;
        redraw();
      });
    }

    await restoreSession();

    // First paint: the frame, the nav and a skeleton body. No store read has
    // happened yet beyond the one get above, and none is waited on.
    const first = firstScreen();
    if (first && first !== LOGIN && r && r.go && r.go(first)) {
      // Router.onChange redrew it.
    } else {
      S.route = first;
      redraw();
    }

    wireSync();

    // Then the data the first screen draws from. FIRST_STORES is
    // `v2/pullapply.js`'s list, deliberately short, and is reused rather than
    // restated: a second list of first stores is a second list to forget.
    const pa = pullApply();
    const c = cache();
    if (c && pa && pa.FIRST_STORES) await c.load(pa.FIRST_STORES).catch(function () {});
    redraw();

    // Housekeeping last, and on a timer: see PRUNE_DELAY_MS.
    setTimeout(function () { if (c) c.prune().catch(function () {}); }, PRUNE_DELAY_MS);
  }

  const api = {
    S: S,
    DESK_WIDTH: DESK_WIDTH,
    DESK_POINTER: DESK_POINTER,
    DENSITY_MS: DENSITY_MS,
    density: density,
    replica: replica,
    start: start,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.S = S; root.Boot = api; }

  /* And this is the one call in the whole of v2's load.
   *
   * It runs at the bottom of the document, where the parser has already built
   * `#app`, rather than on the `load` event: `load` waits for every stylesheet
   * and image, and the frame does not need them to be drawn.
   *
   * The `#app` test is the condition and not a guard around one: boot mounts
   * into `#app`, so without it there is nothing to boot and calling start()
   * would be calling Shell against a document that has no root. It is also what
   * keeps a node suite loading these same sources in a stub window from booting
   * an app nobody asked for. */
  const _root = root && root.document && root.document.getElementById
    ? root.document.getElementById('app') : null;
  if (_root) start();
})(typeof window !== 'undefined' ? window : this);

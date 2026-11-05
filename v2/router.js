/* Garage Saathi v2 — the route, the one-deep back stack, and the enforcement.
 *
 * There is NO URL routing (v2-ux.md §2.1). So there is no address bar to read,
 * no deep link to guard and no history to fall into: the route is this module's
 * own variable, and the only way it changes is `go()`. That is what makes the
 * check in front of it total — `go()` consults `Caps` BEFORE it changes
 * anything, and there is no second door.
 *
 * Three ways a screen is unreachable, and they are deliberately the same way:
 *
 *   1. it is not in `Caps.SCREENS` at all;
 *   2. it is, and it declares nothing (or nothing the reader holds);
 *   3. its module never registered, so there is nothing to draw.
 *
 * All three return false from `go()`, leave `current()` exactly as it was, and
 * say nothing to the person. NO TOAST — screens-money-people.md §0.1: "A screen
 * the viewer does not hold is not in their nav and the route does not resolve;
 * they stay on the screen they were on. No toast — a message about a screen
 * nobody asked for is noise." This module therefore contains no toast, confirm
 * or alert call at all, and test_v2_router.js greps it to keep it that way, for
 * the same reason F2's module is grepped for `onConflict`: an absence that
 * matters has to be checked, because nothing else will notice it coming back.
 *
 * The role comes from `S.user` at CALL time, never at load time. v2/night.js
 * resolves `DB` the same way and for the same reason: `S` is created by
 * `boot.js`, which loads last, and a reference captured at load would be
 * `undefined` for ever. A signed-out device has no role and therefore holds no
 * screen — which is the right default and not an accident of ordering.
 */
(function (root) {
  'use strict';

  /* Registered screen modules, by id. A screen that never registered is
   * unreachable the same way an unheld one is: the person would otherwise land
   * on a drawn frame with an empty body, which is [E] 2170703's whole shape —
   * "everything exists, just no data", eight distinct causes, one symptom. */
  const modules = {};

  const listeners = [];

  let cur = { id: null, params: null };

  /* One deep. Not a history list: `screens-shell.md §1.6` has three places the
   * route is shown and none of them is an address bar, so a multi-step stack
   * would be invisible state. Thirteen screens with one parent between them
   * (`jobcard` under `jobs`) need exactly one. */
  let stack = [];

  function caps() {
    return typeof Caps !== 'undefined' ? Caps
      : (typeof root !== 'undefined' && root && root.Caps) || null;
  }

  // The signed-in role, or null. Null holds nothing.
  function role() {
    const s = typeof S !== 'undefined' ? S : (root && root.S) || null;
    const u = s && s.user;
    return u && u.role ? String(u.role) : null;
  }

  /* Params are cloned on the way in and on the way out. The screen slices hold
   * on to what `current()` gives them, and a shared object would let one screen
   * edit another's route — the sort of thing that works until two screens are
   * open in two tabs on the office PC. */
  function cloneParams(p) {
    if (p == null || typeof p !== 'object') return p == null ? null : p;
    const out = {};
    const keys = Object.keys(p);
    for (let i = 0; i < keys.length; i++) out[keys[i]] = p[keys[i]];
    return out;
  }

  /* A screen module registers itself at load (`screens/*.js` are classic
   * scripts and draw nothing until `Shell.mount` asks).
   *
   * Refused, and NOT thrown, in two cases: an id that is not one of the
   * thirteen, and a module with no `render`. Both refusals leave the screen
   * unreachable, which is the deny-by-default shape — a module registered under
   * a name with no declaration beside it would be a fourteenth screen nobody
   * wrote a permission for, and that is the v1 defect with extra steps.
   * Returns true when the module is now registered.
   */
  function register(id, mod) {
    const C = caps();
    if (!C || !C.SCREENS[id]) return false;
    if (!mod || typeof mod.render !== 'function') return false;
    modules[id] = mod;
    return true;
  }

  // What the Shell needs to draw a screen. The seam named in the cut is
  // `Shell.mount(screenId)` + `Router.register(id, mod)`; this is how the one
  // reaches the other without the Shell keeping a second registry.
  function moduleFor(id) {
    return Object.prototype.hasOwnProperty.call(modules, id) ? modules[id] : null;
  }

  // Everything `go()` needs to say yes. Kept separate so the Shell and the nav
  // can ask the same question without moving the route.
  function reachable(id) {
    const C = caps();
    if (!C) return false;
    if (!C.SCREENS[id]) return false;
    if (!moduleFor(id)) return false;
    return C.holds(role(), id);
  }

  function notify() {
    const snap = current();
    for (let i = 0; i < listeners.length; i++) {
      /* A listener that throws must not take the route down with it: `go()`
       * never throws, and it has already changed the route by the time these
       * run. The console line is for the dev build — a swallowed exception with
       * nothing written down is how a nav stops redrawing and nobody finds out.
       */
      try { listeners[i](snap); } catch (e) {
        if (typeof console !== 'undefined' && console.error) {
          console.error('[v2] route listener failed for ' + snap.id, e);
        }
      }
    }
  }

  /* `go(id, params) -> bool`. False when unreachable, and then `current()` is
   * unchanged. Never throws. Says nothing to the person.
   */
  function go(id, params) {
    if (!reachable(id)) return false;
    if (cur.id === id) {
      // Same screen, possibly new params (a different job card). The stack does
      // not move: you have not gone anywhere new.
      cur = { id: id, params: cloneParams(params) };
      notify();
      return true;
    }
    const C = caps();
    const parent = C.SCREENS[id].parent;
    /* One deep: remember where we came from only when the new screen is a
     * detail of it. Anything else is a sideways move in the nav, and a nav move
     * has nothing above it — which is why `back()` on a nav screen does nothing
     * rather than guessing. */
    stack = (parent && parent === cur.id && cur.id) ? [cur] : [];
    cur = { id: id, params: cloneParams(params) };
    notify();
    return true;
  }

  /* One step up to the parent screen, never into history.
   *
   * The remembered route first, the declared parent second, and nothing third:
   * a back control with nowhere to go is not drawn (screens-shell.md §1.4.1 —
   * "a back arrow pointing at nothing is the same lie"), so this returning
   * false is the honest answer rather than a fallback to Today.
   */
  function back() {
    const from = stack.length ? stack[stack.length - 1] : null;
    const C = caps();
    const declared = (C && cur.id && C.SCREENS[cur.id] && C.SCREENS[cur.id].parent) || null;
    const up = from ? from.id : declared;
    if (!up) return false;
    const params = from ? from.params : null;
    if (!reachable(up)) return false;   // the parent is checked like any route
    stack = [];
    cur = { id: up, params: cloneParams(params) };
    notify();
    return true;
  }

  function current() {
    return { id: cur.id, params: cloneParams(cur.params) };
  }

  function onChange(fn) {
    if (typeof fn === 'function' && listeners.indexOf(fn) === -1) listeners.push(fn);
  }

  const api = {
    register: register,
    moduleFor: moduleFor,
    reachable: reachable,
    go: go,
    back: back,
    current: current,
    onChange: onChange,
    // Test seam only. The office never resets a route; a node suite that could
    // not would have to reload the module for every case.
    _reset: function () { cur = { id: null, params: null }; stack = []; listeners.length = 0;
                          Object.keys(modules).forEach(function (k) { delete modules[k]; }); },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Router = api;
})(typeof window !== 'undefined' ? window : this);

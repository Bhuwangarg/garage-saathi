/* Garage Saathi v2 — the app frame. Four elements, thirteen screens inside them.
 *
 * `boot.js` decides WHICH screen and when; this file draws it. The seam is
 * `Shell.mount(screenId)` + `Router.register(id, mod)`, and it is the one seam
 * every screen crosses, so everything below is written to be the same on all
 * thirteen rather than convenient on one.
 *
 *   Shell.mount(screenId, params)   head + body + nav; calls the screen's render,
 *                                   then the OUTGOING screen's unmount() and the
 *                                   incoming one's mount() — see "the screen
 *                                   lifecycle" below, which is this file's half of
 *                                   INTEGRATION-NOTES 17
 *   Shell.head(title, opts)         opts {back: bool, trailing: html} -> string
 *   Shell.body(html)                ONE insertAdjacentHTML into #screen
 *   Shell.offline(on)               the trailing-slot button, opacity 0->1, 150ms
 *   Shell.title(name)               document.title = "<screen> — Garage Saathi"
 *   Shell.pad()                     re-applies the two bottom-padding halves
 *
 * `head` is a pure string builder, like `ui/nav.js` and `ui/states.js`, so the
 * header's rules are checked in node rather than hoped for in a browser.
 *
 * FIVE THINGS HERE THAT ARE NOT PREFERENCES
 *
 * 1. `data-theme`, `data-density` and this file's own `data-frame` go on the
 *    SAME element as `data-v2`. `tokens.css`'s dark guard is
 *    `[data-v2]:not([data-theme="light"])`, which only ever sees `data-theme`
 *    where `data-v2` is; the same selector shape is why `data-frame` cannot
 *    live on `body` either (`shell.css` reads both in one selector).
 *
 * 2. `body` is the scroll container and there is no inner scroller.
 *    `ui/overlay.js` locks the page with `documentElement.style.overflow` and
 *    restores it exactly, with 100 checks behind it. An inner scroller is not
 *    locked by that, so a sheet would open over a list that still scrolls
 *    behind the scrim — and the scrim is the only thing that says the page
 *    behind is inert. So this file sets no overflow and creates no scroller:
 *    the frame's elements are plain blocks and the page scrolls.
 *
 * 3. `w()` THROWS on an id nobody registered, by design: a missing translation
 *    that silently reads as English is the defect the word table exists to
 *    remove. But the frame draws in the first paint and one throw during frame
 *    construction is a blank app, so every call here goes through `say()` /
 *    `named()`, which catch and fall back to the English beside the id. The
 *    thirteen screen titles are the live case: `Caps.SCREENS[id].word` is
 *    `scToday`..`scMe` and NOTHING registers those yet, so the fallback is
 *    `Caps.SCREENS[id].title` — which is also what makes "one name in the nav,
 *    the header and More" structural instead of a promise (`ui/nav.js` falls
 *    back to the same field).
 *
 * 4. `--nav-h` is not consumed on a nav-less screen. `pad()` writes
 *    `data-frame="bar"` or `"none"` and `shell.css` carries both halves of the
 *    rule; a builder who changes one must change the other, and
 *    `test_v2_shell.js` fails if the two stop matching the nav's own box.
 *
 * 5. The nav's count badge is composed HERE. `nav(items, activeId)` has nowhere
 *    to put "Me (3)" — see `withCounts()`.
 *
 * Nav slot order is NOT rail order for two roles (a storekeeper gets Store
 * second, a crew manager gets Duty board second). `Caps.navFor` has already put
 * them in the right order and More immediately before Me: nothing here sorts,
 * filters or re-orders what it is given.
 */
(function (root) {
  'use strict';

  const LOGIN = 'login';          // not one of the thirteen: nobody is signed in
  const LG = 'lg';                // login.css owns the whole viewport under it
  const ME = 'me';
  const MORE = 'more';
  const MARK = 20;                // the header's marks, matching the nav's
  const APP = 'app';              // boot.js mounts into #app
  const SCREEN = 'screen';        // the scroll container's one child element

  /* The skeleton the first paint draws, by density: the block's cap, which is
   * what a device that has never loaded this screen has to guess with. A device
   * that HAS loaded it knows last time's row count — that number lives in the
   * screen, not in the frame, so a screen that has it renders its own skeleton
   * and this is only ever the frame's answer before any screen has registered.
   */
  const SKEL = { yard: 5, desk: 12 };

  /* Every dependency is resolved at CALL time, never captured at load — the
   * idiom of `v2/router.js` and `v2/boot.js`, and what makes the load order in
   * `index.html` a dependency order rather than a load-time coupling.
   *
   * Spelled out one function per name rather than through a `pick(name)`
   * helper: a module name in a string is a capitalised English word to the
   * scan that keeps reader-facing English in the word table (test_v2_words.js
   * covers every v2 file that draws, and this one draws), and an allowlist
   * there would be an allowlist that grows until it means nothing. */
  function caps() { return (typeof Caps !== 'undefined' && Caps) || (root && root.Caps) || null; }
  function router() { return (typeof Router !== 'undefined' && Router) || (root && root.Router) || null; }
  function boot() { return (typeof Boot !== 'undefined' && Boot) || (root && root.Boot) || null; }
  function sync() { return (typeof Sync !== 'undefined' && Sync) || (root && root.Sync) || null; }
  function state() { return (typeof S !== 'undefined' && S) || (root && root.S) || null; }
  function cache() { return (typeof Cache !== 'undefined' && Cache) || (root && root.Cache) || null; }
  function doc() { return (root && root.document) || null; }

  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function draw(name, size) {
    return typeof root.icon === 'function' ? root.icon(name, { size: size }) : '';
  }

  /* ---------- words ------------------------------------------------------ */

  /* The frame's own English, in a `W.register` table so the Hindi parity scan
   * can see it and so a Hindi reader is never read an English accessible name.
   * The local copy is the fallback for a document that loads the frame without
   * `ui/words.js`. `hi: ''` is PENDING, counted and printed by
   * test_v2_words.js: the Hindi is the owner's, and a builder guessing it is
   * how "No signal" becomes a sentence nobody can parse. */
  const local = {};
  const W = {
    register: function (table) {
      let k;
      for (k in table) if (has(table, k)) local[k] = table[k];
      if (root.W && typeof root.W.register === 'function') root.W.register(table);
    }
  };

  W.register({
    noSignal: { en: 'No signal', hi: '' },
    // The back control carries a mark and no word, so its accessible name is
    // the only name a screen reader gets for it.
    goBack: { en: 'Back', hi: '' },
    deviceSheet: { en: 'Device and server', hi: '' },
    notOpen: { en: 'This is not open to you', hi: '' },
    notOpenHint: { en: 'If you need it, ask the owner.', hi: '' },
    // {0} is the screen's own name. A whole form rather than a prefix glued on
    // by the caller, because Hindi word order is not English word order.
    docTitle: { en: '{0} — Garage Saathi', hi: '' },
    appTitle: { en: 'Garage Saathi', hi: 'गैराज साथी' }  // FROM i18n-hi.js line 11 (appName)
  });

  // `w()` throws on an unregistered id. See note 3 in the header: a missing
  // word must cost a label, not the whole frame.
  function translate(id) {
    if (id == null || typeof root.w !== 'function') return null;
    try {
      const t = root.w(id);
      return (t == null || String(t) === '') ? null : t;
    } catch (e) {
      return null;
    }
  }

  function say(id) {
    const t = translate(id);
    if (t !== null) return t;
    return local[id] ? local[id].en : '';
  }

  // A screen's one name: its translation if an id is registered for it, its
  // `Caps.SCREENS` title otherwise. One name, three places, never a synonym.
  function named(word, fallback) {
    const t = translate(word);
    if (t !== null) return t;
    return fallback == null ? '' : String(fallback);
  }

  function screenOf(id) {
    const c = caps();
    return (c && c.SCREENS && c.SCREENS[id]) || null;
  }

  function nameOf(id) {
    const s = screenOf(id);
    return s ? named(s.word, s.title) : '';
  }

  /* ---------- the session, the density and the replica ------------------- */

  function role() {
    const s = state();
    const u = s && s.user;
    return u && u.role ? String(u.role) : null;
  }

  function dens() {
    const el = doc() && doc().documentElement;
    const v = el && el.getAttribute ? el.getAttribute('data-density') : null;
    if (v === 'desk' || v === 'yard') return v;
    const b = boot();
    return (b && b.density) ? b.density() : 'yard';
  }

  /* `{behind, complete}` from `Boot.replica()` and from nowhere else. A frame
   * that computed its own answer is how screens-shell.md 1.8's rule rots. */
  function replica() {
    const b = boot();
    const r = (b && b.replica) ? b.replica() : null;
    return r || { behind: 0, complete: false };
  }

  function info() {
    const s = sync();
    try { return (s && s.info) ? s.info() : {}; } catch (e) { return {}; }
  }

  /* The last pull failed, OR the device says it is offline. Not
   * `navigator.onLine` alone: it reports true on a captive portal, which is the
   * office wifi when the bill is unpaid. */
  function isOffline() {
    const i = info();
    if (i.lastError) return true;
    if (i.status === 'offline') return true;
    const nav = root && root.navigator;
    return !!(nav && nav.onLine === false);
  }

  /* ---------- the nav, and the count badge that is this slice's ---------- */

  function navFor(r) {
    const c = caps();
    if (!c || !c.navFor || !r) return { items: [], more: [] };
    const n = c.navFor(r, dens()) || {};
    return { items: n.items || [], more: n.more || [] };
  }

  /* INTEGRATION-NOTES 16. `nav(items, activeId)` has nowhere to put "Me (3)",
   * so the shell composes it into the item's `label` — and DROPS `word` while
   * it does, because nav.js prefers `w(word)` over `label` and a word left
   * beside the count would translate back to the bare name and lose it.
   *
   * The count is unsent records, not signal: §1.9 keeps the two facts in two
   * places on purpose, and this is the one about records. Zero draws no badge
   * at all — "Me (0)" is a number nobody needs to read. */
  function withCounts(items) {
    const n = Number(info().pending);
    if (!items || !items.length || !isFinite(n) || n <= 0) return items || [];
    const out = [];
    let i;
    for (i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it || it.id !== ME) { out.push(it); continue; }
      out.push({ id: it.id, mark: it.mark, label: named(it.word, it.label) + ' (' + group(n) + ')' });
    }
    return out;
  }

  function group(n) {
    const f = (typeof fmt !== 'undefined' && fmt) || (root && root.fmt) || null;
    return (f && f.groupIndian) ? f.groupIndian(n) : String(n);
  }

  function navHtml(items, activeId) {
    return typeof root.nav === 'function' ? root.nav(items, activeId) : '';
  }

  /* ---------- the header ------------------------------------------------- */

  function offBtn(on) {
    return '<button type="button" class="btn btn-quiet apphead-off" data-off'
      + (on ? ' data-on' : '') + '>' + draw('offline', MARK) + ' ' + esc(say('noSignal')) + '</button>';
  }

  /* Three columns, `auto minmax(0, 1fr) auto`, and all three cells are always
   * emitted: the title holds the middle one whether or not there is a back
   * control, so the slot appearing does not move the title. An empty leading
   * cell is `auto` of nothing, and it is not a control — a back arrow pointing
   * at nothing is the same lie as a one-item nav, so when `back` is false there
   * is no button here at all, not a disabled one.
   *
   * The trailing slot holds at most ONE control, and the offline button is the
   * one thing allowed to displace what is there: a control you cannot use
   * beats a control you did not know you could not use (§1.9). */
  function head(title, opts) {
    opts = opts || {};
    const back = opts.back
      ? '<button type="button" class="btn btn-quiet apphead-back" data-back aria-label="'
        + esc(say('goBack')) + '">' + draw('back', MARK) + '</button>'
      : '';
    const trailing = opts.trailing == null ? '' : String(opts.trailing);
    return '<header class="apphead">'
      + '<span class="apphead-lead">' + back + '</span>'
      + '<h1>' + esc(title == null ? '' : title) + '</h1>'
      + '<span class="apphead-trail">' + trailing + '</span>'
      + '</header>';
  }

  /* ---------- the DOM ---------------------------------------------------- */

  function byId(id) {
    const d = doc();
    return (d && d.getElementById) ? d.getElementById(id) : null;
  }

  function appEl() { return byId(APP); }
  function screenEl() { return byId(SCREEN); }

  function rootEl() {
    const d = doc();
    return (d && d.documentElement) || null;
  }

  // One string, one insert. Per-row appendChild is the shape that cost 277 ms
  // per page, and it is the same cost whether the rows are a list or a frame.
  function put(el, html) {
    if (!el || typeof el.insertAdjacentHTML !== 'function') return false;
    el.innerHTML = '';
    el.insertAdjacentHTML('afterbegin', html == null ? '' : String(html));
    return true;
  }

  /* ---------- the six exports -------------------------------------------- */

  function title(name) {
    const d = doc();
    const t = name == null || String(name) === ''
      ? say('appTitle')
      : say('docTitle').replace('{0}', String(name));
    if (d) d.title = t;
    return t;
  }

  /* The two halves of §1.5's bottom rule, re-applied. `--nav-h` is NOT consumed
   * on a nav-less screen, so the rule is conditional and `shell.css` needs to
   * know which case it is in; `data-frame` is that answer, and it sits beside
   * `data-v2` for the reason in note 1. The rail is the no-nav half too, and
   * that half is CSS's to decide because density and width are. */
  let barDrawn = false;
  function pad() {
    const kind = barDrawn ? 'bar' : 'none';
    const el = rootEl();
    if (el && el.setAttribute) el.setAttribute('data-frame', kind);
    return kind;
  }

  /* ONE insertAdjacentHTML into #screen.
   *
   * The guard is screens-shell.md §1.8's rule, stated so it can fail: no
   * aggregate figure may be drawn without `stale: true` while
   * `Boot.replica().complete` is false. The frame does not rewrite the markup
   * to fix it — a figure marked stale with no "may be out of date" beside it
   * would be a status carried by an attribute alone — it draws what the screen
   * built and names the screen in one dev line, because a figure drawn as final
   * over half the records is [E] 2170703 and the screen is where it is wrong. */
  function body(html) {
    const el = screenEl();
    if (!el) return false;
    const out = html == null ? '' : String(html);
    guardFigures(out);
    return put(el, out);
  }

  const FINAL_FIGURE = /class="figure"\s+data-state="value"/;
  function guardFigures(html) {
    if (replica().complete) return false;
    if (!FINAL_FIGURE.test(html)) return false;
    warn('a figure is drawn as final while this device is still filling: ' + current());
    return true;
  }

  /* The persistent offline indicator, in the header's trailing slot on every
   * screen. opacity 0 -> 1, 150 ms, NO movement: a line that appears without a
   * transition reads as a redraw, and on this app's history a redraw means
   * something broke. The height is never animated — the layout shift happens
   * at once. */
  let offShown = false;
  let trailHtml = '';
  function offline(on) {
    const want = !!on;
    const slot = trailSlot();
    if (!slot) { offShown = want; return false; }
    if (want === offShown) return false;
    offShown = want;
    put(slot, want ? offBtn(false) : trailHtml);
    if (want) reveal(slot);
    return true;
  }

  function trailSlot() {
    const app = appEl();
    if (!app || typeof app.querySelector !== 'function') return null;
    return app.querySelector('.apphead-trail');
  }

  /* One forced style read, on one element, when the signal changes — not per
   * row, and not per redraw. It is what makes the next line a CHANGE between
   * two frames rather than the element's first computed style, which is the
   * same thing `ui/overlay.js` does for the sheet and for the same reason. */
  function reveal(slot) {
    const btn = typeof slot.querySelector === 'function' ? slot.querySelector('.apphead-off') : null;
    if (!btn || !btn.setAttribute) return;
    if (root && typeof root.getComputedStyle === 'function') {
      try { root.getComputedStyle(btn).opacity; } catch (e) { /* no layout engine: the attribute still lands */ }
    }
    btn.setAttribute('data-on', '');
  }

  /* ---------- the body a screen does not draw ---------------------------- */

  function skel() {
    const n = SKEL[dens()] || SKEL.yard;
    return typeof root.skeleton === 'function' ? root.skeleton(n) : '';
  }

  /* It cannot be reached: a tab a role does not hold is absent, there is no URL
   * routing, and no screen is reachable from another role's home. Landing here
   * anyway means the nav and the declaration disagree, which is LIVE-ISSUES 6
   * exactly — hence the one dev line naming both. The reader is never blamed
   * and never told "denied". */
  function refused(r, id) {
    warn('no permission: role=' + (r || '-') + ' screen=' + id);
    return nobody();
  }

  /* Signed in and holding NOTHING — a different fact from the one above, and it
   * is reachable rather than a disagreement: a `users` row on the device with
   * no role makes `firstScreen()` answer null (`boot.js:267`). The BODY is
   * §1.10's, because what the person needs to be told is the same; the dev line
   * is not, because the cause is not. Drawing the login here instead is
   * REV-AUTH F7: a lockout over a session that is actually valid. */
  function nothingHeld(r) {
    warn('signed in holding nothing: role=' + (r || '-'));
    return nobody();
  }

  function nobody() {
    return typeof root.emptyState === 'function'
      ? root.emptyState(say('notOpen'), { icon: 'warn', hint: say('notOpenHint') })
      : '';
  }

  /* ONE retry function, hoisted, and not a fresh closure per render.
   * `ui/states.js` keys its retry handlers by function identity and caps the
   * list at 200: a new arrow per redraw would add an entry every few seconds
   * on a screen that is redrawing, which is the leak that cap exists to bound
   * rather than a use of it. */
  function retry() { mount(current()); }

  function failed() {
    return typeof root.errorState === 'function' ? root.errorState(null, retry) : '';
  }

  /* Said once, not once per redraw. `boot.js` re-mounts on every sync tick, so
   * a line written on each mount would be the same sentence forty times a
   * minute — and a console nobody can read is a console nobody reads. The
   * dev line is the half that matters; repeating it is not. */
  const said = {};
  function warn(line) {
    if (has(said, line)) return false;
    said[line] = true;
    if (typeof console !== 'undefined' && console.warn) console.warn('[v2] ' + line);
    return true;
  }

  /* ---------- the model every screen renders from ------------------------ */

  /* One shape, thirteen screens. `stale` is the frame's answer to §1.8 and not
   * the screen's: a screen that computed completeness itself could disagree
   * with the frame about whether this device has everything, and then one of
   * them would be drawing a partial total as final. */
  function model(id, params) {
    const s = state() || {};
    const rep = replica();
    return {
      route: id,
      params: params == null ? null : params,
      role: role(),
      density: dens(),
      user: s.user || null,
      cache: s.cache || {},
      replica: rep,
      stale: rep.complete !== true,
      /* The stores this device could not read, so a screen can draw "could not
       * read this" instead of "there is nothing here" — `v2-ux.md §4.1` #7,
       * "'unknown' and 'zero' must never look alike". `cache[name]` is still
       * `[]` for a failed read, which is what every screen already handles;
       * this is the fact that was lost one layer below all thirteen of them. */
      unread: unreadNames(),
      offline: isOffline()
    };
  }

  function unreadNames() {
    const c = cache();
    try { return (c && c.unread) ? c.unread() : []; } catch (e) { return []; }
  }

  function current() {
    const r = router();
    const c = (r && r.current) ? r.current() : null;
    return (c && c.id) || null;
  }

  function renderBody(id, params) {
    const r = router();
    const mod = (r && r.moduleFor) ? r.moduleFor(id) : null;
    if (!mod || typeof mod.render !== 'function') {
      /* The first paint: the frame and the nav come from the session alone and
       * never wait for data, and the body is a skeleton of the block's cap so
       * the list does not jump when it fills. A screen whose module never
       * registers would skeleton for ever, so it is named here too. */
      warn('no screen module registered for ' + id + ': drawing a skeleton');
      return skel();
    }
    try {
      const html = mod.render(model(id, params));
      return html == null ? '' : String(html);
    } catch (e) {
      // The nav is never removed by an error: a person who cannot read
      // Attention can still reach Today (§1.10).
      if (typeof console !== 'undefined' && console.error) {
        console.error('[v2] screen render failed for ' + id, e);
      }
      return failed();
    }
  }

  /* A screen's one trailing control, when it has one (Attention's desk filter
   * button is the only one on the three screens the shell's own document
   * specifies). The offline button displaces it, and `trailHtml` is what
   * `offline(false)` puts back. */
  function trailOf(mod, m) {
    if (!mod || typeof mod.trailing !== 'function') return '';
    try {
      const html = mod.trailing(m);
      return html == null ? '' : String(html);
    } catch (e) { return ''; }
  }

  /* ---------- signed out ------------------------------------------------- */

  /* The markup last put on the login, so an unchanged one is not redrawn. See
   * the short-circuit in `signedOut`. */
  let lastLogin = null;

  /* The handover, and it has three parts: no header, no nav and no scroll
   * container padding. `login.css`'s `[data-v2].lg` sets `min-height: 100vh`
   * and owns the whole viewport, and `shell.css`'s body rules all exclude
   * `.lg` so nothing here fights it. A nav on the login is a lie about there
   * being somewhere to go — the same lie as a one-item nav. */
  function signedOut() {
    const el = rootEl();
    if (el && el.classList && el.classList.add) el.classList.add(LG);
    /* `data-frame` comes OFF rather than going to "none": there is no scroll
     * container to pad, and an attribute left behind is a rule still matching a
     * body login.css now owns. */
    if (el && el.removeAttribute) el.removeAttribute('data-frame');
    // The frame goes, all four elements of it. A nav on the login is a lie
    // about there being somewhere to go, and so is a header over a keypad.
    const app = appEl();
    /* THE OTHER SIDE OF THE HANDOVER, and the frame's only job here.
     *
     * Everything above gets out of the way; this puts the login on the other
     * side of it. Without it `/v2` is a white page — the frame tore itself down
     * correctly and nothing drew, which is INTEGRATION-NOTES 18. The shape is
     * `renderBody`'s: ask for the module, draw what it returns, and when there
     * is none behave EXACTLY as before. A throw in it is one dev line and an
     * empty body, never an exception out of `mount`.
     *
     * `login.js` is not a route and registers nothing with `Router`, so it is
     * resolved by name rather than through `moduleFor` — the router's registry
     * is the capability-guarded set and the login is reached holding no
     * capability at all. */
    const html = loginHtml();
    /* The same short-circuit, for the same reason, as `mount`'s signature check
     * below: `boot.js` re-mounts on every sync status change and `tick()` runs
     * every four seconds whether or not there is a token, so rebuilding this
     * screen each time would take the caret out of the name search and the
     * focus ring off the keypad every four seconds. Identical markup means
     * nothing on it changed, so nothing is replaced. */
    if (app && html !== '' && html === lastLogin) {
      barDrawn = false;
      lastSig = null;
      title(null);
      return true;
    }
    lastLogin = html;
    if (app) app.innerHTML = '';
    if (app && html !== '') put(app, html);
    barDrawn = false;
    lastSig = null;
    title(null);
    return true;
  }

  /* The login's markup, or '' when no login module is on the page. Spelled out
   * as its own named resolver rather than through a `pick(name)` helper, for the
   * reason at the top of this file: a module name in a string is a capitalised
   * English word to the scan that keeps reader-facing English in the word
   * table, and an allowlist there would be an allowlist that grows until it
   * means nothing. */
  function login() { return (typeof Login !== 'undefined' && Login) || (root && root.Login) || null; }

  function loginHtml() {
    const mod = login();
    if (!mod || typeof mod.render !== 'function') return '';
    try {
      const html = mod.render(model(LOGIN, null));
      return html == null ? '' : String(html);
    } catch (e) {
      // The same rule as renderBody: one dev line, and a body rather than a
      // blank app. A login that throws is the one screen nobody can route away
      // from, so the reason has to reach a console.
      if (typeof console !== 'undefined' && console.error) {
        console.error('[v2] login render failed', e);
      }
      return '';
    }
  }

  function signedIn() {
    const el = rootEl();
    if (el && el.classList && el.classList.remove) el.classList.remove(LG);
    /* The login's markup is gone from `#app` the moment a real screen mounts, so
     * the cached copy above must not out-live it: without this, signing out
     * after a sign-in would find `html === lastLogin` and skip the one draw that
     * was actually needed. */
    lastLogin = null;
  }

  /* ---------- mount ------------------------------------------------------ */

  let lastSig = null;
  let moreItems = [];

  /* The frame is rebuilt only when the frame CHANGED. `boot.js` re-mounts on
   * every sync tick (coalesced to one per 120 ms), and rebuilding four elements
   * and up to twelve nav items on a timer would spend the 250 ms screen-change
   * budget on a device that is merely online — and would take the focus ring
   * with it every four seconds. Same route, same density, same nav, same
   * signal: only the body is replaced. */
  /* The signal is NOT in the signature, and that is the point of §1.9's
   * motion: when only the signal changed, the frame stays and `offline()`
   * fades the button into the slot that is already there. Rebuilding the frame
   * instead would make it appear without a transition, which on this app's
   * history reads as a redraw, and a redraw means something broke. */
  function sigOf(id, items) {
    const parts = [id, dens()];
    let i;
    for (i = 0; i < items.length; i++) parts.push(items[i].id + ':' + items[i].label);
    return parts.join('|');
  }

  function mount(screenId, params) {
    const app = appEl();
    if (!app) return false;
    const id = screenId == null || String(screenId) === '' ? null : String(screenId);

    /* THE LIFECYCLE, AND IT IS THIS FUNCTION'S. Before anything is drawn, the
     * screen that WAS live stops being live. See `live` below for why the
     * Shell owns both halves and why neither can be left to the screens. */
    leave(id);

    if (id === LOGIN) return signedOut();
    /* `null` is NOT the login (`boot.js:256`: "Null means signed in and holding
     * nothing, which is a real state with its own frame and must not be quietly
     * turned into the login screen"). Only a device with nobody on it is sent
     * to `signedOut()`; a signed-in person holding nothing falls through to the
     * normal frame and gets §1.10's no-permission body, which is REV-AUTH F7.
     * Routing "holding nothing" and "nobody is here" to one function is what
     * made a lockout reachable: a person with a valid session read "Sign in to
     * carry on", and offline the next PIN could not heal it. */
    const s0 = state();
    if (id === null && !(s0 && s0.user)) return signedOut();
    signedIn();

    const r = role();
    const sc = screenOf(id);
    const c = caps();
    const allowed = !!(sc && c && c.holds && c.holds(r, id));

    /* The nav comes from the session, in the order navFor gave it. Fewer than
     * two items and nav() renders nothing at all — no bar, no rail, no More —
     * which is the whole of §1.4.1 for a driver and a conductor: Me is their
     * app, and --nav-h is not consumed. */
    const n = navFor(r);
    const items = withCounts(n.items);
    moreItems = n.more;
    const bar = navHtml(items, id);
    barDrawn = bar !== '';

    /* A screen the person does not hold is not named. `allowed` is already
     * decided above, and naming it anyway put the screen's title in the header
     * and in the tab -- "Money — Garage Saathi" over a body that says this is
     * not open to you. Deny-by-default means a capability you lack is not
     * reachable; a refusal that announces what it is refusing is the screen
     * leaking its own existence, in the one place a person is guaranteed to
     * read. The body carries the message, so the header has nothing to add. */
    const name = allowed ? nameOf(id) : null;
    title(name);

    const r2 = router();
    const mod = (allowed && r2 && r2.moduleFor) ? r2.moduleFor(id) : null;
    const m = model(id, params);
    trailHtml = allowed ? trailOf(mod, m) : '';
    const off = isOffline();

    /* The back control is on a detail screen only, and only when the step up is
     * real: `Caps.SCREENS[id].parent` plus `Router.reachable` on it. A back
     * arrow pointing at nothing is not drawn. */
    const up = (allowed && sc.parent) || null;
    const back = !!(up && r2 && r2.reachable && r2.reachable(up));

    const sig = sigOf(id, items);
    const bodyHtml = allowed ? renderBody(id, params)
      : (id === null ? nothingHeld(r) : refused(r, id));

    if (sig === lastSig && screenEl()) {
      offline(off);                  // the slot is already there: fade, do not rebuild
      body(bodyHtml);
      pad();
      if (allowed) enter(id);
      return true;
    }
    lastSig = sig;
    /* On a frame that is being built there is nothing to fade FROM, so the
     * button is drawn already on (`data-on`): the indicator's transition is
     * about a signal that changed under a frame the person is looking at, not
     * about the first paint. */
    offShown = off;
    put(app, head(name, { back: back, trailing: off ? offBtn(true) : trailHtml }) + '<main class="appbody" id="'
        + SCREEN + '"></main>' + bar);
    body(bodyHtml);
    pad();
    /* The screen's own listeners BEFORE the frame's, so that on the first paint
     * the order on `document` is the one every screen was written against: a
     * row that carries both a screen attribute and the frame's is read by the
     * screen first. `listen()` installs the frame's exactly once, so from the
     * second screen onwards the frame's is already in front — which is why
     * `[data-nav]` is the frame's alone and never carries a param (the rule
     * `attention.js:1116` states and `duty.js` was the one screen breaking). */
    if (allowed) enter(id);
    listen();
    return true;
  }

  /* ---------- the screen lifecycle --------------------------------------- */

  /* INTEGRATION-NOTES 17, and the seam the thirteen slices could not see.
   *
   * `Shell.mount` used to render and nothing else, so a screen's own
   * script-load `mount()` was the only thing that ever installed its delegated
   * `document` listener. Two defects fell out of that and they are opposite
   * halves of one hole:
   *
   *   - the NINE screens that did call `mount()` at load installed a listener
   *     that outlived the screen. 42 `addEventListener` across the thirteen,
   *     zero `removeEventListener`: after Store, People and Reviews, THREE live
   *     handlers were reading `data-tab`, and all thirteen share `data-act`.
   *     Three of them (store, fuel, attention) also kicked a `Cache.load` from
   *     there — before `boot.js` had created `S`, which is the uncaught
   *     rejection `store.js` shipped with.
   *   - the FOUR that did not (duty, gate, me, today) had no listener at all.
   *     Me is a driver's and a conductor's whole app and Today is the owner's
   *     front door, and in a browser neither answered a tap. No node suite
   *     could see it: every screen is exercised through `module.exports`, and
   *     this is the `else` branch.
   *
   * So the lifecycle is the Shell's, both ends of it, and a screen's load does
   * nothing but register. `Router.register` already stores the module whole
   * (`v2/router.js:87`) and validates only `render`, so `unmount` is reachable
   * from here with no router change.
   *
   * `mounted` is the id whose module is live, and it is the ONE piece of state
   * that makes this correct: `enter` is called when it changes and not on every
   * redraw, because `boot.js` re-mounts on each sync tick and re-entering a
   * screen forty times a minute would re-kick its store read forty times. */
  let mounted = null;

  function hook(id, name) {
    const r = router();
    const mod = (id && r && r.moduleFor) ? r.moduleFor(id) : null;
    const fn = mod && typeof mod[name] === 'function' ? mod[name] : null;
    if (!fn) {
      /* Said once per screen, not swallowed. A screen with listeners and no
       * `unmount` is note 17 coming back, and the gate checks for it — but a
       * gate runs on a push and this runs on the device. */
      warn('screen ' + id + ' has no ' + name + '()');
      return false;
    }
    try { fn(); return true; } catch (e) {
      if (typeof console !== 'undefined' && console.error) {
        console.error('[v2] screen ' + name + ' failed for ' + id, e);
      }
      return false;
    }
  }

  // The outgoing screen stops being live. Called with the id coming IN, so
  // re-mounting the same screen is not a teardown and the login is.
  function leave(next) {
    if (mounted === null || mounted === next) return false;
    const was = mounted;
    mounted = null;                  // cleared FIRST: a throwing unmount must
    hook(was, 'unmount');            // not leave a screen recorded as live
    return true;
  }

  // The incoming screen becomes live, after its body is in the DOM: a mount
  // that queried for an element would find nothing if it ran before `body()`.
  function enter(id) {
    if (id === null || mounted === id) return false;
    mounted = id;
    hook(id, 'mount');
    return true;
  }

  /* ---------- one delegated listener ------------------------------------- */

  /* ONE, on the document, installed once. Three controls answer to it and it
   * returns early on everything else, so a 200-row list costs no listeners at
   * all (a listener per row is the other half of the 277 ms). */
  let listening = false;
  function listen() {
    const d = doc();
    if (listening || !d || typeof d.addEventListener !== 'function') return;
    listening = true;
    d.addEventListener('click', onClick);
  }

  function onClick(ev) {
    const t = ev && ev.target;
    if (!t || typeof t.closest !== 'function') return;
    const nv = t.closest('[data-nav]');
    if (nv) {
      if (ev.preventDefault) ev.preventDefault();
      go(nv.getAttribute('data-nav'));
      return;
    }
    if (t.closest('[data-back]')) {
      if (ev.preventDefault) ev.preventDefault();
      const r = router();
      if (r && r.back) r.back();
      return;
    }
    if (t.closest('[data-off]')) {
      if (ev.preventDefault) ev.preventDefault();
      openDevice();
    }
  }

  /* More is never a destination: it opens a sheet, and a sheet is not a place
   * you are. The sheet's rows carry `data-nav` too, so the same handler routes
   * them — and `overlay.js` closes the sheet on the way out. A tap on the
   * screen you are already on is a no-op: `Router.go` notifies and the body is
   * redrawn, and nothing scrolls to top, reloads or clears a filter. */
  function go(id) {
    if (!id) return;
    if (id === MORE) { openMore(); return; }
    /* A tap on the screen you are already on is a NO-OP (§1.11): it does not
     * scroll to top, reload or clear a filter. Handled here and not left to
     * `Router.go`, which would re-notify with no params and so would throw
     * away the filter the person is looking through — the press itself is the
     * acknowledgement that the tap was heard on a 400 ms machine. */
    if (id === current()) return;
    const r = router();
    if (r && r.go) r.go(id);
  }

  function openMore() {
    const V = root.V2;
    if (!V || typeof V.openSheet !== 'function' || typeof root.navMore !== 'function') return;
    const c = caps();
    const m = (c && c.MORE) || null;
    V.openSheet(named(m && m.word, m && m.title), root.navMore(moreItems, current()));
  }

  /* One sheet, two doors: the offline button and Me's device row open the same
   * one, and Me owns its contents (§4.2 block 6). Until that slice lands the
   * door still has to open onto something true, and `offlineState()` is the
   * sentence states.js already owns for exactly this fact — a word and a mark,
   * never a coloured dot. */
  function openDevice() {
    const V = root.V2;
    if (!V || typeof V.openSheet !== 'function') return;
    const r = router();
    const me = (r && r.moduleFor) ? r.moduleFor(ME) : null;
    let html = '';
    if (me && typeof me.deviceSheet === 'function') {
      try { html = String(me.deviceSheet(model(ME, null))); } catch (e) { html = ''; }
    }
    if (html === '' && typeof root.offlineState === 'function') html = root.offlineState();
    V.openSheet(say('deviceSheet'), html);
  }

  const api = {
    mount: mount,
    head: head,
    body: body,
    offline: offline,
    title: title,
    pad: pad,
    // Test seam only, the shape of `Router._reset`: a node suite cannot reload
    // a classic script per case.
    _reset: function () {
      lastSig = null; lastLogin = null; barDrawn = false; offShown = false; trailHtml = ''; moreItems = [];
      mounted = null;
      Object.keys(said).forEach(function (k) { delete said[k]; });
    },
    // Which screen's module is live, for the suite that counts listeners across
    // a route change. Nothing in the app reads it.
    _mounted: function () { return mounted; }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Shell = api;
})(typeof window !== 'undefined' ? window : this);

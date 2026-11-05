/* Garage Saathi v2 nav: a bottom bar at yard, a left rail at desk. Plain script, ES5, no module system,
 * no dependencies. Needs ui/tokens.css and ui/components.css; uses icon() from ui/icons.js when it is
 * loaded and still shows every label when it is not. Test: test_v2_ui.js.
 *
 * WHY THIS EXISTS. The most plainly broken thing in the live app is that a supervisor holds 16
 * capabilities with no reachable screen (LIVE-ISSUES 6): the real permission model is the navigation, and
 * the navigation grew by accident. This file draws the nav and nothing else -- WHAT goes in it is
 * Caps.navFor(role, density)'s answer, which is where the slot table, the overflow and the build-time
 * "no capability is held without a path" check live. Do not sort, filter or re-order what you are given:
 * the slot order is not the rail order for two roles (store gets Store second, a crew manager gets Duty
 * board second), and navFor has already put More immediately before Me.
 *
 *   nav(items, activeId) -> string      items: [{id, label, word, mark}], from Caps.navFor().items
 *   navMore(items, activeId) -> string  the More sheet's BODY (rows), from Caps.navFor().more
 *
 * Both return a markup STRING, like ui/states.js: a screen builds its whole body as one string and sets
 * it with one insertAdjacentHTML. Everything passed in is escaped.
 *
 * ONE SLOT MEANS NO NAV AT ALL. nav() returns the EMPTY STRING for an empty list and for a one-item list,
 * so a driver and a conductor get no bottom bar, no rail, no More and no back arrow: Me is the whole app
 * for them, and a nav with one item is a lie about there being somewhere else to go -- the same lie as a
 * disabled tab, which 3.7's disabled row already forbids (v2-foundation-ui.md 3.7.1). An empty <nav>
 * would still draw a bar and still consume --nav-h, so the empty string is the only honest answer. On
 * such a screen --nav-h is NOT consumed and the scroll padding is calc(var(--pad) +
 * env(safe-area-inset-bottom)), not the bar's.
 *
 * ONE ORIENTATION, TWO SHAPES, AND NO JS DECIDES IT. The bar and the rail are the same markup; the shape
 * is chosen by CSS from data-density and the viewport width (both clauses, see components.css 3.7). So
 * nav() takes no density argument: a density that lived in two places would eventually disagree with
 * itself.
 *
 * WHY <a href="#"> AND NOT <button>. There is no URL routing in v2 (v2-ux.md 2.1), so the hash is never
 * read and the shell's one delegated handler calls preventDefault and Router.go(id) off [data-nav]. The
 * href is there because an <a> without one is not focusable: the nav is the most-pressed thing in the app
 * and the keyboard on an office PC has to reach it. Same shape as ui/gallery.html's pressable row.
 *
 * MORE IS NEVER A DESTINATION. The More item carries no aria-current, ever, even if it is asked to be the
 * active id -- it opens a sheet, and a sheet is not a place you are (screens-shell.md 1.3). The sheet's
 * ROWS are the destinations and do carry it.
 *
 * MOTION. One press, scale(0.97) at 120ms, from components.css. The active bar does NOT transition: it is
 * the thing people press most often and a frequently repeated action does not animate (5.8). */
(function (window) {
  'use strict';

  var MORE_ID = 'more';
  var MARK_SIZE = 20;                  // the bar item's arithmetic: 20 + --s1 4 + a 25.5px Hindi label

  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // A mark, or nothing when icons.js is not loaded: the labels never depend on it.
  function draw(name, size) {
    return typeof window.icon === 'function' ? window.icon(name, { size: size }) : '';
  }

  /* The one fixed word in this file, in a W.register table so the Hindi parity check can see it and so a
   * Hindi reader is never read an English accessible name. The local copy is the fallback for a page that
   * loads the primitives without ui/words.js (the gallery does). */
  var local = {};
  var W = {
    register: function (table) {
      var k;
      for (k in table) if (has(table, k)) local[k] = table[k];
      if (window.W && typeof window.W.register === 'function') window.W.register(table);
    }
  };

  W.register({
    navMain: { en: 'Main', hi: '' }
  });

  /* w() THROWS on an id nobody registered, which is right: a missing translation that silently falls back
   * to English is the defect v2-foundation-ui.md 6.3 is about, and the build-time scan is where it should
   * be caught. But the nav draws in the first paint, before any store is read, and it is the one thing on
   * screen that must never wait for or depend on anything. A missing word must therefore cost a label,
   * not the whole frame -- a thrown nav is a blank screen with one console error. */
  function translate(id) {
    if (id == null || typeof window.w !== 'function') return null;
    try {
      var t = window.w(id);
      return (t == null || String(t) === '') ? null : t;
    } catch (e) {
      return null;
    }
  }

  function say(id) {
    var t = translate(id);
    if (t !== null) return t;
    return local[id] ? local[id].en : '';
  }

  /* One name, three places, never a synonym (screens-shell.md 1.6). The label is the screen's title as
   * Caps spells it; `word` is that title's translation id, so the nav, the header and the More sheet
   * translate from one id rather than three strings. */
  function label(it) {
    var t = translate(it.word);
    if (t !== null) return t;
    return it.label == null ? '' : it.label;
  }

  function navItem(it, activeId) {
    var id = it.id == null ? '' : String(it.id);
    var current = id !== '' && id === activeId && id !== MORE_ID;
    return '<a class="nav-i" href="#" data-nav="' + esc(id) + '"'
      + (current ? ' aria-current="page"' : '') + '>'
      + '<span class="nav-ic">' + draw(it.mark, MARK_SIZE) + '</span>'
      + '<span class="nav-l">' + esc(label(it)) + '</span></a>';
  }

  function nav(items, activeId) {
    if (!items || typeof items.length !== 'number' || items.length < 2) return '';
    var active = activeId == null ? '' : String(activeId);
    var out = '', i;
    for (i = 0; i < items.length; i++) out += navItem(items[i], active);
    return '<nav class="nav" aria-label="' + esc(say('navMain')) + '">' + out + '</nav>';
  }

  /* The More sheet's body: the remaining destinations as a.v2row, in the rail's order, each with its nav
   * mark in .lead and NOTHING in .act (screens-shell.md 1.3). Seven rows at --row-h 56px is 392px, inside
   * the sheet's max-height: 90% on a 640px phone without scrolling. `activeId` is optional and exists
   * because a supervisor at yard can be ON one of these screens, in which case no bar item is current and
   * the row is the only place the answer can be shown; a caller that passes one argument gets no
   * aria-current anywhere, which is what every screen written against navMore(items) expects. */
  function navMore(items, activeId) {
    if (!items || typeof items.length !== 'number' || !items.length) return '';
    var active = activeId == null ? '' : String(activeId);
    var out = '', i, it, id;
    for (i = 0; i < items.length; i++) {
      it = items[i];
      id = it.id == null ? '' : String(it.id);
      out += '<a class="v2row" href="#" data-nav="' + esc(id) + '"'
        + (id !== '' && id === active ? ' aria-current="page"' : '') + '>'
        + '<span class="lead">' + draw(it.mark, MARK_SIZE) + '</span>'
        + '<div class="txt"><div class="t">' + esc(label(it)) + '</div></div></a>';
    }
    return out;
  }

  window.nav = nav;
  window.navMore = navMore;
})(window);

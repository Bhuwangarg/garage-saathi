/* Garage Saathi overlays: a sheet, a confirmation dialog and a toast. Plain script, ES5, no module system, no
 * dependencies. Needs ui/tokens.css and ui/components.css; uses icon() from ui/icons.js when it is loaded and still
 * shows every word when it is not. Test: test_ui_overlay.js (it drives real Chrome).
 *
 * THE API LIVES ON ONE GLOBAL, V2: V2.openSheet, V2.closeSheet, V2.confirmDialog, V2.toast. The bare names are NOT attached
 * to window, on purpose. The live app.js already defines openSheet, closeSheet and toast with other arguments, and screens
 * migrate one at a time, so a single page will hold both files for a long while; attaching bare names would silently replace
 * the live functions for every call site that has not migrated. Loading this file changes nothing on a page that has not
 * opted in (test_ui_overlay.js proves it against a page that defines all four names itself).
 *
 *   V2.openSheet(title, html, opts)   a modal panel on the bottom edge. title is plain text; html is markup you trust
 *                                  (the same contract as the live app's openSheet). opts {onClose: function}. Returns
 *                                  the <dialog>. Only one sheet is open at a time: opening another replaces it.
 *   V2.closeSheet()                plays the exit, then closes. Safe to call twice, or with nothing open.
 *   V2.confirmDialog(text, opts)   a modal question. Returns a Promise of a boolean. opts {title, yes, no, danger}.
 *   V2.toast(text, opts)           a short message. opts {kind: 'ok' | 'warn' | 'bad', ms}. Returns the <dialog>.
 *
 * ALL THREE ARE <dialog>. showModal() gives a sheet and a confirmation a focus trap, an inert page behind them and
 * Escape (the `cancel` event) without a line of script. A toast is the non-modal kind: it must not take focus or make
 * the page inert.
 *
 * A DISMISSED CONFIRMATION IS "NO". confirmDialog resolves true only from a click on its Confirm button. Escape, a click
 * on the backdrop, Cancel, a script calling close() (even close('confirm')) and anything else that ends the dialog all
 * resolve false, and focus starts on Cancel so a reflexive Enter says no. An undecided dialog that is merely removed from
 * the page (a screen redrawing itself with innerHTML on <body>) is noticed (a MutationObserver on <body> while a modal is
 * open) and treated as closed: a confirmation resolves false, scroll is unlocked, focus goes back if it can.
 *
 * FOCUS. A sheet or a confirmation records document.activeElement when it opens and puts focus back there when it
 * closes. Current Chrome also does this on dialog.close(); older ones may not, and the explicit restore also covers a
 * sheet opened from inside another sheet (it goes back to the page element that opened the FIRST).
 *
 * WHERE THEY LIVE. Each dialog is appended to <body> and carries data-v2 itself, plus the app's data-theme and the
 * data-density of the place it was opened from (tokens.css says both belong on the data-v2 element). That keeps it out
 * of the app's own tree, so the app redrawing its root does not remove an open overlay, and keeps it themed whatever
 * wrapper the app mounted data-v2 on. The ::backdrop pseudo-element is not used: before Chrome 122 it does not inherit
 * the custom properties, so a scrim coloured from a token cannot be drawn there. The dialog fills the viewport and holds
 * its own scrim; a click whose target is the dialog or the scrim, and which BEGAN on one, is a backdrop click (so a text
 * selection that starts in the panel and ends outside it does not dismiss anything).
 *
 * MOTION. Only transform and opacity, CSS transitions (no keyframes, so a toast asked for again halfway through its
 * exit reverses from where it is). @starting-style does not exist before Chrome 117, so the enter uses the data-mounted
 * pattern: the dialog is rendered once without data-mounted, the style is flushed, and then data-mounted is set so the
 * browser sees a change between two frames. The exit removes data-mounted and waits as long as the exit transition lasts
 * (read back from the computed style, so a stylesheet change cannot leave a timer out of step, and a page with no
 * transitions closes at once instead of waiting for a transitionend that never comes).
 *
 * TOASTS. Never take focus, never block the page, say their kind in WORDS (Done / Warning / Error) as well as by
 * colour and drawing. At most three are on screen. The same message asked for again is the same toast, kept longer.
 * ms: how long it stays; 0 means until Close is pressed; anything else that is not a positive number gets the default
 * for the kind (errors stay longest). A toast shown while a modal is open lives INSIDE that modal for the time being: the
 * top layer paints above everything outside it, so a toast left in the page would be hidden behind the sheet.
 * The Close button inside a toast is reachable with Tab but never receives focus by itself.
 *
 * SCROLL LOCK. showModal() makes the page inert but does not stop it scrolling, so while ANY modal is open the document
 * element gets overflow: hidden (the inline overflow and padding-right the app had are saved and put back exactly on the
 * last close; stacked overlays count). Where a classic scrollbar disappears, its width is added to padding-right so the page
 * does not jump sideways. The lock is released first thing in the close path, before anything that could throw, and by the
 * <body> observer if the dialog is wiped, so no failure leaves the page stuck. It locks the document's scroll; an app that
 * scrolls inside its own container must lock that itself. A toast never locks (it is not modal).
 *
 * KNOWN LIMITS. The live region attributes are tested; what a screen reader does with them is not (no screen reader is
 * run here). The sheet body does not chain its own scroll to the page. */
(function (window) {
  'use strict';

  /* `word` is a WORD ID, not a word: v2-foundation-ui.md section 6.3. A toast that says its kind in English to
   * a Hindi reader is the defect that file names, and a fixed word written here is one nobody is ever told is
   * missing. The ids are resolved through w() below and their Hindi is in v2/ui/words.js. */
  var KINDS = {
    ok:   { word: 'toastOk',   icon: 'ok',   ms: 4000 },
    warn: { word: 'toastWarn', icon: 'warn', ms: 7000 },
    bad:  { word: 'toastBad',  icon: 'bad',  ms: 10000 }
  };
  var MAX_TOASTS = 3;
  var SLACK_MS = 30;                   // after the last frame of an exit, before the element is removed
  var seq = 0;
  var scrollSaved = null;              // {overflow, paddingRight} of <html> before the lock, or null when not locked
  var watcher = null;                  // MutationObserver on <body> while a modal is open

  var modals = [];                     // records of the open modal dialogs, oldest first
  var sheet = null;                    // the record of the open sheet, if any
  var lane = null;                     // the one element that holds every toast
  var toasts = [];                     // [{key, el, timer, leaving, gone}]

  function doc() { return window.document; }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // A drawing, or nothing when icons.js is not loaded: the words never depend on it.
  function draw(name, size) {
    return typeof window.icon === 'function' ? window.icon(name, { size: size }) : '';
  }

  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  /* ---------- the fixed words ---------- */

  /* Every fixed word these three overlays draw, registered under an id. The English half stays in this file
   * because test_ui_overlay.js pins it to be pure ASCII, comments included, so the Devanagari cannot be here;
   * the Hindi half is in v2/ui/words.js, which merges the two by id, and test_v2_words.js fails on an id that
   * has an English half and no Hindi key anywhere. Caller text - a sheet's title, a question, a message - is
   * never in here: it arrives as an argument, in whatever language the caller passed. */
  var CHROME = {
    close: { en: 'Close' },
    confirm: { en: 'Confirm' },
    cancel: { en: 'Cancel' },
    toastOk: { en: 'Done' },
    toastWarn: { en: 'Warning' },
    toastBad: { en: 'Error' }
  };
  var registered = false;

  // Registered at load when words.js is already on the page, and on first use when it arrives after this
  // file (index.html's order is not this file's business). Either way the table is in one place.
  function register() {
    if (registered || !window.W || typeof window.W.register !== 'function') return;
    window.W.register(CHROME);
    registered = true;
  }

  // words.js, when the page has loaded it. When it is not there - a page that has not opted in, or a test that
  // loads this file alone - this table is all there is and every word is English, which is not the defect
  // section 6.3 names: there is no Hindi in the build for a reader to be missing.
  function lookup() {
    register();
    return registered && typeof window.w === 'function' ? window.w : null;
  }

  function w(id) {
    var t = lookup();
    return t ? t(id) : CHROME[id].en;
  }

  /* ---------- skin: the app's theme and density, on a dialog that lives outside the app's tree ---------- */

  function isOverlay(el) {
    return el.classList.contains('ov-modal') || el.classList.contains('ov-toasts');
  }

  // The element the app put data-v2 on (a wrapper, or <html>), ignoring our own.
  function v2Root() {
    var list = doc().querySelectorAll('[data-v2]'), i;
    for (i = 0; i < list.length; i++) if (!isOverlay(list[i])) return list[i];
    return null;
  }

  function copyAttr(to, name, from) {
    var v = from ? from.getAttribute(name) : null;
    if (v === null || v === undefined) to.removeAttribute(name); else to.setAttribute(name, v);
  }

  // source: the element the overlay was opened from (or null). Density is the nearest one above it; theme is the
  // app's, from the data-v2 element or, failing that, from <html>.
  function skin(el, source) {
    var root = v2Root(), html = doc().documentElement;
    el.setAttribute('data-v2', '');
    var themed = root && root.hasAttribute('data-theme') ? root : html;
    copyAttr(el, 'data-theme', themed);
    var dense = source && typeof source.closest === 'function' ? source.closest('[data-density]') : null;
    copyAttr(el, 'data-density', dense || root);
  }

  /* ---------- motion helpers ---------- */

  // Force the browser to compute style now, so what is set next is a CHANGE between two frames and transitions.
  function flush(el) { return window.getComputedStyle(el).opacity; }

  function parseTimes(list) {
    var out = [], parts = String(list).split(','), i, t;
    for (i = 0; i < parts.length; i++) {
      t = parts[i].replace(/^\s+|\s+$/g, '');
      out.push(/ms$/.test(t) ? parseFloat(t) : parseFloat(t) * 1000);
    }
    return out;
  }

  // The longest transition (duration + delay) now resolved on an element, in ms. 0 when nothing will animate.
  function transitionMs(el) {
    var cs = window.getComputedStyle(el), d = parseTimes(cs.transitionDuration), l = parseTimes(cs.transitionDelay), i, max = 0, v;
    for (i = 0; i < d.length; i++) {
      v = (isNaN(d[i]) ? 0 : d[i]) + (isNaN(l[i % l.length]) ? 0 : l[i % l.length]);
      if (v > max) max = v;
    }
    return max;
  }

  /* ---------- focus ---------- */

  function restoreFocus(el) {
    var d = doc();
    if (el && el.nodeType === 1 && el.isConnected && el !== d.body && el !== d.documentElement && typeof el.focus === 'function') el.focus();
  }

  /* ---------- scroll lock ---------- */

  function lockScroll() {
    if (scrollSaved) return;
    var el = doc().documentElement, bar = window.innerWidth - el.clientWidth;
    scrollSaved = { overflow: el.style.overflow, paddingRight: el.style.paddingRight };
    if (bar > 0) el.style.paddingRight = (parseFloat(window.getComputedStyle(el).paddingRight) || 0) + bar + 'px';
    el.style.overflow = 'hidden';
  }

  function unlockScroll() {
    if (!scrollSaved) return;
    var el = doc().documentElement;
    el.style.overflow = scrollSaved.overflow;
    el.style.paddingRight = scrollSaved.paddingRight;
    scrollSaved = null;
  }

  // The app wiped <body> under an open modal: no close event will ever come, so notice it here.
  function sweep() {
    var i, list = modals.slice();
    for (i = 0; i < list.length; i++) if (!list[i].dlg.isConnected) finish(list[i]);
  }

  // Escape goes to the topmost modal. We take the key ourselves (on keydown, after anything inside the dialog had its
  // say) instead of waiting for the dialog's `cancel` event: Chrome hands the close request to the NEWEST dialog of any
  // kind, so with a toast on screen (a toast is a <dialog> too) the request never reached the modal beneath it.
  function onKey(ev) {
    if ((ev.key === 'Escape' || ev.key === 'Esc') && !ev.defaultPrevented && !ev.isComposing && modals.length) {
      ev.preventDefault();
      modals[modals.length - 1].onCancel();
    }
  }

  function watch() {
    if (watcher || typeof window.MutationObserver !== 'function' || !doc().body) return;
    watcher = new window.MutationObserver(sweep);
    watcher.observe(doc().body, { childList: true });
    doc().addEventListener('keydown', onKey);
  }

  function unwatch() {
    if (watcher && !modals.length) { watcher.disconnect(); watcher = null; doc().removeEventListener('keydown', onKey); }
  }

  /* ---------- modal dialogs (sheet and confirmation) ---------- */

  function isBackdrop(rec, target) { return target === rec.dlg || target === rec.scrim; }

  function build(cls, source, inner) {
    var dlg = doc().createElement('dialog');
    dlg.className = 'ov-modal ' + cls;
    skin(dlg, source);
    dlg.innerHTML = '<div class="ov-scrim" aria-hidden="true"></div>' + inner;
    return dlg;
  }

  function wire(rec) {
    var dlg = rec.dlg;
    // Any other close request (Escape is taken in onKey, a back gesture arrives here): the default would close at once, with no exit.
    dlg.addEventListener('cancel', function (ev) { ev.preventDefault(); rec.onCancel(); });
    // However the dialog ended (script close(), a second Escape Chrome will not let us prevent), tidy up.
    dlg.addEventListener('close', function () { finish(rec); });
    dlg.addEventListener('pointerdown', function (ev) { rec.downOnBackdrop = isBackdrop(rec, ev.target); });
    dlg.addEventListener('click', function (ev) {
      var hit = rec.downOnBackdrop && isBackdrop(rec, ev.target);
      rec.downOnBackdrop = false;
      if (hit) rec.onCancel();
    });
  }

  function mountModal(rec) {
    doc().body.appendChild(rec.dlg);
    wire(rec);
    rec.dlg.showModal();
    modals.push(rec);
    lockScroll();
    watch();
    placeLane();
    flush(rec.panel);                                   // render the unmounted state once...
    rec.dlg.setAttribute('data-mounted', '');           // ...then change it, so it transitions
  }

  // Start the exit; the dialog is removed when it has played.
  function dismiss(rec) {
    if (rec.closing || rec.done) return;
    rec.closing = true;
    rec.dlg.removeAttribute('data-mounted');
    var ms = Math.max(transitionMs(rec.panel), transitionMs(rec.scrim));
    if (ms <= 0) { finish(rec); return; }
    rec.timer = window.setTimeout(function () { finish(rec); }, ms + SLACK_MS);
  }

  function finish(rec) {
    if (rec.done) return;
    rec.done = true;
    window.clearTimeout(rec.timer);
    var i = modals.indexOf(rec);
    if (i >= 0) modals.splice(i, 1);
    if (sheet === rec) sheet = null;
    if (!modals.length) { unlockScroll(); unwatch(); }  // first, before anything below can throw
    placeLane();                                        // before the dialog goes: the toasts must not go with it
    if (rec.dlg.open) { try { rec.dlg.close(); } catch (e) { /* already closed */ } }
    if (rec.dlg.parentNode) rec.dlg.parentNode.removeChild(rec.dlg);
    if (rec.restore !== false) restoreFocus(rec.opener);
    if (typeof rec.after === 'function') rec.after();
  }

  /* ---------- the sheet ---------- */

  function openSheet(title, html, opts) {
    opts = opts || {};
    var active = doc().activeElement;
    var opener = sheet && sheet.dlg.contains(active) ? sheet.opener : active;   // a sheet opened from a sheet goes back to the page
    if (sheet) { sheet.restore = false; finish(sheet); }
    var id = 'ov-t' + (++seq);
    var dlg = build('ov-sheet', opener,
      '<div class="ov-panel"><div class="ov-head"><h2 class="ov-title" id="' + id + '">' + esc(title == null ? '' : title) + '</h2>'
      + '<button type="button" class="btn btn-quiet ov-close">' + esc(w('close')) + '</button></div>'
      + '<div class="ov-body">' + (html == null ? '' : String(html)) + '</div></div>');
    dlg.setAttribute('aria-labelledby', id);
    var rec = { dlg: dlg, panel: dlg.querySelector('.ov-panel'), scrim: dlg.querySelector('.ov-scrim'), opener: opener, after: opts.onClose };
    rec.onCancel = function () { dismiss(rec); };
    dlg.querySelector('.ov-close').addEventListener('click', function () { dismiss(rec); });
    sheet = rec;
    mountModal(rec);
    return dlg;
  }

  function closeSheet() {
    if (sheet) dismiss(sheet);
  }

  /* ---------- the confirmation ---------- */

  function confirmDialog(text, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var tid = 'ov-t' + (++seq), qid = 'ov-q' + (++seq), decided = false;
      var hasTitle = opts.title != null && String(opts.title) !== '';
      var yes = opts.yes == null || String(opts.yes) === '' ? w('confirm') : String(opts.yes);
      var no = opts.no == null || String(opts.no) === '' ? w('cancel') : String(opts.no);
      var opener = doc().activeElement;
      var dlg = build('ov-confirm', opener,
        '<div class="ov-panel">' + (hasTitle ? '<h2 class="ov-title" id="' + tid + '">' + esc(opts.title) + '</h2>' : '')
        + '<p class="ov-text" id="' + qid + '">' + esc(text == null ? '' : text) + '</p>'
        + '<div class="ov-actions"><button type="button" class="btn ov-no">' + esc(no) + '</button>'
        + '<button type="button" class="btn ' + (opts.danger ? 'btn-danger' : 'btn-primary') + ' ov-yes">' + esc(yes) + '</button></div></div>');
      dlg.setAttribute('role', 'alertdialog');
      dlg.setAttribute('aria-labelledby', hasTitle ? tid : qid);
      dlg.setAttribute('aria-describedby', qid);
      var rec = { dlg: dlg, panel: dlg.querySelector('.ov-panel'), scrim: dlg.querySelector('.ov-scrim'), opener: opener };
      // Only a click on the Confirm button is a yes. Every other way the dialog can end is a no.
      function decide(answer) { if (decided) return; decided = true; resolve(answer === true); }
      rec.onCancel = function () { decide(false); dismiss(rec); };
      rec.after = function () { decide(false); };
      dlg.querySelector('.ov-no').addEventListener('click', function () { decide(false); dismiss(rec); });
      dlg.querySelector('.ov-yes').addEventListener('click', function () { decide(true); dismiss(rec); });
      mountModal(rec);
      dlg.querySelector('.ov-no').focus();              // the safe answer has focus, so a reflexive Enter is a no
    });
  }

  /* ---------- the toast ---------- */

  // The lane lives in the page, or inside the topmost open modal (see TOASTS in the header).
  function placeLane() {
    if (!lane) return;
    var host = modals.length ? modals[modals.length - 1].dlg : doc().body;
    if (lane.parentNode !== host) host.appendChild(lane);
  }

  function ensureLane() {
    if (!lane) {
      lane = doc().createElement('div');
      lane.className = 'ov-toasts';
      lane.setAttribute('role', 'status');
      lane.setAttribute('aria-live', 'polite');
    }
    skin(lane, null);
    placeLane();
    return lane;
  }

  function kindOf(kind) {
    if (kind == null) return 'ok';
    return typeof kind === 'string' && has(KINDS, kind) ? kind : 'warn';   // a typo is not "Done"
  }

  // A toast whose element is no longer in the document (the app wiped <body>) is not a toast any more.
  function purge() {
    var i;
    for (i = toasts.length - 1; i >= 0; i--) if (!toasts[i].el.isConnected) drop(toasts[i]);
  }

  function findToast(key) {
    var i;
    for (i = 0; i < toasts.length; i++) if (toasts[i].key === key && !toasts[i].gone) return toasts[i];
    return null;
  }

  function drop(t) {
    if (t.gone) return;
    t.gone = true;
    window.clearTimeout(t.timer);
    window.clearTimeout(t.removeTimer);
    var i = toasts.indexOf(t);
    if (i >= 0) toasts.splice(i, 1);
    if (t.el.parentNode) t.el.parentNode.removeChild(t.el);
  }

  function leave(t) {
    if (t.leaving || t.gone) return;
    t.leaving = true;
    window.clearTimeout(t.timer);
    t.el.removeAttribute('data-mounted');
    var ms = transitionMs(t.el);
    if (ms <= 0) { drop(t); return; }
    t.removeTimer = window.setTimeout(function () { drop(t); }, ms + SLACK_MS);
  }

  function arm(t) {
    window.clearTimeout(t.timer);
    if (t.ms > 0) t.timer = window.setTimeout(function () { leave(t); }, t.ms);
  }

  function liveCount() {
    var n = 0, i;
    for (i = 0; i < toasts.length; i++) if (!toasts[i].leaving && !toasts[i].gone) n++;
    return n;
  }

  function toast(text, opts) {
    opts = opts || {};
    var kind = kindOf(opts.kind), k = KINDS[kind];
    var message = text == null ? '' : String(text);
    var ms = typeof opts.ms === 'number' && isFinite(opts.ms) && opts.ms >= 0 ? opts.ms : k.ms;
    var key = kind + '|' + message;

    purge();
    var t = findToast(key);
    if (t) {                                            // the same message again: the same toast, kept longer
      t.ms = ms;
      if (t.leaving) {                                  // halfway through leaving: reverse from where it is
        t.leaving = false;
        window.clearTimeout(t.removeTimer);
        t.el.setAttribute('data-mounted', '');
      }
      arm(t);
      return t.el;
    }

    while (liveCount() >= MAX_TOASTS) {                 // a burst must not bury the screen: the oldest makes room
      var i;
      for (i = 0; i < toasts.length; i++) if (!toasts[i].leaving && !toasts[i].gone) { leave(toasts[i]); break; }
    }

    var el = doc().createElement('dialog');
    el.className = 'ov-toast ov-toast-' + kind;
    el.innerHTML = '<div class="ov-toast-msg"' + (kind === 'bad' ? ' role="alert"' : '') + '>'
      + '<span class="ov-toast-kind">' + draw(k.icon, 18) + '<span>' + esc(w(k.word)) + '</span></span>'
      + '<span class="ov-toast-text">' + esc(message) + '</span></div>'
      + '<button type="button" class="btn btn-quiet ov-toast-close">' + esc(w('close')) + '</button>';
    el.setAttribute('open', '');                        // not show(): that runs the focusing steps and would take focus
    t = { key: key, el: el, ms: ms, leaving: false, gone: false };
    toasts.push(t);
    el.querySelector('.ov-toast-close').addEventListener('click', function () { leave(t); });
    ensureLane().appendChild(el);
    flush(el);
    el.setAttribute('data-mounted', '');
    arm(t);
    return el;
  }

  register();

  window.V2 = { openSheet: openSheet, closeSheet: closeSheet, confirmDialog: confirmDialog, toast: toast };
})(window);

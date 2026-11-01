/* Garage Saathi overlays: a sheet, a confirmation dialog and a toast. Plain script, ES5, no module system, no
 * dependencies. Needs ui/tokens.css and ui/components.css; uses icon() from ui/icons.js when it is loaded and still
 * shows every word when it is not. Test: test_ui_overlay.js (it drives real Chrome).
 *
 *   openSheet(title, html, opts)   a modal panel on the bottom edge. title is plain text; html is markup you trust
 *                                  (the same contract as the live app's openSheet). opts {onClose: function}. Returns
 *                                  the <dialog>. Only one sheet is open at a time: opening another replaces it.
 *   closeSheet()                   plays the exit, then closes. Safe to call twice, or with nothing open.
 *   confirmDialog(text, opts)      a modal question. Returns a Promise of a boolean. opts {title, yes, no, danger}.
 *   toast(text, opts)              a short message. opts {kind: 'ok' | 'warn' | 'bad', ms}. Returns the <dialog>.
 *
 * ALL THREE ARE <dialog>. showModal() gives a sheet and a confirmation a focus trap, an inert page behind them and
 * Escape (the `cancel` event) without a line of script. A toast is the non-modal kind: it must not take focus or make
 * the page inert.
 *
 * A DISMISSED CONFIRMATION IS "NO". confirmDialog resolves true only from a click on its Confirm button. Escape, a click
 * on the backdrop, Cancel, a script calling close() (even close('confirm')) and anything else that ends the dialog all
 * resolve false, and focus starts on Cancel so a reflexive Enter says no. An undecided dialog that is merely removed from
 * the page (a screen redrawing itself with innerHTML on <body>) never resolves; that also never reads as consent.
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
 * KNOWN LIMITS. The live region attributes are tested; what a screen reader does with them is not (no screen reader is
 * run here). Page scroll behind a sheet is not locked (a wheel over the backdrop can still scroll the page); the sheet
 * body does not chain its own scroll to the page. The names openSheet, closeSheet and toast are also globals of the live
 * app.js, with different arguments; loading this file into the live page would replace them (see the Task 5 report). */
(function (window) {
  'use strict';

  var KINDS = {
    ok:   { word: 'Done',    icon: 'ok',   ms: 4000 },
    warn: { word: 'Warning', icon: 'warn', ms: 7000 },
    bad:  { word: 'Error',   icon: 'bad',  ms: 10000 }
  };
  var MAX_TOASTS = 3;
  var SLACK_MS = 30;                   // after the last frame of an exit, before the element is removed
  var seq = 0;

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
    // Escape. The default would close at once, with no exit; ask for the exit instead.
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
      + '<button type="button" class="btn btn-quiet ov-close">Close</button></div>'
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
      var yes = opts.yes == null || String(opts.yes) === '' ? 'Confirm' : String(opts.yes);
      var no = opts.no == null || String(opts.no) === '' ? 'Cancel' : String(opts.no);
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
      + '<span class="ov-toast-kind">' + draw(k.icon, 18) + '<span>' + k.word + '</span></span>'
      + '<span class="ov-toast-text">' + esc(message) + '</span></div>'
      + '<button type="button" class="btn btn-quiet ov-toast-close">Close</button>';
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

  window.openSheet = openSheet;
  window.closeSheet = closeSheet;
  window.confirmDialog = confirmDialog;
  window.toast = toast;
})(window);

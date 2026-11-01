/* Garage Saathi states: empty, error, offline, loading, and the one-number figure.
 * Plain script, ES5, no module system, no dependencies. Needs ui/components.css; uses icon() from ui/icons.js
 * when it is loaded and still shows every word when it is not. Test: test_ui_states.js.
 *
 * WHY THIS EXISTS. The app is offline-first, so what is on screen is often not currently true. Three things must
 * never look alike, and figure() is where they are kept apart:
 *     unknown   no value at all          an em dash (a screen reader hears "No data")
 *     zero      a real reading of 0      0
 *     stale     a value, but an old one  the value AND how old it is
 * Reading "no challans outstanding" off a screen that simply has not synced is the failure this prevents. In
 * JavaScript 0 is falsy, so the question is always `value == null`, never `!value`.
 *
 * For the same reason emptyState() means "I asked, and there are none". Do not draw it for a list that has not
 * loaded or synced; draw skeleton() while loading and offlineState() when there is nothing to show offline.
 *
 * All five functions return a STRING of markup (the live app builds screens with innerHTML). Everything a caller
 * passes in is escaped. Every state is a live region and carries a word, never colour or a drawing alone.
 *
 *   emptyState(text, opts)      opts {icon: icon name (default 'doc'), hint: a second, quieter line}
 *   errorState(text, onRetry)   onRetry, when it is a function, draws a Retry button that calls it (see RETRY)
 *   offlineState()
 *   skeleton(rows)              rows defaults to 3, is a whole number from 1 to 50
 *   figure(value, opts)         opts {unit, at, stale}; returns the markup for ONE number
 *       value  rendered as given: format it first (the thousands separator, the decimals) if you want one.
 *              null, undefined, NaN, +-Infinity, a blank string and anything that is not a number or a string
 *              are "no value": a dash. 0 and "0" are values.
 *       unit   a short string shown after the value ("km"). Not shown for an unknown value.
 *       at     when the value was last true: a millisecond timestamp, a Date, or a date string.
 *       stale  true when the CALLER knows the value is old (the sync layer owns that policy, so figure() invents
 *              no threshold). Only then is the age shown: "Updated 3 hours ago", or "May be out of date" when
 *              `at` is missing or unusable. An old `at` without stale:true shows nothing, by design.
 *
 * WORDS. English only for now; the callers' own text (emptyState, errorState) is whatever language they pass.
 * Wiring the fixed words (Offline, Loading, Retry, No data, Updated ... ago) to the app's translator is a
 * migration step, not done here.
 *
 * RETRY. A markup string cannot carry a function, so errorState() registers onRetry under a number, writes that
 * number into the button (data-state-retry), and one click listener on document finds it again. The registry is
 * bounded (RETRY_CAP): a screen that redraws every few seconds with an inline arrow function would otherwise
 * leak one entry per redraw. The same function reuses its id, and every redraw refreshes it, so a handler that
 * is still on screen is the last to be evicted. A Retry whose handler HAS been evicted disables itself and says
 * to reload, rather than being a button that does nothing.
 *
 * MOTION. None. The skeleton is deliberately static: a looping shimmer cannot stay under the 300ms motion
 * ceiling without strobing, and on the oldest office PCs it costs frames. The visible word "Loading" and
 * aria-busy carry the state. */
(function (window) {
  'use strict';

  var DASH = '\u2014';                 // an escape, so no file encoding can corrupt it
  var RETRY_CAP = 200;
  var MAX_ROWS = 50;
  var DEFAULT_ROWS = 3;

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // A drawing, or nothing when icons.js is not loaded: the words never depend on it.
  function draw(name, size) {
    return typeof window.icon === 'function' ? window.icon(name, { size: size }) : '';
  }

  // Text the caller supplied: shown escaped, with a fallback so a state is never an empty box.
  function words(text, fallback) {
    if (text == null) return esc(fallback);
    var s = String(text);
    return /^\s*$/.test(s) ? esc(fallback) : esc(s);
  }

  /* ---------- figure ---------- */

  // "No value". `value == null` catches null and undefined and NOT 0; that is the whole point.
  function isUnknown(v) {
    if (v == null) return true;
    if (typeof v === 'number') return !isFinite(v);
    if (typeof v === 'string') return /^\s*$/.test(v);
    return true;                       // a boolean, an object or a function is not a reading
  }

  // Milliseconds since `at`, or null when it cannot be told (missing, unparseable, or clearly in the future).
  function ageMs(at) {
    if (at == null) return null;       // not `!at`: 0 is a real timestamp
    var t;
    if (typeof at === 'number') t = at;
    else if (typeof at === 'string') t = Date.parse(at);
    else if (typeof at.getTime === 'function') t = at.getTime();
    else return null;
    if (t !== t || !isFinite(t)) return null;   // NaN
    var ms = Date.now() - t;
    if (ms < -60000) return null;      // more than a minute ahead of this clock: do not guess
    return ms < 0 ? 0 : ms;            // a few seconds of skew is "just now"
  }

  function plural(n, one) { return n + ' ' + one + (n === 1 ? '' : 's') + ' ago'; }

  function ageWords(ms) {
    var m = Math.floor(ms / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return plural(m, 'minute');
    var h = Math.floor(m / 60);
    if (h < 24) return plural(h, 'hour');
    return plural(Math.floor(h / 24), 'day');
  }

  function figure(value, opts) {
    opts = opts || {};
    if (isUnknown(value)) {
      return '<span class="figure" data-state="unknown" title="No data">'
        + '<span class="figure-none" aria-hidden="true">' + DASH + '</span>'
        + '<span class="sr-only">No data</span></span>';
    }
    var unit = (opts.unit == null || String(opts.unit) === '') ? '' : ' <span class="figure-u">' + esc(opts.unit) + '</span>';
    var note = '', state = 'value';
    if (opts.stale) {
      var ms = ageMs(opts.at);
      var age = ms === null ? null : ageWords(ms);
      note = '<span class="figure-note">' + draw('clock', 14) + ' ' + esc(age === null ? 'May be out of date' : 'Updated ' + age) + '</span>';
      state = 'stale';
    }
    return '<span class="figure" data-state="' + state + '"><span>' + esc(String(value)) + '</span>' + unit + note + '</span>';
  }

  /* ---------- retry ---------- */
  var retryList = [];                  // [{id, fn}], least recently drawn first
  var retrySeq = 0;
  var listening = false;

  function retryId(fn) {
    var i, entry = null;
    for (i = 0; i < retryList.length; i++) {
      if (retryList[i].fn === fn) { entry = retryList.splice(i, 1)[0]; break; }
    }
    if (!entry) entry = { id: ++retrySeq, fn: fn };
    retryList.push(entry);             // most recently drawn goes last
    if (retryList.length > RETRY_CAP) retryList.shift();
    listen();
    return entry.id;
  }

  function onClick(ev) {
    var target = ev && ev.target;
    var btn = target && typeof target.closest === 'function' ? target.closest('[data-state-retry]') : null;
    if (!btn) return;
    var id = Number(btn.getAttribute('data-state-retry')), i;
    for (i = 0; i < retryList.length; i++) {
      if (retryList[i].id === id) { retryList[i].fn.call(btn, ev); return; }
    }
    btn.disabled = true;               // its handler was evicted: do not stay a button that does nothing
    btn.textContent = 'Reload the page to retry';
  }

  function listen() {
    if (listening || typeof document === 'undefined' || !document || typeof document.addEventListener !== 'function') return;
    document.addEventListener('click', onClick);
    listening = true;
  }

  /* ---------- the four states ---------- */

  function emptyState(text, opts) {
    opts = opts || {};
    var hint = (opts.hint == null || /^\s*$/.test(String(opts.hint))) ? '' : '<p class="state-hint">' + esc(opts.hint) + '</p>';
    return '<div class="state empty" role="status">' + draw(opts.icon == null ? 'doc' : opts.icon, 32)
      + '<p class="state-text">' + words(text, 'Nothing to show') + '</p>' + hint + '</div>';
  }

  function errorState(text, onRetry) {
    var btn = typeof onRetry === 'function'
      ? '<button type="button" class="btn" data-state-retry="' + retryId(onRetry) + '">Retry</button>' : '';
    return '<div class="state state-error" role="alert" aria-live="assertive">' + draw('bad', 32)
      + '<p class="state-text">' + words(text, 'Something went wrong') + '</p>' + btn + '</div>';
  }

  function offlineState() {
    return '<div class="state state-offline" role="status">' + draw('offline', 32)
      + '<p class="state-text">Offline</p>'
      + '<p class="state-hint">No connection. What you see may be out of date.</p></div>';
  }

  function skeleton(rows) {
    var n = Math.floor(Number(rows));
    if (rows == null || !isFinite(n) || n < 1) n = DEFAULT_ROWS;
    if (n > MAX_ROWS) n = MAX_ROWS;
    var row = '<div class="skeleton-row" aria-hidden="true"><span class="skeleton-bar"></span><span class="skeleton-bar skeleton-bar-short"></span></div>';
    var out = '', i;
    for (i = 0; i < n; i++) out += row;
    return '<div class="skeleton" role="status" aria-busy="true"><span class="skeleton-label">Loading</span>' + out + '</div>';
  }

  window.emptyState = emptyState;
  window.errorState = errorState;
  window.offlineState = offlineState;
  window.skeleton = skeleton;
  window.figure = figure;
})(window);

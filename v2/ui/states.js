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
 *       value  null, undefined, NaN, +-Infinity, a blank string and anything that is not a number or a string
 *              are "no value": a dash. 0 and "0" are values. Rendered as given unless you pass `format`.
 *       format a function (value) -> string|number, for the separator, the decimals, lakh grouping. It is called
 *              ONLY for a real value, after the unknown test, so it can never turn "no value" into a number:
 *              Number(null).toLocaleString() is "0" and String(null) is "null", and a caller who formatted BEFORE
 *              calling figure() would get exactly the unknown-reads-as-zero failure this file exists to prevent.
 *              Do not format first; pass the raw value and a `format`. If the formatted result is itself empty
 *              or not a usable value, the figure falls back to the dash. An exception from `format` is not caught.
 *       unit   a short string shown after the value ("km"). Not shown for an unknown value.
 *
 *       An UNKNOWN figure is a bare dash even when `at`, `stale` or `unit` are passed, on purpose. An age beside
 *       a dash reads as "this dash was true 3 hours ago", which is a claim we cannot make: the dash means we hold
 *       nothing, and a timestamp next to it invites the reader to treat the absence itself as a measurement.
 *       Do not "fix" this to show the age (test_ui_states.js pins it).
 *       at     when the value was last true: a millisecond timestamp, a Date, or a date string. If it is given,
 *              the age is ALWAYS shown ("Updated just now", "Updated 3 hours ago"), flag or no flag: a guarantee
 *              that depended on every caller remembering a flag would not be one. An `at` that cannot be read
 *              says "Updated time unknown" (or "May be out of date" when also stale). Leaving `at` out is the only way to get no age, and it is explicit.
 *       stale  true when the CALLER knows the value is old (how old is old differs per figure, so figure()
 *              invents no threshold). It is emphasis, not the switch for the age: the note turns --warn,
 *              data-state becomes "stale", and with no `at` it says "May be out of date".
 *
 * WORDS. Every fixed word this file draws is an id, read through w(id, n); the table is below and the Hindi is
 * in v2/ui/words.js. The callers' own text (emptyState, errorState) is whatever language they pass, and this
 * file does not touch it. v2-foundation-ui.md section 6.3 is why: a fixed word hard-coded here is a word no Hindi
 * reader is ever told is missing, and that is how a whole screen stayed English with every test passing.
 *
 * RETRY. A markup string cannot carry a function, so errorState() registers onRetry under a number, writes that
 * number into the button (data-state-retry), and one click listener on document finds it again. The registry is
 * bounded (RETRY_CAP = 200, pinned exactly by the test): a screen that redraws every few seconds with an inline arrow function would otherwise
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

  /* ---------- the fixed words ---------- */

  /* Every fixed word this file draws, registered under an id. v2-foundation-ui.md section 6.3: no fixed English word
   * may sit outside a register literal, because one that does is one no Hindi reader is ever told is missing.
   * The English half stays in this file and the Hindi half is in v2/ui/words.js, which is not a choice -
   * test_ui_states.js pins this file to be pure ASCII, comments included, so Devanagari cannot live here.
   * words.js merges the two halves by id, and test_v2_words.js fails on an id that has an English half and no
   * Hindi key anywhere, so the split cannot hide a missing translation. Nothing below is caller text: all of
   * that arrives as an argument and is in whatever language the caller passed. */
  var CHROME = {
    nothingToShow: { en: 'Nothing to show' },
    somethingWrong: { en: 'Something went wrong' },
    retry: { en: 'Retry' },
    reloadToRetry: { en: 'Reload the page to retry' },
    offline: { en: 'Offline' },
    offlineHint: { en: 'No connection. What you see may be out of date.' },
    loading: { en: 'Loading' },
    noData: { en: 'No data' },
    updatedAgo: { en: 'Updated {0}' },
    justNow: { en: 'just now' },
    minutesAgo: { en: { one: '{n} minute ago', other: '{n} minutes ago' } },
    hoursAgo: { en: { one: '{n} hour ago', other: '{n} hours ago' } },
    daysAgo: { en: { one: '{n} day ago', other: '{n} days ago' } },
    mayBeOld: { en: 'May be out of date' },
    timeUnknown: { en: 'Updated time unknown' }
  };
  var registered = false;

  // Registered at load when words.js is already on the page, and on first use when it arrives after this
  // file (index.html's order is not this file's business). Either way the table is in one place.
  function register() {
    if (registered || !window.W || typeof window.W.register !== 'function') return;
    window.W.register(CHROME);
    registered = true;
  }

  // words.js, when the page has loaded it: it holds the Hindi, the pending count and the build checks. When it
  // is not there - a page that has not opted in, or a test that loads this file alone - this table is all there
  // is and every word is English. That is not the section 6.3 defect; there is no Hindi in the build to be missing.
  function lookup() {
    register();
    return registered && typeof window.w === 'function' ? window.w : null;
  }

  // The one or other form, with {n} filled in. Only used when words.js is absent; it does the same there.
  function form(v, n) {
    var s = typeof v === 'string' ? v : (n === 1 ? v.one : v.other);
    return String(s).replace(/\{n\}/g, n === null || n === undefined ? '' : String(n));
  }

  function w(id, n) {
    var t = lookup();
    return t ? t(id, n) : form(CHROME[id].en, n);
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

  function ageWords(ms) {
    var m = Math.floor(ms / 60000);
    if (m < 1) return w('justNow');
    if (m < 60) return w('minutesAgo', m);
    var h = Math.floor(m / 60);
    if (h < 24) return w('hoursAgo', h);
    return w('daysAgo', Math.floor(h / 24));
  }

  /* The age phrase with its prefix. This is the ONE place in v2 where a fixed English word is written outside
   * a register literal, and the reason is a check rather than a preference: test_ui_states.js's mutant "the age
   * is dropped from a stale figure" patches the exact expression `'Updated ' + age` to prove the age reaches
   * the screen, and an expression that is no longer in the file is a mutant that cannot apply. Deleting it
   * would be weakening an existing check to make this slice pass. So the English concatenation stays on the
   * live path, Hindi is read from the table - where {0} puts the age FIRST, which an English prefix glued on
   * by the caller cannot do - and test_v2_words.js pins the two to say the same thing. */
  function updated(age) {
    if (window.W && window.W.lang() === 'hi') return w('updatedAgo').replace('{0}', age);
    return 'Updated ' + age;
  }

  function unknownFigure() {
    var none = esc(w('noData'));
    return '<span class="figure" data-state="unknown" title="' + none + '">'
      + '<span class="figure-none" aria-hidden="true">' + DASH + '</span>'
      + '<span class="sr-only">' + none + '</span></span>';
  }

  function figure(value, opts) {
    opts = opts || {};
    if (isUnknown(value)) return unknownFigure();     // BEFORE `format`, so a formatter never sees "no value"
    var shown = typeof opts.format === 'function' ? opts.format(value) : value;
    if (isUnknown(shown)) return unknownFigure();
    var unit = (opts.unit == null || String(opts.unit) === '') ? '' : ' <span class="figure-u">' + esc(opts.unit) + '</span>';
    var note = '', state = 'value';
    var hasAt = opts.at != null;       // not `!opts.at`: 0 is a real timestamp
    if (opts.stale || hasAt) {
      var ms = ageMs(opts.at);
      var age = ms === null ? null : ageWords(ms);
      // An `at` always shows its age. An `at` that cannot be read says so; only a caller who gives no `at` gets silence.
      var text = age !== null ? updated(age) : (opts.stale ? w('mayBeOld') : w('timeUnknown'));
      note = '<span class="figure-note' + (opts.stale ? ' figure-note-stale' : '') + '">' + draw('clock', 14) + ' ' + esc(text) + '</span>';
      if (opts.stale) state = 'stale';
    }
    return '<span class="figure" data-state="' + state + '"><span>' + esc(String(shown)) + '</span>' + unit + note + '</span>';
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
    btn.textContent = w('reloadToRetry');
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
      + '<p class="state-text">' + words(text, w('nothingToShow')) + '</p>' + hint + '</div>';
  }

  function errorState(text, onRetry) {
    var btn = typeof onRetry === 'function'
      ? '<button type="button" class="btn" data-state-retry="' + retryId(onRetry) + '">' + esc(w('retry')) + '</button>' : '';
    return '<div class="state state-error" role="alert" aria-live="assertive">' + draw('bad', 32)
      + '<p class="state-text">' + words(text, w('somethingWrong')) + '</p>' + btn + '</div>';
  }

  function offlineState() {
    return '<div class="state state-offline" role="status">' + draw('offline', 32)
      + '<p class="state-text">' + esc(w('offline')) + '</p>'
      + '<p class="state-hint">' + esc(w('offlineHint')) + '</p></div>';
  }

  function skeleton(rows) {
    var n = Math.floor(Number(rows));
    if (rows == null || !isFinite(n) || n < 1) n = DEFAULT_ROWS;
    if (n > MAX_ROWS) n = MAX_ROWS;
    var row = '<div class="skeleton-row" aria-hidden="true"><span class="skeleton-bar"></span><span class="skeleton-bar skeleton-bar-short"></span></div>';
    var out = '', i;
    for (i = 0; i < n; i++) out += row;
    return '<div class="skeleton" role="status" aria-busy="true"><span class="skeleton-label">' + esc(w('loading')) + '</span>' + out + '</div>';
  }

  register();

  window.emptyState = emptyState;
  window.errorState = errorState;
  window.offlineState = offlineState;
  window.skeleton = skeleton;
  window.figure = figure;
})(window);

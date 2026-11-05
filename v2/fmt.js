/* Garage Saathi v2 — number and rupee formatting.
 *
 * Pure: a number goes in, a string comes out. No DOM, no store, no clock.
 *
 * Every function here THROWS on anything that is not a finite number, and that
 * is the point of the file rather than a nicety. `fmt.rupees(null)` returning
 * '₹0' is the unknown-reads-as-zero failure that `ui/states.js` exists to
 * prevent, moved one file over: a screen that formats first and asks questions
 * later turns "we do not know" into "it cost nothing" without anybody typing
 * a wrong digit. A screen passes the raw value and a `format` to `figure()`,
 * which draws the dash for null BEFORE it ever calls us; if a null reaches
 * this file the screen has a bug, and a thrown error finds it on the first
 * render where a quiet '₹0' would find it in a quarterly review.
 *
 * The grouping is written out by hand rather than leaning on
 * `toLocaleString('en-IN')`. A browser or a node built without full ICU falls
 * back to thousands grouping — 45,00,000 silently becomes 4,500,000 — and an
 * owner reading a lakh figure in the wrong grouping reads it a decimal place
 * out. test_v2_fmt.js cross-checks this against Intl where Intl is complete.
 *
 * Money is `'₹' + groupIndian(v)` and never `figure()`'s `unit`: `unit` draws
 * AFTER the number and "45,000 ₹" is not how anybody here reads it
 * (screens-work.md §1.1). The same goes for km, hours and days when a screen
 * hands them to `figure` as `unit`: use groupIndian / oneDecimal as the format
 * there. `fmt.km`, `fmt.hours` and `fmt.days` carry their unit, and are for
 * running text — "Lower than the last reading, 48,210 km".
 *
 * Whole rupees. Paise are not shown anywhere in this app and a rounded figure
 * that does not add up to its parts is worse than an unrounded one, so
 * Cost.forBus rounds each part to the rupee BEFORE summing; this file only
 * rounds for display what is already whole.
 */
(function (root) {
  'use strict';

  function need(v, who) {
    if (typeof v !== 'number' || !isFinite(v)) {
      throw new TypeError('fmt.' + who + ' needs a finite number, got ' +
        (v === null ? 'null' : typeof v === 'number' ? String(v) : typeof v) +
        ' — an unknown figure is drawn as the dash by figure(), never formatted');
    }
  }

  // Indian grouping: the last three digits, then pairs. 4500000 -> 45,00,000.
  function groupDigits(s) {
    if (s.length <= 3) return s;
    const head = s.slice(0, -3), tail = s.slice(-3);
    return head.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + tail;
  }

  function groupIndian(v) {
    need(v, 'groupIndian');
    const n = Math.round(Math.abs(v));
    const s = groupDigits(String(n));
    // A figure that rounds to zero has no sign; "-0" is not a number anyone reads.
    return (v < 0 && n !== 0 ? '−' : '') + s;
  }

  function rupees(v) {
    need(v, 'rupees');
    // The sign goes in front of the symbol: −₹1,200, not ₹−1,200.
    const g = groupIndian(Math.abs(v));
    return (v < 0 && g !== '0' ? '−' : '') + '₹' + g;
  }

  // One decimal place, always ("4.0"), Indian grouping on the whole part.
  // Counted in tenths as an integer so 0.05-style float noise cannot flip a digit.
  function oneDecimal(v) {
    need(v, 'oneDecimal');
    const tenths = Math.round(Math.abs(v) * 10);
    const whole = Math.floor(tenths / 10), dec = tenths % 10;
    return (v < 0 && tenths !== 0 ? '−' : '') + groupDigits(String(whole)) + '.' + dec;
  }

  function hours(v) { return oneDecimal(v) + ' h'; }

  function days(v) {
    need(v, 'days');
    const n = Math.round(v);
    return groupIndian(n) + (Math.abs(n) === 1 ? ' day' : ' days');
  }

  function km(v) { return groupIndian(v) + ' km'; }

  const api = { rupees: rupees, groupIndian: groupIndian, oneDecimal: oneDecimal,
                hours: hours, days: days, km: km };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.fmt = api;
})(typeof window !== 'undefined' ? window : this);

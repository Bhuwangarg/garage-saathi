/* Garage Saathi v2 -- the outside-repair rules, in one place.
 *
 * Pure: rows and the clock are ARGUMENTS. No store, no DOM, no Date.now().
 * Five screens read these rules (the card, the board, the register, Fuel &
 * tyres, the digest); if each re-derived "is this outside" or "may it close"
 * they would drift, which is how v1 came to carry two answers.
 *
 * Nothing here renders, so it registers no words. */
(function (root) {
  'use strict';

  var DAY = 86400000;
  /* v1's number (app.js:4789), kept until the owner says otherwise. */
  var OVERDUE_DAYS = 14;
  var CAP = 'gatePass';

  function str(v) { return typeof v === 'string' ? v : ''; }

  function isOutside(card) {
    return !!card && (card.outside === true || str(card.externalVendor) !== '');
  }

  /* The days a bus has been away, from the same fields v1's jobDownDays reads:
   * (outAt - enterAt) once it is back, else (now - enterAt) while the card is
   * open. Until enterAt exists the answer is null and NEVER 0 -- unknown and
   * zero must not look alike. Fractional, as v1; the screen rounds. */
  function awayDays(card, now) {
    if (!card || !card.enterAt) return null;
    if (card.outAt && card.outAt >= card.enterAt) return (card.outAt - card.enterAt) / DAY;
    if (card.status === 'open' || card.status === 'in-progress') {
      return Math.max(0, (now - card.enterAt) / DAY);
    }
    return null;
  }

  /* How long a slip has been out: issue to return, or issue to now. */
  function daysOut(pass, now) {
    if (!pass || !pass.issuedAt) return null;
    var end = pass.status === 'returned' && pass.returnedAt ? pass.returnedAt : now;
    return Math.max(0, (end - pass.issuedAt) / DAY);
  }

  /* Every pass of this card, newest first. A pass with no jobId (issued from a
   * piece, or a v1-era pass) belongs here only if the card names it. */
  function passesFor(card, passes) {
    if (!card) return [];
    return (passes || []).filter(function (p) {
      if (!p || p._deleted) return false;
      if (p.jobId) return p.jobId === card.id;
      return !!card.gatePassId && p.id === card.gatePassId;
    }).sort(function (a, b) { return (b.issuedAt || 0) - (a.issuedAt || 0); });
  }

  function billedPass(card, passes) {
    var list = passesFor(card, passes);
    for (var i = 0; i < list.length; i++) {
      if (list[i].status === 'returned' && list[i].billPhoto) return list[i];
    }
    return null;
  }

  function gateState(card, passes) {
    var reason = str(card && card.closeNoBillReason);
    var latest = passesFor(card, passes)[0];
    var base = latest ? latest.no : (card && card.gatePassNo) || '';
    if (card && (card.billPhotos || []).length >= 1) return { key: 'bill-card', passNo: base, reason: reason };
    var bp = billedPass(card, passes);
    if (bp) return { key: 'bill-pass', passNo: bp.no || '', reason: reason };
    if (reason !== '') return { key: 'no-bill-reason', passNo: base, reason: reason };
    return { key: 'need-bill', passNo: base, reason: '' };
  }

  function gateMet(card, passes) { return gateState(card, passes).key !== 'need-bill'; }

  /* Date first, then a 4-char tail off the record id; never a counter (two
   * supervisors on alternate shifts are both offline). Same scheme as v1
   * (app.js:4773). */
  function passNo(recordId, atMs) {
    var d = new Date(atMs);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    var tail = String(recordId || '').replace(/[^a-z0-9]/gi, '').slice(-4).toUpperCase();
    while (tail.length < 4) tail = '0' + tail;
    return 'OJ-' + String(d.getFullYear()).slice(2) + p(d.getMonth() + 1) + p(d.getDate()) + '-' + tail;
  }

  /* Client mirror of the server rule (contract 4.1): upper-case, drop spaces
   * and hyphens, compare; false when the pass carries no serial. */
  function norm(s) { return String(s == null ? '' : s).toUpperCase().replace(/[\s-]/g, ''); }
  function mismatch(pass, typedSerial) {
    var unit = norm(pass && pass.unitSerial);
    if (unit === '') return false;
    return norm(typedSerial) !== unit;
  }

  var api = { OVERDUE_DAYS: OVERDUE_DAYS, CAP: CAP, isOutside: isOutside, awayDays: awayDays,
              daysOut: daysOut, passesFor: passesFor, gateMet: gateMet, gateState: gateState,
              passNo: passNo, mismatch: mismatch };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Outside = api;
})(typeof window !== 'undefined' ? window : this);

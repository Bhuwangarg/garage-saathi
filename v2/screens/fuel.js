/* Garage Saathi v2 — screen #10, Fuel & tyres. Plain script, no module system.
 * Test: test_v2_fuel.js. Spec: docs/v2/plan/screens-assets.md section 3 (lines 913-1191).
 *
 * Diesel and AdBlue fills with litres, rupees and odometer; mileage in km/l and
 * diesel cost per km; and the per-piece life of tyres and other rotables —
 * fitting, removing, sending out for repair. The crew manager is the person
 * standing at the pump, which is why they hold `addFuel`, and why the four write
 * buttons are the first thing on the screen.
 *
 * ---------------------------------------------------------------------------
 * THE DEFECT THIS SCREEN EXISTS NOT TO REPEAT. 8db78e7: a per-km figure was
 * divided by a missing odometer read, so ₹45,000 of work became ₹45,000 per
 * kilometre, topped the money-pit list, and sent the owner to inspect a healthy
 * bus. The whole defence is three sentences and none of them is arithmetic in
 * this file:
 *
 *   1. THIS FILE DIVIDES NOTHING BY ANYTHING IT HOLDS. km/l, diesel cost per km,
 *      the plausibility band and the six refusals are `Odo.mileage` and
 *      `Odo.rankMileage` (v2/odo.js, built and tested). This screen consumes the
 *      verdict. test_v2_fuel.js reads this file's source and fails if a division
 *      by litres, kilometres, distance, an odometer or a cost appears in it, or
 *      if `|| 1` / `|| 0` appears anywhere — the shape a defaulted denominator
 *      takes.
 *   2. A NUMBER THE APP DOES NOT BELIEVE IS A DASH WITH ITS REASON BESIDE IT,
 *      drawn through figure(null). Never 0, never the fill before.
 *   3. AN UNUSABLE FIGURE LEAVES A RANKING IN BOTH DIRECTIONS. 8db78e7 put one
 *      at the top; the obvious repair puts it at the bottom ("scores zero, so
 *      it sorts last"), which is the same bug facing the other way — a bus with
 *      no reading that sorts as the best in the fleet is a bus nobody looks at.
 *      `Odo.rankMileage` does not sort such a bus at all: it returns it in
 *      `toCheck`, and this screen draws that list separately under "Readings to
 *      check", with the case that applies. It is excluded from the
 *      falling-mileage flag too: a flag fired by a missing number teaches
 *      people to ignore flags.
 *
 * THE SIX REFUSALS keep apart because the fix for each is different: no reading
 * (ask for it on the next fill); a broken instrument (DO NOT ask — asking is how
 * a wrong number gets typed); a reading lower than the last (refused at entry);
 * zero distance; a result outside Odo's plausibility band; part fills only. The
 * wording is built from `reason` + `params` through Odo's own word ids and never
 * by reading `message`, which is English.
 *
 * THE PLAUSIBILITY BAND (1.5 to 12 km/l) IS ODO'S AND IS A GUESS. It is not
 * tightened or widened here. A band set wrong hides a REAL mileage under
 * "Readings to check" and nothing says a true number was thrown away.
 *
 * THREE NUMBERS IN THIS FILE ARE THE SPEC'S GUESSES, with their arithmetic in
 * the comment beside each: FALL_RATIO, FALL_MIN_SPANS, and the two display caps.
 * One query over the `fuel` store — the median and spread of computable km/l —
 * replaces the first two with measurements (screens-assets.md section 9 item 8).
 *
 * ONE DELEGATED LISTENER per event type, and the click listener returns early on
 * `closest(FIELDS)` BEFORE it reads [data-act] — this screen is full of number
 * fields, so it is the one where a count field that navigated away when tapped
 * (it shipped once) would bite hardest. predeploy-gate.sh checks the ordering
 * statically.
 */
(function (root) {
  'use strict';

  var ID = 'fuel';

  /* The selector that must be tested BEFORE [data-act] or [data-nav] is read. A
   * named constant satisfies the gate: it counts the selector text and compares
   * the first non-data closest() against the first data-act one. */
  var FIELDS = 'input, select, textarea, label, .num';

  var STORES = ['buses', 'fuel', 'def', 'components', 'users'];

  /* The display caps. Sized against a PLACEHOLDER set on a developer's Mac; the
   * office PC (Windows 7, Chrome 109, Core 2 Duo) has not been measured and
   * screens-assets.md section 0.5 says so. Change them when the reading exists. */
  var FILLS_CAP = 200;
  var PIECES_CAP = 200;

  /* The falling-mileage flag: this bus's current km/l below 0.85 of the median of
   * its previous three computable spans, and only when at least four computable
   * spans exist. 0.85 and four are the SPEC'S GUESSES, chosen so the flag cannot
   * fire on one bad tank or on a bus with almost no history. 0.85 of a 4.2 km/l
   * median is 3.57; a tank of 3.5 is flagged, a tank of 3.6 is not.
   *
   * SPAN_SCAN is this file's own bound, not the spec's: the scan walks back at
   * most this many full-tank spans looking for four computable ones, so one bus
   * with several hundred fills costs a bounded number of Odo.mileage calls. */
  var FALL_RATIO = 0.85;
  var FALL_MIN_SPANS = 4;
  var FALL_PREVIOUS = 3;
  var SPAN_SCAN = 10;

  /* Who may edit a fill, and who may write `buses`. Neither is a capability in
   * caps.js — the server decides both by role (sync_server.py MANAGER_ROLES, and
   * WRITE_ROLES for `buses`: owner and supervisor). A role list in a screen file
   * is the v1 pattern that let permission and reachability diverge, so this asks
   * the nearest capability held by exactly those two roles. When caps.js grows
   * `editFuel` and `writeBusOdometer` these two constants are the only edit. */
  /* Two real capabilities now, minted in caps.js from the server's own
   * WRITE_ROLES rather than borrowed from the garage setup sheet. Correcting an
   * appended fill and writing a bus odometer are both owner+supervisor, but
   * neither is the same question as CREATING a fill, which four roles may do
   * because the crew manager is the person at the pump. */
  var EDIT_FILL_CAP = 'editFuelFill';
  var BUS_ODO_CAP = 'writeBusOdometer';

  var WORDS = {
    ftLastFill: { en: 'Last fill: {reg}, {age}', hi: '' },
    ftNoFills: { en: 'No fills yet', hi: '' },
    ftLogDiesel: { en: 'Log diesel', hi: '' },
    ftLogDef: { en: 'Log AdBlue', hi: '' },
    ftFitTyre: { en: 'Fit tyre', hi: '' },
    ftFitBattery: { en: 'Fit battery', hi: '' },
    ftTabFills: { en: 'Fills', hi: '' },
    ftTabMileage: { en: 'Mileage', hi: '' },
    ftTabPieces: { en: 'Pieces', hi: '' },
    ftFull: { en: 'Full tank', hi: '' },
    ftPart: { en: 'Part fill', hi: '' },
    ftAdBlue: { en: 'AdBlue', hi: '' },
    ftEdit: { en: 'Edit', hi: '' },
    ftCapLine: { en: 'Showing the newest {shown} of {total} fills.', hi: '' },
    ftPiecesCap: { en: 'Showing {shown} of {total} pieces.', hi: '' },

    ftEmptyFills: { en: 'No fills recorded yet', hi: '' },
    ftEmptyFillsHint: { en: 'Log the first diesel fill.', hi: '' },
    ftEmptyMileage: { en: 'No mileage yet', hi: '' },
    ftEmptyMileageHint: { en: 'Mileage needs two full tanks on one bus.', hi: '' },
    ftEmptyPieces: { en: 'No tyres, batteries or other pieces recorded', hi: '' },
    ftErrFills: { en: 'Could not read the fills', hi: '' },
    ftErrMileage: { en: 'Could not read the mileage', hi: '' },
    ftErrPieces: { en: 'Could not read the pieces', hi: '' },

    ftCostPerKm: { en: 'Diesel cost per km', hi: '' },
    ftFullTankAgo: { en: 'full tank {age}', hi: '' },
    ftRunSince: { en: '{km} km since the last fill', hi: '' },
    ftToCheck: { en: 'Readings to check', hi: '' },
    ftFalling: { en: 'Mileage down {pct}% on the last three tanks', hi: '' },
    ftKmPerL: { en: 'km/l', hi: '' },
    ftLitreUnit: { en: 'L', hi: '' },

    ftStInService: { en: 'In service', hi: '' },
    ftStRemoved: { en: 'Removed', hi: '' },
    ftStSentOut: { en: 'Sent out for repair', hi: '' },
    ftStRefurb: { en: 'Refurbished', hi: '' },
    ftStScrapped: { en: 'Scrapped', hi: '' },
    ftStUnknown: { en: 'State not recorded', hi: '' },
    ftPosMissing: { en: 'Position not recorded', hi: '' },
    ftNoBus: { en: 'Not on a bus', hi: '' },
    ftEvInstall: { en: 'Fitted {date}', hi: '' },
    ftEvRemove: { en: 'Removed {date}', hi: '' },
    ftEvSend: { en: 'Sent out {date}', hi: '' },
    ftEvReturn: { en: 'Returned {date}', hi: '' },
    ftEvScrap: { en: 'Scrapped {date}', hi: '' },
    ftRegister: { en: 'Open the register in Store', hi: '' },
    ftActFit: { en: 'Fit', hi: '' },
    ftActRemove: { en: 'Remove', hi: '' },
    ftActSend: { en: 'Send out for repair', hi: '' },

    ftSheetEdit: { en: 'Edit fill', hi: '' },
    ftBus: { en: 'Bus', hi: '' },
    ftFindBus: { en: 'Find a bus', hi: '' },
    ftLitres: { en: 'Litres', hi: '' },
    ftLitresHint: { en: 'As printed on the pump slip', hi: '' },
    ftRupees: { en: 'Rupees', hi: '' },
    ftOdoNow: { en: 'Odometer now', hi: '' },
    ftLastReading: { en: 'Last reading {km} km, {date}', hi: '' },
    ftLastReadingNoDate: { en: 'Last reading {km} km', hi: '' },
    ftFillKind: { en: 'Full tank or part fill', hi: '' },
    ftChoose: { en: 'Choose', hi: '' },
    ftPump: { en: 'Pump', hi: '' },
    ftPlace: { en: 'Place', hi: '' },
    ftSave: { en: 'Save', hi: '' },
    ftSaving: { en: 'Saving...', hi: '' },
    ftNeedBus: { en: 'Choose the bus', hi: '' },
    ftNeedLitres: { en: 'Enter the litres', hi: '' },
    ftNeedRupees: { en: 'Enter the rupees', hi: '' },
    ftNeedKind: { en: 'Choose full tank or part fill', hi: '' },
    ftOdoDigits: { en: 'Odometer: digits only', hi: '' },
    ftSavedManager: { en: 'Saved', hi: '' },
    ftSavedStaff: { en: 'Saved. A fill cannot be changed. Add a correcting fill if this was wrong.', hi: '' },
    ftNotSent: { en: 'Not sent. The fill is saved on this phone. It will send when there is signal.', hi: '' },
    ftSaveLost: { en: 'Not saved. Nothing was written. Try again.', hi: '' },

    ftPiece: { en: 'Which piece', hi: '' },
    ftNeedPiece: { en: 'Choose the piece', hi: '' },
    ftPosition: { en: 'Which position on the bus', hi: '' },
    ftNeedPosition: { en: 'Say which position', hi: '' },
    ftNoneToFit: { en: 'Nothing of this kind is waiting to be fitted.', hi: '' },
    ftStateAge: { en: '{state}, updated {age}', hi: '' },
    ftFitDone: { en: 'Fitted', hi: '' },
    ftRemoveDone: { en: 'Removed', hi: '' },
    ftSendDone: { en: 'Sent out', hi: '' },
    ftVendor: { en: 'Vendor', hi: '' },
    ftNeedVendor: { en: 'Enter the vendor', hi: '' },
    ftRepairCost: { en: 'Cost, if known', hi: '' },
    ftNote: { en: 'Note', hi: '' },
    ftGateSeam: { en: 'No gate pass can be made from here. The owner or a supervisor makes the slip.', hi: '' },
    ftSendAsk: { en: 'Send {label} out for repair? The unit leaves the garage.', hi: '' },
    ftSendYes: { en: 'Send out', hi: '' },
    ftChanged: { en: 'This piece changed while you were looking. Nothing was written.', hi: '' }
  };

  var registered = false;
  function register() {
    if (registered || !root.W || typeof root.W.register !== 'function') return;
    root.W.register(WORDS);
    registered = true;
  }

  function put(s, vals) {
    return String(s).replace(/\{([A-Za-z0-9]+)\}/g, function (all, k) {
      return vals && Object.prototype.hasOwnProperty.call(vals, k) ? String(vals[k]) : '';
    });
  }

  function say(id, vals) {
    register();
    var s = registered && typeof root.w === 'function' ? root.w(id) : WORDS[id].en;
    return vals ? put(s, vals) : s;
  }

  /* ---------------------------------------------------------------------- *
   * Dependencies, resolved at CALL time (a classic script's top-level const is
   * not a property of window, and the load order is not this file's business).
   * ---------------------------------------------------------------------- */
  function caps() { return (typeof Caps !== 'undefined' && Caps) || root.Caps || null; }
  function router() { return (typeof Router !== 'undefined' && Router) || root.Router || null; }
  function shell() { return (typeof Shell !== 'undefined' && Shell) || root.Shell || null; }
  function cache() { return (typeof Cache !== 'undefined' && Cache) || root.Cache || null; }
  function odo() { return (typeof Odo !== 'undefined' && Odo) || root.Odo || null; }
  function db() { return (typeof DB !== 'undefined' && DB) || root.DB || null; }
  function state() { return (typeof S !== 'undefined' && S) || root.S || null; }
  function doc() { return root.document || null; }
  function ov() { return root.V2 || null; }
  function nowMs() { return Date.now(); }

  function can(role, cap) { var c = caps(); return !!(c && c.can(role, cap)); }
  function draw(name, size) { return typeof root.icon === 'function' ? root.icon(name, { size: size }) : ''; }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fig(v, o) { return typeof root.figure === 'function' ? root.figure(v, o) : ''; }
  function chrome(id, n) { return typeof root.w === 'function' ? root.w(id, n) : id; }

  function newId(prefix) {
    if (typeof uid === 'function') return uid(prefix);
    if (typeof root.uid === 'function') return root.uid(prefix);
    return prefix + nowMs().toString(36) + Math.floor(Math.random() * 1e9).toString(36);
  }

  /* ---------------------------------------------------------------------- *
   * Small readers. None of them defaults a number: a value the app does not
   * hold is null and stays null all the way to figure().
   * ---------------------------------------------------------------------- */
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  /* A reading is a number the app can stand behind: finite and above zero. Zero
   * is the seeded default AND the broken-instrument value (odo.js). */
  function isReading(v) { return isNum(v) && v > 0; }

  /* Should the screen ask this bus for a reading at all? Not when the instrument
   * is broken (case 2): asking is how a wrong number gets typed. Odo.mayAsk is
   * the one rule; this is only a null-safe call to it. */
  function asks(bus) {
    var o = odo();
    return o ? o.mayAsk(bus) : !(bus && bus.odoBroken === true);
  }

  function live(rows) {
    var out = [], i;
    for (i = 0; i < (rows || []).length; i++) if (rows[i] && !rows[i]._deleted) out.push(rows[i]);
    return out;
  }
  function rowsOf(m, name) { return (m && m.cache && m.cache[name]) || []; }
  function busesById(buses) {
    var out = {}, i;
    for (i = 0; i < buses.length; i++) out[buses[i].id] = buses[i];
    return out;
  }
  function regOf(map, id) { var b = map[id]; return b ? (b.regNo || b.id) : String(id == null ? '' : id); }
  function cmpText(a, b) { return String(a).localeCompare(String(b)); }

  function localeOf() {
    return typeof root.W !== 'undefined' && root.W && typeof root.W.lang === 'function' && root.W.lang() === 'hi'
      ? 'hi-IN' : 'en-IN';
  }
  function dayLabel(ts) {
    if (!isNum(ts)) return null;
    var d = new Date(ts);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString(localeOf(), { day: 'numeric', month: 'long' });
  }
  function groupKm(n) { return typeof root.fmt === 'object' ? root.fmt.groupIndian(n) : String(n); }

  /* "2 hours ago", from the chrome's own registered plural words (ui/states.js).
   * A plain phrase, not a figure(): `at` on a figure inside a row adds a block
   * .figure-note, triples the row height and runs the age words once per row
   * (foundation section 2.3 rule 4). A list states its freshness once, in its
   * header; the row's own time is part of its sentence. */
  function agoWords(at) {
    if (!isNum(at)) return '';
    var ms = nowMs() - at;
    if (ms < 0) ms = 0;
    var m = Math.floor(ms / 60000);
    if (m < 1) return chrome('justNow');
    if (m < 60) return chrome('minutesAgo', m);
    var h = Math.floor(m / 60);
    if (h < 24) return chrome('hoursAgo', h);
    return chrome('daysAgo', Math.floor(h / 24));
  }

  /* ====================================================================== *
   * THE ODOMETER VERDICT, as words.
   *
   * `Odo.mileage` returns {ok:false, reason, params, next, message}. `message`
   * is English; a screen that wants Hindi builds the sentence from `reason` and
   * `params` through Odo's own word ids (odo.js header). The six reasons map to
   * six ids and the six stay apart — the fix for each is different.
   * ====================================================================== */
  var REASON_ID = {
    none: 'odoNone',
    lower: 'odoLower',
    same: 'odoSame',
    'part-fill': 'odoPart'
  };

  function refusalId(res) {
    if (!res) return 'odoNone';
    if (res.reason === 'broken') return res.params && res.params.date ? 'odoBroken' : 'odoBrokenUndated';
    if (res.reason === 'implausible') {
      return res.params && res.params.litres != null ? 'odoFit' : 'odoFitNoLitres';
    }
    return REASON_ID[res.reason] || 'odoNone';
  }

  function odoSay(id, params) {
    var s;
    try { s = root.w(id); } catch (e) {
      var o = odo();
      s = o && o.COPY && o.COPY[id] ? o.COPY[id].en : '';
    }
    return put(s, params || {});
  }

  function refusalText(res) {
    return odoSay(refusalId(res), res && res.params);
  }

  /* Which mark and tone a refusal draws with. Never colour alone: every one has
   * a drawing and the words. A broken instrument and a part fill are not
   * somebody's mistake, so they are quiet; the other four are something a person
   * can fix or check, so they are --warn. */
  function refusalTone(res) {
    var r = res && res.reason;
    if (r === 'broken') return { cls: 'ft-dim', mark: 'bad' };
    if (r === 'part-fill') return { cls: 'ft-dim', mark: 'clock' };
    return { cls: 'ft-warn', mark: 'warn' };
  }

  /* ====================================================================== *
   * THE READING THE ENTRY MUST BEAT
   * ====================================================================== */

  /* The highest reading the app holds for this bus: the bus's own stored one and
   * every fill's. null for a broken instrument (nothing to beat, nothing to ask)
   * and for a bus with no reading at all. Highest, not latest — the odometer is
   * forward-only everywhere (927864c, and the server merges `buses.odometer` by
   * max), so a typo that was once accepted high would otherwise lock the field. */
  function lastReading(bus, fills) {
    if (!bus || !asks(bus)) return null;
    var best = null, i, f;
    if (isReading(bus.odometer)) best = { km: bus.odometer, at: isNum(bus.odometerAt) ? bus.odometerAt : null };
    for (i = 0; i < (fills || []).length; i++) {
      f = fills[i];
      if (!f || f._deleted || f.busId !== bus.id || !isReading(f.odometer)) continue;
      best = highest(best, { km: f.odometer, at: isNum(f.at) ? f.at : null });
    }
    return best;
  }

  /* Every bus's highest fill reading in one pass over the fills — the sheet
   * carries a hint per bus and 89 scans of the store would be 89 passes. */
  function readingsByBus(fills) {
    var out = {}, i, f;
    for (i = 0; i < (fills || []).length; i++) {
      f = fills[i];
      if (!f || f._deleted || !isReading(f.odometer)) continue;
      out[f.busId] = highest(out[f.busId] || null, { km: f.odometer, at: isNum(f.at) ? f.at : null });
    }
    return out;
  }

  // The higher of two readings; on a tie, the one that knows WHEN it was taken.
  function highest(a, b) {
    if (!a) return b || null;
    if (!b) return a;
    if (b.km > a.km) return b;
    return b.km === a.km && a.at === null && b.at !== null ? b : a;
  }

  function busReading(bus, byBus) {
    if (!bus || !asks(bus)) return null;
    var own = isReading(bus.odometer) ? { km: bus.odometer, at: isNum(bus.odometerAt) ? bus.odometerAt : null } : null;
    return highest(own, byBus[bus.id] || null);
  }

  function hintOf(last) {
    if (!last) return '';
    var day = dayLabel(last.at);
    return day ? say('ftLastReading', { km: groupKm(last.km), date: day })
      : say('ftLastReadingNoDate', { km: groupKm(last.km) });
  }

  /* ====================================================================== *
   * PARSING. A field's text becomes a number or null; null is never turned
   * into 0 here. Blank odometer is "no reading" and is stored as 0 only at the
   * very last step, because that is the record's existing shape (v1 writes 0)
   * and odo.js reads 0 as "no reading".
   * ====================================================================== */
  function parseDecimal(s) {
    var t = String(s == null ? '' : s).trim();
    if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return null;
    var n = Number(t);
    return isNum(n) ? n : null;
  }
  function parseWhole(s) {
    var t = String(s == null ? '' : s).trim();
    if (!/^\d+$/.test(t)) return null;
    var n = Number(t);
    return isNum(n) ? n : null;
  }

  /* The odometer field on its own. -> {blank, odo, error}
   *   blank   nothing typed (or only zero): case 1, the fill is saved without one
   *   error   a sentence, or null. Digits only; and never lower than the last
   *           reading — Odo.check owns that rule and its wording (927864c).
   * A broken instrument is never asked, so its field is ignored whatever it holds. */
  function checkOdo(text, lastKm, skipLower) {
    var t = String(text == null ? '' : text).trim();
    if (t === '') return { blank: true, odo: null, error: null };
    var n = parseWhole(t);
    if (n === null) return { blank: false, odo: null, error: say('ftOdoDigits') };
    if (!isReading(n)) return { blank: true, odo: null, error: null };
    var o = odo();
    var low = !skipLower && o && isReading(lastKm) ? o.check(lastKm, n, nowMs()) : null;
    if (low) return { blank: false, odo: n, error: odoSay('odoLower', low.params) };
    return { blank: false, odo: n, error: null };
  }

  /* The fill sheet's whole decision, pure. v: strings as typed (plus `kind`);
   * ctx: {lastKm, broken, edit}. -> {ok, reason, odoError, litres, cost, odo, full}
   * `reason` is the sentence beside a Save that cannot be pressed. */
  function validateFill(v, ctx) {
    var c = ctx || {};
    var out = { ok: false, reason: '', odoError: null, litres: null, cost: null, odo: null, full: null,
      odoKeep: c.broken === true };
    var litres = parseDecimal(v.litres), cost = parseDecimal(v.cost);
    var oc = c.broken ? { blank: true, odo: null, error: null } : checkOdo(v.odometer, c.lastKm, c.edit === true);
    out.odoError = oc.error;
    if (!v.busId) { out.reason = say('ftNeedBus'); return out; }
    if (litres === null || !(litres > 0)) { out.reason = say('ftNeedLitres'); return out; }
    if (cost === null) { out.reason = say('ftNeedRupees'); return out; }
    if (v.kind !== 'def' && v.full !== 'full' && v.full !== 'part') { out.reason = say('ftNeedKind'); return out; }
    if (oc.error) { out.reason = oc.error; return out; }
    out.ok = true;
    out.litres = litres;
    out.cost = cost;
    out.odo = oc.odo;
    out.full = v.kind === 'def' ? null : v.full === 'full';
    return out;
  }

  function validateFit(v, ctx) {
    var c = ctx || {};
    var out = { ok: false, reason: '', odoError: null, odo: null, position: '' };
    var oc = c.broken ? { blank: true, odo: null, error: null } : checkOdo(v.odometer, c.lastKm, false);
    out.odoError = oc.error;
    if (!v.pieceId) { out.reason = say('ftNeedPiece'); return out; }
    if (!v.busId) { out.reason = say('ftNeedBus'); return out; }
    out.position = String(v.position == null ? '' : v.position).replace(/\s+/g, ' ').trim();
    if (!out.position) { out.reason = say('ftNeedPosition'); return out; }
    if (oc.error) { out.reason = oc.error; return out; }
    out.ok = true;
    out.odo = oc.odo;
    return out;
  }

  function validateRemove(v, ctx) {
    var c = ctx || {};
    var out = { ok: false, reason: '', odoError: null, odo: null };
    var oc = c.broken ? { blank: true, odo: null, error: null } : checkOdo(v.odometer, c.lastKm, false);
    out.odoError = oc.error;
    if (oc.error) { out.reason = oc.error; return out; }
    out.ok = true;
    out.odo = oc.odo;
    return out;
  }

  function validateSend(v) {
    var out = { ok: false, reason: '', vendor: '', cost: null };
    out.vendor = String(v.vendor == null ? '' : v.vendor).replace(/\s+/g, ' ').trim();
    if (!out.vendor) { out.reason = say('ftNeedVendor'); return out; }
    var t = String(v.cost == null ? '' : v.cost).trim();
    out.cost = t === '' ? null : parseDecimal(t);
    out.ok = true;
    return out;
  }

  /* ====================================================================== *
   * MILEAGE. Everything here is a call into Odo; the only arithmetic is a
   * subtraction of two readings (run since) and a ratio of two Odo verdicts
   * (the falling flag).
   * ====================================================================== */

  function bySeq(fills) {
    var out = [], i;
    for (i = 0; i < fills.length; i++) if (fills[i] && !fills[i]._deleted && isNum(fills[i].at)) out.push(fills[i]);
    out.sort(function (a, b) { return a.at - b.at; });
    return out;
  }

  /* The computable full-tank spans of one bus, newest first, at most `limit`.
   * Each is `Odo.mileage` over the fills up to and including one full tank, so a
   * span's wording, band and part-fill rule are Odo's and are not re-derived. A
   * span Odo refuses is skipped — it is not a span, and it is never averaged. */
  function spansOf(bus, seq, limit) {
    var o = odo(), out = [], scanned = 0, j;
    var fullAt = [];
    for (j = 0; j < seq.length; j++) if (seq[j].full === true) fullAt.push(j);
    for (j = fullAt.length - 1; j >= 1 && scanned < SPAN_SCAN && out.length < limit; j--) {
      scanned++;
      var r = o.mileage(bus, seq.slice(0, fullAt[j] + 1));
      if (r && r.ok === true && isNum(r.kmpl)) out.push(r.kmpl);
    }
    return out;
  }

  function median3(a, b, c) {
    var s = [a, b, c].sort(function (x, y) { return x - y; });
    return s[1];
  }

  /* -> {pct} or null. `current` and `median` are both Odo verdicts' km/l, so
   * neither can be zero; the guard is here anyway because a ratio is the one
   * place in this file where a divisor exists, and a divisor is never assumed. */
  function fallingFlag(current, previous) {
    if (!isNum(current) || !(current > 0) || previous.length < FALL_PREVIOUS) return null;
    var med = median3(previous[0], previous[1], previous[2]);
    if (!isNum(med) || !(med > 0)) return null;
    if (!(current < FALL_RATIO * med)) return null;
    return { pct: Math.round((1 - current / med) * 100) };
  }

  /* Everything a ranked mileage row shows besides the verdict itself. */
  function extrasOf(bus, fills, result) {
    var seq = bySeq(fills), i, lastFull = null, lastRead = null;
    for (i = seq.length - 1; i >= 0; i--) {
      if (lastFull === null && seq[i].full === true) lastFull = seq[i];
      if (lastRead === null && isReading(seq[i].odometer)) lastRead = seq[i];
    }
    var run = null;
    if (asks(bus) && isReading(bus.odometer) && lastRead && bus.odometer >= lastRead.odometer) {
      run = bus.odometer - lastRead.odometer;
    }
    var spans = spansOf(bus, seq, FALL_MIN_SPANS);
    var flag = spans.length >= FALL_MIN_SPANS ? fallingFlag(result.kmpl, spans.slice(1, 1 + FALL_PREVIOUS)) : null;
    return { fullAt: lastFull ? lastFull.at : null, run: run, falling: flag };
  }

  /* The mileage index: one pass, memoised on the identity of the two arrays it
   * reads (Cache.load keeps the old array when the content is unchanged, so
   * identity is a sound key), never built from a draw function. */
  var memo = null;

  function mileageIndex(buses, fuel) {
    if (memo && memo.buses === buses && memo.fuel === fuel) return memo.value;
    var o = odo();
    var by = {}, i, f;
    for (i = 0; i < fuel.length; i++) {
      f = fuel[i];
      if (!f || f._deleted) continue;
      (by[f.busId] || (by[f.busId] = [])).push(f);
    }
    var sorted = live(buses).sort(function (a, b) { return cmpText(a.regNo || a.id, b.regNo || b.id); });
    var items = [], info = {};
    for (i = 0; i < sorted.length; i++) {
      var b = sorted[i];
      var fills = by[b.id] || [];
      // A bus nobody has filled and whose instrument works has nothing to say.
      if (!fills.length && asks(b)) continue;
      var result = o.mileage(b, fills);
      items.push({ busId: b.id, result: result });
      info[b.id] = { bus: b, fills: fills, result: result };
    }
    var ranking = o.rankMileage(items);
    var ranked = [], toCheck = [];
    for (i = 0; i < ranking.ranked.length; i++) {
      var r = ranking.ranked[i], inf = info[r.busId];
      var ex = extrasOf(inf.bus, inf.fills, r.result);
      ranked.push({ busId: r.busId, reg: inf.bus.regNo || inf.bus.id, result: r.result, kmpl: r.kmpl,
        fullAt: ex.fullAt, run: ex.run, falling: ex.falling });
    }
    for (i = 0; i < ranking.toCheck.length; i++) {
      var c = ranking.toCheck[i], ci = info[c.busId];
      toCheck.push({ busId: c.busId, reg: ci.bus.regNo || ci.bus.id, result: ci.result,
        reason: c.reason, next: c.next });
    }
    memo = { buses: buses, fuel: fuel, value: { ranked: ranked, toCheck: toCheck, fills: live(fuel).length } };
    return memo.value;
  }

  /* ====================================================================== *
   * THE MODEL
   * ====================================================================== */

  var current = 'fills';              // local, never a route: a back press must leave the screen
  var failed = false;                 // the last store read rejected

  function tabsFor(c) {
    var out = [];
    if (c.fuel) out.push('fills', 'mileage');
    if (c.comp) out.push('pieces');
    return out;
  }

  function tab(id) {
    if (id === 'fills' || id === 'mileage' || id === 'pieces') current = id;
    return current;
  }

  var NEEDS = { fills: ['fuel', 'def', 'buses'], mileage: ['fuel', 'buses'], pieces: ['components', 'buses'] };

  function notLoaded(m, which) {
    var need = NEEDS[which], i;
    if (!m || !m.cache) return true;
    for (i = 0; i < need.length; i++) if (m.cache[need[i]] === undefined) return true;
    return false;
  }

  function newestFill(fuel, def) {
    var best = null, i, all = fuel.concat(def);
    for (i = 0; i < all.length; i++) {
      if (!all[i] || all[i]._deleted || !isNum(all[i].at)) continue;
      if (!best || all[i].at > best.at) best = all[i];
    }
    return best;
  }

  function fillRows(fuel, def, bmap, byBus) {
    var all = [], i, f;
    for (i = 0; i < fuel.length; i++) if (fuel[i] && !fuel[i]._deleted) all.push({ store: 'fuel', rec: fuel[i] });
    for (i = 0; i < def.length; i++) if (def[i] && !def[i]._deleted) all.push({ store: 'def', rec: def[i] });
    all.sort(function (a, b) {
      var x = a.rec.at, y = b.rec.at;
      if (!isNum(x) && !isNum(y)) return cmpText(a.rec.id, b.rec.id);
      if (!isNum(x)) return 1;            // a fill with no time sorts last and says nothing about when
      if (!isNum(y)) return -1;
      return y - x || cmpText(a.rec.id, b.rec.id);
    });
    var total = all.length, out = [];
    for (i = 0; i < all.length && i < FILLS_CAP; i++) {
      f = all[i];
      out.push({ store: f.store, rec: f.rec, reg: regOf(bmap, f.rec.busId), bus: bmap[f.rec.busId] || null });
    }
    return { rows: out, total: total };
  }

  var STATE_ORDER = { 'in-service': 0, 'sent-out': 1, removed: 2, refurbished: 3, scrapped: 4 };

  function lastEvent(c) {
    var h = c && c.history, best = null, i;
    if (!h || !h.length) return null;
    for (i = 0; i < h.length; i++) {
      if (!h[i] || typeof h[i].type !== 'string') continue;
      if (!best || (isNum(h[i].at) && (!isNum(best.at) || h[i].at >= best.at))) best = h[i];
    }
    return best;
  }

  function pieceRows(components, bmap) {
    var all = live(components);
    all.sort(function (a, b) {
      var x = STATE_ORDER[a.state], y = STATE_ORDER[b.state];
      x = x === undefined ? 9 : x;
      y = y === undefined ? 9 : y;
      return x - y || cmpText(a.kind || '', b.kind || '') || cmpText(a.label || a.id, b.label || b.id);
    });
    var out = [], i;
    for (i = 0; i < all.length && i < PIECES_CAP; i++) {
      out.push({ rec: all[i], reg: all[i].busId ? regOf(bmap, all[i].busId) : '', last: lastEvent(all[i]) });
    }
    return { rows: out, total: all.length };
  }

  function model(m) {
    register();
    var me = (m && m.user) || null;
    var role = me ? String(me.role) : ((m && m.role) || null);
    var c = {
      fuel: can(role, 'addFuel'),
      comp: can(role, 'manageComponents'),
      fleet: can(role, 'fleet'),
      store: can(role, 'viewStore'),
      manager: can(role, EDIT_FILL_CAP),
      gatepass: can(role, 'outsideJob')
    };
    var tabs = tabsFor(c);
    var which = tabs.indexOf(current) >= 0 ? current : tabs[0];
    var buses = live(rowsOf(m, 'buses')), bmap = busesById(buses);
    var v = {
      role: role, me: me, can: c, tabs: tabs, tab: which,
      density: (m && m.density) || 'yard',
      offline: !!(m && m.offline), stale: !!(m && m.stale),
      loading: !which || notLoaded(m, which), failed: failed,
      last: undefined, fills: null, mileage: null, pieces: null
    };
    if (c.fuel && m && m.cache && m.cache.fuel !== undefined) {
      var nf = newestFill(live(rowsOf(m, 'fuel')), live(rowsOf(m, 'def')));
      v.last = nf ? { reg: regOf(bmap, nf.busId), at: nf.at } : null;
    }
    if (v.loading) return v;
    if (which === 'fills') {
      var fuel = live(rowsOf(m, 'fuel'));
      v.fills = fillRows(fuel, live(rowsOf(m, 'def')), bmap, readingsByBus(fuel));
    } else if (which === 'mileage') {
      v.mileage = mileageIndex(rowsOf(m, 'buses'), rowsOf(m, 'fuel'));
    } else if (which === 'pieces') {
      v.pieces = pieceRows(rowsOf(m, 'components'), bmap);
    }
    return v;
  }

  /* ====================================================================== *
   * render
   * ====================================================================== */

  function litresFormat(n) {
    return root.fmt.oneDecimal(n) + ' ' + say('ftLitreUnit');
  }
  function rupeesFormat(n) { return root.fmt.rupees(n); }

  /* Diesel cost per km to two places (spec section 3.6): fmt.rupees is whole
   * rupees, and a per-km figure of 95.10 shown as 95 would hide the one digit
   * the owner compares buses by. Counted in paise as an integer, so float noise
   * cannot flip the last digit. */
  function rupeesTwoPlaces(n) {
    var paise = Math.round(Math.abs(n) * 100);
    var whole = Math.floor(paise / 100), frac = paise - whole * 100;
    return root.fmt.rupees(n < 0 ? -whole : whole) + '.' + (frac < 10 ? '0' : '') + frac;
  }

  function header(v) {
    var line;
    if (!v.can.fuel) line = '';
    else if (v.last) line = say('ftLastFill', { reg: v.last.reg, age: agoWords(v.last.at) });
    else if (v.last === null) line = say('ftNoFills');
    else line = '';
    var extra = '';
    if (v.offline) extra = ' <span class="ft-off">' + draw('offline', 14) + ' ' + esc(chrome('offlineHint')) + '</span>';
    else if (v.stale) extra = ' <span class="ft-off">' + draw('clock', 14) + ' ' + esc(chrome('mayBeOld')) + '</span>';
    if (!line && !extra) return '';
    return '<p class="ft-last">' + esc(line) + extra + '</p>';
  }

  /* The four writes, as buttons, at the top: this person is standing at a pump or
   * at a tyre shop and has one hand. "Log diesel" is the only primary — it is
   * what happens most. Absent without the capability, never disabled. The group
   * carries data-density="yard" so the buttons stay at --tap 48px at desk too. */
  function buttons(v) {
    var out = '';
    if (v.can.fuel) {
      out += '<button type="button" class="btn btn-primary" data-act="ftLog" data-kind="fuel">'
        + draw('fuel', 20) + ' ' + esc(say('ftLogDiesel')) + '</button>'
        + '<button type="button" class="btn" data-act="ftLog" data-kind="def">'
        + esc(say('ftLogDef')) + '</button>';
    }
    if (v.can.comp) {
      out += '<button type="button" class="btn" data-act="ftFit" data-kind="tyre">'
        + draw('tyre', 20) + ' ' + esc(say('ftFitTyre')) + '</button>'
        + '<button type="button" class="btn" data-act="ftFit" data-kind="battery">'
        + draw('battery', 20) + ' ' + esc(say('ftFitBattery')) + '</button>';
    }
    return out ? '<div class="ft-top" data-density="yard">' + out + '</div>' : '';
  }

  function tabStrip(v) {
    var label = { fills: 'ftTabFills', mileage: 'ftTabMileage', pieces: 'ftTabPieces' };
    var out = '', i;
    for (i = 0; i < v.tabs.length; i++) {
      var id = v.tabs[i], on = id === v.tab;
      out += '<button type="button" role="tab" aria-selected="' + (on ? 'true' : 'false') + '"'
        + ' data-act="ftTab" data-tab="' + id + '">' + esc(say(label[id])) + '</button>';
    }
    return '<div class="tabs ft-tabs" role="tablist">' + out + '</div>';
  }

  /* ---- Fills --------------------------------------------------------------- */

  function odoPart(row) {
    var f = row.rec;
    if (isReading(f.odometer)) return '<span>' + esc(root.fmt.km(f.odometer)) + '</span>';
    /* No reading on this fill. A broken instrument is NOT somebody who forgot:
     * it gets Odo's broken sentence and no warning, because the fix is a
     * workshop job and the mark would ask the reader for a number. */
    if (row.bus && !asks(row.bus)) {
      var res = odo().mileage(row.bus, []);
      return '<span class="ft-dim">' + esc(refusalText(res)) + '</span>';
    }
    return '<span class="ft-warn">' + draw('warn', 14) + ' ' + esc(odoSay('odoNone')) + '</span>';
  }

  function fillRow(row, v) {
    var f = row.rec, isDef = row.store === 'def';
    var litres = fig(isNum(f.litres) ? f.litres : null, { format: litresFormat });
    var money = fig(isNum(f.cost) ? f.cost : null, { format: rupeesFormat });
    var t = (isDef ? esc(say('ftAdBlue')) + ' · ' : '') + esc(row.reg) + ' · ' + litres + ' · ' + money;
    var where = [];
    if (f.pump) where.push(String(f.pump));
    if (f.place) where.push(String(f.place));
    var sub = odoPart(row);
    if (where.length) sub += ' · ' + esc(where.join(', '));
    var age = agoWords(f.at);
    if (age) sub += ' · ' + esc(age);
    var act = '';
    if (!isDef) {
      act += '<span class="badge ' + (f.full === true ? 'badge-ok' : 'badge-warn') + '">'
        + esc(say(f.full === true ? 'ftFull' : 'ftPart')) + '</span>';
    }
    // A fill cannot be edited by the person who made it: fuel and def are
    // append-only for non-managers (02 section 4.4), so there is no control —
    // absent, not disabled.
    if (v.can.manager) {
      act += '<button type="button" class="btn btn-quiet" data-act="ftEditFill" data-store="' + row.store
        + '" data-id="' + esc(f.id) + '">' + draw('edit', 16) + ' ' + esc(say('ftEdit')) + '</button>';
    }
    return '<div class="v2row v2row-why ft-fill">'
      + '<span class="lead">' + draw('fuel', 20) + '</span>'
      + '<div class="txt"><div class="t">' + t + '</div><div class="sub">' + sub + '</div></div>'
      + (act ? '<div class="act">' + act + '</div>' : '') + '</div>';
  }

  function fillsBody(v) {
    var out = '', i;
    for (i = 0; i < v.fills.rows.length; i++) out += fillRow(v.fills.rows[i], v);
    if (v.fills.total > v.fills.rows.length) {
      out += '<p class="ft-cap">' + esc(say('ftCapLine', { shown: v.fills.rows.length, total: v.fills.total })) + '</p>';
    }
    return out;
  }

  /* ---- Mileage ------------------------------------------------------------- */

  /* A bus row is an a.v2row ONLY for a holder of `fleet`. For a storekeeper and a
   * crew manager it is a div.v2row — not a link that bounces, not a greyed link
   * (01 section 1.3 item 7). The answer is on the row, so the person who cannot
   * navigate still gets it. A row that does not link has no href, no data-act, no
   * tabindex and no role: it is not a control. */
  function busRow(v, busId, inner, tone) {
    var cls = 'v2row v2row-why ft-bus' + (tone ? ' ' + tone : '');
    if (v.can.fleet) {
      return '<a class="' + cls + '" href="#" data-act="ftOpenBus" data-bus="' + esc(busId) + '">' + inner + '</a>';
    }
    return '<div class="' + cls + '">' + inner + '</div>';
  }

  function rankedRow(v, r) {
    var cost = fig(isNum(r.result.costPerKm) ? r.result.costPerKm : null, { format: rupeesTwoPlaces });
    var line = esc(say('ftCostPerKm')) + ' ' + cost + ' · ' + esc(root.fmt.km(r.result.toKm));
    var age = agoWords(r.fullAt);
    if (age) line += ' · ' + esc(say('ftFullTankAgo', { age: age }));
    var more = '';
    if (r.run !== null) {
      more += '<div class="sub">' + esc(say('ftRunSince', { km: groupKm(r.run) })) + '</div>';
    }
    if (r.falling) {
      more += '<div class="sub ft-warn">' + draw('warn', 14) + ' '
        + esc(say('ftFalling', { pct: r.falling.pct })) + '</div>';
    }
    var act = fig(r.kmpl, { format: root.fmt.oneDecimal, unit: say('ftKmPerL') });
    return busRow(v, r.busId,
      '<span class="lead">' + draw('bus', 20) + '</span>'
      + '<div class="txt"><div class="t">' + esc(r.reg) + '</div><div class="sub">' + line + '</div>' + more + '</div>'
      + '<div class="act">' + act + '</div>', r.falling ? 'warn' : '');
  }

  /* A bus whose figure cannot be used. The dash is figure(null) — which a screen
   * reader hears as "No data" — and the reason is in words beside it. It carries
   * no number of any kind, so it cannot be mistaken for a rank. */
  function checkRow(v, r) {
    var tone = refusalTone(r.result);
    var inner = '<span class="lead">' + draw('bus', 20) + '</span>'
      + '<div class="txt"><div class="t">' + esc(r.reg) + '</div>'
      + '<div class="sub ' + tone.cls + '">' + draw(tone.mark, 14) + ' ' + esc(refusalText(r.result)) + '</div>'
      // The one next step, and only for a case that has one. A broken
      // instrument has none, on purpose: asking for a reading is how a wrong
      // number gets typed.
      + (r.next ? '<div class="sub">' + esc(r.next) + '</div>' : '')
      + '</div><div class="act">' + fig(null) + '</div>';
    return busRow(v, r.busId, inner, '');
  }

  function mileageBody(v) {
    var mi = v.mileage, out = '', i;
    if (mi.fills < 2 || (!mi.ranked.length && !mi.toCheck.length)) {
      return root.emptyState(say('ftEmptyMileage'), { icon: 'fuel', hint: say('ftEmptyMileageHint') });
    }
    for (i = 0; i < mi.ranked.length; i++) out += rankedRow(v, mi.ranked[i]);
    if (mi.toCheck.length) {
      out += '<h3 class="ft-h">' + esc(say('ftToCheck')) + '</h3>';
      for (i = 0; i < mi.toCheck.length; i++) out += checkRow(v, mi.toCheck[i]);
    }
    return out;
  }

  /* ---- Pieces -------------------------------------------------------------- */

  var STATE_WORD = { 'in-service': 'ftStInService', removed: 'ftStRemoved', 'sent-out': 'ftStSentOut',
    refurbished: 'ftStRefurb', scrapped: 'ftStScrapped' };
  var STATE_BADGE = { 'in-service': 'badge-ok', 'sent-out': 'badge-warn' };
  var EVENT_WORD = { install: 'ftEvInstall', remove: 'ftEvRemove', 'send-out': 'ftEvSend',
    'return': 'ftEvReturn', scrap: 'ftEvScrap' };

  function kindMark(kind) { return kind === 'tyre' ? 'tyre' : (kind === 'battery' ? 'battery' : 'part'); }

  function stateWord(s) { return say(STATE_WORD[s] || 'ftStUnknown'); }

  function fittable(c) { return c.state === 'removed' || c.state === 'refurbished'; }

  function pieceRow(row, v) {
    var c = row.rec;
    var title = (c.label || c.id) + (c.serial ? ' · ' + c.serial : '');
    var where;
    if (c.state === 'in-service' && c.busId) {
      var pos = String(c.position == null ? '' : c.position).trim();
      where = pos
        ? '<span>' + esc(row.reg + ' · ' + pos) + '</span>'
        : '<span>' + esc(row.reg) + '</span> <span class="ft-warn">' + draw('warn', 14) + ' ' + esc(say('ftPosMissing')) + '</span>';
    } else if (c.state === 'in-service') {
      where = '<span class="ft-warn">' + draw('warn', 14) + ' ' + esc(say('ftPosMissing')) + '</span>';
    } else {
      where = '<span>' + esc(say('ftNoBus')) + '</span>';
    }
    var ev = '';
    if (row.last && EVENT_WORD[row.last.type]) {
      var day = dayLabel(row.last.at);
      if (day) ev = '<div class="sub">' + esc(say(EVENT_WORD[row.last.type], { date: day })) + '</div>';
    }
    var acts = '';
    if (fittable(c)) {
      acts += '<button type="button" class="btn" data-act="ftFit" data-kind="' + esc(c.kind || 'other')
        + '" data-id="' + esc(c.id) + '">' + esc(say('ftActFit')) + '</button>';
    }
    if (c.state === 'in-service') {
      acts += '<button type="button" class="btn" data-act="ftRemove" data-id="' + esc(c.id) + '">'
        + esc(say('ftActRemove')) + '</button>';
    }
    if (c.state === 'in-service' || c.state === 'removed') {
      acts += '<button type="button" class="btn" data-act="ftSend" data-id="' + esc(c.id) + '">'
        + esc(say('ftActSend')) + '</button>';
    }
    return '<div class="ft-piece">'
      + '<div class="v2row v2row-why ft-pc">'
      + '<span class="lead">' + draw(kindMark(c.kind), 20) + '</span>'
      + '<div class="txt"><div class="t">' + esc(title) + '</div><div class="sub">' + where + '</div>' + ev + '</div>'
      + '<div class="act"><span class="badge ' + (STATE_BADGE[c.state] || '') + '">' + esc(stateWord(c.state)) + '</span></div>'
      + '</div>'
      + (acts && v.can.comp ? '<div class="ft-pacts" data-density="yard">' + acts + '</div>' : '')
      + '</div>';
  }

  function piecesBody(v) {
    var out = '', i;
    // The link into Store's register is ABSENT for a role without viewStore — not
    // a link that bounces, which is the same dead end as the bus row's.
    if (v.can.store) {
      out += '<p class="ft-reg"><a class="btn btn-quiet" href="#" data-nav="store">'
        + esc(say('ftRegister')) + '</a></p>';
    }
    for (i = 0; i < v.pieces.rows.length; i++) out += pieceRow(v.pieces.rows[i], v);
    if (v.pieces.total > v.pieces.rows.length) {
      out += '<p class="ft-cap">' + esc(say('ftPiecesCap', { shown: v.pieces.rows.length, total: v.pieces.total })) + '</p>';
    }
    return out;
  }

  /* ---- the view ------------------------------------------------------------ */

  function retry() { reload(); }

  function viewBody(v) {
    if (v.failed) {
      var err = v.tab === 'mileage' ? 'ftErrMileage' : (v.tab === 'pieces' ? 'ftErrPieces' : 'ftErrFills');
      return root.errorState(say(err), retry);
    }
    if (v.loading) return root.skeleton(v.tab === 'pieces' ? 6 : (v.tab === 'mileage' ? 6 : 8));
    if (v.tab === 'fills') {
      return v.fills.rows.length ? fillsBody(v)
        : root.emptyState(say('ftEmptyFills'), { icon: 'fuel', hint: say('ftEmptyFillsHint') });
    }
    if (v.tab === 'mileage') return mileageBody(v);
    return v.pieces.rows.length ? piecesBody(v) : root.emptyState(say('ftEmptyPieces'), { icon: 'tyre' });
  }

  function render(m) {
    var v = model(m);
    /* The four buttons draw in the first paint and never wait for a store. */
    return '<div class="ft">' + header(v) + buttons(v) + (v.tabs.length ? tabStrip(v) : '')
      + '<div class="ft-view"' + (v.density === 'desk' ? ' data-density="desk"' : '') + '>' + viewBody(v) + '</div></div>';
  }

  /* ====================================================================== *
   * THE SHEETS. Markup only; the values are read back from the DOM by
   * readSheet() and decided by the validate* functions above.
   * ====================================================================== */

  function numField(label, field, kind, hint, extra) {
    return '<label class="num ft-num"' + (extra || '') + '><span class="num-l">' + esc(label) + '</span>'
      + '<input class="field num-in" type="text" inputmode="' + (kind === 'decimal' ? 'decimal' : 'numeric') + '"'
      + ' pattern="' + (kind === 'decimal' ? '[0-9]*[.]?[0-9]*' : '[0-9]*') + '" autocomplete="off" enterkeyhint="done"'
      + ' data-kind="' + kind + '" data-field="' + field + '" aria-invalid="false">'
      + (hint ? '<span class="num-h" data-hint>' + esc(hint) + '</span>' : '<span class="num-h" data-hint></span>')
      + '<span class="num-h ft-err" data-err hidden></span></label>';
  }

  function textField(label, field) {
    return '<label class="num ft-num"><span class="num-l">' + esc(label) + '</span>'
      + '<input class="field" type="text" autocomplete="off" enterkeyhint="done" data-field="' + field + '"></label>';
  }

  /* The bus picker: a search box over a list of radios, the buses this person
   * logged most recently first, NOTHING pre-selected. Each radio carries what the
   * odometer block needs (last reading, hint, broken sentence), so choosing a bus
   * never needs the model. */
  function busPicker(buses, fills, meId) {
    var byBus = readingsByBus(fills);
    var recentRank = {}, i, f, n = 0;
    var mine = [];
    for (i = 0; i < fills.length; i++) if (fills[i] && !fills[i]._deleted && fills[i].by === meId && isNum(fills[i].at)) mine.push(fills[i]);
    mine.sort(function (a, b) { return b.at - a.at; });
    for (i = 0; i < mine.length; i++) {
      f = mine[i];
      if (recentRank[f.busId] === undefined) recentRank[f.busId] = n++;
    }
    var list = buses.slice().sort(function (a, b) {
      var x = recentRank[a.id], y = recentRank[b.id];
      if (x !== undefined && y !== undefined) return x - y;
      if (x !== undefined) return -1;
      if (y !== undefined) return 1;
      return cmpText(a.regNo || a.id, b.regNo || b.id);
    });
    var out = '';
    for (i = 0; i < list.length; i++) {
      var b = list[i], last = busReading(b, byBus);
      var note = asks(b) ? '' : refusalText(odo().mileage(b, []));
      out += '<label class="v2row ft-pick"><span class="lead">' + draw('bus', 20) + '</span>'
        + '<span class="ft-pick-main"><span class="t">' + esc(b.regNo || b.id) + '</span></span>'
        + '<span class="act"><input type="radio" class="ft-bus-r" name="ft-bus" value="' + esc(b.id) + '"'
        + ' data-last="' + (last ? last.km : '') + '" data-hint="' + esc(hintOf(last)) + '"'
        + ' data-broken="' + esc(note) + '" aria-label="' + esc(b.regNo || b.id) + '"></span></label>';
    }
    return '<div class="ft-find-box">' + textField(say('ftFindBus'), 'find').replace('class="num ft-num"', 'class="num ft-num ft-find"')
      + '</div><div class="ft-picklist" role="radiogroup" aria-label="' + esc(say('ftBus')) + '">' + out + '</div>';
  }

  function saveBar(id, label) {
    return '<div class="ft-save"><button type="button" class="btn btn-primary ft-save-b" data-act="' + id
      + '" aria-disabled="true">' + esc(label) + '</button>'
      + '<p class="ft-why" data-why role="status"></p></div>';
  }

  /* The odometer block of a sheet. `broken` swaps it for Odo's sentence and NO
   * request: a field here would be an invitation to type a number. */
  function odoBlock(hint, brokenNote, value) {
    var f = numField(say('ftOdoNow'), 'odometer', 'whole', hint);
    if (value) f = f.replace('data-field="odometer"', 'data-field="odometer" value="' + esc(value) + '"');
    return '<div data-odo' + (brokenNote ? ' hidden' : '') + '>' + f + '</div>'
      + '<p class="ft-dim ft-brokennote" data-broken-note' + (brokenNote ? '' : ' hidden') + '>'
      + draw('bad', 14) + ' <span data-broken-text>' + esc(brokenNote || '') + '</span></p>';
  }

  function fillSheet(o) {
    var kind = o.kind === 'def' ? 'def' : 'fuel';
    var edit = o.edit || null;
    var bus = edit ? edit.bus : null;
    var rec = edit ? edit.rec : null;
    var body = '';
    var brokenNote = '';
    var hint = '';
    if (edit) {
      var last = busReading(bus, readingsByBus(o.fills));
      hint = hintOf(last);
      brokenNote = bus && !asks(bus) ? refusalText(odo().mileage(bus, [])) : '';
      body += '<p class="ft-fixed">' + draw('bus', 20) + ' <b>' + esc(bus ? (bus.regNo || bus.id) : rec.busId) + '</b>'
        + '<input type="hidden" data-field="busId" value="' + esc(rec.busId) + '"'
        + ' data-last="' + (last ? last.km : '') + '"></p>';
    } else {
      body += busPicker(o.buses, o.fills, o.meId);
    }
    var litres = numField(say('ftLitres'), 'litres', 'decimal', say('ftLitresHint'));
    var rupees = numField(say('ftRupees'), 'cost', 'decimal', '');
    if (rec) {
      litres = litres.replace('data-field="litres"', 'data-field="litres" value="' + esc(isNum(rec.litres) ? rec.litres : '') + '"');
      rupees = rupees.replace('data-field="cost"', 'data-field="cost" value="' + esc(isNum(rec.cost) ? rec.cost : '') + '"');
    }
    body += litres + rupees;
    body += odoBlock(hint, brokenNote, rec && isReading(rec.odometer) ? String(rec.odometer) : '');
    if (kind === 'fuel') {
      /* No default selection, and it is required. "Full tank" must not be the
       * default: a part fill recorded as full produces a wrong km/l, the
       * ₹45,000/km bug's sibling. */
      var sel = rec ? (rec.full === true ? 'full' : 'part') : '';
      body += '<label class="num ft-num"><span class="num-l">' + esc(say('ftFillKind')) + '</span>'
        + '<select class="select" data-field="full">'
        + '<option value=""' + (sel === '' ? ' selected' : '') + '>' + esc(say('ftChoose')) + '</option>'
        + '<option value="full"' + (sel === 'full' ? ' selected' : '') + '>' + esc(say('ftFull')) + '</option>'
        + '<option value="part"' + (sel === 'part' ? ' selected' : '') + '>' + esc(say('ftPart')) + '</option>'
        + '</select></label>';
      var pump = textField(say('ftPump'), 'pump'), place = textField(say('ftPlace'), 'place');
      if (rec && rec.pump) pump = pump.replace('data-field="pump"', 'data-field="pump" value="' + esc(rec.pump) + '"');
      if (rec && rec.place) place = place.replace('data-field="place"', 'data-field="place" value="' + esc(rec.place) + '"');
      body += pump + place.replace('data-field="place"', 'data-field="place" maxlength="500"');
    }
    return '<div class="ft-sheet" data-sheet="fill" data-kind="' + kind + '"'
      + (edit ? ' data-edit="' + esc(rec.id) + '" data-store="' + esc(edit.store) + '"' : '') + '>'
      + body + saveBar('ftSaveFill', say('ftSave')) + '</div>';
  }

  function pieceLabel(c) { return (c.label || c.id) + (c.serial ? ' · ' + c.serial : ''); }

  function ageLine(c) {
    return say('ftStateAge', { state: stateWord(c.state), age: agoWords(c.updatedAt) || chrome('timeUnknown') });
  }

  function fitSheet(o) {
    var pieces = [], i;
    for (i = 0; i < o.components.length; i++) {
      var c = o.components[i];
      if (!c || c._deleted || !fittable(c)) continue;
      if (o.pieceId ? c.id !== o.pieceId : c.kind !== o.kind) continue;
      pieces.push(c);
    }
    if (!pieces.length) {
      return '<div class="ft-sheet" data-sheet="fit"><p class="ft-dim">' + draw('clock', 14) + ' '
        + esc(say('ftNoneToFit')) + '</p></div>';
    }
    var opts = '<option value=""' + (pieces.length === 1 && o.pieceId ? '' : ' selected') + '>' + esc(say('ftChoose')) + '</option>';
    for (i = 0; i < pieces.length; i++) {
      opts += '<option value="' + esc(pieces[i].id) + '"' + (pieces.length === 1 && o.pieceId ? ' selected' : '') + '>'
        + esc(pieceLabel(pieces[i])) + '</option>';
    }
    var ages = '';
    if (o.pieceId && pieces.length === 1) ages = '<p class="ft-age">' + esc(ageLine(pieces[0])) + '</p>';
    return '<div class="ft-sheet" data-sheet="fit">' + ages
      + '<label class="num ft-num"><span class="num-l">' + esc(say('ftPiece')) + '</span>'
      + '<select class="select" data-field="pieceId">' + opts + '</select></label>'
      + busPicker(o.buses, o.fills, o.meId)
      + textField(say('ftPosition'), 'position')
      + odoBlock('', '', '')
      + saveBar('ftSaveFit', say('ftActFit')) + '</div>';
  }

  function removeSheet(o) {
    var c = o.piece, bus = c.busId ? o.bmap[c.busId] : null;
    var last = busReading(bus, readingsByBus(o.fills));
    var brokenNote = bus && !asks(bus) ? refusalText(odo().mileage(bus, [])) : '';
    return '<div class="ft-sheet" data-sheet="remove" data-id="' + esc(c.id) + '"'
      + ' data-last="' + (last ? last.km : '') + '">'
      + '<p class="ft-fixed">' + draw(kindMark(c.kind), 20) + ' <b>' + esc(pieceLabel(c)) + '</b></p>'
      + '<p class="ft-age">' + esc(ageLine(c)) + '</p>'
      + odoBlock(hintOf(last), brokenNote, '')
      + saveBar('ftSaveRemove', say('ftActRemove')) + '</div>';
  }

  function sendSheet(o) {
    var c = o.piece;
    return '<div class="ft-sheet" data-sheet="send" data-id="' + esc(c.id) + '">'
      + '<p class="ft-fixed">' + draw(kindMark(c.kind), 20) + ' <b>' + esc(pieceLabel(c)) + '</b></p>'
      + '<p class="ft-age">' + esc(ageLine(c)) + '</p>'
      + textField(say('ftVendor'), 'vendor')
      + numField(say('ftRepairCost'), 'cost', 'decimal', '')
      + textField(say('ftNote'), 'note')
      /* The seam this screen cannot close: the gate pass is `gatepasses`, which
       * only the owner and a supervisor may write (capability outsideJob). So a
       * crew manager or a storekeeper can record that a piece left and cannot
       * make the slip. Say so rather than omit it — hiding it would mean a unit
       * leaves with no paper and nobody told. */
      + (o.gatepass ? '' : '<p class="ft-dim">' + draw('doc', 14) + ' ' + esc(say('ftGateSeam')) + '</p>')
      + saveBar('ftSaveSend', say('ftActSend')) + '</div>';
  }

  /* ====================================================================== *
   * THE WRITES. Each reads what it is about to change from IndexedDB, never
   * from S.cache (screens-assets.md section 1.8 (b)): `buses` is the most
   * clobbered record in the system and a component's `history` is a whole-record
   * array, so two people editing one piece lose each other's entries.
   * ====================================================================== */

  function mayWriteBus(role) { return can(role, BUS_ODO_CAP); }

  /* A fill. -> {ok:true, rec, busWritten} | {ok:false, reason, message}
   *   o {kind, edit?: record, vals: validateFill()'s answer, busId, pump, place, me}
   * One fuel (or def) row. For a diesel fill, and only then, `buses.odometer` and
   * `odometerAt` — and only when the entered reading is higher than the stored
   * one, read from the database immediately before the put. AdBlue is not a
   * mileage basis, so it does not get to move the odometer. */
  async function writeFill(o) {
    var D = db();
    var kind = o.kind === 'def' ? 'def' : 'fuel';
    var v = o.vals;
    var at = nowMs();
    var bus = await D.get('buses', o.busId);
    var odoValue = v.odo;

    if (!o.edit && bus && asks(bus) && odoValue !== null) {
      /* Re-checked against what is stored NOW, not what the sheet saw when it
       * opened: another phone may have logged a fill since. Never a lower
       * number, whatever the form said. */
      var all = await D.all('fuel');
      var last = lastReading(bus, all);
      var low = last ? odo().check(last.km, odoValue, at) : null;
      if (low) return { ok: false, reason: 'lower', message: odoSay('odoLower', low.params) };
    }

    var rec;
    if (o.edit) {
      rec = Object.assign({}, o.edit);
    } else {
      rec = { id: newId(kind === 'def' ? 'def-' : 'f-'), busId: o.busId, at: at, by: o.me && o.me.id ? o.me.id : null };
    }
    rec.litres = v.litres;
    rec.cost = v.cost;
    // 0 is the record's existing way of saying "no reading" (v1 writes it, odo.js
    // reads it as case 1). It is stored here and nowhere is it divided by.
    // Editing a fill whose bus has since been marked broken must not erase the
    // reading it already carries: the field was not offered, so it was not blank.
    if (!(o.edit && v.odoKeep)) rec.odometer = odoValue === null ? 0 : odoValue;
    if (kind === 'fuel') {
      rec.full = v.full === true;
      var pump = String(o.pump == null ? '' : o.pump).replace(/\s+/g, ' ').trim();
      var place = String(o.place == null ? '' : o.place).trim().slice(0, 500);
      if (pump) rec.pump = pump; else if (o.edit) delete rec.pump;
      if (place) rec.place = place; else if (o.edit) delete rec.place;
    }
    await D.put(kind, rec);

    var busWritten = false;
    if (kind === 'fuel' && !o.edit && odoValue !== null && mayWriteBus(o.me && o.me.role)) {
      var fresh = await D.get('buses', o.busId);            // immediately before the put
      if (fresh && asks(fresh) && odoValue > (isReading(fresh.odometer) ? fresh.odometer : 0)) {
        fresh.odometer = odoValue;
        fresh.odometerAt = at;
        await D.put('buses', fresh);
        busWritten = true;
      }
    }
    return { ok: true, rec: rec, busWritten: busWritten };
  }

  /* The component writes. Each re-reads the piece, refuses when its state is no
   * longer one the action applies to, and rewrites exactly the fields the spec
   * lists plus one history entry. A fitting does not write `buses`: a tyre fit
   * must not be a path that clobbers an odometer. */
  async function loadPiece(id, allowed) {
    var c = await db().get('components', id);
    if (!c || allowed.indexOf(c.state) < 0) return null;
    return c;
  }

  async function writeFit(o) {
    var c = await loadPiece(o.pieceId, ['removed', 'refurbished']);
    if (!c) return { ok: false, reason: 'changed', message: say('ftChanged') };
    var at = nowMs();
    var odoValue = o.vals.odo === null ? 0 : o.vals.odo;
    var next = Object.assign({}, c, {
      busId: o.busId, position: o.vals.position, state: 'in-service', installedAt: at, installedOdo: odoValue,
      history: (c.history || []).concat([{ type: 'install', at: at, odo: odoValue, busId: o.busId, position: o.vals.position }])
    });
    await db().put('components', next);
    return { ok: true, rec: next };
  }

  async function writeRemove(o) {
    var c = await loadPiece(o.pieceId, ['in-service']);
    if (!c) return { ok: false, reason: 'changed', message: say('ftChanged') };
    var at = nowMs();
    var odoValue = o.vals.odo === null ? 0 : o.vals.odo;
    var next = Object.assign({}, c, {
      state: 'removed', busId: null,
      history: (c.history || []).concat([{ type: 'remove', at: at, odo: odoValue, busId: c.busId, position: c.position }])
    });
    await db().put('components', next);
    return { ok: true, rec: next };
  }

  async function writeSend(o) {
    var c = await loadPiece(o.pieceId, ['in-service', 'removed']);
    if (!c) return { ok: false, reason: 'changed', message: say('ftChanged') };
    var at = nowMs();
    var next = Object.assign({}, c, {
      state: 'sent-out',
      history: (c.history || []).concat([{ type: 'send-out', at: at, vendor: o.vals.vendor, cost: o.vals.cost,
        billPhoto: '', note: String(o.note == null ? '' : o.note).trim() }])
    });
    await db().put('components', next);
    return { ok: true, rec: next };
  }

  /* ====================================================================== *
   * THE WIRING. Nothing below is reached by render().
   * ====================================================================== */

  var bound = false;
  var watching = false;
  var loading = false;

  function reload() {
    failed = false;
    return loadStores();
  }

  function loadStores() {
    var c = cache();
    if (loading || !c || typeof c.load !== 'function') return null;
    loading = true;
    return c.load(STORES).then(function () {
      loading = false;
      failed = false;
      redraw();
    }, function () {
      loading = false;
      failed = true;
      redraw();
    });
  }

  function redraw() {
    var r = router(), sh = shell();
    var cur = r && r.current ? r.current() : null;
    if (!cur || cur.id !== ID || !sh || typeof sh.mount !== 'function') return;
    sh.mount(ID, cur.params);
  }

  function onRoute(cur) {
    if (!cur || cur.id !== ID) return;
    loadStores();
  }

  function mount() {
    var d = doc();
    if (d && typeof d.addEventListener === 'function' && !bound) {
      bound = true;
      d.addEventListener('click', onClick);
      /* `input` keeps Save and the odometer message honest while a thumb is still
       * on the box; `change` is the belt-and-braces half for a radio or a select.
       * Neither reads [data-act] or [data-nav], so neither can move the route. */
      d.addEventListener('input', onField);
      d.addEventListener('change', onField);
    }
    var rt = router();
    if (!watching && rt && typeof rt.onChange === 'function') {
      watching = true;
      rt.onChange(onRoute);
    }
    loadStores();
    return true;
  }

  function me() {
    var s = state();
    return s && s.user ? s.user : null;
  }

  function dataNow() {
    var s = state();
    return (s && s.cache) || {};
  }

  function onClick(ev) {
    var t = ev && ev.target;
    if (!t || typeof t.closest !== 'function') return;

    /* FIRST, and before anything reads [data-act] or [data-nav]. A count field
     * that navigated away when tapped shipped once (predeploy-gate.sh:508-511).
     * Tapping a litres, rupees or odometer field puts the caret in it and does
     * nothing else; the order of these two lines IS the fix. */
    if (t.closest(FIELDS)) return;

    var el = t.closest('[data-act]');
    if (!el) return;
    var act = el.getAttribute('data-act');
    if (act.indexOf('ft') !== 0) return;               // another screen's control
    if (el.getAttribute('aria-disabled') === 'true') return;
    if (ev.preventDefault) ev.preventDefault();

    if (act === 'ftTab') { tab(el.getAttribute('data-tab')); redraw(); return; }
    if (act === 'ftOpenBus') {
      var r = router();
      if (r && typeof r.go === 'function') r.go('buses', { busId: el.getAttribute('data-bus') });
      return;
    }
    if (act === 'ftLog') return openFill(el.getAttribute('data-kind'), null);
    if (act === 'ftEditFill') return openFill(null, { store: el.getAttribute('data-store'), id: el.getAttribute('data-id') });
    if (act === 'ftFit') return openFit(el.getAttribute('data-kind'), el.getAttribute('data-id'));
    if (act === 'ftRemove') return openRemove(el.getAttribute('data-id'));
    if (act === 'ftSend') return openSend(el.getAttribute('data-id'));
    if (act === 'ftSaveFill') return saveFill(el);
    if (act === 'ftSaveFit') return saveFit(el);
    if (act === 'ftSaveRemove') return saveRemove(el);
    if (act === 'ftSaveSend') return saveSend(el);
  }

  function onField(ev) {
    var t = ev && ev.target;
    if (!t || typeof t.closest !== 'function') return;
    if (t.closest('.ft-find')) { findBus(t); return; }
    if (t.closest('.ft-sheet')) recheck();
  }

  /* Case-insensitive substring; `hidden` rather than a class so a filtered row is
   * out of the accessibility tree as well as off the screen. Never removes the
   * radio that is already chosen. */
  function findBus(input) {
    var sheet = input.closest('.ft-sheet');
    if (!sheet || !sheet.querySelectorAll) return;
    var q = String(input.value == null ? '' : input.value).toLowerCase().trim();
    var rows = sheet.querySelectorAll('.ft-pick'), i;
    for (i = 0; i < rows.length; i++) {
      rows[i].hidden = q ? String(rows[i].textContent || '').toLowerCase().indexOf(q) < 0 : false;
    }
  }

  /* ---- reading a sheet ------------------------------------------------------ */

  function sheetEl() {
    var d = doc();
    return d && d.querySelector ? d.querySelector('.ft-sheet') : null;
  }

  function fieldOf(sheet, name) { return sheet.querySelector('[data-field="' + name + '"]'); }

  function readSheet(sheet) {
    var out = {}, nodes = sheet.querySelectorAll ? sheet.querySelectorAll('[data-field]') : [], i;
    for (i = 0; i < nodes.length; i++) out[nodes[i].getAttribute('data-field')] = nodes[i].value;
    var picked = sheet.querySelector('.ft-bus-r:checked');
    if (picked) {
      out.busId = picked.value;
      out.last = picked.getAttribute('data-last');
      out.hint = picked.getAttribute('data-hint');
      out.broken = picked.getAttribute('data-broken');
    } else if (out.busId !== undefined) {
      var hid = fieldOf(sheet, 'busId');
      out.last = hid ? hid.getAttribute('data-last') : '';
    }
    return out;
  }

  function lastKmOf(text) {
    var n = parseWhole(text);
    return n !== null && isReading(n) ? n : null;
  }

  function setText(el, text) { if (el) el.textContent = text; }

  /* Re-decide the open sheet from what is in it: the odometer hint and error, the
   * broken-instrument swap, and whether Save may be pressed, with the reason in
   * words. A write in flight (data-busy) is left alone. */
  function recheck() {
    var sheet = sheetEl();
    if (!sheet) return;
    var kind = sheet.getAttribute('data-sheet');
    var vals = readSheet(sheet);
    var btn = sheet.querySelector('.ft-save-b'), why = sheet.querySelector('[data-why]');
    var result;
    var brokenNow = !!vals.broken;

    if (kind === 'fill' || kind === 'fit') {
      var block = sheet.querySelector('[data-odo]'), note = sheet.querySelector('[data-broken-note]');
      if (!sheet.getAttribute('data-edit')) {
        if (block) block.hidden = brokenNow;
        if (note) note.hidden = !brokenNow;
        setText(sheet.querySelector('[data-broken-text]'), vals.broken || '');
        setText(sheet.querySelector('[data-odo] [data-hint]'), vals.hint || '');
      } else {
        brokenNow = !!(note && !note.hidden);
      }
    }

    if (kind === 'fill') {
      result = validateFill({
        kind: sheet.getAttribute('data-kind'), busId: vals.busId, litres: vals.litres, cost: vals.cost,
        odometer: vals.odometer, full: vals.full
      }, { lastKm: lastKmOf(vals.last), broken: brokenNow, edit: !!sheet.getAttribute('data-edit') });
    } else if (kind === 'fit') {
      result = validateFit({ pieceId: vals.pieceId, busId: vals.busId, position: vals.position, odometer: vals.odometer },
        { lastKm: lastKmOf(vals.last), broken: brokenNow });
    } else if (kind === 'remove') {
      result = validateRemove({ odometer: vals.odometer }, { lastKm: lastKmOf(sheet.getAttribute('data-last')), broken: brokenNow });
    } else if (kind === 'send') {
      result = validateSend({ vendor: vals.vendor, cost: vals.cost });
    } else return;

    var odoIn = fieldOf(sheet, 'odometer'), err = sheet.querySelector('[data-err]');
    if (odoIn) {
      odoIn.setAttribute('aria-invalid', result.odoError ? 'true' : 'false');
      if (err) { err.hidden = !result.odoError; setText(err, result.odoError || ''); }
    }
    if (!btn || btn.getAttribute('data-busy') === 'yes') return;
    if (result.ok) { btn.removeAttribute('aria-disabled'); setText(why, ''); }
    else { btn.setAttribute('aria-disabled', 'true'); setText(why, result.reason); }
  }

  /* ---- opening ---------------------------------------------------------------- */

  function openSheet(title, html) {
    var V = ov();
    if (!V || typeof V.openSheet !== 'function') return;
    V.openSheet(title, html);
  }

  function openFill(kind, edit) {
    var c = dataNow();
    var buses = live(c.buses || []), fills = live(c.fuel || []);
    if (edit) {
      var rec = null, rows = live(c[edit.store] || []), i;
      for (i = 0; i < rows.length; i++) if (rows[i].id === edit.id) rec = rows[i];
      if (!rec) return;
      var bus = null;
      for (i = 0; i < buses.length; i++) if (buses[i].id === rec.busId) bus = buses[i];
      openSheet(say('ftSheetEdit'), fillSheet({ kind: edit.store === 'def' ? 'def' : 'fuel',
        edit: { rec: rec, store: edit.store, bus: bus }, fills: fills }));
    } else {
      openSheet(say(kind === 'def' ? 'ftLogDef' : 'ftLogDiesel'),
        fillSheet({ kind: kind, buses: buses, fills: fills, meId: me() ? me().id : null }));
    }
    recheck();
  }

  function openFit(kind, pieceId) {
    var c = dataNow();
    var fits = { tyre: 'ftFitTyre', battery: 'ftFitBattery' };
    openSheet(say(fits[kind] || 'ftActFit'), fitSheet({
      kind: kind, pieceId: pieceId || null, components: c.components || [],
      buses: live(c.buses || []), fills: live(c.fuel || []), meId: me() ? me().id : null }));
    recheck();
  }

  function pieceById(id) {
    var rows = live(dataNow().components || []), i;
    for (i = 0; i < rows.length; i++) if (rows[i].id === id) return rows[i];
    return null;
  }

  function openRemove(id) {
    var p = pieceById(id), c = dataNow();
    if (!p) return;
    openSheet(say('ftActRemove'), removeSheet({ piece: p, bmap: busesById(live(c.buses || [])), fills: live(c.fuel || []) }));
    recheck();
  }

  function openSend(id) {
    var p = pieceById(id), u = me();
    if (!p) return;
    openSheet(say('ftActSend'), sendSheet({ piece: p, gatepass: !!(u && can(u.role, 'outsideJob')) }));
    recheck();
  }

  /* ---- saving ----------------------------------------------------------------- */

  /* A write in flight: aria-disabled, and the label says what is happening — the
   * one legitimate use of aria-disabled in this app (foundation section 4 item 4).
   * `data-busy` stops recheck() from re-enabling the button underneath it. */
  function busy(btn, on, label) {
    if (on) {
      btn.setAttribute('aria-disabled', 'true');
      btn.setAttribute('data-busy', 'yes');
      btn.setAttribute('data-label', btn.textContent || '');
      setText(btn, say('ftSaving'));
    } else {
      btn.removeAttribute('data-busy');
      btn.removeAttribute('aria-disabled');
      setText(btn, label);
    }
  }

  function toast(text, kind) {
    var V = ov();
    if (V && typeof V.toast === 'function') V.toast(text, { kind: kind || 'ok' });
  }

  function finished() {
    var V = ov();
    if (V && typeof V.closeSheet === 'function') V.closeSheet();
    var c = cache();
    if (c && typeof c.load === 'function') {
      var p = c.load(STORES);
      if (p && typeof p.then === 'function') p.then(redraw, redraw);
    }
  }

  function offlineNow() {
    var nav = root.navigator;
    return !!(nav && nav.onLine === false);
  }

  async function saveFill(btn) {
    var sheet = sheetEl();
    if (!sheet) return;
    var kind = sheet.getAttribute('data-kind');
    var edit = sheet.getAttribute('data-edit');
    var vals = readSheet(sheet);
    var broken = !!vals.broken || (edit && sheet.querySelector('[data-broken-note]') && !sheet.querySelector('[data-broken-note]').hidden);
    var v = validateFill({ kind: kind, busId: vals.busId, litres: vals.litres, cost: vals.cost,
      odometer: vals.odometer, full: vals.full }, { lastKm: lastKmOf(vals.last), broken: !!broken, edit: !!edit });
    if (!v.ok) { recheck(); return; }
    busy(btn, true);
    var u = me(), res;
    try {
      var existing = null;
      if (edit) {
        existing = await db().get(sheet.getAttribute('data-store'), edit);
        if (!existing) throw new Error('gone');
      }
      res = await writeFill({ kind: kind, edit: existing, vals: v, busId: vals.busId, pump: vals.pump, place: vals.place, me: u });
    } catch (e) {
      busy(btn, false, say('ftSave'));
      toast(say('ftSaveLost'), 'bad');
      return;
    }
    if (!res.ok) {
      busy(btn, false, say('ftSave'));
      toast(res.message, 'bad');
      recheck();
      return;
    }
    toast(u && can(u.role, EDIT_FILL_CAP) ? say('ftSavedManager') : say('ftSavedStaff'));
    if (offlineNow()) toast(say('ftNotSent'), 'warn');
    finished();
  }

  async function saveFit(btn) {
    var sheet = sheetEl();
    if (!sheet) return;
    var vals = readSheet(sheet);
    var v = validateFit({ pieceId: vals.pieceId, busId: vals.busId, position: vals.position, odometer: vals.odometer },
      { lastKm: lastKmOf(vals.last), broken: !!vals.broken });
    if (!v.ok) { recheck(); return; }
    busy(btn, true);
    var res;
    try { res = await writeFit({ pieceId: vals.pieceId, busId: vals.busId, vals: v }); } catch (e) {
      busy(btn, false, say('ftActFit'));
      toast(say('ftSaveLost'), 'bad');
      return;
    }
    if (!res.ok) { busy(btn, false, say('ftActFit')); toast(res.message, 'bad'); finished(); return; }
    toast(say('ftFitDone'));
    if (offlineNow()) toast(say('ftNotSent'), 'warn');
    finished();
  }

  async function saveRemove(btn) {
    var sheet = sheetEl();
    if (!sheet) return;
    var vals = readSheet(sheet);
    var noteEl = sheet.querySelector('[data-broken-note]');
    var v = validateRemove({ odometer: vals.odometer },
      { lastKm: lastKmOf(sheet.getAttribute('data-last')), broken: !!(noteEl && !noteEl.hidden) });
    if (!v.ok) { recheck(); return; }
    busy(btn, true);
    var res;
    try { res = await writeRemove({ pieceId: sheet.getAttribute('data-id'), vals: v }); } catch (e) {
      busy(btn, false, say('ftActRemove'));
      toast(say('ftSaveLost'), 'bad');
      return;
    }
    if (!res.ok) { busy(btn, false, say('ftActRemove')); toast(res.message, 'bad'); finished(); return; }
    toast(say('ftRemoveDone'));
    if (offlineNow()) toast(say('ftNotSent'), 'warn');
    finished();
  }

  /* Sending a unit out of the premises asks first: focus starts on Cancel, so a
   * reflexive Enter says no (V2.confirmDialog). */
  async function saveSend(btn) {
    var sheet = sheetEl();
    if (!sheet) return;
    var vals = readSheet(sheet);
    var v = validateSend({ vendor: vals.vendor, cost: vals.cost });
    if (!v.ok) { recheck(); return; }
    var id = sheet.getAttribute('data-id');
    var p = pieceById(id);
    var V = ov();
    if (V && typeof V.confirmDialog === 'function') {
      var yes = await V.confirmDialog(say('ftSendAsk', { label: p ? pieceLabel(p) : '' }), { yes: say('ftSendYes') });
      if (yes !== true) return;
    }
    busy(btn, true);
    var res;
    try { res = await writeSend({ pieceId: id, vals: v, note: vals.note }); } catch (e) {
      busy(btn, false, say('ftActSend'));
      toast(say('ftSaveLost'), 'bad');
      return;
    }
    if (!res.ok) { busy(btn, false, say('ftActSend')); toast(res.message, 'bad'); finished(); return; }
    toast(say('ftSendDone'));
    if (offlineNow()) toast(say('ftNotSent'), 'warn');
    finished();
  }

  /* ====================================================================== */

  register();

  function stores() { return STORES.slice(); }

  var api = {
    render: render,
    model: model,
    mount: mount,
    stores: stores,
    tab: tab,
    // The decisions, pure, for the tests and for the sheets.
    validateFill: validateFill,
    validateFit: validateFit,
    validateRemove: validateRemove,
    validateSend: validateSend,
    lastReading: lastReading,
    mileageIndex: mileageIndex,
    spansOf: spansOf,
    fallingFlag: fallingFlag,
    fillSheet: fillSheet,
    fitSheet: fitSheet,
    removeSheet: removeSheet,
    sendSheet: sendSheet,
    writeFill: writeFill,
    writeFit: writeFit,
    writeRemove: writeRemove,
    writeSend: writeSend,
    FILLS_CAP: FILLS_CAP,
    PIECES_CAP: PIECES_CAP,
    FALL_RATIO: FALL_RATIO,
    FALL_MIN_SPANS: FALL_MIN_SPANS,
    // Test seam only, the shape of Router._reset: a node suite cannot reload a
    // classic script per case.
    _reset: function () { memo = null; current = 'fills'; failed = false; loading = false; bound = false; watching = false; },
    _recheck: recheck
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.Fuel = api;
    var rt = router();
    if (rt && typeof rt.register === 'function') rt.register(ID, api);
    if (doc()) mount();
  }
})(typeof window !== 'undefined' ? window : this);

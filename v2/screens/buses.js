/* Garage Saathi v2 — screen #5, Buses. Plain script, no module system.
 * Test: test_v2_buses.js. Spec: docs/v2/plan/screens-assets.md §1 (106–512).
 *
 * "What does this bus need, and what has it cost?" Two states of ONE screen:
 * the register (89 one-line rows) and one bus (eleven cards). Not two routes —
 * `icon('back')` returns, keeping the search text.
 *
 * MONEY COMPUTES; BUSES READS. This file contains no cost arithmetic of its
 * own, and that is the single rule it exists to hold. v1 had FIVE per-bus cost
 * bases — busreport (maintenance only), busacct (maintenance + fuel + trip
 * cash), the bus detail's "Lifetime repair cost", money's per-km money pit, and
 * history's spend on completed work — and they disagreed, so people stopped
 * reading all five. `Cost.forBus(busId, days, rows, now)` is the one basis, it
 * is Money's, and the only arrangement in which two screens cannot disagree
 * about one number is that exactly ONE of them does the arithmetic. So this
 * file reads `total`, `parts`, `unknown`, `why`, `from`, `to` and `notIn` and
 * adds, subtracts, multiplies and divides none of them. test_v2_buses.js reads
 * this source with its comments stripped and fails on a money identifier beside
 * an arithmetic operator; and it hands the screen a stubbed Cost whose total is
 * a number no sum of its parts could produce, to prove the figure is read and
 * not recomputed.
 *
 * NO PER-KM FIGURE ON THIS SCREEN AT ALL. Per km needs a divisor this screen
 * cannot trust and it already has two homes — "Running cost per km" on Money
 * (#7) and "Diesel cost per km" on Fuel & tyres (#10). The defect is 8db78e7: a
 * per-km figure divided by a missing odometer read ₹45,000 of work as ₹45,000
 * per kilometre, topped the money-pit list, and sent the owner to inspect a
 * healthy bus. `Odo.mileage` and `Odo.kmOver` are therefore NOT called here:
 * every figure they return is a quotient this screen may not draw, and calling
 * them to discard the answer would be dead code pretending to be a rule. What
 * IS consumed is `Odo.check` (the forward-only entry refusal, in both sheets)
 * and `Odo.mayAsk` (whether a reading may be asked for at all — a broken
 * instrument is a workshop job, and asking is how a wrong number gets typed).
 *
 * THE SEED'S ZEROES ARE REAL. On a fresh device 0 of 89 buses have a document,
 * 0 have an odometer reading above zero, 0 have a last service, and company and
 * model are empty strings on all of them — so this screen draws eight unknown
 * facts per bus for the minutes a first sync takes, which on a Windows 7 office
 * PC is "several times" the 50–90 s a Mac takes. Every one of those eight must
 * read as UNKNOWN, never as zero and never as a problem: `figure(null)` is the
 * em dash, "No odometer reading" is a different sentence from "0 km", and a
 * paper nobody has entered is "Not recorded" rather than an alert nobody can
 * clear. A count that cannot reach zero is 5eb8c6e ("110 of 110 missing
 * documents") and ba274f6 ("67 buses need a driver"), and this screen is where
 * both of those numbers came from.
 *
 * ONE DELEGATED LISTENER, returning early on the field selector BEFORE it reads
 * [data-act] or [data-nav] — the sheets here carry three .num entries (odometer,
 * labour hours, service interval) and a field whose click reached the row
 * handler is what threw the storekeeper off the screen mid-count. The gate
 * checks the ORDERING of those two statements statically, per screen file.
 */
(function (root) {
  'use strict';

  var ID = 'buses';

  /* The field guard's selector, named rather than inlined so the one guard has
   * one spelling. predeploy-gate.sh looks for this exact string in the file and
   * then for the ordering of the two reads in the handler. */
  var FIELDS = 'input, select, textarea, label, .num';

  /* The cost window. 30 days, matching the owner's own 30-day number on Today
   * (#1) and 000c3dd — not a lifetime, which grows for ever and makes a new bus
   * look cheap and an old one look like a problem. Handed to Cost.forBus; this
   * file never divides by it. */
  var COST_DAYS = 30;

  var PAPER_SOON_DAYS = 30;            // a paper inside this is "expiring"
  var SERVICE_WARN_KM = 1000;          // closer than this and the due figure warns
  var HISTORY_CAP = 50;                // §1.4 card 11, with a remainder line
  var DAY = 86400000;

  /* The five papers, always drawn, in this order — as LABEL IDS, because the
   * words a reader sees are w()'s and never this file's. Five FIXED rows and
   * not a list of what exists, because 0 of 89 seeded buses have any document
   * and a card driven by expiry alone draws nothing for every bus on a fresh
   * device — a missing paper has to be visible as missing. */
  var PAPERS = ['bsPaperIns', 'bsPaperFit', 'bsPaperPuc', 'bsPaperPermit', 'bsPaperTax'];

  /* Three FIXED seats, because a bus that has lost a seat must show the hole.
   * Filling one is Duty board's (#9) — one write path for a seat is already one
   * too few than v1's three (01 §5.2). */
  var SEATS = [['driver', 1, 'bsSeatD1'], ['driver', 2, 'bsSeatD2'], ['conductor', null, 'bsSeatCon']];

  /* Mirrors v2/sync.js:108, which does not export it. It is DATA — the three
   * roles the server sends unredacted copies to — and it is deliberately not
   * the whole test: §1.9. A supervisor's own device can hold a redacted copy of
   * a crew row pulled before a scope change, so the per-RECORD `_redacted` flag
   * is the test that survives the cursor rewind, and the role is only the first
   * half of it. */
  var PII_ROLES = ['owner', 'supervisor', 'crewmanager'];

  var SORTS = ['reg', 'cost', 'service'];

  /* ====================================================================== *
   * WORDS — §1.11, every fixed word this screen draws. `hi` is left empty on
   * purpose: a missing Hindi value is a build error and not an English
   * fallback, and a builder guessing Hindi for a word somebody acts on is how
   * "Not sent yet" becomes a sentence nobody can parse. The owner is the only
   * Hindi speaker on this project and these are on his list.
   * ====================================================================== */

  var WORDS = {
    bsCountNone:    { en: 'No buses', hi: '' },
    bsCount:        { en: { one: '1 bus', other: '{n} buses' }, hi: { one: '', other: '' } },
    bsSearch:       { en: 'Search a bus', hi: '' },
    bsAdd:          { en: 'Add bus', hi: '' },
    bsSort:         { en: 'Sort', hi: '' },
    bsSortReg:      { en: 'Registration', hi: '' },
    bsSortCost:     { en: 'Running cost, high first', hi: '' },
    bsSortService:  { en: 'Service due soonest', hi: '' },
    bsSortUnranked: { en: 'No figure yet — listed after the ranked buses', hi: '' },
    bsBack:         { en: 'Buses', hi: '' },

    bsCardBus:      { en: 'The bus', hi: '' },
    bsCardNeeds:    { en: 'What this bus needs', hi: '' },
    bsCardPapers:   { en: 'Papers', hi: '' },
    bsCardService:  { en: 'Service', hi: '' },
    bsCardCost:     { en: 'Running cost, last 30 days', hi: '' },
    bsCardChallans: { en: 'Challans', hi: '' },
    bsCardFitted:   { en: 'Tyres and batteries fitted', hi: '' },
    bsCardCrew:     { en: 'Crew', hi: '' },
    bsCardSeen:     { en: 'Last seen', hi: '' },
    bsCardReports:  { en: 'Driver reports', hi: '' },
    bsCardHistory:  { en: 'Repair history', hi: '' },

    bsNotRecorded:  { en: 'Not recorded', hi: '' },
    bsOdoLabel:     { en: 'Odometer', hi: '' },
    bsCompany:      { en: 'Company', hi: '' },
    bsModel:        { en: 'Model', hi: '' },
    bsChassis:      { en: 'Chassis', hi: '' },
    bsEngine:       { en: 'Engine', hi: '' },

    bsPaperIns:     { en: 'Insurance', hi: '' },
    bsPaperFit:     { en: 'Fitness', hi: '' },
    bsPaperPuc:     { en: 'PUC', hi: '' },
    bsPaperPermit:  { en: 'Permit', hi: '' },
    bsPaperTax:     { en: 'Road tax', hi: '' },
    bsPaperNoNum:   { en: 'Number not recorded', hi: '' },
    bsPaperNone:    { en: 'No papers recorded for this bus.', hi: '' },
    bsPaperExpOn:   { en: 'Expires {date}', hi: '' },
    bsPaperExpIn:   { en: 'Expires in {count} days', hi: '' },
    bsPaperExpired: { en: 'Expired {date}', hi: '' },
    bsPaperNoExp:   { en: 'Expiry not recorded', hi: '' },
    bsSubNoPapers:  { en: 'No papers recorded', hi: '' },
    bsSubExpired:   { en: '{paper} expired', hi: '' },
    bsSubExpiring:  { en: '{paper} expires in {count} days', hi: '' },
    bsSubOverdue:   { en: 'Service overdue', hi: '' },
    bsSubChallan:   { en: '{count} unpaid challans', hi: '' },
    bsSubUnsafe:    { en: 'Driver reported it unsafe', hi: '' },
    bsSubJobs:      { en: { one: '1 open job', other: '{n} open jobs' }, hi: { one: '', other: '' } },
    bsSubNothing:   { en: 'Nothing open', hi: '' },

    bsInterval:     { en: 'Service interval', hi: '' },
    bsLastService:  { en: 'Last service', hi: '' },
    bsServiceDue:   { en: '{km} km to the next service', hi: '' },
    bsServiceOver:  { en: 'Overdue by {km} km', hi: '' },
    bsServiceDate:  { en: 'Last serviced {date}, {ago}', hi: '' },
    bsServiceNone:  { en: 'No service recorded. Log one to start the count.', hi: '' },
    bsServiceNil:   { en: 'No odometer reading and no service recorded.', hi: '' },
    bsServiceAddOdo:{ en: 'Add a reading', hi: '' },
    bsLogService:   { en: 'Log service', hi: '' },

    bsCostMissing:  { en: 'Part of this is missing', hi: '' },
    bsCostNotIn:    { en: 'Not counted here: supplier bills, challans, audit shrinkage.', hi: '' },
    bsCostNoFills:  { en: 'No fills recorded', hi: '' },
    bsCostNoParts:  { en: 'No parts issued', hi: '' },
    bsCostNoLabour: { en: 'No labour hours recorded', hi: '' },
    bsCostNoOutside:{ en: 'Nothing sent outside', hi: '' },
    bsCostNoTrips:  { en: 'No trips recorded', hi: '' },
    bsCostNoMisc:   { en: 'Nothing else recorded', hi: '' },
    bsCostUnread:   { en: 'Could not be read', hi: '' },
    bsCostMismatch: { en: 'The parts do not add up to the total', hi: '' },

    bsChallanPend:  { en: 'Pending challans', hi: '' },
    bsChallanPay:   { en: 'Pending payable', hi: '' },
    bsChallanZero:  { en: 'No pending challans, checked {ago}', hi: '' },
    bsChallanNever: { en: 'Never checked', hi: '' },
    bsChallanDown:  { en: 'Could not reach the challan service. Last checked {ago}.', hi: '' },
    bsChallanLeft:  { en: '{count} checks left this month', hi: '' },
    bsChallanWhen:  { en: 'Checked {ago}', hi: '' },
    bsChallanOff:   { en: 'Needs signal. Check when you are online.', hi: '' },
    bsCheckChallans:{ en: 'Check challans (uses 1 credit)', hi: '' },
    bsChecking:     { en: 'Checking...', hi: '' },
    bsChallanAsk:   { en: 'This check uses one paid credit. Check now?', hi: '' },

    bsFittedNone:   { en: 'No tyres or batteries recorded on this bus', hi: '' },
    bsNoPosition:   { en: 'Position not recorded', hi: '' },

    bsSeatD1:       { en: 'Driver 1', hi: '' },
    bsSeatD2:       { en: 'Driver 2', hi: '' },
    bsSeatCon:      { en: 'Conductor', hi: '' },
    bsSeatEmpty:    { en: 'Empty', hi: '' },
    bsSeatSince:    { en: 'Since {date}', hi: '' },
    bsSeatSinceNil: { en: 'Since when: not recorded', hi: '' },
    bsNoPhone:      { en: 'No phone recorded', hi: '' },
    bsToDuty:       { en: 'Duty board', hi: '' },

    bsSeenNone:     { en: 'No position recorded for this bus', hi: '' },
    bsSeenNoMatch:  { en: 'This bus is not matched to a tracker', hi: '' },
    bsSeenAt:       { en: 'Last seen {ago}', hi: '' },
    bsLinkGps:      { en: 'Link GPS', hi: '' },
    bsGpsReg:       { en: 'Registration as the tracker reports it', hi: '' },

    bsReportsNone:  { en: 'No open reports for this bus', hi: '' },
    bsMakeJob:      { en: 'Make a job', hi: '' },
    bsDrafted:      { en: 'A job was drafted for this. Open it.', hi: '' },
    bsHistoryNone:  { en: 'No work recorded on this bus', hi: '' },
    bsWaitingSign:  { en: 'Waiting for sign-off', hi: '' },
    bsServiceTag:   { en: 'Service', hi: '' },
    bsHistoryMore:  { en: '{shown} of {total} shown, newest first.', hi: '' },

    bsNeedPapers:   { en: 'Finish this bus — add its papers', hi: '' },
    bsNeedPapersWhy:{ en: 'No paper has a number or an expiry yet', hi: '' },
    bsNeedLinkGps:  { en: 'This bus is not matched to a tracker', hi: '' },
    bsNeedLinkWhy:  { en: 'No position record carries this registration', hi: '' },
    bsNeedService:  { en: 'Finish the service card', hi: '' },
    bsNeedServiceWhy:{ en: 'A closed card is not accepted without a photo or the bill', hi: '' },
    bsNeedsNone:    { en: 'Nothing needs this bus', hi: '' },
    bsNeedsNoneHint:{ en: 'Papers, service and challans all checked.', hi: '' },
    bsNeedsUnranked:{ en: 'Could not check', hi: '' },

    bsEmptyReg:     { en: 'No buses yet', hi: '' },
    bsEmptyRegHint: { en: 'Add the first bus to start.', hi: '' },
    bsErrReg:       { en: 'Could not read the bus list', hi: '' },
    bsErrBus:       { en: 'Could not read this bus', hi: '' },
    bsNoMatch:      { en: 'No bus matches that', hi: '' },
    bsDueLabel:     { en: 'Next service', hi: '' },
    bsOffHead:      { en: 'No connection. Last updated {time}.', hi: '' },

    bsSheetAdd:     { en: 'Add bus', hi: '' },
    bsFieldReg:     { en: 'Registration', hi: '' },
    bsFieldInterval:{ en: 'Service interval, km', hi: '' },
    bsHintInterval: { en: 'Usually 10,000 km', hi: '' },
    bsDuplicate:    { en: '{reg} is already on the register', hi: '' },
    bsSheetService: { en: 'Log service', hi: '' },
    bsFieldDate:    { en: 'Date', hi: '' },
    bsFieldOdo:     { en: 'Odometer reading', hi: '' },
    bsFieldDone:    { en: 'What was done', hi: '' },
    bsFieldHours:   { en: 'Labour hours', hi: '' },
    bsFieldParts:   { en: 'Parts used', hi: '' },
    bsFieldVendor:  { en: 'Outside vendor', hi: '' },
    bsPhotoNeeded:  { en: 'A photo or the bill is needed. A closed card is not accepted without one.', hi: '' },
    bsAddPhoto:     { en: 'Add a photo', hi: '' },
    bsSheetJob:     { en: 'Make a job', hi: '' },
    bsFieldProblem: { en: 'What is wrong?', hi: '' },
    bsSheetGps:     { en: 'Link GPS', hi: '' },
    bsSave:         { en: 'Save', hi: '' },
    bsSaving:       { en: 'Saving...', hi: '' },
    bsSaveFailed:   { en: 'Could not save. The bus is kept on this phone. It will send when there is signal.', hi: '' }
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

  function say(id, vals, n) {
    register();
    var s;
    if (registered && typeof root.w === 'function') s = root.w(id, n);
    else {
      var e = WORDS[id].en;
      s = typeof e === 'string' ? e : (n === 1 ? e.one : e.other);
      if (n !== undefined && n !== null) s = String(s).replace(/\{n\}/g, String(n));
    }
    return vals ? put(s, vals) : s;
  }

  /* ====================================================================== *
   * the small helpers every card uses
   * ====================================================================== */

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function draw(name, size) { return typeof root.icon === 'function' ? root.icon(name, { size: size }) : ''; }
  function fig(v, o) { return typeof root.figure === 'function' ? root.figure(v, o) : ''; }
  function money(v) { return (root.fmt && root.fmt.rupees) ? root.fmt.rupees(v) : String(v); }
  function group(v) { return (root.fmt && root.fmt.groupIndian) ? root.fmt.groupIndian(v) : String(v); }
  function can(role, cap) { return !!(root.Caps && root.Caps.can && root.Caps.can(role, cap)); }

  function rowsOf(m, name) {
    var a = m && m.cache && m.cache[name];
    return (a && typeof a.length === 'number') ? a : [];
  }
  function live(list) {
    var out = [], i;
    for (i = 0; i < list.length; i++) if (list[i] && !list[i]._deleted) out.push(list[i]);
    return out;
  }
  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i] && String(list[i].id) === String(id)) return list[i];
    return null;
  }
  function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }

  /* THE ODOMETER PREDICATE, and it is the reason this screen is careful twice.
   * `buses.odometer` is 0 for all 89 seeded buses, AND 0 is the true stored
   * value when the instrument is broken (`odoBroken`, `odoBrokenAt` exist for
   * that). So zero can never mean zero kilometres here: a reading is a finite
   * number ABOVE zero and everything else is no reading at all. v2/odo.js makes
   * exactly this judgement and does not export it, so the shape is mirrored
   * rather than invented — and `figure(0)` draws "0", which is the whole bug. */
  function reading(v) { return (typeof v === 'number' && isFinite(v) && v > 0) ? v : null; }

  function text(v) {
    var s = v == null ? '' : String(v).trim();
    return s === '' ? null : s;
  }

  /* A date that may be milliseconds OR 'YYYY-MM-DD': the v2 seed writes one and
   * seed-docs.js writes the other, and a paper row that silently dropped one of
   * the two would read "Not recorded" for a paper that is on file. */
  function whenMs(v) {
    if (typeof v === 'number' && isFinite(v)) return v;
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) {
      var t = Date.parse(v.slice(0, 10) + 'T00:00:00Z');
      return isFinite(t) ? t : null;
    }
    return null;
  }

  function dateName(ms) {
    var t = whenMs(ms);
    if (t === null) return null;
    return new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  function dayName(ms) {
    var t = whenMs(ms);
    if (t === null) return null;
    return new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }
  function hhmm(ms) {
    var t = num(ms);
    if (t === null) return '';
    var d = new Date(t), h = d.getHours(), mi = d.getMinutes();
    return (h < 10 ? '0' : '') + h + ':' + (mi < 10 ? '0' : '') + mi;
  }
  /* How long ago, through the chrome's own word table so the three sentences
   * that carry an age read the same as every other age in the app. */
  function ago(ms, now) {
    var t = whenMs(ms);
    if (t === null || typeof root.w !== 'function') return null;
    var mins = Math.floor((now - t) / 60000);
    if (mins < 1) return root.w('justNow');
    if (mins < 60) return root.w('minutesAgo', mins);
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return root.w('hoursAgo', hrs);
    return root.w('daysAgo', Math.floor(hrs / 24));
  }
  function daysUntil(ms, now) {
    var t = whenMs(ms);
    return t === null ? null : Math.ceil((t - now) / DAY);
  }

  /* The same registration normalisation app.js uses, because `challans` is
   * keyed by it and `gpsevents.reg` is a display plate: without one rule for
   * all three a snapshot and the bus it is about never meet. Normalising the
   * SNAPSHOT'S OWN KEY is also what reconciles the older unpadded spelling
   * (`03 §3.9`) — a card that read only the padded key says "Never checked" for
   * a bus that has a snapshot. */
  function normReg(s) {
    var n = String(s == null ? '' : s).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    var m = /^([A-Z]{2})(\d{1,2})([A-Z]{1,3})(\d{1,4})$/.exec(n);
    return m ? m[1] + pad(m[2], 2) + m[3] + pad(m[4], 4) : n;
  }
  function pad(s, n) { var out = String(s); while (out.length < n) out = '0' + out; return out; }

  function lastSyncAt() {
    var s = root.Sync;
    if (!s || typeof s.info !== 'function') return null;
    try { var i = s.info(); return i && i.lastSyncAt ? i.lastSyncAt : null; } catch (e) { return null; }
  }

  /* ====================================================================== *
   * THE PAPERS, THE SERVICE AND THE CHALLANS — read once per bus, because
   * three different places ask the same questions (the register's one-urgent-
   * thing line, card 2's rows, and cards 3, 4 and 6 themselves).
   * ====================================================================== */

  /* Five fixed rows. A paper with a number and no expiry is NOT valid — it is
   * "Expiry not recorded" and it warns, because a half-entered paper that read
   * as fine is a bus that goes out on an expired cover. */
  /* `docs[].type` as the RECORD spells it, mapped to this screen's label id.
   * A switch on the stored value rather than a table of English strings beside
   * the ids: these five are enum values out of `03 §3.2`, not words anybody
   * reads, and test_v2_words.js's literal scan is right to insist on the
   * difference — a capitalised English word in a file that draws is a word
   * nobody can translate. */
  function paperId(type) {
    switch (String(type)) {
      case 'Insurance': return 'bsPaperIns';
      case 'Fitness': return 'bsPaperFit';
      case 'PUC': return 'bsPaperPuc';
      case 'Permit': return 'bsPaperPermit';
      case 'Road tax': return 'bsPaperTax';
      default: return null;
    }
  }

  function papersOf(bus, now) {
    var docs = (bus && bus.docs && typeof bus.docs.length === 'number') ? bus.docs : [];
    var out = [], i, j;
    for (i = 0; i < PAPERS.length; i++) {
      var word = PAPERS[i], found = null;
      for (j = 0; j < docs.length; j++) {
        if (docs[j] && paperId(docs[j].type) === word) { found = docs[j]; break; }
      }
      var number = found ? text(found.number) : null;
      var exp = found ? whenMs(found.expiry) : null;
      var state = 'none', days = null;
      if (found && exp !== null) {
        days = daysUntil(exp, now);
        state = days < 0 ? 'expired' : (days <= PAPER_SOON_DAYS ? 'soon' : 'valid');
      } else if (found && number !== null) {
        state = 'noexpiry';
      }
      out.push({ word: word, number: number, expiry: exp, days: days,
                 state: state, photo: (found && text(found.photo)) || null });
    }
    return out;
  }
  function anyPaper(papers) {
    for (var i = 0; i < papers.length; i++) if (papers[i].state !== 'none') return true;
    return false;
  }

  /* §1.3's SERVICE DUE — five states, never a sixth. If this rule were skipped
   * every bus on a fresh device would read "Overdue by 48,210 km": 89 rows of
   * red that cannot reach zero, which is 5eb8c6e rebuilt. The km arithmetic
   * below is a DISTANCE, not a quotient and not money — nothing here divides,
   * and nothing here touches a rupee. */
  function serviceOf(bus, now) {
    if (bus && bus.odoBroken === true) {
      var o = root.Odo;
      var when = dayName(bus.odoBrokenAt);
      // Odo owns the sentence AND the decision not to ask: its `next` is null
      // for a broken instrument, because asking is how a wrong number gets
      // typed and the fix is a workshop job.
      var msg = (o && o.COPY && o.COPY.odoBroken)
        ? (when ? put(o.COPY.odoBroken.en, { date: when }) : o.COPY.odoBrokenUndated.en)
        : '';
      return { state: 'broken', km: null, words: msg, tone: 'dim',
               next: (o && typeof o.mayAsk === 'function' && o.mayAsk(bus)) ? say('bsServiceAddOdo') : null };
    }
    var odo = reading(bus && bus.odometer);
    var lastOdo = reading(bus && bus.lastServiceOdo);
    var lastDate = whenMs(bus && bus.lastServiceDate);
    var interval = reading(bus && bus.serviceIntervalKm);

    if (odo !== null && lastOdo !== null && interval !== null) {
      var left = lastOdo + interval - odo;
      if (left < 0) {
        return { state: 'overdue', km: -left, words: say('bsServiceOver', { km: group(-left) }),
                 tone: 'bad', next: null };
      }
      return { state: 'due', km: left, words: say('bsServiceDue', { km: group(left) }),
               tone: left < SERVICE_WARN_KM ? 'warn' : 'dim', next: null };
    }
    if (odo !== null && lastOdo === null) {
      return { state: 'noservice', km: null, words: say('bsServiceNone'), tone: 'dim', next: null };
    }
    // Odometer absent or zero, and a date on file: FALL BACK TO THE DATE, never
    // to km. There is no km basis, so there is no km figure.
    if (lastDate !== null) {
      return { state: 'bydate', km: null, tone: 'dim', next: null,
               words: say('bsServiceDate', { date: dateName(lastDate), ago: ago(lastDate, now) || '' }) };
    }
    return { state: 'nothing', km: null, words: say('bsServiceNil'), tone: 'dim',
             next: say('bsServiceAddOdo') };
  }

  /* The snapshot for one bus, through the normalised key so both spellings of
   * the `rc` are found. Three different empty states, never one: a real zero, a
   * never-checked dash, and the provider being down. */
  function challanOf(bus, snaps) {
    var key = normReg(bus && bus.regNo), i;
    for (i = 0; i < snaps.length; i++) {
      if (normReg(snaps[i].rc) === key) return snaps[i];
    }
    return null;
  }

  function openJobsOf(cards, busId) {
    var n = 0, i;
    for (i = 0; i < cards.length; i++) {
      var c = cards[i];
      if (String(c.busId) !== String(busId)) continue;
      if (c.status === 'done' || c.status === 'verified' || c.status === 'cancelled') continue;
      n++;
    }
    return n;
  }
  function openReportsOf(reports, busId) {
    var out = [], i;
    for (i = 0; i < reports.length; i++) {
      if (String(reports[i].busId) === String(busId) && reports[i].status === 'open') out.push(reports[i]);
    }
    return out;
  }

  /* ====================================================================== *
   * THE REGISTER
   * ====================================================================== */

  var search = '';                     // local, never a route: back must leave the screen
  var sort = 'reg';

  function setSearch(s) { search = s == null ? '' : String(s); return search; }
  function setSort(s) { if (SORTS.indexOf(String(s)) >= 0) sort = String(s); return sort; }

  /* The ONE most urgent thing about a bus, in a fixed precedence — and when
   * nothing at all is recorded, "No papers recorded", which is the truth on a
   * fresh device rather than a blank line. `company`/`model` are empty strings
   * on all 89 seeded buses, so they are NOT the second line; they are inside
   * the detail. */
  function subOf(bus, ctx) {
    var papers = papersOf(bus, ctx.now), i, p;
    for (i = 0; i < papers.length; i++) {
      p = papers[i];
      if (p.state === 'expired') return say('bsSubExpired', { paper: say(p.word) });
    }
    for (i = 0; i < papers.length; i++) {
      p = papers[i];
      if (p.state === 'soon') return say('bsSubExpiring', { paper: say(p.word), count: p.days });
    }
    if (serviceOf(bus, ctx.now).state === 'overdue') return say('bsSubOverdue');
    var snap = challanOf(bus, ctx.snaps);
    var pending = snap ? num(snap.pendingCount) : null;
    if (pending !== null && pending > 0 && ctx.mayChallans) return say('bsSubChallan', { count: pending });
    var reports = openReportsOf(ctx.reports, bus.id);
    for (i = 0; i < reports.length; i++) {
      var ai = byId(ctx.reportai, 'ra-' + reports[i].id);
      if (reports[i].unsafe === true || (ai && ai.unsafe === true)) return say('bsSubUnsafe');
    }
    var jobs = openJobsOf(ctx.cards, bus.id);
    if (jobs > 0) return say('bsSubJobs', null, jobs);
    return anyPaper(papers) ? say('bsSubNothing') : say('bsSubNoPapers');
  }

  function matchesSearch(bus, q) {
    if (q === '') return true;
    var hay = String(bus.regNo || '') + ' ' + String(bus.company || '') + ' ' + String(bus.model || '');
    return hay.toUpperCase().indexOf(q.toUpperCase()) >= 0
      || normReg(bus.regNo).indexOf(normReg(q)) >= 0;
  }

  function byReg(a, b) { return String(a.reg).localeCompare(String(b.reg)); }

  /* AN UNUSABLE FIGURE LEAVES A RANKING IN BOTH DIRECTIONS. A bus whose running
   * cost or whose service-due km cannot be read is not sorted at all — not at
   * the top (8db78e7) and not at the bottom, which is the same bug facing the
   * other way: a bus with no figure sorting as the cheapest in the fleet is a
   * bus nobody looks at. It is listed after the ranked ones, under a line that
   * says why, in registration order. */
  function ordered(rows) {
    var ranked = [], unranked = [], i;
    if (sort === 'reg') return { rows: rows.slice().sort(byReg), unranked: [] };
    for (i = 0; i < rows.length; i++) {
      (num(rows[i].rank) === null ? unranked : ranked).push(rows[i]);
    }
    if (sort === 'cost') {
      ranked.sort(function (a, b) { return b.rank - a.rank || byReg(a, b); });
    } else {
      ranked.sort(function (a, b) { return a.rank - b.rank || byReg(a, b); });
    }
    return { rows: ranked, unranked: unranked.sort(byReg) };
  }

  /* THE TOTAL IS NOT COMPUTED HERE, and the sort does not compute it either: it
   * asks Cost once per bus and keys on what came back. A comparator that called
   * forBus would call it O(n log n) times for one answer.
   *
   * REV-FLOOR finding 2, measured: on the fleet fixture (83,884 rows, 89 buses)
   * sorting by running cost took 80-95 ms against 15 ms for registration, of
   * which 60 ms was 89 `Cost.forBus` calls walking the money stores end to end
   * — and `boot.js` re-mounts on every sync status change, so a 4 s poller
   * re-paid it every 4 s for as long as the owner left that sort on. Estimated
   * 320-480 ms per tick on a Core 2 Duo, against a 250 ms screen budget.
   *
   * TWO CHANGES, and the review named both:
   *
   * 1. MEMOISED on the data it reads. `Cache.sigOf` over the seven stores
   *    `costRows` hands to Cost is the key, and it is the right one for the
   *    reason `cache.js` gives: a signature moves whenever a record is added,
   *    removed or written, because every write in this app stamps `updatedAt`.
   *    `cost.js` needs nothing.
   *
   * 2. `now` is QUANTISED into the key rather than left out of it. The review
   *    says a memo "would not help: `now = Date.now()` is a fresh argument each
   *    time", and that is true of a memo keyed on data alone — so the window
   *    end is rounded down to the minute and the ROUNDED value is what Cost is
   *    given. The figure is then exact for the instant it claims, rather than
   *    approximately right for now: a 30-day window ending at most 60 s ago,
   *    recomputed when the minute turns or when a row changes. Not a day key —
   *    a fill entered at 20:01 must show up before midnight.
   *
   * The memo is one object and one map, replaced wholesale: a stale entry
   * cannot outlive its key, which is the shape `attention.js` uses for its
   * index and `me.js` for its usage table. */
  var COST_BUCKET_MS = 60000;
  var costMemo = { key: null, by: null };

  function costKey(m, bucket) {
    var c = root.Cache;
    var sig = (c && typeof c.sigOf === 'function') ? c.sigOf.apply(c, COST_STORES) : null;
    // No Cache (a node suite with none, or a load-order fault): no memo rather
    // than a memo keyed on nothing, which would freeze the first answer for
    // ever. `null` never equals `null` through the `key === null` test below.
    if (sig === null) return null;
    return sig + '|' + COST_DAYS + '|' + bucket;
  }

  /* `buses` here is the list AFTER the search filter, which is the review's
   * second half: `costTotals` ran over all 89 before the filter, so narrowing
   * to one registration still cost 89 full passes over the money stores. */
  function costTotals(buses, m, now) {
    var C = root.Cost, i;
    if (!C || typeof C.forBus !== 'function') return {};
    /* `now - now % BUCKET` rather than `Math.floor(now / BUCKET) * BUCKET`, and
     * not as a flourish: this file may contain no divisor it did not write
     * itself, because a quotient over a figure off a record is 8db78e7 — and
     * `test_v2_buses.js` A6 names every `/` in the source to keep it that way.
     * The remainder is the same arithmetic with nothing to argue about. */
    var bucket = now - (now % COST_BUCKET_MS);
    var key = costKey(m, bucket);
    var by = (key !== null && costMemo.key === key && costMemo.by) ? costMemo.by : {};
    var rows = null;
    for (i = 0; i < buses.length; i++) {
      var id = buses[i].id;
      if (has(by, id)) continue;                  // this key already answered it
      if (rows === null) rows = costRows(m);      // built once, and only if asked
      try {
        var r = C.forBus(id, COST_DAYS, rows, bucket);
        by[id] = (typeof C.reconciles === 'function' && !C.reconciles(r)) ? null : r.total;
      } catch (e) { by[id] = null; }
    }
    if (key !== null) { costMemo.key = key; costMemo.by = by; }
    return by;
  }

  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  /* The seven stores Cost reads, in ONE place, because `costRows` hands them
   * over and `costKey` takes their signature: two lists would be a memo keyed
   * on six stores while the answer depends on seven, which is a figure that
   * stops moving when one of them changes. */
  var COST_STORES = ['fuel', 'def', 'jobcards', 'ledger', 'trips', 'incidents', 'components'];

  /* Everything Cost.forBus reads, handed over whole. A store this device has
   * not read yet is left OUT rather than passed as an empty array: Cost treats
   * an absent store as "could not be read" and withholds the part, and passing
   * `[]` would tell it there are no fills when nobody has looked. */
  function costRows(m) {
    var names = COST_STORES;
    var out = {}, i;
    for (i = 0; i < names.length; i++) {
      var a = m && m.cache && m.cache[names[i]];
      if (a && typeof a.length === 'number') out[names[i]] = a;
    }
    var meta = rowsOf(m, 'meta');
    for (i = 0; i < meta.length; i++) if (meta[i] && meta[i].key === 'garage') out.garage = meta[i];
    return out;
  }

  function registerModel(m) {
    register();
    var role = (m && m.user && String(m.user.role)) || (m && m.role) || null;
    var loading = !(m && m.cache) || m.cache.buses === undefined;
    var now = Date.now();
    var buses = loading ? [] : live(rowsOf(m, 'buses'));
    var ctx = {
      now: now,
      snaps: live(rowsOf(m, 'challans')),
      cards: live(rowsOf(m, 'jobcards')),
      reports: live(rowsOf(m, 'driverreports')),
      reportai: live(rowsOf(m, 'reportai')),
      mayChallans: can(role, 'challans')
    };
    /* THE SEARCH FILTER FIRST, then the totals for what survived it. The other
     * way round — which is how this read until REV-FLOOR measured it — made
     * narrowing to one registration cost 89 full passes over the money stores,
     * because `costTotals` was handed the whole fleet before anything was
     * filtered out. */
    var shown = [], i;
    for (i = 0; i < buses.length; i++) if (matchesSearch(buses[i], search)) shown.push(buses[i]);
    var totals = sort === 'cost' ? costTotals(shown, m, now) : {};
    var rows = [];
    for (i = 0; i < shown.length; i++) {
      var b = shown[i];
      var srv = sort === 'service' ? serviceOf(b, now) : null;
      rows.push({
        id: b.id, reg: String(b.regNo || b.id), sub: subOf(b, ctx),
        odo: reading(b.odometer),
        badge: badgeOf(b, ctx),
        // The rank for the chosen order, and null when this bus has no figure.
        rank: sort === 'cost' ? (totals[b.id] == null ? null : totals[b.id])
          : (sort === 'service' ? (srv && (srv.state === 'due' || srv.state === 'overdue')
            ? (srv.state === 'overdue' ? -srv.km : srv.km) : null) : null)
      });
    }
    var o = ordered(rows);
    return {
      loading: loading, role: role, density: (m && m.density) || 'yard',
      offline: !!(m && m.offline), stale: !!(m && m.stale), at: lastSyncAt(),
      total: buses.length, rows: o.rows, unranked: o.unranked,
      search: search, sort: sort,
      hasAny: buses.length > 0,
      mayAdd: can(role, 'addBus'),
      maySort: buses.length > 1
    };
  }

  /* `.act` at yard holds AT MOST ONE control: a badge carrying a word, or
   * nothing. Status is never colour alone, so the badge always says a word and
   * carries a mark. */
  function badgeOf(bus, ctx) {
    var papers = papersOf(bus, ctx.now), i;
    for (i = 0; i < papers.length; i++) {
      if (papers[i].state === 'expired') return { tone: 'bad', mark: 'warn', word: say(papers[i].word) };
    }
    if (serviceOf(bus, ctx.now).state === 'overdue') return { tone: 'bad', mark: 'warn', word: say('bsCardService') };
    for (i = 0; i < papers.length; i++) {
      if (papers[i].state === 'soon') return { tone: 'warn', mark: 'clock', word: say(papers[i].word) };
    }
    return null;
  }

  /* ====================================================================== *
   * ONE BUS — eleven cards, and the ORDER IS THE ARGUMENT: what it needs, then
   * what it is, then what it cost, then what is fitted to it, then who is on
   * it, then what has happened to it.
   * ====================================================================== */

  function busModel(m, id) {
    register();
    var role = (m && m.user && String(m.user.role)) || (m && m.role) || null;
    var loading = !(m && m.cache) || m.cache.buses === undefined;
    var now = Date.now();
    var bus = loading ? null : byId(live(rowsOf(m, 'buses')), id);
    if (!loading && !bus) return { loading: false, missing: true, role: role };

    var ctx = {
      now: now,
      snaps: live(rowsOf(m, 'challans')),
      cards: live(rowsOf(m, 'jobcards')),
      reports: live(rowsOf(m, 'driverreports')),
      reportai: live(rowsOf(m, 'reportai')),
      mayChallans: can(role, 'challans')
    };
    if (loading) return { loading: true, role: role, density: (m && m.density) || 'yard' };

    var papers = papersOf(bus, now);
    var service = serviceOf(bus, now);
    var snap = challanOf(bus, ctx.snaps);
    var seen = lastSeen(bus, rowsOf(m, 'gpsevents'));
    var crew = crewOf(bus, m, role);
    var reports = openReportsOf(ctx.reports, bus.id);

    return {
      loading: false, missing: false, role: role,
      density: (m && m.density) || 'yard',
      offline: !!(m && m.offline), stale: !!(m && m.stale), at: lastSyncAt(),
      bus: bus,
      odo: reading(bus.odometer), odoAt: num(bus.odometerAt),
      odoBroken: bus.odoBroken === true,
      papers: papers, anyPaper: anyPaper(papers),
      service: service,
      cost: costOf(bus, m, now),
      challan: snap, challanState: challanState(snap),
      fitted: fittedOn(bus, rowsOf(m, 'components')),
      crew: crew,
      seen: seen,
      reports: reportRows(reports, ctx.reportai),
      history: historyOf(ctx.cards, bus.id),
      needs: needRows(bus, papers, service, snap, reports, seen, ctx, role),
      mayService: can(role, 'logService'),
      mayChallans: ctx.mayChallans,
      mayJob: can(role, 'addJob'),
      mayLink: can(role, 'addBus'),
      mayDuty: can(role, 'assignDriver'),
      /* `liveMap` is what survives of v1's full-screen fleet map: the bus's own
       * position, declared per action rather than inherited from `fleet`,
       * because the whole point of deny-by-default is that a role added later
       * inherits nothing (`Caps.SCREENS.buses.gates`, `v2-ux.md §5.2`). */
      maySeen: can(role, 'liveMap')
    };
  }

  /* CARD 5. The whole of this screen's relationship with money is these four
   * lines: ask Cost, and re-ask whether the parts add up before anything is
   * drawn. Nothing is added, nothing is scaled, nothing is divided.
   *
   * `Cost.reconciles` is asked a second time on purpose. Cost already withholds
   * a total whose parts do not sum (`why: 'mismatch'`), and the screen asks
   * again because a wrong total is worse than no total and a total that
   * disagrees with its parts is exactly how five bases happened. */
  function costOf(bus, m, now) {
    var C = root.Cost;
    if (!C || typeof C.forBus !== 'function') return null;
    var r;
    try { r = C.forBus(bus.id, COST_DAYS, costRows(m), now); } catch (e) { return { error: true }; }
    var sums = typeof C.reconciles === 'function' ? C.reconciles(r) : r.total != null;
    return { result: r, sums: sums };
  }

  var PART_EMPTY = { fuel: 'bsCostNoFills', parts: 'bsCostNoParts', labour: 'bsCostNoLabour',
                     outside: 'bsCostNoOutside', trip: 'bsCostNoTrips', misc: 'bsCostNoMisc' };

  function challanState(snap) {
    if (!snap) return 'never';
    if (snap.providerUnavailable === true) return 'down';
    var n = num(snap.pendingCount);
    if (n === null) return 'never';
    return n > 0 ? 'pending' : 'zero';
  }

  function fittedOn(bus, comps) {
    var out = [], i;
    var all = live(comps);
    for (i = 0; i < all.length; i++) {
      var c = all[i];
      if (String(c.busId) !== String(bus.id) || c.state !== 'in-service') continue;
      out.push({ id: c.id, kind: String(c.kind || 'other'), label: text(c.label) || text(c.serial) || String(c.id),
                 serial: text(c.serial), position: text(c.position) });
    }
    out.sort(function (a, b) {
      // A piece fitted with no position is not position "" sorting first: it is
      // listed last and warned, because a tyre nobody can find is the thing the
      // card is for.
      if ((a.position === null) !== (b.position === null)) return a.position === null ? 1 : -1;
      return String(a.position).localeCompare(String(b.position)) || String(a.label).localeCompare(String(b.label));
    });
    return out;
  }

  /* CARD 8. Three fixed seats. The PHONE RULE, §1.9: `_redacted` is tested per
   * RECORD and not "is the field empty", because redacted and not-recorded must
   * not look alike — an empty slot invites somebody to type a number into a
   * redacted copy, and a redacted copy must never be pushed back. None of
   * `emgName`, `emgPhone`, `emgRelation`, `refName`, `refPhone` or `photo` is
   * drawn here for ANY role: `_DRIVER_PRIVATE` does not list them, so they
   * reach every role today, and an emergency contact is People's (#8). */
  function crewOf(bus, m, role) {
    var drivers = live(rowsOf(m, 'drivers'));
    var logs = live(rowsOf(m, 'dutylog'));
    var mayPii = PII_ROLES.indexOf(String(role)) >= 0;
    var out = [], i, j;
    for (i = 0; i < SEATS.length; i++) {
      var want = SEATS[i], person = null;
      for (j = 0; j < drivers.length; j++) {
        var d = drivers[j];
        if (String(d.busId) !== String(bus.id)) continue;
        if (d.status === 'left' || d.status === 'archived') continue;
        var kind = d.crewRole == null ? 'driver' : String(d.crewRole);
        if (kind !== want[0]) continue;
        if (want[0] === 'driver' && num(d.driverSlot) !== want[1]) continue;
        person = d; break;
      }
      var since = null;
      if (person) {
        for (j = 0; j < logs.length; j++) {
          var l = logs[j];
          if (String(l.crewId) !== String(person.id) || String(l.busId) !== String(bus.id)) continue;
          var at = num(l.at);
          if (at !== null && (since === null || at > since)) since = at;
        }
      }
      // `phone: undefined` means NO SLOT IS DRAWN AT ALL. `null` means the slot
      // is drawn and says "No phone recorded".
      var phone;
      if (!person || !mayPii || person._redacted === true) phone = undefined;
      else phone = text(person.phone);
      out.push({ word: want[2], name: person ? (text(person.name) || String(person.id)) : null,
                 since: since, phone: phone });
    }
    return out;
  }

  /* CARD 9. The most recent position THIS DEVICE HOLDS, with its age, and never
   * the word "live". `gpsevents.reg` is a display plate and not a bus id, so the
   * join is on the normalised registration — and a registration that matches
   * nothing is the `linkgps` row in card 2, which is the dead end 01 §1.3 item 2
   * records (a route reachable from one conditional branch). */
  function lastSeen(bus, events) {
    var key = normReg(bus.regNo), best = null, i;
    var all = live(events);
    var matched = false;
    for (i = 0; i < all.length; i++) {
      if (normReg(all[i].reg) !== key) continue;
      matched = true;
      var at = num(all[i].at);
      if (at === null) continue;
      if (best === null || at > num(best.at)) best = all[i];
    }
    return { matched: matched, event: best };
  }

  function reportRows(reports, ai) {
    var out = [], i;
    for (i = 0; i < reports.length; i++) {
      var r = reports[i];
      var draft = byId(ai, 'ra-' + r.id);
      out.push({ id: r.id, t: text(r.problem) || text(r.category) || String(r.id),
                 category: text(r.category), at: num(r.at),
                 unsafe: r.unsafe === true || !!(draft && draft.unsafe === true),
                 drafted: !!(draft && text(draft.title)) });
    }
    out.sort(function (a, b) { return (b.at || 0) - (a.at || 0) || String(a.id).localeCompare(String(b.id)); });
    return out;
  }

  function historyOf(cards, busId) {
    var mine = [], i;
    for (i = 0; i < cards.length; i++) if (String(cards[i].busId) === String(busId)) mine.push(cards[i]);
    mine.sort(function (a, b) {
      var x = num(a.closedAt) || whenMs(a.jobDate) || num(a.enterAt) || num(a.createdAt) || 0;
      var y = num(b.closedAt) || whenMs(b.jobDate) || num(b.enterAt) || num(b.createdAt) || 0;
      return y - x || String(a.id).localeCompare(String(b.id));
    });
    var out = [];
    for (i = 0; i < mine.length && i < HISTORY_CAP; i++) {
      var c = mine[i];
      /* A service log is a card whose `problem` OPENS with the word this screen
       * writes there — which is the only marker there is, because no record
       * carries a "this was a service" field and v2 may not invent one. It
       * therefore recognises v2's own service cards and not v1's, and that is
       * the honest limit rather than a guess: v1 wrote the same `problem` free
       * text as every other card, so nothing distinguishes an oil change it
       * logged from a repair somebody typed. */
      out.push({ id: c.id, t: text(c.problem) || String(c.id), status: String(c.status || ''),
                 at: num(c.closedAt) || whenMs(c.jobDate) || num(c.createdAt),
                 isService: String(c.problem || '').indexOf(say('bsServiceTag')) === 0 });
    }
    return { rows: out, total: mine.length, capped: mine.length > HISTORY_CAP };
  }

  /* CARD 2. The SAME ROW KINDS as Attention (#2), each declaring its own
   * capability, rendered for one bus. A person who cannot see unpaid challans
   * on Attention does not see the challan row here — if the bus detail showed
   * every row kind behind one capability we would have rebuilt `dashboard`
   * inside a bus. Deny by default, per row. */
  function needRows(bus, papers, service, snap, reports, seen, ctx, role) {
    var out = [], unranked = [], i;
    var mayFleet = can(role, 'fleet');
    if (mayFleet) {
      for (i = 0; i < papers.length; i++) {
        var p = papers[i];
        if (p.state === 'expired') {
          out.push({ mark: 'warn', tone: 'bad', t: say('bsSubExpired', { paper: say(p.word) }),
                     sub: say('bsPaperExpired', { date: dateName(p.expiry) }) });
        } else if (p.state === 'soon') {
          out.push({ mark: 'clock', tone: 'warn', t: say('bsSubExpiring', { paper: say(p.word), count: p.days }),
                     sub: say('bsPaperExpOn', { date: dateName(p.expiry) }) });
        } else if (p.state === 'noexpiry') {
          out.push({ mark: 'clock', tone: 'warn', t: say(p.word), sub: say('bsPaperNoExp') });
        }
      }
      if (service.state === 'overdue') {
        out.push({ mark: 'warn', tone: 'bad', t: say('bsSubOverdue'), sub: service.words });
      }
      // A bus created with a registration and nothing else is a REAL row, not a
      // draft (4f0691e), so this is the one row that says what it still needs.
      if (!anyPaper(papers)) {
        out.push({ mark: 'doc', tone: 'dim', t: say('bsNeedPapers'), sub: say('bsNeedPapersWhy') });
      }
    }
    if (ctx.mayChallans) {
      var pending = snap ? num(snap.pendingCount) : null;
      if (pending !== null && pending > 0) {
        out.push({ mark: 'challan', tone: 'warn', t: say('bsSubChallan', { count: pending }),
                   sub: say('bsChallanWhen', { ago: ago(snap.fetchedAt, ctx.now) || '' }) });
      }
      // A snapshot that could not be ranked is listed at the END under "Could
      // not check" — never ranked at zero and never at the top.
      if (snap && snap.providerUnavailable === true) {
        unranked.push({ mark: 'challan', tone: 'dim', t: say('bsCardChallans'),
                        sub: say('bsChallanDown', { ago: ago(snap.fetchedAt, ctx.now) || '' }) });
      }
    }
    if (mayFleet) {
      for (i = 0; i < reports.length; i++) {
        var r = reports[i];
        if (r.unsafe !== true) continue;
        out.push({ mark: 'alert', tone: 'bad', t: say('bsSubUnsafe'),
                   sub: text(r.problem) || say('bsCardReports'), report: r.id });
      }
      /* A service card interrupted before its photo: the card stays `done` with
       * nothing that satisfies `_guard_write`, so it will never reach a
       * signature. The card says so rather than sitting in the history looking
       * closed. */
      for (i = 0; i < ctx.cards.length; i++) {
        var c = ctx.cards[i];
        if (String(c.busId) !== String(bus.id) || c.status !== 'done') continue;
        var photos = (c.afterPhotos && c.afterPhotos.length) || (c.beforePhotos && c.beforePhotos.length);
        if (photos || text(c.externalVendor)) continue;
        out.push({ mark: 'job', tone: 'warn', t: say('bsNeedService'), sub: say('bsNeedServiceWhy') });
      }
    }
    /* LINK GPS, §1.8(e). The row exists only when this bus's normalised
     * registration matches no position record, and it carries the control —
     * which is the dead end 01 §1.3 item 2 records, where the route was
     * reachable from a single conditional branch and so from nowhere. */
    if (can(role, 'addBus') && seen && !seen.matched) {
      out.push({ mark: 'map', tone: 'dim', t: say('bsNeedLinkGps'), sub: say('bsNeedLinkWhy'),
                 act: 'busLinkGps', actWord: say('bsLinkGps') });
    }
    return { rows: out, unranked: unranked };
  }

  /* ====================================================================== *
   * render — one string, one insert. Per-row appendChild is the shape that
   * cost 277 ms per page.
   * ====================================================================== */

  function card(cls, heading, bodyHtml, wide) {
    return '<section class="card bs-card' + (wide ? ' bs-wide' : '') + ' ' + cls + '">'
      + '<h2 class="bs-h">' + esc(heading) + '</h2>' + bodyHtml + '</section>';
  }

  function kv(label, vHtml, tone) {
    return '<div class="bs-kv' + (tone ? ' bs-' + tone : '') + '">'
      + '<span class="bs-k">' + esc(label) + '</span>'
      + '<span class="bs-v">' + vHtml + '</span></div>';
  }

  function badgeHtml(b) {
    if (!b) return '';
    return '<span class="badge badge-' + b.tone + '">' + draw(b.mark, 14) + ' ' + esc(b.word) + '</span>';
  }

  /* The freshness line, and the ONLY place on this screen an age appears in a
   * list. A list states its freshness ONCE, in its header: `at` on a figure
   * inside a row adds .figure-note as a block element, triples the row height
   * and runs the age words once per row. This is the rule a well-meaning
   * builder breaks first. */
  function head(v) {
    if (v.loading) {
      return '<p class="bs-fresh">' + esc(typeof root.w === 'function' ? root.w('loading') : '') + '</p>';
    }
    var count = v.total === 0 ? esc(say('bsCountNone'))
      : fig(v.total, { at: v.offline ? null : v.at, stale: v.stale,
                       format: function (n) { return say('bsCount', null, n).replace('{n}', n); } });
    var off = v.offline
      ? ' <span class="bs-off">' + draw('offline', 14) + ' '
        + esc(say('bsOffHead', { time: hhmm(v.at) })) + '</span>'
      : '';
    return '<p class="bs-fresh">' + count + off + '</p>';
  }

  function controls(v) {
    var out = '<div class="bs-bar">'
      + '<label class="field bs-find"><span class="sr-only">' + esc(say('bsSearch')) + '</span>'
      + '<input type="search" autocomplete="off" data-bs-find value="' + esc(v.search) + '"'
      + ' placeholder="' + esc(say('bsSearch')) + '"></label>';
    // Absent, not disabled: there is nothing to order with one bus, and a
    // control a person may not use is absent.
    if (v.maySort) {
      out += '<button type="button" class="btn bs-sort" data-act="busSort">'
        + draw('filter', 20) + ' ' + esc(say('bsSort')) + '</button>';
    }
    if (v.mayAdd) {
      out += '<button type="button" class="btn btn-primary bs-add" data-act="busAdd">'
        + draw('add', 20) + ' ' + esc(say('bsAdd')) + '</button>';
    }
    return out + '</div>';
  }

  function registerRows(v) {
    var desk = v.density === 'desk';
    var out = '', i;
    for (i = 0; i < v.rows.length; i++) {
      var r = v.rows[i];
      // The desk row's `.t` is regNo ALONE and the one-urgent-thing line becomes
      // the badge's word: a figure note inside a desk row is forbidden, and the
      // list header already stated the age once.
      var act = desk ? fig(r.odo, { unit: 'km', format: group }) + badgeHtml(r.badge) : badgeHtml(r.badge);
      out += '<a class="v2row bs-row" href="#" data-bs-open="' + esc(r.id) + '">'
        + '<span class="lead">' + draw('bus', desk ? 16 : 20) + '</span>'
        + '<span class="t">' + esc(r.reg) + '</span>'
        + (desk ? '' : '<span class="sub">' + esc(r.sub) + '</span>')
        + '<span class="act">' + act + '</span></a>';
    }
    if (v.unranked.length) {
      out += '<p class="bs-unranked">' + esc(say('bsSortUnranked')) + '</p>';
      for (i = 0; i < v.unranked.length; i++) {
        var u = v.unranked[i];
        out += '<a class="v2row bs-row" href="#" data-bs-open="' + esc(u.id) + '">'
          + '<span class="lead">' + draw('bus', desk ? 16 : 20) + '</span>'
          + '<span class="t">' + esc(u.reg) + '</span>'
          + (desk ? '' : '<span class="sub">' + esc(u.sub) + '</span>')
          + '<span class="act">' + badgeHtml(u.badge) + '</span></a>';
      }
    }
    return out;
  }

  function registerBody(v) {
    if (v.loading) {
      return typeof root.skeleton === 'function' ? root.skeleton(v.density === 'desk' ? 20 : 8) : '';
    }
    /* A list that HAS rows keeps them offline — they are from the local
     * database and they are real, and only their age is in question. Only an
     * empty-and-offline list gets offlineState(). */
    if (!v.hasAny && v.offline) {
      return typeof root.offlineState === 'function' ? root.offlineState() : '';
    }
    if (!v.hasAny) {
      return typeof root.emptyState === 'function'
        ? root.emptyState(say('bsEmptyReg'), { icon: 'bus', hint: say('bsEmptyRegHint') }) : '';
    }
    if (!v.rows.length && !v.unranked.length) {
      // A search that matched nothing is not an empty register.
      return typeof root.emptyState === 'function' ? root.emptyState(say('bsNoMatch'), { icon: 'search' }) : '';
    }
    return '<div class="bs-list">' + registerRows(v) + '</div>';
  }

  function renderRegister(m) {
    var v = registerModel(m);
    return '<div class="bs">' + head(v) + controls(v) + registerBody(v) + '</div>';
  }

  /* ---------------------------------------------------------------------- *
   * the eleven cards
   * ---------------------------------------------------------------------- */

  function cardBus(v) {
    var b = v.bus;
    var odo = v.odoBroken || v.odo === null
      ? fig(null) + ' <span class="bs-why">' + esc(v.service.state === 'broken' ? v.service.words
          : (typeof root.w === 'function' ? root.w('odoNone') : '')) + '</span>'
      : fig(v.odo, { unit: 'km', at: v.odoAt, format: group });
    var body = '<div class="bs-top">'
      + '<button type="button" class="btn btn-quiet bs-back" data-act="busBack">'
      + draw('back', 20) + ' ' + esc(say('bsBack')) + '</button>'
      + '<p class="bs-reg">' + esc(String(b.regNo || b.id)) + '</p></div>'
      + kv(say('bsOdoLabel'), odo)
      + kv(say('bsCompany'), esc(text(b.company) || say('bsNotRecorded')))
      + kv(say('bsModel'), esc(text(b.model) || say('bsNotRecorded')))
      + kv(say('bsChassis'), esc(text(b.chassis) || say('bsNotRecorded')))
      + kv(say('bsEngine'), esc(text(b.engine) || say('bsNotRecorded')));
    return card('bs-c1', say('bsCardBus'), body, true);
  }

  function whyRow(r) {
    var act = r.act
      ? '<button type="button" class="btn" data-act="' + esc(r.act) + '">' + esc(r.actWord) + '</button>'
      : '';
    return '<div class="v2row v2row-why bs-' + r.tone + '">'
      + '<span class="lead">' + draw(r.mark, 16) + '</span>'
      + '<div class="txt"><div class="t">' + esc(r.t) + '</div>'
      + '<div class="sub">' + esc(r.sub) + '</div></div>'
      + '<div class="act">' + act + '</div></div>';
  }

  function cardNeeds(v) {
    var n = v.needs, out = '', i;
    if (!n.rows.length && !n.unranked.length) {
      out = typeof root.emptyState === 'function'
        ? root.emptyState(say('bsNeedsNone'), { icon: 'ok', hint: say('bsNeedsNoneHint') }) : '';
      return card('bs-c2', say('bsCardNeeds'), out, true);
    }
    for (i = 0; i < n.rows.length; i++) out += whyRow(n.rows[i]);
    if (n.unranked.length) {
      out += '<p class="bs-unranked">' + esc(say('bsNeedsUnranked')) + '</p>';
      for (i = 0; i < n.unranked.length; i++) out += whyRow(n.unranked[i]);
    }
    return card('bs-c2', say('bsCardNeeds'), out, true);
  }

  function paperWords(p) {
    if (p.state === 'expired') return say('bsPaperExpired', { date: dateName(p.expiry) });
    if (p.state === 'soon') return say('bsPaperExpIn', { count: p.days });
    if (p.state === 'valid') return say('bsPaperExpOn', { date: dateName(p.expiry) });
    if (p.state === 'noexpiry') return say('bsPaperNoExp');
    return say('bsNotRecorded');
  }
  var PAPER_TONE = { expired: 'bad', soon: 'warn', noexpiry: 'warn', valid: 'ok', none: 'dim' };

  function cardPapers(v) {
    // NEVER EMPTY — five fixed rows, all five "Not recorded" on a fresh device,
    // with one line above saying so. A missing paper is visible as missing.
    var out = v.anyPaper ? '' : '<p class="bs-note">' + esc(say('bsPaperNone')) + '</p>';
    for (var i = 0; i < v.papers.length; i++) {
      var p = v.papers[i];
      out += '<div class="v2row bs-paper">'
        + '<span class="lead bs-' + PAPER_TONE[p.state] + '">' + draw('doc', 20) + '</span>'
        + '<span class="t">' + esc(say(p.word)) + '</span>'
        + '<span class="sub">' + esc((p.number || say('bsPaperNoNum')) + ' · ' + paperWords(p)) + '</span>'
        + '<span class="act"></span></div>';
    }
    return card('bs-c3', say('bsCardPapers'), out);
  }

  function cardService(v) {
    var s = v.service;
    var b = v.bus;
    var interval = reading(b.serviceIntervalKm);
    var lastOdo = reading(b.lastServiceOdo);
    var lastDate = whenMs(b.lastServiceDate);
    var body = kv(say('bsInterval'), fig(interval, { unit: 'km', format: group }))
      + kv(say('bsLastService'), lastOdo === null && lastDate === null ? fig(null)
        : (lastOdo !== null ? fig(lastOdo, { unit: 'km', format: group })
          : esc(dateName(lastDate))))
      // The due figure is a km DISTANCE and only exists when there is a km
      // basis. In the three states that have none there is no km figure at all.
      + kv(say('bsDueLabel'), (s.state === 'due' || s.state === 'overdue'
        ? fig(s.km, { unit: 'km', format: group }) : fig(null))
        + ' <span class="bs-why bs-' + s.tone + '">' + esc(s.words) + '</span>', s.tone);
    if (s.next) body += '<p class="bs-note">' + esc(s.next) + '</p>';
    if (v.mayService) {
      body += '<button type="button" class="btn btn-primary bs-wideb" data-act="busService">'
        + esc(say('bsLogService')) + '</button>';
    }
    return card('bs-c4', say('bsCardService'), body);
  }

  /* CARD 5 — the one total and its parts, side by side, so the reader can add
   * them up. The total is NEVER drawn alone: a total without its parts is a
   * number you have to trust. And when the parts do not sum, or any part could
   * not be read, there is no total — the dash, with the reason in words. A
   * smaller number presented as complete is the failure. */
  function cardCost(v) {
    var c = v.cost;
    if (!c) return card('bs-c5', say('bsCardCost'), '', true);
    if (c.error) {
      return card('bs-c5', say('bsCardCost'),
                  typeof root.errorState === 'function' ? root.errorState(say('bsErrBus')) : '', true);
    }
    var r = c.result;
    var missing = r.unknown.length > 0;
    var hero = c.sums
      ? fig(r.total, { format: money, at: v.offline ? null : v.at, stale: v.stale })
      : fig(null);
    var note = '';
    if (!c.sums && r.why === 'mismatch') {
      note = '<span class="badge badge-bad">' + draw('warn', 14) + ' '
        + esc(say('bsCostMismatch')) + '</span>';
    } else if (missing) {
      note = '<span class="badge badge-warn">' + draw('clock', 14) + ' '
        + esc(say('bsCostMissing')) + '</span>';
    }
    var body = '<div class="bs-total">' + hero + ' ' + note + '</div>';
    var i, p;
    for (i = 0; i < r.parts.length; i++) {
      p = r.parts[i];
      var words = '';
      if (p.value === null) words = say('bsCostUnread');
      else if (p.n === 0) words = say(PART_EMPTY[p.id] || 'bsCostUnread');
      body += '<div class="bs-part' + (p.value === null ? ' bs-warn' : '') + '">'
        + '<span class="bs-k">' + esc(p.label) + '</span>'
        + '<span class="bs-v">' + fig(p.value, { format: money }) + '</span>'
        + (words === '' ? '' : '<span class="bs-why">' + esc(words) + '</span>') + '</div>';
    }
    body += '<p class="bs-note">' + esc(say('bsCostNotIn')) + '</p>';
    if (!c.sums && r.why === 'mismatch' && typeof root.errorState === 'function') {
      body += root.errorState(say('bsCostMismatch'));
    }
    return card('bs-c5', say('bsCardCost'), body, true);
  }

  /* CARD 6. The whole card is ABSENT without `challans` — not an empty card. */
  function cardChallans(v) {
    if (!v.mayChallans) return '';
    var s = v.challan, st = v.challanState;
    var body;
    if (st === 'never') {
      body = kv(say('bsChallanPend'), fig(null) + ' <span class="bs-why">' + esc(say('bsChallanNever')) + '</span>');
    } else if (st === 'down') {
      body = kv(say('bsChallanPend'), fig(null) + ' <span class="bs-why bs-warn">'
        + esc(say('bsChallanDown', { ago: ago(s.fetchedAt, Date.now()) || '' })) + '</span>');
    } else if (st === 'zero') {
      body = kv(say('bsChallanPend'), fig(0) + ' <span class="bs-why">'
        + esc(say('bsChallanZero', { ago: ago(s.fetchedAt, Date.now()) || '' })) + '</span>');
    } else {
      body = kv(say('bsChallanPend'), fig(num(s.pendingCount)))
        + kv(say('bsChallanPay'), fig(num(s.pendingPayable), { format: money }))
        + '<p class="bs-note">' + esc(say('bsChallanWhen',
          { ago: ago(s.fetchedAt, Date.now()) || '' })) + '</p>';
    }
    if (s && num(s.creditsLeft) !== null) {
      body += '<p class="bs-note">' + esc(say('bsChallanLeft', { count: num(s.creditsLeft) })) + '</p>';
    }
    /* The PRICE IS ON THE BUTTON, because each lookup spends a billable credit.
     * Offline the button is still drawn and says so BEFORE it is pressed. */
    body += '<button type="button" class="btn bs-wideb" data-act="busChallans"'
      + (v.offline ? ' aria-disabled="true"' : '') + '>'
      + draw('challan', 20) + ' ' + esc(say('bsCheckChallans')) + '</button>';
    if (v.offline) body += '<p class="bs-note bs-warn">' + esc(say('bsChallanOff')) + '</p>';
    return card('bs-c6', say('bsCardChallans'), body);
  }

  var KIND_MARK = { tyre: 'tyre', battery: 'battery' };

  function cardFitted(v) {
    if (!v.fitted.length) {
      return card('bs-c7', say('bsCardFitted'),
                  typeof root.emptyState === 'function'
                    ? root.emptyState(say('bsFittedNone'), { icon: 'tyre' }) : '');
    }
    var out = '', i;
    for (i = 0; i < v.fitted.length; i++) {
      var f = v.fitted[i];
      out += '<div class="v2row bs-fit">'
        + '<span class="lead' + (f.position === null ? ' bs-warn' : '') + '">'
        + draw(KIND_MARK[f.kind] || 'part', 20) + '</span>'
        + '<span class="t">' + esc(f.position || say('bsNoPosition')) + '</span>'
        + '<span class="sub">' + esc(f.label) + '</span>'
        + '<span class="act"></span></div>';
    }
    return card('bs-c7', say('bsCardFitted'), out);
  }

  function cardCrew(v) {
    var out = '', i;
    for (i = 0; i < v.crew.length; i++) {
      var s = v.crew[i];
      var sub = s.name === null ? ''
        : (s.since === null ? say('bsSeatSinceNil') : say('bsSeatSince', { date: dayName(s.since) }));
      // A phone slot is drawn only when there is a slot to draw: `undefined`
      // means no slot at all, which is the redacted and the no-permission case.
      var tail = '';
      if (s.phone !== undefined) {
        tail = s.phone === null
          ? '<span class="bs-why">' + esc(say('bsNoPhone')) + '</span>'
          : '<a class="bs-tel" href="tel:' + esc(s.phone) + '">' + esc(s.phone) + '</a>';
      }
      out += '<div class="v2row bs-seat">'
        + '<span class="lead' + (s.name === null ? ' bs-dim' : '') + '">' + draw('seat', 20) + '</span>'
        + '<span class="t">' + esc(say(s.word) + ' · ' + (s.name || say('bsSeatEmpty'))) + '</span>'
        + (sub === '' ? '' : '<span class="sub">' + esc(sub) + '</span>')
        + '<span class="act">' + tail + '</span></div>';
    }
    /* Filling a seat is NOT done here — it is Duty board's (#9), and the
     * seat-clearing bug is one write path too many already. The link is there
     * for a holder of `assignDriver` and simply absent for a holder without it. */
    if (v.mayDuty) {
      out += '<button type="button" class="btn bs-wideb" data-nav="duty">'
        + esc(say('bsToDuty')) + '</button>';
    }
    return card('bs-c8', say('bsCardCrew'), out);
  }

  function cardSeen(v) {
    if (!v.maySeen) return '';           // the whole card, absent — not an empty one
    var s = v.seen, body;
    if (!s.matched) {
      // The fact, once. The CONTROL for it is card 2's row (§1.8e) and is not
      // repeated here: two doors onto one write is how a screen grows a second
      // path nobody maintains.
      body = '<p class="bs-note">' + esc(say('bsSeenNoMatch')) + '</p>';
    } else if (!s.event) {
      body = '<p class="bs-note">' + esc(say('bsSeenNone')) + '</p>';
    } else {
      /* "Last seen 3 hours ago" is honest offline; nothing here claims to be
       * current, and the word "live" does not appear on this screen. The age is
       * the figure — there is no coordinate to draw and a lat/lng pair is not a
       * fact anybody standing in the yard can use. */
      body = kv(say('bsCardSeen'),
                '<span class="bs-v-t">' + esc(say('bsSeenAt', { ago: ago(s.event.at, Date.now()) || '' })) + '</span>');
    }
    return card('bs-c9', say('bsCardSeen'), body);
  }

  function cardReports(v) {
    if (!v.reports.length) {
      return card('bs-c10', say('bsCardReports'),
                  typeof root.emptyState === 'function'
                    ? root.emptyState(say('bsReportsNone'), { icon: 'ok' }) : '');
    }
    var out = '', i;
    for (i = 0; i < v.reports.length; i++) {
      var r = v.reports[i];
      // The row STAYS and shows the report; only the button is absent without
      // addJob. A row a person may not act on still answers the question.
      var act = v.mayJob
        ? '<button type="button" class="btn btn-primary" data-act="busMakeJob" data-bs-report="'
          + esc(r.id) + '">' + esc(say('bsMakeJob')) + '</button>' : '';
      out += '<div class="v2row v2row-why bs-' + (r.unsafe ? 'bad' : 'dim') + '">'
        + '<span class="lead">' + draw(r.unsafe ? 'alert' : 'doc', 16) + '</span>'
        + '<div class="txt"><div class="t">' + esc(r.t) + '</div>'
        + '<div class="sub">' + esc(r.drafted ? say('bsDrafted') : (r.category || '')) + '</div></div>'
        + '<div class="act">' + act + '</div></div>';
    }
    return card('bs-c10', say('bsCardReports'), out);
  }

  function cardHistory(v) {
    var h = v.history;
    if (!h.rows.length) {
      return card('bs-c11', say('bsCardHistory'),
                  typeof root.emptyState === 'function'
                    ? root.emptyState(say('bsHistoryNone'), { icon: 'job' }) : '');
    }
    var out = '', i;
    for (i = 0; i < h.rows.length; i++) {
      var c = h.rows[i];
      // A card at `done` is "Waiting for sign-off", NEVER "Verified": the second
      // signature has not arrived, and v2's own service log stops at `done`.
      var tag = c.status === 'done'
        ? '<span class="badge badge-warn">' + draw('clock', 14) + ' ' + esc(say('bsWaitingSign')) + '</span>'
        : (c.status === 'verified' ? '<span class="badge badge-ok">' + draw('ok', 14) + ' '
           + esc(say('bsServiceTag')) + '</span>' : '');
      out += '<a class="v2row bs-job" href="#" data-act="busJob" data-bs-job="' + esc(c.id) + '">'
        + '<span class="lead">' + draw('job', 20) + '</span>'
        + '<span class="t">' + esc((c.isService ? say('bsServiceTag') + ' · ' : '') + c.t) + '</span>'
        + '<span class="sub">' + esc(dateName(c.at) || say('bsNotRecorded')) + '</span>'
        + '<span class="act">' + tag + '</span></a>';
    }
    if (h.capped) {
      out += '<p class="bs-note">' + esc(say('bsHistoryMore', { shown: h.rows.length, total: h.total })) + '</p>';
    }
    return card('bs-c11', say('bsCardHistory'), out);
  }

  function renderBus(m, id) {
    var v = busModel(m, id);
    if (v.loading) {
      return '<div class="bs bs-one">'
        + (typeof root.skeleton === 'function' ? root.skeleton(6) : '') + '</div>';
    }
    if (v.missing) {
      return '<div class="bs bs-one">'
        + (typeof root.errorState === 'function' ? root.errorState(say('bsErrBus')) : '') + '</div>';
    }
    return '<div class="bs bs-one"><div class="bs-grid">'
      + cardBus(v) + cardNeeds(v) + cardPapers(v) + cardService(v) + cardCost(v)
      + cardChallans(v) + cardFitted(v) + cardCrew(v) + cardSeen(v)
      + cardReports(v) + cardHistory(v)
      + '</div></div>';
  }

  /* Two states of ONE screen, chosen by `params.busId` — the name Attention
   * already routes with. `params.tab` is accepted and ignored: this screen has
   * no tabs, every card is on the page, and a tab that only scrolled would be a
   * second route in disguise. */
  function render(m) {
    var p = m && m.params;
    var id = p && (p.busId != null ? p.busId : p.id);
    return id == null || id === '' ? renderRegister(m) : renderBus(m, id);
  }

  /* ====================================================================== *
   * THE SHEETS
   * ====================================================================== */

  function sortSheet() {
    var opts = [['reg', 'bsSortReg'], ['cost', 'bsSortCost'], ['service', 'bsSortService']], out = '', i;
    for (i = 0; i < opts.length; i++) {
      out += '<button type="button" class="v2row" data-bs-sort="' + opts[i][0] + '">'
        + '<span class="lead">' + draw('filter', 20) + '</span>'
        + '<span class="t">' + esc(say(opts[i][1])) + '</span>'
        + '<span class="act">' + (sort === opts[i][0] ? draw('ok', 16) : '') + '</span></button>';
    }
    return '<div class="bs-sheet">' + out + '</div>';
  }

  function numField(label, field, hint) {
    return '<label class="num"><span class="num-l">' + esc(label) + '</span>'
      + '<input class="field num-in" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off"'
      + ' enterkeyhint="done" data-kind="whole" data-field="' + esc(field) + '">'
      + (hint ? '<span class="num-h">' + esc(hint) + '</span>' : '') + '</label>';
  }
  function textField(label, field, rows) {
    return '<label class="num"><span class="num-l">' + esc(label) + '</span>'
      + (rows ? '<textarea class="field" rows="' + rows + '" data-field="' + esc(field) + '"></textarea>'
        : '<input class="field" type="text" autocomplete="off" data-field="' + esc(field) + '">')
      + '</label>';
  }

  /* (a) ADD BUS. The record is written on the FIRST save, so an interruption
   * leaves a real bus and not a draft — exactly as the Job card does. The
   * odometer is NOT asked for here and never pre-filled with 0: a default zero
   * on an odometer is a wrong reading nobody typed. */
  function addSheet() {
    return '<form class="bs-sheet" data-sheet="addbus">'
      + textField(say('bsFieldReg'), 'regNo')
      + textField(say('bsCompany'), 'company')
      + textField(say('bsModel'), 'model')
      + textField(say('bsChassis'), 'chassis')
      + textField(say('bsEngine'), 'engine')
      + numField(say('bsFieldInterval'), 'serviceIntervalKm', say('bsHintInterval'))
      + '<p class="bs-why" data-bs-dup></p>'
      + '<button type="button" class="btn btn-primary bs-wideb" data-act="busAddSave">'
      + esc(say('bsSave')) + '</button></form>';
  }

  /* (b) LOG SERVICE. v1's `confirmLogService` wrote a card straight at
   * `status: 'verified'` with no photos. v2 stops at `done` and collects the
   * second signature like every other closed card, for two reasons that are not
   * taste: `_guard_write` needs before+after photos or a vendor bill to reach
   * `done` or `verified` AND refuses a closer who is also the verifier, which
   * fails outright for the OWNER (the exemption names supervisors); and
   * DECISIONS §10 removed self-sign-off for every role including the owner. A
   * refused push is quiet — it drops "Waiting to send" to zero while the server
   * never has the record.
   *
   * So Save is `aria-disabled="true"` until a photo or a bill is there, WITH THE
   * REASON IN WORDS beside it, never a silent dead button. */
  function serviceSheet(bus) {
    var prev = reading(bus && bus.odometer);
    return '<form class="bs-sheet" data-sheet="service" data-bs-bus="' + esc(bus.id) + '">'
      + textField(say('bsFieldDate'), 'jobDate')
      + numField(say('bsFieldOdo'), 'odometer', prev === null ? '' : say('bsOdoLabel') + ' ' + group(prev) + ' km')
      + '<p class="bs-why" data-bs-odo></p>'
      + textField(say('bsFieldDone'), 'problem', 3)
      + numField(say('bsFieldHours'), 'labourHours')
      + textField(say('bsFieldParts'), 'parts', 2)
      + textField(say('bsFieldVendor'), 'externalVendor')
      + (typeof root.photoGrid === 'function'
        ? root.photoGrid([], { capture: true, max: 4, label: say('bsAddPhoto'), name: 'servicePhoto' }) : '')
      + '<p class="bs-why" data-bs-need>' + esc(say('bsPhotoNeeded')) + '</p>'
      + '<button type="button" class="btn btn-primary bs-wideb" aria-disabled="true"'
      + ' data-act="busServiceSave">' + esc(say('bsSave')) + '</button></form>';
  }

  /* (c) MAKE A JOB from a driver report, pre-filled from `reportai` when the
   * server has drafted one and FULLY USABLE when it has not — the draft arrives
   * within ten minutes and the supervisor is standing there now. */
  function jobSheet(bus, report, draft) {
    var title = (draft && text(draft.title)) || (report && text(report.problem)) || '';
    return '<form class="bs-sheet" data-sheet="makejob" data-bs-bus="' + esc(bus.id) + '"'
      + ' data-bs-report="' + esc(report ? report.id : '') + '">'
      + '<label class="num"><span class="num-l">' + esc(say('bsFieldProblem')) + '</span>'
      + '<textarea class="field" rows="3" data-field="problem">' + esc(title) + '</textarea></label>'
      + numField(say('bsFieldOdo'), 'odometer')
      + '<p class="bs-why" data-bs-odo></p>'
      + '<button type="button" class="btn btn-primary bs-wideb" data-act="busJobSave">'
      + esc(say('bsSave')) + '</button></form>';
  }

  function gpsSheet(bus) {
    return '<form class="bs-sheet" data-sheet="linkgps" data-bs-bus="' + esc(bus.id) + '">'
      + textField(say('bsGpsReg'), 'regNo')
      + '<button type="button" class="btn btn-primary bs-wideb" data-act="busGpsSave">'
      + esc(say('bsSave')) + '</button></form>';
  }

  /* ====================================================================== *
   * ONE delegated listener
   * ====================================================================== */

  var bound = false;

  /* THE STORES THIS SCREEN READS, MINUS ONE. The seven `COST_STORES` plus the
   * six it reads on its own account; `dutylog` and `reportai` are in no other
   * load list in v2, and `def`, `trips` and `ledger` are reachable only through
   * Fuel & tyres, Store or Attention. That is REV-FLOW F3 on this screen: a
   * per-bus running cost built out of stores nothing had asked IndexedDB for,
   * which `Cost.forBus` correctly passes through as `undefined` rather than
   * inventing a zero — so the figure read `— No data` and stayed there.
   *
   * `gpsevents` IS READ BY THIS SCREEN AND IS DELIBERATELY NOT HERE, and the
   * reason is that the cost of putting it here cannot be measured from node.
   * `lastSeen()` uses it for the "last seen" plate. It is also the one store
   * `pullapply.js`'s `DEFERRED_STORES` holds back from the first sync, on the
   * measured ground that it "is an order of magnitude bigger than everything
   * else put together" — 40,000 rows against 700 for the rest. In node the
   * in-memory part of holding it is ~1 ms (one `storeSig` pass over 40,000
   * rows), but the dominant cost is the `getAll` and the structured clone out
   * of IndexedDB, which no node suite can run, and the floor here is a Core 2
   * Duo. So the plate keeps arriving the way it does today — on `boot.js`'s
   * tick, once the pull's deferred cursor has brought the rows down — and
   * putting a 40,000-row read in front of this screen's first paint is a change
   * that needs a number from a real browser first. It is not one of REV-FLOW
   * F3's twelve stores. */
  var STORES = COST_STORES.concat(['buses', 'drivers', 'driverreports', 'challans',
                                   'dutylog', 'reportai', 'meta']);

  /* The read, and the only place this screen asks IndexedDB for anything. From
   * `mount()` and nowhere else; the `.then` is what puts the rows on screen
   * without waiting for `boot.js`'s next four-second tick, and `loading` keeps
   * a mount that lands mid-read from stacking a second one over the first. */
  var loading = false;

  /* `c`, not `C`: in this file `C` is `Cost`, and `test_v2_buses.js`'s A3 check
   * reads `\bC\.<name>` as a call into Cost to prove this screen only ever asks
   * it for `forBus` and `reconciles`. A local named `C` for the cache made
   * `C.load` look like a third one. The check is right and the name was wrong;
   * line 616 already uses lowercase `c` for exactly this. */
  function load() {
    var c = root.Cache;
    if (loading || !c || typeof c.load !== 'function') return null;
    loading = true;
    return c.load(STORES).then(function () { loading = false; reread(); },
                               function () { loading = false; });
  }

  // Only while this is still the screen on the page.
  function reread() {
    var c = root.Router && root.Router.current ? root.Router.current() : null;
    if (!c || c.id !== ID) return;
    remount();
  }

  function mount() {
    // The read is the first statement, above the listener guard. `duty.js`'s
    // mount says why the position and not the guard is the point.
    load();
    if (bound) return onClick;
    bound = true;
    var d = root.document;
    if (d && typeof d.addEventListener === 'function') {
      d.addEventListener('click', onClick);
      // The search field filters locally as you type. It NEVER navigates and it
      // never writes — and it is on `input`, not on the click handler, which is
      // the other half of the same rule.
      d.addEventListener('input', onInput);
    }
    return onClick;
  }

  /* The other half of `mount()`, and INTEGRATION-NOTES 17's step 2. `Shell.mount`
   * calls it when it mounts a different screen, so what `mount()` added comes
   * off exactly when this screen stops being the one on the page.
   *
   * It removes the SAME function references `mount()` registered — every handler
   * here is a named module-level function for that reason: `removeEventListener`
   * matches on identity, and a fresh closure per mount would remove nothing
   * while looking exactly like this. The flag goes back with them, or the screen
   * would never re-arm. */
  function unmount() {
    var d = root.document;
    if (bound && d && typeof d.removeEventListener === 'function') {
      d.removeEventListener('click', onClick);
      d.removeEventListener('input', onInput);
    }
    bound = false;
    return true;
  }

  function onClick(ev) {
    var t = ev && ev.target;
    if (!t || typeof t.closest !== 'function') return;

    /* THE EARLY RETURN, before [data-act] or [data-nav] is read. Three .num
     * entries live in these sheets — the odometer, the labour hours and the
     * service interval — and a field whose click reached the row handler is
     * what threw the storekeeper off the screen mid-count. */
    if (t.closest(FIELDS)) return;

    var open = t.closest('[data-bs-open]');
    if (open) {
      if (ev.preventDefault) ev.preventDefault();
      go(open.getAttribute('data-bs-open'));
      return;
    }
    var pick = t.closest('[data-bs-sort]');
    if (pick) {
      setSort(pick.getAttribute('data-bs-sort'));
      if (root.V2 && root.V2.closeSheet) root.V2.closeSheet();
      remount();
      return;
    }
    var el = t.closest('[data-act]');
    if (!el) return;
    var act = el.getAttribute('data-act');
    if (act === 'busBack') { if (ev.preventDefault) ev.preventDefault(); return back(); }
    if (act === 'busSort') return openSort();
    if (act === 'busAdd') return openAdd();
    if (act === 'busAddSave') return saveAdd(el);
    if (act === 'busService') return openService();
    if (act === 'busServiceSave') return saveService(el);
    if (act === 'busChallans') return askChallans(el);
    if (act === 'busMakeJob') return openJob(el.getAttribute('data-bs-report'));
    if (act === 'busJobSave') return saveJob(el);
    if (act === 'busLinkGps') return openGps();
    if (act === 'busGpsSave') return saveGps(el);
    if (act === 'busJob') {
      if (ev.preventDefault) ev.preventDefault();
      var job = t.closest('[data-bs-job]');
      if (job && root.Router && root.Router.go) root.Router.go('jobcard', { id: job.getAttribute('data-bs-job') });
    }
  }

  /* The search box, and the odometer's forward-only refusal, which is the one
   * place `Odo.check` earns its keep: the message NAMES the number the person
   * has to beat, never "Invalid odometer". */
  function onInput(ev) {
    var t = ev && ev.target;
    if (!t || typeof t.getAttribute !== 'function') return;
    if (t.getAttribute('data-bs-find') !== null) {
      setSearch(t.value);
      remount();
      return;
    }
    if (t.getAttribute('data-field') === 'odometer') showOdoRefusal(t);
  }

  function showOdoRefusal(input) {
    var form = input.form || null;
    var slot = form && form.querySelector ? form.querySelector('[data-bs-odo]') : null;
    if (!slot) return;
    var bus = currentBus();
    var O = root.Odo;
    var entered = String(input.value || '').trim();
    var next = entered === '' ? null : Number(entered);
    var bad = (O && typeof O.check === 'function' && bus)
      ? O.check(reading(bus.odometer), reading(next), Date.now()) : null;
    slot.textContent = bad ? bad.message : '';
  }

  function remount() {
    if (root.Shell && typeof root.Shell.mount === 'function') {
      root.Shell.mount(ID, (root.Router && root.Router.current) ? root.Router.current().params : null);
    }
  }
  function here() {
    var c = root.Router && root.Router.current ? root.Router.current() : null;
    var p = c && c.params;
    return p ? (p.busId != null ? p.busId : p.id) : null;
  }
  function currentBus() {
    var s = root.S, id = here();
    if (!s || !s.cache || id == null) return null;
    return byId(live((s.cache.buses && typeof s.cache.buses.length === 'number') ? s.cache.buses : []), id);
  }
  function go(id) {
    if (root.Router && root.Router.go) root.Router.go(ID, { busId: id });
  }
  /* Back KEEPS the search text and the sort: they live in this module and not in
   * the route, so returning to the register returns to the register the person
   * left. */
  function back() { if (root.Router && root.Router.go) root.Router.go(ID, null); }

  function sheet(title, html) {
    if (root.V2 && typeof root.V2.openSheet === 'function') root.V2.openSheet(title, html);
  }
  function openSort() { sheet(say('bsSort'), sortSheet()); }
  function openAdd() { sheet(say('bsSheetAdd'), addSheet()); }
  function openService() { var b = currentBus(); if (b) sheet(say('bsSheetService'), serviceSheet(b)); }
  function openGps() { var b = currentBus(); if (b) sheet(say('bsSheetGps'), gpsSheet(b)); }
  function openJob(reportId) {
    var b = currentBus(), s = root.S;
    if (!b || !s || !s.cache) return;
    var r = byId(live(s.cache.driverreports || []), reportId);
    var draft = byId(live(s.cache.reportai || []), 'ra-' + reportId);
    sheet(say('bsSheetJob'), jobSheet(b, r, draft));
  }

  /* ====================================================================== *
   * THE WRITES. No new field on any record, no new store: v1 runs against the
   * same database under whole-record last-write-wins, and a field v2 invented
   * would be erased the next time a v1 device wrote that record.
   * ====================================================================== */

  function uid(prefix) {
    return prefix + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36);
  }

  function formOf(name) {
    var d = root.document;
    return d && d.querySelector ? d.querySelector('[data-sheet="' + name + '"]') : null;
  }
  function valsOf(form) {
    if (!form || !form.querySelectorAll) return null;
    var nodes = form.querySelectorAll('[data-field]'), out = {}, i;
    for (i = 0; i < nodes.length; i++) out[nodes[i].getAttribute('data-field')] = nodes[i].value;
    return out;
  }
  function wholeNum(v) {
    var s = String(v == null ? '' : v).trim();
    if (s === '') return null;
    var n = Number(s);
    return isFinite(n) ? n : null;
  }

  /* A new bus gets `uid('b-')` and NEVER a constructed id: `bus-<NORMREG>` is
   * stable by design for seeded and imported rows, and minting one here would
   * collide with a row the importer owns. The duplicate test reads the RAW rows
   * including tombstones — otherwise a deleted bus is silently re-created. */
  function createBus(fields) {
    var f = fields || {};
    var reg = text(f.regNo);
    if (reg === null) return null;
    var now = Date.now();
    return {
      id: uid('b-'), regNo: reg,
      company: text(f.company) || '', model: text(f.model) || '',
      chassis: text(f.chassis) || '', engine: text(f.engine) || '',
      serviceIntervalKm: wholeNum(f.serviceIntervalKm),
      docs: [], photos: [], source: 'v2',
      createdAt: now, updatedAt: now
    };
  }

  async function duplicateOf(reg) {
    var db = root.DB;
    if (!db || typeof db._rawAll !== 'function') return null;
    var all;
    try { all = await db._rawAll('buses'); } catch (e) { return null; }
    var key = normReg(reg), i;
    for (i = 0; i < (all || []).length; i++) {
      if (normReg(all[i] && all[i].regNo) === key) return all[i];
    }
    return null;
  }

  async function saveAdd(el) {
    if (el.getAttribute('aria-disabled') === 'true') return;
    var form = formOf('addbus');
    var vals = valsOf(form);
    var rec = createBus(vals);
    if (!rec || !root.DB) return;
    var dup = await duplicateOf(rec.regNo);
    if (dup) {
      var slot = form && form.querySelector ? form.querySelector('[data-bs-dup]') : null;
      if (slot) slot.textContent = say('bsDuplicate', { reg: String(dup.regNo || rec.regNo) });
      return;
    }
    el.setAttribute('aria-disabled', 'true');
    if ('textContent' in el) el.textContent = say('bsSaving');
    try { await root.DB.put('buses', rec); } catch (e) {
      el.removeAttribute('aria-disabled');
      if (root.V2 && root.V2.toast) root.V2.toast(say('bsSaveFailed'), { kind: 'warn' });
      return;
    }
    if (root.V2 && root.V2.closeSheet) root.V2.closeSheet();
    go(rec.id);
  }

  /* The service card, at `done` and no further. Two writes, in order: the card,
   * then the bus — and the bus row is re-read from IndexedDB immediately before
   * the put, never from `S.cache`, because the whole row goes to the server
   * under last-write-wins and `S.cache` can be seconds stale. */
  function serviceCard(busId, fields, who) {
    var f = fields || {};
    var now = Date.now();
    var photo = text(f.photo);
    var vendor = text(f.externalVendor);
    return {
      id: uid('j-'), busId: String(busId),
      problem: say('bsServiceTag') + (text(f.problem) ? ' — ' + text(f.problem) : ''),
      status: 'done', priority: 'low',
      jobDate: text(f.jobDate) || null,
      closedAt: now, closedBy: who && who.id ? who.id : null,
      verifiedBy: null, verifiedAt: null,
      assignedTo: who && who.id ? who.id : null, assignees: [],
      labourHours: wholeNum(f.labourHours),
      odometer: wholeNum(f.odometer),
      beforePhotos: [], afterPhotos: photo ? [photo] : [],
      partsUsed: [], partRequests: [], coreReturns: [],
      externalVendor: vendor || '', externalCost: null,
      enterAt: null, startAt: null, completeAt: null, outAt: null,
      createdAt: now, updatedAt: now
    };
  }

  async function saveService(el) {
    if (el.getAttribute('aria-disabled') === 'true') return;
    var form = formOf('service');
    var busId = form && form.getAttribute ? form.getAttribute('data-bs-bus') : null;
    var vals = valsOf(form);
    if (!busId || !vals || !root.DB) return;
    var me = (root.S && root.S.user) || null;
    var card = serviceCard(busId, vals, me);
    el.setAttribute('aria-disabled', 'true');
    if ('textContent' in el) el.textContent = say('bsSaving');
    try {
      await root.DB.put('jobcards', card);
      await stampService(busId, wholeNum(vals.odometer), vals.jobDate);
    } catch (e) {
      el.removeAttribute('aria-disabled');
      if (root.V2 && root.V2.toast) root.V2.toast(say('bsSaveFailed'), { kind: 'warn' });
      return;
    }
    if (root.V2 && root.V2.closeSheet) root.V2.closeSheet();
    remount();
  }

  /* `odometer`/`odometerAt` move ONLY when the entered reading is higher than
   * the stored one. Forward-only, and never defaulted: a blank entry leaves the
   * stored reading exactly where it was rather than writing a zero over a real
   * number, and the server writes this same field from the WhatsApp capture. */
  async function stampService(busId, odo, when) {
    var db = root.DB;
    if (!db || typeof db.get !== 'function') return;
    var row = await db.get('buses', busId);
    if (!row) return;
    var at = whenMs(when);
    row.lastServiceDate = at === null ? Date.now() : at;
    if (odo !== null) {
      row.lastServiceOdo = odo;
      var had = reading(row.odometer);
      if (had === null || odo > had) { row.odometer = odo; row.odometerAt = Date.now(); }
    }
    row.updatedAt = Date.now();
    await db.put('buses', row);
  }

  function jobFromReport(busId, reportId, fields, draft, who) {
    var f = fields || {};
    var now = Date.now();
    return {
      id: uid('j-'), busId: String(busId),
      problem: text(f.problem) || (draft && text(draft.title)) || '',
      priority: (draft && text(draft.priority)) || 'medium',
      status: 'open',
      reportIds: reportId ? [String(reportId)] : [],
      reportedBy: who && who.id ? who.id : null,
      assignedTo: null, assignees: [],
      odometer: wholeNum(f.odometer),
      enterAt: null, startAt: null, completeAt: null, outAt: null,
      beforePhotos: [], afterPhotos: [], partsUsed: [], partRequests: [], coreReturns: [],
      externalVendor: '', externalCost: null,
      closedAt: null, closedBy: null, verifiedBy: null, verifiedAt: null,
      createdAt: now, updatedAt: now
    };
  }

  async function saveJob(el) {
    if (el.getAttribute('aria-disabled') === 'true') return;
    var form = formOf('makejob');
    if (!form || !root.DB) return;
    var busId = form.getAttribute('data-bs-bus');
    var reportId = form.getAttribute('data-bs-report') || null;
    var vals = valsOf(form);
    var s = root.S;
    var draft = reportId && s && s.cache ? byId(live(s.cache.reportai || []), 'ra-' + reportId) : null;
    var card = jobFromReport(busId, reportId, vals, draft, (s && s.user) || null);
    if (!text(card.problem)) return;
    el.setAttribute('aria-disabled', 'true');
    if ('textContent' in el) el.textContent = say('bsSaving');
    try {
      await root.DB.put('jobcards', card);
      await addressReport(reportId, card.id);
      // The THIRD write happens ONLY if a reading was entered, and only
      // forward. A whole `buses` row written to say nothing changed is a chance
      // to clobber a concurrent WhatsApp odometer capture for no gain: never
      // write a record to say nothing changed.
      if (card.odometer !== null) await bumpOdometer(busId, card.odometer);
    } catch (e) {
      el.removeAttribute('aria-disabled');
      if (root.V2 && root.V2.toast) root.V2.toast(say('bsSaveFailed'), { kind: 'warn' });
      return;
    }
    if (root.V2 && root.V2.closeSheet) root.V2.closeSheet();
    if (root.Router && root.Router.go) root.Router.go('jobcard', { id: card.id });
  }

  async function addressReport(reportId, jobId) {
    var db = root.DB;
    if (!reportId || !db || typeof db.get !== 'function') return;
    var r = await db.get('driverreports', reportId);
    if (!r) return;
    r.status = 'addressed';
    r.jobId = jobId;
    r.resolvedAt = Date.now();
    r.updatedAt = Date.now();
    await db.put('driverreports', r);
  }

  async function bumpOdometer(busId, odo) {
    var db = root.DB;
    if (db == null || typeof db.get !== 'function' || odo == null) return;
    var row = await db.get('buses', busId);
    if (!row) return;
    var had = reading(row.odometer);
    if (had !== null && odo <= had) return;      // forward only, and never a default
    row.odometer = odo;
    row.odometerAt = Date.now();
    row.updatedAt = Date.now();
    await db.put('buses', row);
  }

  async function saveGps(el) {
    if (el.getAttribute('aria-disabled') === 'true') return;
    var form = formOf('linkgps');
    if (!form || !root.DB) return;
    var busId = form.getAttribute('data-bs-bus');
    var vals = valsOf(form);
    var reg = text(vals && vals.regNo);
    if (reg === null) return;
    el.setAttribute('aria-disabled', 'true');
    if ('textContent' in el) el.textContent = say('bsSaving');
    try {
      var row = await root.DB.get('buses', busId);
      if (!row) return;
      row.regNo = reg;
      row.updatedAt = Date.now();
      await root.DB.put('buses', row);
    } catch (e) {
      el.removeAttribute('aria-disabled');
      if (root.V2 && root.V2.toast) root.V2.toast(say('bsSaveFailed'), { kind: 'warn' });
      return;
    }
    if (root.V2 && root.V2.closeSheet) root.V2.closeSheet();
    remount();
  }

  /* (d) CHECK CHALLANS. Writes NOTHING: `challans` is in SERVER_INGEST_ONLY,
   * denied to every role including the owner. The snapshot arrives by pull. The
   * confirmation comes first because it spends money, and FOCUS STARTS ON
   * CANCEL. */
  async function askChallans(el) {
    if (el.getAttribute('aria-disabled') === 'true') return;
    var V = root.V2;
    if (!V || typeof V.confirmDialog !== 'function') return;
    var bus = currentBus();
    if (!bus) return;
    // The dialog resolves true only on Confirm, and overlay.js has already put
    // focus on Cancel — the safe answer, so a reflexive Enter does not spend a
    // credit.
    var yes = await V.confirmDialog(say('bsChallanAsk'));
    if (yes === true) await fetchChallans(el, bus);
  }

  /* The card KEEPS its old snapshot with its age while this runs. It never
   * blanks to a spinner — a figure that disappears while being refreshed is a
   * figure the reader stops believing. The proxy is keyed on the normalised
   * registration, which is the `rc` the snapshot comes back under. */
  async function fetchChallans(el, bus) {
    el.setAttribute('aria-disabled', 'true');
    if ('textContent' in el) el.textContent = say('bsChecking');
    var s = root.Sync;
    try {
      var out = (s && typeof s.challans === 'function') ? await s.challans(normReg(bus.regNo)) : null;
      if (out && out.error && root.V2 && root.V2.toast) {
        root.V2.toast(String(out.error), { kind: 'warn' });
      }
    } catch (e) {
      if (root.V2 && root.V2.toast) {
        root.V2.toast(say('bsChallanDown', { ago: '' }), { kind: 'warn' });
      }
    }
    el.removeAttribute('aria-disabled');
    if ('textContent' in el) el.textContent = say('bsCheckChallans');
    remount();
  }

  /* ====================================================================== */

  register();

  var api = {
    render: render, model: registerModel, busModel: busModel, mount: mount, unmount: unmount,
    search: setSearch, sort: setSort,
    papersOf: papersOf, serviceOf: serviceOf, crewOf: crewOf,
    addSheet: addSheet, serviceSheet: serviceSheet, jobSheet: jobSheet, sortSheet: sortSheet,
    createBus: createBus, serviceCard: serviceCard, jobFromReport: jobFromReport,
    // Test seam only, the shape of Router._reset: a node suite cannot reload a
    // classic script per case.
    _reset: function () {
      bound = false; search = ''; sort = 'reg';
      costMemo = { key: null, by: null };
    },
    /* The memo's KEY, for the perf check. §3.4's rule — "built once per content
     * signature, never from a draw function" — cannot be read off the markup,
     * because a recomputed total draws exactly the same list. The key is what
     * says whether it was recomputed. */
    _costKey: function () { return costMemo.key; }
  };

  if (root.Router && typeof root.Router.register === 'function') root.Router.register(ID, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.Buses = api;
    /* NO `mount()` here. The listener used to go on at script load, which was
     * the only thing that ever installed it (`Shell.mount` rendered and nothing
     * else), and it then outlived the screen for the whole session —
     * INTEGRATION-NOTES 17. `Shell.mount` now calls `mount()` on the way in and
     * `unmount()` on the way out, so a screen's listeners exist exactly while
     * the screen is the one on the page. A screen's load registers and nothing
     * more, which is what `index.html`'s script order has always claimed. */
  }
})(typeof window !== 'undefined' ? window : this);

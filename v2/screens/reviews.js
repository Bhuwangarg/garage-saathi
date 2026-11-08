/* Garage Saathi v2 — screen #11, Reviews. Plain script, no module system.
 * Test: test_v2_reviews.js. Spec: docs/v2/plan/screens-money-people.md §3.
 *
 * "Which crew member did this passenger mean, and whose fault was it?" Three
 * things live here: the passenger reviews redBus wrote, the complaint cases,
 * and the typed-name queue that decides who a review is about at all.
 *
 * THIS IS THE OFFICE LOGIN'S WHOLE APP, NEARLY. The office reaches four
 * screens and exists for this one (`v2-ux.md §4.1` #11), which is why the
 * scoping below is written out rather than left to `Caps`: it has been wrong
 * twice, both times by a redaction rule rather than by a missing capability.
 *
 *   db6101f  the office received NO REVIEWS AT ALL, because one check gated the
 *            review stores and the crew documents together. The login whose
 *            only job is reading reviews got what a driver's phone gets.
 *   §18      and then, for a year, every office figure read zero: `redact_for`
 *            stripped `boardAt`, and a date is what every count, every
 *            scorecard and the trace itself are computed from. "Last 7 days 0"
 *            reads as "no complaints". That is the defect, not the dash.
 *
 * SO THIS SCREEN NEVER DRAWS A ZERO IT CANNOT STAND BEHIND. `dateless` below
 * is the whole mechanism: when the reviews this login holds carry no readable
 * boarding time, the screen says the dates are not available to it, in a
 * sentence, once — and the two filters that are computed from a date are
 * ABSENT rather than drawn as nought. See `DECISIONS.md §18`: that decision is
 * PENDING THE OWNER and either answer leaves this screen correct. As of this
 * writing `v2_perms.py`'s FIELD_REDACT no longer strips `boardAt`/`doj` and
 * `test_office.py` asserts the boarding time survives, so the live path is the
 * dated one; if the owner reverses it, nothing here changes.
 *
 * AND IT NEVER NAMES A JOURNEY. No PNR, no ticket id, no seat, no fare, no
 * board point, no date of journey, for ANY role — §3.1's review sheet has no
 * journey block and this file reads no `itslookup`. A desk reading crew
 * performance has no business holding a passenger's travel record, and a
 * control that is absent cannot leak. For the office, where the server has
 * taken those fields out of the record, one line says so at the bottom of the
 * review so a reader stops looking rather than believing the data failed.
 *
 * 4,000 ROWS, WINDOWED, AND THAT IS A MEASUREMENT. `DECISIONS.md §20`: 2,384
 * rows drawn whole cost 410–619 ms on an i9 with sixteen cores, against 7–19 ms
 * windowed. The office runs Core 2 Duos, commonly five to ten times slower, so
 * the whole draw is plausibly seconds there. The list is therefore the ONE-LINE
 * `.v2row` and it windows on `rows × --row-h`, computed from the token and
 * never measured. The consequence the reader has to accept (§3.5): the reason
 * does not fit in the row. It is in the opened review, where there is room for
 * the passenger's words and Claude's evidence.
 *
 * ONE DELEGATED LISTENER, returning early on
 * `closest('input, select, textarea, label, .num')` BEFORE it reads [data-act]
 * or [data-nav] — the search field and the note sheet are both form controls on
 * this screen, and predeploy-gate.sh:1416 checks the ordering statically.
 */
(function (root) {
  'use strict';

  var ID = 'reviews';

  /* The window. 200 rows in the DOM at a time, the number §3.1's count line
   * states out loud, and the number §20 measured as comfortable (~43 ms on the
   * i9 against a 250 ms placeholder). Over the window the list does not cap —
   * it scrolls — because a cap of 200 on a list somebody searches is a list
   * that hides the answer (§3.5). */
  var WINDOW = 200;
  var OVERSCAN = 20;                 // rows kept drawn either side of the window

  /* Claude's own high-confidence picks are the only ones a group confirm will
   * take, and `conf` of anything less puts "Choose the crew member" in the
   * primary button instead. A confident wrong guess that takes one tap to
   * accept is worse than no guess (§3.3). */
  var HIGH = 'high';

  var FIELDS = 'input, select, textarea, label, .num';

  var TABS = ['reviews', 'complaints', 'names'];
  var FILTERS = ['all', 'low', 'conflict', 'untraced'];
  var DATED_FILTERS = ['conflict', 'untraced'];   // computed from a boarding time

  var WORDS = {
    /* The screen's one name, under the id the frame and the nav read
     * (`Caps.SCREENS.reviews.word`), so the nav label, the header and More are
     * one word and not three synonyms. */
    scReviews: { en: 'Reviews', hi: 'रिव्यू' },                 // FROM i18n-hi.js line 85 (coReviewsWord)

    rvTabReviews: { en: 'Reviews', hi: 'रिव्यू' },               // FROM i18n-hi.js line 325 (rvTabReviews)
    rvTabComplaints: { en: 'Complaints', hi: 'शिकायतें' },       // FROM i18n-hi.js line 325 (rvTabComplaints)
    rvTabNames: { en: 'Names to confirm', hi: '' },
    rvAll: { en: 'All', hi: 'सभी' },                            // FROM i18n-hi.js line 325 (rvAll)
    rvLow: { en: 'Low (1–2 stars)', hi: '' },                   // v1's rvLow is 1-3 stars: a different filter, not reused
    rvConflict: { en: 'Conflict', hi: 'फ़र्क' },                 // FROM i18n-hi.js line 325 (rvConflict)
    rvUntraced: { en: 'Untraced', hi: 'बस पता नहीं' },           // FROM i18n-hi.js line 325 (rvUnresolved)
    rvSearch: { en: 'Find a bus, a name or a word', hi: '' },

    /* The twelve short month names as ONE value. Twelve ids would be twelve
     * separate things for the one Hindi speaker on this project to miss
     * (`DECISIONS.md §21`); one string is one translation, and the row's date
     * is `rvDate` so Hindi word order is not English word order. */
    rvMonths: { en: 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec', hi: '' },
    rvDate: { en: '{d} {mon}', hi: '' },
    rvStars: { en: { one: '{n} star', other: '{n} stars' }, hi: '' },
    rvStarUnit: { en: 'star', hi: '' },
    rvCount: { en: '{total} reviews. {shown} shown. Narrow with a filter.', hi: '' },

    rvHead: { en: 'Bus {reg} · {route} · service {svc}', hi: '' },
    rvCrew: { en: 'Crew: {who}', hi: '' },
    rvSeatDriver: { en: 'driver', hi: 'ड्राइवर' },               // FROM i18n-hi.js line 230 (roleDriver)
    rvSeatConductor: { en: 'conductor', hi: 'कंडक्टर' },         // FROM i18n-hi.js line 230 (roleConductor)

    rvReading: { en: "Claude's reading, not a finding.", hi: '' },
    rvFault: { en: 'Fault: {who}', hi: '' },
    rvSafety: { en: 'Safety: {yn}', hi: '' },
    rvYes: { en: 'yes', hi: 'हाँ' },
    rvNo: { en: 'no', hi: 'नहीं' },
    rvSeverity: { en: 'Severity {n} of 3', hi: '' },
    rvWhy: { en: 'Why: {text}', hi: '' },
    rvNotRead: { en: 'Claude has not read this one yet', hi: '' },

    rvNoBus: { en: 'No bus recorded for that service on {date}', hi: '' },
    rvTwoDrivers: { en: 'Two drivers on that bus that night', hi: '' },
    rvWordNotPerson: { en: 'The typed name is a word, not a person', hi: '' },

    rvConfirmOne: { en: 'Yes, {name}', hi: '' },
    rvSomeoneElse: { en: 'Someone else', hi: '' },
    rvNotPerson: { en: 'Not a person', hi: '' },
    rvChoose: { en: 'Choose the crew member', hi: '' },
    rvByClaude: { en: 'Decided by Claude', hi: '' },
    /* The brief's one addition to §3.8, and the reason is in §3.3: one tap
     * spreads a wrong attribution, and `rbalias.history` makes it reversible —
     * so the way back has to be in front of the reader rather than inferred
     * from a badge. One sentence, no new control. */
    rvChangeable: { en: 'A row that Claude decided can be changed here.', hi: '' },
    rvGroup: { en: 'Confirm {n} high-confidence names on {reg}', hi: '' },
    rvLeft: { en: '{n} left on this bus', hi: '' },
    rvEvidence: { en: 'Claude: {name} — {n} nights on this bus', hi: '' },

    rvWriteSaid: { en: 'Write what was said', hi: '' },
    rvLogIncident: { en: 'Log an incident', hi: '' },
    rvWrongCrew: { en: 'This is the wrong crew member', hi: '' },
    rvNoteLabel: { en: 'Office record. {name} never sees this.', hi: '' },
    rvNoteOnce: { en: 'Once saved, this cannot be changed or deleted. Author and time are recorded.', hi: '' },
    rvNoteText: { en: 'What was said', hi: '' },
    rvIncidentWhat: { en: 'What happened', hi: '' },
    /* The four kinds v1 already records. A fifth would be a new value in a
     * field v1 reads to apply a penalty, which is a record-shape change in all
     * but name, so the list is transcribed and not extended. */
    rvIncKind: { en: 'What kind?', hi: '' },
    rvIncScratch: { en: 'Scratch', hi: '' },
    rvIncDent: { en: 'Dent', hi: '' },
    rvIncHarsh: { en: 'Harsh braking', hi: '' },
    rvIncAccident: { en: 'Accident', hi: '' },
    rvSave: { en: 'Save', hi: '' },
    rvSaving: { en: 'Saving...', hi: '' },
    rvSavingN: { en: 'Saving {n}...', hi: '' },
    rvNotSavedYet: { en: 'Not saved until you press Save', hi: '' },

    rvOfficeLine: { en: 'Passenger ticket details are not part of this screen.', hi: '' },
    /* §18, in a sentence. A date this login does not hold is UNKNOWN, and the
     * two filters computed from it are absent rather than zero. */
    rvNoDates: { en: 'Review dates are not available to this login, so the date filters and the trace are not shown.', hi: '' },

    rvEmptyLow: { en: 'No reviews with 1 or 2 stars', hi: '' },
    rvEmptyLowHint: { en: 'Try All, or another month.', hi: '' },
    rvEmptyAll: { en: 'No reviews yet', hi: '' },
    rvEmptyComplaints: { en: 'No complaint cases', hi: '' },
    rvEmptyConflict: { en: 'No reviews where the records disagree', hi: '' },
    /* A zero this screen CAN reach, and the reason the name queue exists. */
    rvEmptyUntraced: { en: 'Every review traces to somebody', hi: '' },
    rvEmptyNames: { en: 'Every name is matched', hi: '' },
    rvEmptyNamesHint: { en: 'Checked just now.', hi: '' },
    rvError: { en: 'Could not read the reviews', hi: '' },
    rvNoNew: { en: 'No new reviews since {time}.', hi: '' },
    /* AND THE SAME SENTENCE WITH NO TIME IN IT. REV-FLOW F6 was `lastSyncAt`
     * seeded to 0 rather than null, so the epoch rendered as a clock time and
     * this read "No new reviews since 05:30" on a device that had never synced.
     * With the honest null the one above renders with an empty slot instead --
     * observed in a real browser as "No new reviews since ." -- which is the
     * same defect with better manners. Two words for the two facts, as on
     * Attention, Money, Jobs, the Job card and People. */
    rvNoNewEver: { en: 'This phone has not sent anything yet.', hi: '' },
    rvNeedsConn: { en: 'Needs a connection', hi: '' },
    rvAskRead: { en: 'Ask Claude to read this', hi: '' },
    rvAskName: { en: 'Ask Claude about this name', hi: '' },

    rvSavedName: { en: 'Name confirmed', hi: '' },
    rvSavedGroup: { en: '{n} names confirmed', hi: '' },
    rvSavedNote: { en: 'Note saved', hi: '' },
    rvSavedIncident: { en: 'Incident logged', hi: '' },
    rvNotSent: { en: 'Not sent. The name is saved on this phone. It will send when there is signal.', hi: '' }
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
    }
    if (n !== undefined && n !== null) s = String(s).replace(/\{n\}/g, String(n));
    return vals ? put(s, vals) : s;
  }

  function caps() { return root.Caps || null; }
  function can(role, cap) { var c = caps(); return !!(c && c.can(role, cap)); }
  function draw(name, size) { return typeof root.icon === 'function' ? root.icon(name, { size: size }) : ''; }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fig(v, o) { return typeof root.figure === 'function' ? root.figure(v, o) : ''; }
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function group(v) { return isNum(v) && root.fmt ? root.fmt.groupIndian(v) : String(v); }

  function rowsOf(m, name) { return (m && m.cache && m.cache[name]) || []; }
  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i];
    return null;
  }
  function nameOf(crew, id) { var c = byId(crew, id); return c ? (c.name || c.id) : ''; }

  function lastSyncAt() {
    var s = root.Sync;
    if (!s || typeof s.info !== 'function') return null;
    try { var i = s.info(); return i && i.lastSyncAt ? i.lastSyncAt : null; } catch (e) { return null; }
  }

  function hhmm(ms) {
    if (!isNum(ms)) return '';
    var d = new Date(ms), h = d.getHours(), mi = d.getMinutes();
    return (h < 10 ? '0' : '') + h + ':' + (mi < 10 ? '0' : '') + mi;
  }

  /* ====================================================================== *
   * THE ID RULE, AND WHY IT IS COPIED HERE
   *
   * `rbalias`'s id IS the record's key: `_guard_rbalias` refuses a push whose
   * id is not `_alias_id(name, regNo)` ("this name and bus already have their
   * own record"), so a screen that writes an alias must build the id exactly as
   * the server does. There are already two copies kept in step by
   * `test_rbalias.py` — `trace.js` and `sync_server.py` — and v2 may not reach
   * outside `v2/` to read the first. So this is a THIRD copy, and
   * test_v2_reviews.js pins it to `trace.js`'s own export rather than to a
   * hand-written expectation: if the rule ever changes, the check names it.
   * ====================================================================== */

  function normReg(s) {
    var r = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    var m = /^([A-Z]{2})(\d{1,2})([A-Z]{1,3})(\d{1,4})$/.exec(r);
    if (!m) return r;
    return m[1] + (m[2].length < 2 ? '0' + m[2] : m[2]) + m[3]
      + new Array(5 - m[4].length).join('0') + m[4];
  }

  function normName(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/^ | $/g, '');
  }

  function aliasId(name, reg) {
    return 'al-' + normReg(reg) + '-' + normName(name).replace(/ /g, '_');
  }

  /* "2026-10-07 06:15:00" (IST wall clock) -> epoch ms, as `trace.js`
   * parseLocal. A boarding time that cannot be read is NULL and not now: a
   * review with an unreadable date is unknown, which is the whole of §18. */
  function parseLocal(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(s || ''));
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)).getTime();
  }

  function dayKey(ts) {
    var d = new Date(ts);
    var mo = d.getMonth() + 1, da = d.getDate();
    return d.getFullYear() + '-' + (mo < 10 ? '0' : '') + mo + '-' + (da < 10 ? '0' : '') + da;
  }

  function dateWords(ts) {
    if (!isNum(ts)) return '';
    var d = new Date(ts);
    var mon = String(say('rvMonths')).split(/\s+/)[d.getMonth()] || '';
    return say('rvDate', { d: d.getDate(), mon: mon });
  }

  /* ====================================================================== *
   * WHO A REVIEW IS ABOUT — the confirmed-name reading, and its limit
   *
   * `rbreviews` carries NO crewId. The real attribution is a seven-store
   * server trace (`crew_trace.index_by_crew`, reached through
   * `_CREW_RV_STORES` at sync_server.py:1365) which also reads `gatechecks`,
   * `dutylog` and `itslookup` — and this screen holds no copy of its answer and
   * must never hold `itslookup` at all.
   *
   * What this screen CAN read is its own domain: the name redBus typed on that
   * bus that night (`rbassign.obs[]`) and the one confirmed answer for that
   * typed name (`rbalias`, status 'crew'). That is exactly the pair the name
   * queue exists to settle, and it is what the row's "· Brijesh" and the
   * Untraced and Conflict filters are. It is the REDPRO VIA ALONE: the server's
   * trace adds the gate check, the duty log and the ITS match, so the server
   * can name somebody this screen cannot. The screen therefore never presents
   * this as the finding — it says who the typed name was confirmed to be, and
   * when nothing is confirmed it says WHY in §3.8's own words rather than
   * drawing a blank.
   *
   * It is also why `Reviews.crewIndex` is not exported. See the block below.
   * ====================================================================== */

  function serviceIndex(services) {
    var ix = {}, i, j, r;
    for (i = 0; i < services.length; i++) {
      if (!services[i] || services[i]._deleted) continue;
      var ids = services[i].routeIds || [];
      for (j = 0; j < ids.length; j++) {
        r = String(ids[j]);
        if (!has(ix, r)) ix[r] = String(services[i].id);
      }
    }
    return ix;
  }

  /* (serviceId, day) -> the observations redPro recorded. Built ONCE per model
   * call, never per row: a per-row scan of `rbassign` is §2.7's forbidden shape
   * multiplied by four thousand. */
  function assignIndex(assign) {
    var ix = {}, i, k;
    for (i = 0; i < assign.length; i++) {
      if (!assign[i] || assign[i]._deleted) continue;
      k = String(assign[i].serviceId) + '|' + String(assign[i].date);
      if (!ix[k]) ix[k] = [];
      ix[k] = ix[k].concat(assign[i].obs || []);
    }
    return ix;
  }

  /* Every live alias by its pair id. The STATUS is read where it matters, in
   * crewForReview: an `unsure` or `generic` alias points at nobody on purpose,
   * and a suggestion (`rbaliasai`) is not an answer at all. */
  function aliasIndex(aliases) {
    var ix = {}, i, a;
    for (i = 0; i < aliases.length; i++) {
      a = aliases[i];
      if (!a || a._deleted) continue;
      ix[a.id] = a;
    }
    return ix;
  }

  var SEATS = [['driver1', 'driver'], ['driver2', 'driver'], ['cro', 'conductor']];

  /* What one review's crew reads as. `reason` is null when somebody is named;
   * otherwise it is one of §3.8's three untraced reasons, because "nobody" and
   * "we did not look" are different sentences. */
  function crewForReview(rv, ix) {
    var out = { crew: [], reg: '', conflict: false, reason: null };
    var at = parseLocal(rv.boardAt);
    if (at === null) {
      // No date, no night, no observation. This is NOT "untraced": it is a
      // field this login was not sent, and the screen says so once in the
      // header rather than four thousand times in the rows (§18).
      out.reason = 'dateless';
      return out;
    }
    var svc = rv.serviceId ? String(rv.serviceId) : ix.route[String(rv.routeId || '')];
    var obs = svc ? (ix.assign[svc + '|' + dayKey(at)] || []) : [];
    if (!obs.length) {
      out.reason = say('rvNoBus', { date: dateWords(at) });
      return out;
    }
    var regs = {}, i, j, o, seat, typed, al, generic = false;
    for (i = 0; i < obs.length; i++) {
      o = obs[i] || {};
      if (o.vehicleNo) regs[normReg(o.vehicleNo)] = o.vehicleNo;
      for (j = 0; j < SEATS.length; j++) {
        seat = SEATS[j];
        typed = o[seat[0]];
        if (!typed || !normName(typed)) continue;
        al = ix.alias[aliasId(typed, o.vehicleNo)];
        if (!al) continue;
        if (al.status !== 'crew' || !al.crewId) { generic = true; continue; }
        if (!pushCrew(out.crew, al.crewId, seat[1], typed, al)) continue;
      }
    }
    var keys = Object.keys(regs);
    out.reg = keys.length ? regs[keys[0]] : '';
    // Two registrations for one service on one night is redPro disagreeing with
    // itself, and two drivers in the same seat is the other half of §3.8's
    // "Two drivers on that bus that night".
    out.conflict = keys.length > 1 || seatTwice(out.crew);
    if (!out.crew.length) out.reason = generic ? say('rvWordNotPerson') : say('rvTwoDrivers');
    else if (out.conflict) out.reason = say('rvTwoDrivers');
    return out;
  }

  function pushCrew(list, crewId, seat, typed, al) {
    for (var i = 0; i < list.length; i++) if (list[i].crewId === crewId) return false;
    list.push({ crewId: crewId, seat: seat, typed: typed, byClaude: al.decidedBy === 'claude' });
    return true;
  }

  function seatTwice(list) {
    var seen = {}, i;
    for (i = 0; i < list.length; i++) {
      if (seen[list[i].seat]) return true;
      seen[list[i].seat] = true;
    }
    return false;
  }

  /* ====================================================================== *
   * Reviews.crewIndex IS NOT EXPORTED, AND THAT IS THE RECORDED ANSWER
   *
   * Today (#1) asks this module for `crewIndex(rows, me, now)` — crewId ->
   * {score, low} — for its "needs a talk" block, and falls back to an error
   * state with a Retry when nobody provides it. The answer, so it is a decision
   * rather than a missing function:
   *
   * IT CANNOT BE BUILT HERE, for three reasons, of which the third is decisive.
   *
   * 1. Two of the trace's seven inputs are withheld from logins that reach this
   *    screen: `itslookup` never reaches the office or the crew manager at all,
   *    and under `DECISIONS.md §18`'s unanswered half `boardAt` may not either.
   *    A client-side index would therefore give a DIFFERENT score per login on
   *    identical data — which is the §18 bug again, one level up, and this time
   *    showing a crew member as worse than they are.
   * 2. It would be a third copy of `resolve()`. `trace.js` and `crew_trace.py`
   *    are kept in step by `test_crew_trace.py` running both on one dataset;
   *    there is no third-copy test, v2 may not read `trace.js`, and porting it
   *    means a file this slice does not own.
   * 3. A score is a SECOND BASIS for "how is this crew member doing". The whole
   *    reason there is one cost basis per bus (`DECISIONS.md §19`) is that two
   *    screens must not show different numbers for one thing; a scoreboard
   *    computed from the redpro via alone, beside the server's `/my/reviews`
   *    computed from all seven, is that failure moved into the people domain.
   *    The confirmed-name reading above is deliberately NOT a score: it answers
   *    "who was this typed name", which is this screen's own question and the
   *    one it writes the answer to.
   *
   * WHAT THE OWNER WOULD HAVE TO FUND, concretely: a manager-scoped read of the
   * index the server ALREADY computes. `crew_reviews_for(user_id)` at
   * sync_server.py:1395 returns exactly this shape for one crew member's own
   * reviews; the funded work is the same memo exposed for the whole roll, role
   * scoped and redaction-aware, plus a device store to cache it in. That is a
   * backend slice and a NEW STORE, and a new store is stage 1 — v2 may not add
   * one (`DECISIONS.md §2`, `v2-foundation-ui.md §7.1` item 13). Until it
   * exists, Today's block correctly draws its error state with a Retry, which
   * is the honest screen: "this device cannot tell" is not "nobody needs a
   * talk".
   * ====================================================================== */

  /* ====================================================================== *
   * THE QUERY
   * ====================================================================== */

  var tab = 'reviews';
  var current = 'all';
  var query = '';
  var first = 0;                     // the window's first row; mount() moves it
  var busFilter = null;              // the name queue, narrowed to one bus
  var openId = null;                 // the review open in the desk panel
  /* The density the last draw used. A click has to know whether it is opening a
   * sheet or filling a panel, and density is the shell's and arrives through
   * the model rather than through a global. */
  var density = 'yard';

  function pick(id) {
    if (TABS.indexOf(String(id)) >= 0 && tab !== String(id)) {
      tab = String(id); first = 0;
      openId = null;                 // the open review is not on the other tab
    }
    return tab;
  }
  function filter(id) {
    if (FILTERS.indexOf(String(id)) >= 0 && current !== String(id)) { current = String(id); first = 0; }
    return current;
  }
  function search(s) {
    if (s !== undefined && s !== null) { query = String(s); first = 0; }
    return query;
  }
  function window_(n) {
    if (isNum(n)) first = Math.max(0, Math.floor(n));
    return first;
  }

  function hit(text, q) { return !q || String(text || '').toLowerCase().indexOf(q) >= 0; }

  function viewRow(rv, ix, crewBank) {
    var c = crewForReview(rv, ix);
    var at = parseLocal(rv.boardAt);
    var who = '';
    for (var i = 0; i < c.crew.length; i++) {
      who += (who ? ', ' : '') + (nameOf(crewBank, c.crew[i].crewId) || c.crew[i].typed);
    }
    return {
      id: rv.id, stars: isNum(rv.stars) ? rv.stars : null,
      reg: c.reg || '', at: at, date: dateWords(at), who: who,
      conflict: c.conflict, traced: !!c.crew.length, dateless: c.reason === 'dateless',
      comment: rv.comment || '', route: routeWords(rv)
    };
  }

  function routeWords(rv) {
    var s = rv.source || '', d = rv.dest || '';
    return s && d ? s + ' → ' + d : (s || d);
  }

  function matches(r, which) {
    if (which === 'low') return r.stars !== null && r.stars <= 2;
    if (which === 'conflict') return r.conflict;
    if (which === 'untraced') return !r.traced && !r.dateless;
    return true;
  }

  /* Newest first. A review with no readable boarding time sorts LAST and keeps
   * its dash: unknown and oldest are not the same thing, and a dateless holding
   * falls back to the id so the order is at least stable. */
  function byDate(a, b) {
    if (a.at === null && b.at === null) return String(a.id).localeCompare(String(b.id));
    if (a.at === null) return 1;
    if (b.at === null) return -1;
    return b.at - a.at || String(a.id).localeCompare(String(b.id));
  }

  /* THE DATE ON A COMPLAINT IS THE CASE'S OWN, NOT THE PASSENGER'S JOURNEY.
   * §3.2 lists `doj` among the journey fields the office must not hold, and
   * `v2_perms.py`'s FIELD_REDACT strips five of the seven — so `doj` arrives
   * and is deliberately not read here. `createdAt` is when redBus opened the
   * case, which is the date a desk reading complaints actually wants. */
  function complaintRow(cp) {
    var at = parseLocal(cp.createdAt);
    return { id: cp.id, caseNumber: cp.caseNumber || cp.id, at: at, date: dateWords(at),
             issue: cp.issue || '', status: cp.status || '', route: routeWords(cp),
             notes: (cp.notes || []).length, resolution: cp.resolution || '',
             refund: cp.refundStatus || '' };
  }

  /* THE NAME QUEUE. One row per typed name per bus, which is one `rbalias`
   * pair id. Two kinds are in it and no others:
   *   - a pair redPro has typed that nobody has answered yet (no `rbalias`, or
   *     one whose status is 'unsure'), and
   *   - a pair CLAUDE answered (`decidedBy: 'claude'`), which stays in the
   *     queue with the badge and the same three buttons, because that is the
   *     one row kind where the undo matters and burying it is how a wrong
   *     attribution spreads (§3.3).
   * A pair a person decided is gone from the queue, which is what lets the
   * count reach zero — and reaching zero is the whole point of the screen
   * (`v2-ux.md §2.3`: 2–6 hours a week, mid 4, second only to the job card). */
  function queueRows(m, ix, crewBank) {
    var assign = rowsOf(m, 'rbassign'), ai = rowsOf(m, 'rbaliasai');
    var aiBy = {}, out = [], seen = {}, i, j, o, seat, typed, pid, al, sug;
    for (i = 0; i < ai.length; i++) if (ai[i] && !ai[i]._deleted) aiBy[ai[i].id] = ai[i];
    for (i = 0; i < assign.length; i++) {
      if (!assign[i] || assign[i]._deleted) continue;
      var obs = assign[i].obs || [];
      for (j = 0; j < obs.length; j++) {
        o = obs[j] || {};
        if (!o.vehicleNo) continue;
        for (var k = 0; k < SEATS.length; k++) {
          seat = SEATS[k];
          typed = o[seat[0]];
          if (!typed || !normName(typed)) continue;
          pid = aliasId(typed, o.vehicleNo);
          if (seen[pid]) continue;
          seen[pid] = true;
          al = ix.alias[pid];
          if (al && al.decidedBy !== 'claude') continue;      // a person has answered it
          sug = aiBy[pid] || null;
          out.push({
            id: pid, typed: typed, reg: o.vehicleNo, role: seat[1],
            byClaude: !!(al && al.decidedBy === 'claude'),
            status: al ? al.status : null,
            crewId: al ? al.crewId : null,
            /* Claude's pick is PRE-FILLED INTO THE LABEL, never pre-committed:
             * the row is not selected and nothing is written until a press.
             * `conf` below 'high' puts "Choose the crew member" in the primary
             * button and the suggestion in the sub-line instead. */
            pick: sug && sug.conf === HIGH && sug.pick ? sug.pick : null,
            pickName: sug && sug.pick ? nameOf(crewBank, sug.pick) : '',
            conf: sug ? sug.conf : null,
            reason: sug ? sug.reason : '',
            nights: sug && isNum(sug.nights) ? sug.nights : null,
            history: al && al.history ? al.history.length : 0
          });
        }
      }
    }
    out.sort(function (a, b) {
      // The confirmable ones first, because the queue is designed for one tap.
      if (!!a.pick !== !!b.pick) return a.pick ? -1 : 1;
      return String(a.reg).localeCompare(String(b.reg)) || String(a.typed).localeCompare(String(b.typed));
    });
    return out;
  }

  function model(m) {
    register();
    var me = (m && m.user) || null;
    var role = me ? String(me.role) : null;
    var loading = !(m && m.cache) || m.cache.rbreviews === undefined;
    var which = pick(m && m.tab);
    var filt = filter(m && m.filter);
    var q = String(m && m.q !== undefined && m.q !== null ? search(m.q) : query).toLowerCase();
    var crewBank = rowsOf(m, 'drivers');
    var ix = { route: {}, assign: {}, alias: {} };
    var rows = [], queue = [], complaints = [], dateless = false, reviews = [], i;

    if (!loading) {
      ix.route = serviceIndex(rowsOf(m, 'rbservices'));
      ix.assign = assignIndex(rowsOf(m, 'rbassign'));
      ix.alias = aliasIndex(rowsOf(m, 'rbalias'));
      var raw = rowsOf(m, 'rbreviews');
      for (i = 0; i < raw.length; i++) {
        if (!raw[i] || raw[i]._deleted) continue;
        reviews.push(viewRow(raw[i], ix, crewBank));
      }
      /* THE §18 TEST, and it is deliberately "no review has a date" rather
       * than "this one has none". One review missing its boarding time is one
       * unknown figure; EVERY review missing it is a statement about the login,
       * and the difference is a dash against a sentence. An empty holding says
       * nothing either way, so it is not dateless. */
      dateless = reviews.length > 0;
      for (i = 0; i < reviews.length; i++) if (reviews[i].at !== null) { dateless = false; break; }

      var cps = rowsOf(m, 'rbcomplaints');
      for (i = 0; i < cps.length; i++) {
        if (!cps[i] || cps[i]._deleted) continue;
        complaints.push(complaintRow(cps[i]));
      }
      complaints.sort(byDate);
      if (can(role, 'manageDrivers')) queue = queueRows(m, ix, crewBank);
    }

    density = (m && m.density) || 'yard';
    var pool = which === 'complaints' ? complaints : reviews;
    var picked = [];
    for (i = 0; i < pool.length; i++) {
      if (which === 'reviews' && !matches(pool[i], filt)) continue;
      if (q && !rowHit(pool[i], q)) continue;
      picked.push(pool[i]);
    }
    if (which !== 'complaints') picked.sort(byDate);

    var qrows = queue;
    if (busFilter) {
      qrows = [];
      for (i = 0; i < queue.length; i++) if (normReg(queue[i].reg) === normReg(busFilter)) qrows.push(queue[i]);
    }

    var total = which === 'names' ? qrows.length : picked.length;
    var start = Math.max(0, Math.min(first, Math.max(0, total - 1)));
    var end = Math.min(total, start + WINDOW + OVERSCAN);

    return {
      loading: loading, role: role, me: me, tab: which, filter: filt, q: q,
      density: density,
      // The desk panel. Only built where there is a column to put it in.
      panel: density === 'desk' && openId && !loading ? openView(m, openId) : null,
      offline: !!(m && m.offline), stale: !!(m && m.stale), at: lastSyncAt(),
      // The shell passes this when the device could not read the stores at all.
      error: !!(m && m.error),
      dateless: dateless,
      // A tab a person may not use is ABSENT, never disabled (§3.7).
      tabs: can(role, 'manageDrivers') ? TABS : TABS.slice(0, 2),
      /* Conflict and Untraced are computed from a boarding time, so without one
       * they are absent rather than a pair of zeroes. This is §18's "say
       * plainly that dates are not available rather than showing zero", in the
       * shape a filter row can carry it. */
      filters: dateless ? undated(FILTERS) : FILTERS,
      mayName: can(role, 'manageDrivers'),
      mayNote: can(role, 'crewNote'),
      mayIncident: can(role, 'logIncident'),
      rows: which === 'names' ? qrows.slice(start, end) : picked.slice(start, end),
      first: start, before: start, after: Math.max(0, total - end),
      total: total, windowed: total > WINDOW + OVERSCAN,
      names: total, busFilter: busFilter,
      queueTotal: can(role, 'manageDrivers') ? (loading ? null : queue.length) : null,
      reviewTotal: loading ? null : reviews.length,
      complaintTotal: loading ? null : complaints.length,
      highOnBus: highOn(qrows)
    };
  }

  // The filters left once the ones computed from a boarding time are taken out.
  function undated(list) {
    var out = [], i;
    for (i = 0; i < list.length; i++) if (DATED_FILTERS.indexOf(list[i]) < 0) out.push(list[i]);
    return out;
  }

  function rowHit(r, q) {
    return hit(r.reg, q) || hit(r.who, q) || hit(r.comment, q) || hit(r.date, q)
      || hit(r.route, q) || hit(r.issue, q) || hit(r.caseNumber, q) || hit(r.typed, q)
      || hit(r.pickName, q);
  }

  /* The group confirm, per bus: only Claude's HIGH-confidence picks, and only
   * when there are at least two — one row does not need a group. */
  function highOn(qrows) {
    var by = {}, i, k, out = null, best = 0;
    for (i = 0; i < qrows.length; i++) {
      if (!qrows[i].pick || qrows[i].byClaude) continue;
      k = qrows[i].reg;
      if (!by[k]) by[k] = [];
      by[k].push(qrows[i].id);
    }
    for (k in by) if (has(by, k) && by[k].length > best && by[k].length > 1) { best = by[k].length; out = { reg: k, ids: by[k] }; }
    return out;
  }

  /* ====================================================================== *
   * render
   * ====================================================================== */

  function tabsOf(v) {
    var label = { reviews: 'rvTabReviews', complaints: 'rvTabComplaints', names: 'rvTabNames' };
    var count = { reviews: v.reviewTotal, complaints: v.complaintTotal, names: v.queueTotal };
    var out = '', i, id;
    for (i = 0; i < v.tabs.length; i++) {
      id = v.tabs[i];
      /* The count is `figure(null)` while it reads, which is a dash — because
       * "14 names to confirm" and "0 names to confirm" must not look alike for
       * the second the device is still filling (§3.6). */
      out += '<button type="button" role="tab" aria-selected="' + (id === v.tab ? 'true' : 'false') + '"'
        + ' data-tab="' + id + '">' + esc(say(label[id])) + ' '
        + fig(v.loading ? null : count[id], { format: group }) + '</button>';
    }
    return '<div class="tabs rv-tabs" role="tablist">' + out + '</div>';
  }

  function filtersOf(v) {
    if (v.tab !== 'reviews') return '';
    var label = { all: 'rvAll', low: 'rvLow', conflict: 'rvConflict', untraced: 'rvUntraced' };
    var out = '', i, id;
    for (i = 0; i < v.filters.length; i++) {
      id = v.filters[i];
      out += '<button type="button" role="tab" aria-selected="' + (id === v.filter ? 'true' : 'false') + '"'
        + ' data-filter="' + id + '">' + esc(say(label[id])) + '</button>';
    }
    return '<div class="tabs rv-filters" role="tablist">' + out + '</div>';
  }

  function searchField(v) {
    return '<label class="rv-find"><span class="rv-find-i">' + draw('search', 20) + '</span>'
      + '<input class="field" type="search" autocomplete="off" data-rv-find'
      + ' placeholder="' + esc(say('rvSearch')) + '" value="' + esc(v.q) + '"></label>';
  }

  /* The freshness line, and the ONLY place on this screen an age appears. A
   * list states its freshness ONCE in its header: `at` on a figure inside a row
   * adds `.figure-note` as a block element, triples the row height and runs the
   * age words once per row — and this list has four thousand rows.
   *
   * The collector is server-side, so offline this says "No new reviews since
   * 06:40" rather than implying the list is complete (§3.6). */
  function head(v) {
    if (v.loading) {
      return '<p class="rv-fresh">' + esc(typeof root.w === 'function' ? root.w('loading') : '') + '</p>';
    }
    var count = fig(v.tab === 'names' ? v.queueTotal : (v.tab === 'complaints' ? v.complaintTotal : v.reviewTotal),
                    { at: v.offline ? null : v.at, stale: v.stale, format: group });
    var when = hhmm(v.at);
    var tail = v.offline
      ? ' <span class="rv-off">' + draw('offline', 14) + ' '
        + esc(when === '' ? say('rvNoNewEver') : say('rvNoNew', { time: when })) + '</span>'
      : '';
    var dates = v.dateless
      ? '<p class="rv-note">' + draw('alert', 16) + ' ' + esc(say('rvNoDates')) + '</p>'
      : '';
    return '<p class="rv-fresh">' + count + tail + '</p>' + dates;
  }

  /* THE ONE-LINE ROW, and it is one line at BOTH densities because that is what
   * windowing needs: a row whose height is not `--row-h` cannot be positioned
   * from `rows × --row-h` without measuring it, and nothing here measures a row
   * (`v2-foundation-ui.md §2.3` rules 2 and 6).
   *
   * `.act` carries exactly one thing, the stars, and NO `at`. */
  function reviewRows(v) {
    var out = '', i, r, t;
    for (i = 0; i < v.rows.length; i++) {
      r = v.rows[i];
      /* Joined from the parts that EXIST. The separator used to be written in by hand between the
       * stars and the bus, so a review whose bus was never traced -- which is most of them until the
       * duty log catches up -- drew "1 star -  - 7 Nov" with a separator standing either side of
       * nothing. A dangling separator reads as a value that failed to load, and this row already has
       * little enough on it. The date keeps its em dash when it is unknown: that IS the value. */
      t = esc([r.stars === null ? null : say('rvStars', null, r.stars),
               r.reg || null,
               r.date || '—',
               r.who || null].filter(function (x) { return x; }).join(' · '));
      out += '<button class="v2row rv-row" type="button" data-review="' + esc(r.id) + '">'
        + '<span class="lead">' + draw('star', v.density === 'desk' ? 16 : 20) + '</span>'
        + '<span class="t">' + t + '</span>'
        + '<span class="act">' + fig(r.stars, { unit: say('rvStarUnit') }) + '</span></button>';
    }
    return out;
  }

  function complaintRows(v) {
    var out = '', i, r;
    for (i = 0; i < v.rows.length; i++) {
      r = v.rows[i];
      out += '<button class="v2row rv-row" type="button" data-case="' + esc(r.id) + '">'
        + '<span class="lead">' + draw('review', v.density === 'desk' ? 16 : 20) + '</span>'
        + '<span class="t">' + esc(r.caseNumber + ' · ' + (r.date || '—')
          + (r.issue ? ' · ' + r.issue : '')) + '</span>'
        + '<span class="act"><span class="badge badge-warn">' + draw('alert', 14) + ' '
        + esc(r.status || '') + '</span></span></button>';
    }
    return out;
  }

  /* A WINDOWED LIST IS A ONE-LINE LIST. The evidence sub-line is §3.3's yard
   * extra, and it is drawn only while the queue is small enough not to window:
   * a row that is sometimes two lines cannot be positioned from
   * `rows x --row-h` without measuring it, and nothing here measures a row. */
  function queueRowsHtml(v) {
    var oneLine = v.windowed || v.density === 'desk';
    var out = '', i, r, primary, sub;
    for (i = 0; i < v.rows.length; i++) {
      r = v.rows[i];
      primary = r.pick
        ? say('rvConfirmOne', { name: r.pickName || r.typed })
        : say('rvChoose');
      sub = r.nights !== null && r.pickName
        ? say('rvEvidence', { name: r.pickName }, r.nights)
        : (r.reason || '');
      out += '<div class="v2row rv-q" data-pair="' + esc(r.id) + '">'
        + '<span class="lead">' + draw('person', v.density === 'desk' ? 16 : 20) + '</span>'
        + '<span class="t">' + esc('"' + r.typed + '"  ·  ' + r.reg + '  ·  '
          + say(r.role === 'conductor' ? 'rvSeatConductor' : 'rvSeatDriver')) + '</span>'
        + (oneLine || !sub ? '' : '<span class="sub">' + esc(sub) + '</span>')
        + '<span class="act">'
        + (r.byClaude ? '<span class="badge badge-warn">' + draw('alert', 14) + ' '
            + esc(say('rvByClaude')) + '</span>' : '')
        + '<button type="button" class="btn btn-primary" data-act="rvConfirm"'
        + (r.pick ? ' data-crew="' + esc(r.pick) + '"' : '') + '>' + esc(primary) + '</button>'
        + '<button type="button" class="btn" data-act="rvElse">' + esc(say('rvSomeoneElse')) + '</button>'
        + '<button type="button" class="btn btn-quiet" data-act="rvGeneric">'
        + esc(say('rvNotPerson')) + '</button>'
        + '</span></div>';
    }
    return out;
  }

  /* THE WINDOW. The spacing above and below is `rows × --row-h` in a `calc()`,
   * so it follows the density token and no px literal is written by hand —
   * and, more to the point, nothing is measured to compute it (§20, §3.5). */
  function windowed(v, inner) {
    if (!v.windowed) return inner;
    return '<div class="rv-win" style="padding: calc(var(--row-h) * ' + v.before
      + ') 0 calc(var(--row-h) * ' + v.after + ')">' + inner + '</div>';
  }

  function countLine(v) {
    if (!v.windowed) return '';
    return '<p class="rv-count">' + esc(say('rvCount', { total: group(v.total), shown: WINDOW })) + '</p>';
  }

  function empty(v) {
    if (typeof root.emptyState !== 'function') return '';
    if (v.tab === 'names') {
      // THE STATE THE SCREEN EXISTS TO REACH.
      return root.emptyState(say('rvEmptyNames'), { icon: 'ok', hint: say('rvEmptyNamesHint') });
    }
    if (v.tab === 'complaints') return root.emptyState(say('rvEmptyComplaints'), { icon: 'review' });
    // The filter is NAMED in the empty line, so the reader knows what to undo.
    if (v.filter === 'low') {
      return root.emptyState(say('rvEmptyLow'), { icon: 'star', hint: say('rvEmptyLowHint') });
    }
    if (v.filter === 'conflict') {
      return root.emptyState(say('rvEmptyConflict'), { icon: 'ok', hint: say('rvEmptyLowHint') });
    }
    if (v.filter === 'untraced') {
      return root.emptyState(say('rvEmptyUntraced'), { icon: 'ok', hint: say('rvEmptyNamesHint') });
    }
    return root.emptyState(say('rvEmptyAll'), { icon: 'star' });
  }

  /* "Ask Claude to read this" and "Ask Claude about this name" are the two
   * things on this screen that need the server: everything else — the reviews,
   * the complaints, the aliases and Claude's stored readings — is a local
   * record and works offline. So offline they are ABSENT, with the line saying
   * why, rather than a button that fails when pressed (§3.6). */
  function ask(v, which) {
    if (v.offline) {
      return '<p class="rv-note">' + draw('offline', 16) + ' ' + esc(say('rvNeedsConn')) + '</p>';
    }
    return '<button type="button" class="btn btn-quiet" data-act="' + which + '">'
      + esc(say(which === 'rvAskRead' ? 'rvAskRead' : 'rvAskName')) + '</button>';
  }

  function body(v) {
    if (v.loading) return typeof root.skeleton === 'function' ? root.skeleton(12) : '';
    /* The list could not be read at all: a named refusal with a reason and a
     * Retry, never a dialog about a clock and never an empty list pretending
     * there are none (`v2-contract.md §4.0`). */
    if (v.error) {
      return typeof root.errorState === 'function' ? root.errorState(say('rvError'), redraw) : '';
    }
    /* Offline KEEPS the rows: reviews, complaints, aliases and Claude's stored
     * readings are local records and they are real. Only their age is in
     * question and the header carries that. `offlineState` replaces the list
     * only when there is no local data at all. */
    if (!v.total && v.offline) {
      return typeof root.offlineState === 'function' ? root.offlineState() : '';
    }
    if (!v.total) return empty(v);
    if (v.tab === 'names') {
      /* §3.7: the group confirm is `aria-disabled` UNTIL the rows it will write
       * are the list — which is the one place on this screen aria-disabled is
       * not a write in flight. It is in the markup and not only in the handler,
       * so a reader with a screen reader hears it too. */
      var grp = v.highOnBus
        ? '<button type="button" class="btn rv-group" data-act="rvGroup"'
          + (v.busFilter === v.highOnBus.reg ? '' : ' aria-disabled="true"')
          + ' data-reg="' + esc(v.highOnBus.reg) + '">'
          + esc(say('rvGroup', { reg: v.highOnBus.reg }, v.highOnBus.ids.length)) + '</button>'
        : '';
      return windowed(v, queueRowsHtml(v)) + grp + countLine(v) + ask(v, 'rvAskName');
    }
    var inner = v.tab === 'complaints' ? complaintRows(v) : reviewRows(v);
    return windowed(v, inner) + countLine(v);
  }

  /* The queue's two standing lines sit ABOVE the scroll container and not
   * inside it: anything drawn above the window inside `.rv-list` shifts
   * scrollTop off the row grid, and the window's offset is `scrollTop /
   * --row-h` with nothing measured to correct it. */
  function queueHead(v) {
    if (v.tab !== 'names' || v.loading || !v.total) return '';
    return '<p class="rv-note">' + esc(say('rvChangeable')) + '</p>'
      + (v.busFilter ? '<p class="rv-count">' + esc(say('rvLeft', null, v.total)) + '</p>' : '');
  }

  function render(m) {
    var v = model(m);
    return '<div class="rv">' + head(v) + tabsOf(v) + filtersOf(v) + searchField(v) + queueHead(v)
      + '<div class="rv-list" data-rv-scroll>' + body(v) + '</div>'
      + (v.panel ? '<div class="rv-panel">' + v.panel.html + '</div>' : '')
      + '</div>';
  }

  /* ====================================================================== *
   * THE OPENED REVIEW — a sheet at yard, a panel at desk, same markup
   *
   * NO JOURNEY BLOCK. §3.1's sheet is the bus, the route, the service, the
   * crew, the passenger's words, Claude's reading and the buttons — and that is
   * the whole of it, for every role. No PNR, no ticket id, no seat, no fare, no
   * board point, no date of journey, and no label naming one. There is no
   * "look up this ticket" control to gate, because there is no lookup.
   *
   * Where the office's record HAS had those fields taken out, one line says so,
   * once, at the bottom (§3.2) — keyed on the record's own `_redacted` mark
   * first and the role second, so it follows the data rather than a guess about
   * who is reading.
   * ====================================================================== */

  function reviewSheet(rv, ai, crewLine, opts) {
    opts = opts || {};
    var body2 = '<p class="drow">' + esc(say('rvHead', {
      reg: rv.reg || '', route: rv.route || '', svc: rv.serviceId || rv.routeId || ''
    })) + '</p>'
      + '<p class="drow">' + esc(say('rvCrew', { who: crewLine || '' })) + '</p>'
      + '<blockquote class="card rv-said">' + esc(rv.comment || '') + '</blockquote>'
      + readingCard(ai)
      + (opts.ai ? '' : (opts.ask || ''))
      + (opts.mayNote ? '<button type="button" class="btn btn-primary" data-act="rvNote">'
          + esc(say('rvWriteSaid')) + '</button>' : '')
      + (opts.mayIncident ? '<button type="button" class="btn" data-act="rvIncident">'
          + esc(say('rvLogIncident')) + '</button>' : '')
      + (opts.mayName ? '<button type="button" class="btn btn-quiet" data-act="rvWrongCrew"'
          + ' data-reg="' + esc(rv.reg || '') + '">' + esc(say('rvWrongCrew')) + '</button>' : '')
      + (opts.redacted ? '<p class="rv-note">' + esc(say('rvOfficeLine')) + '</p>' : '');
    return '<div class="rv-sheet">' + body2 + '</div>';
  }

  /* Claude's reading, with three rules and no fourth. Labelled "Claude's
   * reading, not a finding."; the EVIDENCE SENTENCE beside the verdict, never
   * the verdict alone; and the Hindi taken from the record's own `hi` rather
   * than translated here.
   *
   * A reading that is missing keeps the review and says so. Never a blank card
   * and never a fabricated verdict (§3.6).
   *
   * There is NOWHERE TO RECORD "Claude was wrong about fault", and that is
   * named rather than quietly dropped (§3.4): `rbreviewai` is
   * SERVER_INGEST_ONLY and v2 may add neither a field nor a store. So a
   * disagreement is recorded through what exists — a conversation note, an
   * incident, or reassigning the crew member — and the buttons above say so in
   * their own words instead of an "I disagree" control that writes nothing. */
  function readingCard(ai) {
    if (!ai) {
      return '<div class="card rv-read"><p class="drow">' + esc(say('rvNotRead')) + '</p></div>';
    }
    var hi = typeof root.document !== 'undefined' && root.document && root.document.documentElement
      && String(root.document.documentElement.lang || '').toLowerCase().indexOf('hi') === 0;
    var why = hi ? (ai.hi || ai.en || '') : (ai.en || '');
    var faults = (ai.faults || []).join(', ');
    var topics = (ai.topics || []).join(', ');
    return '<div class="card rv-read">'
      + '<p class="drow rv-label">' + esc(say('rvReading')) + '</p>'
      + '<p class="drow">' + esc(say('rvFault', { who: faults })
        + (topics ? ' · ' + topics : '')
        + ' · ' + say('rvSafety', { yn: say(ai.safety ? 'rvYes' : 'rvNo') })
        + ' · ' + say('rvSeverity', null, isNum(ai.severity) ? ai.severity : 0)) + '</p>'
      + (why ? '<p class="drow">' + esc(say('rvWhy', { text: why })) + '</p>' : '')
      + '</div>';
  }

  /* The conversation-note sheet. The label is the same as People's, in the same
   * words, and it is drawn ABOVE the box: the reader has to know what kind of
   * writing this is before they write ([E] 4a42e38, §2.6). Append-only in the
   * store, so there is no edit and no delete control — absent, not disabled —
   * and the sheet says so before the text box. */
  function noteSheet(who, crewId) {
    return '<form class="rv-note-sheet" data-sheet="rvnote" data-crew="' + esc(crewId || '') + '">'
      + '<p class="rv-label">' + esc(say('rvNoteLabel', { name: who || '' })) + '</p>'
      + '<p class="drow">' + esc(say('rvNoteOnce')) + '</p>'
      + '<label class="num"><span class="num-l">' + esc(say('rvNoteText')) + '</span>'
      + '<textarea class="field" rows="4" data-field="text"></textarea></label>'
      + '<p class="drow">' + esc(say('rvNotSavedYet')) + '</p>'
      /* §3.7: aria-disabled until there IS text, which is a write that cannot
       * be made yet rather than one the person may not make — so this one is a
       * disabled control and not an absent one. The label keeps saying Save,
       * because nothing is happening. */
      + '<button type="button" class="btn btn-primary" aria-disabled="true" data-act="rvNoteSave">'
      + esc(say('rvSave')) + '</button></form>';
  }

  function incidentSheet(crewId, busId) {
    var kinds = [['scratch', 'rvIncScratch'], ['dent', 'rvIncDent'],
                 ['harsh-brake', 'rvIncHarsh'], ['accident', 'rvIncAccident']], opts = '', i;
    for (i = 0; i < kinds.length; i++) {
      opts += '<option value="' + kinds[i][0] + '">' + esc(say(kinds[i][1])) + '</option>';
    }
    return '<form class="rv-inc-sheet" data-sheet="rvinc" data-crew="' + esc(crewId || '') + '"'
      + ' data-bus="' + esc(busId || '') + '">'
      + '<label class="num"><span class="num-l">' + esc(say('rvIncKind')) + '</span>'
      + '<select class="select" data-field="type">' + opts + '</select></label>'
      + '<label class="num"><span class="num-l">' + esc(say('rvIncidentWhat')) + '</span>'
      + '<textarea class="field" rows="3" data-field="note"></textarea></label>'
      + '<p class="drow">' + esc(say('rvNotSavedYet')) + '</p>'
      + '<button type="button" class="btn btn-primary" aria-disabled="true" data-act="rvIncSave">'
      + esc(say('rvSave')) + '</button></form>';
  }

  /* "Someone else": that bus's own crew FIRST, then the whole roll. The bus's
   * crew comes from what redPro observed on that bus, which is the evidence the
   * reader already has in front of them. */
  function chooseSheet(pairId, crewBank, onBus) {
    var out = '', i, seen = {};
    for (i = 0; i < (onBus || []).length; i++) {
      if (seen[onBus[i]]) continue;
      seen[onBus[i]] = true;
      out += '<button type="button" class="v2row" data-act="rvPickCrew" data-pair="' + esc(pairId) + '"'
        + ' data-crew="' + esc(onBus[i]) + '"><span class="lead">' + draw('bus', 20) + '</span>'
        + '<span class="t">' + esc(nameOf(crewBank, onBus[i]) || onBus[i]) + '</span></button>';
    }
    for (i = 0; i < (crewBank || []).length; i++) {
      if (!crewBank[i] || crewBank[i]._deleted || seen[crewBank[i].id]) continue;
      out += '<button type="button" class="v2row" data-act="rvPickCrew" data-pair="' + esc(pairId) + '"'
        + ' data-crew="' + esc(crewBank[i].id) + '"><span class="lead">' + draw('person', 20) + '</span>'
        + '<span class="t">' + esc(crewBank[i].name || crewBank[i].id) + '</span></button>';
    }
    return '<div class="rv-choose">' + out + '</div>';
  }

  /* ====================================================================== *
   * THE WRITES. `rbalias` only, and only four fields on it: `status`,
   * `crewId`, `decidedBy`, `decidedAt`. A human write STRIPS Claude's `auto`,
   * `reason` and `evidence`, as v1 already does and as `_guard_rbalias`
   * enforces — and the server keeps the previous answer in `history` (last 20),
   * which is what makes every one of these reversible. NO NEW FIELD.
   * ====================================================================== */

  function aliasRecord(pair, status, crewId, me) {
    return {
      id: pair.id, name: pair.typed, regNo: pair.reg, role: pair.role,
      status: status, crewId: status === 'crew' ? crewId : null,
      decidedBy: me && me.id ? me.id : null, decidedAt: Date.now()
    };
  }

  /* ====================================================================== *
   * ONE delegated listener
   * ====================================================================== */

  var handler = null;
  var scroller = null;

  /* THE STORES THIS SCREEN READS, and six of the nine are in no load list in
   * all of v2 — REV-FLOW F3 on this screen. Measured on the owner's Reviews:
   * `Complaints 0` and `Names to confirm 0`, drawn as HARD ZEROS over
   * `rbcomplaints` and `rbalias` that nothing had ever asked IndexedDB for.
   * Those two counts reaching a real zero is the point of the screen, so a
   * zero that means "never read" is the whole of §4.1 #7 in two numbers.
   *
   * `crewnotes` is written here (the office's conversation log) and `buses` and
   * `drivers` are read for names; both of the latter are in FIRST_STORES and
   * are in this list anyway, because what a screen reads is one list and not
   * two. `itslookup` is NOT here and must never be: the comment above
   * `aliasIndex` says why. */
  var STORES = ['rbservices', 'rbreviews', 'rbcomplaints', 'rbassign', 'rbalias',
                'rbreviewai', 'rbaliasai', 'buses', 'drivers', 'incidents', 'crewnotes'];

  /* The read, and the only place this screen asks IndexedDB for anything. From
   * `mount()` and nowhere else; the `.then` is what puts the rows on screen
   * without waiting for `boot.js`'s next four-second tick, and `loading` keeps
   * a mount that lands mid-read from stacking a second one over the first. */
  var loading = false;

  function load() {
    var c = root.Cache;
    if (loading || !c || typeof c.load !== 'function') return null;
    loading = true;
    return c.load(STORES).then(function () { loading = false; reread(); },
                               function () { loading = false; });
  }

  // Only while this is still the screen on the page.
  function reread() {
    var R = root.Router;
    var c = R && R.current ? R.current() : null;
    if (!c || c.id !== ID) return;
    redraw();
  }

  function mount() {
    // The read is the first statement, above the listener guard. `duty.js`'s
    // mount says why the position and not the guard is the point.
    load();
    if (handler) return handler;
    handler = onClick;
    if (root.document && typeof root.document.addEventListener === 'function') {
      root.document.addEventListener('click', handler);
      /* The search box and the scroll container are the two things a click
       * listener cannot carry. Both are registered here rather than inline, so
       * the click path stays the single delegated listener the gate checks. */
      root.document.addEventListener('input', onInput);
      scroller = onScroll;
      root.document.addEventListener('scroll', scroller, true);
    }
    return handler;
  }

  /* The other half of `mount()`, and INTEGRATION-NOTES 17's step 2. `Shell.mount`
   * calls it when it mounts a different screen, so what `mount()` added comes
   * off exactly when this screen stops being the one on the page.
   *
   * It removes the SAME function reference `mount()` registered — every handler
   * here is a named module-level function for that reason: `removeEventListener`
   * matches on identity, and a fresh closure per mount would remove nothing
   * while looking exactly like this. `handler` goes back to null with it, or the
   * screen would never re-arm. */
  function unmount() {
    var d = root.document;
    if (handler && d && typeof d.removeEventListener === 'function') {
      d.removeEventListener('click', handler);
      d.removeEventListener('input', onInput);
      /* `true` AGAIN. The scroll listener was registered in the CAPTURE phase,
       * and a removal that leaves the third argument off is matching a
       * different listener: it removes nothing and reports nothing. */
      if (scroller) d.removeEventListener('scroll', scroller, true);
    }
    handler = null;
    scroller = null;
    return true;
  }

  function onClick(ev) {
    var t = ev && ev.target;
    if (!t || typeof t.closest !== 'function') return;

    /* THE EARLY RETURN, before [data-act] or [data-nav] is read. The search
     * field is a form control on every state of this screen and the note sheet
     * is another; a field whose click reached the row handler is what threw the
     * storekeeper off the screen mid-count (predeploy-gate.sh:1416). */
    if (t.closest(FIELDS)) return;

    var el = t.closest('[data-act]');
    if (el) return act(ev, el.getAttribute('data-act'), el);

    var tb = t.closest('[data-tab]');
    if (tb) {
      // A tab changes what is drawn and NEVER pushes a route: a back press must
      // leave the screen, not walk back through tabs.
      if (ev.preventDefault) ev.preventDefault();
      pick(tb.getAttribute('data-tab'));
      return redraw();
    }
    var fl = t.closest('[data-filter]');
    if (fl) {
      if (ev.preventDefault) ev.preventDefault();
      filter(fl.getAttribute('data-filter'));
      return redraw();
    }
    var rv = t.closest('[data-review]');
    if (rv) {
      if (ev.preventDefault) ev.preventDefault();
      return openReview(rv.getAttribute('data-review'));
    }
    var cs = t.closest('[data-case]');
    if (cs) {
      if (ev.preventDefault) ev.preventDefault();
      return openCase(cs.getAttribute('data-case'));
    }
  }

  function act(ev, what, el) {
    if (ev && ev.preventDefault) ev.preventDefault();
    if (what === 'rvConfirm') return confirmPair(el);
    if (what === 'rvGeneric') return genericPair(el);
    if (what === 'rvElse') return openChoose(el);
    if (what === 'rvPickCrew') return pickCrew(el);
    if (what === 'rvGroup') return groupConfirm(el);
    if (what === 'rvNote') return openNote(el);
    if (what === 'rvNoteSave') return saveNote(el);
    if (what === 'rvIncident') return openIncident(el);
    if (what === 'rvIncSave') return saveIncident(el);
    if (what === 'rvAskRead') return askServer(el, 'aiReviews');
    if (what === 'rvAskName') return askServer(el, 'aiNames');
    if (what === 'rvWrongCrew') {
      // Jumps to the name queue filtered to that bus. Still this screen, so
      // still not a route.
      busFilter = el.getAttribute('data-reg') || null;
      pick('names');
      if (root.V2 && root.V2.closeSheet) root.V2.closeSheet();
      return redraw();
    }
  }

  function onInput(ev) {
    var t = ev && ev.target;
    if (!t || typeof t.getAttribute !== 'function') return;
    if (t.getAttribute('data-rv-find') !== null) {
      search(t.value);
      return redraw();
    }
    /* A sheet's Save becomes pressable the moment there is something to save.
     * No redraw: a sheet redrawn under a typing hand loses what was typed, and
     * §3.6's "Not saved until you press Save" is only true if the text stays. */
    if (t.getAttribute('data-field') !== null) armSave(t);
  }

  function armSave(field) {
    var form = typeof field.closest === 'function' ? field.closest('[data-sheet]') : null;
    if (!form || typeof form.querySelector !== 'function') return;
    var text = form.querySelector('textarea[data-field]');
    var save = form.querySelector('[data-act="rvNoteSave"], [data-act="rvIncSave"]');
    if (!save) return;
    if (text && String(text.value || '').trim()) save.removeAttribute('aria-disabled');
    else save.setAttribute('aria-disabled', 'true');
  }

  /* The window moves on scroll, and `--row-h` is read ONCE off the container —
   * not once per row. Measuring a row is the rule this screen would break
   * first and it is the rule windowing cannot survive. */
  function onScroll(ev) {
    var el = ev && ev.target;
    if (!el || typeof el.getAttribute !== 'function') return;
    if (el.getAttribute('data-rv-scroll') === null) return;
    var h = rowHeight(el);
    if (!(h > 0)) return;
    var want = Math.max(0, Math.floor(el.scrollTop / h) - OVERSCAN);
    if (want === first) return;
    window_(want);
    redraw();
  }

  function rowHeight(el) {
    var g = root.getComputedStyle;
    if (typeof g !== 'function') return 0;
    try { return parseFloat(g(el).getPropertyValue('--row-h')) || 0; } catch (e) { return 0; }
  }

  function redraw() {
    if (root.Shell && typeof root.Shell.mount === 'function') root.Shell.mount(ID, null);
  }

  function state() { return root.S || null; }
  function cacheOf(name) { var s = state(); return (s && s.cache && s.cache[name]) || []; }

  function indexes() {
    return { route: serviceIndex(cacheOf('rbservices')), assign: assignIndex(cacheOf('rbassign')),
             alias: aliasIndex(cacheOf('rbalias')) };
  }

  /* Which crew member and which bus the OPEN review is about, so the note and
   * incident sheets write against the person the reader is looking at rather
   * than asking them to pick the name again. */
  var openCrewId = null;
  var openBusId = null;

  /* THE OPENED REVIEW, BUILT ONCE FOR BOTH PLACES IT IS DRAWN. §3.1: at yard it
   * is a sheet and at desk it is a panel in the remaining column — "same
   * markup, no <dialog>, because at desk the list and the review are read
   * together". One builder, so the two cannot drift. */
  function openView(m, id) {
    var rec = byId(rowsOf(m, 'rbreviews'), id);
    if (!rec) return null;
    var ix = { route: serviceIndex(rowsOf(m, 'rbservices')), assign: assignIndex(rowsOf(m, 'rbassign')),
               alias: aliasIndex(rowsOf(m, 'rbalias')) };
    var crewBank = rowsOf(m, 'drivers');
    var c = crewForReview(rec, ix);
    var line = '', i;
    for (i = 0; i < c.crew.length; i++) {
      line += (line ? ' \u00b7 ' : '') + (nameOf(crewBank, c.crew[i].crewId) || c.crew[i].typed)
        + ' (' + say(c.crew[i].seat === 'conductor' ? 'rvSeatConductor' : 'rvSeatDriver') + ')';
    }
    if (!line) line = c.reason === 'dateless' ? say('rvNoDates') : (c.reason || '');
    var ai = byId(rowsOf(m, 'rbreviewai'), 'ai-' + id);
    var role = m && m.user ? String(m.user.role) : null;
    var at = parseLocal(rec.boardAt);
    return {
      id: id,
      crewId: c.crew.length ? c.crew[0].crewId : null,
      busId: busIdIn(rowsOf(m, 'buses'), c.reg),
      title: (isNum(rec.stars) ? say('rvStars', null, rec.stars) : '')
        + (at === null ? '' : ' \u00b7 ' + dateWords(at)),
      html: reviewSheet({ reg: c.reg, route: routeWords(rec), serviceId: rec.serviceId,
                          routeId: rec.routeId, comment: rec.comment }, ai, line, {
        mayNote: can(role, 'crewNote'), mayIncident: can(role, 'logIncident'),
        mayName: can(role, 'manageDrivers'),
        // The ask is offered only where there is nothing to read yet, and only
        // when there is a connection to ask over.
        ai: !!ai, ask: ask({ offline: !!(m && m.offline) }, 'rvAskRead'),
        // The record's own mark first: the server sets `_redacted` when it takes
        // the journey out, so the line follows the data.
        redacted: rec._redacted === true || role === 'office'
      })
    };
  }

  function openReview(id) {
    var s = state();
    var view = openView(s || {}, id);
    if (!view) return;
    openCrewId = view.crewId;
    openBusId = view.busId;
    /* At desk the review is a PANEL beside the list and not a dialog, so the
     * press sets which one is open and the screen redraws. At yard there is no
     * room for two columns, so it is a sheet. */
    if (density === 'desk') {
      openId = id;
      return redraw();
    }
    if (root.V2 && typeof root.V2.openSheet === 'function') root.V2.openSheet(view.title, view.html);
  }

  // The review carries a registration; `buses` is the one store that turns it
  // into the id an `incidents` record is keyed by.
  function busIdIn(buses, reg) {
    if (!reg) return null;
    for (var i = 0; i < buses.length; i++) {
      if (buses[i] && !buses[i]._deleted && normReg(buses[i].regNo) === normReg(reg)) return buses[i].id;
    }
    return null;
  }

  function openCase(id) {
    var v = root.V2;
    if (!v || typeof v.openSheet !== 'function') return;
    var rec = byId(cacheOf('rbcomplaints'), id);
    if (!rec) return;
    var r = complaintRow(rec);
    var notes = '', i, list = rec.notes || [];
    for (i = 0; i < list.length; i++) {
      notes += '<p class="drow">' + esc(String(list[i].at || '') + ' · ' + String(list[i].text || '')) + '</p>';
    }
    v.openSheet(r.caseNumber, '<div class="rv-sheet">'
      + '<p class="drow">' + esc((r.route || '') + (r.date ? ' · ' + r.date : '')) + '</p>'
      + '<blockquote class="card rv-said">' + esc(r.issue) + '</blockquote>'
      + (r.resolution ? '<p class="drow">' + esc(r.resolution) + '</p>' : '')
      + (notes ? '<div class="card">' + notes + '</div>' : '')
      + '</div>');
  }

  function pairFrom(el) {
    var row = el && typeof el.closest === 'function' ? el.closest('[data-pair]') : null;
    var id = row ? row.getAttribute('data-pair') : (el ? el.getAttribute('data-pair') : null);
    if (!id) return null;
    var s = state();
    var qrows = queueRows({ cache: (s && s.cache) || {} }, indexes(), cacheOf('drivers'));
    return byId(qrows, id);
  }

  async function writeAlias(el, pair, status, crewId, word) {
    if (!pair || !root.DB) return;
    if (el && el.getAttribute('aria-disabled') === 'true') return;
    if (el) {
      el.setAttribute('aria-disabled', 'true');
      if ('textContent' in el) el.textContent = say('rvSaving');
    }
    var me = (state() || {}).user || null;
    try { await root.DB.put('rbalias', aliasRecord(pair, status, crewId, me)); }
    catch (e) {
      if (el) el.removeAttribute('aria-disabled');
      if (root.V2 && root.V2.toast) root.V2.toast(say('rvNotSent'), { kind: 'warn' });
      return;
    }
    if (root.V2 && root.V2.toast) root.V2.toast(say(word), { kind: 'ok' });
    redraw();
  }

  function confirmPair(el) {
    var pair = pairFrom(el);
    if (!pair) return;
    // No pick means the label said "Choose the crew member", so the press opens
    // the list rather than writing a name nobody chose.
    var crewId = el.getAttribute('data-crew') || pair.pick;
    if (!crewId) return openChoose(el);
    return writeAlias(el, pair, 'crew', crewId, 'rvSavedName');
  }

  function genericPair(el) {
    var pair = pairFrom(el);
    if (!pair) return;
    return writeAlias(el, pair, 'generic', null, 'rvSavedName');
  }

  function openChoose(el) {
    var pair = pairFrom(el), v = root.V2;
    if (!pair || !v || typeof v.openSheet !== 'function') return;
    v.openSheet(say('rvSomeoneElse'), chooseSheet(pair.id, cacheOf('drivers'), onBusCrew(pair)));
  }

  // The crew the duty log and the confirmed names already put on that bus.
  function onBusCrew(pair) {
    var ix = indexes(), out = [], k, al;
    for (k in ix.alias) {
      if (!has(ix.alias, k)) continue;
      al = ix.alias[k];
      if (al.status === 'crew' && al.crewId && normReg(al.regNo) === normReg(pair.reg)) out.push(al.crewId);
    }
    return out;
  }

  function pickCrew(el) {
    var pair = pairFrom(el);
    var crewId = el.getAttribute('data-crew');
    if (!pair || !crewId) return;
    if (root.V2 && root.V2.closeSheet) root.V2.closeSheet();
    return writeAlias(null, pair, 'crew', crewId, 'rvSavedName');
  }

  /* THE GROUP CONFIRM, AND IT SHOWS ITS WORK. The first press REVEALS the rows
   * — the queue is narrowed to that bus and the button is `aria-disabled` until
   * they are on screen — and only the second press writes. No bulk action
   * without the list in front of the reader (§3.3). */
  async function groupConfirm(el) {
    var s = state(), reg = el.getAttribute('data-reg');
    if (!reg) return;
    if (busFilter !== reg) {
      busFilter = reg;
      el.setAttribute('aria-disabled', 'true');
      return redraw();
    }
    var qrows = queueRows({ cache: (s && s.cache) || {} }, indexes(), cacheOf('drivers'));
    var me = (s || {}).user || null, done = 0, i;
    el.setAttribute('aria-disabled', 'true');
    for (i = 0; i < qrows.length; i++) {
      if (normReg(qrows[i].reg) !== normReg(reg) || !qrows[i].pick || qrows[i].byClaude) continue;
      if ('textContent' in el) el.textContent = say('rvSavingN', null, qrows.length - done);
      try { await root.DB.put('rbalias', aliasRecord(qrows[i], 'crew', qrows[i].pick, me)); done++; }
      catch (e) { break; }
    }
    // One toast naming the number, after the writes, never one per row.
    if (root.V2 && root.V2.toast) {
      root.V2.toast(done ? say('rvSavedGroup', null, done) : say('rvNotSent'),
                    { kind: done ? 'ok' : 'warn' });
    }
    redraw();
  }

  /* The one server call on this screen, and it is the collector's and not a
   * write of ours: it asks the server to read reviews, or to match typed names,
   * and the answers arrive as `rbreviewai` / `rbaliasai` records on the next
   * pull. SERVER_INGEST_ONLY both of them, so nothing here writes either. */
  async function askServer(el, fn) {
    var sy = root.Sync;
    if (!sy || typeof sy[fn] !== 'function') return;
    if (el.getAttribute('aria-disabled') === 'true') return;
    el.setAttribute('aria-disabled', 'true');
    if ('textContent' in el) el.textContent = say('rvSaving');
    var out;
    try { out = await sy[fn](); } catch (e) { out = { error: 'failed' }; }
    el.removeAttribute('aria-disabled');
    if (root.V2 && root.V2.toast && out && out.error) {
      root.V2.toast(say('rvNeedsConn'), { kind: 'warn' });
    }
    redraw();
  }

  function openNote(el) {
    var v = root.V2;
    if (!v || typeof v.openSheet !== 'function') return;
    var who = nameOf(cacheOf('drivers'), openCrewId);
    v.openSheet(say('rvWriteSaid'), noteSheet(who, openCrewId));
  }

  function formVals(sheet) {
    var d = root.document;
    var form = d && d.querySelector ? d.querySelector('[data-sheet="' + sheet + '"]') : null;
    if (!form || !form.querySelectorAll) return null;
    var nodes = form.querySelectorAll('[data-field]'), out = { _form: form }, i;
    for (i = 0; i < nodes.length; i++) out[nodes[i].getAttribute('data-field')] = nodes[i].value;
    return out;
  }

  async function saveNote(el) {
    if (el.getAttribute('aria-disabled') === 'true') return;
    var vals = formVals('rvnote');
    if (!vals || !String(vals.text || '').trim() || !root.DB) return;
    var crewId = vals._form.getAttribute('data-crew');
    if (!crewId) return;
    var me = (state() || {}).user || null, now = Date.now();
    el.setAttribute('aria-disabled', 'true');
    if ('textContent' in el) el.textContent = say('rvSaving');
    try {
      await root.DB.put('crewnotes', {
        id: 'cn-' + now.toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36),
        crewId: String(crewId), text: String(vals.text).trim(),
        by: me && me.id ? me.id : null, at: now
      });
    } catch (e) { el.removeAttribute('aria-disabled'); return; }
    if (root.V2 && root.V2.closeSheet) root.V2.closeSheet();
    if (root.V2 && root.V2.toast) root.V2.toast(say('rvSavedNote'), { kind: 'ok' });
  }

  function openIncident(el) {
    var v = root.V2;
    if (!v || typeof v.openSheet !== 'function') return;
    v.openSheet(say('rvLogIncident'), incidentSheet(openCrewId, openBusId));
  }

  async function saveIncident(el) {
    if (el.getAttribute('aria-disabled') === 'true') return;
    var vals = formVals('rvinc');
    if (!vals || !String(vals.note || '').trim() || !root.DB) return;
    var crewId = vals._form.getAttribute('data-crew');
    if (!crewId) return;
    var me = (state() || {}).user || null, now = Date.now();
    el.setAttribute('aria-disabled', 'true');
    if ('textContent' in el) el.textContent = say('rvSaving');
    try {
      await root.DB.put('incidents', {
        id: 'inc-' + now.toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36),
        driverId: String(crewId), busId: vals._form.getAttribute('data-bus') || null,
        type: String(vals.type || 'scratch'), note: String(vals.note).trim(), photo: '', cost: 0,
        at: now, by: me && me.id ? me.id : null
      });
    } catch (e) { el.removeAttribute('aria-disabled'); return; }
    if (root.V2 && root.V2.closeSheet) root.V2.closeSheet();
    if (root.V2 && root.V2.toast) root.V2.toast(say('rvSavedIncident'), { kind: 'ok' });
  }

  /* ====================================================================== */

  register();

  var api = {
    render: render, model: model, mount: mount, unmount: unmount,
    tab: pick, filter: filter, search: search, windowFirst: window_,
    aliasId: aliasId, normReg: normReg, normName: normName, parseLocal: parseLocal,
    openAt: function (id) { if (id !== undefined) openId = id; return openId; },
    crewForReview: crewForReview, queueRows: queueRows, aliasRecord: aliasRecord,
    reviewSheet: reviewSheet, readingCard: readingCard, noteSheet: noteSheet,
    chooseSheet: chooseSheet, incidentSheet: incidentSheet,
    WINDOW: WINDOW,
    busFilter: function (reg) { if (reg !== undefined) busFilter = reg; return busFilter; }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.Reviews = api;
    if (root.Router && typeof root.Router.register === 'function') root.Router.register(ID, api);
    /* NO `mount()` here. The listener used to go on at script load, which was
     * the only thing that ever installed it (`Shell.mount` rendered and nothing
     * else), and it then outlived the screen for the whole session —
     * INTEGRATION-NOTES 17. `Shell.mount` now calls `mount()` on the way in and
     * `unmount()` on the way out, so a screen's listeners exist exactly while
     * the screen is the one on the page. A screen's load registers and nothing
     * more, which is what `index.html`'s script order has always claimed. */
  }
})(typeof window !== 'undefined' ? window : this);

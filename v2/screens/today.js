/* Garage Saathi v2 — Today (#1). Spec: screens-shell.md §2 (lines 492–747).
 *
 * "What needs me, now?" — the only screen all roles have except the two that
 * have none, and SIX DIFFERENT SCREENS WEARING ONE NAME. The per-role tables in
 * §2.3 are transcribed here one by one rather than merged into a clever
 * generator, because "Today is role-shaped" is the sentence that lets a reader
 * guess, and the guesses are what made v1's 69 `view*` functions.
 *
 * THE TWO RULES A BUILDER WILL WANT TO BREAK, and neither is a preference.
 *
 *  1. AT MOST FOUR BLOCKS, for every role (§2.1 "The cap"). Five cards each
 *     linking to a different ranked list is what Attention replaced, and the
 *     owner's Today is close to a doorway already. `BLOCKS` holds at most four
 *     builders per role, so the cap is structural rather than remembered, and
 *     `model()` still trims and warns if somebody adds a fifth — a cap that is
 *     only a comment is not a cap.
 *
 *  2. NO COUNT THAT CANNOT REACH ZERO. Two live defects are behind this: "110
 *     of 110 missing documents" (5eb8c6e) and "67 buses need a driver" against
 *     54 drivers (ba274f6). A number that can never be zero teaches people to
 *     scroll past red, which is how a real red row stops being read. So:
 *       - low stock counts only a part with a reorder level actually SET
 *         (v1's `isLow`, app.js:1647 — the seed's 2,384 parts are all level 0
 *         and are not low, they were never stocked);
 *       - the departure block counts the checks STILL OUTSTANDING, not tonight's
 *         departures, because buses always go out and that number never falls;
 *       - every seat count is taken over TONIGHT'S buses only, and reads a dash
 *         rather than a number when tonight has not been picked.
 *     Each count below says, at the point it is computed, how it reaches zero.
 *
 * THE OTHER FOUR, from the cut, each with a commit behind it:
 *   - a row a person may not act on is not drawn; a block whose capability the
 *     reader lacks is ABSENT — no heading, not greyed, not empty;
 *   - NO `at` ON A FIGURE INSIDE A ROW. The screen states its freshness once,
 *     in the line at the top. `at` inside a row adds `.figure-note` as a block
 *     element, triples the row height and runs the age words once per row
 *     (foundation §2.3 rule 4). Four tiles carry `at`; no row does;
 *   - one string, one insert, and nothing measures a row;
 *   - no screen asks a person to adjudicate a clock.
 *
 * WHAT IS NOT A TASK. The supervisor's block 3 is the cards HE closed that are
 * waiting for a second signature: `div.v2row`, no href, no press, not in the
 * tab order. They are off his plate and waiting on somebody else, so a row that
 * moved under his thumb and then did nothing would be the feedback failure
 * inverted. v1's copy for it already exists in both languages
 * (`hmWaitingSignoff`) and is reused rather than rewritten.
 *
 * THE FIELDS THIS SCREEN READS, in one place, because they are the integration
 * surface and a reader should not have to grep for them:
 *   jobcards   status, busId, problem, enterAt, createdAt, startAt, startedAt,
 *              closedAt, closedBy, outside, priority, reworkCount, assignees[],
 *              assignedTo, partRequests[] {id, partName, qty, status, by, at}
 *   buses      id, regNo
 *   parts      id, name, qty, reorderLevel
 *   purchases  paymentStatus === 'pending', amount
 *   gatechecks busId, status (open|released|awaiting|approved|held), releasedAt
 *   nightlist  id = nl-<YYYY-MM-DD>, buses {busId: {running}}
 *   drivers    id, name, busId, crewRole, driverSlot, status
 *   users      id, name
 *   coachai    crewId, status === 'draft', week, at
 *   rbreviews  id, stars, at, busId, crewId
 *   digest     week, headline, sections[] {title, lines[]}, actions[], at
 * All of them are v1's own names; this screen invents no field and writes
 * nothing.
 */
(function (root) {
  'use strict';

  var ID = 'today';
  var BLOCK_CAP = 4;                   // §2.1. Not negotiable; see the header.
  var ROW_CAP = { yard: 5, desk: 12 }; // §2.1 "Row cap per card"
  var DAY = 86400000;
  var HOUR = 3600000;
  var UP = '▲';                   // escapes, so no file encoding can corrupt them
  var DOWN = '▼';
  var SEP = ' — ';                // bus, then fault

  /* ---------- the neighbours, resolved at CALL time --------------------- *
   * Every v2 module does this (v2/night.js's db(), v2/router.js's caps()):
   * these are classic scripts and a reference captured at load would be
   * `undefined` for ever if index.html's order ever moved.
   * -------------------------------------------------------------------- */
  function caps() { return (typeof Caps !== 'undefined' && Caps) || (root && root.Caps) || null; }
  function router() { return (typeof Router !== 'undefined' && Router) || (root && root.Router) || null; }
  function cache() { return (typeof Cache !== 'undefined' && Cache) || (root && root.Cache) || null; }
  function cost() { return (typeof Cost !== 'undefined' && Cost) || (root && root.Cost) || null; }
  function attention() { return (typeof Attention !== 'undefined' && Attention) || (root && root.Attention) || null; }
  function sync() { return (typeof Sync !== 'undefined' && Sync) || (root && root.Sync) || null; }
  function f() { return (typeof fmt !== 'undefined' && fmt) || (root && root.fmt) || null; }
  function V() { return (root && root.V2) || null; }
  function doc() { return (root && root.document) || null; }

  function nowMs() { return Date.now(); }

  // A drawing, or nothing when icons.js is not on the page: the words never
  // depend on it, which is states.js's rule and the reason a node suite can
  // assert on this markup at all.
  function draw(name, size) {
    return typeof root.icon === 'function' ? root.icon(name, { size: size }) : '';
  }

  /* `w()` THROWS on an unregistered id by design, and a screen that threw
   * inside a render would hand the whole body to the frame's errorState. Every
   * id below is in the table, so this guard is for the case the table itself
   * failed to load (words.js absent in a test that only wants the markup). */
  function say(id, n) {
    try { return root.w(id, n); } catch (e) { return ''; }
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function has(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
  function list(v) { return Array.isArray(v) ? v : null; }
  function live(r) { return !!r && !r._deleted; }

  /* ---------------------------------------------------------------------- *
   * THE WORDS. §2.6, id for id.
   *
   * Nine of them take a value that already exists in v1's dictionary and are
   * copied rather than guessed — marked FROM i18n-hi.js with the line. The rest
   * read `hi: ''`, which is PENDING, not missing: words.js draws the English
   * with its id after it ("Standing in the yard [cardStanding]") in Hindi mode,
   * test_v2_words.js prints the pending list on every run, and the sitting that
   * empties it is the owner's. A builder guessing Hindi for a sentence a
   * supervisor acts on is how "Not sent yet" becomes a line nobody can parse.
   * -------------------------------------------------------------------- */
  var LABELS = {
    /* tiles */
    kpiRepair30: { en: 'Repair cost, 30 days', hi: 'मरम्मत खर्च (30 दिन)' },      // FROM i18n-hi.js: costMonth, line 13
    kpiOwed: { en: 'Owed to suppliers', hi: 'सप्लायर को देना है' },                 // FROM i18n-hi.js: hmOwed, line 115
    kpiOnRoad: { en: 'Buses on road', hi: 'सड़क पर' },                            // FROM i18n-hi.js: hmOnRoad, line 109
    kpiOnRoadValue: { en: '{0} of {1}', hi: '' },
    kpiInShop: { en: 'In shop', hi: 'वर्कशॉप में' },                              // FROM i18n-hi.js: hmInShopShort, line 109
    kpiLowStock: { en: 'Low stock', hi: '' },
    kpiSeatsTonight: { en: 'Seats to fill tonight', hi: '' },
    kpiFreeDrivers: { en: 'Free drivers', hi: '' },
    kpiNeedTalk: { en: 'Crew needing a talk', hi: '' },
    kpiStars: { en: 'Average stars', hi: '' },
    trendUp: { en: 'up', hi: '' },
    trendDown: { en: 'down', hi: '' },

    /* card headings */
    cardNeedsYou: { en: 'What needs you', hi: 'अभी ध्यान दें' },                   // FROM i18n-hi.js: needsYouNow, line 20
    cardStanding: { en: 'Standing in the yard', hi: '' },
    cardTonight: { en: 'Going out tonight', hi: '' },
    cardWaitingOther: { en: 'Waiting for someone else', hi: 'किसी और पर बाकी' },   // FROM i18n-hi.js: hmWaitingSignoff, line 122
    cardYourJobs: { en: 'Your jobs', hi: 'आज के खुले काम' },                      // FROM i18n-hi.js: todayJobs, line 13
    cardYourScore: { en: 'Your score', hi: '' },
    cardPartsAsked: { en: 'Parts asked for', hi: '' },
    cardOrderSoon: { en: 'Order these soon', hi: 'कम स्टॉक पुर्जे' },              // FROM i18n-hi.js: lowStock, line 13
    cardJobsWaiting: { en: 'Jobs waiting for parts', hi: '' },
    cardEmptySeats: { en: "Tonight's buses with an empty seat", hi: '' },
    cardNotes: { en: 'Coaching notes to approve', hi: '' },
    cardNeedsTalk: { en: 'Needs a talk', hi: '' },
    cardReviewsSort: { en: 'Reviews to sort out', hi: '' },
    cardThisWeek: { en: 'This week', hi: '' },

    /* row text */
    seeAll: { en: 'See all ({0})', hi: '' },
    standingFor: { en: 'Standing {0}.', hi: '' },
    notStarted: { en: 'Not started.', hi: '' },
    startedAgo: { en: 'Started {0}.', hi: '' },
    youStartedAt: { en: 'You started at {0}.', hi: '' },
    openedAgo: { en: 'Opened {0}.', hi: '' },
    /* The six departure words are prefixed `td` because `v2/screens/gate.js`
     * registers `gateWaiting`, `gateReleased`, `gateHeld` and `gateHeldSub` for
     * the gate round's own panels, and `W.register` THROWS when one id is given
     * the same half twice — which is the right behaviour (one word, one place)
     * and would otherwise be a blank app at load. Gate round's file is not this
     * slice's, so the rename is on this side. Reported: if the two screens want
     * one word for one state, the lead hoists these four into words.js and both
     * screens read them. */
    tdGateWaiting: { en: 'Waiting', hi: '' },
    tdGateReleased: { en: 'Released', hi: '' },
    tdGateHeld: { en: 'Held', hi: '' },
    tdGateNotOut: { en: 'Not checked out of the gate.', hi: '' },
    tdGateOutAt: { en: 'Released {0}.', hi: '' },
    tdGateHeldSub: { en: 'Held at the gate.', hi: '' },
    waitingSub: { en: 'Closed {0}. Somebody else has to check it.', hi: '' },
    stepStart: { en: 'Start', hi: '' },
    stepDone: { en: 'Done', hi: '' },
    scoreOpen: { en: 'Open work', hi: '' },
    scoreRework: { en: 'Sent back for rework', hi: '' },
    scoreBay: { en: 'Days in the bay, average', hi: '' },
    howCounted: { en: 'How this is counted', hi: '' },
    howCountedOpen: { en: 'Open work is every card you are on that is not closed.', hi: '' },
    howCountedRework: { en: 'Rework is a closed card somebody sent back to you.', hi: '' },
    howCountedBay: { en: 'Days in the bay is from the bus coming in to the card closing.', hi: '' },
    askedBy: { en: 'Asked by {0}, {1}. Card {2}.', hi: '' },
    leftReorder: { en: '{0} left. Reorder at {1}.', hi: '' },
    waitingPart: { en: 'Waiting for {0}.', hi: '' },
    notesLines: { en: '{0} lines, written {1}.', hi: '' },
    lowReviews: { en: '{0} one-star reviews this month.', hi: '' },
    unmatchedReview: { en: 'Could not be matched to a crew member.', hi: '' },
    starsOnBus: { en: '{0} star \u2014 {1}', hi: '' },
    unmatchedName: { en: '{0} \u2014 {1}', hi: '' },
    seatsEmpty: { en: 'seats', hi: '' },
    seatConductor: { en: 'No conductor.', hi: '' },
    seatDriverOne: { en: 'No first driver.', hi: '' },
    seatDriverTwo: { en: 'No relief driver.', hi: '' },
    readItAll: { en: 'Read it all', hi: '' },
    pickTonight: { en: "Pick tonight's buses", hi: '' },
    notSentYet: { en: 'Not sent yet', hi: '' },

    /* the freshness line, and the states */
    freshOffline: { en: 'No signal since {0}. What you see may be out of date.', hi: '' },
    emptyStanding: { en: 'No bus is standing in the yard', hi: '' },
    emptyTonight: { en: 'Every bus tonight is checked out', hi: '' },
    emptyYourJobs: { en: 'You have no open jobs', hi: '' },
    emptyPartsAsked: { en: 'No parts asked for', hi: '' },
    emptyOrderSoon: { en: 'Nothing to order', hi: '' },
    emptyJobsWaiting: { en: 'No job is waiting for a part', hi: '' },
    emptySeatsFilled: { en: 'Every seat tonight is filled', hi: '' },
    emptyNotes: { en: 'No notes waiting', hi: '' },
    emptyNeedsTalk: { en: 'Nobody needs a talk', hi: '' },
    emptyReviewsSort: { en: 'No review is waiting to be sorted out', hi: '' },
    emptyNeedsYou: { en: 'Nothing needs you right now', hi: '' },
    tonightNotPicked: { en: "Tonight's buses are not picked yet", hi: '' },
    tonightNotPickedHint: { en: "Open the Duty board and tick tonight's buses off the register.", hi: '' },
    needsYouUnavailable: { en: 'This list could not be read on this device', hi: '' }
  };
  if (root.W && typeof root.W.register === 'function') root.W.register(LABELS);

  /* ---------------------------------------------------------------------- *
   * AGE IN WORDS.
   *
   * `ui/states.js` has exactly this and does not export it, so the choice is
   * this six-line copy or no freshness line at all. It reuses the SAME
   * registered ids (`justNow`, `minutesAgo`, `hoursAgo`, `daysAgo`,
   * `updatedAgo`), so there is one English and one Hindi for the phrase and
   * only the arithmetic is written twice. Reported for P3 to export; until it
   * does, this runs ONCE per render for the one line at the top, never per row.
   * -------------------------------------------------------------------- */
  function ageWords(ms) {
    var m = Math.floor(ms / 60000);
    if (m < 1) return say('justNow');
    if (m < 60) return say('minutesAgo', m);
    var h = Math.floor(m / 60);
    if (h < 24) return say('hoursAgo', h);
    return say('daysAgo', Math.floor(h / 24));
  }

  function agoFrom(now, at) {
    if (!isNum(at) || !isNum(now)) return null;
    var ms = now - at;
    return ageWords(ms < 0 ? 0 : ms);
  }

  // A wall clock, 24 hour, no locale: "Released 20:14." The office reads a
  // 24-hour clock on every other screen in the building.
  function hhmm(at) {
    if (!isNum(at)) return null;
    var d = new Date(at);
    var h = d.getHours(), m = d.getMinutes();
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  function fill(id, a, b, c) {
    var s = say(id);
    if (a !== undefined) s = s.replace('{0}', a);
    if (b !== undefined) s = s.replace('{1}', b);
    if (c !== undefined) s = s.replace('{2}', c);
    return s;
  }

  function group(n) {
    var F = f();
    if (!isNum(n)) return '';
    try { return F ? F.groupIndian(n) : String(n); } catch (e) { return String(n); }
  }

  // `fmt.rupees` THROWS on anything that is not a finite number, which is the
  // point of it. figure() never reaches a formatter with "no value", so this is
  // only ever handed a number — the guard is for a caller that changes.
  function rupees(v) {
    var F = f();
    if (!F || !isNum(v)) return null;
    try { return F.rupees(v); } catch (e) { return null; }
  }
  // "6.0 h", from P2's own formatter, so the hours in a row's sub-line and the
  // hours in its figure are formatted by one function.
  function hoursWord(v) {
    var F = f();
    if (!F || !isNum(v)) return '';
    try { return F.hours(v); } catch (e) { return ''; }
  }

  /* A count, Indian-grouped. A four-figure count that reads "2384" is a count
   * nobody checks against the list it came from. */
  function count(v) {
    var F = f();
    if (!F || !isNum(v)) return null;
    try { return F.groupIndian(v); } catch (e) { return null; }
  }

  function oneDecimal(v) {
    var F = f();
    if (!F || !isNum(v)) return null;
    try { return F.oneDecimal(v); } catch (e) { return null; }
  }

  /* ---------------------------------------------------------------------- *
   * THE CAPABILITY EACH BLOCK DECLARES.
   *
   * Today itself declares nothing — `Caps.SCREENS.today.declares` is
   * `OPEN_BY_DESIGN` and its contents are scoped block by block (v2-ux.md
   * §4.3). The names below are the spec's.
   *
   * TWO OF THEM ARE NOT IN `Caps.PERMS` AT HEAD, and that is a cut problem, not
   * a licence to invent: `mayCloseJob` was a FUNCTION in v1 (app.js:3878,
   * owner + supervisor) rather than a row of `PERMS`, so F1's transcription of
   * the 37 could not carry it; `manageSupplierBills` is the operational half of
   * the `bills` split that `DECISIONS.md §5` plans and F1 did not add. `caps.js`
   * is F1's file and not this slice's, so this resolves the spec's name against
   * the committed table and falls back to the existing name with the SAME role
   * set and the closest meaning — `verifyJob` (owner, supervisor: the two who
   * sign work off) and `bills` (owner, supervisor, store: caps.js's own comment
   * reads "store manages supplier bills"). The moment the lead adds the real
   * name, the first branch wins and the alias is dead. Reported, not hidden: a
   * capability that silently resolves to false would delete the supervisor's
   * block 3 and half the storekeeper's figure row, and nobody would be told.
   * -------------------------------------------------------------------- */
  var CAP_ALIAS = { mayCloseJob: 'verifyJob', manageSupplierBills: 'bills' };

  function can(role, cap) {
    var C = caps();
    if (!C || !role || !cap) return false;
    if (has(C.PERMS, cap)) return C.can(role, cap);
    var alt = CAP_ALIAS[cap];
    return alt ? C.can(role, alt) : false;
  }

  /* ---------------------------------------------------------------------- *
   * QUERIES. Each one narrows IN THE QUERY. §2.3's "narrowed to own cards in
   * the query, not in the view" is the rule that leaked once (02 §6.2): a row
   * that should not be there should never have been fetched.
   * -------------------------------------------------------------------- */

  function openCard(j) { return j.status === 'open' || j.status === 'in-progress'; }
  function cardAt(j) { return isNum(j.enterAt) ? j.enterAt : (isNum(j.createdAt) ? j.createdAt : null); }
  function startedAt(j) { return isNum(j.startAt) ? j.startAt : (isNum(j.startedAt) ? j.startedAt : null); }

  function crewOf(j) {
    var raw = (Array.isArray(j.assignees) && j.assignees.length)
      ? j.assignees
      : (j.assignedTo ? [{ userId: j.assignedTo }] : []);
    var out = [], seen = {}, i, a;
    for (i = 0; i < raw.length; i++) {
      a = raw[i];
      if (!a || !a.userId || seen[a.userId]) continue;
      seen[a.userId] = true;
      out.push(a);
    }
    return out;
  }
  function onCard(j, uid) {
    if (!uid) return false;
    var c = crewOf(j), i;
    for (i = 0; i < c.length; i++) if (c[i].userId === uid) return true;
    return false;
  }

  function busName(buses, id) {
    var i;
    if (!buses || id == null) return null;
    for (i = 0; i < buses.length; i++) if (buses[i] && buses[i].id === id) return buses[i].regNo || null;
    return null;
  }
  function personName(users, drivers, id) {
    var i;
    if (id == null) return null;
    if (users) for (i = 0; i < users.length; i++) if (users[i] && users[i].id === id) return users[i].name || null;
    if (drivers) for (i = 0; i < drivers.length; i++) if (drivers[i] && drivers[i].id === id) return drivers[i].name || null;
    return null;
  }

  // "Bus 14 — brake light": the bus, then the fault, truncating. A card with no
  // bus on it still has a fault, and a card with neither still has an id — the
  // row is the card (screens-work.md §2.4's half-finished rule), so it is never
  // dropped for being thin.
  function cardTitle(q, j) {
    var bus = busName(q.rows.buses, j.busId);
    var fault = j.problem ? String(j.problem) : '';
    if (bus && fault) return bus + SEP + fault;
    return bus || fault || String(j.id || '');
  }

  // A write still in the outbox keeps its place and says so. NEVER "Failed",
  // and never removed: it is in the record (§2.4 half-finished).
  function unsent(q, j) {
    return !!(q.pendingKeys && q.pendingKeys['jobcards:' + j.id]);
  }

  /* v1's `isLow`, app.js:1647, transcribed with its comment intact: a part with
   * `reorderLevel` 0 was never stocked and is NOT low. THE WHOLE SEED IS LEVEL
   * 0 (2,384 parts), so without this the tile reads 2,384 on day one, cannot
   * fall, and the storekeeper learns to ignore it. THIS is how the count
   * reaches zero: every part with a level set can be bought back above it. */
  function isLow(p) {
    var lvl = Number(p.reorderLevel);
    if (!isNum(lvl) || lvl <= 0) return false;
    var qty = Number(p.qty);
    return isNum(qty) && qty <= lvl;
  }

  /* Tonight's running list. `Night.get()` is async and a render is not, so the
   * record is read out of the cache the same way every other store is: one row,
   * `nl-<today>`. Three answers, and they are three different things —
   *   null   tonight has not been picked (the crew manager's whole block 2
   *          changes shape, §2.3, and the two tiles read a DASH, not 0);
   *   []     picked, and nothing runs;
   *   [ids]  the buses that run.
   * It is the first of those that the "67 buses need a driver" defect did not
   * have: it counted every bus in the yard because it had nothing to narrow by. */
  function tonight(q) {
    var rows = q.rows.nightlist;
    if (!rows) return null;
    var key = 'nl-' + dayKey(q.now), i, r, out = [], b;
    for (i = 0; i < rows.length; i++) {
      r = rows[i];
      if (!live(r) || r.id !== key) continue;
      b = r.buses || {};
      for (var id in b) {
        if (!has(b, id)) continue;
        if (b[id] && b[id].running) out.push(id);
      }
      return out;
    }
    return null;
  }

  function dayKey(now) {
    var d = new Date(now);
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  /* The newest gate check per bus. One pass, one map: the alternative is a scan
   * of the whole store per bus, which is §2.7's forbidden shape exactly. */
  function gateByBus(q) {
    var rows = q.rows.gatechecks, out = {}, i, r, at, cur;
    if (!rows) return null;
    for (i = 0; i < rows.length; i++) {
      r = rows[i];
      if (!live(r) || r.busId == null) continue;
      at = isNum(r.startedAt) ? r.startedAt : (isNum(r.updatedAt) ? r.updatedAt : 0);
      cur = out[r.busId];
      if (!cur || at >= cur._at) { out[r.busId] = { rec: r, _at: at }; }
    }
    return out;
  }

  // open | awaiting | (nothing at all) -> waiting; released | approved ->
  // released; held -> held. Every one of the three carries a WORD and a mark;
  // none of them is a colour on its own (§2.1, foundation §3.8).
  function gateState(rec) {
    if (!rec) return 'waiting';
    if (rec.status === 'released' || rec.status === 'approved') return 'released';
    if (rec.status === 'held') return 'held';
    return 'waiting';
  }

  /* ---------------------------------------------------------------------- *
   * THE ONE COST BASIS, READ AND NOT RECOMPUTED.
   *
   * `Cost.forBus` is the only place a bus's cost is computed (money-people
   * §1.1), so the fleet's 30-day repair cost is the sum of what it answers, per
   * bus. It is read, never re-derived: v1 had five per-bus cost lenses and they
   * disagreed, so people stopped reading all of them.
   *
   * TWO THINGS MAKE IT AFFORDABLE HERE, and §2.7 is why they are not optional.
   *   1. The rows are BUCKETED BY BUS once, then each call sees only its own
   *      bus's records. Calling `Cost.forBus` 102 times with the whole ledger
   *      is "work proportional to the whole dataset, performed per item" — the
   *      exact shape §2.7 names, and 102 full passes over 20,000 ledger rows on
   *      a Core 2 Duo is the 386 ms `computeInsights()` bug again.
   *   2. The result is memoised on the CONTENT SIGNATURE of the stores it
   *      reads, so the 4-second sync tick costs nothing when nothing arrived.
   *
   * A store the device does not hold is passed through as `undefined`, NOT as
   * `[]`: an empty array is "read and found nothing", which is 0, and turning a
   * store that could not be read into a 0 is the `|| 0` that invents money.
   * When any bus withholds its total the fleet total is withheld too — a
   * smaller number presented as complete is the failure.
   * -------------------------------------------------------------------- */
  var COST_STORES = ['fuel', 'def', 'jobcards', 'ledger', 'trips', 'incidents', 'components'];

  function bucketByBus(q) {
    var out = {}, jobBus = {}, i, k, store, r, id;
    var cards = q.rows.jobcards;
    if (cards) for (i = 0; i < cards.length; i++) if (cards[i]) jobBus[cards[i].id] = cards[i].busId;
    for (k = 0; k < COST_STORES.length; k++) {
      store = q.rows[COST_STORES[k]];
      if (!store) { out[COST_STORES[k]] = null; continue; }   // absent stays absent
      var m = {};
      for (i = 0; i < store.length; i++) {
        r = store[i];
        if (!r) continue;
        id = COST_STORES[k] === 'ledger' ? jobBus[r.jobId] : r.busId;
        if (id == null) continue;
        (m[id] || (m[id] = [])).push(r);
      }
      out[COST_STORES[k]] = m;
    }
    return out;
  }

  /* Keyed by the content signature AND the window, because the owner's tile
   * asks for two windows on one render: a one-slot memo would miss on every
   * other call and compute both, every time, which is the opposite of a memo. A
   * signature this screen could not read is '' and is NOT memoised — a key that
   * cannot distinguish two row sets is a cache that answers the wrong one. */
  var _costMemo = {};

  function fleetCost(q, days) {
    var C = cost(), buses = q.rows.buses;
    if (!C || typeof C.forBus !== 'function' || !buses || !buses.length) return null;
    var key = q.sig === '' ? null : q.sig + '|' + days;
    if (key !== null && has(_costMemo, key)) return _costMemo[key];
    var buckets = bucketByBus(q);
    var total = 0, held = false, i, bus, per, out;
    for (i = 0; i < buses.length; i++) {
      bus = buses[i];
      if (!live(bus)) continue;
      per = { garage: q.rows.garage };
      for (var k = 0; k < COST_STORES.length; k++) {
        var m = buckets[COST_STORES[k]];
        per[COST_STORES[k]] = m === null ? undefined : (m[bus.id] || []);
      }
      try { out = C.forBus(bus.id, days, per, q.now); } catch (e) { held = true; break; }
      if (out.total === null) { held = true; break; }
      total += out.total;
    }
    var answer = held ? null : total;
    if (key !== null) _costMemo[key] = answer;
    return answer;
  }

  /* ---------------------------------------------------------------------- *
   * THE BLOCKS, role by role (§2.3).
   *
   * Each builder is handed `q` and answers a block or `null`. `null` means
   * ABSENT — no heading, not greyed, not an empty card — and it is the answer
   * for a capability the reader does not hold and for a block whose condition
   * is genuinely not met (the digest card, the supervisor's waiting closes).
   * -------------------------------------------------------------------- */

  function kpi(label, mark, value, opts) {
    opts = opts || {};
    return { label: label, mark: mark, value: value, format: opts.format,
             unit: opts.unit, at: opts.at, chip: opts.chip || null };
  }

  /* ---- owner, block 1: the four numbers (§2.3) ---- */
  function kpiOwner(q) {
    var tiles = [];
    var at = isNum(q.syncAt) && q.syncAt > 0 ? q.syncAt : null;
    /* money for the first two, fleet for the last two. The split is so a FUTURE
     * role cannot inherit money with an operational grant — an owner holds both,
     * so today it changes nothing, which is the point of writing it down. */
    if (can(q.role, 'money')) {
      var c30 = fleetCost(q, 30);
      var c60 = fleetCost(q, 60);
      /* The chip is a comparison and needs BOTH windows. A missing one makes it
       * absent rather than 0%: "no change" and "we could not tell" are two
       * different statements and the second is the honest one here. */
      var prev = (isNum(c30) && isNum(c60)) ? c60 - c30 : null;
      var pct = (isNum(prev) && prev > 0 && isNum(c30)) ? Math.round((c30 - prev) / prev * 100) : null;
      tiles.push(kpi(say('kpiRepair30'), 'money', c30, {
        format: rupees, at: at,
        chip: pct === null ? null : { pct: pct, dir: pct <= 0 ? 'ok' : 'crit' }
      }));
      tiles.push(kpi(say('kpiOwed'), 'doc', owedToSuppliers(q), { format: rupees, at: at }));
    }
    if (can(q.role, 'fleet')) {
      var f2 = fleetStanding(q);
      /* "84 of 102" is ONE formatted string in one tile, not two figures: the
       * two numbers are read against each other and a tile holding a fraction
       * holds one fact. Unknown when the fleet itself is unknown — a dash, not
       * "0 of 0", which is the shape of "110 of 110". */
      tiles.push(kpi(say('kpiOnRoad'), 'bus', f2.total === null ? null
        : fill('kpiOnRoadValue', group(f2.onRoad), group(f2.total)), { at: at }));
      tiles.push(kpi(say('kpiInShop'), 'job', f2.inShop, { at: at, format: count }));
    }
    if (!tiles.length) return null;
    return { kind: 'kpi', id: 'kpi', tiles: tiles };
  }

  // Unpaid supplier bills. Reaches zero the day they are all paid, which is the
  // whole job the number exists to measure.
  function owedToSuppliers(q) {
    var rows = q.rows.purchases;
    if (!rows) return null;
    var sum = 0, i, r, amt;
    for (i = 0; i < rows.length; i++) {
      r = rows[i];
      if (!live(r) || r.paymentStatus !== 'pending') continue;
      /* `Number(null)` is 0 and `Number('')` is 0, which is how a bill nobody
       * priced becomes zero rupees owed. The absence is checked before the
       * conversion, not after it. */
      if (r.amount == null || r.amount === '') return null;
      amt = Number(r.amount);
      if (!isNum(amt)) return null;      // a bill with no money on it: say so
      sum += amt;
    }
    return sum;
  }

  /* Buses, split three ways, counted by BUS and not by card.
   *
   * v1 counted job CARDS here and subtracted them from the fleet
   * (`Math.max(0, buses - inShop - away)`, app.js), so two cards on one bus
   * took a bus off the road twice and the clamp hid it. Counting distinct buses
   * makes the three add up to the fleet, which is the only version of this the
   * owner can check by looking out of the window. */
  function fleetStanding(q) {
    var buses = q.rows.buses, cards = q.rows.jobcards;
    /* A fleet of none is UNKNOWN and not a fleet of zero. "0 of 0" is the exact
     * shape of "110 of 110 missing documents" (5eb8c6e): a fraction whose two
     * halves are the same number tells the reader nothing and cannot improve. */
    if (!buses || !buses.length) return { onRoad: null, inShop: null, away: null, total: null };
    var total = 0, i, b;
    for (i = 0; i < buses.length; i++) if (live(buses[i])) total++;
    if (!cards) return { onRoad: null, inShop: null, away: null, total: total };
    var shop = {}, away = {}, j;
    for (i = 0; i < cards.length; i++) {
      j = cards[i];
      if (!live(j) || !openCard(j) || j.busId == null) continue;
      if (j.outside) away[j.busId] = true; else shop[j.busId] = true;
    }
    var nShop = 0, nAway = 0;
    for (b in shop) if (has(shop, b)) nShop++;
    for (b in away) if (has(away, b) && !shop[b]) nAway++;
    var on = total - nShop - nAway;
    return { onRoad: on < 0 ? null : on, inShop: nShop, away: nAway, total: total };
  }

  /* ---- owner + supervisor: "What needs you" — the top of Attention ----
   *
   * BY ATTENTION'S OWN COMPARATOR, NOT A SECOND RANKING (§2.3). Today reads
   * `Attention.index(rows, me)` and takes the top of it; it does not rank
   * anything itself, because two rankings of the same list that disagree is how
   * five cost lenses happened in the money domain.
   *
   * `screens/attention.js` is a sibling slice built in the same wave, so it can
   * be absent at the moment this runs. That is not an empty list and must not
   * be drawn as one: the block says, in that block only and with a Retry, that
   * the list could not be read. §2.4's error state, per block — the other three
   * keep their rows, because a screen where one store failed is not a failed
   * screen. The branch is dead the moment A lands. */
  function needsYou(q) {
    var A = attention();
    if (!A || typeof A.index !== 'function' || typeof A.render !== 'function') {
      return { kind: 'card', id: 'needsyou', title: say('cardNeedsYou'), rows: [],
               state: 'error', text: say('needsYouUnavailable') };
    }
    var idx;
    try { idx = A.index(q.rows, q.me); } catch (e) { idx = null; }
    var all = (idx && list(idx.rows)) || [];
    if (!all.length) {
      return { kind: 'card', id: 'needsyou', title: say('cardNeedsYou'), rows: [],
               state: 'empty', text: say('emptyNeedsYou'), mark: 'ok' };
    }
    var rows = [], i, r;
    for (i = 0; i < all.length && rows.length < q.cap; i++) {
      r = adoptAttentionRow(all[i]);
      if (r) rows.push(r);
    }
    return { kind: 'card', id: 'needsyou', title: say('cardNeedsYou'), rows: rows,
             why: true, seeAll: { screen: 'attention', n: all.length } };
  }

  /* Attention's row is `{id, kind, band, mark, tone, t, sub, act, to, params}`
   * (its `row()` builder). This takes those fields and nothing else: a row with
   * no title is skipped rather than drawn as a blank line.
   *
   * `act` arrives as the MARKUP `figure()` already produced, which is the one
   * place this screen passes another module's string through — and it is
   * refused when it carries a `.figure-note`, because a note inside a `.v2row`
   * is the rule this whole screen is arranged around and Today is where it
   * would land. */
  function adoptAttentionRow(r) {
    if (!r) return null;
    var title = r.t || null;
    if (!title) return null;
    var tone = (r.tone === 'crit' || r.tone === 'warn' || r.tone === 'ok') ? r.tone : null;
    var act = null;
    if (typeof r.act === 'string' && r.act.indexOf('class="figure"') >= 0
        && r.act.indexOf('figure-note') < 0) act = { html: r.act };
    else if (r.act && typeof r.act === 'object' && (r.act.badge || has(r.act, 'figure'))) act = r.act;
    return { press: true, screen: r.to || 'attention', params: r.params || null,
             mark: r.mark || 'alert', tone: tone, t: title, sub: r.sub || '', act: act };
  }

  /* ---- owner, block 3: the Monday summary ----
   * Drawn when a record EXISTS for this week, absent entirely when there is
   * none. Not an empty card: "there is no digest yet" is not a thing the owner
   * has to be told every Tuesday. */
  function thisWeek(q) {
    var rows = q.rows.digest;
    if (!rows || !can(q.role, 'dashboard')) return null;
    var best = null, i, r;
    for (i = 0; i < rows.length; i++) {
      r = rows[i];
      if (!live(r) || !r.week) continue;
      if (!best || String(r.week) > String(best.week)) best = r;
    }
    if (!best || String(best.week) !== weekKey(q.now)) return null;
    var lines = [], secs = list(best.sections) || [], k, s, n;
    for (k = 0; k < secs.length && lines.length < 3; k++) {
      s = secs[k];
      var ls = (s && list(s.lines)) || [];
      for (n = 0; n < ls.length && lines.length < 3; n++) if (ls[n]) lines.push(String(ls[n]));
    }
    return { kind: 'card', id: 'digest', title: say('cardThisWeek'), rows: [],
             lead: best.headline ? String(best.headline) : '', lines: lines,
             foot: { act: 'digest', label: say('readItAll') } };
  }

  // The ISO-ish week key the server writes on a digest: Monday's date.
  function weekKey(now) {
    var d = new Date(now);
    var back = (d.getDay() + 6) % 7;             // Monday = 0
    return dayKey(now - back * DAY);
  }

  /* ---- supervisor, block 1: standing in the yard (§2.3) ----
   * The most frequently drawn list in the product (§2.7). Oldest first by
   * `enterAt`: the bus nobody has looked at is the one at the top. */
  function standing(q) {
    if (!can(q.role, 'viewJobs')) return null;
    var cards = q.rows.jobcards;
    if (!cards) return loading('standing', say('cardStanding'), q);
    var open = [], i, j;
    for (i = 0; i < cards.length; i++) {
      j = cards[i];
      if (live(j) && openCard(j) && !j.outside) open.push(j);
    }
    open.sort(function (a, b) { return oldestFirst(cardAt(a), cardAt(b)); });
    if (!open.length) {
      return empty('standing', say('cardStanding'), say('emptyStanding'), 'bus');
    }
    var rows = [];
    for (i = 0; i < open.length && i < q.cap; i++) rows.push(standingRow(q, open[i]));
    return { kind: 'card', id: 'standing', title: say('cardStanding'), rows: rows,
             seeAll: { screen: 'jobs', n: open.length } };
  }

  // Nulls last, and never a guess: a card with no time sorts to the bottom and
  // its figure is a dash, which is screens-work.md §2.4's rule.
  function oldestFirst(a, b) {
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return a - b;
  }

  function standingRow(q, j) {
    var at = cardAt(j), st = startedAt(j);
    var hours = at === null ? null : (q.now - at) / HOUR;
    var sub = (hours === null ? '' : fill('standingFor', hoursWord(hours)) + ' ')
      + (st === null ? say('notStarted') : fill('startedAgo', agoFrom(q.now, st)));
    return { press: true, screen: 'jobcard', params: { id: j.id }, mark: 'bus',
             t: cardTitle(q, j), sub: sub,
             // NO `at` on this figure. The screen said its age once, at the top.
             act: unsent(q, j) ? { badge: 'warn', label: say('notSentYet') }
                               : { figure: hours, unit: 'h', format: oneDecimal } };
  }

  /* ---- supervisor, block 2: going out tonight (§2.3) ----
   *
   * THE COUNT IS THE CHECKS STILL OUTSTANDING, AND THAT IS NOT A STYLE CHOICE.
   * Tonight's departures is a number that never falls — buses go out every
   * night — so "See all (18)" against it would be red for ever and would teach
   * the supervisor to stop reading it, which is ba274f6 and 5eb8c6e both. What
   * the block exists to empty is the departure checks, so that is what it
   * counts, and when it reaches zero the block says so in a sentence.
   *
   * Released and Held rows are still DRAWN when there is room, because
   * "Released 20:14" is the answer to the same question. They are just not the
   * count. After DECISIONS.md §15 the block links to Gate round, not Duty
   * board: the seat count belongs to the other screen and mixing them on one
   * screen is what §15 split. */
  function tonightOut(q) {
    if (!can(q.role, 'gateCheck')) return null;
    var running = tonight(q), gates = gateByBus(q);
    if (running === null || gates === null) return loading('tonight', say('cardTonight'), q);
    var waiting = [], decided = [], i, id, state;
    running.sort(function (a, b) { return byBusName(q, a, b); });
    for (i = 0; i < running.length; i++) {
      id = running[i];
      state = gateState(gates[id] && gates[id].rec);
      if (state === 'waiting') waiting.push({ id: id, state: state, rec: null });
      else decided.push({ id: id, state: state, rec: gates[id].rec });
    }
    if (!waiting.length) {
      return empty('tonight', say('cardTonight'), say('emptyTonight'), 'gate');
    }
    // Unchecked first, then by bus number — the order stated in the spec, and
    // the only order in which the top of the card is the work.
    var all = waiting.concat(decided), rows = [];
    for (i = 0; i < all.length && i < q.cap; i++) rows.push(gateRow(q, all[i]));
    return { kind: 'card', id: 'tonight', title: say('cardTonight'), rows: rows,
             seeAll: { screen: 'gate', n: waiting.length } };
  }

  function byBusName(q, a, b) {
    var x = busName(q.rows.buses, a) || '', y = busName(q.rows.buses, b) || '';
    return x < y ? -1 : x > y ? 1 : 0;
  }

  function gateRow(q, e) {
    var sub, badge, label;
    if (e.state === 'released') {
      var t = hhmm(e.rec && e.rec.releasedAt);
      sub = t === null ? say('tdGateReleased') : fill('tdGateOutAt', t);
      badge = 'ok'; label = say('tdGateReleased');
    } else if (e.state === 'held') {
      sub = say('tdGateHeldSub'); badge = 'bad'; label = say('tdGateHeld');
    } else {
      sub = say('tdGateNotOut'); badge = 'warn'; label = say('tdGateWaiting');
    }
    return { press: true, screen: 'gate', params: { id: e.id }, mark: 'gate',
             t: busName(q.rows.buses, e.id) || String(e.id), sub: sub,
             act: { badge: badge, label: label } };
  }

  /* ---- supervisor, block 3: waiting for someone else (§2.3) ----
   *
   * INFORMATION, NOT A TASK. `div.v2row`: no href, no press, not focusable,
   * nothing in `.act` to tap. These are the cards HE closed, waiting on a
   * second signature, and they are off his plate — a row that depressed under
   * his thumb and then did nothing is the feedback failure inverted
   * (foundation §3.8).
   *
   * THE IDENTITY RULE, INVERTED: this block shows ONLY `closedBy === me.id`.
   * It is the mirror of Attention's row kind 2, which shows only the closes
   * that are NOT his, and the reason both exist is that he has to see this as
   * "waiting for sign-off" rather than discover it a week later.
   *
   * Absent when there are none — he does not need an empty card telling him
   * nothing is waiting. */
  function waitingOther(q) {
    if (!can(q.role, 'mayCloseJob')) return null;
    var cards = q.rows.jobcards, me = q.me && q.me.id;
    if (!cards || !me) return null;
    var mine = [], i, j;
    for (i = 0; i < cards.length; i++) {
      j = cards[i];
      if (!live(j) || j.status !== 'done') continue;
      if (j.closedBy !== me) continue;               // narrowed in the query
      mine.push(j);
    }
    if (!mine.length) return null;
    mine.sort(function (a, b) { return oldestFirst(a.closedAt || null, b.closedAt || null); });
    var rows = [];
    for (i = 0; i < mine.length && i < q.cap; i++) {
      j = mine[i];
      var days = isNum(j.closedAt) ? (q.now - j.closedAt) / DAY : null;
      rows.push({ press: false, mark: 'clock', markTone: 'warn', t: cardTitle(q, j),
                  sub: fill('waitingSub', agoFrom(q.now, j.closedAt)),
                  act: { figure: days, unit: 'd', format: oneDecimal } });
    }
    return { kind: 'card', id: 'waiting', title: say('cardWaitingOther'), rows: rows,
             seeAll: { screen: 'jobs', n: mine.length } };
  }

  /* ---- mechanic, block 1: his own cards (§2.3) ----
   *
   * NARROWED IN THE QUERY, NOT IN THE VIEW. A mechanic must never see another
   * mechanic's card; it leaked once (02 §6.2) because the filter was a
   * condition on the row rather than on the fetch. `onCard` is the fetch here.
   *
   * Priority descending, then oldest first: an unfinished job does not stop
   * mattering at midnight (stage 1 §3.2), so there is no "today" filter.
   *
   * `.act` IS A BADGE, NOT A BUTTON. The two taps live on the Job card, where
   * the bus and the fault are in front of him. A one-tap write from a list row
   * is how a part gets charged to the wrong bus ([E] d738a6e). */
  function yourJobs(q) {
    if (!can(q.role, 'viewJobs')) return null;
    var cards = q.rows.jobcards, me = q.me && q.me.id;
    if (!cards) return loading('yourjobs', say('cardYourJobs'), q);
    var mine = [], i, j;
    for (i = 0; i < cards.length; i++) {
      j = cards[i];
      if (live(j) && openCard(j) && onCard(j, me)) mine.push(j);
    }
    if (!mine.length) return empty('yourjobs', say('cardYourJobs'), say('emptyYourJobs'), 'job');
    mine.sort(function (a, b) {
      var d = prio(b) - prio(a);
      return d !== 0 ? d : oldestFirst(cardAt(a), cardAt(b));
    });
    var rows = [];
    for (i = 0; i < mine.length && i < q.cap; i++) {
      j = mine[i];
      var st = startedAt(j);
      rows.push({ press: true, screen: 'jobcard', params: { id: j.id }, mark: 'job',
                  t: cardTitle(q, j),
                  sub: st === null ? fill('openedAgo', agoFrom(q.now, cardAt(j))) + ' ' + say('notStarted')
                                   : fill('youStartedAt', hhmm(st)),
                  act: unsent(q, j) ? { badge: 'warn', label: say('notSentYet') }
                     : st === null ? { badge: 'warn', label: say('stepStart') }
                                   : { badge: 'ok', label: say('stepDone') } });
    }
    return { kind: 'card', id: 'yourjobs', title: say('cardYourJobs'), rows: rows,
             seeAll: { screen: 'jobs', n: mine.length } };
  }

  var PRIO = { high: 3, med: 2, medium: 2, low: 1 };
  function prio(j) { return PRIO[String(j.priority)] || 0; }

  /* ---- mechanic, block 2: his three numbers (§2.3) ----
   *
   * OWN ROW ONLY. The team leaderboard answers "who should take this card", so
   * it lives on the Job card and not here (stage 1 §5.1).
   *
   * Three facts, not a score. They are the three INPUTS v1's `mechanicScore`
   * already counts (app.js:7966–7975) rather than the 0–100 it blends them
   * into: a blended number cannot be acted on, and the three it is built from
   * can. All three reach zero — no open work, nothing sent back, nothing in the
   * bay — which is what a good month looks like. */
  function yourScore(q) {
    if (!can(q.role, 'viewScoreboard')) return null;
    var cards = q.rows.jobcards, me = q.me && q.me.id;
    if (!cards || !me) return loading('score', say('cardYourScore'), q);
    var since = q.now - 90 * DAY;
    var open = 0, rework = 0, bay = 0, bayN = 0, i, j, t;
    for (i = 0; i < cards.length; i++) {
      j = cards[i];
      if (!live(j) || !onCard(j, me)) continue;
      if (openCard(j)) { open++; continue; }
      t = isNum(j.closedAt) ? j.closedAt : cardAt(j);
      if (t === null || t < since) continue;
      rework += Number(j.reworkCount) || 0;
      if (isNum(j.closedAt) && cardAt(j) !== null) {
        bay += Math.max(0, (j.closedAt - cardAt(j)) / DAY);
        bayN++;
      }
    }
    return { kind: 'card', id: 'score', title: say('cardYourScore'), rows: [],
             facts: [
               { mark: 'job', label: say('scoreOpen'), value: open },
               { mark: 'warn', label: say('scoreRework'), value: rework },
               // No bay time recorded is UNKNOWN, not 0 days: zero days in the
               // bay would be a claim about turnaround nobody made.
               { mark: 'clock', label: say('scoreBay'), value: bayN ? bay / bayN : null, format: oneDecimal }
             ],
             foot: { act: 'howcounted', label: say('howCounted') } };
  }

  /* ---- storekeeper, block 1: the counter's two numbers (§2.3) ---- */
  function kpiStore(q) {
    var tiles = [], at = isNum(q.syncAt) && q.syncAt > 0 ? q.syncAt : null;
    if (can(q.role, 'viewStore')) {
      var low = lowParts(q);
      tiles.push(kpi(say('kpiLowStock'), 'part', low === null ? null : low.length, { at: at, format: count }));
    }
    // The fleet-wide spend total is NOT here — that is Money's. This half of
    // the `bills` split manages the bill; the other half reads the total.
    if (can(q.role, 'manageSupplierBills')) {
      tiles.push(kpi(say('kpiOwed'), 'doc', owedToSuppliers(q), { format: rupees, at: at }));
    }
    if (!tiles.length) return null;
    return { kind: 'kpi', id: 'kpi', tiles: tiles };
  }

  function lowParts(q) {
    var parts = q.rows.parts;
    if (!parts) return null;
    var out = [], i;
    for (i = 0; i < parts.length; i++) if (live(parts[i]) && isLow(parts[i])) out.push(parts[i]);
    out.sort(function (a, b) {
      // Lowest against its OWN reorder level first: 1 of 2 is worse than 8 of 10.
      var ra = Number(a.qty) / Number(a.reorderLevel), rb = Number(b.qty) / Number(b.reorderLevel);
      return ra - rb;
    });
    return out;
  }

  /* ---- storekeeper, block 2: parts asked for (§2.3) ----
   * Oldest request first: the one waiting longest is the one holding up a bus.
   * Reaches zero when the counter is clear. */
  function partsAsked(q) {
    if (!can(q.role, 'issuePart')) return null;
    var cards = q.rows.jobcards;
    if (!cards) return loading('asked', say('cardPartsAsked'), q);
    var reqs = [], i, k, j, rq;
    for (i = 0; i < cards.length; i++) {
      j = cards[i];
      if (!live(j)) continue;
      var pr = list(j.partRequests) || [];
      for (k = 0; k < pr.length; k++) {
        rq = pr[k];
        if (!rq || rq.status !== 'requested') continue;
        reqs.push({ j: j, r: rq });
      }
    }
    if (!reqs.length) return empty('asked', say('cardPartsAsked'), say('emptyPartsAsked'), 'part');
    reqs.sort(function (a, b) { return oldestFirst(isNum(a.r.at) ? a.r.at : null, isNum(b.r.at) ? b.r.at : null); });
    var rows = [];
    for (i = 0; i < reqs.length && i < q.cap; i++) {
      var e = reqs[i];
      var bus = busName(q.rows.buses, e.j.busId);
      rows.push({ press: true, screen: 'store', params: { id: e.r.partId || null }, mark: 'part',
                  t: (e.r.partName ? String(e.r.partName) : '') + (bus ? SEP + bus : ''),
                  sub: fill('askedBy', personName(q.rows.users, q.rows.drivers, e.r.by) || '',
                            agoFrom(q.now, e.r.at) || '', String(e.j.id || '')),
                  act: { figure: isNum(Number(e.r.qty)) ? Number(e.r.qty) : null } });
    }
    return { kind: 'card', id: 'asked', title: say('cardPartsAsked'), rows: rows,
             seeAll: { screen: 'store', n: reqs.length } };
  }

  /* ---- storekeeper, block 3: order these soon (§2.3) ----
   * The same `isLow` as the tile, so the number and the list cannot disagree. */
  function orderSoon(q) {
    if (!can(q.role, 'viewStore')) return null;
    var low = lowParts(q);
    if (low === null) return loading('order', say('cardOrderSoon'), q);
    if (!low.length) return empty('order', say('cardOrderSoon'), say('emptyOrderSoon'), 'part');
    var rows = [], i, p;
    for (i = 0; i < low.length && i < q.cap; i++) {
      p = low[i];
      rows.push({ press: true, screen: 'store', params: { id: p.id }, mark: 'part',
                  t: String(p.name || p.id), sub: fill('leftReorder', group(Number(p.qty)), group(Number(p.reorderLevel))),
                  act: { figure: Number(p.qty) } });
    }
    return { kind: 'card', id: 'order', title: say('cardOrderSoon'), rows: rows,
             seeAll: { screen: 'store', n: low.length } };
  }

  /* ---- storekeeper, block 4: jobs waiting for parts (§2.3) ----
   * Blocks 2 and 4 link to two different screens (Store, Jobs), which is inside
   * "no block links to more than one screen" and at the edge of it. If a fifth
   * block is ever wanted here, one of these two goes. */
  function jobsWaiting(q) {
    if (!can(q.role, 'viewJobs')) return null;
    var cards = q.rows.jobcards;
    if (!cards) return loading('waitparts', say('cardJobsWaiting'), q);
    var held = [], i, k, j;
    for (i = 0; i < cards.length; i++) {
      j = cards[i];
      if (!live(j) || !openCard(j)) continue;
      var pr = list(j.partRequests) || [], want = null;
      for (k = 0; k < pr.length; k++) {
        if (pr[k] && pr[k].status === 'requested') {
          if (want === null || (isNum(pr[k].at) && pr[k].at < want.at)) want = pr[k];
        }
      }
      if (want) held.push({ j: j, r: want });
    }
    if (!held.length) return empty('waitparts', say('cardJobsWaiting'), say('emptyJobsWaiting'), 'job');
    held.sort(function (a, b) { return oldestFirst(isNum(a.r.at) ? a.r.at : null, isNum(b.r.at) ? b.r.at : null); });
    var rows = [];
    for (i = 0; i < held.length && i < q.cap; i++) {
      var e = held[i];
      var days = isNum(e.r.at) ? (q.now - e.r.at) / DAY : null;
      rows.push({ press: true, screen: 'jobcard', params: { id: e.j.id }, mark: 'job',
                  t: cardTitle(q, e.j), sub: fill('waitingPart', String(e.r.partName || '')),
                  act: { figure: days, unit: 'd', format: oneDecimal } });
    }
    return { kind: 'card', id: 'waitparts', title: say('cardJobsWaiting'), rows: rows,
             seeAll: { screen: 'jobs', n: held.length } };
  }

  /* ---- crew manager, block 1: two numbers that can reach zero (§2.3) ----
   *
   * THE DEFECT THIS BLOCK IS WRITTEN AGAINST: "67 buses need a driver" against
   * 54 drivers ([E] ba274f6). It counted every bus in the yard, so it could
   * never be satisfied and it was never read.
   *
   * It can reach zero ONLY BECAUSE TONIGHT'S BUSES ARE PICKED FIRST. Before
   * that there is no list to be short against, and the tiles read a DASH rather
   * than 0 — 0 would be a claim that every seat is filled. */
  function kpiCrew(q) {
    if (!can(q.role, 'assignDriver')) return null;
    var at = isNum(q.syncAt) && q.syncAt > 0 ? q.syncAt : null;
    var s = seats(q);
    return { kind: 'kpi', id: 'kpi', tiles: [
      kpi(say('kpiSeatsTonight'), 'seat', s === null ? null : s.empty, { at: at, format: count }),
      kpi(say('kpiFreeDrivers'), 'person', s === null ? null : s.free, { at: at, format: count })
    ] };
  }

  /* Seats, over TONIGHT'S buses only.
   *
   * A bus has three: driver 1, driver 2 (the relief driver on night and long
   * routes) and the conductor. A seat is taken when an active crew record holds
   * it — `drivers[].busId` with `driverSlot` for the two driver seats and
   * `crewRole` for the conductor, which is what the duty board writes. */
  function seats(q) {
    var running = tonight(q), crew = q.rows.drivers;
    if (running === null || !crew) return null;
    var onBus = {}, free = 0, i, d, slot;
    for (i = 0; i < crew.length; i++) {
      d = crew[i];
      if (!live(d) || (d.status && d.status !== 'active')) continue;
      if (!d.busId) { if (d.crewRole !== 'conductor') free++; continue; }
      var m = onBus[d.busId] || (onBus[d.busId] = { d1: false, d2: false, c: false });
      if (d.crewRole === 'conductor') { m.c = true; continue; }
      slot = d.driverSlot === 2 ? 'd2' : 'd1';
      if (m[slot]) slot = slot === 'd1' ? 'd2' : 'd1';   // two records, one seat
      m[slot] = true;
    }
    var gaps_total = 0, per = [];
    for (i = 0; i < running.length; i++) {
      var m2 = onBus[running[i]] || { d1: false, d2: false, c: false };
      var gaps = [];
      if (!m2.d1) gaps.push('d1');
      if (!m2.d2) gaps.push('d2');
      if (!m2.c) gaps.push('c');
      gaps_total += gaps.length;
      if (gaps.length) per.push({ id: running[i], gaps: gaps });
    }
    return { empty: gaps_total, free: free, per: per, picked: true };
  }

  /* ---- crew manager, block 2: tonight's empty seats (§2.3) ----
   *
   * When tonight's buses have NOT been picked this block cannot exist — there
   * is no list to be short against — so it becomes one empty state and a button
   * to the Duty board. Specified so it does not depend on the one data addition
   * in the whole plan: if `nightlist` had been refused, this block would be
   * removed and blocks 1 and 3 would stand unchanged. It was not refused
   * (§6.3), and the shape is kept anyway because the "not picked yet" state is
   * every day before somebody picks. */
  function emptySeats(q) {
    if (!can(q.role, 'assignDriver')) return null;
    var s = seats(q);
    if (s === null) {
      return { kind: 'card', id: 'seats', title: say('cardEmptySeats'), rows: [],
               state: 'empty', text: say('tonightNotPicked'), hint: say('tonightNotPickedHint'),
               mark: 'seat', primary: { screen: 'duty', label: say('pickTonight') } };
    }
    if (!s.per.length) return empty('seats', say('cardEmptySeats'), say('emptySeatsFilled'), 'seat');
    var per = s.per.slice();
    per.sort(function (a, b) {
      var d = b.gaps.length - a.gaps.length;
      return d !== 0 ? d : byBusName(q, a.id, b.id);
    });
    var rows = [], i;
    for (i = 0; i < per.length && i < q.cap; i++) {
      rows.push({ press: true, screen: 'duty', params: { id: per[i].id }, mark: 'seat',
                  t: busName(q.rows.buses, per[i].id) || String(per[i].id),
                  sub: gapWords(per[i].gaps),
                  act: { figure: per[i].gaps.length, unit: say('seatsEmpty') } });
    }
    return { kind: 'card', id: 'seats', title: say('cardEmptySeats'), rows: rows,
             seeAll: { screen: 'duty', n: per.length } };
  }

  function gapWords(gaps) {
    var out = [], i;
    for (i = 0; i < gaps.length; i++) {
      if (gaps[i] === 'c') out.push(say('seatConductor'));
      else if (gaps[i] === 'd1') out.push(say('seatDriverOne'));
      else out.push(say('seatDriverTwo'));
    }
    return out.join(' ');
  }

  /* ---- crew manager, block 3: coaching notes to approve (§2.3) ----
   * Oldest draft first. Reaches zero when every draft has been read. */
  function notesToApprove(q) {
    if (!can(q.role, 'crewNote')) return null;
    var rows = q.rows.coachai;
    if (!rows) return loading('notes', say('cardNotes'), q);
    var drafts = [], i, r;
    for (i = 0; i < rows.length; i++) {
      r = rows[i];
      if (live(r) && r.status === 'draft') drafts.push(r);
    }
    if (!drafts.length) return empty('notes', say('cardNotes'), say('emptyNotes'), 'review');
    drafts.sort(function (a, b) { return oldestFirst(isNum(a.at) ? a.at : null, isNum(b.at) ? b.at : null); });
    var out = [];
    for (i = 0; i < drafts.length && i < q.cap; i++) {
      r = drafts[i];
      out.push({ press: true, screen: 'people', params: { id: r.crewId || null }, mark: 'review',
                 t: personName(q.rows.users, q.rows.drivers, r.crewId) || String(r.crewId || ''),
                 sub: fill('notesLines', group(countLines(r)), agoFrom(q.now, r.at) || '') });
    }
    return { kind: 'card', id: 'notes', title: say('cardNotes'), rows: out,
             seeAll: { screen: 'people', n: drafts.length } };
  }

  function countLines(r) {
    var en = r.en || r.hi || {}, n = 0, k;
    for (k in en) if (has(en, k) && en[k]) n++;
    return n;
  }

  /* ---- office, block 1: two numbers (§2.3) ---- */
  function kpiOffice(q) {
    if (!can(q.role, 'crewPerf')) return null;
    var at = isNum(q.syncAt) && q.syncAt > 0 ? q.syncAt : null;
    var talk = needTalk(q);
    return { kind: 'kpi', id: 'kpi', tiles: [
      // A dash, not 0: see needTalk. "Nobody needs a talk" and "this device
      // cannot tell" are two different statements and only one of them is true.
      kpi(say('kpiNeedTalk'), 'warn', talk === null ? null : talk.length, { at: at, format: count }),
      kpi(say('kpiStars'), 'star', avgStars(q), { format: oneDecimal, at: at })
    ] };
  }

  /* ---- office, block 2: needs a talk (§2.3) ----
   *
   * WHO A REVIEW IS ABOUT IS NOT A FIELD ON A REVIEW. The spec asks for the
   * crew "lowest blended score first", and the blend needs reviews attributed
   * to a crew member — but `rbreviews` carries no crewId. The attribution is a
   * SEVEN-STORE TRACE that lives on the server (`crew_trace.index_by_crew`,
   * reached through `_CREW_RV_STORES` at sync_server.py:1365: rbreviews,
   * rbservices, gatechecks, rbassign, buses, dutylog, itslookup, rbalias,
   * rbreviewai) and v2 holds no client copy of its answer.
   *
   * So Today does not compute it. Two reasons, and the second is the one that
   * matters: a trace over seven stores per render is §2.7's forbidden shape
   * squared, and a second basis for "how is this crew member doing" is the
   * five-cost-lenses failure moved into the people domain. People (#8) and
   * Reviews (#11) own it.
   *
   * So this reads the index from the module that owns it, exactly as "What
   * needs you" reads Attention's comparator, and when that module is not on the
   * page it says so IN THIS BLOCK ONLY, with a Retry (§2.4). The other blocks
   * keep their rows. REPORTED to the lead as the one thing in the spec I
   * believe is wrong: this block cannot be built from what the client holds.
   *
   * NEVER a phone number (PII_ROLES, 03 §2.1), NEVER an identity document
   * (permission-or-self, 02 §4.3), NEVER the conversation log ([E] 4a42e38).
   * None of the three is read here and no label on this block names one.
   */
  function crewIndex(q) {
    var R = (root.Reviews && typeof root.Reviews.crewIndex === 'function') ? root.Reviews
      : ((root.People && typeof root.People.crewIndex === 'function') ? root.People : null);
    if (!R) return null;
    try { return R.crewIndex(q.rows, q.me, q.now); } catch (e) { return null; }
  }

  /* The index's own shape is its owner's. This takes the two fields the row
   * needs and skips an entry that carries neither — a crew member drawn with no
   * number against them is a row that cannot be acted on. */
  function needTalk(q) {
    var ix = crewIndex(q);
    if (!ix) return null;
    var src = Array.isArray(ix) ? ix : ix.rows || ix.crew || null, out = [], i, e, k;
    if (!src) {
      src = [];
      for (k in ix) if (has(ix, k)) src.push({ crewId: k, score: ix[k] && ix[k].score, low: ix[k] && ix[k].low });
    }
    for (i = 0; i < src.length; i++) {
      e = src[i];
      if (!e || !e.crewId) continue;
      if (!isNum(e.score) && !isNum(e.low)) continue;
      if (isNum(e.needsTalk) ? !e.needsTalk : (isNum(e.score) ? e.score >= 75 : !e.low)) continue;
      out.push({ crewId: e.crewId, score: isNum(e.score) ? e.score : null, low: isNum(e.low) ? e.low : null });
    }
    // Lowest score first, which is the key the row shows.
    out.sort(function (a, b) {
      if (a.score === null && b.score === null) return (b.low || 0) - (a.low || 0);
      if (a.score === null) return 1;
      if (b.score === null) return -1;
      return a.score - b.score;
    });
    return out;
  }

  function needsTalk(q) {
    if (!can(q.role, 'crewPerf')) return null;
    var talk = needTalk(q);
    if (talk === null) {
      return { kind: 'card', id: 'talk', title: say('cardNeedsTalk'), rows: [],
               state: 'error', text: say('needsYouUnavailable') };
    }
    if (!talk.length) return empty('talk', say('cardNeedsTalk'), say('emptyNeedsTalk'), 'person');
    var rows = [], i, e;
    for (i = 0; i < talk.length && i < q.cap; i++) {
      e = talk[i];
      rows.push({ press: true, screen: 'people', params: { id: e.crewId }, mark: 'person',
                  t: personName(q.rows.users, q.rows.drivers, e.crewId) || String(e.crewId),
                  sub: e.low === null ? '' : fill('lowReviews', group(e.low)),
                  act: { figure: e.score } });
    }
    return { kind: 'card', id: 'talk', title: say('cardNeedsTalk'), rows: rows,
             seeAll: { screen: 'people', n: talk.length } };
  }

  /* Fleet-wide average stars over 30 days. NO ATTRIBUTION IS NEEDED for an
   * average over the whole fleet, which is why this half of the figure row is
   * real while the other half is a dash.
   *
   * An average over nothing is UNKNOWN, never 0.0 — a zero-star average would
   * be a claim no passenger made. */
  function avgStars(q) {
    var rv = q.rows.rbreviews;
    if (!rv) return null;
    var since = q.now - 30 * DAY, sum = 0, n = 0, i, s, at;
    for (i = 0; i < rv.length; i++) {
      if (!live(rv[i])) continue;
      at = reviewAt(rv[i]);
      if (at === null || at < since) continue;
      s = Number(rv[i].stars);
      if (!isNum(s)) continue;
      sum += s; n++;
    }
    return n ? sum / n : null;
  }

  // A review is dated by `boardAt` (the server writes a local datetime string)
  // and falls back to the record's own stamp. Unparseable is null, not now:
  // guessing a date here would put a review in the wrong month.
  function reviewAt(r) {
    if (isNum(r.at)) return r.at;
    if (typeof r.boardAt === 'string') {
      var t = Date.parse(r.boardAt);
      if (isNum(t)) return t;
    }
    return isNum(r.updatedAt) ? r.updatedAt : null;
  }

  /* ---- office, block 3: reviews to sort out (§2.3) ----
   *
   * THE QUEUE IS THE TYPED NAMES, and that is the honest client-readable
   * version of "could not be matched to a crew member". `rbalias` is exactly
   * that record — "this redBus name on this bus is this crew member, confirmed
   * once by the office" — so a row still waiting for that confirmation is a row
   * the office has to sort out, and the count reaches zero the day they are all
   * confirmed. It is one store and one pass, with no trace and no second basis.
   *
   * NO PASSENGER JOURNEY FIELD FOR THIS ROLE. PNR, seat, fare and board point
   * are stripped by the server for `office` (sync_server.py:4338) and must not
   * be re-added ([E] bd11e75): none is read here and no label names one. An
   * alias row carries a crew NAME and a registration, which is what the office
   * is being asked about.
   *
   * Newest first. */
  function reviewsSort(q) {
    if (!can(q.role, 'crewReviews')) return null;
    var al = q.rows.rbalias;
    if (!al) return loading('reviews', say('cardReviewsSort'), q);
    var open = [], i, r;
    for (i = 0; i < al.length; i++) {
      r = al[i];
      if (!live(r)) continue;
      if (r.status === 'crew' && r.crewId) continue;        // already sorted out
      open.push(r);
    }
    if (!open.length) return empty('reviews', say('cardReviewsSort'), say('emptyReviewsSort'), 'review');
    open.sort(function (a, b) { return (isNum(b.updatedAt) ? b.updatedAt : 0) - (isNum(a.updatedAt) ? a.updatedAt : 0); });
    var rows = [];
    for (i = 0; i < open.length && i < q.cap; i++) {
      r = open[i];
      rows.push({ press: true, screen: 'reviews', params: { id: r.id }, mark: 'review',
                  t: fill('unmatchedName', String(r.name || ''), String(r.regNo || '')),
                  sub: say('unmatchedReview') });
    }
    return { kind: 'card', id: 'reviews', title: say('cardReviewsSort'), rows: rows,
             seeAll: { screen: 'reviews', n: open.length } };
  }

  /* ---- the two per-block states that are not rows ---- */

  // A store with no copy yet is LOADING, not empty: `undefined` is how a screen
  // tells "not loaded" from "nothing there" (v2/cache.js's rule), and drawing
  // "No bus is standing in the yard" over a store that has not been read is a
  // lie that looks exactly like good news.
  function loading(id, title, q) {
    return { kind: 'card', id: id, title: title, rows: [], state: 'loading', n: q.cap };
  }
  function empty(id, title, text, mark) {
    return { kind: 'card', id: id, title: title, rows: [], state: 'empty', text: text, mark: mark };
  }

  /* ---------------------------------------------------------------------- *
   * THE SIX SCREENS. At most four builders each — the cap is this table.
   *
   * DRIVER AND CONDUCTOR ARE NOT HERE AND IT IS NOT AN OMISSION. They land on
   * Me (§4). Today is not drawn, not linked and not in any nav, because for
   * them it would be a shell and a shell is the dead end that cost a month of
   * mechanics' time ([E] 8db78e7). `Caps.holds` already refuses them the screen
   * — Today is open `withCapability` and both hold none — so this table is the
   * second statement of the same fact, not the first.
   * -------------------------------------------------------------------- */
  var BLOCKS = {
    owner: [kpiOwner, needsYou, thisWeek],
    supervisor: [standing, tonightOut, waitingOther, needsYou],
    mechanic: [yourJobs, yourScore],
    store: [kpiStore, partsAsked, orderSoon, jobsWaiting],
    crewmanager: [kpiCrew, emptySeats, notesToApprove],
    office: [kpiOffice, needsTalk, reviewsSort]
  };

  /* The unsent writes, as a set of `store:id`. `Sync.info().pending` is a
   * count, and a count cannot say WHICH row is still in the outbox, so a row
   * only carries "Not sent yet" when the key list is there to say so. Never
   * "Failed", and never removed: it is in the record (§2.4). */
  function pendingSet(info) {
    var keys = info && (list(info.pendingKeys) || list(info.outbox));
    if (!keys) return null;
    var out = {}, i;
    for (i = 0; i < keys.length; i++) out[String(keys[i])] = true;
    return out;
  }

  /* One signature over every store this screen reads, so the cost memo above
   * and any caller that wants to know whether a redraw is needed read the same
   * answer. §2.7 rule 4: each store is read once per content signature, and a
   * redraw with no new records re-reads nothing. */
  var SIG_STORES = ['jobcards', 'buses', 'parts', 'purchases', 'gatechecks', 'nightlist',
                    'drivers', 'users', 'coachai', 'digest', 'rbreviews', 'rbalias',
                    'fuel', 'def', 'ledger', 'trips', 'incidents', 'components'];

  function sigOf() {
    var C = cache();
    if (!C || typeof C.sigOf !== 'function') return '';
    try { return C.sigOf.apply(null, SIG_STORES); } catch (e) { return ''; }
  }

  /* `Today.model(role, rows)` — the whole screen as data, before any markup.
   *
   * `rows` is the store bag plus the four things a pure function cannot read
   * for itself: `me`, `now`, `density` and the sync facts. `render` fills it
   * from the frame's model; a node suite fills it by hand, which is the only
   * reason the rules above are checkable at all. */
  function model(role, rows) {
    rows = rows || {};
    var q = {
      role: role || null,
      me: rows.me || null,
      now: isNum(rows.now) ? rows.now : nowMs(),
      density: rows.density === 'desk' ? 'desk' : 'yard',
      stale: rows.stale === true,
      offline: rows.offline === true,
      syncAt: isNum(rows.syncAt) ? rows.syncAt : null,
      pendingKeys: rows.pendingKeys || null,
      sig: rows.sig == null ? sigOf() : String(rows.sig),
      rows: rows
    };
    q.cap = ROW_CAP[q.density];

    var builders = BLOCKS[q.role] || [];
    var blocks = [], i, b;
    for (i = 0; i < builders.length; i++) {
      b = builders[i](q);
      if (b) blocks.push(b);
    }
    /* The cap, enforced and not merely documented. `BLOCKS` holds at most four
     * per role so this cannot fire today; it fires the day somebody adds a
     * fifth, which is the day it matters, and it says so out loud rather than
     * quietly dropping a block somebody meant to add. */
    if (blocks.length > BLOCK_CAP) {
      warn('more than ' + BLOCK_CAP + ' blocks for role ' + q.role + ': this screen is a doorway (§2.1)');
      blocks.length = BLOCK_CAP;
    }
    return { role: q.role, density: q.density, stale: q.stale, offline: q.offline,
             now: q.now, syncAt: q.syncAt, cap: q.cap, blocks: blocks };
  }

  var said = {};
  function warn(line) {
    if (has(said, line)) return false;
    said[line] = true;
    if (typeof console !== 'undefined' && console.warn) console.warn('[v2] today: ' + line);
    return true;
  }

  /* ---------------------------------------------------------------------- *
   * THE MARKUP. ONE STRING, and the frame does the single insert.
   *
   * No element here is built with createElement and nothing appends per row:
   * per-row appendChild is the shape that cost 277 ms a page (foundation §2.3
   * rule 1). Nothing measures a row either — no offsetHeight, no
   * getBoundingClientRect, no getComputedStyle anywhere in this file.
   * -------------------------------------------------------------------- */
  function render(m) {
    m = m || {};
    var mo = model(m.role, bagOf(m));
    if (!mo.blocks.length) {
      /* Unreachable: `Caps.holds` refuses Today to a role holding no
       * capability, and the six roles above each have at least two blocks
       * behind a capability they hold. If it ever happens, the nav and the
       * declaration disagree, which is LIVE-ISSUES 6 — hence the dev line
       * naming the role rather than a blank card with a heading over it. */
      warn('no block for role ' + mo.role + ': the nav and the declaration disagree');
      return '';
    }
    var out = freshLine(mo), i;
    for (i = 0; i < mo.blocks.length; i++) out += blockHtml(mo, mo.blocks[i]);
    return out;
  }

  // The frame's model, plus the three things it does not carry. `now`, `sync`
  // and the pending keys may be passed in (a test does), and are read from the
  // live app when they are not — which is what every other v2 module does with
  // its neighbours, and it keeps `render` assertable with no clock in it.
  function bagOf(m) {
    var c = m.cache || {};
    var info = m.sync || liveSync();
    return {
      me: m.user || null,
      now: isNum(m.now) ? m.now : nowMs(),
      density: m.density,
      stale: m.stale === true,
      offline: m.offline === true,
      syncAt: info && isNum(info.lastSyncAt) ? info.lastSyncAt : null,
      pendingKeys: pendingSet(info),
      sig: m.sig,
      jobcards: list(c.jobcards), buses: list(c.buses), parts: list(c.parts),
      purchases: list(c.purchases), gatechecks: list(c.gatechecks),
      nightlist: list(c.nightlist), drivers: list(c.drivers), users: list(c.users),
      coachai: list(c.coachai), digest: list(c.digest), rbreviews: list(c.rbreviews),
      rbalias: list(c.rbalias),
      fuel: list(c.fuel), def: list(c.def), ledger: list(c.ledger), trips: list(c.trips),
      incidents: list(c.incidents), components: list(c.components),
      garage: c.garage || null
    };
  }

  function liveSync() {
    var S = sync();
    if (!S || typeof S.info !== 'function') return null;
    try { return S.info(); } catch (e) { return null; }
  }

  /* THE SCREEN STATES ITS FRESHNESS ONCE, HERE. This is the one place on Today
   * that says how old what you are looking at is, and it is why no figure
   * inside a row carries `at`: `at` adds `.figure-note` as a block element,
   * triples the row height and runs the age words once per row. One line, one
   * age call; four tiles carry `at` and no row does. */
  function freshLine(mo) {
    if (mo.offline) {
      var t = hhmm(mo.syncAt);
      return '<p class="today-fresh today-fresh-off">' + draw('offline', 16) + ' '
        + esc(t === null ? say('mayBeOld') : fill('freshOffline', t)) + '</p>';
    }
    var age = agoFrom(mo.now, mo.syncAt);
    var text = age === null ? say('timeUnknown') : say('updatedAgo').replace('{0}', age);
    return '<p class="today-fresh">' + draw('clock', 16) + ' ' + esc(text) + '</p>';
  }

  function blockHtml(mo, b) {
    return b.kind === 'kpi' ? kpiHtml(mo, b) : cardHtml(mo, b);
  }

  /* A figure tile. `figure()` inside `.kpi-v` looks like a collision and is
   * not: `.kpi-v` sets --t2 and weight 650, and `.figure-u`/`.figure-note`
   * re-declare --t6 and weight 400 in components.css, so the unit and the age
   * do not inherit the headline size (§2.2).
   *
   * A TILE IS NOT A CONTROL. No href, no data-act, no press, not focusable.
   * Four tiles that each navigate is four cards to four lists, which is the
   * thing Today must not be. */
  function kpiHtml(mo, b) {
    var out = '<div class="kpirow' + (b.tiles.length === 1 ? ' one' : '') + '">', i, t;
    for (i = 0; i < b.tiles.length; i++) {
      t = b.tiles[i];
      out += '<div class="kpi"><span class="kpi-ic">' + draw(t.mark, 20) + '</span>'
        + '<div class="kpi-b"><div class="kpi-l">' + esc(t.label) + '</div>'
        + '<div class="kpi-v">' + fig(mo, t.value, { format: t.format, unit: t.unit, at: t.at, aggregate: true })
        + chipHtml(t.chip) + '</div></div></div>';
    }
    return out + '</div>';
  }

  // Direction in colour AND in a word: the same arrow means the opposite thing
  // one tile along, so neither the colour nor the arrow carries it alone.
  function chipHtml(chip) {
    if (!chip) return '';
    var word = chip.dir === 'ok' ? say('trendDown') : say('trendUp');
    return '<span class="schip ' + chip.dir + '">' + (chip.dir === 'ok' ? DOWN : UP) + ' '
      + esc(String(Math.abs(chip.pct)) + '%') + '<span class="sr-only"> ' + esc(word) + '</span></span>';
  }

  function cardHtml(mo, b) {
    var out = '<section class="card"><h3>' + esc(b.title) + '</h3>';
    if (b.state === 'loading') out += skel(b.n);
    else if (b.state === 'error') out += errState(b.text);
    else if (b.state === 'empty') out += emptyBox(b.text, b.mark, b.hint);
    else {
      if (b.lead) out += '<p class="today-lead">' + esc(b.lead) + '</p>';
      if (b.lines) out += linesHtml(b.lines);
      if (b.facts) out += factsHtml(mo, b.facts);
      out += rowsHtml(mo, b);
    }
    if (b.primary) {
      out += '<a class="btn btn-primary" href="#" data-nav="' + esc(b.primary.screen) + '">'
        + esc(b.primary.label) + '</a>';
    }
    /* "See all (n)" IS ABSENT AT A COUNT OF 0 OR 1. A button that goes
     * somewhere to show the same one row is a button that lies about there
     * being more, and the heading carries no count either (§2.4 "one item"). */
    if (b.seeAll && b.seeAll.n > 1) {
      out += '<a class="btn btn-quiet today-all" href="#" data-nav="' + esc(b.seeAll.screen) + '">'
        + esc(say('seeAll').replace('{0}', group(b.seeAll.n))) + '</a>';
    }
    if (b.foot) {
      out += '<button type="button" class="btn btn-quiet" data-act="' + esc(b.foot.act) + '">'
        + esc(b.foot.label) + '</button>';
    }
    return out + '</section>';
  }

  function linesHtml(lines) {
    var out = '', i;
    for (i = 0; i < lines.length; i++) out += '<p class="today-line">' + esc(lines[i]) + '</p>';
    return out;
  }

  // The mechanic's three facts. `.drow` and not `.v2row`: they are facts in a
  // panel, they do not press, and they are not in the tab order.
  function factsHtml(mo, facts) {
    var out = '', i, x;
    for (i = 0; i < facts.length; i++) {
      x = facts[i];
      out += '<div class="drow"><span class="drow-i">' + draw(x.mark, 16) + '</span>'
        + '<span class="drow-l">' + esc(x.label) + '</span>'
        + '<span class="drow-v">' + fig(mo, x.value, { format: x.format, aggregate: true })
        + '</span></div>';
    }
    return out;
  }

  function rowsHtml(mo, b) {
    var out = '', i;
    for (i = 0; i < b.rows.length; i++) out += rowHtml(mo, b, b.rows[i]);
    return out;
  }

  /* A row.
   *
   * `a.v2row` when it opens something and `div.v2row` when it does not, and
   * the second is not a disabled first: it has no href, no data-act, no
   * tabindex and no role, so it is not a control and it is not in the tab
   * order. The supervisor's waiting closes and the mechanic's facts are the two
   * places that happens (§2.5).
   *
   * The grid is `auto minmax(0,1fr) auto` from components.css, so a long bus
   * number truncates instead of shrinking the action, and the WHOLE row is the
   * target. */
  function rowHtml(mo, b, r) {
    var cls = 'v2row' + (b.why ? ' v2row-why' : '') + (r.tone ? ' ' + r.tone : '');
    var lead = '<span class="lead' + (r.markTone ? ' tone-' + r.markTone : '') + '">'
      + draw(r.mark, 20) + '</span>';
    var txt = '<div class="txt"><div class="t">' + esc(r.t) + '</div>'
      // The second line is NOT DRAWN at desk density -- a desk row is one line
      // and 32px (foundation §2.1), and Hindi is the reason it is dropped
      // rather than clamped.
      + (mo.density === 'desk' || !r.sub ? '' : '<div class="sub">' + esc(r.sub) + '</div>')
      + '</div>';
    var act = '<div class="act">' + actHtml(mo, r.act) + '</div>';
    if (!r.press) return '<div class="' + cls + '">' + lead + txt + act + '</div>';
    /* The whole params map, not only an id: Attention's rows point at a bus and
     * a check (`{busId, checkId}`) and a row that dropped half of that would
     * open the right screen on the wrong thing. */
    return '<a class="' + cls + '" href="#" data-act="open" data-screen="' + esc(r.screen)
      + '"' + paramAttr(r.params) + '>' + lead + txt + act + '</a>';
  }

  function paramAttr(p) {
    if (!p || typeof p !== 'object') return '';
    var keys = Object.keys(p);
    if (!keys.length) return '';
    var out = '', i;
    for (i = 0; i < keys.length; i++) {
      if (p[keys[i]] == null) continue;
      out += (out ? '&' : '') + encodeURIComponent(keys[i]) + '=' + encodeURIComponent(String(p[keys[i]]));
    }
    /* A query string rather than JSON: it needs no parser, it cannot throw, and
     * every value in it is a record id. `encodeURIComponent` plus `esc` is two
     * escapes for one attribute and both are needed — one for the URL grammar
     * and one for the HTML one. */
    return out ? ' data-params="' + esc(out) + '"' : '';
  }

  function readParams(el) {
    var raw = el.getAttribute('data-params');
    if (!raw) return null;
    var out = {}, parts = String(raw).split('&'), i, kv, n = 0;
    for (i = 0; i < parts.length; i++) {
      kv = parts[i].split('=');
      if (kv.length !== 2 || !kv[0]) continue;
      try { out[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1]); n++; } catch (e) { continue; }
    }
    return n ? out : null;
  }

  function actHtml(mo, a) {
    if (!a) return '';
    if (a.html) return a.html;
    if (a.badge) return '<span class="badge badge-' + a.badge + '">' + esc(a.label) + '</span>';
    if (has(a, 'figure')) return fig(mo, a.figure, { unit: a.unit, format: a.format });
    return '';
  }

  /* `figure()`, with §1.8's rule applied in the one place it can be.
   *
   * An AGGREGATE drawn while this device is still filling its first copy is
   * marked `stale`, so it carries "may be out of date" in words beside it: a
   * partial total drawn as final is [E] 2170703 and it is the figure, not the
   * screen, that is wrong. A ROW's figure is one record's own value and not an
   * aggregate, and it is NOT marked — `stale` adds `.figure-note`, and a
   * `.figure-note` inside a `.v2row` adds a block element, triples the row
   * height and runs the age words per row, which is the rule this whole screen
   * is arranged around. */
  function fig(mo, v, o) {
    o = o || {};
    if (typeof root.figure !== 'function') return '';
    var opts = { unit: o.unit, format: o.format };
    if (o.aggregate) {
      opts.at = o.at;
      if (mo.stale) opts.stale = true;
    }
    return root.figure(v, opts);
  }

  function skel(n) { return typeof root.skeleton === 'function' ? root.skeleton(n) : ''; }
  function emptyBox(text, mark, hint) {
    return typeof root.emptyState === 'function'
      ? root.emptyState(text, { icon: mark || 'doc', hint: hint }) : '';
  }
  /* The retry is ONE hoisted function and not a fresh closure per render:
   * `ui/states.js` keys its handlers by function identity and caps the list at
   * 200, so an inline arrow on a screen that redraws every few seconds would
   * add an entry a tick — the leak that cap exists to bound rather than a use
   * of it. */
  function retry() {
    var r = router();
    if (r && typeof r.go === 'function') r.go(ID);
  }
  function errState(text) {
    return typeof root.errorState === 'function' ? root.errorState(text, retry) : '';
  }

  /* ---------------------------------------------------------------------- *
   * MOUNT — ONE delegated listener, and the first line of it is the one a
   * shipped regression was missing.
   *
   * `ev.target.closest('input, select, textarea, label, .num')` returns early
   * BEFORE anything reads `[data-act]`, so a tap inside a field never routes.
   * The regression it is written against: tapping a count field navigated away
   * instead of letting the storekeeper type, and the fix is this line in the
   * one listener rather than a stopPropagation on each field
   * (predeploy-gate.sh's stock-count block, foundation §3.7's rule 2).
   *
   * Today draws no field today, which is exactly why the line is written now:
   * the next person to add one will not know it is missing, and a listener that
   * is right only because the screen happens to be read-only is a listener that
   * breaks the day it stops being.
   *
   * `[data-nav]` is NOT read here. The frame already owns it (`v2/shell.js`'s
   * one document listener), and two handlers for one attribute is two places to
   * change it. This one handles `[data-act]`, which is the things only this
   * screen knows how to do.
   * -------------------------------------------------------------------- */
  var mounted = false;

  function onClick(ev) {
    var t = ev && ev.target;
    if (!t || typeof t.closest !== 'function') return;
    // THE LINE. Before [data-act], before anything.
    if (t.closest('input, select, textarea, label, .num')) return;
    var el = t.closest('[data-act]');
    if (!el) return;
    var act = el.getAttribute('data-act');
    if (act === 'open') {
      if (ev.preventDefault) ev.preventDefault();
      var screen = el.getAttribute('data-screen');
      var r = router();
      if (screen && r && typeof r.go === 'function') r.go(screen, readParams(el));
      return;
    }
    if (act === 'digest') { if (ev.preventDefault) ev.preventDefault(); openDigest(); return; }
    if (act === 'howcounted') { if (ev.preventDefault) ev.preventDefault(); openHowCounted(); }
  }

  function mount() {
    var d = doc();
    if (mounted || !d || typeof d.addEventListener !== 'function') return false;
    mounted = true;
    d.addEventListener('click', onClick);
    return true;
  }

  function sheet(title, html) {
    var v = V();
    if (!v || typeof v.openSheet !== 'function') return false;
    v.openSheet(title, html);
    return true;
  }

  // The whole digest, in the sheet the "Read it all" row opens. Built from the
  // record, so a week with no sections is a short sheet and not an empty one.
  function openDigest() {
    var m = { role: null, cache: cacheOf(), user: userOf(), density: 'yard' };
    var rows = bagOf(m), best = null, i, r;
    var all = rows.digest || [];
    for (i = 0; i < all.length; i++) {
      r = all[i];
      if (!live(r) || !r.week) continue;
      if (!best || String(r.week) > String(best.week)) best = r;
    }
    if (!best) return false;
    var out = best.headline ? '<p class="today-lead">' + esc(String(best.headline)) + '</p>' : '';
    var secs = list(best.sections) || [], k, n;
    for (k = 0; k < secs.length; k++) {
      out += '<h3>' + esc(String(secs[k].title || '')) + '</h3>';
      var ls = list(secs[k].lines) || [];
      for (n = 0; n < ls.length; n++) out += '<p class="today-line">' + esc(String(ls[n])) + '</p>';
    }
    return sheet(say('cardThisWeek'), out);
  }

  // The three definitions, in words. Not a formula: the mechanic is being told
  // what is counted, not shown the arithmetic of a score he cannot check.
  function openHowCounted() {
    return sheet(say('howCounted'),
      '<p class="today-line">' + esc(say('howCountedOpen')) + '</p>'
      + '<p class="today-line">' + esc(say('howCountedRework')) + '</p>'
      + '<p class="today-line">' + esc(say('howCountedBay')) + '</p>');
  }

  /* `S` is a top-level const in a classic script, so it is resolved the two
   * ways every other v2 module resolves its neighbours — the bare name first,
   * the window second — rather than assumed to be a window property. */
  function appState() {
    return (typeof S !== 'undefined' && S) || (root && root.S) || null;
  }
  function cacheOf() { var a = appState(); return (a && a.cache) || {}; }
  function userOf() { var a = appState(); return (a && a.user) || null; }

  /* ---------------------------------------------------------------------- */
  var api = {
    render: render,
    model: model,
    mount: mount,
    // Test seams only, the shape of Router._reset and Shell._reset: a node
    // suite cannot reload a classic script per case.
    _reset: function () {
      mounted = false;
      _costMemo = {};
      Object.keys(said).forEach(function (k) { delete said[k]; });
    },
    _labels: LABELS,
    _blocks: BLOCKS
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.Today = api;
    // Registers itself at load and draws nothing until Shell.mount asks, which
    // is what index.html's script order says every screen module does.
    var R = router();
    if (R && typeof R.register === 'function') R.register(ID, api);
  }
})(typeof window !== 'undefined' ? window : this);

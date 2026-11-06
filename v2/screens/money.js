/* Garage Saathi v2 — screen #7, Money. Plain script, no module system.
 * Test: test_v2_money.js. Spec: docs/v2/plan/screens-money-people.md §1.
 *
 * "What did running the fleet cost, where did it go, and what do we owe?"
 *
 * THIS IS THE SCREEN THAT COMPUTES, AND IT COMPUTES IN ONE PLACE THAT IS NOT
 * THIS FILE. `Cost.forBus` is the one cost basis (`v2/cost.js`); Buses (#5) and
 * Today (#1) read it and are checked for holding no arithmetic of their own.
 * The reason is the only arrangement in which two screens cannot disagree about
 * one number: exactly one of them does the sum. v1 had FIVE per-bus cost bases
 * and they disagreed, so people stopped reading all five (`01 §5.2`).
 *
 * So what this file adds is not a basis. It is:
 *   - the WINDOW, as a `days` count and an end stamp handed to `Cost.forBus`
 *     (the module reads no clock; `now` is an argument);
 *   - the FLEET AGGREGATE, which is the per-bus answers summed part by part;
 *   - THE SECOND PATH over that aggregate. The six fleet parts are summed
 *     independently of the fleet total, and if the two disagree to the rupee
 *     the hero is NOT DRAWN. A total that disagrees with its parts is exactly
 *     how five bases happened, and a wrong total is worse than no total
 *     (§1.1; [E] `8db78e7`).
 *   - the drawing, in which the six parts are six rows under the hero and the
 *     last line of the card is the arithmetic in words: "Fuel & AdBlue 2,41,300
 *     + Parts 1,58,940 + … = 6,03,410". It reconciles ON SCREEN, not in a
 *     comment, because the reader is the person who has to believe it.
 *
 * NO PER-KM FIGURE WITHOUT A TRUSTED DIVISOR. [E] `8db78e7`: ₹45,000 of work
 * read as ₹45,000 PER KILOMETRE because the odometer was missing. It topped the
 * money-pit list and sent the owner to inspect a healthy bus. The divisor comes
 * from `Odo.kmOver`, which refuses four ways, and nothing here defaults one —
 * no `|| 1`, no `|| 0`, no "assume the last reading". A bus whose reading
 * cannot be trusted leaves the per-km ranking IN BOTH DIRECTIONS (`Cost.rankPerKm`
 * excludes it rather than sorting it first or last, which is the half of
 * `8db78e7` that was never fixed) and is listed separately under a stated
 * heading with the reason `Odo` gave, in words.
 *
 * THE MONEY PIT DEFAULTS TO "BY TOTAL", not to "By cost per km". Rupees are
 * always knowable; per km is not. The owner's first list is the one that cannot
 * lie (§1.4).
 *
 * ONE SPEC BUG WAS ALREADY FOUND IN THE PARTS LINE, AND IT IS WORTH KNOWING WHY
 * SO NOBODY PUTS IT BACK. The spec said Parts was `sum(qty x cost)`. In v1,
 * `partsUsed[].cost` is ALREADY the line total — `app.js:1638` sums it alone
 * and `app.js:7682` accumulates it the same way — so `qty x cost` would have
 * multiplied every parts figure by its quantity: two brake pads at ₹900 reading
 * ₹1,800, on the screen whose entire job is to reconcile. Slice P2 refused to
 * implement it and the spec is corrected (`DECISIONS.md §19`). Nothing in this
 * file multiplies a part line by anything, and nothing in it should: the sum is
 * `Cost.forBus`'s and this screen reads it.
 *
 * ONE DELEGATED LISTENER, returning early on
 * `closest('input, select, textarea, label, .num')` BEFORE it reads [data-act]
 * — the trip sheets carry `.num` amount fields and two selects, and a field
 * whose click reached the row handler is what threw the storekeeper off the
 * screen mid-count (`v2-foundation-ui.md §3.3`).
 *
 * TWO THINGS ABOUT WHO IS READING THIS SCREEN, both recorded because they will
 * otherwise be rediscovered:
 *
 * 1. THE TRIP ENTRY IS MONEY ENTERED AND RECONCILED BY THE SAME PERSON.
 *    `DECISIONS.md §11`: the driver's Trip cash screen was dropped, which left
 *    the per-bus running cost with no input, which would have made that number
 *    wrong rather than absent — so the supervisor enters it. The owner chose
 *    that knowing it puts both halves in one pair of hands, and `DECISIONS.md
 *    §10` is the control that offsets it: a job the supervisor closes needs a
 *    second person's signature. `trips` is already supervisor-writable on the
 *    server (`02 §4.4`), so this needs no new capability and no server change.
 *
 * 2. HIDING A FIGURE HERE IS NOT PROTECTING IT. Owner and supervisor both reach
 *    this screen (`DECISIONS.md §5`: the 2 November decision to take company
 *    money off the supervisor is reversed, because a supervisor actually does
 *    the cash reconciliation). Every redaction below — the vendor names behind
 *    `bills`, the challan row behind `challans` — is a CLIENT rule over records
 *    the device already holds: `LIVE-ISSUES.md` issue 2 is that a `conductor`
 *    token holding ZERO capabilities can still `/pull` supplier bills, the
 *    ledger, job-card costs and trip cash in full, because `redact_for` returns
 *    everything it does not explicitly deny. §7.1 of the spec's backend list is
 *    that read boundary, and it is stage 3's single largest security item. A
 *    screen that hides money is not a screen that protects it.
 */
(function (root) {
  'use strict';

  var ID = 'money';
  var DAY = 86400000;

  /* §1.3: the money pit is CAPPED at 8 visible with "See all 89 buses", and it
   * is never windowed — `.v2row-why` grows to two lines, and windowing needs a
   * row height it can compute without measuring (foundation §2.4). */
  var PIT_CAP = 8;
  var TRIP_CAP = 6;
  var DUES_CAP = 8;
  /* §1.3: 89 buses at --row-h is well inside the 200-row cap, so the per-bus
   * table is one string with one insert, no windowing and no measurement per
   * row. The number is the foundation's, not this screen's; a fleet past it
   * would need §2.4's windowed one-line row, which is why the cap is named
   * rather than assumed. */
  var BUS_CAP = 200;
  var OLD_DUE_DAYS = 30;              // "Over 30 days" on a supplier bill
  var TREND_MONTHS = 6;

  /* The rupee symbol, for the ONE figure that needs it with a decimal place.
   * `fmt.rupees` rounds to the whole rupee — correct everywhere else on this
   * screen, and wrong for a cost per km, where ₹14 and ₹14.20 are different
   * answers to the owner's question. The symbol goes in front exactly as
   * `fmt.js` puts it there, and a cost per km is never negative. */
  var RUPEE = '₹';

  /* The six parts, in §1.1's order, each mapped to the word id `v2/cost.js`
   * registered for it. The LABELS are not re-typed here: Money and Buses read
   * the same six names from the same table, so the screen that computes and the
   * screen that reads cannot call a part two different things. */
  var PARTS = [
    { id: 'fuel', word: 'costFuel', mark: 'fuel', err: 'moErrFuel' },
    { id: 'parts', word: 'costParts', mark: 'part', err: 'moErrParts' },
    { id: 'labour', word: 'costLabour', mark: 'person', err: 'moErrLabour' },
    { id: 'outside', word: 'costOutside', mark: 'bus', err: 'moErrOutside' },
    { id: 'trip', word: 'costTrip', mark: 'money', err: 'moErrTrip' },
    { id: 'misc', word: 'costMisc', mark: 'warn', err: 'moErrMisc' }
  ];

  /* The stores `Cost.forBus` reads. A store this device does not hold is passed
   * through as `undefined` and NOT as `[]`: an empty array is "read and found
   * nothing", which is 0, and turning a store that could not be read into a 0
   * is the `|| 0` that invents money. */
  var COST_STORES = ['fuel', 'def', 'jobcards', 'ledger', 'trips', 'incidents', 'components'];

  /* Every store this screen reads, which is the seven above plus the four it
   * reads on its own account: `buses` (the per-bus table and every registration
   * on it), `purchases` (owed to suppliers), `challans` (the fine liability,
   * which is deliberately NOT one of the six parts) and `meta` (the garage).
   *
   * It did not exist, and that is the whole of REV-FLOW F3 on this screen. Of
   * the seven cost stores only `fuel`, `jobcards`, `incidents` and `components`
   * are in `PullApply.FIRST_STORES`, nothing else in v2 loads `trips` at all,
   * and `ledger`, `purchases` and `def` arrive only through Store, Attention or
   * Fuel & tyres — screens the owner may not have opened. Measured on the
   * screen: `Running cost, this month — No data`, `Trip cash — No data
   * "Could not read the trip cash"`, and a total that was never shown because
   * one of its six parts was permanently absent. Refusing the total was
   * correct; having nothing to total was not. */
  var STORES = COST_STORES.concat(['buses', 'purchases', 'challans', 'meta']);

  var PERIODS = ['this', 'last', 'm3', 'year', 'dates'];

  var WORDS = {
    moTabThis: { en: 'This month', hi: '' },
    moTabLast: { en: 'Last month', hi: '' },
    moTabM3: { en: '3 months', hi: '' },
    moTabYear: { en: 'Year', hi: '' },
    moTabDates: { en: 'Dates', hi: '' },

    /* The period, as it reads inside a sentence — "Running cost, this month".
     * Separate ids from the tab labels because a tab is a title and this is a
     * phrase: "Last month" on a strip and "running cost, last month" in a line
     * are not the same string in either language. */
    moInThis: { en: 'this month', hi: '' },
    moInLast: { en: 'last month', hi: '' },
    moInM3: { en: 'the last 3 months', hi: '' },
    moInYear: { en: 'this year', hi: '' },
    moInDates: { en: 'the chosen dates', hi: '' },

    moHero: { en: 'Running cost, {period}', hi: '' },
    moReconcile: { en: 'These six add up to the total. Any rupee you cannot see here is not in it.', hi: '' },
    moExcluded: { en: 'Supplier bills and challans are money we owe, not running cost. They are below.', hi: '' },

    moTrend: { en: 'Month by month', hi: '' },
    moTrendUp: { en: 'Up {amount} on last month', hi: '' },
    moTrendDown: { en: 'Down {amount} on last month', hi: '' },
    moTrendSame: { en: 'Same as last month', hi: '' },
    moTrendFirst: { en: 'Nothing before this to compare', hi: '' },

    moPerKm: { en: 'Fleet cost per km', hi: '' },
    moPerKmOver: { en: { one: 'Worked out over {km} km from 1 bus.',
                         other: 'Worked out over {km} km from {n} buses.' },
                   hi: { one: '', other: '' } },
    moNoKmTail: { en: { one: '1 bus has no km.', other: '{n} buses have no km.' },
                  hi: { one: '', other: '' } },
    moNoKm: { en: 'No km', hi: '' },
    moNoKmHead: { en: { one: 'Cannot work out cost per km (1)',
                        other: 'Cannot work out cost per km ({n})' },
                  hi: { one: '', other: '' } },

    moPit: { en: 'Where the money went', hi: '' },
    moPitTotal: { en: 'By total', hi: '' },
    moPitPerKm: { en: 'By cost per km', hi: '' },
    moWhyTotal: { en: '{part} is the largest part of it, {amount}', hi: '' },
    moWhyPerKm: { en: '{amount} per km over {km} km', hi: '' },
    moSeeAll: { en: { one: 'See the 1 bus', other: 'See all {n} buses' },
                hi: { one: '', other: '' } },

    moTripCash: { en: 'Trip cash', hi: '' },
    moGive: { en: 'Give allowance', hi: '' },
    moBack: { en: 'Expenses back', hi: '' },
    moCloseTrip: { en: 'Close this trip', hi: '' },
    moClosing: { en: 'Closing...', hi: '' },
    moAllTrips: { en: { one: 'All trips, 1 in this period', other: 'All trips, {n} in this period' },
                  hi: { one: '', other: '' } },
    moTripNone: { en: 'No trips recorded', hi: '' },
    moTripOpen: { en: 'Open since {time}, expenses not back', hi: '' },
    moTripRunning: { en: 'Open since {time}, {count} expenses back so far', hi: '' },
    moTripZero: { en: 'Closed, nothing spent', hi: '' },
    moTripClosed: { en: 'Closed {time}', hi: '' },

    moChooseBus: { en: 'Choose the bus', hi: '' },
    moDriver: { en: 'Driver', hi: '' },
    moNoSeat: { en: 'Nobody on the seat', hi: '' },
    moDate: { en: 'Date', hi: '' },
    moAllowance: { en: 'Allowance given', hi: '' },
    moAllowanceHint: { en: 'Rupees handed to the driver', hi: '' },
    moSaveAllowance: { en: 'Save allowance', hi: '' },
    moSaveGuard: { en: 'Choose the bus and type the amount', hi: '' },
    moSaving: { en: 'Saving...', hi: '' },
    moNotSaved: { en: 'Not saved until you press Save allowance', hi: '' },
    moNotSavedExp: { en: 'Not saved until you press Save expenses', hi: '' },
    moNoOpenTrip: { en: 'No trip is open to put expenses against', hi: '' },
    moSavedAllowance: { en: 'Allowance saved', hi: '' },

    moBackTitle: { en: 'What came back', hi: '' },
    moChooseTrip: { en: 'Choose the trip', hi: '' },
    moExpAmount: { en: 'Amount', hi: '' },
    moExpWhat: { en: 'What for?', hi: '' },
    moExpMode: { en: 'Cash or card', hi: '' },
    moModeCash: { en: 'Cash', hi: '' },
    moModeCard: { en: 'Card', hi: '' },
    moAddAnother: { en: 'Add another', hi: '' },
    moSaveExpenses: { en: 'Save expenses', hi: '' },
    moSavedExpenses: { en: 'Expenses saved', hi: '' },
    moCloseAsk: { en: 'Close this trip? Expenses cannot be added here afterwards.', hi: '' },
    moClosedTrip: { en: 'Trip closed', hi: '' },
    moFrozen: { en: 'Closed trips cannot be changed here.', hi: '' },

    /* v1's eight expense categories, by v1's own keys (`app.js:10873`). The keys
     * are the record's, so nothing new is written into `expenses[]`; the labels
     * are v2's because v1 drew three of them with an emoji, and Windows 7 has
     * no font for those. */
    moCatDiesel: { en: 'Diesel on the road', hi: '' },
    moCatFastag: { en: 'FASTag', hi: '' },
    moCatFood: { en: 'Food', hi: '' },
    moCatBreakdown: { en: 'Breakdown', hi: '' },
    moCatPolice: { en: 'Police', hi: '' },
    moCatRto: { en: 'RTO', hi: '' },
    moCatToll: { en: 'Toll in cash', hi: '' },
    moCatOther: { en: 'Other', hi: '' },

    moOwe: { en: 'Unpaid supplier bills', hi: '' },
    moOweCount: { en: { one: '1 bill, {old} of them over 30 days',
                        other: '{n} bills, {old} of them over 30 days' },
                  hi: { one: '', other: '' } },
    moOverDue: { en: 'Over 30 days', hi: '' },
    moOpenBills: { en: 'Open the bills', hi: '' },
    moDuesHidden: { en: 'Supplier names are not shown for your login.', hi: '' },
    moBillAge: { en: { one: '1 day old', other: '{n} days old' }, hi: { one: '', other: '' } },

    moChallans: { en: { one: 'Challans pending {amount} on 1 bus',
                        other: 'Challans pending {amount} on {n} buses' },
                  hi: { one: '', other: '' } },
    moCheckChallans: { en: 'Check challans (uses 1 credit)', hi: '' },
    moChecking: { en: 'Checking... each bus costs 1 credit', hi: '' },
    moCheckFailed: { en: 'The check did not run. No credit was spent.', hi: '' },
    moAllChecked: { en: 'Every bus has been checked', hi: '' },

    moReport: { en: 'Make the report for this period', hi: '' },
    moReporting: { en: 'Making the report...', hi: '' },

    moThBus: { en: 'Bus', hi: '' },
    moThTotal: { en: 'Running cost', hi: '' },
    moThKm: { en: 'km', hi: '' },
    moThPerKm: { en: 'Cost per km', hi: '' },

    moDatesTitle: { en: 'Choose the dates', hi: '' },
    moFrom: { en: 'From', hi: '' },
    moTo: { en: 'To', hi: '' },
    moUseDates: { en: 'Use these dates', hi: '' },

    moEmpty: { en: 'No spending recorded for {period}', hi: '' },
    moEmptyHint: { en: 'Choose another period, or log a fuel fill or a bill.', hi: '' },
    moHeroHeld: { en: 'One part could not be read, so the total is not shown.', hi: '' },
    moMismatch: { en: 'The parts do not add up to the total', hi: '' },
    moErrFuel: { en: 'Could not read the fuel log', hi: '' },
    moErrParts: { en: 'Could not read the parts issued', hi: '' },
    moErrLabour: { en: 'Could not read the labour hours', hi: '' },
    moErrOutside: { en: 'Could not read the outside work', hi: '' },
    moErrTrip: { en: 'Could not read the trip cash', hi: '' },
    moErrMisc: { en: 'Could not read the incidents', hi: '' },
    moErrBills: { en: 'Could not read the supplier bills', hi: '' },
    moOffline: { en: 'No connection since {time}. Figures may be out of date.', hi: '' },
    /* AND THE SAME SENTENCE WITH NO TIME IN IT, because a phone that has never
     * sent anything has no "since". REV-FLOW F6 was `lastSyncAt` seeded to 0
     * rather than null, so the epoch rendered as a clock time and this read
     * "No connection since 05:30" on a device that had never synced. With the honest
     * null the one above would render with an empty slot instead — a dangling
     * sentence, which is the same defect wearing better manners — so there are
     * two words for the two facts. */
    moOfflineEver: { en: 'This phone has not sent anything yet. Figures may be out of date.', hi: '' },
    moNeedsNet: { en: 'Needs a connection', hi: '' },
    moNotSent: { en: 'Not sent. The entry is saved on this phone. It will send when there is signal.', hi: '' }
  };

  var CATS = [['diesel', 'moCatDiesel', 'card'], ['fastag', 'moCatFastag', 'card'],
              ['food', 'moCatFood', 'cash'], ['breakdown', 'moCatBreakdown', 'cash'],
              ['police', 'moCatPolice', 'cash'], ['rto', 'moCatRto', 'cash'],
              ['toll', 'moCatToll', 'cash'], ['other', 'moCatOther', 'cash']];

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
      var e = WORDS[id] ? WORDS[id].en : '';
      s = typeof e === 'string' ? e : (n === 1 ? e.one : e.other);
      if (n !== undefined && n !== null) s = String(s).replace(/\{n\}/g, String(n));
    }
    return vals ? put(s, vals) : s;
  }

  // The six part names and Odo's refusal messages are registered by their own
  // files, so they are read through w() and not copied into WORDS above.
  function other(id, n) {
    register();
    return registered && typeof root.w === 'function' ? root.w(id, n) : '';
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function draw(name, size) { return typeof root.icon === 'function' ? root.icon(name, { size: size }) : ''; }
  function cost() { return root.Cost || null; }
  function odo() { return root.Odo || null; }
  function f() { return root.fmt || null; }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function live(r) { return r && !r._deleted; }
  function list(v) { return Array.isArray(v) ? v : null; }
  function rowsOf(m, name) { return list(m && m.cache && m.cache[name]) || []; }

  function can(role, cap) {
    var c = root.Caps;
    return !!(c && typeof c.can === 'function' && c.can(role, cap));
  }
  function holds(role, screen) {
    var c = root.Caps;
    return !!(c && typeof c.holds === 'function' && c.holds(role, screen));
  }

  function rupees(v) { var m = f(); return m ? m.rupees(v) : String(v); }
  function grouped(v) { var m = f(); return m ? m.groupIndian(v) : String(v); }
  function perKmWords(v) { var m = f(); return RUPEE + (m ? m.oneDecimal(v) : String(v)); }

  function hhmm(ms) {
    if (!isNum(ms)) return '';
    var d = new Date(ms);
    if (isNaN(d.getTime())) return '';
    var h = d.getHours(), mi = d.getMinutes();
    return (h < 10 ? '0' : '') + h + ':' + (mi < 10 ? '0' : '') + mi;
  }
  // A month's name comes from Intl, exactly as `v2/odo.js` gets a date's: a
  // month is not a fixed word of this app's, and a table of twelve of them here
  // would be twelve more ids for the owner to translate that the platform
  // already has in both languages.
  function monthName(ms) {
    var d = new Date(ms);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-IN', { month: 'long' });
  }
  function ymdLocal(ms) {
    var d = new Date(ms);
    if (isNaN(d.getTime())) return '';
    var mo = d.getMonth() + 1, da = d.getDate();
    return d.getFullYear() + '-' + (mo < 10 ? '0' : '') + mo + '-' + (da < 10 ? '0' : '') + da;
  }

  /* ====================================================================== *
   * THE WINDOW
   *
   * `Cost.forBus(busId, days, rows, now)` takes a trailing window: `now` is its
   * END and `days` its span. That is enough for every period in §1.2 — "last
   * month" is not a trailing window from today, it is a trailing window whose
   * end is the last instant of last month — and it is why `now` is an argument
   * and not a clock read inside the module.
   * ====================================================================== */

  var current = 'this';                // local, never a route: see onClick
  var customFrom = null, customTo = null;
  var showAll = false;                 // the per-bus table, revealed in place
  var pit = 'total';                   // §1.4: "By total" is the DEFAULT

  function periodId(id) {
    if (PERIODS.indexOf(String(id)) >= 0) current = String(id);
    return current;
  }
  function pitTab(id) {
    if (id === 'total' || id === 'perkm') pit = id;
    return pit;
  }

  function monthStart(ms, back) {
    var d = new Date(ms);
    return new Date(d.getFullYear(), d.getMonth() - (back || 0), 1, 0, 0, 0, 0).getTime();
  }
  function yearStart(ms) {
    var d = new Date(ms);
    return new Date(d.getFullYear(), 0, 1, 0, 0, 0, 0).getTime();
  }
  function dayEnd(ms) {
    var d = new Date(ms);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
  }

  /* `{from, to, word}` for the chosen period, and `days` derived from the two
   * rather than typed: a month is 28, 29, 30 or 31 days and a hard-coded 30
   * would quietly include or drop records at one end.
   *
   * The floor on the span is deliberate and tiny. On the first of the month at
   * midnight exactly, "this month" is a window of zero length, and
   * `Cost.forBus` refuses a non-positive `days` — correctly, because dividing
   * by it later is the whole family of bugs this screen is built against. A
   * second of span keeps that day's records in the window (the card-date
   * comparison is by calendar day) without inventing any. */
  function windowOf(id, now) {
    if (id === 'last') {
      var s = monthStart(now, 0);
      return { from: monthStart(now, 1), to: s - 1, word: 'moInLast' };
    }
    if (id === 'm3') return { from: monthStart(now, 2), to: now, word: 'moInM3' };
    if (id === 'year') return { from: yearStart(now), to: now, word: 'moInYear' };
    if (id === 'dates' && isNum(customFrom) && isNum(customTo) && customTo > customFrom) {
      return { from: customFrom, to: customTo, word: 'moInDates' };
    }
    return { from: monthStart(now, 0), to: now, word: 'moInThis' };
  }
  function daysOf(win) { return Math.max((win.to - win.from) / DAY, 1 / 86400); }

  /* ====================================================================== *
   * THE QUERY. Everything a row needs, and nothing a row may not have.
   * ====================================================================== */

  /* The rows, bucketed by bus ONCE, so each `Cost.forBus` call sees only its own
   * bus's records. Calling it 89 times with the whole ledger is "work
   * proportional to the whole dataset, performed per item" (foundation §2.7) —
   * 89 full passes over 20,000 ledger rows on a Core 2 Duo is the 386 ms
   * `computeInsights()` bug again. `ledger` is bucketed by the BUS OF ITS JOB,
   * because a ledger row names a job and not a bus. */
  function bucketByBus(cache) {
    var out = {}, jobBus = {}, i, k, store, r, id;
    var cards = list(cache.jobcards);
    if (cards) for (i = 0; i < cards.length; i++) if (cards[i]) jobBus[cards[i].id] = cards[i].busId;
    for (k = 0; k < COST_STORES.length; k++) {
      store = list(cache[COST_STORES[k]]);
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

  function rowsFor(buckets, busId, garage) {
    var per = { garage: garage };
    for (var k = 0; k < COST_STORES.length; k++) {
      var m = buckets[COST_STORES[k]];
      per[COST_STORES[k]] = m === null ? undefined : (m[busId] || []);
    }
    return per;
  }

  /* The garage's labour rate, which Labour needs and nothing else does. v2's
   * cache carries `meta` as a store and `garage` as a resolved record depending
   * on who filled it, so both are read and neither is invented: with hours on a
   * card and no rate, `Cost.forBus` makes Labour UNKNOWN rather than falling
   * back to v1's silent 250, which would invent money. */
  function garageOf(cache) {
    if (cache.garage) return cache.garage;
    var meta = list(cache.meta) || [];
    for (var i = 0; i < meta.length; i++) if (meta[i] && meta[i].key === 'garage') return meta[i];
    return null;
  }

  /* Every odometer reading this device holds for a bus, from the three records
   * that carry one (§1.4). The reading and its TIME both have to be real:
   * `Odo.kmOver` drops anything it cannot place in the window, and a reading
   * whose time had to be guessed is a reading that can become the wrong end of
   * the span. A card's time is its enter stamp, then its create stamp, then its
   * job date at midnight — in that order, because the first two are instants
   * the app wrote and the third is a day somebody typed. */
  function readingsOf(cache) {
    var by = {}, i, r, at;
    function add(busId, km, when) {
      if (busId == null || !isNum(when)) return;
      (by[busId] || (by[busId] = [])).push({ km: km, at: when });
    }
    var fuel = list(cache.fuel) || [];
    for (i = 0; i < fuel.length; i++) { r = fuel[i]; if (live(r)) add(r.busId, r.odometer, r.at); }
    var cards = list(cache.jobcards) || [];
    for (i = 0; i < cards.length; i++) {
      r = cards[i];
      if (!live(r)) continue;
      at = isNum(r.enterAt) ? r.enterAt : (isNum(r.createdAt) ? r.createdAt : Date.parse(r.jobDate));
      add(r.busId, r.odometer, at);
    }
    var buses = list(cache.buses) || [];
    for (i = 0; i < buses.length; i++) {
      r = buses[i];
      if (live(r)) add(r.id, r.odometer, isNum(r.odometerAt) ? r.odometerAt : undefined);
    }
    return by;
  }

  /* One bus: its cost over the window, and its km over the same window. Neither
   * is derived from the other and the km is never defaulted. */
  function perBus(cache, win, viewer) {
    var C = cost(), O = odo();
    var buses = list(cache.buses) || [];
    var buckets = bucketByBus(cache);
    var garage = garageOf(cache);
    var reads = readingsOf(cache);
    var days = daysOf(win);
    var out = [], i;
    for (i = 0; i < buses.length; i++) {
      var b = buses[i];
      if (!live(b)) continue;
      var c = null;
      if (C && typeof C.forBus === 'function') {
        try { c = C.forBus(b.id, days, rowsFor(buckets, b.id, garage), win.to); } catch (e) { c = null; }
      }
      var km = null;
      if (O && typeof O.kmOver === 'function') {
        km = O.kmOver(b, reads[b.id] || [], win.from, win.to);
      }
      /* `open` is "may this viewer open this bus on Buses (#5)". A row the
       * person cannot act on is NOT DRAWN (§7.1 item 5, and the four rules
       * every screen brief carries), so it is decided here, in the function
       * that produces the array, and not in the view — a capability checked in
       * the view is a query that should have narrowed and did not
       * (v2-ux.md §4.3). */
      out.push({ busId: b.id, reg: b.regNo || b.id, cost: c, km: km,
                 open: holds(viewer && viewer.role, 'buses') });
    }
    return out;
  }

  /* THE FLEET AGGREGATE, AND THE SECOND PATH OVER IT.
   *
   * `total` is the sum of what `Cost.forBus` answered per bus. The six `parts`
   * are summed INDEPENDENTLY, part by part across the same buses. Then the two
   * are compared through `Cost.reconciles`, and if they disagree to the rupee
   * the total is withheld with `why: 'mismatch'` and the screen draws the
   * refusal instead of a number.
   *
   * That comparison cannot fail while this function is right, and it is made
   * anyway, for the reason the basis exists at all: a total that disagrees with
   * its parts is how five bases happened. It is the check that catches a future
   * edit here — a seventh part, a dropped part, a bus counted twice — rather
   * than drawing the consequence.
   *
   * A part that any bus could not read is unknown fleet-wide, and then the
   * total is absent rather than smaller: a smaller number presented as complete
   * is the failure. `n` is carried through so a part that was READ and found
   * nothing can say so without the total having to be hidden. */
  function aggregate(rows) {
    var C = cost();
    var sums = [], unknown = [], i, p, j;
    for (i = 0; i < PARTS.length; i++) sums.push({ id: PARTS[i].id, value: 0, n: 0, bad: false });
    var totals = 0, held = false;
    for (i = 0; i < rows.length; i++) {
      var c = rows[i].cost;
      if (!c || !Array.isArray(c.parts)) { held = true; for (j = 0; j < sums.length; j++) sums[j].bad = true; continue; }
      for (j = 0; j < sums.length; j++) {
        p = c.parts[j];
        if (!p || p.id !== sums[j].id || !isNum(p.value)) sums[j].bad = true;
        else { sums[j].value += p.value; sums[j].n += p.n; }
      }
      if (!isNum(c.total)) held = true; else totals += c.total;
    }
    var parts = [];
    for (i = 0; i < sums.length; i++) {
      parts.push({ id: sums[i].id, word: PARTS[i].word, mark: PARTS[i].mark, err: PARTS[i].err,
                   value: sums[i].bad ? null : sums[i].value, n: sums[i].n });
      if (sums[i].bad) unknown.push(sums[i].id);
    }
    var out = { total: null, parts: parts, unknown: unknown, why: null,
                notIn: (C && C.NOT_IN ? C.NOT_IN.slice() : []) };
    if (unknown.length || held) { out.why = 'unknown'; return out; }
    out.total = totals;
    // The second path. Never remove this: it is what makes the card's last line
    // a statement rather than a decoration.
    if (C && typeof C.reconciles === 'function' && !C.reconciles(out)) {
      out.total = null;
      out.why = 'mismatch';
    }
    return out;
  }

  /* The signature of the stores this screen reads, so a 4-second sync tick that
   * brought nothing costs nothing. A signature this screen cannot read is null
   * and nothing is memoised — a key that cannot tell two row sets apart is a
   * cache that answers the wrong one. */
  function sigOf() {
    var c = root.Cache;
    if (!c || typeof c.sigOf !== 'function') return null;
    try {
      return c.sigOf.apply(null, COST_STORES.concat(['buses', 'meta'])) || null;
    } catch (e) { return null; }
  }

  var _memo = {};
  function fleetOver(cache, win, now, sig) {
    var key = sig === null ? null : sig + '|' + win.from + '|' + win.to;
    if (key !== null && Object.prototype.hasOwnProperty.call(_memo, key)) return _memo[key];
    var rows = perBus(cache, win, now);
    var answer = { rows: rows, agg: aggregate(rows) };
    if (key !== null) _memo[key] = answer;
    return answer;
  }

  /* THE SIX MONTHS OF THE TREND, each a full fleet pass over its own window.
   *
   * Stated plainly because it is the most expensive thing on this screen: six
   * windows times the fleet is six times the per-bus loop. It is memoised on
   * the content signature and the window, so it is paid once per change and not
   * once per sync tick — but on the office PC (Windows 7, Core 2 Duo) that
   * first pass is the measurement `DECISIONS.md §9` has not taken yet. If the
   * reading says this card is what costs the screen its budget, the honest fix
   * is fewer months, not a cheaper basis: a trend computed a second way is a
   * sixth cost basis. */
  function trendOf(cache, now, sig, viewer) {
    var out = [], i;
    for (i = 0; i < TREND_MONTHS; i++) {
      var from = monthStart(now, i);
      var to = i === 0 ? now : monthStart(now, i - 1) - 1;
      var got = fleetOver(cache, { from: from, to: to, word: 'moInThis' }, viewer, sig);
      out.push({ at: from, label: monthName(from), total: got.agg.total });
    }
    // Oldest first while the change is worked out, newest first on screen.
    for (i = out.length - 1; i > 0; i--) {
      var a = out[i].total, b = out[i - 1].total;
      out[i - 1].change = isNum(a) && isNum(b) ? b - a : null;
    }
    out[out.length - 1].change = undefined;        // nothing before it to compare
    return out;
  }

  /* Supplier dues: `purchases` that are not paid, grouped by vendor, oldest
   * first. "Over 30 days" is a WORD and a mark as well as a colour (§1.6). */
  function duesOf(cache, now) {
    var rows = list(cache.purchases);
    if (!rows) return null;                      // not loaded is not "nothing owed"
    var by = {}, i, amount = 0, count = 0, old = 0;
    for (i = 0; i < rows.length; i++) {
      var p = rows[i];
      if (!live(p) || p.paymentStatus === 'paid') continue;
      var who = p.vendorId != null ? String(p.vendorId) : String(p.supplier || '');
      var age = isNum(p.at) ? Math.floor((now - p.at) / DAY) : null;
      var e = by[who] || (by[who] = { key: who, name: String(p.supplier || ''), amount: 0, n: 0, age: null });
      // A bill whose amount is not a number does not make the dues total
      // smaller: the group's amount becomes unknown and says so.
      if (e.amount !== null) e.amount = isNum(p.amount) ? e.amount + p.amount : null;
      e.n++;
      if (age !== null && (e.age === null || age > e.age)) e.age = age;
      count++;
      if (amount !== null) amount = isNum(p.amount) ? amount + p.amount : null;
      if (age !== null && age > OLD_DUE_DAYS) old++;
    }
    var out = [];
    Object.keys(by).forEach(function (k) { out.push(by[k]); });
    out.sort(function (a, b) {
      var x = a.age === null ? -1 : a.age, y = b.age === null ? -1 : b.age;
      return y - x || String(a.name).localeCompare(String(b.name));
    });
    return { amount: amount, count: count, old: old, rows: out.slice(0, DUES_CAP), vendors: out.length };
  }

  /* The challan liability, from the stored snapshot. A liability, not a running
   * cost — it is NOT one of the six parts, and counting it would change the
   * question (§1.1). */
  function challansOf(cache) {
    var rows = list(cache.challans);
    if (!rows) return null;
    var fine = 0, buses = 0, i;
    for (i = 0; i < rows.length; i++) {
      var c = rows[i];
      if (!live(c) || !c.pendingCount) continue;
      buses++;
      if (fine !== null) fine = isNum(c.pendingFine) ? fine + c.pendingFine : null;
    }
    return { fine: fine, buses: buses };
  }

  /* The trips of the window: open ones first, then the most recently closed.
   * A trip with an allowance and no expenses is a REAL record and not a draft
   * (§1.7 "half-finished") — it is a row that says what it is still waiting
   * for, and nothing on this screen lives only in `localStorage`. */
  function tripsOf(cache, win, regOf) {
    var rows = list(cache.trips);
    if (!rows) return null;
    var open = [], closed = [], i;
    for (i = 0; i < rows.length; i++) {
      var t = rows[i];
      if (!live(t) || !isNum(t.startedAt) || t.startedAt < win.from || t.startedAt > win.to) continue;
      var exp = Array.isArray(t.expenses) ? t.expenses : [];
      var spent = 0, j;
      for (j = 0; j < exp.length; j++) {
        if (spent === null) break;
        spent = isNum(exp[j] && exp[j].amount) ? spent + exp[j].amount : null;
      }
      var row = { id: t.id, busId: t.busId, reg: regOf(t.busId), at: t.startedAt,
                  closedAt: isNum(t.closedAt) ? t.closedAt : null,
                  open: t.status !== 'closed', n: exp.length, spent: spent };
      (row.open ? open : closed).push(row);
    }
    open.sort(function (a, b) { return b.at - a.at; });
    closed.sort(function (a, b) { return (b.closedAt || b.at) - (a.closedAt || a.at); });
    return { open: open, rows: open.concat(closed).slice(0, TRIP_CAP),
             total: open.length + closed.length };
  }

  function lastSyncAt() {
    var s = root.Sync;
    if (!s || typeof s.info !== 'function') return null;
    try { var i = s.info(); return i && isNum(i.lastSyncAt) ? i.lastSyncAt : null; } catch (e) { return null; }
  }

  /* The money pit, and the two rankings that are not the same question.
   *
   * By total: rupees, which are always knowable, so every bus with a total is
   * in it. By cost per km: `Cost.rankPerKm`, which puts a bus with no trusted
   * divisor in `excluded` and NOT in the order — not first, not last, nowhere.
   * `toCheck` pairs each excluded bus with the reason `Odo` gave, in words, so
   * the section under the list names what to fix per bus rather than saying
   * three buses are missing. */
  function pitOf(rows) {
    var C = cost();
    var byTotal = [], entries = [], i;
    for (i = 0; i < rows.length; i++) {
      var r = rows[i];
      var total = r.cost && isNum(r.cost.total) ? r.cost.total : null;
      var km = r.km && r.km.ok === true ? r.km.km : null;
      entries.push({ busId: r.busId, total: total, km: km });
      if (total !== null) byTotal.push(r);
    }
    byTotal.sort(function (a, b) {
      return b.cost.total - a.cost.total || String(a.reg).localeCompare(String(b.reg));
    });
    var ranked = [], excluded = [];
    if (C && typeof C.rankPerKm === 'function') {
      var r2 = C.rankPerKm(entries);
      ranked = r2.ranked;
      excluded = r2.excluded;
    }
    var fleet = C && typeof C.fleetPerKm === 'function'
      ? C.fleetPerKm(entries) : { perKm: null, km: 0, buses: 0, excluded: 0 };
    var byId = {};
    for (i = 0; i < rows.length; i++) byId[rows[i].busId] = rows[i];
    var toCheck = [];
    for (i = 0; i < excluded.length; i++) {
      var b = byId[excluded[i].busId];
      if (!b) continue;
      // A bus the viewer may not open is absent from the list (§1.8), and that
      // includes this section: it names a bus and a repair.
      if (!b.open) continue;
      toCheck.push({ busId: b.busId, reg: b.reg,
                     why: excluded[i].reason === 'no-km' && b.km && b.km.message ? b.km.message : null });
    }
    return { byTotal: byTotal, ranked: ranked, toCheck: toCheck, fleet: fleet, byId: byId };
  }

  function model(m) {
    register();
    m = m || {};
    var cache = m.cache || {};
    var role = m.role || (m.user && m.user.role) || null;
    var now = isNum(m.now) ? m.now : Date.now();
    var win = windowOf(periodId(m.period), now);
    /* LOADING is "this device has not read the stores yet", and it is told from
     * `undefined` and not from an empty list: a store that failed to read is
     * left as `[]` by `Cache.load`, and an empty list is a real answer. */
    var loading = !m.cache || cache.buses === undefined;
    var buses = list(cache.buses) || [];
    var regs = {}, i;
    for (i = 0; i < buses.length; i++) if (buses[i]) regs[buses[i].id] = buses[i].regNo || buses[i].id;
    function regOf(id) { return regs[id] || String(id == null ? '' : id); }

    var got = loading ? { rows: [], agg: { total: null, parts: [], unknown: [], why: null, notIn: [] } }
                      : fleetOver(cache, win, { role: role }, sigOf());
    var p = pitOf(got.rows);
    var dues = loading ? null : duesOf(cache, now);
    var ch = loading ? null : challansOf(cache);
    var trips = loading ? null : tripsOf(cache, win, regOf);

    /* EMPTY means "I asked, and there are none" — every part read and every one
     * of them zero, over every bus. The six part rows are NOT drawn as six
     * zeroes in that case (§1.7): six zeroes read as six measurements. */
    var any = false;
    for (i = 0; i < got.agg.parts.length; i++) {
      if (got.agg.parts[i].value === null || got.agg.parts[i].value !== 0) { any = true; break; }
    }
    var empty = !loading && !any && got.agg.total === 0;

    return {
      loading: loading, role: role, me: m.user || null,
      density: m.density || 'yard',
      offline: m.offline === true, stale: m.stale === true,
      at: lastSyncAt(), now: now,
      period: current, win: win, pit: pit, showAll: showAll, empty: empty,
      agg: got.agg, rows: got.rows, buses: got.rows.length,
      byTotal: p.byTotal, ranked: p.ranked, toCheck: p.toCheck, fleet: p.fleet, byId: p.byId,
      trend: loading ? [] : trendOf(cache, now, sigOf(), { role: role }),
      dues: dues, challans: ch, trips: trips,
      /* The gates, decided once, here — never in the view, where a query should
       * have narrowed it (v2-ux.md §4.3). A control whose gate the viewer does
       * not hold is ABSENT, never disabled and never greyed.
       *
       * `mayTrip` is the screen's own declaration and not a `trips` capability,
       * because there is no `trips` capability and inventing one is forbidden
       * (§7.1 item 12 is about records, and `v2-foundation-ui.md §4` about the
       * table): `trips` is already supervisor-writable on the SERVER (`02 §4.4`)
       * and `money` is held by exactly owner and supervisor, so the screen's
       * declaration and the server's rule name the same two people. If a third
       * role is ever given Money, this line is where that decision surfaces. */
      mayTrip: can(role, 'money'),
      mayBills: can(role, 'bills'),
      mayChallans: can(role, 'challans'),
      /* Q7: `viewCompanyBilling` gates "anything company-level", and today there
       * is no per-company split in any record to draw. So this holds nothing
       * on screen yet and is read here rather than left out, so the day a split
       * exists it is already behind its gate instead of being added to one. */
      mayCompany: can(role, 'viewCompanyBilling')
    };
  }

  /* ====================================================================== *
   * render
   * ====================================================================== */

  /* `figure()`, with the two rules that keep it honest.
   *
   * An AGGREGATE drawn while this device is still filling its first copy is
   * marked `stale`, so it carries "may be out of date" in words beside it: a
   * partial total drawn as final is [E] `2170703`. A figure inside a ROW is
   * not marked and never carries `at` — `at` and `stale` both add
   * `.figure-note` as a block element, which triples the row height and runs
   * the age words once per row, and this screen has a table of 89 of them
   * (foundation §2.3 rule 4). The screen states its freshness ONCE, in the
   * total card's line.
   *
   * The raw value and a `format` go in; nothing is formatted first. `figure`
   * tests for "no value" BEFORE it calls `format`, which is the only ordering
   * in which a dash cannot become a "₹0". */
  function fig(v, o, stale) {
    if (typeof root.figure !== 'function') return '';
    o = o || {};
    var opts = { unit: o.unit, format: o.format };
    if (o.aggregate) {
      opts.at = o.at;
      if (stale) opts.stale = true;
    }
    return root.figure(v, opts);
  }

  function skel(n) { return typeof root.skeleton === 'function' ? root.skeleton(n) : ''; }
  function emptyBox(text, mark, hint) {
    return typeof root.emptyState === 'function' ? root.emptyState(text, { icon: mark, hint: hint }) : '';
  }
  /* ONE hoisted retry and not a fresh closure per render: `ui/states.js` keys
   * its handlers by function identity and caps the list at 200, so a new arrow
   * function per redraw would evict a handler that is still on screen.
   *
   * IT RE-READS, AND IT DID NOT. This called `Shell.mount` and nothing else, so
   * it redrew the screen from the same in-memory cache — which produced the
   * identical sentence, byte for byte. Five of these are drawn on this screen
   * at once, each under a *"Could not read the…"* line and each the only
   * affordance the owner is given, and all five did nothing (REV-FLOW F5,
   * measured: the screen text was unchanged after clicking every one). A button
   * that redraws the sentence saying the read failed, without retrying the
   * read, teaches its user that the screen is simply broken. `duty.js` had the
   * right shape for this and this is now the same one. */
  function retry() { load(); }
  function errorBox(text) {
    return typeof root.errorState === 'function' ? root.errorState(text, retry) : '';
  }

  var TABS = [['this', 'moTabThis'], ['last', 'moTabLast'], ['m3', 'moTabM3'], ['year', 'moTabYear']];

  /* The period strip. A tab CHANGES WHAT IS DRAWN and never navigates and never
   * writes: a tab that pushes a route makes Back walk through filters instead of
   * leaving the screen (§1.8). "Dates" is a sheet and not a chip, because two
   * fields is more than one axis. */
  function tabs(v) {
    var out = '', i;
    for (i = 0; i < TABS.length; i++) {
      var on = TABS[i][0] === v.period;
      out += '<button type="button" role="tab" aria-selected="' + (on ? 'true' : 'false') + '"'
        + ' data-period="' + TABS[i][0] + '">' + esc(say(TABS[i][1])) + '</button>';
    }
    out += '<button type="button" role="tab" aria-selected="' + (v.period === 'dates' ? 'true' : 'false') + '"'
      + ' data-act="moDates">' + draw('filter', 16) + ' ' + esc(say('moTabDates')) + '</button>';
    return '<div class="tabs mo-tabs" role="tablist">' + out + '</div>';
  }

  function fresh(v) {
    if (v.offline) {
      var t = hhmm(v.at);
      return '<p class="mo-fresh mo-fresh-off">' + draw('offline', 16) + ' '
        + esc(t === '' ? say('moOfflineEver') : say('moOffline', { time: t })) + '</p>';
    }
    if (!isNum(v.at)) return '';
    return '<p class="mo-fresh">' + draw('clock', 16) + ' '
      + esc(typeof root.w === 'function' ? root.w('updatedAgo').replace('{0}', ago(v)) : '') + '</p>';
  }
  function ago(v) {
    var mins = Math.floor((v.now - v.at) / 60000);
    if (mins < 1) return typeof root.w === 'function' ? root.w('justNow') : '';
    if (mins < 60) return typeof root.w === 'function' ? root.w('minutesAgo', mins) : '';
    var h = Math.floor(mins / 60);
    if (h < 24) return typeof root.w === 'function' ? root.w('hoursAgo', h) : '';
    return typeof root.w === 'function' ? root.w('daysAgo', Math.floor(h / 24)) : '';
  }

  /* THE TOTAL CARD. The hero, the six parts, and the arithmetic in words.
   *
   * THE HERO IS NOT DRAWN WHEN THE SIX DO NOT ADD UP TO IT. `figure(null)` and
   * a named refusal with a Retry take its place, and the six parts stay on
   * screen — the reader has to be able to see WHICH part is the problem. Two
   * refusals, because they are two different faults:
   *   'unknown'  a part's source could not be read. The part's own row carries
   *              the error and the hero says one part could not be read.
   *   'mismatch' the parts and the total disagree. That is the five-bases bug
   *              being reinvented, and it is the one the whole card exists to
   *              make visible.
   */
  function totalCard(v) {
    var held = v.agg.total === null;
    var head = '<p class="stat"><span class="k">'
      + esc(say('moHero', { period: say(v.win.word) })) + '</span>'
      + '<span class="v">' + fig(v.agg.total, { aggregate: true, at: v.offline ? null : v.at,
                                                format: rupees }, v.stale) + '</span></p>';
    if (v.loading) return '<div class="card mo-total">' + head + skel(6) + '</div>';
    if (v.empty) {
      return '<div class="card mo-total">' + head
        + emptyBox(say('moEmpty', { period: say(v.win.word) }), 'money', say('moEmptyHint')) + '</div>';
    }
    var body = '', i;
    for (i = 0; i < v.agg.parts.length; i++) {
      var p = v.agg.parts[i];
      if (p.value === null) {
        body += '<div class="drow"><span class="drow-i">' + draw('bad', 16) + '</span>'
          + '<span class="drow-l">' + esc(other(p.word)) + '</span>'
          + '<span class="drow-v">' + fig(null) + '</span></div>'
          + errorBox(say(p.err));
        continue;
      }
      body += '<div class="drow"><span class="drow-i">' + draw(p.mark, 16) + '</span>'
        + '<span class="drow-l">' + esc(other(p.word)) + '</span>'
        + '<span class="drow-v">' + fig(p.value, { aggregate: true }, v.stale) + '</span></div>';
    }
    var tail = '';
    if (held) {
      tail = v.agg.why === 'mismatch'
        ? errorBox(say('moMismatch'))
        : '<p class="mo-note">' + esc(say('moHeroHeld')) + '</p>';
    } else {
      tail = '<p class="mo-arith">' + esc(arith(v)) + '</p>'
        + '<p class="mo-note">' + esc(say('moReconcile')) + '</p>';
    }
    return '<div class="card mo-total">' + head + body + tail
      + '<p class="mo-note">' + esc(say('moExcluded')) + '</p>' + fresh(v) + '</div>';
  }

  /* The arithmetic, as a reader does it: every part named with its figure, a
   * plus between them, and the total after the equals. The ' + ' and ' = ' are
   * arithmetic and not English — the one place on this screen a literal string
   * is not read through the word table, because there is no language in which
   * a plus sign is a different character. */
  function arith(v) {
    var terms = [], i;
    for (i = 0; i < v.agg.parts.length; i++) {
      terms.push(other(v.agg.parts[i].word) + ' ' + grouped(v.agg.parts[i].value));
    }
    return terms.join(' + ') + ' = ' + grouped(v.agg.total);
  }

  function trendCard(v) {
    if (v.loading) return '<div class="card"><h3>' + esc(say('moTrend')) + '</h3>' + skel(6) + '</div>';
    var out = '', i;
    for (i = 0; i < v.trend.length; i++) {
      var t = v.trend[i];
      var sub;
      if (t.change === undefined) sub = say('moTrendFirst');
      else if (t.change === null) sub = '';
      else if (t.change > 0) sub = say('moTrendUp', { amount: grouped(t.change) });
      else if (t.change < 0) sub = say('moTrendDown', { amount: grouped(-t.change) });
      else sub = say('moTrendSame');
      out += '<div class="v2row"><span class="lead">' + draw('clock', 20) + '</span>'
        + '<span class="t">' + esc(t.label) + '</span>'
        + (sub ? '<span class="sub">' + esc(sub) + '</span>' : '')
        + '<span class="act">' + fig(t.total, { format: rupees }) + '</span></div>';
    }
    return '<div class="card"><h3>' + esc(say('moTrend')) + '</h3>' + out + '</div>';
  }

  /* COST PER KM, AND THE COUNT IT EXCLUDED, IN ONE LINE.
   *
   * `Cost.fleetPerKm` divides only the rupees of the buses that have km by only
   * the km they have. Dividing every bus's rupees by only the km that exist
   * would be `8db78e7` in aggregate — an excluded bus's money inflating the
   * figure — and the line under it names how many buses are out, because a
   * figure that silently covers 86 of 89 buses is a figure nobody can check. */
  function perKmCard(v) {
    if (v.loading) return '<div class="card">' + skel(2) + '</div>';
    var note = say('moPerKmOver', { km: grouped(v.fleet.km) }, v.fleet.buses);
    if (v.fleet.excluded > 0) note += ' ' + say('moNoKmTail', null, v.fleet.excluded);
    return '<div class="card"><p class="stat"><span class="k">' + esc(say('moPerKm')) + '</span>'
      + '<span class="v">' + fig(v.fleet.perKm, { aggregate: true, unit: '/km',
                                                  format: perKmWords }, v.stale) + '</span></p>'
      + '<p class="mo-note">' + esc(note) + '</p></div>';
  }

  /* A money-pit row IS the reason: `.v2row-why` wraps its `.sub` to two lines
   * rather than truncating, because a row that is a colour and a number is
   * `dashboard` again (foundation §3.4). Every row goes somewhere — the row is
   * the reason, the link is the fix — and a bus the viewer may not open is
   * ABSENT rather than an unpressable row. */
  function pitRow(r, sub, value, opts) {
    return '<a class="v2row v2row-why" href="#" data-bus="' + esc(r.busId) + '">'
      + '<span class="lead tone-warn">' + draw('bus', 20) + '</span>'
      + '<span class="t">' + esc(r.reg) + '</span>'
      + '<span class="sub">' + esc(sub) + '</span>'
      + '<span class="act">' + fig(value, opts) + '</span></a>';
  }

  function pitCard(v) {
    var strip = '<div class="tabs" role="tablist">'
      + '<button type="button" role="tab" aria-selected="' + (v.pit === 'total' ? 'true' : 'false')
      + '" data-pit="total">' + esc(say('moPitTotal')) + '</button>'
      + '<button type="button" role="tab" aria-selected="' + (v.pit === 'perkm' ? 'true' : 'false')
      + '" data-pit="perkm">' + esc(say('moPitPerKm')) + '</button></div>';
    if (v.loading) {
      return '<div class="card"><h3>' + esc(say('moPit')) + '</h3>' + strip + skel(8) + '</div>';
    }
    var out = '', i, shown = 0, r;
    if (v.pit === 'perkm') {
      for (i = 0; i < v.ranked.length && shown < PIT_CAP; i++) {
        r = v.byId[v.ranked[i].busId];
        if (!r || !r.open) continue;
        out += pitRow(r, say('moWhyPerKm', { amount: perKmWords(v.ranked[i].perKm),
                                             km: grouped(v.ranked[i].km) }),
                      v.ranked[i].perKm, { unit: '/km', format: perKmWords });
        shown++;
      }
    } else {
      for (i = 0; i < v.byTotal.length && shown < PIT_CAP; i++) {
        r = v.byTotal[i];
        if (!r.open) continue;
        out += pitRow(r, whyTotal(r), r.cost.total, { format: rupees });
        shown++;
      }
    }
    if (!out) out = emptyBox(say('moEmpty', { period: say(v.win.word) }), 'money', say('moEmptyHint'));
    // ABSENT at one row: "See all 1 bus" is a control that goes nowhere (§1.7).
    var all = v.buses > 1
      ? '<button type="button" class="btn btn-quiet mo-all" data-act="moSeeAll">'
        + esc(say('moSeeAll', { n: v.buses }, v.buses)) + '</button>' : '';
    return '<div class="card"><h3>' + esc(say('moPit')) + '</h3>' + strip + out + all
      + noKmSection(v) + '</div>';
  }

  /* The reason a bus is on the "By total" list, built from the one basis and
   * nothing else: its largest part, named, with its figure. §1.4's example
   * reason ("4 breakdowns and a gearbox since 1 Oct") would need a narrative
   * the basis does not carry, and a reason derived a second way is a second
   * basis — so the row says the thing the total is actually made of. */
  function whyTotal(r) {
    var best = null, i;
    for (i = 0; i < r.cost.parts.length; i++) {
      var p = r.cost.parts[i];
      if (!isNum(p.value)) continue;
      if (best === null || p.value > best.value) best = p;
    }
    if (best === null || best.value === 0) return '';
    return say('moWhyTotal', { part: other(PARTS[indexOfPart(best.id)].word),
                               amount: rupees(best.value) });
  }
  function indexOfPart(id) {
    for (var i = 0; i < PARTS.length; i++) if (PARTS[i].id === id) return i;
    return 0;
  }

  /* "Cannot work out cost per km (3)", ALWAYS drawn when the count is non-zero
   * and in both tabs, because it is a standing statement about the fleet and
   * not a footnote to one ordering. Each row names the reason for THAT bus, in
   * `Odo`'s own words, so the reader knows what to fix: a broken instrument is
   * a workshop job, one reading is a reading to take, two readings 240 km apart
   * is a wait. A bus with no trusted km also carries the "No km" badge — a word
   * and a mark, never the dash alone. */
  function noKmSection(v) {
    if (!v.toCheck.length) return '';
    var out = '', i;
    for (i = 0; i < v.toCheck.length; i++) {
      var c = v.toCheck[i];
      out += '<div class="v2row"><span class="lead tone-warn">' + draw('warn', 20) + '</span>'
        + '<span class="t">' + esc(c.reg) + '</span>'
        + (c.why ? '<span class="sub">' + esc(c.why) + '</span>' : '')
        + '<span class="act"><span class="badge badge-warn">' + draw('warn', 14) + ' '
        + esc(say('moNoKm')) + '</span>' + fig(null) + '</span></div>';
    }
    return '<p class="mo-head">' + esc(say('moNoKmHead', { n: v.toCheck.length }, v.toCheck.length))
      + '</p>' + out;
  }

  /* TRIP CASH. A trip is a start and an end, or it is not recorded — there is
   * no free-text cash total on this screen (§1.5).
   *
   * Three states that must never look alike (§1.5, foundation §3.6):
   *   no trip at all                 nothing is drawn for that bus here
   *   an allowance, no expenses yet  figure(null) and "expenses not back"
   *   closed having spent nothing    figure(0) — a REAL zero — and "nothing spent"
   */
  function tripCard(v) {
    var write = v.mayTrip
      ? '<div class="mo-write">'
        + '<button type="button" class="btn btn-primary" data-act="moGive">'
        + draw('add', 20) + ' ' + esc(say('moGive')) + '</button>'
        + '<button type="button" class="btn" data-act="moBack">'
        + draw('add', 20) + ' ' + esc(say('moBack')) + '</button></div>' : '';
    if (v.loading) {
      return '<div class="card"><h3>' + esc(say('moTripCash')) + '</h3>' + write + skel(4) + '</div>';
    }
    var t = v.trips;
    if (t === null) {
      return '<div class="card"><h3>' + esc(say('moTripCash')) + '</h3>' + write
        + errorBox(say('moErrTrip')) + '</div>';
    }
    var out = '', i;
    for (i = 0; i < t.rows.length; i++) {
      var r = t.rows[i], sub, value, tone;
      if (r.open && r.n === 0) {
        sub = say('moTripOpen', { time: hhmm(r.at) });
        value = null;
        tone = 'tone-warn';
      } else if (r.open) {
        sub = say('moTripRunning', { time: hhmm(r.at), count: r.n });
        value = r.spent;
        tone = 'tone-warn';
      } else if (r.spent === 0) {
        sub = say('moTripZero');
        value = 0;
        tone = 'tone-ok';
      } else {
        sub = say('moTripClosed', { time: hhmm(r.closedAt) });
        value = r.spent;
        tone = 'tone-ok';
      }
      out += '<div class="v2row"><span class="lead ' + tone + '">'
        + draw(r.open ? 'clock' : 'ok', 20) + '</span>'
        + '<span class="t">' + esc(r.reg) + '</span>'
        + '<span class="sub">' + esc(sub) + '</span>'
        + '<span class="act">' + fig(value, { format: rupees }) + '</span></div>';
    }
    if (!out) out = emptyBox(say('moTripNone'), 'money', say('moEmptyHint'));
    var all = t.total > t.rows.length
      ? '<button type="button" class="btn btn-quiet mo-all" data-act="moAllTrips">'
        + esc(say('moAllTrips', { n: t.total }, t.total)) + '</button>' : '';
    return '<div class="card"><h3>' + esc(say('moTripCash')) + '</h3>' + write + out + all + '</div>';
  }

  /* WE OWE. Supplier bills and challans are money we owe and NOT running cost:
   * a bill buys stock, and the stock becomes cost when it is issued to a card,
   * so counting both counts it twice (§1.1).
   *
   * Without `bills` the card shows the one total and the count and NO vendor
   * names, no bill photos and no rows — and says so in one line. The line is
   * the point: a hidden field says it is hidden, once, in words, and never by
   * drawing an empty row (§5 rule 4). It is also a CLIENT rule over records the
   * device already holds — see the note at the top of this file.
   *
   * The challan row prices itself before it is pressed, because each lookup
   * spends a billable credit and the server guards the same (§1.6). Offline the
   * control is ABSENT and the words say why; a button that cannot work is worse
   * than no button. */
  function oweCard(v) {
    if (v.loading) return '<div class="card">' + skel(3) + '</div>';
    var d = v.dues;
    var head = '<p class="stat"><span class="k">' + esc(say('moOwe')) + '</span>'
      + '<span class="v">' + fig(d ? d.amount : null, { aggregate: true,
                                                        format: rupees }, v.stale) + '</span></p>';
    var body = '';
    if (d === null) {
      body = errorBox(say('moErrBills'));
    } else {
      body = '<p class="mo-note">' + esc(say('moOweCount', { n: d.count, old: d.old }, d.count)) + '</p>';
      if (v.mayBills) {
        var i;
        for (i = 0; i < d.rows.length; i++) {
          var r = d.rows[i];
          body += '<div class="v2row"><span class="lead' + (r.age > OLD_DUE_DAYS ? ' tone-bad' : '') + '">'
            + draw('doc', 20) + '</span>'
            + '<span class="t">' + esc(r.name) + '</span>'
            + '<span class="sub">' + esc(r.age === null ? '' : say('moBillAge', { n: r.age }, r.age)) + '</span>'
            + '<span class="act">'
            + (r.age !== null && r.age > OLD_DUE_DAYS
               ? '<span class="badge badge-bad">' + draw('warn', 14) + ' ' + esc(say('moOverDue')) + '</span>' : '')
            + fig(r.amount, { format: rupees }) + '</span></div>';
        }
        body += '<button type="button" class="btn btn-quiet mo-all" data-act="moBills">'
          + esc(say('moOpenBills')) + '</button>';
      } else {
        body += '<p class="mo-note">' + esc(say('moDuesHidden')) + '</p>';
      }
    }
    // A role without `challans`: the row is ABSENT, not greyed.
    if (v.mayChallans && v.challans) {
      body += '<div class="drow"><span class="drow-i">' + draw('challan', 16) + '</span>'
        + '<span class="drow-l">'
        + esc(say('moChallans', { amount: v.challans.fine === null ? '' : rupees(v.challans.fine),
                                  n: v.challans.buses }, v.challans.buses)) + '</span>'
        + '<span class="drow-v">' + fig(v.challans.fine, { format: rupees }) + '</span></div>';
      body += v.offline
        ? '<p class="mo-note">' + esc(say('moNeedsNet')) + '</p>'
        : '<button type="button" class="btn mo-write" data-act="moChallans">'
          + esc(say('moCheckChallans')) + '</button>';
    }
    return '<div class="card">' + head + body + '</div>';
  }

  /* THE PER-BUS TABLE: the same six parts per bus, plus km and cost per km.
   *
   * Ten columns, 89 rows, ONE string and ONE insert, and no figure in it
   * carries `at` (foundation §2.3 rules 1 and 4). The two columns that must
   * never give are km and cost per km — "the two the owner came for" (§1.3) —
   * so they are last and the money columns narrow first.
   *
   * A bus with no trusted km shows `figure(null)` in BOTH the km and the cost
   * per km cell, and the per-km cell carries the "No km" badge beside it: a
   * word and a mark, never the dash on its own.
   *
   * ONE DEVIATION FROM §1.5, AND IT IS DELIBERATE. §1.5's table says this row's
   * Trip cash cell is `figure(null)` when the bus has no trip record in the
   * period. It cannot be: `Cost.forBus` answers 0 with `n: 0` for that case
   * (`DECISIONS.md §19`), the row's Running cost therefore INCLUDES that zero,
   * and a dash in a row whose columns must add up to its total is the reader
   * being asked to read the dash as a zero — which is the one thing `figure()`
   * exists to prevent. So the cell carries the part's figure, the row adds up,
   * and the three trip states are said in words where a reader meets a trip:
   * the Trip cash card above. Reported rather than quietly reinterpreted. */
  function busTable(v) {
    if (!v.showAll || v.loading) return '';
    var head = '<tr><th>' + esc(say('moThBus')) + '</th>'
      + '<th class="fig">' + esc(say('moThTotal')) + '</th>';
    var i;
    for (i = 0; i < PARTS.length; i++) head += '<th class="fig">' + esc(other(PARTS[i].word)) + '</th>';
    head += '<th class="fig">' + esc(say('moThKm')) + '</th>'
      + '<th class="fig">' + esc(say('moThPerKm')) + '</th></tr>';
    var body = '', shown = v.rows.slice(0, BUS_CAP);
    for (i = 0; i < shown.length; i++) {
      var r = shown[i];
      if (!r.open) continue;                    // a bus the viewer may not open
      var km = r.km && r.km.ok === true ? r.km.km : null;
      var total = r.cost && isNum(r.cost.total) ? r.cost.total : null;
      var pk = km !== null && total !== null ? total / km : null;
      body += '<tr><td>' + esc(r.reg) + '</td>'
        + '<td class="fig">' + fig(total, { format: rupees }) + '</td>';
      for (var j = 0; j < PARTS.length; j++) {
        var p = r.cost && r.cost.parts ? r.cost.parts[j] : null;
        body += '<td class="fig">' + fig(p && isNum(p.value) ? p.value : null, { format: rupees }) + '</td>';
      }
      body += '<td class="fig">' + fig(km, { format: grouped }) + '</td>'
        + '<td class="fig">' + fig(pk, { unit: '/km', format: perKmWords })
        + (pk === null ? '<span class="badge badge-warn">' + draw('warn', 14) + ' '
                         + esc(say('moNoKm')) + '</span>' : '')
        + '</td></tr>';
    }
    return '<div class="card mo-wide"><table class="table mo-bus-t">' + head + body + '</table></div>';
  }

  function reportCard(v) {
    if (v.loading) return '';
    return '<div class="card"><button type="button" class="btn mo-write" data-act="moReport">'
      + draw('doc', 20) + ' ' + esc(say('moReport')) + '</button>'
      + (v.offline ? '<p class="mo-note">' + esc(say('moNeedsNet')) + '</p>' : '') + '</div>';
  }

  /* One string, one insert. The two desk columns are a grid in `money.css` and
   * the order of these children is the order §1.2 reads at yard, so one markup
   * serves both densities: the total and the trend first, then cost per km, the
   * money pit, trip cash and what we owe, with the per-bus table full width
   * under both columns. */
  function render(m) {
    var v = model(m);
    if (v.loading) {
      return '<div class="mo" data-density="' + esc(v.density) + '">' + tabs(v)
        + totalCard(v) + pitCard(v) + tripCard(v) + '</div>';
    }
    return '<div class="mo" data-density="' + esc(v.density) + '">' + tabs(v)
      + '<div class="mo-cols">'
      + '<div class="mo-left">' + totalCard(v) + trendCard(v) + '</div>'
      + '<div class="mo-right">' + perKmCard(v) + pitCard(v) + tripCard(v) + oweCard(v)
      + reportCard(v) + '</div>'
      + busTable(v)
      + '</div></div>';
  }

  /* ====================================================================== *
   * THE TWO SHEETS (§1.5). Two sheets, two saves, one record.
   * ====================================================================== */

  /* Sheet A — "Give allowance".
   *
   * THE BUS IS NEVER PRE-SELECTED. The first option is a disabled "Choose the
   * bus" and nothing is chosen. [E] `d738a6e` is a floor report of a part
   * charged to the wrong bus because a sheet pre-picked the first open job, and
   * the same mistake with cash is worse. The DRIVER is pre-filled from the
   * bus's current seat and changeable, which is a different thing: pre-filling
   * a derived value is fine, pre-filling the subject is not.
   *
   * The date defaults to today and is editable, because the round is at 20:00
   * and the entry may happen at 02:00. The amount is NEVER pre-filled with 0 —
   * a default 0 on a money field is a wrong figure nobody typed.
   *
   * The sheet says what it is: nothing here lives in `localStorage`, so an
   * interrupted entry loses the two numbers typed into it and nothing else.
   *
   * TWO PLACES THIS DEPARTS FROM §1.8, both because an inherited rule outranks
   * it and both reported rather than taken quietly:
   *
   * 1. SAVE IS NOT `aria-disabled` AT REST. §1.8's table asks for
   *    `aria-disabled="true"` until a bus is chosen and the amount is above
   *    zero. The ground rule every brief inherits is narrower and explicit:
   *    "`aria-disabled="true"` is only ever a write in flight, with the label
   *    saying what is happening" (`v2-foundation-ui.md §3.1`). Validation state
   *    is therefore carried where it can be read — the `.num-h` under the
   *    button says what is still needed — the guard is in `create()`, which
   *    returns null and writes nothing, and a press with nothing filled in says
   *    so rather than appearing to do nothing. The attribute goes on only for
   *    the life of the write, with the label reading "Saving...".
   *
   * 2. THE DRIVER IS NOT PRE-FILLED, AND IT CANNOT BE. §1.5 asks for it to come
   *    from the chosen bus's current seat — but the bus is deliberately NOT
   *    pre-selected (the rule above it), so at the moment this markup is built
   *    there is no bus to derive a seat from. Deriving it later needs a second
   *    delegated listener on `change`, and the shared shape every screen brief
   *    carries allows exactly ONE. So each driver's option names the bus they
   *    are on, which makes the right one one read away, and nothing is
   *    pre-selected that the person did not choose. */
  function allowanceSheet(buses, drivers, today, regOf) {
    var b = '<option value="" disabled selected>' + esc(say('moChooseBus')) + '</option>', i;
    for (i = 0; i < (buses || []).length; i++) {
      if (!live(buses[i])) continue;
      b += '<option value="' + esc(buses[i].id) + '">' + esc(buses[i].regNo || buses[i].id) + '</option>';
    }
    var d = '<option value="">' + esc(say('moNoSeat')) + '</option>';
    for (i = 0; i < (drivers || []).length; i++) {
      var dr = drivers[i];
      if (!live(dr)) continue;
      var seat = dr.busId == null ? '' : (regOf ? regOf(dr.busId) : String(dr.busId));
      d += '<option value="' + esc(dr.id) + '" data-bus="' + esc(dr.busId == null ? '' : dr.busId) + '">'
        + esc(dr.name || dr.id) + (seat ? esc(' · ' + seat) : '') + '</option>';
    }
    return '<form class="mo-sheet" data-sheet="allowance">'
      + '<label class="num"><span class="num-l">' + esc(say('moChooseBus')) + '</span>'
      + '<select class="select" data-field="busId">' + b + '</select></label>'
      + '<label class="num"><span class="num-l">' + esc(say('moDriver')) + '</span>'
      + '<select class="select" data-field="driverId">' + d + '</select></label>'
      + '<label class="num"><span class="num-l">' + esc(say('moDate')) + '</span>'
      + '<input class="field" type="date" data-field="date" value="' + esc(today) + '"></label>'
      + '<label class="num"><span class="num-l">' + esc(say('moAllowance')) + '</span>'
      + '<input class="field num-in" type="text" inputmode="decimal" pattern="[0-9]*[.]?[0-9]*"'
      + ' autocomplete="off" enterkeyhint="done" data-kind="decimal" data-field="allowance">'
      + '<span class="num-h">' + esc(say('moAllowanceHint')) + '</span></label>'
      + '<button type="button" class="btn btn-primary" data-act="moSaveAllowance">'
      + esc(say('moSaveAllowance')) + '</button>'
      + '<span class="num-h">' + esc(say('moSaveGuard')) + '</span>'
      + '<span class="num-h">' + esc(say('moNotSaved')) + '</span></form>';
  }

  function expenseRow(n) {
    var c = '', i;
    for (i = 0; i < CATS.length; i++) {
      c += '<option value="' + CATS[i][0] + '" data-mode="' + CATS[i][2] + '">'
        + esc(say(CATS[i][1])) + '</option>';
    }
    return '<div class="mo-exp" data-exp="' + n + '">'
      + '<label class="num"><span class="num-l">' + esc(say('moExpWhat')) + '</span>'
      + '<select class="select" data-field="cat">' + c + '</select></label>'
      + '<label class="num"><span class="num-l">' + esc(say('moExpMode')) + '</span>'
      + '<select class="select" data-field="mode">'
      + '<option value="cash">' + esc(say('moModeCash')) + '</option>'
      + '<option value="card">' + esc(say('moModeCard')) + '</option></select></label>'
      + '<label class="num"><span class="num-l">' + esc(say('moExpAmount')) + '</span>'
      + '<input class="field num-in" type="text" inputmode="decimal" pattern="[0-9]*[.]?[0-9]*"'
      + ' autocomplete="off" enterkeyhint="done" data-kind="decimal" data-field="amount"></label></div>';
  }

  /* Sheet B — "Expenses back". Each expense is APPENDED to `expenses`, the
   * field the driver's own rules already treat as append-only, so the sheet
   * never rewrites a line somebody else wrote.
   *
   * CLOSING IS EXPLICIT AND SEPARATE FROM SAVING, and it is its own control —
   * saving expenses must not be able to end a trip by accident. A closed trip's
   * fields are frozen and the sheet SAYS SO: "Closed trips cannot be changed
   * here." Named honestly, because somebody will rely on it: that freeze is a
   * client rule for a supervisor. The server freezes a closed trip for a
   * `driver` only (`02 §4.4`), so a supervisor or owner token may still push a
   * changed closed trip — stage-3 backend item §7.6. */
  function expensesSheet(trips, regOf, chosen, shut) {
    var open = [], i;
    for (i = 0; i < (trips || []).length; i++) {
      var t = trips[i];
      if (!live(t) || t.status === 'closed') continue;
      if (shut && t.id === shut.id) continue;     // just closed, by the record in hand
      open.push(t);
    }
    open.sort(function (a, b) { return (b.startedAt || 0) - (a.startedAt || 0); });

    /* THE FROZEN SHAPE, which is what the sheet becomes the moment a trip is
     * closed (§1.5): the fields stay on screen, disabled, with the line that
     * says why, and no Save and no Close. The sheet does not simply shut —
     * closing a trip is a thing the person should see the result of, and a
     * sheet that vanishes leaves them wondering whether it worked. */
    if (shut) {
      return '<form class="mo-sheet mo-frozen" data-sheet="expenses">'
        + '<label class="num"><span class="num-l">' + esc(say('moChooseTrip')) + '</span>'
        + '<select class="select" data-field="tripId" disabled><option selected>'
        + esc(regOf(shut.busId)) + ' ' + esc(hhmm(shut.startedAt)) + '</option></select></label>'
        + '<p class="mo-note">' + esc(say('moFrozen')) + '</p></form>';
    }
    // Nothing open to put expenses against is a real answer, said in words.
    if (!open.length) {
      return '<form class="mo-sheet" data-sheet="expenses">'
        + '<p class="mo-note">' + esc(say('moNoOpenTrip')) + '</p></form>';
    }
    var sel = '<option value="" disabled' + (chosen ? '' : ' selected') + '>'
      + esc(say('moChooseTrip')) + '</option>';
    for (i = 0; i < open.length; i++) {
      sel += '<option value="' + esc(open[i].id) + '"' + (chosen === open[i].id ? ' selected' : '') + '>'
        + esc(regOf(open[i].busId)) + ' ' + esc(hhmm(open[i].startedAt)) + '</option>';
    }
    return '<form class="mo-sheet" data-sheet="expenses">'
      + '<label class="num"><span class="num-l">' + esc(say('moChooseTrip')) + '</span>'
      + '<select class="select" data-field="tripId">' + sel + '</select></label>'
      + '<div class="mo-exps">' + expenseRow(0) + '</div>'
      + '<button type="button" class="btn btn-quiet" data-act="moAddExpense">'
      + draw('add', 20) + ' ' + esc(say('moAddAnother')) + '</button>'
      + '<button type="button" class="btn btn-primary" data-act="moSaveExpenses">'
      + esc(say('moSaveExpenses')) + '</button>'
      + '<button type="button" class="btn btn-quiet" data-act="moCloseTrip">'
      + esc(say('moCloseTrip')) + '</button>'
      + '<span class="num-h">' + esc(say('moNotSavedExp')) + '</span></form>';
  }

  function datesSheet(from, to) {
    return '<form class="mo-sheet" data-sheet="dates">'
      + '<label class="num"><span class="num-l">' + esc(say('moFrom')) + '</span>'
      + '<input class="field" type="date" data-field="from" value="' + esc(from) + '"></label>'
      + '<label class="num"><span class="num-l">' + esc(say('moTo')) + '</span>'
      + '<input class="field" type="date" data-field="to" value="' + esc(to) + '"></label>'
      + '<button type="button" class="btn btn-primary" data-act="moUseDates">'
      + esc(say('moUseDates')) + '</button></form>';
  }

  /* ====================================================================== *
   * ONE delegated listener
   * ====================================================================== */

  var handler = null;
  var loading = false;

  /* The read, and the only place this screen asks IndexedDB for anything.
   *
   * From `mount()` and from the error state's Retry, never from a render:
   * `Cache.reads()` must not move between two draws of the same data. The
   * `.then` is what makes the figures arrive without waiting for `boot.js`'s
   * next four-second tick, and `loading` keeps a mount that lands mid-read from
   * stacking a second one over the first. */
  function load() {
    var c = root.Cache;
    if (loading || !c || typeof c.load !== 'function') return null;
    loading = true;
    return c.load(STORES).then(function () { loading = false; reread(); },
                               function () { loading = false; });
  }

  /* Only while this is still the screen on the page: a read that settles after
   * the person has walked to another tab must not mount this one over theirs.
   * `redraw()` below is the same call without the test, because every caller of
   * it is a tap on this screen and therefore already the answer. */
  function reread() {
    var R = root.Router;
    var c = R && R.current ? R.current() : null;
    if (!c || c.id !== ID) return;
    redraw();
  }

  function mount() {
    /* The read is the first statement, above the listener guard. See `duty.js`'s
     * mount: it runs on each entry either way because `unmount()` clears the
     * guard, and the position is what keeps it from depending on that. */
    load();
    if (handler) return handler;
    handler = onClick;
    if (root.document && typeof root.document.addEventListener === 'function') {
      root.document.addEventListener('click', handler);
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
    if (handler && root.document && typeof root.document.removeEventListener === 'function') {
      root.document.removeEventListener('click', handler);
    }
    handler = null;
    return true;
  }

  function redraw() {
    if (root.Shell && typeof root.Shell.mount === 'function') root.Shell.mount(ID, null);
  }

  function onClick(ev) {
    var t = ev && ev.target;
    if (!t || typeof t.closest !== 'function') return;

    /* THE EARLY RETURN, before any [data-act] is read. The two trip sheets
     * carry three `.num` amount fields, four selects and two date fields, and a
     * field whose click reached the row handler is what threw the storekeeper
     * off the screen mid-count. Tapping a field puts the caret in it and does
     * exactly nothing else. */
    if (t.closest('input, select, textarea, label, .num')) return;

    /* EVERY SCREEN'S LISTENER IS ON `document`, so this one also sees clicks
     * that belong to another screen. Three of the attributes below are not
     * names only Money uses — `data-bus` is the obvious one, and Buses (#5) and
     * Fuel & tyres (#10) both list buses — so those three are read only inside
     * Money's own container. A handler that navigated on another screen's bus
     * row would be two screens fighting over one tap.
     *
     * The `[data-act]` read is NOT scoped, and deliberately: a sheet is appended
     * to the page by `V2.openSheet` and is therefore outside `.mo`, which is
     * where the two trip sheets live. Every action name here is prefixed `mo`
     * and unique, and an action this screen does not know falls through to
     * nothing. */
    var mine = t.closest('.mo');

    var tab = mine && t.closest('[data-period]');
    if (tab) {
      // A period changes what is drawn and NEVER pushes a route: a back press
      // must leave the screen, not walk back through filters.
      if (ev.preventDefault) ev.preventDefault();
      periodId(tab.getAttribute('data-period'));
      redraw();
      return;
    }
    var pt = mine && t.closest('[data-pit]');
    if (pt) {
      if (ev.preventDefault) ev.preventDefault();
      pitTab(pt.getAttribute('data-pit'));
      redraw();
      return;
    }
    var bus = mine && t.closest('[data-bus]');
    if (bus) {
      if (ev.preventDefault) ev.preventDefault();
      if (root.Router && root.Router.go) root.Router.go('buses', { id: bus.getAttribute('data-bus') });
      return;
    }
    var el = t.closest('[data-act]');
    if (!el) return;
    var act = el.getAttribute('data-act');
    if (act === 'moSeeAll' || act === 'moAllTrips') {
      // Revealed in place. No route change: the table is this screen's, and a
      // route for it would be a fourteenth screen nobody declared.
      showAll = true;
      redraw();
      return;
    }
    if (act === 'moDates') return openDates();
    if (act === 'moUseDates') return useDates();
    if (act === 'moGive') return openAllowance();
    if (act === 'moBack') return openExpenses();
    if (act === 'moAddExpense') return addExpenseRow();
    if (act === 'moSaveAllowance') return saveAllowance(el);
    if (act === 'moSaveExpenses') return saveExpenses(el);
    if (act === 'moCloseTrip') return closeTrip(el);
    if (act === 'moChallans') return checkChallans(el);
    if (act === 'moReport') return makeReport(el);
    /* "Open the bills" goes to Store (#6), which is where the bill itself is
     * managed. §0.1's split: `bills` manages the bill there and reads the total
     * here, and both halves are the same capability, so this row is only drawn
     * for somebody who can also open the other end of it. */
    if (act === 'moBills' && root.Router && root.Router.go) root.Router.go('store', null);
  }

  function cacheOf() { return (root.S && root.S.cache) || {}; }
  function regLookup() {
    var buses = list(cacheOf().buses) || [], regs = {}, i;
    for (i = 0; i < buses.length; i++) if (buses[i]) regs[buses[i].id] = buses[i].regNo || buses[i].id;
    return function (id) { return regs[id] || String(id == null ? '' : id); };
  }
  function formOf(name) {
    var d = root.document;
    var form = d && d.querySelector ? d.querySelector('[data-sheet="' + name + '"]') : null;
    return form && form.querySelectorAll ? form : null;
  }
  function valsOf(form) {
    var nodes = form.querySelectorAll('[data-field]'), out = {}, i;
    for (i = 0; i < nodes.length; i++) out[nodes[i].getAttribute('data-field')] = nodes[i].value;
    return out;
  }

  function openDates() {
    var v = root.V2;
    if (!v || typeof v.openSheet !== 'function') return;
    var now = Date.now();
    v.openSheet(say('moDatesTitle'),
                datesSheet(ymdLocal(isNum(customFrom) ? customFrom : monthStart(now, 0)),
                           ymdLocal(isNum(customTo) ? customTo : now)));
  }

  function useDates() {
    var form = formOf('dates');
    if (!form) return;
    var vals = valsOf(form);
    var from = Date.parse(vals.from), to = Date.parse(vals.to);
    // A range that is not a range is not applied, and the sheet stays open with
    // the two dates still in it: there is nothing for the person to re-type.
    if (!isNum(from) || !isNum(to)) return;
    to = dayEnd(to);
    if (to <= from) return;
    customFrom = from;
    customTo = to;
    periodId('dates');
    if (root.V2 && root.V2.closeSheet) root.V2.closeSheet();
    redraw();
  }

  function openAllowance() {
    var v = root.V2;
    if (!v || typeof v.openSheet !== 'function') return;
    var c = cacheOf();
    v.openSheet(say('moGive'), allowanceSheet(list(c.buses) || [], list(c.drivers) || [],
                                              ymdLocal(Date.now()), regLookup()));
  }

  function openExpenses(chosen, shut) {
    var v = root.V2;
    if (!v || typeof v.openSheet !== 'function') return;
    v.openSheet(say('moBackTitle'),
                expensesSheet(list(cacheOf().trips) || [], regLookup(), chosen || null, shut || null));
  }

  /* The challan lookup PRICES ITSELF BEFORE IT IS PRESSED and restates the
   * price while it runs, because each call spends a billable credit upstream
   * and the server guards the same gate (§1.6, `02 §4.5`). The control is
   * ABSENT offline rather than a button that cannot work.
   *
   * ONE PRESS, ONE BUS, ONE CREDIT — which is what the label promises.
   * `Sync.challans(rc)` looks up one registration, and the server writes the
   * snapshot, so the figures arrive through the ordinary pull rather than from
   * here. Pressing again checks the next bus that has no snapshot. A button
   * labelled "1 credit" that spent eighty-nine would be the kind of surprise
   * this app bills somebody real money for.
   *
   * The upstream reason for a failure (credits exhausted, a 403) is NOT drawn:
   * it is an English sentence from `v2/sync.js` that no Hindi reader is ever
   * told is missing, which is the §6.3 defect. What is drawn is the one thing
   * the person needs — the check did not run and no credit went with it. */
  function nextUnchecked() {
    var c = cacheOf();
    var buses = list(c.buses) || [], snaps = list(c.challans) || [], seen = {}, i;
    for (i = 0; i < snaps.length; i++) if (snaps[i] && snaps[i].rc) seen[String(snaps[i].rc)] = true;
    for (i = 0; i < buses.length; i++) {
      if (!live(buses[i]) || !buses[i].regNo) continue;
      if (!seen[String(buses[i].regNo)]) return String(buses[i].regNo);
    }
    return null;
  }

  async function checkChallans(el) {
    var s = root.Sync;
    var rc = nextUnchecked();
    if (!rc) { if ('textContent' in el) el.textContent = say('moAllChecked'); return; }
    if (!s || typeof s.challans !== 'function') {
      if ('textContent' in el) el.textContent = say('moCheckFailed');
      return;
    }
    working(el, 'moChecking');
    var out = null;
    try { out = await s.challans(rc); } catch (e) { out = null; }
    el.removeAttribute('aria-disabled');
    if (!out || out.error || out.configured === false) {
      if ('textContent' in el) el.textContent = say('moCheckFailed');
      return;
    }
    redraw();
  }

  /* THE PERIOD REPORT IS THIS SCREEN WITH THE PERIOD FIXED AND THE PER-BUS
   * TABLE OPEN (§1.6). Not a new screen, not a download, and not a second place
   * the six parts are laid out — a report rendered a second way is a second
   * cost basis, which is the whole defect this screen ends. `money.css` has the
   * print rules; this reveals the table, redraws, and hands the page to the
   * browser's own print. */
  function makeReport(el) {
    working(el, 'moReporting');
    showAll = true;
    redraw();
    if (typeof root.print === 'function') root.print();
  }

  /* "Add another" appends one more expense row. One insert, and the row is
   * built by the same function the sheet used, so the two cannot drift. */
  function addExpenseRow() {
    var form = formOf('expenses');
    if (!form) return;
    var box = form.querySelector('.mo-exps');
    if (!box || typeof box.insertAdjacentHTML !== 'function') return;
    var n = box.querySelectorAll('[data-exp]').length;
    box.insertAdjacentHTML('beforeend', expenseRow(n));
  }

  /* THE WRITE. One `trips` record, every field one v1 already reads: under
   * whole-record last-write-wins a field v2 invented would be erased the next
   * time a v1 device wrote this record.
   *
   * `startedAt` is the CHOSEN DATE's time and not the clock's, because the
   * round is at 20:00 and the entry may be at 02:00 — and `Cost.forBus` windows
   * trip cash on `startedAt`, so a 02:00 stamp would put last night's cash in
   * today. The chosen date keeps its clock time where the date is today, so the
   * ordinary case records the actual moment.
   *
   * `fromTo` is written EMPTY. §1.5 lists it among the fields the save writes
   * and gives the sheet no control that collects it; an empty string is the
   * field v1 reads with nothing invented in it. Reported rather than guessed. */
  function create(fields, who, now) {
    var v = fields || {};
    if (!v.busId) return null;
    var amount = Number(v.allowance);
    if (!isNum(amount) || amount <= 0) return null;
    var day = Date.parse(v.date);
    var started = isNum(day) ? sameDayAs(day, now) : now;
    return {
      id: 'trip-' + now.toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36),
      busId: String(v.busId),
      driverId: v.driverId ? String(v.driverId) : null,
      fromTo: '',
      allowance: amount,
      startedAt: started, closedAt: null, status: 'active', expenses: [],
      by: who && who.id ? who.id : null
    };
  }
  /* The chosen calendar day, at this moment's time of day when that day is
   * today and at its own midday when it is not. Midday rather than midnight:
   * a midnight stamp on a day boundary lands in the wrong month for anybody
   * reading in another time zone, and the window comparisons here are all made
   * against local day starts. */
  function sameDayAs(day, now) {
    if (ymdLocal(day) === ymdLocal(now)) return now;
    var d = new Date(day);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0).getTime();
  }

  function working(el, word) {
    el.setAttribute('aria-disabled', 'true');
    if ('textContent' in el) el.textContent = say(word);
  }
  function toast(word, kind) {
    if (root.V2 && typeof root.V2.toast === 'function') root.V2.toast(say(word), { kind: kind || 'ok' });
  }

  /* A WRITE MADE OFFLINE SAYS WHERE IT IS. The record is on this phone and will
   * go when there is signal, and that is a different sentence from "saved" —
   * the supervisor standing at the gate at 20:00 with no signal needs to know
   * which of the two happened.
   *
   * Named honestly, because the sentence is not yet entirely true: LIVE-ISSUES
   * 1 is live in `v2/sync.js` too (`DECISIONS.md §14` — v2 started from a
   * byte-identical copy), so a push that loses the `updatedAt` comparison is
   * dropped with a 200 and the client clears the batch. "It will send when
   * there is signal" is only a promise once that is fixed; the spec's §6 lists
   * it as a stage-3 backend slice, and until then this is the honest copy
   * rather than a silent one. */
  function offlineNow() {
    var s = root.Sync;
    if (s && typeof s.info === 'function') {
      try { if (s.info().status === 'offline') return true; } catch (e) { /* fall through */ }
    }
    return !!(root.navigator && root.navigator.onLine === false);
  }
  function saved(word) {
    if (offlineNow()) toast('moNotSent', 'warn');
    else toast(word, 'ok');
  }

  async function saveAllowance(el) {
    var form = formOf('allowance');
    if (!form || !root.DB) return;
    var rec = create(valsOf(form), (root.S && root.S.user) || null, Date.now());
    /* The guard, and it SAYS SOMETHING. Until a bus is chosen and the amount is
     * above zero there is nothing to save; a press that silently does nothing
     * is how a person presses again, and on this button that would be two cash
     * records. The words are the same ones under the button. */
    if (!rec) {
      if (root.V2 && typeof root.V2.toast === 'function') {
        root.V2.toast(say('moSaveGuard'), { kind: 'warn' });
      }
      return;
    }
    working(el, 'moSaving');
    try { await root.DB.put('trips', rec); } catch (e) { el.removeAttribute('aria-disabled'); return; }
    if (root.V2 && root.V2.closeSheet) root.V2.closeSheet();
    saved('moSavedAllowance');
    redraw();
  }

  /* Expenses are APPENDED. The record is re-read from the store immediately
   * before the append, so a line that arrived from another device between the
   * sheet opening and this save is not overwritten by a stale copy in hand. */
  async function saveExpenses(el) {
    var form = formOf('expenses');
    if (!form || !root.DB) return;
    var tripId = valsOf(form).tripId;
    if (!tripId) return;
    var rows = form.querySelectorAll('[data-exp]'), add = [], i;
    for (i = 0; i < rows.length; i++) {
      var vals = valsOf(rows[i]);
      var amount = Number(vals.amount);
      if (!isNum(amount) || amount <= 0) continue;
      add.push({ id: 'e-' + Date.now().toString(36) + '-' + i,
                 cat: vals.cat || 'other', mode: vals.mode === 'card' ? 'card' : 'cash',
                 amount: amount, note: '', photo: '', at: Date.now(),
                 by: (root.S && root.S.user && root.S.user.id) || null });
    }
    if (!add.length) return;
    working(el, 'moSaving');
    var rec = null;
    try { rec = await root.DB.get('trips', tripId); } catch (e) { rec = null; }
    if (!rec) { el.removeAttribute('aria-disabled'); return; }
    rec.expenses = (Array.isArray(rec.expenses) ? rec.expenses : []).concat(add);
    try { await root.DB.put('trips', rec); } catch (e) { el.removeAttribute('aria-disabled'); return; }
    if (root.V2 && root.V2.closeSheet) root.V2.closeSheet();
    saved('moSavedExpenses');
    redraw();
  }

  /* Closing asks, with focus on Cancel — `V2.confirmDialog` puts it there, so a
   * reflexive Enter is a no. There is no dialog about a conflict anywhere on
   * this screen: a conflict a person must see is a named refusal with a reason
   * and a Retry, never "keep mine or theirs?" (`v2-contract.md §4.0`). */
  async function closeTrip(el) {
    var form = formOf('expenses');
    if (!form || !root.DB || !root.V2 || typeof root.V2.confirmDialog !== 'function') return;
    var tripId = valsOf(form).tripId;
    if (!tripId) return;
    var yes = await root.V2.confirmDialog(say('moCloseAsk'));
    if (!yes) return;
    working(el, 'moClosing');
    var rec = null;
    try { rec = await root.DB.get('trips', tripId); } catch (e) { rec = null; }
    if (!rec) { el.removeAttribute('aria-disabled'); return; }
    rec.status = 'closed';
    rec.closedAt = Date.now();
    try { await root.DB.put('trips', rec); } catch (e) { el.removeAttribute('aria-disabled'); return; }
    /* The sheet is REDRAWN FROZEN rather than shut (§1.5): the fields stay,
     * disabled, with "Closed trips cannot be changed here." A sheet that
     * vanishes on a destructive confirm leaves the person wondering whether it
     * happened.
     *
     * The record JUST WRITTEN is handed to the sheet, not looked up again: the
     * in-memory cache is re-read by the next `Cache.load`, so a sheet built
     * from what is in the cache now would still show this trip as open. */
    openExpenses(null, rec);
    toast('moClosedTrip', 'ok');
    redraw();
  }

  /* ====================================================================== */

  register();

  var api = { render: render, model: model, mount: mount, unmount: unmount,
              period: periodId, pitTab: pitTab,
              windowOf: windowOf, daysOf: daysOf, aggregate: aggregate,
              allowanceSheet: allowanceSheet, expensesSheet: expensesSheet,
              datesSheet: datesSheet, expenseRow: expenseRow, create: create,
              arith: arith, PARTS: PARTS, WORDS: WORDS,
              /* The function the five Retry buttons are wired to, so a suite can
               * ask whether pressing one reaches IndexedDB rather than only
               * whether the markup has a button on it. `ui/states.js` keys its
               * handlers by identity and the markup carries an id, not a name,
               * so there is no other handle on it. Nothing in the app reads it.
               *
               * `_stores` likewise: what this screen declares it reads, for the
               * check that compares that against what it asked for. */
              _retry: retry,
              _stores: function () { return STORES.slice(); } };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.Money = api;
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

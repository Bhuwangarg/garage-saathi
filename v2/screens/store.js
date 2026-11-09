/* Garage Saathi v2 — screen #6, Store. Plain script, no module system.
 * Test: test_v2_store.js. Spec: docs/v2/plan/screens-assets.md §2.
 *
 * A storekeeper at a counter with a mechanic waiting. The two things that
 * happen — issue a part, receive stock — are above the tabs and never behind
 * one, because choosing a view before doing the job is the wrong order.
 *
 * THE CATALOGUE IS WINDOWED, AND THAT IS A MEASUREMENT AND NOT A PREFERENCE.
 * DECISIONS.md §20: on an i9 with sixteen cores, drawing all 2,384 catalogue
 * rows cost 410-619 ms; the same rows windowed cost 7-19 ms on the first draw
 * and 85 ms for ten scroll steps. The office runs Core 2 Duos on Chrome 109,
 * where this class of DOM work is commonly five to ten times slower, so the
 * full draw is plausibly two to six seconds there. Nothing in this file ever
 * builds a row for a part that is off screen, and nothing measures a row: the
 * spacing above and below the window is `calc(var(--row-h) * n)`, arithmetic on
 * the density token, so it follows yard and desk without asking the browser
 * for a height (v2-foundation-ui.md §2.3 rules 2 and 6).
 *
 * THE COUNT THAT COULD NEVER REACH ZERO. The seed has 0 of 2,384 parts with a
 * reorder level, so "low = qty <= reorderLevel" is true for every part on a
 * fresh device: 2,384 red rows, a count that cannot fall, and the storekeeper
 * learns to scroll past red (5eb8c6e, ba274f6). `low()` is v1's `isLow`
 * (app.js:1647) transcribed — a part with no level was never stocked and is
 * NOT low. The 2,384 are counted once, in one line, with a way to set a level.
 *
 * ONE DELEGATED LISTENER, and it returns early on a form control BEFORE it
 * reads any data attribute. This is the screen the rule was written for: a
 * shelf-count field sat inside a pressable row, the row's handler caught the
 * tap, and a storekeeper was thrown off the screen mid-count. Every number
 * here is a reading or a count — there are no steppers, by the storekeeper's
 * own instruction, "correct the book by counting, not by typing" (05 §4 r25).
 *
 * THE `bills` SPLIT IS HALF-HONOURED HERE ON PURPOSE: the supplier bill is
 * managed on this screen, and no period spend total and no fleet stock value
 * appears on it. One vendor's unpaid bills — the list, the count, their sum —
 * are this screen's, because you cannot settle with a vendor without knowing
 * what that vendor is owed. Everything above that line of aggregation is
 * Money's (§2.1).
 */
(function (root) {
  'use strict';

  var ID = 'store';

  /* The selector the one listener guards with, named rather than inlined so the
   * guard and the comment that explains it cannot drift apart:
   * 'input, select, textarea, label, .num'. */
  var FIELDS = 'input, select, textarea, label, .num';

  /* The window. VIEW_ROWS must match .st-cat's height in ui/store.css, which is
   * `calc(var(--row-h) * 18)`; OVERSCAN is the rows kept drawn above and below
   * so a flick does not show blank space before the next draw lands. */
  var VIEW_ROWS = 18;
  var OVERSCAN = 8;
  var SPAN = VIEW_ROWS + 2 * OVERSCAN;

  /* --row-h, per density, from ui/tokens.css (56px yard, 32px desk). A constant
   * rather than a reading: scrollTop has to be divided by a row height and
   * asking the browser for one is how a list starts measuring rows. The token
   * is the authority and this mirrors it; store.css's window height is written
   * from the same token so the two cannot disagree by more than a token edit. */
  var ROW_PX = { yard: 56, desk: 32 };

  var LIST_CAP = 200;          // requests, bills and pieces: capped with a remainder line
  var COUNT_OLD_D = 60;        // a shelf count older than this is "may be out of date"

  var WORDS = {
    /* THE SCREEN'S OWN NAME. `Caps.SCREENS` names this id in its `word` field beside the English
     * `title`, and nothing registered it, so `Shell`'s nameOf() fell through to the title and the
     * nav, the header and every cross-reference to this screen drew UNMARKED English in Hindi mode.
     * Ten of the thirteen were like this. test_v2_words.js now fails on a `word` nobody registers. */
    scStore: { en: 'Store', hi: 'स्टोर' },  // FROM i18n-hi.js line 12 (store)
    stPartsN: { en: { one: '{c} part', other: '{c} parts' }, hi: '' },
    /* The headline BEFORE the shelf has been read. "0 parts" is the one thing
     * it must not say: see `header()`. The word carries no number because there
     * is no number to carry — that is the whole point of it. */
    stPartsUnread: { en: 'Parts on the shelf', hi: '' },
    stReqN: { en: { one: '{n} waiting request', other: '{n} waiting requests' }, hi: '' },
    stNoLevels: { en: '{v} parts have no reorder level. Set one to get a warning.', hi: '' },
    stSetLevel: { en: 'Set a level', hi: '' },
    stIssueBtn: { en: 'Issue part', hi: '' },
    stReceiveBtn: { en: 'Receive stock', hi: '' },
    stSearchLabel: { en: 'Search a part', hi: '' },
    stSearchOnly: { en: 'Search is the only way through {v} parts.', hi: '' },

    stTabCatalogue: { en: 'Catalogue', hi: '' },
    stTabPieces: { en: 'Pieces', hi: '' },
    stTabRequests: { en: 'Requests', hi: '' },
    stTabBills: { en: 'Bills', hi: '' },
    stTabCounts: { en: 'Counts', hi: '' },

    stReorderAt: { en: 'reorder {v}', hi: '' },
    stNoPartNo: { en: 'No part number', hi: '' },
    stNoLevel: { en: 'No reorder level', hi: '' },
    stOutOfStock: { en: 'Out of stock', hi: '' },
    stNeverCounted: { en: 'Not counted yet', hi: '' },
    stBookSaysNeg: { en: 'The book says {v}. Count this part.', hi: '' },
    stCountThis: { en: 'Count this part', hi: '' },
    stLow: { en: 'Low', hi: '' },
    stIssueRow: { en: 'Issue', hi: '' },
    stCapLine: { en: '{shown} of {total} shown', hi: '' },
    stHealing: { en: { one: '{n} issue is still being matched to its card',
                       other: '{n} issues are still being matched to their cards' }, hi: '' },

    stFilter: { en: 'Filter', hi: '' },
    stFilterAll: { en: 'All parts', hi: '' },
    stFilterLow: { en: 'Low', hi: '' },
    stFilterNoLevel: { en: 'No reorder level', hi: '' },
    stFilterOut: { en: 'Out of stock', hi: '' },
    stFilterSerial: { en: 'Serial-tracked only', hi: '' },
    stFilterCategory: { en: 'By category', hi: '' },

    stEmptyCat: { en: 'No parts in the book yet', hi: '' },
    stEmptyCatHint: { en: 'Receive a bill to add parts.', hi: '' },
    stMechHint: { en: 'To ask for a part, open your job card.', hi: '' },
    stNoMatch: { en: 'Nothing matched {q}', hi: '' },
    stEmptyPieces: { en: 'No tyres, batteries or other pieces recorded', hi: '' },
    stEmptyReq: { en: 'No part requests waiting', hi: '' },
    stEmptyReqHint: { en: 'Mechanics ask from their job card.', hi: '' },
    stEmptyBills: { en: 'No supplier bills yet', hi: '' },
    stEmptyBillsHint: { en: 'Photograph a bill to add one.', hi: '' },
    stEmptyCounts: { en: 'No count recorded', hi: '' },
    stEmptyCountsHint: { en: 'Start a count to check the book.', hi: '' },
    stErrCat: { en: 'Could not read the part book', hi: '' },

    stStartCount: { en: 'Start a count', hi: '' },
    stSaveCount: { en: 'Save count', hi: '' },
    stSavingCount: { en: 'Saving count...', hi: '' },
    stCountWarn: { en: 'This count is not saved until you press Save count. Do not close the app.', hi: '' },
    stCountOffline: { en: 'This count saves on this phone and sends when there is signal.', hi: '' },
    stCountConfirm: { en: 'Save this count? {v} parts will be corrected.', hi: '' },
    stCountSaved: { en: 'Count saved. {v} parts corrected.', hi: '' },
    stCountFailed: { en: 'Not sent. The count is saved on this phone. It will send when there is signal.', hi: '' },
    stModeBlind: { en: 'Count without the book showing (blind)', hi: '' },
    stModeFull: { en: 'Count with the book showing', hi: '' },
    stCountMode: { en: 'How will you count?', hi: '' },
    stCountScope: { en: 'Which parts will you count?', hi: '' },
    stCountedLabel: { en: 'Counted', hi: '' },
    stBookFig: { en: 'book {v}', hi: '' },
    stTrust: { en: 'The book matched the shelf on {m} of {t} lines counted.', hi: '' },
    stTrustNever: { en: 'This shelf has never been counted', hi: '' },
    stShrinkL: { en: 'Value short', hi: '' },
    stFoundL: { en: 'Value found', hi: '' },

    stIssueTitle: { en: 'Issue a part', hi: '' },
    stStepCard: { en: 'Choose the job card this part is going to', hi: '' },
    stNoOpenCard: { en: 'No open job card for this bus. Ask a supervisor to open one.', hi: '' },
    stCardChosen: { en: 'Going to card {card}, {bus}', hi: '' },
    stChangeCard: { en: 'Choose a different card', hi: '' },
    stStepPart: { en: 'Choose the part', hi: '' },
    stStepQty: { en: 'How many?', hi: '' },
    stReused: { en: 'Reused part', hi: '' },
    stInStock: { en: 'in stock', hi: '' },
    stIssueConfirm: { en: 'Issue {qty} {unit} {name} to {bus}, card {card}. The book goes from {from} to {to}.', hi: '' },
    stIssueNeedCard: { en: 'Choose a card first.', hi: '' },
    stIssueNeedPart: { en: 'Choose a part.', hi: '' },
    stIssueNeedQty: { en: 'Type how many.', hi: '' },
    stIssuing: { en: 'Issuing...', hi: '' },
    stIssued: { en: 'Issued. The book now says {v}.', hi: '' },
    stIssuedNeg: { en: 'Issued. The book now says {v}. Count this part.', hi: '' },
    stIssueFailed: { en: 'Not issued. Nothing has left the book. Try again.', hi: '' },
    stRequestRow: { en: '{qty} {unit} {name} for {bus}', hi: '' },
    stAskedBy: { en: 'asked by {who}', hi: '' },
    stReqNoIssue: { en: 'This request has no issue against it. Issue it again.', hi: '' },
    stHoursShort: { en: '{h} h', hi: '' },
    stDaysShort: { en: '{d} d', hi: '' },

    stReceiveTitle: { en: 'Receive stock', hi: '' },
    stTakePhoto: { en: 'Take photo', hi: '' },
    stReceiveOffline: { en: 'No signal. The photo is saved. The reading needs signal.', hi: '' },
    stReading: { en: 'Reading the bill...', hi: '' },
    stReadBill: { en: 'Read the bill', hi: '' },
    stHandBill: { en: 'Enter the bill by hand', hi: '' },
    stByHand: { en: 'Entered by hand. Nothing was read for you.', hi: '' },
    stBillNotRead: { en: 'The bill could not be read. Enter it by hand.', hi: '' },
    stReadBy: { en: 'Read by {model}. Check every line.', hi: '' },
    stUnmatched: { en: 'Not matched to a part — these do not change stock', hi: '' },
    stFindPart: { en: 'Find the part', hi: '' },
    stReceiveConfirm: { en: 'Saving adds {v} items to stock.', hi: '' },
    stNotSavedYet: { en: 'Not saved yet', hi: '' },
    stSupplier: { en: 'Supplier', hi: '' },
    stBillNo: { en: 'Bill number', hi: '' },
    stBillDate: { en: 'Date', hi: '' },
    stAmount: { en: 'Amount', hi: '' },
    stSave: { en: 'Save', hi: '' },
    stSaving: { en: 'Saving...', hi: '' },

    stUnpaid: { en: 'Unpaid', hi: '' },
    stPaid: { en: 'Paid', hi: '' },
    stMarkPaid: { en: 'Mark paid', hi: '' },
    stNoBillNo: { en: 'No bill number', hi: '' },
    stBillLocked: { en: 'A saved bill cannot be changed. Ask a supervisor.', hi: '' },
    stVendorOwed: { en: 'Unpaid to this vendor', hi: '' },
    stVendorUnpaidN: { en: { one: '{n} unpaid bill', other: '{n} unpaid bills' }, hi: '' },
    stVendorNone: { en: 'Nothing unpaid with this vendor', hi: '' },
    stPhone: { en: 'Phone', hi: '' },
    stCity: { en: 'City', hi: '' },
    stGstin: { en: 'GSTIN', hi: '' },
    stNotes: { en: 'Notes', hi: '' },
    stCategoryL: { en: 'Category', hi: '' },
    stRepairVendor: { en: 'Does repair work', hi: '' },
    stNoVendor: { en: 'No vendor on this bill', hi: '' },

    stPieceIn: { en: 'In service', hi: '' },
    stPieceRemoved: { en: 'Removed', hi: '' },
    stPieceSentOut: { en: 'Sent out for repair', hi: '' },
    stPieceRefurb: { en: 'Refurbished', hi: '' },
    stPieceScrapped: { en: 'Scrapped', hi: '' },
    stWarrantyTo: { en: 'In warranty to {date}', hi: '' },
    stWarrantyEnded: { en: 'Warranty ended {date}', hi: '' },
    stWarrantyNone: { en: 'No warranty recorded', hi: '' },
    stRefurbN: { en: 'Refurbished {v} of {m} times', hi: '' },
    stLifeUsed: { en: 'Life used', hi: '' },
    stNoPosition: { en: 'Position not recorded', hi: '' },
    stNoSerial: { en: 'No serial number', hi: '' },
    stPieceLife: { en: 'What has happened to this piece', hi: '' },
    stStateL: { en: 'State', hi: '' },
    stOnBus: { en: 'On bus', hi: '' },
    stYes: { en: 'Yes', hi: '' },
    stUnitCost: { en: 'Price each', hi: '' },
    stStockValue: { en: 'Value of this part in stock', hi: '' },
    stLifeOf: { en: 'of {v} km', hi: '' },
    stHistInstall: { en: 'Fitted', hi: '' },
    stHistRemove: { en: 'Taken off', hi: '' },
    stHistSendOut: { en: 'Sent out', hi: '' },
    stHistReturn: { en: 'Came back', hi: '' },
    stHistScrap: { en: 'Scrapped', hi: '' },
    stHistSendPass: { en: '{vendor} · gate pass {no}', hi: '' },
    stHistSerialOk: { en: 'Serial matched', hi: '' },
    stHistSerialBad: { en: 'Serial did not match — went out {a}, came back {b}', hi: '' },

    /* ---------------------------------------------------------------------- *
     * RECORD VALUES, not words. These five strings are written into
     * `ledger.reason`, and v1 writes exactly them (app.js:1346, app.js:4623)
     * and shows the stored string back. They sit in this table because §4.5
     * says every fixed English string under v2/ lives in a W.register table,
     * and they are read as `WORDS.stRec*.en` — never through `w()` — so the
     * value that lands in the record cannot vary with the reader's language.
     *
     * THEIR HINDI MUST STAY EMPTY. A Hindi value here would be translated into
     * the ledger on a Hindi device, and the anti-pilferage trail would read in
     * two languages depending on who issued the part. This is reported, not
     * hidden: they will show up in test_v2_words.js's pending list, where they
     * do not belong, and the honest fix is a place for record constants that
     * the literal scan knows about.
     * ---------------------------------------------------------------------- */
    stRecIssued: { en: 'Issued to job', hi: '' },
    stRecIssuedReused: { en: 'Issued to job (reused)', hi: '' },
    stRecShortfall: { en: 'Audit shortfall (shrinkage)', hi: '' },
    stRecSurplus: { en: 'Audit surplus', hi: '' },
    stRecPurchase: { en: 'Purchase from {supplier}', hi: '' }
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

  // The English half of a record value. Never w(): see the table's own note.
  function recordValue(id, vals) {
    var s = WORDS[id].en;
    return vals ? put(s, vals) : s;
  }

  /* ---------------------------------------------------------------------- *
   * the primitives, resolved at call time
   * ---------------------------------------------------------------------- */

  function doc() { return root.document || null; }
  function caps() { return root.Caps || null; }
  function can(role, cap) { var c = caps(); return !!(c && c.can(role, cap)); }
  function draw(name, size) { return typeof root.icon === 'function' ? root.icon(name, { size: size }) : ''; }
  function fig(v, o) { return typeof root.figure === 'function' ? root.figure(v, o) : ''; }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function rupees(v) {
    var f = root.fmt;
    return f && typeof f.rupees === 'function' ? f.rupees(v) : String(v);
  }
  function group(v) {
    var f = root.fmt;
    return f && typeof f.groupIndian === 'function' ? f.groupIndian(v) : String(v);
  }

  function arr(v) { return (v && typeof v.length === 'number') ? v : []; }
  function rowsOf(m, name) { return arr(m && m.cache && m.cache[name]); }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i];
    return null;
  }
  function regOf(buses, id) { var b = byId(buses, id); return b ? (b.regNo || b.id) : String(id || ''); }
  function nameOf(users, id) { var u = byId(users, id); return u ? (u.name || u.id) : String(id || ''); }

  function locale() {
    var W = root.W;
    return (W && typeof W.lang === 'function' && W.lang() === 'hi') ? 'hi-IN' : 'en-IN';
  }

  // "14 March 2027", through Intl, so no month name is a fixed word this file owns.
  function dateName(ms) {
    if (ms == null) return '';
    var d = new Date(Number(ms));
    if (isNaN(d.getTime())) return '';
    try { return d.toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' }); }
    catch (e) { return String(ms); }
  }

  function ageWords(ms) {
    var h = Math.floor(Number(ms) / 3600000);
    if (h < 48) return say('stHoursShort', { h: h < 0 ? 0 : h });
    return say('stDaysShort', { d: Math.floor(h / 24) });
  }

  function lastSyncAt() {
    var s = root.Sync;
    if (!s || typeof s.info !== 'function') return null;
    try { var i = s.info(); return i && i.lastSyncAt ? i.lastSyncAt : null; } catch (e) { return null; }
  }

  /* ---------------------------------------------------------------------- *
   * LOW STOCK — v1's isLow, and the only definition on this screen
   * ---------------------------------------------------------------------- */

  /* app.js:1647, transcribed with its reasoning: a part whose reorder level is
   * 0, absent or unreadable was never stocked and is NOT low. Without this the
   * figure reads 2,384 on a fresh device and can never fall. A level that is
   * set is a level a purchase can get back above, which is how the count
   * reaches zero. */
  function isLow(p) {
    if (!p) return false;
    var lvl = Number(p.reorderLevel);
    if (!isNum(lvl) || lvl <= 0) return false;
    var qty = Number(p.qty);
    return isNum(qty) && qty <= lvl;
  }

  function low(parts) {
    var out = [], list = arr(parts), i;
    for (i = 0; i < list.length; i++) if (isLow(list[i])) out.push(list[i]);
    return out;
  }

  function hasLevel(p) {
    var lvl = Number(p && p.reorderLevel);
    return isNum(lvl) && lvl > 0;
  }

  /* ---------------------------------------------------------------------- *
   * THE BOOK'S THREE ZEROES, kept apart
   *
   * `qty === 0` with a ledger row for this part is a real zero — the shelf
   * emptied and we know it. `qty === 0` with no ledger row at all has never
   * been counted and is the DASH, not a zero: a storekeeper ordering against a
   * book nobody ever counted is how the count drifts in the first place. A
   * negative book is not hidden; it is said out loud.
   * ---------------------------------------------------------------------- */

  function ledgerIndex(ledger) {
    var seen = {}, i;
    for (i = 0; i < ledger.length; i++) {
      if (ledger[i] && ledger[i].partId != null) seen[String(ledger[i].partId)] = true;
    }
    return seen;
  }

  function stockState(p, moved) {
    var raw = p ? p.qty : null;
    if (raw === null || raw === undefined || raw === '') return 'unknown';
    var qty = Number(raw);
    if (!isNum(qty)) return 'unknown';
    if (qty < 0) return 'negative';
    if (qty === 0) return moved && moved[String(p.id)] ? 'out' : 'never';
    return 'held';
  }

  /* ---------------------------------------------------------------------- *
   * SEARCH — case-insensitive substring over name and partNo, nothing else
   *
   * No stemming, no fuzzy matching, no "did you mean". The catalogue holds
   * FULE FILTER and MAKHI WASER FRONT 2518 B BANZ, and those spellings are how
   * the storekeeper will search for them. Typing FUEL must be told nothing
   * matched rather than shown a guess: a wrong part issued against a card is
   * d738a6e with a different cause.
   * ---------------------------------------------------------------------- */

  function matches(p, q) {
    if (!q) return true;
    var needle = String(q).toLowerCase();
    var name = String((p && p.name) || '').toLowerCase();
    if (name.indexOf(needle) >= 0) return true;
    var no = String((p && p.partNo) || '').toLowerCase();
    return no !== '' && no.indexOf(needle) >= 0;
  }

  var CAT_FILTERS = ['all', 'low', 'nolevel', 'out', 'serial'];

  function inFilter(p, f, moved) {
    if (f === 'low') return isLow(p);
    if (f === 'nolevel') return !hasLevel(p);
    if (f === 'out') return stockState(p, moved) === 'out' || stockState(p, moved) === 'never';
    if (f === 'serial') return !!p.serialTracked;
    return true;
  }

  /* ---------------------------------------------------------------------- *
   * THE WINDOW
   *
   * Pure arithmetic on a row count and a scroll offset. Exported so the suite
   * can check the two things that matter without a browser: that a window of a
   * 2,384-row catalogue draws tens of rows and not thousands, and that the
   * spacing is a multiple of the density token rather than a measured height.
   * ---------------------------------------------------------------------- */

  function firstFor(total, scrollTop, rowPx) {
    var h = Number(rowPx) > 0 ? Number(rowPx) : ROW_PX.yard;
    var f = Math.floor(Number(scrollTop) / h) - OVERSCAN;
    var most = total - SPAN;
    if (most < 0) most = 0;
    if (f > most) f = most;
    return f < 0 ? 0 : f;
  }

  function winRange(total, first) {
    var from = Number(first) > 0 ? Math.floor(Number(first)) : 0;
    var most = total - SPAN;
    if (most < 0) most = 0;
    if (from > most) from = most;
    var to = from + SPAN;
    if (to > total) to = total;
    return { from: from, to: to, above: from, below: total - to };
  }

  /* ---------------------------------------------------------------------- *
   * local view state. None of it is a route: a tab that pushed one would make
   * a back press walk through filters instead of leaving the screen.
   * ---------------------------------------------------------------------- */

  var TABS = ['catalogue', 'pieces', 'requests', 'bills', 'counts'];
  var tab = 'catalogue';
  var query = '';
  var catFilter = 'all';
  var first = 0;                 // the window's first row
  var openVendor = null;         // the vendor card, when one is open
  var session = null;            // the count in progress: {mode, scope, typed:{partId: text}, saving}
  var issue = null;              // the issue sheet: {cardId, fromRoute, partId, qty, reused, working}
  var receive = null;            // the receive sheet: {photos, draft, reading, working}
  var lastView = null;           // what the last render drew, for the scroll handler

  function tabsFor(role) {
    var out = ['catalogue', 'pieces'], i;
    // A tab the reader may not use is ABSENT, not disabled. A mechanic holds
    // viewStore and nothing else here, so Requests, Bills and Counts are not
    // tabs they can see — "I need a part" is on their job card.
    if (can(role, 'issuePart')) out.push('requests');
    if (can(role, 'bills')) out.push('bills');
    if (can(role, 'issuePart')) out.push('counts');
    var order = [];
    for (i = 0; i < TABS.length; i++) if (out.indexOf(TABS[i]) >= 0) order.push(TABS[i]);
    return order;
  }

  function setTab(role, id) {
    var allowed = tabsFor(role);
    if (allowed.indexOf(String(id)) >= 0 && tab !== String(id)) {
      tab = String(id);
      first = 0;
      openVendor = null;
    }
    if (allowed.indexOf(tab) < 0) tab = allowed[0] || 'catalogue';
    return tab;
  }

  /* ---------------------------------------------------------------------- *
   * THE QUERY
   * ---------------------------------------------------------------------- */

  var STORES = ['parts', 'ledger', 'jobcards', 'audits', 'purchases', 'vendors',
                'components', 'buses', 'users', 'gatepasses'];

  function requestRows(cards, buses, users, parts, ledger) {
    var out = [], i, j, c, r;
    var byJob = {};
    for (i = 0; i < ledger.length; i++) {
      if (ledger[i] && ledger[i].jobId != null) byJob[String(ledger[i].jobId) + '|' + String(ledger[i].partId)] = true;
    }
    for (i = 0; i < cards.length; i++) {
      c = cards[i];
      if (!c || c._deleted) continue;
      for (j = 0; j < arr(c.partRequests).length; j++) {
        r = c.partRequests[j];
        if (!r) continue;
        var part = byId(parts, r.partId);
        var fulfilled = r.status === 'fulfilled';
        // A request marked fulfilled with no ledger row against it is a
        // half-finished state, and the row says so rather than looking done.
        if (fulfilled && byJob[String(c.id) + '|' + String(r.partId)]) continue;
        out.push({
          id: String(r.id || (c.id + ':' + j)), cardId: c.id, partId: r.partId,
          name: String(r.partName || (part ? part.name : r.partId) || ''),
          unit: part ? String(part.unit || '') : '',
          qty: Number(r.qty), reg: regOf(buses, c.busId),
          who: nameOf(users, r.by), at: r.at == null ? null : Number(r.at),
          orphan: fulfilled
        });
      }
    }
    out.sort(function (a, b) {
      var x = a.at, y = b.at;
      if (x == null && y == null) return a.id < b.id ? -1 : 1;
      if (x == null) return 1;
      if (y == null) return -1;
      return x - y || (a.id < b.id ? -1 : 1);
    });
    return out;
  }

  /* The self-healing half of an interrupted issue (§2.7 (a)): the ledger row
   * landed and the card's line did not. reconcileJobParts() in v1 re-adds it
   * after every applied pull, so this is NOT a form to re-fill — the screen's
   * only job is to say the issue is still being matched. */
  function healingCount(ledger, cards) {
    var have = {}, i, j, c, l, n = 0;
    for (i = 0; i < cards.length; i++) {
      c = cards[i];
      if (!c || c._deleted) continue;
      for (j = 0; j < arr(c.partsUsed).length; j++) {
        l = c.partsUsed[j];
        if (!l) continue;
        var k = String(c.id) + '|' + String(l.partId) + '|' + (l.reused ? 'r' : 'n');
        have[k] = (have[k] || 0) + (Number(l.qty) || 0);
      }
    }
    for (i = 0; i < ledger.length; i++) {
      l = ledger[i];
      if (!l || l.type !== 'out' || l.jobId == null) continue;
      if (!byId(cards, l.jobId)) continue;
      var key = String(l.jobId) + '|' + String(l.partId) + '|' + (l.reused ? 'r' : 'n');
      var want = Number(l.qty) || 0;
      if ((have[key] || 0) + 1e-9 < want) n++;
    }
    return n;
  }

  /* The trust number: the share of counted lines whose variance was zero at the
   * last count. Three states, and they must never look alike — never counted
   * is the dash, counted is the figure with its age, counted long ago carries
   * `stale` so the figure says it may be out of date. */
  function trust(audits, now) {
    var newest = null, i;
    for (i = 0; i < audits.length; i++) {
      if (!audits[i] || audits[i]._deleted) continue;
      if (!newest || Number(audits[i].at) > Number(newest.at)) newest = audits[i];
    }
    if (!newest) return { ever: false, matched: null, lines: 0, at: null, stale: false, shrink: null, found: null };
    var lines = arr(newest.lines), matched = 0;
    for (i = 0; i < lines.length; i++) if (Number(lines[i] && lines[i].variance) === 0) matched++;
    var at = newest.at == null ? null : Number(newest.at);
    return {
      ever: true, matched: matched, lines: lines.length, at: at,
      stale: at != null && (now - at) > COUNT_OLD_D * 86400000,
      shrink: isNum(Number(newest.shrinkValue)) ? Number(newest.shrinkValue) : null,
      found: isNum(Number(newest.foundValue)) ? Number(newest.foundValue) : null
    };
  }

  function pieceWarranty(c, now) {
    var months = Number(c && c.warrantyMonths);
    var bought = c && c.boughtAt == null ? null : Number(c && c.boughtAt);
    // Absent is never "ended": 0 of 2,384 seeded parts carry a warranty, so a
    // screen that read absence as expiry would mark the whole yard out of
    // warranty on day one.
    if (!isNum(months) || months <= 0 || bought == null || !isNum(bought)) {
      return { kind: 'none', at: null };
    }
    var d = new Date(bought);
    d.setMonth(d.getMonth() + Math.round(months));
    var end = d.getTime();
    return { kind: end >= now ? 'in' : 'ended', at: end };
  }

  var PIECE_STATE = {
    'in-service': 'stPieceIn', removed: 'stPieceRemoved', 'sent-out': 'stPieceSentOut',
    refurbished: 'stPieceRefurb', scrapped: 'stPieceScrapped'
  };
  var PIECE_MARK = { tyre: 'tyre', battery: 'battery' };

  function vendorUnpaid(bills, vendorId, vendorName) {
    var out = [], sum = 0, i, b;
    for (i = 0; i < bills.length; i++) {
      b = bills[i];
      if (!b || b._deleted) continue;
      if (b.paymentStatus === 'paid') continue;
      var mine = (b.vendorId != null && String(b.vendorId) === String(vendorId))
        || (vendorName && String(b.supplier || '') === String(vendorName));
      if (!mine) continue;
      out.push(b);
      sum += Number(b.amount) || 0;
    }
    // One vendor's unpaid total only. A sum across vendors is Money's (§2.1).
    return { rows: out, count: out.length, sum: sum };
  }

  function catalogueRows(parts, q, f, moved) {
    var out = [], i, p;
    for (i = 0; i < parts.length; i++) {
      p = parts[i];
      if (!p || p._deleted) continue;
      if (!matches(p, q)) continue;
      if (!inFilter(p, f, moved)) continue;
      out.push(p);
    }
    return out;
  }

  function catRow(p, moved) {
    var st = stockState(p, moved);
    return {
      id: p.id,
      // The name EXACTLY as stored. Not title-cased, not corrected: the shelf
      // label says FULE FILTER and that is what the storekeeper searches for.
      name: String(p.name == null ? p.id : p.name),
      partNo: p.partNo ? String(p.partNo) : '',
      unit: String(p.unit || ''),
      qty: st === 'never' ? null : Number(p.qty),
      state: st, low: isLow(p), level: hasLevel(p) ? Number(p.reorderLevel) : null
    };
  }

  function model(m) {
    register();
    m = m || {};
    var me = m.user || null;
    var role = m.role || (me ? String(me.role) : null);
    var density = m.density === 'desk' ? 'desk' : 'yard';
    var cache = m.cache || {};
    var now = Date.now();

    var base = {
      kind: 'loading', role: role, me: me, density: density,
      offline: !!m.offline, stale: !!m.stale, at: lastSyncAt(),
      tab: setTab(role, tab), tabs: tabsFor(role),
      search: query, catFilter: catFilter,
      may: {
        issue: can(role, 'issuePart'),
        receive: can(role, 'receiveStock'),
        bills: can(role, 'bills'),
        pieces: can(role, 'manageComponents')
      },
      counts: { parts: null, requests: null, noLevel: null, low: null },
      healing: 0, params: m.params || null
    };

    // `undefined` is "not read yet" and `[]` is "read, and empty" — the whole
    // reason ui/states.js exists. A store that came back as something other
    // than an array is the only error this screen can honestly detect.
    var i, v, loaded = true;
    for (i = 0; i < STORES.length; i++) {
      v = cache[STORES[i]];
      if (v === undefined) { loaded = false; continue; }
      if (!Array.isArray(v)) { base.kind = 'error'; return base; }
    }
    if (!loaded) return base;

    var parts = rowsOf(m, 'parts'), ledger = rowsOf(m, 'ledger');
    var cards = rowsOf(m, 'jobcards'), buses = rowsOf(m, 'buses'), users = rowsOf(m, 'users');
    var bills = rowsOf(m, 'purchases'), vendors = rowsOf(m, 'vendors');
    var pieces = rowsOf(m, 'components'), audits = rowsOf(m, 'audits');
    var moved = ledgerIndex(ledger);

    var noLevel = 0;
    for (i = 0; i < parts.length; i++) if (parts[i] && !parts[i]._deleted && !hasLevel(parts[i])) noLevel++;

    var reqs = requestRows(cards, buses, users, parts, ledger);
    base.kind = 'ready';
    base.counts = {
      parts: parts.length, requests: reqs.length,
      noLevel: noLevel, low: low(parts).length
    };
    base.healing = healingCount(ledger, cards);

    // The catalogue, narrowed then windowed. `rows` is only the window: no row
    // off screen is ever built, which is the whole measurement in §20.
    var picked = catalogueRows(parts, query, catFilter, moved);
    var range = winRange(picked.length, first);
    var win = [];
    for (i = range.from; i < range.to; i++) win.push(catRow(picked[i], moved));
    base.cat = {
      total: picked.length, all: parts.length, rows: win,
      from: range.from, to: range.to, above: range.above, below: range.below,
      windowed: picked.length > SPAN
    };

    var pieceRows = [];
    for (i = 0; i < pieces.length && pieceRows.length < LIST_CAP; i++) {
      var c = pieces[i];
      if (!c || c._deleted) continue;
      pieceRows.push({
        id: c.id, kind: String(c.kind || ''), label: String(c.label || c.id),
        serial: c.serial ? String(c.serial) : '',
        state: String(c.state || ''), reg: c.busId ? regOf(buses, c.busId) : '',
        position: c.position ? String(c.position) : '',
        warranty: pieceWarranty(c, now)
      });
    }
    base.pieces = { rows: pieceRows, total: pieces.length, capped: pieces.length > LIST_CAP };

    base.requests = { rows: reqs.slice(0, LIST_CAP), total: reqs.length,
                      capped: reqs.length > LIST_CAP, now: now };

    var billRows = [];
    for (i = 0; i < bills.length; i++) if (bills[i] && !bills[i]._deleted) billRows.push(bills[i]);
    billRows.sort(function (a, b) { return (Number(b.at) || 0) - (Number(a.at) || 0); });
    base.bills = {
      rows: billRows.slice(0, LIST_CAP), total: billRows.length, capped: billRows.length > LIST_CAP,
      vendor: null
    };
    if (openVendor) {
      var vrec = byId(vendors, openVendor);
      if (vrec) base.bills.vendor = { rec: vrec, unpaid: vendorUnpaid(billRows, vrec.id, vrec.name) };
    }

    base.count = {
      trust: trust(audits, now),
      session: session ? {
        mode: session.mode, scope: session.scope, saving: !!session.saving,
        rows: sessionRows(session, parts, moved), typedCount: typedCount(session)
      } : null
    };
    base.vendors = vendors;
    return base;
  }

  function typedCount(s) {
    var n = 0, k;
    for (k in s.typed) if (Object.prototype.hasOwnProperty.call(s.typed, k) && String(s.typed[k]) !== '') n++;
    return n;
  }

  /* A session is one category or one search result — twenty to sixty lines, not
   * 2,384. `audits` is written once, at the end, and is append-only for the
   * store role, so a half-saved count has nowhere to live: scoping it is what
   * makes losing one cost minutes instead of an afternoon (§2.6). */
  function sessionRows(s, parts, moved) {
    var out = [], i, p;
    for (i = 0; i < parts.length; i++) {
      p = parts[i];
      if (!p || p._deleted) continue;
      if (s.scope.kind === 'category' && String(p.category || '') !== s.scope.value) continue;
      if (s.scope.kind === 'search' && !matches(p, s.scope.value)) continue;
      out.push({
        id: p.id, name: String(p.name == null ? p.id : p.name),
        partNo: p.partNo ? String(p.partNo) : '', unit: String(p.unit || ''),
        book: Number(p.qty), state: stockState(p, moved),
        typed: Object.prototype.hasOwnProperty.call(s.typed, p.id) ? String(s.typed[p.id]) : ''
      });
      if (out.length >= LIST_CAP) break;
    }
    return out;
  }

  /* ---------------------------------------------------------------------- *
   * render — pure, one string, and the caller does one insert
   * ---------------------------------------------------------------------- */

  /* THE HEADLINE, and the zero-versus-unknown rule in the one place a
   * storekeeper looks first (`v2-ux.md §4.1` #7, REV-FLOW F8).
   *
   * `v.counts.parts` is `null` until the shelf has been read, and this drew
   * `say('stPartsN', { c: group(v.counts.parts || 0) }, 0)` — so for the whole
   * of the loading state it read **"0 parts"**, as a settled figure, in plain
   * text, over a shelf holding seven lines. The `|| 0` is how a count that is
   * not known becomes a claim that there are none, which is the defect this
   * repo has been bitten by most and the reason `figure()` tests for "no value"
   * before it formats.
   *
   * So an unknown count draws the label and the dash `figure()` already owns
   * for exactly this, and never a number. The shelf's real count arrives with
   * the read, one tick later at worst now that `load()` redraws. */
  function header(v) {
    var known = v.counts.parts != null;
    var facts = '<p class="st-facts">'
      + (known
          ? esc(say('stPartsN', { c: group(v.counts.parts) }, v.counts.parts))
          : esc(say('stPartsUnread')) + ' ' + fig(null, {}))
      + (v.counts.requests ? ' · ' + esc(say('stReqN', null, v.counts.requests)) : '')
      + '</p>';
    var acts = '';
    // Absent, never disabled: a control the person may not use is not drawn.
    if (v.may.issue) {
      acts += '<button type="button" class="btn btn-primary" data-act="stIssue">'
        + esc(say('stIssueBtn')) + '</button>';
    }
    if (v.may.receive) {
      acts += '<button type="button" class="btn" data-act="stReceive">'
        + draw('add', 20) + ' ' + esc(say('stReceiveBtn')) + '</button>';
    }
    var search = '<label class="num st-find"><span class="sr-only">' + esc(say('stSearchLabel')) + '</span>'
      + '<span class="st-find-m">' + draw('search', 20) + '</span>'
      + '<input class="field" type="search" autocomplete="off" data-field="stSearch"'
      + ' placeholder="' + esc(say('stSearchLabel')) + '" value="' + esc(v.search) + '"></label>';
    return '<div class="st-head">' + facts
      + (acts ? '<div class="st-acts">' + acts + '</div>' : '') + search + '</div>';
  }

  function tabStrip(v) {
    var label = { catalogue: 'stTabCatalogue', pieces: 'stTabPieces', requests: 'stTabRequests',
                  bills: 'stTabBills', counts: 'stTabCounts' };
    var out = '', i, id;
    for (i = 0; i < v.tabs.length; i++) {
      id = v.tabs[i];
      out += '<button type="button" role="tab" aria-selected="' + (id === v.tab ? 'true' : 'false') + '"'
        + ' data-tab="' + id + '">' + esc(say(label[id]))
        + (id === 'requests' && v.counts.requests ? ' (' + esc(String(v.counts.requests)) + ')' : '')
        + '</button>';
    }
    return '<div class="tabs st-tabs" role="tablist">' + out + '</div>';
  }

  function stateWords(r) {
    if (r.state === 'negative') return say('stBookSaysNeg', { v: group(r.qty) });
    if (r.state === 'out') return say('stOutOfStock');
    if (r.state === 'never') return say('stNeverCounted');
    return '';
  }

  function catBadge(r) {
    if (r.low) {
      return '<span class="badge badge-warn">' + draw('warn', 14) + ' ' + esc(say('stLow')) + '</span>';
    }
    if (r.state === 'negative') {
      return '<span class="badge badge-bad">' + draw('count', 14) + ' ' + esc(say('stCountThis')) + '</span>';
    }
    return '';
  }

  /* The row. Two lines at yard, ONE at desk — a windowed list may only use the
   * one-line row, because the window's arithmetic has exactly one row height.
   * No `at` on the figure: a list states its freshness once, in its header. */
  function catRowHtml(r, v) {
    var desk = v.density === 'desk';
    var act = fig(r.qty, { unit: r.unit }) + catBadge(r);
    if (desk && v.may.issue) {
      act += '<span class="btn btn-quiet st-issue-row" data-act="stIssuePart" data-part="' + esc(r.id) + '">'
        + esc(say('stIssueRow')) + '</span>';
    }
    var sub = desk ? '' : '<div class="sub">'
      + esc((r.partNo || say('stNoPartNo'))
        + ' · ' + (r.level == null ? say('stNoLevel') : say('stReorderAt', { v: group(r.level) }))
        + (stateWords(r) ? ' · ' + stateWords(r) : '')) + '</div>';
    return '<a class="v2row st-row" href="#" data-open-part="' + esc(r.id) + '">'
      + '<span class="lead">' + draw('part', desk ? 16 : 20) + '</span>'
      + '<div class="txt"><div class="t">' + esc(r.name) + '</div>' + sub + '</div>'
      + '<div class="act">' + act + '</div></a>';
  }

  /* The window, as one string. The spacing above and below is arithmetic on
   * --row-h, so the scroll bar is the full catalogue's and nothing was
   * measured to get it. */
  function windowHtml(v) {
    var rows = '', i;
    for (i = 0; i < v.cat.rows.length; i++) rows += catRowHtml(v.cat.rows[i], v);
    var pad = 'padding-top:calc(var(--row-h) * ' + v.cat.above + ');'
      + 'padding-bottom:calc(var(--row-h) * ' + v.cat.below + ')';
    return '<div class="st-win" data-win="cat" style="' + pad + '">' + rows + '</div>';
  }

  function catalogue(v) {
    if (!v.cat.all) {
      return root.emptyState(say('stEmptyCat'), {
        icon: 'part',
        hint: v.may.issue ? say('stEmptyCatHint') : say('stMechHint')
      });
    }
    if (!v.cat.total) {
      return root.emptyState(v.search ? say('stNoMatch', { q: '"' + v.search + '"' }) : say('stEmptyCat'),
                             { icon: 'search', hint: v.may.issue ? say('stEmptyCatHint') : say('stMechHint') });
    }
    var head = '';
    /* The 2,384 with no reorder level are ONE line with a way to fix them, not
     * 2,384 red rows. This is the count that could never reach zero, stated as
     * what it is. */
    if (v.counts.noLevel) {
      head += '<p class="st-note">' + draw('warn', 14) + ' '
        + esc(say('stNoLevels', { v: group(v.counts.noLevel) }))
        + ' <button type="button" class="btn btn-quiet" data-act="stSetNoLevel">'
        + esc(say('stSetLevel')) + '</button></p>';
    }
    if (v.healing) {
      head += '<p class="st-note">' + draw('clock', 14) + ' '
        + esc(say('stHealing', null, v.healing)) + '</p>';
    }
    if (v.cat.windowed) {
      head += '<p class="st-sub">' + esc(say('stSearchOnly', { v: group(v.cat.all) })) + '</p>';
    }
    var filt = v.cat.total > 1
      ? '<button type="button" class="btn btn-quiet st-filter" data-act="stFilterSheet">'
        + draw('filter', 20) + ' ' + esc(say('stFilter'))
        + (v.catFilter === 'all' ? '' : ' · ' + esc(filterLabel(v.catFilter))) + '</button>'
      : '';
    return head + filt
      + '<div class="st-cat" data-cat-scroll tabindex="0">' + windowHtml(v) + '</div>'
      + '<p class="st-cap">' + esc(say('stCapLine', { shown: group(v.cat.rows.length), total: group(v.cat.total) })) + '</p>';
  }

  function filterLabel(f) {
    if (f === 'low') return say('stFilterLow');
    if (f === 'nolevel') return say('stFilterNoLevel');
    if (f === 'out') return say('stFilterOut');
    if (f === 'serial') return say('stFilterSerial');
    return say('stFilterAll');
  }

  function filterSheet(v) {
    var out = '', i, f;
    for (i = 0; i < CAT_FILTERS.length; i++) {
      f = CAT_FILTERS[i];
      out += '<button type="button" class="v2row" data-act="stSetFilter" data-filter="' + f + '"'
        + (f === v.catFilter ? ' aria-current="true"' : '') + '>'
        + '<span class="lead">' + draw(f === 'all' ? 'part' : 'filter', 20) + '</span>'
        + '<div class="txt"><div class="t">' + esc(filterLabel(f)) + '</div></div></button>';
    }
    // By category, from the catalogue's own categories — never a fixed list.
    return '<div class="st-sheet">' + out + '</div>';
  }

  function pieceRowHtml(r) {
    var mark = PIECE_MARK[r.kind] || 'part';
    var sub = (r.reg ? r.reg : '') + (r.position ? ' · ' + r.position : ' · ' + say('stNoPosition'));
    var st = PIECE_STATE[r.state];
    var badge = st
      ? '<span class="badge' + (r.state === 'in-service' ? ' badge-ok' : '') + '">'
        + draw(r.state === 'in-service' ? 'ok' : 'clock', 14) + ' ' + esc(say(st)) + '</span>'
      : '';
    return '<a class="v2row" href="#" data-open-piece="' + esc(r.id) + '">'
      + '<span class="lead">' + draw(mark, 20) + '</span>'
      + '<div class="txt"><div class="t">' + esc(r.label + ' · ' + (r.serial || say('stNoSerial'))) + '</div>'
      + '<div class="sub">' + esc(sub) + '</div></div>'
      + '<div class="act">' + badge + '</div></a>';
  }

  function warrantyWords(wn) {
    if (wn.kind === 'in') return say('stWarrantyTo', { date: dateName(wn.at) });
    if (wn.kind === 'ended') return say('stWarrantyEnded', { date: dateName(wn.at) });
    return say('stWarrantyNone');
  }

  function pieces(v) {
    if (!v.pieces.rows.length) {
      return root.emptyState(say('stEmptyPieces'), { icon: 'tyre' });
    }
    var out = '', i;
    for (i = 0; i < v.pieces.rows.length; i++) out += pieceRowHtml(v.pieces.rows[i]);
    if (v.pieces.capped) {
      out += '<p class="st-cap">' + esc(say('stCapLine', { shown: group(v.pieces.rows.length),
                                                           total: group(v.pieces.total) })) + '</p>';
    }
    return out;
  }

  function requests(v) {
    if (!v.requests.rows.length) {
      return root.emptyState(say('stEmptyReq'), { icon: 'ok', hint: say('stEmptyReqHint') });
    }
    var out = '', i, r;
    for (i = 0; i < v.requests.rows.length; i++) {
      r = v.requests.rows[i];
      out += '<button type="button" class="v2row" data-act="stFulfil" data-req="' + esc(r.id) + '">'
        + '<span class="lead">' + draw('part', 20) + '</span>'
        + '<div class="txt"><div class="t">'
        + esc(say('stRequestRow', { qty: isNum(r.qty) ? group(r.qty) : '', unit: r.unit,
                                    name: r.name, bus: r.reg })) + '</div>'
        + '<div class="sub">' + esc(r.orphan ? say('stReqNoIssue') : say('stAskedBy', { who: r.who })) + '</div></div>'
        + '<div class="act">' + fig(r.at == null ? null : v.requests.now - r.at, { format: ageWords }) + '</div></button>';
    }
    if (v.requests.capped) {
      out += '<p class="st-cap">' + esc(say('stCapLine', { shown: group(v.requests.rows.length),
                                                           total: group(v.requests.total) })) + '</p>';
    }
    return out;
  }

  function billRowHtml(b) {
    var paid = b.paymentStatus === 'paid';
    return '<button type="button" class="v2row" data-act="stOpenBill" data-bill="' + esc(b.id) + '">'
      + '<span class="lead">' + draw('doc', 20) + '</span>'
      + '<div class="txt"><div class="t">' + esc(String(b.supplier || '') + ' · '
        + (b.billNo ? String(b.billNo) : say('stNoBillNo'))) + '</div>'
      + '<div class="sub">' + esc(dateName(b.at)) + '</div></div>'
      + '<div class="act">' + fig(isNum(Number(b.amount)) ? Number(b.amount) : null, { format: rupees })
      + '<span class="badge badge-' + (paid ? 'ok' : 'warn') + '">'
      + draw(paid ? 'ok' : 'clock', 14) + ' ' + esc(say(paid ? 'stPaid' : 'stUnpaid')) + '</span>'
      + '</div></button>';
  }

  function vendorCard(v) {
    var rec = v.bills.vendor.rec, u = v.bills.vendor.unpaid;
    var rows = '', i;
    for (i = 0; i < u.rows.length; i++) rows += billRowHtml(u.rows[i]);
    var lines = '';
    if (rec.category) lines += drow('stCategoryL', String(rec.category));
    if (rec.city) lines += drow('stCity', String(rec.city));
    if (rec.gstin) lines += drow('stGstin', String(rec.gstin));
    if (rec.notes) lines += drow('stNotes', String(rec.notes));
    if (rec.isRepairVendor) lines += drow('stRepairVendor', say('stYes'));
    var phone = rec.phone
      ? '<div class="drow"><span class="drow-l">' + esc(say('stPhone')) + '</span>'
        + '<a class="drow-v" href="tel:' + esc(String(rec.phone).replace(/[^0-9+]/g, '')) + '">'
        + esc(String(rec.phone)) + '</a></div>'
      : '';
    /* ONE vendor's unpaid bills: the list, the count and their sum. You cannot
     * settle with MIDAS TYRE without knowing what MIDAS TYRE is owed, and that
     * is managing the bill. A sum across vendors is Money's. */
    var owed = '<div class="st-owed"><span class="st-owed-l">' + esc(say('stVendorOwed')) + '</span>'
      + fig(u.count ? u.sum : null, { format: rupees })
      + '<span class="st-owed-n">' + esc(u.count ? say('stVendorUnpaidN', null, u.count) : say('stVendorNone'))
      + '</span></div>';
    return '<div class="card st-vendor"><h3>' + esc(String(rec.name || rec.id)) + '</h3>'
      + lines + phone + owed + rows + '</div>';
  }

  function drow(id, value) {
    return '<div class="drow"><span class="drow-l">' + esc(say(id)) + '</span>'
      + '<span class="drow-v">' + esc(value) + '</span></div>';
  }

  function bills(v) {
    if (v.bills.vendor) return vendorCard(v);
    if (!v.bills.rows.length) {
      return root.emptyState(say('stEmptyBills'), { icon: 'doc', hint: say('stEmptyBillsHint') });
    }
    var out = '', i;
    for (i = 0; i < v.bills.rows.length; i++) out += billRowHtml(v.bills.rows[i]);
    if (v.bills.capped) {
      out += '<p class="st-cap">' + esc(say('stCapLine', { shown: group(v.bills.rows.length),
                                                           total: group(v.bills.total) })) + '</p>';
    }
    return out;
  }

  /* The shelf against the book. Every number here is typed, so every row is a
   * `div` — never a button, never a link — the field is `type="text"` with
   * `inputmode="numeric"`, and there are no steppers. */
  function countRowHtml(r, mode) {
    var book = mode === 'full'
      ? '<span class="st-book">' + esc(say('stBookFig', { v: group(r.book) })) + '</span>' : '';
    return '<div class="v2row st-count-row">'
      + '<span class="lead">' + draw('count', 20) + '</span>'
      + '<div class="txt"><div class="t">' + esc(r.name) + '</div>'
      + '<div class="sub">' + esc(r.partNo || say('stNoPartNo')) + '</div></div>'
      + '<div class="act">' + book
      + '<label class="num"><span class="sr-only">' + esc(say('stCountedLabel')) + '</span>'
      + '<input class="field num-in" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off"'
      + ' enterkeyhint="next" data-kind="whole" data-count="' + esc(r.id) + '"'
      + ' value="' + esc(r.typed) + '"></label></div></div>';
  }

  function trustHtml(t) {
    if (!t.ever) {
      return '<p class="st-trust">' + fig(null) + ' ' + esc(say('stTrustNever')) + '</p>';
    }
    var f = fig(t.matched, {
      at: t.at, stale: t.stale,
      format: function (n) { return say('stTrust', { m: group(n), t: group(t.lines) }); }
    });
    return '<p class="st-trust">' + f + '</p>'
      + '<div class="st-trust-v">'
      + '<span class="st-owed-l">' + esc(say('stShrinkL')) + '</span>' + fig(t.shrink, { format: rupees })
      + '<span class="st-owed-l">' + esc(say('stFoundL')) + '</span>' + fig(t.found, { format: rupees })
      + '</div>';
  }

  function counts(v) {
    var t = v.count.trust;
    if (!v.count.session) {
      var head = trustHtml(t);
      if (!t.ever) {
        head += root.emptyState(say('stEmptyCounts'), { icon: 'count', hint: say('stEmptyCountsHint') });
      }
      return head + '<button type="button" class="btn btn-primary st-wide" data-act="stStartCount">'
        + draw('count', 20) + ' ' + esc(say('stStartCount')) + '</button>';
    }
    var s = v.count.session, out = '', i;
    // Stated before anything is typed, every draw, because `audits` is written
    // once at the end and there is nowhere for a partial count to live.
    out += '<p class="st-warn">' + draw('warn', 14) + ' ' + esc(say('stCountWarn')) + '</p>';
    if (v.offline) out += '<p class="st-sub">' + esc(say('stCountOffline')) + '</p>';
    out += trustHtml(t);
    for (i = 0; i < s.rows.length; i++) out += countRowHtml(s.rows[i], s.mode);
    out += '<button type="button" class="btn btn-primary st-wide" data-act="stSaveCount"'
      + (s.typedCount && !s.saving ? '' : ' aria-disabled="true"') + '>'
      + esc(s.saving ? say('stSavingCount') : say('stSaveCount')) + '</button>';
    return out;
  }

  function body(v) {
    if (v.kind === 'loading') {
      return typeof root.skeleton === 'function'
        ? root.skeleton(v.density === 'desk' ? 20 : 8) : '';
    }
    if (v.kind === 'error') {
      return typeof root.errorState === 'function' ? root.errorState(say('stErrCat'), reload) : '';
    }
    if (v.tab === 'pieces') return pieces(v);
    if (v.tab === 'requests') return requests(v);
    if (v.tab === 'bills') return bills(v);
    if (v.tab === 'counts') return counts(v);
    return catalogue(v);
  }

  function render(m) {
    var v = model(m);
    lastView = v;
    return '<div class="st" data-screen="store">' + header(v) + tabStrip(v)
      + '<div class="st-view"' + (v.density === 'desk' ? ' data-density="desk"' : '') + '>'
      + body(v) + '</div></div>';
  }

  /* ---------------------------------------------------------------------- *
   * the sheets, pure so the suite can read them without a browser
   * ---------------------------------------------------------------------- */

  function openCards(cards) {
    var out = [], i, c;
    for (i = 0; i < cards.length; i++) {
      c = cards[i];
      if (!c || c._deleted) continue;
      if (c.status === 'done' || c.status === 'verified') continue;
      out.push(c);
    }
    return out;
  }

  /* THE CARD THE ROUTE NAMED, and nothing else.
   *
   * d738a6e is a floor report of a part charged to the wrong bus because the
   * sheet pre-picked the first open job. So this returns a card ONLY when the
   * route carries its id and that card is open: there is no fallback to
   * cards[0], no "most recent", no guess. A jobId arrives here from the Job
   * card (#4) — `Router.go('store', {jobId})` — which means a person standing
   * on that card asked for a part against it; that is the same case as a
   * mechanic's part request, which §2.7 (b) says is not the pre-selection
   * d738a6e forbids, "because the mechanic named them, not the sheet". With no
   * jobId the card step opens with NOTHING chosen, which is the defect's own
   * case and the one the suite checks hardest.
   */
  function cardFromRoute(params, cards) {
    var id = params && params.jobId != null ? String(params.jobId) : '';
    if (!id) return null;
    var open = openCards(arr(cards));
    for (var i = 0; i < open.length; i++) if (String(open[i].id) === id) return open[i];
    return null;
  }

  function cardStep(v, cards, buses) {
    var chosen = issue && issue.cardId ? byId(arr(cards), issue.cardId) : null;
    if (chosen) {
      return '<div class="st-step"><p class="st-step-h">'
        + esc(say('stCardChosen', { card: chosen.id, bus: regOf(arr(buses), chosen.busId) })) + '</p>'
        + '<button type="button" class="btn btn-quiet" data-act="stClearCard">'
        + esc(say('stChangeCard')) + '</button></div>';
    }
    var open = openCards(arr(cards)), out = '', i;
    for (i = 0; i < open.length && i < LIST_CAP; i++) {
      out += '<button type="button" class="v2row" data-act="stPickCard" data-card="' + esc(open[i].id) + '">'
        + '<span class="lead">' + draw('job', 20) + '</span>'
        + '<div class="txt"><div class="t">' + esc(regOf(arr(buses), open[i].busId)) + '</div>'
        + '<div class="sub">' + esc(String(open[i].problem || '') + ' · ' + dateName(open[i].createdAt)) + '</div></div>'
        + '</button>';
    }
    if (!out) out = '<p class="st-sub">' + esc(say('stNoOpenCard')) + '</p>';
    return '<div class="st-step"><p class="st-step-h">' + esc(say('stStepCard')) + '</p>' + out + '</div>';
  }

  function partStep(v, parts, ledger) {
    var chosen = issue && issue.partId ? byId(arr(parts), issue.partId) : null;
    var moved = ledgerIndex(arr(ledger));
    if (chosen) {
      var st = stockState(chosen, moved);
      return '<div class="st-step"><p class="st-step-h">' + esc(String(chosen.name)) + '</p>'
        + '<p class="st-sub">' + fig(st === 'never' ? null : Number(chosen.qty),
                                     { unit: chosen.unit, at: lastSyncAt() })
        + ' ' + esc(say('stInStock')) + '</p>'
        + '<button type="button" class="btn btn-quiet" data-act="stClearPart">'
        + esc(say('stStepPart')) + '</button></div>';
    }
    var q = issue && issue.search ? issue.search : '';
    var list = catalogueRows(arr(parts), q, 'all', moved), out = '', i, p, st2;
    for (i = 0; i < list.length && i < 20; i++) {
      p = list[i];
      st2 = stockState(p, moved);
      /* The stock figure AND ITS AGE beside every result: `parts.qty` is a
       * mutable scalar updated in place, so two storekeepers issuing offline
       * both decrement it and the later write replaces the other's (03 §5.5).
       * The age is the only honest thing to show about it. */
      out += '<button type="button" class="v2row" data-act="stPickPart" data-part="' + esc(p.id) + '">'
        + '<span class="lead">' + draw('part', 20) + '</span>'
        + '<div class="txt"><div class="t">' + esc(String(p.name)) + '</div>'
        + '<div class="sub">' + esc(p.partNo || say('stNoPartNo')) + '</div></div>'
        + '<div class="act">' + fig(st2 === 'never' ? null : Number(p.qty),
                                    { unit: p.unit, at: lastSyncAt() }) + '</div></button>';
    }
    if (!out && q) out = '<p class="st-sub">' + esc(say('stNoMatch', { q: '"' + q + '"' })) + '</p>';
    return '<div class="st-step"><p class="st-step-h">' + esc(say('stStepPart')) + '</p>'
      + '<label class="num"><span class="sr-only">' + esc(say('stSearchLabel')) + '</span>'
      + '<input class="field" type="search" autocomplete="off" data-field="stIssueSearch"'
      + ' placeholder="' + esc(say('stSearchLabel')) + '" value="' + esc(q) + '"></label>'
      + out + '</div>';
  }

  function qtyStep(parts) {
    var p = issue && issue.partId ? byId(arr(parts), issue.partId) : null;
    var reusable = !!(p && p.reusable);
    // Blank, never a pre-filled 1, and no stepper: every number on this screen
    // is a reading or a count.
    return '<div class="st-step"><p class="st-step-h">' + esc(say('stStepQty')) + '</p>'
      + '<label class="num"><span class="num-l">' + esc(say('stStepQty')) + '</span>'
      + '<input class="field num-in" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off"'
      + ' enterkeyhint="done" data-kind="whole" data-field="stIssueQty"'
      + ' value="' + esc(issue && issue.qty != null ? issue.qty : '') + '"></label>'
      + (reusable
        ? '<label class="num"><input type="checkbox" data-field="stIssueReused"'
          + (issue && issue.reused ? ' checked' : '') + '> '
          + esc(say('stReused')) + '</label>'
        : '') + '</div>';
  }

  function issueReady(cards, parts) {
    if (!issue) return { ok: false, why: 'stIssueNeedCard' };
    if (!issue.cardId || !byId(arr(cards), issue.cardId)) return { ok: false, why: 'stIssueNeedCard' };
    if (!issue.partId || !byId(arr(parts), issue.partId)) return { ok: false, why: 'stIssueNeedPart' };
    var n = Number(issue.qty);
    if (!isNum(n) || n <= 0 || String(issue.qty) === '') return { ok: false, why: 'stIssueNeedQty' };
    return { ok: true, qty: Math.round(n) };
  }

  function issueSheet(m) {
    var cards = rowsOf(m, 'jobcards'), parts = rowsOf(m, 'parts');
    var buses = rowsOf(m, 'buses'), ledger = rowsOf(m, 'ledger');
    var v = { density: m && m.density === 'desk' ? 'desk' : 'yard' };
    var ready = issueReady(cards, parts);
    var confirm = '';
    if (ready.ok) {
      var p = byId(parts, issue.partId), c = byId(cards, issue.cardId);
      var from = Number(p.qty);
      confirm = '<p class="st-confirm">' + esc(say('stIssueConfirm', {
        qty: group(ready.qty), unit: String(p.unit || ''), name: String(p.name),
        bus: regOf(buses, c.busId), card: c.id,
        from: isNum(from) ? group(from) : '', to: isNum(from) ? group(from - ready.qty) : ''
      })) + '</p>';
    }
    return '<form class="st-sheet" data-sheet="issue">'
      + cardStep(v, cards, buses) + partStep(v, parts, ledger) + qtyStep(parts) + confirm
      + '<button type="button" class="btn btn-primary st-wide" data-act="stIssueSave"'
      + (ready.ok && !(issue && issue.working) ? '' : ' aria-disabled="true"') + '>'
      + esc(issue && issue.working ? say('stIssuing') : say('stIssueBtn')) + '</button>'
      + (ready.ok ? '' : '<p class="st-sub">' + esc(say(ready.why)) + '</p>')
      + '</form>';
  }

  /* One part. The name as stored, the book figure WITH ITS AGE, what the
   * reorder level says, and this part's own value in stock — a part's unitCost
   * and the stock value of that part are this screen's; fleet stock value is
   * not (§2.1). The Issue control is absent without `issuePart`, which is how
   * a mechanic's read-only catalogue stays read-only. */
  function partSheet(m, id) {
    var parts = rowsOf(m, 'parts');
    var p = byId(parts, id);
    if (!p) return '';
    var moved = ledgerIndex(rowsOf(m, 'ledger'));
    var st = stockState(p, moved);
    var qty = Number(p.qty);
    var r = catRow(p, moved);
    var out = '<div class="st-sheet"><p class="st-step-h">' + esc(String(p.name == null ? p.id : p.name)) + '</p>'
      + '<p class="st-sub">' + fig(r.qty, { unit: p.unit, at: lastSyncAt() }) + ' ' + esc(say('stInStock'))
      + (stateWords(r) ? ' · ' + esc(stateWords(r)) : '') + '</p>'
      + drow('stNoPartNo', p.partNo ? String(p.partNo) : say('stNoPartNo'))
      + '<div class="drow"><span class="drow-l">' + esc(say('stFilterLow')) + '</span>'
      + '<span class="drow-v">'
      + (r.level == null ? esc(say('stNoLevel')) : esc(say('stReorderAt', { v: group(r.level) })))
      + '</span></div>'
      + '<div class="drow"><span class="drow-l">' + esc(say('stUnitCost')) + '</span>'
      + '<span class="drow-v">' + fig(isNum(Number(p.unitCost)) && Number(p.unitCost) > 0
        ? Number(p.unitCost) : null, { format: rupees }) + '</span></div>'
      + '<div class="drow"><span class="drow-l">' + esc(say('stStockValue')) + '</span>'
      + '<span class="drow-v">' + fig(st === 'never' || !isNum(qty) || !isNum(Number(p.unitCost))
        || Number(p.unitCost) <= 0 ? null : qty * Number(p.unitCost), { format: rupees }) + '</span></div>';
    if (can(m.role, 'issuePart')) {
      out += '<button type="button" class="btn btn-primary st-wide" data-act="stIssuePart"'
        + ' data-part="' + esc(p.id) + '">' + esc(say('stIssueBtn')) + '</button>';
    }
    return out + '</div>';
  }

  function countSheet(m) {
    var parts = rowsOf(m, 'parts'), cats = {}, list = [], i, c;
    for (i = 0; i < parts.length; i++) {
      c = String((parts[i] && parts[i].category) || '');
      if (c && !cats[c]) { cats[c] = true; list.push(c); }
    }
    list.sort();
    var opts = '', j;
    for (j = 0; j < list.length; j++) {
      opts += '<option value="' + esc(list[j]) + '">' + esc(list[j]) + '</option>';
    }
    /* The mode is chosen ONCE, here, and cannot be changed mid-count:
     * switching to Full halfway makes a blind count not blind, and the record
     * would say it was blind. */
    return '<form class="st-sheet" data-sheet="count">'
      + '<label class="num"><span class="num-l">' + esc(say('stCountMode')) + '</span>'
      + '<select class="select" data-field="stCountMode">'
      + '<option value="blind">' + esc(say('stModeBlind')) + '</option>'
      + '<option value="full">' + esc(say('stModeFull')) + '</option></select></label>'
      + '<label class="num"><span class="num-l">' + esc(say('stCountScope')) + '</span>'
      + '<select class="select" data-field="stCountScope">'
      + (query ? '<option value="search">' + esc(query) + '</option>' : '')
      + opts + '</select></label>'
      + '<button type="button" class="btn btn-primary st-wide" data-act="stCountBegin">'
      + esc(say('stStartCount')) + '</button></form>';
  }

  /* Receive stock. The photo is first, and offline the sheet says so BEFORE
   * anything is filled in: the photo and the stock are local writes, the
   * READING needs signal, and a person should know which half will not happen
   * before they start. */
  function receiveSheet(m) {
    var r = receive || { photos: [], draft: null, reading: false };
    var offline = !!(m && m.offline);
    var grid = typeof root.photoGrid === 'function'
      ? root.photoGrid(r.photos, { capture: true, max: 2, label: say('stTakePhoto'), name: 'bill' })
      : '';
    var head = offline ? '<p class="st-warn">' + draw('offline', 14) + ' '
      + esc(say('stReceiveOffline')) + '</p>' : '';
    var read = '';
    if (r.reading) {
      read = '<p class="st-sub">' + esc(say('stReading')) + '</p>'
        + (typeof root.skeleton === 'function' ? root.skeleton(4) : '');
    } else if (!r.draft) {
      read = '<p class="st-sub">' + esc(say('stNotSavedYet')) + '</p>'
        + (offline || !r.photos.length ? ''
          : (canRead()
            ? '<button type="button" class="btn" data-act="stReadBill">'
              + esc(say('stReadBill')) + '</button>'
            : '<button type="button" class="btn" data-act="stHandBill">'
              + esc(say('stHandBill')) + '</button>'));
    } else {
      read = draftHtml(r.draft, rowsOf(m, 'parts'));
    }
    return '<form class="st-sheet" data-sheet="receive">' + head + grid + read
      + '<button type="button" class="btn btn-primary st-wide" data-act="stReceiveSave"'
      + (r.draft && !r.working ? '' : ' aria-disabled="true"') + '>'
      + esc(r.working ? say('stSaving') : say('stSave')) + '</button></form>';
  }

  function draftHtml(d, parts) {
    var out = '', i, l, matched = 0, unmatched = '';
    out += '<p class="st-sub">'
      + esc(d.model ? say('stReadBy', { model: String(d.model) }) : say('stByHand')) + '</p>'
      + '<label class="num"><span class="num-l">' + esc(say('stSupplier')) + '</span>'
      + '<input class="field" type="text" autocomplete="off" data-field="stBillSupplier"'
      + ' value="' + esc(String(d.supplier || '')) + '"></label>'
      + '<label class="num"><span class="num-l">' + esc(say('stBillNo')) + '</span>'
      + '<input class="field" type="text" autocomplete="off" data-field="stBillNo"'
      + ' value="' + esc(String(d.billNo || '')) + '"></label>'
      + '<label class="num"><span class="num-l">' + esc(say('stAmount')) + '</span>'
      + '<input class="field num-in" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off"'
      + ' data-kind="whole" data-field="stBillAmount" value="' + esc(String(d.total == null ? '' : d.total)) + '"></label>';
    for (i = 0; i < arr(d.lines).length; i++) {
      l = d.lines[i];
      var p = l && l.partId ? byId(arr(parts), l.partId) : null;
      var row = '<div class="v2row"><span class="lead">' + draw('part', 20) + '</span>'
        + '<div class="txt"><div class="t">' + esc(String((p && p.name) || l.text || '')) + '</div>'
        + '<div class="sub">' + esc(String(l.qty == null ? '' : group(Number(l.qty)))) + '</div></div>'
        + '<div class="act">' + fig(isNum(Number(l.rate)) ? Number(l.rate) : null, { format: rupees })
        + (p ? '' : '<button type="button" class="btn btn-quiet" data-act="stFindPart" data-line="' + i + '">'
            + esc(say('stFindPart')) + '</button>') + '</div></div>';
      if (p) { out += row; matched++; }
      else unmatched += row;
    }
    /* A line the reader could not match to the catalogue cannot go into
     * `purchases.lines[]`, which needs a partId — so it is shown under its own
     * heading and never dropped. A silently dropped line is stock the bill says
     * arrived and the book never heard about. */
    if (unmatched) {
      out += '<p class="st-step-h">' + esc(say('stUnmatched')) + '</p>' + unmatched;
    }
    out += '<p class="st-confirm">' + esc(say('stReceiveConfirm', { v: group(matched) })) + '</p>';
    return out;
  }

  function billSheet(m, id) {
    var b = byId(rowsOf(m, 'purchases'), id);
    if (!b) return '';
    var vendors = rowsOf(m, 'vendors');
    var vrec = b.vendorId ? byId(vendors, b.vendorId) : null;
    if (!vrec) {
      for (var i = 0; i < vendors.length; i++) {
        if (String(vendors[i].name || '') === String(b.supplier || '')) { vrec = vendors[i]; break; }
      }
    }
    var photos = typeof root.photoGrid === 'function'
      ? root.photoGrid(b.billPhoto ? [{ url: b.billPhoto }] : [], { capture: false }) : '';
    var paid = b.paymentStatus === 'paid';
    var mark = (!paid && can(m.role, 'bills'))
      ? '<button type="button" class="btn st-wide" data-act="stMarkPaid" data-bill="' + esc(b.id) + '">'
        + esc(say('stMarkPaid')) + '</button>' : '';
    // For the store role every field but the three payment ones is locked after
    // entry (02 §4.4), and the reason is in words rather than a dead control.
    var locked = '<p class="st-sub">' + esc(say('stBillLocked')) + '</p>';
    return '<div class="st-sheet st-bill">' + photos
      + drow('stSupplier', String(b.supplier || ''))
      + drow('stBillNo', b.billNo ? String(b.billNo) : say('stNoBillNo'))
      + drow('stBillDate', dateName(b.at))
      + drow('stAmount', rupees(Number(b.amount) || 0))
      + (vrec
        ? '<button type="button" class="v2row" data-act="stOpenVendor" data-vendor="' + esc(vrec.id) + '">'
          + '<span class="lead">' + draw('person', 20) + '</span>'
          + '<div class="txt"><div class="t">' + esc(String(vrec.name || vrec.id)) + '</div></div></button>'
        : '<p class="st-sub">' + esc(say('stNoVendor')) + '</p>')
      + locked + mark + '</div>';
  }

  /* One line of a piece's life. Send-out and return entries are the outside
   * repair's: they name their pass, and they are the only two that can carry a
   * vendor's money.
   *
   * THE MONEY. A reader without `outsideJob` gets an EMPTY .act on those two,
   * not a dash: a dash means "unknown" and this is "not for you". With a pass
   * the money is on the gatepasses record (contract 4.3) and the entry has
   * none to draw, so both readers see the same row and neither a zero. Only a
   * legacy entry carries cost itself, and only that is withheld. Whether store
   * and crewmanager may re-read a bill later is the owner's open question
   * (UI 17.2); this denies until he says. `h.id` is never read: entries from
   * before passes have none. */
  function shortDate(ms) {
    if (ms == null) return '';
    var d = new Date(Number(ms));
    if (isNaN(d.getTime())) return '';
    try { return d.toLocaleDateString(locale(), { day: 'numeric', month: 'short' }); }
    catch (e) { return String(ms); }
  }

  function histRow(e, HIST, passes, money, stillOut) {
    e = e || {};
    var outside = e.type === 'send-out' || e.type === 'return';
    var pass = outside && e.passId ? byId(passes, e.passId) : null;
    var title = (HIST[e.type] ? say(HIST[e.type]) : String(e.type || ''))
      + ' · ' + (outside ? shortDate(e.at) : dateName(e.at));
    var sub = String(e.note || e.vendor || ''), act = '', wrap = false, days;
    if (e.type === 'send-out' && pass) {
      sub = say('stHistSendPass', { vendor: pass.vendorName || e.vendor || '', no: pass.no || '' });
      days = stillOut && pass.status !== 'returned' && root.Outside ? root.Outside.daysOut(pass, Date.now()) : null;
      if (days != null) act = fig(Math.round(days), { unit: 'd' });
    } else if (e.type === 'return' && pass && String(pass.unitSerial || '') !== '') {
      wrap = true;
      sub = pass.serialMismatch === true
        ? say('stHistSerialBad', { a: pass.unitSerial, b: pass.returnSerial || '' })
        : say('stHistSerialOk');
    } else if (e.type === 'return') {
      wrap = !!pass;
    }
    if (!outside) {
      act = fig(isNum(Number(e.cost)) && Number(e.cost) > 0 ? Number(e.cost) : null, { format: rupees });
    } else if (money && !pass && isNum(Number(e.cost)) && Number(e.cost) > 0) {
      act = fig(Number(e.cost), { format: rupees });
    }
    return '<div class="v2row' + (wrap ? ' v2row-why' : '') + '"><span class="lead">' + draw('clock', 20) + '</span>'
      + '<div class="txt"><div class="t">' + esc(title) + '</div>'
      + '<div class="sub">' + esc(sub) + '</div></div>'
      + '<div class="act">' + act + '</div></div>';
  }

  function pieceSheet(m, id) {
    var c = byId(rowsOf(m, 'components'), id);
    if (!c) return '';
    var buses = rowsOf(m, 'buses'), now = Date.now();
    var wn = pieceWarranty(c, now);
    var out = '<div class="st-sheet">'
      + '<p class="st-step-h">' + esc(String(c.label || c.id) + ' · '
        + (c.serial ? String(c.serial) : say('stNoSerial'))) + '</p>'
      + '<p class="st-warranty' + (wn.kind === 'in' ? ' st-ok' : '') + '">'
      + draw(wn.kind === 'in' ? 'ok' : (wn.kind === 'ended' ? 'clock' : 'warn'), 14) + ' '
      + esc(warrantyWords(wn)) + '</p>'
      + drow('stStateL', PIECE_STATE[c.state] ? say(PIECE_STATE[c.state]) : String(c.state || ''))
      + (c.busId ? drow('stOnBus', regOf(buses, c.busId)) : '')
      + (c.position ? '' : '<p class="st-warn">' + esc(say('stNoPosition')) + '</p>');
    if (isNum(Number(c.maxRefurb)) && Number(c.maxRefurb) > 0) {
      out += '<p class="st-sub">' + esc(say('stRefurbN', { v: group(Number(c.refurbCount) || 0),
                                                           m: group(Number(c.maxRefurb)) })) + '</p>';
    }
    /* Life used is the bus's odometer now, less the odometer it was fitted at.
     * It is the DASH when either reading is missing (§3.5): an unknown
     * odometer is not a zero, and "0 km used" on a tyre that has run for a
     * year is the lie this whole file is written against. */
    var bus = c.busId ? byId(buses, c.busId) : null;
    var fitted = Number(c.installedOdo);
    var nowOdo = bus ? Number(bus.odometer) : NaN;
    var used = (isNum(fitted) && fitted > 0 && isNum(nowOdo) && nowOdo >= fitted) ? nowOdo - fitted : null;
    var lifeKm = Number(c.lifeKm);
    out += '<div class="st-trust-v"><span class="st-owed-l">' + esc(say('stLifeUsed')) + '</span>'
      + fig(used, { unit: 'km', format: group })
      + (isNum(lifeKm) && lifeKm > 0
        ? '<span class="st-owed-n">' + esc(say('stLifeOf', { v: group(lifeKm) })) + '</span>' : '')
      + '</div>';
    var HIST = { install: 'stHistInstall', remove: 'stHistRemove', 'send-out': 'stHistSendOut',
                 'return': 'stHistReturn', scrap: 'stHistScrap' };
    var h = arr(c.history), passes = rowsOf(m, 'gatepasses'), money = can(m.role, 'outsideJob');
    var lastOut = -1, i;
    for (i = 0; i < h.length; i++) if (h[i] && h[i].type === 'send-out') lastOut = i;
    if (h.length) out += '<p class="st-step-h">' + esc(say('stPieceLife')) + '</p>';
    for (i = h.length - 1; i >= 0; i--) {
      out += histRow(h[i], HIST, passes, money, c.state === 'sent-out' && i === lastOut);
    }
    return out + '</div>';
  }

  /* ---------------------------------------------------------------------- *
   * ONE delegated listener
   *
   * The first thing it does is return on a form control, BEFORE it reads any
   * data attribute. That is the line the shelf-count regression was missing:
   * the field sat in a pressable row, the row's handler took the tap, and the
   * storekeeper was thrown off the screen mid-count.
   * ---------------------------------------------------------------------- */

  var bound = false;

  function mount() {
    /* The read is the first statement, above the listener guard. See `duty.js`'s
     * mount: it runs on each entry either way because `unmount()` clears the
     * guard, and the position is what keeps it from depending on that. */
    load();
    var d = doc();
    if (!d || typeof d.addEventListener !== 'function') return false;
    if (bound) return true;
    bound = true;
    d.addEventListener('click', onClick);
    d.addEventListener('input', onField);
    d.addEventListener('change', onField);
    d.addEventListener('scroll', onScroll, true);
    return true;
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
    var d = doc();
    if (bound && d && typeof d.removeEventListener === 'function') {
      d.removeEventListener('click', onClick);
      d.removeEventListener('input', onField);
      d.removeEventListener('change', onField);
      /* `true` AGAIN. The scroll listener was registered in the CAPTURE phase,
       * and a removal that leaves the third argument off is matching a
       * different listener: it removes nothing and reports nothing. */
      d.removeEventListener('scroll', onScroll, true);
    }
    bound = false;
    return true;
  }

  function onClick(ev) {
    var t = ev && ev.target;
    if (!t || typeof t.closest !== 'function') return;

    // THE EARLY RETURN. Nothing above this line reads an attribute.
    if (t.closest(FIELDS)) return;

    var el = t.closest('[data-tab]');
    if (el) {
      if (ev.preventDefault) ev.preventDefault();
      setTab(state().role, el.getAttribute('data-tab'));
      return redraw();
    }
    el = t.closest('[data-open-part]');
    if (el) {
      if (ev.preventDefault) ev.preventDefault();
      return openPart(el.getAttribute('data-open-part'));
    }
    el = t.closest('[data-open-piece]');
    if (el) {
      if (ev.preventDefault) ev.preventDefault();
      return openSheetFor(pieceSheet(state(), el.getAttribute('data-open-piece')), say('stTabPieces'));
    }
    el = t.closest('[data-act]');
    if (!el) return;
    if (ev.preventDefault) ev.preventDefault();
    return act(el.getAttribute('data-act'), el);
  }

  function act(what, el) {
    if (what === 'stIssue') return openIssue(null);
    if (what === 'stIssuePart') return openIssue({ partId: el.getAttribute('data-part') });
    if (what === 'stReceive') return openReceive();
    if (what === 'stFilterSheet') return openSheetFor(filterSheet(lastView || { catFilter: catFilter }), say('stFilter'));
    if (what === 'stSetFilter' || what === 'stSetNoLevel') {
      var f = what === 'stSetNoLevel' ? 'nolevel' : el.getAttribute('data-filter');
      if (CAT_FILTERS.indexOf(String(f)) >= 0) { catFilter = String(f); first = 0; }
      closeSheet();
      return redraw();
    }
    if (what === 'stPickCard') { if (issue) { issue.cardId = el.getAttribute('data-card'); } return repaintIssue(); }
    if (what === 'stClearCard') { if (issue) { issue.cardId = null; issue.fromRoute = false; } return repaintIssue(); }
    if (what === 'stPickPart') { if (issue) { issue.partId = el.getAttribute('data-part'); } return repaintIssue(); }
    if (what === 'stClearPart') { if (issue) { issue.partId = null; } return repaintIssue(); }
    if (what === 'stIssueSave') return saveIssue(el);
    if (what === 'stFulfil') return openFulfil(el.getAttribute('data-req'));
    if (what === 'stStartCount') return openSheetFor(countSheet(state()), say('stStartCount'));
    if (what === 'stCountBegin') return beginCount();
    if (what === 'stSaveCount') return saveCount(el);
    if (what === 'stOpenBill') return openSheetFor(billSheet(state(), el.getAttribute('data-bill')), say('stTabBills'));
    if (what === 'stOpenVendor') { openVendor = el.getAttribute('data-vendor'); closeSheet(); return redraw(); }
    if (what === 'stMarkPaid') return markPaid(el);
    if (what === 'stReadBill') return readBill();
    if (what === 'stHandBill') return handBill();
    if (what === 'stReceiveSave') return saveReceive(el);
  }

  /* The field handler. It writes to local state and NEVER moves the route — a
   * count field that navigated away is the regression this screen is named
   * for, and the search box is typed into with a mechanic waiting. */
  function onField(ev) {
    var t = ev && ev.target;
    if (!t || typeof t.getAttribute !== 'function') return;
    var count = t.getAttribute('data-count');
    if (count != null) {
      if (session) session.typed[count] = String(t.value == null ? '' : t.value);
      return;                                   // no redraw: the caret stays where it is
    }
    var f = t.getAttribute('data-field');
    if (f === 'stSearch') { query = String(t.value == null ? '' : t.value); first = 0; return redraw(); }
    if (f === 'stIssueSearch') { if (issue) issue.search = String(t.value || ''); return repaintIssue(); }
    if (f === 'stIssueQty') { if (issue) issue.qty = String(t.value || ''); return repaintIssue(); }
    if (f === 'stIssueReused') { if (issue) issue.reused = !!t.checked; return repaintIssue(); }
    if (f === 'stCountMode' && session) { session.mode = t.value === 'full' ? 'full' : 'blind'; return; }
    if (receive && receive.draft) {
      if (f === 'stBillSupplier') receive.draft.supplier = String(t.value || '');
      if (f === 'stBillNo') receive.draft.billNo = String(t.value || '');
      if (f === 'stBillAmount') receive.draft.total = String(t.value || '');
    }
  }

  /* The window follows the scroll, and the only thing it reads is the
   * container's scrollTop. No row is measured: the row height is the density
   * token's own number. */
  function onScroll(ev) {
    var el = ev && ev.target;
    if (!el || !el.getAttribute || el.getAttribute('data-cat-scroll') === null) return;
    if (!lastView || lastView.kind !== 'ready' || lastView.tab !== 'catalogue') return;
    var h = ROW_PX[lastView.density] || ROW_PX.yard;
    var want = firstFor(lastView.cat.total, el.scrollTop, h);
    if (want === first) return;
    first = want;
    var m = state();
    var v = model(m);
    lastView = v;
    // One string, one insert, and only the list: redrawing the whole screen
    // would rebuild the header and throw the scroll position away.
    el.innerHTML = windowHtml(v);
  }

  /* ---------------------------------------------------------------------- *
   * the writes
   * ---------------------------------------------------------------------- */

  function state() {
    var s = root.S || {};
    var b = root.Boot;
    return {
      route: ID, params: routeParams(), role: s.user ? String(s.user.role) : null,
      user: s.user || null, cache: s.cache || {},
      density: b && typeof b.density === 'function' ? b.density() : 'yard',
      offline: offlineNow(), stale: false
    };
  }

  function routeParams() {
    var r = root.Router;
    var c = r && typeof r.current === 'function' ? r.current() : null;
    return c && c.id === ID ? (c.params || null) : null;
  }

  function offlineNow() {
    var n = root.navigator;
    if (n && n.onLine === false) return true;
    var s = root.Sync;
    if (!s || typeof s.info !== 'function') return false;
    try { return s.info().status === 'offline'; } catch (e) { return false; }
  }

  /* THE PROMISE IS NOT DISCARDED ANY MORE, and that one `.then` is REV-FLOW F8.
   *
   * This fired `Cache.load(STORES)` and threw the promise away, so the screen
   * only caught up on `boot.js`'s next four-second sync tick. Instrumented in a
   * real browser with seven parts on disk, the first content paint was:
   *
   *     251 ms  "Store … 0 parts … Loading"
   *    1254 ms  "Store … 0 parts … Loading"
   *    2265 ms  "Store … 0 parts … Loading"
   *    3270 ms  "Store … 7 parts … Brake Pad Set (front) 12 set …"
   *
   * Three and a bit seconds of skeleton, every visit, on a Mac — one tick or
   * two more on a Core 2 Duo. `fuel.js:1322` and `attention.js:1035` both
   * already redraw on their read landing; this screen was the one that did not.
   *
   * `loading` keeps a mount that arrives while a read is settling from stacking
   * a second one over the top of the first. */
  var loading = false;

  function load() {
    var c = root.Cache;
    if (loading || !c || typeof c.load !== 'function') return null;
    loading = true;
    return c.load(STORES).then(function () { loading = false; reread(); },
                               function () { loading = false; });
  }

  /* Only while this is still the screen on the page: a read that settles after
   * the storekeeper has walked to another tab must not mount this one over
   * theirs. `redraw()` itself has no such test because every other caller of it
   * is a tap on this screen. */
  function reread() {
    var R = root.Router;
    var c = R && R.current ? R.current() : null;
    if (!c || c.id !== ID) return;
    redraw();
  }

  function redraw() {
    var sh = root.Shell;
    if (sh && typeof sh.mount === 'function') sh.mount(ID, routeParams());
  }

  function openSheetFor(html, title) {
    if (!html || !root.V2 || typeof root.V2.openSheet !== 'function') return null;
    return root.V2.openSheet(title, html);
  }

  function closeSheet() {
    if (root.V2 && typeof root.V2.closeSheet === 'function') root.V2.closeSheet();
  }

  function toast(text, kind) {
    if (root.V2 && typeof root.V2.toast === 'function') root.V2.toast(text, { kind: kind });
  }

  function openPart(id) {
    return openSheetFor(partSheet(state(), id), say('stTabCatalogue'));
  }

  /* Opening the sheet. The card comes from the ROUTE when the route named one
   * and from nowhere else; `partId` here comes from a row the person pressed. */
  function openIssue(seed) {
    var m = state();
    if (!can(m.role, 'issuePart')) return null;
    var fromRoute = cardFromRoute(m.params, rowsOf(m, 'jobcards'));
    issue = {
      cardId: fromRoute ? fromRoute.id : null, fromRoute: !!fromRoute,
      partId: (seed && seed.partId) || null, search: '', qty: '', reused: false, working: false
    };
    return openSheetFor(issueSheet(m), say('stIssueTitle'));
  }

  /* A waiting request: the card AND the part come from the request, because the
   * mechanic named both. The quantity is still typed. */
  function openFulfil(reqId) {
    var m = state();
    if (!can(m.role, 'issuePart')) return null;
    var v = model(m), i, r = null;
    for (i = 0; i < v.requests.rows.length; i++) if (v.requests.rows[i].id === reqId) r = v.requests.rows[i];
    if (!r) return null;
    issue = { cardId: r.cardId, fromRoute: false, partId: r.partId, search: '',
              qty: '', reused: false, working: false, reqId: r.id };
    return openSheetFor(issueSheet(m), say('stIssueTitle'));
  }

  function repaintIssue() {
    var m = state();
    var d = doc();
    var body = d && d.querySelector ? d.querySelector('dialog.ov-sheet .ov-body') : null;
    if (body) { body.innerHTML = issueSheet(m); return body; }
    return openSheetFor(issueSheet(m), say('stIssueTitle'));
  }

  /* THE THREE WRITES, in this order and no other (v2-ux.md §3.1 step 5,
   * d738a6e): the ledger row first, then the book, then the card's line.
   * Anything can stop the app between them. In this order an interruption
   * leaves an issue nobody has matched to a card yet, which reconcileJobParts()
   * finishes; the other way round it leaves stock short with nothing to say
   * where the part went, which reads as pilferage.
   *
   * AN ISSUE IS NEVER BLOCKED BY THE BOOK. If it takes qty below zero it still
   * saves and the toast says so: the part has physically left the shelf, and
   * refusing the write would mean it leaves with no ledger row at all. A
   * negative book is a visible problem; an unrecorded issue is an invisible
   * one.
   */
  function issueWrites(part, card, qty, reused, who, now) {
    var unit = reused ? 0 : (Number(part.unitCost) || 0);
    var cost = qty * unit;
    var ledger = {
      id: 'l-' + now.toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36),
      partId: part.id, type: 'out', qty: qty, jobId: card.id,
      reason: recordValue(reused ? 'stRecIssuedReused' : 'stRecIssued'),
      reused: !!reused, unitCost: unit, by: who && who.id ? who.id : null, at: now
    };
    var book = Number(part.qty) || 0;
    var nextPart = {};
    var k;
    for (k in part) if (Object.prototype.hasOwnProperty.call(part, k)) nextPart[k] = part[k];
    nextPart.qty = book - qty;
    nextPart.updatedAt = now;

    var nextCard = {};
    for (k in card) if (Object.prototype.hasOwnProperty.call(card, k)) nextCard[k] = card[k];
    var lines = [], i, found = false;
    for (i = 0; i < arr(card.partsUsed).length; i++) {
      var l = card.partsUsed[i], copy = {};
      for (k in l) if (Object.prototype.hasOwnProperty.call(l, k)) copy[k] = l[k];
      if (String(copy.partId) === String(part.id) && !!copy.reused === !!reused) {
        copy.qty = (Number(copy.qty) || 0) + qty;
        copy.cost = (Number(copy.cost) || 0) + cost;
        found = true;
      }
      lines.push(copy);
    }
    if (!found) lines.push({ partId: part.id, qty: qty, cost: cost, reused: !!reused });
    nextCard.partsUsed = lines;
    nextCard.updatedAt = now;
    if (issue && issue.reqId) {
      var reqs = [], j;
      for (j = 0; j < arr(card.partRequests).length; j++) {
        var r = card.partRequests[j], rc = {};
        for (k in r) if (Object.prototype.hasOwnProperty.call(r, k)) rc[k] = r[k];
        if (String(rc.id) === String(issue.reqId)) {
          rc.status = 'fulfilled';
          rc.fulfilledBy = who && who.id ? who.id : null;
          rc.fulfilledAt = now;
        }
        reqs.push(rc);
      }
      nextCard.partRequests = reqs;
    }
    return { ledger: ledger, part: nextPart, card: nextCard, book: nextPart.qty };
  }

  async function saveIssue(el) {
    if (el && el.getAttribute('aria-disabled') === 'true') return;
    var m = state();
    var cards = rowsOf(m, 'jobcards'), parts = rowsOf(m, 'parts');
    var ready = issueReady(cards, parts);
    if (!ready.ok || !root.DB) return;
    var part = byId(parts, issue.partId), card = byId(cards, issue.cardId);
    issue.working = true;
    if (el && 'textContent' in el) el.textContent = say('stIssuing');
    var w = issueWrites(part, card, ready.qty, issue.reused, m.user, Date.now());
    try {
      await root.DB.put('ledger', w.ledger);
      await root.DB.put('parts', w.part);
      await root.DB.put('jobcards', w.card);
    } catch (e) {
      issue.working = false;
      toast(say('stIssueFailed'), 'bad');
      return repaintIssue();
    }
    issue = null;
    closeSheet();
    toast(w.book < 0 ? say('stIssuedNeg', { v: group(w.book) }) : say('stIssued', { v: group(w.book) }),
          w.book < 0 ? 'warn' : 'ok');
    load();
    redraw();
  }

  function beginCount() {
    var d = doc();
    var form = d && d.querySelector ? d.querySelector('[data-sheet="count"]') : null;
    var mode = 'blind', scope = { kind: 'all', value: '' };
    if (form && form.querySelector) {
      var ms = form.querySelector('[data-field="stCountMode"]');
      var sc = form.querySelector('[data-field="stCountScope"]');
      if (ms && ms.value === 'full') mode = 'full';
      if (sc && sc.value) {
        scope = sc.value === 'search' ? { kind: 'search', value: query } : { kind: 'category', value: sc.value };
      }
    }
    session = { mode: mode, scope: scope, typed: {}, saving: false };
    closeSheet();
    redraw();
  }

  /* Saving a count writes audits FIRST, then the corrected parts, then one
   * append-only ledger row per correction. The audit row first, because an
   * interruption must leave a record of the count rather than silently
   * corrected stock with nothing to explain it — the same ordering argument as
   * the part issue, applied here. */
  function countWrites(s, parts, who, now) {
    var lines = [], updates = [], moves = [], i;
    var rows = sessionRows(s, parts, {});
    for (i = 0; i < rows.length; i++) {
      var typed = String(rows[i].typed);
      if (typed === '') continue;                 // a line nobody counted is not a line
      var n = Number(typed);
      if (!isNum(n) || n < 0) continue;
      var counted = Math.round(n);
      var p = byId(parts, rows[i].id);
      if (!p) continue;
      var book = Number(p.qty) || 0;
      var variance = counted - book;
      var value = Math.abs(variance) * (Number(p.unitCost) || 0);
      lines.push({ partId: p.id, system: book, counted: counted, variance: variance,
                   value: variance < 0 ? value : 0 });
      if (variance === 0) continue;
      var next = {}, k;
      for (k in p) if (Object.prototype.hasOwnProperty.call(p, k)) next[k] = p[k];
      next.qty = counted;
      next.updatedAt = now;
      updates.push(next);
      moves.push({
        id: 'l-' + now.toString(36) + '-' + i.toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36),
        partId: p.id, type: variance < 0 ? 'out' : 'in', qty: Math.abs(variance), jobId: null,
        reason: recordValue(variance < 0 ? 'stRecShortfall' : 'stRecSurplus'),
        by: who && who.id ? who.id : null, at: now
      });
    }
    /* Short and found are two numbers, never one net figure: a shelf that is
     * six short of one part and six over on another has not balanced, and a
     * net zero would hide the only thing worth looking at. `value` on a line
     * is the shortfall only, which is v1's shape (app.js:4621) and the shape
     * the owner's Attention row reads. */
    var shrink = 0, found = 0;
    for (i = 0; i < lines.length; i++) {
      var p2 = byId(parts, lines[i].partId);
      var each = Number(p2 && p2.unitCost) || 0;
      if (lines[i].variance < 0) shrink += Math.abs(lines[i].variance) * each;
      else if (lines[i].variance > 0) found += lines[i].variance * each;
    }
    return {
      audit: {
        id: 'au-' + now.toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36),
        at: now, by: who && who.id ? who.id : null, mode: s.mode, lines: lines,
        shrinkValue: shrink, foundValue: found
      },
      parts: updates, ledger: moves, corrected: updates.length
    };
  }

  async function saveCount(el) {
    if (el && el.getAttribute('aria-disabled') === 'true') return;
    if (!session || !root.DB) return;
    var m = state();
    var w = countWrites(session, rowsOf(m, 'parts'), m.user, Date.now());
    if (!w.audit.lines.length) return;
    var ok = root.V2 && typeof root.V2.confirmDialog === 'function'
      ? await root.V2.confirmDialog(say('stCountConfirm', { v: group(w.corrected) }))
      : true;
    if (!ok) return;
    session.saving = true;
    redraw();
    try {
      await root.DB.put('audits', w.audit);
      for (var i = 0; i < w.parts.length; i++) await root.DB.put('parts', w.parts[i]);
      for (var j = 0; j < w.ledger.length; j++) await root.DB.put('ledger', w.ledger[j]);
    } catch (e) {
      // A typed count is never thrown away by a failure: the fields keep their
      // values and the message says what happened.
      session.saving = false;
      toast(say('stCountFailed'), 'warn');
      return redraw();
    }
    session = null;
    toast(say('stCountSaved', { v: group(w.corrected) }), 'ok');
    load();
    redraw();
  }

  async function markPaid(el) {
    var id = el && el.getAttribute('data-bill');
    var m = state();
    if (!can(m.role, 'bills') || !id || !root.DB) return;
    var b = byId(rowsOf(m, 'purchases'), id);
    if (!b) return;
    var now = Date.now(), next = {}, k;
    for (k in b) if (Object.prototype.hasOwnProperty.call(b, k)) next[k] = b[k];
    // The only three fields a non-manager may change after entry (02 §4.4).
    next.paymentStatus = 'paid';
    next.paidAt = now;
    next.paidBy = m.user && m.user.id ? m.user.id : null;
    next.updatedAt = now;
    if (el && 'textContent' in el) el.textContent = say('stSaving');
    try { await root.DB.put('purchases', next); } catch (e) { return; }
    closeSheet();
    load();
    redraw();
  }

  function openReceive() {
    var m = state();
    if (!can(m.role, 'receiveStock')) return null;
    receive = { photos: [], draft: null, reading: false, working: false };
    return openSheetFor(receiveSheet(m), say('stReceiveTitle'));
  }

  function repaintReceive() {
    var d = doc();
    var body = d && d.querySelector ? d.querySelector('dialog.ov-sheet .ov-body') : null;
    if (body) { body.innerHTML = receiveSheet(state()); return body; }
    return openSheetFor(receiveSheet(state()), say('stReceiveTitle'));
  }

  /* THE READING IS NOT THIS SCREEN'S TO MAKE, AND THAT IS REPORTED.
   *
   * `/ai/bill` is open to `store` on the server (04 §1 row 35, c896478), but
   * every call to the server in v2 goes through `v2/sync.js`, which holds the
   * token and the base URL — and it has no `bill()` today, the way it has
   * `ai()` and `challans()`. A screen that opened its own connection would
   * carry an auth header in a drawing file, which is a second place the token
   * lives. So: when `Sync.bill` exists this uses it, and until it does the
   * reading control is ABSENT and the bill is entered by hand. The bill still
   * becomes a record, which is the operational half; the reading is the half
   * that needs one function in a file this slice does not own.
   */
  function canRead() {
    var s = root.Sync;
    return !offlineNow() && !!(s && typeof s.bill === 'function');
  }

  async function readBill() {
    if (!receive || receive.reading) return;
    if (offlineNow()) { toast(say('stReceiveOffline'), 'warn'); return; }
    if (!canRead()) return handBill();
    receive.reading = true;
    repaintReceive();
    var out = null;
    try { out = await root.Sync.bill(receive.photos); } catch (e) { out = null; }
    receive.reading = false;
    // Nothing is saved as read without the storekeeper confirming it, so the
    // answer is a DRAFT and every field of it is editable.
    receive.draft = out && typeof out === 'object'
      ? { supplier: out.supplier || '', billNo: out.billNo || '', total: out.total == null ? '' : out.total,
          gstin: out.gstin || '', lines: arr(out.lines), model: out.model || '' }
      : null;
    if (!receive.draft) toast(say('stBillNotRead'), 'bad');
    repaintReceive();
  }

  /* A blank draft, every field of it editable and nothing claimed as read. The
   * same confirmation and the same writes follow, so a hand-entered bill is a
   * bill and not a lesser record. */
  function handBill() {
    if (!receive) return;
    receive.draft = { supplier: '', billNo: '', total: '', gstin: '', lines: [], model: '' };
    repaintReceive();
  }

  /* Writes, in order: vendors (only when the supplier is new), purchases, then
   * per matched line parts (qty up, unitCost re-averaged) and ledger. Stock
   * moving as an invisible side effect of photographing a paper is precisely
   * how a count drifts, so the sheet says what it will add before this runs. */
  function receiveWrites(draft, parts, vendors, who, now) {
    var supplier = String(draft.supplier || '');
    var vendor = null, i;
    for (i = 0; i < vendors.length; i++) {
      if (String(vendors[i].name || '') === supplier) { vendor = vendors[i]; break; }
    }
    var newVendor = null;
    if (!vendor && supplier) {
      // Vendor ids are stable by design, so an existing supplier is matched and
      // never duplicated (03 §9 trap 25).
      newVendor = { id: 'vend-' + now.toString(36), name: supplier, category: '', isRepairVendor: false,
                    phone: '', email: '', gstin: String(draft.gstin || ''), city: '', notes: '', createdAt: now };
      vendor = newVendor;
    }
    var lines = [], updates = [], moves = [], unmatched = 0;
    for (i = 0; i < arr(draft.lines).length; i++) {
      var l = draft.lines[i];
      var p = l && l.partId ? byId(parts, l.partId) : null;
      if (!p) { unmatched++; continue; }
      var qty = Math.round(Number(l.qty) || 0);
      if (qty <= 0) continue;
      var rate = Number(l.rate) || 0;
      lines.push({ partId: p.id, qty: qty, rate: rate });
      var have = Number(p.qty) || 0, cost = Number(p.unitCost) || 0;
      var next = {}, k;
      for (k in p) if (Object.prototype.hasOwnProperty.call(p, k)) next[k] = p[k];
      next.qty = have + qty;
      // Weighted average, so a bill at a new price does not rewrite history.
      next.unitCost = next.qty > 0 ? Math.round((have * cost + qty * rate) / next.qty) : cost;
      next.updatedAt = now;
      updates.push(next);
      moves.push({
        id: 'l-' + now.toString(36) + '-' + i.toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36),
        partId: p.id, type: 'in', qty: qty, jobId: null,
        reason: recordValue('stRecPurchase', { supplier: supplier }),
        by: who && who.id ? who.id : null, at: now
      });
    }
    var purchase = {
      id: 'pur-' + now.toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36),
      supplier: supplier, vendorId: vendor ? vendor.id : null,
      billNo: String(draft.billNo || ''), billPhoto: '',
      amount: Number(draft.total) || 0, items: unmatchedText(draft, parts),
      lines: lines, readByAi: { lines: arr(draft.lines), total: draft.total, model: String(draft.model || '') },
      paymentStatus: 'pending', paidAt: null, paidBy: null, at: now, by: who && who.id ? who.id : null
    };
    return { vendor: newVendor, purchase: purchase, parts: updates, ledger: moves, unmatched: unmatched };
  }

  // A line the reader could not match stays in the bill's own `items` text, so
  // the bill still says what arrived even though the book cannot.
  function unmatchedText(draft, parts) {
    var out = [], i;
    for (i = 0; i < arr(draft.lines).length; i++) {
      var l = draft.lines[i];
      if (l && l.partId && byId(parts, l.partId)) continue;
      out.push(String((l && l.text) || ''));
    }
    return out.join(' · ');
  }

  async function saveReceive(el) {
    if (el && el.getAttribute('aria-disabled') === 'true') return;
    if (!receive || !receive.draft || !root.DB) return;
    var m = state();
    if (!can(m.role, 'receiveStock')) return;
    receive.working = true;
    if (el && 'textContent' in el) el.textContent = say('stSaving');
    var w = receiveWrites(receive.draft, rowsOf(m, 'parts'), rowsOf(m, 'vendors'), m.user, Date.now());
    try {
      if (w.vendor) await root.DB.put('vendors', w.vendor);
      await root.DB.put('purchases', w.purchase);
      for (var i = 0; i < w.parts.length; i++) await root.DB.put('parts', w.parts[i]);
      for (var j = 0; j < w.ledger.length; j++) await root.DB.put('ledger', w.ledger[j]);
    } catch (e) {
      receive.working = false;
      toast(say('stIssueFailed'), 'bad');
      return repaintReceive();
    }
    receive = null;
    closeSheet();
    load();
    redraw();
  }

  function reload() { load(); redraw(); }

  /* ---------------------------------------------------------------------- */

  register();

  var api = {
    render: render, model: model, mount: mount, unmount: unmount,
    low: low, isLow: isLow, matches: matches, stockState: stockState,
    firstFor: firstFor, winRange: winRange, span: SPAN,
    cardFromRoute: cardFromRoute, issueSheet: issueSheet, issueWrites: issueWrites,
    countSheet: countSheet, countWrites: countWrites, receiveSheet: receiveSheet, partSheet: partSheet,
    receiveWrites: receiveWrites, billSheet: billSheet, pieceSheet: pieceSheet,
    filterSheet: filterSheet, trust: trust, warranty: pieceWarranty, vendorUnpaid: vendorUnpaid,
    tab: function (role, id) { return setTab(role, id); },
    search: function (q) { query = q == null ? '' : String(q); first = 0; return query; },
    filter: function (f) { if (CAT_FILTERS.indexOf(String(f)) >= 0) { catFilter = String(f); first = 0; } return catFilter; },
    scrollTo: function (n) { first = Number(n) || 0; return first; },
    onClick: onClick, onField: onField, onScroll: onScroll,
    // Test seam only, the shape of Router._reset: a node suite cannot reload a
    // classic script per case.
    _reset: function () {
      bound = false; tab = 'catalogue'; query = ''; catFilter = 'all'; first = 0;
      openVendor = null; session = null; issue = null; receive = null; lastView = null;
    },
    _session: function (s) { if (s !== undefined) session = s; return session; },
    _issue: function (s) { if (s !== undefined) issue = s; return issue; },
    _receive: function (s) { if (s !== undefined) receive = s; return receive; }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.Store = api;
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

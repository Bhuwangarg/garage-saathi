/* Garage Saathi v2 — Attention (#2): one ranked list of what is wrong.
 *
 * It replaces five screens — `alerts`, `insights`, `pilferage`, `safety`,
 * `breakdowns` — that each answered "what is wrong?" from one angle, which is
 * five screens nobody opened. `screens-shell.md §3`.
 *
 * Three exports, and the first two are the whole slice:
 *
 *   Attention.index(rows, me) -> {rows, counts, unranked, stores, at}
 *   Attention.render(index, filter) -> string          (also render(model))
 *   Attention.stores(me) -> [store]                    what Cache.load is given
 *
 * THE FOUR THINGS THIS FILE IS ORGANISED AROUND
 *
 * 1. EVERY ROW KIND IS SCOPED ON ITS OWN, AND THE CAPABILITY IS CHECKED BEFORE
 *    THE QUERY RUNS. Not after, and never in the view. The failure this avoids
 *    is `dashboard` rebuilt: one capability over pilferage, money, safety and
 *    alert rows is the conflation the owner flagged, where one capability
 *    guarded eleven routes (§3.1 failure 1). So `KINDS` carries ten paths, not
 *    nine — "document expiring" is one mark over two capabilities, `fleet` for
 *    a bus paper and `manageDrivers` for a crew document, and they must never
 *    share a query. Merging them is the single easiest way to hand a crew
 *    member's licence to a role that may only see buses (`02 §6.2`).
 *
 *    The mechanism, rather than the promise: a kind's builder is handed a
 *    `read(name)` that THROWS for any store the kind did not declare, and the
 *    loop that calls it `continue`s on an unheld capability before the builder
 *    exists. So an unheld kind reads nothing, and cannot leak through a row, a
 *    filter count or the remainder line. `Attention.stores(me)` is the same
 *    union one layer down, so the unheld kind's store is never fetched from
 *    IndexedDB either.
 *
 * 2. TWO KINDS ALSO NEED IDENTITY, NOT JUST CAPABILITY. A reader must never see
 *    their own work in a queue of other people's work to judge.
 *      kind 2 (a second signature): `closedBy !== me.id`, for EVERY role
 *        including the owner. The server enforces it (`_guard_write`'s jobcards
 *        clause, "you closed this job — someone else must verify it"), so the
 *        client rule is "do not draw a refused action".
 *      kind 1 (a gate decision): `userId !== me.id` — "you ran this check —
 *        somebody else decides go or hold". A supervisor who ran twenty checks
 *        would otherwise see twenty rows whose only action the server refuses.
 *    Both are per-record rules and neither is a capability, which is why they
 *    are a field on the kind and not an entry in `Caps.PERMS`.
 *
 * 3. IT MUST NOT REINTRODUCE THE MEASURED PERFORMANCE BUG. The shape that cost
 *    this product its reputation is work proportional to the whole dataset done
 *    per item inside something that runs on every render: `gpsEventsForBus()`
 *    walked the whole GPS table per call and `driverScore()` called it once per
 *    driver — 4.4 million string rewrites to draw one list, 808 ms, paid on
 *    every render (`5195ce7`); `computeInsights()` was 386 ms per render.
 *    So: ONE index, built once per content signature, OUTSIDE any render; one
 *    `getAll()` per store per BUILD, never per row and never per render; a pure
 *    comparator that parses no date and touches no store; no `at` on any figure
 *    inside a row; one string and one `insertAdjacentHTML`; a 200-row cap with
 *    the remainder stated. `test_v2_attention.js` fails when any of those is
 *    undone.
 *
 * 4. NO COUNT THAT CAN NEVER REACH ZERO. `5eb8c6e` ("110 of 110 missing
 *    documents") and `ba274f6` ("67 buses need a driver" against 54 drivers)
 *    are why. A number that can never be zero teaches people to scroll past
 *    red, and then the genuine one hides among them. Every kind here is bounded
 *    by something that clears: a paper row needs a RECORDED expiry inside the
 *    window (a document nobody has entered is not a row), and kind 9 counts
 *    only buses somebody picked to run tonight.
 *
 * The ranking is §3.3's, exactly, and the ORDER OF THE BANDS is the spec
 * author's judgement rather than arithmetic — a gate hold against ninety
 * thousand rupees of unexplained stock is not a sum. Nothing is invented here.
 *
 * The desk layout is this screen's one exception to the one-line desk row: the
 * reason IS the content, so `v2row-why` keeps its wrapped reason at both
 * densities and the list is capped rather than windowed (§3.4, `v2-foundation-
 * ui.md §2.4`). That design rests on the 200-row reading, which is a PLACEHOLDER
 * set on a developer's Mac (`DECISIONS.md §9`) — said out loud in this slice's
 * report, as §5 of the cut requires.
 */
(function (root) {
  'use strict';

  const ID = 'attention';

  /* The cap, and the mechanism rather than a preference. `v2row-why`'s reason
   * wraps, so its height is variable — about 72px in the yard, nearer 88px in
   * Hindi — and windowing needs a height it can compute without measuring a
   * row. Nothing here may measure a row, so the cap IS the answer and the list
   * ends with one line saying what is not shown. */
  const CAP = 200;

  const HOUR = 3600000;
  const DAY = 86400000;

  /* A paper is "expiring" inside this window. Before it, it is not a row:
   * thirty days is the span the crew bank already uses (`app.js:crewExpiring`)
   * and it is what makes this count able to reach zero. */
  const EXPIRY_DAYS = 30;

  /* Kind 6's window and threshold. The spec gives the SENTENCE ("11 issues with
   * no card in 30 days, against a team average of 2") and no threshold, so
   * these three are mine and are named in this slice's report.
   *
   * The average is over the person's PEERS and not over the whole team
   * including them: an outlier dominates an average they are inside, so
   * "eleven against a team average of two" is only ever true of the other
   * people's figure — which is also what v1's radar meant by its peer median
   * (`app.js:pilferageRadar`). A person is flagged at two or more issues with
   * no card AND at three times what their peers are doing, with the peers'
   * figure floored at one so a spotless team cannot make two issues look like
   * twenty. A fixed count would have flagged the whole store on a busy month,
   * which is a count that cannot reach zero wearing a threshold. */
  const PILFER_DAYS = 30;
  const PILFER_MIN = 2;
  const PILFER_OVER = 3;

  /* Kind 8's, on the same footing and for the same reason: three or more
   * breakdowns in thirty days AND above the fleet's own average. */
  const BREAK_DAYS = 30;
  const BREAK_MIN = 3;

  const EMPTY = [];

  /* Every dependency resolved at CALL time, never captured at load — the idiom
   * of `v2/router.js` and `v2/shell.js`, and what makes index.html's script
   * order a dependency order rather than a load-time coupling. */
  function caps() { return (typeof Caps !== 'undefined' && Caps) || (root && root.Caps) || null; }
  function router() { return (typeof Router !== 'undefined' && Router) || (root && root.Router) || null; }
  function shell() { return (typeof Shell !== 'undefined' && Shell) || (root && root.Shell) || null; }
  function cache() { return (typeof Cache !== 'undefined' && Cache) || (root && root.Cache) || null; }
  function night() { return (typeof Night !== 'undefined' && Night) || (root && root.Night) || null; }
  function sync() { return (typeof Sync !== 'undefined' && Sync) || (root && root.Sync) || null; }
  function state() { return (typeof S !== 'undefined' && S) || (root && root.S) || null; }
  function money() { return (typeof fmt !== 'undefined' && fmt) || (root && root.fmt) || null; }
  function doc() { return (root && root.document) || null; }

  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function mark(name, size) {
    return typeof root.icon === 'function' ? root.icon(name, { size: size || 16 }) : '';
  }

  /* ---------- words ------------------------------------------------------ *
   * §3.9's table, plus the row sentences §3.2 states in its own columns. The
   * Hindi is the owner's and is PENDING here on purpose (`hi: ''`): a builder
   * guessing it is how "No signal" becomes a sentence nobody can parse, and
   * test_v2_words.js counts and prints every pending id on every run.
   *
   * A sentence is one id with its slots, never a prefix glued to a value by the
   * caller: Hindi word order is not English word order, so "Expires in {0}" has
   * to be translatable whole. The dash joiner is an id for the same reason. */
  const TABLE = {
    attTitle: { en: 'Attention', hi: '' },
    // The four bands plus all, in the bands' own order.
    attAll: { en: 'All', hi: '' },
    attSafety: { en: 'Safety', hi: '' },
    attMoney: { en: 'Money', hi: '' },
    attPapers: { en: 'Papers', hi: '' },
    attWaiting: { en: 'Waiting', hi: '' },
    // The state the whole screen exists to be able to reach.
    attEmpty: { en: 'Nothing needs you', hi: '' },
    attEmptyHint: { en: 'Checked just now.', hi: '' },
    // Names the filter that was asked, so the person is not left wondering.
    attEmptyFilter: { en: 'Nothing under {0}.', hi: '' },
    attMore: { en: '{0} shown. {1} more. Use the filters above.', hi: '' },
    attUnranked: { en: 'Could not be ranked ({0})', hi: '' },
    attHeld: { en: 'Bus {0} held at the gate', hi: '' },
    attHeldWhy: { en: '{0} failed the {1} check. Nobody has decided.', hi: '' },
    attStanding: { en: { one: 'Standing {n} hour.', other: 'Standing {n} hours.' }, hi: '' },
    // Never the word "verified" on a card nobody has verified.
    attSecondSig: { en: 'Closed {0} by {1}, needs a second signature.', hi: '' },
    // Never "nobody has signed this off": under whole-record last-write-wins
    // two people signing one card is a conflict, so the copy only ever says
    // what has not happened HERE (§3.7, half-finished).
    attNotHere: { en: 'Not signed off here yet.', hi: '' },
    attExpired: { en: 'Expired {0} ago.', hi: '' },
    attExpires: { en: 'Expires in {0}.', hi: '' },
    attChallanN: { en: { one: '{n} unpaid challan', other: '{n} unpaid challans' }, hi: '' },
    attChallanWhy: { en: 'Oldest is from {0}. Checked {1} ago.', hi: '' },
    attChallanWhyOnly: { en: 'Checked {0} ago.', hi: '' },
    // One form on purpose: "6 missing" reads the same for one and for six, and
    // a table with two identical forms is a plural selector doing nothing.
    attStockN: { en: '{n} missing', hi: '' },
    attStockWhy: { en: 'The shelf count on {0} was {1} under the book. Nobody has explained it.', hi: '' },
    attPilfer: { en: 'parts off the book', hi: '' },
    attPilferWhy: { en: '{0} issues with no card in 30 days, against a team average of {1}.', hi: '' },
    attUnsafeWhy: { en: 'Reported {0} ago. No job card yet.', hi: '' },
    attBreakN: { en: { one: '{n} breakdown', other: '{n} breakdowns' }, hi: '' },
    attBreakWhy: { en: '{0} in 30 days, all {1}. The fleet average is {2}.', hi: '' },
    attNoDriver: { en: 'no driver', hi: '' },
    attNoConductor: { en: 'no conductor', hi: '' },
    attNoCrew: { en: 'no crew', hi: '' },
    attSeatWhy: { en: { one: 'Picked to run tonight. {n} seat still empty.',
                        other: 'Picked to run tonight. {n} seats still empty.' }, hi: '' },
    // "Bus 23 — fitness". One joiner, because every kind that names a thing and
    // the thing's problem uses it, and the order of the two halves is the
    // translator's to decide.
    attJoin: { en: '{0} — {1}', hi: '' },
    // The list states its freshness ONCE, here, and never per row: `at` inside
    // a row adds .figure-note as a block, triples the row height and runs the
    // age words two hundred times (foundation §2.3 rule 4).
    attFreshNow: { en: 'Updated just now', hi: '' },
    attFreshMin: { en: { one: 'Updated {n} minute ago', other: 'Updated {n} minutes ago' }, hi: '' },
    attFreshHr: { en: { one: 'Updated {n} hour ago', other: 'Updated {n} hours ago' }, hi: '' },
    attFreshDay: { en: { one: 'Updated {n} day ago', other: 'Updated {n} days ago' }, hi: '' },
    // An age INSIDE a sentence ("Expires in 9 days", "Reported 2 days ago"), so
    // it is its own id rather than the freshness line with its prefix cut off.
    attDays: { en: { one: '{n} day', other: '{n} days' }, hi: '' },
    attNoSignal: { en: 'No signal since {0}', hi: '' },
    /* A phone that has never sent anything has no "since". Before REV-FLOW F6,
     * `lastSyncAt` was seeded to 0 rather than null and the epoch rendered as a
     * time, so this read "No signal since 05:30" — a sentence that names a
     * moment that never happened. With the honest null, the one above would
     * have read "No signal since " with nothing after it, so there are two
     * words for the two facts. */
    attNoSignalEver: { en: 'This phone has not sent anything yet', hi: '' },
    attAskTitle: { en: 'Ask about the business', hi: '' },
    // A real question, so the person can see the shape of one.
    attAskPlaceholder: { en: 'What is costing us the most this month?', hi: '' },
    attAsk: { en: 'Ask', hi: '' },
    attAsking: { en: 'Asking...', hi: '' },
    // Price the thing before the person presses it: six sequential Opus calls.
    attAskSlow: { en: 'This takes up to a minute.', hi: '' },
    // Said BEFORE they fill it in, not after they press.
    attAskOffline: { en: 'Needs a connection. It will not send now.', hi: '' },
    attAskFailed: { en: 'The answer did not come back. Try again.', hi: '' },
    // Units. Short, and still a word somebody has to translate.
    attUnitH: { en: 'h', hi: '' },
    attUnitD: { en: 'd', hi: '' },
    attUnitSeats: { en: 'seats', hi: '' },
  };
  /* Registered at load when ui/words.js is already on the page, and on first
   * use when it is not — the idiom of `ui/states.js`, and for the same reason:
   * index.html's order is not this file's business, and the table has to live
   * in one place either way. */
  let registered = false;
  function words() {
    const W = (root && root.W) || null;
    if (!registered && W && typeof W.register === 'function') {
      W.register(TABLE);
      registered = true;
    }
    return W;
  }
  words();

  /* `w()` throws on an id nobody registered, by design. A screen is not the
   * frame — one throw here costs the body, not the app — but the body is the
   * whole screen, so the local table is the fallback for a document that loaded
   * this file without ui/words.js (a node suite loading it alone). */
  function plural(v, n) {
    if (v == null) return null;
    if (typeof v === 'string') return v;
    return (Math.abs(Number(n)) === 1 ? v.one : v.other) || null;
  }

  function say(id, n) {
    words();
    if (typeof root.w === 'function') {
      try { return root.w(id, n); } catch (e) { /* fall through to the local half */ }
    }
    const e = TABLE[id];
    const s = e ? plural(e.en, n) : null;
    return s === null ? '' : String(s).replace('{n}', String(n));
  }

  // "{0} — {1}" and friends. The slots are filled AFTER translation, so the
  // order of the halves is the translated sentence's and not this file's.
  function fill(id, args, n) {
    let s = say(id, n);
    for (let i = 0; i < args.length; i++) s = s.replace('{' + i + '}', String(args[i]));
    return s;
  }

  function join(a, b) { return fill('attJoin', [a, b]); }

  /* ---------- the ten capability paths ----------------------------------- *
   * Nine row kinds, TEN paths: kind 3 is one mark over two capabilities and two
   * privacy rules. Each `cap` is the narrowest capability in `02 §2` that
   * already guards the thing the row is about — none is new, and stage 1 left
   * these names unstated, so the ten are this document's decision and are
   * listed in its report.
   *
   * `stores` is a DECLARATION, enforced: the builder is handed a reader that
   * throws on any other name, and `Attention.stores(me)` is the union over held
   * kinds only. 3a and 3b therefore cannot share a query even by accident.
   *
   * `band` is §3.3's fixed integer and `basis` names the band's ONE basis, so
   * no cross-unit comparison exists anywhere on this screen.
   *   1 somebody is standing still or somebody is unsafe  — hours, descending
   *   2 money is leaving                                  — rupees, descending
   *   3 a clock ending in a fine or a stopped bus         — days, ascending
   *   4 work waiting on a person                          — hours, descending
   *
   * `identity` is the per-record rule, not a capability: `self` means the row
   * is dropped when the field named by `self` equals the reader's own id.
   */
  const KINDS = [
    { key: 'gateDecide', cap: 'gateDecide', band: 1, mark: 'gate', tone: 'crit',
      stores: ['gatechecks', 'buses'], identity: 'userId', build: gateRows },
    { key: 'unsafe', cap: 'fleet', band: 1, mark: 'warn', tone: 'crit',
      stores: ['driverreports', 'buses'], build: unsafeRows },
    { key: 'stock', cap: 'issuePart', band: 2, mark: 'count', tone: 'crit',
      stores: ['audits', 'parts', 'stockmoves'], build: stockRows },
    { key: 'pilferage', cap: 'insights', band: 2, mark: 'part', tone: 'crit',
      stores: ['ledger', 'users'], build: pilferRows },
    { key: 'challan', cap: 'challans', band: 2, mark: 'challan', tone: 'crit',
      stores: ['challans', 'buses'], build: challanRows },
    { key: 'busPaper', cap: 'fleet', band: 3, mark: 'doc', tone: 'warn',
      stores: ['buses'], build: busPaperRows },
    /* The other half of kind 3, and the reason the count is ten. A crew
     * document is `manageDrivers` and is permission-or-self (`02 §4.3`); it
     * leaked once already (`02 §6.2`). It shares a mark with the bus paper
     * above and shares no store, no reader and no query with it. */
    { key: 'crewPaper', cap: 'manageDrivers', band: 3, mark: 'doc', tone: 'warn',
      stores: ['drivers'], build: crewPaperRows },
    { key: 'verifyJob', cap: 'verifyJob', band: 4, mark: 'ok', tone: 'ok',
      stores: ['jobcards', 'buses', 'users'], identity: 'closedBy', build: verifyRows },
    { key: 'breakdown', cap: 'logIncident', band: 4, mark: 'bus', tone: 'warn',
      stores: ['breakdowns', 'buses'], build: breakdownRows },
    { key: 'seat', cap: 'assignDriver', band: 4, mark: 'seat', tone: 'warn',
      stores: ['nightlist', 'dutylog', 'buses'], build: seatRows },
  ];

  // The four bands, in the bands' own order, with the tab that selects each.
  const BANDS = [
    { filter: 'safety', band: 1, word: 'attSafety' },
    { filter: 'money', band: 2, word: 'attMoney' },
    { filter: 'papers', band: 3, word: 'attPapers' },
    { filter: 'waiting', band: 4, word: 'attWaiting' },
  ];

  function kindOf(key) {
    for (let i = 0; i < KINDS.length; i++) if (KINDS[i].key === key) return KINDS[i];
    return null;
  }

  /* THE check, and the whole of §3.6's second layer. It runs BEFORE the kind's
   * builder is reached, so an unheld kind never reads a store: it costs
   * nothing, contributes nothing to a filter count and cannot reach the
   * remainder line. */
  function holds(kind, me) {
    const c = caps();
    if (!c || typeof c.can !== 'function') return false;
    if (!me || !me.role) return false;
    return c.can(me.role, kind.cap);
  }

  /* The stores this reader's held kinds need, and nothing else. One layer below
   * the reader above: what is never asked for is never fetched from IndexedDB,
   * so `drivers` does not reach a device whose reader lacks `manageDrivers`. */
  function stores(me) {
    const out = [];
    for (let i = 0; i < KINDS.length; i++) {
      if (!holds(KINDS[i], me)) continue;
      const list = KINDS[i].stores;
      for (let j = 0; j < list.length; j++) if (out.indexOf(list[j]) === -1) out.push(list[j]);
    }
    return out.sort();
  }

  /* ---------- small readers over the rows passed in ----------------------- */

  function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }

  function live(arr) {
    const out = [];
    for (let i = 0; i < arr.length; i++) if (arr[i] && !arr[i]._deleted) out.push(arr[i]);
    return out;
  }

  function indexById(arr) {
    const m = Object.create(null);
    for (let i = 0; i < arr.length; i++) if (arr[i] && arr[i].id) m[arr[i].id] = arr[i];
    return m;
  }

  // A bus's own name, which is its registration: the yard calls a bus by its
  // plate, so there is no label to translate here.
  function busName(buses, id) {
    const b = buses[id];
    return (b && b.regNo) ? String(b.regNo) : String(id == null ? '' : id);
  }

  function personName(users, id) {
    const u = users[id];
    return (u && u.name) ? String(u.name) : String(id == null ? '' : id);
  }

  /* The same registration normalisation `app.js:normReg` uses, because the
   * `challans` store is keyed by it and a bus is keyed by its own id: without
   * one rule for both, a challan snapshot and the bus it is about never meet. */
  function normReg(s) {
    const n = String(s == null ? '' : s).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const m = /^([A-Z]{2})(\d{1,2})([A-Z]{1,3})(\d{1,4})$/.exec(n);
    return m ? m[1] + pad(m[2], 2) + m[3] + pad(m[4], 4) : n;
  }
  function pad(s, n) { let out = String(s); while (out.length < n) out = '0' + out; return out; }

  /* A date that may be a millisecond number OR a 'YYYY-MM-DD' string: the v2
   * seed writes the first and `seed-docs.js` writes the second, and a paper row
   * that silently dropped one of the two would be a count that reads zero for
   * the wrong reason. Parsed ONCE, at index time — never in the comparator. */
  function whenMs(v) {
    if (typeof v === 'number' && isFinite(v)) return v;
    if (typeof v !== 'string' || v === '') return null;
    const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(v) ? v + 'T00:00:00Z' : v);
    return isFinite(t) ? t : null;
  }

  function daysBetween(fromMs, toMs) { return Math.round((toMs - fromMs) / DAY); }

  /* ---------- the row shape ---------------------------------------------- *
   * `rank` is the band's own basis with its DIRECTION folded in, so the
   * comparator is three numeric comparisons and nothing else. Two rows are only
   * ever compared on `rank` when their bands are equal, because `band` is
   * compared first — which is how "one basis per band" survives being one
   * field. */
  function row(kind, o) {
    const basis = num(o.basis);
    return {
      id: kind.key + ':' + o.id,
      kind: kind.key,
      band: kind.band,
      mark: kind.mark,
      tone: o.tone || kind.tone,
      t: o.t,
      sub: o.sub,
      act: o.act,
      to: o.to,
      params: o.params || null,
      basis: basis,
      // Bands 1 and 4 read longest-standing first; band 2 reads biggest money
      // first; band 3 reads most overdue first, and overdue is negative.
      rank: basis === null ? null : (kind.band === 3 ? basis : -basis),
    };
  }

  /* ---------- kind 1: a departure check waiting for a decision ----------- */

  function gateRows(read, me, now) {
    const buses = indexById(read('buses'));
    const checks = live(read('gatechecks'));
    const out = [], bad = [];
    for (let i = 0; i < checks.length; i++) {
      const g = checks[i];
      if (g.status !== 'awaiting') continue;              // not waiting on anybody
      /* THE IDENTITY RULE, and it landed with the server's own: "you ran this
       * check — somebody else decides go or hold". Without it a supervisor who
       * ran twenty rounds sees twenty rows whose only action is refused. */
      if (me && g.userId === me.id) continue;
      const since = num(g.sentAt) || num(g.startedAt);
      const hours = since === null ? null : (now - since) / HOUR;
      const failed = failedItems(g.items);
      const at = since === null ? '' : clockTime(since);
      const r = row(KINDS[0], {
        id: g.id,
        basis: hours,
        t: fill('attHeld', [busName(buses, g.busId)]),
        sub: fill('attHeldWhy', [failed, at]) + ' '
          + say('attStanding', hours === null ? 0 : Math.round(hours)),
        act: figureOf(hours, 'attUnitH'),
        to: 'gate',
        params: { busId: g.busId, checkId: g.id },
      });
      (r.rank === null ? bad : out).push(r);
    }
    return { rows: out, unranked: bad };
  }

  // The items that failed, named. Not a count: "Brake light failed" is the
  // reason, and a number is not a reason.
  function failedItems(items) {
    if (!items || typeof items !== 'object') return '';
    const keys = Object.keys(items), out = [];
    for (let i = 0; i < keys.length; i++) {
      const it = items[keys[i]];
      if (it && it.ok === false) out.push(String(it.label || keys[i]));
    }
    return out.join(', ');
  }

  /* ---------- kind 7: an open unsafe driver report ------------------------ */

  function unsafeRows(read, me, now) {
    const buses = indexById(read('buses'));
    const reports = live(read('driverreports'));
    const out = [], bad = [];
    for (let i = 0; i < reports.length; i++) {
      const r = reports[i];
      if (r.status !== 'open' || r.jobId) continue;        // answered, or being answered
      const at = num(r.at);
      const hours = at === null ? null : (now - at) / HOUR;
      const made = row(KINDS[1], {
        id: r.id,
        basis: hours,
        t: join(busName(buses, r.busId), String(r.category || r.problem || '')),
        sub: fill('attUnsafeWhy', [ago(at, now)]),
        act: figureOf(hours === null ? null : hours / 24, 'attUnitD'),
        to: 'buses',
        params: { busId: r.busId, tab: 'reports', reportId: r.id },
      });
      (made.rank === null ? bad : out).push(made);
    }
    return { rows: out, unranked: bad };
  }

  /* ---------- kind 5: an unexplained stock change ------------------------- *
   * The newest physical count's shortfalls, valued at the part's own unit cost,
   * and dropped once somebody has explained one: the server writes a
   * `stockmoves` row for every change to a part's quantity and marks it
   * `justified` when a ledger row accounts for it, so a shortfall with a later
   * justified move for that part has an explanation and stops being a row. That
   * is what lets this count reach zero. The three stores are the three halves
   * of the one question, which is why the kind declares all three.
   */
  function stockRows(read, me, now) {
    const parts = indexById(read('parts'));
    const audits = live(read('audits'));
    const moves = live(read('stockmoves'));
    let newest = null;
    for (let i = 0; i < audits.length; i++) {
      const a = audits[i];
      if (num(a.at) === null) continue;
      if (!newest || a.at > newest.at) newest = a;
    }
    if (!newest) return { rows: [], unranked: [] };
    const explained = Object.create(null);
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      if (m.justified === true && num(m.at) !== null && m.at > newest.at) explained[m.partId] = true;
    }
    const lines = newest.lines || EMPTY;
    const out = [], bad = [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const short = -num(l.variance);
      if (!(short > 0) || explained[l.partId]) continue;
      const p = parts[l.partId];
      const value = num(l.value) || (p && num(p.unitCost) !== null ? short * p.unitCost : null);
      const made = row(KINDS[2], {
        id: newest.id + '/' + l.partId,
        basis: value,
        t: join(String((p && p.name) || l.partId), say('attStockN', short)),
        sub: fill('attStockWhy', [dayName(newest.at), String(short)]),
        act: rupeeFigure(value),
        to: 'store',
        params: { partId: l.partId, tab: 'count', auditId: newest.id },
      });
      (made.rank === null ? bad : out).push(made);
    }
    return { rows: out, unranked: bad };
  }

  /* ---------- kind 6: a pilferage flag ----------------------------------- *
   * A part leaving stock against no job card is the one thing the whole
   * anti-pilferage design rests on (`app.js:1320`), so the ledger already
   * records it. This counts those per person over thirty days and flags the
   * person who is far above their own team, which is the comparison that makes
   * the row an accusation worth reading rather than a tally of a busy month.
   *
   * `users` is declared here and is NOT in §3.4's list of stores, because that
   * list has no name source for this kind and the row's own `.t` is a person's
   * name. It is the narrowest store that holds one, and it is reported.
   */
  function pilferRows(read, me, now) {
    const users = indexById(read('users'));
    const ledger = live(read('ledger'));
    const since = now - PILFER_DAYS * DAY;
    const byPerson = Object.create(null);
    const value = Object.create(null);
    let total = 0, people = 0;
    for (let i = 0; i < ledger.length; i++) {
      const l = ledger[i];
      if (l.type !== 'out' || l.jobId || num(l.at) === null || l.at < since) continue;
      const k = String(l.by == null ? '' : l.by);
      if (!has(byPerson, k)) { byPerson[k] = 0; value[k] = 0; people++; }
      byPerson[k]++;
      value[k] += Math.abs(num(l.qty) || 0) * (num(l.unitCost) || 0);
      total++;
    }
    /* One person and no peers is no baseline at all: the only storekeeper in the
     * garage cannot be compared to anybody, and flagging them for doing the job
     * nobody else does is the accusation this row must never make. */
    if (people < 2) return { rows: [], unranked: [] };
    const keys = Object.keys(byPerson);
    const out = [], bad = [];
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i], n = byPerson[k];
      // The PEERS' average, which is what "a team average of 2" means beside an
      // eleven: an outlier inside its own average hides behind it.
      const avg = (total - n) / (people - 1);
      if (n < PILFER_MIN || n < Math.max(avg, 1) * PILFER_OVER) continue;
      const made = row(KINDS[3], {
        id: k,
        basis: value[k] > 0 ? value[k] : null,
        t: join(personName(users, k), say('attPilfer')),
        sub: fill('attPilferWhy', [String(n), String(Math.round(avg))]),   // the peers' figure
        act: rupeeFigure(value[k] > 0 ? value[k] : null),
        to: 'store',
        params: { userId: k, tab: 'issues' },
      });
      (made.rank === null ? bad : out).push(made);
    }
    return { rows: out, unranked: bad };
  }

  /* ---------- kind 4: an unpaid challan ---------------------------------- *
   * READ ONLY, and deliberately. A challan lookup spends a billable credit and
   * the action that spends it belongs on Buses, where it can say what it costs
   * before it is pressed ("Check challans (uses 1 credit)"). Stated here so it
   * is not added by somebody who reads the row and reaches for the obvious
   * button (§3.9's carried rule).
   */
  function challanRows(read, me, now) {
    const buses = live(read('buses'));
    const snaps = live(read('challans'));
    const byReg = Object.create(null);
    for (let i = 0; i < buses.length; i++) byReg[normReg(buses[i].regNo)] = buses[i];
    const out = [], bad = [];
    for (let i = 0; i < snaps.length; i++) {
      const c = snaps[i];
      const n = num(c.pendingCount);
      if (!(n > 0)) continue;
      const b = byReg[normReg(c.rc)];
      const fine = num(c.pendingFine);
      const checked = num(c.fetchedAt);
      const oldest = oldestPending(c.challans);
      const made = row(KINDS[4], {
        id: String(c.rc),
        basis: fine,
        t: join(String((b && b.regNo) || c.rc), say('attChallanN', n)),
        sub: oldest === null
          ? fill('attChallanWhyOnly', [ago(checked, now)])
          : fill('attChallanWhy', [dateName(oldest), ago(checked, now)]),
        act: rupeeFigure(fine),
        to: 'buses',
        params: { busId: b ? b.id : null, tab: 'challans' },
      });
      (made.rank === null ? bad : out).push(made);
    }
    return { rows: out, unranked: bad };
  }

  function oldestPending(list) {
    if (!list || !list.length) return null;
    let min = null;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (!c || c.status !== 'Pending') continue;
      const t = whenMs(c.date);
      if (t === null) continue;
      if (min === null || t < min) min = t;
    }
    return min;
  }

  /* ---------- kind 3a: a bus paper expiring or expired -------------------- *
   * Only a paper with a RECORDED expiry inside the window is a row. A paper
   * nobody has entered is not an alert — that is "110 of 110 missing
   * documents" (`5eb8c6e`), a number nobody could ever clear, and the place
   * that belongs is Buses' five fixed paper rows, where a missing paper is
   * visible as missing.
   */
  function busPaperRows(read, me, now) {
    const buses = live(read('buses'));
    const out = [], bad = [];
    for (let i = 0; i < buses.length; i++) {
      const b = buses[i];
      const docs = b.docs || EMPTY;
      if (!docs.length) continue;
      for (let j = 0; j < docs.length; j++) {
        const d = docs[j];
        if (!d) continue;
        const made = paperRow(KINDS[5], b.regNo, String(d.type || ''), d.expiry, now,
                              b.id + '/' + (d.type || j), 'buses',
                              { busId: b.id, tab: 'papers', docType: d.type });
        if (made) (made.rank === null ? bad : out).push(made);
      }
    }
    return { rows: out, unranked: bad };
  }

  /* ---------- kind 3b: a crew document expiring or expired ---------------- *
   * The same mark and NOT the same query. `drivers` is read only when the
   * reader holds `manageDrivers`, which is checked before this function exists:
   * merging this with 3a is the single easiest way to hand a crew member's
   * licence to a role that may only see buses. Only the keys that carry a date
   * are looked at, so an Aadhaar number can never reach a row from here.
   */
  const CREW_DOC_KEYS = ['license', 'police', 'medical'];

  function crewPaperRows(read, me, now) {
    const crew = live(read('drivers'));
    const out = [], bad = [];
    for (let i = 0; i < crew.length; i++) {
      const d = crew[i];
      const docs = d.docs || null;
      if (!docs) continue;
      for (let j = 0; j < CREW_DOC_KEYS.length; j++) {
        const key = CREW_DOC_KEYS[j];
        const cur = docs[key];
        if (!cur) continue;
        const made = paperRow(KINDS[6], d.name, key, cur.expiry, now,
                              d.id + '/' + key, 'people', { crewId: d.id, docKey: key });
        if (made) (made.rank === null ? bad : out).push(made);
      }
    }
    return { rows: out, unranked: bad };
  }

  // The one shape both halves of kind 3 draw, and the one place the window and
  // the two tones live. It reads no store, so sharing it shares no query.
  function paperRow(kind, holder, label, expiry, now, id, to, params) {
    const at = whenMs(expiry);
    if (at === null) return null;                       // nothing recorded: not a row
    const days = daysBetween(now, at);
    if (days > EXPIRY_DAYS) return null;                // not yet a clock worth watching
    const over = days < 0;
    return row(kind, {
      id: id,
      basis: days,
      tone: over ? 'crit' : 'warn',
      t: join(String(holder == null ? '' : holder), String(label)),
      sub: over ? fill('attExpired', [dayCount(-days)]) : fill('attExpires', [dayCount(days)]),
      act: figureOf(days, 'attUnitD'),
      to: to,
      params: params,
    });
  }

  /* ---------- kind 2: work waiting for a second signature ---------------- *
   * THE IDENTITY RULE, for every role INCLUDING THE OWNER. The live app has
   * this filter at `app.js:3019` and skips it for supervisors; v2 applies it to
   * everybody, and the server enforces the same rule on the write, so a row
   * drawn here for your own close would be a row whose only action is refused.
   * "Do not draw a refused action" is the whole of the client's half.
   */
  function verifyRows(read, me, now) {
    const buses = indexById(read('buses'));
    const users = indexById(read('users'));
    const cards = live(read('jobcards'));
    const out = [], bad = [];
    for (let i = 0; i < cards.length; i++) {
      const j = cards[i];
      if (j.status !== 'done' || j.verifiedBy) continue;
      if (me && j.closedBy === me.id) continue;          // the rule
      const at = num(j.closedAt);
      const hours = at === null ? null : (now - at) / HOUR;
      const made = row(KINDS[7], {
        id: j.id,
        basis: hours,
        t: join(busName(buses, j.busId), String(j.problem || '')),
        sub: fill('attSecondSig', [ago(at, now), personName(users, j.closedBy)])
          + ' ' + say('attNotHere'),
        act: figureOf(hours === null ? null : hours / 24, 'attUnitD'),
        to: 'jobcard',
        params: { id: j.id },
      });
      (made.rank === null ? bad : out).push(made);
    }
    return { rows: out, unranked: bad };
  }

  /* ---------- kind 8: a breakdown pattern -------------------------------- */

  function breakdownRows(read, me, now) {
    const buses = indexById(read('buses'));
    const list = live(read('breakdowns'));
    const since = now - BREAK_DAYS * DAY;
    const per = Object.create(null);
    let total = 0, fleet = 0;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (num(b.at) === null || b.at < since) continue;
      const k = String(b.busId == null ? '' : b.busId);
      if (!has(per, k)) { per[k] = { n: 0, last: 0, systems: {} }; fleet++; }
      per[k].n++;
      if (b.at > per[k].last) per[k].last = b.at;
      per[k].systems[String(b.system || '')] = true;
      total++;
    }
    if (!fleet) return { rows: [], unranked: [] };
    const avg = total / fleet;
    const keys = Object.keys(per);
    const out = [], bad = [];
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i], e = per[k];
      if (e.n < BREAK_MIN || e.n <= avg) continue;
      const systems = Object.keys(e.systems);
      // "became true" for a pattern is its most recent breakdown (§3.3).
      const hours = (now - e.last) / HOUR;
      const made = row(KINDS[8], {
        id: k,
        basis: hours,
        t: join(busName(buses, k), say('attBreakN', e.n)),
        sub: fill('attBreakWhy', [String(e.n), systems.join(', '), String(Math.round(avg))]),
        act: countFigure(e.n),
        to: 'buses',
        params: { busId: k, tab: 'history' },
      });
      (made.rank === null ? bad : out).push(made);
    }
    return { rows: out, unranked: bad };
  }

  /* ---------- kind 9: a bus tonight with no driver ----------------------- *
   * It can reach zero only because tonight's buses are PICKED FIRST: the
   * denominator is the nightly list, not the fleet. "67 buses need a driver"
   * against 54 drivers (`ba274f6`) is the version of this row that counted
   * every bus, and it was a number nobody could clear. With no record for
   * tonight there is no denominator and so there are no rows — which is also
   * §3.2's rule that kind 9 is removed rather than left as a number that cannot
   * reach zero.
   *
   * A seat comes from the NEWEST `dutylog` row for each crew member, not from
   * `buses`: `busId` on a crew record is overwritten on every change, and the
   * log is what knows who is on a bus tonight.
   */
  function seatRows(read, me, now) {
    const buses = indexById(read('buses'));
    const nl = read('nightlist');
    const log = live(read('dutylog'));
    const n = night();
    const key = (n && n.dayKey) ? n.dayKey(now) : null;
    let rec = null;
    for (let i = 0; i < nl.length; i++) {
      const r = nl[i];
      if (r && !r._deleted && key !== null && r.id === 'nl-' + key) { rec = r; break; }
    }
    if (!rec || !rec.buses) return { rows: [], unranked: [] };

    // The newest log row per crew member: one pass, no sort.
    const seatOf = Object.create(null);
    for (let i = 0; i < log.length; i++) {
      const r = log[i];
      if (!r.crewId || num(r.at) === null) continue;
      const cur = seatOf[r.crewId];
      if (!cur || r.at > cur.at || (r.at === cur.at && String(r.id) > String(cur.id))) seatOf[r.crewId] = r;
    }
    const filled = Object.create(null);
    const crew = Object.keys(seatOf);
    for (let i = 0; i < crew.length; i++) {
      const r = seatOf[crew[i]];
      if (!r.busId) continue;
      if (!has(filled, r.busId)) filled[r.busId] = { driver: 0, conductor: 0 };
      if (r.role === 'conductor') filled[r.busId].conductor++; else filled[r.busId].driver++;
    }
    // "became true" for this kind is when tonight's record was written (§3.3).
    const at = num(rec.updatedAt) || num(rec.at);
    const hours = at === null ? null : (now - at) / HOUR;
    const ids = Object.keys(rec.buses);
    const out = [], bad = [];
    for (let i = 0; i < ids.length; i++) {
      const busId = ids[i];
      const e = rec.buses[busId];
      if (!e || e.running !== true) continue;            // `running:false` is a decision, not a gap
      const f = filled[busId] || { driver: 0, conductor: 0 };
      const empty = (f.driver > 0 ? 0 : 1) + (f.conductor > 0 ? 0 : 1);
      if (!empty) continue;
      const label = empty === 2 ? 'attNoCrew' : (f.driver > 0 ? 'attNoConductor' : 'attNoDriver');
      const made = row(KINDS[9], {
        id: busId,
        basis: hours,
        t: join(busName(buses, busId), say(label)),
        sub: say('attSeatWhy', empty),
        act: figureOf(empty, 'attUnitSeats'),
        to: 'duty',
        params: { busId: busId },
      });
      (made.rank === null ? bad : out).push(made);
    }
    return { rows: out, unranked: bad };
  }

  /* ---------- figures ---------------------------------------------------- *
   * NEVER with `at`. The list says how fresh it is once, in its own header; an
   * `at` here adds .figure-note as a BLOCK element, triples the row's height
   * and runs the age words once per row. It is the rule a well-meaning builder
   * breaks first, because "every number says when it was last true" reads like
   * it applies per number.
   */
  function fig(v, opts) {
    return typeof root.figure === 'function' ? root.figure(v, opts || {}) : '';
  }

  function figureOf(v, unitId) {
    return fig(v === null ? null : Math.round(v), { unit: say(unitId) });
  }

  function rupeeFigure(v) {
    const f = money();
    return fig(v === null ? null : Math.round(v), f ? { format: f.rupees } : {});
  }

  function countFigure(n) { return fig(n, {}); }

  /* ---------- dates and ages, read ONCE at index time -------------------- *
   * Every one of these runs while the index is built, never inside the
   * comparator and never per draw: a comparator that parses a date is O(n log
   * n) parses, and the sort is the one place in this screen that runs more than
   * once per row.
   */
  function locale() {
    const W = words();
    const l = W && typeof W.lang === 'function' ? W.lang() : 'en';
    return l === 'hi' ? 'hi-IN' : 'en-IN';
  }

  function safeFormat(ms, opts, fallback) {
    try { return new Date(ms).toLocaleDateString(locale(), opts); } catch (e) { return fallback; }
  }

  // "12 August". A locale call rather than a month table, so no month name is a
  // fixed English word this file has to own.
  function dateName(ms) {
    return ms === null ? '' : safeFormat(ms, { day: 'numeric', month: 'long' }, String(ms));
  }

  // "Tuesday", for the day a shelf count was taken.
  function dayName(ms) {
    return ms === null ? '' : safeFormat(ms, { weekday: 'long' }, dateName(ms));
  }

  function clockTime(ms) {
    try {
      return new Date(ms).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return ''; }
  }

  // "2 days", for a sentence that names an age. The plural is the word table's.
  function dayCount(n) { return say('attDays', n); }

  function ago(at, now) {
    if (at === null) return '';
    return dayCount(Math.max(0, Math.round((now - at) / DAY)));
  }

  /* ---------- the index -------------------------------------------------- *
   * ONE pass per store per build. Twelve-ish `getAll()`s happened before this
   * was called (`Attention.stores`), and NOTHING here reads a store again: the
   * arrays are handed in, which is also what makes this function pure and
   * testable in node.
   */
  function reader(kind, rows, seen) {
    return function (name) {
      if (kind.stores.indexOf(name) === -1) {
        // Not a defensive check: it is the mechanism. A kind that could read
        // any store would be a kind whose declaration was a comment.
        throw new Error('attention: kind ' + kind.key + ' read an undeclared store: ' + name);
      }
      seen[name] = true;
      const a = rows && rows[name];
      return (a && a.length) ? a : EMPTY;
    };
  }

  /* A KIND WHOSE STORES ARE NOT ALL READABLE IS NOT BUILT, and this is
   * REV-FLOW F4.
   *
   * `reader()` above turns an absent or unreadable store into `EMPTY`, so
   * "this store is not on this device" and "this store is empty" arrive at a
   * builder as the same value — and for `seatRows` an empty `dutylog` means
   * "nobody is on any bus". With `nightlist` readable and `dutylog` not, the
   * screen reported SIX buses as *"no crew, 2 seats still empty"*, one of them
   * with all three seats filled, as a settled count with no loading state and
   * no hedge. That is [E] ba274f6 — *"67 buses need a driver"* — reproduced as
   * a load-order defect rather than a missing narrowing, and the cost is a
   * supervisor walking the yard to crew buses that are crewed and then learning
   * to scroll past the red, which is the exact habit the row kind exists to
   * prevent.
   *
   * The fix is NOT to load more. A screen cannot promise that every store it
   * reads is readable — a read can fail, and a store can be sealed because it
   * belongs to the previous person (`cache.js`). The fix is that a kind which
   * cannot see its own data contributes NOTHING: no rows, no filter count, no
   * remainder. That is the answer `seatRows`' own comment already gives for a
   * night with no record — *"kind 9 is removed rather than left as a number
   * that cannot reach zero"* — applied one layer up, and it sits beside
   * `holds()` because it is the same kind of question: may this kind be built
   * at all, asked before anything is read.
   *
   * `unreadable` is the union of two facts, and both are needed:
   *   - the store has no copy in `rows` (`undefined`): never read;
   *   - the store is named by `Cache.unread()`: the last read FAILED or was
   *     refused, and `load()` leaves `[]` behind a failure — which is the case
   *     a check on `undefined` alone cannot see and the one that survives.
   *
   * A kind that is skipped is in `skipped`, so a caller can say "could not be
   * read" rather than silently drawing a shorter list. */
  function unreadableFor(kind, rows, unreadSet) {
    const out = [];
    for (let i = 0; i < kind.stores.length; i++) {
      const n = kind.stores[i];
      if (rows && rows[n] !== undefined && !(unreadSet && unreadSet[n])) continue;
      out.push(n);
    }
    return out;
  }

  function index(rows, me, nowMs, unreadNames) {
    const now = num(nowMs) === null ? Date.now() : nowMs;
    const seen = Object.create(null);
    const unreadSet = Object.create(null);
    const un = (unreadNames && unreadNames.length) ? unreadNames : [];
    for (let i = 0; i < un.length; i++) unreadSet[String(un[i])] = true;
    let ranked = [], unranked = [];
    const skipped = [];
    for (let i = 0; i < KINDS.length; i++) {
      const k = KINDS[i];
      /* BEFORE the query. An unheld kind is not read, not built, not counted
       * and not in the remainder — §3.6's whole second layer is this line. */
      if (!holds(k, me)) continue;
      // AND before the query: see the block above. A kind that cannot see its
      // own rows is removed, not computed off the gap.
      const missing = unreadableFor(k, rows, unreadSet);
      if (missing.length) { skipped.push(k.key); continue; }
      const got = k.build(reader(k, rows, seen), me, now);
      ranked = ranked.concat(got.rows);
      unranked = unranked.concat(got.unranked);
    }
    ranked.sort(compare);
    const counts = { all: ranked.length };
    for (let i = 0; i < BANDS.length; i++) counts[BANDS[i].filter] = 0;
    for (let i = 0; i < ranked.length; i++) {
      for (let j = 0; j < BANDS.length; j++) {
        if (BANDS[j].band === ranked[i].band) { counts[BANDS[j].filter]++; break; }
      }
    }
    return {
      rows: ranked,
      unranked: unranked,
      counts: counts,
      stores: Object.keys(seen).sort(),
      // The kinds this device could not build, in KINDS order. A caller that
      // wants to say "this part could not be read" has the names; a caller that
      // does not is at least not drawing a count off the gap.
      skipped: skipped.sort(),
      at: now,
    };
  }

  /* THE comparator. Four keys, three numeric comparisons and one string, on
   * fields already on the row. No date parsing, no formatting, no store access,
   * no allocation. `rank` is only ever compared between rows of the SAME band,
   * because `band` is compared first — which is why one basis per band survives
   * being one field, and why no cross-unit comparison exists on this screen. */
  function compare(a, b) {
    if (a.band !== b.band) return a.band - b.band;
    if (a.rank !== b.rank) return a.rank - b.rank;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  }

  /* ---------- the build, once per content signature ---------------------- *
   * §3.4's first rule, and the one the measured bug broke: the index is built
   * when a store it reads has a new signature, and NEVER from a draw function.
   * `Cache.sig` is one pass over an array it already holds and is keyed on the
   * array's identity, so this costs nothing on a redraw that changed nothing.
   */
  let memo = null;                 // {sig, who, index}

  function sigFor(me) {
    const c = cache();
    if (!c || typeof c.sigOf !== 'function') return null;
    const list = stores(me);
    return list.length ? c.sigOf.apply(null, list) : '';
  }

  /* The stores whose last read failed or was refused, from `Cache` itself and
   * not from the frame's model: `render` is also called with a bare rows bag by
   * the suites, and `cachedIndex` is reached from `setFilter` and `rowById` too,
   * which have no model in hand. One source, every caller. */
  function unreadNow() {
    const c = cache();
    try { return (c && c.unread) ? c.unread() : []; } catch (e) { return []; }
  }

  function cachedIndex(me) {
    const s = state();
    const bag = (s && s.cache) || null;
    if (!bag) return null;
    const sig = sigFor(me);
    const who = me ? String(me.id) + '/' + String(me.role) : '-';
    /* A store with no copy yet is "not loaded", which is not "empty": the
     * screen draws its chrome and a skeleton until the first load lands.
     *
     * ANY of them, not all, and this line was very nearly relaxed on the way to
     * fixing F4 — which would have broken the rule F4 is about. The thought was
     * that a store which came back unreadable would skeleton for ever, so the
     * test should let a partly-filled bag through. It should not, for two
     * reasons:
     *
     *   - `v2-foundation-ui.md §3.6`'s filter-strip row SPECIFIES the loading
     *     state: *"the strip draws immediately with the counts as `figure(null)`
     *     — a dash, not a 0"*. A bag with four of its eight stores in hand
     *     yields REAL counts over half the kinds, drawn as settled figures with
     *     no hedge, and then they jump when the rest land. A number that is
     *     true of half the data is the same lie as a number that is true of
     *     none of it, which is this screen's whole subject.
     *   - the premise was wrong anyway. `Cache.load` leaves `[]` behind a
     *     FAILED read, not `undefined` (its own comment says so), so an
     *     unreadable store does not reach this test as missing. It reaches
     *     `index()`, which drops the kinds that cannot see their own rows and
     *     draws the rest. There is no forever-skeleton for this line to avoid.
     *
     * So the two cases are handled in the two different places they belong:
     * "nothing is here yet" is a skeleton, and "this part could not be read" is
     * a kind removed from a screen that otherwise draws. */
    const want = stores(me);
    for (let i = 0; i < want.length; i++) if (bag[want[i]] === undefined) return null;
    /* The unread names are part of what the index was built FROM, so they are
     * part of its key. Without this, a store that failed and then recovered
     * would keep serving the index built while it was unreadable, because the
     * signature of a store that is still `[]` has not moved. */
    const un = unreadNow().slice().sort();
    const key = sig + '#' + un.join(',');
    if (memo && memo.sig === key && memo.who === who) return memo.index;
    memo = { sig: key, who: who, index: index(bag, me, null, un) };
    return memo.index;
  }

  /* The load, and the only place a store is read at all. Kicked from `mount()`
   * and from a route change, never from a render: `Cache.reads()` must not move
   * between two draws of the same data, and `test_v2_attention.js` asserts
   * exactly that. */
  let loading = false;
  function load(me) {
    const c = cache();
    if (loading || !c || typeof c.load !== 'function') return null;
    const want = stores(me);
    if (!want.length) return null;
    loading = true;
    return c.load(want).then(function () {
      loading = false;
      redraw();
    }, function () { loading = false; });
  }

  function redraw() {
    const r = router(), sh = shell();
    const cur = (r && r.current) ? r.current() : null;
    if (!cur || cur.id !== ID || !sh || typeof sh.mount !== 'function') return;
    sh.mount(ID, cur.params);
  }

  /* ---------- the filter ------------------------------------------------- *
   * A filter narrows the index in memory: it is already sorted, so this is one
   * pass over an array. It NEVER navigates and never writes — a tab that pushed
   * a route would make a back press walk back through filters instead of
   * leaving the screen.
   */
  let filter = 'all';
  const FILTERS = ['all', 'safety', 'money', 'papers', 'waiting'];

  function narrow(rows, f) {
    if (f === 'all') return rows;
    let band = 0;
    for (let i = 0; i < BANDS.length; i++) if (BANDS[i].filter === f) band = BANDS[i].band;
    if (!band) return rows;
    const out = [];
    for (let i = 0; i < rows.length; i++) if (rows[i].band === band) out.push(rows[i]);
    return out;
  }

  function wordForFilter(f) {
    if (f === 'all') return say('attAll');
    for (let i = 0; i < BANDS.length; i++) if (BANDS[i].filter === f) return say(BANDS[i].word);
    return '';
  }

  /* ---------- drawing ---------------------------------------------------- */

  /* The tabs draw IMMEDIATELY, every count as `figure(null)` while the index is
   * building: Attention ranks across a dozen stores and is the screen most
   * likely to be slow, so it draws its chrome first and fills in. A dash and a
   * zero must never look alike. */
  function tabs(counts) {
    let out = '<div class="tabs att-tabs" role="tablist">';
    for (let i = 0; i < FILTERS.length; i++) {
      const f = FILTERS[i];
      const on = f === filter;
      out += '<button type="button" role="tab" data-act="filter" data-f="' + f + '"'
        + ' aria-selected="' + (on ? 'true' : 'false') + '">'
        + esc(wordForFilter(f)) + ' ' + fig(counts ? counts[f] : null, {}) + '</button>';
    }
    return out + '</div>';
  }

  /* The list's freshness, said once. Offline it names the last signal instead:
   * the rows are from the local database and are real — only their age is in
   * question. */
  function fresh(index, offline) {
    let text;
    if (offline) {
      const i = info();
      const last = num(i.lastSyncAt);
      text = last === null ? say('attNoSignalEver') : fill('attNoSignal', [clockTime(last)]);
    } else {
      const ms = Math.max(0, Date.now() - index.at);
      if (ms < 60000) text = say('attFreshNow');
      else if (ms < HOUR) text = say('attFreshMin', Math.round(ms / 60000));
      else if (ms < DAY) text = say('attFreshHr', Math.round(ms / HOUR));
      else text = say('attFreshDay', Math.round(ms / DAY));
    }
    return '<p class="att-fresh">' + mark('clock', 14) + ' ' + esc(text) + '</p>';
  }

  function info() {
    const s = sync();
    try { return (s && s.info) ? s.info() : {}; } catch (e) { return {}; }
  }

  /* ONE row, and every row goes somewhere: the row is the reason, the link is
   * the fix, and a row with no destination is not a row. `data-act` rather than
   * `data-nav` on purpose — the frame's own listener owns `[data-nav]` and
   * would route it with no params, so the row's destination would lose the bus
   * it is about. */
  function drawRow(r) {
    return '<a class="v2row v2row-why ' + r.tone + '" href="#" data-act="go" data-i="' + esc(r.id) + '">'
      + '<span class="lead">' + mark(r.mark, 16) + '</span>'
      + '<div class="txt"><div class="t">' + esc(r.t) + '</div>'
      + '<div class="sub">' + esc(r.sub) + '</div></div>'
      + '<div class="act">' + r.act + '</div></a>';
  }

  /* The whole body as ONE string, set with ONE insertAdjacentHTML by
   * `Shell.body`. Per-row appendChild is the shape that cost 277 ms per page,
   * and two hundred rows is exactly where that is paid. */
  function draw(index, f, opts) {
    opts = opts || {};
    if (!index) return tabs(null) + (typeof root.skeleton === 'function' ? root.skeleton(6) : '');
    const use = FILTERS.indexOf(f) === -1 ? filter : f;
    const rows = narrow(index.rows, use);
    let out = tabs(index.counts) + fresh(index, opts.offline === true);

    if (!rows.length) {
      out += use === 'all'
        ? emptyAll()
        : empty(fill('attEmptyFilter', [wordForFilter(use)]), 'ok');
    } else {
      const shown = rows.length > CAP ? CAP : rows.length;
      let list = '';
      for (let i = 0; i < shown; i++) list += drawRow(rows[i]);
      out += '<div class="att-list">' + list + '</div>';
      /* A capped list with a stated remainder is NOT a count that cannot reach
       * zero: it says what is not shown and what to do about it. Never a longer
       * list, never an infinite scroll, never a page control. */
      if (rows.length > shown) {
        out += '<p class="att-more">'
          + esc(fill('attMore', [String(shown), String(rows.length - shown)])) + '</p>';
      }
    }

    /* A row that could not be ranked is DROPPED from the ranking and listed
     * here under its own count — never ranked at zero, which would put it above
     * a real emergency, and never silently discarded. Under the `all` filter
     * only: it belongs to no band, and showing it beneath a band's rows would
     * make §3.8's "Nothing under Money" unreachable. */
    if (use === 'all' && index.unranked.length) {
      let list = '';
      const n = index.unranked.length > CAP ? CAP : index.unranked.length;
      for (let i = 0; i < n; i++) list += drawRow(index.unranked[i]);
      out += '<h2 class="att-unranked">' + esc(fill('attUnranked', [String(index.unranked.length)]))
        + '</h2><div class="att-list">' + list + '</div>';
    }

    // Last, not first: the advisor is the most expensive path in the product
    // and the ranked list is what the person came for.
    return out + ask(opts.offline === true);
  }

  function empty(text, icon) {
    return typeof root.emptyState === 'function'
      ? root.emptyState(text, { icon: icon, hint: '' }) : '';
  }

  // THE state the whole screen exists to be able to reach. If the count can
  // never be zero, the screen is lying.
  function emptyAll() {
    return typeof root.emptyState === 'function'
      ? root.emptyState(say('attEmpty'), { icon: 'ok', hint: say('attEmptyHint') }) : '';
  }

  /* The advisor. No spinner and no animation while it waits: this is the one
   * control on the screen whose wait is seconds, and a six-call path cannot be
   * made to feel fast by a moving thing. Offline it is disabled with a WORD,
   * and the word is said before the person fills the field in. */
  let asking = false;

  function ask(offline) {
    const label = asking ? say('attAsking') : say('attAsk');
    const hint = offline ? say('attAskOffline') : say('attAskSlow');
    return '<div class="card att-ask">'
      + '<h2 class="att-ask-h">' + esc(say('attAskTitle')) + '</h2>'
      + '<label class="att-ask-l" for="att-q"><span class="sr-only">'
      + esc(say('attAskTitle')) + '</span>'
      + '<input class="field" id="att-q" type="text" autocomplete="off" enterkeyhint="send"'
      + ' placeholder="' + esc(say('attAskPlaceholder')) + '"></label>'
      + '<p class="att-ask-n">' + esc(hint) + '</p>'
      + (offline ? '' : '<button type="button" class="btn btn-primary" data-act="ask"'
        + (asking ? ' aria-disabled="true"' : '') + '>' + esc(label) + '</button>')
      + '</div>';
  }

  /* ---------- the shell seam -------------------------------------------- */

  function me() {
    const s = state();
    const u = s && s.user;
    return u ? { id: u.id, role: u.role } : null;
  }

  function isModel(x) { return !!(x && typeof x === 'object' && typeof x.route === 'string'); }

  /* `Shell.mount` calls `render(model)`; §1 of the cut specifies
   * `render(index, filter)`. One function serves both, because the seam is the
   * frame's and the signature is the spec's. A shell model is recognised by
   * `route`, which no index has. */
  function render(a, b) {
    if (!isModel(a)) return draw(a, b, {});
    const who = a.user ? { id: a.user.id, role: a.user.role } : me();
    return draw(cachedIndex(who), filter, { offline: a.offline === true, density: a.density });
  }

  /* §3.5: WITH FIVE FILTERS THE STRIP STAYS IN THE BODY AT BOTH DENSITIES, and
   * the header's trailing slot takes a `.btn` carrying icon('filter') "only if a
   * sixth filter is ever added". There are five, so the frame's one trailing
   * slot is left to the offline button and this draws nothing.
   *
   * It is exported anyway, empty, because the pair of facts is what makes the
   * rule falsifiable: `test_v2_attention.js` asserts this is empty AND that
   * FILTERS has exactly five entries, so a sixth filter reddens a check instead
   * of quietly overflowing a strip that scrolls at 360px. */
  function trailing() { return ''; }

  /* ---------- ONE delegated listener ------------------------------------ */

  let listening = false;
  let watching = false;
  function mount() {
    const d = doc();
    if (!listening && d && typeof d.addEventListener === 'function') {
      listening = true;
      d.addEventListener('click', onClick);
    }
    /* The load is kicked from a ROUTE CHANGE and from here, never from a
     * render: `Cache.reads()` must not move between two draws of the same data,
     * and a screen that fetched from its draw function is `computeInsights()`
     * at 386 ms per render wearing a different name. */
    const rt = router();
    if (!watching && rt && typeof rt.onChange === 'function') {
      watching = true;
      rt.onChange(onRoute);
    }
    load(me());
    return true;
  }

  /* The other half of `mount()`, and INTEGRATION-NOTES 17's step 2. `Shell.mount`
   * calls it when it mounts a different screen, so what `mount()` added comes
   * off exactly when this screen stops being the one on the page. The flag goes
   * back with the listeners: a screen that forgot it would never re-arm.
   *
   * It removes the SAME function references `mount()` registered, which is why
   * every handler here is a named module-level function and not a closure built
   * per mount — `removeEventListener` matches on identity, and a fresh arrow
   * would remove nothing while looking exactly like this. */
  function unmount() {
    const d = doc();
    if (listening && d && typeof d.removeEventListener === 'function') {
      d.removeEventListener('click', onClick);
    }
    listening = false;
    /* `watching` is NOT cleared and the route subscription is NOT removed:
     * `Router.onChange` has no counterpart and `onRoute` returns on any route
     * that is not this one, so it is one guarded, inert subscription for the
     * session rather than a leak. Clearing the flag without removing the
     * listener would stack a second one on the next mount, which is the leak.
     *
     * `loading` is NOT cleared either, and that is deliberate: a read in flight
     * clears it itself when it settles, and clearing it here would let the next
     * mount kick a second `Cache.load` over the top of the first. */
    return true;
  }

  function onRoute(cur) {
    if (!cur || cur.id !== ID) return;
    load(me());
  }

  function onClick(ev) {
    const t = ev && ev.target;
    if (!t || typeof t.closest !== 'function') return;
    /* THE LINE, and it is read BEFORE [data-act] and [data-nav]. A shelf-count
     * field sat inside a pressable row, the row's handler caught the click, and
     * the storekeeper was thrown off the screen mid-count. Tapping the advisor
     * field does exactly ONE thing: it puts the caret in it. */
    if (t.closest('input, select, textarea, label, .num')) return;
    const el = t.closest('[data-act]');
    if (!el) return;
    const act = el.getAttribute('data-act');
    if (act === 'filter') { stop(ev); setFilter(el.getAttribute('data-f')); return; }
    if (act === 'go') { stop(ev); go(el.getAttribute('data-i')); return; }
    if (act === 'ask') { stop(ev); send(); }
  }

  function stop(ev) { if (ev && ev.preventDefault) ev.preventDefault(); }

  /* A tab changes what is DRAWN. It does not push a route and it does not
   * write, so only the body is replaced — one string, one insert, and the
   * index is not rebuilt because nothing about the data changed. */
  function setFilter(f) {
    if (FILTERS.indexOf(f) === -1 || f === filter) return;
    filter = f;
    const sh = shell();
    if (!sh || typeof sh.body !== 'function') return;
    const who = me();
    sh.body(draw(cachedIndex(who), filter, { offline: offlineNow() }));
  }

  function offlineNow() {
    const i = info();
    if (i.lastError || i.status === 'offline') return true;
    const nav = root && root.navigator;
    return !!(nav && nav.onLine === false);
  }

  function rowById(id) {
    const idx = cachedIndex(me());
    if (!idx) return null;
    const all = idx.rows.concat(idx.unranked);
    for (let i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }

  function go(id) {
    const r = rowById(id);
    const rt = router();
    if (!r || !rt || typeof rt.go !== 'function') return;
    rt.go(r.to, r.params);
  }

  /* The advisor's one write, and it is a question rather than a record. There
   * is no dialog about anything: a refusal is a named sentence with a Retry,
   * which is what the toast and the sheet already are. */
  function send() {
    const d = doc();
    const field = d && d.getElementById ? d.getElementById('att-q') : null;
    const q = field && field.value ? String(field.value).trim() : '';
    const s = sync();
    if (asking || !q || !s || typeof s.ai !== 'function') return;
    asking = true;
    refreshAsk();
    s.ai({ question: q }).then(function (res) {
      asking = false;
      refreshAsk();
      const V = root.V2;
      if (!V || typeof V.openSheet !== 'function') return;
      const text = res && res.text ? String(res.text) : '';
      if (text) V.openSheet(say('attAskTitle'), '<p>' + esc(text) + '</p>');
      else if (typeof V.toast === 'function') V.toast(say('attAskFailed'));
    }, function () {
      asking = false;
      refreshAsk();
      const V = root.V2;
      if (V && typeof V.toast === 'function') V.toast(say('attAskFailed'));
    });
  }

  function refreshAsk() {
    const sh = shell();
    if (!sh || typeof sh.body !== 'function') return;
    sh.body(draw(cachedIndex(me()), filter, { offline: offlineNow() }));
  }

  /* ---------- exports --------------------------------------------------- */

  const api = {
    index: index,
    render: render,
    trailing: trailing,
    mount: mount,
    unmount: unmount,
    stores: stores,
    compare: compare,
    KINDS: KINDS,
    BANDS: BANDS,
    FILTERS: FILTERS,
    CAP: CAP,
    // Test seam only, the shape of `Router._reset` and `Shell._reset`: a node
    // suite cannot reload a classic script per case.
    _reset: function () { memo = null; filter = 'all'; asking = false; loading = false; },
    _filter: function () { return filter; },
    /* The memoised index ITSELF, by identity. §3.4's first rule — "built once
     * per content signature, never from a draw function" — cannot be checked
     * from the markup, because a rebuilt index draws exactly the same list.
     * What a rebuild changes is the object, so identity is the only honest
     * handle on it: `_index() === _index()` across two draws is the rule, and a
     * new object after a store is written is the other half. */
    _index: function () { return memo && memo.index; },
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.Attention = api;
    /* Registers itself at load, which is what index.html's script order means
     * by "each registers itself with Router and draws nothing until Shell.mount
     * asks". And ONLY registers: the listener goes on when the frame mounts
     * this screen, and comes off when it mounts another. On the first paint the
     * Shell calls `mount()` before installing its own handler, so a row is
     * still read by this screen first — which is why `drawRow` uses `data-act`
     * rather than `data-nav` and keeps the bus it is about. */
    const rt = router();
    if (rt && typeof rt.register === 'function') rt.register(ID, api);
    /* NO `mount()` here. The listener used to go on at script load, which was
     * the only thing that ever installed it (`Shell.mount` rendered and nothing
     * else), and it then outlived the screen for the whole session —
     * INTEGRATION-NOTES 17. `Shell.mount` now calls `mount()` on the way in and
     * `unmount()` on the way out, so a screen's listeners exist exactly while
     * the screen is the one on the page. A screen's load registers and nothing
     * more, which is what `index.html`'s script order has always claimed. */
  }
})(typeof window !== 'undefined' ? window : this);

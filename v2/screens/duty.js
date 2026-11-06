/* Garage Saathi v2 — screen #9, the duty board.
 *
 * "Does every bus that runs tonight have a driver and a conductor?"
 *
 * THIS SCREEN EXISTS TO MAKE A COUNT REACH ZERO, and everything below serves
 * that one property. v1's duty board counted buses that needed a driver out of
 * every bus in the yard (ba274f6) and showed "67 buses need a driver" against 54
 * drivers and about a hundred buses — a number that could not reach zero. A
 * count that cannot reach zero teaches people to scroll past red, which is the
 * defect the whole Attention idea exists to avoid, so three things here are
 * decisions rather than details:
 *
 *  1. THE DENOMINATOR IS TONIGHT'S PICKED BUSES, never the fleet. There is no
 *     schedule anywhere in the app; the office keeps tonight's running list in a
 *     paper register (DECISIONS.md §8), so the day starts with one quick entry
 *     and the board draws only what was ticked.
 *
 *  2. AT ZERO IT READS A SENTENCE, not "0 of 24". A zero that still looks like a
 *     counter is still a counter.
 *
 *  3. THE RELIEF SEAT DOES NOT HOLD THE COUNT OPEN. Driver 2 is the relief
 *     driver on night and long routes, not a seat every bus has. If an empty one
 *     counted, the count could never reach zero on a fleet that mostly runs one
 *     driver — ba274f6 again with a new denominator. So Driver 1 and the
 *     conductor carry `--warn` when empty and Driver 2 does not: a warning mark
 *     on a seat that cannot be the reason the count is red IS the scroll-past-red
 *     defect, in miniature.
 *
 * WHAT IT CONSUMES AND DOES NOT RE-DERIVE. `v2/night.js` owns tonight's record
 * and three of its properties are load-bearing here (read its header): the
 * record is a MAP keyed by bus id and not a list, so a bus ticked by mistake can
 * be un-ticked and the count can reach zero; `running: false` is a real state
 * and is NOT the same as absent, so the pick list draws THREE states and not
 * two (v2-foundation-ui.md §3.6 — unknown and zero must never look alike); and
 * each entry's `at` is stamped by the SERVER, so nothing here stamps one.
 *
 * WHY THE NIGHT RECORD IS READ OUT OF THE CACHE AND NOT THROUGH Night.get().
 * `Night.get` is async because it reads IndexedDB, and `render(model)` is
 * synchronous and pure so a node suite can assert on the string it returns. So
 * the record comes from `model.cache.nightlist`, which `Cache.load` has already
 * read, and `runningIn()` below is the synchronous mirror of `Night.running`'s
 * `=== true` test. Those two predicates MUST stay identical; the comment on
 * `runningIn` says so at the point it would be changed.
 *
 * THE GATE STATE IS WORDS HERE, NOT A PRESSABLE THING. DECISIONS.md §15 split
 * the old screen in two for one reason: the two counts empty at different hours
 * of the evening — seats are filled before the buses leave, departure checks
 * arrive as each one goes — so one screen showing both always has a number that
 * is not yet zero, which is the ba274f6 defect wearing the new design. The ten
 * items, the photograph and the hold are screen #13's. A state you may READ is
 * information, and "has this bus left yet" is squarely the crew manager's
 * business, so the words are drawn for everybody and nobody can press them.
 *
 * Test: test_v2_duty.js (at the repo root — run-tests.py does not recurse).
 */
(function (root) {
  'use strict';

  var ID = 'duty';
  var CAP_ASSIGN = 'assignDriver';
  var CAP_GATE = 'gateCheck';

  /* The 200-row cap, and the one number in this file that rests on a
   * PLACEHOLDER rather than a measurement. v2-foundation-ui.md §2.3's row budget
   * has not been taken on an office PC yet (DECISIONS.md §9), so 200 here means
   * "the same cap every other list in v2 uses", not "200 rows draw in time". If
   * the reading comes back slow, this is one of the numbers that moves. */
  var CAP_ROWS = 200;

  /* IST is UTC+5:30 as a FIXED offset, which is the same arithmetic
   * v2/night.js's dayKey and sync_server.py's _ist_day do. It has to be the
   * same: the office reads one register and one clock, and a supervisor whose
   * phone is on another timezone must not see a different time printed against
   * the same duty-log row than the office sees. */
  var IST_MS = 19800000;

  /* The ten items' count, for the gate row's progress sentence. Named rather
   * than written into a string so it cannot drift from screen #13's ten. */
  var GATE_ITEMS = 10;

  /* The selector the one delegated click listener returns early on, BEFORE it
   * reads `[data-act]` or `[data-nav]`. This screen holds a checkbox per bus in
   * the pick list and a date input in the lookup, and predeploy-gate.sh lines
   * 508-511 and the sweep at 1073 test exactly this regression: a field inside a
   * pressable row threw the storekeeper off the screen mid-count. */
  var FIELDS = 'input, select, textarea, label, .num';

  /* ---------- the words ---------------------------------------------------
   *
   * Every fixed word this screen draws is an id. v2-foundation-ui.md §6.3: a
   * fixed English word hard-coded at the point of use is a word no Hindi reader
   * is ever told is missing, and that is how a whole screen stayed English with
   * every test passing. The Hindi halves are '' — PENDING, which is a state and
   * not an absence: test_v2_words.js prints the pending count by name on every
   * run and a pending label draws its English WITH ITS ID in Hindi mode, so a
   * reader can report it. Inventing Hindi the owner has not read would hide
   * exactly that (DECISIONS.md §21). */
  var WORDS = {
    // the count, which is the screen's whole argument
    dtCountZero: { en: 'Every bus tonight has a driver and a conductor', hi: '' },
    dtCountZeroOne: { en: 'The one bus tonight has a driver and a conductor', hi: '' },
    dtCountOne: { en: '1 bus tonight needs somebody', hi: '' },
    dtCountNeed: { en: { one: '{n} of {t} buses still needs somebody',
                         other: '{n} of {t} buses still need somebody' },
                   hi: { one: '', other: '' } },
    dtCountNone: { en: 'No buses run tonight', hi: '' },
    dtTonight: { en: 'tonight', hi: '' },
    dtOffline: { en: 'No connection — this may be out of date', hi: '' },
    dtError: { en: 'Could not load the duty board', hi: '' },
    dtShown: { en: '{0} of {1} shown', hi: '' },
    dtShownNewest: { en: '{0} of {1} shown, newest first', hi: '' },

    // the tabs
    dtTabTonight: { en: 'Tonight', hi: '' },
    dtTabLookup: { en: 'Who was on a bus', hi: '' },

    // the entry, ticked off the office register
    dtPickHead: { en: 'Which buses run tonight?', hi: '' },
    dtPickHint: { en: 'Tick them off the office register. The board then shows only these.', hi: '' },
    dtPickSearch: { en: 'Search a bus number', hi: '' },
    dtSave: { en: { one: 'Save tonight’s list ({n} bus)', other: 'Save tonight’s list ({n} buses)' },
              hi: { one: '', other: '' } },
    dtSaveNone: { en: 'Tick at least one bus', hi: '' },
    dtSaving: { en: 'Saving…', hi: '' },
    dtSameAsLast: { en: { one: 'Same {n} bus as last night', other: 'Same {n} buses as last night' },
                    hi: { one: '', other: '' } },
    dtSameHint: { en: 'Tap to tick them all, then change what is different.', hi: '' },
    dtEntryRow: { en: { one: '{n} bus tonight', other: '{n} buses tonight' }, hi: { one: '', other: '' } },
    dtEntryBy: { en: 'Saved by {0} at {1}. Tap to change the list.', hi: '' },
    dtEntryNoBy: { en: 'Tap to change the list.', hi: '' },
    dtEmptyHint: { en: 'Saved by {0} at {1}. Tap the row above to change it.', hi: '' },
    dtEmptyHintNoBy: { en: 'Tap the row above to change it.', hi: '' },

    // the three states of a bus in the pick list, each a word AND a mark
    dtNightRunning: { en: 'Runs tonight', hi: '' },
    dtNightOff: { en: 'Somebody said this one does not run tonight', hi: '' },
    dtNightUndecided: { en: 'Nobody has said yet', hi: '' },

    // the three seats
    dtSeatDriver1: { en: 'Driver 1', hi: '' },
    dtSeatDriver2: { en: 'Driver 2', hi: '' },
    dtSeatConductor: { en: 'Conductor', hi: '' },
    dtSeatEmpty: { en: '{0} — empty', hi: '' },
    dtSeatFilled: { en: '{0} — {1}', hi: '' },
    dtSeatPut: { en: 'Tap to put somebody on it', hi: '' },
    dtSeatRelief: { en: 'The relief driver, on night and long routes', hi: '' },
    dtSeatSince: { en: 'On this bus since {0}', hi: '' },
    dtChange: { en: 'Change', hi: '' },

    // the seat sheet
    dtSheetSearch: { en: 'Search a name', hi: '' },
    dtFree: { en: { one: 'Free · {n} night this week', other: 'Free · {n} nights this week' },
              hi: { one: '', other: '' } },
    dtOnBus: { en: 'On {0} as {1}', hi: '' },
    dtNobodyFree: { en: 'Nobody is free tonight', hi: '' },
    dtNobodyFreeHint: { en: 'Everybody active is already on a bus that runs tonight.', hi: '' },
    dtSeatFailed: { en: 'Not saved. Nobody was put on that seat.', hi: '' },
    dtPutting: { en: 'Putting them on…', hi: '' },

    // the gate, six states, every one a mark and a word
    dtGateNone: { en: 'Not checked out yet', hi: '' },
    dtGateNoneOffline: { en: 'Not checked on this phone yet', hi: '' },
    dtGateNoneSub: { en: 'The ten items are on {0}.', hi: '' },
    dtGateOpen: { en: 'Check started {0}', hi: '' },
    dtGateOpenSub: { en: '{0} of {1} answered', hi: '' },
    dtGateAwaiting: { en: 'Waiting for a decision', hi: '' },
    dtGateAwaitingSub: { en: 'Sent {0}', hi: '' },
    dtGateReleased: { en: 'Released {0}', hi: '' },
    dtGateReleasedSub: { en: 'All ten passed · {0}', hi: '' },
    dtGateApproved: { en: 'Allowed out {0}', hi: '' },
    dtGateApprovedSub: { en: 'The decision was go', hi: '' },
    dtGateHeld: { en: 'Held {0}', hi: '' },
    dtGateHeldSub: { en: 'The decision was hold', hi: '' },

    // the lookup
    dtPickBus: { en: 'Choose the bus', hi: '' },
    dtOnDate: { en: 'The date', hi: '' },
    dtShow: { en: 'Show', hi: '' },
    dtLooking: { en: 'Looking…', hi: '' },
    dtLogRow: { en: '{0} — {1}', hi: '' },
    dtLogSub: { en: 'Put on at {0} by {1} · {2}', hi: '' },
    dtLogSubNoBy: { en: 'Put on at {0} · {1}', hi: '' },
    dtLogEmpty: { en: 'Nobody was recorded on that bus that day', hi: '' },
    dtLogHorizon: { en: 'The duty log starts on {0}.', hi: '' },
  };

  /* ---------- the small stuff --------------------------------------------- */

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function has(o, k) { return o != null && Object.prototype.hasOwnProperty.call(o, k); }

  /* THE STORES THIS SCREEN READS, in one place, read by three callers: the
   * model's loaded test, the mount-time read, and the error state's Retry.
   *
   * It was written down ONCE before, inside `retry()` — and `retry()` is only
   * reachable from the error state, while a screen with nothing in its cache is
   * in the LOADING state and draws a skeleton with no button on it. So the one
   * list in the file was in the one function the screen could not get to, the
   * only other caller of `Cache.load` for `nightlist` and `dutylog` in all of
   * v2 was `attention.js`'s seat row kind, and the crew manager holds no
   * Attention (`Caps.screensFor('crewmanager')`). For the one role whose job
   * this screen IS, it was a permanent skeleton with no sequence of taps that
   * changed it — REV-FLOW F2, and §3.6 steps 1, 2, 3 and 5 with it.
   *
   * TWO LISTS AND NOT ONE, because the two questions are different. `STORES` is
   * what the model WAITS for — the five it cannot draw a board without. `READS`
   * is what the mount asks IndexedDB for, and it carries `users` as well:
   * `nameFinder` below turns the id in `savedBy` into a name, and the comment
   * there is explicit that this screen must NOT hold the whole board behind the
   * roster. So the roster is fetched and not waited for, which is the only
   * combination that honours both. */
  var STORES = ['nightlist', 'buses', 'drivers', 'dutylog', 'gatechecks'];
  var READS = STORES.concat(['users']);

  /* Resolved at call time rather than captured at load, the shape v2/night.js's
   * db() uses: these are classic scripts declaring top-level bindings, and a
   * module that captured a neighbour at load would make index.html's order fatal
   * instead of merely wrong. */
  function words() { return typeof root.w === 'function' ? root.w : null; }
  function night() { return (typeof Night !== 'undefined' && Night) || root.Night || null; }
  function caps() { return (typeof Caps !== 'undefined' && Caps) || root.Caps || null; }
  function db() {
    if (typeof DB !== 'undefined' && DB) return DB;
    if (root && root.DB) return root.DB;
    throw new Error('duty.js needs v2/db.js (DB) — not loaded');
  }

  /* `w()` throws on an unregistered id on purpose, and a throw inside a screen's
   * render is the Shell's error state rather than a blank app. But a screen that
   * cannot draw because one word is missing is worse than one that draws its
   * English, so say() falls back to the English beside the id — the same
   * decision, for the same reason, as v2/shell.js's say(). */
  function say(id, n) {
    var t = words();
    if (t) { try { return t(id, n); } catch (e) { /* fall through to the English */ } }
    var e2 = WORDS[id];
    if (!e2) return '';
    var v = e2.en;
    if (typeof v === 'object' && v) v = n === 1 ? v.one : v.other;
    return String(v).replace(/\{n\}/g, n == null ? '' : String(n));
  }

  // A drawing, or nothing when icons.js is not loaded: the words never depend on it.
  function draw(name, size) {
    return typeof root.icon === 'function' ? root.icon(name, { size: size }) : '';
  }

  function fill(s, args) {
    var out = String(s), i;
    for (i = 0; i < args.length; i++) out = out.replace('{' + i + '}', args[i] == null ? '' : String(args[i]));
    return out;
  }

  // say() with {0}/{1}/… filled in, already escaped. Two steps so a name that
  // holds an ampersand cannot reach the page as markup.
  function sayf(id) {
    var args = Array.prototype.slice.call(arguments, 1);
    return esc(fill(say(id), args));
  }

  /* The office's own clock, at the fixed +5:30 above. Digits only, so there is
   * no month or weekday name to be English in a Hindi render and no dependency
   * on whether this browser was built with full ICU — the same trap v2/fmt.js
   * documents for Indian digit grouping. */
  function hhmm(ms) {
    var n = Number(ms);
    if (!isFinite(n)) return '';
    var d = new Date(n + IST_MS);
    var p = function (x) { return (x < 10 ? '0' : '') + x; };
    return p(d.getUTCHours()) + ':' + p(d.getUTCMinutes());
  }

  // A night's key for a timestamp, always through Night.dayKey: the server's
  // _guard_write refuses a record whose date is not its id's suffix, so a date
  // computed here instead of there would file ticks under a night the office
  // does not recognise.
  function dayOf(ms) {
    var N = night();
    return N ? N.dayKey(ms) : '';
  }

  function arr(v) { return Array.isArray(v) ? v : []; }

  /* ---------- reading tonight's record ------------------------------------ */

  /* THE SYNCHRONOUS MIRROR OF Night.running, and it must stay identical to it.
   *
   * `=== true` is not defensive typing. A `running: false` entry and a bus
   * nobody has decided about are both "not running tonight" and neither may be
   * counted — but they are NOT the same thing, and the pick list draws them
   * differently because of it. Anything looser here (`!!`, a truthy test, an
   * `in` test) silently folds the third state into the second, and the entry
   * stops being able to show that nobody has looked at a bus yet. */
  function runningIn(rec) {
    var buses = (rec && rec.buses) || {};
    return Object.keys(buses).filter(function (b) { return buses[b] && buses[b].running === true; });
  }

  /* The three states of one bus in tonight's record. Absent is 'undecided' and
   * NOT 'off': see runningIn above, and v2/night.js's undecided(). */
  function nightStateOf(rec, busId) {
    var buses = (rec && rec.buses) || {};
    if (!has(buses, String(busId))) return 'undecided';
    return buses[String(busId)].running === true ? 'running' : 'off';
  }

  /* Who last touched tonight's record, and when, read off the newest ENTRY
   * rather than off the record. The per-bus `at` and `by` are the server's
   * stamps; the record's own `updatedAt` is DB.put's and belongs to whichever
   * device wrote last, which is not the same question. */
  /* A user id turned into a name, when this device happens to hold the person.
   *
   * The server stamps `by` from the token, so what the record carries is an id
   * like `u-ramesh`. `users` is NOT in the five stores this screen waits for: a
   * screen that refused to draw until it had the roster would hold the whole
   * board behind a name beside one timestamp. So the id is shown when the name
   * is not at hand, which is ugly and true — never blanked, because a blank
   * there reads as "nobody saved it". */
  function nameFinder(cache) {
    var by = {};
    [cache.users, cache.drivers].forEach(function (list) {
      arr(list).forEach(function (u) {
        if (!u || u.id == null || !u.name) return;
        if (!has(by, String(u.id))) by[String(u.id)] = u.name;
      });
    });
    return function (id) {
      if (id == null || String(id) === '') return '';
      return has(by, String(id)) ? by[String(id)] : String(id);
    };
  }

  function savedBy(rec, nameOf) {
    var buses = (rec && rec.buses) || {};
    var best = null;
    Object.keys(buses).forEach(function (b) {
      var e = buses[b];
      if (!e || e.at == null) return;
      if (!best || e.at > best.at) best = e;
    });
    if (!best) return null;
    return { at: best.at, by: nameOf ? nameOf(best.by) : (best.by || '') };
  }

  /* ---------- the seats --------------------------------------------------- */

  var SEAT_KEYS = ['d1', 'd2', 'con'];
  var SEAT_WORD = { d1: 'dtSeatDriver1', d2: 'dtSeatDriver2', con: 'dtSeatConductor' };

  // A dutylog row's seat, which takes the slot from the PERSON's record because
  // dutylog itself has no slot field and this screen may not add one to it (a
  // field v2 invents is erased the next time a v1 device writes that record).
  // An absent driverSlot is read as 1: every seat this screen fills writes an
  // explicit slot, so absent is a legacy row and 1 is the seat it was put in.
  function seatKeyOf(row, byId) {
    if (row.role === 'conductor') return 'con';
    var person = byId[String(row.crewId)];
    var slot = person && person.driverSlot;
    return Number(slot) === 2 ? 'd2' : 'd1';
  }

  /* Tonight's seats, drawn FROM THE NEWEST dutylog ROW and not from the
   * denormalised copy on `buses`. That is a rule and not an optimisation
   * (screens-work.md §4.6, "two people doing it at once" (b)): two people
   * filling one seat is last-write-wins on the person's record and on `buses`,
   * but dutylog is append-only, so BOTH appends survive and the newer one is the
   * truth. Reading `buses.driverCrew` would show whichever write happened to
   * land second on this device.
   *
   * `latest` is every crew member's newest row anywhere, so somebody moved to
   * another bus stops holding the seat on the one they left — an append-only
   * store has no "removed" row, only a newer placement.
   */
  function seatIndex(dutylog, drivers) {
    var byId = {};
    arr(drivers).forEach(function (d) { if (d && d.id != null) byId[String(d.id)] = d; });

    var rows = arr(dutylog).slice().sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
    var latest = {};                            // crewId -> their newest row anywhere
    var perBus = {};                            // busId -> {seat -> row}
    rows.forEach(function (r) {
      if (!r || r.crewId == null) return;
      if (r.role !== 'driver' && r.role !== 'conductor') return;
      latest[String(r.crewId)] = r;
      if (!r.busId) return;
      var bus = String(r.busId);
      var seat = seatKeyOf(r, byId);
      if (!perBus[bus]) perBus[bus] = {};
      perBus[bus][seat] = r;                    // ascending, so the last write wins
    });

    return function (busId) {
      var mine = perBus[String(busId)] || {};
      var out = { d1: null, d2: null, con: null };
      SEAT_KEYS.forEach(function (k) {
        var r = mine[k];
        if (!r) return;
        var now = latest[String(r.crewId)];
        if (!now || String(now.busId) !== String(busId)) return;   // they are on another bus now
        out[k] = { crewId: String(r.crewId), name: r.crewName || '', at: r.at || 0, reason: r.reason || '' };
      });
      return out;
    };
  }

  /* A bus still needs somebody when DRIVER 1 OR THE CONDUCTOR is empty.
   *
   * Driver 2 is deliberately not in this test — see decision 3 in the header. A
   * relief seat that held the count open would make zero unreachable on a fleet
   * that mostly runs one driver, and the zero sentence names exactly "a driver
   * and a conductor". */
  function needsSomebody(seats) {
    return !seats.d1 || !seats.con;
  }

  /* ---------- the gate state, as words ------------------------------------ */

  var GATE_ROW = {
    none: { mark: 'gate', tone: 'dim', t: 'dtGateNone', sub: 'dtGateNoneSub' },
    open: { mark: 'gate', tone: 'warn', t: 'dtGateOpen', sub: 'dtGateOpenSub' },
    awaiting: { mark: 'gate', tone: 'warn', t: 'dtGateAwaiting', sub: 'dtGateAwaitingSub' },
    released: { mark: 'ok', tone: 'ok', t: 'dtGateReleased', sub: 'dtGateReleasedSub' },
    approved: { mark: 'ok', tone: 'ok', t: 'dtGateApproved', sub: 'dtGateApprovedSub' },
    held: { mark: 'bad', tone: 'bad', t: 'dtGateHeld', sub: 'dtGateHeldSub' }
  };

  // The newest check for one bus on one night. §4.6: if one exists in any
  // status it is THE check — screen #13 resumes it and never creates a second,
  // so there is exactly one thing for this row to describe.
  function gateIndex(gatechecks, date) {
    var per = {};
    arr(gatechecks).forEach(function (g) {
      if (!g || !g.busId || String(g.date) !== String(date)) return;
      var k = String(g.busId);
      var cur = per[k];
      if (!cur || (g.startedAt || 0) > (cur.startedAt || 0)) per[k] = g;
    });
    return function (busId) { return per[String(busId)] || null; };
  }

  /* The gate round's own name, read out of Caps.SCREENS rather than written
   * here. One name in the nav, the header and every sentence that points at it;
   * a second spelling of it in this file would be the synonym screens-shell.md
   * §1.6 forbids, and DECISIONS.md §17 makes that table the single place all
   * thirteen names can be verified at once. */
  function gateName() {
    var C = caps();
    var sc = C && C.SCREENS && C.SCREENS.gate;
    if (!sc) return '';
    var t = words();
    if (t && sc.word) { try { return t(sc.word); } catch (e) { /* not registered yet */ } }
    return sc.title || '';
  }

  function answered(check) {
    var items = (check && check.items) || {};
    return Object.keys(items).filter(function (k) { return items[k] && items[k].ok != null; }).length;
  }

  function gateStatus(check) {
    if (!check) return 'none';
    var s = String(check.status || '');
    return has(GATE_ROW, s) ? s : 'open';
  }

  /* ---------- who is free tonight ----------------------------------------- */

  function isActive(p) {
    var s = p && p.status;
    return s == null || s === 'active';          // absent is read as active (03 §3.3)
  }

  function crewRoleOf(p) {
    return (p && p.crewRole === 'conductor') ? 'conductor' : 'driver';   // absent is a driver
  }

  /* Everybody who could take a seat, each with the reason they are not offered
   * when they are not. A person seated elsewhere tonight is DRAWN and
   * unpressable, never hidden: the reader can then see why somebody is not
   * offered rather than wondering where they went.
   *
   * "nights this week" is counted off dutylog's own rows rather than a field,
   * because there is no such field and this screen may not add one. */
  function freeList(m, busId, seat, index) {
    var want = seat === 'con' ? 'conductor' : 'driver';
    var runningIds = index.running;
    var seatsFor = index.seatsFor;
    var busById = index.busById;
    var weekAgo = Date.now() - 7 * 86400000;

    // Where each person is seated on a bus that runs TONIGHT. A seat on a bus
    // that does not run tonight is not a reason to refuse them.
    var taken = {};
    runningIds.forEach(function (b) {
      var s = seatsFor(b);
      SEAT_KEYS.forEach(function (k) {
        if (s[k]) taken[s[k].crewId] = { busId: b, seat: k };
      });
    });

    var nights = {};
    arr(m.cache.dutylog).forEach(function (r) {
      if (!r || !r.busId || (r.at || 0) < weekAgo) return;
      var c = String(r.crewId);
      if (!nights[c]) nights[c] = {};
      nights[c][dayOf(r.at)] = true;
    });

    var out = [];
    arr(m.cache.drivers).forEach(function (p) {
      if (!p || !isActive(p) || crewRoleOf(p) !== want) return;
      var where = taken[String(p.id)] || null;
      var hereAlready = where && String(where.busId) === String(busId) && where.seat === seat;
      if (hereAlready) return;                   // already in this seat: nothing to do
      out.push({
        crewId: String(p.id),
        name: p.name || '',
        nights: Object.keys(nights[String(p.id)] || {}).length,
        where: where,
        whereReg: where ? ((busById[String(where.busId)] || {}).regNo || '') : ''
      });
    });
    // Free first, then by name: the whole point of the sheet is who can take it.
    out.sort(function (a, b) {
      if (!a.where !== !b.where) return a.where ? 1 : -1;
      return String(a.name).localeCompare(String(b.name));
    });
    return out;
  }

  /* ---------- the model --------------------------------------------------- */

  /* One derivation, from the Shell's model and nothing else. `m.cache.<store>`
   * is `undefined` until Cache.load has read it and `[]` when it read an empty
   * store — the difference between "not loaded" and "empty", which is the whole
   * reason ui/states.js exists and the reason the loading state below tests for
   * `undefined` and not for falsiness. */
  function model(m) {
    m = m || {};
    var cache = m.cache || {};
    var C = caps();
    var role = m.role || '';
    var date = dayOf(Date.now());
    var tab = (m.params && m.params.tab === 'lookup') ? 'lookup' : 'tonight';

    var base = {
      kind: 'loading', date: date, tab: tab, offline: m.offline === true, stale: m.stale === true,
      mayAssign: !!(C && C.can && C.can(role, CAP_ASSIGN)),
      mayGate: !!(C && C.can && C.can(role, CAP_GATE)),
      rec: null, prev: null, savedBy: null,
      total: 0, need: 0, buses: [], shown: 0, hidden: 0, pick: [], pickHidden: 0,
      lookup: null
    };

    // A store that read as something other than a list is a broken read, and it
    // is the only error this screen can honestly detect: Cache.load leaves `[]`
    // behind a failure, so "the list is empty" and "the read failed" are the
    // same value and must not be guessed apart.
    var names = STORES;
    var i, v, loaded = true;
    for (i = 0; i < names.length; i++) {
      v = cache[names[i]];
      if (v === undefined) { loaded = false; continue; }
      if (!Array.isArray(v)) { base.kind = 'error'; return base; }
    }
    if (!loaded) return base;

    var buses = arr(cache.buses);
    var busById = {};
    buses.forEach(function (b) { if (b && b.id != null) busById[String(b.id)] = b; });

    var all = arr(cache.nightlist);
    var rec = null, prev = null;
    all.forEach(function (r) {
      if (!r || r.id == null) return;
      if (String(r.date) === date) { rec = r; return; }
      if (String(r.date) < date && (!prev || String(r.date) > String(prev.date))) prev = r;
    });
    base.rec = rec;
    base.prev = prev;
    base.savedBy = savedBy(rec, nameFinder(cache));

    base.lookup = lookupModel(m, date);

    if (!rec) {
      // THE FIRST STATE, and it is not an empty state: there is no record for
      // tonight because nobody has filled the entry in yet, which is a thing to
      // do and not a thing that failed (§4.2).
      base.kind = 'entry';
      base.pick = pickList(buses, rec, prev).slice(0, CAP_ROWS);
      base.pickHidden = Math.max(0, buses.length - base.pick.length);
      return base;
    }

    base.kind = 'board';
    if (m.params && m.params.entry) {
      base.kind = 'entry';
      base.pick = pickList(buses, rec, prev).slice(0, CAP_ROWS);
      base.pickHidden = Math.max(0, buses.length - base.pick.length);
    }

    var ids = runningIn(rec);
    var seatsFor = seatIndex(cache.dutylog, cache.drivers);
    var gateFor = gateIndex(cache.gatechecks, date);

    var cards = ids.map(function (b) {
      var bus = busById[String(b)] || { id: String(b), regNo: String(b) };
      var seats = seatsFor(b);
      var check = gateFor(b);
      return { bus: bus, seats: seats, needs: needsSomebody(seats),
               gate: { status: gateStatus(check), check: check } };
    });
    // The buses that still need somebody first, then by registration: the
    // screen's argument is the count, so the rows that hold it open lead.
    cards.sort(function (a, b) {
      if (a.needs !== b.needs) return a.needs ? -1 : 1;
      return String(a.bus.regNo || '').localeCompare(String(b.bus.regNo || ''));
    });

    base.total = cards.length;
    base.need = cards.filter(function (c) { return c.needs; }).length;
    base.shown = Math.min(cards.length, CAP_ROWS);
    base.hidden = Math.max(0, cards.length - CAP_ROWS);
    base.buses = cards.slice(0, CAP_ROWS);
    base._seatsFor = seatsFor;
    base._busById = busById;
    base._running = ids;
    return base;
  }

  /* `prev` is whether this bus ran LAST night, carried onto the row so the
   * "same as last night" control can pre-tick from the markup rather than from a
   * second pass over the record. It pre-ticks; it does not save. */
  function pickList(buses, rec, prevRec) {
    var ranLast = {};
    runningIn(prevRec).forEach(function (b) { ranLast[b] = true; });
    return arr(buses).slice().sort(function (a, b) {
      return String(a.regNo || a.id).localeCompare(String(b.regNo || b.id));
    }).map(function (b) {
      return { bus: b, night: nightStateOf(rec, b.id), prev: ranLast[String(b.id)] === true };
    });
  }

  function lookupModel(m, today) {
    var p = m.params || {};
    var busId = p.bus == null ? '' : String(p.bus);
    var date = p.date == null ? '' : String(p.date);
    var log = arr(m.cache.dutylog);
    var horizon = null;
    log.forEach(function (r) {
      if (!r || !r.at) return;
      if (horizon === null || r.at < horizon) horizon = r.at;
    });
    var crewById = {};
    arr(m.cache.drivers).forEach(function (d) { if (d && d.id != null) crewById[String(d.id)] = d; });
    var out = { busId: busId, date: date, ready: !!(busId && date), rows: [], shown: 0, hidden: 0,
                gate: null, horizon: horizon === null ? null : dayOf(horizon), today: today,
                crewById: crewById };
    if (!out.ready) return out;
    var rows = log.filter(function (r) {
      return r && String(r.busId) === busId && dayOf(r.at) === date;
    }).sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
    out.shown = Math.min(rows.length, CAP_ROWS);
    out.hidden = Math.max(0, rows.length - CAP_ROWS);
    out.rows = rows.slice(0, CAP_ROWS);
    var gateFor = gateIndex(m.cache.gatechecks, date);
    var g = gateFor(busId);
    if (g) out.gate = { status: gateStatus(g), check: g };
    return out;
  }

  /* ---------- rendering --------------------------------------------------- */

  /* ONE STRING, ONE INSERT. Every helper below returns a fragment and render()
   * joins them; the Shell sets the whole thing with a single
   * insertAdjacentHTML. Per-row appendChild is the shape that cost 277 ms per
   * page (v2-foundation-ui.md §2.3 rule 1). */

  function countLine(v) {
    var mark, kind, text;
    if (v.kind === 'loading') {
      kind = 'unknown';
      mark = draw('clock', 20);
      text = '<span class="dt-count-s">'
        + (typeof root.figure === 'function' ? root.figure(null) : '')
        + ' ' + esc(say('loading')) + '</span>';
    } else if (v.total === 0) {
      // Zero picked is a real and legal answer on a holiday. It is NOT "0 of 0",
      // which reads as a finished day with nothing in it.
      kind = 'none'; mark = draw('bus', 20);
      text = '<span class="dt-count-s">' + esc(say('dtCountNone')) + '</span>';
    } else if (v.need === 0) {
      kind = 'zero'; mark = draw('ok', 20);
      text = '<span class="dt-count-s">'
        + esc(say(v.total === 1 ? 'dtCountZeroOne' : 'dtCountZero')) + '</span>';
    } else if (v.total === 1) {
      kind = 'need'; mark = draw('alert', 20);
      text = '<span class="dt-count-s">' + esc(say('dtCountOne')) + '</span>';
    } else {
      kind = 'need'; mark = draw('alert', 20);
      text = '<span class="dt-count-s">'
        + esc(fill(say('dtCountNeed', v.need), []).replace('{t}', String(v.total))) + '</span>';
    }
    var when = '<span class="dt-when">' + esc(v.date) + ' · ' + esc(say('dtTonight')) + '</span>';
    /* The offline line matters more here than anywhere else on these screens:
     * ANOTHER SUPERVISOR MAY ALREADY HAVE RELEASED A BUS, so the gate words also
     * stop claiming a bus has not been checked (see gateRow). */
    var off = v.offline
      ? '<span class="dt-off">' + draw('offline', 14) + ' ' + esc(say('dtOffline')) + '</span>' : '';
    return '<p class="dt-count" data-count="' + kind + '"><span class="dt-count-m dt-' + kind + '">'
      + mark + '</span>' + text + when + off + '</p>';
  }

  function tabs(v) {
    var one = function (id, word) {
      var on = v.tab === id;
      return '<button type="button" role="tab" class="dt-tab" data-act="tab" data-tab="' + id + '"'
        + ' aria-selected="' + (on ? 'true' : 'false') + '">' + esc(say(word)) + '</button>';
    };
    return '<div class="tabs" role="tablist">' + one('tonight', 'dtTabTonight')
      + one('lookup', 'dtTabLookup') + '</div>';
  }

  var NIGHT_MARK = { running: 'ok', off: 'bus', undecided: 'clock' };
  var NIGHT_WORD = { running: 'dtNightRunning', off: 'dtNightOff', undecided: 'dtNightUndecided' };

  /* The pick list. THREE visual states, not two, because `running: false` is a
   * real state and absent is another one: unknown and no must never look alike
   * (v2-foundation-ui.md §3.6). Each carries its own MARK and its own WORD, so
   * the three are told apart with the colour switched off.
   *
   * The row is a `label.v2row` and never a `button.v2row`: it holds a form
   * control, the whole row is the label so a thumb anywhere on it ticks the box,
   * and that gives a 56px target without a pressable wrapper and without a
   * second handler. */
  function pickRow(p) {
    var st = p.night;
    var checked = st === 'running' ? ' checked' : '';
    return '<label class="v2row dt-pick" data-night="' + st + '">'
      + '<span class="lead dt-night-' + st + '" data-night-mark="' + NIGHT_MARK[st] + '">'
      + draw(NIGHT_MARK[st], 20) + '</span>'
      + '<span class="dt-pick-main"><span class="t">' + esc(p.bus.regNo || p.bus.id) + '</span>'
      + '<span class="sub">' + esc(p.bus.routeLabel || '') + ' · ' + esc(say(NIGHT_WORD[st]))
      + '</span></span>'
      + '<span class="act"><input type="checkbox" class="dt-tick" data-bus="'
      + esc(p.bus.id) + '"' + checked + (p.prev ? ' data-prev="yes"' : '') + ' aria-label="' + esc(p.bus.regNo || p.bus.id) + '"></span>'
      + '</label>';
  }

  function entryPane(v) {
    var out = '<h2 class="dt-h2">' + esc(say('dtPickHead')) + '</h2>'
      + '<p class="dt-hint">' + esc(say('dtPickHint')) + '</p>'
      /* A <label>, not a <div>: `.field` is 48px tall and the input inside it is
       * 22px, so with a div the other 25px was a dead band -- `onField` runs on
       * `input` events, never on click, so tapping the box did nothing at all.
       * A label forwards the tap to the control. `buses.js:994` already had this
       * right. Found by REV-FLOOR, measured: effective target was 309x23. */
      + '<label class="field dt-find"><input type="search" class="dt-search" placeholder="'
      + esc(say('dtPickSearch')) + '" aria-label="' + esc(say('dtPickSearch')) + '"></label>';

    /* Yesterday's list is OFFERED, not copied: one tap pre-ticks, then the
     * person corrects what is different, which is how a register is actually
     * read. It writes nothing — and it is ABSENT when there is no previous
     * night, because a control that would pre-tick nothing is a lie. */
    if (v.prev) {
      var n = runningIn(v.prev).length;
      if (n > 0) {
        out += '<button type="button" class="v2row dt-same" data-act="sameAsLast">'
          + '<span class="lead">' + draw('count', 20) + '</span>'
          + '<span><span class="t">' + esc(say('dtSameAsLast', n)) + '</span>'
          + '<span class="sub">' + esc(say('dtSameHint')) + '</span></span>'
          + '<span class="act">' + draw('add', 20) + '</span></button>';
      }
    }

    var picked = v.pick.filter(function (p) { return p.night === 'running'; }).length;
    out += '<div class="dt-picklist">' + v.pick.map(pickRow).join('') + '</div>';
    if (v.pickHidden) out += moreLine(v.pick.length, v.pick.length + v.pickHidden);

    /* Sticky to the bottom of the content column INSIDE the scroll container,
     * never fixed to the viewport: a bar pinned to a viewport edge reads as a
     * nav, and this screen's nav is the frame's (v2-foundation-ui.md §3.7.1).
     *
     * The label carries the live count, so the person sees what they are
     * committing before they commit it. `aria-disabled` at zero ticked applies
     * to the FIRST entry only: an existing list may legally be emptied — a
     * holiday is a real answer (§4.6 empty (b)) — and a Save that refused zero
     * would make that state unreachable, which is this screen's own defect. */
    var none = picked === 0 && !v.rec;
    out += '<div class="dt-save">'
      + '<button type="button" class="btn btn-primary dt-save-b" data-act="save" data-count="'
      + picked + '" data-first="' + (v.rec ? 'no' : 'yes') + '"'
      + (none ? ' aria-disabled="true"' : '') + '>'
      + esc(say('dtSave', picked)) + '</button>'
      + (none ? '<span class="dt-why">' + esc(say('dtSaveNone')) + '</span>' : '')
      + '</div>';
    return out;
  }

  // The remainder line. "newest first" is only true of the duty-log lookup: the
  // board is ordered by the buses that still need somebody and the pick list by
  // registration, and a line that claimed otherwise would tell the reader the
  // 200 they can see are the 200 that matter.
  function moreLine(shown, total, newest) {
    return '<p class="dt-more">' + sayf(newest ? 'dtShownNewest' : 'dtShown', shown, total) + '</p>';
  }

  // The entry, once the record exists: one row at the top of the board. Naming
  // who saved it and when is the whole mitigation for two people picking at
  // once — a lock is not available and a timestamp tie-break is forbidden, so
  // honest display is what there is (§4.2).
  function entryRow(v) {
    var n = v.total;
    var who = v.savedBy;
    var sub = who && who.by
      ? sayf('dtEntryBy', who.by, hhmm(who.at))
      : esc(say('dtEntryNoBy'));
    return '<button type="button" class="v2row dt-entry" data-act="entry">'
      + '<span class="lead">' + draw('edit', 20) + '</span>'
      + '<span><span class="t">' + esc(say('dtEntryRow', n)) + '</span>'
      + '<span class="sub">' + sub + '</span></span>'
      + '<span class="act">' + draw('more', 20) + '</span></button>';
  }

  /* One seat. A filled seat is pressable (it opens the sheet, and its `.act`
   * holds the one "Change" control a yard row is allowed); an empty one is
   * pressable too and says what tapping it does. Both are ABSENT without
   * assignDriver — a control a person may not use is not drawn, not disabled. */
  function seatRow(card, key) {
    var s = card.seats[key];
    var label = say(SEAT_WORD[key]);
    var warn = !s && key !== 'd2';               // see needsSomebody: d2 never warns
    var t = s ? fill(say('dtSeatFilled'), [label, s.name]) : fill(say('dtSeatEmpty'), [label]);
    var sub = s ? fill(say('dtSeatSince'), [dayOf(s.at)])
                : (key === 'd2' ? say('dtSeatRelief') : say('dtSeatPut'));
    return '<button type="button" class="v2row dt-seat' + (warn ? ' dt-seat-warn' : '') + '"'
      + ' data-act="seat" data-bus="' + esc(card.bus.id) + '" data-seat="' + key + '">'
      + '<span class="lead' + (warn ? ' dt-warn' : '') + '">' + draw('seat', 20) + '</span>'
      + '<span><span class="t">' + esc(t) + '</span><span class="sub">' + esc(sub) + '</span></span>'
      + '<span class="act">' + (s ? '<span class="btn btn-quiet dt-chg">' + esc(say('dtChange'))
        + '</span>' : '') + '</span></button>';
  }

  /* The gate state, and it is a `div.v2row` for EVERYBODY. See the header: the
   * two counts empty at different hours of the evening, so the round is screen
   * #13's and only its words are here. The press is the capability; the sentence
   * is not, and "has this bus left yet" is squarely the crew manager's business.
   *
   * Never colour alone: all six states carry a mark and a word, and --ok /
   * --warn / --bad are the third signal rather than the first. */
  function gateRow(g, offline, opts) {
    opts = opts || {};
    var st = g.status;
    var def = GATE_ROW[st];
    var c = g.check;
    var t, sub;
    if (st === 'none') {
      // Offline, the copy never says "not checked yet", only "not checked on
      // THIS PHONE yet": another supervisor may already have released the bus.
      t = say(offline ? 'dtGateNoneOffline' : 'dtGateNone');
      sub = fill(say('dtGateNoneSub'), [gateName()]);
    } else if (st === 'open') {
      t = fill(say('dtGateOpen'), [hhmm(c && c.startedAt)]);
      sub = fill(say('dtGateOpenSub'), [answered(c), GATE_ITEMS]);
    } else if (st === 'awaiting') {
      t = say('dtGateAwaiting');
      sub = fill(say('dtGateAwaitingSub'), [hhmm((c && c.sentAt) || (c && c.startedAt))]);
    } else if (st === 'released') {
      t = fill(say('dtGateReleased'), [hhmm((c && c.releasedAt) || (c && c.startedAt))]);
      sub = fill(say('dtGateReleasedSub'), [(c && c.driverName) || '']);
    } else if (st === 'approved') {
      t = fill(say('dtGateApproved'), [hhmm((c && c.decision && c.decision.at) || (c && c.startedAt))]);
      sub = say('dtGateApprovedSub');
    } else {
      t = fill(say('dtGateHeld'), [hhmm((c && c.decision && c.decision.at) || (c && c.startedAt))]);
      sub = say('dtGateHeldSub');
    }
    var inner = '<span class="lead dt-' + def.tone + '" data-gate-mark="' + def.mark + '">'
      + draw(def.mark, 20) + '</span>'
      + '<span><span class="t">' + esc(t) + '</span><span class="sub">' + esc(sub) + '</span></span>';
    /* The ONE place the gate is pressable on this screen, and it is a route and
     * not an action: the lookup's read-only link into screen #13, drawn only for
     * a holder of gateCheck. 01 §1.3 records this exact row as a reachability
     * problem today, where the duty lookup linked a crew manager into a screen
     * needing a capability they do not hold. */
    if (opts.navTo && c) {
      /* `data-act`, NOT `data-nav`, and the reason is `attention.js:1116`'s:
       * "the frame's own listener owns `[data-nav]` and would route it with no
       * params, so the row's destination would lose the bus it is about". This
       * row carries `data-check`, and it was the one screen in the thirteen
       * reading `[data-nav]` in its own handler — which worked only while every
       * screen's listener happened to be installed before the frame's. The
       * frame now owns `[data-nav]` alone and nothing that carries it carries a
       * param; the gate checks that no screen reads it. */
      return '<button type="button" class="v2row dt-gate" data-act="gate"'
        + ' data-check="' + esc(c.id) + '" data-to="' + esc(opts.navTo) + '">' + inner
        + '<span class="act">' + draw('back', 20) + '</span></button>';
    }
    return '<div class="v2row dt-gate" data-gate="' + st + '">' + inner + '<span class="act"></span></div>';
  }

  function busCard(v, card) {
    var out = '<article class="card dt-bus"' + (card.needs ? ' data-needs="yes"' : '') + '>'
      + '<p class="dt-bus-h"><span class="dt-bus-m">' + draw('bus', 20) + '</span>'
      + '<span class="dt-reg">' + esc(card.bus.regNo || card.bus.id) + '</span>'
      + '<span class="dt-route">' + esc(card.bus.routeLabel || '') + '</span></p>';
    if (v.mayAssign) out += SEAT_KEYS.map(function (k) { return seatRow(card, k); }).join('');
    out += gateRow(card.gate, v.offline);
    return out + '</article>';
  }

  function boardPane(v) {
    var out = '';
    if (v.mayAssign) out += entryRow(v);
    if (v.total === 0) {
      /* The OTHER empty, and this one IS an empty state: a record was saved with
       * no buses picked. A holiday is a real answer and must not look like a
       * failure, so the hint names who saved it and how to change it. */
      var who = v.savedBy;
      var hint = who && who.by ? fill(say('dtEmptyHint'), [who.by, hhmm(who.at)])
                               : say('dtEmptyHintNoBy');
      return out + (typeof root.emptyState === 'function'
        ? root.emptyState(say('dtCountNone'), { icon: 'bus', hint: hint }) : '');
    }
    out += '<div class="dt-board">' + v.buses.map(function (c) { return busCard(v, c); }).join('') + '</div>';
    if (v.hidden) out += moreLine(v.shown, v.shown + v.hidden);
    return out;
  }

  function lookupPane(v) {
    var L = v.lookup || {};
    var options = '<option value="" disabled' + (L.busId ? '' : ' selected') + '>'
      + esc(say('dtPickBus')) + '</option>'
      + arr(v._busByIdList).map(function (b) {
        return '<option value="' + esc(b.id) + '"' + (String(b.id) === L.busId ? ' selected' : '')
          + '>' + esc(b.regNo || b.id) + '</option>';
      }).join('');
    var out = '<div class="dt-look">'
      + '<select class="select dt-look-bus" aria-label="' + esc(say('dtPickBus')) + '">' + options + '</select>'
      + '<input type="date" class="field dt-look-date" aria-label="' + esc(say('dtOnDate'))
      + '" value="' + esc(L.date || '') + '">'
      + '<button type="button" class="btn dt-look-go" data-act="show"'
      + (L.ready ? '' : ' aria-disabled="true"') + '>' + esc(say('dtShow')) + '</button>'
      + '</div>';
    if (!L.ready) return out;
    if (!L.rows.length) {
      // Naming the horizon so the reader does not read "nobody" as "the bus ran
      // empty". It is read off the oldest row this device holds rather than
      // written down, because the window is the server's and it moves.
      var hint = L.horizon ? fill(say('dtLogHorizon'), [L.horizon]) : null;
      return out + (typeof root.emptyState === 'function'
        ? root.emptyState(say('dtLogEmpty'), hint ? { icon: 'seat', hint: hint } : { icon: 'seat' }) : '');
    }
    // Unpressable: this is a record, not a route.
    out += '<div class="dt-loglist">' + L.rows.map(function (r) {
      // The slot comes from the person's own record, because a dutylog row
      // carries no seat field and this screen may not add one to it.
      var seat = say(SEAT_WORD[seatKeyOf(r, L.crewById || {})]);
      var sub = r.by ? fill(say('dtLogSub'), [hhmm(r.at), r.by, r.reason || ''])
                     : fill(say('dtLogSubNoBy'), [hhmm(r.at), r.reason || '']);
      return '<div class="v2row dt-log">'
        + '<span class="lead">' + draw('person', 20) + '</span>'
        + '<span><span class="t">' + esc(fill(say('dtLogRow'), [r.crewName || '', seat])) + '</span>'
        + '<span class="sub">' + esc(sub) + '</span></span><span class="act"></span></div>';
    }).join('') + '</div>';
    if (L.hidden) out += moreLine(L.shown, L.shown + L.hidden, true);
    if (L.gate) {
      out += '<div class="dt-look-gate">'
        + gateRow(L.gate, v.offline, v.mayGate ? { navTo: 'gate' } : null) + '</div>';
    }
    return out;
  }

  function render(m) {
    var v = model(m);
    // The lookup's bus select needs the fleet in order, which the board model
    // does not otherwise carry.
    v._busByIdList = arr((m && m.cache && m.cache.buses) || []).slice().sort(function (a, b) {
      return String(a.regNo || a.id).localeCompare(String(b.regNo || b.id));
    });

    var pane;
    if (v.kind === 'error') {
      pane = typeof root.errorState === 'function'
        ? root.errorState(say('dtError'), retry) : '';
    } else if (v.tab === 'lookup') {
      pane = lookupPane(v);
    } else if (v.kind === 'loading') {
      pane = typeof root.skeleton === 'function' ? root.skeleton(6) : '';
    } else if (v.kind === 'entry') {
      pane = entryPane(v);
    } else {
      pane = boardPane(v);
    }

    return '<section class="dt" data-screen="' + ID + '" data-replica="'
      + (v.stale ? 'partial' : 'full') + '">'
      + countLine(v) + tabs(v)
      + '<div class="dt-pane" role="tabpanel">' + pane + '</div></section>';
  }

  /* The read, and the only place this screen asks IndexedDB for anything.
   *
   * KICKED FROM `mount()` and from the error state's Retry, never from a render
   * — `Cache.reads()` must not move between two draws of the same data, and a
   * screen that fetched from its draw function is `computeInsights()` at 386 ms
   * per render wearing a different name (`attention.js`'s load says the same).
   *
   * AND IT REDRAWS WHEN IT LANDS. Without the `.then`, the screen only catches
   * up on `boot.js`'s next four-second sync tick, which on a Core 2 Duo is one
   * tick or two of skeleton over rows that are already in memory. `in flight`
   * is tracked so a mount that arrives while a read is settling does not stack
   * a second one over the top of the first. */
  var loading = false;

  function load() {
    var c = root.Cache;
    if (loading || !c || typeof c.load !== 'function') return null;
    loading = true;
    return c.load(READS).then(function () { loading = false; redraw(); },
                              function () { loading = false; });
  }

  /* Only when this screen is still the one on the page: a read that settles
   * after the person has walked to another tab must not mount this one over the
   * top of theirs. */
  function redraw() {
    var R = (typeof Router !== 'undefined' && Router) || root.Router;
    var c = R && R.current ? R.current() : null;
    if (!c || c.id !== ID) return;
    var sh = root.Shell;
    if (sh && typeof sh.mount === 'function') sh.mount(ID, c.params || null);
  }

  // A named function rather than an inline arrow, because errorState's registry
  // is keyed on the function and an inline one would leak an entry per redraw
  // (ui/states.js's RETRY note).
  function retry() { load(); }

  /* ---------- the seat sheet ---------------------------------------------- */

  /* Pure, so the list of who is free is node-testable without a browser: the
   * sheet's markup is a string like everything else here, and mount() is the
   * only thing that hands it to V2.openSheet. */
  function seatSheet(m, busId, seat) {
    var v = model(m);
    var busById = v._busById || {};
    var index = { rec: v.rec, running: v._running || [], seatsFor: v._seatsFor || function () {
      return { d1: null, d2: null, con: null };
    }, busById: busById };
    var people = freeList(m, busId, seat, index);
    // A <label> for the same reason as the pick list's search box above.
    var out = '<label class="field dt-find"><input type="search" class="dt-sheet-search" placeholder="'
      + esc(say('dtSheetSearch')) + '" aria-label="' + esc(say('dtSheetSearch')) + '"></label>';
    if (!people.length) {
      return out + (typeof root.emptyState === 'function'
        ? root.emptyState(say('dtNobodyFree'), { icon: 'person', hint: say('dtNobodyFreeHint') }) : '');
    }
    out += '<div class="dt-sheet-list">' + people.slice(0, CAP_ROWS).map(function (p) {
      var free = !p.where;
      var sub = free ? say('dtFree', p.nights)
        : fill(say('dtOnBus'), [p.whereReg, say(SEAT_WORD[p.where.seat])]);
      var inner = '<span class="lead">' + draw('person', 20) + '</span>'
        + '<span><span class="t">' + esc(p.name) + '</span>'
        + '<span class="sub">' + esc(sub) + '</span></span><span class="act"></span>';
      /* A person already seated elsewhere is DRAWN and unpressable, never
       * hidden: the reader can then see why somebody is not offered rather than
       * wondering where they went. */
      if (!free) return '<div class="v2row dt-person" data-free="no">' + inner + '</div>';
      return '<button type="button" class="v2row dt-person" data-free="yes" data-act="pick"'
        + ' data-bus="' + esc(busId) + '" data-seat="' + esc(seat) + '" data-crew="'
        + esc(p.crewId) + '">' + inner + '</button>';
    }).join('') + '</div>';
    if (people.length > CAP_ROWS) out += moreLine(CAP_ROWS, people.length);
    return out;
  }

  /* ---------- the one write this screen owns ------------------------------ */

  var SLOT_ROLE = { 1: 'driver', 2: 'driver', con: 'conductor', conductor: 'conductor' };

  function slotKey(slot) {
    if (slot === 'conductor' || slot === 'con') return 'con';
    return Number(slot) === 2 ? 'd2' : 'd1';
  }

  /* FILLING ONE SEAT MUST NEVER CLEAR ANOTHER.
   *
   * 05 §4 row 26 is a workaround in the training manual for a same-role
   * seat-clearing bug: the manual currently tells the user that if a bus "looks
   * like it lost its driver after you assigned a conductor, that is a fault,
   * tell the office". So this function reads the stored records, sets THAT ONE
   * SEAT, and puts everything else back untouched — on the person's record and
   * on the bus's denormalised fields both, because the bug had a home in each.
   *
   * Three writes, and the division of fields between them is what makes the flow
   * safe under whole-record last-write-wins:
   *
   *  1. the person's `drivers` record — their bus and their seat;
   *  2. a `dutylog` APPEND, which is the audit and is immutable once written,
   *     even for the owner. `at` is the client's because the store requires a
   *     real time from whoever made the change (04 §4.4); `by` is NOT sent,
   *     because the server forces it from the token and a client's would be
   *     refused. Those two look inconsistent and are not: `at` is a fact about
   *     the change, `by` is a claim about who made it;
   *  3. `buses`, where the denormalised crew fields live. ONLY the field for the
   *     seat being filled is touched. Driver 2 has no field on `buses` and this
   *     screen may not add one — a field v2 invents is erased the next time a v1
   *     device writes that bus — which costs nothing, because the board reads
   *     seats from dutylog and not from here.
   *
   * A failure says what is still true and the seat stays empty. Never an
   * optimistic name that disappears on the next draw.
   */
  async function seat(busId, slot, crewId) {
    var key = slotKey(slot);
    var role = SLOT_ROLE[key === 'con' ? 'con' : (key === 'd2' ? 2 : 1)];
    try {
      var D = db();
      var person = await D.get('drivers', String(crewId));
      if (!person) throw new Error('duty: no crew record for ' + crewId);
      var bus = await D.get('buses', String(busId));
      if (!bus) throw new Error('duty: no bus record for ' + busId);

      /* Was somebody already in it? That makes this a takeover rather than a
       * first assignment, and the two are different rows in the history.
       *
       * The whole roster is read, not just this person: a dutylog row carries no
       * seat slot, so seatIndex takes the slot from each occupant's own
       * `drivers` record, and handing it one record would read every incumbent
       * as sitting in Driver 1 — which would call a Driver 2 takeover an
       * assignment and leave the audit unable to say a seat changed hands. */
      var log = await D.all('dutylog');
      var roster = await D.all('drivers');
      var seatsFor = seatIndex(log, roster);
      var occupied = !!seatsFor(busId)[key];
      var at = Date.now();

      var next = {};
      Object.keys(person).forEach(function (k) { next[k] = person[k]; });
      next.busId = String(busId);
      next.driverSlot = key === 'con' ? null : (key === 'd2' ? 2 : 1);
      await D.put('drivers', next);

      await D.put('dutylog', {
        id: 'dl-' + at.toString(36) + '-' + String(crewId) + '-'
          + Math.random().toString(36).slice(2, 6),
        at: at,
        crewId: String(crewId),
        crewName: person.name || '',
        role: role,
        busId: String(busId),
        regNo: bus.regNo || '',
        reason: occupied ? 'seat-taken' : 'assign'
        // no `by`: the server stamps it from the token (04 §4.4).
      });

      var nextBus = {};
      Object.keys(bus).forEach(function (k) { nextBus[k] = bus[k]; });
      if (key === 'con') nextBus.conductor = person.name || '';
      else if (key === 'd1') nextBus.driverCrew = person.name || '';
      // d2: no field on `buses` exists for the relief seat and none is invented.
      await D.put('buses', nextBus);
      return true;
    } catch (e) {
      if (root.V2 && typeof root.V2.toast === 'function') {
        root.V2.toast(say('dtSeatFailed'), { kind: 'bad' });
      }
      return false;
    }
  }

  /* Save tonight's list: ONE Night.setRunning per bus whose state changed.
   *
   * One key per call is not tidiness — the write is whole-record on the wire, so
   * a save that rewrote every entry would clobber ticks the server had already
   * ordered and leave its per-bus merge nothing to merge (v2/night.js's header).
   * A bus that did not change is not written at all, so two people picking in
   * the same minute lose only the buses they actually disagree about. */
  async function save(date, picks) {
    var N = night();
    if (!N) return false;
    var ids = Object.keys(picks || {});
    var i;
    try {
      for (i = 0; i < ids.length; i++) await N.setRunning(date, ids[i], picks[ids[i]] === true);
      return true;
    } catch (e) {
      if (root.V2 && typeof root.V2.toast === 'function') {
        root.V2.toast(say('dtSeatFailed'), { kind: 'bad' });
      }
      return false;
    }
  }

  /* ---------- mount ------------------------------------------------------- */

  var bound = false;

  function doc() { return (typeof document !== 'undefined' && document) || root.document || null; }

  function go(params) {
    var R = (typeof Router !== 'undefined' && Router) || root.Router;
    if (R && typeof R.go === 'function') R.go(ID, params);
  }

  function paramsNow() {
    var R = (typeof Router !== 'undefined' && Router) || root.Router;
    var c = R && R.current ? R.current() : null;
    return (c && c.params) || {};
  }

  function onClick(ev) {
    var t = ev && ev.target;
    if (!t || typeof t.closest !== 'function') return;

    /* FIRST, and before anything reads `[data-act]` or `[data-nav]`. This screen
     * holds a checkbox per bus and a date input, and a field inside a pressable
     * row is what threw the storekeeper off the screen mid-count
     * (predeploy-gate.sh:508 and the sweep at :1073). The order of these two
     * lines IS the fix. */
    if (t.closest(FIELDS)) return;

    if (!t.closest('[data-screen="' + ID + '"]') && !t.closest('.dt-sheet-list')) return;

    var el = t.closest('[data-act]');
    if (!el) return;
    var act = el.getAttribute('data-act');
    var p = paramsNow();

    if (act === 'gate') {
      /* The gate round, carrying the check it is about. `Router.go` checks the
       * capability like any route, so a crew manager who does not hold
       * `gateCheck` goes nowhere and is told nothing — which is `01 §1.3`'s
       * reachability finding answered by the router rather than by this row. */
      var R = (typeof Router !== 'undefined' && Router) || root.Router;
      if (R && typeof R.go === 'function') {
        R.go(el.getAttribute('data-to'), { check: el.getAttribute('data-check') });
      }
    } else if (act === 'tab') {
      go({ tab: el.getAttribute('data-tab'), bus: p.bus, date: p.date });
    } else if (act === 'entry') {
      go({ tab: 'tonight', entry: 1 });
    } else if (act === 'seat') {
      openSeat(el.getAttribute('data-bus'), el.getAttribute('data-seat'));
    } else if (act === 'pick') {
      takeSeat(el);
    } else if (act === 'sameAsLast') {
      preTick();
    } else if (act === 'save') {
      if (el.getAttribute('aria-disabled') === 'true') return;
      commit(el);
    } else if (act === 'show') {
      if (el.getAttribute('aria-disabled') === 'true') return;
      show(el);
    }
  }

  /* THE SECOND HANDLER, and why there is one.
   *
   * The one-delegated-click-listener rule exists so that a tap on a field cannot
   * move the route. This handler is bound to `input` and `change` and never
   * reads `[data-act]` or `[data-nav]`, so it cannot move the route at all —
   * it is the other side of the same rule rather than an exception to it.
   *
   * It does two things, and both of them have to happen between redraws:
   *
   *  - the Save label's LIVE COUNT. A count that only updated on redraw would
   *    mean the person commits a number they were never shown, which is the
   *    whole reason the number is on the button;
   *  - the search filter. 103 buses is six screenfuls, and a search box that
   *    did nothing until something else redrew the list would be decoration.
   */
  function onField(ev) {
    var t = ev && ev.target;
    if (!t || typeof t.closest !== 'function') return;
    if (t.closest('.dt-find')) { filter(t); return; }
    if (t.closest('.dt-picklist')) recount();
  }

  function recount() {
    var d = doc();
    var list = d && d.querySelector ? d.querySelector('.dt-picklist') : null;
    var btn = d && d.querySelector ? d.querySelector('.dt-save-b') : null;
    if (!list || !btn || !list.querySelectorAll) return;
    /* Every box, not only the visible ones: a bus filtered out of view keeps its
     * tick, so searching for one registration cannot silently drop the
     * twenty-three already ticked off the register. */
    var ticked = list.querySelectorAll('.dt-tick:checked').length;
    btn.textContent = say('dtSave', ticked);
    btn.setAttribute('data-count', String(ticked));
    // The first entry only; see entryPane for why an existing list may be emptied.
    if (btn.getAttribute('data-first') === 'yes' && ticked === 0) {
      btn.setAttribute('aria-disabled', 'true');
    } else {
      btn.removeAttribute('aria-disabled');
    }
  }

  /* Case-insensitive substring, which is the rule the rest of v2 searches by,
   * and `hidden` rather than a class so a filtered row is out of the
   * accessibility tree as well as off the screen.
   *
   * The row's own text is what is matched, read from the markup rather than from
   * the model: this runs between redraws, when the model is not in hand, and a
   * name is stored as it was typed (`FULE FILTER` stays `FULE FILTER`). */
  function filter(input) {
    var box = input.closest('.dt-find');
    var scope = box && box.parentNode;
    if (!scope || !scope.querySelectorAll) return;
    var q = String(input.value == null ? '' : input.value).toLowerCase().trim();
    var rows = scope.querySelectorAll('.dt-pick, .dt-person');
    var i, text;
    for (i = 0; i < rows.length; i++) {
      if (!q) { rows[i].hidden = false; continue; }
      text = String(rows[i].textContent || '').toLowerCase();
      rows[i].hidden = text.indexOf(q) < 0;
    }
  }

  function ticks() {
    var d = doc();
    var list = d && d.querySelector ? d.querySelector('.dt-picklist') : null;
    if (!list || !list.querySelectorAll) return null;
    var out = {}, boxes = list.querySelectorAll('.dt-tick'), i;
    for (i = 0; i < boxes.length; i++) out[boxes[i].getAttribute('data-bus')] = !!boxes[i].checked;
    return out;
  }

  function preTick() {
    var d = doc();
    var list = d && d.querySelector ? d.querySelector('.dt-picklist') : null;
    if (!list || !list.querySelectorAll) return;
    var boxes = list.querySelectorAll('.dt-tick'), i;
    for (i = 0; i < boxes.length; i++) {
      if (boxes[i].getAttribute('data-prev') === 'yes') boxes[i].checked = true;
    }
    recount();
  }

  async function commit(btn) {
    var picks = ticks();
    if (!picks) return;
    var N = night();
    btn.setAttribute('aria-disabled', 'true');
    btn.textContent = say('dtSaving');
    await save(N ? N.dayKey() : '', picks);
    go({ tab: 'tonight' });
  }

  function show(btn) {
    var d = doc();
    var sel = d && d.querySelector ? d.querySelector('.dt-look-bus') : null;
    var date = d && d.querySelector ? d.querySelector('.dt-look-date') : null;
    // The read is local and usually instant, but on 418 duty-log rows on a Core
    // 2 Duo it is not: a button that said nothing would be pressed twice.
    if (btn) { btn.setAttribute('aria-disabled', 'true'); btn.textContent = say('dtLooking'); }
    go({ tab: 'lookup', bus: sel ? sel.value : '', date: date ? date.value : '' });
  }

  function shellModel() {
    var S2 = (typeof S !== 'undefined' && S) || root.S || {};
    var B = root.Boot || null;
    return {
      route: ID, params: paramsNow(),
      role: (S2.user && S2.user.role) || '',
      density: B && B.density ? B.density() : 'yard',
      user: S2.user || null, cache: S2.cache || {},
      replica: B && B.replica ? B.replica() : { complete: true },
      stale: !!(B && B.replica && B.replica().complete !== true),
      offline: typeof navigator !== 'undefined' && navigator && navigator.onLine === false
    };
  }

  function openSeat(busId, seatKey) {
    var V = root.V2;
    if (!V || typeof V.openSheet !== 'function') return;
    var m = shellModel();
    var v = model(m);
    var bus = (v._busById || {})[String(busId)] || { id: busId, regNo: busId };
    V.openSheet(fill(say('dtSeatFilled'), [say(SEAT_WORD[slotKey(seatKey)]), bus.regNo || bus.id]),
      seatSheet(m, busId, slotKey(seatKey)));
  }

  async function takeSeat(el) {
    /* The row says what is happening to it while the three writes are in
     * flight, and the sheet stops taking a second tap. `aria-disabled` here is
     * the one case the foundation allows it — a write in flight, with the label
     * saying what is happening — and not a control somebody may not use. */
    el.setAttribute('aria-disabled', 'true');
    var label = el.querySelector ? el.querySelector('.sub') : null;
    if (label) label.textContent = say('dtPutting');
    var ok = await seat(el.getAttribute('data-bus'), el.getAttribute('data-seat'),
                        el.getAttribute('data-crew'));
    var V = root.V2;
    if (V && typeof V.closeSheet === 'function') V.closeSheet();
    if (ok) go(paramsNow());
  }

  function mount() {
    /* THE READ IS THE FIRST STATEMENT, above the listener guard, and the
     * reason is independence rather than a live defect. `Shell.mount` calls
     * `unmount()` on the way out and every `unmount()` here clears that guard,
     * so a read placed below it does in fact run on each entry today — a
     * mutant that moved this line down survived, which is how that was
     * established rather than assumed. What the position buys is that the read
     * no longer DEPENDS on the teardown having run: a screen whose `unmount`
     * is skipped, or whose guard is reset on a different path tomorrow, would
     * otherwise silently stop re-reading, and the symptom would be a figure
     * one tick stale rather than anything that looks like a bug.
     *
     * Asking on every entry is cheap: `Cache.load` skips a store that cannot
     * have changed since the last read (`v2/db.js`'s dirty marks), so this
     * costs a dirty-flag lookup and no `getAll` when nothing has moved. */
    load();
    var d = doc();
    if (!d || typeof d.addEventListener !== 'function') return false;
    if (bound) return true;
    bound = true;
    d.addEventListener('click', onClick);
    /* One handler, two event types. `input` is what makes the search live and
     * the count honest while a thumb is still on the box; `change` is the
     * belt-and-braces half for a browser that fires only one of them. Neither
     * can move the route — see onField. */
    d.addEventListener('input', onField);
    d.addEventListener('change', onField);
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
    }
    bound = false;
    return true;
  }

  /* ---------- registration ------------------------------------------------ */

  if (root.W && typeof root.W.register === 'function') root.W.register(WORDS);

  var api = {
    render: render,
    model: model,
    seat: seat,
    save: save,
    seatSheet: seatSheet,
    mount: mount,
    unmount: unmount,
    // Test seam only, the shape of Router._reset: a node suite cannot reload a
    // classic script per case.
    _reset: function () { bound = false; loading = false; }
  };

  if (root.Router && typeof root.Router.register === 'function') root.Router.register(ID, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Duty = api;
})(typeof window !== 'undefined' ? window : this);

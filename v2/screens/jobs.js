/* Garage Saathi v2 — screen #3, Jobs. Plain script, no module system.
 * Test: test_v2_work.js. Spec: docs/v2/plan/screens-work.md section 2.
 *
 * "What is standing in the yard, for how long, and has it been started?" A row
 * answers three things — which bus, how long, started or not — and the fourth
 * tap opens the card. The card's contents are not on this screen.
 *
 * THE MECHANIC'S OWN-CARDS RULE IS NOT IN THIS FILE, AND THAT IS THE POINT.
 * It is `Jobcard.guard(card, me)`, and this screen's list builder calls it —
 * inside the function that produces the array, before any markup exists, which
 * is v2-ux.md section 4.3's "narrowed in the query, not in the view". The rule
 * leaked once because it was written twice (`c5c11a1`: `mine` was computed and
 * never enforced), so this file deliberately contains no idea of its own about
 * who is on a job: it does not read the crew fields and it does not compare an
 * id. If the guard is wrong, both screens are wrong together, which is the only
 * failure mode worth having.
 *
 * ONE DELEGATED LISTENER, returning early on
 * `closest('input, select, textarea, label, .num')` BEFORE it reads [data-act]
 * or [data-nav] — the new-card sheet carries an odometer .num, and
 * predeploy-gate.sh:508-511 already tests this regression.
 */
(function (root) {
  'use strict';

  var ID = 'jobs';

  /* The yard cap. Over this the list draws the oldest 200 and says so, because
   * at yard the row is two lines on purpose and windowing needs a row height it
   * can compute without measuring. The number is sized against a PLACEHOLDER
   * set on a developer's Mac — the office PC (Windows 7, Chrome 109, Core 2
   * Duo) has not been measured, DECISIONS.md section 9 says so, and
   * v2-frontend-slices.md section 5 names this slice as one whose design rests
   * on that reading. Tighten or loosen it when the reading exists. */
  var YARD_CAP = 200;
  var STALE_H = 48;                    // hours standing before the mark turns --bad

  var WORDS = {
    jbNewCard: { en: 'New job card', hi: '' },
    jbTabOpen: { en: 'Open', hi: '' },
    jbTabDone: { en: 'Completed', hi: '' },
    jbTabAway: { en: 'Away for repair', hi: '' },
    jbTabWorkload: { en: 'Mechanic workload', hi: '' },
    jbStanding: { en: '{n} standing', hi: '' },
    jbOpenBtn: { en: 'Open', hi: '' },
    jbNotStarted: { en: 'not started', hi: '' },
    jbStartedAt: { en: 'started {time}', hi: '' },
    jbNobodyYet: { en: 'Nobody on it yet', hi: '' },
    jbEnterMissing: { en: 'Enter time not recorded', hi: '' },
    jbBadgeNotStarted: { en: 'Not started', hi: '' },
    jbBadgeStarted: { en: 'Started', hi: '' },
    jbCapLine: { en: '{shown} of {total} shown, oldest first. Use a filter to narrow this.', hi: '' },
    jbNoConn: { en: 'No connection since {time}', hi: '' },
    /* AND THE SAME SENTENCE WITH NO TIME IN IT, because a phone that has never
     * sent anything has no "since". REV-FLOW F6 was `lastSyncAt` seeded to 0
     * rather than null, so the epoch rendered as a clock time and this read
     * "No connection since 05:30" on a device that had never synced. With the honest
     * null the one above would render with an empty slot instead — a dangling
     * sentence, which is the same defect wearing better manners — so there are
     * two words for the two facts. */
    jbNoConnEver: { en: 'This phone has not sent anything yet', hi: '' },
    jbHoursShort: { en: '{h} h', hi: '' },
    jbDaysShort: { en: '{d} d', hi: '' },
    jbWorkSub: { en: '{open} open · {rework} rework · {days} days average turnaround', hi: '' },

    jbEmptyOpen: { en: 'Nothing standing in the yard', hi: '' },
    jbEmptyOpenHint: { en: 'Every bus is on the road.', hi: '' },
    jbEmptyDone: { en: 'No cards completed yet', hi: '' },
    jbEmptyAway: { en: 'No cards away for repair', hi: '' },
    jbEmptyWorkload: { en: 'No mechanics on the roll', hi: '' },
    jbEmptyWorkloadHint: { en: 'Add people in People.', hi: '' },
    jbEmptyMine: { en: 'No cards for you', hi: '' },
    jbEmptyMineHint: { en: 'The supervisor will put your name on one.', hi: '' },

    jbSheetTitle: { en: 'New job card', hi: '' },
    jbChooseBus: { en: 'Choose the bus', hi: '' },
    jbFault: { en: 'What is wrong?', hi: '' },
    jbPriority: { en: 'How urgent?', hi: '' },
    jbPrioHigh: { en: 'High', hi: '' },
    jbPrioMedium: { en: 'Medium', hi: '' },
    jbPrioLow: { en: 'Low', hi: '' },
    jbCrew: { en: 'Who is on it?', hi: '' },
    jbNobody: { en: 'Nobody yet', hi: '' },
    jbOdo: { en: 'Odometer reading', hi: '' },
    jbSave: { en: 'Save', hi: '' },
    jbSaving: { en: 'Saving...', hi: '' },

    jbThMechanic: { en: 'Mechanic', hi: '' },
    jbThOpen: { en: 'Open', hi: '' },
    jbThRework: { en: 'Rework', hi: '' },
    jbThDays: { en: 'Days', hi: '' }
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

  function jc() { return root.Jobcard || null; }
  function caps() { return root.Caps || null; }
  function can(role, cap) { var c = caps(); return !!(c && c.can(role, cap)); }
  function draw(name, size) { return typeof root.icon === 'function' ? root.icon(name, { size: size }) : ''; }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fig(v, o) { return typeof root.figure === 'function' ? root.figure(v, o) : ''; }

  function rowsOf(m, name) { return (m && m.cache && m.cache[name]) || []; }
  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i];
    return null;
  }
  function regOf(buses, id) { var b = byId(buses, id); return b ? (b.regNo || b.id) : String(id || ''); }
  function nameOf(users, id) { var u = byId(users, id); return u ? (u.name || u.id) : ''; }

  function hhmm(ms) {
    if (ms == null) return '';
    var d = new Date(Number(ms));
    if (isNaN(d.getTime())) return '';
    var h = d.getHours(), mi = d.getMinutes();
    return (h < 10 ? '0' : '') + h + ':' + (mi < 10 ? '0' : '') + mi;
  }

  /* "20 h" under 48 hours and "3 d" over, so the number is never "72 h". Given
   * to figure() as a `format`, never applied before it: formatting first is
   * exactly how an unknown reads as a zero. */
  function idleWords(ms) {
    var h = Math.floor(Number(ms) / 3600000);
    if (h < STALE_H) return say('jbHoursShort', { h: h });
    return say('jbDaysShort', { d: Math.floor(h / 24) });
  }

  function lastSyncAt() {
    var s = root.Sync;
    if (!s || typeof s.info !== 'function') return null;
    try { var i = s.info(); return i && i.lastSyncAt ? i.lastSyncAt : null; } catch (e) { return null; }
  }

  /* ====================================================================== *
   * THE QUERY. Everything a row needs, and nothing a row may not have.
   * ====================================================================== */

  var FILTERS = ['open', 'done', 'away', 'workload'];
  var current = 'open';                // local, never a route: a back press must leave the screen

  function filter(id) {
    if (FILTERS.indexOf(String(id)) >= 0) current = String(id);
    return current;
  }

  function closed(c) { return c.status === 'done' || c.status === 'verified'; }
  function away(c) { return !!c.externalVendor; }

  function matches(c, which) {
    if (which === 'done') return closed(c);
    if (which === 'away') return away(c) && !closed(c);
    // Open is what is standing IN THE YARD, so a card away for repair is not in
    // it — that is what the Away tab is for, and "Every bus is on the road" is
    // the empty line this tab promises.
    return !closed(c) && !away(c);
  }

  /* The list, narrowed and ordered. THE NARROWING IS HERE, inside the function
   * that produces the array: `Jobcard.guard` is the one own-cards rule and this
   * is one of its two call sites. */
  function visible(m) {
    var me = (m && m.user) || null;
    var all = rowsOf(m, 'jobcards');
    var g = jc();
    var out = [];
    for (var i = 0; i < all.length; i++) {
      if (!all[i] || all[i]._deleted) continue;
      if (g && !g.guard(all[i], me)) continue;    // the rule, once, for both screens
      out.push(all[i]);
    }
    return out;
  }

  /* enterAt ascending, nulls LAST and flagged. A card with no enter time is not
   * a zero-hour card: "unknown" and "zero" must never look alike, so it sorts
   * to the end and its figure is a dash. */
  function byEnter(a, b) {
    var x = a.enterAt, y = b.enterAt;
    if (x == null && y == null) return String(a.id).localeCompare(String(b.id));
    if (x == null) return 1;
    if (y == null) return -1;
    return x - y || String(a.id).localeCompare(String(b.id));
  }

  function viewRow(c, m, users, buses, now) {
    var started = c.startAt != null;
    var idle = c.enterAt == null ? null : now - c.enterAt;
    var tone = started ? 'dim' : (idle != null && idle > STALE_H * 3600000 ? 'bad' : 'warn');
    var crew = jc() ? jc().crew(c) : [];
    var who = crew.length ? nameOf(users, crew[0].userId) : '';
    var task = crew.length ? crew[0].task : '';
    var sub;
    if (c.enterAt == null) sub = say('jbEnterMissing');
    else if (!who) sub = say('jbNobodyYet');
    else sub = who + (task ? ' — ' + task : '')
      + ' · ' + (started ? say('jbStartedAt', { time: hhmm(c.startAt) }) : say('jbNotStarted'));
    return { id: c.id, reg: regOf(buses, c.busId), fault: c.problem || '', who: who, task: task,
             idle: idle, tone: tone, started: started, sub: sub };
  }

  function model(m) {
    register();
    var me = (m && m.user) || null;
    var role = me ? String(me.role) : null;
    var loading = !(m && m.cache) || m.cache.jobcards === undefined;
    var which = filter(m && m.filter);
    var users = rowsOf(m, 'users'), buses = rowsOf(m, 'buses');
    var now = Date.now();

    var mine = loading ? [] : visible(m);
    var open = 0, i;
    for (i = 0; i < mine.length; i++) if (matches(mine[i], 'open')) open++;

    var picked = [];
    for (i = 0; i < mine.length; i++) if (matches(mine[i], which)) picked.push(mine[i]);
    picked.sort(byEnter);

    var total = picked.length;
    var shown = picked.slice(0, YARD_CAP);
    var out = [];
    for (i = 0; i < shown.length; i++) out.push(viewRow(shown[i], m, users, buses, now));

    return {
      loading: loading, filter: which, role: role, me: me,
      density: (m && m.density) || 'yard',
      offline: !!(m && m.offline), stale: !!(m && m.stale),
      at: lastSyncAt(),
      rows: out, total: total, open: open, capped: total > YARD_CAP,
      hasAny: mine.length > 0,
      workload: which === 'workload' ? workload(mine, users) : [],
      // The Mechanic workload tab is ABSENT for a mechanic — not empty, not
      // showing only themselves. It answers "who should take this job", which
      // is not a mechanic's question, and one row would read as a list of their
      // colleagues with the colleagues removed.
      tabs: role === 'mechanic' ? FILTERS.slice(0, 3)
        : (can(role, 'viewScoreboard') ? FILTERS : FILTERS.slice(0, 3)),
      mayAdd: can(role, 'addJob')
    };
  }

  /* Three numbers, never blended into one score — [E] 38e1914: "who should take
   * this job" is not a question one score answers. */
  function workload(cards, users) {
    var by = {}, g = jc(), i, j;
    for (i = 0; i < cards.length; i++) {
      var crew = g ? g.crew(cards[i]) : [];
      for (j = 0; j < crew.length; j++) {
        var k = crew[j].userId;
        if (!by[k]) by[k] = { id: k, name: nameOf(users, k), open: 0, rework: 0, spanMs: 0, spans: 0 };
        if (!closed(cards[i])) by[k].open++;
        if (cards[i].rework) by[k].rework++;
        if (cards[i].enterAt != null && cards[i].outAt != null) {
          by[k].spanMs += cards[i].outAt - cards[i].enterAt;
          by[k].spans++;
        }
      }
    }
    var out = [];
    Object.keys(by).forEach(function (k) {
      var e = by[k];
      e.days = e.spans ? Math.round(e.spanMs / e.spans / 86400000) : null;
      out.push(e);
    });
    out.sort(function (a, b) { return b.open - a.open || String(a.name).localeCompare(String(b.name)); });
    return out;
  }

  /* ====================================================================== *
   * render
   * ====================================================================== */

  function tabs(v) {
    var out = '', i;
    var label = { open: 'jbTabOpen', done: 'jbTabDone', away: 'jbTabAway', workload: 'jbTabWorkload' };
    for (i = 0; i < v.tabs.length; i++) {
      var id = v.tabs[i], on = id === v.filter;
      out += '<button type="button" role="tab" aria-selected="' + (on ? 'true' : 'false') + '"'
        + ' data-filter="' + id + '">' + esc(say(label[id])) + '</button>';
    }
    return '<div class="tabs jb-tabs" role="tablist">' + out + '</div>';
  }

  /* The freshness line, and the ONLY place on this screen an age appears. A
   * list states its freshness ONCE, in its header: `at` on a figure inside a
   * row adds .figure-note as a block element, triples the row height and runs
   * the age words once per row (foundation section 2.3 rule 4).
   *
   * This is also the screen's one AGGREGATE, so it is the one figure that
   * carries `stale` while the device is still filling. A row's standing time is
   * a per-record reading and is not made stale by a short replica — and marking
   * it so would put a .figure-note in every row, which is the rule above. */
  function fresh(v) {
    if (v.loading) {
      return '<p class="jb-fresh">' + esc(typeof root.w === 'function' ? root.w('loading') : '') + '</p>';
    }
    var count = fig(v.open, { at: v.offline ? null : v.at, stale: v.stale,
                              format: function (n) { return say('jbStanding', null, n).replace('{n}', n); } });
    var when = hhmm(v.at);
    var tail = v.offline
      ? ' <span class="jb-off">' + draw('offline', 14) + ' '
        + esc(when === '' ? say('jbNoConnEver') : say('jbNoConn', { time: when })) + '</span>'
      : '';
    return '<p class="jb-fresh">' + count + tail + '</p>';
  }

  /* The row. At yard it is two lines and `.act` carries EXACTLY ONE thing — the
   * standing time. At desk the row is one line (foundation section 2.1: a
   * two-line desk row is 49.3px in Hindi and breaks windowing's only
   * assumption), the `.sub` is not rendered at all, and what it said moves into
   * `.act` beside the badge and an Open control — because a 32px row is a small
   * thing to hit with a mouse and the office reads with a mouse.
   *
   * The mechanic's NAME is not on a desk row. It is behind the Mechanic
   * workload tab, which is the one place density pays. */
  function listRows(v) {
    var desk = v.density === 'desk';
    var out = '', i;
    for (i = 0; i < v.rows.length; i++) {
      var r = v.rows[i];
      var act = fig(r.idle, { format: idleWords });
      if (desk) {
        act += '<span class="badge badge-' + (r.started ? 'ok' : 'warn') + '">'
          + draw(r.started ? 'ok' : 'clock', 14) + ' '
          + esc(r.started ? say('jbBadgeStarted') : say('jbBadgeNotStarted')) + '</span>'
          + '<span class="btn btn-quiet jb-open">' + esc(say('jbOpenBtn')) + '</span>';
      }
      out += '<button class="v2row" type="button" data-card="' + esc(r.id) + '">'
        + '<span class="lead jb-' + r.tone + '">' + draw('job', desk ? 16 : 20) + '</span>'
        + '<span class="t">' + esc(r.reg + ' — ' + r.fault) + '</span>'
        + (desk ? '' : '<span class="sub">' + esc(r.sub) + '</span>')
        + '<span class="act">' + act + '</span></button>';
    }
    return out;
  }

  /* Mechanic workload at desk is a .table, because that is the one place
   * density pays and the office reads tables. Three numbers, right-aligned in
   * td.fig, NEVER blended into one score — [E] 38e1914: "who should take this
   * job" is not a question one score answers. */
  function workloadTable(v) {
    var out = '<tr><th>' + esc(say('jbThMechanic')) + '</th>'
      + '<th class="fig">' + esc(say('jbThOpen')) + '</th>'
      + '<th class="fig">' + esc(say('jbThRework')) + '</th>'
      + '<th class="fig">' + esc(say('jbThDays')) + '</th></tr>';
    for (var i = 0; i < v.workload.length; i++) {
      var e = v.workload[i];
      out += '<tr><td>' + esc(e.name) + '</td>'
        + '<td class="fig">' + fig(e.open) + '</td>'
        + '<td class="fig">' + fig(e.rework) + '</td>'
        + '<td class="fig">' + fig(e.days) + '</td></tr>';
    }
    return '<table class="table jb-work">' + out + '</table>';
  }

  function workloadRows(v) {
    if (v.density === 'desk') return workloadTable(v);
    var out = '', i;
    for (i = 0; i < v.workload.length; i++) {
      var e = v.workload[i];
      out += '<button class="v2row" type="button" data-act="jobsMechanic" data-who="' + esc(e.id) + '">'
        + '<span class="lead">' + draw('person', 20) + '</span>'
        + '<span class="t">' + esc(e.name) + '</span>'
        + '<span class="sub">' + esc(say('jbWorkSub', { open: e.open, rework: e.rework,
                                                        days: e.days == null ? '—' : e.days })) + '</span>'
        + '<span class="act">' + fig(e.open) + '</span></button>';
    }
    return out;
  }

  function empty(v) {
    if (typeof root.emptyState !== 'function') return '';
    if (v.filter === 'workload') {
      return root.emptyState(say('jbEmptyWorkload'), { icon: 'person', hint: say('jbEmptyWorkloadHint') });
    }
    if (v.filter === 'done') return root.emptyState(say('jbEmptyDone'), { icon: 'job' });
    if (v.filter === 'away') return root.emptyState(say('jbEmptyAway'), { icon: 'map' });
    if (v.role === 'mechanic') {
      return root.emptyState(say('jbEmptyMine'), { icon: 'ok', hint: say('jbEmptyMineHint') });
    }
    return root.emptyState(say('jbEmptyOpen'), { icon: 'ok', hint: say('jbEmptyOpenHint') });
  }

  function body(v) {
    if (v.loading) return typeof root.skeleton === 'function' ? root.skeleton(8) : '';
    /* Offline KEEPS the rows — they are from the local database and they are
     * real; only their age is in question, and the freshness line carries that.
     * offlineState replaces the list only when there is no local data at all. */
    if (!v.hasAny && v.offline) {
      return typeof root.offlineState === 'function' ? root.offlineState() : '';
    }
    if (v.filter === 'workload') return v.workload.length ? workloadRows(v) : empty(v);
    if (!v.rows.length) return empty(v);
    var out = listRows(v);
    // At yard the row is two lines on purpose, so over the cap the list says so.
    // At desk it is one line and the cap line is not drawn.
    if (v.capped && v.density !== 'desk') {
      out += '<p class="jb-cap">' + esc(say('jbCapLine', { shown: v.rows.length, total: v.total })) + '</p>';
    }
    return out;
  }

  function render(m) {
    var v = model(m);
    // The New job button is absent — not disabled — without addJob. The server
    // also lets `store` create a card (`inventory/02 section 4.4`, "where the
    // server is looser"), so the client is the only thing stopping a
    // storekeeper, and that is worth knowing rather than relying on.
    var add = v.mayAdd
      ? '<button type="button" class="btn btn-primary jb-new" data-act="jobNew">'
        + draw('add', 20) + ' ' + esc(say('jbNewCard')) + '</button>'
      : '';
    return '<div class="jb">' + fresh(v) + add + tabs(v)
      + '<div class="jb-list">' + body(v) + '</div></div>';
  }

  /* The new-card sheet. The card is created on the FIRST screen, so an
   * interrupted entry leaves a card and not a draft ([E] 4f0691e) — which is
   * why a card with a bus and a fault and nothing else is a real row on this
   * list rather than a draft state.
   *
   * The bus select's first option is a disabled prompt and nothing is
   * pre-selected; the odometer is never pre-filled with 0, because a default 0
   * on an odometer is a wrong reading nobody typed. */
  function newSheet(buses, users) {
    var b = '<option value="" disabled>' + esc(say('jbChooseBus')) + '</option>', i;
    for (i = 0; i < (buses || []).length; i++) {
      b += '<option value="' + esc(buses[i].id) + '">' + esc(buses[i].regNo || buses[i].id) + '</option>';
    }
    var c = '<option value="">' + esc(say('jbNobody')) + '</option>';
    for (i = 0; i < (users || []).length; i++) {
      if (users[i].role !== 'mechanic') continue;
      c += '<option value="' + esc(users[i].id) + '">' + esc(users[i].name || users[i].id) + '</option>';
    }
    var p = '';
    var prio = [['high', 'jbPrioHigh'], ['medium', 'jbPrioMedium'], ['low', 'jbPrioLow']];
    for (i = 0; i < prio.length; i++) {
      p += '<option value="' + prio[i][0] + '">' + esc(say(prio[i][1])) + '</option>';
    }
    return '<form class="jb-sheet" data-sheet="newjob">'
      + '<label class="num"><span class="num-l">' + esc(say('jbChooseBus')) + '</span>'
      + '<select class="select" data-field="busId">' + b + '</select></label>'
      + '<label class="num"><span class="num-l">' + esc(say('jbFault')) + '</span>'
      + '<textarea class="field" rows="3" data-field="problem"></textarea></label>'
      + '<label class="num"><span class="num-l">' + esc(say('jbPriority')) + '</span>'
      + '<select class="select" data-field="priority">' + p + '</select></label>'
      + '<label class="num"><span class="num-l">' + esc(say('jbCrew')) + '</span>'
      + '<select class="select" data-field="crew">' + c + '</select></label>'
      + '<label class="num"><span class="num-l">' + esc(say('jbOdo')) + '</span>'
      + '<input class="field num-in" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off"'
      + ' enterkeyhint="done" data-kind="whole" data-field="odometer">'
      + '</label>'
      + '<button type="button" class="btn btn-primary jb-wide" data-act="jobNewSave">'
      + esc(say('jbSave')) + '</button></form>';
  }

  /* ====================================================================== *
   * ONE delegated listener
   * ====================================================================== */

  var handler = null;

  /* THE STORES THIS SCREEN READS. All three are in `PullApply.FIRST_STORES`, so
   * unlike Today, Money, the Duty board and five others this screen was NOT
   * among REV-FLOW F3's casualties — its rows arrive behind the first paint.
   *
   * IT ASKS ANYWAY, AND THAT IS THE POINT. "Every screen reads its own stores
   * when the frame mounts it" is a rule a check can hold all thirteen to;
   * "every screen that happens to need it does" is a rule whose exceptions have
   * to be remembered, and the eight screens that were missing a read were
   * missing it because nobody was holding a list. `Cache.load` skips a store
   * that cannot have changed since the last read (`v2/db.js`'s dirty marks), so
   * for a screen whose stores are already in hand this costs a dirty-flag
   * lookup and no `getAll` at all. */
  var STORES = ['jobcards', 'buses', 'users'];

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
    var cur = root.Router && root.Router.current ? root.Router.current() : null;
    if (!cur || cur.id !== ID) return;
    if (root.Shell && typeof root.Shell.mount === 'function') root.Shell.mount(ID, cur.params || null);
  }

  function mount() {
    // The read is the first statement, above the listener guard. `duty.js`'s
    // mount says why the position and not the guard is the point.
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

  function onClick(ev) {
    var t = ev && ev.target;
    if (!t || typeof t.closest !== 'function') return;

    /* THE EARLY RETURN, before [data-act] or [data-nav] is read. The new-card
     * sheet holds a .num and two selects, and a field whose click reached the
     * row handler is what threw the storekeeper off the screen mid-count. */
    if (t.closest('input, select, textarea, label, .num')) return;

    var tab = t.closest('[data-filter]');
    if (tab) {
      // A filter changes what is drawn and NEVER pushes a route: a back press
      // must leave the screen, not walk back through filters.
      if (ev.preventDefault) ev.preventDefault();
      filter(tab.getAttribute('data-filter'));
      if (root.Shell && typeof root.Shell.mount === 'function') root.Shell.mount(ID, null);
      return;
    }
    var open = t.closest('[data-card]');
    if (open) {
      if (ev.preventDefault) ev.preventDefault();
      if (root.Router && root.Router.go) root.Router.go('jobcard', { id: open.getAttribute('data-card') });
      return;
    }
    var el = t.closest('[data-act]');
    if (!el) return;
    if (el.getAttribute('data-act') === 'jobNew') return openNew();
    if (el.getAttribute('data-act') === 'jobNewSave') return saveNew(el);
    if (el.getAttribute('data-act') === 'jobsMechanic') {
      // Tapping a mechanic opens their cards as the Open list pre-filtered, not
      // a scorecard.
      filter('open');
      if (root.Shell && typeof root.Shell.mount === 'function') root.Shell.mount(ID, null);
    }
  }

  function openNew() {
    var v = root.V2, s = root.S;
    if (!v || typeof v.openSheet !== 'function') return;
    var cache = (s && s.cache) || {};
    v.openSheet(say('jbSheetTitle'), newSheet(cache.buses || [], cache.users || []));
  }

  /* THE CREATE. A local write, and creating one offline is most of what this
   * app is for — so nothing here waits for a connection and nothing says
   * "could not send".
   *
   * The card is created with whatever the first screen had. A card with a bus
   * and a fault and nothing else is a REAL row on this list, not a draft ([E]
   * 4f0691e): there is no draft state, no "finish this entry" badge, and the
   * card itself says what it still needs. The four times are deliberately NOT
   * set from here — `enterAt` is the supervisor's, asked for one field at a
   * time on the card. */
  function create(fields, who) {
    var f = fields || {};
    if (!f.busId || !String(f.problem || '').trim()) return null;
    var now = Date.now();
    var rec = {
      id: 'j-' + now.toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36),
      busId: String(f.busId), problem: String(f.problem).trim(),
      priority: f.priority ? String(f.priority) : 'medium',
      status: 'open', reportedBy: who && who.id ? who.id : null,
      assignedTo: f.crew ? String(f.crew) : null,
      assignees: f.crew ? [{ userId: String(f.crew), task: '' }] : [],
      enterAt: null, startAt: null, completeAt: null, outAt: null,
      odometer: f.odometer === '' || f.odometer == null ? null : Number(f.odometer),
      beforePhotos: [], afterPhotos: [], partsUsed: [], partRequests: [], coreReturns: [],
      externalVendor: '', externalCost: 0,
      closedAt: null, closedBy: null, verifiedBy: null, verifiedAt: null,
      createdAt: now, updatedAt: now
    };
    if (rec.odometer != null && !isFinite(rec.odometer)) rec.odometer = null;
    return rec;
  }

  function formVals() {
    var d = root.document;
    var form = d && d.querySelector ? d.querySelector('[data-sheet="newjob"]') : null;
    if (!form || !form.querySelectorAll) return null;
    var nodes = form.querySelectorAll('[data-field]'), out = {}, i;
    for (i = 0; i < nodes.length; i++) out[nodes[i].getAttribute('data-field')] = nodes[i].value;
    return out;
  }

  async function saveNew(el) {
    if (el.getAttribute('aria-disabled') === 'true') return;
    var vals = formVals();
    var rec = create(vals, (root.S && root.S.user) || null);
    if (!rec || !root.DB) return;
    el.setAttribute('aria-disabled', 'true');
    if ('textContent' in el) el.textContent = say('jbSaving');
    try { await root.DB.put('jobcards', rec); } catch (e) { el.removeAttribute('aria-disabled'); return; }
    if (root.V2 && root.V2.closeSheet) root.V2.closeSheet();
    if (root.Router && root.Router.go) root.Router.go('jobcard', { id: rec.id });
  }

  /* ====================================================================== */

  register();

  var api = { render: render, model: model, mount: mount, unmount: unmount, filter: filter,
              newSheet: newSheet, create: create, idleWords: idleWords };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.Jobs = api;
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

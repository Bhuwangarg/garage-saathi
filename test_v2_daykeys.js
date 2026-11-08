/* Which clock each `dayKey` runs on, and why they are not all the same one.
 * ============================================================================
 *
 * v2 has five of these helpers and they do NOT all use the same clock. That is
 * deliberate, and this file is here because it does not look deliberate: the
 * obvious "tidy-up" is to pin all five to UTC+5:30 like `night.js`, and that
 * change is a defect in two of the five. Measured below, both directions.
 *
 * The rule is not "always the garage's clock". It is: A KEY MUST USE THE SAME
 * CLOCK AS THE THING IT IS MATCHED AGAINST.
 *
 *   night.js        UTC+5:30   writes `nl-<date>`; matches the server's _ist_day
 *   gate.js         UTC+5:30   same garage day
 *   today.js        UTC+5:30   READS night.js's key, so it has no choice
 *   reviews.js      device     cancels against parseLocal (F1 below)
 *   me.js           device     matches app.js's usageDate, the writer (F2 below)
 *
 * And one that is not a `dayKey` at all, which is how it was missed: today.js's
 * `weekKey` (F3 below), matched against the digest week `coach_ai.week_of`
 * writes. It asked the DEVICE which day of the week it was and the GARAGE what
 * the date was, and so returned a Tuesday as a Monday's key.
 *
 * The two device-clock ones are matched against device-clock things. Pinning
 * them to IST breaks them, which is the half a pattern-match would miss. Run
 * this file under TZ=UTC: that is where the wrong version goes red.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;

let fails = 0;
function test(name, fn) {
  try { fn(); console.log('  ok  ' + name); }
  catch (e) { console.log(' FAIL ' + name + '\n        ' + String(e.message).split('\n').join('\n        ')); fails++; }
}

/* The helpers are read OUT OF THE SHIPPING FILES rather than copied here. A
 * copy would keep passing after somebody changed the real one, which is the
 * whole failure this file exists to catch. */
function extract(file, head, close) {
  const lines = fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n');
  const i = lines.findIndex((l) => l.indexOf(head) === 0);
  assert.notStrictEqual(i, -1, 'no "' + head + '" in ' + file + ' -- renamed or moved?');
  if (lines[i].indexOf('}') > lines[i].indexOf('{')) return lines[i];   // one-liner
  for (let j = i + 1; j < lines.length; j++) {
    if (lines[j] === close) return lines.slice(i, j + 1).join('\n');
  }
  throw new Error('unterminated "' + head + '" in ' + file);
}

function build(src, names) {
  return new Function(src + '\n; return {' + names.join(', ') + '};')();
}

// --- the five, as they actually ship ----------------------------------------
const night = build(extract('v2/night.js', '  function dayKey(d) {', '  }')
  .replace('IST_MS', '19800000'), ['dayKey']);
const gate = build('var IST_MS = 19800000;\n'
  + extract('v2/screens/gate.js', '  function dayKey(ms) {', '  }'), ['dayKey']);
const today = build(extract('v2/screens/today.js', '  function dayKey(now) {', '  }'), ['dayKey']);
const todayWeek = build('var DAY = 86400000;\n'
  + extract('v2/screens/today.js', '  function dayKey(now) {', '  }') + '\n'
  + extract('v2/screens/today.js', '  function weekKey(now) {', '  }'), ['weekKey']);
const reviews = build(extract('v2/screens/reviews.js', '  function parseLocal(s) {', '  }') + '\n'
  + extract('v2/screens/reviews.js', '  function dayKey(ts) {', '  }'), ['parseLocal', 'dayKey']);
const me = build(extract('v2/screens/me.js', '  function pad2(n) {', '  }') + '\n'
  + extract('v2/screens/me.js', '  function dayKey(ms) {', '  }'), ['dayKey']);
const app = build(extract('app.js', 'const usageDate = (ts) => {', '};'), ['usageDate']);

// The garage's day, written out independently of every helper above so that a
// helper and its expectation cannot drift together.
const istDay = (ms) => new Date(ms + 19800000).toISOString().slice(0, 10);

const TZ = process.env.TZ || '(ambient)';
const OFF = -new Date().getTimezoneOffset();        // device offset, minutes

/* A spread of instants. The 18:30-24:00 UTC band is the one that matters: that
 * is the 5.5 hours a day when the garage is already on tomorrow and a UTC
 * device is still on today. */
const STAMPS = [
  Date.UTC(2026, 10, 8, 0, 30), Date.UTC(2026, 10, 8, 12, 0),
  Date.UTC(2026, 10, 8, 18, 29), Date.UTC(2026, 10, 8, 18, 31),
  Date.UTC(2026, 10, 8, 20, 30), Date.UTC(2026, 10, 8, 23, 59),
];

/* ---------------------------------------------------------------------------
 * THE THREE THAT ARE THE GARAGE'S CLOCK
 *
 * These three are matched against a date the SERVER stamped (_ist_day, which is
 * `time.gmtime(ms/1000 + 5.5*3600)`), or against each other's key. A device
 * offset must not reach them at all.
 * ------------------------------------------------------------------------- */

test('night.js, gate.js and today.js are the garage clock, whatever the device is set to', () => {
  for (const ms of STAMPS) {
    const want = istDay(ms);
    assert.strictEqual(night.dayKey(ms), want, 'night.js at ' + new Date(ms).toISOString());
    assert.strictEqual(gate.dayKey(ms), want, 'gate.js at ' + new Date(ms).toISOString());
    assert.strictEqual(today.dayKey(ms), want, 'today.js at ' + new Date(ms).toISOString());
  }
});

test('...and today.js finds the key night.js writes, on a device on any clock', () => {
  // The defect this pair had: the board wrote nl-<garage date>, Today looked up
  // nl-<device date>, and on a non-IST device they were different strings for
  // 5.5 hours a day. One key, one clock, or Today draws "not picked yet" over a
  // full board.
  for (const ms of STAMPS) {
    assert.strictEqual('nl-' + today.dayKey(ms), 'nl-' + night.dayKey(ms),
      'Today and the duty board disagree at ' + new Date(ms).toISOString() + ' under TZ=' + TZ);
  }
});

/* ---------------------------------------------------------------------------
 * F1 -- reviews.js IS THE DEVICE'S CLOCK, AND THAT IS CORRECT
 *
 * `dayKey` there is only ever called on `parseLocal(rv.boardAt)`, and the pair
 * is a round trip: parseLocal reads "2026-10-07 23:30:00" (an IST wall clock,
 * passed through the server verbatim as a string) into a Date using LOCAL
 * components, and dayKey reads LOCAL components back out. The device offset
 * cancels exactly, so the result is the literal date in the string -- which is
 * the garage's date, which is what `rbassign.date` holds (_ist_day, server).
 *
 * Pin it to UTC+5:30 and the cancellation stops: the offset is then applied
 * once, uncorrected, and a late-evening boarding slides to the next day on a
 * UTC device and a past-midnight one slides back on a UTC+11 device. Measured
 * in the second assertion.
 * ------------------------------------------------------------------------- */

const BOARDS = ['2026-10-07 00:20:00', '2026-10-07 06:15:00',
  '2026-10-07 12:00:00', '2026-10-07 21:45:00', '2026-10-07 23:30:00'];

test('F1 reviews.js: a review lands on the night rbassign stamped it, on any device clock', () => {
  for (const s of BOARDS) {
    const want = s.slice(0, 10);          // what the server put in rbassign.date
    assert.strictEqual(reviews.dayKey(reviews.parseLocal(s)), want,
      'boardAt ' + s + ' under TZ=' + TZ + ' (offset ' + OFF + 'm)');
  }
});

test('F1 ...and pinning reviews.js to UTC+5:30 is what breaks it (the wrong fix, measured)', () => {
  // Not a style preference: on a device that is not on IST this rewrite files a
  // review under a night the garage does not agree with, and crewForReview then
  // reads the wrong bus's crew -- or no bus at all, and says "no bus that
  // night" about a night that has one.
  const wrong = (ts) => istDay(ts);
  const broken = BOARDS.filter((s) => wrong(reviews.parseLocal(s)) !== s.slice(0, 10));
  if (OFF === 330) {
    assert.strictEqual(broken.length, 0, 'on an IST device the two agree, which is why this hid');
  } else {
    assert.ok(broken.length > 0,
      'TZ=' + TZ + ' (offset ' + OFF + 'm) should expose the IST rewrite, but every boardAt matched');
  }
});

/* ---------------------------------------------------------------------------
 * F2 -- me.js IS THE DEVICE'S CLOCK, AND THAT MATCHES ITS WRITER
 *
 * `usage.date` is not server-stamped. `app.js`'s `usageDate` writes it on the
 * device, and it is also half of the row id (`userId + '|' + date`). The server
 * never reads it: `_merge_usage` only touches the counters, and retention goes
 * by `lastAt` (an epoch) through `_record_at`. So the only thing me.js's window
 * bound is compared against is a device-written string, and the reader has to
 * use the writer's arithmetic.
 *
 * NOTE, not an assertion: because the date is the WRITER's local date, the day
 * a usage row counts is whatever clock that person's phone is on, and the
 * owner's window bound is his own. Making that the garage's day means changing
 * `usageDate` and this helper TOGETHER -- and it re-keys a synced store, so it
 * is a decision, not a tidy-up. Left alone here on purpose.
 * ------------------------------------------------------------------------- */

test('F2 me.js reads usage.date with the same arithmetic app.js wrote it with', () => {
  for (const ms of STAMPS) {
    assert.strictEqual(me.dayKey(ms), app.usageDate(ms),
      'reader/writer split at ' + new Date(ms).toISOString() + ' under TZ=' + TZ);
  }
});

test('F2 ...and pinning me.js to UTC+5:30 alone is what breaks it (the wrong fix, measured)', () => {
  const broken = STAMPS.filter((ms) => istDay(ms) !== app.usageDate(ms));
  if (OFF === 330) {
    assert.strictEqual(broken.length, 0, 'on an IST device the two agree, which is why this hid');
  } else {
    assert.ok(broken.length > 0,
      'TZ=' + TZ + ' (offset ' + OFF + 'm) should expose the IST rewrite, but every stamp matched');
  }
});

/* ---------------------------------------------------------------------------
 * F3 -- today.js's weekKey IS THE GARAGE'S CLOCK, WEEKDAY INCLUDED
 *
 * Matched against a digest row's `week`, which `coach_ai.week_of` writes with
 * every part of the calculation in IST: `datetime.fromtimestamp(ms/1000,
 * CT.IST)`, then `d.weekday()` on that, then Monday's date. So the client has
 * to ask the garage's clock BOTH questions -- which date, and which weekday.
 *
 * It asked the device for the weekday and the garage for the date. The two are
 * not the same day for part of every day on any device off IST, and the result
 * was not merely a day out, it was not a Monday: 2026-11-03 against the
 * server's 2026-11-02. `thisWeek` returns null on any mismatch, so the owner's
 * Monday summary left the screen for 38.5 hours a week on a UTC device.
 *
 * Checked over a whole week in half-hour steps rather than at a handful of
 * instants, because the window is a band in the day and a spot check sits
 * outside it most of the time -- which is why the suite passed under TZ=UTC
 * while this was broken.
 * ------------------------------------------------------------------------- */

// coach_ai.week_of, written out independently: Monday of the IST week.
const istMonday = (ms) => {
  const d = new Date(ms + 19800000);
  const back = (d.getUTCDay() + 6) % 7;          // Monday = 0, read in IST
  return new Date(ms + 19800000 - back * 86400000).toISOString().slice(0, 10);
};

const WEEK_STEPS = [];
for (let h = 0; h < 7 * 48; h++) WEEK_STEPS.push(Date.UTC(2026, 10, 2, 0, 0) + h * 1800000);

test('F3 weekKey agrees with the digest week the server wrote, every half hour of a week', () => {
  const bad = WEEK_STEPS.filter((ms) => todayWeek.weekKey(ms) !== istMonday(ms));
  assert.strictEqual(bad.length, 0, bad.length + ' of ' + WEEK_STEPS.length
    + ' half-hours disagree under TZ=' + TZ + ' (offset ' + OFF + 'm); first at '
    + (bad.length ? new Date(bad[0]).toISOString() + ' client ' + todayWeek.weekKey(bad[0])
      + ' server ' + istMonday(bad[0]) : '-'));
});

test('F3 ...and what it returns is always a MONDAY, which is what the key means', () => {
  for (const ms of WEEK_STEPS) {
    const k = todayWeek.weekKey(ms);
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(k), 'not a date: ' + k);
    assert.strictEqual(new Date(k + 'T00:00:00Z').getUTCDay(), 1,
      k + ' is not a Monday (from ' + new Date(ms).toISOString() + ' under TZ=' + TZ + ')');
  }
});

test('F3 ...and week_of in coach_ai.py still does the whole calculation in IST', () => {
  const py = fs.readFileSync(path.join(ROOT, 'coach_ai.py'), 'utf8');
  const m = /def week_of\(now_ms\):([\s\S]*?)\n\ndef /.exec(py);
  assert.ok(m, 'week_of not found in coach_ai.py');
  assert.ok(/fromtimestamp\([^)]*CT\.IST\)/.test(m[1]),
    'week_of no longer reads the clock in IST -- weekKey must move with it');
  assert.ok(/weekday\(\)/.test(m[1]), 'week_of no longer takes an IST weekday');
});

/* ---------------------------------------------------------------------------
 * The server side of the three garage-clock keys, so this file fails if
 * _ist_day itself is ever changed out from under them.
 * ------------------------------------------------------------------------- */

test('_ist_day in sync_server.py is still UTC+5:30, which is what the three above assume', () => {
  const py = fs.readFileSync(path.join(ROOT, 'sync_server.py'), 'utf8');
  const m = /def _ist_day\(ms\):\s*\n\s*return ([^\n]+)/.exec(py);
  assert.ok(m, '_ist_day not found in sync_server.py');
  assert.ok(/5\.5\s*\*\s*3600/.test(m[1]),
    '_ist_day no longer adds 5.5 hours: ' + m[1].trim() + ' -- the three IST helpers must move with it');
  assert.ok(/gmtime/.test(m[1]),
    '_ist_day no longer reads UTC: ' + m[1].trim());
});

console.log(fails ? '\n  ' + fails + ' check(s) failed' : '');
process.exit(fails ? 1 : 0);

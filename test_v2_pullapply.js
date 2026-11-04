/* Tests for v2/pullapply.js — the second silent-loss path, and the first pass.
 * Run: node test_v2_pullapply.js
 *
 * At the repo root, not in v2/, because scripts/run-tests.py discovers test_*.js
 * at the root only and does not recurse. A test nobody runs is not a test.
 *
 * Two things are under test here and they are unrelated except by file:
 *
 *   1. A pulled record that wins over a local row whose key is STILL IN THE OUTBOX
 *      no longer throws that local edit away. v1 deleted the key and counted a
 *      conflict, so the user's change was gone and they were told only "N
 *      record(s) updated on another device". That was survivable while a stale
 *      push was silently dropped too; once the stale push became recoverable it
 *      was the last remaining way a v2 edit vanishes silently.
 *   2. FIRST_STORES was missing the two safety stores, so a re-synced device drew
 *      an empty Attention screen while the records that belong at the top of it
 *      were somewhere behind the full drain.
 *
 * The win rules themselves are NOT supposed to have changed, and the last block
 * below checks that against a transcription of the condition, the way
 * test_pullapply.js does for v1.
 */
const P = require('./v2/pullapply.js');

let fails = 0;
function check(name, cond) { console.log((cond ? '  ok  ' : ' FAIL ') + name); if (!cond) fails++; }

const NOW = Date.UTC(2026, 10, 2, 12);
const rec = (store, id, updatedAt, extra) => ({ store, id, rev: 1, data: Object.assign({ id, updatedAt }, extra || {}) });
const decide = (records, locals, opts) => P.decidePage(records, locals, Object.assign({ now: NOW }, opts || {}));
const owed = (key, touched) => ({ inOutbox: (k) => k === key, touched: touched || {} });
/* Conflicts are read through this rather than directly, so a module that reports
 * v1's bare key fails the check it should fail instead of throwing on the first
 * property access and taking the rest of the file with it. */
const cf = (d, i) => (d.conflicts[i] && typeof d.conflicts[i] === 'object' ? d.conflicts[i] : {});

/* ---- job 1: a pending edit is not discarded ----------------------------- */

// An R store with a named pending field (contract §4.4: `problem` is R on
// jobcards) and a server copy that does not carry it. The collision is real: one
// value, two authors, and no domain rule that decides between them.
let d = decide([rec('jobcards', 'j1', 200, { problem: 'brakes spongy' })],
               { 'jobcards|j1': { id: 'j1', updatedAt: 100, problem: 'horn not working' } },
               owed('jobcards|j1', { 'jobcards|j1': ['problem'] }));
check('a remote winner still wins', d.winners.length === 1);
check('…the local pending field survives into what gets written',
      d.winners[0].data.problem === 'horn not working');
check('…the rest of the server copy lands', d.winners[0].data.updatedAt === 200);
check('…and it is named with a reason, not counted as a number',
      d.conflicts.length === 1 && cf(d, 0).reason === 'stale-conflict');
check('…naming the field that collided',
      (cf(d, 0).fields || []).join(',') === 'problem' && cf(d, 0).key === 'jobcards|j1');

// The whole slice: the key must still be there afterwards. This is asserted
// through a stand-in for sync.js's apply loop, because the deletion that lost the
// edit lived in that loop and not in this module — the module's only lever on it
// is which bucket it reports the key in.
function applyPage(records, locals, outbox, touched) {
  const set = new Set(outbox);
  const stored = {};
  let txs = 0, merged = 0;
  const grouped = P.byStore(records);
  const conflicts = [];
  for (const store of Object.keys(grouped)) {
    const rows = grouped[store];
    const sub = {};
    for (const r of rows) sub[r.store + '|' + r.id] = locals[r.store + '|' + r.id] || null;
    const dec = P.decidePage(rows, sub, { now: NOW, inOutbox: (k) => set.has(k), touched: touched || {} });
    /* A key survives the outbox only if the module reported it as kept: in
     * `merges`, or in `conflicts` carrying a reason to surface it with. Anything
     * else is v1's loop, which was
     *     const noteConflict = (key) => { conflicts++; outbox.delete(key); };
     * and that deletion IS the silent loss — the pending edit went with it and the
     * user was told a number. A bare key with no reason is therefore modelled as
     * dropped, because that is all v1 ever reported and all sync.js could do with
     * it was count it. */
    const kept = new Set(dec.merges.filter((k) => typeof k === 'string'));
    merged += kept.size;
    for (const c of dec.conflicts) {
      if (c && typeof c === 'object' && c.key && c.reason) { kept.add(c.key); conflicts.push(c); }
      else conflicts.push({ key: c, reason: null });     // v1: counted, not named
    }
    for (const r of rows) {
      const key = r.store + '|' + r.id;
      if (set.has(key) && !kept.has(key)) set.delete(key);
    }
    if (dec.winners.length) {
      txs++;                                    // one bulkPutRaw per store
      for (const w of dec.winners) stored[w.store + '|' + w.id] = w.data;
    }
  }
  return { outbox: set, stored: stored, txs: txs, merges: merged, conflicts: conflicts };
}

let a = applyPage([rec('jobcards', 'j1', 200, { problem: 'brakes spongy' })],
                  { 'jobcards|j1': { id: 'j1', updatedAt: 100, problem: 'horn not working' } },
                  ['jobcards|j1'], { 'jobcards|j1': ['problem'] });
check('the key stays in the outbox, so the edit pushes again', a.outbox.has('jobcards|j1'));
check('…and the row the next push is built from still holds the local edit',
      a.stored['jobcards|j1'].problem === 'horn not working');

// An F store: every field is merged on the server by a domain rule, so there is
// nothing for this device to name and nothing to surface. It is a merge, and the
// key must still push.
a = applyPage([rec('routes', 'r1', 200)], { 'routes|r1': { id: 'r1', updatedAt: 100 } },
              ['routes|r1'], {});
check('a store with no R fields is a merge, not a conflict',
      a.merges === 1 && a.conflicts.length === 0);
check('…and its key stays in the outbox too', a.outbox.has('routes|r1'));

// A pending field the server already carries is not a collision: the push landed
// and came back. Telling somebody about that would be noise.
d = decide([rec('jobcards', 'j1', 200, { problem: 'same text' })],
           { 'jobcards|j1': { id: 'j1', updatedAt: 100, problem: 'same text' } },
           owed('jobcards|j1', { 'jobcards|j1': ['problem'] }));
check('a pending field the server already has is a merge',
      d.merges.length === 1 && d.conflicts.length === 0);

// Nothing owed: no bucket at all. This is the overwhelmingly common record.
d = decide([rec('jobcards', 'j1', 200)], { 'jobcards|j1': { id: 'j1', updatedAt: 100 } });
check('a record nobody was editing is neither a merge nor a conflict',
      d.merges.length === 0 && d.conflicts.length === 0 && d.winners.length === 1);

// A record that does not win raises nothing, owed or not: there is no pending
// edit at risk because nothing is being written over it.
d = decide([rec('jobcards', 'j1', 50)], { 'jobcards|j1': { id: 'j1', updatedAt: 100 } },
           owed('jobcards|j1', { 'jobcards|j1': ['problem'] }));
check('a record that does not win reports nothing',
      d.winners.length === 0 && d.merges.length === 0 && d.conflicts.length === 0);

// `touched` reporting [] means "cannot say" as much as "nothing" — no base
// recorded, or one too large to hold (v2/db.js BASE_MAX_BYTES). Both must not be
// guessed at, so they take the merge path and the server gets the second look.
d = decide([rec('gatechecks', 'g1', 200, { items: { a: 1 } })],
           { 'gatechecks|g1': { id: 'g1', updatedAt: 100, items: { a: 2 } } },
           owed('gatechecks|g1', { 'gatechecks|g1': [] }));
check('an unnameable base is a merge, not a guess',
      d.merges.length === 1 && d.conflicts.length === 0);

// Several pending fields at once, only one of which the server disagrees about.
d = decide([rec('jobcards', 'j1', 200, { problem: 'theirs', notes: 'mine', status: 'open' })],
           { 'jobcards|j1': { id: 'j1', updatedAt: 100, problem: 'mine', notes: 'mine', status: 'open' } },
           owed('jobcards|j1', { 'jobcards|j1': ['problem', 'notes', 'status'] }));
check('only the fields that actually collide are named',
      d.conflicts.length === 1 && (cf(d, 0).fields || []).join(',') === 'problem');
check('…and the collided field is still the local one',
      d.winners[0].data.problem === 'mine');

// A pending field the local row does not have at all. Absent is a value: putting
// an empty field back as `undefined` would store a key the record never had.
d = decide([rec('jobcards', 'j1', 200, { remark: 'theirs' })],
           { 'jobcards|j1': { id: 'j1', updatedAt: 100 } },
           owed('jobcards|j1', { 'jobcards|j1': ['remark'] }));
check('a field cleared locally is written back as absent, not as undefined',
      d.winners.length === 1 && !('remark' in d.winners[0].data));

/* ---- never write a redacted copy back ---------------------------------- */

// Unredaction is not an edit of this device's, and the local copy holds strictly
// less information. Putting its fields back would write a stripped value over a
// full one.
d = decide([rec('jobcards', 'j1', 100, { problem: 'full text' })],
           { 'jobcards|j1': { id: 'j1', updatedAt: 100, problem: null, _redacted: true } },
           owed('jobcards|j1', { 'jobcards|j1': ['problem'] }));
check('an unredaction is not overwritten by the redacted local field',
      d.winners.length === 1 && d.winners[0].data.problem === 'full text');
check('…and is a merge, so the key still pushes',
      d.merges.length === 1 && d.conflicts.length === 0);

/* ---- the module must not mutate what it was handed --------------------- */

const original = rec('jobcards', 'j1', 200, { problem: 'theirs' });
const before = JSON.stringify(original);
const locals = { 'jobcards|j1': { id: 'j1', updatedAt: 100, problem: 'mine' } };
const localsBefore = JSON.stringify(locals);
decide([original], locals, owed('jobcards|j1', { 'jobcards|j1': ['problem'] }));
check('re-applying a pending field does not mutate the pulled record',
      JSON.stringify(original) === before);
check('…nor the locals map', JSON.stringify(locals) === localsBefore);

/* ---- one transaction per store, counted rather than timed --------------- */

// Per-record IO has been shipped twice and undone twice (277ms a page against
// 54ms). Counting transactions is the only way to assert it that does not depend
// on how fast the machine running the test happens to be.
const mixed = [];
for (let i = 0; i < 50; i++) mixed.push(rec('jobcards', 'j' + i, 200));
for (let i = 0; i < 50; i++) mixed.push(rec('parts', 'p' + i, 200));
a = applyPage(mixed, {}, []);
check('a 100-record page over two stores is two transactions, not 100', a.txs === 2);

a = applyPage(mixed, {}, ['jobcards|j7'], { 'jobcards|j7': ['problem'] });
check('…and a pending edit in the page does not split the transaction', a.txs === 2);

/* ---- the win rules are unchanged --------------------------------------- */

// A brute-force cross-check against a transcription of the condition, over every
// combination of timestamp and redaction flag. This is the block that must go red
// if the pending-edit work changed WHICH copy wins, because that was never the
// question — the server copy still wins, it just no longer costs the local edit.
function oldRule(r, local, now) {
  const unredact = local && local._redacted && !r.data._redacted;
  const localTs = local ? (local.updatedAt || 0) : 0;
  const localAt = localTs > now + 86400000 ? 0 : localTs;
  return !local || unredact || (r.data.updatedAt || 0) > localAt;
}
let mismatches = 0, cases = 0;
const stamps = [0, 1, 50, 100, NOW, NOW + 1000, NOW + 86400000, NOW + 86400001];
for (const rt of stamps) {
  for (const lt of stamps.concat([undefined])) {
    for (const rRed of [false, true]) {
      for (const lRed of [false, true]) {
        for (const haveLocal of [false, true]) {
          for (const pending of [false, true]) {
            cases++;
            const r = rec('jobcards', 'i', rt, rRed ? { _redacted: true } : null);
            const local = haveLocal ? Object.assign({ id: 'i' }, lt === undefined ? {} : { updatedAt: lt }, lRed ? { _redacted: true } : {}) : null;
            const opts = pending ? owed('jobcards|i', { 'jobcards|i': ['problem'] }) : {};
            const mine = P.decidePage([r], { 'jobcards|i': local }, Object.assign({ now: NOW }, opts)).winners.length === 1;
            if (mine !== !!oldRule(r, local, NOW)) mismatches++;
          }
        }
      }
    }
  }
}
check(`the win rule is unchanged on all ${cases} combinations`, mismatches === 0);

// Spelt out separately, because these two are the ones a refactor gets wrong and
// the brute force above would only report as a count.
d = decide([rec('jobcards', 'j1', 100)], { 'jobcards|j1': { id: 'j1', updatedAt: 100 } });
check('equal timestamps still lose', d.winners.length === 0);
d = decide([rec('rbreviews', 'r1', 100)], { 'rbreviews|r1': { id: 'r1', updatedAt: 100, _redacted: true } });
check('un-redaction still wins at an equal timestamp', d.winners.length === 1);

/* ---- no dialog, anywhere in this module -------------------------------- */

// Contract §4.0: a confirmation people have been trained to dismiss is worse than
// none, because it launders data loss into consent. There is nothing a person can
// usefully be asked about a clock, so this module must hold no affordance for
// asking. Guarding an absence, so a future builder cannot add one quietly.
const src = require('fs').readFileSync(require('path').join(__dirname, 'v2', 'pullapply.js'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
check('the module holds no confirm/overwrite/keep-mine affordance',
      !/confirm|window\.confirm|overwrite|keepMine|keep_mine|prompt\s*\(/i.test(src));

/* ---- job 2: the first pass and the two safety stores ------------------- */

check('the first pass carries the departure checks Attention leads with',
      P.FIRST_STORES.indexOf('gatechecks') >= 0);
check('…and the "something is wrong with my bus" reports beside them',
      P.FIRST_STORES.indexOf('driverreports') >= 0);
check('…and the coaching log, which is a driver\'s whole Me screen',
      P.FIRST_STORES.indexOf('crewnotes') >= 0);

// Left out on a stated reason, not by oversight: append-only, a 365-day window,
// and its only consumer is "who was on bus X on date Y", which nobody asks on
// arrival. Adding it would slow the first screen to serve that query.
check('dutylog is NOT in the first pass', P.FIRST_STORES.indexOf('dutylog') < 0);

check('the first-screen list still holds no duplicates',
      new Set(P.FIRST_STORES).size === P.FIRST_STORES.length);
check('…and still does not carry the telemetry it exists to get ahead of',
      P.FIRST_STORES.indexOf('gpsevents') < 0 && P.FIRST_STORES.indexOf('gpslive') < 0);
check('…and is still short enough to be one or two pages',
      P.FIRST_STORES.length <= 20);

/* The check that actually proves the point. The list passing proves only that
 * somebody typed three names; what matters is that a first-pass drain DELIVERS
 * the awaiting gate check and the open driver report before the full drain has
 * run at all. Modelled on a server that answers `store=` with only those stores,
 * which is what contract §2.1 says /pull does. */
function fakeServer(rows) {
  return function (opts) {
    const only = opts && opts.only;
    const out = rows.filter((r) => !only || only.indexOf(r.store) >= 0);
    return { records: out.slice(0, 2000) };
  };
}
// A fleet-shaped table: the two records Attention needs sit late in rev order,
// behind the log rows, which is exactly why they used to arrive last.
const table = [];
for (let i = 0; i < 4000; i++) table.push({ store: 'gpsevents', id: 'g' + i, rev: i + 1, data: { id: 'g' + i, updatedAt: 1 } });
table.push({ store: 'gatechecks', id: 'gc-1', rev: 9001, data: { id: 'gc-1', updatedAt: 1, status: 'awaiting' } });
table.push({ store: 'driverreports', id: 'dr-1', rev: 9002, data: { id: 'dr-1', updatedAt: 1, status: 'open' } });
table.push({ store: 'crewnotes', id: 'cn-1', rev: 9003, data: { id: 'cn-1', updatedAt: 1 } });

const server = fakeServer(table);
const plan = P.drainPlan(0, 0);
check('a fresh device runs the first pass before anything else', plan[0] === 'first');

const firstPass = server({ only: P.FIRST_STORES });
const got = new Set(firstPass.records.map((r) => r.store + '|' + r.id));
check('the first pass delivers the awaiting gate check', got.has('gatechecks|gc-1'));
check('…and the open driver report', got.has('driverreports|dr-1'));
check('…and the coaching note', got.has('crewnotes|cn-1'));
// The point of the pass: it arrives WITHOUT the full drain having run. The full
// drain's first page is 2000 records of log rows and does not reach rev 9001.
const fullFirstPage = server({}).records;
check('…while the full drain has not reached them yet',
      fullFirstPage.length === 2000 && !fullFirstPage.some((r) => r.store === 'gatechecks'));
check('…and the first pass is far smaller than the drain it got ahead of',
      firstPass.records.length < fullFirstPage.length);

console.log(fails ? `\n${fails} FAILED` : '\nall ok');
process.exit(fails ? 1 : 0);

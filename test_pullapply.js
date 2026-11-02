/* Tests for pullapply.js — which pulled records win over what is already stored.
 * Run: node test_pullapply.js
 *
 * These are the rules sync.js used to apply one record at a time. Batching the IO
 * around them is only safe if the rules themselves are unchanged, so each case
 * below is one of the failures the original loop was written for.
 */
const P = require('./pullapply.js');

let fails = 0;
function check(name, cond) { console.log((cond ? '  ok  ' : ' FAIL ') + name); if (!cond) fails++; }

const NOW = Date.UTC(2026, 10, 2, 12);
const rec = (store, id, updatedAt, extra) => ({ store, id, rev: 1, data: Object.assign({ id, updatedAt }, extra || {}) });
const decide = (records, locals, opts) => P.decidePage(records, locals, Object.assign({ now: NOW }, opts || {}));

/* ---- the plain cases ---------------------------------------------------- */

let d = decide([rec('jobcards', 'j1', 100)], {});
check('a record we have never seen is applied', d.winners.length === 1 && d.winners[0].id === 'j1');

d = decide([rec('jobcards', 'j1', 100)], { 'jobcards|j1': { id: 'j1', updatedAt: 50 } });
check('a newer server copy beats an older local one', d.winners.length === 1);

d = decide([rec('jobcards', 'j1', 50)], { 'jobcards|j1': { id: 'j1', updatedAt: 100 } });
check('an OLDER server copy does not overwrite a newer local one', d.winners.length === 0);

d = decide([rec('jobcards', 'j1', 100)], { 'jobcards|j1': { id: 'j1', updatedAt: 100 } });
check('an equal timestamp is not applied (no pointless write)', d.winners.length === 0);

d = decide([rec('jobcards', 'j1', 0)], { 'jobcards|j1': { id: 'j1' } });
check('a local row with no updatedAt is still beaten only by a positive one', d.winners.length === 0);
d = decide([rec('jobcards', 'j1', 1)], { 'jobcards|j1': { id: 'j1' } });
check('…and a timestamp of 1 does beat a missing one', d.winners.length === 1);

/* ---- unredaction: the office-reviews failure ---------------------------- */

d = decide([rec('rbreviews', 'r1', 100)], { 'rbreviews|r1': { id: 'r1', updatedAt: 100, _redacted: true } });
check('a full copy replaces a redacted one at the SAME timestamp', d.winners.length === 1);

d = decide([rec('rbreviews', 'r1', 50, { _redacted: true })],
           { 'rbreviews|r1': { id: 'r1', updatedAt: 100, _redacted: true } });
check('a redacted copy does not overwrite a newer redacted one', d.winners.length === 0);

d = decide([rec('rbreviews', 'r1', 100, { _redacted: true })],
           { 'rbreviews|r1': { id: 'r1', updatedAt: 100 } });
check('an entitlement LOST does not strip a full copy at the same timestamp', d.winners.length === 0);

/* ---- a local clock in the future --------------------------------------- */

const farFuture = NOW + P.FUTURE_MS + 1000;
d = decide([rec('jobcards', 'j1', NOW)], { 'jobcards|j1': { id: 'j1', updatedAt: farFuture } });
check('a local copy dated past the future window is not trusted', d.winners.length === 1);

const nearFuture = NOW + 1000;   // inside the window: a few seconds of clock skew
d = decide([rec('jobcards', 'j1', NOW)], { 'jobcards|j1': { id: 'j1', updatedAt: nearFuture } });
check('ordinary clock skew is still respected, so a sane local edit survives', d.winners.length === 0);

d = decide([rec('jobcards', 'j1', NOW)], { 'jobcards|j1': { id: 'j1', updatedAt: NOW + P.FUTURE_MS } });
check('the window boundary itself is still trusted (> not >=)', d.winners.length === 0);

/* ---- conflicts: a local edit we still owe the server -------------------- */

d = decide([rec('jobcards', 'j1', 100)], { 'jobcards|j1': { id: 'j1', updatedAt: 50 } },
           { inOutbox: (k) => k === 'jobcards|j1' });
check('a superseded local edit is reported as a conflict', d.conflicts.length === 1 && d.conflicts[0] === 'jobcards|j1');
check('…and the server copy still wins', d.winners.length === 1);

d = decide([rec('jobcards', 'j1', 50)], { 'jobcards|j1': { id: 'j1', updatedAt: 100 } },
           { inOutbox: () => true });
check('a record that does NOT win raises no conflict', d.conflicts.length === 0 && d.winners.length === 0);

d = decide([rec('jobcards', 'j1', 100)], {}, { inOutbox: () => false });
check('nothing owed means no conflict', d.conflicts.length === 0);

/* ---- grouping ---------------------------------------------------------- */

const page = [rec('jobcards', 'j1', 1), rec('parts', 'p1', 1), rec('jobcards', 'j2', 1)];
const g = P.byStore(page);
check('byStore groups a mixed page', Object.keys(g).sort().join(',') === 'jobcards,parts');
check('…and keeps two stores apart', g.jobcards.length === 2 && g.parts.length === 1);
check('…preserving order within a store', g.jobcards[0].id === 'j1' && g.jobcards[1].id === 'j2');

// Two revisions of ONE id inside one page must stay in page order, or the older
// one lands last and the device ends up behind what the server sent.
const twice = P.byStore([rec('jobcards', 'j1', 10), rec('jobcards', 'j1', 20)]);
check('two revisions of one id keep their order', twice.jobcards[0].data.updatedAt === 10 && twice.jobcards[1].data.updatedAt === 20);

check('byStore of an empty page is empty', Object.keys(P.byStore([])).length === 0);

/* ---- shape and robustness ---------------------------------------------- */

d = decide([], {});
check('an empty page decides nothing', d.winners.length === 0 && d.conflicts.length === 0);

d = P.decidePage([rec('jobcards', 'j1', 100)], null, { now: NOW });
check('a missing locals map is treated as "nothing stored"', d.winners.length === 1);

d = decide([rec('jobcards', 'j1', 100)], { 'jobcards|j1': null });
check('an explicit null local is treated as "nothing stored"', d.winners.length === 1);

// The decision must not mutate what it was handed: sync.js writes the same objects
// afterwards, and the page is also used to compute the cursor.
const original = rec('jobcards', 'j1', 100);
const before = JSON.stringify(original);
decide([original], { 'jobcards|j1': { id: 'j1', updatedAt: 50 } });
check('decidePage does not mutate the records it is given', JSON.stringify(original) === before);

const locals = { 'jobcards|j1': { id: 'j1', updatedAt: 50 } };
const localsBefore = JSON.stringify(locals);
decide([rec('jobcards', 'j1', 100)], locals);
check('…nor the locals map', JSON.stringify(locals) === localsBefore);

// Order out must match order in, because applying a page out of order is the bug
// the pull loop's own comment warns about.
d = decide([rec('a', '1', 9), rec('a', '2', 9), rec('a', '3', 9)], {});
check('winners come back in page order', d.winners.map((w) => w.id).join('') === '123');

/* ---- the whole point: same answers as the per-record rule --------------- */

// A brute-force cross-check against a direct transcription of the old loop.
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
          cases++;
          const r = rec('s', 'i', rt, rRed ? { _redacted: true } : null);
          const local = haveLocal ? Object.assign({ id: 'i' }, lt === undefined ? {} : { updatedAt: lt }, lRed ? { _redacted: true } : {}) : null;
          const mine = decide([r], { 's|i': local }).winners.length === 1;
          const theirs = !!oldRule(r, local, NOW);
          if (mine !== theirs) mismatches++;
        }
      }
    }
  }
}
check(`agrees with the old per-record rule on all ${cases} combinations`, mismatches === 0);

console.log(fails ? `\n${fails} FAILED` : '\nall ok');
process.exit(fails ? 1 : 0);

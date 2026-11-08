/* Tests for v2/ui/words.js, and for the rule it exists to enforce across all of v2.
 * Run: node test_v2_words.js   (needs no browser; exits non-zero on any failure)
 *
 * THE POINT OF THE FILE. v2-foundation-ui.md section 6.3: Trip cash was English-only in Hindi mode, on a
 * screen for the largest role, and nothing failed and nobody was told. The cause is a mechanism, written down
 * in v1's own dictionary (i18n-hi.js line 8): t() falls back to English for any key Hindi is missing, so a
 * missing translation is indistinguishable from a present one until a Hindi reader opens the screen. The hours
 * that defect was ranked for have been withdrawn (DECISIONS.md section 7: drivers do not use their logins).
 * The mechanism has not been, and it now points at Me, which for a driver and a conductor is their whole app.
 *
 * So this file is the thing that fails instead of the reader noticing. Six claims:
 *   1. KEY PARITY. Every id registered anywhere under v2/ has an English value and a Hindi KEY. An id with
 *      only `en` fails, named. The Hindi may be '' - that is pending, which is a state, not an absence.
 *   2. THE CHROME IS NOT ALLOWED TO BE PENDING. The 21 ids section 6.3 names are drawn on all thirteen
 *      screens and have nowhere to hide, so an empty `hi` on one of them is a failure here and now.
 *   3. THE PENDING COUNT IS PRINTED ON EVERY RUN, pass or fail, by name. A pending mechanism nobody empties
 *      is the English-leak with extra steps; a count that is only printed on failure is a count nobody reads.
 *      It must reach ZERO and the Hindi comes from the OWNER - see the note printed with it.
 *   4. NO ENGLISH SURVIVES IN HINDI. Every chrome primitive is rendered with the document language set to
 *      Hindi and no fixed string may contain a Latin letter. This is the check that would have caught Trip
 *      cash. Caller text is excepted by construction: the callers below are passed Devanagari.
 *   5. NO LITERAL ESCAPES THE TABLE. A quoted, capitalised, multi-letter English word in a v2 file that
 *      DRAWS, outside a W.register literal, fails. Without this, 1 and 2 pass while the screen is wrong.
 *   6. THE PLURAL SELECTOR IS REAL. w('minutesAgo', 1) and w('minutesAgo', 3) differ in English; Hindi takes
 *      one form for both.
 * Plus: v2/ui/states.js is run against its own suite from here, because nothing else does (see COVER).
 *
 * MUTANTS. Every check above is followed by the mutation that must make it go red. A check that cannot fail is
 * decoration, and this repo has shipped a bug behind one. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const ROOT = __dirname;
const WORDS = path.join(ROOT, 'v2', 'ui', 'words.js');
const STATES = path.join(ROOT, 'v2', 'ui', 'states.js');
const OVERLAY = path.join(ROOT, 'v2', 'ui', 'overlay.js');

let fails = 0;
function test(name, fn) {
  try { fn(); console.log('  ok  ' + name); }
  catch (e) { console.log(' FAIL ' + name + '\n        ' + String(e && e.message).split('\n').join('\n        ')); fails++; }
}
const read = (p) => fs.readFileSync(p, 'utf8');
const rel = (p) => path.relative(ROOT, p);

/* =====================================================================================================
 * READING THE SOURCE: comments out, then string literals, then the register tables
 * ===================================================================================================== */
/* Comments are blanked rather than deleted, so a reported offset still points at the real line. The same
 * reason scripts/check-floor.py gives: the first version of that check reported three violations that were
 * all comments saying "no oklch()", which teaches people to pass --no-verify. */
function stripComments(src) {
  const out = src.split('');
  let i = 0, inLine = false, inBlock = false, inStr = false, quote = '', prev = '';
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (inLine) { if (src[i] === '\n') inLine = false; else out[i] = ' '; i++; continue; }
    if (inBlock) { if (two === '*/') { out[i] = out[i + 1] = ' '; inBlock = false; i += 2; continue; } if (src[i] !== '\n') out[i] = ' '; i++; continue; }
    if (inStr) { if (src[i] === '\\') { i += 2; continue; } if (src[i] === quote) inStr = false; i++; continue; }
    if (two === '//') { inLine = true; out[i] = out[i + 1] = ' '; i += 2; continue; }
    if (two === '/*') { inBlock = true; out[i] = out[i + 1] = ' '; i += 2; continue; }
    if (src[i] === '"' || src[i] === "'" || src[i] === '`') { inStr = true; quote = src[i]; i++; continue; }
    /* A regex literal is blanked like a comment, because a quote inside one ( /'/g ) is not a string and a
     * scanner that reads it as one swallows the rest of the file. The test for "is this a division" is the
     * usual one: the previous significant character. */
    if (src[i] === '/' && /[(,=:[!&|?{};+\-*%~^]|^$|\breturn$|\btypeof$/.test(prev)) {
      out[i] = ' '; i++;
      while (i < src.length && src[i] !== '/' && src[i] !== '\n') {
        if (src[i] === '\\') { out[i] = ' '; i++; }
        if (src[i] === '[') { while (i < src.length && src[i] !== ']' && src[i] !== '\n') { out[i] = ' '; i++; } }
        out[i] = ' '; i++;
      }
      if (src[i] === '/') { out[i] = ' '; i++; }
      continue;
    }
    if (!/\s/.test(src[i])) prev = src[i];
    i++;
  }
  return out.join('');
}

// Every string literal in already-comment-stripped source, as {start, end, text}.
const STRING_RE = /(['"`])((?:\\.|(?!\1)[^\\])*?)\1/g;
function literals(src) {
  const out = [];
  let m;
  STRING_RE.lastIndex = 0;
  while ((m = STRING_RE.exec(src)) !== null) out.push({ start: m.index, end: m.index + m[0].length, text: m[2] });
  return out;
}

// The balanced span starting at src[from] (which must be the open bracket). Strings are skipped.
function balanced(src, from) {
  const open = src[from], close = open === '{' ? '}' : ')';
  let depth = 0, i = from;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') { const q = c; i++; while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; } i++; continue; }
    if (c === open) depth++;
    else if (c === close) { depth--; if (!depth) return { start: from, end: i + 1 }; }
    i++;
  }
  throw new Error('unbalanced ' + open + ' at ' + from);
}

/* The spans of every W.register table literal in a file. The argument is either the literal itself or the
 * name of a var initialised with one in the same file: both shapes are used, because the file that draws a
 * word keeps a reference to its own table so it can read it when words.js is not on the page. */
function registerSpans(src) {
  const spans = [];
  const call = /\bW\s*\.\s*register\s*\(/g;
  let m;
  while ((m = call.exec(src)) !== null) {
    const arg = balanced(src, m.index + m[0].length - 1);
    const inner = src.slice(arg.start + 1, arg.end - 1).replace(/^\s+/, '');
    const at = arg.start + 1 + (src.slice(arg.start + 1, arg.end - 1).length - inner.length);
    if (inner[0] === '{') { spans.push(balanced(src, at)); continue; }
    const name = (inner.match(/^[A-Za-z_$][\w$]*/) || [])[0];
    if (!name) continue;
    const decl = new RegExp('\\b(?:var|let|const)\\s+' + name + '\\s*=\\s*\\{').exec(src);
    if (decl) spans.push(balanced(src, decl.index + decl[0].length - 1));
  }
  return spans;
}

/* The ids inside one table span: {id: {en?: value, hi?: value}}. `value` is the source text of the half, so
 * '' and {one: '', other: ''} are both visible as written - the difference between pending and translated. */
function parseTable(span) {
  const body = span.slice(1, -1);
  const out = {};
  let i = 0;
  while (i < body.length) {
    const m = /(?:^|[,{\s])(?:'([A-Za-z_$][\w$]*)'|"([A-Za-z_$][\w$]*)"|([A-Za-z_$][\w$]*))\s*:\s*\{/.exec(body.slice(i));
    if (!m) break;
    const id = m[1] || m[2] || m[3];
    const open = i + m.index + m[0].length - 1;
    const sp = balanced(body, open);
    const halves = body.slice(sp.start + 1, sp.end - 1);
    const entry = {};
    for (const half of ['en', 'hi']) {
      const hm = new RegExp('(?:^|[,\\s{])' + half + '\\s*:\\s*').exec(halves);
      if (!hm) continue;
      const at = hm.index + hm[0].length;
      if (halves[at] === '{') entry[half] = halves.slice(balanced(halves, at).start, balanced(halves, at).end);
      else { STRING_RE.lastIndex = 0; const s = literals(halves.slice(at))[0]; entry[half] = s ? s.text : ''; }
    }
    out[id] = entry;
    i = sp.end;
  }
  return out;
}

const jsFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((acc, e) => {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) return acc.concat(jsFiles(p));
  return e.name.endsWith('.js') ? acc.concat([p]) : acc;
}, []);

const V2_FILES = jsFiles(path.join(ROOT, 'v2')).sort();

/* WHICH FILES THE "no literal escapes the table" RULE COVERS, and why it is not every file under v2/.
 * The defect is English reaching a reader's EYES, so the rule covers every file that draws: one whose source
 * holds an HTML tag or registers a word. That is v2/ui/*.js today and every screen module the moment it
 * exists, because a screen that draws no markup is not a screen. It is deliberately NOT v2/db.js, v2/sync.js
 * or v2/caps.js, which draw nothing - and that is a gap I am reporting rather than hiding: v2/sync.js holds
 * about ten reader-facing refusal sentences ("No connection to the server") that are the same defect one
 * layer down, and they belong to whoever owns that file, not to this slice. */
function draws(src) { return /<\/?[a-z][a-z0-9]*[\s>/]/.test(src) || /\bW\s*\.\s*register\s*\(/.test(src); }

// All register tables under v2/, merged by id: {id: {en, hi, where: [file]}}.
function mergedTables(files) {
  const merged = {};
  for (const f of files || V2_FILES) {
    const src = stripComments(read(f));
    for (const sp of registerSpans(src)) {
      const table = parseTable(src.slice(sp.start, sp.end));
      for (const id of Object.keys(table)) {
        if (!merged[id]) merged[id] = { where: [] };
        merged[id].where.push(rel(f));
        for (const half of ['en', 'hi']) if (half in table[id]) merged[id][half] = table[id][half];
      }
    }
  }
  return merged;
}

/* =====================================================================================================
 * LOADING: words.js, states.js and overlay.js in one context, the way a page loads them
 * ===================================================================================================== */
// A stub element that answers everything overlay.js asks of one. innerHTML is kept so the markup can be read.
function stubEl(sink) {
  const el = {
    innerHTML: '', textContent: '', className: '', style: {}, isConnected: true, parentNode: null,
    attrs: {}, open: false,
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    removeAttribute(k) { delete this.attrs[k]; }, hasAttribute(k) { return k in this.attrs; },
    addEventListener() {}, removeEventListener() {}, appendChild(c) { c.parentNode = this; return c; },
    removeChild(c) { c.parentNode = null; return c; }, focus() {}, showModal() { this.open = true; },
    close() { this.open = false; }, contains() { return false; }, closest() { return null; },
    classList: { contains() { return false; } },
    querySelector() { return stubEl(sink); }, querySelectorAll() { return []; }, clientWidth: 0
  };
  if (sink) Object.defineProperty(el, 'html', { get: () => el.innerHTML });
  return el;
}

function load(opts) {
  const o = opts || {};
  const created = [];
  const sandbox = {};
  sandbox.window = sandbox;
  sandbox.Promise = Promise;
  sandbox.setTimeout = () => 0;
  sandbox.clearTimeout = () => {};
  sandbox.innerWidth = 400;
  sandbox.getComputedStyle = () => ({ opacity: '1', transitionDuration: '0s', transitionDelay: '0s', paddingRight: '0px' });
  const docEl = stubEl();
  docEl.lang = o.lang || 'en';
  const body = stubEl();
  sandbox.document = {
    documentElement: docEl, body, activeElement: null,
    createElement: () => { const e = stubEl(true); created.push(e); return e; },
    querySelectorAll: () => [], addEventListener: () => {}, removeEventListener: () => {}
  };
  const ctx = vm.createContext(sandbox);
  const files = o.files || { words: read(WORDS), states: read(STATES), overlay: read(OVERLAY) };
  for (const key of ['words', 'states', 'overlay']) if (files[key]) vm.runInContext(files[key], ctx, { filename: key });
  return { win: sandbox, created, doc: sandbox.document };
}

/* The words a person would read out of a chunk of markup: the text nodes, plus the attributes that are
 * themselves shown or spoken. Class names, roles and data attributes are not words and are not read. */
function spoken(html) {
  let out = '';
  const s = String(html);
  let i = 0;
  while (i < s.length) {
    const lt = s.indexOf('<', i);
    if (lt < 0) { out += ' ' + s.slice(i); break; }
    out += ' ' + s.slice(i, lt);
    const gt = s.indexOf('>', lt);
    if (gt < 0) break;
    const tag = s.slice(lt, gt);
    for (const a of ['title', 'aria-label', 'alt', 'placeholder']) {
      const m = new RegExp('\\s' + a + '="([^"]*)"').exec(tag);
      if (m) out += ' ' + m[1];
    }
    i = gt + 1;
  }
  return out.replace(/\s+/g, ' ').trim();
}

// Everything the chrome draws, in one list, so the Hindi check and its mutants read the same surface.
const HI_CALLER = 'काम';          // "काम" - caller text, so a Latin letter can only be a fixed word
function chromeRenders(win, created) {
  const out = [];
  out.push(['emptyState', win.emptyState(HI_CALLER, { hint: HI_CALLER })]);
  out.push(['emptyState (no text: the fallback word)', win.emptyState(null)]);
  out.push(['errorState', win.errorState(HI_CALLER, function () {})]);
  out.push(['errorState (no text: the fallback word)', win.errorState('')]);
  out.push(['offlineState', win.offlineState()]);
  out.push(['skeleton', win.skeleton(2)]);
  out.push(['figure (unknown)', win.figure(null)]);
  out.push(['figure (an age)', win.figure(42, { at: 1, unit: HI_CALLER })]);
  out.push(['figure (stale, no at)', win.figure(42, { stale: true })]);
  out.push(['figure (an unreadable at)', win.figure(42, { at: 'not a date' })]);
  const mark = created.length;
  win.V2.openSheet(HI_CALLER, '');
  win.V2.confirmDialog(HI_CALLER, { title: HI_CALLER });
  win.V2.toast(HI_CALLER, { kind: 'ok' });
  win.V2.toast(HI_CALLER, { kind: 'warn' });
  win.V2.toast(HI_CALLER, { kind: 'bad' });
  const names = ['openSheet', 'confirmDialog', 'toast ok', 'toast warn', 'toast bad'];
  let n = 0;
  for (let i = mark; i < created.length; i++) if (created[i].innerHTML) out.push([names[n++] || 'overlay', created[i].innerHTML]);
  return out;
}

// Which renders still hold a Latin letter in a word. Returns [] when the chrome is wholly Hindi.
function englishLeaks(win, created) {
  const bad = [];
  for (const [name, html] of chromeRenders(win, created)) {
    const words = spoken(html);
    if (/[A-Za-z]/.test(words)) bad.push(name + ': ' + JSON.stringify(words));
  }
  return bad;
}

/* =====================================================================================================
 * 0. THE FILE'S OWN SHAPE
 * ===================================================================================================== */
test('v2/ui/words.js loads as a plain script and attaches exactly W and w', () => {
  const sandbox = { };
  sandbox.window = sandbox;
  sandbox.document = { documentElement: { lang: 'en' } };
  const ctx = vm.createContext(sandbox);
  const before = Object.keys(sandbox);
  vm.runInContext(read(WORDS), ctx, { filename: WORDS });
  assert.deepEqual(Object.keys(sandbox).filter((k) => !before.includes(k)).sort(), ['W', 'w']);
  assert.strictEqual(typeof sandbox.w, 'function');
  for (const k of ['register', 'lang', 'ids', 'pending', 'entry']) assert.strictEqual(typeof sandbox.W[k], 'function', 'W.' + k);
  assert(Array.isArray(sandbox.W.chrome), 'W.chrome is data a check can read');
});

test('W.chrome is exactly the 21 ids v2-foundation-ui.md section 6.3 names', () => {
  // Transcribed from section 6.3, not from the file, so the file cannot define its own answer.
  const SPEC = ['nothingToShow', 'somethingWrong', 'retry', 'reloadToRetry', 'offline', 'offlineHint', 'loading',
    'noData', 'updatedAgo', 'justNow', 'minutesAgo', 'hoursAgo', 'daysAgo', 'mayBeOld', 'timeUnknown', 'close',
    'confirm', 'cancel', 'toastOk', 'toastWarn', 'toastBad'];
  const { win } = load();
  assert.strictEqual(SPEC.length, 21);
  assert.deepEqual(win.W.chrome.slice().sort(), SPEC.slice().sort());
  assert.deepEqual(win.W.ids().sort(), SPEC.slice().sort(), 'every chrome id is registered once the drawing files load');
});

test('W.lang() reads the document, so it cannot disagree with the font and line height :lang(hi) sets', () => {
  assert.strictEqual(load({ lang: 'en' }).win.W.lang(), 'en');
  assert.strictEqual(load({ lang: 'hi' }).win.W.lang(), 'hi');
  assert.strictEqual(load({ lang: 'hi-IN' }).win.W.lang(), 'hi');
  assert.strictEqual(load({ lang: '' }).win.W.lang(), 'en');
});

test('an unregistered id throws at the first call rather than drawing a blank', () => {
  const { win } = load();
  assert.throws(() => win.w('noSuchId'), /noSuchId/);
});

test('registering the same half of an id twice throws: one word, one place', () => {
  const { win } = load();
  assert.throws(() => win.W.register({ noData: { hi: 'x' } }), /noData\.hi/);
  assert.doesNotThrow(() => win.W.register({ brandNewId: { en: 'A', hi: '' } }));
});

/* =====================================================================================================
 * 1 and 2. KEY PARITY, AND THE CHROME MAY NOT BE PENDING
 * ===================================================================================================== */
function parityFailures(merged) {
  const out = [];
  for (const id of Object.keys(merged).sort()) {
    const e = merged[id];
    if (!('en' in e)) out.push(id + ' (' + e.where.join(', ') + ') has no en value');
    else if (e.en === '') out.push(id + ' (' + e.where.join(', ') + ') has an empty en value');
    if (!('hi' in e)) out.push(id + ' (' + e.where.join(', ') + ') has no hi key: an id with no hi key is an id nobody is told is missing');
  }
  return out;
}

const isPending = (hi) => hi === undefined || hi === '' || /:\s*''/.test(String(hi));

function chromeFailures(merged, chrome) {
  const out = [];
  for (const id of chrome) {
    if (!(id in merged)) { out.push(id + ' is a chrome id and is registered nowhere under v2/'); continue; }
    if (isPending(merged[id].hi)) out.push(id + ' is a chrome id with an empty hi: the chrome is on all thirteen screens and has nowhere to hide');
  }
  return out;
}

test('key parity: every id registered anywhere under v2/ has an en value and an hi key, naming the first offender', () => {
  assert.deepEqual(parityFailures(mergedTables()), []);
});

test('the chrome is not allowed to be pending: all 21 ids have a real Hindi value', () => {
  const { win } = load();
  assert.deepEqual(chromeFailures(mergedTables(), win.W.chrome), []);
});

/* A `word` NOBODY REGISTERS IS A SCREEN NAME IN ENGLISH, and nothing else here could see it.
 *
 * `Caps.SCREENS[id]` carries `title: 'Duty board'` beside `word: 'scDuty'`, and DECISIONS.md 17
 * exempts the title from the English-literal scan precisely BECAUSE the word sits next to it holding
 * the Hindi. `Shell`'s nameOf() and `duty.js`'s both read the word first and fall back to the title
 * when `w()` throws -- which it does for an id nobody registered. The fallback is silent and
 * unmarked, so in Hindi the nav, the header and every cross-reference to that screen draw plain
 * English, which is the exact shape of the defect section 6.3 exists to prevent.
 *
 * TEN OF THE THIRTEEN were in that state: only scMe, scPeople and scReviews were ever registered.
 * Every other check here reads the tables, and an id that is referenced but never registered is in
 * no table. This one reads the OTHER END -- what caps.js promises -- and that is the only place the
 * gap is visible. */
function screenWordFailures(capsSrc, merged) {
  const out = [];
  const re = /title:\s*'([^']*)'\s*,\s*word:\s*'([A-Za-z0-9_]+)'/g;
  let m, seen = 0;
  while ((m = re.exec(capsSrc)) !== null) {
    seen++;
    const [, title, word] = m;
    if (!merged[word]) { out.push(word + ' (' + title + ') is named by caps.js and registered nowhere'); continue; }
    if (merged[word].en === undefined) out.push(word + ' has no English value');
    if (!('hi' in merged[word])) out.push(word + ' has no Hindi key');
  }
  if (!seen) out.push('no title/word pair was found in caps.js at all: this check read nothing');
  return out;
}

test('the screen-word detector catches an unregistered word, a missing half, and an empty read', () => {
  const caps = "me: { title: 'Me', word: 'scMe' },\n  duty: { title: 'Duty board', word: 'scDuty' },";
  assert.deepEqual(screenWordFailures(caps, { scMe: { en: 'Me', hi: 'x' }, scDuty: { en: 'D', hi: 'y' } }), []);
  assert.strictEqual(screenWordFailures(caps, { scMe: { en: 'Me', hi: 'x' } }).length, 1);
  assert.strictEqual(screenWordFailures(caps, { scMe: { en: 'Me' }, scDuty: { en: 'D', hi: 'y' } }).length, 1);
  assert.strictEqual(screenWordFailures('', {}).length, 1);
});

test("every screen name caps.js promises is a word somebody registered, not a title in English", () => {
  assert.deepEqual(screenWordFailures(read(path.join(ROOT, 'v2', 'caps.js')), mergedTables()), []);
});

/* 3. THE PENDING COUNT, PRINTED EVERY RUN. Not a test - a report, so that the number is in front of whoever
 * ran the suite whether or not anything failed. A pending mechanism nobody empties is the leak with extra
 * steps, and a count printed only on failure is a count nobody reads. */
(function printPending() {
  const { win } = load();
  const merged = mergedTables();
  const ids = Object.keys(merged).sort();
  const chrome = win.W.chrome;
  const screen = ids.filter((id) => chrome.indexOf(id) < 0);
  const pending = screen.filter((id) => isPending(merged[id].hi));
  console.log('');
  console.log('  HINDI: ' + chrome.length + ' chrome ids, all translated (an empty one fails the run above).');
  console.log('  HINDI: ' + screen.length + ' screen label' + (screen.length === 1 ? '' : 's') + ' registered, '
    + pending.length + ' pending. This number must reach 0.');
  if (pending.length) console.log('  HINDI: pending -> ' + pending.join(', '));
  console.log('  HINDI: the Hindi is THE OWNER\'S. He is the only Hindi speaker on this project, and the');
  console.log('         screen copy tables (screens-shell.md 2.6, 3.9, 4.6 and the rest) say "needed" about');
  console.log('         110 times, so expect about 130 ids in all. Until that sitting happens the count does');
  console.log('         not move, and a pending label draws its English with its id after it, in Hindi mode,');
  console.log('         so the reader can see it is missing instead of reading English as the design.');
  console.log('');
})();

/* =====================================================================================================
 * 4. NO ENGLISH SURVIVES IN HINDI -- the check that would have caught Trip cash
 * ===================================================================================================== */
test('every chrome primitive rendered with the document language Hindi holds no Latin letter in any fixed word', () => {
  const { win, created } = load({ lang: 'hi' });
  assert(chromeRenders(win, created).length >= 15, 'the surface being checked shrank');
  assert.deepEqual(englishLeaks(win, created), []);
});

test('in English the same primitives still say exactly what they said before the rewiring', () => {
  const { win } = load({ lang: 'en' });
  assert.strictEqual(spoken(win.offlineState()), 'Offline No connection. What you see may be out of date.');
  assert.strictEqual(spoken(win.emptyState(null)), 'Nothing to show');
  assert.strictEqual(spoken(win.errorState('', function () {})), 'Something went wrong Retry');
  assert.strictEqual(spoken(win.skeleton(1)), 'Loading');
  assert.strictEqual(spoken(win.figure(null)), 'No data \u2014 No data');
  assert(/^42 Updated \d+ days ago$/.test(spoken(win.figure(42, { at: 1 }))), spoken(win.figure(42, { at: 1 })));
  assert.strictEqual(spoken(win.figure(42, { stale: true })), '42 May be out of date');
  assert.strictEqual(spoken(win.figure(42, { at: 'nope' })), '42 Updated time unknown');
});

test('a pending label draws its English WITH ITS ID in Hindi, and its plain English in English', () => {
  const hi = load({ lang: 'hi' }).win;
  hi.W.register({ meTitle: { en: 'Me', hi: '' } });
  assert.strictEqual(hi.w('meTitle'), 'Me [meTitle]');
  const en = load({ lang: 'en' }).win;
  en.W.register({ meTitle: { en: 'Me', hi: '' } });
  assert.strictEqual(en.w('meTitle'), 'Me', 'an English reader must not be shown the id');
});

/* 5. NO LITERAL ESCAPES THE TABLE
 * ===================================================================================================== */
/* The one string in v2 that is allowed to be a fixed English word outside a register literal, with its
 * reason, and pinned below so it cannot drift from the table. Exactly one entry: a second one has to be added
 * here, in a diff a reviewer sees, which is the point. */
const PINNED = [{
  file: 'v2/ui/states.js', text: 'Updated ',
  why: "test_ui_states.js's mutant \"the age is dropped from a stale figure\" patches the exact expression "
    + "`'Updated ' + age`. Removing it deletes that mutant's target, which is weakening an existing check.",
  id: 'updatedAgo'
}];

/* A value the code TESTS FOR is not a word it shows: ev.key === 'Escape' is a DOM key name, and a check that
 * cannot tell it from a label would be answered by an allowlist that grows until it means nothing. */
function isComparedValue(src, lit) {
  const before = src.slice(Math.max(0, lit.start - 14), lit.start);
  const after = src.slice(lit.end, lit.end + 14);
  return /(===|!==|==|!=|\bcase)\s*$/.test(before) || /^\s*(===|!==|==|!=)/.test(after);
}

/* A string handed to new Error() is a message for whoever is reading a stack trace, not a word drawn for a
 * reader: v2's refusals reach a person through errorState's caller text, with a reason and a Retry
 * (v2-contract.md 4.0), never as a thrown Error's message. So those are not words this rule is about. */
function thrownSpans(src) {
  const out = [];
  const re = /\bnew\s+(?:Error|TypeError|RangeError)\s*\(/g;
  let m;
  while ((m = re.exec(src)) !== null) out.push(balanced(src, m.index + m[0].length - 1));
  return out;
}

const CAPPED = /\b[A-Z][a-z]+\b/;

function literalFailures(files) {
  const out = [];
  for (const f of files || V2_FILES) {
    const src = stripComments(read(f));
    if (!draws(src)) continue;
    const spans = registerSpans(src);
    const thrown = thrownSpans(src);
    /* DECISIONS.md section 17: Caps.SCREENS's `title` field is exempt, and that field only, because
     * screens-shell.md 1.6 wants one name in three places and that table is the single literal where all
     * thirteen can be verified at once. `word` already sits beside it for the Hindi id, so nothing is lost. */
    const titles = [];
    const t = /\btitle\s*:\s*/g;
    let tm;
    while ((tm = t.exec(src)) !== null) { const l = literals(src.slice(tm.index + tm[0].length, tm.index + tm[0].length + 200))[0]; if (l && l.start === 0) titles.push(tm.index + tm[0].length + l.end); }
    for (const lit of literals(src)) {
      if (!CAPPED.test(lit.text)) continue;
      if (spans.some((s) => lit.start >= s.start && lit.end <= s.end)) continue;
      if (titles.includes(lit.end)) continue;
      if (isComparedValue(src, lit)) continue;
      if (thrown.some((t) => lit.start >= t.start && lit.end <= t.end)) continue;
      if (PINNED.some((p) => p.file === rel(f) && p.text === lit.text)) continue;
      out.push(rel(f) + ':' + (src.slice(0, lit.start).split('\n').length) + ' ' + JSON.stringify(lit.text));
    }
  }
  return out;
}

test('no quoted, capitalised English word sits in a v2 file that draws, outside a W.register literal', () => {
  assert.deepEqual(literalFailures(), []);
});

test('the one pinned exception is still exactly one, and still says what the table says', () => {
  assert.strictEqual(PINNED.length, 1, 'a second hard-coded word was pinned instead of registered');
  const { win } = load({ lang: 'en' });
  const p = PINNED[0];
  // Comments out first: the reason for the pin is written in a comment NEXT TO the expression, and a check
  // that reads the raw file would be satisfied by the prose after the code it describes had gone.
  assert(stripComments(read(path.join(ROOT, p.file))).includes("'" + p.text + "' + age"),
    'the pinned expression is no longer in ' + p.file + ', so either the pin or the mutant it serves is dead');
  const merged = mergedTables()[p.id];
  assert.strictEqual(merged.en.replace('{0}', 'X'), p.text + 'X', 'the pinned English and the table disagree');
  assert(!isPending(merged.hi), 'the pinned id has no Hindi, so the pin hides a leak');
  assert.strictEqual(win.figure(42, { at: 1 }).indexOf(p.text) > 0, true);
});

test('DECISIONS.md section 17 holds: a title field keeps its English, a word beside it does not', () => {
  const fixture = ['var SCREENS = {', "  me: { title: 'Me', word: 'scMe' },", '};',
    "document.body.innerHTML = '<p>' + SCREENS.me.title + '</p>';"].join('\n');
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'v2words-'));
  const f = path.join(dir, 'caps.js');
  fs.writeFileSync(f, fixture);
  assert.deepEqual(literalFailures([f]), [], 'a SCREENS title was flagged');
  fs.writeFileSync(f, fixture.replace("word: 'scMe'", "word: 'More'"));
  assert(literalFailures([f]).length === 1, 'a capitalised word in a field that is NOT title was not flagged');
  fs.rmSync(dir, { recursive: true, force: true });
});

/* 6. THE PLURAL SELECTOR
 * ===================================================================================================== */
/* The FORM, with the count taken out. `w(id, 1) !== w(id, 3)` on its own is not a test of the selector: {n}
 * alone makes those two differ, so a table that had collapsed one and other into a single form would still
 * pass it. What must differ in English is the words around the number. */
const formOf = (s) => String(s).replace(/\d+/g, '#');

function pluralFailures(win, hiWin) {
  const out = [];
  for (const id of ['minutesAgo', 'hoursAgo', 'daysAgo']) {
    if (win.w(id, 1) === win.w(id, 3)) out.push(id + ' reads the same for 1 and 3 in English');
    if (formOf(win.w(id, 1)) === formOf(win.w(id, 3))) out.push(id + ' has one English form for 1 and 3: the plural selector is not doing anything');
    if (win.w(id, 1).indexOf('1 ') !== 0 || win.w(id, 3).indexOf('3 ') !== 0) out.push(id + ' lost its count in English');
    if (formOf(hiWin.w(id, 1)) !== formOf(hiWin.w(id, 3))) out.push(id + ' has two Hindi forms where Hindi takes one');
    if (hiWin.w(id, 7).indexOf('7 ') !== 0) out.push(id + ' lost its count in Hindi');
    if (/[A-Za-z]/.test(hiWin.w(id, 7))) out.push(id + ' is English in Hindi');
  }
  return out;
}

test("w(id, n) selects a form: English pluralises, Hindi takes one form, and {n} is the count's place", () => {
  assert.deepEqual(pluralFailures(load({ lang: 'en' }).win, load({ lang: 'hi' }).win), []);
  const en = load({ lang: 'en' }).win;
  assert.strictEqual(en.w('minutesAgo', 1), '1 minute ago');
  assert.strictEqual(en.w('minutesAgo', 3), '3 minutes ago');
});

/* =====================================================================================================
 * MUTANTS: each check above, broken on purpose
 * ===================================================================================================== */
const states = () => read(STATES);
const overlay = () => read(OVERLAY);
const words = () => read(WORDS);
function swap(src, from, to) {
  assert(src.includes(from), 'mutation target not found (the source changed under the self-test): ' + from);
  return src.split(from).join(to);
}
function tmp(name, src) {
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'v2words-'));
  const f = path.join(dir, name);
  fs.writeFileSync(f, src);
  return f;
}

test('MUTANT must fail: an id registered with only en (the parity check)', () => {
  const f = tmp('screen.js', "W.register({ someLabel: { en: 'Standing' } });\nvar h = '<p>x</p>';\n");
  const bad = parityFailures(mergedTables([f]));
  assert(bad.length === 1 && /someLabel.*no hi key/.test(bad[0]), 'parity stayed green: ' + JSON.stringify(bad));
  fs.rmSync(path.dirname(f), { recursive: true, force: true });
});

test('MUTANT must fail: a chrome word left untranslated (the chrome check)', () => {
  const { win } = load();
  const f = tmp('words.js', swap(words(), "retry: { hi: 'दोबारा कोशिश' }", "retry: { hi: '' }"));
  const bad = chromeFailures(mergedTables([f, STATES, OVERLAY]), win.W.chrome);
  assert(bad.length === 1 && /^retry is a chrome id with an empty hi/.test(bad[0]), 'the chrome check stayed green: ' + JSON.stringify(bad));
  fs.rmSync(path.dirname(f), { recursive: true, force: true });
});

test('MUTANT must fail: one English literal left behind in states.js, and one in overlay.js (the Hindi render check)', () => {
  const cases = [
    ['states', swap(states(), "esc(w('offline'))", "'Offline'"), /offlineState/],
    ['states', swap(states(), "esc(w('loading'))", "'Loading'"), /skeleton/],
    ['states', swap(states(), "words(text, w('nothingToShow'))", "words(text, 'Nothing to show')"), /emptyState/],
    ['states', swap(states(), "esc(w('noData'))", "'No data'"), /figure \(unknown\)/],
    ['overlay', swap(overlay(), "esc(w('close'))", "'Close'"), /openSheet|toast/],
    ['overlay', swap(overlay(), "w('cancel')", "'Cancel'"), /confirmDialog/],
    ['overlay', swap(overlay(), "esc(w(k.word))", "'Done'"), /toast/]
  ];
  for (const [which, src, expected] of cases) {
    const files = { words: words(), states: states(), overlay: overlay() };
    files[which] = src;
    const { win, created } = load({ lang: 'hi', files });
    const leaks = englishLeaks(win, created);
    assert(leaks.length > 0, 'the Hindi check stayed green against a hard-coded word in ' + which);
    assert(leaks.some((l) => expected.test(l)), 'it went red, but not where the word was (' + expected + '): ' + leaks.join(' | '));
  }
});

test('MUTANT must fail: the fallback goes silent again, rendering English in Hindi mode with nothing to show it (the whole defect)', () => {
  const src = swap(words(), "return hi === null || hi === '' ? en + ' [' + id + ']' : hi;", "return hi === null || hi === '' ? en : hi;");
  const { win } = load({ lang: 'hi', files: { words: src, states: states(), overlay: overlay() } });
  win.W.register({ meTitle: { en: 'Me', hi: '' } });
  assert.strictEqual(win.w('meTitle'), 'Me');
  assert.notStrictEqual(win.w('meTitle'), 'Me [meTitle]', 'the pending mark is gone and nothing noticed');
  // and the check that must notice it:
  assert.throws(() => assert.strictEqual(win.w('meTitle'), 'Me [meTitle]'), /Me/);
});

test('MUTANT must fail: a 22nd word hard-coded in a drawing file (the literal scan)', () => {
  const f = tmp('screen.js', "var h = '<p>Standing 6 h.</p>';\n");
  assert(literalFailures([f]).length === 1, 'the literal scan missed a hard-coded word');
  const ok = tmp('screen2.js', "W.register({ standingHours: { en: 'Standing 6 h.', hi: '' } });\nvar h = '<p>' + w('standingHours') + '</p>';\n");
  assert.deepEqual(literalFailures([ok]), [], 'the literal scan flagged a registered word');
  const keyed = tmp('screen3.js', "var T = { standingHours: { en: 'Standing 6 h.', hi: '' } };\nW.register(T);\nvar h = '<p>' + w('standingHours') + '</p>';\n");
  assert.deepEqual(literalFailures([keyed]), [], 'the literal scan flagged a table referenced by name');
  const cmp = tmp('screen4.js', "var h = '<p>x</p>';\nif (ev.key === 'Escape') { x(); }\n");
  assert.deepEqual(literalFailures([cmp]), [], 'a value the code tests for was read as a word it shows');
  for (const p of [f, ok, keyed, cmp]) fs.rmSync(path.dirname(p), { recursive: true, force: true });
});

test('MUTANT must fail: the plural selector collapsed in English, and given two forms in Hindi', () => {
  const collapsed = swap(states(), "minutesAgo: { en: { one: '{n} minute ago', other: '{n} minutes ago' } }", "minutesAgo: { en: '{n} minutes ago' }");
  const bad = pluralFailures(load({ lang: 'en', files: { words: words(), states: collapsed, overlay: overlay() } }).win,
    load({ lang: 'hi', files: { words: words(), states: collapsed, overlay: overlay() } }).win);
  assert(bad.length > 0 && /one English form/.test(bad[0]), 'a collapsed selector went unnoticed: ' + JSON.stringify(bad));

  const twoHindi = swap(words(), "minutesAgo: { hi: { one: '{n} \u092e\u093f\u0928\u091f \u092a\u0939\u0932\u0947', other: '{n} \u092e\u093f\u0928\u091f \u092a\u0939\u0932\u0947' } }",
    "minutesAgo: { hi: { one: '{n} \u092e\u093f\u0928\u091f', other: '{n} \u092e\u093f\u0928\u091f \u092a\u0939\u0932\u0947' } }");
  const bad2 = pluralFailures(load({ lang: 'en', files: { words: twoHindi, states: states(), overlay: overlay() } }).win,
    load({ lang: 'hi', files: { words: twoHindi, states: states(), overlay: overlay() } }).win);
  assert(bad2.some((x) => /two Hindi forms/.test(x)), 'a second Hindi form went unnoticed: ' + JSON.stringify(bad2));
});

/* =====================================================================================================
 * COVER: the only run that points an existing suite at the file that changed
 * =====================================================================================================
 * scripts/run-tests.py discovers test_*.js at the repo root, and test_ui_states.js and test_ui_overlay.js
 * both DEFAULT to v1's ui/ copies. So nothing in the gate was reading v2/ui/states.js at all: a check nobody
 * runs against the file that changed is the hazard in this slice. The states suite is fast and runs here.
 * The overlay suite is NOT run from here: it drives real Chrome and takes 60-90s, and a gate that takes a
 * minute and a half longer per run is a gate people start skipping. It has to be run by hand:
 *     OVERLAY_JS=v2/ui/overlay.js COMPONENTS_CSS=v2/ui/components.css node test_ui_overlay.js
 * Said here, in the file, because the alternative is it being said once in a report nobody reads again. */
test('the existing states suite passes against v2/ui/states.js (STATES_JS), the copy this slice rewired', () => {
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'test_ui_states.js')], {
      cwd: ROOT, encoding: 'utf8', timeout: 120000,
      env: Object.assign({}, process.env, { STATES_JS: 'v2/ui/states.js', COMPONENTS_CSS: 'v2/ui/components.css' })
    });
  } catch (e) {
    throw new Error('test_ui_states.js failed against v2/ui/states.js:\n' + String(e.stdout || e.message).split('\n').filter((l) => /FAIL|Error/.test(l)).join('\n'));
  }
});

console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
process.exit(fails ? 1 : 0);

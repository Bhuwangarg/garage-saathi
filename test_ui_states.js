/* Tests for ui/states.js - empty, error, offline, loading and the one-number figure.
 * Run: node test_ui_states.js   (needs no browser; exits non-zero on any failure)
 *
 * THE POINT OF THE FILE. The app is offline-first, so what is on screen is often not currently true. Three
 * things must never look alike:
 *      unknown   no value at all           -> an em dash (and the words "No data" for a screen reader)
 *      zero      a real reading of 0       -> 0
 *      stale     a value, but an old one   -> the value AND how old it is
 * Reading "no challans outstanding" off a screen that simply has not synced is the failure this guards.
 * `0` is falsy in JavaScript, so the code under test must ask `value == null`, never `!value`; the tests below
 * go red against a copy that asks the wrong question (see MUTANTS).
 *
 * How the markup is read: states.js returns strings. A tiny HTML reader (parseHtml) turns them into a tree
 * so the tests ask "what text would a sighted user see" (visualText) and "what would a screen reader say"
 * (spokenText) instead of grepping for substrings. The reader throws on markup it cannot make a balanced
 * tree of, so a malformed tag fails loudly. It is itself tested first.
 *
 * The file is loaded the way a page loads it: a plain script in a context that has a `window` and NOTHING
 * else, plus a controllable clock (states.js may only call Date.now and Date.parse) and a stub `document`
 * that records the one click listener states.js installs for the Retry button. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FILE = process.env.STATES_JS || path.join(__dirname, 'ui', 'states.js');
const ICONS_FILE = path.join(__dirname, 'ui', 'icons.js');
const CSS_FILE = path.join(__dirname, 'ui', 'components.css');
let fails = 0;
function test(name, fn) {
  try { fn(); console.log('  ok  ' + name); }
  catch (e) { console.log(' FAIL ' + name + '\n        ' + String(e.message).split('\n').join('\n        ')); fails++; }
}

const SOURCE = fs.existsSync(FILE) ? fs.readFileSync(FILE, 'utf8') : null;
const need = () => { if (SOURCE === null) throw new Error(path.relative(__dirname, FILE) + ' does not exist'); return SOURCE; };
const ICONS_SOURCE = fs.readFileSync(ICONS_FILE, 'utf8');
const CSS = fs.readFileSync(CSS_FILE, 'utf8');

const DASH = '—';
const NOW = Date.UTC(2026, 10, 1, 12, 0, 0);
const MIN = 60e3, HOUR = 3600e3, DAY = 86400e3;

/* ---------- loading: a plain script, a window, a clock, a stub document ---------- */
// load({source, icons, document}) -> {win, clock, doc}. A fresh context each time, so nothing leaks between tests.
function load(o) {
  o = o || {};
  const clock = { now: NOW };
  const listeners = [];
  const sandbox = {};
  sandbox.window = sandbox;
  sandbox.Date = { now: () => clock.now, parse: Date.parse };       // states.js may not use `new Date`
  const doc = { listeners, addEventListener: (type, fn) => listeners.push({ type, fn }) };
  if (o.document !== false) sandbox.document = doc;
  const ctx = vm.createContext(sandbox);
  if (o.icons !== false) vm.runInContext(ICONS_SOURCE, ctx, { filename: ICONS_FILE });
  const before = Object.keys(sandbox);
  vm.runInContext(o.source === undefined ? need() : o.source, ctx, { filename: FILE });
  return { win: sandbox, clock, doc, added: Object.keys(sandbox).filter((k) => !before.includes(k)) };
}

/* =====================================================================================================
 * A TINY HTML READER, and its self-test
 * ===================================================================================================== */
const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const decode = (s) => s.replace(/&(?:amp|lt|gt|quot|#39);/g, (m) => ENT[m]);
// Tag:  <name attr="v" attr2="v2" ...> or </name> or <name .../>.  Text: anything up to the next "<".
const TOKEN = /<(\/?)([a-zA-Z][\w-]*)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>|([^<]+)/y;
function parseHtml(html) {
  const root = { tag: '#root', attrs: {}, children: [], parent: null };
  let cur = root, pos = 0;
  TOKEN.lastIndex = 0;
  while (pos < html.length) {
    TOKEN.lastIndex = pos;
    const m = TOKEN.exec(html);
    if (!m) throw new Error('markup the reader cannot parse at: ' + html.slice(pos, pos + 40));
    pos = TOKEN.lastIndex;
    if (m[5] !== undefined) { cur.children.push({ text: decode(m[5]) }); continue; }
    if (m[1]) {
      if (cur.tag !== m[2]) throw new Error('mismatched close tag </' + m[2] + '> inside <' + cur.tag + '>');
      cur = cur.parent; continue;
    }
    const attrs = {};
    String(m[3]).replace(/([\w:-]+)="([^"]*)"/g, (_, k, v) => { if (k in attrs) throw new Error('duplicate attribute ' + k); attrs[k] = decode(v); return ''; });
    const el = { tag: m[2], attrs, children: [], parent: cur };
    cur.children.push(el);
    if (!m[4]) cur = el;
  }
  if (cur !== root) throw new Error('unclosed <' + cur.tag + '>');
  return root;
}
const isEl = (n) => n.tag !== undefined;
const classesOf = (el) => (el.attrs['class'] || '').split(/\s+/).filter(Boolean);
function walk(n, fn) { if (isEl(n)) { fn(n); n.children.forEach((c) => walk(c, fn)); } }
function findAll(n, pred) { const out = []; walk(n, (e) => { if (e.tag !== '#root' && pred(e)) out.push(e); }); return out; }
const byClass = (n, c) => findAll(n, (e) => classesOf(e).includes(c));
// What a SIGHTED user reads: everything except visually hidden text and drawings. An aria-hidden element IS seen.
const BLOCK = ['div', 'p', 'button', 'li', 'section'];   // these start a new line on screen and in a screen reader
function textOf(n, skip) {
  if (!isEl(n)) return n.text;
  if (n.tag !== '#root' && skip(n)) return '';
  const inner = n.children.map((c) => textOf(c, skip)).join('');
  return BLOCK.includes(n.tag) ? ' ' + inner + ' ' : inner;
}
const squash = (s) => s.replace(/\s+/g, ' ').trim();
const visualText = (html) => squash(textOf(parseHtml(html), (e) => e.tag === 'svg' || classesOf(e).includes('sr-only')));
// What a SCREEN READER says: everything except aria-hidden and drawings with no title. An sr-only element IS spoken.
const spokenText = (html) => squash(textOf(parseHtml(html), (e) => e.attrs['aria-hidden'] === 'true' || (e.tag === 'svg' && e.attrs.role !== 'img')));
const first = (html, c) => { const l = byClass(parseHtml(html), c); assert(l.length, 'no .' + c + ' in ' + html); return l[0]; };

test('the HTML reader builds a tree, decodes entities, and tells what is seen from what is spoken', () => {
  const h = '<div class="a b" role="status"><svg aria-hidden="true"><path d="M1"/></svg><span aria-hidden="true">X</span><span class="sr-only">Y</span>Z &amp; &lt;i&gt;</div>';
  const t = parseHtml(h), div = t.children[0];
  assert.strictEqual(div.tag, 'div'); assert.deepEqual(classesOf(div), ['a', 'b']); assert.strictEqual(div.attrs.role, 'status');
  assert.strictEqual(visualText(h), 'XZ & <i>', 'seen: the aria-hidden X yes, the sr-only Y and the svg no');
  assert.strictEqual(spokenText(h), 'YZ & <i>', 'spoken: the sr-only Y yes, the aria-hidden X and the svg no');
  assert.strictEqual(spokenText('<svg role="img"><title>Warn</title></svg>'), 'Warn', 'a titled svg is spoken');
});
test('the HTML reader throws on a mismatched close tag, an unclosed tag, an unquoted attribute, a duplicate attribute and a stray "<"', () => {
  for (const bad of ['<div><span></div>', '<div>', '<div class=a></div>', '<div class="a" class="b"></div>', '<div>a < b</div>', '</div>', '<div></span></div>'])
    assert.throws(() => parseHtml(bad), /./, 'accepted: ' + bad);
  assert.doesNotThrow(() => parseHtml('<div>a &lt; b</div>'));
});

/* =====================================================================================================
 * PLAIN-SCRIPT CONTRACT
 * ===================================================================================================== */
function es6Syntax(code) {   // the same tripwire test_ui_icons.js uses; spelled-out syntax, not a parser
  const c = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, '""');
  const found = [];
  if (/=>/.test(c)) found.push('arrow function');
  if (/`/.test(c)) found.push('template literal');
  if (/(^|[^\w$.])(let|const|class|import|export|async|await|yield)\s/.test(c)) found.push('let/const/class/import/export/async/await/yield');
  if (/\.\.\./.test(c)) found.push('spread/rest');
  if (/\bmodule\s*\.\s*exports\b|\brequire\s*\(/.test(c)) found.push('CommonJS');
  if (/\bSymbol\b|\bPromise\b|\bMap\s*\(|\bSet\s*\(|Object\.assign|\.includes\(|\.startsWith\(|\.endsWith\(|\.padStart\(|\.repeat\(|\bArray\.from\b|\.find\(|\.findIndex\(|\bNumber\.is/.test(c)) found.push('ES2015+ library call');
  if (/\bnew\s+Date\b/.test(c)) found.push('new Date (the tests control only Date.now and Date.parse)');
  return found;
}
test('the ES5 tripwire flags the constructs it claims to, and passes plain ES5', () => {
  const bad = ['var f = (a) => a;', 'var s = `x`;', 'let a = 1;', 'const a = 1;', 'class A {}', 'f(...a);', 'module.exports = {};', 'var a = require("x");', 'a.includes(b);', 'Object.assign({}, a);',
    'import a from "x";', 'async function f() {}', 'new Promise(f);', 'a.startsWith("x");', 'a.endsWith("x");', 'a.padStart(2);', 'a.repeat(2);', 'a.find(f);', 'a.findIndex(f);', 'Number.isFinite(1);', 'new Date(1);',
    'var s = Symbol("a");', 'var m = new Map();', 'var m = new Set();', 'Array.from(a);', 'await f();', 'yield 1;', 'export var a = 1;'];
  for (const b of bad) assert(es6Syntax(b).length > 0, 'tripwire missed: ' + b);
  assert.deepEqual(es6Syntax('var a = {}; function f(x) { return x.indexOf("let const class => ...") < 0 && Date.now(); } // const `\n/* class */ window.f = f;'), [], 'false positive');
});
test('ui/states.js loads as a plain script, is free of ES2015+ constructs, and attaches exactly emptyState, errorState, offlineState, skeleton and figure to window', () => {
  assert.deepEqual(es6Syntax(need()), []);
  const { win, added } = load();
  assert.deepEqual(added.slice().sort(), ['emptyState', 'errorState', 'figure', 'offlineState', 'skeleton']);
  for (const k of added) assert.strictEqual(typeof win[k], 'function', k);
});
test('ui/states.js is pure ASCII: no emoji, and the em dash is written as an escape so no file encoding can corrupt it', () => {
  assert(/[^\x00-\x7F]/.test('x \u{1F68C}') && /[^\x00-\x7F]/.test(DASH) && !/[^\x00-\x7F]/.test('plain'), 'detector is broken');
  assert(!/[^\x00-\x7F]/.test(need()), 'non-ASCII character in ui/states.js');
  assert(/\\u2014/.test(need()), 'the dash should be spelled \\u2014 in the source');
  assert(load().win.figure(null).includes(DASH), 'and it must still come out as the real character');
});

/* =====================================================================================================
 * 1. FIGURE: unknown, zero and stale are three different things
 * ===================================================================================================== */
// Every claim about figure() in one function, so the same checks can be pointed at a broken copy.
// Returns a list of failures; empty means the behaviour holds.
function figureFailures(win, clock) {
  const out = [];
  const fig = (v, o) => win.figure(v, o);
  const digits = (s) => /[0-9]/.test(s);
  const bad = (msg) => out.push(msg);

  // UNKNOWN: no value is a dash. Never a digit. A screen reader hears the words, not a dash.
  const UNKNOWN = [['null', null], ['undefined', undefined], ['NaN', NaN], ['Infinity', Infinity], ['-Infinity', -Infinity], ['empty string', ''], ['spaces', '   '],
    ['an object', {}], ['an array', []], ['true', true], ['false', false], ['a function', function () {}]];
  for (const [label, v] of UNKNOWN) {
    let h; try { h = fig(v); } catch (e) { bad('figure(' + label + ') threw ' + e.message); continue; }
    let vis, spk, root;
    try { vis = visualText(h); spk = spokenText(h); root = first(h, 'figure'); } catch (e) { bad('figure(' + label + ') is not well-formed markup: ' + e.message); continue; }
    if (vis !== DASH) bad('figure(' + label + ') shows "' + vis + '" to a sighted user, expected only an em dash');
    if (spk !== 'No data') bad('figure(' + label + ') says "' + spk + '" to a screen reader, expected "No data"');
    if (digits(vis) || digits(spk)) bad('figure(' + label + ') shows a digit, so it can be read as a reading');
    if (root.attrs['data-state'] !== 'unknown') bad('figure(' + label + ') is marked data-state="' + root.attrs['data-state'] + '"');
    if (/\b(null|undefined|NaN|Infinity|object|function)\b/i.test(vis + spk)) bad('figure(' + label + ') leaks the word for the bad input: ' + vis + spk);
  }
  // an unknown figure carries no unit and no age, even when the caller passes both
  { const h = fig(null, { unit: 'km', at: NOW - 3 * HOUR, stale: true });
    if (visualText(h) !== DASH) bad('figure(null, {unit, at, stale}) shows "' + visualText(h) + '": an unknown value has no unit and no age'); }

  // ZERO: a real reading. Shows 0, never the dash, in every spelling of zero.
  const ZERO = [['0', 0], ['-0', -0], ['0.0', 0.0], ['the string "0"', '0'], ['the string "0.00"', '0.00']];
  for (const [label, v] of ZERO) {
    const h = fig(v), shown = label.startsWith('the string') ? v : '0';
    const vis = visualText(h), spk = spokenText(h);
    if (vis !== shown) bad('figure(' + label + ') shows "' + vis + '", expected "' + shown + '"');
    if (spk !== shown) bad('figure(' + label + ') says "' + spk + '" to a screen reader, expected "' + shown + '"');
    if (h.includes(DASH)) bad('figure(' + label + ') contains a dash: a real zero must not look like no data');
    if (first(h, 'figure').attrs['data-state'] !== 'value') bad('figure(' + label + ') is marked data-state="' + first(h, 'figure').attrs['data-state'] + '"');
  }

  // A VALUE: shown exactly, with its unit, and no age when it is fresh.
  { const h = fig(42);
    if (visualText(h) !== '42') bad('figure(42) shows "' + visualText(h) + '"');
    if (/ago|old|date|Updated/i.test(visualText(h))) bad('a fresh figure nags: ' + visualText(h)); }
  { const h = fig(42, { at: clock.now });
    if (visualText(h) !== '42 Updated just now') bad('figure(42, {at: now}) shows "' + visualText(h) + '": an `at` always shows its age'); }
  { const h = fig(42, { at: clock.now - 3 * DAY }), n = byClass(parseHtml(h), 'figure-note')[0];
    if (visualText(h) !== '42 Updated 3 days ago') bad('an old `at` WITHOUT stale:true must still say how old: ' + visualText(h));
    if (first(h, 'figure').attrs['data-state'] !== 'value') bad('an `at` without stale:true is not marked stale');
    if (n && classesOf(n).includes('figure-note-stale')) bad('an `at` without stale:true must not get the stale emphasis'); }
  { const h = fig(42, { stale: false, at: clock.now - 3 * DAY });
    if (visualText(h) !== '42 Updated 3 days ago') bad('stale:false with an `at` shows "' + visualText(h) + '"'); }
  { const h = fig(42, { stale: true, at: clock.now - 3 * DAY });
    if (!classesOf(first(h, 'figure-note')).includes('figure-note-stale')) bad('stale:true must add the stale emphasis class to the note'); }
  { const h = fig(7, { unit: 'km' });
    if (visualText(h) !== '7 km') bad('figure(7, {unit:"km"}) shows "' + visualText(h) + '"');
    if (spokenText(h) !== '7 km') bad('figure(7, {unit:"km"}) says "' + spokenText(h) + '"'); }
  { const h = fig(0, { unit: 'Rs' });
    if (visualText(h) !== '0 Rs') bad('figure(0, {unit:"Rs"}) shows "' + visualText(h) + '": a zero keeps its unit'); }

  // STALE: the value AND how old it is. A stale zero is still a zero.
  const AGES = [[0, 'just now'], [30e3, 'just now'], [59e3, 'just now'], [MIN, '1 minute ago'], [2 * MIN, '2 minutes ago'], [59 * MIN + 59e3, '59 minutes ago'], [HOUR, '1 hour ago'],
    [3 * HOUR, '3 hours ago'], [23 * HOUR + 59 * MIN, '23 hours ago'], [DAY, '1 day ago'], [2 * DAY, '2 days ago'], [40 * DAY, '40 days ago']];
  for (const [age, words] of AGES) {
    const h = fig(42, { at: clock.now - age, stale: true }), vis = visualText(h);
    if (vis !== '42 Updated ' + words) bad('stale 42, ' + age + 'ms old shows "' + vis + '", expected "42 Updated ' + words + '"');
    if (!/ago|just now/.test(spokenText(h))) bad('stale 42, ' + age + 'ms old does not say how old to a screen reader: ' + spokenText(h));
    if (first(h, 'figure').attrs['data-state'] !== 'stale') bad('stale figure is marked data-state="' + first(h, 'figure').attrs['data-state'] + '"');
  }
  { const h = fig(0, { at: clock.now - 3 * HOUR, stale: true });
    if (visualText(h) !== '0 Updated 3 hours ago') bad('a stale ZERO shows "' + visualText(h) + '": it must stay a 0 and say how old'); }
  { const h = fig(42, { unit: 'km', at: clock.now - 2 * HOUR, stale: true });
    if (visualText(h) !== '42 km Updated 2 hours ago') bad('stale with a unit shows "' + visualText(h) + '"'); }
  // stale, but the age cannot be told: say so in words rather than print a wrong age
  const NO_AGE = [['no at', {}], ['at null', { at: null }], ['at NaN', { at: NaN }], ['at garbage', { at: 'garbage' }], ['at in the future', { at: clock.now + HOUR }], ['at an object', { at: {} }]];
  for (const [label, o] of NO_AGE) {
    const h = fig(42, Object.assign({ stale: true }, o)), vis = visualText(h);
    if (vis !== '42 May be out of date') bad('stale 42 with ' + label + ' shows "' + vis + '", expected "42 May be out of date"');
    if (/NaN|undefined|null|Infinity|-/.test(vis)) bad('stale 42 with ' + label + ' prints a bad age: ' + vis);
  }
  // `at` may be a number, a Date-like, or an ISO string
  const t3 = clock.now - 3 * HOUR;
  for (const [label, at] of [['a number', t3], ['a Date-like', { getTime: () => t3 }], ['an ISO string', new Date(t3).toISOString()]]) {
    const vis = visualText(fig(42, { at, stale: true }));
    if (vis !== '42 Updated 3 hours ago') bad('at as ' + label + ' gives "' + vis + '"');
  }
  // `at: 0` is a real timestamp (1970), not "no at": it must produce an age, not the no-age fallback
  { const vis = visualText(fig(42, { at: 0, stale: true }));
    if (!/days ago$/.test(vis)) bad('at: 0 shows "' + vis + '": 0 is falsy but it is a real timestamp'); }
  // a skewed clock a few seconds ahead is "just now", not an error
  { const vis = visualText(fig(42, { at: clock.now + 10e3, stale: true }));
    if (vis !== '42 Updated just now') bad('a 10s clock skew shows "' + vis + '"'); }

  // Anything a caller can put in is escaped: a vehicle name from the database must not become markup.
  for (const evil of ['<img src=x onerror=alert(1)>', '"><script>x</script>', '&amp;']) {
    for (const h of [fig(evil), fig(5, { unit: evil }), fig(5, { unit: evil, stale: true, at: 1 })]) {
      let t; try { t = parseHtml(h); } catch (e) { bad('markup broke on input ' + evil + ': ' + e.message); continue; }
      if (findAll(t, (e) => e.tag === 'img' || e.tag === 'script').length) bad('input ' + evil + ' became an element: ' + h);
      if (!visualText(h).includes(evil)) bad('input ' + evil + ' was not shown literally: ' + visualText(h));
    }
  }
  return out;
}
test('figure() keeps unknown, zero and stale apart: a missing value is a dash, every spelling of zero is 0, a stale value says how old it is, one given an `at` always says its age and one with no `at` stays silent, and nothing a caller passes becomes markup (every claim in figureFailures)', () => {
  const { win, clock } = load();
  assert.deepEqual(figureFailures(win, clock), []);
});

// A guarantee that depends on every caller remembering a flag is not a guarantee: if `at` is supplied, the age is shown,
// stale or not. Omitting `at` is the only way to get silence, and it is explicit.
function atAlwaysShowsAgeFailures(win, clock) {
  const out = [];
  const CASES = [[0, 'just now'], [90e3, '1 minute ago'], [2 * MIN, '2 minutes ago'], [3 * HOUR, '3 hours ago'], [2 * DAY, '2 days ago']];
  for (const [age, words] of CASES) for (const [label, o] of [['no stale flag', {}], ['stale:false', { stale: false }], ['stale:true', { stale: true }]]) {
    const vis = visualText(win.figure(42, Object.assign({ at: clock.now - age }, o)));
    if (vis !== '42 Updated ' + words) out.push('figure(42, {at: ' + age + 'ms ago, ' + label + '}) shows "' + vis + '", expected "42 Updated ' + words + '"');
  }
  { const vis = visualText(win.figure(0, { at: clock.now - 3 * HOUR })); if (vis !== '0 Updated 3 hours ago') out.push('a zero with an `at` and no flag shows "' + vis + '"'); }
  { const vis = visualText(win.figure(42, { at: clock.now - 3 * HOUR, unit: 'km' })); if (vis !== '42 km Updated 3 hours ago') out.push('a value with a unit and an `at` and no flag shows "' + vis + '"'); }
  { const vis = visualText(win.figure(42, { at: 0 })); if (!/days ago$/.test(vis)) out.push('at: 0 (a real timestamp) with no flag shows "' + vis + '"'); }
  // an `at` that cannot be read is still not silence
  for (const bad of [NaN, 'garbage', {}, clock.now + HOUR]) {
    const vis = visualText(win.figure(42, { at: bad }));
    if (vis !== '42 Updated time unknown') out.push('figure(42, {at: ' + String(bad) + '}) shows "' + vis + '", expected "42 Updated time unknown"');
  }
  // silence is only for a caller who gives no `at`
  for (const o of [undefined, {}, { at: null }, { at: undefined }, { stale: false }, { unit: 'km' }]) {
    const vis = visualText(win.figure(42, o));
    if (/Updated|ago|date/.test(vis)) out.push('figure(42, ' + JSON.stringify(o) + ') shows an age with no `at`: ' + vis);
  }
  return out;
}
test('a figure given an `at` ALWAYS shows its age, with or without a stale flag; only omitting `at` gives silence (and an unreadable `at` says "Updated time unknown", not nothing)', () => {
  const { win, clock } = load();
  assert.deepEqual(atAlwaysShowsAgeFailures(win, clock), []);
});

/* ----- MUTANTS: each is a plausible mistake. Each must make the checker go red, or the checker is blind. ----- */
function mutate(src, from, to) {
  const hit = from instanceof RegExp ? from.test(src) : src.includes(from);
  if (!hit) throw new Error('mutation target not found in ui/states.js (the source changed under the self-test): ' + from);
  return from instanceof RegExp ? src.replace(from, to) : src.split(from).join(to);
}
const MUTANTS = [
  ['falsiness instead of null: `!v` treats a real 0 as no value', (s) => mutate(s, 'if (v == null) return true;', 'if (!v) return true;'), /figure\(0\)|figure\(-0\)|0\.0|"0"|stale ZERO|Rs/],
  ['no unknown test at all: null prints as "null"', (s) => mutate(s, 'function isUnknown(v) {', 'function isUnknown(v) { return false;'), /figure\(null\)|figure\(undefined\)/],
  ['unknown is coerced to zero: Number(null) is 0', (s) => mutate(s, 'function figure(value, opts) {', 'function figure(value, opts) { if (value == null) value = 0;'), /figure\(null\)|figure\(undefined\)/],
  ['NaN and Infinity are shown as numbers', (s) => mutate(s, 'return !isFinite(v);', 'return false;'), /NaN|Infinity/],
  ['a blank string is shown as an empty value', (s) => mutate(s, /return \/\^\\s\*\$\/\.test\(v\);/, 'return false;'), /empty string|spaces/],
  ['the age is dropped from a stale figure', (s) => mutate(s, "'Updated ' + age", "''"), /stale 42|stale ZERO|stale with a unit|at as/],
  ['the age is gated on the stale flag again (the behaviour this replaced)', (s) => mutate(s, 'if (opts.stale || hasAt) {', 'if (opts.stale) {'), /always shows its age|WITHOUT stale|stale:false with an `at`/],
  ['a figure with no `at` and no flag still shows an age', (s) => mutate(s, 'if (opts.stale || hasAt) {', 'if (true) {'), /Updated time unknown|shows an age/],
  ['the stale flag stops adding its emphasis', (s) => mutate(s, "(opts.stale ? ' figure-note-stale' : '')", "''"), /stale emphasis/],
  ['`at` is tested for truthiness: a timestamp of 0 is lost', (s) => mutate(s, 'if (at == null) return null;', 'if (!at) return null;'), /at: 0/],
  ['an unparseable date prints NaN', (s) => mutate(s, 't !== t || !isFinite(t)', 'false'), /garbage|object|NaN|bad age/],
  ['the unit is not escaped', (s) => mutate(s, "esc(opts.unit)", "String(opts.unit)"), /became an element|broke/],
  ['the value is not escaped', (s) => mutate(s, "esc(String(value))", "String(value)"), /became an element|broke/],
  ['an hour is rounded up to the next unit (Math.round for floor)', (s) => mutate(s, 'Math.floor(ms / 60000)', 'Math.round(ms / 60000)'), /minutes ago|just now/],
];
for (const [name, mutator, expected] of MUTANTS) {
  test('MUTANT must fail: ' + name, () => {
    const { win, clock } = load({ source: mutator(need()) });
    let f;
    try { f = figureFailures(win, clock); } catch (e) { f = ['threw: ' + e.message]; }
    assert(f.length > 0, 'the checker stayed green against this mutant: it cannot tell the difference');
    assert(f.some((x) => expected.test(x)), 'it went red, but not on the claim this mutant breaks (' + expected + '). Saw: ' + f.slice(0, 3).join(' | '));
  });
}

/* =====================================================================================================
 * 2. THE FOUR STATES
 * ===================================================================================================== */
const SAMPLE = (win) => [['emptyState', win.emptyState('No jobs today')], ['errorState', win.errorState('Could not load jobs', function () {})], ['offlineState', win.offlineState()], ['skeleton', win.skeleton(3)]];
const ROOT = { emptyState: 'empty', errorState: 'state-error', offlineState: 'state-offline', skeleton: 'skeleton' };

test('every state is one well-formed element that is a live region (role="status"; role="alert" with aria-live for the error), and a skeleton also says aria-busy', () => {
  const { win } = load();
  for (const [name, h] of SAMPLE(win)) {
    const t = parseHtml(h);
    assert.strictEqual(t.children.length, 1, name + ' must be one element');
    const root = t.children[0];
    assert(isEl(root) && classesOf(root).includes(ROOT[name]), name + ' root is not .' + ROOT[name] + ': ' + h.slice(0, 80));
    if (name === 'errorState') { assert.strictEqual(root.attrs.role, 'alert'); assert.strictEqual(root.attrs['aria-live'], 'assertive'); }
    else assert.strictEqual(root.attrs.role, 'status', name);
  }
  assert.strictEqual(parseHtml(load().win.skeleton(2)).children[0].attrs['aria-busy'], 'true', 'a skeleton says it is busy');
});

test('every state shows a word to a sighted user, not only a colour or a drawing: its visible text has a real word, and its drawings are decorative (aria-hidden)', () => {
  const { win } = load();
  for (const [name, h] of SAMPLE(win)) {
    const v = visualText(h);
    assert(/[A-Za-z]{4,}/.test(v), name + ' shows no word to a sighted user. Visible text: "' + v + '"');
    for (const svg of findAll(parseHtml(h), (e) => e.tag === 'svg')) assert.strictEqual(svg.attrs['aria-hidden'], 'true', name + ' has a drawing a screen reader would try to read');
  }
  // the word must be in view, not hidden: put the only words in .sr-only and the check must notice
  const hiddenOnly = '<div role="status"><span class="sr-only">Offline</span></div>';
  assert(!/[A-Za-z]{4,}/.test(visualText(hiddenOnly)), 'visualText counts visually hidden words as visible: the check above would pass for a state that shows nothing');
});
test('the offline state says "Offline" and that what is shown may be out of date; the skeleton says "Loading"; each is also spoken', () => {
  const { win } = load();
  assert(/^Offline\b/.test(visualText(win.offlineState())), visualText(win.offlineState()));
  assert(/out of date/.test(visualText(win.offlineState())), 'offline must warn that what is on screen may not be current');
  assert.strictEqual(visualText(win.skeleton(2)), 'Loading');
  assert.strictEqual(spokenText(win.skeleton(2)), 'Loading');
  assert(/Offline/.test(spokenText(win.offlineState())));
});
test('each of empty, error and offline draws exactly one icon, and without icons.js every state and a stale figure still draw no icon but keep all their words', () => {
  const { win } = load();
  for (const [name, h] of SAMPLE(win).filter(([n]) => n !== 'skeleton')) assert.strictEqual(findAll(parseHtml(h), (e) => e.tag === 'svg').length, 1, name);
  const bare = load({ icons: false }).win;
  for (const [name, h] of SAMPLE(bare)) {
    assert.strictEqual(findAll(parseHtml(h), (e) => e.tag === 'svg').length, 0, name + ' drew without icons.js?');
    assert(/[A-Za-z]{4,}/.test(visualText(h)), name + ' lost its words without icons.js');
  }
  const fig = bare.figure(1, { stale: true, at: NOW - 2 * HOUR });
  assert.strictEqual(findAll(parseHtml(fig), (e) => e.tag === 'svg').length, 0);
  assert.strictEqual(visualText(fig), '1 Updated 2 hours ago');
  assert.strictEqual(findAll(parseHtml(load().win.figure(1, { stale: true, at: NOW - 2 * HOUR })), (e) => e.tag === 'svg').length, 1, 'with icons.js the stale note carries a clock');
});
test('the text the caller supplies is shown, escaped, and a missing or blank text falls back to words instead of an empty box', () => {
  const { win } = load();
  for (const evil of ['<img src=x onerror=alert(1)>', '"><script>x</script>', 'A & B']) {
    for (const [name, h] of [['emptyState', win.emptyState(evil)], ['emptyState hint', win.emptyState('x', { hint: evil })], ['errorState', win.errorState(evil)]]) {
      const t = parseHtml(h);
      assert(!findAll(t, (e) => e.tag === 'img' || e.tag === 'script').length, name + ' let ' + evil + ' become an element');
      assert(visualText(h).includes(evil), name + ' did not show ' + evil + ' literally: ' + visualText(h));
    }
  }
  assert(visualText(win.emptyState('No jobs today')).includes('No jobs today'));
  assert(visualText(win.emptyState('x', { hint: 'Add one from the Jobs tab' })).includes('Add one from the Jobs tab'));
  assert(visualText(win.errorState('Could not load jobs')).includes('Could not load jobs'));
  for (const blank of [undefined, null, '', '   ']) {
    assert(/[A-Za-z]{4,}/.test(visualText(win.emptyState(blank))), 'emptyState(' + JSON.stringify(blank) + ') shows no words');
    assert(/[A-Za-z]{4,}/.test(visualText(win.errorState(blank))), 'errorState(' + JSON.stringify(blank) + ') shows no words');
  }
});
test('emptyState takes an icon name (default "doc"); an unknown name still draws, so a typo is visible', () => {
  const { win } = load();
  const svgOf = (h) => findAll(parseHtml(h), (e) => e.tag === 'svg')[0];
  const dflt = svgOf(win.emptyState('x')), bus = svgOf(win.emptyState('x', { icon: 'bus' })), typo = svgOf(win.emptyState('x', { icon: 'bsu' }));
  const pathD = (s) => findAll(s, (e) => e.tag === 'path')[0].attrs.d;
  assert.strictEqual(pathD(dflt), load().win.ICONS.doc);
  assert.strictEqual(pathD(bus), win.ICONS.bus);
  assert.strictEqual(typo.attrs['data-missing'], 'bsu');
});

/* ---------- skeleton ---------- */
const rowsOf = (h) => byClass(parseHtml(h), 'skeleton-row').length;
test('skeleton(n) draws n placeholder rows, each decorative; a missing, zero, negative, non-numeric or absurd count still draws a sensible number of rows', () => {
  const { win } = load();
  assert.strictEqual(rowsOf(win.skeleton(1)), 1); assert.strictEqual(rowsOf(win.skeleton(5)), 5); assert.strictEqual(rowsOf(win.skeleton('4')), 4); assert.strictEqual(rowsOf(win.skeleton(2.7)), 2);
  assert.strictEqual(rowsOf(win.skeleton()), 3, 'the default'); assert.strictEqual(rowsOf(win.skeleton(null)), 3);
  for (const odd of [0, -4, NaN, 'abc', {}]) assert.strictEqual(rowsOf(win.skeleton(odd)), 3, 'skeleton(' + String(odd) + ') must not draw an empty loading area');
  assert.strictEqual(rowsOf(win.skeleton(1e9)), 50, 'an absurd count would freeze a Core 2 Duo');
  assert.strictEqual(rowsOf(win.skeleton(Infinity)), 3);
  for (const r of byClass(parseHtml(win.skeleton(3)), 'skeleton-row')) {
    assert.strictEqual(r.attrs['aria-hidden'], 'true', 'placeholder rows are decoration');
    assert(byClass(r, 'skeleton-bar').length >= 1, 'a row with no bar draws nothing');
  }
});

/* ---------- retry ---------- */
// A fake click: states.js installs one click listener on document; clicking is calling it with an event whose target
// answers closest().
function fakeButton(id) { return { attrs: { 'data-state-retry': id }, disabled: false, textContent: 'Retry', getAttribute(k) { return this.attrs[k]; } }; }
function click(doc, btn) {
  const target = { closest: (sel) => (btn && sel === '[data-state-retry]' ? btn : null) };
  doc.listeners.filter((l) => l.type === 'click').forEach((l) => l.fn({ target }));
}
const retryId = (h) => { const b = findAll(parseHtml(h), (e) => e.tag === 'button'); assert.strictEqual(b.length, 1, 'expected one button in ' + h); return b[0].attrs['data-state-retry']; };

test('errorState with a retry function draws one Retry button that calls exactly that function once when clicked; without one it draws no button', () => {
  const { win, doc } = load();
  let a = 0, b = 0;
  const ha = win.errorState('Failed', function () { a++; }), hb = win.errorState('Failed', function () { b++; });
  const btnA = findAll(parseHtml(ha), (e) => e.tag === 'button')[0];
  assert.strictEqual(btnA.attrs.type, 'button', 'a button inside a form would submit it');
  assert(classesOf(btnA).includes('btn'));
  assert.strictEqual(squash(textOf(btnA, () => false)), 'Retry');
  assert.notStrictEqual(retryId(ha), retryId(hb), 'two different handlers share an id');
  click(doc, fakeButton(retryId(ha)));
  assert.deepEqual([a, b], [1, 0], 'clicking A must call A once and not B');
  click(doc, fakeButton(retryId(hb)));
  assert.deepEqual([a, b], [1, 1]);
  for (const none of [undefined, null, 'doSomething', 42, {}]) assert.strictEqual(findAll(parseHtml(win.errorState('x', none)), (e) => e.tag === 'button').length, 0, 'errorState(x, ' + String(none) + ') drew a button that cannot do anything');
});
test('a click that is not on a Retry button does nothing; one click listener is installed, once however many errors are drawn, and none until a retry is asked for', () => {
  const { win, doc } = load();
  let n = 0;
  win.errorState('a', function () { n++; }); win.errorState('b', function () { n++; }); win.errorState('c', function () { n++; });
  assert.strictEqual(doc.listeners.length, 1, 'one delegated listener, not one per error');
  assert.strictEqual(doc.listeners[0].type, 'click');
  click(doc, null);
  assert.strictEqual(n, 0, 'a click elsewhere must not retry');
  assert.strictEqual(load().doc.listeners.length, 0, 'nothing is installed until a retry is asked for');
});
test('drawing the same retry function again reuses its id and refreshes it; the registry is bounded; and a Retry whose handler was evicted is disabled and says so instead of silently doing nothing', () => {
  const { win, doc } = load();
  let first = 0, later = 0;
  const f = function () { first++; };
  const id1 = retryId(win.errorState('x', f)), id2 = retryId(win.errorState('x', f));
  assert.strictEqual(id1, id2, 'the same function must keep one id, or a polling screen leaks one entry per redraw');
  for (let i = 0; i < 400; i++) win.errorState('x', function () { later++; });
  const btn = fakeButton(id1);
  click(doc, btn);
  assert.strictEqual(first, 0, 'an evicted handler must not run');
  assert.strictEqual(btn.disabled, true, 'a dead Retry must not look alive');
  assert(/reload/i.test(btn.textContent), 'and it must say what to do: ' + btn.textContent);
  // the most recent handlers are still alive
  const h = win.errorState('x', function () { later++; });
  click(doc, fakeButton(retryId(h)));
  assert.strictEqual(later, 1);
  // redrawing a function refreshes it, so one that is still on screen is not the one evicted
  const g = function () { first += 100; };
  const idg = retryId(win.errorState('x', g));
  for (let i = 0; i < 150; i++) win.errorState('x', function () {});
  win.errorState('x', g);
  for (let i = 0; i < 150; i++) win.errorState('x', function () {});
  click(doc, fakeButton(idg));
  assert.strictEqual(first, 100, 'a handler that was redrawn recently must survive eviction');
});
test('errorState works where there is no document yet (it draws; the listener is simply not installed)', () => {
  const { win } = load({ document: false });
  assert(/Failed/.test(visualText(win.errorState('Failed', function () {}))));
});

/* =====================================================================================================
 * 3. THE STYLESHEET KNOWS EVERY CLASS THIS FILE EMITS
 * ===================================================================================================== */
// A class in the markup with no rule behind it is a state that renders unstyled: an invisible skeleton, an unhidden
// "No data". Collect every class the module can emit and require a selector for each.
const cssClasses = (css) => { const s = new Set(); for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/\.([A-Za-z_][\w-]*)/g)) s.add(m[1]); return s; };
function emittedClasses(win, clock) {
  const set = new Set();
  const htmls = [win.emptyState('a'), win.emptyState('a', { hint: 'b', icon: 'bus' }), win.errorState('a'), win.errorState('a', function () {}), win.offlineState(), win.skeleton(2),
    win.figure(null), win.figure(0), win.figure(5, { unit: 'km' }), win.figure(5, { unit: 'km', stale: true, at: clock.now - HOUR }), win.figure(5, { stale: true })];
  for (const h of htmls) walk(parseHtml(h), (e) => classesOf(e).forEach((c) => set.add(c)));
  return set;
}
test('the checker for "every emitted class is styled" sees the classes, and goes red when one has no rule', () => {
  const { win, clock } = load(), used = emittedClasses(win, clock);
  for (const c of ['state', 'empty', 'state-error', 'state-offline', 'skeleton', 'skeleton-row', 'skeleton-bar', 'figure', 'figure-none', 'figure-u', 'figure-note', 'sr-only', 'btn'])
    assert(used.has(c), 'the emitter walk did not find .' + c + ': the check below would be blind to it');
  const unstyled = (css) => Array.from(used).filter((c) => !cssClasses(css).has(c));
  assert(unstyled(CSS.replace(/skeleton-bar/g, 'skeleton-bxr')).includes('skeleton-bar'), 'a missing rule for .skeleton-bar was not noticed');
  assert(unstyled(CSS.replace(/\.sr-only/g, '.sr-onlx')).includes('sr-only'), 'a missing rule for .sr-only was not noticed');
});
test('every class that ui/states.js can put in its markup has a rule in ui/components.css', () => {
  const { win, clock } = load(), used = emittedClasses(win, clock), have = cssClasses(CSS);
  assert(used.size >= 12, 'only ' + used.size + ' classes found; the walk is not seeing the markup');
  const missing = Array.from(used).filter((c) => !have.has(c));
  assert.deepEqual(missing, [], 'no CSS rule for: ' + missing.join(', '));
});

/* ---------- done ---------- */
if (fails) { console.log('\n' + fails + ' FAILED'); process.exit(1); }
console.log('\nall passed');

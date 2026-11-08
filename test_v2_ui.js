/* Tests for the v2 CSS primitives, the nav and the photo builders. Run: node test_v2_ui.js
 *
 * At the repo ROOT and not in v2/, because scripts/run-tests.py auto-discovers test_*.js at the root only
 * and does not recurse: a test in v2/ would never run, and a test nobody runs is not a test.
 *
 * Covers: v2/ui/tokens.css and v2/ui/components.css as TEXT (what v2 added to the two copies, and that it
 * added only), v2/ui/nav.js and v2/ui/photos.js in a vm context holding a stub window and nothing else.
 * No browser. Exits non-zero on any failure.
 *
 * Every detector here is fed input it MUST reject before it is turned on the real file. A checker that
 * cannot fail is decoration, and this repo has shipped a bug behind one (scripts/check-floor.py's header
 * tells that story about grep -P).
 *
 * THE FIRST CHECK IS THE IMPORTANT ONE. v2/ui/tokens.css and v2/ui/components.css started byte-identical
 * to ui/'s (DECISIONS.md 14) so that the first diff between them shows exactly what v2 changed and
 * nothing else. "Added lines only" is asserted as: every line of the v1 file still appears in the v2
 * file, in the same order. Regularising a hue's lightness, tidying a radius or renaming a class breaks
 * it, and so does deleting a comment. v1 is live for about a hundred people; v2 has its own copies and
 * reaches into none of v1's files. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const ROOT = __dirname;
const V1 = (f) => path.join(ROOT, 'ui', f);
const V2 = (f) => path.join(ROOT, 'v2', 'ui', f);
const read = (p) => fs.readFileSync(p, 'utf8');

let fails = 0;
function test(name, fn) {
  try { fn(); console.log('  ok  ' + name); }
  catch (e) { console.log(' FAIL ' + name + '\n        ' + String(e.message).split('\n').join('\n        ')); fails++; }
}

const TOKENS_V1 = read(V1('tokens.css'));
const TOKENS_V2 = read(V2('tokens.css'));
const COMP_V1 = read(V1('components.css'));
const COMP_V2 = read(V2('components.css'));
const NAV_SRC = read(V2('nav.js'));
const PHOTOS_SRC = read(V2('photos.js'));
const ICONS_SRC = read(V2('icons.js'));

/* =====================================================================================================
 * 1. ADDED LINES ONLY
 * ===================================================================================================== */

// The lines of `v2` that are not part of the longest run matching `v1` in order. Returns null when a v1
// line has gone missing or changed, which is the failure this is for.
function addedLines(v1, v2) {
  const a = v1.split('\n'), b = v2.split('\n');
  const added = [];
  let i = 0;
  for (const line of b) {
    if (i < a.length && line === a[i]) { i++; continue; }
    added.push(line);
  }
  return i === a.length ? added : null;
}

test('the added-lines detector catches a removed line, a changed line and a reorder, and accepts an insertion', () => {
  assert.deepEqual(addedLines('a\nb\nc', 'a\nb\nc'), []);
  assert.deepEqual(addedLines('a\nb\nc', 'a\nX\nb\nc'), ['X'], 'an inserted line is an addition');
  assert.deepEqual(addedLines('a\nb\nc', 'a\nb\nc\nX'), ['X'], 'an appended line is an addition');
  assert.strictEqual(addedLines('a\nb\nc', 'a\nc'), null, 'a removed line must be caught');
  assert.strictEqual(addedLines('a\nb\nc', 'a\nB\nc'), null, 'a changed line must be caught');
  assert.strictEqual(addedLines('a\nb\nc', 'b\na\nc'), null, 'a reorder must be caught');
});

const TOKENS_ADDED = addedLines(TOKENS_V1, TOKENS_V2);
const COMP_ADDED = addedLines(COMP_V1, COMP_V2);

test('v2/ui/tokens.css adds lines to ui/tokens.css and removes or changes none', () => {
  assert(TOKENS_ADDED !== null, 'a line of ui/tokens.css is missing or changed in v2/ui/tokens.css');
  assert(TOKENS_ADDED.length > 0, 'v2/ui/tokens.css adds nothing: the three new tokens are not there');
});

test('v2/ui/components.css adds lines to ui/components.css and removes or changes none', () => {
  assert(COMP_ADDED !== null, 'a line of ui/components.css is missing or changed in v2/ui/components.css');
  assert(COMP_ADDED.length > 0, 'v2/ui/components.css adds nothing');
});

/* =====================================================================================================
 * A SMALL CSS READER (the brace-depth reader from test_ui_tokens.js)
 * ===================================================================================================== */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const GROUPING = /^@(media|supports|layer|container)\b/;

function parseRules(text, ctx = []) {
  const rules = [];
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('{', i);
    if (open < 0) break;
    const prelude = text.slice(i, open).trim();
    let depth = 1, j = open + 1;
    while (j < text.length && depth) { if (text[j] === '{') depth++; else if (text[j] === '}') depth--; j++; }
    const body = text.slice(open + 1, j - 1);
    if (GROUPING.test(prelude)) rules.push(...parseRules(body, ctx.concat(prelude)));
    else {
      const decls = {}, list = [];
      for (const d of body.split(';')) {
        const k = d.indexOf(':');
        if (k > 0 && !d.slice(0, k).includes('{')) { const p = d.slice(0, k).trim(), v = d.slice(k + 1).trim(); decls[p] = v; list.push([p, v]); }
      }
      rules.push({ ctx, selector: prelude, decls, list, nested: body.includes('{') });
    }
    i = j;
  }
  return rules;
}
const rulesOf = (css) => parseRules(stripComments(css));
const declsOf = (css) => rulesOf(css).flatMap((r) => r.list.map(([prop, val]) => ({ sel: r.selector, prop, val })));

function splitTop(s, sep) {
  const out = []; let depth = 0, cur = '', q = null;
  for (const ch of s) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (depth === 0 && ch === sep) { if (cur.trim()) out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// The text v2 added to components.css, as CSS. Every addition is a whole rule, so this parses.
const ADDED_CSS = (COMP_ADDED || []).join('\n');

/* =====================================================================================================
 * 2. THE THREE NEW TOKENS
 *
 * THE BRIEF IS WRONG ABOUT WHERE THEY GO, and this check is written against the design rather than
 * against the sentence. --nav-h, --thumb and --rail-w are SIZES, so they belong in the two density
 * blocks, next to --tap, --row-h and --pad whose arithmetic they are part of; 1.3's "declare it in the
 * light block, the prefers-color-scheme block and [data-theme=dark], with identical dark values" is the
 * contract for a COLOUR token, and test_ui_tokens.js enforces it on colour tokens only (colourNames()
 * filters on hsl()). A size token in a theme block would say the theme changes the layout, and a theme
 * that moved the nav would be a new defect. So: in both density blocks, absent from all three theme
 * blocks, --rail-w desk only, each with its arithmetic beside it.
 * ===================================================================================================== */
const DARK_MEDIA = /prefers-color-scheme:\s*dark/;
const selectors = (r) => splitTop(r.selector, ',');
const T_RULES = () => rulesOf(TOKENS_V2);
const LIGHT = () => T_RULES().find((r) => r.ctx.length === 0 && selectors(r).includes('[data-v2]') && r.decls['--ink']);
const DARK_OS = () => T_RULES().find((r) => r.ctx.some((c) => DARK_MEDIA.test(c)) && r.selector === '[data-v2]:not([data-theme="light"])');
const DARK_USER = () => T_RULES().find((r) => r.ctx.length === 0 && r.selector === '[data-v2][data-theme="dark"]');
const DENSITY = (name) => T_RULES().find((r) => r.ctx.length === 0
  && selectors(r).includes('[data-v2][data-density="' + name + '"]')
  && selectors(r).includes('[data-v2] [data-density="' + name + '"]'));
const px = (v) => { const m = /^(-?[\d.]+)px$/.exec(String(v).trim()); assert(m, 'expected a px value, got "' + v + '"'); return +m[1]; };

test('--nav-h and --thumb are declared in BOTH density blocks, and yard is the roomier one', () => {
  const y = DENSITY('yard'), d = DENSITY('desk');
  assert(y && d, 'a density block is missing from v2/ui/tokens.css');
  for (const t of ['--nav-h', '--thumb']) {
    assert(y.decls[t], t + ' is missing from the yard block');
    assert(d.decls[t], t + ' is missing from the desk block');
    assert(px(y.decls[t]) > px(d.decls[t]), t + ' should be larger in yard than at a desk');
  }
  assert.strictEqual(px(y.decls['--nav-h']), 56);
  assert.strictEqual(px(d.decls['--nav-h']), 44);
  assert.strictEqual(px(y.decls['--thumb']), 72);
  assert.strictEqual(px(d.decls['--thumb']), 56);
});

test('--rail-w is declared in the desk block ONLY, because yard has no rail', () => {
  assert.strictEqual(px(DENSITY('desk').decls['--rail-w']), 160);
  assert(!DENSITY('yard').decls['--rail-w'], '--rail-w in the yard block would claim a rail on a phone');
});

test('the three new tokens are in no theme block: a theme changes colour, never the layout', () => {
  for (const block of [LIGHT(), DARK_OS(), DARK_USER()]) {
    assert(block, 'a theme block is missing from v2/ui/tokens.css');
    for (const t of ['--nav-h', '--thumb', '--rail-w'])
      assert(!block.decls[t], t + ' is declared in a theme block (' + block.selector + ')');
  }
});

/* The arithmetic is in the file because the next person will want to round the numbers: --nav-h yard is
 * icon 20 + --s1 4 + a 25.5px Hindi label inside 56; the desk rail is twelve items x --tap 32px = 384px
 * of a 768px column, which is why More disappears entirely at a desk. */
test('each new token carries its arithmetic in a comment, so the numbers are not taste', () => {
  const comments = (TOKENS_V2.match(/\/\*[\s\S]*?\*\//g) || []).join('\n');
  for (const [token, needle] of [['--nav-h yard', '20 + --s1 4'], ['--nav-h desk', '2 x --s2 = 41.5'],
    ['--thumb', '4 x 72 + 3 x --s2'], ['--rail-w', 'twelve items at --tap 32px']])
    assert(comments.includes(needle), token + ': the arithmetic "' + needle + '" is not in a comment');
});

/* =====================================================================================================
 * 3. THE ADDED RULES: tokens, not magic numbers; the scope; hsl() only; motion
 * ===================================================================================================== */

// px literals are for hairlines and radii only (the same PX_OK_PROP as test_ui_components.js). Everything
// else -- height, width, padding, gap, type -- comes from a token, or desk and yard drift apart. This is
// the rule the three new tokens exist to satisfy.
const PX_OK_PROP = /^(?:border(?:-[a-z-]+)?|outline(?:-offset)?|box-shadow)$/;
function magicPx(css) {
  return declsOf(css)
    .filter((d) => /(?<![\w.-])-?\d*\.?\d+px\b/.test(d.val.replace(/var\(\s*--[\w-]+\s*,?/g, ' ')) && !PX_OK_PROP.test(d.prop))
    .map((d) => d.sel + ' { ' + d.prop + ': ' + d.val + ' }');
}
test('the magic-px detector rejects a literal size, padding, gap or type and allows a border, outline and shadow', () => {
  for (const bad of ['height:56px', 'width:160px', 'padding:0 16px', 'gap:8px', 'font-size:15px', 'min-height:72px', 'margin-bottom:-1px'])
    assert(magicPx('.a{' + bad + '}').length > 0, 'detector missed: ' + bad);
  for (const fine of ['height:calc(var(--nav-h) + env(safe-area-inset-bottom))', 'width:var(--thumb)', 'border-top:2px solid transparent',
    'border-radius:8px', 'outline:2px solid var(--accent)', 'outline-offset:-2px', 'box-shadow:inset 0 -1px 0 var(--line)', 'max-height:70vh', 'padding:0'])
    assert.deepEqual(magicPx('.a{' + fine + '}'), [], 'false positive: ' + fine);
});
test('every added rule sizes itself from a token: no px literal outside border, outline and box-shadow', () => {
  assert(declsOf(ADDED_CSS).length > 0, 'no added declarations to check: an empty collection would pass vacuously');
  assert.deepEqual(magicPx(ADDED_CSS), []);
});

test('the added rules use only the three existing radii: 8px on a control, 12px on a panel, 999px on a pill', () => {
  const radii = declsOf(ADDED_CSS).filter((d) => /^border(-[a-z-]+)?radius$/.test(d.prop.replace('-radius', 'radius')) || d.prop === 'border-radius')
    .map((d) => d.val.trim());
  assert(radii.length > 0, 'no radii in the added rules: this check would pass vacuously');
  for (const r of radii) assert(['8px', '12px', '999px'].includes(r), 'a fourth radius appeared: ' + r);
});

// Every selector must START with [data-v2], so nothing here can reach the live app. A bare :root would
// flip the live app's --accent-ink to its opposite meaning mid-migration.
const SCOPE_OK = /^(?:[a-zA-Z][\w-]*)?\[data-v2\]/, SCOPE_LEAK = /:root|:not\(\s*[^)]*data-v2/;
function unscoped(css) {
  return rulesOf(css).filter((r) => !r.selector.startsWith('@')).flatMap((r) => splitTop(r.selector, ','))
    .filter((sel) => !SCOPE_OK.test(sel) || SCOPE_LEAK.test(sel));
}
test('the scope detector flags every way a rule can reach outside [data-v2] and accepts every scoped form', () => {
  const caught = (sel) => unscoped(sel + '{color:red}').length > 0;
  for (const leak of ['.nav', 'nav', ':root .nav', ':root', '*', '[data-v2], .nav', '[data-density="desk"] .nav-i', ':not([data-v2]) .photo'])
    assert(caught(leak), 'should have been flagged: ' + leak);
  for (const fine of ['[data-v2] .nav', '[data-v2]', '[data-v2][data-density="desk"] .nav-i', '[data-v2] [data-density="desk"] .nav-i', '[data-v2] .photo:focus-visible'])
    assert(!caught(fine), 'should have been accepted: ' + fine);
  assert.deepEqual(unscoped('@media (min-width: 1024px){.nav{color:red} [data-v2] .nav{color:red}}'), ['.nav'], 'a rule inside @media is still checked');
});
test('every selector in v2/ui/components.css, at-rules included, is scoped to [data-v2]', () => {
  assert(rulesOf(COMP_V2).length > 0, 'parsed no rules');
  assert.deepEqual(unscoped(COMP_V2), []);
});
test('every selector in v2/ui/tokens.css is scoped to [data-v2]', () => assert.deepEqual(unscoped(TOKENS_V2), []));

const NAMED_OK = ['transparent', 'currentcolor'];   // as in ui/components.css: not new colours
function colourLiterals(css) {
  const out = [];
  for (const d of declsOf(css)) {
    const v = d.val.replace(/"[^"]*"|'[^']*'/g, '').replace(/var\(\s*--[\w-]+\s*,?/g, ' ');
    const found = [];
    if (/#[0-9a-fA-F]{3,8}\b/.test(v)) found.push('hex');
    for (const m of v.matchAll(/(?<![\w-])(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark)\(/g)) found.push(m[1] + '()');
    for (const word of v.toLowerCase().match(/[a-z][a-z-]*/g) || [])
      if (['white', 'black', 'red', 'green', 'blue', 'grey', 'gray', 'orange', 'tan', 'silver'].includes(word)) found.push(word);
    if (found.length) out.push(d.sel + ' { ' + d.prop + ': ' + d.val + ' }  (' + found.join(', ') + ')');
  }
  return out;
}
test('the colour-literal detector rejects hex, every colour function and a named colour, and allows var(), transparent and currentcolor', () => {
  for (const bad of ['color:#fff', 'color:rgb(0,0,0)', 'color:hsl(16 88% 54%)', 'border:1px solid red', 'background:white', 'box-shadow:0 0 0 1px tan'])
    assert(colourLiterals('.a{' + bad + '}').length > 0, 'detector missed: ' + bad);
  for (const fine of ['color:var(--ink-dim)', 'background:transparent', 'border-top:2px solid var(--accent)', 'border-color:currentcolor'])
    assert.deepEqual(colourLiterals('.a{' + fine + '}'), [], 'false positive: ' + fine);
  assert(NAMED_OK.length === 2, 'the two tolerated keywords are transparent and currentcolor, and neither is a new colour');
});
test('the added rules take every colour from a var(--token): no literal, so no hue is tuned twice', () => {
  assert.deepEqual(colourLiterals(ADDED_CSS), []);
});

// Every var(--x) must name a property that exists, or a typo silently drops the declaration.
test('every var(--token) in v2/ui/components.css names a property v2/ui/tokens.css or the file itself defines', () => {
  const defined = new Set();
  for (const text of [COMP_V2, TOKENS_V2]) for (const d of declsOf(text)) if (d.prop.startsWith('--')) defined.add(d.prop);
  const missing = [];
  for (const d of declsOf(COMP_V2)) for (const m of d.val.matchAll(/var\(\s*(--[\w-]+)/g)) if (!defined.has(m[1])) missing.push(d.sel + ': ' + m[1]);
  assert.deepEqual(missing, []);
  for (const t of ['--nav-h', '--thumb', '--rail-w']) assert(defined.has(t), t + ' is defined nowhere');
});

/* MOTION. transform and opacity only, never over 300ms, never a bare ease-in -- and the nav's active bar
 * does not transition at all, because it is the thing people press most often in the app and a frequently
 * repeated action does not animate (5.8). The bar is a border colour, and a border colour is not on the
 * allowed list, which is what makes that unanimatable rather than merely undone. */
const TIMING = /^(?:ease|ease-in|ease-out|ease-in-out|linear|step-start|step-end|cubic-bezier\(.*\)|steps\(.*\))$/;
const msOf = (s) => (/ms$/.test(s) ? parseFloat(s) : parseFloat(s) * 1000);
function motionFailures(css) {
  const out = [];
  for (const d of declsOf(css)) {
    if (/^transition-/.test(d.prop)) { out.push(d.sel + ' uses ' + d.prop + '; use the shorthand so each item can be checked whole'); continue; }
    if (d.prop !== 'transition') continue;
    if (d.val.trim() === 'none') continue;
    for (const item of splitTop(d.val, ',')) {
      const parts = item.split(/\s+/).filter(Boolean);
      const prop = parts.find((p) => !TIMING.test(p) && !/^[\d.]+m?s$/.test(p));
      const times = parts.filter((p) => /^[\d.]+m?s$/.test(p));
      const timing = parts.find((p) => TIMING.test(p));
      const where = d.sel + ' { transition: ' + item + ' }';
      if (!prop || !['transform', 'opacity'].includes(prop)) out.push(where + ': only transform and opacity may transition');
      else if (!times.length) out.push(where + ': names no duration');
      else if (times.reduce((a, t) => a + msOf(t), 0) > 300) out.push(where + ': runs over the 300ms ceiling');
      else if (!timing) out.push(where + ': names no easing');
      else if (timing === 'ease-in') out.push(where + ': a bare ease-in withholds movement while the user watches');
    }
  }
  if (/\bease-in\b(?!-out)/.test(stripComments(css))) out.push('the text contains a bare ease-in');
  return out;
}
test('the motion detector rejects a non-compositor property, "all", a missing duration, over 300ms, a bare ease-in and a longhand', () => {
  for (const bad of ['transition:all 100ms ease-out', 'transition:background-color 100ms ease-out', 'transition:transform 301ms ease-out',
    'transition:transform .4s ease-out', 'transition:transform 250ms ease-out 100ms', 'transition:transform 100ms ease-in',
    'transition:transform 100ms', 'transition-property:transform', 'transition:border-top-color 120ms ease-out'])
    assert(motionFailures('.a{' + bad + '}').length > 0, 'detector missed: ' + bad);
  for (const fine of ['transition:transform 120ms ease-out,opacity 120ms ease-out', 'transition:none', 'transition:opacity 120ms ease-out'])
    assert.deepEqual(motionFailures('.a{' + fine + '}'), [], 'false positive: ' + fine);
});
test('the added rules animate transform and opacity only, under 300ms, with no bare ease-in', () => {
  assert(declsOf(ADDED_CSS).some((d) => d.prop === 'transition'), 'no transition in the added rules: this check would pass vacuously');
  assert.deepEqual(motionFailures(ADDED_CSS), []);
});
test("the nav's active bar does not transition: no rule that sets it declares one", () => {
  const bars = rulesOf(ADDED_CSS).filter((r) => r.selector.includes('aria-current'));
  assert(bars.length >= 2, 'expected the bottom-bar and the rail active rules, found ' + bars.length);
  for (const r of bars) {
    assert(!r.decls.transition, r.selector + ' transitions the active bar');
    assert(/2px solid var\(--accent\)/.test(JSON.stringify(r.decls)), r.selector + ' draws no 2px accent bar');
  }
});

test('the added rules carry a reduced-motion answer for every new pressable', () => {
  const reduced = rulesOf(ADDED_CSS).filter((r) => r.ctx.some((c) => /prefers-reduced-motion/.test(c)));
  assert(reduced.length > 0, 'no reduced-motion block among the added rules');
  const flat = reduced.map((r) => r.selector + JSON.stringify(r.decls)).join('\n');
  for (const sel of ['.photo', '.nav-i']) assert(flat.includes(sel), sel + ' has no reduced-motion rule');
  assert(/"transform":"none"/.test(flat), 'reduced motion must remove the movement');
  assert(/"opacity":"0.8"/.test(flat), 'reduced motion must keep the acknowledgement as opacity');
});

/* The rail is chosen by density AND width, both clauses: a width-only rule puts a rail on a tablet in
 * landscape (also 1024x768), and a desk-density page on a 360px phone must not lose 44% of its width. */
test('the rail needs desk density AND at least 1024px: both clauses, each for a reason', () => {
  const rail = rulesOf(ADDED_CSS).filter((r) => r.decls['width'] === 'var(--rail-w)');
  assert.strictEqual(rail.length, 1, 'expected exactly one rule to claim --rail-w, found ' + rail.length);
  assert(rail[0].ctx.some((c) => /min-width:\s*1024px/.test(c)), 'the rail is not behind a 1024px media query');
  assert(/\[data-density="desk"\]/.test(rail[0].selector), 'the rail is not behind desk density');
  assert(/border-inline-end/.test(JSON.stringify(rail[0].decls)), 'the rail has no leading-edge line');
});

/* =====================================================================================================
 * 4. THE TWO BUILDERS, in a vm context holding a stub window and nothing else
 * ===================================================================================================== */

// load({sheets, document, icons, words}) -> the sandbox, plus what it recorded.
/* ---------------------------------------------------------------------------------------------------
 * THE ROW'S TWO LINES MUST BE BLOCKS. A defect that reached the office and was reported by a person.
 *
 * components.css's markup contract writes them as DIVS inside div.txt, and a div is already block, so
 * the missing declaration changed nothing for the files that follow the contract and nobody saw it.
 * Nine of the thirteen screens write them as SPANS instead --
 * <span><span class="t">..</span><span class="sub">..</span></span> -- and an inline box breaks both of
 * the things .t and .sub are declared for:
 *   - two inline boxes share ONE line with no gap, so on the duty board the title and the second line
 *     ran together: "Driver 1 - Suresh Chand MeenaOn this bus since 2026-10-29";
 *   - overflow and text-overflow DO NOTHING on a non-replaced inline box, so the title never truncated.
 *     Measured at 375px it ran out of the grid's middle track and printed on top of .act: the crew
 *     name and the word "Change" drawn over each other, which is what was reported.
 * The grid and its minmax(0, 1fr) middle track were right the whole time; only the TEXT left the box.
 * That is why nothing else here could see it, and why display: block is pinned.
 * ------------------------------------------------------------------------------------------------- */

function rowLineFailures(css) {
  const out = [];
  const rules = rulesOf(css);
  for (const want of ['.v2row .t', '.v2row .sub']) {
    const hit = rules.filter((r) => selectors(r).some((s) => s.replace('[data-v2] ', '') === want));
    if (!hit.length) { out.push(want + ' has no rule at all'); continue; }
    const display = hit.map((r) => r.decls.display).filter(Boolean).pop();
    if (display !== 'block') {
      out.push(want + ' declares display: ' + (display || '(nothing, which is inline for a span)')
        + ' -- an inline line box cannot truncate and will not stack');
    }
  }
  return out;
}

test('the row-line detector rejects a missing display and an inline one, and accepts block', () => {
  assert.deepEqual(rowLineFailures('[data-v2] .v2row .t { display: block; }\n'
    + '[data-v2] .v2row .sub { display: block; }'), []);
  assert.strictEqual(rowLineFailures('[data-v2] .v2row .t { overflow: hidden; }\n'
    + '[data-v2] .v2row .sub { display: block; }').length, 1);
  assert.strictEqual(rowLineFailures('[data-v2] .v2row .t { display: inline; }\n'
    + '[data-v2] .v2row .sub { display: inline-block; }').length, 2);
  assert.strictEqual(rowLineFailures('').length, 2);
});

test("the row's title and second line are blocks, so a long name truncates instead of printing over .act", () => {
  assert.deepEqual(rowLineFailures(COMP_V2), []);
});

/* The rule above only guards something while screens write the two lines as spans. If they all move to
 * the div.txt form the contract documents, this stops guarding anything -- so it says so out loud
 * instead of sitting there green and meaning nothing. */
test('the span form is still in use, so the block rule above is guarding something real', () => {
  const files = [];
  (function walk(d) {
    for (const n of fs.readdirSync(d)) {
      const p = path.join(d, n);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (/\.js$/.test(n)) files.push(p);
    }
  })(path.join(ROOT, 'v2'));
  const users = files.filter((f) => /<span class="t">/.test(read(f)));
  assert(users.length > 0,
    'no v2 file writes <span class="t"> any more: move this check to the div form, or delete it');
  console.log('        ' + users.length + " v2 files write the row's lines as spans: "
    + users.map((f) => path.basename(f)).join(', '));
});

/* ---------------------------------------------------------------------------------------------------
 * A SECOND LINE WRITTEN AS A SIBLING NEEDS ITS OWN GRID ROW. The other half of the same defect.
 *
 * `[data-v2] .v2row > *` puts every direct child in column 2, row 1. Where the two lines are siblings
 * of `.lead` rather than wrapped in `div.txt`, they land in ONE cell and are drawn on top of each
 * other -- superimposed, full width, same y. Measured at 1366px: 27 rows on People, 18 on Money, 7 on
 * the job card, two of which are the instructions a mechanic acts on.
 *
 * `span 2` and not `1 / -1`: with no `grid-template-rows` there is no explicit grid, `-1` resolves to
 * line 1, and the span collapses -- the mark then sits on the title's line. Measured: 45 rows
 * off-centre with `1 / -1`, none with `span 2`. So the span is pinned here as written, not just as
 * "some grid-row".
 * ------------------------------------------------------------------------------------------------- */

function declOf(css, sel) {
  const hit = rulesOf(css).filter((r) => selectors(r).some((s) => s.replace('[data-v2] ', '') === sel));
  return Object.assign({}, ...hit.map((r) => r.decls));
}

function siblingRowFailures(css) {
  const out = [];
  const sub = declOf(css, '.v2row > .sub');
  if (sub['grid-row'] !== '2') {
    out.push('.v2row > .sub declares grid-row: ' + (sub['grid-row'] || '(nothing, so row 1 with the title)')
      + ' -- a sibling second line then shares the title\'s cell and is drawn on top of it');
  }
  for (const sel of ['.v2row > .lead', '.v2row > .act']) {
    const d = declOf(css, sel);
    if (d['grid-row'] !== '1 / span 2') {
      out.push(sel + ' declares grid-row: ' + (d['grid-row'] || '(nothing)')
        + ' -- it must be "1 / span 2" or the mark sits on the title\'s line instead of centred against both');
    }
  }
  return out;
}

test('the sibling-row detector rejects a shared cell, a collapsed span and a missing rule', () => {
  const good = '[data-v2] .v2row > .sub { grid-row: 2; }\n'
    + '[data-v2] .v2row > .lead { grid-row: 1 / span 2; }\n'
    + '[data-v2] .v2row > .act { grid-row: 1 / span 2; }';
  assert.deepEqual(siblingRowFailures(good), []);
  assert.strictEqual(siblingRowFailures(good.replace('.sub { grid-row: 2; }', '.sub { color: red; }')).length, 1);
  assert.strictEqual(siblingRowFailures(good.split('1 / span 2').join('1 / -1')).length, 2);
  assert.strictEqual(siblingRowFailures('').length, 3);
});

test("a second line written beside the title gets its own row, instead of being drawn under it", () => {
  assert.deepEqual(siblingRowFailures(COMP_V2), []);
});

/* As with the block rule: this guards nothing once every screen wraps its two lines, so it says which
 * files still write them as siblings and fails if none do. */
test('the sibling form is still in use, so the row rules above are guarding something real', () => {
  const files = [];
  (function walk(d) {
    for (const n of fs.readdirSync(d)) {
      const p = path.join(d, n);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (/\.js$/.test(n)) files.push(p);
    }
  })(path.join(ROOT, 'v2'));
  // `<span class="lead">` ... `</span>` then `<span class="t">` with no wrapper opened between them.
  const SIBLING = /<span class="lead"[^>]*>[\s\S]{0,400}?<\/span>'?\s*\+?\s*'?\s*\+?\s*[^<]{0,80}'<span class="t">/;
  const users = files.filter((f) => SIBLING.test(read(f)));
  assert(users.length > 0,
    'no v2 file writes the two lines as siblings any more: move this check, or delete it');
  console.log('        ' + users.length + ' v2 files write the two lines as siblings of .lead: '
    + users.map((f) => path.basename(f)).join(', '));
});

function load(o) {
  o = o || {};
  const sheets = [];
  const clicks = [];
  const sandbox = {};
  sandbox.window = sandbox;
  if (o.document !== false) sandbox.document = { addEventListener: (type, fn) => clicks.push({ type, fn }) };
  if (o.overlay !== false) sandbox.V2 = { openSheet: (title, html, opts) => { sheets.push({ title, html, opts }); return { dialog: true }; } };
  if (o.words) { sandbox.W = { register: (t) => Object.assign(sandbox._registered, t) }; sandbox.w = o.words; }
  sandbox._registered = {};
  const ctx = vm.createContext(sandbox);
  if (o.icons !== false) vm.runInContext(ICONS_SRC, ctx, { filename: V2('icons.js') });
  for (const [src, file] of [[NAV_SRC, 'nav.js'], [PHOTOS_SRC, 'photos.js']]) vm.runInContext(src, ctx, { filename: V2(file) });
  return { win: sandbox, sheets, clicks };
}

test('both modules load in a bare window and attach exactly the four names the twelve screens are written against', () => {
  const { win } = load();
  for (const name of ['nav', 'navMore', 'photoGrid', 'photoCapture']) assert.strictEqual(typeof win[name], 'function', name + ' is not exported');
  assert.strictEqual(typeof win.V2.openPhoto, 'function', 'V2.openPhoto is not exported');
  assert.strictEqual(typeof win.V2.openSheet, 'function', 'photos.js assigned over V2 instead of adding to it');
});

test('both modules load with no document, no icons and no overlay at all: the gallery holds none of them', () => {
  const { win } = load({ document: false, icons: false, overlay: false });
  assert(win.nav([{ id: 'a', label: 'A', mark: 'bus' }, { id: 'b', label: 'B', mark: 'me' }]).includes('class="nav"'));
  assert(win.photoGrid([{ url: 'u' }]).includes('class="photos"'));
  assert.strictEqual(win.V2.openPhoto('u', 'c'), null, 'openPhoto must refuse quietly when overlay.js is not there');
});

/* ---------- the nav ---------- */
const ITEMS = [
  { id: 'today', label: 'Today', word: 'scToday', mark: 'home' },
  { id: 'attention', label: 'Attention', word: 'scAttention', mark: 'alert' },
  { id: 'jobs', label: 'Jobs', word: 'scJobs', mark: 'job' },
  { id: 'me', label: 'Me', word: 'scMe', mark: 'me' }
];

test('nav([]) and a ONE-item nav render nothing at all -- not an empty <nav>, nothing', () => {
  const { win } = load();
  assert.strictEqual(win.nav([], 'today'), '', 'an empty list must render nothing');
  assert.strictEqual(win.nav([ITEMS[3]], 'me'), '', 'a one-item nav is a lie about there being somewhere to go');
  assert.strictEqual(win.nav(null, 'me'), '', 'no list must render nothing');
  assert.strictEqual(win.nav(undefined), '', 'no arguments must render nothing');
  // and two items is the smallest real nav
  assert(win.nav(ITEMS.slice(0, 2), 'today').indexOf('<nav class="nav"') === 0, 'two items must render a nav');
});

test('nav marks exactly one item aria-current, keeps the order it was given, and carries data-nav on each', () => {
  const { win } = load();
  const html = win.nav(ITEMS, 'jobs');
  assert.strictEqual((html.match(/aria-current="page"/g) || []).length, 1);
  assert(/data-nav="jobs"[^>]*aria-current="page"/.test(html), 'the current item is not the one marked');
  assert.deepEqual((html.match(/data-nav="([a-z]+)"/g) || []), ['data-nav="today"', 'data-nav="attention"', 'data-nav="jobs"', 'data-nav="me"']);
  assert.strictEqual((html.match(/class="nav-l"/g) || []).length, 4, 'every item carries its label; an icon-only tab is how the emoji problem started');
  assert(!/<button/.test(html) && !/role="tab"/.test(html), 'a nav item is an <a> with an href, so the keyboard can reach it');
  assert.strictEqual((html.match(/href="#"/g) || []).length, 4);
});

test('an unknown active id marks nothing, and More is never marked even when asked', () => {
  const { win } = load();
  assert.strictEqual((win.nav(ITEMS, 'buses').match(/aria-current/g) || []).length, 0);
  const withMore = ITEMS.slice(0, 3).concat([{ id: 'more', label: 'More', mark: 'more' }, ITEMS[3]]);
  assert.strictEqual((win.nav(withMore, 'more').match(/aria-current/g) || []).length, 0,
    'More opens a sheet; a sheet is not a place you are');
});

test('nav escapes every label and id it is handed', () => {
  const { win } = load();
  const html = win.nav([{ id: 'a"><script>x</script>', label: '<script>alert(1)</script>', mark: 'bus' }, ITEMS[3]], 'me');
  assert(!html.includes('<script>'), 'a label went through unescaped: ' + html);
  assert(html.includes('&lt;script&gt;'));
});

test('an unknown mark draws the dotted square rather than nothing, so a typo is visible on screen', () => {
  const { win } = load();
  assert(win.nav([{ id: 'a', label: 'A', mark: 'nosuchmark' }, ITEMS[3]], 'a').includes('data-missing="nosuchmark"'));
});

test('navMore renders a.v2row rows with the mark in .lead and nothing in .act, and nothing for an empty list', () => {
  const { win } = load();
  assert.strictEqual(win.navMore([]), '');
  assert.strictEqual(win.navMore(null), '');
  const html = win.navMore(ITEMS.slice(0, 3));
  assert.strictEqual((html.match(/class="v2row"/g) || []).length, 3);
  assert.strictEqual((html.match(/class="lead"/g) || []).length, 3);
  assert(!html.includes('class="act"'), 'a More row carries nothing in .act');
  assert(!html.includes('aria-current'), 'navMore(items) with no active id marks nothing');
  assert(win.navMore(ITEMS.slice(0, 3), 'jobs').includes('aria-current="page"'), 'a row that IS the current screen may say so');
});

/* The nav renders what Caps.navFor computes and does not second-guess it. The slot order is NOT the rail
 * order for two roles -- store gets Store second, a crew manager gets Duty board second -- so a nav that
 * sorted again would quietly move the tabs under the people who use them most. */
const Caps = require('./v2/caps.js');
test('the nav renders Caps.navFor in the order it was given, for all eight roles at both densities', () => {
  const { win } = load();
  for (const role of Object.keys(Caps.NAV_SLOTS).concat(['driver', 'conductor'])) {
    for (const density of ['yard', 'desk']) {
      const got = Caps.navFor(role, density);
      const html = win.nav(got.items, 'today');
      if (got.items.length < 2) { assert.strictEqual(html, '', role + ' at ' + density + ' has one slot and must get no nav'); continue; }
      assert.deepEqual((html.match(/data-nav="([a-z]+)"/g) || []).map((s) => s.slice(10, -1)), got.items.map((i) => i.id),
        role + ' at ' + density + ': the nav re-ordered what navFor computed');
    }
  }
});

test('a driver and a conductor get no nav, no More and no back arrow: Me is the whole app', () => {
  const { win } = load();
  for (const role of ['driver', 'conductor']) {
    const got = Caps.navFor(role, 'yard');
    assert.strictEqual(win.nav(got.items, 'me'), '', role + ' must get no nav');
    assert.strictEqual(win.navMore(got.more), '', role + ' must get no More sheet');
    assert(!/icon\(\s*['"]back['"]/.test(NAV_SRC), 'nav.js draws a back arrow; an arrow pointing nowhere is the same lie as a one-item nav');
  }
});

test('at a desk the supervisor and the owner get all twelve slots and no More at all', () => {
  const { win } = load();
  for (const role of ['supervisor', 'owner']) {
    const got = Caps.navFor(role, 'desk');
    assert.strictEqual(got.items.length, 12, role + ' should hold twelve desk slots');
    const html = win.nav(got.items, 'today');
    assert(!html.includes('data-nav="more"'), role + ': More is still in the rail at a desk');
    assert.strictEqual(win.navMore(got.more), '', role + ': the desk More sheet should be empty');
  }
});

/* ---------- the photos ---------- */
test('photoGrid escapes a caption and a url, so a record cannot inject markup', () => {
  const { win } = load();
  const html = win.photoGrid([{ url: 'x" onerror="alert(1)', caption: '<script>alert(1)</script>' }]);
  assert(!html.includes('<script>'), 'a caption went through unescaped: ' + html);
  assert(html.includes('&lt;script&gt;'));
  assert(html.includes('src="x&quot; onerror=&quot;alert(1)"'), 'a url is not escaped inside its attribute: ' + html);
  assert(!html.includes('src="x" onerror='), 'a url broke out of its attribute: ' + html);
});

test('a failed tile stays tappable and carries the word "Not sent" with a mark, never colour alone', () => {
  const { win } = load();
  const html = win.photoGrid([{ url: 'u1', caption: 'After', failed: true }]);
  assert(html.includes('Not sent'), 'the word is missing: ' + html);
  assert(html.includes('badge badge-bad'));
  assert(/<svg/.test(html), 'the badge carries no mark, so the state is colour and a word in one colour');
  assert(/<button type="button" class="photo"/.test(html), 'the failed tile is no longer a button');
  assert(!/disabled/.test(html), 'a failed tile must stay tappable: the photo is not lost, it is in the record');
});

test('sending, on-this-phone-only and sent are three different tiles, each with a word', () => {
  const { win } = load();
  assert(win.photoGrid([{ url: 'u', pending: true }]).includes('Sending'));
  const localOnly = win.photoGrid([{ url: 'data:image/png;base64,AAA', local: true }]);
  assert(localOnly.includes('On this phone only'));
  assert(localOnly.includes('Sends when there is wifi'), 'the grid does not say when it will send');
  const sent = win.photoGrid([{ url: 'u', caption: 'Before' }]);
  for (const word of ['Sending', 'Not sent', 'On this phone only', 'wifi']) assert(!sent.includes(word), 'a sent tile claims ' + word);
});

test('every <img> whose src is an upload URL carries referrerpolicy="no-referrer", in the grid and in the viewer', () => {
  const { win, sheets } = load();
  const imgs = win.photoGrid([{ url: 'u1' }, { url: 'u2' }]).match(/<img[^>]*>/g) || [];
  assert.strictEqual(imgs.length, 2);
  for (const img of imgs) assert(img.includes('referrerpolicy="no-referrer"'), img);
  win.V2.openPhoto('u3', 'A licence');
  assert.strictEqual(sheets.length, 1, 'the viewer is a sheet');
  assert(/<img[^>]*referrerpolicy="no-referrer"/.test(sheets[0].html), sheets[0].html);
});

/* An upload URL is served by a route that authenticates nothing and has no revocation (LIVE-ISSUES 7,
 * 7b), so the interface's whole contribution is to stop adding ways the URL travels. This check guards
 * absences, like F2's no-onConflict check and for the same reason: the next person reads the file and
 * believes a link is fine. */
test('a thumbnail is a button and there is no anchor, no new tab, no copy link, no share and no download anywhere in photos.js', () => {
  const src = PHOTOS_SRC;
  assert(/<button type="button" class="photo"/.test(src), 'the tile is not a button');
  for (const re of [/<a\s/, /<a>/, /target=/, /download/i, /\bShare\b/, /Copy link/i, /navigator\.share/, /clipboard/i])
    assert(!re.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), 'photos.js carries a share affordance: ' + re);
});

test('words come before the picture: a tile states itself before it makes a request, and a tile with no url makes none', () => {
  const { win } = load();
  const tile = win.photoGrid([{ url: 'u', caption: 'Before' }]);
  assert(tile.indexOf('Before') < tile.indexOf('<img'), 'the picture comes before the word');
  // Me's "Your documents" lists a licence by type and expiry and loads nothing until an explicit tap.
  const doc = win.photoGrid([{ caption: 'Licence, expires March' }]);
  assert(!doc.includes('<img'), 'a tile with no url still made a request: ' + doc);
  assert(doc.includes('Licence, expires March'));
  assert(doc.includes('photo-blank'));
  assert(doc.includes('data-photo-src=""'), 'an unloaded tile must not look loaded to the delegated handler');
});

test('the capture control is a label wrapping an .sr-only file input, never display:none, and is absent once the grid is full', () => {
  const { win } = load();
  const one = win.photoCapture();
  assert(/^<label class="btn photo-add">/.test(one), one);
  assert(/<input type="file" accept="image\/\*" capture="environment" class="sr-only"/.test(one), one);
  assert(one.includes('Take photo'));
  assert(!/display\s*:\s*none/.test(PHOTOS_SRC.replace(/\/\*[\s\S]*?\*\//g, '')),
    'display:none takes the input out of the accessibility tree');
  assert(win.photoCapture('Add the bill', 'bill').includes('name="bill"'));
  assert(win.photoGrid([{ url: 'a' }], { capture: true, max: 2 }).includes('photo-add'), 'room for one more: the control is there');
  assert(!win.photoGrid([{ url: 'a' }, { url: 'b' }], { capture: true, max: 2 }).includes('photo-add'),
    'a control the person may not use is absent, not disabled');
  assert(!win.photoGrid([{ url: 'a' }], {}).includes('photo-add'), 'capture is opt-in');
});

test('opts.max caps the tiles drawn, so a poisoned record cannot draw two hundred', () => {
  const { win } = load();
  const many = [];
  for (let i = 0; i < 200; i++) many.push({ url: 'u' + i });
  assert.strictEqual((win.photoGrid(many, { max: 4 }).match(/<img/g) || []).length, 4);
  assert.strictEqual((win.photoGrid(many).match(/<img/g) || []).length, 200, 'with no max the caller decides');
});

test('the viewer is V2.openSheet and never a second overlay, and the caption is its title', () => {
  const { win, sheets } = load();
  win.V2.openPhoto('u', 'Before, nearside wing');
  assert.strictEqual(sheets[0].title, 'Before, nearside wing');
  win.V2.openPhoto('u', '');
  assert.strictEqual(sheets[1].title, 'Photo', 'a tile with no caption still needs a title');
  for (const re of [/document\.createElement\(\s*['"]dialog/, /showModal/, /\.open\s*=\s*true/])
    assert(!re.test(PHOTOS_SRC), 'photos.js builds its own modal: ' + re);
});

test('one delegated click listener opens the full size, and it leaves an unloaded tile to the screen', () => {
  const { win, sheets, clicks } = load();
  assert.strictEqual(clicks.length, 1, 'expected exactly one document listener, got ' + clicks.length);
  assert.strictEqual(clicks[0].type, 'click');
  const fire = (attrs) => clicks[0].fn({ target: { closest: (sel) => (attrs && sel === '[data-photo-src]' ? { getAttribute: (k) => attrs[k] } : null) } });
  fire({ 'data-photo-src': 'u9', 'data-photo-caption': 'After' });
  assert.strictEqual(sheets.length, 1);
  assert.strictEqual(sheets[0].title, 'After');
  fire({ 'data-photo-src': '', 'data-photo-caption': 'Licence' });
  assert.strictEqual(sheets.length, 1, 'an unloaded tile must not open a viewer on nothing');
  fire(null);
  assert.strictEqual(sheets.length, 1, 'a click outside a tile must do nothing');
});

/* ---------- the fixed words ---------- */
test('every fixed word in both modules is registered for translation, and a translator is used when there is one', () => {
  const plain = load();
  assert.deepEqual(Object.keys(plain.win._registered), [], 'nothing to register against: W was not stubbed here');
  const hi = load({ words: (id) => 'HI:' + id });
  const ids = Object.keys(hi.win._registered).sort();
  /* `navMore` joined this list when the More tile's word was found unregistered: caps.js named it and
   * nothing registered it, so the tile drew its English title in Hindi mode. The list is an inventory,
   * so it grows deliberately and a word added without a reason fails here. */
  assert.deepEqual(ids, ['navMain', 'navMore', 'phAdd', 'phNotSent', 'phOnPhone', 'phSending', 'phView', 'phWifi'].sort());
  for (const id of ids) {
    assert(hi.win._registered[id].en, id + ' has no English value');
    assert(Object.prototype.hasOwnProperty.call(hi.win._registered[id], 'hi'), id + ' has no hi key');
  }
  assert(hi.win.nav(ITEMS, 'today').includes('aria-label="HI:navMain"'), 'the nav ignored the translator');
  assert(hi.win.photoCapture().includes('HI:phAdd'), 'the capture control ignored the translator');
  assert(hi.win.nav(ITEMS, 'today').includes('HI:scToday'), "a nav label must translate from the screen's own word id");
});

/* words.js throws on an id nobody registered, which is right: a silent English fallback is the defect
 * (v2-foundation-ui.md 6.3), and the build-time scan is where a missing id belongs. But the nav draws in
 * the FIRST PAINT and is the one thing on screen that must never depend on anything, and a screen label
 * is registered by that screen's own module -- so one module that has not loaded must cost one label, not
 * a blank frame with a console error. */
test('a word nobody registered costs one label, never the frame: neither builder can throw', () => {
  const { win } = load({ words: (id) => { throw new Error('w(): no word is registered under the id ' + id); } });
  const html = win.nav(ITEMS, 'today');
  assert(html.includes('>Today</span>'), 'the nav lost the English title Caps gave it: ' + html);
  assert(html.includes('aria-label="Main"'), 'the nav lost its own accessible name: ' + html);
  assert(win.photoCapture().includes('Take photo'));
  assert(win.photoGrid([{ url: 'u', failed: true }]).includes('Not sent'));
  assert(win.navMore(ITEMS.slice(0, 2)).includes('>Today</div>'));
});

test('neither module holds an English literal outside its W.register table', () => {
  for (const [name, src] of [['nav.js', NAV_SRC], ['photos.js', PHOTOS_SRC]]) {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const table = /W\.register\(\{[\s\S]*?\n  \}\);/.exec(code);
    assert(table, name + ' has no W.register table');
    const rest = code.replace(table[0], '');
    const words = (rest.match(/'[A-Z][A-Za-z]{2,}[^']*'|"[A-Z][A-Za-z]{2,}[^"]*"/g) || [])
      .filter((s) => !/^['"](Main|Photo)['"]$/.test(s));
    assert.deepEqual(words, [], name + ' holds a fixed English word outside the table');
  }
});

/* =====================================================================================================
 * 5. THE FLOOR, run rather than described
 * ===================================================================================================== */
test('python3 scripts/check-floor.py v2 ui is green', () => {
  execFileSync('python3', [path.join(ROOT, 'scripts', 'check-floor.py'), 'v2', 'ui'], { cwd: ROOT, stdio: 'pipe' });
});

console.log(fails ? '\n' + fails + ' failure(s)' : '\nall checks passed');
process.exit(fails ? 1 : 0);

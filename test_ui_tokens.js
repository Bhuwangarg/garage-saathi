/* Tests for ui/tokens.css — the design-token layer. Run: node test_ui_tokens.js
 * Parses the stylesheet as TEXT; needs no browser. Exits non-zero on any failure. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'ui', 'tokens.css');
let fails = 0;
function test(name, fn) {
  try { fn(); console.log('  ok  ' + name); }
  catch (e) { console.log(' FAIL ' + name + '\n        ' + String(e.message).split('\n').join('\n        ')); fails++; }
}

/* ---------- a small CSS reader: enough for a flat token file ---------- */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const GROUPING = /^@(media|supports|layer|container)\b/;

// Returns [{ctx:[at-rule preludes], selector, decls:{prop:value}, nested:bool}].
// A grouping at-rule (@media...) may legitimately contain rules; a STYLE rule may not.
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
      const decls = {};
      for (const d of body.split(';')) {
        const k = d.indexOf(':');
        if (k > 0 && !d.slice(0, k).includes('{')) decls[d.slice(0, k).trim()] = d.slice(k + 1).trim();
      }
      rules.push({ ctx, selector: prelude, decls, nested: body.includes('{') });
    }
    i = j;
  }
  return rules;
}
const selectors = (r) => r.selector.split(',').map((s) => s.trim());

/* ---------- colour maths: HSL -> sRGB -> WCAG relative luminance ---------- */
function parseHsl(v) {
  const m = /^hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*\)$/.exec(v.trim());
  if (!m) return null; // hsla() with alpha is for hairlines, never text — not contrast-checked
  return { h: +m[1], s: +m[2] / 100, l: +m[3] / 100 };
}
function hslToRgb({ h, s, l }) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)]; // 0..1
}
function luminance(rgb) {
  const [r, g, b] = rgb.map((c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(fgHsl, bgHsl) {
  const a = luminance(hslToRgb(parseHsl(fgHsl))), b = luminance(hslToRgb(parseHsl(bgHsl)));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/* ---------- load ---------- */
const raw = fs.existsSync(FILE) ? fs.readFileSync(FILE, 'utf8') : null;
const need = () => { if (raw === null) throw new Error('ui/tokens.css does not exist'); return raw; };
const rules = () => parseRules(stripComments(need()));

const DARK_MEDIA = /prefers-color-scheme:\s*dark/;
const LIGHT = () => rules().find((r) => r.ctx.length === 0 && selectors(r).includes('[data-v2]') && r.decls['--ink']);
const DARK_OS = () => rules().find((r) => r.ctx.some((c) => DARK_MEDIA.test(c)) && r.selector === '[data-v2]:not([data-theme="light"])');
const DARK_USER = () => rules().find((r) => r.ctx.length === 0 && r.selector === '[data-v2][data-theme="dark"]');
const DENSITY = (name) => rules().find((r) => r.ctx.length === 0 && selectors(r).includes('[data-v2][data-density="' + name + '"]') && selectors(r).includes('[data-v2] [data-density="' + name + '"]'));
const isColour = (v) => /^hsla?\(/.test(v);
const colourNames = (decls) => Object.keys(decls).filter((k) => k.startsWith('--') && isColour(decls[k]));
const px = (v) => { const m = /^(-?[\d.]+)px$/.exec(String(v).trim()); assert(m, 'expected a px value, got "' + v + '"'); return +m[1]; };
// resolve one level of var(--x) against a rule's own declarations, then the light root
const resolve = (v, decls) => { const m = /^var\((--[\w-]+)\)$/.exec(v.trim()); return m ? (decls[m[1]] || LIGHT().decls[m[1]]) : v; };

/* ---------- Chrome 109 floor and house constraints ---------- */
const BANNED = ['oklch(', 'color-mix(', '@starting-style', 'subgrid', 'text-wrap:', 'view-transition', '@scope', 'popover'];
test('uses no CSS feature Chrome 109 lacks', () => {
  const css = stripComments(need());
  for (const f of BANNED) assert(!css.includes(f), f + ' is not available on Chrome 109');
});
test('declares no nested style rule (grouping @media/@supports/@layer is fine)', () => {
  assert(rules().length > 0, 'parsed no rules');
  for (const r of rules()) assert(!r.nested, 'nested rule inside "' + r.selector + '"');
});
test('the nested-rule check really catches nesting', () => {
  const bad = parseRules('.a{color:red; .b{color:blue}}');
  assert(bad.some((r) => r.nested), 'checker is blind to nesting');
  const ok = parseRules('@media (x){.a{color:red}}');
  assert(ok.length === 1 && !ok[0].nested, 'checker rejects a legitimate @media wrapper');
});
test('no emoji and no non-ASCII glyph anywhere (Windows 7 lacks them)', () => {
  assert(!/[^\x00-\x7F]/.test(need()), 'non-ASCII character found');
});
test('colour is authored in HSL: no hex, rgb() or named-colour literals', () => {
  const css = stripComments(need());
  assert(!/#[0-9a-fA-F]{3,8}\b/.test(css), 'hex colour found');
  assert(!/\brgba?\(/.test(css), 'rgb() found');
});
test('figures use tabular-nums, on the v2 scope', () => {
  const r = rules().find((x) => selectors(x).includes('[data-v2]') && x.decls['font-variant-numeric']);
  assert(r && r.decls['font-variant-numeric'] === 'tabular-nums');
});

/* ---------- scope: tokens live on [data-v2], never on a bare :root ----------
 * styles.css (the live app) defines --ink, --surface, --line, --accent, --font and
 * --accent-ink on :root, and --accent-ink there means the OPPOSITE of the v2 meaning.
 * The migration is screen by screen, so one document will hold both. Scoping to
 * [data-v2] is what lets them coexist; a bare :root here would flip the live app. */
const unscoped = (rs) => rs.flatMap((r) => selectors(r).filter((sel) => !/\[data-v2\]/.test(sel) || /(^|[\s>+~,(])(:root|html|body)\b|\*/.test(sel)).map((sel) => sel));
test('no token is defined on a bare :root (every selector is scoped to [data-v2])', () => {
  const bad = unscoped(rules());
  assert(bad.length === 0, 'unscoped selector(s) would leak into the live app: ' + bad.join(' | '));
});
test('the scope check really catches a bare :root', () => {
  assert.deepEqual(unscoped(parseRules(':root{--x:1}')), [':root']);
  assert.deepEqual(unscoped(parseRules('[data-density="desk"]{--x:1}')), ['[data-density="desk"]']);
  assert.deepEqual(unscoped(parseRules('[data-v2]{--x:1} [data-v2][data-theme="dark"]{--x:2}')), []);
});

/* ---------- Review Focus 1: a token with no dark value is invisible text ---------- */
const REQUIRED = ['--ink', '--ink-dim', '--surface', '--surface-raised', '--line', '--accent', '--accent-ink', '--ok', '--warn', '--bad'];
test('the ten required colour tokens exist on [data-v2]', () => {
  const L = LIGHT();
  assert(L, 'no [data-v2] block declaring --ink');
  for (const t of REQUIRED) assert(L.decls[t] && isColour(L.decls[t]), t + ' missing or not an HSL colour');
});
test('every semantic colour token has a dark value (OS-driven block)', () => {
  const light = colourNames(LIGHT().decls).sort();
  const dark = DARK_OS();
  assert(dark, 'no @media (prefers-color-scheme: dark) { [data-v2]:not([data-theme="light"]) { ... } } block');
  assert.deepEqual(colourNames(dark.decls).sort(), light);
});
test('every semantic colour token has a dark value (explicit data-theme="dark" block)', () => {
  const light = colourNames(LIGHT().decls).sort();
  const dark = DARK_USER();
  assert(dark, 'no [data-v2][data-theme="dark"] block');
  assert.deepEqual(colourNames(dark.decls).sort(), light);
});
test('the two dark blocks carry identical values, so OS and explicit choice cannot drift', () => {
  assert.deepEqual(DARK_OS().decls, DARK_USER().decls);
});
test('no colour token is left identical in dark (a copy-paste would pass the check above)', () => {
  const L = LIGHT().decls, D = DARK_OS().decls;
  for (const t of REQUIRED.filter((t) => t !== '--accent-ink')) assert(L[t] !== D[t], t + ' is the same in light and dark');
});

/* ---------- type ---------- */
test('--font and --font-hi are exactly as specified', () => {
  const L = LIGHT().decls;
  assert.strictEqual(L['--font'], '-apple-system, "Segoe UI", Roboto, system-ui, Arial, sans-serif');
  assert.strictEqual(L['--font-hi'], '"Nirmala UI", "Segoe UI", Mangal, sans-serif');
});
test('Nirmala UI is named before Mangal', () => assert(need().indexOf('Nirmala UI') < need().indexOf('Mangal')));
test('no webfont: no @font-face, no @import, no url()', () => {
  const css = stripComments(need());
  for (const f of ['@font-face', '@import', 'url(']) assert(!css.includes(f), f);
});

/* ---------- spacing and density ---------- */
test('--s1..--s8 are a 4px scale: multiples of 4, strictly increasing, starting at 4', () => {
  const L = LIGHT().decls;
  const v = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => { assert(L['--s' + n], '--s' + n + ' missing'); return px(L['--s' + n]); });
  assert.strictEqual(v[0], 4);
  v.forEach((x, i) => { assert(x % 4 === 0, '--s' + (i + 1) + ' = ' + x + ' is not a multiple of 4'); if (i) assert(x > v[i - 1], '--s' + (i + 1) + ' does not increase'); });
});
test('yard tap target is at least 48px and desk row at least 32px', () => {
  assert(DENSITY('yard'), 'no [data-density="yard"] block');
  assert(DENSITY('desk'), 'no [data-density="desk"] block');
  assert(px(DENSITY('yard').decls['--tap']) >= 48);
  assert(px(DENSITY('desk').decls['--row-h']) >= 32);
});
test('every density declares --row-h, --tap and --pad, and yard is the roomier one', () => {
  const y = DENSITY('yard').decls, d = DENSITY('desk').decls;
  for (const t of ['--row-h', '--tap', '--pad']) {
    assert(y[t] && d[t], t + ' missing from a density');
    assert(px(resolve(y[t], y)) > px(resolve(d[t], d)), t + ' should be larger in yard than in desk');
  }
});
test('a page with no data-density attribute falls back to yard (the safe, bigger target)', () => {
  const root = rules().find((r) => r.ctx.length === 0 && selectors(r).includes('[data-v2]') && r.decls['--tap']);
  assert(root, 'no [data-v2] rule declares --tap, so a bare [data-v2] would have no density');
  assert.strictEqual(root.decls['--tap'], DENSITY('yard').decls['--tap'], 'the fallback density must be yard');
});
test('body text never goes below 15px yard / 14px desk (--t5 body, --t6 small, both floored)', () => {
  const y = DENSITY('yard').decls, d = DENSITY('desk').decls;
  for (const t of ['--t5', '--t6']) {
    assert(px(y[t]) >= 15, t + ' yard = ' + y[t]);
    assert(px(d[t]) >= 14, t + ' desk = ' + d[t]);
  }
});
test('the six type sizes exist in both densities and descend from --t1 to --t6', () => {
  for (const name of ['yard', 'desk']) {
    const d = DENSITY(name).decls;
    const v = [1, 2, 3, 4, 5, 6].map((n) => { assert(d['--t' + n], name + ' --t' + n + ' missing'); return px(d['--t' + n]); });
    v.forEach((x, i) => { if (i) assert(x < v[i - 1], name + ': --t' + (i + 1) + ' is not smaller than --t' + i); });
  }
});

/* ---------- contrast (WCAG 2.x) ---------- */
test('contrast() agrees with the WCAG reference values', () => {
  const near = (a, b) => Math.abs(a - b) < 0.01;
  assert(near(contrast('hsl(0 0% 0%)', 'hsl(0 0% 100%)'), 21), 'black on white must be 21:1');
  assert(near(contrast('hsl(0 0% 100%)', 'hsl(0 0% 100%)'), 1), 'identical colours must be 1:1');
  assert(near(contrast('hsl(0 0% 46.7%)', 'hsl(0 0% 100%)'), 4.48), '#777 on white is 4.48:1');
});

const THEMES = () => [['light', LIGHT().decls], ['dark (OS)', DARK_OS().decls], ['dark (explicit)', DARK_USER().decls]];
// Text pairs [foreground, background]. Every one is real text in the spec: body copy,
// secondary copy, label on an accent button, accent as a link, and the three status words.
const TEXT_PAIRS = [
  ['--ink', '--surface'], ['--ink', '--surface-raised'],
  ['--ink-dim', '--surface'], ['--ink-dim', '--surface-raised'],
  ['--accent-ink', '--accent'],
  ['--accent-text', '--surface'], ['--accent-text', '--surface-raised'],
  ['--ok', '--surface'], ['--ok', '--surface-raised'],
  ['--warn', '--surface'], ['--warn', '--surface-raised'],
  ['--bad', '--surface'], ['--bad', '--surface-raised'],
];
test('body text on every surface meets 4.5:1, in light and both dark blocks', () => {
  const failures = [];
  for (const [theme, d] of THEMES()) {
    for (const [fg, bg] of TEXT_PAIRS) {
      assert(parseHsl(d[fg]) && parseHsl(d[bg]), fg + ' / ' + bg + ' must be opaque hsl() to be contrast-checked');
      const c = contrast(d[fg], d[bg]);
      if (c < 4.5) failures.push(theme + ': ' + fg + ' ' + d[fg] + ' on ' + bg + ' ' + d[bg] + ' = ' + c.toFixed(2) + ':1');
    }
  }
  assert(failures.length === 0, failures.length + ' pair(s) under 4.5:1\n' + failures.join('\n'));
});
test('the accent as a focus ring / bar meets 3:1 against both surfaces (WCAG 1.4.11)', () => {
  const failures = [];
  for (const [theme, d] of THEMES()) for (const bg of ['--surface', '--surface-raised']) {
    const c = contrast(d['--accent'], d[bg]);
    if (c < 3) failures.push(theme + ': --accent on ' + bg + ' = ' + c.toFixed(2) + ':1');
  }
  assert(failures.length === 0, failures.join('\n'));
});

/* ---------- done ---------- */
if (fails) { console.log('\n' + fails + ' FAILED'); process.exit(1); }
console.log('\nall passed');
module.exports = { contrast };

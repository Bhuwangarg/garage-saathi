/* Tests for ui/icons.js - the inline-SVG icon set that replaces emoji.
 * Run: node test_ui_icons.js   (needs no browser; exits non-zero on any failure)
 *
 * The file is loaded the way a page loads it: as a plain script, in a context that has a `window`
 * and NOTHING else (no module, no require). If icons.js leans on a module system it fails here. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FILE = path.join(__dirname, 'ui', 'icons.js');
let fails = 0;
function test(name, fn) {
  try { fn(); console.log('  ok  ' + name); }
  catch (e) { console.log(' FAIL ' + name + '\n        ' + String(e.message).split('\n').join('\n        ')); fails++; }
}

/* ---------- load as a plain script ---------- */
const source = fs.existsSync(FILE) ? fs.readFileSync(FILE, 'utf8') : null;
const need = () => { if (source === null) throw new Error('ui/icons.js does not exist'); return source; };
let win = null, loadError = null;
if (source !== null) {
  const sandbox = {};
  sandbox.window = sandbox;                 // a browser global object: window.window === window
  try { vm.runInContext(source, vm.createContext(sandbox), { filename: FILE }); win = sandbox; }
  catch (e) { loadError = e; }
}
const W = () => { need(); if (loadError) throw loadError; return win; };
const ICONS = () => W().ICONS;
const icon = (n, o) => W().icon(n, o);
const names = () => Object.keys(ICONS());

/* The 25 marks the 14 screens need (brief, Step 3). */
const REQUIRED = ['bus', 'job', 'part', 'person', 'fuel', 'money', 'review', 'star', 'gate', 'map', 'alert', 'warn', 'ok',
  'bad', 'clock', 'search', 'filter', 'add', 'edit', 'delete', 'back', 'more', 'camera', 'doc', 'offline'];

/* ---------- helpers ---------- */
// Everything inside the outer <svg ...> ... </svg>.
const inner = (svg) => svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
const pathTags = (svg) => svg.match(/<path\b[^>]*>/g) || [];
const attr = (tag, name) => { const m = new RegExp('\\s' + name + '="([^"]*)"').exec(tag); return m ? m[1] : null; };
const dOf = (svg) => attr(pathTags(svg)[0], 'd');

/* ---------- plain-script contract ---------- */
test('loads as a plain script and attaches ICONS and icon to window', () => {
  assert.strictEqual(typeof W().ICONS, 'object');
  assert(W().ICONS !== null);
  assert.strictEqual(typeof W().icon, 'function');
});

// What this detector does and does not know: it looks for ES2015+ syntax by spelling. It is a tripwire, not a parser.
function es6Syntax(code) {
  const c = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, '""');
  const found = [];
  if (/=>/.test(c)) found.push('arrow function');
  if (/`/.test(c)) found.push('template literal');
  if (/(^|[^\w$.])(let|const|class|import|export|async|await|yield)\s/.test(c)) found.push('let/const/class/import/export/async/await/yield');
  if (/\.\.\./.test(c)) found.push('spread/rest');
  if (/\bmodule\s*\.\s*exports\b|\brequire\s*\(/.test(c)) found.push('CommonJS');
  if (/\bSymbol\b|\bPromise\b|\bMap\s*\(|\bSet\s*\(|Object\.assign|\.includes\(|\.startsWith\(|\.padStart\(|\bArray\.from\b/.test(c)) found.push('ES2015+ library call');
  return found;
}
test('the ES5 tripwire flags the constructs it claims to, and passes plain ES5', () => {
  const bad = { 'arrow function': 'var f = (a) => a;', 'template literal': 'var s = `x`;', 'let': 'let a = 1;', 'const': 'const a = 1;',
    'class': 'class A {}', 'spread': 'f(...a);', 'CommonJS': 'module.exports = {};', 'require': 'var a = require("x");',
    'includes': 'a.includes(b);', 'Object.assign': 'Object.assign({}, a);', 'import': 'import a from "x";', 'export': 'export var a = 1;',
    'async': 'async function f() {}', 'await': 'await f();', 'yield': 'yield 1;', 'Symbol': 'var s = Symbol("a");', 'Promise': 'new Promise(f);',
    'Map': 'var m = new Map();', 'Set': 'var m = new Set();', 'startsWith': 'a.startsWith("x");', 'padStart': 'a.padStart(2);', 'Array.from': 'Array.from(a);' };
  for (const k of Object.keys(bad)) assert(es6Syntax(bad[k]).length > 0, 'tripwire missed: ' + k);
  const fine = 'var a = {}; function f(x) { return x.indexOf("let const class => ...") < 0; } // const let => `\n/* class */ window.f = f;';
  assert.deepEqual(es6Syntax(fine), [], 'false positive on strings/comments/plain ES5');
});
test('ui/icons.js is free of the ES2015+ constructs the tripwire knows (and of CommonJS)', () => {
  assert.deepEqual(es6Syntax(need()), []);
});

/* ---------- the set ---------- */
test('the set is exactly the 25 named marks, and stays small (<= 30)', () => {
  assert.deepEqual(names().slice().sort(), REQUIRED.slice().sort());
  assert(names().length <= 30, 'the set is meant to stay small');
});
test('every icon is one path on a 24-grid', () => {
  assert(names().length > 0, 'no icons: an empty set would pass vacuously');
  for (const n of names()) {
    const s = icon(n);
    assert(s.includes('viewBox="0 0 24 24"'), n + ' is not on the 24 grid');
    assert.strictEqual(pathTags(s).length, 1, n + ' is not a single path');
    assert.strictEqual(inner(s).trim(), pathTags(s)[0], n + ' draws something besides its one path');
    assert.strictEqual(dOf(s), ICONS()[n], n + ': rendered path differs from ICONS[name]');
  }
});
test('every ICONS value is a non-empty string, and no two icons share a drawing', () => {
  const seen = {};
  for (const n of names()) {
    const d = ICONS()[n];
    assert(typeof d === 'string' && d.length > 0, n + ' has no path data');
    assert(!seen[d], n + ' is identical to ' + seen[d]);
    seen[d] = n;
  }
});

/* ---------- path data: a small SVG path reader, used to keep every mark inside the viewBox ---------- */
const ARITY = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
const NUM = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/;
// SVG elliptical arc (spec F.6.5), sampled: returns points along the arc, so a bulge counts, not just the ends.
function arcPoints(x1, y1, rx, ry, rotDeg, large, sweep, x2, y2) {
  if (rx === 0 || ry === 0 || (x1 === x2 && y1 === y2)) return [[x2, y2]];
  rx = Math.abs(rx); ry = Math.abs(ry);
  const phi = rotDeg * Math.PI / 180, cp = Math.cos(phi), sp = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const x1p = cp * dx + sp * dy, y1p = -sp * dx + cp * dy;
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let co = Math.sqrt(Math.max(0, num / den)); if (large === sweep) co = -co;
  const cxp = co * rx * y1p / ry, cyp = -co * ry * x1p / rx;
  const cx = cp * cxp - sp * cyp + (x1 + x2) / 2, cy = sp * cxp + cp * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => { const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a; };
  const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI; else if (sweep && dt < 0) dt += 2 * Math.PI;
  const pts = [];
  for (let i = 1; i <= 24; i++) {
    const t = t1 + dt * i / 24, ex = rx * Math.cos(t), ey = ry * Math.sin(t);
    pts.push([cp * ex - sp * ey + cx, sp * ex + cp * ey + cy]);
  }
  return pts;
}
// Returns every absolute point the path touches: vertices, Bezier control points (a conservative hull), sampled arcs.
// THROWS on anything malformed, so a typo in a path cannot slip through as "no points".
function pathPoints(d) {
  const pts = []; let i = 0, cmd = null, first = true, cx = 0, cy = 0, sx = 0, sy = 0;
  const skip = () => { while (i < d.length && /[\s,]/.test(d[i])) i++; };
  const num = () => { skip(); const m = NUM.exec(d.slice(i)); if (!m) throw new Error('number expected at ' + i + ' in "' + d + '"'); i += m[0].length; return parseFloat(m[0]); };
  const flag = () => { skip(); if (d[i] !== '0' && d[i] !== '1') throw new Error('arc flag expected at ' + i); return +d[i++]; };
  const push = (x, y) => { pts.push([x, y]); };
  for (;;) {
    skip(); if (i >= d.length) break;
    if (/[A-Za-z]/.test(d[i])) {
      if (!(d[i].toUpperCase() in ARITY)) throw new Error('unknown command "' + d[i] + '"');
      cmd = d[i++];
      if (first && cmd !== 'M' && cmd !== 'm') throw new Error('path must start with M');
      first = false;
      if (cmd === 'Z' || cmd === 'z') { cx = sx; cy = sy; continue; }
    } else if (cmd === null || cmd === 'Z' || cmd === 'z') throw new Error('stray number at ' + i);
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase(), ox = rel ? cx : 0, oy = rel ? cy : 0;
    if (C === 'M' || C === 'L' || C === 'T') { const x = num() + ox, y = num() + oy; push(x, y); cx = x; cy = y; if (C === 'M') { sx = x; sy = y; cmd = rel ? 'l' : 'L'; } }
    else if (C === 'H') { const x = num() + ox; push(x, cy); cx = x; }
    else if (C === 'V') { const y = num() + oy; push(cx, y); cy = y; }
    else if (C === 'C') { const a = num() + ox, b = num() + oy, c = num() + ox, e = num() + oy, x = num() + ox, y = num() + oy; push(a, b); push(c, e); push(x, y); cx = x; cy = y; }
    else if (C === 'S' || C === 'Q') { const a = num() + ox, b = num() + oy, x = num() + ox, y = num() + oy; push(a, b); push(x, y); cx = x; cy = y; }
    else if (C === 'A') {
      const rx = num(), ry = num(), rot = num(), lg = flag(), sw = flag(), x = num() + ox, y = num() + oy;
      arcPoints(cx, cy, rx, ry, rot, lg, sw, x, y).forEach((p) => push(p[0], p[1])); cx = x; cy = y;
    }
  }
  if (!pts.length) throw new Error('path draws nothing');
  return pts;
}
// Stroke is 1.75 wide, so it spills 0.875 past the geometry. Geometry in 1..23 keeps the whole ink inside 0..24.
const SAFE_MIN = 1, SAFE_MAX = 23, EPS = 1e-6;
const outside = (d) => pathPoints(d).filter((p) => p[0] < SAFE_MIN - EPS || p[0] > SAFE_MAX + EPS || p[1] < SAFE_MIN - EPS || p[1] > SAFE_MAX + EPS);

test('the path reader parses what it should (relative, implicit repeats, compressed arc flags)', () => {
  assert.deepEqual(pathPoints('M2 2h20'), [[2, 2], [22, 2]]);
  assert.deepEqual(pathPoints('M2 2l3 3 4 0'), [[2, 2], [5, 5], [9, 5]]);          // implicit repeat of l
  assert.deepEqual(pathPoints('M2 2 5 5'), [[2, 2], [5, 5]]);                      // implicit repeat of M is L
  assert.deepEqual(pathPoints('M2 2L5 5z m1 1h1').slice(-2), [[3, 3], [4, 3]]);    // z returns to the subpath start; m is relative to it
  const end = pathPoints('M5 5a1 1 0 012 2').pop();                                // flags run into the numbers: "012" = 0, 1, 2
  assert(Math.abs(end[0] - 7) < 1e-9 && Math.abs(end[1] - 7) < 1e-9);
  assert.deepEqual(pathPoints('M1 1h.5.5'), [[1, 1], [1.5, 1], [2, 1]]);          // ".5.5" is two numbers
});
test('the path reader rejects malformed data instead of shrugging', () => {
  for (const bad of ['', 'M', 'M5', 'X5 5', 'L5 5', '5 5', 'M5 5 L', 'M5 5a1 1 0 2 0 5 5', 'M5 5z 3 3', 'M5 5c1 1 2 2 3'])
    assert.throws(() => pathPoints(bad), Error, 'accepted malformed path: "' + bad + '"');
});
test('the bounds check catches vertices, relative moves, control points and arc bulges that leave the safe area', () => {
  for (const bad of ['M0.5 5h5',            // vertex under the minimum
                     'M5 5L25 5',           // vertex over the maximum
                     'M20 20h5',            // relative move out
                     'M5 5C5 5 30 5 6 6',   // only a control point is out
                     'M3 3a9 9 0 0 1 18 0', // both ends are fine; the arc bulges to y = -6
                     'M3 21a9 9 0 0 0 18 0']) // and the mirror image, bulging past 23
    assert(outside(bad).length > 0, 'bounds check missed: ' + bad);
  for (const fine of ['M1 1h22v22H1z', 'M3 12a9 9 0 0 1 18 0', 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z'])
    assert.deepEqual(outside(fine), [], 'bounds check false positive: ' + fine);
});
test('every mark lies inside the 1..23 safe area, so the 1.75 stroke is never clipped', () => {
  assert(names().length > 0, 'no icons to check');
  const bad = [];
  for (const n of names()) { const o = outside(ICONS()[n]); if (o.length) bad.push(n + ' leaves the safe area at ' + o.slice(0, 3).map((p) => '(' + p[0].toFixed(2) + ', ' + p[1].toFixed(2) + ')').join(' ')); }
  assert(bad.length === 0, bad.join('\n'));
});

/* ---------- no font dependency, no emoji (the whole reason this file exists) ---------- */
// Built from escapes so this test file itself holds no emoji glyph.
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{2460}-\u{27BF}\u{2900}-\u{297F}\u{2B00}-\u{2BFF}\u{FE0E}\u{FE0F}\u{200D}\u{20E3}]|\p{Extended_Pictographic}/u;
test('the emoji detector catches single emoji, ZWJ sequences, keycaps and text-style symbols, and spares ASCII', () => {
  for (const bad of ['\u{1F68C}', '\u{26A0}\u{FE0F}', '\u{1F468}\u{200D}\u{1F527}', '1\u{FE0F}\u{20E3}', '\u{2705}', '\u{2B50}', '\u{26FD}', '\u{2192}'])
    assert(EMOJI_RE.test(bad), 'detector missed U+' + bad.codePointAt(0).toString(16));
  assert(!EMOJI_RE.test('M12 3a9 9 0 1 0 0 18 <svg viewBox="0 0 24 24"> Warning'), 'detector false positive on plain ASCII');
});
test('contains no emoji (checked over every icon as rendered, titled and not)', () => {
  assert(names().length > 0, 'no icons to check');
  assert(!EMOJI_RE.test(JSON.stringify(ICONS())));
  for (const n of names().concat(['no-such-icon'])) assert(!EMOJI_RE.test(icon(n) + icon(n, { title: 'Title' })), n);
});
test('ui/icons.js is pure ASCII, so no glyph of any kind can depend on a font', () => {
  assert(!/[^\x00-\x7F]/.test(need()), 'non-ASCII character found');
});
const EXTERNAL = [/<text\b/i, /<tspan\b/i, /<style\b/i, /<script\b/i, /<image\b/i, /<use\b/i, /<foreignObject\b/i, /<font\b/i, /font-family/i,
  /\burl\(/i, /\bhref=/i, /xlink/i, /\bon[a-z]+=/i, /https?:\/\/(?!www\.w3\.org\/2000\/svg)/i];
test('no icon draws text or references anything external (no font, no sprite, no image, no script)', () => {
  for (const x of ['<text>A</text>', '<use href="#a"/>', '<style>a{}</style>', '<image href="a.png"/>', 'font-family="x"', 'fill="url(#g)"', '<svg onload="x()">', '<a xlink:href="x">', 'src="http://example.com/a.png"',
                  '<tspan>A</tspan>', '<script>x()</script>', '<foreignObject/>', '<font face="x"/>'])
    assert(EXTERNAL.some((re) => re.test(x)), 'detector missed: ' + x);
  assert(!EXTERNAL.some((re) => re.test('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>Bus</title><path d="M1 1h2"/></svg>')), 'detector false positive');
  assert(names().length > 0, 'no icons to check');
  for (const n of names().concat(['no-such-icon'])) {
    const s = icon(n) + icon(n, { title: 'Bus & <co>' });
    for (const re of EXTERNAL) assert(!re.test(s), n + ' matches ' + re);
  }
});

/* ---------- colour: inherited, never hard-coded ---------- */
test('inherits colour rather than hard-coding it', () => {
  const s = icon('bus');
  assert(s.includes('currentColor'));
  assert(!/#[0-9a-f]{3,6}/i.test(s));
});
test('every icon, and the fallback, paints only with currentColor or none, at stroke-width 1.75', () => {
  const paints = (s) => (s.match(/\s(?:fill|stroke|color|stop-color|flood-color)="[^"]*"/g) || []);
  assert.deepEqual(paints('<svg fill="red" stroke="#fff"/>'), [' fill="red"', ' stroke="#fff"'], 'extractor is blind');
  for (const n of names().concat(['no-such-icon'])) {
    const s = icon(n);
    const svgTag = /^<svg[^>]*>/.exec(s)[0];
    assert.strictEqual(attr(svgTag, 'stroke'), 'currentColor', n + ': stroke');
    assert.strictEqual(attr(svgTag, 'fill'), 'none', n + ': fill');
    assert.strictEqual(attr(svgTag, 'stroke-width'), '1.75', n + ': stroke-width');
    for (const p of paints(s)) assert(/="(currentColor|none)"$/.test(p), n + ' hard-codes a colour:' + p);
    assert(!/style=/.test(s), n + ' uses inline style');
  }
});

/* ---------- accessibility ---------- */
test('a named icon is announced, a decorative one is not', () => {
  assert(icon('warn', { title: 'Warning' }).includes('<title>Warning</title>'));
  assert(icon('warn').includes('aria-hidden="true"'));
});
test('a titled icon is an image with a name and not hidden; a decorative icon has neither title nor role', () => {
  for (const n of names()) {
    const t = icon(n, { title: 'Label' }), d = icon(n);
    assert(/^<svg[^>]*\srole="img"/.test(t), n + ': titled icon lacks role="img"');
    assert(!t.includes('aria-hidden'), n + ': titled icon is hidden from assistive tech');
    assert(!d.includes('<title'), n + ': decorative icon has a title');
    assert(!/\srole=/.test(d), n + ': decorative icon has a role');
  }
});
test('the title comes first inside the svg and is escaped (no markup injection through it)', () => {
  const s = icon('bus', { title: '5 < 6 & "x" > \'y\'' });
  assert(inner(s).startsWith('<title>5 &lt; 6 &amp; &quot;x&quot; &gt; &#39;y&#39;</title>'), inner(s));
  assert.strictEqual((s.match(/<title/g) || []).length, 1);
  assert.strictEqual((icon('bus', { title: '</title><script>x()</script>' }).match(/<script/g) || []).length, 0);
});
test('an empty, null or missing title is decorative, never an unnamed image (the number 0 is still a real title)', () => {
  for (const t of ['', null, undefined]) {
    const s = icon('bus', { title: t });
    assert(s.includes('aria-hidden="true"') && !s.includes('<title') && !s.includes('role='), 'title ' + JSON.stringify(t));
  }
  assert(icon('bus', { title: 0 }).includes('<title>0</title>'), 'a numeric title 0 is a real title');
});

/* ---------- size ---------- */
test('size defaults to 20 and sets width and height together', () => {
  assert(/ width="20" height="20"/.test(icon('bus')));
  assert(/ width="20" height="20"/.test(icon('bus', {})));
  assert(/ width="32" height="32"/.test(icon('bus', { size: 32 })));
  assert(/ width="14" height="14"/.test(icon('bus', { size: '14' })), 'a numeric string is a size');
});
test('a bad size falls back to 20 and cannot inject markup', () => {
  for (const bad of [0, -5, NaN, Infinity, 'big', '', null, true, [], {}, '20" onload="x', '1e999'])
    assert(/^<svg[^>]* width="20" height="20"/.test(icon('bus', { size: bad })), 'size ' + JSON.stringify(bad));
});

/* ---------- Review Focus 2: a missing icon must be visible, not nothing ---------- */
test('an unknown name renders a visible fallback', () => {
  const s = icon('no-such-icon');
  assert(s.includes('<svg'), 'must still render');
  assert(s.replace(/<svg[^>]*>|<\/svg>/g, '').trim().length > 0, 'must draw something');
});
test('the fallback is one dotted-square path, distinct from every real icon', () => {
  const s = icon('no-such-icon'), tags = pathTags(s);
  assert.strictEqual(tags.length, 1, 'fallback must be a single path');
  const corners = pathPoints(attr(tags[0], 'd')).map((p) => p.join(','));
  const xs = pathPoints(attr(tags[0], 'd')).map((p) => p[0]), ys = pathPoints(attr(tags[0], 'd')).map((p) => p[1]);
  assert.strictEqual(new Set(corners).size, 4, 'fallback must have exactly 4 distinct corners');
  assert.strictEqual(Math.max.apply(null, xs) - Math.min.apply(null, xs), Math.max.apply(null, ys) - Math.min.apply(null, ys), 'fallback must be a square (equal width and height)');
  assert(/^\d+(\.\d+)? \d+(\.\d+)?/.test(attr(tags[0], 'stroke-dasharray') || ''), 'fallback must be dotted (stroke-dasharray)');
  assert.deepEqual(outside(attr(tags[0], 'd')), [], 'fallback leaves the safe area');
  assert(s.includes('viewBox="0 0 24 24"'));
  for (const n of names()) assert(dOf(icon(n)) !== attr(tags[0], 'd'), 'fallback is indistinguishable from ' + n);
  for (const n of names()) assert(!/stroke-dasharray/.test(icon(n)), n + ' is dotted, which is reserved for the fallback');
});
test('names that are not own keys of ICONS give the fallback, never an inherited function or "undefined"', () => {
  const fallback = dOf(icon('no-such-icon'));
  for (const bad of ['constructor', 'toString', 'hasOwnProperty', '__proto__', 'valueOf', '', ' bus', 'BUS', undefined, null, 7, {}, ['bus']]) {
    const s = icon(bad);
    assert.strictEqual(dOf(s), fallback, 'name ' + JSON.stringify(bad) + ' did not fall back');
    assert(!/undefined|function|\[object/.test(s), 'name ' + JSON.stringify(bad) + ' leaked "' + s + '"');
  }
});
test('the fallback honours title and size like any icon, and echoes the missing name escaped', () => {
  const s = icon('no"such<icon', { size: 40, title: 'Missing' });
  assert(/ width="40" height="40"/.test(s) && s.includes('<title>Missing</title>'));
  assert(!s.includes('no"such<icon'), 'name must not be echoed raw');
  assert(s.includes('data-missing="no&quot;such&lt;icon"'), 'missing name should be visible in the DOM for debugging: ' + s);
  assert(/aria-hidden="true"/.test(icon('nope')), 'untitled fallback is decorative like any other');
});

/* ---------- done ---------- */
if (fails) { console.log('\n' + fails + ' FAILED'); process.exit(1); }
console.log('\nall passed');

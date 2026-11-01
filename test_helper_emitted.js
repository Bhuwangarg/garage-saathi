/* Shared by test_ui_states.js and test_ui_components.js (not a test itself: run neither this file nor expect output).
 * ONE source for "what markup does ui/states.js really emit": the tiny HTML reader, the list of emitter calls, and a
 * loader that runs icons.js and states.js the way a page does (a plain script, a window, a clock). Both test files
 * read the emitted markup from here, so the component fixtures cannot drift from what the code writes. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

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

// Every emitter call the module has, in every variant that changes the markup.
const HOUR = 3600e3;
function emittedHtml(win, clock) {
  return [win.emptyState('a'), win.emptyState('a', { hint: 'b', icon: 'bus' }), win.errorState('a'), win.errorState('a', function () {}), win.offlineState(), win.skeleton(2),
    win.figure(null), win.figure(0), win.figure(5, { unit: 'km' }), win.figure(5, { unit: 'km', stale: true, at: clock.now - HOUR }), win.figure(5, { stale: true })];
}
// icons.js and states.js, loaded as a page loads them.
function loadStates(root) {
  root = root || __dirname;
  const clock = { now: Date.UTC(2026, 10, 1, 12, 0, 0) };
  const sandbox = {};
  sandbox.window = sandbox;
  sandbox.Date = { now: () => clock.now, parse: Date.parse };
  sandbox.document = { addEventListener: () => {} };
  const ctx = vm.createContext(sandbox);
  for (const f of ['icons.js', 'states.js']) vm.runInContext(fs.readFileSync(path.join(root, 'ui', f), 'utf8'), ctx, { filename: f });
  return { win: sandbox, clock };
}
// Every element that has a class, as {tag, classes, attrs} (attrs without class), deduplicated by tag + classes + attrs.
function emittedElements(win, clock) {
  if (!win) ({ win, clock } = loadStates());
  const seen = new Set(), out = [];
  for (const h of emittedHtml(win, clock)) walk(parseHtml(h), (e) => {
    const classes = classesOf(e); if (!classes.length) return;
    const attrs = Object.assign({}, e.attrs); delete attrs['class'];
    const key = e.tag + '|' + classes.join(' ') + '|' + JSON.stringify(attrs);
    if (!seen.has(key)) { seen.add(key); out.push({ tag: e.tag, classes, attrs }); }
  });
  return out;
}
module.exports = { parseHtml, isEl, classesOf, walk, emittedHtml, loadStates, emittedElements };

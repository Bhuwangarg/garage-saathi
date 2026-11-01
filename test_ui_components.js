/* Tests for ui/components.css - the static component layer. Run: node test_ui_components.js
 * Parses stylesheets as TEXT; needs no browser and no dependencies. Exits non-zero on any failure.
 *
 * Two kinds of check live here:
 *   1. Text checks on the stylesheet (deny-lists, scope, literals), each with a self-test that feeds the
 *      checker input that MUST be rejected.
 *   2. A small CASCADE MODEL (selectors, specificity, order, inheritance, var(), the font: shorthand reset,
 *      Chrome's UA rule for form controls). Instead of grepping for "tabular-nums" it builds a document
 *      fragment, asks what each element would compute, and compares. The model throws on any selector it
 *      does not understand, so a rule can never be silently skipped. It models only what this file uses.
 *      The browser is the final judge: the report records the same questions asked of real Chrome.
 *
 * COMPONENTS_CSS=<path> points the suite at a different stylesheet (used to run the suite against a
 * deliberately broken copy and watch it go red). */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const FILE = process.env.COMPONENTS_CSS || path.join(__dirname, 'ui', 'components.css');
const TOKENS_FILE = path.join(__dirname, 'ui', 'tokens.css');
const LIVE_FILE = path.join(__dirname, 'styles.css');

let fails = 0;
function test(name, fn) {
  try { fn(); console.log('  ok  ' + name); }
  catch (e) { console.log(' FAIL ' + name + '\n        ' + String(e.message).split('\n').join('\n        ')); fails++; }
}

/* ---------- loading ---------- */
const raw = fs.existsSync(FILE) ? fs.readFileSync(FILE, 'utf8') : null;
const need = () => { if (raw === null) throw new Error(path.relative(__dirname, FILE) + ' does not exist'); return raw; };
const TOKENS = fs.readFileSync(TOKENS_FILE, 'utf8');
const LIVE = fs.readFileSync(LIVE_FILE, 'utf8');

/* ---------- a small CSS reader (the brace-depth reader from test_ui_tokens.js, plus declaration order) ---------- */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const GROUPING = /^@(media|supports|layer|container)\b/;

// A grouping at-rule may contain rules; a STYLE rule may not.
// Returns [{ctx, selector, decls:{prop:value}, list:[[prop,value]...], nested}].
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

// Split at TOP-LEVEL separators only, so :is(a, b), [x="a,b"] and cubic-bezier(.2, 0, 0, 1) stay whole.
function splitTop(s, sep) {
  const out = []; let depth = 0, cur = '', q = null;
  for (const ch of s) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (depth === 0 && (sep === ' ' ? /\s/.test(ch) : ch === sep)) { if (cur.trim()) out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
// Replace every occurrence of `from` in a stylesheet; THROWS if there is nothing to replace, so a self-test
// mutation that stopped applying (because the stylesheet changed) fails loudly instead of passing vacuously.
function mutate(css, from, to) {
  const hit = from instanceof RegExp ? from.test(css) : css.includes(from);
  if (!hit) throw new Error('self-test mutation did not apply, target not found: ' + from);
  return from instanceof RegExp ? css.replace(from, to) : css.split(from).join(to);
}

test('the CSS reader splits rules, descends into grouping at-rules, and flags nesting', () => {
  const ok = parseRules('@media (x){.a{color:red;margin:0}}');
  assert.strictEqual(ok.length, 1);
  assert.deepEqual(ok[0].ctx, ['@media (x)']);
  assert.deepEqual(ok[0].list, [['color', 'red'], ['margin', '0']]);
  assert(!ok[0].nested);
  assert(parseRules('.a{color:red; .b{color:blue}}').some((r) => r.nested), 'checker is blind to nesting');
  assert.deepEqual(splitTop('a:is(b, c), [x="1,2"], d', ','), ['a:is(b, c)', '[x="1,2"]', 'd']);
  assert.deepEqual(splitTop('transform 120ms cubic-bezier(.2, 0, 0, 1)', ' '), ['transform', '120ms', 'cubic-bezier(.2, 0, 0, 1)']);
});

/* =====================================================================================================
 * THE SELECTOR AND CASCADE MODEL
 * ===================================================================================================== */
const PSEUDO_CLASSES = ['not', 'is', 'lang', 'active', 'hover', 'focus', 'focus-visible', 'disabled', 'enabled', 'checked', 'first-child', 'last-child'];

function parseCompound(str) {
  const c = { tag: null, parts: [], pseudoEl: false, src: str };
  let rest = str;
  const t = /^(\*|[A-Za-z][\w-]*)/.exec(rest);
  if (t) { c.tag = t[1]; rest = rest.slice(t[0].length); }
  const PART = /^(?:\.([\w-]+)|#([\w-]+)|\[\s*([\w-]+)\s*(?:([~|^$*]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]+)))?\s*\]|(::?)([\w-]+)(?:\(((?:[^()]|\((?:[^()]|\([^()]*\))*\))*)\))?)/;
  while (rest) {
    const m = PART.exec(rest);
    if (!m) throw new Error('selector model does not understand "' + str + '" at "' + rest + '"');
    if (m[1] !== undefined) c.parts.push({ k: 'class', v: m[1] });
    else if (m[2] !== undefined) c.parts.push({ k: 'id', v: m[2] });
    else if (m[3] !== undefined) c.parts.push({ k: 'attr', name: m[3], op: m[4] || null, val: m[5] !== undefined ? m[5] : m[6] !== undefined ? m[6] : m[7] });
    else if (m[8] === '::') c.pseudoEl = true;
    else {
      const name = m[9];
      if (!PSEUDO_CLASSES.includes(name)) throw new Error('selector model does not understand :' + name + ' in "' + str + '"');
      let arg = m[10];
      if (name === 'not' || name === 'is') {
        if (arg === undefined || !arg.trim()) throw new Error(':' + name + ' needs an argument');
        arg = splitTop(arg, ',').map((s) => { const p = parseSelector(s); if (p.length !== 1) throw new Error('selector model does not understand a combinator inside :' + name + '(): ' + s); return p; });
      }
      c.parts.push({ k: 'pseudo', name, arg });
    }
    rest = rest.slice(m[0].length);
  }
  return c;
}
function parseSelector(sel) {
  const steps = []; let i = 0; sel = sel.trim();
  while (i < sel.length) {
    let comb = null;
    while (i < sel.length && /[\s>+~]/.test(sel[i])) {
      if (sel[i] === '+' || sel[i] === '~') throw new Error('selector model does not understand the "' + sel[i] + '" combinator in "' + sel + '"');
      if (sel[i] === '>') comb = '>';
      i++;
    }
    const start = i; let depth = 0, q = null;
    while (i < sel.length) {
      const ch = sel[i];
      if (q) { if (ch === q) q = null; }
      else if (ch === '"' || ch === "'") q = ch;
      else if (ch === '(' || ch === '[') depth++;
      else if (ch === ')' || ch === ']') depth--;
      else if (depth === 0 && /[\s>+~]/.test(ch)) break;
      i++;
    }
    if (i > start) steps.push({ comb: steps.length ? (comb || ' ') : null, compound: parseCompound(sel.slice(start, i)) });
  }
  if (!steps.length) throw new Error('empty selector');
  return steps;
}
function specificity(steps) {
  let a = 0, b = 0, c = 0;
  for (const s of steps) {
    if (s.compound.tag && s.compound.tag !== '*') c++;
    if (s.compound.pseudoEl) c++;
    for (const p of s.compound.parts) {
      if (p.k === 'id') a++;
      else if (p.k === 'class' || p.k === 'attr') b++;
      else if (p.k === 'pseudo') {
        if (p.name === 'not' || p.name === 'is') {
          const best = Math.max.apply(null, p.arg.map(specificity)); // :not/:is take their most specific argument
          a += Math.floor(best / 10000); b += Math.floor(best / 100) % 100; c += best % 100;
        } else b++;
      }
    }
  }
  return a * 10000 + b * 100 + c;
}
const BUTTONISH = ['button', 'input', 'select', 'textarea'];
function matchCompound(c, el) {
  if (c.pseudoEl) return false; // a rule aimed at ::placeholder styles no element
  if (c.tag && c.tag !== '*' && c.tag !== el.tag) return false;
  for (const p of c.parts) {
    if (p.k === 'class') { if (!el.classes.includes(p.v)) return false; }
    else if (p.k === 'id') { if (el.attrs.id !== p.v) return false; }
    else if (p.k === 'attr') {
      const v = el.attrs[p.name];
      if (v === undefined) return false;
      if (p.op === null) continue;
      if (p.op === '=' && v !== p.val) return false;
      if (p.op === '~=' && !v.split(/\s+/).includes(p.val)) return false;
      if (p.op === '^=' && !v.startsWith(p.val)) return false;
      if (p.op === '$=' && !v.endsWith(p.val)) return false;
      if (p.op === '*=' && !v.includes(p.val)) return false;
      if (p.op === '|=' && v !== p.val && !v.startsWith(p.val + '-')) return false;
    } else {
      const n = p.name;
      if (n === 'not') { if (p.arg.some((s) => matchSteps(s, s.length - 1, el))) return false; }
      else if (n === 'is') { if (!p.arg.some((s) => matchSteps(s, s.length - 1, el))) return false; }
      else if (n === 'lang') {
        let a = el; while (a && a.attrs.lang === undefined) a = a.parent; // the NEAREST lang wins
        const l = a ? a.attrs.lang.toLowerCase() : ''; const want = String(p.arg).trim().toLowerCase();
        if (l !== want && !l.startsWith(want + '-')) return false;
      }
      else if (n === 'active' || n === 'hover') { if (!el.states.has(n)) return false; }
      else if (n === 'focus') { if (!el.states.has('focus') && !el.states.has('focus-visible')) return false; }
      else if (n === 'focus-visible') { if (!el.states.has('focus-visible')) return false; }
      else if (n === 'disabled') { if (!(BUTTONISH.includes(el.tag) && el.attrs.disabled !== undefined)) return false; }
      else if (n === 'enabled') { if (!(BUTTONISH.includes(el.tag) && el.attrs.disabled === undefined)) return false; }
      else if (n === 'checked') { if (el.attrs.checked === undefined) return false; }
      else if (n === 'first-child') { if (!el.pos.first) return false; }
      else if (n === 'last-child') { if (!el.pos.last) return false; }
    }
  }
  return true;
}
function matchSteps(steps, i, el) {
  if (!matchCompound(steps[i].compound, el)) return false;
  if (i === 0) return true;
  if (steps[i].comb === '>') return !!el.parent && matchSteps(steps, i - 1, el.parent);
  for (let a = el.parent; a; a = a.parent) if (matchSteps(steps, i - 1, a)) return true;
  return false;
}

// Document fragments. mk(parent, 'button.btn.btn-primary', {attrs}, {states, pos}).
let UID = 0;
function mk(parent, desc, attrs, extra) {
  const m = /^([a-z][\w-]*)((?:\.[\w-]+)*)$/.exec(desc);
  if (!m) throw new Error('bad element description ' + desc);
  return { id: ++UID, tag: m[1], classes: m[2] ? m[2].slice(1).split('.') : [], attrs: attrs || {}, parent,
    states: new Set((extra && extra.states) || []), pos: (extra && extra.pos) || { first: false, last: false } };
}
const inState = (el, states, attrs) => Object.assign({}, el, { id: ++UID, states: new Set(states), attrs: Object.assign({}, el.attrs, attrs || {}) });

// A stylesheet: rules with parsed selector lists. Strict sheets THROW on a selector they cannot model;
// lenient ones (the live styles.css, which is not ours) skip it and count it.
function sheetOf(name, origin, css, o) {
  o = o || {};
  const rules = []; let skipped = 0;
  for (const r of rulesOf(css)) {
    if (o.contextFree && r.ctx.length) continue;
    if (r.selector.startsWith('@')) continue; // @keyframes bodies etc.
    const sels = [];
    for (const s of splitTop(r.selector, ',')) {
      try { const steps = parseSelector(s); sels.push({ steps, spec: specificity(steps), src: s }); }
      catch (e) { if (!o.lenient) throw e; skipped++; }
    }
    rules.push({ ctx: r.ctx, sels, list: r.list });
  }
  return { name, origin, rules, skipped };
}
// What Chrome's UA stylesheet does to form controls, as far as this file is concerned: one font: shorthand.
const UA = () => sheetOf('ua', 'ua', 'input, textarea, select, button { font: -webkit-small-control; }');

function ctxOk(ctx, o) {
  for (const c of ctx) {
    if (/^@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)$/.test(c)) { if (!o.reduced) return false; }
    else if (/^@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)$/.test(c)) { if (!o.dark) return false; }
    else if (/^@media\s*\(\s*hover\s*:\s*hover\s*\)$/.test(c)) { /* the office has mice; :hover states are modelled as available */ }
    else throw new Error('cascade model does not understand ' + c);
  }
  return true;
}
// Shorthands that reset font-variant-numeric (and what else the model needs from them).
function expand(prop, value) {
  if (prop === 'font') return [['font-variant-numeric', 'normal'], ['font-family', '<font shorthand>'], ['font-size', '<font shorthand>'], ['line-height', 'normal'], ['font-weight', '<font shorthand>']];
  if (prop === 'font-variant') return [['font-variant-numeric', 'normal']];
  // A shorthand also sets its longhands, so a later shorthand beats an earlier longhand and vice versa. The longhand
  // entries carry the shorthand's value only as an ownership marker: tests read the shorthand itself where they care.
  const SIDES = ['top', 'right', 'bottom', 'left'], out = [[prop, value]];
  const marks = (names) => names.forEach((n) => out.push([n, value]));
  if (prop === 'margin' || prop === 'padding') marks(SIDES.map((s) => prop + '-' + s));
  else if (prop === 'border') { marks(['border-color', 'border-style', 'border-width']); SIDES.forEach((s) => marks(['border-' + s, 'border-' + s + '-color', 'border-' + s + '-style', 'border-' + s + '-width'])); }
  else if (/^border-(top|right|bottom|left)$/.test(prop)) marks([prop + '-color', prop + '-style', prop + '-width']);
  else if (prop === 'border-color' || prop === 'border-style' || prop === 'border-width') marks(SIDES.map((s) => 'border-' + s + '-' + prop.slice(7)));
  else if (prop === 'background') marks(['background-color', 'background-image']);
  else if (prop === 'outline') marks(['outline-color', 'outline-style', 'outline-width']);
  return out;
}
function cascadeOf(el, sheets, o) {
  const won = new Map(); let order = 0;
  for (const sh of sheets) for (const r of sh.rules) {
    if (!ctxOk(r.ctx, o)) { order += r.list.length * 8; continue; }
    let spec = -1;
    for (const s of r.sels) if (matchSteps(s.steps, s.steps.length - 1, el)) spec = Math.max(spec, s.spec);
    if (spec < 0) { order += r.list.length * 8; continue; }
    for (const [p0, v0] of r.list) {
      const imp = /!\s*important\s*$/.test(v0), v = v0.replace(/!\s*important\s*$/, '').trim();
      for (const [p, val] of expand(p0, v)) {
        const key = [imp ? 1 : 0, sh.origin === 'ua' ? 0 : 1, spec, ++order];
        const cur = won.get(p);
        let better = !cur;
        if (cur) for (let i = 0; i < 4 && !better; i++) { if (key[i] > cur.key[i]) better = true; else if (key[i] < cur.key[i]) break; else if (i === 3) better = true; }
        if (better) won.set(p, { value: val, key, sheet: sh.name });
      }
    }
  }
  return won;
}
const INHERITED = new Set(['font-variant-numeric', 'font-family', 'line-height', 'font-size', 'font-weight', 'color', 'cursor', 'white-space', 'letter-spacing']);
function model(sheets, o) {
  o = o || {};
  const memo = new Map();
  const casc = (el) => { const k = el.id + '|' + sheets.length; let c = memo.get(k); if (!c) { c = cascadeOf(el, sheets, o); memo.set(k, c); } return c; };
  // The value the element's OWN rules give a property (var() unresolved), or undefined. No inheritance.
  const declared = (el, prop) => { const d = casc(el).get(prop); return d ? d.value : undefined; };
  const winner = (el, prop) => { const d = casc(el).get(prop); return d ? d.sheet : undefined; };
  const subst = (value, el) => {
    for (let n = 0; n < 12 && /var\(/.test(value); n++) {
      value = value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*))?\)/g, (m, name, fb) => {
        const v = computed(el, name);
        return v !== undefined ? v : fb !== undefined ? fb.trim() : '<unresolved ' + name + '>';
      });
    }
    return value;
  };
  // The computed value: own declaration with var() substituted in THIS element's context, else inherited.
  // That is the CSS rule that makes `font-size: var(--t5)` on a root keep the root's 16px inside a desk container.
  const computed = (el, prop) => {
    const d = declared(el, prop);
    if (d !== undefined && d !== 'inherit' && d !== 'unset') return subst(d, el);
    if ((d === 'inherit' || d === 'unset' || INHERITED.has(prop) || prop.startsWith('--')) && el.parent) return computed(el.parent, prop);
    return undefined;
  };
  return { declared, winner, computed, cascade: casc };
}

/* ----- self-tests of the model: it is only worth trusting if it gets the known answers right ----- */
function frag() { const html = mk(null, 'html'); const root = mk(html, 'div', { 'data-v2': '' }); return { html, root }; }
test('selector model: combinators, attributes, :not/:is/:lang, states, pseudo-elements and specificity', () => {
  const { root } = frag();
  const card = mk(root, 'div.card'), btn = mk(card, 'button.btn.btn-primary', { role: 'tab', 'aria-selected': 'true', disabled: '' });
  const m = (sel, el) => { const s = parseSelector(sel); return matchSteps(s, s.length - 1, el); };
  for (const yes of ['.btn', 'button.btn', '[data-v2] .btn', '.card .btn', '.card > .btn', '.btn.btn-primary', '[role="tab"]', '[role=tab]', '[aria-selected="true"]', '[disabled]',
                     '[role^="ta"]', '[role$="ab"]', '[role*="a"]', '.btn:not(.nope)', '.btn:is(.x, .btn)', 'button:disabled', '[data-v2] .card > button'])
    assert(m(yes, btn), 'should match: ' + yes);
  for (const no of ['.card', 'a.btn', '[data-v2] > .btn', '.btn:not(.btn-primary)', '.btn:is(.x, .y)', '.btn:active', '.btn:hover', '.btn:focus-visible', 'button:enabled',
                    '[role="tabs"]', '.btn::placeholder', '.btn:first-child', '.other .btn', '.btn > .card'])
    assert(!m(no, btn), 'should NOT match: ' + no);
  assert(m('.btn:active', inState(btn, ['active'])) && m('.btn:focus', inState(btn, ['focus-visible'])) && !m('.btn:focus-visible', inState(btn, ['focus'])));
  assert(m('[data-v2] .btn:first-child', Object.assign({}, btn, { pos: { first: true, last: false } })));
  const hi = mk(mk(root, 'div', { lang: 'hi-IN' }), 'p'), en = mk(mk(mk(root, 'div', { lang: 'hi' }), 'div', { lang: 'en' }), 'p');
  assert(m(':lang(hi)', hi) && m(':lang(hi)', mk(root, 'p', { lang: 'hi' })) && !m(':lang(hi)', en) && !m(':lang(hi)', mk(root, 'p')), ':lang must follow the nearest lang, region subtags included');
  const spec = (s) => specificity(parseSelector(s));
  assert.strictEqual(spec('.a'), 100); assert.strictEqual(spec('[data-v2] .a'), 200); assert.strictEqual(spec('button'), 1);
  assert.strictEqual(spec('[data-v2] .a:active:not(:disabled)'), 400); assert.strictEqual(spec('a:is(.x, #y)'), 10001);
  assert(spec('[data-v2] .btn') > spec('.btn') && spec('.btn.primary') > spec('.btn') && spec('input') < spec('.f'));
});
test('selector model: syntax it does not understand THROWS instead of being skipped', () => {
  for (const bad of ['a + b', 'a ~ b', ':has(a)', 'a:nth-child(2)', ':not(a b)', '.a:where(.b)', 'a:before', '[x', ':is()'])
    assert.throws(() => { const s = parseSelector(bad); matchSteps(s, s.length - 1, mk(null, 'a')); }, Error, 'accepted: ' + bad);
});
test('cascade model: specificity beats order, order breaks ties, author beats UA, !important wins', () => {
  const { root } = frag(); const b = mk(root, 'button.x.y');
  const at = (css, prop) => model([sheetOf('a', 'author', css)]).declared(b, prop);
  assert.strictEqual(at('.x.y{color:red} .x{color:blue}', 'color'), 'red');          // higher specificity, earlier
  assert.strictEqual(at('.x{color:red} .y{color:blue}', 'color'), 'blue');           // tie: later wins
  assert.strictEqual(at('button{color:red !important} .x.y{color:blue}', 'color'), 'red');
  assert.strictEqual(at('[data-v2] .x{color:red} .x.y{color:blue}', 'color'), 'blue');  // 0,2,0 vs 0,2,0: the later one
  assert.strictEqual(at('[data-v2] .x{color:red} .y{color:blue}', 'color'), 'red');      // 0,2,0 beats 0,1,0 although it comes first
  assert.strictEqual(model([sheetOf('a', 'author', 'button{color:red}'), UA()]).declared(b, 'color'), 'red');
  assert.strictEqual(model([sheetOf('ua', 'ua', 'button{font:x}'), sheetOf('a', 'author', 'div button{font-family:serif}')]).declared(b, 'font-family'), 'serif', 'author beats UA');
  assert.strictEqual(model([sheetOf('a', 'author', '.x{font-family:serif}'), sheetOf('ua', 'ua', 'button{font-family:mono}')]).declared(b, 'font-family'), 'serif', 'UA loses even when it comes later and is more specific');
});
test('cascade model: inheritance, var() resolved where it is declared, and the font shorthand reset', () => {
  const { root } = frag(); const wrap = mk(root, 'div', { 'data-density': 'desk' }), p = mk(wrap, 'p'), b = mk(wrap, 'button');
  const sheet = sheetOf('a', 'author', '[data-v2]{--t:16px; font-size:var(--t); font-variant-numeric:tabular-nums; min-height:3px} [data-density]{--t:15px} button{min-height:var(--t)}');
  const m = model([sheet]);
  assert.strictEqual(m.computed(p, 'font-variant-numeric'), 'tabular-nums', 'font-variant-numeric inherits');
  assert.strictEqual(m.computed(p, 'font-size'), '16px', 'font-size var() is resolved at the root, so the desk container does NOT re-resolve it');
  assert.strictEqual(m.computed(p, '--t'), '15px', 'custom properties cascade into the container');
  assert.strictEqual(m.computed(b, 'min-height'), '15px', 'var() in a declaration resolves against the element');
  assert.strictEqual(m.computed(p, 'min-height'), undefined, 'min-height does not inherit');
  assert.strictEqual(m.computed(mk(root, 'p'), 'nothing'), undefined);
  // the trap, reproduced: the UA font: shorthand on a form control resets what the root set and what inherits
  const withUA = model([UA(), sheet]);
  assert.strictEqual(withUA.computed(p, 'font-variant-numeric'), 'tabular-nums', 'a paragraph is untouched by the UA rule');
  assert.strictEqual(withUA.computed(b, 'font-variant-numeric'), 'normal', 'a button gets the UA font: shorthand, which resets tabular-nums');
  const fixed = model([UA(), sheet, sheetOf('a2', 'author', '[data-v2] button{font-variant-numeric:tabular-nums}')]);
  assert.strictEqual(fixed.computed(b, 'font-variant-numeric'), 'tabular-nums', 'an author declaration on the control beats the UA reset');
  const reset = model([UA(), sheet, sheetOf('a2', 'author', '[data-v2] button{font-variant-numeric:tabular-nums} .gc button{font:700 13px x}')]);
  const gc = mk(mk(root, 'div.gc'), 'button');
  assert.strictEqual(reset.computed(gc, 'font-variant-numeric'), 'normal', 'a later, equally specific author font: shorthand resets it again (the live styles.css pattern)');
});

/* =====================================================================================================
 * HOUSE CONSTRAINTS, AS TEXT CHECKS
 * Each checker takes stylesheet text and returns a list of failures. The real stylesheet must produce [];
 * each self-test feeds a checker input that MUST produce failures (and input that must not).
 * ===================================================================================================== */
const declsOf = (css) => rulesOf(css).flatMap((r) => r.list.map(([p, v]) => ({ sel: r.selector, ctx: r.ctx, prop: p, val: v })));
const hits = (failures, why) => assert(failures.length > 0, why);

/* ---------- Chrome 109 ---------- */
// A deny-list, not a proof: it names what a stylesheet is likely to reach for that Chrome 109 lacks.
const BANNED = [
  ['oklch()', /oklch\(/], ['oklab()', /oklab\(/], ['lch()', /(?<![\w-])lch\(/], ['lab()', /(?<![\w-])lab\(/], ['hwb()', /hwb\(/],
  ['color()', /(?<![\w-])color\(/], ['color-mix()', /color-mix\(/], ['light-dark()', /light-dark\(/],
  ['relative colour syntax', /(?:rgb|hsl|hwb|lab|lch|oklab|oklch)a?\(\s*from\b/],
  ['@starting-style', /@starting-style/], ['subgrid', /subgrid/], ['text-wrap', /text-wrap/], ['view transitions', /view-transition/],
  ['@scope', /@scope/], ['popover', /popover/], ['anchor positioning', /anchor-name|position-anchor|(?<![\w-])anchor\(/],
  ['field-sizing', /field-sizing/], ['interpolate-size / calc-size', /interpolate-size|calc-size/],
  ['transition-behavior / allow-discrete', /transition-behavior|allow-discrete/], ['scrollbar-width / scrollbar-color', /scrollbar-(?:width|color)/],
  ['scroll-driven animation', /animation-timeline|scroll-timeline|view-timeline/], [':user-valid / :user-invalid', /:user-(?:valid|invalid)/],
  ['cap / ic / rlh units', /\d(?:cap|ic|rcap|ric|rlh)\b/],
  ['CSS math functions (round, mod, rem, trig, pow...)', /(?<![\w-])(?:round|mod|rem|sin|cos|tan|asin|acos|atan|atan2|pow|sqrt|hypot|log|exp|abs|sign)\(/],
  ['nesting selector &', /(^|[\s,{;])&/],
];
function chromeFloorFailures(css) {
  const c = stripComments(css);
  const out = BANNED.filter(([, re]) => re.test(c)).map(([n]) => n + ' is not available on Chrome 109');
  for (const r of parseRules(c)) if (r.nested) out.push('nested rule inside "' + r.selector + '"');
  return out;
}
test('the Chrome 109 checker catches each banned feature and nesting, and spares what 109 has', () => {
  const bad = ['a{color:oklch(.5 0 0)}', 'a{color:oklab(1 0 0)}', 'a{color:lch(1 0 0)}', 'a{color:lab(1 0 0)}', 'a{color:hwb(1 0% 0%)}', 'a{color:color(srgb 1 0 0)}',
    'a{color:color-mix(in srgb,red,blue)}', 'a{color:light-dark(red,blue)}', 'a{color:hsl(from red h s l)}', '@starting-style{a{}}', 'a{grid-template-columns:subgrid}',
    'a{text-wrap:balance}', 'a{view-transition-name:x}', '@scope (a){b{}}', '[popover]{}', 'a{anchor-name:--x}', 'a{field-sizing:content}', 'a{width:calc-size(auto,size)}',
    'a{transition-behavior:allow-discrete}', 'a{scrollbar-width:thin}', 'a{animation-timeline:scroll()}', 'a:user-invalid{}', 'a{width:2cap}', 'a{width:round(1.5px,1px)}',
    'a{width:mod(5px,2px)}', 'a{width:abs(-1px)}', '.a{color:red; .b{color:blue}}', '.a{& .b{color:red}}'];
  for (const b of bad) hits(chromeFloorFailures(b), 'missed: ' + b);
  for (const [name, re] of BANNED) assert(bad.some((b) => re.test(b)), 'no sample exercises the "' + name + '" entry of the deny-list');
  const ok = ['a{color:hsl(16 88% 54%)}', 'a{width:min(10px,2rem);height:clamp(1px,2vw,3px)}', '.a:has(> b){display:grid}', '@media (prefers-reduced-motion: reduce){.a{transform:none}}',
    'a{inset:0;aspect-ratio:1;gap:4px;accent-color:red;translate:1px;width:100dvh}', 'a{background:var(--surface-raised);color:var(--ink)} /* oklch( in a comment is not code */',
    '.a:is(b,c):not(d){overflow-wrap:anywhere}', '.log{width:1px}', '.round{border-radius:1px}', '.a{transform:scale(0.97)}'];
  for (const k of ok) assert.deepEqual(chromeFloorFailures(k), [], 'false positive on: ' + k);
});
test('ui/components.css uses no CSS feature on the Chrome 109 deny-list, and declares no nested rule', () => {
  assert(rulesOf(need()).length > 0, 'parsed no rules: an empty stylesheet would pass vacuously');
  assert.deepEqual(chromeFloorFailures(need()), []);
});

/* ---------- no emoji, no glyph ---------- */
test('ui/components.css is pure ASCII, so it holds no emoji and no glyph that depends on a font (Windows 7 lacks them)', () => {
  const nonAscii = (s) => /[^\x00-\x7F]/.test(s);
  assert(nonAscii('x \u{1F68C} y') && nonAscii('x → y') && nonAscii('“quoted”') && !nonAscii('plain ascii: a{b:c}'), 'detector is broken');
  assert(!nonAscii(need()), 'non-ASCII character found');
});

/* ---------- scope ---------- */
// Every selector must START with [data-v2] (optionally on a type), so nothing here can touch the live app.
const SCOPE_OK = /^(?:[a-zA-Z][\w-]*)?\[data-v2\]/, SCOPE_LEAK = /:root|:not\(\s*[^)]*data-v2/;
function unscopedSelectors(css) {
  return rulesOf(css).filter((r) => !r.selector.startsWith('@')).flatMap((r) => splitTop(r.selector, ','))
    .filter((sel) => !SCOPE_OK.test(sel) || SCOPE_LEAK.test(sel));
}
test('the scope checker flags every selector that could reach outside [data-v2], and accepts every scoped form', () => {
  const caught = (sel) => unscopedSelectors(sel + '{color:red}').length > 0;
  for (const leak of ['.btn', 'button', 'input.field', ':root .btn', ':root', '*', '[data-v2], .btn', '.card [data-v2]', ':not([data-v2]) .btn', 'body [data-v2]', '[data-density="desk"] .btn', '[lang="hi"]'])
    assert(caught(leak), 'should have been flagged as unscoped: ' + leak);
  for (const fine of ['[data-v2] .btn', '[data-v2]', '[data-v2] *', '[data-v2] *::before', '[data-v2]:lang(hi)', '[data-v2] :lang(hi)', 'html[data-v2] .btn', '[data-v2] .btn:is(a, button)', '[data-v2], [data-v2] .row'])
    assert(!caught(fine), 'should have been accepted as scoped: ' + fine);
  assert.deepEqual(unscopedSelectors('@media (prefers-reduced-motion: reduce){.btn{color:red} [data-v2] .row{color:red}}'), ['.btn'], 'a rule inside @media is still checked');
});
test('every selector in ui/components.css, at-rules included, is scoped to [data-v2]', () => {
  assert(rulesOf(need()).length > 0, 'no rules to check: an empty stylesheet would pass vacuously');
  const bad = unscopedSelectors(need());
  assert(bad.length === 0, 'unscoped selector(s) would leak into the live app: ' + bad.join(' | '));
});

/* ---------- decisions pinned as absences ---------- */
const absent = (css, re) => { const m = re.exec(stripComments(css)); return m ? [m[0]] : []; };
test('declares no @layer (the decision and its reason are in the header: layered rules lose to the live app\'s unlayered styles.css)', () => {
  hits(absent('@layer components{.a{}}', /@layer\b/), 'checker is blind');
  assert.deepEqual(absent(need(), /@layer\b/), []);
});
test('declares no !important', () => {
  hits(absent('a{color:red !important}', /!\s*important/), 'checker is blind');
  assert.deepEqual(absent(need(), /!\s*important/), []);
});
test('declares no font: or font-variant: shorthand, either of which resets font-variant-numeric to normal', () => {
  const find = (css) => declsOf(css).filter((d) => d.prop === 'font' || d.prop === 'font-variant').map((d) => d.sel + ' { ' + d.prop + ' }');
  hits(find('.a{font:700 13px x}'), 'checker is blind to font:'); hits(find('.a{color:red;font-variant:small-caps}'), 'checker is blind to font-variant:');
  assert.deepEqual(find('.a{font-variant-numeric:tabular-nums;font-size:1px;font-family:x}'), [], 'false positive on longhands');
  assert.deepEqual(find(need()), []);
});
test('never removes the focus outline (no outline: none, outline: 0, outline-style: none or outline-width: 0)', () => {
  const find = (css) => declsOf(css).filter((d) => (d.prop === 'outline' && /^(none|0|0px)$/.test(d.val)) || (d.prop === 'outline-style' && d.val === 'none') || (d.prop === 'outline-width' && /^0(px)?$/.test(d.val)));
  for (const b of ['.a{outline:none}', '.a{outline:0}', '.a{outline-style:none}', '.a{outline-width:0}']) hits(find(b), 'missed ' + b);
  assert.deepEqual(find('.a{outline:2px solid red}'), []);
  assert.deepEqual(find(need()), []);
});
test('declares no animation or @keyframes yet (Tasks 4 and 5 add and test their own; the motion tests below cover transitions)', () => {
  const find = (css) => [].concat(absent(css, /@keyframes\b/), declsOf(css).filter((d) => /^animation/.test(d.prop)).map((d) => d.prop));
  hits(find('@keyframes x{from{opacity:0}}'), 'blind to @keyframes'); hits(find('.a{animation:x 1s}'), 'blind to animation:');
  assert.deepEqual(find(need()), []);
});

/* ---------- colour: tokens only ---------- */
const NAMED = ('aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen').split(' ');
// Colours are allowed to come ONLY from var(--token), plus the two keywords that carry no colour of their own.
function colourLiteralFailures(css) {
  const out = [];
  for (const d of declsOf(css)) {
    // var(--x) is removed but a fallback after the comma stays visible, so var(--x, red) is still a literal.
    const v = d.val.replace(/"[^"]*"|'[^']*'/g, '').replace(/var\(\s*--[\w-]+\s*,?/g, ' ');
    const found = [];
    if (/#[0-9a-fA-F]{3,8}\b/.test(v)) found.push('hex');
    for (const m of v.matchAll(/(?<![\w-])(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark)\(/g)) found.push(m[1] + '()');
    for (const w of v.toLowerCase().match(/[a-z][a-z-]*/g) || []) if (NAMED.includes(w)) found.push(w);
    if (found.length) out.push(d.sel + ' { ' + d.prop + ': ' + d.val + ' }  (' + found.join(', ') + ')');
  }
  return out;
}
test('the colour-literal checker rejects hex, every colour function and every named colour, and allows var(), transparent and currentcolor', () => {
  for (const bad of ['color:#fff', 'color:#FFFFFF80', 'color:rgb(0,0,0)', 'color:rgba(0 0 0 / .5)', 'color:hsl(16 88% 54%)', 'color:hsla(0 0% 0% / .5)', 'color:hwb(0 0% 0%)', 'color:oklch(.5 0 0)',
                     'color:white', 'color:Black', 'border:1px solid red', 'background:linear-gradient(red, var(--x))', 'box-shadow:0 0 0 1px tan', 'color:var(--x, red)', 'color:var(--x) blue'])
    hits(colourLiteralFailures('.a{' + bad + '}'), 'missed: ' + bad);
  for (const fine of ['color:var(--ink)', 'background:transparent', 'border:1px solid var(--line)', 'border-color:currentcolor', 'box-shadow:inset 0 0 0 1px var(--bad)', 'font-family:inherit',
                      'align-items:center', 'cursor:pointer', 'display:inline-flex', 'outline:2px solid var(--accent)', 'content:"red"', 'color:var(--x, var(--y))'])
    assert.deepEqual(colourLiteralFailures('.a{' + fine + '}'), [], 'false positive: ' + fine);
});
test('ui/components.css takes every colour from var(--token): no hex, no colour function, no named colour', () => {
  assert(declsOf(need()).length > 0, 'no declarations to check: an empty stylesheet would pass vacuously');
  assert.deepEqual(colourLiteralFailures(need()), []);
});
// Every var(--x) must name a custom property that exists, or a typo (var(--surfce)) silently drops the declaration.
function danglingVars(css, tokensCss) {
  const defined = new Set();
  for (const text of [css, tokensCss]) for (const d of declsOf(text)) if (d.prop.startsWith('--')) defined.add(d.prop);
  const used = new Set();
  for (const d of declsOf(css)) for (const m of d.val.matchAll(/var\(\s*(--[\w-]+)/g)) used.add(m[1]);
  return { used: used, missing: Array.from(used).filter((n) => !defined.has(n)) };
}
test('the dangling-var checker finds a mistyped token and accepts a real one', () => {
  assert.deepEqual(danglingVars('.a{color:var(--surfce)}', '[data-v2]{--surface:red}').missing, ['--surfce']);
  assert.deepEqual(danglingVars('.a{color:var(--surface)}', '[data-v2]{--surface:red}').missing, []);
  assert.deepEqual(danglingVars('[data-v2]{--lh:1.4} .a{line-height:var(--lh)}', '').missing, [], 'a custom property defined in the file itself counts');
});
test('every var(--token) in ui/components.css names a custom property that tokens.css (or the file itself) defines', () => {
  const r = danglingVars(need(), TOKENS);
  assert(r.used.size >= 10, 'only ' + r.used.size + ' var() references found: the file is not consuming the tokens');
  assert.deepEqual(r.missing, []);
});

/* ---------- lengths: tokens, not magic numbers ---------- */
// px literals are for hairlines and radii only. Sizes, type and spacing must come from the tokens, or desk and yard drift apart.
const PX_OK_PROP = /^(?:border(?:-[a-z-]+)?|outline(?:-offset)?|box-shadow)$/;
function magicPx(css) {
  return declsOf(css).filter((d) => /(?<![\w.-])-?\d*\.?\d+px\b/.test(d.val.replace(/var\(\s*--[\w-]+\s*,?/g, ' ')) && !PX_OK_PROP.test(d.prop)).map((d) => d.sel + ' { ' + d.prop + ': ' + d.val + ' }');
}
test('the magic-px checker rejects literal sizes and spacing and allows borders, outlines and shadows', () => {
  for (const bad of ['min-height:48px', 'padding:0 16px', 'font-size:15px', 'gap:8px', 'width:20px', 'margin-bottom:-1px', 'height:.5px'])
    hits(magicPx('.a{' + bad + '}'), 'missed: ' + bad);
  for (const fine of ['min-height:var(--tap)', 'border:1px solid var(--line)', 'border-radius:8px', 'outline:2px solid var(--accent)', 'outline-offset:2px', 'box-shadow:inset 0 0 0 1px var(--bad)', 'padding:0', 'line-height:1.4', 'min-width:0'])
    assert.deepEqual(magicPx('.a{' + fine + '}'), [], 'false positive: ' + fine);
});
test('ui/components.css sizes everything from tokens: px literals appear only in border, outline and box-shadow values', () => {
  assert(declsOf(need()).length > 0, 'no declarations to check');
  assert.deepEqual(magicPx(need()), []);
});

/* =====================================================================================================
 * MOTION
 * ===================================================================================================== */
const TIMING = /^(?:ease|ease-in|ease-out|ease-in-out|linear|step-start|step-end|cubic-bezier\(.*\)|steps\(.*\))$/;
const TIME = /^-?(?:\d+\.?\d*|\.\d+)m?s$/;
const ms = (t) => (t.endsWith('ms') ? parseFloat(t) : parseFloat(t) * 1000);
// Every item of every `transition:` shorthand, plus a failure for any transition-* longhand (the longhands
// split an item across declarations, where this parser cannot see the whole of it).
function transitionItems(css) {
  const items = [], problems = [];
  for (const d of declsOf(css)) {
    if (/^transition-/.test(d.prop)) problems.push(d.sel + ' uses ' + d.prop + '; use the transition shorthand so each item can be checked whole');
    if (d.prop !== 'transition') continue;
    if (d.val === 'none') continue;
    for (const it of splitTop(d.val, ',')) {
      const toks = splitTop(it, ' '), times = toks.filter((t) => TIME.test(t)), timing = toks.filter((t) => TIMING.test(t));
      const prop = toks.filter((t) => !TIME.test(t) && !TIMING.test(t));
      items.push({ sel: d.sel, ctx: d.ctx, raw: it, property: prop.length === 1 ? prop[0] : null, extra: prop.length > 1 ? prop : null, duration: times[0], delay: times[1], timing: timing[0] });
    }
  }
  return { items, problems };
}
function motionFailures(css) {
  const { items, problems } = transitionItems(css);
  const out = problems.slice();
  for (const t of items) {
    const w = t.sel + ' { transition: ' + t.raw + ' }';
    if (t.extra) out.push(w + ': unparseable (' + t.extra.join(' ') + ')');
    else if (!t.property) out.push(w + ': names no property, so it animates all');
    else if (!/^(transform|opacity)$/.test(t.property)) out.push(w + ': animates ' + t.property + ', which drops frames on a Core 2 Duo');
    if (!t.duration) out.push(w + ': has no duration');
    else if (ms(t.duration) + (t.delay ? ms(t.delay) : 0) > 300) out.push(w + ': runs ' + (ms(t.duration) + (t.delay ? ms(t.delay) : 0)) + 'ms, over the 300ms ceiling');
    if (!t.timing) out.push(w + ': names no easing');
    else if (t.timing === 'ease-in') out.push(w + ': bare ease-in withholds movement while the user watches');
  }
  if (/\bease-in\b(?!-out)/.test(stripComments(css))) out.push('the text contains a bare ease-in');
  return out;
}
test('the motion checker rejects non-compositor properties, all, a missing property, over-300ms (delay included), bare ease-in, no easing and longhands', () => {
  const bad = ['transition:all 100ms ease-out', 'transition:background-color 100ms ease-out', 'transition:100ms ease-out', 'transition:transform 100ms ease-out,height 100ms ease-out',
    'transition:transform 301ms ease-out', 'transition:transform .4s ease-out', 'transition:transform 250ms ease-out 100ms', 'transition:transform 100ms ease-in', 'transition:transform 100ms',
    'transition-property:transform', 'transition-duration:100ms', 'transition:transform 100ms ease-out,opacity', 'transition:margin 100ms ease-out'];
  for (const b of bad) hits(motionFailures('.a{' + b + '}'), 'missed: ' + b);
  const fine = ['transition:transform 120ms ease-out,opacity 120ms ease-out', 'transition:none', 'transition:opacity .1s ease-out', 'transition:transform 300ms ease-out', 'transition:transform 120ms cubic-bezier(.2,0,0,1)',
    'transition:transform 200ms ease-in-out', 'transition:transform 0.2s linear 0.1s'];
  for (const f of fine) assert.deepEqual(motionFailures('.a{' + f + '}'), [], 'false positive: ' + f);
});
test('only transform and opacity are transitioned, and never "all"', () => {
  const { items, problems } = transitionItems(need());
  assert(items.length >= 3 && items.some((t) => t.property === 'transform') && items.some((t) => t.property === 'opacity'), 'expected transform and opacity transition items, found ' + items.length);
  assert.deepEqual(problems, []);
  const bad = items.filter((t) => !t.property || !/^(transform|opacity)$/.test(t.property)).map((t) => t.sel + ': ' + t.raw);
  assert(bad.length === 0, 'animating ' + bad.join(' | '));
});
test('no transition (duration plus delay) runs longer than 300ms', () => {
  const { items } = transitionItems(need());
  assert(items.length >= 3, 'no transitions to measure');
  const over = items.filter((t) => !t.duration || ms(t.duration) + (t.delay ? ms(t.delay) : 0) > 300).map((t) => t.sel + ': ' + t.raw);
  assert(over.length === 0, over.join(' | '));
});
test('every transition names its easing and none uses a bare ease-in', () => {
  const { items } = transitionItems(need());
  assert(items.length >= 3, 'no transitions to check');
  const bad = items.filter((t) => !t.timing || t.timing === 'ease-in').map((t) => t.sel + ': ' + t.raw);
  assert(bad.length === 0, bad.join(' | '));
  assert(!/\bease-in\b(?!-out)/.test(stripComments(need())), 'bare ease-in in the text');
});
test('the combined motion check (motionFailures, which also scans the text for a bare ease-in) finds nothing in ui/components.css', () => assert.deepEqual(motionFailures(need()), []));

/* =====================================================================================================
 * BEHAVIOUR, ASKED OF THE CASCADE MODEL
 * The fixture is the markup the components document (see the header of ui/components.css).
 * ===================================================================================================== */
const TOKEN_SHEET = () => sheetOf('tokens', 'author', TOKENS);
const COMPONENT_SHEET = (css) => sheetOf('components', 'author', css);
const LIVE_SHEET = () => sheetOf('live', 'author', LIVE, { lenient: true, contextFree: true });
const v2Sheets = (css) => [UA(), TOKEN_SHEET(), COMPONENT_SHEET(css)];
const liveFirst = (css) => [UA(), LIVE_SHEET(), TOKEN_SHEET(), COMPONENT_SHEET(css)];
const liveLast = (css) => [UA(), TOKEN_SHEET(), COMPONENT_SHEET(css), LIVE_SHEET()];

function scene(o) {
  o = o || {};
  const root = mk(mk(null, 'html', {}), 'div', Object.assign({ 'data-v2': '' }, o.root));
  const host = o.wrap ? mk(root, 'div', o.wrap) : root;
  const F = {};
  const add = (name, parent, desc, attrs) => (F[name] = mk(parent, desc, attrs));
  add('text', host, 'p');
  add('btn', host, 'button.btn'); add('btn-primary', host, 'button.btn.btn-primary'); add('btn-quiet', host, 'button.btn.btn-quiet'); add('btn-danger', host, 'button.btn.btn-danger');
  add('a-btn', host, 'a.btn', { href: '#' });
  add('field', host, 'input.field', { type: 'text' }); add('textarea', host, 'textarea.field'); add('select', host, 'select.select');
  add('field-invalid', host, 'input.field', { 'aria-invalid': 'true' });
  const card = add('card', host, 'div.card'); add('card-text', card, 'p');
  const row = add('row', host, 'div.row'); add('row-lead', row, 'span.lead');
  const txt = add('row-txt', row, 'div.txt'); add('row-t', txt, 'div.t'); add('row-sub', txt, 'div.sub');
  const act = add('row-act', row, 'div.act'); add('row-act-btn', act, 'button.btn');
  add('row-button', host, 'button.row'); add('row-link', host, 'a.row', { href: '#' });
  const tbl = add('table', host, 'table.table');
  F.th = mk(mk(mk(tbl, 'thead'), 'tr'), 'th'); const tr = mk(mk(tbl, 'tbody'), 'tr'); add('td', tr, 'td'); add('td-fig', tr, 'td.fig');
  add('badge', host, 'span.badge'); add('badge-ok', host, 'span.badge.badge-ok'); add('badge-warn', host, 'span.badge.badge-warn'); add('badge-bad', host, 'span.badge.badge-bad');
  const tabs = add('tabs', host, 'div.tabs', { role: 'tablist' });
  add('tab', tabs, 'button', { role: 'tab', 'aria-selected': 'false' }); add('tab-selected', tabs, 'button', { role: 'tab', 'aria-selected': 'true' });
  const stat = add('stat', host, 'div.stat'); add('stat-k', stat, 'span.k'); add('stat-v', stat, 'span.v');
  // the live app's own pattern (styles.css line 1014-1015): a segmented control whose buttons set a font: shorthand
  const seg = add('gc-seg', host, 'div.gc-seg'); add('gc-seg-btn', seg, 'button.btn'); add('gc-seg-bare', seg, 'button');
  // bare icons, as icon() returns them: an svg with no class
  add('btn-icon', F.btn, 'svg'); add('a-btn-icon', F['a-btn'], 'svg'); add('badge-icon', F.badge, 'svg'); add('tab-icon', F.tab, 'svg'); add('row-t-icon', F['row-t'], 'svg');
  add('row-lead-icon', F['row-lead'], 'svg'); add('stat-v-icon', F['stat-v'], 'svg'); add('td-icon', F.td, 'svg'); add('row-act-btn-icon', F['row-act-btn'], 'svg');
  return { root, host, F };
}
const ICON_FIXTURES = ['btn-icon', 'a-btn-icon', 'badge-icon', 'tab-icon', 'row-t-icon', 'row-lead-icon', 'stat-v-icon', 'td-icon', 'row-act-btn-icon'];
const COMPONENT_FIXTURES = ['btn', 'btn-primary', 'btn-quiet', 'btn-danger', 'a-btn', 'field', 'textarea', 'select', 'field-invalid', 'card', 'row', 'row-lead', 'row-txt', 'row-t', 'row-sub', 'row-act',
  'row-act-btn', 'row-button', 'row-link', 'table', 'th', 'td', 'td-fig', 'badge', 'badge-ok', 'badge-warn', 'badge-bad', 'tabs', 'tab', 'tab-selected', 'stat', 'stat-k', 'stat-v'];
const PRESSABLE = ['btn', 'btn-primary', 'btn-quiet', 'btn-danger', 'a-btn', 'row-act-btn', 'tab', 'tab-selected', 'row-button', 'row-link'];
const FOCUSABLE = PRESSABLE.concat(['field', 'textarea', 'select', 'field-invalid']);
const STATES = [['rest', []], ['hover', ['hover']], ['active', ['hover', 'active']], ['focus', ['focus', 'focus-visible']]];
const isControl = (el) => BUTTONISH.includes(el.tag);

test('the fixture scene covers every class in the brief, and its icons are bare svgs with no class', () => {
  const { F } = scene();
  assert(Object.keys(F).length >= 40, 'only ' + Object.keys(F).length + ' fixtures');
  for (const c of ['btn', 'btn-primary', 'btn-quiet', 'btn-danger', 'field', 'select', 'row', 'card', 'table', 'badge', 'badge-ok', 'badge-warn', 'badge-bad', 'tabs', 'stat'])
    assert(Object.keys(F).some((k) => F[k].classes.includes(c)), 'no fixture uses .' + c);
  for (const n of ICON_FIXTURES) assert(F[n] && F[n].tag === 'svg' && F[n].classes.length === 0, n + ' must be a bare svg with no class, like icon() returns');
});

/* ---------- 1. figures: tabular-nums must reach controls ---------- */
function figureFailures(css, sheetsFn, scenes) {
  const out = [];
  for (const [label, o] of scenes || [['yard', {}], ['desk root', { root: { 'data-density': 'desk' } }], ['desk container', { wrap: { 'data-density': 'desk' } }]]) {
    const { F } = scene(o), m = model((sheetsFn || v2Sheets)(css));
    for (const name of Object.keys(F)) {
      const variants = STATES.map(([s, st]) => [s, inState(F[name], st)]);
      if (isControl(F[name])) variants.push(['disabled', inState(F[name], [], { disabled: '' })]);
      for (const [s, el] of variants) {
        const v = m.computed(el, 'font-variant-numeric');
        if (v !== 'tabular-nums') out.push(label + ' / ' + name + ' / ' + s + ' computes ' + v);
      }
    }
  }
  return out;
}
test('the trap is real in the model: with tokens.css alone, buttons, inputs, textareas and selects lose tabular-nums but plain text keeps it', () => {
  const f = figureFailures('', v2Sheets, [['yard', {}]]);
  for (const name of ['btn', 'field', 'textarea', 'select', 'tab', 'row-button'])
    assert(f.some((x) => x.includes(' / ' + name + ' / rest ')), name + ' should lose tabular-nums without the component layer; the model is blind to the UA reset');
  for (const name of ['text', 'stat-v', 'td', 'badge', 'row-t', 'card-text'])
    assert(!f.some((x) => x.includes(' / ' + name + ' / ')), name + ' should keep tabular-nums by inheritance');
});
test('the figure checker goes red when the control rule is removed, when a later font: shorthand lands on a button, and when a rule beats it on a control', () => {
  const css = need();
  hits(figureFailures(mutate(css, /font-variant-numeric:\s*tabular-nums;?/g, '')), 'removing every tabular-nums declaration was not caught');
  hits(figureFailures(css + '\n[data-v2] .btn { font: 700 13px sans-serif; }'), 'a font: shorthand on .btn was not caught');
  hits(figureFailures(css + '\n[data-v2] .field:focus-visible { font-variant: normal; }'), 'font-variant on a focused field was not caught');
  hits(figureFailures(css + '\n[data-v2] .gc-seg button { font: 700 13px sans-serif; }', liveFirst), 'a high-specificity font: on a bare button was not caught');
  hits(figureFailures(mutate(css, /\[data-v2\] :is\(button, input, select, textarea[^)]*\)\s*\{[^}]*\}/, ''), v2Sheets, [['yard', {}]]), 'removing the generic control rule was not caught');
});
test('every figure computes tabular-nums, including inside button, input, textarea and select, in every state, at both densities, with and without the live styles.css', () => {
  assert(rulesOf(need()).length > 0);
  for (const [name, fn] of [['v2 alone', v2Sheets], ['live styles.css first', liveFirst], ['live styles.css last', liveLast]]) {
    const f = figureFailures(need(), fn);
    assert(f.length === 0, name + ': ' + f.length + ' element(s) lost tabular-nums\n' + f.slice(0, 12).join('\n'));
  }
  const { F } = scene();
  assert(['btn', 'field', 'textarea', 'select', 'tab', 'row-button', 'row-act-btn', 'gc-seg-bare', 'gc-seg-btn'].every((n) => isControl(F[n])), 'the control fixtures must really be form controls');
});

/* ---------- 2. icons: alignment is the component's job ---------- */
function iconFailures(css, sheetsFn) {
  const out = [], { F } = scene(), m = model((sheetsFn || v2Sheets)(css));
  for (const n of ICON_FIXTURES) {
    const svg = F[n], parent = svg.parent;
    const disp = m.declared(parent, 'display'), items = m.declared(parent, 'align-items'), va = m.declared(svg, 'vertical-align');
    if (/^(inline-)?flex$/.test(disp || '')) {
      // In a flex host vertical-align does nothing, so it must not count: only align-items centres the icon.
      if (items !== 'center') out.push(n + ': the flex host has align-items ' + items + ', so the icon is not centred on the text');
      if (m.declared(svg, 'flex-shrink') !== '0') out.push(n + ': a flex item that may shrink, so a long label squashes the icon');
    } else if (va === undefined || va === 'baseline') {
      out.push(n + ': inline text host (' + disp + ') and the svg has vertical-align ' + va + ', so the icon sits on the text baseline');
    }
  }
  return out;
}
test('the icon checker goes red when the svg rule is removed and when the flex container loses centring', () => {
  const css = need();
  hits(iconFailures(''), 'an empty component layer must leave icons on the baseline');
  hits(iconFailures(mutate(css, /vertical-align:[^;]+;/g, '')), 'removing every vertical-align was not caught');
  hits(iconFailures(mutate(css, /flex-shrink:\s*0;?/g, '')), 'removing flex-shrink was not caught');
  // the flex hosts: losing align-items: center must be caught even though the svg rule still supplies vertical-align
  hits(iconFailures(mutate(css, /(\[data-v2\] \.btn \{\n  display: inline-flex;\n)  align-items: center;/, '$1  align-items: baseline;')), '.btn with align-items: baseline was not caught');
  hits(iconFailures(mutate(css, /(\[data-v2\] \.badge \{\n  display: inline-flex;\n)  align-items: center;/, '$1  align-items: flex-start;')), '.badge with align-items: flex-start was not caught');
  hits(iconFailures(mutate(css, /(\[data-v2\] \.row > \.lead \{\n  grid-column: 1;\n  display: flex;\n)  align-items: center;/, '$1  align-items: baseline;')), '.lead with align-items: baseline was not caught');
  // and the inline host: removing vertical-align leaves the baseline (already covered above); a flex host does not excuse it
  assert.deepEqual(iconFailures(css), []);
});
test('a bare icon beside text is aligned by the component: align-items: center in a flex host, vertical-align off the baseline in inline text, and flex-shrink: 0 in a flex host', () => {
  assert(ICON_FIXTURES.length >= 8);
  for (const [name, fn] of [['v2 alone', v2Sheets], ['live first', liveFirst]]) assert.deepEqual(iconFailures(need(), fn), [], name);
});

/* ---------- 3. press feedback and reduced motion ---------- */
function transitionOf(m, el) {
  const v = m.declared(el, 'transition');
  return v === undefined ? [] : transitionItems('.a{transition:' + v + '}').items;
}
function pressFailures(css, sheetsFn) {
  const out = [], { F } = scene(), m = model((sheetsFn || v2Sheets)(css));
  for (const n of PRESSABLE) {
    const el = F[n], act = inState(el, ['hover', 'active']);
    if (m.declared(act, 'transform') !== 'scale(0.97)') out.push(n + ': :active transform is ' + m.declared(act, 'transform') + ', not scale(0.97)');
    if (isControl(el)) { const dis = inState(el, ['hover', 'active'], { disabled: '' }); if (m.declared(dis, 'transform') === 'scale(0.97)') out.push(n + ': a disabled control still presses'); }
    if (m.declared(el, 'transform') !== undefined && m.declared(el, 'transform') !== 'none') out.push(n + ': moves at rest');
    const t = transitionOf(m, el).filter((x) => x.property === 'transform');
    if (t.length !== 1) out.push(n + ': needs exactly one transform transition at rest, has ' + t.length);
    else if (ms(t[0].duration) < 100 || ms(t[0].duration) > 160 || (t[0].delay && ms(t[0].delay) > 0)) out.push(n + ': press runs ' + t[0].duration + (t[0].delay ? ' after ' + t[0].delay : '') + ', outside 100-160ms');
    else if (t[0].timing !== 'ease-out') out.push(n + ': press easing is ' + t[0].timing + ', not ease-out');
  }
  for (const n of ['row', 'card', 'badge', 'stat', 'td', 'field', 'select']) {
    const act = inState(F[n], ['hover', 'active']);
    if (m.declared(act, 'transform') !== undefined && m.declared(act, 'transform') !== 'none') out.push(n + ': is not pressable but moves on :active');
  }
  return out;
}
function reducedFailures(css, sheetsFn) {
  const out = [], { F } = scene(), m = model((sheetsFn || v2Sheets)(css), { reduced: true });
  for (const n of PRESSABLE) {
    const el = F[n], act = inState(el, ['hover', 'active']);
    const tf = m.declared(act, 'transform');
    if (tf !== undefined && tf !== 'none') out.push(n + ': still moves on :active (' + tf + ')');
    const op = m.declared(act, 'opacity');
    if (op === undefined || !(parseFloat(op) < 1)) out.push(n + ': keeps no opacity feedback on :active (' + op + ')');
    const items = transitionOf(m, el);
    if (items.some((x) => x.property === 'transform')) out.push(n + ': still transitions transform');
    if (!items.some((x) => x.property === 'opacity')) out.push(n + ': no longer transitions opacity');
    if (isControl(el)) { const dis = inState(el, ['hover', 'active'], { disabled: '' }); if (m.declared(dis, 'opacity') !== m.declared(inState(el, [], { disabled: '' }), 'opacity')) out.push(n + ': a disabled control reacts to :active'); }
  }
  return out;
}
test('the press checker goes red for a wrong scale, a missing :active rule, a slow press, a bare ease-in and a press that survives disabled', () => {
  const css = need();
  hits(pressFailures(mutate(css, 'scale(0.97)', 'scale(0.9)')), 'scale(0.9) was not caught');
  hits(pressFailures(mutate(css, 'scale(0.97)', 'none')), 'no press feedback was not caught');
  hits(pressFailures(mutate(css, /transition:\s*transform \d+ms/g, 'transition: transform 250ms')), 'a 250ms press was not caught');
  hits(pressFailures(mutate(css, /transition:\s*transform (\d+ms) ease-out/g, 'transition: transform $1 ease-in')), 'a bare ease-in press was not caught');
  hits(pressFailures(mutate(css, /:active:not\(:disabled\)/g, ':active')), 'a disabled button that still presses was not caught');
  hits(pressFailures(css + '\n[data-v2] .card:active { transform: scale(0.97); }'), 'a non-pressable that moves was not caught');
});
test('every pressable (button, link-button, tab, interactive row) scales to 0.97 on :active within 100-160ms ease-out; a disabled one and the static components do not', () => {
  assert(PRESSABLE.length >= 8);
  for (const [name, fn] of [['v2 alone', v2Sheets], ['live first', liveFirst], ['live last', liveLast]]) assert.deepEqual(pressFailures(need(), fn), [], name);
  assert(need().includes('scale(0.97)') && /:active/.test(need()));
});
test('the reduced-motion checker goes red when the block is missing, when it leaves the transform in place, or when it drops the opacity feedback', () => {
  const css = need();
  hits(reducedFailures(mutate(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*$/, '')), 'removing the reduced-motion block was not caught');
  hits(reducedFailures(mutate(css, /(@media \(prefers-reduced-motion: reduce\)[\s\S]*?)transform:\s*none;?/, '$1')), 'a reduced block that no longer cancels the transform was not caught');
  hits(reducedFailures(mutate(css, /(@media \(prefers-reduced-motion: reduce\)[\s\S]*?)opacity:\s*[0-9.]+;?/, '$1')), 'a reduced block with no opacity feedback was not caught');
});
test('under prefers-reduced-motion no pressable moves on :active, its transition drops transform and keeps opacity, and the press is still acknowledged by opacity', () => {
  assert(/@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(need()), 'no prefers-reduced-motion block');
  for (const [name, fn] of [['v2 alone', v2Sheets], ['live first', liveFirst], ['live last', liveLast]]) assert.deepEqual(reducedFailures(need(), fn), [], name);
});
test('without the reduced-motion preference the same pressables DO move (so the test above is not green because nothing ever moved)', () => {
  const { F } = scene(), m = model(v2Sheets(need()), { reduced: false });
  for (const n of PRESSABLE) assert.strictEqual(m.declared(inState(F[n], ['hover', 'active']), 'transform'), 'scale(0.97)', n);
});

/* ---------- 4. focus ---------- */
function focusFailures(css, sheetsFn) {
  const out = [], { F } = scene(), m = model((sheetsFn || v2Sheets)(css));
  for (const n of FOCUSABLE) {
    const el = inState(F[n], ['focus', 'focus-visible']), o = m.declared(el, 'outline');
    const mm = o && /^(\d+(?:\.\d+)?)px solid var\(--accent\)$/.exec(o);
    if (!mm) out.push(n + ': :focus-visible outline is "' + o + '", expected "<n>px solid var(--accent)"');
    else if (parseFloat(mm[1]) < 2) out.push(n + ': focus ring is ' + mm[1] + 'px, under 2px');
    if (m.declared(el, 'outline-offset') === undefined) out.push(n + ': no outline-offset, so the ring touches the control');
  }
  return out;
}
test('the focus checker goes red when the ring is thinner, another colour, absent, or removed', () => {
  const css = need();
  hits(focusFailures(mutate(css, /outline:\s*2px solid var\(--accent\)/g, 'outline: 1px solid var(--accent)')), 'a 1px ring was not caught');
  hits(focusFailures(mutate(css, /outline:\s*2px solid var\(--accent\)/g, 'outline: 2px solid var(--ink)')), 'a ring in --ink was not caught');
  hits(focusFailures(mutate(css, /outline:\s*2px solid var\(--accent\)/g, 'outline-width: 2px')), 'no outline shorthand was not caught');
  hits(focusFailures(mutate(css, /outline-offset:[^;]+;/g, '')), 'a missing outline-offset was not caught');
});
test('every focusable component draws a solid outline of at least 2px in --accent on :focus-visible, even against the live styles.css that sets outline: none on inputs', () => {
  assert(FOCUSABLE.length >= 12);
  for (const [name, fn] of [['v2 alone', v2Sheets], ['live first', liveFirst], ['live last', liveLast]]) assert.deepEqual(focusFailures(need(), fn), [], name);
});

/* ---------- 5. density ---------- */
// [fixture, property, yard px, desk px]. Resolved through the real token blocks, at the root and in a container.
const SIZES = [
  ['btn', 'min-height', 48, 32], ['btn-primary', 'min-height', 48, 32], ['btn-quiet', 'min-height', 48, 32], ['btn-danger', 'min-height', 48, 32], ['a-btn', 'min-height', 48, 32],
  ['field', 'min-height', 48, 32], ['select', 'min-height', 48, 32], ['tab', 'min-height', 48, 32], ['tab-selected', 'min-height', 48, 32],
  ['row', 'min-height', 56, 32], ['row-button', 'min-height', 56, 32], ['row-link', 'min-height', 56, 32], ['td', 'height', 56, 32], ['th', 'height', 56, 32],
  ['text', 'font-size', 16, 15], ['btn', 'font-size', 16, 15], ['field', 'font-size', 16, 15], ['badge', 'font-size', 15, 14], ['stat-v', 'font-size', 28, 24],
];
function densityFailures(css, sheetsFn) {
  const out = [];
  for (const [label, o, d] of [['bare [data-v2]', {}, 0], ['yard on root', { root: { 'data-density': 'yard' } }, 0], ['yard container', { wrap: { 'data-density': 'yard' } }, 0],
                               ['desk on root', { root: { 'data-density': 'desk' } }, 1], ['desk container', { wrap: { 'data-density': 'desk' } }, 1]]) {
    const { F } = scene(o), m = model((sheetsFn || v2Sheets)(css));
    for (const [n, prop, yard, desk] of SIZES) {
      const got = m.computed(F[n], prop), want = (d ? desk : yard) + 'px';
      if (got !== want) out.push(label + ': ' + n + ' ' + prop + ' is ' + got + ', expected ' + want);
    }
  }
  return out;
}
test('the density checker goes red when a size is a literal, ignores the token, or is stuck at one density', () => {
  const css = need();
  hits(densityFailures(mutate(css, /min-height:\s*var\(--tap\)/g, 'min-height: 48px')), 'a literal 48px (right in yard, wrong at desk) was not caught');
  hits(densityFailures(mutate(css, /min-height:\s*var\(--row-h\)/g, 'min-height: var(--tap)')), 'a row on --tap instead of --row-h was not caught');
  hits(densityFailures(mutate(css, /height:\s*var\(--row-h\)/g, 'height: var(--tap)')), 'a table cell on --tap was not caught');
  hits(densityFailures(css.replace(/\[data-v2\]\[data-density\][^{]*\{[^}]*\}/, '')), 'a density container that does not re-resolve font-size was not caught');
});
test('yard is 48px controls, 56px rows and 16px text; desk is 32px controls and rows and 15px text, at the root and inside a nested container', () => {
  assert(SIZES.length >= 15);
  assert.deepEqual(densityFailures(need()), []);
});
/* A 32px desk row or control must really BE 32px. min-height alone only says "at least": padding or a border on top
 * of the content pushes it past (a border-bottom once made a desk row 33px). So at desk, for Latin text:
 *   content height + vertical padding + vertical border  <=  the declared min-height / height,
 * where content is one line (font-size x line-height) or, for a row, its tallest child (the action button).
 * Rows additionally carry NO vertical padding and NO top/bottom border, so a row holding a 32px button is exactly 32px.
 * Hindi is outside this check by design: at desk a Hindi line is 15px x 1.7 = 25.5px, so a Hindi button is
 * 25.5 + 8 + 2 = 35.5px, taller than 32px. That is the price of not clipping Devanagari, not a bug. */
const pxList = (v) => String(v).trim().split(/\s+/).map((t) => { const m = /^(-?[\d.]+)px$/.exec(t); if (m) return +m[1]; if (/^0$/.test(t)) return 0; return NaN; });
function vPadding(m, el) { const l = pxList(m.computed(el, 'padding') || '0'); if (l.some(isNaN)) return NaN; return l.length === 1 ? 2 * l[0] : l.length === 2 ? 2 * l[0] : l[0] + l[2]; }
function sideBorder(m, el, side) {
  const v = m.computed(el, 'border-' + side);
  if (v === undefined || /^(0|none)\b/.test(v.trim())) return 0;
  const w = /(?:^|\s)(\d*\.?\d+)px\b/.exec(v);
  return w ? +w[1] : NaN;
}
function deskFitFailures(css) {
  const out = [];
  for (const [label, o] of [['desk on root', { root: { 'data-density': 'desk' } }], ['desk container', { wrap: { 'data-density': 'desk' } }]]) {
    const { F } = scene(o), m = model(v2Sheets(css));
    const line = (el) => parseFloat(m.computed(el, 'font-size')) * parseFloat(m.computed(el, 'line-height'));
    for (const n of ['btn', 'btn-primary', 'btn-quiet', 'btn-danger', 'a-btn', 'field', 'select', 'tab', 'tab-selected', 'row', 'row-button', 'row-link', 'td', 'th']) {
      const el = F[n], want = parseFloat(m.computed(el, /^(td|th)$/.test(n) ? 'height' : 'min-height'));
      const pad = vPadding(m, el), bor = sideBorder(m, el, 'top') + sideBorder(m, el, 'bottom');
      if (isNaN(want) || isNaN(pad) || isNaN(bor) || isNaN(line(el))) { out.push(label + ': ' + n + ' could not be measured (min ' + want + ', padding ' + pad + ', border ' + bor + ', line ' + line(el) + ')'); continue; }
      let content = line(el);
      if (n === 'row') content = Math.max(content, parseFloat(m.computed(F['row-act-btn'], 'min-height')));
      if (/^row/.test(n)) {
        if (pad !== 0) out.push(label + ': ' + n + ' has ' + pad + 'px of vertical padding; a 32px row must have none');
        if (bor !== 0) out.push(label + ': ' + n + ' has ' + bor + 'px of top/bottom border; a 32px row must have none (draw the hairline as a shadow)');
      }
      if (content + pad + bor > want + 1e-9) out.push(label + ': ' + n + ' is ' + (content + pad + bor) + 'px (content ' + content + ' + padding ' + pad + ' + border ' + bor + '), over its ' + want + 'px');
    }
  }
  return out;
}
test('the desk-fit checker goes red for padding or a border that pushes a 32px row, button or cell past 32px', () => {
  const css = need();
  hits(deskFitFailures(mutate(css, /(\[data-v2\] \.row \{[^}]*?)padding: 0 var\(--pad\);/, '$1padding: var(--s1) var(--pad);')), '.row padding var(--s1) var(--pad) was not caught');
  hits(deskFitFailures(mutate(css, /(\[data-v2\] \.row \{[^}]*?)box-shadow: inset 0 -1px 0 var\(--line\);/, '$1border-bottom: 1px solid var(--line);')), '.row with border-bottom was not caught');
  hits(deskFitFailures(mutate(css, /(\[data-v2\] \.btn \{[^}]*?)padding: var\(--s1\) var\(--pad\);/, '$1padding: var(--s3);')), '.btn padding var(--s3) was not caught');
  hits(deskFitFailures(mutate(css, /(\[data-v2\] \.table th,\n\[data-v2\] \.table td \{[^}]*?)padding: var\(--s1\) var\(--pad\);/, '$1padding: var(--s4);')), 'td padding var(--s4) was not caught');
  hits(deskFitFailures(mutate(css, /(\[data-v2\] button\.row,\n\[data-v2\] a\.row \{\n  width: 100%;\n)  border: 0;/, '$1  border: 1px solid var(--line);')), 'button.row with a border was not caught');
  assert.deepEqual(pxList('4px 8px'), [4, 8]); assert.strictEqual(vPadding({ computed: () => '4px 8px' }, {}), 8); assert.strictEqual(vPadding({ computed: () => '1px 2px 3px 4px' }, {}), 4);
});
test('at desk a 32px control, row or cell fits one Latin line plus its padding and borders in 32px, and a row has no vertical padding or border (Hindi lines are taller by design)', () => {
  assert.deepEqual(deskFitFailures(need()), []);
});
test('every component changes size between yard and desk: none ignores data-density (.select and .table included)', () => {
  const props = ['min-height', 'height', 'padding', 'font-size', 'gap'];
  const sig = (o) => { const { F } = scene(o), m = model(v2Sheets(need())); const r = {}; for (const n of COMPONENT_FIXTURES) r[n] = props.map((p) => m.computed(F[n], p)).join('|'); return r; };
  const yard = sig({}), desk = sig({ root: { 'data-density': 'desk' } });
  // Only the bare layout containers may stay equal: they carry no size of their own.
  const CONTAINERS = ['tabs', 'table', 'row-lead', 'row-act'];
  const frozen = COMPONENT_FIXTURES.filter((n) => yard[n] === desk[n] && !CONTAINERS.includes(n));
  assert.deepEqual(frozen, [], 'these ignore data-density');
  assert(COMPONENT_FIXTURES.length - CONTAINERS.length >= 25, 'too few components were compared');
  for (const n of ['btn', 'field', 'select', 'row', 'card', 'td', 'th', 'badge', 'tab', 'stat-v', 'textarea']) assert(yard[n] !== desk[n], n + ' must respond to density');
});

/* ---------- 6. Hindi ---------- */
function hindiFailures(css, sheetsFn) {
  const out = [], toks = model(v2Sheets(css)), rootEl = scene().root;
  const HI = toks.computed(rootEl, '--font-hi'), LATIN = toks.computed(rootEl, '--font');
  const surfaces = ['text', 'card-text', 'btn', 'btn-primary', 'a-btn', 'field', 'textarea', 'select', 'row-t', 'row-sub', 'row-button', 'td', 'th', 'badge', 'tab', 'stat-k', 'stat-v'];
  const runs = [['lang=hi on the data-v2 element', { root: { lang: 'hi' } }], ['lang=hi-IN on an ancestor of the data-v2 element', { root: {}, outer: { lang: 'hi-IN' } }], ['lang=hi on a wrapper inside', { wrap: { lang: 'hi' } }]];
  const lineH = {};
  for (const [label, o] of runs) {
    let sc;
    if (o.outer) { sc = scene(o); sc.root.parent.attrs.lang = o.outer.lang; } else sc = scene(o);
    const m = model((sheetsFn || v2Sheets)(css));
    for (const n of surfaces) {
      const el = sc.F[n], ff = m.computed(el, 'font-family'), lh = parseFloat(m.computed(el, 'line-height'));
      if (ff !== HI) out.push(label + ': ' + n + ' font-family is ' + ff + ', not --font-hi');
      if (!(lh >= 1.6)) out.push(label + ': ' + n + ' line-height is ' + lh + ', under 1.6 (Devanagari matras clip)');
      lineH[n] = lh;
    }
  }
  { // lang on the control or text element itself
    const sc = scene(), m = model((sheetsFn || v2Sheets)(css));
    for (const n of surfaces) {
      const el = inState(sc.F[n], [], { lang: 'hi' }), ff = m.computed(el, 'font-family'), lh = parseFloat(m.computed(el, 'line-height'));
      if (ff !== HI) out.push('lang=hi on the element itself: ' + n + ' font-family is ' + ff);
      if (!(lh >= 1.6)) out.push('lang=hi on the element itself: ' + n + ' line-height is ' + lh);
    }
  }
  const lat = scene(), ml = model((sheetsFn || v2Sheets)(css));
  for (const n of surfaces) {
    const ff = ml.computed(lat.F[n], 'font-family'), lh = parseFloat(ml.computed(lat.F[n], 'line-height'));
    if (ff !== LATIN) out.push('Latin: ' + n + ' font-family is ' + ff + ', not --font');
    if (!(lh < lineH[n])) out.push('Latin: ' + n + ' line-height ' + lh + ' is not tighter than Hindi ' + lineH[n]);
  }
  return out;
}
test('the Hindi checker goes red when the font stack, the line-height, or the control inheritance is lost', () => {
  const css = need();
  hits(hindiFailures(mutate(css, /font-family:\s*var\(--font-hi\)/g, 'font-family: var(--font)')), 'Latin stack on Hindi was not caught');
  hits(hindiFailures(mutate(css, /--lh:\s*1\.7/g, '--lh: 1.4')), 'a Hindi line-height of 1.4 was not caught');
  hits(hindiFailures(mutate(css, /font-family:\s*inherit/g, 'font-family: sans-serif')), 'controls that do not inherit the Hindi stack were not caught');
  hits(hindiFailures(mutate(css, /:lang\(hi\)/g, '[lang="hi"]')), 'a [lang="hi"] selector misses lang=hi-IN and an ancestor lang; not caught');
});
test('Hindi text (lang on the element itself, on the data-v2 element, hi-IN on an ancestor of it, or on a wrapper inside) gets the --font-hi stack and a line-height of at least 1.6 on text, rows, buttons, inputs, selects and cells; Latin stays tighter', () => {
  assert.deepEqual(hindiFailures(need()), []);
  assert.deepEqual(hindiFailures(need(), liveFirst), []);
});

/* ---------- 7. long values must not push the action off ---------- */
function truncationFailures(css) {
  const out = [], { F } = scene(), m = model(v2Sheets(css));
  const want = (el, name, prop, val) => { const got = m.declared(el, prop); if (got !== val) out.push(name + ' ' + prop + ' is ' + got + ', expected ' + val); };
  for (const n of ['row-t', 'row-sub']) { want(F[n], n, 'overflow', 'hidden'); want(F[n], n, 'text-overflow', 'ellipsis'); want(F[n], n, 'white-space', 'nowrap'); }
  want(F.row, 'row', 'display', 'grid');
  want(F.row, 'row', 'grid-template-columns', 'auto minmax(0, 1fr) auto');
  want(F['row-txt'], 'row-txt', 'min-width', '0');
  want(F['row-act'], 'row-act', 'white-space', 'nowrap');
  for (const n of ['row-button', 'row-link']) want(F[n], n, 'display', 'grid');
  for (const n of ['td', 'th']) want(F[n], n, 'overflow-wrap', 'anywhere');
  return out;
}
test('the truncation checker goes red when the text stops truncating, the column can no longer shrink, or the action may wrap', () => {
  const css = need();
  hits(truncationFailures(mutate(css, /text-overflow:\s*ellipsis;?/g, '')), 'no ellipsis was not caught');
  hits(truncationFailures(mutate(css, /minmax\(0, 1fr\)/g, '1fr')), 'a 1fr column (which cannot shrink below its content) was not caught');
  hits(truncationFailures(mutate(css, /display:\s*grid/g, 'display: flex')), 'flex rows were not caught');
  hits(truncationFailures(mutate(css, /overflow-wrap:\s*anywhere;?/g, '')), 'cells that cannot break a long registration were not caught');
});
test('a row is a grid with a minmax(0, 1fr) text column and an unshrinking action, its text is nowrap + ellipsis, and table cells break long values (declarations; layout measured in Chrome in the report)', () => {
  assert.deepEqual(truncationFailures(need()), []);
});

/* ---------- 8. the interface the brief lists ---------- */
test('every class in the brief\'s Interfaces is styled, plus .t, the row text its truncation test names', () => {
  const classes = new Set();
  for (const r of rulesOf(need())) for (const s of splitTop(r.selector, ',')) for (const m of s.matchAll(/\.([\w-]+)/g)) classes.add(m[1]);
  const want = ['btn', 'btn-primary', 'btn-quiet', 'btn-danger', 'field', 'select', 'row', 'card', 'table', 'badge', 'badge-ok', 'badge-warn', 'badge-bad', 'tabs', 'stat', 't'];
  const missing = want.filter((c) => !classes.has(c));
  assert.deepEqual(missing, [], 'not styled: ' + missing.join(', '));
});
test('the three button kinds and the three badge kinds each look different from the default and from each other', () => {
  const { F } = scene(), m = model(v2Sheets(need()));
  const look = (n) => ['background', 'color', 'border-color'].map((p) => m.declared(F[n], p)).join(' | ');
  for (const group of [['btn', 'btn-primary', 'btn-quiet', 'btn-danger'], ['badge', 'badge-ok', 'badge-warn', 'badge-bad']]) {
    const looks = group.map(look);
    assert.strictEqual(new Set(looks).size, group.length, 'two of these look the same:\n' + group.map((n, i) => n + ': ' + looks[i]).join('\n'));
  }
});
// The border colour a field is actually drawn with: a border-color longhand if one wins, else the colour inside the border shorthand.
function edgeColour(m, el) {
  const longhand = m.computed(el, 'border-color');
  if (longhand !== undefined && !/\b(solid|dashed|dotted)\b/.test(longhand)) return longhand;
  return (m.computed(el, 'border') || '').replace(/^.*?\b(?:solid|dashed|dotted)\s*/, '');
}
function invalidFieldFailures(css) {
  const out = [], { F, root } = scene(), m = model(v2Sheets(css));
  const ok = edgeColour(m, F.field), bad = edgeColour(m, F['field-invalid']), BAD = m.computed(root, '--bad');
  const shadowOk = m.computed(F.field, 'box-shadow') || 'none', shadowBad = m.computed(F['field-invalid'], 'box-shadow') || 'none';
  if (!/^hsl\(/.test(ok) || !/^hsl\(/.test(bad)) out.push('border colours did not resolve to token colours: valid "' + ok + '", invalid "' + bad + '"');
  if (bad !== BAD) out.push('an invalid field draws its border in ' + bad + ', not --bad (' + BAD + ')');
  if (ok + '|' + shadowOk === bad + '|' + shadowBad) out.push('an invalid field looks the same as a valid one: border ' + ok + ', shadow ' + shadowOk);
  if (shadowBad === 'none' || shadowBad === shadowOk) out.push('an invalid field has no second, non-colour edge (box-shadow ' + shadowBad + ')');
  return out;
}
test('the invalid-field checker goes red when the invalid field looks like a valid one, in colour or in edge', () => {
  const css = need();
  hits(invalidFieldFailures(mutate(css, /(\.field\[aria-invalid="true"\] \{\n)  border-color: var\(--bad\);\n  box-shadow: inset 0 0 0 1px var\(--bad\);/, '$1  border-color: var(--line);')), 'border-color: var(--line), no shadow was not caught');
  hits(invalidFieldFailures(mutate(css, /(\.field\[aria-invalid="true"\] \{\n  border-color: var\(--bad\);\n)  box-shadow: inset 0 0 0 1px var\(--bad\);/, '$1')), 'colour only (no inner edge) was not caught');
  hits(invalidFieldFailures(mutate(css, /(\.field\[aria-invalid="true"\] \{\n)  border-color: var\(--bad\);/, '$1  border-color: var(--line);')), 'valid colour with a shadow was not caught');
  hits(invalidFieldFailures(mutate(css, /\[data-v2\] \.field\[aria-invalid="true"\]/, '[data-v2] .field[aria-invalid="maybe"]')), 'a rule that never matches was not caught');
  assert.strictEqual(edgeColour({ computed: (e, p) => (p === 'border' ? '1px solid hsl(1 2% 3%)' : undefined) }, {}), 'hsl(1 2% 3%)', 'edgeColour must read the colour out of the border shorthand');
  assert.strictEqual(edgeColour({ computed: (e, p) => (p === 'border-color' ? 'hsl(4 5% 6%)' : '1px solid hsl(1 2% 3%)') }, {}), 'hsl(4 5% 6%)', 'edgeColour must prefer a winning border-color longhand');
});
test('an invalid field is drawn in --bad with an inner edge as well, so its resolved look differs from a valid field (compared on resolved colours and box-shadow, not on declaration text)', () => {
  assert.deepEqual(invalidFieldFailures(need()), []);
});
test('a selected tab differs from an unselected one in more than colour (a bar), because status is never colour alone', () => {
  const { F } = scene(), m = model(v2Sheets(need()));
  const bar = (n) => m.declared(F[n], 'border-bottom');
  assert(bar('tab') !== bar('tab-selected'), 'selected and unselected tabs have the same border-bottom: ' + bar('tab'));
  assert(m.declared(F['tab-selected'], 'color') !== m.declared(F.tab, 'color'));
});

/* ---------- 9. live styles.css must not leak into a v2 component ---------- */
// For each component fixture: every property the live styles.css sets on it must be overridden by the v2 layer.
const LEAK_OK_REST = /^outline/; // the live outline: none on inputs is invisible at rest; the focused state is checked here and by the focus test, against the live sheet
function leakFailures(css, sheetsFn, liveOnly) {
  const out = [], { F } = scene();
  const mFull = model(sheetsFn(css)), mLive = model(liveOnly());
  for (const n of COMPONENT_FIXTURES) for (const [label, st] of [['rest', []], ['focus', ['focus', 'focus-visible']]]) {
    const el = inState(F[n], st), liveWon = mLive.cascade(el), full = mFull.cascade(el);
    for (const [prop, d] of liveWon) {
      if (d.sheet !== 'live') continue;
      if (prop === '-webkit-tap-highlight-color' || (label === 'rest' && LEAK_OK_REST.test(prop))) continue;
      const w = full.get(prop);
      if (w && w.sheet === 'live') out.push(n + ' (' + label + '): live styles.css still sets ' + prop + ': ' + w.value);
    }
  }
  return out;
}
test('the leak checker goes red when a component stops overriding a live declaration', () => {
  const css = need();
  hits(leakFailures(mutate(css, /width:\s*auto;?/, ''), liveFirst, () => [UA(), LIVE_SHEET()]), 'a .btn that no longer overrides the live width:100% was not caught');
  hits(leakFailures(mutate(css, /box-shadow:\s*none;?/g, ''), liveFirst, () => [UA(), LIVE_SHEET()]), 'a component that no longer clears the live box-shadow was not caught');
});
test('with the live styles.css in the document, none of its context-free declarations survives on a plain v2 component, at rest or focused, in either link order (-webkit-tap-highlight-color and the unfocused outline are exempt)', () => {
  const liveSheet = LIVE_SHEET();
  assert(liveSheet.rules.length > 300, 'the live sheet parsed to only ' + liveSheet.rules.length + ' rules');
  const { F } = scene(), mLive = model([UA(), liveSheet]);
  assert(['btn', 'card', 'row', 'badge', 'stat', 'field'].every((n) => mLive.cascade(F[n]).size > 0 && Array.from(mLive.cascade(F[n]).values()).some((d) => d.sheet === 'live')), 'the live sheet must actually style these fixtures, or the check below is vacuous');
  for (const [name, fn] of [['live first', liveFirst], ['live last', liveLast]]) { const f = leakFailures(need(), fn, () => [UA(), LIVE_SHEET()]); assert(f.length === 0, name + ':\n' + f.join('\n')); }
});

/* ---------- 10. contrast of what the components actually pair ---------- */
function parseHsl(v) { const m = /^hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*\)$/.exec(String(v).trim()); return m ? { h: +m[1], s: +m[2] / 100, l: +m[3] / 100 } : null; }
function lum({ h, s, l }) {
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map((c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))).reduce((acc, c, i) => acc + c * [0.2126, 0.7152, 0.0722][i], 0);
}
const contrast = (fg, bg) => { const a = lum(parseHsl(fg)), b = lum(parseHsl(bg)); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
const TEXT_FIXTURES = ['btn', 'btn-primary', 'btn-quiet', 'btn-danger', 'a-btn', 'field', 'textarea', 'select', 'row-t', 'row-sub', 'row-button', 'td', 'th', 'badge', 'badge-ok', 'badge-warn', 'badge-bad',
  'tab', 'tab-selected', 'stat-k', 'stat-v', 'card-text'];
function contrastFailures(css) {
  const out = [];
  for (const [theme, o, opts] of [['light', {}, {}], ['dark (OS)', {}, { dark: true }], ['dark (explicit)', { root: { 'data-theme': 'dark' } }, {}]]) {
    const { F, root } = scene(o), m = model(v2Sheets(css), opts);
    const surfaces = [m.computed(root, '--surface'), m.computed(root, '--surface-raised')];
    for (const [n, state] of TEXT_FIXTURES.flatMap((n) => [[n, []], [n, ['hover']]])) {
      const el = inState(F[n], state), label = theme + (state.length ? ' (hover)' : '');
      const fg = m.computed(el, 'color'), own = m.declared(el, 'background');
      if (!parseHsl(fg)) { out.push(label + ': ' + n + ' text colour "' + fg + '" is not a resolvable token colour'); continue; }
      const own2 = own === undefined ? undefined : m.computed(el, 'background');
      const bgs = own2 && parseHsl(own2) ? [own2] : surfaces; // transparent: it sits on whichever surface the page gives it
      if (own2 && !parseHsl(own2) && !/^(transparent|none)$/.test(own2)) { out.push(label + ': ' + n + ' background "' + own2 + '" is not a resolvable token colour'); continue; }
      for (const bg of bgs) { const c = contrast(fg, bg); if (c < 4.5) out.push(label + ': ' + n + ' ' + fg + ' on ' + bg + ' = ' + c.toFixed(2) + ':1'); }
    }
  }
  return out;
}
test('the component contrast checker goes red when a component takes a text colour that fails on its surface', () => {
  const css = need();
  hits(contrastFailures(mutate(css, /(\.btn-primary[^{]*\{[^}]*?)color:\s*var\(--accent-ink\)/, '$1color: var(--ink-dim)')), 'dim text on the accent was not caught');
  hits(contrastFailures(mutate(css, /(\.badge-warn[^{]*\{[^}]*?)color:\s*var\(--warn\)/, '$1color: var(--accent)')), 'accent used as small text was not caught');
  assert.strictEqual(contrast('hsl(0 0% 0%)', 'hsl(0 0% 100%)').toFixed(1), '21.0');
});
test('every text colour a component sets, at rest and on hover, reaches 4.5:1 on the surface behind it, in light, OS dark and explicit dark (pairs computed from the real tokens; disabled and ::placeholder are not measured here)', () => {
  assert(TEXT_FIXTURES.length >= 20);
  assert.deepEqual(contrastFailures(need()), []);
});
test('placeholder text is --ink-dim at full opacity (the browser default is a washed-out grey)', () => {
  const r = rulesOf(need()).filter((x) => /::placeholder/.test(x.selector));
  assert(r.length >= 1, 'no ::placeholder rule');
  assert(r.every((x) => x.decls.color === 'var(--ink-dim)' && x.decls.opacity === '1'), JSON.stringify(r.map((x) => x.decls)));
});

/* ---------- done ---------- */
if (fails) { console.log('\n' + fails + ' FAILED'); process.exit(1); }
console.log('\nall passed');

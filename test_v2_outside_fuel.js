/* Tests for slice OR5: Fuel & tyres, the other door of the gate pass. Run: node test_v2_outside_fuel.js
 *
 * At the repo ROOT because run-tests.py discovers test_*.js at the root only. Node, no browser: the real
 * ui/*, outside.js, passes.js and the screen load in a vm context with a stub window, and the assertions are
 * on the markup the screen returns and on what the shared write puts in a fake DB.
 *
 * Spec: docs/v2/plan/outside-repair-ui.md section 7. Each check below has a mutant in the report: break the
 * thing, watch THIS file go red. FT_SCREEN / FT_CSS point at an edited copy so nobody edits the shared tree.
 */
process.env.TZ = process.env.TZ || 'UTC';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const read = (p) => fs.readFileSync(p, 'utf8');
const V2 = (...p) => path.join(ROOT, 'v2', ...p);
const SCREEN = process.env.FT_SCREEN || V2('screens', 'fuel.js');
const CSS = process.env.FT_CSS || V2('ui', 'fuel.css');
const SRC = ['ui/icons.js', 'ui/words.js', 'ui/states.js', 'fmt.js', 'odo.js', 'caps.js', 'router.js', 'outside.js', 'ui/passes.js'];
const T = Date.UTC(2026, 10, 9, 8, 0), HOUR = 3600000, DAY = 86400000;
const ROLES = ['owner', 'supervisor', 'store', 'crewmanager'];

let fails = 0;
const QUEUE = [];
function test(name, fn) { QUEUE.push({ name, fn }); }

function fakeDB(seed) {
  const data = {};
  const clone = (o) => JSON.parse(JSON.stringify(o));
  Object.keys(seed || {}).forEach((s) => { data[s] = {}; seed[s].forEach((r) => { data[s][r.id] = clone(r); }); });
  return {
    async get(s, id) { const v = (data[s] || {})[id]; return v ? clone(v) : null; },
    async all(s) { return Object.keys(data[s] || {}).map((k) => clone(data[s][k])); },
    async put(s, o) { (data[s] || (data[s] = {}))[o.id] = clone(o); return o; },
    async putMany(es) { for (const e of es) await this.put(e.store, e.obj); return es.length; },
    row(s, id) { const v = (data[s] || {})[id]; return v ? clone(v) : null; },
  };
}
function fixedDate(t) {
  const R = Date;
  function D(a, b, c, d, e, f, g) { return arguments.length === 0 ? new R(t) : arguments.length === 1 ? new R(a) : new R(a, b, c, d, e, f, g); }
  D.prototype = R.prototype; D.now = () => t; D.parse = R.parse; D.UTC = R.UTC;
  return D;
}
function load(o) {
  o = o || {};
  const sheets = [], clicks = [];
  const db = fakeDB(o.db);
  const sb = {
    navigator: { onLine: true, userAgent: 'node', language: 'en' },
    location: { href: 'http://localhost/v2/', pathname: '/v2/' },
    document: {
      documentElement: { lang: 'en', getAttribute: () => null, setAttribute: () => {} }, title: '',
      addEventListener: (type, fn) => { if (!sb.__quiet && type === 'click') clicks.push(fn); },
      removeEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
      createElement: () => ({ style: {}, setAttribute() {} }), head: { appendChild() {} }, body: null,
    },
    setTimeout, clearTimeout, addEventListener() {}, removeEventListener() {},
    console: { warn() {}, error() {}, info() {}, log() {} },
    Date: fixedDate(T), Math, JSON, Promise, DB: db,
    uid: (p) => (p || '') + 'u' + (sb.__n = (sb.__n || 0) + 1),
    S: { user: { id: 'u-sup', role: o.role || 'supervisor', name: 'Mohan' }, cache: {} },
    V2: {
      openSheet: (title, body) => { sheets.push({ title, body }); return { dialog: true }; },
      closeSheet() {}, toast() {}, confirmDialog: () => Promise.resolve(true),
    },
    Cache: { load: () => Promise.resolve({}), sig: () => '' },
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  sb.__quiet = true;                      // Passes wires its own listener at load; the screen's is clicks[0]
  for (const f of SRC) vm.runInContext(read(V2(f)), ctx, { filename: V2(f) });
  sb.__quiet = false;
  sb.Router.go = () => true;
  vm.runInContext(read(SCREEN), ctx, { filename: SCREEN });
  return { win: sb, Fuel: sb.Fuel, db, sheets, clicks };
}

const bus1 = { id: 'b1', regNo: 'RJ09PA6101', odometer: 0 };
const piece = (id, o) => Object.assign({ id, kind: 'tyre', label: 'MRF front', serial: 'S-' + id, busId: null, position: '',
  state: 'removed', history: [], updatedAt: T - 3 * HOUR }, o || {});
const sentOut = (id, o) => piece(id, Object.assign({ state: 'sent-out', busId: 'b1', position: 'FL', history: [
  { id: 'h0', type: 'send-out', at: T - 3 * DAY, busId: 'b1', position: 'FL', vendor: 'V' }] }, o || {}));
const pass = { id: 'gp1', no: 'OJ-261106-AB12', status: 'out', vendorName: 'V', busId: 'b1', componentId: 'c1',
  unitName: 'MRF front', unitSerial: 'S-c1', issuedAt: T - 3 * DAY };
const shell = (role, cache) => ({ route: 'fuel', params: null, role, density: 'yard',
  user: { id: 'u-sup', role, name: 'Mohan' }, cache, replica: { behind: 0, complete: true }, stale: false, offline: false });
const piecesHtml = (l, role, cache) => { l.Fuel._reset(); l.Fuel.tab('pieces'); return l.Fuel.render(shell(role, Object.assign({ buses: [bus1], fuel: [], def: [], users: [], gatepasses: [] }, cache))); };
const strip = (h) => String(h).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
const pieceBlock = (html, id) => {
  const parts = html.split('<div class="ft-piece">');
  return parts.find((p) => p.indexOf('data-id="' + id + '"') >= 0) || '';
};

test('1 ftGateSeam and ftRepairCost are gone from the screen, and the send-out sheet has no cost input', () => {
  const src = read(SCREEN);
  assert(!/ftGateSeam/.test(src), 'ftGateSeam is still in fuel.js');
  assert(!/ftRepairCost/.test(src), 'ftRepairCost is still in fuel.js');
  const h = load().Fuel.sendSheet({ piece: piece('c1'), bus: bus1, role: 'owner' });
  assert(!/data-field="cost"/.test(h), 'the send-out sheet asks for a cost');
  assert(/data-act="ojSavePass"/.test(h));
});

test('2 all four roles get the same send-out sheet, and the screen has no gatepass branch', () => {
  const l = load();
  const norm = (h) => h.replace(/data-(pid|no|hid)="[^"]*"|oj-vendors-[A-Za-z0-9_-]+/g, '');
  const sheets = ROLES.map((r) => norm(l.Fuel.sendSheet({ piece: piece('c1'), bus: bus1, role: r })));
  sheets.forEach((s, i) => assert.strictEqual(s, sheets[0], ROLES[i] + ' got a different sheet'));
  assert(!/outsideJob|gatepass\s*:/.test(read(SCREEN).replace(/\/\*[\s\S]*?\*\//g, '')), 'the screen still branches on outsideJob');
});

test('3 a sent-out piece has a Back-from-the-vendor action that opens the return sheet; an in-service piece has none', () => {
  const l = load();
  const html = piecesHtml(l, 'supervisor', { components: [sentOut('c1'), piece('c2', { state: 'in-service', busId: 'b1', position: 'FL' })], gatepasses: [pass] });
  const a = pieceBlock(html, 'c1'), b = pieceBlock(html, 'c2');
  assert(/<div class="ft-pacts" data-density="yard">/.test(a) && /data-act="ftReturn"/.test(a) && /Back from the vendor/.test(strip(a)), a);
  assert(!/ftReturn|Back from the vendor/.test(b), 'an in-service piece offers a return');
  l.win.S.cache = { components: [sentOut('c1')], buses: [bus1], fuel: [], gatepasses: [pass] };
  l.Fuel.mount();
  const btn = { getAttribute: (k) => ({ 'data-act': 'ftReturn', 'data-id': 'c1' }[k] || null), closest: () => null };
  l.clicks[0]({ target: { closest: (sel) => (sel === '[data-act]' ? btn : null) }, preventDefault() {} });
  const s = l.sheets.filter((x) => x.body);
  assert.strictEqual(s.length, 1);
  assert(/data-sheet="return"/.test(s[0].body) && /OJ-261106-AB12|MRF front/.test(s[0].body));
  assert(/Read from this phone/.test(strip(s[0].body)), 'the return sheet does not state the age of its reading');
});

test('4 a piece that left with NO pass can be received back: in service again, and the sheet says there is nothing to check', async () => {
  const c = sentOut('c1');
  const l = load({ db: { components: [c] } });
  const body = l.Fuel.returnSheet({ piece: c, pass: null, bus: bus1 });
  assert(/nothing to check the serial against/.test(strip(body)), strip(body));
  const r = await l.win.Passes.returnWrite({ vals: { hid: 'h9', serial: '', fit: 'back' }, pass: null, piece: c, me: { id: 'u-sup' } });
  assert(r.ok, JSON.stringify(r));
  const after = l.db.row('components', 'c1');
  assert.strictEqual(after.state, 'in-service');
  assert.strictEqual(after.busId, 'b1');
});

test('5 the row says how long it has been out, on which pass, or that no pass was made', () => {
  const l = load();
  const on = strip(pieceBlock(piecesHtml(l, 'supervisor', { components: [sentOut('c1')], gatepasses: [pass] }), 'c1'));
  assert(/Out 3 days on OJ-261106-AB12/.test(on), on);
  assert(/At vendor|Sent out for repair/.test(on));
  const none = strip(pieceBlock(piecesHtml(l, 'supervisor', { components: [sentOut('c1')], gatepasses: [] }), 'c1'));
  assert(/Out 3 days\. No gate pass was made\./.test(none), none);
  const ret = strip(pieceBlock(piecesHtml(l, 'supervisor', { components: [sentOut('c1')], gatepasses: [Object.assign({}, pass, { status: 'returned' })] }), 'c1'));
  assert(/No gate pass was made/.test(ret), 'a returned pass still counts as the piece being out on it');
});

test('6 a role without manageComponents gets no action strip at all', () => {
  const l = load();
  const cache = { components: [sentOut('c1'), piece('c3')], gatepasses: [pass] };
  assert(/ft-pacts/.test(piecesHtml(l, 'store', cache)) === l.win.Caps.can('store', 'manageComponents'));
  const roles = ['owner', 'supervisor', 'store', 'crewmanager', 'driver', 'mechanic'];
  let sawNo = false;
  roles.forEach((r) => {
    const h = piecesHtml(l, r, cache);
    if (!l.win.Caps.can(r, 'manageComponents')) { sawNo = true; assert(!/ft-pacts|data-act="ft(Return|Send|Fit)"/.test(h), r + ' sees an action strip'); }
    else assert(/ft-pacts/.test(h), r + ' lost the strip');
  });
  assert(sawNo, 'no role in the list lacks manageComponents: this check proves nothing');
  /* The Pieces tab is itself behind manageComponents, so for such a role the render above cannot reach a piece row at
   * all and proves the tab, not the strip. The strip's own guard is therefore pinned in the source: the one place
   * .ft-pacts is drawn is conditioned on v.can.comp. */
  const line = read(SCREEN).split('\n').filter((x) => /ft-pacts/.test(x) && /data-density/.test(x));
  assert.strictEqual(line.length, 1);
  assert(/v\.can\.comp\s*\?/.test(line[0]), 'the action strip is not conditioned on manageComponents: ' + line[0]);
});

test('7 the buttons keep --tap and the strip wraps (360px)', () => {
  const css = read(CSS).replace(/\/\*[\s\S]*?\*\//g, '');
  const strip1 = css.match(/\.ft-pacts\s*\{[^}]*\}/);
  assert(strip1 && /flex-wrap:\s*wrap/.test(strip1[0]) && /gap:\s*var\(--s2\)/.test(strip1[0]), 'the strip does not wrap');
  const btn = css.match(/\.ft-pacts \.btn\s*\{[^}]*\}/);
  assert(btn && /min-height:\s*var\(--tap\)/.test(btn[0]), 'the buttons lost --tap');
  assert(!/\.ft-pacts[^{]*\{[^}]*(width|min-width):\s*\d+px/.test(css), 'a fixed px width on the strip');
  const l = load();
  const h = piecesHtml(l, 'owner', { components: [sentOut('c1')], gatepasses: [pass] });
  const btns = (pieceBlock(h, 'c1').match(/<button[^>]*>/g) || []);
  assert(btns.length >= 1);
  btns.forEach((b) => assert(/class="btn"/.test(b) && !/style=|disabled/.test(b), b));
});

(async () => {
  for (const t of QUEUE) {
    try { await t.fn(); console.log('  ok  ' + t.name); } catch (e) { fails++; console.log(' FAIL ' + t.name + '\n        ' + String(e && e.message).split('\n').join('\n        ')); }
  }
  console.log(QUEUE.length - fails + ' passed, ' + fails + ' failed');
  if (fails) process.exit(1);
  console.log('ok: Fuel & tyres sends out and brings back on the same gate pass');
})();

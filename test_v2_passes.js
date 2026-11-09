/* Tests for v2/ui/passes.js (OR2): the three shared gate-pass sheets, their writes and the print rule.
 * Run: node test_v2_passes.js
 *
 * At the repo ROOT because scripts/run-tests.py discovers test_*.js at the root only. Node, no browser: the real
 * icons.js, words.js, states.js, photos.js, fmt.js, outside.js and passes.js load in a vm context holding a stub
 * window, and the assertions are on the markup STRING the sheets return and on what the writes put in a fake DB.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

let fails = 0;
const QUEUE = [];
function test(name, fn) { QUEUE.push({ name, fn }); }

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

function fakeDB(seed) {
  const stores = JSON.parse(JSON.stringify(seed));
  return {
    calls: { putMany: 0, put: 0 },
    stores,
    async get(n, id) { const r = (stores[n] || []).filter((x) => x.id === id)[0]; return r ? JSON.parse(JSON.stringify(r)) : null; },
    async all(n) { return JSON.parse(JSON.stringify(stores[n] || [])); },
    async put() { this.calls.put++; },
    async putMany(entries) {
      this.calls.putMany++;
      entries.forEach((e) => {
        const l = stores[e.store] = stores[e.store] || [];
        const i = l.findIndex((x) => x.id === e.obj.id);
        const c = JSON.parse(JSON.stringify(e.obj));
        if (i >= 0) l[i] = c; else l.push(c);
      });
    }
  };
}

function load(seed, file) {
  const db = fakeDB(seed || {});
  const sb = {
    console, setTimeout, Date, JSON, Promise,
    document: { addEventListener() {}, querySelector() { return null; } },
    DB: db, S: { user: null, cache: {} }, V2: {}
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  ['ui/icons.js', 'ui/words.js', 'ui/states.js', 'ui/photos.js', 'fmt.js', 'outside.js'].forEach((f) => {
    vm.runInContext(read('v2', f), ctx, { filename: f });
  });
  vm.runInContext(file || read('v2', 'ui', 'passes.js'), ctx, { filename: 'ui/passes.js' });
  return { P: sb.Passes, db, win: sb };
}

const BUS = { id: 'b1', regNo: 'RJ14 PA 1023', engineNo: 'ENG88231', chassisNo: 'MAT4470' };
const ME = { id: 'u-sup', name: 'Mohan', role: 'supervisor' };
const alt = (o) => Object.assign({ id: 'c1', label: 'Alternator', serial: 'ALT-77120', kind: 'part', state: 'in-service',
  busId: 'b1', position: 'engine', history: [], refurbCount: 0 }, o || {});
const pass = (o) => Object.assign({ id: 'gp-1', no: 'OJ-261109-AB12', status: 'out', vendorName: 'Sharma', busId: 'b1', jobId: null,
  componentId: 'c1', regNo: BUS.regNo, engineNo: BUS.engineNo, chassisNo: BUS.chassisNo, unitName: 'Alternator',
  unitSerial: 'ALT-77120', remark: '', issuedBy: 'u-sup', issuedAt: Date.now() - 86400000 }, o || {});
const sentOut = () => alt({ state: 'sent-out', history: [{ id: 'h-0', type: 'send-out', at: 1, busId: 'b1', position: 'engine', passId: 'gp-1' }] });

/* ---- (1) no cost field ---------------------------------------------------------------------------------- */
test('issueSheet has no input whose data-field is cost', () => {
  const { P } = load({});
  const h = P.issueSheet({ bus: BUS, pieces: [alt()], card: null, piece: null, role: 'supervisor' });
  assert(h.indexOf('data-sheet="pass"') > -1);
  assert(!/data-field="cost"/.test(h), 'a cost field on the issue sheet is a guess that becomes a figure on Money');
  assert(/data-field="vendor"/.test(h) && /data-field="unit"/.test(h) && /data-field="serial"/.test(h));
});

/* ---- (2) serial never pre-filled ------------------------------------------------------------------------ */
test('returnSheet never pre-fills the serial', () => {
  const { P } = load({});
  const h = P.returnSheet({ pass: pass(), piece: sentOut(), bus: BUS, ageWords: '4 minutes ago' });
  const tag = h.match(/<input[^>]*data-field="serial"[^>]*>/)[0];
  assert(!/\svalue=/.test(tag), 'serial input carries a value attribute: ' + tag);
  const attrs = (h.match(/<[^>]+>/g) || []).join('');
  assert(attrs.indexOf('ALT-77120') === -1, 'the pass serial appears inside a tag attribute');
  assert(/data-sheet="return"/.test(h));
});

/* ---- (3) a mismatch never refuses a return -------------------------------------------------------------- */
function seed() { return { gatepasses: [pass()], components: [sentOut()], jobcards: [] }; }

test('returnWrite with a different serial: pass returned, serial recorded, piece back in service', async () => {
  const { P, db } = load(seed());
  const r = await P.returnWrite({ vals: { serial: 'ALT-77999', cost: '1500', remark: '', hid: 'h-9', fit: 'back', bill: 'data:x' },
    pass: pass(), piece: sentOut(), me: ME, now: 5000 });
  assert(r.ok, JSON.stringify(r));
  const p = db.stores.gatepasses[0], c = db.stores.components[0];
  assert.strictEqual(p.status, 'returned');
  assert.strictEqual(p.returnSerial, 'ALT-77999');
  assert.strictEqual(p.cost, 1500);
  assert.strictEqual(c.state, 'in-service');
  assert.strictEqual(c.busId, 'b1');
  assert.strictEqual(c.position, 'engine');
  assert.strictEqual(c.refurbCount, 1);
  assert.strictEqual(db.calls.putMany, 1, 'one save is one putMany');
  assert.strictEqual(db.calls.put, 0);
});

test('returnWrite onto the shelf: refurbished with busId null', async () => {
  const { P, db } = load(seed());
  const r = await P.returnWrite({ vals: { serial: 'ALT-77120', cost: '', hid: 'h-9', fit: 'shelf' }, pass: pass(), piece: sentOut(), me: ME });
  assert(r.ok);
  assert.strictEqual(db.stores.components[0].state, 'refurbished');
  assert.strictEqual(db.stores.components[0].busId, null);
  assert.strictEqual(db.stores.gatepasses[0].cost, null, 'blank is null, never 0');
});

/* ---- (4) no pass, and where the money goes -------------------------------------------------------------- */
test('a return with no pass writes, and carries cost and billPhoto; with a pass it carries passId and no money', async () => {
  const legacy = alt({ state: 'sent-out', history: [{ type: 'send-out', at: 1, vendor: 'Old' }] });
  const a = load({ components: [legacy], gatepasses: [] });
  const r = await a.P.returnWrite({ vals: { serial: '', cost: '800', hid: 'h-5', fit: 'back', bill: 'data:y' }, pass: null, piece: legacy, me: ME });
  assert(r.ok, JSON.stringify(r));
  const e1 = a.db.stores.components[0].history.filter((h) => h.id === 'h-5')[0];
  assert.strictEqual(e1.cost, 800);
  assert.strictEqual(e1.billPhoto, 'data:y');
  assert.strictEqual(e1.passId, null);
  const b = load(seed());
  await b.P.returnWrite({ vals: { serial: 'ALT-77120', cost: '800', hid: 'h-5', fit: 'back', bill: 'data:y' }, pass: pass(), piece: sentOut(), me: ME });
  const e2 = b.db.stores.components[0].history.filter((h) => h.id === 'h-5')[0];
  assert.strictEqual(e2.passId, 'gp-1');
  assert(!('cost' in e2) && !('billPhoto' in e2), 'money on the piece entry as well as the pass');
  assert.strictEqual(b.db.stores.gatepasses[0].cost, 800);
});

test('the return sheet with no pass says so and still has a serial field', () => {
  const { P } = load({});
  const h = P.returnSheet({ pass: null, piece: alt({ state: 'sent-out', history: [{ id: 'h-0', type: 'send-out', at: 1 }] }), bus: null, ageWords: '' });
  assert(h.indexOf('before gate passes were kept') > -1);
  assert(!/role="tab"/.test(h), 'no tabs for a piece that came off no bus');
});

/* ---- (5) issueWrite ------------------------------------------------------------------------------------- */
test('issueWrite writes a date-first number and copies the bus identifiers', async () => {
  const { P, db, win } = load({ components: [alt()], jobcards: [{ id: 'j1', externalVendor: '' }], gatepasses: [] });
  const html = P.issueSheet({ bus: BUS, pieces: [alt()], card: { id: 'j1' }, piece: null, role: 'supervisor' });
  const pid = html.match(/data-pid="([^"]+)"/)[1], no = html.match(/data-no="([^"]+)"/)[1], hid = html.match(/data-hid="([^"]+)"/)[1];
  assert(/^OJ-\d{6}-[A-Z0-9]{4}$/.test(no), no);
  assert.strictEqual(no, win.Outside.passNo(pid, Date.now()));
  const v = { id: pid, no, hid, vendor: 'Sharma', unit: 'Alternator', serial: 'ALT-77120', remark: 'rewind', piece: 'c1' };
  const r = await P.issueWrite({ vals: v, bus: BUS, card: { id: 'j1' }, me: ME, now: 7000 });
  assert(r.ok, JSON.stringify(r));
  const g = db.stores.gatepasses[0];
  assert.strictEqual(g.no, no);
  assert.strictEqual(g.regNo, 'RJ14 PA 1023');
  assert.strictEqual(g.engineNo, 'ENG88231');
  assert.strictEqual(g.chassisNo, 'MAT4470');
  assert.strictEqual(g.status, 'out');
  assert.strictEqual(g.jobId, 'j1');
  assert.strictEqual(db.stores.components[0].state, 'sent-out');
  assert.strictEqual(db.stores.jobcards[0].gatePassNo, no);
  assert.strictEqual(db.stores.jobcards[0].externalVendor, 'Sharma');
  assert.strictEqual(db.calls.putMany, 1);
  assert.strictEqual(db.calls.put, 0);
  await P.issueWrite({ vals: v, bus: BUS, card: { id: 'j1' }, me: ME, now: 9000 });
  assert.strictEqual(db.stores.gatepasses.length, 1, 'a second save of one draft is the same row');
  assert.strictEqual(db.stores.components[0].history.length, 1);
});

test('issueWrite refuses with no draft rather than minting one', async () => {
  const { P } = load({});
  const r = await P.issueWrite({ vals: { vendor: 'x', unit: 'y' }, bus: BUS, me: ME });
  assert.strictEqual(r.ok, false);
});

/* ---- (6) work.css print rule --------------------------------------------------------------------------- */
function rules(text) {
  const out = []; let i = 0, depth = 0, start = 0, media = null, mediaDepth = -1;
  const css = stripComments(text);
  for (i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === '{') {
      const head = css.slice(start, i).trim();
      if (/^@media/.test(head)) { media = head; mediaDepth = depth; }
      else out.push({ sel: head, media: media, bodyStart: i });
      depth++; start = i + 1;
    } else if (ch === '}') {
      if (out.length && out[out.length - 1].body === undefined) out[out.length - 1].body = css.slice(out[out.length - 1].bodyStart + 1, i);
      depth--; start = i + 1;
      if (media && depth === mediaDepth) { media = null; mediaDepth = -1; }
    }
  }
  return out;
}

test('work.css: the print block draws the slip rules as real borders; every selector is scoped; no @page', () => {
  const css = read('v2', 'ui', 'work.css');
  const rs = rules(css);
  const hit = rs.filter((r) => r.media && /print/.test(r.media) && r.sel === '[data-v2] .jc-pass .v2row')[0];
  assert(hit, 'no [data-v2] .jc-pass .v2row inside @media print');
  assert(/box-shadow:\s*none/.test(hit.body) && /border-bottom:\s*1px solid var\(--line\)/.test(hit.body), hit.body);
  rs.forEach((r) => r.sel.split(',').forEach((s) => assert(/^\[data-v2\]/.test(s.trim()), 'unscoped selector: ' + s.trim())));
  const bare = stripComments(css);
  assert(!/@page/.test(bare), 'an @page rule');
  assert(!/print-color-adjust/.test(bare), 'print-color-adjust');
});

/* ---- (7) the class contract ---------------------------------------------------------------------------- */
test('every class of the contract exists in work.css or fuel.css', () => {
  const css = stripComments(read('v2', 'ui', 'work.css') + read('v2', 'ui', 'fuel.css'));
  ['jc-out', 'jc-out-cap', 'jc-pass', 'jc-pass-no', 'jc-pass-by', 'oj-sheet', 'oj-stat', 'oj-why', 'oj-err', 'ft-pacts'].forEach((c) => {
    assert(new RegExp('\\.' + c + '(?![A-Za-z0-9_-])').test(css), 'missing .' + c);
  });
});

/* ---- (8) the floor ------------------------------------------------------------------------------------- */
test('scripts/check-css-floor.sh v2 ui exits 0', () => {
  const r = spawnSync('bash', [path.join(ROOT, 'scripts', 'check-css-floor.sh'), 'v2', 'ui'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
});

test('words: the new ids are pending, every id has a Hindi key, ojConfirmMismatch lost its \\n\\n and #', () => {
  const { P } = load({});
  Object.keys(P.WORDS).forEach((k) => assert('hi' in P.WORDS[k] && P.WORDS[k].en, k));
  assert(!/[\n#]/.test(P.WORDS.ojConfirmMismatch.hi) && !/[\n#]/.test(P.WORDS.ojConfirmMismatch.en));
  ['jcPassIssuedBy', 'jcPassReceivedBy', 'jcPassMaking', 'jcPassWork', 'ftReturnAge', 'ftReturnNoPass', 'ftReturnFitBack',
   'ftReturnShelf', 'ftReturnCharge', 'ftReturnRemarkPh', 'ftReturnRecording', 'ftMismatchYes', 'ftMismatchNo']
    .forEach((k) => assert.strictEqual(P.WORDS[k].hi, '', k));
});

(async () => {
  for (const t of QUEUE) {
    try { await t.fn(); console.log('  ok  ' + t.name); } catch (e) { console.log(' FAIL ' + t.name + '\n        ' + String(e.message).split('\n').join('\n        ')); fails++; }
  }
  console.log(fails ? fails + ' FAILED' : 'passes: ' + QUEUE.length + ' checks');
  process.exit(fails ? 1 : 0);
})();

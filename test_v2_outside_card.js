/* Tests for outside repair on the Job card (#4) and Jobs (#3): slice OR3.
 * Run: node test_v2_outside_card.js
 *
 * Spec: docs/v2/plan/outside-repair-ui.md sections 3, 4.1, 4.2, 4.6, 5 and 15. Node, no browser, in the shape
 * of test_v2_work.js: the real v2 files in a vm context holding a stub window, and the assertions are on the
 * markup strings the screens return and on what landed in the (fake) database. test_v2_work.js owns the rest of
 * these two screens; this file owns only what the outside-repair feature added, so a break in one is named by
 * the file that holds it.
 *
 * Every check below was broken on purpose when it was written, and the break that reddens it is named in the
 * report that came with it. A check that cannot fail is decoration.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const read = (p) => fs.readFileSync(p, 'utf8');
const V2 = (...p) => path.join(ROOT, 'v2', ...p);

let fails = 0;
const QUEUE = [];
function test(name, fn) { QUEUE.push({ name, fn }); }
async function runAll() {
  for (const t of QUEUE) {
    try { await t.fn(); console.log('  ok  ' + t.name); }
    catch (e) { console.log(' FAIL ' + t.name + '\n        ' + String(e.message).split('\n').join('\n        ')); fails++; }
  }
}
const tick = () => new Promise((r) => setTimeout(r, 25));

/* ------------------------------------------------------------------ a stub window */

function el(tag) {
  const e = {
    tag: tag, html: '', attrs: {}, files: null, value: '', focused: 0,
    setAttribute: function (k, v) { e.attrs[k] = String(v); },
    getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(e.attrs, k) ? e.attrs[k] : null; },
    removeAttribute: function (k) { delete e.attrs[k]; },
    hasAttribute: function (k) { return Object.prototype.hasOwnProperty.call(e.attrs, k); },
    focus: function () { e.focused++; },
    addEventListener: function () {}, querySelector: function () { return null; }, querySelectorAll: function () { return []; },
    classList: { add: function () {}, remove: function () {}, contains: function () { return false; } }
  };
  Object.defineProperty(e, 'innerHTML', { get: () => e.html, set: (v) => { e.html = String(v); } });
  Object.defineProperty(e, 'outerHTML', { get: () => e.html, set: (v) => { e.html = String(v); } });
  return e;
}

const SRC = ['ui/icons.js', 'ui/words.js', 'ui/states.js', 'ui/photos.js', 'fmt.js', 'caps.js', 'router.js',
             'outside.js', 'ui/passes.js', 'screens/jobcard.js', 'screens/jobs.js'];

function fakeDB(rows, passes) {
  const stores = { jobcards: {}, gatepasses: {} };
  (rows || []).forEach((r) => { stores.jobcards[r.id] = JSON.parse(JSON.stringify(r)); });
  (passes || []).forEach((r) => { stores.gatepasses[r.id] = JSON.parse(JSON.stringify(r)); });
  const copy = (x) => (x ? JSON.parse(JSON.stringify(x)) : null);
  return {
    puts: [],
    async all(name) { return Object.keys(stores[name] || {}).map((k) => copy(stores[name][k])); },
    async get(name, id) { return copy((stores[name] || {})[id]); },
    async put(name, obj) { this.puts.push({ store: name, obj: copy(obj) }); (stores[name] = stores[name] || {})[obj.id] = copy(obj); return obj; },
    async putMany(entries) { for (const e of entries) await this.put(e.store, e.obj); },
    markDirty() {}, dirtySnapshot() { return new Set(); }, clearDirty() {},
    _row(id) { return copy(stores.jobcards[id]); }
  };
}

function load(o) {
  o = o || {};
  const html = el('html');
  html.lang = 'en';
  const clicks = [], changes = [], sheets = [], toasts = [], confirms = [];
  const db = fakeDB(o.cards, o.passes);
  const sandbox = {
    navigator: { onLine: true, userAgent: 'node', language: 'en' },
    location: { href: 'http://localhost/v2/', pathname: '/v2/' },
    document: {
      documentElement: html, title: '',
      addEventListener: function (type, fn) { if (type === 'click') clicks.push(fn); if (type === 'change') changes.push(fn); },
      removeEventListener: function () {}, getElementById: function () { return null; },
      querySelector: function () { return null; }, querySelectorAll: function () { return []; },
      createElement: function () { return el('div'); }, head: { appendChild: function () {} }, body: null
    },
    getComputedStyle: function () { return {}; }, addEventListener: function () {}, removeEventListener: function () {},
    setTimeout: setTimeout, clearTimeout: clearTimeout,
    console: { warn: () => {}, error: () => {}, info: () => {}, log: () => {} },
    S: { user: o.me || null, route: null, stack: [], cache: {} },
    DB: db,
    Sync: { info: () => ({ pending: 0, lastSyncAt: Date.now() - 4 * 60000, lastError: '', status: 'synced' }), queued: [],
            queuePhoto: function (s, i, f, d) { sandbox.Sync.queued.push([s, i, f, d]); } },
    Cache: { load: async () => ({}) },
    Shell: { mount: function (id) { sandbox.S.route = id; return true; }, body: function () { return true; } },
    FileReader: function () {
      const fr = this;
      fr.readAsDataURL = function (f) { fr.result = 'data:image/jpeg;base64,' + f.name; setTimeout(() => fr.onload(), 0); };
    },
    V2: {
      openSheet: function (title, body) { sheets.push({ title: title, body: String(body) }); return el('dialog'); },
      closeSheet: function () { sheets.closed = (sheets.closed || 0) + 1; },
      confirmDialog: function (text, opts) { confirms.push({ text: text, opts: opts }); return Promise.resolve(o.confirm === true); },
      toast: function (text, opts) { toasts.push({ text: text, kind: opts && opts.kind }); return el('div'); }
    }
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  for (const f of SRC) vm.runInContext(read(V2(f)), ctx, { filename: V2(f) });
  sandbox.Router.current = () => ({ id: 'jobcard', params: { id: 'j-mine' } });
  return { win: sandbox, db, clicks, changes, sheets, toasts, confirms };
}

/* ------------------------------------------------------------------ fixtures */

const HOUR = 3600000, DAY = 86400000;
const NOW = Date.now();
const U = {
  sup: { id: 'u-sup', role: 'supervisor', name: 'Mohan' },
  own: { id: 'u-own', role: 'owner', name: 'Owner' },
  m1: { id: 'u-m1', role: 'mechanic', name: 'Ramesh' },
  store: { id: 'u-store', role: 'store', name: 'Store' }
};
const B = [{ id: 'b1', regNo: 'RJ09PA6126' }];

function card(over) {
  return Object.assign({
    id: 'j-mine', busId: 'b1', problem: 'AC not cooling', priority: 'high', status: 'open',
    assignees: [], assignedTo: null, enterAt: NOW - 3 * DAY, startAt: null, completeAt: null, outAt: null,
    odometer: null, beforePhotos: [], afterPhotos: [], partsUsed: [], partRequests: [], coreReturns: [],
    externalVendor: '', externalCost: 0, closedAt: null, closedBy: null, verifiedBy: null, verifiedAt: null,
    updatedAt: NOW - HOUR
  }, over || {});
}
const away = (over) => card(Object.assign({ outside: true, outsideCity: 'Jaipur', externalVendor: 'CoolAir Jaipur' }, over || {}));
function pass(i, over) {
  return Object.assign({ id: 'gp-' + i, no: 'OJ-261109-A' + (100 + i), jobId: 'j-mine', busId: 'b1', status: 'out',
    vendorName: 'CoolAir Jaipur', unitName: 'Alternator', unitSerial: 'ALT-' + i, issuedAt: NOW - (10 - i) * HOUR }, over || {});
}

function as(user, o) {
  o = o || {};
  const cards = o.cards || [card()];
  const l = load({ me: user, cards: cards, passes: o.passes, confirm: o.confirm });
  l.win.S.user = user;
  l.cards = cards;
  l.passes = o.passes || [];
  return l;
}
function mdl(l, o) {
  o = o || {};
  l.win.S.cache = { jobcards: o.cards || l.cards, buses: B, users: Object.keys(U).map((k) => U[k]), parts: [],
                    ledger: [], gatepasses: l.passes, vendors: [], components: [] };
  return { route: o.route || 'jobcard', params: o.params || { id: 'j-mine' }, role: l.win.S.user.role,
           density: o.density || 'yard', user: l.win.S.user, cache: l.win.S.cache,
           replica: { behind: 0, complete: true }, stale: false, offline: false, filter: o.filter };
}
const draw = (l, o) => l.win.Jobcard.render(mdl(l, o));

/* a click, driven the way the browser drives it. `closest` answers exactly the shapes it is asked about. */
function target(spec) {
  const node = el(spec.tag || 'button');
  Object.keys(spec.attrs || {}).forEach((k) => node.setAttribute(k, spec.attrs[k]));
  node.closest = function (sel) {
    if (spec.field && /input|select|textarea|label|\.num/.test(sel)) return el('input');
    const m = /^\[([-a-z]+)\]$/.exec(sel);
    if (m && Object.prototype.hasOwnProperty.call(spec.attrs || {}, m[1])) return node;
    return null;
  };
  return node;
}
const press = (h, act, attrs) => { const t = target({ attrs: Object.assign({ 'data-act': act }, attrs || {}) }); h({ target: t }); return t; };

/* a sheet host: the fields named in a sheet's markup, found by data-field, the way vals() and flag() find them */
function host(html, l, kind) {
  const h = el('div');
  const grab = (a) => { const m = new RegExp(a + '="([^"]*)"').exec(html); return m ? m[1] : ''; };
  h.setAttribute('data-card', grab('data-card'));
  h.setAttribute('data-opened', grab('data-opened'));
  const fields = {}, errs = {};
  let m;
  const fre = /<(input|textarea|select)\b[^>]*data-field="(\w+)"[^>]*>/g;
  while ((m = fre.exec(html))) {
    const f = el(m[1]);
    f.setAttribute('data-field', m[2]);
    f.setAttribute('aria-invalid', /aria-invalid="true"/.test(m[0]) ? 'true' : 'false');
    fields[m[2]] = f;
  }
  const ere = /data-err="(\w+)"[^>]*(hidden)?[^>]*>/g;
  while ((m = ere.exec(html))) { const e = el('span'); e.setAttribute('hidden', ''); errs[m[1]] = e; }
  h.fields = fields; h.errs = errs;
  h.querySelectorAll = (sel) => (sel === '[data-field]' ? Object.keys(fields).map((k) => fields[k]) : []);
  h.querySelector = (sel) => {
    const f = /^\[data-field="(\w+)"\]$/.exec(sel), e = /^\[data-err="(\w+)"\]$/.exec(sel);
    return f ? fields[f[1]] || null : e ? errs[e[1]] || null : null;
  };
  l.win.document.querySelector = (sel) => (sel === '[data-sheet="' + kind + '"]' ? h : null);
  return h;
}

/* =================================================================================================
 * 1. Absent, not disabled, for a role without outsideJob
 * ================================================================================================= */

test('a storekeeper gets no away control, no "Back in our yard", no vendor block, no bill group and no pass row', () => {
  const cards = [away({ billPhotos: ['/uploads/bill.jpg'] })];
  const passes = [pass(1)];
  const st = as(U.store, { cards, passes });
  const h = draw(st);
  for (const [what, re] of [
    ['the away control', /data-act="jobAway"/], ['the back control', /data-act="jobBack"/],
    ['the send-a-unit control', /data-act="jobSendOut"/], ['a pass row', /data-act="jobPass"|OJ-261109-A101/],
    ['the vendor block', /CoolAir Jaipur|jc-out|Away for repair|Outside repair/], ['"Back in our yard"', /Back in our yard/],
    ['the bill group', /name="bill"|Vendor’s bill/], ['the place', /Jaipur/]]) {
    assert(!re.test(h), 'a storekeeper was shown ' + what);
  }
  // Absent means ABSENT: not drawn greyed either.
  assert(!/aria-disabled="true"[^>]*data-act="job(Away|Back|SendOut|Pass)"|data-act="job(Away|Back|SendOut|Pass)"[^>]*aria-disabled/.test(h));
  const mech = as(U.m1, { cards: [away({ assignees: [{ userId: 'u-m1', task: '' }], assignedTo: 'u-m1' })], passes });
  const hm = draw(mech);
  assert(!/data-act="job(Away|Back|SendOut|Pass)"|CoolAir|name="bill"/.test(hm), 'a mechanic was shown the outside block');
  // …and the same card, for the supervisor, has all of it: the absence above is not a card that draws nothing.
  const sup = draw(as(U.sup, { cards, passes }));
  for (const re of [/data-act="jobBack"/, /data-act="jobSendOut"/, /data-act="jobPass"/, /CoolAir Jaipur/, /name="bill"/])
    assert(re.test(sup), 'the supervisor lost ' + re);
  assert(/data-act="jobAway"/.test(draw(as(U.sup, { cards: [card()] }))), 'a card in the yard has no away control for a supervisor');
});

/* =================================================================================================
 * 2. The away card never asks for a crew member
 * ================================================================================================= */

test('nextStep on an away card never returns crew, in all three away states, and returns them in the 3.4 order', () => {
  const { win } = as(U.sup);
  const step = (c, me) => win.Jobcard.nextStep(c, me || U.sup, []).kind;
  for (const me of [U.sup, U.own]) {
    assert.strictEqual(step(away({ enterAt: null }), me), 'awayTime');
    assert.strictEqual(step(away(), me), 'awayBill');
    assert.strictEqual(step(away({ billPhotos: ['/uploads/b.jpg'] }), me), 'awayReady');
  }
  // None of those cards has a crew, which is exactly the card the crew step would have asked about.
  assert.strictEqual(win.Jobcard.crew(away()).length, 0);
  // The control: the same card in the yard IS asked for a crew member, so the branch is what is being tested.
  assert.strictEqual(step(card({ outside: false }), U.sup), 'crew');
  assert.strictEqual(step(card({ enterAt: null, outside: false }), U.sup), 'enterTime');
  // And the rendered row says what the table says.
  const l = as(U.sup, { cards: [away({ enterAt: null })] });
  const h = draw(l);
  assert(/Record when it reached the workshop/.test(h) && /Record the time/.test(h));
  assert(!/Put somebody on this job/.test(h), 'the crew step was drawn on an away card');
});

/* =================================================================================================
 * 3. Block 4: the four outside states, and the reason verbatim
 * ================================================================================================= */

test('block 4 draws all four outside gate states, each with its own words', () => {
  const need = draw(as(U.sup, { cards: [away()] }));
  assert(/To close: a photo of the vendor’s bill/.test(need) && /No bill photo yet\. You can close without it by typing a reason\./.test(need));
  assert(!/To close: 2 photos before, 2 after/.test(need), 'the inside gate was drawn on an outside card');

  const onCard = draw(as(U.sup, { cards: [away({ billPhotos: ['/uploads/b.jpg'] })] }));
  assert(/Ready to close/.test(onCard) && /The vendor’s bill is on the card\./.test(onCard));

  const ret = pass(2, { status: 'returned', returnedAt: NOW, billPhoto: '/uploads/pb.jpg' });
  const onPass = draw(as(U.sup, { cards: [away()], passes: [ret] }));
  assert(/The vendor’s bill is on gate pass OJ-261109-A102\./.test(onPass));

  const closed = away({ status: 'done', closedBy: 'u-own', closedAt: NOW, closeNoBillReason: 'Vendor lost <b>it</b>' });
  const reason = draw(as(U.sup, { cards: [closed] }));
  assert(/Closed with no bill/.test(reason));
});

test('the typed close reason appears verbatim in the card\'s own state AND in the sign-off read', () => {
  const typed = 'Vendor will send the bill next week & lost <b>this</b> one';
  const escaped = 'Vendor will send the bill next week &amp; lost &lt;b&gt;this&lt;/b&gt; one';
  const l = as(U.sup, { cards: [away({ status: 'done', closedBy: 'u-own', closedAt: NOW, closeNoBillReason: typed })] });
  const h = draw(l);
  // The sign-off path: a second person is looking at a closed card and is offered the sign-off.
  assert(/data-act="jobVerify"/.test(h), 'this is not the sign-off read');
  // Place 1, the card's own state: block 4's row.
  assert(new RegExp('Closed with no bill</span><span class="sub">' + escaped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '</span>').test(h),
    'block 4 does not carry the typed reason as its sub');
  // Place 2, the line under the card\'s name, which is where the person signing off is already looking.
  assert(new RegExp('jc-id[^]*?</p><p class="jc-note jc-nobill">' + escaped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '</p>').test(h),
    'the reason is not under the card\'s name');
  assert.strictEqual(h.split(escaped).length - 1, 2, 'the reason should be on the card exactly twice');
  assert(!/<b>this/.test(h), 'the typed reason was not escaped');
  // A role without outsideJob is told nothing of it.
  assert(!/Closed with no bill|next week/.test(draw(as(U.store, { cards: l.cards }))));
});

/* =================================================================================================
 * 4. The close path on an unmet gate, and a reason that fails the FIELD
 * ================================================================================================= */

test('"Close this card" on an unmet outside gate is ENABLED and leads to a visible "Close without the bill"', async () => {
  const l = as(U.sup, { cards: [away({ billPhotos: [] })] });
  const h = draw(l);
  const closes = h.match(/<button[^>]*data-act="jobClose"[^>]*>/g) || [];
  assert(closes.length >= 1, 'no Close control on the card');
  for (const c of closes) assert(!/aria-disabled|disabled/.test(c), 'the close is a disabled button with a secret: ' + c);
  const hd = l.win.Jobcard.mount();
  l.win.S.cache = mdl(l).cache;
  press(hd, 'jobClose');
  await tick();
  assert.strictEqual(l.sheets.length, 1, 'tapping Close did not open the confirmation');
  const ask = l.sheets[0].body;
  assert(/There is no bill photo on this card/.test(ask) && /You can add the bill, or close it by typing a reason\./.test(ask));
  assert(/<button type="button" class="btn btn-quiet" data-act="jobNoBill">Close without the bill<\/button>/.test(ask),
    'the way through is not a visible .btn-quiet');
  assert.strictEqual(l.db.puts.length, 0, 'the card closed on the first tap');
  // …and a card whose gate IS met closes straight away, with no extra step.
  const ok = as(U.sup, { cards: [away({ billPhotos: ['/uploads/b.jpg'] })] });
  const h2 = ok.win.Jobcard.mount(); mdl(ok);
  press(h2, 'jobClose'); await tick();
  assert.strictEqual(ok.sheets.length, 0);
  assert.strictEqual(ok.db._row('j-mine').status, 'done');
});

test('an empty reason fails the FIELD (aria-invalid, words) and the button stays pressable; a typed one closes the card', async () => {
  const l = as(U.sup, { cards: [away()] });
  mdl(l);
  const hd = l.win.Jobcard.mount();
  const sheetHtml = l.win.Jobcard.noBillSheet(l.cards[0]);
  assert(/<textarea[^>]*data-field="reason"[^>]*aria-invalid="false"/.test(sheetHtml));
  const hs = host(sheetHtml, l, 'nobill');
  const btn = press(hd, 'jobNoBillSave');
  await tick();
  assert.strictEqual(hs.fields.reason.getAttribute('aria-invalid'), 'true', 'the empty reason did not mark the field');
  assert.strictEqual(hs.errs.reason.textContent, 'Type the reason. The card cannot close without it.');
  assert(!hs.errs.reason.hasAttribute('hidden'), 'the message is still hidden');
  assert.strictEqual(btn.getAttribute('aria-disabled'), null, 'the button was disabled by an empty reason');
  assert(!/\bdisabled\b/.test(sheetHtml), 'the sheet draws a disabled control');
  assert.strictEqual(l.db.puts.length, 0, 'an empty reason wrote the card');
  // Whitespace is empty too.
  hs.fields.reason.value = '   \n ';
  press(hd, 'jobNoBillSave'); await tick();
  assert.strictEqual(l.db.puts.length, 0, 'a blank reason closed the card');
  // Typed: one write, closed, with the reason on it.
  hs.fields.reason.value = 'Vendor will send the bill next week';
  press(hd, 'jobNoBillSave'); await tick();
  const row = l.db._row('j-mine');
  assert.strictEqual(l.db.puts.length, 1, 'close plus reason must be ONE write');
  assert.strictEqual(row.status, 'done');
  assert.strictEqual(row.closeNoBillReason, 'Vendor will send the bill next week');
  assert.strictEqual(l.toasts[0].text, 'Card closed. No bill — your reason is on the card.');
  // 500 characters is the contract's ceiling.
  const long = as(U.sup, { cards: [away()] }); mdl(long);
  const c2 = await long.win.Jobcard.close('j-mine', U.sup, { reason: 'x'.repeat(900) });
  assert.strictEqual(c2.closeNoBillReason.length, 500);
});

test('a reason does not close an INSIDE card, and does not close for a role that may not close', async () => {
  const inside = as(U.sup, { cards: [card()] });
  assert.strictEqual(await inside.win.Jobcard.close('j-mine', U.sup, { reason: 'because' }), null);
  const store = as(U.store, { cards: [away()] });
  assert.strictEqual(await store.win.Jobcard.close('j-mine', U.store, { reason: 'because' }), null);
});

/* =================================================================================================
 * 5. More than three passes
 * ================================================================================================= */

test('a card with 7 passes draws exactly 3 pass rows and one cap line, newest first', () => {
  const passes = [1, 2, 3, 4, 5, 6, 7].map((i) => pass(i));
  const h = draw(as(U.sup, { cards: [away()], passes }));
  assert.strictEqual((h.match(/data-act="jobPass"/g) || []).length, 3);
  assert.strictEqual((h.match(/class="jc-out-cap"/g) || []).length, 1);
  assert(/3 of 7 gate passes shown, newest first\./.test(h));
  // Newest first: pass 7 was issued last.
  assert(h.indexOf('OJ-261109-A107') > -1 && h.indexOf('OJ-261109-A107') < h.indexOf('OJ-261109-A106') && h.indexOf('OJ-261109-A106') < h.indexOf('OJ-261109-A105'));
  assert(!/OJ-261109-A104/.test(h), 'a fourth pass was drawn');
  // One pass: one row, no count line. Three: no cap line either.
  const one = draw(as(U.sup, { cards: [away()], passes: [pass(1)] }));
  assert.strictEqual((one.match(/data-act="jobPass"/g) || []).length, 1);
  assert(!/jc-out-cap|gate passes shown/.test(one));
  assert(!/jc-out-cap/.test(draw(as(U.sup, { cards: [away()], passes: [pass(1), pass(2), pass(3)] }))));
  // A pass row is a button.v2row, the only pressable row in the block.
  assert(/<button class="v2row"[^>]*data-act="jobPass"/.test(one), 'a pass row is not a button.v2row');
  // …and it is the only pressable row in the block: the vendor row's Change is a button inside a div row.
  const block = one.slice(one.indexOf('jc-out'), one.indexOf('</section>', one.indexOf('jc-out')));
  assert.strictEqual((block.match(/<button class="v2row/g) || []).length, 1);
});

test('the block is drawn for an away card with no vendor, and shows the town it was saved under (outsideCity)', () => {
  const h = draw(as(U.sup, { cards: [away({ externalVendor: '' })] }));
  assert(/Away for repair/.test(h) && /In Jaipur/.test(h), 'a bus away in Jaipur with no vendor typed drew nothing');
  assert(/Marked away\. Nobody from our garage is on it\./.test(h));
  // Only a vendor: "Outside repair", and no place row.
  const v = draw(as(U.sup, { cards: [card({ externalVendor: 'Sharma Auto' })] }));
  assert(/Outside repair/.test(v) && !/Marked away/.test(v));
  // Neither away, nor a vendor, nor a pass: no block at all, not a heading over nothing.
  assert(!/jc-out/.test(draw(as(U.sup, { cards: [card()] }))));
  // The days figure is unknown, not zero, until the reached-the-workshop time exists.
  const none = draw(as(U.sup, { cards: [away({ enterAt: null })] }));
  assert(/No reached-the-workshop time recorded/.test(none) && /data-state="unknown"|No data/.test(none));
  assert(!/Away for 0 days/.test(none));
});

/* =================================================================================================
 * 6. The mechanic's tab strip
 * ================================================================================================= */

test('a mechanic\'s model().tabs is [open, done] and no away tab exists in the DOM', () => {
  const l = as(U.m1, { cards: [away({ assignees: [{ userId: 'u-m1', task: '' }], assignedTo: 'u-m1' })] });
  const m = mdl(l, { route: 'jobs', params: null });
  assert.deepEqual(l.win.Jobs.model(m).tabs, ['open', 'done']);
  // The strip remembers its last tab in a module variable: a mechanic on a phone left on Away still gets Open.
  m.filter = 'away';
  assert.strictEqual(l.win.Jobs.model(m).filter, 'open');
  const h = l.win.Jobs.render(m);
  assert(!/data-tab="away"|data-filter="away"|Away for repair/.test(h), 'the Away tab was drawn for a mechanic');
  assert.strictEqual((h.match(/role="tab"/g) || []).length, 2);
  // Owner and supervisor still have it.
  for (const u of [U.sup, U.own]) {
    const s = as(u, { cards: [away()] });
    assert.deepEqual(s.win.Jobs.model(mdl(s, { route: 'jobs', params: null })).tabs, ['open', 'done', 'away', 'workload']);
  }
});

/* =================================================================================================
 * 7. The away row
 * ================================================================================================= */

function actOf(html) {
  const i = html.indexOf('<span class="act');
  assert(i > -1, 'the row has no .act');
  return html.slice(i, html.indexOf('</button>', i));
}

test('an away row\'s .act is one figure(days, {unit: d}) and the row has no .figure-note, at both densities', () => {
  const cards = [away({ id: 'j-a', enterAt: NOW - 5 * DAY }), away({ id: 'j-b', outsideCity: 'Ajmer', externalVendor: '', enterAt: NOW - 20 * DAY })];
  for (const density of ['yard', 'desk']) {
    const l = as(U.sup, { cards });
    const h = l.win.Jobs.render(mdl(l, { route: 'jobs', params: null, density, filter: 'away', cards }));
    const rows = h.split('<button class="v2row"').slice(1);
    assert.strictEqual(rows.length, 2, density + ': two away cards, two rows');
    for (const r of rows) {
      const act = actOf(r);
      assert.strictEqual((act.match(/class="figure"/g) || []).length, 1, density + ': .act is not one figure');
      assert(/<span class="figure-u">d<\/span>/.test(act), density + ': the unit is not d');
      assert(!/figure-note/.test(r), density + ': a figure-note sits inside an away row');
      assert(/class="lead jb-warn"/.test(r), density + ': the lead mark is not in --warn');
    }
    // --warn under 14 days, --bad at 14 and over. (The list is oldest first, so the 20-day card leads.)
    const young = rows.filter((r) => /j-a/.test(r))[0], old = rows.filter((r) => /j-b/.test(r))[0];
    assert(/class="act jb-warn"/.test(young) && /class="act jb-bad"/.test(old), density + ': days tone is wrong');
    if (density === 'yard') {
      assert(/In Jaipur · CoolAir Jaipur/.test(young));
      assert(/In Ajmer · no vendor recorded yet/.test(old));
      assert(!/Nobody on it yet/.test(h), 'an away row complains about a crew it was never meant to have');
    }
  }
  // Unknown is a dash, never a zero.
  const u = as(U.sup, { cards: [away({ enterAt: null })] });
  const hu = u.win.Jobs.render(mdl(u, { route: 'jobs', params: null, filter: 'away' }));
  assert(/data-state="unknown"/.test(actOf(hu)) && !/>0</.test(actOf(hu)));
});

/* =================================================================================================
 * 8. A field is not pressed; it is focused
 * ================================================================================================= */

test('clicking every field in the away sheet, the close-without-bill sheet and the back confirmation leaves the route stable', async () => {
  const l = as(U.sup, { cards: [away()] });
  mdl(l);
  const hd = l.win.Jobcard.mount();
  l.win.S.route = 'jobcard';
  const sheets = [
    ['away', l.win.Jobcard.awaySheet(l.cards[0], { reg: 'RJ09PA6126', places: ['Jaipur'], vendors: ['CoolAir Jaipur'] }), 'jobAwaySave'],
    ['nobill', l.win.Jobcard.noBillSheet(l.cards[0]), 'jobNoBillSave']
  ];
  let fields = 0;
  for (const [kind, html, act] of sheets) {
    const hs = host(html, l, kind);
    // Fill it in, so that a click which DID reach the save handler would write: the early return is the only
    // thing between a tap on a field and the write.
    Object.keys(hs.fields).forEach((k) => { hs.fields[k].value = 'Jaipur'; });
    const re = /<(input|select|textarea)\b/g;
    while (re.exec(html)) {
      fields++;
      let prevented = false;
      hd({ target: target({ field: true, attrs: { 'data-act': act, 'data-nav': 'jobs' } }), preventDefault: function () { prevented = true; } });
      assert.strictEqual(l.win.S.route, 'jobcard', 'a click on a field in the ' + kind + ' sheet changed the route');
      assert.strictEqual(prevented, false);
    }
  }
  await tick();
  assert(fields >= 3, 'the sheets hold no fields to click: ' + fields);
  assert.strictEqual(l.db.puts.length, 0, 'a tap on a field wrote a record');
  assert.strictEqual(l.toasts.length, 0);
  // The back confirmation is a dialog of words and holds no field at all.
  const q = l.win.Jobcard.backConfirm(l.cards[0]);
  assert(!/<input|<select|<textarea/.test(JSON.stringify(q)));
  // The shape the predeploy gate checks, as source order: the field guard comes before [data-act] is read.
  const src = read(V2('screens', 'jobcard.js')).replace(/\/\*[\s\S]*?\*\//g, '');
  const body = src.slice(src.indexOf('function onClick'));
  assert(body.indexOf("closest('input, select, textarea, label, .num')") > -1 &&
         body.indexOf("closest('input, select, textarea, label, .num')") < body.indexOf("closest('[data-act]')"),
  'the field guard does not run before [data-act] is read');
});

/* =================================================================================================
 * The three sheets this screen owns, and the writes behind them
 * ================================================================================================= */

test('"The bus is away" needs a place (aria-invalid + words) and writes outside, outsideCity, externalVendor and updatedAt only', async () => {
  const l = as(U.sup, { cards: [card()] });
  mdl(l);
  const hd = l.win.Jobcard.mount();
  const html = l.win.Jobcard.awaySheet(l.cards[0], { reg: 'RJ09PA6126', places: ['Jaipur', 'Ajmer'], vendors: ['CoolAir Jaipur'] });
  assert(/<datalist id="jc-places">(<option value="[^"]*">)+<\/datalist>/.test(html), 'the places are not a native datalist');
  assert(/list="jc-vendors"/.test(html) && /list="jc-places"/.test(html));
  assert(/RJ09PA6126 — AC not cooling/.test(html) && /Which town|Town or workshop/.test(html));
  assert.strictEqual((html.match(/<input\b/g) || []).length, 2, 'two fields and nothing else');
  const hs = host(html, l, 'away');
  const btn = press(hd, 'jobAwaySave'); await tick();
  assert.strictEqual(hs.fields.where.getAttribute('aria-invalid'), 'true');
  assert.strictEqual(hs.errs.where.textContent, 'Which town is the bus in?');
  assert.strictEqual(btn.getAttribute('aria-disabled'), null);
  assert.strictEqual(l.db.puts.length, 0);
  const before = l.db._row('j-mine');
  hs.fields.where.value = ' Jaipur ';
  hs.fields.vendor.value = 'CoolAir Jaipur';
  press(hd, 'jobAwaySave'); await tick();
  const after = l.db._row('j-mine');
  const changed = Object.keys(after).filter((k) => JSON.stringify(after[k]) !== JSON.stringify(before[k])).sort();
  assert.deepEqual(changed, ['externalVendor', 'outside', 'outsideCity', 'updatedAt']);
  assert.strictEqual(after.outside, true);
  assert.strictEqual(after.outsideCity, 'Jaipur');
  // No vendor typed: the vendor field is left alone.
  const l2 = as(U.sup, { cards: [card({ externalVendor: 'Kept Vendor' })] }); mdl(l2);
  const h2 = l2.win.Jobcard.mount();
  const s2 = host(l2.win.Jobcard.awaySheet(l2.cards[0], {}), l2, 'away');
  s2.fields.where.value = 'Kota';
  press(h2, 'jobAwaySave'); await tick();
  assert.strictEqual(l2.db._row('j-mine').externalVendor, 'Kept Vendor');
});

test('"Back in our yard" is a confirmation with "Not yet" the safe answer, and writes outside:false and outAt', async () => {
  const c = away({ enterAt: NOW - 4 * DAY });
  const q = as(U.sup, { cards: [c] }).win.Jobcard.backConfirm(c);
  assert.strictEqual(q.text, 'The bus is back from CoolAir Jaipur. Away for 4 days.');
  assert.deepEqual(q.opts, { title: 'Back in our yard', yes: 'Yes, it is back', no: 'Not yet' });
  const nt = as(U.sup, { cards: [away({ enterAt: null })] }).win.Jobcard.backConfirm(away({ enterAt: null }));
  assert(/No reached-the-workshop time was recorded, so the days away cannot be counted\./.test(nt.text));
  assert(!/Away for 0/.test(nt.text));
  // Not yet: nothing is written.
  const no = as(U.sup, { cards: [c], confirm: false }); mdl(no);
  press(no.win.Jobcard.mount(), 'jobBack'); await tick();
  assert.strictEqual(no.confirms.length, 1);
  assert.strictEqual(no.db.puts.length, 0);
  // Yes: outside false, outAt now, the card's other fields untouched.
  const yes = as(U.sup, { cards: [c], confirm: true }); mdl(yes);
  const before = yes.db._row('j-mine');
  press(yes.win.Jobcard.mount(), 'jobBack'); await tick();
  const after = yes.db._row('j-mine');
  assert.strictEqual(after.outside, false);
  assert(after.outAt >= NOW);
  assert.deepEqual(Object.keys(after).filter((k) => JSON.stringify(after[k]) !== JSON.stringify(before[k])).sort(), ['outAt', 'outside', 'updatedAt']);
  // Once back, the days are frozen by arithmetic: (outAt - enterAt), not now.
  const back = as(U.sup, { cards: [Object.assign({}, after, { status: 'open' })] });
  assert(/Was away 4 days/.test(draw(back)));
});

test('the bill: a fifth tile is refused, the capture control is absent at four, and a bill photo is queued for upload', async () => {
  const l = as(U.sup, { cards: [away()] }); mdl(l);
  l.win.Jobcard.mount();
  // passes.js listens for change too, at load; ours is the one added by mount(), so the last.
  const onChange = l.changes[l.changes.length - 1];
  assert.strictEqual(typeof onChange, 'function', 'mount() installed no change listener for the capture control');
  for (let i = 1; i <= 5; i++) {
    const t = el('input'); t.setAttribute('name', 'bill'); t.files = [{ name: 'p' + i }];
    onChange({ target: t });
    await tick();
  }
  const row = l.db._row('j-mine');
  assert.strictEqual(row.billPhotos.length, 4, 'a fifth bill photo was kept');
  assert.strictEqual(l.win.Sync.queued.length, 4);
  const h = draw(l, { cards: [row] });
  assert(!/name="bill"/.test(h), 'the capture control is still drawn at four');
  assert(/Vendor’s bill \(4\)/.test(h));
  // At one it is still drawn, and an empty group is the control plus the requirement in words.
  const empty = draw(as(U.sup, { cards: [away()] }));
  assert(/name="bill"/.test(empty) && /The vendor’s bill\. Needed to close this card\./.test(empty));
  assert(!/state-empty|class="state/.test(empty.slice(empty.indexOf('Vendor’s bill (0)'))), 'the empty bill group is an emptyState()');
});

test('the one-time sheet reads "Reached the workshop" for an away card, and the old words are gone', () => {
  const l = as(U.sup, { cards: [away({ enterAt: null })] });
  assert(/Reached the workshop/.test(l.win.Jobcard.timeSheet('enterAt', away())));
  assert(/Enter time/.test(l.win.Jobcard.timeSheet('enterAt', card())));
  const src = read(V2('screens', 'jobcard.js'));
  assert(!/outsidePlace/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), 'the card still reads a field no record has');
});

(async function () {
  await runAll();
  console.log(fails ? '\n' + fails + ' FAILED' : '\nall ok');
  process.exit(fails ? 1 : 0);
})();

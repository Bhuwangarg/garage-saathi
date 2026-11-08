/* Tests for v2/login.js, and for the two seams it adds. Run: node test_v2_login.js
 *
 * At the repo ROOT and not in v2/, because scripts/run-tests.py auto-discovers
 * test_*.js at the root only and does not recurse: a test in v2/ would never
 * run, and a test nobody runs is not a test.
 *
 * WHAT THIS FILE IS FOR. One property, and every case below is a face of it:
 *
 *     A WRONG PIN THE SERVER IS SURE ABOUT STAYS WRONG, AND A RIGHT ONE OPENS
 *     THE APP FOR EVERY ROLE INCLUDING THE THREE WITH NOTHING TO FALL BACK ON.
 *
 * The three things that go wrong here are all invisible when they are right:
 *
 *  1. `known: true` falling through to the device PIN. The server holds the
 *     account and said no; the copy on the phone is then a credential somebody
 *     has already rotated, and a fallback that reads it lets the old PIN work
 *     on every phone that ever used it. Nothing about the screen looks any
 *     different. The order of the branches in `attempt()` is the whole fix, so
 *     the mutant that reorders them is at the bottom of this file.
 *  2. The owner, the supervisor and the crew manager have NO device PIN
 *     (v2-ux.md §6), so for those three the login IS one request against a
 *     container whose cold start is 30-36 s. The 8 s default times out just
 *     under the real number, which fails ONLY against a cold container — the
 *     owner unable to sign in, intermittently, with nothing wrong anywhere.
 *  3. The PIN reaching the page. The dots are a COUNT; the check below types
 *     four of one digit and asserts the markup holds no more of that digit
 *     than an untouched pad does.
 *
 * AND THE ONE THING NO NODE SUITE CAN SEE. Every screen in v2 is tested through
 * `module.exports`, so the `else` branch — the browser's, the one that calls
 * `mount()` — is exercised by nothing here. This file narrows that gap where it
 * can (the registration block is read as text, and `mount()` is called against
 * a document that is not there), but it cannot close it: see the report's note
 * on the headless browser run, which is the other half of the proof.
 *
 * MUTANTS. Section 10 breaks each rule above in the source, reloads, and asserts
 * that the check for it goes red. A check that cannot fail is decoration, and
 * this repo has shipped a bug behind one.
 */
process.env.TZ = process.env.TZ || 'UTC';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const read = (p) => fs.readFileSync(p, 'utf8');
const V2 = (...p) => path.join(ROOT, 'v2', ...p);

let fails = 0;
const waiting = [];
const fail = (name, e) => {
  console.log(' FAIL ' + name + '\n        ' + String(e && e.message).split('\n').join('\n        '));
  fails++;
};
/* Async cases are collected and awaited at the end rather than run inline:
 * `attempt()` is async and a runner that dropped a rejected promise would
 * report a passing suite for a login that threw — which is exactly the kind of
 * check that passes either way. */
function test(name, fn) {
  let r;
  try { r = fn(); }
  catch (e) { fail(name, e); return; }
  if (r && typeof r.then === 'function') {
    waiting.push(r.then(() => console.log('  ok  ' + name), (e) => fail(name, e)));
    return;
  }
  console.log('  ok  ' + name);
}

// One turn of the microtask queue, which is all an awaited stub resolves in.
const flush = () => new Promise((r) => setImmediate(r));

/* ===================================================================================================
 * THE SANDBOX
 * =================================================================================================== */

/* Every file a page loads before login.js, plus login.js and boot.js. The order
 * is index.html's, and `test_v2_boot.js` is what keeps the two agreeing. */
const SRC = ['ui/icons.js', 'ui/words.js', 'ui/states.js', 'caps.js', 'router.js',
             'shell.js', 'login.js', 'boot.js'];

/* The digits typed INTO the pad. They are input, never an expected output: no
 * assertion in this file says a PIN is drawn, stored or logged anywhere, and
 * section 4's check asserts the opposite. */
const GOOD = ['3', '7', '1', '5'];
const WRONG = ['9', '9', '9', '9'];

/* An element faithful in the two ways the frame depends on: `innerHTML` is kept
 * so the markup put on the page can be read back, and `insertAdjacentHTML`
 * appends to it — `Shell.put` clears then inserts, which is the one write path
 * the login takes. */
function fakeEl() {
  const el = {
    innerHTML: '',
    insertAdjacentHTML: function (pos, html) { el.innerHTML += String(html); },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    setAttribute: function () {}, getAttribute: function () { return null; },
    removeAttribute: function () {},
  };
  return el;
}

function fakeHtml() {
  const classes = {};
  const attrs = {};
  return {
    lang: 'en',
    classes: classes,
    attrs: attrs,
    classList: {
      add: function (c) { classes[c] = true; },
      remove: function (c) { delete classes[c]; },
      contains: function (c) { return !!classes[c]; },
    },
    setAttribute: function (k, v) { attrs[k] = String(v); },
    getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null; },
    removeAttribute: function (k) { delete attrs[k]; },
    style: {},
  };
}

/* load(o) -> the sandbox and the handles the cases need.
 *
 *   o.src       {'login.js': '<source>'} — the mutation seam
 *   o.answers   the queue Sync.login answers from, one per call
 *   o.creds     this device's PIN map, as localStorage holds it
 *   o.recent    the ids in 'gs-recent'
 *   o.token     the user id a persisted token names, '' for none
 *   o.lang      the document language
 *   o.roster    what `Sync.roster()` answers: an array resolves, 'hang' never
 *               answers at all, and ABSENT REJECTS — which is a device with no
 *               network, and so is the default a case gets unless it says
 *               otherwise.
 */
function load(o) {
  o = o || {};
  const html = fakeHtml();
  html.lang = o.lang || 'en';
  const app = fakeEl();
  // #app is dark while the scripts load, which is what keeps boot.js from
  // booting — the same trick, for the same reason, as test_v2_boot.js's stub.
  let appLive = false;

  const ls = { _d: {}, writes: [] };
  ls.getItem = function (k) { return Object.prototype.hasOwnProperty.call(ls._d, k) ? ls._d[k] : null; };
  // The KEY is recorded, never the value: nothing in this suite may hold a PIN.
  ls.setItem = function (k, v) { ls.writes.push(k); ls._d[k] = String(v); };
  ls.removeItem = function (k) { delete ls._d[k]; };
  if (o.creds) { ls.setItem('creds', JSON.stringify(o.creds)); ls.writes.length = 0; }
  if (o.recent) { ls.setItem('gs-recent', JSON.stringify(o.recent)); ls.writes.length = 0; }

  const timers = [];
  const logins = [];
  const rosters = [];
  const bulkPuts = [];
  const warms = [];
  const actors = [];
  const logouts = [];
  const mounted = [];
  const loaded = [];
  const errors = [];
  const answers = (o.answers || []).slice();
  let token = o.token === undefined ? '' : o.token;
  let syncOpts = null;
  let syncStarts = 0;

  const Sync = {
    login: function (id, pin, opts) {
      logins.push({ id: id, pin: pin, opts: opts || {} });
      const a = answers.length ? answers.shift() : { offline: true };
      if (a && a.throws) return Promise.reject(new Error('network'));
      if (a && a.user) token = a.user.id;
      return Promise.resolve(a);
    },
    warmUp: function () { warms.push(Date.now()); },
    /* The untokened roster. It takes no arguments and is handed no token by the
     * stub on purpose: a case that could pass one would be a case that could
     * hide the whole point of this endpoint. */
    roster: function () {
      rosters.push(Date.now());
      if (o.roster === 'hang') return new Promise(function () {});
      if (o.roster === undefined) return Promise.reject(new Error('offline'));
      return Promise.resolve(o.roster);
    },
    setActor: function (id) { actors.push(id); },
    logout: function () { logouts.push(1); token = ''; },
    tokenUser: function () { return token; },
    info: function () { return { lastRev: 1, tableMax: 1, notStored: 0 }; },
    start: function (opts) { syncStarts++; syncOpts = opts; return true; },
  };

  /* Live, not tombstoned. `DB.all` hides a deleted record and `DB._rawAll` does
   * not, and the difference is the whole of "a removed account must stay
   * removed": a stub where the two agreed would make that rule untestable. */
  const live = (store) => ((o.db && o.db[store]) || []).filter((r) => r && !r._deleted);

  const DB = {
    get: function (store, id) {
      const rows = live(store);
      for (let i = 0; i < rows.length; i++) if (rows[i].id === id) return Promise.resolve(rows[i]);
      return Promise.resolve(null);
    },
    all: function (store) { return Promise.resolve(live(store).slice()); },
    // Tombstones included — see `live` above.
    _rawAll: function (store) { return Promise.resolve(((o.db && o.db[store]) || []).slice()); },
    /* The write the roster takes. The arguments are RECORDED as well as applied,
     * because `notify` and `stamp` being false is the difference between a row
     * the first real pull overrules and a row that is pushed back at the server
     * as this device's own work. */
    bulkPut: function (store, arr, notify, stamp) {
      bulkPuts.push({ store: store, rows: (arr || []).slice(), notify: notify, stamp: stamp });
      if (!o.db) o.db = {};
      if (!o.db[store]) o.db[store] = [];
      (arr || []).forEach(function (r) { o.db[store].push(r); });
      return Promise.resolve((arr || []).length);
    },
    dirtySnapshot: function () { return new Set(); },
    clearDirty: function () {},
  };

  const sandbox = {
    navigator: { onLine: o.online === false ? false : true, userAgent: 'node', language: 'en' },
    location: { href: 'http://localhost/v2/', origin: 'http://localhost', pathname: '/v2/' },
    document: {
      documentElement: html,
      title: '',
      activeElement: null,
      addEventListener: function (type, fn) {
        (sandbox.__h[type] || (sandbox.__h[type] = [])).push(fn);
      },
      removeEventListener: function () {},
      getElementById: function (id) { return (appLive && id === 'app') ? app : null; },
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; },
      createElement: function () { return fakeEl(); },
      head: { appendChild: function () {} },
      body: null,
    },
    __h: {},
    __w: [],
    addEventListener: function (type) { sandbox.__w.push(type); },
    removeEventListener: function () {},
    /* Timers are RECORDED, not run. The pad's "waking the server" line is on a
     * five-second timer and the frame's redraw on a 120 ms one; a suite that
     * waited for either would be slow and, worse, would pass or fail by how
     * busy the machine was. */
    setTimeout: function (fn, ms) { const t = { fn: fn, ms: ms, dead: false }; timers.push(t); return t; },
    clearTimeout: function (t) { if (t) t.dead = true; },
    setInterval: function () { return 0; }, clearInterval: function () {},
    localStorage: ls,
    matchMedia: function () { return { matches: false, addEventListener: function () {}, addListener: function () {} }; },
    console: { warn: function () {}, error: function (m) { errors.push(String(m)); }, info: function () {}, log: function () {} },
    Math: Math, JSON: JSON, Promise: Promise, Date: Date,
    Sync: Sync,
    DB: DB,
    PullApply: { FIRST_STORES: ['meta', 'users'], replicaState: function () { return { behind: 0, complete: true }; } },
    Cache: {
      load: function (names) {
        loaded.push(names ? names.slice() : null);
        /* Faithful in the two ways the login depends on: a store that is read is
         * no longer `undefined` even when the device holds nothing in it, and
         * the fill happens when the promise RESOLVES rather than on the way in.
         * A synchronous fake would make the in-flight guard untestable, which
         * is how a read-per-redraw mutant survived the first run of this. */
        return Promise.resolve().then(function () {
          (names || []).forEach(function (n) {
            if (sandbox.S) sandbox.S.cache[n] = live(n).slice();
          });
          return sandbox.S ? sandbox.S.cache : {};
        });
      },
      prune: function () { return Promise.resolve(0); },
      sig: function () { return ''; },
    },
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;

  const ctx = vm.createContext(sandbox);
  for (const f of SRC) {
    const src = (o.src && o.src[f] !== undefined) ? o.src[f] : read(V2(f));
    vm.runInContext(src, ctx, { filename: V2(f) });
  }

  /* The thirteen, as modules that draw nothing. `Router.go` refuses a screen
   * whose module never registered — that is the third of its three
   * deny-by-default refusals — so without these the route could not move at
   * all and every check on where a login LANDS would pass by doing nothing. */
  if (sandbox.Caps && sandbox.Router) {
    Object.keys(sandbox.Caps.SCREENS).forEach(function (id) {
      sandbox.Router.register(id, { render: function () { return ''; } });
    });
  }

  return {
    win: sandbox,
    Login: sandbox.Login,
    Shell: sandbox.Shell,
    Boot: sandbox.Boot,
    Router: sandbox.Router,
    Caps: sandbox.Caps,
    S: sandbox.S,
    html: html,
    app: app,
    ls: ls,
    logins: logins,
    rosters: rosters,
    bulkPuts: bulkPuts,
    rows: function (store) { return ((o.db && o.db[store]) || []).slice(); },
    warms: warms,
    actors: actors,
    logouts: logouts,
    errors: errors,
    loaded: loaded,
    timers: timers,
    handlers: sandbox.__h,
    winListeners: sandbox.__w,
    syncStarts: function () { return syncStarts; },
    syncOpts: function () { return syncOpts; },
    open: function () { appLive = true; },
    // Run every timer at or under `ms` that has not been cleared.
    run: function (ms) {
      const due = timers.filter(function (t) { return !t.dead && t.ms <= (ms == null ? 0 : ms); });
      due.forEach(function (t) { t.dead = true; });
      due.forEach(function (t) { t.fn(); });
    },
  };
}

/* The shell's model, which is what `Shell.mount` hands the login's render. */
function model(o) {
  o = o || {};
  return {
    route: 'login', params: null, role: null,
    density: o.density || 'yard',
    user: o.user || null,
    cache: o.cache === undefined ? {} : o.cache,
    replica: { behind: 0, complete: true }, stale: false,
    offline: o.offline === true,
  };
}

const person = (id, name, role) => ({ id: id, name: name, role: role });

/* A roster with every role that signs in, and more than six of one of them so
 * the search box has something to appear over. */
function roster() {
  const out = [person('u-owner', 'Ramesh Gupta', 'owner'),
               person('u-sup', 'Mohan Lal', 'supervisor'),
               person('u-cm', 'Suresh Yadav', 'crewmanager'),
               person('u-off', 'Priya Sharma', 'office'),
               person('u-store', 'Vikas Jain', 'store'),
               person('u-m1', 'Arun Kumar', 'mechanic')];
  for (let i = 1; i <= 9; i++) out.push(person('u-d' + i, 'Driver ' + i, 'driver'));
  return out;
}

const count = (html, re) => (String(html).match(re) || []).length;

// Every `data-act` value in a string of markup, in order.
const acts = (html) => [...String(html).matchAll(/data-act="([^"]+)"/g)].map((m) => m[1]);

/* Type digits through the module's own key handler, which is the path a tap and
 * a keystroke both arrive on. */
async function type(l, digits) {
  for (const d of digits) { l.Login._key(d); await flush(); }
  await flush(); await flush();
}

/* ===================================================================================================
 * 1. WHERE THE FILE IS, AND WHAT IT IS NOT
 * =================================================================================================== */

const SOURCE = read(V2('login.js'));

test('the login lives beside boot.js and shell.js, not in v2/screens/', () => {
  assert(fs.existsSync(V2('login.js')), 'v2/login.js must exist');
  assert(!fs.existsSync(V2('screens', 'login.js')),
         'a file in screens/ would put readdirSync(v2/screens) and Caps.SCREENS permanently at odds');
});

/* Comments are blanked rather than deleted, so a reported line number still
 * points at the real line — the reason scripts/check-floor.py gives, and the
 * reason it matters here: this file's header explains both absences in prose,
 * and a check that cannot tell a call from a note about one blocks honest
 * comments and teaches people to delete checks.
 *
 * IT HAS TO UNDERSTAND REGEX LITERALS, and that is not tidiness.
 *
 * It tracked strings and not regexes, and `esc()` holds `.replace(/"/g, …)`.
 * That quote read as the start of a string, so the scanner went blind from
 * there to the next `"` anywhere in the file — about 180 lines, which is most
 * of this screen. Everything in that window was invisible to the three checks
 * built on `CODE`, including the one that says nothing in the login may read
 * the capability table. It was not caught earlier because the window happened
 * to fall between the things those checks were looking for; adding a paragraph
 * of prose inside it is what moved it. A check with a blind spot that moves
 * when a comment is edited is worse than no check, so the fixture below proves
 * both halves: a mention inside a comment after a regex is still stripped, and
 * a real read after one is still found.
 *
 * `/` is a regex only where a value cannot be: after an operator, an opening
 * bracket, a separator, or one of the keywords. After an identifier, a number
 * or a closing bracket it is division. */
const RE_AFTER = /[(,=:[!&|?{};+\-*%~^<>]/;
const RE_AFTER_WORD = /(?:^|[^\w$])(?:return|typeof|case|in|of|new|delete|void|do|else|yield|await|instanceof)$/;

function stripComments(src) {
  const out = src.split('');
  let i = 0, line = false, block = false, str = false, re = false, cls = false, q = '';
  // The code seen so far, with strings, regexes and comments left out of it:
  // what the `/` below has to be judged against.
  let code = '';
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (line) { if (src[i] === '\n') line = false; else out[i] = ' '; i++; continue; }
    if (block) { if (two === '*/') { out[i] = out[i + 1] = ' '; block = false; i += 2; continue; }
                 if (src[i] !== '\n') out[i] = ' '; i++; continue; }
    if (str) { if (src[i] === '\\') { i += 2; continue; } if (src[i] === q) str = false; i++; continue; }
    if (re) {
      // A character class may hold an unescaped `/`, so `[...]` is tracked too.
      if (src[i] === '\\') { i += 2; continue; }
      if (src[i] === '[') cls = true;
      else if (src[i] === ']') cls = false;
      else if (src[i] === '/' && !cls) re = false;
      i++; continue;
    }
    if (two === '//') { line = true; out[i] = out[i + 1] = ' '; i += 2; continue; }
    if (two === '/*') { block = true; out[i] = out[i + 1] = ' '; i += 2; continue; }
    if (src[i] === '/') {
      const before = code.replace(/\s+$/, '');
      if (before === '' || RE_AFTER.test(before.slice(-1)) || RE_AFTER_WORD.test(before)) {
        re = true; cls = false; i++; continue;
      }
    }
    if (src[i] === '"' || src[i] === "'" || src[i] === '`') { str = true; q = src[i]; i++; continue; }
    code += src[i];
    i++;
  }
  return out.join('');
}

test('the comment stripper is not blinded by a quote inside a regex literal', () => {
  // The exact shape of esc(), followed by the two things the checks below look
  // for. Before the regex pass, everything after that first regex was unread.
  const fixture = ['function esc(s) { return String(s).replace(/"/g, "&quot;"); }',
                   '/* a comment mentioning Caps and Router.register */',
                   'var x = Caps.screensFor("owner");',
                   'var n = total / 2 / 3;'].join('\n');
  const out = stripComments(fixture);
  assert.strictEqual(out.indexOf('a comment mentioning'), -1, 'the comment is still stripped');
  assert(/\bCaps\s*\.\s*screensFor/.test(out), 'and a real read after a regex is still found');
  assert(out.indexOf('total / 2 / 3') >= 0, 'division is not a regex: ' + JSON.stringify(out));
});

const CODE = stripComments(SOURCE);

test('it registers no route and reads no capability — it is reached holding none', () => {
  assert(!/Router\s*\.\s*register\s*\(/.test(CODE), 'the login must not register a route');
  assert(!/\bCaps\b/.test(CODE), 'nothing here may read or write the capability table');
  const caps = stripComments(read(V2('caps.js')));
  assert(!/['"]login['"]\s*:/.test(caps), 'login must not appear in caps.js');
  assert(!/\blogin\b\s*:/.test(caps), 'nor as a bare key');
});

test('render(model) is a pure function returning a string', () => {
  const l = load();
  assert.strictEqual(typeof l.Login.render, 'function');
  assert.strictEqual(typeof l.Login.mount, 'function');
  const m = model({ cache: { users: roster() } });
  const a = l.Login.render(m), b = l.Login.render(m);
  assert.strictEqual(typeof a, 'string');
  assert.strictEqual(a, b, 'two renders of one model must be the same string');
});

test('mount() against a document that is not there returns false rather than throwing', () => {
  // The browser branch calls mount() at load. Six screens learnt what happens
  // when that touches a DOM which is not up yet; this is the shape that cannot.
  const l = load();
  assert.strictEqual(typeof l.Login.mount, 'function');
  const src = SOURCE.slice(SOURCE.lastIndexOf('module.exports'));
  assert(/root\.Login\s*=\s*api/.test(src), 'the browser branch must publish root.Login');
  assert(/\bmount\(\)/.test(src), 'the browser branch must install the listener at load');
});

/* ===================================================================================================
 * 2. THE FIELD GUARD, which predeploy-gate.sh scans screens/ for and so misses
 * =================================================================================================== */

/* The gate's loop is `for _f in v2/screens/*.js`, so this file is outside it.
 * Both of its conditions are therefore applied here instead, in the same two
 * halves, because the rule is not about where the file sits: a field inside a
 * pressable surface that moves the route is what threw the storekeeper off the
 * screen mid-count, and this screen holds a search input. */
test('the login declares the field selector, exactly as the gate requires of a screen', () => {
  assert(SOURCE.indexOf('input, select, textarea, label, .num') >= 0,
         'the field selector must be in the file, inline or named');
});

test('…and guards a field BEFORE it reads data-act', () => {
  const lines = SOURCE.split('\n');
  let guard = -1, act = -1;
  for (let i = 0; i < lines.length; i++) {
    if (act < 0 && /closest\('\[data-(act|nav)\]'\)/.test(lines[i])) act = i;
    if (guard < 0 && /closest\(/.test(lines[i]) && !/closest\('\[data-/.test(lines[i])) guard = i;
  }
  assert(act >= 0, 'the handler must read data-act at all');
  assert(guard >= 0 && guard < act,
         'a guard that runs after the [data-act] read is not a guard (guard=' + guard + ' act=' + act + ')');
});

test('a click that starts in a field moves nothing', () => {
  const l = load({ db: { users: roster() } });
  l.S.cache.users = roster();
  const h = l.handlers.click;
  assert.strictEqual(h.length, 1, 'the login must install exactly ONE delegated click listener');
  l.Login._reset();
  l.Login._goto('who', 'driver', null);
  let prevented = false;
  h[0]({
    target: {
      closest: function (sel) {
        if (sel === 'input, select, textarea, label, .num') return {};
        // Everything else answers too: if the guard were not first, the act
        // below would fire and the step would move.
        return { getAttribute: function () { return 'role'; } };
      },
    },
    preventDefault: function () { prevented = true; },
  });
  assert.strictEqual(l.Login._step().step, 'who', 'a tap in a field must not move the step');
  assert.strictEqual(prevented, false, 'and must not even be swallowed');
});

/* ===================================================================================================
 * 3. THE THREE STEPS
 * =================================================================================================== */

test('step 1 draws one row per role that has a user, and none for a role that has none', () => {
  const l = load();
  const list = roster().filter(function (u) { return u.role !== 'conductor'; });
  const html = l.Login.render(model({ cache: { users: list } }));
  assert.strictEqual(count(html, /data-act="role"/g), 7,
                     'seven of the eight roles have somebody in this roster, so seven rows');
  assert(html.indexOf('data-role="driver"') >= 0);
  assert.strictEqual(html.indexOf('data-role="conductor"'), -1,
                     'a role with nobody in it is not a door');
});

test('…with the count of people in that role on the row', () => {
  const l = load();
  const html = l.Login.render(model({ cache: { users: roster() } }));
  const row = /data-role="driver"[\s\S]*?<\/a>/.exec(html)[0];
  assert(row.indexOf('<span class="badge">9</span>') >= 0, 'nine drivers: ' + row);
});

test('the users store still filling draws a skeleton, and asks the STORE rather than the server', () => {
  /* The whole of §3.6 on the one screen where the difference is the app looking
   * broken: `undefined` is "not read yet" and `[]` is "nobody is here".
   *
   * The second half is what keeps the two apart now that both draw a skeleton
   * (see section 9): a store nobody has finished reading is read, and the
   * untokened roster request is NOT sent for it. Collapsing `undefined` into
   * `[]` sends that request on the first paint of every device in the garage. */
  const l = load({ roster: roster() });
  const filling = l.Login.render(model({ cache: {} }));
  assert(filling.indexOf('aria-busy="true"') >= 0, 'still filling must draw the skeleton');
  assert.strictEqual(count(filling, /data-act="role"/g), 0);
  assert.strictEqual(l.loaded.length, 1, 'the local store is read');
  assert.strictEqual(l.rosters.length, 0,
                     'and the server is not asked for a store this device has not finished reading');
});

test('…and a device that genuinely holds nobody says so in a sentence, once it has asked', async () => {
  // No `roster` answer in the options, so the ask rejects: a phone with no
  // network. The sentence is what it lands on, and only after the asking.
  const l = load();
  l.Login.render(model({ cache: { users: [] } }));
  await flush(); await flush();
  const none = l.Login.render(model({ cache: { users: [] } }));
  assert(none.indexOf('aria-busy="true"') < 0, 'empty is not loading');
  assert(none.indexOf('class="state empty"') >= 0, 'zero must be a sentence, not a blank space');
});

test('recent on this phone is drawn from this device, capped, and newest first', () => {
  const l = load({ recent: ['u-d3', 'u-store', 'u-owner', 'u-sup', 'u-cm', 'u-off'] });
  const html = l.Login.render(model({ cache: { users: roster() } }));
  const recents = [...html.matchAll(/data-act="recent" data-who="([^"]+)"/g)].map((m) => m[1]);
  assert.deepStrictEqual(recents, ['u-d3', 'u-store', 'u-owner', 'u-sup'],
                         'four, in the order this phone remembers them');
});

test('…and no recent users is a sentence too, never an empty list drawn as nothing', () => {
  const l = load({ recent: [] });
  const html = l.Login.render(model({ cache: { users: roster() } }));
  assert.strictEqual(count(html, /data-act="recent"/g), 0);
  assert(html.indexOf('signed in on this phone') >= 0,
         'zero and unknown must not look alike: ' + html.slice(0, 400));
});

test('step 2 lists that role only, by name, and every row is reachable by keyboard', () => {
  const l = load();
  l.Login._goto('who', 'driver', null);
  const html = l.Login.render(model({ cache: { users: roster() } }));
  const who = [...html.matchAll(/data-act="who" data-who="([^"]+)"/g)].map((m) => m[1]);
  assert.strictEqual(who.length, 9, 'nine drivers and nobody else');
  assert(who.every(function (id) { return id.indexOf('u-d') === 0; }), String(who));
  assert.strictEqual(count(html, /<a class="v2row" href="#"/g), 9,
                     'rows are anchors with an href, so a keyboard reaches them');
  assert(html.indexOf('data-act="back"') >= 0, 'step 2 can be walked back');
  assert(html.indexOf('class="lg-crumb"') >= 0, 'and says which step it is');
});

test('the search box appears past six names and not at six', () => {
  const l = load();
  const six = roster().filter(function (u) { return u.role !== 'driver'; })
    .concat([person('u-d1', 'Driver 1', 'driver')]);
  l.Login._goto('who', 'owner', null);
  assert.strictEqual(count(l.Login.render(model({ cache: { users: roster() } })), /lg-search/g), 0,
                     'one owner needs no search box');
  l.Login._goto('who', 'driver', null);
  assert.strictEqual(count(l.Login.render(model({ cache: { users: roster() } })), /lg-search/g), 1,
                     'nine drivers do');
  const sixDrivers = [];
  for (let i = 1; i <= 6; i++) sixDrivers.push(person('u-d' + i, 'Driver ' + i, 'driver'));
  assert.strictEqual(count(l.Login.render(model({ cache: { users: sixDrivers } })), /lg-search/g), 0,
                     'six is not past six');
  assert(six.length > 0);
});

test('the search filters the list, and survives the redraw that comes with it', () => {
  const l = load();
  l.Login._goto('who', 'driver', null);
  const m = model({ cache: { users: roster() } });
  const h = l.handlers.input;
  assert(h && h.length === 1, 'one field handler, bound to input and change');
  h[0]({ target: { getAttribute: function (k) { return k === 'data-lg-find' ? '' : null; }, value: 'river 7' } });
  const html = l.Login.render(m);
  assert.strictEqual(count(html, /data-act="who"/g), 1, 'one name matches "river 7"');
  assert(html.indexOf('value="river 7"') >= 0,
         'the query is in module state, so a four-second sync tick cannot take it away');
});

test('…and a search that matches nobody says so rather than drawing an empty list', () => {
  const l = load();
  l.Login._goto('who', 'driver', null);
  l.handlers.input[0]({ target: { getAttribute: function () { return ''; }, value: 'zzz' } });
  const html = l.Login.render(model({ cache: { users: roster() } }));
  assert(html.indexOf('class="state empty"') >= 0, 'no match is a sentence');
});

test('a name out of the store is escaped, not trusted', () => {
  const l = load();
  const nasty = '<img src=x onerror=alert(1)>';
  l.Login._goto('who', 'driver', null);
  const html = l.Login.render(model({ cache: { users: [person('u-d1"&', nasty, 'driver')] } }));
  assert(html.indexOf(nasty) < 0, 'a name is data, and this store is written by eight roles');
  assert(html.indexOf('&lt;img') >= 0, 'it is drawn, escaped: ' + html.slice(html.indexOf('v2row'), 300));
  assert(html.indexOf('data-who="u-d1&quot;&amp;"') >= 0, 'and so is an id with a quote in it');
});

test('a click outside this screen is not this screen\'s business', () => {
  // After a sign-in the thirteen screens share `data-act` with this one, and
  // this listener is never removed (INTEGRATION-NOTES 17). The scope check is
  // what keeps another screen's act out of the login's handler.
  const l = load();
  l.Login._goto('who', 'driver', null);
  l.handlers.click[0]({
    target: { closest: function (sel) {
      if (sel === 'input, select, textarea, label, .num') return null;
      if (sel === '[data-screen="login"]') return null;        // somewhere else entirely
      return { getAttribute: function () { return 'back'; } };
    } },
    preventDefault: function () {},
  });
  assert.strictEqual(l.Login._step().step, 'who', 'the step did not move');
});

test('…and a click that IS this screen\'s swallows the anchor\'s default', () => {
  const l = load();
  let prevented = false;
  l.handlers.click[0]({
    target: { closest: function (sel) {
      if (sel === 'input, select, textarea, label, .num') return null;
      if (sel === '[data-screen="login"]') return {};
      return { getAttribute: function (k) { return k === 'data-act' ? 'role' : 'driver'; } };
    } },
    preventDefault: function () { prevented = true; },
  });
  assert.strictEqual(prevented, true,
                     'the rows carry href="#" so a keyboard reaches them; the href is never followed');
  assert.strictEqual(l.Login._step().step, 'who');
});

/* ===================================================================================================
 * 4. THE PAD, AND THE PIN THAT NEVER REACHES IT
 * =================================================================================================== */

test('every class drawn is one v2/ui/login.css actually defines', () => {
  /* The brief lists `.pinpad` and `.userpick` among the `.lg*` family; both
   * occur in that file in COMMENTS only, where it explains why this keypad does
   * not reuse v1's names. A class the stylesheet does not carry is a class that
   * styles nothing, and on this screen that is a keypad with no keys. */
  const css = read(V2('ui', 'login.css'));
  const defined = new Set((css.replace(/\/\*[\s\S]*?\*\//g, '').match(/\.[a-zA-Z][\w-]*/g) || [])
    .map(function (c) { return c.slice(1); }));
  const l = load();
  let html = '';
  [['role', null], ['who', 'driver'], ['pin', 'driver']].forEach(function (st) {
    l.Login._goto(st[0], st[1], person('u-d1', 'Driver 1', 'driver'));
    html += l.Login.render(model({ cache: { users: roster() } }));
  });
  const used = new Set();
  [...html.matchAll(/class="([^"]+)"/g)].forEach(function (m) {
    m[1].split(/\s+/).forEach(function (c) { if (c) used.add(c); });
  });
  // The system's own component classes live in components.css and states.css.
  const system = new Set(['v2row', 'btn', 'btn-primary', 'btn-quiet', 'badge', 'field',
                          'lead', 't', 'sub', 'act', 'state', 'empty', 'state-text',
                          'state-hint', 'skeleton', 'skeleton-row', 'skeleton-bar',
                          'skeleton-bar-short', 'skeleton-label']);
  const orphans = [...used].filter(function (c) {
    return c.indexOf('lg') === 0 && !defined.has(c);
  }).concat([...used].filter(function (c) {
    return c.indexOf('lg') !== 0 && !system.has(c) && !defined.has(c);
  }));
  assert.deepStrictEqual(orphans, [], 'classes nothing styles: ' + orphans);
});

test('four dots, and the number lit is the number of digits entered', () => {
  const l = load();
  l.Login._goto('pin', 'driver', person('u-d1', 'Driver 1', 'driver'));
  const m = model({ cache: { users: roster() } });
  assert.strictEqual(count(l.Login.render(m), /class="lg-dot"/g), 4, 'four empty dots');
  l.Login._key('3'); l.Login._key('7');
  const two = l.Login.render(m);
  assert.strictEqual(count(two, /class="lg-dot on"/g), 2);
  assert.strictEqual(count(two, /class="lg-dot"/g), 2);
  l.Login._key('back');
  assert.strictEqual(count(l.Login.render(m), /class="lg-dot on"/g), 1, 'and backspace puts one out');
});

test('a new digit clears the last refusal, so nobody retypes under an old answer', async () => {
  const l = load({ answers: [{ rejected: true, known: true }] });
  l.Login._goto('pin', 'driver', person('u-d1', 'Driver 1', 'driver'));
  await type(l, WRONG);
  assert.strictEqual(l.Login._step().note, 'lgWrongPin');
  l.Login._key('3');
  assert.strictEqual(l.Login._step().note, null, 'the sentence goes when the next try starts');
});

test('THE PIN IS NEVER DRAWN: typing four of a digit adds none of it to the markup', () => {
  const l = load({ answers: [{ offline: true }] });
  l.Login._goto('pin', 'driver', person('u-d1', 'Driver 1', 'driver'));
  const m = model({ cache: { users: roster() } });
  const before = l.Login.render(m);
  const base = count(before, /7/g);
  l.Login._key('7'); l.Login._key('7'); l.Login._key('7');
  const after = l.Login.render(m);
  assert.strictEqual(count(after, /7/g), base,
                     'the pad holds one 7 — its own key label — before and after three are typed');
  assert(after.indexOf('aria-label="3 of 4 digits entered"') >= 0,
         'the accessible name is the COUNT, which is what a reader is owed and all they are owed');
});

test('…and nothing on the pad echoes a key that was pressed', () => {
  const l = load();
  l.Login._goto('pin', 'driver', person('u-d1', 'Driver 1', 'driver'));
  const m = model({ cache: { users: roster() } });
  const ks = [...l.Login.render(m).matchAll(/data-k="([^"]+)"/g)].map((x) => x[1]);
  assert.deepStrictEqual(ks, ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'ok'],
                         'twelve fixed key labels and nothing else');
  l.Login._key('3');
  const ks2 = [...l.Login.render(m).matchAll(/data-k="([^"]+)"/g)].map((x) => x[1]);
  assert.deepStrictEqual(ks2, ks, 'pressing a key changes no attribute on the pad');
});

test('the pad says the request is away the moment the fourth digit lands', async () => {
  let release;
  const l = load({ answers: [] });
  l.win.Sync.login = function () {
    return new Promise(function (r) { release = function () { r({ rejected: true, known: true }); }; });
  };
  l.Login._goto('pin', 'driver', person('u-d1', 'Driver 1', 'driver'));
  const m = model({ cache: { users: roster() } });
  await type(l, GOOD);
  const mid = l.Login.render(m);
  assert(mid.indexOf('data-working="1"') >= 0, 'login.css draws the wait off this attribute');
  assert.strictEqual(count(mid, /class="lg-dot on"/g), 4, 'and all four dots are lit while it waits');
  release();
  await flush(); await flush();
});

test('the fourth digit submits on its own, once, and a fifth is not taken', async () => {
  const l = load({ answers: [{ rejected: true, known: true }] });
  l.Login._goto('pin', 'driver', person('u-d1', 'Driver 1', 'driver'));
  await type(l, GOOD);
  assert.strictEqual(l.logins.length, 1, 'one request for four digits');
  assert.strictEqual(l.logins[0].pin.length, 4);
  assert.strictEqual(l.Login._step().digits, 0, 'and the pad is cleared for the next try');
});

test('the keyboard reaches the pad, because the office machines are desktops', async () => {
  const l = load({ answers: [{ rejected: true, known: true }] });
  l.Login._goto('pin', 'driver', person('u-d1', 'Driver 1', 'driver'));
  const h = l.handlers.keydown;
  assert(h && h.length === 1, 'one keydown handler');
  h[0]({ key: '3', preventDefault: function () {} });
  h[0]({ key: '7', preventDefault: function () {} });
  assert.strictEqual(l.Login._step().digits, 2, 'typing is the same input as tapping');
  h[0]({ key: 'Backspace', preventDefault: function () {} });
  assert.strictEqual(l.Login._step().digits, 1);
});

test('…and it is deaf on every other step, so it cannot reach the thirteen screens', () => {
  const l = load();
  l.Login._goto('who', 'driver', null);
  l.handlers.keydown[0]({ key: '3', preventDefault: function () {} });
  assert.strictEqual(l.Login._step().digits, 0, 'nothing is a PIN until the pad is open');
  l.Login._reset();
  l.handlers.keydown[0]({ key: '7', preventDefault: function () {} });
  assert.strictEqual(l.Login._step().digits, 0);
});

test('…and a digit typed into the name search is a digit in a NAME, not in a PIN', () => {
  const l = load();
  l.Login._goto('pin', 'driver', person('u-d1', 'Driver 1', 'driver'));
  // The caret is in a field. v1's pad had no field to compete with; this one does.
  l.win.document.activeElement = { closest: function (sel) {
    return sel === 'input, select, textarea, label, .num' ? {} : null; } };
  l.handlers.keydown[0]({ key: '3', preventDefault: function () {} });
  assert.strictEqual(l.Login._step().digits, 0);
});

test('every word this screen draws is an id, and every role has one', () => {
  const l = load();
  const table = l.win.W.entry;
  ['owner', 'supervisor', 'crewmanager', 'office', 'store', 'mechanic', 'driver', 'conductor']
    .forEach(function (r) {
      const html = l.Login.render(model({ cache: { users: [person('u-x', 'Somebody', r)] } }));
      assert(html.indexOf('data-role="' + r + '"') >= 0, r + ' has no door');
      /* AND THE DOOR HAS A NAME ON IT. Without this the eight rows render with
       * an empty `.t` — eight identical, unlabelled, unpickable rows, which is
       * what this check found on the first run of it. */
      const row = new RegExp('data-role="' + r + '"[\\s\\S]*?<\\/a>').exec(html)[0];
      const label = /<span class="t">([^<]*)<\/span>/.exec(row);
      assert(label && label[1].trim() !== '', r + ' has an unlabelled row: ' + row);
    });
  // Registered through W, so test_v2_words.js's parity scan reads this table the
  // same way it reads every other one.
  assert(/\bW\s*\.\s*register\s*\(/.test(CODE), 'the words must go through W.register');
  assert(typeof table === 'function' && table('lgRoleCrewManager') !== null,
         'the crew manager\'s label is in the table, not hard-coded at the point of use');
});

/* ===================================================================================================
 * 5. THE AUTHENTICATION CONTRACT — one row per answer Sync.login gives
 * =================================================================================================== */

test('success enters the app, as the person the SERVER vouched for', async () => {
  const server = person('u-d1', 'Driver One', 'driver');
  const l = load({ answers: [{ token: 't', user: server }], db: { users: roster() } });
  l.Login._goto('pin', 'driver', person('u-d1', 'stale local name', 'conductor'));
  await type(l, GOOD);
  await flush();
  assert.strictEqual(l.S.user && l.S.user.role, 'driver',
                     'the role comes from the server, not from a local row that may be weeks old');
  assert.deepStrictEqual(l.actors, ['u-d1'], 'and local edits are now signed by them');
  assert.deepStrictEqual(JSON.parse(l.ls.getItem('gs-recent')), ['u-d1']);
});

test('…and the login is holding nothing afterwards — no PIN, no name, no step', async () => {
  const l = load({ answers: [{ token: 't', user: person('u-d1', 'Driver One', 'driver') }],
                   db: { users: roster() } });
  l.Login._goto('pin', 'driver', person('u-d1', 'Driver One', 'driver'));
  await type(l, GOOD);
  await flush();
  const s = l.Login._step();
  assert.strictEqual(s.digits, 0, 'a signed-in session must not be holding a PIN');
  assert.strictEqual(s.step, 'role');
  assert.strictEqual(s.who, null);
  assert.strictEqual(s.query, '');
});

test('REJECTED AND KNOWN IS FINAL: the device PIN is not tried even when it matches', async () => {
  // The heart of the slice. The server holds this account and said no, so the
  // copy on the phone is a credential somebody has already rotated.
  const l = load({ answers: [{ rejected: true, known: true }],
                   creds: { 'u-d1': GOOD.join('') } });
  l.Login._goto('pin', 'driver', person('u-d1', 'Driver 1', 'driver'));
  await type(l, GOOD);
  assert.strictEqual(l.S.user, null, 'a PIN the server is sure about stays wrong offline');
  assert.strictEqual(l.Login._step().note, 'lgWrongPin');
  assert.strictEqual(l.logins.length, 1, 'and it is not retried');
});

test('…and the stale copy on this phone is dropped, so it cannot outrank the server later', async () => {
  const l = load({ answers: [{ rejected: true, known: true }],
                   creds: { 'u-d1': GOOD.join(''), 'u-d2': GOOD.join('') } });
  l.Login._goto('pin', 'driver', person('u-d1', 'Driver 1', 'driver'));
  await type(l, GOOD);
  const left = JSON.parse(l.ls.getItem('creds'));
  assert.strictEqual(Object.prototype.hasOwnProperty.call(left, 'u-d1'), false,
                     'the rotated credential is gone from this device');
  assert(Object.prototype.hasOwnProperty.call(left, 'u-d2'),
         'and nobody else on this phone was touched');
});

test('a 403 is refused with its own sentence, and still never falls back', async () => {
  const l = load({ answers: [{ rejected: true, known: true, reason: 'default_pin' }],
                   creds: { 'u-d1': GOOD.join('') } });
  l.Login._goto('pin', 'driver', person('u-d1', 'Driver 1', 'driver'));
  await type(l, GOOD);
  assert.strictEqual(l.Login._step().note, 'lgPinRetired',
                     'a retired PIN is the RIGHT PIN: say what to do, not "wrong PIN"');
  assert.strictEqual(l.S.user, null);
});

test('…and a disabled account says that instead', async () => {
  const l = load({ answers: [{ rejected: true, known: true, reason: 'account_disabled' }] });
  l.Login._goto('pin', 'driver', person('u-d1', 'Driver 1', 'driver'));
  await type(l, GOOD);
  assert.strictEqual(l.Login._step().note, 'lgLoginOff');
});

test('REJECTED AND NOT KNOWN falls back to the device PIN — bulk-seeded crew live only here', async () => {
  const l = load({ answers: [{ rejected: true, known: false }],
                   creds: { 'u-d1': GOOD.join('') }, db: { users: roster() } });
  l.Login._goto('pin', 'driver', person('u-d1', 'Driver 1', 'driver'));
  await type(l, GOOD);
  await flush();
  assert.strictEqual(l.S.user && l.S.user.id, 'u-d1', 'the device validated it');
});

test('…and refuses when the device PIN does not match either', async () => {
  const l = load({ answers: [{ rejected: true, known: false }], creds: { 'u-d1': GOOD.join('') } });
  l.Login._goto('pin', 'driver', person('u-d1', 'Driver 1', 'driver'));
  await type(l, WRONG);
  assert.strictEqual(l.S.user, null);
  assert.strictEqual(l.Login._step().note, 'lgWrongPin');
});

test('a session left by somebody else is dropped rather than signing this person\'s work', async () => {
  const l = load({ answers: [{ rejected: true, known: false }],
                   creds: { 'u-d1': GOOD.join('') }, token: 'u-d9', db: { users: roster() } });
  l.Login._goto('pin', 'driver', person('u-d1', 'Driver 1', 'driver'));
  await type(l, GOOD);
  await flush();
  assert.strictEqual(l.logouts.length, 1, 'the other person\'s token goes before this one enters');
  assert.strictEqual(l.S.user && l.S.user.id, 'u-d1');
});

test('LOCKED says the wait and stops accepting digits', async () => {
  const l = load({ answers: [{ locked: true, retryAfter: 90 }] });
  l.Login._goto('pin', 'driver', person('u-d1', 'Driver 1', 'driver'));
  await type(l, GOOD);
  const s = l.Login._step();
  assert.strictEqual(s.note, 'lgTooMany');
  assert.strictEqual(s.locked, 90, 'the server\'s own wait, not a guess');
  l.Login._key('3'); l.Login._key('7');
  assert.strictEqual(l.Login._step().digits, 0, 'a locked pad takes no more digits');
  assert.strictEqual(l.logins.length, 1, 'and sends nothing further');
});

test('OFFLINE with nothing saved is never a dead keypad — it says why', async () => {
  const l = load({ answers: [{ offline: true }, { offline: true }] });
  l.Login._goto('pin', 'driver', person('u-d1', 'Driver 1', 'driver'));
  await type(l, GOOD);
  assert.strictEqual(l.Login._step().note, 'lgCantReach');
  assert.strictEqual(l.S.user, null);
});

test('…and a throw out of Sync.login is the same answer, not an exception', async () => {
  const l = load({ answers: [{ throws: true }, { throws: true }] });
  l.Login._goto('pin', 'driver', person('u-d1', 'Driver 1', 'driver'));
  await type(l, GOOD);
  await flush();
  assert.strictEqual(l.Login._step().note, 'lgCantReach');
  assert.strictEqual(l.Login._step().working, false, 'and the pad is live again');
});

test('offline with a device PIN that matches signs in on the device alone', async () => {
  const l = load({ answers: [{ offline: true }], creds: { 'u-d1': GOOD.join('') },
                   db: { users: roster() } });
  l.Login._goto('pin', 'driver', person('u-d1', 'Driver 1', 'driver'));
  await type(l, GOOD);
  await flush();
  assert.strictEqual(l.S.user && l.S.user.id, 'u-d1');
  assert.strictEqual(l.logins.length, 1, 'one attempt: a device that can fall back does not retry');
});

/* ===================================================================================================
 * 6. THE THREE WITH NOTHING TO FALL BACK ON
 * =================================================================================================== */

['owner', 'supervisor', 'crewmanager'].forEach(function (role) {
  test('a ' + role + ' waits past a real cold start, because this request IS the login', async () => {
    const l = load({ answers: [{ token: 't', user: person('u-x', 'Somebody', role) }],
                     db: { users: roster() } });
    l.Login._goto('pin', role, person('u-x', 'Somebody', role));
    await type(l, GOOD);
    await flush();
    assert.strictEqual(l.logins[0].opts.timeoutMs, 60000,
                       '8 s times out just under a 30-36 s cold start, which fails ONLY when the '
                       + 'container is cold — and only for the three people who run the garage');
  });

  test('…and no PIN of theirs is ever kept on this phone, nor read from it', async () => {
    const who = person('u-x', 'Somebody', role);
    const l = load({ answers: [{ token: 't', user: who }],
                     creds: { 'u-x': GOOD.join('') }, db: { users: roster() } });
    l.Login._goto('pin', role, who);
    await type(l, GOOD);
    await flush();
    assert.strictEqual(l.logins[0].opts.timeoutMs, 60000,
                       'a cached PIN for one of these three must not shorten their wait');
    const left = JSON.parse(l.ls.getItem('creds'));
    assert.strictEqual(Object.prototype.hasOwnProperty.call(left, 'u-x'), false,
                       'a PIN that opens the whole garage is not left in device storage');
  });
});

test('…and one retry when the first wait ends in silence, for those three only', async () => {
  const l = load({ answers: [{ offline: true }, { token: 't', user: person('u-owner', 'Ramesh', 'owner') }],
                   db: { users: roster() } });
  l.Login._goto('pin', 'owner', person('u-owner', 'Ramesh', 'owner'));
  await type(l, GOOD);
  await flush(); await flush();
  assert.strictEqual(l.logins.length, 2, 'the container was still booting; it is warm now');
  assert.strictEqual(l.logins[1].opts.timeoutMs, 20000);
  assert.strictEqual(l.S.user && l.S.user.id, 'u-owner', 'and the retry turned a failure into a login');
});

test('a crew member who CAN fall back gives up fast instead', async () => {
  const l = load({ answers: [{ offline: true }], creds: { 'u-d1': GOOD.join('') },
                   db: { users: roster() } });
  l.Login._goto('pin', 'driver', person('u-d1', 'Driver 1', 'driver'));
  await type(l, GOOD);
  await flush();
  assert.strictEqual(l.logins[0].opts.timeoutMs, 8000,
                     'waiting a minute in front of a working offline login is the opposite mistake');
});

test('warmUp fires when the PAD OPENS, not when the fourth digit lands', async () => {
  const l = load({ answers: [{ rejected: true, known: true }] });
  assert.strictEqual(l.warms.length, 0);
  l.Login._reset();
  // Through the handler, which is the path a tap takes.
  const h = l.handlers.click;
  h[0]({ target: {
    closest: function (sel) {
      if (sel === 'input, select, textarea, label, .num') return null;
      if (sel === '[data-screen="login"]') return {};
      if (sel === '[data-act]') return { getAttribute: function (k) { return k === 'data-act' ? 'role' : 'driver'; } };
      return null;
    } }, preventDefault: function () {} });
  const atRole = l.warms.length;
  l.Login._goto('pin', 'driver', person('u-d1', 'Driver 1', 'driver'));
  l.win.Sync.warmUp();     // the real screen's toPin() does this; proven below
  assert(l.warms.length > atRole);
  const src = SOURCE;
  const toPin = /function toPin\([\s\S]*?\n  \}/.exec(src)[0];
  assert(/\bwarm\(\)/.test(toPin), 'the wake must be in toPin, not in attempt()');
  const attempt = /async function attempt\([\s\S]*?\n  \}/.exec(src)[0];
  assert(!/\bwarm\(\)/.test(attempt),
         'waking at the fourth digit buys nothing: the container is cold for the whole wait');
});

test('a wait long enough to notice says the server is waking, rather than sitting there', async () => {
  // Five seconds of a frozen pad is what "is it broken?" looks like, and for the
  // three roles with no fallback the honest answer is half a minute.
  let release;
  const l = load();
  l.win.Sync.login = function () {
    return new Promise(function (r) { release = function () { r({ rejected: true, known: true }); }; });
  };
  l.Login._goto('pin', 'owner', person('u-owner', 'Ramesh', 'owner'));
  await type(l, GOOD);
  assert.strictEqual(l.Login._step().note, 'lgChecking');
  l.run(5000);                                   // the timer the pad sets
  assert.strictEqual(l.Login._step().note, 'lgWaking',
                     'the pad admits what it is waiting for');
  release();
  await flush(); await flush();
});

test('…and it is cleared once an answer lands, so the line cannot outlive the wait', async () => {
  const l = load({ answers: [{ rejected: true, known: true }] });
  l.Login._goto('pin', 'owner', person('u-owner', 'Ramesh', 'owner'));
  await type(l, GOOD);
  l.run(5000);
  assert.strictEqual(l.Login._step().note, 'lgWrongPin', 'the answer, not the waiting line');
});

test('ONLY a server-verified PIN is ever written to this device', async () => {
  const l = load({ answers: [{ offline: true }], creds: { 'u-d1': GOOD.join('') },
                   db: { users: roster() } });
  l.Login._goto('pin', 'driver', person('u-d1', 'Driver 1', 'driver'));
  await type(l, GOOD);
  await flush();
  assert.strictEqual(l.S.user && l.S.user.id, 'u-d1', 'the device accepted it');
  assert.strictEqual(l.ls.writes.indexOf('creds'), -1,
                     'a PIN the server never saw is not written back as though it had');
  assert(l.ls.writes.indexOf('gs-recent') >= 0, 'the recent list is still remembered');
});

test('…and it IS written when the server verified it', async () => {
  const l = load({ answers: [{ token: 't', user: person('u-d1', 'Driver One', 'driver') }],
                   db: { users: roster() } });
  l.Login._goto('pin', 'driver', person('u-d1', 'Driver One', 'driver'));
  await type(l, GOOD);
  await flush();
  assert(l.ls.writes.indexOf('creds') >= 0,
         'otherwise the contract\'s own device-PIN row could never be true on a v2-only phone');
});

/* ===================================================================================================
 * 7. THE SHELL SEAM — the other side of the hand-off
 * =================================================================================================== */

test('Shell.mount("login") hands over AND draws: #app is no longer empty', () => {
  const l = load();
  l.open();
  l.S.cache.users = roster();
  assert.strictEqual(l.Shell.mount('login'), true, 'the return contract is unchanged');
  assert(l.html.classList.contains('lg'), 'login.css owns the viewport');
  assert.strictEqual(l.html.getAttribute('data-frame'), null, 'and the frame is gone');
  assert(l.app.innerHTML.indexOf('data-screen="login"') >= 0,
         'INTEGRATION-NOTES 18: the handover was correct and nothing was on the other side');
  assert(l.app.innerHTML.indexOf('data-act="role"') >= 0, 'a person can actually start here');
});

test('…and with no login module on the page it behaves exactly as it did before', () => {
  // The `renderBody` shape: when the module is absent, nothing changes.
  const l = load({ src: { 'login.js': '' } });
  l.open();
  l.app.innerHTML = 'the frame was here';
  assert.strictEqual(l.Shell.mount('login'), true);
  assert.strictEqual(l.app.innerHTML, '', 'still empties #app, still returns true');
  assert(l.html.classList.contains('lg'));
  assert.strictEqual(l.html.getAttribute('data-frame'), null);
});

test('a login whose render throws is one dev line and an empty body, never an exception', () => {
  const broken = SOURCE.replace('function render(m) {', 'function render(m) { throw new Error(1);');
  const l = load({ src: { 'login.js': broken } });
  l.open();
  assert.strictEqual(l.Shell.mount('login'), true, 'mount must not throw out');
  assert.strictEqual(l.app.innerHTML, '');
  assert.strictEqual(l.errors.length, 1, 'and the reason reaches a console: ' + l.errors);
});

test('unchanged markup is not written again — the caret and the focus ring survive a sync tick', () => {
  const l = load();
  l.open();
  l.S.cache.users = roster();
  l.Shell.mount('login');
  const first = l.app.innerHTML;
  // Mark the live DOM, then re-mount with nothing changed. A rebuild would wipe
  // the mark, and in a browser it wipes the caret out of the name search — the
  // frame re-mounts every four seconds whether or not there is a token.
  l.app.innerHTML = first + '<!--caret-->';
  l.Shell.mount('login');
  assert(l.app.innerHTML.indexOf('<!--caret-->') >= 0,
         'an identical login must not be redrawn');
  // And a change still lands.
  l.Login._goto('who', 'driver', null);
  l.Shell.mount('login');
  assert(l.app.innerHTML.indexOf('data-act="who"') >= 0, 'a changed login is redrawn');
  assert(l.app.innerHTML.indexOf('<!--caret-->') < 0);
});

test('mounting a real screen invalidates that cache, so a later sign-out still draws', () => {
  const l = load();
  l.open();
  l.S.cache.users = roster();
  l.Shell.mount('login');
  const lg = l.app.innerHTML;
  l.S.user = person('u-d1', 'Driver 1', 'driver');
  l.Shell.mount('today');                     // the frame replaces #app
  assert(l.app.innerHTML.indexOf('data-screen="login"') < 0);
  l.S.user = null;
  l.Shell.mount('login');
  assert.strictEqual(l.app.innerHTML, lg, 'the login is drawn again, not skipped as unchanged');
});

test('the login reads its own roster, so a sign-out does not leave it on a skeleton', async () => {
  /* Found in a browser and nowhere else: `signOut()` empties `S.cache`, and
   * nothing after it loads FIRST_STORES again — `Cache.load()` with no names
   * re-reads only the stores that already have a copy, and there are none. The
   * login sat on its skeleton for ever. */
  const l = load({ db: { users: roster() }, token: 'u-sup' });
  l.open();
  await l.Boot.start();
  await flush();
  l.Boot.signOut();
  assert.strictEqual(Object.keys(l.S.cache).length, 0, 'the cache really is empty');
  l.run(200);                                   // the coalesced redraw draws the login
  await flush(); await flush();
  l.run(200);
  assert(l.S.cache.users !== undefined, 'the login asked for the roster itself');
  assert(l.app.innerHTML.indexOf('data-act="role"') >= 0,
         'and a person can start again: ' + l.app.innerHTML.slice(0, 200));
});

test('…and it asks once, not once per redraw', async () => {
  const l = load({ db: { users: roster() } });
  l.open();
  l.Shell.mount('login');
  l.Shell.mount('login');
  l.Shell.mount('login');
  const reads = l.loaded.filter(function (n) { return n && n.indexOf('users') >= 0; }).length;
  assert.strictEqual(reads, 1, 'three mounts, one read: a read per redraw is a read every four seconds');
});

/* ===================================================================================================
 * 8. THE BOOT SEAM — in, and back out again
 * =================================================================================================== */

test('Boot exposes the two ends of a session, and start() is still self-guarded', async () => {
  const l = load();
  assert.strictEqual(typeof l.Boot.enter, 'function');
  assert.strictEqual(typeof l.Boot.signOut, 'function');
  const boot = read(V2('boot.js'));
  assert(/if \(started\) return;/.test(boot), 'the one-boot-per-document guard must not be weakened');
  assert(/started = true;/.test(boot));
  // A second start() must add no second density watcher and no second route
  // subscription: both are what the guard is there for.
  l.open();
  await l.Boot.start();
  await flush();
  const firstStarts = l.syncStarts();
  await l.Boot.start();
  await flush();
  assert.strictEqual(l.syncStarts(), firstStarts, 'a second start() does nothing at all');
});

test('Boot.enter(user) runs the post-session half: session, route, sync, first stores, draw', async () => {
  const l = load({ db: { users: roster() } });
  l.open();
  await l.Boot.start();            // signed out: this lands on the login
  await flush();
  assert.strictEqual(l.S.route, 'login');
  const before = l.syncStarts();
  await l.Boot.enter(person('u-sup', 'Mohan', 'supervisor'));
  await flush();
  assert.strictEqual(l.S.user.role, 'supervisor', 'the session is the person the login authenticated');
  const cur = l.Router.current();
  assert.strictEqual(cur.id, l.Caps.screensFor('supervisor')[0],
                     'and the route is the front door the capability table gives that role');
  assert(l.syncStarts() > before, 'sync is wired');
  assert(l.loaded.some(function (n) { return n && n.indexOf('users') >= 0; }), 'and the first stores are read');
});

test('…with no argument it reads the session from the token, exactly as the first boot does', async () => {
  const l = load({ db: { users: roster() }, token: 'u-store' });
  l.open();
  await l.Boot.enter();
  await flush();
  assert.strictEqual(l.S.user && l.S.user.id, 'u-store');
});

test('…and it is passed the user because the offline path has no token to read', async () => {
  // The device-PIN login never gets a token, and a device that has never synced
  // has no `users` row either. Both are this argument's whole reason.
  const l = load({ db: {}, token: '' });
  l.open();
  await l.Boot.enter(person('u-d1', 'Driver 1', 'driver'));
  await flush();
  assert.strictEqual(l.S.user && l.S.user.id, 'u-d1');
  assert.strictEqual(l.Router.current().id, l.Caps.screensFor('driver')[0]);
});

test('signing in cannot reach a screen the role does not hold', async () => {
  const l = load({ db: { users: roster() } });
  l.open();
  await l.Boot.enter(person('u-d1', 'Driver 1', 'driver'));
  await flush();
  const held = l.Caps.screensFor('driver');
  assert(held.indexOf('money') < 0, 'a driver holds no money screen');
  assert.strictEqual(l.Router.go('money'), false, 'and the route refuses it after the login');
});

test('Boot.signOut() goes back to the login without reloading the document', async () => {
  const l = load({ db: { users: roster() }, token: 'u-sup' });
  l.open();
  await l.Boot.start();
  await flush();
  assert.strictEqual(l.S.user && l.S.user.id, 'u-sup');
  const wasOn = l.Router.current().id;
  assert(wasOn && wasOn !== 'login');
  l.Boot.signOut();
  assert.strictEqual(l.S.user, null);
  // Object.keys, not deepStrictEqual: an object literal built inside the vm has
  // a different Object.prototype than one built out here, and a check that
  // tripped on that would be comparing sandboxes rather than caches.
  assert.strictEqual(Object.keys(l.S.cache).length, 0,
                     'the copies in it were read under the previous person\'s entitlement');
  assert.strictEqual(l.S.route, 'login');
  assert.strictEqual(l.logouts.length, 1, 'the token is dropped');
  assert.deepStrictEqual(l.actors[l.actors.length - 1], '',
                         'and the actor with it, or the next person signs the last one\'s work');
  l.run(200);                                  // the coalesced redraw
  assert(l.app.innerHTML.indexOf('data-screen="login"') >= 0,
         'the route a person was on outlives their sign-out: without the clause in redraw() '
         + 'they would be reading "this is not open to you" where the login should be');
});

test('…and signing straight back in works, with no second density watcher', async () => {
  const l = load({ db: { users: roster() }, token: 'u-sup' });
  l.open();
  await l.Boot.start();
  await flush();
  const resizes = l.winListeners.filter(function (t) { return t === 'resize'; }).length;
  assert.strictEqual(resizes, 1, 'the one resize listener in the app');
  l.Boot.signOut();
  await l.Boot.enter(person('u-store', 'Vikas', 'store'));
  await flush();
  assert.strictEqual(l.S.user.role, 'store');
  assert.strictEqual(l.Router.current().id, l.Caps.screensFor('store')[0]);
  assert.strictEqual(l.winListeners.filter(function (t) { return t === 'resize'; }).length, 1,
                     'and re-entering the app must not install a second one: two listeners is the '
                     + 'debounce defeated by the thing it was added for');
});

/* ===================================================================================================
 * 9. THE DEVICE THAT HAS NEVER SYNCED
 *
 * The circle: the roster arrives with a pull, a pull needs a token, a token needs a login, and the
 * login is built from the roster. `Sync.roster()` is the one request in this app that carries no
 * token and exists to break it; `v2/db.js`'s `seedIfEmpty` is the other thing that was never called,
 * and the last case here is why it must stay that way.
 *
 * Every case below is a face of one property:
 *
 *     A PHONE OUT OF THE BOX REACHES A LOGIN IT CAN USE, AND NOTHING THAT ARRIVES WITHOUT A TOKEN
 *     IS TRUSTED WITH ANYTHING MORE THAN A LIST OF NAMES.
 *
 * Which is three separate things to get wrong, all of them invisible when they are right:
 *
 *  1. The screen telling somebody there are no accounts when the truth is that it could not ask.
 *     Zero, unknown and finding-out are THREE states and two of them draw a skeleton, so the thing
 *     that keeps them apart is no longer the markup — it is which request goes out.
 *  2. An untokened answer being written as though it were authoritative: stamped now so it outranks
 *     the server, or notified so it is pushed back as this device's own work, or copied field for
 *     field so whatever the answer carried is now on the phone.
 *  3. A skeleton with no end. The request has no abort, so the SCREEN is what has to be bounded.
 * =================================================================================================== */

test('a device that holds nobody asks the untokened roster, and the names become doors', async () => {
  const l = load({ roster: roster() });
  const m = model({ cache: { users: [] } });
  assert(l.Login.render(m).indexOf('aria-busy="true"') >= 0, 'it does not claim to know yet');
  assert.strictEqual(l.rosters.length, 1, 'and it asks');
  await flush(); await flush(); await flush();
  const html = l.Login.render(model({ cache: l.S ? l.S.cache : {} }));
  assert.strictEqual(count(html, /data-act="role"/g), 7,
                     'seven of the eight roles have somebody in this roster, so a person can start: '
                     + html.slice(0, 200));
  assert.strictEqual(l.logins.length, 0, 'and nothing was signed in to get it');
});

test('…and it asks ONCE, not on every paint of a screen the frame re-mounts every four seconds', async () => {
  const l = load({ roster: 'hang' });
  const m = model({ cache: { users: [] } });
  l.Login.render(m); l.Login.render(m); l.Login.render(m);
  await flush();
  l.Login.render(m);
  assert.strictEqual(l.rosters.length, 1, 'four paints, one untokened request');
});

test('…and a device that already has a roster never asks at all', async () => {
  const l = load({ roster: roster() });
  l.Login.render(model({ cache: { users: roster() } }));
  await flush(); await flush();
  assert.strictEqual(l.rosters.length, 0,
                     'the pull keeps a synced device current; asking again is an untokened request '
                     + 'for an answer it already has from a source that can be trusted with it');
});

test('the row written is three named columns, low-stamped and never pushed', async () => {
  /* The server sends id, name and role. This is the one answer in the app with
   * nothing vouching for it, so the row is BUILT rather than copied: a field
   * nobody here named must not reach the device because a server, or something
   * standing in for one, added it. `surprise` stands in for that field, and the
   * server's own `updatedAt` stands in for a stamp that would outrank a pull. */
  const l = load({ roster: [{ id: 'u-d1', name: 'Driver 1', role: 'driver',
                              surprise: 'x', updatedAt: 4102444800000 }] });
  l.Login.render(model({ cache: { users: [] } }));
  await flush(); await flush(); await flush();
  assert.strictEqual(l.bulkPuts.length, 1, 'one write');
  const put = l.bulkPuts[0];
  assert.strictEqual(put.store, 'users');
  assert.strictEqual(put.notify, false,
                     'notified, this enters the outbox and is pushed back as this device\'s work');
  assert.strictEqual(put.stamp, false);
  assert.deepStrictEqual(Object.keys(put.rows[0]).sort(), ['id', 'name', 'role', 'updatedAt'],
                         'exactly the three columns and the stamp: ' + JSON.stringify(put.rows[0]));
  assert.strictEqual(put.rows[0].updatedAt, 1,
                     'the first real pull must outrank it, or it is a record nobody can correct');
  const html = l.Login.render(model({ cache: l.S.cache }));
  assert.strictEqual(html.indexOf('surprise'), -1, 'and nothing unnamed is drawn either');
});

test('an account removed on this device is not re-created by the roster', async () => {
  /* `DB.all` hides a tombstone, so the store reads as empty and the ask goes
   * out — but a deleted record is KNOWN, and an account somebody removed here
   * must stay removed. The known set is therefore the RAW rows. */
  const l = load({ db: { users: [{ id: 'u-d1', _deleted: true, updatedAt: 1 }] },
                   roster: [{ id: 'u-d1', name: 'Driver 1', role: 'driver' }] });
  l.Login.render(model({ cache: { users: [] } }));
  await flush(); await flush(); await flush();
  assert.strictEqual(l.rosters.length, 1, 'a device whose only row is a tombstone holds nobody');
  assert.strictEqual(l.bulkPuts.length, 0, 'and the removed account is not written back');
  const html = l.Login.render(model({ cache: l.S.cache }));
  assert(html.indexOf('class="state empty"') >= 0, 'it says so instead');
});

test('an empty roster is a failure wearing a success suit, not a device with no accounts', async () => {
  const l = load({ roster: [] });
  l.Login.render(model({ cache: { users: [] } }));
  await flush(); await flush(); await flush();
  assert.strictEqual(l.bulkPuts.length, 0, 'nothing is written');
  assert.strictEqual(l.loaded.length, 0,
                     'and the device is not touched at all: an answer already known to be bad is '
                     + 'not read against the store and then read back out of it');
  const html = l.Login.render(model({ cache: { users: [] } }));
  assert(html.indexOf('class="state empty"') >= 0,
         'and it lands exactly where a timeout lands, because operationally it is one');
});

test('no network is the honest sentence and never an endless skeleton', async () => {
  const l = load();                               // the ask rejects
  l.Login.render(model({ cache: { users: [] } }));
  await flush(); await flush();
  const html = l.Login.render(model({ cache: { users: [] } }));
  assert(html.indexOf('aria-busy="true"') < 0, 'the skeleton has ended');
  assert(html.indexOf('class="state empty"') >= 0);
  assert(html.indexOf('server could not be reached') >= 0,
         'and it names the reason rather than guessing at it: ' + html.slice(-400));
  assert.strictEqual(l.Login._step().ask, 'done');
});

test('…and a throw out of Sync.roster is the same answer, not a skeleton nobody comes off', async () => {
  // `Sync.roster()` catches nothing of its own. A throw that got out would
  // leave both timers running and the screen on a skeleton for ever.
  const l = load({ roster: roster() });
  l.win.Sync.roster = function () { throw new Error('no network stack'); };
  l.Login.render(model({ cache: { users: [] } }));
  await flush(); await flush();
  assert.strictEqual(l.Login._step().ask, 'done');
  assert(l.Login.render(model({ cache: { users: [] } })).indexOf('class="state empty"') >= 0);
});

test('a wait long enough to notice says what it is waiting for', async () => {
  const l = load({ roster: 'hang' });
  const m = model({ cache: { users: [] } });
  l.Login.render(m);
  assert.strictEqual(l.Login._step().ask, 'asking');
  l.run(5000);                                    // the timer the screen sets
  assert.strictEqual(l.Login._step().ask, 'waking');
  const html = l.Login.render(m);
  assert(html.indexOf('aria-busy="true"') >= 0, 'it still does not know');
  assert(html.indexOf('half a minute') >= 0,
         'a phone in this state has nothing to fall back on and a cold container is 30-36 s, '
         + 'so silence here is what "is it broken?" looks like: ' + html.slice(0, 400));
});

test('…and the WAIT is bounded even though the request is not', async () => {
  // `Sync.roster()` takes no abort, so the screen is what has to end. A minute
  // of "Loading" is the spinner this screen may not have.
  const l = load({ roster: 'hang' });
  const m = model({ cache: { users: [] } });
  l.Login.render(m);
  l.run(60000);
  const html = l.Login.render(m);
  assert(html.indexOf('aria-busy="true"') < 0, 'it stopped waiting');
  assert(html.indexOf('class="state empty"') >= 0);
});

test('…and an answer that lands after that is still taken, not thrown away for being late', async () => {
  /* Stop WAITING is not stop listening. The request has no abort, so a roster
   * that arrives at forty seconds is a roster — refusing it would mean a phone
   * sitting in front of a usable login being told to go and find a network. */
  let hand;
  const l = load({ roster: 'hang' });
  l.win.Sync.roster = function () { return new Promise(function (r) { hand = r; }); };
  const m = model({ cache: { users: [] } });
  l.Login.render(m);
  l.run(60000);
  assert(l.Login.render(m).indexOf('class="state empty"') >= 0, 'it had given up waiting');
  hand(roster());
  await flush(); await flush(); await flush();
  const html = l.Login.render(model({ cache: l.S.cache }));
  assert.strictEqual(count(html, /data-act="role"/g), 7, 'the late answer still draws the login');
});

test('a roster is a list of names and grants nothing — the server still decides', async () => {
  /* Deny-by-default, on the path this slice opens. Somebody who got onto the
   * screen from the roster has no device PIN on a phone that has never synced,
   * so for every one of them the login IS one server request, and a refusal is
   * final. Nothing here reads or writes the capability table. */
  const l = load({ roster: roster(), answers: [{ rejected: true, known: true }] });
  l.Login.render(model({ cache: { users: [] } }));
  await flush(); await flush(); await flush();
  assert(l.ls.getItem('creds') === null, 'the roster wrote no credential of any kind');
  l.Login._goto('pin', 'owner', person('u-owner', 'Ramesh Gupta', 'owner'));
  await type(l, GOOD);
  assert.strictEqual(l.S.user, null, 'a refusal is a refusal');
  assert.strictEqual(l.ls.writes.indexOf('creds'), -1, 'and nothing was kept for next time');
  assert(!/\bCaps\b/.test(CODE), 'and the capability table is still untouched by this file');
});

/* v2 must never call `seedIfEmpty`, and this is the check rather than the comment, for the reason
 * `scripts/check-v2-isolation.sh` learnt on its own invariant 3: a check that trips on prose about
 * itself teaches people to delete checks. Comments are stripped, the definition is allowed, a CALL
 * is not.
 *
 * Why it is not the answer to the circle above: it writes seven fictional people with `DB.put`,
 * which stamps `updatedAt` NOW and notifies the outbox — so the demo roster outranks the server and
 * is pushed to it, which is the defect `bulkPut`'s own comment was written about. Worse, on a real
 * phone it replaces an honest dead end with eight doors that none of the hundred people can open:
 * every name on it is one the server has never heard of, so every PIN is refused and there is no
 * device PIN behind it. It also writes a `meta.garage` row, which is where this screen reads the
 * business name from. The roster above is the answer; this is the trap beside it. */
function seedCallers(srcs) {
  const out = [];
  Object.keys(srcs).forEach(function (f) {
    const code = stripComments(srcs[f]);
    // The definition in v2/db.js is allowed; a call is not.
    const calls = code.replace(/function\s+seedIfEmpty\s*\(/g, 'function _defined(');
    if (/\bseedIfEmpty\s*\(/.test(calls)) out.push(f);
  });
  return out;
}

function v2Sources() {
  const out = {};
  const walk = function (dir) {
    fs.readdirSync(dir).forEach(function (n) {
      const p = path.join(dir, n);
      if (fs.statSync(p).isDirectory()) return walk(p);
      if (/\.js$/.test(n)) out[path.relative(ROOT, p)] = read(p);
    });
  };
  walk(V2());
  return out;
}

test('nothing in v2 calls seedIfEmpty — the demo roster is a trap, not the bootstrap', () => {
  const srcs = v2Sources();
  assert(Object.keys(srcs).length > 20, 'the walk found the v2 sources: ' + Object.keys(srcs).length);
  assert(/function seedIfEmpty/.test(srcs['v2/db.js']), 'the definition is where this check expects it');
  assert.deepStrictEqual(seedCallers(srcs), [],
                         'a stamped, notified demo roster outranks the server and is pushed to it, '
                         + 'and every name on it is one no PIN can open');
});

/* ===================================================================================================
 * 10. MUTANTS — every rule above, broken on purpose
 * =================================================================================================== */

/* `reddens(name, run)` asserts that `run` THROWS. `run` is the check for one
 * rule, pointed at a build with that rule broken. A mutant that survives is
 * reported BY NAME, because a surviving mutant is a hole in this file and not a
 * detail — and the checks above are worth exactly what these prove. */
function reddens(name, run) {
  test('MUTANT must fail: ' + name, async () => {
    let threw = false;
    try { await run(); } catch (e) { threw = true; }
    assert(threw, 'MUTANT SURVIVED — the check for "' + name + '" passes either way');
  });
}

function mutant(from, to) {
  assert(SOURCE.indexOf(from) >= 0, 'the mutant target has moved: ' + from);
  assert.strictEqual(SOURCE.split(from).length, 2, 'the mutant target is not unique: ' + from);
  return { 'login.js': SOURCE.split(from).join(to) };
}

function bootMutant(from, to) {
  const src = read(V2('boot.js'));
  assert(src.indexOf(from) >= 0, 'the boot mutant target has moved: ' + from);
  return { 'boot.js': src.split(from).join(to) };
}

function shellMutant(from, to) {
  const src = read(V2('shell.js'));
  assert(src.indexOf(from) >= 0, 'the shell mutant target has moved: ' + from);
  return { 'shell.js': src.split(from).join(to) };
}

// 1. The one that matters most: `known` read after the device PIN instead of
//    before it, which is the rotated-credential hole.
reddens('known: true falls through to the device PIN', async () => {
  const l = load({ src: mutant('if (r && r.rejected && r.known) {', 'if (false) {'),
                   answers: [{ rejected: true, known: true }],
                   creds: { 'u-d1': GOOD.join('') }, db: { users: roster() } });
  l.Login._goto('pin', 'driver', person('u-d1', 'Driver 1', 'driver'));
  await type(l, GOOD);
  await flush();
  assert.strictEqual(l.S.user, null, 'a PIN the server is sure about stays wrong offline');
});

// 2. …and the other half of it: the stale copy left on the phone.
reddens('the rotated credential is left on the device', async () => {
  const l = load({ src: mutant('      dropPin(user.id);\n', ''),
                   answers: [{ rejected: true, known: true }], creds: { 'u-d1': GOOD.join('') } });
  l.Login._goto('pin', 'driver', person('u-d1', 'Driver 1', 'driver'));
  await type(l, GOOD);
  const left = JSON.parse(l.ls.getItem('creds'));
  assert.strictEqual(Object.prototype.hasOwnProperty.call(left, 'u-d1'), false);
});

// 3. The digits in the dots. The exact defect the "never render a PIN" rule is.
reddens('the dots draw the digits instead of the count', async () => {
  const l = load({ src: mutant("'<span class=\"lg-dot' + (i < pin.length ? ' on' : '') + '\"></span>'",
                               "'<span class=\"lg-dot\">' + (pin[i] || '') + '</span>'") });
  l.Login._goto('pin', 'driver', person('u-d1', 'Driver 1', 'driver'));
  const m = model({ cache: { users: roster() } });
  const base = count(l.Login.render(m), /7/g);
  l.Login._key('7'); l.Login._key('7'); l.Login._key('7');
  assert.strictEqual(count(l.Login.render(m), /7/g), base);
});

// 4. The timeout the three roles with no fallback depend on.
reddens('every role gets the 8 s timeout', async () => {
  const l = load({ src: mutant('canOffline ? WAIT_FAST_MS : WAIT_SLOW_MS', 'WAIT_FAST_MS'),
                   answers: [{ token: 't', user: person('u-owner', 'Ramesh', 'owner') }],
                   db: { users: roster() } });
  l.Login._goto('pin', 'owner', person('u-owner', 'Ramesh', 'owner'));
  await type(l, GOOD);
  await flush();
  assert.strictEqual(l.logins[0].opts.timeoutMs, 60000);
});

// 5. The warm-up moved to where it buys nothing.
reddens('the server is woken at the fourth digit instead of at the pad', async () => {
  const src = SOURCE.split('    warm();\n').join('');
  assert(src.length < SOURCE.length);
  const toPin = /function toPin\([\s\S]*?\n  \}/.exec(src)[0];
  assert(/\bwarm\(\)/.test(toPin), 'the wake must be in toPin, not in attempt()');
});

// 6. The field guard, after the read it is there to come before.
reddens('the field guard runs after the data-act read', async () => {
  const src = SOURCE.split('    if (t.closest(FIELDS)) return;\n').join('')
    .split("    if (!el) return;")
    .join("    if (!el) return;\n    if (t.closest(FIELDS)) return;");
  const lines = src.split('\n');
  let guard = -1, act = -1;
  for (let i = 0; i < lines.length; i++) {
    if (act < 0 && /closest\('\[data-(act|nav)\]'\)/.test(lines[i])) act = i;
    if (guard < 0 && /closest\(/.test(lines[i]) && !/closest\('\[data-/.test(lines[i])) guard = i;
  }
  assert(guard >= 0 && guard < act, 'guard=' + guard + ' act=' + act);
});

/* 7. Zero and unknown collapsed into one, which is the blank-screen defect.
 *
 * The observable moved when section 9 landed: a device that holds nobody now
 * draws a skeleton too, while it asks the server, so the markup no longer tells
 * the two apart on its own. What does is WHICH REQUEST GOES OUT — a store
 * nobody has finished reading is read, not asked about — and collapsing the two
 * sends an untokened request on the first paint of every device in the garage. */
reddens('a store still filling is drawn as a device holding nobody', async () => {
  const l = load({ src: mutant('if (u === undefined) return null;', 'if (u === undefined) return [];'),
                   roster: roster() });
  const filling = l.Login.render(model({ cache: {} }));
  assert(filling.indexOf('aria-busy="true"') >= 0);
  assert.strictEqual(l.loaded.length, 1, 'the local store is read');
  assert.strictEqual(l.rosters.length, 0, 'and the server is not asked');
});

// 8. The search box over a list that does not need one.
reddens('the search box is drawn below seven names', async () => {
  const l = load({ src: mutant('if (all.length > SEARCH_AT) {', 'if (all.length > 0) {') });
  l.Login._goto('who', 'owner', null);
  assert.strictEqual(count(l.Login.render(model({ cache: { users: roster() } })), /lg-search/g), 0);
});

// 9. The recent list, uncapped.
reddens('the recent list is not capped', async () => {
  const l = load({ src: mutant('.slice(0, RECENT_MAX);', '.slice(0);'),
                   recent: ['u-d3', 'u-store', 'u-owner', 'u-sup', 'u-cm', 'u-off'] });
  const html = l.Login.render(model({ cache: { users: roster() } }));
  assert.strictEqual(count(html, /data-act="recent"/g), 4);
});

// 10. A locked pad that keeps taking digits.
reddens('a locked-out pad keeps accepting digits', async () => {
  const l = load({ src: mutant('if (locked || working) return;\n    if (pin.length >= DIGITS) return;',
                               'if (working) return;\n    if (pin.length >= DIGITS) return;'),
                   answers: [{ locked: true, retryAfter: 90 }, { rejected: true, known: true }] });
  l.Login._goto('pin', 'driver', person('u-d1', 'Driver 1', 'driver'));
  await type(l, GOOD);
  await type(l, GOOD);
  assert.strictEqual(l.logins.length, 1);
});

// 11. The PIN left behind on the way into the app.
reddens('the login keeps the PIN after handing over', async () => {
  const l = load({ src: mutant('    clear();\n    pushRecent(who.id);', '    pushRecent(who.id);'),
                   answers: [{ token: 't', user: person('u-d1', 'Driver One', 'driver') }],
                   db: { users: roster() } });
  l.Login._goto('pin', 'driver', person('u-d1', 'Driver One', 'driver'));
  await type(l, GOOD);
  await flush();
  assert.strictEqual(l.Login._step().digits, 0);
});

// 12. The shell seam removed, which is the white page this slice exists for.
reddens('signedOut() draws nothing again', async () => {
  const l = load({ src: shellMutant("    if (app && html !== '') put(app, html);\n", '') });
  l.open();
  l.S.cache.users = roster();
  l.Shell.mount('login');
  assert(l.app.innerHTML.indexOf('data-screen="login"') >= 0);
});

// 13. …and the short-circuit that keeps the caret.
reddens('an unchanged login is rebuilt every four seconds', async () => {
  const l = load({ src: shellMutant("    if (app && html !== '' && html === lastLogin) {",
                                     '    if (false) {') });
  l.open();
  l.S.cache.users = roster();
  l.Shell.mount('login');
  l.app.innerHTML = l.app.innerHTML + '<!--caret-->';
  l.Shell.mount('login');
  assert(l.app.innerHTML.indexOf('<!--caret-->') >= 0);
});

// 14. The boot seam's own guard, which the brief says must not be weakened.
reddens('start() loses its one-boot-per-document guard', async () => {
  const l = load({ src: bootMutant('    if (started) return;', '') });
  l.open();
  await l.Boot.start();
  await flush();
  const first = l.syncStarts();
  await l.Boot.start();
  await flush();
  assert.strictEqual(l.syncStarts(), first);
});

// 15. Sign-out that leaves the session behind.
reddens('sign-out leaves the person signed in', async () => {
  const l = load({ src: bootMutant('    S.user = null;\n    S.cache = {};', '    S.cache = {};'),
                   db: { users: roster() }, token: 'u-sup' });
  l.open();
  await l.Boot.start();
  await flush();
  l.Boot.signOut();
  assert.strictEqual(l.S.user, null);
});

// 16. …and the redraw clause that makes sign-out land on the login at all.
reddens('a sign-out re-mounts the screen the person had just left', async () => {
  const l = load({ src: bootMutant('      const cur = S.user ? (router() && router().current ? router().current() : null) : null;',
                                    '      const cur = router() && router().current ? router().current() : null;'),
                   db: { users: roster() }, token: 'u-sup' });
  l.open();
  await l.Boot.start();
  await flush();
  l.Boot.signOut();
  l.run(200);
  assert(l.app.innerHTML.indexOf('data-screen="login"') >= 0);
});

// 17. The session taken from the stale local row rather than the server's answer.
reddens('the role is read from the local row instead of the server\'s answer', async () => {
  const l = load({ src: mutant('var who = verified || user;', 'var who = user;'),
                   answers: [{ token: 't', user: person('u-d1', 'Driver One', 'driver') }],
                   db: { users: roster() } });
  l.Login._goto('pin', 'driver', person('u-d1', 'stale', 'conductor'));
  await type(l, GOOD);
  await flush();
  assert.strictEqual(l.S.user && l.S.user.role, 'driver');
});

// 18. The cache left in memory across a sign-out, which is the next person
//     reading rows their own role may not be shown.
reddens('the previous person\'s records are left in memory across a sign-out', async () => {
  const l = load({ src: bootMutant('    S.cache = {};\n', ''),
                   db: { users: roster() }, token: 'u-sup' });
  l.open();
  await l.Boot.start();
  await flush();
  l.S.cache.jobcards = [{ id: 'j1' }];
  l.Boot.signOut();
  assert.strictEqual(Object.keys(l.S.cache).length, 0);
});

// 19. The keypad listening on every step, which would put a digit into whatever
//     screen the person is on after they sign in.
reddens('the keypad listens on every step, not only on the pad', async () => {
  const l = load({ src: mutant("if (!ev || step !== 'pin' || !pickedUser) return;", 'if (!ev) return;') });
  l.Login._goto('who', 'driver', null);
  l.handlers.keydown[0]({ key: '3', preventDefault: function () {} });
  assert.strictEqual(l.Login._step().digits, 0);
});

// 20. …and listening through a field, which turns a digit in a name into a
//     digit in a PIN.
reddens('a digit typed into the name search becomes a PIN digit', async () => {
  const l = load({ src: mutant("if (a && typeof a.closest === 'function' && a.closest(FIELDS)) return;", '') });
  l.Login._goto('pin', 'driver', person('u-d1', 'Driver 1', 'driver'));
  l.win.document.activeElement = { closest: function (sel) {
    return sel === 'input, select, textarea, label, .num' ? {} : null; } };
  l.handlers.keydown[0]({ key: '3', preventDefault: function () {} });
  assert.strictEqual(l.Login._step().digits, 0);
});

// 21. A role label hard-coded at the point of use, which is the English nobody
//     is ever told is missing.
reddens('a role label is hard-coded instead of registered', async () => {
  const src = SOURCE.split("return id ? say(id) : String(r == null ? '' : r);")
    .join("return String(r) === 'crewmanager' ? 'Crew Manager' : (id ? say(id) : String(r));");
  const code = stripComments(src);
  const spans = [...code.matchAll(/\bW\s*\.\s*register\s*\(\s*WORDS\s*\)/g)];
  assert(spans.length === 1);
  // The same rule test_v2_words.js applies across v2: a quoted, capitalised
  // English word outside the register table.
  const table = /var WORDS = \{[\s\S]*?\n  \};/.exec(code)[0];
  const outside = code.split(table).join('');
  assert(!/'[A-Z][a-z]+( [A-Z][a-z]+)*'/.test(outside),
         'a capitalised English word sits outside the table');
});

// 22. The login not reading its own roster, which leaves it on a skeleton
//     after every sign-out.
reddens('the login waits for somebody else to read the roster', async () => {
  // Both lines, because the second is the `else` of the first: removing one and
  // leaving the other is a syntax error, and a mutant that cannot parse proves
  // nothing about the check it is pointed at.
  const l = load({ src: mutant('    if (people(m) === null) readRoster();\n'
                               + '    else if (!people(m).length) askRoster();\n', ''),
                   db: { users: roster() }, token: 'u-sup' });
  l.open();
  await l.Boot.start();
  await flush();
  l.Boot.signOut();
  l.run(200);
  await flush(); await flush();
  l.run(200);
  assert(l.app.innerHTML.indexOf('data-act="role"') >= 0);
});

// 23. Escaping dropped from a name, on a store eight roles write.
reddens('a name is drawn without escaping', async () => {
  const l = load({ src: mutant("      + '<span><span class=\"t\">' + esc(u.name || u.id) + '</span>' + sub + '</span></a>';",
                               "      + '<span><span class=\"t\">' + (u.name || u.id) + '</span>' + sub + '</span></a>';") });
  l.Login._goto('who', 'driver', null);
  const nasty = '<img src=x onerror=alert(1)>';
  const html = l.Login.render(model({ cache: { users: [person('u-d1', nasty, 'driver')] } }));
  assert(html.indexOf(nasty) < 0);
});

// 24. The scope check dropped, so another screen's data-act reaches here.
reddens('the handler answers a click from anywhere on the page', async () => {
  const l = load({ src: mutant("    if (!t.closest('[data-screen=\"' + ID + '\"]')) return;\n", '') });
  l.Login._goto('who', 'driver', null);
  l.handlers.click[0]({
    target: { closest: function (sel) {
      if (sel === 'input, select, textarea, label, .num') return null;
      if (sel === '[data-screen="login"]') return null;
      return { getAttribute: function () { return 'back'; } };
    } },
    preventDefault: function () {},
  });
  assert.strictEqual(l.Login._step().step, 'who');
});

// 25. The anchor's default left alone, which follows href="#".
reddens('the anchor default is not swallowed', async () => {
  const l = load({ src: mutant('    if (ev.preventDefault) ev.preventDefault();\n\n    var act', '\n    var act') });
  let prevented = false;
  l.handlers.click[0]({
    target: { closest: function (sel) {
      if (sel === 'input, select, textarea, label, .num') return null;
      if (sel === '[data-screen="login"]') return {};
      return { getAttribute: function (k) { return k === 'data-act' ? 'role' : 'driver'; } };
    } },
    preventDefault: function () { prevented = true; },
  });
  assert.strictEqual(prevented, true);
});

// 26. A refusal left on screen under a half-typed retry.
reddens('the last refusal stays on screen while the next PIN is typed', async () => {
  const l = load({ src: mutant('    pin += d;\n    note = null;', '    pin += d;'),
                   answers: [{ rejected: true, known: true }] });
  l.Login._goto('pin', 'driver', person('u-d1', 'Driver 1', 'driver'));
  await type(l, WRONG);
  l.Login._key('3');
  assert.strictEqual(l.Login._step().note, null);
});

// 27. The waking line pushed out past any wait a person would sit through.
reddens('the pad never admits it is waiting', async () => {
  const l = load({ src: mutant('var SAY_WAKING_MS = 5000;', 'var SAY_WAKING_MS = 500000;') });
  let release;
  l.win.Sync.login = function () {
    return new Promise(function (r) { release = function () { r({ rejected: true, known: true }); }; });
  };
  l.Login._goto('pin', 'owner', person('u-owner', 'Ramesh', 'owner'));
  await type(l, GOOD);
  l.run(5000);
  const note = l.Login._step().note;
  release();
  await flush(); await flush();
  assert.strictEqual(note, 'lgWaking');
});

// 28. A PIN the server never verified, written to the device as though it had.
reddens('an offline PIN is written back to the device', async () => {
  const l = load({ src: mutant('if (verified) keepPin(who, attempted);', 'keepPin(who, attempted);'),
                   answers: [{ offline: true }], creds: { 'u-d1': GOOD.join('') },
                   db: { users: roster() } });
  l.Login._goto('pin', 'driver', person('u-d1', 'Driver 1', 'driver'));
  await type(l, GOOD);
  await flush();
  assert.strictEqual(l.ls.writes.indexOf('creds'), -1);
});

// 29. The in-flight guard on the roster read, which is a read every four
//     seconds without it.
reddens('the roster is re-read on every redraw', async () => {
  const l = load({ src: mutant('    if (reading) return;\n', ''), db: { users: roster() } });
  l.open();
  l.Shell.mount('login');
  l.Shell.mount('login');
  l.Shell.mount('login');
  const reads = l.loaded.filter(function (n) { return n && n.indexOf('users') >= 0; }).length;
  assert.strictEqual(reads, 1);
});

// 30. A class login.css does not carry, which on this screen is a keypad with
//     no keys.
reddens('a class the stylesheet does not define is drawn', async () => {
  const l = load({ src: mutant("return '<div class=\"lg-pad\">' + out + '</div>';",
                               "return '<div class=\"lg-pad pinpad\">' + out + '</div>';") });
  const css = read(V2('ui', 'login.css'));
  const defined = new Set((css.replace(/\/\*[\s\S]*?\*\//g, '').match(/\.[a-zA-Z][\w-]*/g) || [])
    .map(function (c) { return c.slice(1); }));
  l.Login._goto('pin', 'driver', person('u-d1', 'Driver 1', 'driver'));
  const html = l.Login.render(model({ cache: { users: roster() } }));
  const used = new Set();
  [...html.matchAll(/class="([^"]+)"/g)].forEach(function (m) {
    m[1].split(/\s+/).forEach(function (c) { if (c) used.add(c); });
  });
  const orphans = [...used].filter(function (c) {
    return !defined.has(c) && ['v2row', 'btn', 'btn-primary', 'btn-quiet', 'badge', 'field',
                               'lead', 't', 'sub', 'act'].indexOf(c) < 0;
  });
  assert.deepStrictEqual(orphans, []);
});

/* ---- the never-synced device ------------------------------------------------------------------- */

// 31. The ask never made, which is the dead end this slice exists to end.
reddens('a device that holds nobody never asks the server', async () => {
  const l = load({ src: mutant('    else if (!people(m).length) askRoster();\n', ''),
                   roster: roster() });
  l.Login.render(model({ cache: { users: [] } }));
  await flush(); await flush(); await flush();
  assert.strictEqual(l.rosters.length, 1);
  const html = l.Login.render(model({ cache: l.S.cache }));
  assert.strictEqual(count(html, /data-act="role"/g), 7);
});

// 32. …and the ask made on every paint, which is an untokened request every
//     four seconds for the whole time anybody is looking at this screen.
reddens('the roster is asked for again on every paint', async () => {
  const l = load({ src: mutant('    if (asked) return;\n', ''), roster: 'hang' });
  const m = model({ cache: { users: [] } });
  l.Login.render(m); l.Login.render(m); l.Login.render(m);
  await flush();
  l.Login.render(m);
  assert.strictEqual(l.rosters.length, 1);
});

// 33. …and asked by a device that already has one.
reddens('a device that already has a roster asks anyway', async () => {
  const l = load({ src: mutant('    else if (!people(m).length) askRoster();',
                               '    else askRoster();'),
                   roster: roster() });
  l.Login.render(model({ cache: { users: roster() } }));
  await flush(); await flush();
  assert.strictEqual(l.rosters.length, 0);
});

// 34. The answer copied instead of built, so a field nobody named reaches the
//     device. This is the rule that keeps a credential off the phone on the one
//     path that has no token behind it.
reddens('the roster answer is written as it arrived', async () => {
  const l = load({ src: mutant("        add.push({ id: String(u.id),", '        add.push(u); if (false) add.push({ id: String(u.id),'),
                   roster: [{ id: 'u-d1', name: 'Driver 1', role: 'driver', surprise: 'x' }] });
  l.Login.render(model({ cache: { users: [] } }));
  await flush(); await flush(); await flush();
  assert.deepStrictEqual(Object.keys(l.bulkPuts[0].rows[0]).sort(),
                         ['id', 'name', 'role', 'updatedAt']);
});

// 35. …and stamped now, so a seed outranks the server for ever.
reddens('the roster row is stamped as though it were newer than the server\'s', async () => {
  const l = load({ src: mutant('                   updatedAt: 1 });', '                   updatedAt: Date.now() });'),
                   roster: [{ id: 'u-d1', name: 'Driver 1', role: 'driver' }] });
  l.Login.render(model({ cache: { users: [] } }));
  await flush(); await flush(); await flush();
  assert.strictEqual(l.bulkPuts[0].rows[0].updatedAt, 1);
});

// 36. …and notified, so it enters the outbox and is pushed back at the server as
//     this device's own work.
reddens('the roster row is pushed back at the server', async () => {
  const l = load({ src: mutant("await d.bulkPut('users', add, false, false);", "await d.bulkPut('users', add, true, true);"),
                   roster: [{ id: 'u-d1', name: 'Driver 1', role: 'driver' }] });
  l.Login.render(model({ cache: { users: [] } }));
  await flush(); await flush(); await flush();
  assert.strictEqual(l.bulkPuts[0].notify, false);
  assert.strictEqual(l.bulkPuts[0].stamp, false);
});

// 37. The known set read from the live rows, so a tombstone is invisible and a
//     removed account comes back.
reddens('an account removed on this device is re-created by the roster', async () => {
  const l = load({ src: mutant("(await d._rawAll('users'))", "(await d.all('users'))"),
                   db: { users: [{ id: 'u-d1', _deleted: true, updatedAt: 1 }] },
                   roster: [{ id: 'u-d1', name: 'Driver 1', role: 'driver' }] });
  l.Login.render(model({ cache: { users: [] } }));
  await flush(); await flush(); await flush();
  assert.strictEqual(l.bulkPuts.length, 0);
});

// 38. Finding out drawn as nobody being here, which is the whole §3.6 defect
//     moved to the one state this slice adds.
reddens('a device still asking is drawn as a device with no accounts', async () => {
  const l = load({ src: mutant("      if (ask === 'asking' || ask === 'waking') {", "      if (ask === 'waking') {"),
                   roster: 'hang' });
  assert(l.Login.render(model({ cache: { users: [] } })).indexOf('aria-busy="true"') >= 0);
});

// 39. The wait that never says what it is waiting for.
reddens('the screen never admits what it is waiting for', async () => {
  const l = load({ src: mutant("          + (ask === 'waking' ? '<p class=\"lg-tag\" role=\"status\">' + esc(say('lgWaking')) + '</p>' : '')\n", ''),
                   roster: 'hang' });
  const m = model({ cache: { users: [] } });
  l.Login.render(m);
  l.run(5000);
  assert(l.Login.render(m).indexOf('half a minute') >= 0);
});

// 40. The unbounded wait: a request with no abort, behind a screen with no end.
reddens('the skeleton waits for ever on a request that never answers', async () => {
  const l = load({ src: mutant('    giveUpTimer = setTimeout(function () {\n      giveUpTimer = null;\n      ask = \'done\';\n      paint();\n    }, WAIT_SLOW_MS);\n', ''),
                   roster: 'hang' });
  const m = model({ cache: { users: [] } });
  l.Login.render(m);
  l.run(60000);
  assert(l.Login.render(m).indexOf('class="state empty"') >= 0);
});

// 41. A throw out of the roster request, left to escape.
reddens('a throw out of Sync.roster strands the screen on a skeleton', async () => {
  const l = load({ src: mutant('    try {\n      s.roster().then(function (users) { done(); keepRoster(users); },\n'
                               + '                      function () { done(); paint(); });\n    } catch (e) { done(); paint(); }',
                               '    s.roster().then(function (users) { done(); keepRoster(users); },\n'
                               + '                    function () { done(); paint(); });') });
  l.win.Sync.roster = function () { throw new Error('no network stack'); };
  l.Login.render(model({ cache: { users: [] } }));
  await flush(); await flush();
  assert.strictEqual(l.Login._step().ask, 'done');
});

/* 42. An empty answer taken as an answer.
 *
 * This one is over-determined and the mutant below proves only half of it: the
 * write is add-only, so an empty roster adds nothing whether the guard is there
 * or not, and no check can tell. What the guard does carry is that an answer
 * already known to be bad is not then read against the store and read back out
 * of it — and it is where v1's rule is written down, which is what matters if
 * anybody ever ports v1's other half, the one that REMOVES names. That half is
 * what an empty roster would empty. */
reddens('an empty roster answer is taken as an answer', async () => {
  const l = load({ src: mutant('if (!Array.isArray(users) || !users.length) { paint(); return; }',
                               'if (!Array.isArray(users)) { paint(); return; }'),
                   roster: [] });
  l.Login.render(model({ cache: { users: [] } }));
  await flush(); await flush(); await flush();
  assert.strictEqual(l.bulkPuts.length, 0);
  assert.strictEqual(l.loaded.length, 0);
});

// 43. v2 wired to the demo seed, which is the trap beside the fix: eight doors
//     that no PIN opens, stamped newer than the server and pushed to it.
reddens('a v2 file calls seedIfEmpty', async () => {
  const srcs = v2Sources();
  srcs['v2/boot.js'] = srcs['v2/boot.js'] + '\nseedIfEmpty(false);\n';
  assert.deepStrictEqual(seedCallers(srcs), []);
});

/* ===================================================================================================
 * 11. THE HINDI, on the screen that is ahead of every other one
 *
 * v2-foundation-ui.md 6.3's defect is a screen that stayed English while every test passed, because a
 * missing translation and a present one look the same to everything except a Hindi reader. The login is
 * where that costs most: three roles reach nothing else without a network, and a person who cannot read
 * the eight role tiles cannot start the app at all.
 *
 * So two checks, and they catch different things. The FIRST reads the table: every id this file
 * registers has a real Hindi value, and no Latin letter in it. That covers the sentences only a server
 * refusal draws, which no render here reaches. The SECOND renders all three steps in Hindi and scans the
 * body: that catches a fixed word hard-coded at the point of use, which the table cannot see.
 * =================================================================================================== */

/* Tags become NEWLINES rather than spaces, so one text node cannot reach across markup to borrow the
 * next card's marker - the greedy version of this swallowed a real leak in test_v2_me.js. */
const MARKED = /[A-Za-z][^\n[\]]*\[[A-Za-z]+\]/g;
function englishLeaks(html) {
  // A pending label draws "English [lgId]" - marked, reportable, and the whole point of the fallback.
  // The English and its marker come out as a PAIR, so what is left is English nothing ever marked.
  const text = String(html).replace(/<[^>]*>/g, '\n').replace(MARKED, ' ');
  const bad = [];
  const re = /[A-Za-z][A-Za-z ']*/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const word = m[0].trim();
    if (word.length >= 2) bad.push(word);
  }
  return bad;
}

/* Every name is Devanagari on purpose: a Latin letter in the rendered body can then only have come from
 * a fixed word, which is the thing being measured. */
function hindiRoster() {
  const out = [person('u-owner', 'रमेश गुप्ता', 'owner'),
               person('u-sup', 'मोहन लाल', 'supervisor'),
               person('u-cm', 'सुरेश यादव', 'crewmanager'),
               person('u-off', 'प्रिया शर्मा', 'office'),
               person('u-store', 'विकास जैन', 'store'),
               person('u-m1', 'अरुण कुमार', 'mechanic'),
               person('u-c1', 'कैलाश मीणा', 'conductor')];
  for (let i = 1; i <= 9; i++) out.push(person('u-d' + i, 'चालक ' + i, 'driver'));
  return out;
}

const HI_CACHE = { users: hindiRoster(), meta: [{ key: 'garage', biz: 'महालक्ष्मी ट्रैवल्स' }] };

/* The three panes, each rendered in Hindi, with a recent face on the first so that step draws its list
 * rather than its empty sentence. */
function hindiPanes(src) {
  const l = load({ lang: 'hi', recent: ['u-d1'], src: src });
  const out = [];
  out.push(l.Login.render(model({ cache: HI_CACHE })));
  l.Login._goto('who', 'driver', null);
  out.push(l.Login.render(model({ cache: HI_CACHE })));
  l.Login._goto('pin', 'driver', person('u-d1', 'चालक १', 'driver'));
  out.push(l.Login.render(model({ cache: HI_CACHE })));
  return { win: l.win, html: out.join('\n') };
}

function latinInTable(win) {
  const out = [];
  for (const id of win.W.ids()) {
    if (!/^lg[A-Z]/.test(id)) continue;
    const e = win.W.entry(id);
    const hi = e && e.hi;
    if (hi === undefined || hi === null || hi === '') { out.push(id + ' has no Hindi'); continue; }
    if (/[A-Za-z]/.test(String(hi))) out.push(id + ' is English in Hindi: ' + hi);
  }
  return out;
}

test('the leak detector rejects an unmarked word and allows a marked one', () => {
  assert.deepEqual(englishLeaks('<p>Enter your PIN [lgEnterPin]</p>'), []);
  assert.deepEqual(englishLeaks('<p>पिन डालें</p>'), []);
  assert.strictEqual(englishLeaks('<p>Enter your PIN</p>').length, 1);
});

test('every word the login registers has a real Hindi value, including the ones only a refusal draws', () => {
  const l = load({ lang: 'hi' });
  const ids = l.win.W.ids().filter((i) => /^lg[A-Z]/.test(i));
  assert(ids.length >= 29, 'only ' + ids.length + ' login ids: the table shrank');
  assert.deepEqual(latinInTable(l.win), []);
});

test('in Hindi, every fixed word on all three login steps is Hindi - never silently English', () => {
  const leaks = englishLeaks(hindiPanes().html);
  assert.deepEqual(leaks, [], 'English reached a Hindi reader on the login: ' + leaks.join(', '));
});

test("the owner's own Hindi is used where v1 already said the same thing", () => {
  const l = load({ lang: 'hi' });
  // i18n-hi.js lines 89 and 90: his login words, not a second translation of them.
  assert.strictEqual(l.win.w('lgEnterPin'), 'पिन डालें');
  assert.strictEqual(l.win.w('lgWrongPin'), 'गलत पिन');
  assert.strictEqual(l.win.w('lgWho'), 'आप कौन हैं?');
  assert.strictEqual(l.win.w('lgRecent'), 'इस फ़ोन पर हाल के');
});

reddens('a login word left English in the Hindi table', async () => {
  const src = mutant("lgEnterPin: { en: 'Enter your PIN', hi: 'पिन डालें' }",
                     "lgEnterPin: { en: 'Enter your PIN', hi: 'Enter your PIN' }");
  assert.deepEqual(latinInTable(load({ lang: 'hi', src: src }).win), []);
});

reddens('a login word with its Hindi taken away, back to the silent English fallback', async () => {
  const src = mutant("lgRoleDriver: { en: 'Driver', hi: 'ड्राइवर' }",
                     "lgRoleDriver: { en: 'Driver', hi: '' }");
  assert.deepEqual(latinInTable(load({ lang: 'hi', src: src }).win), []);
});

reddens('a fixed word hard-coded in a pane instead of registered, so Hindi mode draws English', async () => {
  const src = mutant("'<p class=\"lg-tag\">' + esc(say('lgEnterPin')) + '</p>'",
                     "'<p class=\"lg-tag\">Enter your PIN</p>'");
  assert.deepEqual(englishLeaks(hindiPanes(src).html), []);
});

/* ===================================================================================================
 * run
 * =================================================================================================== */

Promise.all(waiting).then(function () {
  if (fails) { console.log('\n' + fails + ' FAILED'); process.exit(1); }
  console.log('\nall ok');
});

/* Tests for ui/overlay.js and the overlay rules of ui/components.css - sheet, confirmation dialog, toast.
 * Run: node test_ui_overlay.js     Exits non-zero on any failure. No dependencies.
 *
 * WHY A REAL BROWSER. These are the only components that move, and the only ones that take focus away from the page.
 * What matters about them is exactly what a hand-written fake DOM would get wrong by construction: Escape firing
 * `cancel`, the page behind going inert, Tab staying inside, a click on the backdrop having the dialog as its target,
 * a transition starting only because the style changed between two frames. So the behaviour tests drive REAL Chrome
 * over the DevTools protocol with REAL key and mouse events (Input.dispatchKeyEvent / dispatchMouseEvent), using only
 * node's built-in WebSocket. The Chrome here is current, not 109; nothing the overlays use is newer than 109 and the
 * deny-list in test_ui_components.js still guards the stylesheet. If no Chrome is found the browser tests FAIL (they do
 * not skip); OVERLAY_NO_BROWSER=1 skips them, loudly, and the summary line says how many did not run.
 *
 * Every behaviour is a CHECKER: an async function (env) -> [failure strings], where env = {js, css} is the source of
 * overlay.js and of components.css. The real test asserts the real source gives []. Each checker then has a
 * self-test that feeds it a MUTANT (the source with one thing broken) and demands a non-empty answer, so no test
 * here can pass because it is blind. OVERLAY_JS=<path> and COMPONENTS_CSS=<path> point the whole suite at another
 * copy (to run it against a broken file from outside).
 *
 * THE CLOCK. Almost every wait this suite used to make was waiting out a real animation: a 250ms enter, a 180ms
 * exit, and a margin on top. Fifty-seven of them came to 174 of the suite's 181 seconds, which is why the pre-push
 * hook skipped this file. Nothing about WHAT is tested needs the wall clock, so two things changed and no check
 * changed the duration it asserts. First, a test page's transition durations are divided by MOTION_SCALE; overlay.js
 * reads its own exit timer back from the computed transition duration, so its timers scale with them and the sequence
 * is unchanged, just quicker. Second, the sleeps became H.settled(), which waits for the state the test was actually
 * waiting for - every overlay mounted and nothing mid-transition - and is therefore both faster and STRICTER than a
 * fixed sleep, which can end mid-transition on a loaded machine.
 *
 * The declared durations themselves are read unscaled, by the motion checks that ask Chrome what it resolved from the
 * stylesheet. Eight pages still run on the real clock ({realMotion: true}, each saying why at its own checker): the
 * end-to-end exit timing, the reduced-motion frame sampling, a toast's own ms, an Escape or a pending-timer read that
 * has to land inside a real transition, and the duration read itself. If the scaling ever stopped standing in for the
 * real thing, those are what notices. The one budget that was shortened - the exit check's 3000ms give-up, now 1200 -
 * cannot change a verdict, because that check already calls anything over 450ms a failure.
 *
 * NATIVE FOCUS RESTORE. Current Chrome puts focus back on whatever was focused before showModal() when the dialog
 * closes. That would make every focus-restore test pass even if overlay.js did nothing, so those tests run with the
 * native restore switched off (a shim that blurs after close(), the worst case on an older Chrome). Only then does
 * the test see overlay.js's own restore. */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');

const JS_FILE = process.env.OVERLAY_JS || path.join(__dirname, 'ui', 'overlay.js');
const CSS_FILE = process.env.COMPONENTS_CSS || path.join(__dirname, 'ui', 'components.css');
const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null);
const TOKENS = fs.readFileSync(path.join(__dirname, 'ui', 'tokens.css'), 'utf8');
const ICONS = fs.readFileSync(path.join(__dirname, 'ui', 'icons.js'), 'utf8');
const LIVE = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
const REAL = { js: read(JS_FILE), css: read(CSS_FILE) };
// Pointed at another copy (OVERLAY_JS / COMPONENTS_CSS) the suite is being run against a broken file to watch it go red.
// The self-tests (a checker fed a mutant of the REAL files) mean nothing then, and their mutations would not apply to a
// file that is already broken, so they are left out of such a run and the summary says how many.
const EXTERNAL = !!(process.env.OVERLAY_JS || process.env.COMPONENTS_CSS);
const needCss = () => { if (REAL.css === null) throw new Error(path.relative(__dirname, CSS_FILE) + ' does not exist'); return REAL.css; };
const needEnv = (env) => {
  if (env.js === null) throw new Error(path.relative(__dirname, JS_FILE) + ' does not exist');
  if (env.css === null) throw new Error(path.relative(__dirname, CSS_FILE) + ' does not exist');
  return env;
};

/* ---------- a test runner that waits for async tests ----------
 * Tests run OVERLAY_LANES at a time (4 by default). Each one opens its own page, so they never meet, and the suite
 * spends far more of its time waiting than working. The exceptions are the tests that assert a WALL-CLOCK figure --
 * how long an exit takes, how long a toast lives, a fade sampled frame by frame, an Escape that has to arrive
 * mid-exit. Those are declared {solo: true} and run with nothing else in flight, because a duration measured on a
 * loaded machine is not the duration they exist to check. Output stays in declaration order whatever finishes first. */
const queue = [];
let fails = 0, skipped = 0, selfSkipped = 0, unmeasured = 0;
function test(name, fn, o) { queue.push({ name, fn, browser: !!(o && o.browser), solo: !!(o && o.solo), selfTest: /\b(goes|go) red\b/.test(name) }); }
const NO_BROWSER = process.env.OVERLAY_NO_BROWSER === '1';
const LANES = Math.max(1, Number(process.env.OVERLAY_LANES || 4));
async function runQueue() {
  // OVERLAY_ONLY: for iterating on one test; a full run never sets it.
  const todo = queue.filter((t) => !process.env.OVERLAY_ONLY || new RegExp(process.env.OVERLAY_ONLY).test(t.name));
  const lines = new Array(todo.length).fill(null);          // null = still running; false = finished with nothing to print
  let shown = 0;
  const show = () => { while (shown < todo.length && lines[shown] !== null) { const l = lines[shown++]; if (l !== false) console.log(l); } };
  const one = async (t, i) => {
    if ((EXTERNAL || process.env.OVERLAY_SKIP_SELFTESTS === '1') && t.selfTest) { selfSkipped++; lines[i] = false; return; }   // OVERLAY_SKIP_SELFTESTS=1: the quick run
    if (t.browser && NO_BROWSER) { lines[i] = ' SKIP ' + t.name + '  (OVERLAY_NO_BROWSER=1)'; skipped++; return; }
    let timer;
    const t0 = Date.now();
    const took = () => (process.env.OVERLAY_TIMES ? '  [' + (Date.now() - t0) + 'ms]' : '');   // OVERLAY_TIMES=1 to see where the time goes
    try {
      await Promise.race([Promise.resolve().then(t.fn), new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('test timed out after 90s')), 90000); })]);
      lines[i] = '  ok  ' + t.name + took();
    } catch (e) {
      if (e && e.unmeasurable) { lines[i] = ' SKIP ' + t.name + took() + '\n        NOT MEASURED: ' + e.message; unmeasured++; }
      else { lines[i] = ' FAIL ' + t.name + took() + '\n        ' + String(e && e.message || e).split('\n').join('\n        ') + (process.env.OVERLAY_STACK ? '\n' + e.stack : ''); fails++; }
    }
    clearTimeout(timer);
  };
  let next = 0, active = 0, soloRunning = false;
  await new Promise((done) => {
    const pump = () => {
      while (next < todo.length && !soloRunning) {
        const t = todo[next];
        if (t.solo ? active > 0 : active >= LANES) break;    // a solo test waits for a clear machine, then holds it
        const i = next++; active++; if (t.solo) soloRunning = true;
        one(t, i).then(() => { active--; if (t.solo) soloRunning = false; show(); pump(); });
      }
      if (!active && next >= todo.length) done();
    };
    pump();
  });
  show();
}
/* "I could not measure that here" is not "that passed". A handful of checks assert a WALL-CLOCK figure, and a machine
 * too busy to run its own timers on time cannot answer them: the toast-duration check leaves 220ms of margin, and a
 * page that comes back from a 700ms wait after 1150ms has measured nothing. Such a check reports SKIPPED, with the
 * reason, and the summary says the run was not a full pass -- the same rule as SLOW in scripts/run-tests.py, which
 * prints what it left out because a silent cap reads as "everything passed". Two things must not happen: it must not
 * read as a PASS, which would make it decoration on exactly the slow machines this suite exists for, and it must not
 * read as a FAILURE, because this suite gates every push and a gate that blocks for something that is not a defect is
 * how a gate ends up bypassed with --no-verify. So: loud, counted, and exit 0. */
function unmeasurable(why) { const e = new Error(why); e.unmeasurable = true; return e; }
const hits = (failures, why) => assert(failures.length > 0, why);
const none = (failures) => { assert(Array.isArray(failures), 'a checker returned ' + typeof failures + ', not a list of failures'); if (failures.length) assert.fail(failures.length + ' failure(s):\n  - ' + failures.join('\n  - ')); };
// Replace in a source; THROWS if nothing matched, so a mutant that stopped applying fails loudly instead of passing.
function mutate(src, from, to) {
  if (EXTERNAL) return src;                 // see EXTERNAL above: the self-tests that use this are not run
  if (src === null) throw new Error('nothing to mutate: the file does not exist');
  const hit = from instanceof RegExp ? from.test(src) : src.includes(from);
  if (!hit) throw new Error('self-test mutation did not apply, target not found: ' + from);
  return from instanceof RegExp ? src.replace(from, to) : src.split(from).join(to);
}
const mJs = (from, to) => ({ js: mutate(REAL.js, from, to), css: REAL.css });
const mCss = (from, to) => ({ js: REAL.js, css: mutate(REAL.css, from, to) });

/* =====================================================================================================
 * A MINIMAL CHROME DEVTOOLS CLIENT (node's built-in WebSocket; no puppeteer)
 * ===================================================================================================== */
function chromePath() {
  const c = [process.env.CHROME_BIN, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'];
  return c.find((p) => p && fs.existsSync(p)) || null;
}
let browserPromise = null;
function browser() {
  if (!browserPromise) browserPromise = launch();
  return browserPromise;
}
async function launch() {
  const exe = chromePath();
  if (!exe) throw new Error('no Chrome found (set CHROME_BIN, or OVERLAY_NO_BROWSER=1 to skip the browser tests and say so)');
  if (typeof WebSocket !== 'function') throw new Error('this node has no built-in WebSocket (needs node 22+)');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ov-chrome-'));
  const proc = spawn(exe, ['--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + dir, '--no-first-run', '--no-default-browser-check', '--disable-gpu',
    '--disable-extensions', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const url = await new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => reject(new Error('Chrome did not start: ' + buf.slice(0, 300))), 20000);
    proc.stderr.on('data', (d) => { buf += d; const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf); if (m) { clearTimeout(timer); resolve(m[1]); } });
    proc.on('error', (e) => { clearTimeout(timer); reject(e); });
    proc.on('exit', () => { clearTimeout(timer); reject(new Error('Chrome exited early: ' + buf.slice(0, 300))); });
  });
  proc.stderr.removeAllListeners('data'); proc.stderr.destroy();     // the URL is all we needed; an open pipe would keep node alive
  const ws = new WebSocket(url);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('could not open the DevTools socket')); });
  const b = { proc, ws, dir, id: 0, pending: new Map(), listeners: new Set(), tmp: 0, free: [] };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && b.pending.has(m.id)) { const { res, rej } = b.pending.get(m.id); b.pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
    else if (m.method) b.listeners.forEach((l) => l(m));
  };
  b.send = (method, params, sessionId) => new Promise((res, rej) => { const id = ++b.id; b.pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params: params || {}, sessionId })); });
  return b;
}
async function closeBrowser() {
  if (!browserPromise) return;
  const b = await browserPromise.catch(() => null);
  if (!b) return;
  try { b.ws.close(); } catch (e) { /* already closed */ }
  const gone = new Promise((res) => b.proc.once('exit', res));
  b.proc.kill();
  const t = setTimeout(() => b.proc.kill('SIGKILL'), 3000);
  await gone; clearTimeout(t);
  try { fs.rmSync(b.dir, { recursive: true, force: true }); } catch (e) { /* best effort */ }
}

// In-page helpers every test page gets (window.H). Plain functions the checks call from inside the page.
const HELPERS = `
window.H = {
  sleep: function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); },
  // Poll until fn is true, for at most ms of wall clock. Resolves true, or false if the time ran out.
  untilAbs: function (fn, ms) {
    return new Promise(function (res) {
      var t0 = Date.now();
      (function tick() { var v = false; try { v = fn(); } catch (e) { v = false; }
        if (v) return res(true); if (Date.now() - t0 > ms) return res(false); setTimeout(tick, 10); })();
    });
  },
  // The same, with the budget read in the page's own clock: where the transitions were divided by MOTION_SCALE
  // (see THE CLOCK), a caller asking for 3000ms is asking for 120 times the longest thing it can be waiting for,
  // and on a mutant that never gets there the suite pays all of it. The floor keeps every wait generous anyway.
  // A wait that is NOT for motion - a toast's own ms, a frame arriving - belongs on an unscaled page or in untilAbs.
  until: function (fn, ms) {
    return H.untilAbs(fn, Math.max(1000, Math.round((ms || 2500) / (window.__motionScale || 1))));
  },
  // n animation frames and then a task, for letting pending work run where there is no animation to wait for.
  frames: function (n) {
    return new Promise(function (res) {
      (function step(k) { if (k <= 0) return setTimeout(res, 0); requestAnimationFrame(function () { step(k - 1); }); })(n || 2);
    });
  },
  // Resolves once every overlay on the page is mounted and nothing inside one is mid-transition. This is what the
  // sleeps in this suite were really waiting for (see THE CLOCK above). An overlay that is LEAVING has had its
  // data-mounted removed, so this also waits out its exit and its removal.
  //
  // It is PATIENT, and it THROWS rather than giving up quietly. A transition only advances when the page gets
  // animation frames, and a page sharing a machine with others can go a long time without one; a wait that gave up
  // would hand the test a panel still sitting at its entering transform, which reads as a sheet in the wrong place
  // rather than as a wait that was too short. Waiting costs nothing when the overlays work, and where they never
  // settle the throw is the answer the test wanted anyway.
  inflight: function () {
    var out = [], i;
    var all = document.querySelectorAll('[data-v2].ov-modal, [data-v2] .ov-toast');
    for (i = 0; i < all.length; i++) if (!all[i].hasAttribute('data-mounted')) out.push(all[i].className + ' is not mounted');
    var moving = document.querySelectorAll('[data-v2].ov-modal .ov-panel, [data-v2].ov-modal .ov-scrim, [data-v2] .ov-toast');
    for (i = 0; i < moving.length; i++) {
      var a = moving[i].getAnimations();
      if (a.length) out.push(moving[i].className + ' still transitioning ' + a.map(function (x) { return x.transitionProperty + ':' + x.playState; }).join('+'));
    }
    return out.join('; ') || 'nothing';
  },
  settled: function () {
    return H.untilAbs(function () { return H.inflight() === 'nothing'; }, 3000).then(function (ok) {
      if (!ok) throw new Error('an overlay never finished entering or leaving: ' + H.inflight());
      return true;
    });
  },
  center: function (el) { var r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; },
  // What a screen reader says: no aria-hidden subtree, no drawing without a title, nothing display:none.
  spoken: function spoken(n) {
    if (n.nodeType === 3) return n.data;
    if (n.nodeType !== 1) return '';
    if (n.getAttribute('aria-hidden') === 'true') return '';
    if (n.tagName.toLowerCase() === 'svg' && n.getAttribute('role') !== 'img') return '';
    if (getComputedStyle(n).display === 'none') return '';
    var s = '', c = n.firstChild;
    while (c) { s += H.spoken(c); c = c.nextSibling; }
    return s;
  },
  squash: function (s) { return String(s).replace(/\\s+/g, ' ').trim(); },
  sheet: function () { return document.querySelector('dialog.ov-sheet'); },
  confirm: function () { return document.querySelector('dialog.ov-confirm'); },
  toasts: function () { return [].slice.call(document.querySelectorAll('dialog.ov-toast')); },
  live: function () { return H.toasts().filter(function (t) { return t.hasAttribute('data-mounted'); }); },
  scale: function (el) { var m = /^matrix\\(([^,]+),/.exec(getComputedStyle(el).transform); return m ? parseFloat(m[1]) : 1; }
};
`;
// Simulates a Chrome whose close() does not hand focus back: after the real close, drop focus to the body.
const NO_NATIVE_RESTORE = `
(function () {
  var close = HTMLDialogElement.prototype.close;
  HTMLDialogElement.prototype.close = function () { close.apply(this, arguments); if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); };
})();
`;
// Records every timer still pending (window.__pending: id -> ms), so a test can ask what an overlay left behind.
const TRACK_TIMERS = `
(function () {
  var st = window.setTimeout, ct = window.clearTimeout; window.__pending = {};
  window.setTimeout = function (f, ms) { var id = st(function () { delete window.__pending[id]; f(); }, ms); window.__pending[id] = ms; return id; };
  window.clearTimeout = function (id) { delete window.__pending[id]; ct(id); };
})();
`;
/* Every transition time in a stylesheet served to a test page, divided by this (see THE CLOCK above). It scales
 * overlay.js's own timers with it, because dismiss() and leave() read the duration back from the computed style.
 * A page opened with {realMotion: true} gets the stylesheet exactly as written. */
const MOTION_SCALE = 10;
const scaleTimes = (value) => value.replace(/(\d*\.?\d+)(ms|s)\b/g, (all, n, unit) => {
  const ms = (unit === 's' ? parseFloat(n) * 1000 : parseFloat(n)) / MOTION_SCALE;
  return (Math.round(ms * 1000) / 1000) + 'ms';
});
// Only inside a transition declaration: a cubic-bezier's numbers carry no unit, so they are left alone.
const fastCss = (css) => css.replace(/(transition(?:-duration|-delay)?\s*:)([^;}]*)/g, (all, prop, value) => prop + scaleTimes(value));

const DEFAULT_BODY = `<div data-v2 id="app"><button class="btn" id="opener">Open</button> <button class="btn" id="other">Other</button> <input class="field" id="field" aria-label="Field"> <a class="btn" id="link" href="#x">Link</a></div>
<button class="btn" id="low" style="position:fixed;left:0;bottom:40px">Low</button>`;
function pageHtml(env, o) {
  o = o || {};
  const styled = o.realMotion ? (s) => s : fastCss;
  return '<!doctype html><html lang="en"' + (o.htmlAttrs || '') + '><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + (o.live ? '<style>' + styled(LIVE) + '</style>' : '') + '<style>' + TOKENS + '</style><style>' + styled(env.css) + '</style>' + (o.head || '') + '</head><body>'
    + (o.body || DEFAULT_BODY) + '<script>window.__motionScale = ' + (o.realMotion ? 1 : MOTION_SCALE) + ';</script>'
    + '<script>' + ICONS + '</script><script>' + HELPERS + '</script>' + (o.noNativeRestore ? '<script>' + NO_NATIVE_RESTORE + '</script>' : '') + (o.trackTimers ? '<script>' + TRACK_TIMERS + '</script>' : '') + (o.preScript ? '<script>' + o.preScript + '</script>' : '')
    + '<script>' + env.js + '</script></body></html>';
}
const KEYS = { Escape: [27, 'Escape'], Tab: [9, 'Tab'], Enter: [13, 'Enter'] };
class Page {
  constructor(b, sessionId, targetId) { this.b = b; this.sid = sessionId; this.tid = targetId; this.errors = []; this.waiters = []; }
  send(m, p) { return this.b.send(m, p, this.sid); }
  onEvent(m) {
    if (m.sessionId !== this.sid) return;
    if (m.method === 'Runtime.exceptionThrown') this.errors.push('exception: ' + (m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') this.errors.push('console.error: ' + m.params.args.map((a) => a.value || a.description).join(' '));
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') this.errors.push('log: ' + m.params.entry.text + ' ' + (m.params.entry.url || ''));
    if (m.method === 'Page.loadEventFired') this.waiters.splice(0).forEach((w) => w());
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.exceptionDetails) throw new Error('in the page: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
    return r.result.value;
  }
  async key(name, mods) {
    const [vk, code] = KEYS[name];
    const base = { key: name, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: mods || 0 };
    await this.send('Input.dispatchKeyEvent', Object.assign({ type: 'keyDown' }, base, name === 'Enter' ? { text: '\r' } : {}));
    await this.send('Input.dispatchKeyEvent', Object.assign({ type: 'keyUp' }, base));
  }
  async mouse(type, x, y) {
    await this.send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: type === 'mouseMoved' ? 0 : 1 });
  }
  async wheel(x, y, deltaY) { await this.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY }); }
  async click(x, y) { await this.mouse('mouseMoved', x, y); await this.mouse('mousePressed', x, y); await this.mouse('mouseReleased', x, y); }
  async clickEl(selector) { const c = await this.eval('(function(){var e=document.querySelector(' + JSON.stringify(selector) + ');if(!e)return null;return H.center(e)})()'); if (!c) throw new Error('nothing matches ' + selector); await this.click(c.x, c.y); }
  async drag(from, to) { await this.mouse('mouseMoved', from.x, from.y); await this.mouse('mousePressed', from.x, from.y); await this.mouse('mouseMoved', to.x, to.y); await this.mouse('mouseReleased', to.x, to.y); }
  until(expr, ms) { return this.eval('H.until(function(){return ' + expr + '},' + (ms || 2500) + ')'); }
  // Hand the target back to the pool instead of closing it: about:blank throws away the document, its realm and
  // every timer and animation in it, which is all the isolation one test page needs from the next.
  // The blank page is waited for BEFORE the target goes back in the pool. openPage waits for a load event, so a
  // stray one still in flight from this navigation would otherwise satisfy the NEXT page's wait and hand a test a
  // document that had not loaded yet.
  async close() {
    this.b.listeners.delete(this.listener);
    const reusable = await (async () => {
      try {
        const blanked = new Promise((r) => this.waiters.push(r));
        this.b.listeners.add(this.listener);
        await this.send('Page.navigate', { url: 'about:blank' });
        return await Promise.race([blanked.then(() => true), new Promise((r) => setTimeout(() => r(false), 2000))]);
      } catch (e) { return false; }
    })();
    this.b.listeners.delete(this.listener);
    if (reusable) { this.b.free.push({ targetId: this.tid, sessionId: this.sid }); return; }
    try { await this.b.send('Target.closeTarget', { targetId: this.tid }); } catch (e) { /* gone already */ }
  }
}
/* A pool of DevTools targets. A run opens 312 pages, and creating a tab and attaching to it costs about 32ms of the
 * 67ms a page open takes -- 10 seconds over a run, for tabs that are thrown away immediately. The per-target setup
 * (the three enables and focus emulation) survives a navigation, so it is done once; the emulation that differs per
 * page (size, colour scheme, reduced motion) is set in openPage every time. */
async function acquireTarget(b) {
  const spare = b.free.pop();
  if (spare) return spare;
  const { targetId } = await b.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await b.send('Target.attachToTarget', { targetId, flatten: true });
  await Promise.all([b.send('Page.enable', {}, sessionId), b.send('Runtime.enable', {}, sessionId),
    b.send('Log.enable', {}, sessionId), b.send('Emulation.setFocusEmulationEnabled', { enabled: true }, sessionId)]);
  return { targetId, sessionId };
}
// open a fresh page: o = {live, body, htmlAttrs, head, width, height, reduced, dark, noNativeRestore, trackTimers,
// preScript, realMotion}. realMotion serves the stylesheet unscaled; see THE CLOCK at the top.
async function openPage(env, o) {
  needEnv(env); o = o || {};
  const b = await browser();
  const file = path.join(b.dir, 'page-' + (++b.tmp) + '.html');
  fs.writeFileSync(file, pageHtml(env, o));
  const { targetId, sessionId } = await acquireTarget(b);
  const p = new Page(b, sessionId, targetId);
  p.listener = (m) => p.onEvent(m); b.listeners.add(p.listener);
  const features = [];
  // Both preferences are ALWAYS pinned. Left alone, a page inherits the operating system's setting, and a probe called
  // "light" turns dark on a Mac in Dark mode (the suite then disagrees with itself from one desk to the next).
  features.push({ name: 'prefers-reduced-motion', value: o.reduced ? 'reduce' : 'no-preference' });
  features.push({ name: 'prefers-color-scheme', value: o.dark ? 'dark' : 'light' });
  await Promise.all([
    p.send('Emulation.setDeviceMetricsOverride', { width: o.width || 1024, height: o.height || 768, deviceScaleFactor: 1, mobile: false }),
    p.send('Emulation.setEmulatedMedia', { features }),
  ]);
  const loaded = new Promise((r) => p.waiters.push(r));
  await p.send('Page.navigate', { url: 'file://' + file });
  await loaded;
  return p;
}
// run fn(page) on a fresh page and always close it
async function withPage(env, o, fn) {
  const p = await openPage(env, o);
  try { return await fn(p); } finally { await p.close(); }
}

/* =====================================================================================================
 * 1. THE SCRIPT AS A SCRIPT: plain ES5 from a bare tag, four globals, no emoji
 * ===================================================================================================== */
function loadInVm(src) {
  const sandbox = {}; sandbox.window = sandbox;                 // a window and NOTHING else: not even a document
  const ctx = vm.createContext(sandbox);
  const before = Object.keys(sandbox);
  vm.runInContext(src, ctx, { filename: JS_FILE });
  return { win: sandbox, added: Object.keys(sandbox).filter((k) => !before.includes(k)).sort() };
}
// Same tripwire as test_ui_states.js, except that Promise is allowed: confirmDialog returns one (Chrome 109 has it natively).
function es6Syntax(code) {
  const c = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, '""');
  const found = [];
  if (/=>/.test(c)) found.push('arrow function');
  if (/`/.test(c)) found.push('template literal');
  if (/(^|[^\w$.])(let|const|class|import|export|async|await|yield)\s/.test(c)) found.push('let/const/class/import/export/async/await/yield');
  if (/\.\.\./.test(c)) found.push('spread/rest');
  if (/\bmodule\s*\.\s*exports\b|\brequire\s*\(/.test(c)) found.push('CommonJS');
  if (/\bSymbol\b|\bMap\s*\(|\bSet\s*\(|Object\.assign|\.includes\(|\.startsWith\(|\.endsWith\(|\.padStart\(|\.repeat\(|\bArray\.from\b|\.find\(|\.findIndex\(|\bNumber\.is/.test(c)) found.push('ES2015+ library call');
  return found;
}
test('the ES5 tripwire flags each construct it claims to, lets Promise through, and passes plain ES5', () => {
  const bad = ['var f = (a) => a;', 'var s = `x`;', 'let a = 1;', 'const a = 1;', 'class A {}', 'f(...xs);', 'module.exports = 1;', 'var m = new Map();', 'Object.assign({}, a);', 'a.includes(1);', 'async function f() {}', "'x'.repeat(2);"];
  for (const b of bad) hits(es6Syntax(b), 'missed: ' + b);
  assert.deepEqual(es6Syntax('var p = new Promise(function (resolve) { resolve(true); }); // const x => y `z`'), [], 'Promise, and syntax inside a comment, must not be flagged');
  assert.deepEqual(es6Syntax("var s = 'a => b'; function f(a) { return a; }"), [], 'syntax inside a string must not be flagged');
});
test('ui/overlay.js is plain ES5 (no arrow, template literal, let/const/class, spread, module or ES2015 library call; Promise is the one allowed exception)', () => {
  none(es6Syntax(needEnv(REAL).js));
});
const API = ['closeSheet', 'confirmDialog', 'openSheet', 'toast'];
test('ui/overlay.js loads from a bare script with only a window and adds exactly ONE global, V2, holding openSheet, closeSheet, confirmDialog and toast as functions, and none of those four names on window itself', () => {
  const r = loadInVm(needEnv(REAL).js);
  assert.deepEqual(r.added, ['V2'], 'the only global added is V2');
  assert.deepEqual(Object.keys(r.win.V2).sort(), API);
  for (const k of API) { assert.strictEqual(typeof r.win.V2[k], 'function', 'V2.' + k); assert.strictEqual(r.win[k], undefined, 'window.' + k + ' must not exist'); }
  assert.throws(() => loadInVm('var = ;'), /./, 'the loader does not notice a syntax error');
});
test('the ASCII detector sees an emoji, an arrow and a curly quote and spares plain ASCII', () => {
  const nonAscii = (s) => /[^\x00-\x7F]/.test(s);
  assert(nonAscii('x \u{1F68C} y') && nonAscii('a \u2192 b') && nonAscii('\u201cquoted\u201d') && !nonAscii('plain: a{b:c}'));
});
test('ui/overlay.js is pure ASCII, comments included, so no emoji or other font-dependent glyph can be in it (Windows 7 lacks them)', () => {
  assert(!/[^\x00-\x7F]/.test(needEnv(REAL).js), 'a non-ASCII character is in ui/overlay.js');
});

/* =====================================================================================================
 * 2. THE STYLESHEET, AS TEXT: no scale from nothing, transitions not keyframes, classes that exist
 * ===================================================================================================== */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
// Every scale() argument must be at least 0.95: nothing in the real world appears from nothing.
function scaleFailures(css) {
  const out = [];
  for (const m of stripComments(css).matchAll(/scale(?:3d|X|Y|Z)?\(\s*([^)]*)\)/g)) {
    for (const a of m[1].split(',').map((s) => s.trim())) {
      const v = /^-?(?:\d+\.?\d*|\.\d+)$/.test(a) ? parseFloat(a) : NaN;
      if (isNaN(v)) { if (!/^var\(/.test(a)) out.push(m[0] + ': argument "' + a + '" is not a plain number'); }
      else if (v < 0.95) out.push(m[0] + ' starts below 0.95');
    }
  }
  return out;
}
test('the scale checker rejects scale(0), a fraction, scale(.5), scale(0.9), scaleX(0) and scale3d with a small axis, and accepts 0.95, 0.97 and 1', () => {
  for (const b of ['scale(0)', 'scale(0.0)', 'scale(.5)', 'scale(0.9)', 'scale(0.94)', 'scaleX(0)', 'scale(1, 0)', 'scale3d(1, 1, 0)', 'scale(-1)'])
    hits(scaleFailures('.a{transform:' + b + '}'), 'missed: ' + b);
  for (const f of ['scale(0.95)', 'scale(0.97)', 'scale(1)', 'scale(1.02)', 'scale(.95)', 'none']) assert.deepEqual(scaleFailures('.a{transform:' + f + '}'), [], 'false positive: ' + f);
  assert.deepEqual(scaleFailures('/* scale(0) in a comment */ .a{color:red}'), []);
});
test('nothing in ui/components.css enters from scale(0) or any scale under 0.95, and the dialog does enter from a scale in [0.95, 1)', () => {
  const css = needCss();
  none(scaleFailures(css));
  assert(/\.ov-confirm[^{]*\{[^}]*transform:\s*scale\(0\.9[5-9]\)/.test(stripComments(css)), 'the confirmation dialog has no entering scale in [0.95, 1)');
});
const keyframeFailures = (css) => [].concat(stripComments(css).match(/@keyframes[^{]*/g) || [], (stripComments(css).match(/(?:^|[;{\s])animation(?:-[a-z]+)?\s*:/g) || []).map((s) => s.trim()));
test('the keyframe checker sees @keyframes and any animation property, and spares transitions', () => {
  hits(keyframeFailures('@keyframes toast-in{from{opacity:0}}'), 'blind to @keyframes'); hits(keyframeFailures('.a{animation:x 1s}'), 'blind to animation:');
  hits(keyframeFailures('.a{animation-name:x}'), 'blind to animation-name'); assert.deepEqual(keyframeFailures('.a{transition:opacity 100ms ease-out}'), []);
});
test('the overlay rules use transitions and not keyframes, so a rapidly re-triggered toast retargets from where it is instead of restarting (ui/components.css has no @keyframes and no animation property)', () => {
  const css = needCss();
  none(keyframeFailures(css));
  const t = stripComments(css).match(/\.ov-toast[^{]*\{[^}]*transition:/g) || [];
  assert(t.length >= 1, 'no .ov-toast rule declares a transition, so the check above would be satisfied by an overlay that never moves');
});

/* Every class the script can write is styled; none of them is a class the live styles.css already uses. */
const overlayClassesIn = (cls) => Array.from(new Set(cls.filter((c) => /^ov-/.test(c)))).sort();
const styledClasses = (css) => new Set((stripComments(css).match(/\.ov-[\w-]+/g) || []).map((s) => s.slice(1)));
const unstyled = (classes, css) => { const s = styledClasses(css); return classes.filter((c) => !s.has(c)); };
const livecollisions = (classes, live) => classes.filter((c) => new RegExp('\\.' + c + '(?![\\w-])').test(stripComments(live)));
test('the class checkers find a class with no rule and a class the live stylesheet also uses', () => {
  assert.deepEqual(unstyled(['ov-a', 'ov-b'], '[data-v2] .ov-a{x:y}'), ['ov-b']);
  assert.deepEqual(unstyled(['ov-a'], '[data-v2].ov-a{x:y}'), [], 'a compound on the dialog itself counts');
  assert.deepEqual(livecollisions(['ov-a', 'ov-b'], '.ov-a{x:y} .ov-ab{x:y}'), ['ov-a'], 'exact class names only');
  assert.deepEqual(livecollisions(['ov-a'], '/* .ov-a */ .x{y:z}'), []);
});
async function renderedClasses(env) {
  return withPage(env, {}, async (p) => {
    return p.eval(`(function(){
      var op = document.getElementById('opener'); op.focus();
      V2.openSheet('T', '<p>x</p>'); V2.confirmDialog('Q?', { title: 'Sure?', danger: true }); V2.toast('a', { kind: 'ok', ms: 0 }); V2.toast('b', { kind: 'warn', ms: 0 }); V2.toast('c', { kind: 'bad', ms: 0 });
      var all = document.querySelectorAll('*'), set = {}, i, j;
      for (i = 0; i < all.length; i++) for (j = 0; j < all[i].classList.length; j++) set[all[i].classList[j]] = 1;
      return Object.keys(set);
    })()`);
  });
}
test('every ov- class that sheets, confirmation dialogs and toasts (all three kinds) actually put on the page has a rule in ui/components.css', async () => {
  const classes = overlayClassesIn(await renderedClasses(needEnv(REAL)));
  assert(classes.length >= 12, 'only ' + classes.length + ' ov- classes were rendered, so the check sees too little: ' + classes.join(' '));
  assert.deepEqual(unstyled(classes, REAL.css), []);
}, { browser: true });
test('no ov- class the overlays write is a class the live styles.css already styles, so none of the live .sheet / .toast rules can leak in', async () => {
  const classes = overlayClassesIn(await renderedClasses(needEnv(REAL)));
  assert(classes.length >= 12);
  assert.deepEqual(livecollisions(classes, LIVE), []);
  assert(/\.sheet\b/.test(LIVE) && /\.toast\b/.test(LIVE), 'the live app no longer has .sheet/.toast, so this test is guarding nothing');
}, { browser: true });

/* =====================================================================================================
 * 3. THE SHEET (real Chrome)
 * ===================================================================================================== */
const SHEET_BODY = '<p id="inner">hello</p><input id="i1" aria-label="First"><button type="button" id="i2">Second</button>';
const tabbed = async (p, n, mods) => {
  const seen = [];
  for (let i = 0; i < n; i++) {
    await p.key('Tab', mods);
    seen.push(await p.eval("(function(){var a=document.activeElement,s=H.sheet();return a===document.body?'BODY':(s&&s.contains(a)?'sheet:'+(a.id||a.className):'PAGE:'+(a.id||a.tagName))})()"));
  }
  return seen;
};

async function checkSheetIsModalDialog(env) {
  return withPage(env, {}, async (p) => {
    const r = await p.eval(`(function(){
      document.getElementById('opener').focus();
      var d = V2.openSheet('Edit <b>job</b>', '${SHEET_BODY}');
      var lab = d.getAttribute('aria-labelledby'), le = lab && document.getElementById(lab);
      var cl = d.querySelector('.ov-close');
      return { tag: d.tagName, open: d.open, modal: d.matches(':modal'), inDoc: document.body.contains(d), dialogs: document.querySelectorAll('dialog').length,
        title: le ? H.squash(le.textContent) : null, titleEscaped: !d.querySelector('.ov-title b'), inner: !!d.querySelector('#inner'), close: cl ? H.squash(H.spoken(cl)) : null };
    })()`);
    const f = [];
    if (r.tag !== 'DIALOG') f.push('openSheet returned a ' + r.tag + ', not a DIALOG');
    if (!r.open) f.push('the dialog is not open');
    if (!r.modal) f.push('the dialog is not modal (:modal does not match), so the page behind is not inert and Tab is not contained');
    if (!r.inDoc) f.push('the dialog is not in the document');
    if (r.dialogs !== 1) f.push('expected exactly one <dialog> on the page, found ' + r.dialogs);
    if (r.title !== 'Edit <b>job</b>') f.push('aria-labelledby does not lead to the title as plain text, got ' + JSON.stringify(r.title));
    if (!r.titleEscaped) f.push('the title was inserted as markup');
    if (!r.inner) f.push('the markup passed in is not in the sheet');
    if (r.close !== 'Close') f.push('the close control does not say "Close" in words, got ' + JSON.stringify(r.close));
    return f;
  });
}
test('openSheet returns an open, modal <dialog> that is the only dialog on the page, is named by its title (shown as text, not markup), holds the markup it was given, and has a Close button that says Close', async () => {
  none(await checkSheetIsModalDialog(needEnv(REAL)));
}, { browser: true });

async function checkPageBehindIsInert(env) {
  return withPage(env, {}, async (p) => {
    await p.eval(`document.getElementById('opener').focus(); V2.openSheet('T', '${SHEET_BODY}'); H.settled()`);
    const f = [];
    const r = await p.eval(`(function(){
      var o = document.getElementById('other'), c = H.center(o), hit = document.elementFromPoint(c.x, c.y);
      o.focus();
      return { hitIsPageButton: hit === o, hitInSheet: H.sheet().contains(hit), focusedPage: document.activeElement === o };
    })()`);
    if (r.hitIsPageButton || !r.hitInSheet) f.push('a click on the page button behind the sheet would reach it (hit-test did not land in the sheet)');
    if (r.focusedPage) f.push('script could focus a page button while the sheet is open (the page is not inert)');
    for (const [label, mods] of [['Tab', 0], ['Shift+Tab', 8]]) {
      const seen = await tabbed(p, 10, mods);
      const page = seen.filter((s) => /^PAGE:/.test(s));
      if (page.length) f.push(label + ' reached the page behind the sheet: ' + page.join(', '));
      const inside = new Set(seen.filter((s) => /^sheet:/.test(s)));
      if (inside.size < 3) f.push(label + ' visited only ' + inside.size + ' distinct controls in the sheet (' + Array.from(inside).join(', ') + '); the key events may not be reaching the page, which would make the containment check vacuous');
    }
    return f;
  });
}
test('while a sheet is open the page behind it cannot be hit-tested by a pointer, focused by script, or reached by 10 real Tab or Shift+Tab presses, and those presses do cycle through the sheet\'s own controls', async () => {
  none(await checkPageBehindIsInert(needEnv(REAL)));
}, { browser: true });

const ROUTES = ['Escape', 'the Close button', 'a click on the backdrop', 'closeSheet()'];
async function checkSheetCloseRoute(env, route) {
  return withPage(env, { noNativeRestore: true }, async (p) => {
    const pre = await p.eval(`(function(){ document.getElementById('opener').focus(); window.__closed = 0;
      V2.openSheet('T', '${SHEET_BODY}', { onClose: function () { window.__closed++; } }); return document.activeElement.id; })()`);
    const f = [];
    if (pre === 'opener') f.push('focus never left the opener on open, so restoring it proves nothing');
    await p.eval('H.settled()');
    if (route === 'Escape') await p.key('Escape');
    else if (route === 'the Close button') await p.clickEl('dialog.ov-sheet .ov-close');
    else if (route === 'a click on the backdrop') await p.click(4, 4);
    else await p.eval('V2.closeSheet(); 1');
    if (!(await p.until('!H.sheet()', 3000))) f.push('the sheet is still in the document 3s after ' + route);
    await p.eval('H.frames(2)');        // a second onClose would come from the dialog's own close event, a task later
    const post = await p.eval(`({ active: document.activeElement.id || document.activeElement.tagName, closed: window.__closed, open: document.querySelectorAll('dialog[open]').length })`);
    if (post.active !== 'opener') f.push('after ' + route + ' focus is on ' + post.active + ', not the opener');
    if (post.closed !== 1) f.push('after ' + route + ' onClose ran ' + post.closed + ' times, not once');
    if (post.open !== 0) f.push('after ' + route + ' ' + post.open + ' dialogs are still open');
    return f;
  });
}
for (const route of ROUTES) {
  test('a sheet closed by ' + route + ' leaves no dialog behind, calls onClose once, and puts focus back on the element that opened it (checked with Chrome\'s own focus restore switched off)', async () => {
    none(await checkSheetCloseRoute(needEnv(REAL), route));
  }, { browser: true });
}

async function checkNestedSheet(env) {
  return withPage(env, { noNativeRestore: true }, async (p) => {
    const r = await p.eval(`(async function(){
      document.getElementById('opener').focus();
      V2.openSheet('One', '<button type="button" id="ib">Inner</button>'); await H.settled();
      document.getElementById('ib').focus();
      V2.openSheet('Two', '<p>second</p>'); await H.settled();
      var count = document.querySelectorAll('dialog.ov-sheet').length, title = H.sheet().querySelector('.ov-title').textContent;
      V2.closeSheet(); await H.until(function () { return !H.sheet(); }, 3000);
      return { count: count, title: title, active: document.activeElement.id || document.activeElement.tagName, left: document.querySelectorAll('dialog').length };
    })()`);
    const f = [];
    if (r.count !== 1) f.push('opening a second sheet left ' + r.count + ' sheets on the page');
    if (r.title !== 'Two') f.push('the sheet on screen is "' + r.title + '", not the second one');
    if (r.active !== 'opener') f.push('after closing the second sheet focus is on ' + r.active + ', not on the page element that opened the first');
    if (r.left !== 0) f.push(r.left + ' dialogs remain');
    return f;
  });
}
test('opening a second sheet from inside the first replaces it, and closing returns focus to the page element that opened the FIRST (not to the first sheet\'s removed button)', async () => {
  none(await checkNestedSheet(needEnv(REAL)));
}, { browser: true });

async function checkBackdropRules(env) {
  return withPage(env, {}, async (p) => {
    await p.eval(`document.getElementById('opener').focus(); V2.openSheet('Title here', '${SHEET_BODY}'); 1`);
    const settled = await p.until("getComputedStyle(H.sheet().querySelector('.ov-panel')).opacity === '1'", 2000);
    const f = [];
    if (!settled) f.push('the sheet never finished entering');
    const inPanel = await p.eval("H.center(H.sheet().querySelector('.ov-title'))");
    const stillOpen = async () => { await p.eval('H.settled()'); return p.eval('!!H.sheet() && H.sheet().open'); };
    await p.click(inPanel.x, inPanel.y);
    if (!(await stillOpen())) f.push('a click inside the panel closed the sheet');
    await p.drag(inPanel, { x: 4, y: 4 });
    if (!(await stillOpen())) f.push('pressing inside the panel and releasing over the backdrop (a text-selection drag) closed the sheet');
    await p.click(4, 4);
    if (!(await p.until('!H.sheet()', 2500))) f.push('a click on the backdrop did not close the sheet');
    return f;
  });
}
test('a click inside a sheet, and a drag that starts inside and ends on the backdrop, leave it open; a click on the backdrop closes it', async () => {
  none(await checkBackdropRules(needEnv(REAL)));
}, { browser: true });

async function checkRepeatedClose(env) {
  // realMotion: the Escape below has to arrive while the exit is still playing, and a round trip out to Chrome and
  // back cannot be relied on to land inside a scaled 18ms one.
  return withPage(env, { noNativeRestore: true, realMotion: true }, async (p) => {
    await p.eval(`document.getElementById('opener').focus(); window.__closed = 0; V2.openSheet('T', 'x', { onClose: function () { window.__closed++; } }); H.settled()`);
    await p.eval('V2.closeSheet(); V2.closeSheet(); 1');
    await p.key('Escape');
    // H.settled() resolves as soon as the sheet has gone, but a SECOND onClose would arrive from the dialog's own
    // close event one task later (the same lag the close-route check notes above), so let that task have its turn
    // before counting: otherwise a finish() that has lost its guard is read while it has run only once.
    await p.eval('V2.closeSheet(); H.settled().then(function () { return H.frames(2); })');
    const f = [];
    const r = await p.eval('({ closed: window.__closed, sheets: document.querySelectorAll("dialog").length, active: document.activeElement.id })');
    if (r.closed !== 1) f.push('onClose ran ' + r.closed + ' times after closing a closing sheet three ways');
    if (r.sheets !== 0) f.push(r.sheets + ' dialogs remain');
    if (r.active !== 'opener') f.push('focus ended on ' + r.active);
    if (await p.eval('(function(){ try { V2.closeSheet(); V2.closeSheet(); return false; } catch (e) { return String(e); } })()')) f.push('V2.closeSheet() with no sheet open threw');
    if (p.errors.length) f.push('page errors: ' + p.errors.join(' | '));
    return f;
  });
}
test('closing a sheet that is already closing (closeSheet twice, Escape mid-exit) calls onClose once and throws nothing; closeSheet() with nothing open is a no-op', async () => {
  none(await checkRepeatedClose(needEnv(REAL)));
}, { browser: true, solo: true });

/* =====================================================================================================
 * 4. THE CONFIRMATION DIALOG (real Chrome). A dismissed dialog must never read as consent.
 * ===================================================================================================== */
const CONFIRM_ROUTES = [
  { name: 'the Confirm button', want: true, act: (p) => p.clickEl('dialog.ov-confirm .ov-yes') },
  { name: 'the Cancel button', want: false, act: (p) => p.clickEl('dialog.ov-confirm .ov-no') },
  { name: 'Escape', want: false, act: (p) => p.key('Escape') },
  { name: 'a click on the backdrop', want: false, act: (p) => p.click(4, 4) },
  { name: 'Enter pressed the moment it opens (the reflex)', want: false, act: (p) => p.key('Enter') },
  { name: 'a script calling close()', want: false, act: (p) => p.eval('H.confirm().close(); 1') },
  { name: 'a script calling close("confirm")', want: false, act: (p) => p.eval('H.confirm().close("confirm"); 1') },
];
async function checkConfirmRoute(env, route) {
  return withPage(env, { noNativeRestore: true }, async (p) => {
    await p.eval(`document.getElementById('opener').focus(); window.__r = undefined;
      window.__p = V2.confirmDialog('Delete job 12?', {}); window.__p.then(function (v) { window.__r = { v: v, t: typeof v }; }); 1`);
    await p.until("H.confirm() && getComputedStyle(H.confirm().querySelector('.ov-panel')).opacity === '1'", 2000);
    const f = [];
    const pre = await p.eval('({ pending: window.__r === undefined, promise: window.__p instanceof Promise, modal: !!H.confirm() && H.confirm().matches(":modal"), active: document.activeElement.className })');
    if (!pre.promise) f.push('confirmDialog did not return a Promise');
    if (!pre.pending) f.push('the promise was already settled before anyone answered');
    if (!pre.modal) f.push('the confirmation is not a modal <dialog>');
    await route.act(p);
    if (!(await p.until('window.__r !== undefined', 3000))) { f.push('the promise never settled after ' + route.name + ' (a dialog that cannot be dismissed by this route hangs the caller)'); return f; }
    await p.eval('H.settled()');
    const r = await p.eval('({ v: window.__r.v, t: window.__r.t, gone: !H.confirm(), active: document.activeElement.id })');
    if (r.t !== 'boolean') f.push('after ' + route.name + ' the promise resolved with a ' + r.t + ', not a boolean');
    else if (r.v !== route.want) f.push('after ' + route.name + ' the promise resolved ' + r.v + ', expected ' + route.want + (route.want ? '' : ' (a dismissed dialog read as consent)'));
    if (!r.gone) f.push('the dialog is still on the page after ' + route.name);
    if (r.active !== 'opener') f.push('focus is on ' + r.active + ' after ' + route.name + ', not on the opener');
    return f;
  });
}
for (const route of CONFIRM_ROUTES) {
  test('confirmDialog resolves exactly ' + route.want + ' (a boolean, not undefined or a string) after ' + route.name + ', removes itself, and returns focus to the opener', async () => {
    none(await checkConfirmRoute(needEnv(REAL), route));
  }, { browser: true });
}

async function checkConfirmDefaultFocus(env) {
  return withPage(env, {}, async (p) => {
    const a = await p.eval(`(function(){ V2.confirmDialog('Delete job 12?', { danger: true }); var d = H.confirm(), x = document.activeElement;
      return { inDialog: d.contains(x), cls: x.className, text: H.squash(x.textContent) }; })()`);
    const f = [];
    if (!a.inDialog) f.push('focus is not inside the dialog on open');
    if (!/\bov-no\b/.test(a.cls)) f.push('focus starts on "' + a.text + '", not on Cancel, so Enter or Space pressed by reflex would confirm');
    return f;
  });
}
test('a confirmation opens with focus on Cancel, the safe answer, so a reflexive Enter or Space cannot consent', async () => {
  none(await checkConfirmDefaultFocus(needEnv(REAL)));
}, { browser: true });

async function checkConfirmMarkup(env) {
  return withPage(env, {}, async (p) => {
    const r = await p.eval(`(function(){
      V2.confirmDialog('<img src=x id=bad> & "q"', { title: '<b>Sure?</b>', yes: 'Delete <i>it</i>', no: 'Keep <u>it</u>', danger: true });
      var d = H.confirm(), lab = document.getElementById(d.getAttribute('aria-labelledby') || ''), desc = document.getElementById(d.getAttribute('aria-describedby') || '');
      var yes = d.querySelector('.ov-yes'), no = d.querySelector('.ov-no');
      return { role: d.getAttribute('role'), imgInjected: !!document.getElementById('bad'), labelledText: lab ? H.squash(lab.textContent) : null, describedText: desc ? H.squash(desc.textContent) : null,
        yes: yes && H.squash(yes.textContent), no: no && H.squash(no.textContent), yesDanger: !!yes && yes.classList.contains('btn-danger'), noPlain: !!no && !no.classList.contains('btn-danger') && !no.classList.contains('btn-primary'), italic: !!d.querySelector('i'), underline: !!d.querySelector('u'), bold: !!d.querySelector('.ov-title b') };
    })()`);
    const f = [];
    if (r.role !== 'alertdialog') f.push('role is ' + r.role + ', not alertdialog');
    if (r.imgInjected || r.italic || r.underline || r.bold) f.push('text passed in was inserted as markup');
    if (r.labelledText !== '<b>Sure?</b>') f.push('aria-labelledby leads to ' + JSON.stringify(r.labelledText) + ', not the title as plain text');
    if (r.describedText !== '<img src=x id=bad> & "q"') f.push('aria-describedby leads to ' + JSON.stringify(r.describedText) + ', not the question as plain text');
    if (r.yes !== 'Delete <i>it</i>' || r.no !== 'Keep <u>it</u>') f.push('button labels are ' + JSON.stringify([r.yes, r.no]) + ', not the ones passed in as plain text');
    if (!r.yesDanger) f.push('danger:true did not make the confirming button btn-danger');
    if (!r.noPlain) f.push('the Cancel button is styled as an action');
    const d = await p.eval(`(function(){ document.querySelectorAll('dialog').forEach(function (x) { x.remove(); }); V2.confirmDialog('Plain?'); var d = H.confirm();
      return { yes: H.squash(d.querySelector('.ov-yes').textContent), no: H.squash(d.querySelector('.ov-no').textContent), primary: d.querySelector('.ov-yes').classList.contains('btn-primary'), labelled: !!document.getElementById(d.getAttribute('aria-labelledby') || '') }; })()`);
    if (!d.yes || !d.no || d.yes === d.no) f.push('default button labels are ' + JSON.stringify([d.yes, d.no]));
    if (!d.primary) f.push('without danger the confirming button is not btn-primary');
    if (!d.labelled) f.push('with no title the dialog has no accessible name');
    return f;
  });
}
test('a confirmation is an alertdialog named by its title (or its question), described by its question, shows every string passed in as plain text, and styles the confirming button btn-danger only when danger is set', async () => {
  none(await checkConfirmMarkup(needEnv(REAL)));
}, { browser: true });

async function checkConfirmOverSheet(env) {
  return withPage(env, { noNativeRestore: true }, async (p) => {
    await p.eval(`document.getElementById('opener').focus(); V2.openSheet('S', '<button type="button" id="ib">Inner</button>'); window.__r = undefined; H.settled()`);
    await p.eval(`document.getElementById('ib').focus(); V2.confirmDialog('Discard?').then(function (v) { window.__r = { v: v }; }); H.settled()`);
    await p.key('Escape');
    await p.until('window.__r !== undefined', 2500);
    await p.eval('H.settled()');
    const r = await p.eval('({ v: window.__r && window.__r.v, sheet: !!H.sheet() && H.sheet().open, confirm: !!H.confirm(), active: document.activeElement.id })');
    const f = [];
    if (r.v !== false) f.push('Escape on the confirmation resolved ' + r.v);
    if (!r.sheet) f.push('Escape on a confirmation opened over a sheet also closed the sheet');
    if (r.confirm) f.push('the confirmation is still on the page');
    if (r.active !== 'ib') f.push('focus went to ' + r.active + ', not back to the control in the sheet that was focused before the confirmation');
    await p.key('Escape');
    if (!(await p.until('!H.sheet()', 2500))) f.push('a second Escape did not close the sheet');
    if ((await p.eval('document.activeElement.id')) !== 'opener') f.push('after the sheet closed, focus is not on the original opener');
    return f;
  });
}
test('Escape on a confirmation opened over a sheet dismisses only the confirmation (false) and puts focus back inside the sheet; a second Escape closes the sheet', async () => {
  none(await checkConfirmOverSheet(needEnv(REAL)));
}, { browser: true });

/* =====================================================================================================
 * 5. THE TOAST (real Chrome). Says its kind in words, never takes focus, never blocks the page.
 * ===================================================================================================== */
async function checkToastWords(env) {
  return withPage(env, {}, async (p) => {
    const r = await p.eval(`(function(){
      var out = {}, kinds = ['ok', 'warn', 'bad'], i;
      for (i = 0; i < kinds.length; i++) {
        var t = V2.toast('Job saved', { kind: kinds[i], ms: 0 });
        var said = H.squash(H.spoken(t)), seen = H.squash(t.innerText);
        out[kinds[i]] = { said: said, seen: seen, hasMessage: said.indexOf('Job saved') >= 0 && seen.indexOf('Job saved') >= 0, visible: t.getClientRects().length > 0,
          drawings: [].slice.call(t.querySelectorAll('svg')).map(function (s) { return s.getAttribute('aria-hidden'); }) };
      }
      return out;
    })()`);
    const f = [];
    const words = {};
    for (const k of ['ok', 'warn', 'bad']) {
      const e = r[k];
      if (!e.visible) { f.push(k + ': the toast is not rendered'); continue; }
      if (!e.hasMessage) f.push(k + ': the message is missing from what is said or seen: ' + JSON.stringify([e.said, e.seen]));
      const strip = (s) => s.replace('Job saved', '').replace('Close', '').trim();
      const w = strip(e.said), v = strip(e.seen);
      if (!/[A-Za-z]{3,}/.test(w)) f.push(k + ': a screen reader hears no word for the kind, only ' + JSON.stringify(e.said));
      if (!/[A-Za-z]{3,}/.test(v)) f.push(k + ': a sighted reader sees no word for the kind, only ' + JSON.stringify(e.seen));
      if (w !== v) f.push(k + ': the word heard (' + w + ') is not the word seen (' + v + ')');
      words[k] = w;
      if (e.drawings.some((a) => a !== 'true')) f.push(k + ': a drawing in the toast is not aria-hidden, so it would be announced or hide that the words carry the kind');
      if (!e.drawings.length) f.push(k + ': the toast has no drawing, so the test cannot show that the words are not just the drawing');
    }
    if (new Set(Object.values(words)).size !== 3) f.push('the three kinds do not each have their own word: ' + JSON.stringify(words));
    return f;
  });
}
test('a toast names its kind in a word that a screen reader hears and a sighted reader sees (a different word for ok, warn and bad), beside its message, with its drawing hidden from assistive tech', async () => {
  none(await checkToastWords(needEnv(REAL)));
}, { browser: true });

async function checkToastKindFallback(env) {
  return withPage(env, {}, async (p) => {
    const r = await p.eval(`(function(){
      var strip = function (t) { return H.squash(H.spoken(t)).replace('x', '').replace('Close', '').trim(); };
      return { ok: strip(V2.toast('x', { kind: 'ok', ms: 0 })), warn: strip(V2.toast('x', { kind: 'warn', ms: 0 })), bad: strip(V2.toast('x', { kind: 'bad', ms: 0 })),
        missing: strip(V2.toast('x', { ms: 0, kind: undefined })), typo: strip(V2.toast('x ', { kind: 'error', ms: 0 })), proto: strip(V2.toast('x  ', { kind: 'constructor', ms: 0 })), none: strip(V2.toast('x   ')) };
    })()`);
    const f = [];
    if (r.missing !== r.ok) f.push('a toast with no kind says "' + r.missing + '", not the ok word "' + r.ok + '"');
    for (const k of ['typo', 'proto']) if (r[k] !== r.warn) f.push('an unknown kind (' + k + ') says "' + r[k] + '", not the cautious "' + r.warn + '"');
    if (!r.warn || r.warn === r.ok || r.warn === r.bad) f.push('the warn word is not its own word: ' + JSON.stringify([r.ok, r.warn, r.bad]));
    if (r.none !== r.ok) f.push('a toast with no options says "' + r.none + '", not the ok word');
    return f;
  });
}
test('a toast with no kind says the ok word, and an unknown kind (a typo, an inherited property name) says the cautious warn word, never the ok word', async () => {
  none(await checkToastKindFallback(needEnv(REAL)));
}, { browser: true });

async function checkToastLiveRegion(env) {
  return withPage(env, {}, async (p) => {
    const r = await p.eval(`(function(){
      var ok = V2.toast('fine', { kind: 'ok', ms: 0 }), bad = V2.toast('broke', { kind: 'bad', ms: 0 });
      var polite = function (t) { var e = t.closest('[aria-live]'); return e ? e.getAttribute('aria-live') + '/' + e.getAttribute('role') : null; };
      return { okRegion: polite(ok), badRegion: polite(bad), okAlert: !!ok.querySelector('[role="alert"]'), badAlert: !!bad.querySelector('[role="alert"]'), okAssertive: ok.closest('[aria-live="assertive"]') !== null };
    })()`);
    const f = [];
    if (r.okRegion !== 'polite/status') f.push('an ok toast is not inside a polite role=status live region, but ' + r.okRegion);
    if (r.badRegion !== 'polite/status') f.push('a bad toast is not inside the live region, but ' + r.badRegion);
    if (!r.badAlert) f.push('a bad toast message does not carry role=alert');
    if (r.okAlert) f.push('an ok toast carries role=alert and would interrupt');
    return f;
  });
}
test('toasts sit inside a polite role=status live region, and only a bad toast\'s message carries role=alert (attributes only: no screen reader is run here)', async () => {
  none(await checkToastLiveRegion(needEnv(REAL)));
}, { browser: true });

async function checkToastLeavesPageAlone(env) {
  return withPage(env, {}, async (p) => {
    await p.eval("document.getElementById('opener').focus(); 1");
    const r = await p.eval(`(async function(){
      var t = V2.toast('Saved', { kind: 'ok', ms: 0 }); await H.settled();
      var low = document.getElementById('low'), c = H.center(low), hitLow = document.elementFromPoint(c.x, c.y);
      var o = document.getElementById('other'), oc = H.center(o);
      return { modal: t.matches(':modal'), open: t.open, active: document.activeElement.id, lowReachable: hitLow === low, otherReachable: document.elementFromPoint(oc.x, oc.y) === o,
        region: !!t.closest('.ov-toasts') };
    })()`);
    const f = [];
    if (r.modal) f.push('the toast is a modal dialog');
    if (!r.open) f.push('the toast dialog is not open');
    if (r.active !== 'opener') f.push('showing a toast moved focus to ' + r.active);
    if (!r.lowReachable) f.push('the toast lane covers a page button at the bottom-left corner, so clicks on it would not reach the page');
    if (!r.otherReachable) f.push('a toast made the page button unreachable');
    await p.key('Tab');
    const next = await p.eval('document.activeElement.id');
    if (next !== 'other') f.push('Tab from the opener went to ' + next + ', not the next page control: the toast is in the way');
    return f;
  });
}
test('a toast is a non-modal dialog that does not take focus, make the page inert, cover a page control, or get in the way of Tab', async () => {
  none(await checkToastLeavesPageAlone(needEnv(REAL)));
}, { browser: true });

/* The one checker whose every figure is a wall-clock one, so the only one that can be spoiled by a machine too busy
 * to run its timers on time. The tightest margin is 220ms: with a 300ms default (the mutant), the toast is removed
 * 300 + 150 exit + 30 slack = 480ms in, against the 700ms wait. Measured, with other pages in flight, the 700ms wait
 * came back after 1124ms and the toast was still mid-exit - at which point "still there at 700ms" is true of the page
 * and says nothing about the toast's ms, which is what is under test.
 *
 * So the measurement is CHECKED before it is believed, and taken again when it was not a measurement: either the
 * page's own timers ran late, or the default toast is on its way out rather than up. Nothing was loosened to achieve
 * this - every assertion below is the one that was there - and a page that can never be measured says so. */
async function checkToastTiming(env) {
  for (let attempt = 1; ; attempt++) {
    const r = await toastTimingRun(env);
    if (!r.starved) return r.failures;
    if (attempt === 4) throw unmeasurable('every figure in this check is a wall-clock one, and on four tries the page '
      + 'never kept time well enough for them to mean anything (' + r.why + '). The machine is too busy to measure on; '
      + 'this is not a verdict on ui/overlay.js, and it is not a pass either.');
  }
}
async function toastTimingRun(env) {
  // realMotion: every figure here is a toast's ms, which is not a transition duration and does not scale with one.
  // On a scaled page the wait budgets would scale down under it and the test would time out rather than measure.
  return withPage(env, { realMotion: true }, async (p) => {
    const r = await p.eval(`(async function(){
      var t0 = Date.now(), a = V2.toast('quick', { kind: 'ok', ms: 150 }), present0 = a.isConnected;
      var gone = await H.until(function () { return !a.isConnected; }, 2000), took = Date.now() - t0;
      // The three waits below are the only real ones left in the suite, and they stay: they are not waiting out a
      // transition but asserting how long a toast LIVES, which is the thing under test. 1.9s of the suite's total.
      var tA = Date.now();
      var b = V2.toast('default', { kind: 'ok' }); await H.sleep(700); var defaultStill = b.isConnected;
      var slept = Date.now() - tA, leaving = b.isConnected && !b.hasAttribute('data-mounted');
      var c = V2.toast('sticky', { kind: 'bad', ms: 0 }); await H.sleep(900); var stickyStill = c.isConnected;
      var junk = V2.toast('junk', { ms: -5 }); var junk2 = V2.toast('junk2', { ms: 'soon' });
      await H.sleep(300);
      return { present0: present0, gone: gone, took: took, defaultStill: defaultStill, stickyStill: stickyStill, slept: slept, leaving: leaving,
        closeWord: H.squash(H.spoken(c.querySelector('.ov-toast-close'))), junkOk: junk.isConnected && junk2.isConnected };
    })()`);
    const f = [];
    if (!r.present0) f.push('the toast was not on the page when asked for');
    if (!r.gone) f.push('V2.toast(.., {ms: 150}) was still there 2s later');
    if (r.took < 140) f.push('V2.toast(.., {ms: 150}) was gone after ' + r.took + 'ms, before its time');
    if (!r.defaultStill) f.push('a toast with no ms vanished within 700ms');
    if (!r.stickyStill) f.push('V2.toast(.., {ms: 0}) disappeared by itself; 0 must mean "stay until closed"');
    if (r.closeWord !== 'Close') f.push('the toast close control says ' + JSON.stringify(r.closeWord));
    if (!r.junkOk) f.push('a negative or non-numeric ms made the toast vanish at once instead of using the default');
    await p.clickEl('dialog.ov-toast-bad .ov-toast-close');
    if (!(await p.until("!document.querySelector('dialog.ov-toast-bad')", 2000))) f.push('clicking Close did not remove the sticky toast');
    // Was this a measurement at all? A 700ms wait that took 820ms or more says the page's timers are running late
    // by more than the margin these figures leave; a default toast that is mid-exit says the same from the other end.
    const late = r.slept > 820, why = [];
    if (late) why.push('a 700ms wait took ' + r.slept + 'ms');
    if (r.leaving) why.push('the default toast was already leaving, only not yet removed');
    return { failures: f, starved: late || r.leaving, why: why.join(' and ') };
  });
}
test('a toast stays for its ms (150 goes in about 150ms plus its exit), a default one outlasts 700ms, ms 0 stays until Close is clicked, and a nonsense ms falls back to the default', async () => {
  none(await checkToastTiming(needEnv(REAL)));
}, { browser: true, solo: true });

async function checkToastStack(env) {
  return withPage(env, {}, async (p) => {
    const r = await p.eval(`(async function(){
      var i; for (i = 0; i < 7; i++) V2.toast('Toast number ' + i, { kind: 'warn', ms: 0 });
      await H.settled();
      return { live: H.live().map(function (t) { return H.squash(t.querySelector('.ov-toast-text').textContent); }), dom: H.toasts().length };
    })()`);
    const f = [];
    if (r.live.length > 3) f.push(r.live.length + ' toasts are showing at once; a burst of failures must not bury the screen (cap 3)');
    if (r.live.length < 1 || r.live.indexOf('Toast number 6') < 0) f.push('the newest toast is not showing: ' + JSON.stringify(r.live));
    if (r.dom > 3) f.push(r.dom + ' toast elements remain in the document');
    return f;
  });
}
test('seven toasts in a burst leave at most three on screen, and the newest is one of them', async () => {
  none(await checkToastStack(needEnv(REAL)));
}, { browser: true });

async function checkToastRetarget(env) {
  // realMotion: this test exists to watch an exit part-way through and reverse it, which needs the real 150ms.
  return withPage(env, { realMotion: true }, async (p) => {
    const r = await p.eval(`(async function(){
      var t1 = V2.toast('Saved', { kind: 'ok', ms: 0 }), t2 = V2.toast('Saved', { kind: 'ok', ms: 0 });
      var same = t1 === t2, count = H.toasts().length;
      await H.settled();
      t1.querySelector('.ov-toast-close').click();
      var mid = await H.until(function () { var o = parseFloat(getComputedStyle(t1).opacity); return o > 0.15 && o < 0.85; }, 1000);
      var before = parseFloat(getComputedStyle(t1).opacity), tfBefore = getComputedStyle(t1).transform;
      var t3 = V2.toast('Saved', { kind: 'ok', ms: 0 });
      var after = parseFloat(getComputedStyle(t1).opacity);
      var anims = t1.getAnimations().filter(function (a) { return a.transitionProperty === 'opacity'; }).length;
      // NOT H.settled(): the reversed transition is shortened to the distance left to travel, so it ends before
      // the removal the exit had already scheduled (its 150ms plus overlay.js's slack) would have fired. Whether
      // that stale timer was cancelled is the whole point here, so this waits past it.
      await H.sleep(300);
      return { same: same, count: count, mid: mid, before: before, after: after, anims: anims, sameAgain: t3 === t1, finalOpacity: parseFloat(getComputedStyle(t1).opacity), connected: t1.isConnected, total: H.toasts().length };
    })()`);
    const f = [];
    if (!r.same || r.count !== 1) f.push('the same toast asked for twice made ' + r.count + ' elements (same object: ' + r.same + '); it should be one');
    // The retarget can only be judged if the exit was caught in flight. Missing
    // it means the machine did not draw during the transition, not that the
    // toast misbehaved -- and the assertions below all read `before`/`after`
    // from that moment. Anything already wrong (two elements for one toast) is
    // a real finding and still reported; the missed observation alone is not.
    if (!r.mid && f.length === 0) throw unmeasurable('the toast\'s exit was never caught in flight: no frame landed inside the transition');
    if (!r.mid) f.push('never observed the toast mid-exit, so the retarget could not be tested');
    else {
      if (Math.abs(r.after - r.before) > 0.2) f.push('re-triggering mid-exit jumped the opacity from ' + r.before.toFixed(2) + ' to ' + r.after.toFixed(2) + ' instead of reversing from where it was');
      if (r.anims !== 1) f.push('after the retrigger there are ' + r.anims + ' opacity transitions on the toast, not exactly one retargeted transition');
    }
    if (!r.sameAgain) f.push('re-triggering during the exit made a new toast instead of reusing the leaving one');
    if (!r.connected || r.finalOpacity < 0.99) f.push('after the retrigger the toast ended at opacity ' + r.finalOpacity + (r.connected ? '' : ' and was removed'));
    if (r.total !== 1) f.push(r.total + ' toasts at the end, not 1');
    return f;
  });
}
test('asking for the same toast twice makes one, and re-triggering it halfway through its exit reverses the running opacity transition from where it is instead of restarting or duplicating it', async () => {
  none(await checkToastRetarget(needEnv(REAL)));
}, { browser: true, solo: true });

async function checkToastOverModal(env) {
  return withPage(env, {}, async (p) => {
    const r = await p.eval(`(async function(){
      document.getElementById('opener').focus();
      V2.openSheet('S', '<button type="button" id="ib">Inner</button>'); await H.settled();
      document.getElementById('ib').focus();
      var t = V2.toast('Over the sheet', { kind: 'bad', ms: 0 }); await H.settled();
      var c = H.center(t), hit = document.elementFromPoint(c.x, c.y);
      var during = { hit: !!hit && t.contains(hit), active: document.activeElement.id, modal: H.sheet().matches(':modal') };
      V2.closeSheet(); await H.until(function () { return !H.sheet(); }, 3000); await H.frames(2);
      var c2 = H.center(t), hit2 = document.elementFromPoint(c2.x, c2.y);
      return { during: during, after: { connected: t.isConnected, hit: !!hit2 && t.contains(hit2), inModal: !!t.closest('dialog.ov-modal') } };
    })()`);
    const f = [];
    if (!r.during.hit) f.push('with a sheet open, the toast is hidden behind it: a hit-test at the toast lands on something else');
    if (r.during.active !== 'ib') f.push('showing a toast over the sheet moved focus to ' + r.during.active);
    if (!r.during.modal) f.push('the sheet stopped being modal');
    if (!r.after.connected) f.push('the toast was lost when the sheet closed');
    else {
      if (!r.after.hit) f.push('after the sheet closed the toast is no longer visible');
      if (r.after.inModal) f.push('the toast is still inside a dialog that has been removed');
    }
    return f;
  });
}
test('a toast shown while a sheet is open is visible above it (not hidden behind the top layer), does not disturb focus in the sheet, and is still there, in the page again, after the sheet closes', async () => {
  none(await checkToastOverModal(needEnv(REAL)));
}, { browser: true });

async function checkToastText(env) {
  return withPage(env, {}, async (p) => {
    const r = await p.eval(`(function(){
      var t = V2.toast('<img src=x id=pwn> & <b>bold</b>', { kind: 'ok', ms: 0 });
      var e = V2.toast(undefined, { kind: 'warn', ms: 0 }), n = V2.toast(null, { ms: 0 });
      return { text: t.querySelector('.ov-toast-text').textContent, injected: !!document.getElementById('pwn') || !!t.querySelector('b'), emptyOk: e.isConnected && n.isConnected };
    })()`);
    const f = [];
    if (r.text !== '<img src=x id=pwn> & <b>bold</b>') f.push('the message came out as ' + JSON.stringify(r.text));
    if (r.injected) f.push('the message was inserted as markup');
    if (!r.emptyOk) f.push('a toast with no text threw or vanished');
    if (p.errors.length) f.push('page errors: ' + p.errors.join(' | '));
    return f;
  });
}
test('a toast shows its message as plain text (markup is not interpreted), and a toast with undefined or null text does not throw', async () => {
  none(await checkToastText(needEnv(REAL)));
}, { browser: true });

/* =====================================================================================================
 * 6. MOTION, MEASURED IN CHROME. These are the only things that animate, so the rules are checked as the browser
 * resolves them, not as the stylesheet is spelled.
 * ===================================================================================================== */
// Opens one of each overlay and reads, for each animated part, the transition Chrome resolved for the ENTERED state
// (data-mounted present) and for the EXITING state (data-mounted removed).
const READ_MOTION = `
(async function () {
  function ms(s) { return String(s).split(',').map(function (x) { x = x.trim(); return /ms$/.test(x) ? parseFloat(x) : parseFloat(x) * 1000; }); }
  function read(el) {
    var cs = getComputedStyle(el), props = cs.transitionProperty.split(',').map(function (x) { return x.trim(); });
    var d = ms(cs.transitionDuration), dl = ms(cs.transitionDelay), tf = cs.transitionTimingFunction.split(/,(?![^(]*\\))/).map(function (x) { return x.trim(); });
    return props.map(function (p, i) { return { prop: p, dur: d[i % d.length], delay: dl[i % dl.length], timing: tf[i % tf.length] }; });
  }
  function both(host, el) {
    var enter = read(el); host.removeAttribute('data-mounted'); var exit = read(el); host.setAttribute('data-mounted', ''); return { enter: enter, exit: exit };
  }
  document.getElementById('opener').focus();
  V2.openSheet('T', '<p>x</p>'); V2.confirmDialog('Q?'); V2.toast('t', { kind: 'ok', ms: 0 });
  await H.settled();
  var sh = H.sheet(), cf = H.confirm(), ts = H.toasts()[0];
  return {
    sheetPanel: both(sh, sh.querySelector('.ov-panel')), sheetScrim: both(sh, sh.querySelector('.ov-scrim')),
    confirmPanel: both(cf, cf.querySelector('.ov-panel')), confirmScrim: both(cf, cf.querySelector('.ov-scrim')),
    toast: both(ts, ts)
  };
})()`;
function motionFailures(m) {
  const f = [];
  const ENTER_MAX = { sheetPanel: 250, confirmPanel: 250, toast: 250, sheetScrim: 250, confirmScrim: 250 };
  for (const part of Object.keys(m)) {
    const { enter, exit } = m[part], name = part;
    if (!enter.length || !exit.length) { f.push(name + ': no transition resolved'); continue; }
    for (const [state, list] of [['entering', enter], ['exiting', exit]]) for (const t of list) {
      if (!/^(transform|opacity)$/.test(t.prop)) f.push(name + ' ' + state + ': transitions ' + t.prop + ', only transform and opacity may move');
      if (!(t.dur > 0)) f.push(name + ' ' + state + ': ' + t.prop + ' has no duration');
      if (t.dur + t.delay > 300) f.push(name + ' ' + state + ': ' + t.prop + ' runs ' + (t.dur + t.delay) + 'ms, over the 300ms ceiling');
      if (t.timing === 'ease-in') f.push(name + ' ' + state + ': ' + t.prop + ' uses a bare ease-in');
    }
    for (const t of enter) {
      if (t.timing !== 'ease-out') f.push(name + ' entering: ' + t.prop + ' eases with ' + t.timing + ', not ease-out');
      if (t.dur + t.delay > ENTER_MAX[name]) f.push(name + ' entering: ' + t.prop + ' takes ' + (t.dur + t.delay) + 'ms, over ' + ENTER_MAX[name] + 'ms');
    }
    for (const t of exit) if (t.timing !== 'ease-out') f.push(name + ' exiting: ' + t.prop + ' eases with ' + t.timing + ', not ease-out');
    for (const t of enter) {
      const x = exit.find((e) => e.prop === t.prop);
      if (!x) f.push(name + ': ' + t.prop + ' is transitioned entering but not exiting');
      else if (!(x.dur + x.delay < t.dur + t.delay)) f.push(name + ': ' + t.prop + ' exits in ' + (x.dur + x.delay) + 'ms, not quicker than the ' + (t.dur + t.delay) + 'ms it takes to enter');
    }
  }
  if (!m.sheetPanel || !m.confirmPanel || !m.toast) f.push('a part was not measured');
  return f;
}
async function checkMotionComputed(env) {
  // realMotion: this is the test that reads the declared durations, so it must see the stylesheet as written.
  return withPage(env, { realMotion: true }, async (p) => {
    const m = await p.eval(READ_MOTION);
    const f = motionFailures(m);
    if (!Object.values(m).every((x) => x.enter.length >= 1)) f.push('a part has no transition at all');
    if (!m.sheetPanel.enter.some((t) => t.prop === 'transform') || !m.confirmPanel.enter.some((t) => t.prop === 'transform') || !m.toast.enter.some((t) => t.prop === 'transform')) f.push('a panel or toast does not transition transform, so it would not move');
    return f;
  });
}
test('the motion checker rejects a non-compositor property, all, a missing duration, 301ms, a delay that pushes past 300ms, a bare ease-in, an ease-in-out enter, a slow sheet and an exit that is not quicker', () => {
  const ok = (over) => Object.assign({ prop: 'opacity', dur: 200, delay: 0, timing: 'ease-out' }, over);
  const part = (e, x) => ({ sheetPanel: { enter: [e], exit: [x] }, confirmPanel: { enter: [ok()], exit: [ok({ dur: 150 })] }, toast: { enter: [ok()], exit: [ok({ dur: 150 })] }, sheetScrim: { enter: [ok()], exit: [ok({ dur: 150 })] }, confirmScrim: { enter: [ok()], exit: [ok({ dur: 150 })] } });
  const base = part(ok({ dur: 200 }), ok({ dur: 150 }));
  assert.deepEqual(motionFailures(base), [], 'the base case must be clean');
  const cases = {
    'background-color': part(ok({ prop: 'background-color' }), ok({ dur: 150, prop: 'background-color' })), all: part(ok({ prop: 'all' }), ok({ dur: 150, prop: 'all' })), height: part(ok({ prop: 'height' }), ok({ dur: 150, prop: 'height' })),
    'no duration': part(ok({ dur: 0 }), ok({ dur: 150 })), '301ms': part(ok({ dur: 301 }), ok({ dur: 150 })), 'delay past 300': part(ok({ dur: 200, delay: 150 }), ok({ dur: 150 })),
    'bare ease-in enter': part(ok({ timing: 'ease-in' }), ok({ dur: 150 })), 'bare ease-in exit': part(ok(), ok({ dur: 150, timing: 'ease-in' })), 'ease-in-out enter': part(ok({ timing: 'ease-in-out' }), ok({ dur: 150 })),
    'enter over its cap': part(ok({ dur: 260 }), ok({ dur: 150 })), 'exit as slow as enter': part(ok(), ok()), 'exit slower than enter': part(ok(), ok({ dur: 250 })), 'prop not exiting': part(ok(), ok({ prop: 'transform', dur: 100 })),
  };
  for (const k of Object.keys(cases)) hits(motionFailures(cases[k]), 'missed: ' + k);
  hits(motionFailures({}), 'an empty measurement must fail');
});
test('in Chrome every overlay part transitions only transform and opacity, nothing over 300ms (delay included), entering at most 250ms with ease-out and never a bare ease-in, and every part exits quicker than it enters', async () => {
  none(await checkMotionComputed(needEnv(REAL)));
}, { browser: true });

async function checkEntersFromAbove95(env) {
  return withPage(env, {}, async (p) => {
    const r = await p.eval(`(async function(){
      function snap(el, host) {
        var cs = getComputedStyle(el), m = /^matrix\\(([^,]+),[^,]+,[^,]+,[^,]+,[^,]+,([^)]+)\\)/.exec(cs.transform);
        var anims = el.getAnimations().map(function (a) { return a.constructor.name + ':' + a.transitionProperty; });
        return { opacity: parseFloat(cs.opacity), scale: m ? parseFloat(m[1]) : 1, ty: m ? parseFloat(m[2]) : 0, anims: anims };
      }
      var out = {};
      V2.openSheet('T', '<p>x</p>'); var sp = H.sheet().querySelector('.ov-panel'); out.sheet = snap(sp);
      V2.confirmDialog('Q?'); var cp = H.confirm().querySelector('.ov-panel'); out.confirm = snap(cp);
      var t = V2.toast('t', { kind: 'ok', ms: 0 }); out.toast = snap(t);
      await H.settled();
      out.settled = { sheet: snap(sp), confirm: snap(cp), toast: snap(t) };
      return out;
    })()`);
    const f = [];
    for (const k of ['sheet', 'confirm', 'toast']) {
      const e = r[k];
      if (!(e.opacity < 1)) f.push(k + ': first frame is at opacity ' + e.opacity + ', so it appears without fading in');
      if (!e.anims.some((a) => a === 'CSSTransition:opacity')) f.push(k + ': no opacity transition starts on open (' + e.anims.join(', ') + '): it would pop in');
      if (!e.anims.some((a) => a === 'CSSTransition:transform')) f.push(k + ': no transform transition starts on open (' + e.anims.join(', ') + ')');
      const s = r.settled[k];
      if (s.opacity !== 1 || s.scale !== 1 || s.ty !== 0) f.push(k + ': settles at opacity ' + s.opacity + ' scale ' + s.scale + ' ty ' + s.ty + ', not fully shown');
    }
    if (!(r.confirm.scale >= 0.95 && r.confirm.scale < 1)) f.push('the confirmation starts at scale ' + r.confirm.scale + ', outside [0.95, 1)');
    if (!(r.sheet.ty > 0)) f.push('the sheet does not start offset (ty ' + r.sheet.ty + '), so it does not slide');
    if (!(r.toast.ty > 0)) f.push('the toast does not start offset (ty ' + r.toast.ty + ')');
    return f;
  });
}
test('a sheet, a confirmation and a toast each start their enter at opacity below 1 with an opacity and a transform transition running (the dialog from a scale in [0.95, 1)), and settle fully shown', async () => {
  none(await checkEntersFromAbove95(needEnv(REAL)));
}, { browser: true });

async function checkTransformOrigin(env) {
  return withPage(env, {}, async (p) => {
    const r = await p.eval(`(async function(){
      V2.openSheet('T', '<p>x</p>'); V2.confirmDialog('Q?'); await H.settled();
      function o(el) { var cs = getComputedStyle(el), v = cs.transformOrigin.split(' ').map(parseFloat), r = el.getBoundingClientRect(); return { x: v[0], y: v[1], w: r.width, h: r.height }; }
      return { sheet: o(H.sheet().querySelector('.ov-panel')), confirm: o(H.confirm().querySelector('.ov-panel')) };
    })()`);
    const f = [];
    for (const k of ['sheet', 'confirm']) {
      const e = r[k];
      if (Math.abs(e.x - e.w / 2) > 1 || Math.abs(e.y - e.h / 2) > 1) f.push('the ' + k + ' panel scales/moves about (' + e.x + ', ' + e.y + '), not its centre (' + e.w / 2 + ', ' + e.h / 2 + ')');
    }
    return f;
  });
}
test('a modal panel keeps transform-origin at its centre (it is not anchored to whatever opened it)', async () => {
  none(await checkTransformOrigin(needEnv(REAL)));
}, { browser: true });

async function checkOnlyTransitions(env) {
  return withPage(env, {}, async (p) => {
    const r = await p.eval(`(function(){
      V2.openSheet('T', '<p>x</p>'); V2.confirmDialog('Q?'); V2.toast('t', { kind: 'warn', ms: 0 });
      var a = document.getAnimations();
      return { n: a.length, kinds: a.map(function (x) { return x.constructor.name; }) };
    })()`);
    const f = [];
    if (r.n < 6) f.push('only ' + r.n + ' animations are running after opening all three overlays, so the check sees too little');
    const other = r.kinds.filter((k) => k !== 'CSSTransition');
    if (other.length) f.push('animations that are not CSS transitions are running: ' + other.join(', '));
    return f;
  });
}
test('opening a sheet, a confirmation and a toast starts only CSS transitions (at least six of them), never a keyframe animation', async () => {
  none(await checkOnlyTransitions(needEnv(REAL)));
}, { browser: true });

async function checkReducedMotion(env) {
  // realMotion: this samples frames of a real fade and would have nothing to see in a scaled one.
  return withPage(env, { reduced: true, realMotion: true }, async (p) => {
    const r = await p.eval(`(async function(){
      var out = { frames: 0, transforms: {}, opacity: { sheet: [], confirm: [], toast: [] }, anims: {} };
      V2.openSheet('T', '<p>x</p>'); V2.confirmDialog('Q?'); var t = V2.toast('t', { kind: 'ok', ms: 0 });
      var els = { sheet: H.sheet().querySelector('.ov-panel'), confirm: H.confirm().querySelector('.ov-panel'), toast: t };
      Object.keys(els).forEach(function (k) { out.transforms[k] = {}; out.anims[k] = els[k].getAnimations().map(function (a) { return a.transitionProperty; }); });
      await new Promise(function (done) {
        var t0 = performance.now();
        (function frame() {
          out.frames++;
          Object.keys(els).forEach(function (k) { var cs = getComputedStyle(els[k]); out.transforms[k][cs.transform] = 1; out.opacity[k].push(parseFloat(cs.opacity)); });
          if (performance.now() - t0 < 600) requestAnimationFrame(frame); else done();
        })();
      });
      // ...and out again: the exit must not move either
      out.exit = { sheet: {}, confirm: {}, toast: {} }; out.exitOpacity = { sheet: [], confirm: [], toast: [] };
      V2.closeSheet(); H.confirm().querySelector('.ov-no').click(); t.querySelector('.ov-toast-close').click();
      await new Promise(function (done) {
        var t0 = performance.now();
        (function frame() {
          Object.keys(els).forEach(function (k) { if (els[k].isConnected) { var cs = getComputedStyle(els[k]); out.exit[k][cs.transform] = 1; out.exitOpacity[k].push(parseFloat(cs.opacity)); } });
          if (performance.now() - t0 < 400) requestAnimationFrame(frame); else done();
        })();
      });
      return out;
    })()`);
    const f = [];
    // Fewer than ten frames is not a verdict, it is a machine that would not
    // draw. Every transform assertion below reads values sampled from those
    // frames, so on five of them the check has not seen the thing it judges --
    // it has seen a slideshow of it. A CI runner starved enough to manage 8fps
    // reported "only 5 frames were sampled" as a FAILURE of the app's reduced
    // motion, which is a red for something that is not a defect, and a red
    // like that is the reason gates get bypassed.
    if (r.frames < 10) throw unmeasurable('only ' + r.frames + ' frames in 400ms: this machine would not draw fast enough to judge what moved');
    for (const k of ['sheet', 'confirm', 'toast']) {
      const tf = Object.keys(r.transforms[k]);
      if (tf.length !== 1 || tf[0] !== 'none') f.push(k + ': under prefers-reduced-motion its transform took the values ' + tf.join(' | ') + ', so it still moves');
      if (r.anims[k].indexOf('transform') >= 0) f.push(k + ': a transform transition is still running under reduced motion');
      if (r.anims[k].indexOf('opacity') < 0) f.push(k + ': the opacity fade is gone under reduced motion (' + r.anims[k].join(', ') + ')');
      const o = r.opacity[k];
      if (!o.some((x) => x > 0 && x < 1)) f.push(k + ': never seen part-way faded (opacities ' + o.slice(0, 6).join(',') + '...), so the fade is not happening');
      if (o[o.length - 1] !== 1) f.push(k + ': ends at opacity ' + o[o.length - 1]);
      const ex = Object.keys(r.exit[k]);
      if (ex.length === 0) f.push(k + ': the exit was never sampled, so its movement is unchecked');
      else if (ex.length !== 1 || ex[0] !== 'none') f.push(k + ': under prefers-reduced-motion its EXIT took the transforms ' + ex.join(' | ') + ', so it still moves going out');
      if (!r.exitOpacity[k].some((x) => x > 0 && x < 1)) f.push(k + ': the exit is never seen part-way faded (' + r.exitOpacity[k].slice(0, 6).join(',') + ')');
    }
    return f;
  });
}
test('with prefers-reduced-motion: reduce, a sheet, a confirmation and a toast never take a transform other than none going in (600ms of frames) or going out (400ms), run no transform transition, and fade by opacity both ways', async () => {
  none(await checkReducedMotion(needEnv(REAL)));
}, { browser: true, solo: true });

async function checkExitIsAnimatedAndPrompt(env) {
  // realMotion: this is the end-to-end timing check. It asserts the exit takes about the 180ms the stylesheet
  // declares, which is what keeps the scaling above honest everywhere else.
  return withPage(env, { realMotion: true }, async (p) => {
    const f = [];
    const r = await p.eval(`(async function(){
      V2.openSheet('T', '<p>x</p>'); await H.settled();
      // 1200ms, not 3000: this check's verdict is "took more than 450ms", so every ms past that is spent
      // confirming a failure already decided, and giving up at 1200 reads as exactly the same red.
      var t0 = performance.now(); V2.closeSheet(); var start = H.sheet() && getComputedStyle(H.sheet().querySelector('.ov-panel')).opacity;
      await H.until(function () { return !H.sheet(); }, 1200); var took = performance.now() - t0;
      V2.confirmDialog('Q?'); await H.settled();
      var t1 = performance.now(); H.confirm().querySelector('.ov-no').click(); await H.until(function () { return !H.confirm(); }, 1200); var took2 = performance.now() - t1;
      return { took: took, started: start, took2: took2 };
    })()`);
    if (r.started === null || r.started === undefined) f.push('the sheet was gone synchronously, so there is no exit animation');
    if (r.took < 100) f.push('the sheet left in ' + Math.round(r.took) + 'ms; an exit should take around its 180ms transition');
    if (r.took > 450) f.push('the sheet took ' + Math.round(r.took) + 'ms to leave');
    if (r.took2 < 80) f.push('the confirmation left in ' + Math.round(r.took2) + 'ms');
    if (r.took2 > 450) f.push('the confirmation took ' + Math.round(r.took2) + 'ms to leave');
    await p.eval("document.getElementById('opener').focus(); V2.openSheet('T', 'x'); H.settled()");
    await p.key('Escape');
    const stillThere = await p.eval('!!H.sheet() && H.sheet().open');
    if (!stillThere) f.push('Escape closed the sheet on the spot: it skips the exit that every other way of closing plays');
    if (!(await p.until('!H.sheet()', 2500))) f.push('the sheet never left after Escape');
    return f;
  });
}
test('closing a sheet (closeSheet or Escape) or a confirmation plays its exit (it is still on the page after the call, for about the exit duration) and is gone well under half a second later', async () => {
  none(await checkExitIsAnimatedAndPrompt(needEnv(REAL)));
}, { browser: true, solo: true });

async function checkNoMotionClosesAtOnce(env) {
  return withPage(env, { noNativeRestore: true, realMotion: true, head: '<style>[data-v2], [data-v2] * { transition: none !important; }</style>' }, async (p) => {
    const r = await p.eval(`(async function(){
      document.getElementById('opener').focus(); V2.openSheet('T', '<p>x</p>'); await H.frames(2);
      var t0 = performance.now(); V2.closeSheet(); var goneNow = !H.sheet(); var took = performance.now() - t0;
      V2.toast('t', { ms: 80 }); var tt = H.toasts()[0]; await H.until(function () { return !tt.isConnected; }, 1000);
      return { goneNow: goneNow, took: took, active: document.activeElement.id, toastGone: !tt.isConnected };
    })()`);
    const f = [];
    if (!r.goneNow) f.push('with transitions switched off, V2.closeSheet() left the sheet on the page (it waits for a transition that will never end)');
    if (r.active !== 'opener') f.push('focus is on ' + r.active + ' after the instant close');
    if (!r.toastGone) f.push('with transitions off the toast never left');
    return f;
  });
}
test('where nothing animates (transitions forced to none) closeSheet() removes the sheet at once and returns focus, and a toast still leaves, instead of waiting on a transitionend that never comes', async () => {
  none(await checkNoMotionClosesAtOnce(needEnv(REAL)));
}, { browser: true });

/* The app stays open all day on these PCs, so a sheet or a toast must not leave a timer behind once it is gone.
 * The page records every pending timer (the waits here happen in node, so the page has none of its own). */
async function checkNoLeakedTimers(env) {
  // realMotion: an exit timer only lives as long as the exit is playing, and a scaled 18ms one can be gone before
  // the answer gets back to node, which would read as "nothing pending" for an overlay that had in fact left a
  // timer behind. The first case below is tighter still, so it COUNTS IN THE PAGE, in the same task that makes the
  // timer, rather than over a round trip: that way no amount of load can let the timer expire before it is counted.
  return withPage(env, { trackTimers: true, realMotion: true }, async (p) => {
    const f = [], pending = () => p.eval('Object.keys(window.__pending).length'), settled = () => p.eval('H.settled()');
    const expect = async (label, n) => { const got = await pending(); if (got !== n) f.push(label + ': ' + got + ' timer(s) pending, expected ' + n); };
    const expectNow = (label, got, n) => { if (got !== n) f.push(label + ': ' + got + ' timer(s) pending, expected ' + n); };
    expectNow('a sheet replaced while it was closing',
      await p.eval("V2.openSheet('A', 'x'); V2.closeSheet(); V2.openSheet('B', 'y'); Object.keys(window.__pending).length"), 0);
    await p.eval('V2.closeSheet(); H.settled()');
    await expect('after a sheet closed', 0);
    await p.eval("V2.confirmDialog('Q?'); H.confirm().querySelector('.ov-no').click(); H.settled()");
    await expect('after a confirmation was cancelled', 0);
    await p.eval("V2.toast('x', { ms: 5000 }); V2.toast('x', { ms: 5000 }); 1");
    await expect('a toast asked for twice (one timer for its ms)', 1);
    await p.eval("H.toasts()[0].querySelector('.ov-toast-close').click(); H.settled()");
    await expect('after a toast with 5 seconds to go was closed by hand', 0);
    await p.eval("V2.toast('y', { ms: 150 }); 1"); await p.until('H.toasts().length === 0', 2000);
    await expect('after a toast timed out', 0);
    await p.eval("for (var i = 0; i < 5; i++) V2.toast('t' + i, { kind: 'warn', ms: 5000 }); H.settled()");
    await expect('five toasts in a burst with a cap of three (one timer each for the three that remain)', 3);
    await p.eval("H.live().forEach(function (t) { t.querySelector('.ov-toast-close').click(); }); H.settled()");
    await expect('after every toast was closed', 0);
    await p.eval("V2.openSheet('S', 'x'); window.__r = 0; V2.confirmDialog('Q?'); H.settled()");
    await p.key('Escape'); await settled(); await p.key('Escape'); await settled();
    await expect('after Escape closed a confirmation and then its sheet', 0);
    return f;
  });
}
test('after sheets, confirmations and toasts are closed, replaced, retriggered, evicted, timed out or dismissed by Escape, no timer of theirs is left pending (a toast with 5 seconds to go that is closed by hand takes its timer with it)', async () => {
  none(await checkNoLeakedTimers(needEnv(REAL)));
}, { browser: true });

/* =====================================================================================================
 * COEXISTENCE WITH THE LIVE APP. app.js already defines openSheet, closeSheet and toast (different arguments), and the
 * migration moves screens one at a time, so ONE page will hold both for a long while. Loading this file must change
 * nothing on a page that has not opted in: the API is V2.openSheet and so on, never a bare name.
 * ===================================================================================================== */
const SENTINELS = "function openSheet() { return 'live openSheet'; } function closeSheet() { return 'live closeSheet'; } function toast() { return 'live toast'; } function confirmDialog() { return 'live confirmDialog'; } window.__live = { openSheet: openSheet, closeSheet: closeSheet, toast: toast, confirmDialog: confirmDialog };";
async function checkLeavesBareNamesAlone(env) {
  const f = [];
  const r = await withPage(env, { preScript: SENTINELS }, async (p) => p.eval(`(function(){
    var out = { v2: typeof window.V2, same: {}, calls: {} }, n = ['openSheet', 'closeSheet', 'toast', 'confirmDialog'], i;
    for (i = 0; i < n.length; i++) { out.same[n[i]] = window[n[i]] === window.__live[n[i]]; out.calls[n[i]] = window[n[i]](); }
    out.v2api = window.V2 ? n.map(function (k) { return typeof window.V2[k]; }) : null;
    return out;
  })()`));
  for (const k of ['openSheet', 'closeSheet', 'toast', 'confirmDialog']) {
    if (!r.same[k]) f.push('loading overlay.js replaced the page\'s own ' + k + ' (it now answers "' + r.calls[k] + '")');
  }
  if (r.v2 !== 'object' || !r.v2api || r.v2api.some((t) => t !== 'function')) f.push('V2 is ' + r.v2 + ' with members ' + JSON.stringify(r.v2api));
  const bare = await withPage(env, {}, async (p) => p.eval("['openSheet', 'closeSheet', 'toast', 'confirmDialog'].filter(function (k) { return k in window; })"));
  if (bare.length) f.push('on a page with no functions of its own, window has ' + bare.join(', '));
  return f;
}
test('on a page that already has its own openSheet, closeSheet, toast and confirmDialog, loading ui/overlay.js leaves every one of them exactly as it was (same function, same answer), and puts the v2 ones on V2 only', async () => {
  none(await checkLeavesBareNamesAlone(needEnv(REAL)));
}, { browser: true });

/* =====================================================================================================
 * SCROLL LOCK. showModal() makes the page inert but does not stop it scrolling. While any modal is open the page behind
 * must not move; on the last close the document's own inline overflow and padding come back EXACTLY; a close path that
 * throws, or an app that wipes <body>, must not leave the page stuck.
 * ===================================================================================================== */
const TALL_BODY = DEFAULT_BODY + '<div style="height:6000px"></div>';
// headless Chrome draws overlay scrollbars that take no width; a 15px classic one is what the office PCs have
const LOCK_PAGE = { body: TALL_BODY, head: '<style>html::-webkit-scrollbar { width: 15px; }</style>' };
async function checkScrollLock(env) {
  const f = [], settled = (p) => p.eval('H.settled()'), frames = (p) => p.eval('H.frames(3)');
  const state = (p) => p.eval("({ y: Math.round(window.scrollY), ov: document.documentElement.style.overflow, pr: document.documentElement.style.paddingRight, app: (function(){ var a = document.getElementById('app'); if (!a) return [0, 0]; var r = a.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.width)]; })() })");
  /* One wheel and a second to notice it was enough on a machine that draws; a
   * CI runner managing 8 frames a second missed it and reported "the page
   * cannot scroll", which reads as the lock never releasing. It had released --
   * the overflow assertion beside this one passed every time.
   *
   * So the OBSERVATION is retried, not the assertion relaxed. A page that is
   * genuinely held still has scrollY 0 after four wheels and four seconds, so
   * this keeps every failure it could catch before, including the one this
   * check exists for: overflow restored and the page still stuck, which is what
   * a leftover wheel listener looks like. It only stops calling a slow machine
   * a locked one. */
  const wheelMoves = async (p) => {
    await p.eval('window.scrollTo(0, 0); 1');
    for (let i = 0; i < 4; i++) {
      await p.wheel(500, 300, 400);
      if (await p.until('window.scrollY > 0', 1000)) return true;
    }
    return false;
  };
  // 1. the app's own inline styles come back exactly; page scrolls before, is held while open, scrolls again after
  await withPage(env, LOCK_PAGE, async (p) => {
    await p.eval("document.documentElement.style.overflow = 'auto'; document.documentElement.style.paddingRight = '2px'; 1");
    if (!(await wheelMoves(p))) f.push('control: a mouse wheel does not scroll this page even with no overlay, so the lock test would prove nothing');
    await p.eval('window.scrollTo(0, 0); V2.openSheet("T", "<p>x</p>"); H.settled()');
    const open = await state(p);
    if (open.ov !== 'hidden') f.push('with a sheet open the document overflow is "' + open.ov + '", not hidden');
    await p.wheel(500, 300, 400); await frames(p);
    if ((await state(p)).y !== 0) f.push('a mouse wheel over the backdrop scrolled the page behind an open sheet');
    // a confirmation over the sheet, then a toast over both
    await p.eval('V2.confirmDialog("Q?"); H.settled()');
    await p.eval('V2.toast("over both", { ms: 0 }); H.settled()');
    await p.key('Escape'); await settled(p);
    let mid = await state(p);
    if (mid.ov !== 'hidden') f.push('closing the confirmation released the lock while the sheet beneath it is still open (overflow "' + mid.ov + '")');
    await p.wheel(500, 300, 400); await frames(p);
    if ((await state(p)).y !== 0) f.push('the page scrolled once the confirmation over the sheet had closed');
    await p.eval('V2.closeSheet(); H.settled()');
    const after = await state(p);
    if (after.ov !== 'auto' || after.pr !== '2px') f.push('after the last overlay closed the document has overflow "' + after.ov + '" and padding-right "' + after.pr + '", not the "auto" and "2px" the app had set');
    if (!(await wheelMoves(p))) f.push('the page does not scroll again after the overlays closed');
  });
  // 1b. a confirmation on its own (no sheet) locks and unlocks too
  await withPage(env, LOCK_PAGE, async (p) => {
    await p.eval('window.scrollTo(0, 0); V2.confirmDialog("Q?"); H.settled()');
    if ((await state(p)).ov !== 'hidden') f.push('a confirmation on its own did not lock the page (overflow "' + (await state(p)).ov + '")');
    await p.wheel(500, 300, 400); await frames(p);
    if ((await state(p)).y !== 0) f.push('a mouse wheel scrolled the page behind a confirmation that has no sheet under it');
    await p.key('Escape'); await settled(p);
    if ((await state(p)).ov !== '') f.push('after a lone confirmation closed, the document overflow is "' + (await state(p)).ov + '"');
    if (!(await wheelMoves(p))) f.push('the page does not scroll after a lone confirmation closed');
  });
  // 2. an app with no inline styles ends with none; a toast alone does not lock; the width does not jump
  await withPage(env, LOCK_PAGE, async (p) => {
    await p.eval('V2.toast("alone", { ms: 0 }); H.settled()');
    if ((await state(p)).ov !== '') f.push('a toast on its own locked the page (overflow "' + (await state(p)).ov + '")');
    const before = await state(p);
    const bar = await p.eval('window.innerWidth - document.documentElement.clientWidth');
    if (bar !== 15) f.push('the test page has a ' + bar + 'px scrollbar, not the 15px it asks for, so the no-jump check would prove nothing');
    await p.eval('V2.openSheet("T", "x"); H.settled()');
    const during = await state(p);
    if (during.app[0] !== before.app[0] || during.app[1] !== before.app[1]) f.push('locking moved the page content from ' + before.app + ' to ' + during.app + ' (a ' + bar + 'px scrollbar vanished and was not made up for)');
    await p.eval('V2.closeSheet(); H.settled()');
    const end = await state(p);
    if (end.ov !== '' || end.pr !== '') f.push('with no inline styles to begin with, the document ends with overflow "' + end.ov + '" and padding-right "' + end.pr + '"');
    if (!(await p.eval('document.documentElement.style.cssText === "" || document.documentElement.getAttribute("style") === ""'))) f.push('the document is left with a style attribute: ' + await p.eval('document.documentElement.getAttribute("style")'));
  });
  // 3. a close path that throws
  await withPage(env, LOCK_PAGE, async (p) => {
    await p.eval('V2.openSheet("T", "x", { onClose: function () { throw new Error("boom"); } }); H.settled()');
    await p.eval('V2.closeSheet(); H.settled()');
    if ((await state(p)).ov !== '') f.push('an onClose that throws left the page locked (overflow "' + (await state(p)).ov + '")');
    if (!(await wheelMoves(p))) f.push('the page cannot scroll after an onClose that threw');
  });
  // 4. the app wipes <body> under an open overlay
  await withPage(env, LOCK_PAGE, async (p) => {
    await p.eval('V2.openSheet("T", "x"); window.__r = "pending"; V2.confirmDialog("Q?").then(function (v) { window.__r = v; }); H.settled()');
    await p.eval('document.body.innerHTML = "<div style=\\"height:6000px\\">the app wiped the body</div>"; 1'); await frames(p);
    if ((await state(p)).ov !== '') f.push('the app wiping <body> under an open sheet left the page locked for good (overflow "' + (await state(p)).ov + '")');
    if ((await p.eval('window.__r')) !== false) f.push('a confirmation wiped from the page resolved ' + (await p.eval('String(window.__r)')) + ', not false');
  });
  return f;
}
test('while any overlay is open the mouse wheel cannot scroll the page behind it and the width does not jump; with a confirmation over a sheet the lock outlasts the confirmation; after the last close the document\'s own overflow and padding-right are back exactly and the page scrolls again; a toast alone does not lock; an onClose that throws, or the app wiping <body>, does not leave the page stuck (a wiped confirmation resolves false)', async () => {
  none(await checkScrollLock(needEnv(REAL)));
}, { browser: true });

/* A toast is a <dialog> too, and Chrome hands Escape to the most recently opened dialog of any kind. With a toast on screen
 * the key must still reach the modal beneath it (found while testing the scroll lock: Escape closed the toast instead). */
async function checkEscapeWithAToast(env) {
  const f = [];
  await withPage(env, { noNativeRestore: true }, async (p) => {
    await p.eval("document.getElementById('opener').focus(); V2.openSheet('S', '<button type=\"button\" id=\"ib\">Inner</button>'); H.settled()");
    await p.eval("V2.toast('Over the sheet', { kind: 'warn', ms: 0 }); H.settled()");
    await p.key('Escape');
    if (!(await p.until('!H.sheet()', 2500))) f.push('Escape with a toast on screen did not close the sheet beneath it');
    const t = await p.eval("(function(){ var t = H.toasts()[0]; return t ? { open: t.open, shown: t.getClientRects().length > 0 } : null; })()");
    if (!t || !t.open || !t.shown) f.push('Escape that was meant for the sheet closed the toast instead: ' + JSON.stringify(t));
    if ((await p.eval('document.activeElement.id')) !== 'opener') f.push('after that Escape focus is not back on the opener');
  });
  await withPage(env, { noNativeRestore: true }, async (p) => {
    await p.eval("document.getElementById('opener').focus(); V2.openSheet('S', 'x'); window.__r = undefined; H.settled()");
    await p.eval("V2.confirmDialog('Q?').then(function (v) { window.__r = v; }); V2.toast('Over both', { ms: 0 }); H.settled()");
    await p.key('Escape');
    if (!(await p.until('window.__r === false', 2500))) f.push('Escape with a toast on screen did not dismiss the confirmation (false)');
    await p.eval('H.settled()');
    if (!(await p.eval('!!H.sheet() && H.sheet().open'))) f.push('Escape with a toast on screen also closed the sheet beneath the confirmation');
  });
  return f;
}
async function checkEscapeCanBeClaimed(env) {
  return withPage(env, { noNativeRestore: true }, async (p) => {
    const f = [];
    await p.eval(`document.getElementById('opener').focus();
      V2.openSheet('S', '<input id="mine" aria-label="Custom control"><button type="button" id="plain">Plain</button>');
      document.getElementById('mine').addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.preventDefault(); window.__claimed = (window.__claimed || 0) + 1; } });
      document.getElementById('mine').focus(); H.settled()`);
    await p.key('Escape'); await p.eval('H.settled()');
    const r = await p.eval('({ open: !!H.sheet() && H.sheet().open, claimed: window.__claimed || 0 })');
    if (r.claimed !== 1) f.push('the control inside the sheet never saw the Escape (claimed ' + r.claimed + '), so the test is not exercising it');
    if (!r.open) f.push('Escape that a control inside the sheet had claimed (preventDefault) still closed the sheet');
    await p.eval("document.getElementById('plain').focus(); 1");
    await p.key('Escape');
    if (!(await p.until('!H.sheet()', 2500))) f.push('Escape on a control that does not claim it did not close the sheet');
    return f;
  });
}
test('an Escape that a control inside a sheet has claimed (preventDefault on its keydown) does not close the sheet, and an Escape nobody claims does', async () => {
  none(await checkEscapeCanBeClaimed(needEnv(REAL)));
}, { browser: true });

test('with a toast on screen Escape still goes to the modal beneath it (a sheet, or a confirmation over a sheet; the toast stays) instead of being swallowed by the toast', async () => {
  none(await checkEscapeWithAToast(needEnv(REAL)));
}, { browser: true });

async function checkHarnessPinsPreferences(env) {
  const f = [];
  const q = "({ dark: matchMedia('(prefers-color-scheme: dark)').matches, light: matchMedia('(prefers-color-scheme: light)').matches, reduce: matchMedia('(prefers-reduced-motion: reduce)').matches })";
  const cases = [['default', {}, { dark: false, light: true, reduce: false }], ['dark', { dark: true }, { dark: true, light: false, reduce: false }],
    ['reduced', { reduced: true }, { dark: false, light: true, reduce: true }], ['dark and reduced', { dark: true, reduced: true }, { dark: true, light: false, reduce: true }]];
  for (const [label, o, want] of cases) {
    const got = await withPage(env, o, (p) => p.eval(q));
    if (JSON.stringify(got) !== JSON.stringify(want)) f.push(label + ' page sees ' + JSON.stringify(got) + ', expected ' + JSON.stringify(want) + ' whatever the operating system is set to');
  }
  return f;
}
test('every test page has its colour scheme and its reduced-motion preference pinned (light and no-preference unless a test asks otherwise), so the suite gives the same answer on a Mac in Dark mode and on one in Light mode', async () => {
  none(await checkHarnessPinsPreferences(needEnv(REAL)));
}, { browser: true });

/* =====================================================================================================
 * 7. THEME, DENSITY AND LAYOUT. The overlays are appended to <body>, away from the app's own tree, so they must
 * carry the app's theme and density themselves, and survive the app re-rendering its root.
 * ===================================================================================================== */
const PROBE_TOKENS = `(function(){ var q = function (el, n) { return getComputedStyle(el).getPropertyValue(n).trim(); };
  var dlg = H.sheet(), reg = document.querySelector('.ov-toasts'), app = document.getElementById('app');
  return { dlgSurface: q(dlg, '--surface-raised'), dlgInk: q(dlg, '--ink'), regSurface: q(reg, '--surface-raised'), appSurface: q(app, '--surface-raised'), appInk: q(app, '--ink'),
           panelBg: getComputedStyle(dlg.querySelector('.ov-panel')).backgroundColor }; })()`;
async function themeProbe(env, o) {
  return withPage(env, o, async (p) => p.eval(`document.getElementById('opener').focus(); V2.openSheet('T', '<p>x</p>'); V2.toast('t', { ms: 0 }); ${PROBE_TOKENS}`));
}
async function checkTheme(env) {
  const f = [];
  const wrapDark = '<div data-v2 data-theme="dark" id="app"><button class="btn" id="opener">Open</button></div>';
  const wrapPlain = '<div data-v2 id="app"><button class="btn" id="opener">Open</button></div>';
  const wrapLight = '<div data-v2 data-theme="light" id="app"><button class="btn" id="opener">Open</button></div>';
  const light = await themeProbe(env, { body: wrapPlain });
  const dark = await themeProbe(env, { body: wrapDark });
  if (light.appSurface === dark.appSurface) f.push('the page\'s light and dark surfaces are identical, so a theme check would prove nothing');
  if (dark.dlgSurface !== dark.appSurface || dark.dlgInk !== dark.appInk) f.push('the app has data-theme="dark" but the sheet resolves ' + dark.dlgSurface + ' / ' + dark.dlgInk + ' instead of ' + dark.appSurface + ' / ' + dark.appInk);
  if (dark.regSurface !== dark.appSurface) f.push('the toast lane does not follow the app\'s dark theme (' + dark.regSurface + ')');
  if (light.dlgSurface !== light.appSurface) f.push('the sheet in a plain page resolves ' + light.dlgSurface + ', not ' + light.appSurface);
  const htmlDark = await themeProbe(env, { body: wrapPlain, htmlAttrs: ' data-theme="dark"' });
  if (htmlDark.dlgSurface !== dark.appSurface) f.push('data-theme="dark" on <html> (the app wrapper has none) is not followed: the sheet resolves ' + htmlDark.dlgSurface);
  const osDarkLightChoice = await themeProbe(env, { body: wrapLight, dark: true });
  if (osDarkLightChoice.dlgSurface !== osDarkLightChoice.appSurface) f.push('the user chose light while the OS is dark: the app is ' + osDarkLightChoice.appSurface + ' but the sheet is ' + osDarkLightChoice.dlgSurface);
  const osDark = await themeProbe(env, { body: wrapPlain, dark: true });
  if (osDark.dlgSurface !== osDark.appSurface) f.push('with the OS in dark mode and no explicit choice, the sheet is ' + osDark.dlgSurface + ' but the app is ' + osDark.appSurface);
  for (const [n, x] of [['light', light], ['dark', dark]]) if (!x.panelBg || x.panelBg === 'rgba(0, 0, 0, 0)') f.push('the ' + n + ' sheet panel has no background');
  return f;
}
test('a sheet and the toast lane carry the app\'s theme: explicit dark on the wrapper or on <html>, an explicit light choice under an OS in dark mode, and the OS dark default all resolve the same tokens as the app', async () => {
  none(await checkTheme(needEnv(REAL)));
}, { browser: true });

async function checkDensity(env) {
  const f = [];
  const body = '<div data-v2 id="app"><div data-density="desk" id="deskwrap"><button class="btn" id="opener">Desk opener</button></div><button class="btn" id="yardbtn">Yard opener</button></div>';
  const r = await withPage(env, { body }, async (p) => p.eval(`(async function(){
    var q = function (el, n) { return getComputedStyle(el).getPropertyValue(n).trim(); }, out = {};
    document.getElementById('opener').focus(); V2.openSheet('T', '<p>x</p>'); await H.settled();
    out.desk = { tap: q(H.sheet(), '--tap'), closeH: H.sheet().querySelector('.ov-close').getBoundingClientRect().height };
    V2.closeSheet(); await H.until(function () { return !H.sheet(); }, 3000);
    document.getElementById('yardbtn').focus(); V2.openSheet('T', '<p>x</p>'); await H.settled();
    out.yard = { tap: q(H.sheet(), '--tap'), closeH: H.sheet().querySelector('.ov-close').getBoundingClientRect().height };
    return out;
  })()`));
  if (r.desk.tap !== '32px') f.push('a sheet opened from inside a desk container resolves --tap ' + r.desk.tap + ', not 32px');
  if (r.yard.tap !== '48px') f.push('a sheet opened from a yard control resolves --tap ' + r.yard.tap + ', not 48px');
  if (Math.round(r.desk.closeH) !== 32) f.push('the desk sheet\'s Close button is ' + r.desk.closeH + 'px tall, not 32');
  if (Math.round(r.yard.closeH) !== 48) f.push('the yard sheet\'s Close button is ' + r.yard.closeH + 'px tall, not 48');
  return f;
}
test('a sheet takes the density of the place it was opened from: 32px controls when opened from inside a desk container, 48px from a yard control', async () => {
  none(await checkDensity(needEnv(REAL)));
}, { browser: true });

async function checkSurvivesRerender(env) {
  return withPage(env, {}, async (p) => {
    const r = await p.eval(`(async function(){
      document.getElementById('opener').focus(); V2.openSheet('T', '<p>x</p>'); window.__r = undefined; V2.confirmDialog('Q?').then(function (v) { window.__r = v; });
      await H.settled();
      document.getElementById('app').innerHTML = '<p>the app drew itself again</p>';
      V2.toast('after the redraw', { ms: 0 }); await H.settled();
      var c = H.center(H.toasts()[0]), hit = document.elementFromPoint(c.x, c.y);
      return { sheet: !!H.sheet() && H.sheet().open, confirm: !!H.confirm() && H.confirm().open, toastShown: !!hit && H.toasts()[0].contains(hit) };
    })()`);
    const f = [];
    if (!r.sheet || !r.confirm) f.push('the app re-rendering its own root removed an open overlay (sheet ' + r.sheet + ', confirm ' + r.confirm + ')');
    if (!r.toastShown) f.push('a toast raised after the app redrew itself is not visible');
    await p.key('Escape');
    if (!(await p.until('window.__r === false', 2500))) f.push('Escape on the confirmation after a redraw did not resolve it false');
    await p.eval("V2.closeSheet(); H.settled()");
    const w = await p.eval(`(async function(){
      V2.toast('Again', { kind: 'ok', ms: 0 }); await H.settled();
      document.body.innerHTML = '<p>the app wiped the whole body</p>';
      var t = V2.toast('Again', { kind: 'ok', ms: 0 }); await H.settled();
      var c = H.center(t), hit = document.elementFromPoint(c.x, c.y);
      return { connected: t.isConnected, shown: !!hit && t.contains(hit) };
    })()`);
    if (!w.connected || !w.shown) f.push('after the app wiped <body>, asking for a toast that was showing before gives a toast that is ' + (w.connected ? 'not visible' : 'not in the document'));
    return f;
  });
}
test('the app replacing the contents of its own root while a sheet and a confirmation are open does not remove them, a toast after the redraw still shows, and so does a repeat of a toast that a wipe of <body> had taken away', async () => {
  none(await checkSurvivesRerender(needEnv(REAL)));
}, { browser: true });

async function checkLayout(env, o) {
  const label = (o.live ? 'with the live styles.css, ' : '') + o.width + 'x' + o.height + ': ';
  return withPage(env, { live: o.live, width: o.width, height: o.height }, async (p) => {
    const r = await p.eval(`(async function(){
      var vw = innerWidth, vh = innerHeight, out = { vw: vw, vh: vh };
      V2.openSheet('Tall', '<div style="height:3000px">tall</div>'); await H.settled();
      var panel = H.sheet().querySelector('.ov-panel'), body = H.sheet().querySelector('.ov-body'), pr = panel.getBoundingClientRect(), cr = H.sheet().querySelector('.ov-close').getBoundingClientRect(), bcs = getComputedStyle(body);
      out.sheet = { l: pr.left, r: pr.right, t: pr.top, b: pr.bottom, h: pr.height, w: pr.width, scrolls: body.scrollHeight > body.clientHeight + 10, overflowY: bcs.overflowY, closeTop: cr.top, closeBottom: cr.bottom, closeRight: cr.right,
        tf: getComputedStyle(panel).transform, anims: panel.getAnimations().length, dlg: Math.round(H.sheet().getBoundingClientRect().height), iw: innerWidth, ih: innerHeight };
      V2.closeSheet(); await H.until(function () { return !H.sheet(); }, 3000);
      V2.confirmDialog('Remove this bus from the roster for good?'); await H.settled();
      var cp = H.confirm().querySelector('.ov-panel'), cb = cp.getBoundingClientRect();
      out.confirm = { l: cb.left, r: cb.right, t: cb.top, b: cb.bottom, w: cb.width };
      H.confirm().querySelector('.ov-no').click(); await H.until(function () { return !H.confirm(); }, 3000);
      var tt = V2.toast(new Array(60).join('A long message that has to wrap. '), { kind: 'warn', ms: 0 }); await H.settled();
      var tb = tt.getBoundingClientRect(); out.toast = { l: tb.left, r: tb.right, t: tb.top, b: tb.bottom };
      return out;
    })()`);
    const f = [], s = r.sheet, c = r.confirm, t = r.toast;
    if (Math.abs(s.b - r.vh) > 1.5) f.push(label + 'the sheet bottom is at ' + s.b + ', not at the viewport bottom ' + r.vh
      + ' (panel transform ' + s.tf + ', ' + s.anims + ' animation(s) still on it, dialog ' + s.dlg + 'px tall, window ' + s.iw + 'x' + s.ih + ')');
    if (s.h > r.vh * 0.9 + 1.5) f.push(label + 'the sheet is ' + s.h + 'px tall, over 90% of the ' + r.vh + 'px viewport');
    if (s.w > 640 + 1) f.push(label + 'the sheet is ' + s.w + 'px wide, over 40rem');
    if (Math.abs((s.l + s.r) / 2 - r.vw / 2) > 2) f.push(label + 'the sheet is not centred (' + s.l + '..' + s.r + ' in ' + r.vw + ')');
    if (s.w < Math.min(r.vw, 640) - 2) f.push(label + 'the sheet is only ' + s.w + 'px wide');
    if (!s.scrolls || !/^(auto|scroll)$/.test(s.overflowY)) f.push(label + 'tall content does not scroll inside the sheet (overflow-y ' + s.overflowY + ')');
    if (s.closeTop < 0 || s.closeBottom > r.vh || s.closeRight > r.vw) f.push(label + 'the Close button is outside the viewport');
    if (Math.abs((c.l + c.r) / 2 - r.vw / 2) > 2 || Math.abs((c.t + c.b) / 2 - r.vh / 2) > 2) f.push(label + 'the confirmation is not centred in the viewport');
    if (c.w > r.vw) f.push(label + 'the confirmation is wider than the viewport');
    if (c.l < 0 || c.r > r.vw) f.push(label + 'the confirmation spills off the sides');
    if (t.l < -0.5 || t.r > r.vw + 0.5 || t.b > r.vh + 0.5 || t.t < 0) f.push(label + 'a long toast leaves the viewport (' + JSON.stringify(t) + ')');
    return f;
  });
}
const LAYOUTS = [{ width: 1024, height: 768 }, { width: 360, height: 640 }];
for (const live of [false, true]) for (const l of LAYOUTS) {
  test('at ' + l.width + 'x' + l.height + (live ? ' with the live styles.css loaded as well' : '') + ', a tall sheet sits on the bottom edge no taller than 90% and scrolls inside, a confirmation is centred, and a long toast stays inside the viewport', async () => {
    none(await checkLayout(needEnv(REAL), Object.assign({ live }, l)));
  }, { browser: true });
}

async function checkFlowIsQuiet(env) {
  return withPage(env, {}, async (p) => {
    await p.eval(`document.getElementById('opener').focus(); V2.openSheet('T', '${SHEET_BODY}'); H.settled()`);
    await p.eval("V2.confirmDialog('Q?'); V2.toast('a', { kind: 'ok' }); V2.toast('b', { kind: 'bad', ms: 100 }); H.settled()");
    await p.key('Escape'); await p.key('Escape');
    await p.eval("V2.closeSheet(); V2.toast('c', { kind: 'warn', ms: 50 }); H.settled()");
    return p.errors.slice();
  });
}
test('a full session (sheet, confirmation over it, three kinds of toast, Escape twice, close) logs no console error and throws no exception in the page', async () => {
  none(await checkFlowIsQuiet(needEnv(REAL)));
}, { browser: true });

/* =====================================================================================================
 * 8. SELF-TESTS: every checker above is fed a MUTANT (the real source with one thing broken) and must go red.
 * A checker that stays green for a mutant is blind; a mutant that does not apply throws (see mutate()).
 * A checker that cannot even finish (the page throws) also counts as red.
 * ===================================================================================================== */
async function red(check, label, env, extra) {
  let failures;
  // An unmeasurable run is NOT a red: it would let the self-test claim the checker is not blind on the strength of a
  // measurement that was never taken. It propagates, so the self-test reports SKIPPED for the same reason.
  try { failures = await check(env, extra); } catch (e) { if (e && e.unmeasurable) throw e; failures = ['checker threw: ' + e.message]; }
  assert(failures.length > 0, 'the checker stayed GREEN for the mutant: ' + label);
  return failures;
}
// Mutants are independent pages, so they run side by side (6 at a time); only an expected RED can come from the extra load.
async function redAll(check, list, extra, lanes) {
  const n = lanes || Number(process.env.OVERLAY_MUTANT_LANES) || 6;
  for (let i = 0; i < list.length; i += n) await Promise.all(list.slice(i, i + n).map(([label, env]) => red(check, label, env, extra)));
}

const SHEET_SHOW = ['show() instead of showModal()', mJs('rec.dlg.showModal();', 'rec.dlg.show();')];
test('the modal-sheet checker goes red for a non-modal show(), a title inserted as markup, a missing aria-labelledby, an empty Close button, a second dialog left behind and a sheet that is not a <dialog>', async () => {
  await redAll(checkSheetIsModalDialog, [
    SHEET_SHOW,
    ['title as markup', mJs("esc(title == null ? '' : title)", "(title == null ? '' : title)")],
    ['no aria-labelledby', mJs("dlg.setAttribute('aria-labelledby', id);", '')],
    ['Close says nothing', mJs('ov-close">Close</button>', 'ov-close"></button>')],
    ['not a dialog', mJs("doc().createElement('dialog');\n    dlg.className = 'ov-modal '", "doc().createElement('div');\n    dlg.className = 'ov-modal '")],
    ['markup dropped', mJs("+ '<div class=\"ov-body\">' + (html == null ? '' : String(html)) + '</div></div>');", "+ '<div class=\"ov-body\"></div></div>');")],
  ]);
}, { browser: true });

test('the inert-page checker goes red for a sheet that is not modal (the page stays reachable by Tab, by click and by script) and for a sheet with nothing to Tab through', async () => {
  await redAll(checkPageBehindIsInert, [SHEET_SHOW]);
  const f = await red(checkPageBehindIsInert, 'a sheet whose body has no controls', mJs('<div class="ov-body">', '<div class="ov-body" data-x="1" hidden>'));
  assert(f.some((x) => /visited only|vacuous/.test(x)), 'the vacuity guard did not fire: ' + f.join(' | '));
}, { browser: true });

const NO_RESTORE = ['focus is never restored', mJs('if (rec.restore !== false) restoreFocus(rec.opener);', '')];
test('the sheet close-route checker goes red for no focus restore, a missing onClose, onClose twice, an inert Close button, a backdrop that does nothing, and Escape that does nothing', async () => {
  const everyRoute = [
    NO_RESTORE,
    ['onClose never called', mJs('after: opts.onClose', 'after: undefined')],
    ['onClose called twice', mJs('function finish(rec) {\n    if (rec.done) return;', 'function finish(rec) {')],
  ];
  await Promise.all(ROUTES.map((route) => redAll((env) => checkSheetCloseRoute(env, route), everyRoute)));
  const one = {
    'the Close button': ['the Close button does nothing', mJs("dlg.querySelector('.ov-close').addEventListener('click', function () { dismiss(rec); });", '')],
    'a click on the backdrop': ['the backdrop does nothing', mJs('if (hit) rec.onCancel();', '')],
    'Escape': ['Escape does nothing', mJs('ev.preventDefault();\n      modals[modals.length - 1].onCancel();', 'ev.preventDefault();')],
    'closeSheet()': ['closeSheet() does nothing', mJs('if (sheet) dismiss(sheet);', '')],
  };
  await Promise.all(ROUTES.map((route) => { const [label, env] = one[route]; return red((e) => checkSheetCloseRoute(e, route), label, env); }));
}, { browser: true });

test('the nested-sheet checker goes red when the opener is taken from the first sheet, when no focus is restored, and when the first sheet is left on the page', async () => {
  await redAll(checkNestedSheet, [
    ['opener taken from inside the first sheet', mJs('var opener = sheet && sheet.dlg.contains(active) ? sheet.opener : active;', 'var opener = active;')],
    NO_RESTORE,
    ['the first sheet is left open', mJs('if (sheet) { sheet.restore = false; finish(sheet); }', '')],
  ]);
}, { browser: true });

test('the backdrop checker goes red when a text-selection drag dismisses, when the backdrop does nothing, and when any click dismisses', async () => {
  await redAll(checkBackdropRules, [
    ['a drag ending on the backdrop dismisses', mJs('var hit = rec.downOnBackdrop && isBackdrop(rec, ev.target);', 'var hit = isBackdrop(rec, ev.target);')],
    ['the backdrop does nothing', mJs('if (hit) rec.onCancel();', '')],
    ['every click dismisses', mJs('function isBackdrop(rec, target) { return target === rec.dlg || target === rec.scrim; }', 'function isBackdrop(rec, target) { return true; }')],
  ]);
}, { browser: true });

test('the repeated-close checker goes red for onClose twice, a closeSheet() that throws with nothing open, and focus that is not restored', async () => {
  await redAll(checkRepeatedClose, [
    ['onClose twice', mJs('function finish(rec) {\n    if (rec.done) return;', 'function finish(rec) {')],
    ['closeSheet() throws with nothing open', mJs('if (sheet) dismiss(sheet);', 'dismiss(sheet);')],
    NO_RESTORE,
    ['a page exception', mJs('if (rec.dlg.parentNode) rec.dlg.parentNode.removeChild(rec.dlg);', 'if (rec.dlg.parentNode) rec.dlg.parentNode.removeChild(rec.dlg); window.nope.x();')],
  ]);
}, { browser: true, solo: true });

const CONFIRM_MUTANTS = [
  ['Escape and the backdrop read as yes', mJs('rec.onCancel = function () { decide(false); dismiss(rec); };\n      rec.after', 'rec.onCancel = function () { decide(true); dismiss(rec); };\n      rec.after'), ['Escape', 'a click on the backdrop']],
  ['focus starts on Confirm', mJs("dlg.querySelector('.ov-no').focus();", "dlg.querySelector('.ov-yes').focus();"), ['Enter pressed the moment it opens (the reflex)']],
  ['a close() with no answer hangs the caller', mJs('rec.after = function () { decide(false); };', 'rec.after = function () {};'), ['a script calling close()', 'a script calling close("confirm")']],
  ['a close() resolves undefined', { js: mutate(mutate(REAL.js, 'rec.after = function () { decide(false); };', 'rec.after = function () { decide(); };'), 'resolve(answer === true);', 'resolve(answer);'), css: REAL.css }, ['a script calling close()']],
  ['close("confirm") reads the returnValue as yes', mJs('rec.after = function () { decide(false); };', 'rec.after = function () { decide(dlg.returnValue === "confirm"); };'), ['a script calling close("confirm")']],
  ['Cancel does nothing', mJs("dlg.querySelector('.ov-no').addEventListener('click', function () { decide(false); dismiss(rec); });", ''), ['the Cancel button']],
  ['Confirm resolves false', mJs("dlg.querySelector('.ov-yes').addEventListener('click', function () { decide(true); dismiss(rec); });", "dlg.querySelector('.ov-yes').addEventListener('click', function () { decide(false); dismiss(rec); });"), ['the Confirm button']],
  ['the dialog is not modal', SHEET_SHOW[1], ['the Confirm button', 'Escape']],
  ['focus is not restored', NO_RESTORE[1], ['the Confirm button', 'Escape', 'the Cancel button']],
];
test('the confirmation checker goes red when Escape or the backdrop reads as yes, when focus starts on Confirm, when a script close() hangs or resolves a non-boolean, when close("confirm") counts as yes, when a button does nothing, when the dialog is not modal and when focus is not restored', async () => {
  const jobs = [];
  for (const [label, env, routes] of CONFIRM_MUTANTS) for (const name of routes) {
    const route = CONFIRM_ROUTES.find((r) => r.name === name);
    assert(route, 'unknown route ' + name);
    jobs.push([label + ' (route: ' + name + ')', env, route]);
  }
  for (let i = 0; i < jobs.length; i += 6) await Promise.all(jobs.slice(i, i + 6).map(([label, env, route]) => red((e) => checkConfirmRoute(e, route), label, env)));
}, { browser: true });

test('the confirmation default-focus checker goes red when focus starts on Confirm, or when Confirm comes first and nothing moves focus to Cancel', async () => {
  await redAll(checkConfirmDefaultFocus, [
    ['focus starts on Confirm', CONFIRM_MUTANTS[1][1]],
    ['Confirm comes first in the dialog and nothing moves focus', { js: mutate(mutate(mutate(REAL.js, "dlg.querySelector('.ov-no').focus();", ''),
      "+ '<div class=\"ov-actions\"><button type=\"button\" class=\"btn ov-no\">' + esc(no) + '</button>'", "+ '<div class=\"ov-actions\">'"),
      "' ov-yes\">' + esc(yes) + '</button></div></div>');", "' ov-yes\">' + esc(yes) + '</button><button type=\"button\" class=\"btn ov-no\">' + esc(no) + '</button></div></div>');"), css: REAL.css }],
  ]);
}, { browser: true });

test('the confirmation-markup checker goes red for text inserted as markup, a missing alertdialog role, a missing description, danger ignored, a title inserted as markup and no accessible name', async () => {
  await redAll(checkConfirmMarkup, [
    ['question as markup', mJs("esc(text == null ? '' : text)", "(text == null ? '' : text)")],
    ['title as markup', mJs('esc(opts.title)', 'opts.title')],
    ['button label as markup', mJs("class=\"btn ov-no\">' + esc(no)", "class=\"btn ov-no\">' + no")],
    ['no alertdialog role', mJs("dlg.setAttribute('role', 'alertdialog');", '')],
    ['no description', mJs("dlg.setAttribute('aria-describedby', qid);", '')],
    ['no accessible name', mJs("dlg.setAttribute('aria-labelledby', hasTitle ? tid : qid);", '')],
    ['danger ignored', mJs("(opts.danger ? 'btn-danger' : 'btn-primary')", "'btn-primary'")],
    ['the answers have no labels', mJs("var yes = opts.yes == null || String(opts.yes) === '' ? 'Confirm' : String(opts.yes);", "var yes = opts.yes == null || String(opts.yes) === '' ? '' : String(opts.yes);")],
  ]);
}, { browser: true });

test('the confirmation-over-sheet checker goes red when Escape also closes the sheet beneath, and when focus does not go back into the sheet', async () => {
  await redAll(checkConfirmOverSheet, [
    ['the confirmation also closes the sheet', mJs('rec.onCancel = function () { decide(false); dismiss(rec); };\n      rec.after', 'rec.onCancel = function () { decide(false); dismiss(rec); closeSheet(); };\n      rec.after')],
    NO_RESTORE,
  ]);
}, { browser: true });

test('the toast-words checker goes red when the kind word is gone, hidden from a screen reader, the same for every kind, or when the drawing is not hidden', async () => {
  await redAll(checkToastWords, [
    ['no kind word', mJs("+ draw(k.icon, 18) + '<span>' + k.word + '</span></span>'", "+ draw(k.icon, 18) + '</span>'")],
    ['kind word hidden from a screen reader', mJs("'<span class=\"ov-toast-kind\">'", "'<span class=\"ov-toast-kind\" aria-hidden=\"true\">'")],
    ['one word for every kind', mJs("+ draw(k.icon, 18) + '<span>' + k.word + '</span></span>'", "+ draw(k.icon, 18) + '<span>Note</span></span>'")],
    ['message missing', mJs("+ '<span class=\"ov-toast-text\">' + esc(message) + '</span></div>'", "+ '<span class=\"ov-toast-text\"></span></div>'")],
    ['no drawing', mJs(/\+ draw\(k\.icon, 18\) /, '')],
  ]);
}, { browser: true });

test('the toast-kind checker goes red when a typo reads as ok, a missing kind reads as warn, an inherited property name is accepted, or no kind is the same as bad', async () => {
  await redAll(checkToastKindFallback, [
    ['an unknown kind reads as Done', mJs("has(KINDS, kind) ? kind : 'warn'", "has(KINDS, kind) ? kind : 'ok'")],
    ['no kind reads as Warning', mJs("if (kind == null) return 'ok';", "if (kind == null) return 'warn';")],
    ['inherited names accepted', mJs('has(KINDS, kind)', 'kind in KINDS')],
    ['an unknown kind reads as Error', mJs("has(KINDS, kind) ? kind : 'warn'", "has(KINDS, kind) ? kind : 'bad'")],
  ]);
}, { browser: true });

test('the live-region checker goes red when the lane is not a live region, has no status role, when a bad toast is not an alert, or when an ok toast interrupts', async () => {
  await redAll(checkToastLiveRegion, [
    ['no aria-live', mJs("lane.setAttribute('aria-live', 'polite');", '')],
    ['no role=status', mJs("lane.setAttribute('role', 'status');", '')],
    ['assertive lane', mJs("lane.setAttribute('aria-live', 'polite');", "lane.setAttribute('aria-live', 'assertive');")],
    ['a bad toast is not an alert', mJs("(kind === 'bad' ? ' role=\"alert\"' : '')", "''")],
    ['every toast is an alert', mJs("(kind === 'bad' ? ' role=\"alert\"' : '')", "' role=\"alert\"'")],
  ]);
}, { browser: true });

test('the toast-leaves-the-page-alone checker goes red for a modal toast, a toast that takes focus, a lane that swallows clicks and a toast with no open attribute', async () => {
  await redAll(checkToastLeavesPageAlone, [
    ['the toast is modal', mJs('ensureLane().appendChild(el);', "ensureLane().appendChild(el); el.removeAttribute('open'); el.showModal();")],
    ['the toast takes focus', mJs('ensureLane().appendChild(el);', "ensureLane().appendChild(el); el.removeAttribute('open'); el.show();")],
    ['the lane swallows clicks', mCss('  background: transparent;\n  pointer-events: none;\n}', '  background: transparent;\n}')],
    ['the toast is never opened', mJs("el.setAttribute('open', '');", '')],
  ]);
}, { browser: true });

// solo, and ONE mutant page at a time rather than six. These mutants turn on how long a toast lives, and the
// tightest of them has 220ms of margin: a 300ms default plus a 150ms exit and 30ms of slack, against a 700ms wait.
// Pages of nothing but timers starve each other enough to eat that - measured, with several pages in flight the
// 700ms wait came back after 1124ms and the toast was still mid-exit - and the mutant then reads as still on
// screen, which is a false green. Serial here, so the figures mean what they say. It costs about 8s.
// The same arithmetic is why this is also the one test whose own waits were left alone, and why checkToastTiming
// checks that its page kept time before it believes what it measured: narrowing the margin itself would mean moving
// the 700ms, which is a figure this test asserts. Where the machine will not keep time, the checker reports NOT
// MEASURED rather than a verdict either way (see unmeasurable() above).
test('the toast-timing checker goes red when ms is ignored, when 0 does not mean sticky, when a nonsense ms vanishes at once, when the default is too short and when Close does nothing', async () => {
  await redAll(checkToastTiming, [
    ['ms is ignored and the toast stays for ever', mJs("var ms = typeof opts.ms === 'number' && isFinite(opts.ms) && opts.ms >= 0 ? opts.ms : k.ms;", 'var ms = 0;')],
    ['ms is ignored and the toast goes at once', mJs("var ms = typeof opts.ms === 'number' && isFinite(opts.ms) && opts.ms >= 0 ? opts.ms : k.ms;", 'var ms = 1;')],
    ['0 means "right now"', mJs('if (t.ms > 0) t.timer', 'if (true) t.timer')],
    ['a nonsense ms vanishes', { js: mutate(mutate(REAL.js, ' && opts.ms >= 0', ''), 'if (t.ms > 0)', 'if (t.ms !== 0)'), css: REAL.css }],
    ['the default is 300ms', mJs('ok:   { word: \'Done\',    icon: \'ok\',   ms: 4000 }', 'ok:   { word: \'Done\',    icon: \'ok\',   ms: 300 }')],
    ['Close does nothing', mJs("el.querySelector('.ov-toast-close').addEventListener('click', function () { leave(t); });", '')],
  ], undefined, 1);
}, { browser: true, solo: true });

test('the toast-stack checker goes red for no cap and for a cap that drops the newest toast', async () => {
  await redAll(checkToastStack, [
    ['no cap', mJs('while (liveCount() >= MAX_TOASTS) {', 'while (false) {')],
    ['the newest is dropped', mJs('while (liveCount() >= MAX_TOASTS) {', 'if (liveCount() >= MAX_TOASTS) return toasts[toasts.length - 1].el;\n    while (false) {')],
    ['a cap of 7', mJs('var MAX_TOASTS = 3;', 'var MAX_TOASTS = 7;')],
  ]);
}, { browser: true });

test('the toast-retarget checker goes red when the same toast makes two, when a re-trigger during the exit makes a new toast, and when the leaving toast is not brought back', async () => {
  await redAll(checkToastRetarget, [
    ['no de-duplication', mJs('var t = findToast(key);', 'var t = null;')],
    ['a leaving toast is not reused', mJs('if (t) {                                            // the same message again', 'if (t && !t.leaving) {                              // the same message again')],
    ['the leaving toast is not brought back', mJs("window.clearTimeout(t.removeTimer);\n        t.el.setAttribute('data-mounted', '');", 'window.clearTimeout(t.removeTimer);')],
    ['the leaving toast is removed anyway', mJs("window.clearTimeout(t.removeTimer);\n        t.el.setAttribute('data-mounted', '');", "t.el.setAttribute('data-mounted', '');")],
  ]);
}, { browser: true, solo: true });

test('the toast-over-modal checker goes red when the lane stays in the page behind the top layer and when it is lost with the sheet', async () => {
  await redAll(checkToastOverModal, [
    ['the lane never moves into the modal', mJs('var host = modals.length ? modals[modals.length - 1].dlg : doc().body;', 'var host = doc().body;')],
    ['the toast is lost with the sheet', mJs('placeLane();                                        // before the dialog goes: the toasts must not go with it', '')],
    ['the toast takes focus from the sheet', mJs('ensureLane().appendChild(el);', "ensureLane().appendChild(el); el.removeAttribute('open'); el.show();")],
  ]);
}, { browser: true });

test('the toast-text checker goes red for a message inserted as markup and for a toast that throws on undefined text', async () => {
  await redAll(checkToastText, [
    ['message as markup', mJs("'<span class=\"ov-toast-text\">' + esc(message) + '</span></div>'", "'<span class=\"ov-toast-text\">' + message + '</span></div>'")],
    ['undefined text throws', mJs("var message = text == null ? '' : String(text);", 'var message = text.toString();')],
  ]);
}, { browser: true });

/* ---------- motion ---------- */
const SHEET_ENTER = 'transition: transform 250ms ease-out, opacity 250ms ease-out;';
const SHEET_EXIT = 'transition: transform 180ms ease-out, opacity 180ms ease-out;';
test('the Chrome motion check goes red for a 400ms sheet, an exit that is not quicker, a bare ease-in, an ease-in-out enter, a non-compositor property, "all", a delay past 300ms and an unanimated scrim', async () => {
  await redAll(checkMotionComputed, [
    ['sheet enter 400ms', mCss(SHEET_ENTER, 'transition: transform 400ms ease-out, opacity 400ms ease-out;')],
    ['sheet enter 260ms (over its 250 cap)', mCss(SHEET_ENTER, 'transition: transform 260ms ease-out, opacity 260ms ease-out;')],
    ['sheet exit slower than its enter', mCss(SHEET_EXIT, 'transition: transform 300ms ease-out, opacity 300ms ease-out;')],
    ['sheet exit as slow as its enter', mCss(SHEET_EXIT, 'transition: transform 250ms ease-out, opacity 250ms ease-out;')],
    ['sheet enter bare ease-in', mCss(SHEET_ENTER, 'transition: transform 250ms ease-in, opacity 250ms ease-in;')],
    ['sheet exit bare ease-in', mCss(SHEET_EXIT, 'transition: transform 180ms ease-in, opacity 180ms ease-in;')],
    ['sheet enter ease-in-out', mCss(SHEET_ENTER, 'transition: transform 250ms ease-in-out, opacity 250ms ease-in-out;')],
    ['toast animates height', mCss('transition: transform 150ms ease-out, opacity 150ms ease-out;', 'transition: height 150ms ease-out, opacity 150ms ease-out;')],
    ['toast transitions all', mCss('transition: transform 200ms ease-out, opacity 200ms ease-out;\n}\n\n[data-v2] .ov-toast-ok', 'transition: all 200ms ease-out;\n}\n\n[data-v2] .ov-toast-ok')],
    ['delay pushes the sheet past 300ms', mCss(SHEET_ENTER, 'transition: transform 250ms ease-out 100ms, opacity 250ms ease-out 100ms;')],
    ['the scrim does not fade in', mCss('opacity: 0.5;\n  transition: opacity 200ms ease-out;', 'opacity: 0.5;\n  transition: none;')],
    ['no exit transition on the toast', { js: REAL.js, css: mutate(REAL.css, '  opacity: 0;\n  transform: translateY(var(--s2));\n  transition: transform 150ms ease-out, opacity 150ms ease-out;', '  opacity: 0;\n  transform: translateY(var(--s2));') }],
  ]);
}, { browser: true });

test('the enter checker goes red for a dialog that starts from scale(0) or 0.9, a toast that starts visible, an enter that is not triggered by a style flush, a mounted state that never shows, and a sheet that does not slide', async () => {
  await redAll(checkEntersFromAbove95, [
    ['dialog from scale(0)', mCss('transform: scale(0.95);', 'transform: scale(0);')],
    ['dialog from scale(0.9)', mCss('transform: scale(0.95);', 'transform: scale(0.9);')],
    ['toast starts at full opacity', mCss('  opacity: 0;\n  transform: translateY(var(--s2));', '  transform: translateY(var(--s2));')],
    ['no flush before the toast is mounted', mJs('    flush(el);\n', '')],
    ['the sheet never shows', mCss('[data-v2].ov-sheet[data-mounted] .ov-panel {\n  opacity: 1;', '[data-v2].ov-sheet[data-mounted] .ov-panel {\n  opacity: 0;')],
    ['the sheet does not slide', mCss('transform: translateY(var(--s8));', 'transform: none;')],
    ['the toast is never mounted', mJs("el.setAttribute('data-mounted', '');\n    arm(t);", 'arm(t);')],
    ['the dialog is mounted before it is shown', { js: mutate(mutate(REAL.js, "    rec.dlg.showModal();\n", "    rec.dlg.setAttribute('data-mounted', '');\n    rec.dlg.showModal();\n"), "    flush(rec.panel);                                   // render the unmounted state once...\n    rec.dlg.setAttribute('data-mounted', '');           // ...then change it, so it transitions", ''), css: REAL.css }],
  ]);
}, { browser: true });

test('the transform-origin checker goes red when a modal panel scales from a corner or from the middle of an edge', async () => {
  await redAll(checkTransformOrigin, [
    ['confirmation from the top left', mCss('transform: scale(0.95);\n  transform-origin: center;', 'transform: scale(0.95);\n  transform-origin: top left;')],
    ['sheet from the bottom', mCss('transform: translateY(var(--s8));\n  transform-origin: center;', 'transform: translateY(var(--s8));\n  transform-origin: center bottom;')],
  ]);
}, { browser: true });

test('the transitions-only checker goes red when a keyframe animation runs on a panel or on a toast', async () => {
  await redAll(checkOnlyTransitions, [
    ['a keyframe pulse on the sheet', { js: REAL.js, css: REAL.css + '\n@keyframes pulse{from{opacity:.9}to{opacity:1}}\n[data-v2].ov-sheet .ov-panel{animation:pulse 1s infinite}\n' }],
    ['a keyframe slide on the toast', { js: REAL.js, css: REAL.css + '\n@keyframes slide{from{opacity:.9}to{opacity:1}}\n[data-v2] .ov-toast{animation:slide 1s}\n' }],
  ]);
}, { browser: true });

const REDUCED_TAIL = /\/\* -+ overlays under reduced motion[\s\S]*$/;
test('the reduced-motion checker goes red when the overlay block is missing, leaves a transform on a toast, a sheet or a dialog, or drops the fade', async () => {
  await redAll(checkReducedMotion, [
    ['no reduced-motion block for the overlays', mCss(REDUCED_TAIL, '')],
    ['the toast keeps moving', mCss(/(prefers-reduced-motion: reduce\) \{\n  \[data-v2\]\.ov-sheet[\s\S]*?\[data-v2\] \.ov-toast \{\n    )transform: none;\n    /, '$1')],
    ['the sheet keeps moving', mCss(/(prefers-reduced-motion: reduce\) \{\n  \[data-v2\]\.ov-sheet \.ov-panel,\n  \[data-v2\]\.ov-confirm \.ov-panel \{\n    )transform: none;\n    /, '$1')],
    ['the movement is back when mounted', mCss('[data-v2].ov-sheet[data-mounted] .ov-panel {\n    transition: opacity 250ms ease-out;', '[data-v2].ov-sheet[data-mounted] .ov-panel {\n    transform: translateY(1px);\n    transition: transform 250ms ease-out, opacity 250ms ease-out;')],
    ['the fade is dropped on enter', mCss('[data-v2].ov-sheet[data-mounted] .ov-panel {\n    transition: opacity 250ms ease-out;', '[data-v2].ov-sheet[data-mounted] .ov-panel {\n    transition: none;')],
    ['the toast fade is dropped', mCss('[data-v2] .ov-toast[data-mounted] {\n    transition: opacity 200ms ease-out;', '[data-v2] .ov-toast[data-mounted] {\n    transition: none;')],
    ['the reduced block only covers the sheet', mCss(/(  \[data-v2\] \.ov-toast \{\n    transform: none;\n    transition: opacity 150ms ease-out;\n  \}\n\n)/, '')],
  ]);
}, { browser: true, solo: true });

test('the exit checker goes red for an exit that is skipped, one that waits two seconds, an Escape that closes on the spot and a confirmation that never leaves', async () => {
  await redAll(checkExitIsAnimatedAndPrompt, [
    ['no exit: removed on the spot', mJs('var ms = Math.max(transitionMs(rec.panel), transitionMs(rec.scrim));', 'var ms = 0;')],
    ['the exit waits two seconds', mJs('}, ms + SLACK_MS);\n  }\n\n  function finish(rec) {', '}, 2000);\n  }\n\n  function finish(rec) {')],
    ['Escape skips the exit', { js: mutate(mutate(REAL.js, 'ev.preventDefault();\n      modals[modals.length - 1].onCancel();', ''), 'ev.preventDefault(); rec.onCancel();', 'rec.onCancel();'), css: REAL.css }],
    ['the confirmation never leaves', mJs('rec.timer = window.setTimeout(function () { finish(rec); }, ms + SLACK_MS);', '')],
  ]);
}, { browser: true, solo: true });

test('the no-motion checker goes red when closing waits for a transition that never runs, when a toast does, and when focus is not restored', async () => {
  await redAll(checkNoMotionClosesAtOnce, [
    ['closing always waits for a timer', mJs('if (ms <= 0) { finish(rec); return; }', '')],
    ['a toast waits for a transition that never runs', { js: mutate(mutate(REAL.js, 'if (ms <= 0) { drop(t); return; }', ''), 't.removeTimer = window.setTimeout(function () { drop(t); }, ms + SLACK_MS);', ''), css: REAL.css }],
    NO_RESTORE,
  ]);
}, { browser: true });

/* ---------- theme, density, layout ---------- */
test('the theme checker goes red when the dialog ignores data-theme, ignores <html>, ignores the wrapper and the OS, and when the toast lane is not themed', async () => {
  await redAll(checkTheme, [
    ['the theme is not copied', mJs("copyAttr(el, 'data-theme', themed);", '')],
    ['<html> is not consulted', mJs("var themed = root && root.hasAttribute('data-theme') ? root : html;", 'var themed = root;')],
    ['the dialog is always dark', mJs("copyAttr(el, 'data-theme', themed);", "el.setAttribute('data-theme', 'dark');")],
    ['the lane is not themed', mJs('skin(lane, null);', "lane.setAttribute('data-v2', '');")],
    ['the dialog is not a data-v2 element', mJs("el.setAttribute('data-v2', '');\n    var themed", "var themed")],
  ]);
}, { browser: true });

test('the density checker goes red when the dialog ignores the density of the place it was opened from, and when it always takes desk', async () => {
  await redAll(checkDensity, [
    ['density is not copied', mJs("copyAttr(el, 'data-density', dense || root);", '')],
    ['the root density only', mJs("copyAttr(el, 'data-density', dense || root);", "copyAttr(el, 'data-density', root);")],
    ['always desk', mJs("copyAttr(el, 'data-density', dense || root);", "el.setAttribute('data-density', 'desk');")],
  ]);
}, { browser: true });

test('the re-render checker goes red when the dialog is appended inside the app\'s root, where a redraw would delete it, and when a toast wiped with <body> is still believed to be showing', async () => {
  await redAll(checkSurvivesRerender, [
    ['appended inside the app root', mJs('doc().body.appendChild(rec.dlg);', '(v2Root() || doc().body).appendChild(rec.dlg);')],
    ['a wiped toast is still believed to be showing', mJs('    purge();\n', '')],
  ]);
}, { browser: true });

test('the layout checker goes red for a sheet with no height limit, one that does not scroll, one that is not on the bottom edge or is too wide, a confirmation that is not centred, a sheet or a confirmation that cannot shrink to a phone, and a toast whose text is not bounded', async () => {
  const L = { live: false, width: 1024, height: 768 };
  await redAll((env) => checkLayout(env, L), [
    ['no max-height on the sheet', mCss('  max-width: 40rem;\n  max-height: 90%;', '  max-width: 40rem;')],
    ['the sheet body does not scroll', mCss('  overflow: auto;\n  overscroll-behavior: contain;\n}\n\n[data-v2] .ov-text', '  overscroll-behavior: contain;\n}\n\n[data-v2] .ov-text')],
    ['the sheet is not on the bottom edge', mCss('[data-v2].ov-sheet[open] {\n  align-items: flex-end;', '[data-v2].ov-sheet[open] {\n  align-items: center;')],
    ['the sheet is wider than 40rem', mCss('max-width: 40rem;', 'max-width: 60rem;')],
    ['the dialog is not centred', mCss('  display: flex;\n  align-items: center;\n  justify-content: center;\n}', '  display: flex;\n  align-items: flex-start;\n  justify-content: flex-start;\n}')],
    ['the toast text is not bounded', mCss('  max-height: calc(var(--t5) * var(--lh) * 6);\n', '')],
  ]);
  const P = { live: false, width: 360, height: 640 };
  await red((env) => checkLayout(env, P), 'a sheet with a minimum width wider than a phone', mCss('  width: 100%;\n  max-width: 40rem;', '  width: 100%;\n  min-width: 30rem;\n  max-width: 40rem;'));
  await red((env) => checkLayout(env, P), 'a confirmation with a minimum width wider than a phone', mCss('width: min(28rem, calc(100% - var(--s8)));', 'width: min(28rem, calc(100% - var(--s8)));\n  min-width: 24rem;'));
}, { browser: true });

test('the quiet-flow checker goes red when the page throws or logs an error during a session', async () => {
  await redAll(checkFlowIsQuiet, [
    ['an exception in finish', mJs('if (rec.dlg.parentNode) rec.dlg.parentNode.removeChild(rec.dlg);', 'if (rec.dlg.parentNode) rec.dlg.parentNode.removeChild(rec.dlg); window.nope.x();')],
    ['a console.error', mJs('function leave(t) {', "function leave(t) {\n    window.console.error('toast left');")],
  ]);
}, { browser: true });

test('the leaked-timer checker goes red when a replaced sheet keeps its exit timer, when a toast closed by hand or evicted keeps its ms timer, when a retriggered toast keeps the old timer, and when closing starts an unrelated long timer', async () => {
  await redAll(checkNoLeakedTimers, [
    ['finish() does not clear the exit timer', mJs('window.clearTimeout(rec.timer);\n    var i = modals.indexOf(rec);', 'var i = modals.indexOf(rec);')],
    ['arm() does not clear the previous timer', mJs('function arm(t) {\n    window.clearTimeout(t.timer);', 'function arm(t) {')],
    ['neither leave() nor drop() clears the ms timer of a toast closed by hand', { js: mutate(mutate(REAL.js, 't.leaving = true;\n    window.clearTimeout(t.timer);', 't.leaving = true;'), 't.gone = true;\n    window.clearTimeout(t.timer);', 't.gone = true;'), css: REAL.css }],
    ['closing starts a 60 second timer', mJs('if (rec.dlg.parentNode) rec.dlg.parentNode.removeChild(rec.dlg);', 'if (rec.dlg.parentNode) rec.dlg.parentNode.removeChild(rec.dlg); window.setTimeout(function () {}, 60000);')],
  ]);
}, { browser: true });

test('the namespace checker goes red when a bare name is attached next to V2, when the page\'s own functions are replaced, and when V2 is missing', async () => {
  await redAll(checkLeavesBareNamesAlone, [
    ['a bare toast', mJs('window.V2 = {', 'window.toast = toast; window.V2 = {')],
    ['a bare openSheet', mJs('window.V2 = {', 'window.openSheet = openSheet; window.V2 = {')],
    ['a bare closeSheet', mJs('window.V2 = {', 'window.closeSheet = closeSheet; window.V2 = {')],
    ['a bare confirmDialog', mJs('window.V2 = {', 'window.confirmDialog = confirmDialog; window.V2 = {')],
    ['no V2', mJs('window.V2 = {', 'window.V2x = {')],
    ['V2 is missing a member', mJs('closeSheet: closeSheet, confirmDialog', 'confirmDialog')],
  ]);
}, { browser: true });

test('the Escape-with-a-toast checker goes red when Escape is not taken on keydown (the toast swallows it) or when it goes to the wrong modal', async () => {
  await redAll(checkEscapeWithAToast, [
    ['no keydown handler', mJs("doc().addEventListener('keydown', onKey);", '')],
    ['Escape goes to the bottom modal', mJs('modals[modals.length - 1].onCancel();\n    }\n  }', 'modals[0].onCancel();\n    }\n  }')],
  ]);
}, { browser: true });

test('the claimed-Escape checker goes red when Escape closes the sheet even though a control inside it claimed it, and when Escape no longer closes anything', async () => {
  await redAll(checkEscapeCanBeClaimed, [
    ['claimed Escape is ignored', mJs("!ev.defaultPrevented && ", '')],
    ['Escape closes nothing', mJs("ev.preventDefault();\n      modals[modals.length - 1].onCancel();", "ev.preventDefault();")],
  ]);
}, { browser: true });

test('the scroll-lock checker goes red for no lock, a lock that is never released, one that restores empty values instead of the app\'s, one released by the first of two stacked overlays, one released after a throwing hook, one left stuck by a wiped <body>, a toast that locks, and a lock that makes the page jump', async () => {
  await redAll(checkScrollLock, [
    ['no lock', mJs("el.style.overflow = 'hidden';", '')],
    ['the restore is dropped', mJs('el.style.overflow = scrollSaved.overflow;\n    el.style.paddingRight = scrollSaved.paddingRight;', '')],
    ['the restore writes empty values', mJs('el.style.overflow = scrollSaved.overflow;\n    el.style.paddingRight = scrollSaved.paddingRight;', "el.style.overflow = '';\n    el.style.paddingRight = '';")],
    ['released by the first close of two', mJs('if (!modals.length) { unlockScroll(); unwatch(); }', 'unlockScroll(); unwatch();')],
    ['released only after the onClose hook, which throws', { js: mutate(mutate(REAL.js, '    if (!modals.length) { unlockScroll(); unwatch(); }  // first, before anything below can throw\n', ''), "if (typeof rec.after === 'function') rec.after();", "if (typeof rec.after === 'function') rec.after();\n    if (!modals.length) { unlockScroll(); unwatch(); }"), css: REAL.css }],
    ['a wiped <body> is not noticed', mJs("watcher.observe(doc().body, { childList: true });", '')],
    ['a toast locks the page', mJs('ensureLane().appendChild(el);\n    flush(el);', 'lockScroll(); ensureLane().appendChild(el);\n    flush(el);')],
    ['a lone confirmation never locks', mJs('    lockScroll();\n    watch();', '    if (rec === sheet) lockScroll();\n    watch();')],
    ['the vanished scrollbar is not made up for', mJs('if (bar > 0) el.style.paddingRight', 'if (false) el.style.paddingRight')],
    ['the lock is taken twice and the second save overwrites the first', mJs('    if (scrollSaved) return;\n    var el = doc().documentElement, bar', '    var el = doc().documentElement, bar')],
  ]);
}, { browser: true });

/* ---------- the class and static checks, fed mutants ---------- */
test('the class-has-a-rule check goes red when a rendered class loses its rule, and the live-collision check goes red when a class is also the live app\'s', async () => {
  const bad = mCss(/\.ov-scrim/g, '.ov-scrimx');
  assert(unstyled(overlayClassesIn(await renderedClasses(bad)), bad.css).includes('ov-scrim'), 'a missing .ov-scrim rule was not found');
  const hit = overlayClassesIn(await renderedClasses(REAL));
  assert(livecollisions(hit, LIVE + '\n.ov-panel{color:red}').includes('ov-panel'), 'a collision with the live app was not found');
  assert(unstyled(['ov-toast-close'], mutate(REAL.css, '[data-v2] .ov-toast-close', '[data-v2] .ov-toast-closex')).length === 1, 'a renamed rule was not found');
}, { browser: true });

test('the static checks go red for a stylesheet with scale(0) or an animation, a script with an arrow function or a stray global or an emoji', () => {
  hits(scaleFailures(mutate(needCss(), 'transform: scale(0.95);', 'transform: scale(0);')), 'scale(0) in the real stylesheet was not found');
  hits(scaleFailures(mutate(needCss(), 'transform: scale(0.95);', 'transform: scale(0.5);')), 'scale(0.5) in the real stylesheet was not found');
  hits(keyframeFailures(needCss() + '\n@keyframes toast-in{from{opacity:0}}'), '@keyframes in the real stylesheet was not found');
  hits(keyframeFailures(needCss() + '\n[data-v2] .ov-toast{animation:x 1s}'), 'animation in the real stylesheet was not found');
  hits(es6Syntax(needEnv(REAL).js + '\nvar f = (a) => a;'), 'an arrow function in overlay.js was not found');
  hits(es6Syntax(needEnv(REAL).js + '\nvar s = `x`;'), 'a template literal in overlay.js was not found');
  assert(/[^\x00-\x7F]/.test(needEnv(REAL).js + ' \u{1F68C}'), 'an emoji in overlay.js was not found');
  assert.deepEqual(loadInVm(needEnv(REAL).js + '\nwindow.leak = 1;').added, ['V2', 'leak'], 'a stray global was not found');
  assert.notDeepEqual(loadInVm(needEnv(REAL).js + '\nwindow.toast = function () {};').added, ['V2'], 'a bare toast global was not found');
  assert.notDeepEqual(loadInVm(needEnv(REAL).js.replace('window.V2 = ', 'var unused = ')).added, ['V2'], 'a missing V2 was not found');
});



/* ---------- done ---------- */
(async () => {
  await runQueue();
  await closeBrowser();
  if (selfSkipped) console.log('\n' + selfSkipped + ' self-test(s) of the checkers were left out (the suite was pointed at another copy of the files, or OVERLAY_SKIP_SELFTESTS=1)');
  if (skipped) console.log('\n' + skipped + ' browser test(s) were SKIPPED (OVERLAY_NO_BROWSER=1): this is not a full pass');
  if (unmeasured) console.log('\n' + unmeasured + ' check(s) were NOT MEASURED: this machine would not keep time well enough (see NOT MEASURED above).'
    + '\nThis is not a full pass. Nothing here says ui/overlay.js is wrong, and nothing here says it is right either;'
    + '\nrun it again on a quieter machine, or read the CI run, which does the same checks with the box to itself.');
  if (fails) { console.log('\n' + fails + ' FAILED'); process.exit(1); }
  const caveat = [skipped ? skipped + ' skipped' : '', unmeasured ? unmeasured + ' not measured' : ''].filter(Boolean).join(', ');
  console.log('\n' + (caveat ? 'no check failed (' + caveat + ') -- NOT a full pass' : 'all passed'));
})();

#!/usr/bin/env bash
# The v2 row-budget INSTRUMENT.  It measures; it does not judge.
#
# WHY THIS EXISTS.  docs/v2/DECISIONS.md section 9: the foundation's budget, "200 dense desk rows inside 250 ms", is a
# placeholder taken from a developer's Mac, not a measurement, and every density rule in docs/v2/plan/v2-foundation-ui.md
# is sized against it.  The office runs Windows 7 on Chrome 109, some of it on Core 2 Duos, and nobody in this pipeline has
# that hardware.  So this script cannot produce THE number.  It produces the instrument that will, and this machine's
# reading, labelled as exactly that.
#
# WHAT IT DOES.  Drives v2/ui/gallery.html in headless Chrome, one fresh page per bed so that run 1 is the first press on a
# freshly opened gallery, and prints THREE runs for each of:
#     bed 1   200 dense desk rows (a drawing, a figure, a badge and a button on every row)
#     bed 2   200 v2row-why rows (the Attention row: a mark, a two-line reason, a figure)
#     bed 3   the 2,384-row parts catalogue, drawn whole and drawn windowed
# beside the machine's name, the browser and the load average.  All three runs are printed in the order taken, never the
# best one: if they disagree wildly, that disagreement IS the finding.
#
# WHAT IT ASSERTS.  NO TIME THRESHOLD.  A test that hard-codes today's milliseconds fails on a busy machine and teaches
# people to delete it, and a threshold measured here would be the same lie one layer down.  The threshold in
# scripts/predeploy-gate.sh is changed by the lead, by hand, with a real reading beside the edit.
# Exit 1 only when a bed drew fewer rows than it was asked for, or a row is missing one of its parts (the rows would then
# be timing bare divs).  Exit 2 when it cannot run at all (no Chrome, no node 22, the page throws).  Exit 0 otherwise,
# INCLUDING when the machine is too busy to measure on: it then says so loudly and prints no numbers, because a number it
# does not believe is worse than none.  (Same stance as checkToastTiming in test_ui_overlay.js: an unmeasurable run is not a
# red and not a pass.)
#
# Knobs, all optional:
#   CHROME_BIN                         the Chrome to drive
#   MEASURE_ROWS_MACHINE               a name to print for the machine (default: the computer name and its CPU)
#   MEASURE_ROWS_MAX_LOAD_PER_CORE     the 1-minute load average per core above which we refuse to measure (default 0.7)
#   MEASURE_ROWS_PAGE                  a different gallery.html to drive (used to prove this script can fail; absolute path)
#   MEASURE_ROWS_FORCE=1               measure anyway on a busy machine; every line is then stamped as taken under load
#
# Usage:  scripts/measure-v2-rows.sh
set -u
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export MEASURE_REPO="$REPO"

NODE="$(command -v node || true)"
if [ -z "$NODE" ]; then
  echo "measure-v2-rows: no node on PATH (needs node 22+ for the built-in WebSocket)." >&2
  exit 2
fi

exec "$NODE" - <<'JS'
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn, execFileSync } = require('child_process');

const REPO = process.env.MEASURE_REPO;
const PAGE = 'file://' + (process.env.MEASURE_ROWS_PAGE || REPO + '/v2/ui/gallery.html');
const MAX_LOAD = Number(process.env.MEASURE_ROWS_MAX_LOAD_PER_CORE || 0.7);
const FORCE = process.env.MEASURE_ROWS_FORCE === '1';
const VIEW = { width: 1024, height: 768 };          // an office monitor, at 1x. See the "does not model" list for what this is not.
const STEADY_SPREAD = 1.5;                          // the fixed-arithmetic probe may vary this much run to run before we call the machine unsteady
const DISAGREE = 1.5;                               // slowest/fastest of three runs above which the runs are flagged as disagreeing

const BEDS = [
  { key: 'desk', title: 'BED 1   200 dense desk rows', note: 'a drawing, two lines, a figure, a badge and a button on every row' },
  { key: 'why', title: 'BED 2   200 v2row-why rows (the Attention row)', note: 'a coloured mark, a two-line reason and a figure; no badge, no button, as Attention specifies' },
  { key: 'cat', title: 'BED 3a  2,384 catalogue rows, all drawn (unwindowed)', note: 'one line each: a mark, the name, a figure, a badge, a button' },
  { key: 'catw', title: 'BED 3b  2,384 catalogue rows, windowed', note: 'the rows that fit plus 8 either side; then ten page-sized scroll steps, each redrawing the window' },
];

const line = (s) => process.stdout.write((s === undefined ? '' : s) + '\n');
const rule = () => line('='.repeat(78));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (x) => (Math.round(x * 10) / 10).toFixed(1);

/* ---------- the machine ---------- */
function computerName() {
  if (process.env.MEASURE_ROWS_MACHINE) return process.env.MEASURE_ROWS_MACHINE;
  let n = os.hostname();
  if (process.platform === 'darwin') { try { n = execFileSync('scutil', ['--get', 'ComputerName'], { encoding: 'utf8' }).trim() || n; } catch (e) { /* hostname will do */ } }
  // A computer name can carry an emoji; this output stays ASCII like everything else here.
  const plain = n.replace(/[^\x20-\x7e]/g, '').trim();
  return plain || os.hostname().replace(/[^\x20-\x7e]/g, '') || 'unnamed machine';
}
function machine() {
  const cpus = os.cpus() || [];
  return {
    name: computerName(),
    cpu: cpus.length ? cpus[0].model.replace(/\s+/g, ' ').trim() : 'unknown CPU',
    cores: cpus.length || 1,
    ramGb: (os.totalmem() / 1073741824).toFixed(1),
    os: os.type() + ' ' + os.release() + ' ' + os.arch(),
  };
}
function loadNow(m) {
  const l = os.loadavg();
  return { l1: l[0], l5: l[1], l15: l[2], perCore: l[0] / m.cores, text: l.map((x) => x.toFixed(2)).join(' ') + '  (' + (l[0] / m.cores).toFixed(2) + ' per core)' };
}

/* ---------- a minimal DevTools client, in the shape test_ui_overlay.js uses ---------- */
function chromePath() {
  const c = [process.env.CHROME_BIN, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'];
  return c.find((p) => p && fs.existsSync(p)) || null;
}
async function launch() {
  const exe = chromePath();
  if (!exe) throw new Error('no Chrome found (set CHROME_BIN)');
  if (typeof WebSocket !== 'function') throw new Error('this node has no built-in WebSocket (needs node 22+)');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rows-chrome-'));
  const proc = spawn(exe, ['--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + dir, '--no-first-run', '--no-default-browser-check', '--disable-gpu',
    '--disable-extensions', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    '--window-size=' + VIEW.width + ',' + VIEW.height, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const url = await new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => reject(new Error('Chrome did not start: ' + buf.slice(0, 300))), 20000);
    proc.stderr.on('data', (d) => { buf += d; const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf); if (m) { clearTimeout(timer); resolve(m[1]); } });
    proc.on('error', (e) => { clearTimeout(timer); reject(e); });
    proc.on('exit', () => { clearTimeout(timer); reject(new Error('Chrome exited early: ' + buf.slice(0, 300))); });
  });
  proc.stderr.removeAllListeners('data'); proc.stderr.destroy();
  const ws = new WebSocket(url);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('could not open the DevTools socket')); });
  const b = { proc, ws, dir, id: 0, pending: new Map(), listeners: new Set() };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && b.pending.has(m.id)) { const { res, rej } = b.pending.get(m.id); b.pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
    else if (m.method) b.listeners.forEach((l) => l(m));
  };
  b.send = (method, params, sessionId) => new Promise((res, rej) => { const id = ++b.id; b.pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params: params || {}, sessionId })); });
  return b;
}
async function closeBrowser(b) {
  if (!b) return;
  try { b.ws.close(); } catch (e) { /* already closed */ }
  const gone = new Promise((res) => b.proc.once('exit', res));
  b.proc.kill();
  const t = setTimeout(() => b.proc.kill('SIGKILL'), 3000);
  await gone; clearTimeout(t);
  try { fs.rmSync(b.dir, { recursive: true, force: true }); } catch (e) { /* best effort */ }
}

// Opens the gallery in a FRESH tab, hands the page to fn, then closes the tab.
async function withGallery(b, fn) {
  const { targetId } = await b.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await b.send('Target.attachToTarget', { targetId, flatten: true });
  const call = (method, params) => b.send(method, params, sessionId);
  try {
    await call('Page.enable');
    await call('Emulation.setDeviceMetricsOverride', { width: VIEW.width, height: VIEW.height, deviceScaleFactor: 1, mobile: false });
    const loaded = new Promise((res) => { const l = (m) => { if (m.sessionId === sessionId && m.method === 'Page.loadEventFired') { b.listeners.delete(l); res(); } }; b.listeners.add(l); });
    await call('Page.navigate', { url: PAGE });
    await Promise.race([loaded, sleep(20000).then(() => { throw new Error('the gallery did not finish loading in 20 s'); })]);
    await sleep(300);                                       // let the first style pass and any late font settle, outside any clock
    const ev = async (expression) => {
      const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: false });
      if (r.exceptionDetails) throw new Error('in the page: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text));
      return r.result.value;
    };
    const broken = await ev('(window.__errors && window.__errors.length ? window.__errors.join(" | ") : "") || (typeof window.RowBeds === "object" && typeof icon === "function" && typeof figure === "function" ? "" : "RowBeds, icon or figure is missing")');
    if (broken) throw new Error('the gallery page is broken: ' + broken);
    return await fn(ev);
  } finally {
    try { await b.send('Target.closeTarget', { targetId }); } catch (e) { /* the browser is closing anyway */ }
  }
}

/* ---------- refusing to measure ---------- */
function refuse(why, m, load) {
  rule();
  line(' NOT MEASURED.  THIS MACHINE IS TOO BUSY TO TIME ANYTHING ON.');
  rule();
  line(' ' + why);
  line();
  line(' machine : ' + m.name + ' (' + m.cpu + ', ' + m.cores + ' logical cores)');
  line(' load    : ' + load.text);
  line();
  line(' No numbers are printed, because none of them would be believed.  This is NOT a pass and');
  line(' NOT a fail: it is no reading at all.  Close what is running and run it again, or set');
  line(' MEASURE_ROWS_FORCE=1 to take the reading anyway (every line is then stamped as taken');
  line(' under load).  Exiting 0.');
  rule();
}

/* ---------- the report ---------- */
function spreadOf(vals) { return Math.max.apply(null, vals) / Math.max(Math.min.apply(null, vals), 0.001); }

function report(res, notes) {
  const info = res.info, ms = res.runs.map((r) => r.ms), problems = [];
  line('  ' + res.title);
  line('  (' + res.note + ')');
  line('    run 1  ' + fmt(res.runs[0].ms).padStart(8) + ' ms' + (res.windowed ? '   then 10 scroll steps ' + fmt(res.runs[0].ms2).padStart(8) + ' ms' : ''));
  line('    run 2  ' + fmt(res.runs[1].ms).padStart(8) + ' ms' + (res.windowed ? '   then 10 scroll steps ' + fmt(res.runs[1].ms2).padStart(8) + ' ms' : ''));
  line('    run 3  ' + fmt(res.runs[2].ms).padStart(8) + ' ms' + (res.windowed ? '   then 10 scroll steps ' + fmt(res.runs[2].ms2).padStart(8) + ' ms' : ''));
  const sp = spreadOf(ms);
  line('    spread: the slowest run is ' + sp.toFixed(1) + 'x the fastest' + (sp > DISAGREE ? '.   *** THE RUNS DISAGREE.  That is the finding: quote the three, never one. ***' : '.'));
  if (res.windowed) {
    const sp2 = spreadOf(res.runs.map((r) => r.ms2));
    line('    scroll steps spread: ' + sp2.toFixed(1) + 'x' + (sp2 > DISAGREE ? '.   *** THE RUNS DISAGREE. ***' : '.'));
    line('    drew ' + info.drawn + ' rows in the window of ' + res.asked.toLocaleString('en') + '; scroll height ' + info.scrollHeight + ' px against ' + info.expectedScrollHeight + ' px (rows x --row-h ' + info.rowH + ' px)');
    if (info.scrollHeight !== info.expectedScrollHeight) notes.push(res.title.trim() + ': scroll height is ' + info.scrollHeight + ' px, not rows x --row-h = ' + info.expectedScrollHeight + ' px; the window arithmetic and the layout disagree.');
    if (info.firstIndexShown !== info.firstIndexExpected) notes.push(res.title.trim() + ': after the last scroll step the first row shown is #' + info.firstIndexShown + ', expected #' + info.firstIndexExpected + '.');
  } else {
    line('    drew ' + info.drawn + ' of ' + res.asked + ' rows asked for; ' + info.full + ' hold every part; a row is ' + info.rowPx.toFixed(1) + ' px tall on average (--row-h says ' + info.tokenPx + ' px); bed ' + res.width + ' px wide' + (res.key === 'cat' ? '' : ' (this bed\'s rows have two lines, so taller than the one-line token is expected)'));
    if (res.key === 'cat' && Math.abs(info.rowPx - info.tokenPx) > 0.5) notes.push(res.title.trim() + ': rows average ' + info.rowPx.toFixed(2) + ' px, not the --row-h token of ' + info.tokenPx + ' px. Windowing and scroll height both rest on that token.');
  }
  if (info.wrap) {
    const w = info.wrap, h = Object.keys(w.histogram).sort().map((k) => w.histogram[k] + ' x ' + k + '-line').join(', ');
    line('    reasons: ' + w.twoLine + ' of ' + w.of + ' wrapped to two lines (' + h + '); -webkit-line-clamp is "' + w.clamp + '"');
    if (w.twoLine !== w.of) notes.push('BED 2 IS NOT MEASURING THE REAL ROW.  Only ' + w.twoLine + ' of ' + w.of + ' reasons wrapped to two lines, and -webkit-line-clamp is "' + w.clamp + '".  `.v2row-why` is probably not in v2/ui/components.css yet (it is P1\'s rule).  The number above is a LIGHTER row than Attention will ship; re-run once P1 has landed.');
  }
  if (info.drawn !== info.expectedDrawn) problems.push(res.title.trim() + ': drew ' + info.drawn + ' rows, was asked for ' + info.expectedDrawn);
  const parts = Object.keys(info.missing);
  if (info.full !== info.drawn) problems.push(res.title.trim() + ': ' + (info.drawn - info.full) + ' rows are missing a part (' + parts.map((k) => k + ' x' + info.missing[k]).join(', ') + ')');
  line();
  return problems;
}

async function main() {
  const m = machine();
  const load0 = loadNow(m);

  rule();
  line(' Garage Saathi v2 row-budget instrument');
  rule();
  line(' machine  : ' + m.name);
  line('             ' + m.cpu + ', ' + m.cores + ' logical cores, ' + m.ramGb + ' GB, ' + m.os);
  line(' load avg  : ' + load0.text + '   (1, 5, 15 minutes, before)');
  line(' taken     : ' + new Date().toString());

  if (!FORCE && load0.perCore > MAX_LOAD) {
    line();
    refuse('The 1-minute load average is ' + load0.l1.toFixed(2) + ' on ' + m.cores + ' logical cores = ' + load0.perCore.toFixed(2) + ' per core, above the ' + MAX_LOAD + ' this script will measure under.', m, load0);
    return 0;
  }

  let b;
  try { b = await launch(); } catch (e) { line(); line('measure-v2-rows: ' + e.message); return 2; }
  try {
    const ver = await b.send('Browser.getVersion');
    line(' browser   : ' + ver.product + ' (headless, GPU off, ' + VIEW.width + 'x' + VIEW.height + ' at 1x)');
    line('             *** NOT the office browser.  The office runs Chrome 109 on Windows 7. ***');
    if (FORCE && load0.perCore > MAX_LOAD) line(' LOAD      : *** TAKEN UNDER LOAD (MEASURE_ROWS_FORCE=1).  Every number below is suspect. ***');
    line();

    // Is the machine holding still?  A fixed bit of arithmetic, timed; it says nothing about speed.
    let steady = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const probe = await withGallery(b, (ev) => ev('window.RowBeds.steady()'));
      const sp = spreadOf(probe);
      if (sp <= STEADY_SPREAD) { steady = { probe, sp }; break; }
      if (attempt < 3) await sleep(2000);
      else steady = { probe, sp, bad: true };
    }
    if (steady.bad && !FORCE) {
      line();
      refuse('A fixed piece of arithmetic, timed five times in a row, varied by ' + steady.sp.toFixed(1) + 'x (' + steady.probe.join(', ') + ' ms) on three tries.  The machine is not holding still, so a row timing taken now says more about what else is running than about the rows.', m, loadNow(m));
      return 0;
    }
    line(' steadiness: a fixed loop timed 5 times varied ' + steady.sp.toFixed(2) + 'x (' + steady.probe.join(', ') + ' ms)' + (steady.bad ? '   *** UNSTEADY (forced) ***' : '   steady enough'));
    line();
    line('THREE RUNS PER BED, in the order taken.  Each bed is a fresh page, so run 1 is the first');
    line('press on a freshly opened gallery (cold); runs 2 and 3 are warm.  Nothing is picked or averaged.');
    line();

    const problems = [], notes = [];
    for (const bed of BEDS) {
      const res = await withGallery(b, (ev) => ev('window.RowBeds.run(' + JSON.stringify(bed.key) + ')'));
      if (res.errors && res.errors.length) throw new Error('the page raised errors while measuring: ' + res.errors.join(' | '));
      res.title = bed.title; res.note = bed.note;
      problems.push.apply(problems, report(res, notes));
    }

    const load1 = loadNow(m);
    line('load avg after: ' + load1.text);
    line();
    if (notes.length) {
      rule();
      line(' READ THESE BEFORE QUOTING ANY NUMBER ABOVE');
      rule();
      notes.forEach((n) => line(' * ' + n + '\n'));
    }
    rule();
    line(' WHAT THIS DOES NOT MODEL  (so nobody over-reads it)');
    rule();
    [
      'The office machine.  This is ' + m.cpu + ' with ' + m.cores + ' logical cores, not a Core 2 Duo; the ratio between the two is unknown and could be large.',
      'The office browser.  Chrome 109 on Windows 7 has an older style and layout engine; this is a current headless Chrome.',
      'Painting and compositing.  The clock stops after a forced layout (offsetHeight), GPU is off, nothing is rasterised or shown.',
      'Scrolling smoothness.  Bed 3b times ten redraws of the window, not a frame rate.',
      'The real data and the real code.  Rows are stand-ins with the same parts, built by the real icon(), figure() and the v2 row, badge and button styles.',
      'The real fonts.  Hindi in Nirmala UI is not drawn; reasons wrap in whatever this machine falls back to.  Hindi reasons run about 88 px tall, not two Latin lines.',
      'Any width but ' + VIEW.width + ' px.  The Store designer\'s 864 px desk column is a guess nobody has looked at; narrower rows wrap more.',
      'Memory pressure, other programs, a cold disk cache, script parse time, or a first visit.  Run 1 is cold for the page only.',
      'Whether any of it is fast ENOUGH.  There is no threshold here, deliberately.',
    ].forEach((t) => line(' - ' + t));
    line();
    rule();
    line(' TO TAKE THE READING THAT MATTERS  (one person, five minutes, in the office)');
    rule();
    line(' 1. On a Windows 7 / Chrome 109 Core 2 Duo, open v2/ui/gallery.html from a copy of the v2/ui folder');
    line('    (double-click it; no server, nothing is sent or saved).');
    line(' 2. Type the computer\'s make, model and CPU in the box at the top.');
    line(' 3. Press each Draw button once, on a freshly opened page: bed 1, bed 2, bed 3 (both buttons).');
    line(' 4. Photograph the screen with the three runs showing, and send it back.');
    line(' 5. The lead then edits the threshold in scripts/predeploy-gate.sh by hand, with that');
    line('    reading beside the edit.  This instrument does not.');
    rule();

    if (problems.length) {
      line();
      line('FAILED: the beds are not what they claim to be, so the times above time something else.');
      problems.forEach((p) => line(' x ' + p));
      return 1;
    }
    line('No threshold asserted.  Every bed drew the rows it was asked for and every row holds all its parts.');
    return 0;
  } catch (e) {
    line();
    line('measure-v2-rows: could not take the measurement: ' + e.message);
    return 2;
  } finally {
    await closeBrowser(b);
  }
}

main().then((code) => { process.exitCode = code; }, (e) => { console.error(e); process.exitCode = 2; });
JS

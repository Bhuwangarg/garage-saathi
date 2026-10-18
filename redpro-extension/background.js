/* Mahalaxmi redPro Sync — the background worker.
 *
 * Every 10 minutes it looks at the timetable (lib.js) and runs what is due, through a redPro tab the
 * office is signed in to: the calls are made inside that tab, with its own sign-in, exactly as the
 * redPro screens make them. Nothing here signs in, types a password, clicks, replies, assigns or
 * exports anything in redPro — it only reads. Results go to Garage Saathi's /redpro/ingest.
 *
 * If there is no redPro tab, or redPro has signed it out, nothing is read and the badge shows "!".
 */
importScripts('lib.js');

const DEFAULTS = { gsUrl: 'https://garage-saathi-sync.vercel.app', token: '' };
const PACE_MS = 1200;          // between redPro calls: slower than a person paging the list
const POST_CHUNK = 500;
const REVIEW_FLUSH_PAGES = 20; // a long first read sends what it has every 200 reviews

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (k) => new Promise((r) => chrome.storage.local.get(k, r));
const set = (o) => new Promise((r) => chrome.storage.local.set(o, r));

function ensureAlarm() { chrome.alarms.create('tick', { periodInMinutes: 10, delayInMinutes: 1 }); }
chrome.runtime.onInstalled.addListener(ensureAlarm);
chrome.runtime.onStartup.addListener(ensureAlarm);
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'tick') tick(false); });

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  // Start the run and answer at once: a first sync reads 45 days of reviews (minutes). The popup
  // follows it through `progress` instead of waiting on this message.
  if (msg && msg.type === 'syncNow') { const started = !running; tick(true).catch(() => {}); reply({ started }); return false; }
  if (msg && msg.type === 'status') { status().then(reply); return true; }
  return false;
});

async function status() {
  const { state = {}, settings = {} } = await get(['state', 'settings']);
  return { state, hasToken: !!settings.token, gsUrl: settings.gsUrl || DEFAULTS.gsUrl, running: !!running, progress: running ? progress : '' };
}

async function paint(state) {
  const b = RP.badge(state, Date.now());
  await chrome.action.setBadgeText({ text: b.text });
  await chrome.action.setBadgeBackgroundColor({ color: b.color });
  await chrome.action.setTitle({ title: 'Mahalaxmi redPro Sync — ' + b.title });
}

// Runs inside the redPro tab (world MAIN), so the call carries that tab's sign-in.
async function pageCall(path, body) {
  const o = { credentials: 'include', headers: { Accept: 'application/json' } };
  if (body !== null) { o.method = 'POST'; o.headers['Content-Type'] = 'application/json'; o.body = typeof body === 'string' ? body : JSON.stringify(body); }
  const r = await fetch(path, o);
  const t = await r.text();
  return { status: r.status, text: t.length > 8000000 ? t.slice(0, 8000000) : t };
}

class SignedOut extends Error {}

async function redproTab() {
  const tabs = await chrome.tabs.query({ url: 'https://www.redbus.pro/*' });
  return tabs.find((t) => /\/win(\/|$)/.test(t.url || '')) || tabs[0] || null;
}

async function call(tabId, path, body = null) {
  await sleep(PACE_MS);
  const [res] = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: pageCall, args: [path, body] });
  const r = res && res.result;
  if (!r) throw new Error('the redPro tab did not answer (was it closed or reloading?)');
  if (r.status === 401 || r.status === 403 || /^\s*</.test(r.text)) throw new SignedOut('redPro has signed this tab out — sign in again in the redPro tab');
  if (r.status >= 400) throw new Error(`redPro ${path} answered ${r.status}`);
  // redPro answers some requests with an empty 200 (a service with ~200+ via-routes): no data, not an error.
  if (!r.text.trim()) return null;
  return JSON.parse(r.text);
}

async function signedIn(tabId) {
  const j = await call(tabId, '/win/api/dashboard/getOperatorDetails');
  const body = j && typeof j === 'object' && j.body && typeof j.body === 'object' ? j.body : j;
  return !!body && String(body.OperatorId || body.operatorId || '') === RP.OPERATOR_ID;
}

async function post(settings, kind, rows, capturedAt) {
  let written = 0;
  for (let i = 0; i < rows.length; i += POST_CHUNK) {
    const res = await fetch((settings.gsUrl || DEFAULTS.gsUrl).replace(/\/$/, '') + '/redpro/ingest', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + settings.token },
      body: JSON.stringify({ kind, rows: rows.slice(i, i + POST_CHUNK), capturedAt }),
    });
    let j = {};
    try { j = await res.json(); } catch (e) { /* not JSON */ }
    if (!res.ok || !j.ok) throw new Error(`Garage Saathi refused the ${kind} (${res.status}${j.error ? ': ' + j.error : ''})`);
    written += j.written || 0;
  }
  return written;
}

// After new reviews land, ask Garage Saathi to have Claude read them for whose fault they are. A few
// small rounds at most; a big backlog goes to Claude as one batch and is collected on a later sync.
// Never fails the review sync: a problem here is only reported.
async function readFaults(settings) {
  let read = 0;
  try {
    for (let round = 0; round < 6; round++) {
      step(`Reviews: Claude is reading new ones${read ? ` (${read} so far)` : ''}…`);
      const res = await fetch((settings.gsUrl || DEFAULTS.gsUrl).replace(/\/$/, '') + '/ai/reviews', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + settings.token }, body: '{}',
      });
      let j = {};
      try { j = await res.json(); } catch (e) { /* not JSON */ }
      if (!res.ok) return read ? `; Claude read ${read}` : `; Claude: ${j.error || res.status}`;
      read += j.classified || 0;
      const b = j.batch || {};
      if (b.started) return `; ${b.reviews} sent to Claude as a batch`;
      if (!j.pending || !j.classified || j.limited) break;
    }
    return read ? `; Claude read ${read}` : '';
  } catch (e) { return '; Claude: not reachable'; }
}

// After redPro's assignments (the typed driver names) come in, ask Garage Saathi to have Claude match
// new names to crew. A couple of rounds at most; never fails the sync.
async function matchNames(settings) {
  let matched = 0, suggested = 0;
  try {
    for (let round = 0; round < 3; round++) {
      step('Bus & driver: Claude is matching driver names…');
      const res = await fetch((settings.gsUrl || DEFAULTS.gsUrl).replace(/\/$/, '') + '/ai/names', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + settings.token }, body: '{}',
      });
      let j = {};
      try { j = await res.json(); } catch (e) { /* not JSON */ }
      if (!res.ok) return `; names: ${j.error || res.status}`;
      matched += j.confirmed || 0; suggested += j.suggested || 0;
      if (!j.pending || !j.asked || j.limited) break;
    }
    return matched || suggested ? `; Claude matched ${matched} names, suggested ${suggested}` : '';
  } catch (e) { return '; names: Claude not reachable'; }
}

async function checkGatePhotos(settings, state) {
  try {
    step('Gate checks: Claude is looking at new photos…');
    const res = await fetch((settings.gsUrl || DEFAULTS.gsUrl).replace(/\/$/, '') + '/ai/gate', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + settings.token }, body: '{}',
    });
    let j = {};
    try { j = await res.json(); } catch (e) { /* not JSON */ }
    if (res.ok && j.checked) state.gatePhotos = { last: Date.now(), result: `${j.checked} checks looked at, ${j.flagged} flagged` };
    else if (!res.ok) state.gatePhotos = Object.assign({}, state.gatePhotos, { error: j.error || String(res.status), errorAt: Date.now() });
    // Returned old parts: same idea, same tick.
    const r2 = await fetch((settings.gsUrl || DEFAULTS.gsUrl).replace(/\/$/, '') + '/ai/core', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + settings.token }, body: '{}',
    });
    let j2 = {};
    try { j2 = await r2.json(); } catch (e) { /* not JSON */ }
    if (r2.ok && j2.checked) state.coreParts = { last: Date.now(), result: `${j2.checked} old parts looked at, ${j2.flagged} flagged` };
    // Driver reports: Claude drafts the job card (and alerts on an unsafe bus) within ten minutes.
    const r3 = await fetch((settings.gsUrl || DEFAULTS.gsUrl).replace(/\/$/, '') + '/ai/reports', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + settings.token }, body: '{}',
    });
    let j3 = {};
    try { j3 = await r3.json(); } catch (e) { /* not JSON */ }
    // Weekly coaching notes: a few drafted each tick until everyone with something to say has one.
    const r4 = await fetch((settings.gsUrl || DEFAULTS.gsUrl).replace(/\/$/, '') + '/ai/coaching', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + settings.token }, body: '{}',
    });
    let j4 = {};
    try { j4 = await r4.json(); } catch (e) { /* not JSON */ }
    // The Monday summary: the server writes it once, from Monday 07:00; every other tick is a no-op.
    const r5 = await fetch((settings.gsUrl || DEFAULTS.gsUrl).replace(/\/$/, '') + '/ai/digest', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + settings.token }, body: '{}',
    });
    let j5 = {};
    try { j5 = await r5.json(); } catch (e) { /* not JSON */ }
    if (r5.ok && j5.written) state.digest = { last: Date.now(), result: `Monday summary written: ${j5.headline || ''}`.slice(0, 160) };
    if (r4.ok && j4.drafted) state.coaching = { last: Date.now(), result: `${j4.drafted} coaching notes drafted (week of ${j4.week})` };
    if (r3.ok && j3.drafted) state.reports = { last: Date.now(), result: `${j3.drafted} driver reports drafted${j3.unsafe ? `, ${j3.unsafe} may be unsafe` : ''}` };
  } catch (e) { /* offline: try again next tick */ }
}

async function runJob(job, tabId, settings, state, cap) {
  if (job === 'assignments') {
    const j = await call(tabId, '/win/api/vehicleAssignment/getVehicleAssignmentServiceList');
    const rows = (j.data || []).map(RP.mapAssignment).filter((r) => r.serviceId);
    const n = await post(settings, 'assignments', rows, cap);
    const names = await matchNames(settings);
    return `${rows.length} services, ${rows.filter((r) => r.vehicleNo).length} with a bus, ${n} changes${names}`;
  }
  if (job === 'reviews') {
    const win = RP.reviewWindow(Date.now(), state), body = RP.reviewsBody(win);
    let rows = [], seen = 0, total = null, written = 0;
    for (let page = 0; page < 3000; page++) {
      const j = await call(tabId, `/win/api/ratingsReviews/getRatingAndReviews/${page}`, body);
      if (typeof j.count === 'number') total = j.count;
      const batch = j.report || [];
      rows.push(...batch.map(RP.mapReview));
      seen += batch.length;
      step(`Reviews: page ${page + 1}, ${seen}${total != null ? ' of ' + total : ''} read`);
      if ((page + 1) % REVIEW_FLUSH_PAGES === 0 && rows.length) { written += await post(settings, 'reviews', rows, cap); rows = []; }
      if (!batch.length || (total != null && seen >= total)) break;
    }
    if (rows.length) written += await post(settings, 'reviews', rows, cap);
    const ai = await readFaults(settings);
    return `${seen}/${total == null ? '?' : total} reviews over ${win.days} days, ${written} new or changed${ai}`;
  }
  if (job === 'complaints') {
    const j = await call(tabId, '/win/api/newComplaints/getNewComplaintsData');
    const rows = (j.data || []).map(RP.mapComplaint).filter((r) => r.caseNumber);
    const n = await post(settings, 'complaints', rows, cap);
    return `${rows.length} complaints, ${n} new or changed`;
  }
  if (job === 'services') {
    // Every service, 10 a page, then each one's via-routes: a review carries the passenger's own route.
    const svcs = [];
    let total = null;
    for (let page = 1; page <= 60; page++) {
      const j = await call(tabId, '/win/api/ratingsReviews/getServiceWise', RP.servicePageBody(page));
      if (typeof j.count === 'number') total = j.count;
      const rows = RP.parseServicePage(j);
      svcs.push(...rows);
      step(`Service list: ${svcs.length}${total != null ? ' of ' + total : ''} services`);
      if (rows.length < RP.SERVICE_PAGE_SIZE || (total != null && svcs.length >= total)) break;
    }
    if (!svcs.length) throw new Error('redPro returned no services');
    const out = [];
    let unlisted = 0;
    for (const [i, svc] of svcs.entries()) {
      let via = [];
      if (svc.viaCount > 1) {
        step(`Service list: routes of ${i + 1} of ${svcs.length}`);
        try {
          via = RP.parseViaRoutes(await call(tabId, '/win/api/ratingsReviews/getServiceWiseViaRoute', RP.viaRouteBody(svc.mainRouteId)));
        } catch (e) {
          if (e instanceof SignedOut) throw e;
          via = [];
        }
        // redPro does not list the via-routes of its biggest services (an empty answer); keep the main route.
        if (!via.length) unlisted++;
      }
      out.push(RP.serviceRow(svc, via));
    }
    const n = await post(settings, 'services', out, cap);
    return `${out.length} services, ${out.reduce((a, r) => a + r.routeIds.length, 0)} routes${unlisted ? `, ${unlisted} too big for redPro to list` : ''}, ${n} changes`;
  }
  throw new Error('unknown job ' + job);
}

let running = false;
let progress = '';
const step = (msg) => { progress = msg; };
async function tick(manual) {
  if (running) return { busy: true };
  running = true;
  const { state = {}, settings = {} } = await get(['state', 'settings']);
  const out = {};
  try {
    if (!settings.token) { state.problem = 'Paste the Garage Saathi token in this extension (click its icon)'; return out; }
    // Every tick: ask Garage Saathi to have Claude look at new gate check photos. It needs no
    // redPro tab, costs nothing when there is nothing new, and never stops the redPro jobs.
    await checkGatePhotos(settings, state);
    const now = Date.now();
    const jobs = RP.JOBS.filter((j) => manual || RP.due(j, now, state));
    if (!jobs.length) return out;
    step('Looking for the redPro tab…');
    const tab = await redproTab();
    if (!tab) { state.problem = 'Open redPro in a tab, sign in, and pin the tab'; return out; }
    step('Checking the redPro sign-in…');
    try {
      if (!(await signedIn(tab.id))) throw new SignedOut('this redPro tab is not signed in as Mahalaxmi (5269) — sign in again');
    } catch (e) {
      state.problem = e instanceof SignedOut ? e.message : 'redPro did not answer: ' + String(e.message || e).slice(0, 120);
      return out;
    }
    delete state.problem;
    const cap = Date.now();
    for (const job of jobs) {
      try {
        step(`${({ assignments: 'Bus & driver', reviews: 'Reviews', complaints: 'Complaints', services: 'Service list' })[job]}…`);
        const res = await runJob(job, tab.id, settings, state, cap);
        state[job] = { last: Date.now(), result: res };
        out[job] = res;
      } catch (e) {
        const msg = String(e.message || e).slice(0, 200);
        state[job] = Object.assign({}, state[job], { error: msg, errorAt: Date.now() });
        out[job] = 'FAILED: ' + msg;
        if (e instanceof SignedOut) { state.problem = e.message; break; }
      }
    }
    return out;
  } finally {
    running = false;
    progress = '';
    await set({ state });
    await paint(state);
  }
}

// Paint the badge as soon as the worker wakes, so a fresh browser shows where things stand.
get('state').then(({ state = {} }) => paint(state));

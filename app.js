/* Garage Saathi — app logic (vanilla JS, no build step).
 * Single-screen PWA. State in memory, data in IndexedDB (db.js).
 * Roles: owner / supervisor / store / mechanic — each sees the right things.
 */

/* ----------------------------- i18n (EN/HI) ------------------------------- */
const I18N = {
  en: {
    appName: 'Garage Saathi', home: 'Home', buses: 'Buses', jobs: 'Jobs', store: 'Store', me: 'Me',
    todayJobs: "Today's open jobs", lowStock: 'Low stock parts', docAlerts: 'Document alerts',
    costMonth: 'Repair cost (30 days)', addBus: 'Add Bus', addJob: 'New Job Card', issuePart: 'Issue Part',
    receiveStock: 'Receive Stock', checkin: 'Check In', checkout: 'Check Out', verify: 'Verify',
    markDone: 'Mark Done', beforePhotos: 'Before photos', afterPhotos: 'After photos', partsUsed: 'Parts used',
    save: 'Save', cancel: 'Cancel', open: 'open', logout: 'Logout', lang: 'हिंदी', attendance: 'Attendance',
    purchases: 'Purchases / Bills', serviceHistory: 'Service history', documents: 'Documents',
    addPhotoNote: 'Photo required to close a job', noJobs: 'No jobs yet', expired: 'EXPIRED',
  },
  hi: {
    appName: 'गैराज साथी', home: 'होम', buses: 'बसें', jobs: 'काम', store: 'स्टोर', me: 'मैं',
    todayJobs: 'आज के खुले काम', lowStock: 'कम स्टॉक पुर्जे', docAlerts: 'कागज़ात अलर्ट',
    costMonth: 'मरम्मत खर्च (30 दिन)', addBus: 'बस जोड़ें', addJob: 'नया जॉब कार्ड', issuePart: 'पुर्जा जारी करें',
    receiveStock: 'स्टॉक प्राप्त करें', checkin: 'हाज़िरी लगाएं', checkout: 'छुट्टी', verify: 'जाँचें',
    markDone: 'पूरा करें', beforePhotos: 'पहले की फोटो', afterPhotos: 'बाद की फोटो', partsUsed: 'इस्तेमाल पुर्जे',
    save: 'सेव', cancel: 'रद्द', open: 'खुला', logout: 'लॉगआउट', lang: 'EN', attendance: 'हाज़िरी',
    purchases: 'खरीद / बिल', serviceHistory: 'सेवा इतिहास', documents: 'कागज़ात',
    addPhotoNote: 'काम बंद करने के लिए फोटो ज़रूरी है', noJobs: 'अभी कोई काम नहीं', expired: 'समाप्त',
  },
};
let LANG = localStorage.getItem('lang') || 'en';
const t = (k) => (I18N[LANG] && I18N[LANG][k]) || I18N.en[k] || k;

// The garage business this app runs for.
const BIZ = 'Mahalaxmi Travels';

/* ------------------------------ App state --------------------------------- */
// `stack` is the navigation history. Top-level tabs reset it to one entry;
// drilling into a detail pushes onto it; the back button pops it.
const S = { user: null, route: { name: 'home' }, stack: [{ name: 'home' }], cache: {} };

// Sync status shown in the top bar (updated by the Sync engine).
let SYNC_STATUS = 'init';
function syncChipHtml() {
  const m = { synced: ['ok', '●', 'Synced'], syncing: ['warn', '◐', 'Sync…'],
              offline: ['off', '○', 'Offline'], init: ['off', '○', '…'] };
  const [cls, ic, lbl] = m[SYNC_STATUS] || m.init;
  return `<span class="syncchip ${cls}">${ic} ${lbl}</span>`;
}
function updateSyncChip() { document.querySelectorAll('.syncchip').forEach((e) => { e.outerHTML = syncChipHtml(); }); }

/* ------------------------------ Helpers ----------------------------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const money = (n) => '₹' + (Math.round(n || 0)).toLocaleString('en-IN');
const day = 86400000;
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fmtDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
}
function fmtDateTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function daysLeft(ts) { return Math.round((ts - Date.now()) / day); }

function toast(msg) {
  const old = $('.toast'); if (old) old.remove();
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

function haversineM(a, b, c, d) {
  const R = 6371000, toR = (x) => x * Math.PI / 180;
  const dLat = toR(c - a), dLon = toR(d - b);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a)) * Math.cos(toR(c)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Downscale a captured photo so IndexedDB stays small (~60KB JPEG).
function fileToThumb(file, max = 900) {
  return new Promise((resolve) => {
    const img = new Image();
    const fr = new FileReader();
    fr.onload = () => { img.src = fr.result; };
    img.onload = () => {
      let { width: w, height: h } = img;
      if (w > h && w > max) { h = h * max / w; w = max; }
      else if (h > max) { w = w * max / h; h = max; }
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(cv.toDataURL('image/jpeg', 0.72));
    };
    fr.readAsDataURL(file);
  });
}

// Open device camera and return a downscaled dataURL.
function capturePhoto() {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*'; inp.capture = 'environment';
    inp.style.display = 'none';
    inp.onchange = async () => {
      const f = inp.files && inp.files[0];
      inp.remove();
      if (!f) return resolve(null);
      resolve(await fileToThumb(f));
    };
    document.body.appendChild(inp);
    inp.click();
  });
}

const can = (role, perm) => (PERMS[perm] || []).includes(role);
const PERMS = {
  addBus: ['owner', 'supervisor'],
  addJob: ['owner', 'supervisor'],
  verifyJob: ['owner', 'supervisor'],
  issuePart: ['owner', 'supervisor', 'store'],
  receiveStock: ['owner', 'supervisor', 'store'],
  addPurchase: ['owner', 'supervisor', 'store'],
  dashboard: ['owner', 'supervisor'],
};

/* ------------------------------ Sheets ------------------------------------ */
function openSheet(title, bodyHTML, onMount) {
  closeSheet();
  const wrap = document.createElement('div');
  wrap.className = 'sheetwrap';
  wrap.innerHTML = `<div class="sheet"><div class="sheethead"><h2>${esc(title)}</h2>
    <button class="x" data-act="closeSheet">×</button></div>${bodyHTML}</div>`;
  wrap.addEventListener('click', (e) => { if (e.target === wrap) closeSheet(); });
  document.body.appendChild(wrap);
  if (onMount) onMount(wrap);
}
function closeSheet() { const w = $('.sheetwrap'); if (w) w.remove(); }

/* ------------------------------ Data ops ---------------------------------- */
async function load() {
  const [users, buses, parts, jobs, ledger, att, purchases, garage] = await Promise.all([
    DB.all('users'), DB.all('buses'), DB.all('parts'), DB.all('jobcards'),
    DB.all('ledger'), DB.all('attendance'), DB.all('purchases'), DB.get('meta', 'garage'),
  ]);
  S.cache = { users, buses, parts, jobs, ledger, att, purchases, garage };
}
const byId = (arr, id) => arr.find((x) => x.id === id);
const userName = (id) => (byId(S.cache.users, id) || {}).name || '—';
const busName = (id) => (byId(S.cache.buses, id) || {}).regNo || '—';

// Resolve a product photo for a part from its name (works without a DB migration
// for already-seeded devices). User-added parts with no match fall back to an icon.
const PART_PHOTOS = 'assets/parts/';
function partImg(p) {
  if (p && p.img) return p.img;
  const n = ((p && p.name) || '').toLowerCase();
  if (n.includes('clutch')) return PART_PHOTOS + 'clutch-plate.jpg';
  if (n.includes('brake')) return PART_PHOTOS + 'brake-pad.jpg';
  if (n.includes('air')) return PART_PHOTOS + 'air-filter.jpg';
  if (n.includes('oil') && n.includes('filter')) return PART_PHOTOS + 'oil-filter.jpg';
  if (n.includes('oil') || n.includes('lubric')) return PART_PHOTOS + 'engine-oil.jpg';
  if (n.includes('wiper')) return PART_PHOTOS + 'wiper-blade.jpg';
  if (n.includes('tyre') || n.includes('tire')) return PART_PHOTOS + 'tyre.jpg';
  return null;
}
// All buses share one stock hero photo for now; per-bus photos come with the
// GPS/camera phase. Bus profile can also carry its own `photos[]`.
function busImg(b) { return (b && b.photos && b.photos[0]) || PART_PHOTOS + 'bus.jpg'; }
const avatar = (img, fallbackEmoji) => img
  ? `<img class="ava" src="${img}" alt="">`
  : `<div class="ava">${fallbackEmoji}</div>`;

// Anti-pilferage core: a part can ONLY leave stock against a job card.
async function issuePart({ partId, qty, jobId }) {
  const part = byId(S.cache.parts, partId);
  const job = byId(S.cache.jobs, jobId);
  if (!part || !job) return toast('Pick a part and a job');
  if (job.status === 'verified') return toast('Job already closed');
  if (qty <= 0) return toast('Enter quantity');
  if (qty > part.qty) return toast(`Only ${part.qty} ${part.unit} in stock`);

  part.qty -= qty;
  await DB.put('parts', part);
  await DB.put('ledger', {
    id: uid('l-'), partId, type: 'out', qty, jobId,
    reason: 'Issued to job', by: S.user.id, at: Date.now(),
  });
  const line = (job.partsUsed || []).find((l) => l.partId === partId);
  const cost = qty * part.unitCost;
  if (line) { line.qty += qty; line.cost += cost; }
  else { job.partsUsed = [...(job.partsUsed || []), { partId, qty, cost }]; }
  await DB.put('jobcards', job);
  await load();
  toast(`Issued ${qty} ${part.unit} → ${busName(job.busId)}`);
}

async function receiveStock({ partId, qty }) {
  const part = byId(S.cache.parts, partId);
  if (!part || qty <= 0) return toast('Enter quantity');
  part.qty += qty;
  await DB.put('parts', part);
  await DB.put('ledger', { id: uid('l-'), partId, type: 'in', qty, jobId: null, reason: 'Stock received', by: S.user.id, at: Date.now() });
  await load();
  toast(`Added ${qty} ${part.unit} to ${part.name}`);
}

/* --------------------------- Document helpers ----------------------------- */
function docStatus(expiry) {
  const dl = daysLeft(expiry);
  if (dl < 0) return { cls: 'b-red', txt: t('expired'), dl };
  if (dl <= 15) return { cls: 'b-amber', txt: `${dl}d left`, dl };
  return { cls: 'b-green', txt: `${dl}d`, dl };
}
function allDocAlerts() {
  const out = [];
  for (const b of S.cache.buses) {
    for (const d of b.docs || []) {
      const st = docStatus(d.expiry);
      if (st.dl <= 15) out.push({ bus: b, doc: d, st });
    }
  }
  return out.sort((a, b) => a.st.dl - b.st.dl);
}

/* ----------------------------- Cost analytics ----------------------------- */
function jobCost(job) {
  const parts = (job.partsUsed || []).reduce((s, l) => s + l.cost, 0);
  const labour = (job.labourHours || 0) * 250; // ₹250/hr default labour rate
  const ext = job.externalCost || 0;
  return { parts, labour, ext, total: parts + labour + ext };
}
function costLast30() {
  const since = Date.now() - 30 * day;
  return S.cache.jobs.filter((j) => (j.closedAt || j.createdAt) >= since)
    .reduce((s, j) => s + jobCost(j).total, 0);
}
function costByCompany() {
  const map = {};
  for (const j of S.cache.jobs) {
    const bus = byId(S.cache.buses, j.busId); if (!bus) continue;
    map[bus.company] = (map[bus.company] || 0) + jobCost(j).total;
  }
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}
function busCostPerKm(b) {
  const cost = S.cache.jobs.filter((j) => j.busId === b.id).reduce((s, j) => s + jobCost(j).total, 0);
  const km = Math.max(1, (b.odometer || 0) - ((b.lastServiceOdo || 0) - (b.serviceIntervalKm || 10000)));
  return cost / km; // rough ₹/km over the recent service window
}

/* ----------------------- Phase 3: GPS provider ----------------------------
 * Adapter over the bus tracker. The demo provider is served by sync_server.py.
 * To use YOUR tracker: point baseUrl at the provider, add its auth header, and
 * map the response fields below — nothing else in the app changes.
 */
const GpsProvider = {
  name: 'Simulated (demo)',
  async live(bus) {
    const base = localStorage.getItem('syncUrl') || (location.protocol + '//' + location.hostname + ':8766');
    const res = await fetch(base + '/gps?busId=' + encodeURIComponent(bus.id) +
      '&odo=' + (bus.odometer || 0) + '&reg=' + encodeURIComponent(bus.regNo || ''));
    if (!res.ok) throw new Error('gps ' + res.status);
    const d = await res.json();
    // ── map provider response → app shape (edit this line for a real provider) ──
    return { lat: d.lat, lng: d.lng, speedKph: d.speedKph, ignition: d.ignition, odometer: d.odometer, lastPing: d.lastPing };
  },
};

/* --------------------- Phase 3: preventive maintenance --------------------- */
const SERVICE_INTERVAL_KM = 10000;
function serviceInfo(b) {
  const interval = b.serviceIntervalKm || SERVICE_INTERVAL_KM;
  const last = (b.lastServiceOdo != null) ? b.lastServiceOdo : (b.odometer || 0);
  const nextOdo = last + interval;
  const dueIn = nextOdo - (b.odometer || 0);
  const status = dueIn <= 0 ? 'overdue' : dueIn <= 1200 ? 'soon' : 'ok';
  return { interval, last, nextOdo, dueIn, status };
}
function busesDueService() {
  return S.cache.buses.map((b) => ({ b, sv: serviceInfo(b) }))
    .filter((x) => x.sv.status !== 'ok')
    .sort((a, b) => a.sv.dueIn - b.sv.dueIn);
}

/* ------------------------------- RENDER ----------------------------------- */
const root = () => document.getElementById('app');

function statusBadge(s) {
  const m = { open: ['b-open', 'Open'], 'in-progress': ['b-prog', 'In progress'], done: ['b-done', 'Done'], verified: ['b-verified', 'Verified ✓'] };
  const [cls, txt] = m[s] || ['b-open', s];
  return `<span class="badge ${cls}">${txt}</span>`;
}
function prioBadge(p) { return `<span class="badge b-${p}">${p}</span>`; }

function topbar(title) {
  const canBack = S.stack.length > 1;
  return `<div class="topbar">
    <div class="tb-left">${canBack
      ? `<button class="backbtn" data-act="back" aria-label="Back">‹</button>`
      : `<div class="brandlogo">GS</div>`}</div>
    <h1 class="tb-title">${esc(title)}</h1>
    <div class="tb-right">${syncChipHtml()}<button class="lang" data-act="lang">${t('lang')}</button></div>
  </div>`;
}

// Which bottom tab should light up — sub-screens map back to their parent tab.
const TAB_OF = { home: 'home', buses: 'buses', jobs: 'jobs', store: 'store', me: 'me', purchases: 'me', alerts: 'me', insights: 'home' };
function bottomnav() {
  const active = TAB_OF[S.route.name] || 'home';
  const items = [
    ['home', '🏠', t('home')], ['buses', '🚌', t('buses')], ['jobs', '🛠️', t('jobs')],
    ['store', '📦', t('store')], ['me', '👤', t('me')],
  ];
  return `<div class="bottomnav">${items.map(([n, ic, lbl]) =>
    `<button data-nav="${n}" class="${active === n ? 'active' : ''}"><span class="ic">${ic}</span>${esc(lbl)}</button>`).join('')}</div>`;
}

function shell(title, body, fab) {
  root().innerHTML = topbar(title) + `<div class="content">${body}</div>` +
    (fab ? `<button class="fab" data-act="${fab.act}">${fab.icon}</button>` : '') + bottomnav();
  bind();
}

/* ----- Home / dashboard ----- */
function fmtToday() { return new Date().toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' }); }
// Daily repair-cost buckets for the last n days (for the dashboard bar chart).
function costSeries(n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
    const start = d.getTime(), end = start + 86400000;
    const value = S.cache.jobs
      .filter((j) => { const ts = j.closedAt || j.createdAt; return ts >= start && ts < end; })
      .reduce((s, j) => s + jobCost(j).total, 0);
    out.push({ label: d.toLocaleDateString('en-IN', { weekday: 'narrow' }), value });
  }
  return out;
}
function qtile(icon, value, label, nav) {
  return `<div class="card tile qstat"${nav ? ` data-nav="${nav}"` : ''}>
    <div class="qicon">${icon}</div><div class="stat">${value}</div>
    <div class="muted small">${esc(label)}</div></div>`;
}
function viewHome() {
  const openJobs = S.cache.jobs.filter((j) => j.status === 'open' || j.status === 'in-progress');
  const low = S.cache.parts.filter((p) => p.qty <= p.reorderLevel);
  const alerts = allDocAlerts();
  const cost = costLast30();
  const myAtt = S.cache.att.filter((a) => a.userId === S.user.id);
  const checkedIn = myAtt.length && myAtt[myAtt.length - 1].type === 'in';

  let body = '';
  const role = S.user.role, isBoss = can(role, 'dashboard');
  const first = S.user.name.split(' ')[0];
  const pending = S.cache.purchases.filter((p) => p.paymentStatus === 'pending').reduce((s, p) => s + p.amount, 0);
  const roleEmoji = role === 'owner' ? '👑' : role === 'supervisor' ? '🧑‍🔧' : role === 'store' ? '📦' : '🔧';

  // Greeting header
  body += `<div class="greet">
    <div class="greet-av">${roleEmoji}</div>
    <div><div class="greet-hi">Namaste, ${esc(first)} 👋</div>
      <div class="muted small">${esc(BIZ)} · ${fmtToday()}</div></div>
  </div>`;

  if (!checkedIn && role === 'mechanic') {
    body += `<div class="banner warn">⏰ You are not checked in today.<button class="btn sm" data-nav="me" style="margin-left:auto">${t('checkin')}</button></div>`;
  }

  if (isBoss) {
    // 7-day repair-cost bar chart with a dark summary pill
    const series = costSeries(7);
    const max = Math.max(1, ...series.map((d) => d.value));
    const total7 = series.reduce((s, d) => s + d.value, 0);
    let peak = 0; series.forEach((d, i) => { if (d.value > series[peak].value) peak = i; });
    body += `<div class="card">
      <div class="row between"><h3>Repair cost</h3><span class="badge b-low">last 7 days</span></div>
      <div class="chart">${series.map((d, i) => `<div class="bar ${i === peak && d.value > 0 ? 'peak' : ''}">
        <i style="height:${Math.round(d.value / max * 100)}%"></i><span>${d.label}</span></div>`).join('')}</div>
      <div class="feature-pill"><div class="fp-dot">₹</div>
        <div><div class="fp-big">${money(total7)}</div>
        <div class="fp-sub">last 7 days · ${money(cost)} this month</div></div></div>
    </div>`;

    // Quick-stat tiles (tappable → their tabs)
    body += `<div class="grid2">
      ${qtile('🛠️', openJobs.length, t('open') + ' jobs', 'jobs')}
      ${qtile('🚌', S.cache.buses.length, 'Buses', 'buses')}
      ${qtile('🔩', low.length, 'Low stock', 'store')}
      ${qtile('🧾', money(pending), 'Pending bills', 'me')}
    </div>`;

    // AI Insights entry — pilferage radar + cost + predictive
    const insightCount = computeInsights().length;
    body += `<div class="card aibanner" data-act="openInsights">
      <div class="ai-ic">✨</div>
      <div style="flex:1"><div class="t" style="font-weight:800">AI Insights</div>
        <div class="tiny" style="opacity:.85">Pilferage radar, cost savings & predictions</div></div>
      <span class="badge ${insightCount ? 'b-red' : 'b-green'}">${insightCount}</span>
    </div>`;

    // Service due (preventive maintenance) — from live GPS odometer
    const due = busesDueService();
    if (due.length) {
      body += `<div class="card"><div class="row between"><h3>Service due</h3><span class="badge b-amber">${due.length}</span></div>`;
      body += due.map(({ b, sv }) => `<div class="li" data-bus="${b.id}"><div class="ava">🛢️</div>
        <div class="main"><div class="t">${esc(b.regNo)}</div><div class="s">${esc(b.company)}</div></div>
        <span class="badge ${sv.status === 'overdue' ? 'b-red' : 'b-amber'}">${sv.status === 'overdue' ? 'OVERDUE ' + Math.abs(sv.dueIn).toLocaleString('en-IN') + 'km' : sv.dueIn.toLocaleString('en-IN') + 'km'}</span></div>`).join('');
      body += `<div class="tiny muted" style="margin-top:8px">Service on time → fewer breakdowns → lower cost.</div></div>`;
    }

    // Cost by company — horizontal bars
    const cc = costByCompany();
    if (cc.length) {
      const cmax = Math.max(1, ...cc.map((x) => x[1]));
      body += `<div class="card"><h3>Cost by company</h3>
        ${cc.map(([c, v]) => `<div class="hbar"><div class="hbar-top"><span>${esc(c)}</span><b>${money(v)}</b></div>
          <div class="hbar-track"><i style="width:${Math.round(v / cmax * 100)}%"></i></div></div>`).join('')}
        <div class="tiny muted" style="margin-top:8px">Bill each owner accurately from this.</div></div>`;
    }
  }

  // Document alerts — critical in India (fitness/PUC/insurance)
  body += `<div class="card"><div class="row between"><h3>${t('docAlerts')}</h3><span class="badge ${alerts.length ? 'b-red' : 'b-green'}">${alerts.length}</span></div>`;
  if (!alerts.length) body += `<div class="muted small">All documents valid 👍</div>`;
  else body += alerts.slice(0, 5).map((a) =>
    `<div class="li" data-bus="${a.bus.id}"><div class="ava">📄</div><div class="main"><div class="t">${esc(a.bus.regNo)} · ${esc(a.doc.type)}</div><div class="s">Expires ${fmtDate(a.doc.expiry)}</div></div><span class="badge ${a.st.cls}">${a.st.txt}</span></div>`).join('');
  body += `</div>`;

  // Open jobs
  body += `<div class="card"><h3>${t('todayJobs')}</h3>`;
  if (!openJobs.length) body += `<div class="muted small">${t('noJobs')}</div>`;
  else body += openJobs.slice(0, 6).map(jobLi).join('');
  body += `</div>`;

  // Low stock
  body += `<div class="card"><div class="row between"><h3>${t('lowStock')}</h3><span class="badge ${low.length ? 'b-amber' : 'b-green'}">${low.length}</span></div>`;
  if (!low.length) body += `<div class="muted small">Stock healthy 👍</div>`;
  else body += low.map((p) =>
    `<div class="li" data-part="${p.id}">${avatar(partImg(p), '🔩')}<div class="main"><div class="t">${esc(p.name)}</div><div class="s">${p.qty} ${p.unit} left · reorder at ${p.reorderLevel}</div></div><span class="badge b-amber">LOW</span></div>`).join('');
  body += `</div>`;

  shell(t('appName'), body);
}

/* ----- Buses ----- */
function busLi(b) {
  const alerts = (b.docs || []).filter((d) => daysLeft(d.expiry) <= 15).length;
  return `<div class="li" data-bus="${b.id}">
    ${avatar(busImg(b), '🚌')}
    <div class="main"><div class="t">${esc(b.regNo)}</div>
      <div class="s">${esc(b.company)} · ${esc(b.model)} · ${(b.odometer||0).toLocaleString('en-IN')} km</div></div>
    ${alerts ? `<span class="badge b-red">${alerts}!</span>` : ''}
  </div>`;
}
function viewBuses() {
  const list = [...S.cache.buses].sort((a, b) => a.regNo.localeCompare(b.regNo));
  let body = `<div class="card">${list.length ? list.map(busLi).join('') : `<div class="empty">No buses yet</div>`}</div>`;
  shell(t('buses'), body, can(S.user.role, 'addBus') ? { act: 'addBus', icon: '+' } : null);
}

function viewBusDetail(id) {
  const b = byId(S.cache.buses, id);
  if (!b) return viewBuses();
  const jobs = S.cache.jobs.filter((j) => j.busId === id).sort((a, b2) => (b2.createdAt) - (a.createdAt));
  const totalCost = jobs.reduce((s, j) => s + jobCost(j).total, 0);

  let body = `<div class="hero cover"><img src="${busImg(b)}" alt="">
    <div class="hero-cap"><div class="hero-t">${esc(b.regNo)}</div><div class="hero-s">${esc(b.company)} · ${esc(b.model)}</div></div></div>`;
  body += `<div class="card">
    <div class="row between"><h3>${esc(b.regNo)}</h3>${prioBadge('low')}</div>
    <div class="small muted">${esc(b.company)} · ${esc(b.model)}</div>
    <div class="grid2" style="margin-top:10px">
      <div><div class="tiny muted">Odometer</div><b>${(b.odometer||0).toLocaleString('en-IN')} km</b></div>
      <div><div class="tiny muted">Lifetime repair cost</div><b>${money(totalCost)}</b></div>
      <div><div class="tiny muted">Chassis</div><b>${esc(b.chassis||'—')}</b></div>
      <div><div class="tiny muted">Engine</div><b>${esc(b.engine||'—')}</b></div>
    </div>
    <div class="hr"></div>
    ${(() => { const sv = serviceInfo(b); const c = sv.status === 'overdue' ? 'b-red' : sv.status === 'soon' ? 'b-amber' : 'b-green';
      return `<div class="row between small" style="margin-bottom:10px"><span class="muted">Next service</span>
        <span class="badge ${c}">${sv.status === 'overdue' ? 'OVERDUE ' + Math.abs(sv.dueIn).toLocaleString('en-IN') + ' km' : 'in ' + sv.dueIn.toLocaleString('en-IN') + ' km'}</span></div>`; })()}
    <button class="btn sm" data-act="gps" data-bus="${b.id}">📍 Live GPS &amp; service</button>
  </div>`;

  // Documents
  body += `<div class="card"><h3>${t('documents')}</h3>`;
  body += (b.docs || []).map((d) => {
    const st = docStatus(d.expiry);
    return `<div class="row between small" style="padding:7px 0;border-bottom:1px solid var(--line)">
      <div><b>${esc(d.type)}</b><div class="tiny muted">${esc(d.number||'')} · ${fmtDate(d.expiry)}</div></div>
      <span class="badge ${st.cls}">${st.txt}</span></div>`;
  }).join('') || `<div class="muted small">No documents</div>`;
  body += `</div>`;

  // Service history
  body += `<div class="card"><h3>${t('serviceHistory')}</h3>`;
  body += jobs.length ? jobs.map(jobLi).join('') : `<div class="muted small">No jobs</div>`;
  body += `</div>`;

  shell(esc(b.regNo), body);
}

/* ----- Jobs ----- */
function jobLi(j) {
  const c = jobCost(j).total;
  const bus = byId(S.cache.buses, j.busId);
  return `<div class="li" data-job="${j.id}">
    ${avatar(busImg(bus), '🛠️')}
    <div class="main">
      <div class="t">${esc(busName(j.busId))} — ${esc(j.problem)}</div>
      <div class="s">${esc(userName(j.assignedTo))} · ${fmtDate(j.createdAt)} · ${money(c)}</div>
    </div>
    <div style="text-align:right">${statusBadge(j.status)} ${j.externalVendor ? '<div class="tiny muted">outside</div>' : ''}</div>
  </div>`;
}
function viewJobs() {
  let jobs = [...S.cache.jobs];
  if (S.user.role === 'mechanic') jobs = jobs.filter((j) => j.assignedTo === S.user.id);
  jobs.sort((a, b) => {
    const order = { open: 0, 'in-progress': 1, done: 2, verified: 3 };
    return (order[a.status] - order[b.status]) || (b.createdAt - a.createdAt);
  });
  let body = `<div class="card">${jobs.length ? jobs.map(jobLi).join('') : `<div class="empty">${t('noJobs')}</div>`}</div>`;
  shell(t('jobs'), body, can(S.user.role, 'addJob') ? { act: 'addJob', icon: '+' } : null);
}

function photoStrip(job, field, editable) {
  const arr = job[field] || [];
  let h = `<div class="lbl">${field === 'beforePhotos' ? t('beforePhotos') : t('afterPhotos')}</div><div class="thumbs">`;
  h += arr.map((src, i) => `<img class="thumb" src="${src}" data-act="viewPhoto" data-src="${src}">`).join('');
  if (editable) h += `<div class="photoadd" data-act="addPhoto" data-job="${job.id}" data-field="${field}">＋</div>`;
  h += `</div>`;
  return h;
}

function viewJobDetail(id) {
  const j = byId(S.cache.jobs, id);
  if (!j) return viewJobs();
  const cost = jobCost(j);
  const mine = j.assignedTo === S.user.id;
  const canEdit = mine || ['owner', 'supervisor'].includes(S.user.role);
  const editable = canEdit && j.status !== 'verified';
  const bus = byId(S.cache.buses, j.busId);

  let body = `<div class="hero cover"><img src="${busImg(bus)}" alt="">
    <div class="hero-badge">${statusBadge(j.status)}</div>
    <div class="hero-cap"><div class="hero-t">${esc(busName(j.busId))}</div>
      <div class="hero-s">${esc(j.problem)}</div></div></div>`;
  body += `<div class="card">
    <div class="row between"><h3>${esc(busName(j.busId))}</h3>${statusBadge(j.status)}</div>
    <div class="small">${esc(j.problem)}</div>
    <div class="row" style="gap:8px;margin-top:8px">${prioBadge(j.priority)}
      <span class="small muted">${esc(userName(j.assignedTo))}</span>
      <span class="small muted">· ${fmtDate(j.createdAt)}</span></div>
    ${j.notes ? `<div class="small muted" style="margin-top:8px">📝 ${esc(j.notes)}</div>` : ''}
  </div>`;

  // Photos — the proof-of-work fix
  body += `<div class="card">${photoStrip(j, 'beforePhotos', editable)}<div class="spacer"></div>${photoStrip(j, 'afterPhotos', editable)}
    <div class="tiny muted" style="margin-top:8px">⚠️ ${t('addPhotoNote')}</div></div>`;

  // Parts used
  body += `<div class="card"><div class="row between"><h3>${t('partsUsed')}</h3>${can(S.user.role,'issuePart') && j.status!=='verified' ? `<button class="btn sm" data-act="issueTo" data-job="${j.id}">+ ${t('issuePart')}</button>`:''}</div>`;
  body += (j.partsUsed || []).length ? (j.partsUsed.map((l) => {
    const p = byId(S.cache.parts, l.partId);
    return `<div class="row between small" style="padding:5px 0"><span>${esc(p ? p.name : l.partId)} × ${l.qty}</span><b>${money(l.cost)}</b></div>`;
  }).join('')) : `<div class="muted small">No parts issued</div>`;
  body += `</div>`;

  // Outside repair
  if (j.externalVendor) {
    body += `<div class="card"><h3>Outside repair</h3>
      <div class="row between small"><span>${esc(j.externalVendor)}</span><b>${money(j.externalCost)}</b></div></div>`;
  }

  // Cost summary
  body += `<div class="card"><h3>Cost</h3>
    <div class="row between small"><span>Parts</span><b>${money(cost.parts)}</b></div>
    <div class="row between small"><span>Labour (${j.labourHours||0} hr)</span><b>${money(cost.labour)}</b></div>
    ${cost.ext?`<div class="row between small"><span>Outside</span><b>${money(cost.ext)}</b></div>`:''}
    <div class="hr"></div>
    <div class="row between"><b>Total</b><b style="color:var(--brand2)">${money(cost.total)}</b></div></div>`;

  // Actions
  let actions = '';
  if (editable && (j.status === 'open' || j.status === 'in-progress')) {
    actions += `<button class="btn primary" data-act="markDone" data-job="${j.id}">✅ ${t('markDone')}</button>`;
  }
  if (j.status === 'done' && can(S.user.role, 'verifyJob')) {
    actions += `<button class="btn primary" data-act="verifyJob" data-job="${j.id}">☑️ ${t('verify')}</button>`;
  }
  if (j.status === 'verified') {
    actions += `<div class="banner" style="background:#123a2c;color:var(--green)">✓ Verified by ${esc(userName(j.verifiedBy))} on ${fmtDate(j.verifiedAt)}</div>`;
  }
  if (actions) body += `<div class="card">${actions}</div>`;

  shell('Job Card', body);
}

/* ----- Store / inventory ----- */
function viewStore() {
  const parts = [...S.cache.parts].sort((a, b) => (a.qty <= a.reorderLevel ? -1 : 1) - (b.qty <= b.reorderLevel ? -1 : 1));
  const stockValue = parts.reduce((s, p) => s + p.qty * p.unitCost, 0);

  let body = `<div class="grid2">
    <div class="card tile"><div class="muted small">Stock value</div><div class="stat">${money(stockValue)}</div></div>
    <div class="card tile"><div class="muted small">Part types</div><div class="stat">${parts.length}</div></div>
  </div>`;

  if (can(S.user.role, 'issuePart')) {
    body += `<div class="btnrow" style="margin-bottom:12px">
      <button class="btn" data-act="issueTo">📤 ${t('issuePart')}</button>
      <button class="btn" data-act="receive">📥 ${t('receiveStock')}</button></div>`;
  }

  body += `<div class="card"><h3>Parts</h3>`;
  body += parts.map((p) => {
    const lowf = p.qty <= p.reorderLevel;
    return `<div class="li" data-part="${p.id}">${avatar(partImg(p), '🔩')}
      <div class="main"><div class="t">${esc(p.name)}</div><div class="s">${esc(p.partNo)} · ${esc(p.category)} · ${money(p.unitCost)}/${p.unit}</div></div>
      <div style="text-align:right"><b>${p.qty}</b> <span class="tiny muted">${p.unit}</span>${lowf?'<div class="badge b-amber tiny">LOW</div>':''}</div></div>`;
  }).join('');
  body += `</div>`;

  shell(t('store'), body, can(S.user.role,'addPurchase') ? { act: 'addPurchase', icon: '📄' } : null);
}

function viewPartDetail(id) {
  const p = byId(S.cache.parts, id);
  if (!p) return viewStore();
  const moves = S.cache.ledger.filter((l) => l.partId === id).sort((a, b) => b.at - a.at);
  const img = partImg(p);
  let body = img ? `<div class="hero contain"><img src="${img}" alt="">
    <div class="hero-tag">${esc(p.category)}</div></div>` : '';
  body += `<div class="card"><h3>${esc(p.name)}</h3>
    <div class="small muted">${esc(p.partNo)} · ${esc(p.category)}</div>
    <div class="grid2" style="margin-top:10px">
      <div><div class="tiny muted">In stock</div><b>${p.qty} ${p.unit}</b></div>
      <div><div class="tiny muted">Unit cost</div><b>${money(p.unitCost)}</b></div>
      <div><div class="tiny muted">Reorder at</div><b>${p.reorderLevel}</b></div>
      <div><div class="tiny muted">Stock value</div><b>${money(p.qty*p.unitCost)}</b></div>
    </div></div>`;

  body += `<div class="card"><h3>Stock ledger</h3><div class="tiny muted" style="margin-bottom:6px">Every movement is logged — this is your pilferage trail.</div>`;
  body += moves.length ? moves.map((m) => {
    const job = m.jobId ? byId(S.cache.jobs, m.jobId) : null;
    return `<div class="row between small" style="padding:7px 0;border-bottom:1px solid var(--line)">
      <div><b style="color:${m.type==='out'?'var(--red)':'var(--green)'}">${m.type==='out'?'−':'+'}${m.qty} ${p.unit}</b>
      <div class="tiny muted">${esc(m.reason)}${job?` · ${esc(busName(job.busId))}`:''} · ${esc(userName(m.by))}</div></div>
      <span class="tiny muted">${fmtDateTime(m.at)}</span></div>`;
  }).join('') : `<div class="muted small">No movement</div>`;
  body += `</div>`;
  shell(esc(p.name), body);
}

/* ----- Me / attendance / menu ----- */
function viewMe() {
  const myAtt = S.cache.att.filter((a) => a.userId === S.user.id).sort((a, b) => b.at - a.at);
  const last = myAtt[0];
  const checkedIn = last && last.type === 'in';

  let body = `<div class="card">
    <div class="row"><div class="ava" style="width:48px;height:48px;font-size:24px">👤</div>
    <div><div style="font-weight:700">${esc(S.user.name)}</div><div class="small muted">${esc(S.user.role)}</div></div></div>
    <div class="hr"></div>
    <button class="btn primary" data-act="${checkedIn ? 'checkout' : 'checkin'}">${checkedIn ? '🔴 '+t('checkout') : '🟢 '+t('checkin')}</button>
    <div class="tiny muted" style="margin-top:8px;text-align:center">Selfie + GPS confirms you are at the garage.</div>
  </div>`;

  // Attendance log (owner/supervisor see everyone; mechanic sees self)
  const showAll = ['owner', 'supervisor'].includes(S.user.role);
  const att = (showAll ? S.cache.att : myAtt).sort((a, b) => b.at - a.at).slice(0, 20);
  body += `<div class="card"><h3>${t('attendance')}</h3>`;
  body += att.length ? att.map((a) => `<div class="li">
    <div class="ava">${a.type==='in'?'🟢':'🔴'}</div>
    <div class="main"><div class="t">${esc(userName(a.userId))} — ${a.type==='in'?'In':'Out'}</div>
      <div class="s">${fmtDateTime(a.at)} ${a.dist!=null?`· ${Math.round(a.dist)}m from garage`:''}</div></div>
    ${a.late?'<span class="badge b-amber">LATE</span>':''}
    ${a.selfie?`<img class="thumb" style="width:42px;height:42px" src="${a.selfie}" data-act="viewPhoto" data-src="${a.selfie}">`:''}
  </div>`).join('') : `<div class="muted small">No records</div>`;
  body += `</div>`;

  // Menu
  const si = Sync.info();
  body += `<div class="card"><h3>More</h3>
    <div class="li" data-act="openPurchases"><div class="ava">🧾</div><div class="main"><div class="t">${t('purchases')}</div><div class="s">Supplier bills & payments</div></div></div>
    <div class="li" data-act="openAlerts"><div class="ava">📄</div><div class="main"><div class="t">${t('docAlerts')}</div><div class="s">${allDocAlerts().length} need attention</div></div></div>
    ${['owner', 'supervisor'].includes(S.user.role)
      ? `<div class="li" data-act="openStaff"><div class="ava">👥</div><div class="main"><div class="t">Staff</div><div class="s">${S.cache.users.length} accounts · add new</div></div></div>` : ''}
    <div class="li" data-act="openSync"><div class="ava">🔄</div><div class="main"><div class="t">Sync</div><div class="s">${SYNC_STATUS === 'synced' ? 'All devices up to date' : SYNC_STATUS === 'offline' ? 'Offline — will sync when connected' : 'Syncing…'}${si.pending ? ` · ${si.pending} pending` : ''}</div></div></div>
    <div class="li" data-act="logout"><div class="ava">🚪</div><div class="main"><div class="t">${t('logout')}</div></div></div>
  </div>`;

  shell(t('me'), body);
}

/* ----------------------------- Attendance flow ---------------------------- */
async function doAttendance(type) {
  toast('Getting location…');
  const selfie = await capturePhoto();
  let lat = null, lng = null, dist = null;
  try {
    const pos = await new Promise((res, rej) =>
      navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 8000 }));
    lat = pos.coords.latitude; lng = pos.coords.longitude;
    const g = S.cache.garage;
    if (g) dist = haversineM(g.lat, g.lng, lat, lng);
  } catch (e) { /* no GPS — still record, flagged */ }

  // Late if checking in after 09:30 local
  const d = new Date();
  const late = type === 'in' && (d.getHours() > 9 || (d.getHours() === 9 && d.getMinutes() > 30));

  const g = S.cache.garage;
  const tooFar = g && dist != null && dist > g.radiusM;
  if (tooFar) {
    if (!confirm(`You are ${Math.round(dist)}m from the garage (limit ${g.radiusM}m). Record anyway?`)) return;
  }

  const selfieRef = selfie ? (await Sync.uploadPhoto(selfie) || selfie) : '';
  await DB.put('attendance', { id: uid('a-'), userId: S.user.id, type, at: Date.now(), lat, lng, dist, selfie: selfieRef, late, flagged: !!tooFar });
  await load();
  toast(type === 'in' ? (late ? 'Checked in (late)' : 'Checked in ✓') : 'Checked out ✓');
  viewMe();
}

/* ------------------------------- Sheets: forms ---------------------------- */
function sheetAddBus() {
  openSheet(t('addBus'), `
    <label class="field"><span class="lbl">Registration No.</span><input id="f-reg" placeholder="RJ14 PA 1234"></label>
    <label class="field"><span class="lbl">Owning company</span><input id="f-co" placeholder="Pink City Travels"></label>
    <label class="field"><span class="lbl">Model</span><input id="f-model" placeholder="Tata Starbus"></label>
    <div class="grid2">
      <label class="field"><span class="lbl">Odometer (km)</span><input id="f-odo" type="number" inputmode="numeric"></label>
      <label class="field"><span class="lbl">Chassis No.</span><input id="f-chassis"></label>
    </div>
    <div class="tiny muted" style="margin-bottom:10px">Add insurance / fitness / PUC expiry dates after saving, from the bus page.</div>
    <button class="btn primary" data-act="saveBus">${t('save')}</button>`);
}
async function saveBus() {
  const reg = $('#f-reg').value.trim();
  if (!reg) return toast('Enter registration no.');
  await DB.put('buses', {
    id: uid('b-'), regNo: reg, company: $('#f-co').value.trim(), model: $('#f-model').value.trim(),
    chassis: $('#f-chassis').value.trim(), engine: '', odometer: Number($('#f-odo').value) || 0,
    docs: [], photos: [],
  });
  await load(); closeSheet(); toast('Bus added'); viewBuses();
}

function sheetAddJob() {
  const buses = S.cache.buses, mechs = S.cache.users.filter((u) => u.role === 'mechanic');
  openSheet(t('addJob'), `
    <label class="field"><span class="lbl">Bus</span><select id="f-bus">${buses.map((b) => `<option value="${b.id}">${esc(b.regNo)} — ${esc(b.company)}</option>`).join('')}</select></label>
    <label class="field"><span class="lbl">Problem reported</span><textarea id="f-prob" placeholder="e.g. Front brakes weak"></textarea></label>
    <div class="grid2">
      <label class="field"><span class="lbl">Assign to</span><select id="f-mech">${mechs.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select></label>
      <label class="field"><span class="lbl">Priority</span><select id="f-prio"><option value="high">High</option><option value="medium" selected>Medium</option><option value="low">Low</option></select></label>
    </div>
    <label class="field"><span class="lbl">Outside vendor (optional)</span><input id="f-vendor" placeholder="Leave blank if in-house"></label>
    <div class="grid2">
      <label class="field"><span class="lbl">Outside cost (₹)</span><input id="f-extcost" type="number" inputmode="numeric"></label>
      <label class="field"><span class="lbl">Labour hours</span><input id="f-hrs" type="number" inputmode="decimal"></label>
    </div>
    <button class="btn primary" data-act="saveJob">${t('save')}</button>`);
}
async function saveJob() {
  const busId = $('#f-bus').value, prob = $('#f-prob').value.trim();
  if (!prob) return toast('Describe the problem');
  await DB.put('jobcards', {
    id: uid('j-'), busId, problem: prob, priority: $('#f-prio').value,
    status: 'open', reportedBy: S.user.id, assignedTo: $('#f-mech').value,
    beforePhotos: [], afterPhotos: [], partsUsed: [],
    labourHours: Number($('#f-hrs').value) || 0,
    externalVendor: $('#f-vendor').value.trim(), externalCost: Number($('#f-extcost').value) || 0,
    notes: '', createdAt: Date.now(), closedAt: null, verifiedBy: null,
  });
  await load(); closeSheet(); toast('Job card created'); viewJobs();
}

function sheetIssue(presetJob) {
  const openJobs = S.cache.jobs.filter((j) => j.status !== 'verified');
  const parts = S.cache.parts;
  openSheet(t('issuePart'), `
    <label class="field"><span class="lbl">Part</span><select id="f-part">${parts.map((p) => `<option value="${p.id}">${esc(p.name)} (${p.qty} ${p.unit})</option>`).join('')}</select></label>
    <label class="field"><span class="lbl">Issue to job card</span><select id="f-job">${openJobs.map((j) => `<option value="${j.id}" ${j.id===presetJob?'selected':''}>${esc(busName(j.busId))} — ${esc(j.problem.slice(0,28))}</option>`).join('')}</select></label>
    <label class="field"><span class="lbl">Quantity</span><input id="f-qty" type="number" inputmode="numeric" value="1"></label>
    <div class="banner warn">🔒 Parts can only be issued against a job card. This stops untracked pilferage.</div>
    <button class="btn primary" data-act="confirmIssue">${t('issuePart')}</button>`);
}
async function confirmIssue() {
  await issuePart({ partId: $('#f-part').value, qty: Number($('#f-qty').value) || 0, jobId: $('#f-job').value });
  closeSheet(); rerender();
}

function sheetReceive() {
  const parts = S.cache.parts;
  openSheet(t('receiveStock'), `
    <label class="field"><span class="lbl">Part</span><select id="f-part">${parts.map((p) => `<option value="${p.id}">${esc(p.name)} (${p.qty} ${p.unit})</option>`).join('')}</select></label>
    <label class="field"><span class="lbl">Quantity received</span><input id="f-qty" type="number" inputmode="numeric" value="1"></label>
    <button class="btn primary" data-act="confirmReceive">${t('receiveStock')}</button>`);
}
async function confirmReceive() {
  await receiveStock({ partId: $('#f-part').value, qty: Number($('#f-qty').value) || 0 });
  closeSheet(); rerender();
}

function sheetAddPurchase() {
  openSheet(t('purchases'), `
    <label class="field"><span class="lbl">Supplier</span><input id="f-sup" placeholder="Jaipur Auto Spares"></label>
    <label class="field"><span class="lbl">Amount (₹)</span><input id="f-amt" type="number" inputmode="numeric"></label>
    <label class="field"><span class="lbl">Items</span><textarea id="f-items" placeholder="Brake pads x10, oil filters x6"></textarea></label>
    <label class="field"><span class="lbl">Payment</span><select id="f-pay"><option value="pending">Pending</option><option value="paid">Paid</option></select></label>
    <div id="f-billthumb"></div>
    <button class="btn" data-act="purchasePhoto">📷 Add bill photo</button>
    <div class="spacer"></div>
    <button class="btn primary" data-act="savePurchase">${t('save')}</button>`);
}
let _billPhoto = '';
async function savePurchase() {
  const sup = $('#f-sup').value.trim();
  if (!sup) return toast('Enter supplier');
  await DB.put('purchases', {
    id: uid('pur-'), supplier: sup, amount: Number($('#f-amt').value) || 0,
    items: $('#f-items').value.trim(), paymentStatus: $('#f-pay').value, billPhoto: _billPhoto, at: Date.now(),
  });
  _billPhoto = '';
  await load(); closeSheet(); toast('Bill saved'); rerender();
}
function sheetSync() {
  const i = Sync.info();
  const lbl = { synced: '✅ All devices up to date', syncing: '🔄 Syncing…', offline: '⚠️ Offline — changes are queued', init: '…' }[SYNC_STATUS] || '';
  openSheet('Sync', `
    <div class="card"><div class="row between"><span class="muted small">Status</span><b>${lbl}</b></div>
      <div class="hr"></div>
      <div class="row between small"><span class="muted">This device</span><b>${esc(i.deviceId)}</b></div>
      <div class="row between small"><span class="muted">Pending to send</span><b>${i.pending}</b></div>
      <div class="row between small"><span class="muted">Sync cursor</span><b>rev ${i.lastRev}</b></div>
    </div>
    <label class="field"><span class="lbl">Server URL</span><input id="f-syncurl" value="${esc(i.url)}"></label>
    <div class="tiny muted" style="margin-bottom:10px">On a phone, set this to your computer's address, e.g. http://192.168.29.219:8766</div>
    <label class="field"><span class="lbl">Anthropic API key — for AI Insights (optional)</span><input id="f-aikey" type="password" value="${esc(localStorage.getItem('aiKey') || '')}" placeholder="sk-ant-..."></label>
    <div class="tiny muted" style="margin-bottom:10px">Stored only on this device. Enables the "Ask the advisor" box on AI Insights.</div>
    <button class="btn primary" data-act="saveSyncUrl">Save & sync now</button>
    <div class="spacer"></div>
    <button class="btn" data-act="syncNow">Sync now</button>`);
}

function sheetStaff() {
  const users = [...S.cache.users].sort((a, b) => a.role.localeCompare(b.role));
  openSheet('Staff accounts', `
    <div class="card"><h3>Team (${users.length})</h3>
      ${users.map((u) => `<div class="li"><div class="ava">${u.role === 'owner' ? '👑' : u.role === 'supervisor' ? '🧑‍🔧' : u.role === 'store' ? '📦' : '🔧'}</div>
        <div class="main"><div class="t">${esc(u.name)}</div><div class="s">${esc(u.role)}</div></div></div>`).join('')}
    </div>
    <div class="card"><h3>Add staff</h3>
      <label class="field"><span class="lbl">Name</span><input id="f-sname" placeholder="e.g. Rakesh"></label>
      <div class="grid2">
        <label class="field"><span class="lbl">Role</span><select id="f-srole">
          <option value="mechanic">Mechanic</option><option value="store">Store</option><option value="supervisor">Supervisor</option></select></label>
        <label class="field"><span class="lbl">4-digit PIN</span><input id="f-spin" inputmode="numeric" maxlength="4" placeholder="0000"></label>
      </div>
      <div class="tiny muted" style="margin-bottom:10px">Account is created on the server and appears on every device.</div>
      <button class="btn primary" data-act="saveStaff">Create account</button>
    </div>`);
}
async function saveStaff() {
  const name = $('#f-sname').value.trim();
  const role = $('#f-srole').value;
  const pin = $('#f-spin').value.trim();
  if (!name || !/^\d{4}$/.test(pin)) return toast('Enter a name and 4-digit PIN');
  try {
    const user = await Sync.addStaff({ name, role, pin });
    await DB.put('users', user);               // synced roster carries NO pin
    credSet(user.id, pin);                      // cache on this (the owner's) device only
    await load();
    closeSheet();
    toast(`${name} added`);
    rerender();
  } catch (e) {
    toast(Sync.info().authed ? 'Could not reach server' : 'Sign in online first to add staff');
  }
}

function viewPurchases() {
  const list = [...S.cache.purchases].sort((a, b) => b.at - a.at);
  const pending = list.filter((p) => p.paymentStatus === 'pending').reduce((s, p) => s + p.amount, 0);
  let body = `<div class="card"><div class="muted small">Pending to suppliers</div><div class="stat" style="color:var(--amber)">${money(pending)}</div></div>`;
  body += `<div class="card"><h3>${t('purchases')}</h3>`;
  body += list.length ? list.map((p) => `<div class="li">
    <div class="ava">🧾</div>
    <div class="main"><div class="t">${esc(p.supplier)} — ${money(p.amount)}</div><div class="s">${esc(p.items||'')} · ${fmtDate(p.at)}</div></div>
    <span class="badge ${p.paymentStatus==='paid'?'b-green':'b-amber'}">${p.paymentStatus}</span>
    ${p.billPhoto?`<img class="thumb" style="width:42px;height:42px" src="${p.billPhoto}" data-act="viewPhoto" data-src="${p.billPhoto}">`:''}
  </div>`).join('') : `<div class="muted small">No bills yet</div>`;
  body += `</div>`;
  shell(t('purchases'), body, can(S.user.role,'addPurchase') ? { act: 'addPurchase', icon: '+' } : null);
}

function viewAlerts() {
  const alerts = allDocAlerts();
  let body = `<div class="card"><h3>${t('docAlerts')}</h3>`;
  body += alerts.length ? alerts.map((a) => `<div class="li" data-bus="${a.bus.id}">
    <div class="ava">📄</div>
    <div class="main"><div class="t">${esc(a.bus.regNo)} · ${esc(a.doc.type)}</div><div class="s">${esc(a.bus.company)} · expires ${fmtDate(a.doc.expiry)}</div></div>
    <span class="badge ${a.st.cls}">${a.st.txt}</span></div>`).join('') : `<div class="empty">All documents valid 👍</div>`;
  body += `</div>`;
  shell(t('docAlerts'), body);
}

/* ----------------------------- Job actions -------------------------------- */
async function addJobPhoto(jobId, field) {
  const shot = await capturePhoto();
  if (!shot) return;
  // Upload to object storage; only the URL is stored (and synced). Offline, we
  // keep the inline image so the job can still be completed.
  const src = await Sync.uploadPhoto(shot) || shot;
  const j = byId(S.cache.jobs, jobId);
  j[field] = [...(j[field] || []), src];
  if (j.status === 'open') j.status = 'in-progress';
  await DB.put('jobcards', j);
  await load(); viewJobDetail(jobId);
}
async function markDone(jobId) {
  const j = byId(S.cache.jobs, jobId);
  if (!(j.beforePhotos || []).length || !(j.afterPhotos || []).length) {
    return toast('⚠️ Add before AND after photos first');
  }
  j.status = 'done'; j.closedAt = Date.now();
  await DB.put('jobcards', j);
  await load(); toast('Marked done — waiting for verify'); viewJobDetail(jobId);
}
async function verifyJob(jobId) {
  const j = byId(S.cache.jobs, jobId);
  j.status = 'verified'; j.verifiedBy = S.user.id; j.verifiedAt = Date.now();
  if (!j.closedAt) j.closedAt = Date.now();
  await DB.put('jobcards', j);
  await load(); toast('Verified ✓'); viewJobDetail(jobId);
}

function viewPhoto(src) {
  openSheet('Photo', `<img src="${src}" style="width:100%;border-radius:12px">`);
}
async function showGps(busId) {
  const b = byId(S.cache.buses, busId);
  openSheet('Live GPS — ' + b.regNo, `<div id="gps-body"><div class="empty">📡 Connecting to tracker…</div></div>`);
  let tel = null;
  try { tel = await GpsProvider.live(b); } catch (e) { tel = null; }
  const el = document.getElementById('gps-body');
  if (!el) return;
  if (!tel) {
    el.innerHTML = `<div class="banner bad">⚠️ Tracker unreachable. Start <b>sync_server.py</b> (it hosts the GPS demo), or set your provider URL in Me → Sync.</div>`;
    return;
  }
  // Live odometer feeds preventive maintenance — update the bus record.
  if (tel.odometer && tel.odometer > (b.odometer || 0)) { b.odometer = tel.odometer; await DB.put('buses', b); }
  const sv = serviceInfo(b);
  const svCls = sv.status === 'overdue' ? 'b-red' : sv.status === 'soon' ? 'b-amber' : 'b-green';
  const svTxt = sv.status === 'overdue' ? `Service OVERDUE by ${Math.abs(sv.dueIn).toLocaleString('en-IN')} km`
    : sv.status === 'soon' ? `Service due in ${sv.dueIn.toLocaleString('en-IN')} km`
    : `Service OK · ${sv.dueIn.toLocaleString('en-IN')} km to go`;
  el.innerHTML = `
    <div class="card">
      <div class="row between"><h3>${esc(b.regNo)}</h3>
        <span class="badge ${tel.ignition ? 'b-green' : 'b-low'}">${tel.ignition ? '🟢 Running' : '⚪ Parked'}</span></div>
      <div class="grid3" style="margin-top:8px">
        <div><div class="tiny muted">Speed</div><b>${Math.round(tel.speedKph)} km/h</b></div>
        <div><div class="tiny muted">Odometer</div><b>${tel.odometer.toLocaleString('en-IN')}</b></div>
        <div><div class="tiny muted">Last ping</div><b>${new Date(tel.lastPing).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</b></div>
      </div>
      <div class="hr"></div>
      <a class="btn" href="https://www.google.com/maps?q=${tel.lat},${tel.lng}" target="_blank" rel="noopener">📍 Open location on map</a>
      <div class="tiny muted" style="margin-top:8px">Lat ${tel.lat}, Lng ${tel.lng} · provider: ${esc(GpsProvider.name)}</div>
    </div>
    <div class="card"><div class="row between"><h3>Preventive service</h3><span class="badge ${svCls}">${sv.status.toUpperCase()}</span></div>
      <div class="small">${svTxt}</div>
      <div class="tiny muted" style="margin-top:4px">Auto-tracked from the live odometer (every ${sv.interval.toLocaleString('en-IN')} km).</div>
      <div class="hr"></div>
      <button class="btn primary" data-act="logService" data-bus="${b.id}">✅ Mark service done</button>
    </div>
    <button class="btn ghost" data-act="gps" data-bus="${b.id}">↻ Refresh</button>`;
}
async function logService(busId) {
  const b = byId(S.cache.buses, busId);
  b.lastServiceOdo = b.odometer || 0; b.lastServiceDate = Date.now();
  await DB.put('buses', b);
  // Record it in the bus history so cost & audit trail stay complete.
  await DB.put('jobcards', {
    id: uid('j-'), busId, problem: `Scheduled service (${(b.serviceIntervalKm || SERVICE_INTERVAL_KM).toLocaleString('en-IN')} km)`,
    priority: 'low', status: 'verified', reportedBy: S.user.id, assignedTo: S.user.id,
    beforePhotos: [], afterPhotos: [], partsUsed: [], labourHours: 2, externalVendor: '', externalCost: 0,
    notes: 'Preventive service logged from GPS odometer', createdAt: Date.now(), closedAt: Date.now(),
    verifiedBy: S.user.id, verifiedAt: Date.now(),
  });
  await load(); closeSheet(); toast('Service logged ✓'); rerender();
}

/* -------------------- AI Insights: pilferage + cost + predictive ----------
 * Runs locally on the device — no data leaves the garage. Surfaces the patterns
 * an owner can't eyeball from paper: undocumented work, parts diverted, money-pit
 * buses, services slipping, stock about to run out, expiring papers.
 */
function computeInsights() {
  const out = [];
  const jobs = S.cache.jobs, buses = S.cache.buses, parts = S.cache.parts;

  // Proof-of-work gap — parts billed, no 'after' photo (classic pilferage signal)
  jobs.filter((j) => (j.status === 'verified' || j.status === 'done') && !(j.afterPhotos || []).length && jobCost(j).parts > 0)
    .forEach((j) => out.push({ sev: 'high', icon: '📸', title: `No proof photo — ${busName(j.busId)}`,
      detail: `${money(jobCost(j).parts)} of parts billed with no 'after' photo. Confirm the work was actually done.`,
      nav: { name: 'jobs', id: j.id } }));

  // Parts out on a job that's still open — parts left stores, work not closed
  jobs.filter((j) => j.status === 'open' && (j.partsUsed || []).length)
    .forEach((j) => out.push({ sev: 'med', icon: '📦', title: `Parts out, job still open — ${busName(j.busId)}`,
      detail: `${money(jobCost(j).parts)} issued but job not closed. Chase closure or check parts weren't diverted.`,
      nav: { name: 'jobs', id: j.id } }));

  // Money-pit bus — cost/km well above the fleet norm
  const rated = buses.map((b) => ({ b, r: busCostPerKm(b) })).filter((x) => x.r > 0).sort((a, b) => b.r - a.r);
  if (rated.length >= 2) {
    const med = rated[Math.floor(rated.length / 2)].r, top = rated[0];
    if (top.r > 1.8 * med) out.push({ sev: 'med', icon: '💸', title: `Money-pit: ${top.b.regNo}`,
      detail: `~₹${top.r.toFixed(1)}/km — well above the fleet norm. Inspect for a recurring fault draining cash.`,
      nav: { name: 'buses', id: top.b.id } });
  }

  // Preventive maintenance (predictive, from live odometer)
  busesDueService().forEach(({ b, sv }) => {
    if (sv.status === 'overdue') out.push({ sev: 'high', icon: '🛢️', title: `Service overdue — ${b.regNo}`,
      detail: `${Math.abs(sv.dueIn).toLocaleString('en-IN')} km past due. Skipping service turns into costly breakdowns.`, nav: { name: 'buses', id: b.id } });
    else out.push({ sev: 'low', icon: '🛢️', title: `Service soon — ${b.regNo}`,
      detail: `Due in ${sv.dueIn.toLocaleString('en-IN')} km. Bundle it with the next garage visit.`, nav: { name: 'buses', id: b.id } });
  });

  // Reorder forecast
  const low = parts.filter((p) => p.qty <= p.reorderLevel);
  if (low.length) out.push({ sev: 'med', icon: '🛒', title: `Reorder ${low.length} part${low.length > 1 ? 's' : ''}`,
    detail: `${low.slice(0, 3).map((p) => p.name).join(', ')}${low.length > 3 ? '…' : ''} below reorder level. Buying ahead avoids costly emergency runs.`,
    nav: { name: 'store' } });

  // Document expiry — legal & cost risk
  allDocAlerts().forEach((a) => out.push({ sev: a.st.dl < 0 ? 'high' : 'med', icon: '📄',
    title: `${a.doc.type} ${a.st.dl < 0 ? 'EXPIRED' : 'expiring'} — ${a.bus.regNo}`,
    detail: `${a.st.dl < 0 ? 'Expired' : 'Expires'} ${fmtDate(a.doc.expiry)}. Running on it risks fines & impound.`,
    nav: { name: 'buses', id: a.bus.id } }));

  // Aging open jobs — lost bus revenue
  jobs.filter((j) => j.status === 'open' || j.status === 'in-progress')
    .map((j) => ({ j, age: Math.round((Date.now() - j.createdAt) / 86400000) }))
    .filter((x) => x.age >= 2).sort((a, b) => b.age - a.age).slice(0, 2)
    .forEach(({ j, age }) => out.push({ sev: 'low', icon: '⏳', title: `Job aging ${age}d — ${busName(j.busId)}`,
      detail: `Open ${age} days. Long bay time = lost running days for the bus.`, nav: { name: 'jobs', id: j.id } }));

  const rank = { high: 0, med: 1, low: 2 };
  return out.sort((a, b) => rank[a.sev] - rank[b.sev]);
}

function insightCard(i) {
  const c = i.sev === 'high' ? 'b-red' : i.sev === 'med' ? 'b-amber' : 'b-low';
  const nav = i.nav ? (i.nav.id
    ? `data-${i.nav.name === 'jobs' ? 'job' : i.nav.name === 'buses' ? 'bus' : 'part'}="${i.nav.id}"`
    : `data-nav="${i.nav.name}"`) : '';
  return `<div class="card insight" ${nav}>
    <div class="row" style="gap:11px;align-items:flex-start">
      <div class="ins-ic">${i.icon}</div>
      <div style="flex:1"><div class="row between"><b style="font-size:14px">${esc(i.title)}</b><span class="badge ${c}">${i.sev}</span></div>
        <div class="small muted" style="margin-top:3px">${esc(i.detail)}</div></div></div></div>`;
}

function viewInsights() {
  const items = computeInsights();
  const high = items.filter((i) => i.sev === 'high').length;
  let body = `<div class="card feature-ai"><div class="ai-ic big">✨</div>
    <div><div style="font-weight:800;font-size:17px">AI Insights</div>
      <div class="tiny" style="opacity:.85">${items.length} findings · ${high} need attention</div></div></div>`;

  body += `<div class="card"><h3>Ask the advisor</h3>
    <div class="row" style="gap:8px"><input id="ai-q" placeholder="e.g. How do I cut my brake costs?">
      <button class="btn sm primary" data-act="askAi" style="width:auto">Ask</button></div>
    <div id="ai-ans" class="small" style="margin-top:11px"></div>
    <div class="tiny muted" style="margin-top:6px">Powered by Claude (Haiku). Add your API key in Me → Sync.</div></div>`;

  body += items.length ? items.map(insightCard).join('') : `<div class="empty">✅ No issues found — running clean.</div>`;
  shell('AI Insights', body);
}

// Compact garage snapshot fed to Claude as grounding context.
function aiContext() {
  const due = busesDueService();
  const low = S.cache.parts.filter((p) => p.qty <= p.reorderLevel);
  return [
    `Buses: ${S.cache.buses.length}`,
    `Open jobs: ${S.cache.jobs.filter((j) => j.status === 'open' || j.status === 'in-progress').length}`,
    `Repair cost last 30 days: ${money(costLast30())}`,
    `Cost by company: ${costByCompany().map(([c, v]) => c + ' ' + money(v)).join('; ') || 'n/a'}`,
    `Services due: ${due.map((d) => d.b.regNo + ' (' + d.sv.status + ')').join(', ') || 'none'}`,
    `Low stock: ${low.map((p) => p.name).join(', ') || 'none'}`,
    `Flagged anomalies: ${computeInsights().filter((i) => i.sev !== 'low').length}`,
  ].join('\n');
}

// Real Anthropic API call (browser-direct). Key-gated; nothing is sent without it.
async function callClaude(question) {
  const key = localStorage.getItem('aiKey');
  if (!key) return { error: 'Add your Anthropic API key in Me → Sync to enable AI answers.' };
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json', 'x-api-key': key,
        'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', max_tokens: 500,
        system: `You are the operations advisor for ${BIZ}, a bus maintenance garage in Jaipur, India. Be concise and practical, use rupee (₹) figures, focus on cutting cost and pilferage. Max 6 sentences.`,
        messages: [{ role: 'user', content: `Current garage data:\n${aiContext()}\n\nQuestion: ${question}` }],
      }),
    });
    if (!res.ok) return { error: 'API error ' + res.status + (res.status === 401 ? ' — check your API key' : '') };
    const j = await res.json();
    return { text: (j.content || []).map((c) => c.text || '').join('').trim() };
  } catch (e) {
    return { error: 'Could not reach Claude API (network or CORS).' };
  }
}
async function askAi() {
  const q = ($('#ai-q').value || '').trim();
  if (!q) return;
  const ans = document.getElementById('ai-ans');
  ans.innerHTML = `<span class="muted">Thinking…</span>`;
  const r = await callClaude(q);
  ans.innerHTML = r.error
    ? `<span style="color:#b9740a">${esc(r.error)}</span>`
    : esc(r.text).replace(/\n/g, '<br>');
}

/* ------------------------------- Router -----------------------------------
 * stack-based navigation:
 *  - navTab()  → switch bottom-tab, reset history to that root
 *  - push()    → drill into a detail/sub screen (back button appears)
 *  - back()    → pop one level
 */
const current = () => S.stack[S.stack.length - 1];
function render(r) {
  S.route = r;
  switch (r.name) {
    case 'home': return viewHome();
    case 'buses': return r.id ? viewBusDetail(r.id) : viewBuses();
    case 'jobs': return r.id ? viewJobDetail(r.id) : viewJobs();
    case 'store': return r.id ? viewPartDetail(r.id) : viewStore();
    case 'me': return viewMe();
    case 'purchases': return viewPurchases();
    case 'alerts': return viewAlerts();
    case 'insights': return viewInsights();
    default: return viewHome();
  }
}
function navTab(name) { S.stack = [{ name }]; render(current()); }
function push(r) { S.stack.push(r); render(r); }
function back() { if (S.stack.length > 1) S.stack.pop(); render(current()); }
function rerender() { render(current()); }
// Back-compat shim: existing callers that say route({name,...}) now reset to that
// screen as a fresh root (used by login + a few in-view fallbacks).
function route(r) { S.stack = [r]; render(r); }

/* ----------------------------- Event binding ------------------------------ */
function bind() {
  const r = root();
  r.onclick = async (e) => {
    const el = e.target.closest('[data-act],[data-nav],[data-bus],[data-job],[data-part]');
    if (!el) return;
    const nav = el.getAttribute('data-nav');
    if (nav) return navTab(nav);
    const act = el.getAttribute('data-act');

    // navigation by entity (lists) — drill in, keep history
    if (el.hasAttribute('data-job') && !act) return push({ name: 'jobs', id: el.getAttribute('data-job') });
    if (el.hasAttribute('data-bus') && !act) return push({ name: 'buses', id: el.getAttribute('data-bus') });
    if (el.hasAttribute('data-part') && !act) return push({ name: 'store', id: el.getAttribute('data-part') });

    switch (act) {
      case 'back': return back();
      case 'lang': LANG = LANG === 'en' ? 'hi' : 'en'; localStorage.setItem('lang', LANG); return rerender();
      case 'addBus': return sheetAddBus();
      case 'saveBus': return saveBus();
      case 'addJob': return sheetAddJob();
      case 'saveJob': return saveJob();
      case 'issueTo': return sheetIssue(el.getAttribute('data-job'));
      case 'confirmIssue': return confirmIssue();
      case 'receive': return sheetReceive();
      case 'confirmReceive': return confirmReceive();
      case 'addPurchase': return sheetAddPurchase();
      case 'savePurchase': return savePurchase();
      case 'purchasePhoto': { const d = await capturePhoto(); if (d) { _billPhoto = await Sync.uploadPhoto(d) || d; $('#f-billthumb').innerHTML = `<img class="thumb" src="${_billPhoto}">`; } return; }
      case 'addPhoto': return addJobPhoto(el.getAttribute('data-job'), el.getAttribute('data-field'));
      case 'markDone': return markDone(el.getAttribute('data-job'));
      case 'verifyJob': return verifyJob(el.getAttribute('data-job'));
      case 'checkin': return doAttendance('in');
      case 'checkout': return doAttendance('out');
      case 'viewPhoto': return viewPhoto(el.getAttribute('data-src'));
      case 'gps': return showGps(el.getAttribute('data-bus'));
      case 'logService': return logService(el.getAttribute('data-bus'));
      case 'openInsights': return push({ name: 'insights' });
      case 'askAi': return askAi();
      case 'openPurchases': return push({ name: 'purchases' });
      case 'openAlerts': return push({ name: 'alerts' });
      case 'openStaff': return sheetStaff();
      case 'saveStaff': return saveStaff();
      case 'openSync': return sheetSync();
      case 'saveSyncUrl': { Sync.setUrl($('#f-syncurl').value.trim()); const k = $('#f-aikey'); if (k) localStorage.setItem('aiKey', k.value.trim()); closeSheet(); toast('Saved'); return; }
      case 'syncNow': { Sync.tick(); toast('Syncing…'); return; }
      case 'closeSheet': return closeSheet();
      case 'logout': Sync.logout(); S.user = null; return renderLogin();
    }
  };
}

/* ------------------------------- Login ------------------------------------ */
let _pinUser = null, _pin = '';
function renderLogin() {
  _pinUser = null; _pin = '';
  const users = S.cache.users;
  root().innerHTML = `<div class="login">
    <div class="bigicon">🚌</div>
    <h1 style="margin:0">${esc(BIZ)}</h1>
    <div class="muted small">${t('appName')} · Garage maintenance, Jaipur</div>
    <div class="userpick">${users.map((u) => `<div class="u" data-login="${u.id}">
      <div style="font-size:22px">${u.role==='owner'?'👑':u.role==='supervisor'?'🧑‍🔧':u.role==='store'?'📦':'🔧'}</div>
      <div style="font-weight:700;font-size:14px">${esc(u.name)}</div>
      <div class="tiny muted">${esc(u.role)}</div></div>`).join('')}</div>
    ${/^(localhost|127\.|192\.168\.|10\.|172\.1[6-9]\.|172\.2\d\.|172\.3[01]\.)/.test(location.hostname)
      ? `<div class="tiny muted" style="margin-top:14px">Demo PINs — Owner 1111 · Store 3333 · Mechanic 0001</div>` : ''}
  </div>`;
  root().onclick = (e) => {
    const u = e.target.closest('[data-login]');
    if (u) return renderPin(byId(S.cache.users, u.getAttribute('data-login')));
  };
}
function renderPin(user) {
  _pinUser = user; _pin = '';
  const draw = () => {
    root().innerHTML = `<div class="login">
      <div class="bigicon">🔒</div>
      <div style="font-weight:700">${esc(user.name)}</div>
      <div class="muted small">Enter PIN</div>
      <div class="pindots">${'●'.repeat(_pin.length)}${'○'.repeat(Math.max(0,4-_pin.length))}</div>
      <div class="pinpad">
        ${[1,2,3,4,5,6,7,8,9].map((n) => `<button data-k="${n}">${n}</button>`).join('')}
        <button data-k="back">⌫</button><button data-k="0">0</button><button data-k="ok">✓</button>
      </div>
      <button class="btn ghost sm" data-k="cancel" style="margin-top:14px">${t('cancel')}</button>
    </div>`;
    root().onclick = async (e) => {
      const k = e.target.closest('[data-k]'); if (!k) return;
      const key = k.getAttribute('data-k');
      if (key === 'cancel') return renderLogin();
      if (key === 'back') { _pin = _pin.slice(0, -1); return draw(); }
      if (key >= '0' && key <= '9' && _pin.length < 4) { _pin += key; draw(); }
      if (_pin.length === 4 || key === 'ok') return attemptLogin(user, _pin, draw);
    };
  };
  draw();
}

/* Device-local credential cache. PINs are NEVER synced — the server validates
 * online (with lockout), and we keep only this device's known PINs so staff who
 * have signed in here before can still log in offline. */
function credGet(id) { try { return (JSON.parse(localStorage.getItem('creds') || '{}'))[id]; } catch (e) { return null; } }
function credSet(id, pin) {
  let m = {}; try { m = JSON.parse(localStorage.getItem('creds') || '{}'); } catch (e) { /* ignore */ }
  m[id] = pin; localStorage.setItem('creds', JSON.stringify(m));
}
function seedCreds() {
  // Demo convenience so the app works standalone on first run. In production you
  // would NOT seed these — staff sign in online once and the PIN caches here.
  if (localStorage.getItem('creds')) return;
  localStorage.setItem('creds', JSON.stringify(
    { 'u-owner': '1111', 'u-sup': '2222', 'u-store': '3333', 'u-m1': '0001', 'u-m2': '0002', 'u-m3': '0003' }));
}

// Server-authoritative login: the server verifies the PIN (and enforces lockout).
// Offline, we fall back to this device's cached credential only.
async function attemptLogin(user, pin, redraw) {
  const r = await Sync.login(user.id, pin);
  if (r && r.user) { credSet(user.id, pin); return enterApp(user); }       // verified online
  if (r && r.locked) { toast(`Too many attempts. Wait ${r.retryAfter}s`); _pin = ''; return redraw(); }
  if (r && r.offline) {                                                     // server unreachable
    if (credGet(user.id) === pin) { toast('Offline — signed in'); return enterApp(user); }
    toast('Offline — PIN not recognised on this device'); _pin = ''; return redraw();
  }
  toast('Wrong PIN'); _pin = ''; redraw();                                  // server rejected
}
function enterApp(user) { S.user = user; route({ name: 'home' }); }

/* -------------------------------- Boot ------------------------------------ */
(async function boot() {
  await seedIfEmpty();
  seedCreds();
  await load();
  // Keep the garage record branded to the current business name.
  const g = S.cache.garage;
  if (g && g.name !== `${BIZ} Garage, Jaipur`) { g.name = `${BIZ} Garage, Jaipur`; await DB.put('meta', g); S.cache.garage = g; }

  // Backfill service-plan fields on buses created before Phase 3.
  const SEED_LAST = { b1: 178000, b2: 242000, b3: 88000 };
  for (const b of S.cache.buses) {
    let changed = false;
    if (b.serviceIntervalKm == null) { b.serviceIntervalKm = SERVICE_INTERVAL_KM; changed = true; }
    if (b.lastServiceOdo == null) { b.lastServiceOdo = SEED_LAST[b.id] != null ? SEED_LAST[b.id] : (b.odometer || 0); changed = true; }
    if (changed) await DB.put('buses', b);
  }

  // Start live sync with the shared server. Local-first: the app is fully usable
  // even if the server is unreachable (status shows "Offline", changes queue).
  Sync.start({
    onStatus: (s) => { SYNC_STATUS = s; updateSyncChip(); },
    onApplied: async (n) => {
      // Remote changes arrived — refresh cache and re-render, unless the user is
      // mid-edit in a sheet (don't yank a form out from under them).
      await load();
      if (S.user && !document.querySelector('.sheetwrap')) rerender();
    },
  });

  renderLogin();
})();

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
    addPhotoNote: 'Before AND after photos required to close a job (outside repairs: a bill photo)', noJobs: 'No jobs yet', expired: 'EXPIRED',
    // Login
    tagline: 'Garage maintenance, Jaipur', enterPin: 'Enter PIN', wrongPin: 'Wrong PIN',
    // Menu (More)
    more: 'More', supplierBills: 'Supplier bills & payments', drivers: 'Drivers', staff: 'Staff', sync: 'Sync', changePin: 'Change my PIN',
    // Home / actions
    namaste: 'Namaste', addStock: 'Add stock', myBus: 'My Bus', myTrips: 'My Trips', myReports: 'My reports',
    yourRating: 'Your rating', reportProblem: 'Report a problem on my bus', noBusAssigned: 'No bus assigned yet. Ask your supervisor.',
    reportArea: 'Area', reportWhat: 'What did you notice on the trip?', submit: 'Submit', reportSubmitted: 'Report submitted ✓',
    trips: 'trips', fixed: 'fixed', openStatus: 'open', noReportsYet: 'No reports yet. Tap the button above after a trip.',
    // Jobs filter + edit/reassign + verify
    filterAll: 'All', filterAllMechs: 'All mechanics', statusInProgress: 'In progress', statusVerified: 'Verified',
    toVerify: 'To verify', jobsAwaitingVerify: 'awaiting verify', noJobsMatch: 'No jobs match', editReassign: 'Edit / reassign',
    jobUpdated: 'Job updated', describeProblem: 'Describe the problem', pickAssignee: 'Pick who to assign this to',
    // Close-with-hours + photo gate
    closeJobBtn: 'Close job', closeJobDone: 'Job closed — waiting for verify', closeJobHint: 'Confirm the hours you worked, then close.',
    closeJobHours: 'Labour hours worked', photoGateBefore: 'Add before AND after photos first', photoGateAfter: 'After photo', photoGateBill: 'Bill / receipt photo',
    photoNotCaptured: 'No photo taken', photoSaving: 'Saving photo…', photoSavedOnPhone: 'Saved on phone — will upload when online',
    // Request part
    reqPartBtn: 'Need a part', reqPartWhich: 'Which part?', reqPartQty: 'Quantity', reqPartNote: 'The storekeeper sees this and issues the part against this job.',
    reqPartSent: 'Request sent to store', reqPartPending: 'Pending part requests', reqPartFulfil: 'Fulfil', reqPartNoParts: 'No parts in inventory yet.',
    // Driver reports (voice/photo/cancel) + rating tips
    drvPhotoBtn: 'Photo', drvVoiceBtn: 'Voice', drvAttachHint: 'Add a photo or voice note if typing is hard.',
    drvPhotoFail: 'Could not capture photo', drvVoiceUnsupported: 'Voice typing not supported on this phone',
    drvNoBus: 'No bus assigned', drvNeedDetail: 'Add a note, photo or voice', drvCancelBtn: 'Cancel report',
    drvCancelBlocked: 'Cannot cancel — a job is already linked.', drvCancelConfirm: 'Cancel this report?', drvCancelled: 'Report cancelled',
    drvLast90: 'Last 90 days', drvCleanRecord: 'Clean record in the last 90 days. ',
    drvTipGreat: 'Great driving — keep it up! 👏', drvTipGood: 'Good. Smooth braking and careful parking keep it high.',
    drvTipLow: 'Drive smoothly; avoid scratches, dents and harsh braking to raise your score.',
    driverReportsWaiting: 'driver reports waiting', noDriverReports: 'No open driver reports for this bus.', useThisReport: 'use this',
    // Report categories
    catBrakes: 'Brakes', catEngine: 'Engine', catAC: 'AC', catSuspension: 'Suspension', catElectrical: 'Electrical',
    catTyres: 'Tyres', catGearbox: 'Gearbox', catBody: 'Body', catOther: 'Other',
  },
  hi: {
    appName: 'गैराज साथी', home: 'होम', buses: 'बसें', jobs: 'काम', store: 'स्टोर', me: 'मैं',
    todayJobs: 'आज के खुले काम', lowStock: 'कम स्टॉक पुर्जे', docAlerts: 'कागज़ात अलर्ट',
    costMonth: 'मरम्मत खर्च (30 दिन)', addBus: 'बस जोड़ें', addJob: 'नया जॉब कार्ड', issuePart: 'पुर्जा जारी करें',
    receiveStock: 'स्टॉक प्राप्त करें', checkin: 'हाज़िरी लगाएं', checkout: 'छुट्टी', verify: 'जाँचें',
    markDone: 'पूरा करें', beforePhotos: 'पहले की फोटो', afterPhotos: 'बाद की फोटो', partsUsed: 'इस्तेमाल पुर्जे',
    save: 'सेव', cancel: 'रद्द', open: 'खुला', logout: 'लॉगआउट', lang: 'EN', attendance: 'हाज़िरी',
    purchases: 'खरीद / बिल', serviceHistory: 'सेवा इतिहास', documents: 'कागज़ात',
    addPhotoNote: 'काम बंद करने के लिए पहले और बाद दोनों की फोटो ज़रूरी हैं (बाहर मरम्मत: बिल की फोटो)', noJobs: 'अभी कोई काम नहीं', expired: 'समाप्त',
    // Login
    tagline: 'गैराज मरम्मत, जयपुर', enterPin: 'पिन डालें', wrongPin: 'गलत पिन',
    // Menu (More)
    more: 'और', supplierBills: 'सप्लायर बिल और भुगतान', drivers: 'ड्राइवर', staff: 'स्टाफ', sync: 'सिंक', changePin: 'मेरा पिन बदलें',
    // Home / actions
    namaste: 'नमस्ते', addStock: 'स्टॉक जोड़ें', myBus: 'मेरी बस', myTrips: 'मेरी ट्रिप', myReports: 'मेरी रिपोर्ट',
    yourRating: 'आपकी रेटिंग', reportProblem: 'मेरी बस में समस्या बताएं', noBusAssigned: 'अभी कोई बस नहीं दी गई। अपने सुपरवाइज़र से कहें।',
    reportArea: 'हिस्सा', reportWhat: 'ट्रिप में क्या महसूस हुआ?', submit: 'भेजें', reportSubmitted: 'रिपोर्ट भेज दी ✓',
    trips: 'ट्रिप', fixed: 'ठीक हुआ', openStatus: 'खुला', noReportsYet: 'अभी कोई रिपोर्ट नहीं। ट्रिप के बाद ऊपर बटन दबाएं।',
    // Jobs filter + edit/reassign + verify
    filterAll: 'सभी', filterAllMechs: 'सभी मैकेनिक', statusInProgress: 'चालू', statusVerified: 'जाँचा गया',
    toVerify: 'जाँचना है', jobsAwaitingVerify: 'जाँच बाकी', noJobsMatch: 'कोई काम नहीं मिला', editReassign: 'बदलें / दोबारा सौंपें',
    jobUpdated: 'काम अपडेट हुआ', describeProblem: 'समस्या बताएं', pickAssignee: 'किसे सौंपना है चुनें',
    // Close-with-hours + photo gate
    closeJobBtn: 'काम बंद करें', closeJobDone: 'काम बंद — जाँच बाकी', closeJobHint: 'काम के घंटे पक्के करें, फिर बंद करें।',
    closeJobHours: 'काम के घंटे', photoGateBefore: 'पहले और बाद की फोटो पहले जोड़ें', photoGateAfter: 'बाद की फोटो', photoGateBill: 'बिल / रसीद फोटो',
    photoNotCaptured: 'कोई फोटो नहीं ली', photoSaving: 'फोटो सेव हो रही है…', photoSavedOnPhone: 'फ़ोन में सेव — ऑनलाइन होने पर अपलोड होगा',
    // Request part
    reqPartBtn: 'पुर्जा चाहिए', reqPartWhich: 'कौन सा पुर्जा?', reqPartQty: 'मात्रा', reqPartNote: 'स्टोरकीपर यह देखकर इस काम पर पुर्जा जारी करेगा।',
    reqPartSent: 'माँग स्टोर को भेजी', reqPartPending: 'बाकी पुर्जा माँगें', reqPartFulfil: 'पूरा करें', reqPartNoParts: 'अभी कोई पुर्जा नहीं।',
    // Driver reports (voice/photo/cancel) + rating tips
    drvPhotoBtn: 'फोटो', drvVoiceBtn: 'आवाज़', drvAttachHint: 'टाइप करना मुश्किल हो तो फोटो या आवाज़ जोड़ें।',
    drvPhotoFail: 'फोटो नहीं ली जा सकी', drvVoiceUnsupported: 'इस फ़ोन पर आवाज़ टाइपिंग नहीं है',
    drvNoBus: 'कोई बस नहीं दी गई', drvNeedDetail: 'नोट, फोटो या आवाज़ जोड़ें', drvCancelBtn: 'रिपोर्ट रद्द करें',
    drvCancelBlocked: 'रद्द नहीं — काम जुड़ चुका है।', drvCancelConfirm: 'यह रिपोर्ट रद्द करें?', drvCancelled: 'रिपोर्ट रद्द',
    drvLast90: 'पिछले 90 दिन', drvCleanRecord: 'पिछले 90 दिन साफ़ रिकॉर्ड। ',
    drvTipGreat: 'बढ़िया ड्राइविंग — ऐसे ही चलाएं! 👏', drvTipGood: 'अच्छा। आराम से ब्रेक और सावधानी से पार्किंग रेटिंग ऊँची रखती है।',
    drvTipLow: 'आराम से चलाएं; खरोंच, डेंट और तेज़ ब्रेक से बचें ताकि स्कोर बढ़े।',
    driverReportsWaiting: 'ड्राइवर रिपोर्ट बाकी', noDriverReports: 'इस बस के लिए कोई खुली ड्राइवर रिपोर्ट नहीं।', useThisReport: 'इसे लें',
    // Report categories
    catBrakes: 'ब्रेक', catEngine: 'इंजन', catAC: 'एसी', catSuspension: 'सस्पेंशन', catElectrical: 'बिजली',
    catTyres: 'टायर', catGearbox: 'गियरबॉक्स', catBody: 'बॉडी', catOther: 'अन्य',
  },
};
let LANG = localStorage.getItem('lang') || 'en';
const t = (k) => (I18N[LANG] && I18N[LANG][k]) || I18N.en[k] || k;

// The garage business name shown across the app. NOT hardcoded to one customer:
// each garage sets its own name in Garage setup; this is just the default shown
// until then (and for the demo). load() refreshes BIZ from the saved garage config.
const DEFAULT_BIZ = 'Garage Saathi';
let BIZ = DEFAULT_BIZ;
function refreshBiz() {
  const g = S.cache && S.cache.garage;
  BIZ = (g && (g.biz || g.name)) || DEFAULT_BIZ;
}

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
function isToday(ts) { const d = new Date(ts), n = new Date(); return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate(); }
function timeAgo(ts) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.round(s / 60) + 'm ago';
  if (s < 86400) return Math.round(s / 3600) + 'h ago';
  return Math.round(s / 86400) + 'd ago';
}

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
  insights: ['owner', 'supervisor'],         // AI Insights screen
  manageDrivers: ['owner', 'supervisor'],    // drivers list/detail, incidents, ratings
  assignDriver: ['owner', 'supervisor'],     // assign a driver to a bus
  logService: ['owner', 'supervisor'],       // resets service + writes a verified job
  manageRoutes: ['owner', 'supervisor'],     // routes, stops, go-times, punctuality
};

/* ------------------------------ Sheets ------------------------------------ */
function openSheet(title, bodyHTML, onMount) {
  closeSheet();
  const wrap = document.createElement('div');
  wrap.className = 'sheetwrap';
  wrap.innerHTML = `<div class="sheet"><div class="sheethead"><h2>${esc(title)}</h2>
    <button class="x" data-act="closeSheet">×</button></div>${bodyHTML}</div>`;
  wrap.addEventListener('click', (e) => { if (e.target === wrap) closeSheet(); });
  // Must live inside #app: the click-delegation handler (bind) is on #app, so a
  // sheet appended to document.body would have all its buttons go dead.
  root().appendChild(wrap);
  if (onMount) onMount(wrap);
}
function closeSheet() {
  const w = $('.sheetwrap'); if (w) w.remove();
  // Reset pending photo captures so a dismissed sheet can't leak its photo
  // into the next incident/bill (these are module-level scratch vars).
  _incPhoto = ''; _billPhoto = ''; _docPhoto = ''; _stopLat = null; _stopLng = null;
}

/* ------------------------------ Data ops ---------------------------------- */
async function load() {
  const [users, buses, parts, jobs, ledger, att, purchases, drivers, incidents, driverreports, routes, triplog, garage] = await Promise.all([
    DB.all('users'), DB.all('buses'), DB.all('parts'), DB.all('jobcards'),
    DB.all('ledger'), DB.all('attendance'), DB.all('purchases'),
    DB.all('drivers'), DB.all('incidents'), DB.all('driverreports'),
    DB.all('routes'), DB.all('triplog'), DB.get('meta', 'garage'),
  ]);
  S.cache = { users, buses, parts, jobs, ledger, att, purchases, drivers, incidents, driverreports, routes, triplog, garage };
  refreshBiz();   // keep the displayed business name in sync with garage config
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

async function receiveStock({ partId, qty, cost = 0, reason = 'Stock received', silent = false }) {
  const part = byId(S.cache.parts, partId);
  if (!part || qty <= 0) { if (!silent) toast('Enter quantity'); return; }
  // Weighted-average the unit cost so stock valuation tracks the real buy price.
  if (cost > 0) {
    const oldVal = part.qty * (part.unitCost || 0);
    part.unitCost = Math.round((oldVal + qty * cost) / (part.qty + qty));
  }
  part.qty += qty;
  await DB.put('parts', part);
  await DB.put('ledger', { id: uid('l-'), partId, type: 'in', qty, jobId: null, reason, by: S.user.id, at: Date.now() });
  await load();
  if (!silent) toast(`Added ${qty} ${part.unit} to ${part.name}`);
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
// Labour rate is a garage setting (₹/hr), not a hardcoded value — each garage
// sets its own in Garage setup. Falls back to a sane default until configured.
const DEFAULT_LABOUR_RATE = 250;
function labourRate() { return (S.cache.garage && Number(S.cache.garage.labourRate)) || DEFAULT_LABOUR_RATE; }
function jobCost(job) {
  const parts = (job.partsUsed || []).reduce((s, l) => s + l.cost, 0);
  const labour = (job.labourHours || 0) * labourRate();
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
  // Rough lifetime ₹/km: total repair spend on this bus ÷ km it has run.
  // (The old formula subtracted a service window and produced nonsense numbers.)
  const cost = S.cache.jobs.filter((j) => j.busId === b.id).reduce((s, j) => s + jobCost(j).total, 0);
  const km = Math.max(1, b.odometer || 0);
  return cost / km;
}

/* ----------------------- Phase 3: GPS provider ----------------------------
 * Adapter over the bus tracker. The demo provider is served by sync_server.py.
 * To use YOUR tracker: point baseUrl at the provider, add its auth header, and
 * map the response fields below — nothing else in the app changes.
 */
const GpsProvider = {
  name: 'AirFi',
  async live(bus) {
    // Reuse Sync's resolved backend URL (Render in production, local in dev).
    const base = (Sync.info && Sync.info().url) || (location.protocol + '//' + location.hostname + ':8766');
    const res = await fetch(base + '/gps?busId=' + encodeURIComponent(bus.id) +
      '&odo=' + (bus.odometer || 0) + '&reg=' + encodeURIComponent(bus.regNo || ''));
    if (!res.ok) throw new Error('gps ' + res.status);
    const d = await res.json();
    // The server returns real AirFi telemetry when the tracker is pushing for
    // this registration, else a simulated fallback — `source` says which.
    return { lat: d.lat, lng: d.lng, speedKph: d.speedKph, ignition: d.ignition,
      odometer: d.odometer, lastPing: d.lastPing, source: d.source || 'simulated' };
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

/* --------------------------- Drivers & performance ------------------------- */
// Performance data points and their penalty (subtracted from a 100 score).
const INCIDENT = {
  scratch:       { label: 'Scratch',      icon: '➰', pen: 3 },
  dent:          { label: 'Dent',         icon: '🔨', pen: 8 },
  'harsh-brake': { label: 'Harsh braking', icon: '🛑', pen: 5 },
  overspeed:     { label: 'Overspeeding', icon: '💨', pen: 6 },
  late:          { label: 'Late trip',    icon: '⏰', pen: 2 },
  cleanliness:   { label: 'Cleanliness',  icon: '🧽', pen: 3 },
  accident:      { label: 'Accident',     icon: '⚠️', pen: 20 },
  other:         { label: 'Other',        icon: '•',  pen: 4 },
};
const driverById = (id) => byId(S.cache.drivers || [], id);
const driverName = (id) => (driverById(id) || {}).name || '—';
const driverOfBus = (busId) => (S.cache.drivers || []).find((d) => d.busId === busId) || null;
const driverForUser = (userId) => (S.cache.drivers || []).find((d) => d.userId === userId) || null;
const driverIncidents = (driverId) => (S.cache.incidents || []).filter((i) => i.driverId === driverId);
const openReportsForBus = (busId) => (S.cache.driverreports || []).filter((r) => r.busId === busId && r.status === 'open');

// Performance score: 100 minus weighted penalties (last 90 days), 0..100.
function driverScore(driverId) {
  const since = Date.now() - 90 * day;
  const pen = driverIncidents(driverId).filter((i) => i.at >= since)
    .reduce((s, i) => s + ((INCIDENT[i.type] || INCIDENT.other).pen), 0);
  return Math.max(0, 100 - pen);
}
const scoreStars = (score) => Math.round((score / 20) * 2) / 2;   // 0..5, half steps
function starStr(stars) {
  const full = Math.floor(stars), half = stars - full >= 0.5;
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(5 - full - (half ? 1 : 0));
}
const scoreClass = (s) => s >= 85 ? 'b-green' : s >= 70 ? 'b-amber' : 'b-red';

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
const TAB_OF = { home: 'home', buses: 'buses', jobs: 'jobs', store: 'store', me: 'me', purchases: 'me', alerts: 'me', insights: 'home', drivers: 'home', assignments: 'home', company: 'home', routes: 'home' };
function bottomnav() {
  const active = TAB_OF[S.route.name] || 'home';
  // Each role gets a focused nav matching what they actually do.
  const NAVS = {
    driver:   [['home', '🚌', 'My Bus'], ['me', '👤', t('me')]],
    store:    [['home', '🏠', t('home')], ['store', '📦', t('store')], ['jobs', '🛠️', t('jobs')], ['me', '👤', t('me')]],
    mechanic: [['home', '🏠', t('home')], ['jobs', '🛠️', t('jobs')], ['store', '📦', t('store')], ['me', '👤', t('me')]],
  };
  const items = NAVS[S.user.role] ||
    [['home', '🏠', t('home')], ['buses', '🚌', t('buses')], ['jobs', '🛠️', t('jobs')],
     ['store', '📦', t('store')], ['me', '👤', t('me')]];
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
// Storekeeper home — inventory first.
function viewStoreHome() {
  const parts = S.cache.parts;
  const low = parts.filter((p) => p.qty <= p.reorderLevel);
  const stockValue = parts.reduce((s, p) => s + p.qty * p.unitCost, 0);
  const pending = S.cache.purchases.filter((p) => p.paymentStatus === 'pending').reduce((s, p) => s + p.amount, 0);
  const openJobs = S.cache.jobs.filter((j) => j.status === 'open' || j.status === 'in-progress');
  let body = `<div class="greet"><div class="greet-av">📦</div>
    <div><div class="greet-hi">Namaste, ${esc(S.user.name.split(' ')[0])} 👋</div><div class="muted small">${esc(BIZ)} · ${fmtToday()}</div></div></div>`;
  body += `<div class="grid2">
    <div class="card tile"><div class="muted small">Stock value</div><div class="stat">${money(stockValue)}</div></div>
    <div class="card tile"><div class="muted small">Low stock</div><div class="stat">${low.length}</div></div></div>`;
  body += `<div class="btnrow" style="margin-bottom:14px">
    <button class="btn primary" data-act="addStock">📥 ${t('addStock')}</button>
    <button class="btn" data-act="issueTo">📤 Issue part</button></div>`;
  body += `<div class="card"><div class="row between"><h3>Reorder soon</h3><span class="badge ${low.length ? 'b-amber' : 'b-green'}">${low.length}</span></div>`;
  body += low.length ? low.map((p) => `<div class="li" data-part="${p.id}">${avatar(partImg(p), '🔩')}<div class="main"><div class="t">${esc(p.name)}</div><div class="s">${p.qty} ${p.unit} left · reorder at ${p.reorderLevel}</div></div><span class="badge b-amber">LOW</span></div>`).join('') : `<div class="muted small">Stock healthy 👍</div>`;
  body += `</div>`;
  body += `<div class="card" data-act="openPurchases" style="cursor:pointer"><div class="row between"><h3>Pending to suppliers</h3><b style="color:var(--amber)">${money(pending)}</b></div><div class="tiny muted">Tap to view bills</div></div>`;
  body += `<div class="card"><h3>Open jobs (parts may be needed)</h3>`;
  body += openJobs.length ? openJobs.slice(0, 6).map(jobLi).join('') : `<div class="muted small">No open jobs.</div>`;
  body += `</div>`;
  shell(t('appName'), body);
}

// Mechanic home — my work first.
function viewMechanicHome() {
  const me = S.user.id;
  const myJobs = S.cache.jobs.filter((j) => j.assignedTo === me);
  const open = myJobs.filter((j) => j.status === 'open' || j.status === 'in-progress');
  const myAtt = S.cache.att.filter((a) => a.userId === me);
  const checkedIn = myAtt.length && myAtt[myAtt.length - 1].type === 'in' && isToday(myAtt[myAtt.length - 1].at);
  const myBusIds = [...new Set(open.map((j) => j.busId))];
  const reports = (S.cache.driverreports || []).filter((r) => r.status === 'open' && myBusIds.includes(r.busId));
  let body = `<div class="greet"><div class="greet-av">🔧</div>
    <div><div class="greet-hi">Namaste, ${esc(S.user.name.split(' ')[0])} 👋</div><div class="muted small">${esc(BIZ)} · ${fmtToday()}</div></div></div>`;
  if (!checkedIn) body += `<div class="banner warn">⏰ You are not checked in today.<button class="btn sm" data-nav="me" style="margin-left:auto">${t('checkin')}</button></div>`;
  body += `<div class="grid2">
    <div class="card tile"><div class="muted small">My open jobs</div><div class="stat">${open.length}</div></div>
    <div class="card tile"><div class="muted small">Completed</div><div class="stat">${myJobs.filter((j) => j.status === 'done' || j.status === 'verified').length}</div></div></div>`;
  const order = { open: 0, 'in-progress': 1, done: 2, verified: 3 };
  body += `<div class="card"><h3>My jobs</h3>`;
  body += myJobs.length ? [...myJobs].sort((a, b) => (order[a.status] - order[b.status]) || (b.createdAt - a.createdAt)).slice(0, 8).map(jobLi).join('') : `<div class="muted small">No jobs assigned to you.</div>`;
  body += `</div>`;
  if (reports.length) {
    body += `<div class="card"><div class="row between"><h3>Driver said…</h3><span class="badge b-amber">${reports.length}</span></div>
      <div class="tiny muted" style="margin-bottom:6px">What drivers reported on the buses you're working — check these too.</div>`;
    body += reports.map((r) => `<div class="li" data-bus="${r.busId}"><div class="ava">🗣️</div><div class="main"><div class="t">${esc(r.problem)}</div><div class="s">${esc(busName(r.busId))} · ${esc(r.category || '')}</div></div></div>`).join('');
    body += `</div>`;
  }
  shell(t('appName'), body);
}

function viewHome() {
  if (S.user.role === 'driver') return viewDriverHome();
  if (S.user.role === 'store') return viewStoreHome();
  if (S.user.role === 'mechanic') return viewMechanicHome();
  const openJobs = S.cache.jobs.filter((j) => j.status === 'open' || j.status === 'in-progress');
  const low = S.cache.parts.filter((p) => p.qty <= p.reorderLevel);
  const alerts = allDocAlerts();
  const cost = costLast30();
  const myAtt = S.cache.att.filter((a) => a.userId === S.user.id);
  const checkedIn = myAtt.length && myAtt[myAtt.length - 1].type === 'in' && isToday(myAtt[myAtt.length - 1].at);

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
      ${qtile('🧾', money(pending), 'Owed to suppliers', 'purchases')}
    </div>`;

    // On-time pickup — at-risk warning (computed by the route monitor)
    const risks = S.routeRisks || [];
    if (risks.length) {
      body += `<div class="card" data-act="openRoutes" style="cursor:pointer;border:1.5px solid var(--amber)">
        <div class="row between"><h3>⚠️ Pickups at risk now</h3><span class="badge b-amber">${risks.length}</span></div>`;
      body += risks.slice(0, 3).map((r) => `<div class="li" style="border:none;padding:6px 0"><div class="ava">🚍</div>
        <div class="main"><div class="t">${esc(busName(r.bus.id))} → ${esc(r.stop.name)}</div>
        <div class="s">due ${minToHhmm(r.sched)}${r.etaMin != null ? ' · ETA ' + minToHhmm(r.etaMin) : ''}${r.reason ? ' · ' + r.reason : ''}</div></div></div>`).join('');
      body += `<div class="tiny muted" style="margin-top:6px">Tap to view routes — call the driver before the pickup is missed.</div></div>`;
    }

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

    // Drivers — performance + open trip reports
    const drv = S.cache.drivers || [];
    if (drv.length) {
      const worst = [...drv].sort((a, b) => driverScore(a.id) - driverScore(b.id))[0];
      const openReps = (S.cache.driverreports || []).filter((r) => r.status === 'open').length;
      body += `<div class="card" data-act="openDrivers" style="cursor:pointer">
        <div class="row between"><h3>Drivers</h3><span class="badge ${openReps ? 'b-amber' : 'b-green'}">${openReps} open reports</span></div>
        <div class="li" style="border:none;padding:8px 0 0"><div class="ava">🧑‍✈️</div>
          <div class="main"><div class="t">Lowest rated: ${esc(worst.name)}</div><div class="s">tap to manage ${drv.length} drivers</div></div>
          <span class="badge ${scoreClass(driverScore(worst.id))}">${driverScore(worst.id)}</span></div></div>`;
    }

    // Cost by company — horizontal bars; tap a company → billing worksheet
    const cc = costByCompany();
    if (cc.length) {
      const cmax = Math.max(1, ...cc.map((x) => x[1]));
      body += `<div class="card"><h3>Cost by company (lifetime)</h3>
        ${cc.map(([c, v]) => `<div class="hbar" data-company="${esc(c)}" style="cursor:pointer"><div class="hbar-top"><span>${esc(c)} ›</span><b>${money(v)}</b></div>
          <div class="hbar-track"><i style="width:${Math.round(v / cmax * 100)}%"></i></div></div>`).join('')}
        <div class="tiny muted" style="margin-top:8px">Tap a company to see the job-by-job breakdown and share the bill.</div></div>`;
    }
  }

  // Document alerts — critical in India (fitness/PUC/insurance)
  body += `<div class="card" data-act="openAlerts" style="cursor:pointer"><div class="row between"><h3>${t('docAlerts')}</h3><span class="badge ${alerts.length ? 'b-red' : 'b-green'}">${alerts.length}</span></div>`;
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
  let body = '';
  if (can(S.user.role, 'addBus')) {
    body += `<button class="btn" data-act="importFleet" style="margin-bottom:12px">📡 Import fleet from AirFi (GPS)</button>`;
  }
  body += `<div class="card">${list.length ? list.map(busLi).join('') : `<div class="empty">No buses yet</div>`}</div>`;
  shell(t('buses'), body, can(S.user.role, 'addBus') ? { act: 'addBus', icon: '+' } : null);
}
// Pull the fleet AirFi is tracking and create a bus for any registration we
// don't have yet. New buses then track live automatically via GpsProvider.
const _normReg = (s) => (s || '').toUpperCase().replace(/[\s-]/g, '');
async function importFleet() {
  if (!can(S.user.role, 'addBus')) return toast('Not allowed');
  toast('Pulling fleet from AirFi…');
  const fleet = await Sync.fleet();
  if (!fleet.length) {
    return toast('No buses from AirFi yet — they appear once trackers start pushing.');
  }
  const have = new Set((S.cache.buses || []).map((b) => _normReg(b.regNo)));
  let added = 0;
  for (const f of fleet) {
    const reg = (f.reg || '').trim();
    if (!reg || have.has(_normReg(reg))) continue;
    const odo = Number(f.odometer) || 0;
    await DB.put('buses', {
      id: uid('b-'), regNo: reg, company: '', model: '', chassis: '', engine: '',
      odometer: odo, serviceIntervalKm: SERVICE_INTERVAL_KM, lastServiceOdo: odo,
      docs: [], photos: [], source: 'airfi',
    });
    have.add(_normReg(reg)); added++;
  }
  await load();
  toast(added ? `Imported ${added} bus(es) from AirFi ✓` : 'Fleet already up to date');
  rerender();
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

  // Driver assigned to this bus + their open trip reports
  const drv = driverOfBus(b.id);
  const openReps = openReportsForBus(b.id);
  const canDrivers = can(S.user.role, 'manageDrivers');
  body += `<div class="card"><div class="row between"><h3>Driver</h3>
      ${can(S.user.role, 'assignDriver') ? `<button class="btn sm" data-act="assignDriver" data-bus="${b.id}">${drv ? 'Change' : 'Assign'}</button>` : ''}</div>`;
  if (drv) {
    const sc = driverScore(drv.id);
    body += `<div class="li" ${canDrivers ? `data-driver="${drv.id}"` : ''}><div class="ava">🧑‍✈️</div>
      <div class="main"><div class="t">${esc(drv.name)}</div><div class="s">${drv.tripsLogged || 0} trips · ${esc(drv.phone || '')}</div></div>
      ${canDrivers ? `<div style="text-align:right"><span class="badge ${scoreClass(sc)}">${sc}</span><div class="stars">${starStr(scoreStars(sc))}</div></div>` : ''}</div>`;
  } else body += `<div class="muted small">No driver assigned.</div>`;
  body += `</div>`;

  if (openReps.length) {
    body += `<div class="card"><div class="row between"><h3>Driver-reported issues</h3><span class="badge b-amber">${openReps.length}</span></div>
      <div class="tiny muted" style="margin-bottom:6px">What the driver felt on the road — fix these first.</div>`;
    body += openReps.map((r) => `<div class="li"><div class="ava">🟠</div>
      <div class="main"><div class="t">${esc(r.problem)}</div><div class="s">${esc(r.category || '')} · ${esc(driverName(r.driverId))} · ${fmtDate(r.at)}</div></div>
      ${can(S.user.role, 'addJob') ? `<button class="btn sm" data-act="reportToJob" data-report="${r.id}">→ Job</button>` : ''}</div>`).join('');
    body += `</div>`;
  }

  // Documents — managers can add/edit so expiry alerts actually get created & cleared
  const canDocs = can(S.user.role, 'addBus');
  body += `<div class="card"><div class="row between"><h3>${t('documents')}</h3>
    ${canDocs ? `<button class="btn sm" data-act="addDoc" data-bus="${b.id}">+ Doc</button>` : ''}</div>`;
  body += (b.docs || []).map((d, i) => {
    const st = docStatus(d.expiry);
    return `<div class="row between small" style="padding:7px 0;border-bottom:1px solid var(--line)${canDocs ? ';cursor:pointer' : ''}"
        ${canDocs ? `data-act="editDoc" data-bus="${b.id}" data-doc="${i}"` : ''}>
      <div><b>${esc(d.type)}</b><div class="tiny muted">${esc(d.number||'')} · ${fmtDate(d.expiry)}</div></div>
      <span class="badge ${st.cls}">${st.txt}</span></div>`;
  }).join('') || `<div class="muted small">No documents${canDocs ? ' — tap “+ Doc” to add insurance / fitness / PUC / permit' : ''}</div>`;
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
// Jobs-list filter state (status + mechanic chips). Owned by supervisor dev.
const jobFilterState = { status: 'all', mech: 'all' };

// Is the current role a verifier? Verifiers see 'done' (awaiting verify) pinned
// to the top so the work waiting on their sign-off is impossible to miss.
function isVerifierRole() { return can(S.user.role, 'verifyJob'); }

// Renders the tappable status + mechanic filter chips above the jobs list.
function jobsFilterBar() {
  const verifier = isVerifierRole();
  const toVerify = S.cache.jobs.filter((j) => j.status === 'done').length;
  const chip = (act, attr, val, cur, label, badge) =>
    `<button class="btn sm ${cur === val ? 'primary' : 'ghost'}" data-act="${act}" data-${attr}="${val}" style="border:1px solid var(--line)">${esc(label)}${badge ? ` <span class="badge b-done tiny" style="padding:1px 7px">${badge}</span>` : ''}</button>`;
  const statuses = [
    ['all', t('filterAll')], ['open', t('open')], ['in-progress', t('statusInProgress')],
    ['done', t('toVerify')], ['verified', t('statusVerified')],
  ];
  let bar = '';
  if (verifier && toVerify) {
    bar += `<div class="banner" style="background:#fff3e0;color:#b9740a;cursor:pointer" data-act="filterStatus" data-fstatus="done">🔔 ${toVerify} ${t('jobsAwaitingVerify')}</div>`;
  }
  bar += `<div class="row" style="gap:7px;overflow-x:auto;padding-bottom:8px;flex-wrap:nowrap">`;
  bar += statuses.map(([v, l]) => chip('filterStatus', 'fstatus', v, jobFilterState.status, l, v === 'done' ? toVerify : 0)).join('');
  bar += `</div>`;
  const mechs = S.cache.users.filter((u) => u.role === 'mechanic');
  if (S.user.role !== 'mechanic' && mechs.length) {
    bar += `<div class="row" style="gap:7px;overflow-x:auto;padding-bottom:8px;flex-wrap:nowrap">`;
    bar += chip('filterMech', 'fmech', 'all', jobFilterState.mech, t('filterAllMechs'), 0);
    bar += mechs.map((m) => chip('filterMech', 'fmech', m.id, jobFilterState.mech, m.name, 0)).join('');
    bar += `</div>`;
  }
  return bar;
}

// Applies the active filter chips to a job list (mechanic role is always scoped
// to their own jobs first, separately, in viewJobs).
function applyJobFilter(jobs) {
  let out = jobs;
  if (jobFilterState.status !== 'all') out = out.filter((j) => j.status === jobFilterState.status);
  if (jobFilterState.mech !== 'all') out = out.filter((j) => j.assignedTo === jobFilterState.mech);
  return out;
}

function viewJobs() {
  let jobs = [...S.cache.jobs];
  if (S.user.role === 'mechanic') jobs = jobs.filter((j) => j.assignedTo === S.user.id);
  jobs = applyJobFilter(jobs);
  // Verifiers get 'done' (awaiting verify) pinned to the very top; everyone
  // else keeps the original open→in-progress→done→verified ordering.
  const order = isVerifierRole()
    ? { done: 0, open: 1, 'in-progress': 2, verified: 3 }
    : { open: 0, 'in-progress': 1, done: 2, verified: 3 };
  jobs.sort((a, b) => (order[a.status] - order[b.status]) || (b.createdAt - a.createdAt));
  let body = jobsFilterBar();
  body += `<div class="card">${jobs.length ? jobs.map(jobLi).join('') : `<div class="empty">${t('noJobsMatch')}</div>`}</div>`;
  shell(t('jobs'), body, can(S.user.role, 'addJob') ? { act: 'addJob', icon: '+' } : null);
}

function photoStrip(job, field, editable) {
  const arr = job[field] || [];
  let h = `<div class="lbl">${field === 'beforePhotos' ? t('beforePhotos') : t('afterPhotos')}</div><div class="thumbs">`;
  h += arr.map((src, i) => `<img class="thumb" src="${src}" data-act="viewPhoto" data-src="${src}">`).join('');
  if (editable) h += `<div class="photoadd" data-act="addPhotoSafe" data-job="${job.id}" data-field="${field}">＋</div>`;
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
  // A supervisor/owner can always attach a missing after-photo as proof, even
  // on a verified job — this is the only way to clear the "no proof photo" flag.
  const canAddProof = ['owner', 'supervisor'].includes(S.user.role);
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
  body += `<div class="card">${photoStrip(j, 'beforePhotos', editable)}<div class="spacer"></div>${photoStrip(j, 'afterPhotos', editable || canAddProof)}
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
  const actions = actionsForJob(j, editable);
  if (actions) body += `<div class="card">${actions}</div>`;

  shell('Job Card', body);
}

// All action buttons shown on a job card, in one place so edit/reassign,
// mark-done, verify and send-back sit together. Owned by supervisor dev.
function actionsForJob(j, editable) {
  let actions = '';
  // Edit / Reassign — owner/supervisor, any time the job isn't verified yet.
  if (['owner', 'supervisor'].includes(S.user.role) && j.status !== 'verified') {
    actions += `<button class="btn" data-act="editJob" data-job="${j.id}">✏️ ${t('editReassign')}</button>`;
  }
  if (editable && (j.status === 'open' || j.status === 'in-progress')) {
    actions += `<button class="btn primary" data-act="markDone" data-job="${j.id}">✅ ${t('markDone')}</button>`;
  }
  if (j.status === 'done' && can(S.user.role, 'verifyJob')) {
    actions += `<button class="btn primary" data-act="verifyJob" data-job="${j.id}">☑️ ${t('verify')}</button>
      <button class="btn" data-act="rejectJob" data-job="${j.id}">↩️ Send back for rework</button>`;
  }
  if (j.status === 'verified') {
    actions += `<div class="banner" style="background:#123a2c;color:var(--green)">✓ Verified by ${esc(userName(j.verifiedBy))} on ${fmtDate(j.verifiedAt)}</div>`;
  }
  return actions;
}

// Edit / Reassign an existing job. Prefills from the jobcard and DB.puts the
// SAME id (mutate, not create). Owned by supervisor dev.
function sheetEditJob(jobId) {
  const j = byId(S.cache.jobs, jobId);
  if (!j) return;
  const buses = S.cache.buses;
  const mechs = S.cache.users.filter((u) => u.role === 'mechanic');
  const assignees = mechs.length ? mechs : [{ id: S.user.id, name: S.user.name + ' (you)' }];
  if (assignees.every((m) => m.id !== j.assignedTo)) {
    assignees.unshift({ id: j.assignedTo, name: userName(j.assignedTo) });
  }
  const prioOpt = (v, label) => `<option value="${v}" ${j.priority === v ? 'selected' : ''}>${label}</option>`;
  openSheet(t('editReassign'), `
    <label class="field"><span class="lbl">Bus</span><select id="fe-bus">${buses.map((b) => `<option value="${b.id}" ${b.id === j.busId ? 'selected' : ''}>${esc(b.regNo)} — ${esc(b.company)}</option>`).join('')}</select></label>
    <label class="field"><span class="lbl">Problem reported</span><textarea id="fe-prob">${esc(j.problem || '')}</textarea></label>
    <div class="grid2">
      <label class="field"><span class="lbl">Assign to</span><select id="fe-mech">${assignees.map((m) => `<option value="${m.id}" ${m.id === j.assignedTo ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>
      <label class="field"><span class="lbl">Priority</span><select id="fe-prio">${prioOpt('high', 'High')}${prioOpt('medium', 'Medium')}${prioOpt('low', 'Low')}</select></label>
    </div>
    <label class="field"><span class="lbl">Outside vendor (optional)</span><input id="fe-vendor" value="${esc(j.externalVendor || '')}" placeholder="Leave blank if in-house"></label>
    <div class="grid2">
      <label class="field"><span class="lbl">Outside cost (₹)</span><input id="fe-extcost" type="number" inputmode="numeric" value="${j.externalCost || ''}"></label>
      <label class="field"><span class="lbl">Labour hours</span><input id="fe-hrs" type="number" inputmode="decimal" value="${j.labourHours || ''}"></label>
    </div>
    <label class="field"><span class="lbl">Notes (optional)</span><textarea id="fe-notes" placeholder="Any extra detail for the mechanic">${esc(j.notes || '')}</textarea></label>
    <button class="btn primary" data-act="saveEditJob" data-job="${j.id}">${t('save')}</button>`);
}
async function saveEditJob(jobId) {
  const j = byId(S.cache.jobs, jobId);
  if (!j) return;
  const prob = $('#fe-prob').value.trim();
  if (!prob) return toast(t('describeProblem'));
  const assignedTo = $('#fe-mech').value;
  if (!assignedTo) return toast(t('pickAssignee'));
  // Mutate the SAME record (same id) — reassign/edit, never create a new job.
  j.busId = $('#fe-bus').value;
  j.problem = prob;
  j.assignedTo = assignedTo;
  j.priority = $('#fe-prio').value;
  j.externalVendor = $('#fe-vendor').value.trim();
  j.externalCost = Number($('#fe-extcost').value) || 0;
  j.labourHours = Number($('#fe-hrs').value) || 0;
  j.notes = ($('#fe-notes') ? $('#fe-notes').value.trim() : '');
  await DB.put('jobcards', j);
  await load(); closeSheet(); toast(t('jobUpdated')); rerender();
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
      <button class="btn primary" data-act="addStock">📥 ${t('addStock')}</button>
      <button class="btn" data-act="issueTo">📤 ${t('issuePart')}</button></div>`;
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
  const checkedIn = last && last.type === 'in' && isToday(last.at);

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
  body += `<div class="card"><h3>${t('more')}</h3>
    <div class="li" data-act="openPurchases"><div class="ava">🧾</div><div class="main"><div class="t">${t('purchases')}</div><div class="s">${t('supplierBills')}</div></div></div>
    <div class="li" data-act="openAlerts"><div class="ava">📄</div><div class="main"><div class="t">${t('docAlerts')}</div><div class="s">${allDocAlerts().length} need attention</div></div></div>
    ${['owner', 'supervisor'].includes(S.user.role)
      ? `<div class="li" data-act="openDrivers"><div class="ava">🧑‍✈️</div><div class="main"><div class="t">Drivers</div><div class="s">${(S.cache.drivers || []).length} drivers · performance & reports</div></div></div>
         <div class="li" data-act="openAssignments"><div class="ava">🔁</div><div class="main"><div class="t">Driver ↔ Bus assignments</div><div class="s">Who drives which bus · reassign in one place</div></div></div>
         <div class="li" data-act="openStaff"><div class="ava">👥</div><div class="main"><div class="t">Staff</div><div class="s">${S.cache.users.length} accounts · add new</div></div></div>
         <div class="li" data-act="openRoutes"><div class="ava">🕒</div><div class="main"><div class="t">Routes &amp; timings</div><div class="s">Pickup geofences, go-times &amp; punctuality</div></div></div>
         <div class="li" data-act="openSetup"><div class="ava">⚙️</div><div class="main"><div class="t">Garage setup</div><div class="s">Location, geofence, shift time · start fresh</div></div></div>` : ''}
    <div class="li" data-act="changePin"><div class="ava">🔑</div><div class="main"><div class="t">${t('changePin')}</div><div class="s">Set a new 4-digit login PIN</div></div></div>
    <div class="li" data-act="openSync"><div class="ava">🔄</div><div class="main"><div class="t">${t('sync')}</div><div class="s">${SYNC_STATUS === 'synced' ? 'All devices up to date' : SYNC_STATUS === 'offline' ? 'Offline — will sync when connected' : 'Syncing…'}${si.pending ? ` · ${si.pending} pending` : ''}</div></div></div>
    <div class="li" data-act="logout"><div class="ava">🚪</div><div class="main"><div class="t">${t('logout')}</div></div></div>
  </div>`;

  shell(t('me'), body);
}

/* ----------------------------- Attendance flow ---------------------------- */
async function doAttendance(type) {
  // Selfie first — attendance is unverifiable without proof of who showed up.
  toast(type === 'in' ? 'Take a selfie to check in' : 'Take a selfie to check out');
  const selfie = await capturePhoto();
  if (!selfie) return toast('Selfie required to mark attendance');

  toast('Getting location…');
  let lat = null, lng = null, dist = null;
  try {
    const pos = await new Promise((res, rej) =>
      navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 8000 }));
    lat = pos.coords.latitude; lng = pos.coords.longitude;
    const g = S.cache.garage;
    if (g) dist = haversineM(g.lat, g.lng, lat, lng);
  } catch (e) { /* no GPS — confirm below before recording */ }

  // No location at all → can't confirm they're at the garage. Record only on confirm.
  if (lat == null && !confirm('Could not get your location. Mark attendance without GPS verification?')) return;

  // Late if checking in after the garage's configured shift start (default 09:30).
  const cutoff = (S.cache.garage && S.cache.garage.lateCutoff) || '09:30';
  const cm = cutoff.split(':'); const ch = Number(cm[0]) || 9, cmin = Number(cm[1]) || 0;
  const d = new Date();
  const late = type === 'in' && (d.getHours() > ch || (d.getHours() === ch && d.getMinutes() > cmin));

  const g = S.cache.garage;
  const tooFar = g && dist != null && dist > g.radiusM;
  if (tooFar) {
    if (!confirm(`You are ${Math.round(dist)}m from the garage (limit ${g.radiusM}m). Record anyway?`)) return;
  }

  const selfieRef = selfie ? (await Sync.uploadPhoto(selfie) || selfie) : '';
  await DB.put('attendance', { id: uid('a-'), userId: S.user.id, type, at: Date.now(), lat, lng, dist, selfie: selfieRef, late, flagged: !!tooFar || lat == null });
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
    <div class="grid2">
      <label class="field"><span class="lbl">Engine No.</span><input id="f-engine"></label>
      <label class="field"><span class="lbl">Service every (km)</span><input id="f-interval" type="number" inputmode="numeric" placeholder="10000"></label>
    </div>
    <label class="field"><span class="lbl">Last service odometer (km, optional)</span><input id="f-lastodo" type="number" inputmode="numeric" placeholder="defaults to current odometer"></label>
    <div class="tiny muted" style="margin-bottom:10px">Add insurance / fitness / PUC expiry dates after saving, from the bus page.</div>
    <button class="btn primary" data-act="saveBus">${t('save')}</button>`);
}
async function saveBus() {
  const reg = $('#f-reg').value.trim();
  if (!reg) return toast('Enter registration no.');
  const odo = Number($('#f-odo').value) || 0;
  await DB.put('buses', {
    id: uid('b-'), regNo: reg, company: $('#f-co').value.trim(), model: $('#f-model').value.trim(),
    chassis: $('#f-chassis').value.trim(), engine: $('#f-engine').value.trim(), odometer: odo,
    serviceIntervalKm: Number($('#f-interval').value) || SERVICE_INTERVAL_KM,
    lastServiceOdo: $('#f-lastodo').value !== '' ? Number($('#f-lastodo').value) : odo,
    docs: [], photos: [],
  });
  await load(); closeSheet(); toast('Bus added'); viewBuses();
}

// Add or edit a bus document (insurance / fitness / PUC / permit) + its expiry.
const DOC_TYPES = ['Insurance', 'Fitness', 'PUC', 'Permit', 'Road tax'];
let _docPhoto = '';
function sheetAddDoc(busId, docIndex) {
  const b = byId(S.cache.buses, busId); if (!b) return;
  const idx = (docIndex == null || docIndex === '') ? -1 : Number(docIndex);
  const cur = idx >= 0 ? (b.docs || [])[idx] : null;
  const expVal = cur && cur.expiry ? new Date(cur.expiry).toISOString().slice(0, 10) : '';
  _docPhoto = (cur && cur.photo) || '';
  openSheet(cur ? 'Edit document' : 'Add document', `
    <input type="hidden" id="f-docidx" value="${idx}">
    <label class="field"><span class="lbl">Type</span><select id="f-doctype">${
      DOC_TYPES.map((tp) => `<option value="${tp}" ${cur && cur.type === tp ? 'selected' : ''}>${tp}</option>`).join('')}</select></label>
    <label class="field"><span class="lbl">Document / policy no.</span><input id="f-docnum" value="${esc(cur && cur.number || '')}"></label>
    <label class="field"><span class="lbl">Expiry date</span><input id="f-docexp" type="date" value="${expVal}"></label>
    <div id="f-docthumb">${_docPhoto ? `<img class="thumb" src="${_docPhoto}">` : ''}</div>
    <button class="btn" data-act="docPhoto">📷 ${_docPhoto ? 'Replace' : 'Add'} document photo</button>
    <div class="spacer"></div>
    <button class="btn primary" data-act="saveDoc" data-bus="${busId}">${t('save')}</button>
    ${cur ? `<div class="spacer"></div><button class="btn" data-act="deleteDoc" data-bus="${busId}" data-doc="${idx}">🗑 Remove document</button>` : ''}`);
}
async function saveDoc(busId) {
  const b = byId(S.cache.buses, busId); if (!b) return;
  const expStr = $('#f-docexp').value;
  if (!expStr) return toast('Enter the expiry date');
  const idx = Number($('#f-docidx').value);
  const doc = { type: $('#f-doctype').value, number: $('#f-docnum').value.trim(), expiry: new Date(expStr + 'T00:00:00').getTime(), photo: _docPhoto };
  b.docs = b.docs || [];
  if (idx >= 0) b.docs[idx] = doc; else b.docs.push(doc);
  await DB.put('buses', b);
  _docPhoto = '';
  await load(); closeSheet(); toast('Document saved'); rerender();
}
async function deleteDoc(busId, docIndex) {
  const b = byId(S.cache.buses, busId); if (!b) return;
  const idx = Number(docIndex);
  if (b.docs && idx >= 0) { b.docs.splice(idx, 1); await DB.put('buses', b); }
  await load(); closeSheet(); toast('Document removed'); rerender();
}

// Driver-reported issues for a bus, as a tappable checklist the mechanic can
// link this job to (so the complaint is tracked to resolution).
function reportPicklist(busId) {
  const reps = openReportsForBus(busId);
  if (!reps.length) return `<div class="tiny muted">No open driver reports for this bus.</div>`;
  return reps.map((r) => `<label class="repcheck"><input type="checkbox" class="f-rep" value="${r.id}" checked>
    <span><b>${esc(driverName(r.driverId))}</b> · ${esc(r.category || '')} — ${esc(r.problem)}</span></label>`).join('');
}
// A more prominent version of reportPicklist for the new-job sheet: shows a
// count badge header and renders each open report as a tappable suggestion that
// (a) keeps it linked via the .f-rep checkbox and (b) pre-fills #f-prob with the
// report text so supervisors link instead of retype. Does NOT touch
// reportPicklist. Owned by supervisor dev.
function reportPicklistRich(busId) {
  const reps = openReportsForBus(busId);
  if (!reps.length) return `<div class="tiny muted">${t('noDriverReports')}</div>`;
  const head = `<div class="row between" style="margin-bottom:8px"><b class="small">🧑‍✈️ ${t('driverReportsWaiting')}</b><span class="badge b-amber">${reps.length}</span></div>`;
  return head + reps.map((r) => `<label class="repcheck">
    <input type="checkbox" class="f-rep" value="${r.id}" checked>
    <span data-act="useReport" data-rprob="${esc(r.problem)}" style="cursor:pointer"><b>${esc(driverName(r.driverId))}</b> · ${esc(r.category || '')} — ${esc(r.problem)} <span class="tiny" style="color:var(--brand2)">${t('useThisReport')}</span></span>
  </label>`).join('');
}
function sheetAddJob(prefill = {}) {
  const buses = S.cache.buses, mechs = S.cache.users.filter((u) => u.role === 'mechanic');
  if (!buses.length) {
    return openSheet(t('addJob'), `<div class="banner warn">Add a bus first — a job card must belong to a bus.</div>
      ${can(S.user.role, 'addBus') ? '<button class="btn primary" data-act="addBus">+ Add bus</button>' : ''}`);
  }
  // No mechanic accounts yet → let the manager assign the job to themselves so
  // the assignee is never blank (they can reassign once staff are added).
  const assignees = mechs.length ? mechs : [{ id: S.user.id, name: S.user.name + ' (you)' }];
  const sel = prefill.busId || (buses[0] && buses[0].id);
  openSheet(t('addJob'), `
    <input type="hidden" id="f-reportId" value="${prefill.reportId || ''}">
    <label class="field"><span class="lbl">Bus</span><select id="f-bus">${buses.map((b) => `<option value="${b.id}" ${b.id === sel ? 'selected' : ''}>${esc(b.regNo)} — ${esc(b.company)}</option>`).join('')}</select></label>
    <div class="card" style="box-shadow:none;background:var(--tile);padding:12px"><div id="f-reports">${reportPicklistRich(sel)}</div></div>
    <label class="field"><span class="lbl">Problem reported</span><textarea id="f-prob" placeholder="e.g. Front brakes weak">${esc(prefill.problem || '')}</textarea></label>
    <div class="grid2">
      <label class="field"><span class="lbl">Assign to</span><select id="f-mech">${assignees.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select></label>
      <label class="field"><span class="lbl">Priority</span><select id="f-prio"><option value="high">High</option><option value="medium" selected>Medium</option><option value="low">Low</option></select></label>
    </div>
    <label class="field"><span class="lbl">Outside vendor (optional)</span><input id="f-vendor" placeholder="Leave blank if in-house"></label>
    <div class="grid2">
      <label class="field"><span class="lbl">Outside cost (₹)</span><input id="f-extcost" type="number" inputmode="numeric"></label>
      <label class="field"><span class="lbl">Labour hours</span><input id="f-hrs" type="number" inputmode="decimal"></label>
    </div>
    <label class="field"><span class="lbl">Notes (optional)</span><textarea id="f-notes" placeholder="Any extra detail for the mechanic"></textarea></label>
    <button class="btn primary" data-act="saveJob">${t('save')}</button>`,
    (wrap) => {
      const busSel = wrap.querySelector('#f-bus');
      busSel.addEventListener('change', () => { wrap.querySelector('#f-reports').innerHTML = reportPicklistRich(busSel.value); });
    });
}
async function saveJob() {
  const busId = $('#f-bus').value, prob = $('#f-prob').value.trim();
  if (!prob) return toast('Describe the problem');
  const assignedTo = $('#f-mech').value;
  if (!assignedTo) return toast('Pick who to assign this to');
  const linkedReports = [...document.querySelectorAll('.f-rep:checked')].map((c) => c.value);
  const presetId = ($('#f-reportId') || {}).value;
  if (presetId && !linkedReports.includes(presetId)) linkedReports.push(presetId);
  const jobId = uid('j-');
  await DB.put('jobcards', {
    id: jobId, busId, problem: prob, priority: $('#f-prio').value,
    status: 'open', reportedBy: S.user.id, assignedTo,
    beforePhotos: [], afterPhotos: [], partsUsed: [],
    labourHours: Number($('#f-hrs').value) || 0,
    externalVendor: $('#f-vendor').value.trim(), externalCost: Number($('#f-extcost').value) || 0,
    reportIds: linkedReports, notes: ($('#f-notes') ? $('#f-notes').value.trim() : ''), createdAt: Date.now(), closedAt: null, verifiedBy: null,
  });
  // Tie the driver reports to this job (resolved when the job is verified).
  for (const rid of linkedReports) { const r = byId(S.cache.driverreports, rid); if (r && r.status === 'open') { r.jobId = jobId; await DB.put('driverreports', r); } }
  await load(); closeSheet(); toast(`Job created${linkedReports.length ? ` · ${linkedReports.length} report(s) linked` : ''}`); viewJobs();
}

function sheetIssue(presetJob) {
  const openJobs = S.cache.jobs.filter((j) => j.status !== 'verified');
  const parts = S.cache.parts;
  if (!parts.length) {
    return openSheet(t('issuePart'), `<div class="banner warn">No parts in inventory yet. Add a part type first.</div>
      <button class="btn primary" data-act="addPart">+ Add part type</button>`);
  }
  if (!openJobs.length) {
    return openSheet(t('issuePart'), `<div class="banner warn">No open job card to issue against. Parts can only be issued to a job (anti-pilferage). Create a job first.</div>`);
  }
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
  if (!parts.length) {
    return openSheet(t('receiveStock'), `<div class="banner warn">No parts in inventory yet. Add a part type first.</div>
      <button class="btn primary" data-act="addPart">+ Add part type</button>`);
  }
  openSheet(t('receiveStock'), `
    <label class="field"><span class="lbl">Part</span><select id="f-part">${parts.map((p) => `<option value="${p.id}">${esc(p.name)} (${p.qty} ${p.unit})</option>`).join('')}</select></label>
    <div class="grid2">
      <label class="field"><span class="lbl">Quantity received</span><input id="f-qty" type="number" inputmode="numeric" value="1"></label>
      <label class="field"><span class="lbl">Unit cost (₹, optional)</span><input id="f-cost" type="number" inputmode="numeric" placeholder="updates valuation"></label>
    </div>
    <button class="btn primary" data-act="confirmReceive">${t('receiveStock')}</button>`);
}
async function confirmReceive() {
  await receiveStock({ partId: $('#f-part').value, qty: Number($('#f-qty').value) || 0, cost: Number($('#f-cost') ? $('#f-cost').value : 0) || 0 });
  closeSheet(); rerender();
}

const PART_UNITS = ['pc', 'set', 'L', 'kg', 'm', 'box'];
function sheetAddPart() {
  openSheet('Add part type', `
    <label class="field"><span class="lbl">Part name</span><input id="f-pname" placeholder="e.g. Brake pad"></label>
    <div class="grid2">
      <label class="field"><span class="lbl">Part no.</span><input id="f-pno" placeholder="optional"></label>
      <label class="field"><span class="lbl">Category</span><input id="f-pcat" placeholder="e.g. Brakes"></label>
    </div>
    <div class="grid2">
      <label class="field"><span class="lbl">Unit</span><select id="f-punit">${PART_UNITS.map((u) => `<option value="${u}">${u}</option>`).join('')}</select></label>
      <label class="field"><span class="lbl">Unit cost (₹)</span><input id="f-pcost" type="number" inputmode="numeric"></label>
    </div>
    <div class="grid2">
      <label class="field"><span class="lbl">Opening qty</span><input id="f-pqty" type="number" inputmode="numeric" value="0"></label>
      <label class="field"><span class="lbl">Reorder at</span><input id="f-preorder" type="number" inputmode="numeric" value="2"></label>
    </div>
    <button class="btn primary" data-act="saveAddPart">${t('save')}</button>`);
}
async function saveAddPart() {
  const name = $('#f-pname').value.trim();
  if (!name) return toast('Enter a part name');
  const qty = Number($('#f-pqty').value) || 0;
  const partId = uid('p-');
  await DB.put('parts', {
    id: partId, name, partNo: $('#f-pno').value.trim(), category: $('#f-pcat').value.trim() || 'General',
    unit: $('#f-punit').value, unitCost: Number($('#f-pcost').value) || 0,
    reorderLevel: Number($('#f-preorder').value) || 0, qty,
  });
  // An opening stock count is a stock-in movement — keep the ledger complete.
  if (qty > 0) await DB.put('ledger', { id: uid('l-'), partId, type: 'in', qty, jobId: null, reason: 'Opening stock', by: S.user.id, at: Date.now() });
  await load(); closeSheet(); toast(`${name} added`); rerender();
}

// One clear "put stock into the system" entry: top up an existing part OR
// create a brand-new part type — both in a single sheet.
function sheetAddStock() {
  const parts = S.cache.parts;
  openSheet('Add stock', `
    <label class="field"><span class="lbl">Part</span>
      <select id="f-spart">
        ${parts.map((p) => `<option value="${p.id}">${esc(p.name)} — ${p.qty} ${p.unit} in stock</option>`).join('')}
        <option value="__new">➕ New part type…</option>
      </select></label>
    <div id="f-newpart" style="display:none">
      <div class="grid2">
        <label class="field"><span class="lbl">New part name</span><input id="f-npname" placeholder="e.g. Clutch plate"></label>
        <label class="field"><span class="lbl">Category</span><input id="f-npcat" placeholder="e.g. Transmission"></label>
      </div>
      <div class="grid2">
        <label class="field"><span class="lbl">Unit</span><select id="f-npunit">${PART_UNITS.map((u) => `<option value="${u}">${u}</option>`).join('')}</select></label>
        <label class="field"><span class="lbl">Reorder at</span><input id="f-npreorder" type="number" inputmode="numeric" value="2"></label>
      </div>
    </div>
    <div class="grid2">
      <label class="field"><span class="lbl">Quantity to add</span><input id="f-sqty" type="number" inputmode="numeric" value="1"></label>
      <label class="field"><span class="lbl">Unit cost (₹)</span><input id="f-scost" type="number" inputmode="numeric"></label>
    </div>
    <div class="banner warn">📥 This adds stock INTO the system and logs it in the ledger. To take parts OUT, use “Issue part” (only against a job card).</div>
    <button class="btn primary" data-act="confirmAddStock">Add to stock</button>`,
    (wrap) => {
      const sel = wrap.querySelector('#f-spart');
      const np = wrap.querySelector('#f-newpart');
      const sync = () => { np.style.display = sel.value === '__new' ? 'block' : 'none'; };
      sel.addEventListener('change', sync); sync();
    });
}
async function confirmAddStock() {
  const sel = $('#f-spart').value;
  const qty = Number($('#f-sqty').value) || 0;
  const cost = Number($('#f-scost').value) || 0;
  if (qty <= 0) return toast('Enter a quantity to add');
  let partId = sel;
  if (sel === '__new') {
    const name = $('#f-npname').value.trim();
    if (!name) return toast('Enter the new part name');
    partId = uid('p-');
    await DB.put('parts', {
      id: partId, name, partNo: '', category: $('#f-npcat').value.trim() || 'General',
      unit: $('#f-npunit').value, unitCost: cost, reorderLevel: Number($('#f-npreorder').value) || 0, qty: 0,
    });
    await load();
  }
  await receiveStock({ partId, qty, cost, reason: 'Stock added' });
  closeSheet(); rerender();
}

function purchaseLineRow() {
  const parts = S.cache.parts;
  return `<div class="row f-line" style="gap:6px;align-items:flex-end;margin-bottom:6px">
    <label class="field" style="flex:2;margin:0"><span class="lbl tiny">Part</span>
      <select class="f-lpart">${parts.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label>
    <label class="field" style="flex:1;margin:0"><span class="lbl tiny">Qty</span><input class="f-lqty" type="number" inputmode="numeric"></label>
    <label class="field" style="flex:1;margin:0"><span class="lbl tiny">₹/unit</span><input class="f-lcost" type="number" inputmode="numeric"></label>
    <button type="button" class="btn sm f-lrm" style="width:auto" title="Remove line">✕</button>
  </div>`;
}
function sheetAddPurchase() {
  const hasParts = S.cache.parts.length > 0;
  openSheet(t('purchases'), `
    <label class="field"><span class="lbl">Supplier</span><input id="f-sup" placeholder="Jaipur Auto Spares"></label>
    <label class="field"><span class="lbl">Amount (₹)</span><input id="f-amt" type="number" inputmode="numeric"></label>
    ${hasParts ? `<div class="card" style="box-shadow:none;background:var(--tile);padding:12px">
      <div class="tiny muted" style="margin-bottom:6px">📦 Parts received (optional — adds to stock &amp; updates the ledger)</div>
      <div id="f-lines"></div>
      <button type="button" class="btn sm" id="f-addline" style="width:auto">+ Add part line</button></div>` : ''}
    <label class="field"><span class="lbl">${hasParts ? 'Other items / notes' : 'Items'}</span><textarea id="f-items" placeholder="Brake pads x10, oil filters x6"></textarea></label>
    <label class="field"><span class="lbl">Payment</span><select id="f-pay"><option value="pending">Pending</option><option value="paid">Paid</option></select></label>
    <div id="f-billthumb"></div>
    <button class="btn" data-act="purchasePhoto">📷 Add bill photo</button>
    <div class="spacer"></div>
    <button class="btn primary" data-act="savePurchase">${t('save')}</button>`,
    (wrap) => {
      const lines = wrap.querySelector('#f-lines');
      if (!lines) return;
      const addLine = () => lines.insertAdjacentHTML('beforeend', purchaseLineRow());
      addLine();
      wrap.querySelector('#f-addline').addEventListener('click', addLine);
      lines.addEventListener('click', (e) => { const rm = e.target.closest('.f-lrm'); if (rm) rm.closest('.f-line').remove(); });
    });
}
let _billPhoto = '';
async function savePurchase() {
  const sup = $('#f-sup').value.trim();
  if (!sup) return toast('Enter supplier');
  const amount = Number($('#f-amt').value) || 0;
  if (amount <= 0) return toast('Enter the bill amount (₹)');
  // Optional part lines → received into stock so the bill actually moves inventory.
  const lines = [...document.querySelectorAll('.f-line')].map((row) => ({
    partId: row.querySelector('.f-lpart') ? row.querySelector('.f-lpart').value : '',
    qty: Number(row.querySelector('.f-lqty').value) || 0,
    cost: Number(row.querySelector('.f-lcost').value) || 0,
  })).filter((l) => l.partId && l.qty > 0);
  // Reconcile: if the part lines have costs, warn when they don't match the bill.
  const lineTotal = lines.reduce((s, l) => s + l.qty * l.cost, 0);
  if (lineTotal > 0 && Math.abs(lineTotal - amount) > Math.max(50, amount * 0.05)) {
    if (!confirm(`Part lines add up to ${money(lineTotal)} but the bill says ${money(amount)}. Save anyway?`)) return;
  }
  const lineText = lines.map((l) => { const p = byId(S.cache.parts, l.partId); return `${p ? p.name : l.partId} ×${l.qty}`; }).join(', ');
  const notes = $('#f-items') ? $('#f-items').value.trim() : '';
  const pay = $('#f-pay').value;
  await DB.put('purchases', {
    id: uid('pur-'), supplier: sup, amount,
    items: [lineText, notes].filter(Boolean).join(' · '), lines,
    paymentStatus: pay, paidAt: pay === 'paid' ? Date.now() : null, billPhoto: _billPhoto, at: Date.now(),
  });
  for (const l of lines) await receiveStock({ partId: l.partId, qty: l.qty, cost: l.cost, reason: `Purchase from ${sup}`, silent: true });
  _billPhoto = '';
  await load(); closeSheet(); toast(lines.length ? `Bill saved · ${lines.length} part line(s) received` : 'Bill saved'); rerender();
}
async function togglePaid(purId) {
  if (!can(S.user.role, 'addPurchase')) return toast('Not allowed');
  const p = byId(S.cache.purchases, purId);
  if (!p) return;
  p.paymentStatus = p.paymentStatus === 'paid' ? 'pending' : 'paid';
  p.paidAt = p.paymentStatus === 'paid' ? Date.now() : null;
  await DB.put('purchases', p);
  await load(); toast(p.paymentStatus === 'paid' ? 'Marked paid ✓' : 'Marked pending'); rerender();
}
/* --------------------------- Garage setup & reset ------------------------- */
let _setupLat = null, _setupLng = null;
function sheetGarageSetup() {
  const g = S.cache.garage || {};
  _setupLat = null; _setupLng = null;
  openSheet('Garage setup', `
    <label class="field"><span class="lbl">Business name (shown to staff)</span><input id="f-gbiz" value="${esc(g.biz || g.name || '')}" placeholder="e.g. Mahalaxmi Travels"></label>
    <label class="field"><span class="lbl">Garage full name</span><input id="f-gname" value="${esc(g.name || '')}" placeholder="My Garage, Jaipur"></label>
    <div class="card" style="box-shadow:none;background:var(--tile);padding:12px">
      <div class="tiny muted" style="margin-bottom:6px">📍 Attendance geofence — staff must be within this distance of the garage to check in.</div>
      <div id="f-gloc" class="small">${g.lat != null ? `Current: ${g.lat.toFixed(5)}, ${g.lng.toFixed(5)}` : '⚠️ Not set — set it from the garage, or attendance distance will be wrong.'}</div>
      <button class="btn sm" data-act="captureGarageLoc" style="margin-top:8px">📍 Use my current location as the garage</button>
    </div>
    <div class="grid2">
      <label class="field"><span class="lbl">Geofence radius (m)</span><input id="f-gradius" type="number" inputmode="numeric" value="${g.radiusM || 200}"></label>
      <label class="field"><span class="lbl">Late after (HH:MM)</span><input id="f-gcutoff" value="${esc(g.lateCutoff || '09:30')}" placeholder="09:30"></label>
    </div>
    <label class="field"><span class="lbl">Labour rate (₹ per hour)</span><input id="f-grate" type="number" inputmode="numeric" value="${g.labourRate || DEFAULT_LABOUR_RATE}"></label>
    <button class="btn primary" data-act="saveGarage">${t('save')}</button>
    <div class="hr"></div>
    <div class="tiny muted" style="margin-bottom:8px">Setting up for your real garage? This clears the demo buses, parts, drivers, jobs and bills and starts empty.</div>
    <button class="btn" data-act="startFresh" style="color:var(--red)">🗑 Start fresh (clear demo data)</button>`);
}
async function captureGarageLocation() {
  toast('Getting location…');
  try {
    const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 8000 }));
    _setupLat = pos.coords.latitude; _setupLng = pos.coords.longitude;
    const el = $('#f-gloc'); if (el) el.textContent = `Captured: ${_setupLat.toFixed(5)}, ${_setupLng.toFixed(5)} ✓`;
    toast('Location captured ✓');
  } catch (e) { toast('Could not get location — check GPS permission'); }
}
async function saveGarage() {
  const g = Object.assign({ key: 'garage', radiusM: 200 }, S.cache.garage || {});
  g.key = 'garage';
  g.name = $('#f-gname').value.trim() || g.name || 'My Garage';
  g.biz = ($('#f-gbiz') ? $('#f-gbiz').value.trim() : '') || g.biz || g.name;
  if (_setupLat != null) { g.lat = _setupLat; g.lng = _setupLng; }
  g.radiusM = Number($('#f-gradius').value) || 200;
  const cut = $('#f-gcutoff').value.trim();
  g.lateCutoff = /^\d{1,2}:\d{2}$/.test(cut) ? cut : (g.lateCutoff || '09:30');
  g.labourRate = Number($('#f-grate') ? $('#f-grate').value : 0) || g.labourRate || DEFAULT_LABOUR_RATE;
  await DB.put('meta', g);
  _setupLat = _setupLng = null;
  await load(); closeSheet(); toast('Garage settings saved ✓'); rerender();
}
async function startFresh() {
  if (S.user.role !== 'owner') return toast('Only the owner can do this');
  if (!confirm('Clear ALL demo data (buses, parts, drivers, jobs, attendance, bills) and start empty? This cannot be undone.')) return;
  if (!confirm('Are you sure? The app will restart empty, ready for your real garage.')) return;
  await DB.clearAll();
  // Minimal real-start state: one owner + an empty garage record, marked seeded
  // so the demo seeder will NOT repopulate fake data on reload.
  await DB.put('users', { id: 'u-owner', name: 'Owner', role: 'owner' });
  await DB.put('meta', { key: 'garage', lat: null, lng: null, radiusM: 200, name: 'My Garage', biz: 'My Garage', lateCutoff: '09:30', labourRate: DEFAULT_LABOUR_RATE });
  await DB.put('meta', { key: 'seeded', value: true });
  try { localStorage.setItem('creds', JSON.stringify({ 'u-owner': '1111' })); } catch (e) { /* ignore */ }
  localStorage.setItem('demoMode', '0');   // hide demo PIN hints; don't reseed demo PINs
  toast('Cleared — restarting fresh. Owner PIN is 1111, change it in Me → Change my PIN.');
  setTimeout(() => location.reload(), 1500);
}
function sheetChangePin() {
  openSheet('Change my PIN', `
    <div class="small muted" style="margin-bottom:10px">Set a new 4-digit PIN for ${esc(S.user.name)}. You'll need to be online so it syncs to the server.</div>
    <label class="field"><span class="lbl">New 4-digit PIN</span><input id="f-newpin" inputmode="numeric" maxlength="4" placeholder="0000"></label>
    <label class="field"><span class="lbl">Confirm PIN</span><input id="f-newpin2" inputmode="numeric" maxlength="4" placeholder="0000"></label>
    <button class="btn primary" data-act="saveChangePin">Change PIN</button>`);
}
async function saveChangePin() {
  const p1 = $('#f-newpin').value.trim(), p2 = $('#f-newpin2').value.trim();
  if (!/^\d{4}$/.test(p1)) return toast('PIN must be 4 digits');
  if (p1 !== p2) return toast('PINs do not match');
  try {
    if (Sync.setPin) { await Sync.setPin(S.user.id, p1); }
    credSet(S.user.id, p1);
    closeSheet(); toast('PIN changed ✓');
  } catch (e) {
    toast('Could not reach server — connect online to change your PIN');
  }
}
function sheetSync() {
  const i = Sync.info();
  const lbl = { synced: '✅ All devices up to date', syncing: '🔄 Syncing…', offline: '⚠️ Offline — changes are queued', init: '…' }[SYNC_STATUS] || '';
  openSheet('Sync', `
    <div class="card"><div class="row between"><span class="muted small">Status</span><b>${lbl}</b></div>
      <div class="hr"></div>
      <div class="row between small"><span class="muted">This device</span><b>${esc(i.deviceId)}</b></div>
      <div class="row between small"><span class="muted">Pending to send</span><b>${i.pending}</b></div>
      <div class="row between small"><span class="muted">Last reached server</span><b>${i.lastSyncAt ? timeAgo(i.lastSyncAt) : 'never'}</b></div>
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
          <option value="mechanic">Mechanic</option><option value="store">Store</option><option value="driver">Driver</option>
          ${S.user.role === 'owner' ? '<option value="supervisor">Supervisor</option>' : ''}</select></label>
        <label class="field"><span class="lbl">4-digit PIN</span><input id="f-spin" inputmode="numeric" maxlength="4" placeholder="0000"></label>
      </div>
      <div class="tiny muted" style="margin-bottom:10px">Account is created on the server and appears on every device.</div>
      <button class="btn primary" data-act="saveStaff">Create account</button>
    </div>`);
}
async function saveStaff() {
  const name = $('#f-sname').value.trim();
  let role = $('#f-srole').value;
  const pin = $('#f-spin').value.trim();
  if (!name || !/^\d{4}$/.test(pin)) return toast('Enter a name and 4-digit PIN');
  // Only the owner may create supervisors/owners — never trust the form alone.
  if (role !== 'mechanic' && role !== 'store' && role !== 'driver' && S.user.role !== 'owner') {
    return toast('Only the owner can create that role');
  }
  try {
    const user = await Sync.addStaff({ name, role, pin });
    await DB.put('users', user);               // synced roster carries NO pin
    credSet(user.id, pin);                      // cache on this (the owner's) device only
    await load();
    closeSheet();
    toast(`${name} added — they must first sign in online on each device`);
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
  const canPay = can(S.user.role, 'addPurchase');
  body += list.length ? list.map((p) => `<div class="li">
    <div class="ava">🧾</div>
    <div class="main"><div class="t">${esc(p.supplier)} — ${money(p.amount)}</div><div class="s">${esc(p.items||'')} · ${fmtDate(p.at)}</div></div>
    ${p.paymentStatus !== 'paid' && canPay
      ? `<button class="btn sm" data-act="togglePaid" data-pur="${p.id}">Mark paid</button>`
      : `<span class="badge ${p.paymentStatus==='paid'?'b-green':'b-amber'}">${p.paymentStatus}</span>`}
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

// Billing worksheet for one company: every job on its buses, grouped by bus,
// with parts/labour/outside split and a total the owner can read off or share.
function companyJobs(company) {
  const busIds = S.cache.buses.filter((b) => b.company === company).map((b) => b.id);
  return S.cache.jobs.filter((j) => busIds.includes(j.busId));
}
function viewCompanyDetail(company) {
  const buses = S.cache.buses.filter((b) => b.company === company).sort((a, b) => a.regNo.localeCompare(b.regNo));
  const jobs = companyJobs(company);
  const grand = jobs.reduce((s, j) => s + jobCost(j).total, 0);
  let body = `<div class="card"><div class="row between"><div><div class="muted small">Lifetime repair cost</div>
      <div class="stat" style="color:var(--brand2)">${money(grand)}</div></div>
      <div style="text-align:right"><div class="tiny muted">${buses.length} bus(es) · ${jobs.length} job(s)</div></div></div>
    <button class="btn primary" data-act="shareBill" data-company="${esc(company)}" style="margin-top:10px">📤 Share / copy bill</button></div>`;
  for (const b of buses) {
    const bj = jobs.filter((j) => j.busId === b.id).sort((a, b2) => b2.createdAt - a.createdAt);
    const bt = bj.reduce((s, j) => s + jobCost(j).total, 0);
    body += `<div class="card"><div class="row between"><h3>${esc(b.regNo)}</h3><b>${money(bt)}</b></div>`;
    body += bj.length ? bj.map((j) => { const c = jobCost(j);
      return `<div class="li" data-job="${j.id}"><div class="main"><div class="t">${esc(j.problem)}</div>
        <div class="s">${fmtDate(j.createdAt)} · parts ${money(c.parts)} · labour ${money(c.labour)}${c.ext ? ' · outside ' + money(c.ext) : ''}</div></div>
        <b>${money(c.total)}</b></div>`; }).join('') : `<div class="muted small">No jobs</div>`;
    body += `</div>`;
  }
  shell(esc(company), body);
}
function companyBillText(company) {
  const buses = S.cache.buses.filter((b) => b.company === company);
  const jobs = companyJobs(company);
  const grand = jobs.reduce((s, j) => s + jobCost(j).total, 0);
  const lines = [`${BIZ} — Repair bill for ${company}`, ''];
  for (const b of buses) {
    const bj = jobs.filter((j) => j.busId === b.id);
    if (!bj.length) continue;
    lines.push(`${b.regNo}:`);
    bj.forEach((j) => lines.push(`  • ${fmtDate(j.createdAt)} ${j.problem} — ${money(jobCost(j).total)}`));
  }
  lines.push('', `TOTAL: ${money(grand)}`);
  return lines.join('\n');
}
async function shareBill(company) {
  const text = companyBillText(company);
  try {
    if (navigator.share) { await navigator.share({ title: `Bill — ${company}`, text }); return; }
  } catch (e) { /* user cancelled or unsupported → fall through to copy */ }
  try { await navigator.clipboard.writeText(text); toast('Bill copied — paste into WhatsApp'); }
  catch (e) { openSheet(`Bill — ${company}`, `<textarea style="width:100%;height:240px" readonly>${esc(text)}</textarea>`); }
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

/* ----- Mechanic: safe photo capture, request part, close-with-hours ----- */

// Lightweight full-screen busy overlay (no CSS dependency). Returns a remover.
function showBusyOverlay(msg) {
  const o = document.createElement('div');
  o.className = 'busyoverlay';
  o.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(20,24,40,.45)';
  o.innerHTML = `<div style="background:var(--surface);color:var(--text);padding:18px 22px;border-radius:16px;box-shadow:var(--shadow);font-weight:600;text-align:center">
    <div style="width:26px;height:26px;margin:0 auto 10px;border:3px solid var(--line);border-top-color:var(--brand2,#16a571);border-radius:50%;animation:gsspin .8s linear infinite"></div>
    ${esc(msg)}</div>`;
  if (!document.getElementById('gsspin-kf')) {
    const st = document.createElement('style'); st.id = 'gsspin-kf';
    st.textContent = '@keyframes gsspin{to{transform:rotate(360deg)}}';
    document.head.appendChild(st);
  }
  document.body.appendChild(o);
  return () => o.remove();
}

// Wrapper around the photo flow with spinner + offline/failure feedback.
// Does NOT modify addJobPhoto's body — it re-implements the save with UX.
async function addJobPhotoSafe(jobId, field) {
  const shot = await capturePhoto();
  if (!shot) return toast(t('photoNotCaptured'));
  const remove = showBusyOverlay(t('photoSaving'));
  try {
    const uploaded = await Sync.uploadPhoto(shot);
    const src = uploaded || shot;
    const j = byId(S.cache.jobs, jobId);
    if (!j) return;
    j[field] = [...(j[field] || []), src];
    if (j.status === 'open') j.status = 'in-progress';
    await DB.put('jobcards', j);
    await load();
    if (!uploaded) toast(t('photoSavedOnPhone'));
  } finally {
    remove();
  }
  viewJobDetail(jobId);
}

// Inline before/after photo-gate progress shown on the job card. For outside
// repairs a single bill/receipt photo satisfies the gate.
function photoGateChecklist(job) {
  const tick = (ok) => ok ? '✅' : '⬜';
  if (job.externalVendor) {
    const hasBill = (job.beforePhotos || []).length || (job.afterPhotos || []).length;
    return `<div class="small" style="margin-top:8px">${tick(hasBill)} ${t('photoGateBill')}</div>`;
  }
  const b = (job.beforePhotos || []).length, a = (job.afterPhotos || []).length;
  return `<div class="small" style="margin-top:8px">
    <div>${tick(b)} ${t('photoGateBefore')}</div>
    <div>${tick(a)} ${t('photoGateAfter')}</div></div>`;
}
function photoGateReady(job) {
  if (job.externalVendor) return !!((job.beforePhotos || []).length || (job.afterPhotos || []).length);
  return !!((job.beforePhotos || []).length && (job.afterPhotos || []).length);
}

// Mechanic-facing extras for viewJobDetail's Parts card. Supervisor owns
// viewJobDetail and adds ONE call site: partsCardExtras(j). It renders the
// "Need a part" request flow plus any pending requests and (for the assigned
// mechanic) the close-with-hours button + photo-gate checklist.
function partsCardExtras(job) {
  let h = '';
  const mine = job.assignedTo === S.user.id;
  const reqs = job.partRequests || [];
  // Request-part button: only the mechanic who can request, on a live job.
  if (can(S.user.role, 'requestPart') && job.status !== 'verified' && job.status !== 'done') {
    h += `<button class="btn sm" data-act="requestPart" data-job="${job.id}" style="margin-top:8px">🙋 ${t('reqPartBtn')}</button>`;
  }
  // Pending requests list — a store to-do; storekeepers get a Fulfil action.
  const pending = reqs.filter((r) => r.status === 'requested');
  if (pending.length) {
    h += `<div class="hr"></div><div class="lbl">${t('reqPartPending')} (${pending.length})</div>`;
    h += pending.map((r) => {
      const p = byId(S.cache.parts, r.partId);
      const fulfil = can(S.user.role, 'issuePart')
        ? `<button class="btn sm" data-act="fulfilRequest" data-job="${job.id}" data-req="${r.id}">${t('reqPartFulfil')}</button>` : '';
      return `<div class="row between small" style="padding:5px 0">
        <span>🙋 ${esc(p ? p.name : (r.partName || r.partId))} × ${r.qty || 1}</span>${fulfil}</div>`;
    }).join('');
  }
  // Photo-gate checklist + close-with-hours for the assigned mechanic.
  if (mine && (job.status === 'open' || job.status === 'in-progress')) {
    h += `<div class="hr"></div>${photoGateChecklist(job)}`;
    const ready = photoGateReady(job);
    h += `<button class="btn primary" data-act="closeJob" data-job="${job.id}" style="margin-top:8px${ready ? '' : ';opacity:.5'}"${ready ? '' : ' disabled'}>✅ ${t('closeJobBtn')}</button>`;
  }
  return h;
}

// "Need a part" sheet for mechanics — creates a lightweight request on the job.
function sheetRequestPart(jobId) {
  const j = byId(S.cache.jobs, jobId);
  if (!j) return;
  const parts = S.cache.parts;
  if (!parts.length) {
    return openSheet(t('reqPartBtn'), `<div class="banner warn">${t('reqPartNoParts')}</div>`);
  }
  const sorted = [...parts].sort((a, b) => a.name.localeCompare(b.name));
  openSheet(t('reqPartBtn'), `
    <label class="field"><span class="lbl">${t('reqPartWhich')}</span>
      <select id="f-reqpart">${sorted.map((p) => `<option value="${p.id}">${esc(p.name)} (${p.qty} ${p.unit})</option>`).join('')}</select></label>
    <label class="field"><span class="lbl">${t('reqPartQty')}</span><input id="f-reqqty" type="number" inputmode="numeric" value="1"></label>
    <div class="banner">${t('reqPartNote')}</div>
    <button class="btn primary" data-act="saveRequestPart" data-job="${jobId}">${t('submit')}</button>`);
}
async function saveRequestPart(jobId) {
  const j = byId(S.cache.jobs, jobId);
  if (!j) return;
  const partId = $('#f-reqpart').value;
  const qty = Number($('#f-reqqty').value) || 1;
  const p = byId(S.cache.parts, partId);
  j.partRequests = [...(j.partRequests || []), {
    id: uid('pr-'), partId, partName: p ? p.name : '', qty,
    status: 'requested', by: S.user.id, at: Date.now(),
  }];
  await DB.put('jobcards', j);
  await load(); closeSheet(); toast(t('reqPartSent')); viewJobDetail(jobId);
}
// Storekeeper fulfils a request: mark it fulfilled and open the existing
// issue-part sheet preset to this job (preserves anti-pilferage via issuePart).
async function fulfilRequest(jobId, reqId) {
  const j = byId(S.cache.jobs, jobId);
  if (!j) return;
  const r = (j.partRequests || []).find((x) => x.id === reqId);
  if (r) { r.status = 'fulfilled'; r.fulfilledBy = S.user.id; r.fulfilledAt = Date.now(); await DB.put('jobcards', j); await load(); }
  sheetIssue(jobId);
}

// Close-with-hours: a NEW path so markDone stays untouched. Prompts for the
// real labour hours via a +/- stepper, sets labourHours, then status='done'.
function sheetCloseJob(jobId) {
  const j = byId(S.cache.jobs, jobId);
  if (!j) return;
  if (!photoGateReady(j)) {
    return openSheet(t('closeJobBtn'), `<div class="banner warn">⚠️ ${t('addPhotoNote')}</div>`);
  }
  const hrs = j.labourHours || 2;
  openSheet(t('closeJobBtn'), `
    <div class="lbl">${t('closeJobHours')}</div>
    <div class="row" style="gap:14px;align-items:center;justify-content:center;margin:10px 0">
      <button class="btn" data-act="hrsStep" data-dir="-1" style="font-size:24px;min-width:56px">−</button>
      <b id="f-hrs" data-hrs="${hrs}" style="font-size:32px;min-width:64px;text-align:center">${hrs}</b>
      <button class="btn" data-act="hrsStep" data-dir="1" style="font-size:24px;min-width:56px">＋</button>
    </div>
    <div class="tiny muted" style="text-align:center">${t('closeJobHint')}</div>
    <button class="btn primary" data-act="confirmCloseJob" data-job="${jobId}" style="margin-top:12px">✅ ${t('markDone')}</button>`);
}
function hrsStep(dir) {
  const el = $('#f-hrs'); if (!el) return;
  let v = Number(el.getAttribute('data-hrs')) || 0;
  v = Math.max(0.5, Math.round((v + (Number(dir) * 0.5)) * 2) / 2);
  el.setAttribute('data-hrs', v); el.textContent = v;
}
async function confirmCloseJob(jobId) {
  const j = byId(S.cache.jobs, jobId);
  if (!j) return;
  if (!photoGateReady(j)) { closeSheet(); return toast(t('photoGateBefore')); }
  const el = $('#f-hrs');
  j.labourHours = el ? (Number(el.getAttribute('data-hrs')) || j.labourHours || 0) : (j.labourHours || 0);
  j.status = 'done'; j.closedAt = Date.now();
  await DB.put('jobcards', j);
  await load(); closeSheet(); toast(t('closeJobDone')); viewJobDetail(jobId);
}

async function markDone(jobId) {
  const j = byId(S.cache.jobs, jobId);
  if (j.externalVendor) {
    // Outside repair: there is no in-house before/after work to photograph.
    // Require at least one proof photo (the vendor's bill/receipt) instead.
    if (!(j.beforePhotos || []).length && !(j.afterPhotos || []).length) {
      return toast('⚠️ Add a bill/receipt photo from the vendor first');
    }
  } else if (!(j.beforePhotos || []).length || !(j.afterPhotos || []).length) {
    return toast('⚠️ Add before AND after photos first');
  }
  j.status = 'done'; j.closedAt = Date.now();
  await DB.put('jobcards', j);
  await load(); toast('Marked done — waiting for verify'); viewJobDetail(jobId);
}
async function verifyJob(jobId) {
  if (!can(S.user.role, 'verifyJob')) return toast('Not allowed');
  const j = byId(S.cache.jobs, jobId);
  // Verification = signing off that the work is real. Enforce the same proof
  // rule as Mark Done so nobody can verify a job with no evidence.
  const hasProof = j.externalVendor
    ? ((j.beforePhotos || []).length || (j.afterPhotos || []).length)
    : (j.afterPhotos || []).length;
  if (!hasProof) return toast(j.externalVendor ? '⚠️ Add the vendor bill photo before verifying' : '⚠️ Needs an after photo before you can verify');
  j.status = 'verified'; j.verifiedBy = S.user.id; j.verifiedAt = Date.now();
  if (!j.closedAt) j.closedAt = Date.now();
  await DB.put('jobcards', j);
  // Resolve any driver reports this job addressed — closes the loop for the driver.
  for (const r of (S.cache.driverreports || [])) {
    if (r.jobId === jobId && r.status === 'open') { r.status = 'addressed'; r.resolvedAt = Date.now(); await DB.put('driverreports', r); }
  }
  await load(); toast('Verified ✓'); viewJobDetail(jobId);
}
// Send a "done" job back to the mechanic for rework instead of verifying.
async function rejectJob(jobId) {
  if (!can(S.user.role, 'verifyJob')) return toast('Not allowed');
  const j = byId(S.cache.jobs, jobId);
  if (!confirm('Send this job back to the mechanic for rework?')) return;
  j.status = 'in-progress'; j.closedAt = null;
  await DB.put('jobcards', j);
  await load(); toast('Sent back for rework'); viewJobDetail(jobId);
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
  const isLive = tel.source === 'provider';
  el.innerHTML = `
    ${isLive
      ? `<div class="banner" style="background:#e7f7ef;color:#16a571">🛰️ Live from ${esc(GpsProvider.name)}</div>`
      : `<div class="banner warn">⚠️ Demo GPS — simulated, not the real bus. Live position shows once ${esc(GpsProvider.name)} is pushing telemetry for this bus.</div>`}
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
      ${can(S.user.role, 'logService') ? `<div class="hr"></div>
      <button class="btn primary" data-act="logService" data-bus="${b.id}">✅ Mark service done</button>` : ''}
    </div>
    <button class="btn ghost" data-act="gps" data-bus="${b.id}">↻ Refresh</button>`;
}
function logService(busId) {
  if (!can(S.user.role, 'logService')) return toast('Not allowed');
  const b = byId(S.cache.buses, busId);
  openSheet('Log service done', `
    <div class="grid2">
      <label class="field"><span class="lbl">Odometer now (km)</span><input id="f-svodo" type="number" inputmode="numeric" value="${b.odometer || 0}"></label>
      <label class="field"><span class="lbl">Labour hours</span><input id="f-svhrs" type="number" inputmode="decimal" value="2"></label>
    </div>
    <label class="field"><span class="lbl">Parts / external cost (₹, optional)</span><input id="f-svcost" type="number" inputmode="numeric"></label>
    <label class="field"><span class="lbl">Notes</span><input id="f-svnote" placeholder="e.g. oil + filter changed"></label>
    <button class="btn primary" data-act="confirmLogService" data-bus="${busId}">✅ Log service</button>`);
}
async function confirmLogService(busId) {
  if (!can(S.user.role, 'logService')) return toast('Not allowed');
  const b = byId(S.cache.buses, busId);
  const odo = Number($('#f-svodo').value) || b.odometer || 0;
  const hrs = Number($('#f-svhrs').value) || 0;
  const cost = Number($('#f-svcost').value) || 0;
  b.odometer = Math.max(b.odometer || 0, odo);   // never let a reading go backwards
  b.lastServiceOdo = odo; b.lastServiceDate = Date.now();
  await DB.put('buses', b);
  // Record it in the bus history so cost & audit trail stay complete.
  await DB.put('jobcards', {
    id: uid('j-'), busId, problem: `Scheduled service @ ${odo.toLocaleString('en-IN')} km (every ${(b.serviceIntervalKm || SERVICE_INTERVAL_KM).toLocaleString('en-IN')} km)`,
    priority: 'low', status: 'verified', reportedBy: S.user.id, assignedTo: S.user.id,
    beforePhotos: [], afterPhotos: [], partsUsed: [], labourHours: hrs, externalVendor: '', externalCost: cost,
    notes: ($('#f-svnote').value.trim() || 'Preventive service logged'), createdAt: Date.now(), closedAt: Date.now(),
    verifiedBy: S.user.id, verifiedAt: Date.now(),
  });
  await load(); closeSheet(); toast('Service logged ✓'); rerender();
}

/* ------------------------------- Drivers ---------------------------------- */
function driverLi(d) {
  const score = driverScore(d.id), bus = byId(S.cache.buses, d.busId);
  return `<div class="li" data-driver="${d.id}"><div class="ava">🧑‍✈️</div>
    <div class="main"><div class="t">${esc(d.name)}</div>
      <div class="s">${bus ? esc(bus.regNo) : 'unassigned'} · ${d.tripsLogged || 0} trips</div></div>
    <div style="text-align:right"><span class="badge ${scoreClass(score)}">${score}</span>
      <div class="stars">${starStr(scoreStars(score))}</div></div></div>`;
}
function viewDrivers() {
  const list = [...(S.cache.drivers || [])].sort((a, b) => driverScore(a.id) - driverScore(b.id)); // worst first
  let body = '';
  if (can(S.user.role, 'assignDriver')) {
    body += `<button class="btn" data-act="openAssignments" style="margin-bottom:12px">🔁 Driver ↔ Bus assignments</button>`;
  }
  body += `<div class="card">${list.length ? list.map(driverLi).join('') : '<div class="empty">No drivers yet</div>'}</div>`;
  shell('Drivers', body, can(S.user.role, 'addBus') ? { act: 'addDriver', icon: '+' } : null);
}

// Dedicated one-screen view of who drives what — reassign in one place.
function viewAssignments() {
  const drivers = [...(S.cache.drivers || [])].sort((a, b) => a.name.localeCompare(b.name));
  const buses = S.cache.buses;
  let body = `<div class="card"><div class="tiny muted">Tap a driver to change their bus, or tap a driverless bus to assign one. Each bus has at most one driver.</div></div>`;
  body += `<div class="card"><div class="row between"><h3>Drivers</h3><span class="badge b-low">${drivers.length}</span></div>`;
  body += drivers.length ? drivers.map((d) => {
    const bus = byId(buses, d.busId);
    return `<div class="li" data-act="assignBus" data-driver="${d.id}" style="cursor:pointer"><div class="ava">🧑‍✈️</div>
      <div class="main"><div class="t">${esc(d.name)}</div><div class="s">${bus ? esc(bus.regNo) + ' · ' + esc(bus.company) : 'no bus assigned'}</div></div>
      <span class="badge ${bus ? 'b-green' : 'b-amber'}">${bus ? 'assigned' : 'unassigned'}</span></div>`;
  }).join('') : `<div class="empty">No drivers yet</div>`;
  body += `</div>`;
  const driverless = buses.filter((b) => !driverOfBus(b.id));
  body += `<div class="card"><div class="row between"><h3>Buses without a driver</h3><span class="badge ${driverless.length ? 'b-amber' : 'b-green'}">${driverless.length}</span></div>`;
  body += driverless.length ? driverless.map((b) => `<div class="li" data-act="assignDriver" data-bus="${b.id}" style="cursor:pointer"><div class="ava">🚌</div>
    <div class="main"><div class="t">${esc(b.regNo)}</div><div class="s">${esc(b.company)} · ${esc(b.model || '')}</div></div>
    <span class="badge b-amber">assign →</span></div>`).join('') : `<div class="muted small">Every bus has a driver 👍</div>`;
  body += `</div>`;
  shell('Driver ↔ Bus', body);
}

function viewDriverDetail(id) {
  const d = driverById(id);
  if (!d) return viewDrivers();
  const bus = byId(S.cache.buses, d.busId), score = driverScore(id);
  const incs = driverIncidents(id).sort((a, b) => b.at - a.at);
  const reps = (S.cache.driverreports || []).filter((r) => r.driverId === id).sort((a, b) => b.at - a.at);
  const byType = {}; incs.forEach((i) => { byType[i.type] = (byType[i.type] || 0) + 1; });

  let body = `<div class="card"><div class="row">
      <div class="ava" style="width:52px;height:52px;font-size:26px">🧑‍✈️</div>
      <div style="flex:1"><div style="font-weight:800;font-size:17px">${esc(d.name)}</div>
        <div class="small muted">${esc(d.phone || '')} · ${esc(d.license || '')}</div></div>
      <span class="badge ${scoreClass(score)}">${score}/100</span></div>
    <div class="hr"></div>
    <div class="row between"><div><div class="tiny muted">Assigned bus</div><b>${bus ? esc(bus.regNo) : '—'}</b></div>
      <div style="text-align:right"><div class="tiny muted">Rating</div><div class="stars">${starStr(scoreStars(score))}</div></div></div>
    <div class="spacer"></div>
    <div class="btnrow"><button class="btn sm" data-act="assignBus" data-driver="${d.id}">Change bus</button>
      <button class="btn sm" data-act="reportProblem" data-bus="${d.busId || ''}" data-driver="${d.id}">Log report</button></div></div>`;

  body += `<div class="card"><div class="row between"><h3>Performance</h3>
    <button class="btn sm" data-act="addIncident" data-driver="${d.id}">+ Data point</button></div>`;
  if (Object.keys(byType).length) body += `<div class="row" style="flex-wrap:wrap;gap:6px;margin-bottom:10px">${
    Object.entries(byType).map(([tp, n]) => { const c = INCIDENT[tp] || INCIDENT.other; return `<span class="badge b-low">${c.icon} ${c.label} ×${n}</span>`; }).join('')}</div>`;
  body += incs.length ? incs.map((i) => { const c = INCIDENT[i.type] || INCIDENT.other;
    return `<div class="li"><div class="ava">${c.icon}</div><div class="main">
      <div class="t">${c.label}${i.cost ? ` · ${money(i.cost)}` : ''}</div>
      <div class="s">${esc(i.note || '')} · ${fmtDate(i.at)}</div></div><span class="badge b-red">-${c.pen}</span></div>`; }).join('')
    : `<div class="muted small">Clean record 👍</div>`;
  body += `</div>`;

  body += `<div class="card"><h3>Trip reports</h3>`;
  body += reps.length ? reps.map((r) => `<div class="li" ${r.jobId ? `data-job="${r.jobId}"` : ''}>
      <div class="ava">${r.status === 'open' ? '🟠' : '✅'}</div>
      <div class="main"><div class="t">${esc(r.problem)}</div><div class="s">${esc(r.category || '')} · ${fmtDate(r.at)}</div></div>
      ${r.status !== 'open' ? '<span class="badge b-green">fixed</span>'
        : r.jobId ? '<span class="badge b-amber">linked</span>'
        : `<button class="btn sm" data-act="reportToJob" data-report="${r.id}">→ Job</button>`}</div>`).join('')
    : `<div class="muted small">No reports.</div>`;
  body += `</div>`;
  shell(esc(d.name), body);
}

// One plain-language self-coaching sentence for the driver's biggest deduction.
// byType is { incidentType: count } over the scoring window; reused by viewDriverHome.
function coachingLine(score, byType) {
  if (score >= 100) return t('drvCleanRecord');
  const entries = Object.entries(byType);
  if (entries.length) {
    // Top deduction = the type costing the most points (count × penalty).
    const top = entries.sort((a, b) => (b[1] * (INCIDENT[b[0]] || INCIDENT.other).pen) - (a[1] * (INCIDENT[a[0]] || INCIDENT.other).pen))[0][0];
    const tipKey = 'drvTip_' + top;
    if (I18N.en[tipKey]) return t(tipKey);
  }
  return score >= 85 ? t('drvTipGreat') : score >= 70 ? t('drvTipGood') : t('drvTipLow');
}

// Driver's own home (role 'driver') — their bus, rating, and report button.
function viewDriverHome() {
  const d = driverForUser(S.user.id);
  if (!d) { shell(t('myTrips'), `<div class="card"><div class="empty">${t('noBusAssigned')}</div></div>`); return; }
  const bus = byId(S.cache.buses, d.busId), score = driverScore(d.id);
  let body = `<div class="greet"><div class="greet-av">🧑‍✈️</div>
    <div><div class="greet-hi">${t('namaste')}, ${esc(d.name)} 👋</div><div class="muted small">${esc(BIZ)} · ${fmtToday()}</div></div></div>`;
  if (bus) body += `<div class="hero cover"><img src="${busImg(bus)}" alt="">
    <div class="hero-cap"><div class="hero-t">${esc(bus.regNo)}</div><div class="hero-s">${t('myBus')}</div></div></div>`;
  // Explain the score so it isn't a mystery number: what pulled it down + a tip.
  const recent = driverIncidents(d.id).filter((i) => i.at >= Date.now() - 90 * day);
  const byType = {}; recent.forEach((i) => { byType[i.type] = (byType[i.type] || 0) + 1; });
  const reasons = Object.entries(byType).map(([tp, n]) => { const c = INCIDENT[tp] || INCIDENT.other; return `${c.icon} ${c.label} ×${n}`; }).join(' · ');
  const tip = coachingLine(score, byType);
  body += `<div class="card tile"><div class="row between">
      <div><div class="muted small">${t('yourRating')}</div><div class="stat">${score}<span style="font-size:14px"> /100</span></div></div>
      <div style="text-align:right"><div class="stars big">${starStr(scoreStars(score))}</div><div class="tiny muted">${d.tripsLogged || 0} ${t('trips')}</div></div></div>
      <div class="tiny muted" style="margin-top:8px">${recent.length ? `${t('drvLast90')}: ${reasons}. ` : ''}${tip}</div></div>`;
  if (d.busId) {
    body += `<button class="btn primary" data-act="reportProblem" data-bus="${d.busId}" data-driver="${d.id}">🛠️ ${t('reportProblem')}</button><div class="spacer"></div>`;
  } else {
    body += `<div class="banner warn">${t('noBusAssigned')}</div><div class="spacer"></div>`;
  }
  const reps = (S.cache.driverreports || []).filter((r) => r.driverId === d.id && r.status !== 'cancelled').sort((a, b) => b.at - a.at);
  body += `<div class="card"><h3>${t('myReports')}</h3>`;
  body += reps.length ? reps.map((r) => {
    const resolved = r.status !== 'open';
    // Resolved + linked → tap through to the job (route is permission-safe for drivers).
    const tap = (resolved && r.jobId) ? ` data-job="${r.jobId}" style="cursor:pointer"` : '';
    const sub = resolved
      ? `${esc(r.category || '')} · ${t('fixed')}${r.resolvedAt ? ' · ' + fmtDate(r.resolvedAt) : ''}`
      : `${esc(r.category || '')} · ${fmtDate(r.at)}`;
    // Driver can take back an OPEN, not-yet-linked report.
    const right = resolved
      ? `<span class="badge b-green">${t('fixed')}</span>`
      : (r.jobId ? `<span class="badge b-amber">${t('openStatus')}</span>`
        : `<button class="btn sm" data-act="cancelReport" data-report="${r.id}">${t('drvCancelBtn')}</button>`);
    return `<div class="li"${tap}><div class="ava">${resolved ? '✅' : '🟠'}</div>
      <div class="main"><div class="t">${esc(r.problem)}</div><div class="s">${sub}</div></div>
      ${right}</div>`;
  }).join('')
    : `<div class="muted small">${t('noReportsYet')}</div>`;
  body += `</div>`;
  shell(t('myTrips'), body);
}

/* ----- Driver sheets ----- */
function sheetAddDriver() {
  const buses = S.cache.buses;
  openSheet('Add driver', `
    <label class="field"><span class="lbl">Name</span><input id="f-dname" placeholder="e.g. Ramlal"></label>
    <div class="grid2">
      <label class="field"><span class="lbl">Phone</span><input id="f-dphone" inputmode="tel"></label>
      <label class="field"><span class="lbl">Licence no.</span><input id="f-dlic"></label>
    </div>
    <label class="field"><span class="lbl">Assign to bus</span><select id="f-dbus"><option value="">— unassigned —</option>${buses.map((b) => `<option value="${b.id}">${esc(b.regNo)} — ${esc(b.company)}</option>`).join('')}</select></label>
    <label class="field"><span class="lbl">App login PIN (optional — lets the driver report problems)</span><input id="f-dpin" inputmode="numeric" maxlength="4" placeholder="4 digits, or leave blank"></label>
    <button class="btn primary" data-act="saveDriver">Save</button>`);
}
async function saveDriver() {
  const name = $('#f-dname').value.trim();
  if (!name) return toast('Enter a name');
  const busId = $('#f-dbus').value || null, pin = $('#f-dpin').value.trim();
  if (pin && !/^\d{4}$/.test(pin)) return toast('PIN must be 4 digits');
  // Save the driver record FIRST — the optional app login is a bonus, not a
  // gate. A server hiccup must never lose the driver the user just entered.
  const driver = { id: uid('d-'), name, phone: $('#f-dphone').value.trim(), license: $('#f-dlic').value.trim(), busId, userId: null, tripsLogged: 0, joinedAt: Date.now(), photo: '' };
  await DB.put('drivers', driver);
  let loginMsg = '';
  if (pin) {
    try {
      const u = await Sync.addStaff({ name: name + ' (Driver)', role: 'driver', pin });
      driver.userId = u.id; credSet(u.id, pin); await DB.put('users', u); await DB.put('drivers', driver);
    } catch (e) {
      loginMsg = Sync.info().authed ? ' (login not created — server unreachable)' : ' (login needs you online — add a PIN later)';
    }
  }
  await load(); closeSheet(); toast('Driver added' + loginMsg); rerender();
}
function sheetAssignBus(driverId) {
  const d = driverById(driverId), buses = S.cache.buses;
  openSheet('Assign bus', `<label class="field"><span class="lbl">Bus for ${esc(d.name)}</span>
    <select id="f-abus"><option value="">— unassigned —</option>${buses.map((b) => `<option value="${b.id}" ${b.id === d.busId ? 'selected' : ''}>${esc(b.regNo)}</option>`).join('')}</select></label>
    <button class="btn primary" data-act="saveAssignBus" data-driver="${driverId}">Save</button>`);
}
async function saveAssignBus(driverId) {
  const d = driverById(driverId); const busId = $('#f-abus').value || null;
  if (busId) for (const o of (S.cache.drivers || [])) { if (o.id !== driverId && o.busId === busId) { o.busId = null; await DB.put('drivers', o); } }
  d.busId = busId; await DB.put('drivers', d);
  await load(); closeSheet(); toast('Updated'); rerender();
}
function sheetAssignDriverToBus(busId) {
  const ds = S.cache.drivers || [], cur = driverOfBus(busId);
  openSheet('Assign driver', `<label class="field"><span class="lbl">Driver for this bus</span>
    <select id="f-adrv"><option value="">— none —</option>${ds.map((d) => `<option value="${d.id}" ${cur && cur.id === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></label>
    <button class="btn primary" data-act="saveAssignDriver" data-bus="${busId}">Save</button>`);
}
async function saveAssignDriver(busId) {
  const id = $('#f-adrv').value;
  for (const d of (S.cache.drivers || [])) { if (d.busId === busId && d.id !== id) { d.busId = null; await DB.put('drivers', d); } }
  if (id) { const d = driverById(id); d.busId = busId; await DB.put('drivers', d); }
  await load(); closeSheet(); toast('Driver assigned'); rerender();
}
let _incPhoto = '';
function sheetIncident(driverId) {
  openSheet('Add data point', `
    <label class="field"><span class="lbl">Type</span><select id="f-itype">${Object.entries(INCIDENT).map(([k, v]) => `<option value="${k}">${v.icon} ${v.label} (-${v.pen})</option>`).join('')}</select></label>
    <label class="field"><span class="lbl">Note</span><input id="f-inote" placeholder="e.g. left rear panel"></label>
    <label class="field"><span class="lbl">Repair cost (₹, optional)</span><input id="f-icost" type="number" inputmode="numeric"></label>
    <div id="f-iphoto"></div><button class="btn" data-act="incidentPhoto">📷 Add photo</button>
    <div class="spacer"></div>
    <button class="btn primary" data-act="saveIncident" data-driver="${driverId}">Save</button>`);
}
async function saveIncident(driverId) {
  const d = driverById(driverId);
  await DB.put('incidents', { id: uid('inc-'), driverId, busId: d.busId, type: $('#f-itype').value, note: $('#f-inote').value.trim(), cost: Number($('#f-icost').value) || 0, photo: _incPhoto, at: Date.now(), by: S.user.id });
  _incPhoto = ''; await load(); closeSheet(); toast('Recorded'); rerender();
}
// Stable English category values (stored on the report so analytics/linking
// keep working) paired with an icon + i18n key for the big tappable tiles.
const REPORT_CATS = [
  { val: 'Brakes',     icon: '🛑', key: 'catBrakes' },
  { val: 'Engine',     icon: '⚙️', key: 'catEngine' },
  { val: 'AC',         icon: '❄️', key: 'catAC' },
  { val: 'Suspension', icon: '🪛', key: 'catSuspension' },
  { val: 'Electrical', icon: '🔌', key: 'catElectrical' },
  { val: 'Tyres',      icon: '🛞', key: 'catTyres' },
  { val: 'Gearbox',    icon: '🔧', key: 'catGearbox' },
  { val: 'Body',       icon: '🚌', key: 'catBody' },
  { val: 'Other',      icon: '•',  key: 'catOther' },
];
let _reportPhoto = '';
function sheetTripReport(busId, driverId) {
  const bus = byId(S.cache.buses, busId);
  _reportPhoto = '';
  const tiles = REPORT_CATS.map((c, i) => `<button type="button" class="cat-tile${i === 0 ? ' on' : ''}" data-act="pickReportCat" data-cat="${c.val}">
      <span class="cat-ic">${c.icon}</span><span class="cat-lb">${t(c.key)}</span></button>`).join('');
  openSheet(t('reportProblem'), `
    ${bus ? `<div class="small muted" style="margin-bottom:10px">${t('myBus')}: <b>${esc(bus.regNo)}</b></div>` : `<div class="banner warn">${t('noBusAssigned')}</div>`}
    <input type="hidden" id="f-rcat" value="Brakes">
    <span class="lbl">${t('reportArea')}</span>
    <div class="cat-grid" id="f-rcat-grid">${tiles}</div>
    <label class="field"><span class="lbl">${t('reportWhat')}</span><textarea id="f-rprob" placeholder="e.g. brakes weak on slopes, noise from rear"></textarea></label>
    <div class="btnrow">
      <button class="btn" data-act="reportPhoto">📷 ${t('drvPhotoBtn')}</button>
      <button class="btn" id="f-rvoice" data-act="reportVoice">🎤 ${t('drvVoiceBtn')}</button>
    </div>
    <div id="f-rphoto" style="margin-top:8px"></div>
    <div class="tiny muted" style="margin-top:6px">${t('drvAttachHint')}</div>
    <div class="spacer"></div>
    <button class="btn primary" data-act="saveReport" data-bus="${busId}" data-driver="${driverId || ''}">${t('submit')}</button>`);
}
// Single-select highlight for the category tiles → writes the stable English
// value into the hidden #f-rcat field that saveReport reads.
function pickReportCat(val) {
  const f = $('#f-rcat'); if (f) f.value = val;
  document.querySelectorAll('#f-rcat-grid .cat-tile').forEach((b) => b.classList.toggle('on', b.getAttribute('data-cat') === val));
}
async function reportCapturePhoto() {
  const shot = await capturePhoto();
  if (!shot) return toast(t('drvPhotoFail'));
  _reportPhoto = await Sync.uploadPhoto(shot) || shot;
  const el = $('#f-rphoto'); if (el) el.innerHTML = `<img class="thumb" src="${_reportPhoto}">`;
}
// Web Speech dictation into the problem textarea (graceful no-op if unsupported).
let _reportRecog = null;
function reportVoiceDictate() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return toast(t('drvVoiceUnsupported'));
  if (_reportRecog) { try { _reportRecog.stop(); } catch (e) {} _reportRecog = null; return; }
  const rec = new SR();
  rec.lang = LANG === 'hi' ? 'hi-IN' : 'en-IN';
  rec.interimResults = false; rec.continuous = false;
  const btn = $('#f-rvoice'); if (btn) btn.classList.add('rec');
  rec.onresult = (ev) => {
    const said = Array.from(ev.results).map((r) => r[0].transcript).join(' ').trim();
    const ta = $('#f-rprob'); if (ta && said) ta.value = (ta.value ? ta.value + ' ' : '') + said;
  };
  const done = () => { if (btn) btn.classList.remove('rec'); _reportRecog = null; };
  rec.onerror = done; rec.onend = done;
  _reportRecog = rec; try { rec.start(); } catch (e) { done(); }
}
async function saveReport(busId, driverId) {
  const prob = $('#f-rprob').value.trim();
  if (!busId) return toast(t('drvNoBus'));
  // Relax the text guard: a photo or a voice-dictated note can stand in for typed text.
  if (!prob && !_reportPhoto) return toast(t('drvNeedDetail'));
  const drv = driverId || (driverOfBus(busId) || {}).id || null;
  await DB.put('driverreports', { id: uid('dr-'), driverId: drv, busId, category: ($('#f-rcat') || {}).value || 'Other', problem: prob || `(${t('drvPhotoBtn')})`, photo: _reportPhoto || '', at: Date.now(), status: 'open', jobId: null, resolvedAt: null });
  _reportPhoto = '';
  await load(); closeSheet(); toast(t('reportSubmitted')); rerender();
}
// Driver can take back a mistaken OPEN report — blocked once a job is linked.
async function cancelReport(reportId) {
  const r = byId(S.cache.driverreports, reportId);
  if (!r) return;
  if (r.jobId) return toast(t('drvCancelBlocked'));
  if (r.status !== 'open') return;
  if (!confirm(t('drvCancelConfirm'))) return;
  r.status = 'cancelled'; r.resolvedAt = Date.now();
  await DB.put('driverreports', r);
  await load(); toast(t('drvCancelled')); rerender();
}
function createJobFromReport(reportId) {
  const r = byId(S.cache.driverreports, reportId);
  if (!r) return;
  sheetAddJob({ busId: r.busId, problem: r.problem, reportId, category: r.category });
}

/* ===================== On-Time Pickup: routes, geofences, ETA, punctuality ==
 * Each bus has a route = ordered geofenced stops, each with a daily "go-time".
 * Live AirFi GPS drives three things:
 *   1) Punctuality   — capture the actual arrival time at each stop vs schedule.
 *   2) Auto-learn    — the schedule fills itself in from past arrivals (median).
 *   3) Predict       — ~15 min before a stop is due, warn owner/supervisor if a
 *                      live ETA (from GPS position + speed) says the bus is at risk.
 * The depot is the garage geofence (stop 0) so we can see WHERE a delay starts.
 */
const hhmmToMin = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(s || ''); return m ? (+m[1]) * 60 + (+m[2]) : null; };
const minToHhmm = (n) => { n = ((Math.round(n) % 1440) + 1440) % 1440; return String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0'); };
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const todayKey = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const routeForBus = (busId) => (S.cache.routes || []).find((r) => r.busId === busId) || null;

// Auto-learned scheduled minute for a stop: median actual-arrival over the last
// 21 days from the trip log. Manual schedTime (if set) always overrides.
function learnedMin(stopId) {
  const since = Date.now() - 21 * day;
  const mins = (S.cache.triplog || []).filter((t) => t.stopId === stopId && t.at >= since && t.actualMin != null)
    .map((t) => t.actualMin).sort((a, b) => a - b);
  if (!mins.length) return null;
  const mid = Math.floor(mins.length / 2);
  return mins.length % 2 ? mins[mid] : Math.round((mins[mid - 1] + mins[mid]) / 2);   // true median
}
const stopSched = (stop) => { const m = hhmmToMin(stop.schedTime); return m != null ? m : learnedMin(stop.id); };
const stopArrivalToday = (stopId) => (S.cache.triplog || []).find((t) => t.stopId === stopId && t.day === todayKey()) || null;
function stopPunctuality(stop) {
  const logs = (S.cache.triplog || []).filter((t) => t.stopId === stop.id && t.deltaMin != null);
  if (!logs.length) return { n: 0, onTime: null, avgLate: 0 };   // no scheduled history yet
  const late = logs.filter((t) => t.deltaMin > 3).length;
  const avgLate = Math.round(logs.reduce((s, t) => s + Math.max(0, t.deltaMin), 0) / logs.length);
  return { n: logs.length, onTime: Math.round((logs.length - late) / logs.length * 100), avgLate };
}

// Capture geofence arrivals from a live fix: if the bus is inside a stop's
// radius and we haven't logged it today, record actual time + delta vs schedule.
async function captureArrivals(bus, tel) {
  const route = routeForBus(bus.id);
  if (!route || !tel || tel.lat == null) return false;
  let changed = false;
  for (const stop of route.stops || []) {
    if (stopArrivalToday(stop.id)) continue;
    if (haversineM(tel.lat, tel.lng, stop.lat, stop.lng) <= (stop.radiusM || 150)) {
      const sched = stopSched(stop), aMin = nowMin();
      let delta = null;
      if (sched != null) { delta = aMin - sched; if (delta > 720) delta -= 1440; else if (delta < -720) delta += 1440; }
      const row = { id: uid('tl-'), routeId: route.id, busId: bus.id, stopId: stop.id,
        day: todayKey(), at: Date.now(), actualMin: aMin, scheduledMin: sched,
        deltaMin: delta, source: tel.source || 'unknown' };
      await DB.put('triplog', row);
      (S.cache.triplog = S.cache.triplog || []).push(row);   // reflect immediately so we never double-log
      changed = true;
    }
  }
  return changed;
}

// Risk for a bus's NEXT pending stop today: predicts lateness from live GPS.
function routeRisk(bus, tel) {
  const route = routeForBus(bus.id);
  if (!route || !(route.stops || []).length) return null;
  // Without a live position we can't predict — don't fire false alerts.
  if (!tel || tel.lat == null) return null;
  const next = (route.stops || []).find((s) => !stopArrivalToday(s.id) && stopSched(s) != null);
  if (!next) return null;
  const sched = stopSched(next), mins = nowMin(), within = sched - mins;
  // Warning window: due within 15 min, or up to ~2h overdue. Outside that it's
  // not this morning's pickup (avoids late-night false alerts for tomorrow's run).
  if (within > 15 || within < -120) return null;
  const distKm = haversineM(tel.lat, tel.lng, next.lat, next.lng) / 1000;
  const etaMin = mins + Math.round(distKm / Math.max(tel.speedKph || 0, 8) * 60);   // honour slow/traffic speed
  let reason = '';
  if (!tel.ignition && distKm > 0.25) reason = 'engine still off';
  else if (distKm > 0.25 && (tel.speedKph || 0) < 3) reason = 'not moving';
  const late = within < 0 || etaMin > sched + 3 || (!!reason && within <= 10);
  if (!late) return null;
  return { stop: next, sched, etaMin, within, reason };
}

let _routeMonitorOn = false, _riskAlerted = {};
async function checkRoutes(opts = {}) {
  const buses = (S.cache.buses || []).filter((b) => routeForBus(b.id));
  let changed = false, gpsOffline = false; const risks = [];
  for (const b of buses) {
    let tel = null; try { tel = await GpsProvider.live(b); } catch (e) { gpsOffline = true; }
    if (await captureArrivals(b, tel)) changed = true;
    const r = routeRisk(b, tel);
    if (r) risks.push({ bus: b, ...r });
  }
  if (changed) await load();
  const risksChanged = risks.length !== (S.routeRisks || []).length;
  S.routeRisks = risks; S.routeGpsOffline = gpsOffline && buses.length > 0;
  if (opts.alert && S.user && can(S.user.role, 'manageRoutes')) {
    for (const r of risks) {
      if (_riskAlerted[r.stop.id] === todayKey()) continue;
      _riskAlerted[r.stop.id] = todayKey();
      toast(`⚠️ ${busName(r.bus.id)} may be late to ${r.stop.name}${r.etaMin != null ? ' · ETA ' + minToHhmm(r.etaMin) : ''}`);
    }
  }
  if ((changed || risksChanged) && S.user && !document.querySelector('.sheetwrap')) rerender();
  return risks;
}
function startRouteMonitor() {
  if (_routeMonitorOn) return;
  _routeMonitorOn = true;
  setInterval(() => { if (S.user && (S.cache.routes || []).length) checkRoutes({ alert: true }); }, 60000);
}

/* ----- Routes UI ----- */
function routeStatusBadge(stop) {
  const a = stopArrivalToday(stop.id);
  if (a && a.deltaMin != null) {
    const d = a.deltaMin;
    return d > 3 ? `<span class="badge b-red">${d}m late</span>`
      : d < -1 ? `<span class="badge b-green">${-d}m early</span>` : `<span class="badge b-green">on time</span>`;
  }
  if (a) return `<span class="badge b-low">arrived ${minToHhmm(a.actualMin)}</span>`;
  const risk = (S.routeRisks || []).find((r) => r.stop.id === stop.id);
  if (risk) return `<span class="badge b-amber">at risk${risk.etaMin != null ? ' · ETA ' + minToHhmm(risk.etaMin) : ''}</span>`;
  return `<span class="badge b-low">pending</span>`;
}
function viewRoutes() {
  const buses = [...S.cache.buses].sort((a, b) => a.regNo.localeCompare(b.regNo));
  const risks = S.routeRisks || [];
  let body = '';
  if (risks.length) {
    body += `<div class="card" style="border:1.5px solid var(--amber)"><div class="row between"><h3>⚠️ Pickups at risk now</h3><span class="badge b-amber">${risks.length}</span></div>`;
    body += risks.map((r) => `<div class="li" data-routebus="${r.bus.id}"><div class="ava">🚍</div>
      <div class="main"><div class="t">${esc(busName(r.bus.id))} → ${esc(r.stop.name)}</div>
      <div class="s">due ${minToHhmm(r.sched)}${r.etaMin != null ? ' · ETA ' + minToHhmm(r.etaMin) : ''}${r.reason ? ' · ' + r.reason : ''}</div></div>
      <span class="badge b-amber">late risk</span></div>`).join('');
    body += `</div>`;
  }
  body += `<button class="btn" data-act="checkRoutesNow" style="margin-bottom:12px">↻ Check live now</button>`;
  body += `<div class="card"><h3>Buses</h3>`;
  body += buses.length ? buses.map((b) => {
    const r = routeForBus(b.id); const n = r ? (r.stops || []).length : 0;
    return `<div class="li" data-routebus="${b.id}"><div class="ava">🚌</div>
      <div class="main"><div class="t">${esc(b.regNo)}</div>
      <div class="s">${n ? n + ' stop' + (n > 1 ? 's' : '') : 'No route yet — tap to set up'}</div></div>
      ${n ? `<span class="tiny" style="color:var(--brand2)">view ›</span>` : `<span class="badge b-amber">set up</span>`}</div>`;
  }).join('') : `<div class="empty">No buses yet</div>`;
  body += `</div>`;
  shell('Routes & timings', body);
}
function viewRouteDetail(busId) {
  const bus = byId(S.cache.buses, busId); if (!bus) return viewRoutes();
  const route = routeForBus(busId);
  let body = `<div class="card"><div class="row between"><h3>${esc(bus.regNo)}</h3>
    <button class="btn sm" data-act="addStop" data-routebus="${busId}">+ Stop</button></div>
    <div class="tiny muted">Stops in order. Leave the time blank to auto-learn it from GPS arrivals. The depot is your garage location.</div></div>`;
  const stops = route ? (route.stops || []) : [];
  if (!stops.length) {
    body += `<div class="card"><div class="empty">No stops yet.<br>Add the first pickup spot (capture its location + set the go-time).</div></div>`;
  } else {
    body += `<div class="card"><h3>Schedule &amp; punctuality</h3>`;
    body += stops.map((s, i) => {
      const sched = stopSched(s); const learned = hhmmToMin(s.schedTime) == null && sched != null;
      const p = stopPunctuality(s);
      return `<div class="li" data-act="editStop" data-routebus="${busId}" data-stop="${s.id}" style="cursor:pointer">
        <div class="ava">${i === 0 ? '①' : i + 1}</div>
        <div class="main"><div class="t">${esc(s.name)}</div>
          <div class="s">go ${sched != null ? minToHhmm(sched) : '—'}${learned ? ' (learned)' : ''} · on-time ${p.onTime == null ? '—' : p.onTime + '%'}${p.avgLate ? ' · avg +' + p.avgLate + 'm' : ''} · ${p.n} day(s)</div></div>
        ${routeStatusBadge(s)}</div>`;
    }).join('');
    body += `</div>`;
  }
  shell(esc(bus.regNo) + ' — route', body);
}

let _stopLat = null, _stopLng = null;
function sheetAddStop(busId, stopId) {
  const route = routeForBus(busId);
  const cur = stopId && route ? (route.stops || []).find((s) => s.id === stopId) : null;
  _stopLat = cur ? cur.lat : null; _stopLng = cur ? cur.lng : null;
  openSheet(cur ? 'Edit stop' : 'Add stop', `
    <input type="hidden" id="f-stopid" value="${cur ? cur.id : ''}">
    <label class="field"><span class="lbl">Stop name</span><input id="f-stopname" value="${esc(cur && cur.name || '')}" placeholder="e.g. Sindhi Camp first pickup"></label>
    <div class="card" style="box-shadow:none;background:var(--tile);padding:12px">
      <div class="tiny muted" style="margin-bottom:6px">📍 Geofence — stand at the stop and capture it, or it keeps the existing pin.</div>
      <div id="f-stoploc" class="small">${cur && cur.lat != null ? `Set: ${cur.lat.toFixed(5)}, ${cur.lng.toFixed(5)}` : '⚠️ Not set'}</div>
      <button class="btn sm" data-act="captureStopLoc" style="margin-top:8px">📍 Use my current location</button>
    </div>
    <div class="grid2">
      <label class="field"><span class="lbl">Radius (m)</span><input id="f-stopradius" type="number" inputmode="numeric" min="10" value="${cur && cur.radiusM || 150}"></label>
      <label class="field"><span class="lbl">Go-time (HH:MM, blank = auto-learn)</span><input id="f-stoptime" value="${esc(cur && cur.schedTime || '')}" placeholder="06:45"></label>
    </div>
    <button class="btn primary" data-act="saveStop" data-routebus="${busId}">${t('save')}</button>
    ${cur ? `<div class="spacer"></div><button class="btn" data-act="delStop" data-routebus="${busId}" data-stop="${cur.id}" style="color:var(--red)">🗑 Remove stop</button>` : ''}`);
}
async function captureStopLocation() {
  toast('Getting location…');
  try {
    const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 8000 }));
    _stopLat = pos.coords.latitude; _stopLng = pos.coords.longitude;
    const el = $('#f-stoploc'); if (el) el.textContent = `Captured: ${_stopLat.toFixed(5)}, ${_stopLng.toFixed(5)} ✓`;
    toast('Location captured ✓');
  } catch (e) { toast('Could not get location — check GPS permission'); }
}
async function saveStop(busId) {
  const name = $('#f-stopname').value.trim();
  if (!name) return toast('Enter a stop name');
  const cur = $('#f-stopid').value;
  if (_stopLat == null && !cur) return toast('Capture the stop location first');
  const time = $('#f-stoptime').value.trim();
  if (time && hhmmToMin(time) == null) return toast('Time must be HH:MM, e.g. 06:45');
  let route = routeForBus(busId);
  if (!route) { route = { id: uid('rt-'), busId, name: busName(busId), stops: [] }; }
  route.stops = route.stops || [];
  const data = { name, radiusM: Math.max(10, Number($('#f-stopradius').value) || 150), schedTime: time };
  if (cur) {
    const s = route.stops.find((x) => x.id === cur); if (!s) return toast('Stop not found — it may have been changed on another device');
    Object.assign(s, data);
    if (_stopLat != null) { s.lat = _stopLat; s.lng = _stopLng; }
  } else {
    route.stops.push({ id: uid('st-'), lat: _stopLat, lng: _stopLng, ...data });
  }
  await DB.put('routes', route);
  _stopLat = _stopLng = null;
  await load(); closeSheet(); toast('Stop saved ✓'); viewRouteDetail(busId);
}
async function delStop(busId, stopId) {
  const route = routeForBus(busId); if (!route) return;
  route.stops = (route.stops || []).filter((s) => s.id !== stopId);
  // Removing the last stop → drop the (now empty) route via a synced tombstone.
  if (!route.stops.length) await DB.softDel('routes', route.id);
  else await DB.put('routes', route);
  await load(); closeSheet(); toast('Stop removed'); viewRouteDetail(busId);
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

  // Driver-reported issues still open — early warning straight from the road
  (S.cache.driverreports || []).filter((r) => r.status === 'open').slice(0, 3)
    .forEach((r) => out.push({ sev: 'med', icon: '🗣️', title: `Driver report open — ${busName(r.busId)}`,
      detail: `"${r.problem}" (${driverName(r.driverId)}). Catch it at the next service before it becomes a breakdown.`,
      nav: { name: 'buses', id: r.busId } }));

  // Low driver ratings — damage/cost risk, coaching opportunity
  (S.cache.drivers || []).map((d) => ({ d, s: driverScore(d.id) })).filter((x) => x.s < 75)
    .sort((a, b) => a.s - b.s)
    .forEach(({ d, s }) => out.push({ sev: s < 60 ? 'high' : 'med', icon: '🧑‍✈️', title: `Driver rating low — ${d.name}`,
      detail: `${s}/100 from recent incidents (${driverIncidents(d.id).length}). Coaching or reassignment can cut damage costs.`,
      nav: { name: 'drivers', id: d.id } }));

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
    ? `data-${i.nav.name === 'jobs' ? 'job' : i.nav.name === 'buses' ? 'bus' : i.nav.name === 'drivers' ? 'driver' : 'part'}="${i.nav.id}"`
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

// AI advisor. PREFERRED path: the server-side /ai proxy, so the Anthropic key
// stays on the server and never ships to devices. Fallback: only if a device
// has a local key configured (dev/demo) do we call Anthropic directly.
async function callClaude(question) {
  // 1) Try the secure server proxy first.
  if (Sync.ai) {
    const r = await Sync.ai({ question, context: aiContext(), biz: BIZ });
    if (r && r.text) return { text: r.text };
    if (r && r.error && r.configured) return { error: r.error };   // server has AI but errored
    // else: server has no AI key (not configured) or unreachable → fall through
  }
  // 2) Dev/demo fallback: direct browser call, only if a local key is set.
  const key = localStorage.getItem('aiKey');
  if (!key) return { error: 'AI advisor not set up. Ask your admin to enable it on the server (or add a key in Me → Sync for testing).' };
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
// Role guard: routes restricted to certain roles fall back to home for others.
const ROUTE_PERM = { insights: 'insights', drivers: 'manageDrivers', assignments: 'assignDriver', routes: 'manageRoutes' };
function render(r) {
  if (ROUTE_PERM[r.name] && !can(S.user.role, ROUTE_PERM[r.name])) r = { name: 'home' };
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
    case 'drivers': return r.id ? viewDriverDetail(r.id) : viewDrivers();
    case 'assignments': return viewAssignments();
    case 'routes': return r.id ? viewRouteDetail(r.id) : viewRoutes();
    case 'company': return viewCompanyDetail(r.id);
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
    const el = e.target.closest('[data-act],[data-nav],[data-bus],[data-job],[data-part],[data-driver],[data-company],[data-routebus]');
    if (!el) return;
    const nav = el.getAttribute('data-nav');
    if (nav) return navTab(nav);
    const act = el.getAttribute('data-act');

    // navigation by entity (lists) — drill in, keep history
    if (el.hasAttribute('data-job') && !act) return push({ name: 'jobs', id: el.getAttribute('data-job') });
    if (el.hasAttribute('data-bus') && !act) return push({ name: 'buses', id: el.getAttribute('data-bus') });
    if (el.hasAttribute('data-part') && !act) return push({ name: 'store', id: el.getAttribute('data-part') });
    if (el.hasAttribute('data-driver') && !act) return push({ name: 'drivers', id: el.getAttribute('data-driver') });
    if (el.hasAttribute('data-company') && !act) return push({ name: 'company', id: el.getAttribute('data-company') });
    if (el.hasAttribute('data-routebus') && !act) return push({ name: 'routes', id: el.getAttribute('data-routebus') });

    switch (act) {
      case 'back': return back();
      case 'lang': LANG = LANG === 'en' ? 'hi' : 'en'; localStorage.setItem('lang', LANG); return rerender();
      case 'addBus': return sheetAddBus();
      case 'saveBus': return saveBus();
      case 'importFleet': return importFleet();
      case 'addDoc': return sheetAddDoc(el.getAttribute('data-bus'), null);
      case 'editDoc': return sheetAddDoc(el.getAttribute('data-bus'), el.getAttribute('data-doc'));
      case 'saveDoc': return saveDoc(el.getAttribute('data-bus'));
      case 'docPhoto': { const d = await capturePhoto(); if (d) { _docPhoto = await Sync.uploadPhoto(d) || d; const el2 = $('#f-docthumb'); if (el2) el2.innerHTML = `<img class="thumb" src="${_docPhoto}">`; } return; }
      case 'deleteDoc': return deleteDoc(el.getAttribute('data-bus'), el.getAttribute('data-doc'));
      case 'addJob': return sheetAddJob();
      case 'saveJob': return saveJob();
      case 'editJob': return sheetEditJob(el.getAttribute('data-job'));
      case 'saveEditJob': return saveEditJob(el.getAttribute('data-job'));
      case 'requestPart': return sheetRequestPart(el.getAttribute('data-job'));
      case 'saveRequestPart': return saveRequestPart(el.getAttribute('data-job'));
      case 'fulfilRequest': return fulfilRequest(el.getAttribute('data-job'), el.getAttribute('data-req'));
      case 'closeJob': return sheetCloseJob(el.getAttribute('data-job'));
      case 'confirmCloseJob': return confirmCloseJob(el.getAttribute('data-job'));
      case 'hrsStep': return hrsStep(el.getAttribute('data-dir'));
      case 'addPhotoSafe': return addJobPhotoSafe(el.getAttribute('data-job'), el.getAttribute('data-field'));
      case 'filterStatus': { jobFilterState.status = el.getAttribute('data-fstatus'); return rerender(); }
      case 'filterMech': { jobFilterState.mech = el.getAttribute('data-fmech'); return rerender(); }
      case 'pickReportCat': return pickReportCat(el.getAttribute('data-cat'));
      case 'reportPhoto': return reportCapturePhoto();
      case 'reportVoice': return reportVoiceDictate();
      case 'cancelReport': return cancelReport(el.getAttribute('data-report'));
      case 'useReport': { const f = $('#f-prob'); if (f) { f.value = el.getAttribute('data-rprob'); const cb = el.closest('.repcheck') && el.closest('.repcheck').querySelector('.f-rep'); if (cb) cb.checked = true; } return; }
      case 'issueTo': return sheetIssue(el.getAttribute('data-job'));
      case 'confirmIssue': return confirmIssue();
      case 'receive': return sheetReceive();
      case 'confirmReceive': return confirmReceive();
      case 'addPart': return sheetAddPart();
      case 'saveAddPart': return saveAddPart();
      case 'addStock': return sheetAddStock();
      case 'confirmAddStock': return confirmAddStock();
      case 'openAssignments': return push({ name: 'assignments' });
      case 'addPurchase': return sheetAddPurchase();
      case 'savePurchase': return savePurchase();
      case 'togglePaid': return togglePaid(el.getAttribute('data-pur'));
      case 'purchasePhoto': { const d = await capturePhoto(); if (d) { _billPhoto = await Sync.uploadPhoto(d) || d; $('#f-billthumb').innerHTML = `<img class="thumb" src="${_billPhoto}">`; } return; }
      case 'addPhoto': return addJobPhoto(el.getAttribute('data-job'), el.getAttribute('data-field'));
      case 'markDone': return markDone(el.getAttribute('data-job'));
      case 'verifyJob': return verifyJob(el.getAttribute('data-job'));
      case 'rejectJob': return rejectJob(el.getAttribute('data-job'));
      case 'checkin': return doAttendance('in');
      case 'checkout': return doAttendance('out');
      case 'viewPhoto': return viewPhoto(el.getAttribute('data-src'));
      case 'gps': return showGps(el.getAttribute('data-bus'));
      case 'logService': return logService(el.getAttribute('data-bus'));
      case 'confirmLogService': return confirmLogService(el.getAttribute('data-bus'));
      case 'openInsights': return push({ name: 'insights' });
      case 'shareBill': return shareBill(el.getAttribute('data-company'));
      case 'askAi': return askAi();
      case 'openPurchases': return push({ name: 'purchases' });
      case 'openAlerts': return push({ name: 'alerts' });
      case 'openStaff': return sheetStaff();
      case 'saveStaff': return saveStaff();
      case 'openDrivers': return push({ name: 'drivers' });
      case 'addDriver': return sheetAddDriver();
      case 'saveDriver': return saveDriver();
      case 'assignBus': return sheetAssignBus(el.getAttribute('data-driver'));
      case 'saveAssignBus': return saveAssignBus(el.getAttribute('data-driver'));
      case 'assignDriver': return sheetAssignDriverToBus(el.getAttribute('data-bus'));
      case 'saveAssignDriver': return saveAssignDriver(el.getAttribute('data-bus'));
      case 'addIncident': return sheetIncident(el.getAttribute('data-driver'));
      case 'saveIncident': return saveIncident(el.getAttribute('data-driver'));
      case 'incidentPhoto': { const d = await capturePhoto(); if (d) { _incPhoto = await Sync.uploadPhoto(d) || d; $('#f-iphoto').innerHTML = `<img class="thumb" src="${_incPhoto}">`; } return; }
      case 'reportProblem': return sheetTripReport(el.getAttribute('data-bus'), el.getAttribute('data-driver'));
      case 'saveReport': return saveReport(el.getAttribute('data-bus'), el.getAttribute('data-driver'));
      case 'reportToJob': return createJobFromReport(el.getAttribute('data-report'));
      case 'openSync': return sheetSync();
      case 'openSetup': return sheetGarageSetup();
      case 'openRoutes': return push({ name: 'routes' });
      case 'checkRoutesNow': { toast('Checking live GPS…'); checkRoutes({ alert: true }).then((r) => toast(S.routeGpsOffline ? '⚠️ GPS offline — arrivals not captured' : (r.length ? `${r.length} at risk` : 'All on track ✓'))); return; }
      case 'addStop': return sheetAddStop(el.getAttribute('data-routebus'), null);
      case 'editStop': return sheetAddStop(el.getAttribute('data-routebus'), el.getAttribute('data-stop'));
      case 'saveStop': return saveStop(el.getAttribute('data-routebus'));
      case 'captureStopLoc': return captureStopLocation();
      case 'delStop': return delStop(el.getAttribute('data-routebus'), el.getAttribute('data-stop'));
      case 'captureGarageLoc': return captureGarageLocation();
      case 'saveGarage': return saveGarage();
      case 'startFresh': return startFresh();
      case 'changePin': return sheetChangePin();
      case 'saveChangePin': return saveChangePin();
      case 'saveSyncUrl': { Sync.setUrl($('#f-syncurl').value.trim()); const k = $('#f-aikey'); if (k) localStorage.setItem('aiKey', k.value.trim()); closeSheet(); toast('Saved'); return; }
      case 'syncNow': { Sync.tick(); toast('Syncing…'); return; }
      case 'closeSheet': return closeSheet();
      case 'logout': {
        // Clear THIS user's cached PIN so a shared device doesn't let the next
        // person sign back in offline as them. Others' cached PINs are untouched.
        if (S.user) credClear(S.user.id);
        Sync.logout(); S.user = null; return renderLogin();
      }
    }
  };
}

/* ------------------------------- Login ------------------------------------ */
let _pinUser = null, _pin = '';
function renderLogin() {
  _pinUser = null; _pin = '';
  const users = S.cache.users || [];
  root().innerHTML = `<div class="login">
    <div class="row between" style="width:100%;max-width:420px"><span></span>
      <button class="lang" data-loginlang>${t('lang')}</button></div>
    <div class="bigicon">🚌</div>
    <h1 style="margin:0">${esc(BIZ)}</h1>
    <div class="muted small">${t('appName')} · ${t('tagline')}</div>
    <div class="userpick">${users.map((u) => `<div class="u" data-login="${u.id}">
      <div style="font-size:22px">${u.role==='owner'?'👑':u.role==='supervisor'?'🧑‍🔧':u.role==='store'?'📦':u.role==='driver'?'🧑‍✈️':'🔧'}</div>
      <div style="font-weight:700;font-size:14px">${esc(u.name)}</div>
      <div class="tiny muted">${esc(u.role)}</div></div>`).join('')}</div>
    ${isDemoMode() && /^(localhost|127\.|192\.168\.|10\.|172\.1[6-9]\.|172\.2\d\.|172\.3[01]\.)/.test(location.hostname)
      ? `<div class="tiny muted" style="margin-top:14px">Demo PINs — Owner 1111 · Store 3333 · Mechanic 0001</div>` : ''}
  </div>`;
  root().onclick = (e) => {
    if (e.target.closest('[data-loginlang]')) { LANG = LANG === 'en' ? 'hi' : 'en'; localStorage.setItem('lang', LANG); return renderLogin(); }
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
      <div class="muted small">${t('enterPin')}</div>
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
function credClear(id) {
  let m = {}; try { m = JSON.parse(localStorage.getItem('creds') || '{}'); } catch (e) { /* ignore */ }
  delete m[id]; localStorage.setItem('creds', JSON.stringify(m));
}
// Demo mode is ON until a real garage runs "Start fresh" (which sets it to '0').
// Only in demo mode do we seed convenience PINs and show the PIN cheat-sheet.
// Demo mode powers the demo PIN seeding + login cheat-sheet. It is ON for local
// and LAN testing, but DEFAULTS OFF on a real public domain so a production
// deployment never ships demo credentials. Override explicitly with '1'/'0'.
const isLocalHost = () => location.hostname === '' ||
  /^(localhost|127\.|0\.0\.0\.0|\[?::1\]?|192\.168\.|10\.|172\.1[6-9]\.|172\.2\d\.|172\.3[01]\.)/.test(location.hostname);
const isDemoMode = () => {
  const v = localStorage.getItem('demoMode');
  if (v === '0') return false;
  if (v === '1') return true;
  return isLocalHost();
};
function seedCreds() {
  // Demo convenience so the app works standalone on first run. A real garage
  // runs Start fresh → demo mode off → no demo PINs are ever planted again.
  if (!isDemoMode()) return;
  if (localStorage.getItem('creds')) return;
  localStorage.setItem('creds', JSON.stringify(
    { 'u-owner': '1111', 'u-sup': '2222', 'u-store': '3333', 'u-m1': '0001', 'u-m2': '0002', 'u-m3': '0003', 'u-d1': '0010' }));
}

// Offline brute-force guard: the server enforces lockout online, but offline a
// stolen phone could try all 10000 PINs. Lock locally after 5 wrong tries.
const OFFLINE_MAX = 5, OFFLINE_LOCK_MS = 60000;
function offlineLockLeft(id) {
  try {
    const m = JSON.parse(localStorage.getItem('offlineFails') || '{}')[id];
    if (m && m.n >= OFFLINE_MAX && Date.now() - m.at < OFFLINE_LOCK_MS) return Math.ceil((OFFLINE_LOCK_MS - (Date.now() - m.at)) / 1000);
  } catch (e) { /* ignore */ }
  return 0;
}
function offlineFail(id) {
  let all = {}; try { all = JSON.parse(localStorage.getItem('offlineFails') || '{}'); } catch (e) { /* ignore */ }
  const m = all[id] || { n: 0, at: 0 };
  m.n = (Date.now() - m.at < OFFLINE_LOCK_MS) ? m.n + 1 : 1; m.at = Date.now();
  all[id] = m; localStorage.setItem('offlineFails', JSON.stringify(all));
}
function offlineClear(id) {
  let all = {}; try { all = JSON.parse(localStorage.getItem('offlineFails') || '{}'); } catch (e) { /* ignore */ }
  delete all[id]; localStorage.setItem('offlineFails', JSON.stringify(all));
}

// Server-authoritative login: the server verifies the PIN (and enforces lockout).
// Offline, we fall back to this device's cached credential only.
async function attemptLogin(user, pin, redraw) {
  const r = await Sync.login(user.id, pin);
  if (r && r.user) { credSet(user.id, pin); offlineClear(user.id); return enterApp(user); }  // verified online
  if (r && r.locked) { toast(`Too many attempts. Wait ${r.retryAfter}s`); _pin = ''; return redraw(); }
  if (r && r.offline) {                                                     // server unreachable
    const left = offlineLockLeft(user.id);
    if (left) { toast(`Too many tries. Wait ${left}s or connect online`); _pin = ''; return redraw(); }
    if (credGet(user.id) === pin) { offlineClear(user.id); toast('Offline — signed in'); return enterApp(user); }
    offlineFail(user.id);
    toast('Offline — PIN not recognised on this device'); _pin = ''; return redraw();
  }
  toast(t('wrongPin')); _pin = ''; redraw();                                // server rejected
}
function enterApp(user) { S.user = user; route({ name: 'home' }); }

/* -------------------------------- Boot ------------------------------------ */
(async function boot() {
  try {
  await seedIfEmpty();
  seedCreds();
  await load();
  // Business name now comes from garage config (set in db.js seed for the demo,
  // and via Garage setup for a real garage) — refreshBiz() in load() applies it.

  // Backfill service-plan fields on buses created before Phase 3.
  const SEED_LAST = { b1: 178000, b2: 242000, b3: 88000 };
  for (const b of S.cache.buses) {
    let changed = false;
    if (b.serviceIntervalKm == null) { b.serviceIntervalKm = SERVICE_INTERVAL_KM; changed = true; }
    if (b.lastServiceOdo == null) { b.lastServiceOdo = SEED_LAST[b.id] != null ? SEED_LAST[b.id] : (b.odometer || 0); changed = true; }
    if (changed) await DB.put('buses', b);
  }

  // Seed the drivers module on devices set up before this feature existed.
  if (!(S.cache.drivers || []).length) {
    const d0 = Date.now(), DAY = 86400000;
    if (!byId(S.cache.users, 'u-d1')) await DB.put('users', { id: 'u-d1', name: 'Ramlal (Driver)', role: 'driver' });
    credSet('u-d1', '0010');
    const dseed = [
      { id: 'd1', name: 'Ramlal', phone: '98290 11111', license: 'RJ-DL-2210', busId: 'b1', userId: 'u-d1', tripsLogged: 142, joinedAt: d0 - 400 * DAY, photo: '' },
      { id: 'd2', name: 'Shyam Lal', phone: '98290 22222', license: 'RJ-DL-3398', busId: 'b2', userId: null, tripsLogged: 96, joinedAt: d0 - 230 * DAY, photo: '' },
      { id: 'd3', name: 'Geeta Devi', phone: '98290 33333', license: 'RJ-DL-7741', busId: 'b3', userId: null, tripsLogged: 61, joinedAt: d0 - 120 * DAY, photo: '' },
    ];
    const iseed = [
      { id: 'inc-1', driverId: 'd1', busId: 'b1', type: 'scratch', note: 'Left rear panel scratch', photo: '', cost: 0, at: d0 - 12 * DAY, by: 'u-sup' },
      { id: 'inc-2', driverId: 'd2', busId: 'b2', type: 'dent', note: 'Front bumper dent', photo: '', cost: 2500, at: d0 - 20 * DAY, by: 'u-sup' },
      { id: 'inc-3', driverId: 'd2', busId: 'b2', type: 'harsh-brake', note: 'Repeated harsh braking', photo: '', cost: 0, at: d0 - 6 * DAY, by: 'u-sup' },
      { id: 'inc-4', driverId: 'd3', busId: 'b3', type: 'accident', note: 'Minor side collision', photo: '', cost: 9000, at: d0 - 30 * DAY, by: 'u-sup' },
      { id: 'inc-5', driverId: 'd3', busId: 'b3', type: 'scratch', note: 'Door scratch', photo: '', cost: 0, at: d0 - 4 * DAY, by: 'u-sup' },
    ];
    const rseed = [
      { id: 'dr-1', driverId: 'd1', busId: 'b1', category: 'Brakes', problem: 'Brakes feel weak at high speed, slight noise', at: d0 - 6 * DAY, status: 'addressed', jobId: 'j1', resolvedAt: d0 - 5 * DAY },
      { id: 'dr-2', driverId: 'd3', busId: 'b3', category: 'AC', problem: 'AC not cooling and a rattling noise from the rear', at: d0 - 2 * DAY, status: 'open', jobId: null, resolvedAt: null },
      { id: 'dr-3', driverId: 'd2', busId: 'b2', category: 'Engine', problem: 'Engine feels low on power on inclines', at: d0 - 1 * DAY, status: 'open', jobId: null, resolvedAt: null },
    ];
    for (const x of dseed) await DB.put('drivers', x);
    for (const x of iseed) await DB.put('incidents', x);
    for (const x of rseed) await DB.put('driverreports', x);
    await load();
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
    onConflict: (n) => {
      // Another device changed the same record concurrently (last-write-wins
      // already applied) — tell the user so a silent overwrite isn't invisible.
      if (n && S.user) toast(`⚠️ ${n} record(s) updated on another device`);
    },
  });
  // On-Time Pickup: start the live route monitor (geofence arrivals + at-risk ETA).
  startRouteMonitor();
  if ((S.cache.routes || []).length) checkRoutes();   // prime the dashboard once
  } catch (e) {
    // A seed/migration/DB-upgrade hiccup must never leave a blank screen —
    // always fall through to the login.
    console.error('Garage Saathi boot error (continuing to login):', e);
    try { await load(); } catch (_) { /* keep whatever cache we have */ }
  }
  renderLogin();
  // Camera (selfies, job photos) and GPS only work over HTTPS (or localhost).
  // Warn loudly on a plain-http public host so it isn't a silent field failure.
  if (location.protocol === 'http:' && !isLocalHost()) {
    setTimeout(() => toast('⚠️ Open this app over HTTPS — camera & GPS need it'), 800);
  }
})();

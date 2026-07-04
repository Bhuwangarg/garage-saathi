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

/* ===== Face check-in: live camera + face detection ========================
 * Uses the browser's native FaceDetector when present, else face-api.js
 * (tinyFaceDetector, loaded from CDN). Capture is only allowed while a real
 * face is in frame — so it's a live face, not a random uploaded photo. If
 * neither detector is available (or offline), it degrades to a plain selfie. */
let _faceModelsLoaded = false;
async function ensureFaceModels() {
  if (window.FaceDetector) return true;                 // native — no model download
  if (!window.faceapi) return false;                    // lib didn't load (offline)
  if (_faceModelsLoaded) return true;
  try { await faceapi.nets.tinyFaceDetector.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model'); _faceModelsLoaded = true; return true; }
  catch (e) { return false; }
}
const faceDetectorReady = () => !!window.FaceDetector || (window.faceapi && _faceModelsLoaded);
async function detectFaceBoxes(video) {
  try {
    if (window.FaceDetector) {
      const fs = await new FaceDetector({ fastMode: true, maxDetectedFaces: 3 }).detect(video);
      return fs.map((f) => ({ x: f.boundingBox.x, y: f.boundingBox.y, w: f.boundingBox.width, h: f.boundingBox.height }));
    }
    if (window.faceapi && _faceModelsLoaded) {
      const ds = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.45 }));
      return ds.map((d) => ({ x: d.box.x, y: d.box.y, w: d.box.width, h: d.box.height }));
    }
  } catch (e) { /* detection hiccup → treat as no face this frame */ }
  return [];
}
function drawFaceBrackets(ctx, b) {
  const len = Math.min(b.w, b.h) * 0.24;
  ctx.strokeStyle = '#16a571'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  [[b.x, b.y, 1, 1], [b.x + b.w, b.y, -1, 1], [b.x, b.y + b.h, 1, -1], [b.x + b.w, b.y + b.h, -1, -1]]
    .forEach(([x, y, sx, sy]) => { ctx.beginPath(); ctx.moveTo(x, y + sy * len); ctx.lineTo(x, y); ctx.lineTo(x + sx * len, y); ctx.stroke(); });
  ctx.strokeStyle = 'rgba(22,165,113,.45)'; ctx.lineWidth = 1.5; ctx.strokeRect(b.x, b.y, b.w, b.h);
}
// Returns { photo, faceVerified } or null (cancelled).
async function captureFace(caption) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    const p = await capturePhoto(); return p ? { photo: p, faceVerified: false } : null;
  }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } }, audio: false }); }
  catch (e) { const p = await capturePhoto(); return p ? { photo: p, faceVerified: false } : null; }
  await ensureFaceModels();
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#0b0f14;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:18px';
    ov.innerHTML = `<div style="position:relative;width:min(92vw,400px);aspect-ratio:1;border-radius:22px;overflow:hidden;background:#000">
        <video id="fc-v" playsinline muted autoplay style="width:100%;height:100%;object-fit:cover;transform:scaleX(-1)"></video>
        <canvas id="fc-c" style="position:absolute;inset:0;width:100%;height:100%;transform:scaleX(-1)"></canvas>
      </div>
      <div id="fc-status" style="color:#fff;font:700 16px -apple-system,system-ui,sans-serif;margin-top:16px">Looking for a face…</div>
      <div style="color:#8b91a0;font-size:12px;margin-top:4px">${esc(caption || '')}</div>
      <div style="display:flex;gap:14px;margin-top:18px">
        <button id="fc-x" style="padding:13px 22px;border-radius:14px;border:0;background:#2a2f37;color:#fff;font-weight:700">Cancel</button>
        <button id="fc-go" disabled style="padding:13px 28px;border-radius:14px;border:0;background:#16a571;color:#fff;font-weight:800;opacity:.45">Capture</button>
      </div>`;
    document.body.appendChild(ov);
    const v = ov.querySelector('#fc-v'), c = ov.querySelector('#fc-c'), status = ov.querySelector('#fc-status'),
      go = ov.querySelector('#fc-go'), x = ov.querySelector('#fc-x'), ctx = c.getContext('2d');
    v.srcObject = stream; v.play && v.play().catch(() => {});
    let running = true, hasFace = false, timer = null;
    const cleanup = () => { running = false; if (timer) clearInterval(timer); try { stream.getTracks().forEach((t) => t.stop()); } catch (e) {} ov.remove(); };
    const loop = async () => {
      if (!running || !v.videoWidth) return;
      const boxes = faceDetectorReady() ? await detectFaceBoxes(v) : [];
      if (!running) return;
      c.width = v.videoWidth; c.height = v.videoHeight;
      ctx.clearRect(0, 0, c.width, c.height);
      hasFace = boxes.length > 0;
      boxes.forEach((b) => drawFaceBrackets(ctx, b));
      if (!faceDetectorReady()) { status.textContent = 'Centre your face, then Capture'; status.style.color = '#fff'; }
      else { status.textContent = hasFace ? '✓ Face detected' : 'Looking for a face…'; status.style.color = hasFace ? '#16a571' : '#fff'; }
      const allow = !faceDetectorReady() || hasFace;     // require a face only when a detector is available
      go.disabled = !allow; go.style.opacity = allow ? '1' : '.45';
    };
    timer = setInterval(loop, 250);
    go.onclick = () => {
      let w = v.videoWidth || 640, h = v.videoHeight || 640; const max = 720;
      if (w > h && w > max) { h = h * max / w; w = max; } else if (h > max) { w = w * max / h; h = max; }
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(v, 0, 0, w, h);
      const photo = cv.toDataURL('image/jpeg', 0.72);
      const fv = faceDetectorReady() && hasFace;
      cleanup(); resolve({ photo, faceVerified: fv });
    };
    x.onclick = () => { cleanup(); resolve(null); };
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
  addFuel: ['owner', 'supervisor', 'store'], // log fuel fills; view mileage
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
  const [users, buses, parts, jobs, ledger, att, purchases, drivers, incidents, driverreports, routes, triplog, fuel, gpsevents, audits, components, def, vendors, garage] = await Promise.all([
    DB.all('users'), DB.all('buses'), DB.all('parts'), DB.all('jobcards'),
    DB.all('ledger'), DB.all('attendance'), DB.all('purchases'),
    DB.all('drivers'), DB.all('incidents'), DB.all('driverreports'),
    DB.all('routes'), DB.all('triplog'), DB.all('fuel'), DB.all('gpsevents'), DB.all('audits'), DB.all('components'), DB.all('def'), DB.all('vendors'), DB.get('meta', 'garage'),
  ]);
  S.cache = { users, buses, parts, jobs, ledger, att, purchases, drivers, incidents, driverreports, routes, triplog, fuel, gpsevents, audits, components, def, vendors, garage };
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
// Auto safety/misuse events detected from live GPS (server-side), penalty each.
const GPS_EVENT = {
  overspeed:  { label: 'Overspeeding',   icon: '💨', pen: 4 },
  harshbrake: { label: 'Harsh braking',  icon: '🛑', pen: 3 },
  night:      { label: 'Night movement', icon: '🌙', pen: 5 },
  idle:       { label: 'Long idle',      icon: '🐌', pen: 1 },
};
const gpsEventsForBus = (busId) => {
  const b = byId(S.cache.buses, busId); if (!b) return [];
  const nr = _normReg(b.regNo);
  return (S.cache.gpsevents || []).filter((e) => _normReg(e.reg) === nr).sort((a, b2) => b2.at - a.at);
};
function driverScore(driverId) {
  const since = Date.now() - 90 * day;
  let pen = driverIncidents(driverId).filter((i) => i.at >= since)
    .reduce((s, i) => s + ((INCIDENT[i.type] || INCIDENT.other).pen), 0);
  const drv = driverById(driverId);
  if (drv && drv.busId) {           // auto GPS events on the driver's bus also count (capped)
    const gp = gpsEventsForBus(drv.busId).filter((e) => e.at >= since)
      .reduce((s, e) => s + ((GPS_EVENT[e.type] || {}).pen || 0), 0);
    pen += Math.min(40, gp);
  }
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
const TAB_OF = { home: 'home', buses: 'buses', jobs: 'jobs', store: 'store', me: 'me', purchases: 'me', alerts: 'me', insights: 'home', drivers: 'home', assignments: 'home', company: 'home', routes: 'home', reports: 'home', busreport: 'home', livemap: 'home', track: 'home', fuel: 'home', safety: 'home', warranty: 'home', storehealth: 'store', linkgps: 'home', newjob: 'jobs', driverdocs: 'home', forecast: 'home', pilferage: 'home', components: 'store', def: 'home', vendors: 'me', import: 'me', crewpins: 'me' };
function bottomnav() {
  const active = TAB_OF[S.route.name] || 'home';
  // Each role gets a focused nav matching what they actually do.
  const NAVS = {
    driver:    [['home', '🚌', 'My Bus'], ['me', '👤', t('me')]],
    conductor: [['home', '🚌', 'My Bus'], ['me', '👤', t('me')]],
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
  body += `<div class="btnrow" style="margin-bottom:14px"><button class="btn" data-act="openFuel">⛽ Fuel</button><button class="btn" data-act="openStoreHealth">📦 Store health</button></div>`;
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
  // My scorecard — score, this-month attendance + late penalty, at a glance.
  const ms = mechanicScore(me), mp = latePenaltyFor(me), matt = mechAttendance(me, true);
  body += `<div class="card" data-act="myScorecard" style="cursor:pointer"><div class="row between">
      <div><div class="muted small">My score</div><div class="stat">${ms.score}<span style="font-size:14px"> /100</span></div></div>
      <div style="text-align:right"><div class="stars big">${starStr(scoreStars(ms.score))}</div>
        <div class="tiny muted">${matt.lates} late${mp.amount ? ' · ' + money(mp.amount) + ' penalty' : ''} this month</div></div></div>
    <div class="tiny muted" style="margin-top:6px">Tap for your attendance, penalties &amp; how the score is built.</div></div>`;
  body += `<button class="btn" data-act="openScoreboard" style="margin-bottom:14px">🏆 Team leaderboard</button>`;
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
  if (S.user.role === 'conductor') return viewConductorHome();
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
    // Driver complaints raised from the road — front-and-centre so the supervisor
    // sees them the moment a driver reports, and can open the bus to raise a job.
    const openReports = (S.cache.driverreports || []).filter((r) => r.status === 'open').sort((a, b) => b.at - a.at);
    if (openReports.length) {
      body += `<div class="card" style="border:1.5px solid var(--red)">
        <div class="row between"><h3>🗣️ Driver complaints</h3><span class="badge b-red">${openReports.length} new</span></div>
        ${openReports.slice(0, 4).map((r) => `<div class="li" data-bus="${r.busId}" style="border:none;padding:7px 0;cursor:pointer">
          <div class="ava">🚨</div><div class="main"><div class="t">${esc(busName(r.busId))} · ${esc(r.category || 'Issue')}</div>
          <div class="s">“${esc((r.problem || '').slice(0, 64))}” — ${esc(driverName(r.driverId))} · ${timeAgo(r.at)}</div></div>
          <span class="tiny" style="color:var(--brand2)">open ›</span></div>`).join('')}
        ${openReports.length > 4 ? `<div class="tiny muted" style="margin-top:4px">+${openReports.length - 4} more</div>` : ''}
        <div class="tiny muted" style="margin-top:6px">Tap a complaint to open the bus and raise a job.</div></div>`;
    }
    // 7-day repair-cost bar chart with a dark summary pill
    const series = costSeries(7);
    const max = Math.max(1, ...series.map((d) => d.value));
    const total7 = series.reduce((s, d) => s + d.value, 0);
    let peak = 0; series.forEach((d, i) => { if (d.value > series[peak].value) peak = i; });
    body += `<div class="card" data-act="openReports" style="cursor:pointer">
      <div class="row between"><h3>Repair cost</h3><span class="badge b-low">last 7 days · reports ›</span></div>
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

    // Live fleet map — Uber-style tracking
    body += `<div class="card" data-act="openLiveMap" style="cursor:pointer"><div class="row between">
      <div class="row" style="gap:10px"><div class="ai-ic">🗺️</div><div><div class="t" style="font-weight:800">Live map</div>
        <div class="tiny muted">Track every bus live on the map</div></div></div>
      <span class="tiny" style="color:var(--brand2)">open ›</span></div></div>`;

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

    // Pilferage radar — surface the highest-risk mechanic right on home
    if (['owner', 'supervisor'].includes(S.user.role)) {
      const pf = pilferageRadar();
      if (pf.length) { const top = pf[0];
        body += `<div class="card" data-act="openPilferage" style="cursor:pointer;border:1.5px solid var(--red)">
          <div class="row between"><h3>🕵️ Pilferage radar</h3><span class="badge b-red">${pf.length} flagged</span></div>
          <div class="li" style="border:none;padding:8px 0 0"><div class="ava">🚨</div>
            <div class="main"><div class="t">Highest risk: ${esc(top.u.name)}</div><div class="s">${esc(top.flags[0] ? top.flags[0].label : '')} · tap to review</div></div>
            <span class="badge ${riskClass(top.risk)}">${top.risk}</span></div></div>`;
      }
    }

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
const BUS_STAT = { running: ['🟢', 'Running'], idle: ['🟡', 'Idle'], parked: ['⚪', 'Parked'] };
let _busFilter = 'all', _busStatus = {};
const busStatusOf = (b) => _busStatus[_normReg(b.regNo)] || 'parked';
function busLi(b) {
  const alerts = (b.docs || []).filter((d) => daysLeft(d.expiry) <= 15).length;
  const sd = BUS_STAT[busStatusOf(b)] || BUS_STAT.parked;
  // The row taps into bus detail; the Track button (its own data-act) taps into
  // the live tracking page — closest() matches the button first, so they don't clash.
  return `<div class="li" data-bus="${b.id}">
    ${avatar(busImg(b), '🚌')}
    <div class="main"><div class="t">${sd[0]} ${esc(b.regNo)}</div>
      <div class="s">${esc(b.company)} · ${esc(b.model)} · ${(b.odometer||0).toLocaleString('en-IN')} km</div></div>
    ${alerts ? `<span class="badge b-red">${alerts}!</span>` : ''}
    <button class="btn sm" data-act="trackBus" data-bus="${b.id}" style="width:auto" title="Live track">🛰️</button>
  </div>`;
}
function viewBuses() {
  let body = '';   // AirFi import + de-dup run automatically in the background (autoReconcileFleet)
  body += `<input id="bus-search" class="searchbox" placeholder="Search reg, company, model…" autocomplete="off">`;
  body += `<div class="chiprow" id="bus-chips"></div>`;
  body += `<div class="card" id="bus-list"><div class="empty">Loading…</div></div>`;
  shell(t('buses'), body, can(S.user.role, 'addBus') ? { act: 'addBus', icon: '+' } : null);
  const s = document.getElementById('bus-search'); if (s) s.oninput = renderBusList;
  renderBusList();           // paint immediately
  loadBusStatuses();         // then refresh live running/idle/parked
}
// Remove demo/test buses and de-duplicate by registration (keeps the richest record).
async function cleanupFleet(silent) {
  if (!silent && !confirm('Remove demo/test buses and any duplicate registrations?')) return 0;
  const buses = S.cache.buses || [];
  const demoIds = new Set(['b1', 'b2', 'b3']);
  const score = (b) => (b.source === 'klm-linked' ? 100 : 0) + (b.source === 'klm-excel' ? 50 : 0) + (b.model ? 5 : 0) + ((b.docs || []).length ? 2 : 0);
  const groups = {};
  buses.forEach((b) => { const k = _normReg(b.regNo); (groups[k] = groups[k] || []).push(b); });
  const toDel = new Set();
  for (const k in groups) { const g = groups[k].slice().sort((a, b) => score(b) - score(a)); for (let i = 1; i < g.length; i++) toDel.add(g[i].id); }  // dupes
  // Strip demo/test buses ONLY once a real fleet exists to replace them — otherwise
  // the background auto-reconcile would wipe the seeded demo fleet to nothing
  // (offline/local installs have no AirFi import to bring buses back).
  const realCount = buses.filter((b) => !demoIds.has(b.id) && b.source !== 'demo').length;
  if (realCount > 0) buses.forEach((b) => { if (demoIds.has(b.id) || b.source === 'demo') toDel.add(b.id); });            // demo/test
  for (const id of toDel) await DB.softDel('buses', id);
  if (toDel.size) { await load(); Sync.kick(); }
  if (!silent) { toast(toDel.size ? `Removed ${toDel.size} test/duplicate bus(es) ✓` : 'Fleet already clean 👍'); rerender(); }
  return toDel.size;
}
async function loadBusStatuses() {
  let fleet = []; try { fleet = await Sync.fleet(); } catch (e) { /* offline */ }
  _busStatus = {};
  fleet.forEach((f) => { const moving = (f.speedKph || 0) > 2 && f.ignition; _busStatus[_normReg(f.reg)] = !f.ignition ? 'parked' : (moving ? 'running' : 'idle'); });
  renderBusList();
}
function renderBusList() {
  const all = [...(S.cache.buses || [])].sort((a, b) => a.regNo.localeCompare(b.regNo));
  const counts = { all: all.length, running: 0, idle: 0, parked: 0 };
  all.forEach((b) => { counts[busStatusOf(b)]++; });
  const chips = document.getElementById('bus-chips');
  if (chips) chips.innerHTML = [['all', 'All'], ['running', '🟢 Running'], ['idle', '🟡 Idle'], ['parked', '⚪ Parked']]
    .map(([v, label]) => `<button class="chip ${_busFilter === v ? 'active' : ''}" data-act="busFilter" data-v="${v}">${label} ${counts[v]}</button>`).join('');
  const q = (document.getElementById('bus-search') || {}).value || '';
  const ql = q.trim().toLowerCase();
  const list = all.filter((b) => (_busFilter === 'all' || busStatusOf(b) === _busFilter)
    && (!ql || (`${b.regNo} ${b.company} ${b.model}`).toLowerCase().includes(ql)));
  const box = document.getElementById('bus-list');
  if (!box) return;
  box.innerHTML = list.length ? list.map(busLi).join('') : `<div class="empty">No ${_busFilter === 'all' ? '' : _busFilter + ' '}buses${ql ? ' match “' + esc(q) + '”' : ''}</div>`;
  staggerRows(box);
}
// Staggered fade-up of list rows (capped so long lists don't crawl).
function staggerRows(box) {
  box.querySelectorAll('.li, .jobcard').forEach((li, i) => { li.classList.add('row-anim'); li.style.animationDelay = Math.min(i, 12) * 0.028 + 's'; });
}
// Reusable: live-filter a rendered list's .li rows by text, with re-animation.
function attachSearch(inputId, listId) {
  const inp = document.getElementById(inputId), box = document.getElementById(listId);
  if (!inp || !box) return;
  inp.oninput = () => {
    const ql = inp.value.trim().toLowerCase();
    let shown = 0;
    box.querySelectorAll('.li, .jobcard').forEach((li) => { const ok = !ql || li.textContent.toLowerCase().includes(ql); li.style.display = ok ? '' : 'none'; if (ok) shown++; });
    box.querySelectorAll('.li:not([style*="none"]), .jobcard:not([style*="none"])').forEach((li, i) => { li.classList.remove('row-anim'); void li.offsetWidth; li.classList.add('row-anim'); li.style.animationDelay = Math.min(i, 12) * 0.028 + 's'; });
  };
}
// Pull the fleet AirFi is tracking and create a bus for any registration we
// don't have yet. New buses then track live automatically via GpsProvider.
const _normReg = (s) => (s || '').toUpperCase().replace(/[\s-]/g, '');
async function importFleet(silent) {
  if (!can(S.user.role, 'addBus')) { if (!silent) toast('Not allowed'); return 0; }
  if (!silent) toast('Pulling fleet from AirFi…');
  const fleet = await Sync.fleet();
  if (!fleet.length) { if (!silent) toast('No buses from AirFi yet — they appear once trackers start pushing.'); return 0; }
  const have = new Set((S.cache.buses || []).map((b) => _normReg(b.regNo)));
  let added = 0;
  for (const f of fleet) {
    const reg = (f.reg || '').trim();
    if (!reg || have.has(_normReg(reg))) continue;     // already a bus with this plate → no duplicate
    const odo = Number(f.odometer) || 0;
    await DB.put('buses', {
      id: uid('b-'), regNo: reg, company: '', model: '', chassis: '', engine: '',
      odometer: odo, serviceIntervalKm: SERVICE_INTERVAL_KM, lastServiceOdo: odo,
      docs: [], photos: [], source: 'airfi',
    });
    have.add(_normReg(reg)); added++;
  }
  if (added) await load();
  if (!silent) { toast(added ? `Imported ${added} bus(es) from AirFi ✓` : 'Fleet already up to date'); rerender(); }
  return added;
}
// Runs silently in the background: de-dupe + drop demo buses, then pull any new
// AirFi plate as a bus. Throttled; owner/supervisor only. No UI, no buttons.
let _fleetReconciledAt = 0;
async function autoReconcileFleet() {
  if (!S.user || !can(S.user.role, 'addBus')) return;
  if (Date.now() - _fleetReconciledAt < 120000) return;          // at most every 2 min
  _fleetReconciledAt = Date.now();
  try {
    const removed = await cleanupFleet(true);
    const added = await importFleet(true);
    if ((removed || 0) + (added || 0) > 0 && S.route && S.route.name === 'buses') rerender();
  } catch (e) { /* background — ignore */ }
}

/* ----- Live map (Uber-style fleet tracking, Leaflet) ----- */
let _mapTimer = null, _busMap = null, _busMarkers = {};
function stopMap() { if (_mapTimer) { clearInterval(_mapTimer); _mapTimer = null; } _busMap = null; _busMarkers = {}; }
function viewLiveMap() {
  if (!window.L) { shell('Live map', `<div class="card"><div class="empty">📡 Live map needs an internet connection.<br>Reconnect and reopen.</div></div>`); return; }
  shell('Live map', `<div id="busmap" style="height:72vh;border-radius:16px;overflow:hidden;border:1px solid var(--line)"></div>
    <div id="map-meta" class="tiny muted" style="margin-top:8px;text-align:center">Loading live positions…</div>`);
  try {
    _busMap = L.map('busmap', { zoomControl: true }).setView([26.9, 75.8], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(_busMap);
  } catch (e) { return; }
  _busMarkers = {}; _busMap._fitted = false;
  refreshMap();
  clearInterval(_mapTimer); _mapTimer = setInterval(refreshMap, 20000);
}
async function refreshMap() {
  if (!_busMap || !window.L) return;
  let fleet = [];
  try { fleet = await Sync.fleet(); } catch (e) { /* offline */ }
  // Fallback for older servers whose /gps/fleet lacks coordinates: pull each
  // bus's latest position directly (capped so a huge fleet can't stampede).
  const missing = fleet.filter((f) => f.lat == null && f.reg).slice(0, 60);
  if (missing.length && Sync.latest) {
    const got = await Promise.all(missing.map((f) => Sync.latest(f.reg)));
    missing.forEach((f, i) => { const d = got[i]; if (d && d.lat != null) Object.assign(f, { lat: d.lat, lng: d.lng, speedKph: d.speedKph, ignition: d.ignition, lastPing: d.lastPing }); });
  }
  if (!_busMap) return;   // navigated away while awaiting
  const pts = [];
  fleet.forEach((f) => {
    if (f.lat == null || f.lng == null) return;
    pts.push([f.lat, f.lng]);
    const moving = (f.speedKph || 0) > 2 && f.ignition;
    const color = !f.ignition ? '#8b91a0' : (moving ? '#16a571' : '#f59e0b');
    const popup = `<b>${esc(f.reg)}</b><br>${Math.round(f.speedKph || 0)} km/h · ${f.ignition ? (moving ? 'running' : 'idling') : 'parked'}<br>${f.lastPing ? timeAgo(f.lastPing) : ''}`;
    if (_busMarkers[f.reg]) {
      _busMarkers[f.reg].setLatLng([f.lat, f.lng]); _busMarkers[f.reg].setStyle({ fillColor: color }); _busMarkers[f.reg].setPopupContent(popup);
    } else {
      const m = L.circleMarker([f.lat, f.lng], { radius: 9, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 }).addTo(_busMap).bindPopup(popup);
      // Tap a bus → open its live tracking page (map follows it + speedometer).
      m.on('click', () => { const bus = (S.cache.buses || []).find((x) => _normReg(x.regNo) === _normReg(f.reg)); if (bus) push({ name: 'track', id: bus.id }); });
      _busMarkers[f.reg] = m;
    }
  });
  const meta = $('#map-meta'); if (meta) meta.textContent = pts.length ? `${pts.length} buses live · 🟢 running · 🟡 idling · ⚪ parked · updates every 20s` : 'No live positions yet';
  if (pts.length && !_busMap._fitted) { try { _busMap.fitBounds(pts, { padding: [30, 30], maxZoom: 13 }); } catch (e) {} _busMap._fitted = true; }
}

/* ----- Single-bus live tracking: map follows the bus + live speedometer ----- */
let _trackTimer = null, _trackMap = null, _trackMarker = null;
function stopTrack() { if (_trackTimer) { clearInterval(_trackTimer); _trackTimer = null; } _trackMap = null; _trackMarker = null; }
// SVG semicircular speedometer (0–120 km/h) — needle + coloured progress arc.
function speedGauge(spd) {
  const max = 120, s = Math.max(0, Math.min(Number(spd) || 0, max));
  const theta = Math.PI * (1 - s / max);            // π at 0 km/h → 0 at max
  const cx = 100, cy = 96, r = 78;
  const ex = cx + r * Math.cos(theta), ey = cy - r * Math.sin(theta);
  const nx = cx + (r - 14) * Math.cos(theta), ny = cy - (r - 14) * Math.sin(theta);
  const col = s >= 80 ? '#ef4444' : s >= 40 ? '#f59e0b' : '#16a571';
  return `<svg viewBox="0 0 200 116" style="width:100%;max-width:230px;display:block;margin:2px auto 0">
    <path d="M${cx - r},${cy} A${r},${r} 0 0 1 ${cx + r},${cy}" fill="none" stroke="#e6e9f0" stroke-width="13" stroke-linecap="round"/>
    <path d="M${cx - r},${cy} A${r},${r} 0 0 1 ${ex},${ey}" fill="none" stroke="${col}" stroke-width="13" stroke-linecap="round"/>
    <line x1="${cx}" y1="${cy}" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="#161922" stroke-width="3.5" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy}" r="6" fill="#161922"/>
    <text x="${cx}" y="${cy - 20}" text-anchor="middle" style="font:800 30px -apple-system,sans-serif;fill:#161922">${Math.round(s)}</text>
    <text x="${cx}" y="${cy - 5}" text-anchor="middle" style="font:600 11px -apple-system,sans-serif;fill:#5d6675">km/h</text>
  </svg>`;
}
function trackPanel(b, d) {
  const moving = (d.speedKph || 0) > 2 && d.ignition;
  const status = !d.ignition ? '⚪ Parked' : (moving ? '🟢 Running' : '🟡 Idling');
  return `<div class="card" style="margin:0">
    <div class="row between"><b>${esc(b.regNo)}</b><span class="badge ${!d.ignition ? 'b-low' : (moving ? 'b-green' : 'b-amber')}">${status}</span></div>
    ${speedGauge(d.speedKph)}
    <div class="row between tiny muted" style="margin-top:4px"><span>${(d.odometer || 0).toLocaleString('en-IN')} km</span><span>${d.lastPing ? 'updated ' + timeAgo(d.lastPing) : ''}</span></div></div>`;
}
let _trackBusy = false;
function viewTrackBus(busId) {
  const b = byId(S.cache.buses, busId); if (!b) return viewBuses();
  if (!window.L) { shell('Live tracking', `<div class="card"><div class="empty">📡 Live tracking needs an internet connection.</div></div>`); return; }
  // Immersive full-screen map (no topbar) with its own floating Back button, so
  // there's always an obvious, reliable way out on every device.
  root().innerHTML =
    `<div id="trackmap" style="position:fixed;top:0;left:0;right:0;bottom:64px;z-index:1"></div>
     <button class="backbtn" data-act="back" aria-label="Back" style="position:fixed;top:14px;left:14px;z-index:1001">‹</button>
     <div id="track-panel" style="position:fixed;top:12px;left:62px;right:12px;z-index:1000"><div class="card" style="margin:0"><div class="tiny muted">Locating ${esc(b.regNo)}…</div></div></div>`
    + bottomnav();
  bind();
  try {
    _trackMap = L.map('trackmap', { zoomControl: false, attributionControl: false }).setView([26.9, 75.8], 13);
    L.control.zoom({ position: 'bottomright' }).addTo(_trackMap);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(_trackMap);
  } catch (e) { return; }
  _trackMarker = null; _trackBusy = false;
  trackTick(busId);
  clearInterval(_trackTimer); _trackTimer = setInterval(() => trackTick(busId), 1000);   // live, every second
}
async function trackTick(busId) {
  if (!_trackMap || !window.L || _trackBusy) return;     // guard: never stack requests
  const b = byId(S.cache.buses, busId); if (!b) return;
  _trackBusy = true;
  let d = null; try { d = await Sync.latest(b.regNo); } catch (e) { /* offline */ } finally { _trackBusy = false; }
  if (!_trackMap) return;                       // navigated away mid-await
  const panel = document.getElementById('track-panel');
  if (!d || d.lat == null) {
    const unlinked = /^unit\s/i.test(b.regNo);
    if (panel) panel.innerHTML = `<div class="card" style="margin:0">
      <div class="row between"><b>${esc(b.regNo)}</b><span class="badge b-low">no signal</span></div>
      <div class="tiny muted" style="margin-top:6px">${unlinked
        ? 'This bus isn\'t linked to its GPS device yet.'
        : 'No live signal right now — the bus is likely parked or switched off (the GPS reports only while the engine is on).'}</div>
      ${unlinked && ['owner', 'supervisor'].includes(S.user.role) ? '<div class="spacer"></div><button class="btn sm" data-act="openLinkGps">🛰️ Link GPS device</button>' : ''}</div>`;
    return;
  }
  const pos = [d.lat, d.lng];
  const moving = (d.speedKph || 0) > 2 && d.ignition;
  const color = !d.ignition ? '#8b91a0' : (moving ? '#16a571' : '#f59e0b');
  if (_trackMarker) { _trackMarker.setLatLng(pos); _trackMarker.setStyle({ fillColor: color }); }
  else { _trackMarker = L.circleMarker(pos, { radius: 11, color: '#fff', weight: 3, fillColor: color, fillOpacity: 1 }).addTo(_trackMap); _trackMap.setView(pos, 15); }
  _trackMap.panTo(pos, { animate: true, duration: 0.8 });   // follow the bus
  if (panel) panel.innerHTML = trackPanel(b, d);
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
    <div class="btnrow"><button class="btn sm" data-act="trackBus" data-bus="${b.id}">🛰️ Track live</button>
      <button class="btn sm" data-act="gps" data-bus="${b.id}">📍 GPS &amp; service</button></div>
    ${can(S.user.role, 'addFuel') ? `<div class="btnrow" style="margin-top:8px"><button class="btn sm" data-act="addFuel" data-bus="${b.id}">⛽ Log fuel</button>${busUsesDef(b) ? `<button class="btn sm" data-act="addDef" data-bus="${b.id}">🧪 Log AdBlue/DEF</button>` : ''}</div>` : ''}
    ${busUsesDef(b) ? (() => { const ds = defStatus(b); return `<div class="row between small" style="margin-top:10px"><span class="muted">AdBlue / DEF</span><span data-act="openDef" style="cursor:pointer">${ds.perHundred != null ? ds.perHundred.toFixed(1) + ' L/100km · ' : ''}${money(ds.costTotal)} ›</span></div>${ds.flag ? `<div class="tiny" style="color:${ds.flag.sev === 'high' ? 'var(--red)' : 'var(--amber)'};margin-top:3px">⚠️ ${esc(ds.flag.msg)}</div>` : ''}`; })() : ''}
  </div>`;

  // Route & crew (from the bus/route roster import)
  if (b.routeLabel || b.driverCrew || b.conductor || b.crewPhone) {
    body += `<div class="card"><h3>🧭 Route &amp; crew</h3>`;
    if (b.routeLabel) body += `<div class="row between small" style="padding:3px 0"><span class="muted">Route</span><b>${esc(expandRoute(b.routeLabel))}</b></div>`;
    if (b.driverCrew) body += `<div class="row between small" style="padding:3px 0"><span class="muted">Driver(s)</span><b>${esc(_titleCase(b.driverCrew))}</b></div>`;
    if (b.conductor) body += `<div class="row between small" style="padding:3px 0"><span class="muted">Conductor</span><b>${esc(_titleCase(b.conductor))}</b></div>`;
    if (b.crewPhone) body += `<div class="row between small" style="padding:3px 0"><span class="muted">Contact</span><a href="tel:${esc((b.crewPhone || '').replace(/\s/g, ''))}"><b>${esc(b.crewPhone)}</b></a></div>`;
    body += `</div>`;
  }

  // Fitted tyres & rotable components + their life
  const comps = componentsOfBus(b.id);
  if (comps.length || can(S.user.role, 'issuePart')) {
    body += `<div class="card"><div class="row between"><h3>🛞 Tyres &amp; components</h3>${can(S.user.role, 'issuePart') ? `<button class="btn sm" data-act="openComponents">All</button>` : ''}</div>`;
    body += comps.length ? comps.sort((a, c) => componentLife(c).pct - componentLife(a).pct).map((c) => { const lf = componentLife(c), km = compKind(c);
      return `<div class="li" data-act="openComp" data-id="${c.id}"><div class="ava">${km[0]}</div>
        <div class="main"><div class="t">${esc(c.label || km[1])}${c.position ? ` <span class="tiny muted">${esc(c.position)}</span>` : ''}</div>
          <div class="s">${c.state === 'sent-out' ? 'at ' + esc(lastHist(c).vendor || 'vendor') : lf.tracked ? lf.pct + '% worn · ' + lf.kmLeft.toLocaleString('en-IN') + ' km left' : COMP_STATE[c.state][0]}</div>
          ${lf.tracked && c.state === 'in-service' ? lifeBar(lf.pct, lf.status) : ''}</div>
        <span class="badge ${COMP_STATE[c.state][1]}">${COMP_STATE[c.state][0]}</span></div>`; }).join('')
      : `<div class="muted small">No components tracked on this bus yet.</div>`;
    body += `</div>`;
  }

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
const JOB_SC = { open: '#ef4444', 'in-progress': '#f59e0b', done: '#2563eb', verified: '#16a571' };
const PRIO_PILL = { high: '🔴 High', medium: '🟡 Medium', low: '🟢 Low' };
function jobLi(j) {
  const c = jobCost(j).total;
  const sc = JOB_SC[j.status] || '#8b91a0';
  const steps = ['open', 'in-progress', 'done', 'verified'];
  const idx = steps.indexOf(j.status);
  const dDays = jobDownDays(j);
  const stillDown = ['open', 'in-progress'].includes(j.status);
  return `<div class="jobcard" data-job="${j.id}" style="--sc:${sc}">
    <div class="jc-top">
      <div class="jc-bus">🚌 ${esc(busName(j.busId))}</div>
      ${statusBadge(j.status)}
    </div>
    <div class="jc-problem">${esc(j.problem)}</div>
    <div class="jc-meta">
      <span class="pp">${PRIO_PILL[j.priority] || ''}</span>
      <span>· 👷 ${esc(userName(j.assignedTo))}</span>
      <span>· ${fmtDate(j.createdAt)}</span>
      ${j.externalVendor ? '<span>· 🏪 outside</span>' : ''}
    </div>
    <div class="jc-foot">
      <span>💰 ${money(c)}</span>
      ${dDays >= 1 ? `<span style="color:#ef4444">🕒 ${dDays.toFixed(0)}d${stillDown ? '+' : ''} down</span>` : ''}
      ${(j.partsUsed || []).length ? `<span>🔩 ${j.partsUsed.length}</span>` : ''}
    </div>
    <div class="jc-prog">${steps.map((s, i) => `<i class="${i <= idx ? 'on' : ''}"></i>`).join('')}</div>
  </div>`;
}
// Jobs-list filter state (status + mechanic chips). Owned by supervisor dev.
const jobFilterState = { status: 'all', mech: 'all' };

// Is the current role a verifier? Verifiers see 'done' (awaiting verify) pinned
// to the top so the work waiting on their sign-off is impossible to miss.
function isVerifierRole() { return can(S.user.role, 'verifyJob'); }

// Renders the animated status + mechanic filter chips above the jobs board.
function jobsFilterBar() {
  let scoped = [...S.cache.jobs];
  if (S.user.role === 'mechanic') scoped = scoped.filter((j) => j.assignedTo === S.user.id);
  if (jobFilterState.mech !== 'all') scoped = scoped.filter((j) => j.assignedTo === jobFilterState.mech);
  const cnt = (s) => s === 'all' ? scoped.length : scoped.filter((j) => j.status === s).length;
  const statuses = [['all', t('filterAll')], ['open', t('open')], ['in-progress', t('statusInProgress')], ['done', t('toVerify')], ['verified', t('statusVerified')]];
  let bar = `<div class="chiprow">` + statuses.map(([v, l]) =>
    `<button class="chip ${jobFilterState.status === v ? 'active' : ''}" data-act="filterStatus" data-fstatus="${v}">${esc(l)} ${cnt(v)}</button>`).join('') + `</div>`;
  const mechs = S.cache.users.filter((u) => u.role === 'mechanic');
  if (S.user.role !== 'mechanic' && mechs.length) {
    bar += `<div class="chiprow"><button class="chip ${jobFilterState.mech === 'all' ? 'active' : ''}" data-act="filterMech" data-fmech="all">${t('filterAllMechs')}</button>` +
      mechs.map((m) => `<button class="chip ${jobFilterState.mech === m.id ? 'active' : ''}" data-act="filterMech" data-fmech="${m.id}">${esc(m.name)}</button>`).join('') + `</div>`;
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
  body += `<input id="job-search" class="searchbox" placeholder="Search bus or problem…" autocomplete="off">`;
  body += jobs.length ? `<div id="job-list">${jobs.map(jobLi).join('')}</div>` : `<div class="card" id="job-list"><div class="empty">${t('noJobsMatch')}</div></div>`;
  shell(t('jobs'), body, can(S.user.role, 'addJob') ? { act: 'addJob', icon: '+' } : null);
  attachSearch('job-search', 'job-list');
  const jl = document.getElementById('job-list'); if (jl) staggerRows(jl);
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

  // Old-part return (core) — anti-swap / anti-warranty-fraud
  const crs = j.coreReturns || [];
  if ((j.partsUsed || []).length || crs.length) {
    const missing = coreMissing(j);
    body += `<div class="card"><div class="row between"><h3>🔧 Old parts returned</h3>${editable && (j.partsUsed || []).length ? `<button class="btn sm" data-act="returnCore" data-job="${j.id}">📦 Return old part</button>` : ''}</div>`;
    body += crs.map((c) => { const p = byId(S.cache.parts, c.partId); const cc = CORE_COND[c.condition] || CORE_COND.worn;
      const ai = c.ai ? `<div class="tiny" style="margin-top:4px;color:${c.ai.verdict === 'suspect' ? '#ef4444' : '#5d6675'}">🤖 ${c.ai.wear}% worn · ${esc(c.ai.verdict)}${c.ai.note ? ' — ' + esc(c.ai.note) : ''}</div>` : '';
      const gradeBtn = (!c.ai && ['owner', 'supervisor'].includes(S.user.role)) ? `<div style="margin-top:6px"><button class="btn sm ghost" data-act="aiGradeCore" data-job="${j.id}" data-cr="${c.id}">📷 Grade wear</button></div>` : '';
      return `<div class="li"><img class="thumb" src="${c.photo}" data-act="viewPhoto" data-src="${c.photo}">
        <div class="main"><div class="t">${esc(p ? p.name : (c.note || 'Old part'))}</div><div class="s">${fmtDate(c.at)} · ${esc(userName(c.by))}</div>${ai}</div>
        <div style="text-align:right"><span class="badge ${cc[1]}">${cc[0]}</span>${gradeBtn}</div></div>`; }).join('');
    if (missing.length) body += `<div class="banner warn" style="margin-top:8px">⚠️ Old part not returned for: ${missing.map((l) => { const p = byId(S.cache.parts, l.partId); return esc(p ? p.name : l.partId); }).join(', ')}. Get the worn part back before paying.</div>`;
    body += `</div>`;
  }

  // Outside repair
  if (j.externalVendor) {
    body += `<div class="card"><h3>Outside repair</h3>
      <div class="row between small"><span>${esc(j.externalVendor)}</span><b>${money(j.externalCost)}</b></div></div>`;
  }

  // Cost summary — repair cost + the lost-revenue from downtime
  const dDays = jobDownDays(j), dLost = Math.round(dDays * dailyRev(bus || {}));
  const stillDown = ['open', 'in-progress'].includes(j.status);
  body += `<div class="card"><h3>Cost &amp; impact</h3>
    <div class="row between small"><span>Parts</span><b>${money(cost.parts)}</b></div>
    <div class="row between small"><span>Labour (${j.labourHours||0} hr)</span><b>${money(cost.labour)}</b></div>
    ${cost.ext?`<div class="row between small"><span>Outside</span><b>${money(cost.ext)}</b></div>`:''}
    <div class="row between small"><span>🕒 Downtime ${dDays.toFixed(1)}d${stillDown ? ' (ongoing)' : ''} · lost revenue</span><b style="color:#ef4444">${money(dLost)}</b></div>
    <div class="hr"></div>
    <div class="row between"><b>Repair cost</b><b style="color:var(--brand2)">${money(cost.total)}</b></div>
    <div class="row between"><b>Total impact</b><b style="color:#ef4444">${money(cost.total + dLost)}</b></div></div>`;

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

/* ===== Anti-pilferage #1 — old-part return ("core return") ================
 * To stop "replaced on paper only" + part-swap fraud, the OLD removed part must
 * be returned to store and photographed. The returner grades its wear; a part
 * billed as worn-out that looks new is the fraud signal the owner reviews.
 * (An on-device wear grade — see gradePartWear — gives a second opinion; no key.) */
const CORE_COND = { worn: ['Worn out ✓', 'b-green'], partial: ['Part-worn', 'b-amber'], suspect: ['Looks new ⚠️', 'b-red'] };
const coreMissing = (j) => {
  const ret = new Set((j.coreReturns || []).map((c) => c.partId).filter(Boolean));
  return (j.partsUsed || []).filter((l) => !ret.has(l.partId));
};
let _coreShot = null;
function sheetReturnCore(jobId) {
  const j = byId(S.cache.jobs, jobId); if (!j) return;
  _coreShot = null;
  const used = j.partsUsed || [];
  const opts = used.map((l) => { const p = byId(S.cache.parts, l.partId); return `<option value="${l.partId}">${esc(p ? p.name : l.partId)}</option>`; }).join('');
  openSheet('Return old part', `
    <div class="tiny muted" style="margin-bottom:10px">Bring the OLD removed part back to store so it can't be re-sold or swapped. Photograph it as proof.</div>
    ${used.length ? `<label class="field"><span class="lbl">Old core of which part?</span><select id="cr-part">${opts}<option value="">Other / consumable</option></select></label>` : `<input type="hidden" id="cr-part" value="">`}
    <button class="btn" data-act="captureCore">📷 Photo of old part</button>
    <div id="cr-prev" class="thumbs" style="margin:8px 0"></div>
    <label class="field"><span class="lbl">Condition of the old part</span><select id="cr-cond">
      <option value="worn">Worn out — genuinely needed replacing</option>
      <option value="partial">Partly worn</option>
      <option value="suspect">Looks almost new — suspicious</option></select></label>
    <label class="field"><span class="lbl">Note (optional)</span><input id="cr-note" placeholder="e.g. front brake pad, fully worn"></label>
    <button class="btn primary" data-act="saveCoreReturn" data-job="${jobId}">${t('save')}</button>`);
}
async function captureCore() {
  const shot = await capturePhoto(); if (!shot) return;
  _coreShot = shot; const prev = $('#cr-prev'); if (prev) prev.innerHTML = `<img class="thumb" src="${shot}">`;
}
async function saveCoreReturn(jobId) {
  const j = byId(S.cache.jobs, jobId); if (!j) return;
  if (!_coreShot) return toast('Take a photo of the old part first');
  const src = await Sync.uploadPhoto(_coreShot) || _coreShot;
  const entry = { id: uid('cr-'), partId: ($('#cr-part') || {}).value || '', photo: src,
    condition: ($('#cr-cond') || {}).value || 'worn', note: ($('#cr-note') || {}).value.trim() || '', at: Date.now(), by: S.user.id };
  j.coreReturns = [...(j.coreReturns || []), entry];
  await DB.put('jobcards', j);
  _coreShot = null; await load(); closeSheet(); toast('Old part recorded ✓'); viewJobDetail(jobId);
}
/* ===== On-device vision (no API key, no Anthropic) =======================
 * Replaces the old server /ai/vision (Anthropic) proxy with two free, fully
 * client-side capabilities that run on the phone:
 *   • OCR        — Tesseract.js (lazy-loaded from CDN, then cached) reads a
 *                  serial / part number / ID number off a photo.
 *   • Wear grade — a canvas pixel heuristic estimates how worn a returned old
 *                  part looks: rust/corrosion + grime + a rough, pitted surface
 *                  read as "worn"; a bright, shiny, smooth surface reads as
 *                  "suspect" (too new to justify replacement — the swap signal).
 * Both work offline once the OCR engine is cached and need no env keys. */
let _tessLoad = null;
function ensureTesseract() {
  if (window.Tesseract) return Promise.resolve(true);
  if (_tessLoad) return _tessLoad;
  _tessLoad = new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    s.onload = () => resolve(!!window.Tesseract);
    s.onerror = () => { _tessLoad = null; resolve(false); };
    document.head.appendChild(s);
  });
  return _tessLoad;
}
// OCR a data-URL image → recognised text (trimmed). opts.whitelist restricts the
// character set (e.g. serials). Returns '' if the engine can't load or read.
async function localOcr(dataUrl, opts = {}) {
  if (!(await ensureTesseract())) return '';
  let worker = null;
  try {
    worker = await Tesseract.createWorker('eng');
    if (opts.whitelist) await worker.setParameters({ tessedit_char_whitelist: opts.whitelist });
    const { data } = await worker.recognize(dataUrl);
    return (data && data.text || '').replace(/\s+/g, ' ').trim();
  } catch (e) { return ''; }
  finally { if (worker) { try { await worker.terminate(); } catch (e) {} } }
}
// Heuristic wear grade from a photo (data URL) → {wear:0-100, verdict, note} or
// null. Samples a downscaled canvas: orange/brown corrosion + dark grime + a
// rough (high-gradient) surface push wear up; bright specular highlights on a
// smooth surface push it down (→ "suspect", looks too new).
async function gradePartWear(dataUrl) {
  const img = await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = dataUrl; });
  if (!img || !img.width) return null;
  const W = 160, H = Math.max(1, Math.round(W * img.height / img.width));
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, W, H);
  let px; try { px = ctx.getImageData(0, 0, W, H).data; } catch (e) { return null; }
  const N = W * H, lum = new Float32Array(N);
  let rust = 0, dark = 0, shiny = 0;
  for (let i = 0; i < N; i++) {
    const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
    const L = r * 0.299 + g * 0.587 + b * 0.114; lum[i] = L;
    if (r > g && g >= b && r - b > 35 && L > 45 && L < 205) rust++;   // rust / corrosion / dirt (orange-brown)
    if (L < 55) dark++;                                              // grime, oil, deep wear shadow
    if (L > 225) shiny++;                                            // specular highlight → polished metal
  }
  let grad = 0, gc = 0;                                             // mean gradient = surface roughness (scratches/pitting)
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x, gx = lum[i + 1] - lum[i - 1], gy = lum[i + W] - lum[i - W];
    grad += Math.sqrt(gx * gx + gy * gy); gc++;
  }
  const rustS = Math.min(1, (rust / N) * 5);
  const grimeS = Math.min(1, (dark / N) * 3);
  const texS = Math.min(1, (grad / Math.max(1, gc)) / 40);
  const shineS = Math.min(1, (shiny / N) * 6);
  const wear = Math.max(0, Math.min(100, Math.round(100 * (0.45 * rustS + 0.20 * grimeS + 0.25 * texS - 0.30 * shineS))));
  let verdict = 'ok';
  if (wear >= 55) verdict = 'worn';
  else if (wear <= 22 || shineS > 0.6) verdict = 'suspect';
  const bits = [];
  if (rustS > 0.4) bits.push('corrosion/rust');
  if (grimeS > 0.4) bits.push('heavy grime');
  if (texS > 0.5) bits.push('rough/pitted surface');
  if (shineS > 0.5) bits.push('shiny — looks little-used');
  return { wear, verdict, note: (bits.join(', ') || 'moderately used surface').slice(0, 80) };
}

// On-device wear grade for a returned old part (anti-swap fraud) — no API key.
async function aiGradeCore(jobId, crId) {
  const j = byId(S.cache.jobs, jobId); if (!j) return;
  const cr = (j.coreReturns || []).find((c) => c.id === crId); if (!cr || !cr.photo) return;
  const stop = showBusyOverlay('Checking the part…');
  const v = await gradePartWear(cr.photo);
  if (stop) stop();
  if (!v) return toast('Could not read the photo — try a clearer, closer shot');
  cr.ai = { wear: v.wear, verdict: v.verdict, note: v.note, at: Date.now(), engine: 'on-device' };
  await DB.put('jobcards', j); await load(); toast(`Est. ${v.wear}% worn (${v.verdict})`); viewJobDetail(jobId);
}
// On-device OCR: read a part's serial / part number from a photo into a field.
async function scanSerial(targetId) {
  const shot = await capturePhoto(); if (!shot) return;
  const stop = showBusyOverlay('Reading serial…');
  const text = await localOcr(shot, { whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-/' });
  if (stop) stop();
  // A serial/part number almost always carries digits — prefer the longest
  // digit-bearing token so we skip label words like "PART NO" / brand names.
  const toks = (text.toUpperCase().match(/[A-Z0-9][A-Z0-9\-\/]{3,}/g) || []);
  const withDigit = toks.filter((x) => /[0-9]/.test(x));
  const s = (withDigit.length ? withDigit : toks).sort((a, b) => b.length - a.length)[0] || '';
  const el = document.getElementById(targetId);
  if (el && s) { el.value = s; toast('Serial: ' + s); }
  else toast(text ? 'Read "' + text.slice(0, 30) + '" — edit if wrong' : 'Could not read a serial — type it in');
}

/* ===== Anti-pilferage #2 — warranty register + guard =====================
 * A part's fitment history already lives in job records (partsUsed + busId +
 * date). If the same part is replaced again on the same bus inside its warranty
 * window, the replacement should be a FREE supplier claim — so we flag it, and
 * flag any job that *charged* for a still-under-warranty part. */
function warrantyStatus(busId, partId, asOf = Date.now(), beforeTime = null) {
  const p = byId(S.cache.parts, partId);
  const months = p ? Number(p.warrantyMonths) || 0 : 0;
  if (!months) return null;
  const cut = beforeTime == null ? asOf : beforeTime;
  const fits = S.cache.jobs.filter((j) => j.busId === busId && (j.partsUsed || []).some((l) => l.partId === partId))
    .map((j) => j.closedAt || j.createdAt).filter((tm) => tm < cut).sort((a, b) => b - a);
  if (!fits.length) return null;
  const fitAt = fits[0];
  const leftDays = Math.round(months * 30 - (asOf - fitAt) / 86400000);
  return { underWarranty: leftDays > 0, supplier: (p.supplier || ''), fitAt, leftDays, months };
}
function viewWarranty() {
  // Latest under-warranty fitment per (bus, part).
  const seen = {}; const rows = [];
  S.cache.jobs.forEach((j) => (j.partsUsed || []).forEach((l) => {
    const key = j.busId + '|' + l.partId;
    const st = warrantyStatus(j.busId, l.partId);
    if (st && st.underWarranty && !seen[key]) { seen[key] = 1; const p = byId(S.cache.parts, l.partId);
      rows.push({ bus: busName(j.busId), part: p ? p.name : l.partId, st }); }
  }));
  rows.sort((a, b) => a.st.leftDays - b.st.leftDays);
  let body = `<div class="card"><div class="tiny muted">Parts still under supplier warranty. If one fails now, claim a FREE replacement — don't pay for it.</div></div>`;
  body += `<div class="card"><h3>Under warranty (${rows.length})</h3>`;
  body += rows.length ? rows.map((r) => `<div class="li"><div class="ava">🛡️</div>
    <div class="main"><div class="t">${esc(r.part)} · ${esc(r.bus)}</div>
      <div class="s">${r.st.supplier ? esc(r.st.supplier) + ' · ' : ''}fitted ${fmtDate(r.st.fitAt)}</div></div>
    <span class="badge ${r.st.leftDays < 30 ? 'b-amber' : 'b-green'}">${r.st.leftDays}d left</span></div>`).join('')
    : `<div class="empty">No parts under warranty.<br><span class="tiny">Set a warranty period when adding a part type.</span></div>`;
  body += `</div>`;
  shell('Warranty register', body);
}

/* ===== Anti-pilferage #3 — reconciliation + shrinkage scorecard ===========
 * Book-keeping always balances; physical counts catch theft. A stock count
 * compares counted vs system qty → the shortfall (valued in ₹) is shrinkage,
 * which feeds a store trust score. Blind counts hide system totals so the
 * counter can't just echo them. */
function storeStats() {
  const parts = S.cache.parts || [], ledger = S.cache.ledger || [], audits = S.cache.audits || [];
  const cost = (pid) => { const p = byId(parts, pid); return p ? (p.unitCost || 0) : 0; };
  const stockValue = parts.reduce((s, p) => s + p.qty * (p.unitCost || 0), 0);
  let receivedValue = 0, issuedValue = 0;
  ledger.forEach((l) => { const v = l.qty * cost(l.partId);
    if (l.type === 'in' && !/surplus/i.test(l.reason || '')) receivedValue += v;
    if (l.type === 'out' && !/shortfall|shrink/i.test(l.reason || '')) issuedValue += v;
  });
  const shrinkValue = audits.reduce((s, a) => s + (a.shrinkValue || 0), 0);
  const throughput = issuedValue + shrinkValue;
  const shrinkPct = throughput > 0 ? shrinkValue / throughput * 100 : 0;
  const lastAudit = audits.length ? audits.slice().sort((a, b) => b.at - a.at)[0] : null;
  const trust = Math.max(0, Math.round(100 - Math.min(60, shrinkPct * 3)));
  return { stockValue, receivedValue, issuedValue, shrinkValue, shrinkPct, lastAudit, trust, count: audits.length };
}
function viewStoreHealth() {
  const st = storeStats();
  const tcol = st.trust >= 80 ? 'var(--green)' : st.trust >= 50 ? '#f59e0b' : '#ef4444';
  let body = `<div class="card"><div class="row between">
      <div><div class="muted small">Store trust score</div><div class="stat" style="color:${tcol}">${st.trust}<span style="font-size:14px">/100</span></div></div>
      <div style="text-align:right"><div class="muted small">Shrinkage</div><div class="stat" style="color:#ef4444">${money(st.shrinkValue)}</div><div class="tiny muted">${st.shrinkPct.toFixed(1)}% of throughput</div></div></div>
    ${st.lastAudit ? `<div class="tiny muted">Last count ${fmtDate(st.lastAudit.at)}` + (st.count ? ` · ${st.count} total` : '') + `</div>` : `<div class="tiny muted">No stock count yet — run one to baseline.</div>`}</div>`;
  body += `<div class="card"><h3>Reconciliation</h3>
    <div class="row between small"><span>Stock received</span><b>${money(st.receivedValue)}</b></div>
    <div class="row between small"><span>Issued to jobs</span><b>${money(st.issuedValue)}</b></div>
    <div class="row between small"><span>On hand now</span><b>${money(st.stockValue)}</b></div>
    <div class="hr"></div>
    <div class="row between"><b>Unexplained shrinkage</b><b style="color:#ef4444">${money(st.shrinkValue)}</b></div>
    <div class="tiny muted" style="margin-top:6px">Parts gone without an issue-to-job — the pilferage signal.</div></div>`;
  if (can(S.user.role, 'issuePart')) body += `<div class="btnrow"><button class="btn primary" data-act="auditBlind">🎲 Blind count</button><button class="btn" data-act="auditFull">📋 Full count</button></div>`;
  const stores = (S.cache.users || []).filter((u) => u.role === 'store');
  if (stores.length) {
    body += `<div class="card"><h3>Storekeepers</h3>` + stores.map((u) => {
      const issued = (S.cache.ledger || []).filter((l) => l.type === 'out' && l.by === u.id).length;
      const did = (S.cache.audits || []).filter((a) => a.by === u.id).length;
      return `<div class="li"><div class="ava">📦</div><div class="main"><div class="t">${esc(u.name)}</div><div class="s">${issued} issues · ${did} count(s) done</div></div></div>`;
    }).join('') + `</div>`;
  }
  const recent = (S.cache.audits || []).slice().sort((a, b) => b.at - a.at).slice(0, 8);
  body += `<div class="card"><h3>Recent counts</h3>` + (recent.length ? recent.map((a) => `<div class="li"><div class="ava">${a.shrinkValue > 0 ? '⚠️' : '✓'}</div>
    <div class="main"><div class="t">${a.lines.length} parts · ${a.shrinkValue > 0 ? money(a.shrinkValue) + ' short' : 'matched'}</div>
      <div class="s">${fmtDateTime(a.at)} · ${esc(userName(a.by))} · ${a.mode}</div></div></div>`).join('') : `<div class="empty">No stock counts yet</div>`) + `</div>`;
  shell('Store health', body);
}
function sheetAudit(mode) {
  let parts = [...(S.cache.parts || [])];
  if (!parts.length) return openSheet('Stock count', `<div class="banner warn">No parts to count yet.</div>`);
  if (mode === 'blind') parts = parts.sort(() => Math.random() - 0.5).slice(0, Math.min(5, parts.length));
  else parts = parts.sort((a, b) => a.name.localeCompare(b.name));
  openSheet(mode === 'blind' ? 'Blind count' : 'Full count', `
    <div class="tiny muted" style="margin-bottom:10px">${mode === 'blind' ? 'Physically count these parts and enter the actual number. System totals are hidden to keep it honest.' : 'Enter the physical count for each part.'}</div>
    ${parts.map((p) => `<label class="field"><span class="lbl">${esc(p.name)}${mode === 'full' ? ` <span class="tiny muted">(system ${p.qty} ${p.unit})</span>` : ''}</span>
      <input class="au-count" data-pid="${p.id}" type="number" inputmode="numeric" placeholder="counted ${esc(p.unit)}"></label>`).join('')}
    <button class="btn primary" data-act="saveAudit" data-mode="${mode}">Submit count</button>`);
}
async function saveAudit(mode) {
  const inputs = [...document.querySelectorAll('.au-count')];
  const lines = []; let shrink = 0, found = 0;
  for (const inp of inputs) {
    if (inp.value === '') continue;
    const p = byId(S.cache.parts, inp.getAttribute('data-pid')); if (!p) continue;
    const counted = Math.max(0, Math.round(Number(inp.value) || 0));
    const system = p.qty, variance = counted - system, val = Math.abs(variance) * (p.unitCost || 0);
    lines.push({ partId: p.id, system, counted, variance, value: variance < 0 ? val : 0 });
    if (variance !== 0) {
      if (variance < 0) { shrink += val; await DB.put('ledger', { id: uid('l-'), partId: p.id, type: 'out', qty: -variance, jobId: null, reason: 'Audit shortfall (shrinkage)', by: S.user.id, at: Date.now() }); }
      else { found += val; await DB.put('ledger', { id: uid('l-'), partId: p.id, type: 'in', qty: variance, jobId: null, reason: 'Audit surplus', by: S.user.id, at: Date.now() }); }
      p.qty = counted; await DB.put('parts', p);
    }
  }
  if (!lines.length) return toast('Enter at least one count');
  await DB.put('audits', { id: uid('au-'), at: Date.now(), by: S.user.id, mode, lines, shrinkValue: shrink, foundValue: found });
  await load(); closeSheet();
  toast(shrink > 0 ? `Count saved · ${money(shrink)} shrinkage found` : 'Count saved · stock matches ✓');
  rerender();
}

/* ===== Link AirFi GPS devices to fleet units (turn on live tracking) ====== */
function viewLinkGps() {
  shell('Link GPS to buses', `<div id="gpslink"><div class="card"><div class="muted small">Loading AirFi devices…</div></div></div>`);
  loadGpsLinks();
}
async function loadGpsLinks() {
  let fleet = []; try { fleet = await Sync.fleet(); } catch (e) { /* offline */ }
  const buses = S.cache.buses || [];
  const matched = [], unmatched = [];
  fleet.forEach((f) => { const b = buses.find((x) => _normReg(x.regNo) === _normReg(f.reg)); (b ? matched : unmatched).push({ f, b }); });
  const units = buses.filter((b) => /^unit\s/i.test(b.regNo) || b.source === 'klm-excel');
  let h = `<div class="card"><div class="tiny muted">AirFi reports by registration plate. Match each live device to its bus (unit) — that switches on live tracking + safety scoring for it. A device only appears here while its bus is powered on.</div></div>`;
  h += `<div class="card"><h3>Unlinked devices (${unmatched.length})</h3>`;
  h += unmatched.length ? unmatched.map(({ f }) => `<div class="li"><div class="ava">🛰️</div>
      <div class="main"><div class="t">${esc(f.reg)}</div><div class="s">${Math.round(f.speedKph || 0)} km/h · odo ${(f.odometer || 0).toLocaleString('en-IN')}</div></div>
      <select class="gpslink-sel" data-reg="${esc(f.reg)}" data-odo="${f.odometer || 0}"><option value="">Assign to…</option>${units.map((u) => `<option value="${u.id}">${esc(u.regNo)}${u.company ? ' · ' + esc(u.company) : ''}</option>`).join('')}</select></div>`).join('') : `<div class="muted small">No unlinked devices reporting right now.</div>`;
  h += `</div>`;
  h += `<div class="card"><h3>Linked &amp; tracking (${matched.length})</h3>` + (matched.length ? matched.map(({ b }) => `<div class="li"><div class="ava">✅</div><div class="main"><div class="t">${esc(b.regNo)}</div><div class="s">live GPS active</div></div></div>`).join('') : `<div class="muted small">None yet — assign a device above.</div>`) + `</div>`;
  const box = document.getElementById('gpslink'); if (!box) return;
  box.innerHTML = h;
  box.querySelectorAll('.gpslink-sel').forEach((sel) => { sel.onchange = () => { if (sel.value) linkGps(sel.value, sel.getAttribute('data-reg'), Number(sel.getAttribute('data-odo'))); }; });
}
async function linkGps(busId, reg, odo) {
  const b = byId(S.cache.buses, busId); if (!b) return;
  if (!confirm(`Set "${b.regNo}" to its real plate ${reg}? This links the bus to its live GPS.`)) return;
  b.regNo = reg;
  if (odo > 0) { b.odometer = Math.max(b.odometer || 0, odo); if (!b.lastServiceOdo) b.lastServiceOdo = odo; }
  await DB.put('buses', b); await load(); toast(`${reg} linked ✓ — now tracking live`); viewLinkGps();
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

  body += `<input id="part-search" class="searchbox" placeholder="Search part name, no. or category…" autocomplete="off">`;
  body += `<div class="card"><h3>Parts</h3><div id="part-list"></div></div>`;

  shell(t('store'), body, can(S.user.role,'addPurchase') ? { act: 'addPurchase', icon: '📄' } : null);
  // Big catalogues (thousands of parts from an Excel import) render capped + search
  // filters from the cache, so the store stays fast.
  renderStorePartList('');
  const inp = document.getElementById('part-search'); if (inp) inp.oninput = () => renderStorePartList(inp.value.trim().toLowerCase());
}
const STORE_LIST_CAP = 250;
function renderStorePartList(ql) {
  const box = document.getElementById('part-list'); if (!box) return;
  let parts = [...(S.cache.parts || [])].sort((a, b) => (a.qty <= a.reorderLevel ? -1 : 1) - (b.qty <= b.reorderLevel ? -1 : 1));
  if (ql) parts = parts.filter((p) => `${p.name} ${p.partNo || ''} ${p.category || ''}`.toLowerCase().includes(ql));
  const total = parts.length, shown = parts.slice(0, STORE_LIST_CAP);
  box.innerHTML = (shown.map((p) => {
    const lowf = p.qty <= p.reorderLevel;
    return `<div class="li" data-part="${p.id}">${avatar(partImg(p), '🔩')}
      <div class="main"><div class="t">${esc(p.name)}</div><div class="s">${esc(p.partNo || '—')}${p.category ? ' · ' + esc(p.category) : ''}${p.reusable ? ' · ♻️ reusable' : ''} · ${money(p.unitCost)}/${p.unit}</div></div>
      <div style="text-align:right"><b>${p.qty}</b> <span class="tiny muted">${p.unit}</span>${lowf ? '<div class="badge b-amber tiny">LOW</div>' : ''}</div></div>`;
  }).join('')) + (total > STORE_LIST_CAP ? `<div class="tiny muted" style="padding:9px 2px">Showing ${STORE_LIST_CAP} of ${total.toLocaleString('en-IN')} parts — type to search the rest.</div>` : (total === 0 ? '<div class="empty">No matching parts</div>' : ''));
  staggerRows(box);
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
    </div>${isTrackablePart(p) ? '<div class="tiny" style="margin-top:8px;color:var(--brand2)">🔧 Rotable part — track each piece as a component (life + remould/repair history).</div>' : ''}</div>`;

  // Only sensible rotables (tyres, alternators…) offer per-piece tracking; a card
  // still shows for any part that already has pieces tracked against it.
  const _comps = componentsOfPart(id);
  if (isTrackablePart(p) || _comps.length) {
    const comps = _comps;
    body += `<div class="card"><div class="row between"><h3>🛞 Tracked pieces</h3>${can(S.user.role, 'issuePart') && isTrackablePart(p) ? `<button class="btn sm" data-act="compFromPart" data-id="${p.id}">+ Track a piece</button>` : ''}</div>`;
    body += comps.length ? comps.map((c) => { const lf = componentLife(c), km = compKind(c);
      return `<div class="li" data-act="openComp" data-id="${c.id}"><div class="ava">${km[0]}</div>
        <div class="main"><div class="t">${esc(c.label || km[1])}${c.serial ? ` <span class="tiny muted">${esc(c.serial)}</span>` : ''}</div>
          <div class="s">${compSubtitle(c)}${lf.tracked && c.state === 'in-service' ? ' · ' + lf.pct + '% worn' : ''}</div></div>
        <span class="badge ${COMP_STATE[c.state][1]}">${COMP_STATE[c.state][0]}</span></div>`; }).join('')
      : `<div class="muted small">No pieces tracked yet. Tap “+ Track a piece” when you buy or fit one.</div>`;
    body += `</div>`;
  }

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

/* ===== Rotable components — tyres, alternators & other refurbishable units ====
 * Durable items tracked PER PIECE (not consumable stock). Each carries a life in
 * km and a full lifecycle: fit to a bus → wear down → send OUT to a vendor for
 * remould/rewind (their bill is captured on return) → refit → and finally scrap
 * once refurbished its allowed number of times. This gives true per-unit part-life
 * and captures the outside-repair bills (tyre remould, alternator rewind). */
const COMP_KINDS = {
  tyre:       ['🛞', 'Tyre',       'remould',     60000, 2],
  alternator: ['🔌', 'Alternator', 'rewind',      0,     5],
  starter:    ['🔩', 'Starter',    'repair',      0,     4],
  battery:    ['🔋', 'Battery',    'recondition', 0,     2],
  injector:   ['💉', 'Injector',   'recondition', 0,     3],
  other:      ['⚙️', 'Component',  'repair',      0,     3],
};
const COMP_STATE = {
  'in-service':  ['In service', 'b-green'],
  'removed':     ['In store',   'b-low'],
  'sent-out':    ['At vendor',  'b-amber'],
  'refurbished': ['Refurbished','b-green'],
  'scrapped':    ['Scrapped',   'b-red'],
};
const compKind = (c) => COMP_KINDS[c.kind] || COMP_KINDS.other;
const compVerb = (c) => compKind(c)[2];                     // remould / rewind / repair
const lastHist = (c) => (c.history && c.history.length ? c.history[c.history.length - 1] : {}) || {};
// Life used from the odometer of the bus it's fitted to (km since last install/refurb).
function componentLife(c) {
  if (!c.lifeKm) return { tracked: false, pct: 0, kmUsed: 0, kmLeft: 0, status: 'ok' };
  const bus = c.busId ? byId(S.cache.buses, c.busId) : null;
  const odo = bus ? (bus.odometer || 0) : 0;
  const kmUsed = c.state === 'in-service' && c.installedOdo != null && odo > c.installedOdo ? odo - c.installedOdo : 0;
  const kmLeft = Math.max(0, c.lifeKm - kmUsed);
  const pct = Math.min(100, Math.round(kmUsed / c.lifeKm * 100));
  const status = pct >= 100 ? 'overdue' : pct >= 85 ? 'soon' : 'ok';
  return { tracked: true, pct, kmUsed, kmLeft, status };
}
const lifeColor = (s) => (s === 'overdue' ? 'var(--red)' : s === 'soon' ? 'var(--amber)' : 'var(--green)');
function lifeBar(pct, status) {
  return `<div style="height:5px;background:var(--line);border-radius:3px;margin-top:6px;overflow:hidden"><i style="display:block;height:100%;width:${pct}%;background:${lifeColor(status)}"></i></div>`;
}
const componentsOfBus = (busId) => (S.cache.components || []).filter((c) => c.busId === busId && c.state !== 'scrapped');
// Components needing attention: worn (>=85% life) & in service, or sitting at a vendor.
function componentAlerts() {
  const out = [];
  (S.cache.components || []).forEach((c) => {
    if (c.state === 'scrapped') return;
    if (c.state === 'sent-out') { out.push({ c, status: 'at-vendor', msg: `${compKind(c)[1]} at ${lastHist(c).vendor || 'vendor'} for ${compVerb(c)}` }); return; }
    const lf = componentLife(c);
    if (c.state === 'in-service' && lf.tracked && lf.status !== 'ok')
      out.push({ c, status: lf.status, msg: `${compKind(c)[1]}${c.position ? ' ' + c.position : ''} on ${busName(c.busId)} — ${lf.pct}% worn${lf.status === 'overdue' ? ` · ${compVerb(c)} or replace` : ''}` });
  });
  return out;
}
const compSubtitle = (c) => c.state === 'sent-out' ? `at ${esc(lastHist(c).vendor || 'vendor')} · ${compVerb(c)}`
  : c.busId ? `${esc(busName(c.busId))}${c.position ? ' · ' + esc(c.position) : ''}` : 'in store';

let _compFilter = 'all';
const COMP_RANK = { 'sent-out': 0, 'in-service': 1, 'refurbished': 2, 'removed': 3, 'scrapped': 4 };
function compLi(c) {
  const km = compKind(c), st = COMP_STATE[c.state] || COMP_STATE['in-service'], lf = componentLife(c);
  const showBar = lf.tracked && c.state === 'in-service';
  return `<div class="li" data-act="openComp" data-id="${c.id}">
    <div class="ava">${km[0]}</div>
    <div class="main"><div class="t">${esc(c.label || km[1])}${c.serial ? ` <span class="tiny muted">${esc(c.serial)}</span>` : ''}</div>
      <div class="s">${compSubtitle(c)}${showBar ? ` · ${lf.pct}% worn` : ''}${c.refurbCount ? ` · ${compVerb(c)}×${c.refurbCount}` : ''}</div>
      ${showBar ? lifeBar(lf.pct, lf.status) : ''}</div>
    <span class="badge ${st[1]}">${st[0]}</span></div>`;
}
function viewComponents() {
  const comps = (S.cache.components || []);
  const alerts = componentAlerts();
  let body = `<div class="card"><div class="tiny muted">Tyres, alternators & other durable units tracked per piece — life in km, and every send-out for remould/rewind with the vendor's bill. Tap one for its history.</div></div>`;
  if (alerts.length) body += `<div class="card" style="border:1.5px solid var(--amber)"><div class="row between"><h3>⚠️ Needs attention</h3><span class="badge b-amber">${alerts.length}</span></div>
    ${alerts.map((a) => `<div class="li" data-act="openComp" data-id="${a.c.id}" style="border:none;padding:6px 0"><div class="ava">${compKind(a.c)[0]}</div><div class="main"><div class="s">${a.msg}</div></div></div>`).join('')}</div>`;
  const kinds = ['all', ...Object.keys(COMP_KINDS).filter((k) => comps.some((c) => c.kind === k))];
  body += `<div class="chiprow">${kinds.map((k) => `<button class="chip ${_compFilter === k ? 'active' : ''}" data-act="compFilter" data-v="${k}">${k === 'all' ? 'All' : COMP_KINDS[k][0] + ' ' + COMP_KINDS[k][1]}</button>`).join('')}</div>`;
  const list = comps.filter((c) => _compFilter === 'all' || c.kind === _compFilter)
    .sort((a, b) => (COMP_RANK[a.state] - COMP_RANK[b.state]) || (componentLife(b).pct - componentLife(a).pct));
  body += list.length ? `<div class="card" style="padding:6px 12px">${list.map(compLi).join('')}</div>` : `<div class="empty">No components yet — tap + to add a tyre or a part you refurbish.</div>`;
  shell('Tyres & components', body, can(S.user.role, 'issuePart') ? { act: 'addComponent', icon: '+' } : null);
}
const HIST_ICON = { install: '🔧', remove: '📤', 'send-out': '🚚', return: '📥', scrap: '🗑️' };
function viewComponentDetail(id) {
  const c = byId(S.cache.components, id); if (!c) return viewComponents();
  const km = compKind(c), st = COMP_STATE[c.state] || COMP_STATE['in-service'], lf = componentLife(c), v = compVerb(c);
  const canEdit = can(S.user.role, 'issuePart');
  const atMax = c.refurbCount >= (c.maxRefurb || 0);
  const srcPart = c.partId ? byId(S.cache.parts, c.partId) : null;
  let body = `<div class="card"><div class="row between"><div class="row" style="gap:10px"><div class="ava" style="font-size:24px">${km[0]}</div>
    <div><div style="font-weight:800;font-size:17px">${esc(c.label || km[1])}</div><div class="small muted">${km[1]}${c.serial ? ' · ' + esc(c.serial) : ''}</div></div></div>
    <span class="badge ${st[1]}" style="font-size:14px">${st[0]}</span></div>
    ${srcPart ? `<div class="tiny" style="margin-top:8px"><span data-part="${srcPart.id}" style="color:var(--brand2);cursor:pointer">📦 From catalogue: ${esc(srcPart.name)} ›</span></div>` : ''}</div>`;
  // Life / placement
  body += `<div class="card"><h3>Life & placement</h3><div class="grid2">
    <div><div class="tiny muted">Fitted to</div><b>${c.busId ? esc(busName(c.busId)) : '—'}${c.position ? ' · ' + esc(c.position) : ''}</b></div>
    <div><div class="tiny muted">${v.charAt(0).toUpperCase() + v.slice(1)}s used</div><b>${c.refurbCount || 0} / ${c.maxRefurb || 0}</b></div>`;
  if (lf.tracked) body += `<div><div class="tiny muted">Life used</div><b>${lf.kmUsed.toLocaleString('en-IN')} / ${c.lifeKm.toLocaleString('en-IN')} km</b></div>
    <div><div class="tiny muted">Left</div><b style="color:${lifeColor(lf.status)}">${c.state === 'in-service' ? lf.kmLeft.toLocaleString('en-IN') + ' km' : '—'}</b></div>`;
  body += `</div>${lf.tracked && c.state === 'in-service' ? lifeBar(lf.pct, lf.status) + `<div class="tiny muted" style="margin-top:5px">${lf.pct}% worn${lf.status === 'overdue' ? ` — due for ${v} or replacement` : lf.status === 'soon' ? ' — plan the next ' + v : ''}</div>` : ''}</div>`;
  // Actions (state-driven)
  if (canEdit && c.state !== 'scrapped') {
    let btns = '';
    if (c.state === 'sent-out') btns += `<button class="btn primary" data-act="receiveComp" data-id="${c.id}">📥 Received back (+ bill)</button>`;
    else {
      if (atMax) btns += `<div class="banner warn" style="margin-bottom:8px">Already ${v}ed ${c.refurbCount}× (max ${c.maxRefurb}). Best to scrap & replace.</div>`;
      else btns += `<button class="btn primary" data-act="sendOutComp" data-id="${c.id}">🚚 Send out for ${v}</button>`;
      if (c.state === 'in-service') btns += `<button class="btn" data-act="removeComp" data-id="${c.id}">📤 Remove from bus</button>`;
      else btns += `<button class="btn" data-act="fitComp" data-id="${c.id}">🔧 Fit to a bus</button>`;
    }
    btns += `<button class="btn ghost" data-act="scrapComp" data-id="${c.id}">🗑️ Scrap</button>`;
    body += `<div class="card"><div class="btncol" style="display:flex;flex-direction:column;gap:8px">${btns}</div></div>`;
  }
  // History timeline
  body += `<div class="card"><h3>History</h3>`;
  const hist = (c.history || []).slice().reverse();
  body += hist.length ? hist.map((h) => `<div class="li" style="align-items:flex-start">
    <div class="ava">${HIST_ICON[h.type] || '•'}</div>
    <div class="main"><div class="t" style="font-size:14px">${h.type === 'send-out' ? 'Sent for ' + v : h.type === 'return' ? 'Returned' + (h.cost ? ' · ' + money(h.cost) : '') : h.type === 'install' ? 'Fitted' + (h.busId ? ' to ' + esc(busName(h.busId)) : '') : h.type === 'remove' ? 'Removed from bus' : 'Scrapped'}</div>
      <div class="s">${h.vendor ? esc(h.vendor) + ' · ' : ''}${h.odo ? h.odo.toLocaleString('en-IN') + ' km · ' : ''}${fmtDate(h.at)}${h.note ? ' · ' + esc(h.note) : ''}</div></div>
    ${h.billPhoto ? `<img class="thumb" src="${h.billPhoto}" data-act="viewPhoto" data-src="${h.billPhoto}">` : ''}</div>`).join('') : `<div class="muted small">No history yet</div>`;
  body += `</div>`;
  shell(esc(c.label || km[1]), body);
}
// ---- Component sheets + actions ----
// Guess the component kind from a catalogue part's name/category (for reusable parts).
function kindFromPart(p) {
  const t = (((p && p.name) || '') + ' ' + ((p && p.category) || '')).toLowerCase();
  if (/tyre|tire/.test(t)) return 'tyre';
  if (/altern/.test(t)) return 'alternator';
  if (/starter|self\s?start/.test(t)) return 'starter';
  if (/batter/.test(t)) return 'battery';
  if (/injector|nozzle/.test(t)) return 'injector';
  return 'other';
}
// A part offers per-piece tracking only if it's a TRUE ROTABLE — a component you
// send out to be reconditioned/rewound/remoulded/overhauled and refit, not a
// consumable (pads, blades, filters, bulbs) that's simply replaced.
// NB: the master's "Re-Useable" flag is unreliable — at Mahalaxmi it marks
// reusable passenger AMENITIES (towels, pillows, blankets, snacks on the Volvo
// sleepers), so trackability keys off this whitelist, not that flag.
const TRACKABLE_PART_RE = /\b(tyre|tire|alternator|altern|dynamo|starter|self[\s-]?start|turbo(?:charger)?|compressor|radiator|gear\s?box|differential|injector|injection\s?pump|fuel\s?pump|water\s?pump|steering\s?(?:box|gear|pump)|power\s?steering|propeller\s?shaft|prop\s?shaft|drive\s?shaft|caliper)\b/i;
// Reject rows that merely name a spare PART of a rotable (a housing/fork/gasket
// "…, gearbox"), so only the whole reconditionable unit qualifies.
const PART_ACCESSORY_RE = /\b(housing|kit|half|fork|wire|gasket|seal|sleeve|cover|glass|bracket|mount\w*|support|sensors?|bush\w*|ring|bolt|screw|nut|washer|pipe|hose|clamp|element|\w*filter|bearing|shim|belt|pulley|flange|stud|clip|lock|repair|damper|switch|relay|lamp|sender|solenoid|silencer|valve|plate|spring|bulb|blade|pad|pinion|chock|bellow|adjusting|clutch|battery|cap|cooler|outlet|line|impeller|piston|regulator|separator|tube|drive\s?gear|oils?|lubricant|grease|coolant|antifreeze|fan|rocker|arm|buffer|rubber|freewheel|brush\w*|connector|shield|liner|head)\b/i;
// Also reject lubricants that name a component (e.g. an oil "…TURBO 15W-40").
const OIL_GRADE_RE = /\b\d{1,2}\s?w[-\s]?\d{2}\b/i;
const isTrackablePart = (p) => { const s = (p ? (p.name || '') + ' ' + (p.category || '') : ''); return !!(p && TRACKABLE_PART_RE.test(s) && !PART_ACCESSORY_RE.test(s) && !OIL_GRADE_RE.test(s)); };
const componentsOfPart = (partId) => (S.cache.components || []).filter((c) => c.partId === partId);
// partId (optional): create a tracked component FROM a reusable catalogue part — prefills kind/label/life.
function sheetAddComponent(partId) {
  const buses = S.cache.buses || [];
  const part = partId ? byId(S.cache.parts, partId) : null;
  const reusables = (S.cache.parts || []).filter((p) => isTrackablePart(p) && (!part || p.id !== part.id)).slice(0, 500);
  const initKind = part ? kindFromPart(part) : 'tyre';
  openSheet('Add component', `
    <input type="hidden" id="cp-partid" value="${part ? part.id : ''}">
    ${part ? `<div class="banner ok" style="margin-bottom:10px">From catalogue: <b>${esc(part.name)}</b>${part.partNo ? ' · ' + esc(part.partNo) : ''}</div>`
      : (reusables.length ? `<label class="field"><span class="lbl">Base on a reusable part (optional)</span><select id="cp-frompart"><option value="">— none —</option>${reusables.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label>` : '')}
    <label class="field"><span class="lbl">Type</span><select id="cp-kind">${Object.entries(COMP_KINDS).map(([k, m]) => `<option value="${k}" ${k === initKind ? 'selected' : ''}>${m[0]} ${m[1]}</option>`).join('')}</select></label>
    <label class="field"><span class="lbl">Label</span><input id="cp-label" value="${part ? esc(part.name) : ''}" placeholder="e.g. Tyre FR / Alternator"></label>
    <label class="field"><span class="lbl">Serial / marking (optional)</span><input id="cp-serial" placeholder="optional"></label>
    <div class="grid2">
      <label class="field"><span class="lbl">Life (km, 0 = n/a)</span><input id="cp-life" type="number" inputmode="numeric" value="${COMP_KINDS[initKind][3] || ''}" placeholder="e.g. 60000"></label>
      <label class="field"><span class="lbl">Max ${'remoulds/repairs'}</span><input id="cp-max" type="number" inputmode="numeric" value="${COMP_KINDS[initKind][4] || ''}" placeholder="e.g. 2"></label></div>
    <label class="field"><span class="lbl">Cost (₹)</span><input id="cp-cost" type="number" inputmode="numeric" placeholder="purchase cost"></label>
    <label class="field"><span class="lbl">Fit to bus now? (optional)</span><select id="cp-bus"><option value="">— keep in store —</option>${buses.map((b) => `<option value="${b.id}">${esc(b.regNo)}</option>`).join('')}</select></label>
    <label class="field"><span class="lbl">Position (optional)</span><input id="cp-pos" placeholder="e.g. FR, FL, RR-outer"></label>
    <button class="btn primary" data-act="saveComponent">Save</button>`);
  const kindSel = document.getElementById('cp-kind');
  const applyKind = (k, force) => { const m = COMP_KINDS[k]; const lf = document.getElementById('cp-life'), mx = document.getElementById('cp-max'); if (lf && (force || !lf.value)) lf.value = m[3] || ''; if (mx && (force || !mx.value)) mx.value = m[4] || ''; };
  if (kindSel) kindSel.onchange = () => applyKind(kindSel.value, false);
  const fp = document.getElementById('cp-frompart');
  if (fp) fp.onchange = () => {
    const p = byId(S.cache.parts, fp.value);
    const hid = document.getElementById('cp-partid'); if (hid) hid.value = p ? p.id : '';
    if (p) { const k = kindFromPart(p); if (kindSel) kindSel.value = k; const lbl = document.getElementById('cp-label'); if (lbl) lbl.value = p.name; applyKind(k, true); }
  };
}
async function saveComponent() {
  const kind = ($('#cp-kind') || {}).value || 'other';
  const label = (($('#cp-label') || {}).value || '').trim() || COMP_KINDS[kind][1];
  const busId = ($('#cp-bus') || {}).value || null;
  const now = Date.now();
  const bus = busId ? byId(S.cache.buses, busId) : null;
  const srcPartId = (($('#cp-partid') || {}).value) || null;
  const srcPart = srcPartId ? byId(S.cache.parts, srcPartId) : null;
  const c = { id: uid('cmp-'), kind, label, serial: (($('#cp-serial') || {}).value || '').trim(),
    partId: srcPartId, partExtId: srcPart ? (srcPart.extId || '') : '',
    busId: busId || null, position: (($('#cp-pos') || {}).value || '').trim(),
    state: busId ? 'in-service' : 'removed',
    installedAt: busId ? now : null, installedOdo: busId && bus ? (bus.odometer || 0) : 0,
    lifeKm: Number(($('#cp-life') || {}).value) || 0, maxRefurb: Number(($('#cp-max') || {}).value) || 0,
    refurbCount: 0, cost: Number(($('#cp-cost') || {}).value) || 0,
    history: busId ? [{ type: 'install', at: now, odo: bus ? (bus.odometer || 0) : 0, busId, position: (($('#cp-pos') || {}).value || '').trim(), note: 'Added & fitted' }] : [{ type: 'install', at: now, note: 'Added to store' }],
    createdAt: now, updatedAt: now };
  await DB.put('components', c); await load(); closeSheet(); toast('Component added ✓'); push({ name: 'components', id: c.id });
}
function sheetFitComp(id) {
  const c = byId(S.cache.components, id); if (!c) return;
  const buses = S.cache.buses || [];
  openSheet('Fit to a bus', `
    <label class="field"><span class="lbl">Bus</span><select id="ft-bus">${buses.map((b) => `<option value="${b.id}">${esc(b.regNo)} · ${(b.odometer || 0).toLocaleString('en-IN')} km</option>`).join('')}</select></label>
    <label class="field"><span class="lbl">Position (optional)</span><input id="ft-pos" value="${esc(c.position || '')}" placeholder="e.g. FR, FL"></label>
    <label class="field"><span class="lbl">Odometer now (km)</span><input id="ft-odo" type="number" inputmode="numeric" placeholder="current km"></label>
    <button class="btn primary" data-act="saveFitComp" data-id="${id}">Fit</button>`);
  const bs = document.getElementById('ft-bus'), od = document.getElementById('ft-odo');
  const setOdo = () => { const b = byId(S.cache.buses, bs.value); if (od && b) od.value = b.odometer || 0; };
  if (bs) { bs.onchange = setOdo; setOdo(); }
}
async function saveFitComp(id) {
  const c = byId(S.cache.components, id); if (!c) return;
  const busId = ($('#ft-bus') || {}).value; if (!busId) return toast('Pick a bus');
  const odo = Number(($('#ft-odo') || {}).value) || (byId(S.cache.buses, busId) || {}).odometer || 0;
  const now = Date.now();
  c.busId = busId; c.position = (($('#ft-pos') || {}).value || '').trim(); c.state = 'in-service';
  c.installedAt = now; c.installedOdo = odo;
  c.history = [...(c.history || []), { type: 'install', at: now, odo, busId, position: c.position, note: 'Fitted' }];
  c.updatedAt = now;
  await DB.put('components', c); await load(); closeSheet(); toast('Fitted ✓'); viewComponentDetail(id);
}
async function removeComp(id) {
  const c = byId(S.cache.components, id); if (!c) return;
  const bus = c.busId ? byId(S.cache.buses, c.busId) : null;
  const now = Date.now();
  c.history = [...(c.history || []), { type: 'remove', at: now, odo: bus ? (bus.odometer || 0) : 0, busId: c.busId, note: 'Removed from bus' }];
  c.state = 'removed'; c.busId = null; c.position = ''; c.installedOdo = 0; c.installedAt = null; c.updatedAt = now;
  await DB.put('components', c); await load(); toast('Removed — now in store'); viewComponentDetail(id);
}
function sheetSendOut(id) {
  const c = byId(S.cache.components, id); if (!c) return;
  openSheet(`Send out for ${compVerb(c)}`, `
    <div class="tiny muted" style="margin-bottom:10px">Record which vendor it went to. When it comes back, tap “Received back” to log their bill.</div>
    <label class="field"><span class="lbl">Vendor</span><input id="so-vendor" value="${esc(lastHist(c).vendor || '')}" placeholder="e.g. Jaipur Tyre Remould"></label>
    <label class="field"><span class="lbl">Note (optional)</span><input id="so-note" placeholder="reason / expected return"></label>
    <button class="btn primary" data-act="saveSendOut" data-id="${id}">Send out</button>`);
}
async function saveSendOut(id) {
  const c = byId(S.cache.components, id); if (!c) return;
  const vendor = (($('#so-vendor') || {}).value || '').trim(); if (!vendor) return toast('Enter the vendor');
  const bus = c.busId ? byId(S.cache.buses, c.busId) : null;
  const now = Date.now();
  c.history = [...(c.history || []), { type: 'send-out', at: now, odo: bus ? (bus.odometer || 0) : 0, vendor, note: (($('#so-note') || {}).value || '').trim() }];
  c.state = 'sent-out'; c.updatedAt = now;
  await DB.put('components', c); await load(); closeSheet(); toast(`Sent to ${vendor} ✓`); viewComponentDetail(id);
}
let _compBill = null;
function sheetReceiveComp(id) {
  const c = byId(S.cache.components, id); if (!c) return;
  _compBill = null;
  const backToBus = c.busId ? byId(S.cache.buses, c.busId) : null;
  openSheet(`Received back — ${compVerb(c)} bill`, `
    <div class="tiny muted" style="margin-bottom:10px">Log the vendor's bill for this ${compVerb(c)} and refit the ${compKind(c)[1].toLowerCase()}.</div>
    <label class="field"><span class="lbl">Vendor</span><input id="rc-vendor" value="${esc(lastHist(c).vendor || '')}"></label>
    <label class="field"><span class="lbl">Bill amount (₹)</span><input id="rc-cost" type="number" inputmode="numeric" placeholder="what they charged"></label>
    <button class="btn" data-act="captureCompBill">📷 Photo of the bill</button>
    <div id="rc-billprev" class="thumbs" style="margin:8px 0"></div>
    <label class="field"><span class="lbl">Life after ${compVerb(c)} (km, 0 = n/a)</span><input id="rc-life" type="number" inputmode="numeric" value="${c.lifeKm || ''}"></label>
    ${backToBus ? `<label class="field"><span class="lbl">Refit to ${esc(backToBus.regNo)}?</span><select id="rc-refit"><option value="1">Yes — refit now</option><option value="0">No — keep as spare</option></select></label>` : ''}
    <label class="field"><span class="lbl">Note (optional)</span><input id="rc-note" placeholder="optional"></label>
    <button class="btn primary" data-act="saveReceive" data-id="${id}">Save bill & receive</button>`);
}
async function captureCompBill() {
  const shot = await capturePhoto(); if (!shot) return;
  _compBill = await Sync.uploadPhoto(shot) || shot;
  const prev = $('#rc-billprev'); if (prev) prev.innerHTML = `<img class="thumb" src="${_compBill}">`;
}
async function saveReceive(id) {
  const c = byId(S.cache.components, id); if (!c) return;
  const now = Date.now();
  const cost = Number(($('#rc-cost') || {}).value) || 0;
  const vendor = (($('#rc-vendor') || {}).value || '').trim() || lastHist(c).vendor || '';
  const refit = c.busId && (($('#rc-refit') || {}).value !== '0');
  const bus = c.busId ? byId(S.cache.buses, c.busId) : null;
  c.history = [...(c.history || []), { type: 'return', at: now, vendor, cost, billPhoto: _compBill || '', odo: refit && bus ? (bus.odometer || 0) : 0, note: (($('#rc-note') || {}).value || '').trim() }];
  c.refurbCount = (c.refurbCount || 0) + 1;
  c.lifeKm = Number(($('#rc-life') || {}).value) || c.lifeKm || 0;
  if (refit && bus) { c.state = 'in-service'; c.installedOdo = bus.odometer || 0; c.installedAt = now; }
  else { c.state = 'refurbished'; c.busId = null; c.position = ''; c.installedOdo = 0; }
  _compBill = null; c.updatedAt = now;
  await DB.put('components', c); await load(); closeSheet(); toast(cost ? `Bill ${money(cost)} logged ✓` : 'Received ✓'); viewComponentDetail(id);
}
async function scrapComp(id) {
  const c = byId(S.cache.components, id); if (!c) return;
  if (!confirm('Scrap this component? It will be marked end-of-life.')) return;
  const now = Date.now();
  c.history = [...(c.history || []), { type: 'scrap', at: now, note: 'Scrapped' }];
  c.state = 'scrapped'; c.busId = null; c.position = ''; c.updatedAt = now;
  await DB.put('components', c); await load(); toast('Scrapped'); viewComponentDetail(id);
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
    ${can(S.user.role, 'addPurchase') ? `<div class="li" data-act="openVendors"><div class="ava">🏪</div><div class="main"><div class="t">Vendors</div><div class="s">Supplier registry · spend &amp; pending per vendor</div></div></div>
      <div class="li" data-act="openImport"><div class="ava">📥</div><div class="main"><div class="t">Import from Excel</div><div class="s">Load your Parts Master &amp; Vendor Master (.xls)</div></div></div>` : ''}
    <div class="li" data-act="openAlerts"><div class="ava">📄</div><div class="main"><div class="t">${t('docAlerts')}</div><div class="s">${allDocAlerts().length} need attention</div></div></div>
    ${['owner', 'supervisor'].includes(S.user.role)
      ? `<div class="li" data-act="openDrivers"><div class="ava">🧑‍✈️</div><div class="main"><div class="t">Drivers</div><div class="s">${(S.cache.drivers || []).length} drivers · performance & reports</div></div></div>
         <div class="li" data-act="openAssignments"><div class="ava">🔁</div><div class="main"><div class="t">Driver ↔ Bus assignments</div><div class="s">Who drives which bus · reassign in one place</div></div></div>
         <div class="li" data-act="openCrewPins"><div class="ava">🎫</div><div class="main"><div class="t">Crew logins &amp; PINs</div><div class="s">Driver &amp; conductor app accounts + login PINs</div></div></div>
         <div class="li" data-act="openStaff"><div class="ava">👥</div><div class="main"><div class="t">Staff</div><div class="s">${S.cache.users.length} accounts · add new</div></div></div>
         <div class="li" data-act="openLiveMap"><div class="ava">🗺️</div><div class="main"><div class="t">Live map</div><div class="s">Track every bus live, Uber-style</div></div></div>
         <div class="li" data-act="openReports"><div class="ava">📊</div><div class="main"><div class="t">Bus reports</div><div class="s">Total maintenance spend per bus + full detail</div></div></div>
         <div class="li" data-act="openForecast"><div class="ava">🔧</div><div class="main"><div class="t">Maintenance &amp; uptime</div><div class="s">Predicts upcoming service/parts + downtime cost</div></div></div>
         <div class="li" data-act="openFuel"><div class="ava">⛽</div><div class="main"><div class="t">Fuel &amp; mileage</div><div class="s">Fills, km/l, fuel ₹/km &amp; mileage-drop alerts</div></div></div>
         <div class="li" data-act="openDef"><div class="ava">🧪</div><div class="main"><div class="t">AdBlue / DEF</div><div class="s">BS6/Volvo exhaust fluid — top-ups, L/100km &amp; cost</div></div></div>
         <div class="li" data-act="openSafety"><div class="ava">🛡️</div><div class="main"><div class="t">Safety &amp; misuse</div><div class="s">Overspeed, harsh braking, night moves &amp; idling</div></div></div>
         <div class="li" data-act="openWarranty"><div class="ava">🧾</div><div class="main"><div class="t">Warranty register</div><div class="s">Parts under warranty — don't pay for free replacements</div></div></div>
         <div class="li" data-act="openStoreHealth"><div class="ava">📦</div><div class="main"><div class="t">Store health</div><div class="s">Reconciliation, stock counts &amp; shrinkage score</div></div></div>
         <div class="li" data-act="openPilferage"><div class="ava">🕵️</div><div class="main"><div class="t">Pilferage radar</div><div class="s">Who to watch — per-mechanic theft-risk score</div></div></div>
         <div class="li" data-act="openComponents"><div class="ava">🛞</div><div class="main"><div class="t">Tyres &amp; components</div><div class="s">Per-piece life + send-out for remould/repair &amp; bills</div></div></div>
         <div class="li" data-act="openLinkGps"><div class="ava">🛰️</div><div class="main"><div class="t">Link GPS to buses</div><div class="s">Match live AirFi devices to fleet units → tracking on</div></div></div>
         <div class="li" data-act="openScoreboard"><div class="ava">🏆</div><div class="main"><div class="t">Mechanic scorecards</div><div class="s">Attendance, late penalties &amp; work-quality ratings</div></div></div>
         <div class="li" data-act="openRoutes"><div class="ava">🕒</div><div class="main"><div class="t">Routes &amp; timings</div><div class="s">Pickup geofences, go-times &amp; punctuality</div></div></div>
         <div class="li" data-act="openSetup"><div class="ava">⚙️</div><div class="main"><div class="t">Garage setup</div><div class="s">Location, geofence, shift time · start fresh</div></div></div>` : ''}
    ${S.user.role === 'store'
      ? `<div class="li" data-act="openStoreHealth"><div class="ava">📦</div><div class="main"><div class="t">Store health</div><div class="s">Reconciliation, stock counts &amp; shrinkage score</div></div></div>
         <div class="li" data-act="openComponents"><div class="ava">🛞</div><div class="main"><div class="t">Tyres &amp; components</div><div class="s">Per-piece life + send-out for remould/repair &amp; bills</div></div></div>` : ''}
    <div class="li" data-act="changePin"><div class="ava">🔑</div><div class="main"><div class="t">${t('changePin')}</div><div class="s">Set a new 4-digit login PIN</div></div></div>
    <div class="li" data-act="openSync"><div class="ava">🔄</div><div class="main"><div class="t">${t('sync')}</div><div class="s">${SYNC_STATUS === 'synced' ? 'All devices up to date' : SYNC_STATUS === 'offline' ? 'Offline — will sync when connected' : 'Syncing…'}${si.pending ? ` · ${si.pending} pending` : ''}</div></div></div>
    <div class="li" data-act="logout"><div class="ava">🚪</div><div class="main"><div class="t">${t('logout')}</div></div></div>
  </div>`;

  // A driver's own document vault
  if (S.user.role === 'driver') {
    const md = (S.cache.drivers || []).find((x) => x.userId === S.user.id);
    if (md) { const ds = driverDocStatus(md);
      body += `<div class="card" data-act="openDriverDocs" data-driver="${md.id}" style="cursor:pointer"><div class="row between">
        <div class="row" style="gap:12px;align-items:center">${progressRing(ds.pct)}
          <div><div style="font-weight:800">📂 My documents</div>
            <div class="small muted">${ds.mandDone}/${ds.mandTotal} required uploaded${ds.mandDone < ds.mandTotal ? ' · ⚠️ finish these' : ' ✓'}</div></div></div>
        <span class="tiny" style="color:var(--brand2)">open ›</span></div></div>`;
    }
  }

  // Phone alerts (web-push) — for owner/supervisor who receive misuse/safety alerts.
  if (['owner', 'supervisor'].includes(S.user.role)) {
    const on = pushEnabled();
    body += `<div class="card"><div class="row between"><h3>🔔 Phone alerts</h3>
        <span class="badge ${on ? 'b-green' : 'b-low'}">${on ? 'ON' : 'OFF'}</span></div>
      <div class="tiny muted" style="margin-bottom:10px">Get pushed to your phone for night movement &amp; other urgent alerts — even when the app is closed. WhatsApp coming once your Business account is ready.</div>
      <div class="btnrow">
        ${on ? `<button class="btn sm" data-act="testNotif">Send test</button><button class="btn sm ghost" data-act="disableNotif">Turn off</button>`
             : `<button class="btn sm primary" data-act="enableNotif">Enable alerts</button>`}
      </div></div>`;
  }

  shell(t('me'), body);
}

/* ----------------------------- Attendance flow ---------------------------- */
async function doAttendance(type) {
  // Live face capture — attendance is unverifiable without proof of who showed
  // up, and the face detector ensures it's a real face in frame, not a photo.
  const cap = await captureFace(type === 'in' ? 'Check in' : 'Check out');
  if (!cap) return toast('Face capture required to mark attendance');
  const selfie = cap.photo;

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
  await DB.put('attendance', { id: uid('a-'), userId: S.user.id, type, at: Date.now(), lat, lng, dist, selfie: selfieRef, late, faceVerified: !!cap.faceVerified, flagged: !!tooFar || lat == null });
  await load();
  toast(type === 'in' ? (late ? 'Checked in (late)' : `Checked in ✓${cap.faceVerified ? ' · face verified 🙂' : ''}`) : `Checked out ✓${cap.faceVerified ? ' · face verified 🙂' : ''}`);
  viewMe();
}

/* ------------------------------- Sheets: forms ---------------------------- */
function sheetAddBus() {
  openSheet(t('addBus'), `
    <label class="field"><span class="lbl">🔢 Registration No.</span><input id="f-reg" placeholder="RJ14 PA 1234"></label>
    <label class="field"><span class="lbl">🏢 Owning company</span><input id="f-co" placeholder="Pink City Travels"></label>
    <label class="field"><span class="lbl">🚌 Model</span><input id="f-model" placeholder="Tata Starbus"></label>
    <div class="grid2">
      <label class="field"><span class="lbl">🛣️ Odometer (km)</span><input id="f-odo" type="number" inputmode="numeric"></label>
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
// Opens the new-job form as its own full-screen page (pushed route) — see viewNewJob.
function sheetAddJob(prefill = {}) { push({ name: 'newjob', prefill }); }

// Full-screen, grouped, icon-led job-creation page (Apple-style). Keeps the same
// field IDs so saveJob() is unchanged.
function viewNewJob(prefill = {}) {
  const buses = S.cache.buses || [];
  if (!buses.length) {
    return shell('New job card', `<div class="card"><div class="empty">Add a bus first — a job card belongs to a bus.</div>
      ${can(S.user.role, 'addBus') ? '<button class="btn primary" data-act="addBus">+ Add bus</button>' : ''}</div>`);
  }
  const mechs = S.cache.users.filter((u) => u.role === 'mechanic');
  const assignees = mechs.length ? mechs : [{ id: S.user.id, name: S.user.name + ' (you)' }];
  const sel = prefill.busId || buses[0].id;
  const prio = prefill.priority || 'medium';
  const PCOL = { high: '#ef4444', medium: '#f59e0b', low: '#16a571' };
  const seg = (v, label) => { const on = prio === v, c = PCOL[v];
    return `<button class="prio-seg" data-act="setPrio" data-v="${v}" style="flex:1;padding:12px;border-radius:12px;cursor:pointer;font-weight:${on ? 800 : 600};border:1.5px solid ${on ? c : 'var(--line,#e6e9f0)'};color:${on ? '#161922' : '#8b91a0'};background:${on ? c + '22' : '#fff0'}">${label}</button>`; };
  const body = `
    <input type="hidden" id="f-reportId" value="${prefill.reportId || ''}">
    <input type="hidden" id="f-prio" value="${prio}">
    <div class="card"><label class="field"><span class="lbl">🚌 Bus</span>
      <select id="f-bus">${buses.map((b) => `<option value="${b.id}" ${b.id === sel ? 'selected' : ''}>${esc(b.regNo)}${b.company ? ' — ' + esc(b.company) : ''}</option>`).join('')}</select></label>
      <div id="f-reports" style="margin-top:8px">${reportPicklistRich(sel)}</div></div>
    <div class="card"><label class="field"><span class="lbl">🔧 Problem reported</span>
      <textarea id="f-prob" placeholder="e.g. Front brakes weak, pulls left">${esc(prefill.problem || '')}</textarea></label></div>
    <div class="card"><div class="lbl" style="margin-bottom:8px">🚩 Priority</div>
      <div style="display:flex;gap:8px">${seg('high', '🔴 High')}${seg('medium', '🟡 Medium')}${seg('low', '🟢 Low')}</div></div>
    <div class="card"><label class="field"><span class="lbl">👷 Assign to</span>
      <select id="f-mech">${assignees.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select></label></div>
    <div class="card"><label class="field"><span class="lbl">🏪 Outside vendor (optional)</span>
      <input id="f-vendor" placeholder="Leave blank if done in-house"></label>
      <div class="grid2" style="margin-top:8px">
        <label class="field"><span class="lbl">₹ Outside cost</span><input id="f-extcost" type="number" inputmode="numeric"></label>
        <label class="field"><span class="lbl">⏱️ Labour hours</span><input id="f-hrs" type="number" inputmode="decimal"></label></div></div>
    <div class="card"><label class="field"><span class="lbl">📝 Notes (optional)</span>
      <textarea id="f-notes" placeholder="Any extra detail for the mechanic"></textarea></label></div>
    <button class="btn primary" data-act="saveJob" style="font-size:16px;padding:15px;margin-top:2px">✓ Create job card</button>
    <div class="spacer"></div>`;
  shell('New job card', body);
  const busSel = document.getElementById('f-bus');
  if (busSel) busSel.addEventListener('change', () => { const rp = document.getElementById('f-reports'); if (rp) rp.innerHTML = reportPicklistRich(busSel.value); });
}
function setPrio(v) {
  const h = document.getElementById('f-prio'); if (h) h.value = v;
  const PCOL = { high: '#ef4444', medium: '#f59e0b', low: '#16a571' };
  document.querySelectorAll('.prio-seg').forEach((b) => { const bv = b.getAttribute('data-v'), on = bv === v, c = PCOL[bv];
    b.style.fontWeight = on ? 800 : 600; b.style.borderColor = on ? c : 'var(--line,#e6e9f0)'; b.style.color = on ? '#161922' : '#8b91a0'; b.style.background = on ? c + '22' : '#fff0'; });
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
  await load(); closeSheet(); toast(`Job created${linkedReports.length ? ` · ${linkedReports.length} report(s) linked` : ''}`); navTab('jobs');
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
    <label class="field"><span class="lbl">🔩 Part</span><select id="f-part">${parts.map((p) => `<option value="${p.id}">${esc(p.name)} (${p.qty} ${p.unit})</option>`).join('')}</select></label>
    <label class="field"><span class="lbl">🧾 Issue to job card</span><select id="f-job">${openJobs.map((j) => `<option value="${j.id}" ${j.id===presetJob?'selected':''}>${esc(busName(j.busId))} — ${esc(j.problem.slice(0,28))}</option>`).join('')}</select></label>
    <label class="field"><span class="lbl"># Quantity</span><input id="f-qty" type="number" inputmode="numeric" value="1"></label>
    <div id="f-warr"></div>
    <div class="banner warn">🔒 Parts can only be issued against a job card. This stops untracked pilferage.</div>
    <button class="btn primary" data-act="confirmIssue">${t('issuePart')}</button>`,
    (wrap) => {
      const pSel = wrap.querySelector('#f-part'), jSel = wrap.querySelector('#f-job');
      const refresh = () => {
        const j = byId(S.cache.jobs, jSel.value); const box = wrap.querySelector('#f-warr');
        const st = j ? warrantyStatus(j.busId, pSel.value) : null;
        box.innerHTML = (st && st.underWarranty)
          ? `<div class="banner" style="background:#3a2412;color:#f59e0b">⚠️ This part is still under warranty${st.supplier ? ' (' + esc(st.supplier) + ')' : ''} — ${st.leftDays} days left. Claim a FREE replacement, don't buy a new one.</div>` : '';
      };
      pSel.addEventListener('change', refresh); jSel.addEventListener('change', refresh); refresh();
    });
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
      <label class="field"><span class="lbl">Part no. / serial</span><input id="f-pno" placeholder="optional"></label>
      <label class="field"><span class="lbl">Category</span><input id="f-pcat" placeholder="e.g. Brakes"></label>
    </div>
    <button class="btn sm ghost" data-act="scanSerial" data-target="f-pno" style="margin:-4px 0 8px">📷 Scan serial</button>
    <div class="grid2">
      <label class="field"><span class="lbl">Unit</span><select id="f-punit">${PART_UNITS.map((u) => `<option value="${u}">${u}</option>`).join('')}</select></label>
      <label class="field"><span class="lbl">Unit cost (₹)</span><input id="f-pcost" type="number" inputmode="numeric"></label>
    </div>
    <div class="grid2">
      <label class="field"><span class="lbl">Opening qty</span><input id="f-pqty" type="number" inputmode="numeric" value="0"></label>
      <label class="field"><span class="lbl">Reorder at</span><input id="f-preorder" type="number" inputmode="numeric" value="2"></label>
    </div>
    <div class="grid2">
      <label class="field"><span class="lbl">Supplier (for warranty)</span><input id="f-psupp" placeholder="e.g. Bosch dealer"></label>
      <label class="field"><span class="lbl">Warranty (months)</span><input id="f-pwarr" type="number" inputmode="numeric" placeholder="0 = none"></label>
    </div>
    <label class="field"><span class="lbl">⏳ Typical life (months) — for replacement forecasting</span><input id="f-plife" type="number" inputmode="numeric" placeholder="e.g. 18 (0 = skip)"></label>
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
    supplier: ($('#f-psupp') || {}).value ? $('#f-psupp').value.trim() : '', warrantyMonths: Number(($('#f-pwarr') || {}).value) || 0,
    lifeMonths: Number(($('#f-plife') || {}).value) || 0,
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
    <button class="btn" data-act="scanBill" style="margin-bottom:10px">📷 Scan bill — auto-fill</button>
    <div class="tiny muted" style="margin:-4px 0 10px">Snap a printed or handwritten (kachaa) bill; it reads the amount &amp; supplier on-device.</div>
    <label class="field"><span class="lbl">Supplier</span><input id="f-sup" list="f-suplist" placeholder="Jaipur Auto Spares" autocomplete="off">
      <datalist id="f-suplist">${vendorNames().map((n) => `<option value="${esc(n)}">`).join('')}</datalist></label>
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
  // Map the bill to a known vendor (exact name match) so spend/pending roll up per supplier.
  const vend = (S.cache.vendors || []).find((v) => v.name.toLowerCase() === sup.toLowerCase());
  await DB.put('purchases', {
    id: uid('pur-'), supplier: sup, vendorId: vend ? vend.id : null, amount,
    items: [lineText, notes].filter(Boolean).join(' · '), lines,
    paymentStatus: pay, paidAt: pay === 'paid' ? Date.now() : null, billPhoto: _billPhoto, at: Date.now(),
  });
  for (const l of lines) await receiveStock({ partId: l.partId, qty: l.qty, cost: l.cost, reason: `Purchase from ${sup}`, silent: true });
  _billPhoto = '';
  await load(); closeSheet(); toast(lines.length ? `Bill saved · ${lines.length} part line(s) received` : 'Bill saved'); rerender();
}
/* ===== Phase B — bill automation: OCR pre-fill + vendor registry ===========
 * Photograph a kachaa (handwritten) or printed bill → on-device Tesseract OCR
 * (localOcr) pulls out the amount, date and a best-guess supplier so the
 * purchase form is pre-filled. A vendor registry maps every bill (including the
 * ones vendors email) back to a known supplier. No server, no API key. */
const vendorNames = () => (S.cache.vendors || []).map((v) => v.name);
function matchVendor(text) {
  const t = (text || '').toLowerCase();
  let best = null, bestLen = 0;
  (S.cache.vendors || []).forEach((v) => { const n = v.name.toLowerCase(); if (t.includes(n) && n.length > bestLen) { best = v; bestLen = n.length; } });
  if (best) return best;
  (S.cache.vendors || []).forEach((v) => { if (best) return; v.name.toLowerCase().split(/\s+/).filter((w) => w.length >= 5).forEach((w) => { if (t.includes(w)) best = v; }); });
  return best;
}
// Pull {amount, date, supplier} from OCR'd bill text (best-effort heuristics).
function parseBill(text) {
  const lines = (text || '').split(/\n/).map((l) => l.trim()).filter(Boolean);
  const flat = lines.join(' ');
  const numsOn = (re) => { let m; const out = []; const g = new RegExp(re, 'gi'); while ((m = g.exec(flat))) { const n = Number((m[1] || '').replace(/[,\s]/g, '')); if (n) out.push(n); } return out; };
  let amount = 0;
  const totalNums = numsOn('(?:grand\\s*total|total|net|amount|payable|bill)[^0-9]{0,12}(?:₹|rs\\.?|inr)?\\s*([0-9][0-9,]*\\.?[0-9]*)');
  if (totalNums.length) amount = Math.max.apply(null, totalNums);
  if (!amount) { const all = numsOn('(?:₹|rs\\.?|inr)\\s*([0-9][0-9,]{2,}\\.?[0-9]*)'); if (all.length) amount = Math.max.apply(null, all); }
  if (!amount) { const all = (flat.match(/\b[0-9][0-9,]{2,}(?:\.[0-9]{1,2})?\b/g) || []).map((x) => Number(x.replace(/,/g, ''))).filter((n) => n >= 100); if (all.length) amount = Math.max.apply(null, all); }
  let date = null; const dm = flat.match(/\b([0-3]?\d)[\/\-.]([01]?\d)[\/\-.](\d{2,4})\b/);
  if (dm) { let y = Number(dm[3]); if (y < 100) y += 2000; const d = new Date(y, Number(dm[2]) - 1, Number(dm[1])); if (!isNaN(d.getTime())) date = d.getTime(); }
  const v = matchVendor(text);
  const supplier = v ? v.name : (lines.find((l) => /[a-z]/i.test(l) && l.replace(/[^a-z]/gi, '').length >= 4) || '');
  return { amount, date, supplier, vendor: v };
}
async function scanBill() {
  const shot = await capturePhoto(); if (!shot) return;
  _billPhoto = await Sync.uploadPhoto(shot) || shot;
  const tb = $('#f-billthumb'); if (tb) tb.innerHTML = `<img class="thumb" src="${_billPhoto}">`;
  const stop = showBusyOverlay('Reading the bill…');
  const text = await localOcr(shot);
  if (stop) stop();
  if (!text) return toast('Could not read the bill — type the details in');
  const p = parseBill(text);
  const sup = $('#f-sup'), amt = $('#f-amt');
  if (sup && p.supplier && !sup.value) sup.value = p.supplier;
  if (amt && p.amount && !amt.value) amt.value = p.amount;
  toast(p.amount ? `Read ₹${p.amount}${p.supplier ? ' · ' + p.supplier : ''} — check & save` : 'Read the bill — fill any blanks');
}
const vendorBills = (vid) => { const v = byId(S.cache.vendors, vid); if (!v) return []; const n = v.name.toLowerCase(); return (S.cache.purchases || []).filter((p) => p.vendorId === vid || (p.supplier || '').toLowerCase() === n); };
function viewVendors() {
  const vendors = [...(S.cache.vendors || [])].sort((a, b) => a.name.localeCompare(b.name));
  let body = `<div class="card"><div class="tiny muted">Suppliers you buy from or send work to. Map every bill — including the ones vendors email — to a vendor to see spend &amp; pending per supplier.</div></div>`;
  body += `<div class="card"><h3>Vendors</h3>`;
  body += vendors.length ? vendors.map((v) => { const bills = vendorBills(v.id); const pending = bills.filter((b) => b.paymentStatus !== 'paid').reduce((s, b) => s + (b.amount || 0), 0);
    return `<div class="li" data-act="openVendor" data-id="${v.id}"><div class="ava">🏪</div>
      <div class="main"><div class="t">${esc(v.name)}</div><div class="s">${esc(v.category || '')}${v.email ? ' · ' + esc(v.email) : ''}</div></div>
      ${pending ? `<span class="badge b-amber">${money(pending)} due</span>` : `<span class="tiny muted">${bills.length} bill(s)</span>`}</div>`; }).join('') : `<div class="empty">No vendors yet — tap + to add one.</div>`;
  body += `</div>`;
  shell('Vendors', body, can(S.user.role, 'addPurchase') ? { act: 'addVendor', icon: '+' } : null);
}
function viewVendorDetail(id) {
  const v = byId(S.cache.vendors, id); if (!v) return viewVendors();
  const bills = vendorBills(id).sort((a, b) => b.at - a.at);
  const total = bills.reduce((s, b) => s + (b.amount || 0), 0);
  const pending = bills.filter((b) => b.paymentStatus !== 'paid').reduce((s, b) => s + (b.amount || 0), 0);
  let body = `<div class="card"><div class="row between"><div><div style="font-weight:800;font-size:17px">${esc(v.name)}</div><div class="small muted">${esc(v.category || 'Vendor')}</div></div>
    ${can(S.user.role, 'addPurchase') ? `<button class="btn sm" data-act="editVendor" data-id="${v.id}">Edit</button>` : ''}</div>
    <div class="grid2" style="margin-top:10px">
      <div><div class="tiny muted">Total billed</div><b>${money(total)}</b></div>
      <div><div class="tiny muted">Pending</div><b style="color:var(--amber)">${money(pending)}</b></div>
      ${v.phone ? `<div><div class="tiny muted">Phone</div><b>${esc(v.phone)}</b></div>` : ''}
      ${v.email ? `<div><div class="tiny muted">Invoice email</div><b style="font-size:12px">${esc(v.email)}</b></div>` : ''}
      ${v.gstin ? `<div><div class="tiny muted">GSTIN</div><b style="font-size:12px">${esc(v.gstin)}</b></div>` : ''}
    </div>${v.notes ? `<div class="tiny muted" style="margin-top:8px">${esc(v.notes)}</div>` : ''}</div>`;
  body += `<div class="card"><div class="row between"><h3>Bills</h3>${can(S.user.role, 'addPurchase') ? `<button class="btn sm" data-act="addPurchase">+ Bill</button>` : ''}</div>`;
  body += bills.length ? bills.map((p) => `<div class="li"><div class="ava">🧾</div>
    <div class="main"><div class="t">${money(p.amount)}</div><div class="s">${esc(p.items || '')} · ${fmtDate(p.at)}</div></div>
    <span class="badge ${p.paymentStatus === 'paid' ? 'b-green' : 'b-amber'}">${p.paymentStatus}</span>
    ${p.billPhoto ? `<img class="thumb" style="width:42px;height:42px" src="${p.billPhoto}" data-act="viewPhoto" data-src="${p.billPhoto}">` : ''}</div>`).join('') : `<div class="muted small">No bills mapped yet.</div>`;
  body += `</div>`;
  shell(esc(v.name), body);
}
const VENDOR_CATS = ['Parts', 'Tyre remould', 'Electricals', 'AdBlue/DEF', 'Lubricants', 'Fuel', 'Bodywork', 'Other'];
function sheetAddVendor(id) {
  const v = id ? byId(S.cache.vendors, id) : null;
  openSheet(v ? 'Edit vendor' : 'Add vendor', `
    <label class="field"><span class="lbl">Name</span><input id="v-name" value="${v ? esc(v.name) : ''}" placeholder="e.g. Jaipur Auto Spares"></label>
    <label class="field"><span class="lbl">Category</span><select id="v-cat">${VENDOR_CATS.map((c) => `<option value="${c}" ${v && v.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
    <div class="grid2">
      <label class="field"><span class="lbl">Phone</span><input id="v-phone" value="${v ? esc(v.phone || '') : ''}"></label>
      <label class="field"><span class="lbl">GSTIN</span><input id="v-gstin" value="${v ? esc(v.gstin || '') : ''}"></label></div>
    <label class="field"><span class="lbl">Invoice email <span class="tiny muted">(where they email bills)</span></span><input id="v-email" type="email" value="${v ? esc(v.email || '') : ''}" placeholder="billing@vendor.in"></label>
    <label class="field"><span class="lbl">Notes</span><input id="v-notes" value="${v ? esc(v.notes || '') : ''}" placeholder="terms, turnaround…"></label>
    <button class="btn primary" data-act="saveVendor"${v ? ` data-id="${v.id}"` : ''}>${t('save')}</button>`);
}
async function saveVendor(id) {
  const name = (($('#v-name') || {}).value || '').trim(); if (!name) return toast('Enter a vendor name');
  const v = id ? byId(S.cache.vendors, id) : null;
  const rec = Object.assign(v || { id: uid('v-'), createdAt: Date.now() }, {
    name, category: ($('#v-cat') || {}).value || 'Other',
    phone: (($('#v-phone') || {}).value || '').trim(), gstin: (($('#v-gstin') || {}).value || '').trim(),
    email: (($('#v-email') || {}).value || '').trim(), notes: (($('#v-notes') || {}).value || '').trim(), updatedAt: Date.now() });
  await DB.put('vendors', rec); await load(); closeSheet(); toast('Vendor saved ✓');
  if (id) viewVendorDetail(id); else push({ name: 'vendors', id: rec.id });
}
/* ===== Import from Excel — Parts Master & Vendor Master ====================
 * Reads the .xls the garage's billing system exports (Excel 2003 "SpreadsheetML"
 * XML — inline data, no zip/shared-strings) fully in-browser and bulk-loads it
 * into the catalogue. Records key off the master's own Id (extId) so re-importing
 * updates in place instead of duplicating. No server, no library. */
function parseSpreadsheetML(text) {
  const SS = 'urn:schemas-microsoft-com:office:spreadsheet';
  let doc; try { doc = new DOMParser().parseFromString(text, 'application/xml'); } catch (e) { return null; }
  if (!doc || doc.getElementsByTagName('parsererror').length) return null;
  const rowEls = doc.getElementsByTagNameNS(SS, 'Row');
  if (!rowEls.length) return null;
  const rows = [];
  for (let r = 0; r < rowEls.length; r++) {
    const cells = rowEls[r].getElementsByTagNameNS(SS, 'Cell');
    const arr = []; let col = 0;
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      const idx = c.getAttributeNS(SS, 'Index') || c.getAttribute('ss:Index');
      if (idx) col = parseInt(idx, 10) - 1;
      const data = c.getElementsByTagNameNS(SS, 'Data');
      arr[col] = data.length ? (data[0].textContent || '').trim() : '';
      col++;
    }
    rows.push(arr);
  }
  return rows;
}
// .xlsx (zipped OOXML) support — lazy-load a tiny unzip (fflate) only when needed.
let _fflateLoad = null;
function ensureFflate() {
  if (window.fflate) return Promise.resolve(true);
  if (_fflateLoad) return _fflateLoad;
  _fflateLoad = new Promise((res) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/fflate@0.8.2/umd/index.js'; s.onload = () => res(!!window.fflate); s.onerror = () => { _fflateLoad = null; res(false); }; document.head.appendChild(s); });
  return _fflateLoad;
}
// Parse a .xlsx ArrayBuffer → rows (2D array of trimmed strings), resolving shared strings.
async function parseXlsx(buf) {
  if (!(await ensureFflate())) return null;
  let files; try { files = fflate.unzipSync(new Uint8Array(buf)); } catch (e) { return null; }
  const dec = (name) => files[name] ? new TextDecoder().decode(files[name]) : '';
  const sst = [];
  const sstXml = dec('xl/sharedStrings.xml');
  if (sstXml) { const d = new DOMParser().parseFromString(sstXml, 'application/xml'); const sis = d.getElementsByTagName('si'); for (let i = 0; i < sis.length; i++) { const ts = sis[i].getElementsByTagName('t'); let s = ''; for (let j = 0; j < ts.length; j++) s += ts[j].textContent || ''; sst.push(s); } }
  const sheetName = Object.keys(files).find((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  if (!sheetName) return null;
  const d = new DOMParser().parseFromString(dec(sheetName), 'application/xml');
  const rowEls = d.getElementsByTagName('row');
  const colOf = (ref) => { const m = /^([A-Z]+)/.exec(ref || 'A'); let c = 0; for (const ch of (m ? m[1] : 'A')) c = c * 26 + (ch.charCodeAt(0) - 64); return c - 1; };
  const rows = [];
  for (let i = 0; i < rowEls.length; i++) {
    const cs = rowEls[i].getElementsByTagName('c'); const arr = [];
    for (let j = 0; j < cs.length; j++) {
      const c = cs[j], ci = colOf(c.getAttribute('r')), t = c.getAttribute('t');
      const v = c.getElementsByTagName('v')[0], isn = c.getElementsByTagName('is')[0];
      let val = '';
      if (t === 's' && v) val = sst[parseInt(v.textContent, 10)] || '';
      else if (isn) { const ts = isn.getElementsByTagName('t'); for (let k = 0; k < ts.length; k++) val += ts[k].textContent || ''; }
      else if (v) val = v.textContent || '';
      arr[ci] = (val || '').trim();
    }
    rows.push(arr);
  }
  return rows;
}
const _hidx = (headers) => { const m = {}; headers.forEach((h, i) => { m[(h || '').trim().toLowerCase()] = i; }); return m; };
function mapVendorRows(headers, rows) {
  const m = _hidx(headers), g = (r, k) => (r[m[k]] || '').trim();
  return rows.map((r) => {
    const name = g(r, 'vendor name'); if (!name) return null;
    const repair = /^y/i.test(g(r, 'is repairvendor'));
    const extId = g(r, 'id');
    const notes = [g(r, 'contact person') ? 'Contact: ' + g(r, 'contact person') : '', g(r, 'address'), g(r, 'city name')].filter(Boolean).join(' · ');
    return { id: extId ? 'vend-' + extId : uid('v-'), extId, name, category: repair ? 'Repair' : 'Parts', isRepairVendor: repair,
      phone: g(r, 'contact number'), email: g(r, 'email id'), gstin: g(r, 'gst no'), city: g(r, 'city name'), notes, createdAt: Date.now() };
  }).filter(Boolean);
}
function mapPartRows(headers, rows) {
  const m = _hidx(headers), g = (r, k) => (r[m[k]] || '').trim();
  return rows.map((r) => {
    let name = g(r, 'parts name'); if (!name) return null;
    let partNo = '';
    const idm = name.match(/^ID\s+(\S+)\s+(.+)$/i);   // billing system prefixes "ID <oem-no> <desc>"
    if (idm) { partNo = idm[1]; name = idm[2].trim(); }
    const extId = g(r, 'id');
    return { id: extId ? 'part-' + extId : uid('p-'), extId, name, partNo, category: '', unit: 'pc', qty: 0, reorderLevel: 0, unitCost: 0,
      alertDays: Number(g(r, 'alert days')) || 0, serialTracked: /^y/i.test(g(r, 'serial no')), reusable: /^y/i.test(g(r, 're-useable')), createdAt: Date.now() };
  }).filter(Boolean);
}
// Route label abbreviations → full names (per-token, so it handles long names and
// dotted tokens like "BAG.DHAM" that the old regex missed). "TO"/"VIA" lowercased.
const ROUTE_ABBR = {
  JPR: 'Jaipur', DDN: 'Dehradun', KHATU: 'Khatu', BHOPAL: 'Bhopal',
  GURGAON: 'Gurgaon', 'BAG.DHAM': 'Bageshwar Dham', BAGDHAM: 'Bageshwar Dham',
  TO: 'to', VIA: 'via',
};
const expandRoute = (s) => (s || '').split(/\s+/).map((tok) => ROUTE_ABBR[tok.toUpperCase().replace(/[^A-Z.]/g, '')] || tok).join(' ');
const _titleCase = (s) => (s || '').toLowerCase().replace(/\b([a-z])/g, (m, c) => c.toUpperCase());
async function runImportRows(rows) {
  if (!rows || rows.length < 2) return { error: 'Could not read this file. Re-export it as “Excel 2003 XML (*.xls)” or a normal .xlsx and try again.' };
  // Find the header row (some sheets have a title row above the column headers).
  let hi = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) { const low = rows[i].map((c) => (c || '').toLowerCase()); if (low.some((c) => /vendor name|parts name|bus\s?no/.test(c))) { hi = i; break; } }
  if (hi < 0) return { error: 'Unrecognised file — expected a Vendor Master, Parts Master, or Bus/Route sheet.' };
  const headers = rows[hi].map((h) => (h || '').trim());
  const hl = headers.map((h) => h.toLowerCase());
  const data = rows.slice(hi + 1).filter((r) => r.some((c) => c && c.trim()));
  // Bus / route / driver roster → upsert buses (route + crew) and their drivers.
  if (hl.some((h) => /bus\s?no/.test(h))) {
    const col = (kw) => hl.findIndex((h) => h.indexOf(kw) >= 0);
    const iBus = col('bus'), iRoute = col('route'), iDrv = col('driver name'), iCond = col('conduct'), iPhone = col('contact');
    const clean = (s) => { s = (s || '').trim(); return /^[-–—\s.]*$/.test(s) ? '' : s; };
    const byReg = {}; (S.cache.buses || []).forEach((b) => { byReg[_normReg(b.regNo)] = b; });
    const busSave = [], drvSave = []; let created = 0, updated = 0, drivers = 0; const seenReg = new Set();
    data.forEach((r) => {
      const reg = clean(iBus >= 0 ? r[iBus] : ''); if (!reg) return;
      const nr = _normReg(reg); if (seenReg.has(nr)) return; seenReg.add(nr);
      const routeLabel = iRoute >= 0 ? clean(r[iRoute]) : '', crewRaw = iDrv >= 0 ? clean(r[iDrv]) : '';
      const conductor = iCond >= 0 ? clean(r[iCond]) : '', phone = iPhone >= 0 ? clean(r[iPhone]) : '';
      let b = byReg[nr];
      if (b) updated++; else { b = { id: 'bus-' + nr, regNo: reg.toUpperCase(), company: '', model: '', odometer: 0, serviceIntervalKm: SERVICE_INTERVAL_KM, docs: [], photos: [], source: 'route-import' }; byReg[nr] = b; created++; }
      if (routeLabel) b.routeLabel = routeLabel;
      if (crewRaw) b.driverCrew = crewRaw;
      if (conductor) b.conductor = conductor;
      if (phone) b.crewPhone = phone;
      busSave.push(b);
      // Up to 2 drivers, split on - or / ; assign to the bus (shared phone → driver 1).
      crewRaw.split(/[-\/]| and /i).map((s) => clean(s)).filter(Boolean).slice(0, 2).forEach((name, idx) => {
        drvSave.push({ id: 'drv-' + nr + '-' + idx, name: _titleCase(name).replace(/\s+/g, ' '), phone: idx === 0 ? phone : '', busId: b.id, userId: null, license: '', tripsLogged: 0, joinedAt: Date.now(), photo: '', source: 'route-import' });
        drivers++;
      });
    });
    await DB.bulkPut('buses', busSave);
    if (drvSave.length) await DB.bulkPut('drivers', drvSave);
    await load();
    const crew = await createCrewLogins();   // give drivers + conductors app logins + PINs
    return { kind: 'buses & drivers', total: data.length, added: created, updated, drivers, logins: crew.driverLogins + crew.conductorLogins, conductors: crew.conductorLogins, skipped: 0 };
  }
  if (hl.some((h) => h.indexOf('vendor name') >= 0)) {
    const mapped = mapVendorRows(headers, data);
    const have = new Set((S.cache.vendors || []).map((v) => v.id));
    const haveName = new Set((S.cache.vendors || []).map((v) => (v.name || '').toLowerCase()));
    const seen = new Set(), fresh = mapped.filter((v) => { const nm = v.name.toLowerCase(); if (have.has(v.id) || haveName.has(nm) || seen.has(nm)) return false; seen.add(nm); return true; });
    await DB.bulkPut('vendors', fresh);
    return { kind: 'vendors', total: mapped.length, added: fresh.length, skipped: mapped.length - fresh.length };
  }
  if (hl.indexOf('parts name') >= 0) {
    const mapped = mapPartRows(headers, data);
    const have = new Set((S.cache.parts || []).map((p) => p.id));
    const key = (p) => ((p.name || '') + '|' + (p.partNo || '')).toLowerCase();
    const haveKey = new Set((S.cache.parts || []).map(key));
    const seen = new Set(), fresh = mapped.filter((p) => { if (have.has(p.id)) return false; const k = key(p); if (haveKey.has(k) || seen.has(k)) return false; seen.add(k); return true; });
    await DB.bulkPut('parts', fresh);
    return { kind: 'parts', total: mapped.length, added: fresh.length, skipped: mapped.length - fresh.length };
  }
  return { error: 'Unrecognised file — expected a Vendor Master (has “Vendor Name”) or Parts Master (has “Parts Name”).' };
}
let _lastImport = null;
function viewImport() {
  let body = `<div class="card"><div class="tiny muted">Import your <b>Parts Master</b>, <b>Vendor Master</b> (.xls the billing system exports) or a <b>Bus/Route roster</b> (.xlsx). Parts/vendors match by their master Id; buses match by registration — so re-importing updates in place and won't duplicate.</div></div>`;
  const li = _lastImport;
  const summary = li && !li.error ? `✓ ${li.kind}: ${li.added} added${li.updated ? ', ' + li.updated + ' updated' : ''}${li.drivers ? ', ' + li.drivers + ' drivers' : ''}${li.logins ? ', ' + li.logins + ' logins (' + li.conductors + ' conductors)' : ''}${li.skipped ? ', ' + li.skipped + ' already present' : ''} (of ${li.total}).` : '';
  body += `<div class="card"><h3>Import a file</h3>
    <input id="imp-file" type="file" accept=".xls,.xlsx,.xml,.txt" style="margin:6px 0 12px;width:100%">
    ${li ? `<div class="banner ${li.error ? 'warn' : 'ok'}" style="margin-top:6px">${esc(li.error || summary)}</div>` : ''}
  </div>`;
  body += `<div class="card"><div class="row between small"><span class="muted">In the system now</span><b>${(S.cache.parts || []).length} parts · ${(S.cache.vendors || []).length} vendors · ${(S.cache.buses || []).length} buses · ${(S.cache.drivers || []).length} drivers</b></div></div>`;
  shell('Import from Excel', body);
  const inp = document.getElementById('imp-file');
  if (inp) inp.onchange = () => { const f = inp.files && inp.files[0]; if (f) handleImportFile(f); };
}
async function handleImportFile(file) {
  const stop = showBusyOverlay('Importing ' + file.name + '…');
  try {
    let rows;
    if (/\.xlsx$/i.test(file.name)) rows = await parseXlsx(await file.arrayBuffer());
    else rows = parseSpreadsheetML(await file.text());
    _lastImport = rows ? await runImportRows(rows) : { error: 'Could not read this file — is it a real Excel export?' };
    if (stop) stop();
    await load();
    toast(_lastImport.error ? _lastImport.error : `Imported ${_lastImport.added + (_lastImport.updated || 0)} ${_lastImport.kind} ✓`);
  } catch (e) { if (stop) stop(); _lastImport = { error: 'Import failed: ' + e.message }; toast(_lastImport.error); }
  if (S.route && S.route.name === 'import') viewImport();
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
    <div class="card" style="box-shadow:none;background:var(--tile);padding:12px">
      <div class="tiny muted" style="margin-bottom:6px">⏱️ Mechanic late-attendance penalty (set 0 to disable)</div>
      <div class="grid2">
        <label class="field" style="margin:0"><span class="lbl">₹ per late</span><input id="f-glatepen" type="number" inputmode="numeric" value="${g.latePenalty || 0}"></label>
        <label class="field" style="margin:0"><span class="lbl">Free lates/month</span><input id="f-glategrace" type="number" inputmode="numeric" value="${g.lateGraceDays || 0}"></label>
      </div>
      <label class="field" style="margin:8px 0 0"><span class="lbl">Monthly cap (₹, 0 = none)</span><input id="f-glatecap" type="number" inputmode="numeric" value="${g.latePenaltyCap || 0}"></label>
    </div>
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
  if ($('#f-glatepen')) { g.latePenalty = Number($('#f-glatepen').value) || 0; g.lateGraceDays = Number($('#f-glategrace').value) || 0; g.latePenaltyCap = Number($('#f-glatecap').value) || 0; }
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

/* ========================= Bus Reports (owner/supervisor) ==================
 * One place to see total maintenance spend — fleet-wide and per bus — over a
 * chosen period, with the full breakdown: cost, jobs & downtime, parts, service,
 * documents, driver, and On-Time punctuality.
 */
const REPORT_PERIODS = [['30', '30 days'], ['90', '90 days'], ['0', 'Lifetime']];
const reportDays = () => (S.reportDays != null ? S.reportDays : 30);
const reportSinceMs = () => { const d = Number(reportDays()); return d ? Date.now() - d * day : 0; };
const periodLabel = () => { const d = Number(reportDays()); return d ? ` (${d} days)` : ' (lifetime)'; };
function periodBar() {
  return `<div class="row" style="gap:7px;margin-bottom:12px">${REPORT_PERIODS.map(([d, l]) =>
    `<button class="btn sm ${String(reportDays()) === d ? 'primary' : 'ghost'}" data-act="reportPeriod" data-days="${d}" style="border:1px solid var(--line)">${l}</button>`).join('')}</div>`;
}
function busReport(b, since) {
  const jobs = S.cache.jobs.filter((j) => j.busId === b.id && (j.closedAt || j.createdAt) >= since);
  const cost = jobs.reduce((a, j) => { const c = jobCost(j); a.parts += c.parts; a.labour += c.labour; a.ext += c.ext; a.total += c.total; return a; }, { parts: 0, labour: 0, ext: 0, total: 0 });
  const byStatus = { open: 0, 'in-progress': 0, done: 0, verified: 0 };
  jobs.forEach((j) => { byStatus[j.status] = (byStatus[j.status] || 0) + 1; });
  const downDays = jobs.filter((j) => j.closedAt).reduce((s, j) => s + Math.max(0, (j.closedAt - j.createdAt) / day), 0);
  const partMap = {};
  jobs.forEach((j) => (j.partsUsed || []).forEach((l) => { const p = partMap[l.partId] || { qty: 0, cost: 0 }; p.qty += l.qty; p.cost += l.cost; partMap[l.partId] = p; }));
  const topParts = Object.entries(partMap).map(([pid, v]) => ({ pid, ...v })).sort((a, b) => b.cost - a.cost);
  return { jobs, cost, byStatus, downDays, topParts, extJobs: jobs.filter((j) => j.externalVendor).length, n: jobs.length };
}

/* ===== Preventive maintenance forecast + downtime cost engine =============
 * Predicts upcoming work (service by km→date, part life by months, doc expiry)
 * and values lost road-time: days a bus was down × its daily revenue. Turns
 * maintenance into a rupee decision and gets ahead of breakdowns. */
const dailyRev = (b) => Number(b.dailyRevenue) || Number((S.cache.garage || {}).dailyRevenue) || 8000;
function avgDailyKm(b) {
  const fills = (S.cache.fuel || []).filter((f) => f.busId === b.id).sort((x, y) => (x.odometer || 0) - (y.odometer || 0));
  if (fills.length >= 2) {
    const spanKm = (fills[fills.length - 1].odometer || 0) - (fills[0].odometer || 0);
    const spanDays = Math.max(1, (fills[fills.length - 1].at - fills[0].at) / day);
    if (spanKm > 0) return spanKm / spanDays;
  }
  return Number((S.cache.garage || {}).avgKmPerDay) || 250;
}
function serviceForecast(b) {
  const sv = serviceInfo(b), akm = avgDailyKm(b);
  const daysLeft = akm > 0 ? Math.round(sv.dueIn / akm) : null;
  return Object.assign({}, sv, { daysLeft, dueDate: daysLeft != null ? Date.now() + daysLeft * day : null });
}
function partLifeForecast(b) {
  const out = [];
  (S.cache.parts || []).forEach((p) => {
    const life = Number(p.lifeMonths) || 0; if (!life) return;
    const fits = (S.cache.jobs || []).filter((j) => j.busId === b.id && (j.partsUsed || []).some((l) => l.partId === p.id))
      .map((j) => j.closedAt || j.createdAt).sort((a, c) => c - a);
    if (!fits.length) return;
    const due = fits[0] + life * 30 * day, dl = Math.round((due - Date.now()) / day);
    out.push({ label: p.name, due, daysLeft: dl, status: dl <= 0 ? 'overdue' : dl <= 14 ? 'soon' : 'ok' });
  });
  return out;
}
// Upcoming items within ~30 days (or overdue), ranked soonest-first.
function maintForecast(b) {
  const items = [];
  const sf = serviceForecast(b);
  if (sf.status !== 'ok' || (sf.daysLeft != null && sf.daysLeft <= 30)) items.push({ icon: '🛠️', label: 'Engine service',
    detail: sf.dueIn <= 0 ? `overdue by ${-sf.dueIn} km` : `in ${sf.dueIn} km${sf.daysLeft != null ? ` · ~${sf.daysLeft}d` : ''}`,
    daysLeft: sf.daysLeft != null ? sf.daysLeft : 999, status: sf.status });
  partLifeForecast(b).forEach((p) => { if (p.status !== 'ok' || p.daysLeft <= 30) items.push({ icon: '🔩', label: p.label,
    detail: p.daysLeft <= 0 ? `overdue ${-p.daysLeft}d` : `~${p.daysLeft}d left`, daysLeft: p.daysLeft, status: p.status }); });
  (b.docs || []).forEach((d) => { const dl = daysLeft(d.expiry); if (dl <= 30) items.push({ icon: '📄', label: d.type,
    detail: dl < 0 ? `expired ${-dl}d` : `expires in ${dl}d`, daysLeft: dl, status: dl < 0 ? 'overdue' : dl <= 14 ? 'soon' : 'ok' }); });
  return items.sort((a, c) => a.daysLeft - c.daysLeft);
}
const jobDownDays = (j) => Math.max(0, ((j.closedAt || (['open', 'in-progress'].includes(j.status) ? Date.now() : j.createdAt)) - j.createdAt) / day);
function busDownDays(b, since) {
  return (S.cache.jobs || []).filter((j) => j.busId === b.id && (!since || (j.closedAt || j.createdAt) >= since))
    .reduce((s, j) => s + jobDownDays(j), 0);
}
const busLostRev = (b, since) => Math.round(busDownDays(b, since) * dailyRev(b));
const FC_COL = { overdue: 'b-red', soon: 'b-amber', ok: 'b-green' };
function viewForecast() {
  const buses = S.cache.buses || [];
  let totalDown = 0, totalLost = 0;
  buses.forEach((b) => { const d = busDownDays(b); totalDown += d; totalLost += d * dailyRev(b); });
  const items = [];
  buses.forEach((b) => maintForecast(b).forEach((it) => items.push(Object.assign({ bus: b }, it))));
  items.sort((a, c) => a.daysLeft - c.daysLeft);
  const overdue = items.filter((i) => i.status === 'overdue').length;

  let body = `<div class="card"><div class="row between">
      <div><div class="muted small">Lost to downtime</div><div class="stat" style="color:#ef4444">${money(totalLost)}</div>
        <div class="tiny muted">${Math.round(totalDown)} bus-days off the road</div></div>
      <div style="text-align:right"><div class="muted small">Needs attention</div><div class="stat" style="color:${overdue ? '#ef4444' : 'var(--green)'}">${items.length}</div>
        <div class="tiny muted">${overdue} overdue</div></div></div>
    <div class="tiny muted" style="margin-top:6px">Lost revenue = days down × daily earning (₹${dailyRev({}).toLocaleString('en-IN')}/bus default).${can(S.user.role, 'addBus') ? ' <a data-act="setFleetRev" style="color:var(--brand2);cursor:pointer">set ₹/day</a>' : ''}</div></div>`;

  body += `<div class="card"><h3>🔧 Coming up &amp; overdue</h3>`;
  body += items.length ? items.slice(0, 60).map((i) => `<div class="li" data-act="busReport" data-bus="${i.bus.id}" style="cursor:pointer">
      <div class="ava">${i.icon}</div><div class="main"><div class="t">${esc(i.bus.regNo)} · ${esc(i.label)}</div>
      <div class="s">${i.detail}</div></div><span class="badge ${FC_COL[i.status] || 'b-low'}">${i.status === 'overdue' ? 'OVERDUE' : i.status === 'soon' ? 'SOON' : 'plan'}</span></div>`).join('')
    : `<div class="empty">Nothing due in the next 30 days 👍</div>`;
  body += `</div>`;

  // Worst downtime offenders (where the money's leaking)
  const worst = [...buses].map((b) => ({ b, lost: busLostRev(b), days: busDownDays(b) })).filter((x) => x.days > 0).sort((a, c) => c.lost - a.lost).slice(0, 6);
  if (worst.length) {
    body += `<div class="card"><h3>💸 Most downtime cost</h3>` + worst.map((x) => `<div class="li" data-act="busReport" data-bus="${x.b.id}" style="cursor:pointer">${avatar(busImg(x.b), '🚌')}
      <div class="main"><div class="t">${esc(x.b.regNo)}</div><div class="s">${x.days.toFixed(1)} days down · ₹${dailyRev(x.b).toLocaleString('en-IN')}/day</div></div>
      <b style="color:#ef4444">${money(x.lost)}</b></div>`).join('') + `</div>`;
  }
  shell('Maintenance & uptime', body);
}
async function setFleetRev() {
  const cur = Number((S.cache.garage || {}).dailyRevenue) || 8000;
  const v = prompt('Average revenue a bus earns per running day (₹):', cur);
  if (v == null) return;
  const n = Math.max(0, Math.round(Number(v) || 0));
  const g = Object.assign({}, S.cache.garage || { key: 'garage' }, { dailyRevenue: n });
  await DB.put('meta', g); await load(); toast('Daily revenue set ✓'); viewForecast();
}
function viewReports() {
  const since = reportSinceMs();
  const rows = [...S.cache.buses].map((b) => ({ b, r: busReport(b, since) })).sort((a, b) => b.r.cost.total - a.r.cost.total);
  const fleetTotal = rows.reduce((s, x) => s + x.r.cost.total, 0);
  const fleetJobs = rows.reduce((s, x) => s + x.r.n, 0);
  let body = periodBar();
  body += `<div class="card"><div class="muted small">Total maintenance spend${periodLabel()}</div>
    <div class="stat" style="color:var(--brand2)">${money(fleetTotal)}</div>
    <div class="tiny muted">${rows.length} buses · ${fleetJobs} job(s)</div></div>`;
  body += `<div class="card"><h3>By bus — highest spend first</h3>`;
  body += rows.length ? rows.map(({ b, r }) => {
    const cpk = busCostPerKm(b);
    return `<div class="li" data-act="busReport" data-bus="${b.id}" style="cursor:pointer">${avatar(busImg(b), '🚌')}
      <div class="main"><div class="t">${esc(b.regNo)}</div>
        <div class="s">${esc(b.company)} · ${r.n} job(s)${cpk ? ' · ₹' + cpk.toFixed(1) + '/km' : ''}</div></div>
      <b>${money(r.cost.total)}</b></div>`;
  }).join('') : `<div class="empty">No buses yet</div>`;
  body += `</div>`;
  shell('Bus reports', body);
}
function viewBusReport(busId) {
  const b = byId(S.cache.buses, busId); if (!b) return viewReports();
  const r = busReport(b, reportSinceMs()), c = r.cost, cpk = busCostPerKm(b);
  let body = periodBar();
  body += `<div class="card"><div class="row between"><h3>${esc(b.regNo)}</h3>
    <button class="btn sm" data-act="shareBusReport" data-bus="${b.id}">📤 Share</button></div>
    <div class="small muted">${esc(b.company)} · ${esc(b.model || '')} · ${(b.odometer || 0).toLocaleString('en-IN')} km</div></div>`;
  body += `<div class="card"><h3>Maintenance cost${periodLabel()}</h3>
    <div class="row between small"><span class="muted">Parts</span><b>${money(c.parts)}</b></div>
    <div class="row between small"><span class="muted">Labour</span><b>${money(c.labour)}</b></div>
    <div class="row between small"><span class="muted">Outside vendor</span><b>${money(c.ext)}</b></div>
    <div class="hr"></div>
    <div class="row between"><b>Total</b><b style="color:var(--brand2)">${money(c.total)}</b></div>
    ${cpk ? `<div class="tiny muted" style="margin-top:6px">≈ ₹${cpk.toFixed(2)}/km maintenance (lifetime)</div>` : ''}</div>`;
  // Fuel & mileage
  const fm = busMileage(b.id);
  body += `<div class="card"><div class="row between"><h3>Fuel &amp; mileage</h3>${fm.drop ? '<span class="badge b-red">mileage ↓</span>' : ''}</div>`;
  if (fm.fills) {
    body += `<div class="grid2">
      <div><div class="tiny muted">Mileage</div><b>${fm.avgKmpl != null ? fm.avgKmpl.toFixed(1) + ' km/l' : '—'}</b></div>
      <div><div class="tiny muted">Fuel cost/km</div><b>${fm.fuelPerKm != null ? '₹' + fm.fuelPerKm.toFixed(1) : '—'}</b></div>
      <div><div class="tiny muted">Total fuel</div><b>${money(fm.totalCost)}</b></div>
      <div><div class="tiny muted">Fills</div><b>${fm.fills}</b></div></div>
      ${cpk != null && fm.fuelPerKm != null ? `<div class="hr"></div><div class="row between"><b>True running cost</b><b style="color:var(--brand2)">₹${(cpk + fm.fuelPerKm).toFixed(1)}/km</b></div>` : ''}`;
  } else {
    body += `<div class="muted small">No fuel logged yet.</div>`;
  }
  body += `${can(S.user.role, 'addFuel') ? `<div class="spacer"></div><button class="btn sm" data-act="addFuel" data-bus="${b.id}">⛽ Log fuel</button>` : ''}</div>`;
  body += `<div class="card"><h3>Jobs &amp; downtime</h3><div class="grid2">
      <div><div class="tiny muted">Jobs</div><b>${r.n}</b></div>
      <div><div class="tiny muted">Outside repairs</div><b>${r.extJobs}</b></div>
      <div><div class="tiny muted">Total bay time</div><b>${Math.round(r.downDays)} day(s)</b></div>
      <div><div class="tiny muted">Still open</div><b>${r.byStatus.open + r.byStatus['in-progress']}</b></div></div></div>`;
  if (r.topParts.length) {
    body += `<div class="card"><h3>Parts consumed</h3>` + r.topParts.slice(0, 6).map((p) => {
      const part = byId(S.cache.parts, p.pid);
      return `<div class="row between small" style="padding:4px 0"><span>${esc(part ? part.name : p.pid)} × ${p.qty}</span><b>${money(p.cost)}</b></div>`;
    }).join('') + `</div>`;
  }
  const sv = serviceInfo(b), svc = sv.status === 'overdue' ? 'b-red' : sv.status === 'soon' ? 'b-amber' : 'b-green';
  body += `<div class="card"><div class="row between"><h3>Service</h3><span class="badge ${svc}">${sv.status.toUpperCase()}</span></div>
    <div class="small">${sv.status === 'overdue' ? 'Overdue by ' + Math.abs(sv.dueIn).toLocaleString('en-IN') + ' km' : 'Due in ' + sv.dueIn.toLocaleString('en-IN') + ' km'} · every ${sv.interval.toLocaleString('en-IN')} km</div></div>`;
  body += `<div class="card"><h3>Documents</h3>` + ((b.docs || []).length ? (b.docs || []).map((d) => {
    const st = docStatus(d.expiry); return `<div class="row between small" style="padding:4px 0"><span>${esc(d.type)}</span><span class="badge ${st.cls}">${st.txt}</span></div>`;
  }).join('') : `<div class="muted small">No documents</div>`) + `</div>`;
  const drv = driverOfBus(b.id);
  if (drv) {
    const sc = driverScore(drv.id), incs = driverIncidents(drv.id);
    body += `<div class="card"><div class="row between"><h3>Driver</h3><span class="badge ${scoreClass(sc)}">${sc}/100</span></div>
      <div class="small">${esc(drv.name)} · ${incs.length} incident(s) · ${money(incs.reduce((s, i) => s + (i.cost || 0), 0))} damage · ${openReportsForBus(b.id).length} open report(s)</div></div>`;
  }
  const route = routeForBus(b.id);
  if (route && (route.stops || []).length) {
    body += `<div class="card"><h3>On-time pickup</h3>` + route.stops.map((s) => {
      const p = stopPunctuality(s);
      return `<div class="row between small" style="padding:4px 0"><span>${esc(s.name)}</span><span>${p.onTime == null ? '—' : p.onTime + '%'}${p.avgLate ? ' · avg +' + p.avgLate + 'm' : ''}</span></div>`;
    }).join('') + `</div>`;
  }
  shell(esc(b.regNo) + ' — report', body);
}
function busReportText(busId) {
  const b = byId(S.cache.buses, busId); if (!b) return '';
  const r = busReport(b, reportSinceMs()), c = r.cost, sv = serviceInfo(b);
  return [`${BIZ} — Maintenance report${periodLabel()}`, `Bus ${b.regNo} (${b.company})`, '',
    `Total: ${money(c.total)}`, `  Parts: ${money(c.parts)}`, `  Labour: ${money(c.labour)}`, `  Outside: ${money(c.ext)}`,
    `Jobs: ${r.n} (${r.extJobs} outside) · bay time ${Math.round(r.downDays)} day(s)`,
    `Service: ${sv.status === 'overdue' ? 'overdue ' + Math.abs(sv.dueIn).toLocaleString('en-IN') + ' km' : 'due in ' + sv.dueIn.toLocaleString('en-IN') + ' km'}`].join('\n');
}
async function shareText(title, text) {
  try { if (navigator.share) { await navigator.share({ title, text }); return; } } catch (e) { /* fall through */ }
  try { await navigator.clipboard.writeText(text); toast('Copied — paste into WhatsApp'); }
  catch (e) { openSheet(title, `<textarea style="width:100%;height:240px" readonly>${esc(text)}</textarea>`); }
}

/* ========================= Mechanic Scorecard =============================
 * Each mechanic sees their attendance, late penalty, and a 0–100 work-quality
 * score (last 90 days) built from rework, proof-photo discipline, turnaround
 * and punctuality. Owner sets the late-penalty policy. Everyone sees the board.
 */
const sameMonth = (ts) => { const d = new Date(ts), n = new Date(); return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth(); };
function mechAttendance(userId, monthOnly) {
  let ins = (S.cache.att || []).filter((a) => a.userId === userId && a.type === 'in');
  if (monthOnly) ins = ins.filter((a) => sameMonth(a.at));
  const lates = ins.filter((a) => a.late).length;
  return { checkins: ins.length, lates, onTime: ins.length ? Math.round((ins.length - lates) / ins.length * 100) : 100 };
}
function latePenaltyFor(userId) {
  const g = S.cache.garage || {};
  const rate = Number(g.latePenalty) || 0, grace = Number(g.lateGraceDays) || 0, cap = Number(g.latePenaltyCap) || 0;
  const lates = mechAttendance(userId, true).lates;
  const chargeable = Math.max(0, lates - grace);
  let amount = chargeable * rate; if (cap) amount = Math.min(amount, cap);
  return { lates, grace, chargeable, rate, cap, amount };
}
// 0–100 work-quality score (last 90 days) with a transparent penalty breakdown.
function mechanicScore(userId) {
  const since = Date.now() - 90 * day;
  const jobs = S.cache.jobs.filter((j) => j.assignedTo === userId && (j.closedAt || j.createdAt) >= since);
  const closed = jobs.filter((j) => j.status === 'done' || j.status === 'verified');
  const reworks = jobs.reduce((s, j) => s + (j.reworkCount || 0), 0);
  const proofGaps = closed.filter((j) => !(j.afterPhotos || []).length && jobCost(j).parts > 0).length;
  const bay = closed.filter((j) => j.closedAt);
  const avgBay = bay.length ? bay.reduce((s, j) => s + Math.max(0, (j.closedAt - j.createdAt) / day), 0) / bay.length : 0;
  const att = mechAttendance(userId, false);
  const lateRate = att.checkins ? att.lates / att.checkins : 0;
  const pen = {
    rework: Math.min(40, reworks * 12),                       // quality first — heaviest
    proof: Math.min(25, proofGaps * 8),
    turnaround: Math.min(15, Math.round(Math.max(0, avgBay - 2) * 3)),  // only beyond 2 days; weighted low
    punctuality: Math.min(20, Math.round(lateRate * 40)),
  };
  const score = Math.max(0, 100 - pen.rework - pen.proof - pen.turnaround - pen.punctuality);
  return { score, jobs: jobs.length, verified: jobs.filter((j) => j.status === 'verified').length, reworks, proofGaps, avgBay: Math.round(avgBay * 10) / 10, att, pen };
}
function penLine(label, count, pen) {
  return `<div class="row between small" style="padding:3px 0"><span>${label}${count != null ? ` ×${count}` : ''}</span><b style="color:${pen > 0 ? 'var(--red)' : 'var(--green)'}">${pen > 0 ? '−' + pen : '0'}</b></div>`;
}
function viewScoreboard() {
  const mechs = S.cache.users.filter((u) => u.role === 'mechanic').map((u) => ({ u, s: mechanicScore(u.id).score })).sort((a, b) => b.s - a.s);
  let body = `<div class="card"><div class="tiny muted">Work-quality score, last 90 days — from rework, proof photos, turnaround &amp; punctuality. Tap a name for the detail.</div></div>`;
  body += `<div class="card"><h3>Mechanic leaderboard</h3>`;
  body += mechs.length ? mechs.map(({ u, s }, i) => `<div class="li" data-act="scorecard" data-user="${u.id}" style="cursor:pointer">
    <div class="ava">${i === 0 ? '🏆' : '🔧'}</div><div class="main"><div class="t">${i + 1}. ${esc(u.name)}${u.id === S.user.id ? ' (you)' : ''}</div></div>
    <span class="badge ${scoreClass(s)}">${s}</span></div>`).join('') : `<div class="empty">No mechanics yet</div>`;
  body += `</div>`;
  shell('Mechanic leaderboard', body);
}
function viewScorecard(userId) {
  const u = byId(S.cache.users, userId);
  if (!u) return viewScoreboard();
  if (u.id !== S.user.id && !['owner', 'supervisor'].includes(S.user.role)) return route({ name: 'home' });   // mechanics see only their own
  const m = mechanicScore(userId), pen = latePenaltyFor(userId), att = mechAttendance(userId, true);
  let body = `<div class="card"><div class="row between"><div><div style="font-weight:800;font-size:17px">${esc(u.name)}</div><div class="small muted">Mechanic scorecard</div></div>
      <div style="text-align:right"><span class="badge ${scoreClass(m.score)}" style="font-size:15px">${m.score}/100</span><div class="stars">${starStr(scoreStars(m.score))}</div></div></div></div>`;
  body += `<div class="card"><h3>Attendance (this month)</h3><div class="grid2">
      <div><div class="tiny muted">Days present</div><b>${att.checkins}</b></div>
      <div><div class="tiny muted">Late</div><b>${att.lates}</b></div>
      <div><div class="tiny muted">On-time</div><b>${att.onTime}%</b></div>
      <div><div class="tiny muted">Late penalty</div><b style="color:var(--red)">${money(pen.amount)}</b></div></div>
    ${pen.rate ? `<div class="tiny muted" style="margin-top:8px">${pen.grace} free late/month, then ${money(pen.rate)} each${pen.cap ? ` (monthly cap ${money(pen.cap)})` : ''} · ${pen.chargeable} chargeable now.</div>`
      : `<div class="tiny muted" style="margin-top:8px">No late penalty set${['owner', 'supervisor'].includes(S.user.role) ? ' — set it in Me → Garage setup.' : '.'}</div>`}</div>`;
  body += `<div class="card"><h3>Work quality — why ${m.score}/100</h3>
    ${penLine('Rework sent back', m.reworks, m.pen.rework)}
    ${penLine('Missing proof photos', m.proofGaps, m.pen.proof)}
    ${penLine(`Slow turnaround (avg ${m.avgBay}d)`, null, m.pen.turnaround)}
    ${penLine('Late attendance', att.lates, m.pen.punctuality)}
    <div class="hr"></div><div class="row between small"><span class="muted">Jobs (90d) · verified first-time</span><b>${m.jobs} · ${m.verified}</b></div>
    <div class="tiny muted" style="margin-top:8px">${m.score >= 85 ? '👏 Great work — keep before+after photos on every job and check in on time.' : 'Raise your score: get jobs verified first time (no rework), always add before + after photos, and check in before the shift cutoff.'}</div></div>`;
  shell(esc(u.name), body);
}

/* ===== Anti-pilferage #4 — Pilferage Radar (people-level anomaly engine) ===
 * #1–3 catch pilferage per JOB (missing core, suspect core, warranty charge,
 * no proof). Theft is usually a PERSON, though — so this rolls those same
 * signals up per mechanic, adds a peer-outlier check (parts ₹/job far above
 * the team median), and ranks who to watch. Each signal is weighted + capped
 * so one noisy mechanic with many jobs can't max out a single flag. Everything
 * is attributed via j.assignedTo; no API key, all on-device. */
const PILFER_FLAGS = {
  suspect:   { label: 'Returned "old" part looked new', weight: 18, cap: 54 },
  core:      { label: 'Old part not returned',          weight: 10, cap: 40 },
  warranty:  { label: 'Charged for a warranty part',    weight: 12, cap: 36 },
  proof:     { label: 'Parts billed, no proof photo',   weight: 8,  cap: 32 },
  premature: { label: 'Premature re-replacement (<60d)',weight: 6,  cap: 24 },
  costout:   { label: 'Parts spend well above peers',   weight: 20, cap: 20 },
};
const riskClass = (r) => (r >= 60 ? 'b-red' : r >= 30 ? 'b-amber' : 'b-low');
const riskSev = (r) => (r >= 60 ? 'high' : r >= 30 ? 'med' : 'low');
function pilferageRadar() {
  const since = Date.now() - 180 * day;
  const mechs = S.cache.users.filter((u) => u.role === 'mechanic');
  const jobsOf = (id) => S.cache.jobs.filter((j) => j.assignedTo === id && ['done', 'verified'].includes(j.status) && (j.closedAt || j.createdAt) >= since);
  // Peer baseline: median parts ₹/job across mechanics who bill parts.
  const avgCost = {};
  mechs.forEach((u) => { const js = jobsOf(u.id).filter((j) => jobCost(j).parts > 0); avgCost[u.id] = js.length ? js.reduce((s, j) => s + jobCost(j).parts, 0) / js.length : 0; });
  const costs = Object.values(avgCost).filter((x) => x > 0).sort((a, b) => a - b);
  const medCost = costs.length ? costs[Math.floor(costs.length / 2)] : 0;
  // Premature re-replacement: same part re-fitted on the same bus <60d later —
  // attribute the flag to the mechanic of the LATER job.
  const fit = {};
  S.cache.jobs.forEach((j) => (j.partsUsed || []).forEach((l) => { const k = j.busId + '|' + l.partId; (fit[k] = fit[k] || []).push({ t: j.closedAt || j.createdAt, jobId: j.id, mech: j.assignedTo }); }));
  const prematureJobs = {};
  Object.values(fit).forEach((arr) => { arr.sort((a, b) => a.t - b.t); for (let i = 1; i < arr.length; i++) { if (arr[i].mech && (arr[i].t - arr[i - 1].t) / day < 60) (prematureJobs[arr[i].mech] = prematureJobs[arr[i].mech] || []).push(arr[i].jobId); } });

  const rows = mechs.map((u) => {
    const js = jobsOf(u.id);
    const flags = {};
    const add = (key, jobId) => { const f = flags[key] || (flags[key] = { jobs: [] }); if (jobId && !f.jobs.includes(jobId)) f.jobs.push(jobId); else if (!jobId) f.flat = true; };
    js.forEach((j) => {
      if (!(j.afterPhotos || []).length && jobCost(j).parts > 0) add('proof', j.id);
      if (coreMissing(j).length) add('core', j.id);
      if ((j.coreReturns || []).some((c) => c.condition === 'suspect' || (c.ai && c.ai.verdict === 'suspect'))) add('suspect', j.id);
      (j.partsUsed || []).some((l) => { if ((l.cost || 0) <= 0) return false; const at = j.closedAt || j.createdAt; const st = warrantyStatus(j.busId, l.partId, at, at); if (st && st.underWarranty) { add('warranty', j.id); return true; } return false; });
    });
    (prematureJobs[u.id] || []).filter((id) => js.some((j) => j.id === id)).forEach((id) => add('premature', id));
    let costMult = 0;
    if (avgCost[u.id] > 0 && medCost > 0 && js.length >= 3 && avgCost[u.id] > 1.8 * medCost) { costMult = Math.round(avgCost[u.id] / medCost * 10) / 10; add('costout'); }
    const list = Object.entries(flags).map(([key, f]) => {
      const def = PILFER_FLAGS[key], n = key === 'costout' ? 1 : f.jobs.length;
      return { key, label: def.label + (key === 'costout' ? ` (${costMult}× median)` : ''), count: n, points: Math.min(def.cap, def.weight * n), jobs: f.jobs };
    }).sort((a, b) => b.points - a.points);
    const risk = Math.min(100, list.reduce((s, f) => s + f.points, 0));
    return { u, risk, flags: list, jobCount: js.length };
  }).filter((r) => r.risk > 0).sort((a, b) => b.risk - a.risk);
  return rows;
}
function viewPilferage() {
  const rows = pilferageRadar();
  const lastAudit = (S.cache.audits || []).slice().sort((a, b) => b.at - a.at)[0];
  let body = `<div class="card"><div class="tiny muted">Who to watch, last 180 days. Each mechanic's risk score rolls up the pilferage signals from their own jobs — missing/suspect old parts, warranty charges, no-proof billing, premature re-replacements — plus a check for parts spend far above the team. Tap a flag to see the job.</div></div>`;
  if (lastAudit && lastAudit.shrinkValue > 0) body += `<div class="card insight" data-nav="storehealth" style="cursor:pointer"><div class="row" style="gap:11px;align-items:flex-start"><div class="ins-ic">📦</div>
    <div style="flex:1"><div class="row between"><b style="font-size:14px">Store shrinkage — ${money(lastAudit.shrinkValue)}</b><span class="badge b-red">store</span></div>
    <div class="small muted" style="margin-top:3px">Last stock count found ${money(lastAudit.shrinkValue)} of parts gone without a job. Tap for store health.</div></div></div></div>`;
  if (!rows.length) {
    body += `<div class="card" style="text-align:center;padding:26px"><div style="font-size:34px">✅</div><div style="font-weight:700;margin-top:6px">No pilferage signals</div><div class="tiny muted" style="margin-top:4px">No mechanic is showing fraud patterns in the last 180 days. Keep core returns + after-photos on every job.</div></div>`;
    return shell('Pilferage radar', body);
  }
  body += rows.map((r, i) => `<div class="card">
    <div class="row between" style="align-items:flex-start"><div class="row" style="gap:11px;align-items:center"><div class="ins-ic">${i === 0 ? '🚨' : '🕵️'}</div>
      <div><b style="font-size:15px">${esc(r.u.name)}</b><div class="tiny muted">${r.jobCount} job(s) · ${r.flags.length} signal type(s)</div></div></div>
      <span class="badge ${riskClass(r.risk)}" style="font-size:14px">${r.risk}</span></div>
    <div class="hr" style="margin:8px 0"></div>
    ${r.flags.map((f) => `<div class="row between small" ${f.jobs.length ? `data-job="${f.jobs[0]}" style="cursor:pointer;padding:4px 0"` : 'style="padding:4px 0"'}>
      <span>${esc(f.label)}${f.count > 1 ? ` ×${f.count}` : ''}${f.jobs.length ? ' ›' : ''}</span><b style="color:var(--red)">+${f.points}</b></div>`).join('')}
  </div>`).join('');
  return shell('Pilferage radar', body);
}

/* ========================= Fuel & mileage =================================
 * Log fills (litres + ₹ + odometer) → km/l (tank-to-tank), fuel ₹/km, total
 * fuel spend, and a mileage-drop alert (engine trouble or fuel pilferage).
 */
const fuelEntries = (busId) => (S.cache.fuel || []).filter((f) => f.busId === busId).sort((a, b) => (a.odometer || 0) - (b.odometer || 0));
function busMileage(busId) {
  const fills = fuelEntries(busId);
  let litres = 0; const segs = [];
  for (let i = 1; i < fills.length; i++) {
    const d = (fills[i].odometer || 0) - (fills[i - 1].odometer || 0);
    if (d > 0 && fills[i].litres > 0) { litres += fills[i].litres; segs.push(d / fills[i].litres); }
  }
  const totalCost = fills.reduce((s, f) => s + (f.cost || 0), 0);
  const spanKm = fills.length > 1 ? (fills[fills.length - 1].odometer - fills[0].odometer) : 0;
  const avgKmpl = litres > 0 && spanKm > 0 ? spanKm / litres : null;
  const lastKmpl = segs.length ? segs[segs.length - 1] : null;
  let drop = false;
  if (segs.length >= 3 && lastKmpl != null) {
    const prior = segs.slice(0, -1), pavg = prior.reduce((s, x) => s + x, 0) / prior.length;
    if (pavg > 0 && lastKmpl < pavg * 0.8) drop = true;     // >20% worse than usual
  }
  const fuelPerKm = spanKm > 0 ? totalCost / spanKm : null;
  return { fills: fills.length, avgKmpl, lastKmpl, totalCost, fuelPerKm, drop };
}
function sheetAddFuel(busId) {
  const buses = S.cache.buses;
  if (!buses.length) return openSheet('Log fuel', `<div class="banner warn">Add a bus first.</div>`);
  const b = busId ? byId(buses, busId) : null;
  openSheet('Log fuel', `
    ${b ? `<input type="hidden" id="f-fbus" value="${b.id}"><div class="small muted" style="margin-bottom:10px">Bus: <b>${esc(b.regNo)}</b></div>`
      : `<label class="field"><span class="lbl">Bus</span><select id="f-fbus">${buses.map((x) => `<option value="${x.id}">${esc(x.regNo)}</option>`).join('')}</select></label>`}
    <div class="grid2">
      <label class="field"><span class="lbl">⛽ Litres</span><input id="f-flitres" type="number" inputmode="decimal" placeholder="e.g. 60"></label>
      <label class="field"><span class="lbl">₹ Amount</span><input id="f-fcost" type="number" inputmode="numeric"></label>
    </div>
    <label class="field"><span class="lbl">🛣️ Odometer now (km)</span><input id="f-fodo" type="number" inputmode="numeric" value="${b ? (b.odometer || '') : ''}" placeholder="current reading"></label>
    <label class="repcheck"><input type="checkbox" id="f-ffull" checked> <span>Filled to full (needed for accurate km/l)</span></label>
    <button class="btn primary" data-act="saveFuel">${t('save')}</button>`);
}
async function saveFuel() {
  const busId = $('#f-fbus').value;
  const litres = Number($('#f-flitres').value) || 0, cost = Number($('#f-fcost').value) || 0, odo = Number($('#f-fodo').value) || 0;
  if (!busId) return toast('Pick a bus');
  if (litres <= 0) return toast('Enter litres');
  if (odo <= 0) return toast('Enter the odometer reading');
  await DB.put('fuel', { id: uid('fu-'), busId, litres, cost, odometer: odo, full: $('#f-ffull').checked, at: Date.now(), by: S.user.id });
  // Keep the bus odometer fresh from the fill reading if it's higher.
  const b = byId(S.cache.buses, busId);
  if (b && odo > (b.odometer || 0)) { b.odometer = odo; await DB.put('buses', b); }
  await load(); closeSheet(); toast('Fuel logged ✓'); rerender();
}
function viewFuel() {
  const rows = [...S.cache.buses].map((b) => ({ b, m: busMileage(b.id) })).sort((a, b) => b.m.totalCost - a.m.totalCost);
  const fleetCost = rows.reduce((s, x) => s + x.m.totalCost, 0);
  let body = '';
  if (can(S.user.role, 'addFuel')) body += `<button class="btn primary" data-act="addFuel" style="margin-bottom:12px">⛽ Log fuel</button>`;
  body += `<div class="card"><div class="muted small">Total fuel spend (logged)</div><div class="stat" style="color:var(--brand2)">${money(fleetCost)}</div>
    <div class="tiny muted">Log full-tank fills for accurate km/l.</div></div>`;
  body += `<div class="card"><h3>Mileage by bus</h3>`;
  body += rows.length ? rows.map(({ b, m }) => `<div class="li" data-act="busReport" data-bus="${b.id}" style="cursor:pointer">${avatar(busImg(b), '🚌')}
    <div class="main"><div class="t">${esc(b.regNo)}${m.drop ? ' <span class="badge b-red">mileage ↓</span>' : ''}</div>
      <div class="s">${m.avgKmpl != null ? m.avgKmpl.toFixed(1) + ' km/l' : 'no data'} · ${money(m.totalCost)} · ${m.fills} fill(s)</div></div>
    ${m.fuelPerKm != null ? `<b>₹${m.fuelPerKm.toFixed(1)}/km</b>` : ''}</div>`).join('') : `<div class="empty">No buses</div>`;
  body += `</div>`;
  shell('Fuel & mileage', body);
}

/* ===== AdBlue / DEF (diesel exhaust fluid) — SCR consumable for BS6/Volvo ====
 * NOT the farm urea — this is automotive-grade DEF the SCR system injects to cut
 * NOx on BS6/Volvo engines. Tracked like fuel (litres + ₹ + odometer) so
 * consumption (L/100km) and cost are visible, and abnormal use (a faulty or
 * tampered SCR/dosing unit) is flagged. */
const busUsesDef = (b) => !!(b && (b.usesDef || /volvo|scania|benz|bharat.?benz|bs.?6|euro\s?6/i.test((b.model || '') + ' ' + (b.engine || ''))));
const defEntries = (busId) => (S.cache.def || []).filter((d) => d.busId === busId).sort((a, b) => (a.odometer || 0) - (b.odometer || 0));
function busDef(busId) {
  const fills = defEntries(busId);
  const litresTotal = fills.reduce((s, f) => s + (f.litres || 0), 0);
  const costTotal = fills.reduce((s, f) => s + (f.cost || 0), 0);
  const spanKm = fills.length > 1 ? (fills[fills.length - 1].odometer - fills[0].odometer) : 0;
  const litresBetween = fills.slice(1).reduce((s, f) => s + (f.litres || 0), 0);   // tank-to-tank: exclude the first fill
  const perHundred = spanKm > 0 && litresBetween > 0 ? (litresBetween / spanKm * 100) : null;   // L/100km
  const last = fills.length ? fills[fills.length - 1] : null;
  return { fills: fills.length, litresTotal, costTotal, spanKm, perHundred, last };
}
// DEF status vs the ~1.5 L/100km norm + distance since the last top-up.
function defStatus(bus) {
  const d = busDef(bus.id);
  const kmSince = d.last ? Math.max(0, (bus.odometer || 0) - (d.last.odometer || 0)) : null;
  let flag = null;
  if (d.perHundred != null && d.perHundred > 3) flag = { sev: 'high', msg: `High DEF use (${d.perHundred.toFixed(1)} L/100km) — check the SCR/dosing unit.` };
  else if (kmSince != null && kmSince > 4000) flag = { sev: 'med', msg: `No DEF top-up in ${kmSince.toLocaleString('en-IN')} km — tank may be low.` };
  return Object.assign({}, d, { kmSince, flag });
}
function sheetAddDef(busId) {
  const buses = (S.cache.buses || []);
  const usable = buses.filter(busUsesDef);
  const list = usable.length ? usable : buses;
  if (!list.length) return openSheet('Log AdBlue/DEF', `<div class="banner warn">Add a bus first.</div>`);
  const b = busId ? byId(buses, busId) : null;
  openSheet('Log AdBlue / DEF', `
    <div class="tiny muted" style="margin-bottom:10px">Automotive DEF (AdBlue) for the SCR exhaust system — not farm urea.</div>
    ${b ? `<input type="hidden" id="d-bus" value="${b.id}"><div class="small muted" style="margin-bottom:10px">Bus: <b>${esc(b.regNo)}</b></div>`
      : `<label class="field"><span class="lbl">Bus</span><select id="d-bus">${list.map((x) => `<option value="${x.id}">${esc(x.regNo)}</option>`).join('')}</select></label>`}
    <div class="grid2">
      <label class="field"><span class="lbl">🧪 Litres</span><input id="d-litres" type="number" inputmode="decimal" placeholder="e.g. 10"></label>
      <label class="field"><span class="lbl">₹ Amount</span><input id="d-cost" type="number" inputmode="numeric"></label></div>
    <label class="field"><span class="lbl">🛣️ Odometer now (km)</span><input id="d-odo" type="number" inputmode="numeric" value="${b ? (b.odometer || '') : ''}" placeholder="current reading"></label>
    <button class="btn primary" data-act="saveDef">${t('save')}</button>`);
}
async function saveDef() {
  const busId = ($('#d-bus') || {}).value;
  const litres = Number(($('#d-litres') || {}).value) || 0, cost = Number(($('#d-cost') || {}).value) || 0, odo = Number(($('#d-odo') || {}).value) || 0;
  if (!busId) return toast('Pick a bus');
  if (litres <= 0) return toast('Enter litres');
  if (odo <= 0) return toast('Enter the odometer reading');
  await DB.put('def', { id: uid('def-'), busId, litres, cost, odometer: odo, at: Date.now(), by: S.user.id });
  const b = byId(S.cache.buses, busId);
  if (b) { let ch = false; if (!b.usesDef) { b.usesDef = true; ch = true; } if (odo > (b.odometer || 0)) { b.odometer = odo; ch = true; } if (ch) await DB.put('buses', b); }
  await load(); closeSheet(); toast('AdBlue/DEF logged ✓'); rerender();
}
function viewDef() {
  const buses = [...(S.cache.buses || [])];
  const defBuses = buses.filter(busUsesDef);
  const rows = (defBuses.length ? defBuses : buses).map((b) => ({ b, s: defStatus(b) })).sort((a, b) => b.s.costTotal - a.s.costTotal);
  const fleetCost = rows.reduce((s, x) => s + x.s.costTotal, 0);
  let body = '';
  if (can(S.user.role, 'addFuel')) body += `<button class="btn primary" data-act="addDef" style="margin-bottom:12px">🧪 Log AdBlue / DEF</button>`;
  body += `<div class="card"><div class="muted small">Total DEF spend (logged)</div><div class="stat" style="color:var(--brand2)">${money(fleetCost)}</div>
    <div class="tiny muted">AdBlue for BS6/Volvo SCR engines — not farm urea. Log top-ups for consumption &amp; cost.</div></div>`;
  if (!defBuses.length) body += `<div class="banner warn">No bus is marked as using DEF yet. Logging a top-up marks that bus automatically.</div>`;
  body += `<div class="card"><h3>DEF by bus</h3>`;
  body += rows.length ? rows.map(({ b, s }) => `<div class="li" data-act="addDef" data-bus="${b.id}" style="cursor:pointer">${avatar(busImg(b), '🚌')}
    <div class="main"><div class="t">${esc(b.regNo)}${s.flag ? ` <span class="badge ${s.flag.sev === 'high' ? 'b-red' : 'b-amber'}">DEF ⚠️</span>` : ''}</div>
      <div class="s">${s.perHundred != null ? s.perHundred.toFixed(1) + ' L/100km' : 'no data'} · ${money(s.costTotal)} · ${s.fills} top-up(s)</div>
      ${s.flag ? `<div class="tiny" style="color:${s.flag.sev === 'high' ? 'var(--red)' : 'var(--amber)'}">${esc(s.flag.msg)}</div>` : ''}</div>
    <span class="tiny" style="color:var(--brand2)">+ log ›</span></div>`).join('') : `<div class="empty">No buses</div>`;
  body += `</div>`;
  shell('AdBlue / DEF', body);
}

/* ========================= Safety & misuse (from live GPS) ================= */
function evDetail(e) {
  if (e.type === 'overspeed') return Math.round(e.value) + ' km/h';
  if (e.type === 'harshbrake') return '−' + Math.round(e.value) + ' km/h';
  if (e.type === 'idle') return Math.round(e.value) + ' min idling';
  if (e.type === 'night') return 'moving ' + Math.round(e.value) + ' km/h at night';
  return '';
}
function viewSafety() {
  const since = Date.now() - 7 * day;
  const evs = (S.cache.gpsevents || []).filter((e) => e.at >= since).sort((a, b) => b.at - a.at);
  const byType = {}; evs.forEach((e) => { byType[e.type] = (byType[e.type] || 0) + 1; });
  let body = `<div class="card"><div class="tiny muted">Auto-detected from live GPS over the last 7 days — these also lower the driver's score.</div></div>`;
  body += `<div class="card"><h3>Last 7 days</h3>` + Object.keys(GPS_EVENT).map((t) =>
    `<div class="row between small" style="padding:4px 0"><span>${GPS_EVENT[t].icon} ${GPS_EVENT[t].label}</span><b>${byType[t] || 0}</b></div>`).join('') + `</div>`;
  body += `<div class="card"><h3>Recent events</h3>`;
  body += evs.length ? evs.slice(0, 50).map((e) => { const c = GPS_EVENT[e.type] || { icon: '•', label: e.type };
    return `<div class="li"><div class="ava">${c.icon}</div><div class="main"><div class="t">${esc(e.reg)} · ${c.label}</div>
      <div class="s">${evDetail(e)} · ${fmtDateTime(e.at)}</div></div></div>`; }).join('') : `<div class="empty">No safety events — clean driving 👍</div>`;
  body += `</div>`;
  shell('Safety & misuse', body);
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
  // Anti-fraud gate: warn if a replaced part's old core was never returned.
  const miss = coreMissing(j);
  if (miss.length && !confirm(`Old part NOT returned for ${miss.length} replaced part(s).\nThis is how swap & warranty fraud hides. Verify and pay anyway?`)) return;
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
  j.reworkCount = (j.reworkCount || 0) + 1;   // counts against the mechanic's quality score
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

  // Document vault summary (tap to manage)
  const ds = driverDocStatus(d);
  body += `<div class="card" data-act="openDriverDocs" data-driver="${d.id}" style="cursor:pointer"><div class="row between">
    <div class="row" style="gap:12px;align-items:center">${progressRing(ds.pct)}
      <div><div style="font-weight:800">📂 Documents</div>
        <div class="small muted">${ds.mandDone}/${ds.mandTotal} mandatory${ds.mandDone < ds.mandTotal ? ' · ⚠️ incomplete' : ' ✓'}</div></div></div>
    <span class="tiny" style="color:var(--brand2)">open ›</span></div></div>`;

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

  // Safety events auto-detected from the assigned bus's live GPS (last 90 days)
  if (d.busId) {
    const since = Date.now() - 90 * day;
    const evs = gpsEventsForBus(d.busId).filter((e) => e.at >= since);
    const byT = {}; evs.forEach((e) => { byT[e.type] = (byT[e.type] || 0) + 1; });
    body += `<div class="card"><div class="row between"><h3>Safety (live GPS)</h3><span class="badge ${evs.length ? 'b-amber' : 'b-green'}">${evs.length}</span></div>`;
    if (evs.length) {
      body += `<div class="row" style="flex-wrap:wrap;gap:6px;margin-bottom:8px">${Object.keys(byT).map((t) => { const c = GPS_EVENT[t] || { icon: '•', label: t }; return `<span class="badge b-low">${c.icon} ${c.label} ×${byT[t]}</span>`; }).join('')}</div>`;
      body += evs.slice(0, 6).map((e) => { const c = GPS_EVENT[e.type] || { icon: '•', label: e.type };
        return `<div class="li"><div class="ava">${c.icon}</div><div class="main"><div class="t">${c.label}</div><div class="s">${evDetail(e)} · ${fmtDate(e.at)}</div></div></div>`; }).join('');
    } else { body += `<div class="muted small">No GPS safety flags 👍</div>`; }
    body += `</div>`;
  }
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

// A conductor's bus is the one they're mapped to (bus.conductorUserId).
const busForConductor = (userId) => (S.cache.buses || []).find((b) => b.conductorUserId === userId) || null;
function viewConductorHome() {
  const bus = busForConductor(S.user.id);
  let body = `<div class="greet"><div class="greet-av">🎫</div>
    <div><div class="greet-hi">${t('namaste')}, ${esc(S.user.name)} 👋</div><div class="muted small">${esc(BIZ)} · ${fmtToday()}</div></div></div>`;
  if (bus) {
    body += `<div class="hero cover"><img src="${busImg(bus)}" alt=""><div class="hero-cap"><div class="hero-t">${esc(bus.regNo)}</div><div class="hero-s">My bus</div></div></div>`;
    body += `<div class="card"><h3>🧭 Route &amp; crew</h3>`;
    if (bus.routeLabel) body += `<div class="row between small" style="padding:3px 0"><span class="muted">Route</span><b>${esc(expandRoute(bus.routeLabel))}</b></div>`;
    if (bus.driverCrew) body += `<div class="row between small" style="padding:3px 0"><span class="muted">Driver(s)</span><b>${esc(_titleCase(bus.driverCrew))}</b></div>`;
    if (bus.crewPhone) body += `<div class="row between small" style="padding:3px 0"><span class="muted">Contact</span><a href="tel:${esc((bus.crewPhone || '').replace(/\s/g, ''))}"><b>${esc(bus.crewPhone)}</b></a></div>`;
    body += `</div>`;
  } else body += `<div class="card"><div class="empty">No bus assigned yet. Ask your supervisor.</div></div>`;
  shell(t('myTrips'), body);
}

/* ===== Crew logins & PINs — give imported drivers/conductors app accounts =====
 * Creates a user account (role driver/conductor) + a device-local login PIN for
 * each driver profile and each bus conductor, mapped to their bus. Idempotent:
 * skips anyone who already has a login. PINs default to the last 4 of their
 * phone (memorable) or a random 4-digit; the owner distributes them and staff
 * can change theirs after first login. */
const _pin4 = (phone) => { const d = (phone || '').replace(/\D/g, ''); return d.length >= 4 ? d.slice(-4) : String(1000 + Math.floor(Math.random() * 9000)); };
async function createCrewLogins() {
  const haveUser = new Set((S.cache.users || []).map((u) => u.id));
  const newUsers = [], updDrivers = [], updBuses = []; let driverLogins = 0, conductorLogins = 0;
  (S.cache.drivers || []).forEach((d) => {
    if (d.userId && haveUser.has(d.userId)) return;
    const uid2 = 'u-' + d.id;
    if (!haveUser.has(uid2)) { newUsers.push({ id: uid2, name: d.name, role: 'driver' }); haveUser.add(uid2); }
    if (!credGet(uid2)) credSet(uid2, _pin4(d.phone));
    d.userId = uid2; updDrivers.push(d); driverLogins++;
  });
  (S.cache.buses || []).forEach((b) => {
    const nm = (b.conductor || '').trim(); if (!nm || /^[-–—\s.]*$/.test(nm)) return;
    if (b.conductorUserId && haveUser.has(b.conductorUserId)) return;
    const uid2 = 'u-cond-' + _normReg(b.regNo);
    if (!haveUser.has(uid2)) { newUsers.push({ id: uid2, name: _titleCase(nm), role: 'conductor' }); haveUser.add(uid2); }
    if (!credGet(uid2)) credSet(uid2, _pin4(b.crewPhone));
    b.conductorUserId = uid2; updBuses.push(b); conductorLogins++;
  });
  if (newUsers.length) await DB.bulkPut('users', newUsers);
  if (updDrivers.length) await DB.bulkPut('drivers', updDrivers);
  if (updBuses.length) await DB.bulkPut('buses', updBuses);
  await load();
  return { driverLogins, conductorLogins, created: newUsers.length };
}
async function makeCrewLogins() {
  const stop = showBusyOverlay('Creating crew logins…');
  const r = await createCrewLogins();
  if (stop) stop();
  toast(r.created ? `${r.driverLogins} driver + ${r.conductorLogins} conductor logins ready ✓` : 'All crew already have logins');
  rerender();
}
function viewCrewPins() {
  const users = [...(S.cache.users || [])].filter((u) => u.role === 'driver' || u.role === 'conductor')
    .sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name));
  const busOf = (u) => { if (u.role === 'driver') { const d = (S.cache.drivers || []).find((x) => x.userId === u.id); return d ? busName(d.busId) : ''; } const b = busForConductor(u.id); return b ? b.regNo : ''; };
  let body = `<div class="card"><div class="tiny muted">App login PINs for drivers &amp; conductors (stored on this device). Share each person their PIN — they can change it after first login in Me → Change PIN. Default PIN is the last 4 digits of their phone.</div>
    <button class="btn primary" data-act="makeCrewLogins" style="margin-top:10px">👥 Create missing logins &amp; PINs</button></div>`;
  body += `<div class="card"><h3>Drivers &amp; conductors (${users.length})</h3>`;
  body += users.length ? users.map((u) => `<div class="li"><div class="ava">${ROLE_META[u.role][0]}</div>
    <div class="main"><div class="t">${esc(u.name)}</div><div class="s">${u.role}${busOf(u) ? ' · ' + esc(busOf(u)) : ''}</div></div>
    <span class="badge b-low" style="font-size:14px;letter-spacing:1px">${esc(credGet(u.id) || '— set —')}</span></div>`).join('') : `<div class="empty">No driver/conductor logins yet — tap “Create missing logins”.</div>`;
  body += `</div>`;
  shell('Crew logins & PINs', body);
}

/* ===== Driver document vault ============================================= */
const DRIVER_DOCS = [
  { key: 'license', label: 'Driving License', icon: '🚗', mandatory: true, num: true, expiry: true },
  { key: 'aadhaar', label: 'Aadhaar Card', icon: '🆔', mandatory: true, num: true },
  { key: 'pan', label: 'PAN Card', icon: '💳', mandatory: true, num: true },
  { key: 'police', label: 'Police Verification', icon: '👮', mandatory: false, expiry: true },
  { key: 'photo', label: 'Photograph', icon: '📷', mandatory: false },
  { key: 'medical', label: 'Medical Cert.', icon: '🩺', mandatory: false, expiry: true },
];
const docOf = (d, key) => (d.docs || {})[key];
function driverDocStatus(d) {
  const mand = DRIVER_DOCS.filter((x) => x.mandatory);
  const mandDone = mand.filter((x) => docOf(d, x.key) && docOf(d, x.key).photo).length;
  const allDone = DRIVER_DOCS.filter((x) => docOf(d, x.key) && docOf(d, x.key).photo).length;
  return { mandDone, mandTotal: mand.length, allDone, allTotal: DRIVER_DOCS.length, pct: mand.length ? Math.round(mandDone / mand.length * 100) : 100 };
}
// Animated SVG completion ring. animate=true starts empty (filled after mount).
function progressRing(pct, animate) {
  const r = 30, c = 2 * Math.PI * r, p = Math.max(0, Math.min(100, pct)), off = c * (1 - p / 100);
  const col = p >= 100 ? '#16a571' : '#2563eb';
  return `<svg class="ring-svg" width="76" height="76" viewBox="0 0 76 76">
    <circle cx="38" cy="38" r="${r}" fill="none" stroke="var(--line,#e6e9f0)" stroke-width="7"/>
    <circle class="fg" cx="38" cy="38" r="${r}" fill="none" stroke="${col}" stroke-width="7" stroke-linecap="round"
      stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(animate ? c : off).toFixed(1)}" data-off="${off.toFixed(1)}" transform="rotate(-90 38 38)"/>
    <text x="38" y="44" text-anchor="middle" font-size="16" font-weight="800" fill="var(--ink,#161922)">${Math.round(p)}%</text></svg>`;
}
function viewDriverDocs(driverId) {
  const d = driverById(driverId); if (!d) return viewDrivers();
  const docs = d.docs || {}, st = driverDocStatus(d);
  let body = `<div class="card"><div class="ringwrap">${progressRing(st.pct, true)}
    <div><div style="font-weight:800;font-size:17px">${esc(d.name)}</div>
      <div class="small muted">${st.mandDone}/${st.mandTotal} mandatory · ${st.allDone}/${st.allTotal} total on file</div>
      <div class="tiny" style="margin-top:5px;color:${st.mandDone < st.mandTotal ? '#ef4444' : '#16a571'};font-weight:700">${st.mandDone < st.mandTotal ? '⚠️ Mandatory documents missing' : '✓ All mandatory documents on file'}</div></div></div></div>`;
  body += `<div class="docgrid">`;
  body += DRIVER_DOCS.map((doc, i) => {
    const cur = docs[doc.key], has = cur && cur.photo;
    const exp = has && doc.expiry && cur.expiry, expSoon = exp && daysLeft(cur.expiry) <= 30;
    const cls = has ? 'done' : (doc.mandatory ? 'missing' : '');
    const stat = has ? (exp ? (expSoon ? `<span style="color:#f59e0b">expires ${fmtDate(cur.expiry)}</span>` : 'valid') : 'on file') : (doc.mandatory ? 'Required' : 'Add');
    return `<div class="doccard ${cls}" data-act="driverDoc" data-driver="${d.id}" data-key="${doc.key}" style="animation-delay:${Math.min(i, 8) * 0.05}s">
      ${has ? '<div class="dtick">✅</div>' : ''}
      <div class="dicon">${doc.icon}</div>
      <div class="dname">${doc.label}</div>
      <div class="dstat" style="${has ? 'color:var(--muted,#8b91a0)' : 'color:' + (doc.mandatory ? '#ef4444' : '#8b91a0')}">${stat}</div>
      ${doc.mandatory && !has ? '<div class="mand">MANDATORY</div>' : ''}</div>`;
  }).join('');
  body += `</div><div class="spacer"></div>`;
  shell('Documents', body);
  const fg = document.querySelector('.ring-svg .fg');
  if (fg) requestAnimationFrame(() => requestAnimationFrame(() => { fg.style.strokeDashoffset = fg.getAttribute('data-off'); }));
}
let _docShot = null;
function sheetDriverDoc(driverId, key) {
  const doc = DRIVER_DOCS.find((x) => x.key === key); if (!doc) return;
  const d = driverById(driverId); const cur = (d.docs || {})[key] || {};
  _docShot = cur.photo || null;
  openSheet(doc.label, `
    <div class="tiny muted" style="margin-bottom:12px">${doc.icon} ${doc.mandatory ? 'Mandatory document — required for every driver.' : 'Optional document.'}</div>
    <button class="btn" data-act="captureDoc">📷 ${cur.photo ? 'Replace photo' : 'Take photo of document'}</button>
    <div id="doc-prev" class="thumbs" style="margin:10px 0">${cur.photo ? `<img class="thumb" src="${cur.photo}">` : ''}</div>
    ${doc.num ? `<label class="field"><span class="lbl">🔢 ${doc.label} number</span><input id="doc-num" value="${esc(cur.number || '')}" placeholder="Enter or scan"></label>
      <button class="btn sm ghost" data-act="scanDocNum" style="margin:-4px 0 10px">📷 Scan number</button>` : ''}
    ${doc.expiry ? `<label class="field"><span class="lbl">📅 Expiry date</span><input id="doc-exp" type="date" value="${cur.expiry ? new Date(cur.expiry).toISOString().slice(0, 10) : ''}"></label>` : ''}
    <button class="btn primary" data-act="saveDriverDoc" data-driver="${driverId}" data-key="${key}">Save document</button>`);
}
async function captureDoc() {
  const s = await capturePhoto(); if (!s) return;
  _docShot = s; const p = document.getElementById('doc-prev'); if (p) p.innerHTML = `<img class="thumb" src="${s}">`;
}
async function scanDocNum() {
  if (!_docShot) return toast('Take the document photo first');
  const stop = showBusyOverlay('Reading number…');
  const text = await localOcr(_docShot, { whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ' });
  if (stop) stop();
  // Pick the most ID-like token: PAN (AAAAA9999A), then a long digit run (Aadhaar/DL), else longest alnum word.
  const up = text.toUpperCase();
  const s = (up.match(/[A-Z]{5}[0-9]{4}[A-Z]/) || up.match(/[0-9]{4,}(?:\s?[0-9]{4,})*/) || up.match(/[A-Z0-9]{6,}/) || [''])[0].replace(/\s+/g, '');
  const el = document.getElementById('doc-num');
  if (el && s) { el.value = s; toast('Read: ' + s); }
  else toast(text ? 'Read "' + text.slice(0, 30) + '" — edit if wrong' : 'Could not read it — type it in');
}
async function saveDriverDoc(driverId, key) {
  const d = driverById(driverId); if (!d) return;
  if (!_docShot) return toast('Take a photo of the document');
  const photo = await Sync.uploadPhoto(_docShot) || _docShot;
  const entry = { photo, at: Date.now(), by: S.user.id };
  const numEl = document.getElementById('doc-num'); if (numEl) entry.number = numEl.value.trim();
  const expEl = document.getElementById('doc-exp'); if (expEl && expEl.value) entry.expiry = new Date(expEl.value).getTime();
  d.docs = Object.assign({}, d.docs, { [key]: entry });
  await DB.put('drivers', d);
  _docShot = null; await load(); closeSheet(); toast('Document saved ✓'); viewDriverDocs(driverId);
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
  setInterval(() => {
    if (!S.user) return;
    autoReconcileFleet();                                          // silent AirFi import + de-dup
    if ((S.cache.routes || []).length) checkRoutes({ alert: true });
  }, 60000);
  setTimeout(() => autoReconcileFleet(), 6000);                    // once shortly after first load/sync
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

  // Misuse / safety from live GPS (last 24h–7d)
  const ev24 = (S.cache.gpsevents || []).filter((e) => e.at >= Date.now() - day);
  const ev7 = (S.cache.gpsevents || []).filter((e) => e.at >= Date.now() - 7 * day);
  // Night movement in the last 24h — possible unauthorized use
  const nightBy = {}; ev24.filter((e) => e.type === 'night').forEach((e) => { nightBy[e.reg] = (nightBy[e.reg] || 0) + 1; });
  Object.keys(nightBy).forEach((reg) => out.push({ sev: 'high', icon: '🌙', title: `Night movement — ${reg}`,
    detail: `${nightBy[reg]} night-time move(s) in 24h. Confirm it's an authorised trip, not misuse.`, nav: { name: 'safety' } }));
  // Overspeed-heavy in the last 7 days
  const ovBy = {}; ev7.filter((e) => e.type === 'overspeed').forEach((e) => { ovBy[e.reg] = (ovBy[e.reg] || 0) + 1; });
  Object.entries(ovBy).filter(([, n]) => n >= 5).forEach(([reg, n]) => out.push({ sev: 'med', icon: '💨', title: `Frequent overspeeding — ${reg}`,
    detail: `${n} overspeed events this week. Coach the driver — it raises crash & fuel risk.`, nav: { name: 'safety' } }));
  // Heavy idling — fuel waste
  const idleBy = {}; ev7.filter((e) => e.type === 'idle').forEach((e) => { idleBy[e.reg] = (idleBy[e.reg] || 0) + 1; });
  Object.entries(idleBy).filter(([, n]) => n >= 5).forEach(([reg, n]) => out.push({ sev: 'low', icon: '🐌', title: `Heavy idling — ${reg}`,
    detail: `${n} long-idle events this week, burning fuel parked. Ask drivers to switch off.`, nav: { name: 'safety' } }));

  // Parts fraud — old core not returned, or a returned "old" part looks new
  jobs.filter((j) => ['done', 'verified'].includes(j.status)).forEach((j) => {
    if (coreMissing(j).length) out.push({ sev: 'med', icon: '🔧', title: `Old part not returned — ${busName(j.busId)}`,
      detail: `${coreMissing(j).length} replaced part(s) with no old core returned — possible swap or warranty fraud.`, nav: { name: 'jobs', id: j.id } });
    if ((j.coreReturns || []).some((c) => c.condition === 'suspect')) out.push({ sev: 'high', icon: '🚩', title: `Suspicious old part — ${busName(j.busId)}`,
      detail: `A returned "old" part looks nearly new. Inspect before paying.`, nav: { name: 'jobs', id: j.id } });
    // Charged for a part that was still under supplier warranty
    (j.partsUsed || []).forEach((l) => {
      if ((l.cost || 0) <= 0) return;
      const at = j.closedAt || j.createdAt;
      const st = warrantyStatus(j.busId, l.partId, at, at);
      if (st && st.underWarranty) { const p = byId(S.cache.parts, l.partId);
        out.push({ sev: 'high', icon: '🧾', title: `Charged for a warranty part — ${busName(j.busId)}`,
          detail: `${p ? p.name : l.partId} was under ${st.supplier || 'supplier'} warranty when replaced & billed ${money(l.cost)} — should have been free.`, nav: { name: 'jobs', id: j.id } }); }
    });
  });

  // Parts anomalies — repeat-failure / premature replacement (from fitment history)
  const fitMap = {};
  jobs.forEach((j) => (j.partsUsed || []).forEach((l) => { const k = j.busId + '|' + l.partId; (fitMap[k] = fitMap[k] || []).push(j.closedAt || j.createdAt); }));
  Object.entries(fitMap).forEach(([k, times]) => {
    if (times.length < 2) return;
    times.sort((a, b) => a - b);
    const [busId, partId] = k.split('|'); const p = byId(S.cache.parts, partId); const pn = p ? p.name : partId;
    const recent = times.filter((t) => t >= Date.now() - 365 * day);
    if (recent.length >= 3) out.push({ sev: 'high', icon: '🔁', title: `Repeat failure — ${pn} on ${busName(busId)}`,
      detail: `Replaced ${recent.length}× in 12 months. A recurring fault, or the part is being recycled/resold.`, nav: { name: 'buses', id: busId } });
    else { const gap = (times[times.length - 1] - times[times.length - 2]) / day;
      if (gap < 60) out.push({ sev: 'med', icon: '⏱️', title: `Premature replacement — ${pn} on ${busName(busId)}`,
        detail: `Replaced again after only ${Math.round(gap)} days. Verify it was genuinely needed.`, nav: { name: 'jobs', id: '' } }); }
  });

  // Driver documents — mandatory missing or expiring soon
  (S.cache.drivers || []).forEach((d) => {
    const st = driverDocStatus(d);
    if (st.mandDone < st.mandTotal) out.push({ sev: 'med', icon: '📂', title: `Driver docs incomplete — ${d.name}`,
      detail: `${st.mandTotal - st.mandDone} mandatory document(s) missing (license/Aadhaar/PAN).`, nav: { name: 'driverdocs', id: d.id } });
    DRIVER_DOCS.filter((x) => x.expiry).forEach((x) => { const c = docOf(d, x.key);
      if (c && c.expiry && daysLeft(c.expiry) <= 30) out.push({ sev: daysLeft(c.expiry) < 0 ? 'high' : 'med', icon: '📄', title: `${x.label} ${daysLeft(c.expiry) < 0 ? 'expired' : 'expiring'} — ${d.name}`,
        detail: `${x.label} ${daysLeft(c.expiry) < 0 ? 'expired' : 'expires'} ${fmtDate(c.expiry)}.`, nav: { name: 'driverdocs', id: d.id } }); });
  });

  // Preventive maintenance forecast — get ahead of breakdowns
  buses.forEach((b) => {
    const sf = serviceForecast(b);
    if (sf.status === 'overdue') out.push({ sev: 'high', icon: '🛠️', title: `Service overdue — ${b.regNo}`,
      detail: `${-sf.dueIn} km past due. Service it before it becomes a breakdown.`, nav: { name: 'buses', id: b.id } });
    else if (sf.daysLeft != null && sf.daysLeft >= 0 && sf.daysLeft <= 10) out.push({ sev: 'med', icon: '🛠️', title: `Service due soon — ${b.regNo}`,
      detail: `~${sf.dueIn} km (${sf.daysLeft}d) to next service. Plan it now to avoid downtime.`, nav: { name: 'buses', id: b.id } });
    partLifeForecast(b).filter((p) => p.status === 'overdue' || p.daysLeft <= 7).slice(0, 1).forEach((p) => out.push({ sev: 'med', icon: '🔩',
      title: `${p.label} due — ${b.regNo}`, detail: p.daysLeft <= 0 ? `Past its ~life by ${-p.daysLeft}d — inspect/replace.` : `~${p.daysLeft}d of life left.`, nav: { name: 'buses', id: b.id } }));
  });

  // Stock shrinkage from the latest physical count
  const lastAudit = (S.cache.audits || []).slice().sort((a, b) => b.at - a.at)[0];
  if (lastAudit && lastAudit.shrinkValue > 0) out.push({ sev: 'high', icon: '📦', title: `Stock shrinkage — ${money(lastAudit.shrinkValue)}`,
    detail: `Last stock count found ${money(lastAudit.shrinkValue)} of parts missing without a job. Investigate the store.`, nav: { name: 'storehealth' } });

  // Mileage drop — engine trouble or fuel pilferage
  buses.forEach((b) => { const m = busMileage(b.id);
    if (m.drop) out.push({ sev: 'high', icon: '⛽', title: `Mileage dropped — ${b.regNo}`,
      detail: `Now ${m.lastKmpl.toFixed(1)} km/l vs usual ~${m.avgKmpl.toFixed(1)}. Check for an engine issue or fuel pilferage.`,
      nav: { name: 'buses', id: b.id } }); });

  // Tyres / components worn out or sitting at a vendor — plan the remould/repair
  componentAlerts().forEach((a) => out.push({
    sev: a.status === 'overdue' ? 'high' : a.status === 'at-vendor' ? 'low' : 'med',
    icon: compKind(a.c)[0], title: `${compKind(a.c)[1]}${a.status === 'at-vendor' ? ' at vendor' : ' ' + (a.c.position || 'worn')} — ${a.c.busId ? busName(a.c.busId) : 'store'}`,
    detail: a.msg + (a.status === 'at-vendor' ? '. Follow up so the bus isn\'t short a part.' : '.'), nav: { name: 'components', id: a.c.id } }));

  // AdBlue / DEF — abnormal consumption or a tank likely running low (SCR buses)
  buses.filter(busUsesDef).forEach((b) => { const ds = defStatus(b); if (ds.flag) out.push({
    sev: ds.flag.sev, icon: '🧪', title: `AdBlue/DEF — ${b.regNo}`, detail: ds.flag.msg, nav: { name: 'def' } }); });

  const rank = { high: 0, med: 1, low: 2 };
  return out.sort((a, b) => rank[a.sev] - rank[b.sev]);
}

function insightCard(i) {
  const c = i.sev === 'high' ? 'b-red' : i.sev === 'med' ? 'b-amber' : 'b-low';
  const nav = i.nav ? (i.nav.name === 'components' && i.nav.id
    ? `data-act="openComp" data-id="${i.nav.id}"`
    : i.nav.id
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
const ROUTE_PERM = { insights: 'insights', drivers: 'manageDrivers', assignments: 'assignDriver', routes: 'manageRoutes', reports: 'dashboard', busreport: 'dashboard', livemap: 'dashboard', track: 'dashboard', fuel: 'addFuel', safety: 'dashboard', warranty: 'addFuel', storehealth: 'issuePart', linkgps: 'addBus', newjob: 'addJob', forecast: 'dashboard', pilferage: 'insights', components: 'issuePart', def: 'addFuel', vendors: 'addPurchase', import: 'addPurchase', crewpins: 'manageDrivers' };
function render(r) {
  if (typeof stopMap === 'function') stopMap();   // leaving any screen halts the live-map refresh timer
  if (typeof stopTrack === 'function') stopTrack();
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
    case 'livemap': return viewLiveMap();
    case 'track': return viewTrackBus(r.id);
    case 'company': return viewCompanyDetail(r.id);
    case 'reports': return viewReports();
    case 'busreport': return viewBusReport(r.id);
    case 'fuel': return viewFuel();
    case 'safety': return viewSafety();
    case 'warranty': return viewWarranty();
    case 'storehealth': return viewStoreHealth();
    case 'linkgps': return viewLinkGps();
    case 'newjob': return viewNewJob(r.prefill || {});
    case 'driverdocs': return viewDriverDocs(r.id);
    case 'forecast': return viewForecast();
    case 'scoreboard': return viewScoreboard();
    case 'scorecard': return viewScorecard(r.id);
    case 'pilferage': return viewPilferage();
    case 'components': return r.id ? viewComponentDetail(r.id) : viewComponents();
    case 'def': return viewDef();
    case 'vendors': return r.id ? viewVendorDetail(r.id) : viewVendors();
    case 'import': return viewImport();
    case 'crewpins': return viewCrewPins();
    default: return viewHome();
  }
}
// Navigation is mirrored into the browser history so the phone/browser BACK
// button does an in-app back instead of leaving the page (which dropped users
// onto the login screen). Every forward nav pushes one history entry; popstate
// is the single place the stack pops; at the root we re-push so back can never
// exit the app to the login screen.
function histPush() { try { history.pushState({ gs: S.stack.length }, ''); } catch (e) { /* ignore */ } }
function navTab(name) { S.stack = [{ name }]; render(current()); histPush(); }
function push(r) { S.stack.push(r); render(r); histPush(); }
function back() { try { history.back(); } catch (e) { if (S.stack.length > 1) { S.stack.pop(); render(current()); } } }
function rerender() { render(current()); }
// Back-compat shim: existing callers that say route({name,...}) now reset to that
// screen as a fresh root (used by login + a few in-view fallbacks).
function route(r) { S.stack = [r]; render(r); histPush(); }
window.addEventListener('popstate', () => {
  if (!S.user) return;                                   // on the login screen — nothing to pop
  if (S.stack.length > 1) { S.stack.pop(); render(current()); }
  else histPush();                                       // trap at root: stay in the app, don't exit to login
});

/* ----------------------------- Event binding ------------------------------ */
function bind() {
  const r = root();
  r.onclick = async (e) => {
    const el = e.target.closest('[data-act],[data-nav],[data-bus],[data-job],[data-part],[data-driver],[data-company],[data-routebus]');
    if (!el) return;
    const nav = el.getAttribute('data-nav');
    if (nav) return navTab(nav);
    const act = el.getAttribute('data-act');

    // Never treat a form control as a navigation target. An entity attr like
    // data-part on an <input> is a data-carrier (e.g. stock-count rows), not a
    // drill-in — without this guard, tapping the field navigates away and the
    // entry is lost. data-act buttons are unaffected (handled below).
    if (!act && /^(INPUT|SELECT|TEXTAREA|OPTION)$/.test((e.target.tagName || '')))
      { if (!e.target.closest('[data-act]')) return; }

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
      case 'scanBill': return scanBill();
      case 'openVendors': return push({ name: 'vendors' });
      case 'openImport': return push({ name: 'import' });
      case 'openCrewPins': return push({ name: 'crewpins' });
      case 'makeCrewLogins': return makeCrewLogins();
      case 'openVendor': return push({ name: 'vendors', id: el.getAttribute('data-id') });
      case 'addVendor': return sheetAddVendor();
      case 'editVendor': return sheetAddVendor(el.getAttribute('data-id'));
      case 'saveVendor': return saveVendor(el.getAttribute('data-id'));
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
      case 'openReports': return push({ name: 'reports' });
      case 'openForecast': return push({ name: 'forecast' });
      case 'setFleetRev': return setFleetRev();
      case 'openFuel': return push({ name: 'fuel' });
      case 'openSafety': return push({ name: 'safety' });
      case 'openWarranty': return push({ name: 'warranty' });
      case 'openStoreHealth': return push({ name: 'storehealth' });
      case 'openPilferage': return push({ name: 'pilferage' });
      case 'openComponents': return push({ name: 'components' });
      case 'openComp': return push({ name: 'components', id: el.getAttribute('data-id') });
      case 'compFilter': _compFilter = el.getAttribute('data-v'); return rerender();
      case 'addComponent': return sheetAddComponent();
      case 'compFromPart': return sheetAddComponent(el.getAttribute('data-id'));
      case 'saveComponent': return saveComponent();
      case 'fitComp': return sheetFitComp(el.getAttribute('data-id'));
      case 'saveFitComp': return saveFitComp(el.getAttribute('data-id'));
      case 'removeComp': return removeComp(el.getAttribute('data-id'));
      case 'sendOutComp': return sheetSendOut(el.getAttribute('data-id'));
      case 'saveSendOut': return saveSendOut(el.getAttribute('data-id'));
      case 'receiveComp': return sheetReceiveComp(el.getAttribute('data-id'));
      case 'captureCompBill': return captureCompBill();
      case 'saveReceive': return saveReceive(el.getAttribute('data-id'));
      case 'scrapComp': return scrapComp(el.getAttribute('data-id'));
      case 'auditBlind': return sheetAudit('blind');
      case 'auditFull': return sheetAudit('full');
      case 'saveAudit': return saveAudit(el.getAttribute('data-mode'));
      case 'openLinkGps': return push({ name: 'linkgps' });
      case 'aiGradeCore': return aiGradeCore(el.getAttribute('data-job'), el.getAttribute('data-cr'));
      case 'scanSerial': return scanSerial(el.getAttribute('data-target'));
      case 'setPrio': return setPrio(el.getAttribute('data-v'));
      case 'busFilter': _busFilter = el.getAttribute('data-v'); return renderBusList();
      case 'openDriverDocs': return push({ name: 'driverdocs', id: el.getAttribute('data-driver') });
      case 'driverDoc': return sheetDriverDoc(el.getAttribute('data-driver'), el.getAttribute('data-key'));
      case 'captureDoc': return captureDoc();
      case 'scanDocNum': return scanDocNum();
      case 'saveDriverDoc': return saveDriverDoc(el.getAttribute('data-driver'), el.getAttribute('data-key'));
      case 'returnCore': return sheetReturnCore(el.getAttribute('data-job'));
      case 'captureCore': return captureCore();
      case 'saveCoreReturn': return saveCoreReturn(el.getAttribute('data-job'));
      case 'enableNotif': return enableNotifications();
      case 'disableNotif': return disableNotifications();
      case 'testNotif': return testNotification();
      case 'addFuel': return sheetAddFuel(el.getAttribute('data-bus'));
      case 'saveFuel': return saveFuel();
      case 'openDef': return push({ name: 'def' });
      case 'addDef': return sheetAddDef(el.getAttribute('data-bus'));
      case 'saveDef': return saveDef();
      case 'openLiveMap': return push({ name: 'livemap' });
      case 'trackBus': return push({ name: 'track', id: el.getAttribute('data-bus') });
      case 'openScoreboard': return push({ name: 'scoreboard' });
      case 'scorecard': return push({ name: 'scorecard', id: el.getAttribute('data-user') });
      case 'myScorecard': return push({ name: 'scorecard', id: S.user.id });
      case 'busReport': return push({ name: 'busreport', id: el.getAttribute('data-bus') });
      case 'reportPeriod': { S.reportDays = Number(el.getAttribute('data-days')); return rerender(); }
      case 'shareBusReport': return shareText(busName(el.getAttribute('data-bus')) + ' report', busReportText(el.getAttribute('data-bus')));
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
/* ----------------------------- Web-push notifications --------------------- */
const VAPID_PUBLIC = 'BPbZL6mTam86eXAc8zT4vDCnP-0huKTqogZVEWjkUrhEkpIIS-V_kdFC9o78Ibu55ln7QSqUaoVT0Uq7lWX7-r8';
function _urlB64ToUint8(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const s = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(s); const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
const pushEnabled = () => localStorage.getItem('pushOn') === '1' && ('Notification' in window) && Notification.permission === 'granted';
async function enableNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return toast('Notifications not supported on this device');
  let perm = Notification.permission;
  if (perm !== 'granted') perm = await Notification.requestPermission();
  if (perm !== 'granted') return toast('Allow notifications in your browser settings to enable');
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: _urlB64ToUint8(VAPID_PUBLIC) });
    const ok = await Sync.subscribePush(sub.toJSON(), S.user.role);
    localStorage.setItem('pushOn', ok ? '1' : '');
    toast(ok ? 'Phone alerts enabled ✓' : 'Saved here; will register when the server is reachable');
  } catch (e) { toast('Could not enable notifications'); }
  rerender();
}
async function disableNotifications() {
  try { const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription(); if (sub) await sub.unsubscribe(); } catch (e) {}
  localStorage.setItem('pushOn', ''); toast('Phone alerts off'); rerender();
}
async function testNotification() {
  const r = await Sync.pushTest();
  if (r && r.sent) toast(`Test sent to ${r.sent} device(s) ✓`);
  else if (r && !r.webpush) toast('Server push still deploying — try again shortly');
  else toast('No subscribed devices yet — enable alerts first');
}

const ROLE_META = { owner: ['👑', 'Owner'], supervisor: ['🧑‍🔧', 'Supervisor'], store: ['📦', 'Store'], mechanic: ['🔧', 'Mechanic'], driver: ['🧑‍✈️', 'Driver'], conductor: ['🎫', 'Conductor'] };
const roleEmoji = (r) => (ROLE_META[r] || ['🔧'])[0];
// Step 1 — pick your role. (Keeps the list manageable across a big fleet.)
function renderLogin() {
  _pinUser = null; _pin = '';
  const users = S.cache.users || [];
  const counts = {}; users.forEach((u) => { counts[u.role] = (counts[u.role] || 0) + 1; });
  const roles = Object.keys(ROLE_META).filter((r) => counts[r]);
  root().innerHTML = `<div class="login">
    <div class="row between" style="width:100%;max-width:420px"><span></span>
      <button class="lang" data-loginlang>${t('lang')}</button></div>
    <div class="bigicon">🚌</div>
    <h1 style="margin:0">${esc(BIZ)}</h1>
    <div class="muted small">${t('appName')} · ${t('tagline')}</div>
    <div class="muted small" style="margin-top:18px">Who are you?</div>
    <div class="userpick">${roles.map((r) => `<div class="u" data-role="${r}">
      <div style="font-size:22px">${ROLE_META[r][0]}</div>
      <div style="font-weight:700;font-size:14px">${ROLE_META[r][1]}</div>
      <div class="tiny muted">${counts[r]} ${counts[r] > 1 ? 'people' : 'person'}</div></div>`).join('')}</div>
    ${isDemoMode() && /^(localhost|127\.|192\.168\.|10\.|172\.1[6-9]\.|172\.2\d\.|172\.3[01]\.)/.test(location.hostname)
      ? `<div class="tiny muted" style="margin-top:14px">Demo PINs — Owner 1111 · Store 3333 · Mechanic 0001</div>` : ''}
  </div>`;
  root().onclick = (e) => {
    if (e.target.closest('[data-loginlang]')) { LANG = LANG === 'en' ? 'hi' : 'en'; localStorage.setItem('lang', LANG); return renderLogin(); }
    const r = e.target.closest('[data-role]');
    if (r) return renderRolePick(r.getAttribute('data-role'));
  };
}
// Step 2 — pick your name within that role (searchable for big rosters).
function renderRolePick(role) {
  _pinUser = null; _pin = '';
  const list = (S.cache.users || []).filter((u) => u.role === role).sort((a, b) => a.name.localeCompare(b.name));
  root().innerHTML = `<div class="login">
    <div class="row between" style="width:100%;max-width:420px">
      <button class="backbtn" data-loginback aria-label="Back">‹</button>
      <span class="muted small">${ROLE_META[role][1]}</span><span style="width:36px"></span></div>
    <div class="bigicon">${ROLE_META[role][0]}</div>
    <div style="font-weight:700">Select your name</div>
    ${list.length > 6 ? `<input id="login-search" placeholder="Search name…" autocomplete="off" style="max-width:420px;margin:10px 0">` : '<div class="spacer"></div>'}
    <div class="userpick" id="namelist"></div>
  </div>`;
  const renderList = (q) => {
    const f = q ? list.filter((u) => u.name.toLowerCase().includes(q)) : list;
    const el = $('#namelist'); if (!el) return;
    el.innerHTML = f.length ? f.map((u) => `<div class="u" data-login="${u.id}">
      <div style="font-size:20px">${ROLE_META[role][0]}</div>
      <div style="font-weight:700;font-size:14px">${esc(u.name)}</div></div>`).join('') : `<div class="muted small">No match</div>`;
  };
  renderList('');
  const s = $('#login-search'); if (s) { s.oninput = () => renderList(s.value.trim().toLowerCase()); s.focus(); }
  root().onclick = (e) => {
    if (e.target.closest('[data-loginback]')) return renderLogin();
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
      if (key === 'cancel') return _pinUser ? renderRolePick(_pinUser.role) : renderLogin();
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
  await seedIfEmpty(isDemoMode());   // production seeds roster+config only, never demo buses/jobs
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

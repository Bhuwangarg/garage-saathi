/* Garage Saathi — local-first data layer (IndexedDB).
 * Designed offline-first: everything is stored on the device and works with no
 * network. Each record carries an `updatedAt` so a future cloud-sync layer can
 * merge devices later (Phase 2) without changing any of the screens.
 */

const DB_NAME = 'garage-saathi';
const DB_VERSION = 6;   // v6 adds the audits store (onupgradeneeded creates any missing)

const STORES = {
  users: 'id',
  buses: 'id',
  parts: 'id',
  jobcards: 'id',
  ledger: 'id',      // stock movement ledger (in/out) — the anti-pilferage trail
  attendance: 'id',
  purchases: 'id',
  drivers: 'id',         // driver profiles, assigned to a bus
  incidents: 'id',       // driver performance data points (scratch, dent, accident…)
  driverreports: 'id',   // trip-end problems the driver reports → feed maintenance
  routes: 'id',          // a bus's route: ordered geofenced stops + scheduled go-times
  triplog: 'id',         // per-day actual arrival at each stop → punctuality + auto-learn
  fuel: 'id',            // fuel fills (litres + ₹ + odometer) → mileage (km/l) & fuel ₹/km
  gpsevents: 'id',       // auto safety/misuse events from live GPS (overspeed/harshbrake/night/idle)
  audits: 'id',          // physical stock counts → shrinkage reconciliation + store scorecard
  meta: 'key',
};

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      for (const [name, keyPath] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath });
        }
      }
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

function tx(store, mode = 'readonly') {
  return openDB().then((db) => db.transaction(store, mode).objectStore(store));
}

const DB = {
  async all(store) {
    const os = await tx(store);
    return new Promise((res, rej) => {
      const r = os.getAll();
      // Tombstones (_deleted) are kept on disk so the deletion can sync, but are
      // invisible to the app — callers see a clean, live-only list.
      r.onsuccess = () => res((r.result || []).filter((x) => x && !x._deleted));
      r.onerror = () => rej(r.error);
    });
  },
  async get(store, id) {
    const os = await tx(store);
    return new Promise((res, rej) => {
      const r = os.get(id);
      r.onsuccess = () => { const v = r.result; res(v && !v._deleted ? v : null); };
      r.onerror = () => rej(r.error);
    });
  },
  // Local write: stamps updatedAt and notifies the sync engine (outbox).
  async put(store, obj) {
    obj.updatedAt = Date.now();
    await this._write(store, obj);
    if (typeof DB.onChange === 'function') DB.onChange(store, obj.id);
    return obj;
  },
  // Remote write: applies a record from the server AS-IS (keeps its updatedAt,
  // does NOT re-notify the outbox) so sync never echoes a change back.
  async putRaw(store, obj) {
    await this._write(store, obj);
    return obj;
  },
  _write(store, obj) {
    return tx(store, 'readwrite').then((os) => new Promise((res, rej) => {
      const r = os.put(obj);
      r.onsuccess = () => res(obj);
      r.onerror = () => rej(r.error);
    }));
  },
  async del(store, id) {
    const os = await tx(store, 'readwrite');
    return new Promise((res, rej) => {
      const r = os.delete(id);
      r.onsuccess = () => res(true);
      r.onerror = () => rej(r.error);
    });
  },
  // Sync-safe delete (tombstone). Instead of dropping the row locally and hoping
  // the server forgets it too, we stamp a tombstone {_deleted:true, updatedAt}
  // and DIRTY it so the outbox pushes the deletion to every device. The tombstone
  // is filtered out of all()/get() so the UI treats it as gone. Use this anywhere
  // a delete must propagate (wrong bill, cancelled report, etc.).
  async softDel(store, id) {
    const cur = await this._rawGet(store, id);
    const obj = Object.assign({}, cur || { id }, { id, _deleted: true, updatedAt: Date.now() });
    await this._write(store, obj);
    if (typeof DB.onChange === 'function') DB.onChange(store, id);
    return obj;
  },
  // Raw get that DOES return tombstones (sync internals only).
  async _rawGet(store, id) {
    const os = await tx(store);
    return new Promise((res, rej) => {
      const r = os.get(id);
      r.onsuccess = () => res(r.result || null);
      r.onerror = () => rej(r.error);
    });
  },
  // Wipe every store — used by "Start fresh" to clear demo data so a real
  // garage can begin empty. Caller is responsible for re-seeding/reloading.
  async clearAll() {
    const db = await openDB();
    const names = Object.keys(STORES);
    await new Promise((res, rej) => {
      const t = db.transaction(names, 'readwrite');
      t.oncomplete = () => res(true);
      t.onerror = () => rej(t.error);
      for (const n of names) t.objectStore(n).clear();
    });
  },
};

// Small id helper. Crypto-based so two offline devices won't collide.
function uid(prefix = '') {
  const rnd = crypto.getRandomValues(new Uint32Array(2));
  return prefix + rnd[0].toString(36) + rnd[1].toString(36);
}

/* ----------------------------- Seed data ----------------------------------
 * A realistic slice of a Jaipur garage so the owner can click through every
 * flow on first open. Runs only once (guarded by a meta flag).
 */
// demo=true seeds the full demo dataset (local/dev). On production (demo=false)
// we seed ONLY the staff roster (so the login screen has names) + a default
// garage config — never demo buses/jobs/drivers. Stops test data on real devices.
async function seedIfEmpty(demo) {
  const seeded = await DB.get('meta', 'seeded');
  if (seeded) return;

  const now = Date.now();
  const day = 86400000;

  // No PINs here — credentials are validated server-side (hashed) and cached
  // per-device by app.js (seedCreds). The synced roster carries name/role only.
  const users = [
    { id: 'u-owner', name: 'Bhuwan (Owner)', role: 'owner' },
    { id: 'u-sup',   name: 'Ramesh (Supervisor)', role: 'supervisor' },
    { id: 'u-store', name: 'Suresh (Store)', role: 'store' },
    { id: 'u-m1',    name: 'Mukesh', role: 'mechanic' },
    { id: 'u-m2',    name: 'Imran',  role: 'mechanic' },
    { id: 'u-m3',    name: 'Vijay',  role: 'mechanic' },
    { id: 'u-d1',    name: 'Ramlal (Driver)', role: 'driver' },
  ];

  const buses = [
    { id: 'b1', regNo: 'RJ14 PA 1023', company: 'Pink City Travels', model: 'Tata Starbus', chassis: 'MAT4470', engine: 'ENG88231', odometer: 184320,
      serviceIntervalKm: 10000, lastServiceOdo: 178000,
      docs: [
        { type: 'Insurance', number: 'INS-9921', expiry: now + 40*day },
        { type: 'Fitness',   number: 'FIT-3320', expiry: now + 9*day },
        { type: 'Permit',    number: 'PMT-1180', expiry: now + 120*day },
        { type: 'PUC',       number: 'PUC-7741', expiry: now - 2*day },
      ], photos: [] },
    { id: 'b2', regNo: 'RJ14 PB 4567', company: 'Rajasthan Roadlinks', model: 'Ashok Leyland Viking', chassis: 'ALV2231', engine: 'ENG44120', odometer: 251000,
      serviceIntervalKm: 10000, lastServiceOdo: 242000,
      docs: [
        { type: 'Insurance', number: 'INS-7740', expiry: now + 200*day },
        { type: 'Fitness',   number: 'FIT-9981', expiry: now + 60*day },
        { type: 'PUC',       number: 'PUC-2210', expiry: now + 25*day },
      ], photos: [] },
    { id: 'b3', regNo: 'RJ45 CC 8890', company: 'Pink City Travels', model: 'Eicher Skyline', chassis: 'EIC5567', engine: 'ENG10093', odometer: 98700,
      serviceIntervalKm: 10000, lastServiceOdo: 88000,
      docs: [
        { type: 'Insurance', number: 'INS-3312', expiry: now + 5*day },
        { type: 'Fitness',   number: 'FIT-1102', expiry: now + 320*day },
      ], photos: [] },
  ];

  const parts = [
    { id: 'p1', name: 'Brake Pad Set (front)', partNo: 'BP-FR-22', category: 'Brakes', qty: 12, unit: 'set', reorderLevel: 4, unitCost: 1800 },
    { id: 'p2', name: 'Engine Oil 15W-40 (1L)', partNo: 'OIL-1540', category: 'Lubricants', qty: 60, unit: 'L', reorderLevel: 20, unitCost: 320 },
    { id: 'p3', name: 'Oil Filter', partNo: 'FLT-OIL-9', category: 'Filters', qty: 3, unit: 'pc', reorderLevel: 6, unitCost: 410 },
    { id: 'p4', name: 'Air Filter', partNo: 'FLT-AIR-3', category: 'Filters', qty: 9, unit: 'pc', reorderLevel: 4, unitCost: 650 },
    { id: 'p5', name: 'Clutch Plate', partNo: 'CLT-PL-7', category: 'Transmission', qty: 5, unit: 'pc', reorderLevel: 2, unitCost: 5200 },
    { id: 'p6', name: 'Wiper Blade', partNo: 'WPR-21', category: 'Body', qty: 18, unit: 'pc', reorderLevel: 6, unitCost: 240 },
    { id: 'p7', name: 'Tyre 10.00-20', partNo: 'TYR-1020', category: 'Tyres', qty: 2, unit: 'pc', reorderLevel: 4, unitCost: 21500 },
  ];

  const jobcards = [
    { id: 'j1', busId: 'b1', problem: 'Front brakes weak, noise while stopping', priority: 'high',
      status: 'verified', reportedBy: 'u-sup', assignedTo: 'u-m1',
      beforePhotos: [], afterPhotos: [], partsUsed: [{ partId: 'p1', qty: 1, cost: 1800 }],
      labourHours: 2.5, notes: 'Replaced front pad set, cleaned caliper.',
      externalVendor: '', externalCost: 0,
      createdAt: now - 6*day, closedAt: now - 5*day, verifiedBy: 'u-sup', verifiedAt: now - 5*day },
    { id: 'j2', busId: 'b2', problem: 'Engine service due (10000 km)', priority: 'medium',
      status: 'in-progress', reportedBy: 'u-sup', assignedTo: 'u-m2',
      beforePhotos: [], afterPhotos: [], partsUsed: [{ partId: 'p2', qty: 12, cost: 3840 }, { partId: 'p3', qty: 1, cost: 410 }],
      labourHours: 0, notes: '', externalVendor: '', externalCost: 0,
      createdAt: now - 1*day, closedAt: null, verifiedBy: null },
    { id: 'j3', busId: 'b3', problem: 'AC not cooling — sent to outside AC specialist', priority: 'medium',
      status: 'open', reportedBy: 'u-sup', assignedTo: 'u-m3',
      beforePhotos: [], afterPhotos: [], partsUsed: [],
      labourHours: 0, notes: 'Quoted by CoolAir Jaipur', externalVendor: 'CoolAir Jaipur', externalCost: 4500,
      createdAt: now - 3600000, closedAt: null, verifiedBy: null },
  ];

  const ledger = [
    { id: uid('l-'), partId: 'p1', type: 'out', qty: 1, jobId: 'j1', reason: 'Issued to job', by: 'u-store', at: now - 5*day },
    { id: uid('l-'), partId: 'p2', type: 'out', qty: 12, jobId: 'j2', reason: 'Issued to job', by: 'u-store', at: now - 1*day },
    { id: uid('l-'), partId: 'p3', type: 'out', qty: 1, jobId: 'j2', reason: 'Issued to job', by: 'u-store', at: now - 1*day },
  ];

  const attendance = [
    { id: uid('a-'), userId: 'u-m1', type: 'in', at: now - 5*3600000, lat: 26.9124, lng: 75.7873, selfie: '', late: false },
    { id: uid('a-'), userId: 'u-m2', type: 'in', at: now - 4.2*3600000, lat: 26.9124, lng: 75.7873, selfie: '', late: true },
  ];

  const purchases = [
    { id: uid('pur-'), supplier: 'Jaipur Auto Spares', billPhoto: '', amount: 28400, items: 'Brake pads x10, Oil filters x6', paymentStatus: 'pending', at: now - 8*day },
  ];

  // Drivers, each fixed to a bus (so reports & wear map to the same vehicle).
  const drivers = [
    { id: 'd1', name: 'Ramlal', phone: '98290 11111', license: 'RJ-DL-2210', busId: 'b1', userId: 'u-d1', tripsLogged: 142, joinedAt: now - 400*day, photo: '' },
    { id: 'd2', name: 'Shyam Lal', phone: '98290 22222', license: 'RJ-DL-3398', busId: 'b2', userId: null, tripsLogged: 96, joinedAt: now - 230*day, photo: '' },
    { id: 'd3', name: 'Geeta Devi', phone: '98290 33333', license: 'RJ-DL-7741', busId: 'b3', userId: null, tripsLogged: 61, joinedAt: now - 120*day, photo: '' },
  ];

  // Performance data points (penalty applied by type in app.js). Stable ids so
  // the boot migration in app.js can't create duplicates across devices.
  const incidents = [
    { id: 'inc-1', driverId: 'd1', busId: 'b1', type: 'scratch', note: 'Left rear panel scratch, parking', photo: '', cost: 0, at: now - 12*day, by: 'u-sup' },
    { id: 'inc-2', driverId: 'd2', busId: 'b2', type: 'dent', note: 'Front bumper dent', photo: '', cost: 2500, at: now - 20*day, by: 'u-sup' },
    { id: 'inc-3', driverId: 'd2', busId: 'b2', type: 'harsh-brake', note: 'Repeated harsh braking flagged', photo: '', cost: 0, at: now - 6*day, by: 'u-sup' },
    { id: 'inc-4', driverId: 'd3', busId: 'b3', type: 'accident', note: 'Minor side collision, gate pillar', photo: '', cost: 9000, at: now - 30*day, by: 'u-sup' },
    { id: 'inc-5', driverId: 'd3', busId: 'b3', type: 'scratch', note: 'Door scratch', photo: '', cost: 0, at: now - 4*day, by: 'u-sup' },
  ];

  // Trip-end problem reports from drivers → feed the maintenance team.
  const driverreports = [
    { id: 'dr-1', driverId: 'd1', busId: 'b1', category: 'Brakes', problem: 'Brakes feel weak at high speed, slight noise', at: now - 6*day, status: 'addressed', jobId: 'j1', resolvedAt: now - 5*day },
    { id: 'dr-2', driverId: 'd3', busId: 'b3', category: 'AC', problem: 'AC not cooling and a rattling noise from the rear', at: now - 2*day, status: 'open', jobId: null, resolvedAt: null },
    { id: 'dr-3', driverId: 'd2', busId: 'b2', category: 'Engine', problem: 'Engine feels low on power on inclines', at: now - 1*day, status: 'open', jobId: null, resolvedAt: null },
  ];

  for (const u of users) await DB.put('users', u);   // staff roster — bootstraps the login screen (always)
  if (demo) {                                          // demo operational data — local/dev only
    for (const b of buses) await DB.put('buses', b);
    for (const p of parts) await DB.put('parts', p);
    for (const j of jobcards) await DB.put('jobcards', j);
    for (const l of ledger) await DB.put('ledger', l);
    for (const a of attendance) await DB.put('attendance', a);
    for (const pu of purchases) await DB.put('purchases', pu);
    for (const dv of drivers) await DB.put('drivers', dv);
    for (const ic of incidents) await DB.put('incidents', ic);
    for (const dr of driverreports) await DB.put('driverreports', dr);
  }

  // Garage location (geofence centre for attendance). Default: central Jaipur.
  await DB.put('meta', { key: 'garage', lat: 26.9124, lng: 75.7873, radiusM: 200, name: 'Mahalaxmi Travels Garage, Jaipur', biz: 'Mahalaxmi Travels', labourRate: 250 });
  await DB.put('meta', { key: 'seeded', value: true });
}

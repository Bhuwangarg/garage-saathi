/* Garage Saathi — sync engine (Phase 2).
 *
 * Local-first: IndexedDB stays the source of truth so the app works fully
 * offline. This engine reconciles the device with a shared server:
 *   - PUSH: send locally-changed records (an "outbox" of store|id keys).
 *   - PULL: fetch records the server has seen since our last cursor (`rev`)
 *           and apply any that are newer than our local copy (last-write-wins
 *           by `updatedAt`).
 *
 * The wire protocol is deliberately tiny (two endpoints) so the dev Python
 * server can be swapped for Supabase / a hosted Node service unchanged:
 *   POST /push  { deviceId, records:[{store,id,data,updatedAt}] } -> { ok, maxRev }
 *   GET  /pull?since=<rev>&deviceId=..  -> { records:[{store,id,data,rev}], maxRev }
 */
const Sync = (function () {
  // Only real business data syncs — local-only meta (seed flag, garage config) stays put.
  const STORES = ['users', 'buses', 'parts', 'jobcards', 'ledger', 'attendance', 'purchases',
                  'drivers', 'incidents', 'driverreports', 'routes', 'triplog', 'fuel', 'gpsevents'];

  const ls = window.localStorage;
  // Default sync backend: a device's explicit setting always wins. Otherwise, on
  // a local/LAN host use the local dev server (:8766); on any public host (the
  // hosted PWA) default to the Render backend so it works with no per-device setup.
  const PROD_SYNC = 'https://garage-saathi-sync.onrender.com';
  const _isLocalHost = () => location.hostname === '' ||
    /^(localhost|127\.|0\.0\.0\.0|\[?::1\]?|192\.168\.|10\.|172\.1[6-9]\.|172\.2\d\.|172\.3[01]\.)/.test(location.hostname);
  const baseUrl = () => ls.getItem('syncUrl') ||
    (_isLocalHost() ? (location.protocol + '//' + location.hostname + ':8766') : PROD_SYNC);

  let deviceId = ls.getItem('deviceId');
  if (!deviceId) { deviceId = 'dev-' + Math.random().toString(36).slice(2, 9); ls.setItem('deviceId', deviceId); }

  let lastRev = parseInt(ls.getItem('lastRev') || '0', 10);
  let lastSyncAt = parseInt(ls.getItem('lastSyncAt') || '0', 10);
  let outbox = new Set(JSON.parse(ls.getItem('outbox') || '[]'));
  // Photos captured offline (no server URL yet): map of "store|id|field" -> dataUrl.
  // Re-uploaded when the network returns, then the record is patched to the URL.
  let photoQ = JSON.parse(ls.getItem('photoQueue') || '{}');
  // Poison quarantine: keys the server keeps rejecting (e.g. malformed record).
  // Skipped on push so one bad record can't wedge the whole outbox.
  let quarantine = JSON.parse(ls.getItem('quarantine') || '{}');
  let token = ls.getItem('token') || '';
  let status = 'init';            // init | syncing | synced | offline
  let busy = false, kickTimer = null, pollTimer = null;
  let cbStatus = null, cbApplied = null, cbConflict = null;

  const saveOutbox = () => ls.setItem('outbox', JSON.stringify([...outbox]));
  const savePhotoQ = () => ls.setItem('photoQueue', JSON.stringify(photoQ));
  const saveQuarantine = () => ls.setItem('quarantine', JSON.stringify(quarantine));
  const setStatus = (s) => { status = s; if (cbStatus) cbStatus(s); };
  const authHeaders = (extra) => Object.assign(
    {}, extra || {}, token ? { Authorization: 'Bearer ' + token } : {});

  // Authenticate against the server. Returns {user} on success, {offline:true}
  // if the server is unreachable, or null on wrong PIN.
  async function login(userId, pin) {
    try {
      const res = await fetch(baseUrl() + '/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, pin }),
      });
      if (res.status === 401) return null;       // wrong PIN (server says so)
      if (res.status === 429) {                  // locked out — too many attempts
        let j = {}; try { j = await res.json(); } catch (e) { /* ignore */ }
        return { locked: true, retryAfter: j.retryAfterSec || 60 };
      }
      if (!res.ok) throw new Error('login ' + res.status);
      const j = await res.json();
      token = j.token; ls.setItem('token', token);
      tick();
      return { user: j.user };
    } catch (e) {
      return { offline: true };                  // can't reach server → caller falls back
    }
  }
  function logout() { token = ''; ls.removeItem('token'); }

  // Owner/supervisor: create a staff account on the server.
  async function addStaff({ name, role, pin }) {
    const res = await fetch(baseUrl() + '/auth/users', {
      method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ name, role, pin }),
    });
    if (!res.ok) throw new Error('addStaff ' + res.status);
    return (await res.json()).user;
  }

  // AI advisor via the server proxy (key stays server-side). Returns
  // {text} on success, {configured:true,error} if the server's AI errored,
  // or {configured:false} when the server has no AI key / is unreachable
  // (caller then decides whether to use a local-key dev fallback).
  async function ai({ question, context, biz }) {
    try {
      const res = await fetch(baseUrl() + '/ai', {
        method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ question, context, biz }),
      });
      if (res.status === 501 || res.status === 401) return { configured: false };  // no server key / not authed → let caller fall back
      if (!res.ok) return { configured: true, error: 'AI server error ' + res.status };
      return { text: (await res.json()).text || '' };
    } catch (e) { return { configured: false }; }
  }

  // Pull the fleet AirFi has pushed telemetry for — list of {reg, odometer, lastPing, lat, lng, speedKph, ignition}.
  async function fleet() {
    try {
      const res = await fetch(baseUrl() + '/gps/fleet', { headers: authHeaders() });
      if (!res.ok) return [];
      return (await res.json()).buses || [];
    } catch (e) { return []; }
  }
  // Latest position for one registration (used as a fallback when /gps/fleet
  // doesn't carry coordinates yet). Returns the telemetry record or null.
  async function latest(reg) {
    try {
      const res = await fetch(baseUrl() + '/gps/latest?reg=' + encodeURIComponent(reg), { headers: authHeaders() });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) { return null; }
  }

  // Change a user's PIN on the server (self, or owner resetting staff).
  async function setPin(userId, pin) {
    const res = await fetch(baseUrl() + '/auth/setpin', {
      method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ userId, pin }),
    });
    if (!res.ok) throw new Error('setPin ' + res.status);
    return true;
  }

  // Upload a captured photo to object storage; returns a URL, or null on failure
  // (caller keeps the inline data URL as an offline fallback).
  async function uploadPhoto(dataUrl) {
    try {
      const res = await fetch(baseUrl() + '/upload', {
        method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ data: dataUrl }),
      });
      if (!res.ok) return null;
      return (await res.json()).url || null;
    } catch (e) { return null; }
  }

  // Called by db.js on every LOCAL write.
  function markDirty(store, id) {
    if (!STORES.includes(store)) return;
    outbox.add(store + '|' + id);
    saveOutbox();
    kick();
  }
  function kick() { clearTimeout(kickTimer); kickTimer = setTimeout(tick, 600); }

  async function tick() {
    if (busy) return;
    busy = true;
    try {
      await push();
      await pull();
      lastSyncAt = Date.now(); ls.setItem('lastSyncAt', String(lastSyncAt));
      setStatus('synced');
    } catch (e) {
      setStatus('offline');
    } finally {
      busy = false;
    }
  }

  // Build the wire record for an outbox key. Reads tombstones too (so deletes
  // sync) via the raw getter. Returns null if the row truly vanished.
  async function recordForKey(key) {
    const i = key.indexOf('|');
    const store = key.slice(0, i), id = key.slice(i + 1);
    const rec = (DB._rawGet ? await DB._rawGet(store, id) : await DB.get(store, id));
    if (!rec) return null;
    return { store, id, data: rec, updatedAt: rec.updatedAt || 0 };
  }

  async function push() {
    await flushPhotos();                       // get offline photos a real URL first
    if (!outbox.size) return;
    const keys = [...outbox].filter((k) => !quarantine[k]);
    if (!keys.length) return;
    // Push one record at a time so a single poison record can't 4xx the whole
    // batch. A 4xx on a record means the SERVER refuses it → quarantine it and
    // move on (it stops wedging the outbox). A 5xx/network error is transient →
    // bubble up so we retry the rest next tick.
    setStatus('syncing');
    for (const key of keys) {
      const rec = await recordForKey(key);
      if (!rec) { outbox.delete(key); saveOutbox(); continue; }
      let res;
      try {
        res = await fetch(baseUrl() + '/push', {
          method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ deviceId, records: [rec] }),
        });
      } catch (e) { throw e; }                  // offline → retry later, keep key
      if (res.ok) { outbox.delete(key); saveOutbox(); continue; }
      if (res.status >= 400 && res.status < 500 && res.status !== 401 && res.status !== 429) {
        // Server rejects this record — quarantine so it never blocks the rest.
        quarantine[key] = { at: Date.now(), status: res.status };
        saveQuarantine();
        outbox.delete(key); saveOutbox();
        continue;
      }
      throw new Error('push ' + res.status);    // auth/lock/5xx → stop, retry later
    }
  }

  // ---- Offline photo queue --------------------------------------------------
  // Feature code calls Sync.queuePhoto(store,id,field,dataUrl) when an upload
  // fails (offline). We store the data URL inline on the record now, remember the
  // key, and re-upload + patch the record to a server URL once back online.
  function queuePhoto(store, id, field, dataUrl) {
    if (!dataUrl) return;
    photoQ[store + '|' + id + '|' + field] = dataUrl;
    savePhotoQ();
    kick();
  }
  async function flushPhotos() {
    const keys = Object.keys(photoQ);
    if (!keys.length || !token) return;
    for (const qk of keys) {
      const parts = qk.split('|');
      const store = parts[0], id = parts[1], field = parts.slice(2).join('|');
      const dataUrl = photoQ[qk];
      if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) { delete photoQ[qk]; savePhotoQ(); continue; }
      const url = await uploadPhoto(dataUrl);
      if (!url) return;                          // still offline → try again later
      // Patch the record: swap the inline data URL for the hosted URL. Supports a
      // plain string field or a photos[] array containing the data URL.
      const rec = (DB._rawGet ? await DB._rawGet(store, id) : await DB.get(store, id));
      if (rec) {
        if (Array.isArray(rec[field])) {
          rec[field] = rec[field].map((p) => (p === dataUrl ? url : p));
        } else if (rec[field] === dataUrl || rec[field] == null) {
          rec[field] = url;
        }
        await DB.put(store, rec);                // dirties → pushes the URL out
      }
      delete photoQ[qk]; savePhotoQ();
    }
  }

  async function pull() {
    setStatus('syncing');
    const res = await fetch(baseUrl() + '/pull?since=' + lastRev + '&deviceId=' + encodeURIComponent(deviceId),
      { headers: authHeaders() });
    if (!res.ok) throw new Error('pull ' + res.status);
    const j = await res.json();
    let applied = 0; let conflicts = 0;
    for (const r of (j.records || [])) {
      if (!STORES.includes(r.store) || !r.data) continue;
      const key = r.store + '|' + r.id;
      const local = (DB._rawGet ? await DB._rawGet(r.store, r.id) : await DB.get(r.store, r.id));
      if (!local || (r.data.updatedAt || 0) > (local.updatedAt || 0)) {
        // Concurrent-overwrite signal: a server copy newer than a LOCAL edit we
        // still owe the server (in the outbox). Last-write-wins still applies
        // (server is newer), but the local editor must be told their change was
        // superseded so they don't trust a stale screen.
        if (outbox.has(key)) {
          conflicts++;
          outbox.delete(key); saveOutbox();   // server already has a newer copy
        }
        await DB.putRaw(r.store, r.data);   // keep server timestamp, no echo
        applied++;
      }
    }
    if (typeof j.maxRev === 'number') { lastRev = j.maxRev; ls.setItem('lastRev', String(lastRev)); }
    if (applied && cbApplied) await cbApplied(applied);
    if (conflicts && cbConflict) await cbConflict(conflicts);
  }

  function start(opts = {}) {
    cbStatus = opts.onStatus; cbApplied = opts.onApplied; cbConflict = opts.onConflict;
    DB.onChange = markDirty;                 // wire the outbox to local writes
    window.addEventListener('online', tick);
    clearInterval(pollTimer);
    pollTimer = setInterval(tick, 4000);     // background reconcile
    tick();
  }

  function setUrl(u) { ls.setItem('syncUrl', u); tick(); }
  function reset() { ls.removeItem('lastRev'); lastRev = 0; tick(); }
  const info = () => ({ deviceId, lastRev, pending: outbox.size, url: baseUrl(), status, authed: !!token, lastSyncAt,
                        photosPending: Object.keys(photoQ).length, quarantined: Object.keys(quarantine).length });

  // Sync-safe delete used by feature code: tombstone + dirty so the deletion
  // propagates to every device (see DB.softDel).
  function remove(store, id) { return DB.softDel(store, id).then(() => kick()); }
  // Drain the quarantine so retried/fixed records get another chance.
  function clearQuarantine() { quarantine = {}; saveQuarantine(); kick(); }

  // Web-push: register this device's subscription, and fire a server test alert.
  async function subscribePush(subscription, role) {
    try {
      const res = await fetch(baseUrl() + '/push/subscribe', {
        method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ subscription, role }),
      });
      return res.ok;
    } catch (e) { return false; }
  }
  async function pushTest() {
    try {
      const res = await fetch(baseUrl() + '/push/test', { method: 'POST', headers: authHeaders() });
      return res.ok ? await res.json() : null;
    } catch (e) { return null; }
  }

  return { start, tick, kick, setUrl, reset, info, login, logout, addStaff, setPin, ai, fleet, latest, uploadPhoto,
           queuePhoto, remove, clearQuarantine, subscribePush, pushTest,
           get status() { return status; } };
})();

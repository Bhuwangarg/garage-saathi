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
                  'drivers', 'incidents', 'driverreports'];

  const ls = window.localStorage;
  const baseUrl = () => ls.getItem('syncUrl') ||
    (location.protocol + '//' + location.hostname + ':8766');

  let deviceId = ls.getItem('deviceId');
  if (!deviceId) { deviceId = 'dev-' + Math.random().toString(36).slice(2, 9); ls.setItem('deviceId', deviceId); }

  let lastRev = parseInt(ls.getItem('lastRev') || '0', 10);
  let outbox = new Set(JSON.parse(ls.getItem('outbox') || '[]'));
  let token = ls.getItem('token') || '';
  let status = 'init';            // init | syncing | synced | offline
  let busy = false, kickTimer = null, pollTimer = null;
  let cbStatus = null, cbApplied = null;

  const saveOutbox = () => ls.setItem('outbox', JSON.stringify([...outbox]));
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
      setStatus('synced');
    } catch (e) {
      setStatus('offline');
    } finally {
      busy = false;
    }
  }

  async function push() {
    if (!outbox.size) return;
    const keys = [...outbox];
    const records = [];
    for (const key of keys) {
      const i = key.indexOf('|');
      const store = key.slice(0, i), id = key.slice(i + 1);
      const rec = await DB.get(store, id);
      if (rec) records.push({ store, id, data: rec, updatedAt: rec.updatedAt || 0 });
    }
    if (!records.length) { outbox.clear(); saveOutbox(); return; }
    setStatus('syncing');
    const res = await fetch(baseUrl() + '/push', {
      method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ deviceId, records }),
    });
    if (!res.ok) throw new Error('push ' + res.status);
    keys.forEach((k) => outbox.delete(k));   // only clear what we actually sent
    saveOutbox();
  }

  async function pull() {
    setStatus('syncing');
    const res = await fetch(baseUrl() + '/pull?since=' + lastRev + '&deviceId=' + encodeURIComponent(deviceId),
      { headers: authHeaders() });
    if (!res.ok) throw new Error('pull ' + res.status);
    const j = await res.json();
    let applied = 0;
    for (const r of (j.records || [])) {
      if (!STORES.includes(r.store) || !r.data) continue;
      const local = await DB.get(r.store, r.id);
      if (!local || (r.data.updatedAt || 0) > (local.updatedAt || 0)) {
        await DB.putRaw(r.store, r.data);   // keep server timestamp, no echo
        applied++;
      }
    }
    if (typeof j.maxRev === 'number') { lastRev = j.maxRev; ls.setItem('lastRev', String(lastRev)); }
    if (applied && cbApplied) await cbApplied(applied);
  }

  function start(opts = {}) {
    cbStatus = opts.onStatus; cbApplied = opts.onApplied;
    DB.onChange = markDirty;                 // wire the outbox to local writes
    window.addEventListener('online', tick);
    clearInterval(pollTimer);
    pollTimer = setInterval(tick, 4000);     // background reconcile
    tick();
  }

  function setUrl(u) { ls.setItem('syncUrl', u); tick(); }
  function reset() { ls.removeItem('lastRev'); lastRev = 0; tick(); }
  const info = () => ({ deviceId, lastRev, pending: outbox.size, url: baseUrl(), status, authed: !!token });

  return { start, tick, kick, setUrl, reset, info, login, logout, addStaff, uploadPhoto,
           get status() { return status; } };
})();

/* Garage Saathi — Gate Check: the departure checklist.
 *
 * Before a bus leaves, its driver proves who they are (live selfie + GPS) and
 * goes through a short list. Each item exists because a redBus complaint
 * category exists: AC, blankets, a dirty bus, dead charging points. Photo items
 * are the ones passengers dispute, so the photo is the evidence later.
 *
 * Outcome:
 *   every item passed           → the driver releases the bus
 *   any item failed (with note) → the office decides: go (with a reason) or hold
 *
 * The server mirrors these rules (GATE_ITEMS / _gate_outcome in sync_server.py);
 * test_gatecheck.py fails if the two item lists drift apart.
 *
 * Pure functions only, so they run in the app and under node for the tests.
 */
(function (root) {
  'use strict';

  // Keys, never words: labels come from i18n (gi_<key>), so the language toggle
  // re-renders them. `photo` items need a photo to pass.
  const GATE_ITEMS = [
    { k: 'ac', photo: true },        // AC cooling
    { k: 'blankets', photo: true },  // blanket + pillow on every berth
    { k: 'cabin', photo: true },     // berths, floor and washroom clean
    { k: 'charging', photo: false }, // charging points work
    { k: 'water', photo: false },    // water bottles loaded
    { k: 'tyres', photo: false },    // tyres and lights
    { k: 'fuel', photo: false },     // enough fuel for the first leg
    { k: 'papers', photo: false },   // RC, permit, insurance, PUC on board
    { k: 'safety', photo: false },   // first-aid box, extinguisher, emergency hammer
    { k: 'uniform', photo: false },  // crew in uniform
  ];

  // Statuses: open (driver filling) → released | awaiting (office) → approved | held.
  // A held check goes back to open when the driver re-checks.
  const DONE = ['released', 'approved'];

  const itemDone = (spec, it) => !!it && ((it.ok === true && (!spec.photo || !!it.photo))
    || (it.ok === false && !!String(it.note || '').trim()));

  function outcome(items) {
    const missing = [], failed = [];
    for (const spec of GATE_ITEMS) {
      const it = (items || {})[spec.k];
      if (!itemDone(spec, it)) missing.push(spec.k);
      else if (it.ok === false) failed.push(spec.k);
    }
    return { complete: !missing.length, missing, failed, verdict: missing.length ? 'incomplete' : failed.length ? 'fail' : 'pass' };
  }

  // What the driver's hold does: 'released', 'awaiting', or null (not ready).
  function releaseStatus(check) {
    if (!check || check.status !== 'open') return null;
    const o = outcome(check.items);
    return o.verdict === 'pass' ? 'released' : o.verdict === 'fail' ? 'awaiting' : null;
  }

  // Local calendar day of a timestamp, as YYYY-MM-DD.
  function dayKey(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // The check for this bus's current departure: the newest one started in the
  // last 20 hours. A night bus started at 20:00 is still "today's" at 02:00.
  const WINDOW_MS = 20 * 3600 * 1000;
  function currentCheck(checks, busId, now) {
    return (checks || []).filter((c) => c && !c._deleted && c.busId === busId && now - (c.startedAt || 0) < WINDOW_MS)
      .sort((a, b) => b.startedAt - a.startedAt)[0] || null;
  }

  const api = { GATE_ITEMS, DONE, itemDone, outcome, releaseStatus, dayKey, currentCheck, WINDOW_MS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Gate = api;
})(typeof window !== 'undefined' ? window : this);

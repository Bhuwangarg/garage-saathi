/* Garage Saathi v2 — screen 13, the Gate round.
 *
 * Twenty buses an evening leave the yard, and before each one goes a supervisor
 * walks it: ten items, three of them photographed, and a photograph of the
 * driver who is taking it out. The record this screen writes is the only
 * evidence afterwards that the bus was checked and who was at the wheel, which
 * is why almost every rule below is the server's rule said again in the client
 * rather than a preference of the screen's.
 *
 *   Gate.render(model [, ui])   the board, or the check panel -> string
 *   Gate.model(model [, ui])    the view model the render reads -> object
 *   Gate.start(busId, driverId, selfie [, opts])   creates the check, ONCE
 *   Gate.payload(bus, crew, selfie [, opts])       the create record, pure
 *   Gate.outcome(items)         'pass' | 'fail' | 'incomplete', plus the counts
 *   Gate.currentCheck(checks, busId, now)   the check to resume, never a second
 *   Gate.mount() / Gate.unmount()
 *
 * SIX THINGS HERE THAT ARE NOT PREFERENCES
 *
 * 1. THE RECORD IS CREATED ONCE, WITH THE DRIVER ALREADY NAMED. `GATE_FIXED` in
 *    sync_server.py holds busId, regNo, driverId, driverName, userId, startedAt,
 *    date, selfie, faceVerified, lat, lng and onDutyBoard, and the guard refuses
 *    any later change to any of them: "who did the check, when and the selfie
 *    cannot be changed". So the driver is picked and photographed BEFORE the
 *    record exists — step 1 of the panel — and there is no amend path, because
 *    an amend path is a push the server will refuse.
 *
 * 2. `userId` IS WHO RAN THE CHECK; `driverId` IS WHO IS TAKING THE BUS OUT.
 *    The server stamps `userId` from the token and `driverName` from the crew
 *    record, so this screen sends neither as truth. In this flow the two people
 *    are different, and that separation is the whole reason the photograph still
 *    means anything: a supervisor photographing somebody else proves who was at
 *    the gate, which is what the owner kept (DECISIONS.md section 12).
 *
 * 3. `faceVerified` IS WRITTEN false AND NO COPY HERE CLAIMS VERIFICATION.
 *    v1's driver flow matched a live face against an enrolment. A supervisor
 *    photographing somebody else verifies nothing, so writing true would put a
 *    false claim into a record the owner reads as evidence. The label is
 *    "Photo of the driver", never "verify face".
 *
 * 4. NO DECIDE CONTROL EXISTS ON THIS SCREEN, FOR ANYBODY. The go/hold decision
 *    is an Attention row for `gateDecide`, where the decider already looks, and
 *    the guard refuses it to the person who ran the check — "you ran this check
 *    — somebody else decides go or hold". A control nobody here may use is
 *    ABSENT, not disabled, and in its place the runner is told who decides. The
 *    same applies to filling: only the supervisor who STARTED a check may carry
 *    on with it (the guard's manager_fill reads old.userId === actor.id), so a
 *    check somebody else started is read-only and names them.
 *
 * 5. NO IMAGE BYTES EVER GO INTO A RECORD. v1 falls back to the `data:` URL
 *    when an upload fails (app.js:9818, LIVE-ISSUES 9) and `gatechecks` is in no
 *    server send window, so every one of those travels to every entitled device
 *    for ever. Worse here than in v1: `selfie` is in GATE_FIXED, so the inline
 *    bytes could never be patched to a URL afterwards even once the signal came
 *    back — Sync.flushPhotos' patch would be refused. So the upload happens
 *    BEFORE the create, and a failed upload means no check is started and the
 *    screen says why, with a Retry. The cost is named in the report: offline,
 *    this screen cannot start a check or PASS one of the three photo items. It
 *    can record a problem on any of the ten, and everything else is a local
 *    write that works offline as before.
 *
 * 6. THE 1.5 s HOLD IS THE CONTROL, NOT DECORATION. A bus must not be released
 *    by a palm brushing a screen in the dark ([E] 8a8cde5). Foundation section
 *    5.8 says a frequently repeated action does not animate, and twenty holds an
 *    evening is frequently repeated — the bar survives that rule because it is
 *    not motion laid over the action, it is the action's own readout, and
 *    removing it would not make the release one millisecond faster. If the price
 *    is wrong what gives is the 1.5 seconds, and that is the owner's.
 *
 * The ten item keys are the server's GATE_ITEMS and v1's gate.js, in that order,
 * and `ac`, `blankets` and `cabin` need a photo to pass. test_v2_gate.js reads
 * the server's list out of sync_server.py so the two cannot drift apart.
 */
(function (root) {
  'use strict';

  const ID = 'gate';
  const STORE = 'gatechecks';
  const MARK = 20;                 // a state mark beside a word, matching the nav's
  const HOLD_MS = 1500;            // the owner's number (DECISIONS.md section 12)
  const BOARD_CAP = 200;           // this document's cap, not the foundation's
  const WINDOW_MS = 20 * 3600000;  // a 20:00 check is still tonight's at 02:00

  /* IST as a fixed offset, the arithmetic v2/night.js and sync_server.py's
   * _ist_day both do. It has to be the same one: the board pairs a check's
   * `date` against tonight's list, and a device left on another timezone would
   * otherwise file a check under a night the office does not recognise. */
  const IST_MS = 19800000;

  /* ---------- neighbours, resolved at CALL time --------------------------- */
  /* Never captured at load — the idiom of v2/night.js's db() and
   * v2/router.js's caps(), and what keeps one mistake in index.html's order
   * recoverable instead of fatal. */
  function caps() { return (root && root.Caps) || null; }
  function router() { return (root && root.Router) || null; }
  function shell() { return (root && root.Shell) || null; }
  function cache() { return (root && root.Cache) || null; }
  function night() { return (root && root.Night) || null; }
  function sync() { return (root && root.Sync) || null; }
  function db() { return (root && root.DB) || null; }
  function state() { return (root && root.S) || null; }
  function doc() { return (root && root.document) || null; }
  function V() { return (root && root.V2) || null; }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function draw(name, size) {
    return typeof root.icon === 'function' ? root.icon(name, { size: size || MARK }) : '';
  }

  /* ---------- the words -------------------------------------------------- */

  /* Every fixed word this screen draws, in one table, so the Hindi parity scan
   * can see them and a Hindi reader is never shown an English literal from
   * here. The five ids screens-work.md section 6.3 names by hand —
   * gatePass, gateProblem, gateHoldRelease, gatePhotoDriver, gateSendDecision —
   * are spelled exactly as it spells them: they are on the owner's first
   * sitting, not the last, because they are the controls a Hindi-reading
   * supervisor presses at the moment that matters. Every `hi` is empty and
   * therefore PENDING, counted and printed by test_v2_words.js. */
  const WORDS = {
    /* the board */
    gateCheckedOf: { en: '{0} of {1} checked out of the gate', hi: '' },
    gateAllChecked: { en: 'Every bus tonight left the gate checked', hi: '' },
    gateNoneTonight: { en: 'No buses run tonight', hi: '' },
    gateNoneTonightHint: { en: 'Nothing leaves the gate tonight.', hi: '' },
    gateNoList: { en: 'This count cannot reach zero', hi: '' },
    gateNoListHint: { en: 'The app does not know which buses run tonight. Ask the office.', hi: '' },
    gateShownOf: { en: '{0} of {1} shown.', hi: '' },
    gateStale: { en: 'This may be out of date.', hi: '' },
    gateLoadFailed: { en: 'Could not load the gate round', hi: '' },

    /* the six gate-row states, each a mark AND a word */
    gateNotYet: { en: 'Not checked out yet', hi: '' },
    gateNotYetSub: { en: 'Tap to run the ten items', hi: '' },
    gateNotHere: { en: 'Not checked on this phone yet', hi: '' },
    gateStarted: { en: 'Check started {0}', hi: '' },
    gateStartedSub: { en: '{0} of 10 answered. Tap to carry on.', hi: '' },
    gateWaiting: { en: 'Waiting for a decision', hi: '' },
    gateWaitingSub: { en: 'Sent {0}', hi: '' },
    gateWaitingPanel: { en: 'Sent at {0}. The owner or a supervisor decides go or hold.', hi: '' },
    gateReleased: { en: 'Released {0}', hi: '' },
    gateReleasedSub: { en: 'All ten passed', hi: '' },
    gateApproved: { en: 'Allowed out {0}', hi: '' },
    gateApprovedSub: { en: 'The owner said go', hi: '' },
    gateHeld: { en: 'Held {0}', hi: '' },
    gateHeldSub: { en: 'The owner said hold', hi: '' },

    /* step 1 — the driver, named once, before anything is written */
    gateWhoTakes: { en: 'Who is taking it out', hi: '' },
    gateDriverN: { en: 'Driver {0}', hi: '' },
    gateSomebodyElse: { en: 'Somebody else', hi: '' },
    gatePickDriver: { en: 'Who is taking this bus out?', hi: '' },
    gatePhotoDriver: { en: 'Photo of the driver', hi: '' },
    gateTakeAgain: { en: 'Take it again', hi: '' },
    gateStartCheck: { en: 'Start the check', hi: '' },
    gatePhotoFirst: { en: 'Photograph the driver first.', hi: '' },
    gateNoCrew: { en: 'No driver is crewed to this bus', hi: '' },
    gateNoCrewHint: { en: 'Put somebody on a driver seat on the duty board first.', hi: '' },
    gateUploadFailed: { en: 'The photo could not be sent', hi: '' },
    gateUploadFailedHint: { en: 'A check cannot start without the driver photo on the server. Try again when there is a signal.', hi: '' },

    /* the ten items */
    gateAnswered: { en: '{0} of 10 answered', hi: '' },
    gateProblemsN: { en: { one: '{n} problem', other: '{n} problems' }, hi: { one: '', other: '' } },
    gatePass: { en: 'Pass', hi: '' },
    gateProblem: { en: 'Problem', hi: '' },
    gatePhotoNeeded: { en: 'A photo is needed to pass this one.', hi: '' },
    gateWhatWrong: { en: 'What is wrong?', hi: '' },
    gateItemPhotoFailed: { en: 'The photo could not be sent. Try again when there is a signal.', hi: '' },
    gateFailedBefore: { en: 'This failed earlier on this check.', hi: '' },
    gateItemAc: { en: 'AC', hi: '' },
    gateWhatAc: { en: 'Cooling, with a photo of the cabin', hi: '' },
    gateItemBlankets: { en: 'Blankets', hi: '' },
    gateWhatBlankets: { en: 'Clean, counted, and a photo of the rack', hi: '' },
    gateItemCabin: { en: 'Cabin', hi: '' },
    gateWhatCabin: { en: 'Berths, floor and washroom clean, with a photo', hi: '' },
    gateItemCharging: { en: 'Charging points', hi: '' },
    gateWhatCharging: { en: 'Every point works', hi: '' },
    gateItemWater: { en: 'Water', hi: '' },
    gateWhatWater: { en: 'Bottles loaded for every berth', hi: '' },
    gateItemTyres: { en: 'Tyres and lights', hi: '' },
    gateWhatTyres: { en: 'Tread, pressure, and every lamp', hi: '' },
    gateItemFuel: { en: 'Fuel', hi: '' },
    gateWhatFuel: { en: 'Enough for the first leg', hi: '' },
    gateItemPapers: { en: 'Papers', hi: '' },
    gateWhatPapers: { en: 'Permit, insurance and pollution papers on board', hi: '' },
    gateItemSafety: { en: 'Safety kit', hi: '' },
    gateWhatSafety: { en: 'First-aid box, extinguisher, emergency hammer', hi: '' },
    gateItemUniform: { en: 'Uniform', hi: '' },
    gateWhatUniform: { en: 'Crew in uniform', hi: '' },

    /* the two endings, and what the runner sees instead of a decision */
    gateHoldRelease: { en: 'Hold to release this bus', hi: '' },
    gateSendDecision: { en: 'Send for a decision', hi: '' },
    gateReleasing: { en: 'Releasing...', hi: '' },
    gateSendingDecision: { en: 'Sending...', hi: '' },
    gateSaving: { en: 'Saving...', hi: '' },
    gateReleasedToast: { en: '{0} released', hi: '' },
    gateNotReleased: { en: 'Not released. The check is saved and still open.', hi: '' },
    gateNotSaved: { en: 'Not saved. That answer was not recorded.', hi: '' },
    gateYouRanIt: { en: 'You ran this check, so somebody else decides go or hold.', hi: '' },
    gateStartedBy: { en: 'Started by {0} at {1}.', hi: '' },
    gateReadOnly: { en: 'Only the person who started a check can fill it in.', hi: '' },
    gateBack: { en: 'Back to the gate round', hi: '' },
    gateHeldReason: { en: 'Held at {0} — {1}, reason recorded by the office.', hi: '' },
    gateApprovedReason: { en: 'Allowed out at {0} — {1}, reason recorded by the office.', hi: '' },
    gateNoAccess: { en: 'The gate round is not open to you', hi: '' },
    gateNoAccessHint: { en: 'A supervisor or the owner runs the departure check.', hi: '' },
  };

  /* W.register throws on an id registered twice, which is right, but a thrown
   * word at load time is a blank app. Registering is therefore guarded and the
   * English below stands in for a word the table never got — the same shape as
   * ui/photos.js's say(). */
  const local = {};
  (function registerWords() {
    let k;
    for (k in WORDS) if (Object.prototype.hasOwnProperty.call(WORDS, k)) local[k] = WORDS[k];
    if (root.W && typeof root.W.register === 'function') {
      try { root.W.register(WORDS); } catch (e) { /* already registered: the table stands */ }
    }
  })();

  function say(id, n) {
    if (typeof root.w === 'function') {
      try {
        const t = root.w(id, n);
        if (t != null && String(t) !== '') return t;
      } catch (e) { /* fall through to the English beside the id */ }
    }
    const e = local[id];
    if (!e) return '';
    if (typeof e.en === 'string') return e.en;
    const form = (n === 1 ? e.en.one : e.en.other) || e.en.other || e.en.one || '';
    return String(form).replace(/\{n\}/g, String(n));
  }

  function fill(id, a, b) {
    return say(id).replace('{0}', a == null ? '' : String(a)).replace('{1}', b == null ? '' : String(b));
  }

  /* ---------- the ten items, keyed exactly as the record keys them -------- */

  const GATE_ITEMS = [
    { k: 'ac', photo: true, name: 'gateItemAc', what: 'gateWhatAc' },
    { k: 'blankets', photo: true, name: 'gateItemBlankets', what: 'gateWhatBlankets' },
    { k: 'cabin', photo: true, name: 'gateItemCabin', what: 'gateWhatCabin' },
    { k: 'charging', photo: false, name: 'gateItemCharging', what: 'gateWhatCharging' },
    { k: 'water', photo: false, name: 'gateItemWater', what: 'gateWhatWater' },
    { k: 'tyres', photo: false, name: 'gateItemTyres', what: 'gateWhatTyres' },
    { k: 'fuel', photo: false, name: 'gateItemFuel', what: 'gateWhatFuel' },
    { k: 'papers', photo: false, name: 'gateItemPapers', what: 'gateWhatPapers' },
    { k: 'safety', photo: false, name: 'gateItemSafety', what: 'gateWhatSafety' },
    { k: 'uniform', photo: false, name: 'gateItemUniform', what: 'gateWhatUniform' },
  ];

  /* 'pass', 'fail' or 'incomplete', and the two counts the sticky header reads.
   * The same rule as sync_server.py's _gate_outcome, said again here so a
   * control the server would refuse is never drawn: an item answered `true`
   * without the photo it needs is NOT answered, and a `false` without a note is
   * not either. All ten must be present or the outcome is incomplete. */
  function outcome(items) {
    const got = (items && typeof items === 'object') ? items : {};
    const missing = [], failed = [];
    let answered = 0, i, spec, it;
    for (i = 0; i < GATE_ITEMS.length; i++) {
      spec = GATE_ITEMS[i];
      it = got[spec.k];
      if (!it || typeof it !== 'object') { missing.push(spec.k); continue; }
      if (it.ok === true) {
        if (spec.photo && !it.photo) { missing.push(spec.k); continue; }
        answered++;
      } else if (it.ok === false) {
        if (!String(it.note == null ? '' : it.note).trim()) { missing.push(spec.k); continue; }
        answered++;
        failed.push(spec.k);
      } else {
        missing.push(spec.k);
      }
    }
    return {
      verdict: missing.length ? 'incomplete' : (failed.length ? 'fail' : 'pass'),
      answered: answered, missing: missing, failed: failed,
    };
  }

  /* ---------- times and days -------------------------------------------- */

  function dayKey(ms) {
    const d = new Date((typeof ms === 'number' ? ms : Date.now()) + IST_MS);
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0')
      + '-' + String(d.getUTCDate()).padStart(2, '0');
  }

  /* 24-hour, built by hand rather than through toLocaleTimeString: the office
   * clock is IST whatever the device is set to, and a locale string would also
   * put an English "PM" on a Hindi screen from outside the word table. */
  function hhmm(ms) {
    if (typeof ms !== 'number' || !isFinite(ms)) return '';
    const d = new Date(ms + IST_MS);
    return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
  }

  function clock() {
    const s = sync();
    return (s && typeof s.now === 'function') ? s.now() : Date.now();
  }

  /* ---------- reading the device's own copy ------------------------------ */

  function rows(m, name) {
    const c = (m && m.cache) || (state() && state().cache) || {};
    const arr = c[name];
    return (arr && typeof arr.length === 'number') ? arr : null;
  }

  function live(arr) {
    const out = [];
    let i;
    for (i = 0; i < (arr || []).length; i++) if (arr[i] && !arr[i]._deleted) out.push(arr[i]);
    return out;
  }

  /* The check to carry on with for this bus, in ANY status, and never a second
   * one. Two supervisors on the same bus resume the same record — `failedBefore`
   * and `pastDecisions` only accumulate across writes if there is one record to
   * accumulate on. Matched on tonight's `date` OR a 20-hour window, because a
   * check started at 20:00 is still this departure's at 02:00. */
  function currentCheck(checks, busId, now) {
    const at = typeof now === 'number' ? now : Date.now();
    const today = dayKey(at);
    const mine = live(checks).filter(function (c) {
      if (String(c.busId || '') !== String(busId)) return false;
      const started = typeof c.startedAt === 'number' ? c.startedAt : 0;
      return c.date === today || (at - started) < WINDOW_MS;
    });
    mine.sort(function (a, b) { return (b.startedAt || 0) - (a.startedAt || 0); });
    return mine[0] || null;
  }

  /* Every crew member crewed to this bus, driver seats first. The server's
   * create guard resolves `driverId` against a `drivers` record and refuses one
   * whose `busId` is not this bus — "that driver is not crewed to this bus" —
   * so the only people this screen may offer are the ones that query returns. */
  function crewOfBus(m, busId) {
    const all = live(rows(m, 'drivers'));
    const out = all.filter(function (d) { return String(d.busId || '') === String(busId); });
    out.sort(function (a, b) { return (a.driverSlot || 9) - (b.driverSlot || 9); });
    return out;
  }

  function byId(arr, id) {
    const list = live(arr);
    let i;
    for (i = 0; i < list.length; i++) if (String(list[i].id) === String(id)) return list[i];
    return null;
  }

  function nameOfUser(m, userId) {
    const u = byId(rows(m, 'users'), userId) || byId(rows(m, 'drivers'), userId);
    return (u && u.name) || '';
  }

  /* ---------- the create record ------------------------------------------ */

  function newId() {
    const c = root.crypto;
    if (c && typeof c.getRandomValues === 'function') {
      const r = c.getRandomValues(new Uint32Array(2));
      return 'gc-' + r[0].toString(36) + r[1].toString(36);
    }
    return 'gc-' + Date.now().toString(36) + Math.floor(Math.random() * 1e9).toString(36);
  }

  /* The create payload, pure, and it refuses rather than building something the
   * server will refuse. Three of the four refusals are the guard's own words:
   *
   *   - no bus, or no crew record            "a gate check names the driver taking the bus out"
   *   - the crew is not on THIS bus          "that driver is not crewed to this bus"
   *   - the selfie carries image bytes       LIVE-ISSUES 9, and note 5 at the top
   *
   * `driverName` is sent because the record has the field and v1 reads it, but
   * the server overwrites it from the crew record; `userId` is NOT sent at all,
   * because it is who ran the check and only the token knows that. There is no
   * `decision` key: "a gate check cannot be decided before it exists". */
  function payload(bus, crew, selfie, opts) {
    const o = opts || {};
    if (!bus || !bus.id || !crew || !crew.id) return null;
    if (String(crew.busId || '') !== String(bus.id)) return null;
    const photo = selfie == null ? '' : String(selfie);
    if (photo === '' || /^data:/i.test(photo)) return null;
    const at = typeof o.at === 'number' ? o.at : Date.now();
    return {
      id: o.id || newId(),
      busId: String(bus.id),
      regNo: bus.regNo || '',
      driverId: String(crew.id),
      driverName: crew.name || '',
      startedAt: at,
      date: dayKey(at),
      selfie: photo,
      faceVerified: false,
      lat: o.lat == null ? null : o.lat,
      lng: o.lng == null ? null : o.lng,
      onDutyBoard: o.onDutyBoard === true,
      status: 'open',
      items: {},
    };
  }

  /* Creates the check, or resumes the one that already exists for this bus
   * tonight. Never two. */
  async function start(busId, driverId, selfie, opts) {
    // No model argument: rows(null, ...) reads the device's own copy out of
    // S.cache, which is where a click handler is and where a render is not.
    const m = null;
    const bus = byId(rows(m, 'buses'), busId);
    const crew = byId(rows(m, 'drivers'), driverId);
    const at = clock();
    const existing = currentCheck(rows(m, STORE), busId, at);
    if (existing) return existing;
    const o = opts || {};
    const rec = payload(bus, crew, selfie, {
      at: at, lat: o.lat, lng: o.lng,
      onDutyBoard: crewOfBus(m, busId).some(function (d) { return String(d.id) === String(driverId); }),
    });
    if (!rec) return null;
    const d = db();
    if (!d || typeof d.put !== 'function') return null;
    await d.put(STORE, rec);
    return rec;
  }

  /* ---------- the view model --------------------------------------------- */

  /* The screen's own state, which is not in the record and must not be: the
   * panel it is looking at, the driver picked and the photo taken before the
   * check exists, and which write is in flight. A photo held here is NOT a
   * draft record on one phone — nothing is written until the create succeeds,
   * which is the whole of section 4.5's "an interrupted check leaves a real
   * open check, not a draft". */
  const ui = {
    busId: null,          // the panel's bus, or null for the board
    driverId: null,       // step 1's pick, before the record exists
    selfie: '',           // the hosted URL of the driver photo, never bytes
    uploadFailed: false,
    itemFailed: '',       // the item key whose photo upload failed
    problem: '',          // the item key whose note field is open
    busy: '',             // 'release' | 'send' | item key, while a write is out
    running: null,        // Night.running(date), or null while unknown
    date: null,
  };

  function role(m) { return (m && m.role) || ((state() && state().user && state().user.role) || ''); }
  function meId(m) { return (m && m.user && m.user.id) || ((state() && state().user && state().user.id) || ''); }

  function can(m, cap) {
    const c = caps();
    return !!(c && typeof c.can === 'function' && c.can(role(m), cap));
  }

  /* The board's rows and the panel, from the device's own copy. Pure: every
   * input is an argument, which is what makes the whole screen node-testable
   * and is why `ui` is passed in rather than read. */
  function model(m, u) {
    const s = u || ui;
    const checks = rows(m, STORE);
    const buses = live(rows(m, 'buses'));
    const now = clock();
    const mine = meId(m);
    const mayCheck = can(m, 'gateCheck');

    const running = s.running;
    const haveList = running !== null && running !== undefined;
    const ids = haveList ? running.slice() : [];
    const tonight = haveList
      ? ids.map(function (id) { return byId(buses, id) || { id: id, regNo: '' }; })
      : buses.filter(function (b) { return !!currentCheck(checks, b.id, now); });

    tonight.sort(function (a, b) { return String(a.regNo || '').localeCompare(String(b.regNo || '')); });

    const list = tonight.map(function (b) {
      const c = currentCheck(checks, b.id, now);
      const o = c ? outcome(c.items) : null;
      return {
        id: b.id, regNo: b.regNo || '',
        check: c, out: o,
        status: c ? String(c.status || 'open') : 'none',
        mine: !!(c && String(c.userId || '') === String(mine)),
        starter: c ? nameOfUser(m, c.userId) : '',
        press: mayCheck,
      };
    });

    const checked = list.filter(function (r) {
      return r.status === 'released' || r.status === 'approved';
    }).length;

    const vm = {
      role: role(m), density: (m && m.density) || 'yard', offline: !!(m && m.offline),
      stale: !!(m && m.stale), mayCheck: mayCheck, now: now,
      haveList: haveList, total: list.length, checked: checked,
      rows: list.slice(0, BOARD_CAP), hidden: Math.max(0, list.length - BOARD_CAP),
      loading: checks === null,
      panel: null,
    };
    if (s.busId) vm.panel = panelModel(m, s, list, mine);
    return vm;
  }

  function panelModel(m, s, list, mine) {
    let i, found = null;
    for (i = 0; i < list.length; i++) if (String(list[i].id) === String(s.busId)) found = list[i];
    const bus = found || byId(rows(m, 'buses'), s.busId) || { id: s.busId, regNo: '' };
    const c = found ? found.check : currentCheck(rows(m, STORE), s.busId, clock());
    const crew = crewOfBus(m, s.busId);

    /* Pre-filled from the bus's Driver 1 seat, and overridable only to somebody
     * else crewed to THIS bus — the one set the server will accept. */
    const picked = s.driverId ? byId(crew, s.driverId) : null;
    const driver = picked || crew[0] || null;

    const p = {
      busId: bus.id, regNo: bus.regNo || '',
      check: c || null,
      status: c ? String(c.status || 'open') : 'none',
      mine: !!(c && String(c.userId || '') === String(mine)),
      starter: c ? nameOfUser(m, c.userId) : '',
      crew: crew, driver: driver,
      selfie: s.selfie || '',
      uploadFailed: !!s.uploadFailed,
      itemFailed: s.itemFailed || '',
      problem: s.problem || '',
      busy: s.busy || '',
      out: c ? outcome(c.items) : null,
    };
    /* The fill rules, and they are the guard's: only the person who STARTED a
     * check may carry on with it (manager_fill reads old.userId === actor.id),
     * and only while it is open or held. Everything else is read-only — and a
     * read-only panel still shows the whole check, because a state you may read
     * is information even where the action is not yours. */
    p.fillable = !!(p.check && p.mine && (p.status === 'open' || p.status === 'held') && can(m, 'gateCheck'));
    p.startable = !p.check && can(m, 'gateCheck');
    /* Where a half-finished check reopens. A check started at 20:00 and read at
     * 02:00 is still open and still counts (v2-ux.md §3.3 step 3), and the
     * panel reopens on the first UNANSWERED item rather than at the top — the
     * sticky header already says how many are left, and scrolling past six
     * answered cards to find the seventh is six cards of work the app can do.
     * The key is in the markup so mount() can reach it without measuring a
     * row, which foundation §2.3 rule 2 forbids. */
    p.firstOpen = (p.out && p.out.missing.length) ? p.out.missing[0] : '';
    return p;
  }

  /* ---------- the board -------------------------------------------------- */

  /* One of the six states, each with its own mark, its own word and a colour as
   * the THIRD signal. v2-ux.md section 4.1 row 9 forbids status by colour
   * alone, so the mark and the word carry it and `data-gate` only tints. */
  function rowState(r, offline) {
    switch (r.status) {
      case 'open':
        return { mark: 'gate', tone: 'warn',
                 t: fill('gateStarted', hhmm(r.check.startedAt)),
                 sub: fill('gateStartedSub', r.out.answered) };
      case 'awaiting':
        return { mark: 'gate', tone: 'warn', t: say('gateWaiting'),
                 sub: fill('gateWaitingSub', hhmm(r.check.sentAt || r.check.updatedAt))
                   + failedWords(r.check) };
      case 'released':
        return { mark: 'ok', tone: 'ok',
                 t: fill('gateReleased', hhmm(r.check.releasedAt || r.check.updatedAt)),
                 sub: say('gateReleasedSub') + dot(r.check.driverName) };
      case 'approved':
        return { mark: 'ok', tone: 'ok',
                 t: fill('gateApproved', hhmm(decAt(r.check))),
                 sub: say('gateApprovedSub') + dot(decReason(r.check)) };
      case 'held':
        return { mark: 'bad', tone: 'bad',
                 t: fill('gateHeld', hhmm(decAt(r.check))),
                 sub: say('gateHeldSub') + dot(decReason(r.check)) };
      default:
        /* Offline, another supervisor may already have released this bus, so the
         * copy says what this device knows and not what is true in the yard. */
        return { mark: 'gate', tone: 'dim',
                 t: offline ? say('gateNotHere') : say('gateNotYet'),
                 sub: say('gateNotYetSub') };
    }
  }

  function dot(s) { return s ? ' · ' + s : ''; }
  function decAt(c) { const d = c && c.decision; return d && typeof d.at === 'number' ? d.at : (c && c.updatedAt); }
  function decReason(c) { const d = c && c.decision; return (d && d.reason) || ''; }

  function failedWords(c) {
    const f = outcome(c && c.items).failed;
    if (!f.length) return '';
    const names = f.map(function (k) {
      let i;
      for (i = 0; i < GATE_ITEMS.length; i++) if (GATE_ITEMS[i].k === k) return say(GATE_ITEMS[i].name);
      return k;
    });
    return dot(names.join(', '));
  }

  function row(r, offline) {
    const st = rowState(r, offline);
    /* A row the person may not press is a `div`, not a disabled button: the
     * press is the capability, the sentence is not. */
    const tag = r.press ? 'button' : 'div';
    const open = r.press ? ' type="button" data-act="open" data-bus="' + esc(r.id) + '"' : '';
    return '<' + tag + ' class="v2row"' + open + '>'
      + '<span class="lead" data-gate="' + st.tone + '">' + draw(st.mark) + '</span>'
      + '<span class="txt"><span class="t">' + esc(r.regNo || r.id) + ' · ' + esc(st.t) + '</span>'
      + '<span class="sub">' + esc(st.sub) + '</span></span>'
      + '<span class="act"></span>'
      + '</' + tag + '>';
  }

  function countLine(vm) {
    const F = root.figure;
    if (typeof F !== 'function') return '';
    if (vm.loading || !vm.haveList) {
      // figure(null) is the dash and the screen-reader word for "no value" --
      // never "0 of 0", which reads as a finished evening.
      return '<p class="gate-count">' + F(null) + '</p>';
    }
    if (vm.total > 0 && vm.checked === vm.total) {
      return '<p class="gate-count">' + draw('ok', 16) + ' ' + esc(say('gateAllChecked')) + '</p>';
    }
    return '<p class="gate-count">' + F(vm.checked, {
      stale: vm.stale,
      format: function (v) { return fill('gateCheckedOf', v, vm.total); },
    }) + '</p>';
  }

  function board(vm) {
    const E = root.emptyState, SK = root.skeleton;
    if (vm.loading && typeof SK === 'function') {
      return '<section class="gate-board">' + countLine(vm) + SK(6) + '</section>';
    }
    let body;
    if (!vm.haveList && !vm.rows.length) {
      body = typeof E === 'function'
        ? E(say('gateNoList'), { icon: 'bus', hint: say('gateNoListHint') }) : '';
    } else if (!vm.rows.length) {
      body = typeof E === 'function'
        ? E(say('gateNoneTonight'), { icon: 'bus', hint: say('gateNoneTonightHint') }) : '';
    } else {
      body = '<div class="gate-rows">' + vm.rows.map(function (r) { return row(r, vm.offline); }).join('') + '</div>'
        + (vm.hidden ? '<p class="gate-note">' + esc(fill('gateShownOf', vm.rows.length, vm.total)) + '</p>' : '');
    }
    const head = !vm.haveList && vm.rows.length
      ? '<p class="gate-note">' + draw('warn', 16) + ' ' + esc(say('gateNoListHint')) + '</p>' : '';
    const off = vm.offline ? '<p class="gate-note">' + draw('offline', 16) + ' ' + esc(say('gateStale')) + '</p>' : '';
    return '<section class="gate-board">' + countLine(vm) + head + off + body + '</section>';
  }

  /* ---------- the panel -------------------------------------------------- */

  /* A full-column panel inside the screen, not a sheet, and the reason is
   * mechanical rather than aesthetic: a scroll-locked modal holding ten
   * answers, three camera captures and a 1500 ms hold, on a 360px phone, in the
   * dark, is a trap with one exit. overlay.js's hundred checks are about focus
   * and dismissal, not about holding a ten-step task. It keeps the route and
   * carries its own back control. */
  function panelHead(p, extra) {
    return '<div class="gate-head">'
      + '<button type="button" class="btn btn-quiet gate-back" data-act="close" aria-label="'
      + esc(say('gateBack')) + '">' + draw('back') + '</button>'
      + '<span class="gate-head-t">' + esc(p.regNo || p.busId) + '</span>'
      + '<span class="gate-head-x">' + (extra || '') + '</span></div>';
  }

  function progress(p) {
    const o = p.out;
    const bits = [esc(fill('gateAnswered', o.answered))];
    if (o.failed.length) bits.push(esc(say('gateProblemsN', o.failed.length)));
    return bits.join(' · ');
  }

  /* Step 1, and it is step 1 because `selfie` and `driverId` are in GATE_FIXED:
   * the photograph cannot be taken at the end, and the driver cannot be changed
   * after the record exists. So the record is created once, here, with both
   * already in hand. */
  function startPanel(p) {
    const E = root.emptyState;
    if (!p.crew.length) {
      return panelHead(p) + '<div class="gate-panel">'
        + (typeof E === 'function' ? E(say('gateNoCrew'), { icon: 'seat', hint: say('gateNoCrewHint') }) : '')
        + '</div>';
    }
    const d = p.driver;
    const slot = d && d.driverSlot ? ' · ' + fill('gateDriverN', d.driverSlot) : '';
    const who = '<div class="v2row">'
      + '<span class="lead">' + draw('person') + '</span>'
      + '<span class="txt"><span class="t">' + esc((d && d.name) || '') + esc(slot) + '</span>'
      + '<span class="sub">' + esc(say('gateWhoTakes')) + '</span></span>'
      + '<span class="act">' + (p.crew.length > 1
        ? '<button type="button" class="btn btn-quiet" data-act="pickDriver">' + esc(say('gateSomebodyElse')) + '</button>'
        : '') + '</span></div>';

    /* The photo, through the one component that owns an upload URL. A tile is a
     * button whose words come before its picture, the <img> carries
     * referrerpolicy="no-referrer", and the full size opens inside
     * V2.openPhoto's sheet. There is no anchor, no copy-link and no share
     * anywhere on this screen, which is LIVE-ISSUES 7's only half this
     * interface owns. */
    const taken = p.selfie !== '';
    const photo = '<div class="gate-photo">'
      /* The capture markup has ONE owner, ui/photos.js, and this screen never
       * hand-writes it: the label wrapping an .sr-only file input is the only
       * way to a camera on Chrome 109 without script, and the clipped-not-hidden
       * input is what keeps it on the keyboard. A second copy here would be a
       * second thing to get wrong. */
      + (typeof root.photoCapture !== 'function' ? ''
        : taken && typeof root.photoGrid === 'function'
          ? root.photoGrid([{ url: p.selfie, caption: say('gatePhotoDriver') }], {})
            + root.photoCapture(say('gateTakeAgain'), 'selfie')
          : root.photoCapture(say('gatePhotoDriver'), 'selfie'))
      + '</div>';

    const ready = taken && d;
    const why = ready ? '' : '<p class="gate-why">' + esc(say('gatePhotoFirst')) + '</p>';
    const fail = p.uploadFailed && typeof root.errorState === 'function'
      ? '<div class="gate-why">' + root.errorState(say('gateUploadFailed') + ' — ' + say('gateUploadFailedHint'), retryStart) + '</div>'
      : '';
    const go = '<button type="button" class="btn btn-primary gate-go" data-act="start"'
      + (ready ? '' : ' aria-disabled="true"') + '>' + esc(say('gateStartCheck')) + '</button>';
    return panelHead(p) + '<div class="gate-panel">' + who + photo + fail + why + go + '</div>';
  }

  /* One item: a card and not a row, on purpose. A row's `.act` holds at most one
   * control at yard density (foundation 2.1), and an item needs a two-way
   * answer — pass, or a problem with a note. Two 48px buttons plus a mark plus a
   * title does not fit 328px, and cycling one target through three states is
   * worse than either. This is section 7.2's "compose freely" being used. */
  function itemCard(p, spec) {
    const it = (p.check.items || {})[spec.k] || null;
    const passed = !!(it && it.ok === true && (!spec.photo || it.photo));
    const failed = !!(it && it.ok === false && String(it.note || '').trim());
    const mark = passed ? { m: 'ok', tone: 'ok' } : failed ? { m: 'bad', tone: 'bad' } : { m: 'clock', tone: 'dim' };
    const before = (p.check.failedBefore || []).indexOf(spec.k) >= 0;

    let photos = '';
    if (spec.photo) {
      const shot = it && it.photo ? [{ url: it.photo, caption: say(spec.name) }] : [];
      photos = '<div class="gate-shot">'
        + (typeof root.photoGrid === 'function'
          ? root.photoGrid(shot, p.fillable
            // No label when nothing is taken yet: photos.js's own "Take photo"
            // is the right word for an item, and "Photo of the driver" is not.
            ? { capture: true, label: shot.length ? say('gateTakeAgain') : '', name: 'photo-' + spec.k }
            : {})
          : '') + '</div>';
    }

    let answers = '';
    if (p.fillable) {
      const needPhoto = spec.photo && !(it && it.photo);
      const working = p.busy === spec.k;
      answers = '<div class="gate-answers">'
        + '<button type="button" class="btn btn-primary" data-act="pass" data-item="' + esc(spec.k) + '"'
        + (needPhoto || working ? ' aria-disabled="true"' : '') + '>'
        + esc(working ? say('gateSaving') : say('gatePass')) + '</button>'
        + '<button type="button" class="btn" data-act="problem" data-item="' + esc(spec.k) + '">'
        + esc(say('gateProblem')) + '</button></div>'
        + (needPhoto ? '<p class="gate-why">' + esc(say('gatePhotoNeeded')) + '</p>' : '')
        + (p.itemFailed === spec.k ? '<p class="gate-why">' + esc(say('gateItemPhotoFailed')) + '</p>' : '');
      if (p.problem === spec.k || failed) {
        answers += '<label class="gate-note-f"><span class="sr-only">' + esc(say('gateWhatWrong')) + '</span>'
          + '<textarea class="field" rows="3" data-note="' + esc(spec.k) + '" placeholder="'
          + esc(say('gateWhatWrong')) + '">' + esc((it && it.note) || '') + '</textarea></label>';
      }
    } else if (failed && it.note) {
      answers = '<p class="gate-why">' + esc(it.note) + '</p>';
    }

    return '<div class="card gate-item"' + (p.firstOpen === spec.k ? ' data-first="' + esc(spec.k) + '"' : '') + '>'
      + '<div class="gate-item-h"><span class="lead" data-gate="' + mark.tone + '">' + draw(mark.m) + '</span>'
      + '<span class="txt"><span class="t">' + esc(say(spec.name)) + '</span>'
      + '<span class="sub">' + esc(say(spec.what)) + '</span></span></div>'
      + (before ? '<p class="gate-why">' + esc(say('gateFailedBefore')) + '</p>' : '')
      + photos + answers + '</div>';
  }

  /* The two endings. The release control is ABSENT until all ten are answered —
   * not disabled — because the thing to do before then is answer an item, and
   * the sticky header already says how many are left. */
  function ending(p) {
    const o = p.out;
    if (!p.fillable || o.verdict === 'incomplete') return '';
    if (o.verdict === 'pass') {
      const busy = p.busy === 'release';
      return '<div class="gate-end"><button type="button" class="btn btn-primary gate-hold" data-hold'
        + (busy ? ' aria-disabled="true"' : '') + '>'
        + '<span class="gate-bar" aria-hidden="true"></span>'
        + '<span class="gate-hold-l">' + esc(busy ? say('gateReleasing') : say('gateHoldRelease')) + '</span>'
        + '</button></div>';
    }
    const busy = p.busy === 'send';
    return '<div class="gate-end"><button type="button" class="btn gate-send" data-act="send"'
      + (busy ? ' aria-disabled="true"' : '') + '>'
      + esc(busy ? say('gateSendingDecision') : say('gateSendDecision')) + '</button></div>';
  }

  /* What the person who RAN the check sees where a decide control would be.
   *
   * There is no approve and no hold button on this screen for anybody — the
   * decision is an Attention row for `gateDecide`, where the decider already
   * looks — and for the runner the server would refuse it twice over: "you ran
   * this check — somebody else decides go or hold". So the runner gets the
   * sentence instead, because a control that is absent with no explanation reads
   * as a screen that is broken. */
  function outcomeRow(p) {
    const s = p.status;
    if (s === 'awaiting') {
      return '<div class="v2row v2row-why"><span class="lead" data-gate="warn">' + draw('gate') + '</span>'
        + '<span class="txt"><span class="t">' + esc(say('gateWaiting')) + '</span>'
        + '<span class="sub">' + esc(fill('gateWaitingPanel', hhmm(p.check.sentAt || p.check.updatedAt)))
        + (p.mine ? ' ' + esc(say('gateYouRanIt')) : '') + '</span></span>'
        + '<span class="act"></span></div>';
    }
    if (s === 'held' || s === 'approved') {
      const word = s === 'held' ? 'gateHeldReason' : 'gateApprovedReason';
      return '<div class="v2row v2row-why"><span class="lead" data-gate="' + (s === 'held' ? 'bad' : 'ok') + '">'
        + draw(s === 'held' ? 'bad' : 'ok') + '</span>'
        + '<span class="txt"><span class="t">' + esc(say(s === 'held' ? 'gateHeld' : 'gateApproved').replace('{0}', hhmm(decAt(p.check)))) + '</span>'
        + '<span class="sub">' + esc(fill(word, hhmm(decAt(p.check)), decReason(p.check))) + '</span></span>'
        + '<span class="act"></span></div>';
    }
    if (s === 'released') {
      return '<div class="v2row"><span class="lead" data-gate="ok">' + draw('ok') + '</span>'
        + '<span class="txt"><span class="t">' + esc(fill('gateReleased', hhmm(p.check.releasedAt || p.check.updatedAt))) + '</span>'
        + '<span class="sub">' + esc(say('gateReleasedSub') + dot(p.check.driverName)) + '</span></span>'
        + '<span class="act"></span></div>';
    }
    return '';
  }

  function checkPanel(p) {
    /* A check somebody else started is read-only and names them. The guard's
     * manager_fill requires old.userId === actor.id, so a resume control here
     * would produce a refused push — the worst version of this. */
    const started = !p.mine && p.check
      ? '<p class="gate-note">' + draw('person', 16) + ' '
        + esc(fill('gateStartedBy', p.starter, hhmm(p.check.startedAt))) + ' ' + esc(say('gateReadOnly')) + '</p>'
      : '';
    const selfie = p.check.selfie && typeof root.photoGrid === 'function'
      ? '<div class="gate-photo">' + root.photoGrid([{ url: p.check.selfie, caption: say('gatePhotoDriver') }], {}) + '</div>'
      : '';
    const who = '<div class="v2row"><span class="lead">' + draw('person') + '</span>'
      + '<span class="txt"><span class="t">' + esc(p.check.driverName || '') + '</span>'
      + '<span class="sub">' + esc(say('gateWhoTakes')) + '</span></span><span class="act"></span></div>';
    const items = GATE_ITEMS.map(function (spec) { return itemCard(p, spec); }).join('');
    return panelHead(p, '<span class="gate-prog">' + progress(p) + '</span>')
      + '<div class="gate-panel">' + started + who + selfie + outcomeRow(p) + items + ending(p) + '</div>';
  }

  function render(m, u) {
    const vm = model(m, u || ui);
    if (!vm.mayCheck && typeof root.emptyState === 'function') {
      // Deny by default, per screen as well as per row. Reaching here means the
      // nav and the declaration disagree, which is LIVE-ISSUES 6 exactly.
      return root.emptyState(say('gateNoAccess'), { icon: 'warn', hint: say('gateNoAccessHint') });
    }
    if (vm.panel) return vm.panel.check ? checkPanel(vm.panel) : startPanel(vm.panel);
    return board(vm);
  }

  /* ---------- the DOM side ----------------------------------------------- */

  function redraw() {
    const sh = shell();
    const r = router();
    const cur = (r && r.current && r.current()) || null;
    if (sh && typeof sh.mount === 'function' && cur && cur.id === ID) sh.mount(ID, cur.params);
  }

  async function reload() {
    const c = cache();
    if (c && typeof c.load === 'function') {
      try { await c.load([STORE, 'buses', 'drivers', 'users']); } catch (e) { /* the old copy stands */ }
    }
    const n = night();
    if (n && typeof n.running === 'function') {
      try {
        ui.date = (typeof n.dayKey === 'function') ? n.dayKey() : dayKey(clock());
        ui.running = await n.running(ui.date);
      } catch (e) { ui.running = null; }
    }
    redraw();
  }

  function retryStart() { ui.uploadFailed = false; redraw(); }

  function fileOf(ev) {
    const t = ev && ev.target;
    const files = t && t.files;
    return (files && files.length) ? files[0] : null;
  }

  /* A capture to a data URL, which is the ONLY place image bytes exist on this
   * screen: in a local variable, on its way to the upload. Nothing writes one
   * into a record (note 5 at the top). */
  function readFile(file) {
    return new Promise(function (res) {
      const R = root.FileReader;
      if (!R) { res(''); return; }
      const fr = new R();
      fr.onload = function () { res(String(fr.result || '')); };
      fr.onerror = function () { res(''); };
      fr.readAsDataURL(file);
    });
  }

  async function upload(dataUrl) {
    const s = sync();
    if (!dataUrl || !s || typeof s.uploadPhoto !== 'function') return '';
    try {
      const url = await s.uploadPhoto(dataUrl);
      // No `|| dataUrl`. That one fallback is LIVE-ISSUES 9, and on a field in
      // GATE_FIXED it could never be patched back out.
      return (typeof url === 'string' && url && !/^data:/i.test(url)) ? url : '';
    } catch (e) { return ''; }
  }

  async function onFile(ev) {
    const t = ev && ev.target;
    const name = t && t.getAttribute ? (t.getAttribute('name') || '') : '';
    if (name !== 'selfie' && name.indexOf('photo-') !== 0) return;
    const file = fileOf(ev);
    if (!file) return;
    const url = await upload(await readFile(file));
    if (name === 'selfie') {
      ui.selfie = url;
      ui.uploadFailed = url === '';
      redraw();
      return;
    }
    const key = name.slice(6);
    if (url === '') { ui.itemFailed = key; redraw(); return; }
    ui.itemFailed = '';
    await writeItem(key, { photo: url });
  }

  function currentFor(busId) {
    return currentCheck(rows(null, STORE), busId, clock());
  }

  /* One item key, written onto the record the server will accept it on. `items`
   * is not in GATE_FIXED, so this is the one part of a check that may change
   * after creation — and only by the person who started it, and only while it is
   * open or held. */
  async function writeItem(key, patch) {
    const c = currentFor(ui.busId);
    const d = db();
    if (!c || !d || typeof d.put !== 'function') return;
    if (String(c.userId || '') !== String(meId(null))) return;
    if (c.status !== 'open' && c.status !== 'held') return;
    const items = {};
    let k;
    for (k in (c.items || {})) if (Object.prototype.hasOwnProperty.call(c.items, k)) items[k] = c.items[k];
    const was = items[key] || {};
    const next = { ok: was.ok, photo: was.photo || '', note: was.note || '' };
    if ('ok' in patch) next.ok = patch.ok;
    if ('photo' in patch) next.photo = patch.photo;
    if ('note' in patch) next.note = patch.note;
    items[key] = next;
    const rec = Object.assign({}, c, { items: items });
    try { await d.put(STORE, rec); } catch (e) { toast(say('gateNotSaved'), 'bad'); return; }
    await reload();
  }

  function toast(text, kind) {
    const v = V();
    if (v && typeof v.toast === 'function') v.toast(text, { kind: kind || 'ok' });
  }

  async function setStatus(status) {
    const c = currentFor(ui.busId);
    const d = db();
    if (!c || !d) return false;
    const rec = Object.assign({}, c, { status: status });
    try { await d.put(STORE, rec); } catch (e) { return false; }
    return true;
  }

  async function release() {
    const c = currentFor(ui.busId);
    if (!c || outcome(c.items).verdict !== 'pass') return;
    ui.busy = 'release';
    redraw();
    const ok = await setStatus('released');
    ui.busy = '';
    if (!ok) { toast(say('gateNotReleased'), 'bad'); redraw(); return; }
    toast(fill('gateReleasedToast', c.regNo || c.busId), 'ok');
    ui.busId = null;                 // the panel returns to the board
    await reload();
  }

  async function send() {
    const c = currentFor(ui.busId);
    if (!c || outcome(c.items).verdict !== 'fail') return;
    ui.busy = 'send';
    redraw();
    const ok = await setStatus('awaiting');
    ui.busy = '';
    if (!ok) { toast(say('gateNotSaved'), 'bad'); redraw(); return; }
    await reload();
  }

  async function doStart() {
    const vm = model(null, ui);
    const p = vm.panel;
    if (!p || !p.driver || p.selfie === '') return;
    ui.busy = 'start';
    const rec = await start(p.busId, p.driver.id, p.selfie, {});
    ui.busy = '';
    if (!rec) { ui.uploadFailed = true; redraw(); return; }
    ui.selfie = '';
    ui.driverId = null;
    await reload();
  }

  function pickDriver() {
    const v = V();
    const vm = model(null, ui);
    const p = vm.panel;
    if (!v || typeof v.openSheet !== 'function' || !p) return;
    const body = p.crew.map(function (d) {
      const slot = d.driverSlot ? ' · ' + fill('gateDriverN', d.driverSlot) : '';
      return '<button type="button" class="v2row" data-act="setDriver" data-driver="' + esc(d.id) + '">'
        + '<span class="lead">' + draw('person') + '</span>'
        + '<span class="txt"><span class="t">' + esc(d.name || '') + esc(slot) + '</span></span>'
        + '<span class="act"></span></button>';
    }).join('');
    v.openSheet(say('gatePickDriver'), body);
  }

  /* ONE delegated click listener, on the document, installed once, and it
   * returns early on a field BEFORE it reads [data-act]. That one line is the
   * shelf-count regression (predeploy-gate.sh:508 and the sweep at :1073): a
   * count field sat inside a pressable row, the row's handler caught the click,
   * and the storekeeper was thrown off the screen mid-count. This screen has a
   * textarea inside a card, so it is the same shape of hazard. */
  function onClick(ev) {
    const t = ev && ev.target;
    if (!t || typeof t.closest !== 'function') return;
    if (t.closest('input, select, textarea, label, .num')) return;
    const el = t.closest('[data-act]');
    if (!el) return;
    const act = el.getAttribute('data-act');
    if (act === 'open') {
      if (ev.preventDefault) ev.preventDefault();
      ui.busId = el.getAttribute('data-bus');
      ui.selfie = ''; ui.driverId = null; ui.uploadFailed = false; ui.itemFailed = ''; ui.problem = '';
      reload();
      return;
    }
    if (act === 'close') {
      if (ev.preventDefault) ev.preventDefault();
      ui.busId = null; ui.selfie = ''; ui.driverId = null; ui.uploadFailed = false;
      redraw();
      return;
    }
    if (act === 'pickDriver') { if (ev.preventDefault) ev.preventDefault(); pickDriver(); return; }
    if (act === 'setDriver') {
      if (ev.preventDefault) ev.preventDefault();
      ui.driverId = el.getAttribute('data-driver');
      const v = V();
      if (v && typeof v.closeSheet === 'function') v.closeSheet();
      redraw();
      return;
    }
    if (act === 'start') {
      if (ev.preventDefault) ev.preventDefault();
      if (el.getAttribute('aria-disabled') === 'true') return;
      doStart();
      return;
    }
    if (act === 'pass') {
      if (ev.preventDefault) ev.preventDefault();
      if (el.getAttribute('aria-disabled') === 'true') return;
      writeItem(el.getAttribute('data-item'), { ok: true });
      return;
    }
    if (act === 'problem') {
      if (ev.preventDefault) ev.preventDefault();
      ui.problem = el.getAttribute('data-item');
      redraw();
      return;
    }
    if (act === 'send') {
      if (ev.preventDefault) ev.preventDefault();
      if (el.getAttribute('aria-disabled') === 'true') return;
      send();
    }
  }

  // A note is saved when the field is left, not on every keystroke: a push per
  // character on a 4 s sync tick is the shape of waste this codebase has paid
  // for before.
  function onChange(ev) {
    const t = ev && ev.target;
    const key = t && t.getAttribute ? t.getAttribute('data-note') : null;
    if (!key) return;
    writeItem(key, { note: String(t.value == null ? '' : t.value), ok: false });
  }

  /* The hold. Its own listeners, delegated on the document like the click one —
   * never one per button — because the gesture needs a down and an up and a
   * click event carries neither. */
  let timer = null;
  function holdEl(t) {
    return (t && typeof t.closest === 'function') ? t.closest('[data-hold]') : null;
  }
  function holdStart(ev) {
    const el = holdEl(ev && ev.target);
    if (!el || timer || el.getAttribute('aria-disabled') === 'true') return;
    if (ev.cancelable && ev.preventDefault) ev.preventDefault();
    if (ev.key != null && ev.key !== ' ' && ev.key !== 'Enter') return;
    if (ev.repeat) return;
    if (el.setAttribute) el.setAttribute('data-holding', '');
    timer = root.setTimeout(function () {
      timer = null;
      // Redrawn under the finger: this button is gone, and so is any certainty
      // the person is still holding it. Do nothing.
      if (el.isConnected === false) return;
      if (el.removeAttribute) el.removeAttribute('data-holding');
      release();
    }, HOLD_MS);
  }
  function holdStop(ev) {
    if (timer === null) return;
    const el = holdEl(ev && ev.target);
    if (ev && ev.key != null && ev.key !== ' ' && ev.key !== 'Enter') return;
    root.clearTimeout(timer);
    timer = null;
    if (el && el.removeAttribute) el.removeAttribute('data-holding');
  }

  let listening = false;
  function mount() {
    const d = doc();
    if (!listening && d && typeof d.addEventListener === 'function') {
      listening = true;
      d.addEventListener('click', onClick);
      d.addEventListener('change', onFile);
      d.addEventListener('change', onChange);
      d.addEventListener('pointerdown', holdStart);
      d.addEventListener('keydown', holdStart);
      ['pointerup', 'pointercancel', 'pointerleave', 'keyup', 'blur'].forEach(function (e) {
        d.addEventListener(e, holdStop);
      });
    }
    reload();
    return true;
  }

  function unmount() {
    if (timer !== null) { root.clearTimeout(timer); timer = null; }
    ui.busId = null; ui.selfie = ''; ui.driverId = null;
    ui.uploadFailed = false; ui.itemFailed = ''; ui.problem = ''; ui.busy = '';
    return true;
  }

  const api = {
    GATE_ITEMS: GATE_ITEMS,
    HOLD_MS: HOLD_MS,
    WINDOW_MS: WINDOW_MS,
    BOARD_CAP: BOARD_CAP,
    outcome: outcome,
    dayKey: dayKey,
    hhmm: hhmm,
    currentCheck: currentCheck,
    payload: payload,
    start: start,
    model: model,
    render: render,
    mount: mount,
    unmount: unmount,
    // Test seam only, the shape of Router._reset and Shell._reset: a node suite
    // cannot reload a classic script per case.
    _ui: ui,
    _reset: function () { unmount(); ui.running = null; ui.date = null; },
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Gate = api;

  // A screen registers itself at load and draws nothing until Shell.mount asks.
  if (root.Router && typeof root.Router.register === 'function') {
    root.Router.register(ID, { render: render, mount: mount, unmount: unmount });
  }
})(typeof window !== 'undefined' ? window : this);

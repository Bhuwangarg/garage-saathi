/* Garage Saathi v2 — screen #4, the Job card. Plain script, no module system.
 * Test: test_v2_work.js. Spec: docs/v2/plan/screens-work.md section 3.
 *
 * The most important screen in v2, and the reason screens #3 and #4 are one
 * slice: THE MECHANIC'S OWN-CARDS RULE LIVES HERE, ONCE, as `guard(card, me)`,
 * and Jobs consumes it to narrow its list. `inventory/02 section 6.2` records what
 * happened when the same rule was written twice: in `viewJobDetail` (c5c11a1)
 * `mine` was computed and never enforced, and a mechanic opened another
 * mechanic's card and completed a part request on it. Two expressions, one of
 * which somebody edits, is the whole defect; so there is one expression, and
 * `crew()` beside it mirrors the server's `_job_crew` (sync_server.py:1278)
 * rather than inventing a second idea of who is on a job.
 *
 * WHAT THIS SCREEN WRITES, AND WHY IT IS SAFE ON A PROTOCOL THAT LOSES WRITES.
 * Conflict is whole-record last-write-wins on a device clock and v2 starts with
 * that bug (DECISIONS.md section 14). The field DIVISION is the design, not a
 * hope that the protocol gets fixed:
 *     the supervisor owns the card        enterAt, outAt, odometer, close
 *     the mechanic writes two fields      startAt, completeAt, and nothing else
 *     the storekeeper writes the one      partsUsed, which the server MERGES
 * Every sheet therefore reads the stored card at open, sets only the fields that
 * sheet owns, and puts the rest back untouched. There is no whole-card form.
 *
 * NO NEW FIELD. Every write below lands in a field that already exists
 * (`inventory/03 section 3.1`): a field v2 invents is erased the next time a v1
 * device writes that card, because v1 runs against the same database.
 *
 * ONE DELEGATED LISTENER, and it returns early on
 * `closest('input, select, textarea, label, .num')` BEFORE it reads [data-act].
 * This screen holds a .num (the odometer, the request quantity) and a
 * label-wrapped file input (the photo capture), and predeploy-gate.sh:508-511
 * and the sweep at :1073 already test exactly this regression: a count field
 * inside a pressable row threw the storekeeper off the screen mid-count. A row
 * that holds a field is div.v2row, never button.v2row.
 */
(function (root) {
  'use strict';

  var ID = 'jobcard';
  var YARD_CAP = 20;                   // rows per block before "20 of 63 shown"
  var PHOTOS_NEEDED = 2;               // this document's number, and what the gate line promises
  var HOUR = 3600000;

  /* Closing and moving are ROLE rules with no capability behind them, and that
   * is not a shortcut. v1's `mayCloseJob` (app.js:3887) is
   * `['owner','supervisor'].includes(role)` — a helper, not an entry in the
   * permission table — so there is no `mayCloseJob` key in Caps.PERMS and
   * `Caps.can(role, 'mayCloseJob')` is false for EVERYBODY, the owner included.
   * Asking Caps for it would make the close button absent for the only two
   * people who hold it. These two lists are therefore the server's own rules,
   * transcribed: "only an owner or supervisor may close a job" and "only an
   * owner may move a verified job card to another bus" (sync_server.py). The
   * missing capability names are reported to the lead rather than minted here —
   * Caps.PERMS is F1's file and a grant invented in a screen is a grant nobody
   * reviewed. */
  var CLOSE_ROLES = ['owner', 'supervisor'];
  var MOVE_ROLES = ['owner'];

  /* ---------------------------------------------------------------------- *
   * WORDS. Every fixed word this screen draws, with its Hindi half beside it.
   * An empty `hi` is PENDING: w() draws the English with its id after it in
   * Hindi mode ("I have started [jobStarted]"), which is the whole of
   * v2-foundation-ui.md section 6.3 — a silent English fallback is how a screen
   * stayed English with every test passing. The nine ids screens-work.md
   * section 6.3 names by hand are first and keep their exact ids, because
   * v2-ux.md section 6 moved the Hindi risk onto the mechanic's two buttons
   * when Trip cash went: they are the first strings asked of the owner, not
   * the last. A builder does not guess Hindi for a word a mechanic acts on.
   * ---------------------------------------------------------------------- */
  var WORDS = {
    jobStarted: { en: 'I have started', hi: '' },
    jobDone: { en: 'I am done', hi: '' },
    jobStartedAt: { en: 'Started {time}', hi: '' },
    jobDoneAt: { en: 'Done {time}', hi: '' },
    jobTellSupervisor: { en: 'Saved on this phone. Tell the supervisor if the time is wrong.', hi: '' },
    jobWorkRecorded: { en: 'Your work is recorded', hi: '' },
    jobNeedPart: { en: 'I need a part', hi: '' },
    jobWaitingSignoff: { en: 'Waiting for sign-off', hi: '' },
    jobYouClosedIt: { en: 'Somebody else has to check this card. You closed it.', hi: '' },

    jcRecordedSub: { en: 'Done {time}. The supervisor closes the card.', hi: '' },
    jcAddEnter: { en: 'Add the enter time', hi: '' },
    jcAddEnterSub: { en: 'When did this bus come into the yard?', hi: '' },
    jcPutSomebody: { en: 'Put somebody on this job', hi: '' },
    jcPutSomebodySub: { en: 'Nobody is carrying it yet.', hi: '' },
    jcWaitPart: { en: 'Waiting for a part', hi: '' },
    jcWaitPartSub: { en: '{part} x{qty}, asked for at {time}. The store issues it.', hi: '' },
    jcAddAfter: { en: 'Add the two after photos', hi: '' },
    jcAddAfterSub: { en: 'The card cannot be closed without them.', hi: '' },
    jcWaitOther: { en: 'Waiting for a supervisor or the owner to check it', hi: '' },
    jcFinished: { en: 'Finished and signed off', hi: '' },
    jcFinishedSub: { en: 'Closed by {closer} {at}, signed off by {verifier} {vat}.', hi: '' },
    jcSignOff: { en: 'Sign off', hi: '' },
    jcSigningOff: { en: 'Signing off...', hi: '' },
    jcNotSignedOff: { en: 'Not signed off. The card is still closed and still waiting.', hi: '' },
    jcClose: { en: 'Close this card', hi: '' },
    jcClosing: { en: 'Closing...', hi: '' },
    jcIssuePart: { en: 'Issue the part', hi: '' },
    jcSaving: { en: 'Saving...', hi: '' },

    jcShowing: { en: 'Showing what this phone received {age}', hi: '' },
    jcOfflineAge: { en: 'No connection since {time} — this may be out of date.', hi: '' },

    jcGateNeed: { en: 'To close: 2 photos before, 2 after', hi: '' },
    jcGateNeedSub: { en: '{before} before taken, {after} after still needed.', hi: '' },
    jcGateNone: { en: 'None taken yet. A vendor bill can stand in for them.', hi: '' },
    jcGateReady: { en: 'Ready to close', hi: '' },
    jcGateReadySub: { en: '2 before, 2 after. The photos are on the card.', hi: '' },
    jcGateVendorSub: { en: 'The vendor bill stands in for the photos.', hi: '' },

    jcPrioHigh: { en: 'High priority', hi: '' },
    jcPrioMedium: { en: 'Medium priority', hi: '' },
    jcPrioLow: { en: 'Low priority', hi: '' },
    jcBadgeNotStarted: { en: 'Not started', hi: '' },
    jcBadgeWorking: { en: 'Being worked on', hi: '' },
    jcBadgeVerified: { en: 'Signed off', hi: '' },

    jcCrewHead: { en: 'Who is on it', hi: '' },
    jcNoCrew: { en: 'Nobody is carrying this job yet', hi: '' },
    jcTimesHead: { en: 'The four times', hi: '' },
    jcTimeEnter: { en: 'Came in {time}', hi: '' },
    jcTimeStart: { en: 'Work started {time}', hi: '' },
    jcTimeDone: { en: 'Work finished {time}', hi: '' },
    jcTimeOut: { en: 'Left the yard {time}', hi: '' },
    jcMissEnter: { en: 'Enter time — not recorded', hi: '' },
    jcMissStart: { en: 'Start time — not recorded', hi: '' },
    jcMissDone: { en: 'Done time — not recorded', hi: '' },
    jcMissOut: { en: 'Out time — not recorded', hi: '' },
    jcTapToAdd: { en: 'Tap to add it', hi: '' },
    jcGapWait: { en: 'Waited {dur} before work started', hi: '' },
    jcGapWorked: { en: 'Worked {dur}', hi: '' },
    jcGapStood: { en: 'Stood {dur} after the work was done', hi: '' },
    jcGapNoEnter: { en: 'Enter time not recorded, so the wait is unknown', hi: '' },
    jcGapNegative: { en: 'Finished before it started — one of these times is wrong.', hi: '' },
    jcChange: { en: 'Change', hi: '' },
    jcHoursMins: { en: '{h} h {m} m', hi: '' },
    jcMinsOnly: { en: '{m} m', hi: '' },

    jcOdoHead: { en: 'Odometer', hi: '' },
    jcOdoWhen: { en: 'Read when the bus came in', hi: '' },
    jcOdoNotRead: { en: 'Not read yet', hi: '' },
    jcOdoBroken: { en: 'Odometer is broken', hi: '' },
    jcOdoLower: { en: 'Lower than the last reading, {last}', hi: '' },
    jcOdoLabel: { en: 'Odometer reading', hi: '' },

    jcPartsHead: { en: 'Parts, as of {age}', hi: '' },
    jcNoParts: { en: 'No parts issued against this card', hi: '' },
    jcIssuedBy: { en: 'Issued by {who} {time}', hi: '' },
    jcLedgerNote: { en: 'The store’s ledger is what this is counted from.', hi: '' },
    jcRequestsHead: { en: 'Part requests', hi: '' },
    jcNoRequests: { en: 'Nobody has asked for a part', hi: '' },
    jcReqWaiting: { en: 'Waiting at the store, asked for {time}', hi: '' },
    jcCoresHead: { en: 'Old parts returned', hi: '' },
    jcNoCores: { en: 'No old parts returned', hi: '' },
    jcCoreSub: { en: 'Worn, photographed {time} by {who}', hi: '' },
    jcSeeAll: { en: '{shown} of {total} shown. See all', hi: '' },

    jcPhotosHead: { en: 'Photos', hi: '' },
    jcBefore: { en: 'Before ({n})', hi: '' },
    jcAfter: { en: 'After ({n})', hi: '' },
    jcPhotoNeed: { en: 'Two photos before, two after. Needed to close this card.', hi: '' },
    jcPhotoFixed: { en: 'Photos are fixed once the card is closed.', hi: '' },
    jcTakePhoto: { en: 'Take photo', hi: '' },

    jcVendorHead: { en: 'Outside vendor', hi: '' },
    jcVendorAt: { en: 'In {place}', hi: '' },
    jcGatePass: { en: 'Gate pass {no}', hi: '' },
    jcPrintPass: { en: 'Print this pass', hi: '' },

    jcMoveBus: { en: 'Move to another bus', hi: '' },
    jcDeleteCard: { en: 'Delete this card', hi: '' },
    jcDeleteAsk: { en: 'Delete this job card? The parts already issued stay on the ledger.', hi: '' },
    jcDeleteYes: { en: 'Delete', hi: '' },
    jcDeleteNo: { en: 'Keep it', hi: '' },

    jcNotOnPhone: { en: 'That job card is not on this phone', hi: '' },
    jcBackToJobs: { en: 'Back to jobs', hi: '' },

    jcChangedTitle: { en: 'This card changed', hi: '' },
    jcChangedBody: { en: 'Somebody changed this card while you were typing. If you save, your version replaces theirs.', hi: '' },
    jcSaveMine: { en: 'Save mine', hi: '' },
    jcLookFirst: { en: 'Look first', hi: '' },

    jcSheetEnter: { en: 'Enter time', hi: '' },
    jcSheetStart: { en: 'Start time', hi: '' },
    jcSheetDone: { en: 'Done time', hi: '' },
    jcSheetOut: { en: 'Out time', hi: '' },
    jcSheetDay: { en: 'Day', hi: '' },
    jcSheetTimeLater: { en: 'That is later than right now, {now}.', hi: '' },
    jcSave: { en: 'Save', hi: '' },
    jcQty: { en: 'Quantity', hi: '' },
    jcPartSearch: { en: 'Search a part', hi: '' },
    jcAsking: { en: 'Asking...', hi: '' },
    jcChoosePart: { en: 'Choose the part', hi: '' }
  };

  var registered = false;
  function register() {
    if (registered || !root.W || typeof root.W.register !== 'function') return;
    root.W.register(WORDS);
    registered = true;
  }

  /* The {name} substitution. Named rather than positional so the owner filling
   * in the Hindi can see what goes where; w() has already taken care of {n}. */
  function put(s, vals) {
    return String(s).replace(/\{([A-Za-z0-9]+)\}/g, function (all, k) {
      return vals && Object.prototype.hasOwnProperty.call(vals, k) ? String(vals[k]) : '';
    });
  }

  function say(id, vals, n) {
    register();
    var s;
    if (registered && typeof root.w === 'function') s = root.w(id, n);
    else {
      var e = WORDS[id].en;
      s = typeof e === 'string' ? e : (n === 1 ? e.one : e.other);
      if (n !== undefined && n !== null) s = String(s).replace(/\{n\}/g, String(n));
    }
    return vals ? put(s, vals) : s;
  }

  /* ---------------------------------------------------------------------- *
   * the plumbing every v2 module resolves at CALL time, never at load: S and
   * DB are made by boot.js, which loads last (v2/night.js's db() and
   * v2/router.js's caps() do the same, for the same reason).
   * ---------------------------------------------------------------------- */
  function db() { return root.DB || null; }
  function caps() { return root.Caps || null; }
  function V() { return root.V2 || null; }
  function can(role, cap) { var c = caps(); return !!(c && c.can(role, cap)); }
  function draw(name, size) { return typeof root.icon === 'function' ? root.icon(name, { size: size }) : ''; }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fig(v, o) { return typeof root.figure === 'function' ? root.figure(v, o) : ''; }

  /* ====================================================================== *
   * THE RULE. One expression, two consumers: this screen's guard and Jobs'
   * query. Everything about who may see a card is here and nowhere else.
   * ====================================================================== */

  /* Who is on a job card. The mirror of sync_server.py's `_job_crew` and of
   * v1's `jobCrew` (app.js:5862): `assignees` when it has anything, else the
   * single `assignedTo`, de-duplicated. A card written before multi-mechanic
   * jobs has only `assignedTo` and must still have a crew of one — dropping
   * that fallback would quietly lock those mechanics out of their own cards. */
  function crew(card) {
    var raw = (card && card.assignees && card.assignees.length)
      ? card.assignees
      : (card && card.assignedTo ? [{ userId: card.assignedTo, task: '' }] : []);
    var seen = {}, out = [];
    for (var i = 0; i < raw.length; i++) {
      var a = raw[i];
      if (!a || !a.userId || seen[a.userId]) continue;
      seen[a.userId] = true;
      out.push({ userId: String(a.userId), task: a.task || '' });
    }
    return out;
  }

  function onJob(card, userId) {
    if (!userId) return false;                       // a signed-out device holds nothing
    var c = crew(card);
    for (var i = 0; i < c.length; i++) if (c[i].userId === String(userId)) return true;
    return false;
  }

  /* MAY THIS PERSON SEE THIS CARD? The one own-cards rule.
   *
   * A mechanic sees only the cards they are on, BY ID — not by name, not by
   * bus, not by role. Everybody else who reached this screen at all reached it
   * through `viewJobs` and sees the whole board, which is the existing
   * arrangement and not this slice's to widen or narrow.
   *
   * Jobs calls this inside the function that BUILDS its array, before any
   * markup exists, which is v2-ux.md section 4.3's "narrowed in the query, not
   * in the view". This screen calls it before it reads a single field off the
   * card. Deny by default: a null card, a null reader and an unknown role all
   * return false.
   *
   * WHAT THIS IS NOT. The server narrows nothing on READ (`inventory/02
   * section 4.6`: `viewJobs` is client-only on the read side), so for a
   * mechanic this is a curtain and not a boundary until that read scope moves.
   * It IS a boundary on the write side — sync_server.py refuses "you are not on
   * this job" — and it is said here so nobody reads this function as more than
   * it is. */
  function guard(card, me) {
    if (!card || !me || !me.id) return false;
    if (String(me.role) !== 'mechanic') return true;
    return onJob(card, me.id);
  }

  /* ====================================================================== *
   * THE OTHER TWO SERVER MIRRORS
   * ====================================================================== */

  /* The close gate. `photoGateReady` in app.js:9018 is the existing client
   * mirror of the server's `_has_proof` (sync_server.py:1271), and this is the
   * same shape with one tightening: the server's rule is "before and after"
   * without a count, and the gate LINE on this screen promises two of each. A
   * client that accepted one and then said "Ready to close" would be lying
   * about its own sentence, so the count is here. The vendor case is the
   * server's exactly: a bill photo on either side stands in. */
  function gateReady(card) {
    if (!card) return false;
    var b = (card.beforePhotos || []).length, a = (card.afterPhotos || []).length;
    if (card.externalVendor) return b > 0 || a > 0;
    return b >= PHOTOS_NEEDED && a >= PHOTOS_NEEDED;
  }

  /* NOBODY SIGNS OFF THEIR OWN CLOSE — every role, the owner included
   * (DECISIONS.md section 10, and server-enforced since b1fb43b: "you closed
   * this job — someone else must verify it", with the supervisor's old
   * exemption gone). The control this answers for is ABSENT when it is false,
   * never disabled: the client rule is "never draw an action the server would
   * refuse". The `status === 'done'` half is the server's too — "a job must be
   * closed before it can be signed off". */
  function mayVerify(card, me) {
    if (!card || !me || !me.id) return false;
    if (card.status !== 'done') return false;
    if (!can(me.role, 'verifyJob')) return false;
    return !(card.closedBy && String(card.closedBy) === String(me.id));
  }

  function mayClose(role) { return CLOSE_ROLES.indexOf(String(role)) !== -1; }
  function mayMove(role) { return MOVE_ROLES.indexOf(String(role)) !== -1; }

  /* ====================================================================== *
   * small readers
   * ====================================================================== */

  function rows(m, name) { return (m && m.cache && m.cache[name]) || []; }
  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i];
    return null;
  }
  function nameOf(users, id) {
    var u = byId(users || [], id);
    return u ? (u.name || u.id) : '';
  }
  function regOf(buses, id) {
    var b = byId(buses || [], id);
    return b ? (b.regNo || b.id) : '';
  }
  function partName(parts, id) {
    var p = byId(parts || [], id);
    return p ? (p.name || p.id) : String(id || '');
  }

  // 24-hour clock, the way a yard reads one. Digits only, so no language is in it.
  function hhmm(ms) {
    if (ms == null) return '';
    var d = new Date(Number(ms));
    if (isNaN(d.getTime())) return '';
    var h = d.getHours(), m = d.getMinutes();
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  function durWords(ms) {
    var mins = Math.round(Math.abs(Number(ms)) / 60000);
    if (mins < 60) return say('jcMinsOnly', { m: mins });
    return say('jcHoursMins', { h: Math.floor(mins / 60), m: mins % 60 });
  }

  function ageWords(at) {
    if (at == null) return '';
    var mins = Math.floor((Date.now() - Number(at)) / 60000);
    if (mins < 1) return say('jcMinsOnly', { m: 0 });
    if (mins < 60) return say('jcMinsOnly', { m: mins });
    return say('jcHoursMins', { h: Math.floor(mins / 60), m: mins % 60 });
  }

  function waitingRequest(card) {
    var r = (card && card.partRequests) || [];
    for (var i = 0; i < r.length; i++) {
      if (r[i] && (r[i].status === 'requested' || !r[i].status)) return r[i];
    }
    return null;
  }

  function lastSyncAt() {
    var s = root.Sync;
    if (!s || typeof s.info !== 'function') return null;
    try { var i = s.info(); return i && i.lastSyncAt ? i.lastSyncAt : null; } catch (e) { return null; }
  }

  /* ====================================================================== *
   * THE ONE NEXT STEP (section 3.4). ONE row, for whoever is looking.
   *
   * The resolution order is FIXED so two readers never see two different "one"
   * steps for the same reason: the mechanic's rows first (they are
   * role-exclusive), then closed / verified state, then the store's issue, then
   * enter time, then crew, then part request, then photos, then close. The
   * first match wins and nothing below it is drawn.
   *
   * Returned as a descriptor rather than markup so the ORDER is testable
   * without reading HTML out of a string.
   * ====================================================================== */
  function nextStep(card, me) {
    if (!card || !me) return { kind: 'none' };
    var role = String(me.role);

    if (role === 'mechanic') {
      if (!onJob(card, me.id)) return { kind: 'none' };
      if (card.startAt == null) return { kind: 'tapStart' };
      if (card.completeAt == null) return { kind: 'tapDone' };
      return { kind: 'recorded' };
    }

    if (card.status === 'verified') return { kind: 'verified' };
    if (card.status === 'done') {
      /* The second signature, foundation section 3.8. The closer's own row is
       * first, BEFORE the capability test, because a supervisor who closed the
       * card holds `verifyJob` and would otherwise match the row below. */
      if (card.closedBy && String(card.closedBy) === String(me.id)) return { kind: 'youClosed' };
      if (can(role, 'verifyJob')) return { kind: 'verify' };
      return { kind: 'waitOther' };
    }

    if (role === 'store') {
      var sq = waitingRequest(card);
      return (sq && can(role, 'issuePart')) ? { kind: 'issue', req: sq } : { kind: 'none' };
    }

    if (card.enterAt == null) return { kind: 'enterTime' };
    if (crew(card).length === 0) return { kind: 'crew' };
    var wq = waitingRequest(card);
    if (wq) return { kind: 'waitPart', req: wq };
    if (!gateReady(card)) return { kind: 'photos' };
    if (mayClose(role)) return { kind: 'close' };
    return { kind: 'none' };
  }

  /* ====================================================================== *
   * markup builders
   * ====================================================================== */

  function row(o) {
    var tag = o.act ? 'button' : 'div';
    var attrs = o.act ? ' type="button" data-act="' + esc(o.act) + '"' + (o.extra || '') : (o.extra || '');
    var cls = 'v2row' + (o.why ? ' v2row-why' : '') + (o.tone ? ' ' + o.tone : '') + (o.cls ? ' ' + o.cls : '');
    return '<' + tag + ' class="' + cls + '"' + attrs + '>'
      + (o.lead ? '<span class="lead">' + o.lead + '</span>' : '')
      + '<span class="t">' + (o.rawT ? o.t : esc(o.t)) + '</span>'
      + (o.sub ? '<span class="sub">' + (o.rawSub ? o.sub : esc(o.sub)) + '</span>' : '')
      + (o.trail ? '<span class="act">' + o.trail + '</span>' : '')
      + '</' + tag + '>';
  }

  function card_(head, body, cls) {
    return '<section class="card jc-block' + (cls ? ' ' + cls : '') + '">'
      + (head ? '<h2 class="jc-head">' + head + '</h2>' : '') + body + '</section>';
  }

  function badge(kind, mark, text) {
    return '<span class="badge badge-' + kind + '">' + draw(mark, 14) + ' ' + esc(text) + '</span>';
  }

  function btn(o) {
    return '<button type="button" class="btn ' + (o.cls || '') + '" data-act="' + esc(o.act) + '"'
      + (o.field ? ' data-field="' + esc(o.field) + '"' : '')
      + (o.off ? ' aria-disabled="true"' : '') + '>'
      + (o.mark ? draw(o.mark, 20) + ' ' : '') + esc(o.label) + '</button>';
  }

  function emptyLine(text) { return '<p class="jc-none">' + esc(text) + '</p>'; }

  /* ====================================================================== *
   * the blocks
   * ====================================================================== */

  // Block 1. The registration and the status badge.
  //
  // The screen's own NAME ("Job card") is the shell's h1 and is one name in
  // three places (screens-shell.md section 1.6), so the registration cannot go
  // there without becoming a synonym for it. It is the first line of the body
  // instead, with the badge beside it.
  function blockId(v) {
    return '<p class="jc-id"><span class="jc-reg">' + esc(regOf(v.buses, v.card.busId)) + '</span>'
      + statusBadge(v.card) + '</p>';
  }

  function statusBadge(c) {
    if (c.status === 'verified') return badge('ok', 'ok', say('jcBadgeVerified'));
    // NEVER the word "verified" on a card nobody has verified.
    if (c.status === 'done') return badge('warn', 'clock', say('jobWaitingSignoff'));
    if (c.startAt != null) return badge('ok', 'ok', say('jcBadgeWorking'));
    return badge('warn', 'clock', say('jcBadgeNotStarted'));
  }

  // Block 2. Freshness, stated once for the whole card.
  function blockFresh(v) {
    var text = v.offline
      ? say('jcOfflineAge', { time: hhmm(v.at) })
      : say('jcShowing', { age: ageWords(v.at) });
    return '<p class="jc-fresh">' + draw('clock', 14) + ' ' + esc(text) + '</p>';
  }

  // Block 3. The one next step, in the ranked-row slot.
  function blockNext(v) {
    var s = v.step, c = v.card;
    switch (s.kind) {
      case 'tapStart': return tapButton('jobStart', say('jobStarted'));
      case 'tapDone': return tapButton('jobDone', say('jobDone'));
      case 'recorded':
        return slot(row({ why: true, tone: 'ok', lead: draw('ok', 20), t: say('jobWorkRecorded'),
                          sub: say('jcRecordedSub', { time: hhmm(c.completeAt) }) }));
      case 'enterTime':
        return slot(row({ why: true, tone: 'warn', lead: draw('clock', 20), t: say('jcAddEnter'),
                          sub: say('jcAddEnterSub'), act: 'jobTime', extra: ' data-field="enterAt"' }));
      case 'crew':
        return slot(row({ why: true, tone: 'warn', lead: draw('person', 20), t: say('jcPutSomebody'),
                          sub: say('jcPutSomebodySub'), act: 'jobCrew' }));
      case 'waitPart':
        return slot(row({ why: true, tone: 'warn', lead: draw('part', 20), t: say('jcWaitPart'),
                          sub: say('jcWaitPartSub', { part: partName(v.parts, s.req.partId),
                                                      qty: s.req.qty, time: hhmm(s.req.at) }) }));
      case 'photos':
        return slot(row({ why: true, tone: 'warn', lead: draw('camera', 20), t: say('jcAddAfter'),
                          sub: say('jcAddAfterSub'), act: 'jobToPhotos' }));
      case 'close':
        return slot(btn({ act: 'jobClose', cls: 'btn-primary jc-big', mark: 'ok', label: say('jcClose'),
                          off: !gateReady(c) }));
      /* Issuing is Store's (#6) flow — v2-ux.md section 3.1 step 5 writes the
       * ledger, then the stock, then `partsUsed`, in that order, and this
       * screen owns none of those three. So the control HANDS OVER, carrying
       * this card's id: the store opens with THIS card already chosen and
       * never pre-selected from a list ([E] d738a6e). */
      case 'issue':
        return slot('<button type="button" class="btn btn-primary jc-big" data-act="jobIssue"'
          + ' data-card="' + esc(c.id) + '">' + draw('part', 20) + ' ' + esc(say('jcIssuePart')) + '</button>');
      /* The second signature, copy verbatim from foundation section 3.8. The
       * closer's row MUST NOT PRESS: a row that moves under the thumb and then
       * does nothing is the feedback failure inverted. It is a div, so it is
       * also not in the tab order. */
      case 'youClosed':
        return slot(row({ why: true, tone: 'warn', lead: draw('clock', 20), t: say('jobWaitingSignoff'),
                          sub: say('jobYouClosedIt') }));
      case 'verify':
        return slot(btn({ act: 'jobVerify', cls: 'btn-primary jc-big', mark: 'ok', label: say('jcSignOff') }));
      case 'waitOther':
        return slot(row({ why: true, tone: 'warn', lead: draw('clock', 20), t: say('jobWaitingSignoff'),
                          sub: say('jcWaitOther') }));
      case 'verified':
        return slot(row({ why: true, tone: 'ok', lead: draw('ok', 20), t: say('jcFinished'),
                          sub: say('jcFinishedSub', { closer: nameOf(v.users, c.closedBy), at: hhmm(c.closedAt),
                                                      verifier: nameOf(v.users, c.verifiedBy), vat: hhmm(c.verifiedAt) }) }));
      default: return '';
    }
  }

  function slot(inner) { return '<div class="jc-next">' + inner + '</div>'; }

  /* The mechanic's tap. The largest control on the screen and the ONLY
   * --accent fill on it, so it is the only orange thing a thumb can land on:
   * dirty hands, possibly gloved, in a pit, on a cracked phone, in bad light.
   * `jc-big` carries min-height: calc(var(--tap) + var(--s2)). */
  function tapButton(act, label) {
    return slot('<button type="button" class="btn btn-primary jc-big" data-act="' + act + '">'
      + draw('ok', 20) + ' ' + esc(label) + '</button>');
  }

  /* What the mechanic sees after the tap, in the slot the button was in.
   * UNPRESSABLE, not focusable, not in the tab order — on a Core 2 Duo a person
   * taps twice and the second tap must land on something that does not write.
   * There is no undo and no correction control for a mechanic, so the copy says
   * who fixes a mis-tap instead of pretending one is not possible. */
  function stampedRow(field, card) {
    var at = card ? card[field] : null;
    var t = field === 'startAt' ? say('jobStartedAt', { time: hhmm(at) }) : say('jobDoneAt', { time: hhmm(at) });
    return row({ why: true, tone: 'ok', lead: draw('ok', 20), t: t, sub: say('jobTellSupervisor') });
  }

  /* Block 4. The close gate, directly under the one next step, so it is never a
   * surprise at the end: "once the part is off the bus you can never take it
   * again". Unpressable — it is a statement of the requirement, not a control.
   * Not drawn once the card is closed. */
  function blockGate(v) {
    var c = v.card;
    if (c.status === 'done' || c.status === 'verified') return '';
    var b = (c.beforePhotos || []).length, a = (c.afterPhotos || []).length;
    if (gateReady(c)) {
      return row({ cls: 'jc-gate', lead: draw('ok', 20), t: say('jcGateReady'),
                   sub: c.externalVendor ? say('jcGateVendorSub') : say('jcGateReadySub'), tone: 'ok' });
    }
    var sub = (b === 0 && a === 0)
      ? say('jcGateNone')
      : say('jcGateNeedSub', { before: b, after: Math.max(PHOTOS_NEEDED - a, 0) });
    return row({ cls: 'jc-gate', lead: draw('camera', 20), t: say('jcGateNeed'), sub: sub, tone: 'warn' });
  }

  // Block 5. Fault and priority.
  function blockFault(v) {
    var c = v.card;
    var p = c.priority === 'high' ? badge('bad', 'warn', say('jcPrioHigh'))
      : c.priority === 'low' ? badge('ok', 'ok', say('jcPrioLow'))
        : badge('warn', 'clock', say('jcPrioMedium'));
    return card_('', '<p class="jc-fault">' + esc(c.problem || '') + '</p><p class="jc-prio">' + p + '</p>');
  }

  // Block 6. Crew and their tasks.
  function blockCrew(v) {
    var c = crew(v.card);
    if (!c.length) return card_(esc(say('jcCrewHead')), emptyLine(say('jcNoCrew')));
    var out = '';
    for (var i = 0; i < c.length; i++) {
      out += row({ lead: draw('person', 20), t: nameOf(v.users, c[i].userId) + (c[i].task ? ' — ' + c[i].task : '') });
    }
    return card_(esc(say('jcCrewHead')), out);
  }

  /* Block 7. The four times and the gaps between them.
   *
   * THE GAP IS THE INFORMATION — a bus that waited eleven hours before anybody
   * touched it is the finding, and four bare timestamps hide it. There is no
   * element here that is four time inputs: a missing time is a ROW that opens
   * ONE sheet with ONE field, which is how "the card asks for one time, not
   * four" is enforced at the markup level rather than in a comment. */
  var TIMES = [
    { field: 'enterAt', has: 'jcTimeEnter', miss: 'jcMissEnter' },
    { field: 'startAt', has: 'jcTimeStart', miss: 'jcMissStart' },
    { field: 'completeAt', has: 'jcTimeDone', miss: 'jcMissDone' },
    { field: 'outAt', has: 'jcTimeOut', miss: 'jcMissOut' }
  ];

  function gapFor(field, c) {
    if (field === 'startAt' && c.startAt != null) {
      if (c.enterAt == null) return { text: say('jcGapNoEnter'), warn: true };
      return { text: say('jcGapWait', { dur: durWords(c.startAt - c.enterAt) }), warn: c.startAt < c.enterAt };
    }
    if (field === 'completeAt' && c.completeAt != null) {
      if (c.startAt == null) return null;
      if (c.completeAt < c.startAt) return { text: say('jcGapNegative'), warn: true };
      return { text: say('jcGapWorked', { dur: durWords(c.completeAt - c.startAt) }), warn: false };
    }
    if (field === 'outAt' && c.outAt != null) {
      if (c.completeAt == null) return null;
      if (c.outAt < c.completeAt) return { text: say('jcGapNegative'), warn: true };
      return { text: say('jcGapStood', { dur: durWords(c.outAt - c.completeAt) }), warn: false };
    }
    return null;
  }

  function blockTimes(v) {
    var c = v.card, out = '', i;
    for (i = 0; i < TIMES.length; i++) {
      var T = TIMES[i], val = c[T.field];
      var change = v.mayEditTimes
        ? '<span class="jc-chg">' + draw('edit', 14) + ' ' + esc(say('jcChange')) + '</span>' : '';
      if (val == null) {
        // Not an empty field: a row, with one sheet behind it.
        out += row({ lead: draw('clock', 20), t: say(T.miss), sub: say('jcTapToAdd'), tone: 'warn',
                     trail: fig(null), act: v.mayEditTimes ? 'jobTime' : null,
                     extra: v.mayEditTimes ? ' data-field="' + T.field + '"' : '' });
        continue;
      }
      var gap = gapFor(T.field, c);
      out += row({ lead: draw('clock', 20), t: say(T.has, { time: hhmm(val) }),
                   sub: gap ? gap.text : '', cls: gap && gap.warn ? 'jc-gapwarn' : '',
                   trail: change, act: v.mayEditTimes ? 'jobTime' : null,
                   extra: v.mayEditTimes ? ' data-field="' + T.field + '"' : '' });
    }
    return card_(esc(say('jcTimesHead')), out, 'jc-times');
  }

  /* Block 8. Odometer.
   *
   * Unknown, zero and stale are three different figures. 0 is a REAL value
   * here: inventory/03 section 3.2 says all 89 seeded buses carry 0 until
   * capture and section 3.1 says 0 means the odometer is broken. So an unknown
   * reading is figure(null) plus "Not read yet"; a real 0 is "0 km" plus
   * "Odometer is broken".
   *
   * The control is DISABLED and not absent on a verified card, which is the one
   * place that is the honest word: the server freezes it and the reason is the
   * card's state, not this person's role. Absent says "not for you"; disabled
   * with the card's badge beside it says "not any more". */
  function blockOdo(v) {
    var c = v.card, known = c.odometer != null;
    var trail = '<button type="button" class="btn btn-quiet" data-act="jobOdo"'
      + (c.status === 'verified' ? ' aria-disabled="true"' : '') + '>'
      + draw('edit', 14) + ' ' + esc(say('jcChange')) + '</button>';
    var body = known
      ? row({ lead: draw('count', 20), t: root.fmt.km(c.odometer),
              sub: c.odometer === 0 ? say('jcOdoBroken') : say('jcOdoWhen'), trail: trail })
      // The dash itself, through figure(): an unknown reading and a real 0 must
      // never look alike, and formatting first is how the second becomes the first.
      : row({ lead: draw('count', 20), t: fig(null), rawT: true,
              sub: say('jcOdoNotRead'), trail: trail });
    return card_(esc(say('jcOdoHead')), body);
  }

  // Forward only, with the number named. Never blames the reader.
  function odoError(next, last) {
    if (last == null || next == null) return null;
    if (Number(next) >= Number(last)) return null;
    return say('jcOdoLower', { last: root.fmt.km(last) });
  }

  /* Block 9. Parts down, with the store's ledger behind each line.
   *
   * `partsUsed` is THE ONE FIELD THE SERVER MERGES (`_merge_parts_used`), so it
   * is the one block on this card that may legitimately change under a reader
   * while they are looking at it — which is why this heading, and only this
   * heading, carries its own age. */
  function blockParts(v) {
    var used = v.card.partsUsed || [];
    var head = esc(say('jcPartsHead', { age: ageWords(v.at) }));
    if (!used.length) return card_(head, emptyLine(say('jcNoParts')));
    var out = '', n = Math.min(used.length, YARD_CAP), i;
    for (i = 0; i < n; i++) {
      var p = used[i];
      out += row({ lead: draw('part', 20), t: partName(v.parts, p.partId) + ' x' + (p.qty == null ? '' : p.qty),
                   sub: p.by ? say('jcIssuedBy', { who: nameOf(v.users, p.by), time: hhmm(p.at) }) : '',
                   trail: fig(p.cost, { format: root.fmt.rupees, stale: v.stale }),
                   act: 'jobLedger', extra: ' data-part="' + esc(p.partId) + '"' });
    }
    if (used.length > n) out += row({ t: say('jcSeeAll', { shown: n, total: used.length }), act: 'jobAllParts' });
    return card_(head, out);
  }

  // Block 10. Part requests, and the mechanic's third control.
  function blockRequests(v) {
    var reqs = v.card.partRequests || [], out = '', i;
    for (i = 0; i < reqs.length && i < YARD_CAP; i++) {
      var r = reqs[i], done = r.status === 'fulfilled';
      out += row({ lead: '<span class="' + (done ? 'jc-ok' : 'jc-warn') + '">' + draw('part', 20) + '</span>',
                   t: partName(v.parts, r.partId) + ' x' + (r.qty == null ? '' : r.qty),
                   sub: done ? say('jcIssuedBy', { who: nameOf(v.users, r.by), time: hhmm(r.at) })
                     : say('jcReqWaiting', { time: hhmm(r.at) }) });
    }
    if (!out) out = emptyLine(say('jcNoRequests'));
    if (v.mayRequest) {
      out += btn({ act: 'jobRequest', cls: 'jc-wide', mark: 'add', label: say('jobNeedPart') });
    }
    return card_(esc(say('jcRequestsHead')), out);
  }

  // Block 11. Old parts returned. Read-only for every role: a core return is a
  // store action.
  function blockCores(v) {
    var list = v.card.coreReturns || [], out = '', i;
    for (i = 0; i < list.length && i < YARD_CAP; i++) {
      var r = list[i];
      var lead = r.photo
        ? '<img class="jc-thumb" src="' + esc(r.photo) + '" alt="" referrerpolicy="no-referrer">'
        : draw('part', 20);
      out += row({ lead: lead, t: partName(v.parts, r.partId),
                   sub: say('jcCoreSub', { time: hhmm(r.at), who: nameOf(v.users, r.by) }),
                   act: r.photo ? 'jobCorePhoto' : null, extra: r.photo ? ' data-photo="' + esc(r.photo) + '"' : '' });
    }
    if (!out) out = emptyLine(say('jcNoCores'));
    return card_(esc(say('jcCoresHead')), out);
  }

  /* Block 12. Photos.
   *
   * EMPTY IS NOT emptyState(). It is the capture control plus the requirement
   * in words: the gate IS the content. After the close the capture cell is
   * absent — not disabled — and the grid says the photos are fixed. A mechanic
   * gets the tiles and no capture control: they can look at the before photos,
   * which is often what they need, and v2-ux.md section 3.2 gives them no photo
   * requirement, so a control they may not use is not drawn. */
  function blockPhotos(v) {
    var c = v.card;
    var closed = c.status === 'done' || c.status === 'verified';
    var capture = v.mayCapture && !closed;
    var grid = function (list, headId, name) {
      var items = list || [];
      return '<h3 class="jc-subhead">' + esc(say(headId, { n: items.length })) + '</h3>'
        + (typeof root.photoGrid === 'function'
          ? root.photoGrid(items, { capture: capture, label: say('jcTakePhoto'), name: name })
          : '');
    };
    var note = closed ? '<p class="jc-note">' + esc(say('jcPhotoFixed')) + '</p>'
      : (!gateReady(c) ? '<p class="jc-note">' + esc(say('jcPhotoNeed')) + '</p>' : '');
    return card_(esc(say('jcPhotosHead')),
                 grid(c.beforePhotos, 'jcBefore', 'before') + grid(c.afterPhotos, 'jcAfter', 'after') + note,
                 'jc-photos');
  }

  /* Block 13. Outside vendor and the printable gate pass. Absent without
   * `outsideJob` — the pass was one of the six recorded route bypasses
   * (`inventory/02 section 6.1` rows 5 and 6: the gate-pass list and a single
   * pass were reachable by any role), so its absence here is a fix. */
  function blockVendor(v) {
    var c = v.card;
    if (!c.externalVendor || !v.mayOutside) return '';
    var body = '<p class="jc-fault">' + esc(c.externalVendor) + '</p>'
      + row({ lead: draw('money', 20), t: '', rawT: true, trail: fig(c.externalCost, { format: root.fmt.rupees }) });
    if (c.outside) body += row({ lead: draw('map', 20), t: say('jcVendorAt', { place: c.outsidePlace || '' }) });
    if (c.gatePassNo) {
      body += btn({ act: 'jobPass', cls: 'jc-wide', mark: 'doc', label: say('jcGatePass', { no: c.gatePassNo }) });
    }
    return card_(esc(say('jcVendorHead')), body);
  }

  /* Block 14. The card's own actions. Every control ABSENT when not held — and
   * "Sign off" is here as well as in slot 3 for the eligible second person,
   * because block 14 is where a reader who scrolled the whole card ends up. It
   * is the SAME control, absent under the same condition. For the closer, block
   * 14 has no verify entry at all: no row, no greyed button, nothing. */
  function blockActions(v) {
    var c = v.card, out = '';
    if (v.mayClose && c.status !== 'done' && c.status !== 'verified') {
      out += btn({ act: 'jobClose', cls: 'jc-wide', mark: 'ok', label: say('jcClose'), off: !gateReady(c) });
    }
    if (v.mayVerify) out += btn({ act: 'jobVerify', cls: 'btn-primary jc-wide', mark: 'ok', label: say('jcSignOff') });
    // The server only lets the owner move a VERIFIED card.
    if (v.mayMove && c.status === 'verified') {
      out += btn({ act: 'jobMove', cls: 'jc-wide', mark: 'bus', label: say('jcMoveBus') });
    }
    if (v.mayDelete) out += btn({ act: 'jobDelete', cls: 'btn-danger jc-wide', mark: 'bad', label: say('jcDeleteCard') });
    return out ? '<div class="jc-actions">' + out + '</div>' : '';
  }

  /* ====================================================================== *
   * model + render
   * ====================================================================== */

  function model(m) {
    register();
    var me = (m && m.user) || null;
    var id = m && m.params ? m.params.id : null;
    var list = rows(m, 'jobcards');
    var loading = !(m && m.cache) || m.cache.jobcards === undefined;
    var c = byId(list, id);

    /* THE GUARD RUNS BEFORE ANY FIELD OF THE CARD IS READ. Not after the
     * markup, not beside it: a card this person may not open never becomes a
     * view model at all. */
    if (!loading && c && !guard(c, me)) return { ok: false, reason: 'guard', loading: false };
    if (loading) return { ok: false, reason: 'loading', loading: true };
    if (!c) return { ok: false, reason: 'missing', loading: false };

    var role = String(me.role);
    var isMech = role === 'mechanic';
    return {
      ok: true, card: c, me: me, role: role, isMech: isMech,
      users: rows(m, 'users'), buses: rows(m, 'buses'), parts: rows(m, 'parts'),
      density: (m && m.density) || 'yard',
      offline: !!(m && m.offline), stale: !!(m && m.stale),
      at: lastSyncAt(),
      step: nextStep(c, me),
      // Every one of these is "absent, not disabled" at the markup level, and
      // each is the ONE place its block's absence is stated.
      mayEditTimes: !isMech && role !== 'store',
      mayOdo: !isMech && role !== 'store',
      mayCapture: !isMech && role !== 'store',
      // The close gate is the close's explanation, so it goes where the close
      // can go. A mechanic cannot close and is not asked to read the gate.
      mayGate: !isMech,
      mayCores: !isMech,
      mayRequest: isMech || can(role, 'requestPart'),
      mayOutside: can(role, 'outsideJob'),
      mayClose: mayClose(role),
      mayVerify: mayVerify(c, me),
      mayMove: mayMove(role),
      mayDelete: can(role, 'deleteJob')
    };
  }

  function refusal(v) {
    if (v.loading) {
      return '<div class="jc">' + (typeof root.skeleton === 'function' ? root.skeleton(6) : '') + '</div>';
    }
    /* A card a mechanic may not open and a card that is not on this phone get
     * the SAME answer, deliberately. v2-ux.md section 4.3 and screens-work.md
     * section 2.4 both forbid a "you cannot see this" screen: a control or a
     * screen a person may not use is absent, and absent means indistinguishable
     * from not there. Telling a mechanic "this card exists and is somebody
     * else's" is a fact about the board they were narrowed out of. */
    var back = '<button type="button" class="btn btn-quiet" data-nav="jobs">'
      + draw('back', 16) + ' ' + esc(say('jcBackToJobs')) + '</button>';
    var body = typeof root.errorState === 'function' ? root.errorState(say('jcNotOnPhone')) : '';
    return '<div class="jc">' + body + back + '</div>';
  }

  function render(m) {
    var v = model(m);
    if (!v.ok) return refusal(v);

    /* ONE layout, and every block that is not everybody's is gated by its OWN
     * flag — deny by default, per block. A second shape for the mechanic would
     * be the same rule written twice: the flag would say "no odometer" and the
     * layout would say it again, and a mutation that broke one of them would
     * leave the other standing and the check green. So there is one statement
     * per absence, and it is the flag.
     *
     * A mechanic therefore sees blocks 1, 2, 3, 5, 6, 7, 9, 10 and 12 and
     * nothing else: no close gate, no odometer, no old-part returns, no vendor,
     * no actions at all. Everything else on their card is read-only
     * (v2-ux.md section 3.2). */
    var top = blockId(v) + blockFresh(v) + blockNext(v) + (v.mayGate ? blockGate(v) : '');
    var left = blockFault(v) + blockCrew(v) + blockTimes(v) + (v.mayOdo ? blockOdo(v) : '');
    var right = blockParts(v) + blockRequests(v) + (v.mayCores ? blockCores(v) : '')
      + blockPhotos(v) + blockVendor(v);
    var actions = blockActions(v);

    // One string, one insert. Two columns at desk is CSS's; the markup is one
    // shape, so a supervisor opening the desk screen on a 360px phone keeps one
    // column and the bottom bar.
    return '<div class="jc" data-role="' + esc(v.role) + '">' + top
      + '<div class="jc-cols"><div class="jc-col">' + left + '</div>'
      + '<div class="jc-col">' + right + '</div></div>' + actions + '</div>';
  }

  /* ====================================================================== *
   * THE WRITES. Each one reads the stored card, sets only the fields it owns,
   * and puts the rest back untouched. Never a whole-card form.
   * ====================================================================== */

  async function stored(id) {
    var d = db();
    if (!d) return null;
    try { return await d.get('jobcards', id); } catch (e) { return null; }
  }

  /* The mechanic's two taps. ONE field, nothing else.
   *
   * Returns null when the field is already set — the handler's first line, so
   * the second tap of a double tap writes nothing even before the button has
   * been replaced. `status` is NOT touched: `done` is a close, a close needs
   * owner or supervisor and the photo gate, and a mechanic's push that set
   * `status` would be refused by the server. `assignees` is not touched either
   * (the server carries the stored crew over whatever the push says). */
  async function stamp(field, id) {
    if (field !== 'startAt' && field !== 'completeAt') return null;
    var c = await stored(id);
    if (!c) return null;
    if (c[field] != null) return null;
    c[field] = Date.now();
    c.updatedAt = Date.now();
    try { await db().put('jobcards', c); } catch (e) { return null; }
    return c;
  }

  /* Sign-off. Refused here when the reader closed the card, so the client never
   * offers the write the server answers "you closed this job — someone else
   * must verify it" to. Three fields and nothing else. */
  async function verify(id, me) {
    var c = await stored(id);
    if (!c || !mayVerify(c, me)) return null;
    c.status = 'verified';
    c.verifiedBy = me.id;
    c.verifiedAt = Date.now();
    c.updatedAt = Date.now();
    try { await db().put('jobcards', c); } catch (e) { return null; }
    return c;
  }

  /* The close. Refused here when the gate is short or the role does not hold
   * it: 36e7eee is the live defect where the close button opened for a
   * mechanic, the phone wrote `done` and the server then refused. `closedBy` is
   * server truth and is deliberately NOT sent. */
  async function close(id, me) {
    var c = await stored(id);
    if (!c || !me || !mayClose(me.role)) return null;
    if (!gateReady(c)) return null;
    if (c.status === 'done' || c.status === 'verified') return null;
    c.status = 'done';
    c.closedAt = Date.now();
    c.updatedAt = Date.now();
    try { await db().put('jobcards', c); } catch (e) { return null; }
    return c;
  }

  /* One field from one sheet, with the stale-save guard.
   *
   * NO DIALOG ABOUT A CONFLICT and no timestamp as a tie-break: if the stored
   * card's `updatedAt` moved between the sheet opening and its save, the person
   * is asked once, in words, whether their version replaces the other one.
   * "Look first" closes without writing. This is a client-only guard on an
   * unreliable clock and screens-work.md section 9.4 item 3 says so. */
  async function saveField(id, field, value, openedAt) {
    var c = await stored(id);
    if (!c) return null;
    if (openedAt != null && c.updatedAt != null && c.updatedAt !== openedAt) {
      var v = V();
      var ok = v && typeof v.confirmDialog === 'function'
        ? await v.confirmDialog(say('jcChangedBody'), { title: say('jcChangedTitle'),
                                                        yes: say('jcSaveMine'), no: say('jcLookFirst') })
        : false;
      if (!ok) return null;
      c = await stored(id);
      if (!c) return null;
    }
    c[field] = value;
    c.updatedAt = Date.now();
    try { await db().put('jobcards', c); } catch (e) { return null; }
    return c;
  }

  /* ====================================================================== *
   * the sheets. Each is a markup string, so each is node-testable.
   * ====================================================================== */

  var TIME_TITLE = { enterAt: 'jcSheetEnter', startAt: 'jcSheetStart',
                     completeAt: 'jcSheetDone', outAt: 'jcSheetOut' };

  /* ONE field. type="time" is inside Chrome 109 and gives the office PC a
   * keyboard entry and the phone a wheel, which is the right split without a
   * line of script. The day is read-only text from the card, not a second
   * field: four empty time fields presented as a form is forbidden, and so is
   * two. */
  function timeSheet(field, card) {
    var day = card && card.jobDate ? card.jobDate : (card && card.enterAt ? dayOf(card.enterAt) : '');
    return '<form class="jc-sheet" data-sheet="time" data-field="' + esc(field) + '"'
      + ' data-card="' + esc(card ? card.id : '') + '"'
      + ' data-opened="' + esc(card && card.updatedAt != null ? card.updatedAt : '') + '">'
      + '<p class="jc-note">' + esc(say('jcSheetDay')) + ' ' + esc(day) + '</p>'
      + '<label class="num"><span class="num-l">' + esc(say(TIME_TITLE[field])) + '</span>'
      + '<input class="field" type="time" enterkeyhint="done" data-field="' + esc(field) + '"></label>'
      + btn({ act: 'jobTimeSave', cls: 'btn-primary jc-wide', label: say('jcSave') })
      + '</form>';
  }

  function dayOf(ms) {
    var d = new Date(Number(ms));
    if (isNaN(d.getTime())) return '';
    var mo = d.getMonth() + 1, da = d.getDate();
    return d.getFullYear() + '-' + (mo < 10 ? '0' : '') + mo + '-' + (da < 10 ? '0' : '') + da;
  }

  /* The odometer. NEVER pre-filled, with 0 or with the last reading: a default
   * on an odometer is a wrong reading nobody typed, and 0 is a real value here.
   * type="text" with inputmode, never type="number" — a number input changes
   * its value when the mouse wheel rolls over it. */
  function odoSheet(card, last) {
    return '<form class="jc-sheet" data-sheet="odo" data-card="' + esc(card ? card.id : '') + '"'
      + ' data-last="' + esc(last == null ? '' : last) + '"'
      + ' data-opened="' + esc(card && card.updatedAt != null ? card.updatedAt : '') + '">'
      + '<label class="num"><span class="num-l">' + esc(say('jcOdoLabel')) + '</span>'
      + '<input class="field num-in" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off"'
      + ' enterkeyhint="done" data-kind="whole" data-field="odometer">'
      + '<span class="num-h">' + esc(last == null ? '' : root.fmt.km(last)) + '</span></label>'
      + btn({ act: 'jobOdoSave', cls: 'btn-primary jc-wide', label: say('jcSave') })
      + '</form>';
  }

  /* "I need a part" is the mechanic's third control and it is NOT one of the
   * two taps: it needs two values, and DECISIONS.md section 6 grants the
   * mechanic two ONE-TAP writes. It writes `partRequests` only. */
  function requestSheet(card, parts) {
    var opts = '<option value="" disabled>' + esc(say('jcChoosePart')) + '</option>', i;
    for (i = 0; i < (parts || []).length; i++) {
      opts += '<option value="' + esc(parts[i].id) + '">' + esc(parts[i].name || parts[i].id) + '</option>';
    }
    return '<form class="jc-sheet" data-sheet="request" data-card="' + esc(card ? card.id : '') + '">'
      + '<label class="num"><span class="num-l">' + esc(say('jcPartSearch')) + '</span>'
      + '<select class="select" data-field="partId">' + opts + '</select></label>'
      + '<label class="num"><span class="num-l">' + esc(say('jcQty')) + '</span>'
      + '<input class="field num-in" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off"'
      + ' enterkeyhint="done" data-kind="whole" data-field="qty"></label>'
      + btn({ act: 'jobRequestSave', cls: 'btn-primary jc-wide', label: say('jcSave'), off: true })
      + '</form>';
  }

  /* Putting somebody on the job. One select, and it writes the two crew fields
   * together so a v1 device reading either one sees the same answer — `crew()`
   * above is what reads them back, and it prefers `assignees`. */
  function crewSheet(card, users) {
    var opts = '<option value="">' + esc(say('jcNoCrew')) + '</option>', i;
    for (i = 0; i < (users || []).length; i++) {
      if (users[i].role !== 'mechanic') continue;
      opts += '<option value="' + esc(users[i].id) + '">' + esc(users[i].name || users[i].id) + '</option>';
    }
    return '<form class="jc-sheet" data-sheet="crew" data-card="' + esc(card ? card.id : '') + '"'
      + ' data-opened="' + esc(card && card.updatedAt != null ? card.updatedAt : '') + '">'
      + '<label class="num"><span class="num-l">' + esc(say('jcCrewHead')) + '</span>'
      + '<select class="select" data-field="crew">' + opts + '</select></label>'
      + btn({ act: 'jobCrewSave', cls: 'btn-primary jc-wide', label: say('jcSave') })
      + '</form>';
  }

  /* Moving a verified card to another bus. The server only lets the owner do
   * it, and only on a verified card, so both halves are already in the
   * controls above; this is the picker and the confirmation naming both buses. */
  function moveSheet(card, buses) {
    var opts = '<option value="" disabled>' + esc(say('jcMoveBus')) + '</option>', i;
    for (i = 0; i < (buses || []).length; i++) {
      if (buses[i].id === (card && card.busId)) continue;
      opts += '<option value="' + esc(buses[i].id) + '">' + esc(buses[i].regNo || buses[i].id) + '</option>';
    }
    return '<form class="jc-sheet" data-sheet="move" data-card="' + esc(card ? card.id : '') + '">'
      + '<label class="num"><span class="num-l">' + esc(say('jcMoveBus')) + '</span>'
      + '<select class="select" data-field="busId">' + opts + '</select></label>'
      + btn({ act: 'jobMoveSave', cls: 'btn-primary jc-wide', label: say('jcSave') })
      + '</form>';
  }

  /* The ledger behind one part line. The ledger is the source the app uses to
   * heal `partsUsed`, so it is the truth and the card's line is the summary —
   * and the sheet says that in one line rather than leaving the reader to
   * wonder which number is real. */
  function ledgerSheet(line, card, ledger, parts) {
    var out = '', i;
    for (i = 0; i < (ledger || []).length; i++) {
      var L = ledger[i];
      if (!L || L.jobId !== (card && card.id) || L.partId !== line.partId) continue;
      out += row({ lead: draw('part', 20), t: partName(parts, L.partId) + ' x' + (L.qty == null ? '' : L.qty),
                   sub: say('jcIssuedBy', { who: L.by || '', time: hhmm(L.at) }),
                   trail: fig(L.cost, { format: root.fmt.rupees }) });
    }
    return '<div class="jc-sheet">' + (out || emptyLine(say('jcNoParts')))
      + '<p class="jc-note">' + esc(say('jcLedgerNote')) + '</p></div>';
  }

  /* ====================================================================== *
   * ONE delegated listener (section 3.14).
   * ====================================================================== */

  var handler = null;

  function mount() {
    if (handler) return handler;                 // one listener, however many mounts
    handler = onClick;
    if (root.document && typeof root.document.addEventListener === 'function') {
      root.document.addEventListener('click', handler);
    }
    return handler;
  }

  function onClick(ev) {
    var t = ev && ev.target;
    if (!t || typeof t.closest !== 'function') return;

    /* THE EARLY RETURN, before [data-act] is read. A count field inside a
     * pressable row threw the storekeeper off the screen mid-count; this screen
     * holds the odometer, a request quantity and a label-wrapped file input. */
    if (t.closest('input, select, textarea, label, .num')) return;

    var el = t.closest('[data-act]');
    if (!el) return;
    var act = el.getAttribute('data-act');
    if (act === 'jobStart') return tap(el, 'startAt');
    if (act === 'jobDone') return tap(el, 'completeAt');
    if (act === 'jobVerify') return signOff(el);
    if (act === 'jobClose') return closeCard(el);
    if (act === 'jobDelete') return askDelete(el);
    if (act === 'jobTime') return openTime(el);
    if (act === 'jobOdo') return openOdo(el);
    if (act === 'jobRequest') return openRequest();
    if (act === 'jobIssue') return handOverToStore(el);
    if (act === 'jobCrew') return openCrew();
    if (act === 'jobMove') return openMove();
    if (act === 'jobLedger') return openLedger(el);
    if (act === 'jobAllParts') return openAllParts();
    if (act === 'jobCorePhoto') return openCorePhoto(el);
    if (act === 'jobToPhotos') return toPhotos();
    if (act === 'jobPass') return openPass();
    if (act === 'jobPrint') return printPass();
    if (act === 'jobTimeSave') return saveTime(el);
    if (act === 'jobOdoSave') return saveOdo(el);
    if (act === 'jobRequestSave') return saveRequest(el);
    if (act === 'jobCrewSave') return saveCrew(el);
    if (act === 'jobMoveSave') return saveMove(el);
  }

  function cached(name) { return (root.S && root.S.cache && root.S.cache[name]) || []; }
  function currentCard() { return byId(cached('jobcards'), here()); }

  function sheet(title, html) {
    var v = V();
    if (v && typeof v.openSheet === 'function') v.openSheet(title, html);
  }

  function openTime(el) {
    if (el.getAttribute('aria-disabled') === 'true') return;
    var c = currentCard();
    var f = el.getAttribute('data-field');
    if (c && f) sheet(say(TIME_TITLE[f]), timeSheet(f, c));
  }

  // Disabled on a verified card: the server freezes it and the reason is the
  // card's state, not this person's role.
  function openOdo(el) {
    if (el.getAttribute('aria-disabled') === 'true') return;
    var c = currentCard();
    if (c) sheet(say('jcOdoHead'), odoSheet(c, lastOdo(c)));
  }

  /* The forward-only floor: the newest odometer reading this phone holds for
   * this bus, which is the bus's own and not this card's. */
  function lastOdo(c) {
    var b = byId(cached('buses'), c.busId);
    var best = b && b.odometer != null ? Number(b.odometer) : null;
    var cards = cached('jobcards'), i;
    for (i = 0; i < cards.length; i++) {
      var j = cards[i];
      if (!j || j.busId !== c.busId || j.id === c.id || j.odometer == null) continue;
      if (best == null || Number(j.odometer) > best) best = Number(j.odometer);
    }
    return best;
  }

  function openRequest() {
    var c = currentCard();
    if (c) sheet(say('jobNeedPart'), requestSheet(c, cached('parts')));
  }

  function openCrew() {
    var c = currentCard();
    if (c) sheet(say('jcCrewHead'), crewSheet(c, cached('users')));
  }

  function openMove() {
    var c = currentCard();
    if (c) sheet(say('jcMoveBus'), moveSheet(c, cached('buses')));
  }

  // Store (#6) owns the write; this carries the card so the store's own sheet
  // opens against it instead of asking which job.
  function handOverToStore(el) {
    if (root.Router && root.Router.go) root.Router.go('store', { jobId: el.getAttribute('data-card') });
  }

  function openAllParts() {
    var c = currentCard();
    if (!c) return;
    var used = c.partsUsed || [], out = '', i;
    for (i = 0; i < used.length; i++) {
      out += row({ lead: draw('part', 20),
                   t: partName(cached('parts'), used[i].partId) + ' x' + (used[i].qty == null ? '' : used[i].qty),
                   trail: fig(used[i].cost, { format: root.fmt.rupees }) });
    }
    sheet(say('jcPartsHead', { age: ageWords(lastSyncAt()) }), '<div class="jc-sheet">' + out + '</div>');
  }

  function openCorePhoto(el) {
    var src = el.getAttribute('data-photo');
    if (src && root.V2 && typeof root.V2.openPhoto === 'function') root.V2.openPhoto(src, '');
  }

  /* The photos block is on the page already; this is a scroll, not a route. The
   * gate line said what was missing, so the person is not being told something
   * new — they are being taken to it. */
  function toPhotos() {
    var d = root.document;
    var el = d && d.querySelector ? d.querySelector('.jc-photos') : null;
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'start' });
  }

  // Printing is the browser's, and the @media print block in work.css is what
  // makes the result an A4 sheet with a number on it.
  function printPass() {
    if (typeof root.print === 'function') root.print();
  }

  async function saveCrew(el) {
    if (el.getAttribute('aria-disabled') === 'true') return;
    var v = vals('crew');
    if (!v || !v._card || !v.crew) return;
    el.setAttribute('aria-disabled', 'true');
    if ('textContent' in el) el.textContent = say('jcSaving');
    var c = await stored(v._card);
    if (!c) { el.removeAttribute('aria-disabled'); return; }
    c.assignees = [{ userId: String(v.crew), task: '' }];
    c.assignedTo = String(v.crew);
    c.updatedAt = Date.now();
    try { await db().put('jobcards', c); } catch (e) { el.removeAttribute('aria-disabled'); return; }
    if (V() && V().closeSheet) V().closeSheet();
    redraw();
  }

  /* Behind a confirmation naming BOTH buses, because the cost of a repair moves
   * with the card and the person has to see which two records change. */
  async function saveMove(el) {
    var v = vals('move');
    if (!v || !v._card || !v.busId) return;
    var c = await stored(v._card), me = who();
    if (!c || !me || !mayMove(me.role) || c.status !== 'verified') return;
    var from = regOf(cached('buses'), c.busId), to = regOf(cached('buses'), v.busId);
    var ov = V();
    var ok = ov && typeof ov.confirmDialog === 'function'
      ? await ov.confirmDialog(from + ' \u2192 ' + to, { title: say('jcMoveBus'), yes: say('jcSave') })
      : false;
    if (!ok) return;
    c.busMoves = (c.busMoves || []).concat([{ from: c.busId, to: String(v.busId), by: me.id,
                                              at: Date.now(), reason: '' }]);
    c.busId = String(v.busId);
    c.updatedAt = Date.now();
    try { await db().put('jobcards', c); } catch (e) { return; }
    if (ov && ov.closeSheet) ov.closeSheet();
    redraw();
  }

  function openLedger(el) {
    var c = currentCard(), pid = el.getAttribute('data-part');
    if (!c || !pid) return;
    sheet(partName(cached('parts'), pid),
          ledgerSheet({ partId: pid }, c, cached('ledger'), cached('parts')));
  }

  /* The gate pass. Printing is a @media print block in v2/ui/work.css, not a
   * second layout and not a window: the gatekeeper gets an A4 sheet with a
   * number on it, which is what a gate pass is. It works offline. */
  function openPass() {
    var c = currentCard();
    if (!c) return;
    var p = byId(cached('gatepasses'), c.gatePassId) || { no: c.gatePassNo };
    var b = byId(cached('buses'), c.busId) || {};
    sheet(say('jcGatePass', { no: p.no == null ? '' : p.no }),
          '<div class="jc-pass">'
          + row({ lead: draw('bus', 20), t: (b.regNo || '') + (b.chassis ? ' · ' + b.chassis : '') })
          + row({ lead: draw('doc', 20), t: c.externalVendor || '' })
          + row({ lead: draw('part', 20), t: p.unit || '' })
          + btn({ act: 'jobPrint', cls: 'jc-wide', mark: 'doc', label: say('jcPrintPass') })
          + '</div>');
  }

  /* One form, read once. Every sheet owns the fields it names and nothing else,
   * so the rest of the card goes back untouched. */
  function vals(kind) {
    var d = root.document;
    var form = d && d.querySelector ? d.querySelector('[data-sheet="' + kind + '"]') : null;
    if (!form || !form.querySelectorAll) return null;
    var nodes = form.querySelectorAll('[data-field]'), out = {}, i;
    for (i = 0; i < nodes.length; i++) out[nodes[i].getAttribute('data-field')] = nodes[i].value;
    out._card = form.getAttribute('data-card');
    out._opened = form.getAttribute('data-opened');
    out._last = form.getAttribute('data-last');
    return out;
  }

  /* HH:MM on the card's own day, as milliseconds. A time later than now is an
   * error in words, naming the clock it was compared against. */
  function timeMs(day, hm) {
    if (!hm || !/^\d{1,2}:\d{2}/.test(hm)) return null;
    var parts = hm.split(':');
    var base = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(day + 'T00:00:00') : new Date();
    base.setHours(Number(parts[0]), Number(parts[1]), 0, 0);
    var t = base.getTime();
    return isNaN(t) ? null : t;
  }

  async function saveTime(el) {
    if (el.getAttribute('aria-disabled') === 'true') return;
    var v = vals('time');
    if (!v || !v._card) return;
    var field = null, k;
    for (k in TIME_TITLE) if (Object.prototype.hasOwnProperty.call(v, k)) field = k;
    if (!field) return;
    var c = await stored(v._card);
    if (!c) return;
    var ms = timeMs(c.jobDate || dayOf(c.enterAt || Date.now()), v[field]);
    if (ms == null) return;
    if (ms > Date.now()) { toast(say('jcSheetTimeLater', { now: hhmm(Date.now()) }), 'bad'); return; }
    el.setAttribute('aria-disabled', 'true');
    if ('textContent' in el) el.textContent = say('jcSaving');
    var out = await saveField(v._card, field, ms, v._opened === '' ? null : Number(v._opened));
    el.removeAttribute('aria-disabled');
    if (!out) return;
    if (V() && V().closeSheet) V().closeSheet();
    redraw();
  }

  async function saveOdo(el) {
    if (el.getAttribute('aria-disabled') === 'true') return;
    var v = vals('odo');
    if (!v || !v._card) return;
    if (v.odometer === '' || v.odometer == null) return;
    var n = Number(v.odometer);
    if (!isFinite(n) || n < 0) return;
    var err = odoError(n, v._last === '' ? null : Number(v._last));
    if (err) { toast(err, 'bad'); return; }
    el.setAttribute('aria-disabled', 'true');
    if ('textContent' in el) el.textContent = say('jcSaving');
    var out = await saveField(v._card, 'odometer', n, v._opened === '' ? null : Number(v._opened));
    el.removeAttribute('aria-disabled');
    if (!out) return;
    if (V() && V().closeSheet) V().closeSheet();
    redraw();
  }

  /* `partRequests` only — which the server permits a mechanic to do and has no
   * rule against. It is a sheet and not a tap because it needs two values, and
   * DECISIONS.md section 6 grants the mechanic two ONE-TAP writes. */
  async function saveRequest(el) {
    if (el.getAttribute('aria-disabled') === 'true') return;
    var v = vals('request');
    if (!v || !v._card || !v.partId) return;
    var qty = Number(v.qty);
    if (!isFinite(qty) || qty <= 0) return;
    var c = await stored(v._card);
    if (!c) return;
    el.setAttribute('aria-disabled', 'true');
    if ('textContent' in el) el.textContent = say('jcAsking');
    var me = who();
    c.partRequests = (c.partRequests || []).concat(
      [{ partId: String(v.partId), qty: qty, status: 'requested',
         by: me && me.id ? me.id : null, at: Date.now() }]);
    c.updatedAt = Date.now();
    try { await db().put('jobcards', c); } catch (e) { el.removeAttribute('aria-disabled'); return; }
    if (V() && V().closeSheet) V().closeSheet();
    redraw();
  }

  function here() {
    var r = root.Router;
    var c = r && r.current ? r.current() : null;
    return c && c.id === ID && c.params ? c.params.id : null;
  }
  function who() { return (root.S && root.S.user) || null; }
  function toast(text, kind) {
    var v = V();
    if (v && typeof v.toast === 'function') v.toast(text, { kind: kind });
  }
  function redraw() {
    if (root.Shell && typeof root.Shell.mount === 'function') root.Shell.mount(ID, { id: here() });
  }

  /* The mechanic's tap, end to end and inside the 100 ms tap-to-response
   * budget, because the write is to the local database and the sync is a later,
   * zero-main-thread tick.
   *
   * aria-disabled first, for the in-flight window; then the button is REPLACED
   * IN PLACE by the unpressable row, so the second tap of a double tap lands on
   * something that cannot write; then the toast, because a replacement in place
   * can read as a redraw; then the card is redrawn so block 7's Start row and
   * its gap words — the proof the write landed somewhere real — are right. */
  async function tap(el, field) {
    if (el.getAttribute('aria-disabled') === 'true') return;
    var id = here();
    if (!id) return;
    el.setAttribute('aria-disabled', 'true');
    if ('textContent' in el) el.textContent = say('jcSaving');
    var c = await stamp(field, id);
    if (!c) { el.removeAttribute('aria-disabled'); return; }
    var replacement = stampedRow(field, c);
    var slotEl = el.closest('.jc-next');
    if (slotEl) slotEl.innerHTML = replacement;
    else if ('outerHTML' in el) el.outerHTML = replacement;
    toast(field === 'startAt' ? say('jobStartedAt', { time: hhmm(c[field]) })
      : say('jobDoneAt', { time: hhmm(c[field]) }), 'ok');
    redraw();
  }

  async function signOff(el) {
    if (el.getAttribute('aria-disabled') === 'true') return;
    var id = here(), me = who();
    if (!id || !me) return;
    el.setAttribute('aria-disabled', 'true');
    if ('textContent' in el) el.textContent = say('jcSigningOff');
    var c = await verify(id, me);
    // The close itself is already saved, so the message says what is still true.
    if (!c) { toast(say('jcNotSignedOff'), 'bad'); el.removeAttribute('aria-disabled'); return; }
    redraw();
  }

  async function closeCard(el) {
    if (el.getAttribute('aria-disabled') === 'true') return;
    var id = here(), me = who();
    if (!id || !me) return;
    el.setAttribute('aria-disabled', 'true');
    if ('textContent' in el) el.textContent = say('jcClosing');
    var c = await close(id, me);
    if (!c) { el.removeAttribute('aria-disabled'); return; }
    redraw();
  }

  async function askDelete() {
    var v = V(), id = here();
    if (!v || !id || typeof v.confirmDialog !== 'function') return;
    var ok = await v.confirmDialog(say('jcDeleteAsk'),
                                   { danger: true, yes: say('jcDeleteYes'), no: say('jcDeleteNo') });
    if (!ok) return;
    var c = await stored(id);
    if (!c) return;
    c._deleted = true;
    c.updatedAt = Date.now();
    try { await db().put('jobcards', c); } catch (e) { return; }
    if (root.Router && root.Router.go) root.Router.go('jobs');
  }

  /* ====================================================================== */

  register();

  var api = {
    render: render, model: model, mount: mount,
    // THE RULE, and the two server mirrors beside it.
    crew: crew, onJob: onJob, guard: guard, gateReady: gateReady, mayVerify: mayVerify,
    nextStep: nextStep, stampedRow: stampedRow, odoError: odoError,
    stamp: stamp, verify: verify, close: close, saveField: saveField,
    timeSheet: timeSheet, odoSheet: odoSheet, requestSheet: requestSheet,
    crewSheet: crewSheet, moveSheet: moveSheet, ledgerSheet: ledgerSheet
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.Jobcard = api;
    if (root.Router && typeof root.Router.register === 'function') root.Router.register(ID, api);
    mount();
  }
})(typeof window !== 'undefined' ? window : this);

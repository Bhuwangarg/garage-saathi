/* Garage Saathi v2 — People (#8). Plain script, no module system.
 * Test: test_v2_people.js. Spec: docs/v2/plan/screens-money-people.md §2
 * (lines 368–678).
 *
 *   People.render(model) -> string     the whole body, ONE string, pure
 *   People.mount()                     ONE delegated click listener, installed once
 *
 * "Who is on the roll, how are they doing, and what did we do about it?"
 *
 * FOUR FIELD RULES, AND THREE OF THEM ARE RECORDED LEAKS. Everything else on
 * this screen is layout; these are the reason it was written by hand instead of
 * copied off the crew bank.
 *
 * 1. ANOTHER PERSON'S IDENTITY DOCUMENTS REACH NOBODY OUTSIDE
 *    `manageDrivers`-OR-SELF (§2.5). It leaked once — [C] `02 §6.2`, commit
 *    `c5c11a1`: a driver and a conductor opened another driver's document
 *    locker, and the write path had no check either. So the test here is PER
 *    RECORD and not per route (`canDocs`, below, which is v1's own
 *    `canDriverDocs(id)` at `app.js:1867`): a flat route permission cannot
 *    express "or self", and that is exactly how that bug lived. The same
 *    predicate guards the WRITE, because the original bug was on both paths.
 *    Either the whole block is drawn or it is ABSENT with one line in its place
 *    — never a card of blanked rows, because a row that exists and is empty
 *    teaches people to ask why.
 *
 * 2. THE CONVERSATION LOG NEVER REACHES THE PERSON IT IS ABOUT (§2.6).
 *    [E] `4a42e38`: a note written knowing its subject will read it stops being
 *    a record and becomes a performance. The server denies `crewnotes` BY ROLE,
 *    which is not the same question — a driver promoted to supervisor, or a
 *    conductor given the office login, would be handed every note written about
 *    them. So the rule here is by SUBJECT (`note.crewId !== myCrewId`) and the
 *    card is absent when the person on screen is the reader's own crew record.
 *    The server half is stage-3 item §7.7; a client rule has been walked around
 *    six times in this codebase (`02 §6.1`), so this one is a second lock and
 *    not the lock.
 *    The log is append-only in the store (`02 §4.4`), so there is no edit and no
 *    delete control — not disabled ones, ABSENT ones.
 *
 * 3. SALARY SHOWS ONLY FOR A ROLE HOLDING `money` (§2.4). That is v1's own
 *    `canSeePay` (`app.js:11425`) and it needs no answer to the owner's open
 *    Q4. THE DEPENDENCY, EXACTLY: if the owner answers "pay is a people
 *    matter", the gate below becomes `manageDrivers` instead of `money` — one
 *    row appears on the crew manager's view and one field in the edit sheet, and
 *    NOTHING ELSE on this screen changes. That is the whole cost of the open
 *    question, which is why it was not waited for. It is one constant,
 *    `SALARY_GATE`, so the answer is a one-line change rather than a hunt.
 *    AND THE HIDING IS COSMETIC FOR ONE ROLE TODAY: `crewmanager` is in
 *    `PII_ROLES`, so a crew manager's `/pull` carries every crew member's pay
 *    while this screen hides it (`LIVE-ISSUES.md §7.2`). A client rule here is a
 *    SCREEN rule and not protection.
 *
 * 4. AND ONE THAT IS VERIFIED AND FIXED NOWHERE (`LIVE-ISSUES.md §7.3, §7.4`).
 *    The crew EMERGENCY CONTACT and REFERENCE numbers (`emgName`, `emgPhone`,
 *    `emgRelation`, `refName`, `refPhone`), the EXIT AND REHIRE fields
 *    (`leftAt`, `leftReason`, `leftReasonKey`, `leftNote`, `rehire`) and the
 *    crew member's FACE PHOTO (`photo`) are hidden here by the same per-record
 *    rule as the documents — and for the face photo and the exit fields THE
 *    SERVER STILL SENDS THEM TO EVERY SIGNED-IN ROLE, including a `conductor`
 *    holding zero capabilities. Hiding a field that is still sent is a curtain,
 *    not a protection: the records are on the device and a devtools console
 *    reads them. Stage-3 items §7.3 and §7.4, and they are the server's.
 *    (The emergency and reference fields have since been added to
 *    `v2_perms.FIELD_REDACT['drivers']`, so those five are withheld from
 *    `office` and below today and still reach `crewmanager`, who holds
 *    `manageDrivers` — see this slice's report.)
 *
 * ONE SCORE, WITH ITS PARTS ON SCREEN (§2.3). Five ordered lists of the same
 * people use three different scores today (`01 §5.2`), which is why people
 * stopped reading them. There is one here, out of 100, worst first, and it shows
 * what it is made of. A part that cannot be read is `figure(null)` WITH ITS
 * REASON and the score is still drawn, saying how many parts it came from — a
 * score that silently drops a part is the five-bases bug in a new place.
 *
 * NO `at` ON A FIGURE INSIDE A ROW. `at` adds `.figure-note` as a block
 * element, triples the row height and runs the age words once per row. 164 rows
 * is the densest list in this cut, so the list states its freshness ONCE, in its
 * header, and the one aggregate figure there is the only one carrying `at` and
 * `stale`.
 *
 * A PIN IS NEVER DRAWN TWICE AND NEVER WRITTEN DOWN (§2.9). The minted PINs
 * live in one module variable for the life of one sheet, are shown at `--t3` so
 * they can be read out at arm's length, and are never put in a row, a toast, a
 * note, `usage` or `localStorage` — which is where v1 kept them. Closing the
 * sheet drops them, and the server will not return an existing PIN.
 */
(function (root) {
  'use strict';

  var ID = 'people';

  /* The selector the one delegated listener returns early on, declared as a
   * constant and read BEFORE `[data-act]` — the shape duty.js uses and the one
   * predeploy-gate.sh's per-screen check accepts. */
  var FIELDS = 'input, select, textarea, label, .num';

  var CREW_CAP = 200;              // §2.10 "far too many": 200 rows, remainder stated
  var INC_CAP = 10;                // §2.1's incidents card
  var NOTE_CAP = 20;               // the log, newest first
  var MARK = 20;                   // a .v2row lead mark, matching the nav's
  var DMARK = 16;                  // a .drow-i mark: .drow-i svg is 16px
  var DAY_MS = 86400000;
  var SOON_DAYS = 30;              // a document inside a month of running out
  var SCORE_DAYS = 90;             // the window every part is read over
  var RV_MIN = 10;                 // no star average under ten rated trips (REDPRO_TRACE.md)
  var GPS_PEN_CAP = 40;            // v1's cap on auto GPS penalties, transcribed

  /* THE ONE GATE SALARY SITS BEHIND (§2.4, and rule 3 in the header). Q4 is
   * open; if the owner answers "pay is a people matter" this becomes
   * 'manageDrivers' and nothing else on this screen moves. */
  var SALARY_GATE = 'money';

  /* Who may decide a coaching note, from the SERVER's own list
   * (`sync_server.py:2976` COACH_DECIDERS). `office` holds `crewNote` and is not
   * in it, so for the office the coaching card is absent: a draft written for
   * somebody else, shown to a reader who cannot act on it, is neither a record
   * nor a decision. The log is the office's one write and it still has it. */
  var DECIDERS = ['owner', 'supervisor', 'crewmanager'];

  /* The six crew documents, in v1's order and under v1's keys — the record's
   * shape, not a new one (`app.js:11153` DRIVER_DOCS). `expiry: true` is the
   * three that carry a date. */
  var DOCS = [
    { key: 'license', word: 'peDocLicence', expiry: true },
    { key: 'aadhaar', word: 'peDocAadhaar', expiry: false },
    { key: 'pan', word: 'peDocPan', expiry: false },
    { key: 'police', word: 'peDocPolice', expiry: true },
    { key: 'medical', word: 'peDocMedical', expiry: true },
    { key: 'photo', word: 'peDocPhoto', expiry: false }
  ];

  /* The incident penalties, transcribed from v1's `INCIDENT` (`app.js:1709`)
   * rather than re-weighted: the number on screen has to be the number the crew
   * bank has been showing, or this is a sixth basis instead of the one. The
   * labels are registered ids; the KEYS are what the record carries. */
  var INCIDENT = {
    scratch: { word: 'peIncScratch', pen: 3 },
    dent: { word: 'peIncDent', pen: 8 },
    'harsh-brake': { word: 'peIncHarsh', pen: 5 },
    overspeed: { word: 'peIncOverspeed', pen: 6 },
    late: { word: 'peIncLate', pen: 2 },
    cleanliness: { word: 'peIncClean', pen: 3 },
    accident: { word: 'peIncAccident', pen: 20 },
    other: { word: 'peIncOther', pen: 4 }
  };

  // v1's `GPS_EVENT` penalties (`app.js:1877`), same reason.
  var GPS_PEN = { overspeed: 4, harshbrake: 3, night: 5, idle: 1 };

  var NOTE_KINDS = [
    { key: 'talked', word: 'peKindTalked' },
    { key: 'warned', word: 'peKindWarned' },
    { key: 'praised', word: 'peKindPraised' },
    { key: 'other', word: 'peKindOther' }
  ];

  // v1's four exit reasons, under v1's keys (`leftReasonKey`).
  var EXIT_REASONS = [
    { key: 'left', word: 'peReasonLeft' },
    { key: 'dismissed', word: 'peReasonDismissed' },
    { key: 'retired', word: 'peReasonRetired' },
    { key: 'other', word: 'peReasonOther' }
  ];

  /* The eight roles a staff login can hold, and who may mint each. The server
   * is the authority (`may_manage`, `sync_server.py:954`: the owner any of the
   * eight, a supervisor store/mechanic/driver/conductor) — offering a role the
   * server will refuse is a form filled in for nothing. */
  var ROLES = [
    { key: 'owner', word: 'peRoleOwner' },
    { key: 'supervisor', word: 'peRoleSupervisor' },
    { key: 'crewmanager', word: 'peRoleCrewmanager' },
    { key: 'office', word: 'peRoleOffice' },
    { key: 'store', word: 'peRoleStore' },
    { key: 'mechanic', word: 'peRoleMechanic' },
    { key: 'driver', word: 'peRoleDriver' },
    { key: 'conductor', word: 'peRoleConductor' }
  ];
  var SUPERVISOR_MANAGES = ['store', 'mechanic', 'driver', 'conductor'];

  /* ---------- the words -------------------------------------------------- */

  var WORDS = {
    /* The screen's one name, under the id the frame and the nav read
     * (`Caps.SCREENS.people.word`), so ONE word fills the nav label, the header
     * and More instead of the header translating from one id and the body from
     * a synonym. */
    scPeople: { en: 'People', hi: '' },

    peTabCrew: { en: 'Crew', hi: '' },
    peTabStaff: { en: 'Staff logins', hi: '' },
    peTabPins: { en: 'Crew PINs', hi: '' },
    peFiltWorst: { en: 'Worst first', hi: '' },
    peFiltDocs: { en: 'Documents missing', hi: '' },
    peFiltLeft: { en: 'Left', hi: '' },
    peFind: { en: 'Find a person', hi: '' },
    peAdd: { en: 'Add a person', hi: '' },

    // {score} is the crew score, {inc} the incidents clause, {lic} the licence clause.
    peSubScore: { en: 'Score {score}', hi: '' },
    peIncN: { en: { one: '{n} incident', other: '{n} incidents' }, hi: '' },
    peLicIn: { en: 'licence expires in {d} days', hi: '' },
    peLicGone: { en: 'licence expired', hi: '' },
    peCount: { en: '{total} people. {shown} shown.', hi: '' },
    peCountCap: { en: '{total} people. {shown} shown. Use the search or a filter.', hi: '' },

    peJoined: { en: 'Joined {date}', hi: '' },
    peSeat: { en: 'Seat: {reg}, {role} {slot}', hi: '' },
    peSeatNone: { en: 'No bus', hi: '' },
    pePhone: { en: 'Phone', hi: '' },
    peAltPhone: { en: 'Second phone', hi: '' },
    peSalary: { en: 'Salary', hi: '' },
    peSalaryMonth: { en: '{amount} / month', hi: '' },
    peEmergency: { en: 'Emergency contact', hi: '' },
    peReference: { en: 'Reference', hi: '' },
    peFace: { en: 'Photograph', hi: '' },

    peScore: { en: 'Crew score', hi: '' },
    pePartsOf: { en: 'Worked out from {known} of {total} parts.', hi: '' },
    pePartRv: { en: 'Reviews', hi: '' },
    pePartInc: { en: 'Incidents', hi: '' },
    pePartAtt: { en: 'Attendance', hi: '' },
    pePartGps: { en: 'Safety events', hi: '' },
    peRvStars: { en: '{stars} stars from {count} reviews', hi: '' },
    peIncCost: { en: { one: '{n} incident, {cost} rupees', other: '{n} incidents, {cost} rupees' }, hi: '' },
    peAttLate: { en: 'Late {late} of {days} days', hi: '' },
    peGpsLine: { en: '{over} overspeed, {harsh} harsh brakes', hi: '' },
    peNoGps: { en: 'No GPS for your login', hi: '' },
    peNoAtt: { en: 'No attendance on this device', hi: '' },
    peNoInc: { en: 'No incidents on this device', hi: '' },
    /* The review part cannot be read on a device at all, and that is not a
     * permission: see `crewIndex` below. The reason says where it IS read. */
    peNoRvTrace: { en: 'Reviews are traced on the server', hi: '' },
    peNoScore: { en: 'Could not work out the score', hi: '' },

    peDocs: { en: 'Documents', hi: '' },
    peDocAdd: { en: 'Add a document', hi: '' },
    peDocExpIn: { en: 'Expires in {d} days', hi: '' },
    peDocExpired: { en: 'Expired', hi: '' },
    peDocOnFile: { en: 'On the record', hi: '' },
    peDocMissing: { en: 'Not on the record', hi: '' },
    peDocsHidden: { en: 'Documents are not shown for your login.', hi: '' },
    peDocLicence: { en: 'Driving licence', hi: 'ड्राइविंग लाइसेंस' },      // FROM i18n-hi.js line 274 (docLicense)
    peDocAadhaar: { en: 'Aadhaar card', hi: 'आधार कार्ड' },                // FROM i18n-hi.js line 274 (docAadhaar)
    peDocPhoto: { en: 'Photograph', hi: 'फोटो' },                          // FROM i18n-hi.js line 274 (docPhoto)
    peDocPan: { en: 'PAN card', hi: 'पैन कार्ड' },                          // FROM i18n-hi.js line 275 (docPan)
    peDocPolice: { en: 'Police verification', hi: 'पुलिस वेरिफिकेशन' },     // FROM i18n-hi.js line 275 (docPolice)
    peDocMedical: { en: 'Medical certificate', hi: 'मेडिकल सर्टिफिकेट' },   // FROM i18n-hi.js line 275 (docMedical)
    peDocsMissingBadge: { en: 'Documents missing', hi: '' },

    peIncidents: { en: 'Incidents', hi: '' },
    peIncLog: { en: 'Log an incident', hi: '' },
    peIncNone: { en: 'Clean record', hi: '' },
    peIncKind: { en: 'What happened', hi: '' },
    peIncNote: { en: 'Note', hi: '' },
    peIncCostField: { en: 'What it cost', hi: '' },
    peIncScratch: { en: 'Scratch', hi: '' },
    peIncDent: { en: 'Dent', hi: '' },
    peIncHarsh: { en: 'Harsh braking', hi: '' },
    peIncOverspeed: { en: 'Overspeeding', hi: '' },
    peIncLate: { en: 'Late trip', hi: '' },
    peIncClean: { en: 'Cleanliness', hi: '' },
    peIncAccident: { en: 'Accident', hi: '' },
    peIncOther: { en: 'Other', hi: '' },

    peReviews: { en: 'Their reviews', hi: '' },

    peCoach: { en: "This week's coaching note", hi: '' },
    peCoachLabel: { en: 'Shown to {name} once you approve it.', hi: '' },
    peCoachApprove: { en: 'Approve and send', hi: '' },
    peCoachSkip: { en: 'Skip this week', hi: '' },
    peCoachSending: { en: 'Sending...', hi: '' },
    peCoachNone: { en: 'No note waiting this week', hi: '' },
    peCoachGood: { en: 'What went well', hi: '' },
    peCoachFix: { en: 'What to fix', hi: '' },
    peCoachTip: { en: 'One tip', hi: '' },
    peCoachSent: { en: 'Sent', hi: '' },
    peCoachSkipped: { en: 'Skipped', hi: '' },

    peLog: { en: 'Conversation log', hi: '' },
    peLogLabel: { en: 'Office record. {name} never sees this.', hi: '' },
    peLogWrite: { en: 'Write what was said', hi: '' },
    peLogGuard: { en: 'Once saved, this cannot be changed or deleted. Author and time are recorded.', hi: '' },
    peLogEmpty: { en: 'Nothing written down yet', hi: '' },
    peLogKind: { en: 'What kind', hi: '' },
    peLogWhat: { en: 'What was said', hi: '' },
    peLogSave: { en: 'Save', hi: '' },
    peLogSaved: { en: 'Note saved', hi: '' },
    peLogNotSaved: { en: 'Not saved until you press Save', hi: '' },
    peKindTalked: { en: 'Talked', hi: '' },
    peKindWarned: { en: 'Warned', hi: '' },
    peKindPraised: { en: 'Praised', hi: '' },
    peKindOther: { en: 'Other', hi: '' },

    peRoll: { en: 'On the roll', hi: '' },
    peMarkLeft: { en: 'Mark as left', hi: '' },
    peLeftReason: { en: 'Reason', hi: '' },
    peLeftNote: { en: 'Note', hi: '' },
    peLeftDay: { en: 'Last day', hi: '' },
    peLeftAsk: { en: 'Mark {name} as left?', hi: '' },
    peLeftSeat: { en: 'His seat on {reg} becomes empty for tonight.', hi: '' },
    peLeftNoSeat: { en: 'He is not on a bus tonight.', hi: '' },
    peLeftAlready: { en: 'Left', hi: '' },
    peLeftOn: { en: 'Left {date}', hi: '' },
    peRehire: { en: 'Take back again?', hi: '' },
    peRehireYes: { en: 'Yes', hi: '' },
    peRehireMaybe: { en: 'Maybe', hi: '' },
    peRehireNo: { en: 'No', hi: '' },
    peReasonLeft: { en: 'Left', hi: '' },
    peReasonDismissed: { en: 'Dismissed', hi: '' },
    peReasonRetired: { en: 'Retired', hi: '' },
    peReasonOther: { en: 'Other', hi: '' },

    peJoinName: { en: 'Name', hi: '' },
    peJoinRole: { en: 'Driver or conductor', hi: '' },
    peJoinPhone: { en: 'Phone', hi: '' },
    peJoinSave: { en: 'Save and add documents later', hi: '' },
    peNeedNamePhone: { en: 'A name and a phone number are needed.', hi: '' },
    peDupTitle: { en: 'Looks like somebody already on the roll', hi: '' },
    peDupOpen: { en: 'Open this person', hi: '' },
    peDupBack: { en: 'Bring back', hi: '' },
    peDupAnyway: { en: 'No, this is a different person — add anyway', hi: '' },

    /* `{crew}` and not `{n}`: `w()` fills `{n}` itself from the count argument
     * and empties it when there is none, so a named slot that collides with it
     * comes out blank. */
    pePinsMake: { en: 'Make PINs for this bus ({crew})', hi: '' },
    pePinsMaking: { en: 'Making PINs...', hi: '' },
    pePinsOnce: { en: 'Write these down now. They are shown once.', hi: '' },
    pePinsClose: { en: 'Close? These PINs cannot be shown again.', hi: '' },
    pePinsNone: { en: 'Every crew member on this bus already has a PIN.', hi: '' },
    pePinsFailed: { en: 'The PINs were not made. Try again.', hi: '' },
    pePinsNoCrew: { en: 'Nobody is on this bus', hi: '' },
    pePinsNoBuses: { en: 'No buses on this device', hi: '' },

    peStaff: { en: 'Staff logins', hi: '' },
    peStaffAdd: { en: 'Add a login', hi: '' },
    peStaffRole: { en: 'Role', hi: '' },
    peStaffName: { en: 'Name', hi: '' },
    peStaffPin: { en: 'PIN for this login', hi: '' },
    peStaffPinHint: { en: 'Four digits, no letters.', hi: '' },
    peStaffNoSelf: { en: 'You cannot delete your own login.', hi: '' },
    peStaffDelete: { en: 'Delete this login', hi: '' },
    peStaffAsk: { en: 'Delete {name}? They will not be able to sign in again.', hi: '' },
    peStaffNone: { en: 'No staff logins on this device', hi: '' },
    peRoleOwner: { en: 'Owner', hi: '' },
    peRoleSupervisor: { en: 'Supervisor', hi: '' },
    peRoleCrewmanager: { en: 'Crew manager', hi: '' },
    peRoleOffice: { en: 'Office', hi: '' },
    peRoleStore: { en: 'Storekeeper', hi: '' },
    peRoleMechanic: { en: 'Mechanic', hi: '' },
    peRoleDriver: { en: 'Driver', hi: 'ड्राइवर' },                 // FROM i18n-hi.js line 230 (roleDriver)
    peRoleConductor: { en: 'Conductor', hi: 'कंडक्टर' },            // FROM i18n-hi.js line 230 (roleConductor)

    peBack: { en: 'Crew', hi: '' },
    peSaving: { en: 'Saving...', hi: '' },
    peSaveFailed: { en: 'Not saved. Try again.', hi: '' },
    peNeedsNet: { en: 'Needs a connection', hi: '' },
    peOffSince: { en: 'No connection since {time}.', hi: '' },
    /* AND THE SAME SENTENCE WITH NO TIME IN IT, because a phone that has never
     * sent anything has no "since". REV-FLOW F6 was `lastSyncAt` seeded to 0
     * rather than null, so the epoch rendered as a clock time and this read
     * "No connection since 05:30" on a device that had never synced. With the honest
     * null the one above would render with an empty slot instead — a dangling
     * sentence, which is the same defect wearing better manners — so there are
     * two words for the two facts. */
    peOffEver: { en: 'This phone has not sent anything yet.', hi: '' },
    peEmpty: { en: 'Nobody on the roll yet', hi: '' },
    peEmptyHint: { en: 'Add a person, or import the roster.', hi: '' },
    peEmptyLeft: { en: 'Nobody marked as left', hi: '' },
    peEmptyDocs: { en: 'Nobody with a document missing', hi: '' },
    peError: { en: 'Could not read the crew list', hi: '' },
    peCardFailed: { en: 'This part could not be drawn.', hi: '' },
    peGone: { en: 'That person is not on this device', hi: '' }
  };

  var registered = false;
  function register() {
    if (registered || !root.W || typeof root.W.register !== 'function') return;
    root.W.register(WORDS);
    registered = true;
  }

  function put(s, vals) {
    return String(s).replace(/\{([A-Za-z0-9]+)\}/g, function (all, k) {
      return vals && has(vals, k) ? String(vals[k]) : '';
    });
  }

  /* `w()` throws on an id nobody registered, which is the whole point of the
   * table — but one thrown word must cost a word and not the screen, so every
   * call falls back to the English beside the id. The id itself is never
   * swallowed: test_v2_words.js is what makes a missing one loud at build time.
   */
  function say(id, vals, n) {
    register();
    var s = null;
    if (registered && typeof root.w === 'function') {
      try { s = root.w(id, n); } catch (e) { s = null; }
    }
    if (s == null || s === '') {
      var e2 = WORDS[id] && WORDS[id].en;
      if (e2 == null) return '';
      s = typeof e2 === 'string' ? e2 : (n === 1 ? (e2.one || e2.other) : (e2.other || e2.one));
      if (n !== undefined && n !== null) s = String(s).replace(/\{n\}/g, String(n));
    }
    return vals ? put(s, vals) : s;
  }

  /* ---------- the primitives, each absent-safe --------------------------- */

  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* Every dependency resolved at CALL time, never captured at load — the idiom
   * of router.js, night.js and shell.js, and what makes index.html's order a
   * dependency order rather than a load-time coupling. */
  function caps() { return (root && root.Caps) || null; }
  function router() { return (root && root.Router) || null; }
  function shell() { return (root && root.Shell) || null; }
  function sync() { return (root && root.Sync) || null; }
  function cacheMod() { return (root && root.Cache) || null; }
  function db() { return (root && root.DB) || null; }
  function fmtOf() { return (root && root.fmt) || null; }
  function overlay() { return (root && root.V2) || null; }
  function doc() { return (root && root.document) || null; }

  function draw(name, size) {
    return typeof root.icon === 'function' ? root.icon(name, { size: size }) : '';
  }

  function fig(v, o) { return typeof root.figure === 'function' ? root.figure(v, o) : ''; }

  function empty(text, mark, hint) {
    return typeof root.emptyState === 'function'
      ? root.emptyState(text, { icon: mark, hint: hint })
      : '<p>' + esc(text) + '</p>';
  }

  function skel(n) { return typeof root.skeleton === 'function' ? root.skeleton(n) : ''; }

  function offState() {
    return typeof root.offlineState === 'function' ? root.offlineState() : '';
  }

  /* ONE retry function, hoisted, not a fresh closure per render: ui/states.js
   * keys its retry handlers by function identity and caps the list at 200, so a
   * new arrow per redraw would add an entry on every sync tick. */
  function redraw() {
    var s = shell();
    if (s && s.mount) s.mount(ID, paramsNow());
  }

  function errState(text) {
    return typeof root.errorState === 'function' ? root.errorState(text, redraw)
      : '<p>' + esc(text) + '</p>';
  }

  function card(heading, body, cls) {
    return '<div class="card' + (cls ? ' ' + cls : '') + '">'
      + (heading ? '<h3>' + esc(heading) + '</h3>' : '') + body + '</div>';
  }

  // A fact. A .drow is not a .v2row and has no two-line rule, which is why the
  // facts can carry a figure.
  function drow(mark, label, value) {
    return '<div class="drow"><span class="drow-i">' + draw(mark, DMARK) + '</span>'
      + '<span class="drow-l">' + esc(label) + '</span>'
      + '<span class="drow-v">' + (value == null ? '' : value) + '</span></div>';
  }

  function badge(kind, mark, text) {
    return '<span class="badge badge-' + kind + '">' + draw(mark, 14) + ' ' + esc(text) + '</span>';
  }

  function btn(act, label, cls, data) {
    var extra = '';
    if (data) {
      var k;
      for (k in data) if (has(data, k) && data[k] != null) extra += ' data-' + k + '="' + esc(data[k]) + '"';
    }
    return '<button type="button" class="btn' + (cls ? ' ' + cls : '') + '" data-act="' + esc(act) + '"'
      + extra + '>' + esc(label) + '</button>';
  }

  /* ---------- reading the model ------------------------------------------ */

  function rows(m, store) {
    var c = (m && m.cache) || {};
    return has(c, store) ? c[store] : undefined;
  }

  function list(m, store) {
    var v = rows(m, store);
    return v === undefined ? [] : (v || []);
  }

  /* Not loaded yet. `undefined` is the only honest "we have not read it": a
   * failed read leaves `[]` (cache.js), and `[]` means "I asked, and there are
   * none". The whole score depends on telling those two apart. */
  function unread(v) { return v === undefined; }

  function user(m) { return (m && m.user) || null; }

  function can(m, cap) {
    var c = caps();
    return !!(c && c.can && c.can(m && m.role, cap));
  }

  function byId(arr, id) {
    for (var i = 0; i < arr.length; i++) if (arr[i] && arr[i].id === id) return arr[i];
    return null;
  }

  function live(arr) {
    var out = [], i;
    for (i = 0; i < arr.length; i++) if (arr[i] && !arr[i]._deleted) out.push(arr[i]);
    return out;
  }

  function crewRoleOf(d) { return d && d.crewRole === 'conductor' ? 'conductor' : 'driver'; }

  function regOf(m, busId) {
    var b = byId(list(m, 'buses'), busId);
    return b ? String(b.regNo || b.id) : '';
  }

  function nameOfUser(m, id) {
    var u = byId(list(m, 'users'), id);
    return u ? String(u.name || u.id) : '';
  }

  /* The reader's own crew-bank record, by the same rule the server uses
   * (`_crew_record_for`: `drivers.userId` === the token's user). This is one
   * half of both rule 1 ("or self") and rule 2 ("never its subject"), so it has
   * exactly one definition. */
  function myCrew(m) {
    var u = user(m);
    var all = list(m, 'drivers');
    if (!u) return null;
    for (var i = 0; i < all.length; i++) if (all[i] && all[i].userId === u.id) return all[i];
    return null;
  }

  /* RULE 1, AND IT IS PER RECORD. v1 needed `canDriverDocs(id)` for exactly
   * this reason: a flat route check cannot say "or self", and that is how a
   * driver came to be holding another driver's licence.
   *
   * Everything in §2.5's single block is behind this one predicate — `docs`,
   * `license`, `dob`, `address`, `bloodGroup`, `phone`, `altPhone` — and so are
   * the four fields of rule 4, because a screen that hides the licence and
   * shows the emergency number has not hidden anything. */
  function canDocs(m, person) {
    if (!person) return false;
    if (can(m, 'manageDrivers')) return true;
    var u = user(m);
    return !!(u && person.userId && person.userId === u.id);
  }

  /* RULE 2. `crewNote` opens the log, and the SUBJECT closes it: the person on
   * screen being the reader's own crew record is the one case where holding the
   * capability is not enough. The server denies by role, which is a different
   * question (stage-3 §7.7). */
  function canLog(m, person) {
    if (!person || !can(m, 'crewNote')) return false;
    var mine = myCrew(m);
    return !(mine && mine.id === person.id);
  }

  // RULE 3. One call site, one constant; see the header.
  function canSalary(m) { return can(m, SALARY_GATE); }

  function canCoach(m, person) {
    if (!canLog(m, person)) return false;          // the subject rule applies here too
    return DECIDERS.indexOf(String(m && m.role)) !== -1;
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function clock(ms) {
    if (ms == null) return null;
    var d = new Date(Number(ms));
    if (d.getTime() !== d.getTime()) return null;
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  /* A date as digits, and deliberately not "14 Mar 2024". §2.12's copy table
   * spells the month, which would need twelve month names in both languages —
   * and the Hindi for them is nowhere in i18n-hi.js, so it would be twelve
   * guesses on a screen where a guessed word is a word nobody is told is
   * missing. Digits read the same in both languages. Flagged in this slice's
   * report. */
  function dateWords(ms) {
    if (ms == null || ms === '') return null;
    var d = new Date(Number(ms));
    if (d.getTime() !== d.getTime()) return null;
    return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear();
  }

  // Whole days from now to a date string, negative once it has passed.
  function daysLeft(date) {
    if (!date) return null;
    var t = Date.parse(String(date));
    if (t !== t) return null;
    return Math.ceil((t - Date.now()) / DAY_MS);
  }

  function group(n) {
    var f = fmtOf();
    if (!f || typeof n !== 'number' || !isFinite(n)) return null;
    return f.groupIndian(n);
  }

  // A whole count, grouped the Indian way. The RAW value goes to figure() with
  // a `format`: formatting first is how "we do not know" becomes "it is zero".
  function count(n) {
    var f = fmtOf();
    return fig(n, f ? { format: f.groupIndian } : null);
  }

  function lastSyncAt() {
    var s = sync();
    if (!s || typeof s.info !== 'function') return null;
    try { var i = s.info(); return i && i.lastSyncAt ? i.lastSyncAt : null; } catch (e) { return null; }
  }

  // The server's own last refusal, in its own words. Not a message to show: the
  // one bit this screen needs is whether the last read failed at all.
  function syncError() {
    var s = sync();
    if (!s || typeof s.info !== 'function') return false;
    try { var i = s.info(); return !!(i && i.lastError); } catch (e) { return false; }
  }

  /* ---------- THE SCORE (§2.3) ------------------------------------------- */

  /* THE CREW↔REVIEW ATTRIBUTION INDEX, AND WHY THERE IS NO `People.crewIndex`.
   *
   * Slice T's Today screen asks this file for `People.crewIndex` — crewId ->
   * their reviews — and reads it when it exists. It does not exist, and the
   * reason is not that it was left out:
   *
   *   1. `rbreviews` CARRIES NO `crewId`. A review names a route and a PNR. The
   *      attribution is the seven-store trace in `crew_trace.py`
   *      (`index_by_crew`, called from `sync_server.py:1365`): review -> service
   *      (`rbservices.routeIds`) -> that night's departure -> three independent
   *      answers for the bus (`gatechecks`, `rbassign`, `itslookup`) -> the bus
   *      -> the crew on it at that time (`dutylog`), with `rbalias` adding a
   *      confirmed redBus name. A disagreement between the sources is shown,
   *      never averaged.
   *   2. v1 does build it on the client, in `rvCrewIndex()` — but it does so
   *      through `/trace.js`, which is v1's file. Nothing under `v2/` reaches
   *      outside it except to read `i18n-hi.js`, so for v2 this is a new module
   *      of its own (a port of `trace.js` plus its context builder), not a
   *      function on a screen.
   *   3. AND THE STORES ARE NOT SENT TO THE PEOPLE WHO NEED THE NUMBER.
   *      `itslookup` reaches owner and supervisor only; `gatechecks` and
   *      `dutylog` do not reach `office` at all (`v2_perms.py`). So a
   *      client-side index would resolve a different set of reviews on a crew
   *      manager's phone than on the owner's, and a third set in the office —
   *      one number, three answers, which is the five-bases defect (`01 §5.2`)
   *      arriving in the screen that exists to end it.
   *
   * So the honest statement is the one on screen: this part of the score is
   * `figure(null)` with "Reviews are traced on the server", the score says it
   * came from three parts of four, and Today draws its own error state with a
   * Retry. What the owner would have to fund is in this slice's report:
   * `index_by_crew` behind a pull-time endpoint (the server already memoises it
   * over the nine stores), or a `crewId` written onto `rbreviews` once the
   * trace has resolved — which is a new field on a server-written store and
   * therefore a backend decision, not a screen one. */

  var SCORE_STORES = ['incidents', 'gpsevents', 'attendance', 'drivers', 'buses'];
  var scoreMemo = { key: null, map: null };
  var stats = { scoreBuilds: 0 };

  /* Built ONCE PER CONTENT SIGNATURE, never per render and never per row. v1's
   * `driverOverall` runs for all 110 crew and re-read forty thousand GPS rows
   * on each check — 200 ms of the same work, measured. The signature comes from
   * the write path (`Cache.sig`), not from reading the content. */
  function scoreSig(m) {
    /* `Cache.sig` answers "has this store changed?" from the device's own write
     * path, which is the cheap half. But it reads the GLOBAL cache, and what is
     * blended is whatever cache the MODEL was handed — so the model's own store
     * shape goes into the key too. Without it a render from a different cache
     * than the session holds would be answered from the previous one's memo,
     * which is a stale score drawn as a current one. The lengths are O(1) per
     * store; nothing here walks a row. */
    var parts = [], i;
    for (i = 0; i < SCORE_STORES.length; i++) {
      var v = rows(m, SCORE_STORES[i]);
      parts.push(v === undefined ? 'u' : String(v.length));
    }
    var C = cacheMod();
    if (C && C.sigOf) {
      try { parts.push(C.sigOf.apply(null, SCORE_STORES)); } catch (e) { /* the lengths stand */ }
    }
    return parts.join('|');
  }

  function scoreIndex(m) {
    var key = scoreSig(m) + '|' + String(m && m.role);
    if (scoreMemo.key === key && scoreMemo.map) return scoreMemo.map;
    scoreMemo.key = key;
    scoreMemo.map = buildScores(m);
    stats.scoreBuilds++;
    return scoreMemo.map;
  }

  /* A part is {label, value, format, unit, line, reason}. `value` null with a
   * `reason` is a part that could not be read — drawn as the dash with its
   * reason beside it, and left out of the blend. `sub` is the part's own 0..100
   * reading; the score is the mean of the parts that have one, which is the
   * most obvious decomposable blend and is what lets the card say "worked out
   * from 3 of 4 parts". §2.3 gives the parts and how they are shown and does not
   * give the arithmetic; flagged in this slice's report. */
  function buildScores(m) {
    var crew = live(list(m, 'drivers'));
    var since = Date.now() - SCORE_DAYS * DAY_MS;
    var incStore = rows(m, 'incidents');
    var gpsStore = rows(m, 'gpsevents');
    var attStore = rows(m, 'attendance');
    var incBy = groupIncidents(incStore, since);
    var gpsByReg = groupGps(gpsStore, since);
    var attBy = groupAttendance(attStore, since);
    var map = {};
    for (var i = 0; i < crew.length; i++) {
      map[crew[i].id] = oneScore(m, crew[i], incBy, gpsByReg, attBy, incStore, gpsStore, attStore);
    }
    return map;
  }

  function groupIncidents(store, since) {
    var by = {};
    if (unread(store)) return by;
    for (var i = 0; i < store.length; i++) {
      var r = store[i];
      if (!r || r._deleted || !r.driverId) continue;
      if ((Number(r.at) || 0) < since) continue;
      if (!by[r.driverId]) by[r.driverId] = [];
      by[r.driverId].push(r);
    }
    return by;
  }

  function normReg(s) { return String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, ''); }

  /* Grouped once, by registration, exactly as v1 learned to: per-driver
   * normalising of every GPS row was 4.4 million string rewrites and 808 ms on
   * a fleet-sized device. */
  function groupGps(store, since) {
    var by = {};
    if (unread(store)) return by;
    for (var i = 0; i < store.length; i++) {
      var e = store[i];
      if (!e || e._deleted) continue;
      if ((Number(e.at) || 0) < since) continue;
      var k = normReg(e.reg);
      if (!by[k]) by[k] = [];
      by[k].push(e);
    }
    return by;
  }

  function groupAttendance(store, since) {
    var by = {};
    if (unread(store)) return by;
    for (var i = 0; i < store.length; i++) {
      var a = store[i];
      if (!a || a._deleted || !a.userId || a.type !== 'in') continue;
      if ((Number(a.at) || 0) < since) continue;
      if (!by[a.userId]) by[a.userId] = { days: 0, late: 0 };
      by[a.userId].days++;
      if (a.late) by[a.userId].late++;
    }
    return by;
  }

  function oneScore(m, d, incBy, gpsByReg, attBy, incStore, gpsStore, attStore) {
    var f = fmtOf();
    var parts = [];

    // 1. Passenger reviews — not readable on a device at all. See crewIndex.
    parts.push({ mark: 'star', label: say('pePartRv'), value: null, reason: say('peNoRvTrace') });

    // 2. Incidents.
    var incs = incBy[d.id] || [];
    var pen = 0, cost = 0, i;
    for (i = 0; i < incs.length; i++) {
      pen += (INCIDENT[incs[i].type] || INCIDENT.other).pen;
      cost += Number(incs[i].cost) || 0;
    }
    if (unread(incStore)) {
      parts.push({ mark: 'warn', label: say('pePartInc'), value: null, reason: say('peNoInc') });
    } else {
      parts.push({ mark: 'warn', label: say('pePartInc'), value: incs.length,
                   format: f ? f.groupIndian : null,
                   line: say('peIncCost', { cost: group(cost) }, incs.length),
                   sub: Math.max(0, 100 - pen) });
    }

    // 3. Attendance. No defaulted denominator: zero days read is not "never
    // late", it is no reading, so the part is the dash and leaves the blend.
    var att = attBy[(d.userId || '')] || null;
    if (!att || !att.days) {
      parts.push({ mark: 'clock', label: say('pePartAtt'), value: null, reason: say('peNoAtt') });
    } else {
      parts.push({ mark: 'clock', label: say('pePartAtt'), value: att.late,
                   format: f ? f.groupIndian : null,
                   line: say('peAttLate', { late: att.late, days: att.days }),
                   sub: Math.round(100 * (1 - att.late / att.days)) });
    }

    /* 4. Safety events, from the live GPS of the bus they are on — and only for
     * a DRIVER, never a conductor: they are the ones driving (v1's own rule in
     * `driverScore`). §2.3 reads them "for the buses they drove (dutylog)",
     * which would be a dated walk of a store `office` is not sent; the current
     * seat is v1's rule transcribed, and the difference is flagged in this
     * slice's report.
     *
     * `gpsevents` reaches owner and supervisor only (`02 §5.1`), so for a crew
     * manager and the office this is the dash with its reason — which §2.3
     * names word for word. */
    if (unread(gpsStore)) {
      parts.push({ mark: 'bad', label: say('pePartGps'), value: null, reason: say('peNoGps') });
    } else if (crewRoleOf(d) !== 'driver' || !d.busId) {
      parts.push({ mark: 'bad', label: say('pePartGps'), value: 0, format: f ? f.groupIndian : null,
                   line: say('peGpsLine', { over: 0, harsh: 0 }), sub: 100 });
    } else {
      var evs = gpsByReg[normReg(regOf(m, d.busId))] || [];
      var gp = 0, over = 0, harsh = 0;
      for (i = 0; i < evs.length; i++) {
        gp += GPS_PEN[evs[i].type] || 0;
        if (evs[i].type === 'overspeed') over++;
        if (evs[i].type === 'harshbrake') harsh++;
      }
      parts.push({ mark: 'bad', label: say('pePartGps'), value: evs.length,
                   format: f ? f.groupIndian : null,
                   line: say('peGpsLine', { over: over, harsh: harsh }),
                   sub: Math.max(0, 100 - Math.min(GPS_PEN_CAP, gp)) });
    }

    var sum = 0, known = 0;
    for (i = 0; i < parts.length; i++) {
      if (typeof parts[i].sub === 'number') { sum += parts[i].sub; known++; }
    }
    return { id: d.id, parts: parts, known: known, total: parts.length,
             score: known ? Math.round(sum / known) : null,
             incidents: incs.length };
  }

  /* ---------- the crew list ---------------------------------------------- */

  var TABS = ['crew', 'staff', 'pins'];
  var VIEWS = ['worst', 'docs', 'left'];
  // Local, never a route: a back press must leave the screen, not walk back
  // through filters.
  var tab = 'crew';
  var view = 'worst';

  function tabsFor(m) {
    var out = ['crew'];
    if (can(m, 'manageStaff')) out.push('staff');
    if (can(m, 'manageCrewLogins')) out.push('pins');
    return out;
  }

  function viewsFor(m) {
    /* The "Documents missing" filter is a DOCUMENT question, so it is absent
     * for a login that may not hold documents — and for that login the server
     * strips `docs` anyway, so a count drawn there could never reach zero
     * ([E] `5eb8c6e`, "110 of 110 missing documents"). */
    return can(m, 'manageDrivers') ? VIEWS : ['worst', 'left'];
  }

  function setTab(id) {
    if (TABS.indexOf(String(id)) >= 0) tab = String(id);
    return tab;
  }

  function setView(id) {
    if (VIEWS.indexOf(String(id)) >= 0) view = String(id);
    return view;
  }

  function docsMissing(d) {
    var held = (d && d.docs) || {};
    for (var i = 0; i < DOCS.length; i++) {
      var cur = held[DOCS[i].key];
      if (!cur || (!cur.photo && !cur.number)) return true;
    }
    return false;
  }

  function licenceClause(m, d) {
    // A document field, so it is behind rule 1 like every other one.
    if (!canDocs(m, d)) return null;
    var cur = ((d.docs || {}).license) || null;
    if (!cur || !cur.expiry) return null;
    var left = daysLeft(cur.expiry);
    if (left == null) return null;
    if (left < 0) return say('peLicGone');
    if (left > SOON_DAYS) return null;
    return say('peLicIn', { d: left });
  }

  function rowSub(m, d, sc) {
    var bits = [];
    bits.push(say('peSubScore', { score: sc && sc.score != null ? sc.score : '—' }));
    if (sc) bits.push(say('peIncN', null, sc.incidents));
    var lic = licenceClause(m, d);
    if (lic) bits.push(lic);
    /* A joiner saved with no documents says so here and has a place in the
     * "Documents missing" filter — and it does NOT go to Attention until a
     * document exists and is expiring, because "110 of 110 missing documents"
     * is a count that could never reach zero ([E] `5eb8c6e`). Behind rule 1
     * like every other document fact. */
    if (canDocs(m, d) && docsMissing(d)) bits.push(say('peDocsMissingBadge'));
    if (d.status === 'left') bits.push(say('peLeftAlready'));
    return bits.join(' · ');
  }

  function matchesView(m, d, which) {
    if (which === 'left') return d.status === 'left';
    if (d.status === 'left') return false;
    if (which === 'docs') return docsMissing(d);
    return true;
  }

  /* Worst first, and an UNKNOWN score is not the worst — it sorts to the end,
   * because "we could not work it out" and "41 out of 100" must never look
   * alike. */
  function byWorst(scores) {
    return function (a, b) {
      var x = scores[a.id] && scores[a.id].score;
      var y = scores[b.id] && scores[b.id].score;
      if (x == null && y == null) return String(a.name || '').localeCompare(String(b.name || ''));
      if (x == null) return 1;
      if (y == null) return -1;
      return x - y || String(a.name || '').localeCompare(String(b.name || ''));
    };
  }

  function crewModel(m) {
    var store = rows(m, 'drivers');
    var which = viewsFor(m).indexOf(view) === -1 ? 'worst' : view;
    if (unread(store)) return { loading: true, view: which };
    var all = live(store), picked = [], i;
    for (i = 0; i < all.length; i++) if (matchesView(m, all[i], which)) picked.push(all[i]);
    var scores = scoreIndex(m);
    picked.sort(byWorst(scores));
    return { loading: false, view: which, scores: scores, total: picked.length,
             shown: picked.slice(0, CREW_CAP), anyCrew: all.length > 0 };
  }

  function crewRow(m, d, sc) {
    var reg = d.busId ? regOf(m, d.busId) : '';
    var head = [d.name || d.id, say(crewRoleOf(d) === 'conductor' ? 'peRoleConductor' : 'peRoleDriver')];
    if (reg) head.push(reg);
    return '<a class="v2row pe-person" href="#" data-person="' + esc(d.id) + '">'
      + '<span class="lead">' + draw('person', MARK) + '</span>'
      + '<span class="t">' + esc(head.join(' · ')) + '</span>'
      + '<span class="sub">' + esc(rowSub(m, d, sc)) + '</span>'
      + '<span class="act">' + fig(sc ? sc.score : null, { unit: '/100' }) + '</span></a>';
  }

  function crewList(m, v) {
    if (v.loading) return skel(12);
    if (!v.anyCrew) {
      /* Three different nothings, and they must not look alike. No signal and
       * nothing local is the offline state; a read that FAILED is an error with
       * a Retry (cache.js leaves `[]` for both a failure and an empty store, so
       * the sync error is the only thing that tells them apart); and a store
       * that really is empty is the empty state with the one next thing to do.
       */
      if (m.offline) return offState();
      if (syncError()) return errState(say('peError'));
      return empty(say('peEmpty'), 'person', say('peEmptyHint'));
    }
    if (!v.shown.length) {
      if (v.view === 'left') return empty(say('peEmptyLeft'), 'person');
      if (v.view === 'docs') return empty(say('peEmptyDocs'), 'doc');
      return empty(say('peEmpty'), 'person', say('peEmptyHint'));
    }
    var out = '', i;
    for (i = 0; i < v.shown.length; i++) {
      out += crewRow(m, v.shown[i], v.scores[v.shown[i].id]);
    }
    // One item draws no count line (§2.10).
    if (v.total > 1) {
      var id = v.total > CREW_CAP ? 'peCountCap' : 'peCount';
      out += '<p class="pe-count">' + esc(say(id, { total: group(v.total), shown: group(v.shown.length) })) + '</p>';
    }
    return out;
  }

  /* The freshness line, and the ONLY place on this screen an age appears: a
   * list states its freshness once, in its header. */
  /* The freshness line, and the screen's ONE aggregate figure — so it is the
   * one figure that carries `at` and `stale`. A row's score is a per-record
   * reading and is not made stale by a short replica; marking it so would put a
   * `.figure-note` in all 164 rows, which is the rule this line exists to
   * satisfy instead. */
  function header(m, v) {
    var at = lastSyncAt();
    var head = v.loading ? fig(null, null)
      : fig(v.total, { at: m.offline ? null : at, stale: m.stale,
                       format: function (n) { return group(n); } });
    var off = m.offline
      ? ' <span class="pe-off">' + draw('offline', 14) + ' '
        + esc(clock(at) ? say('peOffSince', { time: clock(at) }) : say('peOffEver')) + '</span>' : '';
    return '<p class="pe-fresh">' + head + ' ' + esc(say('peTabCrew')) + off + '</p>';
  }

  function tabBar(ids, cur, attr, labels) {
    var out = '', i;
    for (i = 0; i < ids.length; i++) {
      out += '<button type="button" role="tab" aria-selected="' + (ids[i] === cur ? 'true' : 'false')
        + '" data-' + attr + '="' + esc(ids[i]) + '">' + esc(say(labels[ids[i]])) + '</button>';
    }
    return '<div class="tabs" role="tablist">' + out + '</div>';
  }

  var TAB_WORD = { crew: 'peTabCrew', staff: 'peTabStaff', pins: 'peTabPins' };
  var VIEW_WORD = { worst: 'peFiltWorst', docs: 'peFiltDocs', left: 'peFiltLeft' };

  /* A `label.num`, which is in the one selector the delegated handler returns
   * early on — so a tap on the search box belongs to the box and can never
   * reach a row's handler. The mark is inside the label beside the words. */
  function findBox() {
    return '<label class="num pe-find"><span class="num-l">' + draw('search', DMARK) + ' '
      + esc(say('peFind')) + '</span>'
      + '<input class="field num-in" type="search" autocomplete="off" enterkeyhint="search"></label>';
  }

  function crewPane(m) {
    var v = crewModel(m);
    var add = can(m, 'manageDrivers')
      ? btn('peAdd', say('peAdd'), 'btn-primary pe-wide') : '';
    return header(m, v) + findBox()
      + tabBar(viewsFor(m), v.view, 'view', VIEW_WORD) + add
      + '<div class="pe-list">' + crewList(m, v) + '</div>';
  }

  /* ---------- the person ------------------------------------------------- */

  function whoCard(m, d) {
    var body = '<div class="greet"><span class="greet-av">' + draw('person', MARK) + '</span>'
      + '<div><div class="greet-hi">' + esc(d.name || d.id) + '</div>'
      + '<div class="small">' + esc([say(crewRoleOf(d) === 'conductor' ? 'peRoleConductor' : 'peRoleDriver'),
                                     d.busId ? regOf(m, d.busId) : say('peSeatNone')].join(' · ')) + '</div></div></div>';
    var joined = dateWords(d.joinedAt);
    if (joined) body += drow('clock', say('peJoined', { date: joined }), '');
    body += drow('bus', d.busId
      ? say('peSeat', { reg: regOf(m, d.busId),
                        role: say(crewRoleOf(d) === 'conductor' ? 'peRoleConductor' : 'peRoleDriver'),
                        slot: d.driverSlot || 1 })
      : say('peSeatNone'), '');
    /* The phone is in §2.5's single block, so it is behind rule 1 — and absent,
     * never a blanked row. */
    if (canDocs(m, d) && d.phone) body += drow('person', say('pePhone'), esc(d.phone));
    /* RULE 3. Absent without `money`, not masked and not greyed. The hiding is
     * cosmetic for `crewmanager` today — see the header. */
    if (canSalary(m) && d.salaryMonthly) {
      var f = fmtOf();
      body += drow('money', say('peSalary'),
                   esc(say('peSalaryMonth', { amount: f ? f.rupees(Number(d.salaryMonthly)) : d.salaryMonthly })));
    }
    return card(null, body);
  }

  function scoreCard(m, d) {
    var sc = scoreIndex(m)[d.id];
    if (!sc) return card(null, drow('star', say('peNoScore'), fig(null, null)));
    // The card names itself ONCE, in the `.stat`, and carries no heading of its
    // own: a card headed "Crew score" above a stat labelled "Crew score" is the
    // same words twice on the densest card of the screen.
    var body = '<div class="stat"><span class="k">' + esc(say('peScore')) + '</span>'
      + '<span class="v">' + fig(sc.score, { unit: '/100' }) + '</span></div>';
    for (var i = 0; i < sc.parts.length; i++) {
      var p = sc.parts[i];
      /* A part that cannot be read is the dash WITH ITS REASON, and the score is
       * still drawn: a score that silently drops a part is the five-bases bug in
       * a new place. */
      body += drow(p.mark, p.value == null ? p.label + ' · ' + p.reason : p.label + ' · ' + p.line,
                   fig(p.value, p.format ? { format: p.format } : null));
    }
    body += '<p class="pe-parts">' + esc(say('pePartsOf', { known: sc.known, total: sc.total })) + '</p>';
    return card(null, body);
  }

  /* RULE 1 and RULE 4 ON SCREEN. Either the whole block is drawn, or ONE LINE
   * stands in its place — never a card of blanked rows.
   *
   * What the reader is trusted with here: the documents and their dates, the
   * phone numbers, the emergency contact, the reference, and the face. The
   * document NUMBER is drawn because this screen's reader is the office that
   * types it; the document's URL is not drawn at all — it reaches an `<img>`
   * only through `photoGrid`/`V2.openPhoto`, which is what carries
   * `referrerpolicy="no-referrer"` and makes the tile a button rather than an
   * anchor. `GET /uploads/<32 hex>` needs no login (`02 §4.5`), so anybody
   * holding the URL holds the document: until stage-3 §7.5 authenticates that
   * route, the screen's rule is that the URL does not leave the image element.
   * No link, no copy, no share, no download, no toast. */
  function docsCard(m, d) {
    if (!canDocs(m, d)) {
      return card(say('peDocs'), '<p class="pe-hidden">' + esc(say('peDocsHidden')) + '</p>');
    }
    var held = (d.docs || {}), body = '', tiles = [], i;
    for (i = 0; i < DOCS.length; i++) {
      var def = DOCS[i], cur = held[def.key] || null;
      var right = '';
      if (!cur || (!cur.photo && !cur.number)) {
        right = badge('warn', 'warn', say('peDocMissing'));
      } else if (def.expiry && cur.expiry) {
        var left = daysLeft(cur.expiry);
        right = left == null ? esc(say('peDocOnFile'))
          : (left < 0 ? badge('bad', 'bad', say('peDocExpired'))
            : (left <= SOON_DAYS ? badge('warn', 'clock', say('peDocExpIn', { d: left }))
              : esc(say('peDocOnFile'))));
      } else {
        right = esc(say('peDocOnFile'));
      }
      var label = say(def.word) + (cur && cur.number ? ' · ' + cur.number : '');
      body += drow('doc', label, right);
      if (cur && cur.photo) tiles.push({ url: cur.photo, caption: say(def.word),
                                         local: /^data:/.test(String(cur.photo)) });
    }
    // The face photo, by the same rule as the documents (rule 4). The server
    // still sends it to every role; this screen does not draw it for them.
    if (d.photo) tiles.push({ url: d.photo, caption: say('peFace'), local: /^data:/.test(String(d.photo)) });
    if (tiles.length && typeof root.photoGrid === 'function') body += root.photoGrid(tiles, {});
    var emg = [d.emgName, d.emgRelation, d.emgPhone].filter(Boolean).join(' · ');
    if (emg) body += drow('person', say('peEmergency'), esc(emg));
    var ref = [d.refName, d.refPhone].filter(Boolean).join(' · ');
    if (ref) body += drow('person', say('peReference'), esc(ref));
    if (d.altPhone) body += drow('person', say('peAltPhone'), esc(d.altPhone));
    /* The capture needs the network, and the control is absent offline with the
     * reason said in the body BEFORE anything is pressed (§2.10 offline). */
    if (m.offline) body += '<p class="pe-hint">' + esc(say('peNeedsNet')) + '</p>';
    else body += btn('peDocAdd', say('peDocAdd'), 'pe-wide', { person: d.id });
    return card(say('peDocs'), body);
  }

  function incidentsCard(m, d) {
    var store = rows(m, 'incidents');
    var body = '';
    if (unread(store)) body = skel(3);
    else {
      var mine = [], i;
      for (i = 0; i < store.length; i++) {
        if (store[i] && !store[i]._deleted && store[i].driverId === d.id) mine.push(store[i]);
      }
      mine.sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
      if (!mine.length) body = empty(say('peIncNone'), 'ok');
      else {
        var f = fmtOf();
        for (i = 0; i < mine.length && i < INC_CAP; i++) {
          var r = mine[i];
          var kind = (INCIDENT[r.type] || INCIDENT.other).word;
          var sub = [dateWords(r.at), r.note].filter(Boolean).join(' · ');
          body += '<div class="v2row"><span class="lead">' + draw('warn', MARK) + '</span>'
            + '<span class="t">' + esc(say(kind)) + '</span>'
            + '<span class="sub">' + esc(sub) + '</span>'
            + '<span class="act">' + (r.cost ? esc(f ? f.rupees(Number(r.cost)) : r.cost) : '') + '</span></div>';
        }
      }
    }
    if (can(m, 'logIncident')) body += btn('peIncLog', say('peIncLog'), 'pe-wide', { person: d.id });
    return card(say('peIncidents'), body);
  }

  /* Their reviews. The attribution index does not exist on a device — see
   * crewIndex — so this card says where the reviews are read rather than
   * drawing an empty list, which would read as "no reviews". */
  function reviewsCard() {
    return card(say('peReviews'), drow('review', say('peNoRvTrace'), fig(null, null)));
  }

  function noteLines(n) {
    var hi = n && n.hi ? n.hi : {}, en = n && n.en ? n.en : {};
    var keys = [['good', 'peCoachGood'], ['fix', 'peCoachFix'], ['tip', 'peCoachTip']];
    var out = '';
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i][0];
      // Both languages, because the note is read out to the crew member in one
      // and approved by a reader of the other.
      var both = [en[k], hi[k]].filter(Boolean).join(' · ');
      if (both) out += drow('star', say(keys[i][1]) + ' · ' + both, '');
    }
    return out;
  }

  function weekOf(n) { return String((n && n.week) || ''); }

  function draftFor(m, d) {
    var store = rows(m, 'coachai');
    if (unread(store)) return undefined;
    var best = null;
    for (var i = 0; i < store.length; i++) {
      var n = store[i];
      if (!n || n._deleted || n.crewId !== d.id || n.status !== 'draft') continue;
      if (!best || weekOf(n) > weekOf(best)) best = n;
    }
    return best;
  }

  /* THE COACHING NOTE IS THE OPPOSITE OF THE LOG AND MUST NEVER LOOK LIKE IT
   * (§2.6). It is FOR the person — `/my/coaching` returns it to them and
   * approving it sends it — so it carries the opposite label in the same
   * words-first style, it sits ABOVE the incidents card, and the log sits at the
   * bottom of the screen. Different cards, different buttons, never adjacent in
   * the DOM order. */
  function coachCard(m, d) {
    var n = draftFor(m, d);
    var label = '<p class="pe-label">' + esc(say('peCoachLabel', { name: d.name || '' })) + '</p>';
    if (n === undefined) return card(say('peCoach'), label + skel(3));
    if (!n) return card(say('peCoach'), label + empty(say('peCoachNone'), 'star'));
    var body = label + noteLines(n);
    /* Approving needs the network and is NEVER drawn optimistically: on a 30–36
     * second cold server a button that is withdrawn is a button somebody presses
     * twice. Offline it is absent, with the reason in the body. */
    if (m.offline) body += '<p class="pe-hint">' + esc(say('peNeedsNet')) + '</p>';
    else {
      /* Both halves carry the person as well as the note, so the decision does
       * not depend on the route still being where it was when the card was
       * drawn: the subject rule is re-checked against the record, not against a
       * remembered id. */
      body += btn('peCoachOk', say('peCoachApprove'), 'btn-primary pe-wide',
                  { note: n.id, person: d.id })
        + btn('peCoachSkip', say('peCoachSkip'), 'pe-wide', { note: n.id, person: d.id });
    }
    return card(say('peCoach'), body);
  }

  /* RULE 2 ON SCREEN. The label is ABOVE the list and always drawn: the reader
   * has to know what kind of writing this is before they write. There is no
   * edit control and no delete control — not disabled ones, absent ones —
   * because `crewnotes` is immutable and undeletable in the store, owner
   * included (`02 §4.4`). */
  function logCard(m, d) {
    var store = rows(m, 'crewnotes');
    var label = '<p class="pe-label">' + esc(say('peLogLabel', { name: d.name || '' })) + '</p>';
    var body = label;
    if (unread(store)) body += skel(3);
    else {
      var mine = [], i;
      for (i = 0; i < store.length; i++) {
        var n = store[i];
        if (!n || n._deleted || n.crewId !== d.id) continue;
        mine.push(n);
      }
      mine.sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
      if (!mine.length) body += empty(say('peLogEmpty'), 'review');
      else {
        for (i = 0; i < mine.length && i < NOTE_CAP; i++) {
          var r = mine[i];
          var kindWord = 'peKindOther', k;
          for (k = 0; k < NOTE_KINDS.length; k++) if (NOTE_KINDS[k].key === r.kind) kindWord = NOTE_KINDS[k].word;
          var who = [dateWords(r.at), nameOfUser(m, r.by)].filter(Boolean).join(' · ');
          body += '<div class="v2row"><span class="lead">' + draw('review', MARK) + '</span>'
            + '<span class="t">' + esc(say(kindWord) + ' · ' + who) + '</span>'
            + '<span class="sub">' + esc(r.text || '') + '</span></div>';
        }
      }
    }
    body += btn('peLogNew', say('peLogWrite'), 'pe-wide', { person: d.id });
    return card(say('peLog'), body);
  }

  function rollCard(m, d) {
    var body = '';
    if (d.status === 'left') {
      /* RULE 4: the exit fields are behind the documents rule. The STATUS is
       * not one of them, so the roll still says the person left — it is the
       * date, the reason, the note and the rehire flag that the server sends to
       * every role today and that this card does not draw for them (§7.4). */
      if (canDocs(m, d)) {
        var when = dateWords(d.leftAt);
        body += drow('clock', when ? say('peLeftOn', { date: when }) : say('peLeftAlready'), '');
        if (d.leftReasonKey || d.leftNote) {
          var rWord = 'peReasonOther', i;
          for (i = 0; i < EXIT_REASONS.length; i++) if (EXIT_REASONS[i].key === d.leftReasonKey) rWord = EXIT_REASONS[i].word;
          body += drow('edit', say('peLeftReason'), esc([say(rWord), d.leftNote].filter(Boolean).join(' — ')));
        }
        if (d.rehire) {
          var hWord = d.rehire === 'yes' ? 'peRehireYes' : d.rehire === 'no' ? 'peRehireNo' : 'peRehireMaybe';
          body += drow('person', say('peRehire'), esc(say(hWord)));
        }
      } else {
        body += drow('clock', say('peLeftAlready'), '');
      }
      return card(say('peRoll'), body);
    }
    // Absent without manageDrivers, and absent on somebody already left.
    if (!can(m, 'manageDrivers')) return '';
    return card(say('peRoll'), btn('peLeave', say('peMarkLeft'), 'btn-danger pe-wide', { person: d.id }));
  }

  /* Each card inside its own guard: one card failing inside a person does not
   * blank the person (§2.10 error). That card takes its own errorState and the
   * rest stays. */
  function guarded(fn, m, d, heading) {
    try {
      var html = fn(m, d);
      return html == null ? '' : String(html);
    } catch (e) {
      if (typeof console !== 'undefined' && console.error) {
        console.error('[v2] people: a card could not be drawn', e);
      }
      return card(heading, errState(say('peCardFailed')));
    }
  }

  function personPane(m, id) {
    var store = rows(m, 'drivers');
    if (unread(store)) return skel(8);
    var d = byId(live(store), id);
    if (!d) return empty(say('peGone'), 'person');
    var body = '<a class="btn btn-quiet pe-back" href="#" data-person="">'
      + draw('back', MARK) + ' ' + esc(say('peBack')) + '</a>';
    body += guarded(whoCard, m, d, null);
    body += guarded(scoreCard, m, d, say('peScore'));
    body += guarded(docsCard, m, d, say('peDocs'));
    // The coaching card sits ABOVE the incidents card and the log at the
    // bottom, so the two can never be read as the same kind of writing (§2.6).
    if (canCoach(m, d)) body += guarded(coachCard, m, d, say('peCoach'));
    body += guarded(incidentsCard, m, d, say('peIncidents'));
    body += guarded(reviewsCard, m, d, say('peReviews'));
    if (canLog(m, d)) body += guarded(logCard, m, d, say('peLog'));
    body += guarded(rollCard, m, d, say('peRoll'));
    return '<div class="pe-detail">' + body + '</div>';
  }

  /* ---------- crew PINs (§2.9) ------------------------------------------- */

  function crewOnBus(m, busId) {
    var all = live(list(m, 'drivers')), out = [], i;
    for (i = 0; i < all.length; i++) {
      if (all[i].busId === busId && all[i].status !== 'left') out.push(all[i]);
    }
    return out;
  }

  /* PINs are minted BY BUS, not for the whole roll: 165 of them were read out
   * one by one over five to six hours (`v2-ux.md §2.3` friction #6), for an app
   * those people do not open. */
  function pinsPane(m) {
    var buses = live(list(m, 'buses'));
    if (!buses.length) return empty(say('pePinsNoBuses'), 'bus');
    var out = '', i;
    buses.sort(function (a, b) { return String(a.regNo || '').localeCompare(String(b.regNo || '')); });
    for (i = 0; i < buses.length; i++) {
      var crew = crewOnBus(m, buses[i].id);
      out += '<div class="v2row"><span class="lead">' + draw('bus', MARK) + '</span>'
        + '<span class="t">' + esc(buses[i].regNo || buses[i].id) + '</span>'
        + '<span class="sub">' + esc(crew.length ? crewNames(crew) : say('pePinsNoCrew')) + '</span>'
        + '<span class="act">' + count(crew.length) + '</span></div>';
      /* Minting needs the network (`POST /auth/register-roster`), so the row
       * says so BEFORE it is pressed rather than after, and offline the control
       * is absent. */
      if (!crew.length) continue;
      out += m.offline
        ? '<p class="pe-hint">' + esc(say('peNeedsNet')) + '</p>'
        : btn('pePins', say('pePinsMake', { crew: crew.length }), 'pe-wide', { bus: buses[i].id });
    }
    return out;
  }

  function crewNames(crew) {
    var names = [], i;
    for (i = 0; i < crew.length; i++) names.push(crew[i].name || crew[i].id);
    return names.join(' · ');
  }

  /* ---------- staff logins (§2.9) ---------------------------------------- */

  function manageable(role) {
    if (String(role) === 'owner') return ROLES.slice();
    var out = [], i;
    for (i = 0; i < ROLES.length; i++) {
      if (SUPERVISOR_MANAGES.indexOf(ROLES[i].key) !== -1) out.push(ROLES[i]);
    }
    return out;
  }

  function roleWord(key) {
    for (var i = 0; i < ROLES.length; i++) if (ROLES[i].key === key) return ROLES[i].word;
    return 'peRoleOffice';
  }

  function staffPane(m) {
    var all = live(list(m, 'users'));
    var me = user(m) || {};
    var out = btn('peStaffNew', say('peStaffAdd'), 'btn-primary pe-wide');
    var shown = [], i;
    for (i = 0; i < all.length; i++) {
      // Crew logins are the PINs tab's business; this tab is the staff accounts.
      if (all[i].role === 'driver' || all[i].role === 'conductor') continue;
      shown.push(all[i]);
    }
    if (!shown.length) return out + empty(say('peStaffNone'), 'person');
    shown.sort(function (a, b) { return String(a.name || '').localeCompare(String(b.name || '')); });
    for (i = 0; i < shown.length; i++) {
      var u = shown[i];
      /* Delete is OWNER-ONLY, not self, and the line says why rather than
       * leaving a missing control unexplained. A supervisor sees no delete at
       * all — absent, not disabled. */
      var ownRow = u.id === me.id;
      var del = (String(m.role) === 'owner' && !ownRow)
        ? btn('peStaffDel', say('peStaffDelete'), 'btn-quiet', { who: u.id })
        : (ownRow && String(m.role) === 'owner'
          ? '<span class="pe-hint">' + esc(say('peStaffNoSelf')) + '</span>' : '');
      out += '<div class="v2row"><span class="lead">' + draw('person', MARK) + '</span>'
        + '<span class="t">' + esc(u.name || u.id) + '</span>'
        + '<span class="sub">' + esc(say(roleWord(u.role))) + '</span>'
        + '<span class="act">' + del + '</span></div>';
    }
    return out;
  }

  /* ---------- render ----------------------------------------------------- */

  /* `mo` and not `model`, which is the name of the function an ACTION rebuilds
   * its own model with: render is handed the frame's model and must never reach
   * for a second one. */
  function render(m) {
    register();
    var mo = m || {};
    var allowed = tabsFor(mo);
    var cur = allowed.indexOf(tab) === -1 ? 'crew' : tab;
    var id = (mo.params && mo.params.id) || null;
    var desk = mo.density === 'desk';
    var store = rows(mo, 'drivers');

    var body;
    if (cur === 'staff') body = staffPane(mo);
    else if (cur === 'pins') body = pinsPane(mo);
    else if (id) {
      /* Master–detail at desk: the list stays beside the person (§2.2). At yard
       * the person replaces the list — one screen's width, one thing on it. */
      body = desk
        ? '<div class="pe-split"><div class="pe-master">' + crewPane(mo) + '</div>'
          + '<div class="pe-slave">' + personPane(mo, id) + '</div></div>'
        : personPane(mo, id);
    } else if (!unread(store) && desk && live(store).length === 1) {
      // One person at desk opens that person rather than an empty right pane.
      body = '<div class="pe-split"><div class="pe-master">' + crewPane(mo) + '</div>'
        + '<div class="pe-slave">' + personPane(mo, live(store)[0].id) + '</div></div>';
    } else {
      body = crewPane(mo);
    }

    /* A tab whose gate the reader does not hold is ABSENT, so the bar is only
     * drawn when there is more than one thing to choose between: one tab is a
     * lie about there being somewhere else to go. */
    var bar = allowed.length > 1 ? tabBar(allowed, cur, 'tab', TAB_WORD) : '';
    return '<div class="pe">' + bar + body + '</div>';
  }

  /* ---------- the one delegated listener --------------------------------- */

  var bound = false;
  var writing = false;              // a write is in flight
  var pendingPhoto = '';            // the last capture, waiting for its write
  var dupSeen = false;              // the joiner's duplicate list has been shown
  /* The minted PINs, for the life of ONE sheet. Never a row, never a toast,
   * never a note, never `usage`, and never localStorage — which is where v1
   * kept them. */
  var mintedPins = null;

  /* THE STORES THIS SCREEN READS, MINUS ONE. `dutylog` (where a crew member has
   * been) and `coachai` (the coaching drafts) are in no other load list in all
   * of v2, and `crewnotes` only reaches this device because it is in
   * `PullApply.FIRST_STORES` for a driver's Me. That is REV-FLOW F3 on this
   * screen.
   *
   * `gpsevents` is in `SCORE_STORES` and is deliberately NOT here, for the
   * reason `buses.js`'s own list gives at length: it is 40,000 rows against 700
   * for everything else, `pullapply.js` defers it from the first sync on that
   * measured ground, and the cost of a `getAll` over it is the one part of the
   * cost that cannot be measured from node. The crew score already says it was
   * built from three parts of four when a part is missing, which is the honest
   * state and not a blank. */
  var STORES = ['users', 'buses', 'drivers', 'attendance', 'incidents',
                'coachai', 'crewnotes', 'dutylog'];

  /* The read, and the only place this screen asks IndexedDB for anything. From
   * `mount()` and nowhere else; the `.then` is what puts the rows on screen
   * without waiting for `boot.js`'s next four-second tick, and `loading` keeps
   * a mount that lands mid-read from stacking a second one over the first. */
  var loading = false;

  function load() {
    var c = cacheMod();
    if (loading || !c || typeof c.load !== 'function') return null;
    loading = true;
    return c.load(STORES).then(function () { loading = false; reread(); },
                               function () { loading = false; });
  }

  // Only while this is still the screen on the page.
  function reread() {
    var r = router();
    var cur = r && r.current ? r.current() : null;
    if (!cur || cur.id !== ID) return;
    redraw();
  }

  function mount() {
    // The read is the first statement, above the listener guard. `duty.js`'s
    // mount says why the position and not the guard is the point.
    load();
    var d = doc();
    if (!d || typeof d.addEventListener !== 'function') return false;
    if (bound) return true;
    bound = true;
    d.addEventListener('click', onClick);
    /* `input` keeps the search live and the count honest while a thumb is still
     * on the box; `change` is the file capture's one event — a camera is reached
     * on Chrome 109 only through a label-wrapped file input, and the click on
     * that label must NOT be intercepted, which is exactly what the first line
     * of onClick guarantees. Neither can move the route. */
    d.addEventListener('input', onField);
    d.addEventListener('change', onField);
    return true;
  }

  /* The other half of `mount()`, and INTEGRATION-NOTES 17's step 2. `Shell.mount`
   * calls it when it mounts a different screen, so what `mount()` added comes
   * off exactly when this screen stops being the one on the page.
   *
   * It removes the SAME function references `mount()` registered — every handler
   * here is a named module-level function for that reason: `removeEventListener`
   * matches on identity, and a fresh closure per mount would remove nothing
   * while looking exactly like this. The flag goes back with them, or the screen
   * would never re-arm. */
  function unmount() {
    var d = doc();
    if (bound && d && typeof d.removeEventListener === 'function') {
      d.removeEventListener('click', onClick);
      d.removeEventListener('input', onField);
      d.removeEventListener('change', onField);
    }
    bound = false;
    return true;
  }

  function onClick(ev) {
    var t = ev && ev.target;
    if (!t || typeof t.closest !== 'function') return;

    /* THE LINE. A tap on a field, on its label or on a count cell belongs to
     * that field and to nothing else, and it is read BEFORE `[data-act]` and
     * `[data-person]` so a field inside a row can never reach the row's
     * handler. This exact check was missing once: a shelf-count field sat
     * inside a pressable row, the row's handler caught the click and the
     * storekeeper was thrown off the screen mid-count. */
    if (t.closest(FIELDS)) return;

    var tabEl = t.closest('[data-tab]');
    if (tabEl) {
      if (ev.preventDefault) ev.preventDefault();
      setTab(tabEl.getAttribute('data-tab'));
      go(null);
      return;
    }
    var viewEl = t.closest('[data-view]');
    if (viewEl) {
      if (ev.preventDefault) ev.preventDefault();
      setView(viewEl.getAttribute('data-view'));
      redraw();
      return;
    }
    var person = t.closest('[data-person]');
    if (person && !t.closest('[data-act]')) {
      if (ev.preventDefault) ev.preventDefault();
      go(person.getAttribute('data-person') || null);
      return;
    }
    var el = t.closest('[data-act]');
    if (!el) return;
    var act = el.getAttribute('data-act');
    if (!act || !has(ACTS, act)) return;
    if (ev.preventDefault) ev.preventDefault();
    try { ACTS[act](el); } catch (e) {
      if (typeof console !== 'undefined' && console.error) console.error('[v2] people: ' + act, e);
    }
  }

  /* The search filters the rows that are already drawn and updates the count
   * line, rather than re-rendering: a re-render per keystroke takes the focus
   * out of the box the thumb is in. Nothing here measures a row. */
  function onField(ev) {
    var t = ev && ev.target;
    if (!t || typeof t.closest !== 'function') return;
    if (t.closest('.pe-find')) { filterRows(t); return; }
    if (t.type === 'file') { takePhoto(t); return; }
  }

  function filterRows(input) {
    var d = doc();
    if (!d || !d.querySelectorAll) return;
    var q = String(input.value == null ? '' : input.value).toLowerCase().replace(/^\s+|\s+$/g, '');
    var list2 = d.querySelectorAll('.pe-person'), i, shown = 0;
    for (i = 0; i < list2.length; i++) {
      var hit = !q || String(list2[i].textContent || '').toLowerCase().indexOf(q) >= 0;
      list2[i].hidden = !hit;
      if (hit) shown++;
    }
    /* The count line is kept honest while the box is being typed in — a list
     * that says "164 shown" over three visible rows is the kind of small lie
     * that teaches people not to read the line at all. Only its text changes;
     * nothing is measured and nothing is re-rendered. */
    var line = d.querySelector ? d.querySelector('.pe-count') : null;
    if (line && 'textContent' in line) {
      line.textContent = say('peCount', { total: group(list2.length), shown: group(shown) });
    }
  }

  function paramsNow() {
    var r = router();
    var c = r && r.current ? r.current() : null;
    return (c && c.id === ID && c.params) || null;
  }

  // The route, not a sheet: a sheet two people hold at once is the whole-record
  // last-write-wins problem (`v2-ux.md §6`).
  function go(id) {
    var r = router();
    if (r && r.go) r.go(ID, id ? { id: id } : null);
    else redraw();
  }

  /* The model an action works from. `Shell.mount` hands `render` the frame's
   * own model and does not export it, so an action rebuilds it from the same
   * sources the frame uses rather than keeping a copy of the last render's: a
   * screen holding a stale model is a screen writing against data that moved. */
  function model() {
    var S = (root && root.S) || {};
    var b = (root && root.Boot) || null;
    var d = doc();
    var el = d && d.documentElement;
    var dens = (el && el.getAttribute && el.getAttribute('data-density'))
      || (b && b.density ? b.density() : 'yard');
    var rep = (b && b.replica ? b.replica() : null) || { behind: 0, complete: false };
    var i = {};
    try { var s = sync(); i = s && s.info ? s.info() : {}; } catch (e) { i = {}; }
    return { route: ID, params: paramsNow(), role: (S.user && S.user.role) || null,
             user: S.user || null, cache: S.cache || {},
             density: dens === 'desk' ? 'desk' : 'yard',
             replica: rep, stale: rep.complete !== true,
             offline: !!(i.lastError || i.status === 'offline'
                         || (root.navigator && root.navigator.onLine === false)) };
  }

  function sheet(title, html) {
    var V = overlay();
    if (V && typeof V.openSheet === 'function') V.openSheet(title, html);
  }

  function closeSheet() {
    var V = overlay();
    if (V && typeof V.closeSheet === 'function') V.closeSheet();
  }

  function toast(text, kind) {
    var V = overlay();
    if (V && typeof V.toast === 'function') V.toast(text, { kind: kind });
  }

  function confirmDialog(text, opts) {
    var V = overlay();
    if (V && typeof V.confirmDialog === 'function') return V.confirmDialog(text, opts);
    return { then: function () { return this; } };
  }

  /* While a write is in flight the control says what it is doing — no spinner,
   * no animation. `aria-disabled`, not `disabled`: the label has to stay
   * readable, and this is the one case the foundation allows it. */
  function working(el, word) {
    if (!el || !el.setAttribute) return;
    el.setAttribute('aria-disabled', 'true');
    if (typeof el.textContent === 'string' || el.textContent === '') el.textContent = word;
  }

  function field(id) {
    var d = doc();
    var el = d && d.getElementById ? d.getElementById(id) : null;
    return el && el.value != null ? String(el.value) : '';
  }

  function uid(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function stamp() {
    var s = sync();
    try { return s && s.now ? s.now() : Date.now(); } catch (e) { return Date.now(); }
  }

  function personOf(el) {
    var m = model();
    var id = el && el.getAttribute ? el.getAttribute('data-person') : null;
    if (!id) {
      var p = paramsNow();
      id = p && p.id;
    }
    return byId(live(list(m, 'drivers')), id);
  }

  function selectOf(id, items, cur) {
    var out = '', i;
    for (i = 0; i < items.length; i++) {
      out += '<option value="' + esc(items[i].key) + '"'
        + (cur === items[i].key ? ' selected' : '') + '>' + esc(say(items[i].word)) + '</option>';
    }
    return '<select class="select" id="' + esc(id) + '">' + out + '</select>';
  }

  function labelled(word, inner) {
    return '<label class="field"><span class="num-l">' + esc(say(word)) + '</span>' + inner + '</label>';
  }

  /* ---------- the conversation log write (§2.6) -------------------------- */

  /* The sheet SAYS the record cannot be changed before the text box, not after:
   * the reader has to know what kind of writing this is before they write. */
  function noteSheet(el) {
    var m = model();
    var d = personOf(el);
    if (!d || !canLog(m, d)) return;           // rule 2, on the write path too
    sheet(say('peLogWrite'),
      '<p class="pe-label">' + esc(say('peLogGuard')) + '</p>'
      + labelled('peLogKind', selectOf('pe-kind', NOTE_KINDS, 'talked'))
      + '<label class="field"><span class="num-l">' + esc(say('peLogWhat')) + '</span>'
      + '<textarea class="field" id="pe-note" rows="4"></textarea></label>'
      + '<p class="pe-hint">' + esc(say('peLogNotSaved')) + '</p>'
      + btn('peLogSave', say('peLogSave'), 'btn-primary pe-wide', { person: d.id }));
  }

  function saveNote(el) {
    var m = model();
    var D = db();
    var d = personOf(el);
    var text = field('pe-note').replace(/^\s+|\s+$/g, '');
    if (!d || !canLog(m, d) || !D || writing) return;
    if (!text) { el.setAttribute('aria-disabled', 'true'); return; }
    var u = user(m) || {};
    var now = stamp();
    working(el, say('peSaving'));
    writing = true;
    /* Existing fields only, in v1's own shape (`saveCrewNote`). Under
     * whole-record last-write-wins a field v2 invents is erased the next time a
     * v1 device writes the record. */
    var rec = { id: uid('cn-'), crewId: d.id, at: now, by: u.id || null,
                kind: field('pe-kind') || 'talked', text: text,
                scoreAt: null, starsAt: null, reviewsAt: 0,
                createdAt: now, updatedAt: now };
    var sc = scoreIndex(m)[d.id];
    if (sc && sc.score != null) rec.scoreAt = sc.score;
    Promise.resolve(D.put('crewnotes', rec)).then(function () {
      writing = false;
      closeSheet();
      toast(say('peLogSaved'), 'ok');
      redraw();
    }, function () {
      writing = false;
      toast(say('peSaveFailed'), 'bad');
    });
  }

  /* ---------- an incident ------------------------------------------------ */

  function incidentSheet(el) {
    var m = model();
    var d = personOf(el);
    if (!d || !can(m, 'logIncident')) return;
    var kinds = [], k;
    for (k in INCIDENT) if (has(INCIDENT, k)) kinds.push({ key: k, word: INCIDENT[k].word });
    sheet(say('peIncLog'),
      labelled('peIncKind', selectOf('pe-inc-kind', kinds, 'scratch'))
      + '<label class="num"><span class="num-l">' + esc(say('peIncCostField')) + '</span>'
      + '<input class="field num-in" id="pe-inc-cost" type="text" inputmode="numeric" pattern="[0-9]*"'
      + ' autocomplete="off" enterkeyhint="done" data-kind="whole"></label>'
      + '<label class="field"><span class="num-l">' + esc(say('peIncNote')) + '</span>'
      + '<textarea class="field" id="pe-inc-note" rows="3"></textarea></label>'
      + btn('peIncSave', say('peLogSave'), 'btn-primary pe-wide', { person: d.id }));
  }

  function saveIncident(el) {
    var m = model();
    var D = db();
    var d = personOf(el);
    if (!d || !can(m, 'logIncident') || !D || writing) return;
    var u = user(m) || {};
    working(el, say('peSaving'));
    writing = true;
    var cost = Number(String(field('pe-inc-cost')).replace(/[^0-9]/g, ''));
    var rec = { id: uid('inc-'), driverId: d.id, type: field('pe-inc-kind') || 'other',
                at: stamp(), cost: isFinite(cost) ? cost : 0,
                note: field('pe-inc-note').replace(/^\s+|\s+$/g, ''), by: u.id || null };
    Promise.resolve(D.put('incidents', rec)).then(function () {
      writing = false;
      closeSheet();
      redraw();
    }, function () {
      writing = false;
      toast(say('peSaveFailed'), 'bad');
    });
  }

  /* ---------- the coaching decision -------------------------------------- */

  function decide(el, decision) {
    var m = model();
    var s = sync();
    var d = personOf(el);
    var noteId = el && el.getAttribute ? el.getAttribute('data-note') : null;
    if (!noteId || !d || !canCoach(m, d) || !s || typeof s.coachDecide !== 'function') return;
    if (m.offline || writing) return;
    working(el, say('peCoachSending'));
    writing = true;
    Promise.resolve(s.coachDecide(noteId, decision)).then(function () {
      writing = false;
      toast(say(decision === 'approve' ? 'peCoachSent' : 'peCoachSkipped'), 'ok');
      redraw();
    }, function () {
      writing = false;
      toast(say('peSaveFailed'), 'bad');
    });
  }

  /* ---------- documents: the write path, behind the same predicate ------- */

  function docSheet(el) {
    var m = model();
    var d = personOf(el);
    /* RULE 1 ON THE WRITE PATH. The original bug was on both paths, so the
     * predicate is the same one the card uses — not a second reading of it. */
    if (!d || !canDocs(m, d)) return;
    if (m.offline) { toast(say('peNeedsNet'), 'warn'); return; }
    pendingPhoto = '';
    var cap = typeof root.photoCapture === 'function' ? root.photoCapture(say('peDocAdd'), 'peDoc') : '';
    sheet(say('peDocAdd'),
      labelled('peDocs', selectOf('pe-doc-kind', DOCS, 'license'))
      + '<div class="photos">' + cap + '</div>'
      + btn('peDocSave', say('peLogSave'), 'btn-primary pe-wide', { person: d.id }));
  }

  /* A capture's bytes. The upload is attempted and the DATA URL is the fallback
   * — the record keeps the photograph either way, so a capture is never thrown
   * away because the network was not there. */
  function takePhoto(t) {
    if (!t.files || !t.files[0]) return;
    var reader = root && root.FileReader ? new root.FileReader() : null;
    if (!reader) return;
    reader.onload = function () {
      var data = String(reader.result || '');
      pendingPhoto = data;
      var s = sync();
      if (!s || typeof s.uploadPhoto !== 'function') return;
      Promise.resolve(s.uploadPhoto(data)).then(function (url) {
        if (url) pendingPhoto = url;
      }, function () { /* the data URL stands: the photograph is not lost */ });
    };
    try { reader.readAsDataURL(t.files[0]); } catch (e) { /* nothing to read */ }
  }

  function saveDoc(el) {
    var m = model();
    var D = db();
    var d = personOf(el);
    if (!d || !canDocs(m, d) || !D || writing || !pendingPhoto) return;
    var key = field('pe-doc-kind') || 'license';
    working(el, say('peSaving'));
    writing = true;
    var docs = {}, k;
    for (k in (d.docs || {})) if (has(d.docs, k)) docs[k] = d.docs[k];
    var cur = {};
    for (k in (docs[key] || {})) if (has(docs[key], k)) cur[k] = docs[key][k];
    cur.photo = pendingPhoto;
    docs[key] = cur;
    // The whole record, with one field changed: the store is whole-record
    // last-write-wins and a partial put is a record with holes in it.
    var rec = {};
    for (k in d) if (has(d, k)) rec[k] = d[k];
    rec.docs = docs;
    rec.updatedAt = stamp();
    Promise.resolve(D.put('drivers', rec)).then(function () {
      writing = false;
      pendingPhoto = '';
      closeSheet();
      redraw();
    }, function () {
      writing = false;
      toast(say('peSaveFailed'), 'bad');
    });
  }

  /* ---------- add a joiner, with duplicate detection (§2.7) -------------- */

  function joinSheet() {
    var m = model();
    if (!can(m, 'manageDrivers')) return;
    dupSeen = false;
    sheet(say('peAdd'),
      '<label class="field"><span class="num-l">' + esc(say('peJoinName')) + '</span>'
      + '<input class="field" id="pe-name" type="text" autocomplete="off"></label>'
      + labelled('peJoinRole', selectOf('pe-crew-role',
          [{ key: 'driver', word: 'peRoleDriver' }, { key: 'conductor', word: 'peRoleConductor' }], 'driver'))
      + '<label class="num"><span class="num-l">' + esc(say('peJoinPhone')) + '</span>'
      + '<input class="field num-in" id="pe-phone" type="text" inputmode="tel" autocomplete="off"></label>'
      + '<div class="pe-dup"></div>'
      + btn('peJoinSave', say('peJoinSave'), 'btn-primary pe-wide'));
  }

  function foldName(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').replace(/^ | $/g, '');
  }

  function last10(s) {
    var d = String(s == null ? '' : s).replace(/[^0-9]/g, '');
    return d.length > 10 ? d.slice(-10) : d;
  }

  /* Duplicate detection runs BEFORE the save, not after, and it is a local read
   * — so it works offline. Every status is searched, `active`, `left` and
   * `archived`, because the record the office is about to retype is most often
   * one that left. */
  function duplicates(m, name, phone) {
    var all = live(list(m, 'drivers'));
    var n = foldName(name), p = last10(phone);
    var out = [], i;
    for (i = 0; i < all.length; i++) {
      var d = all[i];
      var hitName = n && foldName(d.name) === n;
      var hitPhone = p && (last10(d.phone) === p || last10(d.altPhone) === p);
      if (hitName || hitPhone) out.push({ d: d, byPhone: !!hitPhone });
    }
    return out;
  }

  function dupList(m, hits) {
    var out = '<p class="pe-label">' + esc(say('peDupTitle')) + '</p>', i;
    for (i = 0; i < hits.length; i++) {
      var d = hits[i].d;
      var bits = [d.name || d.id, say(crewRoleOf(d) === 'conductor' ? 'peRoleConductor' : 'peRoleDriver')];
      if (d.busId) bits.push(regOf(m, d.busId));
      // The exit DATE is behind rule 4; the status is not.
      if (d.status === 'left') bits.push(canDocs(m, d) && dateWords(d.leftAt)
        ? say('peLeftOn', { date: dateWords(d.leftAt) }) : say('peLeftAlready'));
      out += '<div class="v2row"><span class="lead">' + draw('person', MARK) + '</span>'
        + '<span class="t">' + esc(bits.join(' · ')) + '</span>'
        + '<span class="act">'
        + (d.status === 'left'
          ? btn('peRehireDo', say('peDupBack'), 'btn-quiet', { person: d.id })
          : btn('peDupOpen', say('peDupOpen'), 'btn-quiet', { person: d.id }))
        + '</span></div>';
    }
    /* "Add anyway" is always available and is NEVER the default: 107 drivers and
     * 57 conductors share first names heavily, so a name-only match is a
     * question and not a block. */
    out += btn('peJoinSave', say('peDupAnyway'), 'btn-quiet pe-wide', { force: 'yes' });
    return out;
  }

  function saveJoiner(el) {
    var m = model();
    var D = db();
    if (!can(m, 'manageDrivers') || !D || writing) return;
    var name = field('pe-name').replace(/^\s+|\s+$/g, '');
    var phone = field('pe-phone').replace(/^\s+|\s+$/g, '');
    if (!name || !phone) { toast(say('peNeedNamePhone'), 'warn'); return; }
    var force = (el && el.getAttribute && el.getAttribute('data-force')) === 'yes';
    if (!force && !dupSeen) {
      var hits = duplicates(m, name, phone);
      if (hits.length) {
        dupSeen = true;
        var d = doc();
        var box = d && d.querySelector ? d.querySelector('.pe-dup') : null;
        if (box && 'innerHTML' in box) box.innerHTML = dupList(m, hits);
        return;
      }
    }
    working(el, say('peSaving'));
    writing = true;
    var now = stamp();
    /* Created on the FIRST save with the minimum that makes a real record, so
     * an interruption leaves a person on the roll rather than a draft on one
     * phone. Documents, seat and salary are added to a record that exists. */
    var rec = { id: uid('crew-'), name: name, crewRole: field('pe-crew-role') || 'driver',
                phone: phone, altPhone: '', busId: null, driverSlot: null, userId: null,
                status: 'active', joinedAt: now, tripsLogged: 0, salaryMonthly: 0,
                docs: {}, photo: '', source: 'v2-people',
                createdAt: now, updatedAt: now };
    Promise.resolve(D.put('drivers', rec)).then(function () {
      writing = false;
      closeSheet();
      go(rec.id);
    }, function () {
      writing = false;
      toast(say('peSaveFailed'), 'bad');
    });
  }

  // "Bring back" writes the EXISTING record rather than making a second one.
  function rehire(el) {
    var m = model();
    var D = db();
    var d = personOf(el);
    if (!d || !can(m, 'manageDrivers') || !D || writing) return;
    working(el, say('peSaving'));
    writing = true;
    var rec = {}, k;
    for (k in d) if (has(d, k)) rec[k] = d[k];
    rec.status = 'active';
    rec.leftAt = null; rec.leftReason = ''; rec.leftReasonKey = null; rec.leftNote = '';
    rec.rehire = null; rec.rejoinedAt = stamp(); rec.updatedAt = stamp();
    Promise.resolve(D.put('drivers', rec)).then(function () {
      writing = false;
      closeSheet();
      go(rec.id);
    }, function () {
      writing = false;
      toast(say('peSaveFailed'), 'bad');
    });
  }

  /* ---------- mark a leaver (§2.8) --------------------------------------- */

  function leaveSheet(el) {
    var m = model();
    var d = personOf(el);
    if (!d || !can(m, 'manageDrivers') || d.status === 'left') return;
    sheet(say('peMarkLeft'),
      labelled('peLeftReason', selectOf('pe-exit-reason', EXIT_REASONS, 'left'))
      + '<label class="field"><span class="num-l">' + esc(say('peLeftNote')) + '</span>'
      + '<textarea class="field" id="pe-exit-note" rows="3"></textarea></label>'
      + '<label class="field"><span class="num-l">' + esc(say('peLeftDay')) + '</span>'
      + '<input class="field" id="pe-exit-date" type="date"></label>'
      + labelled('peRehire', selectOf('pe-exit-rehire',
          [{ key: 'yes', word: 'peRehireYes' }, { key: 'maybe', word: 'peRehireMaybe' },
           { key: 'no', word: 'peRehireNo' }], 'maybe'))
      + btn('peLeaveSave', say('peMarkLeft'), 'btn-danger pe-wide', { person: d.id }));
  }

  /* The confirm NAMES THE CONSEQUENCE — the seat that becomes empty tonight —
   * because nothing clears a seat the person did not touch (`05 §4` row 26):
   * the seat is named before the press rather than discovered on the duty board
   * at 20:00. Focus starts on Cancel (overlay.js puts it on the no button). */
  function saveLeaver(el) {
    var m = model();
    var D = db();
    var d = personOf(el);
    if (!d || !can(m, 'manageDrivers') || !D || writing) return;
    var reg = d.busId ? regOf(m, d.busId) : '';
    var text = say('peLeftAsk', { name: d.name || '' }) + ' '
      + (reg ? say('peLeftSeat', { reg: reg }) : say('peLeftNoSeat'));
    var reason = field('pe-exit-reason') || 'left';
    var note = field('pe-exit-note').replace(/^\s+|\s+$/g, '');
    var day = field('pe-exit-date');
    var rehireAnswer = field('pe-exit-rehire') || 'maybe';
    confirmDialog(text, { title: say('peMarkLeft'), yes: say('peMarkLeft'), danger: true })
      .then(function (yes) {
        if (!yes) return;
        working(el, say('peSaving'));
        writing = true;
        var when = day ? Date.parse(day + 'T00:00:00') : stamp();
        var rec = {}, k;
        for (k in d) if (has(d, k)) rec[k] = d[k];
        var reasonWord = 'peReasonOther';
        for (k = 0; k < EXIT_REASONS.length; k++) if (EXIT_REASONS[k].key === reason) reasonWord = EXIT_REASONS[k].word;
        rec.status = 'left';
        rec.leftAt = when !== when ? stamp() : when;
        rec.leftReasonKey = reason;
        rec.leftNote = note;
        // English, for the CSV, exactly as v1 writes it.
        rec.leftReason = [WORDS[reasonWord].en, note].filter(Boolean).join(' — ');
        rec.rehire = rehireAnswer;
        rec.busId = null;
        rec.driverSlot = null;
        rec.updatedAt = stamp();
        var u = user(m) || {};
        /* One `dutylog` row with the reason, append-only and immutable, with
         * `by` from the token: the duty board only knows who is on a bus now,
         * and this is who was on it on a given day. */
        var log = { id: uid('dl-'), crewId: d.id, crewName: d.name || '', busId: d.busId || null,
                    role: crewRoleOf(d), slot: d.driverSlot || null, from: null, at: stamp(),
                    reason: 'left', by: u.id || null };
        Promise.resolve(D.put('drivers', rec)).then(function () {
          return Promise.resolve(D.put('dutylog', log));
        }).then(function () {
          writing = false;
          closeSheet();
          redraw();
        }, function () {
          writing = false;
          toast(say('peSaveFailed'), 'bad');
        });
      });
  }

  /* ---------- crew PINs (§2.9) ------------------------------------------- */

  /* The PINs appear ONCE, grouped by person, at `--t3` so they can be read out
   * at arm's length. They are never in a list row, never in a toast, never in
   * the conversation log and never in `usage`; this function is the only place
   * in the file that touches one, and it does not log, store or format it into
   * anything that outlives the sheet. */
  function pinSheet() {
    var pins = mintedPins || {};
    var ids = Object.keys(pins);
    if (!ids.length) { sheet(say('peTabPins'), empty(say('pePinsNone'), 'person')); return; }
    var body = '<p class="pe-label">' + esc(say('pePinsOnce')) + '</p>', i;
    for (i = 0; i < ids.length; i++) {
      body += '<div class="drow"><span class="drow-i">' + draw('person', DMARK) + '</span>'
        + '<span class="drow-l">' + esc(pins[ids[i]].name) + '</span>'
        + '<span class="drow-v pe-pin">' + esc(pins[ids[i]].pin) + '</span></div>';
    }
    body += btn('pePinsDone', say('peLogSave'), 'pe-wide');
    sheet(say('peTabPins'), body);
  }

  function mintPins(el) {
    var m = model();
    var s = sync();
    var busId = el && el.getAttribute ? el.getAttribute('data-bus') : null;
    if (!busId || !can(m, 'manageCrewLogins') || m.offline || writing) return;
    if (!s || typeof s.registerRoster !== 'function') return;
    var crew = crewOnBus(m, busId);
    var users = live(list(m, 'users'));
    var want = [], i;
    for (i = 0; i < crew.length; i++) {
      var u = crew[i].userId ? byId(users, crew[i].userId) : null;
      if (u && (u.role === 'driver' || u.role === 'conductor')) {
        want.push({ id: u.id, name: u.name || crew[i].name, role: u.role });
      }
    }
    working(el, say('pePinsMaking'));
    writing = true;
    Promise.resolve(s.registerRoster(want)).then(function (r) {
      writing = false;
      var pins = (r && r.pins) || {};
      var out = {}, k;
      for (k in pins) if (has(pins, k)) out[k] = { name: nameOfUser(m, k) || k, pin: pins[k] };
      mintedPins = out;
      pinSheet();
    }, function () {
      writing = false;
      toast(say('pePinsFailed'), 'bad');
    });
  }

  // Closing the sheet drops them, and the server will not return an existing
  // PIN — so the confirm says the one true thing about pressing it.
  function closePins() {
    confirmDialog(say('pePinsClose'), { title: say('peTabPins'), yes: say('peLogSave') })
      .then(function (yes) {
        if (!yes) return;
        mintedPins = null;
        closeSheet();
        redraw();
      });
  }

  /* ---------- staff logins (§2.9) ---------------------------------------- */

  function staffSheet() {
    var m = model();
    if (!can(m, 'manageStaff')) return;
    if (m.offline) { toast(say('peNeedsNet'), 'warn'); return; }
    sheet(say('peStaffAdd'),
      '<label class="field"><span class="num-l">' + esc(say('peStaffName')) + '</span>'
      + '<input class="field" id="pe-staff-name" type="text" autocomplete="off"></label>'
      /* Only the roles this person may manage: the server refuses the rest
       * (`may_manage`), and offering one is a form filled in for nothing. */
      + labelled('peStaffRole', selectOf('pe-staff-role', manageable(m.role), null))
      /* `type="text"` with `inputmode="numeric"`, never `type="number"`: a
       * number input puts spinners in a 32px desk row and CHANGES ITS VALUE on
       * a mouse wheel. The digits go straight to `Sync.addStaff` and are never
       * drawn back, toasted, stored or logged. */
      + '<label class="num"><span class="num-l">' + esc(say('peStaffPin')) + '</span>'
      + '<input class="field num-in" id="pe-staff-pin" type="text" inputmode="numeric"'
      + ' pattern="[0-9]*" autocomplete="off" enterkeyhint="done" maxlength="4"'
      + ' data-kind="whole"><span class="num-h">' + esc(say('peStaffPinHint')) + '</span></label>'
      + btn('peStaffSave', say('peLogSave'), 'btn-primary pe-wide'));
  }

  /* A new login needs a PIN, and this screen does not invent one: `addStaff`
   * takes it, so the field is a `.num` the manager types and the value goes
   * straight to the server. It is never drawn back, never toasted and never
   * written to a record. */
  function saveStaff(el) {
    var m = model();
    var s = sync();
    if (!can(m, 'manageStaff') || !s || typeof s.addStaff !== 'function' || writing) return;
    var name = field('pe-staff-name').replace(/^\s+|\s+$/g, '');
    var role = field('pe-staff-role');
    var pin = field('pe-staff-pin');
    if (!name || !role) { toast(say('peNeedNamePhone'), 'warn'); return; }
    // Said before the request rather than after the server's 400.
    if (!/^\d{4}$/.test(pin)) { toast(say('peStaffPinHint'), 'warn'); return; }
    working(el, say('peSaving'));
    writing = true;
    Promise.resolve(s.addStaff({ name: name, role: role, pin: pin })).then(function () {
      writing = false;
      closeSheet();
      redraw();
    }, function () {
      writing = false;
      toast(say('peSaveFailed'), 'bad');
    });
  }

  function deleteStaff(el) {
    var m = model();
    var s = sync();
    var who = el && el.getAttribute ? el.getAttribute('data-who') : null;
    var me = user(m) || {};
    // Owner only, never self. Both halves are also the server's.
    if (!who || String(m.role) !== 'owner' || who === me.id) return;
    if (!s || typeof s.deleteStaff !== 'function' || writing) return;
    confirmDialog(say('peStaffAsk', { name: nameOfUser(m, who) }),
                  { title: say('peStaffDelete'), yes: say('peStaffDelete'), danger: true })
      .then(function (yes) {
        if (!yes) return;
        writing = true;
        Promise.resolve(s.deleteStaff(who)).then(function () {
          writing = false;
          redraw();
        }, function () {
          writing = false;
          toast(say('peSaveFailed'), 'bad');
        });
      });
  }

  /* ---------- the action table ------------------------------------------ */

  var ACTS = {
    peAdd: joinSheet,
    peJoinSave: saveJoiner,
    peDupOpen: function (el) { closeSheet(); go(el.getAttribute('data-person')); },
    peRehireDo: rehire,
    peLeave: leaveSheet,
    peLeaveSave: saveLeaver,
    peDocAdd: docSheet,
    peDocSave: saveDoc,
    peIncLog: incidentSheet,
    peIncSave: saveIncident,
    peLogNew: noteSheet,
    peLogSave: saveNote,
    peCoachOk: function (el) { decide(el, 'approve'); },
    peCoachSkip: function (el) { decide(el, 'skip'); },
    pePins: mintPins,
    pePinsDone: closePins,
    peStaffNew: staffSheet,
    peStaffSave: saveStaff,
    peStaffDel: deleteStaff
  };

  /* ---------- registration ---------------------------------------------- */

  register();

  var api = {
    render: render,
    mount: mount,
    unmount: unmount,
    // The predicates, exported so the suite can test the RULES rather than the
    // markup that happens to express them today.
    canDocs: canDocs,
    canLog: canLog,
    canSalary: canSalary,
    duplicates: duplicates,
    scoreIndex: scoreIndex,
    /* `People.crewIndex` IS DELIBERATELY ABSENT, and the reason is written out
     * in full beside the score above: the attribution is a seven-store server
     * trace, three of its stores are not sent to the roles that need the
     * number, and v1's client-side version runs through v1's `trace.js`, which
     * v2 may not reach. Slice T's Today reads `People.crewIndex` when it exists
     * and otherwise draws an error state with a Retry, which is the honest
     * answer. Exporting a half-built one would be the five-bases defect. */
    tab: setTab,
    view: setView,
    // Test seams only, the shape of Router._reset and Shell._reset: a node
    // suite cannot reload a classic script per case.
    _reset: function () {
      tab = 'crew'; view = 'worst'; writing = false; pendingPhoto = '';
      dupSeen = false; mintedPins = null;
      scoreMemo = { key: null, map: null }; stats.scoreBuilds = 0;
    },
    _stats: function () { return { scoreBuilds: stats.scoreBuilds }; }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.People = api;
    // Registered at load, like every screen: it draws nothing until Shell.mount
    // asks. Router refuses an unknown id and a module with no render, which is
    // the deny-by-default shape.
    var r = router();
    if (r && typeof r.register === 'function') r.register(ID, api);
    /* NO `mount()` here. The listener used to go on at script load, which was
     * the only thing that ever installed it (`Shell.mount` rendered and nothing
     * else), and it then outlived the screen for the whole session —
     * INTEGRATION-NOTES 17. `Shell.mount` now calls `mount()` on the way in and
     * `unmount()` on the way out, so a screen's listeners exist exactly while
     * the screen is the one on the page. A screen's load registers and nothing
     * more, which is what `index.html`'s script order has always claimed. */
  }
})(typeof window !== 'undefined' ? window : this);

/* Garage Saathi v2 — Me (#12): "Am I checked in, what is mine, and what is this
 * device doing?"  Spec: screens-shell.md §4 (lines 969–1201).
 *
 *   Me.render(model) -> string        the whole body, ONE string, pure
 *   Me.deviceSheet(model) -> string   the sheet §1.9's offline button and block
 *                                     6's row both open. One sheet, two doors.
 *   Me.mount()                        ONE delegated click listener, installed once
 *
 * `model` is the frame's own (shell.js's `model()`): {route, params, role,
 * density, user, cache, replica, stale, offline}. `model.sync` is an optional
 * `Sync.info()` snapshot — the live screen resolves `Sync.info()` itself, and a
 * node suite hands one in, which is what keeps `render` testable without a
 * browser.
 *
 * TWO SHAPES, ONE SCREEN (§4.1). For owner, supervisor, store, mechanic, crew
 * manager and office this is settings plus a few personal things. For a DRIVER
 * and a CONDUCTOR it is the whole application: no nav, no back arrow, no More
 * (the frame's §1.4.1, not this file's), and blocks 1, 2, 3, 4, 5, 6, 7, 9. They
 * hold zero capabilities and every row here is own-record, which is the only
 * reason one screen can be two roles' entire app.
 *
 * SO THERE IS NO STATE IN WHICH THIS SCREEN DRAWS A HEADING AND NO CONTENT.
 * Stage 1 §4.1 #12: "everything exists, just no data" has had at least eight
 * distinct causes and the only symptom anybody saw was silence ([E] 8db78e7).
 * Every block either always has own-record content (1, 2, 7, 9), or says which
 * empty it is (3, 5, 6), or is absent for this role (4, 8). That is also why
 * each block is built inside its own guard: a block that throws draws
 * `errorState` IN PLACE and the other eight still draw. One throw taking the
 * whole body down would hand a driver the dead end this screen exists to
 * remove, and the frame's own catch cannot be per block.
 *
 * THE HINDI MATTERS HERE ABOVE EVERYWHERE ELSE. The defect
 * v2-foundation-ui.md §6.3 records — a screen staying English in Hindi mode —
 * was ranked third-biggest friction in the business and then honestly withdrawn
 * when the owner said drivers do not use their logins. The MECHANISM did not
 * collapse with the estimate: it now points at this screen, where a silent
 * English fallback is not one screen in the wrong language, it is the whole
 * application in the wrong language for the only people with no second screen to
 * fall back to. So every fixed word below is an id in the one `W.register`
 * table, `w()` throws on an unregistered id by design, and `hi: ''` is PENDING —
 * counted and printed by test_v2_words.js and marked on screen.
 *
 * THIS SCREEN NO LONGER HAS A PENDING WORD. Every value below is filled, and
 * each one says where it came from:
 *   FROM i18n-hi.js  the OWNER'S OWN word, copied with the line it is on. 45 of
 *                    the 108, and they include both of this screen's writes,
 *                    which were his from the start.
 *   NEW              written here, at the owner's instruction. 61, of which 18
 *                    are built on a word or a sentence of his and say which, and
 *                    43 are new whole. HE STILL HAS TO READ THEM, and those 43
 *                    first: the theme words, the coaching note, the device card
 *                    and the usage block. (`meLang` and `meLangValue` carry no
 *                    marker because the row names the two languages either way;
 *                    the note above them says why.)
 * The earlier note in this place said nothing here was guessed. That stopped
 * being true when the owner asked for the sitting to be anticipated rather than
 * waited for, and a comment that keeps the old claim is worse than no comment.
 *
 * THE THREE UPLOAD URLS ARE A SECURITY BOUNDARY, NOT STYLING (§4.7,
 * LIVE-ISSUES 7 and 7b). `GET /uploads/<name>` authenticates NOTHING: the 32
 * hex characters of the name are the only thing between an unauthenticated
 * request and a crew member's licence, there is no revocation, and every rule in
 * `redact_for` about who may see a crew member's documents is bypassed by
 * holding the link. Me hands out three of them — the check-in selfie (block 3),
 * the person's own identity documents (block 5) and the bus-fault photograph
 * (block 4) — and it hands them to the least privileged person in the business,
 * because for a driver this is the whole app. What this file owes, and all it
 * owes, is to stop ADDING ways the URL travels:
 *
 *   1. NEVER A LINK, NEVER A SHARE AFFORDANCE. An upload URL reaches the screen
 *      only as the `src` of an `<img>` inside `V2.openPhoto`, or as the
 *      `data-photo-src` of the photo primitive's own tile button. No `<a href>`,
 *      no "open in new tab", no copy, no share, no download, no target.
 *   2. `referrerpolicy="no-referrer"` on every such `<img>` — which is
 *      `ui/photos.js`'s contract for a tile and for the viewer, and the reason
 *      this screen renders no `<img>` of its own anywhere.
 *   3. WORDS BEFORE PICTURES. Block 5 lists a document by TYPE AND EXPIRY in
 *      words and loads no image until an explicit tap: a licence photograph
 *      nobody asked to see is an unauthenticated request nobody asked for, and
 *      it puts the URL in the cache and history of whatever device is in that
 *      person's hand. The document's NUMBER is never drawn either — the words
 *      are the type and the date, so the Aadhaar question does not arise.
 *   4. NO PHOTOGRAPH OF ANOTHER PERSON, ANYWHERE. Everything here is
 *      own-record, which is what keeps the blast radius equal to the person
 *      holding the phone.
 *
 * None of that is a fix. The fix is a session token on every `<img>` or
 * short-lived signed URLs, it has to cover the R2 bucket too, and LIVE-ISSUES
 * 7b records it as the owner's call. It is not in this cut and it is not a UI
 * decision.
 *
 * NO COPY THAT PROMISES WHAT THE SERVER HAS (§4.6). Block 6 says what is on
 * THIS PHONE and never "everything else was sent", "all changes saved" or "you
 * are up to date": LIVE-ISSUES 1 means a change can have vanished with the
 * screen saying it sent, so a true statement about this device is what is
 * written and a statement about the server is not invented to make the card
 * read better. And no screen here asks a person to adjudicate a clock: a
 * conflict is a named refusal with a reason and a Retry (block 6), never
 * "Overwrite?".
 */
(function (root) {
  'use strict';

  const ME = 'me';
  const MARK = 20;                 // a .v2row lead mark, matching the nav's
  const DMARK = 16;                // a .drow-i mark: .drow-i svg is 16px
  const ATT_CAP = 12;              // block 3 is the person's own last 12, by its own definition
  const REFUSE_CAP = 5;            // block 6's refusal list, then "See all (23)"
  const USAGE_CAP = 200;           // §4.3's cap, then "200 shown. 46 more."
  const DOC_SOON_DAYS = 30;        // a document inside a month of running out
  const DAY_MS = 86400000;
  const USAGE_WINDOWS = [7, 30];   // the sheet's two period tabs, mutually exclusive
  const CREW = ['driver', 'conductor'];

  /* The roles whose whole application this is. Named as data rather than
   * written into three conditions, because §4.1's two shapes differ by exactly
   * this list and a fourth place to edit is how they would drift. */
  function isCrew(role) { return CREW.indexOf(String(role)) !== -1; }

  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* Every dependency is resolved at CALL time, never captured at load — the
   * idiom of `v2/router.js`, `v2/night.js` and `v2/shell.js`, and what makes
   * index.html's order a dependency order rather than a load-time coupling.
   * One function per name rather than a `pick(name)` helper, for the reason
   * shell.js gives: a module name in a string is a capitalised English word to
   * the scan that keeps reader-facing English in the word table. */
  function caps() { return (typeof Caps !== 'undefined' && Caps) || (root && root.Caps) || null; }
  function router() { return (typeof Router !== 'undefined' && Router) || (root && root.Router) || null; }
  function shell() { return (typeof Shell !== 'undefined' && Shell) || (root && root.Shell) || null; }
  function sync() { return (typeof Sync !== 'undefined' && Sync) || (root && root.Sync) || null; }
  function cacheMod() { return (typeof Cache !== 'undefined' && Cache) || (root && root.Cache) || null; }
  function db() { return (typeof DB !== 'undefined' && DB) || (root && root.DB) || null; }
  function fmtOf() { return (typeof fmt !== 'undefined' && fmt) || (root && root.fmt) || null; }
  function overlay() { return (root && root.V2) || null; }
  function doc() { return (root && root.document) || null; }

  function draw(name, size) {
    return typeof root.icon === 'function' ? root.icon(name, { size: size }) : '';
  }

  /* ---------- the words -------------------------------------------------- */

  /* The local copy is the fallback for a document that loads this screen
   * without ui/words.js, exactly as ui/photos.js and v2/shell.js do it. */
  const local = {};
  const W = {
    register: function (table) {
      let k;
      for (k in table) if (has(table, k)) local[k] = table[k];
      if (root.W && typeof root.W.register === 'function') root.W.register(table);
    }
  };

  W.register({
    /* The screen's one name, under the id the frame and the nav actually read
     * (`Caps.SCREENS.me.word`). §4.6's copy table calls this `meTitle`; the id
     * is `scMe` here so that ONE word fills all three of §1.6's places — the nav
     * label, the header and More — instead of the header translating from one id
     * and the body from a synonym. Flagged in this slice's report. */
    scMe: { en: 'Me', hi: 'मैं' },                              // FROM i18n-hi.js line 12 (me)

    // ---- block 1, the greeting: whose app this is -----------------------
    /* The role, in words. This block does the nav's first job for the two roles
     * that have no nav (foundation §3.7.1), so the role has to be a word and
     * not the token on the record. */
    meRoleOwner: { en: 'Owner', hi: 'मालिक' },  // FROM i18n-hi.js line 102 (jbOwnerOnly)
    meRoleSupervisor: { en: 'Supervisor', hi: 'सुपरवाइज़र' },  // FROM i18n-hi.js line 122 (hmWaitingSignoffSub)
    meRoleStore: { en: 'Storekeeper', hi: 'स्टोरकीपर' },  // FROM i18n-hi.js line 161 (reqPartNote)
    meRoleMechanic: { en: 'Mechanic', hi: 'मैकेनिक' },  // FROM i18n-hi.js line 176 (crewWho)
    meRoleCrewmanager: { en: 'Crew manager', hi: 'क्रू मैनेजर' },  // NEW. v1 has no word for this role
    meRoleOffice: { en: 'Office', hi: 'ऑफिस' },  // FROM i18n-hi.js line 386 (fltOffice)
    meRoleDriver: { en: 'Driver', hi: 'ड्राइवर' },               // FROM i18n-hi.js line 230 (roleDriver)
    meRoleConductor: { en: 'Conductor', hi: 'कंडक्टर' },          // FROM i18n-hi.js line 230 (roleConductor)

    // ---- block 2, check in / check out ---------------------------------
    meCheckIn: { en: 'Check in', hi: 'हाज़िरी लगाएं' },           // FROM i18n-hi.js line 15 (checkin)
    meCheckOut: { en: 'Check out', hi: 'छुट्टी' },                // FROM i18n-hi.js line 15 (checkout)
    meCheckingIn: { en: 'Checking in...', hi: 'हाज़िरी लग रही है…' },  // NEW, on his checkin (line 15)
    meCheckingOut: { en: 'Checking out...', hi: 'छुट्टी लग रही है…' },  // NEW, on his checkout (line 15)
    // {0} is the time. A whole form, not a prefix glued on by the caller:
    // Hindi word order is not English word order.
    meCheckedAt: { en: 'Checked in at {0}', hi: '{0} पर हाज़िरी लगी' },  // NEW
    meCheckedOutAt: { en: 'Checked out at {0}', hi: '{0} पर छुट्टी लगी' },  // NEW
    meFace: { en: 'Take your photo', hi: 'फोटो' },               // FROM i18n-hi.js line 164 (drvPhotoBtn)
    meCheckFailed: { en: 'Not recorded. Try again.', hi: 'दर्ज नहीं हुआ। दोबारा कोशिश कीजिए।' },  // NEW, on his cbNotRecorded (line 268)

    // ---- block 3, the person's own attendance --------------------------
    meAttendance: { en: 'Your attendance', hi: 'हाज़िरी' },        // FROM i18n-hi.js line 17 (attendance)
    meIn: { en: 'In', hi: 'हाज़िरी' },  // FROM i18n-hi.js line 17 (attendance): the row says what was marked
    meOut: { en: 'Out', hi: 'छुट्टी' },  // FROM i18n-hi.js line 15 (checkout)
    meLate: { en: 'Late', hi: 'देर' },  // FROM i18n-hi.js line 140 (mpLate)
    meNoLocation: { en: 'Location not recorded', hi: 'लोकेशन नहीं' },  // FROM i18n-hi.js line 319 (gcNoLocation)
    // {0} is the distance in metres, grouped.
    meFromGarage: { en: '{0} m from the garage', hi: 'गैराज से {0} मीटर' },  // NEW
    meNoAttendance: { en: 'No attendance yet. Check in above.', hi: 'अभी कोई हाज़िरी नहीं। ऊपर हाज़िरी लगाएं।' },  // NEW, on his checkin (line 15)
    meSelfie: { en: 'Your photo', hi: 'आपकी फोटो' },  // NEW, on his docPhoto (line 274)

    // ---- block 4, something is wrong with my bus -----------------------
    /* THE HIGHEST-VALUE HINDI STRING IN THE PRODUCT (§4.6): one of two writes
     * on the one screen two whole roles ever see. It is the owner's own
     * sentence, already in v1. */
    meBusWrong: { en: 'Something is wrong with my bus', hi: 'मेरी बस में समस्या बताएं' },  // FROM i18n-hi.js line 149 (reportProblem)
    meReportArea: { en: 'Which part', hi: 'हिस्सा' },             // FROM i18n-hi.js line 150 (reportArea)
    meReportWhat: { en: 'What is wrong?', hi: 'ट्रिप में क्या महसूस हुआ?' },  // FROM i18n-hi.js line 150 (reportWhat)
    meReportSend: { en: 'Send', hi: 'भेजें' },                    // FROM i18n-hi.js line 150 (submit)
    meReportSent: { en: 'Report sent', hi: 'रिपोर्ट भेज दी' },     // FROM i18n-hi.js line 150 (reportSubmitted)
    meReportNeeds: { en: 'Say what is wrong, or add a photo.', hi: 'क्या गड़बड़ है लिखिए, या फोटो लगाइए।' },  // NEW
    meSpeak: { en: 'Speak', hi: 'आवाज़' },                        // FROM i18n-hi.js line 164 (drvVoiceBtn)
    // The nine areas keep v1's stable English values on the record; these are
    // the labels beside them. The Hindi is the owner's own.
    meAreaBrakes: { en: 'Brakes', hi: 'ब्रेक' },                  // FROM i18n-hi.js line 173 (catBrakes)
    meAreaEngine: { en: 'Engine', hi: 'इंजन' },                   // FROM i18n-hi.js line 173 (catEngine)
    meAreaAc: { en: 'AC', hi: 'एसी' },                            // FROM i18n-hi.js line 173 (catAC)
    meAreaSuspension: { en: 'Suspension', hi: 'सस्पेंशन' },        // FROM i18n-hi.js line 173 (catSuspension)
    meAreaElectrical: { en: 'Electrical', hi: 'बिजली' },          // FROM i18n-hi.js line 173 (catElectrical)
    meAreaTyres: { en: 'Tyres', hi: 'टायर' },                     // FROM i18n-hi.js line 174 (catTyres)
    meAreaGearbox: { en: 'Gearbox', hi: 'गियरबॉक्स' },             // FROM i18n-hi.js line 174 (catGearbox)
    meAreaBody: { en: 'Body', hi: 'बॉडी' },                       // FROM i18n-hi.js line 174 (catBody)
    meAreaOther: { en: 'Other', hi: 'अन्य' },                     // FROM i18n-hi.js line 174 (catOther)

    // ---- block 5, yours -----------------------------------------------
    meYours: { en: 'Yours', hi: 'आपका रिकॉर्ड' },  // NEW
    meDocs: { en: 'Your documents', hi: 'आपके कागज़ात' },  // FROM i18n-hi.js line 21 (documents)
    // {0} is the document's name, {1} the days left.
    meDocsExpiring: { en: '{0} expires in {1} days', hi: '{0} {1} दिन में खत्म हो रहा है' },  // NEW, on his cbExpiringSoon (line 232)
    meDocsOnFile: { en: '{0} of {1} on your record', hi: 'आपके रिकॉर्ड पर {1} में से {0}' },  // NEW
    meDocLicence: { en: 'Driving licence', hi: 'ड्राइविंग लाइसेंस' },   // FROM i18n-hi.js line 274 (docLicense)
    meDocAadhaar: { en: 'Aadhaar card', hi: 'आधार कार्ड' },             // FROM i18n-hi.js line 274 (docAadhaar)
    meDocPhoto: { en: 'Photograph', hi: 'फोटो' },                      // FROM i18n-hi.js line 274 (docPhoto)
    meDocPan: { en: 'PAN card', hi: 'पैन कार्ड' },                      // FROM i18n-hi.js line 275 (docPan)
    meDocPolice: { en: 'Police verification', hi: 'पुलिस वेरिफिकेशन' },  // FROM i18n-hi.js line 275 (docPolice)
    meDocMedical: { en: 'Medical certificate', hi: 'मेडिकल सर्टिफिकेट' }, // FROM i18n-hi.js line 275 (docMedical)
    meDocExpires: { en: 'Expires {0}', hi: '{0} को खत्म' },  // NEW, on his cbExpiresWord (line 278)
    meDocExpired: { en: 'Ran out {0}', hi: '{0} को खत्म हो गया' },  // NEW
    meDocHeld: { en: 'On your record', hi: 'रिकॉर्ड पर है' },  // NEW
    meDocMissing: { en: 'Not on your record', hi: 'रिकॉर्ड पर नहीं' },  // NEW
    meNoDocs: { en: 'No documents on your record. Ask the office.', hi: 'आपके रिकॉर्ड पर कोई कागज़ नहीं। ऑफिस से कहिए।' },  // NEW
    meReviews: { en: 'Your reviews', hi: 'आपके रिव्यू' },  // FROM i18n-hi.js line 85 (coReviewsWord)
    // {0} is the star average to one decimal, {1} the count.
    meReviewsSub: { en: '{0} stars from {1} reviews', hi: '{1} रिव्यू से {0} स्टार' },  // NEW, on his star word (line 355 myRvNoText)
    meNoReviews: { en: 'No reviews yet.', hi: 'अभी कोई रिव्यू नहीं।' },  // NEW, on his ofNoReviews (line 420)
    meCoaching: { en: 'Your coaching note', hi: 'आपके लिए सलाह' },  // NEW
    // {0} is the week it was written for, {1} how many lines it holds.
    meCoachingSub: { en: 'Written for {0}. {1} lines.', hi: '{0} के लिए लिखी गई। {1} बातें।' },  // NEW
    meNoCoaching: { en: 'No note yet. One is written every Monday.', hi: 'अभी कोई नोट नहीं। हर सोमवार एक लिखा जाता है।' },  // NEW
    meScore: { en: 'Your score', hi: 'आपका स्कोर' },  // NEW, on his score word (line 138 mpSub)
    meScoreSub: { en: '{0} open. {1} done. {2} signed off.', hi: '{0} खुले। {1} पूरे। {2} जाँचे हुए।' },  // NEW, on his open/markDone/verify (lines 15-17)

    // ---- block 6, this phone ------------------------------------------
    mePhone: { en: 'This phone', hi: 'यह फ़ोन' },  // NEW, on his onThisPhone (line 75)
    meWaiting: { en: 'Waiting to send', hi: 'भेजने के लिए बाकी' },  // NEW
    meLastSent: { en: 'Last sent', hi: 'आखिरी बार भेजा' },  // NEW
    meRecords: { en: 'Records on this phone', hi: 'इस फ़ोन पर रिकॉर्ड' },  // NEW
    // {0} is what this phone holds, {1} what it would hold complete.
    meHolds: { en: 'This phone holds {0} of {1} records', hi: 'इस फ़ोन पर {1} में से {0} रिकॉर्ड हैं' },  // NEW
    /* The same fact when the SHORTFALL IS NOT KNOWN, which is REV-FLOW F6's
     * other half. `replicaState` returns `behind: 0` both when this device is
     * caught up and when no pull has ever come back, and says so in its own
     * comment — "an unknown must not be announced as a shortfall". So on a
     * phone that has never synced, `meHolds` drew "{held} of {held + 0}":
     * measured, "This phone holds 91 of 91 records", which is the one sentence
     * on this screen that exists ONLY to say the replica is short, reporting
     * that nothing is missing. A denominator nobody knows is not a denominator. */
    meHoldsUnknown: { en: 'This phone holds {0} records. It has not finished filling up.', hi: 'इस फ़ोन पर {0} रिकॉर्ड हैं। पूरा भरना अभी बाकी है।' },  // NEW
    // NOT "rejected", NOT "payload refused" (§4.6).
    meRefused: { en: { one: '{n} record the server would not take', other: '{n} records the server would not take' }, hi: 'सर्वर ने {n} रिकॉर्ड नहीं लिया' },  // NEW. One Hindi form for both counts
    // Three clauses: what happened, what is kept, the one next thing.
    meRefusedHint: { en: 'They are still on this phone. Tap one to see why.', hi: 'वे इस फ़ोन पर ही हैं। वजह देखने के लिए किसी एक को दबाइए।' },  // NEW
    meRefusedOne: { en: 'A record the server would not take', hi: 'एक रिकॉर्ड जो सर्वर ने नहीं लिया' },  // NEW
    meSending: { en: 'Sending...', hi: 'भेजा जा रहा है…' },  // NEW
    meSeeAll: { en: 'See all ({n})', hi: 'सब देखें ({n})' },  // NEW
    meOnPhoneOnly: { en: 'On this phone only', hi: 'सिर्फ़ इस फ़ोन पर' },  // NEW
    meSendsOnWifi: { en: 'Sends when there is wifi', hi: 'वाईफ़ाई मिलने पर भेजा जाएगा' },  // NEW, on his photoSavedOnPhone (line 159)

    // ---- block 7, settings --------------------------------------------
    meSettings: { en: 'Settings', hi: 'सेटिंग' },  // NEW, on his settings word (line 36 aiServerOff)
    meLang: { en: 'Language / भाषा', hi: 'भाषा / Language' },
    /* The id whose own translation IS the value drawn beside it: in English the
     * row reads "English" and in Hindi "हिंदी", which is the language's own name
     * either way and is the one place a value and a word are the same thing. */
    meLangValue: { en: 'English', hi: 'हिंदी' },
    meTheme: { en: 'Theme', hi: 'थीम' },                          // FROM i18n-hi.js line 17 (theme)
    meThemeLight: { en: 'Light', hi: 'हल्की' },  // NEW. Agrees with theme, which is feminine in Hindi
    meThemeDark: { en: 'Dark', hi: 'गहरी' },  // NEW
    meThemeFollow: { en: 'Follow the phone', hi: 'फ़ोन जैसी' },  // NEW
    mePin: { en: 'Change my PIN', hi: 'मेरा पिन बदलें' },          // FROM i18n-hi.js line 146 (changePin)
    // Said in the body BEFORE it is pressed, never after (§4.4 offline).
    mePinOffline: { en: 'Needs a connection. Try when there is signal.', hi: 'इसके लिए कनेक्शन चाहिए। सिग्नल आने पर कोशिश कीजिए।' },  // NEW
    mePinNew: { en: 'New PIN', hi: 'नया पिन' },  // FROM i18n-hi.js line 44 (renamePinNote)
    mePinSaved: { en: 'PIN changed', hi: 'पिन बदल गया' },  // NEW
    mePinFourDigits: { en: 'Four digits, no letters.', hi: 'चार अंक, अक्षर नहीं।' },  // NEW
    meSaveFailed: { en: 'Not saved. Try again.', hi: 'सेव नहीं हुआ। दोबारा कोशिश कीजिए।' },  // NEW, on his save (line 17)

    // ---- block 8, owner only ------------------------------------------
    meOwnerOnly: { en: 'Owner only', hi: 'सिर्फ़ मालिक' },  // FROM i18n-hi.js line 102 (jbOwnerOnly)
    meWhoOpened: { en: 'Who opened what', hi: 'किसने क्या खोला' },  // NEW
    meLastDays: { en: 'Last {n} days', hi: 'पिछले {n} दिन' },  // NEW, on his mpSub (line 138)
    meDaysTab: { en: { one: '{n} day', other: '{n} days' }, hi: '{n} दिन' },  // NEW. One Hindi form for both counts
    // {0} is a screen's own name, {n} how many times it was opened.
    meOpenedTimes: { en: { one: '{0} {n} time.', other: '{0} {n} times.' }, hi: '{0} {n} बार।' },  // NEW. One Hindi form for both counts
    meLastOpened: { en: 'Last opened {0}.', hi: 'आखिरी बार {0} खोला।' },  // NEW
    meNeverOpened: { en: 'Never opened the app.', hi: 'ऐप कभी नहीं खोला।' },  // NEW
    meNeverSignedIn: { en: 'Never signed in', hi: 'कभी लॉगिन नहीं किया' },  // NEW
    meNobodyOpened: { en: 'Nobody opened the app in this period.', hi: 'इस अवधि में किसी ने ऐप नहीं खोला।' },  // NEW
    meShownMore: { en: '{0} shown. {1} more.', hi: '{0} दिख रहे। {1} और।' },  // NEW, on his more (line 146)
    meImport: { en: 'Import from Excel', hi: 'एक्सेल से लाएँ' },  // NEW
    meImportHint: { en: 'Only on an empty database', hi: 'सिर्फ़ खाली डेटाबेस पर' },  // NEW
    meSetup: { en: 'Garage setup', hi: 'गैराज सेटिंग' },  // NEW
    // v1's own sub for the same row, transcribed rather than invented.
    meSetupHint: { en: 'Location, geofence and shift time.', hi: 'जगह, जियोफ़ेंस और शिफ्ट का समय।' },  // NEW

    // ---- block 9, sign out --------------------------------------------
    meSignOut: { en: 'Sign out', hi: 'लॉगआउट' },                  // FROM i18n-hi.js line 17 (logout)
    meSignOutBody: { en: 'Your records stay on this phone.', hi: 'आपके रिकॉर्ड इस फ़ोन पर ही रहेंगे।' },  // NEW
    meStay: { en: 'Stay', hi: 'रद्द' },                           // FROM i18n-hi.js line 17 (cancel) — §4.6 names this one
    meBlockFailed: { en: 'This part could not be drawn.', hi: 'यह हिस्सा नहीं दिख सका।' }  // NEW, on his reportArea (line 150)
  });

  /* `w()` throws on an id nobody registered, which is the whole point of the
   * table. But this screen is two roles' entire application, so one thrown word
   * must cost a word and not the app: every call goes through `say()`, which
   * falls back to the English beside the id. The id itself is never swallowed —
   * test_v2_words.js is what makes a missing id loud, at build time, where a
   * person is not standing at a gate. */
  function say(id, n) {
    if (typeof root.w === 'function') {
      try {
        const t = root.w(id, n);
        if (t != null && String(t) !== '') return t;
      } catch (e) { /* fall through to the English below */ }
    }
    const e = local[id];
    if (!e) return '';
    const v = e.en;
    if (typeof v === 'string') return v.replace(/\{n\}/g, n == null ? '' : String(n));
    const s = n === 1 ? (v.one == null ? v.other : v.one) : (v.other == null ? v.one : v.other);
    return String(s).replace(/\{n\}/g, n == null ? '' : String(n));
  }

  // A form with numbered slots. w() fills {n} (the count); {0}, {1}, {2} are the
  // caller's, and they are slots in a WHOLE form so Hindi word order is free.
  function fill(id, a, b, c, n) {
    let s = say(id, n);
    if (a !== undefined) s = s.replace('{0}', String(a));
    if (b !== undefined) s = s.replace('{1}', String(b));
    if (c !== undefined) s = s.replace('{2}', String(c));
    return s;
  }

  // A screen's one name, from the one id the nav and the header read too.
  function screenName(id) {
    const c = caps();
    const s = c && c.SCREENS && c.SCREENS[id];
    if (!s) return '';
    if (typeof root.w === 'function') {
      try {
        const t = root.w(s.word);
        if (t != null && String(t) !== '') return t;
      } catch (e) { /* the English title below */ }
    }
    return s.title;
  }

  function lang() {
    const Wr = root.W;
    try { return (Wr && Wr.lang) ? Wr.lang() : 'en'; } catch (e) { return 'en'; }
  }

  /* ---------- the primitives, each absent-safe --------------------------- */

  function fig(value, opts) {
    return typeof root.figure === 'function' ? root.figure(value, opts) : '';
  }

  function group(n) {
    const f = fmtOf();
    if (!f || typeof n !== 'number' || !isFinite(n)) return null;
    return f.groupIndian(n);
  }

  // A figure of a whole count, grouped the Indian way. The RAW value goes to
  // figure() with a `format`: formatting first is how "we do not know" becomes
  // "it is zero" (ui/states.js's whole reason).
  function count(n) {
    const f = fmtOf();
    return fig(n, f ? { format: f.groupIndian } : null);
  }

  /* WHY NO FIGURE ON THIS SCREEN CARRIES `stale` OR `at`, AND IT IS NOT AN
   * OVERSIGHT. Two rules meet here and one of them has a commit behind it.
   *
   * §1.8 wants an AGGREGATE figure marked `stale` while
   * `Boot.replica().complete` is false, and the frame greps for exactly that.
   * The ground rule the screen slices all inherit wants NO `.figure-note`
   * inside a row, because `stale` and `at` both add one as a block element,
   * which triples the row height and runs `ageWords()` once per row.
   *
   * Me has no aggregate figure. Every number in a row here is a count of the
   * reader's OWN records (their documents, their reviews, their own cards) or a
   * fact about this device (waiting to send, records on this phone), and a fact
   * about this phone is exactly true whether or not the replica has caught up —
   * hedging it would be a false "may be out of date" on the one card that is
   * honest when there is no signal. What this screen owes §1.8 it pays IN WORDS
   * instead, in block 6: "This phone holds 4,120 of 9,300 records", drawn
   * whenever the replica is short. A sentence says it where a note on a row
   * would cost the row. */

  function empty(text, mark, hint) {
    return typeof root.emptyState === 'function'
      ? root.emptyState(text, { icon: mark, hint: hint })
      : '<p>' + esc(text) + '</p>';
  }

  function skel(rows) {
    return typeof root.skeleton === 'function' ? root.skeleton(rows) : '';
  }

  /* ONE retry function, hoisted, not a fresh closure per render: ui/states.js
   * keys its retry handlers by function identity and caps the list at 200, so a
   * new arrow per redraw would add an entry every sync tick. */
  function redraw() {
    const s = shell();
    if (s && s.mount) s.mount(ME);
  }

  function failedBlock(heading) {
    const body = typeof root.errorState === 'function'
      ? root.errorState(say('meBlockFailed'), redraw)
      : '<p>' + esc(say('meBlockFailed')) + '</p>';
    return card(heading, body);
  }

  /* ---------- the markup pieces ------------------------------------------ */

  function card(heading, body) {
    return '<div class="card">'
      + (heading ? '<h3>' + esc(heading) + '</h3>' : '')
      + body + '</div>';
  }

  /* A row of block 5, 7 or 8. `act` is optional and `sub` is dropped at desk
   * when it is a sentence rather than a number (§4.2's desk paragraph).
   *
   * Pressable rows are `button.v2row`; a row that only states a fact is
   * `div.v2row`, which is also the markup rule behind the shelf-count
   * regression — a row holding a field is never a button. A row the person may
   * not use is ABSENT, never disabled, so there is no third form here. */
  function row(act, mark, title, sub, action, data) {
    const tag = act ? 'button' : 'div';
    const attrs = act ? ' type="button" data-act="' + esc(act) + '"' : '';
    let extra = '';
    if (data) {
      let k;
      for (k in data) if (has(data, k) && data[k] != null) extra += ' data-' + k + '="' + esc(data[k]) + '"';
    }
    return '<' + tag + ' class="v2row"' + attrs + extra + '>'
      + '<span class="lead">' + draw(mark, MARK) + '</span>'
      + '<div class="txt"><div class="t">' + esc(title) + '</div>'
      + (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') + '</div>'
      // An empty action column is not emitted: `.v2row > .act` carries its own
      // inline margin, so an empty one would indent nothing by --s3.
      + (action ? '<div class="act">' + action + '</div>' : '')
      + '</' + tag + '>';
  }

  // A fact in block 6 or an attendance line in block 3. A .drow is not a .v2row
  // and has no two-line rule, which is why the facts can carry a figure.
  function drow(mark, label, value) {
    return '<div class="drow"><span class="drow-i">' + draw(mark, DMARK) + '</span>'
      + '<span class="drow-l">' + esc(label) + '</span>'
      + '<span class="drow-v">' + (value || '') + '</span></div>';
  }

  /* A thumbnail, through the photo primitive and never by hand. That is what
   * carries `referrerpolicy="no-referrer"`, makes the tile a BUTTON rather than
   * an anchor, puts the words before the picture, and routes the tap into
   * `V2.openPhoto` — the four rules of §4.7 in one call instead of four
   * promises. A `data:` photograph is on this phone only and says so. */
  function thumb(url, caption) {
    if (typeof root.photoGrid !== 'function' || !url) return '';
    return root.photoGrid([{ url: url, caption: caption, local: /^data:/.test(String(url)) }], {});
  }

  /* ---------- reading the model ------------------------------------------ */

  function rows(model, store) {
    const c = (model && model.cache) || {};
    return has(c, store) ? c[store] : undefined;
  }

  // Not loaded yet. `undefined` is the only honest "we have not read it": a
  // failed read leaves `[]` (cache.js), and `[]` means "I asked, and there are
  // none".
  function unread(v) { return v === undefined; }

  function user(model) { return (model && model.user) || null; }

  function info(model) {
    if (model && model.sync) return model.sync;
    const s = sync();
    try { return (s && s.info) ? s.info() : {}; } catch (e) { return {}; }
  }

  // The live crew-bank record whose login is this person — the same rule the
  // server uses (`_crew_record_for`: drivers.userId === the token's user).
  function myCrew(model) {
    const u = user(model);
    const list = rows(model, 'drivers');
    if (!u || !list || !list.length) return null;
    for (let i = 0; i < list.length; i++) {
      if (list[i] && list[i].userId === u.id) return list[i];
    }
    return null;
  }

  function can(model, cap) {
    const c = caps();
    return !!(c && c.can && c.can(model && model.role, cap));
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  // "08:14" on this device's clock, or null when the stamp cannot be read.
  function clock(ms) {
    if (ms == null) return null;
    const d = new Date(Number(ms));
    const t = d.getTime();
    if (t !== t) return null;
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function dayKey(ms) {
    const d = new Date(Number(ms));
    const t = d.getTime();
    if (t !== t) return '';
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  // Whole days from now to a date string, negative once it has passed.
  function daysLeft(date) {
    if (!date) return null;
    const t = Date.parse(String(date));
    if (t !== t) return null;
    return Math.ceil((t - Date.now()) / DAY_MS);
  }

  function ageDays(ms) {
    if (ms == null) return null;
    const n = Math.floor((Date.now() - Number(ms)) / DAY_MS);
    return n !== n ? null : (n < 0 ? 0 : n);
  }

  // "2 days ago" / "just now", from the chrome ids ui/states.js already owns:
  // one word, one place, and the Hindi for them is already filled in.
  function agoWords(ms) {
    const d = ageDays(ms);
    if (d == null) return null;
    if (d >= 1) return say('daysAgo', d);
    const mins = Math.floor((Date.now() - Number(ms)) / 60000);
    if (mins < 1) return say('justNow');
    if (mins < 60) return say('minutesAgo', mins);
    return say('hoursAgo', Math.floor(mins / 60));
  }

  /* ---------- block 1: the greeting -------------------------------------- */

  const ROLE_WORD = {
    owner: 'meRoleOwner', supervisor: 'meRoleSupervisor', store: 'meRoleStore',
    mechanic: 'meRoleMechanic', crewmanager: 'meRoleCrewmanager', office: 'meRoleOffice',
    driver: 'meRoleDriver', conductor: 'meRoleConductor'
  };

  function garageName(model) {
    const meta = rows(model, 'meta');
    if (!meta || !meta.length) return '';
    for (let i = 0; i < meta.length; i++) {
      const r = meta[i];
      if (r && r.key === 'garage') return String(r.biz || r.name || '');
    }
    return '';
  }

  /* Block 1 does the nav's first job for the two roles that have no nav
   * (foundation §3.7.1): it says whose app this is. It reads the session only —
   * the name, the role — so it draws in the first paint and never waits for a
   * store. */
  function greeting(model) {
    const u = user(model) || {};
    const word = ROLE_WORD[String(model && model.role)];
    const parts = [];
    if (word) parts.push(say(word));
    const g = garageName(model);
    if (g) parts.push(g);
    return '<div class="greet"><span class="greet-av">' + draw('me', MARK) + '</span>'
      + '<div><div class="greet-hi">' + esc(u.name || '') + '</div>'
      + '<div class="small">' + esc(parts.join(' · ')) + '</div></div></div>';
  }

  /* ---------- block 2: check in / check out ------------------------------ */

  /* Today's last own record decides which word the button carries. An `out`
   * record, or nothing today, means the next thing is a check in.
   *
   * Guarded on its own rather than through the block's guard: §4.4 has block 2
   * drawing IMMEDIATELY, before any store has been read, and a device that has
   * not read `attendance` yet — or cannot — must still be offered the thing two
   * whole roles came for. "Check in" is the right default for both: a person
   * who is already in has one wrong word on one button, and a person who is not
   * has the control they came for. */
  function checkedIn(model) {
    let list;
    try { list = myAttendance(model); } catch (e) { return false; }
    const today = dayKey(Date.now());
    for (let i = 0; i < list.length; i++) {
      if (dayKey(list[i].at) !== today) break;         // newest first: past today is past
      return list[i].type === 'in';
    }
    return false;
  }

  function checkBlock(model) {
    const out = checkedIn(model);
    const label = say(out ? 'meCheckOut' : 'meCheckIn');
    /* The capture works offline and the UPLOAD waits, and that is said in the
     * body before the button is pressed rather than in a toast afterwards
     * (§4.4 offline): the person is standing at a gate by the time a toast
     * arrives. */
    const note = (model && model.offline)
      ? '<p class="photos-hint">' + esc(say('meSendsOnWifi')) + '</p>' : '';
    return card(null,
      '<button type="button" class="btn btn-primary me-wide" data-act="meCheck"'
      + ' data-kind="' + (out ? 'out' : 'in') + '">' + esc(label) + '</button>' + note);
  }

  /* ---------- block 3: the person's own attendance ----------------------- */

  // Self only, newest first. The whole store is on the device; the filter is
  // this screen's own-record rule and there is no second reading of it.
  function myAttendance(model) {
    const u = user(model);
    const list = rows(model, 'attendance');
    if (!u || !list || !list.length) return [];
    const mine = [];
    for (let i = 0; i < list.length; i++) {
      if (list[i] && list[i].userId === u.id) mine.push(list[i]);
    }
    mine.sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
    return mine;
  }

  function attendanceLine(a) {
    const bits = [say(a.type === 'in' ? 'meIn' : 'meOut')];
    const t = clock(a.at);
    if (t) bits.push(t);
    /* A check-in saved without a location says so, in the row, rather than
     * looking like one taken at the garage. The capture is never discarded for
     * a missing location — if attendance decides wages, a silent failure is a
     * wages bug (§4.4 half-finished). */
    if (a.dist == null) bits.push(say('meNoLocation'));
    else bits.push(fill('meFromGarage', group(Math.round(a.dist))));
    return bits.join(' · ');
  }

  function attendanceBlock(model) {
    const store = rows(model, 'attendance');
    const heading = say('meAttendance');
    if (unread(store)) return card(heading, skel(3));
    const mine = myAttendance(model).slice(0, ATT_CAP);
    if (!mine.length) return card(heading, empty(say('meNoAttendance'), 'clock'));
    let body = '';
    for (let i = 0; i < mine.length; i++) {
      const a = mine[i];
      const late = (a.type === 'in' && a.late)
        ? '<span class="badge badge-warn">' + draw('warn', DMARK) + ' ' + esc(say('meLate')) + '</span>' : '';
      body += drow('clock', attendanceLine(a), late + thumb(a.selfie, say('meSelfie')));
    }
    // No "See all": block 3 is the own last 12 by definition and there is no
    // Attendance screen to go to (§4.4 far too many).
    return card(heading, body);
  }

  /* ---------- block 4: something is wrong with my bus -------------------- */

  /* The nine areas. `value` is v1's STABLE ENGLISH, which is what the record
   * carries and what every count and every linked job card is grouped by; the
   * label beside it is a registered id. The values are built from their
   * lowercase keys rather than written as capitalised literals because the
   * Hindi scan cannot tell a stored enum from a label, and an allowlist there
   * would grow until it meant nothing. 'AC' is given outright: it is an
   * initialism, not a capitalised word. */
  const AREAS = [
    { key: 'brakes', word: 'meAreaBrakes' },
    { key: 'engine', word: 'meAreaEngine' },
    { key: 'ac', value: 'AC', word: 'meAreaAc' },
    { key: 'suspension', word: 'meAreaSuspension' },
    { key: 'electrical', word: 'meAreaElectrical' },
    { key: 'tyres', word: 'meAreaTyres' },
    { key: 'gearbox', word: 'meAreaGearbox' },
    { key: 'body', word: 'meAreaBody' },
    { key: 'other', word: 'meAreaOther' }
  ];

  function areaValue(a) {
    return a.value || (a.key.charAt(0).toUpperCase() + a.key.slice(1));
  }

  /* Driver and conductor only, and that is the server's rule as well as this
   * screen's (`02 §4.4` permits `driver` and `conductor` to write
   * `driverreports`). NO NEW CAPABILITY for either role: they hold zero, and
   * this block is own-record like everything else here. */
  function busWrongBlock() {
    return card(null,
      '<button type="button" class="btn me-wide" data-act="meReport">'
      + draw('warn', MARK) + ' ' + esc(say('meBusWrong')) + '</button>');
  }

  /* ---------- block 5: yours -------------------------------------------- */

  const DOCS = [
    { key: 'license', word: 'meDocLicence', expiry: true },
    { key: 'aadhaar', word: 'meDocAadhaar', expiry: false },
    { key: 'photo', word: 'meDocPhoto', expiry: false },
    { key: 'pan', word: 'meDocPan', expiry: false },
    { key: 'police', word: 'meDocPolice', expiry: true },
    { key: 'medical', word: 'meDocMedical', expiry: true }
  ];

  // The person's own documents, as words. The photograph's URL travels with the
  // row but is NOT loaded: see openDoc.
  function myDocs(model) {
    const crew = myCrew(model);
    const held = (crew && crew.docs) || {};
    const out = [];
    for (let i = 0; i < DOCS.length; i++) {
      const d = DOCS[i];
      const cur = held[d.key] || null;
      out.push({
        key: d.key, word: d.word,
        url: (cur && cur.photo) || '',
        expiry: (d.expiry && cur && cur.expiry) || '',
        left: d.expiry && cur && cur.expiry ? daysLeft(cur.expiry) : null
      });
    }
    return out;
  }

  function docsSub(model) {
    const list = myDocs(model);
    let held = 0, soon = null;
    for (let i = 0; i < list.length; i++) {
      if (list[i].url) held++;
      if (list[i].left != null && list[i].left <= DOC_SOON_DAYS
          && (soon === null || list[i].left < soon.left)) soon = list[i];
    }
    if (soon) return { text: fill('meDocsExpiring', say(soon.word), soon.left), warn: true, held: held };
    return { text: fill('meDocsOnFile', held, list.length), warn: false, held: held };
  }

  /* The device does not hold a crew member's own traced reviews: the server
   * traces them (`crew_trace.py`) and `/my/reviews` returns only the caller's,
   * which is why a driver's phone is never sent the reviews at all. So this is
   * UNKNOWN until the sheet has been opened once, and an unknown figure is the
   * dash — not a zero, and not "No reviews yet.", which would be a claim this
   * screen cannot make (ui/states.js's three different figures). */
  let mine = { reviews: null, coaching: null };

  function reviewsSub() {
    const r = mine.reviews;
    if (!r) return null;
    if (!r.count) return { text: say('meNoReviews'), value: 0 };
    return { text: fill('meReviewsSub', r.stars, r.count), value: r.stars };
  }

  /* Own approved notes, newest week first — the same rule the server's
   * `/my/coaching` applies (coachai.crewId === my crew record, approved only).
   *
   * `null` means UNKNOWN and `[]` means "I asked, and there are none", and the
   * difference is not academic: `coachai` is sent to the manager roles only
   * (`v2_perms.py:99` — "crew read their own through /my/coaching"), so a
   * driver's device never holds the store at all. Reading that absence as "No
   * note yet" would tell the one person the note is about that nothing was
   * written, which is the unknown-reads-as-zero failure with a sentence instead
   * of a number. So the row draws the dash until `/my/coaching` has answered. */
  function myCoaching(model) {
    if (mine.coaching) return mine.coaching;
    const list = rows(model, 'coachai');
    if (unread(list)) return null;                 // this device is not sent the store
    const crew = myCrew(model);
    if (!crew) return null;                        // and without a crew record we cannot ask
    const notes = [];
    for (let i = 0; i < list.length; i++) {
      const n = list[i];
      if (n && n.crewId === crew.id && n.status === 'approved') notes.push(n);
    }
    notes.sort(function (a, b) { return String(b.week || '').localeCompare(String(a.week || '')); });
    return notes;
  }

  function noteText(n) {
    const t = lang() === 'hi' ? (n.hi || n.en) : (n.en || n.hi);
    return String(t == null ? '' : t);
  }

  function noteLines(n) {
    const t = noteText(n).split('\n');
    const out = [];
    for (let i = 0; i < t.length; i++) if (!/^\s*$/.test(t[i])) out.push(t[i]);
    return out;
  }

  // Own cards only, by the same field the job card reads: `assignees[].userId`,
  // or the single `assignedTo` a card written by an older build carries.
  function myCards(model) {
    const u = user(model);
    const list = rows(model, 'jobcards');
    if (!u || !list) return null;
    const out = [];
    for (let i = 0; i < list.length; i++) {
      const j = list[i];
      if (!j) continue;
      const crew = (j.assignees && j.assignees.length) ? j.assignees
        : (j.assignedTo ? [{ userId: j.assignedTo }] : []);
      for (let k = 0; k < crew.length; k++) {
        if (crew[k] && crew[k].userId === u.id) { out.push(j); break; }
      }
    }
    return out;
  }

  /* §4.2 asks for "the three numbers" and does not say which three. The most
   * obvious reading of a mechanic's own row is the three states their own cards
   * are in, each a field on the card and none of them computed from anybody
   * else's work: open, done, signed off. Flagged in this slice's report. */
  function scoreSub(model) {
    const cards = myCards(model);
    if (!cards) return null;
    let open = 0, done = 0, signed = 0;
    for (let i = 0; i < cards.length; i++) {
      const s = String(cards[i].status || '');
      if (s === 'verified') signed++;
      else if (s === 'done') done++;
      else open++;
    }
    return { text: fill('meScoreSub', open, done, signed), open: open };
  }

  function yoursBlock(model) {
    const heading = say('meYours');
    const desk = (model && model.density) === 'desk';
    const crewRead = rows(model, 'drivers');
    if (unread(crewRead)) return card(heading, skel(3));
    let body = '';

    const docs = docsSub(model);
    body += row('meDocs', 'doc', say('meDocs'),
                desk && !docs.warn ? null : docs.text,
                desk && !docs.warn ? count(docs.held) : null);

    const rv = reviewsSub();
    body += row('meReviews', 'review', say('meReviews'),
                rv && !desk ? rv.text : null,
                rv ? fig(rv.value, null) : fig(null, null));

    const notes = myCoaching(model);
    const coachText = notes == null ? null
      : (notes.length ? fill('meCoachingSub', notes[0].week || '', noteLines(notes[0]).length)
                      : say('meNoCoaching'));
    // A sentence is DROPPED at desk rather than squeezed into the action
    // column, and only a number moves there (§4.2's desk paragraph). An unknown
    // is the dash either way: it is the one thing a sentence cannot say.
    body += row('meCoaching', 'star', say('meCoaching'), desk ? null : coachText,
                notes == null ? fig(null, null) : (desk ? count(notes.length) : null));

    if (can(model, 'viewScoreboard') && String(model && model.role) === 'mechanic') {
      const sc = scoreSub(model);
      body += row('meScore', 'star', say('meScore'), sc && !desk ? sc.text : null,
                  sc ? count(sc.open) : fig(null, null));
    }
    return card(heading, body);
  }

  /* ---------- block 6: this phone --------------------------------------- */

  function recordsHeld(model) {
    const c = (model && model.cache) || {};
    const names = Object.keys(c);
    let n = 0;
    for (let i = 0; i < names.length; i++) {
      const v = c[names[i]];
      if (v && typeof v.length === 'number') n += v.length;
    }
    return n;
  }

  /* The four facts, and they are the most useful thing on this screen when
   * there is no signal — which is why they are in the body and not only in the
   * sheet. They say what is ON THIS PHONE. There is no line about what the
   * server has: under LIVE-ISSUES 1 a change can have vanished with the screen
   * saying it sent, so "everything else was sent" is a sentence this card must
   * never carry. */
  function phoneFacts(model) {
    const i = info(model);
    const rep = (model && model.replica) || {};
    const held = recordsHeld(model);
    const sent = clock(i.lastSyncAt);
    let body = '';
    body += drow('clock', say('meWaiting'), count(i.pending == null ? null : Number(i.pending)));
    /* The one `at` on this screen, and it is on a FACT in a .drow rather than
     * on a figure inside a .v2row: §4.2 asks for `figure(v, {at})` here, and
     * the rule it would otherwise break ("no `at` on a figure inside a row") is
     * about a LIST stating its freshness once per row. Four facts are not a
     * list. */
    body += drow('offline', say('meLastSent'), fig(sent, { at: i.lastSyncAt == null ? null : i.lastSyncAt }));
    body += drow('count', say('meRecords'), count(held));
    /* The total is only drawn when there IS one. `behind` of 0 under an
     * incomplete replica means the shortfall is unknown — a device that has
     * never pulled, or one whose store could not be read — and adding 0 to what
     * is held manufactured a denominator equal to the numerator. See
     * `meHoldsUnknown`. */
    if (rep.complete !== true) {
      const behind = Number(rep.behind) || 0;
      body += '<p class="photos-hint">' + esc(behind > 0
        ? fill('meHolds', group(held), group(held + behind))
        : fill('meHoldsUnknown', group(held))) + '</p>';
    }
    return body;
  }

  /* Every refused or quarantined record surfaced with a reason and a Retry
   * (stage 1 §7 measure 7). Two of the three kinds are here; the third is not
   * possible — a record dropped on the `updatedAt` comparison returns 200 and
   * the client clears the outbox (LIVE-ISSUES 1) — so the copy does not promise
   * it.
   *
   * ONE ROW PER REASON, not per record, and that is a limit of the data rather
   * than a choice: `Sync.info()` exposes `reasons` deduplicated and
   * `quarantined` as a count, and does not expose the keys. `Sync.clearQuarantine()`
   * drains the whole quarantine, so each row's Retry retries that record among
   * the others. A per-record row needs one added field on `Sync.info()`, which
   * is `v2/sync.js` and not this slice's file — reported, not made. */
  function refusals(model, all) {
    const i = info(model);
    const list = (i.reasons && i.reasons.length) ? i.reasons : [];
    const n = Number(i.quarantined) || list.length;
    if (!list.length) return '';                  // absent when there are none; the facts above are not
    const shown = all ? list : list.slice(0, REFUSE_CAP);
    let body = '<p class="me-refused">' + esc(say('meRefused', n)) + '</p>'
      + '<p class="photos-hint">' + esc(say('meRefusedHint')) + '</p>';
    for (let k = 0; k < shown.length; k++) {
      body += row('meRetry', 'warn', say('meRefusedOne'), shown[k],
                  '<span class="btn btn-quiet">' + esc(say('retry')) + '</span>');
    }
    if (!all && list.length > REFUSE_CAP) {
      body += row('meDevice', 'offline', say('meSeeAll', list.length), null, null);
    }
    return body;
  }

  function phoneBlock(model) {
    const heading = say('mePhone');
    return card(heading, phoneFacts(model) + refusals(model, false)
      + '<button type="button" class="btn me-wide" data-act="meDevice">'
      + esc(say('deviceSheet')) + '</button>');
  }

  /* ---------- block 7: settings ----------------------------------------- */

  function themeNow() {
    const d = doc();
    const el = d && d.documentElement;
    const v = el && el.getAttribute ? el.getAttribute('data-theme') : null;
    if (v === 'light') return 'light';
    if (v === 'dark') return 'dark';
    return 'follow';
  }

  const THEME_WORD = { light: 'meThemeLight', dark: 'meThemeDark', follow: 'meThemeFollow' };

  function settingsBlock(model) {
    const th = themeNow();
    let body = '';
    body += row('meLang', 'map', say('meLang'), null,
                '<span class="me-value">' + esc(say('meLangValue')) + '</span>');
    body += row('meTheme', th === 'dark' ? 'sun' : 'moon', say('meTheme'), null,
                '<span class="me-value">' + esc(say(THEME_WORD[th])) + '</span>');
    /* Setting a PIN needs the network, and the row says so BEFORE it is
     * pressed, in the body (`03 §6`, §4.4 offline). The control is not absent:
     * it is a thing this person may do, just not now. */
    body += row('mePin', 'gate', say('mePin'),
                (model && model.offline) ? say('mePinOffline') : null, null);
    return card(say('meSettings'), body);
  }

  /* ---------- block 8: owner only --------------------------------------- */

  /* Gated on `viewAdoption`, which is the OWNER alone.
   *
   * §4.2 scopes the three rows to `viewAdoption`, `addPurchase` and
   * `garageSetup` separately, and §4.1's two-shape table lists the block as
   * "8 (owner)". Those disagree for a supervisor and a storekeeper, who hold
   * the second and third capability but not the first, and a card headed "Owner
   * only" drawn for a supervisor would be a false statement on screen. So the
   * BLOCK is the owner's and each row inside is still gated — the narrower
   * reading, which is the deny-by-default one. Flagged in this slice's report;
   * §4.2 itself says Garage setup is "one row to delete" if stage 1 disagrees.
   */
  function ownerBlock(model) {
    // The block is the owner's: a card headed "Owner only" drawn for a
    // supervisor would be a false statement on screen, and this is the
    // narrower of the two readings.
    if (!can(model, 'viewAdoption')) return '';
    let body = '';
    {
      const u = usageIndex(model, USAGE_WINDOWS[0]);
      body += row('meUsage', 'person', say('meWhoOpened'), say('meLastDays', USAGE_WINDOWS[0]),
                  u ? count(u.people.length) : fig(null, null));
    }
    if (can(model, 'addPurchase')) {
      body += row('meImport', 'add', say('meImport'), say('meImportHint'), null);
    }
    if (can(model, 'garageSetup')) {
      body += row('meSetup', 'edit', say('meSetup'), null, null);
    }
    return body === '' ? '' : card(say('meOwnerOnly'), body);
  }

  /* ---------- block 9: sign out ----------------------------------------- */

  function signOutBlock() {
    return '<button type="button" class="btn btn-danger me-wide" data-act="meSignOut">'
      + esc(say('meSignOut')) + '</button>';
  }

  /* ---------- §4.3 the who-opened-what readout -------------------------- */

  /* Aggregated ONCE PER CONTENT SIGNATURE — never per render and never per row.
   * `usage` is one row per person per day and the office keeps 120 days of it,
   * so a per-render aggregation is `computeInsights()` at 386 ms again. The
   * signature is `Cache.sig('usage')`, which is the device's own answer to "has
   * this changed?" and is taken from the write path rather than by reading the
   * content.
   *
   * THE READ BOUNDARY THIS ROW NEEDS NARROWED AND CANNOT NARROW. The server
   * sends `usage` to OWNER AND SUPERVISOR today (`03 §2.1`), so a supervisor's
   * device holds the record of who looked at the money, including their own, and
   * `viewAdoption` only stops the row being drawn. The records are on the phone
   * and a devtools console reads them. The client check above is worth having —
   * it is what makes the row owner-only in the interface — but it is NOT a
   * boundary until `usage`'s entitlement is narrowed to owner in the server's
   * read scope. That is a server change, it is recorded in stage 1 §4.3, and it
   * is not this slice's to make. It is named here because this is the one place
   * in the product where a client-only check guards a record ABOUT the people it
   * is hidden from, and this codebase has six recorded cases of a client-only
   * rule being walked around.
   *
   * And the sheet says nothing about who else can see it: there is no line
   * promising privacy this row does not have. */
  const usageMemo = { key: null, index: null };
  const stats = { usageBuilds: 0 };

  function usageSig() {
    const C = cacheMod();
    try { return (C && C.sig) ? C.sig('usage') : null; } catch (e) { return null; }
  }

  function usageIndex(model, days) {
    const list = rows(model, 'usage');
    if (unread(list)) return null;
    const sig = usageSig();
    const key = (sig === null ? String((list && list.length) || 0) : sig) + '|' + days;
    if (usageMemo.key === key && usageMemo.index) return usageMemo.index;
    usageMemo.key = key;
    usageMemo.index = buildUsage(model, list || [], days);
    stats.usageBuilds++;
    return usageMemo.index;
  }

  function buildUsage(model, list, days) {
    const from = dayKey(Date.now() - (days - 1) * DAY_MS);
    const by = {};
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (!r || !r.userId) continue;
      if (String(r.date || '') < from) continue;
      let p = by[r.userId];
      if (!p) {
        p = by[r.userId] = { userId: r.userId, name: r.name || '', role: r.role || '',
                             taps: 0, money: 0, attention: 0, lastAt: 0 };
      }
      p.taps += Number(r.taps) || 0;
      const sc = r.screens || {};
      p.money += Number(sc.money) || 0;
      p.attention += Number(sc.attention) || 0;
      const seen = Number(r.lastAt) || 0;
      if (seen > p.lastAt) p.lastAt = seen;
      if (!p.name && r.name) p.name = r.name;
    }
    const people = [];
    let k;
    for (k in by) if (has(by, k)) people.push(by[k]);
    /* Money first, because that is the question the decision asked
     * (DECISIONS.md §5: the money is deliberately shared with the supervisor,
     * so the owner should be able to see who opened it). Then everybody else by
     * last opened, most recent first; then userId ascending, for stability. */
    people.sort(function (a, b) {
      if (b.money !== a.money) return b.money - a.money;
      if (b.lastAt !== a.lastAt) return b.lastAt - a.lastAt;
      return String(a.userId).localeCompare(String(b.userId));
    });
    return { people: people, never: neverSignedIn(model, by), days: days };
  }

  // Names from `users` with no usage row in the window and no `lastLoginAt`.
  function neverSignedIn(model, seen) {
    const list = rows(model, 'users');
    if (!list || !list.length) return [];
    const out = [];
    for (let i = 0; i < list.length; i++) {
      const u = list[i];
      if (!u || !u.id) continue;
      if (has(seen, u.id) || u.lastLoginAt) continue;
      out.push(u);
    }
    out.sort(function (a, b) { return String(a.name || '').localeCompare(String(b.name || '')); });
    return out;
  }

  function usagePersonSub(p) {
    const bits = [];
    if (p.money) bits.push(fill('meOpenedTimes', screenName('money'), undefined, undefined, p.money));
    if (p.attention) bits.push(fill('meOpenedTimes', screenName('attention'), undefined, undefined, p.attention));
    const ago = agoWords(p.lastAt);
    bits.push(ago ? fill('meLastOpened', ago) : say('meNeverOpened'));
    return bits.join(' ');
  }

  function usageSheet(model, days) {
    const ix = usageIndex(model, days);
    if (!ix) return skel(5);
    let tabs = '<div class="tabs" role="tablist">';
    for (let i = 0; i < USAGE_WINDOWS.length; i++) {
      const d = USAGE_WINDOWS[i];
      tabs += '<button type="button" role="tab" aria-selected="' + (d === days ? 'true' : 'false') + '"'
        + ' data-act="meUsageDays" data-days="' + d + '">' + esc(say('meDaysTab', d)) + '</button>';
    }
    tabs += '</div>';
    let body = '';
    const shown = ix.people.slice(0, USAGE_CAP);
    for (let j = 0; j < shown.length; j++) {
      const p = shown[j];
      // NOT pressable: there is nowhere to go (§4.3).
      body += row(null, 'person', p.name || p.userId, usagePersonSub(p), count(p.taps));
    }
    if (!shown.length) body = empty(say('meNobodyOpened'), 'person');
    else if (ix.people.length > USAGE_CAP) {
      body += '<p class="photos-hint">'
        + esc(fill('meShownMore', USAGE_CAP, ix.people.length - USAGE_CAP)) + '</p>';
    }
    let never = '';
    if (ix.never.length) {
      never = '<h3>' + esc(say('meNeverSignedIn')) + '</h3>';
      for (let n = 0; n < ix.never.length; n++) {
        never += row(null, 'person', ix.never[n].name || ix.never[n].id, null, null);
      }
    }
    return tabs + body + never;
  }

  /* ---------- the sheets ------------------------------------------------- */

  function docsSheet(model) {
    const list = myDocs(model);
    let held = 0, body = '';
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      if (d.url) held++;
      /* WORDS BEFORE PICTURES (§4.7 rule 3). A document is listed by its TYPE
       * and its EXPIRY, in words, and NO image is loaded: the URL travels as a
       * data attribute and becomes an `<img src>` only inside `V2.openPhoto`,
       * on an explicit tap. A licence photograph nobody asked to see is an
       * unauthenticated request nobody asked for, and it puts the URL in the
       * cache and history of whatever device is in that person's hand. The
       * document's NUMBER is not drawn at all. */
      let sub = say('meDocMissing');
      if (d.url && d.expiry) {
        sub = d.left != null && d.left < 0 ? fill('meDocExpired', d.expiry) : fill('meDocExpires', d.expiry);
      } else if (d.url) sub = say('meDocHeld');
      body += row(d.url ? 'mePhoto' : null, 'doc', say(d.word), sub, null,
                  d.url ? { src: d.url, cap: say(d.word) } : null);
    }
    if (!held) return empty(say('meNoDocs'), 'doc') + body;
    return body;
  }

  function coachingSheet(model) {
    const notes = myCoaching(model);
    // Unknown is not empty: the skeleton stands until /my/coaching answers, and
    // offline it says there is no connection rather than "no note".
    if (notes == null) {
      if (model && model.offline) {
        return typeof root.offlineState === 'function' ? root.offlineState() : '';
      }
      return skel(3);
    }
    if (!notes.length) return empty(say('meNoCoaching'), 'star');
    let body = '';
    for (let i = 0; i < notes.length; i++) {
      const lines = noteLines(notes[i]);
      body += '<h3>' + esc(notes[i].week || '') + '</h3>';
      for (let k = 0; k < lines.length; k++) body += '<p class="me-note">' + esc(lines[k]) + '</p>';
    }
    return body;
  }

  function reviewsSheet(model) {
    const r = mine.reviews;
    if (!r) {
      if (model && model.offline) {
        return typeof root.offlineState === 'function' ? root.offlineState() : '';
      }
      return skel(3);
    }
    if (!r.count) return empty(say('meNoReviews'), 'review');
    let body = drow('star', fill('meReviewsSub', r.stars, r.count), '');
    for (let i = 0; i < r.rows.length; i++) {
      const rv = r.rows[i];
      body += row(null, 'review', String(rv.stars == null ? '' : rv.stars), rv.comment || null, null);
    }
    return body;
  }

  /* The device sheet: §1.9's offline button and block 6's row open the SAME one
   * and this is its contents. It holds the facts and EVERY refusal, which is
   * what block 6's "See all (23)" goes to, and it never says what the server
   * has. */
  function deviceSheet(model) {
    const m = model || {};
    const off = m.offline && typeof root.offlineState === 'function' ? root.offlineState() : '';
    try {
      return off + phoneFacts(m) + refusals(m, true);
    } catch (e) {
      return off;
    }
  }

  /* ---------- render ----------------------------------------------------- */

  /* Each block inside its own guard. See the header: one throw must cost one
   * block, because the alternative hands a driver or a conductor a blank
   * application. */
  function guarded(fn, model, heading) {
    try {
      const html = fn(model);
      return html == null ? '' : String(html);
    } catch (e) {
      if (typeof console !== 'undefined' && console.error) {
        console.error('[v2] me: a block could not be drawn', e);
      }
      return failedBlock(heading);
    }
  }

  function render(model) {
    const m = model || {};
    const crew = isCrew(m.role);
    /* Blocks 1, 2, 7 and 9 need no store read — the session already has the
     * name, the role, the language and the theme — so they draw in the first
     * paint. 3, 5, 6 and 8 draw their heading and a skeleton. The screen is
     * never blank, and for two roles that is the difference between an app and
     * the dead end of [E] 8db78e7. */
    let body = guarded(greeting, m, null);
    body += guarded(checkBlock, m, null);
    body += guarded(attendanceBlock, m, say('meAttendance'));
    if (crew) body += guarded(busWrongBlock, m, null);
    body += guarded(yoursBlock, m, say('meYours'));
    body += guarded(phoneBlock, m, say('mePhone'));
    body += guarded(settingsBlock, m, say('meSettings'));
    if (!crew) body += guarded(ownerBlock, m, say('meOwnerOnly'));
    body += guarded(signOutBlock, m, null);
    return '<div class="me">' + body + '</div>';
  }

  /* ---------- mount ------------------------------------------------------ */

  let listening = false;
  let usageDays = USAGE_WINDOWS[0];
  let writing = false;                 // a check-in or a report is in flight
  let pendingPhoto = '';               // the last capture, waiting for its write

  /* THE STORES THIS SCREEN READS. `users`, `drivers`, `jobcards`, `attendance`
   * and `meta` are in `PullApply.FIRST_STORES` and so arrive behind the first
   * paint; `usage` and `coachai` are in no load list in all of v2, and that is
   * REV-FLOW F3 on this screen. Measured: the owner's "who opened what" block
   * read `— No data` for ever, because nothing had ever asked IndexedDB for
   * `usage`. `driverreports` is written here (the driver's one write) and not
   * read back, so it is not in this list. */
  const STORES = ['users', 'drivers', 'jobcards', 'attendance', 'usage', 'coachai', 'meta'];

  /* The read, and the only place this screen asks IndexedDB for anything.
   *
   * From `mount()` and nowhere else; `Cache.reads()` must not move between two
   * draws of the same data. The `.then` is what puts the rows on screen without
   * waiting for `boot.js`'s next four-second tick, and `loading` keeps a mount
   * that lands mid-read from stacking a second one over the first. */
  let loading = false;

  function load() {
    const c = cacheMod();
    if (loading || !c || typeof c.load !== 'function') return null;
    loading = true;
    return c.load(STORES).then(function () { loading = false; reread(); },
                               function () { loading = false; });
  }

  /* Only while Me is still the screen on the page. For a driver and a conductor
   * it always is — it is their whole app — but the owner reaches it from six
   * other tabs and a read that settled after he left must not pull him back. */
  function reread() {
    const r = router();
    const c = (r && r.current) ? r.current() : null;
    if (!c || c.id !== ME) return;
    redraw();
  }

  /* ONE delegated click listener, on the document, installed once. A listener
   * per row is half of the 277 ms a page used to cost. */
  function mount() {
    /* The read is the first statement, above the listener guard. See `duty.js`'s
     * mount: it runs on each entry either way because `unmount()` clears the
     * guard, and the position is what keeps it from depending on that. */
    load();
    const d = doc();
    if (listening || !d || typeof d.addEventListener !== 'function') return false;
    listening = true;
    d.addEventListener('click', onClick);
    /* And one `change`, which cannot be the click: a camera is reached on
     * Chrome 109 only through a label-wrapped file input, the selection arrives
     * as a `change`, and the click on that label must NOT be intercepted — which
     * is exactly what the first line of onClick guarantees. */
    d.addEventListener('change', onChange);
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
    const d = doc();
    if (listening && d && typeof d.removeEventListener === 'function') {
      d.removeEventListener('click', onClick);
      d.removeEventListener('change', onChange);
    }
    listening = false;
    return true;
  }

  function onClick(ev) {
    const t = ev && ev.target;
    if (!t || typeof t.closest !== 'function') return;
    /* THE LINE. A tap on a field, on its label or on a count cell belongs to
     * that field and to nothing else, and it is read BEFORE `[data-act]` and
     * `[data-nav]` so a field inside a row can never reach the row's handler.
     * This exact check was missing once: a shelf-count field sat inside a
     * pressable row, the row's handler caught the click and the storekeeper was
     * thrown off the screen mid-count (predeploy-gate.sh:508, and the sweep at
     * :1073). */
    if (t.closest('input, select, textarea, label, .num')) return;
    const el = t.closest('[data-act]');
    if (!el) return;
    const act = el.getAttribute('data-act');
    if (!act || !has(ACTS, act)) return;
    if (ev.preventDefault) ev.preventDefault();
    try { ACTS[act](el); } catch (e) {
      if (typeof console !== 'undefined' && console.error) console.error('[v2] me: ' + act, e);
    }
  }

  /* The model an action works from. `Shell.mount` hands `render` the frame's
   * own model and does not export it, so an action rebuilds it from the same
   * three sources the frame uses — `S`, `Boot.density()` and `Boot.replica()` —
   * rather than keeping a copy of the last render's. A screen holding a stale
   * model is a screen writing against data that has moved. */
  function model() {
    const S = (typeof root.S !== 'undefined' && root.S) || {};
    const b = (typeof Boot !== 'undefined' && Boot) || (root && root.Boot) || null;
    const d = doc();
    const el = d && d.documentElement;
    const dens = (el && el.getAttribute && el.getAttribute('data-density'))
      || (b && b.density ? b.density() : 'yard');
    const rep = (b && b.replica ? b.replica() : null) || { behind: 0, complete: false };
    const i = info(null);
    return { route: ME, params: null, role: (S.user && S.user.role) || null,
             user: S.user || null, cache: S.cache || {},
             density: dens === 'desk' ? 'desk' : 'yard',
             replica: rep, stale: rep.complete !== true,
             offline: !!(i.lastError || i.status === 'offline'
                         || (root.navigator && root.navigator.onLine === false)) };
  }

  function sheet(title, html) {
    const V = overlay();
    if (V && typeof V.openSheet === 'function') V.openSheet(title, html);
  }

  function toast(text, kind) {
    const V = overlay();
    if (V && typeof V.toast === 'function') V.toast(text, { kind: kind });
  }

  /* While a write is in flight the button says what it is doing — no spinner,
   * no animation (foundation §3.3). `aria-disabled`, not `disabled`: the label
   * has to stay readable and reachable. */
  function working(el, word) {
    if (!el || !el.setAttribute) return;
    el.setAttribute('aria-disabled', 'true');
    if (typeof el.textContent === 'string' || el.textContent === '') el.textContent = word;
  }

  function reportSheet() {
    let opts = '';
    for (let i = 0; i < AREAS.length; i++) {
      opts += '<option value="' + esc(areaValue(AREAS[i])) + '">' + esc(say(AREAS[i].word)) + '</option>';
    }
    /* The icon set has no microphone and this cut adds no icon, so the voice
     * control carries its word alone. A word is the thing that has to be
     * there; a mark that meant something else would be worse than none. */
    const voice = speech() ? '<button type="button" class="btn" data-act="meSpeak">'
      + esc(say('meSpeak')) + '</button>' : '';
    const cap = typeof root.photoCapture === 'function' ? root.photoCapture(say('meFace'), 'mePhoto') : '';
    pendingPhoto = '';
    sheet(say('meBusWrong'),
      '<label class="field"><span class="num-l">' + esc(say('meReportArea')) + '</span>'
      + '<select class="select" id="me-area">' + opts + '</select></label>'
      + '<label class="field"><span class="num-l">' + esc(say('meReportWhat')) + '</span>'
      + '<textarea class="field" id="me-what"></textarea></label>'
      + '<div class="photos">' + cap + '</div>' + voice
      + '<button type="button" class="btn btn-primary me-wide" data-act="meSend">'
      + esc(say('meReportSend')) + '</button>');
  }

  function speech() {
    return (root && (root.SpeechRecognition || root.webkitSpeechRecognition)) || null;
  }

  /* Dictation, for a person who finds typing hard. The control is ABSENT when
   * the browser has no recogniser rather than present and silent, which is the
   * same rule as a row a person may not use. */
  function dictate() {
    const SR = speech();
    const d = doc();
    const box = d && d.getElementById ? d.getElementById('me-what') : null;
    if (!SR || !box) return;
    const rec = new SR();
    rec.lang = lang() === 'hi' ? 'hi-IN' : 'en-IN';
    rec.interimResults = false;
    rec.onresult = function (e) {
      const said = (e && e.results && e.results[0] && e.results[0][0] && e.results[0][0].transcript) || '';
      if (said) box.value = (box.value ? box.value + ' ' : '') + said;
    };
    try { rec.start(); } catch (err) { /* a recogniser that will not start says nothing */ }
  }

  function field(id) {
    const d = doc();
    const el = d && d.getElementById ? d.getElementById(id) : null;
    return el && el.value != null ? String(el.value) : '';
  }

  function uid(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function stamp() {
    const s = sync();
    try { return (s && s.now) ? s.now() : Date.now(); } catch (e) { return Date.now(); }
  }

  /* The bus-fault report. The server already drafts a job card from it within
   * ten minutes and pushes the owner if it reads as unsafe, so what this owes
   * is a complete record and nothing clever. */
  function sendReport(el) {
    const D = db();
    const what = field('me-what').replace(/^\s+|\s+$/g, '');
    if (!what && !pendingPhoto) { toast(say('meReportNeeds'), 'warn'); return; }
    if (!D || writing) return;
    const m = model();
    const u = user(m) || {};
    const crew = myCrew(m);
    working(el, say('meSending'));
    writing = true;
    const rec = { id: uid('dr-'), driverId: (crew && crew.id) || null, busId: (crew && crew.busId) || null,
                  category: field('me-area') || areaValue(AREAS[AREAS.length - 1]),
                  problem: what, photo: pendingPhoto, at: stamp(), status: 'open',
                  jobId: null, resolvedAt: null, by: u.id || null };
    Promise.resolve(D.put('driverreports', rec)).then(function () {
      writing = false;
      pendingPhoto = '';
      const V = overlay();
      if (V && typeof V.closeSheet === 'function') V.closeSheet();
      toast(say('meReportSent'), 'ok');
      redraw();
    }, function () {
      writing = false;
      toast(say('meSaveFailed'), 'bad');
    });
  }

  /* Check in / check out. The capture comes first because attendance is
   * unverifiable without proof of who showed up; the LOCATION may fail and the
   * record is saved anyway, with the row reading "location not recorded". The
   * capture is never discarded for a missing location — if attendance decides
   * wages, a silent failure is a wages bug, not a UX bug (§4.4). */
  function checkSheet(el) {
    const kind = (el && el.getAttribute && el.getAttribute('data-kind')) === 'out' ? 'out' : 'in';
    const cap = typeof root.photoCapture === 'function' ? root.photoCapture(say('meFace'), 'meSelfie') : '';
    pendingPhoto = '';
    sheet(say(kind === 'out' ? 'meCheckOut' : 'meCheckIn'),
      '<div class="photos">' + cap + '</div>'
      + '<button type="button" class="btn btn-primary me-wide" data-act="meCheckSave"'
      + ' data-kind="' + kind + '">' + esc(say(kind === 'out' ? 'meCheckOut' : 'meCheckIn')) + '</button>');
  }

  function geo() {
    const nav = root && root.navigator;
    if (!nav || !nav.geolocation || !nav.geolocation.getCurrentPosition) return Promise.resolve(null);
    return new Promise(function (res) {
      let done = false;
      try {
        nav.geolocation.getCurrentPosition(function (p) { if (!done) { done = true; res(p); } },
                                           function () { if (!done) { done = true; res(null); } },
                                           { enableHighAccuracy: true, timeout: 8000 });
      } catch (e) { res(null); }
    });
  }

  function garageRecord(m) {
    const meta = rows(m, 'meta');
    if (!meta) return null;
    for (let i = 0; i < meta.length; i++) if (meta[i] && meta[i].key === 'garage') return meta[i];
    return null;
  }

  function metres(a, b, c, d) {
    const R = 6371000, rad = Math.PI / 180;
    const dLat = (c - a) * rad, dLon = (d - b) * rad;
    const s = Math.sin(dLat / 2) * Math.sin(dLat / 2)
      + Math.cos(a * rad) * Math.cos(c * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(s))));
  }

  function saveCheck(el) {
    const D = db();
    if (!D || writing) return;
    const kind = (el && el.getAttribute && el.getAttribute('data-kind')) === 'out' ? 'out' : 'in';
    const m = model();
    const u = user(m) || {};
    working(el, say(kind === 'out' ? 'meCheckingOut' : 'meCheckingIn'));
    writing = true;
    geo().then(function (p) {
      const g = garageRecord(m);
      let lat = null, lng = null, dist = null;
      if (p && p.coords) {
        lat = p.coords.latitude; lng = p.coords.longitude;
        // Only against a REAL garage point: until the owner captures one the
        // stored coordinates are a placeholder, and a distance off a placeholder
        // is a number that means nothing. `dist` stays null instead of lying.
        if (g && g.locSet) dist = metres(g.lat, g.lng, lat, lng);
      }
      const at = stamp();
      const cut = (g && g.lateCutoff) || '';
      const rec = { id: uid('a-'), userId: u.id || null, type: kind, at: at, lat: lat, lng: lng,
                    dist: dist, selfie: pendingPhoto, late: kind === 'in' && isLate(at, cut),
                    flagged: lat == null || !!(g && g.locSet && dist != null && dist > g.radiusM) };
      return Promise.resolve(D.put('attendance', rec)).then(function () {
        writing = false;
        pendingPhoto = '';
        const V = overlay();
        if (V && typeof V.closeSheet === 'function') V.closeSheet();
        /* A check-in that failed is a toast and the button returns to "Check
         * in": the sheet has closed by then and the person is standing at a
         * gate (§4.4 error). */
        toast(fill(kind === 'out' ? 'meCheckedOutAt' : 'meCheckedAt', clock(at) || ''), 'ok');
        redraw();
      });
    }).then(null, function () {
      writing = false;
      toast(say('meCheckFailed'), 'bad');
      redraw();
    });
  }

  // Late by the garage's configured shift start, read off the SERVER's clock
  // (`Sync.now`): a phone set back no longer checks in on time.
  function isLate(at, cutoff) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(cutoff || ''));
    if (!m) return false;
    const d = new Date(Number(at));
    return (d.getHours() * 60 + d.getMinutes()) > (Number(m[1]) * 60 + Number(m[2]));
  }

  /* A capture's bytes. The upload is attempted and the DATA URL is the fallback
   * — the record keeps the photograph either way, which is the half of
   * LIVE-ISSUES 9 this screen can honour: a capture is never thrown away
   * because the network was not there. */
  function onChange(ev) {
    const t = ev && ev.target;
    if (!t || t.type !== 'file' || !t.files || !t.files[0]) return;
    const reader = root && root.FileReader ? new root.FileReader() : null;
    if (!reader) return;
    reader.onload = function () {
      const data = String(reader.result || '');
      pendingPhoto = data;
      const s = sync();
      if (!s || typeof s.uploadPhoto !== 'function') return;
      Promise.resolve(s.uploadPhoto(data)).then(function (url) {
        if (url) pendingPhoto = url;
      }, function () { /* the data URL stands: the photograph is not lost */ });
    };
    try { reader.readAsDataURL(t.files[0]); } catch (e) { /* nothing to read */ }
  }

  /* A document's photograph, on an explicit tap and never before it. The URL
   * reaches an `<img>` only here, inside `V2.openPhoto` — which carries
   * `referrerpolicy="no-referrer"` — and never as an anchor, a copy, a share or
   * a download. */
  function openDoc(el) {
    const V = overlay();
    const src = el && el.getAttribute ? el.getAttribute('data-src') : '';
    if (!src || !V || typeof V.openPhoto !== 'function') return;
    V.openPhoto(src, el.getAttribute('data-cap') || '');
  }

  function toggleLang() {
    const d = doc();
    const el = d && d.documentElement;
    if (!el || !el.setAttribute) return;
    // The document's own `lang` is the one source: it is what drives --font-hi
    // and --lh: 1.7 through :lang(hi). A language kept in a second place is a
    // language that can disagree with the font it is in.
    el.setAttribute('lang', lang() === 'hi' ? 'en' : 'hi');
    if (el.lang !== undefined) el.lang = lang() === 'hi' ? 'en' : 'hi';
    redraw();
  }

  const THEME_NEXT = { light: 'dark', dark: 'follow', follow: 'light' };

  function cycleTheme() {
    const d = doc();
    const el = d && d.documentElement;
    if (!el || !el.setAttribute) return;
    const next = THEME_NEXT[themeNow()];
    // On the SAME element as data-v2, which tokens.css requires: its dark guard
    // is `[data-v2]:not([data-theme="light"])` and only ever sees data-theme
    // where data-v2 is.
    if (next === 'follow') el.removeAttribute('data-theme');
    else el.setAttribute('data-theme', next);
    redraw();
  }

  function signOut() {
    const V = overlay();
    if (!V || typeof V.confirmDialog !== 'function') return;
    // Focus starts on Stay: overlay.js puts it on the no button, and a
    // reflexive Enter therefore says no.
    V.confirmDialog(say('meSignOutBody'), { title: say('meSignOut'), yes: say('meSignOut'),
                                            no: say('meStay'), danger: true })
      .then(function (yes) {
        if (!yes) return;
        /* `Sync.logout()` alone drops the token and leaves `S.user` set, so the
         * person stayed inside the app holding no session -- a dead control.
         * `Boot.signOut()` is the mirror of `Boot.enter()`: it clears the actor
         * and the cache and returns the document to the login without a reload.
         * The `Sync.logout()` fallback stays for a boot that predates it. */
        const b = root.Boot;
        if (b && typeof b.signOut === 'function') { b.signOut(); return; }
        const s = sync();
        if (s && typeof s.logout === 'function') s.logout();
      });
  }

  function retryRefused() {
    const s = sync();
    if (s && typeof s.clearQuarantine === 'function') s.clearQuarantine();
    redraw();
  }

  function openUsage() {
    sheet(say('meWhoOpened'), usageSheet(model(), usageDays));
  }

  function setUsageDays(el) {
    const d = Number(el && el.getAttribute && el.getAttribute('data-days'));
    if (USAGE_WINDOWS.indexOf(d) === -1) return;
    usageDays = d;
    openUsage();
  }

  /* The reviews sheet fetches `/my/reviews`, which is the own-record path the
   * server already has: a crew member's device is never SENT the reviews, and is
   * never sent the PNR, seat or time either. Offline the sheet says so rather
   * than showing an empty list, which would read as "no reviews". */
  function openReviews() {
    const m = model();
    sheet(say('meReviews'), reviewsSheet(m));
    if (mine.reviews || m.offline) return;
    const s = sync();
    if (!s || typeof s.myReviews !== 'function') return;
    Promise.resolve(s.myReviews()).then(function (r) {
      const list = (r && r.reviews) || [];
      let sum = 0, n = 0;
      for (let i = 0; i < list.length; i++) {
        const v = Number(list[i] && list[i].stars);
        if (isFinite(v) && v > 0) { sum += v; n++; }
      }
      const f = fmtOf();
      mine.reviews = { count: list.length, rows: list.slice(0, 50),
                       stars: n && f ? f.oneDecimal(sum / n) : null };
      sheet(say('meReviews'), reviewsSheet(model()));
      redraw();
    }, function () { /* the sheet keeps its skeleton; nothing is claimed */ });
  }

  function openCoaching() {
    const m = model();
    sheet(say('meCoaching'), coachingSheet(m));
    // Only when the answer is UNKNOWN: a device that holds the store already
    // knows, and asking again would be a request nobody needs.
    if (mine.coaching || m.offline || myCoaching(m) != null) return;
    const s = sync();
    if (!s || typeof s.myCoaching !== 'function') return;
    Promise.resolve(s.myCoaching()).then(function (r) {
      const notes = (r && r.notes) || [];
      if (!notes.length) return;
      mine.coaching = notes;
      sheet(say('meCoaching'), coachingSheet(model()));
      redraw();
    }, function () { /* nothing is claimed */ });
  }

  /* Change my PIN, Import from Excel and Garage setup all need the network, and
   * §4.2 specifies their ROWS and not their sheets — the three flows themselves
   * are v1's and no part of this cut. So each opens a sheet carrying the one
   * fact §4.2 gives it, and offline it says so before anything is filled in
   * rather than after (§4.4). No half-flow and no sheet that cannot finish.
   * Flagged in this slice's report. */
  function needsNetwork(word, hint, mark) {
    return function () {
      const m = model();
      if (m.offline) { toast(say('mePinOffline'), 'warn'); return; }
      sheet(say(word), empty(say(hint), mark));
    };
  }

  /* The PIN sheet. Two rules, and the first is this file's only handling of a
   * secret: the digits are read from the field, handed to `Sync.setPin` and
   * never logged, never put in a toast and never written to a record. The
   * second is §4.2's: the sheet says it needs a connection BEFORE the person
   * fills it in, which is why the sentence is the first thing in the body.
   *
   * `type="text"` with `inputmode="numeric"`, never `type="number"`: a number
   * input puts spinners in a 32px desk row and CHANGES ITS VALUE on a mouse
   * wheel (components.css §3.3). */
  function pinSheet() {
    const m = model();
    if (m.offline) { toast(say('mePinOffline'), 'warn'); return; }
    sheet(say('mePin'),
      '<p class="photos-hint">' + esc(say('mePinOffline')) + '</p>'
      + '<label class="num"><span class="num-l">' + esc(say('mePinNew')) + '</span>'
      + '<input class="field num-in" id="me-pin" type="text" inputmode="numeric" pattern="[0-9]*"'
      + ' autocomplete="off" enterkeyhint="done" maxlength="4" data-kind="whole">'
      + '<span class="num-h">' + esc(say('mePinFourDigits')) + '</span></label>'
      + '<button type="button" class="btn btn-primary me-wide" data-act="mePinSave">'
      + esc(say('mePin')) + '</button>');
  }

  function savePin(el) {
    const s = sync();
    const m = model();
    const u = user(m) || {};
    const pin = field('me-pin');
    if (!/^\d{4}$/.test(pin)) { toast(say('mePinFourDigits'), 'warn'); return; }
    if (!s || typeof s.setPin !== 'function' || !u.id || writing) return;
    working(el, say('meSending'));
    writing = true;
    Promise.resolve(s.setPin(u.id, pin)).then(function () {
      writing = false;
      const V = overlay();
      if (V && typeof V.closeSheet === 'function') V.closeSheet();
      toast(say('mePinSaved'), 'ok');
    }, function () {
      writing = false;
      toast(say('meSaveFailed'), 'bad');
    });
  }

  const ACTS = {
    meCheck: checkSheet,
    meCheckSave: saveCheck,
    meReport: reportSheet,
    meSend: sendReport,
    meSpeak: dictate,
    meDocs: function () { sheet(say('meDocs'), docsSheet(model())); },
    mePhoto: openDoc,
    meReviews: openReviews,
    meCoaching: openCoaching,
    meScore: function () {
      const sc = scoreSub(model());
      sheet(say('meScore'), sc ? drow('star', sc.text, '') : skel(3));
    },
    meDevice: function () { sheet(say('deviceSheet'), deviceSheet(model())); },
    meRetry: retryRefused,
    meLang: toggleLang,
    meTheme: cycleTheme,
    mePin: pinSheet,
    mePinSave: savePin,
    meUsage: openUsage,
    meUsageDays: setUsageDays,
    meImport: needsNetwork('meImport', 'meImportHint', 'add'),
    meSetup: needsNetwork('meSetup', 'meSetupHint', 'edit'),
    meSignOut: signOut
  };

  const api = {
    render: render,
    deviceSheet: deviceSheet,
    mount: mount,
    unmount: unmount,
    // Test seams only, the shape of Router._reset and Shell._reset: a node
    // suite cannot reload a classic script per case.
    _reset: function () {
      usageMemo.key = null; usageMemo.index = null; stats.usageBuilds = 0;
      mine = { reviews: null, coaching: null };
      usageDays = USAGE_WINDOWS[0]; writing = false; pendingPhoto = '';
    },
    _stats: function () { return { usageBuilds: stats.usageBuilds }; }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.Me = api;
    // Registered at load, like every screen: it draws nothing until
    // Shell.mount asks. Router refuses an unknown id and a module with no
    // render, which is the deny-by-default shape.
    const r = router();
    if (r && typeof r.register === 'function') r.register(ME, api);
  }
})(typeof window !== 'undefined' ? window : this);

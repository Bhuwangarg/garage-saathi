/* Garage Saathi v2 — the login. The one screen outside the thirteen.
 *
 * Beside boot.js and shell.js and NOT in screens/, because `screens/` is exactly
 * the thirteen capability-guarded modules and several checks compare
 * `readdirSync('v2/screens')` against `Caps.SCREENS` (test_v2_boot.js's
 * SCREENS_SLOT). Login is definitionally outside that set — it has to be
 * reachable holding NO capability, so it can never appear in the capability
 * table — and a file in `screens/` would put those two lists permanently at
 * odds. `v2/shell.js:61` already says it: the login is not one of the thirteen,
 * because nobody is signed in when it is drawn.
 *
 * It registers NOTHING with Router and appears NOWHERE in caps.js. It reads
 * neither, and signing in grants nothing: all it does is put a person in
 * `S.user` and hand over to `Boot.enter`, after which `Caps.screensFor` decides
 * what that role may see exactly as it does for a restored session.
 *
 * THREE STEPS, as v1 has them (app.js:13509 renderLogin -> :13562
 * renderRolePick -> :13602 renderPin): role tiles, then names, then the pad.
 *
 * FIVE THINGS HERE THAT ARE NOT PREFERENCES
 *
 * 1. `known: true` NEVER falls back to the device PIN. That is the whole point
 *    of the flag: a wrong PIN the server is sure about stays wrong offline. The
 *    stale copy on the phone is dropped at the same moment, because without
 *    that a cached PIN silently outranks the server and a rotated credential
 *    keeps working on every phone that ever used the old one.
 *
 * 2. The owner, the supervisor and the crew manager have NO device PIN at all
 *    (v2-ux.md §6: their PIN is never kept on the device), so for those three
 *    the login IS one network request with nothing behind it. A cold container
 *    is 30-36 seconds, not the ten an earlier comment estimated, which is why
 *    `warmUp()` fires when this screen OPENS rather than when the fourth digit
 *    lands, and why their request is given the long timeout `v2/sync.js`'s own
 *    comment asks for. Giving up at 8 s on a container that was still starting
 *    told the owner "can't reach the server" when it was only slow.
 *
 * 3. THE PIN IS NEVER DRAWN, logged, titled or put in an attribute. `pin` below
 *    is a module-local string; the dots are a COUNT of it and the accessible
 *    name says the count, never the digits. `data-k` carries the keypad's own
 *    fixed label, which is the key you are looking at and not the key you
 *    pressed. It is cleared before the hand-off, so no signed-in session is
 *    holding one.
 *
 * 4. ZERO AND UNKNOWN DO NOT LOOK ALIKE (v2-foundation-ui.md §3.6). The `users`
 *    store is `undefined` until `Cache.load` has run and `[]` when this device
 *    genuinely holds nobody; the first draws a skeleton and the second says so
 *    in a sentence. "No recent users on this phone" is a sentence too, not an
 *    empty list drawn as nothing.
 *
 * 5. A DEVICE THAT HOLDS NOBODY ASKS THE SERVER, because otherwise it is stuck
 *    for good. The roster comes down with a pull, a pull needs a token, a token
 *    needs a login, and the login is built from the roster — so a phone out of
 *    the box drew an honest sentence that was also a dead end. `Sync.roster()`
 *    is the one request in this app with no token and it exists to break that
 *    circle; until now nothing called it. See askRoster() for the three guards
 *    that make it safe: it is asked only when this device holds nobody, an
 *    empty answer is treated as a failure and never written, and the row
 *    written is three named columns and never a copy of what arrived. And
 *    because the answer may be slow or may never come, that wait is a THIRD
 *    state alongside note 4's two: finding out, which is not the same as not
 *    read yet and is not the same as nobody is here.
 *
 * The markup is `v2/ui/login.css`'s, which shipped a whole wave before this
 * file: the `.lg*` family, `.v2row` rows in a `.lg-list`, and the pad's own
 * names rather than the live stylesheet's `.pinpad button`, which that file
 * explains it would lose a specificity fight with.
 */
(function (root) {
  'use strict';

  var ID = 'login';

  // Four digits, and the pad submits on the fourth. Named so the dots, the
  // accessible name and the submit test cannot drift apart.
  var DIGITS = 4;

  var MARK = 20;                  // the row marks, matching the nav's
  var BIG = 30;                   // the one mark above the fold

  /* A search box appears past six names and not before: six rows is one
   * screenful at 360px, and a search box over five names is a control that
   * cannot help. v1 draws it at the same count (app.js:13573). */
  var SEARCH_AT = 6;

  // Four recent faces, as v1 keeps (app.js:13978). A fifth is a list to scan.
  var RECENT_MAX = 4;

  /* THE THREE ROLES WITH NO OFFLINE PATH. Their PIN is never kept on a phone —
   * a PIN in device storage is readable by anyone who gets at the phone, and
   * these three open the whole garage. v1 states the same list at
   * `PIN_NO_CACHE_ROLES` (app.js:13724) and it has to stay the same list: a
   * role in one and not the other is a PIN cached on a device that the other
   * app will not cache, which is the kind of disagreement nobody notices. */
  var NO_DEVICE_PIN = ['owner', 'supervisor', 'crewmanager'];

  /* The two timeouts, and the reason there are two is in `v2/sync.js`'s own
   * comment above `login()`. A device that CAN fall back gives up fast —
   * waiting a minute in front of a working offline login is the opposite
   * mistake. A device that cannot waits past a real cold start, and then tries
   * once more: `offline` after a wait that long is a container that was still
   * booting, and it is warm by the time we are told, so the second attempt
   * answers in a fraction of a second and turns a failure into a login. */
  var WAIT_FAST_MS = 8000;
  var WAIT_SLOW_MS = 60000;
  var WAIT_RETRY_MS = 20000;

  /* When the pad admits it is waiting. Five seconds is long enough that a warm
   * round trip never shows it and short enough that nobody decides the app
   * missed the tap. */
  var SAY_WAKING_MS = 5000;

  /* THE SELECTOR THE ONE DELEGATED CLICK LISTENER RETURNS EARLY ON, before it
   * reads `[data-act]`. This screen holds a search input, and a field inside a
   * pressable surface is the regression that threw the storekeeper off the
   * screen mid-count — `predeploy-gate.sh` scans every screen for exactly this
   * ordering. It scans `v2/screens/*.js` and so does not see this file, which
   * is why `test_v2_login.js` carries the same two conditions itself. */
  var FIELDS = 'input, select, textarea, label, .num';

  /* Where this device remembers who has signed in on it, and whose PIN it may
   * keep. BOTH KEYS ARE V1'S, deliberately: v2 is served from /v2/ on the same
   * origin, so this is one device with one credential store, and a second copy
   * under a v2 name would mean a crew member who has signed in to the live app
   * on this phone could not sign in to v2 offline. No secret is in the recent
   * list — ids only, and the PIN is still required. */
  var RECENT_KEY = 'gs-recent';
  var CRED_KEY = 'creds';

  /* The eight roles that sign in, in the order the tiles are drawn.
   *
   * v1's `NO_LOGIN_ROLES` is empty (app.js:13438) — every role has a login,
   * mechanics included — so this is the whole list, and it is this file's own
   * list rather than a read of `Caps`: nothing here may touch the capability
   * table (a login holds no capability and grants none), and the display order
   * of eight tiles is not a permission. It matches v1's `ROLE_META` order
   * (app.js:13424) so the two apps do not disagree about where "Driver" is. */
  var ROLES = ['owner', 'supervisor', 'crewmanager', 'office',
               'store', 'mechanic', 'driver', 'conductor'];

  var ROLE_WORD = {
    owner: 'lgRoleOwner', supervisor: 'lgRoleSupervisor', crewmanager: 'lgRoleCrewManager',
    office: 'lgRoleOffice', store: 'lgRoleStore', mechanic: 'lgRoleMechanic',
    driver: 'lgRoleDriver', conductor: 'lgRoleConductor'
  };

  /* The server's refusal reasons, mapped to the sentence each one earns. A
   * retired PIN is the RIGHT PIN, not a guess — the old shared crew PIN, or one
   * printed in the public source — so it is told what to do instead of "wrong
   * PIN", which is v1's own correction (app.js:13918). */
  var REASON_WORD = { default_pin: 'lgPinRetired', demo_pin: 'lgPinRetired',
                      account_disabled: 'lgLoginOff' };

  /* ---------- the words ---------------------------------------------------
   *
   * Every fixed word this screen draws is an id, for the reason
   * v2-foundation-ui.md §6.3 gives: a fixed English word hard-coded at the
   * point of use is a word no Hindi reader is ever told is missing, and that is
   * how a whole screen stayed English with every test passing. The Hindi halves
   * are '' — PENDING, which is a state and not an absence: test_v2_words.js
   * prints the pending count by name on every run, and a pending label draws
   * its English WITH ITS ID in Hindi mode so a reader can report it. Inventing
   * Hindi the owner has not read would hide exactly that (DECISIONS.md §21).
   *
   * These matter more than most: this is the first screen every one of the
   * hundred people sees, and for three roles it is the only screen they can
   * reach without a network. */
  var WORDS = {
    /* The eight role names. v1's `ROLE_META` (app.js:13424) holds the same eight
     * English words and this is the first time they have been ids: on the login
     * they are the ONLY thing distinguishing eight doors, so a Hindi reader who
     * is shown eight English words here cannot start the app at all. */
    lgRoleOwner: { en: 'Owner', hi: '' },
    lgRoleSupervisor: { en: 'Supervisor', hi: '' },
    lgRoleCrewManager: { en: 'Crew Manager', hi: '' },
    lgRoleOffice: { en: 'Office', hi: '' },
    lgRoleStore: { en: 'Store', hi: '' },
    lgRoleMechanic: { en: 'Mechanic', hi: '' },
    lgRoleDriver: { en: 'Driver', hi: '' },
    lgRoleConductor: { en: 'Conductor', hi: '' },

    lgTag: { en: 'Sign in to carry on', hi: '' },
    lgRecent: { en: 'Recent on this phone', hi: '' },
    // Not an empty list drawn as nothing: §3.6's rule, on the one screen where
    // a blank space is indistinguishable from the app being broken.
    lgRecentNone: { en: 'Nobody has signed in on this phone yet', hi: '' },
    lgWho: { en: 'Who are you?', hi: '' },
    lgPickName: { en: 'Find your name', hi: '' },
    lgSearchName: { en: 'Search for your name', hi: '' },
    lgNoMatch: { en: 'No name matches that', hi: '' },
    /* The hint names WHY there is nobody, and it is the reason rather than a
     * guess about it. This screen only draws this state after it has asked the
     * server for the roster and come away without one (see askRoster), so the
     * honest sentence is that the server could not be reached — not that the
     * phone has never synced, which it may well have done. A device that really
     * had nobody to show would be a garage with no staff, and an empty answer
     * from the server is read as a failure here for exactly that reason. */
    lgNoUsers: { en: 'No accounts on this phone yet', hi: '' },
    lgNoUsersHint: { en: 'The server could not be reached, so there is nobody to show. Put this phone on the network and open this page again.', hi: '' },
    lgEnterPin: { en: 'Enter your PIN', hi: '' },
    // The COUNT of digits entered, which is what the dots show. Never the
    // digits: see note 3 in the header.
    lgDigits: { en: '{0} of {1} digits entered', hi: '' },
    lgBack: { en: 'Back', hi: '' },
    lgCancel: { en: 'Cancel', hi: '' },
    lgPadBack: { en: 'Delete the last digit', hi: '' },
    lgWrongPin: { en: 'That PIN is not right', hi: '' },
    lgPinRetired: { en: 'That PIN has been retired. Ask the owner for a new one.', hi: '' },
    lgLoginOff: { en: 'This login has been turned off', hi: '' },
    lgTooMany: { en: 'Too many tries. Wait {0} seconds and try again.', hi: '' },
    lgChecking: { en: 'Checking', hi: '' },
    // Said rather than left as a frozen pad: a cold container is 30-36 seconds
    // and these three roles have nothing to fall back on.
    lgWaking: { en: 'Waking the server. This can take half a minute.', hi: '' },
    lgCantReach: { en: 'No connection to the server, and this phone keeps no PIN for you', hi: '' }
  };

  /* ---------- the small stuff --------------------------------------------- */

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function has(o, k) { return o != null && Object.prototype.hasOwnProperty.call(o, k); }

  /* Resolved at CALL time rather than captured at load, which is the idiom of
   * every v2 module (v2/night.js's db(), v2/router.js's caps()) and what makes
   * index.html's order a dependency order rather than a load-time coupling. It
   * matters more here than anywhere: this file loads BEFORE boot.js, so `Boot`
   * does not exist yet when these lines run. */
  function words() { return typeof root.w === 'function' ? root.w : null; }
  function sync() { return (typeof Sync !== 'undefined' && Sync) || root.Sync || null; }
  function db() { return (typeof DB !== 'undefined' && DB) || root.DB || null; }
  function shell() { return (typeof Shell !== 'undefined' && Shell) || root.Shell || null; }
  function boot() { return root.Boot || null; }
  function doc() { return (typeof document !== 'undefined' && document) || root.document || null; }

  function store() {
    try { return root.localStorage || null; } catch (e) { return null; }
  }

  /* `w()` throws on an unregistered id on purpose. But a screen that cannot
   * draw because one word is missing is worse than one that draws its English,
   * and this is the screen nobody can get past, so say() falls back to the
   * English beside the id — the same decision, for the same reason, as
   * v2/shell.js's say() and v2/screens/duty.js's. */
  function say(id) {
    var t = words();
    if (t) { try { return t(id); } catch (e) { /* fall through to the English */ } }
    var e2 = WORDS[id];
    return e2 ? String(e2.en) : '';
  }

  // A drawing, or nothing when icons.js is not loaded: the words never depend
  // on it.
  function draw(name, size) {
    return typeof root.icon === 'function' ? root.icon(name, { size: size }) : '';
  }

  function fill(s, args) {
    var out = String(s), i;
    for (i = 0; i < args.length; i++) {
      out = out.replace('{' + i + '}', args[i] == null ? '' : String(args[i]));
    }
    return out;
  }

  // say() with {0}/{1} filled in, already escaped. Two steps so a name holding
  // an ampersand cannot reach the page as markup.
  function sayf(id) {
    return esc(fill(say(id), Array.prototype.slice.call(arguments, 1)));
  }

  /* ---------- what this device remembers ---------------------------------- */

  function recentIds() {
    var ls = store();
    if (!ls) return [];
    try {
      var a = JSON.parse(ls.getItem(RECENT_KEY) || '[]');
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }

  function pushRecent(id) {
    var ls = store();
    if (!ls || !id) return;
    var a = recentIds().filter(function (x) { return x !== id; });
    a.unshift(id);
    try { ls.setItem(RECENT_KEY, JSON.stringify(a.slice(0, RECENT_MAX))); } catch (e) { /* full */ }
  }

  function credMap() {
    var ls = store();
    if (!ls) return {};
    try {
      var m = JSON.parse(ls.getItem(CRED_KEY) || '{}');
      return (m && typeof m === 'object') ? m : {};
    } catch (e) { return {}; }
  }

  function writeCreds(m) {
    var ls = store();
    if (!ls) return;
    try { ls.setItem(CRED_KEY, JSON.stringify(m)); } catch (e) { /* full */ }
  }

  // Whether this phone may keep this role's PIN at all. See NO_DEVICE_PIN.
  function mayKeep(role) { return NO_DEVICE_PIN.indexOf(String(role)) < 0; }

  /* This device's copy of a PIN, or null. The only reader is the offline
   * fallback, and only for the two answers that allow one. */
  function devicePin(id) {
    var m = credMap();
    return has(m, id) ? String(m[id]) : null;
  }

  function keepPin(user, p) {
    if (!user || !user.id) return;
    if (!mayKeep(user.role)) { dropPin(user.id); return; }
    var m = credMap();
    m[user.id] = p;
    writeCreds(m);
  }

  function dropPin(id) {
    var m = credMap();
    if (!has(m, id)) return;
    delete m[id];
    writeCreds(m);
  }

  /* ---------- the state this screen holds --------------------------------- */

  /* Four fields and a note. `pin` is here and nowhere else — not in the DOM,
   * not in an attribute, not in a model handed to anything. */
  var step = 'role';              // 'role' | 'who' | 'pin'
  var pickedRole = null;
  var pickedUser = null;
  var pin = '';
  var query = '';                 // the name search, kept here so a redraw cannot lose it
  var note = null;                // {id, args}: the one sentence under the pad
  var working = false;            // a request is away; the dots say so
  var locked = 0;                 // seconds the server told us to wait, 0 when not locked

  /* Back to step one, holding nothing. Called on the way INTO the app as well as
   * on the way out of a step: a signed-in session must not be holding a PIN, a
   * half-typed search or a name somebody else picked. */
  function clear() {
    step = 'role'; pickedRole = null; pickedUser = null;
    pin = ''; query = ''; note = null; working = false; locked = 0;
  }

  /* ---------- the roster, from the local store only ----------------------- */

  // The two stores this screen draws from, and nothing else: the roster, and
  // the garage's own name.
  var STORES = ['users', 'meta'];

  /* The roster is read HERE, once, and only when it is not already in hand.
   *
   * This is the one side effect in this file and it needs its reason. It is not
   * in `mount()`, which is where every screen puts its load, because `mount()`
   * runs at script load — before `boot.js` has created `S` at all, so there is
   * nothing to read into yet. And the roster has to arrive at two different
   * moments: the first paint, where `Boot.enter` happens to be loading
   * FIRST_STORES behind this screen, and after a SIGN-OUT, where it is not and
   * nothing else ever will. One guarded read covers both, which is better than
   * a second list of the login's stores living in boot.js. */
  var reading = false;
  function readRoster() {
    if (reading) return;
    var c = (typeof Cache !== 'undefined' && Cache) || root.Cache || null;
    if (!c || typeof c.load !== 'function') return;
    reading = true;
    c.load(STORES).then(function () { reading = false; paint(); },
                        function () { reading = false; });
  }

  /* ---------- the roster this device does not have yet --------------------
   *
   * The circle, and it is a real one: the roster arrives with a pull, a pull
   * needs a token, a token needs a login, and the login is built from the
   * roster. A phone out of the box therefore drew a correct sentence that was
   * also the end of the road. `Sync.roster()` (v2/sync.js:389) is the one
   * request in this app that carries no token, and breaking that circle is the
   * whole reason it exists; nothing had ever called it.
   *
   * It is asked HERE rather than from boot.js for the reason readRoster gives
   * above: boot would need its own list of the stores this screen draws from,
   * and a second such list is a second one to forget. It goes through the same
   * guarded `Cache.load` path on the way back, so there is still exactly one
   * read of the roster in this file.
   *
   * THREE GUARDS, and none of them is a preference.
   *
   * 1. ONLY WHEN THIS DEVICE HOLDS NOBODY, and only once. A device that has a
   *    roster keeps it current through the pull (`users` is in FIRST_STORES),
   *    so asking again would be an untokened request on every paint of a screen
   *    the frame re-mounts every four seconds — for an answer the device
   *    already has from a source that can be trusted with it.
   *
   * 2. AN EMPTY ROSTER IS A FAILURE WEARING A SUCCESS SUIT. v1's words
   *    (app.js:13480) and v1's rule: a 200 carrying no users is never written
   *    and never allowed to read as "this phone has no accounts". It lands
   *    exactly where a timeout lands, because operationally it is one.
   *
   *    Say plainly what this line is worth today: the write below is ADD-ONLY,
   *    so an empty answer adds nothing whether this guard is here or not, and
   *    the suite's mutant for it can only observe that a bad answer is not then
   *    read against the store and read back out of it. It is kept because this
   *    is where v1's rule is written down, and the thing it really guards is
   *    v1's other half — the one that removes names, which an empty roster
   *    would use to remove all of them. Port that half and this line is the
   *    only thing between a network blip and a phone nobody can sign in on.
   *
   * 3. THE ROW IS THREE NAMED COLUMNS, built one field at a time. The server's
   *    /roster sends id, name and role and its own comment promises no PIN,
   *    hash or salt — but this is the one answer in the app that arrives with
   *    nothing vouching for it, so a copy of whatever came back is a copy of
   *    whatever a future server, or something standing in for one, decided to
   *    add. Written with `updatedAt: 1` and `stamp: false` so the first real
   *    pull outranks it, and `notify: false` so it never enters the outbox and
   *    is never pushed back as though this device had authored it (v1 does both,
   *    app.js:13485; a stamped seed that outranks the server is a record nobody
   *    can correct).
   *
   * What this deliberately does NOT do is v1's other half — tombstoning the
   * names that have VANISHED from the roster (app.js:13494). That half is for a
   * device whose cached tiles have gone stale, which v2 does not have: the
   * ask happens only when there are no tiles, so there is nothing to take away.
   * Porting it would mean an untokened answer could remove a login from a
   * device, which is a larger door than this circle needs opened.
   *
   * And nothing here grants anything. A roster is a list of names; every one of
   * them still goes through `Sync.login` or a device PIN, and a device in this
   * state has no device PIN for anybody, so for everybody on it the login IS
   * one server request. `Caps.screensFor` decides the rest, exactly as before.
   */

  /* The wait, as four values rather than a boolean, because three of them are
   * different things to say:
   *   'idle'    nothing asked (this device has a roster, or there is no Sync)
   *   'asking'  away, and not long enough to doubt the app
   *   'waking'  away long enough that the screen owes an explanation
   *   'done'    an answer came, or we stopped waiting for one
   * 'asking' and 'waking' are note 4's third state: finding out. They draw the
   * skeleton, because that is honestly what they are. */
  var ask = 'idle';
  var asked = false;              // one ask per load of this page, ever
  var wakeTimer = null;
  var giveUpTimer = null;

  function stopWaiting() {
    if (wakeTimer) { clearTimeout(wakeTimer); wakeTimer = null; }
    if (giveUpTimer) { clearTimeout(giveUpTimer); giveUpTimer = null; }
  }

  function askRoster() {
    if (asked) return;
    var s = sync();
    var d = db();
    // Nothing to ask, or nowhere to put the answer. 'done' and not 'idle': the
    // screen has finished finding out, and what it found out is nothing.
    if (!s || typeof s.roster !== 'function' || !d || typeof d.bulkPut !== 'function') {
      asked = true; ask = 'done';
      return;
    }
    asked = true;
    ask = 'asking';

    /* Said out loud after five seconds, with the same sentence the pad uses: a
     * phone in this state has nothing to fall back on and a cold container is
     * 30-36 seconds, so silence here is what "is it broken?" looks like. */
    wakeTimer = setTimeout(function () {
      wakeTimer = null;
      if (ask !== 'asking') return;
      ask = 'waking';
      paint();
    }, SAY_WAKING_MS);

    /* Stop WAITING, which is not the same as stop listening. A minute of
     * "Loading" is the spinner that never ends, so the honest sentence goes up
     * — and the request is still away, so an answer that lands after this still
     * draws the roster rather than being thrown away for being late. */
    giveUpTimer = setTimeout(function () {
      giveUpTimer = null;
      ask = 'done';
      paint();
    }, WAIT_SLOW_MS);

    /* The try is not decoration. `Sync.roster()` catches nothing of its own —
     * it throws on a non-200 and on a dead network alike — and a throw that got
     * out of here would leave the two timers running and the screen on a
     * skeleton it never comes off, which is the one thing this whole section
     * exists to prevent. Same shape, same reason, as attempt()'s. */
    var done = function () { stopWaiting(); ask = 'done'; };
    try {
      s.roster().then(function (users) { done(); keepRoster(users); },
                      function () { done(); paint(); });
    } catch (e) { done(); paint(); }
  }

  /* Write what came back, then read it the one way this file reads anything.
   * Guards 2 and 3 above live here. */
  async function keepRoster(users) {
    // Guard 2. Nothing is written, and the screen says what a timeout says.
    if (!Array.isArray(users) || !users.length) { paint(); return; }
    var d = db();
    try {
      /* The RAW rows, tombstones included. `DB.all` hides a deleted record and
       * a deleted record is KNOWN: an account somebody removed here must stay
       * removed rather than be re-created by the next roster read. */
      var known = {};
      var rows = (d && typeof d._rawAll === 'function') ? (await d._rawAll('users')) : [];
      rows.forEach(function (u) { if (u && u.id != null) known[String(u.id)] = true; });

      // Guard 3.
      var add = [];
      users.forEach(function (u) {
        if (!u || u.id == null || known[String(u.id)]) return;
        add.push({ id: String(u.id),
                   name: u.name == null ? '' : String(u.name),
                   role: u.role == null ? '' : String(u.role),
                   updatedAt: 1 });
      });
      if (add.length) await d.bulkPut('users', add, false, false);
    } catch (e) { /* the store refused it; the sentence below is still honest */ }
    // bulkPut marked the store dirty, so this re-reads it and repaints. A write
    // that added nothing still repaints, off the skeleton and onto the sentence.
    readRoster();
  }

  /* `undefined` until the roster has been read, `[]` when this device holds
   * nobody. The caller must be able to tell those apart — see note 4. */
  function people(m) {
    var u = m && m.cache ? m.cache.users : undefined;
    if (u === undefined) return null;
    return Array.isArray(u) ? u : [];
  }

  function byId(list, id) {
    var i;
    for (i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i];
    return null;
  }

  function inRole(list, role) {
    return list.filter(function (u) { return u && String(u.role) === String(role); })
      .slice()
      .sort(function (a, b) { return String(a.name || a.id).localeCompare(String(b.name || b.id)); });
  }

  function recentPeople(list) {
    return recentIds().map(function (id) { return byId(list, id); })
      .filter(function (u) { return !!u; })
      .slice(0, RECENT_MAX);
  }

  /* ---------- step 1: the role tiles -------------------------------------- */

  function rolePane(m, list) {
    var out = '<div class="lg-mark">' + draw('bus', BIG) + '</div>'
      + '<h1 class="lg-biz">' + esc(bizName(m)) + '</h1>'
      + '<p class="lg-tag">' + esc(say('lgTag')) + '</p>';

    // Still filling. A skeleton rather than a claim: the difference between
    // "nobody is on this phone" and "nobody has been read yet" is the whole of
    // note 4, and on this screen the wrong one of the two reads as a dead app.
    if (list === null) {
      return out + (typeof root.skeleton === 'function' ? root.skeleton(SEARCH_AT) : '');
    }

    /* Nobody on this device — which is three states and not one, and the whole
     * of note 5. While the server is being asked this screen does not know yet,
     * so it draws what not-knowing draws: `skeleton()` already carries
     * `role="status"` and says it is loading. Past five seconds it says what it
     * is waiting for, because by then somebody is wondering. Only once the
     * asking is over does the sentence go up, and the sentence names the reason
     * rather than guessing at it. */
    if (!list.length) {
      if (ask === 'asking' || ask === 'waking') {
        return out
          + (ask === 'waking' ? '<p class="lg-tag" role="status">' + esc(say('lgWaking')) + '</p>' : '')
          + (typeof root.skeleton === 'function' ? root.skeleton(SEARCH_AT) : '');
      }
      return out + (typeof root.emptyState === 'function'
        ? root.emptyState(say('lgNoUsers'), { icon: 'person', hint: say('lgNoUsersHint') })
        : '');
    }

    var recent = recentPeople(list);
    out += '<p class="lg-label">' + esc(say('lgRecent')) + '</p>';
    out += recent.length
      ? '<div class="lg-list">' + recent.map(rowRecent).join('') + '</div>'
      : '<p class="lg-tag">' + esc(say('lgRecentNone')) + '</p>';

    var counts = {};
    list.forEach(function (u) {
      if (!u || !u.role) return;
      counts[u.role] = (counts[u.role] || 0) + 1;
    });
    var held = ROLES.filter(function (r) { return !!counts[r]; });

    out += '<p class="lg-label">' + esc(say('lgWho')) + '</p>'
      + '<div class="lg-list">'
      + held.map(function (r) { return rowRole(r, counts[r]); }).join('')
      + '</div>';
    return out;
  }

  /* A recent face goes straight to the pad: a personal phone should not walk
   * its owner through role then name every morning. The photo is the `users`
   * row's own, when it has one — `.lg-ava` is the class login.css carries for
   * it — and a mark when it does not. */
  function rowRecent(u) {
    var photo = u && u.photo ? String(u.photo) : '';
    var lead = photo
      ? '<img class="lg-ava" src="' + esc(photo) + '" alt="">'
      : draw('person', MARK);
    return '<a class="v2row" href="#" data-act="recent" data-who="' + esc(u.id) + '">'
      + '<span class="lead">' + lead + '</span>'
      + '<span><span class="t">' + esc(firstName(u.name || u.id)) + '</span>'
      + '<span class="sub">' + esc(roleName(u.role)) + '</span></span></a>';
  }

  function rowRole(r, n) {
    return '<a class="v2row" href="#" data-act="role" data-role="' + esc(r) + '">'
      + '<span class="lead">' + draw('person', MARK) + '</span>'
      + '<span><span class="t">' + esc(roleName(r)) + '</span></span>'
      + '<span class="act"><span class="badge">' + esc(String(n)) + '</span></span></a>';
  }

  function roleName(r) {
    var id = ROLE_WORD[String(r)];
    // An unknown role is drawn as the record says rather than hidden: a role
    // this file has not heard of is a record to look at, not a person to lose.
    return id ? say(id) : String(r == null ? '' : r);
  }

  function firstName(name) { return String(name).split(' ')[0]; }

  /* The garage's own name, from `meta`'s `garage` row, which is where v2 keeps
   * it (v2/screens/me.js:563 reads the same row). Falls back to the app's own
   * name, which the frame already registers — one word, one id, rather than a
   * second English copy of it in this file. */
  function bizName(m) {
    var meta = (m && m.cache && m.cache.meta) || null;
    var i;
    if (Array.isArray(meta)) {
      for (i = 0; i < meta.length; i++) {
        if (meta[i] && meta[i].key === 'garage') {
          var n = meta[i].biz || meta[i].name;
          if (n) return String(n);
        }
      }
    }
    var t = words();
    if (t) { try { return t('appTitle'); } catch (e) { /* the frame is not loaded */ } }
    return '';
  }

  /* ---------- step 2: the names ------------------------------------------- */

  function whoPane(m, list) {
    var out = top(roleName(pickedRole))
      + '<div class="lg-mark">' + draw('person', BIG) + '</div>'
      + '<h1 class="lg-biz">' + esc(say('lgPickName')) + '</h1>';

    if (list === null) {
      return out + (typeof root.skeleton === 'function' ? root.skeleton(SEARCH_AT) : '');
    }

    var all = inRole(list, pickedRole);

    /* The search box past six, and the filtering is done HERE rather than in the
     * DOM between redraws. `boot.js` re-mounts on every sync status change, so a
     * filter that lived only in the markup would be undone every few seconds
     * while somebody was still reading the list. */
    if (all.length > SEARCH_AT) {
      out += '<input type="text" class="field lg-search" data-lg-find'
        + ' value="' + esc(query) + '"'
        + ' placeholder="' + esc(say('lgSearchName')) + '"'
        + ' aria-label="' + esc(say('lgSearchName')) + '" autocomplete="off">';
    }

    var q = String(query).toLowerCase().trim();
    var shown = q
      ? all.filter(function (u) { return String(u.name || u.id).toLowerCase().indexOf(q) >= 0; })
      : all;

    /* Two accounts can carry the same name — a person added twice, which used to
     * be easy to do. Identical rows are unpickable, so when a name is shared the
     * account id goes underneath: it is the only thing that differs. */
    var seen = {};
    all.forEach(function (u) {
      var k = String(u.name || '').toLowerCase().trim();
      seen[k] = (seen[k] || 0) + 1;
    });

    out += shown.length
      ? '<div class="lg-list">' + shown.map(function (u) { return rowWho(u, seen); }).join('') + '</div>'
      : (typeof root.emptyState === 'function'
         ? root.emptyState(say('lgNoMatch'), { icon: 'search' }) : '');
    return out;
  }

  function rowWho(u, seen) {
    var k = String(u.name || '').toLowerCase().trim();
    var sub = seen[k] > 1 ? '<span class="sub">' + esc(u.id) + '</span>' : '';
    return '<a class="v2row" href="#" data-act="who" data-who="' + esc(u.id) + '">'
      + '<span class="lead">' + draw('person', MARK) + '</span>'
      + '<span><span class="t">' + esc(u.name || u.id) + '</span>' + sub + '</span></a>';
  }

  /* The back control and the crumb. `.lg-top-back` spreads them; `.lg-crumb`
   * says which step this is, so a person who looked away knows where they got
   * to. A back arrow on step one would point at nothing, so step one has none. */
  function top(crumb) {
    return '<div class="lg-top lg-top-back">'
      + '<button type="button" class="btn btn-quiet lg-back" data-act="back"'
      + ' aria-label="' + esc(say('lgBack')) + '">' + draw('back', MARK) + '</button>'
      + '<span class="lg-crumb">' + esc(crumb) + '</span></div>';
  }

  /* ---------- step 3: the pad --------------------------------------------- */

  function pinPane() {
    var u = pickedUser;
    var out = top(roleName(u.role))
      + '<h1 class="lg-biz lg-who">' + esc(u.name || u.id) + '</h1>'
      + '<p class="lg-tag">' + esc(say('lgEnterPin')) + '</p>'
      + dots()
      + pad()
      + '<button type="button" class="btn btn-quiet lg-cancel" data-act="cancel">'
      + esc(say('lgCancel')) + '</button>';
    // The one sentence this screen says back. It sits under the pad rather than
    // in a toast: a refusal that fades is a refusal somebody missed.
    if (note) out += '<p class="lg-tag" role="status">' + esc(noteText()) + '</p>';
    return out;
  }

  function noteText() {
    if (!note) return '';
    return note.args ? fill(say(note.id), note.args) : say(note.id);
  }

  /* Four dots, as ELEMENTS. They were the characters U+25CF and U+25CB, which
   * is a font dependency on the one screen nobody can get past — Windows 7 never
   * shipped them and the office was signing in through a row of empty boxes.
   *
   * The dots are a COUNT and never the digits, and the accessible name says the
   * count too. `data-working` is login.css's own hook for "the request is away":
   * four digits are in and without a sign of it the pad sits there for a second
   * or three and looks like it missed the tap. */
  function dots() {
    var out = '', i;
    for (i = 0; i < DIGITS; i++) {
      out += '<span class="lg-dot' + (i < pin.length ? ' on' : '') + '"></span>';
    }
    return '<div class="lg-dots"' + (working ? ' data-working="1"' : '') + ' role="status"'
      + ' aria-label="' + sayf('lgDigits', pin.length, DIGITS) + '">' + out + '</div>';
  }

  /* The keypad. `data-k` carries the key's own fixed label — the key you are
   * looking at, never the key you pressed — and the digits are the one place
   * text is bigger than the system's body scale, because they are the target as
   * well as the label and they are tapped with a thumb in daylight.
   *
   * No digit is a focusable tab stop ahead of the next, no key is disabled while
   * a request is away: `locked` stops the handler instead, so the pad does not
   * change shape under somebody's thumb. */
  function pad() {
    var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
    var out = keys.map(function (n) {
      return '<button type="button" class="btn" data-act="key" data-k="' + n + '">' + n + '</button>';
    }).join('');
    out += '<button type="button" class="btn btn-quiet" data-act="key" data-k="back"'
      + ' aria-label="' + esc(say('lgPadBack')) + '">' + draw('back', 22) + '</button>';
    out += '<button type="button" class="btn" data-act="key" data-k="0">0</button>';
    out += '<button type="button" class="btn btn-primary" data-act="key" data-k="ok"'
      + ' aria-label="' + esc(say('lgEnterPin')) + '">' + draw('ok', 22) + '</button>';
    /* `.lg-pad` and nothing else. `.pinpad` is v1's class and login.css names it
     * only to explain why this keypad does NOT reuse it: the live stylesheet
     * sets padding, font-size, border and radius on `.pinpad button`
     * UNLAYERED, which beats any layered rule regardless of specificity, so the
     * pad has its own names rather than a fight it would lose. (The brief lists
     * `.pinpad` and `.userpick` among the classes login.css carries; both occur
     * in that file in comments only — see the report.) */
    return '<div class="lg-pad">' + out + '</div>';
  }

  /* ---------- render ------------------------------------------------------ */

  /* One string, and the shell puts it into `#app` with one insertAdjacentHTML.
   * Everything above is a pure function of this file's own state plus the
   * model's `cache`, which is what makes the whole screen checkable in node —
   * and the reason the DOM wiring is all in mount(). */
  function render(m) {
    var inner;
    /* Not in hand yet: ask the store for it, draw the skeleton this time round,
     * and the read's own repaint draws the list. See readRoster for why it is
     * here.
     *
     * And if the store had nobody in it, ask the SERVER, in the same pass and
     * before the pane is built rather than after. askRoster() moves the wait
     * state synchronously when it decides to go, so the pane below never sees
     * the one frame in which this device holds nobody and nothing has been
     * asked yet — which would flash the sentence for a tick and then replace it
     * with a skeleton, telling somebody the app is empty just before admitting
     * it does not know. */
    if (people(m) === null) readRoster();
    else if (!people(m).length) askRoster();
    if (step === 'pin' && pickedUser) inner = pinPane();
    else if (step === 'who' && pickedRole) inner = whoPane(m, people(m));
    else inner = rolePane(m, people(m));
    return '<section data-screen="' + ID + '">' + inner + '</section>';
  }

  /* Draw again. The login registers nothing with Router — it is not a route —
   * so it asks the frame for its own re-mount rather than going through the
   * router's change notification, which has no entry for a screen that is not
   * in the capability table. */
  function paint() {
    var sh = shell();
    if (sh && typeof sh.mount === 'function') sh.mount(ID);
  }

  /* ---------- the steps -------------------------------------------------- */

  function toRole() { clear(); paint(); }

  function toWho(role) {
    clear();
    step = 'who'; pickedRole = String(role);
    paint();
  }

  /* Opening the pad is where the server is woken.
   *
   * `warmUp()` throttles itself to one ping every thirty seconds, so firing it
   * on the way in to this screen AND here costs nothing and buys the few
   * seconds somebody spends picking a role and a name — which against a 30-36 s
   * cold start is the difference between a login and "can't reach the server".
   * Deliberately fire and forget: nothing waits on it. */
  function toPin(user) {
    clear();
    step = 'pin'; pickedUser = user;
    warm();
    paint();
  }

  function warm() {
    var s = sync();
    if (!s || typeof s.warmUp !== 'function') return;
    try { s.warmUp(); } catch (e) { /* offline; the device PIN still works */ }
  }

  /* ---------- the PIN ----------------------------------------------------- */

  function digit(d) {
    // Locked out by the server, or a request already away: the pad stops taking
    // digits rather than queueing them behind an answer that has not come.
    if (locked || working) return;
    if (pin.length >= DIGITS) return;
    pin += d;
    note = null;
    if (pin.length === DIGITS) { attempt(); return; }
    paint();
  }

  function rub() {
    if (locked || working) return;
    pin = pin.slice(0, -1);
    note = null;
    paint();
  }

  /* ---------- the one authentication call -------------------------------- */

  /* `Sync.login(userId, pin, opts)` is the only thing this screen calls, and
   * every one of its answers below has its own visible state. The order of the
   * branches IS the contract — in particular `known` is read BEFORE any device
   * PIN is looked at, because a wrong PIN the server is sure about stays wrong
   * offline, and reading them the other way round is how a rotated credential
   * keeps working on every phone that ever used the old one. */
  async function attempt() {
    var user = pickedUser;
    if (!user) return;
    var s = sync();
    var attempted = pin;

    /* Whether there is anything behind this request. The owner, the supervisor
     * and the crew manager have nothing, so for them this request IS the login
     * and it is given the long wait. */
    var cached = mayKeep(user.role) ? devicePin(user.id) : null;
    var canOffline = !!cached;

    working = true;
    note = { id: 'lgChecking' };
    paint();

    var slow = setTimeout(function () {
      if (!working) return;
      note = { id: 'lgWaking' };
      paint();
    }, SAY_WAKING_MS);

    var r = null;
    try {
      if (s && typeof s.login === 'function') {
        r = await s.login(user.id, attempted, { timeoutMs: canOffline ? WAIT_FAST_MS : WAIT_SLOW_MS });
        // One retry, and only for the roles that cannot fall back. `offline`
        // after a wait that long is a container that was still booting.
        if (r && r.offline && !canOffline) {
          r = await s.login(user.id, attempted, { timeoutMs: WAIT_RETRY_MS });
        }
      }
    } catch (e) {
      // `Sync.login` catches its own network failures, but a throw from
      // anywhere else must not leave a dead keypad with no explanation.
      r = { offline: true };
    }
    clearTimeout(slow);

    // Verified online. The token is already persisted by sync.js.
    if (r && r.user) { enter(user, r.user, attempted); return; }

    // The server holds the account and is rate-limiting it. Say the wait and
    // stop accepting digits, rather than letting somebody type into a pad that
    // cannot answer.
    if (r && r.locked) {
      working = false; pin = '';
      locked = Number(r.retryAfter) || 0;
      note = { id: 'lgTooMany', args: [locked] };
      paint();
      return;
    }

    /* FINAL, and the device PIN is NOT tried. `known` means the server really
     * holds this account, so its answer stands offline too — and the copy on
     * this phone is therefore stale, because somebody rotated the PIN. It goes:
     * without this a cached PIN silently outranks the server. */
    if (r && r.rejected && r.known) {
      dropPin(user.id);
      working = false; pin = '';
      note = { id: REASON_WORD[String(r.reason)] || 'lgWrongPin' };
      paint();
      return;
    }

    /* The two answers that allow the device PIN, and only these two: the server
     * does not hold this account (bulk-seeded crew, who live only on the phone),
     * or it could not be reached at all. */
    if (canOffline && cached === attempted) {
      /* A session left on this phone by somebody else must not sign this
       * person's changes: drop it rather than send their work out under another
       * name and role. */
      if (s && s.tokenUser && s.tokenUser() && s.tokenUser() !== user.id && s.logout) s.logout();
      enter(user, null, attempted);
      return;
    }

    working = false; pin = '';
    note = { id: (r && r.offline) ? 'lgCantReach' : 'lgWrongPin' };
    paint();
  }

  /* ---------- the hand-off ----------------------------------------------- */

  /* The PIN was right. Everything this file holds is dropped FIRST — a signed-in
   * session must not be holding a PIN, a search or somebody's name — and then
   * `Boot.enter` runs the post-session half of the boot sequence.
   *
   * `verified` is the server's own copy of the user when there was one. It is
   * preferred over the local row because the server is the authority on a role,
   * and a role read from a stale local record is a role the nav would be built
   * from. Only a server-verified PIN is kept on the device: a PIN accepted
   * offline is one this phone already had. */
  function enter(user, verified, attempted) {
    var who = verified || user;
    if (verified) keepPin(who, attempted);
    clear();
    pushRecent(who.id);
    var s = sync();
    if (s && typeof s.setActor === 'function') s.setActor(who.id);
    var b = boot();
    if (b && typeof b.enter === 'function') b.enter(who);
    else paint();                  // no boot seam: stay put rather than half-enter
  }

  /* ---------- mount ------------------------------------------------------- */

  var bound = false;

  /* ONE delegated click listener on the document, installed once, in the shape
   * every screen uses. The guard is what keeps a re-mount from stacking a
   * second copy of it (INTEGRATION-NOTES 17). */
  function mount() {
    var d = doc();
    if (!d || typeof d.addEventListener !== 'function') return false;
    if (bound) return true;
    bound = true;
    d.addEventListener('click', onClick);
    /* Two more, and neither can move the route — see onField and onKey. `input`
     * and `change` are one handler for the name search; `keydown` is the office
     * PC, which has a keyboard and should not have to mouse four small buttons.
     * v1 learnt the same thing at app.js:13615. */
    d.addEventListener('input', onField);
    d.addEventListener('change', onField);
    d.addEventListener('keydown', onKey);
    return true;
  }

  function onClick(ev) {
    var t = ev && ev.target;
    if (!t || typeof t.closest !== 'function') return;

    /* FIRST, and before anything reads `[data-act]`. This screen holds a search
     * input inside the same surface as the rows, and a field inside a pressable
     * row is the regression that threw the storekeeper off the screen mid-count.
     * The order of these two lines IS the fix. */
    if (t.closest(FIELDS)) return;

    if (!t.closest('[data-screen="' + ID + '"]')) return;

    var el = t.closest('[data-act]');
    if (!el) return;
    // The rows are anchors, so that a keyboard reaches them; the href is never
    // followed.
    if (ev.preventDefault) ev.preventDefault();

    var act = el.getAttribute('data-act');
    var m = model();

    if (act === 'role') {
      toWho(el.getAttribute('data-role'));
    } else if (act === 'who' || act === 'recent') {
      var u = byId(people(m) || [], el.getAttribute('data-who'));
      if (u) toPin(u);
    } else if (act === 'back' || act === 'cancel') {
      // One step at a time, and from the pad that is back to the names of the
      // role this person came through — or to step one when they arrived on a
      // recent face and never saw a role list.
      if (step === 'pin' && pickedRole) toWho(pickedRole);
      else if (step === 'pin' && pickedUser) toWho(pickedUser.role);
      else toRole();
    } else if (act === 'key') {
      key(el.getAttribute('data-k'));
    }
  }

  function key(k) {
    if (k === 'back') { rub(); return; }
    if (k === 'ok') { if (pin.length === DIGITS && !working && !locked) attempt(); return; }
    if (k >= '0' && k <= '9' && String(k).length === 1) digit(k);
  }

  /* THE SECOND HANDLER, and why there is one. The one-delegated-click-listener
   * rule exists so that a tap on a field cannot move the route. This one is
   * bound to `input` and `change`, never reads `[data-act]`, and so cannot move
   * anywhere at all: it is the other side of that rule rather than an exception
   * to it. Its whole job is the name search, which has to survive a redraw —
   * hence the query in module state and a repaint rather than DOM filtering. */
  function onField(ev) {
    var t = ev && ev.target;
    if (!t || typeof t.getAttribute !== 'function') return;
    if (t.getAttribute('data-lg-find') === null) return;
    var v = String(t.value == null ? '' : t.value);
    if (v === query) return;
    query = v;
    paint();
    refocus();
  }

  /* The caret goes back where it was. The frame redraws this screen's markup in
   * one string, so the input the person is typing into is a NEW element: without
   * this, the second character of a name goes nowhere. */
  function refocus() {
    var d = doc();
    var el = d && d.querySelector ? d.querySelector('[data-lg-find]') : null;
    if (!el || typeof el.focus !== 'function') return;
    try {
      el.focus();
      if (typeof el.setSelectionRange === 'function') {
        el.setSelectionRange(query.length, query.length);
      }
    } catch (e) { /* no layout engine */ }
  }

  /* THE THIRD HANDLER. A desktop has a keyboard, and the office PCs are
   * desktops: making somebody mouse-click four small buttons is the phone
   * interaction pretending to work everywhere.
   *
   * It reads no `[data-act]` and no `[data-nav]`, so it cannot move the route
   * either, and it does nothing at all unless the pad is the step on screen —
   * which is also what keeps it out of the way of the thirteen screens' own
   * listeners once somebody is signed in. */
  function onKey(ev) {
    if (!ev || step !== 'pin' || !pickedUser) return;
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    var d = doc();
    // Never while a field has the caret: a digit typed into the name search is
    // a digit in a name, not a digit in a PIN.
    var a = d && d.activeElement;
    if (a && typeof a.closest === 'function' && a.closest(FIELDS)) return;
    var k = String(ev.key == null ? '' : ev.key);
    if (k >= '0' && k <= '9' && k.length === 1) {
      if (ev.preventDefault) ev.preventDefault();
      digit(k);
      return;
    }
    if (k === 'Backspace') {
      if (ev.preventDefault) ev.preventDefault();
      rub();
      return;
    }
    if (k === 'Enter') {
      if (ev.preventDefault) ev.preventDefault();
      if (pin.length === DIGITS && !working && !locked) attempt();
      return;
    }
    if (k === 'Escape') {
      if (ev.preventDefault) ev.preventDefault();
      if (pickedRole) toWho(pickedRole);
      else if (pickedUser) toWho(pickedUser.role);
      else toRole();
    }
  }

  /* The model, when the handlers need one and the frame is not handing it over.
   * `S` is boot.js's, resolved at call time like everything else here. */
  function model() {
    var s = (typeof S !== 'undefined' && S) || root.S || {};
    return { cache: s.cache || {}, user: s.user || null };
  }

  /* ---------- registration ------------------------------------------------ */

  if (root.W && typeof root.W.register === 'function') root.W.register(WORDS);

  var api = {
    render: render,
    mount: mount,
    // Test seams only, the shape of Router._reset: a node suite cannot reload a
    // classic script per case, and the step a screen is on is otherwise only
    // reachable through a click.
    // Back to the state this file is in at load, which `clear()` is not: the
    // roster ask belongs to the DEVICE and not to the step somebody is on, so
    // walking back a step must not re-ask the server. Only the seam resets it.
    _reset: function () {
      bound = false; clear();
      stopWaiting(); ask = 'idle'; asked = false; reading = false;
    },
    _step: function () { return { step: step, role: pickedRole,
                                  who: pickedUser ? pickedUser.id : null,
                                  digits: pin.length, working: working, locked: locked,
                                  note: note ? note.id : null, query: query,
                                  ask: ask, asked: asked }; },
    _goto: function (s, role, user) { clear(); step = s; pickedRole = role || null; pickedUser = user || null; },
    _key: key,
    _onKey: onKey
  };

  /* Registered with NOTHING. No `Router.register`, because the login is not a
   * route and the router's registry is the capability-guarded set; no entry in
   * `caps.js`, because this screen is reached holding no capability at all. The
   * frame finds it by name — `v2/shell.js`'s `login()` — which is the whole of
   * the seam.
   *
   * The listener goes on at load, like every screen, and this file draws nothing
   * until `Shell.mount('login')` asks. The `else` branch is the browser's and is
   * exercised by no node suite, which is how six screens came to call mount() at
   * script-load time against a document that was not there: `mount()` returns
   * false when there is no document rather than throwing. */
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.Login = api;
    mount();
  }
})(typeof window !== 'undefined' ? window : this);

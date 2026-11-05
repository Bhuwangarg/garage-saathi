/* Garage Saathi words: the one lookup every fixed word in v2 is read through, and the Hindi for the chrome.
 * Plain script, ES5, one global pair (W and w), no dependencies. Test: test_v2_words.js.
 *
 * WHY THIS EXISTS. v2-foundation-ui.md §6.3: Trip cash was English-only in Hindi mode, on a screen for the
 * largest role, and nothing failed and nobody was told. The cause is written down in v1's dictionary itself
 * (i18n-hi.js line 8): "Until it arrives t() falls back to English, which is exactly what it already did for
 * any key Hindi was missing." A missing translation is indistinguishable from a present one until a Hindi
 * reader opens the screen. The estimate that defect was ranked on has been withdrawn (DECISIONS.md §7: drivers
 * do not use their logins, so nobody was reading Trip cash), and the MECHANISM has not: it now points at Me,
 * which for a driver and a conductor is their whole app. A silent English fallback there is not one screen in
 * the wrong language, it is the entire application in the wrong language for the only people with no second
 * screen to fall back to.
 *
 * So the fallback is not silent here. Three states, and they are three different things:
 *     translated    an `hi` value exists      the Hindi is drawn
 *     pending       the `hi` key is ''        the English is drawn WITH ITS ID, "Me [meTitle]", in Hindi mode
 *     unregistered  no id at all              w() throws, loudly, at the first call
 * The marked English is the whole point. English on its own reads as a design decision; English with
 * "[meTitle]" after it reads as what it is, and a Hindi reader can report it. There is no dev/prod split in
 * v2 - these are plain scripts with no build step - so the mark is always on. A mark only a developer can see
 * is a mark nobody acts on, which is the defect again with one more step in front of it.
 *
 * WHERE THE WORDS LIVE, and why it is not all in this file.
 *   - The HINDI is here, for the 21 chrome ids, and in each screen module for its own labels. One file for
 *     the owner to fill in per screen, and this one for everything the chrome draws on all thirteen.
 *   - The ENGLISH is at the point of use, inside the `W.register({...})` literal in the file that draws it
 *     (v2/ui/states.js, v2/ui/overlay.js, and each screen module). This is a deviation from the brief, which
 *     asked for both halves here, and it is forced rather than chosen: test_ui_states.js and
 *     test_ui_overlay.js both pin their file to be PURE ASCII (comments included, because Windows 7 has no
 *     font for most of what is not), so Devanagari cannot live in those two files, and their English cannot
 *     leave them without those two suites losing every word they assert. An id's two halves are merged by
 *     `register`, and test_v2_words.js fails on an id that has an English half and no Hindi KEY anywhere, so
 *     splitting them cannot hide a missing translation - which is the only property that matters.
 *   - Nothing reads i18n-hi.js from here. v1's dictionary is the owner's existing Hindi and the values below
 *     were taken from it where a key already said the same thing (`cancel` is his word, line 17); copying the
 *     value is deliberate, because importing the file would make v2's chrome depend on a 84 KB v1 download.
 *
 * PENDING: THE NUMBER THIS MUST REACH IS ZERO, AND IT IS THE OWNER'S LIST.
 * test_v2_words.js prints the pending count on EVERY run, passing or failing, by name. Expect the total
 * registered to land near 130 ids: these 21 plus the ~110 screen labels in screens-shell.md §2.6, §3.9, §4.6
 * and the other screen documents, where the Hindi column reads "needed" roughly 110 times.
 *   - A CHROME id with an empty `hi` is a build failure, not a pending one. The chrome is drawn on all
 *     thirteen screens and has nowhere to hide, so there is no sitting to wait for: all 21 are filled below.
 *   - A SCREEN label with an empty `hi` is pending, counted and printed and marked on screen.
 *   - The person who supplies the Hindi is THE OWNER. He is the only Hindi speaker on this project. Nine of
 *     the screen ids can take a value that already exists in i18n-hi.js; the rest are one sitting with him,
 *     and until that sitting happens the count does not move. A builder guessing Hindi for a word a driver
 *     has to act on is how "Not sent yet" becomes a sentence nobody can parse.
 *   - The Hindi below is taken from i18n-hi.js where a key already said it (`cancel`), and written here in
 *     the same plain register where it did not. Those are marked NEW and the owner should read them once; they
 *     are chrome words - "Loading", "Close", "Retry" - not the sentences a person acts on.
 *
 *   w(id, n) -> string      n selects between an id's `one` and `other` forms and replaces {n} in the form
 *                           it picks. English pluralises ("1 minute ago" / "3 minutes ago"); Hindi takes one
 *                           form for both, which is why the selector belongs here and not in the caller.
 *   W.register(table)       {id: {en, hi}}, or {en: {one, other}, hi: {...}}. Merged by id, so the two halves
 *                           of an id may arrive from two files. Registering an id twice with the same half is
 *                           a conflict and throws: one word, one place.
 *   W.lang() -> 'en' | 'hi' From the document's own lang attribute - the same source that drives --font-hi
 *                           and --lh: 1.7 through :lang(hi) in tokens.css. One source, not two: a language
 *                           kept in a second place is a language that can disagree with the font it is in.
 *   W.ids() -> [id]         every registered id, sorted
 *   W.pending() -> [id]     registered ids whose `hi` is empty, sorted
 *   W.chrome -> [id]        the 21 ids §6.3 names, in order. Data, so a check can read it.
 *   W.entry(id) -> {en, hi} the merged halves, or null. For the checks; screens call w().
 */
(function (window) {
  'use strict';

  var COUNT = /\{n\}/g;                // where the count goes inside a form

  var table = {};                      // {id: {en: string|{one,other}, hi: same}}

  /* The 21 ids v2-foundation-ui.md §6.3 names, which is every fixed word the chrome draws. Listed here
   * rather than derived from the table because a list derived from what was registered cannot tell you that
   * the 22nd word was hard-coded instead of registered - and that is the failure being prevented. */
  var CHROME = ['nothingToShow', 'somethingWrong', 'retry', 'reloadToRetry', 'offline', 'offlineHint',
    'loading', 'noData', 'updatedAgo', 'justNow', 'minutesAgo', 'hoursAgo', 'daysAgo', 'mayBeOld',
    'timeUnknown', 'close', 'confirm', 'cancel', 'toastOk', 'toastWarn', 'toastBad'];

  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  /* The one or other form of a value, with {n} filled in. A plain string has one form and ignores n. */
  function form(v, n) {
    if (v === null || v === undefined) return null;
    var s;
    if (typeof v === 'string') s = v;
    else if (n === 1) s = v.one === undefined || v.one === null ? v.other : v.one;
    else s = v.other === undefined || v.other === null ? v.one : v.other;
    if (s === null || s === undefined) return null;
    return String(s).replace(COUNT, n === null || n === undefined ? '' : String(n));
  }

  function lang() {
    var d = window.document;
    var el = d && d.documentElement;
    var v = el && el.lang ? String(el.lang) : '';
    if (!v && d && d.body && d.body.lang) v = String(d.body.lang);
    return v.toLowerCase().indexOf('hi') === 0 ? 'hi' : 'en';
  }

  /* An id whose Hindi is missing renders its English WITH THE ID, in Hindi mode only. See the header: this is
   * the difference between a translation nobody knows is missing and one a reader can report. */
  function w(id, n) {
    var e = table[id];
    if (!e) throw new Error('w(): no word is registered under the id ' + id);
    var en = form(e.en, n);
    if (en === null) throw new Error('w(): the id ' + id + ' has no English value');
    if (lang() !== 'hi') return en;
    var hi = form(e.hi, n);
    return hi === null || hi === '' ? en + ' [' + id + ']' : hi;
  }

  /* Merge, so an id's English may come from the file that draws it and its Hindi from here or from a screen's
   * own table. The same half twice is a clash of two sources for one word, which is the thing being removed,
   * so it throws rather than letting the later loader win silently. */
  function register(t) {
    if (!t || typeof t !== 'object') throw new Error('W.register(): a table of {id: {en, hi}} is needed');
    var id, half, i;
    var halves = ['en', 'hi'];
    for (id in t) {
      if (!has(t, id)) continue;
      if (!t[id] || typeof t[id] !== 'object') throw new Error('W.register(): ' + id + ' is not {en, hi}');
      if (!table[id]) table[id] = {};
      for (i = 0; i < halves.length; i++) {
        half = halves[i];
        if (!has(t[id], half)) continue;
        if (has(table[id], half)) throw new Error('W.register(): ' + id + '.' + half + ' is already registered');
        table[id][half] = t[id][half];
      }
    }
  }

  function ids() {
    var out = [], id;
    for (id in table) if (has(table, id)) out.push(id);
    return out.sort();
  }

  function pending() {
    var all = ids(), out = [], i, hi;
    for (i = 0; i < all.length; i++) {
      hi = table[all[i]].hi;
      if (hi === undefined || hi === null || hi === '') { out.push(all[i]); continue; }
      if (typeof hi === 'object' && (hi.one === '' || hi.other === '')) out.push(all[i]);
    }
    return out;
  }

  function entry(id) { return has(table, id) ? table[id] : null; }

  /* ----------------------------------------------------------------------------------------------------
   * The Hindi for the 21 chrome ids. The English halves are registered by the files that draw them,
   * v2/ui/states.js and v2/ui/overlay.js - see WHERE THE WORDS LIVE above for why they cannot be here.
   *
   * FROM i18n-hi.js   the owner's own word, copied from v1: `cancel` (line 17).
   * NEW               written here, for his read: everything else below. All chrome, none of them a
   *                   sentence a person acts on.
   * -------------------------------------------------------------------------------------------------- */
  window.W = { register: register, lang: lang, ids: ids, pending: pending, chrome: CHROME, entry: entry };
  window.w = w;

  /* Registered through window.W rather than the local name so that the check which scans every .js file under v2/ for
   * `W.register` literals finds this table the same way it finds every other one. A table only the file it
   * lives in can see is a table the parity check cannot read. */
  window.W.register({
    nothingToShow: { hi: 'दिखाने के लिए कुछ नहीं' },                       // NEW
    somethingWrong: { hi: 'कुछ गड़बड़ हो गई' },                            // NEW. No "Oops", no blame (§6.1)
    retry: { hi: 'दोबारा कोशिश' },                                        // NEW
    reloadToRetry: { hi: 'दोबारा कोशिश के लिए पेज रीलोड करें' },              // NEW
    offline: { hi: 'ऑफ़लाइन' },                                            // NEW
    offlineHint: { hi: 'कनेक्शन नहीं है। जो दिख रहा है वह पुराना हो सकता है।' },   // NEW
    loading: { hi: 'लोड हो रहा है' },                                      // NEW
    noData: { hi: 'डेटा नहीं' },                                           // NEW. Not "0" and not blank (§6.1)
    /* {0} is where the age phrase goes, and it is at the FRONT in Hindi: "3 मिनट पहले अपडेट हुआ". That is the
     * reason this id is a whole form and not a prefix glued onto the age by the caller - a prefix would force
     * English word order on Hindi, which reads as broken rather than as translated. */
    updatedAgo: { hi: '{0} अपडेट हुआ' },                                   // NEW
    justNow: { hi: 'अभी अभी' },                                           // NEW
    // One form for both counts, which is correct Hindi and is what the plural selector exists to allow.
    minutesAgo: { hi: { one: '{n} मिनट पहले', other: '{n} मिनट पहले' } },    // NEW
    hoursAgo: { hi: { one: '{n} घंटे पहले', other: '{n} घंटे पहले' } },        // NEW
    daysAgo: { hi: { one: '{n} दिन पहले', other: '{n} दिन पहले' } },         // NEW
    mayBeOld: { hi: 'पुराना हो सकता है' },                                  // NEW
    timeUnknown: { hi: 'कब अपडेट हुआ, पता नहीं' },                          // NEW
    close: { hi: 'बंद करें' },                                             // NEW
    confirm: { hi: 'पक्का करें' },                                          // NEW
    cancel: { hi: 'रद्द' },                                               // FROM i18n-hi.js line 17
    toastOk: { hi: 'हो गया' },                                            // NEW
    toastWarn: { hi: 'चेतावनी' },                                          // NEW
    toastBad: { hi: 'गड़बड़' }                                             // NEW
  });

})(window);

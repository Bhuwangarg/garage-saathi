/* Garage Saathi v2 photos: a grid of thumbnails, a capture control, and the full size inside a sheet.
 * Plain script, ES5, no module system, no dependencies. Needs ui/tokens.css and ui/components.css; uses
 * icon() from ui/icons.js and V2.openSheet from ui/overlay.js when they are loaded, and still shows every
 * word when icons.js is not. Test: test_v2_ui.js.
 *
 *   photoGrid(list, opts) -> string   list: [{url, caption, pending, failed, local}]
 *                                     opts {max, capture, label, name}
 *   photoCapture(label, name) -> string            the capture control on its own
 *   V2.openPhoto(src, caption) -> <dialog>|null    full size, INSIDE V2.openSheet
 *
 * The first two return a markup STRING, like ui/states.js: a screen builds its whole body as one string
 * and sets it with one insertAdjacentHTML. Everything passed in is escaped.
 *
 * THE UPLOAD URL IS THE WHOLE REASON THIS FILE IS CAREFUL. GET /uploads/<name> authenticates NOTHING
 * (LIVE-ISSUES 7, and 7b for what was and was not done about it). The 128-bit name is the only thing
 * standing between an unauthenticated request and a crew member's licence; there is no revocation, and
 * every rule about who may see a crew member's documents is bypassed by holding the link. The fix is a
 * client change across 32 image sites and it is the owner's call, so what this interface owes is to stop
 * ADDING ways the URL travels:
 *
 *   1. NEVER A LINK AND NEVER A SHARE AFFORDANCE. An upload URL appears only as the `src` of an <img>
 *      inside this component -- a tile, or the viewer. No <a href>, no "Open in new tab", no "Copy link",
 *      no "Share", no "Download", no target="_blank". A thumbnail is a BUTTON. That is why .photo is a
 *      button in the markup contract rather than as a matter of style.
 *   2. referrerpolicy="no-referrer" ON EVERY <img>. It closes the one leak on the issue's list that the
 *      interface owns, costs nothing, and is inside the floor (Chrome 70+).
 *   3. WORDS BEFORE PICTURES. A tile's words come before its picture, in the markup and on the screen;
 *      and a tile with NO `url` draws its words and a mark and makes no request at all. That is how Me's
 *      "Your documents" lists a licence by type and expiry and loads nothing until an explicit tap: a
 *      photograph nobody asked to see is an unauthenticated request nobody asked for, and it puts the URL
 *      in the cache and history of whatever device is in that person's hand.
 *
 * None of that is a fix and this file does not pretend otherwise.
 *
 * THE CAPTURE CONTROL IS A LABEL WRAPPING A FILE INPUT, because that is the only way to reach a camera on
 * Chrome 109 without script. The input is .sr-only -- clipped, still in the accessibility tree, NEVER
 * display: none, which would take it out of the tree and off the keyboard -- and the LABEL carries the
 * focus ring through :focus-within.
 *
 * THE STATES ARE WORDS. "Sending" (in the outbox), "Not sent" (the upload failed; the tile STAYS TAPPABLE
 * and the photo is not lost, it is in the record) and "On this phone only" (the named 20 MB case: a photo
 * that could not be uploaded travels inside the record as a data URL). Never colour alone, never a
 * spinner: an uploading tile says the word.
 *
 * THE VIEWER IS A SHEET, not a screen and not a new overlay kind. overlay.js has 100 checks behind its
 * focus, scroll lock and dismissal behaviour and a second modal mechanism would have none of them. One
 * delegated click listener on the document opens it, in the shape of states.js's Retry: a markup string
 * cannot carry a function, and one listener on the document is cheaper than one per tile on a 12-tile
 * grid. A tile with no `url` is left alone by it, so the screen's own handler can decide what an explicit
 * tap on an unloaded document means.
 *
 * LOAD ORDER. This file adds openPhoto to the existing V2 object, so it must load AFTER ui/overlay.js
 * (which assigns window.V2 wholesale). v2/index.html's order is icons -> words -> states -> overlay ->
 * photos -> nav. */
(function (window) {
  'use strict';

  var MARK_SIZE = 16;                  // beside a word in a --thumb tile
  var ADD_MARK_SIZE = 20;

  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // A mark, or nothing when icons.js is not loaded: the words never depend on it.
  function draw(name, size) {
    return typeof window.icon === 'function' ? window.icon(name, { size: size }) : '';
  }

  /* Every fixed word in this file lives in this one table, so the Hindi parity check can see it and a
   * Hindi reader is never shown an English literal from here. The local copy is the fallback for a page
   * that loads the primitives without ui/words.js (the gallery does). */
  var local = {};
  var W = {
    register: function (table) {
      var k;
      for (k in table) if (has(table, k)) local[k] = table[k];
      if (window.W && typeof window.W.register === 'function') window.W.register(table);
    }
  };

  W.register({
    phAdd: { en: 'Take photo', hi: '' },
    phView: { en: 'Photo', hi: '' },
    phSending: { en: 'Sending', hi: '' },
    phNotSent: { en: 'Not sent', hi: '' },
    phOnPhone: { en: 'On this phone only', hi: '' },
    phWifi: { en: 'Sends when there is wifi', hi: '' }
  });

  /* w() throws on an id nobody registered, which is right (a silent English fallback is the defect
   * v2-foundation-ui.md 6.3 is about, and the build-time scan is where it belongs). But a photo grid sits
   * inside a job card and a duty board, and a thrown word would take the whole screen with it, so a
   * missing word costs a word here and the English stands in. */
  function say(id) {
    if (typeof window.w === 'function') {
      try {
        var t = window.w(id);
        if (t != null && String(t) !== '') return t;
      } catch (e) { /* fall through to the English below */ }
    }
    return local[id] ? local[id].en : '';
  }

  function blank(s) { return s == null || /^\s*$/.test(String(s)); }

  /* The state line, which is the whole point of the tile: unknown, sent, in flight, failed and
   * on-this-phone-only must never look alike. Failed is a badge because it is a refusal the person has to
   * act on; the other two are quieter notes. Each carries a word AND a mark. */
  function stateNote(p) {
    if (p.failed) {
      return '<span class="badge badge-bad">' + draw('offline', MARK_SIZE) + ' ' + esc(say('phNotSent')) + '</span>';
    }
    if (p.pending) return '<span class="photo-note">' + esc(say('phSending')) + '</span>';
    if (p.local) {
      return '<span class="photo-note">' + draw('offline', MARK_SIZE) + ' ' + esc(say('phOnPhone')) + '</span>';
    }
    return '';
  }

  function tile(p) {
    p = p || {};
    var cap = p.caption;
    var src = blank(p.url) ? '' : String(p.url);
    /* The accessible name. A caption is shown; without one the tile still needs a name, so the generic
     * word goes in sr-only rather than filling a four-tile grid with the word "Photo" four times. */
    var name = blank(cap)
      ? '<span class="sr-only">' + esc(say('phView')) + '</span>'
      : '<span class="photo-note">' + esc(cap) + '</span>';
    var picture = src === ''
      ? '<span class="photo-img photo-blank">' + draw('doc', 24) + '</span>'
      : '<img class="photo-img" src="' + esc(src) + '" alt="" referrerpolicy="no-referrer">';
    return '<button type="button" class="photo" data-photo-src="' + esc(src) + '"'
      + ' data-photo-caption="' + esc(blank(cap) ? '' : cap) + '">'
      + name + stateNote(p) + picture + '</button>';
  }

  /* The capture control. `label` is the words on it; `name` is the input's form name, so a screen that
   * posts more than one of these can tell them apart. capture="environment" asks for the rear camera and
   * is ignored on a desktop, which then opens a file picker -- the office PC path. */
  function photoCapture(label, name) {
    var text = blank(label) ? say('phAdd') : label;
    return '<label class="btn photo-add">'
      + '<input type="file" accept="image/*" capture="environment" class="sr-only"'
      + (blank(name) ? '' : ' name="' + esc(name) + '"') + '>'
      + draw('camera', ADD_MARK_SIZE) + ' ' + esc(text) + '</label>';
  }

  /* opts.max is how many photos this place allows. Past it the capture cell is ABSENT, not disabled --
   * the same rule as a card that has been closed, where capture is absent and the grid says the photos
   * are fixed. A control the person may not use is absent. */
  function photoGrid(list, opts) {
    opts = opts || {};
    var items = (list && typeof list.length === 'number') ? list : [];
    var max = (typeof opts.max === 'number' && isFinite(opts.max) && opts.max >= 0) ? Math.floor(opts.max) : null;
    var shown = (max === null || items.length <= max) ? items.length : max;
    var cells = '', anyLocal = false, i;
    for (i = 0; i < shown; i++) {
      cells += tile(items[i]);
      if (items[i] && items[i].local) anyLocal = true;
    }
    if (opts.capture && (max === null || shown < max)) cells += photoCapture(opts.label, opts.name);
    /* The honest half of the 20 MB case: say when it sends, and do not tell the person to do anything
     * else. The manual already tells them to upload on wifi, and that is the whole of what we know. */
    var hint = anyLocal ? '<p class="photos-hint">' + esc(say('phWifi')) + '</p>' : '';
    return '<div class="photos">' + cells + '</div>' + hint;
  }

  /* Full size, inside the one sheet mechanism. The caption is the sheet's TITLE, so the words come before
   * the picture here too, and the <img> carries it as its alt. */
  function openPhoto(src, caption) {
    if (!window.V2 || typeof window.V2.openSheet !== 'function') return null;
    var cap = blank(caption) ? '' : String(caption);
    var title = cap === '' ? say('phView') : cap;
    var body = '<img class="photo-full" src="' + esc(src) + '" alt="' + esc(cap) + '" referrerpolicy="no-referrer">';
    return window.V2.openSheet(title, body);
  }

  function onClick(ev) {
    var target = ev && ev.target;
    var btn = target && typeof target.closest === 'function' ? target.closest('[data-photo-src]') : null;
    if (!btn) return;
    var src = btn.getAttribute('data-photo-src');
    if (!src) return;                  // nothing has been loaded for this tile: the screen's own handler owns the tap
    openPhoto(src, btn.getAttribute('data-photo-caption'));
  }

  if (typeof document !== 'undefined' && document && typeof document.addEventListener === 'function') {
    document.addEventListener('click', onClick);
  }

  window.photoGrid = photoGrid;
  window.photoCapture = photoCapture;
  // Added to the existing V2 object, never assigned over it: overlay.js owns the other four names.
  window.V2 = window.V2 || {};
  window.V2.openPhoto = openPhoto;
})(window);

/* Garage Saathi icon set. Plain script, ES5, no module system, no dependencies, no font.
 *
 * Why this exists: the live app draws its icons as emoji, which are a FONT dependency. The office PCs
 * run Windows 7, which never received the full emoji set, so those icons render grey or as empty boxes.
 * An inline SVG needs no font. Do not add a glyph, a <text> element or an icon font here.
 *
 * Every mark is ONE path on a 24 x 24 grid, drawn with a 1.75 stroke in currentColor (so it takes the
 * colour of the text around it and needs no token names). Keep geometry inside 1..23 so the stroke is
 * never clipped; test_ui_icons.js enforces that.
 *
 * Usage:   icon('bus')                              decorative (aria-hidden)
 *          icon('warn', {title: 'Warning'})         announced as an image named "Warning"
 *          icon('bus', {size: 32})                  size defaults to 20
 * An unknown name draws a dotted square, so a typo is obvious on screen rather than invisible. */
(function (window) {
  'use strict';

  var ICONS = {
    bus: 'M5 3h14a2 2 0 0 1 2 2v12H3V5a2 2 0 0 1 2-2z M3 11h18 M7 17v3 M17 17v3 M7 14h.01 M17 14h.01',
    job: 'M15 4.5h3a1 1 0 0 1 1 1V21a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1h3 M9 3h6v3H9z M8.5 11h7 M8.5 15h7',
    part: 'M10.6 4.9L10.8 2.5L13.2 2.5L13.4 4.9L16 6L17.9 4.4L19.6 6.1L18 8L19.1 10.6L21.5 10.8L21.5 13.2L19.1 13.4L18 16L19.6 17.9L17.9 19.6L16 18L13.4 19.1L13.2 21.5L10.8 21.5L10.6 19.1L8 18L6.1 19.6L4.4 17.9L6 16L4.9 13.4L2.5 13.2L2.5 10.8L4.9 10.6L6 8L4.4 6.1L6.1 4.4L8 6z M14.8 12a2.8 2.8 0 1 0-5.6 0 2.8 2.8 0 0 0 5.6 0z',
    person: 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1',
    /* A tyre and a battery, because both were drawn with `part` -- and at the top
       of a bus's component card they are two ICON-ONLY buttons side by side, so
       the same cog did "fit tyres" and "fit batteries" with nothing to tell them
       apart. The tyre is a wheel (rim, hub, spokes) and the battery is a battery
       (body, two posts, the plus and minus); neither can be mistaken for the
       cog or for each other at 20px. */
    tyre: 'M12 2.6a9.4 9.4 0 1 0 0 18.8 9.4 9.4 0 0 0 0-18.8z M12 7.9a4.1 4.1 0 1 0 0 8.2 4.1 4.1 0 0 0 0-8.2z M12 2.6v5.3 M12 16.1v5.3 M2.6 12h5.3 M16.1 12h5.3',
    battery: 'M2.6 8.4h18.8v11.2H2.6z M6.8 8.4V5.6h3.2v2.8 M14 8.4V5.6h3.2v2.8 M6.2 14h3.4 M14.4 14h3.4 M16.1 12.3v3.4',
    // Added for the bottom nav, which is on every screen and was five emoji.
    // `me` is a person INSIDE a ring so it cannot be mistaken for `person` two
    // tabs along -- the owner's nav carries both at once.
    home: 'M3 10.8 L12 3.2 L21 10.8 M5.4 9.6 L5.4 20.4 L18.6 20.4 L18.6 9.6 M9.8 20.4 L9.8 15.2 L14.2 15.2 L14.2 20.4',
    me: 'M12 2.6a9.4 9.4 0 1 0 0 18.8 9.4 9.4 0 0 0 0-18.8z M12 8a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6z M6.6 19.2a5.8 5.8 0 0 1 10.8 0',
    // The light/dark toggle, which sits in the header of every screen. A tick and
    // a clock were the nearest existing marks and both said the wrong thing.
    sun: 'M12 7.6a4.4 4.4 0 1 0 0 8.8 4.4 4.4 0 0 0 0-8.8z M12 2.8v2.2 M12 19v2.2 M2.8 12h2.2 M19 12h2.2 M5.6 5.6l1.6 1.6 M16.8 16.8l1.6 1.6 M18.4 5.6l-1.6 1.6 M7.2 16.8l-1.6 1.6',
    moon: 'M20 14.6A8.6 8.6 0 0 1 9.4 4 8.6 8.6 0 1 0 20 14.6z',
    fuel: 'M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16 M3 21h12 M7 8h4 M14 9h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V8l-3-3',
    money: 'M7 4.5h10 M7 9h10 M7 4.5h2.5a4.25 4.25 0 0 1 0 8.5H7l8 7',
    review: 'M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H10l-5 4v-4H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z M8 9h8 M8 12.5h5',
    star: 'M12 3.1L14.5 9.3L21.1 9.7L16 14L17.6 20.5L12 16.9L6.4 20.5L8 14L2.9 9.7L9.5 9.3z',
    gate: 'M3 8h5v13H3z M8 11h13v3.5H8z M12 11v3.5 M16.5 11v3.5',
    map: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z M9 4v14 M15 6v14',
    alert: 'M6 17v-6a6 6 0 0 1 12 0v6l2 2H4z M10 21h4 M12 3v2',
    warn: 'M12 3.5L21.5 20h-19z M12 10v4 M12 17h.01',
    ok: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M8 12.5l3 3 5-6',
    bad: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M9 9l6 6 M15 9l-6 6',
    clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l3 2',
    search: 'M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15z M16 16l5 5',
    filter: 'M3 4h18l-7 8.5V19l-4 2v-8.5z',
    add: 'M12 5v14 M5 12h14',
    edit: 'M4 20l1.2-4.5L16 4.7a2.1 2.1 0 0 1 3 0l.3.3a2.1 2.1 0 0 1 0 3L8.5 18.8z M14 6.8l3.2 3.2',
    'delete': 'M4 7h16 M9 7V4h6v3 M6 7l1 14h10l1-14 M10 11v6 M14 11v6',
    back: 'M19 12H5 M11 6l-6 6 6 6',
    more: 'M4.5 12a1 1 0 1 0 2 0 1 1 0 1 0-2 0 M11 12a1 1 0 1 0 2 0 1 1 0 1 0-2 0 M17.5 12a1 1 0 1 0 2 0 1 1 0 1 0-2 0',
    camera: 'M3 8a2 2 0 0 1 2-2h2l1.5-2h5L15 6h4a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M12 9.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
    doc: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5 M9 13h6 M9 17h6',
    offline: 'M2 9a15 15 0 0 1 20 0 M5.5 12.5a10 10 0 0 1 13 0 M9 16a5 5 0 0 1 6 0 M12 19.5h.01 M4 4l16 16'
  };

  // A dotted square: a near-zero dash (0.01) with a 4-unit gap, drawn as dots only because the root sets
  // stroke-linecap="round". The period is 4.01 and the perimeter 64, so the pattern does not close exactly:
  // there is a seam gap of about 3.85 at the start corner, which is harmless at icon size. Not part of
  // ICONS, so it is never mistaken for a real mark in a listing.
  var MISSING = 'M4 4h16v16H4z';

  var DEFAULT_SIZE = 20;

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  function icon(name, opts) {
    opts = opts || {};
    var n = Number(opts.size);
    var sizeOk = (typeof opts.size === 'number' || (typeof opts.size === 'string' && opts.size !== '')) && isFinite(n) && n > 0;
    var size = sizeOk ? n : DEFAULT_SIZE;

    var known = typeof name === 'string' && has(ICONS, name);
    var path = known
      ? '<path d="' + ICONS[name] + '"/>'
      : '<path d="' + MISSING + '" stroke-dasharray="0.01 4"/>';

    var hasTitle = opts.title !== undefined && opts.title !== null && String(opts.title) !== '';
    var a11y = hasTitle ? ' role="img"' : ' aria-hidden="true"';
    var title = hasTitle ? '<title>' + esc(opts.title) + '</title>' : '';
    var missing = known ? '' : ' data-missing="' + esc(typeof name === 'string' ? name : '') + '"';

    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '"'
      + ' viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"'
      + ' stroke-linecap="round" stroke-linejoin="round" focusable="false"' + a11y + missing + '>'
      + title + path + '</svg>';
  }

  window.ICONS = ICONS;
  window.icon = icon;
})(window);

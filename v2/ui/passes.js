/* Garage Saathi v2 gate-pass sheets: "New outside job", the slip, and "Received back". Plain script, ES5, one global
 * (Passes), beside ui/photos.js. Test: test_v2_passes.js. Spec: docs/v2/plan/outside-repair-ui.md 4.3-4.5.
 *
 *   Passes.issueSheet(o)  -> html   o {bus, pieces, card|null, piece|null, role, vendors?, me?, onSaved?}
 *   Passes.slipSheet(o)   -> html   o {pass, bus, mayReceive}
 *   Passes.returnSheet(o) -> html   o {pass|null, piece, bus|null, ageWords, card?, me?, onSaved?}
 *   Passes.issueWrite(o)  -> Promise<{ok, pass, reason?}>
 *   Passes.returnWrite(o) -> Promise<{ok, pass, piece, reason?}>
 *   Passes.vals(kind)     -> {field: value}   kind 'pass' | 'return'
 *   Passes.WORDS
 *
 * THIS IS A PRIMITIVE, NOT JOB-CARD CODE. The job card and a piece on Fuel & tyres both open the same sheet, make the
 * same slip and the same number; the door only decides where the bus comes from. Neither screen draws a sheet of its own.
 *
 * THE DRAFT. The pass id, its number and the history entry's id are minted when a sheet is DRAWN, not when it is saved,
 * and ride on the sheet as data-pid / data-no / data-hid. A second save of one sheet is then an upsert of the same row
 * and not a second slip with a second number (contract 5). The write functions never mint; given no draft they refuse.
 *
 * ONE SAVE IS ONE DB.putMany. A return writes the pass, the piece and the card; three DB.put calls are three
 * transactions, and both shapes have shipped here and had to be undone (03 9.17, 9.18).
 *
 * THE SERIAL IS NEVER PRE-FILLED on the return sheet. The whole record exists to catch the case where the number in his
 * hand differs from the number on the paper, and a pre-filled box is the same as not asking. Row 1 states what went out
 * as TEXT, which is not a field and which nobody confirms by tabbing past it.
 *
 * serialMismatch is written here for the offline view only. The record's value is the server's (contract 4.1) and this
 * file asserts nothing about where it came from. A mismatch NEVER refuses a return: the unit is in the yard whatever
 * the paper says.
 *
 * NO COST FIELD ON THE ISSUE SHEET. Nobody knows it yet, and asking invites a guess that becomes a figure on Money. */
(function (root) {
  'use strict';

  var WORDS = {
    ojNew: { en: 'New outside job', hi: 'नया बाहर का काम' },
    ojNewHint: { en: 'Fill this in before the unit leaves. Print it and send a copy with the vendor.', hi: 'सामान निकलने से पहले भरिए। छापकर एक कॉपी वेंडर के साथ भेजिए।' },
    ojVendor: { en: 'Vendor name', hi: 'वेंडर का नाम' },
    ojVendorPh: { en: 'who is doing the work', hi: 'काम कौन कर रहा है' },
    ojSerial: { en: 'Unit serial no.', hi: 'यूनिट सीरियल नं.' },
    ojSerialPh: { en: 'the number stamped on the unit', hi: 'यूनिट पर ठुका हुआ नंबर' },
    ojSerialWhy: { en: 'This is the one that matters — it is how you prove the unit that comes back is the one that went.', hi: 'यही सबसे ज़रूरी है — इसी से साबित होता है कि जो लौटा वही भेजा गया था।' },
    ojUnitName: { en: 'Unit name', hi: 'यूनिट का नाम' },
    ojUnitPh: { en: 'e.g. Alternator, Front tyre, Starter', hi: 'जैसे अल्टरनेटर, अगला टायर, सेल्फ़' },
    ojPiece: { en: 'Tracked piece (optional)', hi: 'ट्रैक किया हुआ पुर्जा (वैकल्पिक)' },
    ojPieceNone: { en: 'Not a tracked piece', hi: 'ट्रैक किया हुआ नहीं है' },
    ojRemark: { en: 'Remark', hi: 'रिमार्क' },
    ojRemarkPh: { en: 'what is to be done', hi: 'क्या काम होना है' },
    ojIssue: { en: 'Make the gate pass', hi: 'गेट पास बनाइए' },
    ojIssued: { en: 'Gate pass issued', hi: 'गेट पास बन गया' },
    ojPrint: { en: 'Print', hi: 'छापें' },
    ojWillPrint: { en: 'Will print', hi: 'यह छपेगा' },
    ojNeedVendor: { en: 'Enter the vendor', hi: 'वेंडर का नाम डालिए' },
    ojNeedUnit: { en: 'Enter the unit name', hi: 'यूनिट का नाम डालिए' },
    ojAtVendor: { en: 'At vendor', hi: 'वेंडर के पास' },
    ojOverdue: { en: 'Out 14+ days', hi: '14+ दिन से बाहर' },
    ojBack: { en: 'Back', hi: 'वापस आया' },
    ojOutFor: { en: 'out', hi: 'से बाहर' },
    ojReceive: { en: 'Received back', hi: 'वापस लिया' },
    ojReceiveHint: { en: 'Check the number on the unit against the one on the pass before you accept it.', hi: 'लेने से पहले यूनिट पर लिखा नंबर पर्ची के नंबर से मिलाइए।' },
    ojSerialBack: { en: 'Serial on the unit that came back', hi: 'लौटी यूनिट का सीरियल' },
    ojSerialBackPh: { en: 'read it off the unit', hi: 'यूनिट से पढ़कर लिखिए' },
    ojSerialBackWhy: { en: 'Read it off the metal, not off their bill.', hi: 'उनके बिल से नहीं, यूनिट पर से पढ़िए।' },
    ojBill: { en: 'Vendor bill', hi: 'वेंडर का बिल' },
    ojBillPhoto: { en: 'Photo of the bill', hi: 'बिल की फोटो' },
    ojMarkBack: { en: 'Record it back', hi: 'वापस आया — दर्ज करें' },
    ojMismatch: { en: 'Serial does not match', hi: 'सीरियल नहीं मिला' },
    /* The three labels the UI spec draws on the slip (4.3 row 1, 4.4 rows 4-5)
     * without naming an id for them. Registered here rather than written into
     * the markup; Hindi PENDING with the rest of 11.2 and the owner's to give. */
    ojChassis: { en: 'Chassis', hi: '' },
    ojEngine: { en: 'Engine', hi: '' },
    ojSerialNo: { en: 'Serial', hi: '' },
    ojWentOut: { en: 'Went out as', hi: 'गया था' },
    ojCameBack: { en: 'Came back as', hi: 'लौटा' },
    ojMismatchWhy: { en: 'Recorded so it can be taken up with the vendor. Do not pay until it is explained.', hi: 'दर्ज कर लिया गया है ताकि वेंडर से बात हो सके। सफ़ाई मिलने तक भुगतान मत कीजिए।' },
    ojBackOk: { en: 'Received — serial matches', hi: 'वापस लिया — सीरियल मिल गया' },
    ojBackMismatch: { en: 'Received — serial does NOT match', hi: 'वापस लिया — सीरियल नहीं मिला' },
    /* Reworded from i18n-hi.js:220, which carried a \n\n and a '#' before each number. The meaning is kept. */
    ojConfirmMismatch: { en: 'The pass says {a}. You have entered {b}. This is not the unit that was sent out. Record it anyway and flag it?',
                         hi: 'पर्ची पर {a} है, पर आपने {b} लिखा है। यह वह यूनिट नहीं है जो भेजी गई थी। फिर भी दर्ज करके निशान लगाएँ?' },
    /* New: Hindi PENDING, the owner's. */
    jcPassIssuedBy: { en: 'Issued by {name}, {date}', hi: '' },
    jcPassReceivedBy: { en: 'Received by {name}, {date}', hi: '' },
    jcPassMaking: { en: 'Making the pass...', hi: '' },
    jcPassWork: { en: 'For', hi: '' },
    ftReturnAge: { en: 'Read from this phone {ago}', hi: '' },
    ftReturnNoPass: { en: 'This piece went out before gate passes were kept. There is nothing to check the serial against.', hi: '' },
    ftReturnFitBack: { en: 'Back on {reg}', hi: '' },
    ftReturnShelf: { en: 'Onto the shelf as a spare', hi: '' },
    ftReturnCharge: { en: 'What they charged', hi: '' },
    ftReturnRemarkPh: { en: 'condition, what they did', hi: '' },
    ftReturnRecording: { en: 'Recording...', hi: '' },
    ftMismatchYes: { en: 'Record it and flag it', hi: '' },
    ftMismatchNo: { en: 'Look again', hi: '' }
  };

  var registered = false;
  function register() {
    if (registered || !root.W || typeof root.W.register !== 'function') return;
    root.W.register(WORDS);
    registered = true;
  }

  function put(s, vals) {
    return String(s).replace(/\{([A-Za-z0-9]+)\}/g, function (all, k) {
      return vals && Object.prototype.hasOwnProperty.call(vals, k) ? String(vals[k]) : '';
    });
  }
  function say(id, vals) {
    register();
    var s = registered && typeof root.w === 'function' ? root.w(id) : WORDS[id].en;
    return vals ? put(s, vals) : s;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function draw(name, size) { return typeof root.icon === 'function' ? root.icon(name, { size: size }) : ''; }
  function str(v) { return typeof v === 'string' ? v : (v == null ? '' : String(v)); }
  function trim(v) { return str(v).replace(/\s+/g, ' ').trim(); }
  function nowMs() { return Date.now(); }
  function db() { return (typeof DB !== 'undefined' && DB) || root.DB || null; }   // eslint-disable-line no-undef
  function outside() { return root.Outside || null; }
  function overlay() { return root.V2 || null; }

  /* "9 Nov", through Intl in the reader's own language, so no month name is a
   * fixed English word this file owns -- the same call store.js:shortDate makes.
   * Twelve hard-coded month names were here and test_v2_words.js was right to
   * redden: a word drawn for a reader lives in the table or in Intl, nowhere
   * else. */
  function locale() {
    var W = root.W;
    return (W && typeof W.lang === 'function' && W.lang() === 'hi') ? 'hi-IN' : 'en-IN';
  }
  function when(ms, withTime) {
    var d = new Date(Number(ms));
    if (ms == null || isNaN(d.getTime())) return '';
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    var day;
    try { day = d.toLocaleDateString(locale(), { day: 'numeric', month: 'short' }); }
    catch (e) { day = d.getDate() + '/' + (d.getMonth() + 1); }
    return day + (withTime ? ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) : '');
  }

  function userName(id) {
    var c = root.S && root.S.cache && root.S.cache.users;
    for (var i = 0; c && i < c.length; i++) if (c[i] && c[i].id === id) return c[i].name || id;
    return str(id);
  }

  function mintId(prefix) {
    if (typeof root.uid === 'function') return root.uid(prefix);
    return prefix + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
  }

  /* ---------------------------------------------------------------------- markup pieces */

  function row(lead, t, sub, act, cls) {
    return '<div class="v2row' + (cls ? ' ' + cls : '') + '">'
      + (lead ? '<span class="lead">' + lead + '</span>' : '')
      + '<span class="t">' + t + '</span>'
      + (sub ? '<span class="sub">' + sub + '</span>' : '')
      + (act ? '<span class="act">' + act + '</span>' : '') + '</div>';
  }

  function badge(kind, mark, text) {
    return '<span class="badge badge-' + kind + '">' + draw(mark, 14) + ' ' + esc(text) + '</span>';
  }

  function textField(label, field, ph, extra, errId) {
    return '<label class="num"><span class="num-l">' + esc(label) + '</span>'
      + '<input class="field" type="text" autocomplete="off" enterkeyhint="done" data-field="' + field + '"'
      + (ph ? ' placeholder="' + esc(ph) + '"' : '') + (extra || '') + ' aria-invalid="false">'
      + (errId ? '<span class="oj-err" data-err="' + errId + '" role="alert" hidden></span>' : '') + '</label>';
  }

  function regLine(bus) {
    if (!bus) return '';
    var out = str(bus.regNo || bus.id);
    if (bus.chassisNo) out += ' · ' + say('ojChassis') + ' ' + bus.chassisNo;
    if (bus.engineNo) out += ' · ' + say('ojEngine') + ' ' + bus.engineNo;
    return out;
  }

  /* ---------------------------------------------------------------------- the sheets */

  var ctxs = {};          // draft id -> the opening arguments, for the delegated save handler

  function issueSheet(o) {
    o = o || {};
    var bus = o.bus || {};
    var pieces = o.pieces || [];
    var chosen = o.piece ? o.piece.id : '';
    var pid = mintId('gp-');
    var out = outside();
    var no = out ? out.passNo(pid, nowMs()) : pid;
    var hid = mintId('h-');
    ctxs[pid] = o;
    var opts = '<option value="">' + esc(say('ojPieceNone')) + '</option>', i, c, lab;
    for (i = 0; i < pieces.length; i++) {
      c = pieces[i];
      if (!c || c._deleted) continue;
      lab = (c.label || c.id) + (c.serial ? ' · ' + c.serial : '');
      opts += '<option value="' + esc(c.id) + '" data-name="' + esc(c.label || '') + '" data-serial="' + esc(c.serial || '') + '"'
        + (c.id === chosen ? ' selected' : '') + '>' + esc(lab) + '</option>';
    }
    var vendors = '';
    for (i = 0; i < (o.vendors || []).length; i++) vendors += '<option value="' + esc(o.vendors[i]) + '">';
    var pre = o.piece || null;
    return '<div class="oj-sheet" data-sheet="pass" data-pid="' + esc(pid) + '" data-no="' + esc(no) + '" data-hid="' + esc(hid) + '">'
      + '<p class="oj-stat">' + draw('bus', 20) + ' ' + esc(say('ojWillPrint')) + ': ' + esc(regLine(bus)) + '</p>'
      + '<p class="oj-why">' + esc(say('ojNewHint')) + '</p>'
      + textField(say('ojVendor'), 'vendor', say('ojVendorPh'), ' list="oj-vendors-' + esc(pid) + '"', 'vendor')
      + '<datalist id="oj-vendors-' + esc(pid) + '">' + vendors + '</datalist>'
      + '<label class="num"><span class="num-l">' + esc(say('ojPiece')) + '</span>'
      + '<select class="select" data-field="piece">' + opts + '</select></label>'
      + textField(say('ojUnitName'), 'unit', say('ojUnitPh'), pre ? ' value="' + esc(pre.label || '') + '"' : '', 'unit')
      + textField(say('ojSerial'), 'serial', say('ojSerialPh'), ' spellcheck="false"' + (pre && pre.serial ? ' value="' + esc(pre.serial) + '"' : ''))
      + '<p class="oj-why">' + draw('warn', 14) + ' ' + esc(say('ojSerialWhy')) + '</p>'
      + textField(say('ojRemark'), 'remark', say('ojRemarkPh'))
      + '<button type="button" class="btn btn-primary jc-wide" data-act="ojSavePass">' + draw('doc', 18) + ' ' + esc(say('ojIssue')) + '</button>'
      + '</div>';
  }

  function slipSheet(o) {
    o = o || {};
    var p = o.pass || {}, bus = o.bus || {}, back = p.status === 'returned';
    var rows = '';
    rows += row(draw('person', 20), esc(p.vendorName));
    rows += row(draw('bus', 20), esc(bus.regNo || p.regNo || p.busId),
      esc((p.chassisNo ? say('ojChassis') + ' ' + p.chassisNo : '') + (p.chassisNo && p.engineNo ? ' · ' : '') + (p.engineNo ? say('ojEngine') + ' ' + p.engineNo : '')));
    rows += row(draw('part', 20), esc(p.unitName), p.unitSerial ? esc(say('ojSerialNo') + ' ' + p.unitSerial) : '');
    if (p.remark) rows += row(draw('doc', 20), esc(p.remark), esc(say('jcPassWork')));
    var by = '<p class="jc-pass-by">' + esc(say('jcPassIssuedBy', { name: userName(p.issuedBy), date: when(p.issuedAt, true) })) + '</p>';
    var ret = '';
    if (back) {
      var bad = !!p.serialMismatch;
      ret += row(draw('part', 20), esc(say('ojCameBack')) + ' ' + esc(p.returnSerial || ''));
      ret += row(draw(bad ? 'warn' : 'ok', 20), esc(say(bad ? 'ojBackMismatch' : 'ojBackOk')), '', '', bad ? 'bad' : 'ok');
      if (p.cost != null && typeof root.figure === 'function') {
        ret += row(draw('doc', 20), esc(say('ojBill')), '', root.figure(p.cost, { format: root.fmt && root.fmt.rupees }));
      }
      if (p.billPhoto && typeof root.photoGrid === 'function') ret += root.photoGrid([{ url: p.billPhoto }], { max: 1 });
      ret += '<p class="jc-pass-by">' + esc(say('jcPassReceivedBy', { name: userName(p.returnedBy), date: when(p.returnedAt, true) })) + '</p>';
    }
    return '<div class="oj-sheet jc-pass" data-sheet="slip" data-pid="' + esc(p.id) + '">'
      + '<p class="jc-pass-no">' + esc(p.no) + '</p>'
      + '<p>' + (back ? badge('ok', 'ok', say('ojBack')) : badge('warn', 'clock', say('ojAtVendor'))) + '</p>'
      + rows + by + ret
      + '<button type="button" class="btn btn-quiet" data-act="ojPrint">' + draw('doc', 18) + ' ' + esc(say('ojPrint')) + '</button>'
      + (o.mayReceive && !back
        ? '<button type="button" class="btn btn-primary jc-wide" data-act="ojReceiveOpen" data-pid="' + esc(p.id) + '">' + esc(say('ojMarkBack')) + '</button>' : '')
      + '</div>';
  }

  function lastSend(piece) {
    var h = (piece && piece.history) || [], i;
    for (i = h.length - 1; i >= 0; i--) if (h[i] && h[i].type === 'send-out') return h[i];
    return null;
  }

  function returnSheet(o) {
    o = o || {};
    var pass = o.pass || null, piece = o.piece || null, bus = o.bus || null;
    var hid = mintId('h-');
    ctxs[hid] = o;
    var went, send = lastSend(piece);
    if (pass) {
      went = pass.unitName + (pass.unitSerial ? ' · ' + pass.unitSerial : '');
    } else {
      went = piece ? (piece.label || piece.id) + (piece.serial ? ' · ' + piece.serial : '') : '';
      if (send && send.at) went += ', ' + when(send.at);
    }
    var tabs = '';
    if (bus) {
      tabs = '<div class="tabs" role="tablist">'
        + '<button type="button" role="tab" aria-selected="true" data-fit="back">' + esc(say('ftReturnFitBack', { reg: bus.regNo || bus.id })) + '</button>'
        + '<button type="button" role="tab" aria-selected="false" data-fit="shelf">' + esc(say('ftReturnShelf')) + '</button></div>';
    }
    return '<div class="oj-sheet" data-sheet="return" data-hid="' + esc(hid) + '" data-pass-id="' + esc(pass ? pass.id : '') + '">'
      + '<p class="oj-stat">' + draw('part', 20) + ' ' + esc(say('ojWentOut')) + ' ' + esc(went) + '</p>'
      + (o.ageWords ? '<p class="oj-why">' + draw('clock', 14) + ' ' + esc(say('ftReturnAge', { ago: o.ageWords })) + '</p>' : '')
      + (pass ? '<p class="oj-why">' + esc(say('ojReceiveHint')) + '</p>'
              : '<p class="oj-why">' + esc(say('ftReturnNoPass')) + '</p>')
      + '<label class="num"><span class="num-l">' + esc(say('ojSerialBack')) + '</span>'
      + '<input class="field" type="text" autocomplete="off" spellcheck="false" data-field="serial" placeholder="' + esc(say('ojSerialBackPh')) + '"></label>'
      + '<p class="oj-why">' + esc(say('ojSerialBackWhy')) + '</p>'
      + '<label class="num"><span class="num-l">' + esc(say('ojBill')) + '</span>'
      + '<input class="field num-in" type="text" inputmode="decimal" pattern="[0-9]*[.]?[0-9]*" autocomplete="off" data-field="cost" aria-label="' + esc(say('ftReturnCharge')) + '"></label>'
      + (typeof root.photoCapture === 'function' ? root.photoCapture(say('ojBillPhoto'), 'returnBill') : '')
      + '<span data-bill-preview></span>'
      + textField(say('ojRemark'), 'remark', say('ftReturnRemarkPh'))
      + tabs
      + '<button type="button" class="btn btn-primary jc-wide" data-act="ojSaveReturn">' + esc(say('ojMarkBack')) + '</button>'
      + '</div>';
  }

  /* ---------------------------------------------------------------------- reading a sheet, once, at save */

  function sheetEl(kind) {
    var d = root.document;
    return d && d.querySelector ? d.querySelector('[data-sheet="' + kind + '"]') : null;
  }

  function vals(kind) {
    var sheet = sheetEl(kind === 'return' ? 'return' : 'pass'), out = {}, i, els, f;
    if (!sheet) return out;
    els = sheet.querySelectorAll('[data-field]');
    for (i = 0; i < els.length; i++) {
      f = els[i].getAttribute('data-field');
      out[f] = str(els[i].value);
    }
    out.hid = sheet.getAttribute('data-hid') || '';
    if (kind === 'return') {
      var sel = sheet.querySelector('[role="tab"][aria-selected="true"]');
      out.fit = sel ? sel.getAttribute('data-fit') : 'shelf';
      out.passId = sheet.getAttribute('data-pass-id') || '';
    } else {
      out.id = sheet.getAttribute('data-pid') || '';
      out.no = sheet.getAttribute('data-no') || '';
    }
    out.bill = billData;
    return out;
  }

  /* ---------------------------------------------------------------------- the writes */

  function clone(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }
  function hasEntry(piece, hid) {
    var h = (piece && piece.history) || [], i;
    for (i = 0; i < h.length; i++) if (h[i] && h[i].id === hid) return true;
    return false;
  }
  function money(v) {
    var s = trim(v);
    if (s === '') return null;                         // null, never 0, when nothing is known
    var n = Number(s);
    return isFinite(n) && n >= 0 ? n : null;
  }

  async function issueWrite(o) {
    var v = o.vals || {}, D = db(), at = o.now == null ? nowMs() : o.now;
    var vendor = trim(v.vendor), unit = trim(v.unit);
    if (!v.id || !v.no) return { ok: false, reason: 'draft' };
    if (vendor === '') return { ok: false, reason: 'vendor' };
    if (unit === '') return { ok: false, reason: 'unit' };
    if (!o.bus) return { ok: false, reason: 'bus' };
    var again = await D.get('gatepasses', v.id);
    if (again) return { ok: true, pass: again, replay: true };
    var me = o.me || {};
    var pass = {
      id: v.id, no: v.no, status: 'out', vendorName: vendor, busId: o.bus.id,
      jobId: o.card ? o.card.id : null, componentId: v.piece ? v.piece : null,
      regNo: str(o.bus.regNo), engineNo: str(o.bus.engineNo), chassisNo: str(o.bus.chassisNo),
      unitName: unit, unitSerial: trim(v.serial), remark: trim(v.remark),
      issuedBy: me.id || '', issuedAt: at
    };
    var entries = [{ store: 'gatepasses', obj: pass }], piece = null, card = null;
    if (v.piece) {
      piece = await D.get('components', v.piece);
      if (!piece) return { ok: false, reason: 'changed' };
      if (!hasEntry(piece, v.hid) && piece.state !== 'in-service' && piece.state !== 'removed') return { ok: false, reason: 'changed' };
      piece = clone(piece);
      if (!hasEntry(piece, v.hid)) {
        piece.state = 'sent-out';
        piece.history = (piece.history || []).concat([{ id: v.hid, type: 'send-out', at: at, busId: piece.busId || null,
          position: piece.position || '', vendor: vendor, passId: pass.id, note: pass.remark }]);
      }
      entries.push({ store: 'components', obj: piece });
    }
    if (o.card) {
      card = await D.get('jobcards', o.card.id);
      if (!card) return { ok: false, reason: 'changed' };
      card = clone(card);
      card.gatePassNo = pass.no;
      card.gatePassId = pass.id;
      if (!card.externalVendor) card.externalVendor = vendor;
      entries.push({ store: 'jobcards', obj: card });
    }
    await D.putMany(entries);
    return { ok: true, pass: pass, piece: piece, card: card };
  }

  async function returnWrite(o) {
    var v = o.vals || {}, D = db(), at = o.now == null ? nowMs() : o.now, me = o.me || {};
    var out = outside();
    if (!v.hid) return { ok: false, reason: 'draft' };
    var pass = null, piece = null, card = null;
    var passId = o.pass ? o.pass.id : null;
    if (passId) {
      pass = await D.get('gatepasses', passId);
      if (!pass) return { ok: false, reason: 'changed' };
      pass = clone(pass);
    }
    var pieceId = o.piece ? o.piece.id : (pass && pass.componentId) || null;
    if (pieceId) {
      piece = await D.get('components', pieceId);
      if (!piece) return { ok: false, reason: 'changed' };
      piece = clone(piece);
    }
    var replay = piece ? hasEntry(piece, v.hid) : false;
    if (pass && pass.status === 'returned' && !replay) return { ok: false, reason: 'returned' };
    if (piece && !replay && piece.state !== 'sent-out') return { ok: false, reason: 'changed' };
    if (!pass && !piece) return { ok: false, reason: 'changed' };
    var serial = trim(v.serial), cost = money(v.cost), bill = str(v.bill);
    var entries = [];
    if (pass && !replay) {
      pass.status = 'returned';
      pass.returnedAt = at;
      pass.returnedBy = me.id || '';
      pass.returnSerial = serial;
      pass.serialMismatch = out ? out.mismatch(pass, serial) : false;     // the server re-derives it
      pass.cost = cost;
      pass.returnRemark = trim(v.remark);
      pass.billPhoto = bill;
    }
    if (pass) entries.push({ store: 'gatepasses', obj: pass });
    if (piece && !replay) {
      var send = lastSend(piece);
      var busId = piece.busId || (send && send.busId) || null;
      var back = v.fit !== 'shelf' && !!busId;
      var entry = { id: v.hid, type: 'return', at: at, busId: busId, position: piece.position || (send && send.position) || '',
        vendor: pass ? pass.vendorName : (send && send.vendor) || '', note: trim(v.remark), passId: pass ? pass.id : null };
      /* The money lives in one place: on the pass when there is one, else on the entry because nowhere else exists. */
      if (!pass) { entry.cost = cost; entry.billPhoto = bill; }
      piece.state = back ? 'in-service' : 'refurbished';
      piece.busId = back ? busId : null;
      if (back) piece.position = entry.position;
      piece.refurbCount = (Number(piece.refurbCount) || 0) + 1;     // the server re-derives it from the return entries
      piece.history = (piece.history || []).concat([entry]);
    }
    if (piece) entries.push({ store: 'components', obj: piece });
    if (pass && pass.jobId && !replay) {
      card = await D.get('jobcards', pass.jobId);
      if (card && cost != null) {
        card = clone(card);
        var total = 0, all = typeof D.all === 'function' ? await D.all('gatepasses') : [], i;
        for (i = 0; i < all.length; i++) {
          if (all[i] && all[i].jobId === pass.jobId && all[i].status === 'returned' && all[i].id !== pass.id && all[i].cost != null) total += all[i].cost;
        }
        card.externalCost = total + cost;
        entries.push({ store: 'jobcards', obj: card });
      } else { card = null; }
    }
    await D.putMany(entries);
    return { ok: true, pass: pass, piece: piece, card: card, mismatch: pass ? !!pass.serialMismatch : false, replay: replay };
  }

  /* ---------------------------------------------------------------------- wiring (reached by taps, never by render) */

  var billData = '';
  var wired = false;

  function toast(text, kind) {
    var V = overlay();
    if (V && typeof V.toast === 'function') V.toast(text, { kind: kind });
  }

  function flag(sheet, field, errKey, message) {
    var inp = sheet.querySelector('[data-field="' + field + '"]'), er = sheet.querySelector('[data-err="' + errKey + '"]');
    if (inp) inp.setAttribute('aria-invalid', message ? 'true' : 'false');
    if (er) { er.textContent = message || ''; if (message) er.removeAttribute('hidden'); else er.setAttribute('hidden', ''); }
  }

  async function savePass(btn) {
    var sheet = sheetEl('pass');
    if (!sheet) return;
    var ctx = ctxs[sheet.getAttribute('data-pid')];
    if (!ctx) return;
    var v = vals('pass');
    var noVendor = trim(v.vendor) === '', noUnit = trim(v.unit) === '';
    flag(sheet, 'vendor', 'vendor', noVendor ? say('ojNeedVendor') : '');
    flag(sheet, 'unit', 'unit', noUnit ? say('ojNeedUnit') : '');
    if (noVendor || noUnit) return;
    btn.setAttribute('aria-disabled', 'true');
    var label = btn.innerHTML;
    btn.textContent = say('jcPassMaking');
    var res;
    try { res = await issueWrite({ vals: v, bus: ctx.bus, card: ctx.card, me: ctx.me || (root.S && root.S.user) || null }); } catch (e) { res = { ok: false, reason: 'lost' }; }
    if (!res.ok) { btn.innerHTML = label; btn.removeAttribute('aria-disabled'); return; }
    /* The slip replaces the sheet in the SAME panel: the next act is to print, and a second sheet opening over the
     * first has no purpose. */
    var body = sheet.parentNode;
    if (body) body.innerHTML = slipSheet({ pass: res.pass, bus: ctx.bus, mayReceive: false });
    var title = root.document.querySelector('.ov-title');
    if (title) title.textContent = say('ojIssued');
    if (typeof ctx.onSaved === 'function') ctx.onSaved(res);
  }

  async function saveReturn(btn) {
    var sheet = sheetEl('return');
    if (!sheet) return;
    var ctx = ctxs[sheet.getAttribute('data-hid')];
    if (!ctx) return;
    var v = vals('return');
    var pass = ctx.pass || null;
    var out = outside();
    var bad = !!(pass && out && out.mismatch(pass, v.serial));
    if (bad && overlay() && typeof overlay().confirmDialog === 'function') {
      /* No is focused first by the dialog, so a reflexive Enter says "look again". Yes still never refuses the return. */
      var yes = await overlay().confirmDialog(
        say('ojConfirmMismatch', { a: pass.unitSerial, b: trim(v.serial) }) + ' ' + say('ojMismatchWhy'),
        { title: say('ojMismatch'), yes: say('ftMismatchYes'), no: say('ftMismatchNo'), danger: true });
      if (!yes) return;
    }
    btn.setAttribute('aria-disabled', 'true');
    var label = btn.innerHTML;
    btn.textContent = say('ftReturnRecording');
    var res;
    try { res = await returnWrite({ vals: v, pass: pass, piece: ctx.piece, me: ctx.me || (root.S && root.S.user) || null }); } catch (e) { res = { ok: false, reason: 'lost' }; }
    if (!res.ok) { btn.innerHTML = label; btn.removeAttribute('aria-disabled'); return; }
    billData = '';
    if (overlay() && typeof overlay().closeSheet === 'function') overlay().closeSheet();
    toast(say(res.mismatch ? 'ojBackMismatch' : 'ojBackOk'), res.mismatch ? 'warn' : 'ok');
    if (typeof ctx.onSaved === 'function') ctx.onSaved(res);
  }

  function readFile(file) {
    return new Promise(function (res) {
      try {
        var fr = new root.FileReader();
        fr.onload = function () { res(String(fr.result || '')); };
        fr.onerror = function () { res(''); };
        fr.readAsDataURL(file);
      } catch (e) { res(''); }
    });
  }

  function wire() {
    var d = root.document;
    if (wired || !d || typeof d.addEventListener !== 'function') return;
    wired = true;
    d.addEventListener('click', function (ev) {
      var t = ev.target && ev.target.closest ? ev.target.closest('[data-act],[data-fit]') : null;
      if (!t || !t.closest('.oj-sheet')) return;
      if (t.getAttribute('aria-disabled') === 'true') return;
      var act = t.getAttribute('data-act');
      if (act === 'ojSavePass') savePass(t);
      else if (act === 'ojSaveReturn') saveReturn(t);
      else if (act === 'ojPrint') { if (typeof root.print === 'function') root.print(); }
      else if (t.getAttribute('data-fit')) {
        var tabs = t.parentNode.querySelectorAll('[role="tab"]'), i;
        for (i = 0; i < tabs.length; i++) tabs[i].setAttribute('aria-selected', tabs[i] === t ? 'true' : 'false');
      }
    });
    d.addEventListener('change', function (ev) {
      var t = ev.target;
      if (!t || !t.closest || !t.closest('.oj-sheet')) return;
      if (t.getAttribute('data-field') === 'piece') {
        /* Choosing a piece fills the name and the serial and leaves both editable: the serial on the record may be
         * wrong and the casing is the truth. */
        var o = t.options[t.selectedIndex], sheet = t.closest('.oj-sheet');
        if (!o || !o.value) return;
        sheet.querySelector('[data-field="unit"]').value = o.getAttribute('data-name') || '';
        sheet.querySelector('[data-field="serial"]').value = o.getAttribute('data-serial') || '';
      } else if (t.getAttribute('name') === 'returnBill' && t.files && t.files[0]) {
        readFile(t.files[0]).then(function (url) {
          billData = url;
          var host = t.closest('.oj-sheet').querySelector('[data-bill-preview]');
          if (host && typeof root.photoGrid === 'function' && url) host.innerHTML = root.photoGrid([{ url: url, pending: true }], { max: 1 });
        });
      }
    });
  }
  wire();

  var api = { issueSheet: issueSheet, slipSheet: slipSheet, returnSheet: returnSheet, issueWrite: issueWrite,
              returnWrite: returnWrite, vals: vals, WORDS: WORDS };
  root.Passes = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);

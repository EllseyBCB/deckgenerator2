/* Wizard Kartendeck-Generator
 * Reines Vanilla-JS. Läuft lokal (auch per file://), keine externen Abhängigkeiten.
 */
(function () {
  'use strict';

  // ---- Konstanten -------------------------------------------------------
  var ASPECT_W = 33;
  var ASPECT_H = 50;                 // Ziel-Seitenverhältnis 33:50
  var COLORS = [
    { key: 'R', name: 'Rot', css: '#c0392b' },
    { key: 'Y', name: 'Gelb', css: '#d4b106' },
    { key: 'G', name: 'Grün', css: '#2e8b57' },
    { key: 'B', name: 'Blau', css: '#2f5fd0' }
  ];
  var NUMBERS = [1,2,3,4,5,6,7,8,9,10,11,12,13];
  var STORAGE_KEY = 'wizard-deck-settings-v1';

  // ---- State ------------------------------------------------------------
  // Geladene Bilder als HTMLImageElement (oder null).
  var imgs = {
    colors: { R: null, Y: null, G: null, B: null },
    numbers: {},                     // 1..13  (Modus "single": Einzel-Uploads)
    sheet: null,                     // Modus "sheet": ein Bild mit allen Zahlen
    sheetSlices: {},                 // 1..13  (aus dem Sheet geschnittene Canvases)
    Z: null,
    N: null
  };
  NUMBERS.forEach(function (n) { imgs.numbers[n] = null; });

  var defaults = {
    numMode: 'sheet',                // 'sheet' | 'single'
    sheetCols: 13,                   // Rasterspalten im Sheet
    sheetRows: 1,                    // Rasterzeilen im Sheet
    sheetMargin: 0,                  // Außenrand (Anteil)
    sheetGap: 0,                     // Abstand zwischen Zellen (Anteil)
    sheetTrim: true,                 // jede Zahl per Alpha-Bounding-Box zuschneiden
    sheetRemoveBg: true,             // einfarbigen Hintergrund transparent machen
    sheetBgTol: 0.16,               // Toleranz für Hintergrund-Erkennung (0..1)
    centerOn: true,
    centerScale: 0.55,               // Anteil der Kartenhöhe
    centerX: 0,                      // Anteil der Breite
    centerY: 0,                      // Anteil der Höhe
    cornerMode: 4,                   // 0 | 2 | 4
    cornerScale: 0.15,
    cornerInset: 0.05,
    cornerRotate: true,
    outWidth: 660
  };
  var settings = loadSettings();

  // ---- DOM Refs ---------------------------------------------------------
  var $ = function (id) { return document.getElementById(id); };
  var previewCanvas = $('previewCanvas');
  var previewSelect = $('previewSelect');
  var previewNote = $('previewNote');

  // ---- Setup Upload-Slots ----------------------------------------------
  function makeSlot(container, opts) {
    // opts: { id, label, sublabel, onLoad(img), onClear() }
    var slot = document.createElement('label');
    slot.className = 'slot';
    slot.title = 'Klicken oder Bild hierher ziehen';

    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';

    var thumb = document.createElement('img');
    thumb.className = 'thumb';
    thumb.alt = '';

    var placeholder = document.createElement('div');
    placeholder.className = 'placeholder';
    placeholder.innerHTML = '<div class="label">' + opts.label + '</div>' +
      (opts.sublabel ? '<div class="sublabel">' + opts.sublabel + '</div>' : '');

    var labelBar = document.createElement('div');
    labelBar.className = 'label';
    labelBar.textContent = opts.label;
    labelBar.style.display = 'none';

    var clearBtn = document.createElement('span');
    clearBtn.className = 'clear';
    clearBtn.textContent = '✕';
    clearBtn.title = 'Entfernen';

    slot.appendChild(input);
    slot.appendChild(thumb);
    slot.appendChild(placeholder);
    slot.appendChild(labelBar);
    slot.appendChild(clearBtn);
    container.appendChild(slot);

    function loadFile(file) {
      if (!file || !/^image\//.test(file.type)) return;
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        thumb.src = url;
        slot.classList.add('filled');
        labelBar.style.display = 'block';
        opts.onLoad(img);
        refreshAll();
      };
      img.onerror = function () { URL.revokeObjectURL(url); };
      img.src = url;
    }

    input.addEventListener('change', function () {
      if (input.files && input.files[0]) loadFile(input.files[0]);
    });

    clearBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      input.value = '';
      thumb.src = '';
      slot.classList.remove('filled');
      labelBar.style.display = 'none';
      opts.onClear();
      refreshAll();
    });

    // Drag & Drop
    ['dragenter', 'dragover'].forEach(function (ev) {
      slot.addEventListener(ev, function (e) {
        e.preventDefault();
        slot.classList.add('dragover');
      });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      slot.addEventListener(ev, function (e) {
        e.preventDefault();
        slot.classList.remove('dragover');
      });
    });
    slot.addEventListener('drop', function (e) {
      var dt = e.dataTransfer;
      if (dt && dt.files && dt.files[0]) loadFile(dt.files[0]);
    });

    return slot;
  }

  function buildSlots() {
    var colorSlots = $('colorSlots');
    COLORS.forEach(function (c) {
      makeSlot(colorSlots, {
        label: c.name,
        sublabel: c.key + '1–' + c.key + '13',
        onLoad: function (img) { imgs.colors[c.key] = img; },
        onClear: function () { imgs.colors[c.key] = null; }
      });
    });

    makeSlot($('sheetSlot'), {
      label: 'Zahlen-Sheet (1–13)',
      sublabel: 'ein Bild mit allen Zahlen',
      onLoad: function (img) { imgs.sheet = img; sliceSheet(); },
      onClear: function () { imgs.sheet = null; sliceSheet(); }
    });

    var numberSlots = $('numberSlots');
    NUMBERS.forEach(function (n) {
      makeSlot(numberSlots, {
        label: String(n),
        sublabel: '',
        onLoad: function (img) { imgs.numbers[n] = img; },
        onClear: function () { imgs.numbers[n] = null; }
      });
    });

    var specialSlots = $('specialSlots');
    makeSlot(specialSlots, {
      label: 'Zauberer',
      sublabel: 'Z1–Z4',
      onLoad: function (img) { imgs.Z = img; },
      onClear: function () { imgs.Z = null; }
    });
    makeSlot(specialSlots, {
      label: 'Narr',
      sublabel: 'N1–N4',
      onLoad: function (img) { imgs.N = img; },
      onClear: function () { imgs.N = null; }
    });
  }

  // ---- Vorschau-Auswahl -------------------------------------------------
  function buildPreviewOptions() {
    var opts = [];
    COLORS.forEach(function (c) {
      NUMBERS.forEach(function (n) {
        opts.push({ value: c.key + n, label: c.name + ' – ' + n });
      });
    });
    opts.push({ value: 'Z1', label: 'Zauberer' });
    opts.push({ value: 'N1', label: 'Narr' });
    previewSelect.innerHTML = '';
    opts.forEach(function (o) {
      var el = document.createElement('option');
      el.value = o.value;
      el.textContent = o.label;
      previewSelect.appendChild(el);
    });
    // Standard: eine mittlere Zahlkarte, damit man sofort etwas sieht.
    previewSelect.value = 'R7';
  }

  // ---- Karten-Spezifikation aus Kürzel ----------------------------------
  function parseCardId(id) {
    var letter = id.charAt(0);
    var rest = id.slice(1);
    if (letter === 'Z') return { type: 'special', kind: 'Z' };
    if (letter === 'N') return { type: 'special', kind: 'N' };
    return { type: 'number', color: letter, num: parseInt(rest, 10) };
  }

  // ---- Zahlen-Quelle (Sheet vs. Einzelbilder) ---------------------------
  function getNumberImage(n) {
    return settings.numMode === 'sheet'
      ? (imgs.sheetSlices[n] || null)
      : (imgs.numbers[n] || null);
  }

  // Prüft (per Stichprobe), ob das Bild echte Transparenz enthält.
  function imageHasAlpha(data) {
    for (var i = 3; i < data.length; i += 4) {
      if (data[i] < 245) return true;
    }
    return false;
  }

  // Einfarbigen Hintergrund (aus den 4 Ecken gemittelt) auf transparent setzen.
  function removeBackground(data, w, h, tol) {
    var corners = [0, (w - 1) * 4, (h - 1) * w * 4, ((h - 1) * w + (w - 1)) * 4];
    var br = 0, bg = 0, bb = 0;
    corners.forEach(function (o) { br += data[o]; bg += data[o + 1]; bb += data[o + 2]; });
    br /= 4; bg /= 4; bb /= 4;
    var t = tol * 441.673;           // 0..1 -> Distanz im RGB-Würfel (max ≈ 441)
    var t2 = t * t;
    for (var i = 0; i < data.length; i += 4) {
      var dr = data[i] - br, dg = data[i + 1] - bg, db = data[i + 2] - bb;
      if (dr * dr + dg * dg + db * db <= t2) data[i + 3] = 0;
    }
  }

  // Schneidet eine Zelle aus und trimmt sie (per Alpha) auf ihren Inhalt.
  function trimCell(srcCanvas, sctx, sx, sy, sw, sh, doTrim) {
    sx = Math.max(0, Math.round(sx));
    sy = Math.max(0, Math.round(sy));
    sw = Math.min(Math.round(sw), srcCanvas.width - sx);
    sh = Math.min(Math.round(sh), srcCanvas.height - sy);
    if (sw <= 0 || sh <= 0) return null;

    var out = document.createElement('canvas');
    if (!doTrim) {
      out.width = sw; out.height = sh;
      out.getContext('2d').drawImage(srcCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
      return out;
    }

    var d = sctx.getImageData(sx, sy, sw, sh).data;
    var minX = sw, minY = sh, maxX = -1, maxY = -1;
    for (var y = 0; y < sh; y++) {
      for (var x = 0; x < sw; x++) {
        if (d[(y * sw + x) * 4 + 3] > 20) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) {                  // leere Zelle -> ganze Zelle behalten
      out.width = sw; out.height = sh;
      out.getContext('2d').drawImage(srcCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
      return out;
    }
    var pad = 1;
    minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
    maxX = Math.min(sw - 1, maxX + pad); maxY = Math.min(sh - 1, maxY + pad);
    var cw = maxX - minX + 1, ch = maxY - minY + 1;
    out.width = cw; out.height = ch;
    out.getContext('2d').drawImage(srcCanvas, sx + minX, sy + minY, cw, ch, 0, 0, cw, ch);
    return out;
  }

  // Zerlegt das Sheet in bis zu 13 Zahl-Glyphen und zeichnet das Raster-Overlay.
  function sliceSheet() {
    imgs.sheetSlices = {};
    var status = $('sheetStatus');
    var canvas = $('sheetCanvas');

    if (!imgs.sheet) {
      if (canvas) { canvas.width = 0; canvas.height = 0; }
      if (status) status.textContent = '';
      return;
    }

    var sImg = imgs.sheet;
    var iw = sImg.naturalWidth || sImg.width;
    var ih = sImg.naturalHeight || sImg.height;

    // Sheet auf Arbeits-Canvas, optional Hintergrund entfernen.
    var work = document.createElement('canvas');
    work.width = iw; work.height = ih;
    var wctx = work.getContext('2d');
    wctx.drawImage(sImg, 0, 0);
    var full = wctx.getImageData(0, 0, iw, ih);
    var hadAlpha = imageHasAlpha(full.data);
    if (settings.sheetRemoveBg && !hadAlpha) {
      removeBackground(full.data, iw, ih, settings.sheetBgTol);
      wctx.putImageData(full, 0, 0);
    }

    var cols = Math.max(1, settings.sheetCols | 0);
    var rows = Math.max(1, settings.sheetRows | 0);
    var mX = settings.sheetMargin * iw, mY = settings.sheetMargin * ih;
    var gX = settings.sheetGap * iw, gY = settings.sheetGap * ih;
    var cellW = (iw - 2 * mX - gX * (cols - 1)) / cols;
    var cellH = (ih - 2 * mY - gY * (rows - 1)) / rows;

    var made = 0;
    for (var idx = 0; idx < cols * rows && idx < 13; idx++) {
      var cxi = idx % cols, cyi = Math.floor(idx / cols);
      var x = mX + cxi * (cellW + gX);
      var y = mY + cyi * (cellH + gY);
      var cell = trimCell(work, wctx, x, y, cellW, cellH, settings.sheetTrim);
      if (cell && cell.width > 0 && cell.height > 0) { imgs.sheetSlices[idx + 1] = cell; made++; }
    }

    drawSheetOverlay(work, iw, ih, cols, rows, mX, mY, gX, gY, cellW, cellH);

    if (status) {
      status.textContent = made >= 13
        ? '✓ 13 Zahlen erkannt (Zelle 1–13 → Zahl 1–13).'
        : '⚠ Nur ' + made + ' von 13 Zellen. Stelle Spalten × Zeilen so ein, dass mindestens 13 Zellen entstehen (z. B. 13×1).';
    }
  }

  // Zeichnet das (ggf. freigestellte) Sheet klein mit Rasterlinien + Zellnummern.
  function drawSheetOverlay(work, iw, ih, cols, rows, mX, mY, gX, gY, cellW, cellH) {
    var canvas = $('sheetCanvas');
    if (!canvas) return;
    var maxW = 360;
    var scale = Math.min(1, maxW / iw);
    var dw = Math.max(1, Math.round(iw * scale));
    var dh = Math.max(1, Math.round(ih * scale));
    canvas.width = dw; canvas.height = dh;
    var c = canvas.getContext('2d');
    c.clearRect(0, 0, dw, dh);
    c.drawImage(work, 0, 0, dw, dh);
    c.strokeStyle = 'rgba(124,92,255,0.95)';
    c.lineWidth = 1.5;
    c.font = '11px system-ui, sans-serif';
    c.textBaseline = 'top';
    for (var idx = 0; idx < cols * rows; idx++) {
      var cxi = idx % cols, cyi = Math.floor(idx / cols);
      var x = (mX + cxi * (cellW + gX)) * scale;
      var y = (mY + cyi * (cellH + gY)) * scale;
      var w = cellW * scale, h = cellH * scale;
      c.strokeRect(x, y, w, h);
      if (idx < 13) {
        c.fillStyle = 'rgba(18,21,28,0.8)';
        c.fillRect(x + 2, y + 2, 15, 13);
        c.fillStyle = '#fff';
        c.fillText(String(idx + 1), x + 4, y + 3);
      }
    }
  }

  // ---- Zeichnen ---------------------------------------------------------
  // "cover": Bild mittig so skalieren/zuschneiden, dass es dw×dh KOMPLETT füllt
  // (kein Rand). Garantiert Design an allen 4 Kanten.
  function drawCover(ctx, img, dx, dy, dw, dh) {
    var iw = img.naturalWidth || img.width;
    var ih = img.naturalHeight || img.height;
    if (!iw || !ih) return;
    var scale = Math.max(dw / iw, dh / ih);
    var sw = dw / scale;             // Quell-Ausschnitt
    var sh = dh / scale;
    var sx = (iw - sw) / 2;
    var sy = (ih - sh) / 2;
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
  }

  // Glyph (Zahl) mittig auf (cx,cy) mit Zielhöhe targetH, Seitenverhältnis erhalten.
  function drawGlyph(ctx, img, cx, cy, targetH, rotateDeg) {
    var iw = img.naturalWidth || img.width;
    var ih = img.naturalHeight || img.height;
    if (!iw || !ih) return;
    var h = targetH;
    var w = h * (iw / ih);
    ctx.save();
    ctx.translate(cx, cy);
    if (rotateDeg) ctx.rotate(rotateDeg * Math.PI / 180);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  // Rendert eine Karte auf das übergebene Canvas (in Ausgabeauflösung W×H).
  function renderCard(canvas, id) {
    var W = canvas.width, H = canvas.height;
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, W, H);

    var spec = parseCardId(id);

    if (spec.type === 'special') {
      var simg = spec.kind === 'Z' ? imgs.Z : imgs.N;
      if (simg) drawCover(ctx, simg, 0, 0, W, H);
      else drawMissingBg(ctx, W, H, spec.kind === 'Z' ? 'Zauberer fehlt' : 'Narr fehlt');
      return;
    }

    // Zahlkarte: Farbhintergrund + Zahl
    var bg = imgs.colors[spec.color];
    if (bg) drawCover(ctx, bg, 0, 0, W, H);
    else {
      var col = COLORS.filter(function (c) { return c.key === spec.color; })[0];
      ctx.fillStyle = col ? col.css : '#444';
      ctx.fillRect(0, 0, W, H);
    }

    var num = getNumberImage(spec.num);
    if (!num) {
      // Platzhalter-Zahl, damit die Vorschau auch ohne Upload etwas zeigt.
      drawPlaceholderNumber(ctx, W, H, spec.num);
      return;
    }

    // Mittige Zahl (Breite begrenzen, damit zweistellige Zahlen nicht überlaufen)
    if (settings.centerOn) {
      var targetH = settings.centerScale * H;
      var niw = num.naturalWidth || num.width, nih = num.naturalHeight || num.height;
      var maxW = 0.86 * W;
      if (nih && targetH * (niw / nih) > maxW) targetH = maxW * nih / niw;
      var cx = W / 2 + settings.centerX * W;
      var cy = H / 2 + settings.centerY * H;
      drawGlyph(ctx, num, cx, cy, targetH, 0);
    }

    // Ecken-Zahlen
    if (settings.cornerMode === 2 || settings.cornerMode === 4) {
      var ch = settings.cornerScale * H;
      var cw = ch * ((num.naturalWidth || num.width) / (num.naturalHeight || num.height));
      var insetX = settings.cornerInset * W;
      var insetY = settings.cornerInset * W; // gleicher px-Abstand oben/unten wie seitlich
      var rot = settings.cornerRotate ? 180 : 0;

      var tl = { x: insetX + cw / 2, y: insetY + ch / 2, r: 0 };
      var br = { x: W - insetX - cw / 2, y: H - insetY - ch / 2, r: rot };
      var tr = { x: W - insetX - cw / 2, y: insetY + ch / 2, r: 0 };
      var bl = { x: insetX + cw / 2, y: H - insetY - ch / 2, r: rot };

      var corners = settings.cornerMode === 2 ? [tl, br] : [tl, tr, bl, br];
      corners.forEach(function (p) { drawGlyph(ctx, num, p.x, p.y, ch, p.r); });
    }
  }

  function drawMissingBg(ctx, W, H, text) {
    ctx.fillStyle = '#2b3140';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#8892a3';
    ctx.font = Math.round(W * 0.08) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, W / 2, H / 2);
  }

  function drawPlaceholderNumber(ctx, W, H, n) {
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = 'bold ' + Math.round(H * settings.centerScale) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(n), W / 2 + settings.centerX * W, H / 2 + settings.centerY * H);
  }

  // ---- Vorschau aktualisieren ------------------------------------------
  function outHeightFor(width) {
    return Math.round(width * ASPECT_H / ASPECT_W);
  }

  function updatePreview() {
    var id = previewSelect.value || 'R7';
    // Vorschau in moderater Auflösung (Höhe ~500), Verhältnis exakt 33:50.
    var pw = 330, ph = outHeightFor(330); // 330 -> 500
    if (previewCanvas.width !== pw) previewCanvas.width = pw;
    if (previewCanvas.height !== ph) previewCanvas.height = ph;
    renderCard(previewCanvas, id);

    var spec = parseCardId(id);
    if (spec.type === 'special') {
      previewNote.textContent = (spec.kind === 'Z' ? 'Zauberer' : 'Narr') +
        ' – wird als ' + spec.kind + '1–' + spec.kind + '4 (4×) gespeichert, ohne Zahl.';
    } else {
      previewNote.textContent = 'Dateiname: ' + spec.color + spec.num + '.png';
    }
  }

  function refreshAll() {
    updateOutSizeNote();
    updatePreview();
    updateValidation();
  }

  // ---- Einstellungen <-> UI --------------------------------------------
  function bindRange(id, key, fmt) {
    var el = $(id);
    var out = $(id + 'Out');
    el.value = settings[key];
    if (out) out.textContent = fmt(settings[key]);
    el.addEventListener('input', function () {
      settings[key] = parseFloat(el.value);
      if (out) out.textContent = fmt(settings[key]);
      saveSettings();
      updatePreview();
    });
  }

  // Range-Regler, die ein Neu-Slicen des Sheets auslösen.
  function bindSheetRange(id, key, fmt) {
    var el = $(id), out = $(id + 'Out');
    el.value = settings[key];
    if (out) out.textContent = fmt(settings[key]);
    el.addEventListener('input', function () {
      settings[key] = parseFloat(el.value);
      if (out) out.textContent = fmt(settings[key]);
      saveSettings();
      sliceSheet();
      updatePreview();
      updateValidation();
    });
  }

  function bindSheetInt(id, key) {
    var el = $(id);
    el.value = settings[key];
    el.addEventListener('change', function () {
      var v = Math.max(1, Math.min(13, parseInt(el.value, 10) || 1));
      settings[key] = v;
      el.value = v;
      saveSettings();
      sliceSheet();
      refreshAll();
    });
  }

  function bindSheetCheck(id, key) {
    var el = $(id);
    el.checked = settings[key];
    el.addEventListener('change', function () {
      settings[key] = el.checked;
      saveSettings();
      sliceSheet();
      refreshAll();
    });
  }

  function applyNumMode() {
    var sheetOn = settings.numMode === 'sheet';
    $('sheetMode').style.display = sheetOn ? '' : 'none';
    $('singleMode').style.display = sheetOn ? 'none' : '';
    Array.prototype.forEach.call(document.getElementsByName('numMode'), function (r) {
      r.checked = (r.value === settings.numMode);
    });
  }

  function bindControls() {
    Array.prototype.forEach.call(document.getElementsByName('numMode'), function (r) {
      r.addEventListener('change', function () {
        if (r.checked) { settings.numMode = r.value; saveSettings(); applyNumMode(); refreshAll(); }
      });
    });
    bindSheetInt('sheetCols', 'sheetCols');
    bindSheetInt('sheetRows', 'sheetRows');
    bindSheetRange('sheetMargin', 'sheetMargin', pct);
    bindSheetRange('sheetGap', 'sheetGap', pct);
    bindSheetRange('sheetBgTol', 'sheetBgTol', pct);
    bindSheetCheck('sheetTrim', 'sheetTrim');
    bindSheetCheck('sheetRemoveBg', 'sheetRemoveBg');

    bindRange('centerScale', 'centerScale', pct);
    bindRange('centerX', 'centerX', pct);
    bindRange('centerY', 'centerY', pct);
    bindRange('cornerScale', 'cornerScale', pct);
    bindRange('cornerInset', 'cornerInset', pct);

    var centerOn = $('centerOn');
    centerOn.checked = settings.centerOn;
    centerOn.addEventListener('change', function () {
      settings.centerOn = centerOn.checked; saveSettings(); updatePreview();
    });

    var cornerMode = $('cornerMode');
    cornerMode.value = String(settings.cornerMode);
    cornerMode.addEventListener('change', function () {
      settings.cornerMode = parseInt(cornerMode.value, 10); saveSettings(); updatePreview();
    });

    var cornerRotate = $('cornerRotate');
    cornerRotate.checked = settings.cornerRotate;
    cornerRotate.addEventListener('change', function () {
      settings.cornerRotate = cornerRotate.checked; saveSettings(); updatePreview();
    });

    var outWidth = $('outWidth');
    outWidth.value = settings.outWidth;
    outWidth.addEventListener('change', function () {
      var v = Math.max(132, Math.min(1320, parseInt(outWidth.value, 10) || defaults.outWidth));
      settings.outWidth = v;
      outWidth.value = v;
      saveSettings();
      updateOutSizeNote();
    });

    previewSelect.addEventListener('change', updatePreview);

    $('resetBtn').addEventListener('click', function () {
      settings = JSON.parse(JSON.stringify(defaults));
      saveSettings();
      syncControlsFromSettings();
      sliceSheet();
      refreshAll();
    });

    $('generateBtn').addEventListener('click', generateDeck);
  }

  function syncControlsFromSettings() {
    ['centerScale','centerX','centerY','cornerScale','cornerInset',
     'sheetMargin','sheetGap','sheetBgTol'].forEach(function (k) {
      var el = $(k); var out = $(k + 'Out');
      if (!el) return;
      el.value = settings[k]; if (out) out.textContent = pct(settings[k]);
    });
    $('sheetCols').value = settings.sheetCols;
    $('sheetRows').value = settings.sheetRows;
    $('sheetTrim').checked = settings.sheetTrim;
    $('sheetRemoveBg').checked = settings.sheetRemoveBg;
    $('centerOn').checked = settings.centerOn;
    $('cornerMode').value = String(settings.cornerMode);
    $('cornerRotate').checked = settings.cornerRotate;
    $('outWidth').value = settings.outWidth;
    applyNumMode();
  }

  function updateOutSizeNote() {
    var w = settings.outWidth, h = outHeightFor(w);
    $('outSizeNote').textContent = 'Ausgabe: ' + w + '×' + h + ' px (Verhältnis 33:50)';
  }

  function pct(v) { return Math.round(v * 100) + '%'; }

  function loadSettings() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var s = JSON.parse(raw);
        var merged = JSON.parse(JSON.stringify(defaults));
        Object.keys(defaults).forEach(function (k) {
          if (s[k] !== undefined) merged[k] = s[k];
        });
        return merged;
      }
    } catch (e) { /* ignore */ }
    return JSON.parse(JSON.stringify(defaults));
  }

  function saveSettings() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch (e) {}
  }

  // ---- Validierung ------------------------------------------------------
  function missingItems() {
    var missing = [];
    COLORS.forEach(function (c) {
      if (!imgs.colors[c.key]) missing.push('Farbe ' + c.name);
    });
    if (settings.numMode === 'sheet') {
      var got = NUMBERS.filter(function (n) { return imgs.sheetSlices[n]; }).length;
      if (!imgs.sheet) missing.push('Zahlen-Sheet');
      else if (got < 13) missing.push('Zahlen-Sheet: nur ' + got + '/13 Zellen (Raster anpassen)');
    } else {
      var missingNums = NUMBERS.filter(function (n) { return !imgs.numbers[n]; });
      if (missingNums.length) missing.push('Zahl(en): ' + missingNums.join(', '));
    }
    if (!imgs.Z) missing.push('Zauberer');
    if (!imgs.N) missing.push('Narr');
    return missing;
  }

  function updateValidation() {
    var box = $('validation');
    var missing = missingItems();
    var btn = $('generateBtn');
    if (missing.length === 0) {
      box.innerHTML = '<span class="ok">✓ Alle Bilder vorhanden – bereit für 60 Karten.</span>';
      btn.disabled = false;
    } else {
      box.innerHTML = '<span class="missing">Noch fehlende Bilder (' + missing.length +
        '):</span><ul><li>' + missing.map(escapeHtml).join('</li><li>') + '</li></ul>';
      btn.disabled = true;
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>]/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;';
    });
  }

  // ---- Deck-Liste (Reihenfolge + Dateinamen) ----------------------------
  function deckCardIds() {
    var ids = [];
    COLORS.forEach(function (c) {
      NUMBERS.forEach(function (n) { ids.push(c.key + n); });
    });
    for (var i = 1; i <= 4; i++) ids.push('Z' + i);
    for (var j = 1; j <= 4; j++) ids.push('N' + j);
    return ids; // 52 + 8 = 60
  }

  // ---- Deck generieren --------------------------------------------------
  var generating = false;
  function generateDeck() {
    if (generating) return;
    if (missingItems().length) { updateValidation(); return; }
    generating = true;

    var btn = $('generateBtn');
    btn.disabled = true;
    var progressWrap = $('progressWrap');
    var progressFill = $('progressFill');
    var progressLabel = $('progressLabel');
    progressWrap.hidden = false;

    var W = settings.outWidth;
    var H = outHeightFor(W);
    var work = document.createElement('canvas');
    work.width = W; work.height = H;

    var ids = deckCardIds();
    var files = [];   // { name, data:Uint8Array }
    var oversized = [];
    var i = 0;

    function step() {
      if (i >= ids.length) return finish();
      var id = ids[i];
      renderCard(work, id);
      work.toBlob(function (blob) {
        blob.arrayBuffer().then(function (buf) {
          var data = new Uint8Array(buf);
          if (data.length > 500 * 1024) oversized.push(id);
          files.push({ name: id + '.png', data: data });
          i++;
          var frac = i / ids.length;
          progressFill.style.width = Math.round(frac * 100) + '%';
          progressLabel.textContent = i + ' / ' + ids.length + ' Karten';
          setTimeout(step, 0);   // UI atmen lassen
        });
      }, 'image/png');
    }

    function finish() {
      progressLabel.textContent = 'ZIP wird gepackt …';
      var zip = createZip(files);
      var url = URL.createObjectURL(new Blob([zip], { type: 'application/zip' }));
      var link = $('downloadLink');
      link.href = url;
      link.download = 'wizard-deck.zip';
      link.hidden = false;
      link.click();

      var note = '✓ 60 Karten erzeugt · ZIP heruntergeladen (wizard-deck.zip)';
      if (oversized.length) {
        note += ' · ⚠ ' + oversized.length + ' Karte(n) über 500 KB (' +
          oversized.join(', ') + ') – ggf. Ausgabe-Breite reduzieren.';
      }
      progressLabel.textContent = note;
      progressFill.style.width = '100%';
      btn.disabled = false;
      generating = false;
    }

    step();
  }

  // ---- Minimaler ZIP-Writer (STORE / unkomprimiert) ---------------------
  // PNGs sind bereits komprimiert -> "store" ist ausreichend und einfach.
  var CRC_TABLE = (function () {
    var table = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) {
      crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function strBytes(s) {
    var out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xFF;
    return out;
  }

  function createZip(files) {
    // Fester Zeitstempel (keine Date.now-Abhängigkeit nötig, deterministisch).
    var dosTime = 0, dosDate = 0x21 /* 1980-01-01 */;
    var localParts = [];
    var central = [];
    var offset = 0;

    files.forEach(function (f) {
      var nameBytes = strBytes(f.name);
      var crc = crc32(f.data);
      var size = f.data.length;

      var lfh = new Uint8Array(30 + nameBytes.length);
      var dv = new DataView(lfh.buffer);
      dv.setUint32(0, 0x04034b50, true);   // local file header signature
      dv.setUint16(4, 20, true);           // version needed
      dv.setUint16(6, 0, true);            // flags
      dv.setUint16(8, 0, true);            // method 0 = store
      dv.setUint16(10, dosTime, true);
      dv.setUint16(12, dosDate, true);
      dv.setUint32(14, crc, true);
      dv.setUint32(18, size, true);        // compressed size
      dv.setUint32(22, size, true);        // uncompressed size
      dv.setUint16(26, nameBytes.length, true);
      dv.setUint16(28, 0, true);           // extra length
      lfh.set(nameBytes, 30);

      localParts.push(lfh, f.data);

      var cdh = new Uint8Array(46 + nameBytes.length);
      var cv = new DataView(cdh.buffer);
      cv.setUint32(0, 0x02014b50, true);   // central dir header signature
      cv.setUint16(4, 20, true);           // version made by
      cv.setUint16(6, 20, true);           // version needed
      cv.setUint16(8, 0, true);
      cv.setUint16(10, 0, true);           // method store
      cv.setUint16(12, dosTime, true);
      cv.setUint16(14, dosDate, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, size, true);
      cv.setUint32(24, size, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);           // extra
      cv.setUint16(32, 0, true);           // comment
      cv.setUint16(34, 0, true);           // disk number
      cv.setUint16(36, 0, true);           // internal attrs
      cv.setUint32(38, 0, true);           // external attrs
      cv.setUint32(42, offset, true);      // local header offset
      cdh.set(nameBytes, 46);
      central.push(cdh);

      offset += lfh.length + size;
    });

    var centralSize = central.reduce(function (a, c) { return a + c.length; }, 0);
    var eocd = new Uint8Array(22);
    var ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);     // EOCD signature
    ev.setUint16(4, 0, true);              // disk number
    ev.setUint16(6, 0, true);              // start disk
    ev.setUint16(8, files.length, true);   // entries this disk
    ev.setUint16(10, files.length, true);  // total entries
    ev.setUint32(12, centralSize, true);   // central dir size
    ev.setUint32(16, offset, true);        // central dir offset
    ev.setUint16(20, 0, true);             // comment length

    var totalLocal = localParts.reduce(function (a, p) { return a + p.length; }, 0);
    var out = new Uint8Array(totalLocal + centralSize + eocd.length);
    var pos = 0;
    localParts.forEach(function (p) { out.set(p, pos); pos += p.length; });
    central.forEach(function (p) { out.set(p, pos); pos += p.length; });
    out.set(eocd, pos);
    return out;
  }

  // ---- Init -------------------------------------------------------------
  function init() {
    buildSlots();
    buildPreviewOptions();
    bindControls();
    syncControlsFromSettings();
    refreshAll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Für Tests / externe Nutzung zugänglich machen.
  window.__wizard = {
    createZip: createZip,
    crc32: crc32,
    deckCardIds: deckCardIds,
    renderCard: renderCard,
    outHeightFor: outHeightFor,
    sliceSheet: sliceSheet,
    sliceCount: function () { return Object.keys(imgs.sheetSlices).length; },
    settings: function () { return settings; }
  };
})();

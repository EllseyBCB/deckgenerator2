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
    numbers: {},                     // 1..13
    Z: null,
    N: null
  };
  NUMBERS.forEach(function (n) { imgs.numbers[n] = null; });

  var defaults = {
    centerOn: true,
    centerScale: 0.55,               // Anteil der Kartenhöhe
    centerX: 0,                      // Anteil der Breite
    centerY: 0,                      // Anteil der Höhe
    cornerMode: 4,                   // 0 | 2 | 4
    cornerScale: 0.15,               // Basis-Ecken-Größe (pro Karte überschreibbar)
    cornerInsetTop: 0.04,            // Abstand der oberen Ecken vom oberen Rand (Anteil H)
    cornerInsetBottom: 0.04,         // Abstand der unteren Ecken vom unteren Rand (Anteil H)
    cornerInsetSide: 0.05,           // seitlicher Abstand aller Ecken (außen↔innen, Anteil W)
    cardLayout: {},                  // Pro-Karte-Overrides der Zahl-Positionen (id -> {prop:val})
    imgFit: {},                      // Bild-Anpassung pro Motiv R/Y/G/B/Z/N (unten gefüllt)
    outWidth: 660
  };
  ['R','Y','G','B','Z','N'].forEach(function (k) { defaults.imgFit[k] = { scaleX: 1, scaleY: 1, ox: 0, oy: 0 }; });
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
    placeholder.innerHTML =
      '<div class="up-badge">+</div>' +
      '<div class="label">' + opts.label + '</div>' +
      '<div class="sublabel">' + (opts.sublabel ? opts.sublabel + ' · ' : '') + 'Bild hochladen</div>';

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

  // ID der aktuell in der Vorschau gewählten Karte (z. B. "R7").
  function currentCardId() { return previewSelect.value || 'R7'; }

  // Zahl-Layout einer Karte: Pro-Karte-Override über globalem Basiswert.
  function layoutFor(id) {
    var o = (settings.cardLayout && settings.cardLayout[id]) || {};
    function g(p, base) { return (o[p] !== undefined && o[p] !== null) ? o[p] : base; }
    return {
      centerOn: g('centerOn', settings.centerOn),
      centerScale: g('centerScale', settings.centerScale),
      centerX: g('centerX', settings.centerX),
      centerY: g('centerY', settings.centerY),
      cornerMode: g('cornerMode', settings.cornerMode),
      cornerScale: g('cornerScale', settings.cornerScale),
      cornerInsetTop: g('cornerInsetTop', settings.cornerInsetTop),
      cornerInsetBottom: g('cornerInsetBottom', settings.cornerInsetBottom),
      cornerInsetSide: g('cornerInsetSide', settings.cornerInsetSide)
    };
  }

  // Einen Layout-Wert NUR für die aktuell gewählte Karte setzen.
  function setLayout(prop, val) {
    var id = currentCardId();
    if (!settings.cardLayout) settings.cardLayout = {};
    if (!settings.cardLayout[id]) settings.cardLayout[id] = {};
    settings.cardLayout[id][prop] = val;
  }

  // Motiv-Schlüssel der aktuellen Karte (Farbe R/Y/G/B bzw. Z/N).
  function currentDesignKey() {
    var spec = parseCardId(previewSelect.value || 'R7');
    return spec.type === 'special' ? spec.kind : spec.color;
  }

  function fitFor(key) {
    var f = (settings.imgFit && settings.imgFit[key]) || {};
    // Abwärtskompatibel: altes einzelnes "scale" -> Breite & Höhe gleich.
    var sx = (typeof f.scaleX === 'number') ? f.scaleX : (typeof f.scale === 'number' ? f.scale : 1);
    var sy = (typeof f.scaleY === 'number') ? f.scaleY : (typeof f.scale === 'number' ? f.scale : 1);
    return { scaleX: sx, scaleY: sy, ox: f.ox || 0, oy: f.oy || 0 };
  }

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  // ---- Zeichnen ---------------------------------------------------------
  // "cover": Bild mittig so skalieren/zuschneiden, dass es dw×dh KOMPLETT füllt
  // (kein Rand). Garantiert Design an allen 4 Kanten.
  function drawCover(ctx, img, dx, dy, dw, dh, fit) {
    var iw = img.naturalWidth || img.width;
    var ih = img.naturalHeight || img.height;
    if (!iw || !ih) return;
    var f = fit || {};
    var sx = f.scaleX || 1, sy = f.scaleY || 1;        // Breite/Höhe getrennt
    var ox = f.ox || 0, oy = f.oy || 0;
    var cover = Math.max(dw / iw, dh / ih);             // Basis: randfüllend (100 %)
    var destW = iw * cover * sx;                        // Zielgröße auf der Karte
    var destH = ih * cover * sy;
    var destX = dx + (dw - destW) / 2 + ox * dw / 2;    // zentriert + Verschiebung
    var destY = dy + (dh - destH) / 2 + oy * dh / 2;
    // Auf die Kartenfläche beschneiden (Überstand wird abgeschnitten,
    // bei Verkleinerung bleiben die Ränder transparent).
    ctx.save();
    ctx.beginPath();
    ctx.rect(dx, dy, dw, dh);
    ctx.clip();
    ctx.drawImage(img, destX, destY, destW, destH);
    ctx.restore();
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
      if (simg) drawCover(ctx, simg, 0, 0, W, H, fitFor(spec.kind));
      else drawMissingBg(ctx, W, H, spec.kind === 'Z' ? 'Zauberer fehlt' : 'Narr fehlt');
      return;
    }

    // Zahlkarte: Farbhintergrund + Zahl
    var bg = imgs.colors[spec.color];
    if (bg) drawCover(ctx, bg, 0, 0, W, H, fitFor(spec.color));
    else {
      var col = COLORS.filter(function (c) { return c.key === spec.color; })[0];
      ctx.fillStyle = col ? col.css : '#444';
      ctx.fillRect(0, 0, W, H);
    }

    var L = layoutFor(id);           // Zahl-Layout dieser Karte (mit Pro-Karte-Overrides)

    var num = imgs.numbers[spec.num];
    if (!num) {
      // Platzhalter-Zahl, damit die Vorschau auch ohne Upload etwas zeigt.
      drawPlaceholderNumber(ctx, W, H, spec.num, L);
      return;
    }

    // Mittige Zahl
    if (L.centerOn) {
      var targetH = L.centerScale * H;
      var cx = W / 2 + L.centerX * W;
      var cy = H / 2 + L.centerY * H;
      drawGlyph(ctx, num, cx, cy, targetH, 0);
    }

    // Ecken-Zahlen
    if (L.cornerMode === 2 || L.cornerMode === 4) {
      var ch = L.cornerScale * H;
      var cw = ch * ((num.naturalWidth || num.width) / (num.naturalHeight || num.height));
      var insetSide = L.cornerInsetSide * W;      // seitlicher Abstand (außen↔innen)
      var insetTop = L.cornerInsetTop * H;        // Abstand obere Ecken vom oberen Rand
      var insetBottom = L.cornerInsetBottom * H;  // Abstand untere Ecken vom unteren Rand

      // Alle Ecken-Zahlen stehen aufrecht (nie kopfüber).
      var tl = { x: insetSide + cw / 2, y: insetTop + ch / 2 };
      var br = { x: W - insetSide - cw / 2, y: H - insetBottom - ch / 2 };
      var tr = { x: W - insetSide - cw / 2, y: insetTop + ch / 2 };
      var bl = { x: insetSide + cw / 2, y: H - insetBottom - ch / 2 };

      var corners = L.cornerMode === 2 ? [tl, br] : [tl, tr, bl, br];
      corners.forEach(function (p) { drawGlyph(ctx, num, p.x, p.y, ch, 0); });
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

  function drawPlaceholderNumber(ctx, W, H, n, L) {
    L = L || layoutFor(currentCardId());
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = 'bold ' + Math.round(H * L.centerScale) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(n), W / 2 + L.centerX * W, H / 2 + L.centerY * H);
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
    syncLayoutControls();
    syncFitControls();
  }

  // Bild-Anpassungs-Regler (Zoom/X/Y) auf das aktuelle Motiv spiegeln.
  function syncFitControls() {
    var key = currentDesignKey();
    var f = fitFor(key);
    var w = $('fitW'), h = $('fitH'), fx = $('fitX'), fy = $('fitY'), tag = $('fitFor');
    if (w) { w.value = f.scaleX; var wo = $('fitWOut'); if (wo) wo.textContent = Math.round(f.scaleX * 100) + '%'; }
    if (h) { h.value = f.scaleY; var ho = $('fitHOut'); if (ho) ho.textContent = Math.round(f.scaleY * 100) + '%'; }
    if (fx) fx.value = f.ox;
    if (fy) fy.value = f.oy;
    if (tag) {
      var names = { R: 'Rot', Y: 'Gelb', G: 'Grün', B: 'Blau', Z: 'Zauberer', N: 'Narr' };
      tag.textContent = '(' + (names[key] || key) + ')';
    }
  }

  // Alle Zahl-Layout-Regler auf die aktuell gewählte Karte spiegeln.
  function syncLayoutControls() {
    var L = layoutFor(currentCardId());
    var setR = function (id, v) {
      var el = $(id), o = $(id + 'Out');
      if (el) el.value = v;
      if (o) o.textContent = pct(v);
    };
    setR('centerScale', L.centerScale);
    setR('centerX', L.centerX);
    setR('centerY', L.centerY);
    setR('cornerScale', L.cornerScale);
    setR('cornerInsetTop', L.cornerInsetTop);
    setR('cornerInsetBottom', L.cornerInsetBottom);
    setR('cornerInsetSide', L.cornerInsetSide);
    var co = $('centerOn'); if (co) co.checked = L.centerOn;
    var cm = $('cornerMode'); if (cm) cm.value = String(L.cornerMode);
    var tag = $('layoutForCard');
    if (tag) {
      var spec = parseCardId(currentCardId());
      if (spec.type === 'special') tag.textContent = (spec.kind === 'Z' ? 'Zauberer' : 'Narr');
      else { var names = { R: 'Rot', Y: 'Gelb', G: 'Grün', B: 'Blau' }; tag.textContent = names[spec.color] + ' ' + spec.num; }
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

  function bindControls() {
    // Alle Zahl-Layout-Regler gelten NUR für die aktuell gewählte Karte.
    function bindLayoutRange(elId, prop) {
      var el = $(elId), out = $(elId + 'Out');
      if (!el) return;
      el.addEventListener('input', function () {
        var v = parseFloat(el.value);
        setLayout(prop, v);
        if (out) out.textContent = pct(v);
        saveSettings();
        updatePreview();
      });
    }
    bindLayoutRange('centerScale', 'centerScale');
    bindLayoutRange('centerX', 'centerX');
    bindLayoutRange('centerY', 'centerY');
    bindLayoutRange('cornerScale', 'cornerScale');
    bindLayoutRange('cornerInsetTop', 'cornerInsetTop');
    bindLayoutRange('cornerInsetBottom', 'cornerInsetBottom');
    bindLayoutRange('cornerInsetSide', 'cornerInsetSide');

    var centerOnEl = $('centerOn');
    if (centerOnEl) centerOnEl.addEventListener('change', function () {
      setLayout('centerOn', centerOnEl.checked); saveSettings(); updatePreview();
    });
    var cornerModeEl = $('cornerMode');
    if (cornerModeEl) cornerModeEl.addEventListener('change', function () {
      setLayout('cornerMode', parseInt(cornerModeEl.value, 10)); saveSettings(); updatePreview();
    });

    // Aktuelles Karten-Layout auf ALLE Zahlkarten übernehmen.
    var applyAll = $('layoutApplyAll');
    if (applyAll) applyAll.addEventListener('click', function () {
      var L = layoutFor(currentCardId());
      if (!settings.cardLayout) settings.cardLayout = {};
      COLORS.forEach(function (c) {
        NUMBERS.forEach(function (n) {
          settings.cardLayout[c.key + n] = {
            centerOn: L.centerOn, centerScale: L.centerScale, centerX: L.centerX, centerY: L.centerY,
            cornerMode: L.cornerMode, cornerScale: L.cornerScale,
            cornerInsetTop: L.cornerInsetTop, cornerInsetBottom: L.cornerInsetBottom, cornerInsetSide: L.cornerInsetSide
          };
        });
      });
      saveSettings();
      updatePreview();
    });
    // Nur diese Karte auf die globalen Standardwerte zurücksetzen.
    var resetCard = $('layoutResetCard');
    if (resetCard) resetCard.addEventListener('click', function () {
      if (settings.cardLayout) delete settings.cardLayout[currentCardId()];
      saveSettings();
      updatePreview();
    });

    // ---- Bild-Anpassung (Breite/Höhe/Ziehen) pro Motiv ----
    function setFit(prop, val) {
      var key = currentDesignKey();
      if (!settings.imgFit) settings.imgFit = {};
      if (!settings.imgFit[key]) settings.imgFit[key] = { scaleX: 1, scaleY: 1, ox: 0, oy: 0 };
      settings.imgFit[key][prop] = val;
    }
    var fitW = $('fitW'), fitH = $('fitH'), fitX = $('fitX'), fitY = $('fitY');
    if (fitW) fitW.addEventListener('input', function () {
      setFit('scaleX', clamp(parseFloat(fitW.value), 0.5, 3));
      var o = $('fitWOut'); if (o) o.textContent = Math.round(fitFor(currentDesignKey()).scaleX * 100) + '%';
      saveSettings(); updatePreview();
    });
    if (fitH) fitH.addEventListener('input', function () {
      setFit('scaleY', clamp(parseFloat(fitH.value), 0.5, 3));
      var o = $('fitHOut'); if (o) o.textContent = Math.round(fitFor(currentDesignKey()).scaleY * 100) + '%';
      saveSettings(); updatePreview();
    });
    if (fitX) fitX.addEventListener('input', function () { setFit('ox', clamp(parseFloat(fitX.value), -1, 1)); saveSettings(); updatePreview(); });
    if (fitY) fitY.addEventListener('input', function () { setFit('oy', clamp(parseFloat(fitY.value), -1, 1)); saveSettings(); updatePreview(); });
    var fitReset = $('fitReset');
    if (fitReset) fitReset.addEventListener('click', function () {
      if (!settings.imgFit) settings.imgFit = {};
      settings.imgFit[currentDesignKey()] = { scaleX: 1, scaleY: 1, ox: 0, oy: 0 };
      saveSettings(); updatePreview();
    });

    // Ziehen + Mausrad-Zoom direkt auf der Vorschau.
    if (previewCanvas) {
      var dragging = false, lastX = 0, lastY = 0;
      previewCanvas.addEventListener('pointerdown', function (e) {
        dragging = true; lastX = e.clientX; lastY = e.clientY;
        try { previewCanvas.setPointerCapture(e.pointerId); } catch (x) {}
        previewCanvas.classList.add('grabbing');
      });
      previewCanvas.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        var rect = previewCanvas.getBoundingClientRect();
        var fdx = (e.clientX - lastX) / rect.width;
        var fdy = (e.clientY - lastY) / rect.height;
        lastX = e.clientX; lastY = e.clientY;
        var f = fitFor(currentDesignKey());
        setFit('ox', clamp((f.ox || 0) - fdx * 2, -1, 1)); // Bild folgt dem Cursor
        setFit('oy', clamp((f.oy || 0) - fdy * 2, -1, 1));
        updatePreview();
      });
      var endDrag = function (e) {
        if (!dragging) return;
        dragging = false; previewCanvas.classList.remove('grabbing');
        try { previewCanvas.releasePointerCapture(e.pointerId); } catch (x) {}
        saveSettings();
      };
      previewCanvas.addEventListener('pointerup', endDrag);
      previewCanvas.addEventListener('pointercancel', endDrag);
      previewCanvas.addEventListener('wheel', function (e) {
        e.preventDefault();
        var f = fitFor(currentDesignKey());
        var d = (e.deltaY < 0 ? 0.05 : -0.05);       // Mausrad zoomt Breite+Höhe zusammen
        setFit('scaleX', clamp(f.scaleX + d, 0.5, 3));
        setFit('scaleY', clamp(f.scaleY + d, 0.5, 3));
        saveSettings(); updatePreview();
      }, { passive: false });
    }

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
      refreshAll();
    });

    $('generateBtn').addEventListener('click', generateDeck);
  }

  function syncControlsFromSettings() {
    syncLayoutControls();            // alle Zahl-Layout-Regler (pro aktueller Karte)
    var outWidth = $('outWidth');
    if (outWidth) outWidth.value = settings.outWidth;
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
    var missingNums = NUMBERS.filter(function (n) { return !imgs.numbers[n]; });
    if (missingNums.length) missing.push('Zahl(en): ' + missingNums.join(', '));
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

  // ================= Modus 2: Karten aus einem Bild zuschneiden ==========
  var cropImg = null;
  var cropFrame = { fx: 0.02, fy: 0.02, fw: 0.96, fh: 0.96 };
  var cropView = { scale: 1, dw: 0, dh: 0 };

  function cloneFrame(f) { return { fx: f.fx, fy: f.fy, fw: f.fw, fh: f.fh }; }
  function cropColsVal() { return Math.max(1, Math.min(20, parseInt($('cropCols').value, 10) || 1)); }
  function cropRowsVal() { return Math.max(1, Math.min(20, parseInt($('cropRows').value, 10) || 1)); }
  function cropFmtVal() { var el = document.querySelector('input[name="cropFmt"]:checked'); return el ? el.value : 'wizard'; }

  function cropTargetSize() {
    var tw = Math.max(10, Math.min(4000, parseInt($('cropW').value, 10) || 660));
    var th;
    if (cropFmtVal() === 'wizard') th = Math.round(tw * ASPECT_H / ASPECT_W);
    else th = Math.max(10, Math.min(4000, parseInt($('cropH').value, 10) || 1000));
    return { tw: tw, th: th };
  }

  function drawCropOverlay() {
    var canvas = $('cropCanvas'); if (!canvas) return;
    if (!cropImg) { canvas.width = 0; canvas.height = 0; return; }
    var iw = cropImg.naturalWidth || cropImg.width, ih = cropImg.naturalHeight || cropImg.height;
    var scale = Math.min(560 / iw, 620 / ih, 1);
    var dw = Math.max(1, Math.round(iw * scale)), dh = Math.max(1, Math.round(ih * scale));
    cropView = { scale: scale, dw: dw, dh: dh };
    canvas.width = dw; canvas.height = dh;
    var c = canvas.getContext('2d');
    c.clearRect(0, 0, dw, dh);
    c.drawImage(cropImg, 0, 0, dw, dh);
    var fx = cropFrame.fx * dw, fy = cropFrame.fy * dh, fw = cropFrame.fw * dw, fh = cropFrame.fh * dh;
    c.fillStyle = 'rgba(0,0,0,0.45)';                  // außerhalb abdunkeln
    c.fillRect(0, 0, dw, fy);
    c.fillRect(0, fy + fh, dw, dh - (fy + fh));
    c.fillRect(0, fy, fx, fh);
    c.fillRect(fx + fw, fy, dw - (fx + fw), fh);
    c.strokeStyle = 'rgba(124,92,255,0.95)'; c.lineWidth = 2;
    c.strokeRect(fx, fy, fw, fh);
    c.lineWidth = 1; c.strokeStyle = 'rgba(124,92,255,0.55)';
    var cols = cropColsVal(), rows = cropRowsVal(), i, x, y;
    for (i = 1; i < cols; i++) { x = fx + fw * i / cols; c.beginPath(); c.moveTo(x, fy); c.lineTo(x, fy + fh); c.stroke(); }
    for (i = 1; i < rows; i++) { y = fy + fh * i / rows; c.beginPath(); c.moveTo(fx, y); c.lineTo(fx + fw, y); c.stroke(); }
    c.fillStyle = '#7c5cff';
    var pts = [[fx, fy], [fx + fw, fy], [fx, fy + fh], [fx + fw, fy + fh]];
    for (i = 0; i < 4; i++) c.fillRect(pts[i][0] - 5, pts[i][1] - 5, 10, 10);
  }

  function cropCornerPts() {
    var dw = cropView.dw, dh = cropView.dh;
    return [
      [cropFrame.fx * dw, cropFrame.fy * dh],
      [(cropFrame.fx + cropFrame.fw) * dw, cropFrame.fy * dh],
      [cropFrame.fx * dw, (cropFrame.fy + cropFrame.fh) * dh],
      [(cropFrame.fx + cropFrame.fw) * dw, (cropFrame.fy + cropFrame.fh) * dh]
    ];
  }

  function updateCropValidation() {
    var box = $('cropValidation'), btn = $('cropBtn');
    if (!box) return;
    if (cropImg) {
      box.innerHTML = '<span class="ok">✓ Bild geladen – ' + (cropColsVal() * cropRowsVal()) + ' Karte(n) im Raster.</span>';
      if (btn) btn.disabled = false;
    } else {
      box.innerHTML = '<span class="missing">Bitte ein Bild mit Karten hochladen.</span>';
      if (btn) btn.disabled = true;
    }
  }

  function updateCropSizeNote() {
    var s = cropTargetSize(), note = $('cropSizeNote');
    if (note) note.textContent = 'Je Karte: ' + s.tw + '×' + s.th + ' px' + (cropFmtVal() === 'wizard' ? ' (33:50)' : '');
  }

  function applyCropFmt() {
    var wrap = $('cropHWrap');
    if (wrap) wrap.style.display = (cropFmtVal() === 'wizard') ? 'none' : '';
    updateCropSizeNote();
  }

  // Quell-Ausschnitt "cover" in Zielgröße zeichnen (kein Rand, kein Verzerren).
  function coverRect(ctx, img, sx, sy, sw, sh, dw, dh) {
    var scale = Math.max(dw / sw, dh / sh);
    var cw = dw / scale, ch = dh / scale;
    var cx = sx + (sw - cw) / 2, cy = sy + (sh - ch) / 2;
    ctx.drawImage(img, cx, cy, cw, ch, 0, 0, dw, dh);
  }

  function cropInit() {
    if (!$('cropCanvas')) return;
    makeSlot($('cropSlot'), {
      label: 'Karten-Bild', sublabel: 'ein Bild mit mehreren Karten',
      onLoad: function (img) { cropImg = img; cropFrame = { fx: 0.02, fy: 0.02, fw: 0.96, fh: 0.96 }; drawCropOverlay(); updateCropValidation(); },
      onClear: function () { cropImg = null; drawCropOverlay(); updateCropValidation(); }
    });

    ['cropCols', 'cropRows'].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener('input', function () { drawCropOverlay(); updateCropValidation(); });
    });
    Array.prototype.forEach.call(document.getElementsByName('cropFmt'), function (r) { r.addEventListener('change', applyCropFmt); });
    var cwEl = $('cropW'); if (cwEl) cwEl.addEventListener('input', updateCropSizeNote);
    var chEl = $('cropH'); if (chEl) chEl.addEventListener('input', updateCropSizeNote);
    var reset = $('cropReset'); if (reset) reset.addEventListener('click', function () { cropFrame = { fx: 0.02, fy: 0.02, fw: 0.96, fh: 0.96 }; drawCropOverlay(); });
    var btn = $('cropBtn'); if (btn) btn.addEventListener('click', doCrop);

    // Rahmen ziehen: innen = bewegen, Ecken = Größe ändern.
    var canvas = $('cropCanvas');
    var mode = null, startPt = null, startFrame = null;
    function toCanvas(e) { var r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * (canvas.width / r.width), y: (e.clientY - r.top) * (canvas.height / r.height) }; }
    canvas.addEventListener('pointerdown', function (e) {
      if (!cropImg) return;
      var p = toCanvas(e), pts = cropCornerPts(), i;
      mode = null;
      for (i = 0; i < 4; i++) { if (Math.abs(p.x - pts[i][0]) < 13 && Math.abs(p.y - pts[i][1]) < 13) { mode = 'c' + i; break; } }
      if (!mode) {
        var dw = cropView.dw, dh = cropView.dh;
        var fx = cropFrame.fx * dw, fy = cropFrame.fy * dh, fw = cropFrame.fw * dw, fh = cropFrame.fh * dh;
        if (p.x >= fx && p.x <= fx + fw && p.y >= fy && p.y <= fy + fh) mode = 'move';
      }
      if (mode) { startPt = p; startFrame = cloneFrame(cropFrame); try { canvas.setPointerCapture(e.pointerId); } catch (x) {} }
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!mode) return;
      var p = toCanvas(e), dw = cropView.dw, dh = cropView.dh;
      var dx = (p.x - startPt.x) / dw, dy = (p.y - startPt.y) / dh;
      var f = cloneFrame(startFrame);
      var left = startFrame.fx, top = startFrame.fy, right = startFrame.fx + startFrame.fw, bottom = startFrame.fy + startFrame.fh;
      var MIN = 0.03;
      if (mode === 'move') {
        f.fx = clamp(startFrame.fx + dx, 0, 1 - startFrame.fw);
        f.fy = clamp(startFrame.fy + dy, 0, 1 - startFrame.fh);
      } else if (mode === 'c0') { var nx = clamp(left + dx, 0, right - MIN), ny = clamp(top + dy, 0, bottom - MIN); f.fx = nx; f.fy = ny; f.fw = right - nx; f.fh = bottom - ny; }
      else if (mode === 'c1') { var nr = clamp(right + dx, left + MIN, 1), ny1 = clamp(top + dy, 0, bottom - MIN); f.fx = left; f.fy = ny1; f.fw = nr - left; f.fh = bottom - ny1; }
      else if (mode === 'c2') { var nx2 = clamp(left + dx, 0, right - MIN), nb = clamp(bottom + dy, top + MIN, 1); f.fx = nx2; f.fy = top; f.fw = right - nx2; f.fh = nb - top; }
      else if (mode === 'c3') { var nr3 = clamp(right + dx, left + MIN, 1), nb3 = clamp(bottom + dy, top + MIN, 1); f.fx = left; f.fy = top; f.fw = nr3 - left; f.fh = nb3 - top; }
      cropFrame = f; drawCropOverlay();
    });
    function endDrag(e) { if (mode) { mode = null; try { canvas.releasePointerCapture(e.pointerId); } catch (x) {} } }
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    applyCropFmt();
    drawCropOverlay();
    updateCropValidation();
  }

  var cropping = false;
  function doCrop() {
    if (cropping || !cropImg) return;
    cropping = true;
    var btn = $('cropBtn'); if (btn) btn.disabled = true;
    var prog = $('cropProgress'), fill = $('cropFill'), label = $('cropLabel');
    if (prog) prog.hidden = false;

    var iw = cropImg.naturalWidth || cropImg.width, ih = cropImg.naturalHeight || cropImg.height;
    var cols = cropColsVal(), rows = cropRowsVal();
    var size = cropTargetSize(), tw = size.tw, th = size.th;
    var prefix = (($('cropPrefix').value || 'karte').replace(/[^A-Za-z0-9_\-]/g, '') || 'karte');
    var work = document.createElement('canvas'); work.width = tw; work.height = th;
    var wctx = work.getContext('2d'); wctx.imageSmoothingEnabled = true; wctx.imageSmoothingQuality = 'high';

    var cells = [];
    for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) cells.push({ r: r, c: c });
    var files = [], i = 0;

    function stepCell() {
      if (i >= cells.length) return finishCrop();
      var cell = cells[i];
      var cellX = (cropFrame.fx + cell.c * cropFrame.fw / cols) * iw;
      var cellY = (cropFrame.fy + cell.r * cropFrame.fh / rows) * ih;
      var cellW = (cropFrame.fw / cols) * iw, cellH = (cropFrame.fh / rows) * ih;
      wctx.clearRect(0, 0, tw, th);
      coverRect(wctx, cropImg, cellX, cellY, cellW, cellH, tw, th);
      work.toBlob(function (blob) {
        blob.arrayBuffer().then(function (buf) {
          files.push({ name: prefix + '-' + (i + 1) + '.png', data: new Uint8Array(buf) });
          i++;
          if (fill) fill.style.width = Math.round(i / cells.length * 100) + '%';
          if (label) label.textContent = i + ' / ' + cells.length + ' Karten';
          setTimeout(stepCell, 0);
        });
      }, 'image/png');
    }
    function finishCrop() {
      var zip = createZip(files);
      var url = URL.createObjectURL(new Blob([zip], { type: 'application/zip' }));
      var link = $('cropDownload');
      link.href = url; link.download = 'karten-zugeschnitten.zip'; link.hidden = false; link.click();
      if (label) label.textContent = '✓ ' + files.length + ' Karten zugeschnitten · ZIP heruntergeladen';
      if (fill) fill.style.width = '100%';
      if (btn) btn.disabled = false;
      cropping = false;
    }
    stepCell();
  }

  function showMode(which) {
    var d = $('modeDeck'), c = $('modeCrop');
    if (d) d.hidden = which !== 'deck';
    if (c) c.hidden = which !== 'crop';
    var td = $('tabDeck'), tc = $('tabCrop');
    if (td) td.classList.toggle('active', which === 'deck');
    if (tc) tc.classList.toggle('active', which === 'crop');
    if (which === 'crop') drawCropOverlay();
  }

  // ---- Init -------------------------------------------------------------
  // Jeder Schritt einzeln abgesichert: Selbst wenn ein Bedienelement fehlt
  // (z. B. veraltete HTML/JS-Mischung aus dem Browser-Cache), wird die
  // Vorschau am Ende in JEDEM Fall gezeichnet.
  function step(name, fn) {
    try { fn(); } catch (e) { if (window.console) console.error('[' + name + ']', e); }
  }

  function init() {
    step('buildSlots', buildSlots);
    step('buildPreviewOptions', buildPreviewOptions);
    step('bindControls', bindControls);
    step('syncControlsFromSettings', syncControlsFromSettings);
    step('refreshAll', refreshAll);
    step('updatePreview', updatePreview); // Sicherheitsnetz für die Vorschau
    step('cropInit', cropInit);           // Modus 2: Karten zuschneiden
    step('cropTabs', function () {
      var td = $('tabDeck'), tc = $('tabCrop');
      if (td) td.addEventListener('click', function () { showMode('deck'); });
      if (tc) tc.addEventListener('click', function () { showMode('crop'); });
    });
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
    settings: function () { return settings; }
  };
})();

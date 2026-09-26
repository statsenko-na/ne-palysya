'use strict';
// «Не пались» — базовый рендер: примитивы рисования, масштаб интерфейса, кадр draw() и цикл loop().
// Общие переменные и функции объявлены на верхнем уровне и видны из других скриптов игры (без обёртки и модулей).
// Порядок подключения — в index.html.

  // ---------- РЕНДЕР ----------
  function R(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
  function E(x, y, rx, ry, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill(); }
  function T(text, x, y, size, color, align = 'center', weight = 700, font = FONT) {
    ctx.font = `${weight} ${size}px ${font}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }
  // Текст, ужатый по ширине, чтобы не наезжал на соседние элементы HUD
  function TF(text, x, y, size, maxW, color, align = 'left', weight = 700) {
    ctx.font = `${weight} ${size}px ${FONT_SANS}`;
    const w = ctx.measureText(text).width;
    T(text, x, y, w > maxW ? size * maxW / w : size, color, align, weight, FONT_SANS);
  }
  // Текст с многоточием: не сжимает кегль, а обрезает хвост
  function TE(text, x, y, size, maxW, color, align = 'left', weight = 700) {
    ctx.font = `${weight} ${size}px ${FONT_SANS}`;
    let t = text;
    if (ctx.measureText(t).width > maxW) {
      while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
      t = `${t.trimEnd()}…`;
    }
    T(t, x, y, size, color, align, weight, FONT_SANS);
  }

  // ---------- МАСШТАБ ИНТЕРФЕЙСА ----------
  // Мир рисуется в 960×540 и масштабируется целиком, поэтому на ноутбуке и телефоне надписи выходили 5–7 px.
  // UI — множитель для всего текста поверх мира: основной кегль (8.5 ед.) даёт не меньше 12 px
  // (13 px на сенсорных экранах, +15% в режиме «Крупный текст»). Экранные элементы рисуются в UI-единицах
  // (ширина VW = W / k), подписи над персонажами масштабируются вокруг своей точки привязки.
  let UI = 1, unitPx = 1, bigText = !!store.get('bigText', false);
  const coarsePointer = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  function canvasBox() { // где игра реально нарисована внутри <canvas> (object-fit: contain)
    const r = canvas.getBoundingClientRect();
    const k = Math.min(r.width / W, r.height / H) || 1;
    const w = W * k, h = H * k;
    return { left: r.left + (r.width - w) / 2, top: r.top + (r.height - h) / 2, width: w, height: h, k };
  }
  function updateUiScale() {
    const b = canvasBox();
    if (b.height > 0) unitPx = b.k;
    const target = (coarsePointer ? 13 : 12) * (bigText ? 1.15 : 1);
    UI = Math.max(1, Math.min(2.4, target / (8.5 * unitPx)));
    document.documentElement.classList.toggle('text-lg', bigText);
  }
  const uiK = cap => Math.min(UI, cap);
  const compactHud = () => UI > 1.05;
  const hudScale = () => uiK(2.1);
  const hudBottom = () => (compactHud() ? Math.max(WD.HUD_H, HUDC_H * hudScale()) : WD.HUD_H);
  function uiSpace(k) { ctx.setTransform(S * k, 0, 0, S * k, 0, 0); return { VW: W / k, VH: H / k }; }
  // Нарисовать fn в локальных координатах, увеличенных в k раз вокруг точки (ax, ay)
  function around(ax, ay, k, fn) { ctx.save(); ctx.translate(ax, ay); ctx.scale(k, k); fn(); ctx.restore(); }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function dayProgress() { return clamp((clockMinutes - CFG.shiftStart) / (CFG.shiftEnd - CFG.shiftStart), 0, 1); }


  function draw() {
    ctx.setTransform(S, 0, 0, S, 0, 0);
    ctx.imageSmoothingEnabled = false;
    if (shake > 0) ctx.translate((rand() - 0.5) * shake * 8, (rand() - 0.5) * shake * 8);
    R(0, 0, W, H, '#10181b');
    drawWindows();
    ctx.drawImage(art.staticLayer, 0, 0, W, H);
    ctx.drawImage(art.windowOverlay, 0, 0, W, WD.FLOOR_TOP);
    drawWallClock(385, 72);
    drawSunbeams();
    drawZoneHints();
    drawVisionCone();
    drawCameras();
    drawScene();
    drawParticles();
    drawLighting();
    drawCameraBodies();
    drawDanger();
    drawOverheads();
    drawBubbles();
    ctx.setTransform(S, 0, 0, S, 0, 0);
    drawHUD();
    drawTutorial();
    drawObjective();
    drawAutoBadge();
    drawChoice();
    drawPhone();
    drawBanner();
    if (flash > 0) R(0, 0, W, H, `rgba(224,68,62,${flash * 0.35})`);
  }

  function loop(t) {
    const dt = Math.min(0.05, (t - last) / 1000 || 0);
    last = t;
    if (mode === 'playing') {
      // Скорость времени: подшаги, чтобы коллизии не «проскакивали» при ×2–×3
      const total = dt * timeScale;
      const n = Math.max(1, Math.ceil(timeScale));
      for (let i = 0; i < n && mode === 'playing'; i++) update(total / n);
    }
    else if (mode === 'menu') { updateBoss(dt); updateCoworkers(dt); updateAmbient(dt); bubbles.forEach(b => { b.t += dt; }); bubbles = bubbles.filter(b => b.t < b.dur); }
    draw();
    requestAnimationFrame(loop);
  }

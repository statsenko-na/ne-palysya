'use strict';
// «Не пались» — отрисовка, масштаб интерфейса, HUD, телефон, баннеры.
// Общие переменные и функции объявлены на верхнем уровне и видны из других скриптов игры (без обёртки и модулей).
// Порядок подключения — в index.html; см. docs/PLAN_SPLIT_GAME_JS.md.

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

  function drawWindows() {
    const p = dayProgress();
    const panes = art.windowPanes.concat([{ ...art.balconyView, src: 4 }]);
    for (const pane of panes) {
      if (ready(img.view)) {
        const sx = pane.src < 4 ? pane.src * 224 : 896;
        const sw = pane.src < 4 ? 224 : 304;
        ctx.drawImage(img.view, sx, 0, sw, 132, pane.x, pane.y, pane.w, pane.h);
      } else {
        R(pane.x, pane.y, pane.w, pane.h, '#6fa8c8');
      }
      // Время суток: утро — холодно, вечер — закат, потом сумерки с огнями
      let tint = null;
      if (p < 0.2) tint = `rgba(40,70,120,${0.25 - p})`;
      else if (p > 0.62 && p < 0.86) tint = `rgba(230,110,60,${(p - 0.62) * 1.4})`;
      else if (p >= 0.86) tint = `rgba(30,20,60,${0.35 + (p - 0.86) * 3})`;
      if (tint) { R(pane.x, pane.y, pane.w, pane.h, tint); }
      if (day.smog) R(pane.x, pane.y, pane.w, pane.h, 'rgba(150,140,120,0.62)'); // смог: горы в дымке
      if (p >= 0.8) {
        const a = clamp((p - 0.8) * 5, 0, 1);
        for (let i = 0; i < 16; i++) {
          const lx = pane.x + ((i * 37 + pane.x) % pane.w);
          const ly = pane.y + pane.h * 0.62 + ((i * 13) % (pane.h * 0.35));
          R(lx, ly, 1, 1, `rgba(255,220,130,${a * (0.5 + ((i * 7) % 5) / 10)})`);
        }
      }
    }
    // Проблесковый огонь на телебашне Кок-Тобе
    if (Math.floor(performance.now() / 600) % 2 === 0) R(art.balconyView.x + 123, art.balconyView.y + 1, 1.5, 1.5, '#ff3a2a');
  }

  function drawWallClock(cx, cy) {
    const m = clockMinutes;
    const ha = ((m / 60) % 12) / 12 * TAU - Math.PI / 2;
    const ma = (m % 60) / 60 * TAU - Math.PI / 2;
    ctx.strokeStyle = '#222'; ctx.lineCap = 'round';
    ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(ha) * 3.2, cy + Math.sin(ha) * 3.2); ctx.stroke();
    ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(ma) * 5, cy + Math.sin(ma) * 5); ctx.stroke();
    R(cx - 0.6, cy - 0.6, 1.2, 1.2, '#c02a2a');
  }

  function drawSunbeams() {
    const p = dayProgress();
    const strength = p < 0.75 ? 0.07 : Math.max(0, 0.07 - (p - 0.75) * 0.3);
    if (strength <= 0) return;
    const skew = -60 + p * 140;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const pane of art.windowPanes) {
      const grd = ctx.createLinearGradient(0, WD.FLOOR_TOP, 0, WD.FLOOR_TOP + 150);
      const warm = p > 0.6 ? '255,170,110' : '255,245,210';
      grd.addColorStop(0, `rgba(${warm},${strength})`);
      grd.addColorStop(1, `rgba(${warm},0)`);
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.moveTo(pane.x + 6, WD.FLOOR_TOP);
      ctx.lineTo(pane.x + pane.w - 6, WD.FLOOR_TOP);
      ctx.lineTo(pane.x + pane.w - 6 + skew, WD.FLOOR_TOP + 150);
      ctx.lineTo(pane.x + 6 + skew, WD.FLOOR_TOP + 150);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawZoneHints() {
    const info = mode === 'playing' ? getActionInfo() : null;
    const t = performance.now() / 1000;
    for (const z of WD.zones) {
      const active = info && info.target === z.id;
      if (!active && z.type === 'chat') continue;
      const a = active ? 0.8 + Math.sin(t * 6) * 0.2 : 0.18;
      const col = active ? `rgba(242,187,56,${a})` : `rgba(120,210,215,${a})`;
      const c = active ? 7 : 4;
      const th = active ? 1.5 : 1;
      for (const [cx, cy, sx, sy] of [[z.x, z.y, 1, 1], [z.x + z.w, z.y, -1, 1], [z.x, z.y + z.h, 1, -1], [z.x + z.w, z.y + z.h, -1, -1]]) {
        R(sx > 0 ? cx : cx - c, sy > 0 ? cy : cy - th, c, th, col);
        R(sx > 0 ? cx : cx - th, sy > 0 ? cy : cy - c, th, c, col);
      }
      if (z.id === 'desk' && active && player.action !== 'work') {
        const pulse = 0.55 + Math.sin(t * 6) * 0.35;
        ctx.strokeStyle = `rgba(242,187,56,${pulse})`;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(SEAT.x - 12.5, SEAT.y - 12.5, 25, 20);
        R(SEAT.x - 12, SEAT.y - 12, 24, 19, `rgba(242,187,56,${pulse * 0.22})`);
        if (player.y > WD.ROW1_Y) {
          const fx = WD.playerDesk.x, fy = WD.ROW1_Y + WD.DESK_DEPTH, fw = WD.playerDesk.w, fh = 26;
          for (const [cx, cy, sx, sy] of [[fx, fy, 1, 1], [fx + fw, fy, -1, 1], [fx, fy + fh, 1, -1], [fx + fw, fy + fh, -1, -1]]) {
            R(sx > 0 ? cx : cx - 7, sy > 0 ? cy : cy - 1.5, 7, 1.5, `rgba(242,187,56,${a})`);
            R(sx > 0 ? cx : cx - 1.5, sy > 0 ? cy : cy - 7, 1.5, 7, `rgba(242,187,56,${a})`);
          }
        }
      }
    }
    if (eventIs('food') && !officeEvent.used) {
      const a = 0.5 + Math.sin(t * 5) * 0.3;
      ctx.strokeStyle = `rgba(242,187,56,${a})`; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(120, 212, 50, 30, 0, 0, TAU); ctx.stroke();
    }
    for (const p of WD.plants) {
      const active = info && info.target === p.id;
      ctx.strokeStyle = active ? `rgba(120,230,130,${0.7 + Math.sin(t * 6) * 0.3})` : 'rgba(120,230,130,0.16)';
      ctx.lineWidth = active ? 1.5 : 1;
      ctx.beginPath(); ctx.ellipse(p.x, p.y + 2, 16, 6, 0, 0, TAU); ctx.stroke();
    }
  }

  function drawVisionCone() {
    if (mode === 'menu' || boss.state === 'office') return;
    if (boss.state === 'gone' || boss.state === 'leaving' || boss.state === 'out' || boss.state === 'goout') return;
    const range = (boss.state === 'inspect' ? CFG.visionRangeInspect : CFG.visionRange) * (today().visionMul || 1) * diff().vision * (eventIs('arrfr') ? 1.2 : 1);
    const alert = boss.state === 'inspect' || boss.state === 'waitDesk';
    const sus = boss.suspicion / 100;
    // Конус обрезается стенами: лучи до первого препятствия
    const rays = 28;
    ctx.save();
    const grd = ctx.createRadialGradient(boss.x, boss.y, 6, boss.x, boss.y, range);
    const base = sus > 0.05 ? `255,${Math.round(170 - sus * 120)},60` : (alert ? '255,90,70' : '255,240,180');
    grd.addColorStop(0, `rgba(${base},${alert || sus > 0.05 ? 0.42 : 0.3})`);
    grd.addColorStop(0.7, `rgba(${base},${alert || sus > 0.05 ? 0.22 : 0.14})`);
    grd.addColorStop(1, `rgba(${base},0.04)`);
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(boss.x, boss.y);
    for (let i = 0; i <= rays; i++) {
      const a = boss.facing - CFG.visionHalfAngle + (i / rays) * CFG.visionHalfAngle * 2;
      let len = range;
      for (let s = 8; s < range; s += 8) {
        const px = boss.x + Math.cos(a) * s, py = boss.y + Math.sin(a) * s;
        if (sightBlockers.some(w => rectContains(w, px, py))) { len = s; break; }
      }
      ctx.lineTo(boss.x + Math.cos(a) * len, boss.y + Math.sin(a) * len);
    }
    ctx.closePath();
    ctx.fill();
    ctx.setLineDash([3, 3]);
    ctx.lineDashOffset = -performance.now() / 60;
    ctx.strokeStyle = `rgba(${base},0.45)`;
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawStripFrame(image, frames, index, cx, feetY, flip, clipH = null, alpha = 1) {
    const fw = image.naturalWidth / frames;
    const fh = image.naturalHeight;
    const dw = fw / S;
    const dh = fh / S;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(Math.round(cx * S) / S, Math.round(feetY * S) / S);
    if (flip) ctx.scale(-1, 1);
    const sh = clipH ? Math.min(fh, clipH * S) : fh;
    ctx.drawImage(image, (index % frames) * fw, 0, fw, sh, -dw / 2, -dh, dw, sh / S);
    ctx.restore();
  }

  function drawShadow(x, y, rx, ry, a = 0.32) {
    ctx.fillStyle = `rgba(10,16,20,${a})`;
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill();
  }

  function drawPlayer() {
    const a = player.action;
    if (AWAY.has(a)) return;
    if (a === 'work') {
      // Сидит за своим столом: столешница закроет ноги
      if (ready(img.vik)) drawStripFrame(img.vik, 4, 0, SEAT.x, DESK.y + 16 + Math.sin(performance.now() / 300) * 0.4, true);
      // отсвет монитора на лице
      R(SEAT.x - 9, DESK.y - 42, 18, 14, 'rgba(90,230,160,0.14)');
      return;
    }
    if (a === 'plant_hide') {
      if (ready(img.vik)) drawStripFrame(img.vik, 4, 0, player.x, player.y + 6, player.facingX < 0, 30, 0.95);
      return;
    }
    const alpha = a === 'cabinet_hide' ? 0.55 : 1;
    drawShadow(player.x, player.y, 11, 3.5);
    if (ready(img.vik)) {
      const frame = player.moving ? Math.floor(player.walkTimer) % 4 : 0;
      const bob = player.moving ? 0 : Math.sin(performance.now() / 450) * 0.5;
      drawStripFrame(img.vik, 4, frame, player.x, player.y + 1 + bob, player.facingX < 0, null, alpha);
    }
    if (player.action === 'smoke') { R(player.x + 9 * player.facingX, player.y - 34, 6 * player.facingX, 1.2, '#f2efe6'); R(player.x + 15 * player.facingX, player.y - 34.3, 1.6, 1.8, '#ff5a2a'); }
  }

  const BOSS_FRAMES = 9, BOSS_STAND = 8; // boss-walk-v3: кадры 0–7 — шаг, 8 — стоит
  function drawBoss() {
    if (boss.state === 'gone' || boss.state === 'out') return;
    const inOffice = boss.state === 'office';
    if (!inOffice) drawShadow(boss.x, boss.y, 16, 5, 0.38);
    if (!ready(img.boss)) return;
    if (inOffice) {
      drawStripFrame(img.boss, BOSS_FRAMES, BOSS_STAND, boss.x, boss.y + 30, true);
      return;
    }
    const frame = boss.moving ? Math.floor(boss.walkTimer) % BOSS_STAND : BOSS_STAND;
    const flip = Math.cos(boss.facing) < 0;
    drawStripFrame(img.boss, BOSS_FRAMES, frame, boss.x, boss.y + 2, flip);
    if (boss.state === 'inspect') {
      ctx.strokeStyle = `rgba(235,65,55,${0.35 + Math.sin(performance.now() / 150) * 0.2})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(boss.x, boss.y, 20, 7, 0, 0, TAU); ctx.stroke();
    }
  }

  const SLACK_ICONS = { phone: '📱', sleep: '💤', game: '🎮', snack: '🍟' };
  function drawCoworker(c) {
    if (c.away) return;
    const sheet = c.sheet === 'extras' ? img.extras : img.coworkers;
    if (!ready(sheet)) return;
    const t = performance.now() / 1000;
    let bob = Math.sin(t * 1.6 + c.x) * 0.5;
    if (c.id === 'hlad') bob = Math.abs(Math.sin(t * 5)) * -1.2; // качает головой под музыку
    if (c.slack === 'sleep') bob = 2 + Math.sin(t * 1.2) * 0.8; // клюёт носом
    if (c.slack === 'game') bob = Math.sin(t * 9) * 0.6;
    if (c.alert) bob = -1.5; // выпрямились — начальник рядом
    if (c.ghost) { // дух офиса: полупрозрачный, с голубым свечением
      ctx.save();
      ctx.globalAlpha = 0.72 + Math.sin(t * 1.3) * 0.12;
      const gl = ctx.createRadialGradient(c.x, c.desk.y - 20, 4, c.x, c.desk.y - 20, 34);
      gl.addColorStop(0, 'rgba(150,210,255,0.35)'); gl.addColorStop(1, 'rgba(150,210,255,0)');
      ctx.fillStyle = gl; ctx.fillRect(c.x - 36, c.desk.y - 56, 72, 72);
      drawStripFrame(sheet, Math.round(sheet.naturalWidth / 80), c.sprite, c.x, c.desk.y + 18 + Math.sin(t * 0.9) * 1.5, false);
      ctx.restore();
      if (Math.sin(t * 2.3 + 1) > 0.97) T('✦', c.x - 18 + Math.sin(t * 7) * 6, c.desk.y - 40, 7, '#cfe8ff', 'center', 700, FONT_SANS);
      return;
    }
    if (c.id === 'aljazira' && day.aljaziraVisiting) {
      drawShadow(c.x, c.y + 16, 7, 2.4);
      bob = Math.sin(t * 9) * 1.2;
    }
    const cy = (c.y !== undefined && Math.abs(c.y - (c.desk.y - 1)) > 3 ? c.y : c.desk.y) + 18 + bob;
    drawStripFrame(sheet, Math.round(sheet.naturalWidth / 80), c.sprite, c.x, cy, false);
    if (c.slack) {
      if (c.slack === 'phone' || c.slack === 'game') R(c.x - 6, cy - 24, 12, 7, 'rgba(120,220,255,0.35)');
      const y = cy - 62 + Math.sin(t * 3) * 1.5;
      T(SLACK_ICONS[c.slack], c.x + 16, y, 10, '#fff', 'center', 700, FONT_SANS);
    }
  }
  // Очередь в биотуалет: люди из соседних отделов (процедурный пиксель-арт)
  const QUEUE_LOOK = [
    { shirt: '#e8e4d8', tie: '#b3261e', pants: '#2c3440', hair: '#1c1612', skin: '#e0b088', style: 'short' },
    { shirt: '#5a8a4a', tie: null, pants: '#3a3a44', hair: '#3a2416', skin: '#c8905e', style: 'bun' },
    { shirt: '#3f6a9a', tie: '#1a2a4a', pants: '#23262c', hair: '#0e0e10', skin: '#d8a070', style: 'bald' },
    { shirt: '#b0508a', tie: null, pants: '#2a2a30', hair: '#6a3a1a', skin: '#e6b890', style: 'long' },
  ];
  function drawStranger(x, y, look, seed, alpha = 1, walking = false) {
    const L = QUEUE_LOOK[look % QUEUE_LOOK.length];
    const t = performance.now() / 1000 + seed * 1.7;
    const shift = walking ? Math.sin(t * 10) * 1.5 : (Math.sin(t * 1.3) > 0.6 ? 0.8 : 0); // переминается с ноги на ногу
    const sway = walking ? 0 : Math.sin(t * 0.9) * 0.5;
    ctx.save(); ctx.globalAlpha = alpha;
    drawShadow(x, y, 8, 2.6);
    R(x - 4.5, y - 16 + shift, 4, 15 - shift, L.pants); R(x + 0.5, y - 16 - shift, 4, 15 + shift, L.pants);
    R(x - 5.5, y - 2, 5.5, 2.5, '#161616'); R(x + 0.5, y - 2, 5.5, 2.5, '#161616');
    const bx = x + sway;
    R(bx - 7, y - 35, 14, 20, L.shirt); R(bx - 7, y - 35, 14, 2, 'rgba(255,255,255,0.18)'); R(bx + 4, y - 35, 3, 20, 'rgba(0,0,0,0.15)');
    R(bx - 9, y - 33, 3, 15, L.shirt); R(bx + 6, y - 33, 3, 15, L.shirt);
    R(bx - 9, y - 18, 3, 3, L.skin); R(bx + 6, y - 18, 3, 3, L.skin);
    R(bx - 7, y - 16, 14, 2, '#2a2016');
    if (L.tie) { R(bx - 1, y - 34, 2, 11, L.tie); R(bx - 1.5, y - 35, 3, 2, L.tie); }
    R(bx - 2, y - 37, 4, 3, L.skin);
    E(bx, y - 42, 5.5, 6, L.skin);
    R(bx - 2.8, y - 42, 1.3, 1.5, '#1a1a1a'); R(bx + 1.5, y - 42, 1.3, 1.5, '#1a1a1a');
    R(bx - 1.2, y - 38.5, 2.4, 0.8, 'rgba(90,40,30,0.7)');
    if (L.style === 'short') { R(bx - 5.5, y - 48.5, 11, 4, L.hair); R(bx - 5.5, y - 46, 2, 3, L.hair); R(bx + 3.5, y - 46, 2, 3, L.hair); }
    if (L.style === 'bun') { R(bx - 5.5, y - 48, 11, 4, L.hair); E(bx, y - 50, 3, 2.5, L.hair); }
    if (L.style === 'bald') { E(bx, y - 46, 4.5, 2, 'rgba(255,255,255,0.35)'); R(bx - 5.8, y - 44, 1.5, 3, L.hair); R(bx + 4.3, y - 44, 1.5, 3, L.hair); }
    if (L.style === 'long') { R(bx - 6, y - 48.5, 12, 4, L.hair); R(bx - 6.5, y - 46, 2.5, 10, L.hair); R(bx + 4, y - 46, 2.5, 10, L.hair); }
    ctx.restore();
  }

  // Динамические детали, привязанные к спрайтам мебели
  const decor = {
    kitchen_table: () => {
      if (!eventIs('food')) return;
      const t = performance.now() / 1000;
      if (!officeEvent.used) {
        E(120, 203, 11, 5, '#f4f1e6');
        for (let i = 0; i < 7; i++) E(113 + (i % 4) * 4.5, 201 + Math.floor(i / 4) * 3.5, 2.4, 1.8, officeEvent.food.color);
        for (let i = 0; i < 3; i++) { const a = t * 2 + i * 2.1; R(120 + Math.cos(a) * 14, 198 + Math.sin(a) * 6, 1.2, 1.2, '#fff3a0'); }
      } else {
        E(120, 203, 11, 5, '#f4f1e6'); E(118, 202, 1.5, 1, officeEvent.food.color);
      }
    },
    rack_row1: () => drawRackLeds(374, 22),
    r1_4: () => drawDeskUpgrades(),
    wc_cabin: () => drawCabinState(),
    rack_row2: () => drawRackLeds(480, 42),
    copier: () => {
      if (eventIs('jam') && !officeEvent.used) {
        const w = Math.sin(performance.now() / 90) * 1.5;
        R(412 + w, 466, 12, 8, '#f5f2e8'); R(414 + w, 468, 8, 0.6, '#999');
        if (Math.floor(performance.now() / 300) % 2) R(441, 467, 3, 3, '#f33');
      }
      if (player.action === 'printer' || player.action === 'fixjam') {
        const x = 406 + Math.abs(Math.sin(performance.now() / 300)) * 40;
        R(x, 450, 3, 12, 'rgba(120,255,210,0.8)');
      }
    },
    bucket: () => {
      const tt = (performance.now() / 1000) % 1.4;
      if (tt < 1) R(323.5, 404 + tt * 34, 1.2, 2, 'rgba(120,180,230,0.9)');
      else { ctx.strokeStyle = `rgba(160,210,240,${1.4 - tt})`; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.ellipse(324, 438, (tt - 1) * 14, (tt - 1) * 4, 0, 0, TAU); ctx.stroke(); }
    },
  };
  // Кастомизация стола Быкентия из магазина апгрейдов
  function drawDeskUpgrades() {
    const x = DESK.x, y = DESK.y, t = performance.now() / 1000;
    if (has('monitor')) { R(x + 30, y - 14, 24, 16, '#1d2124'); R(x + 32, y - 12, 20, 12, '#2f6a58'); R(x + 40, y + 2, 4, 3, '#1d2124'); }
    if (has('cactus')) { R(x + 16, y + 14, 7, 6, '#b8683a'); R(x + 18, y + 6, 3, 9, '#3f9a4a'); R(x + 16, y + 9, 2, 4, '#3f9a4a'); R(x + 21, y + 8, 2, 4, '#3f9a4a'); R(x + 19, y + 5, 1.5, 1.5, '#ff6a9a'); }
    if (has('lava')) { R(x + 70, y + 4, 6, 3, '#333'); R(x + 71, y - 8, 4, 12, 'rgba(255,120,60,0.85)'); E(x + 73, y - 5 + Math.sin(t * 1.5) * 3, 1.5, 2, '#ffd23a'); R(x + 70, y - 10, 6, 2, '#333'); }
    if (has('fan')) {
      R(x + 58, y + 12, 2, 8, '#888'); E(x + 59, y + 20, 4, 1.5, '#666');
      ctx.save(); ctx.translate(x + 59, y + 10); ctx.rotate(t * (eventIs('heat') ? 30 : 8));
      for (let k = 0; k < 3; k++) { ctx.rotate(TAU / 3); R(0, -1, 5, 2, '#bfe3f0'); }
      ctx.restore(); E(x + 59, y + 10, 1.2, 1.2, '#555');
    }
    if (has('turka')) { R(x + 4, y + 16, 5, 7, '#c9a640'); R(x + 9, y + 18, 4, 1.2, '#7a5a2a'); }
    if (has('headphones') && player.action !== 'work') { ctx.strokeStyle = '#d23a3a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x + 48, y + 20, 5, Math.PI, 0); ctx.stroke(); R(x + 42, y + 19, 3, 4, '#222'); R(x + 51, y + 19, 3, 4, '#222'); }
    if (has('guitar')) {
      const gx = x + WD.DESK_W + 6, gy = y + 14;
      E(gx, gy + 8, 6, 7, '#8a2a1a'); E(gx, gy, 4.5, 5, '#8a2a1a'); E(gx, gy + 4, 1.8, 1.8, '#1a1a1a');
      R(gx - 1, gy - 26, 2, 24, '#3a2618'); R(gx - 2, gy - 29, 4, 4, '#1a1a1a');
    }
    if (has('chair') && player.action !== 'work') { R(SEAT.x - 9, y - 30, 18, 6, '#2a5a8a'); R(SEAT.x - 9, y - 30, 18, 1.5, '#4a8aca'); }
  }
  // Защёлка «ЗАНЯТО/СВОБОДНО», приоткрытая дверь и вечная муха над кабинкой
  function drawCabinState() {
    const busy = player.action === 'toilet' || player.action === 'queue' || day.npcInside > 0;
    const x = 248, y = 446;
    R(x + 11, y + 40, 16, 5, '#e8ecf0');
    R(x + 11.5, y + 40.5, 15, 4, busy ? '#d23a2e' : '#2f9a4a');
    T(busy ? 'ЗАНЯТО' : 'СВОБОДНО', x + 19, y + 42.6, 2.8, '#fff', 'center', 700, FONT_SANS);
    if (day.cabinDoor > 0) { const k = Math.min(1, day.cabinDoor * 2); R(x + 6, y + 12, 5 * k, 49, '#0d1a2a'); }
    const t = performance.now() / 1000;
    R(x + 19 + Math.cos(t * 3.1) * 9, y - 6 + Math.sin(t * 4.3) * 4, 1.3, 1.3, '#111');
  }
  function drawRackLeds(ry, h) {
    const t = Math.floor(performance.now() / 160);
    for (let i = 0; i < 4; i++) {
      for (let y = ry + 2, k = 0; y < ry + h - 2; y += 5, k++) {
        const on = (t + i * 7 + k * 3) % 5;
        R(828 + i * 28 + 16, y + 1, 1.5, 1.5, on === 0 ? '#5f5' : '#1a4a24');
        R(828 + i * 28 + 19, y + 1, 1.5, 1.5, on === 2 ? '#4ef' : '#0f3a44');
        R(828 + i * 28 + 22, y + 1, 1.5, 1.5, on === 3 ? '#fb3' : '#4a3a10');
      }
    }
  }

  function drawScene() {
    const items = [];
    for (const p of art.props) items.push({ y: p.baseY, draw: () => { ctx.drawImage(p.canvas, p.x, p.y, p.w, p.h); if (decor[p.id]) decor[p.id](); } });
    for (const c of coworkers) items.push({ y: c.y, draw: () => drawCoworker(c) });
    if (player.action === 'queue') for (let i = 0; i < day.queue; i++) items.push({ y: WD.toiletDoor.y - 0.5, draw: () => { const p = queueSlot(i); drawStranger(p.x + day.qShift, p.y, (day.queueTotal - day.queue + i + 2) % QUEUE_LOOK.length, i); } });
    for (const wk of walkers) items.push({ y: wk.y, draw: () => drawStranger(wk.x, wk.y, wk.look, 9, Math.max(0, 1 - wk.t / 1.6), true) });
    const pBase = player.action === 'work' ? DESK.y - 1 : (player.action === 'plant_hide' && player.hideSpot ? player.hideSpot.y - 1 : (player.y < 168 && Math.abs(player.x - SEAT.x) < 36 ? 167 : player.y));
    items.push({ y: pBase, draw: drawPlayer });
    items.push({ y: boss.state === 'office' ? WD.bossHome.y + 15 : boss.y, draw: drawBoss });
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.draw();
  }

  function entityHead(owner) {
    if (owner === 'player') {
      if (player.action === 'toilet') return { x: WD.toiletDoor.x, y: WD.toiletDoor.y - 70 };
      if (player.action === 'lunch' || player.action === 'evac') return { x: WD.exitDoor.x + 10, y: WD.exitDoor.y - 30 };
      if (player.action === 'work') return { x: SEAT.x, y: DESK.y - 46 };
      if (player.action === 'plant_hide') return { x: player.x, y: player.y - 30 };
      return { x: player.x, y: player.y - 62 };
    }
    if (owner === 'queue') { if (player.action !== 'queue' || !day.queue) return null; const q = queueSlot(0); return { x: q.x + day.qShift, y: q.y - 60 }; }
    if (owner === 'boss') {
      if (boss.state === 'out' || boss.state === 'gone') return null;
      return boss.state === 'office' ? { x: boss.x, y: boss.y - 44 } : { x: boss.x, y: boss.y - 68 };
    }
    const c = coworkerById(owner);
    return c && !c.away ? { x: c.x, y: c.desk.y - 38 } : null;
  }

  function wrap(text, maxW, size) {
    ctx.font = `700 ${size}px ${FONT_SANS}`;
    const words = text.split(' ');
    const lines = [];
    let cur = '';
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; } else cur = test;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  let bannerBottom = 0; // нижний край баннера дня (мировые единицы), чтобы реплики не лезли под него
  const screenRects = {}; // экранные плашки прошлого кадра (строка задания, автопилот) — реплики их обходят
  function drawBubbles() {
    const k = uiK(1.6);
    const top = Math.max(hudBottom() + 4, banner ? bannerBottom + 4 : 0);
    const items = [];
    for (const b of bubbles) {
      const head = entityHead(b.owner);
      if (!head) continue;
      const size = 9;
      const lh = 10.5;
      const lines = wrap(b.text, 160, size);
      ctx.font = `700 ${size}px ${FONT_SANS}`;
      const w = Math.max(...lines.map(l => ctx.measureText(l).width)) + 12;
      const h = lines.length * lh + 7;
      const bx = clamp(head.x - w * k / 2, 4, W - w * k - 4);
      items.push({ b, head, size, lh, w, h, bx, y: Math.max(top, head.y - (h + 6) * k) });
    }
    // Раскладка без наложений: Д.Н. и Быкентий первыми, остальные уступают — выше, а если некуда, ниже
    const prio = o => (o === 'boss' ? 2 : o === 'player' ? 1 : 0);
    items.sort((a, c) => prio(c.b.owner) - prio(a.b.owner));
    const placed = Object.values(screenRects).filter(Boolean);
    for (const it of items) {
      const bw = it.w * k, bh = (it.h + 5) * k;
      const free = y => y >= top && y + bh <= H - 4 && !placed.some(p => it.bx < p.x + p.w && it.bx + bw > p.x && y < p.y + p.h && y + bh > p.y);
      if (!free(it.y)) { // ближайшее свободное место: над или под уже размещёнными плашками
        let best = null;
        for (const p of placed) for (const c of [p.y - bh - 2, p.y + p.h + 2]) if (free(c) && (best === null || Math.abs(c - it.y) < Math.abs(best - it.y))) best = c;
        if (best !== null) it.y = best;
      }
      placed.push({ x: it.bx, y: it.y, w: bw, h: bh });
    }
    for (const it of items) {
      const { b, head, size, lh, w, h, bx, y: by } = it;
      const shown = b.text.slice(0, Math.ceil(b.text.length * Math.min(1, b.t * 3.5)));
      const shownLines = wrap(shown, 160, size);
      const pop = Math.min(1, b.t * 8);
      const fade = b.t > b.dur - 0.3 ? (b.dur - b.t) / 0.3 : 1;
      ctx.save();
      ctx.globalAlpha = fade;
      // реплику отодвинули от головы — тянем тонкую линию к говорящему
      const tipY = by + (h + 5) * k;
      if (Math.abs(head.y - tipY) > 10) {
        ctx.strokeStyle = 'rgba(245,237,217,0.55)'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(clamp(head.x, bx + 4, bx + w * k - 4), tipY > head.y ? by : tipY); ctx.lineTo(head.x, head.y); ctx.stroke();
      }
      ctx.translate(head.x, by + h * k);
      ctx.scale(pop, pop);
      ctx.translate(-head.x, -(by + h * k));
      ctx.translate(bx, by);
      ctx.scale(k, k);
      const isBoss = b.owner === 'boss';
      const tx = clamp((head.x - bx) / k, 6, w - 6);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      roundRect(1.5, 1.5, w, h, 3); ctx.fill();
      ctx.fillStyle = b.color;
      roundRect(0, 0, w, h, 3); ctx.fill();
      ctx.strokeStyle = isBoss ? '#b3261e' : '#1c2a2e';
      ctx.lineWidth = isBoss ? 1.2 : 0.8;
      ctx.stroke();
      ctx.fillStyle = b.color;
      ctx.beginPath(); ctx.moveTo(tx - 3, h - 0.5); ctx.lineTo(tx + 3, h - 0.5); ctx.lineTo(tx, h + 5); ctx.fill();
      shownLines.forEach((l, i) => T(l, 6, 8.8 + i * lh, size, isBoss ? '#5a1010' : '#14232a', 'left', 700, FONT_SANS));
      ctx.restore();
    }
  }

  function drawOverheads() {
    const k = uiK(1.55);
    // Шкала подозрения над начальником
    if (mode !== 'menu' && boss.suspicion > 0 && boss.state !== 'office') {
      const s = boss.suspicion / 100;
      const icon = s > 0.7 ? '!' : '?';
      around(boss.x, boss.y - 64, k, () => {
        R(-14, -4, 28, 3.5, 'rgba(10,16,20,0.85)');
        R(-13.5, -3.5, 27 * s, 2.5, s > 0.7 ? '#ff4a3a' : '#f2bb38');
        T(icon, 0, -12, 11 + (s > 0.7 ? Math.sin(performance.now() / 60) * 1.5 : 0), s > 0.7 ? '#ff4a3a' : '#f2bb38', 'center', 900);
      });
    } else if (boss.state === 'waitDesk') {
      const blink = Math.floor(performance.now() / 250) % 2 === 0;
      const txt = `ГДЕ БЫКЕНТИЙ? ${Math.max(0, Math.ceil(boss.waitT))}`;
      around(boss.x, boss.y - 78, k, () => {
        R(-38, -18, 76, 14, blink ? '#c62a22' : '#7a1612');
        T(txt, 0, -11, 9, '#fff', 'center', 900, FONT_SANS);
        R(-30, -3, 60 * clamp(boss.waitT / diff().wait, 0, 1), 3, '#f2bb38');
      });
    } else if (boss.state === 'inspect' && !bubbles.some(b => b.owner === 'boss')) {
      const blink = Math.floor(performance.now() / 220) % 2 === 0;
      around(boss.x, boss.y - 69, k, () => {
        R(-22, -11, 44, 11, blink ? '#c62a22' : '#7a1612');
        T('ПРОВЕРКА', 0, -5.3, 7.5, '#fff');
      });
    }
    // Статус Быкентия
    const labels = {
      work: [eventIs('majik') && !officeEvent.used ? 'EXCEL · ЧИНИТ МАДЖИКИСТАН' : 'EXCEL · РИСК-МОДЕЛИ', '#2f9a5a'], smoke: ['ПЕРЕКУР', '#b3261e'], youtube: ['▶ YOUTUBE 4K', '#b3261e'],
      fridge: ['ШАРИТ В ХОЛОДИЛЬНИКЕ', '#c9861e'], chat: ['БОЛТАЕТ', '#c9861e'], plant_hide: ['В ЛИСТВЕ', '#2f7a3a'],
      cabinet_hide: ['ЗА ШКАФАМИ', '#2a6a8a'], printer_hide: ['ЗА КСЕРОКСОМ', '#2a6a8a'], printer: ['ПЕЧАТЬ МЕМА', '#2a6a8a'],
      eat: ['ЖУЁТ', '#c9861e'], fixjam: ['ЧИНИТ КСЕРОКС', '#2f9a5a'], phone: [phoneSafe > 0 ? '«НА СОЗВОНЕ» 📱' : 'ЛИСТАЕТ ТЕЛЕФОН', phoneSafe > 0 ? '#2f9a5a' : '#c9861e'],
      meme: ['СМОТРИТ МЕМ БЛЕБА', '#c9861e'],
      queue: ['В ОЧЕРЕДИ В БИОТУАЛЕТ', '#2a6a8a'], standup: ['НА ЛЕТУЧКЕ', '#2f9a5a'], toilet: ['ЗАНЯТО', '#2a6aa0'],
      lunch: ['ОБЕД В «МЮНХЕНЕ»', '#c9861e'], evac: ['НА УЛИЦЕ', '#2f9a5a'],
    };
    const lab = labels[player.action];
    if (lab && !bubbles.some(b => b.owner === 'player')) {
      const head = entityHead('player');
      around(head.x, head.y, k, () => {
        ctx.font = `700 8px ${FONT_SANS}`;
        const w = ctx.measureText(lab[0]).width + 12;
        R(-w / 2, -13, w, 11, 'rgba(10,16,20,0.9)');
        R(-w / 2, -13, 2, 11, lab[1]);
        T(lab[0], 1, -7.2, 8, '#fff', 'center', 700, FONT_SANS);
        if (player.actionTotal > 0 && player.actionTimer > 0) {
          const p = 1 - player.actionTimer / player.actionTotal;
          R(-w / 2, -2, w, 2, 'rgba(10,16,20,0.9)');
          R(-w / 2, -2, w * p, 2, '#f2bb38');
        }
      });
    }
    // Шкала «приспичило»
    if (day.peeActive && !AWAY.has(player.action)) {
      const head = entityHead('player');
      const urgent = day.pee >= 70, jig = urgent ? Math.sin(performance.now() / 33) : 0;
      around(head.x + jig, head.y - 16, k, () => {
        R(-17, -9, 34, 12, 'rgba(10,16,20,0.92)'); R(-17, -9, 2, 12, urgent ? '#e8433e' : '#8fd0f0');
        T(`🚽${Math.round(day.pee)}%`, 0, -3, 7, urgent ? '#ff8a7a' : '#8fd0f0', 'center', 700, FONT_SANS);
        R(-15, 3, 30 * day.pee / 100, 1.5, urgent ? '#e8433e' : '#8fd0f0');
      });
    }
    // Имена коллег, когда Быкентий рядом
    for (const c of coworkers) {
      if (!c.away && Math.hypot(player.x - c.x, player.y - c.y) < 90 && !bubbles.some(b => b.owner === c.id)) {
        const tx = `${c.name} · ${c.role.replace(/ \(.*\)$/, '')}`;
        around(c.x, c.desk.y - 40, k, () => {
          ctx.font = `700 7.5px ${FONT_SANS}`;
          const w = ctx.measureText(tx).width + 10;
          R(-w / 2, -11, w, 11, 'rgba(10,16,20,0.82)');
          T(tx, 0, -5.3, 7.5, c.cooldown > 0 ? '#9aa' : '#f5edd9', 'center', 700, FONT_SANS);
        });
      }
    }
    for (const f of floaters) {
      const a = 1 - f.t / 1.4;
      ctx.save(); ctx.globalAlpha = a;
      around(f.x, f.y - f.t * 22, k, () => {
        T(f.text, 0.7, 0.7, 9, 'rgba(0,0,0,0.75)', 'center', 900, FONT_SANS);
        T(f.text, 0, 0, 9, f.color, 'center', 900, FONT_SANS);
      });
      ctx.restore();
    }
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawDanger() {
    if (danger < 0.05) return;
    const pulse = 0.6 + Math.sin(performance.now() / (120 - danger * 40)) * 0.4;
    const v = ctx.createRadialGradient(W / 2, H / 2 + 20, 200, W / 2, H / 2 + 20, 560);
    v.addColorStop(0, 'rgba(180,20,20,0)');
    v.addColorStop(1, `rgba(180,20,20,${0.35 * danger * pulse})`);
    ctx.fillStyle = v;
    ctx.fillRect(0, WD.HUD_H, W, H - WD.HUD_H);
  }

  function drawBanner() {
    if (!banner) return;
    const t = banner.t;
    const dur = banner.dur || 4.4;
    const slide = t < 0.25 ? t / 0.25 : (t > dur - 0.3 ? (dur - t) / 0.3 : 1);
    const k = uiK(1.45);
    const { VW } = uiSpace(k);
    const y = hudBottom() / k + 6 - (1 - slide) * 30;
    ctx.save();
    ctx.globalAlpha = clamp(slide, 0, 1);
    const maxW = compactHud() ? Math.min(VW - 40, VW * 0.72) : VW - 40;
    let subLines = wrap(banner.sub, maxW, 10);
    if (compactHud() && subLines.length > 2) subLines = [subLines[0], `${subLines[1].replace(/[\s.,;:·—-]+$/, '')}…`];
    ctx.font = `700 10px ${FONT_SANS}`;
    const subW = Math.max(...subLines.map(l => ctx.measureText(l).width));
    const title = banner.bad ? `📝 ${banner.text}` : `★ ${banner.text} ★`;
    const titleLines = wrap(title, maxW, 13);
    ctx.font = `900 13px ${FONT_SANS}`;
    const titleW = Math.max(...titleLines.map(l => ctx.measureText(l).width));
    const w = Math.min(maxW + 30, Math.max(titleW, subW, 200) + 30);
    const h = 12 + titleLines.length * 15 + subLines.length * 12;
    const accent = banner.bad ? '#e8433e' : '#f2bb38';
    ctx.fillStyle = banner.bad ? 'rgba(60,12,14,0.96)' : 'rgba(12,20,24,0.95)'; roundRect(VW / 2 - w / 2, y, w, h, 3); ctx.fill();
    R(VW / 2 - w / 2, y, w, 2, accent);
    titleLines.forEach((l, i) => T(l, VW / 2, y + 13 + i * 15, 13, accent, 'center', 900, FONT_SANS));
    const sy = y + 13 + titleLines.length * 15;
    subLines.forEach((l, i) => T(l, VW / 2, sy + i * 12, 10, '#f5edd9', 'center', 700, FONT_SANS));
    ctx.restore();
    bannerBottom = (y + h) * k;
    ctx.setTransform(S, 0, 0, S, 0, 0);
  }

  function drawLighting() {
    const p = dayProgress();
    // Вечером офис темнеет и желтеет от ламп
    if (p > 0.7) R(0, WD.HUD_H, W, H - WD.HUD_H, `rgba(40,25,50,${(p - 0.7) * 0.55})`);
    // Виньетка
    const v = ctx.createRadialGradient(W / 2, H / 2 + 20, 260, W / 2, H / 2 + 20, 620);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = v;
    ctx.fillRect(0, WD.HUD_H, W, H - WD.HUD_H);
  }

  function bar(x, y, w, label, value, color, valueColor, shown) {
    T(label, x, y, 8.5, '#f5edd9', 'left', 700, FONT_SANS);
    const max = value >= 100;
    T(max ? '100 MAX' : `${Math.round(shown)}`, x + w, y, 8.5, max ? '#ffe082' : valueColor, 'right', 700);
    R(x, y + 5, w, 8, '#0b1417');
    R(x + 1, y + 6, (w - 2) * clamp(value / 100, 0, 1), 6, color);
    R(x + 1, y + 6, (w - 2) * clamp(value / 100, 0, 1), 1.5, 'rgba(255,255,255,0.25)');
  }

  function drawHUDWide() {
    const g = ctx.createLinearGradient(0, 0, 0, WD.HUD_H);
    g.addColorStop(0, '#0a1316'); g.addColorStop(1, '#13242a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, WD.HUD_H);
    R(0, WD.HUD_H - 2, W, 2, '#d8aa40');

    if (ready(img.emblem)) ctx.drawImage(img.emblem, 10, 8, 30, 30);
    T('ФИРДОМ', 44, 16, 7.5, '#f2bb38', 'left', 700, FONT_SANS);
    T('КРЕДИТКИ', 44, 26, 7.5, '#9fc', 'left', 700, FONT_SANS);
    T('7 ЭТАЖ', 44, 36, 6.5, '#789', 'left', 700, FONT_SANS);

    // Выговоры: кружки по dayReprimandsMax + недельные + счётчик «не застал на месте»
    const dMax = diff().dayReprimandsMax;
    const wMax = diff().weekReprimandsMax;
    T('ВЫГОВОРЫ', 88, 14, 8.5, '#f5edd9', 'left', 700, FONT_SANS);
    for (let i = 0; i < dMax; i++) {
      const cx = 96 + i * 15, on = i < reprimands;
      ctx.fillStyle = on ? '#e8433e' : '#0b1417'; ctx.beginPath(); ctx.arc(cx, 27, 5.5, 0, TAU); ctx.fill();
      ctx.strokeStyle = on ? '#ff8a7a' : '#4a6a70'; ctx.lineWidth = 1; ctx.stroke();
      if (on) T('!', cx, 27.3, 7.5, '#fff', 'center', 900);
    }
    const lim = diff().missLimit;
    const repEnd = 96 + (dMax - 1) * 15;
    T(`нед: ${weekReprimands}/${wMax}`, repEnd + 10, 21.5, 6.5, weekReprimands >= wMax - 1 ? '#ff8a7a' : '#e0b088', 'left', 700, FONT_SANS);
    T(`👀 не застал: ${day.misses || 0}/${lim}`, repEnd + 10, 31, 6.5, (day.misses || 0) >= lim - 1 ? '#ff8a7a' : '#9fb', 'left', 700, FONT_SANS);
    // План на день: полоска с отметкой цели
    const pw = 110, px = 222;
    T('ПЛАН', px, 14, 8.5, '#f5edd9', 'left', 700, FONT_SANS);
    T(planDone() ? `✓ ${Math.round(usefulness)}/${planTarget}` : `${Math.floor(usefulness)}/${planTarget}`, px + pw, 14, 8.5, planDone() ? '#9fe0b0' : '#57b867', 'right', 700);
    R(px, 19, pw, 8, '#0b1417');
    R(px + 1, 20, (pw - 2) * clamp(usefulness / planTarget, 0, 1), 6, planDone() ? '#2f9a5a' : '#57b867');
    const late = !planDone() && dayProgress() > 0.65 && usefulness / planTarget < dayProgress();
    if (late) R(px, 19, pw, 8, `rgba(232,67,62,${0.25 + Math.sin(performance.now() / 200) * 0.15})`);
    bar(346, 14, 90, 'КАЙФ', Math.min(100, fun), '#c76ad8', '#e0a0f0', fun);

    // Часы
    R(452, 6, 118, 36, '#081012'); R(453, 7, 116, 34, '#122126');
    T(timeString(clockMinutes), 511, 17, 14, '#fff');
    R(460, 27, 102, 2.5, '#0b1417'); R(460, 27, 102 * dayProgress(), 2.5, '#f2bb38');
    T(`${today().name} · ${diff().name}${timeScale !== 1 ? ` · ×${+timeScale.toFixed(2)}` : ''}${muted ? ' · 🔇' : (musicOn ? '' : ' · без музыки')}`, 511, 35.5, 6, '#9fb', 'center', 700, FONT_SANS);

    // Радар начальника
    const x0 = 582;
    const alert = boss.state === 'inspect' || boss.state === 'waitDesk';
    R(x0, 6, W - x0 - 8, 36, alert ? '#4a1316' : '#0f2126');
    R(x0 + 1, 7, W - x0 - 10, 34, alert ? (Math.floor(performance.now() / 250) % 2 ? '#7a1a1f' : '#5f1418') : '#16303a');
    // мини-портрет
    R(x0 + 5, 10, 26, 28, '#e0b088'); R(x0 + 11, 11, 12, 2.5, '#fff'); R(x0 + 13, 27, 10, 1.5, '#8a3a30'); R(x0 + 8, 18, 8, 3, '#222'); R(x0 + 20, 18, 8, 3, '#222'); R(x0 + 5, 33, 26, 5, '#9ab8e0'); R(x0 + 16, 33, 3, 5, '#c02a2a');
    const status = bossStatus();
    TF(status, x0 + 38, 15, 8.5, W - x0 - 54, alert ? '#fff' : '#f5edd9');
    // подозрение
    T('ПОДОЗРЕНИЕ', x0 + 38, 27, 6.5, '#9ab', 'left', 700, FONT_SANS);
    R(x0 + 88, 24, 112, 6, '#0b1417');
    R(x0 + 89, 25, 110 * (boss.suspicion / 100), 4, boss.suspicion > 70 ? '#ff4a3a' : '#f2bb38');
    if (boss.seesPlayer && mode === 'playing') T('👁 ВИДИТ ТЕБЯ', W - 14, 27, 6.5, '#ff8a7a', 'right', 700, FONT_SANS);
    const info = hudInfo();
    TF(info.join('  '), x0 + 38, 37.5, 6.5, W - x0 - 54, '#f2bb38');
  }

  function bossStatus() {
    return {
      office: eventIs('call') ? `Д.Н. на созвоне с правлением · ${Math.ceil(officeEvent.t)} с` : 'Д.Н. в кабинете: чай и чак-чак',
      patrol: `Д.Н. идёт: ${boss.spotDesc}`,
      look: 'Д.Н. озирается по сторонам',
      return: 'Д.Н. возвращается в кабинет',
      inspect: boss.mode === 'desk' ? '🚨 ПРОВЕРКА! Идёт к твоему столу' : '🚨 РЕЙД ПО ЭТАЖУ!',
      waitDesk: `🚨 Д.Н. ЖДЁТ У ТВОЕГО СТОЛА · ${Math.max(0, Math.ceil(boss.waitT || 0))} с`,
      lecture: 'Д.Н. читает нотацию',
      leaving: 'Д.Н. уезжает «на встречу»',
      gone: 'Д.Н. уехал. Офис твой! 🤘',
      goout: `Д.Н. уходит ${boss.spotDesc}`,
      out: boss.outWhy === 'lunch' ? `Д.Н. на обеде в «Мюнхене» · ${Math.max(0, Math.ceil(boss.outTimer))} с` : 'Д.Н. на улице: учения',
      scold: `Д.Н. отчитывает: ${(coworkerById(boss.scoldTarget) || {}).name || 'кого-то'}`,
      standup: 'Д.Н. ведёт летучку у доски',
    }[boss.state] || '';
  }
  function hudInfo() {
    const info = [];
    if (intelTimer > 0 && boss.state !== 'inspect') info.push(`📅 проверка через ${Math.max(0, Math.ceil(nextBossCheck))} с`);
    if (coverTokens) info.push('🛡 прикрытие');
    if (player.coffeeBoost > 0) info.push(`☕ ${Math.ceil(player.coffeeBoost)} с`);
    if (phoneSafe > 0) info.push(`📱 созвон ${Math.ceil(phoneSafe)} с`);
    if (day.hungry) info.push('🍽 голоден');
    if (officeEvent && officeEvent.id !== 'call') info.push(`★ ${EVENTS[officeEvent.id].title.toLowerCase()} · ${Math.ceil(officeEvent.t)} с`);
    return info;
  }

  // Компактный HUD для небольших экранов: рисуется в UI-единицах, ширина VW = W / масштаб.
  // Три строки: подписи и значения, полоски, вторичная строка. Ничего мельче 7.5 ед.
  const HUDC_H = 32;
  function drawHUDCompact() {
    const k = hudScale();
    const { VW } = uiSpace(k);
    const HH = HUDC_H;
    const g = ctx.createLinearGradient(0, 0, 0, HH);
    g.addColorStop(0, '#0a1316'); g.addColorStop(1, '#13242a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, VW, HH);
    R(0, HH - 1.5, VW, 1.5, '#d8aa40');
    const gap = 7;
    let x = 6;
    const dMax = diff().dayReprimandsMax;
    const wMax = diff().weekReprimandsMax;
    // выговоры и «не застал»
    for (let i = 0; i < dMax; i++) {
      const cx = x + 4 + i * 11, on = i < reprimands;
      ctx.fillStyle = on ? '#e8433e' : '#0b1417'; ctx.beginPath(); ctx.arc(cx, 8.5, 4.5, 0, TAU); ctx.fill();
      ctx.strokeStyle = on ? '#ff8a7a' : '#4a6a70'; ctx.lineWidth = 1; ctx.stroke();
      if (on) T('!', cx, 9, 6.5, '#fff', 'center', 900);
    }
    const lim = diff().missLimit, m = day.misses || 0;
    T(`нед:${weekReprimands}/${wMax}`, x, 18.5, 6.5, weekReprimands >= wMax - 1 ? '#ff8a7a' : '#e0b088', 'left', 700, FONT_SANS);
    T(`👀${m}/${lim}`, x, 26, 6.5, m >= lim - 1 ? '#ff8a7a' : '#9fb', 'left', 700, FONT_SANS);
    x += Math.max(38, dMax * 11 + 6) + gap;
    // план
    const pw = clamp(VW * 0.17, 66, 150);
    T('ПЛАН', x, 9, 8, '#f5edd9', 'left', 700, FONT_SANS);
    T(planDone() ? `✓${Math.round(usefulness)}/${planTarget}` : `${Math.floor(usefulness)}/${planTarget}`, x + pw, 9, 8.5, planDone() ? '#9fe0b0' : '#57b867', 'right', 700, FONT_SANS);
    R(x, 16, pw, 7, '#0b1417');
    R(x + 1, 17, (pw - 2) * clamp(usefulness / planTarget, 0, 1), 5, planDone() ? '#2f9a5a' : '#57b867');
    if (!planDone() && dayProgress() > 0.65 && usefulness / planTarget < dayProgress()) R(x, 16, pw, 7, `rgba(232,67,62,${0.25 + Math.sin(performance.now() / 200) * 0.15})`);
    TE(planDone() ? 'сделан — кайфуй' : 'план на день', x, 27, 7.5, pw, '#9ab');
    x += pw + gap;
    // кайф
    const fw = clamp(VW * 0.13, 56, 120);
    T('КАЙФ', x, 9, 8, '#f5edd9', 'left', 700, FONT_SANS);
    T(fun >= 100 ? '100 MAX' : `${Math.round(fun)}`, x + fw, 9, 8.5, fun >= 100 ? '#ffe082' : '#e0a0f0', 'right', 700, FONT_SANS);
    R(x, 16, fw, 7, '#0b1417');
    R(x + 1, 17, (fw - 2) * clamp(fun / 100, 0, 1), 5, '#c76ad8');
    x += fw + gap;
    // часы
    const cw = 64;
    R(x, 2.5, cw, HH - 6, '#081012');
    T(timeString(clockMinutes), x + cw / 2, 10.5, 12.5, '#fff');
    R(x + 5, 18, cw - 10, 2, '#0b1417'); R(x + 5, 18, (cw - 10) * dayProgress(), 2, '#f2bb38');
    const dshort = { easy: 'стажёр', normal: 'сотр.', hard: 'ветеран' }[diffKey];
    TE(`${today().short} · ${dshort}${timeScale !== 1 ? ` ×${+timeScale.toFixed(2)}` : ''}`, x + cw / 2, 25.5, 7.5, cw - 6, '#9fb', 'center');
    x += cw + gap;
    // радар Д.Н.
    const rw = VW - x - 5;
    const alert = boss.state === 'inspect' || boss.state === 'waitDesk';
    R(x, 2.5, rw, HH - 6, alert ? (Math.floor(performance.now() / 250) % 2 ? '#7a1a1f' : '#5f1418') : '#16303a');
    TE(bossStatus(), x + 5, 9.5, 8.5, rw - 10, alert ? '#fff' : '#f5edd9');
    R(x + 5, 15.5, rw - 10, 4, '#0b1417');
    R(x + 5.5, 16, (rw - 11) * (boss.suspicion / 100), 3, boss.suspicion > 70 ? '#ff4a3a' : '#f2bb38');
    const info = hudInfo();
    const sees = boss.seesPlayer && mode === 'playing';
    if (sees) info.unshift('👁 ВИДИТ ТЕБЯ');
    TE(info.length ? info.join('  ') : 'подозрение Д.Н.', x + 5, 25, 7.5, rw - 10, sees ? '#ff8a7a' : (info.length ? '#f2bb38' : '#789'));
    ctx.setTransform(S, 0, 0, S, 0, 0);
  }

  function drawHUD() {
    if (compactHud()) drawHUDCompact(); else drawHUDWide();
    drawAlertFrame();
    drawPrompt();
  }

  // Контекстная подсказка «что сделает E» — внизу по центру, в UI-масштабе
  let promptTop = H;
  function drawPrompt() {
    promptTop = H;
    const act = mode === 'playing' ? getActionInfo() : null;
    if (!act) return;
    const k = uiK(1.6);
    const { VW, VH } = uiSpace(k);
    const lines = wrap(act.prompt, coarsePointer ? VW * 0.5 : VW - 60, 10.5);
    ctx.font = `700 10.5px ${FONT_SANS}`;
    const w = Math.max(...lines.map(l => ctx.measureText(l).width)) + 28;
    const h = 8 + lines.length * 12.5;
    const x = VW / 2 - w / 2;
    const y = VH - 24 - h;
    ctx.fillStyle = 'rgba(8,16,20,0.92)'; roundRect(x, y, w, h, 4); ctx.fill();
    ctx.strokeStyle = '#f2bb38'; ctx.lineWidth = 1; ctx.stroke();
    lines.forEach((l, i) => T(l, VW / 2, y + 10.4 + i * 12.5, 10.5, '#fff', 'center', 700, FONT_SANS));
    promptTop = y * k;
    ctx.setTransform(S, 0, 0, S, 0, 0);
  }

  // Мигающая рамка тревоги по краю офиса
  function drawAlertFrame() {
    if (boss.state !== 'inspect' && boss.state !== 'waitDesk') return;
    const a = 0.25 + Math.sin(performance.now() / 120) * 0.15;
    ctx.strokeStyle = `rgba(230,50,40,${a})`;
    ctx.lineWidth = 6;
    const top = hudBottom();
    ctx.strokeRect(3, top + 3, W - 6, H - top - 6);
  }

  function perkLines() {
    const out = [];
    const doneN = todo.filter(t => t.done).length;
    out.push(['📋', planDone() ? `План ${Math.floor(usefulness)}/${planTarget} ✓ — дальше работа почти не нужна` : `План ${Math.floor(usefulness)}/${planTarget} к 19:30 (меньше ${Math.ceil(planTarget * CFG.planMinShare)} — выговор)`, planDone() ? '#9fe0b0' : '#f2bb38']);
    const dMax = diff().dayReprimandsMax, wMax = diff().weekReprimandsMax;
    out.push(['⚠️', `Выговоры: ${reprimands}/${dMax} за день · ${weekReprimands}/${wMax} за неделю`, (reprimands >= dMax - 1 || weekReprimands >= wMax - 1) ? '#ff9a8a' : '#f2bb38']);
    out.push(['⭐', `Очки сейчас: ${Math.max(0, Math.round(fun + (planDone() ? 20 : 0) + doneN * 12 - reprimands * 15))} (кайф + план + дела − выговоры)`, '#e0a0f0']);
    if (coverTokens) out.push(['🛡', 'Прикрытие: Аймашын отмажет от следующего выговора', '#9fe0b0']);
    if (intelTimer > 0) out.push(['📅', `Инсайд Хлада: проверка через ${Math.max(0, Math.ceil(nextBossCheck))} с`, '#f2bb38']);
    if (player.coffeeBoost > 0) out.push(['☕', `Кофеин: ещё ${Math.ceil(player.coffeeBoost)} с`, '#e8b070']);
    out.push(['🏔', `Маджикистан на этой неделе: ${majikArc > 0 ? '+' : ''}${majikArc} (цель — +2 к пятнице)`, majikArc >= 0 ? '#9fe0b0' : '#ff9a8a']);
    if (phoneSafe > 0) out.push(['📱', `Приём Сиргея: ещё ${Math.ceil(phoneSafe)} с телефон не палево`, '#9fe0b0']);
    if (day.hungry) out.push(['🍽', 'Голоден: кайф −20%, Excel −15%, шаг медленнее. Обед был 12:30–14:00', '#ff9a8a']);
    else if (!day.fed && clockMinutes < CFG.lunchClose) out.push(['🍽', day.vilka ? 'Обед 12:30–14:00: стейки в «Вилке» 🥩 (выход слева)' : 'Обед 12:30–14:00 в «Мюнхене» (выход слева)', '#9ab']);
    const cds = coworkers.filter(c => c.cooldown > 0).map(c => `${c.name} ${Math.ceil(c.cooldown)}с`);
    if (cds.length) out.push(['⏳', `Заняты: ${cds.join(', ')}`, '#9ab']);
    return out;
  }

  function drawPhone() {
    if (phoneAnim <= 0) return;
    const e = 1 - Math.pow(1 - phoneAnim, 3);
    const k = uiK(1.5);
    const { VW, VH } = uiSpace(k);
    const pw = 250, ph = Math.min(380, VH - hudBottom() / k - 10);
    // на телефоне справа внизу сенсорные кнопки — сдвигаем телефон левее них
    const x = VW - pw - 18 - (coarsePointer ? 150 / (unitPx * k) : 0);
    const y = VH - ph * e - 6 + (1 - e) * 20;
    ctx.save();
    ctx.globalAlpha = Math.min(1, phoneAnim * 1.5);
    // корпус
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; roundRect(x + 4, y + 5, pw, ph, 16); ctx.fill();
    ctx.fillStyle = '#15191c'; roundRect(x, y, pw, ph, 16); ctx.fill();
    ctx.fillStyle = '#0d2a30'; roundRect(x + 7, y + 8, pw - 14, ph - 16, 11); ctx.fill();
    ctx.save(); roundRect(x + 7, y + 8, pw - 14, ph - 16, 11); ctx.clip(); // длинный список не вылезает за экран телефона
    R(x + pw / 2 - 18, y + 11, 36, 5, '#15191c');
    // трещина на экране — телефон тоже потрёпанный
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.moveTo(x + pw - 30, y + 20); ctx.lineTo(x + pw - 48, y + 60); ctx.lineTo(x + pw - 40, y + 90); ctx.moveTo(x + pw - 48, y + 60); ctx.lineTo(x + pw - 70, y + 72); ctx.stroke();
    const cx = x + 16;
    let cy = y + 26;
    T(timeString(clockMinutes), cx, cy, 8.5, '#fff', 'left', 700, FONT_SANS);
    T('Kcell  ▂▄▆  23%', x + pw - 16, cy, 7.5, '#9ab', 'right', 700, FONT_SANS);
    cy += 17;
    T('📋 ДЕЛА НА СЕГОДНЯ', cx, cy, 9.5, '#f2bb38', 'left', 900, FONT_SANS);
    cy += 14;
    for (const t of todo) {
      const prog = Math.min(t.goal, todoProgress(t));
      R(cx, cy - 4, 8, 8, t.done ? '#2f9a5a' : '#0b1417'); ctx.strokeStyle = '#6a8'; ctx.lineWidth = 0.8; ctx.strokeRect(cx + 0.4, cy - 3.6, 7.2, 7.2);
      if (t.done) T('✓', cx + 4, cy + 0.5, 7, '#fff');
      const label = t.goal > 1 ? `${t.text} ${prog}/${t.goal}` : t.text;
      const lines = wrap(label, pw - 44, 8.5);
      lines.forEach((l, i) => T(l, cx + 13, cy + i * 10, 8.5, t.done ? '#6a8a80' : '#e8f2ee', 'left', 700, FONT_SANS));
      if (t.done) R(cx + 13, cy, Math.min(pw - 44, ctx.measureText(lines[0]).width), 0.8, '#6a8a80');
      cy += lines.length * 10 + 4;
    }
    cy += 4;
    T('🎁 БОНУСЫ', cx, cy, 9.5, '#f2bb38', 'left', 900, FONT_SANS);
    cy += 13;
    for (const [icon, text, col] of perkLines()) {
      const lines = wrap(`${icon} ${text}`, pw - 32, 8);
      lines.forEach((l, i) => T(l, cx, cy + i * 9.5, 8, col, 'left', 700, FONT_SANS));
      cy += lines.length * 9.5 + 2;
    }
    cy += 5;
    T('💬 WhatsApp «КРЕДИТКИ 7 ЭТАЖ»', cx, cy, 9.5, '#f2bb38', 'left', 900, FONT_SANS);
    cy += 13;
    const bottom = y + ph - 24;
    for (const e2 of logEntries) {
      const lines = wrap(e2.text, pw - 72, 7.5);
      const hh = lines.length * 9 + 5;
      if (cy + hh > bottom) break;
      ctx.fillStyle = e2.kind === 'good' ? 'rgba(47,154,90,0.35)' : (e2.kind === 'bad' ? 'rgba(200,50,40,0.35)' : 'rgba(255,255,255,0.08)');
      roundRect(cx - 2, cy - 5, pw - 28, hh, 4); ctx.fill();
      lines.forEach((l, i) => T(l, cx + 2, cy + i * 9, 7.5, '#e8f2ee', 'left', 700, FONT_SANS));
      T(e2.time, x + pw - 16, cy, 6, '#9ab', 'right', 700, FONT_SANS);
      cy += hh + 3;
    }
    T(coarsePointer ? '📱 — убрать · смотреть в телефон = палево' : 'Tab / Q — убрать · смотреть в телефон = палево', x + pw / 2, y + ph - 15, 7.5, '#7a9a94', 'center', 700, FONT_SANS);
    ctx.restore();
    ctx.restore();
    ctx.setTransform(S, 0, 0, S, 0, 0);
  }

  // Обучение: подсказки со стрелкой на первых минутах, пока игрок не освоится
  const TUTORIAL = [
    { text: 'Подойди к своему столу (из прохода или от окна) и нажми E — это Excel', target: () => ({ x: SEAT.x, y: SEAT.y - 58 }), done: () => player.action === 'work' },
    { text: coarsePointer ? '📱 — телефон: там список дел, бонусы и чат' : 'Tab / Q — телефон: там список дел, бонусы и чат', target: null, done: () => player.action === 'phone' },
    { text: 'Поболтай с коллегой: встань перед его столом и жми E', target: () => ({ x: coworkers[1].x, y: coworkers[1].desk.y - 60 }), done: () => player.action === 'chat' || stats.chats > 0 },
    { text: 'Жёлтый конус — взгляд Д.Н. Прокрастинируешь в нём — растёт «?»', target: () => ({ x: boss.x, y: boss.y - 84 }), done: () => tutorial.t > 7 },
  ];
  function updateTutorial(dt) {
    if (tutorial.step >= TUTORIAL.length) return;
    tutorial.t += dt;
    const cur = TUTORIAL[tutorial.step];
    if (tutorial.step === 3 && (boss.state === 'office' || boss.state === 'gone')) { tutorial.t = 0; return; }
    if (cur.done()) {
      tutorial.step++;
      tutorial.t = 0;
      if (tutorial.step >= TUTORIAL.length) store.set('tutorialDone', true);
    }
  }
  function drawTutorial() {
    if (mode !== 'playing' || tutorial.step >= TUTORIAL.length) return;
    const cur = TUTORIAL[tutorial.step];
    if (tutorial.step === 3 && boss.state === 'office') return;
    const bounce = Math.sin(performance.now() / 180) * 3;
    if (cur.target) {
      const p = cur.target();
      ctx.fillStyle = '#f2bb38';
      ctx.beginPath(); ctx.moveTo(p.x - 6, p.y - 10 + bounce); ctx.lineTo(p.x + 6, p.y - 10 + bounce); ctx.lineTo(p.x, p.y + bounce); ctx.fill();
      ctx.strokeStyle = '#172027'; ctx.lineWidth = 1; ctx.stroke();
    }
    const k = uiK(1.55);
    const { VW, VH } = uiSpace(k);
    const lines = wrap(`💡 ${cur.text}`, coarsePointer ? VW * 0.55 : VW - 60, 10);
    ctx.font = `700 10px ${FONT_SANS}`;
    const w = Math.max(...lines.map(l => ctx.measureText(l).width)) + 22;
    const h = 7 + lines.length * 12;
    const y = Math.min(promptTop / k, VH - 24) - 4 - h;
    ctx.fillStyle = 'rgba(242,187,56,0.95)'; roundRect(VW / 2 - w / 2, y, w, h, 4); ctx.fill();
    lines.forEach((l, i) => T(l, VW / 2, y + 9.9 + i * 12, 10, '#172027', 'center', 700, FONT_SANS));
    ctx.setTransform(S, 0, 0, S, 0, 0);
  }

  // Выбор ответа на летучке: 1 / 2 / 3 или тап
  const choiceRects = [];
  function drawChoice() {
    choiceRects.length = 0;
    if (!choice || !choice.asked || choice.done || player.action !== 'standup' || mode !== 'playing') return;
    const k = uiK(1.65);
    choiceK = k;
    const { VW, VH } = uiSpace(k);
    const w = 420, h = 74, x = VW / 2 - w / 2, y = Math.min(VH - 150, VH - h - 40);
    ctx.fillStyle = 'rgba(8,16,20,0.94)'; roundRect(x, y, w, h, 4); ctx.fill();
    ctx.strokeStyle = '#f2bb38'; ctx.lineWidth = 1; ctx.stroke();
    T('Д.Н.: «Что по твоему направлению?» — выбери ответ', W / 2, y + 10, 9, '#f2bb38', 'center', 700, FONT_SANS);
    STANDUP_CHOICES.forEach((c, i) => {
      const bx = x + 10 + i * 134, by = y + 22, bw = 126, bh = 44;
      choiceRects.push({ x: bx, y: by, w: bw, h: bh, i });
      ctx.fillStyle = '#16303a'; roundRect(bx, by, bw, bh, 3); ctx.fill();
      T(c.key, bx + 12, by + bh / 2, 14, '#f2bb38', 'center', 900);
      const lines = wrap(c.text, bw - 30, 8.5);
      lines.forEach((l, n) => T(l, bx + 24, by + bh / 2 - (lines.length - 1) * 5 + n * 10, 8.5, '#fff', 'left', 700, FONT_SANS));
    });
    ctx.setTransform(S, 0, 0, S, 0, 0);
  }
  let choiceK = 1;
  let autoBadgeRect = null;
  canvas.addEventListener('pointerdown', e => {
    const r = canvasBox();
    if (autoBadgeRect && mode === 'playing') {
      const ax = (e.clientX - r.left) / r.width * W / autoBadgeK, ay = (e.clientY - r.top) / r.height * H / autoBadgeK;
      const b = autoBadgeRect;
      if (ax >= b.x && ax <= b.x + b.w && ay >= b.y - 3 && ay <= b.y + b.h + 3) { e.preventDefault(); toggleAutopilot(); return; }
    }
    if (!choiceRects.length) return;
    const gx = (e.clientX - r.left) / r.width * W / choiceK, gy = (e.clientY - r.top) / r.height * H / choiceK;
    const hit = choiceRects.find(c => gx >= c.x && gx <= c.x + c.w && gy >= c.y && gy <= c.y + c.h);
    if (hit) { e.preventDefault(); answerStandup(hit.i); }
  });
  let autoBadgeK = 1;
  function drawAutoBadge() {
    screenRects.auto = null;
    if (mode !== 'playing') return;
    const blink = Math.floor(performance.now() / 700) % 2 === 0;
    const key = coarsePointer ? '' : ' (O)';
    const text = auto.on
      ? `🍿 АВТОПИЛОТ ×${+timeScale.toFixed(2)} · ${auto.goal ? AUTO_LABELS[auto.goal.kind] || '' : 'думает…'} · ${coarsePointer ? 'тап — выключить' : 'WASD / O — взять управление'}`
      : `🍿 Автопилот${key}`;
    const k = uiK(1.6);
    autoBadgeK = k;
    const { VW, VH } = uiSpace(k);
    ctx.font = `700 8.5px ${FONT_SANS}`;
    const w = Math.min(ctx.measureText(text).width + 14, VW * 0.55);
    const y = compactHud() ? hudBottom() / k + 4 : VH - 20;
    ctx.fillStyle = auto.on ? 'rgba(8,16,20,0.88)' : 'rgba(8,16,20,0.62)'; roundRect(6, y, w, 15, 3); ctx.fill();
    screenRects.auto = { x: 6 * k, y: y * k, w: w * k, h: 15 * k };
    autoBadgeRect = { x: 6, y, w, h: 15 };
    R(6, y, 3, 15, auto.on ? (blink ? '#f2bb38' : '#c76ad8') : '#6d8a96');
    TE(text, 13, y + 7.8, 8.5, w - 12, auto.on ? '#f5edd9' : '#c8d6ca');
    ctx.setTransform(S, 0, 0, S, 0, 0);
  }
  const AUTO_LABELS = { desk: 'идёт работать', coffee: 'за кофе', smoke: 'на перекур', server: 'в серверную', fridge: 'к холодильнику', water: 'к кулеру', printer: 'печатать мем', toilet: 'в биотуалет', phone: 'залипает в телефон', chat: 'болтать', hide: 'прячется!', exit: 'к выходу', standup: 'на летучку', feast: 'за едой' };
  function drawObjective() {
    screenRects.obj = null;
    if (mode !== 'playing' || player.action === 'phone') return;
    if (compactHud() && banner) return; // на маленьком экране не спорим с баннером дня
    const next = todo.find(t => !t.done);
    const done = todo.filter(t => t.done).length;
    const text = next ? `📋 ${next.text}${next.goal > 1 ? ` ${Math.min(next.goal, todoProgress(next))}/${next.goal}` : ''}  ·  ${done}/${todo.length}` : `📋 Все дела сделаны! ${done}/${todo.length}`;
    const k = uiK(1.6);
    const { VW, VH } = uiSpace(k);
    const buzz = phoneBuzz > 0 && Math.floor(performance.now() / 200) % 2 === 0;
    const tab = buzz ? '📱 Tab ●' : '📱 Tab';
    ctx.font = `700 8.5px ${FONT_SANS}`;
    const tabW = coarsePointer ? 0 : ctx.measureText(tab).width + 8;
    const w = Math.min(ctx.measureText(text).width + 14 + tabW, VW * 0.5);
    const x = VW - w - 6;
    const y = compactHud() ? hudBottom() / k + 4 : VH - 20;
    ctx.fillStyle = 'rgba(8,16,20,0.85)'; roundRect(x, y, w, 15, 3); ctx.fill();
    screenRects.obj = { x: x * k, y: y * k, w: w * k, h: 15 * k };
    TE(text, x + 6, y + 7.8, 8.5, w - 12 - tabW, '#e8f2ee');
    if (tabW) T(tab, x + w - 6, y + 7.8, 8.5, buzz ? '#f2bb38' : '#9ab', 'right', 700, FONT_SANS);
    else if (buzz) T('●', x + w - 4, y + 3, 7, '#f2bb38');
    ctx.setTransform(S, 0, 0, S, 0, 0);
  }

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

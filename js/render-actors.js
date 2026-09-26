'use strict';
// «Не пались» — персонажи: кадры спрайтов, тени, Быкентий, Д.Н., коллеги, очередь в биотуалет.
// Общие переменные и функции объявлены на верхнем уровне и видны из других скриптов игры (без обёртки и модулей).
// Порядок подключения — в index.html.

  // ---------- ПЕРСОНАЖИ ----------
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

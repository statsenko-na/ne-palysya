'use strict';
// «Не пались» — отрисовка офиса: окна, часы, лучи, подсказки зон, конус взгляда, декор мебели, стол, биотуалет, стойки, сцена по глубине.
// Общие переменные и функции объявлены на верхнем уровне и видны из других скриптов игры (без обёртки и модулей).
// Порядок подключения — в index.html; см. docs/PLAN_SPLIT_GAME_JS.md.

  // ---------- ОФИС ----------
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

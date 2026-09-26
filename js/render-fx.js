'use strict';
// «Не пались» — поверх мира: реплики, значки над головами, частицы, опасность, баннер дня, освещение.
// Общие переменные и функции объявлены на верхнем уровне и видны из других скриптов игры (без обёртки и модулей).
// Порядок подключения — в index.html; см. docs/PLAN_SPLIT_GAME_JS.md.

  // ---------- РЕПЛИКИ И ЭФФЕКТЫ ----------
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

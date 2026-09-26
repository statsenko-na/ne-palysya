'use strict';
// «Не пались» — телефон Быкентия с перками и лентой.
// Общие переменные и функции объявлены на верхнем уровне и видны из других скриптов игры (без обёртки и модулей).
// Порядок подключения — в index.html.

  // ---------- ТЕЛЕФОН ----------
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

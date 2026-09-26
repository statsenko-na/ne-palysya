'use strict';
// «Не пались» — HUD (широкий и компактный), подсказка «что сделает E», рамка тревоги.
// Общие переменные и функции объявлены на верхнем уровне и видны из других скриптов игры (без обёртки и модулей).
// Порядок подключения — в index.html.

  // ---------- HUD ----------
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
    if (intelTimer > 0 && boss.state !== 'inspect') info.push(`📅 ${bossIntelStatusText()}`);
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

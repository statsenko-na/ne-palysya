'use strict';
// «Не пались» — телефон Быкентия с перками и лентой.
// Общие переменные и функции объявлены на верхнем уровне и видны из других скриптов игры (без обёртки и модулей).
// Порядок подключения — в index.html.

  // ---------- ТЕЛЕФОН ----------
  const PHONE_PAGES = Object.freeze(['todos', 'colleagues', 'reels']);
  const PHONE_PAGE_LABELS = Object.freeze({ todos: 'ДЕЛА', colleagues: 'КОЛЛЕГИ', reels: 'РИЛСЫ' });
  let phonePanelOpen = false;
  let phonePage = 'todos';
  let phoneHitboxes = [];
  let phoneHitScale = 1;
  let pinnedTaskId = typeof store.get('pinnedTaskId', null) === 'string' ? store.get('pinnedTaskId', null) : null;

  function pinTodoTask(id) {
    const task = todo.find(item => item.id === id && !item.done);
    if (!task) return false;
    pinnedTaskId = task.id;
    store.set('pinnedTaskId', pinnedTaskId);
    return true;
  }
  function refreshPinnedObjective() {
    if (!pinnedTaskId) return null;
    const pinned = todo.find(item => item.id === pinnedTaskId);
    if (pinned && !pinned.done) return pinned;
    const next = todo.find(item => !item.done) || null;
    pinnedTaskId = next ? next.id : null;
    store.set('pinnedTaskId', pinnedTaskId);
    return next;
  }
  function selectedObjectiveTodo() {
    if (pinnedTaskId) {
      const pinned = todo.find(item => item.id === pinnedTaskId);
      if (pinned && !pinned.done) return pinned;
    }
    return todo.find(item => !item.done) || null;
  }
  function openPhonePanel() {
    if (mode !== 'playing') return false;
    if (!phonePanelOpen) phonePage = player.action === 'phone' ? 'reels' : 'todos';
    phonePanelOpen = true;
    return true;
  }
  function closePhonePanel(resetPage = false, immediate = false) {
    phonePanelOpen = false;
    phoneHitboxes = [];
    if (resetPage) phonePage = 'todos';
    if (immediate) phoneAnim = 0;
    return true;
  }
  function togglePhonePanel() {
    if (phonePanelOpen) return closePhonePanel();
    if (!openPhonePanel()) return false;
    playSound('click');
    return true;
  }
  function selectPhonePage(page) {
    if (!PHONE_PAGES.includes(page) || mode !== 'playing') return false;
    if (page === 'todos' && player.action === 'phone') finishPhoneScrolling();
    if (page === 'reels' && player.action !== 'phone' && !startPhoneScrolling()) return false;
    phonePage = page;
    phonePanelOpen = true;
    playSound('click');
    return true;
  }
  function phonePanelHitboxAtClient(clientX, clientY) {
    if (!phonePanelOpen || mode !== 'playing' || phoneAnim < 0.75 || !phoneHitboxes.length) return null;
    const rect = canvasBox();
    const x = (clientX - rect.left) / rect.width * W / phoneHitScale;
    const y = (clientY - rect.top) / rect.height * H / phoneHitScale;
    return phoneHitboxes.find(box => x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h) || null;
  }
  function handlePhonePanelPointer(clientX, clientY) {
    const hit = phonePanelHitboxAtClient(clientX, clientY);
    if (!hit) return false;
    if (hit.type === 'page') selectPhonePage(hit.page);
    else if (hit.type === 'task') pinTodoTask(hit.id);
    else if (hit.type === 'close') closePhonePanel();
    return true;
  }
  function phoneRelationshipLine(id, entry) {
    const coworker = coworkerById(id);
    if (!coworker) return 'Коллеги нет на месте';
    if (coworker.remote) return 'На удалёнке — услуга недоступна';
    if (coworker.away) return 'Сейчас ушёл со стола';
    if (!unlocked('coworkers')) return 'Коллеги доступны со вторника';
    if (entry.mood === 'angry' && entry.angryThroughDay !== null && dayIndex <= entry.angryThroughDay) return 'Обижен — особая услуга закрыта';
    if (entry.favorUsedDay === dayIndex) return 'Помощь сегодня уже использована';
    if (coworker.cooldown > 0 || (coworker.slack && coworker.slackTimer > 0)) return 'Занят — попробуй позже';
    const eligibility = canRequestFavor(ensureRelationshipsExtension(), id, dayIndex);
    if (eligibility.canRequest) return 'Помощь есть · особая услуга пока не подключена';
    return entry.mood === 'friendly' ? 'Дружелюбен · пока без новой помощи' : 'Нужно заслужить помощь';
  }

  function perkLines() {
    const out = [];
    const liveResult = calculateCurrentShiftResult();
    out.push(['📋', planDone() ? `План ${Math.floor(usefulness)}/${planTarget} ✓ — дальше работа почти не нужна` : `План ${Math.floor(usefulness)}/${planTarget} к 19:30 (меньше ${Math.ceil(planTarget * CFG.planMinShare)} — выговор)`, planDone() ? '#9fe0b0' : '#f2bb38']);
    const dMax = diff().dayReprimandsMax, wMax = diff().weekReprimandsMax;
    out.push(['⚠️', `Выговоры: ${reprimands}/${dMax} за день · ${weekReprimands}/${wMax} за неделю`, (reprimands >= dMax - 1 || weekReprimands >= wMax - 1) ? '#ff9a8a' : '#f2bb38']);
    if (liveResult.ok) {
      const b = liveResult.breakdown;
      out.push(['⭐', `Очки сейчас: ${liveResult.score}`, '#e0a0f0']);
      out.push(['', `Кайф ${formatShiftResultValue(b.fun)} · план ${formatShiftResultValue(b.fullPlan)} · дела ${formatShiftResultValue(b.todos)}`, '#e0a0f0']);
      out.push(['', `Истории и хитрости ${formatShiftResultValue(b.moments)} · выговоры ${formatShiftResultValue(b.reprimands)}`, '#e0a0f0']);
    }
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
    phoneHitboxes = [];
    if (!phonePanelOpen && (mode === 'ended' || mode === 'menu')) phoneAnim = 0;
    if (phoneAnim <= 0 && !phonePanelOpen) return;
    const e = 1 - Math.pow(1 - phoneAnim, 3);
    const k = uiK(1.5);
    phoneHitScale = k;
    const { VW, VH } = uiSpace(k);
    const pageHeight = phonePage === 'todos' ? 235 : phonePage === 'colleagues' ? 280 : 260;
    const pw = 250, ph = Math.max(150, Math.min(pageHeight, VH - hudBottom() / k - 10));
    // на телефоне справа внизу сенсорные кнопки — сдвигаем телефон левее них
    const x = VW - pw - 18 - (coarsePointer ? 150 / (unitPx * k) : 0);
    const y = VH - ph * e - 6 + (1 - e) * 20;
    ctx.save();
    ctx.globalAlpha = Math.min(1, phoneAnim * 1.5);
    // корпус
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; roundRect(x + 4, y + 5, pw, ph, 16); ctx.fill();
    ctx.fillStyle = '#15191c'; roundRect(x, y, pw, ph, 16); ctx.fill();
    ctx.fillStyle = '#0d2a30'; roundRect(x + 7, y + 8, pw - 14, ph - 16, 11); ctx.fill();
    ctx.save(); roundRect(x + 7, y + 8, pw - 14, ph - 16, 11); ctx.clip();
    R(x + pw / 2 - 18, y + 11, 36, 5, '#15191c');
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.moveTo(x + pw - 30, y + 20); ctx.lineTo(x + pw - 48, y + 60); ctx.lineTo(x + pw - 40, y + 90); ctx.moveTo(x + pw - 48, y + 60); ctx.lineTo(x + pw - 70, y + 72); ctx.stroke();
    const cx = x + 16;
    T(timeString(clockMinutes), cx, y + 24, 8.5, '#fff', 'left', 700, FONT_SANS);
    T('Kcell  ▂▄▆  23%', x + pw - 31, y + 24, 7.5, '#9ab', 'right', 700, FONT_SANS);
    roundRect(x + pw - 25, y + 17, 16, 15, 3); ctx.fillStyle = '#26444a'; ctx.fill();
    T('×', x + pw - 17, y + 24, 11, '#e8f2ee');
    if (phonePanelOpen && phoneAnim >= 0.75) phoneHitboxes.push({ type: 'close', x: x + pw - 25, y: y + 17, w: 16, h: 15 });

    const tabY = y + 38;
    const tabW = (pw - 34) / PHONE_PAGES.length;
    PHONE_PAGES.forEach((page, i) => {
      const bx = x + 12 + i * (tabW + 5);
      roundRect(bx, tabY, tabW, 19, 3);
      ctx.fillStyle = phonePage === page ? '#356046' : '#172b30'; ctx.fill();
      T(PHONE_PAGE_LABELS[page], bx + tabW / 2, tabY + 9.5, 7.2, phonePage === page ? '#f2bb38' : '#aabbb5', 'center', 900, FONT_SANS);
      if (phonePanelOpen && phoneAnim >= 0.75) phoneHitboxes.push({ type: 'page', page, x: bx, y: tabY, w: tabW, h: 19 });
    });

    const bodyTop = y + 64;
    const bodyBottom = y + ph - 27;
    ctx.save();
    ctx.beginPath(); ctx.rect(x + 11, bodyTop, pw - 22, Math.max(0, bodyBottom - bodyTop)); ctx.clip();
    let cy = bodyTop + 8;
    if (phonePage === 'todos') {
      const done = todo.filter(task => task.done).length;
      T(`ДЕЛА НА СЕГОДНЯ · ${done}/${todo.length}`, cx, cy, 8.5, '#f2bb38', 'left', 900, FONT_SANS);
      cy += 12;
      const active = selectedObjectiveTodo();
      if (!active) {
        T(`Общий план: ${Math.floor(usefulness)}/${planTarget}`, cx, cy, 7.5, '#e8f2ee', 'left', 700, FONT_SANS);
        cy += 13;
      }
      for (const task of todo) {
        const rowH = 16;
        if (cy + rowH > bodyBottom - 14) break;
        const selected = !!active && task.id === active.id;
        roundRect(cx - 3, cy - 2, pw - 30, rowH - 1, 2);
        ctx.fillStyle = selected ? 'rgba(53,96,70,0.75)' : task.done ? 'rgba(47,154,90,0.18)' : 'rgba(255,255,255,0.05)'; ctx.fill();
        const prog = Math.min(task.goal, todoProgress(task));
        const label = `${task.done ? '✓' : selected ? '📌' : '○'} ${task.goal > 1 ? `${task.text} ${prog}/${task.goal}` : task.text}`;
        TE(label, cx, cy + 5.2, 7.2, pw - 38, task.done ? '#718b82' : '#e8f2ee', 'left', 700);
        if (!task.done && phonePanelOpen && phoneAnim >= 0.75) phoneHitboxes.push({ type: 'task', id: task.id, x: cx - 3, y: cy - 2, w: pw - 30, h: rowH - 1 });
        cy += rowH;
      }
      const live = calculateCurrentShiftResult();
      if (live.ok && cy + 12 <= bodyBottom) T(`Сейчас ${live.score} очков · ${Math.floor(usefulness)}/${planTarget} плана`, cx, cy + 5, 7, '#cfaedb', 'left', 700, FONT_SANS);
    } else if (phonePage === 'colleagues') {
      const state = ensureRelationshipsExtension();
      T('КОЛЛЕГИ · НЕДЕЛЬНЫЕ ОТНОШЕНИЯ', cx, cy, 7.2, '#f2bb38', 'left', 900, FONT_SANS);
      cy += 12;
      for (const id of RELATIONSHIP_NPC_IDS) {
        const coworker = coworkerById(id);
        const entry = state.entries[id];
        if (!entry || cy + 27 > bodyBottom) break;
        const name = coworker ? coworker.name : id;
        const mood = entry.mood === 'angry' && entry.angryThroughDay !== null && dayIndex <= entry.angryThroughDay
          ? 'ОБИЖЕН' : entry.mood === 'friendly' ? 'ДРУЖЕЛЮБЕН' : 'НЕЙТРАЛЕН';
        const moodColor = mood === 'ОБИЖЕН' ? '#ff9a8a' : mood === 'ДРУЖЕЛЮБЕН' ? '#9fe0b0' : '#aabbb5';
        TE(`${name} · ${mood}`, cx, cy + 4, 7.3, pw - 34, moodColor, 'left', 800);
        TE(phoneRelationshipLine(id, entry), cx + 2, cy + 15, 6.8, pw - 38, '#d5e0dc', 'left', 700);
        cy += 27;
      }
      const statusLines = perkLines().filter(line => ['🛡', '📅', '📱', '☕', '⏳'].includes(line[0]));
      if (statusLines.length && cy + 11 <= bodyBottom) {
        T('АКТИВНО', cx, cy + 4, 6.5, '#f2bb38', 'left', 900, FONT_SANS);
        cy += 11;
        for (const [icon, text, color] of statusLines) {
          if (cy + 9 > bodyBottom) break;
          TE(`${icon} ${text}`, cx, cy + 4, 6.6, pw - 34, color, 'left', 700);
          cy += 9;
        }
      }
    } else {
      const scrolling = player.action === 'phone';
      T(scrolling ? 'ТЫ ЛИСТАЕШЬ ЛЕНТУ' : 'ЛЕНТА ОСТАНОВЛЕНА', cx, cy, 8.5, scrolling ? '#ff9a8a' : '#aabbb5', 'left', 900, FONT_SANS);
      cy += 14;
      T('📱 +1.2 кайфа/с · Д.Н. и камеры могут заметить', cx, cy, 7, '#e8f2ee', 'left', 700, FONT_SANS);
      cy += 13;
      if (phoneSafe > 0) {
        T(`Приём Сиргея: ещё ${Math.ceil(phoneSafe)} с без палёва`, cx, cy, 7, '#9fe0b0', 'left', 700, FONT_SANS);
        cy += 13;
      }
      T('Дела — завершить просмотр и открыть список задач.', cx, cy, 6.8, '#aabbb5', 'left', 700, FONT_SANS);
      cy += 18;
      T('ПОСЛЕДНИЕ СОБЫТИЯ', cx, cy, 7.5, '#f2bb38', 'left', 900, FONT_SANS);
      cy += 12;
      for (const entry of logEntries.slice(0, 4)) {
        if (cy + 18 > bodyBottom) break;
        const color = entry.kind === 'good' ? '#9fe0b0' : entry.kind === 'bad' ? '#ff9a8a' : '#d5e0dc';
        TE(`${entry.time} · ${entry.text}`, cx, cy + 4, 6.8, pw - 34, color, 'left', 700);
        cy += 16;
      }
    }
    ctx.restore();
    const footer = phonePage === 'reels' && player.action === 'phone'
      ? 'Дела — остановить · Q / Tab — скрыть панель'
      : 'Q / Tab — скрыть · P — пауза';
    T(footer, x + pw / 2, y + ph - 14, 6.8, '#7a9a94', 'center', 700, FONT_SANS);
    ctx.restore();
    ctx.restore();
    ctx.setTransform(S, 0, 0, S, 0, 0);
  }

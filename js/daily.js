'use strict';
// «Не пались» — дейлик: ПН–ЧТ с 09:30 до 10:30 все сидят за своими компьютерами.
// Слушать честно — кайф тает, план чуть растёт. Рилсы за столом — кайф и план, но если Д.Н. спросит,
// а ты листаешь, — выговор. Не сел за стол к 09:35 — выговор (в понедельник только предупреждение).
// Общие переменные и функции объявлены на верхнем уровне и видны из других скриптов игры (без обёртки и модулей).
// Порядок подключения — в index.html.

  let dailyTestOff = false; // NP_DEBUG.setDailyEnabled(false): изолировать сценарии, которые не про дейлик
  function dailyState() {
    if (!day.dailyMeet) day.dailyMeet = { phase: 'idle', askT: 0, ask: 0, whineT: 0, talkT: 0, rep: false, lateChecked: false, reels: 0, listened: 0 };
    return day.dailyMeet;
  }
  const dailyToday = () => !!today().daily;
  const dailyActive = () => mode === 'playing' && !!day.dailyMeet && day.dailyMeet.phase === 'on';
  // Быкентий на дейлике: слушает за столом или листает рилсы, не вставая с места
  const dailyAtDesk = () => dist(player, SEAT) < 8;
  const dailyReelsSeated = () => dailyActive() && player.action === 'phone' && dailyAtDesk();
  const dailySeated = () => dailyActive() && (player.action === 'daily' || dailyReelsSeated());

  function startDaily() {
    const d = dailyState();
    d.phase = 'on';
    d.askT = 3 + rand() * 2;
    d.whineT = 1.5;
    d.talkT = 0.6;
    if (isBossDistractionState()) interruptBossDistraction('interrupted');
    banner = { text: 'ДЕЙЛИК · 09:30–10:30', sub: 'E у своего стола — на созвон. Рилсы в телефоне дают кайф и план, но Д.Н. может спросить. Не сядешь до 09:35 — выговор.', t: 0 };
    say('boss', pick(LINES.daily.start), 3);
    addLog('🎧 Дейлик: все за компьютерами, Д.Н. ведёт созвон из кабинета.', 'info');
    hint('daily', 'Дейлик: сиди за столом. Рилсы в телефоне — кайф и план, но если Д.Н. спросит тебя, убери их (E), иначе выговор.');
  }
  function endDaily() {
    const d = dailyState();
    d.phase = 'done';
    d.ask = 0;
    say('boss', pick(LINES.daily.end), 2.8);
    addLog(d.reels > d.listened ? 'Дейлик кончился. Быкентий досмотрел рилсы и ничего не запомнил.' : 'Дейлик кончился. Быкентий честно отсидел час созвона.', 'info');
    if (player.action === 'daily') endAction('done');
    if (boss.state === 'office') boss.stateTimer = 2 + rand() * 2;
    nextBossCheck = Math.max(nextBossCheck, 8);
  }
  // Д.Н. спросил Быкентия: время вышло — смотрим, чем он занят
  function resolveDailyQuestion() {
    const d = dailyState();
    if (dailyReelsSeated()) {
      if (!d.rep) {
        d.rep = true;
        say('boss', pick(LINES.daily.caught), 3.2, '#ff9a8a');
        reprimand('Д.Н. спросил на дейлике, а Быкентий листал рилсы', 'рилсы на дейлике');
      } else say('boss', 'Быкентий, я всё ещё вижу твои рилсы.', 2.6);
    } else if (player.action === 'daily') {
      say('player', pick(LINES.daily.answer), 2.8);
      addWork(CFG.dailyAnswerKpi);
      floater(player.x, player.y - 50, `+${CFG.dailyAnswerKpi} к плану`, '#9fe0b0');
    } else if (!d.rep && dailyToday() && dayIndex > 0) {
      d.rep = true;
      say('boss', pick(LINES.daily.late), 3);
      reprimand('Быкентия не было на дейлике, когда Д.Н. спросил', 'дейлик');
    }
  }
  function updateDaily(dt) {
    if (mode !== 'playing' || !dailyToday() || dailyTestOff) return;
    const d = dailyState();
    const m = clockMinutes;
    if (d.phase === 'idle' && m >= CFG.dailyStart + CFG.dailyLate) d.phase = 'done'; // часы перескочили начало дейлика (загрузка сохранения)
    if (d.phase === 'idle' && !d.warned && m >= CFG.dailyStart - 5 && m < CFG.dailyStart) {
      d.warned = true;
      say('boss', pick(LINES.daily.soon), 3.2);
      toast('🎧 В 09:30 дейлик: будь за своим столом.', 3);
    }
    if (d.phase === 'idle' && m >= CFG.dailyStart && m < CFG.dailyEnd && boss.state !== 'gone') startDaily();
    if (d.phase !== 'on') return;
    if (m >= CFG.dailyEnd) { endDaily(); return; }

    // Д.Н. сидит у себя: обходы и проверки подождут
    if (['patrol', 'look'].includes(boss.state)) bossGoTo(WD.bossHome, 'return', 'кабинет');
    if (boss.state === 'office') { boss.stateTimer = Math.max(boss.stateTimer, 2); boss.quoteTimer = Math.max(boss.quoteTimer, 2); }

    // Садимся: у своего стола — сразу на созвон; рилсы за столом — тоже сидя
    // Сидел в Excel или убрал телефон, не вставая, — остаётся на созвоне; иначе садится по E у стола
    if (!player.moving && (player.action === 'work' || (player.action === 'none' && dailyAtDesk()))) dailySit();
    const zone = currentZone();
    if (player.action === 'phone' && zone && zone.id === 'desk' && !player.moving) { player.x = SEAT.x; player.y = SEAT.y; }

    if (player.action === 'daily') {
      d.listened += dt;
      fun = Math.max(0, fun - CFG.dailyFunDrain * dt);
      addWork(CFG.dailyWork * dt);
    } else if (dailyReelsSeated()) {
      d.reels += dt;
      fun = Math.min(100, fun + CFG.dailyReelsFun * dt);
      addWork(CFG.dailyReelsWork * dt);
    }

    if (!d.lateChecked && m >= CFG.dailyStart + CFG.dailyLate) {
      d.lateChecked = true;
      if (!dailySeated()) {
        say('boss', pick(LINES.daily.late), 3);
        if (dayIndex > 0) { d.rep = true; reprimand('Быкентий прогулял дейлик', 'дейлик'); }
        else toast('⚠ В понедельник прощают. Со вторника пропуск дейлика — выговор.', 3.4);
      }
    }

    // Реплики: Д.Н. ведёт созвон, коллеги ноют на мьюте
    d.talkT -= dt;
    if (d.talkT <= 0 && boss.state === 'office' && d.ask <= 0) { say('boss', pick(LINES.daily.boss), 2.8); d.talkT = 5 + rand() * 3; }
    d.whineT -= dt;
    if (d.whineT <= 0) {
      const present = coworkers.filter(c => !c.away && !c.ghost);
      if (present.length) sayAmbient(pick(present).id, pick(LINES.daily.whine), '#dfe8ee');
      d.whineT = 3 + rand() * 2.5;
    }

    // Вопросы: иногда Д.Н. спрашивает Быкентия — есть пара секунд убрать рилсы
    if (d.ask > 0) {
      d.ask -= dt;
      if (d.ask <= 0) resolveDailyQuestion();
    } else if (boss.state === 'office') {
      d.askT -= dt;
      if (d.askT <= 0) {
        d.askT = CFG.dailyAskEvery[0] + rand() * (CFG.dailyAskEvery[1] - CFG.dailyAskEvery[0]);
        if (rand() < CFG.dailyAskPlayer) {
          d.ask = CFG.dailyAskWarn * diff().warn / 2;
          say('boss', pick(LINES.daily.ask), d.ask + 0.8, '#ffe08a');
          playSound('ahem');
        } else say('boss', pick(LINES.daily.boss), 2.8);
      }
    }
  }
  function dailySit() {
    if (player.action === 'work') endAction('cancel');
    player.x = SEAT.x; player.y = SEAT.y;
    startAction('daily', 0);
  }
  // E на дейлике: сесть на созвон у своего стола или быстро убрать рилсы, не вставая
  function dailyInteract() {
    if (!dailyActive()) return false;
    if (player.action === 'daily') { toast(coarsePointer ? '🎧 Ты на дейлике. Рилсы — в 📱 (палево).' : '🎧 Ты на дейлике. Рилсы — Q → «Рилсы» (палево).', 2); return true; }
    if (dailyReelsSeated()) { finishPhoneScrolling(); closePhonePanel(); dailySit(); return true; }
    const zone = currentZone();
    if (player.action === 'none' && zone && zone.id === 'desk') { dailySit(); playSound('click'); return true; }
    return false;
  }
  // Значки над головами и плашка созвона
  function drawDailyWorld() {
    if (!dailyActive()) return;
    const bob = Math.sin(performance.now() / 260) * 1.2;
    const heads = coworkers.filter(c => !c.away && !c.ghost).map(c => ({ x: c.x, y: c.y - 44 }));
    if (boss.state === 'office') heads.push({ x: boss.x, y: boss.y - 50 });
    if (dailySeated()) heads.push({ x: SEAT.x, y: DESK.y - 44 });
    heads.forEach(h => drawHeadset(h.x, h.y + 16 + bob));
    const d = dailyState();
    if (d.ask > 0 && boss.state === 'office') T('?!', boss.x, boss.y - 64 + bob, 12, '#ffe08a', 'center', 800);
  }
  // Пиксельная гарнитура поверх головы: дужка, чашки и микрофон
  function drawHeadset(x, y) {
    x = Math.round(x); y = Math.round(y);
    R(x - 7, y - 11, 14, 2, '#1c2328');
    R(x - 8, y - 9, 2, 3, '#1c2328'); R(x + 6, y - 9, 2, 3, '#1c2328');
    R(x - 9, y - 6, 4, 6, '#1c2328'); R(x + 5, y - 6, 4, 6, '#1c2328');
    R(x - 8, y - 5, 2, 4, '#e0433a'); R(x + 6, y - 5, 2, 4, '#e0433a');
    R(x - 5, y - 1, 5, 1, '#1c2328'); R(x - 1, y - 2, 2, 2, '#9aa7ad');
  }
  function drawDailyHud() {
    if (!dailyActive() || phonePanelOpen) return;
    const d = dailyState();
    const text = d.ask > 0
      ? (dailyReelsSeated() ? `⚠ Д.Н. спрашивает! ${coarsePointer ? 'Убери' : 'E — убери'} рилсы!` : '🎧 Д.Н. спрашивает тебя…')
      : dailySeated()
        ? (player.action === 'daily' ? `🎧 ДЕЙЛИК до 10:30 · ${coarsePointer ? '📱' : 'Q'} → рилсы (палево)` : `📱 Рилсы на дейлике · ${coarsePointer ? '📱' : 'E'} — убрать`)
        : `🎧 ДЕЙЛИК! ${coarsePointer ? 'Сядь' : 'E — сесть'} за свой стол`;
    const k = uiK(1.6);
    const { VW } = uiSpace(k);
    ctx.font = `700 9px ${FONT_SANS}`;
    const w = ctx.measureText(text).width + 16;
    const x = (VW - w) / 2;
    const y = compactHud() ? hudBottom() / k + 22 : 34;
    const alarm = d.ask > 0 && Math.floor(performance.now() / 180) % 2 === 0;
    ctx.fillStyle = alarm ? 'rgba(140,30,20,0.9)' : 'rgba(8,16,20,0.85)'; roundRect(x, y, w, 16, 3); ctx.fill();
    T(text, VW / 2, y + 8.4, 9, d.ask > 0 ? '#ffe08a' : '#e8f2ee', 'center', 700, FONT_SANS);
    ctx.setTransform(S, 0, 0, S, 0, 0);
  }

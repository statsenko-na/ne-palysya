'use strict';
// «Не пались» — магазин апгрейдов, онбординг «Как играть», задачи дня.
// Общие переменные и функции объявлены на верхнем уровне и видны из других скриптов игры (без обёртки и модулей).
// Порядок подключения — в index.html.

  // ---------- МАГАЗИН АПГРЕЙДОВ ----------
  let shopOpen = false;
  function renderShop() {
    if (!ui.shopList) return;
    ui.shopCoins.textContent = `${coins} ₭`;
    ui.shopList.innerHTML = UPGRADES.map(u => {
      const own = has(u.id);
      const can = !own && coins >= u.cost;
      return `<div class="shop-item${own ? ' owned' : ''}"><span class="ico">${u.icon}</span><span class="txt"><b>${u.name}</b><small>${u.desc}</small></span>` +
        `<button data-buy="${u.id}" ${own || !can ? 'disabled' : ''}>${own ? 'ЕСТЬ ✓' : `${u.cost} ₭`}</button></div>`;
    }).join('');
    ui.shopList.querySelectorAll('[data-buy]').forEach(b => addTap(b, () => buyUpgrade(b.dataset.buy)));
    const achEl = $('ach-list');
    if (achEl) {
      $('ach-count').textContent = `${achCount()}/${ACHIEVEMENTS.length}`;
      achEl.innerHTML = ACHIEVEMENTS.map(a => `<div class="ach${achieved[a.id] ? ' got' : ''}" title="${a.desc}"><span>${achieved[a.id] ? a.icon : '🔒'}</span><b>${a.name}</b><small>${a.desc}</small></div>`).join('');
    }
  }
  function buyUpgrade(id) {
    const u = UPGRADES.find(x => x.id === id);
    if (!u || has(id) || coins < u.cost) return false;
    coins -= u.cost;
    owned = { ...owned, [id]: true };
    store.set('coins', coins); store.set('upgrades', owned);
    playSound('coin');
    checkAchievements();
    renderShop();
    return true;
  }
  function openShop() {
    if (mode !== 'menu' && mode !== 'ended') return;
    shopOpen = true;
    playSound('click');
    renderShop();
    ui.shop.classList.remove('hidden');
  }
  function closeShop() {
    shopOpen = false;
    ui.shop.classList.add('hidden');
  }

  // Ползунок скорости времени (меню и пауза)
  function syncAudioButtons() {
    document.querySelectorAll('.music-toggle').forEach(b => { b.textContent = musicOn ? '🎵 Музыка: вкл (N)' : '🔇 Музыка: выкл (N)'; b.classList.toggle('off', !musicOn); });
    document.querySelectorAll('.sound-toggle').forEach(b => { b.textContent = muted ? '🔇 Звуки: выкл (M)' : '🔊 Звуки: вкл (M)'; b.classList.toggle('off', muted); });
    if (coarsePointer) document.querySelectorAll('.music-toggle, .sound-toggle').forEach(b => { b.textContent = b.textContent.replace(/ \([NM]\)$/, ''); });
    document.querySelectorAll('.vol-sfx').forEach(r => { r.value = String(sfxVol); });
    document.querySelectorAll('.vol-music').forEach(r => { r.value = String(musicVol); });
    document.querySelectorAll('.text-toggle').forEach(b => { b.textContent = bigText ? '🔠 Текст: крупный' : '🔠 Текст: обычный'; });
  }
  function toggleMusic() {
    musicOn = !musicOn;
    store.set('music', musicOn);
    toast(musicOn ? '🎵 Музыка включена (N)' : '🔇 Музыка выключена (N). Звуки остаются.', 1.6);
    syncAudioButtons();
  }
  function setDifficulty(k) {
    if (!DIFFICULTY[k]) return;
    diffKey = k;
    store.set('difficulty', k);
    document.querySelectorAll('[data-diff]').forEach(b => b.classList.toggle('on', b.dataset.diff === k));
  }
  function setTimeScale(v) {
    timeScale = clamp(Number(v) || 1, 0.5, 3);
    store.set('timeScale', timeScale);
    document.querySelectorAll('.speed-range').forEach(r => { r.value = String(timeScale); });
    document.querySelectorAll('.speed-val').forEach(el => { el.textContent = `×${+timeScale.toFixed(2)}`; });
  }
  // ---------- ОНБОРДИНГ «КАК ИГРАТЬ» ----------
  const onb = { open: false, i: 0, thenStart: false, el: $('onboarding') };
  // Первый запуск — только 3 ключевых слайда (цель, правила, Д.Н.); по I — полная справка
  const onbSlides = () => onb.el ? [...onb.el.querySelectorAll(onb.coreOnly ? '.onb-slide[data-core]' : '.onb-slide')] : [];
  function renderSlide() {
    const slides = onbSlides();
    onb.el.querySelectorAll('.onb-slide').forEach(sl => sl.classList.remove('active'));
    slides.forEach((sl, k) => sl.classList.toggle('active', k === onb.i));
    $('onb-num').textContent = `${onb.i + 1}/${slides.length}`;
    $('onb-dots').innerHTML = slides.map((_, k) => `<i class="${k === onb.i ? 'on' : ''}"></i>`).join('');
    $('onb-prev').style.visibility = onb.i ? 'visible' : 'hidden';
    const last = onb.i === slides.length - 1;
    $('onb-next').innerHTML = last ? (onb.thenStart ? 'НАЧАТЬ СМЕНУ ↵' : 'ПОНЯТНО ✓') : 'ДАЛЕЕ →';
  }
  function openOnboarding(thenStart = false) {
    if (!onb.el) return;
    if (mode === 'playing') setMode('paused');
    onb.open = true; onb.i = 0; onb.thenStart = thenStart; onb.coreOnly = thenStart;
    onb.el.classList.remove('hidden');
    ui.overlay.classList.add('hidden');
    renderSlide();
  }
  function closeOnboarding(start) {
    if (!onb.open) return;
    onb.open = false;
    onb.el.classList.add('hidden');
    ui.overlay.classList.toggle('hidden', mode !== 'menu');
    store.set('onboardingDone', true);
    if (start && onb.thenStart) resetGame();
  }
  function onbStep(d) {
    const n = onbSlides().length;
    if (onb.i + d >= n) { closeOnboarding(true); return; }
    onb.i = Math.max(0, onb.i + d);
    playSound('click');
    renderSlide();
  }

  function setMode(next) {
    mode = next;
    if (shopOpen) closeShop();
    ui.overlay.classList.toggle('hidden', next !== 'menu');
    ui.pause.classList.toggle('hidden', next !== 'paused');
    ui.end.classList.toggle('hidden', next !== 'ended');
    document.body.classList.toggle('is-playing', next === 'playing' || next === 'paused');
  }

  // Список дел — задачи дня (обучают тому, что открылось сегодня)
  function pickTodo() {
    return (today().tasks || []).map(id => LINES.dayTasks.find(t => t.id === id)).filter(Boolean).map(t => ({ ...t, done: false, day: true }));
  }
  function requiredEventForTodo(tasks) {
    const prerequisites = window.NP_CONFIG.TASK_EVENT_PREREQUISITES || {};
    const task = (tasks || []).find(t => !t.done && prerequisites[t.id]);
    if (!task) return null;
    const id = prerequisites[task.id];
    if (!EVENT_TIER[id] || !unlocked(EVENT_TIER[id])) return null;
    return { id, deadlineStart: 15 * 60, dispatched: false };
  }
  function todoProgress(t) {
    if (t.stat) return Math.floor(stats[t.stat] || 0);
    switch (t.id) {
      case 'chatAimashyn': return stats.chatted.has('aimashyn') ? 1 : 0;
      case 'chatHlad': return stats.chatted.has('hlad') ? 1 : 0;
      case 'cleanFriday': return clockMinutes >= 17 * 60 && reprimands === 0 ? 1 : 0;
      case 'planEarly': return stats.planAt && stats.planAt < 16 * 60 ? 1 : 0;
      default: return 0;
    }
  }
  function checkTodo() {
    for (const t of todo) {
      if (t.done) continue;
      if (todoProgress(t) >= t.goal) {
        t.done = true;
        addFun(8);
        playSound('success');
        toast(`✔ Выполнено: ${t.text}! +8 кайфа`, 2.6);
        addLog(`Список дел: «${t.text}» — готово.`, 'good');
        floater(player.x, player.y - 70, '✔ ДЕЛО СДЕЛАНО', '#f2bb38');
      }
    }
  }

  function resetGame(seed) {
    rngSeed = Number.isInteger(seed) ? seed : Math.floor(Date.now() % 100000); // seed — только для автотестов
    shiftId = createShiftId();
    autoUsed = false;
    recoveryGraceUsed = false;
    requiredEvent = null;
    actionChoiceState = null;
    saveExtensions = {};
    saveExtensionErrors = {};
    clockMinutes = CFG.shiftStart;
    shiftTime = 0;
    reprimands = 0;
    usefulness = 0;
    planTarget = Math.round((today().plan || 70) * diff().plan);
    fun = 0;
    resetStats();
    nextBossCheck = (CFG.firstCheck[0] + rand() * (CFG.firstCheck[1] - CFG.firstCheck[0])) * Math.max(1, diff().check);
    intelTimer = 0;
    coverTokens = 0;
    particles = []; floaters = []; bubbles = []; logEntries = [];
    todo = pickTodo();
    requiredEvent = requiredEventForTodo(todo);
    officeEvent = null;
    banner = null;
    tutorial = { step: store.get('tutorialDone', false) ? 99 : 0, t: 0 };
    nextEvent = 32 + rand() * 12;
    eventQueue = shuffleEvents();
    Object.assign(player, { x: SEAT.x, y: WD.ROW1_Y + 62, action: 'none', actionTimer: 0, actionTotal: 0, coffeeBoost: 0, speed: CFG.playerSpeed, chatWith: null, chatPair: null, chatReplied: false, hideSpot: null, hideT: 0, queueTarget: null, workFromFront: false, bumpCooldown: 0, walkTimer: 0, moving: false, facingX: -1 });
    for (const key of ['alarm', 'caught', 'coworker', 'emptyDesk', 'gaveUp', 'heat', 'lunchBack', 'noise', 'office', 'patrol', 'praise', 'scold', 'scoldTarget', 'seesPlayer', 'silentCheck', 'snus', 'snusCd', 'standupTalk', 'stroll', 'suspicious', 'waitT', 'watchingWork', 'outTimer', 'outWhy']) delete boss[key];
    Object.assign(boss, { x: WD.bossHome.x, y: WD.bossHome.y, state: 'office', stateTimer: 5, path: [], mode: 'patrol', spotDesc: 'кабинет', suspicion: 0, catchCooldown: 0, quoteTimer: 4, praiseTimer: 0, lookTimer: 0, inspectTimer: 0, visitedSpots: 0, warned: false, facing: Math.PI / 2, walkTimer: 0, moving: false });
    coworkers.forEach(c => { c.cooldown = 0; c.talkTimer = 0; c.idleTimer = 2 + rand() * 12; c.alert = 0; c.slack = null; c.slackTimer = 10 + rand() * 12; c.scoldCooldown = 0; c.rocketAt = 660 + rand() * 360; c.draftCd = 0; c.path = null; });
    banterT = 10 + rand() * 12; pendingSays.length = 0;
    day = {
      misses: 0, lunchCalled: false, lunchOpen: false, fed: false, hungry: false, bossLunch: false, beer: null,
      toiletCd: 0, queue: 0, queueTotal: 0, qShift: 0, knock: 3, cabinDoor: 0, npcInside: 0, npcTimer: 20,
      drillAwayTimer: 0, drillAwayIndex: 0, lunchAwayTimer: 0, lunchAwayIndex: 0, beerAwayTimer: 0, beerAwayIndex: 0,
      waterCups: 4, waterRecharge: 0,
      coffeeCups: 0, coffeeJammed: false, coffeeQueueTimer: 0, coffeeQueueChecked: false,
      excelWorkAcc: 0, overtimeWork: 0,
      adhocDone: false, adhocAt: 720 + Math.floor(rand() * 210),
      aljaziraTimer: 85 + rand() * 45, aljaziraVisiting: false,
      // Катастрофа Маджикистана: максимум раз в день, с шансом CFG.aljaziraDisasterChance, на визите после случайного часа 11:00–18:00
      aljaziraDisasterAt: rand() < CFG.aljaziraDisasterChance ? 11 * 60 + rand() * 7 * 60 : -1, aljaziraDisasterDone: false, aljaziraPhase: 'desk', aljaziraPhaseTimer: 0,
      lastSavedMinute: 0,
      pee: 0, peeActive: false, peeLeft: CFG.peeTimes[0] + Math.floor(rand() * (CFG.peeTimes[1] - CFG.peeTimes[0] + 1)), peeAt: 0,
    };
    day.vilka = dayIndex === 3; // четверг — стейки в «Вилке»
    day.peeAt = CFG.shiftStart + 50 + rand() * 90; // первый раз — между 09:40 и 11:10
    day.smog = unlocked('almaty') && dayIndex !== 4 && rand() < 0.3;
    day.traffic = unlocked('almaty') && !auto.on && rand() < 0.25;
    coworkers.forEach(c => { c.remote = c.extra && !c.ghost && !c.statist && !unlocked('row2'); c.away = c.remote; });
    walkers = [];
    choice = null; nudge = null;
    shownThisShift.clear();
    phoneSafe = 0;
    if (dayIndex === 0 && !store.get('currentSave', null)) {
      weekReprimands = 0; store.set('weekReprimands', 0);
    }
    const loadResult = loadSavedProgress();
    lastLoadResult = { ...loadResult };
    const hasSavedShift = loadResult.status !== 'new';
    if (!hasSavedShift && has('lava')) addFun(3);
    addLog(`${today().name}: ${today().mod}.`);
    if (hasSavedShift) {
      addLog(`Продолжение смены: ${timeString(clockMinutes)}, план ${Math.floor(usefulness)}/${planTarget}, кайф ${Math.round(fun)}.`, 'info');
    } else {
      addLog('08:50 — Быкентий пришёл в БЦ «Угар». Хвостик поправлен, в наушниках — «Кино».');
      addLog('Директор Начальникович пьёт чай в кабинете. Пока.');
      addLog('Напоминание: ты ответственный за Маджикистан. Там опять что-то моргает.');
    }
    if (dayIndex === 0 && !hasSavedShift) { majikArc = 0; store.set('majikArc', 0); }
    // Смог, пробка и удалёнка генерируются один раз до загрузки; v3 затем восстанавливает их точные значения.
    if (day.smog) addLog('Смог над Алматы: гор не видно, перекур без вида — кайфа меньше.', 'info');
    if (day.traffic && !hasSavedShift) {
      player.x = WD.exitDoor.x + 12; player.y = WD.exitDoor.y;
      nextBossCheck = Math.min(nextBossCheck, 9);
      addLog('Пробка на Аль-Фараби! Быкентий опоздал — беги к столу, пока Д.Н. не заметил.', 'bad');
    }
    setMode('playing');
    if (!hasSavedShift || loadResult.status === 'migrated') {
      const firstWeek = !store.get('weekDone', false);
      banner = { dur: firstWeek ? 8 : 4.4, text: `${today().name} · ДЕНЬ ${dayIndex + 1}/5 · ПЛАН ${planTarget}`, sub: firstWeek ? `${today().news} · ${today().mod}` : day.traffic ? 'Пробка на Аль-Фараби! Ты опоздал — беги к столу, Д.Н. скоро с проверкой.' : (day.smog ? `${today().mod} · Смог: гор не видно` : today().mod), t: 0 };
    }
    if (loadResult.status === 'migrated') saveProgress(); // заменяем v2 снимком v3 с уже использованной передышкой
    if (loadResult.status === 'new' && loadResult.reason && !['context_mismatch', 'autopilot'].includes(loadResult.reason)) toast('Сохранение смены повреждено; началась новая смена.', 3);
  }
  function enterFullscreen() {
    try {
      const el = document.documentElement;
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        if (el.requestFullscreen) {
          el.requestFullscreen().catch(() => {});
        } else if (el.webkitRequestFullscreen) {
          el.webkitRequestFullscreen();
        }
      }
      if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('landscape').catch(() => {});
      }
    } catch (_) {}
  }

  function startGame() {
    stopAutopilot();
    playSound('click');
    enterFullscreen();
    // Первый запуск: сначала подробный онбординг, потом смена
    if (!store.get('onboardingDone', false) && mode === 'menu') { openOnboarding(true); return; }
    resetGame();
  }
  function pauseGame() {
    playSound('click');
    if (mode === 'playing') { setMode('paused'); saveProgress(); }
    else if (mode === 'paused') setMode('playing');
  }

'use strict';
// «Не пались» — обработчики ввода и кнопок, NP_DEBUG, запуск игры.
// Общие переменные и функции объявлены на верхнем уровне и видны из других скриптов игры (без обёртки и модулей).
// Порядок подключения — в index.html; см. docs/PLAN_SPLIT_GAME_JS.md.

  // ---------- ОБРАБОТЧИКИ ----------
  // Переназначение клавиш: свои клавиши (KeyboardEvent.code → действие) работают вместе со стандартными
  const BIND_ACTIONS = [['w', 'Вверх', 'W'], ['s', 'Вниз', 'S'], ['a', 'Влево', 'A'], ['d', 'Вправо', 'D'], ['e', 'Действие', 'E'], ['h', 'Спрятаться', 'H'], ['q', 'Телефон', 'Q / Tab'], ['p', 'Пауза', 'P / Esc'], ['o', 'Автопилот', 'O']];
  let customKeys = store.get('bindings', {}) || {};
  let bindWait = null;
  let keysOpen = false;
  const codeLabel = c => c.replace(/^Key|^Digit/, '').replace(/^Arrow(.*)/, (_, d) => ({ Up: '↑', Down: '↓', Left: '←', Right: '→' }[d] || d)).replace('Numpad', 'Num ');
  function renderKeys() {
    const list = document.getElementById('keys-list');
    if (!list) return;
    list.innerHTML = BIND_ACTIONS.map(([k, name, def]) => {
      const mine = Object.keys(customKeys).filter(c => customKeys[c] === k).map(codeLabel).join(', ');
      const btn = bindWait === k ? 'нажми клавишу…' : 'Назначить';
      return `<div class="keys-row"><span>${name} <small>(${def})</small></span><kbd>${mine || '—'}</kbd><button class="audio-btn${bindWait === k ? ' wait' : ''}" data-bind="${k}">${btn}</button></div>`;
    }).join('');
    list.querySelectorAll('[data-bind]').forEach(b => addTap(b, () => { bindWait = b.dataset.bind; renderKeys(); }));
  }
  function openKeys() { keysOpen = true; bindWait = null; renderKeys(); document.getElementById('keys-overlay').classList.remove('hidden'); }
  function closeKeys() { keysOpen = false; bindWait = null; document.getElementById('keys-overlay').classList.add('hidden'); }
  const MOVE_KEYS = ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'];
  window.addEventListener('keydown', e => {
    if (bindWait) { // ждём новую клавишу для действия
      e.preventDefault();
      if (e.code && e.code !== 'Escape') {
        for (const c of Object.keys(customKeys)) if (customKeys[c] === bindWait) delete customKeys[c];
        customKeys[e.code] = bindWait; store.set('bindings', customKeys);
      }
      bindWait = null; renderKeys(); return;
    }
    if (keysOpen) { e.preventDefault(); if (e.key === 'Escape' || e.key === 'Enter') closeKeys(); return; }
    const key = getControlKey(e);
    if (MOVE_KEYS.includes(key) || ['e', 'h', 'p', 'q', 'o', 'enter', ' '].includes(key)) e.preventDefault();
    if (onb.open) {
      e.preventDefault();
      if (key === 'arrowright' || key === 'd' || key === 'enter' || key === 'e') onbStep(1);
      else if (key === 'arrowleft' || key === 'a') onbStep(-1);
      else if (key === 'escape' || key === 'i') closeOnboarding(false);
      return;
    }
    if (key === 'i' && (mode === 'menu' || mode === 'paused' || mode === 'ended')) { openOnboarding(false); return; }
    if (shopOpen) {
      if (key === 'escape' || key === 'u' || key === 'enter') { e.preventDefault(); closeShop(); }
      return;
    }
    if (key === 'u' && (mode === 'menu' || mode === 'ended')) { openShop(); return; }
    if (key === 'm') { muted = !muted; store.set('muted', muted); toast(muted ? 'Звук выключен (M)' : 'Звук включён (M)', 1.4); syncAudioButtons(); return; }
    if (key === 'n') { toggleMusic(); return; }
    if (key === 'escape' && player.action === 'phone' && mode === 'playing') { togglePhone(); return; }
    if (key === 'p' || key === 'escape') { if (mode === 'playing' || mode === 'paused') pauseGame(); return; }
    if (key === 'o' && mode === 'paused') { resumeOnAuto(); return; }
    if (key === 'enter') {
      if (mode === 'menu' || mode === 'ended') { startGame(); return; }
      if (mode === 'paused') { pauseGame(); return; }
    }
    if (mode !== 'playing') return;
    if (e.repeat && (key === 'e' || key === 'h')) return;
    if (key === 'e') { interact(); return; }
    if (key === 'o') { if (!e.repeat) toggleAutopilot(); return; }
    if (key === '1' || key === '2' || key === '3') { answerStandup(Number(key) - 1); return; }
    if (key === 'h') { quickHide(); return; }
    if (key === 'q') { if (!e.repeat) togglePhone(); return; }
    if (MOVE_KEYS.includes(key)) keys.add(key);
  });
  window.addEventListener('keyup', e => { keys.delete(getControlKey(e)); });
  window.addEventListener('blur', () => keys.clear());

  // Сенсорное управление: виртуальный стик + кнопки
  const stick = document.getElementById('stick');
  const knob = document.getElementById('stick-knob');
  const touchZoneLeft = document.getElementById('touch-zone-left');

  if (stick && knob) {
    let sid = null;
    let centerX = 0;
    let centerY = 0;

    const setDir = (dx, dy) => {
      // Порог чувствительности 0.22 — отзывчиво и без ложных подергиваний
      if (dx < -0.22) keys.add('a'); else keys.delete('a');
      if (dx > 0.22) keys.add('d'); else keys.delete('d');
      if (dy < -0.22) keys.add('w'); else keys.delete('w');
      if (dy > 0.22) keys.add('s'); else keys.delete('s');
      knob.style.transform = `translate(calc(-50% + ${dx * 36}px), calc(-50% + ${dy * 36}px))`;
    };

    const handleTouchStart = e => {
      if (sid !== null) return;
      const t = e.changedTouches[0];
      sid = t.identifier;
      getAudio();

      const r = stick.getBoundingClientRect();
      centerX = r.left + r.width / 2;
      centerY = r.top + r.height / 2;

      // Если касание далеко от стика (в левой зоне) — центрируем относительно точки касания
      const distFromStick = Math.hypot(t.clientX - centerX, t.clientY - centerY);
      if (distFromStick > r.width * 0.9) {
        centerX = t.clientX;
        centerY = t.clientY;
      }

      handleTouchMove(e);
      e.preventDefault();
    };

    const handleTouchMove = e => {
      const t = [...e.changedTouches].find(tt => tt.identifier === sid);
      if (!t) return;
      let dx = (t.clientX - centerX) / 42;
      let dy = (t.clientY - centerY) / 42;
      const len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      setDir(dx, dy);
      e.preventDefault();
    };

    const handleTouchEnd = e => {
      if ([...e.changedTouches].some(tt => tt.identifier === sid)) {
        sid = null;
        ['w', 'a', 's', 'd'].forEach(k => keys.delete(k));
        knob.style.transform = 'translate(-50%, -50%)';
      }
    };

    [stick, touchZoneLeft].filter(Boolean).forEach(el => {
      el.addEventListener('touchstart', handleTouchStart, { passive: false });
    });

    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd, { passive: false });
    window.addEventListener('touchcancel', handleTouchEnd, { passive: false });

    document.querySelectorAll('.tbtn').forEach(b => {
      const trigger = e => {
        e.preventDefault();
        getAudio();
        b.classList.add('active');
        const act = b.dataset.act;
        if (act === 'p') { if (mode === 'playing' || mode === 'paused') pauseGame(); return; }
        if (act === 'auto') { if (mode === 'playing') toggleAutopilot(); return; }
        if (mode !== 'playing') return;
        if (act === 'e') interact();
        else if (act === 'h') quickHide();
        else if (act === 'q') togglePhone();

      };
      b.addEventListener('touchstart', trigger, { passive: false });
      b.addEventListener('touchend', () => b.classList.remove('active'), { passive: true });
      b.addEventListener('touchcancel', () => b.classList.remove('active'), { passive: true });
    });
  }

  const addTap = (el, fn) => {
    if (!el) return;
    el.addEventListener('click', fn);
    el.addEventListener('touchend', e => {
      e.preventDefault();
      fn();
    }, { passive: false });
  };
  addTap(ui.start, startGame);
  addTap(ui.resume, pauseGame);
  addTap(ui.restart, startGame);
  ui.shopBtns.forEach(b => addTap(b, openShop));
  document.querySelectorAll('.auto-open').forEach(b => addTap(b, startAutopilot));
  const resumeOnAuto = () => { if (mode === 'paused') { setMode('playing'); if (!auto.on) toggleAutopilot(); } };
  document.querySelectorAll('.auto-resume').forEach(b => addTap(b, resumeOnAuto));
  document.querySelectorAll('.onb-open').forEach(b => addTap(b, () => openOnboarding(false)));
  addTap($('onb-next'), () => onbStep(1));
  addTap($('onb-prev'), () => onbStep(-1));
  addTap($('onb-skip'), () => closeOnboarding(true));
  addTap(ui.shopClose, closeShop);
  document.querySelectorAll('.speed-range').forEach(r => r.addEventListener('input', () => setTimeScale(r.value)));
  document.querySelectorAll('.vol-sfx').forEach(r => r.addEventListener('input', () => { sfxVol = clamp(Number(r.value), 0, 1); store.set('sfxVol', sfxVol); syncAudioButtons(); playSound('click'); }));
  document.querySelectorAll('.vol-music').forEach(r => r.addEventListener('input', () => { musicVol = clamp(Number(r.value), 0, 1); store.set('musicVol', musicVol); syncAudioButtons(); }));
  document.querySelectorAll('.keys-open').forEach(b => addTap(b, openKeys));
  document.querySelectorAll('.keys-close').forEach(b => addTap(b, closeKeys));
  document.querySelectorAll('.keys-reset').forEach(b => addTap(b, () => { customKeys = {}; store.set('bindings', customKeys); bindWait = null; renderKeys(); }));
  setTimeScale(timeScale);
  document.querySelectorAll('[data-diff]').forEach(b => addTap(b, () => { playSound('click'); setDifficulty(b.dataset.diff); }));
  setDifficulty(diffKey);
  document.querySelectorAll('.music-toggle').forEach(b => addTap(b, toggleMusic));
  document.querySelectorAll('.text-toggle').forEach(b => addTap(b, () => { bigText = !bigText; store.set('bigText', bigText); updateUiScale(); syncAudioButtons(); toast(bigText ? '🔠 Крупный текст включён' : '🔠 Обычный размер текста', 1.4); }));
  window.addEventListener('resize', updateUiScale);
  window.addEventListener('orientationchange', () => setTimeout(updateUiScale, 250));
  if (window.ResizeObserver) new ResizeObserver(updateUiScale).observe(canvas);
  updateUiScale();
  document.querySelectorAll('.sound-toggle').forEach(b => addTap(b, () => { muted = !muted; store.set('muted', muted); syncAudioButtons(); }));
  syncAudioButtons();

  // Отладочный доступ для автотестов (scripts/qa.js)
  // Отладочный API только для автотестов (Playwright выставляет navigator.webdriver) и по ?debug
  if (navigator.webdriver || new URLSearchParams(location.search).has('debug')) window.NP_DEBUG = {
    get state() { return { mode, player: { ...player }, boss: { ...boss, path: boss.path.length }, reprimands, weekReprimands, misses: day.misses, planTarget, usefulness, fun, clockMinutes, stats: { ...stats, chatted: stats.chatted.size }, todo, coverTokens, waterCups: day.waterCups, waterRecharge: day.waterRecharge, coffeeCups: day.coffeeCups, coffeeJammed: !!day.coffeeJammed, overtimeWork: day.overtimeWork || 0, excelWorkAcc: day.excelWorkAcc || 0, excelPoolTasks: day.excelPoolTasks || 0, adhocDone: !!day.adhocDone }; },
    teleport(x, y) { player.x = x; player.y = y; player.action = 'none'; player.actionTimer = 0; player.hideSpot = null; nudge = null; },
    setBoss(x, y, state = 'look', facing) { boss.snus = 0; boss.snusCd = 999; boss.x = x; boss.y = y; boss.state = state; boss.stateTimer = 99; boss.path = []; if (facing !== undefined) { boss.facing = facing; boss.lookTimer = 0; } },
    skip(seconds) { for (let i = 0; i < seconds * 20 && mode === 'playing'; i++) update(0.05); },
    setDay(d) { dayIndex = clampDay(d); },
    set(v) { if ('usefulness' in v) usefulness = v.usefulness; if ('reprimands' in v) reprimands = v.reprimands; if ('weekReprimands' in v) { weekReprimands = v.weekReprimands; store.set('weekReprimands', weekReprimands); } if ('misses' in v) day.misses = v.misses; if ('fun' in v) fun = Math.min(100, Math.max(0, v.fun)); if ('waterCups' in v) day.waterCups = v.waterCups; if ('waterRecharge' in v) day.waterRecharge = v.waterRecharge; if ('coffeeJammed' in v) day.coffeeJammed = !!v.coffeeJammed; if ('coffeeQueueTimer' in v && day) day.coffeeQueueTimer = v.coffeeQueueTimer; if ('overtimeWork' in v) day.overtimeWork = v.overtimeWork; if ('adhocDone' in v) day.adhocDone = !!v.adhocDone; if ('fed' in v) day.fed = !!v.fed; if ('noPee' in v) { day.peeActive = false; day.pee = 0; day.peeLeft = 0; } },
    interact, quickHide, togglePhone, startInspection, blocked, findPath, nav, startEvent,
    triggerAljazira(mood = 'neutral') {
      const c = coworkerById('aljazira');
      if (!c) return false;
      day.aljaziraVisiting = true;
      day.aljaziraPhase = 'walk_to';
      day.aljaziraForceMood = mood === false ? 'neutral' : mood;
      return true;
    },
    saveProgress, clearSavedProgress,
    say(owner, text, dur = 4) { say(owner, text, dur); },
    banterNow() { banterT = 0; updateBanter(0); updateBanter(2.1); return bubbles.map(b => b.owner); },
    get zones() { return WD.zones.map(z => z.id); },
    hideBanner() { banner = null; },
    get ui() { return { UI, unitPx, compact: compactHud(), hudBottom: hudBottom(), bigText }; },
    chatPerk(id) { grantPerk(coworkers.find(c => c.id === id)); }, setSuspicion(v) { boss.suspicion = v; },
    get event() { return officeEvent; },
    get flags() { return { ...day }; },
    get coins() { return coins; },
    get owned() { return { ...owned }; },
    get coworkers() { return coworkers.map(c => ({ id: c.id, away: c.away, slack: c.slack })); },
    setClock(mins) { shiftTime = (mins - CFG.shiftStart) / (CFG.shiftEnd - CFG.shiftStart) * CFG.shiftSeconds; clockMinutes = mins; if (mins < CFG.lunchOpen && day.lunchAway) { day.lunchAway = false; coworkers.forEach(c => { c.away = !!c.remote; }); } },
    setCoins(v) { coins = v; store.set('coins', v); },
    buyUpgrade, startAutopilot, stopAutopilot,
    get choice() { return choice && { ...choice }; },
    setUpgrades(o) { owned = { ...o }; },
    deskCheck() { finishDeskInspection(); },
    restart() { resetGame(); },
    addWork, reprimand,
    get unlocked() { return Object.fromEntries(Object.keys(UNLOCK).map(k => [k, unlocked(k)])); },
    get eventQueue() { return eventQueue.slice(); },
    finish(r) { finishGame(r); },
    clearEvents() { officeEvent = null; eventQueue = []; nextEvent = 999; nextBossCheck = 999; nudge = null; if (day) { day.coffeeQueueTimer = 0; day.coffeeQueueChecked = true; day.adhocDone = true; } },
    get onboarding() { return { open: onb.open, i: onb.i }; },
    get auto() { return { on: auto.on, demo: auto.demo, goal: auto.goal && auto.goal.kind }; },
    setAutoSlow(v) { auto.slow = v; },
    setDifficulty,
    get diffConfig() { return DIFFICULTY; },
    get aljazira() { const c = coworkerById('aljazira'); return { x: c.x, y: c.y, visiting: !!day.aljaziraVisiting, phase: day.aljaziraPhase, disasterDone: !!day.aljaziraDisasterDone, walking: !!day.aljaziraVisiting && day.aljaziraPhase !== 'confront' }; },
    get pee() { return { active: day.peeActive, pee: day.pee, left: day.peeLeft }; },
    forcePee(v = 5) { day.peeActive = true; day.pee = v; },
    forceSlack(id, kind = 'phone') { const c = coworkerById(id); c.slack = kind; c.slackTimer = 30; c.scoldCooldown = 0; c.alert = 0; },
    forceBeer() { day.beer = null; CFG.beerChance = 1; },
  };

  if (location.hash === '#play' || new URLSearchParams(location.search).has('play')) resetGame(); // быстрый старт для разработки, без онбординга
  else setMode('menu');
  requestAnimationFrame(loop);

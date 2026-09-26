'use strict';
// «Не пались» — холст, картинки, баланс из NP_CONFIG, сохранения, ввод, звук, музыка, утилиты, коллизии, навигация, состояние.
// Общие переменные и функции объявлены на верхнем уровне и видны из других скриптов игры (без обёртки и модулей).
// Порядок подключения — в index.html.


  const WD = window.NP_WORLD;
  const ART = window.NP_ART;
  const LINES = window.NP_LINES;
  const { W, H } = WD;
  const S = ART.S;
  const TAU = Math.PI * 2;
  const FONT = ART.FONT;
  const FONT_SANS = ART.FONT_SANS;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  canvas.width = W * S;
  canvas.height = H * S;

  // Версия в URL сбрасывает кэш браузера, когда спрайт заменён под тем же именем файла
  const ASSET_V = '0.22.0';
  function loadImage(src) { const i = new Image(); i.src = `${src}?v=${ASSET_V}`; return i; }
  const img = {
    vik: loadImage('assets/bykentiy-walk-v4.png'),
    boss: loadImage('assets/boss-walk-v3.png'), // 8 кадров шага + стойка (scripts/make_boss_walk.py)
    coworkers: loadImage('assets/coworkers-v3.png'),
    extras: loadImage('assets/extras-v1.png'),
    view: loadImage('assets/almaty-view-v1.png'),
    emblem: loadImage('assets/firdom-emblem.svg'),
  };
  const ready = im => im.complete && im.naturalWidth > 0;

  let art = ART.build();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { art = ART.build(); });

  // Баланс, сложность, апгрейды и неделя — js/config.js
  const { CFG, DIFFICULTY, UPGRADES, DAYS, UNLOCK, EVENT_TIER } = window.NP_CONFIG;
  const OFFICE_STORIES_RULESET_ID = 'office-stories-v1';
  const OFFICE_STORIES_LEGACY_RULESET_ID = 'office-stories-legacy-0.24.1';

  const store = {
    get(k, d) { try { const v = localStorage.getItem(`nepalsya.${k}`); return v === null ? d : JSON.parse(v); } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem(`nepalsya.${k}`, JSON.stringify(v)); } catch (_) { /* приватный режим */ } },
  };
  let dayIndex = clampDay(store.get('day', 0));
  let timeScale = clamp(Number(store.get('timeScale', 1)) || 1, 0.5, 3);
  let coins = store.get('coins', 0) | 0;
  let weekReprimands = store.get('weekReprimands', 0) | 0; // выговоры копятся за всю неделю
  let majikArc = store.get('majikArc', 0) | 0; // сюжет недели: сколько раз подняли/уронили Маджикистан
  let diffKey = DIFFICULTY[store.get('difficulty', 'normal')] ? store.get('difficulty', 'normal') : 'normal';
  const diff = () => DIFFICULTY[diffKey];
  let owned = store.get('upgrades', {}) || {};
  const has = id => !!owned[id];
  function clampDay(d) { return Math.max(0, Math.min(DAYS.length - 1, d | 0)); }
  const today = () => DAYS[dayIndex];
  const unlocked = f => store.get('weekDone', false) || dayIndex >= (UNLOCK[f] || 0);

  // Идентификатор живёт одну смену; отложенные callbacks сверяются с ним перед изменением игры.
  let shiftId = '';
  let shiftRulesetId = OFFICE_STORIES_RULESET_ID;
  let shiftSequence = 0;
  let autoUsed = false;
  let recoveryGraceUsed = false;
  let lastLoadResult = { status: 'new', reason: null };
  let requiredEvent = null;
  let actionChoiceState = null;
  let saveExtensions = {};
  let saveExtensionErrors = {};
  function createShiftId() {
    shiftSequence++;
    return `shift-${Date.now().toString(36)}-${shiftSequence.toString(36)}-${rngSeed.toString(36)}`;
  }
  function scheduleShiftCallback(callback, delayMs) {
    const expectedShiftId = shiftId;
    return setTimeout(() => {
      if (shiftId !== expectedShiftId || mode !== 'playing') return;
      callback();
    }, delayMs);
  }

  function saveProgress() {
    if ((mode !== 'playing' && mode !== 'paused') || (auto.on && auto.demo)) return { ok: false, reason: 'save_unavailable' };
    const extensionErrors = { ...saveExtensionErrors };
    if (extensionErrors.moments && saveExtensions.moments && typeof saveExtensions.moments === 'object' && !Array.isArray(saveExtensions.moments)) delete extensionErrors.moments;
    const relationshipState = saveExtensions.relationships;
    const relationshipCheck = relationshipState && relationshipState.dayIndex === dayIndex
      ? advanceRelationshipsDay(relationshipState, dayIndex)
      : null;
    if (extensionErrors.relationships && relationshipCheck && relationshipCheck.ok) delete extensionErrors.relationships;
    const result = makeSaveSnapshot({
      shiftId, rulesetId: shiftRulesetId, dayIndex, diffKey, clockMinutes, usefulness, fun, reprimands, weekReprimands, planTarget, majikArc, rngSeed,
      day, player, boss, coworkers, nextBossCheck, intelTimer, coverTokens, phoneSafe, nextDrill, todo,
      stats: { ...stats, chatted: Array.from(stats.chatted || []) }, officeEvent, eventQueue, nextEvent, requiredEvent,
      choice, actionChoice: actionChoiceState, banner, tutorial, nudge, banterT, autoUsed, demo: !!auto.demo,
      recoveryGraceUsed, extensions: saveExtensions, extensionErrors,
    });
    if (!result.ok) return result;
    saveExtensionErrors = { ...result.snapshot.extensionErrors };
    store.set('currentSave', result.snapshot);
    return result;
  }

  function clearSaveExtensionError(key) {
    if (!Object.prototype.hasOwnProperty.call(saveExtensionErrors, key)) return false;
    delete saveExtensionErrors[key];
    return true;
  }

  function ensureMomentsExtension() {
    const state = saveExtensions.moments;
    if (!state || typeof state !== 'object' || Array.isArray(state)) {
      saveExtensions.moments = createMoments();
    }
    return saveExtensions.moments;
  }

  function relationshipStateForDay(state, targetDay = dayIndex) {
    if (!state || typeof state !== 'object' || Array.isArray(state)) return { ok: false, state, effects: [], reason: 'invalid_state' };
    if (state.dayIndex !== null && Number.isInteger(state.dayIndex) && state.dayIndex > targetDay) {
      return { ok: false, state, effects: [], reason: 'day_mismatch' };
    }
    return advanceRelationshipsDay(state, targetDay);
  }

  function ensureRelationshipsExtension() {
    const hasState = Object.prototype.hasOwnProperty.call(saveExtensions, 'relationships');
    const current = saveExtensions.relationships;
    const result = current ? relationshipStateForDay(current, dayIndex) : null;
    if (!result || !result.ok) {
      if (hasState && !saveExtensionErrors.relationships) saveExtensionErrors.relationships = result?.reason || 'invalid_state';
      saveExtensions.relationships = relationshipStateForDay(createRelationships(), dayIndex).state;
    } else {
      saveExtensions.relationships = result.state;
    }
    return saveExtensions.relationships;
  }

  function recordRelationshipEvent(npcId, kind, eventId) {
    const result = applyRelationshipEvent(ensureRelationshipsExtension(), { npcId, kind, eventId, dayIndex });
    if (result.ok) saveExtensions.relationships = result.state;
    return result;
  }

  function restoreSavedTodos(saved, useCurrentWhenEmpty = false) {
    const restored = (saved || []).map(t => {
      const definition = LINES.dayTasks.find(q => q.id === t.id);
      return definition && { ...definition, done: !!t.done, day: true };
    }).filter(Boolean);
    if (restored.length || !useCurrentWhenEmpty) todo = restored;
  }

  function loadSavedProgress() {
    const raw = store.get('currentSave', null);
    if (!raw) return { status: 'new', reason: null };
    let checked;
    let migrated = false;
    if (raw.v === 2) {
      checked = migrateSaveV2(raw);
      migrated = true;
    } else if (raw.v === 3) checked = validateSaveSnapshot(raw);
    else return { status: 'new', reason: 'unsupported_version' };
    if (!checked.ok) return { status: 'new', reason: checked.reason };
    const s = checked.snapshot;
    if (s.dayIndex !== dayIndex || s.diffKey !== diffKey) return { status: 'new', reason: 'context_mismatch' };
    if (auto.on) return { status: 'new', reason: 'autopilot' };

    clockMinutes = s.clockMinutes;
    shiftTime = ((clockMinutes - CFG.shiftStart) / (CFG.shiftEnd - CFG.shiftStart)) * CFG.shiftSeconds;
    usefulness = s.usefulness;
    fun = s.fun;
    reprimands = s.reprimands;
    weekReprimands = s.weekReprimands; store.set('weekReprimands', weekReprimands);
    planTarget = s.planTarget;
    majikArc = s.majikArc;
    Object.assign(day, s.day || {});
    restoreSavedTodos(s.todo, migrated);
    if (s.stats) { Object.assign(stats, s.stats); stats.chatted = new Set(s.stats.chatted || []); }
    officeEvent = s.officeEvent && EVENTS[s.officeEvent.id] ? { ...EVENTS[s.officeEvent.id], ...s.officeEvent } : null;
    requiredEvent = s.requiredEvent || requiredEventForTodo(todo);
    if (requiredEvent && (officeEvent?.id === requiredEvent.id || day.majikFail || stats.majikFixed > 0)) requiredEvent.dispatched = true;

    if (migrated) {
      shiftId = createShiftId();
      shiftRulesetId = OFFICE_STORIES_LEGACY_RULESET_ID;
      ensureMomentsExtension();
      recoveryGraceUsed = true;
      nextBossCheck = Math.max(nextBossCheck, 20);
      player.x = SEAT.x; player.y = SEAT.y; player.action = 'none'; player.actionTimer = 0; player.actionTotal = 0;
      player.queueTarget = null; player.chatWith = null; player.hideSpot = null;
      if (day.lunchAway) coworkers.forEach(c => { if (!c.ghost) c.away = true; });
      ensureRequiredEventQueue();
      return { status: 'migrated', reason: null };
    }

    shiftId = s.shiftId;
    shiftRulesetId = s.rulesetId || OFFICE_STORIES_LEGACY_RULESET_ID;
    rngSeed = s.rngSeed;
    autoUsed = !!s.autoUsed;
    recoveryGraceUsed = !!s.recoveryGraceUsed;
    auto.demo = !!s.demo;
    nextBossCheck = s.nextBossCheck;
    intelTimer = s.intelTimer || 0;
    coverTokens = s.coverTokens || 0;
    phoneSafe = s.phoneSafe || 0;
    nextDrill = s.nextDrill || 0;
    eventQueue = s.eventQueue.slice();
    ensureRequiredEventQueue();
    nextEvent = s.nextEvent;
    choice = s.choice || null;
    actionChoiceState = s.actionChoice || null;
    banner = s.banner || null;
    tutorial = s.tutorial || tutorial;
    nudge = s.nudge || null;
    banterT = s.banterT || 0;
    saveExtensions = s.extensions || {};
    saveExtensionErrors = s.extensionErrors || {};
    ensureMomentsExtension();
    Object.assign(player, s.player);
    Object.assign(boss, s.boss);
    coworkers.forEach(c => {
      const saved = s.coworkers.find(item => item.id === c.id);
      if (!saved) return;
      Object.assign(c, saved);
      if (Object.prototype.hasOwnProperty.call(saved, 'path')) c.path = saved.path;
    });
    boss.path = Array.isArray(s.boss.path) ? s.boss.path : [];
    if (player.action === 'work') { player.x = SEAT.x; player.y = SEAT.y; }
    else if (player.action === 'toilet') { player.x = WD.toiletDoor.x; player.y = WD.toiletDoor.y; }
    else if (player.action === 'queue') {
      if (day.queue > 0 && typeof queueSlot === 'function') player.queueTarget = queueSlot(day.queue);
      else { player.action = 'none'; player.actionTimer = 0; }
    }
    return { status: 'resumed', reason: null };
  }
  function clearSavedProgress() {
    store.set('currentSave', null);
  }
  // Закрыл вкладку, свернул браузер или телефон ушёл в сон — сохраняем сразу, не дожидаясь 15 игровых минут
  window.addEventListener('pagehide', () => saveProgress());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveProgress(); });
  // Просим браузер не чистить хранилище автоматически (Safari/Chrome могут стереть данные «неважного» сайта)
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (_) { /* нет API */ }

  // ---------- ВВОД ----------
  const keys = new Set();
  const physicalKeyAliases = {
    KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd',
    KeyE: 'e', KeyH: 'h', KeyP: 'p', KeyQ: 'q', KeyM: 'm', KeyU: 'u', KeyI: 'i', KeyO: 'o', KeyN: 'n', Digit1: '1', Digit2: '2', Digit3: '3', Numpad1: '1', Numpad2: '2', Numpad3: '3', Space: 'e', Tab: 'q',
  };
  const russianKeyAliases = { ц: 'w', ф: 'a', ы: 's', в: 'd', у: 'e', р: 'h', з: 'p', й: 'q', ь: 'm', г: 'u', ш: 'i', щ: 'o', т: 'n' };
  function getControlKey(event) {
    const key = (event.key || '').toLowerCase();
    return customKeys[event.code] || physicalKeyAliases[event.code] || russianKeyAliases[key] || key;
  }
  window.NP_getControlKey = getControlKey; // для автотеста раскладок

  // ---------- ЗВУК (Web Audio, без файлов) ----------
  let audioCtx = null;
  let muted = false;
  let musicOn = true;
  try { musicOn = localStorage.getItem('nepalsya.music') !== 'false'; } catch (_) { /* нет доступа */ }
  try { muted = localStorage.getItem('nepalsya.muted') === 'true'; } catch (_) { /* нет доступа */ }
  // Громкость 0..1 отдельно для звуков и музыки
  let sfxVol = clamp(Number(store.get('sfxVol', 1)), 0, 1);
  let musicVol = clamp(Number(store.get('musicVol', 1)), 0, 1);
  function getAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }
  function tone(type, f0, f1, dur, vol, delay = 0, bus = 'sfx') {
    const k = bus === 'music' ? musicVol : sfxVol;
    if (muted || k <= 0) return;
    vol *= k;
    const a = getAudio();
    if (!a) return;
    const t = a.currentTime + delay;
    const o = a.createOscillator();
    const gn = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    gn.gain.setValueAtTime(vol, t);
    gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(gn); gn.connect(a.destination);
    o.start(t); o.stop(t + dur);
  }
  function playSound(type) {
    try {
      if (type === 'click') tone('triangle', 480, 140, 0.05, 0.08);
      else if (type === 'coffee') { tone('sine', 340, 680, 0.2, 0.1); tone('sine', 500, 900, 0.15, 0.05, 0.12); }
      else if (type === 'smoke') tone('sine', 190, 120, 0.3, 0.06);
      else if (type === 'hide') tone('triangle', 280, 110, 0.14, 0.1);
      else if (type === 'alarm') { tone('sawtooth', 600, 0, 0.12, 0.12); tone('sawtooth', 840, 0, 0.12, 0.12, 0.13); tone('sawtooth', 600, 0, 0.14, 0.12, 0.26); }
      else if (type === 'caught') tone('sawtooth', 220, 50, 0.55, 0.22);
      else if (type === 'ahem') { tone('square', 140, 90, 0.12, 0.05); tone('square', 120, 80, 0.14, 0.05, 0.16); }
      else if (type === 'blip') tone('square', 620 + Math.random() * 300, 0, 0.04, 0.025);
      else if (type === 'bossBlip') tone('square', 150 + Math.random() * 60, 0, 0.06, 0.04);
      else if (type === 'success') { tone('triangle', 520, 0, 0.1, 0.08); tone('triangle', 780, 0, 0.16, 0.08, 0.1); }
      else if (type === 'bump') tone('sine', 90, 60, 0.07, 0.07);
      else if (type === 'suspect') tone('triangle', 700, 900, 0.1, 0.05);
      else if (type === 'kpi') tone('sine', 900, 1300, 0.06, 0.03);
      else if (type === 'thump') { tone('sine', 70, 40, 0.12, 0.16); tone('sine', 64, 38, 0.1, 0.1, 0.16); }
      else if (type === 'siren') { for (let i = 0; i < 4; i++) tone('sawtooth', 520, 900, 0.22, 0.07, i * 0.24); }
      else if (type === 'drill') { for (let i = 0; i < 6; i++) tone('square', 90 + Math.random() * 40, 0, 0.05, 0.035, i * 0.06); }
      else if (type === 'flush') { tone('sine', 420, 90, 0.35, 0.08); tone('sine', 220, 900, 0.12, 0.05, 0.3); tone('sine', 300, 1100, 0.1, 0.04, 0.42); }
      else if (type === 'slam') { tone('square', 140, 60, 0.07, 0.1); tone('triangle', 260, 120, 0.09, 0.06, 0.03); }
      else if (type === 'knock') { tone('square', 200, 150, 0.04, 0.06); tone('square', 200, 150, 0.04, 0.06, 0.12); tone('square', 200, 150, 0.04, 0.06, 0.24); }
      else if (type === 'clink') { tone('triangle', 1400, 0, 0.12, 0.07); tone('triangle', 1800, 0, 0.2, 0.05, 0.08); }
      else if (type === 'coin') { tone('square', 880, 0, 0.06, 0.05); tone('square', 1320, 0, 0.12, 0.05, 0.06); }
    } catch (_) { /* звук необязателен */ }
  }

  // ---------- ФОНОВАЯ МУЗЫКА (процедурный чиптюн, без файлов) ----------
  // Ленивый офисный грув; во время проверки — быстрее и тревожнее. M выключает вместе со звуком.
  const BASS = [110, 110, 131, 98, 110, 110, 147, 131];
  const ARP = [440, 523, 659, 523, 494, 587, 740, 587];
  let musicStep = 0;
  let musicTimer = 0;
  function updateMusic(dt) {
    if (muted || !musicOn || mode !== 'playing' || !audioCtx) return;
    const alarm = boss.state === 'inspect';
    musicTimer -= dt;
    if (musicTimer > 0) return;
    musicTimer = alarm ? 0.16 : 0.26;
    const i = musicStep++ % 8;
    const pitch = alarm ? 1.06 : 1;
    if (musicStep % 2) tone('triangle', BASS[i] * pitch, 0, 0.22, 0.035, 0, 'music');
    tone('square', ARP[(i + (musicStep >> 3)) % 8] * pitch, 0, 0.09, 0.012, 0, 'music');
    if (alarm && musicStep % 2 === 0) tone('sawtooth', 1800, 900, 0.03, 0.01, 0, 'music');
  }

  // ---------- DOM ----------
  const $ = id => document.getElementById(id);
  const ui = {
    overlay: $('screen-overlay'), pause: $('pause-overlay'), end: $('end-overlay'), endCard: $('end-card'),
    start: $('start-btn'), resume: $('resume-btn'), restart: $('restart-btn'),
    toast: $('toast'), endKicker: $('end-kicker'), endTitle: $('end-title'), endCopy: $('end-copy'), endResult: $('end-result'), endStats: $('end-stats'),
    grade: $('end-grade'),
    shop: $('shop-overlay'), shopList: $('shop-list'), shopCoins: $('shop-coins'), shopClose: $('shop-close'),
    shopBtns: document.querySelectorAll('.shop-open'), endCoins: $('end-coins'),
  };

  // ---------- УТИЛИТЫ ----------
  let rngSeed = 42;
  function rand() { rngSeed = (rngSeed * 9301 + 49297) % 233280; return rngSeed / 233280; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const pick = arr => arr[Math.floor(rand() * arr.length)];
  const rectContains = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  function angleDiff(a, b) { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; }

  // ---------- КОЛЛИЗИИ ----------
  function circleHitsRect(x, y, r, c) {
    const nx = clamp(x, c.x, c.x + c.w);
    const ny = clamp(y, c.y, c.y + c.h);
    return (x - nx) * (x - nx) + (y - ny) * (y - ny) < r * r;
  }
  function blocked(x, y, r) {
    for (const c of WD.colliders) if (circleHitsRect(x, y, r, c)) return true;
    return false;
  }
  // Ближайшая свободная точка по спирали: спасает, если Быкентия поставило внутрь коллайдера
  function unstickPlayer() {
    for (let rad = 4; rad <= 80; rad += 4) {
      for (let k = 0; k < 16; k++) {
        const ang = k / 16 * Math.PI * 2, x = player.x + Math.cos(ang) * rad, y = player.y + Math.sin(ang) * rad;
        if (!blocked(x, y, player.r)) { player.x = x; player.y = y; return true; }
      }
    }
    return false;
  }
  function moveWithCollision(e, dx, dy, r) {
    let hit = false;
    if (dx) { if (!blocked(e.x + dx, e.y, r)) e.x += dx; else hit = true; }
    if (dy) { if (!blocked(e.x, e.y + dy, r)) e.y += dy; else hit = true; }
    return hit;
  }
  function segmentClear(a, b, r, list = WD.colliders) {
    const d = dist(a, b);
    const steps = Math.max(1, Math.ceil(d / 3));
    for (let i = 0; i <= steps; i++) {
      const x = a.x + (b.x - a.x) * (i / steps);
      const y = a.y + (b.y - a.y) * (i / steps);
      for (const c of list) if (circleHitsRect(x, y, r, c)) return false;
    }
    return true;
  }
  // Линия взгляда: мешают только непрозрачные стены (стекло балкона прозрачно)
  const sightBlockers = WD.walls.filter(w => w.kind !== 'glass');
  const lineOfSight = (a, b) => segmentClear(a, b, 0.5, sightBlockers);

  // ---------- НАВИГАЦИЯ ----------
  const NAV_R = 6;
  const nav = WD.navNodes.map((n, i) => ({ ...n, i, edges: [] }));
  for (let i = 0; i < nav.length; i++) {
    for (let j = i + 1; j < nav.length; j++) {
      if (dist(nav[i], nav[j]) < 260 && segmentClear(nav[i], nav[j], NAV_R)) {
        const w = dist(nav[i], nav[j]);
        nav[i].edges.push([j, w]);
        nav[j].edges.push([i, w]);
      }
    }
  }
  function findPath(from, to) {
    if (segmentClear(from, to, NAV_R - 1)) return [{ x: to.x, y: to.y }];
    let startLinks = nav.filter(n => segmentClear(from, n, NAV_R - 1)).map(n => [n.i, dist(from, n)]);
    // Узкий карман (у биотуалета, между шкафами) — пробуем тоньше, иначе «прямо в стену» и автопилот стоит
    if (!startLinks.length) startLinks = nav.filter(n => segmentClear(from, n, 2)).map(n => [n.i, dist(from, n)]);
    let endLinks = new Map(nav.filter(n => segmentClear(n, to, NAV_R - 1)).map(n => [n.i, dist(n, to)]));
    if (!endLinks.size) endLinks = new Map(nav.filter(n => segmentClear(n, to, 2)).map(n => [n.i, dist(n, to)]));
    // Цель или старт внутри мебели — цепляемся за ближайшие узлы, а не идём «прямо в стену»
    const nearest = p => nav.slice().sort((a, b) => dist(a, p) - dist(b, p)).slice(0, 3);
    if (!startLinks.length) startLinks = nearest(from).map(n => [n.i, dist(from, n)]);
    if (!endLinks.size) endLinks = new Map(nearest(to).map(n => [n.i, dist(n, to)]));
    const best = new Array(nav.length).fill(Infinity);
    const prev = new Array(nav.length).fill(-1);
    const open = [];
    for (const [i, w] of startLinks) { best[i] = w; open.push(i); }
    let goal = -1;
    let goalCost = Infinity;
    while (open.length) {
      open.sort((a, b) => best[a] - best[b]);
      const cur = open.shift();
      if (best[cur] >= goalCost) break;
      if (endLinks.has(cur) && best[cur] + endLinks.get(cur) < goalCost) { goalCost = best[cur] + endLinks.get(cur); goal = cur; }
      for (const [j, w] of nav[cur].edges) {
        if (best[cur] + w < best[j]) { best[j] = best[cur] + w; prev[j] = cur; if (!open.includes(j)) open.push(j); }
      }
    }
    if (goal < 0) return [{ x: to.x, y: to.y }];
    const path = [{ x: to.x, y: to.y }];
    for (let n = goal; n >= 0; n = prev[n]) path.unshift({ x: nav[n].x, y: nav[n].y });
    return path;
  }

  // ---------- СОСТОЯНИЕ ----------
  const DESK = WD.playerDesk;
  const SEAT = { x: DESK.seatX, y: DESK.y - 6 };
  const DESK_FRONT = { x: DESK.seatX, y: DESK.y + WD.DESK_DEPTH + 14 };

  const player = {
    x: SEAT.x, y: WD.ROW1_Y + 60, r: 6, speed: CFG.playerSpeed,
    action: 'none', actionTimer: 0, actionTotal: 0, facingX: 1, walkTimer: 0, moving: false,
    coffeeBoost: 0, bumpCooldown: 0, chatWith: null, hideSpot: null,
  };
  const boss = {
    x: WD.bossHome.x, y: WD.bossHome.y,
    state: 'office', stateTimer: 6, path: [], mode: 'patrol', spotDesc: 'кабинет',
    facing: Math.PI / 2, walkTimer: 0, moving: false,
    suspicion: 0, catchCooldown: 0, quoteTimer: 6, praiseTimer: 0, lookTimer: 0, inspectTimer: 0,
    visitedSpots: 0, warned: false,
  };
  // Коллеги первого ряда + ноющие соседи второго ряда (extra: true)
  const coworkers = WD.people.map((c, i) => ({
    ...c, x: c.desk.seatX, y: c.desk.y - 1, cooldown: 0, talkTimer: 0, idleTimer: 6 + i * 4, alert: 0,
    away: false, slack: null, slackTimer: 8 + i * 3, scoldCooldown: 0,
  }));

  let mode = 'menu';
  let clockMinutes = CFG.shiftStart;
  let shiftTime = 0;
  let reprimands = 0;         // выговоры: 3 = уволен
  let planTarget = 60;        // цель работы на день
  let usefulness = 0;         // работа к плану (не тает)
  let fun = 0;
  function addFun(n) { fun = Math.min(100, Math.max(0, fun + n)); }
  let stats;
  let nextBossCheck = 16;
  let intelTimer = 0;
  let coverTokens = 0;
  let particles = [];
  let floaters = [];
  let bubbles = [];
  let logEntries = [];
  let todo = [];
  let toastTimer = 0;
  let shake = 0;
  let flash = 0;
  let last = 0;
  let kpiTick = 0;
  let officeEvent = null;     // текущее офисное событие
  let nextEvent = 40;
  let eventQueue = [];
  let banner = null;          // крупная плашка события
  let heartbeat = 0;
  let tutorial = { step: 0, t: 0 }; // подсказки для первого дня
  let phoneAnim = 0;          // 0..1 — выезд телефона
  let phoneBuzz = 0;          // новое уведомление
  let danger = 0;             // 0..1 — начальник рядом, а ты прокрастинируешь
  let day = {};               // дневные флаги: обед, пиво, туалет, голод
  let phoneSafe = 0;          // бонус Сиргея: телефон не палево
  let nextDrill = 0;          // тик перфоратора
  let walkers = [];           // люди, выходящие из биотуалета
  let choice = null;          // выбор ответа на летучке { t, asked, done }
  let nudge = null;           // Блеб отвлекает, пока ты в Excel

  function resetStats() {
    stats = { coffees: 0, cigarettes: 0, videos: 0, fridge: 0, chats: 0, chatted: new Set(), catches: 0, inspectPass: 0, praise: 0, plantHideInspect: 0, printed: 0, workedSeconds: 0, lunch: 0, toilet: 0, scolds: 0 };
  }
  resetStats();

  function timeString(mins) {
    const h = Math.floor(mins / 60) % 24;
    const m = Math.floor(mins % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  function addLog(text, kind = 'info') {
    logEntries.unshift({ time: timeString(clockMinutes), text, kind });
    logEntries = logEntries.slice(0, 8);
    if (kind !== 'info') phoneBuzz = 2;
  }
  function toast(text, seconds = 3) {
    ui.toast.textContent = text;
    ui.toast.classList.add('show');
    toastTimer = seconds;
  }
  function say(owner, text, dur = 3.2, color = '#fffaf0') {
    bubbles = bubbles.filter(b => b.owner !== owner);
    bubbles.push({ owner, text, t: 0, dur, color });
    if (mode === 'playing') playSound(owner === 'boss' ? 'bossBlip' : 'blip');
  }
  // Подсказки «почему»: каждая показывается максимум дважды за всё время, чтобы не надоедать
  let hintsSeen = store.get('hints', {}) || {};
  const shownThisShift = new Set();
  function hint(id, text) {
    if (auto.on || shownThisShift.has(id) || (hintsSeen[id] || 0) >= 2) return;
    shownThisShift.add(id);
    hintsSeen = { ...hintsSeen, [id]: (hintsSeen[id] || 0) + 1 };
    store.set('hints', hintsSeen);
    toast(`💡 ${text}`, 4.2);
  }
  function floater(x, y, text, color) { floaters.push({ x, y, text, color, t: 0 }); }
  function puff(x, y, color, n = 6, spread = 8, vy = -14) {
    for (let i = 0; i < n; i++) {
      particles.push({ x: x + (rand() - 0.5) * spread, y, vx: (rand() - 0.5) * 8, vy: vy - rand() * 10, size: 1.5 + rand() * 1.5, life: 0.9 + rand() * 0.5, maxLife: 1.4, color });
    }
  }

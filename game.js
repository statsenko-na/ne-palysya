// «Не пались» — игровой цикл, механики, ИИ начальника и рендер персонажей.
// Геометрия — js/world.js, арт офиса — js/art.js, реплики — js/lines.js.
(() => {
  'use strict';

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
  const ASSET_V = '0.19.1';
  function loadImage(src) { const i = new Image(); i.src = `${src}?v=${ASSET_V}`; return i; }
  const img = {
    vik: loadImage('assets/bykentiy-walk-v4.png'),
    boss: loadImage('assets/boss-walk-v2.png'),
    coworkers: loadImage('assets/coworkers-v3.png'),
    extras: loadImage('assets/extras-v1.png'),
    view: loadImage('assets/almaty-view-v1.png'),
    emblem: loadImage('assets/firdom-emblem.svg'),
  };
  const ready = im => im.complete && im.naturalWidth > 0;

  let art = ART.build();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { art = ART.build(); });

  // ---------- БАЛАНС ----------
  const CFG = {
    shiftSeconds: 240,         // реальная длительность смены 08:50–19:30
    shiftStart: 8 * 60 + 50,
    shiftEnd: 19 * 60 + 30,
    playerSpeed: 100,          // Быкентий быстрее Д.Н. (50 на обходе, 70 на проверке)
    coffeeBoost: 1.35,
    coffeeSeconds: 16,
    bossSpeed: 50,
    bossInspectSpeed: 70,
    visionRange: 160,
    visionRangeInspect: 190,
    visionHalfAngle: 0.72,
    suspicionSlack: 75,        // в секунду, если видит прокрастинацию
    suspicionInspect: 95,      // во время проверки — всё, что не Excel
    suspicionDecay: 28,
    workKpi: 1.0,              // работа к плану в секунду в Excel
    workKpiCoffee: 1.3,
    watchedKpiMultiplier: 2,   // Д.Н. видит, как ты работаешь — работа идёт вдвое быстрее
    overPlan: 0.25,            // работа сверх плана идёт с такой отдачей — выгоднее кайфовать
    firstCheck: [26, 32],      // первая проверка не раньше, чем новичок дочитает баннер и дойдёт до стола
    checkInterval: [22, 32],
    strollChance: 0.35,        // часть «проверок» — просто прогулка по офису без тревоги
    reprimandGrace: 20,        // после выговора Д.Н. выдыхает: столько секунд без подозрения и проверок
    chatCooldown: 30,
    lunchOpen: 13 * 60,        // обед в «Мюнхене» 13:00–14:30
    lunchClose: 14 * 60 + 30,
    lunchSeconds: 9,
    toiletPerPerson: 2.2,      // очередь в туалет: секунд на человека
    toiletSeconds: 6,
    toiletCooldown: 45,
    beerAt: 17 * 60 + 15,      // пятничное пиво после отъезда Д.Н.
    beerChance: 0.65,
    bdayFee: 10,               // сбор на ДР: минус кайф, KPI не даёт
  };

  // ---------- СЛОЖНОСТЬ ----------
  // Множители к базовому балансу: чаще проверки, дальше взгляд, быстрее подозрение, медленнее KPI.
  const DIFFICULTY = {
    // warn — за сколько секунд до проверки «Кхм-кхм»; wait — сколько Д.Н. ждёт у пустого стола; speed — его шаг на проверке
    easy: { name: 'СТАЖЁР', check: 1.3, vision: 0.9, slack: 0.7, work: 1, plan: 0.8, missLimit: 6, warn: 3.5, wait: 5, speed: 0.9, surprise: 0, dayReprimandsMax: 4, weekReprimandsMax: 7 },
    normal: { name: 'СОТРУДНИК', check: 0.8, vision: 1.05, slack: 1.1, work: 1, plan: 1, missLimit: 5, warn: 2, wait: 2.5, speed: 1.15, surprise: 0.3, dayReprimandsMax: 3, weekReprimandsMax: 5 },
    hard: { name: 'ВЕТЕРАН', check: 0.65, vision: 1.2, slack: 1.4, work: 1, plan: 1.2, missLimit: 3, warn: 1.5, wait: 2, speed: 1.3, surprise: 0.5, dayReprimandsMax: 2, weekReprimandsMax: 4 },
  };

  // ---------- АПГРЕЙДЫ ЗА KPI-КОИНЫ ----------
  // Коины копятся за смены (KPI и сделанные дела), тратятся в магазине на меню и в конце дня.
  const UPGRADES = [
    { id: 'chair', icon: '🪑', name: 'Ортопедическое кресло', desc: 'Excel: работа к плану +20%', cost: 25 },
    { id: 'monitor', icon: '🖥', name: 'Второй монитор', desc: 'Excel: работа +15%, на столе второй экран', cost: 35 },
    { id: 'turka', icon: '☕', name: 'Своя турка', desc: 'Кофе бодрит 24 с вместо 16', cost: 20 },
    { id: 'headphones', icon: '🎧', name: 'Наушники с шумодавом', desc: 'Перфоратор не мешает работать', cost: 30 },
    { id: 'fan', icon: '🌀', name: 'Настольный вентилятор', desc: 'Жара не режет кайф', cost: 20 },
    { id: 'guitar', icon: '🎸', name: 'Гитара у стола', desc: 'В Excel +0.4 кайфа/с — рок вдохновляет', cost: 30 },
    { id: 'cactus', icon: '🌵', name: 'Кактус на столе', desc: 'Д.Н. ждёт у пустого стола на 1.5 с дольше', cost: 10 },
    { id: 'lava', icon: '🌋', name: 'Лава-лампа', desc: 'Чистая красота. +3 кайфа в начале смены', cost: 12 },
  ];

  // ---------- НЕДЕЛЯ ----------
  // Каждый день — свой модификатор. Победа переводит на следующий день, проигрыш — переигровка.
  // Неделя = обучение: каждый день открывает новые механики (после первой пройденной недели открыто всё).
  // plan — цель работы на день; tasks — задачи дня (попадают в список дел первыми).
  const DAYS = [
    { name: 'ПОНЕДЕЛЬНИК', short: 'ПН', plan: 60, mod: 'Тяжёлый понедельник: проверки чаще', checkMul: 0.85,
      news: 'Ядро: Д.Н. и его конус, твой стол и Excel, кофе, балкон, YouTube, укрытия. Цель — план и кайф без 3 выговоров.',
      tasks: ['coffee1', 'smoke1', 'inspect1'] },
    { name: 'ВТОРНИК', short: 'ВТ', plan: 70, mod: 'Обычный вторник. Подозрительно обычный.',
      news: 'Новое: коллеги первого ряда (E перед их столом) — у каждого бонус. Офисные события: угощение, созвон, ксерокс.',
      tasks: ['chatAimashyn', 'chatHlad'] },
    { name: 'СРЕДА', short: 'СР', plan: 70, mod: 'Среда — маленькая пятница: кайф ×1.25', funMul: 1.25,
      news: 'Новое: обед 13:00 в «Мюнхене», синий биотуалет, альт-таб (B / ⎇). События: ДР, жара, перфоратор, учения.',
      tasks: ['lunch', 'toilet'] },
    { name: 'ЧЕТВЕРГ', short: 'ЧТ', plan: 80, mod: 'Аудит из головного офиса: Д.Н. видит дальше', visionMul: 1.15,
      news: 'Новое: второй ряд (Д.Н. отвлекается на бездельников), летучка с выбором, Маджикистан, камеры СБ.',
      tasks: ['majik', 'scold'] },
    { name: 'ПЯТНИЦА', short: 'ПТ', plan: 60, mod: 'Пятница! Д.Н. уедет «на встречу» в 17:00', funMul: 1.2, bossLeaves: 17 * 60,
      news: 'Пятница: в 17:00 Д.Н. уезжает, иногда коллеги зовут в «Мюнхен» на пиво. Итог недели по Маджикистану.',
      tasks: ['cleanFriday', 'planEarly'] },
  ];
  // С какого дня (индекс) открывается механика
  const UNLOCK = { coworkers: 1, events1: 1, lunch: 2, toilet: 2, bosskey: 2, events2: 2, almaty: 2, row2: 3, standup: 3, events3: 3 };
  const EVENT_TIER = { food: 'events1', call: 'events1', internet: 'events1', jam: 'events1', bday: 'events2', heat: 'events2', noise: 'events2', drill: 'events2', standup: 'events3', majik: 'events3', autoshka: 'events3', arrfr: 'events3', sb: 'events3' };

  const store = {
    get(k, d) { try { const v = localStorage.getItem(`nepalsya.${k}`); return v === null ? d : JSON.parse(v); } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem(`nepalsya.${k}`, JSON.stringify(v)); } catch (_) { /* приватный режим */ } },
  };
  let dayIndex = clampDay(store.get('day', 0));
  let timeScale = clamp0(Number(store.get('timeScale', 1)) || 1, 0.5, 3);
  function clamp0(v, a, b) { return Math.max(a, Math.min(b, v)); }
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

  function saveProgress() {
    if (mode !== 'playing') return;
    const save = {
      dayIndex, clockMinutes, usefulness, fun, reprimands, weekReprimands, planTarget,
      coins, majikArc,
      waterCups: day ? day.waterCups : 4,
      waterRecharge: day ? day.waterRecharge : 0,
      coffeeCups: day ? day.coffeeCups : 0,
      coffeeJammed: day ? !!day.coffeeJammed : false,
      excelWorkAcc: day ? day.excelWorkAcc : 0,
      excelPoolTasks: day ? day.excelPoolTasks : 0,
      overtimeWork: day ? day.overtimeWork : 0,
      adhocDone: day ? !!day.adhocDone : false,
      misses: day ? day.misses : 0,
      fed: day ? !!day.fed : false,
      hungry: day ? !!day.hungry : false,
      todo: todo ? todo.map(t => ({ id: t.id, done: !!t.done })) : [],
      stats: stats ? { ...stats, chatted: Array.from(stats.chatted || []) } : null,
      officeEvent: officeEvent ? { id: officeEvent.id, t: officeEvent.t, used: !!officeEvent.used } : null,
    };
    store.set('currentSave', save);
  }
  function loadSavedProgress() {
    const s = store.get('currentSave', null);
    if (!s || s.dayIndex !== dayIndex) return false;
    clockMinutes = s.clockMinutes;
    shiftTime = ((clockMinutes - CFG.shiftStart) / (CFG.shiftEnd - CFG.shiftStart)) * CFG.shiftSeconds;
    usefulness = s.usefulness;
    fun = Math.min(100, Math.max(0, s.fun || 0));
    reprimands = s.reprimands;
    weekReprimands = s.weekReprimands !== undefined ? s.weekReprimands : weekReprimands;
    planTarget = s.planTarget || planTarget;
    if (s.coins !== undefined) coins = s.coins;
    if (s.majikArc !== undefined) majikArc = s.majikArc;
    if (day) {
      if (s.waterCups !== undefined) day.waterCups = s.waterCups;
      if (s.waterRecharge !== undefined) day.waterRecharge = s.waterRecharge;
      if (s.coffeeCups !== undefined) day.coffeeCups = s.coffeeCups;
      if (s.coffeeJammed !== undefined) day.coffeeJammed = s.coffeeJammed;
      if (s.excelWorkAcc !== undefined) day.excelWorkAcc = s.excelWorkAcc;
      if (s.excelPoolTasks !== undefined) day.excelPoolTasks = s.excelPoolTasks;
      if (s.overtimeWork !== undefined) day.overtimeWork = s.overtimeWork;
      if (s.adhocDone !== undefined) day.adhocDone = s.adhocDone;
      if (s.misses !== undefined) day.misses = s.misses;
      if (s.fed !== undefined) day.fed = s.fed;
      if (s.hungry !== undefined) day.hungry = s.hungry;
    }
    if (s.todo && Array.isArray(s.todo)) {
      s.todo.forEach(st => {
        const item = todo.find(t => t.id === st.id);
        if (item) item.done = st.done;
      });
    }
    if (s.stats) {
      Object.assign(stats, s.stats);
      stats.chatted = new Set(s.stats.chatted || []);
    }
    if (s.officeEvent && EVENTS[s.officeEvent.id]) {
      officeEvent = { ...EVENTS[s.officeEvent.id], id: s.officeEvent.id, t: s.officeEvent.t, used: s.officeEvent.used };
    }
    return true;
  }
  function clearSavedProgress() {
    store.set('currentSave', null);
  }

  // ---------- ВВОД ----------
  const keys = new Set();
  const physicalKeyAliases = {
    KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd',
    KeyE: 'e', KeyH: 'h', KeyP: 'p', KeyQ: 'q', KeyM: 'm', KeyU: 'u', KeyI: 'i', KeyB: 'b', KeyN: 'n', Digit1: '1', Digit2: '2', Digit3: '3', Numpad1: '1', Numpad2: '2', Numpad3: '3', Space: 'e', Tab: 'q',
  };
  const russianKeyAliases = { ц: 'w', ф: 'a', ы: 's', в: 'd', у: 'e', р: 'h', з: 'p', й: 'q', ь: 'm', г: 'u', ш: 'i', и: 'b', т: 'n' };
  function getControlKey(event) {
    const key = (event.key || '').toLowerCase();
    return physicalKeyAliases[event.code] || russianKeyAliases[key] || key;
  }
  window.NP_getControlKey = getControlKey; // для автотеста раскладок

  // ---------- ЗВУК (Web Audio, без файлов) ----------
  let audioCtx = null;
  let muted = false;
  let musicOn = true;
  try { musicOn = localStorage.getItem('nepalsya.music') !== 'false'; } catch (_) { /* нет доступа */ }
  try { muted = localStorage.getItem('nepalsya.muted') === 'true'; } catch (_) { /* нет доступа */ }
  function getAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }
  function tone(type, f0, f1, dur, vol, delay = 0) {
    if (muted) return;
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
    if (musicStep % 2) tone('triangle', BASS[i] * pitch, 0, 0.22, 0.035);
    tone('square', ARP[(i + (musicStep >> 3)) % 8] * pitch, 0, 0.09, 0.012);
    if (alarm && musicStep % 2 === 0) tone('sawtooth', 1800, 900, 0.03, 0.01);
  }

  // ---------- DOM ----------
  const $ = id => document.getElementById(id);
  const ui = {
    overlay: $('screen-overlay'), pause: $('pause-overlay'), end: $('end-overlay'), endCard: $('end-card'),
    start: $('start-btn'), resume: $('resume-btn'), restart: $('restart-btn'),
    toast: $('toast'), endKicker: $('end-kicker'), endTitle: $('end-title'), endCopy: $('end-copy'), endStats: $('end-stats'),
    grade: $('end-grade'),
    shop: $('shop-overlay'), shopList: $('shop-list'), shopCoins: $('shop-coins'), shopClose: $('shop-close'),
    shopBtns: document.querySelectorAll('.shop-open'), endCoins: $('end-coins'),
  };

  // ---------- УТИЛИТЫ ----------
  let rngSeed = 42;
  function rand() { rngSeed = (rngSeed * 9301 + 49297) % 233280; return rngSeed / 233280; }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
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
    const startLinks = nav.filter(n => segmentClear(from, n, NAV_R - 1)).map(n => [n.i, dist(from, n)]);
    const endLinks = new Map(nav.filter(n => segmentClear(n, to, NAV_R - 1)).map(n => [n.i, dist(n, to)]));
    if (!startLinks.length || !endLinks.size) return [{ x: to.x, y: to.y }];
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
    x: WD.bossHome.x, y: WD.bossHome.y, r: 7,
    state: 'office', stateTimer: 6, path: [], target: null, mode: 'patrol', spotDesc: 'кабинет',
    facing: Math.PI / 2, facingX: -1, walkTimer: 0, moving: false,
    suspicion: 0, catchCooldown: 0, quoteTimer: 6, praiseTimer: 0, lookTimer: 0, inspectTimer: 0,
    visitedSpots: 0, warned: false,
  };
  // Коллеги первого ряда + ноющие соседи второго ряда (extra: true)
  const coworkers = WD.people.map((c, i) => ({
    ...c, x: c.desk.seatX, y: c.desk.y - 1, cooldown: 0, talkTimer: 0, idleTimer: 6 + i * 4, alert: 0,
    away: false, slack: null, slackTimer: 8 + i * 3, scoldCooldown: 0,
  }));
  const MAIN_IDS = new Set(WD.coworkers.map(c => c.id));

  let mode = 'menu';
  let clockMinutes = CFG.shiftStart;
  let shiftTime = 0;
  let reprimands = 0;         // выговоры: 3 = уволен
  let planTarget = 60;        // цель работы на день
  let usefulness = 0;         // работа к плану (не тает)
  let fun = 0;
  function addFun(n) {
    const before = fun;
    fun = Math.min(100, Math.max(0, fun + n));
    if (stats && fun > before) stats.totalFunEarned = (stats.totalFunEarned || 0) + (fun - before);
    return fun;
  }
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
  let bossKeyCd = 0;          // «альт-таб»: перезарядка
  let choice = null;          // выбор ответа на летучке { opts, t }
  let nudge = null;           // Блеб отвлекает, пока ты в Excel

  function resetStats() {
    stats = { coffees: 0, cigarettes: 0, videos: 0, fridge: 0, chats: 0, chatted: new Set(), catches: 0, inspectPass: 0, praise: 0, plantHideInspect: 0, printed: 0, workedSeconds: 0, lunch: 0, toilet: 0, scolds: 0, complaints: 0 };
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
    document.querySelectorAll('.text-toggle').forEach(b => { b.textContent = bigText ? '🔠 Текст: крупный' : '🔠 Текст: обычный'; b.classList.toggle('on', bigText); });
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
    timeScale = clamp0(Number(v) || 1, 0.5, 3);
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

  // Список дел: сначала задачи дня (обучают новому), потом случайные из открытых механик
  const TODO_NEEDS = { chatAll: 'coworkers', chatAimashyn: 'coworkers', chatHlad: 'coworkers', lunch: 'lunch', toilet: 'toilet', scold: 'row2', majik: 'events3' };
  function pickTodo() {
    const all = LINES.todoPool.concat(LINES.dayTasks);
    const out = (today().tasks || []).map(id => all.find(t => t.id === id)).filter(Boolean).map(t => ({ ...t, done: false, day: true }));
    const pool = LINES.todoPool.filter(t => !out.some(o => o.id === t.id) && (!TODO_NEEDS[t.id] || unlocked(TODO_NEEDS[t.id])));
    while (out.length < 5 && pool.length) out.push({ ...pool.splice(Math.floor(rand() * pool.length), 1)[0], done: false });
    return out;
  }
  function todoProgress(t) {
    switch (t.id) {
      case 'coffee3': return stats.coffees;
      case 'chatAll': return [...stats.chatted].filter(id => MAIN_IDS.has(id)).length;
      case 'lunch': return stats.lunch;
      case 'toilet': return stats.toilet;
      case 'scold': return stats.scolds;
      case 'youtube2': return stats.videos;
      case 'smoke2': return stats.cigarettes;
      case 'inspect2': return stats.inspectPass;
      case 'plantHide': return stats.plantHideInspect;
      case 'fridge': return stats.fridge;
      case 'printer': return stats.printed;
      case 'coffee1': return stats.coffees;
      case 'smoke1': return stats.cigarettes;
      case 'inspect1': return stats.inspectPass;
      case 'chatAimashyn': return stats.chatted.has('aimashyn') ? 1 : 0;
      case 'chatHlad': return stats.chatted.has('hlad') ? 1 : 0;
      case 'majik': return stats.majikFixed || 0;
      case 'cleanFriday': return clockMinutes >= 17 * 60 && reprimands === 0 ? 1 : 0;
      case 'planEarly': return stats.planAt && stats.planAt < 16 * 60 ? 1 : 0;
      case 'praise3': return stats.praise;
      case 'fun60': return Math.round(fun);
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

  function resetGame() {
    rngSeed = Math.floor(Date.now() % 100000);
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
    officeEvent = null;
    banner = null;
    tutorial = { step: store.get('tutorialDone', false) ? 99 : 0, t: 0 };
    nextEvent = 32 + rand() * 12;
    eventQueue = shuffleEvents();
    Object.assign(player, { x: SEAT.x, y: WD.ROW1_Y + 62, action: 'none', actionTimer: 0, coffeeBoost: 0, speed: CFG.playerSpeed, chatWith: null, hideSpot: null, facingX: -1 });
    Object.assign(boss, { x: WD.bossHome.x, y: WD.bossHome.y, state: 'office', stateTimer: 5, path: [], target: null, suspicion: 0, catchCooldown: 0, quoteTimer: 4, praiseTimer: 0, warned: false, facing: Math.PI / 2 });
    coworkers.forEach((c, i) => { c.cooldown = 0; c.talkTimer = 0; c.idleTimer = 2 + rand() * 12; c.alert = 0; c.away = !!c.remote; c.slack = null; c.slackTimer = 10 + rand() * 12; c.scoldCooldown = 0; c.rocketAt = 660 + rand() * 360; c.draftCd = 0; });
    banterT = 10 + rand() * 12; pendingSays.length = 0;
    day = {
      misses: 0, lunchCalled: false, lunchOpen: false, fed: false, hungry: false, bossLunch: false, beer: null,
      toiletCd: 0, queue: 0, queueTotal: 0, qShift: 0, knock: 3, cabinDoor: 0, npcInside: 0, npcTimer: 20,
      waterCups: 4, waterRecharge: 0,
      coffeeCups: 0, coffeeJammed: false, coffeeQueueTimer: 0, coffeeQueueChecked: false,
      excelWorkAcc: 0, overtimeWork: 0,
      adhocDone: false, adhocAt: 720 + Math.floor(rand() * 210),
      aljaziraTimer: 85 + rand() * 45, aljaziraVisiting: false, aljaziraPhase: 'desk', aljaziraPhaseTimer: 0,
      lastSavedMinute: 0,
    };
    walkers = [];
    bossKeyCd = 0; choice = null; nudge = null;
    shownThisShift.clear();
    phoneSafe = 0;
    if (dayIndex === 0 && !store.get('currentSave', null)) {
      weekReprimands = 0; store.set('weekReprimands', 0);
    }
    const loadedSave = loadSavedProgress();
    if (has('lava')) addFun(3);
    addLog(`${today().name}: ${today().mod}.`);
    if (loadedSave) {
      addLog(`Продолжение смены: ${timeString(clockMinutes)}, план ${Math.floor(usefulness)}/${planTarget}, кайф ${Math.round(fun)}.`, 'info');
    } else {
      addLog('08:50 — Быкентий пришёл в БЦ «Угар». Хвостик поправлен, в наушниках — «Кино».');
      addLog('Директор Начальникович пьёт чай в кабинете. Пока.');
      addLog('Напоминание: ты ответственный за Маджикистан. Там опять что-то моргает.');
    }
    if (dayIndex === 0 && !loadedSave) { majikArc = 0; store.set('majikArc', 0); }
    // Алматинские дни: смог и утренняя пробка на Аль-Фараби
    day.smog = unlocked('almaty') && dayIndex !== 4 && rand() < 0.3;
    day.traffic = !loadedSave && unlocked('almaty') && !auto.on && rand() < 0.25;
    // Второй ряд до четверга на удалёнке
    coworkers.forEach(c => { c.remote = c.extra && !c.ghost && !c.statist && !unlocked('row2'); c.away = c.remote; });
    // Обед открывается со среды: до этого обеденных механик нет
    if (!unlocked('lunch')) Object.assign(day, { lunchCalled: true, lunchOpen: true, bossLunch: true, fed: true });
    if (day.smog) addLog('Смог над Алматы: гор не видно, перекур без вида — кайфа меньше.', 'info');
    if (day.traffic) {
      player.x = WD.exitDoor.x + 12; player.y = WD.exitDoor.y;
      nextBossCheck = Math.min(nextBossCheck, 9);
      addLog('Пробка на Аль-Фараби! Быкентий опоздал — беги к столу, пока Д.Н. не заметил.', 'bad');
    }
    setMode('playing');
    const firstWeek = !store.get('weekDone', false);
    banner = { dur: firstWeek ? 8 : 4.4, text: `${today().name} · ДЕНЬ ${dayIndex + 1}/5 · ПЛАН ${planTarget}`, sub: firstWeek ? `${today().news} · ${today().mod}` : day.traffic ? 'Пробка на Аль-Фараби! Ты опоздал — беги к столу, Д.Н. скоро с проверкой.' : (day.smog ? `${today().mod} · Смог: гор не видно` : today().mod), t: 0 };
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
    if (mode === 'playing') setMode('paused');
    else if (mode === 'paused') setMode('playing');
  }

  // ---------- ОФИСНЫЕ СОБЫТИЯ ----------
  const FOODS = [
    { name: 'баурсаки', text: 'Блеб принёс баурсаки от бабушки!', color: '#d8a050' },
    { name: 'самса', text: 'Кто-то принёс самсу из «Ташкентской»!', color: '#e0b060' },
    { name: 'апорт', text: 'Шурик привёз апорт из Талгара!', color: '#d8402a' },
    { name: 'көже', text: 'Наурыз! Асель принесла көже на кухню!', color: '#f0e8d0' },
    { name: 'курт', text: 'Аймашын привёз курт из аула!', color: '#efe8d4' },
  ];
  const EVENTS = {
    food: { dur: 28, title: 'УГОЩЕНИЕ НА КУХНЕ' },
    call: { dur: 22, title: 'Д.Н. НА СОЗВОНЕ С ПРАВЛЕНИЕМ' },
    internet: { dur: 22, title: 'УПАЛ ИНТЕРНЕТ' },
    jam: { dur: 30, title: 'КСЕРОКС ЗАЖЕВАЛ БУМАГУ' },
    bday: { dur: 30, title: 'СБОР НА ДЕНЬ РОЖДЕНИЯ' },
    heat: { dur: 32, title: 'ЖАРА: КОНДИЦИОНЕР СДОХ' },
    noise: { dur: 28, title: 'ПЕРФОРАТОР У СОСЕДЕЙ' },
    drill: { dur: 22, title: 'УЧЕНИЯ: ЗЕМЛЕТРЯСЕНИЕ' },
    standup: { dur: 20, title: 'ЛЕТУЧКА У ДОСКИ' },
    majik: { dur: 26, title: 'МАДЖИКИСТАН ЛЁГ' },
    arrfr: { dur: 26, title: 'ПРОВЕРКА АРРФР' },
    sb: { dur: 24, title: 'СБ СМОТРИТ В КАМЕРЫ' },
    autoshka: { dur: 18, title: 'У СИРГЕЯ УПАЛА АВТОШКА' },
  };
  const FEAST_ZONE = { id: 'feast', type: 'feast', x: 76, y: 170, w: 90, h: 86, short: 'Угощение' };
  function shuffleEvents() {
    const open = id => unlocked(EVENT_TIER[id]);
    const pool = ['call', 'internet', 'jam', 'bday', 'heat', 'noise', 'drill', 'standup', 'majik', 'autoshka', 'arrfr'].filter(open);
    if (!open('food')) return []; // понедельник: только ядро, без событий
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const ids = pool.slice(0, 5);
    ids.splice(Math.floor(rand() * 2), 0, 'food');
    if (open('sb') && rand() < 0.3) ids.splice(Math.min(ids.length, 2 + Math.floor(rand() * 3)), 0, 'sb'); // редкое: служба безопасности включает камеры
    return ids;
  }
  const bossBusy = () => ['inspect', 'waitDesk', 'lecture', 'leaving', 'gone', 'goout', 'out', 'scold'].includes(boss.state);
  function startEvent(id) {
    const def = EVENTS[id];
    officeEvent = { id, t: def.dur, dur: def.dur, used: false };
    let text = def.title;
    if (id === 'food') { officeEvent.food = pick(FOODS); text = officeEvent.food.text; }
    if (id === 'call') {
      text = 'Д.Н. ушёл на созвон с правлением — у тебя окно!';
      if (!bossBusy()) bossGoTo(WD.bossHome, 'return', 'кабинет');
      say('boss', 'Алло! Да, Председатель Правлениевич, всё под контролем!', 3);
    }
    if (id === 'internet') { text = 'Интернет упал: YouTube недоступен, Excel работает быстрее.'; say('hlad', 'Интернет всё. Я домой?', 2.6); }
    if (id === 'jam') { text = 'Ксерокс зажевал бумагу. Почини — Д.Н. оценит (+9 к плану).'; say('shurik', 'Он опять жуёт! Кто-нибудь?', 2.6); }
    if (id === 'bday') {
      const hero = pick(coworkers.filter(c => !c.away));
      officeEvent.food = { name: 'торт', color: '#f0d0e0' };
      officeEvent.toy = rand() < 0.35;
      text = officeEvent.toy
        ? `Той у ${nameCase(hero.name, 1)}! Сбор на Kaspi по 5000 ₸ (−${CFG.bdayFee} кайфа). Торт — на кухне.`
        : `ДР у ${nameCase(hero.name, 0)}: сбор на Kaspi по 5000 ₸ (−${CFG.bdayFee} кайфа). Торт — на кухне.`;
      fun = Math.max(0, fun - CFG.bdayFee);
      floater(player.x, player.y - 70, `−5000 ₸ · −${CFG.bdayFee} КАЙФА`, '#ff8a7a');
      say('shurik', LINES.bday[0], 3);
      setTimeout(() => { if (mode === 'playing') say('asel', LINES.bday[1], 3); }, 1600);
      addLog(`Сбор на ДР: минус 5000 ₸. К плану это не прибавляет.`, 'bad');
    }
    if (id === 'heat') { text = has('fan') ? 'Жара! Но у тебя вентилятор 🌀. Кулер даёт больше кайфа.' : 'Жара: кайф копится медленнее. Кулер спасает. Можно пожаловаться Д.Н. у его двери.'; complainWave('heat'); }
    if (id === 'noise') { text = has('headphones') ? 'Перфоратор! Шумодав 🎧 спасает Excel. Д.Н. хуже слышит шорохи.' : 'Перфоратор: Excel медленнее, зато Д.Н. хуже замечает. Пожаловаться — у двери Д.Н.'; complainWave('noise'); }
    if (id === 'drill') {
      text = 'Алматы же! Все к выходу слева — жми E у двери «ВЫХОД», пока идут учения.';
      playSound('siren');
      if (!bossBusy() || boss.state === 'scold') bossGoOut(def.dur + 2, 'drill');
      say('boss', pick(LINES.boss.drill), 3);
      coworkers.forEach((c, i) => setTimeout(() => { if (eventIs('drill') && !c.ghost) { c.away = true; puff(c.x, c.y - 20, 'rgba(230,230,230,0.7)', 5, 10); } }, 600 + i * 450));
    }
    if (id === 'standup') {
      text = 'Д.Н. собирает всех у доски (архив, слева внизу). Встань рядом и жми E!';
      if (!bossBusy()) { bossGoTo(WD.standupSpot, 'standup', 'летучка'); boss.stateTimer = def.dur; }
      say('boss', pick(LINES.boss.standup), 3);
    }
    if (id === 'sb') {
      text = 'Красные конусы камер — взгляд СБ. Не прокрастинируй в них: СБ доложит Д.Н. Работа и укрытия — безопасно.';
      officeEvent.watch = 0; officeEvent.reports = 0;
      say('sirgey', 'Камеры зашевелились... СБ проснулась!', 2.8, '#ffd4c8');
    }
    if (id === 'arrfr') {
      text = 'Регулятор в здании! Д.Н. нервничает: смотрит дальше и проверяет чаще.';
      nextBossCheck = Math.min(nextBossCheck, 5);
      say('boss', pick(LINES.arrfr), 3);
    }
    if (id === 'majik') {
      officeEvent.work = 0;
      text = 'Ты ответственный за Маджикистан! Сядь в Excel на 4 с и подними его (+10 к плану), иначе выговор.';
      say('boss', pick(LINES.majik.boss), 3);
      setTimeout(() => { if (mode === 'playing') say('player', pick(LINES.majik.down), 2.8); }, 1400);
    }
    if (id === 'autoshka') {
      const c = coworkerById('sirgey');
      text = 'Сиргей в панике, Д.Н. бежит к нему разбираться — у тебя окно!';
      if (c && !c.away) {
        say('sirgey', pick(LINES.majik.autoshka), 3, '#ffd4c8');
        if (!bossBusy() && boss.state !== 'standup') {
          boss.scoldTarget = c.id; boss.inspectTimer = 0;
          bossGoTo({ x: c.desk.seatX, y: c.desk.y + WD.DESK_DEPTH + 14 }, 'scold', 'к Сиргею: автошка');
        }
      }
    }
    banner = { text: officeEvent.toy ? 'СБОР НА ТОЙ' : def.title, sub: text, t: 0 };
    playSound('success');
    addLog(`Событие: ${text}`, 'info');
  }
  function complainWave(kind) {
    const pool = coworkers.filter(c => !c.away);
    for (let i = 0; i < 3; i++) {
      const c = pool[Math.floor(rand() * pool.length)];
      setTimeout(() => { if (eventIs(kind) && !c.away) say(c.id, pick(LINES.complaints[kind]), 2.8, '#ffe6c8'); }, 400 + i * 1500);
    }
    setTimeout(() => { if (eventIs(kind)) say('player', pick(LINES.thoughts[kind]), 2.8); }, 5200);
  }
  function endEvent() {
    const ev = officeEvent;
    officeEvent = null;
    if (!ev) return;
    if (ev.id === 'call') { nextBossCheck = Math.max(nextBossCheck, 6); if (boss.state === 'office') boss.stateTimer = 1.5; }
    if (ev.id === 'drill') {
      coworkers.forEach(c => { if (!day.lunchAway) c.away = !!c.remote; });
      if (player.action === 'evac') {
        endAction('done');
        player.x = WD.exitDoor.x + 8; player.y = WD.exitDoor.y;
      } else if (mode === 'playing') {
        addLog('Быкентий проигнорировал учения по землетрясению.', 'bad');
        missAtDesk('Не вышел на учения');
      }
    }
    if (ev.id === 'majik' && !ev.used && mode === 'playing') {
      say('boss', 'Маджикистан так и лежит! Быкентий, объяснительную!', 3);
      majikArc--; store.set('majikArc', majikArc); day.majikFail = true;
      reprimand('Маджикистан пролежал весь день, а ты за него отвечаешь', 'Маджикистан');
    }
    if (ev.id === 'standup') {
      if (player.action === 'standup') {
        endAction('done');
        addWork(8); stats.praise++;
        floater(player.x, player.y - 64, 'ЛЕТУЧКА +8 К ПЛАНУ', '#57d08a');
        say('boss', 'Вот! Быкентий хоть слушал. Свободны!', 2.8);
        addLog('Летучка: Быкентий кивал в нужных местах. +8 к плану.', 'good');
      } else if (mode === 'playing') {
        say('boss', 'А где Быкентий?! Опять пропустил летучку!', 3);
        missAtDesk('Пропустил летучку');
      }
      if (boss.state === 'standup') endInspection();
      checkTodo();
    }
  }
  function updateEvents(dt) {
    if (officeEvent) {
      officeEvent.t -= dt;
      if (officeEvent.id === 'call' && boss.state === 'office') boss.stateTimer = Math.max(boss.stateTimer, 1);
      if (officeEvent.id === 'noise') {
        nextDrill -= dt;
        if (nextDrill <= 0) { playSound('drill'); shake = Math.max(shake, 0.12); nextDrill = 1.2 + rand() * 2.4; }
      }
      // Летучка: если Д.Н. был занят проверкой, он придёт к доске позже
      if (officeEvent.id === 'standup' && !bossBusy() && boss.state !== 'standup') { bossGoTo(WD.standupSpot, 'standup', 'летучка'); }
      if (officeEvent.id === 'sb') updateCameras(dt);
      if (officeEvent.id === 'majik' && !officeEvent.used && player.action === 'work') {
        officeEvent.work += dt;
        if (officeEvent.work >= 4) {
          officeEvent.used = true;
          addWork(10);
          say('player', pick(LINES.majik.fixed), 3);
          floater(player.x, player.y - 64, 'МАДЖИКИСТАН ПОДНЯТ +10 К ПЛАНУ', '#57d08a');
          addLog('Быкентий поднял Маджикистан. Там снова работает. Пока.', 'good');
          majikArc++; store.set('majikArc', majikArc); stats.majikFixed = (stats.majikFixed || 0) + 1;
          if (boss.seesPlayer || boss.watchingWork) { say('boss', 'Вот! Ответственный человек!', 2.6); stats.praise++; }
          playSound('success');
        }
      }
      if (officeEvent.id === 'heat' && rand() < dt * 0.12) { const c = pick(coworkers.filter(k => !k.away)); if (c) say(c.id, pick(LINES.complaints.heat), 2.4, '#ffe6c8'); }
      if (officeEvent.t <= 0) endEvent();
    } else if (!['inspect', 'goout', 'out'].includes(boss.state) && !lunchTime()) {
      nextEvent -= dt;
      if (nextEvent <= 0 && eventQueue.length) { startEvent(eventQueue.shift()); nextEvent = 30 + rand() * 14; }
    }
    updateSchedule(dt);
    if (banner) { banner.t += dt; if (banner.t > (banner.dur || 4.4)) banner = null; }
  }
  const eventIs = id => officeEvent && officeEvent.id === id;

  // ---------- КАМЕРЫ СБ ----------
  // Две купольные камеры под потолком медленно водят красным конусом. Прокрастинация в конусе копит «запись»,
  // через 1.6 с СБ звонит Д.Н.: выговор, +40 подозрения, Д.Н. идёт к месту.
  const CAMERAS = [
    { x: 262, y: 134, base: 0.9, span: 0.75, range: 250 },
    { x: 780, y: 134, base: 2.25, span: 0.75, range: 250 },
  ];
  const CAM_HALF = 0.32;
  function cameraAngle(c) { return c.base + Math.sin(shiftTime * 0.7 + c.x) * c.span; } // игровое время: с ускорением крутятся быстрее
  function cameraSees(c) {
    if (HIDDEN.has(player.action)) return false;
    const d = dist(c, player);
    if (d > c.range) return false;
    const a = Math.atan2(player.y - c.y, player.x - c.x);
    return Math.abs(angleDiff(a, cameraAngle(c))) < CAM_HALF && lineOfSight(c, player);
  }
  function updateCameras(dt) {
    const ev = officeEvent;
    const seen = CAMERAS.some(cameraSees);
    ev.seen = seen;
    if (seen && SLACK.has(player.action)) ev.watch += dt; else ev.watch = Math.max(0, ev.watch - dt * 0.5);
    if (ev.watch >= 1.6) {
      ev.watch = 0; ev.reports++;
      stats.sbReports = (stats.sbReports || 0) + 1;
      floater(player.x, player.y - 70, 'СБ ЗАПИСАЛА!', '#ff6a5a');
      reprimand('СБ записала, как ты бездельничаешь, и доложила Д.Н.', 'доклад СБ');
      playSound('alarm');
      say('player', pick(LINES.sb.caught), 2.6);
      addLog('🎥 СБ: «Сотрудник Быкентий, 7 этаж, прокрастинирует». Доложили Д.Н.', 'bad');
      if (boss.state !== 'gone' && boss.state !== 'out') {
        boss.suspicion = clamp(boss.suspicion + 40, 0, 99);
        if (!bossBusy()) bossGoTo({ x: player.x, y: player.y }, 'patrol', 'по звонку СБ');
        setTimeout(() => { if (mode === 'playing') say('boss', pick(LINES.sb.boss), 2.8); }, 900);
      }
    }
  }
  function drawCameras() {
    if (!eventIs('sb')) return;
    const t = performance.now() / 1000;
    for (const c of CAMERAS) {
      const a = cameraAngle(c);
      const grd = ctx.createRadialGradient(c.x, c.y, 4, c.x, c.y, c.range);
      grd.addColorStop(0, 'rgba(255,60,50,0.55)'); grd.addColorStop(1, 'rgba(255,60,50,0.12)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.moveTo(c.x, c.y);
      for (let i = 0; i <= 12; i++) {
        const aa = a - CAM_HALF + (i / 12) * CAM_HALF * 2;
        let len = c.range;
        for (let st = 8; st < c.range; st += 8) { if (sightBlockers.some(w => rectContains(w, c.x + Math.cos(aa) * st, c.y + Math.sin(aa) * st))) { len = st; break; } }
        ctx.lineTo(c.x + Math.cos(aa) * len, c.y + Math.sin(aa) * len);
      }
      ctx.closePath(); ctx.fill();
      // яркие края конуса — границу видно даже на пёстром полу
      ctx.strokeStyle = `rgba(255,70,55,${0.55 + Math.sin(t * 4) * 0.2})`;
      ctx.lineWidth = 1.2;
      for (const e of [-1, 1]) {
        const aa = a + e * CAM_HALF;
        ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x + Math.cos(aa) * c.range * 0.85, c.y + Math.sin(aa) * c.range * 0.85); ctx.stroke();
      }
    }
    if (officeEvent.watch > 0) {
      const k = officeEvent.watch / 1.6;
      R(player.x - 16, player.y - 80, 32, 4, 'rgba(10,16,20,0.9)'); R(player.x - 15.5, player.y - 79.5, 31 * k, 3, '#ff4a3a');
      T('🎥 REC', player.x, player.y - 86, 7, '#ff6a5a', 'center', 900, FONT_SANS);
    }
  }

  // Купольные камеры на потолке (вид сверху — круг): белое кольцо, тёмный дымчатый купол, блик.
  // Видны всегда; во время СБ внутри купола красный огонёк смотрит туда же, куда конус
  function drawCameraBodies() {
    const t = performance.now() / 1000;
    const on = eventIs('sb');
    for (const c of CAMERAS) {
      const a = on ? cameraAngle(c) : c.base;
      ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.arc(c.x + 1, c.y + 1.5, 6.5, 0, TAU); ctx.fill();
      ctx.fillStyle = '#e9ecec'; ctx.beginPath(); ctx.arc(c.x, c.y, 6.5, 0, TAU); ctx.fill();
      ctx.fillStyle = '#aab2b4'; ctx.beginPath(); ctx.arc(c.x, c.y, 5.2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2a3136'; ctx.beginPath(); ctx.arc(c.x, c.y, 4.4, 0, TAU); ctx.fill();
      const blink = on ? Math.floor(t * 3) % 2 : Math.floor(t * 0.7) % 3 === 0;
      ctx.fillStyle = on ? (blink ? '#ff4030' : '#a01a12') : '#5e7884';
      ctx.beginPath(); ctx.arc(c.x + Math.cos(a) * 2, c.y + Math.sin(a) * 2, on ? 1.6 : 1.2, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(Math.round(c.x - 3), Math.round(c.y - 3), 2, 1);
      if (!on && blink) { ctx.fillStyle = '#6fd08a'; ctx.fillRect(Math.round(c.x + 4), Math.round(c.y - 5), 1.5, 1.5); }
    }
  }

  // ---------- ОБЕД, ТУАЛЕТ, ПЯТНИЧНОЕ ПИВО ----------
  const lunchTime = () => clockMinutes >= CFG.lunchOpen - 5 && clockMinutes < CFG.lunchOpen + 50;
  const STANDUP_CHOICES = [
    { key: '1', text: 'Всё под контролем!' },
    { key: '2', text: 'Маджикистан опять всё...' },
    { key: '3', text: 'Это Сиргей виноват!' },
  ];
  function answerStandup(i) {
    if (!choice || !choice.asked || choice.done || player.action !== 'standup') return false;
    choice.done = true;
    const opt = STANDUP_CHOICES[i];
    say('player', opt.text, 2.6);
    if (i === 0) {
      if (day.majikFail) { boss.suspicion = clamp(boss.suspicion + 30, 0, 99); setTimeout(() => say('boss', 'Под контролем?! А Маджикистан?!', 2.8), 1200); }
      else { addWork(4); floater(player.x, player.y - 70, '+4 К ПЛАНУ', '#57d08a'); setTimeout(() => say('boss', 'Вот это я понимаю, уверенность!', 2.6), 1200); }
    } else if (i === 1) {
      nextBossCheck += 15;
      floater(player.x, player.y - 70, 'ЧЕСТНО: ПРОВЕРКА НА 15 С ПОЗЖЕ', '#f2bb38');
      setTimeout(() => say('boss', 'Хоть честно. Чини давай.', 2.6), 1200);
    } else {
      fun += 6;
      const c = coworkerById('sirgey');
      if (c) { c.cooldown = 120; setTimeout(() => say('sirgey', 'Я?! У меня автошка лежит, я вообще ни при чём!', 3, '#ffd4c8'), 1400); }
      floater(player.x, player.y - 70, '+6 КАЙФ · СИРГЕЙ ОБИДЕЛСЯ', '#e0a0f0');
    }
    playSound('click');
    return true;
  }
  function updateSocial(dt) {
    bossKeyCd = Math.max(0, bossKeyCd - dt);
    // Летучка: через пару секунд Д.Н. задаёт вопрос
    if (choice && player.action === 'standup' && !choice.done) {
      choice.t += dt;
      if (!choice.asked && choice.t > 2 && boss.state === 'standup' && !boss.moving) { choice.asked = true; say('boss', 'Быкентий! Что по твоему направлению?', 3); }
      if (choice.asked && choice.t > 14) choice.done = true; // промолчал
    }
    if (player.action !== 'standup' && choice && !eventIs('standup')) choice = null;
    // Блеб отвлекает соседа, пока тот в Excel
    const bleb = coworkerById('bleb');
    if (unlocked('coworkers') && player.action === 'work' && bleb && !bleb.away && !nudge && bleb.cooldown <= 0 && boss.state !== 'inspect' && rand() < dt * 0.03) {
      nudge = { t: 6 };
      say('bleb', pick(LINES.nudge.ask), 3, '#eef6f4');
    }
    if (nudge) {
      nudge.t -= dt;
      if (player.action !== 'work' || nudge.t <= 0) {
        if (nudge.t <= 0 && bleb) { bleb.cooldown = Math.max(bleb.cooldown, 40); say('bleb', pick(LINES.nudge.ignored), 2.4, '#eef6f4'); }
        nudge = null;
      }
    }
  }

  function updateSchedule(dt) {
    updateSocial(dt);
    day.toiletCd = Math.max(0, day.toiletCd - dt);
    day.cabinDoor = Math.max(0, day.cabinDoor - dt);
    day.qShift = Math.max(0, day.qShift - dt * 30);
    for (const wk of walkers) { wk.t += dt; wk.x += 26 * dt; wk.y -= 34 * dt; }
    walkers = walkers.filter(wk => wk.t < 1.6);
    // Кабинка живёт своей жизнью: иногда туда заходит кто-то из соседнего отдела
    if (player.action !== 'queue' && player.action !== 'toilet') {
      if (day.npcInside > 0) { day.npcInside -= dt; if (day.npcInside <= 0) { day.cabinDoor = 0.7; walkers.push({ x: WD.toiletDoor.x, y: WD.toiletDoor.y, t: 0, look: Math.floor(rand() * 4) }); playSound('slam'); } }
      else if ((day.npcTimer -= dt) <= 0) { day.npcInside = 5 + rand() * 4; day.npcTimer = 25 + rand() * 25; day.cabinDoor = 0.5; }
    }
    phoneSafe = Math.max(0, phoneSafe - dt);
    const m = clockMinutes;

    // Перезарядка кулера с водой (30 игровых минут)
    if (day.waterCups <= 0 && day.waterRecharge > 0) {
      const gameMinutesPassed = dt * ((CFG.shiftEnd - CFG.shiftStart) / CFG.shiftSeconds);
      day.waterRecharge -= gameMinutesPassed;
      if (day.waterRecharge <= 0) {
        day.waterCups = 4;
        toast('💧 Курьер принёс новую 19-литровую бутыль! Кулер снова полон.', 3);
        addLog('💧 Курьер установил новую бутыль в кулер. Вода снова есть.', 'good');
        playSound('coffee');
      }
    }

    // Утренняя очередь к кофемашине
    if (day.coffeeQueueTimer > 0) {
      day.coffeeQueueTimer = Math.max(0, day.coffeeQueueTimer - dt);
    }
    if (m >= 545 && m <= 605 && !day.coffeeQueueChecked) {
      day.coffeeQueueChecked = true;
      if (rand() < 0.6) {
        day.coffeeQueueTimer = 18 + rand() * 12;
      }
    }

    // Ад-хок от правления (случается один раз в день между 12:00 и 16:30)
    if (!day.adhocDone && m >= day.adhocAt) {
      day.adhocDone = true;
      const cut = Math.min(usefulness, 12);
      usefulness = Math.max(0, usefulness - cut);
      playSound('caught'); shake = 0.4;
      const adTitle = pick(LINES.adhoc.titles);
      toast(`📩 АД-ХОК: ${adTitle} (−${Math.round(cut)} к плану)`, 4.5);
      say('player', pick(LINES.adhoc.thoughts), 3.4);
      addLog(`📩 Ад-хок от правления: «${adTitle}» (−${Math.round(cut)} KPI). Пришлось переделывать!`, 'bad');
    }

    // Альджазира (Начальник Маджикистана) инспектирует Быкентия
    const aljaziraObj = coworkerById('aljazira');
    if (aljaziraObj && !aljaziraObj.away && mode === 'playing' && !eventIs('drill') && !day.lunchAway) {
      if (!day.aljaziraVisiting) {
        day.aljaziraTimer -= dt;
        if (day.aljaziraTimer <= 0) {
          day.aljaziraVisiting = true;
          day.aljaziraPhase = 'walk_to';
          day.aljaziraTimer = 110 + rand() * 60;
        }
      } else {
        if (day.aljaziraPhase === 'walk_to') {
          const target = { x: SEAT.x + 22, y: SEAT.y + 4 };
          const distTo = dist(aljaziraObj, target);
          if (distTo > 8) {
            const angle = Math.atan2(target.y - aljaziraObj.y, target.x - aljaziraObj.x);
            aljaziraObj.x += Math.cos(angle) * 38 * dt;
            aljaziraObj.y += Math.sin(angle) * 38 * dt;
          } else {
            day.aljaziraPhase = 'confront';
            day.aljaziraPhaseTimer = 3.8;
            const isDisaster = day.aljaziraForceDisaster ? true : (day.aljaziraForceCalm ? false : rand() >= 0.8);
            day.aljaziraForceDisaster = false;
            day.aljaziraForceCalm = false;
            if (!isDisaster) {
              say('aljazira', pick(LINES.aljazira.calm), 3.5, '#ff8080');
            } else {
              playSound('caught'); flash = 0.9; shake = 0.8;
              say('aljazira', pick(LINES.aljazira.strike), 4.2, '#ff3030');
              fun = 0; usefulness = 0;
              banner = { text: 'АЛЬДЖАЗИРА: МАДЖИКИСТАН РУХНУЛ!', sub: 'Кайф сброшен до 0. План дня обнулён. Полный пересчёт!', t: 0, bad: true };
              toast('💥 АЛЬДЖАЗИРА: ВСЁ СГОРЕЛО! КАЙФ 0 · ПЛАН 0', 4.5);
              addLog('💥 Альджазира разнесла отдел: Маджикистан рухнул, кайф и план на нуле!', 'bad');
              setTimeout(() => { if (mode === 'playing') say('player', 'Да е**ный в рот, Альджазира! За что?! Весь день заново?!', 3.5); }, 1400);
            }
          }
        } else if (day.aljaziraPhase === 'confront') {
          day.aljaziraPhaseTimer -= dt;
          if (day.aljaziraPhaseTimer <= 0) {
            day.aljaziraPhase = 'walk_back';
          }
        } else if (day.aljaziraPhase === 'walk_back') {
          const target = { x: aljaziraObj.desk.seatX, y: aljaziraObj.desk.seatY };
          const distTo = dist(aljaziraObj, target);
          if (distTo > 6) {
            const angle = Math.atan2(target.y - aljaziraObj.y, target.x - aljaziraObj.x);
            aljaziraObj.x += Math.cos(angle) * 38 * dt;
            aljaziraObj.y += Math.sin(angle) * 38 * dt;
          } else {
            aljaziraObj.x = aljaziraObj.desk.seatX;
            aljaziraObj.y = aljaziraObj.desk.seatY;
            day.aljaziraVisiting = false;
          }
        }
      }
    }

    // Автосохранение каждые 15 игровых минут
    if (Math.floor(m) % 15 === 0 && day.lastSavedMinute !== Math.floor(m)) {
      day.lastSavedMinute = Math.floor(m);
      saveProgress();
    }
    // 12:55 — Быкентий зовёт всех на обед
    if (!day.lunchCalled && m >= CFG.lunchOpen - 5) {
      day.lunchCalled = true;
      say('player', pick(LINES.lunch.call), 3.4);
      setTimeout(() => { if (mode === 'playing') say('bleb', pick(LINES.lunch.reply), 2.6); }, 1300);
      setTimeout(() => { if (mode === 'playing') say('aimashyn', pick(LINES.lunch.reply), 2.6); }, 2500);
    }
    if (!day.lunchOpen && m >= CFG.lunchOpen) {
      day.lunchOpen = true;
      banner = { text: 'ОБЕД · 13:00–14:30', sub: 'Бизнес-ланч в «Мюнхене»: выход слева в коридоре, жми E у двери.', t: 0 };
      addLog('Обед! Коллеги потянулись в «Мюнхен» за хрючевом дня.', 'info');
      coworkers.forEach((c, i) => setTimeout(() => { if (mode === 'playing' && !eventIs('drill')) { if (!c.ghost) c.away = true; day.lunchAway = true; } }, 1200 + i * 700));
    }
    // Д.Н. тоже уходит на обед — если не занят проверкой
    if (!day.bossLunch && m >= CFG.lunchOpen + 12 && !bossBusy() && boss.state !== 'standup') {
      day.bossLunch = true;
      bossGoOut(22 + rand() * 6, 'lunch');
      say('boss', pick(LINES.boss.lunchOut), 3);
    }
    if (day.lunchAway && m >= CFG.lunchOpen + 50) {
      day.lunchAway = false;
      coworkers.forEach(c => { if (!eventIs('drill')) c.away = !!c.remote; });
      addLog('Коллеги вернулись из «Мюнхена». Кто-то жалеет о котлете.', 'info');
    }
    if (!day.fed && !day.hungry && m >= CFG.lunchClose) {
      day.hungry = true;
      say('player', pick(LINES.lunch.hungry), 3);
      toast('Быкентий пропустил обед: кайф копится на 20% медленнее.', 3);
    }
    // Пятница: после отъезда Д.Н. коллеги иногда собираются в «Мюнхен» на пиво
    if (today().bossLeaves && day.beer === null && m >= CFG.beerAt) {
      day.beer = rand() < CFG.beerChance;
      if (day.beer) {
        banner = { text: 'ПЯТНИЧНОЕ ПИВО В «МЮНХЕНЕ»', sub: 'Коллеги идут пить пиво. Жми E у выхода — и неделя закрыта!', t: 0 };
        say('aimashyn', pick(LINES.munich.yes), 3);
        playSound('clink');
        coworkers.forEach((c, i) => setTimeout(() => { if (mode === 'playing' && !c.ghost) { c.away = true; puff(c.x, c.y - 20, 'rgba(240,200,90,0.8)', 5, 10); } }, 1500 + i * 900));
        addLog('🍺 Коллеги ушли в «Мюнхен» на пиво. Ждут тебя!', 'good');
      } else {
        say('hlad', pick(LINES.munich.no), 3);
      }
    }
  }
  // Д.Н. уходит (обед/тревога) и возвращается через seconds
  function bossGoOut(seconds, why) {
    boss.outWhy = why;
    boss.outTimer = seconds;
    boss.state = 'goout';
    boss.path = findPath(boss, WD.exitDoor);
    boss.spotDesc = why === 'lunch' ? 'на обед' : 'на улицу';
  }

  // ---------- ВЗАИМОДЕЙСТВИЯ ----------
  const HIDDEN = new Set(['plant_hide', 'cabinet_hide', 'printer_hide', 'toilet', 'lunch', 'evac']);
  const AWAY = new Set(['toilet', 'lunch', 'evac']); // Быкентия нет в опенспейсе — не рисуем
  const SLACK_BASE = new Set(['smoke', 'youtube', 'fridge', 'chat', 'phone', 'meme']);
  const SLACK = { has: a => SLACK_BASE.has(a) && !(a === 'phone' && phoneSafe > 0) };
  // Склонения имён: родительный, дательный, творительный
  const NAME_CASES = { 'Асель': ['Асель', 'Асель', 'Асель'], 'Сиргей': ['Сиргея', 'Сиргею', 'Сиргеем'] };
  const nameCase = (n, i) => (NAME_CASES[n] ? NAME_CASES[n][i] : n + ['а', 'у', 'ом'][i]);
  const withName = n => nameCase(n, 2);
  function nearestPlant() {
    let best = null;
    for (const p of WD.plants) {
      const d = Math.hypot(player.x - p.x, player.y - p.y);
      if (d < 26 && (!best || d < best.d)) best = { p, d };
    }
    return best && best.p;
  }
  function currentZone() {
    if (player.action === 'work') return WD.zones.find(z => z.id === 'desk');
    const d = WD.playerDesk;
    if (player.x >= d.x - 8 && player.x <= d.x + d.w + 8) {
      if ((player.y >= WD.FLOOR_TOP && player.y <= WD.ROW1_Y + 2) ||
          (player.y >= WD.ROW1_Y + WD.DESK_DEPTH - 2 && player.y <= WD.ROW1_Y + WD.DESK_DEPTH + 28)) {
        return WD.zones.find(z => z.id === 'desk');
      }
    }
    return WD.zones.find(z => rectContains(z, player.x, player.y));
  }
  function coworkerById(id) { return coworkers.find(c => c.id === id); }

  function getActionInfo() {
    if (nudge && player.action === 'work') return { prompt: 'Блеб зовёт посмотреть мем: E — глянуть (кайф, палево) · не отвечать — обидится', target: 'desk' };
    if (player.action === 'plant_hide') return { prompt: 'E / H — вылезти из листвы', target: player.hideSpot };
    if (player.action === 'cabinet_hide') return { prompt: 'E / H — выйти из-за шкафов', target: 'archive' };
    if (player.action === 'printer_hide') return { prompt: 'E / H — вылезти из-за ксерокса', target: 'printer' };
    if (player.action === 'chat') return { prompt: 'Болтаете… (шаг — прервать)', target: `chat_${player.chatWith}` };
    if (player.action === 'queue') return { prompt: `Очередь в биотуалет: впереди ${day.queue} чел. (шаг — потерять место)`, target: 'toilet' };
    if (player.action === 'toilet') return { prompt: 'В синей кабинке. Единственное место без Д.Н.', target: 'toilet' };
    if (player.action === 'lunch') return { prompt: 'Обед в «Мюнхене»: жуёшь хрючево дня…', target: 'exit' };
    if (player.action === 'evac') return { prompt: 'Стоишь на улице с коллегами. Свежий воздух!', target: 'exit' };
    if (player.action === 'standup') return { prompt: 'Летучка: киваешь с умным видом…', target: 'standup' };
    const plant = nearestPlant();
    if (plant) return { prompt: `E / H — спрятаться: ${plant.label}`, target: plant.id, plant };
    if ((eventIs('food') || eventIs('bday')) && !officeEvent.used && rectContains(FEAST_ZONE, player.x, player.y)) {
      return { prompt: eventIs('bday') ? 'E — кусок торта со сбора (+4 кайфа, деньги не вернуть)' : `E — урвать ${officeEvent.food.name} (+10 кайфа, нервы в норме)`, target: 'feast', zone: FEAST_ZONE };
    }
    const z = currentZone();
    if (!z) return null;
    const prompts = {
      desk: player.action === 'work' ? 'E — встать из-за стола' : 'E — сесть за стол и открыть Excel',
      coffee: day.coffeeJammed ? 'E — очистить кофемашину от жмыха (+3 KPI)'
        : ((day.coffeeQueueTimer || 0) > 0 ? `Очередь у кофемашины (~${Math.ceil(day.coffeeQueueTimer)} с)`
        : (player.coffeeBoost > 0 ? 'E — ещё эспрессо (кофеин не кончился)' : 'E — сварить эспрессо (+35% к скорости)')),
      fridge: 'E — пошарить в холодильнике (кайф, но палевно)',
      water: (day.waterCups || 0) <= 0 ? `Кулер пуст — ждём доставку (~${Math.ceil(day.waterRecharge || 30)} мин.)`
        : `E — налить воды из кулера (${day.waterCups || 4}/4)`,
      smoke: player.action === 'smoke' ? 'E — потушить сигарету' : 'E — перекур с видом на горы',
      archive: 'E / H — затаиться за шкафами',
      printer: eventIs('jam') && !officeEvent.used ? 'E — вытащить зажёванную бумагу (+9 к плану) · H — спрятаться' : 'E — распечатать мем · H — спрятаться за ксероксом',
      server: player.action === 'youtube' ? 'E — закрыть вкладку' : (eventIs('internet') ? 'Интернета нет. Только Excel, только хардкор.' : 'E — YouTube на гигабитном канале'),
      exit: exitPrompt(),
      toilet: day.toiletCd > 0 ? `Биотуалет: пока не хочется (${Math.ceil(day.toiletCd)} с)` : 'E — встать в очередь в синюю кабинку',
      complain: eventIs('heat') || eventIs('noise')
        ? (boss.state === 'office' ? `E — пожаловаться Д.Н. на ${eventIs('heat') ? 'жару' : 'шум'}` : 'Д.Н. нет в кабинете — жаловаться некому')
        : 'Дверь Д.Н. Стучать без повода — плохая идея.',
      standup: eventIs('standup') ? 'E — встать на летучку и кивать' : 'Доска: «ПЛАН НА КВАРТАЛ: ВЫЖИТЬ»',
    };
    if (z.type === 'chat') {
      const c = coworkerById(z.coworker);
      if (c.away) return { prompt: c.remote ? `${c.name}: на удалёнке до четверга` : `${c.name}: место пустое — ушёл(ла)`, target: z.id, zone: z };
      if (!unlocked('coworkers')) return { prompt: `${c.name}: «Понедельник, не до болтовни». Коллеги — со вторника`, target: z.id, zone: z };
      return { prompt: c.cooldown > 0 ? `${c.name} занят(а) · ещё ${Math.ceil(c.cooldown)} с` : `E — поболтать с ${withName(c.name)}`, target: z.id, zone: z };
    }
    return { prompt: prompts[z.type], target: z.id, zone: z };
  }

  // Очередь в биотуалет: 0 — первый у двери, дальше вправо вдоль южной стены
  const queueSlot = i => ({ x: WD.toiletDoor.x + 26 + i * 17, y: WD.toiletDoor.y });
  function exitPrompt() {
    if (day.beer) return 'E — в «Мюнхен» на пятничное пиво 🍺 (закончить неделю)';
    if (eventIs('drill')) return 'E — эвакуироваться по тревоге';
    if (clockMinutes >= CFG.lunchOpen && clockMinutes < CFG.lunchClose && !day.fed) return 'E — на обед в «Мюнхен». ЖУКИ КАЛОЕДЫ!';
    if (day.fed && clockMinutes < CFG.lunchClose) return 'Уже пообедал. Хрючево переваривается.';
    return 'Выход на лестницу. Обед — 13:00–14:30, до 19:30 ни шагу.';
  }
  function startAction(action, seconds) {
    if (SLACK_BASE.has(action) && action !== 'phone') hint('slack', 'Это палево: если Д.Н. (или камера СБ) увидит — растёт подозрение. Следи за его конусом и радаром справа вверху.');
    if (action === 'phone') hint('phone', coarsePointer ? 'Телефон — тоже палево, но можно ходить. 📱 — убрать.' : 'Телефон — тоже палево, но можно ходить. Tab / Q — убрать.');
    player.action = action;
    player.actionTimer = seconds;
    player.actionTotal = seconds;
  }
  function endAction(reason) {
    const a = player.action;
    if (a === 'chat') {
      const c = coworkerById(player.chatWith);
      if (reason === 'done' && c) grantPerk(c);
      player.chatWith = null;
    }
    if (a === 'fridge' && reason === 'done') stats.fridge++;
    if (a === 'queue') {
      if (reason === 'done') {
        player.action = 'none';
        startAction('toilet', CFG.toiletSeconds);
        say('player', pick(LINES.toilet.inside), 3);
        day.cabinDoor = 0.6;
        playSound('slam');
        return;
      }
      day.queue = 0;
      toast('Ушёл из очереди. Место заняли.', 1.6);
    }
    if (a === 'toilet') {
      stats.toilet++;
      day.toiletCd = CFG.toiletCooldown;
      playSound('flush');
      day.cabinDoor = 0.8;
      player.x = WD.toiletDoor.x; player.y = WD.toiletDoor.y;
      floater(player.x, player.y - 64, 'ПОЛЕГЧАЛО', '#8fd0f0');
    }
    if (a === 'lunch' && reason === 'done') {
      day.fed = true; day.hungry = false; stats.lunch++;
      fun += 8;
      player.x = WD.exitDoor.x + 10; player.y = WD.exitDoor.y;
      say('player', pick(LINES.lunch.thoughts), 3);
      floater(player.x, player.y - 64, 'СЫТ · +8 КАЙФА', '#e8b070');
      addLog(`Обед в «Мюнхене»: ${day.dish}. Невкусно, но сытно.`, 'good');
    }
    if (a === 'smoke' && reason === 'done') stats.cigarettes++;
    if (a === 'youtube' && reason === 'done') stats.videos++;
    if (a === 'printer' && reason === 'done') { stats.printed++; floater(player.x, player.y - 64, 'МЕМ НАПЕЧАТАН', '#bfe3f0'); }
    if (a === 'fixjam' && reason === 'done') {
      addWork(9);
      floater(player.x, player.y - 64, 'КСЕРОКС ПОЧИНЕН +9 KPI', '#57d08a');
      addLog('Быкентий починил ксерокс. Герой отдела.', 'good');
      if (boss.seesPlayer || dist(boss, player) < 150) { say('boss', 'О! Технарь! Вот это я понимаю!', 2.8); stats.praise++; }
      else say('shurik', 'Спасибо! Он снова жуёт только иногда.', 2.6);
    }
    if (a === 'fix_coffee' && reason === 'done') {
      day.coffeeJammed = false;
      addWork(3);
      addFun(3);
      playSound('click');
      toast('Вытряхнул жмых, промыл поддон! Кофемашина снова варит.', 2.8);
      floater(player.x, player.y - 64, 'КОФЕМАШИНА ЧИСТА +3 KPI', '#57d08a');
      addLog('Быкентий почистил кофемашину. Офис спасён.', 'good');
    }
    player.action = 'none';
    player.actionTimer = 0;
    player.hideSpot = null;
    checkTodo();
  }

  function grantPerk(c) {
    stats.chats++;
    stats.chatted.add(c.id);
    c.cooldown = CFG.chatCooldown;
    fun += 4;
    if (c.perk === 'cover') coverTokens = 1;
    if (c.perk === 'intel') intelTimer = 45;
    if (c.perk === 'report') { addWork(8); floater(player.x, player.y - 64, '+8 К ПЛАНУ', '#57d08a'); }
    if (c.perk === 'snack') { nextBossCheck += 15; floater(player.x, player.y - 64, 'ПРОВЕРКА НА 15 С ПОЗЖЕ', '#f2bb38'); }
    if (c.perk === 'callhack') { phoneSafe = 25; floater(player.x, player.y - 64, '📱 25 С БЕЗ ПАЛЕВА', '#9fe0b0'); }
    if (c.perk === 'rocket') { boss.suspicion = 0; floater(player.x, player.y - 64, 'ПОЕХАЛИ! ПОДОЗРЕНИЕ 0', '#9fd0ff'); }
    playSound('success');
    toast(LINES.perks[c.perk], 3.2);
    addLog(`Поболтал с ${c.name}. ${LINES.perks[c.perk]}`, 'good');
  }

  function interact() {
    if (nudge && player.action === 'work') {
      // Блеб показывает мем через перегородку: кайф, но ты уже не в Excel
      nudge = null;
      player.action = 'none';
      startAction('meme', 3);
      say('bleb', pick(LINES.nudge.meme), 2.6);
      return;
    }
    const info = getActionInfo();
    if (player.action === 'plant_hide' || player.action === 'cabinet_hide' || player.action === 'printer_hide') {
      playSound('hide');
      if (player.action === 'plant_hide' && player.hideSpot) { player.y = player.hideSpot.y + 14; }
      if (player.action === 'printer_hide') player.y = 452;
      if (player.action === 'cabinet_hide') player.x = 70;
      endAction('cancel');
      toast('Быкентий вылез из укрытия.', 1.4);
      return;
    }
    if (player.action === 'chat' || AWAY.has(player.action) || player.action === 'queue' || player.action === 'standup') return;
    if (!info) return;

    if (info.plant) {
      const p = info.plant;
      player.hideSpot = { x: p.x, y: p.y };
      player.x = p.x; player.y = p.y - 2;
      startAction('plant_hide', 0);
      playSound('hide');
      puff(p.x, p.y - 20, 'rgba(90,160,90,0.8)', 6, 20, -6);
      toast(`Спрятался: ${p.label}. Для Д.Н. тебя нет.`, 2.2);
      return;
    }
    const z = info.zone;
    switch (z.type) {
      case 'desk':
        if (player.action === 'work') {
          endAction('cancel');
          player.y = player.workFromFront ? (WD.ROW1_Y + WD.DESK_DEPTH + 6) : (WD.FLOOR_TOP + 20);
          return;
        }
        player.workFromFront = player.y > (WD.ROW1_Y + 10);
        player.x = SEAT.x; player.y = SEAT.y;
        day.excelWorkAcc = 0;
        startAction('work', 0);
        playSound('click');
        addLog('Быкентий открыл Excel. Пальцы стучат по формулам.', 'good');
        break;
      case 'coffee':
        if (player.action === 'coffee' || player.action === 'fix_coffee') return;
        if ((day.coffeeQueueTimer || 0) > 0) {
          toast(pick(LINES.coffeeQueue), 2.8);
          return;
        }
        if (day.coffeeJammed) {
          startAction('fix_coffee', 2.8);
          toast('Вытряхиваем жмых, промываем поддон (~3 с)...', 2.8);
          return;
        }
        startAction('coffee', 2.8);
        day.coffeeCups = (day.coffeeCups || 0) + 1;
        if (day.coffeeCups >= 3 && rand() < 0.45) {
          day.coffeeJammed = true;
        }
        stats.coffees++;
        player.coffeeBoost = CFG.coffeeSeconds + (has('turka') ? 8 : 0);
        addFun(5);
        playSound('coffee');
        puff(119, WD.FLOOR_TOP - 20, 'rgba(255,255,255,0.7)', 8);
        floater(player.x, player.y - 64, '+5 КАЙФ · СКОРОСТЬ', '#e8b070');
        addLog(`Кофе №${stats.coffees}. Кофеин бодрит.`, 'good');
        checkTodo();
        break;
      case 'water':
        if (player.action === 'water') return;
        if ((day.waterCups || 0) <= 0) {
          toast(`Вода в кулере кончилась. Ждём доставку (~${Math.ceil(day.waterRecharge || 30)} мин.)`, 2.6);
          return;
        }
        startAction('water', 1.8);
        day.waterCups = (day.waterCups || 4) - 1;
        const wGain = eventIs('heat') ? 6 : 2;
        addFun(wGain);
        playSound('coffee');
        puff(218, 206, 'rgba(120,200,250,0.9)', 5, 8, -8);
        floater(player.x, player.y - 64, `+${wGain} КАЙФ (${day.waterCups} ост.)`, '#8fd0f0');
        if (day.waterCups === 0) {
          day.waterRecharge = 30;
          addLog('Вода в кулере закончилась: бутыль пустая, кулер булькнул.', 'info');
        }
        break;
      case 'fridge':
        startAction('fridge', 4.5);
        playSound('click');
        say('player', pick(LINES.thoughts.fridge), 3.5);
        break;
      case 'smoke':
        if (player.action === 'smoke') { endAction('cancel'); toast('Сигарета потушена.', 1.4); return; }
        startAction('smoke', 7);
        playSound('smoke');
        say('player', pick(LINES.thoughts.smoke), 3.2);
        addLog('Перекур на балконе. Горы, ветер, Кок-Тобе.', 'bad');
        break;
      case 'archive':
        player.x = 70; player.y = Math.min(Math.max(player.y, 380), 470);
        startAction('cabinet_hide', 0);
        playSound('hide');
        toast('Затаился между шкафами. Папки закрывают с головой.', 2.2);
        break;
      case 'feast':
        officeEvent.used = true;
        startAction('eat', 2.4);
        if (eventIs('bday')) {
          fun += 4;
          say('player', 'Торт за 5000 ₸. Самый дорогой кусок в моей жизни.', 3);
          floater(player.x, player.y - 64, '+4 КАЙФ', '#f0d0e0');
          playSound('coffee');
          break;
        }
        fun += 10;
        stats.feasts = (stats.feasts || 0) + 1;
        playSound('coffee');
        say('player', `${officeEvent.food.name[0].toUpperCase()}${officeEvent.food.name.slice(1)}! Жизнь удалась.`, 2.6);
        floater(player.x, player.y - 64, '+10 КАЙФ', officeEvent.food.color);
        addLog(`Урвал ${officeEvent.food.name} на кухне.`, 'good');
        break;
      case 'printer':
        if (eventIs('jam') && !officeEvent.used) {
          officeEvent.used = true;
          startAction('fixjam', 3);
          playSound('click');
          say('player', 'Так, где тут у него зажевалось...', 2.6);
          break;
        }
        startAction('printer', 3.5);
        playSound('click');
        say('player', pick(LINES.thoughts.printer), 3);
        fun += 3; addWork(2);
        break;
      case 'server':
        if (player.action === 'youtube') { endAction('cancel'); toast('Вкладка закрыта.', 1.4); return; }
        if (eventIs('internet')) { say('player', 'Интернета нет... Придётся работать?!', 2.4); return; }
        startAction('youtube', 8);
        playSound('click');
        say('player', pick(LINES.thoughts.youtube), 3.2);
        addLog('Серверная: 4K-ролик на гигабитном канале.', 'bad');
        break;
      case 'exit':
        if (day.beer) { goMunichBeer(); return; }
        if (eventIs('drill')) {
          startAction('evac', 0);
          playSound('hide');
          fun += 8;
          floater(player.x, player.y - 64, 'ЭВАКУИРОВАН · +8 КАЙФ', '#9fe0b0');
          addLog('Быкентий эвакуировался. Стоит на улице, дышит.', 'good');
          return;
        }
        if (clockMinutes >= CFG.lunchOpen && clockMinutes < CFG.lunchClose && !day.fed) {
          day.dish = pick(LINES.lunch.dishes);
          startAction('lunch', CFG.lunchSeconds);
          say('player', 'ЖУКИ КАЛОЕДЫ, я на обед!', 2.4);
          toast(`«Мюнхен», бизнес-ланч: ${day.dish}.`, 3);
          playSound('click');
          return;
        }
        toast(exitPrompt(), 2);
        return;
      case 'toilet': {
        if (!unlocked('toilet')) { toast('Биотуалет «на санобработке» до среды.', 1.8); return; }
        if (day.toiletCd > 0) { say('player', pick(LINES.toilet.busy), 2); return; }
        day.queue = 1 + Math.floor(rand() * 3);
        day.queueTotal = day.queue;
        day.qShift = 0; day.knock = 2 + rand() * 3;
        player.queueTarget = queueSlot(day.queue); // сам идёт в конец очереди
        startAction('queue', day.queue * CFG.toiletPerPerson);
        say('player', pick(LINES.toilet.queue), 2.6);
        return;
      }
      case 'complain': {
        const kind = eventIs('heat') ? 'heat' : (eventIs('noise') ? 'noise' : null);
        if (!kind) { toast('Жаловаться не на что. Пока.', 1.6); return; }
        if (boss.state !== 'office') { toast('Д.Н. нет в кабинете.', 1.6); return; }
        if (officeEvent.used) { say('boss', 'Я же сказал — заявку в АХО!', 2.4); return; }
        officeEvent.used = true;
        stats.complaints++;
        fun += 5;
        say('player', kind === 'heat' ? 'Директор Начальникович, тут +32! Кондей сдох!' : 'Директор Начальникович, сверлят! Невозможно работать!', 2.8);
        setTimeout(() => { if (mode === 'playing') say('boss', pick(LINES.boss.complain[kind]), 3); }, 1500);
        if (rand() < 0.5) {
          officeEvent.t = Math.min(officeEvent.t, 5);
          addLog(kind === 'heat' ? 'Жалоба сработала: АХО включило кондей.' : 'Жалоба сработала: соседи притихли.', 'good');
          toast('Жалоба сработала! Скоро станет легче. +5 кайфа', 2.4);
        } else {
          addLog('Пожаловался Д.Н. Выпустил пар — уже приятно.', 'info');
          toast('Выпустил пар: +5 кайфа. Проблема осталась.', 2.4);
        }
        return;
      }
      case 'standup':
        if (!eventIs('standup')) { say('player', 'План на квартал: выжить. Согласен.', 2.4); return; }
        startAction('standup', 0);
        player.facingX = 1;
        say('player', 'Я здесь! Слушаю внимательно.', 2.2);
        choice = { t: 0, asked: false, done: false };
        return;
      case 'chat': {
        const c = coworkerById(z.coworker);
        if (c.away) { toast(`${c.name} ушёл(ла). Стул ещё тёплый.`, 1.6); return; }
        if (!unlocked('coworkers')) { say(c.id, 'Понедельник же, не до разговоров!', 2); return; }
        if (c.cooldown > 0) { say(c.id, pick(['Отстань, я занят(а)!', 'Потом, дедлайн!', 'Не сейчас, Д.Н. бдит.']), 2.2); return; }
        const pair = pick(LINES.chat[c.id]);
        player.chatWith = c.id;
        player.chatPair = pair;
        startAction('chat', 6.5);
        say('player', pair[0], 3);
        c.talkTimer = 6.5;
        addLog(`Быкентий подкатил поболтать к ${c.name}.`, 'info');
        break;
      }
      default: break;
    }
  }

  function togglePhone() {
    if (player.action === 'phone') { endAction('cancel'); playSound('click'); return; }
    if (AWAY.has(player.action)) return;
    if (player.action === 'work' || HIDDEN.has(player.action) || player.action === 'chat') {
      // в Excel и в укрытии телефон тоже можно достать — но это палево
      if (player.action === 'work') player.y = SEAT.y;
      if (player.action === 'plant_hide' && player.hideSpot) player.y = player.hideSpot.y + 14;
      if (player.action === 'chat') return;
      endAction('cancel');
    }
    startAction('phone', 0);
    phoneBuzz = 0;
    playSound('blip');
  }

  function quickHide() {
    const plant = nearestPlant();
    const z = currentZone();
    if (AWAY.has(player.action)) return;
    if (HIDDEN.has(player.action)) { interact(); return; }
    if (plant) { interact(); return; }
    if (z && z.type === 'archive') { interact(); return; }
    if (z && z.type === 'printer') {
      player.x = 430; player.y = 468;
      startAction('printer_hide', 0);
      playSound('hide');
      toast('Присел за ксероксом. Пахнет тонером и страхом.', 2);
      return;
    }
    toast('Укрытия: растения, шкафы архива и ксерокс (H рядом с ними).', 2.2);
  }

  // ---------- ДОСТИЖЕНИЯ ----------
  const ACHIEVEMENTS = [
    { id: 'ghost', icon: '👻', name: 'Невидимка', desc: 'Пережить смену без единого выговора', end: r => r.win && reprimands === 0 },
    { id: 'beshbarmak', icon: '🍖', name: 'Бешбармак Д.Н.', desc: 'Трижды за смену пошарить в чужом холодильнике', now: () => stats.fridge >= 3 },
    { id: 'majik', icon: '🏔', name: 'Спаситель Маджикистана', desc: 'Поднять Маджикистан', now: () => (stats.majikFixed || 0) >= 1 },
    { id: 'majikweek', icon: '🚀', name: 'Маджикистан запущен', desc: 'Закончить неделю с Маджикистаном +2', end: r => r.win && r.dayName === 'ПЯТНИЦА' && majikArc >= 2 },
    { id: 'munich', icon: '🍺', name: 'Пятница в «Мюнхене»', desc: 'Уйти на пятничное пиво', end: r => r.result === 'munich' },
    { id: 'lightning', icon: '⚡', name: 'Громоотвод', desc: 'Три соседа отчитаны Д.Н. за смену', now: () => stats.scolds >= 3 },
    { id: 'toilet', icon: '🚽', name: 'Король биотуалета', desc: 'Дважды отстоять очередь за смену', now: () => stats.toilet >= 2 },
    { id: 'alttab', icon: '⎇', name: 'Альт-таб мастер', desc: 'Спастись альт-табом, когда подозрение выше 60%', now: () => (stats.altTabClutch || 0) >= 1 },
    { id: 'pet', icon: '⭐', name: 'Любимчик Д.Н.', desc: '5 похвал за смену', now: () => stats.praise >= 5 },
    { id: 'kaif', icon: '🎸', name: 'Кайфожор', desc: 'Заполнить шкалу кайфа до максимума (100)', now: () => fun >= 100 },
    { id: 'week', icon: '📅', name: 'Неделя пережита', desc: 'Пройти пятницу', end: r => r.win && r.dayName === 'ПЯТНИЦА' },
    { id: 'shopper', icon: '🛒', name: 'Обустроился', desc: 'Купить 4 апгрейда', now: () => Object.keys(owned).length >= 4 },
    { id: 'veteran', icon: '🔥', name: 'Ветеран', desc: 'Пережить смену на сложности «Ветеран»', end: r => r.win && diffKey === 'hard' },
    { id: 'popcorn', icon: '🍿', name: 'Попкорн', desc: 'Досмотреть смену на автопилоте', end: r => auto.on },
  ];
  let achieved = store.get('ach', {}) || {};
  function unlock(a) {
    if (achieved[a.id]) return;
    achieved = { ...achieved, [a.id]: true };
    store.set('ach', achieved);
    playSound('coin');
    toast(`🏆 Достижение: ${a.icon} ${a.name}`, 3);
    addLog(`🏆 Достижение: «${a.name}» — ${a.desc}.`, 'good');
  }
  function checkAchievements(endInfo) {
    if (!stats) return;
    for (const a of ACHIEVEMENTS) {
      if (achieved[a.id]) continue;
      if (a.now && a.now()) unlock(a);
      else if (endInfo && a.end && a.end(endInfo)) unlock(a);
    }
  }
  const achCount = () => ACHIEVEMENTS.filter(a => achieved[a.id]).length;

  // ---------- БОСС-КЛАВИША («АЛЬТ-ТАБ») ----------
  // B / И: мгновенно сделать вид, что работаешь. Спасает, если Д.Н. уже что-то заподозрил.
  const FAKE_TEXT = {
    youtube: ['EXCEL ПОВЕРХ YOUTUBE', 'Это... обучающее видео по Excel!'],
    phone: ['ПИШЕТ В РАБОЧИЙ ЧАТ', 'Отвечаю по Маджикистану!'],
    fridge: ['ИЩЕТ СВОЙ ЙОГУРТ', 'Я за своим! Подписан же!'],
    smoke: ['ЗВОНОК КЛИЕНТУ', 'Да-да, по автокредиту, слушаю!'],
    chat: ['ОБСУЖДАЕТ МАДЖИКИСТАН', 'Так вот, по Маджикистану...'],
  };
  function bossKey() {
    if (!unlocked('bosskey')) { toast('Альт-таб откроется в среду — пока учись без него.', 1.6); return false; }
    const a = player.action;
    if (!FAKE_TEXT[a] || bossKeyCd > 0) {
      if (bossKeyCd > 0) toast(`Альт-таб перезаряжается: ${Math.ceil(bossKeyCd)} с`, 1.2);
      return false;
    }
    const sus = boss.suspicion;
    const txt = FAKE_TEXT[a];
    if (a === 'chat') { player.chatWith = null; }
    if (a === 'smoke' || a === 'youtube' || a === 'fridge') { /* кайф за прерванное не отнимаем */ }
    player.action = 'none';
    startAction('fake', 4);
    player.fakeLabel = txt[0];
    say('player', txt[1], 2.4);
    bossKeyCd = 10;
    playSound('click');
    if (sus > 0) {
      boss.suspicion = 0;
      stats.altTabSaves = (stats.altTabSaves || 0) + 1;
      if (sus > 60) { fun += 5; floater(player.x, player.y - 70, 'АЛЬТ-ТАБ НА ГРАНИ! +5 КАЙФ', '#f2bb38'); stats.altTabClutch = (stats.altTabClutch || 0) + 1; }
      else floater(player.x, player.y - 70, 'АЛЬТ-ТАБ! ЧИСТО', '#9fe0b0');
      if (rand() < 0.5) say('boss', pick(['Хм. Показалось.', 'А, работаете. Ну-ну.', 'Маджикистан, говоришь? Ладно.']), 2.2);
    }
    checkAchievements();
    return true;
  }

  // ---------- ИИ НАЧАЛЬНИКА ----------
  function bossGoTo(target, state, desc) {
    boss.state = state;
    boss.target = { x: target.x, y: target.y };
    boss.path = findPath(boss, target);
    boss.spotDesc = desc || boss.spotDesc;
  }
  // Куда Д.Н. идёт гулять: общие точки или к столу случайного коллеги
  function strollSpot() {
    const people = coworkers.filter(c => !c.away && !c.ghost);
    if (people.length && rand() < 0.45) {
      const c = pick(people);
      return { x: c.desk.seatX, y: c.desk.y + WD.DESK_DEPTH + 16, desc: `к ${nameCase(c.name, 1)}` };
    }
    return pick(WD.patrolSpots);
  }
  function startStroll() {
    boss.warned = false;
    boss.silentCheck = false;
    const s = strollSpot();
    bossGoTo(s, 'patrol', s.desc);
    if (rand() < 0.5) say('boss', pick(LINES.boss.stroll), 2.4, '#e8e2d0');
    nextBossCheck = (CFG.checkInterval[0] + rand() * (CFG.checkInterval[1] - CFG.checkInterval[0])) * 0.6 * diff().check;
  }
  function startInspection(force = false) {
    if (!force && rand() < CFG.strollChance && !boss.warned) { startStroll(); return; }
    boss.warned = false;
    const raid = rand() < 0.3;
    boss.mode = raid ? 'raid' : 'desk';
    boss.visitedSpots = 0;
    boss.inspectAge = 0;
    if (raid) bossGoTo(pick(WD.patrolSpots), 'inspect', 'рейд по этажу');
    else bossGoTo(DESK_FRONT, 'inspect', 'твой стол');
    playSound('alarm');
    say('boss', pick(LINES.boss.alarm), 3);
    addLog('🚨 Д.Н. пошёл с проверкой!', 'bad');
    toast(raid ? 'ТРЕВОГА! Рейд по этажу — прячься или беги в Excel!' : 'ТРЕВОГА! Д.Н. идёт к твоему столу — садись в Excel!', 3.4);
    // коллеги предупреждают, если Быкентий рядом
    for (const c of coworkers) {
      if (Math.hypot(player.x - c.x, player.y - c.y) < 150) { say(c.id, pick(LINES.coworkerWarn), 2.4, '#ffd4c8'); break; }
    }
  }
  function playerVisibleToBoss() {
    if (HIDDEN.has(player.action)) return false;
    const d = dist(boss, player);
    if (boss.state === 'gone' || boss.state === 'out') return false;
    const range = (boss.state === 'inspect' ? CFG.visionRangeInspect : CFG.visionRange) * (today().visionMul || 1) * diff().vision * (eventIs('arrfr') ? 1.2 : 1);
    if (d > range) return false;
    const eye = { x: boss.x, y: boss.y - 4 };
    const target = { x: player.x, y: player.y - 4 };
    if (d > 34) {
      const a = Math.atan2(player.y - boss.y, player.x - boss.x);
      if (Math.abs(angleDiff(a, boss.facing)) > CFG.visionHalfAngle) return false;
    }
    return lineOfSight(eye, target);
  }
  function playerIsWorking() { return player.action === 'work'; }

  // ---------- ПЛАН НА ДЕНЬ ----------
  // Работа не тает. До плана идёт полностью, сверх плана — с малой отдачей: выгоднее уйти кайфовать.
  function addWork(n) {
    const before = usefulness;
    const toPlan = Math.max(0, Math.min(n, planTarget - usefulness));
    usefulness = Math.min(200, usefulness + toPlan + (n - toPlan) * CFG.overPlan);
    if (before < planTarget && usefulness >= planTarget) {
      stats.planAt = clockMinutes;
      playSound('success');
      banner = { text: 'ПЛАН ВЫПОЛНЕН ✓', sub: 'Дальше работа почти ничего не даёт — время кайфовать! (Excel — только как прикрытие.)', t: 0 };
      addLog(`✔ План дня выполнен в ${timeString(clockMinutes)}. Теперь можно кайфовать.`, 'good');
      checkTodo();
    }
  }
  const planDone = () => usefulness >= planTarget;

  // ---------- ВЫГОВОРЫ ----------
  // Единственная угроза: 3 выговора = уволен. Прикрытие Аймашына прощает один.
  function reprimand(reason, short) {
    if (mode !== 'playing') return false;
    if (coverTokens > 0) {
      coverTokens = 0;
      say('aimashyn', 'Директор Начальникович, он по моему поручению!', 3, '#ffd4c8');
      setTimeout(() => { if (mode === 'playing') say('boss', 'Ну... ладно. Смотрите мне!', 2.6); }, 1200);
      addLog(`Аймашын отмазал Быкентия: «${short}» не засчитан.`, 'good');
      toast(`🛡 Аймашын прикрыл! Выговор за «${short}» не дали.`, 3);
      return false;
    }
    reprimands++;
    stats.reprimands = reprimands;
    weekReprimands++;
    store.set('weekReprimands', weekReprimands);
    flash = 0.9; shake = 0.5;
    playSound('caught');
    const dMax = diff().dayReprimandsMax || 3;
    const wMax = diff().weekReprimandsMax || 5;
    banner = { text: `ВЫГОВОР ${reprimands}/${dMax} (НЕДЕЛЯ: ${weekReprimands}/${wMax})`, sub: reason, t: 0, bad: true };
    // Передышка: выговоры не идут очередью
    boss.suspicion = 0;
    boss.catchCooldown = Math.max(boss.catchCooldown, CFG.reprimandGrace);
    nextBossCheck = Math.max(nextBossCheck, CFG.reprimandGrace + 6);
    if (officeEvent && officeEvent.id === 'sb') officeEvent.watch = 0;
    addLog(`📝 ВЫГОВОР ${reprimands}/${dMax} (за неделю: ${weekReprimands}/${wMax}): ${reason}`, 'bad');
    if (reprimands === dMax - 1) hint('rep2', 'Остался 1 выговор до увольнения! Не попадайся в конус Д.Н. и будь на месте.');
    if (reprimands >= dMax || weekReprimands >= wMax) setTimeout(() => finishGame('fired'), 900);
    return true;
  }
  // Проверка стола: Д.Н. не застал на месте → счётчик; на лимите — выговор
  function missAtDesk(what) {
    day.misses++;
    stats.misses = (stats.misses || 0) + 1;
    const lim = diff().missLimit;
    floater(player.x, player.y - 70, `НЕ ЗАСТАЛ НА МЕСТЕ ${Math.min(day.misses, lim)}/${lim}`, '#ff8a7a');
    addLog(`👀 ${what}: не застал на месте ${day.misses}/${lim}.`, 'bad');
    toast(`👀 ${what} — «не застал на месте» ${day.misses}/${lim}. На ${lim} — выговор.`, 3);
    playSound('suspect');
    if (day.misses >= lim) { day.misses = 0; reprimand(`Д.Н. ${lim} раз не застал тебя на месте`, 'не на месте'); }
  }

  function caught() {
    stats.catches++;
    const why = { smoke: 'курил на балконе', youtube: 'смотрел YouTube', fridge: 'шарил в холодильнике', chat: 'болтал', phone: 'сидел в телефоне', meme: 'смотрел мем Блеба', toilet: 'сидел в биотуалете' }[player.action];
    reprimand(why ? `Д.Н. видел, как ты ${why}` : 'на проверке ты был не в Excel', 'залёт');
    boss.suspicion = 0;
    boss.state = 'lecture';
    boss.stateTimer = 2.6;
    boss.path = [];
    boss.facing = Math.atan2(player.y - boss.y, player.x - boss.x);
    flash = 0.9;
    shake = 0.5;
    playSound('caught');
    say('boss', pick(LINES.boss.caught), 3);
    floater(player.x, player.y - 70, 'СПАЛИЛИ! ВЫГОВОР', '#ff6a5a');
    if (player.action !== 'none' && player.action !== 'work') endAction('cancel');
  }

  function passDeskInspection() {
    stats.inspectPass++;
    addWork(6);
    stats.praise++;
    say('boss', pick(LINES.boss.praise), 3);
    floater(player.x, player.y - 70, 'ПРОВЕРКА ПРОЙДЕНА +6 К ПЛАНУ', '#57d08a');
    playSound('success');
    addLog('Проверка пройдена: Быкентий «считал риски».', 'good');
    checkTodo();
  }
  function finishDeskInspection() {
    if (HIDDEN.has(player.action) && player.action === 'plant_hide') stats.plantHideInspect++;
    if (playerIsWorking()) { passDeskInspection(); endInspection(); return; }
    // Стола пусто: Д.Н. ждёт у стола — есть шанс успеть вернуться
    boss.state = 'waitDesk';
    boss.waitT = diff().wait + (has('cactus') ? 1.5 : 0);
    boss.moving = false;
    boss.facing = -Math.PI / 2;
    say('boss', pick(LINES.boss.emptyDesk), 3);
    playSound('alarm');
    toast(`🚨 Д.Н. у твоего пустого стола! Успей сесть в Excel за ${Math.ceil(boss.waitT)} с`, 2.6);
    hint('waitDesk', 'Д.Н. ждёт у стола. Вернёшься в Excel до конца таймера — отмажешься. Не успеешь — «не застал на месте» +1, на лимите выговор.');
  }

  function endInspection() {
    nextBossCheck = (CFG.checkInterval[0] + rand() * (CFG.checkInterval[1] - CFG.checkInterval[0])) * (today().checkMul || 1) * diff().check;
    boss.silentCheck = rand() < diff().surprise;
    if (rand() < 0.4) { bossGoTo(WD.bossHome, 'return', 'кабинет'); }
    else { bossGoTo(pick(WD.patrolSpots), 'patrol'); }
  }

  function followPath(dt, speed) {
    if (!boss.path.length) { boss.moving = false; return true; }
    const wp = boss.path[0];
    const d = dist(boss, wp);
    if (d < 3) { boss.path.shift(); return !boss.path.length; }
    const vx = (wp.x - boss.x) / d;
    const vy = (wp.y - boss.y) / d;
    const step = Math.min(d, speed * dt);
    boss.x += vx * step;
    boss.y += vy * step;
    const want = Math.atan2(vy, vx);
    boss.facing += angleDiff(want, boss.facing) * Math.min(1, dt * 8);
    if (Math.abs(vx) > 0.15) boss.facingX = vx < 0 ? -1 : 1;
    boss.moving = true;
    const prev = Math.floor(boss.walkTimer);
    boss.walkTimer += dt * (speed / 9);
    if (prev !== Math.floor(boss.walkTimer) && Math.floor(boss.walkTimer) % 2 === 0) {
      particles.push({ x: boss.x + (rand() - 0.5) * 10, y: boss.y + 1, vx: (rand() - 0.5) * 6, vy: -2, size: 1.5, life: 0.4, maxLife: 0.4, color: boss.state === 'inspect' ? 'rgba(235,80,60,0.5)' : 'rgba(160,170,160,0.45)' });
    }
    return false;
  }

  function lookAround(dt) {
    boss.lookTimer += dt;
    boss.facing += Math.sin(boss.lookTimer * 1.6) * dt * 1.8;
    boss.facingX = Math.cos(boss.facing) < 0 ? -1 : 1;
  }

  function updateBoss(dt) {
    boss.stateTimer -= dt;
    boss.catchCooldown = Math.max(0, boss.catchCooldown - dt);
    boss.quoteTimer -= dt;
    boss.praiseTimer = Math.max(0, boss.praiseTimer - dt);

    if (mode === 'playing' && !['inspect', 'waitDesk', 'lecture', 'leaving', 'gone', 'goout', 'out', 'scold', 'standup'].includes(boss.state) && !eventIs('call') && !eventIs('drill')) {
      nextBossCheck -= dt;
      // Иногда проверка внезапная — без «Кхм-кхм» (зависит от сложности)
      if (nextBossCheck < diff().warn && !boss.warned && !boss.silentCheck && rand() < CFG.strollChance) startStroll();
      else if (nextBossCheck < diff().warn && !boss.warned && !boss.silentCheck) {
        boss.warned = true;
        say('boss', 'Кхм-кхм...', 1.8);
        playSound('ahem');
      }
      if (nextBossCheck <= 0) startInspection();
    }
    // Пятница: после 17:00 Директор уезжает «на встречу»
    if (mode === 'playing' && today().bossLeaves && clockMinutes >= today().bossLeaves && boss.state !== 'gone') {
      if (boss.state === 'out' || boss.state === 'goout') { boss.state = 'gone'; boss.x = -100; addLog('Д.Н. так и не вернулся: «встреча». Пятница, детка!', 'good'); }
      else if (boss.state !== 'leaving') {
        boss.state = 'leaving';
        boss.path = findPath(boss, { x: 40, y: 300 });
        say('boss', 'Так, у меня встреча. Важная. На даче.', 3);
        addLog('Д.Н. уехал «на встречу». Пятница, детка!', 'good');
      }
    }

    switch (boss.state) {
      case 'office':
        boss.moving = false;
        boss.facing = Math.PI / 2;
        if (boss.quoteTimer <= 0) { say('boss', pick(LINES.boss.office), 2.6, '#e8e2d0'); boss.quoteTimer = 10 + rand() * 6; }
        if (boss.stateTimer <= 0) { const s = strollSpot(); bossGoTo(s, 'patrol', s.desc); }
        break;
      case 'patrol':
        if (followPath(dt, CFG.bossSpeed)) { boss.state = 'look'; boss.stateTimer = 2 + rand() * 2; boss.lookTimer = 0; }
        break;
      case 'look':
        boss.moving = false;
        lookAround(dt);
        if (boss.stateTimer <= 0) {
          if (rand() < 0.22) bossGoTo(WD.bossHome, 'return', 'кабинет');
          else { const s = strollSpot(); bossGoTo(s, 'patrol', s.desc); }
        }
        break;
      case 'return':
        if (followPath(dt, CFG.bossSpeed)) { boss.state = 'office'; boss.stateTimer = 7 + rand() * 6; boss.x = WD.bossHome.x; boss.y = WD.bossHome.y; }
        break;
      case 'inspect':
        // Страховка: проверка не тянется дольше 30 с (застрял в пути)
        boss.inspectAge = (boss.inspectAge || 0) + dt;
        if (boss.inspectAge > 30) { endInspection(); break; }
        if (boss.inspectTimer > 0) {
          boss.moving = false;
          boss.inspectTimer -= dt;
          if (boss.mode === 'desk') boss.facing = -Math.PI / 2; else lookAround(dt);
          if (boss.inspectTimer <= 0) {
            if (boss.mode === 'desk') finishDeskInspection();
            else if (boss.visitedSpots < 2) { boss.visitedSpots++; bossGoTo(pick(WD.patrolSpots), 'inspect', 'рейд по этажу'); }
            else { addLog('Рейд окончен. Д.Н. выдохся.', 'info'); endInspection(); }
          }
        } else if (followPath(dt, CFG.bossInspectSpeed * diff().speed)) {
          boss.inspectTimer = boss.mode === 'desk' ? 1.2 : 2.2; // у стола смотрит сразу
          boss.lookTimer = 0;
        }
        break;
      case 'waitDesk':
        boss.moving = false;
        boss.facing = -Math.PI / 2;
        if (playerIsWorking()) {
          say('player', pick(LINES.excuses), 2.6);
          setTimeout(() => { if (mode === 'playing') say('boss', 'Ну-ну. Работай давай.', 2.2); }, 1300);
          addLog('Быкентий успел к столу и отмазался.', 'info');
          endInspection();
          nextBossCheck *= 0.7; // Д.Н. насторожился — следующая проверка раньше
          break;
        }
        boss.waitT -= dt;
        if (boss.waitT <= 0) {
          say('boss', pick(LINES.boss.gaveUp), 3);
          missAtDesk('Д.Н. не дождался тебя у стола');
          endInspection();
        }
        break;
      case 'lecture':
        boss.moving = false;
        if (boss.stateTimer <= 0) endInspection();
        break;
      case 'leaving':
        if (followPath(dt, CFG.bossSpeed + 20)) { boss.state = 'gone'; boss.x = -100; boss.y = 300; }
        break;
      case 'gone':
        boss.moving = false;
        break;
      case 'goout':
        if (followPath(dt, CFG.bossSpeed + 15)) { boss.state = 'out'; boss.x = -100; boss.y = WD.exitDoor.y; }
        break;
      case 'out':
        boss.moving = false;
        boss.outTimer -= dt;
        if (boss.outTimer <= 0 && !(boss.outWhy === 'drill' && eventIs('drill'))) {
          boss.x = WD.exitDoor.x; boss.y = WD.exitDoor.y;
          bossGoTo(WD.bossHome, 'return', 'кабинет');
          if (boss.outWhy === 'lunch') say('boss', pick(LINES.boss.lunchBack), 3);
          nextBossCheck = Math.max(nextBossCheck, 8);
        }
        break;
      case 'scold': {
        const c = coworkerById(boss.scoldTarget);
        if (boss.inspectTimer > 0) {
          boss.moving = false;
          boss.inspectTimer -= dt;
          if (c) boss.facing = Math.atan2(c.y - boss.y, c.x - boss.x);
          if (boss.inspectTimer <= 0) bossGoTo(pick(WD.patrolSpots), 'patrol');
        } else if (followPath(dt, CFG.bossInspectSpeed)) {
          boss.inspectTimer = 3.4;
          if (c) {
            say('boss', pick(LINES.boss.scold[c.id]), 3.2);
            setTimeout(() => { if (mode === 'playing') say(c.id, pick(['Я работаю! Честно!', 'Это для отчёта!', 'Я на созвоне!', 'Уже убрал!']), 2.4, '#ffd4c8'); }, 1500);
            c.slack = null; c.slackTimer = 14 + rand() * 10; c.scoldCooldown = 45;
            stats.scolds++;
            addLog(`Д.Н. отчитывает: ${c.name}. У Быкентия — окно.`, 'good');
            checkTodo();
          }
        }
        break;
      }
      case 'standup':
        if (followPath(dt, CFG.bossInspectSpeed)) {
          boss.moving = false;
          boss.facing = Math.PI;
          boss.facingX = -1;
          if (boss.quoteTimer <= 0) { say('boss', pick(LINES.boss.standupTalk), 3); boss.quoteTimer = 5; }
        }
        if (!eventIs('standup')) endInspection();
        break;
      default: break;
    }

    // Второй ряд отвлекается: Д.Н. замечает и идёт отчитывать (громоотвод для Быкентия)
    if ((boss.state === 'patrol' || boss.state === 'look') && mode === 'playing') {
      const range = CFG.visionRange * (today().visionMul || 1) * diff().vision * (eventIs('arrfr') ? 1.2 : 1);
      const target = coworkers.find(c => c.extra && c.slack && !c.away && c.scoldCooldown <= 0 && dist(boss, c) < range &&
        (dist(boss, c) < 34 || Math.abs(angleDiff(Math.atan2(c.y - boss.y, c.x - boss.x), boss.facing)) < CFG.visionHalfAngle) && lineOfSight(boss, c));
      if (target) {
        boss.scoldTarget = target.id;
        boss.inspectTimer = 0;
        bossGoTo({ x: target.desk.seatX, y: target.desk.y + WD.DESK_DEPTH + 14 }, 'scold', `к ${nameCase(target.name, 1)}`);
        say('boss', `${target.name}! Это что такое?!`, 2);
        playSound('suspect');
      }
    }

    // Подозрение
    const seen = mode === 'playing' && playerVisibleToBoss();
    boss.seesPlayer = seen;
    let rate = -CFG.suspicionDecay;
    const grace = boss.catchCooldown > 0 || (banner && banner.dur && shiftTime < banner.dur); // после выговора и пока читаешь баннер дня
    if (seen && !grace && boss.state !== 'lecture' && boss.state !== 'office') {
      if ((boss.state === 'inspect' || boss.state === 'waitDesk') && !playerIsWorking()) rate = CFG.suspicionInspect;
      else if (SLACK.has(player.action)) rate = CFG.suspicionSlack * diff().slack;
      if (rate > 0 && eventIs('noise')) rate *= 0.6; // за перфоратором шорохов не слышно
    }
    const before = boss.suspicion;
    boss.suspicion = clamp(boss.suspicion + rate * dt, 0, 100);
    if (before === 0 && boss.suspicion > 0) {
      hint('suspicion', `«?» над Д.Н.: он видит, что ты бездельничаешь в его конусе. Уйди из конуса, сядь в Excel, спрячься (H) или ${coarsePointer ? 'жми ⎇' : 'жми B'} — альт-таб.`);
      playSound('suspect'); if (rand() < 0.5) say('boss', pick(LINES.boss.suspicious), 1.6); }
    if (boss.suspicion >= 100 && boss.catchCooldown <= 0) caught();

    // Видит, что работаешь — работа к плану идёт вдвое быстрее, иногда хвалит
    const nearDesk = playerIsWorking() && boss.state !== 'office' && dist(boss, player) < 120 && lineOfSight(boss, player);
    if (playerIsWorking() && ((seen && dist(boss, player) < 170) || nearDesk)) {
      boss.watchingWork = true;
      if (boss.praiseTimer <= 0 && rand() < dt * 0.6) {
        say('boss', pick(LINES.boss.praise), 2.8);
        stats.praise++;
        boss.praiseTimer = 7;
        checkTodo();
      }
    } else boss.watchingWork = false;

    // Реплики на обходе
    if ((boss.state === 'patrol' || boss.state === 'look') && boss.quoteTimer <= 0) {
      const nearCw = coworkers.find(c => Math.hypot(c.x - boss.x, c.y - boss.y) < 80);
      say('boss', nearCw && !nearCw.away && rand() < 0.5 ? LINES.boss.coworker[nearCw.id] : pick(eventIs('heat') ? LINES.boss.heat : eventIs('noise') ? LINES.boss.noise : LINES.boss.patrol), 3.2);
      boss.quoteTimer = 8 + rand() * 7;
    }
  }

  // ---------- АВТОПИЛОТ ----------
  // Быкентий играет сам: зритель смотрит, читает реплики и угорает. WASD/стрелки — взять управление.
  const auto = { on: false, goal: null, path: [], stuckT: 0, stuckN: 0, last: null, workT: 0, phoneT: 0, restartTimer: null };
  const zoneCenter = id => { const z = WD.zones.find(q => q.id === id); return z ? { x: z.x + z.w / 2, y: z.y + z.h / 2 } : null; };
  function autoGoal(kind, pt, extra = {}) { auto.goal = { kind, pt, ...extra }; auto.path = findPath(player, pt); auto.stuckT = 0; auto.stuckN = 0; }
  function autoDangerRaw() { return boss.state === 'inspect' || boss.state === 'waitDesk' || boss.warned || (boss.seesPlayer && boss.suspicion > 35); }
  // Автопилот реагирует как человек: с задержкой 0.4–1.6 с и иногда прозёвывает начало тревоги
  function autoDanger() {
    const raw = autoDangerRaw();
    if (!raw) { auto.reactAt = null; return false; }
    if (auto.reactAt == null) auto.reactAt = shiftTime + 0.4 + rand() * 1.2 + (rand() < 0.2 ? 2 : 0);
    return shiftTime >= auto.reactAt;
  }
  function autoThink() {
    const z = id => zoneCenter(id);
    if (autoDanger()) {
      if (dist(player, SEAT) < 300 || boss.mode === 'desk') { autoGoal('desk', z('desk')); return; }
      const pl = WD.plants.slice().sort((a, b) => dist(a, player) - dist(b, player))[0];
      autoGoal('hide', { x: pl.x, y: pl.y + 12 }); return;
    }
    if (eventIs('drill') && player.action !== 'evac') { autoGoal('exit', z('exit')); return; }
    if (eventIs('standup')) { autoGoal('standup', z('standup')); return; }
    if (eventIs('majik') && !officeEvent.used) { autoGoal('desk', z('desk'), { work: 6 }); return; }
    if ((eventIs('food') || eventIs('bday')) && !officeEvent.used) { autoGoal('feast', { x: 120, y: 236 }); return; }
    if (day.beer) { autoGoal('exit', z('exit')); return; }
    if (clockMinutes >= CFG.lunchOpen && clockMinutes < CFG.lunchClose && !day.fed) { autoGoal('exit', z('exit')); return; }
    // План: отстаёшь от графика — иди работать; сделал — кайфуй
    if (!planDone() && usefulness < planTarget * dayProgress() + 12) { autoGoal('desk', z('desk'), { work: 9 + rand() * 5 }); return; }
    const opts = [
      ['desk', 3, () => autoGoal('desk', z('desk'), { work: 5 + rand() * 6 })],
      ['coffee', player.coffeeBoost > 0 ? 0 : 2, () => autoGoal('coffee', z('coffee'))],
      ['smoke', 2, () => autoGoal('smoke', { x: 870, y: 230 })],
      ['server', eventIs('internet') ? 0 : 1.5, () => autoGoal('server', { x: 870, y: 436 })],
      ['fridge', 1, () => autoGoal('fridge', z('fridge'))],
      ['water', 1, () => autoGoal('water', z('water'))],
      ['printer', 0.8, () => autoGoal('printer', { x: 470, y: 456 })],
      ['toilet', day.toiletCd > 0 ? 0 : 1, () => autoGoal('toilet', z('toilet'))],
      ['phone', 1, () => autoGoal('phone', { x: player.x, y: player.y })],
    ];
    const free = coworkers.filter(c => !c.away && !c.statist && c.cooldown <= 0);
    if (free.length) { const c = free[Math.floor(rand() * free.length)]; opts.push(['chat', 2.5, () => autoGoal('chat', zoneCenter(`chat_${c.id}`))]); }
    const sum = opts.reduce((a, o) => a + o[1], 0);
    let r = rand() * sum;
    for (const o of opts) { r -= o[1]; if (r <= 0) { o[2](); return; } }
    opts[0][2]();
  }
  function autoArrive() {
    const g = auto.goal;
    auto.goal = null;
    if (g.kind === 'phone') { togglePhone(); auto.phoneT = 4 + rand() * 4; return; }
    if (g.kind === 'hide') { quickHide(); return; }
    if (g.kind === 'desk') auto.workT = g.work || 6;
    if (g.kind === 'desk' && player.action === 'work') return;
    interact();
  }
  // Возвращает направление движения на кадр; действия запускает сам
  function autoSteer(dt) {
    if (choice && choice.asked && !choice.done && rand() < dt) answerStandup(Math.floor(rand() * 3));
    if (nudge && player.action === 'work' && rand() < dt * 0.5 && !autoDanger()) interact();
    const a = player.action;
    const danger = autoDanger();
    if (a === 'work') {
      auto.workT -= dt;
      if (auto.workT > 0 || danger || (eventIs('majik') && !officeEvent.used)) return [0, 0];
      player.y = SEAT.y; endAction('cancel');
    } else if (a === 'phone') {
      auto.phoneT -= dt;
      if (auto.phoneT > 0 && !danger) return [0, 0];
      togglePhone();
    } else if (HIDDEN.has(a) && !AWAY.has(a)) {
      if (danger || boss.suspicion > 0 || (boss.state !== 'gone' && dist(boss, player) < 180)) return [0, 0];
      interact(); return [0, 0];
    } else if (SLACK.has(a) && danger && bossKeyCd <= 0 && FAKE_TEXT[a]) {
      bossKey(); return [0, 0];
    } else if (SLACK.has(a) && danger && a !== 'chat') {
      endAction('cancel');
    } else if (a !== 'none') return [0, 0]; // идёт действие с таймером: кофе, перекур, очередь, обед…
    if (!auto.goal) autoThink();
    const g = auto.goal;
    if (!g) return [0, 0];
    if (danger && g.kind !== 'desk' && g.kind !== 'hide') { autoThink(); }
    const wp = auto.path[0] || g.pt;
    const d = dist(player, wp);
    if (d < 4) {
      if (auto.path.length) auto.path.shift();
      if (!auto.path.length && dist(player, g.pt) < 5) { autoArrive(); return [0, 0]; }
      return [0, 0];
    }
    // застрял — пересчитать путь, потом бросить цель
    if (auto.last && dist(auto.last, player) < 0.3) auto.stuckT += dt; else auto.stuckT = 0;
    auto.last = { x: player.x, y: player.y };
    if (auto.stuckT > 0.8) {
      auto.stuckT = 0; auto.stuckN++;
      if (auto.stuckN > 3) { auto.goal = null; return [0, 0]; }
      auto.path = findPath(player, g.pt);
    }
    return [(wp.x - player.x) / d, (wp.y - player.y) / d];
  }
  function startAutopilot() {
    stopAutopilot();
    playSound('click');
    enterFullscreen();
    auto.on = true; auto.goal = null; auto.path = []; // до resetGame: без утренней пробки
    resetGame();
    toast('🍿 АВТОПИЛОТ: смотри и угорай. WASD — взять управление.', 3.2);
  }
  function stopAutopilot(msg) {
    if (!auto.on) return;
    auto.on = false; auto.goal = null;
    clearTimeout(auto.restartTimer);
    if (msg) toast(msg, 2);
  }

  // ---------- ИГРОК ----------
  function updatePlayer(dt) {
    let dx = 0;
    let dy = 0;
    if (keys.has('arrowleft') || keys.has('a')) dx -= 1;
    if (keys.has('arrowright') || keys.has('d')) dx += 1;
    if (keys.has('arrowup') || keys.has('w')) dy -= 1;
    if (keys.has('arrowdown') || keys.has('s')) dy += 1;
    if (auto.on && (dx || dy)) stopAutopilot('Управление у тебя. Автопилот выключен.');
    if (auto.on) [dx, dy] = autoSteer(dt);

    if (player.coffeeBoost > 0) {
      player.coffeeBoost = Math.max(0, player.coffeeBoost - dt);
      player.speed = CFG.playerSpeed * (player.coffeeBoost > 0 ? CFG.coffeeBoost : 1);
    }
    player.bumpCooldown = Math.max(0, player.bumpCooldown - dt);

    player.moving = false;
    if (player.action === 'lunch' || player.action === 'evac') { dx = 0; dy = 0; } // ты на улице
    if (dx || dy) {
      if (player.action !== 'none' && player.action !== 'coffee' && player.action !== 'water' && player.action !== 'phone') {
        if (player.action === 'toilet') { player.x = WD.toiletDoor.x; player.y = WD.toiletDoor.y; day.cabinDoor = 0.6; }
        if (player.action === 'work') { player.y = SEAT.y; }
        if (player.action === 'plant_hide' && player.hideSpot) player.y = player.hideSpot.y + 14;
        endAction('cancel');
      }
      const len = Math.hypot(dx, dy);
      dx /= len; dy /= len;
      if (Math.abs(dx) > 0.05) player.facingX = dx < 0 ? -1 : 1;
      const hit = moveWithCollision(player, dx * player.speed * dt, dy * player.speed * dt, player.r);
      if (hit && player.bumpCooldown <= 0) { playSound('bump'); player.bumpCooldown = 0.35; }
      player.walkTimer += dt * (player.coffeeBoost > 0 ? 11 : 8);
      player.moving = true;
    }

    if (player.actionTimer > 0) {
      player.actionTimer -= dt;
      if (player.actionTimer <= 0) endAction('done');
    }

    const a = player.action;
    const funBefore = fun;
    if (a === 'queue') {
      const left = Math.max(1, Math.ceil(player.actionTimer / CFG.toiletPerPerson));
      if (left < day.queue) {
        // кто-то вышел из кабинки: хлопок двери, очередь сдвигается
        day.queue = left;
        day.qShift = 17;
        day.cabinDoor = 0.7;
        walkers.push({ x: WD.toiletDoor.x, y: WD.toiletDoor.y, t: 0, look: (day.queueTotal - left + 2) % QUEUE_LOOK.length });
        playSound('slam');
        player.queueTarget = queueSlot(day.queue);
      }
      // Быкентий сам подходит и продвигается в очереди
      const tgt = player.queueTarget;
      if (tgt) {
        const d = Math.hypot(tgt.x - player.x, tgt.y - player.y);
        if (d > 1) {
          const step = Math.min(d, CFG.playerSpeed * 0.8 * dt);
          player.x += (tgt.x - player.x) / d * step; player.y += (tgt.y - player.y) / d * step;
          player.facingX = tgt.x < player.x ? -1 : 1;
          player.moving = true; player.walkTimer += dt * 8;
        } else player.facingX = -1;
      }
      day.knock -= dt;
      if (day.knock <= 0) { say('queue', pick(LINES.toilet.knock), 2.2, '#e8f0ff'); playSound('knock'); day.knock = 3.5 + rand() * 3; }
    }
    if (a === 'work') {
      // Рутина в Excel выматывает и расходует кайф (если нет гитары)
      if (fun > 0) {
        fun = Math.max(0, fun - 0.4 * dt);
      }
      if (has('guitar')) addFun(0.8 * dt); // Гитара перебивает скуку: +0.4 кайфа/с чистого дохода
      const base = player.coffeeBoost > 0 ? CFG.workKpiCoffee : CFG.workKpi;
      const gear = (has('chair') ? 1.2 : 1) * (has('monitor') ? 1.15 : 1) * (eventIs('noise') && !has('headphones') ? 0.7 : 1);
      const mult = (boss.watchingWork ? CFG.watchedKpiMultiplier : 1) * (eventIs('internet') ? 1.5 : 1) * gear * diff().work;
      const beforeWork = usefulness;
      addWork(base * mult * dt);
      const gained = usefulness - beforeWork;
      day.excelWorkAcc = (day.excelWorkAcc || 0) + gained;

      // Закрытие микрозадач в Excel: каждые 14 очков работы +4 кайфа
      if (day.excelWorkAcc >= 14) {
        day.excelWorkAcc -= 14;
        addFun(4);
        day.excelPoolTasks = (day.excelPoolTasks || 0) + 1;
        const taskName = pick(LINES.excelTasks || ['Заявка закрыта']);
        floater(player.x, player.y - 64, '✔ ЗАЯВКА ЗАКРЫТА! +4 КАЙФ', '#e0a0f0');
        addLog(`Excel: «${taskName}». +4 кайфа.`, 'good');
        playSound('click');

        // Закрытый пул задач (каждые 3 закрытые заявки): бонус +10 кайфа!
        if (day.excelPoolTasks >= 3) {
          day.excelPoolTasks = 0;
          addFun(10);
          floater(player.x, player.y - 80, '⭐ ПУЛ ЗАЯВОК ЗАКРЫТ! +10 КАЙФ', '#ffe082');
          banner = { text: 'ПУЛ ЗАЯВОК ЗАКРЫТ!', sub: 'Пачка кредитных заявок обработана. +10 кайфа!', t: 0 };
          addLog('Excel: пул кредитных заявок закрыт! Отличная работа, +10 кайфа.', 'good');
          playSound('success');
        }
      }

      // Сверхзадача: если план выполнен и есть выговор — переработка снимает выговор!
      if (planDone() && (reprimands > 0 || weekReprimands > 0)) {
        day.overtimeWork = (day.overtimeWork || 0) + (base * mult * dt);
        if (day.overtimeWork >= 20) {
          day.overtimeWork = 0;
          if (reprimands > 0) reprimands--;
          if (weekReprimands > 0) { weekReprimands--; store.set('weekReprimands', weekReprimands); }
          stats.reprimands = reprimands;
          playSound('success');
          say('boss', 'Быкентий закрыл сверхурочный аудит! Ладно, старый выговор аннулирую. Но не расслабляться!', 3.5);
          floater(player.x, player.y - 70, '⭐ ВЫГОВОР АННУЛИРОВАН! (−1)', '#57d08a');
          banner = { text: 'ВЫГОВОР СНЯТ ✓', sub: 'Д.Н. оценил сверхурочный труд и аннулировал взыскание!', t: 0 };
          addLog('Сверхурочная работа: Д.Н. аннулировал выговор Быкентию!', 'good');
        }
      }

      stats.workedSeconds += dt;
      kpiTick -= dt;
      if (boss.watchingWork && kpiTick <= 0) { floater(player.x + (rand() - 0.5) * 20, player.y - 58, planDone() ? 'ПРИКРЫТИЕ' : `+ПЛАН ×${CFG.watchedKpiMultiplier}`, '#57d08a'); playSound('kpi'); kpiTick = 0.5; }
    }
    if (a === 'smoke') {
      fun += (day.smog ? 2.4 : 4) * dt;
      if (rand() < 0.5) particles.push({ x: player.x + 10 * player.facingX, y: player.y - 40, vx: 12 + rand() * 10, vy: -8 - rand() * 8, size: 2 + rand() * 2, life: 1.5, maxLife: 1.5, color: 'rgba(230,230,230,0.6)' });
    } else if (a === 'youtube') { fun += 5 * dt; }
    else if (a === 'fridge') fun += 3 * dt;
    else if (a === 'phone') fun += 1.2 * dt;
    else if (a === 'meme') fun += 3 * dt;
    else if (a === 'toilet') fun += 2 * dt;
    else if (a === 'chat') {
      fun += 3 * dt;
      const c = coworkerById(player.chatWith);
      if (c && player.actionTimer < 3.4 && !player.chatReplied) { say(c.id, player.chatPair[1], 3.2); player.chatReplied = true; }
      if (player.actionTimer > 3.4) player.chatReplied = false;
    }
    if (fun > funBefore) {
      const k = (today().funMul || 1) * (eventIs('heat') && !has('fan') ? 0.7 : 1) * (day.hungry ? 0.8 : 1);
      fun = funBefore + (fun - funBefore) * k;
    }
    fun = Math.min(100, Math.max(0, fun));
  }

  // Перепалки соседей: реплика и ответ через пару секунд (по игровому времени — пауза их тоже останавливает)
  let banterT = 15;
  const pendingSays = [];
  function updateBanter(dt) {
    for (let i = pendingSays.length - 1; i >= 0; i--) {
      const p = pendingSays[i];
      p.t -= dt;
      if (p.t > 0) continue;
      pendingSays.splice(i, 1);
      const c = coworkerById(p.owner);
      if (c && !c.away) say(p.owner, p.text, 3, '#eef6f4');
    }
    banterT -= dt;
    if (banterT > 0) return;
    banterT = 14 + rand() * 16;
    const here = id => { const c = coworkerById(id); return c && !c.away && !c.remote; };
    const opts = LINES.banter.filter(([a, , b]) => here(a) && here(b));
    if (!opts.length) return;
    const [a, la, b, lb] = pick(opts);
    say(a, la, 3, '#eef6f4');
    pendingSays.push({ owner: b, text: lb, t: 1.2 + rand() * 0.8 });
  }

  function updateCoworkers(dt) {
    updateBanter(dt);
    for (const c of coworkers) {
      if (c.remote) { c.away = true; c.slack = null; continue; }
      if (c.ghost) { // дух офиса: пуск ракеты раз в смену, Д.Н. чувствует только сквозняк
        c.draftCd = Math.max(0, c.draftCd - dt);
        if (dist(boss, c) < 70 && !c.draftCd && !bubbles.some(b => b.owner === 'boss') && rand() < 0.5) { say('boss', pick(LINES.tigranDraft), 2.4); c.draftCd = 40; }
        else if (dist(boss, c) < 70 && !c.draftCd) c.draftCd = 40;
        if (c.rocketAt && clockMinutes >= c.rocketAt) {
          c.rocketAt = 0;
          floater(c.desk.x + 66, c.desk.y - 20, '🚀', '#fff');
          puff(c.desk.x + 66, c.desk.y - 6, 'rgba(235,235,235,0.8)', 8, 12);
          say(c.id, 'Пуск! Ключ на старт!', 2.6, '#eef6f4');
          if (dist(player, c) < 150) { fun += 3; floater(player.x, player.y - 64, '+3 КАЙФА · ПУСК!', '#9fd0ff'); }
        }
      }
      c.cooldown = Math.max(0, c.cooldown - dt);
      c.talkTimer = Math.max(0, c.talkTimer - dt);
      c.idleTimer -= dt;
      c.alert = Math.max(0, c.alert - dt);
      c.scoldCooldown = Math.max(0, c.scoldCooldown - dt);
      if (c.away) { c.slack = null; continue; }
      if (Math.hypot(boss.x - c.x, boss.y - c.y) < 90) c.alert = 1;
      if (c.idleTimer <= 0) {
        const line = rand() < 0.3 ? pick(LINES.whine) : pick(LINES.coworkerIdle[c.id]);
        if (!c.talkTimer && !bubbles.some(b => b.owner === c.id) && rand() < 0.6) say(c.id, line, 2.6, '#eef6f4');
        c.idleTimer = (c.extra ? 9 : 12) + rand() * 14;
        // иногда сосед подхватывает почти одновременно — офис говорит вразнобой, а не по очереди
        if (rand() < 0.3) { const o = pick(coworkers.filter(x => x !== c && !x.away)); if (o) o.idleTimer = Math.min(o.idleTimer, 0.3 + rand() * 1.2); }
      }
      // Второй ряд: то работают, то отвлекаются (телефон, сон, танчики, чипсы)
      if (c.extra && !c.ghost && (!c.statist || unlocked('row2'))) {
        c.slackTimer -= dt;
        if (c.alert && c.slack && !(boss.state === 'scold' && boss.scoldTarget === c.id)) { c.slack = null; c.slackTimer = 6 + rand() * 6; }
        if (c.slackTimer <= 0) {
          if (c.slack) { c.slack = null; c.slackTimer = 10 + rand() * 12; }
          else if (!c.alert && !c.talkTimer) {
            const kinds = Object.keys(LINES.slack[c.id]);
            c.slack = kinds[Math.floor(rand() * kinds.length)];
            c.slackTimer = 9 + rand() * 7;
            if (!bubbles.some(b => b.owner === c.id)) say(c.id, pick(LINES.slack[c.id][c.slack]), 2.6, '#f4ecff');
          } else c.slackTimer = 3;
        }
      }
    }
  }

  function updateAmbient(dt) {
    if (rand() < dt * 5) particles.push({ x: 116 + (rand() - 0.5) * 4, y: WD.FLOOR_TOP - 22, vx: (rand() - 0.5) * 3, vy: -8 - rand() * 5, size: 1.5 + rand(), life: 1, maxLife: 1, color: 'rgba(255,255,255,0.45)' });
    if (rand() < dt * 3) particles.push({ x: 826 + (rand() - 0.5) * 4, y: 148, vx: 8 + rand() * 8, vy: -6 - rand() * 5, size: 1.5 + rand() * 1.5, life: 1.6, maxLife: 1.6, color: 'rgba(220,220,220,0.4)' });
    if (boss.state === 'office' && rand() < dt * 3) particles.push({ x: 721, y: 462, vx: (rand() - 0.5) * 2, vy: -6, size: 1.2, life: 1, maxLife: 1, color: 'rgba(255,255,255,0.5)' });
  }

  function update(dt) {
    shiftTime += dt;
    clockMinutes = CFG.shiftStart + (shiftTime / CFG.shiftSeconds) * (CFG.shiftEnd - CFG.shiftStart);
    intelTimer = Math.max(0, intelTimer - dt);
    // 17:00: если план отстаёт — одна подсказка, сколько осталось (дедлайн предсказуемый, а не внезапный)
    if (mode === 'playing' && !day.planWarned && clockMinutes >= 17 * 60) {
      day.planWarned = true;
      if (!planDone()) {
        const left = Math.ceil(planTarget - usefulness);
        const hrs = ((CFG.shiftEnd - clockMinutes) / 60).toFixed(1).replace('.', ',');
        toast(`💡 До плана ${left}, до 19:30 ~${hrs} ч. Посиди в Excel, особенно когда Д.Н. рядом.`, 3.6);
        addLog(`17:00 — до плана ещё ${left}. Не сделаешь к 19:30 — выговор.`, 'bad');
      }
    }

    updatePlayer(dt);
    updateBoss(dt);
    updateCoworkers(dt);
    updateAmbient(dt);
    updateEvents(dt);
    updateMusic(dt);
    updateTutorial(dt);

    // Сердцебиение: начальник близко, а ты прокрастинируешь
    const d = dist(boss, player);
    const risky = (SLACK.has(player.action) || (boss.state === 'inspect' && !playerIsWorking() && !HIDDEN.has(player.action))) && boss.state !== 'office';
    const target = risky && d < 200 ? clamp(1 - (d - 50) / 150, 0, 1) : 0;
    danger += (target - danger) * Math.min(1, dt * 4);
    if (danger > 0.5) hint('danger', 'Красные края и пульс: Д.Н. совсем рядом, а ты бездельничаешь. Беги в Excel или прячься!');
    if (clockMinutes >= 17 * 60 && usefulness < planTarget) hint('planLate', `До плана не хватает ${Math.ceil(planTarget - usefulness)}, а уже 17:00! Не сделаешь к 19:30 — выговор. Посиди в Excel, лучше на глазах у Д.Н.`);
    if (danger > 0.15) {
      heartbeat -= dt;
      if (heartbeat <= 0) { playSound('thump'); heartbeat = 0.9 - danger * 0.5; }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
    floaters.forEach(f => { f.t += dt; });
    floaters = floaters.filter(f => f.t < 1.4);
    bubbles.forEach(b => { b.t += dt; });
    bubbles = bubbles.filter(b => b.t < b.dur);

    if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) ui.toast.classList.remove('show'); }
    shake = Math.max(0, shake - dt);
    phoneAnim = clamp(phoneAnim + (player.action === 'phone' ? dt : -dt) * 6, 0, 1);
    phoneBuzz = Math.max(0, phoneBuzz - dt * 0.2);
    flash = Math.max(0, flash - dt);

    if (Math.floor(shiftTime * 2) !== Math.floor((shiftTime - dt) * 2)) { checkTodo(); checkAchievements(); }
    const dMax = diff().dayReprimandsMax || 3;
    const wMax = diff().weekReprimandsMax || 5;
    if (clockMinutes >= CFG.shiftEnd) finishGame('win');
    else if (reprimands >= dMax || weekReprimands >= wMax) finishGame('fired');
  }

  function gradeFor(score) {
    if (score >= 160) return ['S', 'Легенда опенспейса'];
    if (score >= 120) return ['A', 'Мастер имитации'];
    if (score >= 85) return ['B', 'Крепкий середнячок'];
    if (score >= 50) return ['C', 'Зелёный стажёр'];
    return ['D', 'Слишком честный'];
  }

  function goMunichBeer() {
    playSound('clink');
    addFun(25);
    addLog('🍺 Быкентий ушёл в «Мюнхен» на пиво. Неделя закрыта!', 'good');
    finishGame('munich');
  }

  function finishGame(result) {
    if (mode !== 'playing') return;
    // Конец смены: план не сделан — это выговор (третий = увольнение)
    let planFailed = false;
    const dMax = diff().dayReprimandsMax || 3;
    const wMax = diff().weekReprimandsMax || 5;
    if (result === 'win' && !planDone()) {
      planFailed = true;
      reprimands++; stats.reprimands = reprimands;
      weekReprimands++; store.set('weekReprimands', weekReprimands);
      addLog(`📝 ВЫГОВОР ${reprimands}/${dMax} (нед: ${weekReprimands}/${wMax}): план не выполнен (${Math.floor(usefulness)}/${planTarget}).`, 'bad');
      if (reprimands >= dMax || weekReprimands >= wMax) result = 'fired';
    }
    clearSavedProgress();
    setMode('ended');
    const win = result === 'win' || result === 'munich';
    ui.endCard.classList.toggle('good', win);
    ui.endCard.classList.toggle('bad', !win);
    const done = todo.filter(t => t.done).length;
    const score = Math.max(0, Math.round(Math.min(100, Math.max(0, fun)) + (planDone() ? 20 : 0) + done * 12 - reprimands * 15));
    const [grade, title] = gradeFor(score);
    ui.endTitle.textContent = win ? (planFailed ? 'ВЫЖИЛ, НО БЕЗ ПЛАНА' : 'ТЫ ВЫЖИЛ!') : 'ТЕБЯ УВОЛИЛИ!';
    if (win) {
      ui.endCopy.textContent = planFailed
        ? `Дожил до 19:30, но план не сделан (${Math.floor(usefulness)}/${planTarget}) — выговор. «Кайфовать надо после работы, Быкентий!»`
        : (reprimands === 0
          ? '«Отличная работа, вы — опора отдела!» План сделан, ни одного выговора. За окном горит Кок-Тобе.'
          : 'План сделан, до 19:30 дожил. Огни Алматы, пробки на Аль-Фараби и пара выговоров на память.');
    } else {
      ui.endCopy.textContent = planFailed
        ? `Выговор за невыполненный план (${reprimands}/${dMax}, нед: ${weekReprimands}/${wMax}). «Бездельники нам не нужны!» Пропуск заблокирован.`
        : (weekReprimands >= wMax
          ? `Превышен недельный лимит выговоров (${weekReprimands}/${wMax})! Правление банка расторгло трудовой договор.`
          : `Превышен дневной лимит выговоров (${reprimands}/${dMax})! Начальник сверил записи камер и объяснительные. Пропуск заблокирован.`);
    }
    const bestKey = `best.${dayIndex}`;
    const best = store.get(bestKey, 0);
    const record = win && score > best;
    if (record) store.set(bestKey, score);
    const dayName = today().name;
    const earned = Math.max(1, Math.round(score / 10));
    coins += earned;
    store.set('coins', coins);
    if (win && dayName === 'ПЯТНИЦА') { store.set('weekDone', true); weekReprimands = 0; store.set('weekReprimands', 0); }
    if (win) { dayIndex = dayIndex < DAYS.length - 1 ? dayIndex + 1 : 0; store.set('day', dayIndex); }
    ui.grade.innerHTML = win ? `<b>${grade}</b><span>${title} · ${score} очков${record ? ' · НОВЫЙ РЕКОРД!' : ` · рекорд ${Math.max(best, score)}`}</span>` : '';
    ui.endKicker.textContent = win ? `${dayName} ПЕРЕЖИТ · 19:30` : `${dayName} · ВЫГОВОРЫ (${reprimands}/${dMax}, нед: ${weekReprimands}/${wMax})`;
    if (win && dayName === 'ПЯТНИЦА') {
      let arc = 'Маджикистан так и мигает — как всегда.';
      if (majikArc >= 2) { arc = 'Маджикистан ЗАПУСТИЛСЯ! Правление в шоке, тебе премия +10 ₭.'; coins += 10; store.set('coins', coins); }
      else if (majikArc < 0) arc = 'Маджикистан упал окончательно. Проект передали Сиргею — вместе с автошкой.';
      ui.endCopy.textContent = `Неделя пережита! ${arc} Ты врубаешь рок в наушниках и уходишь в закат над Алатау.`;
    }
    if (result === 'munich') {
      ui.endTitle.textContent = 'ПИВО В «МЮНХЕНЕ»!';
      ui.endKicker.textContent = `${dayName} · ${timeString(clockMinutes)} · РАННИЙ УХОД`;
      ui.endCopy.textContent = 'Бизнес-ланч тут хрючево, но пятничное пиво — святое. Аймашын травит байки, Хлад снял наушники, Блеб одобрил вторую кружку. +25 кайфа.';
    }
    checkAchievements({ win, result, dayName });
    if (ui.endCoins) ui.endCoins.textContent = `+${earned} KPI-коинов · всего ${coins} ₭ — трать в «Апгрейдах» · 🏆 ${achCount()}/${ACHIEVEMENTS.length}`;
    ui.restart.innerHTML = win ? `${dayIndex === 0 ? 'НОВАЯ НЕДЕЛЯ' : DAYS[dayIndex].name} <span>↵</span>` : 'ПЕРЕИГРАТЬ ДЕНЬ <span>↵</span>';
    ui.grade.classList.toggle('hidden', !win);
    ui.endStats.innerHTML = [
      [`${Math.floor(usefulness)}/${planTarget}`, planDone() ? 'план ✓' : 'план ✗'],
      [Math.round(fun), 'кайфа'],
      [`${reprimands}/${dMax} (нед: ${weekReprimands}/${wMax})`, 'выговоров'],
      [`${done}/${todo.length}`, 'дел из списка'],
      [stats.chats, 'разговоров'],
      [stats.praise, 'похвал Д.Н.'],
    ].map(s => `<div class="end-stat"><b>${s[0]}</b><span>${s[1]}</span></div>`).join('');
    playSound(win ? 'success' : 'caught');
    if (auto.on) { const keep = true; clearTimeout(auto.restartTimer); auto.restartTimer = setTimeout(() => { if (keep && mode === 'ended') startAutopilot(); }, 7000); }
    addLog(win ? '19:30 — смена окончена. Свобода!' : 'Трудовой договор расторгнут.', win ? 'good' : 'bad');
    // Недельный лимит исчерпан: переигровка дня увольняла бы сразу — неделя начинается заново
    if (!win && weekReprimands >= wMax) {
      weekReprimands = 0; store.set('weekReprimands', 0);
      dayIndex = 0; store.set('day', 0);
      addLog('Новая неделя: с понедельника с чистого листа.', 'info');
    }
  }

  // ---------- РЕНДЕР ----------
  function R(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
  function E(x, y, rx, ry, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill(); }
  function T(text, x, y, size, color, align = 'center', weight = 700, font = FONT) {
    ctx.font = `${weight} ${size}px ${font}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }
  // Текст, ужатый по ширине, чтобы не наезжал на соседние элементы HUD
  function TF(text, x, y, size, maxW, color, align = 'left', weight = 700) {
    ctx.font = `${weight} ${size}px ${FONT_SANS}`;
    const w = ctx.measureText(text).width;
    T(text, x, y, w > maxW ? size * maxW / w : size, color, align, weight, FONT_SANS);
  }
  // Текст с многоточием: не сжимает кегль, а обрезает хвост
  function TE(text, x, y, size, maxW, color, align = 'left', weight = 700) {
    ctx.font = `${weight} ${size}px ${FONT_SANS}`;
    let t = text;
    if (ctx.measureText(t).width > maxW) {
      while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
      t = `${t.trimEnd()}…`;
    }
    T(t, x, y, size, color, align, weight, FONT_SANS);
  }

  // ---------- МАСШТАБ ИНТЕРФЕЙСА ----------
  // Мир рисуется в 960×540 и масштабируется целиком, поэтому на ноутбуке и телефоне надписи выходили 5–7 px.
  // UI — множитель для всего текста поверх мира: основной кегль (8.5 ед.) даёт не меньше 12 px
  // (13 px на сенсорных экранах, +15% в режиме «Крупный текст»). Экранные элементы рисуются в UI-единицах
  // (ширина VW = W / k), подписи над персонажами масштабируются вокруг своей точки привязки.
  let UI = 1, unitPx = 1, bigText = !!store.get('bigText', false);
  const coarsePointer = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  function canvasBox() { // где игра реально нарисована внутри <canvas> (object-fit: contain)
    const r = canvas.getBoundingClientRect();
    const k = Math.min(r.width / W, r.height / H) || 1;
    const w = W * k, h = H * k;
    return { left: r.left + (r.width - w) / 2, top: r.top + (r.height - h) / 2, width: w, height: h, k };
  }
  function updateUiScale() {
    const b = canvasBox();
    if (b.height > 0) unitPx = b.k;
    const target = (coarsePointer ? 13 : 12) * (bigText ? 1.15 : 1);
    UI = Math.max(1, Math.min(2.4, target / (8.5 * unitPx)));
    document.documentElement.classList.toggle('text-lg', bigText);
  }
  const uiK = cap => Math.min(UI, cap);
  const compactHud = () => UI > 1.05;
  const hudScale = () => uiK(2.1);
  const hudBottom = () => (compactHud() ? Math.max(WD.HUD_H, HUDC_H * hudScale()) : WD.HUD_H);
  function uiSpace(k) { ctx.setTransform(S * k, 0, 0, S * k, 0, 0); return { VW: W / k, VH: H / k }; }
  // Нарисовать fn в локальных координатах, увеличенных в k раз вокруг точки (ax, ay)
  function around(ax, ay, k, fn) { ctx.save(); ctx.translate(ax, ay); ctx.scale(k, k); fn(); ctx.restore(); }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function dayProgress() { return clamp((clockMinutes - CFG.shiftStart) / (CFG.shiftEnd - CFG.shiftStart), 0, 1); }

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

  function drawBoss() {
    if (boss.state === 'gone' || boss.state === 'out') return;
    const inOffice = boss.state === 'office';
    if (!inOffice) drawShadow(boss.x, boss.y, 16, 5, 0.38);
    if (!ready(img.boss)) return;
    if (inOffice) {
      drawStripFrame(img.boss, 4, 0, boss.x, boss.y + 30, true);
      return;
    }
    const frame = boss.moving ? Math.floor(boss.walkTimer) % 4 : 0;
    const flip = Math.cos(boss.facing) < 0 ? true : false;
    drawStripFrame(img.boss, 4, frame, boss.x, boss.y + 2, flip);
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
      fake: [player.fakeLabel || 'ДЕЛАЕТ ВИД', '#2f9a5a'], meme: ['СМОТРИТ МЕМ БЛЕБА', '#c9861e'],
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

  function bar(x, y, w, label, value, color, valueColor, shown) {
    T(label, x, y, 8.5, '#f5edd9', 'left', 700, FONT_SANS);
    const isFun = label === 'КАЙФ';
    const text = isFun && value >= 100 ? '100 MAX' : `${Math.round(shown === undefined ? value : shown)}${isFun ? '' : '%'}`;
    T(text, x + w, y, 8.5, isFun && value >= 100 ? '#ffe082' : (valueColor || color), 'right', 700);
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
    const dMax = diff().dayReprimandsMax || 3;
    const wMax = diff().weekReprimandsMax || 5;
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
    if (intelTimer > 0 && boss.state !== 'inspect') info.push(`📅 проверка через ${Math.max(0, Math.ceil(nextBossCheck))} с`);
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
    const dMax = diff().dayReprimandsMax || 3;
    const wMax = diff().weekReprimandsMax || 5;
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

  function perkLines() {
    const out = [];
    const doneN = todo.filter(t => t.done).length;
    out.push(['📋', planDone() ? `План ${Math.floor(usefulness)}/${planTarget} ✓ — дальше работа почти не нужна` : `План ${Math.floor(usefulness)}/${planTarget} к 19:30 (не сделаешь — выговор)`, planDone() ? '#9fe0b0' : '#f2bb38']);
    const dMax = diff().dayReprimandsMax || 3, wMax = diff().weekReprimandsMax || 5;
    out.push(['⚠️', `Выговоры: ${reprimands}/${dMax} за день · ${weekReprimands}/${wMax} за неделю`, (reprimands >= dMax - 1 || weekReprimands >= wMax - 1) ? '#ff9a8a' : '#f2bb38']);
    out.push(['⭐', `Очки сейчас: ${Math.max(0, Math.round(fun + (planDone() ? 20 : 0) + doneN * 12 - reprimands * 15))} (кайф + план + дела − выговоры)`, '#e0a0f0']);
    if (coverTokens) out.push(['🛡', 'Прикрытие: Аймашын отмажет от следующего выговора', '#9fe0b0']);
    if (intelTimer > 0) out.push(['📅', `Инсайд Хлада: проверка через ${Math.max(0, Math.ceil(nextBossCheck))} с`, '#f2bb38']);
    if (player.coffeeBoost > 0) out.push(['☕', `Кофеин: ещё ${Math.ceil(player.coffeeBoost)} с`, '#e8b070']);
    out.push(['🏔', `Маджикистан на этой неделе: ${majikArc > 0 ? '+' : ''}${majikArc} (цель — +2 к пятнице)`, majikArc >= 0 ? '#9fe0b0' : '#ff9a8a']);
    if (bossKeyCd > 0) out.push(['⎇', `Альт-таб (${coarsePointer ? '⎇' : 'B'}) перезарядка: ${Math.ceil(bossKeyCd)} с`, '#9ab']);
    if (phoneSafe > 0) out.push(['📱', `Приём Сиргея: ещё ${Math.ceil(phoneSafe)} с телефон не палево`, '#9fe0b0']);
    if (day.hungry) out.push(['🍽', 'Голоден: кайф −20%. Обед был 13:00–14:30', '#ff9a8a']);
    else if (!day.fed && clockMinutes < CFG.lunchClose) out.push(['🍽', 'Обед 13:00–14:30 в «Мюнхене» (выход слева)', '#9ab']);
    const cds = coworkers.filter(c => c.cooldown > 0).map(c => `${c.name} ${Math.ceil(c.cooldown)}с`);
    if (cds.length) out.push(['⏳', `Заняты: ${cds.join(', ')}`, '#9ab']);
    if (!out.length) out.push(['💬', 'Поболтай с коллегами — у каждого свой бонус', '#9ab']);
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

  // Обучение: подсказки со стрелкой на первых минутах, пока игрок не освоится
  const TUTORIAL = [
    { text: 'Подойди к своему столу сзади и нажми E — это Excel', target: () => ({ x: SEAT.x, y: SEAT.y - 58 }), done: () => player.action === 'work' },
    { text: coarsePointer ? '📱 — телефон: там список дел, бонусы и чат' : 'Tab / Q — телефон: там список дел, бонусы и чат', target: null, done: () => player.action === 'phone' },
    { text: 'Поболтай с коллегой: встань перед его столом и жми E', target: () => ({ x: coworkers[1].x, y: coworkers[1].desk.y - 60 }), done: () => player.action === 'chat' || stats.chats > 0 },
    { text: 'Жёлтый конус — взгляд Д.Н. Прокрастинируешь в нём — растёт «?»', target: () => ({ x: boss.x, y: boss.y - 84 }), done: () => tutorial.t > 7 },
  ];
  function updateTutorial(dt) {
    if (tutorial.step >= TUTORIAL.length) return;
    tutorial.t += dt;
    const cur = TUTORIAL[tutorial.step];
    if (tutorial.step === 3 && (boss.state === 'office' || boss.state === 'gone')) { tutorial.t = 0; return; }
    if (cur.done()) {
      tutorial.step++;
      tutorial.t = 0;
      if (tutorial.step >= TUTORIAL.length) store.set('tutorialDone', true);
    }
  }
  function drawTutorial() {
    if (mode !== 'playing' || tutorial.step >= TUTORIAL.length) return;
    const cur = TUTORIAL[tutorial.step];
    if (tutorial.step === 3 && boss.state === 'office') return;
    const bounce = Math.sin(performance.now() / 180) * 3;
    if (cur.target) {
      const p = cur.target();
      ctx.fillStyle = '#f2bb38';
      ctx.beginPath(); ctx.moveTo(p.x - 6, p.y - 10 + bounce); ctx.lineTo(p.x + 6, p.y - 10 + bounce); ctx.lineTo(p.x, p.y + bounce); ctx.fill();
      ctx.strokeStyle = '#172027'; ctx.lineWidth = 1; ctx.stroke();
    }
    const k = uiK(1.55);
    const { VW, VH } = uiSpace(k);
    const lines = wrap(`💡 ${cur.text}`, coarsePointer ? VW * 0.55 : VW - 60, 10);
    ctx.font = `700 10px ${FONT_SANS}`;
    const w = Math.max(...lines.map(l => ctx.measureText(l).width)) + 22;
    const h = 7 + lines.length * 12;
    const y = Math.min(promptTop / k, VH - 24) - 4 - h;
    ctx.fillStyle = 'rgba(242,187,56,0.95)'; roundRect(VW / 2 - w / 2, y, w, h, 4); ctx.fill();
    lines.forEach((l, i) => T(l, VW / 2, y + 9.9 + i * 12, 10, '#172027', 'center', 700, FONT_SANS));
    ctx.setTransform(S, 0, 0, S, 0, 0);
  }

  // Выбор ответа на летучке: 1 / 2 / 3 или тап
  const choiceRects = [];
  function drawChoice() {
    choiceRects.length = 0;
    if (!choice || !choice.asked || choice.done || player.action !== 'standup' || mode !== 'playing') return;
    const k = uiK(1.65);
    choiceK = k;
    const { VW, VH } = uiSpace(k);
    const w = 420, h = 74, x = VW / 2 - w / 2, y = Math.min(VH - 150, VH - h - 40);
    ctx.fillStyle = 'rgba(8,16,20,0.94)'; roundRect(x, y, w, h, 4); ctx.fill();
    ctx.strokeStyle = '#f2bb38'; ctx.lineWidth = 1; ctx.stroke();
    T('Д.Н.: «Что по твоему направлению?» — выбери ответ', W / 2, y + 10, 9, '#f2bb38', 'center', 700, FONT_SANS);
    STANDUP_CHOICES.forEach((c, i) => {
      const bx = x + 10 + i * 134, by = y + 22, bw = 126, bh = 44;
      choiceRects.push({ x: bx, y: by, w: bw, h: bh, i });
      ctx.fillStyle = '#16303a'; roundRect(bx, by, bw, bh, 3); ctx.fill();
      T(c.key, bx + 12, by + bh / 2, 14, '#f2bb38', 'center', 900);
      const lines = wrap(c.text, bw - 30, 8.5);
      lines.forEach((l, n) => T(l, bx + 24, by + bh / 2 - (lines.length - 1) * 5 + n * 10, 8.5, '#fff', 'left', 700, FONT_SANS));
    });
    ctx.setTransform(S, 0, 0, S, 0, 0);
  }
  let choiceK = 1;
  canvas.addEventListener('pointerdown', e => {
    if (!choiceRects.length) return;
    const r = canvasBox();
    const gx = (e.clientX - r.left) / r.width * W / choiceK, gy = (e.clientY - r.top) / r.height * H / choiceK;
    const hit = choiceRects.find(c => gx >= c.x && gx <= c.x + c.w && gy >= c.y && gy <= c.y + c.h);
    if (hit) { e.preventDefault(); answerStandup(hit.i); }
  });
  function drawAutoBadge() {
    screenRects.auto = null;
    if (!auto.on || mode !== 'playing') return;
    const blink = Math.floor(performance.now() / 700) % 2 === 0;
    const text = `🍿 АВТОПИЛОТ ×${+timeScale.toFixed(2)} · ${auto.goal ? AUTO_LABELS[auto.goal.kind] || '' : 'думает…'} · WASD — взять управление`;
    const k = uiK(1.6);
    const { VW, VH } = uiSpace(k);
    ctx.font = `700 8.5px ${FONT_SANS}`;
    const w = Math.min(ctx.measureText(text).width + 14, VW * 0.55);
    const y = compactHud() ? hudBottom() / k + 4 : VH - 20;
    ctx.fillStyle = 'rgba(8,16,20,0.88)'; roundRect(6, y, w, 15, 3); ctx.fill();
    screenRects.auto = { x: 6 * k, y: y * k, w: w * k, h: 15 * k };
    R(6, y, 3, 15, blink ? '#f2bb38' : '#c76ad8');
    TE(text, 13, y + 7.8, 8.5, w - 12, '#f5edd9');
    ctx.setTransform(S, 0, 0, S, 0, 0);
  }
  const AUTO_LABELS = { desk: 'идёт работать', coffee: 'за кофе', smoke: 'на перекур', server: 'в серверную', fridge: 'к холодильнику', water: 'к кулеру', printer: 'печатать мем', toilet: 'в биотуалет', phone: 'залипает в телефон', chat: 'болтать', hide: 'прячется!', exit: 'к выходу', standup: 'на летучку', feast: 'за едой' };
  function drawObjective() {
    screenRects.obj = null;
    if (mode !== 'playing' || player.action === 'phone') return;
    if (compactHud() && banner) return; // на маленьком экране не спорим с баннером дня
    const next = todo.find(t => !t.done);
    const done = todo.filter(t => t.done).length;
    const text = next ? `📋 ${next.text}${next.goal > 1 ? ` ${Math.min(next.goal, todoProgress(next))}/${next.goal}` : ''}  ·  ${done}/${todo.length}` : `📋 Все дела сделаны! ${done}/${todo.length}`;
    const k = uiK(1.6);
    const { VW, VH } = uiSpace(k);
    const buzz = phoneBuzz > 0 && Math.floor(performance.now() / 200) % 2 === 0;
    const tab = buzz ? '📱 Tab ●' : '📱 Tab';
    ctx.font = `700 8.5px ${FONT_SANS}`;
    const tabW = coarsePointer ? 0 : ctx.measureText(tab).width + 8;
    const w = Math.min(ctx.measureText(text).width + 14 + tabW, VW * 0.5);
    const x = VW - w - 6;
    const y = compactHud() ? hudBottom() / k + 4 : VH - 20;
    ctx.fillStyle = 'rgba(8,16,20,0.85)'; roundRect(x, y, w, 15, 3); ctx.fill();
    screenRects.obj = { x: x * k, y: y * k, w: w * k, h: 15 * k };
    TE(text, x + 6, y + 7.8, 8.5, w - 12 - tabW, '#e8f2ee');
    if (tabW) T(tab, x + w - 6, y + 7.8, 8.5, buzz ? '#f2bb38' : '#9ab', 'right', 700, FONT_SANS);
    else if (buzz) T('●', x + w - 4, y + 3, 7, '#f2bb38');
    ctx.setTransform(S, 0, 0, S, 0, 0);
  }

  function draw() {
    ctx.setTransform(S, 0, 0, S, 0, 0);
    ctx.imageSmoothingEnabled = false;
    if (shake > 0) ctx.translate((rand() - 0.5) * shake * 8, (rand() - 0.5) * shake * 8);
    R(0, 0, W, H, '#10181b');
    drawWindows();
    ctx.drawImage(art.staticLayer, 0, 0, W, H);
    ctx.drawImage(art.windowOverlay, 0, 0, W, WD.FLOOR_TOP);
    drawWallClock(385, 72);
    drawSunbeams();
    drawZoneHints();
    drawVisionCone();
    drawCameras();
    drawScene();
    drawParticles();
    drawLighting();
    drawCameraBodies();
    drawDanger();
    drawOverheads();
    drawBubbles();
    ctx.setTransform(S, 0, 0, S, 0, 0);
    drawHUD();
    drawTutorial();
    drawObjective();
    drawAutoBadge();
    drawChoice();
    drawPhone();
    drawBanner();
    if (flash > 0) R(0, 0, W, H, `rgba(224,68,62,${flash * 0.35})`);
  }

  function loop(t) {
    const dt = Math.min(0.05, (t - last) / 1000 || 0);
    last = t;
    if (mode === 'playing') {
      // Скорость времени: подшаги, чтобы коллизии не «проскакивали» при ×2–×3
      const total = dt * timeScale;
      const n = Math.max(1, Math.ceil(timeScale));
      for (let i = 0; i < n && mode === 'playing'; i++) update(total / n);
    }
    else if (mode === 'menu') { updateBoss(dt); updateCoworkers(dt); updateAmbient(dt); bubbles.forEach(b => { b.t += dt; }); bubbles = bubbles.filter(b => b.t < b.dur); }
    draw();
    requestAnimationFrame(loop);
  }

  // ---------- ОБРАБОТЧИКИ ----------
  const MOVE_KEYS = ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'];
  window.addEventListener('keydown', e => {
    const key = getControlKey(e);
    if (MOVE_KEYS.includes(key) || ['e', 'h', 'p', 'q', 'b', 'enter', ' '].includes(key)) e.preventDefault();
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
    if (key === 'enter') {
      if (mode === 'menu' || mode === 'ended') { startGame(); return; }
      if (mode === 'paused') { pauseGame(); return; }
    }
    if (mode !== 'playing') return;
    if (e.repeat && (key === 'e' || key === 'h')) return;
    if (key === 'e') { interact(); return; }
    if (key === 'b') { bossKey(); return; }
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
      el.addEventListener('touchmove', handleTouchMove, { passive: false });
      el.addEventListener('touchend', handleTouchEnd, { passive: false });
      el.addEventListener('touchcancel', handleTouchEnd, { passive: false });
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
        if (mode !== 'playing') return;
        if (act === 'e') interact();
        else if (act === 'h') quickHide();
        else if (act === 'q') togglePhone();
        else if (act === 'b') bossKey();
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
  document.querySelectorAll('.onb-open').forEach(b => addTap(b, () => openOnboarding(false)));
  addTap($('onb-next'), () => onbStep(1));
  addTap($('onb-prev'), () => onbStep(-1));
  addTap($('onb-skip'), () => closeOnboarding(true));
  addTap(ui.shopClose, closeShop);
  document.querySelectorAll('.speed-range').forEach(r => r.addEventListener('input', () => setTimeScale(r.value)));
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
  window.NP_DEBUG = {
    get state() { return { mode, player: { ...player }, boss: { ...boss, path: boss.path.length }, reprimands, weekReprimands, misses: day.misses, planTarget, usefulness, fun, clockMinutes, stats: { ...stats, chatted: stats.chatted.size }, todo, coverTokens, intelTimer, waterCups: day.waterCups, waterRecharge: day.waterRecharge, coffeeCups: day.coffeeCups, coffeeJammed: !!day.coffeeJammed, aljaziraVisiting: !!day.aljaziraVisiting, overtimeWork: day.overtimeWork || 0, excelWorkAcc: day.excelWorkAcc || 0, excelPoolTasks: day.excelPoolTasks || 0, adhocDone: !!day.adhocDone }; },
    teleport(x, y) { player.x = x; player.y = y; player.action = 'none'; player.actionTimer = 0; player.hideSpot = null; nudge = null; },
    setBoss(x, y, state = 'look', facing) { boss.x = x; boss.y = y; boss.state = state; boss.stateTimer = 99; boss.path = []; if (facing !== undefined) { boss.facing = facing; boss.lookTimer = 0; } },
    skip(seconds) { for (let i = 0; i < seconds * 20 && mode === 'playing'; i++) update(0.05); },
    setDay(d) { dayIndex = clampDay(d); },
    get tutorial() { return tutorial.step; },
    get day() { return dayIndex; },
    set(v) { if ('usefulness' in v) usefulness = v.usefulness; if ('reprimands' in v) reprimands = v.reprimands; if ('weekReprimands' in v) { weekReprimands = v.weekReprimands; store.set('weekReprimands', weekReprimands); } if ('misses' in v) day.misses = v.misses; if ('fun' in v) fun = Math.min(100, Math.max(0, v.fun)); if ('waterCups' in v) day.waterCups = v.waterCups; if ('waterRecharge' in v) day.waterRecharge = v.waterRecharge; if ('coffeeJammed' in v) day.coffeeJammed = !!v.coffeeJammed; if ('coffeeQueueTimer' in v && day) day.coffeeQueueTimer = v.coffeeQueueTimer; if ('overtimeWork' in v) day.overtimeWork = v.overtimeWork; if ('adhocDone' in v) day.adhocDone = !!v.adhocDone; },
    interact, quickHide, togglePhone, startInspection, blocked, findPath, nav, startEvent,
    triggerAljazira(disaster = false) {
      const c = coworkerById('aljazira');
      if (!c) return false;
      day.aljaziraVisiting = true;
      day.aljaziraPhase = 'walk_to';
      if (disaster) day.aljaziraForceDisaster = true;
      else day.aljaziraForceCalm = true;
      return true;
    },
    saveProgress, loadSavedProgress, clearSavedProgress,
    say(owner, text, dur = 4) { say(owner, text, dur); },
    banterNow() { banterT = 0; updateBanter(0); updateBanter(2.1); return bubbles.map(b => b.owner); },
    get zones() { return WD.zones.map(z => z.id); },
    hideBanner() { banner = null; },
    get planWarned() { return !!day.planWarned; },
    get ui() { return { UI, unitPx, compact: compactHud(), hudBottom: hudBottom(), bigText }; },
    setBigText(v) { bigText = !!v; updateUiScale(); syncAudioButtons(); },
    chatPerk(id) { grantPerk(coworkers.find(c => c.id === id)); }, setSuspicion(v) { boss.suspicion = v; },
    get event() { return officeEvent; },
    get flags() { return { ...day }; },
    get coins() { return coins; },
    get owned() { return { ...owned }; },
    get coworkers() { return coworkers.map(c => ({ id: c.id, away: c.away, slack: c.slack, extra: !!c.extra })); },
    setClock(mins) { shiftTime = (mins - CFG.shiftStart) / (CFG.shiftEnd - CFG.shiftStart) * CFG.shiftSeconds; clockMinutes = mins; if (mins < CFG.lunchOpen && day.lunchAway) { day.lunchAway = false; coworkers.forEach(c => { c.away = !!c.remote; }); } },
    setCoins(v) { coins = v; store.set('coins', v); },
    buyUpgrade, openShop, closeShop, startAutopilot, stopAutopilot,
    get achievements() { return { ...achieved }; },
    bossKey, answerStandup, get choice() { return choice && { ...choice }; }, get nudge() { return nudge && { ...nudge }; },
    get majikArc() { return majikArc; },
    setUpgrades(o) { owned = { ...o }; },
    deskCheck() { finishDeskInspection(); },
    restart() { resetGame(); },
    addWork, reprimand,
    get unlocked() { return Object.fromEntries(Object.keys(UNLOCK).map(k => [k, unlocked(k)])); },
    get eventQueue() { return eventQueue.slice(); },
    finish(r) { finishGame(r); },
    clearEvents() { officeEvent = null; eventQueue = []; nextEvent = 999; nextBossCheck = 999; nudge = null; if (day) { day.coffeeQueueTimer = 0; day.coffeeQueueChecked = true; day.adhocDone = true; } },
    get onboarding() { return { open: onb.open, i: onb.i }; },
    get auto() { return { on: auto.on, goal: auto.goal && auto.goal.kind }; },
    get timeScale() { return timeScale; }, setTimeScale, setDifficulty,
    get difficulty() { return diffKey; },
    get diffConfig() { return DIFFICULTY; },
    forceSlack(id, kind = 'phone') { const c = coworkerById(id); c.slack = kind; c.slackTimer = 30; c.scoldCooldown = 0; c.alert = 0; },
    forceBeer() { day.beer = null; CFG.beerChance = 1; },
  };

  if (window.location.hash === '#play' || window.location.search.includes('play')) resetGame(); // быстрый старт для разработки, без онбординга
  else setMode('menu');
  requestAnimationFrame(loop);
})();

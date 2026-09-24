(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const officeArtwork = new Image();
  officeArtwork.src = 'assets/office-background-pixel-v1.png';
  const vikentiyArtwork = new Image();
  vikentiyArtwork.src = 'assets/vikentiy-sprite-v1.png';
  const fedorArtwork = new Image();
  fedorArtwork.src = 'assets/fedor-pavlovich-sprite-v1.png';
  const coworkerAtlas = new Image();
  coworkerAtlas.src = 'assets/coworkers-atlas-v1.png';

  // High-Definition retro pixel canvas: 960x540 (16:9, scales cleanly 2x to 1080p)
  const W = 960;
  const H = 540;
  canvas.width = W;
  canvas.height = H;
  const TAU = Math.PI * 2;
  const keys = new Set();
  const physicalKeyAliases = {
    KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd',
    KeyE: 'e', KeyH: 'h', KeyP: 'p'
  };
  const russianKeyAliases = {
    ц: 'w', ф: 'a', ы: 's', в: 'd',
    у: 'e', р: 'h', з: 'p'
  };

  function getControlKey(event) {
    const key = event.key.toLowerCase();
    return physicalKeyAliases[event.code] || russianKeyAliases[key] || key;
  }

  // Zero-dependency Web Audio procedural sound effects
  let audioCtx = null;
  function getAudio() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioCtx = new AudioContext();
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function playSound(type) {
    try {
      const a = getAudio();
      if (!a) return;
      const t = a.currentTime;
      const osc = a.createOscillator();
      const gain = a.createGain();
      osc.connect(gain);
      gain.connect(a.destination);

      if (type === 'click') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(480, t);
        osc.frequency.exponentialRampToValueAtTime(140, t + 0.05);
        gain.gain.setValueAtTime(0.08, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        osc.start(t);
        osc.stop(t + 0.05);
      } else if (type === 'coffee') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(340, t);
        osc.frequency.exponentialRampToValueAtTime(680, t + 0.2);
        gain.gain.setValueAtTime(0.12, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        osc.start(t);
        osc.stop(t + 0.22);
      } else if (type === 'smoke') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(190, t);
        osc.frequency.linearRampToValueAtTime(130, t + 0.28);
        gain.gain.setValueAtTime(0.06, t);
        gain.gain.linearRampToValueAtTime(0.001, t + 0.28);
        osc.start(t);
        osc.stop(t + 0.28);
      } else if (type === 'hide') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(280, t);
        osc.frequency.exponentialRampToValueAtTime(120, t + 0.14);
        gain.gain.setValueAtTime(0.1, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        osc.start(t);
        osc.stop(t + 0.14);
      } else if (type === 'alarm') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(600, t);
        osc.frequency.setValueAtTime(840, t + 0.1);
        osc.frequency.setValueAtTime(600, t + 0.2);
        gain.gain.setValueAtTime(0.18, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
        osc.start(t);
        osc.stop(t + 0.38);
      } else if (type === 'caught') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, t);
        osc.frequency.exponentialRampToValueAtTime(50, t + 0.55);
        gain.gain.setValueAtTime(0.26, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
        osc.start(t);
        osc.stop(t + 0.55);
      }
    } catch (_) {}
  }

  // DOM UI overlays
  const ui = {
    overlay: document.getElementById('screen-overlay'),
    pause: document.getElementById('pause-overlay'),
    end: document.getElementById('end-overlay'),
    start: document.getElementById('start-btn'),
    resume: document.getElementById('resume-btn'),
    restart: document.getElementById('restart-btn'),
    toast: document.getElementById('toast'),
    endKicker: document.getElementById('end-kicker'),
    endTitle: document.getElementById('end-title'),
    endCopy: document.getElementById('end-copy'),
    endStats: document.getElementById('end-stats'),
  };

  const COLORS = {
    ink: '#111e22',
    inkLight: '#1d2f34',
    paper: '#f5edd9',
    wall: '#c4b694',
    wallTrim: '#94876b',
    floor: '#96a58d',
    floorDark: '#819277',
    carpetTile: '#74866c',
    kitchenTile1: '#d7ded1',
    kitchenTile2: '#bcc5b5',
    woodFloor1: '#82654b',
    woodFloor2: '#6e5138',
    balconyWood: '#a68058',
    blue: '#148c9c',
    blueDark: '#0d535d',
    cyan: '#41c3cd',
    red: '#de433e',
    redDark: '#8b2622',
    yellow: '#f2bb38',
    yellowWarm: '#df9c26',
    green: '#57b867',
    greenDark: '#31733c',
    leafDark: '#1e4b28',
    leafLight: '#439753',
    white: '#fcf8ee',
    gray: '#526266',
    grayLight: '#94a2a4',
  };

  // Office Geometry (960x540 space)
  const office = {
    bounds: { x: 30, y: 58, w: 900, h: 454 },
    desk: { x: 675, y: 220, w: 110, h: 60, label: 'ВИКЕНТИЙ' },
    zones: [
      { id: 'desk', x: 670, y: 192, w: 122, h: 88, label: 'ТВОЙ СТОЛ (ОТКРЫТЬ EXCEL)', short: 'Твой стол', type: 'work' },
      { id: 'coffee', x: 124, y: 54, w: 70, h: 48, label: 'КОФЕМАШИНА (СВАРИТЬ ЭСПРЕССО)', short: 'Кофемашина', type: 'coffee' },
      { id: 'kitchen_fridge', x: 28, y: 94, w: 76, h: 72, label: 'ХОЛОДИЛЬНИК (ПРОКРАСТИНАЦИЯ)', short: 'Холодильник', type: 'kitchen' },
      { id: 'kitchen_water', x: 151, y: 106, w: 43, h: 48, label: 'КУЛЕР С ВОДОЙ', short: 'Кулер', type: 'water' },
      { id: 'smoke', x: 796, y: 54, w: 133, h: 68, label: 'БАЛКОН / КУРИЛКА', short: 'Курилка', type: 'smoke' },
      { id: 'archive_cabinet', x: 28, y: 304, w: 148, h: 198, label: 'АРХИВНЫЕ ШКАФЫ (УКРЫТИЕ)', short: 'Архив', type: 'cabinet' },
      { id: 'printer', x: 346, y: 412, w: 278, h: 92, label: 'МФУ / КСЕРОКС (ПЕЧАТЬ И УКРЫТИЕ)', short: 'Ксерокс', type: 'printer' },
      { id: 'server', x: 700, y: 366, w: 230, h: 136, label: 'СЕРВЕРНАЯ (YOUTUBE НА 4K)', short: 'Серверная', type: 'server' },
    ],
  };

  // 4 Large Potted Plants for Cover
  const plants = [
    { id: 'plant_monstera', x: 220, y: 136, w: 44, h: 48, label: 'МОНСТЕРА' },
    { id: 'plant_ficus', x: 440, y: 136, w: 44, h: 48, label: 'ФИКУС БЕНДЖАМИНА' },
    { id: 'plant_palm', x: 742, y: 92, w: 44, h: 52, label: 'ПАЛЬМА У БАЛКОНА' },
    { id: 'plant_balcony', x: 884, y: 264, w: 44, h: 54, label: 'ЛАВР В КОРИДОРЕ' },
  ];

  // Coworker desks (Renamed per user request: Айаршын, Влад, Александр, Глеб)
  const desks = [
    { x: 230, y: 128, w: 112, h: 80, name: 'Айаршын', role: 'Риск-аналитик', spriteIndex: 0 },
    { x: 340, y: 128, w: 112, h: 80, name: 'Влад', role: 'Скор-модели', spriteIndex: 1 },
    { x: 449, y: 128, w: 112, h: 80, name: 'Александр', role: 'Верификатор', spriteIndex: 2 },
    { x: 566, y: 128, w: 112, h: 80, name: 'Глеб', role: 'Андеррайтер', spriteIndex: 3 },
    { x: 675, y: 128, w: 112, h: 80, name: 'Викентий', role: 'IT & Риск-разработка', player: true },
  ];

  // Patrol route for Boss
  const patrol = [
    { x: 830, y: 220, desc: 'Балкон' },
    { x: 760, y: 260, desc: 'Опенспейс' },
    { x: 510, y: 258, desc: 'Проход между рядами' },
    { x: 280, y: 258, desc: 'Проход' },
    { x: 130, y: 178, desc: 'Кухня' },
    { x: 130, y: 370, desc: 'Архив' },
    { x: 470, y: 402, desc: 'Ксерокс' },
    { x: 690, y: 388, desc: 'Ряды столов' },
    { x: 850, y: 382, desc: 'Серверная' },
  ];

  // Player state: Skinny IT-guy with ponytail in black t-shirt
  const player = {
    x: 728,
    y: 257,
    r: 9,
    baseSpeed: 96,
    speed: 96,
    action: 'none',
    actionTimer: 0,
    facing: 0,
    walkFrame: 0,
    coffeeBoost: 0,
  };

  // Boss state: Bald, stout, round belly in business shirt with tie
  const boss = {
    x: 730,
    y: 160,
    r: 12,
    speed: 52,
    point: 0,
    state: 'patrol',
    stateTimer: 4,
    target: null,
    inspectTimer: 0,
    flash: 0,
    walkFrame: 0,
    facing: Math.PI,
  };

  let particles = [];
  let mode = 'menu';
  let last = 0;
  let clockMinutes = 8 * 60 + 50; // starts at 08:50
  const SHIFT_START = 8 * 60 + 50;
  const SHIFT_END = 19 * 60 + 30;
  const TOTAL_SHIFT_MINUTES = SHIFT_END - SHIFT_START; // 640 min
  const REAL_SHIFT_SECONDS = 210; // ~3.5 min game loop
  let shiftProgress = 0;

  let stealth = 82;
  let usefulness = 25;
  let catches = 0;
  let cigarettes = 0;
  let coffees = 0;
  let videos = 0;
  let kitchenRaids = 0;
  let workedSeconds = 0;
  let toastTimer = 0;
  let nextBossCheck = 15;
  let logEntries = [];
  let rngSeed = 42;

  function rand() {
    rngSeed = (rngSeed * 9301 + 49297) % 233280;
    return rngSeed / 233280;
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function rectContains(r, x, y) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }
  function zoneAt(x, y) { return office.zones.find(z => rectContains(z, x, y)); }
  function plantAt(x, y) { return plants.find(p => dist({ x, y }, { x: p.x + p.w / 2, y: p.y + p.h / 2 }) < 34); }
  function playerAtDesk() { return rectContains(office.desk, player.x, player.y); }

  function timeString(mins) {
    const h = Math.floor(mins / 60) % 24;
    const m = Math.floor(mins % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  function addLog(text, kind = 'info') {
    logEntries.unshift({ time: timeString(clockMinutes), text, kind });
    logEntries = logEntries.slice(0, 4);
  }

  function toast(text, seconds = 3.0) {
    ui.toast.textContent = text;
    ui.toast.classList.add('show');
    toastTimer = seconds;
  }

  function setMode(next) {
    mode = next;
    ui.overlay.classList.toggle('hidden', next !== 'menu');
    ui.pause.classList.toggle('hidden', next !== 'paused');
    ui.end.classList.toggle('hidden', next !== 'ended');
  }

  function resetGame() {
    rngSeed = Math.floor(Date.now() % 100000);
    clockMinutes = SHIFT_START;
    shiftProgress = 0;
    stealth = 82;
    usefulness = 25;
    catches = 0;
    cigarettes = 0;
    coffees = 0;
    videos = 0;
    kitchenRaids = 0;
    workedSeconds = 0;
    nextBossCheck = 16 + rand() * 8;
    logEntries = [];
    particles = [];

    player.x = 728;
    player.y = 257;
    player.action = 'none';
    player.actionTimer = 0;
    player.coffeeBoost = 0;
    player.speed = player.baseSpeed;

    boss.x = 860;
    boss.y = 258;
    boss.point = 0;
    boss.state = 'patrol';
    boss.stateTimer = 4;
    boss.inspectTimer = 0;
    boss.target = null;
    boss.flash = 0;

    addLog('08:50 — Викентий вошёл в БЦ «Турар». Хвостик поправлен.', 'info');
    addLog('Федор Павлович вытирает лысину платком и начинает обход.', 'info');
    setMode('playing');
    toast('Смена началась! Интерактивные зоны подсвечены золотом. Жми E!', 4.0);
  }

  function startGame() {
    playSound('click');
    resetGame();
  }

  function pauseGame() {
    playSound('click');
    if (mode === 'playing') setMode('paused');
    else if (mode === 'paused') setMode('playing');
  }

  // Interactive Action Query
  function getActionInfo() {
    const nearPlant = plantAt(player.x, player.y);
    if (nearPlant) {
      return {
        prompt: player.action === 'plant_hide' ? 'E / H — Вылезти из листвы' : `E / H — Спрятаться в ${nearPlant.label}`,
        zone: nearPlant,
        type: 'plant',
      };
    }

    const z = zoneAt(player.x, player.y);
    if (!z) return null;

    if (z.id === 'desk') {
      return {
        prompt: player.action === 'work' ? 'E — Закрыть Excel' : 'E — Открыть Excel (спасает от начальника!)',
        zone: z,
        type: 'desk',
      };
    }
    if (z.id === 'coffee') {
      return {
        prompt: player.coffeeBoost > 0 ? 'E — Выпить еще эспрессо' : 'E — Сварить эспрессо (+35% скорости бега!)',
        zone: z,
        type: 'coffee',
      };
    }
    if (z.id === 'kitchen_fridge') {
      return {
        prompt: player.action === 'kitchen_chill' ? 'E — Закрыть холодильник' : 'E — Прокрастинировать / Пошариться в холодильнике',
        zone: z,
        type: 'fridge',
      };
    }
    if (z.id === 'kitchen_water') {
      return {
        prompt: 'E — Набрать ледяной воды из кулера',
        zone: z,
        type: 'water',
      };
    }
    if (z.id === 'smoke') {
      return {
        prompt: player.action === 'smoke' ? 'E — Потушить сигарету' : 'E — Закурить на балконе с видом на горы',
        zone: z,
        type: 'smoke',
      };
    }
    if (z.id === 'archive_cabinet') {
      return {
        prompt: player.action === 'cabinet_hide' ? 'E / H — Выйти из архива' : 'E / H — Залезть за шкафы с отчетами',
        zone: z,
        type: 'cabinet',
      };
    }
    if (z.id === 'printer') {
      return {
        prompt: player.action === 'hide' ? 'E / H — Выйти из укрытия' : 'E — Печать отчетов / H — Спрятаться за ксероксом',
        zone: z,
        type: 'printer',
      };
    }
    if (z.id === 'server') {
      return {
        prompt: player.action === 'youtube' ? 'E — Закрыть вкладку' : 'E — Врубить 4K YouTube на серверном канале',
        zone: z,
        type: 'server',
      };
    }
    return null;
  }

  function interact() {
    const nearPlant = plantAt(player.x, player.y);
    if (nearPlant) {
      if (player.action === 'plant_hide') {
        player.action = 'none';
        playSound('hide');
        toast('Викентий вынырнул из листьев.', 1.6);
      } else {
        player.action = 'plant_hide';
        playSound('hide');
        addLog(`Викентий скрылся в ветвях: ${nearPlant.label}.`, 'good');
        toast('Спрятался в листве! Для Федора Павловича ты невидим.', 2.5);
      }
      return;
    }

    const z = zoneAt(player.x, player.y);
    if (!z) {
      toast('Здесь не с чем взаимодействовать. Ищи золотые маркеры [E]!', 2.0);
      return;
    }

    if (z.id === 'desk') {
      if (player.action === 'work') {
        player.action = 'none';
        toast('Excel закрыт. Риск открыт.', 1.5);
      } else {
        player.action = 'work';
        playSound('click');
        addLog('Викентий открыл Excel. Пальцы стучат по коду.', 'good');
        toast('Вид предельно занятой. Экран монитора отбрасывает зеленый свет.', 2.5);
      }
    } else if (z.id === 'coffee') {
      player.action = 'coffee';
      player.actionTimer = 2.4;
      coffees++;
      player.coffeeBoost = 16;
      usefulness = clamp(usefulness + 2, 0, 100);
      playSound('coffee');
      for (let i = 0; i < 8; i++) {
        particles.push({
          x: z.x + 36,
          y: z.y + 18,
          vx: (rand() - 0.5) * 8,
          vy: -14 - rand() * 12,
          size: 3 + rand() * 2,
          life: 0.9 + rand() * 0.4,
          maxLife: 1.3,
          color: 'rgba(255, 255, 255, 0.75)',
        });
      }
      addLog(`Кофе №${coffees}: двойной эспрессо выпит! Скорость +35%.`, 'good');
      toast('☕ КОФЕ ВЫПИТ! Бег +35%, формулы считаются со свистом.', 3.0);
    } else if (z.id === 'kitchen_fridge') {
      if (player.action === 'kitchen_chill') {
        player.action = 'none';
        toast('Холодильник закрыт.', 1.4);
      } else {
        player.action = 'kitchen_chill';
        kitchenRaids++;
        stealth = clamp(stealth - 2, 0, 100);
        playSound('click');
        const excuses = [
          'Викентий изучает контейнер Влада с надписью «НЕ ТРОГАТЬ!».',
          'Найдена конфета «Рахат» на блюдце. Съедена моментально.',
          'Викентий перевесил магнитик с Кок-Тобе.',
          'Задумчивый взгляд в пачку сока. Время успешно потянуто.',
        ];
        const msg = excuses[Math.floor(rand() * excuses.length)];
        addLog(`Кухня: ${msg}`, 'info');
        toast(`Кухня: ${msg}`, 2.8);
      }
    } else if (z.id === 'kitchen_water') {
      player.action = 'water';
      player.actionTimer = 2.0;
      playSound('coffee');
      for (let i = 0; i < 5; i++) {
        particles.push({
          x: z.x + 24 + (rand() - 0.5) * 10,
          y: z.y + 26,
          vx: 0,
          vy: -8 - rand() * 8,
          size: 2.5,
          life: 0.6,
          maxLife: 0.6,
          color: 'rgba(120, 210, 250, 0.85)',
        });
      }
      usefulness = clamp(usefulness + 1, 0, 100);
      toast('Бульк! Ледяная вода восстановила фокус айтишника.', 2.2);
    } else if (z.id === 'smoke') {
      if (player.action === 'smoke') {
        player.action = 'none';
        toast('Сигарета потушена в пепельнице.', 1.6);
      } else {
        player.action = 'smoke';
        player.actionTimer = 6.0;
        cigarettes++;
        stealth = clamp(stealth - 5, 0, 100);
        playSound('smoke');
        addLog(`Курилка №${cigarettes}: ветер с Заилийского Алатау уносит дым.`, 'bad');
        toast('Затяжка на свежем воздухе. Вид на горы прекрасен.', 3.0);
      }
    } else if (z.id === 'archive_cabinet') {
      if (player.action === 'cabinet_hide') {
        player.action = 'none';
        playSound('hide');
        toast('Викентий покинул архив.', 1.4);
      } else {
        player.action = 'cabinet_hide';
        playSound('hide');
        addLog('Викентий залез за шкаф с надписью «КРЕДИТНЫЕ ДОСЬЕ 2026».', 'good');
        toast('Спрятался в архиве! Папки с отчетами закрывают тебя с головой.', 2.5);
      }
    } else if (z.id === 'printer') {
      player.action = 'printer';
      player.actionTimer = 4.0;
      usefulness = clamp(usefulness + 2, 0, 100);
      playSound('click');
      addLog('Викентий запустил печать 100 страниц белого листа.', 'good');
      toast('Сканер шуршит, лампа светит. Образцовая имитация работы.', 2.4);
    } else if (z.id === 'server') {
      if (player.action === 'youtube') {
        player.action = 'none';
        toast('YouTube закрыт.', 1.5);
      } else {
        player.action = 'youtube';
        player.actionTimer = 6.5;
        videos++;
        stealth = clamp(stealth - 8, 0, 100);
        playSound('click');
        addLog('Серверная: запущен стрим в 4K с гигабитного канала.', 'bad');
        toast('Врубил YouTube на сервере. Главное — чтобы начальник не зашёл!', 3.0);
      }
    }
  }

  function quickHide() {
    const nearPlant = plantAt(player.x, player.y);
    if (nearPlant) {
      interact();
      return;
    }
    const z = zoneAt(player.x, player.y);
    if (z && (z.id === 'archive_cabinet' || z.id === 'printer' || z.id === 'desk')) {
      interact();
      return;
    }
    toast('Прячься у растений (Монстера, Фикус) или за шкафами в архиве!', 2.2);
  }

  function startInspection() {
    boss.state = 'inspect';
    boss.target = rand() < 0.65
      ? { x: office.desk.x + 50, y: office.desk.y + 40 }
      : patrol[Math.floor(rand() * patrol.length)];
    boss.inspectTimer = 8.0;
    boss.stateTimer = 0;
    playSound('alarm');
    addLog('🚨 ТРЕВОГА: Федор Павлович поднялся из кресла и пошёл с проверкой!', 'bad');
    toast('ТРЕВОГА! Начальник идёт с проверкой! БЕГИ К СТОЛУ В EXCEL ИЛИ ПРЯЧЬСЯ!', 3.8);
  }

  function finishInspection() {
    const atDesk = playerAtDesk() && player.action === 'work';
    const inCabinet = player.action === 'cabinet_hide';
    const inPlant = player.action === 'plant_hide';
    const bossNearPlayer = dist(player, boss) < 52;

    if (bossNearPlayer && !atDesk && !inCabinet && !inPlant) {
      catches++;
      stealth = clamp(stealth - 26, 0, 100);
      usefulness = clamp(usefulness - 6, 0, 100);
      boss.flash = 0.9;
      playSound('caught');
      addLog('❌ СПАЛИЛИ! Федор Павлович застал Викентия без дела.', 'bad');
      toast('ТЕБЯ СПАЛИЛИ! «Викентий, где кредитные скоры за третий квартал?!»', 3.6);
    } else if (inCabinet || inPlant) {
      stealth = clamp(stealth + 3, 0, 100);
      addLog('Укрытие сработало: начальник прошагал мимо и не заметил Викентия.', 'good');
      toast('Пронесло! Федор Павлович покрутил головой и пошёл дальше.', 2.6);
    } else if (atDesk) {
      usefulness = clamp(usefulness + 5, 0, 100);
      stealth = clamp(stealth + 6, 0, 100);
      addLog('Проверка пройдена! Викентий виртуозно делал вид, что считает риски.', 'good');
      toast('Блестяще! «Молодец, Викентий, график солидный».', 2.6);
    } else {
      stealth = clamp(stealth - 4, 0, 100);
      addLog('Федор Павлович не застал Викентия на месте, но пошёл дальше.', 'warn');
      toast('Начальник недовольно хмыкнул у твоего пустого стула.', 2.5);
    }

    boss.state = 'patrol';
    boss.point = (boss.point + 1) % patrol.length;
    boss.stateTimer = 4.0 + rand() * 3;
    nextBossCheck = 16 + rand() * 10;
  }

  function updatePlayer(dt) {
    let dx = 0;
    let dy = 0;
    if (keys.has('arrowleft') || keys.has('a')) dx -= 1;
    if (keys.has('arrowright') || keys.has('d')) dx += 1;
    if (keys.has('arrowup') || keys.has('w')) dy -= 1;
    if (keys.has('arrowdown') || keys.has('s')) dy += 1;

    if (player.coffeeBoost > 0) {
      player.coffeeBoost -= dt;
      player.speed = player.baseSpeed * 1.35;
      if (player.coffeeBoost <= 0) {
        player.coffeeBoost = 0;
        player.speed = player.baseSpeed;
      }
    }

    if (dx !== 0 || dy !== 0) {
      if (player.action === 'cabinet_hide' || player.action === 'plant_hide' || player.action === 'work') {
        player.action = 'none';
      }
      const len = Math.hypot(dx, dy);
      dx /= len;
      dy /= len;
      player.x += dx * player.speed * dt;
      player.y += dy * player.speed * dt;
      player.facing = Math.atan2(dy, dx);
      player.walkFrame += dt * 11 * (player.speed / player.baseSpeed);
    }

    const b = office.bounds;
    player.x = clamp(player.x, b.x + 14, b.x + b.w - 14);
    player.y = clamp(player.y, b.y + 14, b.y + b.h - 14);

    if (player.actionTimer > 0) {
      player.actionTimer -= dt;
      if (player.actionTimer <= 0) {
        player.actionTimer = 0;
        if (player.action === 'coffee' || player.action === 'water' || player.action === 'printer') {
          player.action = 'none';
        }
      }
    }

    if (player.action === 'work' && playerAtDesk()) {
      const boost = player.coffeeBoost > 0 ? 2.8 : 2.0;
      usefulness = clamp(usefulness + dt * boost, 0, 100);
      stealth = clamp(stealth + dt * 0.5, 0, 100);
      workedSeconds += dt;
    } else if (player.action === 'youtube') {
      usefulness = clamp(usefulness - dt * 1.4, 0, 100);
    } else if (player.action === 'smoke') {
      usefulness = clamp(usefulness - dt * 0.6, 0, 100);
      if (rand() < 0.45) {
        particles.push({
          x: player.x + 8,
          y: player.y - 18,
          vx: 14 + rand() * 12,
          vy: -10 - rand() * 10,
          size: 3 + rand() * 2.5,
          life: 1.3 + rand() * 0.6,
          maxLife: 1.9,
          color: 'rgba(230, 230, 230, 0.7)',
        });
      }
    } else if (player.action === 'plant_hide' || player.action === 'cabinet_hide') {
      stealth = clamp(stealth + dt * 0.8, 0, 100);
    }
  }

  function updateBoss(dt) {
    boss.stateTimer -= dt;

    if (boss.state === 'patrol') {
      const target = patrol[boss.point];
      const d = dist(boss, target);
      if (d < 5) {
        boss.point = (boss.point + 1) % patrol.length;
        boss.stateTimer = 2.2 + rand() * 2.5;
      } else {
        const vx = (target.x - boss.x) / d;
        const vy = (target.y - boss.y) / d;
        boss.x += vx * boss.speed * dt;
        boss.y += vy * boss.speed * dt;
        boss.facing = Math.atan2(vy, vx);
        boss.walkFrame += dt * 6;
      }
      nextBossCheck -= dt;
      if (nextBossCheck <= 0) startInspection();
    } else if (boss.state === 'inspect') {
      const target = boss.target || { x: player.x, y: player.y };
      const d = dist(boss, target);
      if (d > 5) {
        const vx = (target.x - boss.x) / d;
        const vy = (target.y - boss.y) / d;
        boss.x += vx * (boss.speed + 18) * dt;
        boss.y += vy * (boss.speed + 18) * dt;
        boss.facing = Math.atan2(vy, vx);
        boss.walkFrame += dt * 10;
      } else {
        boss.inspectTimer -= dt;
        if (boss.inspectTimer <= 0) finishInspection();
      }
    }

    if (boss.flash > 0) boss.flash -= dt;
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function update(dt) {
    shiftProgress += dt;
    clockMinutes = SHIFT_START + (shiftProgress / REAL_SHIFT_SECONDS) * TOTAL_SHIFT_MINUTES;

    updatePlayer(dt);
    updateBoss(dt);
    updateParticles(dt);

    // Ambient office particles
    if (rand() < 0.22) {
      // Coffee steam
      particles.push({
        x: 84 + (rand() - 0.5) * 6,
        y: 136,
        vx: (rand() - 0.5) * 4,
        vy: -9 - rand() * 6,
        size: 2 + rand() * 2,
        life: 0.9 + rand() * 0.4,
        maxLife: 1.3,
        color: 'rgba(255, 255, 255, 0.5)',
      });
    }
    if (rand() < 0.18) {
      // Balcony ashtray smoke
      particles.push({
        x: 820 + (rand() - 0.5) * 4,
        y: 180,
        vx: 10 + rand() * 10,
        vy: -7 - rand() * 6,
        size: 2.5 + rand() * 2,
        life: 1.4 + rand() * 0.5,
        maxLife: 1.9,
        color: 'rgba(220, 220, 220, 0.45)',
      });
    }
    if (rand() < 0.12) {
      // Water cooler bubble
      particles.push({
        x: 64 + (rand() - 0.5) * 10,
        y: 206,
        vx: 0,
        vy: -10 - rand() * 6,
        size: 2,
        life: 0.6,
        maxLife: 0.6,
        color: 'rgba(140, 220, 250, 0.8)',
      });
    }

    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) ui.toast.classList.remove('show');
    }

    if (clockMinutes >= SHIFT_END) finishGame(true);
    if (stealth <= 0) finishGame(false);
  }

  function finishGame(win) {
    if (mode !== 'playing') return;
    mode = 'ended';
    setMode('ended');
    ui.end.classList.toggle('good', win);
    ui.end.classList.toggle('bad', !win);
    ui.endKicker.textContent = win ? 'СМЕНА ОКОНЧЕНА / 19:30' : 'КРИТИЧЕСКИЙ ЗАЛЁТ';
    ui.endTitle.textContent = win ? 'ТЫ ВЫЖИЛ!' : 'ТЕБЯ УВОЛИЛИ!';

    if (win) {
      ui.endCopy.textContent = usefulness > 55
        ? 'Федор Павлович похлопал по плечу: «Викентий, вы наш ключевой айтишник и опора рисков». Смена сдана на отлично!'
        : 'Ты протянул до 19:30. За окном огни Алматы, Кок-Тобе горит неоном, а рабочий день позади.';
    } else {
      ui.endCopy.textContent = 'Федор Павлович лично сверил логи прокси и записи камер: перекуры, кофе и пустой экран. Доступ в здание заблокирован!';
    }

    ui.endStats.innerHTML = [
      [`${Math.round(usefulness)}%`, 'полезность отделу'],
      [catches, 'раз спалился'],
      [coffees + cigarettes + videos + kitchenRaids, 'успешных проёбов'],
    ].map(s => `<div class="end-stat"><b>${s[0]}</b><span>${s[1]}</span></div>`).join('');

    playSound(win ? 'coffee' : 'caught');
    addLog(win ? '19:30 — Смена окончена. Свобода!' : 'Трудовой договор расторгнут.', win ? 'good' : 'bad');
  }

  // --- DRAWING SYSTEM (Crisp High-Detail Pixel Art at 960x540) ---

  function rect(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  function pixelText(text, x, y, color = COLORS.ink, size = 10, align = 'left') {
    ctx.font = `700 ${size}px "Space Mono", Consolas, monospace`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(text, Math.round(x), Math.round(y));
  }

  // Dynamic sky & mountain vista based on shift progress
  function getSkyColors(progress) {
    const p = clamp(progress, 0, 1);
    if (p < 0.3) {
      return { skyTop: '#143c4a', skyBottom: '#3d7782', mountain: '#244e58', snow: '#e0f4f0', city: '#163138' };
    } else if (p < 0.75) {
      return { skyTop: '#18546b', skyBottom: '#5c98a5', mountain: '#306471', snow: '#f2fcfb', city: '#1f414a' };
    } else {
      return { skyTop: '#372044', skyBottom: '#9f4d42', mountain: '#402c42', snow: '#f5c6b4', city: '#261b2e' };
    }
  }

  function drawSkyAndMountains() {
    const p = (clockMinutes - SHIFT_START) / TOTAL_SHIFT_MINUTES;
    const cols = getSkyColors(p);

    // Panoramic window glass frame (y: 50 to 112 across x: 30 to 930)
    const grad = ctx.createLinearGradient(0, 50, 0, 112);
    grad.addColorStop(0, cols.skyTop);
    grad.addColorStop(1, cols.skyBottom);
    ctx.fillStyle = grad;
    ctx.fillRect(30, 50, 900, 62);

    // Mountain Ridge 1 (Majestic peaks of Zailiysky Alatau)
    ctx.fillStyle = cols.mountain;
    ctx.beginPath();
    ctx.moveTo(30, 112);
    ctx.lineTo(30, 92);
    ctx.lineTo(80, 74);
    ctx.lineTo(140, 88);
    ctx.lineTo(210, 64); // Peak 1
    ctx.lineTo(280, 82);
    ctx.lineTo(380, 58); // Peak 2 (Talgar-like)
    ctx.lineTo(460, 76);
    ctx.lineTo(560, 66);
    ctx.lineTo(650, 88);
    ctx.lineTo(740, 60); // Kok-Tobe hill
    ctx.lineTo(820, 78);
    ctx.lineTo(930, 70);
    ctx.lineTo(930, 112);
    ctx.closePath();
    ctx.fill();

    // Snow caps on peaks
    ctx.fillStyle = cols.snow;
    // Peak 210
    ctx.beginPath();
    ctx.moveTo(192, 70); ctx.lineTo(210, 64); ctx.lineTo(228, 71); ctx.lineTo(215, 75); ctx.lineTo(202, 74); ctx.fill();
    // Peak 380 (Big Talgar)
    ctx.beginPath();
    ctx.moveTo(358, 64); ctx.lineTo(380, 58); ctx.lineTo(402, 65); ctx.lineTo(388, 71); ctx.lineTo(370, 70); ctx.fill();
    // Peak 560
    ctx.beginPath();
    ctx.moveTo(544, 71); ctx.lineTo(560, 66); ctx.lineTo(576, 72); ctx.fill();

    // Kok-Tobe Television Tower at x: 740 (within window y: 52..112)
    rect(738, 54, 4, 18, '#dce8eb');
    rect(734, 60, 12, 3, '#dce8eb');
    rect(735, 57, 10, 2, cols.mountain);
    // Flashing red aircraft warning beacon
    const beaconOn = Math.floor(performance.now() / 500) % 2 === 0;
    rect(738, 52, 4, 3, beaconOn ? '#ff3324' : '#6b1510');

    // Almaty city skyline silhouettes below mountains
    ctx.fillStyle = cols.city;
    rect(50, 94, 40, 18, cols.city); rect(58, 98, 4, 4, '#f5d582'); rect(70, 98, 4, 4, '#f5d582');
    rect(120, 90, 34, 22, cols.city); rect(126, 95, 4, 4, '#f5d582');
    rect(240, 92, 48, 20, cols.city); rect(252, 96, 5, 4, '#f5d582'); rect(270, 96, 5, 4, '#f5d582');
    rect(410, 88, 38, 24, cols.city); rect(420, 94, 5, 4, '#f5d582');
    rect(580, 92, 44, 20, cols.city);
    rect(820, 90, 36, 22, cols.city);

    // Panoramic window glass mullions (pillars every 80px)
    for (let x = 30; x <= 930; x += 80) {
      rect(x, 50, 4, 62, COLORS.wallTrim);
      rect(x + 4, 52, 2, 58, 'rgba(255, 255, 255, 0.22)');
    }
    // Window sill
    rect(30, 108, 900, 5, COLORS.ink);
    rect(30, 111, 900, 3, COLORS.wallTrim);
  }

  function drawFloorAndZones() {
    // Main carpet floor
    rect(30, 114, 900, 396, COLORS.floor);

    // Carpet grid seams
    for (let x = 30; x < 930; x += 32) {
      for (let y = 114; y < 510; y += 32) {
        if ((x + y) % 64 === 0) rect(x, y, 2, 2, COLORS.carpetTile);
      }
    }

    // 1. Kitchen Tile Floor (Upper-Left)
    for (let x = 34; x < 260; x += 22) {
      for (let y = 116; y < 264; y += 22) {
        const isLight = ((x + y) / 22) % 2 === 0;
        rect(x, y, 21, 21, isLight ? COLORS.kitchenTile1 : COLORS.kitchenTile2);
      }
    }
    rect(260, 116, 3, 148, COLORS.wallTrim);
    rect(34, 263, 226, 3, COLORS.wallTrim);

    // 2. Archive Parquet Wood Floor (Lower-Left)
    for (let y = 280; y < 506; y += 14) {
      const isAlt = (y / 14) % 2 === 0;
      rect(34, y, 226, 13, isAlt ? COLORS.woodFloor1 : COLORS.woodFloor2);
    }
    rect(260, 278, 3, 228, COLORS.wallTrim);
    rect(34, 278, 226, 3, COLORS.wallTrim);

    // 3. Balcony / Smoker Deck (Far-Right)
    rect(780, 116, 146, 154, COLORS.balconyWood);
    for (let x = 780; x < 924; x += 18) {
      rect(x, 116, 2, 154, '#61442a'); // plank lines
    }
    // Balcony sliding glass door frame
    rect(777, 116, 4, 154, COLORS.wallTrim);
    // Steel railing overlooking Almaty
    rect(920, 116, 6, 154, '#c2d2d6');
    for (let y = 122; y < 270; y += 16) {
      rect(890, y, 32, 3, '#92a6ad');
    }

    // 4. Server Room (Lower-Right)
    rect(780, 298, 146, 180, '#17272c');
    rect(777, 296, 4, 182, COLORS.wallTrim);
    rect(780, 296, 146, 3, COLORS.wallTrim);

    // Room Label signs on floor
    pixelText('ЗОНА КУХНИ & ЭСПРЕССО', 140, 124, 'rgba(17, 30, 34, 0.45)', 9, 'center');
    pixelText('АРХИВНЫЕ ШКАФЫ ДЕЛ', 140, 288, 'rgba(245, 237, 217, 0.45)', 9, 'center');
    pixelText('БАЛКОН / СВЕЖИЙ ВОЗДУХ', 853, 126, 'rgba(255, 255, 255, 0.65)', 8, 'center');
    pixelText('СЕРВЕРНАЯ IT', 853, 306, 'rgba(65, 195, 205, 0.65)', 8, 'center');
    pixelText('ОТДЕЛ КРЕДИТНЫХ РИСКОВ · БЦ «ТУРАР»', 525, 122, 'rgba(17, 30, 34, 0.45)', 9, 'center');

    // Outer thick walls
    rect(28, 112, 904, 4, COLORS.ink);
    rect(28, 508, 904, 5, COLORS.ink);
    rect(28, 112, 4, 400, COLORS.ink);
    rect(928, 112, 4, 400, COLORS.ink);
  }

  // --- INTERACTION PIPELINE VISUAL HIGHLIGHTS ---
  function drawInteractionGuides() {
    const act = getActionInfo();
    const pulse = 0.5 + Math.sin(performance.now() / 300) * 0.5;

    // Draw prominent pulsing interactive brackets for every zone!
    for (const z of office.zones) {
      const isTarget = act && act.zone && act.zone.id === z.id;
      const borderColor = isTarget ? `rgba(242, 187, 56, ${0.85 + pulse * 0.15})` : 'rgba(65, 195, 205, 0.35)';
      const cornerSize = isTarget ? 14 : 9;
      const thick = isTarget ? 3 : 2;

      // Draw glowing corner brackets
      // Top-Left
      rect(z.x, z.y, cornerSize, thick, borderColor);
      rect(z.x, z.y, thick, cornerSize, borderColor);
      // Top-Right
      rect(z.x + z.w - cornerSize, z.y, cornerSize, thick, borderColor);
      rect(z.x + z.w - thick, z.y, thick, cornerSize, borderColor);
      // Bottom-Left
      rect(z.x, z.y + z.h - thick, cornerSize, thick, borderColor);
      rect(z.x, z.y + z.h - cornerSize, thick, cornerSize, borderColor);
      // Bottom-Right
      rect(z.x + z.w - cornerSize, z.y + z.h - thick, cornerSize, thick, borderColor);
      rect(z.x + z.w - thick, z.y + z.h - cornerSize, thick, cornerSize, borderColor);

      // Floating bouncing badge over interactive object
      if (isTarget) {
        const bounce = Math.sin(performance.now() / 250) * 3;
        const badgeY = Math.max(54, z.y - 14 + bounce);
        const text = `[E] ${z.short}`;
        const bW = text.length * 7 + 16;
        rect(z.x + z.w / 2 - bW / 2, badgeY, bW, 16, COLORS.yellow);
        pixelText(text, z.x + z.w / 2, badgeY + 8, COLORS.ink, 9, 'center');
      }
    }

    // Plant interactive guides
    for (const p of plants) {
      const isTarget = act && act.zone && act.zone.id === p.id;
      const pColor = isTarget ? `rgba(87, 184, 103, ${0.9 + pulse * 0.1})` : 'rgba(87, 184, 103, 0.4)';
      rect(p.x - 2, p.y - 2, p.w + 4, 2, pColor);
      rect(p.x - 2, p.y + p.h, p.w + 4, 2, pColor);
      rect(p.x - 2, p.y - 2, 2, p.h + 4, pColor);
      rect(p.x + p.w, p.y - 2, 2, p.h + 4, pColor);

      if (isTarget) {
        const bounce = Math.sin(performance.now() / 250) * 3;
        const badgeY = Math.max(54, p.y - 14 + bounce);
        const text = `[E / H] ${p.label}`;
        const bW = text.length * 7 + 16;
        rect(p.x + p.w / 2 - bW / 2, badgeY, bW, 16, COLORS.green);
        pixelText(text, p.x + p.w / 2, badgeY + 8, COLORS.white, 9, 'center');
      }
    }
  }

  function drawFurniture() {
    // --- KITCHEN PROPS ---
    // Countertop
    rect(38, 134, 86, 52, '#485e62');
    rect(40, 136, 82, 48, '#cfd6d4');
    // Sink with faucet
    rect(46, 146, 26, 24, '#919ea0');
    rect(48, 148, 22, 20, '#667578');
    rect(54, 140, 4, 8, '#ccd6d8'); // chrome faucet
    // Professional Espresso Machine
    rect(78, 140, 36, 38, '#212a2e');
    rect(80, 142, 32, 12, '#de433e'); // brand red accent
    rect(82, 158, 28, 4, '#ccd6d8'); // drip tray
    rect(90, 162, 10, 12, '#fcf8ee'); // ceramic espresso cup
    rect(92, 144, 4, 4, '#c68d4a'); // pressure gauge
    // Steam animation
    const steamTick = (performance.now() / 250) % 3;
    rect(94, 134 - steamTick * 3, 3, 3, 'rgba(255,255,255,0.65)');

    // Big Refrigerator with detailed magnets & stickers
    rect(142, 132, 54, 76, '#a4b1b3');
    rect(144, 134, 50, 72, '#c4cfd1');
    rect(144, 166, 50, 3, '#75868a'); // split line
    rect(184, 142, 4, 18, '#324246'); // top handle
    rect(184, 172, 4, 18, '#324246'); // bottom handle
    // Colorful magnets on fridge
    rect(150, 140, 8, 8, COLORS.yellow);
    rect(162, 144, 10, 6, COLORS.cyan);
    rect(174, 138, 6, 6, COLORS.red);
    rect(154, 178, 12, 10, '#f5efde'); // note paper

    // Microwave
    rect(204, 132, 46, 32, '#343e41');
    rect(206, 134, 42, 28, '#dfd8ca');
    rect(210, 138, 26, 20, '#192022');
    rect(238, 140, 6, 4, COLORS.green); // green LED clock

    // Water Cooler (Кулер)
    rect(44, 204, 34, 48, '#eef2f2');
    rect(46, 206, 30, 44, '#d5dfe2');
    rect(48, 192, 26, 18, 'rgba(65, 195, 205, 0.85)'); // blue bottle
    rect(52, 190, 18, 3, 'rgba(35, 135, 155, 0.9)');
    rect(52, 222, 4, 6, COLORS.red); // red tap
    rect(64, 222, 4, 6, COLORS.blue); // blue tap

    // Kitchen table & stools
    rect(124, 218, 82, 36, '#755940');
    rect(126, 220, 78, 32, '#b89472');
    // Fruit bowl & mug on table
    rect(152, 228, 18, 12, '#f5efde');
    rect(158, 226, 6, 6, COLORS.yellowWarm);
    rect(180, 228, 7, 9, COLORS.cyan);

    // --- ARCHIVE PROPS (Tall Cabinets & File Boxes) ---
    // Row 1 of Cabinets
    rect(38, 296, 56, 152, '#485458');
    for (let y = 300; y < 440; y += 28) {
      rect(40, y, 52, 26, '#728186');
      rect(58, y + 9, 16, 4, '#ccd6d8'); // handle
      rect(46, y + 6, 8, 6, COLORS.white); // label
    }
    // Row 2 of Cabinets
    rect(152, 296, 56, 152, '#56402d');
    for (let y = 300; y < 440; y += 28) {
      rect(154, y, 52, 26, '#7e6249');
      rect(172, y + 9, 16, 4, '#e0caa9');
      rect(160, y + 6, 8, 6, COLORS.yellow);
    }
    // File boxes
    rect(102, 304, 38, 30, '#b28d5e');
    rect(104, 306, 34, 26, '#c49d6b');
    pixelText('2026', 121, 318, '#593d1b', 6, 'center');
    rect(104, 338, 34, 26, '#b28d5e');

    // Safe box
    rect(102, 400, 42, 42, '#242e32');
    rect(104, 402, 38, 38, '#3b4b51');
    rect(118, 416, 10, 10, '#ccd6d8'); // safe dial

    // --- BALCONY PROPS ---
    // Standing Ashtray
    rect(814, 186, 14, 26, '#374246');
    rect(812, 184, 18, 4, '#849398');
    rect(820, 183, 3, 2, '#ff382b'); // cherry glow
    // Wooden Bench
    rect(848, 214, 62, 24, '#54361e');
    rect(850, 216, 58, 18, '#7e5737');

    // --- PRINTER / COPIER CENTER ---
    rect(292, 406, 104, 76, '#313a3d');
    rect(294, 408, 100, 72, '#d4dcda');
    // Glass scan platen
    rect(302, 414, 56, 32, '#426065');
    // Moving animated scan light bar!
    const scanBarPos = 305 + Math.abs(Math.sin(performance.now() / 600)) * 48;
    rect(scanBarPos, 415, 4, 30, 'rgba(100, 255, 210, 0.9)');
    // Control panel with LEDs
    rect(366, 416, 6, 6, COLORS.green);
    rect(376, 416, 6, 6, COLORS.yellow);
    // Paper trays & boxes
    rect(300, 452, 60, 9, COLORS.white);
    rect(306, 464, 50, 9, '#829196');
    rect(402, 426, 30, 26, '#cfc4b0');
    pixelText('A4', 417, 439, COLORS.ink, 8, 'center');

    // --- SERVER RACK (IT Corner) ---
    rect(794, 324, 66, 134, '#101a1c');
    rect(796, 326, 62, 130, '#1f3035');
    for (let y = 332; y < 448; y += 15) {
      rect(798, y, 58, 12, '#142023');
      rect(802, y + 3, 36, 3, '#2e4952');
      const tick = Math.floor(performance.now() / 180 + y) % 5;
      rect(842, y + 3, 3, 3, tick === 0 ? COLORS.green : '#125426');
      rect(848, y + 3, 3, 3, tick === 1 ? COLORS.cyan : '#0f4850');
      rect(854, y + 3, 3, 3, tick === 2 ? COLORS.yellow : '#543e0e');
    }

    // --- WORK DESKS ---
    desks.forEach(d => drawDetailedDesk(d));

    // --- 4 BIG INDOOR PLANTS ---
    plants.forEach(p => drawBigPlant(p));
  }

  function drawCoworkersOnArtwork() {
    if (!coworkerAtlas.complete || !coworkerAtlas.naturalWidth) return;
    for (const d of desks) {
      if (d.player) continue;
      drawCoworker(d);
      const nameX = d.x + 42;
      drawNameplate(d.name.toUpperCase(), nameX, d.y + 127, COLORS.blue, 8.5);
      pixelText(d.role.toUpperCase(), nameX, d.y + 139, COLORS.paper, 8, 'center');
    }
  }

  function drawDetailedDesk(d) {
    const isPlayer = d.player;
    // Desk shadow
    rect(d.x + 3, d.y + 6, d.w, d.h, 'rgba(14, 24, 28, 0.28)');
    // Desk body
    rect(d.x, d.y, d.w, d.h, '#443c32');
    rect(d.x + 3, d.y + 3, d.w - 6, d.h - 6, isPlayer ? '#2e555b' : '#635e54');
    rect(d.x + 6, d.y + 6, d.w - 12, d.h - 12, isPlayer ? '#3b6a70' : '#757065');

    // Computer Monitor(s)
    // Monitor 1 (Main)
    rect(d.x + 14, d.y + 10, 42, 28, '#182124');
    rect(d.x + 16, d.y + 12, 38, 22, isPlayer ? '#12482e' : '#1e3740');
    if (isPlayer) {
      // Excel spreadsheet rows
      rect(d.x + 18, d.y + 14, 34, 4, '#26804e');
      rect(d.x + 18, d.y + 20, 16, 3, COLORS.white);
      rect(d.x + 18, d.y + 25, 24, 3, COLORS.yellow);
      rect(d.x + 18, d.y + 29, 20, 3, '#47e38f');
    } else {
      rect(d.x + 18, d.y + 15, 28, 3, '#5c838e');
      rect(d.x + 18, d.y + 21, 18, 3, '#5c838e');
      rect(d.x + 18, d.y + 27, 24, 3, '#5c838e');
    }
    // Stand
    rect(d.x + 32, d.y + 39, 6, 4, '#182124');
    rect(d.x + 26, d.y + 43, 18, 3, '#182124');

    // Monitor 2 (Side monitor)
    rect(d.x + 60, d.y + 10, 34, 28, '#182124');
    rect(d.x + 62, d.y + 12, 30, 22, '#18272c');
    // Financial graph on side monitor
    rect(d.x + 66, d.y + 26, 5, 5, COLORS.cyan);
    rect(d.x + 73, d.y + 21, 5, 10, COLORS.yellow);
    rect(d.x + 80, d.y + 17, 5, 14, COLORS.green);

    // Keyboard & Mouse
    rect(d.x + 20, d.y + 50, 34, 11, '#1e2528');
    rect(d.x + 58, d.y + 52, 8, 9, '#1e2528');

    // Accessories
    rect(d.x + 100, d.y + 48, 9, 12, isPlayer ? COLORS.yellow : COLORS.white);
    rect(d.x + 102, d.y + 51, 3, 6, '#4d3820'); // coffee

    // Document folders
    rect(d.x + 98, d.y + 14, 20, 24, '#bfae8c');
    rect(d.x + 102, d.y + 17, 14, 6, COLORS.red);

    // Office chair behind desk
    rect(d.x + 36, d.y + 62, 36, 14, '#202c30');
    rect(d.x + 42, d.y + 59, 24, 4, '#34474c');

    // Draw Coworkers sitting at their desks (Айаршын, Влад, Александр, Глеб)
    if (!isPlayer) {
      drawCoworker(d);
    }

    // Nameplate tag on desk front
    pixelText(d.name, d.x + d.w / 2, d.y + 4, isPlayer ? COLORS.yellow : COLORS.paper, 9, 'center');
  }

  function drawCoworker(d) {
    if (coworkerAtlas.complete && coworkerAtlas.naturalWidth) {
      drawAtlasSprite(coworkerAtlas, d.spriteIndex ?? 0, d.x + 42, d.y + 112, 55);
      return;
    }

    const cx = d.x + 42;
    const cy = d.y + 54;
    const bob = Math.sin(performance.now() / 400 + d.x) * 1.2;

    if (d.name === 'Айаршын') {
      // Айаршын: stylish dark bob hair, turquoise jumper
      rect(cx + 3, cy - 12 + bob, 18, 12, '#24140c'); // hair
      rect(cx + 5, cy - 9 + bob, 14, 11, '#dfb08c'); // face
      rect(cx + 6, cy - 7 + bob, 3, 2, COLORS.white); rect(cx + 14, cy - 7 + bob, 3, 2, COLORS.white);
      rect(cx + 7, cy - 7 + bob, 1, 2, COLORS.ink); rect(cx + 15, cy - 7 + bob, 1, 2, COLORS.ink);
      rect(cx + 10, cy - 3 + bob, 4, 1, '#9c5d52'); rect(cx + 4, cy - 10 + bob, 2, 8, '#382318');
      rect(cx + 1, cy - 2 + bob, 22, 12, '#188d94'); // turquoise jumper
      rect(cx + 3, cy + bob, 4, 7, '#44b6ad'); rect(cx + 18, cy + 1 + bob, 3, 8, '#116a74');
    } else if (d.name === 'Влад') {
      // Влад: hoodie, large over-ear headphones
      rect(cx + 3, cy - 12 + bob, 18, 12, '#1b2224'); // hair
      rect(cx + 5, cy - 9 + bob, 14, 11, '#d6ab89'); // face
      rect(cx, cy - 11 + bob, 4, 10, '#de433e'); // red headphones
      rect(cx + 20, cy - 11 + bob, 4, 10, '#de433e');
      rect(cx + 6, cy - 7 + bob, 3, 2, COLORS.white); rect(cx + 14, cy - 7 + bob, 3, 2, COLORS.white);
      rect(cx + 7, cy - 7 + bob, 1, 2, COLORS.ink); rect(cx + 15, cy - 7 + bob, 1, 2, COLORS.ink);
      rect(cx + 10, cy - 3 + bob, 4, 1, '#805448'); rect(cx + 7, cy - 12 + bob, 11, 2, '#303b3d');
      rect(cx + 1, cy - 2 + bob, 22, 12, '#38464c'); // grey hoodie
      rect(cx + 8, cy - 1 + bob, 8, 7, '#56686b'); rect(cx + 11, cy + 5 + bob, 2, 4, COLORS.yellow);
    } else if (d.name === 'Александр') {
      // Александр: glasses, neat plaid shirt
      rect(cx + 3, cy - 12 + bob, 18, 12, '#2e251e'); // hair
      rect(cx + 5, cy - 9 + bob, 14, 11, '#deb18f'); // face
      rect(cx + 6, cy - 6 + bob, 4, 3, COLORS.ink); // glasses
      rect(cx + 13, cy - 6 + bob, 4, 3, COLORS.ink);
      rect(cx + 7, cy - 5 + bob, 2, 1, '#bde1e6'); rect(cx + 14, cy - 5 + bob, 2, 1, '#bde1e6');
      rect(cx + 10, cy - 4 + bob, 3, 2, '#c68c70'); rect(cx + 10, cy - 1 + bob, 4, 1, '#7d443c');
      rect(cx + 10, cy - 6 + bob, 3, 1, COLORS.ink);
      rect(cx + 1, cy - 2 + bob, 22, 12, '#664032'); // shirt
      rect(cx + 3, cy + 1 + bob, 3, 8, '#a77150'); rect(cx + 12, cy - 1 + bob, 2, 11, '#ddc08a');
    } else if (d.name === 'Глеб') {
      // Глеб: white tee, relaxed posture
      rect(cx + 3, cy - 12 + bob, 18, 12, '#242526');
      rect(cx + 5, cy - 9 + bob, 14, 11, '#d4a887');
      rect(cx + 6, cy - 7 + bob, 3, 2, COLORS.white); rect(cx + 14, cy - 7 + bob, 3, 2, COLORS.white);
      rect(cx + 7, cy - 7 + bob, 1, 2, COLORS.ink); rect(cx + 15, cy - 7 + bob, 1, 2, COLORS.ink);
      rect(cx + 10, cy - 3 + bob, 4, 1, '#965c4a'); rect(cx + 4, cy - 12 + bob, 12, 2, '#353b3b');
      rect(cx + 1, cy - 2 + bob, 22, 12, COLORS.white); // white tee
      rect(cx + 10, cy - 2 + bob, 4, 12, '#34758a');
      rect(cx + 3, cy + 1 + bob, 3, 7, '#d8e2db'); rect(cx + 17, cy + 1 + bob, 3, 7, '#d8e2db');
    }
  }

  function drawBigPlant(p) {
    // Terracotta Plant Pot
    rect(p.x + 6, p.y + p.h - 20, p.w - 12, 20, '#9c5636');
    rect(p.x + 3, p.y + p.h - 23, p.w - 6, 4, '#bd6f4b');
    rect(p.x + 7, p.y + p.h - 21, p.w - 14, 3, '#351f12'); // soil

    // Foliage with wind sway
    const sway = Math.sin(performance.now() / 700 + p.x) * 2;

    // Background dark leaves
    rect(p.x + 3 + sway * 0.5, p.y + 8, 18, 20, COLORS.leafDark);
    rect(p.x + 25 - sway * 0.5, p.y + 6, 20, 22, COLORS.leafDark);
    rect(p.x + 12, p.y + 3, 24, 25, COLORS.leafDark);

    // Foreground detailed leaves with monstera cuts
    rect(p.x - 3 + sway, p.y + 14, 22, 18, COLORS.leafLight);
    rect(p.x + 3 + sway, p.y + 17, 6, 6, COLORS.leafDark); // slit
    rect(p.x + 22 - sway, p.y + 11, 25, 20, COLORS.leafLight);
    rect(p.x + 34 - sway, p.y + 16, 6, 6, COLORS.leafDark);
    rect(p.x + 9 + sway * 0.8, p.y, 26, 22, COLORS.leafLight);
    rect(p.x + 17 + sway * 0.8, p.y + 6, 6, 6, COLORS.leafDark);

    // Stems
    rect(p.x + 21, p.y + 22, 3, 14, '#1b3f22');

    // Label on floor
    pixelText(p.label, p.x + p.w / 2, p.y + p.h + 8, 'rgba(30, 75, 40, 0.75)', 7, 'center');
  }

  // --- CHARACTER SPRITES ---

  // Викентий: худой айтишник, длинные волосы с хвостиком, черная футболка, джинсы
  function drawPlayer() {
    const x = player.x;
    const y = player.y;
    const isWalking = keys.size > 0;
    const walkBob = isWalking ? Math.sin(player.walkFrame) * 2 : 0;
    const legPhase = isWalking ? Math.sin(player.walkFrame) : 0;

    // Special cover sprites
    if (player.action === 'plant_hide') {
      rect(x - 10, y - 10, 20, 10, '#2b1e17'); // hair
      rect(x - 8, y - 5, 16, 10, '#dfb08c'); // face
      rect(x - 5, y - 2, 4, 4, COLORS.white); rect(x + 3, y - 2, 4, 4, COLORS.white); // eyes
      rect(x - 4, y - 1, 2, 2, COLORS.ink); rect(x + 4, y - 1, 2, 2, COLORS.ink);
      drawActionBadge('🌿 В ЛИСТВЕ (НЕЗАМЕТЕН)', x, y - 24, COLORS.green);
      return;
    }
    if (player.action === 'cabinet_hide') {
      rect(x - 9, y - 18, 18, 16, '#dfb08c');
      rect(x - 10, y - 21, 20, 7, '#2b1e17');
      rect(x - 5, y - 13, 4, 4, COLORS.white); rect(x + 2, y - 13, 4, 4, COLORS.white);
      rect(x - 4, y - 12, 2, 2, COLORS.ink); rect(x + 3, y - 12, 2, 2, COLORS.ink);
      drawActionBadge('🗄️ В АРХИВЕ (СПРЯТАН)', x, y - 28, COLORS.cyan);
      return;
    }

    if (vikentiyArtwork.complete && vikentiyArtwork.naturalWidth) {
      const bob = isWalking ? Math.sin(player.walkFrame) * 1.6 : 0;
      ctx.fillStyle = 'rgba(12, 20, 24, 0.32)';
      ctx.beginPath(); ctx.ellipse(x, y + 13, 15, 5, 0, 0, TAU); ctx.fill();
      drawSpriteByHeight(vikentiyArtwork, x, y + 14 + bob, 72);

      if (player.coffeeBoost > 0 || player.action === 'coffee') {
        rect(x + 13, y + 2 + bob, 8, 12, COLORS.white);
        rect(x + 14, y + 6 + bob, 6, 5, COLORS.green);
        rect(x + 15, y - 3 + bob, 2, 4, 'rgba(255,255,255,0.8)');
      } else if (player.action === 'smoke') {
        rect(x + 15, y + 4 + bob, 8, 2, COLORS.white);
        rect(x + 22, y + 3 + bob, 3, 3, '#ff3824');
      }

      if (player.action === 'work') drawActionBadge('📊 РАБОТАЕТ В EXCEL', x, y - 58, COLORS.green);
      else if (player.action === 'smoke') drawActionBadge('🚬 КУРИТ НА БАЛКОНЕ', x, y - 58, COLORS.red);
      else if (player.action === 'youtube') drawActionBadge('▶️ 4K YOUTUBE', x, y - 58, COLORS.red);
      else if (player.action === 'kitchen_chill') drawActionBadge('🥪 ШАРИТСЯ В ХОЛОДИЛЬНИКЕ', x, y - 58, COLORS.yellow);
      else drawNameplate('ВИКЕНТИЙ', x, y - 56, COLORS.blue);
      return;
    }

    // Shadow
    ctx.fillStyle = 'rgba(12, 20, 24, 0.35)';
    ctx.beginPath();
    ctx.ellipse(x, y + 14, 12, 5, 0, 0, TAU);
    ctx.fill();

    const py = y + walkBob;

    // Skinny Legs (Dark blue jeans)
    const legLeftOff = legPhase * 4;
    const legRightOff = -legPhase * 4;
    rect(x - 6, py + 6, 5, 10 + legLeftOff, '#1d2730');
    rect(x + 1, py + 6, 5, 10 + legRightOff, '#1d2730');
    // White sneakers with red stripe
    rect(x - 7, py + 16 + legLeftOff, 7, 4, COLORS.white);
    rect(x + 1, py + 16 + legRightOff, 7, 4, COLORS.white);
    rect(x - 6, py + 18 + legLeftOff, 5, 1, COLORS.red);
    rect(x + 2, py + 18 + legRightOff, 5, 1, COLORS.red);

    // Torso: Black IT Oversized T-Shirt (Худой силуэт)
    rect(x - 9, py - 9, 18, 16, '#181b1d');
    rect(x - 8, py - 8, 16, 14, '#222629');
    // Neon green developer print on shirt '>_'
    pixelText('>_', x, py - 1, COLORS.green, 7, 'center');

    // Skinny Arms
    rect(x - 11, py - 6, 3, 11, '#222629');
    rect(x + 8, py - 6, 3, 11, '#222629');
    rect(x - 11, py + 4, 3, 4, '#dfb08c'); // hands
    rect(x + 8, py + 4, 3, 4, '#dfb08c');

    // Holding items
    if (player.coffeeBoost > 0 || player.action === 'coffee') {
      rect(x + 11, py + 1, 7, 10, COLORS.white);
      rect(x + 12, py + 4, 5, 4, COLORS.green); // Firdom green logo
      rect(x + 13, py - 3, 2, 3, 'rgba(255,255,255,0.7)'); // steam
    } else if (player.action === 'smoke') {
      rect(x + 11, py + 2, 7, 3, COLORS.white);
      rect(x + 16, py + 2, 3, 3, '#ff3824'); // lit cherry
    }

    // Head / Face
    rect(x - 8, py - 24, 16, 15, '#dfb08c');
    // Long hair with Ponytail!
    rect(x - 9, py - 28, 18, 8, '#2b1e17'); // top hair
    rect(x - 10, py - 25, 4, 12, '#2b1e17'); // side bangs
    rect(x + 6, py - 25, 4, 12, '#2b1e17');
    // Ponytail tied back with hairband (sways when walking!)
    const tailSway = isWalking ? Math.sin(player.walkFrame) * 3 : 0;
    rect(x - 2 + tailSway, py - 29, 6, 4, '#442d22'); // hairband
    rect(x - 3 + tailSway * 1.5, py - 26, 7, 14, '#2b1e17'); // ponytail hanging back

    // Eyes with blinking
    const blink = Math.floor(performance.now() / 2500) % 15 === 0;
    if (blink) {
      rect(x - 5, py - 17, 4, 1, COLORS.ink);
      rect(x + 2, py - 17, 4, 1, COLORS.ink);
    } else {
      rect(x - 5, py - 18, 4, 5, COLORS.white);
      rect(x + 2, py - 18, 4, 5, COLORS.white);
      const pXOff = keys.has('arrowleft') || keys.has('a') ? -1 : (keys.has('arrowright') || keys.has('d') ? 1 : 0);
      rect(x - 4 + pXOff, py - 17, 2, 3, COLORS.ink);
      rect(x + 3 + pXOff, py - 17, 2, 3, COLORS.ink);
    }

    // Wireless earphone in ear
    rect(x + 7, py - 19, 2, 5, COLORS.white);

    // Badges / Status above head
    if (player.action === 'work') {
      drawActionBadge('📊 РАБОТАЕТ В EXCEL', x, py - 34, COLORS.green);
    } else if (player.action === 'smoke') {
      drawActionBadge('🚬 КУРИТ НА БАЛКОНЕ', x, py - 34, COLORS.red);
    } else if (player.action === 'youtube') {
      drawActionBadge('▶️ 4K YOUTUBE', x, py - 34, COLORS.red);
    } else if (player.action === 'kitchen_chill') {
      drawActionBadge('🥪 ШАРИТСЯ В ХОЛОДИЛЬНИКЕ', x, py - 34, COLORS.yellow);
    } else {
      drawNameplate('ВИКЕНТИЙ', x, py - 33, COLORS.blue);
    }
  }

  // Федор Павлович: лысый, толстый (круглый живот), в светлой рубашке с короткими рукавами, галстук, ремень
  function drawBoss() {
    const x = boss.x;
    const y = boss.y;
    const isWalking = boss.state === 'patrol' || boss.state === 'inspect';
    const walkBob = isWalking ? Math.sin(boss.walkFrame) * 2 : 0;
    const legPhase = isWalking ? Math.sin(boss.walkFrame) : 0;

    // Boss Heavy Shadow
    ctx.fillStyle = 'rgba(12, 20, 24, 0.4)';
    ctx.beginPath();
    ctx.ellipse(x, y + 15, 16, 6, 0, 0, TAU);
    ctx.fill();

    // Inspection Alert Aura
    if (boss.state === 'inspect') {
      ctx.strokeStyle = 'rgba(235, 65, 55, 0.55)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, 52, 0, TAU);
      ctx.stroke();

      const pulse = (performance.now() / 200) % 1;
      ctx.strokeStyle = `rgba(235, 65, 55, ${0.5 * (1 - pulse)})`;
      ctx.beginPath();
      ctx.arc(x, y, 52 * pulse, 0, TAU);
      ctx.stroke();
    }

    if (fedorArtwork.complete && fedorArtwork.naturalWidth) {
      const walkBob = isWalking ? Math.sin(boss.walkFrame) * 1.2 : 0;
      ctx.fillStyle = 'rgba(12, 20, 24, 0.4)';
      ctx.beginPath(); ctx.ellipse(x, y + 18, 22, 7, 0, 0, TAU); ctx.fill();
      drawSpriteByHeight(fedorArtwork, x, y + 20 + walkBob, 78);

      if (boss.state === 'inspect') {
        const alertBlink = Math.floor(performance.now() / 200) % 2 === 0;
        drawActionBadge('! ПРОВЕРКА', x, y - 66, alertBlink ? COLORS.red : '#9c211e');
      } else {
        drawNameplate('ФЕДОР ПАВЛОВИЧ', x, y - 64, COLORS.red);
      }
      return;
    }

    const by = y + walkBob;

    // Short stout legs
    const legLeftOff = legPhase * 3;
    const legRightOff = -legPhase * 3;
    rect(x - 8, by + 8, 7, 10 + legLeftOff, '#242b30');
    rect(x + 1, by + 8, 7, 10 + legRightOff, '#242b30');
    // Polished heavy shoes
    rect(x - 9, by + 18 + legLeftOff, 9, 5, '#0e1214');
    rect(x + 1, by + 18 + legRightOff, 9, 5, '#0e1214');

    // Torso: Stout, Rotund Belly in Light Blue Business Shirt!
    // Protruding round belly
    rect(x - 14, by - 8, 28, 17, '#c6dbe3'); // light blue shirt
    rect(x - 13, by - 7, 26, 16, '#d9ebf2');
    // Belly bulge curve
    rect(x - 11, by - 3, 22, 13, '#e5f3f7');
    // Dark belt with gold buckle on big stomach
    rect(x - 12, by + 7, 24, 4, '#1b1f22');
    rect(x - 3, by + 6, 6, 6, COLORS.yellow); // gold buckle

    // Dark crimson necktie resting over the big belly
    rect(x - 2, by - 8, 4, 15, '#781c20');
    rect(x - 1, by - 4, 2, 11, '#9e272d');

    // Plump Arms with short sleeves
    rect(x - 15, by - 6, 5, 8, '#d9ebf2'); // short sleeve
    rect(x + 10, by - 6, 5, 8, '#d9ebf2');
    rect(x - 15, by + 2, 5, 8, '#dfb08c'); // bare forearm & hands
    rect(x + 10, by + 2, 5, 8, '#dfb08c');

    // Leather clipboard / KPI report in hand
    rect(x + 13, by - 2, 9, 13, '#57371d');
    rect(x + 15, by, 6, 9, COLORS.paper);

    // Head / Face: Completely BALD with shiny glare!
    rect(x - 9, by - 25, 18, 17, '#dfb08c');
    // Smooth rounded bald scalp
    rect(x - 8, by - 29, 16, 5, '#dfb08c');
    rect(x - 6, by - 31, 12, 3, '#dfb08c');
    // Bright white glare highlight on shiny bald head!
    rect(x - 2, by - 30, 6, 2, '#ffffff');
    rect(x + 1, by - 29, 2, 2, '#ffffff');

    // Double chin
    rect(x - 6, by - 9, 12, 3, '#c99673');

    // Stern bushy eyebrows
    rect(x - 7, by - 22, 6, 3, '#211c19');
    rect(x + 1, by - 22, 6, 3, '#211c19');

    // Glasses
    rect(x - 7, by - 19, 6, 5, COLORS.ink);
    rect(x + 1, by - 19, 6, 5, COLORS.ink);
    rect(x - 5, by - 18, 3, 3, '#e8f7fa'); // lens glare
    rect(x + 3, by - 18, 3, 3, '#e8f7fa');
    rect(x - 1, by - 18, 2, 2, COLORS.ink); // bridge

    // Thick moustache
    rect(x - 6, by - 13, 12, 4, '#241b16');

    // Inspection badge / title
    if (boss.state === 'inspect') {
      const alertBlink = Math.floor(performance.now() / 200) % 2 === 0;
      rect(x - 20, by - 44, 40, 13, alertBlink ? COLORS.red : '#9c211e');
      pixelText('! ПРОВЕРКА', x, by - 37, COLORS.white, 7, 'center');
    } else {
      drawNameplate('ФЕДОР ПАВЛОВИЧ', x, by - 38, COLORS.red);
    }
  }

  function drawActionBadge(text, x, y, color) {
    const width = text.length * 6.5 + 18;
    rect(x - width / 2, y - 6, width, 14, 'rgba(10, 18, 22, 0.94)');
    rect(x - width / 2, y - 6, 3, 14, color);
    pixelText(text, x + 1, y + 1, COLORS.white, 7.5, 'center');
  }

  function drawNameplate(text, x, y, color, size = 6.5) {
    const width = text.length * size * 0.86 + 14;
    rect(x - width / 2, y - 5, width, 11, 'rgba(10, 18, 22, 0.92)');
    rect(x - width / 2, y - 5, 2, 11, color);
    pixelText(text, x + 1, y + 1, COLORS.white, size, 'center');
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(Math.round(p.x), Math.round(p.y), Math.round(p.size), 0, TAU);
      ctx.fill();
    }
  }

  function drawSpriteByHeight(sprite, centerX, feetY, height) {
    const scale = height / sprite.naturalHeight;
    const width = sprite.naturalWidth * scale;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sprite, Math.round(centerX - width / 2), Math.round(feetY - height), Math.round(width), Math.round(height));
    ctx.restore();
  }

  function drawAtlasSprite(atlas, index, centerX, feetY, height) {
    const cellW = atlas.naturalWidth / 2;
    const cellH = atlas.naturalHeight / 2;
    const sourceX = (index % 2) * cellW;
    const sourceY = Math.floor(index / 2) * cellH;
    const width = height * (cellW / cellH);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      atlas,
      sourceX, sourceY, cellW, cellH,
      Math.round(centerX - width / 2), Math.round(feetY - height), Math.round(width), Math.round(height),
    );
    ctx.restore();
  }

  function drawOfficeAtmosphere() {
    const progress = clamp((clockMinutes - SHIFT_START) / TOTAL_SHIFT_MINUTES, 0, 1);
    const tint = progress < 0.28
      ? 'rgba(73, 147, 174, 0.10)'
      : progress < 0.72
        ? 'rgba(227, 239, 212, 0.015)'
        : 'rgba(185, 84, 71, 0.14)';
    ctx.save();
    ctx.beginPath(); ctx.rect(194, 0, 612, 108); ctx.clip();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = tint;
    ctx.fillRect(194, 0, 612, 108);
    ctx.restore();
  }

  // --- INTEGRATED IN-GAME CANVAS HUD (960x540) ---
  function drawInGameHUD() {
    // 1. Top HUD Bar Background (x: 0, y: 0, w: 960, h: 48)
    const hudGrad = ctx.createLinearGradient(0, 0, 0, 48);
    hudGrad.addColorStop(0, 'rgba(8, 16, 20, 0.98)');
    hudGrad.addColorStop(1, 'rgba(14, 28, 34, 0.95)');
    ctx.fillStyle = hudGrad;
    ctx.fillRect(0, 0, W, 48);

    // Bottom gold accent line
    rect(0, 47, W, 2, '#d8aa40');
    rect(0, 49, W, 1, 'rgba(0,0,0,0.6)');

    // Left: High-Res Firdom Emblem (Green Shield with F)
    rect(12, 9, 28, 30, '#0c462a');
    rect(14, 11, 24, 26, '#1a8b54');
    pixelText('F', 26, 24, COLORS.white, 16, 'center');

    // Vikentiy Face Avatar (Skinny ponytail IT guy)
    rect(46, 9, 30, 30, '#1c2d33');
    rect(48, 11, 26, 26, '#dfb08c');
    rect(47, 8, 28, 7, '#2b1e17'); // ponytail hair
    // Dynamic mood
    const mood = stealth > 65 ? '◉_◉' : (stealth > 35 ? 'ಠ_ಠ' : 'X_X');
    pixelText(mood, 61, 25, COLORS.ink, 8, 'center');

    // Bar 1: НЕЗАМЕТНОСТЬ (STEALTH)
    const stealthW = 140;
    pixelText('НЕЗАМЕТНОСТЬ', 86, 17, COLORS.paper, 9.5);
    pixelText(`${Math.round(stealth)}%`, 224, 17, stealth < 35 ? COLORS.red : COLORS.yellow, 10, 'right');
    rect(86, 25, stealthW, 14, '#0c1619');
    const curStealthW = Math.round((stealth / 100) * (stealthW - 2));
    const stealthColor = stealth > 60 ? COLORS.yellow : (stealth > 30 ? '#e68a35' : COLORS.red);
    rect(87, 26, curStealthW, 12, stealthColor);

    // Bar 2: ПОЛЕЗНОСТЬ (KPI / USEFULNESS)
    const workW = 130;
    pixelText('ПОЛЕЗНОСТЬ KPI', 238, 17, COLORS.paper, 9.5);
    pixelText(`${Math.round(usefulness)}%`, 366, 17, COLORS.green, 10, 'right');
    rect(238, 25, workW, 14, '#0c1619');
    const curWorkW = Math.round((usefulness / 100) * (workW - 2));
    rect(239, 26, curWorkW, 12, COLORS.green);

    // Coffee Boost Badge (if active)
    if (player.coffeeBoost > 0) {
      rect(380, 10, 110, 28, '#59391e');
      rect(381, 11, 108, 26, '#82552d');
      pixelText(`☕ КОФЕ ${Math.ceil(player.coffeeBoost)}s`, 435, 24, COLORS.white, 9.5, 'center');
    }

    // Center: Digital Clock & Shift Timer
    const clockStr = timeString(clockMinutes);
    rect(500, 8, 150, 32, '#0a1316');
    rect(501, 9, 148, 30, '#15252a');
    pixelText(clockStr, 575, 20, COLORS.white, 15, 'center');
    pixelText('СРЕДА · СМЕНА ДО 19:30', 575, 33, COLORS.yellow, 7, 'center');

    // Right: Boss Monitor / Radar
    const bossAlert = boss.state === 'inspect';
    const bossBoxW = 280;
    const bossBoxX = W - bossBoxW - 12;
    rect(bossBoxX, 8, bossBoxW, 32, bossAlert ? '#4a1316' : '#112227');
    rect(bossBoxX + 1, 9, bossBoxW - 2, 30, bossAlert ? '#751a1f' : '#1a333a');

    // Boss bald avatar
    rect(bossBoxX + 4, 11, 26, 26, '#dfb08c');
    rect(bossBoxX + 12, 11, 8, 3, '#ffffff'); // shiny bald glare
    rect(bossBoxX + 7, 23, 14, 4, '#241b16'); // moustache
    pixelText('ФП', bossBoxX + 17, 18, COLORS.ink, 8, 'center');

    if (bossAlert) {
      const alertFlash = Math.floor(performance.now() / 250) % 2 === 0;
      pixelText('🚨 ТРЕВОГА! НАЧАЛЬНИК ИДЁТ!', bossBoxX + 38, 24, alertFlash ? COLORS.white : COLORS.yellow, 10);
    } else {
      pixelText('ФЕДОР П.: ОБХОД ЭТАЖА', bossBoxX + 38, 24, COLORS.paper, 10);
    }

    // 2. Bottom Log Window (Left, y: 440 to 495)
    if (logEntries.length > 0) {
      rect(34, 442, 360, 58, 'rgba(8, 16, 20, 0.94)');
      rect(34, 442, 3, 58, COLORS.cyan);
      for (let i = 0; i < Math.min(3, logEntries.length); i++) {
        const e = logEntries[i];
        const color = e.kind === 'good' ? COLORS.green : (e.kind === 'bad' ? COLORS.red : COLORS.paper);
        const yPos = 454 + i * 16;
        pixelText(e.time, 44, yPos, COLORS.grayLight, 9);
        pixelText(e.text.length > 48 ? e.text.slice(0, 48) + '…' : e.text, 86, yPos, color, 9);
      }
    }

    // 3. Bottom Context Action Tooltip (Center, y: 480)
    const act = getActionInfo();
    if (act) {
      const prompt = act.prompt;
      const pillW = prompt.length * 7.5 + 32;
      const pillX = 580 - pillW / 2;
      rect(pillX, 476, pillW, 26, 'rgba(8, 16, 20, 0.96)');
      rect(pillX, 476, pillW, 2, COLORS.yellow);
      rect(pillX, 500, pillW, 2, COLORS.yellow);
      pixelText(prompt, 580, 489, COLORS.white, 10.5, 'center');
    }
  }

  function draw() {
    if (officeArtwork.complete && officeArtwork.naturalWidth) {
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(officeArtwork, 0, 0, W, H);
      ctx.restore();
      drawOfficeAtmosphere();
      drawCoworkersOnArtwork();
    } else {
      drawSkyAndMountains();
      drawFloorAndZones();
      drawFurniture();
    }
    drawInteractionGuides(); // Highlight pipeline
    drawBoss();
    drawPlayer();
    drawParticles();
    drawInGameHUD();

    // Red flash when caught
    if (boss.flash > 0) {
      rect(0, 0, W, H, `rgba(224, 68, 62, ${boss.flash * 0.38})`);
    }
  }

  function loop(t) {
    const dt = Math.min(0.05, (t - last) / 1000 || 0);
    last = t;
    if (mode === 'playing') update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  // Keyboard and Button Handlers
  window.addEventListener('keydown', (e) => {
    const key = getControlKey(e);
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'w', 'a', 's', 'd', 'e', 'h', 'p', 'enter'].includes(key)) {
      e.preventDefault();
    }
    if (key === 'p') {
      pauseGame();
      return;
    }
    if ((mode === 'menu' || mode === 'ended') && key === 'enter') {
      startGame();
      return;
    }
    if (mode !== 'playing') return;

    if (key === 'e') {
      interact();
      return;
    }
    if (key === 'h') {
      quickHide();
      return;
    }
    keys.add(key);
  });

  window.addEventListener('keyup', (e) => {
    keys.delete(getControlKey(e));
  });

  ui.start.addEventListener('click', startGame);
  ui.resume.addEventListener('click', pauseGame);
  ui.restart.addEventListener('click', startGame);

  if (window.location.hash === '#play' || window.location.search.includes('play')) {
    startGame();
  } else {
    setMode('menu');
  }
  requestAnimationFrame(loop);
})();

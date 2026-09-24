// «Не палься» — игровой цикл, механики, ИИ начальника и рендер персонажей.
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

  function loadImage(src) { const i = new Image(); i.src = src; return i; }
  const img = {
    vik: loadImage('assets/vikentiy-walk-v2.png'),
    boss: loadImage('assets/fedor-walk-v2.png'),
    coworkers: loadImage('assets/coworkers-v2.png'),
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
    playerSpeed: 92,
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
    catchStealth: 22,
    catchKpi: 6,
    workKpi: 2.0,
    workKpiCoffee: 2.8,
    watchedKpiMultiplier: 3,   // начальник смотрит, как ты работаешь — KPI растёт втрое
    kpiDecay: 0.25,            // работа копится, если не работать
    firstCheck: [14, 20],
    checkInterval: [17, 27],
    chatCooldown: 30,
  };

  // ---------- ВВОД ----------
  const keys = new Set();
  const physicalKeyAliases = {
    KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd',
    KeyE: 'e', KeyH: 'h', KeyP: 'p', Space: 'e',
  };
  const russianKeyAliases = { ц: 'w', ф: 'a', ы: 's', в: 'd', у: 'e', р: 'h', з: 'p' };
  function getControlKey(event) {
    const key = (event.key || '').toLowerCase();
    return physicalKeyAliases[event.code] || russianKeyAliases[key] || key;
  }
  window.NP_getControlKey = getControlKey; // для автотеста раскладок

  // ---------- ЗВУК (Web Audio, без файлов) ----------
  let audioCtx = null;
  function getAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }
  function tone(type, f0, f1, dur, vol, delay = 0) {
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
    } catch (_) { /* звук необязателен */ }
  }

  // ---------- DOM ----------
  const $ = id => document.getElementById(id);
  const ui = {
    overlay: $('screen-overlay'), pause: $('pause-overlay'), end: $('end-overlay'), endCard: $('end-card'),
    start: $('start-btn'), resume: $('resume-btn'), restart: $('restart-btn'),
    toast: $('toast'), endKicker: $('end-kicker'), endTitle: $('end-title'), endCopy: $('end-copy'), endStats: $('end-stats'),
    todo: $('todo-list'), log: $('log-list'), perks: $('perk-list'), grade: $('end-grade'),
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
  const coworkers = WD.coworkers.map((c, i) => ({
    ...c, x: c.desk.seatX, y: c.desk.y - 1, cooldown: 0, talkTimer: 0, idleTimer: 6 + i * 4, alert: 0,
  }));

  let mode = 'menu';
  let clockMinutes = CFG.shiftStart;
  let shiftTime = 0;
  let stealth = 80;
  let usefulness = 30;
  let fun = 0;
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
  let uiDirty = true;

  function resetStats() {
    stats = { coffees: 0, cigarettes: 0, videos: 0, fridge: 0, chats: 0, chatted: new Set(), catches: 0, inspectPass: 0, praise: 0, plantHideInspect: 0, printed: 0, workedSeconds: 0 };
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
    uiDirty = true;
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
  function floater(x, y, text, color) { floaters.push({ x, y, text, color, t: 0 }); }
  function puff(x, y, color, n = 6, spread = 8, vy = -14) {
    for (let i = 0; i < n; i++) {
      particles.push({ x: x + (rand() - 0.5) * spread, y, vx: (rand() - 0.5) * 8, vy: vy - rand() * 10, size: 1.5 + rand() * 1.5, life: 0.9 + rand() * 0.5, maxLife: 1.4, color });
    }
  }

  function setMode(next) {
    mode = next;
    ui.overlay.classList.toggle('hidden', next !== 'menu');
    ui.pause.classList.toggle('hidden', next !== 'paused');
    ui.end.classList.toggle('hidden', next !== 'ended');
  }

  function pickTodo() {
    const pool = LINES.todoPool.slice();
    const out = [];
    while (out.length < 5 && pool.length) out.push({ ...pool.splice(Math.floor(rand() * pool.length), 1)[0], done: false });
    return out;
  }
  function todoProgress(t) {
    switch (t.id) {
      case 'coffee3': return stats.coffees;
      case 'chatAll': return stats.chatted.size;
      case 'youtube2': return stats.videos;
      case 'smoke2': return stats.cigarettes;
      case 'inspect2': return stats.inspectPass;
      case 'plantHide': return stats.plantHideInspect;
      case 'fridge': return stats.fridge;
      case 'printer': return stats.printed;
      case 'kpi70': return Math.round(usefulness);
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
        fun += 8;
        playSound('success');
        toast(`✔ Выполнено: ${t.text}! +8 кайфа`, 2.6);
        addLog(`Список дел: «${t.text}» — готово.`, 'good');
        floater(player.x, player.y - 70, '✔ ДЕЛО СДЕЛАНО', '#f2bb38');
        uiDirty = true;
      }
    }
  }

  function resetGame() {
    rngSeed = Math.floor(Date.now() % 100000);
    clockMinutes = CFG.shiftStart;
    shiftTime = 0;
    stealth = 80;
    usefulness = 30;
    fun = 0;
    resetStats();
    nextBossCheck = CFG.firstCheck[0] + rand() * (CFG.firstCheck[1] - CFG.firstCheck[0]);
    intelTimer = 0;
    coverTokens = 0;
    particles = []; floaters = []; bubbles = []; logEntries = [];
    todo = pickTodo();
    Object.assign(player, { x: SEAT.x, y: WD.ROW1_Y + 62, action: 'none', actionTimer: 0, coffeeBoost: 0, speed: CFG.playerSpeed, chatWith: null, hideSpot: null, facingX: -1 });
    Object.assign(boss, { x: WD.bossHome.x, y: WD.bossHome.y, state: 'office', stateTimer: 5, path: [], target: null, suspicion: 0, catchCooldown: 0, quoteTimer: 4, praiseTimer: 0, warned: false, facing: Math.PI / 2 });
    coworkers.forEach((c, i) => { c.cooldown = 0; c.talkTimer = 0; c.idleTimer = 5 + i * 3; c.alert = 0; });
    addLog('08:50 — Викентий пришёл в БЦ «Турар». Хвостик поправлен.');
    addLog('Федор Павлович пьёт чай в кабинете. Пока.');
    setMode('playing');
    toast('Смена началась! Слоняйся, кайфуй, но когда Ф.П. рядом — сиди в Excel.', 4);
    uiDirty = true;
  }
  function startGame() { playSound('click'); resetGame(); }
  function pauseGame() {
    playSound('click');
    if (mode === 'playing') setMode('paused');
    else if (mode === 'paused') setMode('playing');
  }

  // ---------- ВЗАИМОДЕЙСТВИЯ ----------
  const HIDDEN = new Set(['plant_hide', 'cabinet_hide', 'printer_hide']);
  const SLACK = new Set(['smoke', 'youtube', 'fridge', 'chat']);
  function nearestPlant() {
    let best = null;
    for (const p of WD.plants) {
      const d = Math.hypot(player.x - p.x, player.y - p.y);
      if (d < 26 && (!best || d < best.d)) best = { p, d };
    }
    return best && best.p;
  }
  function currentZone() {
    return WD.zones.find(z => rectContains(z, player.x, player.y));
  }
  function coworkerById(id) { return coworkers.find(c => c.id === id); }

  function getActionInfo() {
    if (player.action === 'plant_hide') return { prompt: 'E / H — вылезти из листвы', target: player.hideSpot };
    if (player.action === 'cabinet_hide') return { prompt: 'E / H — выйти из-за шкафов', target: 'archive' };
    if (player.action === 'printer_hide') return { prompt: 'E / H — вылезти из-за ксерокса', target: 'printer' };
    if (player.action === 'chat') return { prompt: 'Болтаете… (шаг — прервать)', target: `chat_${player.chatWith}` };
    const plant = nearestPlant();
    if (plant) return { prompt: `E / H — спрятаться: ${plant.label}`, target: plant.id, plant };
    const z = currentZone();
    if (!z) return null;
    const prompts = {
      desk: player.action === 'work' ? 'E — встать из-за стола' : 'E — сесть за стол и открыть Excel',
      coffee: player.coffeeBoost > 0 ? 'E — ещё эспрессо (кофеин не кончился)' : 'E — сварить эспрессо (+35% к скорости)',
      fridge: 'E — пошарить в холодильнике (кайф, но палевно)',
      water: 'E — налить воды из кулера',
      smoke: player.action === 'smoke' ? 'E — потушить сигарету' : 'E — перекур с видом на горы',
      archive: 'E / H — затаиться за шкафами',
      printer: 'E — распечатать мем · H — спрятаться за ксероксом',
      server: player.action === 'youtube' ? 'E — закрыть вкладку' : 'E — YouTube на гигабитном канале',
    };
    if (z.type === 'chat') {
      const c = coworkerById(z.coworker);
      return { prompt: c.cooldown > 0 ? `${c.name} занят(а) · ещё ${Math.ceil(c.cooldown)} с` : `E — поболтать с ${c.name === 'Айаршын' ? 'Айаршын' : c.name + 'ом'}`, target: z.id, zone: z };
    }
    return { prompt: prompts[z.type], target: z.id, zone: z };
  }

  function startAction(action, seconds) {
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
    if (a === 'smoke' && reason === 'done') stats.cigarettes++;
    if (a === 'youtube' && reason === 'done') stats.videos++;
    if (a === 'printer' && reason === 'done') { stats.printed++; floater(player.x, player.y - 64, 'МЕМ НАПЕЧАТАН', '#bfe3f0'); }
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
    if (c.perk === 'report') { usefulness = clamp(usefulness + 8, 0, 100); floater(player.x, player.y - 64, '+8 KPI', '#57d08a'); }
    if (c.perk === 'snack') { stealth = clamp(stealth + 10, 0, 100); floater(player.x, player.y - 64, '+10 НЕЗАМЕТНОСТИ', '#f2bb38'); }
    playSound('success');
    toast(LINES.perks[c.perk], 3.2);
    addLog(`Поболтал с ${c.name}. ${LINES.perks[c.perk]}`, 'good');
    uiDirty = true;
  }

  function interact() {
    const info = getActionInfo();
    if (player.action === 'plant_hide' || player.action === 'cabinet_hide' || player.action === 'printer_hide') {
      playSound('hide');
      if (player.action === 'plant_hide' && player.hideSpot) { player.y = player.hideSpot.y + 14; }
      if (player.action === 'printer_hide') player.y = 452;
      if (player.action === 'cabinet_hide') player.x = 70;
      endAction('cancel');
      toast('Викентий вылез из укрытия.', 1.4);
      return;
    }
    if (player.action === 'chat') return;
    if (!info) { toast('Здесь пусто. Ищи подсказку внизу экрана — она появляется у активных мест.', 2.2); return; }

    if (info.plant) {
      const p = info.plant;
      player.hideSpot = { x: p.x, y: p.y };
      player.x = p.x; player.y = p.y - 2;
      startAction('plant_hide', 0);
      playSound('hide');
      puff(p.x, p.y - 20, 'rgba(90,160,90,0.8)', 6, 20, -6);
      toast(`Спрятался: ${p.label}. Для Ф.П. тебя нет.`, 2.2);
      return;
    }
    const z = info.zone;
    switch (z.type) {
      case 'desk':
        if (player.action === 'work') { endAction('cancel'); player.y = WD.FLOOR_TOP + 20; toast('Excel свёрнут. Риск открыт.', 1.5); return; }
        player.x = SEAT.x; player.y = SEAT.y;
        startAction('work', 0);
        playSound('click');
        addLog('Викентий открыл Excel. Пальцы стучат по формулам.', 'good');
        toast('Сидишь в Excel. Если Ф.П. увидит — KPI полетит вверх втрое!', 2.6);
        break;
      case 'coffee':
        startAction('coffee', 2.2);
        stats.coffees++;
        player.coffeeBoost = CFG.coffeeSeconds;
        fun += 5; usefulness = clamp(usefulness + 1, 0, 100);
        playSound('coffee');
        puff(119, WD.FLOOR_TOP - 20, 'rgba(255,255,255,0.7)', 8);
        floater(player.x, player.y - 64, '+5 КАЙФ · СКОРОСТЬ', '#e8b070');
        addLog(`Кофе №${stats.coffees}. Кофеин бодрит.`, 'good');
        checkTodo();
        break;
      case 'water':
        startAction('water', 1.8);
        fun += 2; stealth = clamp(stealth + 2, 0, 100);
        playSound('coffee');
        puff(218, 206, 'rgba(120,200,250,0.9)', 5, 8, -8);
        floater(player.x, player.y - 64, '+2 КАЙФ', '#8fd0f0');
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
      case 'printer':
        startAction('printer', 3.5);
        playSound('click');
        say('player', pick(LINES.thoughts.printer), 3);
        fun += 3; usefulness = clamp(usefulness + 2, 0, 100);
        break;
      case 'server':
        if (player.action === 'youtube') { endAction('cancel'); toast('Вкладка закрыта.', 1.4); return; }
        startAction('youtube', 8);
        playSound('click');
        say('player', pick(LINES.thoughts.youtube), 3.2);
        addLog('Серверная: 4K-ролик на гигабитном канале.', 'bad');
        break;
      case 'chat': {
        const c = coworkerById(z.coworker);
        if (c.cooldown > 0) { say(c.id, pick(['Отстань, я занят(а)!', 'Потом, дедлайн!', 'Не сейчас, Ф.П. бдит.']), 2.2); return; }
        const pair = pick(LINES.chat[c.id]);
        player.chatWith = c.id;
        player.chatPair = pair;
        startAction('chat', 6.5);
        say('player', pair[0], 3);
        c.talkTimer = 6.5;
        addLog(`Викентий подкатил поболтать к ${c.name}.`, 'info');
        break;
      }
      default: break;
    }
  }

  function quickHide() {
    const plant = nearestPlant();
    const z = currentZone();
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

  // ---------- ИИ НАЧАЛЬНИКА ----------
  function bossGoTo(target, state, desc) {
    boss.state = state;
    boss.target = { x: target.x, y: target.y };
    boss.path = findPath(boss, target);
    boss.spotDesc = desc || boss.spotDesc;
  }
  function startInspection() {
    boss.warned = false;
    const raid = rand() < 0.3;
    boss.mode = raid ? 'raid' : 'desk';
    boss.visitedSpots = 0;
    if (raid) bossGoTo(pick(WD.patrolSpots), 'inspect', 'рейд по этажу');
    else bossGoTo(DESK_FRONT, 'inspect', 'твой стол');
    playSound('alarm');
    say('boss', pick(LINES.boss.alarm), 3);
    addLog('🚨 Ф.П. пошёл с проверкой!', 'bad');
    toast(raid ? 'ТРЕВОГА! Рейд по этажу — прячься или беги в Excel!' : 'ТРЕВОГА! Ф.П. идёт к твоему столу — садись в Excel!', 3.4);
    // коллеги предупреждают, если Викентий рядом
    for (const c of coworkers) {
      if (Math.hypot(player.x - c.x, player.y - c.y) < 150) { say(c.id, pick(LINES.coworkerWarn), 2.4, '#ffd4c8'); break; }
    }
  }
  function playerVisibleToBoss() {
    if (HIDDEN.has(player.action)) return false;
    const d = dist(boss, player);
    const range = boss.state === 'inspect' ? CFG.visionRangeInspect : CFG.visionRange;
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

  function caught() {
    if (coverTokens > 0) {
      coverTokens = 0;
      boss.suspicion = 0;
      boss.catchCooldown = 4;
      say('ayarshyn', 'Федор Павлович, он по моему поручению!', 3, '#ffd4c8');
      say('boss', 'Ну... ладно. Смотрите мне!', 2.6);
      addLog('Айаршын прикрыла Викентия. Залёт прощён.', 'good');
      toast('Айаршын прикрыла! Залёт прощён.', 2.6);
      uiDirty = true;
      return;
    }
    stats.catches++;
    stealth = clamp(stealth - CFG.catchStealth, 0, 100);
    usefulness = clamp(usefulness - CFG.catchKpi, 0, 100);
    boss.suspicion = 0;
    boss.catchCooldown = 5;
    boss.state = 'lecture';
    boss.stateTimer = 2.6;
    boss.path = [];
    boss.facing = Math.atan2(player.y - boss.y, player.x - boss.x);
    flash = 0.9;
    shake = 0.5;
    playSound('caught');
    say('boss', pick(LINES.boss.caught), 3);
    floater(player.x, player.y - 70, `СПАЛИЛИ! −${CFG.catchStealth}`, '#ff6a5a');
    addLog('❌ СПАЛИЛИ! Ф.П. застал Викентия без дела.', 'bad');
    toast('ТЕБЯ СПАЛИЛИ! Незаметность падает.', 3);
    if (player.action !== 'none' && player.action !== 'work') endAction('cancel');
    uiDirty = true;
  }

  function finishDeskInspection() {
    if (playerIsWorking()) {
      stats.inspectPass++;
      usefulness = clamp(usefulness + 8, 0, 100);
      stealth = clamp(stealth + 6, 0, 100);
      stats.praise++;
      say('boss', pick(LINES.boss.praise), 3);
      floater(player.x, player.y - 70, 'ПРОВЕРКА ПРОЙДЕНА +8 KPI', '#57d08a');
      playSound('success');
      addLog('Проверка пройдена: Викентий «считал риски».', 'good');
    } else {
      stealth = clamp(stealth - 10, 0, 100);
      say('boss', pick(LINES.boss.emptyDesk), 3);
      addLog('Ф.П. нашёл пустое кресло. −10 незаметности.', 'bad');
      toast('Начальник у пустого стола. −10 незаметности.', 2.4);
    }
    if (HIDDEN.has(player.action) && player.action === 'plant_hide') stats.plantHideInspect++;
    checkTodo();
    uiDirty = true;
  }

  function endInspection() {
    nextBossCheck = CFG.checkInterval[0] + rand() * (CFG.checkInterval[1] - CFG.checkInterval[0]);
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

    if (mode === 'playing' && boss.state !== 'inspect' && boss.state !== 'lecture') {
      nextBossCheck -= dt;
      if (nextBossCheck < 2.5 && !boss.warned) {
        boss.warned = true;
        say('boss', 'Кхм-кхм...', 1.8);
        playSound('ahem');
      }
      if (nextBossCheck <= 0) startInspection();
    }

    switch (boss.state) {
      case 'office':
        boss.moving = false;
        boss.facing = Math.PI / 2;
        if (boss.quoteTimer <= 0) { say('boss', pick(LINES.boss.office), 2.6, '#e8e2d0'); boss.quoteTimer = 10 + rand() * 6; }
        if (boss.stateTimer <= 0) bossGoTo(pick(WD.patrolSpots), 'patrol');
        break;
      case 'patrol':
        if (followPath(dt, CFG.bossSpeed)) { boss.state = 'look'; boss.stateTimer = 2 + rand() * 2; boss.lookTimer = 0; }
        break;
      case 'look':
        boss.moving = false;
        lookAround(dt);
        if (boss.stateTimer <= 0) {
          if (rand() < 0.22) bossGoTo(WD.bossHome, 'return', 'кабинет');
          else bossGoTo(pick(WD.patrolSpots), 'patrol');
        }
        break;
      case 'return':
        if (followPath(dt, CFG.bossSpeed)) { boss.state = 'office'; boss.stateTimer = 7 + rand() * 6; boss.x = WD.bossHome.x; boss.y = WD.bossHome.y; }
        break;
      case 'inspect':
        if (boss.inspectTimer > 0) {
          boss.moving = false;
          boss.inspectTimer -= dt;
          if (boss.mode === 'desk') boss.facing = -Math.PI / 2; else lookAround(dt);
          if (boss.inspectTimer <= 0) {
            if (boss.mode === 'desk') { finishDeskInspection(); endInspection(); }
            else if (boss.visitedSpots < 2) { boss.visitedSpots++; bossGoTo(pick(WD.patrolSpots), 'inspect', 'рейд по этажу'); }
            else { addLog('Рейд окончен. Ф.П. выдохся.', 'info'); endInspection(); }
          }
        } else if (followPath(dt, CFG.bossInspectSpeed)) {
          boss.inspectTimer = boss.mode === 'desk' ? 3.2 : 2.2;
          boss.lookTimer = 0;
        }
        break;
      case 'lecture':
        boss.moving = false;
        if (boss.stateTimer <= 0) endInspection();
        break;
      default: break;
    }

    // Подозрение
    const seen = mode === 'playing' && playerVisibleToBoss();
    boss.seesPlayer = seen;
    let rate = -CFG.suspicionDecay;
    if (seen && boss.state !== 'lecture' && boss.state !== 'office') {
      if (boss.state === 'inspect' && !playerIsWorking()) rate = CFG.suspicionInspect;
      else if (SLACK.has(player.action)) rate = CFG.suspicionSlack;
    }
    const before = boss.suspicion;
    boss.suspicion = clamp(boss.suspicion + rate * dt, 0, 100);
    if (before === 0 && boss.suspicion > 0) { playSound('suspect'); if (rand() < 0.5) say('boss', pick(LINES.boss.suspicious), 1.6); }
    if (boss.suspicion >= 100 && boss.catchCooldown <= 0) caught();

    // Видит, что работаешь — KPI растёт втрое, иногда хвалит
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
      say('boss', nearCw && rand() < 0.5 ? LINES.boss.coworker[coworkers.indexOf(nearCw)] : pick(LINES.boss.patrol), 3.2);
      boss.quoteTimer = 8 + rand() * 7;
    }
  }

  // ---------- ИГРОК ----------
  function updatePlayer(dt) {
    let dx = 0;
    let dy = 0;
    if (keys.has('arrowleft') || keys.has('a')) dx -= 1;
    if (keys.has('arrowright') || keys.has('d')) dx += 1;
    if (keys.has('arrowup') || keys.has('w')) dy -= 1;
    if (keys.has('arrowdown') || keys.has('s')) dy += 1;

    if (player.coffeeBoost > 0) {
      player.coffeeBoost = Math.max(0, player.coffeeBoost - dt);
      player.speed = CFG.playerSpeed * (player.coffeeBoost > 0 ? CFG.coffeeBoost : 1);
    }
    player.bumpCooldown = Math.max(0, player.bumpCooldown - dt);

    player.moving = false;
    if (dx || dy) {
      if (player.action !== 'none' && player.action !== 'coffee' && player.action !== 'water') {
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
    if (a === 'work') {
      const base = player.coffeeBoost > 0 ? CFG.workKpiCoffee : CFG.workKpi;
      const mult = boss.watchingWork ? CFG.watchedKpiMultiplier : 1;
      usefulness = clamp(usefulness + base * mult * dt, 0, 100);
      stealth = clamp(stealth + 0.4 * dt, 0, 100);
      stats.workedSeconds += dt;
      kpiTick -= dt;
      if (boss.watchingWork && kpiTick <= 0) { floater(player.x + (rand() - 0.5) * 20, player.y - 58, '+KPI ×3', '#57d08a'); playSound('kpi'); kpiTick = 0.5; }
    } else {
      usefulness = clamp(usefulness - CFG.kpiDecay * dt, 0, 100);
    }
    if (a === 'smoke') {
      fun += 4 * dt;
      if (rand() < 0.5) particles.push({ x: player.x + 10 * player.facingX, y: player.y - 40, vx: 12 + rand() * 10, vy: -8 - rand() * 8, size: 2 + rand() * 2, life: 1.5, maxLife: 1.5, color: 'rgba(230,230,230,0.6)' });
    } else if (a === 'youtube') { fun += 5 * dt; usefulness = clamp(usefulness - 0.8 * dt, 0, 100); }
    else if (a === 'fridge') fun += 3 * dt;
    else if (a === 'chat') {
      fun += 3 * dt;
      const c = coworkerById(player.chatWith);
      if (c && player.actionTimer < 3.4 && !player.chatReplied) { say(c.id, player.chatPair[1], 3.2); player.chatReplied = true; }
      if (player.actionTimer > 3.4) player.chatReplied = false;
    } else if (HIDDEN.has(a)) stealth = clamp(stealth + 0.5 * dt, 0, 100);
  }

  function updateCoworkers(dt) {
    for (const c of coworkers) {
      c.cooldown = Math.max(0, c.cooldown - dt);
      c.talkTimer = Math.max(0, c.talkTimer - dt);
      c.idleTimer -= dt;
      c.alert = Math.max(0, c.alert - dt);
      if (Math.hypot(boss.x - c.x, boss.y - c.y) < 90) c.alert = 1;
      if (c.idleTimer <= 0) {
        if (!c.talkTimer && !bubbles.some(b => b.owner === c.id) && rand() < 0.6) say(c.id, pick(LINES.coworkerIdle[c.id]), 2.4, '#eef6f4');
        c.idleTimer = 12 + rand() * 14;
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

    updatePlayer(dt);
    updateBoss(dt);
    updateCoworkers(dt);
    updateAmbient(dt);

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
    flash = Math.max(0, flash - dt);

    if (Math.floor(shiftTime * 2) !== Math.floor((shiftTime - dt) * 2)) { checkTodo(); uiDirty = true; }
    if (clockMinutes >= CFG.shiftEnd) finishGame('win');
    else if (stealth <= 0) finishGame('fired');
    else if (usefulness <= 0) finishGame('useless');
  }

  function gradeFor(score) {
    if (score >= 170) return ['S', 'Легенда опенспейса'];
    if (score >= 130) return ['A', 'Мастер имитации'];
    if (score >= 95) return ['B', 'Крепкий середнячок'];
    if (score >= 60) return ['C', 'Зелёный стажёр'];
    return ['D', 'Слишком честный'];
  }

  function finishGame(result) {
    if (mode !== 'playing') return;
    setMode('ended');
    const win = result === 'win';
    ui.endCard.classList.toggle('good', win);
    ui.endCard.classList.toggle('bad', !win);
    const done = todo.filter(t => t.done).length;
    const score = Math.round(fun + usefulness * 0.8 + done * 12 - stats.catches * 10);
    const [grade, title] = gradeFor(score);
    ui.endKicker.textContent = win ? 'СМЕНА ОКОНЧЕНА · 19:30' : 'КРИТИЧЕСКИЙ ЗАЛЁТ';
    ui.endTitle.textContent = win ? 'ТЫ ВЫЖИЛ!' : (result === 'fired' ? 'ТЕБЯ УВОЛИЛИ!' : 'УВОЛЕН ЗА KPI!');
    if (win) {
      ui.endCopy.textContent = usefulness > 60
        ? '«Викентий, вы — опора рисков!» — Ф.П. хлопает по плечу. За окном горит Кок-Тобе, а ты даже немного поработал.'
        : 'Ты дожил до 19:30. Огни Алматы, пробки на Аль-Фараби и ни одного лишнего отчёта.';
    } else if (result === 'fired') {
      ui.endCopy.textContent = 'Ф.П. сверил логи прокси и записи камер: перекуры, ролики и холодильник Влада. Пропуск заблокирован.';
    } else {
      ui.endCopy.textContent = 'KPI упал до нуля: отчёты копились, пока ты кайфовал. «Голодранцы нам не нужны!» — сказал Ф.П.';
    }
    ui.grade.innerHTML = win ? `<b>${grade}</b><span>${title} · ${score} очков</span>` : '';
    ui.grade.classList.toggle('hidden', !win);
    ui.endStats.innerHTML = [
      [`${Math.round(usefulness)}%`, 'KPI'],
      [Math.round(fun), 'кайфа'],
      [stats.catches, 'раз спалился'],
      [`${done}/${todo.length}`, 'дел из списка'],
      [stats.chats, 'разговоров'],
      [stats.praise, 'похвал Ф.П.'],
    ].map(s => `<div class="end-stat"><b>${s[0]}</b><span>${s[1]}</span></div>`).join('');
    playSound(win ? 'success' : 'caught');
    addLog(win ? '19:30 — смена окончена. Свобода!' : 'Трудовой договор расторгнут.', win ? 'good' : 'bad');
  }

  // ---------- DOM-ПАНЕЛЬ ----------
  function renderPanel() {
    if (!uiDirty) return;
    uiDirty = false;
    ui.todo.innerHTML = todo.map(t => {
      const prog = Math.min(t.goal, todoProgress(t));
      const count = t.goal > 1 ? ` <em>${prog}/${t.goal}</em>` : '';
      return `<li class="${t.done ? 'done' : ''}"><span class="box">${t.done ? '✔' : ''}</span>${t.text}${count}</li>`;
    }).join('');
    const perks = [];
    if (coverTokens) perks.push('<li><b>🛡 Прикрытие</b> Айаршын простит один залёт</li>');
    if (intelTimer > 0) perks.push(`<li><b>📅 Инсайд</b> Влад: проверка через ${Math.max(0, Math.ceil(nextBossCheck))} с</li>`);
    if (player.coffeeBoost > 0) perks.push(`<li><b>☕ Кофеин</b> ещё ${Math.ceil(player.coffeeBoost)} с</li>`);
    const cds = coworkers.filter(c => c.cooldown > 0).map(c => `${c.name} ${Math.ceil(c.cooldown)}с`);
    if (cds.length) perks.push(`<li class="muted">Заняты: ${cds.join(', ')}</li>`);
    ui.perks.innerHTML = perks.join('') || '<li class="muted">Поболтай с коллегами — у каждого свой бонус.</li>';
    ui.log.innerHTML = logEntries.map(e => `<li class="${e.kind}"><time>${e.time}</time>${e.text}</li>`).join('');
  }

  // ---------- РЕНДЕР ----------
  function R(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
  function T(text, x, y, size, color, align = 'center', weight = 700, font = FONT) {
    ctx.font = `${weight} ${size}px ${font}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }
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
    }
    for (const p of WD.plants) {
      const active = info && info.target === p.id;
      ctx.strokeStyle = active ? `rgba(120,230,130,${0.7 + Math.sin(t * 6) * 0.3})` : 'rgba(120,230,130,0.16)';
      ctx.lineWidth = active ? 1.5 : 1;
      ctx.beginPath(); ctx.ellipse(p.x, p.y + 2, 16, 6, 0, 0, TAU); ctx.stroke();
    }
  }

  function drawVisionCone() {
    if (mode === 'menu') return;
    const range = boss.state === 'inspect' ? CFG.visionRangeInspect : CFG.visionRange;
    const alert = boss.state === 'inspect';
    const sus = boss.suspicion / 100;
    // Конус обрезается стенами: лучи до первого препятствия
    const rays = 28;
    ctx.save();
    const grd = ctx.createRadialGradient(boss.x, boss.y, 6, boss.x, boss.y, range);
    const base = sus > 0.05 ? `255,${Math.round(170 - sus * 120)},60` : (alert ? '255,90,70' : '255,240,180');
    grd.addColorStop(0, `rgba(${base},${alert || sus > 0.05 ? 0.28 : 0.16})`);
    grd.addColorStop(1, `rgba(${base},0)`);
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

  function drawCoworker(c) {
    if (!ready(img.coworkers)) return;
    const t = performance.now() / 1000;
    let bob = Math.sin(t * 1.6 + c.x) * 0.5;
    if (c.id === 'vlad') bob = Math.abs(Math.sin(t * 5)) * -1.2; // качает головой под музыку
    if (c.alert) bob = -1.5; // выпрямились — начальник рядом
    drawStripFrame(img.coworkers, 4, c.sprite, c.x, c.desk.y + 18 + bob, false);
  }

  // Динамические детали, привязанные к спрайтам мебели
  const decor = {
    rack_row1: () => drawRackLeds(364, 26),
    rack_row2: () => drawRackLeds(476, 46),
    copier: () => {
      if (player.action === 'printer') {
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
    const pBase = player.action === 'work' ? DESK.y - 1 : (player.action === 'plant_hide' && player.hideSpot ? player.hideSpot.y - 1 : player.y);
    items.push({ y: pBase, draw: drawPlayer });
    items.push({ y: boss.state === 'office' ? WD.bossHome.y + 15 : boss.y, draw: drawBoss });
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.draw();
  }

  function entityHead(owner) {
    if (owner === 'player') {
      if (player.action === 'work') return { x: SEAT.x, y: DESK.y - 46 };
      if (player.action === 'plant_hide') return { x: player.x, y: player.y - 30 };
      return { x: player.x, y: player.y - 62 };
    }
    if (owner === 'boss') return boss.state === 'office' ? { x: boss.x, y: boss.y - 44 } : { x: boss.x, y: boss.y - 68 };
    const c = coworkerById(owner);
    return c ? { x: c.x, y: c.desk.y - 38 } : null;
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

  function drawBubbles() {
    for (const b of bubbles) {
      const head = entityHead(b.owner);
      if (!head) continue;
      const size = 7;
      const shown = b.text.slice(0, Math.ceil(b.text.length * Math.min(1, b.t * 3.5)));
      const lines = wrap(b.text, 130, size);
      const shownLines = wrap(shown, 130, size);
      ctx.font = `700 ${size}px ${FONT_SANS}`;
      const w = Math.max(...lines.map(l => ctx.measureText(l).width)) + 10;
      const h = lines.length * 9 + 6;
      const pop = Math.min(1, b.t * 8);
      const fade = b.t > b.dur - 0.3 ? (b.dur - b.t) / 0.3 : 1;
      let x = clamp(head.x - w / 2, 4, W - w - 4);
      const y = Math.max(52, head.y - h - 6);
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(head.x, y + h);
      ctx.scale(pop, pop);
      ctx.translate(-head.x, -(y + h));
      const isBoss = b.owner === 'boss';
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      roundRect(x + 1.5, y + 1.5, w, h, 3); ctx.fill();
      ctx.fillStyle = b.color;
      roundRect(x, y, w, h, 3); ctx.fill();
      ctx.strokeStyle = isBoss ? '#b3261e' : '#1c2a2e';
      ctx.lineWidth = isBoss ? 1.2 : 0.8;
      ctx.stroke();
      ctx.fillStyle = b.color;
      ctx.beginPath(); ctx.moveTo(head.x - 3, y + h - 0.5); ctx.lineTo(head.x + 3, y + h - 0.5); ctx.lineTo(head.x, y + h + 5); ctx.fill();
      shownLines.forEach((l, i) => T(l, x + 5, y + 7.5 + i * 9, size, isBoss ? '#5a1010' : '#14232a', 'left', 700, FONT_SANS));
      ctx.restore();
    }
  }

  function drawOverheads() {
    // Шкала подозрения над начальником
    if (mode !== 'menu' && boss.suspicion > 0 && boss.state !== 'office') {
      const x = boss.x, y = boss.y - 76;
      const s = boss.suspicion / 100;
      const icon = s > 0.7 ? '!' : '?';
      R(x - 14, y + 8, 28, 3.5, 'rgba(10,16,20,0.85)');
      R(x - 13.5, y + 8.5, 27 * s, 2.5, s > 0.7 ? '#ff4a3a' : '#f2bb38');
      T(icon, x, y, 11 + (s > 0.7 ? Math.sin(performance.now() / 60) * 1.5 : 0), s > 0.7 ? '#ff4a3a' : '#f2bb38', 'center', 900);
    } else if (boss.state === 'inspect' && !bubbles.some(b => b.owner === 'boss')) {
      const blink = Math.floor(performance.now() / 220) % 2 === 0;
      R(boss.x - 22, boss.y - 80, 44, 11, blink ? '#c62a22' : '#7a1612');
      T('ПРОВЕРКА', boss.x, boss.y - 74.3, 6.5, '#fff');
    }
    // Статус Викентия
    const labels = {
      work: ['EXCEL · РИСК-МОДЕЛИ', '#2f9a5a'], smoke: ['ПЕРЕКУР', '#b3261e'], youtube: ['▶ YOUTUBE 4K', '#b3261e'],
      fridge: ['ШАРИТ В ХОЛОДИЛЬНИКЕ', '#c9861e'], chat: ['БОЛТАЕТ', '#c9861e'], plant_hide: ['В ЛИСТВЕ', '#2f7a3a'],
      cabinet_hide: ['ЗА ШКАФАМИ', '#2a6a8a'], printer_hide: ['ЗА КСЕРОКСОМ', '#2a6a8a'], printer: ['ПЕЧАТЬ МЕМА', '#2a6a8a'],
    };
    const lab = labels[player.action];
    if (lab && !bubbles.some(b => b.owner === 'player')) {
      const head = entityHead('player');
      ctx.font = `700 6.5px ${FONT_SANS}`;
      const w = ctx.measureText(lab[0]).width + 10;
      R(head.x - w / 2, head.y - 12, w, 10, 'rgba(10,16,20,0.9)');
      R(head.x - w / 2, head.y - 12, 2, 10, lab[1]);
      T(lab[0], head.x + 1, head.y - 6.6, 6.5, '#fff', 'center', 700, FONT_SANS);
      if (player.actionTotal > 0 && player.actionTimer > 0) {
        const k = 1 - player.actionTimer / player.actionTotal;
        R(head.x - w / 2, head.y - 2, w, 2, 'rgba(10,16,20,0.9)');
        R(head.x - w / 2, head.y - 2, w * k, 2, '#f2bb38');
      }
    }
    // Имена коллег, когда Викентий рядом
    for (const c of coworkers) {
      if (Math.hypot(player.x - c.x, player.y - c.y) < 90 && !bubbles.some(b => b.owner === c.id)) {
        const tx = `${c.name} · ${c.role}`;
        ctx.font = `700 6px ${FONT_SANS}`;
        const w = ctx.measureText(tx).width + 8;
        R(c.x - w / 2, c.desk.y - 72, w, 9, 'rgba(10,16,20,0.82)');
        T(tx, c.x, c.desk.y - 67.3, 6, c.cooldown > 0 ? '#9aa' : '#f5edd9', 'center', 700, FONT_SANS);
      }
    }
    for (const f of floaters) {
      const a = 1 - f.t / 1.4;
      ctx.save(); ctx.globalAlpha = a;
      T(f.text, f.x + 0.6, f.y - f.t * 22 + 0.6, 7.5, 'rgba(0,0,0,0.7)', 'center', 900, FONT_SANS);
      T(f.text, f.x, f.y - f.t * 22, 7.5, f.color, 'center', 900, FONT_SANS);
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

  function drawLighting() {
    const p = dayProgress();
    // Вечером офис темнеет и желтеет от ламп
    if (p > 0.7) R(0, WD.HUD_H, W, H - WD.HUD_H, `rgba(40,25,50,${(p - 0.7) * 0.55})`);
    // Мигающая лампа дневного света над вторым рядом
    const flick = Math.sin(performance.now() / 43) + Math.sin(performance.now() / 97);
    if (flick > 1.55) R(450, 240, 220, 110, 'rgba(10,15,25,0.16)');
    // Виньетка
    const v = ctx.createRadialGradient(W / 2, H / 2 + 20, 260, W / 2, H / 2 + 20, 620);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = v;
    ctx.fillRect(0, WD.HUD_H, W, H - WD.HUD_H);
  }

  function bar(x, y, w, label, value, color, valueColor) {
    T(label, x, y, 7, '#f5edd9', 'left', 700, FONT_SANS);
    T(`${Math.round(value)}${label === 'КАЙФ' ? '' : '%'}`, x + w, y, 7.5, valueColor || color, 'right', 700);
    R(x, y + 5, w, 8, '#0b1417');
    R(x + 1, y + 6, (w - 2) * clamp(value / 100, 0, 1), 6, color);
    R(x + 1, y + 6, (w - 2) * clamp(value / 100, 0, 1), 1.5, 'rgba(255,255,255,0.25)');
  }

  function drawHUD() {
    const g = ctx.createLinearGradient(0, 0, 0, WD.HUD_H);
    g.addColorStop(0, '#0a1316'); g.addColorStop(1, '#13242a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, WD.HUD_H);
    R(0, WD.HUD_H - 2, W, 2, '#d8aa40');

    if (ready(img.emblem)) ctx.drawImage(img.emblem, 10, 8, 30, 30);
    T('ФИРДОМ', 46, 17, 6.5, '#f2bb38', 'left', 700, FONT_SANS);
    T('РИСКИ', 46, 26, 6.5, '#9fc', 'left', 700, FONT_SANS);
    T('7 ЭТАЖ', 46, 35, 5.5, '#789', 'left', 700, FONT_SANS);

    const sc = stealth > 60 ? '#f2bb38' : (stealth > 30 ? '#e68a35' : '#e8433e');
    bar(88, 14, 120, 'НЕЗАМЕТНОСТЬ', stealth, sc);
    bar(222, 14, 110, 'KPI', usefulness, usefulness < 20 ? '#e8433e' : '#57b867');
    bar(346, 14, 90, 'КАЙФ', Math.min(100, fun), '#c76ad8', '#e0a0f0');
    if (fun > 100) T(`${Math.round(fun)}`, 436, 14, 7.5, '#e0a0f0', 'right');

    // Часы
    R(452, 6, 118, 36, '#081012'); R(453, 7, 116, 34, '#122126');
    T(timeString(clockMinutes), 511, 19, 15, '#fff');
    R(460, 32, 102, 3, '#0b1417'); R(460, 32, 102 * dayProgress(), 3, '#f2bb38');
    T('СМЕНА ДО 19:30', 511, 38.5, 4.8, '#9fb', 'center', 700, FONT_SANS);

    // Радар начальника
    const x0 = 582;
    const alert = boss.state === 'inspect';
    R(x0, 6, W - x0 - 8, 36, alert ? '#4a1316' : '#0f2126');
    R(x0 + 1, 7, W - x0 - 10, 34, alert ? (Math.floor(performance.now() / 250) % 2 ? '#7a1a1f' : '#5f1418') : '#16303a');
    // мини-портрет
    R(x0 + 5, 10, 26, 28, '#e0b088'); R(x0 + 11, 11, 12, 2.5, '#fff'); R(x0 + 8, 24, 20, 3, '#3a2a1e'); R(x0 + 8, 18, 8, 3, '#222'); R(x0 + 20, 18, 8, 3, '#222'); R(x0 + 5, 33, 26, 5, '#9ab8e0'); R(x0 + 16, 33, 3, 5, '#c02a2a');
    const status = {
      office: 'Ф.П. в кабинете: чай и чак-чак',
      patrol: `Ф.П. идёт: ${boss.spotDesc}`,
      look: 'Ф.П. озирается по сторонам',
      return: 'Ф.П. возвращается в кабинет',
      inspect: boss.mode === 'desk' ? '🚨 ПРОВЕРКА! Идёт к твоему столу' : '🚨 РЕЙД ПО ЭТАЖУ!',
      lecture: 'Ф.П. читает нотацию',
    }[boss.state];
    T(status, x0 + 38, 17, 7, alert ? '#fff' : '#f5edd9', 'left', 700, FONT_SANS);
    // подозрение
    T('ПОДОЗРЕНИЕ', x0 + 38, 29, 5.5, '#9ab', 'left', 700, FONT_SANS);
    R(x0 + 80, 26, 120, 6, '#0b1417');
    R(x0 + 81, 27, 118 * (boss.suspicion / 100), 4, boss.suspicion > 70 ? '#ff4a3a' : '#f2bb38');
    if (boss.seesPlayer && mode === 'playing') T('👁 ВИДИТ ТЕБЯ', x0 + 206, 29, 5.5, '#ff8a7a', 'left', 700, FONT_SANS);
    const info = [];
    if (intelTimer > 0 && boss.state !== 'inspect') info.push(`📅 проверка через ${Math.max(0, Math.ceil(nextBossCheck))} с`);
    if (coverTokens) info.push('🛡 прикрытие');
    if (player.coffeeBoost > 0) info.push(`☕ ${Math.ceil(player.coffeeBoost)} с`);
    T(info.join('   '), x0 + 38, 37.5, 5.5, '#f2bb38', 'left', 700, FONT_SANS);

    // Контекстная подсказка
    const act = mode === 'playing' ? getActionInfo() : null;
    if (act) {
      ctx.font = `700 8.5px ${FONT_SANS}`;
      const w = ctx.measureText(act.prompt).width + 26;
      const x = W / 2 - w / 2;
      const y = H - 26;
      ctx.fillStyle = 'rgba(8,16,20,0.92)'; roundRect(x, y, w, 18, 4); ctx.fill();
      ctx.strokeStyle = '#f2bb38'; ctx.lineWidth = 1; ctx.stroke();
      T(act.prompt, W / 2, y + 9.4, 8.5, '#fff', 'center', 700, FONT_SANS);
    }
    // Мигающая рамка тревоги
    if (alert) {
      const a = 0.25 + Math.sin(performance.now() / 120) * 0.15;
      ctx.strokeStyle = `rgba(230,50,40,${a})`;
      ctx.lineWidth = 6;
      ctx.strokeRect(3, WD.HUD_H + 3, W - 6, H - WD.HUD_H - 6);
    }
  }

  function draw() {
    ctx.setTransform(S, 0, 0, S, 0, 0);
    ctx.imageSmoothingEnabled = false;
    if (shake > 0) ctx.translate((rand() - 0.5) * shake * 8, (rand() - 0.5) * shake * 8);
    R(0, 0, W, H, '#10181b');
    drawWindows();
    ctx.drawImage(art.staticLayer, 0, 0, W, H);
    ctx.drawImage(art.windowOverlay, 0, 0, W, WD.FLOOR_TOP);
    drawSunbeams();
    drawZoneHints();
    drawVisionCone();
    drawScene();
    drawParticles();
    drawLighting();
    drawOverheads();
    drawBubbles();
    ctx.setTransform(S, 0, 0, S, 0, 0);
    drawHUD();
    if (flash > 0) R(0, 0, W, H, `rgba(224,68,62,${flash * 0.35})`);
  }

  function loop(t) {
    const dt = Math.min(0.05, (t - last) / 1000 || 0);
    last = t;
    if (mode === 'playing') update(dt);
    else if (mode === 'menu') { updateBoss(dt); updateCoworkers(dt); updateAmbient(dt); bubbles.forEach(b => { b.t += dt; }); bubbles = bubbles.filter(b => b.t < b.dur); }
    draw();
    renderPanel();
    requestAnimationFrame(loop);
  }

  // ---------- ОБРАБОТЧИКИ ----------
  const MOVE_KEYS = ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'];
  window.addEventListener('keydown', e => {
    const key = getControlKey(e);
    if (MOVE_KEYS.includes(key) || ['e', 'h', 'p', 'enter', ' '].includes(key)) e.preventDefault();
    if (key === 'p' || key === 'escape') { if (mode === 'playing' || mode === 'paused') pauseGame(); return; }
    if (key === 'enter') {
      if (mode === 'menu' || mode === 'ended') { startGame(); return; }
      if (mode === 'paused') { pauseGame(); return; }
    }
    if (mode !== 'playing') return;
    if (e.repeat && (key === 'e' || key === 'h')) return;
    if (key === 'e') { interact(); return; }
    if (key === 'h') { quickHide(); return; }
    if (MOVE_KEYS.includes(key)) keys.add(key);
  });
  window.addEventListener('keyup', e => { keys.delete(getControlKey(e)); });
  window.addEventListener('blur', () => keys.clear());

  ui.start.addEventListener('click', startGame);
  ui.resume.addEventListener('click', pauseGame);
  ui.restart.addEventListener('click', startGame);

  // Отладочный доступ для автотестов (scripts/qa.js)
  window.NP_DEBUG = {
    get state() { return { mode, player: { ...player }, boss: { ...boss, path: boss.path.length }, stealth, usefulness, fun, clockMinutes, stats: { ...stats, chatted: stats.chatted.size }, todo, coverTokens, intelTimer }; },
    teleport(x, y) { player.x = x; player.y = y; },
    setBoss(x, y, state = 'look') { boss.x = x; boss.y = y; boss.state = state; boss.stateTimer = 99; boss.path = []; },
    skip(seconds) { for (let i = 0; i < seconds * 20 && mode === 'playing'; i++) update(0.05); },
    interact, quickHide, startInspection, blocked, findPath, nav,
  };

  if (window.location.hash === '#play' || window.location.search.includes('play')) startGame();
  else setMode('menu');
  requestAnimationFrame(loop);
})();

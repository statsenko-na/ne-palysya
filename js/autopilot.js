'use strict';
// «Не пались» — автопилот.
// Общие переменные и функции объявлены на верхнем уровне и видны из других скриптов игры (без обёртки и модулей).
// Порядок подключения — в index.html.

  // ---------- АВТОПИЛОТ ----------
  // Быкентий играет сам: зритель смотрит, читает реплики и угорает. WASD/стрелки — взять управление.
  const auto = { on: false, demo: false, goal: null, path: [], stuckT: 0, stuckN: 0, last: null, workT: 0, phoneT: 0, restartTimer: null };
  const zoneCenter = id => { const z = WD.zones.find(q => q.id === id); return z ? { x: z.x + z.w / 2, y: z.y + z.h / 2 } : null; };
  function autoGoal(kind, pt, extra = {}) { auto.goal = { kind, pt, ...extra }; auto.path = findPath(player, pt); auto.stuckT = 0; auto.stuckN = 0; }
  function autoDangerRaw() { return boss.state === 'inspect' || boss.state === 'waitDesk' || boss.warned || (boss.seesPlayer && boss.suspicion > 35); }
  // Автопилот реагирует как человек: с задержкой 0.4–1.6 с и иногда прозёвывает начало тревоги
  function autoDanger() {
    const raw = autoDangerRaw();
    if (!raw) { auto.reactAt = null; return false; }
    if (auto.reactAt == null) auto.reactAt = shiftTime + 0.4 + rand() * 1.2 + (rand() < 0.2 ? 2 : 0) + (auto.slow || 0); // slow — «медленный человек» для замеров баланса
    return shiftTime >= auto.reactAt;
  }
  function autoThink() {
    const z = id => zoneCenter(id);
    if (autoDanger()) {
      if (dist(player, SEAT) < 300 || boss.mode === 'desk' || day.hideCd > 0) { autoGoal('desk', z('desk')); return; } // укрытие на перезарядке — бегом за стол
      const pl = WD.plants.slice().sort((a, b) => dist(a, player) - dist(b, player))[0];
      autoGoal('hide', { x: pl.x, y: pl.y + 12 }); return;
    }
    if (eventIs('drill') && player.action !== 'evac') { autoGoal('exit', z('exit')); return; }
    if (eventIs('standup')) { autoGoal('standup', z('standup')); return; }
    if (eventIs('majik') && !officeEvent.used) { autoGoal('desk', z('desk'), { work: 6 }); return; }
    if ((eventIs('food') || eventIs('bday')) && !officeEvent.used) { autoGoal('feast', { x: 120, y: 236 }); return; }
    if (day.peeActive && day.pee > 25) { autoGoal('toilet', z('toilet')); return; }
    // Вечер, а план не сделан — сначала Excel, потом пиво
    const planLate = !planDone() && dayProgress() > 0.72;
    if (planLate) { autoGoal('desk', z('desk'), { work: 12 + rand() * 6 }); return; }
    if (day.beer) { autoGoal('exit', z('exit')); return; }
    if (canLunch()) { autoGoal('exit', z('exit')); return; }
    // План: отстаёшь от графика — иди работать; сделал — кайфуй
    if (!planDone() && usefulness < planTarget * dayProgress() + 6) { autoGoal('desk', z('desk'), { work: 9 + rand() * 5 }); return; }
    // Невыполненные задачи дня тянут автопилот к нужному месту: обычно идёт закрывать их сразу
    const want = autoTaskWants();
    if (rand() < 0.75) {
      if (want.coffee && !(eventIs('internet'))) { autoGoal('coffee', z('coffee')); return; }
      if (want.smoke) { autoGoal('smoke', { x: 870, y: 230 }); return; }
      if (want.toilet && !(day.toiletCd > 0)) { autoGoal('toilet', z('toilet')); return; }
      if (want.printer) { autoGoal('printer', { x: 470, y: 456 }); return; }
      if (want.fridge) { autoGoal('fridge', z('fridge')); return; }
      const need = coworkers.filter(c => want.chat.has(c.id) && !c.away && c.cooldown <= 0);
      if (need.length) { autoGoal('chat', zoneCenter(`chat_${need[0].id}`)); return; }
    }
    const opts = [
      ['desk', 3, () => autoGoal('desk', z('desk'), { work: 5 + rand() * 6 })],
      ['coffee', player.coffeeBoost > 0 && !want.coffee ? 0 : 2 + (want.coffee ? 6 : 0), () => autoGoal('coffee', z('coffee'))],
      ['smoke', 2 + (want.smoke ? 6 : 0), () => autoGoal('smoke', { x: 870, y: 230 })],
      ['server', eventIs('internet') ? 0 : 1.5, () => autoGoal('server', { x: 870, y: 436 })],
      ['fridge', 1 + (want.fridge ? 4 : 0), () => autoGoal('fridge', z('fridge'))],
      ['water', 1, () => autoGoal('water', z('water'))],
      ['printer', 0.8 + (want.printer ? 4 : 0), () => autoGoal('printer', { x: 470, y: 456 })],
      ['toilet', day.toiletCd > 0 ? 0 : 1 + (want.toilet ? 4 : 0), () => autoGoal('toilet', z('toilet'))],
      ['phone', 1, () => autoGoal('phone', { x: player.x, y: player.y })],
    ];
    const free = coworkers.filter(c => !c.away && !c.statist && c.cooldown <= 0);
    if (free.length) {
      const need = free.filter(c => want.chat.has(c.id));
      const c = (need.length ? need : free)[Math.floor(rand() * (need.length || free.length))];
      opts.push(['chat', 2.5 + (need.length ? 6 : 0), () => autoGoal('chat', zoneCenter(`chat_${c.id}`))]);
    }
    const sum = opts.reduce((a, o) => a + o[1], 0);
    let r = rand() * sum;
    for (const o of opts) { r -= o[1]; if (r <= 0) { o[2](); return; } }
    opts[0][2]();
  }
  // Что нужно для незакрытых задач дня
  function autoTaskWants() {
    const w = { chat: new Set() };
    const STAT_GOAL = { coffees: 'coffee', cigarettes: 'smoke', toilet: 'toilet', printed: 'printer', fridge: 'fridge' };
    for (const t of todo) {
      if (t.done) continue;
      if (STAT_GOAL[t.stat]) w[STAT_GOAL[t.stat]] = true;
      if (t.id === 'chatAimashyn') w.chat.add('aimashyn');
      if (t.id === 'chatHlad') w.chat.add('hlad');
    }
    return w;
  }
  function autoArrive() {
    const g = auto.goal;
    auto.goal = null;
    if (g.kind === 'phone') { startPhoneScrolling(); auto.phoneT = 4 + rand() * 4; return; }
    if (g.kind === 'hide') { quickHide(); if (!HIDDEN.has(player.action)) autoGoal('desk', zoneCenter('desk')); return; }
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
      if ((auto.workT > 0 && !canLunch()) || danger || (eventIs('majik') && !officeEvent.used)) return [0, 0]; // обед важнее отсидки в Excel
      player.y = SEAT.y; endAction('cancel');
    } else if (a === 'phone') {
      auto.phoneT -= dt;
      if (auto.phoneT > 0 && !danger) return [0, 0];
      finishPhoneScrolling();
      closePhonePanel();
    } else if (HIDDEN.has(a) && !AWAY.has(a)) {
      if (danger || boss.suspicion > 0 || (boss.state !== 'gone' && dist(boss, player) < 180)) return [0, 0];
      interact(); return [0, 0];
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
      if (blocked(player.x, player.y, player.r)) unstickPlayer();
      else if (auto.stuckN >= 2) { // упёрся в угол (у биотуалета, у шкафов архива) — шаг к ближайшему узлу навигации
        const n = WD.navNodes.filter(q => !blocked(q.x, q.y, player.r)).sort((p, q) => dist(p, player) - dist(q, player))[0];
        if (n && dist(n, player) < 90) { player.x = n.x; player.y = n.y; }
      }
      if (auto.stuckN > 3) { auto.goal = null; return [0, 0]; }
      auto.path = findPath(player, g.pt);
    }
    return [(wp.x - player.x) / d, (wp.y - player.y) / d];
  }
  function startAutopilot(seed) {
    stopAutopilot();
    playSound('click');
    enterFullscreen();
    auto.on = true; auto.demo = true; auto.goal = null; auto.path = []; // до resetGame: без утренней пробки
    resetGame(seed);
    toast('🍿 АВТОПИЛОТ: смотри и угорай. WASD или O — взять управление.', 3.2);
  }
  // O / кнопка 🍿 посреди смены: Быкентий доигрывает сам с того же места, WASD или O — вернуть управление
  function toggleAutopilot() {
    if (mode !== 'playing') return false;
    playSound('click');
    if (auto.on) { stopAutopilot('Управление у тебя. Автопилот выключен.'); return false; }
    autoUsed = true;
    auto.on = true; auto.demo = false; auto.goal = null; auto.path = []; auto.reactAt = null;
    keys.clear();
    toast('🍿 Автопилот включён: откинься и смотри. WASD или O — взять управление.', 3);
    return true;
  }
  function stopAutopilot(msg) {
    if (!auto.on) return;
    auto.on = false; auto.demo = false; auto.goal = null;
    clearTimeout(auto.restartTimer);
    if (msg) toast(msg, 2);
  }

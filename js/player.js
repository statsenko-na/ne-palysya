'use strict';
// «Не пались» — игрок и главный цикл обновления update().
// Общие переменные и функции объявлены на верхнем уровне и видны из других скриптов игры (без обёртки и модулей).
// Порядок подключения — в index.html.

  // ---------- ИГРОК ----------
  function updatePlayer(dt) {
    day.hideCd = Math.max(0, (day.hideCd || 0) - dt);
    if (COVER.has(player.action)) {
      player.hideT = (player.hideT || 0) + dt;
      if (player.hideT > CFG.hideMax) {
        endAction('cancel');
        day.hideCd = CFG.hideCooldown;
        say('player', pick(LINES.hideOut), 2.6);
        toast(`🌿 Хвостик торчит из укрытия! Прятаться снова можно через ${CFG.hideCooldown} с`, 2.6);
        addLog('Быкентий слишком долго сидел в укрытии — его стало видно.', 'bad');
      }
    }
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
    const movementSpeed = player.speed * (day.hungry ? 0.9 : 1) * (day.peeActive && day.pee >= 100 ? CFG.peeCriticalSpeed : 1);
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
      if (blocked(player.x, player.y, player.r)) unstickPlayer(); // вышел из укрытия/кабинки внутрь мебели — вытолкнуть
      const len = Math.hypot(dx, dy);
      dx /= len; dy /= len;
      if (Math.abs(dx) > 0.05) player.facingX = dx < 0 ? -1 : 1;
      const hit = moveWithCollision(player, dx * movementSpeed * dt, dy * movementSpeed * dt, player.r);
      if (hit && player.bumpCooldown <= 0) { playSound('bump'); player.bumpCooldown = 0.35; }
      player.walkTimer += dt * (player.coffeeBoost > 0 ? 11 : 8);
      player.moving = true;
    }

    if (player.actionTimer > 0) {
      player.actionTimer -= dt;
      if (player.actionTimer <= 0) endAction('done');
    }
    if (player.action === 'phone') tickPhoneMoment(dt);

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
          const step = Math.min(d, movementSpeed * 0.8 * dt);
          player.x += (tgt.x - player.x) / d * step; player.y += (tgt.y - player.y) / d * step;
          player.facingX = tgt.x < player.x ? -1 : 1;
          player.moving = true; player.walkTimer += dt * 8;
        } else player.facingX = -1;
      }
      day.knock -= dt;
      if (day.knock <= 0) { say('queue', pick(LINES.toilet.knock), 2.2, '#e8f0ff'); playSound('knock'); day.knock = 3.5 + rand() * 3; }
    }
    if (a === 'work') {
      // Рутина в Excel выматывает: кайф тает (гитара гасит половину) — на работе сложно кайфовать
      fun = Math.max(0, fun - CFG.workFunDrain * (has('guitar') ? 0.5 : 1) * dt);
      const base = player.coffeeBoost > 0 ? CFG.workKpiCoffee : CFG.workKpi;
      const gear = (has('chair') ? 1.2 : 1) * (has('monitor') ? 1.15 : 1) * (eventIs('noise') && !has('headphones') ? 0.7 : 1);
      const mult = (boss.watchingWork ? CFG.watchedKpiMultiplier : 1) * (eventIs('internet') ? 1.5 : 1) * gear * (day.peeActive && day.pee > 50 ? 0.7 : 1) * (day.hungry ? 0.85 : 1);
      const beforeWork = usefulness;
      addWork(base * mult * dt);
      const gained = usefulness - beforeWork;
      day.excelWorkAcc = (day.excelWorkAcc || 0) + gained;

      // Закрытие микрозадач в Excel: каждые 14 очков работы +4 кайфа
      if (day.excelWorkAcc >= 14) {
        day.excelWorkAcc -= 14;
        addFun(4);
        day.excelPoolTasks = (day.excelPoolTasks || 0) + 1;
        const taskName = pick(LINES.excelTasks);
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
      // Раз в смену: ~30 с сверхурочной работы после плана снимают сегодняшний выговор
      if (planDone() && reprimands > 0 && !day.overtimeUsed) {
        day.overtimeWork = (day.overtimeWork || 0) + dt;
        if (day.overtimeWork >= CFG.overtimeSeconds) {
          day.overtimeWork = 0; day.overtimeUsed = true;
          reprimands--;
          if (weekReprimands > 0) { weekReprimands--; store.set('weekReprimands', weekReprimands); }
          playSound('success');
          say('boss', 'Быкентий закрыл сверхурочный аудит! Ладно, старый выговор аннулирую. Но не расслабляться!', 3.5);
          floater(player.x, player.y - 70, '⭐ ВЫГОВОР АННУЛИРОВАН! (−1)', '#57d08a');
          banner = { text: 'ВЫГОВОР СНЯТ ✓', sub: 'Д.Н. оценил сверхурочный труд и аннулировал взыскание!', t: 0 };
          addLog('Сверхурочная работа: Д.Н. аннулировал выговор Быкентию!', 'good');
        }
      }

      stats.workedSeconds += dt;
      // План сделан, а Быкентий всё сидит в Excel без надобности — напомнить, что пора кайфовать
      if (planDone() && !boss.watchingWork) { day.overworkT = (day.overworkT || 0) + dt; if (day.overworkT > 15) hint('overwork', 'План уже сделан — Excel сейчас только прикрытие. Иди кайфуй!'); }
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
    shiftTime += dt * (onLunch() ? CFG.lunchTimeMul : 1); // на обеде время летит
    clockMinutes = CFG.shiftStart + (shiftTime / CFG.shiftSeconds) * (CFG.shiftEnd - CFG.shiftStart);
    intelTimer = Math.max(0, intelTimer - dt);
    // 17:00: если план отстаёт — одна подсказка, сколько осталось (дедлайн предсказуемый, а не внезапный)
    if (mode === 'playing' && !day.planWarned && clockMinutes >= 17 * 60) {
      day.planWarned = true;
      if (!planDone()) {
        const left = Math.ceil(planTarget - usefulness);
        const hrs = ((CFG.shiftEnd - clockMinutes) / 60).toFixed(1).replace('.', ',');
        const half = Math.max(0, Math.ceil(planTarget * CFG.planMinShare - usefulness));
        toast(half ? `💡 До половины плана ${half}, до 19:30 ~${hrs} ч. Меньше половины — выговор.` : `💡 Половина плана есть. До полного ещё ${left} (+20 очков).`, 3.6);
        addLog(half ? `17:00 — до минимума (половина плана) ещё ${half}. Не сделаешь к 19:30 — выговор.` : `17:00 — до полного плана ещё ${left}.`, half ? 'bad' : 'info');
      }
    }

    updatePlayer(dt);
    updateActionChoice(dt);
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
    if (clockMinutes >= 17 * 60 && !planMinDone()) hint('planLate', 'Нет даже половины плана, а уже 17:00! Меньше половины к 19:30 — выговор. Посиди в Excel, лучше на глазах у Д.Н.');
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
    const dMax = diff().dayReprimandsMax;
    const wMax = diff().weekReprimandsMax;
    if (clockMinutes >= CFG.shiftEnd) finishGame('win');
    else if (reprimands >= dMax || weekReprimands >= wMax) finishGame('fired');
  }

  function calculateCurrentShiftResult() {
    const momentBonus = shiftRulesetId === OFFICE_STORIES_RULESET_ID
      ? summarizeMoments(ensureMomentsExtension()).awarded
      : 0;
    const result = calculateShiftResult({
      fun,
      fullPlan: planDone(),
      done: todo.filter(t => t.done).length,
      reprimands,
      momentBonus,
    });
    return result.ok ? { ...result, rulesetId: shiftRulesetId } : result;
  }
  function formatShiftResultValue(value) {
    const rounded = Math.round(value * 10) / 10;
    const display = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
    return value > 0 ? `+${display}` : value < 0 ? `−${display.replace('-', '')}` : '0';
  }

  function goMunichBeer() {
    playSound('clink');
    addFun(25);
    addLog('🍺 Быкентий ушёл в «Мюнхен» на пиво. Неделя закрыта!', 'good');
    finishGame('munich');
  }

  function finishGame(result) {
    if (mode !== 'playing') return;
    closeActionChoice('shift_ended');
    // Конец смены: меньше половины плана — выговор (на лимите — увольнение); от половины — без выговора, но и без бонуса
    let planFailed = false;
    const dMax = diff().dayReprimandsMax;
    const wMax = diff().weekReprimandsMax;
    const planHalf = !planDone() && planMinDone();
    if (result === 'win' && !planDone() && !planHalf) {
      planFailed = true;
      reprimands++;
      weekReprimands++; store.set('weekReprimands', weekReprimands);
      addLog(`📝 ВЫГОВОР ${reprimands}/${dMax} (нед: ${weekReprimands}/${wMax}): не сделана даже половина плана (${Math.floor(usefulness)}/${planTarget}).`, 'bad');
      if (reprimands >= dMax || weekReprimands >= wMax) result = 'fired';
    }
    if (player.action === 'phone') finishPhoneMoment(false);
    clearSavedProgress();
    setMode('ended');
    const win = result === 'win' || result === 'munich';
    ui.endCard.classList.toggle('good', win);
    ui.endCard.classList.toggle('bad', !win);
    const done = todo.filter(t => t.done).length;
    const shiftResult = calculateCurrentShiftResult();
    const score = shiftResult.score;
    const { grade, breakdown } = shiftResult;
    ui.endTitle.textContent = win ? (planFailed ? 'ВЫЖИЛ, НО БЕЗ ПЛАНА' : planHalf ? 'ВЫЖИЛ, ПЛАН НЕ ДОБИТ' : 'ТЫ ВЫЖИЛ!') : 'ТЕБЯ УВОЛИЛИ!';
    if (win) {
      ui.endCopy.textContent = planFailed
        ? `Дожил до 19:30, но не сделал даже половину плана (${Math.floor(usefulness)}/${planTarget}) — выговор. «Кайфовать надо после работы, Быкентий!»`
        : planHalf ? `План сделан наполовину (${Math.floor(usefulness)}/${planTarget}): выговора нет, но и бонуса +20 тоже. «Завтра доделаешь, Быкентий».`
        : (reprimands === 0
          ? '«Отличная работа, вы — опора отдела!» План сделан, ни одного выговора. За окном горит Кок-Тобе.'
          : 'План сделан, до 19:30 дожил. Огни Алматы, пробки на Аль-Фараби и пара выговоров на память.');
    } else {
      ui.endCopy.textContent = planFailed
        ? `Выговор: не сделана и половина плана (${reprimands}/${dMax}, нед: ${weekReprimands}/${wMax}). «Бездельники нам не нужны!» Пропуск заблокирован.`
        : (weekReprimands >= wMax
          ? `Превышен недельный лимит выговоров (${weekReprimands}/${wMax})! Правление банка расторгло трудовой договор.`
          : `Превышен дневной лимит выговоров (${reprimands}/${dMax})! Начальник сверил записи камер и объяснительные. Пропуск заблокирован.`);
    }
    const bestKey = shiftRulesetId === OFFICE_STORIES_RULESET_ID
      ? `best.${shiftRulesetId}.${dayIndex}`
      : `best.${dayIndex}`;
    const best = store.get(bestKey, 0);
    const legacyBest = shiftRulesetId === OFFICE_STORIES_RULESET_ID ? store.get(`best.${dayIndex}`, 0) : 0;
    const record = win && score > best;
    if (record) store.set(bestKey, score);
    const dayName = today().name;
    const earned = shiftResult.coins;
    coins += earned;
    store.set('coins', coins);
    if (win && dayName === 'ПЯТНИЦА') { store.set('weekDone', true); weekReprimands = 0; store.set('weekReprimands', 0); }
    if (win) { dayIndex = dayIndex < DAYS.length - 1 ? dayIndex + 1 : 0; store.set('day', dayIndex); }
    ui.grade.innerHTML = win ? `<b>${grade.rank}</b><span>${grade.title} · ${score} очков${record ? ' · НОВЫЙ РЕКОРД!' : ` · рекорд ${Math.max(best, score)}`}${legacyBest > 0 ? ` · Старый рекорд, правила 0.24.1: ${legacyBest}` : ''}</span>` : '';
    ui.endResult.innerHTML = [
      ['Кайф', formatShiftResultValue(breakdown.fun)],
      ['План', `${formatShiftResultValue(breakdown.fullPlan)} · ${Math.floor(usefulness)}/${planTarget}`],
      ['Дела', `${formatShiftResultValue(breakdown.todos)} · ${done}/${todo.length}`],
      ['Истории и хитрости', formatShiftResultValue(breakdown.moments)],
      ['Выговоры', formatShiftResultValue(breakdown.reprimands)],
      ['Итог', `${score} очков`, 'total'],
    ].map(([label, value, className = '']) => `<div class="end-result-row ${className}"><span>${label}</span><b>${value}</b></div>`).join('');
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
      [`${reprimands}/${dMax} (нед: ${weekReprimands}/${wMax})`, 'выговоров'],
      [stats.chats, 'разговоров'],
      [stats.praise, 'похвал Д.Н.'],
    ].map(s => `<div class="end-stat"><b>${s[0]}</b><span>${s[1]}</span></div>`).join('');
    playSound(win ? 'success' : 'caught');
    if (auto.on) {
      clearTimeout(auto.restartTimer);
      const endedShiftId = shiftId;
      auto.restartTimer = setTimeout(() => { if (shiftId === endedShiftId && auto.on && mode === 'ended') startAutopilot(); }, 7000);
    }
    addLog(win ? '19:30 — смена окончена. Свобода!' : 'Трудовой договор расторгнут.', win ? 'good' : 'bad');
    // Недельный лимит исчерпан: переигровка дня увольняла бы сразу — неделя начинается заново
    if (!win && weekReprimands >= wMax) {
      weekReprimands = 0; store.set('weekReprimands', 0);
      dayIndex = 0; store.set('day', 0);
      addLog('Новая неделя: с понедельника с чистого листа.', 'info');
    }
  }

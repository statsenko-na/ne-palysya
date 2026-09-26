'use strict';
// «Не пались» — ИИ Директора Начальниковича, план на день, выговоры.
// Общие переменные и функции объявлены на верхнем уровне и видны из других скриптов игры (без обёртки и модулей).
// Порядок подключения — в index.html.

  // ---------- ИИ НАЧАЛЬНИКА ----------
  function bossGoTo(target, state, desc) {
    boss.state = state;
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
    if (onLunch()) return; // обед — Д.Н. не трогает
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
  const planMinDone = () => usefulness >= planTarget * CFG.planMinShare; // половина — минимум, чтобы не было выговора

  // ---------- ВЫГОВОРЫ ----------
  // Дневной или недельный лимит выговоров (DIFFICULTY) = уволен. Прикрытие Аймашына прощает один.
  function reprimand(reason, short) {
    if (mode !== 'playing' || onLunch()) return false; // на обеде Д.Н. не наказывает
    if (coverTokens > 0) {
      coverTokens = 0;
      say('aimashyn', 'Директор Начальникович, он по моему поручению!', 3, '#ffd4c8');
      setTimeout(() => { if (mode === 'playing') say('boss', 'Ну... ладно. Смотрите мне!', 2.6); }, 1200);
      addLog(`Аймашын отмазал Быкентия: «${short}» не засчитан.`, 'good');
      toast(`🛡 Аймашын прикрыл! Выговор за «${short}» не дали.`, 3);
      return false;
    }
    reprimands++;
    weekReprimands++;
    store.set('weekReprimands', weekReprimands);
    flash = 0.9; shake = 0.5;
    playSound('caught');
    const dMax = diff().dayReprimandsMax;
    const wMax = diff().weekReprimandsMax;
    banner = { text: `ВЫГОВОР ${reprimands}/${dMax} (НЕДЕЛЯ: ${weekReprimands}/${wMax})`, sub: reason, t: 0, bad: true };
    // Передышка: выговоры не идут очередью
    boss.suspicion = 0;
    boss.catchCooldown = Math.max(boss.catchCooldown, CFG.reprimandGrace);
    nextBossCheck = Math.max(nextBossCheck, CFG.reprimandGrace + 6);
    if (officeEvent && officeEvent.id === 'sb') officeEvent.watch = 0;
    addLog(`📝 ВЫГОВОР ${reprimands}/${dMax} (за неделю: ${weekReprimands}/${wMax}): ${reason}`, 'bad');
    if (reprimands === dMax - 1) hint('rep2', 'Остался 1 выговор до увольнения! Не попадайся в конус Д.Н. и будь на месте.');
    return true;
  }
  // Проверка стола: Д.Н. не застал на месте → счётчик; на лимите — выговор
  function missAtDesk(what) {
    if (onLunch()) return; // обед — спокойное время
    day.misses++;
    const lim = diff().missLimit;
    floater(player.x, player.y - 70, `НЕ ЗАСТАЛ НА МЕСТЕ ${Math.min(day.misses, lim)}/${lim}`, '#ff8a7a');
    addLog(`👀 ${what}: не застал на месте ${day.misses}/${lim}.`, 'bad');
    toast(`👀 ${what} — «не застал на месте» ${day.misses}/${lim}. На ${lim} — выговор.`, 3);
    playSound('suspect');
    if (day.misses >= lim) { day.misses = Math.min(lim - 1, diff().missKeep || 0); reprimand(`Д.Н. ${lim === 2 ? 'дважды' : `${lim} раз`} не застал тебя на месте`, 'не на месте'); }
  }

  function caught() {
    stats.catches++;
    const why = { smoke: 'курил на балконе', youtube: 'смотрел YouTube', fridge: 'шарил в холодильнике', chat: 'болтал', phone: 'сидел в телефоне', meme: 'смотрел мем Блеба' }[player.action];
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
    boss.waitT = diff().wait + (has('cactus') ? 1.5 : 0) + (boss.snus > 0 ? 2 : 0);
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
    if (boss.snus > 0) speed *= CFG.snusSpeed; // под снюсом Д.Н. ходит вразвалочку
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
    boss.moving = true;
    const prev = Math.floor(boss.walkTimer);
    boss.walkTimer += dt * (speed / 4.5); // 8 кадров = два шага ≈ 36 ед.: ноги не «скользят»
    if (prev !== Math.floor(boss.walkTimer) && Math.floor(boss.walkTimer) % 4 === 0) {
      particles.push({ x: boss.x + (rand() - 0.5) * 10, y: boss.y + 1, vx: (rand() - 0.5) * 6, vy: -2, size: 1.5, life: 0.4, maxLife: 0.4, color: boss.state === 'inspect' ? 'rgba(235,80,60,0.5)' : 'rgba(160,170,160,0.45)' });
    }
    return false;
  }

  function lookAround(dt) {
    boss.lookTimer += dt;
    boss.facing += Math.sin(boss.lookTimer * 1.6) * dt * 1.8;
  }

  function updateBoss(dt) {
    // Снюс: раз в 1–2 минуты Д.Н. закидывается — медленнее ходит, подозрение растёт слабее, у стола ждёт дольше
    boss.snus = Math.max(0, (boss.snus || 0) - dt);
    boss.snusCd = (boss.snusCd === undefined ? 40 + rand() * 40 : boss.snusCd) - dt;
    if (mode === 'playing' && boss.snusCd <= 0 && ['office', 'patrol', 'look'].includes(boss.state)) {
      boss.snus = CFG.snusSeconds; boss.snusCd = 70 + rand() * 50;
      if (boss.state !== 'office') { say('boss', pick(LINES.boss.snus), 3); floater(boss.x, boss.y - 60, 'ВКИНУЛСЯ СНЮСОМ · ДОБРЕЕ', '#9fe0b0'); }
      addLog('Д.Н. закинул снюс под губу. Следующие полминуты он добрее и медленнее.', 'info');
    }
    boss.stateTimer -= dt;
    boss.catchCooldown = Math.max(0, boss.catchCooldown - dt);
    boss.quoteTimer -= dt;
    boss.praiseTimer = Math.max(0, boss.praiseTimer - dt);

    if (mode === 'playing' && !onLunch() && !['inspect', 'waitDesk', 'lecture', 'leaving', 'gone', 'goout', 'out', 'scold', 'standup'].includes(boss.state) && !eventIs('call') && !eventIs('drill')) {
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
      if (rate > 0 && boss.snus > 0) rate *= CFG.snusSuspicion; // под снюсом добрее
    }
    const before = boss.suspicion;
    boss.suspicion = clamp(boss.suspicion + rate * dt, 0, 100);
    if (before === 0 && boss.suspicion > 0) {
      hint('suspicion', `«?» над Д.Н.: он видит, что ты бездельничаешь в его конусе. Уйди из конуса, сядь в Excel или спрячься (H).`);
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

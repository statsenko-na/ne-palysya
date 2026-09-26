'use strict';
// «Не пались» — офисные события, камеры СБ, обед, туалет, пятничное пиво.
// Общие переменные и функции объявлены на верхнем уровне и видны из других скриптов игры (без обёртки и модулей).
// Порядок подключения — в index.html.

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
  const FEAST_ZONE = { id: 'feast', type: 'feast', x: 76, y: 170, w: 90, h: 86 };
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
    officeEvent = { id, t: def.dur, used: false };
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
      scheduleShiftCallback(() => { if (mode === 'playing') say('asel', LINES.bday[1], 3); }, 1600);
      addLog(`Сбор на ДР: минус 5000 ₸. К плану это не прибавляет.`, 'bad');
    }
    if (id === 'heat') { text = has('fan') ? 'Жара! Но у тебя вентилятор 🌀. Кулер даёт больше кайфа.' : 'Жара: кайф копится медленнее. Кулер спасает. Можно пожаловаться Д.Н. у его двери.'; complainWave('heat'); }
    if (id === 'noise') { text = has('headphones') ? 'Перфоратор! Шумодав 🎧 спасает Excel. Д.Н. хуже слышит шорохи.' : 'Перфоратор: Excel медленнее, зато Д.Н. хуже замечает. Пожаловаться — у двери Д.Н.'; complainWave('noise'); }
    if (id === 'drill') {
      text = 'Алматы же! Все к выходу слева — жми E у двери «ВЫХОД», пока идут учения.';
      playSound('siren');
      if (!bossBusy() || boss.state === 'scold') bossGoOut(def.dur + 2, 'drill');
      say('boss', pick(LINES.boss.drill), 3);
      day.drillAwayTimer = 0.6;
      day.drillAwayIndex = 0;
    }
    if (id === 'standup') {
      text = 'Д.Н. собирает всех у доски (архив, слева внизу). Встань рядом и жми E!';
      if (!bossBusy()) { bossGoTo(WD.standupSpot, 'standup', 'летучка'); boss.stateTimer = def.dur; }
      say('boss', pick(LINES.boss.standup), 3);
    }
    if (id === 'sb') {
      text = 'Красные конусы камер — взгляд СБ. Не прокрастинируй в них: СБ доложит Д.Н. Работа и укрытия — безопасно.';
      officeEvent.watch = 0;
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
      scheduleShiftCallback(() => { if (mode === 'playing') say('player', pick(LINES.majik.down), 2.8); }, 1400);
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
      scheduleShiftCallback(() => { if (eventIs(kind) && !c.away) say(c.id, pick(LINES.complaints[kind]), 2.8, '#ffe6c8'); }, 400 + i * 1500);
    }
    scheduleShiftCallback(() => { if (eventIs(kind)) say('player', pick(LINES.thoughts[kind]), 2.8); }, 5200);
  }
  function endEvent() {
    const ev = officeEvent;
    officeEvent = null;
    if (!ev) return;
    if (ev.id === 'call') { nextBossCheck = Math.max(nextBossCheck, 6); if (boss.state === 'office') boss.stateTimer = 1.5; }
    if (ev.id === 'drill') {
      day.drillAwayTimer = 0;
      day.drillAwayIndex = coworkers.length;
      coworkers.forEach(c => { if (!day.lunchAway) c.away = !!c.remote; });
      if (player.action === 'evac') {
        endAction('done');
        player.x = WD.exitDoor.x + 8; player.y = WD.exitDoor.y;
      } else if (mode === 'playing' && !onLunch()) {
        addLog('Быкентий проигнорировал учения по землетрясению.', 'bad');
        missAtDesk('Не вышел на учения');
      }
    }
    if (ev.id === 'majik' && !ev.used && mode === 'playing' && !onLunch()) {
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
      } else if (mode === 'playing' && !onLunch()) {
        say('boss', 'А где Быкентий?! Опять пропустил летучку!', 3);
        missAtDesk('Пропустил летучку');
      }
      if (boss.state === 'standup') endInspection();
      checkTodo();
    }
  }
  function updateDrillAway(dt) {
    if (!eventIs('drill') || day.drillAwayIndex >= coworkers.length || day.drillAwayTimer <= 0) return;
    day.drillAwayTimer -= dt;
    while (day.drillAwayTimer <= 0 && day.drillAwayIndex < coworkers.length) {
      const c = coworkers[day.drillAwayIndex++];
      if (!c.ghost) { c.away = true; puff(c.x, c.y - 20, 'rgba(230,230,230,0.7)', 5, 10); }
      day.drillAwayTimer += 0.45;
    }
    if (day.drillAwayIndex >= coworkers.length) day.drillAwayTimer = 0;
  }
  function updateLunchAway(dt) {
    if (day.lunchAwayIndex >= coworkers.length || day.lunchAwayTimer <= 0) return;
    day.lunchAwayTimer -= dt;
    while (day.lunchAwayTimer <= 0 && day.lunchAwayIndex < coworkers.length) {
      const c = coworkers[day.lunchAwayIndex++];
      if (!eventIs('drill')) {
        if (!c.ghost) c.away = true;
        day.lunchAway = true;
      }
      day.lunchAwayTimer += 0.7;
    }
    if (day.lunchAwayIndex >= coworkers.length) day.lunchAwayTimer = 0;
  }
  function updateBeerAway(dt) {
    if (day.beer !== true || day.beerAwayIndex >= coworkers.length || day.beerAwayTimer <= 0) return;
    day.beerAwayTimer -= dt;
    while (day.beerAwayTimer <= 0 && day.beerAwayIndex < coworkers.length) {
      const c = coworkers[day.beerAwayIndex++];
      if (!c.ghost) { c.away = true; puff(c.x, c.y - 20, 'rgba(240,200,90,0.8)', 5, 10); }
      day.beerAwayTimer += 0.9;
    }
    if (day.beerAwayIndex >= coworkers.length) day.beerAwayTimer = 0;
  }
  function updateEvents(dt) {
    updateDrillAway(dt);
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
    } else if (!['inspect', 'goout', 'out'].includes(boss.state) && !lunchTime() && !onLunch()) {
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
    if (seen && SLACK.has(player.action)) ev.watch += dt; else ev.watch = Math.max(0, ev.watch - dt * 0.5);
    if (ev.watch >= 1.6) {
      ev.watch = 0;
      stats.sbReports = (stats.sbReports || 0) + 1;
      floater(player.x, player.y - 70, 'СБ ЗАПИСАЛА!', '#ff6a5a');
      reprimand('СБ записала, как ты бездельничаешь, и доложила Д.Н.', 'доклад СБ');
      playSound('alarm');
      say('player', pick(LINES.sb.caught), 2.6);
      addLog('🎥 СБ: «Сотрудник Быкентий, 7 этаж, прокрастинирует». Доложили Д.Н.', 'bad');
      if (boss.state !== 'gone' && boss.state !== 'out') {
        boss.suspicion = clamp(boss.suspicion + 40, 0, 99);
        if (!bossBusy()) bossGoTo({ x: player.x, y: player.y }, 'patrol', 'по звонку СБ');
        scheduleShiftCallback(() => { if (mode === 'playing') say('boss', pick(LINES.sb.boss), 2.8); }, 900);
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
  const lunchTime = () => clockMinutes >= CFG.lunchOpen - 5 && clockMinutes < CFG.lunchOpen + 60;
  const onLunch = () => player.action === 'lunch'; // Быкентий на обеде: час спокойствия, Д.Н. ничего не делает
  const canLunch = () => clockMinutes >= CFG.lunchOpen && clockMinutes < CFG.lunchClose && !day.fed;
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
      if (day.majikFail) { boss.suspicion = clamp(boss.suspicion + 30, 0, 99); scheduleShiftCallback(() => say('boss', 'Под контролем?! А Маджикистан?!', 2.8), 1200); }
      else { addWork(4); floater(player.x, player.y - 70, '+4 К ПЛАНУ', '#57d08a'); scheduleShiftCallback(() => say('boss', 'Вот это я понимаю, уверенность!', 2.6), 1200); }
    } else if (i === 1) {
      nextBossCheck += 15;
      floater(player.x, player.y - 70, 'ЧЕСТНО: ПРОВЕРКА НА 15 С ПОЗЖЕ', '#f2bb38');
      scheduleShiftCallback(() => say('boss', 'Хоть честно. Чини давай.', 2.6), 1200);
    } else {
      fun += 6;
      const c = coworkerById('sirgey');
      if (c) { c.cooldown = 120; scheduleShiftCallback(() => say('sirgey', 'Я?! У меня автошка лежит, я вообще ни при чём!', 3, '#ffd4c8'), 1400); }
      floater(player.x, player.y - 70, '+6 КАЙФ · СИРГЕЙ ОБИДЕЛСЯ', '#e0a0f0');
    }
    playSound('click');
    return true;
  }
  function updateSocial(dt) {
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
    updateLunchAway(dt);
    updateBeerAway(dt);
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
    updatePee(dt);
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

    // Ад-хок от правления (случается один раз в день между 12:00 и 15:30)
    if (!day.adhocDone && m >= day.adhocAt && !onLunch()) {
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
        if (day.aljaziraTimer <= 0 && !onLunch()) {
          day.aljaziraVisiting = true;
          day.aljaziraPhase = 'walk_to';
          day.aljaziraTimer = 110 + rand() * 60;
        }
      } else {
        if (day.aljaziraPhase === 'walk_to') {
          if (!aljaziraObj.path) { aljaziraObj.x = aljaziraObj.desk.seatX; aljaziraObj.y = aljaziraObj.desk.seatY; aljaziraObj.path = findPath(aljaziraObj, { x: DESK_FRONT.x + 18, y: DESK_FRONT.y }); }
          if (!walkPath(aljaziraObj, 44, dt)) {} else {
            aljaziraObj.path = null;
            day.aljaziraPhase = 'confront';
            day.aljaziraPhaseTimer = 3.8;
            // 20% — похвалит (+5 кайфа), 30% — нейтрально, 50% — наорёт (−5 кайфа)
            const r = rand();
            const disasterDue = !day.aljaziraDisasterDone && day.aljaziraDisasterAt >= 0 && clockMinutes >= day.aljaziraDisasterAt;
            const mood = day.aljaziraForceMood || (disasterDue ? 'disaster' : r < 0.2 ? 'good' : r < 0.5 ? 'neutral' : 'bad');
            day.aljaziraForceMood = null;
            if (mood === 'disaster') {
              day.aljaziraDisasterDone = true;
              playSound('caught'); flash = 0.9; shake = 0.8;
              say('aljazira', pick(LINES.aljazira.strike), 4.2, '#ff3030');
              fun = 0; usefulness = 0;
              banner = { text: 'АЛЬДЖАЗИРА: МАДЖИКИСТАН РУХНУЛ!', sub: 'Кайф сброшен до 0. План дня обнулён. Полный пересчёт!', t: 0, bad: true };
              toast('💥 АЛЬДЖАЗИРА: ВСЁ СГОРЕЛО! КАЙФ 0 · ПЛАН 0', 4.5);
              addLog('💥 Альджазира разнесла отдел: Маджикистан рухнул, кайф и план на нуле!', 'bad');
              scheduleShiftCallback(() => { if (mode === 'playing') say('player', 'Да е**ный в рот, Альджазира! За что?! Весь день заново?!', 3.5); }, 1400);
            } else if (mood === 'good') {
              fun = Math.min(100, fun + 5);
              say('aljazira', pick(LINES.aljazira.good), 3.5, '#9f9');
              addLog('💚 Альджазира неожиданно похвалила: кайф +5', 'good');
            } else if (mood === 'neutral') {
              say('aljazira', pick(LINES.aljazira.neutral), 3.5, '#ffd080');
            } else {
              fun = Math.max(0, fun - 5);
              say('aljazira', pick(LINES.aljazira.bad), 3.8, '#ff8080');
              addLog('💢 Альджазира наорала: кайф −5', 'bad');
            }
          }
        } else if (day.aljaziraPhase === 'confront') {
          day.aljaziraPhaseTimer -= dt;
          if (day.aljaziraPhaseTimer <= 0) {
            day.aljaziraPhase = 'walk_back';
          }
        } else if (day.aljaziraPhase === 'walk_back') {
          if (!aljaziraObj.path) aljaziraObj.path = findPath(aljaziraObj, { x: aljaziraObj.desk.seatX, y: aljaziraObj.desk.seatY });
          if (walkPath(aljaziraObj, 44, dt)) {
            aljaziraObj.path = null;
            aljaziraObj.x = aljaziraObj.desk.seatX;
            aljaziraObj.y = aljaziraObj.desk.y - 1; // обратно в кресло
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
    // За 5 минут до обеда (12:25) Быкентий зовёт всех
    if (!day.lunchCalled && m >= CFG.lunchOpen - 5) {
      day.lunchCalled = true;
      say('player', pick(LINES.lunch.call), 3.4);
      scheduleShiftCallback(() => { if (mode === 'playing') say('bleb', pick(LINES.lunch.reply), 2.6); }, 1300);
      scheduleShiftCallback(() => { if (mode === 'playing') say('aimashyn', pick(LINES.lunch.reply), 2.6); }, 2500);
    }
    if (!day.lunchOpen && m >= CFG.lunchOpen) {
      day.lunchOpen = true;
      banner = day.vilka
        ? { text: 'ОБЕД В «ВИЛКЕ» · СТЕЙКИ 🥩', sub: 'Четверг — стейк-день! Выход слева, E у двери до 14:00. Кайфа больше обычного.', t: 0 }
        : { text: 'ОБЕД · 12:30–14:00', sub: 'Бизнес-ланч в «Мюнхене»: выход слева, E у двери. Обед длится час. Пропустишь — голодный до вечера.', t: 0 };
      addLog(day.vilka ? 'Обед! Все рванули в «Вилку» за стейками.' : 'Обед! Коллеги потянулись в «Мюнхен» за хрючевом дня.', 'info');
      day.lunchAwayTimer = 1.2;
      day.lunchAwayIndex = 0;
    }
    // Д.Н. тоже уходит на обед — если не занят проверкой
    if (!day.bossLunch && m >= CFG.lunchOpen + 12 && !bossBusy() && boss.state !== 'standup') {
      day.bossLunch = true;
      bossGoOut(22 + rand() * 6, 'lunch');
      say('boss', pick(LINES.boss.lunchOut), 3);
    }
    if (day.lunchAway && m >= CFG.lunchOpen + 60) {
      day.lunchAway = false;
      coworkers.forEach(c => { if (!eventIs('drill')) c.away = !!c.remote; });
      addLog(day.vilka ? 'Коллеги вернулись из «Вилки», сытые и добрые.' : 'Коллеги вернулись из «Мюнхена». Кто-то жалеет о котлете.', 'info');
    }
    if (!day.fed && !day.hungry && m >= CFG.lunchClose) {
      day.hungry = true;
      say('player', pick(LINES.lunch.hungry), 3);
      toast('Пропустил обед: до вечера кайф −20%, Excel −15%, ходишь медленнее.', 3.4);
    }
    // Пятница: после отъезда Д.Н. коллеги иногда собираются в «Мюнхен» на пиво
    if (today().bossLeaves && day.beer === null && m >= CFG.beerAt) {
      day.beer = rand() < CFG.beerChance;
      if (day.beer) {
        banner = { text: 'ПЯТНИЧНОЕ ПИВО В «МЮНХЕНЕ»', sub: 'Коллеги идут пить пиво. Жми E у выхода — и неделя закрыта!', t: 0 };
        say('aimashyn', pick(LINES.munich.yes), 3);
        playSound('clink');
        day.beerAwayTimer = 1.5;
        day.beerAwayIndex = 0;
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

'use strict';
// «Не пались» — взаимодействия по E, достижения.
// Общие переменные и функции объявлены на верхнем уровне и видны из других скриптов игры (без обёртки и модулей).
// Порядок подключения — в index.html.

  // ---------- ВЗАИМОДЕЙСТВИЯ ----------
  const COVER = new Set(['plant_hide', 'cabinet_hide', 'printer_hide']);
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
  // «Приспичило»: 2–3 раза за смену надо дойти до синей кабинки
  function updatePee(dt) {
    if (AWAY.has(player.action) && player.action !== 'toilet') return;
    if (!day.peeActive) {
      if (day.peeLeft > 0 && clockMinutes >= day.peeAt && player.action !== 'toilet' && player.action !== 'queue') {
        day.peeActive = true; day.pee = 5; day.peeLeft--;
        say('player', pick(LINES.pee.start), 2.8);
        hint('pee', 'Быкентию приспичило! Дойди до синего биотуалета (юго-запад), пока шкала 🚽 не дошла до 100%.');
      }
      return;
    }
    if (player.action === 'toilet') return;
    const before = day.pee;
    day.pee = Math.min(100, day.pee + CFG.peeRise * dt * (player.action === 'queue' ? 0.5 : 1) * (player.coffeeBoost > 0 ? 1.3 : 1));
    if (before < 70 && day.pee >= 70) say('player', pick(LINES.pee.urgent), 2.6);
    if (day.pee >= 100) {
      day.peeActive = false; day.pee = 0;
      addFun(-CFG.peeFail);
      flash = 0.5; shake = 0.4; playSound('caught');
      say('player', pick(LINES.pee.fail), 3.4);
      banner = { text: 'НЕ ДОТЕРПЕЛ', sub: `Пришлось бежать в соседний БЦ. −${CFG.peeFail} кайфа`, t: 0, bad: true };
      addLog(`🚽 Не дотерпел до биотуалета. −${CFG.peeFail} кайфа и немного достоинства.`, 'bad');
      schedulePee();
    }
  }
  function schedulePee() {
    const left = Math.max(1, day.peeLeft);
    day.peeAt = clockMinutes + Math.max(40, (CFG.shiftEnd - 30 - clockMinutes) / left * (0.6 + rand() * 0.6));
  }
  // Идти по точкам пути (навигационный граф обходит мебель); true — дошёл
  function walkPath(o, speed, dt) {
    let step = speed * dt;
    while (o.path && o.path.length && step > 0) {
      const wp = o.path[0], d = dist(o, wp);
      if (d <= step) { o.x = wp.x; o.y = wp.y; o.path.shift(); step -= d; }
      else { o.x += (wp.x - o.x) / d * step; o.y += (wp.y - o.y) / d * step; o.facingX = wp.x < o.x ? -1 : 1; step = 0; }
    }
    return !o.path || !o.path.length;
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
    if (player.action === 'lunch') return { prompt: day.vilka ? 'Обед в «Вилке»: стейк, медиум, счастье…' : 'Обед в «Мюнхене»: жуёшь хрючево дня…', target: 'exit' };
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
      toilet: day.peeActive ? 'E — СРОЧНО в синюю кабинку! 🚽' : day.toiletCd > 0 ? `Биотуалет: пока не хочется (${Math.ceil(day.toiletCd)} с)` : 'E — встать в очередь в синюю кабинку',
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
    if (canLunch()) return day.vilka ? 'E — на стейки в «Вилку» 🥩 (час, Д.Н. не тронет)' : 'E — на обед в «Мюнхен» (час, Д.Н. не тронет). ЖУКИ КАЛОЕДЫ!';
    if (day.fed) return 'Уже пообедал. Хрючево переваривается.';
    if (clockMinutes < CFG.lunchOpen) return 'Выход на лестницу. Обед — с 12:30 до 14:00, раньше ни шагу.';
    return 'Выход на лестницу. Уйти на обед можно было до 14:00, теперь до 19:30 ни шагу.';
  }
  function startAction(action, seconds) {
    // Бесконечно сидеть в кустах нельзя: после «хвостик торчит» укрытия недоступны на время
    if (COVER.has(action) && day.hideCd > 0) { say('player', `Фикус ещё помнит мой хвостик… (${Math.ceil(day.hideCd)} с)`, 2); player.hideSpot = null; return; }
    if (COVER.has(action)) player.hideT = 0;
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
      if (day.peeActive) {
        day.peeActive = false; day.pee = 0; addFun(4); schedulePee();
        floater(player.x, player.y - 64, 'ПОЛЕГЧАЛО! +4 КАЙФ', '#8fd0f0');
        setTimeout(() => { if (mode === 'playing') say('player', pick(LINES.pee.relief), 2.8); }, 300);
      } else floater(player.x, player.y - 64, 'ПОЛЕГЧАЛО', '#8fd0f0');
    }
    if (a === 'lunch' && reason === 'done') {
      day.fed = true; day.hungry = false; stats.lunch++;
      const lf = day.vilka ? CFG.vilkaFun : CFG.lunchFun;
      addFun(lf);
      player.x = WD.exitDoor.x + 10; player.y = WD.exitDoor.y;
      say('player', pick(day.vilka ? LINES.lunch.vilkaThoughts : LINES.lunch.thoughts), 3);
      floater(player.x, player.y - 64, `СЫТ · +${lf} КАЙФА`, '#e8b070');
      addLog(day.vilka ? `Обед в «Вилке»: ${day.dish}. Вот это жизнь!` : `Обед в «Мюнхене»: ${day.dish}. Невкусно, но сытно.`, 'good');
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
        day.waterCups -= 1;
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
        if (canLunch()) {
          day.dish = pick(day.vilka ? LINES.lunch.vilka : LINES.lunch.dishes);
          startAction('lunch', CFG.lunchSeconds);
          // Час спокойствия: проверка, если шла, сворачивается, подозрение гаснет
          boss.suspicion = 0;
          if (['inspect', 'waitDesk', 'lecture'].includes(boss.state)) endInspection();
          boss.warned = false;
          nextBossCheck = Math.max(nextBossCheck, 12);
          addLog('Обед: целый час Д.Н. тебя не трогает.', 'good');
          say('player', day.vilka ? 'Стейки в «Вилке»! ЖУКИ КАЛОЕДЫ, за мной!' : 'ЖУКИ КАЛОЕДЫ, я на обед!', 2.4);
          toast(day.vilka ? `«Вилка»: ${day.dish}. Обед — ровно час.` : `«Мюнхен», бизнес-ланч: ${day.dish}. Обед — ровно час.`, 3);
          playSound('click');
          return;
        }
        toast(exitPrompt(), 2);
        return;
      case 'toilet': {
        if (day.toiletCd > 0 && !day.peeActive) { say('player', pick(LINES.toilet.busy), 2); return; }
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

// «Не пались» — баланс и данные недели: CFG, сложность, апгрейды, дни, открытие механик.
// Только данные, без состояния игры; game.js читает их из window.NP_CONFIG.
(() => {
  'use strict';

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
    lunchOpen: 12 * 60 + 30,   // обед каждый день: выйти с 12:30 до 14:00
    lunchClose: 14 * 60,
    lunchSeconds: 7.5,         // час игрового времени: на обеде часы идут втрое быстрее
    lunchTimeMul: 3,
    aljaziraDisasterChance: 0.35, // шанс, что сегодня Альджазира обнулит кайф и план (не чаще раза в день)
    vilkaFun: 20,              // четверг — стейки в «Вилке»: больше кайфа
    lunchFun: 8,
    toiletPerPerson: 2.2,      // очередь в туалет: секунд на человека
    toiletSeconds: 6,
    toiletCooldown: 45,
    peeCriticalDrain: 0.6,
    peeQueueDrain: 0.2,
    peeCriticalSpeed: 0.85,
    overtimeSeconds: 30,       // сверхурочные после плана: снять сегодняшний выговор (раз в смену)
    snusSeconds: 30,           // Д.Н. под снюсом: медленнее и добрее
    snusSpeed: 0.75,
    snusSuspicion: 0.6,
    hideMax: 25,               // сколько секунд подряд можно сидеть в укрытии
    hideCooldown: 20,          // потом укрытия недоступны
    workFunDrain: 1.0,         // Excel выматывает: −кайфа в секунду (гитара гасит половину)
    planMinShare: 0.5,         // к 19:30 нужна хотя бы половина плана, иначе выговор
    peeTimes: [2, 3],          // сколько раз за смену Быкентию приспичит
    peeRise: 1.8,              // рост «приспичило» в секунду (0–100): ~55 с до конфуза
    beerAt: 17 * 60 + 15,      // пятничное пиво после отъезда Д.Н.
    beerChance: 0.65,
    bdayFee: 10,               // сбор на ДР: минус кайф, KPI не даёт
  };

  // ---------- СЛОЖНОСТЬ ----------
  // Множители к базовому балансу: чаще проверки, дальше взгляд, быстрее подозрение, больше план.
  const DIFFICULTY = {
    // warn — за сколько секунд до проверки «Кхм-кхм»; wait — сколько Д.Н. ждёт у пустого стола; speed — его шаг на проверке
    // missLimit — сколько раз «не застал на месте» до выговора; missKeep — с чего счётчик начинается после такого выговора
    // (Ветеран: 1 — дальше каждый промах сразу выговор). Замер автопилотом с задержкой реакции +2.5 с: промахов за смену
    // 0.3 / 0.4 / 1.3 → выговор за «не застал» примерно в 0–7% / ~5% / ~40% смен.
    easy: { name: 'СТАЖЁР', check: 1.3, vision: 0.9, slack: 0.7, plan: 0.8, missLimit: 3, missKeep: 0, warn: 3.5, wait: 5, speed: 0.9, surprise: 0, dayReprimandsMax: 4, weekReprimandsMax: 7 },
    normal: { name: 'СОТРУДНИК', check: 0.8, vision: 1.05, slack: 1.1, plan: 1, missLimit: 2, missKeep: 0, warn: 2, wait: 2.5, speed: 1.15, surprise: 0.3, dayReprimandsMax: 3, weekReprimandsMax: 5 },
    hard: { name: 'ВЕТЕРАН', check: 0.65, vision: 1.2, slack: 1.4, plan: 1.2, missLimit: 2, missKeep: 1, warn: 1.5, wait: 2, speed: 1.3, surprise: 0.5, dayReprimandsMax: 2, weekReprimandsMax: 4 },
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
      news: 'Ядро: Д.Н. и его конус, твой стол и Excel, кофе, балкон, YouTube, укрытия, синий биотуалет. Цель — план и кайф без увольнения.',
      tasks: ['coffee1', 'smoke1', 'toilet', 'lunch', 'inspect1', 'reportMon'] },
    { name: 'ВТОРНИК', short: 'ВТ', plan: 70, mod: 'Обычный вторник. Подозрительно обычный.',
      news: 'Новое: коллеги первого ряда (E перед их столом) — у каждого бонус. Офисные события: угощение, созвон, ксерокс.',
      tasks: ['coffee1', 'smoke2', 'toilet', 'lunch', 'chatAimashyn', 'chatHlad', 'printReport'] },
    { name: 'СРЕДА', short: 'СР', plan: 70, mod: 'Среда — маленькая пятница: кайф ×1.25', funMul: 1.25,
      news: 'Новое: события — ДР, жара, перфоратор, учения. Алматинские дни: смог и пробка на Аль-Фараби.',
      tasks: ['coffee2', 'smoke3', 'toilet2', 'lunch', 'reportTurlo'] },
    { name: 'ЧЕТВЕРГ', short: 'ЧТ', plan: 80, mod: 'Аудит из головного офиса: Д.Н. видит дальше', visionMul: 1.15,
      news: 'Новое: второй ряд (Д.Н. отвлекается на бездельников), летучка с выбором, Маджикистан, камеры СБ.',
      tasks: ['coffee1', 'smoke1a', 'toilet', 'lunchVilka', 'majik', 'scold', 'hideAudit'] },
    { name: 'ПЯТНИЦА', short: 'ПТ', plan: 60, mod: 'Пятница! Д.Н. уедет «на встречу» в 17:00', funMul: 1.2, bossLeaves: 17 * 60,
      news: 'Пятница: в 17:00 Д.Н. уезжает, иногда коллеги зовут в «Мюнхен» на пиво. Итог недели по Маджикистану.',
      tasks: ['coffee3', 'smoke4', 'toilet', 'lunch', 'cleanFriday', 'planEarly', 'yogurt', 'praise2'] },
  ];
  // С какого дня (индекс) открывается механика
  const UNLOCK = { coworkers: 1, events1: 1, lunch: 0, events2: 2, almaty: 2, row2: 3, standup: 3, events3: 3 };
  const EVENT_TIER = { food: 'events1', call: 'events1', internet: 'events1', jam: 'events1', bday: 'events2', heat: 'events2', noise: 'events2', drill: 'events2', standup: 'events3', majik: 'events3', autoshka: 'events3', arrfr: 'events3', sb: 'events3' };
  const TASK_EVENT_PREREQUISITES = { majik: 'majik' };

  window.NP_CONFIG = { CFG, DIFFICULTY, UPGRADES, DAYS, UNLOCK, EVENT_TIER, TASK_EVENT_PREREQUISITES };
})();

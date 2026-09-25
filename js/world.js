// Геометрия этажа: стены, коллайдеры мебели, зоны, укрытия и навигационный граф.
// Все координаты — игровые единицы поля 960×540 (рендер идёт в 2× для чёткости).
(() => {
  'use strict';

  const W = 960;
  const H = 540;
  const HUD_H = 48;
  const FLOOR_TOP = 128;     // северная стена с окнами занимает 48..128
  const FLOOR_BOTTOM = 528;
  const LEFT = 14;
  const RIGHT = 946;

  // Стены: top — верхняя кромка (тёмная), face — видимая лицевая грань снизу.
  // Коллайдер стены = весь прямоугольник (кромка + грань), чтобы ноги не заходили «в стену».
  const walls = [
    // Внешний контур
    { x: 0, y: HUD_H, w: W, h: FLOOR_TOP - HUD_H, kind: 'north' },
    { x: 0, y: HUD_H, w: LEFT, h: H - HUD_H, kind: 'outer' },
    { x: RIGHT, y: HUD_H, w: W - RIGHT, h: H - HUD_H, kind: 'outer' },
    { x: 0, y: FLOOR_BOTTOM, w: W, h: H - FLOOR_BOTTOM, kind: 'outer' },
    // Кухня: восточная перегородка с проёмом y 158..212, южная с проёмом x 150..204
    { x: 236, y: FLOOR_TOP, w: 8, h: 30, kind: 'v' },
    { x: 236, y: 212, w: 8, h: 70, kind: 'v' },
    { x: LEFT, y: 262, w: 136, h: 20, kind: 'h', label: 'КУХНЯ' },
    { x: 204, y: 262, w: 40, h: 20, kind: 'h' },
    // Архив: северная перегородка с проёмом x 168..222, восточная сплошная
    { x: LEFT, y: 322, w: 154, h: 20, kind: 'h', label: 'АРХИВ' },
    { x: 222, y: 322, w: 22, h: 20, kind: 'h' },
    { x: 236, y: 342, w: 8, h: FLOOR_BOTTOM - 342, kind: 'v' },
    // Балкон: стеклянная перегородка с дверью y 186..246, южная стена
    { x: 786, y: FLOOR_TOP, w: 8, h: 58, kind: 'glass' },
    { x: 786, y: 246, w: 8, h: 76, kind: 'glass' },
    { x: 786, y: 322, w: RIGHT - 786, h: 20, kind: 'h', label: 'СЕРВЕРНАЯ · ТОЛЬКО IT' },
    // Серверная: западная стена с дверью y 410..458
    { x: 786, y: 342, w: 8, h: 68, kind: 'v' },
    { x: 786, y: 458, w: 8, h: FLOOR_BOTTOM - 458, kind: 'v' },
    // Кабинет начальника: северная стена с дверью x 600..644, западная сплошная
    { x: 572, y: 400, w: 28, h: 20, kind: 'h' },
    { x: 644, y: 400, w: 142, h: 20, kind: 'h', label: 'НАЧАЛЬНИК ОТДЕЛА' },
    { x: 572, y: 420, w: 8, h: FLOOR_BOTTOM - 420, kind: 'v' },
  ];

  // Столы опенспейса: два ряда по пять. Сотрудник сидит СЕВЕРНЕЕ стола лицом к камере,
  // столешница перекрывает ему ноги — так читается «сидит за столом на стуле».
  const DESK_W = 84;
  const DESK_XS = [270, 374, 478, 582, 686];
  const ROW1_Y = 168; // верх столешницы первого ряда
  const ROW2_Y = 306;
  const DESK_DEPTH = 42; // столешница 26 + фасад 16

  const coworkers = [
    { id: 'ayarshyn', name: 'Айаршын', role: 'Тимлид разработки', sprite: 0, perk: 'cover' },
    { id: 'vlad', name: 'Влад', role: 'Скор-модели', sprite: 1, perk: 'intel' },
    { id: 'alexandr', name: 'Александр', role: 'Верификатор', sprite: 2, perk: 'report' },
    { id: 'gleb', name: 'Глеб', role: 'Дата-сайентист', sprite: 3, perk: 'snack' },
  ];

  // Второй ряд: новые соседи — ноют, проёбываются и отвлекают Д.Н. на себя.
  const extras = [
    { id: 'seryoga', name: 'Серёга', role: 'Автокредиты («автошка»)', sprite: 2, sheet: 'extras', perk: 'callhack', deskIndex: 0 },
    { id: 'asel', name: 'Асель', role: 'Комплаенс', sprite: 0, sheet: 'extras', perk: 'gossip', deskIndex: 3 },
    { id: 'yerzhan', name: 'Ержан', role: 'Стажёр', sprite: 1, sheet: 'extras', perk: 'task', deskIndex: 4 },
  ];

  const desks = [];
  DESK_XS.forEach((x, i) => {
    const cw = coworkers[i];
    desks.push({
      id: `r1_${i}`, row: 1, x, y: ROW1_Y, w: DESK_W, h: DESK_DEPTH,
      seatX: x + DESK_W / 2, seatY: ROW1_Y - 4,
      owner: cw ? cw.id : 'vikentiy',
      style: ['tidy', 'hoodie', 'papers', 'calc', 'dev'][i],
    });
  });
  DESK_XS.forEach((x, i) => {
    desks.push({
      id: `r2_${i}`, row: 2, x, y: ROW2_Y, w: DESK_W, h: DESK_DEPTH,
      seatX: x + DESK_W / 2, seatY: ROW2_Y - 4, owner: null,
      style: ['crt', 'boxes', 'broken', 'empty', 'intern'][i],
    });
  });
  coworkers.forEach((c, i) => { c.desk = desks[i]; });
  extras.forEach(e => { e.extra = true; e.desk = desks[5 + e.deskIndex]; e.desk.owner = e.id; });
  const people = coworkers.concat(extras);
  const playerDesk = desks[4];

  // Коллайдеры мебели (уровень ног).
  const furniture = [
    { id: 'counter', x: LEFT, y: FLOOR_TOP, w: 222, h: 22 },
    { id: 'fridge', x: 18, y: FLOOR_TOP, w: 36, h: 44 },
    { id: 'kitchen_table', x: 84, y: 196, w: 72, h: 30 },
    { id: 'cooler', x: 206, y: 222, w: 24, h: 22 },
    { id: 'cabinets_w', x: LEFT, y: 350, w: 34, h: 170 },
    { id: 'shelf', x: 92, y: 378, w: 60, h: 92 },
    { id: 'boxes', x: 176, y: 486, w: 56, h: 40 },
    { id: 'copier', x: 404, y: 474, w: 50, h: 44 },
    { id: 'paper_shelf', x: 460, y: 492, w: 62, h: 30 },
    { id: 'boss_desk', x: 660, y: 462, w: 92, h: 30 },
    { id: 'boss_cabinet', x: 588, y: 488, w: 40, h: 36 },
    { id: 'rack_row1', x: 828, y: 374, w: 112, h: 22 },
    { id: 'rack_row2', x: 828, y: 480, w: 112, h: 42 },
    { id: 'bench', x: 876, y: 262, w: 62, h: 22 },
    { id: 'ashtray', x: 820, y: 170, w: 12, h: 10 },
    { id: 'bucket', x: 314, y: 440, w: 34, h: 12 },
    { id: 'whiteboard', x: 272, y: 394, w: 72, h: 8 },
    { id: 'no_smoke_sign', x: 842, y: 168, w: 16, h: 8 },
    { id: 'wc_cabin', x: 250, y: 490, w: 34, h: 18 }, // синий биотуалет в углу опенспейса
  ];
  desks.forEach(d => furniture.push({ id: d.id, x: d.x, y: d.y + 2, w: d.w, h: d.h - 2 }));

  // Растения-укрытия: pot — коллайдер горшка, hide — точка, куда садится Викентий.
  const plants = [
    { id: 'monstera', label: 'МОНСТЕРА', x: 254, y: 238, kind: 'monstera' },
    { id: 'ficus', label: 'ФИКУС', x: 776, y: 262, kind: 'ficus' },
    { id: 'palm', label: 'ПАЛЬМА', x: 378, y: 496, kind: 'palm' },
    { id: 'laurel', label: 'ЛАВР', x: 556, y: 392, kind: 'laurel' },
  ];
  plants.forEach(p => furniture.push({ id: `pot_${p.id}`, x: p.x - 9, y: p.y - 6, w: 18, h: 10 }));

  const colliders = walls.concat(furniture);

  // Интерактивные зоны (где должны стоять ноги Викентия).
  const zones = [
    { id: 'desk', type: 'desk', x: playerDesk.x + 4, y: FLOOR_TOP + 2, w: DESK_W - 8, h: ROW1_Y - FLOOR_TOP - 2, short: 'Твой стол' },
    { id: 'coffee', type: 'coffee', x: 96, y: 150, w: 58, h: 30, short: 'Кофемашина' },
    { id: 'fridge', type: 'fridge', x: 16, y: 172, w: 52, h: 36, short: 'Холодильник' },
    { id: 'water', type: 'water', x: 180, y: 214, w: 26, h: 42, short: 'Кулер' },
    { id: 'smoke', type: 'smoke', x: 800, y: 150, w: 140, h: 164, short: 'Курилка' },
    { id: 'archive', type: 'archive', x: 50, y: 360, w: 40, h: 150, short: 'За шкафами' },
    { id: 'printer', type: 'printer', x: 396, y: 440, w: 130, h: 32, short: 'Ксерокс' },
    { id: 'server', type: 'server', x: 800, y: 402, w: 140, h: 68, short: 'Серверная' },
  ];
  zones.push(
    { id: 'exit', type: 'exit', x: 16, y: 284, w: 46, h: 36, short: 'Выход' },
    { id: 'toilet', type: 'toilet', x: 246, y: 508, w: 50, h: 18, short: 'Биотуалет' },
    { id: 'complain', type: 'complain', x: 598, y: 372, w: 48, h: 28, short: 'Дверь Д.Н.' },
    { id: 'standup', type: 'standup', x: 266, y: 404, w: 84, h: 32, short: 'Доска' },
  );
  people.forEach(c => {
    zones.push({
      id: `chat_${c.id}`, type: 'chat', coworker: c.id,
      x: c.desk.x - 4, y: c.desk.y + DESK_DEPTH, w: DESK_W + 8, h: 30, short: c.name,
    });
  });

  // Навигационные узлы для Директора Начальниковича. Рёбра считаются автоматически по прямой видимости.
  const navNodes = [
    // Ряд за спинами первого ряда (у окон)
    { x: 258, y: 146 }, { x: 364, y: 146 }, { x: 468, y: 146 }, { x: 572, y: 146 }, { x: 676, y: 146 }, { x: 778, y: 146 },
    // Главный проход между рядами
    { x: 256, y: 222 }, { x: 364, y: 230 }, { x: 468, y: 230 }, { x: 572, y: 230 }, { x: 676, y: 230 }, { x: 772, y: 222 },
    // Проходы между столами (просветы)
    { x: 364, y: 196 }, { x: 468, y: 196 }, { x: 572, y: 196 }, { x: 676, y: 196 },
    { x: 364, y: 330 }, { x: 468, y: 330 }, { x: 572, y: 330 }, { x: 676, y: 330 },
    // Южная зона
    { x: 256, y: 366 }, { x: 364, y: 372 }, { x: 468, y: 380 }, { x: 540, y: 372 }, { x: 676, y: 374 }, { x: 772, y: 380 },
    { x: 470, y: 452 }, { x: 330, y: 470 }, { x: 622, y: 386 }, { x: 622, y: 440 }, { x: 706, y: 446 },
    // Западный коридор, кухня, архив
    { x: 256, y: 300 }, { x: 178, y: 300 }, { x: 60, y: 300 }, { x: 177, y: 250 }, { x: 110, y: 172 }, { x: 60, y: 240 },
    { x: 222, y: 186 }, { x: 196, y: 352 }, { x: 196, y: 440 }, { x: 70, y: 440 }, { x: 72, y: 356 },
    // Балкон и серверная
    { x: 812, y: 216 }, { x: 870, y: 190 }, { x: 900, y: 240 }, { x: 772, y: 434 }, { x: 812, y: 434 }, { x: 880, y: 432 },
  ];

  // Точки обхода (индексы навигационных узлов + описание для радара).
  const patrolSpots = [
    { x: 520, y: 230, desc: 'опенспейс' },
    { x: 178, y: 300, desc: 'коридор' },
    { x: 110, y: 172, desc: 'кухню' },
    { x: 70, y: 440, desc: 'архив' },
    { x: 470, y: 452, desc: 'ксерокс' },
    { x: 870, y: 200, desc: 'балкон' },
    { x: 880, y: 432, desc: 'серверную' },
    { x: 676, y: 146, desc: 'окна' },
    { x: 364, y: 372, desc: 'второй ряд' },
  ];
  const bossHome = { x: 706, y: 446, desc: 'кабинет' };
  const exitDoor = { x: 40, y: 302 };       // дверь на лестницу: обед, пиво, эвакуация
  const toiletDoor = { x: 267, y: 518 };    // перед дверью биотуалета (кабинка x 248–286, y 446–508)
  const standupSpot = { x: 362, y: 420 };   // Д.Н. у доски на летучке

  window.NP_WORLD = {
    W, H, HUD_H, FLOOR_TOP, FLOOR_BOTTOM, LEFT, RIGHT,
    DESK_W, DESK_DEPTH, ROW1_Y, ROW2_Y,
    walls, furniture, colliders, desks, playerDesk, coworkers, extras, people, plants, zones,
    navNodes, patrolSpots, bossHome, exitDoor, toiletDoor, standupSpot,
  };
})();

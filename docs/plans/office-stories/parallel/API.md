# API независимых пакетов

Назначение — сделать модели совместимыми до параллельного написания. Это соглашение об аргументах и результатах, а не новая система плагинов.

## Общие правила

Функции объявлены на верхнем уровне классического script. Никаких IIFE вокруг новых модулей, ES imports, CommonJS exports и сетевых запросов.
Верхний уровень содержит только декларации и данные; не требует наличия player/boss/store/DOM.
Каждый модуль имеет create... с JSON-совместимым default state. Set/Map преобразуются в массивы/объекты.
Все числа конечные, таймеры >=0. Неизвестный id/обязательный отсутствующий context даёт безопасный отказ с reason, не догадку.

Время: dt в симуляционных секундах уже учитывает скорость игры; clockMinutes — минуты игрового дня. paused означает отсутствие продвижения таймеров.
RNG: при необходимости передать randomSample 0..1, выбранный адаптером через rand один раз. Модель не вызывает Math.random/Date.now.

## Результат изменения состояния

Для новых переходов, где исходная карточка не фиксирует иной формат:

```js
{
  ok: true,
  state: nextState,
  effects: [
    { id: "shift:feature:outcome:effect", type: "addWork", amount: 6 }
  ],
  reason: null
}
```

Отказ: ok=false, прежнее состояние, effects=[], стабильный reason (например npc_unavailable).
Не мутировать входной state: тесты сравнивают исходный объект. Для простого запроса допустим boolean или документированный DTO.
Все эффекты одного перехода имеют стабильные уникальные id. Повторный tick завершённого состояния возвращает effects=[].
Адаптер проверяет предусловия (включая кредит/доступность) и применяет переход атомарно в одном update. Если предусловие не выполнено, не коммитит новый state и не применяет часть эффектов.
Сохранение не вклинивается в синхронный переход; state/outcomeApplied сохраняются вместе. Для отложенных эффектов хранить pending в state, не callback.

Это обычные DTO. A обрабатывает их в конкретной функции адаптера. Не создавать универсальный dispatcher/event-bus/реестр произвольных скриптов.

## Допустимые описания эффектов

- addFun: amount, reasonId.
- addWork: amount>=0.
- subtractWork: amount>=0, итог clamp>=0.
- relationship: npcId, kind help/betrayal/apology, eventId.
- consumeFavor: npcId, eventId; атомарно с положительным ответом на услугу.
- awardMoment: momentId, sourceId.
- reprimand: incidentId, reasonId; фактический reprimand может быть прикрыт.
- missAtDesk: incidentId, reasonId.
- message: lineId, ownerId; строки добавляет A в LINES из предложений handoff.
- requestBossRoute: targetId, reasonId; путь и допустимость строит A.
- startStory: storyId, sourceId.
- grantIntel: seconds, combine='max'.
- activateCoffee: seconds, combine='max'.
- countCompleted: statId, sourceId; адаптер увеличивает существующую статистику единожды.

Нельзя прямо записать reprimands/coins/usefulness/fun в globals из модели.
Существующие моменты B1/C2 не должны по-разному называть один id: variety/distraction/colleagueHelp/story/groupSmoke из задачи05.

## Общий context

Общие поля по необходимости: shiftId, dayIndex, clockMinutes, dt, paused, legalAway, shiftEnded.
Данные NPC: доступность и id, без ссылки на исходный mutable coworker.
Boss context: state, distance, lineOfSight, routeAvailable, arrived; маршруты и коллайдеры внутри адаптера.
Исполнитель описывает точные обязательные поля каждой функции и примеры в handoff. Не требовать весь игровой state, если нужны два значения.

## Особые границы

D2 сообщает rate/variant/countAsBaseActivity, A выбирает единственное место начисления fun в updatePlayer. Нельзя одновременно оставить старый прирост и применить новый rate.
C1 не знает локального времени браузера; переход дней задаёт адаптер.
C2 передаёт эффект отношений, не импортирует C1. При ошибке consumeFavor переход не принят.
C5 задаёт режим daily; обычный Excel запрещает адаптер. Модель не подменяет player.action.
B3 не переписывает старый UPGRADES. Покупка возвращает согласованные state и coins, адаптер сохраняет оба.
B4 возвращает визуальные параметры, а не меняет игровую опасность.
D6 — исключение для рисования: renderer принимает ctx/assets аргументом, не мутирует модель и не управляет движением.


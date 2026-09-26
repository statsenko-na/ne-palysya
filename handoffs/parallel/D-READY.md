# Поток D — основная волна

Статус: все пакеты D1–D5 подготовлены к интеграции. Это чистые модели; новые действия пока не доступны игроку.

## База и PR

- Исходный verified base SHA: b44686b63ea798f0090c4a3a8f5767dcf23feec4.
- Целевая ветка из remote HEAD: origin/main.
- Ветка: codex/office-stories-d.
- Последний commit основного кода пакетов: 6ec0a76ec78a04aaf2192c4c5390b7a6581fac05.
- Draft PR: https://github.com/statsenko-na/ne-palysya/pull/17.
- Коммиты пакетов: D1 85f0d63, D2 a6be3d5, D3 408b180, D4 f06e9a8, D5 6ec0a76.

## Пакеты и фактический API

- D1, js/distractions.js: createDistractions(); canDistract(state, context, kind); beginDistraction(state, context, kind, target); tickDistraction(state, dt, context); finishDistraction(state, reason). Context передаёт shiftId/bossState/paused/legalAway/shiftEnded/routeAvailable; tick получает arrived. Допустимые kind: printer/colleague. Успешная занятость начинается только после arrived; лимиты — две успешные, по одной на kind, 12 секунд пути, 6 секунд занятости, 45 секунд cooldown. Эффект distraction-момента появляется только по finishDistraction с причиной rest_completed в фазе occupied.
- D2, js/activities.js: createActivities(); startActivityVariant(state, context, variant); tickActivityVariant(state, dt, context); cancelActivityVariant(state, reason); finishActivityVariant(state, reason). Variants: smoke-listening, youtube-quiet, youtube-loud, fridge-own, fridge-yogurt. Модель возвращает rate/remaining/completed/countAsBaseActivity, но не начисляет addFun. Listening требует вторник или позже и completed обычный smoke; youtube требует доступный интернет; yogurt требует ownerAvailable и storyAvailable.
- D3, js/disguise.js: createDisguise(); beginDisguise(state, context); tickDisguise(state, dt, context); cancelDisguise(state, reason); canDisguiseCover(state, context). Подготовка 2 секунды, active — 12; cover только в рейде при движении, action=none и расстоянии до начальника строго больше 34. Начало отдыха расходует папку.
- D4, js/boss-memory.js: createBossMemory(); observeBossIncident(state, context); tickBossMemory(state, dt, context); chooseRememberedSpot(state, context). Только видимый caught/autoclicker_exposed, максимум два наблюдения за смену, срок 60 секунд. Выбор получает randomSample и availablePointIds, предоставленные адаптером; sample < 0.35 возвращает requestBossRoute и message. Координаты safeSpot задаёт A.
- D5, js/week-scenarios.js: selectWeekScenario(context); applyWeekScenario(scenario, baseTasks, baseEvents, context). До weekDone возвращается normal/active=false; после него completed weekNumber 1/2/3 выбирает normal/reports/repairs. Reports заменяет только один заданный event-goal и возвращает requiredEventIds=['jam'] с eventDeadlineMinutes.jam=900. Repairs требует одно подходящее разблокированное событие; единственный планировщик очереди остаётся у A03.

Все переходы моделей не мутируют входные state. Состояния JSON-сериализуемы; каждый эффект имеет стабильный id/sourceId. Модули не подключены в index.html и не обращаются к globals, DOM, store, player или boss.

## Проверки

- Адресные тесты: node scripts/qa-parallel-d1.js, node scripts/qa-parallel-d2.js, node scripts/qa-parallel-d3.js, node scripts/qa-parallel-d4.js, node scripts/qa-parallel-d5.js — все завершились успешно.
- После каждого пакета проверены node --check game.js и все js/*.js, затем node scripts/qa.js — 89/89 проверок пройдено каждый раз.
- git diff --check прошёл для всех commits.
- Canvas и визуал не менялись; собственный плейтест не выполнялся.

## Зависимости и ограничения

- A подключает исходные карточки 13/14, 11/12/16, 15, 22, 23 и единственный планировщик A03 в общем runtime.
- В D2 опция fridge-yogurt требует уже подключённую историю 17; пятничную задачу нужно переводить на yogurtStolen. Без этой зависимости интегратор не включает опцию.
- В D4 A проверяет safeSpot и доступность маршрута; при неудаче оставляет обычную patrol-точку. Модель не знает коллайдеры и не заменяет проверку стола.
- Для D5 weekNumber трактуется как количество победных пятниц: увеличивается только после победы в пятницу. Поэтому первая повторная неделя — normal, затем reports и repairs. Адаптер сохраняет это число и передаёт его на reload/повтор дня.
- В D5 reports адаптер A03 должен учитывать deadline 900 игровых минут и не создавать вторую очередь событий.
- Фактические API-контракты, тесты и предлагаемые LINES/GAMEPLAY тексты записаны в D1.md–D5.md рядом с этим файлом.
- Блокеров завершения модельных пакетов нет. Пользовательского поведения до интеграции нет.

Основная волна D готова к подключению.

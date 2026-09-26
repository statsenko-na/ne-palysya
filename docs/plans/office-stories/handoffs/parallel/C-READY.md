# Поток C: основная волна готова к подключению

Статус: модели готовы к подключению; новые функции пока не доступны игроку.
Базовый SHA: `b44686b63ea798f0090c4a3a8f5767dcf23feec4`.
Замороженный HEAD: `155c12e362cd6e4e840c3b08e6de0f29b64ef259` (`codex/office-stories-c`, PR head).
Draft PR: [#19](https://github.com/statsenko-na/ne-palysya/pull/19), цель `main`.
Коммиты пакетов: C1 `1d5e64e1a2e5885fcb1e11b79c94e7d3e43367e4`, C2 `84f8f570d37583d5606a05775fea38dec10d8b90`, C3 `2c383c89b62046f696786a3544e200696c1db9a4`, C4 `155c12e362cd6e4e840c3b08e6de0f29b64ef259`.

## Пакеты и API

- C1 `js/relationships.js`: `createRelationships`, `applyRelationshipEvent`, `canRequestFavor`, `consumeFavor`, `advanceRelationshipsDay`.
- C2 `js/story-yogurt.js`: `createYogurtStory`, `startYogurtStory`, `tickYogurtStory`, `chooseYogurtResolution`, `completeYogurtCoffee`.
- C3 `js/event-autoshka.js`: `createAutoshkaChoice`, `startAutoshkaRepair`, `tickAutoshkaRepair`, `cancelAutoshkaRepair`.
- C4 `js/week-outcomes.js`: `createWeekOutcomes`, `recordWeekFact`, `selectWeekTitle`, `createTigranSecret`, `advanceTigranSecret`.

Все четыре модуля чистые, не подключены в runtime, принимают данные явно и возвращают сериализуемые состояния/эффекты. C5 и C6 остаются в поздней волне.

## Проверки производителя и intake A

- Адресные `scripts/qa-parallel-c1.js` … `c4.js` — прошли в A.
- `node --check game.js`, синтаксис всех `js/*.js` и `node scripts/qa.js` (89/89) указаны производителем; общие A-проверки повторены после приёма всех B/C/D.
- PR описывает JSON/API, интеграционные заметки и единственную общую relationship DTO с `eventId`; C1 дополнительно требует текущий `dayIndex`, который передаёт адаптер A.
- Манифест приведён из тела PR, так как отдельный `C-READY.md` в PR отсутствовал. SHA и список commits сверены с неизменившимся PR head.

Основная волна C принята в A2 и готова к последовательным подключениям.

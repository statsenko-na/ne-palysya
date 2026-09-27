# Поток B: основная волна готова к подключению

Статус: draft PR, чистые модели готовы для интегратора A.
Базовый SHA: `b44686b63ea798f0090c4a3a8f5767dcf23feec4`.
HEAD SHA кодовых пакетов B1–B4: `34dfd27099968f54acd3f59dfb25fe5b71eb7c87`.
Ветка: `codex/office-stories-b`.
Целевая ветка проверенного remote: `main` (`origin` → `statsenko-na/ne-palysya`, default branch подтверждён GitHub и `git ls-remote --symref`).
Draft PR: https://github.com/statsenko-na/ne-palysya/pull/18

## Пакеты

| Пакет | Содержание | Commit |
| --- | --- | --- |
| B1 | Моменты и чистый расчёт результата | `3861f7c40325c2e2eaefe3f3fec29b72e5d4abf2` |
| B2 | Локальные рекорды | `9a8e0ea97c1b9fdc6cb92a0c13cd0992886dfb69` |
| B3 | Покупки, слоты, термос, зеркало и автокликер | `c89b2ed9ae51b7e281f1c282cbeb1e72da2433c2` |
| B4 | Чистая модель уменьшения визуальных эффектов | `34dfd27099968f54acd3f59dfb25fe5b71eb7c87` |

Подробные сигнатуры, state и примеры: [B1](B1.md), [B2](B2.md), [B3](B3.md), [B4](B4.md).

## Фактический API

- B1 `js/moments.js`: `createMoments`, `awardMoment`, `summarizeMoments`, `calculateShiftResult`. Момент даёт 3 итоговых очка, потолок 12; variety принимает факт завершённого отдыха и считает телефон только после 6 непрерывных симуляционных секунд. Результат смены возвращает breakdown/score/coins/grade.
- B2 `js/records.js`: `normalizePlayerName`, `makeRecord`, `createLocalRecordsState`, `addLocalRecord`, `listLocalRecords`. Запись — JSON DTO; уникальность по runId; категория — сложность/ruleset/manual-or-assisted; лимиты 10 на категорию и 300 всего. Старые лучшие результаты передаются отдельно.
- B3 `js/equipment.js`: `createEquipmentState`, `validateLoadout`, `purchaseEquipment`, `equipItem`, `beginEquipmentShift`, `recordThermosBrew`, `useThermos`, `equipmentMirrorVisible`, `activateAutoclicker`, `beginAutoclickerInspection`, `tickEquipment`. Модель принимает state/context явно, возвращает новые JSON-состояния и DTO; магазин, экран, store и глобальные эффекты не меняет.
- B4 `js/accessibility.js`: `resolveReducedEffects`, `getEffectPresentation`. Системное предпочтение используется без сохранённого выбора; reduced mode отдаёт нулевые shake/flash и статический сигнал danger.
- Противоречий с `parallel/API.md` нет. Для B3 добавлен документированный `inspectionResolved`, чтобы уже применённое обнаружение не породило второй missAtDesk.

## Изменённые файлы

- `js/moments.js`, `js/records.js`, `js/equipment.js`, `js/accessibility.js`.
- `scripts/qa-parallel-b1.js` … `scripts/qa-parallel-b4.js`.
- `docs/plans/office-stories/handoffs/parallel/B1.md` … `B4.md`, этот файл.

Общие runtime-файлы, `index.html`, пользовательская документация, `CHANGELOG.md`, `VERSION.md` и общий `scripts/qa.js` не менялись. Ни один модуль не подключён обычной игре и ни одна новая возможность не доступна игроку.

## Проверки

- `node --check game.js` — exit 0.
- PowerShell syntax sweep всех `js/*.js` — exit 0, 22 файла.
- `node scripts/qa-parallel-b1.js` — exit 0.
- `node scripts/qa-parallel-b2.js` — exit 0.
- `node scripts/qa-parallel-b3.js` — exit 0.
- `node scripts/qa-parallel-b4.js` — exit 0.
- `node scripts/qa.js` — exit 0, 89/89 проверок.
- Автоматический QA создал Canvas-снимки в `.qa/`. Просмотрены `.qa/01-work.png`, `.qa/21-sb-cameras.png`, `.qa/26-phone-menu.png`; существующие Canvas, текст и индикаторы читаемы. Визуальный код в этой ветке не менялся.
- Адресные тесты проверяют результат, JSON round trip, отказ/дедупликацию и границы модели; см. пакетные handoffs.

## Блокеры и границы

- Блокеров готовности моделей нет.
- Runtime-подключение и зависимости исходных задач остаются у A: save/reset/store для 02, интерфейс выбора 09, папка/отвлечения для полного пути автокликера 15/14 и телефон/дела для 20. Здесь зависимости не подменялись заглушками.
- A должен включать эффект, UI и сохранение атомарно. Не подключать модели выборочно как готовые игровые функции; mirror и autoclicker нельзя показывать как рабочие товары до их адаптеров.
- После указанного B4 code HEAD файлы моделей не менялись. Финальный commit передачи добавляет только этот lane handoff; пакеты остаются заморожены. Возможные исправления — отдельные commits по конкретному замечанию.

Основная волна B готова к подключению.

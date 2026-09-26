# AGENTS.md

## Проект

`Не пались` — локальная браузерная top-down pixel-art стелс-игра про Быкентия (айтишник-рокер без очков) в отделе рисковых кредитов алматинского БЦ «Угар». Начальник — Директор Начальникович (Д.Н., в очках, без усов). Игровой UI использует стилизованное название «Фирдом Банк» и эмблему без словесного логотипа.

## Language & tokens

- Reason, plan, and write subagent/workflow prompts in English (Cyrillic costs more tokens; Anthropic notes thinking works best in English). Reply to the user in Russian.
- Project files stay Russian: docs, CHANGELOG, commit messages, UI strings, `js/lines.js`.
- Be concise: lead with the result, no restating the request, no recap. Read only the file ranges you need.
- Don't playtest the game yourself (autopilot, bot shifts, manual browser play) unless the user asks.
- Prefer instructions phrased calmly and specifically; avoid ALL-CAPS emphasis.

### Claude Opus 5.5 (per platform.claude.com "Prompting Claude Opus 5.5")

- Thinking is always on; control its cost with effort (`/effort`, default `medium`; `low` for simple edits), not with "think carefully" prompts — don't add those.
- Once something is answered, treat it as done; focus on the current request and revisit earlier answers only if asked or a problem shows up.
- On multi-part tasks keep a checklist and finish all items; stop only when blocked by the user or a protected action. Put status notes alongside the next tool call.
- Before changing code, look at the relevant files first, including ones the request doesn't name.
- Frontend/visual work: name concrete patterns to avoid rather than "avoid generic look"; verify on the real Canvas.

## Рабочие правила

- Сначала прочитай `docs/README.md`, `docs/GAMEPLAY.md` и `docs/ART_DIRECTION.md`, если задача затрагивает игру, механику или визуал.
- Сохраняй запуск без сборки: `index.html` должен открываться напрямую, а код не должен требовать npm или сервера.
- Файлы игровой логики подключаются классическими `<script>` без обёртки; новые общие переменные и функции объявляй на верхнем уровне нужного файла; порядок — в `index.html`. `js/world.js`, `js/lines.js`, `js/art.js` и `js/config.js` сохраняют собственные обёртки.
- Для поиска используй `rg`/`rg --files`, для изменений — `apply_patch`.
- После изменений в JavaScript запускай `node --check` для `game.js` и `js/*.js`, затем `node scripts/qa.js` (автотест в headless Chromium).
- Для визуальных изменений проверяй страницу в браузере и смотри на реальный Canvas, а не только на текст исходников.
- Обновляй `CHANGELOG.md`, `VERSION.md` и соответствующий документ в `docs/`, если меняется поведение, визуал или структура проекта.
- Не добавляй настоящий словесный логотип бренда в UI; используй только «Фирдом Банк» и `assets/firdom-emblem.svg`.
- Не подключай внешние игровые ассеты без записи источника и лицензии в `docs/ART_DIRECTION.md`.
- Не переписывай историю и не удаляй пользовательские изменения без прямой команды.

### Управление

- Буквенные клавиши WASD/E/H/P/Q/M должны работать и на английской, и на русской раскладке. Предпочитай `KeyboardEvent.code` для физических позиций и сохраняй кириллический fallback.
- Если меняется управление, синхронно обновляй таблицу в `docs/GAMEPLAY.md` и справку в `README.md`.
- После изменения `game.js` запускай `node --check game.js`; соответствия клавиш обеих раскладок проверяет `scripts/qa.js`.

## Источники истины

- `index.html` — разметка и тексты интерфейса.
- `style.css` — оболочка, HUD и адаптивная компоновка.
- `js/config.js` — баланс и данные: `CFG`, `DIFFICULTY`, `UPGRADES`, `DAYS`, `UNLOCK`, `EVENT_TIER`.
- `js/core.js` — холст, картинки, сохранения, ввод, звук, музыка, утилиты, коллизии, навигация и состояние.
- `js/meta.js` — магазин апгрейдов, онбординг «Как играть» и задачи дня.
- `js/events.js` — офисные события, камеры СБ, обед, туалет и пятничное пиво.
- `js/interact.js` — взаимодействия по E и достижения.
- `js/boss.js` — ИИ Директора Начальниковича, план на день и выговоры.
- `js/autopilot.js` — автопилот.
- `js/player.js` — игрок и главный цикл обновления `update()`.
- `js/render.js` — примитивы рисования, масштаб интерфейса, кадр `draw()` и цикл `loop()`; части кадра: `js/render-office.js` (офис и декор), `js/render-actors.js` (персонажи), `js/render-fx.js` (реплики, значки, частицы, баннер, свет), `js/render-hud.js` (HUD, подсказка E), `js/render-phone.js` (телефон), `js/render-guide.js` (обучение, летучка, значок автопилота, задание).
- `game.js` — обработчики ввода и кнопок, `NP_DEBUG` и запуск игры.
- `js/world.js` — геометрия: стены, коллайдеры, зоны, навигация. `js/art.js` — процедурный арт офиса. `js/lines.js` — все реплики.
- `assets/` — листы спрайтов, которые грузит игра (`bykentiy-walk-v4`, `boss-walk-v3`, `coworkers-v3`, `extras-v1`), вид на Алматы, SVG-эмблема; `*-src.png` (только локально, в git не хранятся), `boss-walk-v2.png` и `office-background-pixel-v1.png` — исходники для `scripts/replace_sprite.py`, `make_boss_walk.py` и `make_panorama.py`.
- `docs/` — механики, визуальные правила, агентская документация и handoff.

## OpenAI / Codex / Antigravity

- Для генерации новых пиксельных ассетов используй встроенный инструмент `generate_image` (модель Nano Banana / Imagen) по подписке без платных API-кредитов, следуя промпт-шаблонам из скила `pixel-game-design`.
- Для обработки и нарезки спрайтов используй локальный скрипт `python scripts/pixel_processor.py`; замена одной ячейки листа с удалением пурпурного фона — `python scripts/replace_sprite.py`.
- Headless-генерацию (`agy -p`, `codex exec`) запускай из пустой папки вне репозитория, по шагам проектного скилла `.claude/skills/game-image-gen/SKILL.md`. Если тебя запустили только чтобы сгенерировать картинку, не трогай файлы проекта.
- При работе в среде Antigravity доступны глобальные скилы: `pixel-game-design`, `systematic-debugging`, `code-review-standards`, `git-mastery`, а также локальный `office-game-dev`.
- Если задача касается OpenAI, Codex, моделей, промптов или агентов, сверяй актуальный официальный OpenAI Developer Docs; краткие проектные правила и ссылки хранятся в `docs/OPENAI_CODEX_GUIDE.md`. Для самой игры API-вызовов нет, модель в коде не задаётся.

## Готовность задачи

Считай задачу завершённой только после проверки результата (`node --check`, `node scripts/qa.js` и просмотр скриншотов реального Canvas), а в финале укажи изменённые файлы, проверку и известные ограничения.

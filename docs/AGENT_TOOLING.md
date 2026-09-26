# Инструменты Codex-агентов для проекта

Проверено `2026-09-24` по официальной документации OpenAI и репозиториям GitHub. Эта игра — статический локальный сайт без API, сборки и серверной логики. Skills, MCP и hooks относятся к рабочему процессу агента, а не к runtime игры.

## Проектные инструменты (используются)

- `node scripts/qa.js [папка]` — Playwright-автотест: раскладки, коллизии, навигация, механики, события, скриншоты. Ищет Playwright локально или в `/opt/node22/lib/node_modules/playwright`. В игре есть отладочный хук `window.NP_DEBUG` (teleport, setBoss, skip, startEvent, set, setDay); он создаётся только под автотестом (`navigator.webdriver`) или с `?debug` в адресе.
- Для скриншотов реального холста с `file://` используй `locator.screenshot`: `toDataURL` блокируется из-за tainted canvas.
- `scripts/make_panorama.py`, `make_boss_walk.py`, `replace_sprite.py`, `pixel_processor.py` — пересборка и замена ассетов (Pillow).

## Короткая рекомендация

- **Браузерная проверка:** официальный [Playwright skill из `openai/skills`](https://github.com/openai/skills/tree/main/skills/.curated/playwright) подходит для повторяемых снимков и проверки UI.
- **Справка по Codex/OpenAI:** [OpenAI Docs MCP](https://developers.openai.com/learn/docs-mcp) читает официальную документацию и полезен агенту при будущих вопросах о Codex, моделях, API или плагинах. Его лучше настраивать в пользовательском Codex, а не встраивать в игру или коммитить секреты.
- **GitHub:** поддерживаемый [GitHub MCP Server](https://github.com/github/github-mcp-server) может быть полезен позже для чтения репозитория и ведения issues, PR и CI. Для обычного clone/push статической игры он избыточен; используйте только доверенную авторизацию и минимальные права.
- **Skills:** держите инструкцию короткой и привязанной к узнаваемой задаче. Если браузерный smoke-test станет регулярной процедурой, можно отдельно создать узкий repo skill вроде `office-game-browser-qa` с командами запуска, проверкой управления на двух раскладках и критериями готовности. Проектные skills уже есть: `.agents/skills/office-game-dev` и `.claude/skills/game-image-gen`.
- **Агенты:** при крупной переделке можно отдельно поручить независимому агенту ревью механик, лицензий ассетов или визуального QA. Не давайте двум агентам одновременно менять одни и те же файлы; результат ревью проверяйте сами.

## Hooks и безопасность

Codex hooks могут запускать команды на событиях вроде `SessionStart`, `PreToolUse` и `PostToolUse`. Они здесь не нужны: проект проверяется `node --check` и `node scripts/qa.js`, а обязательный hook добавил бы исполняемый код и конфигурацию без заметной пользы. Если появится реальная повторяемая задача, добавляйте минимальный hook с узким matcher, проверяйте его код и аргументы и доверяйте текущему определению только после ревью. См. [официальную документацию Codex hooks](https://developers.openai.com/codex/hooks) и [правила hook в плагинах](https://developers.openai.com/plugins/build/plugins).

Не устанавливайте случайные GitHub skills/hooks по одному названию или числу звёзд: проверьте владельца, исходный код, лицензию, зависимости, разрешения и дату обновления. Не передавайте PAT в репозиторий и не включайте токен в вывод команд.

## Проверенные источники

- [OpenAI: Skills](https://developers.openai.com/plugins/concepts/skills) и [Build skills](https://developers.openai.com/plugins/build/skills) — граница ответственности skills и MCP, описание workflow и тестирование с подходящими/неподходящими запросами.
- [OpenAI: Docs MCP](https://developers.openai.com/learn/docs-mcp) — официальный сервер документации и варианты настройки Codex.
- [OpenAI: Codex hooks](https://developers.openai.com/codex/hooks) — события, запуск команд и доверие определения hook.
- [OpenAI: skills repository](https://github.com/openai/skills) — исходники опубликованных примеров, включая Playwright skill.
- [GitHub: GitHub MCP Server](https://github.com/github/github-mcp-server) — поддерживаемая GitHub реализация MCP для работы с GitHub API.

Установка этих ресурсов в проект не выполнялась. Настройки пользовательского Codex и внешние GitHub-данные не менялись.

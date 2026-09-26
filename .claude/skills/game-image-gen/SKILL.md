---
name: game-image-gen
description: Генерация спрайтов и картинок для «Не пались» через подписки (Antigravity `agy`, запасной — Codex CLI) без API-ключей, с заменой ячейки в листе спрайтов. Используй, когда просят нарисовать или перерисовать спрайт, ассет, иконку.
---

# Генерация спрайтов через подписку

## Безопасность
- Не задавай и не выводи OPENAI_API_KEY / GEMINI_API_KEY / GOOGLE_API_KEY: с ними начнётся оплата за API.
- Только официальные `agy` и `codex`, без прокси-обёрток OAuth. Не покупать кредиты. Не больше пары запросов подряд.

## 1. Генерация (Antigravity, по умолчанию)
Запускай из **пустой папки вне репозитория**, иначе `agy` читает AGENTS.md и сам выполняет весь процесс (медленно, мусорит, правит ассеты).

```powershell
$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")
$d = "C:\Users\Nikolai S\Documents\ClaudeGames\gen"; New-Item -ItemType Directory -Force $d | Out-Null; Set-Location $d
agy -p "<промпт>. Only generate one image and save it as <name>.png in the current folder. Do not read, create or modify any other files." --model "Gemini 3.8 Flash (Low)" --print-timeout 4m --dangerously-skip-permissions --output-format json *> "$d\log.txt"
```
Запускай в фоне (`run_in_background`), жди уведомления, не опрашивай.

Шаблон промпта: `Pixel art game sprite, 16-bit retro style, front view, full body, <персонаж>, seen from slightly above (top-down office game). Crisp pixel edges, limited palette, dark outline, portrait proportions 5:7, solid flat magenta #FF00FF background.` Стиль — по `docs/ART_DIRECTION.md`.

Запасные каналы:
- Codex: `codex exec --skip-git-repo-check --sandbox workspace-write "<промпт>. Save it as <name>.png in the current folder."` (из той же папки `gen`).
- Gemini в Chrome (claude-in-chrome): gemini.google.com → промпт → «Скачать изображение в полном размере». Скачивание — только с согласия пользователя.

## 2. Встраивание
1. Посмотри картинку (Read). Проверь, что фон пурпурный и персонаж целиком.
2. Скопируй исходник в `assets/<name>-src.png` (файл игнорируется git и не публикуется — не добавляй его принудительно).
3. `python scripts/replace_sprite.py assets/<name>-src.png <sheet> <index> [cell_w] [cell_h]` — убирает хромакей, вписывает с nearest-neighbor, заменяет ячейку. Листы: `assets/extras-v1.png` 80×112 (0 Асель, 1 Альджазира, 2 Сиргей, 3 Тигран, 4 Штази).
4. Удали папку `gen` после переноса.

## 3. Проверка
`node --check game.js js/*.js`, `node scripts/qa.js`, посмотреть `.qa/*.png` с персонажем. Обновить `docs/ART_DIRECTION.md` (источник: канал и подписка), `CHANGELOG.md`, `VERSION.md`, `docs/CHECKLIST.md`.

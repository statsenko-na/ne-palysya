# Локальная работа (Windows)

Игра запускается без сборки: достаточно открыть `index.html` двойным щелчком. Всё ниже нужно только для автотестов, скриншотов и перерисовки спрайтов.

## 1. Получить или обновить репозиторий

```powershell
cd "$HOME\Documents\ClaudeGames"
# первый раз
git clone https://github.com/statsenko-na/ne-palysya.git
cd ne-palysya
# потом — обновить
git fetch origin
git checkout main
git pull
# ветка с последними правками, пока её PR не смерджен
git checkout claude/festive-cray-15hwkf
git pull
```

## 2. Инструменты (один раз)

```powershell
winget install OpenJS.NodeJS.LTS Python.Python.3.12 Git.Git
npm i -g playwright
npx playwright install chromium
py -m pip install pillow numpy scipy
```

## 3. Проверка

```powershell
node --check game.js
Get-ChildItem js\*.js | ForEach-Object { node --check $_.FullName }
node scripts\qa.js          # автотест: 79 проверок, скриншоты в .qa\
node scripts\screens.js     # меню, онбординг, игра, реплики, телефон на 6 экранах → .qa\screens\
```

`scripts/pw.js` находит Playwright в локальном `node_modules`, в глобальной установке (`npm root -g`) или в облачном контейнере.

## 4. Спрайты

```powershell
py scripts\make_characters.py        # Быкентий v3, Аймашын, второй ряд, Тигран
cd scripts; py normalize_sprites.py; py make_panorama.py; cd ..
```

Новые картинки через подписки (Antigravity / Codex) — проектный скилл [`.claude/skills/game-image-gen`](../.claude/skills/game-image-gen/SKILL.md) (`agy` из пустой папки, быстрая модель, затем `scripts/replace_sprite.py`): результат клади в `assets/` и записывай источник в `docs/ART_DIRECTION.md`.

## Облако или локально

- **Локально** есть доступ к Antigravity и Codex для генерации спрайтов, к настоящему браузеру и телефону для ручной проверки. Не тратится время на старт контейнера и клонирование.
- **В облаке** сессия работает, даже когда ноутбук выключен, её можно вести с телефона, Chromium уже установлен. Но нет доступа к программам на компьютере, а контейнер временный: всё нужно пушить.

# Telegram Mini App

Игра запускается внутри Telegram как Mini App без отдельной сборки: Telegram открывает ту же страницу GitHub Pages (`https://statsenko-na.github.io/ne-palysya/`), а `js/tg.js` подстраивает её под Telegram.

## Как устроено

- `js/tg.js` проверяет, открыта ли страница из Telegram (параметры `tgWebApp*` в адресе или `TelegramWebviewProxy`). Только тогда он подгружает официальный SDK `https://telegram.org/js/telegram-web-app.js`. В обычном браузере и при открытии `index.html` с диска SDK не грузится и ничего не меняется.
- После загрузки SDK: `ready()`, `expand()`, цвет шапки и фона `#0b1519`, запрет сворачивания свайпом вниз (7.7+).
- На телефонах (iOS, Android) с Telegram 8.0+ игра просит полный экран и фиксирует альбомную ориентацию. `lockOrientation` фиксирует текущую ориентацию, поэтому вызывается только в альбомной; в портретной работает обычная заглушка «Поверни телефон». На компьютере полный экран не запрашивается.
- Классы `html.in-telegram` и `html.tg-fullscreen`. В полном экране `.screen-frame`, меню, джойстик, кнопки и тост получают отступы из переменных `--tg-safe-area-inset-*` и `--tg-content-safe-area-inset-*`: кнопки Telegram «Закрыть» и «⋯» и вырез камеры не перекрывают игру.
- Во время смены показана системная кнопка «Назад» (ставит на паузу и снимает с паузы) и включено подтверждение закрытия. В меню кнопка скрыта и Telegram закрывается как обычно.
- Telegram свернули (`deactivated`) — смена встаёт на паузу и сохраняется.
- Если имя игрока не задано, в поле подставляется имя из профиля Telegram.
- `enterFullscreen()` в `js/meta.js` в Telegram ничего не делает: браузерный Fullscreen API там не нужен.

## Как подключить бота

1. В Telegram открыть [@BotFather](https://t.me/BotFather), команда `/newbot`: имя и username бота.
2. `/mybots` → бот → **Bot Settings** → **Configure Mini App** → **Enable Mini App**, адрес `https://statsenko-na.github.io/ne-palysya/`. Игра откроется по кнопке «Открыть» в профиле бота и по ссылке `https://t.me/<username_бота>?startapp`.
3. По желанию: **Menu Button** → тот же адрес, чтобы игра открывалась кнопкой слева от поля ввода. Команда `/newapp` создаёт отдельную ссылку вида `t.me/<бот>/<имя>` с картинкой и описанием.

Изменения попадают в Telegram после слияния в `main` (деплой GitHub Pages, 1–2 минуты). Telegram кэширует страницу: если обновление не видно, закройте Mini App полностью и откройте заново.

## Проверка без Telegram

Поведение Telegram можно имитировать в headless-браузере: открыть `index.html#tgWebAppData=...&tgWebAppVersion=8.0&tgWebAppPlatform=ios`, подставить `window.TelegramWebviewProxy` и вызывать `Telegram.WebView.receiveEvent('fullscreen_changed' | 'safe_area_changed' | 'content_safe_area_changed' | 'back_button_pressed', …)`.

## Ограничения и следующие шаги

- Сохранения остаются в `localStorage` WebView Telegram. На iOS Telegram может его очистить; перенос в `CloudStorage` — следующий этап.
- Для таблицы рекордов, оплаты Telegram Stars и проверки `initData` нужен сервер: токен бота нельзя хранить в клиенте.
- Производительность на слабых Android-телефонах не проверялась.

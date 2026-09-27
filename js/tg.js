'use strict';
// «Не пались» — запуск внутри Telegram (Mini App).
// Вне Telegram файл ничего не делает: SDK telegram-web-app.js грузится, только если страницу открыл Telegram.
// Общие переменные объявлены на верхнем уровне (без обёртки и модулей), порядок подключения — в index.html.

  let tgApp = null; // Telegram.WebApp, когда игра открыта в Telegram
  const TG_SDK_URL = 'https://telegram.org/js/telegram-web-app.js';
  const TG_BG = '#0b1519';

  // Telegram передаёт параметры запуска в hash (tgWebAppData, tgWebAppPlatform…), после перезагрузки — в sessionStorage
  function tgLaunchDetected() {
    if (/tgWebApp/.test(location.hash) || /tgWebApp/.test(location.search) || window.TelegramWebviewProxy) return true;
    try { return !!sessionStorage.getItem('__telegram__initParams'); } catch (_) { return false; }
  }

  function tgMobile() { return tgApp && (tgApp.platform === 'ios' || tgApp.platform === 'android'); }

  function tgLockLandscape() {
    if (!tgMobile() || !tgApp.isVersionAtLeast('8.0') || tgApp.isOrientationLocked) return;
    // lockOrientation фиксирует текущую ориентацию, поэтому просим только в альбомной
    if (window.innerWidth > window.innerHeight) tgApp.lockOrientation();
  }

  function tgSyncFullscreenClass() {
    document.documentElement.classList.toggle('tg-fullscreen', !!tgApp.isFullscreen);
  }

  // Системная «Назад» и подтверждение закрытия нужны только во время смены
  let tgInShift = null;
  function tgSyncShiftControls() {
    const inShift = mode === 'playing' || mode === 'paused';
    if (inShift === tgInShift) return;
    tgInShift = inShift;
    if (tgApp.isVersionAtLeast('6.1')) inShift ? tgApp.BackButton.show() : tgApp.BackButton.hide();
    if (tgApp.isVersionAtLeast('6.2')) inShift ? tgApp.enableClosingConfirmation() : tgApp.disableClosingConfirmation();
  }

  function tgPrefillPlayerName() {
    const user = tgApp.initDataUnsafe && tgApp.initDataUnsafe.user;
    if (!user || !user.first_name || store.get('playerName', '')) return;
    const input = document.querySelector('.player-name-input');
    if (!input) return;
    input.value = user.first_name;
    input.dispatchEvent(new Event('input'));
  }

  function tgInit() {
    const app = window.Telegram && window.Telegram.WebApp;
    if (!app || !app.initData) return; // SDK загрузился, но это не запуск из Telegram
    tgApp = app;
    document.documentElement.classList.add('in-telegram');
    try {
      tgApp.ready();
      tgApp.expand();
      if (tgApp.isVersionAtLeast('6.1')) { tgApp.setHeaderColor(TG_BG); tgApp.setBackgroundColor(TG_BG); }
      if (tgApp.isVersionAtLeast('7.10')) tgApp.setBottomBarColor(TG_BG);
      if (tgApp.isVersionAtLeast('7.7')) tgApp.disableVerticalSwipes(); // свайп по джойстику не сворачивает игру
      if (tgApp.isVersionAtLeast('8.0')) {
        tgApp.onEvent('fullscreenChanged', () => { tgSyncFullscreenClass(); tgLockLandscape(); updateUiScale(); });
        tgApp.onEvent('fullscreenFailed', () => {});
        tgApp.onEvent('safeAreaChanged', updateUiScale);
        tgApp.onEvent('contentSafeAreaChanged', updateUiScale);
        if (tgMobile() && !tgApp.isFullscreen) tgApp.requestFullscreen();
        tgSyncFullscreenClass();
        tgLockLandscape();
        window.addEventListener('resize', tgLockLandscape);
      }
      tgApp.BackButton.onClick(() => { if (mode === 'playing' || mode === 'paused') pauseGame(); });
      // Telegram свернули — ставим смену на паузу и сохраняемся
      tgApp.onEvent('deactivated', () => { if (mode === 'playing') pauseGame(); });
      tgSyncShiftControls();
      setInterval(tgSyncShiftControls, 400);
      tgPrefillPlayerName();
    } catch (err) {
      console.warn('Telegram Mini App:', err);
    }
  }

  if (tgLaunchDetected()) {
    const sdk = document.createElement('script');
    sdk.src = TG_SDK_URL;
    sdk.onload = tgInit;
    document.head.appendChild(sdk);
  }

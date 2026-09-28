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

  // Telegram на ПК и в вебе открывает игру узким вертикальным окном: вместо «Поверни телефон» — кнопка полного экрана
  function tgSetupDesktopOverlay() {
    if (tgMobile()) {
      const p = document.querySelector('.rotate-phone-card p');
      if (p) p.textContent = 'Переверни телефон горизонтально. Не поворачивается — выключи блокировку поворота экрана.';
      return;
    }
    document.documentElement.classList.add('tg-desktop');
    const card = document.querySelector('.rotate-phone-card');
    if (!card) return;
    card.querySelector('.rotate-phone-icon').textContent = '🖥';
    card.querySelector('h2').textContent = 'НУЖЕН ШИРОКИЙ ЭКРАН';
    const fsOk = tgApp.isVersionAtLeast('8.0');
    card.querySelector('p').textContent = fsOk
      ? 'Окно Telegram слишком узкое для офиса. Разверни игру на весь экран.'
      : 'Окно Telegram слишком узкое для офиса. Растяни окно пошире или обнови Telegram.';
    const btn = card.querySelector('.tg-fullscreen-btn');
    if (!btn || !fsOk) return;
    btn.hidden = false;
    btn.addEventListener('click', () => tgApp.requestFullscreen());
  }

  // Сохранения дублируются в CloudStorage Telegram: localStorage WebView на iOS может очиститься.
  // Снимок всех ключей nepalsya.* режется на части по 4000 символов (лимит значения — 4096).
  const TG_CLOUD_CHUNK = 4000;
  let tgCloudTimer = 0;
  let tgCloudParts = 0;
  function tgLocalSnapshot() {
    const data = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('nepalsya.')) data[k] = localStorage.getItem(k);
      }
    } catch (_) { /* нет доступа */ }
    return data;
  }
  function tgCloudSave() {
    clearTimeout(tgCloudTimer);
    tgCloudTimer = 0;
    const json = JSON.stringify(tgLocalSnapshot());
    const parts = Math.ceil(json.length / TG_CLOUD_CHUNK);
    const cloud = tgApp.CloudStorage;
    for (let i = 0; i < parts; i++) cloud.setItem(`s${i}`, json.slice(i * TG_CLOUD_CHUNK, (i + 1) * TG_CLOUD_CHUNK));
    cloud.setItem('sn', String(parts));
    const stale = [];
    for (let i = parts; i < tgCloudParts; i++) stale.push(`s${i}`);
    if (stale.length) cloud.removeItems(stale);
    tgCloudParts = parts;
  }
  function tgCloudSaveSoon() {
    if (!tgCloudTimer) tgCloudTimer = setTimeout(tgCloudSave, 3000);
  }
  // Прогресс есть, если игрок хоть раз сохранялся (монеты, день, апгрейды)
  function tgHasLocalProgress(snapshot) {
    return Object.keys(snapshot).some(k => /^nepalsya\.(day|coins|upgrades|weekNumber|onboardingDone)$/.test(k));
  }
  function tgSetupCloudSaves() {
    if (!tgApp.isVersionAtLeast('6.9') || !tgApp.CloudStorage) return;
    const cloud = tgApp.CloudStorage;
    cloud.getItem('sn', (err, n) => {
      if (err) return;
      tgCloudParts = Number(n) || 0;
      const local = tgLocalSnapshot();
      if (tgCloudParts && !tgHasLocalProgress(local)) {
        // Локально пусто, в облаке есть прогресс — восстанавливаем и перезапускаем страницу
        const keys = Array.from({ length: tgCloudParts }, (_, i) => `s${i}`);
        cloud.getItems(keys, (err2, values) => {
          if (err2 || !values) return;
          try {
            const data = JSON.parse(keys.map(k => values[k] || '').join(''));
            Object.entries(data).forEach(([k, v]) => { if (k.startsWith('nepalsya.')) localStorage.setItem(k, v); });
            location.reload();
          } catch (_) { /* повреждённый снимок — играем с чистого листа */ }
        });
        return;
      }
      // Дальше каждая запись в store уходит и в облако (с задержкой)
      const localSet = store.set;
      store.set = (k, v) => { localSet(k, v); tgCloudSaveSoon(); };
      tgCloudSave();
    });
  }

  // «Выйти из игры»: сохраняемся (локально и в облако) и закрываем Mini App
  function tgExit() {
    if (mode === 'playing' || mode === 'paused') saveProgress();
    if (tgApp.CloudStorage && tgApp.isVersionAtLeast('6.9')) tgCloudSave();
    if (tgApp.isVersionAtLeast('6.2')) tgApp.disableClosingConfirmation();
    setTimeout(() => tgApp.close(), 300); // даём облаку принять запись
  }
  function tgSetupExitButtons() {
    document.querySelectorAll('.tg-exit').forEach(b => {
      b.hidden = false;
      b.addEventListener('click', () => { playSound('click'); tgExit(); });
    });
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
        tgApp.onEvent('fullscreenFailed', () => {
          const p = document.querySelector('.rotate-phone-card p');
          if (p && !tgMobile()) p.textContent = 'Полный экран недоступен в этой версии Telegram. Растяни окно пошире.';
        });
        tgApp.onEvent('safeAreaChanged', updateUiScale);
        tgApp.onEvent('contentSafeAreaChanged', updateUiScale);
        if (tgMobile() && !tgApp.isFullscreen) tgApp.requestFullscreen();
        tgSyncFullscreenClass();
        tgLockLandscape();
        window.addEventListener('resize', tgLockLandscape);
      }
      tgApp.BackButton.onClick(() => { if (mode === 'playing' || mode === 'paused') pauseGame(); });
      // Telegram свернули — ставим смену на паузу и сохраняемся
      tgApp.onEvent('deactivated', () => { if (mode === 'playing') pauseGame(); if (tgCloudTimer) tgCloudSave(); });
      // iOS глушит звук при сворачивании — после возврата будим AudioContext
      tgApp.onEvent('activated', () => { if (audioCtx) getAudio(); });
      tgSyncShiftControls();
      setInterval(tgSyncShiftControls, 400);
      tgPrefillPlayerName();
      tgSetupDesktopOverlay();
      tgSetupCloudSaves();
      tgSetupExitButtons();
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

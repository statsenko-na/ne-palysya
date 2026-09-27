'use strict';
// Папка: подготовка, сохранение, укрытие только во время рейда и процедурный рисунок.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { loadPlaywright } = require('./pw');

(async () => {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  const output = path.join(__dirname, '..', '.qa');
  const url = `${pathToFileURL(path.join(__dirname, '..', 'index.html')).href}#play`;
  page.on('pageerror', error => errors.push(error.message));

  const reset = async seed => page.evaluate(currentSeed => {
    localStorage.clear();
    localStorage.setItem('nepalsya.weekDone', 'true');
    localStorage.setItem('nepalsya.day', '3');
    localStorage.setItem('nepalsya.onboardingDone', 'true');
    NP_DEBUG.restart(currentSeed);
    NP_DEBUG.setDay(3);
    NP_DEBUG.clearEvents();
    NP_DEBUG.hideBanner();
    NP_DEBUG.set({ usefulness: 18, fun: 21, noPee: true });
    NP_DEBUG.setBoss(706, 446, 'office');
    NP_DEBUG.teleport(470, 452);
    NP_DEBUG.setAction('none', 0);
    nextBossCheck = 999;
    timeScale = 1;
    store.set('timeScale', 1);
    muted = false;
    store.set('muted', false);
  }, seed);

  const openPrinterChoice = async () => {
    await page.evaluate(() => NP_DEBUG.interact());
    const view = await page.evaluate(() => NP_DEBUG.actionChoiceView);
    assert(view, 'исправный ксерокс открывает выбор');
    return view;
  };
  const chooseFolder = async () => {
    const view = await openPrinterChoice();
    const index = view.options.findIndex(option => option.id === 'folder');
    assert(index >= 0, 'в выборе есть папка');
    assert.strictEqual(view.options[index].disabledReason, '', 'папка доступна в новой смене');
    const selected = await page.evaluate(optionIndex => {
      NP_DEBUG.selectActionChoice(optionIndex);
      return { action: NP_DEBUG.state.player.action, disguise: JSON.parse(JSON.stringify(ensureDisguiseExtension())) };
    }, index);
    assert.strictEqual(selected.action, 'takeFolder');
    assert.strictEqual(selected.disguise.active.phase, 'preparing');
    return selected;
  };

  try {
    fs.mkdirSync(output, { recursive: true });
    await page.goto(url);
    await page.waitForFunction(() => !!window.NP_DEBUG);

    await reset(1501);
    const choice = await openPrinterChoice();
    assert.strictEqual(choice.title, 'Ксерокс: выбрать действие');
    assert.strictEqual(choice.options.length, 3, 'единый выбор использует максимум три опции');
    assert.deepStrictEqual(choice.options.map(option => option.id), ['meme', 'distraction', 'folder']);
    assert.strictEqual(choice.options[2].label, 'Взять папку');
    await page.screenshot({ path: path.join(output, '15-printer-choice-960x540.png') });
    await page.evaluate(() => NP_DEBUG.closeActionChoice('qa-cancel'));
    assert.strictEqual((await page.evaluate(() => ensureDisguiseExtension())).active, null, 'закрытие выбора ничего не тратит');

    await reset(1502);
    await chooseFolder();
    const beforePrep = await page.evaluate(() => ({
      fun: NP_DEBUG.state.fun,
      work: NP_DEBUG.state.usefulness,
      printed: NP_DEBUG.state.stats.printed,
      actionTimer: NP_DEBUG.state.player.actionTimer,
      active: JSON.parse(JSON.stringify(ensureDisguiseExtension())).active,
    }));
    assert.strictEqual(beforePrep.fun, 21);
    assert.strictEqual(beforePrep.work, 18);
    assert.strictEqual(beforePrep.printed, 0);
    assert.ok(beforePrep.actionTimer > 1.8 && beforePrep.actionTimer <= 2);
    assert.ok(Math.abs(beforePrep.actionTimer - beforePrep.active.remainingSeconds) < 0.1, 'action timer and D3 preparation start together');
    await page.evaluate(() => NP_DEBUG.skip(1));
    const partial = await page.evaluate(() => ({ action: NP_DEBUG.state.player.action, disguise: JSON.parse(JSON.stringify(ensureDisguiseExtension())) }));
    assert.strictEqual(partial.action, 'takeFolder');
    assert.strictEqual(partial.disguise.active.phase, 'preparing');
    assert.ok(partial.disguise.active.remainingSeconds > 0.6 && partial.disguise.active.remainingSeconds <= 1.1, JSON.stringify(partial));
    const saved = await page.evaluate(() => {
      const result = NP_DEBUG.saveProgress();
      if (!result.ok) throw new Error(`save failed: ${result.reason}`);
      return result.snapshot;
    });
    assert.strictEqual(saved.extensions.disguise.active.phase, 'preparing');
    const preparingSource = saved.extensions.disguise.active.sourceId;
    await page.reload();
    await page.waitForFunction(() => !!window.NP_DEBUG);
    const resumed = await page.evaluate(() => ({
      load: NP_DEBUG.loadResult,
      action: NP_DEBUG.state.player.action,
      actionTimer: NP_DEBUG.state.player.actionTimer,
      disguise: JSON.parse(JSON.stringify(ensureDisguiseExtension())),
    }));
    assert.strictEqual(resumed.load.status, 'resumed');
    assert.strictEqual(resumed.action, 'takeFolder');
    assert.strictEqual(resumed.disguise.active.phase, 'preparing');
    assert.strictEqual(resumed.disguise.active.sourceId, preparingSource);
    assert.ok(Math.abs(resumed.actionTimer - resumed.disguise.active.remainingSeconds) < 0.25, 'action timer and D3 preparation resume together');
    await page.evaluate(() => NP_DEBUG.skip(1.1));
    const held = await page.evaluate(() => ({
      state: NP_DEBUG.state,
      disguise: JSON.parse(JSON.stringify(ensureDisguiseExtension())),
      cover: disguiseCoverStatus(),
    }));
    assert.strictEqual(held.state.player.action, 'none');
    assert.strictEqual(held.disguise.used, true);
    assert.strictEqual(held.disguise.active.phase, 'active');
    assert.ok(held.disguise.active.remainingSeconds > 10.5 && held.disguise.active.remainingSeconds <= 12);
    assert.strictEqual(held.cover.cover, false, 'в обычном офисе папка не создаёт прикрытие');
    assert.strictEqual(held.state.fun, 21, 'подготовка не даёт кайф');
    assert.strictEqual(held.state.usefulness, 18, 'подготовка не даёт план');
    assert.strictEqual(held.state.stats.printed, 0, 'папка не считается печатью');
    await page.waitForTimeout(120);
    await page.screenshot({ path: path.join(output, '15-folder-left-960x540.png') });
    await page.evaluate(() => { player.facingX = 1; });
    await page.waitForTimeout(100);
    await page.screenshot({ path: path.join(output, '15-folder-right-960x540.png') });

    const movingRaid = await page.evaluate(() => {
      NP_DEBUG.teleport(500, 452);
      NP_DEBUG.setBoss(460, 452, 'inspect', 0);
      boss.inspectTimer = 4;
      boss.inspectAge = 0;
      boss.mode = 'floor';
      boss.lookTimer = 99;
      boss.suspicion = 30;
      player.moving = true;
      const visible = playerVisibleToBoss();
      const cover = disguiseCoverStatus();
      updateBoss(0.05);
      return { visible, cover, suspicion: boss.suspicion, working: playerIsWorking(), held: !!ensureDisguiseExtension().active };
    });
    assert.strictEqual(movingRaid.visible, true, 'Д.Н. видит движущегося Быкентия');
    assert.strictEqual(movingRaid.cover.cover, true, 'во время рейда папка покрывает на ходу дальше 34 ед.');
    assert.strictEqual(movingRaid.suspicion, 30, 'папка останавливает только рост подозрения рейда');
    assert.strictEqual(movingRaid.working, false, 'папка не подменяет playerIsWorking');
    assert.strictEqual(movingRaid.held, true);

    const closeRaid = await page.evaluate(() => {
      NP_DEBUG.setBoss(466, 452, 'inspect', 0);
      boss.inspectTimer = 4;
      boss.inspectAge = 0;
      boss.mode = 'floor';
      boss.lookTimer = 99;
      boss.suspicion = 30;
      player.moving = true;
      const visible = playerVisibleToBoss();
      const cover = disguiseCoverStatus();
      updateBoss(0.05);
      const warnedSource = saveExtensions.disguise.folderQuestionSourceId;
      updateBoss(0.05);
      return {
        visible,
        cover,
        suspicion: boss.suspicion,
        warnedSource,
        activeSource: saveExtensions.disguise.active.sourceId,
        questionCount: bubbles.filter(bubble => bubble.owner === 'boss' && bubble.text === 'А в папке что?').length,
      };
    });
    assert.strictEqual(closeRaid.visible, true);
    assert.strictEqual(closeRaid.cover.cover, false, 'на расстоянии 34 ед. папка не прикрывает');
    assert.strictEqual(closeRaid.cover.reason, 'boss_too_close');
    assert.ok(closeRaid.suspicion > 30, 'при тесном контакте обычная проверка остаётся опасной');
    assert.strictEqual(closeRaid.warnedSource, closeRaid.activeSource);
    assert.strictEqual(closeRaid.questionCount, 1, 'Д.Н. задаёт вопрос о папке один раз за попытку');

    const stopped = await page.evaluate(() => {
      NP_DEBUG.setBoss(460, 452, 'inspect', 0);
      boss.inspectTimer = 4;
      boss.inspectAge = 0;
      boss.mode = 'floor';
      boss.lookTimer = 99;
      boss.suspicion = 30;
      player.moving = false;
      const before = saveExtensions.disguise.active.remainingSeconds;
      const cover = disguiseCoverStatus();
      updateBoss(0.05);
      return { cover, before, after: saveExtensions.disguise.active.remainingSeconds, suspicion: boss.suspicion };
    });
    assert.strictEqual(stopped.cover.cover, false, 'остановка снимает прикрытие');
    assert.ok(stopped.after < stopped.before, 'таймер идёт, пока игрок стоит');
    assert.ok(stopped.suspicion > 30);

    const waitDesk = await page.evaluate(() => {
      NP_DEBUG.setBoss(500, 452, 'waitDesk', 0);
      boss.waitT = 5;
      boss.suspicion = 30;
      player.moving = true;
      const cover = disguiseCoverStatus();
      updateBoss(0.05);
      return { cover, suspicion: boss.suspicion, working: playerIsWorking() };
    });
    assert.strictEqual(waitDesk.cover.cover, false, 'папка не действует в ожидании у пустого стола');
    assert.ok(waitDesk.suspicion > 30, 'waitDesk сохраняет прежний рост подозрения');
    assert.strictEqual(waitDesk.working, false);

    await reset(1503);
    await chooseFolder();
    await page.evaluate(() => NP_DEBUG.endAction('cancel'));
    const canceledPrep = await page.evaluate(() => JSON.parse(JSON.stringify(ensureDisguiseExtension())));
    assert.strictEqual(canceledPrep.active, null);
    assert.strictEqual(canceledPrep.used, false, 'прерванная подготовка сохраняет заряд');

    await reset(1504);
    await chooseFolder();
    await page.evaluate(() => NP_DEBUG.skip(2.1));
    await page.evaluate(() => {
      player.moving = false;
      startAction('smoke', 7);
      tickDisguiseAdapter(0.05);
    });
    const rest = await page.evaluate(() => JSON.parse(JSON.stringify(ensureDisguiseExtension())));
    assert.strictEqual(rest.active, null, 'начало отдыха удаляет папку');
    assert.strictEqual(rest.used, true, 'отдых не возвращает заряд папки');

    await reset(1505);
    await page.evaluate(() => NP_DEBUG.startEvent('jam'));
    await page.evaluate(() => NP_DEBUG.interact());
    const jammed = await page.evaluate(() => ({ action: NP_DEBUG.state.player.action, choice: NP_DEBUG.actionChoiceView }));
    assert.strictEqual(jammed.action, 'fixjam', 'сломанный принтер оставляет только починку');
    assert.strictEqual(jammed.choice, null);

    await reset(1506);
    await chooseFolder();
    await page.evaluate(() => NP_DEBUG.skip(14.2));
    const usedChoice = await openPrinterChoice();
    const folderOption = usedChoice.options.find(option => option.id === 'folder');
    assert.strictEqual(folderOption.disabledReason, 'Папку уже брали сегодня');

    await reset(1507);
    await chooseFolder();
    await page.evaluate(() => NP_DEBUG.skip(2.1));
    await page.evaluate(() => NP_DEBUG.skip(12.1));
    const expired = await page.evaluate(() => JSON.parse(JSON.stringify(ensureDisguiseExtension())));
    assert.strictEqual(expired.active, null);
    assert.strictEqual(expired.used, true, 'истёкшая папка не восстанавливает заряд');
    assert.strictEqual(expired.lastOutcome, 'expired');

    await reset(1508);
    await chooseFolder();
    await page.evaluate(() => NP_DEBUG.skip(2.1));
    const ended = await page.evaluate(() => {
      NP_DEBUG.finish('qa');
      tickDisguiseAdapter(0.05);
      return { mode: NP_DEBUG.state.mode, disguise: JSON.parse(JSON.stringify(ensureDisguiseExtension())) };
    });
    assert.strictEqual(ended.mode, 'ended');
    assert.strictEqual(ended.disguise.active, null, 'конец смены очищает папку');

    await reset(1509);
    const newShift = await page.evaluate(() => JSON.parse(JSON.stringify(ensureDisguiseExtension())));
    assert.strictEqual(newShift.used, false, 'новая смена сбрасывает заряд');
    assert.strictEqual(newShift.active, null);
    assert.deepStrictEqual(errors, [], `page errors: ${errors.join('; ')}`);
    console.log('Office stories card 15 passed: printer choice, prep/save, moving raid cover, close contact, rest, expiry, shift reset, and Canvas attachment.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

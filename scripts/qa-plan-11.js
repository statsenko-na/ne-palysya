'use strict';
// Интеграция балконного инсайда: выбор, отмена, сохранение и отсутствие лишних наград.
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

  const reset = async (seed, dayIndex = 1) => page.evaluate(({ value, day }) => {
    localStorage.clear();
    localStorage.setItem('nepalsya.weekDone', 'true');
    localStorage.setItem('nepalsya.day', String(day));
    localStorage.setItem('nepalsya.onboardingDone', 'true');
    NP_DEBUG.restart(value);
    NP_DEBUG.setDay(day);
    NP_DEBUG.clearEvents();
    NP_DEBUG.hideBanner();
    NP_DEBUG.teleport(870, 220);
    NP_DEBUG.setBoss(706, 446, 'office');
    NP_DEBUG.setAction('none', 0);
    NP_DEBUG.set({ usefulness: 12, fun: 0, noPee: true });
  }, { value: seed, day: dayIndex });

  const smokeAndFinish = async () => {
    await page.evaluate(() => { NP_DEBUG.teleport(870, 220); NP_DEBUG.interact(); });
    assert.strictEqual(await page.evaluate(() => NP_DEBUG.state.player.action), 'smoke');
    await page.evaluate(() => NP_DEBUG.skip(7.05));
  };
  const selectListen = async () => {
    assert.strictEqual(await page.evaluate(() => NP_DEBUG.actionChoice && NP_DEBUG.actionChoice.id), 'smoke-listening');
    await page.evaluate(() => NP_DEBUG.selectActionChoice(0));
  };
  const savedActivities = async () => page.evaluate(() => {
    const result = NP_DEBUG.saveProgress();
    if (!result.ok) throw new Error(`save failed: ${result.reason}`);
    return result.snapshot.extensions.activities;
  });

  try {
    fs.mkdirSync(output, { recursive: true });
    await page.goto(url);
    await page.waitForFunction(() => !!window.NP_DEBUG);

    await reset(1101, 1);
    await smokeAndFinish();
    let state = await page.evaluate(() => ({ game: NP_DEBUG.state, choice: NP_DEBUG.actionChoiceView }));
    assert.strictEqual(state.game.stats.cigarettes, 1, 'обычная сигарета засчитана до выбора');
    assert.strictEqual(state.choice.title, 'Можно прислушаться: ещё 3 с');
    assert.deepStrictEqual(state.choice.options.map(option => option.label), ['Прислушаться', 'Потом']);
    await page.screenshot({ path: path.join(output, '11-smoke-listening-choice-960x540.png') });

    const beforeReload = await page.evaluate(() => {
      NP_DEBUG.selectActionChoice(0);
      const beforeFun = NP_DEBUG.state.fun;
      NP_DEBUG.skip(2);
      const result = NP_DEBUG.saveProgress();
      if (!result.ok) throw new Error(`save failed: ${result.reason}`);
      return { beforeFun, fun: NP_DEBUG.state.fun, snapshot: result.snapshot };
    });
    assert.strictEqual(await page.evaluate(() => NP_DEBUG.state.player.action), 'smoke');
    const beforeFun = beforeReload.beforeFun;
    let activities = beforeReload.snapshot.extensions.activities;
    assert.strictEqual(activities.active.variant, 'smoke-listening');
    assert.ok(Math.abs(activities.active.remainingSeconds - 1) <= 0.06, 'сохранён остаток после двух секунд');
    assert.ok(Math.abs(activities.active.elapsedSeconds - 2) <= 0.06, 'сохранение сделано после двух секунд прослушивания');
    await page.keyboard.press('p');
    const pausedBefore = await page.evaluate(() => NP_DEBUG.saveProgress().snapshot);
    await page.waitForTimeout(180);
    const pausedAfter = await page.evaluate(() => NP_DEBUG.saveProgress().snapshot);
    assert.strictEqual(await page.evaluate(() => NP_DEBUG.state.mode), 'paused');
    assert.strictEqual(pausedAfter.player.actionTimer, pausedBefore.player.actionTimer, 'пауза останавливает таймер действия');
    assert.strictEqual(pausedAfter.extensions.activities.active.elapsedSeconds, pausedBefore.extensions.activities.active.elapsedSeconds, 'пауза останавливает модель');
    await page.keyboard.press('p');
    await page.reload();
    await page.waitForFunction(() => !!window.NP_DEBUG);
    const loaded = await page.evaluate(() => ({ game: NP_DEBUG.state, snapshot: NP_DEBUG.saveProgress().snapshot, load: NP_DEBUG.loadResult }));
    state = loaded.game;
    activities = loaded.snapshot.extensions.activities;
    assert.strictEqual(loaded.load.status, 'resumed', 'reload восстанавливает смену');
    assert.strictEqual(state.player.action, 'smoke');
    assert.ok(state.player.actionTimer > 0 && state.player.actionTimer <= beforeReload.snapshot.player.actionTimer, 'таймер продолжает восстановленный остаток');
    assert.ok(Math.abs(state.player.actionTimer - activities.active.remainingSeconds) <= 0.1, 'таймер действия и модель остаются синхронны');
    const resumedFun = state.fun;
    const completed = await page.evaluate(() => {
      let steps = 0;
      while (NP_DEBUG.state.player.action === 'smoke' && steps < 20) { NP_DEBUG.skip(0.05); steps++; }
      const result = NP_DEBUG.saveProgress();
      if (!result.ok) throw new Error(`save failed: ${result.reason}`);
      return { game: NP_DEBUG.state, moments: NP_DEBUG.moments, snapshot: result.snapshot };
    });
    state = completed;
    activities = completed.snapshot.extensions.activities;
    assert.strictEqual(state.game.player.action, 'none');
    assert.strictEqual(state.game.stats.cigarettes, 1, 'прослушивание не считает вторую сигарету');
    assert.ok(state.snapshot.intelTimer >= 19.99, 'инсайд получает 20 секунд');
    assert.strictEqual(activities.listeningCompleted, true);
    assert.strictEqual(activities.intelGranted, true);
    assert.strictEqual(activities.active, null);
    assert.ok(Math.abs(state.game.fun - resumedFun) < 0.01, 'прослушивание не приносит кайф');
    assert.deepStrictEqual(state.moments.variety.completedKinds, ['smoke'], 'прослушивание не добавляет вид разнообразия');
    assert.strictEqual(state.moments.variety.completedSources.length, 1, 'прослушивание не записывается как второе завершённое действие');
    assert.strictEqual(beforeFun, resumedFun, 'reload не начисляет кайф за прослушивание');
    await page.screenshot({ path: path.join(output, '11-smoke-listening-intel-960x540.png') });

    await page.evaluate(() => { NP_DEBUG.setBoss(870, 220, 'gone'); });
    const unavailableText = await page.evaluate(() => bossIntelStatusText());
    assert.strictEqual(unavailableText, 'Д.Н. уехал');
    assert.ok(!unavailableText.includes('проверка через'), 'при уходе не обещается точный срок');

    await reset(1102, 1);
    await smokeAndFinish();
    await page.evaluate(() => { NP_DEBUG.selectActionChoice(0); NP_DEBUG.skip(2.9); NP_DEBUG.endAction('cancel'); });
    state = await page.evaluate(() => ({ game: NP_DEBUG.state, moments: NP_DEBUG.moments }));
    activities = await savedActivities();
    assert.strictEqual((await page.evaluate(() => NP_DEBUG.saveProgress().snapshot.intelTimer)), 0, 'отмена на 2.9 секунды не выдаёт инсайд');
    assert.strictEqual(state.game.stats.cigarettes, 1);
    assert.strictEqual(state.moments.variety.completedSources.length, 1);
    assert.strictEqual(activities.active, null);
    assert.strictEqual(activities.smokePrompted, false, 'после отмены можно повторить попытку');
    await smokeAndFinish();
    assert.strictEqual((await page.evaluate(() => NP_DEBUG.actionChoice)).id, 'smoke-listening');
    await selectListen();
    await page.evaluate(() => NP_DEBUG.skip(3.05));
    state = await page.evaluate(() => NP_DEBUG.state);
    assert.ok((await page.evaluate(() => NP_DEBUG.saveProgress().snapshot.intelTimer)) >= 19.8, 'повторная попытка завершается полностью');
    assert.strictEqual(state.stats.cigarettes, 2, 'повторное прослушивание не добавляет сигарету');
    await smokeAndFinish();
    state = await page.evaluate(() => ({ game: NP_DEBUG.state, choice: NP_DEBUG.actionChoice, moments: NP_DEBUG.moments }));
    assert.strictEqual(state.game.stats.cigarettes, 3, 'следующий обычный перекур считается отдельно');
    assert.strictEqual(state.choice, null, 'после полученного инсайда выбор не повторяется');
    assert.strictEqual(state.moments.variety.completedSources.length, 3, 'записываются только три обычных перекура');

    await reset(1103, 1);
    await smokeAndFinish();
    await selectListen();
    await page.evaluate(() => { NP_DEBUG.skip(2.9); NP_DEBUG.chatPerk('hlad'); NP_DEBUG.skip(0.1); });
    state = await page.evaluate(() => NP_DEBUG.state);
    assert.ok((await page.evaluate(() => NP_DEBUG.saveProgress().snapshot.intelTimer)) >= 44.8, 'инсайд балкона не сокращает оставшийся инсайд Хлада на 45 секунд');

    await reset(1104, 0);
    await smokeAndFinish();
    state = await page.evaluate(() => ({ game: NP_DEBUG.state, choice: NP_DEBUG.actionChoice }));
    assert.strictEqual(state.game.stats.cigarettes, 1);
    assert.strictEqual(state.choice, null, 'в понедельник первой недели дополнительного выбора нет');

    await page.evaluate(() => NP_DEBUG.finish('fired'));
    await page.evaluate(() => {
      NP_DEBUG.restart(1105);
      NP_DEBUG.setDay(1);
      NP_DEBUG.clearEvents();
      NP_DEBUG.hideBanner();
      NP_DEBUG.teleport(870, 220);
      NP_DEBUG.setBoss(706, 446, 'office');
      NP_DEBUG.setAction('none', 0);
    });
    await smokeAndFinish();
    activities = await savedActivities();
    assert.strictEqual(activities.listeningCompleted, false, 'новая смена начинает модель заново');
    assert.strictEqual((await page.evaluate(() => NP_DEBUG.actionChoice)).id, 'smoke-listening');
    await page.evaluate(() => { NP_DEBUG.selectActionChoice(0); NP_DEBUG.skip(0.5); NP_DEBUG.finish('fired'); });
    assert.strictEqual(await page.evaluate(() => NP_DEBUG.state.mode), 'ended', 'конец смены закрывает активную попытку');

    assert.deepStrictEqual(errors, [], `ошибки браузера: ${errors.join('; ')}`);
    process.stdout.write('qa-plan-11: все проверки пройдены\n');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

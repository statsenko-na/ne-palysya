'use strict';
// Интеграция тихого и громкого YouTube: выбор, шум, отмена, reload и баланс.
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

  const reset = async (seed) => page.evaluate(value => {
    localStorage.clear();
    localStorage.setItem('nepalsya.weekDone', 'true');
    localStorage.setItem('nepalsya.day', '1');
    localStorage.setItem('nepalsya.onboardingDone', 'true');
    NP_DEBUG.restart(value);
    NP_DEBUG.setDay(1);
    NP_DEBUG.clearEvents();
    NP_DEBUG.hideBanner();
    NP_DEBUG.teleport(870, 430);
    NP_DEBUG.setBoss(706, 446, 'office');
    NP_DEBUG.setAction('none', 0);
    NP_DEBUG.set({ usefulness: 12, fun: 0, noPee: true });
    timeScale = 1;
    store.set('timeScale', 1);
    muted = false;
    store.set('muted', false);
  }, seed);

  const openChoice = async () => {
    await page.evaluate(() => { NP_DEBUG.teleport(870, 430); NP_DEBUG.interact(); });
    const choice = await page.evaluate(() => NP_DEBUG.actionChoiceView);
    assert(choice, 'E в серверной открывает выбор');
    return choice;
  };
  const snapshot = async () => page.evaluate(() => {
    const result = NP_DEBUG.saveProgress();
    if (!result.ok) throw new Error(`save failed: ${result.reason}`);
    return result.snapshot;
  });
  const finishSelectedVideo = async index => page.evaluate(optionIndex => {
    const funBefore = NP_DEBUG.state.fun;
    NP_DEBUG.selectActionChoice(optionIndex);
    const funAtStart = NP_DEBUG.state.fun;
    const activityAtStart = NP_DEBUG.saveProgress().snapshot.extensions.activities.active;
    let steps = 0;
    while (NP_DEBUG.state.player.action === 'youtube' && steps < 300) { NP_DEBUG.skip(0.05); steps++; }
    const result = NP_DEBUG.saveProgress();
    if (!result.ok) throw new Error(`save failed: ${result.reason}`);
    return { funBefore, funAtStart, game: NP_DEBUG.state, moments: NP_DEBUG.moments, snapshot: result.snapshot, steps, activityAtStart };
  }, index);

  try {
    fs.mkdirSync(output, { recursive: true });
    await page.goto(url);
    await page.waitForFunction(() => !!window.NP_DEBUG);

    await reset(1201);
    let choice = await openChoice();
    assert.strictEqual(choice.title, 'Серверная: выбрать риск');
    assert.deepStrictEqual(choice.options.map(option => option.label), ['Тихо', 'Со звуком']);
    assert.ok(choice.options[0].detail.includes('40'));
    assert.ok(choice.options[1].detail.includes('33'));
    await page.screenshot({ path: path.join(output, '12-youtube-choice-960x540.png') });
    let result = await finishSelectedVideo(0);
    assert.strictEqual(result.funAtStart, result.funBefore, 'выбор не выдаёт стартовый бонус');
    assert.strictEqual(result.activityAtStart.variant, 'youtube-quiet');
    assert.strictEqual(result.activityAtStart.durationSeconds, 8);
    assert.strictEqual(result.activityAtStart.rate, 5);
    assert.strictEqual(result.game.stats.videos, 1, 'завершённый тихий ролик учитывается один раз');
    assert.ok(Math.abs(result.game.fun - result.funBefore - 40) < 0.02, 'тихий ролик даёт ровно 40 до множителя');
    assert.strictEqual(result.snapshot.extensions.activities.active, null);
    assert.deepStrictEqual(result.moments.variety.completedKinds, ['youtube']);
    assert.strictEqual(result.moments.variety.completedSources.length, 1, 'тихий вариант даёт один moment');

    await reset(1202);
    await page.evaluate(() => { muted = true; store.set('muted', true); });
    await openChoice();
    const loudStart = await page.evaluate(() => {
      NP_DEBUG.selectActionChoice(1);
      const funBefore = NP_DEBUG.state.fun;
      const active = NP_DEBUG.saveProgress().snapshot.extensions.activities.active;
      NP_DEBUG.skip(2.9);
      const beforeNoise = NP_DEBUG.saveProgress().snapshot;
      NP_DEBUG.skip(0.15);
      const afterNoise = NP_DEBUG.saveProgress().snapshot;
      return {
        funBefore, active, beforeNoise,
        afterNoise,
        boss: NP_DEBUG.state.boss,
        distance: Math.hypot(NP_DEBUG.state.boss.x - NP_DEBUG.state.player.x, NP_DEBUG.state.boss.y - NP_DEBUG.state.player.y),
        reprimands: NP_DEBUG.state.reprimands,
      };
    });
    assert.strictEqual(loudStart.active.variant, 'youtube-loud');
    assert.strictEqual(loudStart.active.durationSeconds, 6);
    assert.strictEqual(loudStart.active.rate, 5.5);
    assert.strictEqual(loudStart.beforeNoise.extensions.activities.active.noiseTriggered, false, 'шум не возникает до третьей секунды');
    assert.strictEqual(loudStart.afterNoise.extensions.activities.active.noiseTriggered, true, 'шум срабатывает один раз на третьей секунде');
    assert.ok(loudStart.distance <= 220, 'начальник находится в радиусе шума');
    assert.strictEqual(loudStart.boss.spotDesc, 'серверную', 'начальник направлен к доступной точке у серверной');
    assert.ok(['patrol', 'look'].includes(loudStart.boss.state));
    assert.strictEqual(loudStart.reprimands, 0, 'шум не выдаёт прямой выговор');
    assert.strictEqual(loudStart.afterNoise.stats.videos, 0, 'незавершённое видео не считается');
    await page.screenshot({ path: path.join(output, '12-youtube-noise-near-960x540.png') });

    await page.reload();
    await page.waitForFunction(() => !!window.NP_DEBUG);
    const loaded = await page.evaluate(() => ({
      state: NP_DEBUG.state,
      load: NP_DEBUG.loadResult,
      snapshot: NP_DEBUG.saveProgress().snapshot,
    }));
    assert.strictEqual(loaded.load.status, 'resumed', 'после шума смена восстанавливается');
    assert.strictEqual(loaded.snapshot.extensions.activities.active.variant, 'youtube-loud');
    assert.strictEqual(loaded.snapshot.extensions.activities.active.noiseTriggered, true, 'флаг шума сохранён через reload');
    assert.strictEqual(loaded.state.stats.videos, 0);
    const loudDone = await page.evaluate(() => {
      NP_DEBUG.setBoss(260, 146, 'look');
      let steps = 0;
      while (NP_DEBUG.state.player.action === 'youtube' && steps < 160) { NP_DEBUG.skip(0.05); steps++; }
      const saved = NP_DEBUG.saveProgress();
      if (!saved.ok) throw new Error(`save failed: ${saved.reason}`);
      return { game: NP_DEBUG.state, snapshot: saved.snapshot };
    });
    assert.strictEqual(loudDone.game.stats.videos, 1, 'громкое видео учитывается ровно один раз после reload');
    assert.ok(Math.abs(loudDone.game.fun - 33) < 0.03, 'громкий ролик даёт ровно 33 до множителя');
    assert.strictEqual(loudDone.game.boss.state, 'look', 'сохранённый noiseTriggered не перенаправляет начальника повторно');
    assert.strictEqual(loudDone.snapshot.extensions.activities.active, null);

    await reset(1203);
    await page.evaluate(() => NP_DEBUG.setBoss(260, 146, 'patrol'));
    await openChoice();
    let far = await page.evaluate(() => {
      NP_DEBUG.selectActionChoice(1);
      NP_DEBUG.skip(3.05);
      const save = NP_DEBUG.saveProgress().snapshot;
      return { game: NP_DEBUG.state, activities: save.extensions.activities };
    });
    assert.ok(Math.hypot(far.game.boss.x - far.game.player.x, far.game.boss.y - far.game.player.y) > 220);
    assert.ok(far.activities.active.noiseTriggered, 'дальний шум отмечается, но не создаёт повторную возможность');
    assert.notStrictEqual(far.game.boss.spotDesc, 'серверную', 'далёкий начальник не перемещается');

    await reset(1204);
    await page.evaluate(() => NP_DEBUG.setBoss(706, 446, 'office'));
    await openChoice();
    const canceledBeforeNoise = await page.evaluate(() => {
      NP_DEBUG.selectActionChoice(1);
      NP_DEBUG.skip(2.9);
      NP_DEBUG.endAction('cancel');
      return { game: NP_DEBUG.state, snapshot: NP_DEBUG.saveProgress().snapshot };
    });
    assert.strictEqual(canceledBeforeNoise.game.stats.videos, 0);
    assert.strictEqual(canceledBeforeNoise.game.boss.spotDesc, 'кабинет', 'отмена до шума не направляет начальника');
    assert.strictEqual(canceledBeforeNoise.snapshot.extensions.activities.active, null);

    await reset(1205);
    await page.evaluate(() => NP_DEBUG.setBoss(706, 446, 'office'));
    await openChoice();
    const canceledAfterNoise = await page.evaluate(() => {
      NP_DEBUG.selectActionChoice(1);
      NP_DEBUG.skip(3.05);
      const routeDesc = NP_DEBUG.state.boss.spotDesc;
      NP_DEBUG.endAction('cancel');
      return { game: NP_DEBUG.state, routeDesc, snapshot: NP_DEBUG.saveProgress().snapshot };
    });
    assert.strictEqual(canceledAfterNoise.routeDesc, 'серверную', 'уже случившийся шум остаётся после отмены');
    assert.strictEqual(canceledAfterNoise.game.stats.videos, 0, 'отмена после шума не засчитывает видео');
    assert.strictEqual(canceledAfterNoise.snapshot.extensions.activities.active, null);

    await reset(1206);
    await page.evaluate(() => NP_DEBUG.setBoss(706, 446, 'gone'));
    await openChoice();
    const busy = await page.evaluate(() => {
      NP_DEBUG.selectActionChoice(1);
      NP_DEBUG.skip(3.05);
      return { game: NP_DEBUG.state, snapshot: NP_DEBUG.saveProgress().snapshot };
    });
    assert.strictEqual(busy.game.boss.state, 'gone', 'шум не прерывает состояние ухода');
    assert.notStrictEqual(busy.game.boss.spotDesc, 'серверную');
    assert.strictEqual(busy.game.reprimands, 0, 'шум не наказывает сквозь состояние ухода');
    await page.screenshot({ path: path.join(output, '12-youtube-noise-busy-960x540.png') });

    for (const [index, state] of ['inspect', 'waitDesk', 'lecture', 'gone', 'out', 'standup', 'daily'].entries()) {
      await reset(1212 + index);
      if (state === 'standup') await page.evaluate(() => NP_DEBUG.startEvent('standup'));
      await page.evaluate(bossState => NP_DEBUG.setBoss(706, 446, bossState), state);
      await openChoice();
      const blockedState = await page.evaluate(() => {
        NP_DEBUG.selectActionChoice(1);
        NP_DEBUG.skip(3.05);
        return NP_DEBUG.state;
      });
      assert.notStrictEqual(blockedState.boss.spotDesc, 'серверную', `шум не перенаправляет Д.Н. в состоянии ${state}`);
      assert.strictEqual(blockedState.reprimands, 0, `шум не выдаёт прямой выговор в состоянии ${state}`);
    }

    await reset(1220);
    await openChoice();
    await page.evaluate(() => { NP_DEBUG.selectActionChoice(0); NP_DEBUG.skip(1); });
    await page.keyboard.press('KeyP');
    const pausedBefore = await page.evaluate(() => ({
      mode: NP_DEBUG.state.mode,
      active: NP_DEBUG.saveProgress().snapshot.extensions.activities.active,
    }));
    await page.waitForTimeout(200);
    const pausedAfter = await page.evaluate(() => NP_DEBUG.saveProgress().snapshot.extensions.activities.active);
    assert.strictEqual(pausedBefore.mode, 'paused');
    assert.strictEqual(pausedAfter.elapsedSeconds, pausedBefore.active.elapsedSeconds, 'пауза не продвигает YouTube-модель');
    await page.keyboard.press('KeyP');
    const resumed = await page.evaluate(() => {
      const before = NP_DEBUG.saveProgress().snapshot.extensions.activities.active.elapsedSeconds;
      NP_DEBUG.skip(0.5);
      const after = NP_DEBUG.saveProgress().snapshot.extensions.activities.active.elapsedSeconds;
      return { before, after };
    });
    assert.ok(resumed.after > resumed.before, 'после паузы YouTube-модель продолжает идти');

    await reset(1221);
    await openChoice();
    await page.evaluate(() => { NP_DEBUG.selectActionChoice(1); NP_DEBUG.skip(3.05); });
    const beforeNewShift = await snapshot();
    assert.strictEqual(beforeNewShift.extensions.activities.active.noiseTriggered, true);
    await reset(1222);
    const newShift = await snapshot();
    assert.ok(!newShift.extensions.activities || newShift.extensions.activities.active === null, 'новая смена сбрасывает активное видео и импульс');

    await reset(1223);
    await openChoice();
    await page.evaluate(() => { NP_DEBUG.selectActionChoice(0); NP_DEBUG.skip(1); NP_DEBUG.finish('win'); });
    const ended = await page.evaluate(() => ({
      game: NP_DEBUG.state,
      progress: NP_DEBUG.saveProgress(),
      saved: JSON.parse(localStorage.getItem('nepalsya.currentSave')),
    }));
    assert.strictEqual(ended.game.mode, 'ended');
    assert.strictEqual(ended.game.player.action, 'none', 'конец смены отменяет незавершённое видео');
    assert.strictEqual(ended.game.stats.videos, 0, 'незавершённое видео не учитывается при конце смены');
    assert.strictEqual(ended.progress.reason, 'save_unavailable');
    assert.strictEqual(ended.saved, null, 'конец смены удаляет сохранение прерванного видео');

    await reset(1207);
    await page.evaluate(() => NP_DEBUG.startEvent('internet'));
    await page.evaluate(() => { NP_DEBUG.teleport(870, 430); NP_DEBUG.interact(); });
    assert.strictEqual(await page.evaluate(() => NP_DEBUG.actionChoice), null, 'при отключённом интернете выбор не открывается');
    assert.strictEqual(await page.evaluate(() => NP_DEBUG.state.player.action), 'none');

    await reset(1208);
    await openChoice();
    await page.evaluate(() => NP_DEBUG.startEvent('internet'));
    choice = await page.evaluate(() => NP_DEBUG.actionChoiceView);
    assert.ok(choice.options.every(option => option.disabledReason === 'Интернет отключён'), 'интернет отключает обе опции в открытом выборе');
    await page.evaluate(() => NP_DEBUG.selectActionChoice(0));
    assert.strictEqual(await page.evaluate(() => NP_DEBUG.state.player.action), 'none');
    assert.strictEqual((await page.evaluate(() => NP_DEBUG.actionChoice)).id, 'youtube-risk');

    await reset(1209);
    const autoVariant = await page.evaluate(() => {
      toggleAutopilot();
      NP_DEBUG.interact();
      const active = NP_DEBUG.saveProgress().snapshot.extensions.activities.active;
      NP_DEBUG.stopAutopilot();
      return { active, choice: NP_DEBUG.actionChoice, action: NP_DEBUG.state.player.action };
    });
    assert.strictEqual(autoVariant.active.variant, 'youtube-quiet', 'автопилот выбирает тихое видео');
    assert.strictEqual(autoVariant.choice, null);
    assert.strictEqual(autoVariant.action, 'youtube');

    await reset(1210);
    const slowStart = await page.evaluate(() => {
      timeScale = 0.5;
      NP_DEBUG.teleport(870, 430); NP_DEBUG.interact(); NP_DEBUG.selectActionChoice(0);
      return NP_DEBUG.state.player.actionTimer;
    });
    await page.waitForTimeout(500);
    const slowRemaining = await page.evaluate(() => NP_DEBUG.state.player.actionTimer);
    assert.ok(slowStart - slowRemaining > 0.1 && slowStart - slowRemaining < 0.7, 'скорость ×0.5 замедляет вариант по симуляционному времени');

    await reset(1211);
    const fastStart = await page.evaluate(() => {
      timeScale = 3;
      NP_DEBUG.teleport(870, 430); NP_DEBUG.interact(); NP_DEBUG.selectActionChoice(1);
      return NP_DEBUG.state.player.actionTimer;
    });
    await page.waitForTimeout(500);
    const fastState = await page.evaluate(() => ({ game: NP_DEBUG.state, snapshot: NP_DEBUG.saveProgress().snapshot }));
    const fastElapsed = fastStart - fastState.game.player.actionTimer;
    assert.ok(fastElapsed > 0.9 && fastElapsed < 2.2, 'скорость ×3 ускоряет вариант по симуляционному времени');
    assert.strictEqual(fastState.snapshot.extensions.activities.active.noiseTriggered, false, 'до трёх симуляционных секунд громкий импульс не срабатывает');

    assert.deepStrictEqual(errors, [], `ошибки браузера: ${errors.join('; ')}`);
    process.stdout.write('qa-plan-12: все проверки пройдены\n');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

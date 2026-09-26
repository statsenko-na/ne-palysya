'use strict';
// Холодильник: варианты, таймер, отмена, сериализация и пятничная цель.
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

  const reset = async (seed, day = 2) => page.evaluate(({ seed: currentSeed, day: currentDay }) => {
    localStorage.clear();
    localStorage.setItem('nepalsya.weekDone', 'true');
    localStorage.setItem('nepalsya.day', String(currentDay));
    localStorage.setItem('nepalsya.onboardingDone', 'true');
    NP_DEBUG.setDay(currentDay);
    NP_DEBUG.restart(currentSeed);
    NP_DEBUG.setDay(currentDay);
    NP_DEBUG.clearEvents();
    NP_DEBUG.hideBanner();
    NP_DEBUG.set({ usefulness: 0, fun: 20, noPee: true });
    NP_DEBUG.setBoss(706, 446, 'office');
    NP_DEBUG.teleport(42, 190);
    NP_DEBUG.setAction('none', 0);
    nextBossCheck = 999;
    timeScale = 1;
    store.set('timeScale', 1);
    muted = false;
    store.set('muted', false);
  }, { seed, day });

  const openChoice = async () => {
    await page.evaluate(() => NP_DEBUG.interact());
    const view = await page.evaluate(() => NP_DEBUG.actionChoiceView);
    assert(view, 'холодильник открывает меню вариантов');
    return view;
  };

  try {
    fs.mkdirSync(output, { recursive: true });
    await page.goto(url);
    await page.waitForFunction(() => !!window.NP_DEBUG);

    await reset(1601);
    let view = await openChoice();
    assert.strictEqual(view.id, 'fridge-choice');
    assert.deepStrictEqual(view.options.map(option => option.id), ['own', 'yogurt']);
    assert.strictEqual(view.options[0].detail, '4,5 с · 3 кайфа/с · итого 13,5');
    assert.strictEqual(view.options[1].disabledReason, '', 'подключённая история включает йогурт при доступном Хладе');
    await page.screenshot({ path: path.join(output, '16-fridge-choice-960x540.png') });
    await page.evaluate(() => NP_DEBUG.selectActionChoice(0));
    const ownStart = await page.evaluate(() => ({ action: NP_DEBUG.state.player.action, active: saveExtensions.activities.active }));
    assert.strictEqual(ownStart.action, 'fridge');
    assert.strictEqual(ownStart.active.variant, 'fridge-own');
    await page.evaluate(() => NP_DEBUG.skip(4.6));
    const ownDone = await page.evaluate(() => ({ state: NP_DEBUG.state, activities: saveExtensions.activities, story: saveExtensions.yogurt, multiplier: today().funMul || 1 }));
    assert.strictEqual(ownDone.state.stats.fridge, 1);
    assert.ok(Math.abs(ownDone.state.fun - (20 + 13.5 * ownDone.multiplier)) < 0.02, `свой перекус даёт 13,5 до множителя, было ${(ownDone.state.fun - 20) / ownDone.multiplier}`);
    assert.strictEqual(ownDone.activities.yogurtStolen, false, 'свой перекус не запускает расследование');
    assert.strictEqual(ownDone.story.status, 'dormant');

    await reset(1602);
    await openChoice();
    await page.evaluate(() => NP_DEBUG.selectActionChoice(1));
    await page.evaluate(() => NP_DEBUG.skip(1.2));
    await page.evaluate(() => NP_DEBUG.endAction('cancel'));
    const canceled = await page.evaluate(() => ({
      action: NP_DEBUG.state.player.action,
      fridge: NP_DEBUG.state.stats.fridge,
      activities: saveExtensions.activities,
      story: saveExtensions.yogurt,
    }));
    assert.strictEqual(canceled.action, 'none');
    assert.strictEqual(canceled.fridge, 0);
    assert.strictEqual(canceled.activities.yogurtStolen, false, 'прерывание не отмечает кражу');
    assert.strictEqual(canceled.story.status, 'dormant');

    await openChoice();
    const retry = await page.evaluate(() => {
      const beforeFun = NP_DEBUG.state.fun;
      NP_DEBUG.selectActionChoice(1);
      NP_DEBUG.skip(4.6);
      return { beforeFun, state: NP_DEBUG.state, activities: saveExtensions.activities, story: saveExtensions.yogurt, multiplier: today().funMul || 1 };
    });
    assert.ok(Math.abs(retry.state.fun - (retry.beforeFun + 18 * retry.multiplier)) < 0.02,
      `йогурт даёт 18 кайфа до множителя, было ${(retry.state.fun - retry.beforeFun) / retry.multiplier}`);
    assert.strictEqual(retry.state.stats.fridge, 1);
    assert.strictEqual(retry.activities.yogurtStolen, true);
    assert.strictEqual(retry.story.status, 'stolen');
    view = await page.evaluate(() => { NP_DEBUG.teleport(42, 190); NP_DEBUG.interact(); return NP_DEBUG.actionChoiceView; });
    assert.strictEqual(view.options[0].disabledReason, '', 'свой перекус доступен после кражи');
    assert.strictEqual(view.options[1].disabledReason, 'Йогурт уже исчез', 'второй йогурт закрыт');

    await reset(1603);
    await openChoice();
    await page.evaluate(() => { NP_DEBUG.selectActionChoice(1); NP_DEBUG.skip(2.1); });
    const saved = await page.evaluate(() => {
      const result = NP_DEBUG.saveProgress();
      if (!result.ok) throw new Error(`save failed: ${result.reason}`);
      return result.snapshot;
    });
    assert.strictEqual(saved.extensions.activities.active.variant, 'fridge-yogurt');
    assert.strictEqual(saved.extensions.activities.yogurtStolen, false, 'до конца таймера флаг не поднят');
    await page.reload();
    await page.waitForFunction(() => !!window.NP_DEBUG);
    const resumed = await page.evaluate(() => ({
      load: NP_DEBUG.loadResult,
      action: NP_DEBUG.state.player.action,
      activities: JSON.parse(JSON.stringify(saveExtensions.activities)),
      story: JSON.parse(JSON.stringify(ensureYogurtExtension())),
    }));
    assert.strictEqual(resumed.load.status, 'resumed');
    assert.strictEqual(resumed.action, 'fridge');
    assert.strictEqual(resumed.activities.active.variant, 'fridge-yogurt');
    await page.evaluate(() => NP_DEBUG.skip(2.6));
    const yogurtDone = await page.evaluate(() => ({ state: NP_DEBUG.state, activities: saveExtensions.activities, story: saveExtensions.yogurt }));
    assert.strictEqual(yogurtDone.state.stats.fridge, 1);
    assert.strictEqual(yogurtDone.activities.yogurtStolen, true);
    assert.strictEqual(yogurtDone.story.status, 'stolen');
    assert.strictEqual(yogurtDone.state.todo.find(task => task.id === 'yogurt'), undefined, 'в среду нет пятничной цели');

    await reset(1604, 4);
    await openChoice();
    await page.evaluate(() => { NP_DEBUG.selectActionChoice(1); NP_DEBUG.skip(4.6); });
    const friday = await page.evaluate(() => ({ day: NP_DEBUG.state.dayIndex, ids: NP_DEBUG.state.todo.map(item => item.id), task: NP_DEBUG.state.todo.find(item => item.id === 'yogurt'), activities: saveExtensions.activities }));
    assert.ok(friday.task && friday.task.done, `фактическая кража завершает пятничную цель: ${JSON.stringify(friday)}`);
    assert.strictEqual(friday.activities.yogurtStolen, true);

    assert.deepStrictEqual(errors, [], `ошибки браузера: ${errors.join('; ')}`);
    console.log('qa-plan-16: холодильник, обе скорости, отмена, reload активного действия и цель пятницы — OK');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

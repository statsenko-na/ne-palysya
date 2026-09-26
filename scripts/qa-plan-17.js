'use strict';
// История йогурта: обнаружение, три исхода, кофе, услуги, сроки и сохранения.
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

  const reset = async (seed, day = 3) => page.evaluate(({ seed: currentSeed, day: currentDay }) => {
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

  const startTheft = async () => {
    const selected = await page.evaluate(() => {
      NP_DEBUG.interact();
      return NP_DEBUG.actionChoiceView;
    });
    assert(selected, 'холодильник открывает выбор');
    assert.strictEqual(selected.options[1].disabledReason, '', 'йогурт доступен только с подключённой историей и Хладом');
    await page.evaluate(() => { NP_DEBUG.selectActionChoice(1); NP_DEBUG.skip(4.6); });
    const state = await page.evaluate(() => JSON.parse(JSON.stringify(saveExtensions.yogurt)));
    assert.strictEqual(state.status, 'stolen', 'полное действие запускает расследование');
    return state;
  };
  const discover = async (seconds = 10.2) => {
    await page.evaluate(dt => NP_DEBUG.skip(dt), seconds);
    const story = await page.evaluate(() => JSON.parse(JSON.stringify(saveExtensions.yogurt)));
    assert.strictEqual(story.status, 'discovered', 'Хлад замечает пропажу через 10 игровых секунд');
    return story;
  };
  const goHlad = async () => page.evaluate(() => {
    const zone = NP_WORLD.zones.find(item => item.id === 'chat_hlad');
    NP_DEBUG.teleport(zone.x + zone.w / 2, zone.y + zone.h / 2);
  });
  const openResponse = async () => {
    await goHlad();
    const view = await page.evaluate(() => { NP_DEBUG.interact(); return NP_DEBUG.actionChoiceView; });
    assert(view, 'у стола Хлада можно ответить на вопрос');
    assert.strictEqual(view.id, 'yogurt-response');
    return view;
  };
  const snapshot = () => page.evaluate(() => {
    const result = NP_DEBUG.saveProgress();
    if (!result.ok) throw new Error(`save failed: ${result.reason}`);
    return result.snapshot;
  });
  const reload = async () => {
    await page.reload();
    await page.waitForFunction(() => !!window.NP_DEBUG);
    return page.evaluate(() => ({ load: NP_DEBUG.loadResult, yogurt: JSON.parse(JSON.stringify(ensureYogurtExtension())) }));
  };

  try {
    fs.mkdirSync(output, { recursive: true });
    await page.goto(url);
    await page.waitForFunction(() => !!window.NP_DEBUG);

    // Пропуск ожидания во время обеда и отсутствия Хлада.
    await reset(1701);
    await page.evaluate(() => {
      const coffee = NP_WORLD.zones.find(item => item.id === 'coffee');
      NP_DEBUG.teleport(coffee.x + coffee.w / 2, coffee.y + coffee.h / 2);
      NP_DEBUG.interact();
      NP_DEBUG.skip(2.9);
      player.coffeeBoost = 0;
      NP_DEBUG.teleport(42, 190);
    });
    await startTheft();
    await snapshot();
    let resumed = await reload();
    assert.strictEqual(resumed.yogurt.status, 'stolen', 'факт кражи сохраняется до обнаружения');
    const waiting = await page.evaluate(() => {
      const initialElapsed = saveExtensions.yogurt.detectionElapsed;
      NP_DEBUG.setAction('lunch', 0);
      tickYogurtStoryAdapter(8);
      const lunchElapsed = saveExtensions.yogurt.detectionElapsed;
      NP_DEBUG.setAction('none', 0);
      coworkerById('hlad').away = true;
      tickYogurtStoryAdapter(8);
      const awayElapsed = saveExtensions.yogurt.detectionElapsed;
      coworkerById('hlad').away = false;
      tickYogurtStoryAdapter(10.1);
      return { initialElapsed, lunchElapsed, awayElapsed, status: saveExtensions.yogurt.status, x: coworkerById('hlad').x, y: coworkerById('hlad').y };
    });
    assert.strictEqual(waiting.lunchElapsed, waiting.initialElapsed, 'детектор стоит во время обеда');
    assert.strictEqual(waiting.awayElapsed, waiting.initialElapsed, 'детектор ждёт возвращения Хлада');
    assert.strictEqual(waiting.status, 'discovered');
    await snapshot();
    resumed = await reload();
    assert.strictEqual(resumed.yogurt.status, 'discovered', 'обнаружение сохраняется');

    // Ответ выбирается у стола, не перемещает Хлада, а все поля переживают reload.
    let view = await openResponse();
    assert.strictEqual(view.options.length, 3);
    assert.deepStrictEqual(view.options.map(option => option.id), ['admit', 'bleb', 'silent']);
    await page.waitForTimeout(120);
    await page.evaluate(() => { bubbles.length = 0; });
    await page.screenshot({ path: path.join(output, '17-yogurt-response-960x540.png') });
    const beforeChoice = await page.evaluate(() => ({ x: coworkerById('hlad').x, y: coworkerById('hlad').y }));
    assert.strictEqual(beforeChoice.x, waiting.x);
    assert.strictEqual(beforeChoice.y, waiting.y);
    await page.evaluate(() => NP_DEBUG.selectActionChoice(0));
    let story = await page.evaluate(() => JSON.parse(JSON.stringify(saveExtensions.yogurt)));
    assert.strictEqual(story.resolution, 'admit');
    assert.strictEqual(story.coffeeCompletedAfterDiscovery, false);
    await snapshot();
    resumed = await reload();
    assert.strictEqual(resumed.load.status, 'resumed');
    assert.strictEqual(resumed.yogurt.status, 'discovered');
    assert.strictEqual(resumed.yogurt.resolution, 'admit');
    assert.strictEqual(resumed.yogurt.coffeeCompletedAfterDiscovery, false, 'старый кофе не подходит');

    // Новая варка отменяется без чашки, boost, кайфа и отметки для признания.
    const canceledBrew = await page.evaluate(() => {
      player.coffeeBoost = 0;
      const zone = NP_WORLD.zones.find(item => item.id === 'coffee');
      NP_DEBUG.teleport(zone.x + zone.w / 2, zone.y + zone.h / 2);
      const before = { fun: NP_DEBUG.state.fun, coffees: NP_DEBUG.state.stats.coffees, boost: player.coffeeBoost };
      NP_DEBUG.interact();
      const pending = saveExtensions.yogurt.pendingCoffee;
      NP_DEBUG.endAction('cancel');
      return { before, after: NP_DEBUG.state, pending, yogurt: saveExtensions.yogurt };
    });
    assert.strictEqual(canceledBrew.pending, true);
    assert.strictEqual(canceledBrew.after.stats.coffees, canceledBrew.before.coffees);
    assert.strictEqual(canceledBrew.after.fun, canceledBrew.before.fun);
    assert.strictEqual(canceledBrew.after.player.coffeeBoost, 0);
    assert.strictEqual(canceledBrew.yogurt.pendingCoffee, false);
    assert.strictEqual(canceledBrew.yogurt.coffeeCompletedAfterDiscovery, false);

    const brewed = await page.evaluate(() => {
      NP_DEBUG.interact();
      const before = { fun: NP_DEBUG.state.fun, coffees: NP_DEBUG.state.stats.coffees, boost: player.coffeeBoost };
      NP_DEBUG.skip(2.9);
      return { before, after: NP_DEBUG.state, yogurt: saveExtensions.yogurt };
    });
    assert.strictEqual(brewed.yogurt.coffeeCompletedAfterDiscovery, true);
    assert.strictEqual(brewed.yogurt.pendingCoffee, false);
    assert.strictEqual(brewed.after.stats.coffees, brewed.before.coffees + 1);
    assert.strictEqual(brewed.after.player.coffeeBoost, brewed.before.boost, 'извинительный кофе не даёт boost');
    assert.strictEqual(brewed.after.fun, brewed.before.fun, 'извинительный кофе не даёт кайф');
    await snapshot();
    resumed = await reload();
    assert.strictEqual(resumed.yogurt.coffeeCompletedAfterDiscovery, true, 'готовый кофе сохраняется');
    await goHlad();
    const gift = await page.evaluate(() => {
      const beforeFun = NP_DEBUG.state.fun;
      NP_DEBUG.interact();
      const started = NP_DEBUG.state.player.action;
      NP_DEBUG.skip(2.1);
      return {
        started,
        state: NP_DEBUG.state,
        yogurt: saveExtensions.yogurt,
        relationships: NP_DEBUG.relationships,
        moments: NP_DEBUG.moments,
        beforeFun,
      };
    });
    assert.strictEqual(gift.started, 'yogurt-coffee-gift');
    assert.strictEqual(gift.yogurt.status, 'resolved');
    assert.strictEqual(gift.yogurt.outcome, 'coffee');
    assert.strictEqual(gift.relationships.entries.hlad.mood, 'neutral');
    assert.strictEqual(gift.moments.awards.filter(item => item.id === 'story').length, 1);
    assert.strictEqual(gift.state.fun, gift.beforeFun, 'финальное признание не даёт дополнительный кайф');

    // Блеб прикрывает только при свободном кредите, расходует его атомарно.
    await reset(1702);
    await page.evaluate(() => NP_DEBUG.recordRelationshipEvent('bleb', 'help', `${NP_DEBUG.persistence.shiftId}:qa-help-bleb`));
    await startTheft();
    await discover();
    view = await openResponse();
    assert.strictEqual(view.options[1].disabledReason, '');
    const bleb = await page.evaluate(() => {
      const beforeFun = NP_DEBUG.state.fun;
      NP_DEBUG.selectActionChoice(1);
      return { story: saveExtensions.yogurt, relationships: NP_DEBUG.relationships, moments: NP_DEBUG.moments, fun: NP_DEBUG.state.fun, beforeFun };
    });
    assert.strictEqual(bleb.story.status, 'resolved');
    assert.strictEqual(bleb.story.outcome, 'bleb');
    assert.strictEqual(bleb.relationships.entries.bleb.favorCredit, 0);
    assert.strictEqual(bleb.relationships.entries.bleb.favorUsedDay, 3);
    assert.strictEqual(bleb.relationships.entries.hlad.mood, 'neutral');
    assert.strictEqual(bleb.moments.awards.filter(item => item.id === 'story').length, 1);
    assert.strictEqual(bleb.fun, bleb.beforeFun, 'прикрытие не даёт кайф');

    await reset(1703);
    await startTheft();
    await discover();
    view = await openResponse();
    assert.notStrictEqual(view.options[1].disabledReason, '', 'Блеб без кредита недоступен');
    const refused = await page.evaluate(() => {
      NP_DEBUG.selectActionChoice(1);
      return { story: saveExtensions.yogurt, relationships: NP_DEBUG.relationships, choice: NP_DEBUG.actionChoiceView };
    });
    assert.strictEqual(refused.story.status, 'discovered', 'неудачная просьба не закрывает историю');
    assert.strictEqual(refused.relationships.entries.bleb.favorUsedDay, null, 'кредит не расходуется');
    assert.ok(refused.choice, 'заблокированный вариант оставляет выбор открытым');

    // Молчание заканчивается в 17:00, а позднее обнаружение даёт 20 секунд.
    await reset(1704);
    await startTheft();
    await discover();
    await openResponse();
    await page.evaluate(() => { NP_DEBUG.selectActionChoice(2); clockMinutes = 17 * 60; tickYogurtStoryAdapter(0.05); });
    const silent = await page.evaluate(() => ({ story: saveExtensions.yogurt, mood: NP_DEBUG.relationships.entries.hlad.mood }));
    assert.strictEqual(silent.story.status, 'resolved');
    assert.strictEqual(silent.story.outcome, 'silent');
    assert.strictEqual(silent.mood, 'angry');
    await page.evaluate(() => { NP_DEBUG.set({ usefulness: 100 }); NP_DEBUG.finish('win'); NP_DEBUG.restart(1709); });
    const nextDayMood = await page.evaluate(() => ({ day: NP_DEBUG.state.dayIndex, mood: NP_DEBUG.relationships.entries.hlad.mood }));
    assert.strictEqual(nextDayMood.day, 4);
    assert.strictEqual(nextDayMood.mood, 'angry', 'молчание оставляет Хлада злым до конца следующего дня');

    await reset(1705);
    await startTheft();
    const late = await page.evaluate(() => {
      clockMinutes = 17 * 60 + 1;
      tickYogurtStoryAdapter(10.1);
      const discovered = { ...saveExtensions.yogurt };
      tickYogurtStoryAdapter(19);
      const waiting = { ...saveExtensions.yogurt };
      tickYogurtStoryAdapter(1.1);
      const expired = { ...saveExtensions.yogurt };
      const messageCount = logEntries.filter(entry => entry.text === LINES.yogurt.timeout).length;
      tickYogurtStoryAdapter(100);
      return { discovered, waiting, expired, messageCount, afterAgain: logEntries.filter(entry => entry.text === LINES.yogurt.timeout).length };
    });
    assert.strictEqual(late.discovered.responseSecondsRemaining, 20);
    assert.strictEqual(late.waiting.status, 'discovered');
    assert.ok(late.waiting.responseSecondsRemaining > 0 && late.waiting.responseSecondsRemaining <= 1.1);
    assert.strictEqual(late.expired.outcome, 'silent');
    assert.strictEqual(late.messageCount, 1);
    assert.strictEqual(late.afterAgain, 1, 'истечение отправляет одно сообщение');

    // Завершение смены само закрывает неразрешённую историю.
    await reset(1706);
    await startTheft();
    await page.evaluate(() => NP_DEBUG.finish('fired'));
    const ended = await page.evaluate(() => ({ story: saveExtensions.yogurt, mood: NP_DEBUG.relationships.entries.hlad.mood }));
    assert.strictEqual(ended.story.status, 'resolved');
    assert.strictEqual(ended.story.outcome, 'shift_end');
    assert.strictEqual(ended.mood, 'angry');

    // Пятничный уход закрывает историю, а старт новой недели сбрасывает её и отношения.
    await reset(1707, 4);
    await startTheft();
    await page.evaluate(() => { NP_DEBUG.set({ usefulness: 100 }); NP_DEBUG.finish('win'); });
    const nextWeek = await page.evaluate(() => {
      NP_DEBUG.restart(1708);
      return { story: JSON.parse(JSON.stringify(ensureYogurtExtension())), hlad: NP_DEBUG.relationships.entries.hlad.mood, day: NP_DEBUG.state.dayIndex };
    });
    assert.strictEqual(nextWeek.day, 0);
    assert.strictEqual(nextWeek.story.status, 'dormant');
    assert.strictEqual(nextWeek.hlad, 'neutral');

    assert.deepStrictEqual(errors, [], `ошибки браузера: ${errors.join('; ')}`);
    console.log('qa-plan-17: обнаружение, кофе, Блеб, отказ без кредита, сроки, конец смены и новая неделя — OK');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

'use strict';
// Карточка 23: единый план задач/событий для повторных недель.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { loadPlaywright } = require('./pw');

(async () => {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  const output = path.join(__dirname, '..', '.qa');
  const url = `${pathToFileURL(path.join(__dirname, '..', 'index.html')).href}#play`;
  page.on('pageerror', error => errors.push(error.message));

  const reset = (day, completedWeeks, seed, sergeyAvailable = true) => page.evaluate(args => {
    localStorage.clear();
    store.set('weekDone', args.completedWeeks > 0);
    store.set('weekNumber', args.completedWeeks);
    store.set('day', args.day);
    store.set('onboardingDone', true);
    store.set('tutorialDone', true);
    const sergey = coworkers.find(c => c.id === 'sirgey');
    if (sergey) sergey.ghost = !args.sergeyAvailable;
    NP_DEBUG.setDay(args.day);
    NP_DEBUG.restart(args.seed);
    NP_DEBUG.setDay(args.day);
    return {
      scenario: JSON.parse(JSON.stringify(saveExtensions.weekScenario)),
      tasks: NP_DEBUG.state.todo.map(task => task.id),
      required: NP_DEBUG.persistence.requiredEvent,
      queue: NP_DEBUG.eventQueue,
      banner: banner && banner.text,
      weekNumber,
    };
  }, { day, completedWeeks, seed, sergeyAvailable });

  const householdIds = ids => ids.filter(id => /^(coffee|smoke|toilet|lunch)/.test(id)).sort();

  try {
    fs.mkdirSync(output, { recursive: true });
    await page.goto(url);
    await page.waitForFunction(() => !!window.NP_DEBUG);

    // Обучающая неделя остаётся обычной, а Tuesday уже содержит ровно одну печать отчёта.
    let state = await reset(1, 0, 2301);
    assert.equal(state.scenario.scenario, 'normal');
    assert.equal(state.scenario.active, false);
    assert.equal(state.weekNumber, 0);
    assert.equal(state.tasks.filter(id => id === 'printReport').length, 1);
    assert.deepEqual(state.tasks, ['coffee1', 'smoke2', 'toilet', 'lunch', 'chatAimashyn', 'chatHlad', 'printReport']);
    assert.deepEqual(state.scenario.requiredEvents, []);

    // Первая повторная неделя normal; reports и repairs следуют циклу по сохранённому числу победных пятниц.
    state = await reset(3, 1, 2302);
    assert.equal(state.scenario.scenario, 'normal');
    assert.deepEqual(state.required, { id: 'majik', deadlineStart: 900, dispatched: false });

    const reportsTuesday = await reset(1, 2, 2303);
    assert.equal(reportsTuesday.scenario.scenario, 'reports');
    assert.equal(reportsTuesday.banner, 'Неделя отчётов');
    assert.equal(reportsTuesday.tasks.filter(id => id === 'printReport').length, 1, 'цель печати вторника не дублируется');
    assert.deepEqual(householdIds(reportsTuesday.tasks), ['coffee1', 'lunch', 'smoke2', 'toilet']);
    assert.equal(reportsTuesday.scenario.requiredEvents.length, 1);
    assert.deepEqual(reportsTuesday.scenario.requiredEvents[0], { id: 'jam', deadlineStart: 900, dispatched: false });
    assert.equal(reportsTuesday.queue[0], 'jam');
    assert.equal(reportsTuesday.queue.filter(id => id === 'jam').length, 1);
    assert.ok(reportsTuesday.queue.length === 6 || reportsTuesday.queue.length === 7);
    assert.equal(new Set(reportsTuesday.queue).size, reportsTuesday.queue.length);
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(output, '23-reports-banner-960x540.png') });

    const reportsThursday = await reset(3, 2, 2304);
    assert.equal(reportsThursday.scenario.scenario, 'reports');
    assert.equal(reportsThursday.scenario.replacedTaskId, 'majik');
    assert.equal(reportsThursday.tasks.includes('majik'), false, 'Маджикистановая цель заменена');
    assert.equal(reportsThursday.tasks.filter(id => id === 'printReport').length, 1);
    assert.deepEqual(householdIds(reportsThursday.tasks), ['coffee1', 'lunchVilka', 'smoke1a', 'toilet']);
    assert.equal(reportsThursday.tasks.length, 7);
    assert.equal(reportsThursday.required, null, 'снятая цель больше не требует majik');
    assert.deepEqual(reportsThursday.scenario.requiredEvents[0], { id: 'jam', deadlineStart: 900, dispatched: false });
    assert.equal(reportsThursday.queue[0], 'jam');
    assert.ok(reportsThursday.queue.length === 6 || reportsThursday.queue.length === 7);
    assert.equal(new Set(reportsThursday.queue).size, reportsThursday.queue.length);

    // repairs резервирует только одно событие сценария; задача Маджикистана остаётся в A03 очереди.
    const repairsTuesday = await reset(1, 3, 2305);
    assert.equal(repairsTuesday.scenario.scenario, 'repairs');
    assert.deepEqual(repairsTuesday.tasks, ['coffee1', 'smoke2', 'toilet', 'lunch', 'chatAimashyn', 'chatHlad', 'printReport']);
    assert.equal(repairsTuesday.banner, 'Неделя техработ');
    assert.deepEqual(repairsTuesday.scenario.requiredEvents.map(item => item.id), ['internet']);
    assert.equal(repairsTuesday.queue[0], 'internet');
    assert.ok(repairsTuesday.queue.length === 6 || repairsTuesday.queue.length === 7);
    assert.equal(new Set(repairsTuesday.queue).size, repairsTuesday.queue.length);
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(output, '23-repairs-banner-960x540.png') });

    const repairsThursday = await reset(3, 3, 2306);
    assert.equal(repairsThursday.scenario.scenario, 'repairs');
    assert.deepEqual(repairsThursday.tasks, ['coffee1', 'smoke1a', 'toilet', 'lunchVilka', 'majik', 'scold', 'hideAudit']);
    assert.deepEqual(repairsThursday.scenario.requiredEvents.map(item => item.id), ['autoshka']);
    assert.equal(repairsThursday.required.id, 'majik');
    assert.deepEqual(repairsThursday.queue.slice(0, 2), ['majik', 'autoshka']);
    assert.ok(repairsThursday.queue.length === 6 || repairsThursday.queue.length === 7);
    assert.equal(new Set(repairsThursday.queue).size, repairsThursday.queue.length);

    const absentSergey = await reset(3, 3, 2307, false);
    assert.deepEqual(absentSergey.scenario.requiredEvents.map(item => item.id), ['jam']);
    assert.equal(absentSergey.queue[0], 'majik');
    assert.ok(absentSergey.queue.includes('jam'));

    // Сохранение во время jam сохраняет сценарий, дедлайн и флаг отправки без повторного события.
    await reset(1, 2, 2308);
    const startedJam = await page.evaluate(() => {
      NP_DEBUG.setClock(900);
      NP_DEBUG.skip(0.05);
      const saved = NP_DEBUG.saveProgress();
      return {
        event: NP_DEBUG.event && NP_DEBUG.event.id,
        required: JSON.parse(JSON.stringify(saveExtensions.weekScenario.requiredEvents)),
        queuedJam: NP_DEBUG.eventQueue.filter(id => id === 'jam').length,
        saved: saved.ok,
      };
    });
    assert.equal(startedJam.event, 'jam');
    assert.equal(startedJam.required[0].dispatched, true);
    assert.equal(startedJam.queuedJam, 0);
    assert.equal(startedJam.saved, true);
    await page.reload();
    await page.waitForFunction(() => !!window.NP_DEBUG && NP_DEBUG.loadResult.status === 'resumed');
    const resumed = await page.evaluate(() => ({
      event: NP_DEBUG.event && NP_DEBUG.event.id,
      scenario: JSON.parse(JSON.stringify(saveExtensions.weekScenario)),
      queuedJam: NP_DEBUG.eventQueue.filter(id => id === 'jam').length,
    }));
    assert.equal(resumed.event, 'jam');
    assert.equal(resumed.scenario.scenario, 'reports');
    assert.equal(resumed.scenario.requiredEvents[0].dispatched, true);
    assert.equal(resumed.queuedJam, 0);

    // Старое сохранение без extension сценария доигрывается без ретроактивной замены задач.
    await reset(3, 1, 2314);
    await page.evaluate(() => {
      NP_DEBUG.saveProgress();
      const snapshot = JSON.parse(localStorage.getItem('nepalsya.currentSave'));
      delete snapshot.extensions.weekScenario;
      localStorage.setItem('nepalsya.currentSave', JSON.stringify(snapshot));
      store.set('weekNumber', 2);
      mode = 'ended'; // не дать pagehide записать поверх старого снимка.
    });
    await page.reload();
    await page.waitForFunction(() => !!window.NP_DEBUG && NP_DEBUG.loadResult.status === 'resumed');
    const legacyResume = await page.evaluate(() => ({
      scenario: JSON.parse(JSON.stringify(saveExtensions.weekScenario)),
      tasks: NP_DEBUG.state.todo.map(task => task.id),
      required: NP_DEBUG.persistence.requiredEvent,
    }));
    assert.equal(legacyResume.scenario.scenario, 'normal');
    assert.equal(legacyResume.scenario.active, false);
    assert.deepEqual(legacyResume.scenario.requiredEvents, []);
    assert.ok(legacyResume.tasks.includes('majik'));
    assert.equal(legacyResume.required.id, 'majik');

    // Retry after loss keeps weekNumber and deterministically rebuilds the same scenario.
    await reset(3, 2, 2309);
    const retry = await page.evaluate(() => {
      NP_DEBUG.finish('fired');
      NP_DEBUG.restart(2310);
      return { weekNumber, scenario: saveExtensions.weekScenario.scenario, required: saveExtensions.weekScenario.requiredEvents.map(item => item.id) };
    });
    assert.equal(retry.weekNumber, 2);
    assert.equal(retry.scenario, 'reports');
    assert.deepEqual(retry.required, ['jam']);

    // Прерванная смена не запускает отложенный сценарный event после окончания.
    await reset(1, 2, 2313);
    const endedEarly = await page.evaluate(() => {
      NP_DEBUG.finish('fired');
      NP_DEBUG.skip(60);
      return { mode, event: NP_DEBUG.event, weekNumber, pending: saveExtensions.weekScenario.requiredEvents.map(item => item.id) };
    });
    assert.equal(endedEarly.mode, 'ended');
    assert.equal(endedEarly.event, null);
    assert.equal(endedEarly.weekNumber, 2);
    assert.deepEqual(endedEarly.pending, ['jam']);

    // Только победная пятница увеличивает сохранённый weekNumber.
    await reset(1, 0, 2310);
    const nonFridayWin = await page.evaluate(() => {
      NP_DEBUG.finish('win');
      return { weekNumber, persisted: store.get('weekNumber', null), day: store.get('day', null) };
    });
    assert.equal(nonFridayWin.weekNumber, 0);
    assert.equal(nonFridayWin.persisted, 0);
    assert.equal(nonFridayWin.day, 2);
    await reset(4, 0, 2311);
    let completion = await page.evaluate(() => {
      NP_DEBUG.finish('fired');
      return { weekNumber, persisted: store.get('weekNumber', null), weekDone: store.get('weekDone', false) };
    });
    assert.equal(completion.weekNumber, 0);
    assert.equal(completion.persisted, 0);
    assert.equal(completion.weekDone, false);
    await reset(4, 0, 2312);
    completion = await page.evaluate(() => {
      NP_DEBUG.finish('win');
      return { weekNumber, persisted: store.get('weekNumber', null), weekDone: store.get('weekDone', false), day: store.get('day', null) };
    });
    assert.equal(completion.weekNumber, 1);
    assert.equal(completion.persisted, 1);
    assert.equal(completion.weekDone, true);
    assert.equal(completion.day, 0);

    assert.deepEqual(errors, [], `ошибки страницы: ${errors.join('; ')}`);
    process.stdout.write('qa-plan-23: циклы тем, задачи/очереди, retry, reload, Sergey и победная пятница — OK\n');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

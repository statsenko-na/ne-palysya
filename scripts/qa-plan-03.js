'use strict';
// Адресная проверка обязательной задачи и расписания событий в реальной странице.
const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');
const { loadPlaywright } = require('./pw');

(async () => {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const url = `${pathToFileURL(path.join(__dirname, '..', 'index.html')).href}#play`;
  const reload = async () => {
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!window.NP_DEBUG);
  };
  const newThursday = async seed => page.evaluate(value => {
    NP_DEBUG.setDay(3);
    localStorage.setItem('nepalsya.day', '3');
    NP_DEBUG.clearSavedProgress();
    NP_DEBUG.restart(value);
  }, seed);

  try {
    await page.goto(url);
    await page.waitForFunction(() => !!window.NP_DEBUG);

    const queues = await page.evaluate(() => {
      const result = [];
      for (let seed = 1; seed <= 32; seed++) {
        NP_DEBUG.setDay(3);
        localStorage.setItem('nepalsya.day', '3');
        NP_DEBUG.clearSavedProgress();
        NP_DEBUG.restart(seed);
        result.push({ seed, queue: NP_DEBUG.eventQueue, required: NP_DEBUG.persistence.requiredEvent, todo: NP_DEBUG.state.todo.map(t => t.id) });
      }
      return result;
    });
    assert.strictEqual(queues.length, 32);
    for (const item of queues) {
      assert.ok(item.todo.includes('majik'), `seed ${item.seed}: задача Маджикистана доступна`);
      assert.deepStrictEqual(item.required, { id: 'majik', deadlineStart: 900, dispatched: false }, `seed ${item.seed}: deadline создан`);
      assert.strictEqual(item.queue[0], 'majik', `seed ${item.seed}: обязательное событие первое`);
      assert.strictEqual(item.queue[1], 'food', `seed ${item.seed}: угощение идёт после обязательного`);
      assert.strictEqual(item.queue.filter(id => id === 'majik').length, 1, `seed ${item.seed}: нет дубликата`);
      assert.ok(item.queue.length === 6 || item.queue.length === 7, `seed ${item.seed}: число обычных событий не увеличено`);
      assert.strictEqual(new Set(item.queue).size, item.queue.length, `seed ${item.seed}: очередь без дубликатов`);
    }

    const noRequiredEvent = await page.evaluate(() => {
      const result = [];
      for (const day of [0, 2]) {
        NP_DEBUG.setDay(day);
        localStorage.setItem('nepalsya.day', String(day));
        NP_DEBUG.clearSavedProgress();
        NP_DEBUG.restart(111 + day);
        result.push({ day, required: NP_DEBUG.persistence.requiredEvent, todo: NP_DEBUG.state.todo.map(t => t.id) });
      }
      return result;
    });
    assert.strictEqual(noRequiredEvent[0].required, null, 'ПН остаётся без событий и без фиктивной цели');
    assert.ok(noRequiredEvent[1].todo.includes('reportTurlo'));
    assert.strictEqual(noRequiredEvent[1].required, null, 'слово «отчёт» само по себе не требует события');

    const repeatedWeek = await page.evaluate(() => {
      localStorage.setItem('nepalsya.weekDone', 'true');
      NP_DEBUG.setDay(3);
      localStorage.setItem('nepalsya.day', '3');
      NP_DEBUG.clearSavedProgress();
      NP_DEBUG.restart(3033);
      const result = { todo: NP_DEBUG.state.todo.map(task => task.id), required: NP_DEBUG.persistence.requiredEvent, queue: NP_DEBUG.eventQueue };
      localStorage.setItem('nepalsya.weekDone', 'false');
      return result;
    });
    assert.ok(repeatedWeek.todo.includes('majik'), 'в повторной неделе задача Маджикистана доступна');
    assert.strictEqual(repeatedWeek.required?.id, 'majik', 'в повторной неделе сохраняется обязательное событие');
    assert.strictEqual(repeatedWeek.queue[0], 'majik');

    // Старый v3 с пустым requiredEvent восстанавливает цель из сохранённой задачи.
    await newThursday(2033);
    const legacySnapshot = await page.evaluate(() => {
      NP_DEBUG.saveProgress();
      const snapshot = JSON.parse(localStorage.getItem('nepalsya.currentSave'));
      snapshot.requiredEvent = null;
      snapshot.eventQueue = snapshot.eventQueue.filter(id => id !== 'majik');
      localStorage.setItem('nepalsya.currentSave', JSON.stringify(snapshot));
      return JSON.stringify({ snapshot, queueLength: snapshot.eventQueue.length });
    });
    const legacyPage = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    legacyPage.on('pageerror', error => errors.push(error.message));
    await legacyPage.addInitScript(serialized => {
      localStorage.setItem('nepalsya.currentSave', serialized);
      localStorage.setItem('nepalsya.day', '3');
    }, legacySnapshot);
    await legacyPage.goto(url);
    await legacyPage.waitForFunction(() => !!window.NP_DEBUG);
    const restoredLegacy = await legacyPage.evaluate(() => ({
      queue: NP_DEBUG.eventQueue,
      required: NP_DEBUG.persistence.requiredEvent,
    }));
    const expectedLegacyQueueLength = JSON.parse(legacySnapshot).queueLength;
    assert.deepStrictEqual(restoredLegacy.required, { id: 'majik', deadlineStart: 900, dispatched: false }, 'старый v3 восстанавливает обязательную цель');
    assert.strictEqual(restoredLegacy.queue[0], 'majik', 'старый v3 возвращает цель в начало очереди');
    assert.strictEqual(restoredLegacy.queue.length, expectedLegacyQueueLength, 'восстановление не увеличивает очередь');
    await legacyPage.close();

    // В обычной очереди Маджикистан начинается первым до deadline и переживает reload.
    await newThursday(2024);
    await page.evaluate(() => {
      NP_DEBUG.setBoss(706, 446, 'gone');
      NP_DEBUG.skip(50);
      NP_DEBUG.saveProgress();
    });
    let state = await page.evaluate(() => ({ event: NP_DEBUG.event && NP_DEBUG.event.id, clock: NP_DEBUG.state.clockMinutes, required: NP_DEBUG.persistence.requiredEvent }));
    assert.strictEqual(state.event, 'majik');
    assert.ok(state.clock < 900, 'первый запуск может произойти до 15:00');
    assert.strictEqual(state.required.dispatched, true);
    await reload();
    state = await page.evaluate(() => ({ event: NP_DEBUG.event && NP_DEBUG.event.id, required: NP_DEBUG.persistence.requiredEvent }));
    assert.strictEqual(state.event, 'majik');
    assert.strictEqual(state.required.dispatched, true, 'после reload dispatch не повторяется');

    // Активное другое событие завершается само; затем majik запускается, даже если Д.Н. занят.
    await newThursday(2025);
    await page.evaluate(() => {
      NP_DEBUG.setClock(900);
      NP_DEBUG.setBoss(706, 446, 'inspect');
      NP_DEBUG.startEvent('food');
      NP_DEBUG.event.t = 1.2;
      NP_DEBUG.saveProgress();
    });
    await reload();
    state = await page.evaluate(() => ({ event: NP_DEBUG.event && NP_DEBUG.event.id, required: NP_DEBUG.persistence.requiredEvent }));
    assert.strictEqual(state.event, 'food', 'reload не прерывает активное событие');
    assert.strictEqual(state.required.dispatched, false);
    await page.evaluate(() => NP_DEBUG.skip(0.25));
    assert.strictEqual(await page.evaluate(() => NP_DEBUG.event && NP_DEBUG.event.id), 'food', 'активное событие не вытесняется');
    await page.evaluate(() => NP_DEBUG.skip(1.4));
    state = await page.evaluate(() => ({ event: NP_DEBUG.event && NP_DEBUG.event.id, required: NP_DEBUG.persistence.requiredEvent, boss: NP_DEBUG.state.boss.state }));
    assert.strictEqual(state.event, 'majik', 'обязательное событие запускается после освобождения очереди');
    assert.strictEqual(state.required.dispatched, true);
    assert.notStrictEqual(state.boss, 'office', 'dispatch не ждёт свободного Д.Н.');
    await page.evaluate(() => NP_DEBUG.saveProgress());
    await reload();
    state = await page.evaluate(() => ({ event: NP_DEBUG.event && NP_DEBUG.event.id, required: NP_DEBUG.persistence.requiredEvent }));
    assert.strictEqual(state.event, 'majik');
    assert.strictEqual(state.required.dispatched, true, 'reload после dispatch сохраняет флаг');

    // Обед и будущий daily удерживают deadline; после возвращения событие получает приоритет.
    for (const action of ['lunch', 'daily']) {
      await newThursday(2026 + action.length);
      await page.evaluate(value => {
        NP_DEBUG.setClock(900);
        NP_DEBUG.setAction(value, 30);
        NP_DEBUG.skip(0.1);
      }, action);
      state = await page.evaluate(() => ({ event: NP_DEBUG.event, required: NP_DEBUG.persistence.requiredEvent }));
      assert.strictEqual(state.event, null, `${action}: не стартует во время отложенного окна`);
      assert.strictEqual(state.required.dispatched, false, `${action}: deadline остаётся ожидающим`);
      await page.evaluate(() => { NP_DEBUG.setAction('none'); NP_DEBUG.skip(0.1); });
      state = await page.evaluate(() => ({ event: NP_DEBUG.event && NP_DEBUG.event.id, required: NP_DEBUG.persistence.requiredEvent }));
      assert.strictEqual(state.event, 'majik', `${action}: событие стартует после возвращения`);
      assert.strictEqual(state.required.dispatched, true);
    }

    assert.deepStrictEqual(errors, [], `ошибки страницы: ${errors.join('; ')}`);
    process.stdout.write('qa-plan-03: все проверки пройдены\n');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

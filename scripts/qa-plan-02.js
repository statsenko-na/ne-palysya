'use strict';
// Адресная проверка полного сохранения смены через реальную страницу и Canvas.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { loadPlaywright } = require('./pw');

(async () => {
  const { chromium } = loadPlaywright();
  const outDir = process.argv[2] || path.join(__dirname, '..', '.qa');
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    try {
      const pending = sessionStorage.getItem('__qa_plan_02_seed');
      if (pending) {
        sessionStorage.removeItem('__qa_plan_02_seed');
        for (const [key, value] of JSON.parse(pending)) localStorage.setItem(key, value);
      }
    } catch (_) { /* сценарий сам проверяет отказ хранилища */ }
    try {
      if (sessionStorage.getItem('__qa_plan_02_freeze') === '1') {
        sessionStorage.removeItem('__qa_plan_02_freeze');
        Object.defineProperty(window, 'requestAnimationFrame', { configurable: true, value: () => 0 });
      }
    } catch (_) { /* поддержка снимка Canvas не зависит от заморозки */ }
  });
  const url = `${pathToFileURL(path.join(__dirname, '..', 'index.html')).href}#play`;
  const seedNextLoad = async entries => page.evaluate(items => sessionStorage.setItem('__qa_plan_02_seed', JSON.stringify(items)), entries);
  const pauseAndFreeze = async () => {
    const mode = await page.evaluate(() => NP_DEBUG.state.mode);
    if (mode === 'playing') await page.keyboard.press('p');
    await page.evaluate(() => Object.defineProperty(window, 'requestAnimationFrame', { configurable: true, value: () => 0 }));
  };
  const reload = async (freeze = true) => {
    if (freeze) await page.evaluate(() => sessionStorage.setItem('__qa_plan_02_freeze', '1'));
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!window.NP_DEBUG);
  };

  try {
    await page.goto(url);
    await page.waitForFunction(() => !!window.NP_DEBUG);
    const seat = await page.evaluate(() => NP_DEBUG.safeSpots.seat);
    await page.evaluate(() => {
      NP_DEBUG.clearEvents();
      NP_DEBUG.set({ usefulness: 23, fun: 17 });
      NP_DEBUG.teleport(510, 248);
      NP_DEBUG.startEvent('majik');
      NP_DEBUG.saveProgress();
    });
    let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('nepalsya.currentSave')));
    let restored;
    assert.strictEqual(saved.v, 3, 'пишется версия схемы 3');
    assert.strictEqual(saved.officeEvent.id, 'majik');
    assert.strictEqual(saved.usefulness, 23);
    assert.strictEqual(saved.fun, 17);
    assert.ok(saved.shiftId && saved.rngSeed >= 0 && Array.isArray(saved.eventQueue));
    assert.ok(saved.day && saved.player && saved.boss && saved.stats && saved.todo);

    for (const eventId of ['call', 'food', 'majik', 'sb']) {
      await page.evaluate(id => {
        NP_DEBUG.clearEvents();
        NP_DEBUG.startEvent(id);
        NP_DEBUG.saveProgress();
      }, eventId);
      await pauseAndFreeze();
      const expected = await page.evaluate(() => {
        const s = JSON.parse(localStorage.getItem('nepalsya.currentSave'));
        return { event: s.officeEvent.id, shiftId: s.shiftId, rngSeed: s.rngSeed, queue: s.eventQueue };
      });
      await reload();
      const resumed = await page.evaluate(() => ({
        event: NP_DEBUG.event && NP_DEBUG.event.id,
        status: NP_DEBUG.loadResult.status,
        persistence: NP_DEBUG.persistence,
      }));
      assert.strictEqual(resumed.status, 'resumed', `${eventId}: загрузка смены`);
      assert.strictEqual(resumed.event, eventId, `${eventId}: активное событие восстановлено`);
      assert.strictEqual(resumed.persistence.shiftId, expected.shiftId, `${eventId}: shiftId сохранён`);
      assert.strictEqual(resumed.persistence.rngSeed, expected.rngSeed, `${eventId}: RNG сохранён`);
      assert.deepStrictEqual(resumed.persistence.eventQueue, expected.queue, `${eventId}: очередь событий сохранена`);
      if (eventId === 'majik') {
        await reload(false);
        await page.waitForTimeout(120);
        await page.screenshot({ path: path.join(outDir, '02-save-resume.png') });
        await pauseAndFreeze();
      }
    }

    // Волна ухода коллег использует игровые таймеры и продолжается после паузы/reload.
    await page.evaluate(() => {
      NP_DEBUG.clearEvents();
      NP_DEBUG.startEvent('drill');
      NP_DEBUG.skip(1.5);
      NP_DEBUG.saveProgress();
    });
    await pauseAndFreeze();
    saved = await page.evaluate(() => JSON.parse(localStorage.getItem('nepalsya.currentSave')));
    assert.ok(saved.day.drillAwayIndex > 0 && saved.day.drillAwayTimer > 0, 'прогресс эвакуации сохранён');
    const drillProgress = { index: saved.day.drillAwayIndex, timer: saved.day.drillAwayTimer };
    await reload();
    restored = await page.evaluate(() => ({ index: NP_DEBUG.flags.drillAwayIndex, timer: NP_DEBUG.flags.drillAwayTimer, away: NP_DEBUG.coworkers.filter(c => c.away).length }));
    assert.strictEqual(restored.index, drillProgress.index);
    assert.strictEqual(restored.timer, drillProgress.timer);
    const drillAwayBefore = restored.away;
    await page.evaluate(() => NP_DEBUG.skip(1.1));
    assert.ok((await page.evaluate(() => NP_DEBUG.coworkers.filter(c => c.away).length)) > drillAwayBefore, 'эвакуация продолжается после возврата');

    await page.evaluate(() => {
      NP_DEBUG.clearSavedProgress();
      NP_DEBUG.restart(333);
      NP_DEBUG.setClock(750);
      NP_DEBUG.skip(1.5);
      NP_DEBUG.saveProgress();
    });
    await pauseAndFreeze();
    saved = await page.evaluate(() => JSON.parse(localStorage.getItem('nepalsya.currentSave')));
    assert.ok(saved.day.lunchAway && saved.day.lunchAwayIndex > 0 && saved.day.lunchAwayTimer > 0, 'обеденная волна сохранена');
    const lunchProgress = { index: saved.day.lunchAwayIndex, timer: saved.day.lunchAwayTimer };
    await reload();
    restored = await page.evaluate(() => ({ index: NP_DEBUG.flags.lunchAwayIndex, timer: NP_DEBUG.flags.lunchAwayTimer, away: NP_DEBUG.coworkers.filter(c => c.away).length }));
    assert.strictEqual(restored.index, lunchProgress.index);
    assert.strictEqual(restored.timer, lunchProgress.timer);
    const lunchAwayBefore = restored.away;
    await page.evaluate(() => NP_DEBUG.skip(1.1));
    assert.ok((await page.evaluate(() => NP_DEBUG.coworkers.filter(c => c.away).length)) > lunchAwayBefore, 'обеденная волна продолжается после возврата');

    await page.evaluate(() => {
      NP_DEBUG.clearSavedProgress();
      NP_DEBUG.setDay(4);
      localStorage.setItem('nepalsya.day', '4');
      NP_DEBUG.restart(444);
      NP_DEBUG.set({ lunchCalled: true, lunchOpen: true, lunchAway: false, fed: true });
      NP_DEBUG.forceBeer();
      NP_DEBUG.setClock(1035);
      NP_DEBUG.skip(2);
      NP_DEBUG.saveProgress();
    });
    await pauseAndFreeze();
    saved = await page.evaluate(() => JSON.parse(localStorage.getItem('nepalsya.currentSave')));
    assert.strictEqual(saved.day.beer, true);
    assert.ok(saved.day.beerAwayIndex > 0 && saved.day.beerAwayTimer > 0, 'пятничная волна ухода сохранена');
    const beerProgress = { index: saved.day.beerAwayIndex, timer: saved.day.beerAwayTimer };
    await reload();
    restored = await page.evaluate(() => ({ index: NP_DEBUG.flags.beerAwayIndex, timer: NP_DEBUG.flags.beerAwayTimer, away: NP_DEBUG.coworkers.filter(c => c.away).length }));
    assert.strictEqual(restored.index, beerProgress.index);
    assert.strictEqual(restored.timer, beerProgress.timer);
    const beerAwayBefore = restored.away;
    await page.evaluate(() => NP_DEBUG.skip(1.1));
    const beerAfter = await page.evaluate(() => ({ mode: NP_DEBUG.state.mode, flags: NP_DEBUG.flags, away: NP_DEBUG.coworkers.filter(c => c.away).length }));
    assert.ok(beerAfter.away > beerAwayBefore, `пятничная волна продолжается после возврата: ${JSON.stringify({ beerAwayBefore, beerAfter })}`);

    // Восстановить занятую очередь, обед, отсутствующих коллег и уже завершённую катастрофу.
    saved = await page.evaluate(() => JSON.parse(localStorage.getItem('nepalsya.currentSave')));
    saved.officeEvent = null;
    saved.day.queue = 2;
    saved.day.queueTotal = 3;
    saved.day.lunchAway = true;
    saved.day.lunchCalled = true;
    saved.day.lunchOpen = true;
    saved.day.aljaziraDisasterDone = true;
    saved.day.aljaziraDisasterAt = 660;
    saved.coworkers.forEach(c => { if (!c.remote && c.id !== 'tigran') c.away = true; });
    saved.player.action = 'queue';
    saved.player.actionTimer = 24;
    saved.player.x = 7;
    saved.player.y = 9;
    await seedNextLoad([['nepalsya.currentSave', JSON.stringify(saved)]]);
    await reload();
    restored = await page.evaluate(() => ({
      status: NP_DEBUG.loadResult.status,
      player: NP_DEBUG.state.player,
      flags: NP_DEBUG.flags,
      coworkers: NP_DEBUG.coworkers,
      aljazira: NP_DEBUG.aljazira,
    }));
    assert.strictEqual(restored.status, 'resumed');
    assert.strictEqual(restored.player.action, 'queue');
    assert.ok(restored.player.queueTarget && restored.player.queueTarget.x !== 7);
    assert.strictEqual(restored.flags.lunchAway, true);
    assert.strictEqual(restored.flags.aljaziraDisasterDone, true);
    assert.ok(restored.coworkers.some(c => c.away), 'состояние ушедших коллег восстановлено');

    // Некорректное состояние одного отложенного расширения не теряет остальную смену.
    saved = await page.evaluate(() => JSON.parse(localStorage.getItem('nepalsya.currentSave')));
    saved.extensions.moments = { constructor: true };
    saved.extensions.relationships = { aimashyn: 2 };
    await seedNextLoad([['nepalsya.currentSave', JSON.stringify(saved)]]);
    await reload();
    restored = await page.evaluate(() => ({
      status: NP_DEBUG.loadResult.status,
      persistence: NP_DEBUG.persistence,
      save: JSON.parse(localStorage.getItem('nepalsya.currentSave')),
    }));
    assert.strictEqual(restored.status, 'resumed');
    assert.strictEqual(restored.persistence.extensionErrors.moments, 'unsafe_key');
    assert.deepStrictEqual(restored.save.extensions.relationships, { aimashyn: 2 });

    // Действие work восстанавливается за своим столом, а toilet — у двери туалета.
    saved = await page.evaluate(() => JSON.parse(localStorage.getItem('nepalsya.currentSave')));
    saved.player.action = 'work'; saved.player.x = 7; saved.player.y = 9;
    await seedNextLoad([['nepalsya.currentSave', JSON.stringify(saved)]]);
    await reload();
    restored = await page.evaluate(() => NP_DEBUG.state.player);
    assert.strictEqual(restored.action, 'work');
    assert.deepStrictEqual({ x: restored.x, y: restored.y }, seat, 'work возвращается в допустимую точку');
    saved.player.action = 'toilet'; saved.player.x = 7; saved.player.y = 9;
    await seedNextLoad([['nepalsya.currentSave', JSON.stringify(saved)]]);
    await reload();
    restored = await page.evaluate(() => NP_DEBUG.state.player);
    assert.strictEqual(restored.action, 'toilet');
    assert.notDeepStrictEqual({ x: restored.x, y: restored.y }, { x: 7, y: 9 }, 'toilet возвращается к безопасной двери');

    // Миграция v2 даёт одну передышку и сразу заменяет снимок на v3.
    const legacy = {
      v: 2, dayIndex: 0, diffKey: 'normal', clockMinutes: 620, usefulness: 12, fun: 19,
      reprimands: 0, weekReprimands: 1, planTarget: 70, majikArc: 0,
      day: { fed: true, lunchAway: false, pee: 30 }, todo: [], stats: { coffees: 1, chatted: [] }, officeEvent: null,
    };
    await seedNextLoad([['nepalsya.day', '0'], ['nepalsya.difficulty', '"normal"'], ['nepalsya.currentSave', JSON.stringify(legacy)]]);
    await reload();
    restored = await page.evaluate(() => ({ result: NP_DEBUG.loadResult, state: NP_DEBUG.state, persistence: NP_DEBUG.persistence, save: JSON.parse(localStorage.getItem('nepalsya.currentSave')) }));
    assert.strictEqual(restored.result.status, 'migrated');
    assert.strictEqual(restored.state.clockMinutes, 620);
    assert.strictEqual(restored.state.player.action, 'none');
    assert.strictEqual(restored.persistence.recoveryGraceUsed, true);
    assert.strictEqual(restored.save.v, 3, 'v2 заменён снимком v3');
    await reload();
    assert.strictEqual((await page.evaluate(() => NP_DEBUG.loadResult.status)), 'resumed', 'миграция не повторяется на следующей загрузке');

    // Повторный старт с сохранением не добавляет стартовый бонус лампы.
    await page.evaluate(() => {
      NP_DEBUG.setUpgrades({ lava: true });
      NP_DEBUG.set({ fun: 41 });
      NP_DEBUG.saveProgress();
      NP_DEBUG.restart(321);
    });
    assert.strictEqual((await page.evaluate(() => NP_DEBUG.state.fun)), 41);

    // Контекст не подходит — сохранение остаётся на месте, посторонние данные не меняются.
    saved = await page.evaluate(() => JSON.parse(localStorage.getItem('nepalsya.currentSave')));
    saved.dayIndex = 4;
    await seedNextLoad([['nepalsya.day', '0'], ['nepalsya.currentSave', JSON.stringify(saved)], ['nepalsya.coins', '73']]);
    await reload();
    restored = await page.evaluate(() => ({ result: NP_DEBUG.loadResult, raw: JSON.parse(localStorage.getItem('nepalsya.currentSave')), coins: localStorage.getItem('nepalsya.coins') }));
    assert.strictEqual(restored.result.reason, 'context_mismatch');
    assert.strictEqual(restored.raw.dayIndex, 4);
    assert.strictEqual(restored.coins, '73');

    // Неизвестная версия не загружается и не стирает пользовательские ключи.
    const bad = { v: 99, payload: 'оставить для диагностики' };
    await seedNextLoad([['nepalsya.currentSave', JSON.stringify(bad)], ['nepalsya.coins', '73']]);
    await reload();
    restored = await page.evaluate(() => ({ result: NP_DEBUG.loadResult, raw: JSON.parse(localStorage.getItem('nepalsya.currentSave')), coins: localStorage.getItem('nepalsya.coins') }));
    assert.strictEqual(restored.result.reason, 'unsupported_version');
    assert.deepStrictEqual(restored.raw, bad);
    assert.strictEqual(restored.coins, '73');
    assert.deepStrictEqual(errors, [], `ошибки страницы: ${errors.join('; ')}`);

    // Ошибка доступа к Web Storage не должна ронять игру или debug-save.
    const blocked = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    await blocked.addInitScript(() => {
      Storage.prototype.getItem = () => { throw new Error('storage blocked'); };
      Storage.prototype.setItem = () => { throw new Error('storage blocked'); };
    });
    await blocked.goto(url);
    const saveResult = await blocked.evaluate(() => NP_DEBUG.saveProgress());
    assert.strictEqual(saveResult.ok, true);
    assert.ok(await blocked.evaluate(() => NP_DEBUG.state.mode === 'playing'));
    await blocked.close();
    process.stdout.write('qa-plan-02: все проверки пройдены\n');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

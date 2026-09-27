'use strict';
// Подключение принтерного и коллегиального отвлечения: маршрут, кредит, прерывания и сохранение.
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

  const reset = async (seed, day = 1) => page.evaluate(({ seed: currentSeed, day: currentDay }) => {
    localStorage.clear();
    localStorage.setItem('nepalsya.weekDone', 'true');
    localStorage.setItem('nepalsya.day', String(currentDay));
    localStorage.setItem('nepalsya.onboardingDone', 'true');
    NP_DEBUG.restart(currentSeed);
    NP_DEBUG.setDay(currentDay);
    NP_DEBUG.setDailyEnabled(false); // дейлик 09:30 не должен вмешиваться в сценарий
    NP_DEBUG.clearEvents();
    NP_DEBUG.hideBanner();
    NP_DEBUG.set({ usefulness: 0, fun: 0, noPee: true });
    NP_DEBUG.setBoss(706, 446, 'office');
    NP_DEBUG.teleport(470, 452);
    NP_DEBUG.setAction('none', 0);
    nextBossCheck = 999;
    timeScale = 1;
    store.set('timeScale', 1);
    muted = false;
    store.set('muted', false);
  }, { seed, day });

  const snapshot = () => page.evaluate(() => {
    const result = NP_DEBUG.saveProgress();
    if (!result.ok) throw new Error(`save failed: ${result.reason}`);
    return result.snapshot;
  });
  const openPrinterChoice = async () => {
    await page.evaluate(() => NP_DEBUG.interact());
    const choice = await page.evaluate(() => NP_DEBUG.actionChoiceView);
    assert(choice, 'E у свободного принтера открывает выбор');
    return choice;
  };
  const startPrinterDistraction = async () => {
    const choice = await openPrinterChoice();
    const status = await page.evaluate(() => ({ state: NP_DEBUG.state, clockMinutes, bossLeaves: today().bossLeaves }));
    assert.strictEqual(choice.id, 'printer-approach');
    assert.strictEqual(choice.options[1].id, 'distraction');
    assert.strictEqual(choice.options[1].disabledReason, '', `приманка доступна при свободном Д.Н. и пути: ${JSON.stringify({ option: choice.options[1], status })}`);
    await page.evaluate(() => {
      NP_DEBUG.selectActionChoice(1);
      NP_DEBUG.skip(2.1);
    });
    const started = await snapshot();
    assert.strictEqual(started.extensions.distractions.active.kind, 'printer');
    assert.strictEqual(started.extensions.distractions.active.phase, 'walking');
    return started;
  };
  const waitForOccupied = () => page.evaluate(() => {
    let steps = 0;
    while (saveExtensions.distractions?.active?.phase === 'walking' && steps < 240) {
      NP_DEBUG.skip(0.05);
      steps++;
    }
    return { steps, boss: NP_DEBUG.state.boss, distraction: saveExtensions.distractions };
  });
  const clickFavorButton = () => page.evaluate(() => {
    const box = NP_DEBUG.phonePanel.hitboxes.find(item => item.type === 'favor' && item.id === 'bleb');
    if (!box) return { clicked: false, reason: 'button_missing' };
    const rect = document.querySelector('canvas').getBoundingClientRect();
    const scale = NP_DEBUG.phonePanel.scale;
    const x = rect.left + (box.x + box.w / 2) * scale / 960 * rect.width;
    const y = rect.top + (box.y + box.h / 2) * scale / 540 * rect.height;
    return { clicked: handlePhonePanelPointer(x, y), result: saveExtensions.distractions, relationship: NP_DEBUG.relationships.entries.bleb };
  });

  try {
    fs.mkdirSync(output, { recursive: true });
    await page.goto(url);
    await page.waitForFunction(() => !!window.NP_DEBUG);

    await reset(1401);
    let choice = await openPrinterChoice();
    assert.strictEqual(choice.title, 'Ксерокс: выбрать действие');
    assert.strictEqual(choice.options[0].label, 'Распечатать мем');
    assert.strictEqual(choice.options[0].detail, '3.5 с · +3 кайфа · +2 к плану');
    await page.screenshot({ path: path.join(output, '14-printer-choice-960x540.png') });
    const meme = await page.evaluate(() => {
      const before = NP_DEBUG.state;
      NP_DEBUG.selectActionChoice(0);
      const atStart = NP_DEBUG.state;
      NP_DEBUG.skip(3.6);
      return { before, atStart, after: NP_DEBUG.state, snapshot: NP_DEBUG.saveProgress().snapshot };
    });
    assert.strictEqual(meme.atStart.player.action, 'printer');
    assert.strictEqual(meme.atStart.fun, meme.before.fun + 3, 'обычная печать сохраняет кайф');
    assert.strictEqual(meme.atStart.usefulness, meme.before.usefulness + 2, 'обычная печать сохраняет KPI');
    assert.strictEqual(meme.after.stats.printed, 1, 'обычная печать засчитывается');
    assert.strictEqual(meme.snapshot.extensions.distractions.active, null, 'обычная печать не начинает отвлечение');
    assert.strictEqual(meme.snapshot.extensions.distractions.successfulUses, 0);

    await reset(1402);
    await page.evaluate(() => { NP_DEBUG.startEvent('jam'); NP_DEBUG.interact(); });
    const jamStart = await page.evaluate(() => ({ game: NP_DEBUG.state, event: NP_DEBUG.event }));
    assert.strictEqual(jamStart.event.id, 'jam');
    assert.strictEqual(jamStart.game.player.action, 'fixjam', 'сломанный принтер сохраняет ремонт');
    await page.evaluate(() => NP_DEBUG.skip(3.1));
    const jamDone = await page.evaluate(() => NP_DEBUG.state);
    assert.strictEqual(jamDone.usefulness, 9, 'починка даёт прежние +9 к плану');
    assert.strictEqual(jamDone.stats.printed, 0);

    await reset(1403);
    const prepStart = await page.evaluate(() => {
      NP_DEBUG.interact();
      const choice = NP_DEBUG.actionChoiceView;
      const before = NP_DEBUG.state;
      const selectedChoice = NP_DEBUG.selectActionChoice(1);
      const selected = NP_DEBUG.state;
      NP_DEBUG.skip(1.95);
      const preparing = NP_DEBUG.saveProgress().snapshot;
      NP_DEBUG.skip(0.15);
      nextBossCheck = 0;
      NP_DEBUG.skip(0.05);
      const started = NP_DEBUG.saveProgress().snapshot;
      return { choice, before, selected, selectedChoice, access: canStartBossDistraction('printer'), selectedChoiceResult: NP_DEBUG.actionChoiceResult, preparing, started, nextBossCheck };
    });
    assert.strictEqual(prepStart.selected.player.action, 'printer-distraction-prep', JSON.stringify({ option: prepStart.choice.options[1], access: prepStart.access, selectedChoice: prepStart.selectedChoice, result: prepStart.selectedChoiceResult }));
    assert.strictEqual(prepStart.selected.fun, prepStart.before.fun, 'выбор не даёт кайф');
    assert.strictEqual(prepStart.selected.usefulness, prepStart.before.usefulness, 'выбор не даёт план');
    assert.strictEqual(prepStart.preparing.extensions.distractions.active, null, 'подготовка сама не начинает маршрут');
    assert.strictEqual(prepStart.preparing.distractions, undefined);
    assert.strictEqual(prepStart.started.extensions.distractions.active.phase, 'walking');
    assert.strictEqual(prepStart.started.extensions.distractions.successfulUses, 0, 'использование засчитывается только после прибытия');
    assert.strictEqual(prepStart.nextBossCheck, 0, 'таймер проверки не идёт во время отвлечения');
    const arrived = await waitForOccupied();
    assert.strictEqual(arrived.distraction.active.phase, 'occupied', 'маршрут приводит Д.Н. к точке');
    assert.ok(arrived.steps < 240, 'маршрут завершается в лимит 12 с');
    assert.strictEqual(arrived.distraction.successfulUses, 1);
    await page.screenshot({ path: path.join(output, '14-printer-distraction-occupied-960x540.png') });
    const rest = await page.evaluate(() => {
      NP_DEBUG.teleport(470, 452);
      NP_DEBUG.setBoss(470, 452, 'distractionWait', 0);
      NP_DEBUG.setAction('fridge', 0.5);
      NP_DEBUG.skip(0.6);
      return {
        game: NP_DEBUG.state,
        distraction: saveExtensions.distractions,
        moments: NP_DEBUG.moments,
        nextBossCheck,
      };
    });
    assert.strictEqual(rest.game.boss.seesPlayer, true, 'конус остаётся активен у приманки');
    assert.strictEqual(rest.distraction.active.playerRestFinished, true, 'завершённый отдых отмечен во время occupied');
    assert.strictEqual(rest.moments.awards.filter(item => item.id === 'distraction').length, 1, 'момент выдаётся только за завершённый отдых');
    const complete = await page.evaluate(() => {
      let steps = 0;
      while (saveExtensions.distractions.active && steps < 160) { NP_DEBUG.skip(0.05); steps++; }
      return { distraction: saveExtensions.distractions, boss: NP_DEBUG.state.boss, nextBossCheck };
    });
    assert.strictEqual(complete.distraction.active, null, 'occupied завершается');
    assert.strictEqual(complete.distraction.lastOutcome, 'done');
    assert.ok(complete.distraction.cooldownRemaining > 44.9 && complete.distraction.cooldownRemaining <= 45, String(complete.distraction.cooldownRemaining));
    assert.strictEqual(complete.boss.state, 'return', 'после occupied начальник возвращается к обычному маршруту');
    assert.ok(complete.nextBossCheck >= 4, 'плановая проверка не запускается сразу после отвлечения');
    const cooldown = await page.evaluate(() => {
      NP_DEBUG.recordRelationshipEvent('bleb', 'help', 'qa14-cooldown-help');
      NP_DEBUG.setBoss(706, 446, 'office');
      nextBossCheck = 999;
      const immediate = NP_DEBUG.requestFavor('bleb', 'distraction');
      NP_DEBUG.skip(44.5);
      const beforeExpired = saveExtensions.distractions.cooldownRemaining;
      const stillCooling = NP_DEBUG.requestFavor('bleb', 'distraction');
      NP_DEBUG.skip(0.6);
      const afterExpired = saveExtensions.distractions.cooldownRemaining;
      const available = NP_DEBUG.requestFavor('bleb', 'distraction');
      return { immediate, beforeExpired, stillCooling, afterExpired, available, distraction: saveExtensions.distractions, relationship: NP_DEBUG.relationships.entries.bleb };
    });
    assert.strictEqual(cooldown.immediate.reason, 'cooldown', 'второй вид отвлечения ждёт cooldown');
    assert.ok(cooldown.beforeExpired > 0, 'cooldown ещё активен до 45 с');
    assert.strictEqual(cooldown.stillCooling.reason, 'cooldown');
    assert.strictEqual(cooldown.afterExpired, 0, 'cooldown заканчивается после 45 игровых секунд');
    assert.strictEqual(cooldown.available.ok, true, 'после cooldown Блеба можно попросить');
    assert.strictEqual(cooldown.relationship.favorCredit, 0, 'кредит расходуется только после успешного begin');
    assert.strictEqual(cooldown.distraction.successfulUses, 1, 'второе использование ждёт прибытия к Блебу');

    await reset(1404);
    await startPrinterDistraction();
    await page.evaluate(() => {
      NP_DEBUG.setAction('fridge', 0.15);
      NP_DEBUG.skip(0.2);
    });
    let beforeArrivalRest = await page.evaluate(() => ({
      phase: saveExtensions.distractions.active.phase,
      awards: NP_DEBUG.moments.awards.filter(item => item.id === 'distraction').length,
    }));
    assert.strictEqual(beforeArrivalRest.phase, 'walking');
    assert.strictEqual(beforeArrivalRest.awards, 0, 'отдых до прибытия не выдаёт момент');
    await waitForOccupied();
    await page.evaluate(() => NP_DEBUG.endAction('cancel'));
    const canceledRest = await page.evaluate(() => ({
      active: saveExtensions.distractions.active,
      awards: NP_DEBUG.moments.awards.filter(item => item.id === 'distraction').length,
    }));
    assert.strictEqual(canceledRest.awards, 0, 'отмена отдыха не выдаёт момент');

    await reset(1405);
    const help = await page.evaluate(() => NP_DEBUG.recordRelationshipEvent('bleb', 'help', 'qa14-bleb-help'));
    assert.strictEqual(help.ok, true, 'помощь Блеба создаёт кредит');
    await page.evaluate(() => { NP_DEBUG.openPhonePanel(); NP_DEBUG.selectPhonePage('colleagues'); NP_DEBUG.skip(0.25); });
    await page.waitForTimeout(120);
    const panel = await page.evaluate(() => NP_DEBUG.phonePanel);
    const favorBox = panel.hitboxes.find(item => item.type === 'favor' && item.id === 'bleb');
    assert(favorBox, 'кнопка Блеба видна при наличии кредита');
    await page.screenshot({ path: path.join(output, '14-bleb-distraction-phone-960x540.png') });
    const blebStart = await clickFavorButton();
    assert.strictEqual(blebStart.clicked, true, 'кнопка панели запускает просьбу');
    assert.strictEqual(blebStart.result.active.kind, 'colleague');
    assert.strictEqual(blebStart.result.active.phase, 'walking');
    assert.strictEqual(blebStart.result.successfulUses, 0, 'пока Блеб не достигнут, использование не считается');
    assert.strictEqual(blebStart.relationship.favorCredit, 0, 'кредит тратится после успешного begin');
    assert.strictEqual(blebStart.relationship.favorUsedDay, 1);

    await reset(1406);
    const noCredit = await page.evaluate(() => NP_DEBUG.requestFavor('bleb', 'distraction'));
    assert.strictEqual(noCredit.ok, false);
    assert.strictEqual(noCredit.reason, 'favor_unavailable');
    await page.evaluate(() => NP_DEBUG.recordRelationshipEvent('bleb', 'help', 'qa14-busy-help'));
    const absentBleb = await page.evaluate(() => {
      coworkerById('bleb').away = true;
      const result = NP_DEBUG.requestFavor('bleb', 'distraction');
      coworkerById('bleb').away = false;
      return { result, credit: NP_DEBUG.relationships.entries.bleb.favorCredit, active: saveExtensions.distractions.active };
    });
    assert.strictEqual(absentBleb.result.ok, false);
    assert.strictEqual(absentBleb.result.reason, 'npc_unavailable');
    assert.strictEqual(absentBleb.credit, 1, 'недоступный Блеб не расходует кредит');
    assert.strictEqual(absentBleb.active, null);
    const busy = await page.evaluate(() => {
      NP_DEBUG.setBoss(500, 350, 'inspect');
      const result = NP_DEBUG.requestFavor('bleb', 'distraction');
      return { result, credit: NP_DEBUG.relationships.entries.bleb.favorCredit, active: saveExtensions.distractions.active };
    });
    assert.strictEqual(busy.result.ok, false);
    assert.strictEqual(busy.result.reason, 'boss_unavailable');
    assert.strictEqual(busy.credit, 1, 'занятый Д.Н. не расходует кредит');
    assert.strictEqual(busy.active, null);
    const noRoute = await page.evaluate(() => {
      NP_DEBUG.setBoss(706, 446, 'office');
      const originalLength = WD.colliders.length;
      const target = bossDistractionTarget('colleague');
      WD.colliders.push({ x: target.x - 5, y: target.y - 5, w: 10, h: 10 });
      const result = NP_DEBUG.requestFavor('bleb', 'distraction');
      WD.colliders.length = originalLength;
      return { result, credit: NP_DEBUG.relationships.entries.bleb.favorCredit };
    });
    assert.strictEqual(noRoute.result.ok, false);
    assert.strictEqual(noRoute.result.reason, 'route_unavailable');
    assert.strictEqual(noRoute.credit, 1, 'нет пути — кредит остаётся');

    await reset(1407);
    await startPrinterDistraction();
    await page.evaluate(() => NP_DEBUG.startEvent('drill'));
    const drill = await page.evaluate(() => ({ boss: NP_DEBUG.state.boss, distraction: saveExtensions.distractions, nextBossCheck }));
    assert.strictEqual(drill.distraction.active, null, 'учения прерывают приманку');
    assert.strictEqual(drill.boss.state, 'goout', 'Д.Н. уходит на эвакуацию');
    assert.ok(drill.nextBossCheck >= 4);

    await reset(1408);
    await startPrinterDistraction();
    await page.evaluate(() => {
      NP_DEBUG.setClock(CFG.lunchOpen + 12);
      NP_DEBUG.skip(0.05);
    });
    const bossLunch = await page.evaluate(() => ({ boss: NP_DEBUG.state.boss, distraction: saveExtensions.distractions, flags: NP_DEBUG.flags }));
    assert.strictEqual(bossLunch.flags.bossLunch, true);
    assert.strictEqual(bossLunch.distraction.active, null, 'обед Д.Н. прерывает приманку');
    assert.strictEqual(bossLunch.boss.state, 'goout');

    await reset(1409);
    await startPrinterDistraction();
    const playerLunch = await page.evaluate(() => {
      NP_DEBUG.setClock(CFG.lunchOpen + 2);
      NP_DEBUG.teleport(WD.exitDoor.x, WD.exitDoor.y);
      NP_DEBUG.interact();
      return { boss: NP_DEBUG.state.boss, player: NP_DEBUG.state.player, distraction: saveExtensions.distractions };
    });
    assert.strictEqual(playerLunch.player.action, 'lunch');
    assert.strictEqual(playerLunch.distraction.active, null, 'обед игрока прерывает приманку');
    assert.strictEqual(playerLunch.boss.state, 'return');

    await reset(1410, 4);
    await startPrinterDistraction();
    await page.evaluate(() => { NP_DEBUG.setClock(17 * 60); NP_DEBUG.skip(0.05); });
    const friday = await page.evaluate(() => ({ boss: NP_DEBUG.state.boss, distraction: saveExtensions.distractions }));
    assert.strictEqual(friday.distraction.active, null, 'пятничный уход прерывает приманку');
    assert.strictEqual(friday.boss.state, 'leaving');

    await reset(1411);
    await startPrinterDistraction();
    await waitForOccupied();
    await page.evaluate(() => { nextBossCheck = 0; pauseGame(); });
    const paused = await page.evaluate(() => ({ mode: NP_DEBUG.state.mode, save: NP_DEBUG.saveProgress().snapshot }));
    assert.strictEqual(paused.mode, 'paused');
    assert.strictEqual(paused.save.extensions.distractions.active.phase, 'occupied', 'пауза сохраняет occupied');
    const pausedRemaining = paused.save.extensions.distractions.active.remainingSeconds;
    await page.evaluate(() => NP_DEBUG.skip(2));
    const afterPausedSkip = await page.evaluate(() => saveExtensions.distractions.active.remainingSeconds);
    assert.strictEqual(afterPausedSkip, pausedRemaining, 'таймер отвлечения не идёт на паузе');
    await page.reload();
    await page.waitForFunction(() => !!window.NP_DEBUG && NP_DEBUG.state.mode === 'playing');
    const restored = await page.evaluate(() => ({ load: NP_DEBUG.loadResult, distraction: saveExtensions.distractions }));
    assert.strictEqual(restored.load.status, 'resumed');
    assert.strictEqual(restored.distraction.active.phase, 'occupied', 'occupied восстанавливается после reload');

    await reset(1412);
    await startPrinterDistraction();
    const timeout = await page.evaluate(() => {
      saveExtensions.distractions.active.remainingSeconds = 0.05;
      NP_DEBUG.skip(0.1);
      return { distraction: saveExtensions.distractions, boss: NP_DEBUG.state.boss, nextBossCheck };
    });
    assert.strictEqual(timeout.distraction.active, null, 'истёкший walking завершён');
    assert.strictEqual(timeout.distraction.successfulUses, 0, 'walking timeout не засчитывает использование');
    assert.strictEqual(timeout.distraction.lastOutcome, 'walking_timeout');
    assert.strictEqual(timeout.boss.state, 'return', 'после timeout Д.Н. не зависает у маршрута');
    assert.ok(timeout.nextBossCheck >= 4);

    await reset(1413);
    await page.evaluate(() => {
      NP_DEBUG.interact();
      NP_DEBUG.selectActionChoice(1);
      NP_DEBUG.setAction('printer-distraction-prep', 1);
      NP_DEBUG.endAction('cancel');
    });
    assert.strictEqual((await snapshot()).extensions.distractions?.active || null, null, 'отмена подготовки не создаёт маршрут');

    await reset(1414);
    await startPrinterDistraction();
    await waitForOccupied();
    const videoConflict = await page.evaluate(() => {
      NP_DEBUG.teleport(870, 430);
      NP_DEBUG.interact();
      NP_DEBUG.selectActionChoice(1);
      NP_DEBUG.skip(3.1);
      return { boss: NP_DEBUG.state.boss, distraction: saveExtensions.distractions, activity: saveExtensions.activities.active };
    });
    assert.strictEqual(videoConflict.boss.state, 'distractionWait', 'громкий YouTube не перехватывает маршрут отвлечения');
    assert.strictEqual(videoConflict.distraction.active.phase, 'occupied');
    assert.strictEqual(videoConflict.distraction.active.kind, 'printer');
    assert.ok(videoConflict.activity.noiseTriggered);

    await reset(1415);
    await startPrinterDistraction();
    await waitForOccupied();
    await page.evaluate(() => NP_DEBUG.finish('munich'));
    const ended = await page.evaluate(() => ({ mode: NP_DEBUG.state.mode, active: saveExtensions.distractions.active }));
    assert.strictEqual(ended.mode, 'ended');
    assert.strictEqual(ended.active, null, 'конец смены очищает приманку');

    await page.evaluate(() => { NP_DEBUG.clearSavedProgress(); NP_DEBUG.restart(1416); NP_DEBUG.setDay(1); });
    const newShift = await page.evaluate(() => {
      const state = ensureDistractionsExtension();
      return { shiftId: state.shiftId, state };
    });
    assert.strictEqual(newShift.state.successfulUses, 0, 'новая смена сбрасывает лимиты');
    assert.deepStrictEqual(newShift.state.usedKinds, []);
    assert.strictEqual(newShift.state.cooldownRemaining, 0);
    assert.deepStrictEqual(errors, [], `page errors: ${errors.join('; ')}`);
    console.log('Office stories card 14 passed: printer, Bleb credit, routing, visibility, priorities, pause/reload, timeout, and shift cleanup.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

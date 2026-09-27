'use strict';
// Карточка 21: ограниченная установка курсора, пустой стол, прямое обнаружение и СБ.
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
  const url = pathToFileURL(path.join(__dirname, '..', 'index.html')).href + '#play';
  page.on('pageerror', error => errors.push(error.message));

  const reset = seed => page.evaluate(currentSeed => {
    stopAutopilot();
    localStorage.clear();
    localStorage.setItem('nepalsya.weekDone', 'true');
    localStorage.setItem('nepalsya.day', '3');
    localStorage.setItem('nepalsya.onboardingDone', 'true');
    const loadout = { ownedEquipment: ['autoclicker'], loadout: ['autoclicker', null] };
    persistEquipmentLoadout(createEquipmentState(loadout));
    NP_DEBUG.setDay(3);
    NP_DEBUG.restart(currentSeed);
    NP_DEBUG.setDay(3);
    NP_DEBUG.clearEvents();
    NP_DEBUG.hideBanner();
    NP_DEBUG.set({ usefulness: 0, fun: 25, noPee: true, misses: 0, reprimands: 0 });
    NP_DEBUG.setBoss(706, 446, 'office');
    NP_DEBUG.setClock(600);
    NP_DEBUG.setAction('none', 0);
    NP_DEBUG.teleport(SEAT.x, SEAT.y);
    nextBossCheck = 999;
    timeScale = 1;
    store.set('timeScale', 1);
    NP_DEBUG.setUpgrades({});
    return { state: NP_DEBUG.state, equipment: saveExtensions.equipment };
  }, seed);

  const openDeskChoice = () => page.evaluate(() => {
    NP_DEBUG.teleport(SEAT.x, SEAT.y);
    const before = NP_DEBUG.state;
    NP_DEBUG.interact();
    return { before, choice: NP_DEBUG.actionChoice, prompt: getActionInfo().prompt };
  });
  const install = async () => {
    const opened = await openDeskChoice();
    assert.equal(opened.choice?.id, 'autoclicker-desk', 'у собственного стола открылся выбор');
    assert.equal(await page.evaluate(() => NP_DEBUG.selectActionChoice(1)), true, 'установка выбрана');
    return page.evaluate(() => ({ state: NP_DEBUG.state, equipment: structuredClone(saveExtensions.equipment) }));
  };
  const awayAndCheck = () => page.evaluate(() => {
    NP_DEBUG.teleport(42, 190);
    NP_DEBUG.setAction('none', 0);
    NP_DEBUG.deskCheck();
    return { state: NP_DEBUG.state, equipment: structuredClone(saveExtensions.equipment), snapshot: NP_DEBUG.saveProgress().snapshot };
  });

  try {
    fs.mkdirSync(output, { recursive: true });
    await page.goto(url);
    await page.waitForFunction(() => !!window.NP_DEBUG);

    // Товар появляется после карточки 21 и прямо сообщает, что работы он не выполняет.
    await reset(2101);
    const catalog = await page.evaluate(() => {
      renderEquipmentShop();
      const item = Array.from(ui.equipmentList.querySelectorAll('.equipment-item')).find(card => card.textContent.includes('Автокликер'));
      return { item: item && item.textContent, html: ui.equipmentList.textContent };
    });
    assert.ok(catalog.item);
    assert.match(catalog.html, /Установка занимает 2 с/);
    assert.match(catalog.html, /не выполняет работу|не производит работу|не выполняет/);
    assert.match(catalog.html, /2 с.*провер/);

    // Отмена установки сжигает заряд и не позволяет поставить её повторно.
    await reset(2102);
    await openDeskChoice();
    await page.evaluate(() => NP_DEBUG.selectActionChoice(1));
    await page.evaluate(() => { NP_DEBUG.skip(0.55); NP_DEBUG.endAction('cancel'); });
    let canceled = await page.evaluate(() => ({
      action: NP_DEBUG.state.player.action,
      clicker: structuredClone(saveExtensions.equipment.autoclicker),
      used: saveExtensions.equipment.usedCharges.autoclicker,
      offered: autoclickerCanOfferDeskChoice(),
    }));
    assert.equal(canceled.action, 'none');
    assert.equal(canceled.clicker.phase, 'interrupted');
    assert.equal(canceled.used, true);
    assert.equal(canceled.offered, false);

    // Установка завершается за 2 игровых секунды, курсор живёт 10; награды обычной работы не меняются.
    await reset(2103);
    const opened = await openDeskChoice();
    assert.equal(opened.choice?.options.length, 2);
    await page.screenshot({ path: path.join(output, '21-autoclicker-choice-960x540.png') });
    const beforeInstall = await page.evaluate(() => ({
      usefulness: NP_DEBUG.state.usefulness, fun: NP_DEBUG.state.fun,
      worked: NP_DEBUG.state.stats.workedSeconds,
      excelAcc: NP_DEBUG.state.excelWorkAcc, tasks: NP_DEBUG.state.excelPoolTasks,
      applications: JSON.stringify(todo),
    }));
    await page.evaluate(() => NP_DEBUG.selectActionChoice(1));
    const installing = await page.evaluate(() => ({
      state: NP_DEBUG.state,
      clicker: structuredClone(saveExtensions.equipment.autoclicker),
      snapshot: NP_DEBUG.saveProgress().snapshot,
    }));
    assert.equal(installing.state.player.action, 'autoclicker-install');
    assert.equal(installing.clicker.phase, 'installing');
    // Между выбором и замером может пройти кадр requestAnimationFrame: проверяем начатую, а не истёкшую установку.
    assert.ok(installing.clicker.installRemaining > 1.5 && installing.clicker.installRemaining <= 2, `installRemaining=${installing.clicker.installRemaining}`);
    assert.equal(installing.clicker.placementUsed, true);
    assert.equal(installing.snapshot.extensions.equipment.usedCharges.autoclicker, true, 'начатая установка сохраняется');
    await page.evaluate(() => NP_DEBUG.skip(0.8));
    assert.equal(await page.evaluate(() => saveExtensions.equipment.autoclicker.phase), 'installing');
    await page.evaluate(() => NP_DEBUG.skip(1.4));
    const active = await page.evaluate(() => ({
      state: NP_DEBUG.state,
      clicker: structuredClone(saveExtensions.equipment.autoclicker),
    }));
    assert.equal(active.state.player.action, 'none');
    assert.equal(active.clicker.phase, 'active');
    assert.ok(active.clicker.activeRemaining > 9.5 && active.clicker.activeRemaining <= 10);
    assert.equal(active.state.usefulness, beforeInstall.usefulness);
    assert.equal(active.state.fun, beforeInstall.fun);
    assert.equal(active.state.stats.workedSeconds, beforeInstall.worked);
    assert.equal(active.state.excelWorkAcc, beforeInstall.excelAcc);
    assert.equal(active.state.excelPoolTasks, beforeInstall.tasks);
    assert.equal(JSON.stringify(active.state.todo), beforeInstall.applications);
    const cursorDraw = await page.evaluate(() => {
      NP_DEBUG.teleport(42, 190);
      draw();
      const clicker = saveExtensions.equipment.autoclicker;
      return {
        mode, equipped: equipmentHas('autoclicker'), phase: clicker.phase, remaining: clicker.activeRemaining,
      };
    });
    assert.equal(cursorDraw.mode, 'playing');
    assert.equal(cursorDraw.equipped, true);
    assert.equal(cursorDraw.phase, 'active');
    assert.ok(cursorDraw.remaining > 0);
    await page.screenshot({ path: path.join(output, '21-autoclicker-active-960x540.png') });

    // Автокликер не продлевается cactus/snусом. Он ждёт 2 с, раскрывается, а обычное ожидание сохраняется.
    await reset(2104);
    await install();
    await page.evaluate(() => {
      NP_DEBUG.skip(2.05);
      NP_DEBUG.setUpgrades({ cactus: true });
      boss.snus = 999;
    });
    const waiting = await awayAndCheck();
    const expectedWait = await page.evaluate(() => diff().wait + 1.5 + 2 + 2);
    assert.equal(waiting.state.boss.state, 'waitDesk');
    assert.equal(waiting.state.boss.emptyDesk, true);
    assert.ok(Math.abs(waiting.state.boss.waitT - expectedWait) < 0.001, 'к базовым секундам кактуса и снюса добавлены ровно 2 с');
    assert.equal(waiting.equipment.autoclicker.inspectionWait.remaining, 2, 'cactus/snус не растягивают модельное ожидание');
    assert.equal(waiting.snapshot.boss.emptyDesk, true);
    assert.equal(waiting.snapshot.extensions.equipment.autoclicker.inspectionWait.remaining, 2, 'ожидание сохраняется в snapshot');
    const paused = await page.evaluate(() => {
      const before = { waitT: boss.waitT, clicker: saveExtensions.equipment.autoclicker.inspectionWait.remaining };
      pauseGame(); NP_DEBUG.skip(5);
      const after = { mode, waitT: boss.waitT, clicker: saveExtensions.equipment.autoclicker.inspectionWait.remaining };
      pauseGame();
      return { before, after };
    });
    assert.equal(paused.after.mode, 'paused');
    assert.deepEqual(paused.after, { mode: 'paused', ...paused.before }, 'пауза не расходует оба таймера');
    await page.reload();
    await page.waitForFunction(() => !!window.NP_DEBUG);
    let resumed = await page.evaluate(() => ({
      status: NP_DEBUG.loadResult.status,
      waitT: NP_DEBUG.state.boss.waitT,
      clicker: structuredClone(saveExtensions.equipment.autoclicker),
      emptyDesk: NP_DEBUG.state.boss.emptyDesk,
    }));
    assert.equal(resumed.status, 'resumed');
    assert.equal(resumed.emptyDesk, true);
    // После reload смена сразу идёт на requestAnimationFrame, поэтому остаток зависит от скорости загрузки страницы:
    // проверяем, что ожидание восстановлено (не сброшено и не завершено), а не точное число.
    assert.ok(resumed.clicker.inspectionWait.remaining > 0 && resumed.clicker.inspectionWait.remaining <= 2, `snapshot возвращает остаток ожидания и продолжает симуляцию: ${resumed.clicker.inspectionWait.remaining}`);
    await page.evaluate(() => NP_DEBUG.skip(2.05));
    let revealed = await page.evaluate(() => ({
      state: NP_DEBUG.state,
      clicker: structuredClone(saveExtensions.equipment.autoclicker),
    }));
    assert.equal(revealed.clicker.phase, 'revealed');
    assert.equal(revealed.clicker.activeRemaining, 0);
    assert.equal(revealed.clicker.inspectionWait, null);
    assert.equal(revealed.state.misses, 0, 'раскрытие само по себе не добавляет второй промах');
    assert.equal(revealed.state.boss.state, 'waitDesk');
    assert.ok(revealed.state.boss.waitT > 0, 'базовое ожидание продолжилось после раскрытия');
    await page.screenshot({ path: path.join(output, '21-autoclicker-revealed-960x540.png') });
    await page.evaluate(() => { NP_DEBUG.teleport(SEAT.x, SEAT.y); NP_DEBUG.interact(); NP_DEBUG.skip(0.1); });
    let returned = await page.evaluate(() => ({ state: NP_DEBUG.state, clicker: saveExtensions.equipment.autoclicker }));
    assert.notEqual(returned.state.boss.state, 'waitDesk');
    assert.equal(returned.state.misses, 0, 'возвращение в Excel после раскрытия, но до конца ожидания проходит штатно');
    assert.equal(returned.state.reprimands, 0);

    // Возвращение до раскрытия также завершает ту же проверку без missAtDesk.
    await reset(2105);
    await install();
    await page.evaluate(() => NP_DEBUG.skip(2.05));
    await awayAndCheck();
    await page.evaluate(() => {
      NP_DEBUG.skip(0.8);
      NP_DEBUG.teleport(SEAT.x, SEAT.y);
      NP_DEBUG.interact();
      NP_DEBUG.skip(0.1);
    });
    returned = await page.evaluate(() => ({ state: NP_DEBUG.state, clicker: saveExtensions.equipment.autoclicker }));
    assert.notEqual(returned.state.boss.state, 'waitDesk');
    assert.equal(returned.state.misses, 0);
    assert.equal(returned.clicker.inspectionWait, null);
    assert.equal(returned.clicker.phase, 'active');

    // Если не вернуться, полный таймер даёт ровно один штатный missAtDesk.
    await reset(2106);
    await install();
    await page.evaluate(() => {
      NP_DEBUG.skip(2.05);
      NP_DEBUG.setUpgrades({ cactus: true });
      boss.snus = 999;
    });
    const noReturn = await awayAndCheck();
    await page.evaluate(waitT => NP_DEBUG.skip(waitT + 0.25), noReturn.state.boss.waitT);
    const missed = await page.evaluate(() => NP_DEBUG.state);
    assert.equal(missed.misses, 1);
    assert.equal(missed.reprimands, 0, 'один промах не создаёт дополнительный выговор');

    // Истёкший курсор по дороге не задерживает следующую проверку.
    await reset(2107);
    await install();
    await page.evaluate(() => NP_DEBUG.skip(12.1));
    const expired = await page.evaluate(() => {
      NP_DEBUG.teleport(42, 190);
      NP_DEBUG.deskCheck();
      return { state: NP_DEBUG.state, clicker: saveExtensions.equipment.autoclicker };
    });
    assert.equal(expired.clicker.phase, 'expired');
    assert.equal(expired.state.boss.emptyDesk, false);
    assert.equal(expired.state.boss.waitT, await page.evaluate(() => diff().wait));

    // Папка не превращает курсор в работу и не получает passDeskInspection.
    await reset(2108);
    await install();
    await page.evaluate(() => {
      NP_DEBUG.skip(2.05);
      NP_DEBUG.teleport(42, 190);
      NP_DEBUG.setAction('takeFolder', 4);
      const passes = NP_DEBUG.state.stats.inspectPass;
      NP_DEBUG.deskCheck();
      window.qa21Folder = { action: player.action, passes, after: NP_DEBUG.state.stats.inspectPass, waiting: boss.state };
    });
    const folder = await page.evaluate(() => window.qa21Folder);
    assert.equal(folder.action, 'takeFolder');
    assert.equal(folder.passes, folder.after);
    assert.equal(folder.waiting, 'waitDesk');

    // Камера и прямое обнаружение заканчивают clicker-wait по своему исходу, без второго пропуска.
    await reset(2109);
    await install();
    await page.evaluate(() => {
      NP_DEBUG.skip(2.05);
      NP_DEBUG.teleport(42, 190);
      NP_DEBUG.setAction('none', 0);
      NP_DEBUG.deskCheck();
      const target = { x: SEAT.x, y: WD.FLOOR_TOP + 20 };
      const camera = CAMERAS[1];
      camera.base = Math.atan2(target.y - camera.y, target.x - camera.x);
      camera.span = 0;
      NP_DEBUG.teleport(target.x, target.y);
      NP_DEBUG.setAction('youtube', 5);
      officeEvent = { ...EVENTS.sb, id: 'sb', t: 20, watch: 1.55 };
      updateCameras(0.06);
    });
    let camera = await page.evaluate(() => ({
      state: NP_DEBUG.state,
      clicker: structuredClone(saveExtensions.equipment.autoclicker),
    }));
    assert.equal(camera.state.reprimands, 1, 'камера выдаёт свой обычный выговор');
    assert.equal(camera.state.misses, 0, 'камера не оставляет вторую проверку на промах');
    assert.equal(camera.state.boss.emptyDesk, false);
    assert.equal(camera.clicker.inspectionWait, null);
    assert.notEqual(camera.state.boss.state, 'waitDesk');

    await reset(2110);
    await install();
    const catchResult = await page.evaluate(() => {
      NP_DEBUG.skip(2.05);
      NP_DEBUG.teleport(42, 190);
      NP_DEBUG.deskCheck();
      NP_DEBUG.teleport(SEAT.x, SEAT.y);
      NP_DEBUG.setAction('youtube', 5);
      NP_DEBUG.setBoss(SEAT.x, SEAT.y + 18, 'waitDesk', -Math.PI / 2);
      boss.emptyDesk = true;
      boss.waitT = 100;
      NP_DEBUG.setSuspicion(99.9);
      const catches = NP_DEBUG.state.stats.catches;
      updateBoss(0.05);
      return { state: NP_DEBUG.state, clicker: structuredClone(saveExtensions.equipment.autoclicker), catches };
    });
    assert.equal(catchResult.state.boss.state, 'lecture');
    assert.equal(catchResult.state.stats.catches, catchResult.catches + 1);
    assert.equal(catchResult.state.misses, 0);
    assert.equal(catchResult.state.reprimands, 1);
    assert.equal(catchResult.state.boss.emptyDesk, false);
    assert.equal(catchResult.clicker.inspectionWait, null);

    // Новая смена сбрасывает заряд; отсутствующий Д.Н. не ломает таймер и не создаёт промах.
    await reset(2111);
    await install();
    await page.evaluate(() => NP_DEBUG.skip(2.05));
    const priorShift = await page.evaluate(() => NP_DEBUG.persistence.shiftId);
    await reset(2112);
    const fresh = await page.evaluate(() => ({ shiftId: NP_DEBUG.persistence.shiftId, clicker: saveExtensions.equipment.autoclicker, used: saveExtensions.equipment.usedCharges.autoclicker }));
    assert.notEqual(fresh.shiftId, priorShift);
    assert.equal(fresh.used, false);
    assert.equal(fresh.clicker.phase, 'idle');
    await install();
    await page.evaluate(() => {
      NP_DEBUG.setBoss(-100, 300, 'gone');
      NP_DEBUG.skip(12.1);
    });
    assert.equal(await page.evaluate(() => saveExtensions.equipment.autoclicker.phase), 'expired');
    assert.equal(await page.evaluate(() => NP_DEBUG.state.misses), 0);

    // Автопилот не зависает на выборе и не ставит предмет без решения игрока.
    await reset(2113);
    const autopilotDesk = await page.evaluate(() => {
      toggleAutopilot();
      NP_DEBUG.teleport(SEAT.x, SEAT.y);
      NP_DEBUG.interact();
      return { auto: NP_DEBUG.auto.on, action: NP_DEBUG.state.player.action, choice: NP_DEBUG.actionChoice };
    });
    assert.equal(autopilotDesk.auto, true);
    assert.equal(autopilotDesk.action, 'work');
    assert.equal(autopilotDesk.choice, null);

    // Завершение смены прекращает ожидание и не оставляет пропуск после результата.
    await reset(2114);
    await install();
    await page.evaluate(() => NP_DEBUG.skip(2.05));
    await awayAndCheck();
    const shiftEnd = await page.evaluate(() => {
      const misses = NP_DEBUG.state.misses;
      boss.waitT = 100;
      NP_DEBUG.setClock(CFG.shiftEnd - 0.01);
      NP_DEBUG.skip(0.1);
      return { state: NP_DEBUG.state, clicker: structuredClone(saveExtensions.equipment.autoclicker), misses };
    });
    assert.equal(shiftEnd.state.mode, 'ended');
    assert.equal(shiftEnd.state.misses, shiftEnd.misses);
    assert.equal(shiftEnd.state.boss.emptyDesk, false);
    assert.equal(shiftEnd.clicker.inspectionWait, null);

    // На маленьком экране выбор действий остаётся видимым и читаемым.
    await page.setViewportSize({ width: 844, height: 390 });
    await reset(2115);
    await openDeskChoice();
    await page.screenshot({ path: path.join(output, '21-autoclicker-choice-mobile-844x390.png') });

    assert.deepEqual(errors, [], 'в браузере нет необработанных ошибок');
    console.log('qa-plan-21: установки, таймеры, пустой стол, возврат, раскрытие, пауза/save/resume, камера, прямое обнаружение и UI — OK');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

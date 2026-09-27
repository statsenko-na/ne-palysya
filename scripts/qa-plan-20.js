'use strict';
// Карточка 20: заряд термоса, его использование через телефон и направление зеркала.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { loadPlaywright } = require('./pw');

(async () => {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  let mobilePage = null;
  const errors = [];
  const output = path.join(__dirname, '..', '.qa');
  const url = pathToFileURL(path.join(__dirname, '..', 'index.html')).href + '#play';
  page.on('pageerror', error => errors.push(error.message));

  const reset = async seed => page.evaluate(currentSeed => {
    localStorage.clear();
    localStorage.setItem('nepalsya.weekDone', 'true');
    localStorage.setItem('nepalsya.day', '3');
    localStorage.setItem('nepalsya.onboardingDone', 'true');
    store.set('equipmentLoadout', { ownedEquipment: ['thermos', 'mirror'], loadout: ['thermos', 'mirror'] });
    persistEquipmentLoadout(createEquipmentState(store.get('equipmentLoadout', null)));
    NP_DEBUG.setDay(3);
    NP_DEBUG.restart(currentSeed);
    NP_DEBUG.setDay(3);
    NP_DEBUG.clearEvents();
    NP_DEBUG.hideBanner();
    NP_DEBUG.set({ usefulness: 0, fun: 25, noPee: true });
    NP_DEBUG.setBoss(706, 446, 'office');
    NP_DEBUG.setClock(600);
    NP_DEBUG.setAction('none', 0);
    NP_DEBUG.teleport(42, 190);
    closePhonePanel(true, true);
    phoneAnim = 0;
    nextBossCheck = 999;
    timeScale = 1;
    store.set('timeScale', 1);
    muted = false;
    store.set('muted', false);
  }, seed);

  const brewAtMachine = async (complete = true) => page.evaluate(shouldComplete => {
    const zone = NP_WORLD.zones.find(item => item.id === 'coffee');
    NP_DEBUG.teleport(zone.x + zone.w / 2, zone.y + zone.h / 2);
    NP_DEBUG.interact();
    const startedAction = NP_DEBUG.state.player.action;
    if (shouldComplete) NP_DEBUG.skip(2.9);
    else NP_DEBUG.endAction('cancel');
    return {
      startedAction,
      state: NP_DEBUG.state,
      equipment: JSON.parse(JSON.stringify(saveExtensions.equipment)),
      yogurt: JSON.parse(JSON.stringify(saveExtensions.yogurt)),
    };
  }, complete);

  const openEquipmentPage = () => page.evaluate(() => {
    openPhonePanel();
    selectPhonePage('equipment');
    phoneAnim = 1;
    drawPhone();
  });

  const clickThermosButton = async () => {
    const point = await page.evaluate(() => {
      drawPhone();
      const hit = NP_DEBUG.phonePanel.hitboxes.find(box => box.type === 'thermos');
      if (!hit) throw new Error('Кнопка термоса не нарисована или недоступна');
      const rect = canvasBox();
      return {
        x: rect.left + (hit.x + hit.w / 2) * NP_DEBUG.phonePanel.scale * rect.width / W,
        y: rect.top + (hit.y + hit.h / 2) * NP_DEBUG.phonePanel.scale * rect.height / H,
      };
    });
    await page.mouse.click(point.x, point.y);
  };

  try {
    fs.mkdirSync(output, { recursive: true });
    await page.goto(url);
    await page.waitForFunction(() => !!window.NP_DEBUG);

    // Кофе Хлада не заряжает термос; отменённая обычная варка тоже не даёт заряд.
    await reset(2001);
    await page.evaluate(() => {
      const started = startYogurtStory(createYogurtStory(), {
        shiftId, sourceId: 'qa20-hlad-coffee', clockMinutes, shiftEnded: false,
      });
      const discovered = discoverYogurtStory(started.state, clockMinutes);
      saveExtensions.yogurt = { ...discovered.state, pendingCoffee: false, coffeeCompletedAfterDiscovery: false };
    });
    const forHlad = await brewAtMachine(true);
    assert.strictEqual(forHlad.startedAction, 'coffee');
    assert.strictEqual(forHlad.yogurt.pendingCoffee, false);
    assert.strictEqual(forHlad.state.stats.coffees, 1, 'кофе Хлада учитывается по прежним правилам');
    assert.strictEqual(forHlad.state.player.coffeeBoost, 0, 'кофе Хлада не даёт ускорение');
    assert.strictEqual(forHlad.equipment.thermosBrewed, false, 'кофе Хлада не наполняет термос');
    assert.strictEqual(forHlad.equipment.thermosCharge, false);

    await page.evaluate(() => { saveExtensions.yogurt = createYogurtStory(); });
    const canceled = await brewAtMachine(false);
    assert.strictEqual(canceled.startedAction, 'coffee');
    assert.strictEqual(canceled.equipment.thermosBrewed, false, 'отмена варки не даёт запасной заряд');
    assert.strictEqual(canceled.equipment.thermosCharge, false);

    // Обычная завершённая чашка даёт ровно один заряд; сама выдача заряда не меняет статистику.
    const normal = await page.evaluate(() => {
      const zone = NP_WORLD.zones.find(item => item.id === 'coffee');
      NP_DEBUG.teleport(zone.x + zone.w / 2, zone.y + zone.h / 2);
      const before = NP_DEBUG.state;
      NP_DEBUG.interact();
      const started = NP_DEBUG.state;
      NP_DEBUG.skip(2.9);
      return {
        before: { coffees: before.stats.coffees, fun: before.fun },
        started: { coffees: started.stats.coffees, fun: started.fun, boost: started.player.coffeeBoost },
        after: NP_DEBUG.state,
        equipment: JSON.parse(JSON.stringify(saveExtensions.equipment)),
      };
    });
    assert.strictEqual(normal.equipment.thermosBrewed, true, 'полная обычная чашка заряжает термос: ' + JSON.stringify(normal.equipment));
    assert.strictEqual(normal.equipment.thermosCharge, true);
    assert.strictEqual(normal.equipment.usedCharges.thermos, false);
    assert.strictEqual(normal.after.stats.coffees, normal.started.coffees, 'выдача заряда не добавляет чашку');
    assert.strictEqual(normal.after.fun, normal.started.fun, 'выдача заряда не добавляет кайф');
    assert.ok(Math.abs(normal.after.player.coffeeBoost - (normal.started.boost - 2.9)) < 0.02, 'термос не увеличивает срок турки/кофе');

    const oldShiftId = (await page.evaluate(() => NP_DEBUG.persistence.shiftId));
    const snapshot = await page.evaluate(() => NP_DEBUG.saveProgress());
    assert.strictEqual(snapshot.ok, true);
    await page.reload();
    await page.waitForFunction(() => !!window.NP_DEBUG);
    let resumed = await page.evaluate(() => ({
      status: NP_DEBUG.loadResult.status,
      equipment: JSON.parse(JSON.stringify(saveExtensions.equipment)),
    }));
    assert.strictEqual(resumed.status, 'resumed');
    assert.strictEqual(resumed.equipment.thermosCharge, true, 'готовый заряд сохраняется при resume');

    // Пауза не расходует заряд; после возврата в телефон кнопка остаётся доступна.
    await openEquipmentPage();
    const pause = await page.evaluate(() => {
      const before = saveExtensions.equipment.thermosCharge;
      pauseGame();
      const rejected = activateThermosFromPhone();
      const paused = mode;
      pauseGame();
      openPhonePanel();
      selectPhonePage('equipment');
      phoneAnim = 1;
      drawPhone();
      return { before, after: saveExtensions.equipment.thermosCharge, rejected: rejected.reason, paused, page: phonePage };
    });
    assert.strictEqual(pause.before, true);
    assert.strictEqual(pause.after, true);
    assert.strictEqual(pause.rejected, 'phone_unavailable');
    assert.strictEqual(pause.paused, 'paused');
    assert.strictEqual(pause.page, 'equipment');
    await page.screenshot({ path: path.join(output, '20-thermos-phone-960x540.png') });
    mobilePage = await browser.newPage({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
    await mobilePage.goto(url);
    await mobilePage.waitForFunction(() => !!window.NP_DEBUG);
    await mobilePage.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('nepalsya.weekDone', 'true');
      localStorage.setItem('nepalsya.day', '3');
      localStorage.setItem('nepalsya.onboardingDone', 'true');
      store.set('equipmentLoadout', { ownedEquipment: ['thermos', 'mirror'], loadout: ['thermos', 'mirror'] });
      persistEquipmentLoadout(createEquipmentState(store.get('equipmentLoadout', null)));
      NP_DEBUG.setDay(3);
      NP_DEBUG.restart(2080);
      NP_DEBUG.setDay(3);
      NP_DEBUG.clearEvents();
      NP_DEBUG.hideBanner();
      NP_DEBUG.setBoss(706, 446, 'office');
      saveExtensions.equipment.thermosBrewed = true;
      saveExtensions.equipment.thermosCharge = true;
      openPhonePanel();
      selectPhonePage('equipment');
      phoneAnim = 1;
      drawPhone();
    });
    await mobilePage.screenshot({ path: path.join(output, '20-thermos-phone-844x390.png') });
    await mobilePage.close();
    mobilePage = null;
    await page.setViewportSize({ width: 960, height: 540 });

    const beforeUse = await page.evaluate(() => ({
      boost: player.coffeeBoost,
      coffees: NP_DEBUG.state.stats.coffees,
      fun: NP_DEBUG.state.fun,
      todo: JSON.stringify(todo),
    }));
    await clickThermosButton();
    const afterUse = await page.evaluate(() => ({
      boost: player.coffeeBoost,
      coffees: NP_DEBUG.state.stats.coffees,
      fun: NP_DEBUG.state.fun,
      todo: JSON.stringify(todo),
      equipment: JSON.parse(JSON.stringify(saveExtensions.equipment)),
    }));
    assert.ok(afterUse.boost >= beforeUse.boost - 0.35, 'boost выше 8 секунд не укорачивается');
    assert.strictEqual(afterUse.coffees, beforeUse.coffees, 'термос не создаёт бесплатную чашку');
    assert.strictEqual(afterUse.fun, beforeUse.fun, 'термос не добавляет кайф');
    assert.strictEqual(afterUse.todo, beforeUse.todo, 'термос не засчитывается как задача о кофе');
    assert.strictEqual(afterUse.equipment.thermosCharge, false);
    assert.strictEqual(afterUse.equipment.usedCharges.thermos, true);

    const usedSave = await page.evaluate(() => NP_DEBUG.saveProgress());
    assert.strictEqual(usedSave.ok, true);
    await page.reload();
    await page.waitForFunction(() => !!window.NP_DEBUG);
    resumed = await page.evaluate(() => ({
      status: NP_DEBUG.loadResult.status,
      equipment: JSON.parse(JSON.stringify(saveExtensions.equipment)),
    }));
    assert.strictEqual(resumed.status, 'resumed');
    assert.strictEqual(resumed.equipment.usedCharges.thermos, true, 'использование сохраняется при resume');
    await page.evaluate(() => {
      openPhonePanel();
      selectPhonePage('equipment');
      phoneAnim = 1;
      drawPhone();
    });
    assert.strictEqual(await page.evaluate(() => NP_DEBUG.phonePanel.hitboxes.some(box => box.type === 'thermos')), false, 'вторая кнопка использования не появляется');

    // Новая смена сбрасывает заряд. При turka термос даёт ровно минимум 8 секунд, а не +8.
    await reset(2002);
    const afterNewShift = await page.evaluate(() => ({
      shiftId: NP_DEBUG.persistence.shiftId,
      equipment: JSON.parse(JSON.stringify(saveExtensions.equipment)),
    }));
    assert.notStrictEqual(afterNewShift.shiftId, oldShiftId);
    assert.strictEqual(afterNewShift.equipment.thermosCharge, false);
    assert.strictEqual(afterNewShift.equipment.usedCharges.thermos, false);
    const stoppedReels = await page.evaluate(() => {
      openPhonePanel();
      selectPhonePage('reels');
      const wasScrolling = player.action === 'phone';
      selectPhonePage('equipment');
      return { wasScrolling, after: player.action };
    });
    assert.strictEqual(stoppedReels.wasScrolling, true);
    assert.notStrictEqual(stoppedReels.after, 'phone', 'переход к оснащению завершает просмотр ленты');
    await page.evaluate(() => {
      NP_DEBUG.setUpgrades({ turka: true });
      const zone = NP_WORLD.zones.find(item => item.id === 'coffee');
      NP_DEBUG.teleport(zone.x + zone.w / 2, zone.y + zone.h / 2);
      NP_DEBUG.interact();
      NP_DEBUG.skip(2.9);
      player.coffeeBoost = 0;
      openPhonePanel();
      selectPhonePage('equipment');
      phoneAnim = 1;
      drawPhone();
    });
    assert.strictEqual(await page.evaluate(() => saveExtensions.equipment.thermosCharge), true);
    await clickThermosButton();
    const turkaUse = await page.evaluate(() => ({ boost: player.coffeeBoost, state: saveExtensions.equipment }));
    assert.ok(turkaUse.boost <= 8 && turkaUse.boost > 7.8, 'турка не добавляет свои 8 секунд к заряду термоса');
    assert.strictEqual(turkaUse.state.usedCharges.thermos, true);

    // Зеркало сообщает только направление: у стола, в пределах 180 и при прямой видимости.
    await reset(2003);
    const mirrorChecks = await page.evaluate(() => {
      NP_DEBUG.teleport(SEAT.x, SEAT.y);
      NP_DEBUG.setBoss(SEAT.x, SEAT.y + 138, 'patrol');
      const atDesk = { arrow: equipmentMirrorDirection(), visible: equipmentMirrorVisible(saveExtensions.equipment, { atDesk: true, distance: 138, lineOfSight: true }) };
      NP_DEBUG.teleport(42, 190);
      const away = equipmentMirrorDirection();
      NP_DEBUG.teleport(SEAT.x, SEAT.y);
      NP_DEBUG.setBoss(920, SEAT.y, 'patrol');
      const far = equipmentMirrorDirection();
      NP_DEBUG.setBoss(SEAT.x, SEAT.y + 138, 'office');
      const absent = equipmentMirrorDirection();
      const wall = equipmentMirrorVisible(saveExtensions.equipment, { atDesk: true, distance: 100, lineOfSight: false });
      NP_DEBUG.setBoss(SEAT.x, SEAT.y + 138, 'patrol');
      const blocker = { x: SEAT.x - 3, y: SEAT.y + 50, w: 6, h: 8, kind: 'qa' };
      sightBlockers.push(blocker);
      const occluded = equipmentMirrorDirection();
      sightBlockers.pop();
      const renderedDirection = equipmentMirrorDirection();
      return { atDesk, away, far, absent, wall, occluded, renderedDirection };
    });
    assert.strictEqual(mirrorChecks.atDesk.arrow, '↓');
    assert.strictEqual(mirrorChecks.atDesk.visible, true);
    assert.strictEqual(mirrorChecks.away, null, 'уход от стола скрывает стрелку');
    assert.strictEqual(mirrorChecks.far, null, 'цель дальше 180 ед. не показывается');
    assert.strictEqual(mirrorChecks.absent, null, 'начальник в кабинете не считается целью в офисе');
    assert.strictEqual(mirrorChecks.wall, false, 'непрозрачная стена скрывает цель');
    assert.strictEqual(mirrorChecks.occluded, null, 'реальный adapter не рисует стрелку через стену');
    assert.strictEqual(mirrorChecks.renderedDirection, '↓');
    await page.screenshot({ path: path.join(output, '20-mirror-arrow-960x540.png') });

    assert.strictEqual(errors.length, 0, 'ошибки страницы: ' + errors.join('; '));
    console.log('qa-plan-20: термос, телефон, turka, заряд/resume и зеркало — OK');
  } finally {
    if (mobilePage) await mobilePage.close();
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

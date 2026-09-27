'use strict';
// Карточка 22: наблюдения Д.Н., безопасные точки и выбор памяти в обходе.
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
    return NP_DEBUG.persistence.shiftId;
  }, seed);

  const addMemoryPoint = (incidentId, incidentType = 'caught', safeSpot = { x: 468, y: 230 }) => page.evaluate(({ incidentId, incidentType, safeSpot }) => {
    const result = observeBossIncident(createBossMemory(), {
      shiftId: NP_DEBUG.persistence.shiftId, incidentId, incidentType, visible: true, safeSpot,
    });
    if (!result.ok) throw new Error(`memory fixture rejected: ${result.reason}`);
    saveExtensions.bossMemory = result.state;
    return JSON.parse(JSON.stringify(result.state));
  }, { incidentId, incidentType, safeSpot });

  try {
    fs.mkdirSync(output, { recursive: true });
    await page.goto(url);
    await page.waitForFunction(() => !!window.NP_DEBUG);

    // A real visible catch records one nearby navigable point, without persisting a path.
    await reset(2201);
    const caught = await page.evaluate(() => {
      NP_DEBUG.setBoss(470, 230, 'look', 0);
      NP_DEBUG.teleport(520, 230);
      NP_DEBUG.setAction('smoke', 20);
      NP_DEBUG.setSuspicion(100);
      NP_DEBUG.skip(0.05);
      return { state: NP_DEBUG.state, memory: JSON.parse(JSON.stringify(saveExtensions.bossMemory)) };
    });
    assert.equal(caught.state.stats.catches, 1, 'видимый catch произошёл');
    assert.equal(caught.memory.recordedCount, 1);
    assert.equal(caught.memory.observations[0].incidentType, 'caught');
    assert.ok(Math.hypot(caught.memory.observations[0].x - 520, caught.memory.observations[0].y - 230) <= 80);
    assert.ok(caught.memory.observations[0].remainingSeconds > 59.9);
    assert.deepEqual(Object.keys(caught.memory.observations[0]).sort(), ['consumed', 'id', 'incidentId', 'incidentType', 'remainingSeconds', 'x', 'y'].sort());

    // Hidden player and active, still-undiscovered cursor do not create observations.
    await reset(2202);
    const hidden = await page.evaluate(() => {
      NP_DEBUG.setBoss(470, 230, 'look', 0);
      NP_DEBUG.teleport(520, 230);
      NP_DEBUG.setAction('plant_hide', 20);
      NP_DEBUG.setSuspicion(100);
      NP_DEBUG.skip(0.05);
      return JSON.parse(JSON.stringify(saveExtensions.bossMemory));
    });
    assert.equal(hidden.recordedCount, 0, 'скрытый игрок не запомнен');

    await reset(2203);
    const invisibleCursor = await page.evaluate(() => {
      let state = createEquipmentState({ ownedEquipment: ['autoclicker'], loadout: ['autoclicker', null], activeLoadout: ['autoclicker'] });
      state = activateAutoclicker(state, { atDesk: true, paused: false, shiftEnded: false }).state;
      state = tickEquipment(state, { dt: 2, paused: false, shiftEnded: false }).state;
      saveExtensions.equipment = state;
      NP_DEBUG.skip(0.1);
      return { phase: saveExtensions.equipment.autoclicker.phase, memory: JSON.parse(JSON.stringify(saveExtensions.bossMemory)) };
    });
    assert.equal(invisibleCursor.phase, 'active');
    assert.equal(invisibleCursor.memory.recordedCount, 0, 'одного активного курсора без раскрытия недостаточно');

    // A visible autoclicker reveal may be the second observation and the third incident is capped.
    await reset(2204);
    await page.evaluate(() => {
      NP_DEBUG.setBoss(470, 230, 'look', 0);
      NP_DEBUG.teleport(520, 230);
      NP_DEBUG.setAction('smoke', 20);
      NP_DEBUG.setSuspicion(100);
      NP_DEBUG.skip(0.05);
    });
    const afterCatch = await page.evaluate(() => JSON.parse(JSON.stringify(saveExtensions.bossMemory)));
    assert.equal(afterCatch.recordedCount, 1);
    const reveal = await page.evaluate(() => {
      let equipment = createEquipmentState({ ownedEquipment: ['autoclicker'], loadout: ['autoclicker', null], activeLoadout: ['autoclicker'] });
      equipment = activateAutoclicker(equipment, { atDesk: true, paused: false, shiftEnded: false }).state;
      equipment = tickEquipment(equipment, { dt: 2, paused: false, shiftEnded: false }).state;
      saveExtensions.equipment = equipment;
      NP_DEBUG.setBoss(DESK_FRONT.x, DESK_FRONT.y, 'look', -Math.PI / 2);
      NP_DEBUG.teleport(42, 190);
      NP_DEBUG.setAction('none', 0);
      NP_DEBUG.deskCheck();
      NP_DEBUG.skip(2.05);
      return {
        state: NP_DEBUG.state,
        memory: JSON.parse(JSON.stringify(saveExtensions.bossMemory)),
        clicker: JSON.parse(JSON.stringify(saveExtensions.equipment.autoclicker)),
      };
    });
    assert.equal(reveal.clicker.phase, 'revealed');
    assert.equal(reveal.state.boss.state, 'waitDesk', 'обычный таймер ожидания стола остаётся активен');
    assert.equal(reveal.memory.recordedCount, 2);
    assert.equal(reveal.memory.observations[1].incidentType, 'autoclicker_exposed');
    assert.ok(reveal.memory.observations[1].remainingSeconds > 59.9);
    const thirdCatch = await page.evaluate(() => {
      NP_DEBUG.setBoss(470, 230, 'look', 0);
      NP_DEBUG.teleport(520, 230);
      NP_DEBUG.setAction('smoke', 20);
      boss.catchCooldown = 0;
      NP_DEBUG.setSuspicion(100);
      NP_DEBUG.skip(0.05);
      return JSON.parse(JSON.stringify(saveExtensions.bossMemory));
    });
    assert.equal(thirdCatch.recordedCount, 2, 'лимит два события за смену');

    // The next ordinary stroll can route to a remembered node and applies the D4 message effect.
    await reset(2205);
    await addMemoryPoint('route-fixture');
    const routed = await page.evaluate(() => {
      NP_DEBUG.setBoss(470, 230, 'look', 0);
      rngSeed = 1; // первый sample rand() = 0.251..., ниже 0.35
      startStroll();
      return {
        boss: { state: boss.state, x: boss.x, y: boss.y, path: boss.path.map(point => ({ ...point })), desc: boss.spotDesc },
        memory: JSON.parse(JSON.stringify(saveExtensions.bossMemory)),
        line: bubbles.some(bubble => bubble.owner === 'boss' && bubble.text === LINES.bossMemory.rememberedSpot),
      };
    });
    assert.equal(routed.boss.state, 'patrol');
    assert.equal(routed.boss.desc, 'к месту, где уже видел отдых');
    assert.equal(routed.boss.path.at(-1).x, 468);
    assert.equal(routed.boss.path.at(-1).y, 230);
    assert.equal(routed.memory.observations[0].consumed, true);
    assert.equal(routed.line, true, 'показана реплика D4');
    await page.waitForTimeout(100);
    await page.screenshot({ path: path.join(output, '22-boss-memory-route-960x540.png') });

    await reset(2210);
    await addMemoryPoint('chance-fixture');
    const notSelected = await page.evaluate(() => {
      NP_DEBUG.setBoss(470, 230, 'look', 0);
      rngSeed = 30; // первый sample rand() = 0.407..., выше 0.35
      startStroll();
      return { desc: boss.spotDesc, consumed: saveExtensions.bossMemory.observations[0].consumed };
    });
    assert.notEqual(notSelected.desc, 'к месту, где уже видел отдых');
    assert.equal(notSelected.consumed, false, 'обычный маршрут сохраняется, когда rand() выше 0.35');

    // An unrouteable stored coordinate is omitted from availablePointIds; an ordinary patrol still starts.
    await reset(2206);
    const blockedFixture = await page.evaluate(() => {
      const collider = WD.colliders[0];
      const safeSpot = { x: collider.x + collider.w / 2, y: collider.y + collider.h / 2 };
      const result = observeBossIncident(createBossMemory(), {
        shiftId: NP_DEBUG.persistence.shiftId, incidentId: 'blocked-fixture', incidentType: 'caught', visible: true, safeSpot,
      });
      saveExtensions.bossMemory = result.state;
      return { safeSpot, blocked: blocked(safeSpot.x, safeSpot.y, 6) };
    });
    assert.equal(blockedFixture.blocked, true);
    const fallback = await page.evaluate(() => {
      NP_DEBUG.setBoss(470, 230, 'look', 0);
      rngSeed = 1;
      startStroll();
      return { desc: boss.spotDesc, state: boss.state, memory: JSON.parse(JSON.stringify(saveExtensions.bossMemory)) };
    });
    assert.equal(fallback.state, 'patrol');
    assert.notEqual(fallback.desc, 'к месту, где уже видел отдых');
    assert.equal(fallback.memory.observations[0].consumed, false);

    // Ordinary desk checks keep their existing route and do not consume memory.
    await reset(2207);
    await addMemoryPoint('inspection-fixture');
    const inspection = await page.evaluate(() => {
      NP_DEBUG.startInspection(true);
      return { state: NP_DEBUG.state.boss.state, consumed: saveExtensions.bossMemory.observations[0].consumed };
    });
    assert.equal(inspection.state, 'inspect');
    assert.equal(inspection.consumed, false);

    // Истёкшая запись очищается, когда Д.Н. уже уехал и новый маршрут выбрать невозможно.
    await reset(2211);
    await addMemoryPoint('decay-fixture');
    const expired = await page.evaluate(() => {
      NP_DEBUG.setBoss(-100, 300, 'gone');
      updateBoss(61);
      return JSON.parse(JSON.stringify(saveExtensions.bossMemory));
    });
    assert.equal(expired.recordedCount, 1, 'история события смены сохраняет дневной лимит');
    assert.equal(expired.observations.length, 0, 'точка удалена через 60 игровых секунд');

    await reset(2212);
    await addMemoryPoint('end-fixture');
    const ended = await page.evaluate(() => {
      const before = saveExtensions.bossMemory.observations[0].remainingSeconds;
      NP_DEBUG.finish('win');
      NP_DEBUG.skip(5);
      return { mode, before, after: saveExtensions.bossMemory.observations[0].remainingSeconds, route: boss.spotDesc };
    });
    assert.equal(ended.mode, 'ended');
    assert.equal(ended.after, ended.before, 'после завершения смены память не тикает и маршрут не запускается');

    // Pause freezes decay; reload restores the remaining seconds, then a new shift starts empty.
    await reset(2208);
    await addMemoryPoint('reload-fixture');
    const saveResult = await page.evaluate(() => {
      const current = saveExtensions.bossMemory;
      const before = current.observations[0].remainingSeconds;
      const ticked = tickBossMemory(current, 18, { paused: false });
      saveExtensions.bossMemory = ticked.state;
      const saved = NP_DEBUG.saveProgress();
      pauseGame();
      NP_DEBUG.skip(5);
      return { saved: saved.ok, tickOk: ticked.ok, tickReason: ticked.reason, before, expected: before - 18, remaining: saveExtensions.bossMemory.observations[0].remainingSeconds, mode };
    });
    assert.equal(saveResult.saved, true);
    assert.equal(saveResult.mode, 'paused');
    assert.ok(Math.abs(saveResult.remaining - saveResult.expected) < 0.001, JSON.stringify(saveResult));
    await page.reload();
    await page.waitForFunction(() => !!window.NP_DEBUG && NP_DEBUG.loadResult.status === 'resumed');
    const resumed = await page.evaluate(() => JSON.parse(JSON.stringify(saveExtensions.bossMemory)));
    assert.equal(resumed.recordedCount, 1);
    assert.ok(resumed.observations[0].remainingSeconds <= 42 && resumed.observations[0].remainingSeconds > 41.5);
    const newShift = await page.evaluate(() => {
      NP_DEBUG.setDay(4);
      NP_DEBUG.restart(2209);
      NP_DEBUG.setDay(4);
      NP_DEBUG.skip(0.05);
      return JSON.parse(JSON.stringify(saveExtensions.bossMemory));
    });
    assert.equal(newShift.recordedCount, 0);
    assert.equal(newShift.observations.length, 0);

    assert.deepEqual(errors, []);
    console.log('qa-plan-22: visible memory, route safety, ordinary inspections, pause/save/reload and shift reset — OK');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

'use strict';
// Адресные сценарии длительной потребности и последствий на 100%.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { loadPlaywright } = require('./pw');

(async () => {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  const output = path.join(__dirname, '..', '.qa');
  const criticalText = 'Очень надо! Кайф уходит, шаг короче — в кабинку!';
  const url = `${pathToFileURL(path.join(__dirname, '..', 'index.html')).href}#play`;
  page.on('pageerror', error => errors.push(error.message));

  const reset = async (seed, day = 0) => page.evaluate(({ value, dayIndex }) => {
    NP_DEBUG.setDay(dayIndex);
    localStorage.setItem('nepalsya.day', String(dayIndex));
    localStorage.setItem('nepalsya.weekDone', 'false');
    NP_DEBUG.clearSavedProgress();
    NP_DEBUG.restart(value);
    NP_DEBUG.clearEvents();
    NP_DEBUG.hideBanner();
    NP_DEBUG.setBoss(706, 446, 'gone');
    NP_DEBUG.setClock(10 * 60);
  }, { value: seed, dayIndex: day });

  const measureWalk = async (seed, critical) => {
    await reset(seed);
    await page.evaluate(isCritical => {
      NP_DEBUG.teleport(500, 450);
      if (isCritical) { NP_DEBUG.set({ fun: 0 }); NP_DEBUG.forcePee(100); }
    }, critical);
    await page.keyboard.down('d');
    const distance = await page.evaluate(() => {
      const start = NP_DEBUG.state.player.x;
      NP_DEBUG.skip(0.4);
      return NP_DEBUG.state.player.x - start;
    });
    await page.keyboard.up('d');
    return distance;
  };

  const measureQueueStep = async (critical) => {
    await reset(408);
    return page.evaluate(isCritical => {
      NP_DEBUG.teleport(267, 518);
      if (isCritical) NP_DEBUG.forcePee(100);
      NP_DEBUG.interact();
      const before = NP_DEBUG.state.player.x;
      NP_DEBUG.skip(0.1);
      return NP_DEBUG.state.player.x - before;
    }, critical);
  };

  const measureCoffeeHungerWalk = async (critical) => {
    await reset(409);
    const context = await page.evaluate(isCritical => {
      NP_DEBUG.teleport(125, 165);
      NP_DEBUG.interact();
      NP_DEBUG.skip(3);
      NP_DEBUG.setClock(14 * 60 + 1);
      NP_DEBUG.skip(0.1);
      const result = { hungry: NP_DEBUG.flags.hungry, boost: NP_DEBUG.state.player.coffeeBoost };
      NP_DEBUG.teleport(500, 450);
      if (isCritical) NP_DEBUG.forcePee(100);
      return result;
    }, critical);
    await page.keyboard.down('d');
    const distance = await page.evaluate(() => {
      const start = NP_DEBUG.state.player.x;
      NP_DEBUG.skip(0.4);
      return NP_DEBUG.state.player.x - start;
    });
    await page.keyboard.up('d');
    return { ...context, distance };
  };

  try {
    await page.goto(url);
    await page.waitForFunction(() => !!window.NP_DEBUG);
    fs.mkdirSync(output, { recursive: true });

    await reset(401);
    const firstCriticalToast = await page.evaluate(() => {
      NP_DEBUG.set({ fun: 50 });
      NP_DEBUG.forcePee(100);
      const toast = document.getElementById('toast');
      NP_DEBUG.skip(0.05);
      return { text: toast.textContent, shown: toast.classList.contains('show') };
    });
    await page.screenshot({ path: path.join(output, '04-pee-critical.png') });
    const critical = await page.evaluate(() => {
      NP_DEBUG.skip(19.95);
      return { active: NP_DEBUG.pee.active, pee: NP_DEBUG.pee.pee, fun: NP_DEBUG.state.fun, told: NP_DEBUG.flags.peeCriticalTold };
    });
    assert.strictEqual(critical.active, true, '100% остаётся активным');
    assert.strictEqual(critical.pee, 100, '100% удерживается 20 секунд');
    assert.ok(Math.abs(critical.fun - 38) < 0.3, `20 с критического drain дают −12, fun=${critical.fun}`);
    assert.strictEqual(critical.told, true);
    assert.strictEqual(firstCriticalToast.text, criticalText, 'показывается одна заданная реплика');
    assert.strictEqual(firstCriticalToast.shown, true);

    await reset(415, 2); // Среда: кайф ×1.25 не должен смягчать отрицательный drain.
    const tenSecondDrain = await page.evaluate(() => {
      NP_DEBUG.set({ fun: 50 });
      NP_DEBUG.forcePee(100);
      NP_DEBUG.skip(10);
      return NP_DEBUG.state.fun;
    });
    assert.ok(Math.abs(tenSecondDrain - 44) < 0.01, `10 с критического drain дают −6 без других эффектов, fun=${tenSecondDrain}`);

    await reset(402);
    const queue = await page.evaluate(() => {
      NP_DEBUG.set({ fun: 50 });
      NP_DEBUG.forcePee(100);
      NP_DEBUG.teleport(267, 518);
      NP_DEBUG.interact();
      NP_DEBUG.setAction('queue', 30);
      NP_DEBUG.skip(10);
      return { action: NP_DEBUG.state.player.action, active: NP_DEBUG.pee.active, pee: NP_DEBUG.pee.pee, fun: NP_DEBUG.state.fun };
    });
    assert.strictEqual(queue.action, 'queue');
    assert.strictEqual(queue.active, true);
    assert.strictEqual(queue.pee, 100);
    assert.ok(Math.abs(queue.fun - 48) < 0.01, `10 с очереди дают −2, fun=${queue.fun}`);

    for (const action of ['lunch', 'evac']) {
      await reset(403 + action.length);
      const away = await page.evaluate(value => {
        NP_DEBUG.set({ fun: 50 });
        NP_DEBUG.forcePee(100);
        NP_DEBUG.setAction(value, 30);
        NP_DEBUG.skip(5);
        return { action: NP_DEBUG.state.player.action, active: NP_DEBUG.pee.active, pee: NP_DEBUG.pee.pee, fun: NP_DEBUG.state.fun };
      }, action);
      assert.strictEqual(away.action, action);
      assert.strictEqual(away.active, true, `${action}: потребность не лечится`);
      assert.strictEqual(away.pee, 100, `${action}: шкала заморожена`);
      assert.strictEqual(away.fun, 50, `${action}: кайф не уходит`);
    }

    await reset(405);
    await page.evaluate(() => { NP_DEBUG.set({ fun: 50 }); NP_DEBUG.forcePee(100); });
    await page.keyboard.press('p');
    const pausedBefore = await page.evaluate(() => ({ mode: NP_DEBUG.state.mode, pee: NP_DEBUG.pee.pee, fun: NP_DEBUG.state.fun }));
    await page.waitForTimeout(180);
    const paused = await page.evaluate(() => ({ mode: NP_DEBUG.state.mode, pee: NP_DEBUG.pee.pee, fun: NP_DEBUG.state.fun }));
    assert.strictEqual(paused.mode, 'paused');
    assert.strictEqual(paused.pee, 100);
    assert.strictEqual(paused.fun, pausedBefore.fun, 'пауза не уменьшает кайф');
    await page.keyboard.press('p');

    const normalSpeed = await measureWalk(406, false);
    const criticalSpeed = await measureWalk(406, true);
    const funAtZero = await page.evaluate(() => NP_DEBUG.state.fun);
    await page.evaluate(() => {
      NP_DEBUG.setAction('toilet', 6);
      NP_DEBUG.skip(6.1);
      NP_DEBUG.teleport(500, 450);
    });
    await page.keyboard.down('d');
    const recovered = await page.evaluate(() => {
      const start = NP_DEBUG.state.player.x;
      NP_DEBUG.skip(0.4);
      return {
        distance: NP_DEBUG.state.player.x - start,
        speed: NP_DEBUG.state.player.speed,
        hungry: NP_DEBUG.flags.hungry,
        coffee: NP_DEBUG.state.player.coffeeBoost,
      };
    });
    await page.keyboard.up('d');
    assert.ok(normalSpeed > 0, `без критического состояния движение работает: ${normalSpeed}`);
    assert.ok(Math.abs(criticalSpeed / normalSpeed - 0.85) < 0.015, `критическая скорость 85%: ${criticalSpeed}/${normalSpeed}`);
    assert.strictEqual(funAtZero, 0, 'критическое состояние не блокирует движение при нуле кайфа');
    assert.ok(Math.abs(recovered.distance - normalSpeed) < 0.02, `после туалета скорость восстановилась: ${JSON.stringify({ normalSpeed, criticalSpeed, recovered })}`);

    const queueBase = await measureQueueStep(false);
    const queueCritical = await measureQueueStep(true);
    assert.ok(Math.abs(queueCritical / queueBase - 0.85) < 0.015, `очередь тоже замедляется: ${queueCritical}/${queueBase}`);

    const coffeeNormal = await measureCoffeeHungerWalk(false);
    const coffeeCritical = await measureCoffeeHungerWalk(true);
    assert.strictEqual(coffeeCritical.hungry, true, 'пропуск обеда включает голод');
    assert.ok(coffeeCritical.boost > 0, 'кофе ещё действует');
    assert.ok(Math.abs(coffeeCritical.distance / coffeeNormal.distance - 0.85) < 0.015, `кофе и голод сочетаются с 85%: ${coffeeCritical.distance}/${coffeeNormal.distance}`);

    await reset(410, 3);
    const guitarDrain = await page.evaluate(() => {
      NP_DEBUG.setUpgrades({ guitar: true });
      NP_DEBUG.set({ fun: 50 });
      NP_DEBUG.forcePee(100);
      NP_DEBUG.setAction('work', 30);
      NP_DEBUG.skip(10);
      return NP_DEBUG.state.fun;
    });
    assert.ok(Math.abs(guitarDrain - 39) < 0.01, `гитара смягчает только Excel, а не критический drain: fun=${guitarDrain}`);

    await reset(411);
    const canceled = await page.evaluate(() => {
      NP_DEBUG.set({ fun: 50 });
      NP_DEBUG.forcePee(100);
      NP_DEBUG.teleport(267, 518);
      NP_DEBUG.setAction('toilet', 6);
      return NP_DEBUG.state.player.x;
    });
    await page.keyboard.down('d');
    await page.evaluate(() => NP_DEBUG.skip(0.1));
    await page.keyboard.up('d');
    const canceledState = await page.evaluate(() => ({
      action: NP_DEBUG.state.player.action,
      active: NP_DEBUG.pee.active,
      pee: NP_DEBUG.pee.pee,
      fun: NP_DEBUG.state.fun,
      toilet: NP_DEBUG.state.stats.toilet,
      cooldown: NP_DEBUG.flags.toiletCd,
      startX: 267,
      afterX: NP_DEBUG.state.player.x,
    }));
    assert.ok(canceled > 0);
    assert.strictEqual(canceledState.action, 'none');
    assert.strictEqual(canceledState.active, true, 'отмена сохраняет эпизод');
    assert.strictEqual(canceledState.pee, 100);
    assert.ok(canceledState.fun < 50 && canceledState.fun > 48, `отмена не выдаёт +4: fun=${canceledState.fun}`);
    assert.strictEqual(canceledState.toilet, 0, 'отмена не считается визитом');
    assert.strictEqual(canceledState.cooldown, 0, 'отмена не ставит cooldown');
    assert.ok(canceledState.afterX > canceledState.startX, 'движение прерывает кабинку');

    await reset(412);
    const completed = await page.evaluate(() => {
      NP_DEBUG.set({ fun: 10 });
      NP_DEBUG.forcePee(100);
      NP_DEBUG.setAction('toilet', 6);
      NP_DEBUG.skip(6.1);
      return {
        fun: NP_DEBUG.state.fun,
        active: NP_DEBUG.pee.active,
        pee: NP_DEBUG.pee.pee,
        told: NP_DEBUG.flags.peeCriticalTold,
        toilet: NP_DEBUG.state.stats.toilet,
        cooldown: NP_DEBUG.flags.toiletCd,
      };
    });
    assert.strictEqual(completed.active, false);
    assert.strictEqual(completed.pee, 0);
    assert.strictEqual(completed.told, false);
    assert.strictEqual(completed.toilet, 1, 'завершённый визит учитывается один раз');
    assert.ok(completed.cooldown > 44);
    await reset(412);
    const ordinaryToiletFun = await page.evaluate(() => {
      NP_DEBUG.set({ fun: 10 });
      NP_DEBUG.setAction('toilet', 6);
      NP_DEBUG.skip(6.1);
      return NP_DEBUG.state.fun;
    });
    assert.ok(Math.abs(completed.fun - ordinaryToiletFun - 4) < 0.02, `полный визит с активной потребностью даёт +4 один раз: ${completed.fun}/${ordinaryToiletFun}`);

    await reset(413);
    await page.evaluate(() => {
      NP_DEBUG.set({ fun: 50 });
      NP_DEBUG.forcePee(100);
      NP_DEBUG.skip(0.05);
      NP_DEBUG.saveProgress();
    });
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!window.NP_DEBUG);
    const resumed = await page.evaluate(() => ({
      status: NP_DEBUG.loadResult.status,
      active: NP_DEBUG.pee.active,
      pee: NP_DEBUG.pee.pee,
      told: NP_DEBUG.flags.peeCriticalTold,
      fun: NP_DEBUG.state.fun,
    }));
    assert.strictEqual(resumed.status, 'resumed');
    assert.strictEqual(resumed.active, true);
    assert.strictEqual(resumed.pee, 100);
    assert.strictEqual(resumed.told, true, 'флаг одного тоста сохраняется');
    const resumedToast = await page.evaluate(() => {
      NP_DEBUG.skip(0.05);
      const toast = document.getElementById('toast');
      return { fun: NP_DEBUG.state.fun, text: toast.textContent, shown: toast.classList.contains('show') };
    });
    assert.ok(resumedToast.fun < resumed.fun, 'критический drain продолжается после reload');
    assert.ok(!(resumedToast.shown && resumedToast.text === criticalText), 'reload не показывает повторный критический toast');

    await reset(414);
    const freshShift = await page.evaluate(() => {
      NP_DEBUG.clearSavedProgress();
      NP_DEBUG.forcePee(100);
      NP_DEBUG.restart(414);
      return { mode: NP_DEBUG.state.mode, active: NP_DEBUG.pee.active, pee: NP_DEBUG.pee.pee };
    });
    assert.strictEqual(freshShift.mode, 'playing');
    assert.strictEqual(freshShift.active, false, 'новая смена очищает старый эпизод');
    assert.strictEqual(freshShift.pee, 0);

    await reset(416);
    const endOfShift = await page.evaluate(() => {
      NP_DEBUG.forcePee(100);
      NP_DEBUG.setClock(19 * 60 + 29.99);
      NP_DEBUG.skip(0.05);
      return { mode: NP_DEBUG.state.mode, active: NP_DEBUG.pee.active, pee: NP_DEBUG.pee.pee };
    });
    assert.strictEqual(endOfShift.mode, 'ended', 'критическое состояние не мешает завершить смену');
    assert.strictEqual(endOfShift.active, true, 'эпизод не завершается фиктивно до нового запуска');
    assert.strictEqual(endOfShift.pee, 100);

    await reset(417);
    const autoGoal = await page.evaluate(() => {
      NP_DEBUG.startAutopilot(417);
      NP_DEBUG.setBoss(706, 446, 'gone');
      NP_DEBUG.forcePee(100);
      NP_DEBUG.skip(0.05);
      const kind = NP_DEBUG.auto.goal;
      NP_DEBUG.stopAutopilot();
      return kind;
    });
    assert.strictEqual(autoGoal, 'toilet', 'автопилот ставит туалет выше необязательных целей');

    assert.deepStrictEqual(errors, [], `ошибки страницы: ${errors.join('; ')}`);
    process.stdout.write('qa-plan-04: все проверки пройдены\n');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

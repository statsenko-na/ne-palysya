'use strict';
// Адресные сценарии общего короткого выбора: состояние, ввод, сохранение и компоновка.
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

  const reset = async (seed) => page.evaluate(value => {
    NP_DEBUG.closeActionChoice('qa_reset');
    NP_DEBUG.setDay(0);
    localStorage.setItem('nepalsya.day', '0');
    localStorage.setItem('nepalsya.weekDone', 'false');
    NP_DEBUG.clearSavedProgress();
    NP_DEBUG.restart(value);
    NP_DEBUG.clearEvents();
    NP_DEBUG.hideBanner();
    NP_DEBUG.setBoss(706, 446, 'office');
    NP_DEBUG.setClock(10 * 60);
    NP_DEBUG.setAction('none', 0);
  }, seed);

  const openDebug = async (expiresIn = 20) => {
    const opened = await page.evaluate(duration => NP_DEBUG.openDebugActionChoice('boss', duration), expiresIn);
    assert.strictEqual(opened, true, 'отладочный пример выбора открылся');
    await page.waitForTimeout(60);
  };

  const hitPoint = async index => page.evaluate(optionIndex => {
    const hitbox = NP_DEBUG.actionChoiceHitboxes.boxes[optionIndex];
    const box = canvasBox();
    return {
      x: box.left + (hitbox.x + hitbox.w / 2) * NP_DEBUG.actionChoiceHitboxes.scale / W * box.width,
      y: box.top + (hitbox.y + hitbox.h / 2) * NP_DEBUG.actionChoiceHitboxes.scale / H * box.height,
    };
  }, index);

  try {
    await page.goto(url);
    await page.waitForFunction(() => !!window.NP_DEBUG);
    fs.mkdirSync(output, { recursive: true });

    await reset(901);
    await openDebug();
    const view = await page.evaluate(() => ({
      state: NP_DEBUG.actionChoice,
      view: NP_DEBUG.actionChoiceView,
      hitboxes: NP_DEBUG.actionChoiceHitboxes,
      mode: NP_DEBUG.state.mode,
    }));
    assert.strictEqual(view.mode, 'playing');
    assert.deepStrictEqual(Object.keys(view.state).sort(), ['id', 'options', 'owner', 'remaining']);
    assert.deepStrictEqual(view.state.options, ['debug-one', 'debug-two', 'debug-disabled']);
    assert.strictEqual(view.view.options.length, 3);
    assert.match(view.view.options[0].detail, /Цена/);
    assert.match(view.view.options[2].disabledReason, /Только отладочный пример/);
    assert.strictEqual(view.hitboxes.boxes.length, 3);
    assert.ok(view.hitboxes.boxes.every(box => box.w > 0 && box.h > 0));
    await page.screenshot({ path: path.join(output, '09-choice-960x540.png') });

    await reset(902);
    await openDebug();
    await page.keyboard.down('1');
    await page.waitForTimeout(550);
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', code: 'Digit1', repeat: true, bubbles: true })));
    await page.keyboard.up('1');
    let selected = await page.evaluate(() => ({ result: NP_DEBUG.actionChoiceResult, state: NP_DEBUG.actionChoice }));
    assert.strictEqual(selected.result.optionId, 'debug-one');
    assert.strictEqual(selected.result.calls, 1, 'удержание клавиши применяет обработчик один раз');
    assert.strictEqual(selected.state, null);

    await reset(903);
    await openDebug();
    await page.keyboard.press('Numpad2');
    selected = await page.evaluate(() => NP_DEBUG.actionChoiceResult);
    assert.strictEqual(selected.optionId, 'debug-two', 'Numpad выбирает тот же вариант, что Digit');
    assert.strictEqual(selected.calls, 1);

    await reset(904);
    await openDebug();
    await page.keyboard.press('3');
    const disabled = await page.evaluate(() => ({ state: NP_DEBUG.actionChoice, view: NP_DEBUG.actionChoiceView, result: NP_DEBUG.actionChoiceResult }));
    assert.ok(disabled.state, 'отключённый вариант оставляет выбор открытым');
    assert.match(disabled.view.options[2].disabledReason, /Только отладочный пример/);
    assert.strictEqual(disabled.result.calls, 0, 'отключённый вариант не запускает handler');
    await page.keyboard.press('2');
    assert.strictEqual((await page.evaluate(() => NP_DEBUG.actionChoiceResult)).optionId, 'debug-two');

    await reset(920);
    await openDebug();
    const wasEnabled = await page.evaluate(() => NP_DEBUG.actionChoiceView.options[1].disabledReason);
    assert.strictEqual(wasEnabled, '');
    await page.evaluate(() => NP_DEBUG.setActionChoiceDebugBlocked(true));
    await page.keyboard.press('2');
    const newlyBlocked = await page.evaluate(() => ({ state: NP_DEBUG.actionChoice, view: NP_DEBUG.actionChoiceView, result: NP_DEBUG.actionChoiceResult }));
    assert.ok(newlyBlocked.state, 'изменившееся условие не закрывает открытый выбор');
    assert.match(newlyBlocked.view.options[1].disabledReason, /условие изменилось/);
    assert.strictEqual(newlyBlocked.result.calls, 0, 'условие повторно проверяется при выборе');
    await page.evaluate(() => NP_DEBUG.setActionChoiceDebugBlocked(false));
    await page.keyboard.press('2');
    assert.strictEqual((await page.evaluate(() => NP_DEBUG.actionChoiceResult)).optionId, 'debug-two');

    await reset(905);
    await openDebug();
    const point = await hitPoint(0);
    await page.mouse.click(point.x, point.y);
    selected = await page.evaluate(() => NP_DEBUG.actionChoiceResult);
    assert.strictEqual(selected.optionId, 'debug-one', 'клик выбирает тот же вариант через те же hitboxes');
    assert.strictEqual(selected.calls, 1);

    await reset(906);
    await openDebug();
    await page.keyboard.press('Escape');
    const firstEscape = await page.evaluate(() => ({ mode: NP_DEBUG.state.mode, state: NP_DEBUG.actionChoice }));
    assert.strictEqual(firstEscape.mode, 'playing');
    assert.strictEqual(firstEscape.state, null, 'первый Esc закрывает выбор');
    await page.keyboard.press('Escape');
    assert.strictEqual(await page.evaluate(() => NP_DEBUG.state.mode), 'paused', 'второй Esc ставит игру на паузу');

    await reset(907);
    await openDebug();
    await page.keyboard.press('p');
    const beforePause = await page.evaluate(() => NP_DEBUG.actionChoice.remaining);
    await page.waitForTimeout(220);
    const paused = await page.evaluate(() => ({ mode: NP_DEBUG.state.mode, choice: NP_DEBUG.actionChoice }));
    assert.strictEqual(paused.mode, 'paused');
    assert.ok(paused.choice);
    assert.strictEqual(paused.choice.remaining, beforePause, 'пауза замораживает таймер выбора');
    await page.keyboard.press('p');

    await reset(917);
    await openDebug();
    await page.evaluate(() => NP_DEBUG.restart(918));
    assert.strictEqual(await page.evaluate(() => NP_DEBUG.actionChoice), null, 'новая смена очищает активный выбор');

    await reset(919);
    await openDebug();
    await page.evaluate(() => NP_DEBUG.finish('win'));
    const ended = await page.evaluate(() => ({ mode: NP_DEBUG.state.mode, choice: NP_DEBUG.actionChoice, result: NP_DEBUG.actionChoiceResult }));
    assert.strictEqual(ended.mode, 'ended');
    assert.strictEqual(ended.choice, null, 'конец смены очищает активный выбор');
    assert.strictEqual(ended.result.closeReason, 'shift_ended');

    await reset(908);
    await openDebug(0.2);
    await page.evaluate(() => NP_DEBUG.skip(0.25));
    assert.strictEqual(await page.evaluate(() => NP_DEBUG.actionChoice), null, 'таймер истекает по симуляционному dt');
    assert.strictEqual((await page.evaluate(() => NP_DEBUG.actionChoiceResult)).calls, 0);

    await reset(909);
    await page.evaluate(() => NP_DEBUG.teleport(500, 450));
    await openDebug();
    await page.keyboard.down('d');
    const moved = await page.evaluate(() => {
      const startX = NP_DEBUG.state.player.x;
      NP_DEBUG.skip(0.15);
      return { x: NP_DEBUG.state.player.x, startX, choice: NP_DEBUG.actionChoice, result: NP_DEBUG.actionChoiceResult };
    });
    await page.keyboard.up('d');
    assert.strictEqual(moved.choice, null, 'движение закрывает обычный выбор');
    assert.ok(moved.x > moved.startX, 'клавиша движения продолжает работать');
    assert.strictEqual(moved.result.calls, 0, 'движение не запускает действие');

    await reset(910);
    await openDebug();
    await page.evaluate(() => NP_DEBUG.setBoss(706, 446, 'gone'));
    await page.evaluate(() => NP_DEBUG.skip(0.05));
    const missingOwner = await page.evaluate(() => ({ state: NP_DEBUG.actionChoice, result: NP_DEBUG.actionChoiceResult }));
    assert.strictEqual(missingOwner.state, null, 'исчезнувший owner закрывает выбор');
    assert.strictEqual(missingOwner.result.calls, 0, 'закрытие owner не применяет оплату или эффект');
    assert.strictEqual(missingOwner.result.closeReason, 'owner_unavailable');

    await reset(911);
    const unknown = await page.evaluate(() => NP_DEBUG.openActionChoice({ id: 'missing-handler', owner: 'boss', options: ['unknown'], expiresIn: 10 }));
    assert.strictEqual(unknown, false);
    assert.strictEqual(await page.evaluate(() => NP_DEBUG.actionChoice), null, 'неизвестный handler безопасно отклоняется');
    assert.strictEqual((await page.evaluate(() => NP_DEBUG.actionChoiceResult)).closeReason, 'unknown_handler');

    await reset(912);
    const conflict = await page.evaluate(() => {
      NP_DEBUG.setAction('standup', 30);
      NP_DEBUG.setStandupChoice({ t: 4, asked: true, done: false });
      const opened = NP_DEBUG.openDebugActionChoice();
      return { opened, state: NP_DEBUG.actionChoice };
    });
    assert.strictEqual(conflict.opened, false);
    assert.strictEqual(conflict.state, null, 'новый выбор не перекрывает активный вопрос летучки');
    await page.keyboard.press('1');
    assert.strictEqual((await page.evaluate(() => NP_DEBUG.choice)).done, true, 'ответ летучки по-прежнему получает цифру');
    assert.strictEqual((await page.evaluate(() => NP_DEBUG.actionChoiceResult)).calls, 0);

    await reset(913);
    await openDebug();
    const saved = await page.evaluate(() => {
      const result = NP_DEBUG.saveProgress();
      const snapshot = JSON.parse(localStorage.getItem('nepalsya.currentSave'));
      return { ok: result.ok, state: snapshot.actionChoice, rootKeys: Object.keys(snapshot.actionChoice).sort() };
    });
    assert.strictEqual(saved.ok, true);
    assert.deepStrictEqual(saved.rootKeys, ['id', 'options', 'owner', 'remaining']);
    assert.deepStrictEqual(saved.state.options, ['debug-one', 'debug-two', 'debug-disabled']);
    assert.ok(saved.state.options.every(id => typeof id === 'string'));
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!window.NP_DEBUG);
    const restored = await page.evaluate(() => ({ state: NP_DEBUG.actionChoice, view: NP_DEBUG.actionChoiceView, load: NP_DEBUG.loadResult.status }));
    assert.strictEqual(restored.load, 'resumed');
    assert.deepStrictEqual(restored.state.options, saved.state.options);
    assert.strictEqual(restored.view.options[0].label, 'Тестовый вариант 1', 'метаданные UI восстановлены из статического handler');

    await reset(914);
    await page.setViewportSize({ width: 667, height: 375 });
    await openDebug();
    const mobile = await page.evaluate(() => {
      const hitboxes = NP_DEBUG.actionChoiceHitboxes;
      const box = canvasBox();
      const touchButtons = document.querySelector('.touch-btns').getBoundingClientRect();
      const cards = hitboxes.boxes.map(hit => ({
        left: box.left + hit.x * hitboxes.scale / W * box.width,
        top: box.top + hit.y * hitboxes.scale / H * box.height,
        right: box.left + (hit.x + hit.w) * hitboxes.scale / W * box.width,
        bottom: box.top + (hit.y + hit.h) * hitboxes.scale / H * box.height,
      }));
      return {
        boxes: cards,
        touch: { left: touchButtons.left, top: touchButtons.top, right: touchButtons.right, bottom: touchButtons.bottom },
        topBelowHud: hitboxes.boxes[0].y * hitboxes.scale > hudBottom() + 8,
        withinCanvas: hitboxes.boxes.every(hit => hit.x >= 0 && hit.x + hit.w <= W / hitboxes.scale && hit.y >= 0 && hit.y + hit.h <= H / hitboxes.scale),
      };
    });
    assert.ok(mobile.topBelowHud, 'варианты не перекрывают верхний HUD');
    assert.ok(mobile.withinCanvas, 'варианты остаются внутри Canvas');
    assert.ok(mobile.boxes.every(card => card.right <= mobile.touch.left || card.left >= mobile.touch.right || card.bottom <= mobile.touch.top || card.top >= mobile.touch.bottom), `варианты не перекрывают сенсорные кнопки: ${JSON.stringify(mobile)}`);
    await page.screenshot({ path: path.join(output, '09-choice-mobile-landscape.png') });

    const touchContext = await browser.newContext({ viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true });
    const touchPage = await touchContext.newPage();
    touchPage.on('pageerror', error => errors.push(error.message));
    await touchPage.goto(url);
    await touchPage.waitForFunction(() => !!window.NP_DEBUG);
    await touchPage.evaluate(() => {
      NP_DEBUG.setDay(0); localStorage.setItem('nepalsya.day', '0');
      localStorage.setItem('nepalsya.weekDone', 'false');
      NP_DEBUG.clearSavedProgress(); NP_DEBUG.restart(916); NP_DEBUG.clearEvents();
      NP_DEBUG.hideBanner(); NP_DEBUG.setBoss(706, 446, 'office'); NP_DEBUG.setClock(10 * 60);
      NP_DEBUG.openDebugActionChoice('boss', 20);
    });
    await touchPage.waitForTimeout(80);
    const touchPoint = await touchPage.evaluate(() => {
      const hitbox = NP_DEBUG.actionChoiceHitboxes.boxes[0];
      const box = canvasBox();
      return {
        x: box.left + (hitbox.x + hitbox.w * 0.25) * NP_DEBUG.actionChoiceHitboxes.scale / W * box.width,
        y: box.top + (hitbox.y + hitbox.h / 2) * NP_DEBUG.actionChoiceHitboxes.scale / H * box.height,
      };
    });
    await touchPage.screenshot({ path: path.join(output, '09-choice-mobile-landscape.png') });
    await touchPage.touchscreen.tap(touchPoint.x, touchPoint.y);
    const touchResult = await touchPage.evaluate(() => NP_DEBUG.actionChoiceResult);
    assert.strictEqual(touchResult.optionId, 'debug-one', 'сенсорный тап использует те же варианты и hitboxes');
    assert.strictEqual(touchResult.calls, 1);
    await touchContext.close();

    await page.setViewportSize({ width: 960, height: 540 });
    await reset(915);
    await openDebug();
    await page.screenshot({ path: path.join(output, '09-choice-960x540.png') });
    assert.deepStrictEqual(errors, [], `ошибки страницы: ${errors.join('; ')}`);
    process.stdout.write('qa-plan-09: все проверки пройдены\n');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

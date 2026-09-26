'use strict';
// Сценарии безопасной панели телефона, прокрутки, закрепления задач и сенсорного ввода.
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

  const reset = async (targetPage, seed) => targetPage.evaluate(value => {
    localStorage.clear();
    localStorage.setItem('nepalsya.weekDone', 'true');
    localStorage.setItem('nepalsya.day', '0');
    localStorage.setItem('nepalsya.onboardingDone', 'true');
    NP_DEBUG.setDay(0);
    NP_DEBUG.restart(value);
    NP_DEBUG.clearEvents();
    NP_DEBUG.hideBanner();
    NP_DEBUG.teleport(520, 260);
    NP_DEBUG.setBoss(706, 446, 'office');
    NP_DEBUG.setAction('none', 0);
    NP_DEBUG.set({ usefulness: 12, phoneSafe: 0, noPee: true });
  }, seed);

  const hitPoint = async (targetPage, type, detail = {}) => targetPage.evaluate(({ kind, extra }) => {
    const panel = NP_DEBUG.phonePanel;
    const hit = panel.hitboxes.find(box => box.type === kind && Object.entries(extra).every(([key, value]) => box[key] === value));
    if (!hit) return null;
    const rect = canvasBox();
    return {
      x: rect.left + (hit.x + hit.w / 2) * panel.scale / W * rect.width,
      y: rect.top + (hit.y + hit.h / 2) * panel.scale / H * rect.height,
    };
  }, { kind: type, extra: detail });

  const clickPanel = async (targetPage, type, detail = {}) => {
    const point = await hitPoint(targetPage, type, detail);
    assert(point, `нет hitbox ${type}: ${JSON.stringify(detail)}`);
    await targetPage.mouse.click(point.x, point.y);
    await targetPage.waitForTimeout(100);
  };

  const touchPanel = async (targetPage, type, detail = {}) => {
    const point = await hitPoint(targetPage, type, detail);
    assert(point, `нет hitbox ${type}: ${JSON.stringify(detail)}`);
    await targetPage.touchscreen.tap(point.x, point.y);
    await targetPage.waitForTimeout(250);
  };

  try {
    fs.mkdirSync(output, { recursive: true });
    await page.goto(url);
    await page.waitForFunction(() => !!window.NP_DEBUG);

    await reset(page, 1001);
    await page.evaluate(() => { NP_DEBUG.setAction('work', 0); NP_DEBUG.startInspection(true); });
    await page.keyboard.press('Tab');
    await page.waitForTimeout(300);
    let state = await page.evaluate(() => ({ game: NP_DEBUG.state, panel: NP_DEBUG.phonePanel }));
    assert.strictEqual(state.panel.open, true, 'Tab открывает панель дел');
    assert.strictEqual(state.panel.page, 'todos');
    assert.strictEqual(state.game.player.action, 'work', 'панель не отменяет Excel');
    assert.strictEqual(state.game.boss.state, 'inspect', 'панель не отменяет угрозу проверки');
    await page.screenshot({ path: path.join(output, '10-phone-tasks-960x540.png') });

    const startX = state.game.player.x;
    await page.keyboard.down('d');
    await page.waitForTimeout(180);
    await page.keyboard.up('d');
    state = await page.evaluate(() => ({ game: NP_DEBUG.state, panel: NP_DEBUG.phonePanel }));
    assert.ok(state.game.player.x > startX, 'движение продолжается при открытой панели');
    assert.strictEqual(state.panel.open, true);
    assert.strictEqual(state.game.mode, 'playing', 'панель не является паузой');

    await page.keyboard.press('Escape');
    state = await page.evaluate(() => ({ mode: NP_DEBUG.state.mode, panel: NP_DEBUG.phonePanel }));
    assert.strictEqual(state.mode, 'playing', 'первый Esc только закрывает панель');
    assert.strictEqual(state.panel.open, false);
    await page.keyboard.press('Escape');
    assert.strictEqual(await page.evaluate(() => NP_DEBUG.state.mode), 'paused', 'следующий Esc ставит игру на паузу');

    await reset(page, 1009);
    await page.evaluate(() => NP_DEBUG.openPhonePanel());
    await page.keyboard.press('p');
    state = await page.evaluate(() => ({ mode: NP_DEBUG.state.mode, panel: NP_DEBUG.phonePanel }));
    assert.strictEqual(state.mode, 'paused', 'P ставит игру на паузу без дополнительного нажатия');
    assert.strictEqual(state.panel.open, false, 'прямая пауза очищает оверлей панели');

    await reset(page, 1002);
    await page.evaluate(() => { NP_DEBUG.setAction('smoke', 12); NP_DEBUG.openPhonePanel(); });
    await page.evaluate(() => NP_DEBUG.selectPhonePage('colleagues'));
    assert.strictEqual(await page.evaluate(() => NP_DEBUG.state.player.action), 'smoke', 'чтение коллег не отменяет другое действие');
    await page.evaluate(() => NP_DEBUG.closePhonePanel());
    await reset(page, 1008);
    await page.keyboard.press('q');
    await page.waitForTimeout(300);
    let relationshipsBefore = await page.evaluate(() => NP_DEBUG.relationshipSnapshots);
    await clickPanel(page, 'page', { page: 'colleagues' });
    let viewed = await page.evaluate(() => ({ panel: NP_DEBUG.phonePanel, state: NP_DEBUG.state, snapshots: NP_DEBUG.relationshipSnapshots }));
    assert.strictEqual(viewed.panel.page, 'colleagues');
    assert.strictEqual(viewed.state.player.action, 'none', 'открытие вкладки коллег не начинает прокрутку');
    assert.deepStrictEqual(viewed.snapshots, relationshipsBefore, 'просмотр не изменяет память отношений');
    await page.screenshot({ path: path.join(output, '10-phone-colleagues-960x540.png') });
    await page.evaluate(() => NP_DEBUG.set({ phoneSafe: 12 }));
    const safeBefore = await page.evaluate(() => NP_DEBUG.state.phoneSafe);
    await clickPanel(page, 'page', { page: 'reels' });
    viewed = await page.evaluate(() => ({ panel: NP_DEBUG.phonePanel, state: NP_DEBUG.state }));
    assert.strictEqual(viewed.panel.page, 'reels');
    assert.strictEqual(viewed.state.player.action, 'phone', 'рилсы запускают существующее действие phone');
    assert.ok(viewed.state.phoneSafe > 0 && viewed.state.phoneSafe <= safeBefore, 'смена страницы не сбрасывает временной эффект phoneSafe');
    const funBefore = viewed.state.fun;
    await page.evaluate(() => NP_DEBUG.skip(2));
    assert.ok((await page.evaluate(() => NP_DEBUG.state.fun)) > funBefore, 'прокрутка сохраняет прирост кайфа');
    await clickPanel(page, 'page', { page: 'todos' });
    viewed = await page.evaluate(() => ({ panel: NP_DEBUG.phonePanel, state: NP_DEBUG.state }));
    assert.strictEqual(viewed.panel.page, 'todos');
    assert.strictEqual(viewed.state.player.action, 'none', 'вкладка дел останавливает прокрутку');
    assert.ok(viewed.state.phoneSafe > 0, 'phoneSafe остаётся активным после смены страницы');

    await reset(page, 1003);
    await page.evaluate(() => { NP_DEBUG.setClock(11 * 60); NP_DEBUG.startEvent('sb'); NP_DEBUG.teleport(470, 260); });
    await page.keyboard.press('q');
    await page.waitForTimeout(300);
    await clickPanel(page, 'page', { page: 'reels' });
    await page.evaluate(() => { for (let i = 0; i < 60 && !NP_DEBUG.state.stats.sbReports; i++) NP_DEBUG.skip(0.25); });
    state = await page.evaluate(() => ({ game: NP_DEBUG.state, panel: NP_DEBUG.phonePanel }));
    assert.strictEqual(state.game.player.action, 'phone');
    assert.ok(state.game.stats.sbReports >= 1 && state.game.reprimands >= 1, 'открытая панель не защищает от камер СБ');
    await page.screenshot({ path: path.join(output, '10-phone-cameras-960x540.png') });

    await reset(page, 1004);
    await page.keyboard.press('q');
    await page.waitForTimeout(300);
    const rows = await page.evaluate(() => NP_DEBUG.phonePanel.hitboxes.filter(box => box.type === 'task').map(box => box.id));
    assert.ok(rows.length >= 2, 'для закрепления видны как минимум две задачи');
    await clickPanel(page, 'task', { id: rows[1] });
    assert.strictEqual((await page.evaluate(() => NP_DEBUG.phonePanel.pinnedTaskId)), rows[1], 'клик закрепляет выбранную задачу');
    await page.evaluate(() => NP_DEBUG.saveProgress());
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!window.NP_DEBUG);
    viewed = await page.evaluate(() => ({ panel: NP_DEBUG.phonePanel, load: NP_DEBUG.loadResult, selected: NP_DEBUG.selectedObjective }));
    assert.strictEqual(viewed.panel.pinnedTaskId, rows[1], 'закрепление переживает перезагрузку');
    assert.strictEqual(viewed.panel.open, false, 'перезагрузка закрывает панель');
    assert.strictEqual(viewed.selected.id, rows[1], 'цель HUD следует за закреплённой задачей');
    await page.evaluate(() => {
      const pinned = NP_DEBUG.state.todo.find(item => item.id === NP_DEBUG.phonePanel.pinnedTaskId);
      pinned.done = true;
      NP_DEBUG.refreshPinnedObjective();
    });
    viewed = await page.evaluate(() => ({ panel: NP_DEBUG.phonePanel, selected: NP_DEBUG.selectedObjective }));
    assert.ok(viewed.panel.pinnedTaskId && viewed.panel.pinnedTaskId !== rows[1], 'выполненная цель переносит закрепление');
    assert.strictEqual(viewed.selected.id, viewed.panel.pinnedTaskId);

    await page.keyboard.press('q');
    await page.waitForTimeout(300);
    await page.evaluate(() => NP_DEBUG.state.todo.forEach(item => { item.done = true; }));
    assert.strictEqual(await page.evaluate(() => NP_DEBUG.selectedObjective), null, 'без задач цель переходит к общему плану');
    await page.screenshot({ path: path.join(output, '10-phone-plan-fallback-960x540.png') });

    await page.evaluate(() => NP_DEBUG.restart(1005));
    assert.strictEqual((await page.evaluate(() => NP_DEBUG.phonePanel)).open, false, 'новая смена закрывает панель');
    await page.evaluate(() => NP_DEBUG.openPhonePanel());
    await page.evaluate(() => NP_DEBUG.finish('win'));
    state = await page.evaluate(() => ({ mode: NP_DEBUG.state.mode, panel: NP_DEBUG.phonePanel }));
    assert.strictEqual(state.mode, 'ended');
    assert.strictEqual(state.panel.open, false, 'конец смены закрывает панель');

    await reset(page, 1006);
    const phoneSafeStart = await page.evaluate(() => { NP_DEBUG.set({ phoneSafe: 20 }); return NP_DEBUG.state.phoneSafe; });
    await page.evaluate(() => NP_DEBUG.autoArrivePhoneForTest());
    state = await page.evaluate(() => ({ game: NP_DEBUG.state, panel: NP_DEBUG.phonePanel }));
    assert.strictEqual(state.game.player.action, 'phone', 'прибытие автопилота начинает прокрутку');
    assert.strictEqual(state.panel.page, 'reels', 'автопилот явно открывает вкладку прокрутки');
    assert.ok(state.game.phoneSafe > phoneSafeStart - 1 && state.game.phoneSafe <= phoneSafeStart, 'автопилот сохраняет остаток phoneSafe, который убывает только от игрового времени');
    await page.evaluate(() => { NP_DEBUG.finishPhoneScrolling(); NP_DEBUG.stopAutopilot(); });

    const touchPage = await browser.newPage({ viewport: { width: 640, height: 390 }, isMobile: true, hasTouch: true });
    touchPage.on('pageerror', error => errors.push(error.message));
    await touchPage.goto(url);
    await touchPage.waitForFunction(() => !!window.NP_DEBUG);
    await reset(touchPage, 1007);
    const phoneButton = await touchPage.locator('.tbtn[data-act="q"]').boundingBox();
    assert(phoneButton, 'сенсорная кнопка телефона видима');
    await touchPage.touchscreen.tap(phoneButton.x + phoneButton.width / 2, phoneButton.y + phoneButton.height / 2);
    await touchPage.waitForTimeout(300);
    assert.strictEqual((await touchPage.evaluate(() => NP_DEBUG.phonePanel)).open, true, 'сенсорная кнопка открывает панель');
    await touchPanel(touchPage, 'page', { page: 'reels' });
    assert.strictEqual(await touchPage.evaluate(() => NP_DEBUG.state.player.action), 'phone', 'тап по вкладке запускает прокрутку');
    await touchPanel(touchPage, 'page', { page: 'todos' });
    viewed = await touchPage.evaluate(() => ({ action: NP_DEBUG.state.player.action, panel: NP_DEBUG.phonePanel }));
    assert.strictEqual(viewed.action, 'none', `сенсорный переход к делам завершает прокрутку: ${JSON.stringify(viewed)}`);
    await touchPage.screenshot({ path: path.join(output, '10-phone-touch-640x390.png') });
    await touchPage.close();

    assert.deepStrictEqual(errors, [], `ошибки страницы: ${errors.join('; ')}`);
    process.stdout.write('qa-plan-10: все проверки пройдены\n');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

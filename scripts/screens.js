// Скриншоты игры на разных экранах: меню, «Как играть», игра, реплики, телефон (dev-инструмент, игре не нужен).
// Запуск: node scripts/screens.js [папка]   (по умолчанию .qa/screens)
// Нужен Playwright, как и для scripts/qa.js.
const path = require('path');
const fs = require('fs');
const { loadPlaywright } = require('./pw');

const VIEWPORTS = [
  ['laptop-1366x768', { width: 1366, height: 657 }, 1, false],
  ['laptop-1280x720', { width: 1280, height: 609 }, 1, false],
  ['fullhd', { width: 1920, height: 969 }, 1, false],
  ['iphone13-land', { width: 844, height: 390 }, 3, true],
  ['android-small-land', { width: 740, height: 360 }, 3, true],
  ['ipad-land', { width: 1024, height: 768 }, 2, true],
];

(async () => {
  const { chromium } = loadPlaywright();
  const out = process.argv[2] || path.join(__dirname, '..', '.qa', 'screens');
  fs.mkdirSync(out, { recursive: true });
  const url = require('url').pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
  const browser = await chromium.launch();
  for (const [name, viewport, dpr, touch] of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: dpr, hasTouch: touch, isMobile: touch });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(url);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(out, `${name}-1menu.png`) });
    await page.keyboard.press('KeyI');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(out, `${name}-2onboarding.png`) });
    await page.keyboard.press('Escape');
    await page.evaluate(() => { NP_DEBUG.restart(); });
    await page.waitForTimeout(2200);
    await page.screenshot({ path: path.join(out, `${name}-3game.png`) });
    await page.evaluate(() => {
      localStorage.setItem('nepalsya.weekDone', 'true');
      localStorage.setItem('nepalsya.tutorialDone', 'true');
      NP_DEBUG.setDay(3); NP_DEBUG.restart(); NP_DEBUG.clearEvents(); NP_DEBUG.hideBanner();
      NP_DEBUG.teleport(430, 250);
      NP_DEBUG.setBoss(560, 300, 'look', Math.PI);
      NP_DEBUG.say('boss', 'Быкентий! Где отчёт по Маджикистану?!', 6);
      NP_DEBUG.say('bleb', 'ROC-AUC 0.51. Почти монетка.', 6);
      NP_DEBUG.say('hlad', '♪ ♫ ♪', 6);
      NP_DEBUG.say('asel', 'Кто опять поставил кондей на 16?!', 6);
    });
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(out, `${name}-4bubbles.png`) });
    await page.evaluate(() => NP_DEBUG.togglePhone());
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(out, `${name}-5phone.png`) });
    const ui = await page.evaluate(() => NP_DEBUG.ui);
    console.log(`${name}: UI ×${ui.UI.toFixed(2)}, ${ui.compact ? 'компактный' : 'широкий'} HUD, основной текст ${(8.5 * ui.UI * ui.unitPx).toFixed(1)} px${errs.length ? `, ОШИБКИ: ${errs.join(' | ')}` : ''}`);
    await ctx.close();
  }
  await browser.close();
  console.log(`Скриншоты: ${out}`);
})();

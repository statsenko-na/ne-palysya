'use strict';

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
  const url = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
  const buttons = page.locator('.reduced-effects-toggle');
  page.on('pageerror', error => errors.push(error.message));

  async function expectReduced(value, message) {
    await page.waitForFunction(expected => {
      const button = document.querySelector('.reduced-effects-toggle');
      return button && button.getAttribute('aria-pressed') === String(expected);
    }, value);
    assert.equal(await buttons.first().getAttribute('aria-pressed'), String(value), message);
    assert.equal(await buttons.last().getAttribute('aria-pressed'), String(value), 'menu and pause toggles stay in sync');
  }

  try {
    fs.mkdirSync(output, { recursive: true });
    await page.goto(url);
    await page.evaluate(() => {
      localStorage.clear();
      store.set('onboardingDone', true);
      store.set('tutorialDone', true);
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await page.waitForFunction(() => !!window.NP_DEBUG && NP_DEBUG.state.mode === 'menu');
    assert.equal(await buttons.count(), 2, 'the setting exists in menu and pause');
    await expectReduced(true, 'system preference initializes the setting');
    assert.equal(await page.evaluate(() => localStorage.getItem('nepalsya.reducedEffects')), null, 'system default is not saved as a user choice');

    await page.evaluate(() => store.set('reducedEffects', false));
    await page.reload();
    await page.waitForFunction(() => !!window.NP_DEBUG && NP_DEBUG.state.mode === 'menu');
    await expectReduced(false, 'saved false overrides system reduce preference');
    assert.equal(await page.evaluate(() => store.get('reducedEffects', null)), false);

    await page.evaluate(() => store.set('reducedEffects', true));
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.reload();
    await page.waitForFunction(() => !!window.NP_DEBUG && NP_DEBUG.state.mode === 'menu');
    await expectReduced(true, 'saved true overrides no-preference and survives reload');

    await page.evaluate(() => localStorage.removeItem('nepalsya.reducedEffects'));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expectReduced(true, 'live system preference change enables reduced effects');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expectReduced(false, 'live system preference change updates an unset choice');
    await page.evaluate(() => store.set('reducedEffects', false));
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expectReduced(false, 'explicit user choice remains stable as system preference changes');

    await buttons.first().click();
    await expectReduced(true, 'menu toggle changes the setting');
    assert.equal(await page.evaluate(() => store.get('reducedEffects', null)), true, 'menu choice persists in the store');
    await page.reload();
    await page.waitForFunction(() => !!window.NP_DEBUG && NP_DEBUG.state.mode === 'menu');
    await expectReduced(true, 'menu choice survives reload');

    await buttons.first().click();
    await expectReduced(false, 'menu can restore normal effects');
    await page.locator('#start-btn').click();
    await page.waitForFunction(() => NP_DEBUG.state.mode === 'playing');
    await page.keyboard.press('p');
    await page.waitForFunction(() => NP_DEBUG.state.mode === 'paused');

    const pausedBefore = await page.evaluate(() => JSON.stringify(NP_DEBUG.state));
    await page.locator('#pause-overlay .reduced-effects-toggle').click();
    const pausedAfter = await page.evaluate(() => JSON.stringify(NP_DEBUG.state));
    assert.equal(pausedAfter, pausedBefore, 'pause toggle changes no gameplay state');
    await expectReduced(true, 'pause toggle changes the same shared setting');

    const presentation = await page.evaluate(() => ({
      normal: getEffectPresentation(false, { shake: 0.5, flash: 0.9, danger: 0.8 }),
      reduced: getEffectPresentation(true, { shake: 0.5, flash: 0.9, danger: 0.8 }),
    }));
    assert.deepEqual(presentation.normal, {
      ok: true, reason: null, shake: 0.5, flash: 0.9,
      dangerLevel: 0.8, dangerAlpha: 0.8 * 0.35, dangerPulse: true, staticWarning: true,
    });
    assert.deepEqual(presentation.reduced, {
      ok: true, reason: null, shake: 0, flash: 0,
      dangerLevel: 0.8, dangerAlpha: 0.8 * 0.35, dangerPulse: false, staticWarning: true,
    });

    await page.locator('#pause-overlay .reduced-effects-toggle').click();
    await expectReduced(false, 'normal comparison state is selectable');
    await page.evaluate(() => {
      NP_DEBUG.setBoss(525, 330, 'inspect', Math.PI);
      NP_DEBUG.setSuspicion(92);
      NP_DEBUG.startEvent('sb');
      officeEvent.watch = 1.2;
      danger = 0.8;
      shake = 0.5;
      flash = 0.9;
      document.getElementById('pause-overlay').classList.add('hidden');
    });
    await page.waitForTimeout(150);
    await page.locator('#game').screenshot({ path: path.join(output, '27-effects-normal.png') });
    await page.evaluate(() => toggleReducedEffects());
    await expectReduced(true, 'reduced state is selectable for the Canvas comparison');
    await page.waitForTimeout(150);
    await page.locator('#game').screenshot({ path: path.join(output, '27-effects-reduced.png') });

    assert.deepEqual(errors, [], `browser errors: ${errors.join('; ')}`);
    console.log('qa-plan-27: reduced-effects preference, persistence, UI, state invariance, and Canvas captures passed');
    console.log('screenshots: .qa/27-effects-normal.png, .qa/27-effects-reduced.png');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

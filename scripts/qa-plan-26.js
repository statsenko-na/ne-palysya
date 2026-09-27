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
  page.on('pageerror', error => errors.push(error.message));

  async function menu() {
    await page.waitForFunction(() => !!window.NP_DEBUG && NP_DEBUG.state.mode === 'menu');
  }
  async function playing() {
    await page.waitForFunction(() => !!window.NP_DEBUG && NP_DEBUG.state.mode === 'playing');
  }
  async function ended() {
    await page.waitForFunction(() => !!window.NP_DEBUG && NP_DEBUG.state.mode === 'ended');
  }
  async function finish(outcome) {
    return page.evaluate(result => {
      NP_DEBUG.set({ usefulness: result === 'win' ? planTarget : 0, fun: 30, reprimands: 0, weekReprimands: 0 });
      NP_DEBUG.finish(result);
      return {
        mode: NP_DEBUG.state.mode,
        records: store.get('localRecords', null),
        identity: store.get('activeRecordIdentity', null),
      };
    }, outcome);
  }

  try {
    fs.mkdirSync(output, { recursive: true });
    await page.goto(url);
    await page.waitForFunction(() => !!window.NP_DEBUG);
    await page.evaluate(() => {
      localStorage.clear();
      store.set('onboardingDone', true);
      store.set('tutorialDone', true);
      store.set('best.0', 77);
      store.set('best.office-stories-v1.0', 1000);
    });
    await page.reload();
    await menu();

    const name = page.locator('#player-name');
    await name.fill('🙂'.repeat(21));
    assert.equal(Array.from(await name.inputValue()).length, 20, 'name limit counts Unicode code points');
    assert.equal(await page.locator('#player-name-count').textContent(), '20 / 20');
    await name.fill('');
    assert.equal(await name.inputValue(), '', 'blank name is allowed');
    assert.equal(await page.locator('#player-name-count').textContent(), '0 / 20');
    const injection = '<img src=x onerror=window.__recordsXss=true>';
    await name.fill(injection);
    assert.equal(await page.locator('#player-name').locator('img').count(), 0, 'the input remains a text field');
    await name.fill('Алия 007');
    await page.locator('[data-diff="hard"]').click();
    await page.evaluate(() => { const overlay = document.getElementById('screen-overlay'); if (overlay) overlay.scrollTop = 0; window.scrollTo(0, 0); });
    await page.screenshot({ path: path.join(output, '26-name-menu-960x540.png') });
    await name.focus();
    const beforeMove = await page.evaluate(() => ({ mode: NP_DEBUG.state.mode, x: NP_DEBUG.state.player.x, y: NP_DEBUG.state.player.y }));
    await page.keyboard.press('w');
    const afterMove = await page.evaluate(() => ({ mode: NP_DEBUG.state.mode, x: NP_DEBUG.state.player.x, y: NP_DEBUG.state.player.y }));
    assert.deepEqual(afterMove, beforeMove, 'WASD in a focused name field neither moves nor starts the game');
    await name.fill('Алия 007');
    await name.press('Enter');
    await playing();

    const firstIdentity = await page.evaluate(() => {
      const saved = store.get('activeRecordIdentity', null);
      NP_DEBUG.saveProgress();
      return { ...saved, runId: NP_DEBUG.persistence.shiftId, dayIndex: NP_DEBUG.state.dayIndex };
    });
    assert.equal(firstIdentity.name, 'Алия 007');
    assert.equal(firstIdentity.difficulty, 'hard');
    assert.equal(firstIdentity.rulesetId, 'office-stories-v1');
    assert.equal(firstIdentity.maxTimeScale, 1);

    // A different last-used name is visible in the menu after reload, but the resumed run keeps its captured identity.
    await page.evaluate(() => store.set('playerName', 'Мария'));
    await page.reload();
    await menu();
    assert.equal(await page.locator('#player-name').inputValue(), 'Мария');
    await page.locator('#player-name').press('Enter');
    await playing();
    const resumed = await page.evaluate(() => ({ ...NP_DEBUG.persistence, load: NP_DEBUG.loadResult, identity: store.get('activeRecordIdentity') }));
    assert.equal(resumed.load.status, 'resumed');
    assert.equal(resumed.shiftId, firstIdentity.runId);
    assert.equal(resumed.identity.name, 'Алия 007');
    assert.equal(resumed.identity.difficulty, 'hard');

    let firstFinish = await finish('win');
    assert.equal(firstFinish.mode, 'ended');
    assert.equal(firstFinish.records.records.length, 1);
    assert.equal(firstFinish.records.records[0].runId, firstIdentity.runId);
    assert.equal(firstFinish.records.records[0].name, 'Алия 007');
    assert.equal(firstFinish.records.records[0].difficulty, 'hard');
    assert.equal(firstFinish.records.records[0].dayIndex, firstIdentity.dayIndex);
    assert.equal(firstFinish.records.records[0].autoUsed, false);
    assert.equal(firstFinish.records.legacyBest[0].score, 77);
    assert.equal(await page.evaluate(() => store.get('best.0')), 77, 'legacy best remains intact');
    assert.equal(await page.evaluate(() => store.get('best.office-stories-v1.0')), 1000, 'the existing ruleset best remains intact');
    await page.evaluate(() => NP_DEBUG.finish('win'));
    assert.equal((await page.evaluate(() => store.get('localRecords'))).records.length, 1, 'a repeated finish cannot duplicate a result');

    // The result screen lets the next player set a different saved name before restarting.
    const nextName = page.locator('#player-name-next');
    await nextName.fill('Боб');
    await nextName.focus();
    await page.keyboard.press('w');
    assert.equal((await page.evaluate(() => NP_DEBUG.state.mode)), 'ended', 'WASD from the result name field does not reach the game');
    await nextName.fill('Боб');
    await nextName.press('Enter');
    await playing();
    await page.evaluate(() => {
      setTimeScale(1.5);
      NP_DEBUG.saveProgress();
    });
    await page.keyboard.press('o');
    assert.equal((await page.evaluate(() => NP_DEBUG.persistence)).autoUsed, true);
    await page.keyboard.press('o');
    const savedAssist = await page.evaluate(() => ({
      auto: NP_DEBUG.auto,
      autoUsed: NP_DEBUG.persistence.autoUsed,
      identity: store.get('activeRecordIdentity'),
      saved: NP_DEBUG.saveProgress(),
    }));
    assert.equal(savedAssist.auto.on, false);
    assert.equal(savedAssist.autoUsed, true, 'turning autopilot off does not clear the sticky assisted flag');
    assert.equal(savedAssist.identity.name, 'Боб');
    assert.equal(savedAssist.identity.maxTimeScale, 1.5);

    await page.reload();
    await menu();
    await page.locator('#player-name').press('Enter');
    await playing();
    const resumedAssist = await page.evaluate(() => ({ load: NP_DEBUG.loadResult, persistence: NP_DEBUG.persistence, identity: store.get('activeRecordIdentity') }));
    assert.equal(resumedAssist.load.status, 'resumed');
    assert.equal(resumedAssist.persistence.autoUsed, true);
    assert.equal(resumedAssist.identity.name, 'Боб');
    assert.equal(resumedAssist.identity.maxTimeScale, 1.5);
    const secondFinish = await finish('fired');
    assert.equal(secondFinish.records.records.length, 2);
    const bob = secondFinish.records.records.find(record => record.name === 'Боб');
    assert.ok(bob);
    assert.equal(bob.autoUsed, true);
    assert.equal(bob.outcome, 'fired');
    assert.ok(bob.score >= 0, 'the B2 record contract accepts a non-negative final score');
    await page.evaluate(() => NP_DEBUG.finish('fired'));
    assert.equal((await page.evaluate(() => store.get('localRecords'))).records.length, 2, 'second run is also written once');

    // The demo does not touch the saved player name, either best key, or the local table.
    const beforeDemo = await page.evaluate(() => ({
      name: store.get('playerName'),
      records: JSON.stringify(store.get('localRecords')),
      legacy: store.get('best.0'),
      current: store.get('best.office-stories-v1.0'),
    }));
    const demo = await page.evaluate(() => {
      NP_DEBUG.startAutopilot(2610);
      const wasDemo = NP_DEBUG.auto.demo;
      NP_DEBUG.finish('win');
      NP_DEBUG.stopAutopilot();
      return {
        wasDemo,
        status: NP_DEBUG.auto,
        name: store.get('playerName'),
        records: JSON.stringify(store.get('localRecords')),
        legacy: store.get('best.0'),
        current: store.get('best.office-stories-v1.0'),
      };
    });
    assert.equal(demo.wasDemo, true, 'the scenario runs through auto.demo');
    assert.equal(demo.status.demo, false, 'the test stops the demo after capturing its result');
    assert.deepEqual({ name: demo.name, records: demo.records, legacy: demo.legacy, current: demo.current }, beforeDemo);
    assert.equal((await page.evaluate(() => store.get('localRecords'))).records.length, 2);

    // Seed enough real-model records to verify top-10 rendering, filters, scrolling, and text-only names.
    await page.evaluate(() => {
      let state = createLocalRecordsState(store.get('localRecords'));
      for (let index = 0; index < 12; index++) {
        const added = addLocalRecord(state, {
          runId: `qa26-fixture-${index}`,
          name: index === 0 ? '<svg onload=1>' : `Сотрудник ${index}`,
          score: 200 - index,
          dayIndex: index % 5,
          difficulty: 'normal',
          rulesetId: 'office-stories-v1',
          autoUsed: false,
          maxTimeScale: 1,
          completedAt: 3000 + index,
          outcome: 'win',
        });
        if (added.ok) state = added.state;
      }
      store.set('localRecords', state);
    });
    await page.reload();
    await menu();
    await page.locator('.records-open').first().click();
    assert.equal(await page.locator('#records-overlay').isVisible(), true);
    assert.match(await page.locator('.records-local-note').textContent(), /Рекорды в этом браузере/);
    assert.equal(await page.locator('#records-rows tr').count(), 10, 'default view is limited to the top 10');
    const escapedName = await page.locator('#records-rows').textContent();
    assert.match(escapedName, /<svg onload=1>/);
    assert.equal(await page.locator('#records-rows svg, #records-rows img').count(), 0, 'record names are inserted as textContent');
    assert.equal(await page.evaluate(() => window.__recordsXss), undefined);
    assert.match(await page.locator('#records-legacy').textContent(), /Старый рекорд, правила 0\.24\.1/);
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'records-close', 'dialog focus wraps backward to the last control');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'records-close-icon', 'dialog focus wraps forward to the first control');
    await page.keyboard.press('w');
    assert.equal(await page.evaluate(() => NP_DEBUG.state.mode), 'menu', 'WASD is ignored while the records dialog is open');
    await page.screenshot({ path: path.join(output, '26-records-desktop-960x540.png') });

    await page.locator('#records-difficulty-filter').selectOption('normal');
    await page.locator('#records-day-filter').selectOption('0');
    await page.locator('#records-assist-filter').selectOption('manual');
    assert.equal(await page.locator('#records-rows tr').count(), 2, 'day, difficulty, and assistance filters combine');
    await page.locator('#records-day-filter').selectOption('all');
    assert.equal(await page.locator('#records-rows tr').count(), 10);
    await page.locator('#records-assist-filter').selectOption('assisted');
    await page.locator('#records-difficulty-filter').selectOption('hard');
    await page.locator('#records-day-filter').selectOption('1');
    assert.equal(await page.locator('#records-rows tr').count(), 1, 'assisted filter finds the resumed second player');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#records-overlay').isHidden(), true);
    assert.equal(await page.evaluate(() => NP_DEBUG.state.mode), 'menu', 'Escape does not start or move the game');

    await page.locator('.records-open').first().click();
    await page.locator('#records-assist-filter').selectOption('manual');
    await page.locator('#records-difficulty-filter').selectOption('normal');
    await page.locator('#records-day-filter').selectOption('all');
    const scroller = page.locator('.records-table-wrap');
    const scrollState = await scroller.evaluate(element => ({ height: element.clientHeight, content: element.scrollHeight }));
    assert.ok(scrollState.content > scrollState.height, 'ten rows fit in a scrollable region');
    await scroller.focus();
    await page.keyboard.press('PageDown');
    assert.ok(await scroller.evaluate(element => element.scrollTop > 0), 'keyboard scroll moves the records list');
    await page.setViewportSize({ width: 844, height: 390 });
    await scroller.evaluate(element => { element.scrollTop = 0; });
    await page.screenshot({ path: path.join(output, '26-records-mobile-landscape.png') });
    assert.equal(await page.locator('#records-rows tr').count(), 10);
    await page.locator('#records-close').click();
    assert.equal(await page.locator('#records-overlay').isHidden(), true, 'the visible close button dismisses the dialog');

    assert.deepEqual(errors, [], `browser errors: ${errors.join('; ')}`);
    console.log('qa-plan-26: PASS — name input, resume identity, sticky assistance, demo exclusion, local top-10 filters, safe text rendering, keyboard/scroll, and mobile landscape');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

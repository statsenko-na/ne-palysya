// Адресные сценарии расчёта результата, моментов и сохранения для карточки 06.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { pathToFileURL } = require('url');
const { loadPlaywright } = require('./pw');

function checkResultModel() {
  const context = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'moments.js'), 'utf8'), context);
  const worked = context.calculateShiftResult({ fun: 100, fullPlan: true, done: 2, reprimands: 1, momentBonus: 12 });
  assert.strictEqual(worked.score, 141, 'ручной пример считает 100 + 20 + 24 − 15 + 12');
  assert.strictEqual(worked.coins, 14);
  assert.strictEqual(worked.grade.rank, 'A');
  const catastrophe = context.calculateShiftResult({ fun: 0, fullPlan: false, done: 0, reprimands: 0, momentBonus: 0 });
  assert.strictEqual(catastrophe.score, 0, 'после катастрофы кайф и план дают ноль');
  assert.strictEqual(catastrophe.coins, 1);
  const capped = context.calculateShiftResult({ fun: 0, fullPlan: false, done: 0, reprimands: 0, momentBonus: 99 });
  assert.strictEqual(capped.breakdown.moments, 12, 'бонус ограничен потолком 12');
  assert.strictEqual(capped.coins, 1, 'бонус 12 не обещает больше одной дополнительной монеты при нулевой базе');
  const beforeBonus = context.calculateShiftResult({ fun: 34, fullPlan: false, done: 0, reprimands: 0, momentBonus: 0 });
  const afterBonus = context.calculateShiftResult({ fun: 34, fullPlan: false, done: 0, reprimands: 0, momentBonus: 12 });
  assert.strictEqual(afterBonus.coins - beforeBonus.coins, 2, 'в подходящем диапазоне +12 может дать две KPI-монеты');
}

(async () => {
  checkResultModel();
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 640, height: 390 } });
  const errors = [];
  const output = path.join(__dirname, '..', '.qa');
  const url = `${pathToFileURL(path.join(__dirname, '..', 'index.html')).href}#play`;
  page.on('pageerror', error => errors.push(error.message));

  const reset = async (seed = 601) => page.evaluate(value => {
    localStorage.clear();
    localStorage.setItem('nepalsya.weekDone', 'true');
    localStorage.setItem('nepalsya.day', '0');
    NP_DEBUG.setDay(0);
    NP_DEBUG.restart(value);
    NP_DEBUG.clearEvents();
    NP_DEBUG.hideBanner();
    NP_DEBUG.setBoss(706, 446, 'office');
    NP_DEBUG.setClock(10 * 60);
    NP_DEBUG.set({ noPee: true });
    NP_DEBUG.setAction('none', 0);
    NP_DEBUG.setCoins(0);
  }, seed);

  const finishAction = async (action, timer = 0.05) => page.evaluate(({ kind, seconds }) => {
    NP_DEBUG.setAction(kind, seconds);
    NP_DEBUG.skip(seconds + 0.05);
  }, { kind: action, seconds: timer });

  try {
    fs.mkdirSync(output, { recursive: true });
    await page.goto(url);
    await page.waitForFunction(() => !!window.NP_DEBUG);

    await reset(601);
    let initial = await page.evaluate(() => ({ rulesetId: NP_DEBUG.state.rulesetId, moments: NP_DEBUG.moments }));
    assert.strictEqual(initial.rulesetId, 'office-stories-v1');
    assert.deepStrictEqual(initial.moments.awards, []);
    assert.deepStrictEqual(initial.moments.variety.completedKinds, []);

    await finishAction('smoke');
    await finishAction('fridge');
    await finishAction('youtube');
    await page.evaluate(() => { NP_DEBUG.setAction('phone'); NP_DEBUG.skip(5.9); NP_DEBUG.togglePhone(); });
    let moments = await page.evaluate(() => NP_DEBUG.moments);
    assert.strictEqual(moments.variety.completedKinds.length, 3);
    assert.strictEqual(moments.awards.length, 0, 'телефон короче шести секунд не завершает разновидность отдыха');

    await page.evaluate(() => { NP_DEBUG.setAction('phone'); NP_DEBUG.skip(6.1); NP_DEBUG.togglePhone(); });
    moments = await page.evaluate(() => NP_DEBUG.moments);
    assert.ok(moments.awards.some(item => item.id === 'variety'), 'четвёртый завершённый вид отдыха выдаёт момент');
    let current = await page.evaluate(() => NP_DEBUG.shiftResult);
    assert.strictEqual(current.breakdown.moments, 3);

    await reset(602);
    await page.evaluate(() => { NP_DEBUG.setAction('smoke', 10); NP_DEBUG.endAction('cancel'); });
    moments = await page.evaluate(() => NP_DEBUG.moments);
    assert.deepStrictEqual(moments.variety.completedKinds, [], 'отмена не записывается как завершённый отдых');
    await page.evaluate(() => { NP_DEBUG.setAction('chat', 0.05); NP_DEBUG.skip(0.1); });
    moments = await page.evaluate(() => NP_DEBUG.moments);
    assert.ok(!moments.variety.completedKinds.includes('chat'), 'чат без существующего коллеги не считается исходом');

    await reset(603);
    await finishAction('smoke');
    await finishAction('fridge');
    await finishAction('youtube');
    await page.evaluate(() => { NP_DEBUG.setAction('phone'); NP_DEBUG.skip(2.5); NP_DEBUG.saveProgress(); });
    const saved = await page.evaluate(() => {
      const snapshot = JSON.parse(localStorage.getItem('nepalsya.currentSave'));
      return { moments: snapshot.extensions.moments, result: NP_DEBUG.shiftResult, shiftId: NP_DEBUG.persistence.shiftId };
    });
    assert.ok(saved.moments.variety.phoneEpisode && saved.moments.variety.phoneEpisode.seconds >= 2.45, JSON.stringify(saved));
    await page.evaluate(() => NP_DEBUG.restart(604));
    let restored = await page.evaluate(() => ({ state: NP_DEBUG.state, moments: NP_DEBUG.moments, result: NP_DEBUG.shiftResult, shiftId: NP_DEBUG.persistence.shiftId }));
    assert.strictEqual(restored.state.player.action, 'phone');
    assert.strictEqual(restored.shiftId, saved.shiftId);
    assert.strictEqual(restored.state.rulesetId, 'office-stories-v1');
    assert.ok(Math.abs(restored.moments.variety.phoneEpisode.seconds - saved.moments.variety.phoneEpisode.seconds) <= 0.05, 'загрузка восстанавливает сохранённый счётчик без потери времени');
    assert.strictEqual(restored.result.score, saved.result.score);

    await page.keyboard.press('KeyP');
    assert.strictEqual((await page.evaluate(() => NP_DEBUG.state.mode)), 'paused');
    const pausedSeconds = await page.evaluate(() => NP_DEBUG.moments.variety.phoneEpisode.seconds);
    await page.waitForTimeout(160);
    assert.strictEqual(await page.evaluate(() => NP_DEBUG.moments.variety.phoneEpisode.seconds), pausedSeconds, 'пауза не добавляет телефонное время');
    await page.keyboard.press('KeyP');
    const resumedTime = await page.evaluate(() => {
      const before = NP_DEBUG.moments.variety.phoneEpisode.seconds;
      NP_DEBUG.skip(3.6);
      return { before, after: NP_DEBUG.moments.variety.phoneEpisode.seconds };
    });
    assert.ok(resumedTime.after - resumedTime.before >= 3.5 && resumedTime.after - resumedTime.before <= 3.7, 'после загрузки учитывается только активное симуляционное время');

    await reset(605);
    await page.evaluate(() => { NP_DEBUG.set({ fun: 75, usefulness: 90 }); NP_DEBUG.triggerAljazira('disaster'); NP_DEBUG.skip(25); });
    let state = await page.evaluate(() => NP_DEBUG.state);
    assert.strictEqual(state.fun, 0, 'катастрофа действительно обнуляет кайф');
    assert.strictEqual(state.usefulness, 0, 'катастрофа действительно обнуляет план');
    current = await page.evaluate(() => NP_DEBUG.shiftResult);
    assert.strictEqual(current.breakdown.fun, 0);
    assert.strictEqual(current.breakdown.fullPlan, 0, 'прошлый план не сохраняет бонус после катастрофы');

    await reset(606);
    await page.evaluate(() => {
      localStorage.setItem('nepalsya.best.0', JSON.stringify(99));
      NP_DEBUG.set({ fun: 47.5, usefulness: NP_DEBUG.state.planTarget });
    });
    await page.evaluate(() => { NP_DEBUG.togglePhone(); NP_DEBUG.skip(0.15); });
    await page.screenshot({ path: path.join(output, '06-phone-640x390.png') });
    assert.strictEqual(await page.evaluate(() => NP_DEBUG.state.player.action), 'phone', 'телефон открыт на Canvas-снимке');
    current = await page.evaluate(() => NP_DEBUG.shiftResult);
    await page.evaluate(() => NP_DEBUG.finish('win'));
    const final = await page.evaluate(() => ({
      state: NP_DEBUG.state,
      coins: NP_DEBUG.coins,
      resultText: document.getElementById('end-result').textContent,
      gradeText: document.getElementById('end-grade').textContent,
      oldBest: JSON.parse(localStorage.getItem('nepalsya.best.0')),
      newBest: JSON.parse(localStorage.getItem('nepalsya.best.office-stories-v1.0')),
      card: document.getElementById('end-card').getBoundingClientRect().toJSON(),
      viewportHeight: innerHeight,
      overlay: { width: document.getElementById('end-overlay').clientWidth, scrollWidth: document.getElementById('end-overlay').scrollWidth },
    }));
    assert.strictEqual(final.coins, current.coins);
    assert.ok(final.resultText.includes('Истории и хитрости'));
    assert.ok(final.resultText.includes(`${current.score} очков`), 'телефон и финал показывают одинаковый расчёт');
    assert.ok(final.gradeText.includes('Старый рекорд, правила 0.24.1: 99'), 'legacy-рекорд имеет отдельную подпись');
    assert.strictEqual(final.oldBest, 99, 'старый рекорд не перезаписан результатом новой системы');
    assert.strictEqual(final.newBest, current.score, 'новая запись использует ключ ruleset v1');
    assert.ok(final.card.width <= final.overlay.width, 'экран результата не шире компактного окна');
    assert.ok(final.card.height <= final.viewportHeight - 24, 'разбор полностью помещается в низкий альбомный экран');
    await page.screenshot({ path: path.join(output, '06-result-640x390.png') });

    await page.setViewportSize({ width: 960, height: 540 });
    await reset(607);
    await page.evaluate(() => NP_DEBUG.finish('win'));
    await page.screenshot({ path: path.join(output, '06-result-960x540.png') });
    const compact = await page.evaluate(() => ({
      viewport: innerWidth,
      card: document.getElementById('end-card').getBoundingClientRect().toJSON(),
      rows: document.querySelectorAll('#end-result .end-result-row').length,
    }));
    assert.strictEqual(compact.rows, 6);
    assert.ok(compact.card.width <= compact.viewport);

    await reset(608);
    await page.evaluate(() => {
      NP_DEBUG.setMomentsState({ version: 1, awards: [
        { id: 'variety', sourceId: 'v' }, { id: 'distraction', sourceId: 'd' },
        { id: 'colleagueHelp', sourceId: 'c' }, { id: 'story', sourceId: 's' }, { id: 'groupSmoke', sourceId: 'g' },
      ], variety: { completedKinds: [], completedSources: [], phoneEpisode: null } });
    });
    current = await page.evaluate(() => NP_DEBUG.shiftResult);
    assert.strictEqual(current.breakdown.moments, 12, 'runtime сводка не превышает потолок');
    await page.evaluate(() => { NP_DEBUG.set({ fun: 0, usefulness: 0, reprimands: 0 }); NP_DEBUG.finish('fired'); });
    let payout = await page.evaluate(() => ({ scoreText: document.getElementById('end-result').textContent, coins: NP_DEBUG.coins, mode: NP_DEBUG.state.mode }));
    assert.strictEqual(payout.mode, 'ended');
    assert.strictEqual(payout.coins, 1, 'проигрыш платит по единому формульному минимуму');
    assert.ok(payout.scoreText.includes('12 очков'));
    await page.evaluate(() => NP_DEBUG.finish('win'));
    assert.strictEqual(await page.evaluate(() => NP_DEBUG.coins), 1, 'повторный finishGame не выплачивает повторно');
    await page.reload();
    await page.waitForFunction(() => !!window.NP_DEBUG);
    assert.strictEqual(await page.evaluate(() => NP_DEBUG.coins), 1, 'reload после завершения не начисляет повторную награду');

    await reset(609);
    await page.evaluate(() => { NP_DEBUG.set({ fun: 20, usefulness: 0 }); NP_DEBUG.goMunichBeer(); });
    const munich = await page.evaluate(() => ({ fun: NP_DEBUG.state.fun, scoreText: document.getElementById('end-result').textContent, title: document.getElementById('end-title').textContent, coins: NP_DEBUG.coins }));
    assert.strictEqual(munich.fun, 45, 'ранний выход по-прежнему добавляет +25 кайфа');
    assert.ok(munich.scoreText.includes('45 очков'));
    assert.match(munich.title, /МЮНХЕН/);
    assert.strictEqual(munich.coins, 5);

    await reset(610);
    await page.evaluate(() => {
      NP_DEBUG.setAction('smoke', 1);
      NP_DEBUG.saveProgress();
      const savedState = JSON.parse(localStorage.getItem('nepalsya.currentSave'));
      delete savedState.rulesetId;
      delete savedState.extensions.moments;
      localStorage.setItem('nepalsya.currentSave', JSON.stringify(savedState));
      NP_DEBUG.restart(611);
      NP_DEBUG.endAction('done');
    });
    const legacy = await page.evaluate(() => ({ rulesetId: NP_DEBUG.state.rulesetId, moments: NP_DEBUG.moments, result: NP_DEBUG.shiftResult }));
    assert.strictEqual(legacy.rulesetId, 'office-stories-legacy-0.24.1');
    assert.strictEqual(legacy.moments.variety.completedKinds.length, 0, 'старое сохранение не получает новый бонус задним числом');
    assert.strictEqual(legacy.result.breakdown.moments, 0);

    assert.deepStrictEqual(errors, [], `ошибки браузера: ${errors.join('; ')}`);
    process.stdout.write('qa-plan-06: все проверки пройдены\n');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

// Адресные сценарии подключённой модели отношений для карточки 08.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { loadPlaywright } = require('./pw');

(async () => {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const url = `${pathToFileURL(path.join(__dirname, '..', 'index.html')).href}#play`;

  const reset = async ({ seed = 801, day = 0, weekDone = true } = {}) => page.evaluate(({ seed, day, weekDone }) => {
    localStorage.clear();
    localStorage.setItem('nepalsya.weekDone', JSON.stringify(weekDone));
    localStorage.setItem('nepalsya.day', JSON.stringify(day));
    NP_DEBUG.setDay(day);
    NP_DEBUG.restart(seed);
    NP_DEBUG.clearEvents();
    NP_DEBUG.hideBanner();
    NP_DEBUG.setBoss(706, 446, 'office');
    NP_DEBUG.setClock(10 * 60);
    NP_DEBUG.set({ noPee: true, usefulness: 0, reprimands: 0, weekReprimands: 0 });
    NP_DEBUG.setAction('none', 0);
  }, { seed, day, weekDone });

  const relationship = () => page.evaluate(() => NP_DEBUG.relationships);
  const grantHelp = (npcId, eventId) => page.evaluate(({ npcId, eventId }) =>
    NP_DEBUG.recordRelationshipEvent(npcId, 'help', eventId), { npcId, eventId });
  const workMeme = async () => page.evaluate(() => {
    NP_DEBUG.setAction('work');
    NP_DEBUG.setNudge(6);
    NP_DEBUG.interact();
    NP_DEBUG.skip(3.1);
  });

  try {
    await page.goto(url);
    await page.waitForFunction(() => !!window.NP_DEBUG);

    await reset();
    await workMeme();
    let state = await relationship();
    assert.equal(state.entries.bleb.mood, 'friendly');
    assert.equal(state.entries.bleb.favorCredit, 1);
    assert.equal(state.entries.bleb.helpedDay, 0);
    await workMeme();
    state = await relationship();
    assert.equal(state.entries.bleb.favorCredit, 1, 'повторный мем не фармит кредит');
    assert.equal(state.appliedEventIds.filter(id => id.endsWith(':bleb:meme')).length, 1);

    await reset({ seed: 802 });
    await page.evaluate(() => {
      NP_DEBUG.setAction('work');
      NP_DEBUG.setNudge(6);
      NP_DEBUG.interact();
      NP_DEBUG.endAction('cancel');
      NP_DEBUG.setAction('fixjam', 3);
      NP_DEBUG.endAction('cancel');
    });
    state = await relationship();
    assert.equal(state.entries.bleb.favorCredit, 0, 'отменённый мем не даёт помощь');
    assert.equal(state.entries.shurik.favorCredit, 0, 'отменённая починка не даёт помощь');

    await reset({ seed: 803 });
    await page.evaluate(() => {
      NP_DEBUG.setAction('work');
      NP_DEBUG.setNudge(0.01);
      NP_DEBUG.skip(0.05);
    });
    state = await relationship();
    assert.equal(state.entries.bleb.favorCredit, 0, 'игнор не даёт помощь');
    const ignoredCooldown = await page.evaluate(() => NP_DEBUG.coworkers.find(c => c.id === 'bleb').cooldown);
    assert.ok(ignoredCooldown <= 40 && ignoredCooldown >= 39.8, `игнор сохраняет cooldown около 40 с: ${ignoredCooldown}`);

    await reset({ seed: 804 });
    await page.evaluate(() => { NP_DEBUG.setAction('fixjam', 3); NP_DEBUG.skip(3.1); });
    state = await relationship();
    assert.equal(state.entries.shurik.favorCredit, 1, 'завершённая починка помогает Шурику');
    const secondShurikHelp = await grantHelp('shurik', 'qa:shurik:second-help');
    assert.equal(secondShurikHelp.ok, false, 'второе событие помощи Шурику в тот же день отклонено');
    assert.equal((await relationship()).entries.shurik.favorCredit, 1);

    await reset({ seed: 805 });
    await page.evaluate(() => {
      NP_DEBUG.startEvent('majik');
      NP_DEBUG.setAction('work');
      NP_DEBUG.skip(4.1);
    });
    assert.equal((await relationship()).entries.aimashyn.favorCredit, 1, 'успешный Маджикистан помогает Аймашыну');

    await reset({ seed: 806 });
    await page.evaluate(() => {
      NP_DEBUG.setAction('standup');
      NP_DEBUG.setStandupChoice({ asked: true, done: false, t: 3 });
      NP_DEBUG.answerStandup(2);
    });
    state = await relationship();
    assert.equal(state.entries.sirgey.mood, 'angry');
    assert.equal(state.entries.sirgey.angryThroughDay, 1);
    const sirgeyCooldown = await page.evaluate(() => NP_DEBUG.coworkers.find(c => c.id === 'sirgey').cooldown);
    assert.ok(sirgeyCooldown <= 120 && sirgeyCooldown >= 119.8, `обвинение сохраняет cooldown Сиргея 120 с: ${sirgeyCooldown}`);
    await page.evaluate(() => {
      NP_DEBUG.set({ usefulness: NP_DEBUG.state.planTarget });
      NP_DEBUG.finish('win');
      NP_DEBUG.restart(807);
    });
    state = await relationship();
    assert.equal((await page.evaluate(() => NP_DEBUG.state.dayIndex)), 1, 'успех переводит на вторник');
    assert.equal(state.entries.sirgey.mood, 'angry', 'обида сохраняется на следующий день');
    assert.equal(state.entries.sirgey.angryThroughDay, 1);
    assert.equal((await page.evaluate(() => NP_DEBUG.requestFavor('sirgey', 'callhack'))).reason, 'favor_unavailable');
    const chatsBefore = await page.evaluate(() => NP_DEBUG.state.stats.chats);
    await page.evaluate(() => NP_DEBUG.chatPerk('sirgey'));
    assert.equal((await page.evaluate(() => NP_DEBUG.state.stats.chats)), chatsBefore + 1, 'старая беседа с перком работает при обиде');

    await reset({ seed: 808, weekDone: false });
    await grantHelp('sirgey', 'qa:sirgey:remote-help');
    const remote = await page.evaluate(() => NP_DEBUG.requestFavor('sirgey', 'callhack'));
    assert.equal(remote.reason, 'npc_unavailable', 'удалённый Сиргей недоступен');
    assert.equal((await relationship()).entries.sirgey.favorCredit, 1, 'удалённый запрос не тратит кредит');
    await grantHelp('aimashyn', 'qa:aimashyn:locked-help');
    assert.equal((await page.evaluate(() => NP_DEBUG.requestFavor('aimashyn', 'cover'))).reason, 'mechanic_locked');
    assert.equal((await relationship()).entries.aimashyn.favorCredit, 1, 'закрытая механика не тратит кредит');
    assert.equal((await page.evaluate(() => NP_DEBUG.requestFavor('tigran', 'rocket'))).reason, 'unknown_npc', 'персонаж без relationship-механики не может получить услугу');

    await reset({ seed: 809 });
    await workMeme();
    assert.deepEqual(await page.evaluate(() => NP_DEBUG.requestFavor('bleb', 'snack')), { ok: false, reason: 'unavailable' });
    assert.equal((await relationship()).entries.bleb.favorCredit, 1, 'эффект пока отсутствует — кредит сохранён');
    await page.evaluate(() => NP_DEBUG.setAction('work'));
    assert.equal((await page.evaluate(() => NP_DEBUG.requestFavor('bleb', 'snack'))).reason, 'busy');
    assert.equal((await relationship()).entries.bleb.favorCredit, 1, 'занятость не тратит кредит');
    assert.equal(await page.locator('button').evaluateAll(buttons => buttons.some(button => /просить помощь|попросить услугу/i.test(button.textContent))), false, 'кнопки недоступной услуги нет');

    await reset({ seed: 810 });
    await workMeme();
    await page.keyboard.press('KeyP');
    await page.evaluate(() => NP_DEBUG.saveProgress());
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('nepalsya.currentSave')));
    assert.equal(saved.extensions.relationships.entries.bleb.favorCredit, 1, 'пауза сохраняет extension');
    await page.evaluate(() => NP_DEBUG.restart(811));
    state = await relationship();
    assert.equal(state.entries.bleb.favorCredit, 1, 'загрузка восстанавливает отношение');
    assert.equal((await page.evaluate(() => NP_DEBUG.loadResult.status)), 'resumed');

    await reset({ seed: 812 });
    const beforeRetry = await page.evaluate(() => NP_DEBUG.relationshipSnapshots.dayStart);
    await workMeme();
    await page.evaluate(() => NP_DEBUG.finish('fired'));
    await page.evaluate(() => NP_DEBUG.restart(813));
    state = await relationship();
    assert.equal(state.entries.bleb.favorCredit, 0, 'повтор дня восстанавливает dayStart');
    assert.deepEqual(await page.evaluate(() => NP_DEBUG.relationshipSnapshots.dayStart), beforeRetry);

    await reset({ seed: 814 });
    await workMeme();
    await page.evaluate(() => {
      NP_DEBUG.set({ usefulness: NP_DEBUG.state.planTarget });
      NP_DEBUG.finish('win');
      NP_DEBUG.restart(815);
    });
    state = await relationship();
    assert.equal((await page.evaluate(() => NP_DEBUG.state.dayIndex)), 1);
    assert.equal(state.entries.bleb.favorCredit, 1, 'успешный следующий день сохраняет неделю');
    assert.equal(state.dayIndex, 1);

    await reset({ seed: 816, day: 4 });
    await grantHelp('bleb', 'qa:friday:help');
    await page.evaluate(() => {
      NP_DEBUG.set({ usefulness: NP_DEBUG.state.planTarget });
      NP_DEBUG.finish('win');
      NP_DEBUG.restart(817);
    });
    state = await relationship();
    assert.equal((await page.evaluate(() => NP_DEBUG.state.dayIndex)), 0, 'победа в пятницу начинает неделю');
    assert.equal(state.entries.bleb.favorCredit, 0, 'пятничный переход очищает отношения');
    assert.equal(state.dayIndex, 0);
    const weekAfterFriday = await page.evaluate(() => NP_DEBUG.relationshipSnapshots.weekStart);
    await page.evaluate(() => NP_DEBUG.restart(818));
    assert.deepEqual(await page.evaluate(() => NP_DEBUG.relationshipSnapshots.weekStart), weekAfterFriday, 'продолжение понедельника не сбрасывает неделю повторно');

    await reset({ seed: 819, day: 2 });
    await grantHelp('bleb', 'qa:fire-week:help');
    await page.evaluate(() => { NP_DEBUG.set({ weekReprimands: 99 }); NP_DEBUG.finish('fired'); NP_DEBUG.restart(820); });
    state = await relationship();
    assert.equal((await page.evaluate(() => NP_DEBUG.state.dayIndex)), 0, 'недельное увольнение сбрасывает неделю');
    assert.equal(state.entries.bleb.favorCredit, 0, 'недельное увольнение сбрасывает отношения');

    await reset({ seed: 821 });
    await page.evaluate(() => {
      NP_DEBUG.saveProgress();
      const save = JSON.parse(localStorage.getItem('nepalsya.currentSave'));
      save.extensions.relationships = { broken: true };
      localStorage.setItem('nepalsya.currentSave', JSON.stringify(save));
      NP_DEBUG.restart(822);
    });
    assert.equal((await page.evaluate(() => NP_DEBUG.persistence.extensionErrors.relationships)), 'invalid_state');
    await page.evaluate(() => NP_DEBUG.saveProgress());
    assert.equal((await page.evaluate(() => NP_DEBUG.persistence.extensionErrors.relationships)), undefined, 'валидный fallback очищает диагностическую ошибку при сохранении');

    assert.deepEqual(errors, [], `ошибки Canvas: ${errors.join('; ')}`);
    console.log('Карточка 08: адресные сценарии отношений пройдены.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

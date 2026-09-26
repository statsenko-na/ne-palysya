'use strict';
// Автошка Сиргея: ветки помощи, событие, риск, отношения и сохранение.
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

  const reset = async (seed, usefulness = 0) => page.evaluate(({ currentSeed, plan }) => {
    localStorage.clear();
    localStorage.setItem('nepalsya.weekDone', 'true');
    localStorage.setItem('nepalsya.day', '3');
    localStorage.setItem('nepalsya.onboardingDone', 'true');
    NP_DEBUG.setDay(3);
    NP_DEBUG.restart(currentSeed);
    NP_DEBUG.setDay(3);
    NP_DEBUG.clearEvents();
    NP_DEBUG.hideBanner();
    NP_DEBUG.set({ usefulness: plan, fun: 25, noPee: true });
    NP_DEBUG.setBoss(706, 446, 'office');
    NP_DEBUG.setClock(600);
    NP_DEBUG.setAction('none', 0);
    const sirgey = coworkerById('sirgey');
    sirgey.away = false;
    sirgey.remote = false;
    nextBossCheck = 999;
    timeScale = 1;
    store.set('timeScale', 1);
    muted = false;
    store.set('muted', false);
  }, { currentSeed: seed, plan: usefulness });

  const startAtSirgey = async (remaining = 18) => page.evaluate(seconds => {
    NP_DEBUG.startEvent('autoshka');
    officeEvent.t = seconds;
    const zone = NP_WORLD.zones.find(item => item.id === 'chat_sirgey');
    if (!zone) throw new Error('зона стола Сиргея не найдена');
    NP_DEBUG.teleport(zone.x + zone.w / 2, zone.y + zone.h / 2);
    return { event: NP_DEBUG.event, boss: { state: boss.state, scoldTarget: boss.scoldTarget } };
  }, remaining);

  const openHelp = async () => page.evaluate(() => {
    NP_DEBUG.interact();
    return NP_DEBUG.actionChoiceView;
  });
  const moveBossOutOfSight = () => page.evaluate(() => NP_DEBUG.setBoss(40, 500, 'gone'));
  const save = async () => page.evaluate(() => {
    const result = NP_DEBUG.saveProgress();
    if (!result.ok) throw new Error(`save failed: ${result.reason}`);
    return result.snapshot;
  });
  const reload = async () => {
    await page.reload();
    await page.waitForFunction(() => !!window.NP_DEBUG);
    return page.evaluate(() => ({ load: NP_DEBUG.loadResult, state: NP_DEBUG.state, autoshka: saveExtensions.autoshka }));
  };

  try {
    fs.mkdirSync(output, { recursive: true });
    await page.goto(url);
    await page.waitForFunction(() => !!window.NP_DEBUG);

    await reset(1801);
    const opening = await startAtSirgey();
    assert.strictEqual(opening.event.id, 'autoshka');
    assert.strictEqual(opening.boss.state, 'scold', 'исходное отчитывание Д.Н. запускается как прежде');
    assert.strictEqual(opening.boss.scoldTarget, 'sirgey');
    let view = await openHelp();
    assert(view, 'у стола Сиргея есть действие во время автошки');
    assert.strictEqual(view.id, 'autoshka-help');
    assert.deepStrictEqual(view.options.map(option => option.id), ['reliable', 'quick', 'leave']);
    assert(view.options.every(option => option.disabledReason === ''), 'при полном окне доступны обе помощи');
    await page.waitForTimeout(100);
    await page.evaluate(() => { bubbles.length = 0; });
    await page.screenshot({ path: path.join(output, '18-autoshka-help-960x540.png') });
    const declined = await page.evaluate(() => {
      const before = { usefulness: NP_DEBUG.state.usefulness, fun: NP_DEBUG.state.fun, chats: NP_DEBUG.state.stats.chats };
      NP_DEBUG.selectActionChoice(2);
      return {
        before,
        after: NP_DEBUG.state,
        event: NP_DEBUG.event,
        boss: { state: boss.state, scoldTarget: boss.scoldTarget },
        autoshka: saveExtensions.autoshka,
      };
    });
    assert.strictEqual(declined.event.id, 'autoshka', 'отказ не отменяет событие');
    assert.strictEqual(declined.boss.state, opening.boss.state, 'отказ не меняет действие Д.Н.');
    assert.strictEqual(declined.boss.scoldTarget, 'sirgey');
    assert.strictEqual(declined.after.usefulness, declined.before.usefulness);
    assert.strictEqual(declined.after.fun, declined.before.fun);
    assert.strictEqual(declined.after.stats.chats, declined.before.chats, 'отказ не считается обычным разговором');

    // Обида после прежней летучки блокирует только надёжную услугу, иначе кредит не выдастся атомарно.
    await reset(1809);
    await startAtSirgey();
    await page.evaluate(() => {
      const result = applyRelationshipEvent(ensureRelationshipsExtension(), {
        eventId: 'qa:autoshka:prior-betrayal', npcId: 'sirgey', kind: 'betrayal', dayIndex,
      });
      if (!result.ok) throw new Error(`betrayal setup failed: ${result.reason}`);
      saveExtensions.relationships = result.state;
    });
    view = await openHelp();
    assert.notStrictEqual(view.options[0].disabledReason, '', 'обиженный Сиргей блокирует надёжную помощь');
    assert.strictEqual(view.options[1].disabledReason, '', 'быстрый костыль доступен и без кредита отношений');

    // Надёжная помощь не выдаёт обычный chat perk и сохраняется во время ремонта.
    await reset(1802);
    await startAtSirgey();
    view = await openHelp();
    const reliableStart = await page.evaluate(() => {
      const before = { usefulness: NP_DEBUG.state.usefulness, fun: NP_DEBUG.state.fun, chats: NP_DEBUG.state.stats.chats };
      NP_DEBUG.selectActionChoice(0);
    return { before, action: NP_DEBUG.state.player.action, timer: NP_DEBUG.state.player.actionTimer, autoshka: saveExtensions.autoshka, auto: NP_DEBUG.auto };
    });
    assert.strictEqual(reliableStart.action, 'autoshka-repair');
    assert.strictEqual(reliableStart.timer, 6);
    assert.strictEqual(reliableStart.autoshka.status, 'repairing');
    await moveBossOutOfSight();
    await page.evaluate(() => NP_DEBUG.skip(1.2));
    const snapshot = await save();
    assert(snapshot.extensions.autoshka, 'схема сохранения сохраняет новое расширение');
    let resumed = await reload();
    assert.strictEqual(resumed.load.status, 'resumed');
    assert.strictEqual(resumed.autoshka.status, 'repairing');
    await page.evaluate(() => NP_DEBUG.skip(5.1));
    const reliableDone = await page.evaluate(() => ({
      state: NP_DEBUG.state,
      relationships: NP_DEBUG.relationships,
      moments: NP_DEBUG.moments,
      autoshka: saveExtensions.autoshka,
      boss: { state: boss.state, scoldTarget: boss.scoldTarget },
    }));
    assert.strictEqual(reliableDone.autoshka.status, 'completed');
    assert.strictEqual(reliableDone.autoshka.outcome, 'reliable');
    assert.strictEqual(reliableDone.state.usefulness - reliableStart.before.usefulness, 6);
    assert.strictEqual(reliableDone.state.fun, reliableStart.before.fun, 'надёжный ремонт не даёт кайф');
    assert.strictEqual(reliableDone.state.stats.chats, reliableStart.before.chats, 'ремонт не получает обычный chat perk');
    assert.strictEqual(reliableDone.relationships.entries.sirgey.favorCredit, 1);
    assert.strictEqual(reliableDone.relationships.entries.sirgey.mood, 'friendly');
    assert.strictEqual(reliableDone.moments.awards.filter(item => item.id === 'colleagueHelp').length, 1);

    // Полный лимит моментов не блокирует ремонт, план или кредит отношений.
    await reset(1810);
    await page.evaluate(() => {
      saveExtensions.moments = {
        version: 1,
        awards: ['variety', 'distraction', 'story', 'groupSmoke'].map(id => ({ id, sourceId: `qa:${id}`, points: 3 })),
        variety: { completedKinds: [], completedSources: [], phoneEpisode: null },
      };
    });
    await startAtSirgey();
    await openHelp();
    await page.evaluate(() => { NP_DEBUG.selectActionChoice(0); NP_DEBUG.setBoss(40, 500, 'gone'); NP_DEBUG.skip(6.1); });
    const capped = await page.evaluate(() => ({ state: NP_DEBUG.state, relationships: NP_DEBUG.relationships, moments: NP_DEBUG.moments, autoshka: saveExtensions.autoshka }));
    assert.strictEqual(capped.autoshka.status, 'completed');
    assert.strictEqual(capped.state.usefulness, 6);
    assert.strictEqual(capped.relationships.entries.sirgey.favorCredit, 1);
    assert.strictEqual(capped.moments.awards.reduce((sum, item) => sum + item.points, 0), 12);
    assert.strictEqual(capped.moments.awards.some(item => item.id === 'colleagueHelp'), false, 'момент пропускается только при исчерпанном лимите');

    // Отмена не оставляет план, момент или кредит.
    await reset(1803);
    await startAtSirgey();
    await openHelp();
    const canceled = await page.evaluate(() => {
      NP_DEBUG.selectActionChoice(0);
      NP_DEBUG.setBoss(40, 500, 'gone');
      NP_DEBUG.skip(1.1);
      NP_DEBUG.interact();
      return { state: NP_DEBUG.state, autoshka: saveExtensions.autoshka, relationships: NP_DEBUG.relationships, moments: NP_DEBUG.moments };
    });
    assert.strictEqual(canceled.autoshka.status, 'cancelled');
    assert.strictEqual(canceled.state.usefulness, 0);
    assert.strictEqual(canceled.relationships.entries.sirgey.favorCredit, 0);
    assert.strictEqual(canceled.moments.awards.some(item => item.id === 'colleagueHelp'), false);

    await reset(1811);
    await startAtSirgey();
    await openHelp();
    const phoneInterrupt = await page.evaluate(() => {
      NP_DEBUG.selectActionChoice(0);
      NP_DEBUG.startPhoneScrolling();
      return { action: NP_DEBUG.state.player.action, autoshka: saveExtensions.autoshka, state: NP_DEBUG.state };
    });
    assert.strictEqual(phoneInterrupt.action, 'phone');
    assert.strictEqual(phoneInterrupt.autoshka.status, 'cancelled');
    assert.strictEqual(phoneInterrupt.state.usefulness, 0);

    await reset(1812);
    await startAtSirgey();
    await openHelp();
    await page.evaluate(() => { NP_DEBUG.selectActionChoice(0); NP_DEBUG.setBoss(40, 500, 'gone'); });
    await page.keyboard.down('d');
    await page.evaluate(() => NP_DEBUG.skip(0.05));
    await page.keyboard.up('d');
    const walkInterrupt = await page.evaluate(() => ({ action: NP_DEBUG.state.player.action, autoshka: saveExtensions.autoshka, state: NP_DEBUG.state }));
    assert.strictEqual(walkInterrupt.action, 'none');
    assert.strictEqual(walkInterrupt.autoshka.status, 'cancelled');
    assert.strictEqual(walkInterrupt.state.usefulness, 0);

    // При коротком окне остаётся костыль, а ремонт отменяется, если событие закончится раньше.
    await reset(1804);
    await startAtSirgey(5);
    view = await openHelp();
    assert.notStrictEqual(view.options[0].disabledReason, '', '6-секундную ветку нельзя начать при пяти секундах');
    assert.strictEqual(view.options[1].disabledReason, '');
    await page.evaluate(() => { NP_DEBUG.selectActionChoice(1); NP_DEBUG.setBoss(40, 500, 'gone'); });
    await page.evaluate(() => { officeEvent.t = 0.6; NP_DEBUG.skip(1.2); });
    const endedEarly = await page.evaluate(() => ({ state: NP_DEBUG.state, autoshka: saveExtensions.autoshka, event: NP_DEBUG.event }));
    assert.strictEqual(endedEarly.event, null);
    assert.strictEqual(endedEarly.autoshka.status, 'cancelled');
    assert.strictEqual(endedEarly.state.usefulness, 0, 'ремонт после конца события не выдаёт план');

    // Удалённый Сиргей не открывает помощь.
    await reset(1805);
    await startAtSirgey();
    await page.evaluate(() => { coworkerById('sirgey').remote = true; });
    const unavailable = await page.evaluate(() => {
      NP_DEBUG.interact();
      return { view: NP_DEBUG.actionChoiceView, state: saveExtensions.autoshka };
    });
    assert.strictEqual(unavailable.view, null);
    assert.strictEqual(unavailable.state, undefined);

    // Быстрый костыль переживает конец события и reload; наступивший штраф ждёт обед.
    await reset(1806, 10);
    await startAtSirgey();
    await openHelp();
    const quickStart = await page.evaluate(() => {
      const before = { usefulness: NP_DEBUG.state.usefulness, fun: NP_DEBUG.state.fun, chats: NP_DEBUG.state.stats.chats };
      NP_DEBUG.selectActionChoice(1);
      NP_DEBUG.setBoss(40, 500, 'gone');
      NP_DEBUG.skip(3.1);
      return { before, state: NP_DEBUG.state, autoshka: saveExtensions.autoshka, relationships: NP_DEBUG.relationships, moments: NP_DEBUG.moments };
    });
    assert.strictEqual(quickStart.autoshka.status, 'completed');
    assert.strictEqual(quickStart.autoshka.outcome, 'quick');
    assert.strictEqual(quickStart.state.usefulness - quickStart.before.usefulness, 3);
    assert.strictEqual(quickStart.state.fun, quickStart.before.fun);
    assert.strictEqual(quickStart.state.stats.chats, quickStart.before.chats);
    assert.strictEqual(quickStart.relationships.entries.sirgey.favorCredit, 0);
    assert.strictEqual(quickStart.moments.awards.some(item => item.id === 'colleagueHelp'), false);
    await page.evaluate(() => { officeEvent.t = 0.04; NP_DEBUG.skip(0.1); });
    await page.evaluate(() => { NP_DEBUG.setAction('lunch', 0); NP_DEBUG.skip(12.2); });
    const dueAtLunch = await page.evaluate(() => ({ state: NP_DEBUG.state, pending: saveExtensions.autoshka.pendingFailure }));
    assert.strictEqual(dueAtLunch.pending.status, 'pending');
    assert.strictEqual(dueAtLunch.pending.remaining, 0);
    assert.strictEqual(dueAtLunch.pending.due, true);
    await save();
    resumed = await reload();
    assert.strictEqual(resumed.autoshka.pendingFailure.due, true, 'наступивший штраф сохраняется после reload');
    await page.evaluate(() => { NP_DEBUG.setAction('none', 0); NP_DEBUG.skip(0.1); });
    const failed = await page.evaluate(() => ({ state: NP_DEBUG.state, autoshka: saveExtensions.autoshka }));
    assert.strictEqual(failed.autoshka.pendingFailure.status, 'applied');
    assert.strictEqual(failed.state.usefulness, 7, 'после обеда из 13 плана снимаются 6');
    await page.evaluate(() => NP_DEBUG.skip(2));
    assert.strictEqual((await page.evaluate(() => NP_DEBUG.state.usefulness)), 7, 'отложенный штраф применяется один раз');

    // Штраф ограничивается фактически имеющимся планом.
    await reset(1807, 0);
    await startAtSirgey();
    await openHelp();
    await page.evaluate(() => { NP_DEBUG.selectActionChoice(1); NP_DEBUG.setBoss(40, 500, 'gone'); NP_DEBUG.skip(3.1); officeEvent.t = 0.04; NP_DEBUG.skip(0.1); NP_DEBUG.skip(12.2); });
    await page.evaluate(() => NP_DEBUG.skip(0.1));
    assert.strictEqual((await page.evaluate(() => NP_DEBUG.state.usefulness)), 0, 'штраф не уводит план ниже нуля');

    // На конце смены уже наступивший штраф применяется, ненаступивший отбрасывается.
    await reset(1808, 10);
    await startAtSirgey();
    await openHelp();
    await page.evaluate(() => { NP_DEBUG.selectActionChoice(1); NP_DEBUG.setBoss(40, 500, 'gone'); NP_DEBUG.skip(3.1); NP_DEBUG.finish('win'); });
    const finished = await page.evaluate(() => ({ state: NP_DEBUG.state, pending: saveExtensions.autoshka.pendingFailure }));
    assert.strictEqual(finished.pending.status, 'discarded');
    assert.strictEqual(finished.state.usefulness, 13, 'штраф, который ещё не наступил, не списывается при конце смены');

    assert.deepStrictEqual(errors, [], `ошибки страницы: ${errors.join('; ')}`);
    console.log('qa-plan-18: выбор, надёжная/быстрая помощь, отмена, окно события, Сиргей, save/reload, обед и срок смены — OK');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

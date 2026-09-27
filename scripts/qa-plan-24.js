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
  const url = `${pathToFileURL(path.join(__dirname, '..', 'index.html')).href}#play`;
  page.on('pageerror', error => errors.push(error.message));

  async function reset(day, completedWeeks, seed) {
    await page.evaluate(args => {
      localStorage.clear();
      store.set('weekDone', args.completedWeeks > 0);
      store.set('weekNumber', args.completedWeeks);
      store.set('day', args.day);
      store.set('onboardingDone', true);
      store.set('tutorialDone', true);
      NP_DEBUG.setDay(args.day);
      NP_DEBUG.restart(args.seed);
      NP_DEBUG.setDay(args.day);
      NP_DEBUG.clearEvents();
      NP_DEBUG.setBoss(850, 470, 'office');
      nextBossCheck = 999;
      majikArc = 0;
      store.set('majikArc', 0);
      const tigran = coworkerById('tigran');
      if (tigran) { tigran.away = false; tigran.remote = false; tigran.cooldown = 0; }
      return { mode: NP_DEBUG.state.mode, dayIndex, weekNumber };
    }, { day, completedWeeks, seed });
  }

  function seedFacts(facts) {
    return page.evaluate(entries => {
      for (const [kind, id, value] of entries) recordWeekOutcomeFact(kind, id, value);
      return ensureWeekOutcomesExtension();
    }, facts);
  }

  try {
    fs.mkdirSync(output, { recursive: true });
    await page.goto(url);
    await page.waitForFunction(() => !!window.NP_DEBUG);

    // The normal Friday card keeps its existing ending and adds the prioritized weekly title plus three facts.
    await reset(4, 3, 2401);
    await seedFacts([
      ['help', 'qa24:help:1'], ['help', 'qa24:help:2'], ['help', 'qa24:help:3'],
      ['betrayal', 'qa24:betrayal:1'], ['distraction', 'qa24:distraction:1'],
      ['reprimand', 'qa24:reprimand:1'],
    ]);
    const pillar = await page.evaluate(() => {
      NP_DEBUG.set({ usefulness: planTarget, fun: 24, reprimands: 0, weekReprimands: 0 });
      const weekId = currentWeekOutcomeId();
      const coinsBefore = coins;
      const expectedCoins = calculateCurrentShiftResult().coins;
      const funBefore = fun;
      NP_DEBUG.finish('win');
      return {
        copy: document.getElementById('end-copy').textContent,
        weekNumber,
        coinsDelta: coins - coinsBefore,
        expectedCoins,
        funBefore,
        funAfter: fun,
        oldWeekId: weekId,
        newWeek: store.get('weekOutcomes', null),
        newSecret: store.get('tigranSecret', null),
      };
    });
    assert.match(pillar.copy, /Опора отдела/);
    assert.match(pillar.copy, /помощь 3/);
    assert.match(pillar.copy, /предательства 1/);
    assert.match(pillar.copy, /выговоры 1/);
    assert.equal(pillar.weekNumber, 4);
    assert.equal(pillar.coinsDelta, pillar.expectedCoins, 'title adds no coins over the normal Majikistan result');
    assert.equal(pillar.funAfter, pillar.funBefore, 'title adds no fun');
    assert.notEqual(pillar.newWeek.weekId, pillar.oldWeekId);
    assert.deepEqual(pillar.newWeek.counts, { helped: 0, betrayed: 0, distractions: 0, reprimands: 0, fullPlans: 0 });
    assert.equal(pillar.newSecret.phase, 'dormant');
    assert.equal(pillar.newSecret.weekId, pillar.newWeek.weekId);
    await page.screenshot({ path: path.join(output, '24-week-title-960x540.png') });

    // Munich retains its own ending and the higher-priority successful-distraction title.
    await reset(4, 1, 2402);
    await seedFacts([
      ['distraction', 'qa24:munich-distraction:1'],
      ['distraction', 'qa24:munich-distraction:2'],
      ['distraction', 'qa24:munich-distraction:3'],
      ['fullPlan', 'qa24:munich-plan:1'],
    ]);
    const beer = await page.evaluate(() => {
      NP_DEBUG.set({ fun: 20, usefulness: 0 });
      const funBefore = fun;
      NP_DEBUG.goMunichBeer();
      return {
        title: document.getElementById('end-title').textContent,
        copy: document.getElementById('end-copy').textContent,
        funDelta: fun - funBefore,
        weekNumber,
      };
    });
    assert.match(beer.title, /МЮНХЕН/);
    assert.match(beer.copy, /пятничное пиво/);
    assert.match(beer.copy, /Мастер отмазок/);
    assert.match(beer.copy, /успешные отвлечения 3/);
    assert.equal(beer.funDelta, 25, 'the existing beer ending keeps its only fun reward');
    assert.equal(beer.weekNumber, 2);
    await page.screenshot({ path: path.join(output, '24-munich-title-960x540.png') });

    // The clean-plan title is selected after the current Friday plan is recorded; duplicate event IDs stay idempotent.
    await reset(4, 0, 2403);
    await seedFacts([
      ['fullPlan', 'qa24:prior-plan:1'], ['fullPlan', 'qa24:prior-plan:2'],
    ]);
    const favorite = await page.evaluate(() => {
      NP_DEBUG.set({ usefulness: planTarget, reprimands: 0, weekReprimands: 0 });
      const sameId = `${shiftId}:week-full-plan`;
      recordWeekOutcomeFact('fullPlan', sameId);
      recordWeekOutcomeFact('fullPlan', sameId);
      NP_DEBUG.finish('win');
      return document.getElementById('end-copy').textContent;
    });
    assert.match(favorite, /Любимчик Д\.Н\./);
    assert.match(favorite, /полные планы 3/);

    // A fired shift is not a weekly close and does not show a weekly title.
    await reset(2, 2, 2404);
    await seedFacts([['help', 'qa24:failed-week:help:1'], ['help', 'qa24:failed-week:help:2'], ['help', 'qa24:failed-week:help:3']]);
    const fired = await page.evaluate(() => {
      const before = weekNumber;
      NP_DEBUG.finish('fired');
      return { copy: document.getElementById('end-copy').textContent, before, after: weekNumber };
    });
    assert.equal(fired.after, fired.before);
    assert.doesNotMatch(fired.copy, /Титул недели/);

    // Reprimand facts are recorded only after lunch and cover checks pass.
    await reset(2, 0, 2405);
    const reprimandCounts = await page.evaluate(() => {
      const factsBefore = ensureWeekOutcomesExtension().counts.reprimands;
      coverTokens = 1;
      const covered = reprimand('Проверка QA', 'проверка QA');
      const afterCover = ensureWeekOutcomesExtension().counts.reprimands;
      player.action = 'lunch';
      const lunch = reprimand('Проверка QA', 'проверка QA');
      player.action = 'none';
      const afterLunch = ensureWeekOutcomesExtension().counts.reprimands;
      const issued = reprimand('Проверка QA', 'проверка QA');
      return { covered, lunch, issued, factsBefore, afterCover, afterLunch, afterIssued: ensureWeekOutcomesExtension().counts.reprimands };
    });
    assert.equal(reprimandCounts.covered, false);
    assert.equal(reprimandCounts.lunch, false);
    assert.equal(reprimandCounts.issued, true);
    assert.equal(reprimandCounts.afterCover, reprimandCounts.factsBefore);
    assert.equal(reprimandCounts.afterLunch, reprimandCounts.factsBefore);
    assert.equal(reprimandCounts.afterIssued, reprimandCounts.factsBefore + 1);

    // Relationship facts use their source event ID and the persistent weekly archive wins over an older shift snapshot.
    await reset(2, 1, 2406);
    const weeklyPersistence = await page.evaluate(() => {
      const first = recordRelationshipEvent('aimashyn', 'help', 'qa24:persist:help');
      const firstCount = ensureWeekOutcomesExtension().counts.helped;
      recordRelationshipEvent('aimashyn', 'help', 'qa24:persist:help');
      const duplicateCount = ensureWeekOutcomesExtension().counts.helped;
      const snapshotSaved = saveProgress().ok;
      recordWeekOutcomeFact('help', 'qa24:persist:second-help');
      return { first: first.ok, firstCount, duplicateCount, snapshotSaved };
    });
    assert.equal(weeklyPersistence.first, true);
    assert.equal(weeklyPersistence.firstCount, 1);
    assert.equal(weeklyPersistence.duplicateCount, 1);
    assert.equal(weeklyPersistence.snapshotSaved, true);
    await page.reload();
    await page.waitForFunction(() => !!window.NP_DEBUG && NP_DEBUG.state.mode === 'playing');
    const restoredOutcomes = await page.evaluate(() => ({
      count: ensureWeekOutcomesExtension().counts.helped,
      sourceIds: ensureWeekOutcomesExtension().appliedFactIds,
    }));
    assert.equal(restoredOutcomes.count, 2);
    assert.ok(restoredOutcomes.sourceIds.includes('qa24:persist:help:week-outcome'));
    assert.ok(restoredOutcomes.sourceIds.includes('qa24:persist:second-help'));

    // The optional secret is available on Monday, offers archive search without fun or hiding, and survives a reload.
    await reset(0, 0, 2407);
    const firstTalk = await page.evaluate(() => {
      const zone = WD.zones.find(item => item.type === 'chat' && item.coworker === 'tigran');
      const tigran = coworkerById('tigran');
      if (!zone || !tigran) throw new Error('Tigran test zone is missing');
      const ghostBefore = { x: tigran.x, y: tigran.y, ghost: tigran.ghost };
      player.x = zone.x + zone.w / 2;
      player.y = zone.y + zone.h / 2;
      const prompt = getActionInfo().prompt;
      interact();
      return { prompt, action: player.action, ghostBefore };
    });
    assert.match(firstTalk.prompt, /поболтать с Тиграном/);
    assert.equal(firstTalk.action, 'chat');
    await page.evaluate(() => NP_DEBUG.skip(6.6));
    const hinted = await page.evaluate(() => ({
      phase: saveExtensions.tigranSecret.phase,
      processed: saveExtensions.tigranSecret.processedEventIds.length,
      tigran: coworkerById('tigran'),
      relationshipIds: ensureRelationshipsExtension().npcIds,
      weekly: ensureWeekOutcomesExtension().counts,
    }));
    assert.equal(hinted.phase, 'hinted');
    assert.equal(hinted.processed, 1);
    assert.equal(hinted.tigran.ghost, true);
    assert.equal(hinted.tigran.x, firstTalk.ghostBefore.x);
    assert.equal(hinted.tigran.y, firstTalk.ghostBefore.y);
    assert.equal(hinted.relationshipIds.includes('tigran'), false);
    assert.equal(hinted.weekly.helped, 0);
    assert.equal(hinted.weekly.betrayed, 0);

    // Repeated talk does not repeat the clue; H still uses the archive as a hiding place.
    await page.evaluate(() => {
      const zone = WD.zones.find(item => item.type === 'chat' && item.coworker === 'tigran');
      coworkerById('tigran').cooldown = 0;
      player.x = zone.x + zone.w / 2;
      player.y = zone.y + zone.h / 2;
      interact();
      NP_DEBUG.skip(6.6);
    });
    const repeatPrompt = await page.evaluate(() => {
      const archive = WD.zones.find(item => item.type === 'archive');
      player.x = archive.x + archive.w / 2;
      player.y = archive.y + archive.h / 2;
      NP_DEBUG.setBoss(850, 470, 'office');
      nextBossCheck = 999;
      return getActionInfo().prompt;
    });
    assert.match(repeatPrompt, /найти старый пропуск/);
    await page.screenshot({ path: path.join(output, '24-archive-search-960x540.png') });
    const rapidRetry = await page.evaluate(() => {
      const archive = WD.zones.find(item => item.type === 'archive');
      player.action = 'none'; player.actionTimer = 0;
      player.x = archive.x + archive.w / 2; player.y = archive.y + archive.h / 2;
      NP_DEBUG.setBoss(850, 470, 'office'); nextBossCheck = 999;
      const started = startTigranArchiveSearch();
      const startId = saveExtensions.tigranSecret.searchEventId;
      const cancelled = cancelTigranArchiveSearch('rapid-retry');
      const restarted = startTigranArchiveSearch();
      return { started, cancelled, restarted, startId, nextId: saveExtensions.tigranSecret.searchEventId, phase: saveExtensions.tigranSecret.phase };
    });
    assert.equal(rapidRetry.started, true);
    assert.equal(rapidRetry.cancelled, true);
    assert.equal(rapidRetry.restarted, true);
    assert.notEqual(rapidRetry.nextId, rapidRetry.startId, 'a same-tick retry gets a fresh idempotency key');
    assert.equal(rapidRetry.phase, 'searching');
    await page.evaluate(() => cancelTigranArchiveSearch('qa-continue'));
    const repeat = await page.evaluate(() => {
      quickHide();
      return { phase: saveExtensions.tigranSecret.phase, action: player.action };
    });
    assert.equal(repeat.phase, 'hinted');
    assert.ok(['cabinet_hide', 'plant_hide'].includes(repeat.action));
    await page.evaluate(() => interact());

    const searchStarted = await page.evaluate(() => {
      const archive = WD.zones.find(item => item.type === 'archive');
      player.action = 'none'; player.actionTimer = 0;
      player.x = archive.x + archive.w / 2;
      player.y = archive.y + archive.h / 2;
      NP_DEBUG.setBoss(850, 470, 'office'); nextBossCheck = 999;
      const beforeFun = fun;
      interact();
      return { phase: saveExtensions.tigranSecret.phase, action: player.action, beforeFun, afterFun: fun };
    });
    assert.equal(searchStarted.phase, 'searching');
    assert.equal(searchStarted.action, 'none', 'searching does not hide or lock movement');
    assert.equal(searchStarted.afterFun, searchStarted.beforeFun);
    const savedSearch = await page.evaluate(() => {
      NP_DEBUG.skip(1);
      const result = saveProgress();
      const snapshot = store.get('currentSave', null);
      return {
        saved: result.ok,
        phase: snapshot.extensions.tigranSecret.phase,
        elapsed: snapshot.extensions.tigranSecret.searchElapsed,
      };
    });
    assert.equal(savedSearch.saved, true);
    assert.equal(savedSearch.phase, 'searching');
    assert.ok(savedSearch.elapsed >= 0.9 && savedSearch.elapsed <= 1.1);
    const pausedSearch = await page.evaluate(() => {
      const before = saveExtensions.tigranSecret.searchElapsed;
      pauseGame();
      NP_DEBUG.skip(1);
      const during = saveExtensions.tigranSecret.searchElapsed;
      pauseGame();
      return { before, during, mode };
    });
    assert.equal(pausedSearch.mode, 'playing');
    assert.equal(pausedSearch.during, pausedSearch.before, 'pause holds the exposed search clock');

    await page.reload();
    await page.waitForFunction(() => !!window.NP_DEBUG && NP_DEBUG.state.mode === 'playing');
    const restoredSearch = await page.evaluate(() => ({
      phase: saveExtensions.tigranSecret.phase,
      elapsed: saveExtensions.tigranSecret.searchElapsed,
      id: saveExtensions.tigranSecret.weekId,
    }));
    assert.equal(restoredSearch.phase, 'searching');
    assert.ok(restoredSearch.elapsed >= savedSearch.elapsed);
    await page.evaluate(() => {
      NP_DEBUG.setBoss(850, 470, 'office'); nextBossCheck = 999;
      quickHide();
    });
    const cancelledByHide = await page.evaluate(() => ({
      phase: store.get('tigranSecret', null).phase,
      action: player.action,
    }));
    assert.equal(cancelledByHide.phase, 'hinted');
    assert.ok(['cabinet_hide', 'plant_hide'].includes(cancelledByHide.action));

    // Restart the search, find the pass in three exposed seconds, then return to Tigran for the one story moment.
    const found = await page.evaluate(() => {
      interact();
      player.action = 'none'; player.actionTimer = 0;
      const archive = WD.zones.find(item => item.type === 'archive');
      player.x = archive.x + archive.w / 2; player.y = archive.y + archive.h / 2;
      interact();
      NP_DEBUG.skip(3.1);
      return { phase: saveExtensions.tigranSecret.phase, fun, phone: perkLines().find(line => line[0] === '📁') };
    });
    assert.equal(found.phase, 'found');
    assert.ok(found.phone && found.phone[1].includes('вернись к Тиграну'));
    const ending = await page.evaluate(() => {
      const zone = WD.zones.find(item => item.type === 'chat' && item.coworker === 'tigran');
      player.action = 'none'; player.actionTimer = 0;
      player.x = zone.x + zone.w / 2;
      player.y = zone.y + zone.h / 2;
      const beforeFun = fun;
      interact();
      const storyAwards = saveExtensions.moments.awards.filter(item => item.id === 'story');
      return {
        phase: saveExtensions.tigranSecret.phase,
        storyAwards: storyAwards.length,
        storySource: storyAwards[0] && storyAwards[0].sourceId,
        groupSmokeAwards: saveExtensions.moments.awards.filter(item => item.id === 'groupSmoke').length,
        funBefore: beforeFun,
        funAfter: fun,
      };
    });
    assert.equal(ending.phase, 'completed');
    assert.equal(ending.storyAwards, 1);
    assert.match(ending.storySource, /tigran-secret/);
    assert.equal(ending.groupSmokeAwards, 0);
    assert.equal(ending.funAfter, ending.funBefore, 'the return ending grants a moment but no fun');
    const repeatedEnding = await page.evaluate(() => {
      const before = saveExtensions.moments.awards.filter(item => item.id === 'story').length;
      returnTigranSecret();
      return { before, after: saveExtensions.moments.awards.filter(item => item.id === 'story').length };
    });
    assert.deepEqual(repeatedEnding, { before: 1, after: 1 });

    // If the yogurt story already owns the shared story moment, Tigran still completes without awarding it twice.
    await reset(1, 0, 2408);
    const yogurtMoment = await page.evaluate(() => {
      const weekId = currentWeekOutcomeId();
      let secret = createTigranSecret(weekId);
      secret = advanceTigranSecret(secret, 'talk_complete', {
        weekId, eventId: 'qa24:yogurt-cap:talk', tigranAvailable: true,
      }).state;
      secret = advanceTigranSecret(secret, 'search_start', {
        weekId, eventId: 'qa24:yogurt-cap:search', playerAtArchive: true,
        bossThreat: false, legalAway: false, shiftEnded: false,
      }).state;
      secret = advanceTigranSecret(secret, 'search_tick', {
        weekId, dt: 3, paused: false, playerAtArchive: true,
        bossThreat: false, legalAway: false, shiftEnded: false,
      }).state;
      const yogurt = awardMoment(createMoments(), 'story', 'qa24:yogurt-story').state;
      saveExtensions.moments = yogurt;
      saveExtensions.tigranSecret = secret;
      store.set('tigranSecret', secret);
      const zone = WD.zones.find(item => item.type === 'chat' && item.coworker === 'tigran');
      player.x = zone.x + zone.w / 2; player.y = zone.y + zone.h / 2;
      const availableBefore = tigranStoryMomentAvailable();
      returnTigranSecret();
      return {
        availableBefore,
        phase: saveExtensions.tigranSecret.phase,
        storyAwards: saveExtensions.moments.awards.filter(item => item.id === 'story').length,
      };
    });
    assert.equal(yogurtMoment.availableBefore, false);
    assert.equal(yogurtMoment.phase, 'completed');
    assert.equal(yogurtMoment.storyAwards, 1);

    // A missing Tigran rejects the final transition without consuming the found state.
    const absent = await page.evaluate(() => {
      let secret = createTigranSecret(currentWeekOutcomeId());
      const weekId = secret.weekId;
      secret = advanceTigranSecret(secret, 'talk_complete', { weekId, eventId: 'qa24:absent:talk', tigranAvailable: true }).state;
      secret = advanceTigranSecret(secret, 'search_start', { weekId, eventId: 'qa24:absent:search', playerAtArchive: true, bossThreat: false, legalAway: false, shiftEnded: false }).state;
      secret = advanceTigranSecret(secret, 'search_tick', { weekId, dt: 3, paused: false, playerAtArchive: true, bossThreat: false, legalAway: false, shiftEnded: false }).state;
      saveExtensions.tigranSecret = secret;
      store.set('tigranSecret', secret);
      const rejected = advanceTigranSecretAdapter('return_talk_complete', 'qa24:absent:return', {
        tigranAvailable: false, storyMomentAvailable: true,
      });
      return { ok: rejected.ok, reason: rejected.reason, phase: saveExtensions.tigranSecret.phase };
    });
    assert.equal(absent.ok, false);
    assert.equal(absent.reason, 'tigran_unavailable');
    assert.equal(absent.phase, 'found');

    const shiftEnd = await page.evaluate(() => {
      const weekId = currentWeekOutcomeId();
      let secret = createTigranSecret(weekId);
      secret = advanceTigranSecret(secret, 'talk_complete', { weekId, eventId: 'qa24:shift-end:talk', tigranAvailable: true }).state;
      secret = advanceTigranSecret(secret, 'search_start', {
        weekId, eventId: 'qa24:shift-end:search', playerAtArchive: true,
        bossThreat: false, legalAway: false, shiftEnded: false,
      }).state;
      saveExtensions.tigranSecret = secret;
      store.set('tigranSecret', secret);
      NP_DEBUG.finish('fired');
      return { mode: NP_DEBUG.state.mode, phase: store.get('tigranSecret', null).phase };
    });
    assert.equal(shiftEnd.mode, 'ended');
    assert.equal(shiftEnd.phase, 'hinted', 'ending the shift cancels search without completing it');

    // Переигровка дня восстанавливает недельные факты из снимка начала дня, как отношения.
    await reset(1, 0, 2409);
    const retry = await page.evaluate(() => {
      const helped = () => (store.get('weekOutcomes', null) || { counts: {} }).counts.helped || 0;
      const help = () => ['aimashyn', 'hlad', 'shurik'].forEach(id =>
        NP_DEBUG.recordRelationshipEvent(id, 'help', `${NP_DEBUG.persistence.shiftId}:qa24-retry:${id}`));
      help();
      const first = helped();
      NP_DEBUG.finish('fired');
      NP_DEBUG.restart(2410);
      const restored = helped();
      help();
      return { first, restored, second: helped() };
    });
    assert.deepEqual(retry, { first: 3, restored: 0, second: 3 }, 'retry day does not accumulate weekly facts');

    // Демо-автопилот не пишет недельные факты в постоянное хранилище.
    await reset(1, 0, 2411);
    const demo = await page.evaluate(() => {
      NP_DEBUG.startAutopilot(2412);
      const demoOn = NP_DEBUG.auto.demo;
      ['aimashyn', 'hlad'].forEach(id =>
        NP_DEBUG.recordRelationshipEvent(id, 'help', `${NP_DEBUG.persistence.shiftId}:qa24-demo:${id}`));
      const inMemory = saveExtensions.weekOutcomes.counts.helped;
      NP_DEBUG.stopAutopilot();
      return { demoOn, inMemory, stored: ((store.get('weekOutcomes', null) || { counts: {} }).counts.helped || 0) };
    });
    assert.deepEqual(demo, { demoOn: true, inMemory: 2, stored: 0 }, 'demo keeps weekly facts in memory only');

    assert.deepEqual(errors, [], `ошибки страницы: ${errors.join('; ')}`);
    process.stdout.write('qa-plan-24: титулы, пиво, выговоры, секрет Тиграна, сохранение/отмена и недельный сброс — OK\n');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

'use strict';
// «Не пались» — взаимодействия по E, достижения.
// Общие переменные и функции объявлены на верхнем уровне и видны из других скриптов игры (без обёртки и модулей).
// Порядок подключения — в index.html.

  // ---------- ВЗАИМОДЕЙСТВИЯ ----------
  const COVER = new Set(['plant_hide', 'cabinet_hide', 'printer_hide']);
  const HIDDEN = new Set(['plant_hide', 'cabinet_hide', 'printer_hide', 'toilet', 'lunch', 'evac']);
  const AWAY = new Set(['toilet', 'lunch', 'evac']); // Быкентия нет в опенспейсе — не рисуем
  const SLACK_BASE = new Set(['smoke', 'youtube', 'fridge', 'chat', 'phone', 'meme', 'yogurt-coffee-gift', 'autoshka-repair']);
  const SLACK = { has: a => SLACK_BASE.has(a) && !(a === 'phone' && phoneSafe > 0) };
  let autoclickerSavePending = false;
  // Склонения имён: родительный, дательный, творительный
  const NAME_CASES = { 'Асель': ['Асель', 'Асель', 'Асель'], 'Сиргей': ['Сиргея', 'Сиргею', 'Сиргеем'] };
  const nameCase = (n, i) => (NAME_CASES[n] ? NAME_CASES[n][i] : n + ['а', 'у', 'ом'][i]);
  const withName = n => nameCase(n, 2);
  function nearestPlant() {
    let best = null;
    for (const p of WD.plants) {
      const d = Math.hypot(player.x - p.x, player.y - p.y);
      if (d < 26 && (!best || d < best.d)) best = { p, d };
    }
    return best && best.p;
  }
  function currentZone() {
    if (player.action === 'work') return WD.zones.find(z => z.id === 'desk');
    const d = WD.playerDesk;
    if (player.x >= d.x - 8 && player.x <= d.x + d.w + 8) {
      if ((player.y >= WD.FLOOR_TOP && player.y <= WD.ROW1_Y + 2) ||
          (player.y >= WD.ROW1_Y + WD.DESK_DEPTH - 2 && player.y <= WD.ROW1_Y + WD.DESK_DEPTH + 28)) {
        return WD.zones.find(z => z.id === 'desk');
      }
    }
    return WD.zones.find(z => rectContains(z, player.x, player.y));
  }
  // «Приспичило»: 2–3 раза за смену надо дойти до синей кабинки
  function updatePee(dt) {
    if (AWAY.has(player.action) && player.action !== 'toilet') return;
    if (!day.peeActive) {
      if (day.peeLeft > 0 && clockMinutes >= day.peeAt && player.action !== 'toilet' && player.action !== 'queue') {
        day.peeActive = true; day.pee = 5; day.peeLeft--;
        day.peeCriticalTold = false;
        say('player', pick(LINES.pee.start), 2.8);
        hint('pee', 'Быкентию приспичило! Дойди до синего биотуалета. На 100% шаг замедлится, кайф начнёт уходить.');
      }
      return;
    }
    if (player.action === 'toilet') return;
    const before = day.pee;
    day.pee = Math.min(100, day.pee + CFG.peeRise * dt * (player.action === 'queue' ? 0.5 : 1) * (player.coffeeBoost > 0 ? 1.3 : 1));
    if (before < 70 && day.pee >= 70) say('player', pick(LINES.pee.urgent), 2.6);
    if (day.pee >= 100) {
      day.pee = 100;
      const drain = player.action === 'queue' ? CFG.peeQueueDrain : CFG.peeCriticalDrain;
      addFun(-drain * dt);
      if (!day.peeCriticalTold) {
        day.peeCriticalTold = true;
        toast(LINES.pee.critical, 3.6);
      }
    }
  }
  function schedulePee() {
    const left = Math.max(1, day.peeLeft);
    day.peeAt = clockMinutes + Math.max(40, (CFG.shiftEnd - 30 - clockMinutes) / left * (0.6 + rand() * 0.6));
  }
  // Идти по точкам пути (навигационный граф обходит мебель); true — дошёл
  function walkPath(o, speed, dt) {
    let step = speed * dt;
    while (o.path && o.path.length && step > 0) {
      const wp = o.path[0], d = dist(o, wp);
      if (d <= step) { o.x = wp.x; o.y = wp.y; o.path.shift(); step -= d; }
      else { o.x += (wp.x - o.x) / d * step; o.y += (wp.y - o.y) / d * step; o.facingX = wp.x < o.x ? -1 : 1; step = 0; }
    }
    return !o.path || !o.path.length;
  }
  function coworkerById(id) { return coworkers.find(c => c.id === id); }

  // Демо-смена ведёт недельные итоги и секрет Тиграна только в памяти и не портит личный прогресс.
  let demoWeekStore = {};
  function weekStoreGet(key, fallback) {
    if (auto.demo && Object.prototype.hasOwnProperty.call(demoWeekStore, key)) return demoWeekStore[key];
    return store.get(key, fallback);
  }
  function weekStoreSet(key, value) {
    if (auto.demo) demoWeekStore[key] = value;
    else store.set(key, value);
  }
  // Снимок недельных итогов на начало дня: переигровка того же дня восстанавливает факты, как отношения из dayStart.
  function prepareWeekOutcomesForShift(loadResult) {
    demoWeekStore = {};
    if (auto.demo || !loadResult || loadResult.status !== 'new' || !weekOutcomeModelAvailable()) return;
    const weekId = currentWeekOutcomeId();
    const saved = store.get('weekOutcomes.dayStart', null);
    if (saved && saved.dayIndex === dayIndex && saved.weekId === weekId) {
      if (saved.weekOutcomes) store.set('weekOutcomes', saved.weekOutcomes);
      if (saved.tigranSecret) store.set('tigranSecret', saved.tigranSecret);
      delete saveExtensions.weekOutcomes;
      delete saveExtensions.tigranSecret;
    } else {
      store.set('weekOutcomes.dayStart', {
        dayIndex, weekId,
        weekOutcomes: ensureWeekOutcomesExtension(),
        tigranSecret: ensureTigranSecretExtension(),
      });
    }
    ensureWeekOutcomesExtension();
    ensureTigranSecretExtension();
  }

  function weekOutcomeModelAvailable() {
    return typeof createWeekOutcomes === 'function' && typeof recordWeekFact === 'function'
      && typeof selectWeekTitle === 'function' && typeof createTigranSecret === 'function'
      && typeof advanceTigranSecret === 'function';
  }
  function isWeeklyModelId(value) {
    return (typeof value === 'string' && !!value) || (Number.isInteger(value) && value >= 0);
  }
  function rememberWeekOutcomeId(weekId) {
    weekStoreSet('weekOutcomeWeekId', weekId);
    const match = typeof weekId === 'string' ? weekId.match(/^week-\d+-(\d+)$/) : null;
    if (!match) return;
    const currentEpoch = weekStoreGet('weekOutcomeEpoch', 0);
    const epoch = Number(match[1]);
    if (!Number.isInteger(currentEpoch) || currentEpoch <= epoch) weekStoreSet('weekOutcomeEpoch', epoch + 1);
  }
  function nextWeekOutcomeId() {
    let epoch = weekStoreGet('weekOutcomeEpoch', 0);
    if (!Number.isInteger(epoch) || epoch < 0) epoch = 0;
    const weekId = `week-${weekNumber}-${epoch}`;
    weekStoreSet('weekOutcomeEpoch', epoch + 1);
    weekStoreSet('weekOutcomeWeekId', weekId);
    return weekId;
  }
  function currentWeekOutcomeId() {
    if (!weekOutcomeModelAvailable()) return null;
    const storedId = weekStoreGet('weekOutcomeWeekId', null);
    if (isWeeklyModelId(storedId)) return storedId;
    const candidates = [
      saveExtensions.weekOutcomes,
      weekStoreGet('weekOutcomes', null),
      saveExtensions.tigranSecret,
      weekStoreGet('tigranSecret', null),
    ];
    const outcome = candidates.find(state => state && isWeeklyModelId(state.weekId) && selectWeekTitle(state).ok);
    const secret = candidates.find(state => state && isWeeklyModelId(state.weekId)
      && advanceTigranSecret(state, 'new_week', { weekId: state.weekId }).ok);
    const weekId = outcome ? outcome.weekId : secret ? secret.weekId : null;
    if (weekId !== null) {
      rememberWeekOutcomeId(weekId);
      return weekId;
    }
    return nextWeekOutcomeId();
  }
  function tigranSecretForWeek(state, weekId) {
    if (!state) return null;
    const result = advanceTigranSecret(state, 'new_week', { weekId });
    return result.ok ? result.state : null;
  }
  function latestTigranSecretState(snapshot, persisted, weekId) {
    const saved = tigranSecretForWeek(snapshot, weekId);
    const stored = tigranSecretForWeek(persisted, weekId);
    if (!saved) return stored;
    if (!stored) return saved;
    if (saved.phase === 'searching' && stored.phase === 'searching') {
      return saved.searchElapsed > stored.searchElapsed ? saved : stored;
    }
    return stored;
  }
  function ensureWeekOutcomesExtension() {
    if (!weekOutcomeModelAvailable()) return null;
    const weekId = currentWeekOutcomeId();
    const candidates = [weekStoreGet('weekOutcomes', null), saveExtensions.weekOutcomes];
    const state = candidates.find(candidate => candidate && candidate.weekId === weekId && selectWeekTitle(candidate).ok)
      || createWeekOutcomes(weekId);
    saveExtensions.weekOutcomes = state;
    delete saveExtensionErrors.weekOutcomes;
    weekStoreSet('weekOutcomes', state);
    return state;
  }
  function ensureTigranSecretExtension() {
    if (!weekOutcomeModelAvailable()) return null;
    const weekId = currentWeekOutcomeId();
    const persisted = weekStoreGet('tigranSecret', null);
    const candidates = [saveExtensions.tigranSecret, persisted];
    let state = latestTigranSecretState(saveExtensions.tigranSecret, persisted, weekId);
    if (!state) {
      const previous = candidates.find(candidate => !!tigranSecretForWeek(candidate, weekId));
      const reset = previous
        ? advanceTigranSecret(previous, 'new_week', { weekId })
        : null;
      state = reset && reset.ok ? reset.state : createTigranSecret(weekId);
      weekStoreSet('tigranSecret', state);
    } else if (!tigranSecretForWeek(persisted, weekId) || persisted.weekId !== weekId || persisted.phase !== state.phase) {
      if (state.phase !== 'searching') weekStoreSet('tigranSecret', state);
    }
    saveExtensions.tigranSecret = state;
    delete saveExtensionErrors.tigranSecret;
    return state;
  }
  function peekTigranSecretExtension() {
    if (!weekOutcomeModelAvailable()) return null;
    const storedId = weekStoreGet('weekOutcomeWeekId', null);
    const weekId = isWeeklyModelId(storedId) ? storedId : null;
    if (weekId !== null) return latestTigranSecretState(saveExtensions.tigranSecret, weekStoreGet('tigranSecret', null), weekId);
    const candidates = [saveExtensions.tigranSecret, weekStoreGet('tigranSecret', null)];
    return candidates.find(state => state && isWeeklyModelId(state.weekId)
      && advanceTigranSecret(state, 'new_week', { weekId: state.weekId }).ok) || null;
  }
  function recordWeekOutcomeFact(kind, eventId, value) {
    const state = ensureWeekOutcomesExtension();
    if (!state || typeof eventId !== 'string' || !eventId) return { ok: false, state, effects: [], reason: 'week_outcomes_unavailable' };
    const fact = { eventId, weekId: state.weekId, kind };
    if (value !== undefined) fact.value = value;
    const result = recordWeekFact(state, fact);
    if (result.ok) {
      saveExtensions.weekOutcomes = result.state;
      weekStoreSet('weekOutcomes', result.state);
    }
    return result;
  }
  function recordWeekRelationshipFact(kind, eventId) {
    const factKind = kind === 'help' ? 'help' : kind === 'betrayal' ? 'betrayal' : null;
    return factKind && typeof eventId === 'string'
      ? recordWeekOutcomeFact(factKind, `${eventId}:week-outcome`)
      : null;
  }
  function recordWeekReprimandFact() {
    const state = ensureWeekOutcomesExtension();
    if (!state) return null;
    return recordWeekOutcomeFact('reprimand', `${shiftId}:week-reprimand:${state.counts.reprimands + 1}`);
  }
  function createNextWeeklyOutcomeStates() {
    if (!weekOutcomeModelAvailable()) return false;
    const previousSecret = ensureTigranSecretExtension();
    const weekId = nextWeekOutcomeId();
    saveExtensions.weekOutcomes = createWeekOutcomes(weekId);
    weekStoreSet('weekOutcomes', saveExtensions.weekOutcomes);
    const reset = advanceTigranSecret(previousSecret, 'new_week', { weekId });
    saveExtensions.tigranSecret = reset.ok ? reset.state : createTigranSecret(weekId);
    weekStoreSet('tigranSecret', saveExtensions.tigranSecret);
    return true;
  }
  function tigranSecretLegalAway() {
    return AWAY.has(player.action) || player.action === 'daily' || !!eventIs('drill');
  }
  function tigranSecretBossThreat() {
    return !boss || boss.seesPlayer || ['inspect', 'lecture', 'look', 'follow'].includes(boss.state)
      || dist(boss, player) < 105;
  }
  function tigranSecretContext(eventId, overrides = {}) {
    const zone = currentZone();
    return Object.assign({
      weekId: currentWeekOutcomeId(),
      eventId,
      tigranAvailable: (() => {
        const tigran = coworkerById('tigran');
        return !!tigran && !tigran.away && !tigran.remote;
      })(),
      playerAtArchive: !!zone && zone.type === 'archive',
      bossThreat: tigranSecretBossThreat(),
      legalAway: tigranSecretLegalAway(),
      shiftEnded: mode === 'ended',
      paused: mode === 'paused',
      dt: 0,
    }, overrides);
  }
  function tigranSecretEventId(action) {
    const secret = peekTigranSecretExtension();
    const transitionIndex = secret && Array.isArray(secret.processedEventIds) ? secret.processedEventIds.length : 0;
    return `${shiftId}:tigran-secret:${action}:${Math.floor(shiftTime * 1000)}:${transitionIndex}`;
  }
  function tigranStoryMomentAvailable() {
    const moments = ensureMomentsExtension();
    return !moments.awards.some(item => item.id === 'story')
      && summarizeMoments(moments).awarded + 3 <= MOMENTS_CAP;
  }
  function commitTigranSecretTransition(result, persist = true) {
    if (!result || !result.ok) return false;
    let moments = null;
    const messages = [];
    for (const effect of result.effects || []) {
      if (effect.type === 'message') messages.push(effect);
      else if (effect.type === 'awardMoment') {
        moments = moments || ensureMomentsExtension();
        const awarded = awardMoment(moments, effect.momentId, effect.sourceId);
        if (!awarded.ok) return false;
        moments = awarded.state;
      } else return false;
    }
    saveExtensions.tigranSecret = result.state;
    delete saveExtensionErrors.tigranSecret;
    if (moments) saveExtensions.moments = moments;
    if (persist) weekStoreSet('tigranSecret', result.state);
    for (const effect of messages) {
      const key = effect.lineId === 'tigran.secret_hint' ? 'hint'
        : effect.lineId === 'tigran.secret_found' ? 'found'
          : effect.lineId === 'tigran.secret_ending' ? 'ending' : null;
      const message = key && LINES.tigranSecret && LINES.tigranSecret[key];
      if (!message) continue;
      say(effect.ownerId, message, 3.4);
      addLog(message, 'good');
    }
    return true;
  }
  function advanceTigranSecretAdapter(action, eventId, overrides = {}) {
    const state = ensureTigranSecretExtension();
    if (!state) return { ok: false, state: null, effects: [], reason: 'secret_unavailable' };
    const result = advanceTigranSecret(state, action, tigranSecretContext(eventId, overrides));
    const persist = action !== 'search_tick' || result.state && result.state.phase !== state.phase;
    if (result.ok && !commitTigranSecretTransition(result, persist)) {
      return { ok: false, state, effects: [], reason: 'effect_application_failed' };
    }
    return result;
  }
  function tigranArchiveSearchAvailable() {
    const state = peekTigranSecretExtension();
    const zone = currentZone();
    return !!state && state.phase === 'hinted' && mode === 'playing'
      && !!zone && zone.type === 'archive' && !tigranSecretBossThreat() && !tigranSecretLegalAway();
  }
  function startTigranArchiveSearch() {
    if (!tigranArchiveSearchAvailable()) return false;
    const result = advanceTigranSecretAdapter('search_start', tigranSecretEventId('search-start'));
    if (!result.ok) {
      toast('Сейчас искать нельзя. Дождись, пока Д.Н. отвлечётся.', 2.2);
      return false;
    }
    say('player', 'Тут всё старше внутреннего портала. Посмотрим…', 2.6);
    return true;
  }
  function cancelTigranArchiveSearch(reason = 'cancel') {
    const state = peekTigranSecretExtension();
    if (!state || state.phase !== 'searching') return false;
    const result = advanceTigranSecretAdapter('search_cancel', tigranSecretEventId(`search-${reason}`));
    return !!result.ok;
  }
  function tickTigranSecretSearch(dt) {
    const state = peekTigranSecretExtension();
    if (!state || state.phase !== 'searching' || mode !== 'playing') return false;
    return advanceTigranSecretAdapter('search_tick', null, { dt, paused: mode !== 'playing' });
  }
  function finishTigranConversation(coworker) {
    if (!coworker || coworker.id !== 'tigran') return false;
    const state = ensureTigranSecretExtension();
    if (!state) return false;
    const action = state.phase === 'found' ? 'return_talk_complete' : 'talk_complete';
    const context = action === 'return_talk_complete'
      ? { storyMomentAvailable: tigranStoryMomentAvailable() }
      : {};
    const result = advanceTigranSecretAdapter(action, tigranSecretEventId(action), context);
    return !!result.ok;
  }
  function returnTigranSecret() {
    const tigran = coworkerById('tigran');
    const result = advanceTigranSecretAdapter('return_talk_complete', tigranSecretEventId('return'), {
      tigranAvailable: !!tigran && !tigran.away && !tigran.remote,
      storyMomentAvailable: tigranStoryMomentAvailable(),
    });
    if (!result.ok) return false;
    return true;
  }
  function tickTigranSecretSearchAtShiftEnd() {
    const state = peekTigranSecretExtension();
    if (!state || state.phase !== 'searching') return false;
    return cancelTigranArchiveSearch('shift-end');
  }
  function archiveHide() {
    player.x = 70; player.y = Math.min(Math.max(player.y, 380), 470);
    startAction('cabinet_hide', 0);
    playSound('hide');
    toast('Затаился между шкафами. Папки закрывают с головой.', 2.2);
  }

  const BOSS_DISTRACTION_STATES = new Set(['distractionWalk', 'distractionWait']);
  function ensureDistractionsExtension() {
    const current = saveExtensions.distractions;
    if (!distractionStateIsValid(current) || (current.shiftId && current.shiftId !== shiftId)) {
      saveExtensions.distractions = createDistractions();
    } else if (current.shiftId === null) {
      saveExtensions.distractions = { ...current, shiftId };
    }
    return saveExtensions.distractions;
  }
  function commitDistractionsTransition(result) {
    if (!result || !result.ok) return false;
    saveExtensions.distractions = result.state;
    delete saveExtensionErrors.distractions;
    return true;
  }
  function isBossDistractionState(state = boss.state) { return BOSS_DISTRACTION_STATES.has(state); }
  function bossDistractionTarget(kind) {
    if (kind === 'printer') return { id: 'printer', x: 470, y: 452, desc: 'к ксероксу' };
    if (kind === 'colleague') {
      const bleb = coworkerById('bleb');
      if (!bleb || bleb.away || bleb.remote || !unlocked('coworkers')) return null;
      return { id: 'bleb', x: bleb.desk.seatX, y: bleb.desk.y + WD.DESK_DEPTH + 16, desc: 'к Блебу' };
    }
    return null;
  }
  function bossDistractionPath(target) {
    if (!target || blocked(target.x, target.y, 6)) return null;
    const path = findPath(boss, target);
    if (!Array.isArray(path) || (!path.length && dist(boss, target) > 3)) return null;
    return path;
  }
  function bossDistractionContext(routeAvailable) {
    return {
      shiftId,
      bossState: boss.state,
      paused: mode === 'paused',
      legalAway: AWAY.has(player.action) || !!eventIs('drill'),
      shiftEnded: mode === 'ended' || clockMinutes >= CFG.shiftEnd,
      routeAvailable,
    };
  }
  function canStartBossDistraction(kind) {
    const state = ensureDistractionsExtension();
    if (mode !== 'playing') return { ok: false, reason: mode === 'paused' ? 'paused' : 'shift_ended' };
    if (player.action !== 'none' || (choice && choice.asked && !choice.done) || auto.on) return { ok: false, reason: 'busy' };
    const target = bossDistractionTarget(kind);
    const path = bossDistractionPath(target);
    const priorityBlocksRoute = eventIs('call') || eventIs('drill') || eventIs('standup') || day.bossLunch ||
      clockMinutes >= CFG.lunchOpen + 12 || (today().bossLeaves && clockMinutes >= today().bossLeaves);
    const routeAvailable = !!path && !priorityBlocksRoute;
    const context = bossDistractionContext(routeAvailable);
    const result = canDistract(state, context, kind);
    if (!result.ok) return { ok: false, reason: result.reason, state, context, target, path };
    return { ok: true, reason: null, state, context, target, path };
  }
  function distractionReasonText(reason, kind) {
    const state = saveExtensions.distractions;
    const seconds = state && Number.isFinite(state.cooldownRemaining) ? Math.ceil(state.cooldownRemaining) : 0;
    const messages = {
      busy: 'Папка уже готовится или действует',
      paused: 'Игра на паузе',
      shift_ended: 'Смена уже закончилась',
      legal_away: 'Во время обеда и эвакуации нельзя отвлекать Д.Н.',
      boss_unavailable: 'Д.Н. занят и не может пойти',
      route_unavailable: 'Сейчас нет безопасного маршрута',
      limit_reached: 'В этой смене уже было два отвлечения',
      kind_used: kind === 'printer' ? 'К ксероксу уже отвлекали сегодня' : 'Блеб уже помогал сегодня',
      cooldown: `Д.Н. нужно подождать ещё ${seconds} с`,
      npc_unavailable: 'Блеба сейчас нет в офисе',
      favor_unavailable: 'Нужен неиспользованный кредит помощи Блеба',
    };
    return messages[reason] || 'Сейчас отвлечь Д.Н. нельзя';
  }
  function finishDistractionMoment() {
    const current = ensureDistractionsExtension();
    if (!current.active || current.active.phase !== 'occupied') return false;
    const result = finishDistraction(current, 'rest_completed');
    if (!commitDistractionsTransition(result)) return false;
    for (const effect of result.effects || []) {
      if (effect.type !== 'awardMoment' || effect.momentId !== 'distraction') continue;
      const moments = awardMoment(ensureMomentsExtension(), effect.momentId, effect.sourceId);
      if (moments.ok) saveExtensions.moments = moments.state;
      recordWeekOutcomeFact('distraction', `${effect.sourceId}:week-outcome`);
    }
    return true;
  }
  function beginBossDistraction(kind) {
    const access = canStartBossDistraction(kind);
    if (!access.ok) return { ok: false, reason: access.reason };
    const target = { id: access.target.id, x: access.target.x, y: access.target.y };
    const result = beginDistraction(access.state, access.context, kind, target);
    if (!result.ok) return { ok: false, reason: result.reason };
    let favor = null;
    if (kind === 'colleague') {
      favor = consumeFavor(ensureRelationshipsExtension(), 'bleb', dayIndex);
      if (!favor.ok) return { ok: false, reason: favor.reason || 'favor_unavailable' };
    }
    if (!commitDistractionsTransition(result)) return { ok: false, reason: 'state_invalid' };
    if (favor) saveExtensions.relationships = favor.state;
    boss.state = 'distractionWalk';
    boss.path = access.path.slice();
    boss.spotDesc = access.target.desc;
    boss.warned = false;
    boss.silentCheck = false;
    say('player', pick(kind === 'printer' ? LINES.distraction.printer : LINES.distraction.bleb), 2.6);
    addLog(kind === 'printer' ? 'Быкентий готовит приманку у ксерокса. Д.Н. может её заметить.' : 'Блеб отвлечёт Д.Н. на короткое время.', 'info');
    playSound('click');
    return { ok: true, reason: null };
  }
  function interruptBossDistraction(reason = 'interrupted', returnBoss = false) {
    const current = ensureDistractionsExtension();
    if (!current.active) return false;
    const wasInDiversion = isBossDistractionState();
    const result = finishDistraction(current, reason === 'cancel' ? 'cancel' : 'interrupted');
    if (!commitDistractionsTransition(result)) return false;
    if (wasInDiversion) {
      nextBossCheck = Math.max(nextBossCheck, 4);
      if (returnBoss && mode === 'playing') bossGoTo(WD.bossHome, 'return', 'кабинет');
    }
    return true;
  }
  function updateBossDistraction(dt) {
    const current = ensureDistractionsExtension();
    if (!current.active) {
      if (isBossDistractionState()) {
        bossGoTo(WD.bossHome, 'return', 'кабинет');
        nextBossCheck = Math.max(nextBossCheck, 4);
      }
      const cooled = tickDistraction(current, dt, { paused: mode !== 'playing' });
      commitDistractionsTransition(cooled);
      return;
    }
    if (mode === 'paused') {
      const paused = tickDistraction(current, dt, { paused: true, arrived: boss.state === 'distractionWait' });
      commitDistractionsTransition(paused);
      return;
    }
    if (mode !== 'playing' || clockMinutes >= CFG.shiftEnd) {
      interruptBossDistraction('interrupted');
      return;
    }
    const active = current.active;
    if (active.phase === 'walking') {
      if (!['distractionWalk', 'distractionWait'].includes(boss.state)) {
        interruptBossDistraction('interrupted');
        return;
      }
      const target = active.target;
      const closeEnough = dist(boss, target) <= 3;
      if (boss.state === 'distractionWalk' && (!Array.isArray(boss.path) || !boss.path.length) && !closeEnough) {
        const path = bossDistractionPath(target);
        if (!path || !path.length) {
          interruptBossDistraction('interrupted', true);
          return;
        }
        boss.path = path;
      }
      const arrived = boss.state === 'distractionWait' || closeEnough;
      if (arrived) { boss.state = 'distractionWait'; boss.moving = false; }
      const result = tickDistraction(current, dt, { paused: false, arrived });
      if (!commitDistractionsTransition(result)) return;
      if (result.state.active && result.state.active.phase === 'occupied') {
        say('boss', pick(LINES.distraction.occupied), 2.4);
      } else if (!result.state.active && result.state.lastOutcome === 'walking_timeout') {
        bossGoTo(WD.bossHome, 'return', 'кабинет');
        nextBossCheck = Math.max(nextBossCheck, 4);
        say('boss', pick(LINES.distraction.failed), 2.4);
      }
      return;
    }
    if (boss.state !== 'distractionWait') {
      interruptBossDistraction('interrupted');
      return;
    }
    const result = tickDistraction(current, dt, { paused: false });
    if (!commitDistractionsTransition(result)) return;
    if (!result.state.active && result.state.lastOutcome === 'done') {
      bossGoTo(WD.bossHome, 'return', 'кабинет');
      nextBossCheck = Math.max(nextBossCheck, 4);
      say('boss', pick(LINES.distraction.finished), 2.4);
    }
  }
  function startPrinterMeme() {
    startAction('printer', 3.5);
    playSound('click');
    say('player', pick(LINES.thoughts.printer), 3);
    fun += 3;
    addWork(2);
  }
  function startPrinterDistractionPrep() {
    const access = canStartBossDistraction('printer');
    if (!access.ok) { toast(distractionReasonText(access.reason, 'printer'), 2.2); return false; }
    startAction('printer-distraction-prep', 2);
    playSound('click');
    say('player', pick(LINES.distraction.prep), 2.4);
    return true;
  }

  let disguisePreparationCompletedPending = false;
  function ensureDisguiseExtension() {
    const current = saveExtensions.disguise;
    if (!disguiseStateIsValid(current) || (current.shiftId && current.shiftId !== shiftId)) {
      saveExtensions.disguise = createDisguise();
      saveExtensions.disguise.folderQuestionSourceId = null;
      if (current) saveExtensionErrors.disguise = 'state_invalid';
    } else if (current.shiftId === null || typeof current.folderQuestionSourceId !== 'string') {
      saveExtensions.disguise = { ...current, shiftId: current.shiftId || shiftId, folderQuestionSourceId: null };
    }
    return saveExtensions.disguise;
  }
  function commitDisguiseTransition(result, previous = saveExtensions.disguise) {
    if (!result || !result.ok) return false;
    const warningSourceId = previous && typeof previous.folderQuestionSourceId === 'string'
      ? previous.folderQuestionSourceId : null;
    saveExtensions.disguise = { ...result.state, folderQuestionSourceId: warningSourceId };
    delete saveExtensionErrors.disguise;
    return true;
  }
  function disguiseStartContext(action = player.action) {
    return {
      shiftId,
      printerAvailable: !(eventIs('jam') && !officeEvent.used),
      action,
      paused: mode !== 'playing',
      shiftEnded: mode === 'ended' || clockMinutes >= CFG.shiftEnd,
    };
  }
  function canStartDisguisePrep() {
    const state = ensureDisguiseExtension();
    const context = disguiseStartContext();
    const result = beginDisguise(state, context);
    return { ok: result.ok, reason: result.reason, state, context };
  }
  function disguiseReasonText(reason) {
    return ({
      already_used: 'Папку уже брали сегодня',
      printer_unavailable: 'Сначала почини зажёванную бумагу',
      busy: 'Сначала закончи текущее действие',
      action_busy: 'Сначала закончи текущее действие',
      paused: 'Игра на паузе',
      shift_ended: 'Смена уже закончилась',
      state_invalid: 'Папку сейчас не взять',
    })[reason] || 'Папку сейчас не взять';
  }
  function startDisguisePrep() {
    const access = canStartDisguisePrep();
    if (!access.ok) { toast(disguiseReasonText(access.reason), 2.2); return false; }
    const result = beginDisguise(access.state, access.context);
    if (!commitDisguiseTransition(result, access.state)) {
      toast(disguiseReasonText(result.reason), 2.2);
      return false;
    }
    disguisePreparationCompletedPending = false;
    startAction('takeFolder', 2);
    say('player', pick(LINES.disguise.prep), 2.4);
    playSound('click');
    return true;
  }
  function tickDisguiseAdapter(dt) {
    const current = ensureDisguiseExtension();
    if (!current.active) { disguisePreparationCompletedPending = false; return false; }
    if (mode === 'ended' || clockMinutes >= CFG.shiftEnd) {
      const ended = cancelDisguise(current, 'shift_ended');
      disguisePreparationCompletedPending = false;
      return commitDisguiseTransition(ended, current);
    }
    const wasPreparing = current.active.phase === 'preparing';
    const action = wasPreparing
      ? (player.action === 'takeFolder' || disguisePreparationCompletedPending ? 'takeFolder' : player.action)
      : (SLACK.has(player.action) ? 'rest' : player.action);
    const result = tickDisguise(current, dt, {
      action,
      paused: mode !== 'playing',
      shiftEnded: mode === 'ended' || clockMinutes >= CFG.shiftEnd,
    });
    disguisePreparationCompletedPending = false;
    if (!commitDisguiseTransition(result, current)) return false;
    if (wasPreparing && result.state.active && result.state.active.phase === 'active') {
      say('player', pick(LINES.disguise.ready), 2.8);
      hint('disguise', 'Папка помогает пройти во время рейда, только пока ты движешься. При остановке и рядом с Д.Н. она не прикрывает.');
      addLog('Быкентий взял папку. Во время рейда она прикроет только на ходу и не рядом с Д.Н.', 'good');
    }
    return true;
  }
  function disguiseCoverStatus() {
    return canDisguiseCover(ensureDisguiseExtension(), {
      moving: !!player.moving,
      action: player.action,
      bossDistance: dist(boss, player),
      isRaid: boss.state === 'inspect',
      paused: mode !== 'playing',
      shiftEnded: mode === 'ended' || clockMinutes >= CFG.shiftEnd,
    });
  }
  function disguiseFolderHeld() {
    const state = ensureDisguiseExtension();
    return !!(state.active && state.active.phase === 'active');
  }
  function noteBossDisguiseQuestion() {
    const state = ensureDisguiseExtension();
    const active = state.active;
    if (!active || active.phase !== 'active' || dist(boss, player) > 34 || state.folderQuestionSourceId === active.sourceId) return false;
    state.folderQuestionSourceId = active.sourceId;
    say('boss', pick(LINES.disguise.bossQuestion), 2.6);
    return true;
  }

  function requestFavor(npcId, kind) {
    if (!RELATIONSHIP_NPC_IDS.includes(npcId)) return { ok: false, reason: 'unknown_npc' };
    if (typeof kind !== 'string' || !kind.trim()) return { ok: false, reason: 'invalid_favor_kind' };
    const coworker = coworkerById(npcId);
    if (!coworker || coworker.away || coworker.remote) return { ok: false, reason: 'npc_unavailable' };
    if (!unlocked('coworkers')) return { ok: false, reason: 'mechanic_locked' };
    if (player.action !== 'none' || actionChoiceState || (choice && choice.asked && !choice.done)
      || coworker.cooldown > 0 || (coworker.slack && coworker.slackTimer > 0)) {
      return { ok: false, reason: 'busy' };
    }
    const eligibility = canRequestFavor(ensureRelationshipsExtension(), npcId, dayIndex);
    if (!eligibility.ok) return { ok: false, reason: eligibility.reason };
    if (!eligibility.canRequest) return { ok: false, reason: eligibility.reason || 'favor_unavailable' };
    if (npcId === 'bleb' && kind === 'distraction') {
      const begin = beginBossDistraction('colleague');
      if (!begin.ok) return begin;
      say('bleb', pick(LINES.distraction.blebStarted), 2.8, '#9fe0b0');
      playSound('success');
      return begin;
    }
    return { ok: false, reason: 'unavailable' };
  }

  function getActionInfo() {
    if (nudge && player.action === 'work') return { prompt: 'Блеб зовёт посмотреть мем: E — глянуть (кайф, палево) · не отвечать — обидится', target: 'desk' };
    if (player.action === 'plant_hide') return { prompt: 'E / H — вылезти из листвы', target: player.hideSpot };
    if (player.action === 'cabinet_hide') return { prompt: 'E / H — выйти из-за шкафов', target: 'archive' };
    if (player.action === 'printer_hide') return { prompt: 'E / H — вылезти из-за ксерокса', target: 'printer' };
    if (player.action === 'chat') return { prompt: 'Болтаете… (шаг — прервать)', target: `chat_${player.chatWith}` };
    if (player.action === 'autoshka-repair') return { prompt: 'Чинишь автошку у Сиргея… (шаг — прервать)', target: 'chat_sirgey' };
    if (player.action === 'printer-distraction-prep') return { prompt: 'Готовишь приманку у ксерокса…', target: 'printer' };
    if (player.action === 'takeFolder') return { prompt: 'Берёшь папку…', target: 'printer' };
    if (player.action === 'yogurt-coffee-gift') return { prompt: 'Отдаёшь Хладу свежий кофе…', target: 'chat_hlad' };
    if (player.action === 'queue') return { prompt: `Очередь в биотуалет: впереди ${day.queue} чел. (шаг — потерять место)`, target: 'toilet' };
    if (player.action === 'toilet') return { prompt: 'В синей кабинке. Единственное место без Д.Н.', target: 'toilet' };
    if (player.action === 'lunch') return { prompt: day.vilka ? 'Обед в «Вилке»: стейк, медиум, счастье…' : 'Обед в «Мюнхене»: жуёшь хрючево дня…', target: 'exit' };
    if (player.action === 'evac') return { prompt: 'Стоишь на улице с коллегами. Свежий воздух!', target: 'exit' };
    if (player.action === 'standup') return { prompt: 'Летучка: киваешь с умным видом…', target: 'standup' };
    const plant = nearestPlant();
    if (plant) return { prompt: `E / H — спрятаться: ${plant.label}`, target: plant.id, plant };
    if ((eventIs('food') || eventIs('bday')) && !officeEvent.used && rectContains(FEAST_ZONE, player.x, player.y)) {
      return { prompt: eventIs('bday') ? 'E — кусок торта со сбора (+4 кайфа, деньги не вернуть)' : `E — урвать ${officeEvent.food.name} (+10 кайфа, нервы в норме)`, target: 'feast', zone: FEAST_ZONE };
    }
    const z = currentZone();
    if (!z) return null;
    const yogurt = yogurtStoryModuleAvailable() ? ensureYogurtExtension() : null;
    const prompts = {
      desk: player.action === 'work' ? 'E — встать из-за стола'
        : (autoclickerCanOfferDeskChoice() ? 'E — выбрать: Excel или автокликер' : 'E — сесть за стол и открыть Excel'),
      coffee: day.coffeeJammed ? 'E — очистить кофемашину от жмыха (+3 KPI)'
        : ((day.coffeeQueueTimer || 0) > 0 ? `Очередь у кофемашины (~${Math.ceil(day.coffeeQueueTimer)} с)`
        : (yogurt && yogurt.pendingCoffee ? 'E — отменить варку кофе для Хлада'
        : (yogurt && yogurt.status === 'discovered' ? 'E — сварить кофе для Хлада (без кайфа и ускорения)'
        : (player.coffeeBoost > 0 ? 'E — ещё эспрессо (кофеин не кончился)' : 'E — сварить эспрессо (+35% к скорости)')))),
      fridge: 'E — выбрать перекус в холодильнике',
      water: (day.waterCups || 0) <= 0 ? `Кулер пуст — ждём доставку (~${Math.ceil(day.waterRecharge || 30)} мин.)`
        : `E — налить воды из кулера (${day.waterCups || 4}/4)`,
      smoke: player.action === 'smoke' ? 'E — потушить сигарету' : 'E — перекур с видом на горы',
      archive: 'E / H — затаиться за шкафами',
      printer: eventIs('jam') && !officeEvent.used ? 'E — вытащить зажёванную бумагу (+9 к плану) · H — спрятаться' : 'E — выбрать мем, приманку или папку · H — спрятаться за ксероксом',
      server: player.action === 'youtube' ? 'E — закрыть вкладку' : (eventIs('internet') ? 'Интернета нет. Только Excel, только хардкор.' : 'E — YouTube на гигабитном канале'),
      exit: exitPrompt(),
      toilet: day.peeActive ? 'E — СРОЧНО в синюю кабинку! 🚽' : day.toiletCd > 0 ? `Биотуалет: пока не хочется (${Math.ceil(day.toiletCd)} с)` : 'E — встать в очередь в синюю кабинку',
      complain: eventIs('heat') || eventIs('noise')
        ? (boss.state === 'office' ? `E — пожаловаться Д.Н. на ${eventIs('heat') ? 'жару' : 'шум'}` : 'Д.Н. нет в кабинете — жаловаться некому')
        : 'Дверь Д.Н. Стучать без повода — плохая идея.',
      standup: eventIs('standup') ? 'E — встать на летучку и кивать' : 'Доска: «ПЛАН НА КВАРТАЛ: ВЫЖИТЬ»',
    };
    if (z.type === 'archive') {
      const secret = peekTigranSecretExtension();
      if (secret && secret.phase === 'searching') {
        return { prompt: 'Ищешь старый пропуск… 3 с · H — укрыться', target: z.id, zone: z };
      }
      if (secret && secret.phase === 'hinted' && tigranArchiveSearchAvailable()) {
        return { prompt: 'E — найти старый пропуск (3 с, без кайфа) · H — спрятаться', target: z.id, zone: z };
      }
    }
    if (z.type === 'chat') {
      const c = coworkerById(z.coworker);
      if (c.away) return { prompt: c.remote ? `${c.name}: на удалёнке до четверга` : `${c.name}: место пустое — ушёл(ла)`, target: z.id, zone: z };
      if (!unlocked('coworkers') && c.id !== 'tigran') return { prompt: `${c.name}: «Понедельник, не до болтовни». Коллеги — со вторника`, target: z.id, zone: z };
      if (c.id === 'tigran' && peekTigranSecretExtension()?.phase === 'found') {
        return { prompt: 'E — отдать Тиграну старый пропуск', target: z.id, zone: z };
      }
      if (c.id === 'sirgey' && eventIs('autoshka') && autoshkaModuleAvailable()) {
        if (c.remote) return { prompt: 'Сиргей на удалёнке — помочь с автошкой некому', target: z.id, zone: z };
        const story = autoshkaStateForActiveEvent();
        const prompt = story && story.status === 'completed'
          ? 'Автошка уже получила помощь'
          : story && story.status === 'repairing'
            ? 'Помогаешь Сиргею чинить автошку…'
            : 'E — помочь Сиргею с автошкой или оставить Д.Н. разбираться';
        return { prompt, target: z.id, zone: z };
      }
      if (c.id === 'hlad' && yogurt && yogurt.status === 'discovered') {
        const prompt = yogurt.resolution === 'admit'
          ? (yogurt.coffeeCompletedAfterDiscovery ? 'E — отдать Хладу свежий кофе (2 с)' : 'Хлад ждёт кофе, сваренный после пропажи')
          : (yogurt.resolution === 'silent' ? 'Хлад ждёт до 17:00' : 'E — ответить Хладу о пропавшем йогурте');
        return { prompt, target: z.id, zone: z };
      }
      return { prompt: c.cooldown > 0 ? `${c.name} занят(а) · ещё ${Math.ceil(c.cooldown)} с` : `E — поболтать с ${withName(c.name)}`, target: z.id, zone: z };
    }
    return { prompt: prompts[z.type], target: z.id, zone: z };
  }

  // Очередь в биотуалет: 0 — первый у двери, дальше вправо вдоль южной стены
  const queueSlot = i => ({ x: WD.toiletDoor.x + 26 + i * 17, y: WD.toiletDoor.y });
  function exitPrompt() {
    if (day.beer) return 'E — в «Мюнхен» на пятничное пиво 🍺 (закончить неделю)';
    if (eventIs('drill')) return 'E — эвакуироваться по тревоге';
    if (canLunch()) return day.vilka ? 'E — на стейки в «Вилку» 🥩 (час, Д.Н. не тронет)' : 'E — на обед в «Мюнхен» (час, Д.Н. не тронет). ЖУКИ КАЛОЕДЫ!';
    if (day.fed) return 'Уже пообедал. Хрючево переваривается.';
    if (clockMinutes < CFG.lunchOpen) return 'Выход на лестницу. Обед — с 12:30 до 14:00, раньше ни шагу.';
    return 'Выход на лестницу. Уйти на обед можно было до 14:00, теперь до 19:30 ни шагу.';
  }
  function recordVarietyCompletion(activityId) {
    if (shiftRulesetId !== OFFICE_STORIES_RULESET_ID) return null;
    const sourceId = `${shiftId}:${activityId}:${Math.round(shiftTime * 1000)}`;
    const result = awardMoment(ensureMomentsExtension(), 'variety', sourceId, {
      activityId, active: false, completed: true, paused: false,
    });
    if (result.ok) saveExtensions.moments = result.state;
    return result;
  }
  function tickPhoneMoment(dt) {
    if (shiftRulesetId !== OFFICE_STORIES_RULESET_ID) return;
    const state = ensureMomentsExtension();
    const episode = state.variety && state.variety.phoneEpisode;
    const sourceId = episode && typeof episode.sourceId === 'string'
      ? episode.sourceId
      : `${shiftId}:phone:${Math.floor(shiftTime * 1000)}`;
    const result = awardMoment(state, 'variety', sourceId, {
      activityId: 'phone', active: true, completed: false, paused: false, dt,
    });
    if (result.ok) saveExtensions.moments = result.state;
  }
  function finishPhoneMoment(allowCompletion = true) {
    if (shiftRulesetId !== OFFICE_STORIES_RULESET_ID) return null;
    const state = ensureMomentsExtension();
    const episode = state.variety && state.variety.phoneEpisode;
    const sourceId = episode && typeof episode.sourceId === 'string'
      ? episode.sourceId
      : `${shiftId}:phone:${Math.floor(shiftTime * 1000)}`;
    const completed = !!allowCompletion && !!episode && Number.isFinite(episode.seconds) && episode.seconds >= 6;
    const result = awardMoment(state, 'variety', sourceId, {
      activityId: 'phone', active: false, completed, paused: false,
    });
    if (result.ok) saveExtensions.moments = result.state;
    if (completed) finishDistractionMoment();
    return result;
  }
  function startAction(action, seconds) {
    if (player.action === 'autoclicker-install' && action !== 'autoclicker-install') endAction('cancel');
    if (player.action === 'coffee' && action !== 'coffee' && saveExtensions.yogurt && saveExtensions.yogurt.pendingCoffee) {
      endAction('cancel');
    }
    if (player.action === 'takeFolder' && action !== 'takeFolder') endAction('cancel');
    // Бесконечно сидеть в кустах нельзя: после «хвостик торчит» укрытия недоступны на время
    if (COVER.has(action) && day.hideCd > 0) { say('player', `Фикус ещё помнит мой хвостик… (${Math.ceil(day.hideCd)} с)`, 2); player.hideSpot = null; return; }
    if (COVER.has(action)) player.hideT = 0;
    if (SLACK_BASE.has(action) && action !== 'phone') hint('slack', 'Это палево: если Д.Н. (или камера СБ) увидит — растёт подозрение. Следи за его конусом и радаром справа вверху.');
    if (action === 'phone') hint('phone', coarsePointer ? 'Телефон — тоже палево, но можно ходить. 📱 — убрать.' : 'Телефон — тоже палево, но можно ходить. Tab / Q — убрать.');
    player.action = action;
    player.actionTimer = seconds;
    player.actionTotal = seconds;
  }
  function ensureActivitiesExtension() {
    const current = saveExtensions.activities;
    if (current && activitiesStateIsValid(current) && (!current.shiftId || current.shiftId === shiftId)) return current;
    const next = createActivities();
    next.smokePrompted = false;
    saveExtensions.activities = next;
    if (current) saveExtensionErrors.activities = 'state_invalid';
    return next;
  }
  function commitActivitiesTransition(result, previous) {
    if (!result || !result.ok) return false;
    result.state.smokePrompted = !!(previous && previous.smokePrompted);
    saveExtensions.activities = result.state;
    delete saveExtensionErrors.activities;
    return true;
  }
  function yogurtStoryModuleAvailable() {
    return typeof createYogurtStory === 'function' && typeof isYogurtStoryState === 'function'
      && typeof startYogurtStory === 'function' && typeof tickYogurtStory === 'function'
      && typeof chooseYogurtResolution === 'function' && typeof completeYogurtCoffee === 'function';
  }
  function ensureYogurtExtension() {
    if (!yogurtStoryModuleAvailable()) return null;
    const current = saveExtensions.yogurt;
    if (current && isYogurtStoryState(current) && (current.shiftId === null || current.shiftId === shiftId)) {
      if (typeof current.coffeeCompletedAfterDiscovery !== 'boolean' || typeof current.pendingCoffee !== 'boolean') {
        const normalized = { ...current,
          coffeeCompletedAfterDiscovery: !!current.coffeeCompletedAfterDiscovery,
          pendingCoffee: !!current.pendingCoffee,
        };
        saveExtensions.yogurt = normalized;
        return normalized;
      }
      return current;
    }
    const next = createYogurtStory();
    next.coffeeCompletedAfterDiscovery = false;
    next.pendingCoffee = false;
    saveExtensions.yogurt = next;
    if (current) saveExtensionErrors.yogurt = 'state_invalid_or_shift_mismatch';
    return next;
  }
  function commitYogurtTransition(result, previous = saveExtensions.yogurt) {
    if (!result || !result.ok) return false;
    result.state.coffeeCompletedAfterDiscovery = !!(previous && previous.coffeeCompletedAfterDiscovery);
    result.state.pendingCoffee = !!(previous && previous.pendingCoffee);
    saveExtensions.yogurt = result.state;
    delete saveExtensionErrors.yogurt;
    return true;
  }
  function yogurtOwnerAvailable() {
    const hlad = coworkerById('hlad');
    return !!hlad && !hlad.away && !hlad.remote && unlocked('coworkers');
  }
  function yogurtLegalAway() {
    return AWAY.has(player.action) || player.action === 'daily' || !!eventIs('drill');
  }
  function yogurtStoryContext(dt = 0, forceShiftEnd = false) {
    return {
      dt,
      paused: mode !== 'playing',
      clockMinutes,
      legalAway: yogurtLegalAway(),
      shiftEnded: forceShiftEnd || mode === 'ended' || clockMinutes >= CFG.shiftEnd,
      ownerAvailable: yogurtOwnerAvailable(),
    };
  }
  function yogurtBlebFavorAvailable() {
    const bleb = coworkerById('bleb');
    if (!bleb || bleb.away || bleb.remote || !unlocked('coworkers')) return false;
    const eligibility = canRequestFavor(ensureRelationshipsExtension(), 'bleb', dayIndex);
    return !!eligibility.ok && !!eligibility.canRequest;
  }
  function yogurtBlebDisabledReason() {
    const bleb = coworkerById('bleb');
    if (!bleb || bleb.away || bleb.remote) return 'Блеба сейчас нет в офисе';
    if (!unlocked('coworkers')) return 'Коллеги доступны со вторника';
    return yogurtBlebFavorAvailable() ? '' : 'Нет свободного кредита Блеба';
  }
  function yogurtAtHladDesk() {
    const zone = currentZone();
    return !!zone && zone.type === 'chat' && zone.coworker === 'hlad' && yogurtOwnerAvailable();
  }
  function applyYogurtTransition(result, previous = saveExtensions.yogurt) {
    if (!result || !result.ok) return false;
    let relationships = null;
    let moments = null;
    let relationshipsChanged = false;
    let momentsChanged = false;
    const messages = [];
    const weeklyRelationshipFacts = [];
    for (const effect of result.effects || []) {
      if (effect.type === 'consumeFavor') {
        if (!yogurtBlebFavorAvailable()) return false;
        relationships = relationships || ensureRelationshipsExtension();
        const consumed = consumeFavor(relationships, effect.npcId, dayIndex);
        if (!consumed.ok) return false;
        relationships = consumed.state;
        relationshipsChanged = true;
      } else if (effect.type === 'relationship') {
        relationships = relationships || ensureRelationshipsExtension();
        const applied = applyRelationshipEvent(relationships, {
          eventId: effect.eventId,
          npcId: effect.npcId,
          kind: effect.kind,
          dayIndex,
        });
        if (!applied.ok) return false;
        relationships = applied.state;
        relationshipsChanged = true;
        weeklyRelationshipFacts.push({ kind: effect.kind, eventId: effect.eventId });
      } else if (effect.type === 'awardMoment') {
        moments = moments || ensureMomentsExtension();
        const awarded = awardMoment(moments, effect.momentId, effect.sourceId);
        if (!awarded.ok) return false;
        moments = awarded.state;
        momentsChanged = true;
      } else if (effect.type === 'message') {
        messages.push(effect);
      }
    }
    if (!commitYogurtTransition(result, previous)) return false;
    if (relationshipsChanged) saveExtensions.relationships = relationships;
    if (momentsChanged) saveExtensions.moments = moments;
    weeklyRelationshipFacts.forEach(fact => recordWeekRelationshipFact(fact.kind, fact.eventId));
    for (const effect of messages) {
      const key = typeof effect.lineId === 'string' ? effect.lineId.replace(/^yogurt\./, '') : '';
      const message = LINES.yogurt && LINES.yogurt[key];
      if (!message) continue;
      const owner = coworkerById(effect.ownerId);
      if (owner && !owner.away && !owner.remote) say(owner.id, message, 3.6);
      addLog(message, key === 'discovered' || key === 'timeout' ? 'bad' : 'good');
    }
    return true;
  }
  function tickYogurtStoryAdapter(dt, forceShiftEnd = false) {
    if (!yogurtStoryModuleAvailable()) return false;
    const current = ensureYogurtExtension();
    if (!current || current.status === 'dormant' || current.status === 'resolved') return false;
    const result = tickYogurtStory(current, yogurtStoryContext(dt, forceShiftEnd));
    if (!result.ok) return false;
    return applyYogurtTransition(result, current);
  }
  function yogurtChoiceContext(story) {
    const context = yogurtStoryContext(0);
    return {
      clockMinutes: context.clockMinutes,
      shiftEnded: context.shiftEnded,
      legalAway: context.legalAway,
      ownerAvailable: context.ownerAvailable,
      blebFavorAvailable: yogurtBlebFavorAvailable(),
      coffeeCompletedAfterDiscovery: !!(story && story.coffeeCompletedAfterDiscovery),
    };
  }
  function resolveYogurtChoice(choiceId) {
    const current = ensureYogurtExtension();
    if (!current || !yogurtAtHladDesk() || yogurtLegalAway()) return false;
    const result = chooseYogurtResolution(current, choiceId, yogurtChoiceContext(current));
    if (!result.ok) {
      toast(result.reason === 'favor_unavailable' ? 'Нужен свободный кредит помощи Блеба.' : 'Хлад сейчас не может принять ответ.', 2.4);
      return false;
    }
    if (!applyYogurtTransition(result, current)) {
      toast(choiceId === 'bleb' ? 'Кредит Блеба не списан: помощь сейчас недоступна.' : 'Ответ не удалось сохранить.', 2.4);
      return false;
    }
    if (choiceId === 'admit') {
      addLog('Быкентий признался Хладу и решил извиниться свежим кофе.', 'info');
    } else if (choiceId === 'silent') {
      say('player', 'Молчу. Может, до пяти он забудет.', 2.8);
      addLog('Быкентий решил промолчать до 17:00.', 'bad');
    }
    return true;
  }
  function yogurtChoiceDisabledReason(choiceId) {
    const story = ensureYogurtExtension();
    if (!story) return 'История ещё не подключена';
    const result = chooseYogurtResolution(story, choiceId, yogurtChoiceContext(story));
    if (result.ok) return '';
    if (result.reason === 'favor_unavailable') return yogurtBlebDisabledReason();
    if (result.reason === 'response_expired') return 'Хлад уже закрыл разговор';
    if (result.reason === 'owner_unavailable') return 'Хлад сейчас отсутствует';
    if (result.reason === 'resolution_locked') return 'Ответ уже выбран';
    return 'Хлад сейчас не принимает ответ';
  }
  function startYogurtCoffeeGift() {
    const story = ensureYogurtExtension();
    if (!story || story.status !== 'discovered' || story.resolution !== 'admit' || !story.coffeeCompletedAfterDiscovery || !yogurtAtHladDesk()) {
      toast('Хлад примет кофе, сваренный после пропажи, у своего стола.', 2.6);
      return false;
    }
    startAction('yogurt-coffee-gift', 2);
    say('player', LINES.yogurt.coffeeOffer, 2.4);
    playSound('click');
    return true;
  }
  function finishYogurtCoffeeBrew(reason) {
    const current = saveExtensions.yogurt;
    if (!current || !current.pendingCoffee) return false;
    const next = { ...current, pendingCoffee: false };
    if (reason === 'done') {
      day.coffeeCups = (day.coffeeCups || 0) + 1;
      if (day.coffeeCups >= 3 && rand() < 0.45) day.coffeeJammed = true;
      stats.coffees++;
      if (current.status === 'discovered') next.coffeeCompletedAfterDiscovery = true;
      playSound('coffee');
      puff(119, WD.FLOOR_TOP - 20, 'rgba(255,255,255,0.7)', 8);
      addLog(`Кофе №${stats.coffees} готов для Хлада. Этот кофе не даёт бонуса скорости или кайфа.`, 'info');
    }
    saveExtensions.yogurt = next;
    return true;
  }
  function recordThermosBrewOnCompletion() {
    const current = saveExtensions.equipment;
    if (!equipmentHas('thermos') || !current) return false;
    const result = recordThermosBrew(current, {
      paused: mode === 'paused', shiftEnded: mode === 'ended', completed: true,
      coffeeForColleague: false, brewId: `${shiftId}:thermos-brew:${Math.floor(shiftTime * 1000)}`,
    });
    if (!result.ok) return false;
    saveExtensions.equipment = result.state;
    delete saveExtensionErrors.equipment;
    addLog('Термос набрал один запасной заряд. Его можно использовать в телефоне.', 'good');
    floater(player.x, player.y - 58, 'ТЕРМОС ЗАРЯЖЕН', '#e8b070');
    return true;
  }
  function activateThermosFromPhone() {
    if (!phonePanelOpen || mode !== 'playing') return { ok: false, reason: 'phone_unavailable' };
    const current = saveExtensions.equipment;
    if (!current) return { ok: false, reason: 'equipment_unavailable' };
    const result = useThermos(current, {
      currentBoost: player.coffeeBoost, paused: mode === 'paused', shiftEnded: mode === 'ended', viaPhone: true,
    });
    if (!result.ok) {
      const message = result.reason === 'thermos_charge_unavailable' ? 'Запасной заряд термоса уже использован или ещё не готов.' : 'Термос сейчас недоступен.';
      toast(message, 2.2);
      return result;
    }
    saveExtensions.equipment = result.state;
    delete saveExtensionErrors.equipment;
    player.coffeeBoost = result.coffeeBoost;
    playSound('coffee');
    floater(player.x, player.y - 58, 'ЗАПАСНОЙ КОФЕ · 8 С', '#e8b070');
    addLog('Использован запасной кофе из термоса. Кайф и статистика чашек не меняются.', 'good');
    saveProgress();
    return result;
  }
  function autoclickerInstallDisabledReason() {
    const current = saveExtensions.equipment;
    if (mode !== 'playing') return mode === 'paused' ? 'Игра на паузе' : 'Смена уже закончилась';
    if (auto.on) return 'Автопилот управляет Быкентием';
    if (player.action !== 'none') return 'Сначала закончи текущее действие';
    if (!equipmentHas('autoclicker')) return 'Автокликер не установлен в активный набор';
    if (!current || !current.autoclicker || !current.usedCharges) return 'Оснащение сейчас недоступно';
    if (current.usedCharges.autoclicker || current.autoclicker.placementUsed || current.autoclicker.phase !== 'idle') return 'Автокликер уже использован или недоступен';
    const zone = currentZone();
    if (!zone || zone.id !== 'desk') return 'Поставить автокликер можно только у своего стола';
    return '';
  }
  function autoclickerCanOfferDeskChoice() {
    return equipmentHas('autoclicker') && !autoclickerInstallDisabledReason();
  }
  function sitAtOwnDesk() {
    const zone = currentZone();
    if (mode !== 'playing' || player.action !== 'none' || !zone || zone.id !== 'desk') return false;
    player.workFromFront = player.y > (WD.ROW1_Y + 10);
    player.x = SEAT.x; player.y = SEAT.y;
    day.excelWorkAcc = 0;
    startAction('work', 0);
    playSound('click');
    addLog('Быкентий открыл Excel. Пальцы стучат по формулам.', 'good');
    return true;
  }
  function installAutoclickerAtDesk() {
    const disabled = autoclickerInstallDisabledReason();
    if (disabled) { toast(disabled + '.', 1.8); return false; }
    const current = saveExtensions.equipment;
    const result = activateAutoclicker(current, {
      atDesk: true, paused: mode === 'paused', shiftEnded: mode === 'ended' || clockMinutes >= CFG.shiftEnd,
    });
    if (!result.ok) { toast('Автокликер сейчас недоступен.', 1.8); return false; }
    saveExtensions.equipment = result.state;
    delete saveExtensionErrors.equipment;
    player.workFromFront = player.y > (WD.ROW1_Y + 10);
    player.x = SEAT.x; player.y = SEAT.y;
    startAction('autoclicker-install', 2);
    say('player', LINES.autoclicker.install, 2.2);
    addLog('Быкентий ставит автокликер. Заряд потрачен; устройство не выполняет работу.', 'info');
    playSound('click');
    saveProgress();
    return true;
  }
  function beginAutoclickerDeskInspection() {
    const current = saveExtensions.equipment;
    if (!current || !equipmentHas('autoclicker')) return { ok: false, reason: 'autoclicker_not_equipped', waitSeconds: 0 };
    const result = beginAutoclickerInspection(current, {
      inspectionId: `${shiftId}:autoclicker-empty-desk`, emptyDesk: true,
      paused: mode === 'paused', shiftEnded: mode === 'ended' || clockMinutes >= CFG.shiftEnd,
    });
    if (!result.ok) return result;
    saveExtensions.equipment = result.state;
    delete saveExtensionErrors.equipment;
    return result;
  }
  function tickAutoclickerAdapter(dt) {
    if (mode !== 'playing' || !saveExtensions.equipment) return null;
    const current = saveExtensions.equipment;
    const clicker = current.autoclicker || {};
    const pending = clicker.inspectionWait;
    const previousPhase = clicker.phase;
    const returnedToExcel = !!pending && boss.state === 'waitDesk' && boss.emptyDesk === true && playerIsWorking();
    const result = tickEquipment(current, {
      dt: Math.max(0, Number(dt) || 0), paused: false, shiftEnded: false,
      installationInterrupted: false,
      ...(pending ? { inspectionId: pending.inspectionId, returnedToExcel } : {}),
    });
    if (!result.ok) return null;
    saveExtensions.equipment = result.state;
    delete saveExtensionErrors.equipment;
    if (result.inspectionOutcome === 'missAtDesk' && boss.state === 'waitDesk' && boss.emptyDesk === true) {
      say('boss', LINES.autoclicker.revealed, 3);
      toast('Автокликер раскрыт: Д.Н. продолжает ждать у стола.', 2.8);
      addLog('Д.Н. понял, что курсор не настоящий. Обычный таймер ожидания стола продолжается.', 'bad');
    }
    if (result.inspectionOutcome || previousPhase !== result.state.autoclicker.phase) autoclickerSavePending = true;
    return result;
  }
  function resolveAutoclickerInspectionElsewhere() {
    const hadClickerDeskWait = boss && boss.emptyDesk === true;
    const current = saveExtensions.equipment;
    const pending = current && current.autoclicker && current.autoclicker.inspectionWait;
    let changed = false;
    if (pending) {
      const result = tickEquipment(current, {
        dt: 0, paused: false, shiftEnded: false,
        inspectionId: pending.inspectionId, inspectionResolved: true,
      });
      if (result.ok) {
        saveExtensions.equipment = result.state;
        delete saveExtensionErrors.equipment;
        changed = true;
      }
    }
    if (hadClickerDeskWait) boss.emptyDesk = false;
    return changed || hadClickerDeskWait;
  }
  function interruptAutoclickerInstallation() {
    const current = saveExtensions.equipment;
    if (!current || !current.autoclicker || current.autoclicker.phase !== 'installing') return false;
    const result = tickEquipment(current, {
      dt: 0, paused: false, shiftEnded: false, installationInterrupted: true,
    });
    if (!result.ok) return false;
    saveExtensions.equipment = result.state;
    delete saveExtensionErrors.equipment;
    return true;
  }
  function autoshkaModuleAvailable() {
    return typeof createAutoshkaChoice === 'function' && typeof isAutoshkaState === 'function'
      && typeof startAutoshkaRepair === 'function' && typeof tickAutoshkaRepair === 'function'
      && typeof cancelAutoshkaRepair === 'function';
  }
  function autoshkaEventIdentity() { return `${shiftId}:autoshka:1`; }
  function autoshkaStateForActiveEvent() {
    const current = saveExtensions.autoshka;
    return eventIs('autoshka') && autoshkaModuleAvailable() && current
      && isAutoshkaState(current) && current.eventId === autoshkaEventIdentity() ? current : null;
  }
  function autoshkaLegalAway() {
    return AWAY.has(player.action) || player.action === 'daily' || !!eventIs('drill');
  }
  function autoshkaContext(dt = 0, state = null, forceShiftEnd = false) {
    const sirgey = coworkerById('sirgey');
    const zone = currentZone();
    const eventActive = !!eventIs('autoshka');
    return {
      dt,
      paused: mode !== 'playing',
      shiftEnded: forceShiftEnd || mode === 'ended' || clockMinutes >= CFG.shiftEnd,
      clockMinutes,
      eventActive,
      eventId: state && state.eventId || autoshkaEventIdentity(),
      eventRemaining: eventActive ? Math.max(0, officeEvent.t) : 0,
      sirgeyAvailable: !!sirgey && !sirgey.away && !sirgey.remote && unlocked('coworkers'),
      playerAtDesk: !!zone && zone.type === 'chat' && zone.coworker === 'sirgey',
      legalAway: autoshkaLegalAway(),
    };
  }
  function autoshkaReliableRelationshipReason() {
    if (typeof applyRelationshipEvent !== 'function') return 'Механика помощи Сиргею недоступна';
    const eventId = `${autoshkaEventIdentity()}:autoshka:reliable:relationship:sirgey`;
    const result = applyRelationshipEvent(ensureRelationshipsExtension(), {
      eventId,
      npcId: 'sirgey',
      kind: 'help',
      dayIndex,
    });
    if (result.ok) return '';
    if (result.reason === 'relationship_angry') return 'Сиргей ещё обижен и не примет помощь';
    if (result.reason === 'help_already_used_today') return 'Сиргею уже помогали сегодня';
    return 'Сейчас нельзя получить кредит помощи Сиргея';
  }
  function ensureAutoshkaChoiceState() {
    if (!autoshkaModuleAvailable() || !eventIs('autoshka')) return null;
    const current = saveExtensions.autoshka;
    if (current && isAutoshkaState(current) && current.eventId === autoshkaEventIdentity()
      && current.status !== 'cancelled') return current;
    const result = createAutoshkaChoice(autoshkaContext(0));
    if (!result.ok) {
      if (current && !isAutoshkaState(current)) saveExtensionErrors.autoshka = 'state_invalid';
      return null;
    }
    saveExtensions.autoshka = result.state;
    delete saveExtensionErrors.autoshka;
    return result.state;
  }
  function autoshkaChoiceDisabledReason(branch) {
    const state = autoshkaStateForActiveEvent();
    if (!eventIs('autoshka')) return 'Событие автошки закончилось';
    const context = autoshkaContext(0, state);
    if (!context.sirgeyAvailable) return 'Сиргея сейчас нет в офисе';
    if (!context.playerAtDesk) return 'Нужно быть у стола Сиргея';
    if (!state || state.status === 'cancelled') return 'Выбор помощи уже закрыт';
    if (state.status !== 'choice') return 'Решение по этой автошке уже выбрано';
    if (branch === 'reliable') {
      const relationshipReason = autoshkaReliableRelationshipReason();
      if (relationshipReason) return relationshipReason;
    }
    const duration = branch === 'reliable' ? 6 : 3;
    if (!state.options[branch] || context.eventRemaining < duration) return `Нужно ещё ${duration} с события`;
    return '';
  }
  function openAutoshkaChoice() {
    const state = ensureAutoshkaChoiceState();
    if (!state) {
      toast(!eventIs('autoshka') ? 'Событие автошки закончилось.' : 'Сиргей недоступен или времени на помощь не осталось.', 2.2);
      return false;
    }
    if (state.status !== 'choice') {
      toast(state.status === 'repairing' ? 'Ты уже помогаешь Сиргею.' : 'Эта автошка уже получила решение.', 2.2);
      return false;
    }
    return openActionChoice({ id: 'autoshka-help', owner: 'sirgey', options: ['reliable', 'quick', 'leave'], expiresIn: 10 });
  }
  function startAutoshkaHelp(branch) {
    const current = ensureAutoshkaChoiceState();
    if (!current || current.status !== 'choice') {
      toast('Сиргей или событие уже недоступны.', 2.2);
      return false;
    }
    if (branch === 'reliable') {
      const relationshipReason = autoshkaReliableRelationshipReason();
      if (relationshipReason) {
        toast(relationshipReason, 2.2);
        return false;
      }
    }
    const result = startAutoshkaRepair(current, branch, autoshkaContext(0, current));
    if (!result.ok) {
      toast(result.reason === 'event_too_short' ? 'Автошка скоро поднимется сама — времени на ремонт не осталось.' : 'Сейчас нельзя помочь Сиргею.', 2.2);
      return false;
    }
    saveExtensions.autoshka = result.state;
    delete saveExtensionErrors.autoshka;
    startAction('autoshka-repair', result.state.remaining);
    say('player', branch === 'reliable' ? 'Сейчас разберусь нормально, без лишнего шума.' : 'Сделаю быстрый костыль. Надеюсь, продержится.', 2.6);
    addLog(branch === 'reliable' ? 'Быкентий чинит автошку у стола Сиргея.' : 'Быкентий ставит быстрый костыль для автошки.', 'info');
    playSound('click');
    return true;
  }
  function leaveAutoshkaToBoss() {
    if (!eventIs('autoshka') || !autoshkaStateForActiveEvent()) {
      toast('Событие автошки уже закончилось.', 2.2);
      return false;
    }
    say('player', 'Пусть Д.Н. сам объяснит Сиргею, как её перезапустить.', 2.8);
    addLog('Быкентий оставил Сиргея разбираться с Д.Н.; отвлечение продолжается.', 'info');
    return true;
  }
  function applyAutoshkaTransition(result, previous = saveExtensions.autoshka) {
    if (!result || !result.ok) return false;
    let relationships = null;
    let moments = null;
    let relationshipsChanged = false;
    let momentsChanged = false;
    const effects = [];
    const weeklyRelationshipFacts = [];
    for (const effect of result.effects || []) {
      if (effect.type === 'relationship') {
        relationships = relationships || ensureRelationshipsExtension();
        const applied = applyRelationshipEvent(relationships, {
          eventId: effect.eventId,
          npcId: effect.npcId,
          kind: effect.kind,
          dayIndex,
        });
        if (!applied.ok) return false;
        relationships = applied.state;
        relationshipsChanged = true;
        weeklyRelationshipFacts.push({ kind: effect.kind, eventId: effect.eventId });
      } else if (effect.type === 'awardMoment') {
        moments = moments || ensureMomentsExtension();
        const awarded = awardMoment(moments, effect.momentId, effect.sourceId);
        if (!awarded.ok) {
          if (['moment_cap_reached', 'moment_already_awarded', 'duplicate_source'].includes(awarded.reason)) continue;
          return false;
        }
        moments = awarded.state;
        momentsChanged = true;
      } else if (effect.type === 'addWork' || effect.type === 'subtractWork' || effect.type === 'message') {
        effects.push(effect);
      } else return false;
    }
    saveExtensions.autoshka = result.state;
    delete saveExtensionErrors.autoshka;
    if (relationshipsChanged) saveExtensions.relationships = relationships;
    if (momentsChanged) saveExtensions.moments = moments;
    weeklyRelationshipFacts.forEach(fact => recordWeekRelationshipFact(fact.kind, fact.eventId));
    for (const effect of effects) {
      if (effect.type === 'addWork') {
        addWork(effect.amount);
        floater(player.x, player.y - 64, `+${effect.amount} К ПЛАНУ`, '#57d08a');
        addLog(`Помог Сиргею с автошкой: +${effect.amount} к плану.`, 'good');
      } else if (effect.type === 'subtractWork') {
        usefulness = Math.max(0, usefulness - Math.min(Math.max(0, usefulness), effect.amount));
      } else if (effect.type === 'message') {
        const key = typeof effect.lineId === 'string' ? effect.lineId.replace(/^autoshka\./, '') : '';
        const message = LINES.autoshka && LINES.autoshka[key];
        const owner = coworkerById(effect.ownerId);
        if (message && owner && !owner.away && !owner.remote) say(owner.id, message, 3.2);
        if (message) addLog(message, 'bad');
      }
    }
    if (effects.some(effect => effect.type === 'addWork' || effect.type === 'subtractWork')) checkTodo();
    return true;
  }
  function tickAutoshkaAdapter(dt, forceShiftEnd = false) {
    if (!autoshkaModuleAvailable()) return false;
    const current = saveExtensions.autoshka;
    if (!current || !isAutoshkaState(current) || current.status === 'cancelled') return false;
    const context = autoshkaContext(dt, current, forceShiftEnd);
    if (actionChoiceState && actionChoiceState.id === 'autoshka-help' && (forceShiftEnd || !context.eventActive)) closeActionChoice('event_ended');
    let result;
    if (current.status === 'choice') {
      if (!forceShiftEnd && context.eventActive) return false;
      result = cancelAutoshkaRepair(current, forceShiftEnd ? 'shift_ended' : 'event_ended');
    } else result = tickAutoshkaRepair(current, context);
    if (!result.ok || (result.state === current && !result.effects.length)) return false;
    const committed = applyAutoshkaTransition(result, current);
    if (committed && result.state.status === 'cancelled' && player.action === 'autoshka-repair') {
      endAction('cancel');
    }
    return committed;
  }
  function cancelAutoshkaHelp(reason) {
    const current = saveExtensions.autoshka;
    if (!current || !isAutoshkaState(current) || current.status !== 'repairing') return false;
    const canceled = cancelAutoshkaRepair(current, reason === 'shift_ended' ? 'shift_ended' : 'interrupted');
    return applyAutoshkaTransition(canceled, current);
  }
  function activityContext(overrides) {
    return Object.assign({
      shiftId,
      paused: mode !== 'playing',
      shiftEnded: mode === 'ended',
    }, overrides || {});
  }
  function activityVariantMatchesAction(variant, action) {
    return (variant === 'smoke-listening' && action === 'smoke') ||
      ((variant === 'youtube-quiet' || variant === 'youtube-loud') && action === 'youtube') ||
      ((variant === 'fridge-own' || variant === 'fridge-yogurt') && action === 'fridge');
  }
  function fridgeYogurtDisabledReason() {
    if (!yogurtStoryModuleAvailable()) return 'История йогурта ещё не подключена';
    if (!unlocked('coworkers')) return 'Коллеги доступны со вторника';
    const hlad = coworkerById('hlad');
    if (!hlad || hlad.away || hlad.remote) return 'Хлада сейчас нет в офисе';
    if (ensureActivitiesExtension().yogurtStolen) return 'Йогурт уже исчез';
    const story = ensureYogurtExtension();
    if (!story || story.status !== 'dormant') return 'Йогурт уже исчез';
    return '';
  }
  function startFridgeVariant(variant) {
    const current = ensureActivitiesExtension();
    const storyAvailable = yogurtStoryModuleAvailable() && !fridgeYogurtDisabledReason();
    const hlad = coworkerById('hlad');
    const result = startActivityVariant(current, activityContext({
      ownerAvailable: !!hlad && !hlad.away && !hlad.remote,
      storyAvailable,
    }), variant);
    if (!commitActivitiesTransition(result, current)) {
      if (variant === 'fridge-yogurt') toast(fridgeYogurtDisabledReason() || 'Сейчас нельзя взять этот йогурт', 2.2);
      return false;
    }
    startAction('fridge', result.remaining);
    playSound('click');
    if (variant === 'fridge-own') say('player', pick(LINES.thoughts.fridge), 3.5);
    else addLog('Быкентий взял йогурт Хлада. Пока Хлад не заметил пропажу.', 'bad');
    return true;
  }
  function offerFridgeChoice() {
    return openActionChoice({ id: 'fridge-choice', owner: 'player', options: ['own', 'yogurt'], expiresIn: 10 });
  }
  function startSmokeListening() {
    const current = ensureActivitiesExtension();
    const result = startActivityVariant(current, activityContext({
      dayIndex,
      ordinarySmokeCompleted: true,
    }), 'smoke-listening');
    if (!commitActivitiesTransition(result, current)) return false;
    startAction('smoke', result.remaining);
    playSound('smoke');
    say('player', pick(LINES.thoughts.smoke), 2.4);
    addLog('Быкентий прислушивается после перекура. Ещё три секунды без кайфа.', 'info');
    return true;
  }
  function startYoutubeVariant(variant) {
    const current = ensureActivitiesExtension();
    const result = startActivityVariant(current, activityContext({
      internetAvailable: !eventIs('internet'),
    }), variant);
    if (!commitActivitiesTransition(result, current)) {
      if (result.reason === 'internet_unavailable') say('player', 'Интернета нет... Придётся работать?!', 2.4);
      return false;
    }
    startAction('youtube', result.remaining);
    playSound('click');
    say('player', pick(LINES.thoughts.youtube), 3.2);
    addLog(variant === 'youtube-loud'
      ? 'Серверная: ролик со звуком. Шум может привлечь Д.Н.'
      : 'Серверная: тихий ролик на гигабитном канале.', 'bad');
    return true;
  }
  function offerSmokeListeningChoice() {
    if (dayIndex < 1) return false;
    const activities = ensureActivitiesExtension();
    if (activities.smokePrompted || activities.listeningCompleted || activities.intelGranted) return false;
    const opened = openActionChoice({
      id: 'smoke-listening', owner: 'player', options: ['listen', 'later'], expiresIn: 10,
    });
    if (opened) {
      activities.smokePrompted = true;
      saveExtensions.activities = activities;
    }
    return opened;
  }
  function applyActivityEffects(effects) {
    for (const effect of effects || []) {
      if (effect.type === 'grantIntel') {
        intelTimer = Math.max(intelTimer, effect.seconds);
        say('player', bossIntelHasCountdown() ? LINES.thoughts.smokeIntel : bossIntelStatusText(), 3.2);
        addLog('Быкентий запомнил расписание проверок Д.Н.', 'good');
      } else if (effect.type === 'countCompleted' && effect.statId === 'videos') {
        stats.videos++;
      } else if (effect.type === 'countCompleted' && effect.statId === 'fridge') {
        stats.fridge++;
      } else if (effect.type === 'startStory' && effect.storyId === 'yogurt') {
        const current = ensureYogurtExtension();
        if (!current) continue;
        const started = startYogurtStory(current, {
          shiftId,
          sourceId: effect.sourceId,
          clockMinutes,
          shiftEnded: mode === 'ended' || clockMinutes >= CFG.shiftEnd,
        });
        if (commitYogurtTransition(started, current)) {
          say('player', LINES.yogurt.thought, 3.5);
          addLog('Йогурт Хлада исчез из холодильника. Хлад пока этого не заметил.', 'bad');
        }
      } else if (effect.type === 'requestBossRoute' && effect.targetId === 'server' && effect.reasonId === 'youtube_loud') {
        if (!routeBossToServer()) {
          say('boss', LINES.boss.youtubeNoiseBlocked, 2.4);
        }
      } else if (effect.type === 'message' && effect.lineId === 'youtubeNoiseBlocked') {
        const message = LINES.boss.youtubeNoiseBlocked;
        if (['gone', 'out', 'leaving', 'goout'].includes(boss.state)) toast(message, 2.4);
        else say('boss', message, 2.4);
      }
    }
  }
  function cancelActiveActivitiesAtShiftEnd() {
    const current = saveExtensions.activities;
    if (!current || !current.active || !activitiesStateIsValid(current)) return false;
    const result = cancelActivityVariant(current, 'shift_ended');
    if (!commitActivitiesTransition(result, current)) return false;
    if (activityVariantMatchesAction(result.variant, player.action)) {
      player.action = 'none';
      player.actionTimer = 0;
    }
    return true;
  }
  function endAction(reason, finishedActivity = null) {
    const a = player.action;
    if (a === 'autoclicker-install' && reason !== 'done') interruptAutoclickerInstallation();
    const coffeeForColleague = a === 'coffee' && !!(saveExtensions.yogurt && saveExtensions.yogurt.pendingCoffee);
    let thermosChargeStored = false;
    const startPrinterDistraction = a === 'printer-distraction-prep' && reason === 'done';
    if (a === 'autoshka-repair' && reason !== 'done') {
      cancelAutoshkaHelp(reason);
    }
    if (a === 'takeFolder') {
      if (reason === 'done') disguisePreparationCompletedPending = true;
      else {
        const current = ensureDisguiseExtension();
        const canceled = cancelDisguise(current, reason === 'shift_ended' ? 'shift_ended' : 'cancel');
        commitDisguiseTransition(canceled, current);
        disguisePreparationCompletedPending = false;
      }
    }
    let activityVariant = finishedActivity && finishedActivity.variant;
    if (!finishedActivity) {
      const currentActivity = saveExtensions.activities;
      if (currentActivity && currentActivity.active && activityVariantMatchesAction(currentActivity.active.variant, a)) {
        activityVariant = currentActivity.active.variant;
        const canceled = cancelActivityVariant(currentActivity, reason === 'shift_ended' ? 'shift_ended' : 'cancel');
        if (commitActivitiesTransition(canceled, currentActivity) && activityVariant === 'smoke-listening' && reason === 'cancel') {
          saveExtensions.activities.smokePrompted = false;
        }
      }
    }
    let completedChat = false;
    if (a === 'chat') {
      const c = coworkerById(player.chatWith);
      if (reason === 'done' && c) {
        grantPerk(c);
        completedChat = true;
        if (c.id === 'tigran') finishTigranConversation(c);
      }
      player.chatWith = null;
    }
    if (a === 'coffee') {
      const yogurtCoffeeFinished = finishYogurtCoffeeBrew(reason);
      if (yogurtCoffeeFinished && reason === 'done') {
        addLog('Новый кофе приготовлен. Кайф и ускорение от этой чашки не начисляются.', 'info');
      }
      if (reason === 'done' && !coffeeForColleague) thermosChargeStored = recordThermosBrewOnCompletion();
    }
    if (a === 'yogurt-coffee-gift' && reason === 'done') {
      if (!yogurtAtHladDesk()) {
        toast('Нужно закончить у стола Хлада, пока он в офисе.', 2.4);
      } else {
        const current = ensureYogurtExtension();
        const result = current && completeYogurtCoffee(current, yogurtChoiceContext(current));
        if (!result || !result.ok) {
          toast(result && result.reason === 'response_expired' ? 'Хлад уже закрыл разговор.' : 'Хлад сейчас не может принять кофе.', 2.4);
        } else if (!applyYogurtTransition(result, current)) {
          toast('Не удалось сохранить разговор с Хладом.', 2.4);
        }
      }
    }
    if (a === 'fridge' && reason === 'done' && !activityVariant) stats.fridge++;
    if (a === 'queue') {
      if (reason === 'done') {
        startAction('toilet', CFG.toiletSeconds);
        say('player', pick(LINES.toilet.inside), 3);
        day.cabinDoor = 0.6;
        playSound('slam');
        return;
      }
      day.queue = 0;
      toast('Ушёл из очереди. Место заняли.', 1.6);
    }
    if (a === 'toilet') {
      player.x = WD.toiletDoor.x; player.y = WD.toiletDoor.y;
      if (reason === 'done') {
        stats.toilet++;
        day.toiletCd = CFG.toiletCooldown;
        playSound('flush');
        day.cabinDoor = 0.8;
        if (day.peeActive) {
          day.peeActive = false; day.pee = 0; day.peeCriticalTold = false; addFun(4); schedulePee();
          floater(player.x, player.y - 64, 'ПОЛЕГЧАЛО! +4 КАЙФ', '#8fd0f0');
          scheduleShiftCallback(() => { if (mode === 'playing') say('player', pick(LINES.pee.relief), 2.8); }, 300);
        } else floater(player.x, player.y - 64, 'ПОЛЕГЧАЛО', '#8fd0f0');
      } else day.cabinDoor = 0.6;
    }
    if (a === 'lunch' && reason === 'done') {
      day.fed = true; day.hungry = false; stats.lunch++;
      const lf = day.vilka ? CFG.vilkaFun : CFG.lunchFun;
      addFun(lf);
      player.x = WD.exitDoor.x + 10; player.y = WD.exitDoor.y;
      say('player', pick(day.vilka ? LINES.lunch.vilkaThoughts : LINES.lunch.thoughts), 3);
      floater(player.x, player.y - 64, `СЫТ · +${lf} КАЙФА`, '#e8b070');
      addLog(day.vilka ? `Обед в «Вилке»: ${day.dish}. Вот это жизнь!` : `Обед в «Мюнхене»: ${day.dish}. Невкусно, но сытно.`, 'good');
    }
    if (a === 'smoke' && reason === 'done' && activityVariant !== 'smoke-listening') stats.cigarettes++;
    if (a === 'youtube' && reason === 'done' && !activityVariant) stats.videos++;
    if (a === 'printer' && reason === 'done') { stats.printed++; floater(player.x, player.y - 64, 'МЕМ НАПЕЧАТАН', '#bfe3f0'); }
    if (a === 'fixjam' && reason === 'done') {
      addWork(9);
      floater(player.x, player.y - 64, 'КСЕРОКС ПОЧИНЕН +9 KPI', '#57d08a');
      addLog('Быкентий починил ксерокс. Герой отдела.', 'good');
      if (boss.seesPlayer || dist(boss, player) < 150) { say('boss', 'О! Технарь! Вот это я понимаю!', 2.8); stats.praise++; }
      else say('shurik', 'Спасибо! Он снова жуёт только иногда.', 2.6);
      recordRelationshipEvent('shurik', 'help', `${shiftId}:relationships:shurik:fixjam`);
    }
    if (a === 'meme' && reason === 'done') {
      recordRelationshipEvent('bleb', 'help', `${shiftId}:relationships:bleb:meme`);
    }
    if (a === 'fix_coffee' && reason === 'done') {
      day.coffeeJammed = false;
      addWork(3);
      addFun(3);
      playSound('click');
      toast('Вытряхнул жмых, промыл поддон! Кофемашина снова варит.', 2.8);
      floater(player.x, player.y - 64, 'КОФЕМАШИНА ЧИСТА +3 KPI', '#57d08a');
      addLog('Быкентий почистил кофемашину. Офис спасён.', 'good');
    }
    if (reason === 'done' && (a === 'smoke' || a === 'youtube' || a === 'fridge' || completedChat) &&
        !(finishedActivity && finishedActivity.countAsBaseActivity === false)) {
      recordVarietyCompletion(a);
      finishDistractionMoment();
    }
    player.action = 'none';
    player.actionTimer = 0;
    player.hideSpot = null;
    checkTodo();
    if (thermosChargeStored) saveProgress();
    if (a === 'autoclicker-install' && reason !== 'done' && mode === 'playing') saveProgress();
    if (reason === 'done' && a === 'smoke' && activityVariant !== 'smoke-listening') offerSmokeListeningChoice();
    if (startPrinterDistraction) {
      const result = beginBossDistraction('printer');
      if (!result.ok) toast(distractionReasonText(result.reason, 'printer'), 2.4);
    }
  }

  function grantPerk(c) {
    stats.chats++;
    stats.chatted.add(c.id);
    c.cooldown = CFG.chatCooldown;
    fun += 4;
    if (c.perk === 'cover') coverTokens = 1;
    if (c.perk === 'intel') intelTimer = 45;
    if (c.perk === 'report') { addWork(8); floater(player.x, player.y - 64, '+8 К ПЛАНУ', '#57d08a'); }
    if (c.perk === 'snack') { nextBossCheck += 15; floater(player.x, player.y - 64, 'ПРОВЕРКА НА 15 С ПОЗЖЕ', '#f2bb38'); }
    if (c.perk === 'callhack') { phoneSafe = 25; floater(player.x, player.y - 64, '📱 25 С БЕЗ ПАЛЕВА', '#9fe0b0'); }
    if (c.perk === 'rocket') { boss.suspicion = 0; floater(player.x, player.y - 64, 'ПОЕХАЛИ! ПОДОЗРЕНИЕ 0', '#9fd0ff'); }
    playSound('success');
    toast(LINES.perks[c.perk], 3.2);
    addLog(`Поболтал с ${c.name}. ${LINES.perks[c.perk]}`, 'good');
  }

  function interact() {
    if (nudge && player.action === 'work') {
      // Блеб показывает мем через перегородку: кайф, но ты уже не в Excel
      nudge = null;
      startAction('meme', 3);
      say('bleb', pick(LINES.nudge.meme), 2.6);
      return;
    }
    if (player.action === 'yogurt-coffee-gift') {
      endAction('cancel');
      toast('Кофе пока останется у Быкентия.', 1.6);
      return;
    }
    if (player.action === 'autoshka-repair') {
      endAction('cancel');
      toast('Помощь Сиргею прервана.', 1.6);
      return;
    }
    if (player.action === 'autoclicker-install') {
      endAction('cancel');
      toast('Установку автокликера прервал.', 1.6);
      return;
    }
    const info = getActionInfo();
    if (player.action === 'plant_hide' || player.action === 'cabinet_hide' || player.action === 'printer_hide') {
      playSound('hide');
      if (player.action === 'plant_hide' && player.hideSpot) { player.y = player.hideSpot.y + 14; }
      if (player.action === 'printer_hide') player.y = 452;
      if (player.action === 'cabinet_hide') player.x = 70;
      endAction('cancel');
      toast('Быкентий вылез из укрытия.', 1.4);
      return;
    }
    if (player.action === 'chat' || AWAY.has(player.action) || player.action === 'queue' || player.action === 'standup') return;
    if (!info) return;

    if (info.plant) {
      const p = info.plant;
      player.hideSpot = { x: p.x, y: p.y };
      player.x = p.x; player.y = p.y - 2;
      startAction('plant_hide', 0);
      playSound('hide');
      puff(p.x, p.y - 20, 'rgba(90,160,90,0.8)', 6, 20, -6);
      toast(`Спрятался: ${p.label}. Для Д.Н. тебя нет.`, 2.2);
      return;
    }
    const z = info.zone;
    switch (z.type) {
      case 'desk':
        if (player.action === 'work') {
          endAction('cancel');
          player.y = player.workFromFront ? (WD.ROW1_Y + WD.DESK_DEPTH + 6) : (WD.FLOOR_TOP + 20);
          return;
        }
        if (autoclickerCanOfferDeskChoice()) {
          openActionChoice({ id: 'autoclicker-desk', owner: 'player', options: ['excel', 'install'], expiresIn: 10 });
          return;
        }
        sitAtOwnDesk();
        break;
      case 'coffee':
        if (player.action === 'coffee') {
          if (saveExtensions.yogurt && saveExtensions.yogurt.pendingCoffee) {
            endAction('cancel');
            toast('Варку для Хлада отменил. Кофе не засчитан.', 2);
          }
          return;
        }
        if (player.action === 'fix_coffee') return;
        if ((day.coffeeQueueTimer || 0) > 0) {
          toast(pick(LINES.coffeeQueue), 2.8);
          return;
        }
        if (day.coffeeJammed) {
          startAction('fix_coffee', 2.8);
          toast('Вытряхиваем жмых, промываем поддон (~3 с)...', 2.8);
          return;
        }
        const yogurt = yogurtStoryModuleAvailable() ? ensureYogurtExtension() : null;
        if (yogurt && yogurt.status === 'discovered') {
          saveExtensions.yogurt = { ...yogurt, pendingCoffee: true };
          startAction('coffee', 2.8);
          say('player', LINES.yogurt.coffeeStart, 2.8);
          addLog('Быкентий варит новый кофе для Хлада. Этот стакан не даёт кайфа или ускорения.', 'info');
          playSound('coffee');
          puff(119, WD.FLOOR_TOP - 20, 'rgba(255,255,255,0.7)', 8);
          return;
        }
        startAction('coffee', 2.8);
        day.coffeeCups = (day.coffeeCups || 0) + 1;
        if (day.coffeeCups >= 3 && rand() < 0.45) {
          day.coffeeJammed = true;
        }
        stats.coffees++;
        player.coffeeBoost = CFG.coffeeSeconds + (has('turka') ? 8 : 0);
        addFun(5);
        playSound('coffee');
        puff(119, WD.FLOOR_TOP - 20, 'rgba(255,255,255,0.7)', 8);
        floater(player.x, player.y - 64, '+5 КАЙФ · СКОРОСТЬ', '#e8b070');
        addLog(`Кофе №${stats.coffees}. Кофеин бодрит.`, 'good');
        checkTodo();
        break;
      case 'water':
        if (player.action === 'water') return;
        if ((day.waterCups || 0) <= 0) {
          toast(`Вода в кулере кончилась. Ждём доставку (~${Math.ceil(day.waterRecharge || 30)} мин.)`, 2.6);
          return;
        }
        startAction('water', 1.8);
        day.waterCups -= 1;
        const wGain = eventIs('heat') ? 6 : 2;
        addFun(wGain);
        playSound('coffee');
        puff(218, 206, 'rgba(120,200,250,0.9)', 5, 8, -8);
        floater(player.x, player.y - 64, `+${wGain} КАЙФ (${day.waterCups} ост.)`, '#8fd0f0');
        if (day.waterCups === 0) {
          day.waterRecharge = 30;
          addLog('Вода в кулере закончилась: бутыль пустая, кулер булькнул.', 'info');
        }
        break;
      case 'fridge':
        if (auto.on) { startFridgeVariant('fridge-own'); break; }
        offerFridgeChoice();
        break;
      case 'smoke':
        if (player.action === 'smoke') { endAction('cancel'); toast('Сигарета потушена.', 1.4); return; }
        startAction('smoke', 7);
        playSound('smoke');
        say('player', pick(LINES.thoughts.smoke), 3.2);
        addLog('Перекур на балконе. Горы, ветер, Кок-Тобе.', 'bad');
        break;
      case 'archive':
        if (peekTigranSecretExtension()?.phase === 'searching') return;
        if (tigranArchiveSearchAvailable()) {
          startTigranArchiveSearch();
          return;
        }
        archiveHide();
        break;
      case 'feast':
        officeEvent.used = true;
        startAction('eat', 2.4);
        if (eventIs('bday')) {
          fun += 4;
          say('player', 'Торт за 5000 ₸. Самый дорогой кусок в моей жизни.', 3);
          floater(player.x, player.y - 64, '+4 КАЙФ', '#f0d0e0');
          playSound('coffee');
          break;
        }
        fun += 10;
        playSound('coffee');
        say('player', `${officeEvent.food.name[0].toUpperCase()}${officeEvent.food.name.slice(1)}! Жизнь удалась.`, 2.6);
        floater(player.x, player.y - 64, '+10 КАЙФ', officeEvent.food.color);
        addLog(`Урвал ${officeEvent.food.name} на кухне.`, 'good');
        break;
      case 'printer':
        if (eventIs('jam') && !officeEvent.used) {
          officeEvent.used = true;
          startAction('fixjam', 3);
          playSound('click');
          say('player', 'Так, где тут у него зажевалось...', 2.6);
          break;
        }
        if (auto.on) { startPrinterMeme(); break; }
        openActionChoice({ id: 'printer-approach', owner: 'player', options: ['meme', 'distraction', 'folder'], expiresIn: 10 });
        break;
      case 'server':
        if (player.action === 'youtube') { endAction('cancel'); toast('Вкладка закрыта.', 1.4); return; }
        if (eventIs('internet')) { say('player', 'Интернета нет... Придётся работать?!', 2.4); return; }
        if (auto.on) { startYoutubeVariant('youtube-quiet'); return; }
        openActionChoice({ id: 'youtube-risk', owner: 'player', options: ['quiet', 'loud'], expiresIn: 10 });
        break;
      case 'exit':
        if (day.beer) { goMunichBeer(); return; }
        if (eventIs('drill')) {
          startAction('evac', 0);
          playSound('hide');
          fun += 8;
          floater(player.x, player.y - 64, 'ЭВАКУИРОВАН · +8 КАЙФ', '#9fe0b0');
          addLog('Быкентий эвакуировался. Стоит на улице, дышит.', 'good');
          return;
        }
        if (canLunch()) {
          day.dish = pick(day.vilka ? LINES.lunch.vilka : LINES.lunch.dishes);
          interruptBossDistraction('interrupted', true);
          startAction('lunch', CFG.lunchSeconds);
          // Час спокойствия: проверка, если шла, сворачивается, подозрение гаснет
          boss.suspicion = 0;
          if (['inspect', 'waitDesk', 'lecture'].includes(boss.state)) endInspection();
          boss.warned = false;
          nextBossCheck = Math.max(nextBossCheck, 12);
          addLog('Обед: целый час Д.Н. тебя не трогает.', 'good');
          say('player', day.vilka ? 'Стейки в «Вилке»! ЖУКИ КАЛОЕДЫ, за мной!' : 'ЖУКИ КАЛОЕДЫ, я на обед!', 2.4);
          toast(day.vilka ? `«Вилка»: ${day.dish}. Обед — ровно час.` : `«Мюнхен», бизнес-ланч: ${day.dish}. Обед — ровно час.`, 3);
          playSound('click');
          return;
        }
        toast(exitPrompt(), 2);
        return;
      case 'toilet': {
        if (day.toiletCd > 0 && !day.peeActive) { say('player', pick(LINES.toilet.busy), 2); return; }
        day.queue = 1 + Math.floor(rand() * 3);
        day.queueTotal = day.queue;
        day.qShift = 0; day.knock = 2 + rand() * 3;
        player.queueTarget = queueSlot(day.queue); // сам идёт в конец очереди
        startAction('queue', day.queue * CFG.toiletPerPerson);
        say('player', pick(LINES.toilet.queue), 2.6);
        return;
      }
      case 'complain': {
        const kind = eventIs('heat') ? 'heat' : (eventIs('noise') ? 'noise' : null);
        if (!kind) { toast('Жаловаться не на что. Пока.', 1.6); return; }
        if (boss.state !== 'office') { toast('Д.Н. нет в кабинете.', 1.6); return; }
        if (officeEvent.used) { say('boss', 'Я же сказал — заявку в АХО!', 2.4); return; }
        officeEvent.used = true;
        fun += 5;
        say('player', kind === 'heat' ? 'Директор Начальникович, тут +32! Кондей сдох!' : 'Директор Начальникович, сверлят! Невозможно работать!', 2.8);
        scheduleShiftCallback(() => { if (mode === 'playing') say('boss', pick(LINES.boss.complain[kind]), 3); }, 1500);
        if (rand() < 0.5) {
          officeEvent.t = Math.min(officeEvent.t, 5);
          addLog(kind === 'heat' ? 'Жалоба сработала: АХО включило кондей.' : 'Жалоба сработала: соседи притихли.', 'good');
          toast('Жалоба сработала! Скоро станет легче. +5 кайфа', 2.4);
        } else {
          addLog('Пожаловался Д.Н. Выпустил пар — уже приятно.', 'info');
          toast('Выпустил пар: +5 кайфа. Проблема осталась.', 2.4);
        }
        return;
      }
      case 'standup':
        if (!eventIs('standup')) { say('player', 'План на квартал: выжить. Согласен.', 2.4); return; }
        startAction('standup', 0);
        player.facingX = 1;
        say('player', 'Я здесь! Слушаю внимательно.', 2.2);
        choice = { t: 0, asked: false, done: false };
        return;
      case 'chat': {
        const c = coworkerById(z.coworker);
        if (c.away) { toast(`${c.name} ушёл(ла). Стул ещё тёплый.`, 1.6); return; }
        if (!unlocked('coworkers') && c.id !== 'tigran') { say(c.id, 'Понедельник же, не до разговоров!', 2); return; }
        if (c.id === 'tigran' && peekTigranSecretExtension()?.phase === 'found') {
          returnTigranSecret();
          return;
        }
        if (c.id === 'sirgey' && eventIs('autoshka') && autoshkaModuleAvailable()) {
          if (c.remote) { toast('Сиргей на удалёнке — помочь некому.', 2); return; }
          openAutoshkaChoice();
          return;
        }
        if (c.id === 'hlad' && yogurtStoryModuleAvailable()) {
          const story = ensureYogurtExtension();
          if (story && story.status === 'discovered') {
            if (story.resolution === 'admit' && story.coffeeCompletedAfterDiscovery) startYogurtCoffeeGift();
            else if (story.resolution === 'admit') toast('Сначала свари новый кофе после обнаружения пропажи.', 2.6);
            else if (story.resolution === null) {
              say('hlad', LINES.yogurt.question, 3.2);
              openActionChoice({ id: 'yogurt-response', owner: 'hlad', options: ['admit', 'bleb', 'silent'], expiresIn: 12 });
            } else say('hlad', 'Я жду до пяти. Потом поговорим.', 2.4);
            return;
          }
        }
        if (c.cooldown > 0) { say(c.id, pick(['Отстань, я занят(а)!', 'Потом, дедлайн!', 'Не сейчас, Д.Н. бдит.']), 2.2); return; }
        const pair = pick(LINES.chat[c.id]);
        player.chatWith = c.id;
        player.chatPair = pair;
        startAction('chat', 6.5);
        say('player', pair[0], 3);
        c.talkTimer = 6.5;
        addLog(`Быкентий подкатил поболтать к ${c.name}.`, 'info');
        break;
      }
      default: break;
    }
  }

  function startPhoneScrolling() {
    if (mode !== 'playing') return false;
    if (player.action === 'phone') { phonePage = 'reels'; phonePanelOpen = true; return true; }
    if (AWAY.has(player.action)) return false;
    if (player.action === 'work' || HIDDEN.has(player.action) || player.action === 'chat' || player.action === 'autoshka-repair') {
      // в Excel и в укрытии телефон тоже можно достать — но это палево
      if (player.action === 'work') player.y = SEAT.y;
      if (player.action === 'plant_hide' && player.hideSpot) player.y = player.hideSpot.y + 14;
      if (player.action === 'chat') return false;
      endAction('cancel');
    }
    startAction('phone', 0);
    phoneBuzz = 0;
    playSound('blip');
    phonePage = 'reels';
    phonePanelOpen = true;
    return true;
  }
  function finishPhoneScrolling() {
    if (player.action !== 'phone') return false;
    finishPhoneMoment(true);
    endAction('cancel');
    return true;
  }
  function togglePhone() {
    if (player.action === 'phone') { finishPhoneScrolling(); playSound('click'); return; }
    startPhoneScrolling();
  }

  function quickHide() {
    const plant = nearestPlant();
    const z = currentZone();
    if (AWAY.has(player.action)) return;
    if (HIDDEN.has(player.action)) { interact(); return; }
    if (z && z.type === 'archive' && peekTigranSecretExtension()?.phase === 'searching') {
      cancelTigranArchiveSearch('hide');
      archiveHide();
      return;
    }
    if (plant) { interact(); return; }
    if (z && z.type === 'archive') { archiveHide(); return; }
    if (z && z.type === 'printer') {
      player.x = 430; player.y = 468;
      startAction('printer_hide', 0);
      playSound('hide');
      toast('Присел за ксероксом. Пахнет тонером и страхом.', 2);
      return;
    }
    toast('Укрытия: растения, шкафы архива и ксерокс (H рядом с ними).', 2.2);
  }

  // ---------- ДОСТИЖЕНИЯ ----------
  const ACHIEVEMENTS = [
    { id: 'ghost', icon: '👻', name: 'Невидимка', desc: 'Пережить смену без единого выговора', end: r => r.win && reprimands === 0 },
    { id: 'beshbarmak', icon: '🍖', name: 'Бешбармак Д.Н.', desc: 'Трижды за смену пошарить в чужом холодильнике', now: () => stats.fridge >= 3 },
    { id: 'majik', icon: '🏔', name: 'Спаситель Маджикистана', desc: 'Поднять Маджикистан', now: () => (stats.majikFixed || 0) >= 1 },
    { id: 'majikweek', icon: '🚀', name: 'Маджикистан запущен', desc: 'Закончить неделю с Маджикистаном +2', end: r => r.win && r.dayName === 'ПЯТНИЦА' && majikArc >= 2 },
    { id: 'munich', icon: '🍺', name: 'Пятница в «Мюнхене»', desc: 'Уйти на пятничное пиво', end: r => r.result === 'munich' },
    { id: 'lightning', icon: '⚡', name: 'Громоотвод', desc: 'Три соседа отчитаны Д.Н. за смену', now: () => stats.scolds >= 3 },
    { id: 'toilet', icon: '🚽', name: 'Король биотуалета', desc: 'Дважды отстоять очередь за смену', now: () => stats.toilet >= 2 },
    { id: 'pet', icon: '⭐', name: 'Любимчик Д.Н.', desc: '5 похвал за смену', now: () => stats.praise >= 5 },
    { id: 'kaif', icon: '🎸', name: 'Кайфожор', desc: 'Заполнить шкалу кайфа до максимума (100)', now: () => fun >= 100 },
    { id: 'week', icon: '📅', name: 'Неделя пережита', desc: 'Пройти пятницу', end: r => r.win && r.dayName === 'ПЯТНИЦА' },
    { id: 'shopper', icon: '🛒', name: 'Обустроился', desc: 'Купить 4 апгрейда', now: () => Object.keys(owned).length >= 4 },
    { id: 'veteran', icon: '🔥', name: 'Ветеран', desc: 'Пережить смену на сложности «Ветеран»', end: r => r.win && diffKey === 'hard' },
    { id: 'popcorn', icon: '🍿', name: 'Попкорн', desc: 'Досмотреть смену на автопилоте', end: r => auto.on },
  ];
  let achieved = store.get('ach', {}) || {};
  function unlock(a) {
    if (achieved[a.id]) return;
    achieved = { ...achieved, [a.id]: true };
    store.set('ach', achieved);
    playSound('coin');
    toast(`🏆 Достижение: ${a.icon} ${a.name}`, 3);
    addLog(`🏆 Достижение: «${a.name}» — ${a.desc}.`, 'good');
  }
  function checkAchievements(endInfo) {
    if (!stats) return;
    for (const a of ACHIEVEMENTS) {
      if (achieved[a.id]) continue;
      if (a.now && a.now()) unlock(a);
      else if (endInfo && a.end && a.end(endInfo)) unlock(a);
    }
  }
  const achCount = () => ACHIEVEMENTS.filter(a => achieved[a.id]).length;

  registerActionChoiceHandler('yogurt-response', {
    title: 'Хлад заметил пропажу',
    options: [
      { id: 'admit', label: 'Признаться', detail: 'Сварить новый кофе и принести Хладу', disabledReason: () => yogurtChoiceDisabledReason('admit') },
      { id: 'bleb', label: 'Попросить Блеба', detail: 'Потратить один кредит помощи', disabledReason: () => yogurtChoiceDisabledReason('bleb') },
      { id: 'silent', label: 'Промолчать', detail: 'Хлад ждёт ответа до 17:00', disabledReason: () => yogurtChoiceDisabledReason('silent') },
    ],
    handlers: {
      admit: () => resolveYogurtChoice('admit'),
      bleb: () => resolveYogurtChoice('bleb'),
      silent: () => resolveYogurtChoice('silent'),
    },
  });
  registerActionChoiceHandler('fridge-choice', {
    title: 'Холодильник: выбрать перекус',
    options: [
      { id: 'own', label: 'Свой перекус', detail: '4,5 с · 3 кайфа/с · итого 13,5' },
      { id: 'yogurt', label: 'Йогурт Хлада', detail: '4,5 с · 4 кайфа/с · итого 18', disabledReason: fridgeYogurtDisabledReason },
    ],
    handlers: {
      own: () => startFridgeVariant('fridge-own'),
      yogurt: () => startFridgeVariant('fridge-yogurt'),
    },
  });
  registerActionChoiceHandler('autoshka-help', {
    title: 'Автошка Сиргея: помочь или нет?',
    options: [
      { id: 'reliable', label: 'Починить надёжно', detail: '6 с · +6 к плану · помощь Сиргею · без кайфа', disabledReason: () => autoshkaChoiceDisabledReason('reliable') },
      { id: 'quick', label: 'Быстрый костыль', detail: '3 с · +3 к плану · через 12 с может −6', disabledReason: () => autoshkaChoiceDisabledReason('quick') },
      { id: 'leave', label: 'Оставить разбираться', detail: 'Без помощи · Д.Н. продолжит отчитывать' },
    ],
    handlers: {
      reliable: () => startAutoshkaHelp('reliable'),
      quick: () => startAutoshkaHelp('quick'),
      leave: () => leaveAutoshkaToBoss(),
    },
  });
  registerActionChoiceHandler('smoke-listening', {
    title: 'Можно прислушаться: ещё 3 с',
    options: [
      { id: 'listen', label: 'Прислушаться', detail: 'Ещё 3 с на балконе · без кайфа' },
      { id: 'later', label: 'Потом', detail: 'Закончить перекур' },
    ],
    handlers: {
      listen: () => startSmokeListening(),
      later: () => {},
    },
  });
  registerActionChoiceHandler('youtube-risk', {
    title: 'Серверная: выбрать риск',
    options: [
      { id: 'quiet', label: 'Тихо', detail: '8 с · 5 кайфа/с · итого 40', disabledReason: () => eventIs('internet') ? 'Интернет отключён' : '' },
      { id: 'loud', label: 'Со звуком', detail: '6 с · 5.5 кайфа/с · итого 33 · шум на 3-й секунде', disabledReason: () => eventIs('internet') ? 'Интернет отключён' : '' },
    ],
    handlers: {
      quiet: () => startYoutubeVariant('youtube-quiet'),
      loud: () => startYoutubeVariant('youtube-loud'),
    },
  });
  registerActionChoiceHandler('printer-approach', {
    title: 'Ксерокс: выбрать действие',
    options: [
      { id: 'meme', label: 'Распечатать мем', detail: '3.5 с · +3 кайфа · +2 к плану' },
      { id: 'distraction', label: 'Отвлечь Д.Н.', detail: '2 с без награды · Д.Н. к ксероксу', disabledReason: () => {
        const access = canStartBossDistraction('printer');
        return access.ok ? '' : distractionReasonText(access.reason, 'printer');
      } },
      { id: 'folder', label: 'Взять папку', detail: '2 с подготовки · 12 с прикрытия на ходу', disabledReason: () => {
        const access = canStartDisguisePrep();
        return access.ok ? '' : disguiseReasonText(access.reason);
      } },
    ],
    handlers: {
      meme: () => startPrinterMeme(),
      distraction: () => startPrinterDistractionPrep(),
      folder: () => startDisguisePrep(),
    },
  });
  registerActionChoiceHandler('autoclicker-desk', {
    title: 'У своего стола: выбрать действие',
    options: [
      { id: 'excel', label: 'Открыть Excel', detail: 'Обычная работа по прежним правилам' },
      { id: 'install', label: 'Поставить автокликер', detail: '2 с установки · до 10 с курсора · не выполняет работу', disabledReason: autoclickerInstallDisabledReason },
    ],
    handlers: {
      excel: () => sitAtOwnDesk(),
      install: () => installAutoclickerAtDesk(),
    },
  });

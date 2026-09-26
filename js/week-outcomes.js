'use strict';

const WEEK_FACT_KINDS = Object.freeze(['help', 'betrayal', 'distraction', 'reprimand', 'fullPlan', 'majikArc', 'munichEnding']);
const TIGRAN_SECRET_PHASES = Object.freeze(['dormant', 'hinted', 'searching', 'found', 'completed']);
const TIGRAN_SECRET_SEARCH_SECONDS = 3;

function createWeekOutcomes(weekId) {
  if (weekId !== undefined && !isWeekId(weekId)) return { ok: false, reason: 'invalid_week_id' };
  return {
    schemaVersion: 1,
    weekId: weekId === undefined ? null : weekId,
    appliedFactIds: [],
    facts: [],
    counts: { helped: 0, betrayed: 0, distractions: 0, reprimands: 0, fullPlans: 0 },
    endings: { majikArc: null, munichEnding: false },
  };
}

function isWeekId(value) {
  return (typeof value === 'string' && value.length > 0) || (Number.isInteger(value) && value >= 0);
}

function isWeekOutcomesState(state) {
  if (!state || state.schemaVersion !== 1 || (state.weekId !== null && !isWeekId(state.weekId))) return false;
  if (!Array.isArray(state.appliedFactIds) || state.appliedFactIds.some(id => typeof id !== 'string' || !id)) return false;
  if (!Array.isArray(state.facts) || !state.counts || !state.endings) return false;
  const countKeys = ['helped', 'betrayed', 'distractions', 'reprimands', 'fullPlans'];
  if (countKeys.some(key => !Number.isInteger(state.counts[key]) || state.counts[key] < 0)) return false;
  if (state.endings.majikArc !== null && !Number.isFinite(state.endings.majikArc)) return false;
  if (typeof state.endings.munichEnding !== 'boolean') return false;
  return state.facts.every(fact => fact && typeof fact.eventId === 'string' && !!fact.eventId
    && WEEK_FACT_KINDS.includes(fact.kind)
    && (fact.kind !== 'majikArc' || Number.isFinite(fact.value))
    && (fact.kind !== 'munichEnding' || fact.value === true));
}

function cloneWeekOutcomes(state) {
  return {
    schemaVersion: 1,
    weekId: state.weekId,
    appliedFactIds: state.appliedFactIds.slice(),
    facts: state.facts.map(fact => ({ ...fact })),
    counts: { ...state.counts },
    endings: { ...state.endings },
  };
}

function weekOutcomeResult(ok, state, effects, reason) {
  return { ok, state, effects: effects || [], reason: reason || null };
}

function recordWeekFact(state, fact) {
  if (!isWeekOutcomesState(state)) return weekOutcomeResult(false, state, [], 'invalid_state');
  if (!fact || typeof fact !== 'object') return weekOutcomeResult(false, state, [], 'missing_fact');
  if (typeof fact.eventId !== 'string' || !fact.eventId) return weekOutcomeResult(false, state, [], 'missing_event_id');
  if (!WEEK_FACT_KINDS.includes(fact.kind)) return weekOutcomeResult(false, state, [], 'unknown_fact_kind');
  if (!isWeekId(fact.weekId)) return weekOutcomeResult(false, state, [], 'invalid_week_id');
  if (state.weekId !== null && state.weekId !== fact.weekId) return weekOutcomeResult(false, state, [], 'week_mismatch');
  if (fact.kind === 'majikArc' && !Number.isFinite(fact.value)) return weekOutcomeResult(false, state, [], 'invalid_majik_fact');
  if (fact.kind === 'munichEnding' && fact.value !== true) return weekOutcomeResult(false, state, [], 'invalid_munich_fact');
  if (state.appliedFactIds.includes(fact.eventId)) return weekOutcomeResult(true, state, [], null);

  const next = cloneWeekOutcomes(state);
  next.weekId = fact.weekId;
  next.appliedFactIds.push(fact.eventId);
  const savedFact = { eventId: fact.eventId, kind: fact.kind };
  if (fact.kind === 'help') next.counts.helped += 1;
  else if (fact.kind === 'betrayal') next.counts.betrayed += 1;
  else if (fact.kind === 'distraction') next.counts.distractions += 1;
  else if (fact.kind === 'reprimand') next.counts.reprimands += 1;
  else if (fact.kind === 'fullPlan') next.counts.fullPlans += 1;
  else if (fact.kind === 'majikArc') {
    savedFact.value = fact.value;
    next.endings.majikArc = fact.value;
  } else if (fact.kind === 'munichEnding') {
    savedFact.value = true;
    next.endings.munichEnding = true;
  }
  next.facts.push(savedFact);
  return weekOutcomeResult(true, next, [], null);
}

function selectWeekTitle(state) {
  if (!isWeekOutcomesState(state)) return { ok: false, titleId: null, facts: null, reason: 'invalid_state' };
  const counts = state.counts;
  let titleId = 'neutral';
  let factIds = ['helped', 'betrayed', 'distractions'];
  if (counts.helped >= 3) {
    titleId = 'department_pillar';
    factIds = ['helped', 'betrayed', 'reprimands'];
  } else if (counts.distractions >= 3) {
    titleId = 'excuse_master';
    factIds = ['distractions', 'helped', 'reprimands'];
  } else if (counts.reprimands === 0 && counts.fullPlans >= 3) {
    titleId = 'boss_favorite';
    factIds = ['fullPlans', 'reprimands', 'distractions'];
  }
  const countFacts = factIds.map(id => ({ id, count: counts[id] }));
  return {
    ok: true,
    titleId,
    facts: {
      summary: countFacts,
      counts: { ...counts },
      endings: { ...state.endings },
    },
    reason: null,
  };
}

function createTigranSecret(weekId) {
  if (weekId !== undefined && !isWeekId(weekId)) return { ok: false, reason: 'invalid_week_id' };
  return {
    schemaVersion: 1,
    weekId: weekId === undefined ? null : weekId,
    phase: 'dormant',
    processedEventIds: [],
    searchEventId: null,
    searchElapsed: 0,
    storyMomentAwarded: false,
  };
}

function isTigranSecretState(state) {
  return !!state && state.schemaVersion === 1 && (state.weekId === null || isWeekId(state.weekId))
    && TIGRAN_SECRET_PHASES.includes(state.phase)
    && Array.isArray(state.processedEventIds) && state.processedEventIds.every(id => typeof id === 'string' && !!id)
    && (state.searchEventId === null || (typeof state.searchEventId === 'string' && !!state.searchEventId))
    && Number.isFinite(state.searchElapsed) && state.searchElapsed >= 0 && state.searchElapsed <= TIGRAN_SECRET_SEARCH_SECONDS
    && typeof state.storyMomentAwarded === 'boolean'
    && (state.phase === 'dormant' || state.weekId !== null);
}

function cloneTigranSecret(state) {
  return { ...state, processedEventIds: state.processedEventIds.slice() };
}

function tigranContextError(context, required) {
  if (!context || typeof context !== 'object') return 'missing_context';
  for (const key of required) {
    if (!(key in context)) return `missing_${key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)}`;
  }
  for (const key of ['tigranAvailable', 'playerAtArchive', 'bossThreat', 'legalAway', 'shiftEnded', 'paused', 'storyMomentAvailable']) {
    if (key in context && typeof context[key] !== 'boolean') return `invalid_${key}`;
  }
  if ('dt' in context && (!Number.isFinite(context.dt) || context.dt < 0)) return 'invalid_dt';
  return null;
}

function tigranEventId(context) {
  return typeof context.eventId === 'string' && !!context.eventId ? null : 'missing_event_id';
}

function tigranResult(ok, state, effects, reason) {
  return { ok, state, effects: effects || [], reason: reason || null };
}

function tigranEffectId(state, eventId, suffix) {
  return `${state.weekId}:tigran-secret:${eventId}:${suffix}`;
}

function tigranMessage(state, eventId, lineId, ownerId) {
  return { id: tigranEffectId(state, eventId, `message:${lineId}`), type: 'message', lineId, ownerId };
}

function advanceTigranSecret(state, action, context) {
  if (!isTigranSecretState(state)) return tigranResult(false, state, [], 'invalid_state');
  const error = tigranContextError(context, ['weekId']);
  if (error) return tigranResult(false, state, [], error);
  if (!isWeekId(context.weekId)) return tigranResult(false, state, [], 'invalid_week_id');
  if (action === 'new_week') {
    if (state.weekId === context.weekId) return tigranResult(true, state, [], null);
    return tigranResult(true, createTigranSecret(context.weekId), [], null);
  }
  if (state.weekId !== null && state.weekId !== context.weekId) return tigranResult(false, state, [], 'week_mismatch');
  const current = state.weekId === null ? { ...state, weekId: context.weekId } : state;
  if (action === 'search_tick') {
    const tickError = tigranContextError(context, ['dt', 'paused', 'playerAtArchive', 'bossThreat', 'legalAway', 'shiftEnded']);
    if (tickError) return tigranResult(false, state, [], tickError);
    if (current.phase !== 'searching') return tigranResult(true, state, [], null);
    if (context.paused || context.dt === 0) return tigranResult(true, state, [], null);
    if (context.shiftEnded || context.legalAway || !context.playerAtArchive || context.bossThreat) {
      const next = cloneTigranSecret(current);
      next.phase = 'hinted';
      next.searchEventId = null;
      next.searchElapsed = 0;
      return tigranResult(true, next, [], null);
    }
    const elapsed = Math.min(TIGRAN_SECRET_SEARCH_SECONDS, current.searchElapsed + context.dt);
    const next = cloneTigranSecret(current);
    next.searchElapsed = elapsed;
    if (elapsed < TIGRAN_SECRET_SEARCH_SECONDS) return tigranResult(true, next, [], null);
    next.phase = 'found';
    const effects = [tigranMessage(next, next.searchEventId, 'tigran.secret_found', 'player')];
    return tigranResult(true, next, effects, null);
  }

  if (action === 'talk_complete') {
    const talkError = tigranContextError(context, ['eventId', 'tigranAvailable']);
    if (talkError) return tigranResult(false, state, [], talkError);
    const eventError = tigranEventId(context);
    if (eventError) return tigranResult(false, state, [], eventError);
    if (current.processedEventIds.includes(context.eventId)) return tigranResult(true, state, [], null);
    if (!context.tigranAvailable) return tigranResult(false, state, [], 'tigran_unavailable');
    if (current.phase !== 'dormant') return tigranResult(true, state, [], null);
    const next = cloneTigranSecret(current);
    next.phase = 'hinted';
    next.processedEventIds.push(context.eventId);
    return tigranResult(true, next, [tigranMessage(next, context.eventId, 'tigran.secret_hint', 'tigran')], null);
  }

  if (action === 'search_start') {
    const searchError = tigranContextError(context, ['eventId', 'playerAtArchive', 'bossThreat', 'legalAway', 'shiftEnded']);
    if (searchError) return tigranResult(false, state, [], searchError);
    const eventError = tigranEventId(context);
    if (eventError) return tigranResult(false, state, [], eventError);
    if (current.processedEventIds.includes(context.eventId)) return tigranResult(true, state, [], null);
    if (current.phase !== 'hinted') return tigranResult(false, state, [], 'archive_hint_required');
    if (!context.playerAtArchive) return tigranResult(false, state, [], 'not_at_archive');
    if (context.bossThreat) return tigranResult(false, state, [], 'boss_threat');
    if (context.legalAway) return tigranResult(false, state, [], 'legal_away');
    if (context.shiftEnded) return tigranResult(false, state, [], 'shift_ended');
    const next = cloneTigranSecret(current);
    next.phase = 'searching';
    next.searchEventId = context.eventId;
    next.searchElapsed = 0;
    next.processedEventIds.push(context.eventId);
    return tigranResult(true, next, [], null);
  }

  if (action === 'search_cancel') {
    const cancelError = tigranContextError(context, ['eventId']);
    if (cancelError) return tigranResult(false, state, [], cancelError);
    const eventError = tigranEventId(context);
    if (eventError) return tigranResult(false, state, [], eventError);
    if (current.processedEventIds.includes(context.eventId)) return tigranResult(true, state, [], null);
    if (current.phase !== 'searching') return tigranResult(false, state, [], 'search_not_active');
    const next = cloneTigranSecret(current);
    next.phase = 'hinted';
    next.searchEventId = null;
    next.searchElapsed = 0;
    next.processedEventIds.push(context.eventId);
    return tigranResult(true, next, [], null);
  }

  if (action === 'return_talk_complete') {
    const finishError = tigranContextError(context, ['eventId', 'tigranAvailable', 'storyMomentAvailable', 'legalAway', 'shiftEnded']);
    if (finishError) return tigranResult(false, state, [], finishError);
    const eventError = tigranEventId(context);
    if (eventError) return tigranResult(false, state, [], eventError);
    if (current.processedEventIds.includes(context.eventId)) return tigranResult(true, state, [], null);
    if (current.phase === 'completed') return tigranResult(true, state, [], null);
    if (current.phase !== 'found') return tigranResult(false, state, [], 'secret_not_found');
    if (!context.tigranAvailable) return tigranResult(false, state, [], 'tigran_unavailable');
    if (context.legalAway) return tigranResult(false, state, [], 'legal_away');
    if (context.shiftEnded) return tigranResult(false, state, [], 'shift_ended');
    const next = cloneTigranSecret(current);
    next.phase = 'completed';
    next.storyMomentAwarded = context.storyMomentAvailable;
    next.processedEventIds.push(context.eventId);
    const effects = [tigranMessage(next, context.eventId, 'tigran.secret_ending', 'tigran')];
    if (context.storyMomentAvailable) {
      effects.push({
        id: tigranEffectId(next, context.eventId, 'moment:story'),
        type: 'awardMoment',
        momentId: 'story',
        sourceId: `${context.weekId}:${context.eventId}:tigran-secret`,
      });
    }
    return tigranResult(true, next, effects, null);
  }

  return tigranResult(false, state, [], 'unknown_action');
}

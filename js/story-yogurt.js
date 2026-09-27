'use strict';

const YOGURT_STATUS = Object.freeze(['dormant', 'stolen', 'discovered', 'resolved']);
const YOGURT_CHOICES = Object.freeze(['admit', 'bleb', 'silent']);
const YOGURT_DISCOVERY_SECONDS = 10;
const YOGURT_LATE_RESPONSE_SECONDS = 20;
const YOGURT_RESPONSE_MINUTE = 17 * 60;

function createYogurtStory() {
  return {
    schemaVersion: 1,
    status: 'dormant',
    shiftId: null,
    sourceId: null,
    startedAtClockMinutes: null,
    detectionElapsed: 0,
    discoveredAtClockMinutes: null,
    responseSecondsRemaining: null,
    resolution: null,
    outcome: null,
  };
}

function isYogurtStoryState(state) {
  const valid = !!state && state.schemaVersion === 1 && YOGURT_STATUS.includes(state.status)
    && (state.shiftId === null || (typeof state.shiftId === 'string' && !!state.shiftId))
    && (state.sourceId === null || (typeof state.sourceId === 'string' && !!state.sourceId))
    && (state.startedAtClockMinutes === null || Number.isFinite(state.startedAtClockMinutes))
    && Number.isFinite(state.detectionElapsed) && state.detectionElapsed >= 0
    && (state.discoveredAtClockMinutes === null || Number.isFinite(state.discoveredAtClockMinutes))
    && (state.responseSecondsRemaining === null || (Number.isFinite(state.responseSecondsRemaining) && state.responseSecondsRemaining >= 0))
    && (state.resolution === null || YOGURT_CHOICES.includes(state.resolution))
    && (state.outcome === null || ['coffee', 'bleb', 'silent', 'shift_end'].includes(state.outcome));
  return !!valid && (state.status === 'dormant' || (!!state.shiftId && !!state.sourceId));
}

function yogurtClone(state) {
  return { ...state };
}

function yogurtResult(ok, state, effects, reason) {
  return { ok, state, effects: effects || [], reason: reason || null };
}

function yogurtContextError(context, required) {
  if (!context || typeof context !== 'object') return 'missing_context';
  for (const key of required) {
    if (!(key in context)) return `missing_${key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)}`;
  }
  if ('clockMinutes' in context && (!Number.isFinite(context.clockMinutes) || context.clockMinutes < 0)) return 'invalid_clock';
  if ('dt' in context && (!Number.isFinite(context.dt) || context.dt < 0)) return 'invalid_dt';
  for (const key of ['paused', 'legalAway', 'shiftEnded', 'ownerAvailable', 'blebFavorAvailable', 'coffeeCompletedAfterDiscovery']) {
    if (key in context && typeof context[key] !== 'boolean') return `invalid_${key}`;
  }
  return null;
}

function yogurtEffectId(state, outcome, effect) {
  return `${state.shiftId}:yogurt:${state.sourceId}:${outcome}:${effect}`;
}

function yogurtRelationshipEffect(state, outcome, npcId, kind) {
  const eventId = yogurtEffectId(state, outcome, `relationship:${npcId}`);
  return {
    id: yogurtEffectId(state, outcome, `apply:${npcId}`),
    type: 'relationship',
    npcId,
    kind,
    eventId,
  };
}

function yogurtStoryMomentEffect(state, outcome) {
  return {
    id: yogurtEffectId(state, outcome, 'moment'),
    type: 'awardMoment',
    momentId: 'story',
    sourceId: `${state.shiftId}:${state.sourceId}:yogurt:${outcome}`,
  };
}

function yogurtMessageEffect(state, outcome, lineId, ownerId) {
  return {
    id: yogurtEffectId(state, outcome, `message:${lineId}`),
    type: 'message',
    lineId,
    ownerId,
  };
}

function startYogurtStory(state, context) {
  if (!isYogurtStoryState(state)) return yogurtResult(false, state, [], 'invalid_state');
  const error = yogurtContextError(context, ['shiftId', 'sourceId', 'clockMinutes', 'shiftEnded']);
  if (error) return yogurtResult(false, state, [], error);
  if (state.status !== 'dormant') return yogurtResult(false, state, [], 'story_already_started');
  if (typeof context.shiftId !== 'string' || !context.shiftId) return yogurtResult(false, state, [], 'missing_shift_id');
  if (typeof context.sourceId !== 'string' || !context.sourceId) return yogurtResult(false, state, [], 'missing_source_id');
  if (context.shiftEnded) return yogurtResult(false, state, [], 'shift_ended');
  const next = yogurtClone(state);
  next.status = 'stolen';
  next.shiftId = context.shiftId;
  next.sourceId = context.sourceId;
  next.startedAtClockMinutes = context.clockMinutes;
  return yogurtResult(true, next, [], null);
}

function discoverYogurtStory(state, clockMinutes) {
  const next = yogurtClone(state);
  next.status = 'discovered';
  next.discoveredAtClockMinutes = clockMinutes;
  if (clockMinutes >= YOGURT_RESPONSE_MINUTE) next.responseSecondsRemaining = YOGURT_LATE_RESPONSE_SECONDS;
  const effects = [
    yogurtRelationshipEffect(next, 'discovered', 'hlad', 'betrayal'),
    yogurtMessageEffect(next, 'discovered', 'yogurt.discovered', 'hlad'),
  ];
  return yogurtResult(true, next, effects, null);
}

function resolveYogurtTimeout(state, outcome) {
  const next = yogurtClone(state);
  next.status = 'resolved';
  next.resolution = 'silent';
  next.outcome = outcome;
  next.responseSecondsRemaining = 0;
  const effects = [yogurtMessageEffect(next, outcome, 'yogurt.timeout', 'hlad')];
  return yogurtResult(true, next, effects, null);
}

function yogurtResponseExpired(state, clockMinutes) {
  return clockMinutes >= YOGURT_RESPONSE_MINUTE
    && (state.responseSecondsRemaining === null || state.responseSecondsRemaining <= 0);
}

function tickYogurtStory(state, context) {
  if (!isYogurtStoryState(state)) return yogurtResult(false, state, [], 'invalid_state');
  const error = yogurtContextError(context, ['dt', 'paused', 'clockMinutes', 'legalAway', 'shiftEnded', 'ownerAvailable']);
  if (error) return yogurtResult(false, state, [], error);
  if (state.status === 'dormant') return yogurtResult(false, state, [], 'story_not_started');
  if (state.status === 'resolved') return yogurtResult(true, state, [], null);

  if (context.shiftEnded) {
    if (state.status === 'stolen') {
      const next = yogurtClone(state);
      next.status = 'resolved';
      next.resolution = 'silent';
      next.outcome = 'shift_end';
      next.responseSecondsRemaining = 0;
      return yogurtResult(true, next, [
        yogurtRelationshipEffect(next, 'shift_end', 'hlad', 'betrayal'),
        yogurtMessageEffect(next, 'shift_end', 'yogurt.timeout', 'hlad'),
      ], null);
    }
    return resolveYogurtTimeout(state, 'shift_end');
  }

  if (state.status === 'stolen') {
    if (context.paused || context.legalAway || !context.ownerAvailable || context.dt === 0) return yogurtResult(true, state, [], null);
    const nextElapsed = Math.min(YOGURT_DISCOVERY_SECONDS, state.detectionElapsed + context.dt);
    if (nextElapsed < YOGURT_DISCOVERY_SECONDS) {
      const next = yogurtClone(state);
      next.detectionElapsed = nextElapsed;
      return yogurtResult(true, next, [], null);
    }
    return discoverYogurtStory(state, context.clockMinutes);
  }

  if (context.paused || context.dt === 0 || context.legalAway || !context.ownerAvailable) return yogurtResult(true, state, [], null);
  if (state.responseSecondsRemaining !== null) {
    const remaining = Math.max(0, state.responseSecondsRemaining - context.dt);
    if (remaining === 0) return resolveYogurtTimeout(state, 'silent');
    if (remaining !== state.responseSecondsRemaining) {
      const next = yogurtClone(state);
      next.responseSecondsRemaining = remaining;
      return yogurtResult(true, next, [], null);
    }
  } else if (context.clockMinutes >= YOGURT_RESPONSE_MINUTE) {
    return resolveYogurtTimeout(state, 'silent');
  }
  return yogurtResult(true, state, [], null);
}

function chooseYogurtResolution(state, choice, context) {
  if (!isYogurtStoryState(state)) return yogurtResult(false, state, [], 'invalid_state');
  const error = yogurtContextError(context, ['clockMinutes', 'shiftEnded', 'legalAway', 'ownerAvailable', 'blebFavorAvailable', 'coffeeCompletedAfterDiscovery']);
  if (error) return yogurtResult(false, state, [], error);
  if (!YOGURT_CHOICES.includes(choice)) return yogurtResult(false, state, [], 'unknown_choice');
  if (state.status === 'resolved') return choice === state.resolution
    ? yogurtResult(true, state, [], null)
    : yogurtResult(false, state, [], 'resolution_locked');
  if (state.status !== 'discovered') return yogurtResult(false, state, [], 'story_not_discovered');
  if (context.shiftEnded) return yogurtResult(false, state, [], 'shift_ended');
  if (context.legalAway || !context.ownerAvailable) return yogurtResult(false, state, [], 'owner_unavailable');
  if (yogurtResponseExpired(state, context.clockMinutes)) return yogurtResult(false, state, [], 'response_expired');
  if (state.resolution && state.resolution !== choice) return yogurtResult(false, state, [], 'resolution_locked');
  if (choice === 'bleb' && !context.blebFavorAvailable) return yogurtResult(false, state, [], 'favor_unavailable');

  if (choice === 'admit') {
    if (state.resolution === 'admit') return yogurtResult(true, state, [], null);
    const next = yogurtClone(state);
    next.resolution = 'admit';
    return yogurtResult(true, next, [], null);
  }
  if (choice === 'silent') {
    if (state.resolution === 'silent') return yogurtResult(true, state, [], null);
    const next = yogurtClone(state);
    next.resolution = 'silent';
    return yogurtResult(true, next, [], null);
  }

  const next = yogurtClone(state);
  next.status = 'resolved';
  next.resolution = 'bleb';
  next.outcome = 'bleb';
  const favorEventId = yogurtEffectId(next, 'bleb', 'favor:bleb');
  return yogurtResult(true, next, [
    { id: yogurtEffectId(next, 'bleb', 'consume:bleb'), type: 'consumeFavor', npcId: 'bleb', eventId: favorEventId },
    yogurtRelationshipEffect(next, 'bleb', 'hlad', 'apology'),
    yogurtStoryMomentEffect(next, 'bleb'),
    yogurtMessageEffect(next, 'bleb', 'yogurt.bleb_resolved', 'hlad'),
  ], null);
}

function completeYogurtCoffee(state, context) {
  if (!isYogurtStoryState(state)) return yogurtResult(false, state, [], 'invalid_state');
  const error = yogurtContextError(context, ['clockMinutes', 'shiftEnded', 'legalAway', 'ownerAvailable', 'coffeeCompletedAfterDiscovery']);
  if (error) return yogurtResult(false, state, [], error);
  if (state.status === 'resolved' && state.outcome === 'coffee') return yogurtResult(true, state, [], null);
  if (state.status !== 'discovered' || state.resolution !== 'admit') return yogurtResult(false, state, [], 'admission_not_selected');
  if (context.shiftEnded) return yogurtResult(false, state, [], 'shift_ended');
  if (context.legalAway || !context.ownerAvailable) return yogurtResult(false, state, [], 'owner_unavailable');
  if (yogurtResponseExpired(state, context.clockMinutes)) return yogurtResult(false, state, [], 'response_expired');
  if (!context.coffeeCompletedAfterDiscovery) return yogurtResult(false, state, [], 'coffee_required');

  const next = yogurtClone(state);
  next.status = 'resolved';
  next.outcome = 'coffee';
  return yogurtResult(true, next, [
    yogurtRelationshipEffect(next, 'coffee', 'hlad', 'apology'),
    yogurtStoryMomentEffect(next, 'coffee'),
    yogurtMessageEffect(next, 'coffee', 'yogurt.coffee_resolved', 'hlad'),
  ], null);
}

'use strict';

const AUTOSHKA_BRANCHES = Object.freeze(['reliable', 'quick']);
const AUTOSHKA_DURATION_SECONDS = Object.freeze({ reliable: 6, quick: 3 });
const AUTOSHKA_FAILURE_DELAY_SECONDS = 12;

function createAutoshkaChoice(context) {
  const error = autoshkaContextError(context, ['eventActive', 'eventId', 'eventRemaining', 'sirgeyAvailable', 'playerAtDesk', 'legalAway', 'clockMinutes']);
  if (error) return autoshkaResult(false, null, [], error);
  if (!context.eventActive) return autoshkaResult(false, null, [], 'event_inactive');
  if (typeof context.eventId !== 'string' || !context.eventId) return autoshkaResult(false, null, [], 'missing_event_id');
  if (context.eventRemaining < AUTOSHKA_DURATION_SECONDS.quick) return autoshkaResult(false, null, [], 'event_too_short');
  if (!context.sirgeyAvailable) return autoshkaResult(false, null, [], 'sirgey_unavailable');
  if (!context.playerAtDesk) return autoshkaResult(false, null, [], 'not_at_sirgey_desk');
  if (context.legalAway) return autoshkaResult(false, null, [], 'legal_away');
  const state = {
    schemaVersion: 1,
    eventId: context.eventId,
    status: 'choice',
    createdAtClockMinutes: context.clockMinutes,
    options: {
      reliable: context.eventRemaining >= AUTOSHKA_DURATION_SECONDS.reliable,
      quick: true,
    },
    branch: null,
    remaining: 0,
    outcome: null,
    pendingFailure: null,
  };
  return autoshkaResult(true, state, [], null);
}

function autoshkaContextError(context, required) {
  if (!context || typeof context !== 'object') return 'missing_context';
  for (const key of required) {
    if (!(key in context)) return `missing_${key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)}`;
  }
  for (const key of ['eventActive', 'sirgeyAvailable', 'playerAtDesk', 'legalAway', 'paused', 'shiftEnded']) {
    if (key in context && typeof context[key] !== 'boolean') return `invalid_${key}`;
  }
  if ('eventRemaining' in context && (!Number.isFinite(context.eventRemaining) || context.eventRemaining < 0)) return 'invalid_event_remaining';
  if ('clockMinutes' in context && (!Number.isFinite(context.clockMinutes) || context.clockMinutes < 0)) return 'invalid_clock';
  if ('dt' in context && (!Number.isFinite(context.dt) || context.dt < 0)) return 'invalid_dt';
  return null;
}

function isAutoshkaState(state) {
  if (!state || state.schemaVersion !== 1 || typeof state.eventId !== 'string' || !state.eventId) return false;
  if (!['choice', 'repairing', 'completed', 'cancelled'].includes(state.status)) return false;
  if (!Number.isFinite(state.createdAtClockMinutes) || state.createdAtClockMinutes < 0) return false;
  if (!state.options || typeof state.options.reliable !== 'boolean' || typeof state.options.quick !== 'boolean') return false;
  if (state.branch !== null && !AUTOSHKA_BRANCHES.includes(state.branch)) return false;
  if (!Number.isFinite(state.remaining) || state.remaining < 0) return false;
  if (state.outcome !== null && !AUTOSHKA_BRANCHES.includes(state.outcome)) return false;
  if (state.pendingFailure !== null) {
    const pending = state.pendingFailure;
    if (!pending || !Number.isFinite(pending.remaining) || pending.remaining < 0
      || !['pending', 'applied', 'discarded'].includes(pending.status)) return false;
  }
  return true;
}

function cloneAutoshkaState(state) {
  return {
    ...state,
    options: { ...state.options },
    pendingFailure: state.pendingFailure ? { ...state.pendingFailure } : null,
  };
}

function autoshkaResult(ok, state, effects, reason) {
  return { ok, state, effects: effects || [], reason: reason || null };
}

function autoshkaEffectId(state, outcome, suffix) {
  return `${state.eventId}:autoshka:${outcome}:${suffix}`;
}

function startAutoshkaRepair(state, branch, context) {
  if (!isAutoshkaState(state)) return autoshkaResult(false, state, [], 'invalid_state');
  const error = autoshkaContextError(context, ['eventActive', 'eventId', 'eventRemaining', 'sirgeyAvailable', 'playerAtDesk', 'legalAway', 'clockMinutes']);
  if (error) return autoshkaResult(false, state, [], error);
  if (!AUTOSHKA_BRANCHES.includes(branch)) return autoshkaResult(false, state, [], 'unknown_branch');
  if (typeof context.eventId !== 'string' || !context.eventId) return autoshkaResult(false, state, [], 'missing_event_id');
  if (context.eventId !== state.eventId) return autoshkaResult(false, state, [], 'event_mismatch');
  if (state.status === 'repairing') return state.branch === branch
    ? autoshkaResult(true, state, [], null)
    : autoshkaResult(false, state, [], 'branch_locked');
  if (state.status !== 'choice') return autoshkaResult(false, state, [], 'choice_closed');
  if (!context.eventActive || context.eventId !== state.eventId) return autoshkaResult(false, state, [], 'event_inactive');
  if (!context.sirgeyAvailable) return autoshkaResult(false, state, [], 'sirgey_unavailable');
  if (!context.playerAtDesk) return autoshkaResult(false, state, [], 'not_at_sirgey_desk');
  if (context.legalAway) return autoshkaResult(false, state, [], 'legal_away');
  const duration = AUTOSHKA_DURATION_SECONDS[branch];
  if (!state.options[branch] || context.eventRemaining < duration) return autoshkaResult(false, state, [], 'event_too_short');
  const next = cloneAutoshkaState(state);
  next.status = 'repairing';
  next.branch = branch;
  next.remaining = duration;
  return autoshkaResult(true, next, [], null);
}

function finishAutoshkaRepair(state) {
  const next = cloneAutoshkaState(state);
  next.status = 'completed';
  next.remaining = 0;
  next.outcome = state.branch;
  if (state.branch === 'reliable') {
    const relationshipEventId = autoshkaEffectId(next, 'reliable', 'relationship:sirgey');
    return autoshkaResult(true, next, [
      { id: autoshkaEffectId(next, 'reliable', 'work'), type: 'addWork', amount: 6 },
      { id: autoshkaEffectId(next, 'reliable', 'apply-relationship'), type: 'relationship', npcId: 'sirgey', kind: 'help', eventId: relationshipEventId },
      { id: autoshkaEffectId(next, 'reliable', 'moment'), type: 'awardMoment', momentId: 'colleagueHelp', sourceId: `${next.eventId}:autoshka:reliable` },
    ], null);
  }
  next.pendingFailure = { remaining: AUTOSHKA_FAILURE_DELAY_SECONDS, status: 'pending' };
  return autoshkaResult(true, next, [
    { id: autoshkaEffectId(next, 'quick', 'work'), type: 'addWork', amount: 3 },
  ], null);
}

function resolveAutoshkaFailure(state, pending, status) {
  const next = cloneAutoshkaState(state);
  next.pendingFailure = { ...pending, remaining: 0, status };
  if (status === 'applied') {
    return autoshkaResult(true, next, [
      { id: autoshkaEffectId(next, 'quick', 'subtract-work'), type: 'subtractWork', amount: 6 },
      { id: autoshkaEffectId(next, 'quick', 'failure-message'), type: 'message', lineId: 'autoshka.quick_failure', ownerId: 'sirgey' },
    ], null);
  }
  return autoshkaResult(true, next, [], null);
}

function cancelAutoshkaRepair(state, cancelReason) {
  if (!isAutoshkaState(state)) return autoshkaResult(false, state, [], 'invalid_state');
  if (state.status === 'cancelled') return autoshkaResult(true, state, [], null);
  if (state.status !== 'choice' && state.status !== 'repairing') return autoshkaResult(false, state, [], 'repair_already_finished');
  if (cancelReason !== undefined && (typeof cancelReason !== 'string' || !cancelReason)) return autoshkaResult(false, state, [], 'invalid_cancel_reason');
  const next = cloneAutoshkaState(state);
  next.status = 'cancelled';
  next.remaining = 0;
  next.pendingFailure = null;
  return autoshkaResult(true, next, [], null);
}

function tickAutoshkaRepair(state, context) {
  if (!isAutoshkaState(state)) return autoshkaResult(false, state, [], 'invalid_state');
  if (state.status === 'cancelled') return autoshkaResult(true, state, [], null);
  if (state.status === 'choice') return autoshkaResult(false, state, [], 'repair_not_started');

  if (state.status === 'repairing') {
    const error = autoshkaContextError(context, ['dt', 'paused', 'eventActive', 'eventId', 'eventRemaining', 'sirgeyAvailable', 'playerAtDesk', 'legalAway', 'shiftEnded', 'clockMinutes']);
    if (error) return autoshkaResult(false, state, [], error);
    if (typeof context.eventId !== 'string' || !context.eventId) return autoshkaResult(false, state, [], 'missing_event_id');
    if (context.eventId !== state.eventId) return autoshkaResult(false, state, [], 'event_mismatch');
    if (context.paused || context.dt === 0) return autoshkaResult(true, state, [], null);
    if (context.shiftEnded) return cancelAutoshkaRepair(state, 'shift_ended');
    if (!context.eventActive) return cancelAutoshkaRepair(state, 'event_ended');
    if (!context.sirgeyAvailable) return cancelAutoshkaRepair(state, 'sirgey_unavailable');
    if (!context.playerAtDesk) return cancelAutoshkaRepair(state, 'player_left_desk');
    if (context.legalAway) return cancelAutoshkaRepair(state, 'legal_away');
    const activeSeconds = Math.min(context.dt, context.eventRemaining);
    const remaining = Math.max(0, state.remaining - activeSeconds);
    if (remaining === 0) return finishAutoshkaRepair(state);
    if (context.dt >= context.eventRemaining) return cancelAutoshkaRepair(state, 'event_ended_before_completion');
    const next = cloneAutoshkaState(state);
    next.remaining = remaining;
    return autoshkaResult(true, next, [], null);
  }

  if (state.status === 'completed' && state.outcome === 'quick' && state.pendingFailure && state.pendingFailure.status === 'pending') {
    const error = autoshkaContextError(context, ['dt', 'paused', 'legalAway', 'shiftEnded', 'clockMinutes']);
    if (error) return autoshkaResult(false, state, [], error);
    const elapsed = context.paused ? 0 : context.dt;
    const remaining = Math.max(0, state.pendingFailure.remaining - elapsed);
    const pending = { ...state.pendingFailure, remaining, due: remaining === 0 };
    if (remaining === 0 && !context.paused && (!context.legalAway || context.shiftEnded)) return resolveAutoshkaFailure(state, pending, 'applied');
    if (context.shiftEnded) return resolveAutoshkaFailure(state, pending, 'discarded');
    if (remaining !== state.pendingFailure.remaining || pending.due !== state.pendingFailure.due) {
      const next = cloneAutoshkaState(state);
      next.pendingFailure = pending;
      return autoshkaResult(true, next, [], null);
    }
    return autoshkaResult(true, state, [], null);
  }
  return autoshkaResult(true, state, [], null);
}

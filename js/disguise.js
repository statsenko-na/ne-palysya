'use strict';

function createDisguise() {
  return {
    shiftId: null,
    nextAttemptId: 1,
    used: false,
    active: null,
    lastOutcome: null
  };
}

function disguiseStateIsValid(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return false;
  if (!(state.shiftId === null || (typeof state.shiftId === 'string' && state.shiftId.length > 0))) return false;
  if (!Number.isInteger(state.nextAttemptId) || state.nextAttemptId < 1 || typeof state.used !== 'boolean') return false;
  if (!(state.lastOutcome === null || typeof state.lastOutcome === 'string')) return false;
  if (state.active === null) return true;
  const active = state.active;
  if (!active || typeof active !== 'object' || !['preparing', 'active'].includes(active.phase)) return false;
  if (typeof active.sourceId !== 'string' || !active.sourceId) return false;
  if (!Number.isFinite(active.remainingSeconds) || active.remainingSeconds < 0) return false;
  return active.phase === 'preparing'
    ? active.remainingSeconds <= 2
    : active.remainingSeconds <= 12;
}

function cloneDisguise(state) {
  return {
    shiftId: state.shiftId,
    nextAttemptId: state.nextAttemptId,
    used: state.used,
    active: state.active ? {
      phase: state.active.phase,
      sourceId: state.active.sourceId,
      remainingSeconds: state.active.remainingSeconds
    } : null,
    lastOutcome: state.lastOutcome
  };
}

function disguiseTransition(state, ok, reason, cover) {
  return { ok: ok, state: state, effects: [], reason: reason, cover: cover };
}

function beginDisguise(state, context) {
  if (!disguiseStateIsValid(state)) return disguiseTransition(state, false, 'state_invalid', false);
  if (!context || typeof context !== 'object') return disguiseTransition(state, false, 'context_missing', false);
  if (typeof context.shiftId !== 'string' || !context.shiftId ||
      typeof context.printerAvailable !== 'boolean' ||
      typeof context.action !== 'string' ||
      typeof context.paused !== 'boolean' ||
      typeof context.shiftEnded !== 'boolean') {
    return disguiseTransition(state, false, 'context_missing', false);
  }
  if (state.shiftId && state.shiftId !== context.shiftId) return disguiseTransition(state, false, 'shift_mismatch', false);
  if (state.active) return disguiseTransition(state, false, 'busy', false);
  if (state.used) return disguiseTransition(state, false, 'already_used', false);
  if (context.paused) return disguiseTransition(state, false, 'paused', false);
  if (context.shiftEnded) return disguiseTransition(state, false, 'shift_ended', false);
  if (!context.printerAvailable) return disguiseTransition(state, false, 'printer_unavailable', false);
  if (context.action !== 'none') return disguiseTransition(state, false, 'action_busy', false);

  const next = cloneDisguise(state);
  const attemptId = next.nextAttemptId;
  next.shiftId = context.shiftId;
  next.nextAttemptId += 1;
  next.active = {
    phase: 'preparing',
    sourceId: context.shiftId + ':disguise:' + attemptId,
    remainingSeconds: 2
  };
  next.lastOutcome = null;
  return disguiseTransition(next, true, null, false);
}

function tickDisguise(state, dt, context) {
  if (!disguiseStateIsValid(state)) return disguiseTransition(state, false, 'state_invalid', false);
  if (!Number.isFinite(dt) || dt < 0) return disguiseTransition(state, false, 'dt_invalid', false);
  if (!context || typeof context !== 'object' ||
      typeof context.action !== 'string' ||
      typeof context.paused !== 'boolean' ||
      typeof context.shiftEnded !== 'boolean') {
    return disguiseTransition(state, false, 'context_missing', false);
  }
  if (!state.active) return disguiseTransition(state, false, 'not_active', false);
  if (context.paused) return disguiseTransition(state, true, null, false);

  const next = cloneDisguise(state);
  if (context.shiftEnded) {
    next.active = null;
    next.lastOutcome = 'shift_ended';
    return disguiseTransition(next, true, null, false);
  }
  if (next.active.phase === 'preparing') {
    if (context.action !== 'takeFolder') {
      next.active = null;
      next.lastOutcome = 'preparation_cancelled';
      return disguiseTransition(next, true, null, false);
    }
    const prepConsumed = Math.min(dt, next.active.remainingSeconds);
    next.active.remainingSeconds = Math.max(0, next.active.remainingSeconds - prepConsumed);
    if (next.active.remainingSeconds > 0) return disguiseTransition(next, true, null, false);

    next.active.phase = 'active';
    next.active.remainingSeconds = 12;
    next.used = true;
    const remainder = Math.max(0, dt - prepConsumed);
    next.active.remainingSeconds = Math.max(0, next.active.remainingSeconds - remainder);
    if (next.active.remainingSeconds <= 0) {
      next.active = null;
      next.lastOutcome = 'expired';
    }
    return disguiseTransition(next, true, null, next.active !== null);
  }
  if (context.action === 'rest') {
    next.active = null;
    next.used = true;
    next.lastOutcome = 'rest_started';
    return disguiseTransition(next, true, null, false);
  }
  next.active.remainingSeconds = Math.max(0, next.active.remainingSeconds - dt);
  if (next.active.remainingSeconds <= 0) {
    next.active = null;
    next.used = true;
    next.lastOutcome = 'expired';
    return disguiseTransition(next, true, null, false);
  }
  return disguiseTransition(next, true, null, true);
}

function cancelDisguise(state, reason) {
  if (!disguiseStateIsValid(state)) return disguiseTransition(state, false, 'state_invalid', false);
  if (!state.active) return disguiseTransition(state, false, 'not_active', false);
  if (reason && reason !== 'cancel' && reason !== 'rest_started' && reason !== 'shift_ended') {
    return disguiseTransition(state, false, 'reason_invalid', false);
  }
  const next = cloneDisguise(state);
  const wasActive = next.active.phase === 'active';
  next.active = null;
  if (wasActive && reason !== 'shift_ended') next.used = true;
  next.lastOutcome = reason || 'cancel';
  return disguiseTransition(next, true, null, false);
}

function canDisguiseCover(state, context) {
  if (!disguiseStateIsValid(state)) return { ok: false, cover: false, reason: 'state_invalid' };
  if (!context || typeof context !== 'object' ||
      typeof context.moving !== 'boolean' ||
      typeof context.action !== 'string' ||
      !Number.isFinite(context.bossDistance) || context.bossDistance < 0 ||
      typeof context.isRaid !== 'boolean' ||
      typeof context.paused !== 'boolean' ||
      typeof context.shiftEnded !== 'boolean') {
    return { ok: false, cover: false, reason: 'context_missing' };
  }
  if (context.paused) return { ok: true, cover: false, reason: 'paused' };
  if (context.shiftEnded) return { ok: true, cover: false, reason: 'shift_ended' };
  if (!state.active || state.active.phase !== 'active' || !state.used) {
    return { ok: true, cover: false, reason: 'inactive' };
  }
  if (!context.isRaid) return { ok: true, cover: false, reason: 'not_raid' };
  if (!context.moving || context.action !== 'none') return { ok: true, cover: false, reason: 'not_moving' };
  if (context.bossDistance <= 34) return { ok: true, cover: false, reason: 'boss_too_close' };
  return { ok: true, cover: true, reason: null };
}

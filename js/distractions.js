'use strict';

const DISTRACTION_KINDS = ['printer', 'colleague'];
const DISTRACTION_BOSS_STATES = ['office', 'patrol', 'look', 'return'];

function createDistractions() {
  return {
    shiftId: null,
    successfulUses: 0,
    usedKinds: [],
    nextAttemptId: 1,
    cooldownRemaining: 0,
    active: null,
    lastOutcome: null
  };
}

function distractionStateIsValid(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return false;
  if (!(state.shiftId === null || (typeof state.shiftId === 'string' && state.shiftId.length > 0))) return false;
  if (!Number.isInteger(state.successfulUses) || state.successfulUses < 0 || state.successfulUses > 2) return false;
  if (!Array.isArray(state.usedKinds) || state.usedKinds.some(kind => !DISTRACTION_KINDS.includes(kind))) return false;
  if (!Number.isInteger(state.nextAttemptId) || state.nextAttemptId < 1) return false;
  if (!Number.isFinite(state.cooldownRemaining) || state.cooldownRemaining < 0) return false;
  if (!(state.lastOutcome === null || typeof state.lastOutcome === 'string')) return false;
  if (state.active === null) return true;
  const active = state.active;
  if (!active || typeof active !== 'object' || !['walking', 'occupied'].includes(active.phase)) return false;
  if (!DISTRACTION_KINDS.includes(active.kind)) return false;
  if (!Number.isInteger(active.attemptId) || active.attemptId < 1) return false;
  if (typeof active.sourceId !== 'string' || !active.sourceId) return false;
  if (!Number.isFinite(active.remainingSeconds) || active.remainingSeconds < 0) return false;
  if (typeof active.playerRestFinished !== 'boolean' || typeof active.momentAwarded !== 'boolean') return false;
  if (!active.target || typeof active.target !== 'object') return false;
  return Number.isFinite(active.target.x) && Number.isFinite(active.target.y) &&
    typeof active.target.id === 'string' && active.target.id.length > 0;
}

function cloneDistractions(state) {
  return {
    shiftId: state.shiftId,
    successfulUses: state.successfulUses,
    usedKinds: state.usedKinds.slice(),
    nextAttemptId: state.nextAttemptId,
    cooldownRemaining: state.cooldownRemaining,
    active: state.active ? {
      phase: state.active.phase,
      kind: state.active.kind,
      attemptId: state.active.attemptId,
      sourceId: state.active.sourceId,
      remainingSeconds: state.active.remainingSeconds,
      playerRestFinished: state.active.playerRestFinished,
      momentAwarded: state.active.momentAwarded,
      target: { id: state.active.target.id, x: state.active.target.x, y: state.active.target.y }
    } : null,
    lastOutcome: state.lastOutcome
  };
}

function distractionContextReason(state, context, kind) {
  if (!distractionStateIsValid(state)) return 'state_invalid';
  if (!context || typeof context !== 'object') return 'context_missing';
  const required = ['shiftId', 'bossState', 'paused', 'legalAway', 'shiftEnded', 'routeAvailable'];
  if (required.some(key => !Object.prototype.hasOwnProperty.call(context, key))) return 'context_missing';
  if (typeof context.shiftId !== 'string' || !context.shiftId ||
      typeof context.bossState !== 'string' ||
      typeof context.paused !== 'boolean' ||
      typeof context.legalAway !== 'boolean' ||
      typeof context.shiftEnded !== 'boolean' ||
      typeof context.routeAvailable !== 'boolean') return 'context_invalid';
  if (!DISTRACTION_KINDS.includes(kind)) return 'kind_invalid';
  if (state.shiftId && state.shiftId !== context.shiftId) return 'shift_mismatch';
  if (state.active) return 'busy';
  if (context.paused) return 'paused';
  if (context.legalAway) return 'legal_away';
  if (context.shiftEnded) return 'shift_ended';
  if (!DISTRACTION_BOSS_STATES.includes(context.bossState)) return 'boss_unavailable';
  if (state.successfulUses >= 2) return 'limit_reached';
  if (state.usedKinds.includes(kind)) return 'kind_used';
  if (state.cooldownRemaining > 0) return 'cooldown';
  if (!context.routeAvailable) return 'route_unavailable';
  return null;
}

function canDistract(state, context, kind) {
  const reason = distractionContextReason(state, context, kind);
  return reason
    ? { ok: false, allowed: false, reason: reason }
    : { ok: true, allowed: true, reason: null };
}

function beginDistraction(state, context, kind, target) {
  const reason = distractionContextReason(state, context, kind);
  if (reason) return { ok: false, state: state, effects: [], reason: reason };
  if (!target || typeof target !== 'object' || typeof target.id !== 'string' || !target.id ||
      !Number.isFinite(target.x) || !Number.isFinite(target.y)) {
    return { ok: false, state: state, effects: [], reason: 'target_invalid' };
  }
  const next = cloneDistractions(state);
  const attemptId = next.nextAttemptId;
  next.shiftId = context.shiftId;
  next.nextAttemptId += 1;
  next.active = {
    phase: 'walking',
    kind: kind,
    attemptId: attemptId,
    sourceId: context.shiftId + ':distraction:' + attemptId,
    remainingSeconds: 12,
    playerRestFinished: false,
    momentAwarded: false,
    target: { id: target.id, x: target.x, y: target.y }
  };
  next.lastOutcome = null;
  return { ok: true, state: next, effects: [], reason: null };
}

function tickDistraction(state, dt, context) {
  if (!distractionStateIsValid(state)) return { ok: false, state: state, effects: [], reason: 'state_invalid' };
  if (!Number.isFinite(dt) || dt < 0) return { ok: false, state: state, effects: [], reason: 'dt_invalid' };
  if (!context || typeof context !== 'object' || typeof context.paused !== 'boolean') {
    return { ok: false, state: state, effects: [], reason: 'context_missing' };
  }
  if (state.active && state.active.phase === 'walking' && typeof context.arrived !== 'boolean') {
    return { ok: false, state: state, effects: [], reason: 'context_missing' };
  }
  if (context.paused) return { ok: true, state: state, effects: [], reason: null };

  const next = cloneDistractions(state);
  const active = next.active;
  if (!active) {
    next.cooldownRemaining = Math.max(0, next.cooldownRemaining - dt);
    return { ok: true, state: next, effects: [], reason: null };
  }
  if (active.phase === 'walking') {
    if (context.arrived) {
      active.phase = 'occupied';
      active.remainingSeconds = 6;
      next.successfulUses += 1;
      if (!next.usedKinds.includes(active.kind)) next.usedKinds.push(active.kind);
      return { ok: true, state: next, effects: [], reason: null };
    }
    active.remainingSeconds = Math.max(0, active.remainingSeconds - dt);
    if (active.remainingSeconds <= 0) {
      next.active = null;
      next.lastOutcome = 'walking_timeout';
    }
    return { ok: true, state: next, effects: [], reason: null };
  }

  active.remainingSeconds = Math.max(0, active.remainingSeconds - dt);
  if (active.remainingSeconds <= 0) {
    next.active = null;
    next.cooldownRemaining = 45;
    next.lastOutcome = 'done';
  }
  return { ok: true, state: next, effects: [], reason: null };
}

function finishDistraction(state, reason) {
  if (!distractionStateIsValid(state)) return { ok: false, state: state, effects: [], reason: 'state_invalid' };
  if (!state.active) return { ok: false, state: state, effects: [], reason: 'not_active' };
  if (reason === 'rest_completed' || reason === 'restCompleted') {
    if (state.active.phase !== 'occupied') {
      return { ok: false, state: state, effects: [], reason: 'not_occupied' };
    }
    if (state.active.momentAwarded) return { ok: true, state: state, effects: [], reason: null };
    const next = cloneDistractions(state);
    next.active.playerRestFinished = true;
    next.active.momentAwarded = true;
    return {
      ok: true,
      state: next,
      effects: [{
        id: next.active.sourceId + ':moment',
        type: 'awardMoment',
        momentId: 'distraction',
        sourceId: next.active.sourceId
      }],
      reason: null
    };
  }
  if (reason !== 'cancel' && reason !== 'interrupted') {
    return { ok: false, state: state, effects: [], reason: 'reason_invalid' };
  }
  const next = cloneDistractions(state);
  const wasOccupied = next.active.phase === 'occupied';
  next.active = null;
  if (wasOccupied) next.cooldownRemaining = 45;
  next.lastOutcome = reason;
  return { ok: true, state: next, effects: [], reason: null };
}

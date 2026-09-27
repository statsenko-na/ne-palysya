'use strict';
// Отвлечь Д.Н.: приманка у ксерокса или просьба к Блебу. Д.Н. идёт к цели (до 12 с), занят там 6 с,
// потом 45 с перезарядки. Не больше двух успешных отвлечений за смену и каждого вида по разу.

const DISTRACTION_KINDS = ['printer', 'colleague'];
const DISTRACTION_BOSS_STATES = ['office', 'patrol', 'look', 'return'];

function createDistractions() {
  return { shiftId: null, successfulUses: 0, usedKinds: [], nextAttemptId: 1, cooldownRemaining: 0, active: null, lastOutcome: null };
}

// Проверка нужна только при загрузке сохранения
function distractionStateIsValid(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return false;
  if (!(state.shiftId === null || (typeof state.shiftId === 'string' && state.shiftId))) return false;
  if (!Number.isInteger(state.successfulUses) || state.successfulUses < 0 || state.successfulUses > 2) return false;
  if (!Array.isArray(state.usedKinds) || state.usedKinds.some(kind => !DISTRACTION_KINDS.includes(kind))) return false;
  if (!Number.isInteger(state.nextAttemptId) || !Number.isFinite(state.cooldownRemaining)) return false;
  if (state.active === null) return true;
  const active = state.active;
  return !!active && ['walking', 'occupied'].includes(active.phase) && DISTRACTION_KINDS.includes(active.kind) &&
    typeof active.sourceId === 'string' && Number.isFinite(active.remainingSeconds) &&
    !!active.target && Number.isFinite(active.target.x) && Number.isFinite(active.target.y);
}

function distractionContextReason(state, context, kind) {
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
  return { ok: !reason, allowed: !reason, reason };
}

function beginDistraction(state, context, kind, target) {
  const reason = distractionContextReason(state, context, kind);
  if (reason) return { ok: false, state, effects: [], reason };
  const next = structuredClone(state);
  const attemptId = next.nextAttemptId++;
  next.shiftId = context.shiftId;
  next.active = {
    phase: 'walking', kind, attemptId,
    sourceId: `${context.shiftId}:distraction:${attemptId}`,
    remainingSeconds: 12,
    playerRestFinished: false,
    momentAwarded: false,
    target: { id: target.id, x: target.x, y: target.y },
  };
  next.lastOutcome = null;
  return { ok: true, state: next, effects: [], reason: null };
}

function tickDistraction(state, dt, context) {
  if (context.paused) return { ok: true, state, effects: [], reason: null };
  const next = structuredClone(state);
  const active = next.active;
  const done = () => ({ ok: true, state: next, effects: [], reason: null });
  if (!active) {
    next.cooldownRemaining = Math.max(0, next.cooldownRemaining - dt);
    return done();
  }
  if (active.phase === 'walking' && context.arrived) {
    active.phase = 'occupied';
    active.remainingSeconds = 6;
    next.successfulUses += 1;
    if (!next.usedKinds.includes(active.kind)) next.usedKinds.push(active.kind);
    return done();
  }
  active.remainingSeconds = Math.max(0, active.remainingSeconds - dt);
  if (active.remainingSeconds <= 0) {
    next.active = null;
    if (active.phase === 'walking') next.lastOutcome = 'walking_timeout';
    else { next.cooldownRemaining = 45; next.lastOutcome = 'done'; }
  }
  return done();
}

function finishDistraction(state, reason) {
  if (!state.active) return { ok: false, state, effects: [], reason: 'not_active' };
  if (reason === 'rest_completed' || reason === 'restCompleted') {
    if (state.active.phase !== 'occupied') return { ok: false, state, effects: [], reason: 'not_occupied' };
    if (state.active.momentAwarded) return { ok: true, state, effects: [], reason: null };
    const next = structuredClone(state);
    next.active.playerRestFinished = true;
    next.active.momentAwarded = true;
    const sourceId = next.active.sourceId;
    return { ok: true, state: next, effects: [{ id: `${sourceId}:moment`, type: 'awardMoment', momentId: 'distraction', sourceId }], reason: null };
  }
  const next = structuredClone(state);
  if (next.active.phase === 'occupied') next.cooldownRemaining = 45;
  next.active = null;
  next.lastOutcome = reason;
  return { ok: true, state: next, effects: [], reason: null };
}

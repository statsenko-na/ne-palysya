'use strict';
// «Папка» из ксерокса: 2 с подготовки, потом 12 с прикрытия во время рейда, пока Быкентий идёт и Д.Н. не рядом.
// Модель без DOM и игрового состояния: функции возвращают { ok, state, effects, reason, cover }.

function createDisguise() {
  return { shiftId: null, nextAttemptId: 1, used: false, active: null, lastOutcome: null };
}

// Проверка нужна только при загрузке сохранения
function disguiseStateIsValid(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return false;
  if (!(state.shiftId === null || (typeof state.shiftId === 'string' && state.shiftId))) return false;
  if (!Number.isInteger(state.nextAttemptId) || state.nextAttemptId < 1 || typeof state.used !== 'boolean') return false;
  if (state.active === null) return true;
  const active = state.active;
  return !!active && ['preparing', 'active'].includes(active.phase) && typeof active.sourceId === 'string' &&
    Number.isFinite(active.remainingSeconds) && active.remainingSeconds >= 0 &&
    active.remainingSeconds <= (active.phase === 'preparing' ? 2 : 12);
}

function disguiseTransition(state, ok, reason, cover) {
  return { ok, state, effects: [], reason, cover };
}

function beginDisguise(state, context) {
  if (state.shiftId && state.shiftId !== context.shiftId) return disguiseTransition(state, false, 'shift_mismatch', false);
  if (state.active) return disguiseTransition(state, false, 'busy', false);
  if (state.used) return disguiseTransition(state, false, 'already_used', false);
  if (context.paused) return disguiseTransition(state, false, 'paused', false);
  if (context.shiftEnded) return disguiseTransition(state, false, 'shift_ended', false);
  if (!context.printerAvailable) return disguiseTransition(state, false, 'printer_unavailable', false);
  if (context.action !== 'none') return disguiseTransition(state, false, 'action_busy', false);
  const next = structuredClone(state);
  next.shiftId = context.shiftId;
  next.active = { phase: 'preparing', sourceId: `${context.shiftId}:disguise:${next.nextAttemptId}`, remainingSeconds: 2 };
  next.nextAttemptId += 1;
  next.lastOutcome = null;
  return disguiseTransition(next, true, null, false);
}

function tickDisguise(state, dt, context) {
  if (!state.active) return disguiseTransition(state, false, 'not_active', false);
  if (context.paused) return disguiseTransition(state, true, null, false);
  const next = structuredClone(state);
  const finish = outcome => { next.active = null; next.lastOutcome = outcome; return disguiseTransition(next, true, null, false); };
  if (context.shiftEnded) return finish('shift_ended');
  if (next.active.phase === 'preparing') {
    if (context.action !== 'takeFolder') return finish('preparation_cancelled');
    const prep = Math.min(dt, next.active.remainingSeconds);
    next.active.remainingSeconds -= prep;
    if (next.active.remainingSeconds > 0) return disguiseTransition(next, true, null, false);
    next.active.phase = 'active';
    next.active.remainingSeconds = Math.max(0, 12 - (dt - prep));
    next.used = true;
    if (next.active.remainingSeconds <= 0) return finish('expired');
    return disguiseTransition(next, true, null, true);
  }
  next.used = true;
  if (context.action === 'rest') return finish('rest_started');
  next.active.remainingSeconds = Math.max(0, next.active.remainingSeconds - dt);
  if (next.active.remainingSeconds <= 0) return finish('expired');
  return disguiseTransition(next, true, null, true);
}

function cancelDisguise(state, reason) {
  if (!state.active) return disguiseTransition(state, false, 'not_active', false);
  const next = structuredClone(state);
  if (next.active.phase === 'active' && reason !== 'shift_ended') next.used = true;
  next.active = null;
  next.lastOutcome = reason || 'cancel';
  return disguiseTransition(next, true, null, false);
}

function canDisguiseCover(state, context) {
  if (context.paused) return { ok: true, cover: false, reason: 'paused' };
  if (context.shiftEnded) return { ok: true, cover: false, reason: 'shift_ended' };
  if (!state.active || state.active.phase !== 'active' || !state.used) return { ok: true, cover: false, reason: 'inactive' };
  if (!context.isRaid) return { ok: true, cover: false, reason: 'not_raid' };
  if (!context.moving || context.action !== 'none') return { ok: true, cover: false, reason: 'not_moving' };
  if (context.bossDistance <= 34) return { ok: true, cover: false, reason: 'boss_too_close' };
  return { ok: true, cover: true, reason: null };
}

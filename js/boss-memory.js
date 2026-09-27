'use strict';
// Память Д.Н.: после видимой поимки или раскрытия автокликера он до 60 с помнит ближайшее безопасное место
// и в 35% обычных обходов может туда заглянуть. Не больше двух воспоминаний за смену.

const BOSS_MEMORY_INCIDENT_TYPES = ['caught', 'autoclicker_exposed'];

function createBossMemory() {
  return { shiftId: null, recordedCount: 0, seenIncidentIds: [], observations: [] };
}

// Проверка нужна только при загрузке сохранения
function bossMemoryStateIsValid(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return false;
  if (!(state.shiftId === null || (typeof state.shiftId === 'string' && state.shiftId))) return false;
  if (!Number.isInteger(state.recordedCount) || state.recordedCount < 0 || state.recordedCount > 2) return false;
  if (!Array.isArray(state.seenIncidentIds) || state.seenIncidentIds.length !== state.recordedCount) return false;
  if (!Array.isArray(state.observations) || state.observations.length > state.recordedCount) return false;
  return state.observations.every(point => point && typeof point.id === 'string' &&
    BOSS_MEMORY_INCIDENT_TYPES.includes(point.incidentType) && Number.isFinite(point.x) && Number.isFinite(point.y) &&
    Number.isFinite(point.remainingSeconds) && point.remainingSeconds > 0 && typeof point.consumed === 'boolean');
}

function bossMemoryTransition(state, ok, effects, reason, choice) {
  return {
    ok, state, effects, reason,
    chosen: !!choice,
    targetId: choice ? choice.id : null,
    point: choice ? { id: choice.id, x: choice.x, y: choice.y } : null,
  };
}

function observeBossIncident(state, context) {
  const fail = reason => bossMemoryTransition(state, false, [], reason, null);
  if (!BOSS_MEMORY_INCIDENT_TYPES.includes(context.incidentType)) return fail('incident_invalid');
  if (state.shiftId && state.shiftId !== context.shiftId) return fail('shift_mismatch');
  if (!context.visible) return fail('not_observed');
  if (state.seenIncidentIds.includes(context.incidentId)) return fail('duplicate_incident');
  if (state.recordedCount >= 2) return fail('limit_reached');
  const next = structuredClone(state);
  next.shiftId = context.shiftId;
  next.recordedCount += 1;
  next.seenIncidentIds.push(context.incidentId);
  next.observations.push({
    id: `${context.shiftId}:boss-memory:${next.recordedCount}`,
    incidentId: context.incidentId,
    incidentType: context.incidentType,
    x: context.safeSpot.x,
    y: context.safeSpot.y,
    remainingSeconds: 60,
    consumed: false,
  });
  return bossMemoryTransition(next, true, [], null, null);
}

function tickBossMemory(state, dt, context) {
  if (context.paused) return bossMemoryTransition(state, true, [], null, null);
  const next = structuredClone(state);
  next.observations = next.observations
    .map(point => ({ ...point, remainingSeconds: Math.max(0, point.remainingSeconds - dt) }))
    .filter(point => point.remainingSeconds > 0);
  return bossMemoryTransition(next, true, [], null, null);
}

function chooseRememberedSpot(state, context) {
  if (state.shiftId && state.shiftId !== context.shiftId) return bossMemoryTransition(state, false, [], 'shift_mismatch', null);
  if (!context.normalStroll) return bossMemoryTransition(state, false, [], 'not_normal_stroll', null);
  const available = state.observations.filter(point =>
    !point.consumed && point.remainingSeconds > 0 && context.availablePointIds.includes(point.id));
  if (!available.length) return bossMemoryTransition(state, true, [], null, null);
  if (context.randomSample >= 0.35) return bossMemoryTransition(state, true, [], 'not_selected', null);
  const selected = available[0];
  const next = structuredClone(state);
  next.observations.find(item => item.id === selected.id).consumed = true;
  const effects = [
    { id: `${selected.id}:route`, type: 'requestBossRoute', targetId: selected.id, reasonId: 'boss_memory' },
    { id: `${selected.id}:message`, type: 'message', lineId: 'bossRememberedSpot', ownerId: 'boss' },
  ];
  return bossMemoryTransition(next, true, effects, null, selected);
}

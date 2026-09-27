'use strict';

const BOSS_MEMORY_INCIDENT_TYPES = ['caught', 'autoclicker_exposed'];

function createBossMemory() {
  return {
    shiftId: null,
    recordedCount: 0,
    seenIncidentIds: [],
    observations: []
  };
}

function bossMemoryStateIsValid(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return false;
  if (!(state.shiftId === null || (typeof state.shiftId === 'string' && state.shiftId.length > 0))) return false;
  if (!Number.isInteger(state.recordedCount) || state.recordedCount < 0 || state.recordedCount > 2) return false;
  if (!Array.isArray(state.seenIncidentIds) || state.seenIncidentIds.length !== state.recordedCount ||
      state.seenIncidentIds.some(id => typeof id !== 'string' || !id)) return false;
  if (!Array.isArray(state.observations) || state.observations.length > state.recordedCount) return false;
  return state.observations.every(point =>
    point && typeof point === 'object' &&
    typeof point.id === 'string' && point.id.length > 0 &&
    typeof point.incidentId === 'string' && point.incidentId.length > 0 &&
    BOSS_MEMORY_INCIDENT_TYPES.includes(point.incidentType) &&
    Number.isFinite(point.x) && Number.isFinite(point.y) &&
    Number.isFinite(point.remainingSeconds) && point.remainingSeconds > 0 &&
    typeof point.consumed === 'boolean'
  );
}

function cloneBossMemory(state) {
  return {
    shiftId: state.shiftId,
    recordedCount: state.recordedCount,
    seenIncidentIds: state.seenIncidentIds.slice(),
    observations: state.observations.map(point => ({
      id: point.id,
      incidentId: point.incidentId,
      incidentType: point.incidentType,
      x: point.x,
      y: point.y,
      remainingSeconds: point.remainingSeconds,
      consumed: point.consumed
    }))
  };
}

function bossMemoryTransition(state, ok, effects, reason, choice) {
  return {
    ok: ok,
    state: state,
    effects: effects,
    reason: reason,
    chosen: choice ? true : false,
    targetId: choice ? choice.id : null,
    point: choice ? { id: choice.id, x: choice.x, y: choice.y } : null
  };
}

function observeBossIncident(state, context) {
  if (!bossMemoryStateIsValid(state)) return bossMemoryTransition(state, false, [], 'state_invalid', null);
  if (!context || typeof context !== 'object' ||
      typeof context.shiftId !== 'string' || !context.shiftId ||
      typeof context.incidentId !== 'string' || !context.incidentId ||
      typeof context.incidentType !== 'string' ||
      typeof context.visible !== 'boolean' ||
      !context.safeSpot || typeof context.safeSpot !== 'object') {
    return bossMemoryTransition(state, false, [], 'context_missing', null);
  }
  if (!BOSS_MEMORY_INCIDENT_TYPES.includes(context.incidentType)) {
    return bossMemoryTransition(state, false, [], 'incident_invalid', null);
  }
  if (state.shiftId && state.shiftId !== context.shiftId) {
    return bossMemoryTransition(state, false, [], 'shift_mismatch', null);
  }
  if (!context.visible) return bossMemoryTransition(state, false, [], 'not_observed', null);
  if (!Number.isFinite(context.safeSpot.x) || !Number.isFinite(context.safeSpot.y)) {
    return bossMemoryTransition(state, false, [], 'safe_spot_invalid', null);
  }
  if (state.seenIncidentIds.includes(context.incidentId)) {
    return bossMemoryTransition(state, false, [], 'duplicate_incident', null);
  }
  if (state.recordedCount >= 2) return bossMemoryTransition(state, false, [], 'limit_reached', null);

  const next = cloneBossMemory(state);
  const sequence = next.recordedCount + 1;
  next.shiftId = context.shiftId;
  next.recordedCount = sequence;
  next.seenIncidentIds.push(context.incidentId);
  const point = {
    id: context.shiftId + ':boss-memory:' + sequence,
    incidentId: context.incidentId,
    incidentType: context.incidentType,
    x: context.safeSpot.x,
    y: context.safeSpot.y,
    remainingSeconds: 60,
    consumed: false
  };
  next.observations.push(point);
  return bossMemoryTransition(next, true, [], null, null);
}

function tickBossMemory(state, dt, context) {
  if (!bossMemoryStateIsValid(state)) return bossMemoryTransition(state, false, [], 'state_invalid', null);
  if (!Number.isFinite(dt) || dt < 0) return bossMemoryTransition(state, false, [], 'dt_invalid', null);
  if (!context || typeof context !== 'object' || typeof context.paused !== 'boolean') {
    return bossMemoryTransition(state, false, [], 'context_missing', null);
  }
  if (context.paused) return bossMemoryTransition(state, true, [], null, null);
  const next = cloneBossMemory(state);
  next.observations = next.observations
    .map(point => Object.assign({}, point, {
      remainingSeconds: Math.max(0, point.remainingSeconds - dt)
    }))
    .filter(point => point.remainingSeconds > 0);
  return bossMemoryTransition(next, true, [], null, null);
}

function chooseRememberedSpot(state, context) {
  if (!bossMemoryStateIsValid(state)) return bossMemoryTransition(state, false, [], 'state_invalid', null);
  if (!context || typeof context !== 'object' ||
      typeof context.shiftId !== 'string' || !context.shiftId ||
      typeof context.normalStroll !== 'boolean' ||
      !Array.isArray(context.availablePointIds) ||
      !Object.prototype.hasOwnProperty.call(context, 'randomSample')) {
    return bossMemoryTransition(state, false, [], 'context_missing', null);
  }
  if (typeof context.randomSample !== 'number' || !Number.isFinite(context.randomSample) ||
      context.randomSample < 0 || context.randomSample > 1) {
    return bossMemoryTransition(state, false, [], 'context_invalid', null);
  }
  if (state.shiftId && state.shiftId !== context.shiftId) {
    return bossMemoryTransition(state, false, [], 'shift_mismatch', null);
  }
  if (!context.normalStroll) return bossMemoryTransition(state, false, [], 'not_normal_stroll', null);
  if (context.availablePointIds.some(id => typeof id !== 'string')) {
    return bossMemoryTransition(state, false, [], 'context_invalid', null);
  }
  const available = state.observations.filter(point =>
    !point.consumed && point.remainingSeconds > 0 && context.availablePointIds.includes(point.id)
  );
  if (!available.length) return bossMemoryTransition(state, true, [], null, null);
  if (context.randomSample >= 0.35) return bossMemoryTransition(state, true, [], 'not_selected', null);

  const selected = available[0];
  const next = cloneBossMemory(state);
  const point = next.observations.find(item => item.id === selected.id);
  point.consumed = true;
  const effects = [
    {
      id: selected.id + ':route',
      type: 'requestBossRoute',
      targetId: selected.id,
      reasonId: 'boss_memory'
    },
    {
      id: selected.id + ':message',
      type: 'message',
      lineId: 'bossRememberedSpot',
      ownerId: 'boss'
    }
  ];
  return bossMemoryTransition(next, true, effects, null, selected);
}

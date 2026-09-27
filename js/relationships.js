'use strict';

// Независимая недельная модель отношений. Адаптер передаёт дни и события явно.
const RELATIONSHIP_NPC_IDS = Object.freeze(['aimashyn', 'hlad', 'shurik', 'bleb', 'sirgey']);
const RELATIONSHIP_EVENT_KINDS = Object.freeze(['help', 'betrayal', 'apology']);

function createRelationships(ids) {
  const requestedIds = ids === undefined ? RELATIONSHIP_NPC_IDS : ids;
  if (!Array.isArray(requestedIds)) return { ok: false, reason: 'invalid_npc_list' };
  const uniqueIds = [];
  for (const id of requestedIds) {
    if (!RELATIONSHIP_NPC_IDS.includes(id)) return { ok: false, reason: 'unknown_npc' };
    if (!uniqueIds.includes(id)) uniqueIds.push(id);
  }
  const entries = {};
  for (const id of uniqueIds) {
    entries[id] = {
      mood: 'neutral',
      favorCredit: 0,
      angryThroughDay: null,
      helpedDay: null,
      favorUsedDay: null,
    };
  }
  return {
    schemaVersion: 1,
    dayIndex: null,
    npcIds: uniqueIds,
    appliedEventIds: [],
    entries,
  };
}

function relationshipDayIndex(value) {
  return Number.isInteger(value) && value >= 0 && value <= 4;
}

function isRelationshipsState(state) {
  if (!state || state.schemaVersion !== 1 || !Array.isArray(state.npcIds) || !Array.isArray(state.appliedEventIds) || !state.entries) return false;
  if (state.dayIndex !== null && !relationshipDayIndex(state.dayIndex)) return false;
  if (state.npcIds.some(id => !RELATIONSHIP_NPC_IDS.includes(id))) return false;
  if (new Set(state.npcIds).size !== state.npcIds.length) return false;
  if (state.appliedEventIds.some(id => typeof id !== 'string' || !id)) return false;
  return state.npcIds.every(id => {
    const entry = state.entries[id];
    return !!entry && ['neutral', 'friendly', 'angry'].includes(entry.mood)
      && Number.isInteger(entry.favorCredit) && entry.favorCredit >= 0 && entry.favorCredit <= 1
      && (entry.angryThroughDay === null || relationshipDayIndex(entry.angryThroughDay))
      && (entry.helpedDay === null || relationshipDayIndex(entry.helpedDay))
      && (entry.favorUsedDay === null || relationshipDayIndex(entry.favorUsedDay));
  });
}

function cloneRelationships(state) {
  const entries = {};
  for (const id of state.npcIds) entries[id] = { ...state.entries[id] };
  return {
    schemaVersion: 1,
    dayIndex: state.dayIndex,
    npcIds: state.npcIds.slice(),
    appliedEventIds: state.appliedEventIds.slice(),
    entries,
  };
}

function relationshipResult(ok, state, reason) {
  return { ok, state, effects: [], reason: reason || null };
}

function applyRelationshipEvent(state, event) {
  if (!isRelationshipsState(state)) return relationshipResult(false, state, 'invalid_state');
  if (!event || typeof event !== 'object') return relationshipResult(false, state, 'missing_event');
  const { eventId, npcId, kind, dayIndex } = event;
  if (typeof eventId !== 'string' || !eventId) return relationshipResult(false, state, 'missing_event_id');
  if (!RELATIONSHIP_NPC_IDS.includes(npcId) || !state.npcIds.includes(npcId)) return relationshipResult(false, state, 'unknown_npc');
  if (!RELATIONSHIP_EVENT_KINDS.includes(kind)) return relationshipResult(false, state, 'unknown_relationship_event');
  if (!relationshipDayIndex(dayIndex)) return relationshipResult(false, state, 'invalid_day');
  if (state.appliedEventIds.includes(eventId)) return relationshipResult(true, state, null);
  if (state.dayIndex !== null && state.dayIndex !== dayIndex) return relationshipResult(false, state, 'day_mismatch');

  const current = state.entries[npcId];
  if (kind === 'help' && current.helpedDay === dayIndex) return relationshipResult(false, state, 'help_already_used_today');
  if (kind === 'help' && current.mood === 'angry' && current.angryThroughDay !== null && dayIndex <= current.angryThroughDay) {
    return relationshipResult(false, state, 'relationship_angry');
  }

  const next = cloneRelationships(state);
  const entry = next.entries[npcId];
  next.dayIndex = dayIndex;
  next.appliedEventIds.push(eventId);
  if (kind === 'help') {
    entry.mood = 'friendly';
    entry.favorCredit = 1;
    entry.helpedDay = dayIndex;
  } else if (kind === 'betrayal') {
    entry.mood = 'angry';
    entry.favorCredit = 0;
    entry.angryThroughDay = Math.max(entry.angryThroughDay ?? -1, Math.min(dayIndex + 1, 4));
  } else if (entry.mood === 'angry') {
    entry.mood = 'neutral';
    entry.favorCredit = 0;
    entry.angryThroughDay = null;
  }
  return relationshipResult(true, next, null);
}

function canRequestFavor(state, npcId, dayIndex) {
  if (!isRelationshipsState(state)) return { ok: false, canRequest: false, reason: 'invalid_state' };
  if (!RELATIONSHIP_NPC_IDS.includes(npcId) || !state.npcIds.includes(npcId)) return { ok: false, canRequest: false, reason: 'unknown_npc' };
  if (!relationshipDayIndex(dayIndex)) return { ok: false, canRequest: false, reason: 'invalid_day' };
  if (state.dayIndex !== null && state.dayIndex !== dayIndex) return { ok: false, canRequest: false, reason: 'day_mismatch' };
  const entry = state.entries[npcId];
  const angry = entry.mood === 'angry' && entry.angryThroughDay !== null && dayIndex <= entry.angryThroughDay;
  const canRequest = entry.favorCredit === 1 && entry.favorUsedDay !== dayIndex && !angry;
  return { ok: true, canRequest, reason: canRequest ? null : 'favor_unavailable' };
}

function consumeFavor(state, npcId, dayIndex) {
  if (!isRelationshipsState(state)) return relationshipResult(false, state, 'invalid_state');
  const eligibility = canRequestFavor(state, npcId, dayIndex);
  if (!eligibility.ok) return relationshipResult(false, state, eligibility.reason);
  if (!eligibility.canRequest) return relationshipResult(false, state, 'favor_unavailable');
  const next = cloneRelationships(state);
  next.dayIndex = dayIndex;
  next.entries[npcId].favorCredit = 0;
  next.entries[npcId].favorUsedDay = dayIndex;
  return relationshipResult(true, next, null);
}

function advanceRelationshipsDay(state, nextDay) {
  if (!isRelationshipsState(state)) return relationshipResult(false, state, 'invalid_state');
  if (!relationshipDayIndex(nextDay)) return relationshipResult(false, state, 'invalid_day');
  if (state.dayIndex === nextDay) return relationshipResult(true, state, null);
  const next = cloneRelationships(state);
  const newWeek = state.dayIndex !== null && nextDay < state.dayIndex;
  next.dayIndex = nextDay;
  if (newWeek) {
    next.appliedEventIds = [];
    for (const id of next.npcIds) {
      next.entries[id] = {
        mood: 'neutral',
        favorCredit: 0,
        angryThroughDay: null,
        helpedDay: null,
        favorUsedDay: null,
      };
    }
  } else {
    for (const id of next.npcIds) {
      const entry = next.entries[id];
      if (entry.mood === 'angry' && entry.angryThroughDay !== null && nextDay > entry.angryThroughDay) {
        entry.mood = 'neutral';
        entry.angryThroughDay = null;
      }
    }
  }
  return relationshipResult(true, next, null);
}

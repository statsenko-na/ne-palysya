'use strict';
// JSON-схема снимка смены. Модуль не обращается к игровому состоянию, DOM или хранилищу.

const SAVE_SCHEMA_VERSION = 3;
const SAVE_SCHEMA_EVENTS = new Set(['food', 'call', 'internet', 'jam', 'bday', 'heat', 'noise', 'drill', 'standup', 'majik', 'arrfr', 'sb', 'autoshka']);
const SAVE_SCHEMA_NPCS = new Set(['aimashyn', 'hlad', 'shurik', 'bleb', 'sirgey', 'asel', 'aljazira', 'stazy', 'tigran']);
const SAVE_SCHEMA_EXTENSIONS = new Set(['moments', 'relationships', 'activities', 'distractions', 'disguise', 'equipment', 'bossMemory', 'yogurt', 'weekScenario', 'weekOutcomes', 'phone', 'daily', 'groupSmoke']);
const SAVE_SCHEMA_DAY_FIELDS = [
  'misses', 'lunchCalled', 'lunchOpen', 'fed', 'hungry', 'bossLunch', 'beer', 'toiletCd', 'queue', 'queueTotal',
  'qShift', 'knock', 'cabinDoor', 'npcInside', 'npcTimer', 'waterCups', 'waterRecharge', 'coffeeCups',
  'coffeeJammed', 'coffeeQueueTimer', 'coffeeQueueChecked', 'excelWorkAcc', 'excelPoolTasks', 'overtimeWork',
  'overtimeUsed', 'overworkT', 'adhocDone', 'adhocAt', 'aljaziraTimer', 'aljaziraVisiting', 'aljaziraDisasterAt',
  'aljaziraDisasterDone', 'aljaziraPhase', 'aljaziraPhaseTimer', 'aljaziraForceMood', 'lastSavedMinute', 'pee',
  'peeActive', 'peeLeft', 'peeAt', 'peeCriticalTold', 'vilka', 'smog', 'traffic', 'lunchAway', 'dish',
  'majikFail', 'hideCd', 'planWarned', 'recoveryGraceUsed',
];
const SAVE_SCHEMA_PLAYER_FIELDS = [
  'x', 'y', 'speed', 'action', 'actionTimer', 'actionTotal', 'facingX', 'walkTimer', 'moving', 'coffeeBoost',
  'bumpCooldown', 'chatWith', 'chatPair', 'chatReplied', 'hideSpot', 'hideT', 'queueTarget', 'workFromFront',
];
const SAVE_SCHEMA_BOSS_FIELDS = [
  'x', 'y', 'state', 'stateTimer', 'mode', 'spotDesc', 'facing', 'walkTimer', 'moving', 'suspicion',
  'catchCooldown', 'quoteTimer', 'praiseTimer', 'lookTimer', 'inspectTimer', 'visitedSpots', 'warned',
  'alarm', 'caught', 'coworker', 'emptyDesk', 'gaveUp', 'heat', 'inspectAge', 'lunchBack', 'noise',
  'office', 'patrol', 'praise', 'scold', 'scoldTarget', 'seesPlayer', 'silentCheck', 'snus', 'snusCd',
  'standupTalk', 'stroll', 'suspicious', 'waitT', 'watchingWork', 'outTimer', 'outWhy', 'routeTarget',
];
const SAVE_SCHEMA_COWORKER_FIELDS = [
  'id', 'x', 'y', 'cooldown', 'talkTimer', 'idleTimer', 'alert', 'remote', 'away', 'slack', 'slackTimer',
  'scoldCooldown', 'rocketAt', 'draftCd',
];
const SAVE_SCHEMA_STATS_FIELDS = [
  'coffees', 'cigarettes', 'videos', 'fridge', 'chats', 'catches', 'inspectPass', 'praise', 'plantHideInspect',
  'printed', 'workedSeconds', 'lunch', 'toilet', 'scolds', 'planAt', 'majikFixed', 'sbReports', 'chatted',
];
const SAVE_SCHEMA_EVENT_FIELDS = ['id', 't', 'used', 'food', 'toy', 'work', 'watch'];
const SAVE_SCHEMA_TIMER_KEYS = new Set([
  't', 'timer', 'actionTimer', 'actionTotal', 'nextEvent', 'nextBossCheck', 'nextDrill', 'coffeeBoost',
  'bumpCooldown', 'hideT', 'cooldown', 'talkTimer', 'idleTimer', 'slackTimer', 'scoldCooldown', 'stateTimer',
  'catchCooldown', 'quoteTimer', 'praiseTimer', 'lookTimer', 'inspectTimer', 'inspectAge', 'snus', 'snusCd',
  'waitT', 'outTimer', 'toiletCd', 'waterRecharge', 'coffeeQueueTimer', 'overtimeWork', 'overworkT', 'aljaziraTimer',
  'aljaziraPhaseTimer', 'peeAt', 'peeLeft', 'peeCriticalTimer', 'hideCd', 'banterT', 'remaining', 'expiresIn',
]);

function saveSchemaIsRecord(value) {
  if (!value || Object.prototype.toString.call(value) !== '[object Object]') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === null || Object.getPrototypeOf(proto) === null;
}

function saveSchemaCloneJson(value, seen = new Set(), depth = 0) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return { ok: true, value };
  if (typeof value === 'number') return Number.isFinite(value) ? { ok: true, value } : { ok: false, reason: 'non_finite_number' };
  if (typeof value !== 'object' || depth > 10 || seen.has(value)) return { ok: false, reason: 'non_json_value' };
  if (!Array.isArray(value) && !saveSchemaIsRecord(value)) return { ok: false, reason: 'non_json_value' };
  seen.add(value);
  let result;
  if (Array.isArray(value)) {
    if (value.length > 1000) return { ok: false, reason: 'array_too_large' };
    const items = [];
    for (const item of value) {
      const cloned = saveSchemaCloneJson(item, seen, depth + 1);
      if (!cloned.ok) return cloned;
      items.push(cloned.value);
    }
    result = items;
  } else {
    result = {};
    for (const key of Object.keys(value)) {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') return { ok: false, reason: 'unsafe_key' };
      const cloned = saveSchemaCloneJson(value[key], seen, depth + 1);
      if (!cloned.ok) return cloned;
      result[key] = cloned.value;
    }
  }
  seen.delete(value);
  return { ok: true, value: result };
}

function saveSchemaPick(source, fields) {
  if (!saveSchemaIsRecord(source)) return { ok: false, reason: 'invalid_object' };
  const out = {};
  for (const key of fields) {
    if (!Object.prototype.hasOwnProperty.call(source, key) || source[key] === undefined) continue;
    const cloned = saveSchemaCloneJson(source[key]);
    if (!cloned.ok) return cloned;
    out[key] = cloned.value;
  }
  return { ok: true, value: out };
}

function saveSchemaPoint(point) {
  if (point == null) return { ok: true, value: null };
  return saveSchemaPick(point, ['x', 'y', 'id', 'label']);
}

function saveSchemaDay(day) {
  const picked = saveSchemaPick(day, SAVE_SCHEMA_DAY_FIELDS);
  if (!picked.ok) return picked;
  const value = picked.value;
  if (value.beer !== undefined && value.beer !== null && typeof value.beer !== 'boolean') return { ok: false, reason: 'invalid_day_beer' };
  if (value.aljaziraForceMood !== undefined && value.aljaziraForceMood !== null && !['good', 'neutral', 'bad', 'disaster'].includes(value.aljaziraForceMood)) return { ok: false, reason: 'invalid_day_mood' };
  return { ok: true, value };
}

function saveSchemaPlayer(player) {
  const picked = saveSchemaPick(player, SAVE_SCHEMA_PLAYER_FIELDS);
  if (!picked.ok) return picked;
  for (const key of ['hideSpot', 'queueTarget']) {
    if (picked.value[key] !== undefined) {
      const point = saveSchemaPoint(picked.value[key]);
      if (!point.ok) return point;
      picked.value[key] = point.value;
    }
  }
  return { ok: true, value: picked.value };
}

function saveSchemaBoss(boss) {
  const picked = saveSchemaPick(boss, SAVE_SCHEMA_BOSS_FIELDS);
  if (!picked.ok) return picked;
  if (picked.value.routeTarget !== undefined) {
    const point = saveSchemaPoint(picked.value.routeTarget);
    if (!point.ok) return point;
    picked.value.routeTarget = point.value;
  }
  return { ok: true, value: picked.value };
}

function saveSchemaCoworkers(coworkers) {
  if (!Array.isArray(coworkers) || coworkers.length > SAVE_SCHEMA_NPCS.size) return { ok: false, reason: 'invalid_coworkers' };
  const out = [];
  const ids = new Set();
  for (const coworker of coworkers) {
    const picked = saveSchemaPick(coworker, SAVE_SCHEMA_COWORKER_FIELDS);
    if (!picked.ok) return picked;
    const id = picked.value.id;
    if (!SAVE_SCHEMA_NPCS.has(id) || ids.has(id)) return { ok: false, reason: 'invalid_coworker_id' };
    ids.add(id);
    out.push(picked.value);
  }
  return { ok: true, value: out };
}

function saveSchemaStats(stats) {
  const picked = saveSchemaPick(stats, SAVE_SCHEMA_STATS_FIELDS);
  if (!picked.ok) return picked;
  const value = picked.value;
  if (value.chatted !== undefined) {
    if (!Array.isArray(value.chatted) || value.chatted.length > SAVE_SCHEMA_NPCS.size || value.chatted.some(id => !SAVE_SCHEMA_NPCS.has(id))) return { ok: false, reason: 'invalid_stats_chatted' };
    value.chatted = Array.from(new Set(value.chatted));
  }
  return { ok: true, value };
}

function saveSchemaTodo(todo) {
  if (!Array.isArray(todo) || todo.length > 100) return { ok: false, reason: 'invalid_todo' };
  const out = [];
  for (const entry of todo) {
    const picked = saveSchemaPick(entry, ['id', 'done']);
    if (!picked.ok) return picked;
    if (typeof picked.value.id !== 'string' || picked.value.id.length > 64 || typeof picked.value.done !== 'boolean') return { ok: false, reason: 'invalid_todo_entry' };
    out.push(picked.value);
  }
  return { ok: true, value: out };
}

function saveSchemaOfficeEvent(event) {
  if (event == null) return { ok: true, value: null };
  const picked = saveSchemaPick(event, SAVE_SCHEMA_EVENT_FIELDS);
  if (!picked.ok) return picked;
  const value = picked.value;
  if (!SAVE_SCHEMA_EVENTS.has(value.id)) return { ok: false, reason: 'unknown_event_id' };
  if (value.food !== undefined && value.food !== null) {
    const food = saveSchemaPick(value.food, ['name', 'text', 'color']);
    if (!food.ok) return food;
    value.food = food.value;
  }
  return { ok: true, value };
}

function saveSchemaActionChoice(choice) {
  if (choice == null) return { ok: true, value: null };
  const picked = saveSchemaPick(choice, ['id', 'owner', 'options', 'remaining']);
  if (!picked.ok) return picked;
  const value = picked.value;
  if (!Array.isArray(value.options) || value.options.length < 1 || value.options.length > 3) return { ok: false, reason: 'invalid_choice_options' };
  const options = [];
  for (const option of value.options) {
    const item = saveSchemaPick(option, ['id', 'text', 'detail', 'disabledReason']);
    if (!item.ok) return item;
    if (typeof item.value.id !== 'string' || typeof item.value.text !== 'string') return { ok: false, reason: 'invalid_choice_option' };
    options.push(item.value);
  }
  value.options = options;
  return { ok: true, value };
}

function saveSchemaRequiredEvent(event) {
  if (event == null) return { ok: true, value: null };
  const picked = saveSchemaPick(event, ['id', 'deadlineStart', 'dispatched']);
  if (!picked.ok) return picked;
  if (!SAVE_SCHEMA_EVENTS.has(picked.value.id) || typeof picked.value.dispatched !== 'boolean') return { ok: false, reason: 'invalid_required_event' };
  return { ok: true, value: picked.value };
}

function saveSchemaExtensions(extensions) {
  if (extensions == null) return { ok: true, value: {} };
  if (!saveSchemaIsRecord(extensions)) return { ok: false, reason: 'invalid_extensions' };
  const out = {};
  for (const key of Object.keys(extensions)) {
    if (!SAVE_SCHEMA_EXTENSIONS.has(key)) continue;
    const cloned = saveSchemaCloneJson(extensions[key]);
    if (!cloned.ok) return cloned;
    out[key] = cloned.value;
  }
  return { ok: true, value: out };
}

function saveSchemaProject(source) {
  if (!saveSchemaIsRecord(source)) return { ok: false, reason: 'invalid_source' };
  const out = { v: SAVE_SCHEMA_VERSION };
  const direct = ['shiftId', 'dayIndex', 'diffKey', 'clockMinutes', 'usefulness', 'fun', 'reprimands', 'weekReprimands', 'planTarget', 'majikArc', 'rngSeed', 'nextBossCheck', 'intelTimer', 'coverTokens', 'phoneSafe', 'nextDrill', 'eventQueue', 'nextEvent', 'choice', 'banner', 'tutorial', 'nudge', 'banterT', 'autoUsed', 'recoveryGraceUsed', 'migratedFromV2'];
  const fields = {
    day: saveSchemaDay,
    player: saveSchemaPlayer,
    boss: saveSchemaBoss,
    coworkers: saveSchemaCoworkers,
    todo: saveSchemaTodo,
    stats: saveSchemaStats,
    officeEvent: saveSchemaOfficeEvent,
    requiredEvent: saveSchemaRequiredEvent,
    actionChoice: saveSchemaActionChoice,
    extensions: saveSchemaExtensions,
  };
  for (const key of direct) {
    if (!Object.prototype.hasOwnProperty.call(source, key) || source[key] === undefined) continue;
    const cloned = saveSchemaCloneJson(source[key]);
    if (!cloned.ok) return cloned;
    out[key] = cloned.value;
  }
  for (const [key, project] of Object.entries(fields)) {
    if (!Object.prototype.hasOwnProperty.call(source, key) || source[key] === undefined) continue;
    const projected = project(source[key]);
    if (!projected.ok) return projected;
    out[key] = projected.value;
  }
  if (!Object.prototype.hasOwnProperty.call(out, 'extensions')) out.extensions = {};
  if (!Object.prototype.hasOwnProperty.call(out, 'actionChoice')) out.actionChoice = null;
  return { ok: true, value: out };
}

function saveSchemaNegativeTimer(value) {
  if (Array.isArray(value)) return value.some(item => saveSchemaNegativeTimer(item));
  if (!saveSchemaIsRecord(value)) return false;
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'number' && (SAVE_SCHEMA_TIMER_KEYS.has(key) || /(?:Timer|Cooldown|Cd)$/.test(key)) && item < 0) return true;
    if (saveSchemaNegativeTimer(item)) return true;
  }
  return false;
}

function saveSchemaClampTimers(value) {
  if (Array.isArray(value)) return value.map(item => saveSchemaClampTimers(item));
  if (!saveSchemaIsRecord(value)) return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'number' && (SAVE_SCHEMA_TIMER_KEYS.has(key) || /(?:Timer|Cooldown|Cd)$/.test(key))) out[key] = Math.max(0, item);
    else out[key] = saveSchemaClampTimers(item);
  }
  return out;
}

function saveSchemaValidateCandidate(candidate) {
  const root = candidate.value;
  if (root.v !== SAVE_SCHEMA_VERSION) return { ok: false, reason: 'unsupported_version' };
  const migrated = root.migratedFromV2 === true;
  if (!Number.isInteger(root.dayIndex) || root.dayIndex < 0 || root.dayIndex > 4) return { ok: false, reason: 'invalid_day_index' };
  if (!['easy', 'normal', 'hard'].includes(root.diffKey)) return { ok: false, reason: 'invalid_difficulty' };
  if (typeof root.clockMinutes !== 'number' || !Number.isFinite(root.clockMinutes) || root.clockMinutes < 0 || root.clockMinutes > 1440) return { ok: false, reason: 'invalid_clock' };
  if (typeof root.usefulness !== 'number' || !Number.isFinite(root.usefulness) || root.usefulness < 0 || root.usefulness > 200) return { ok: false, reason: 'invalid_usefulness' };
  if (typeof root.fun !== 'number' || !Number.isFinite(root.fun) || root.fun < 0 || root.fun > 100) return { ok: false, reason: 'invalid_fun' };
  for (const key of ['reprimands', 'weekReprimands', 'planTarget']) {
    if (typeof root[key] !== 'number' || !Number.isFinite(root[key]) || root[key] < 0) return { ok: false, reason: `invalid_${key}` };
  }
  if (typeof root.majikArc !== 'number' || !Number.isFinite(root.majikArc) || Math.abs(root.majikArc) > 100) return { ok: false, reason: 'invalid_majik_arc' };
  if (typeof root.shiftId !== 'string' || root.shiftId.length < 1 || root.shiftId.length > 96) return { ok: false, reason: 'invalid_shift_id' };
  if (root.rngSeed !== undefined && (!Number.isInteger(root.rngSeed) || root.rngSeed < 0 || root.rngSeed >= 233280)) return { ok: false, reason: 'invalid_rng_seed' };
  if (root.eventQueue !== undefined && (!Array.isArray(root.eventQueue) || root.eventQueue.length > 32 || root.eventQueue.some(id => !SAVE_SCHEMA_EVENTS.has(id)))) return { ok: false, reason: 'unknown_event_id' };
  if (root.officeEvent && !SAVE_SCHEMA_EVENTS.has(root.officeEvent.id)) return { ok: false, reason: 'unknown_event_id' };
  if (!migrated && (!root.day || !root.player || !root.boss || !Array.isArray(root.coworkers) || !root.stats || !Array.isArray(root.todo))) return { ok: false, reason: 'missing_runtime_state' };
  if (root.day && !saveSchemaIsRecord(root.day)) return { ok: false, reason: 'invalid_day_state' };
  if (!migrated && root.player && (typeof root.player.action !== 'string' || !Number.isFinite(root.player.x) || !Number.isFinite(root.player.y))) return { ok: false, reason: 'invalid_player_state' };
  if (root.stats && !saveSchemaIsRecord(root.stats)) return { ok: false, reason: 'invalid_stats' };
  if (root.nextEvent !== undefined && (typeof root.nextEvent !== 'number' || !Number.isFinite(root.nextEvent) || root.nextEvent < 0)) return { ok: false, reason: 'invalid_event_timer' };
  if (saveSchemaNegativeTimer(root)) return { ok: false, reason: 'negative_timer' };
  if (root.autoUsed !== undefined && typeof root.autoUsed !== 'boolean') return { ok: false, reason: 'invalid_auto_used' };
  if (root.recoveryGraceUsed !== undefined && typeof root.recoveryGraceUsed !== 'boolean') return { ok: false, reason: 'invalid_recovery_grace' };
  return { ok: true, snapshot: root };
}

function makeSaveSnapshot(source) {
  const candidate = saveSchemaProject(source);
  if (!candidate.ok) return candidate;
  candidate.value = saveSchemaClampTimers(candidate.value);
  return saveSchemaValidateCandidate(candidate);
}

function validateSaveSnapshot(raw) {
  if (!saveSchemaIsRecord(raw)) return { ok: false, reason: 'invalid_snapshot' };
  const projected = saveSchemaProject(raw);
  return projected.ok ? saveSchemaValidateCandidate(projected) : projected;
}

function migrateSaveV2(raw) {
  if (!saveSchemaIsRecord(raw) || raw.v !== 2) return { ok: false, reason: 'unsupported_version' };
  const base = saveSchemaPick(raw, ['dayIndex', 'diffKey', 'clockMinutes', 'usefulness', 'fun', 'reprimands', 'weekReprimands', 'planTarget', 'majikArc', 'day', 'todo', 'stats', 'officeEvent']);
  if (!base.ok) return base;
  const old = base.value;
  const migrated = {
    v: SAVE_SCHEMA_VERSION,
    shiftId: `migrated-v2-${old.dayIndex}-${Math.trunc(old.clockMinutes || 0)}`,
    dayIndex: old.dayIndex,
    diffKey: old.diffKey,
    clockMinutes: old.clockMinutes,
    usefulness: old.usefulness,
    fun: old.fun,
    reprimands: old.reprimands,
    weekReprimands: old.weekReprimands,
    planTarget: old.planTarget,
    majikArc: old.majikArc,
    day: old.day || {},
    todo: old.todo || [],
    stats: old.stats || {},
    officeEvent: old.officeEvent || null,
    migratedFromV2: true,
    recoveryGraceUsed: true,
    actionChoice: null,
    extensions: {},
  };
  return validateSaveSnapshot(migrated);
}

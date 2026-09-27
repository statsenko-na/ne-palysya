'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const context = {};
vm.runInNewContext(fs.readFileSync('js/boss-memory.js', 'utf8'), context, { filename: 'js/boss-memory.js' });
const json = value => JSON.parse(JSON.stringify(value));
const observed = (state, incidentId, incidentType, visible, safeSpot) => context.observeBossIncident(state, {
  shiftId: 'shift-4',
  incidentId: incidentId,
  incidentType: incidentType,
  visible: visible,
  safeSpot: safeSpot
});
const chooseContext = overrides => Object.assign({
  shiftId: 'shift-4',
  normalStroll: true,
  availablePointIds: [],
  randomSample: 0.34
}, overrides || {});

let state = context.createBossMemory();
assert.deepStrictEqual(json(state), { shiftId: null, recordedCount: 0, seenIncidentIds: [], observations: [] });
assert.strictEqual(observed(state, 'hidden-1', 'caught', false, { x: 1, y: 2 }).reason, 'not_observed');
assert.strictEqual(observed(state, 'noise-1', 'noise', true, { x: 1, y: 2 }).reason, 'incident_invalid');
assert.strictEqual(observed(state, 'caught-1', 'caught', true, { x: NaN, y: 2 }).reason, 'safe_spot_invalid');
assert.strictEqual(context.chooseRememberedSpot(state, {}).reason, 'context_missing');
assert.strictEqual(context.chooseRememberedSpot(state, chooseContext({ normalStroll: false })).reason, 'not_normal_stroll');

const before = JSON.stringify(state);
state = json(observed(state, 'caught-1', 'caught', true, { x: 410, y: 250 }).state);
assert.strictEqual(JSON.stringify(context.createBossMemory()), before);
assert.strictEqual(state.recordedCount, 1);
assert.strictEqual(state.observations[0].remainingSeconds, 60);
assert.strictEqual(state.observations[0].id, 'shift-4:boss-memory:1');
assert.strictEqual(observed(state, 'caught-1', 'caught', true, { x: 410, y: 250 }).reason, 'duplicate_incident');
state = json(observed(state, 'autoclicker-1', 'autoclicker_exposed', true, { x: 500, y: 230 }).state);
assert.strictEqual(state.recordedCount, 2);
assert.strictEqual(observed(state, 'caught-3', 'caught', true, { x: 600, y: 200 }).reason, 'limit_reached');

const paused = context.tickBossMemory(state, 30, { paused: true });
assert.strictEqual(paused.state, state);
assert.strictEqual(paused.state.observations[0].remainingSeconds, 60);
const halfLife = context.tickBossMemory(JSON.parse(JSON.stringify(state)), 30, { paused: false });
assert.strictEqual(halfLife.state.observations[0].remainingSeconds, 30);
const expired = context.tickBossMemory(halfLife.state, 30, { paused: false });
assert.strictEqual(expired.state.observations.length, 0);
assert.strictEqual(expired.state.recordedCount, 2);
assert.strictEqual(observed(expired.state, 'caught-3', 'caught', true, { x: 1, y: 2 }).reason, 'limit_reached');

state = json(observed(context.createBossMemory(), 'caught-1', 'caught', true, { x: 410, y: 250 }).state);
const pointId = state.observations[0].id;
assert.strictEqual(context.chooseRememberedSpot(state, chooseContext({
  availablePointIds: [pointId],
  randomSample: 0.35
})).reason, 'not_selected');
assert.strictEqual(context.chooseRememberedSpot(state, chooseContext({
  availablePointIds: [],
  randomSample: 0.1
})).chosen, false);
const choice = context.chooseRememberedSpot(state, chooseContext({
  availablePointIds: [pointId],
  randomSample: 0.34
}));
assert.strictEqual(choice.chosen, true);
assert.strictEqual(choice.targetId, pointId);
assert.deepStrictEqual(json(choice.point), { id: pointId, x: 410, y: 250 });
assert.deepStrictEqual(json(choice.effects), [
  { id: pointId + ':route', type: 'requestBossRoute', targetId: pointId, reasonId: 'boss_memory' },
  { id: pointId + ':message', type: 'message', lineId: 'bossRememberedSpot', ownerId: 'boss' }
]);
assert.strictEqual(state.observations[0].consumed, false);
assert.strictEqual(choice.state.observations[0].consumed, true);
assert.strictEqual(context.chooseRememberedSpot(choice.state, chooseContext({
  availablePointIds: [pointId],
  randomSample: 0
})).chosen, false);

const invalidSample = context.chooseRememberedSpot(state, chooseContext({ randomSample: 1.1 }));
assert.strictEqual(invalidSample.ok, false);
assert.strictEqual(invalidSample.reason, 'context_invalid');
assert.strictEqual(context.tickBossMemory(state, -1, { paused: false }).reason, 'dt_invalid');

console.log('qa-parallel-d4: checks passed');

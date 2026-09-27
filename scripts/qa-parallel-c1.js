'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourcePath = path.resolve(__dirname, '../js/relationships.js');
const sandbox = {};
vm.runInNewContext(fs.readFileSync(sourcePath, 'utf8'), sandbox, { filename: sourcePath });
const plain = value => JSON.parse(JSON.stringify(value));

let state = sandbox.createRelationships();
assert.equal(state.npcIds.length, 5);
assert.deepEqual(plain(state.entries.hlad), {
  mood: 'neutral', favorCredit: 0, angryThroughDay: null, helpedDay: null, favorUsedDay: null,
});
assert.equal(sandbox.createRelationships(['tigran']).reason, 'unknown_npc');

const initialJson = JSON.stringify(state);
let result = sandbox.applyRelationshipEvent(state, {
  eventId: 'shift-1:help:aimashyn:1', npcId: 'aimashyn', kind: 'help', dayIndex: 1,
});
assert.equal(result.ok, true);
assert.equal(result.effects.length, 0);
assert.equal(state.entries.aimashyn.favorCredit, 0, 'transition must not mutate the input');
state = result.state;
assert.equal(state.entries.aimashyn.mood, 'friendly');
assert.equal(state.entries.aimashyn.favorCredit, 1);
assert.equal(state.entries.aimashyn.helpedDay, 1);
assert.equal(sandbox.applyRelationshipEvent(state, {
  eventId: 'shift-1:help:aimashyn:1', npcId: 'aimashyn', kind: 'help', dayIndex: 1,
}).state, state, 'replaying the same event is an idempotent no-op');
assert.equal(sandbox.applyRelationshipEvent(state, {
  eventId: 'shift-1:help:aimashyn:2', npcId: 'aimashyn', kind: 'help', dayIndex: 1,
}).reason, 'help_already_used_today');
assert.equal(sandbox.canRequestFavor(state, 'aimashyn', 1).canRequest, true);

const beforeConsume = JSON.stringify(state);
result = sandbox.consumeFavor(state, 'aimashyn', 1);
assert.equal(result.ok, true);
assert.equal(JSON.stringify(state), beforeConsume, 'consumeFavor must preserve the caller snapshot');
state = result.state;
assert.equal(state.entries.aimashyn.favorCredit, 0);
assert.equal(state.entries.aimashyn.favorUsedDay, 1);
assert.equal(sandbox.consumeFavor(state, 'aimashyn', 1).reason, 'favor_unavailable');

result = sandbox.advanceRelationshipsDay(state, 3);
assert.equal(result.state.entries.aimashyn.mood, 'friendly');
state = result.state;
result = sandbox.applyRelationshipEvent(state, {
  eventId: 'shift-1:betrayal:aimashyn:1', npcId: 'aimashyn', kind: 'betrayal', dayIndex: 3,
});
state = result.state;
assert.equal(state.entries.aimashyn.mood, 'angry');
assert.equal(state.entries.aimashyn.angryThroughDay, 4);
assert.equal(state.entries.aimashyn.favorCredit, 0);
assert.equal(sandbox.canRequestFavor(state, 'aimashyn', 3).canRequest, false);
state = sandbox.advanceRelationshipsDay(state, 4).state;
assert.equal(state.entries.aimashyn.mood, 'angry', 'anger includes the next day');
result = sandbox.applyRelationshipEvent(state, {
  eventId: 'shift-1:betrayal:aimashyn:2', npcId: 'aimashyn', kind: 'betrayal', dayIndex: 4,
});
state = result.state;
assert.equal(state.entries.aimashyn.angryThroughDay, 4, 'Friday anger remains within this work week');
state = sandbox.applyRelationshipEvent(state, {
  eventId: 'shift-1:apology:aimashyn:1', npcId: 'aimashyn', kind: 'apology', dayIndex: 4,
}).state;
assert.equal(state.entries.aimashyn.mood, 'neutral');
assert.equal(state.entries.aimashyn.favorCredit, 0, 'apology does not grant a favor');

let shortAnger = sandbox.createRelationships();
shortAnger = sandbox.applyRelationshipEvent(shortAnger, {
  eventId: 'shift-3:betrayal:hlad:1', npcId: 'hlad', kind: 'betrayal', dayIndex: 0,
}).state;
assert.equal(shortAnger.entries.hlad.angryThroughDay, 1);
shortAnger = sandbox.advanceRelationshipsDay(shortAnger, 1).state;
assert.equal(shortAnger.entries.hlad.mood, 'angry');
shortAnger = sandbox.applyRelationshipEvent(shortAnger, {
  eventId: 'shift-3:betrayal:hlad:2', npcId: 'hlad', kind: 'betrayal', dayIndex: 1,
}).state;
assert.equal(shortAnger.entries.hlad.angryThroughDay, 2, 'multiple causes extend to the maximum end day');
shortAnger = sandbox.advanceRelationshipsDay(shortAnger, 2).state;
assert.equal(shortAnger.entries.hlad.mood, 'angry');
shortAnger = sandbox.advanceRelationshipsDay(shortAnger, 3).state;
assert.equal(shortAnger.entries.hlad.mood, 'neutral');

let retry = sandbox.createRelationships();
retry = sandbox.applyRelationshipEvent(retry, {
  eventId: 'shift-2:help:bleb:1', npcId: 'bleb', kind: 'help', dayIndex: 3,
}).state;
const dayStart = JSON.parse(JSON.stringify(retry));
const retryResult = sandbox.applyRelationshipEvent(dayStart, {
  eventId: 'shift-2:help:bleb:1', npcId: 'bleb', kind: 'help', dayIndex: 3,
});
assert.deepEqual(plain(retryResult.state), dayStart, 'retry snapshot retains applied event ids');
assert.equal(retryResult.effects.length, 0);
const roundTrip = JSON.parse(JSON.stringify(retry));
assert.deepEqual(plain(roundTrip), plain(retry));

let week = sandbox.advanceRelationshipsDay(retry, 4).state;
week = sandbox.advanceRelationshipsDay(week, 0).state;
assert.equal(week.entries.bleb.mood, 'neutral');
assert.equal(week.entries.bleb.favorCredit, 0);
assert.equal(week.entries.bleb.helpedDay, null);
assert.deepEqual(plain(week.appliedEventIds), []);

assert.equal(sandbox.applyRelationshipEvent(week, {
  eventId: 'unknown:1', npcId: 'tigran', kind: 'help', dayIndex: 0,
}).reason, 'unknown_npc');
assert.equal(sandbox.canRequestFavor(week, 'tigran', 0).reason, 'unknown_npc');
assert.equal(sandbox.consumeFavor(week, 'tigran', 0).reason, 'unknown_npc');
assert.equal(sandbox.applyRelationshipEvent(week, { eventId: 'missing-day', npcId: 'bleb', kind: 'help' }).reason, 'invalid_day');
assert.equal(JSON.stringify(sandbox.createRelationships()), initialJson, 'new state remains a JSON-compatible default');

console.log('C1 relationships model: all assertions passed');

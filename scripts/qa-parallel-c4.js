'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourcePath = path.resolve(__dirname, '../js/week-outcomes.js');
const sandbox = {};
vm.runInNewContext(fs.readFileSync(sourcePath, 'utf8'), sandbox, { filename: sourcePath });
const plain = value => JSON.parse(JSON.stringify(value));
const weekFact = (eventId, kind, extra = {}) => ({ eventId, weekId: 'week-1', kind, ...extra });
const secretContext = overrides => ({
  weekId: 'week-1',
  eventId: 'shift-24:tigran:1',
  tigranAvailable: true,
  playerAtArchive: true,
  bossThreat: false,
  legalAway: false,
  shiftEnded: false,
  paused: false,
  dt: 1,
  storyMomentAvailable: true,
  ...overrides,
});

let outcomes = sandbox.createWeekOutcomes('week-1');
assert.equal(sandbox.selectWeekTitle(outcomes).titleId, 'neutral');
assert.equal(sandbox.createWeekOutcomes({}).reason, 'invalid_week_id');
const initial = JSON.stringify(outcomes);
let result = sandbox.recordWeekFact(outcomes, weekFact('shift-1:help:1', 'help'));
assert.equal(result.ok, true);
assert.equal(outcomes.counts.helped, 0, 'recording a fact does not mutate its input');
outcomes = result.state;
assert.equal(JSON.stringify(outcomes) === initial, false);
assert.equal(outcomes.counts.helped, 1);
result = sandbox.recordWeekFact(outcomes, weekFact('shift-1:help:1', 'help'));
assert.equal(result.state, outcomes, 'duplicate fact id is an idempotent no-op');
assert.equal(result.effects.length, 0);
outcomes = result.state;
for (let i = 2; i <= 3; i++) outcomes = sandbox.recordWeekFact(outcomes, weekFact(`shift-1:help:${i}`, 'help')).state;
for (let i = 1; i <= 3; i++) outcomes = sandbox.recordWeekFact(outcomes, weekFact(`shift-1:distraction:${i}`, 'distraction')).state;
for (let i = 1; i <= 3; i++) outcomes = sandbox.recordWeekFact(outcomes, weekFact(`shift-1:plan:${i}`, 'fullPlan')).state;
outcomes = sandbox.recordWeekFact(outcomes, weekFact('shift-1:reprimand:1', 'reprimand')).state;
outcomes = sandbox.recordWeekFact(outcomes, weekFact('shift-1:betrayal:1', 'betrayal')).state;
assert.equal(sandbox.selectWeekTitle(outcomes).titleId, 'department_pillar', 'help has first priority');
assert.deepEqual(plain(sandbox.selectWeekTitle(outcomes).facts.summary), [
  { id: 'helped', count: 3 }, { id: 'betrayed', count: 1 }, { id: 'reprimands', count: 1 },
]);

let titleState = sandbox.createWeekOutcomes('week-2');
for (let i = 1; i <= 3; i++) titleState = sandbox.recordWeekFact(titleState, { eventId: `week-2:distraction:${i}`, weekId: 'week-2', kind: 'distraction' }).state;
for (let i = 1; i <= 3; i++) titleState = sandbox.recordWeekFact(titleState, { eventId: `week-2:plan:${i}`, weekId: 'week-2', kind: 'fullPlan' }).state;
assert.equal(sandbox.selectWeekTitle(titleState).titleId, 'excuse_master', 'successful distractions outrank clean plans');
titleState = sandbox.recordWeekFact(titleState, { eventId: 'week-2:help:1', weekId: 'week-2', kind: 'help' }).state;
assert.equal(sandbox.selectWeekTitle(titleState).titleId, 'excuse_master', 'help below threshold does not affect priority');

let favorite = sandbox.createWeekOutcomes('week-3');
for (let i = 1; i <= 3; i++) favorite = sandbox.recordWeekFact(favorite, { eventId: `week-3:plan:${i}`, weekId: 'week-3', kind: 'fullPlan' }).state;
favorite = sandbox.recordWeekFact(favorite, { eventId: 'week-3:majik:1', weekId: 'week-3', kind: 'majikArc', value: 2 }).state;
favorite = sandbox.recordWeekFact(favorite, { eventId: 'week-3:munich:1', weekId: 'week-3', kind: 'munichEnding', value: true }).state;
const favoriteSummary = sandbox.selectWeekTitle(favorite);
assert.equal(favoriteSummary.titleId, 'boss_favorite');
assert.equal(favoriteSummary.facts.endings.majikArc, 2);
assert.equal(favoriteSummary.facts.endings.munichEnding, true);
assert.equal(sandbox.recordWeekFact(favorite, { eventId: 'stale-week-event', weekId: 'week-2', kind: 'help' }).reason, 'week_mismatch');
favorite = sandbox.recordWeekFact(favorite, { eventId: 'week-3:reprimand:1', weekId: 'week-3', kind: 'reprimand' }).state;
assert.equal(sandbox.selectWeekTitle(favorite).titleId, 'neutral', 'one reprimand blocks favorite title');
const resetWeek = sandbox.createWeekOutcomes('week-4');
assert.deepEqual(plain(resetWeek.counts), { helped: 0, betrayed: 0, distractions: 0, reprimands: 0, fullPlans: 0 });
assert.equal(resetWeek.endings.majikArc, null);
assert.equal(resetWeek.endings.munichEnding, false);
assert.deepEqual(plain(JSON.parse(JSON.stringify(favorite))), plain(favorite));

let secret = sandbox.createTigranSecret('week-1');
assert.equal(secret.phase, 'dormant');
assert.equal(sandbox.advanceTigranSecret(secret, 'search_start', secretContext()).reason, 'archive_hint_required');
assert.equal(sandbox.advanceTigranSecret(secret, 'talk_complete', secretContext({ tigranAvailable: false })).reason, 'tigran_unavailable');
let hint = sandbox.advanceTigranSecret(secret, 'talk_complete', secretContext({ eventId: 'shift-24:tigran:first-talk' }));
assert.equal(hint.state.phase, 'hinted');
assert.equal(hint.effects.length, 1);
assert.equal(hint.effects[0].type, 'message');
assert.deepEqual(plain(sandbox.advanceTigranSecret(hint.state, 'talk_complete', secretContext({ eventId: 'shift-24:tigran:first-talk' })).effects), []);
assert.deepEqual(plain(sandbox.advanceTigranSecret(hint.state, 'talk_complete', secretContext({ eventId: 'shift-24:tigran:again' })).effects), [], 'repeat conversation does not repeat clue');

assert.equal(sandbox.advanceTigranSecret(hint.state, 'search_start', secretContext({ eventId: 'shift-24:archive:threat', bossThreat: true })).reason, 'boss_threat');
assert.equal(sandbox.advanceTigranSecret(hint.state, 'search_start', secretContext({ eventId: 'shift-24:archive:far', playerAtArchive: false })).reason, 'not_at_archive');
let searching = sandbox.advanceTigranSecret(hint.state, 'search_start', secretContext({ eventId: 'shift-24:archive:search' }));
assert.equal(searching.state.phase, 'searching');
assert.deepEqual(plain(searching.effects), []);
let progress = sandbox.advanceTigranSecret(searching.state, 'search_tick', secretContext({ dt: 2, paused: true }));
assert.equal(progress.state.searchElapsed, 0, 'pause stops the search timer');
progress = sandbox.advanceTigranSecret(searching.state, 'search_tick', secretContext({ dt: 1 }));
assert.equal(progress.state.searchElapsed, 1);
const searchReload = JSON.parse(JSON.stringify(progress.state));
const found = sandbox.advanceTigranSecret(searchReload, 'search_tick', secretContext({ dt: 2 }));
assert.equal(found.state.phase, 'found');
assert.equal(found.state.searchElapsed, 3);
assert.equal(found.effects.length, 1);
assert.equal(found.effects[0].type, 'message');
assert.equal(found.effects.some(effect => effect.type === 'awardMoment' || effect.type === 'addFun'), false);
assert.deepEqual(plain(sandbox.advanceTigranSecret(found.state, 'search_tick', secretContext()).effects), []);

assert.equal(sandbox.advanceTigranSecret(found.state, 'return_talk_complete', secretContext({ eventId: 'shift-24:tigran:return', tigranAvailable: false })).reason, 'tigran_unavailable');
const yogurtAlreadyUsed = sandbox.advanceTigranSecret(found.state, 'return_talk_complete', secretContext({
  eventId: 'shift-24:tigran:return', storyMomentAvailable: false,
}));
assert.equal(yogurtAlreadyUsed.state.phase, 'completed');
assert.equal(yogurtAlreadyUsed.state.storyMomentAwarded, false);
assert.deepEqual(plain(yogurtAlreadyUsed.effects.map(effect => effect.type)), ['message']);
assert.deepEqual(plain(sandbox.advanceTigranSecret(yogurtAlreadyUsed.state, 'return_talk_complete', secretContext({ eventId: 'shift-24:tigran:return', storyMomentAvailable: false })).effects), []);

let secondSecret = sandbox.createTigranSecret('week-1');
secondSecret = sandbox.advanceTigranSecret(secondSecret, 'talk_complete', secretContext({ eventId: 'shift-24:tigran:talk-2' })).state;
secondSecret = sandbox.advanceTigranSecret(secondSecret, 'search_start', secretContext({ eventId: 'shift-24:archive:search-2' })).state;
secondSecret = sandbox.advanceTigranSecret(secondSecret, 'search_tick', secretContext({ dt: 3 })).state;
const awarded = sandbox.advanceTigranSecret(secondSecret, 'return_talk_complete', secretContext({ eventId: 'shift-24:tigran:return-2', storyMomentAvailable: true }));
assert.equal(awarded.state.storyMomentAwarded, true);
assert.deepEqual(plain(awarded.effects.map(effect => effect.type)), ['message', 'awardMoment']);
assert.equal(awarded.effects[1].momentId, 'story');
assert.equal(awarded.effects[1].sourceId, 'week-1:shift-24:tigran:return-2:tigran-secret');

const interrupted = sandbox.advanceTigranSecret(searching.state, 'search_tick', secretContext({ dt: 1, bossThreat: true }));
assert.equal(interrupted.state.phase, 'hinted');
assert.equal(interrupted.state.searchElapsed, 0);
assert.deepEqual(plain(interrupted.effects), []);
const cancelled = sandbox.advanceTigranSecret(searching.state, 'search_cancel', secretContext({ eventId: 'shift-24:archive:cancel' }));
assert.equal(cancelled.state.phase, 'hinted');
assert.deepEqual(plain(cancelled.effects), []);
assert.equal(sandbox.advanceTigranSecret(searching.state, 'search_start', secretContext({ weekId: 'week-2', eventId: 'old-week-event' })).reason, 'week_mismatch');
const newWeek = sandbox.advanceTigranSecret(awarded.state, 'new_week', secretContext({ weekId: 'week-2' }));
assert.equal(newWeek.state.phase, 'dormant');
assert.equal(newWeek.state.storyMomentAwarded, false);
assert.deepEqual(plain(newWeek.state.processedEventIds), []);
assert.equal(sandbox.advanceTigranSecret(awarded.state, 'new_week', secretContext({ weekId: 'week-1' })).state.phase, 'completed', 'same-week call does not reset the secret');
assert.deepEqual(plain(JSON.parse(JSON.stringify(awarded.state))), plain(awarded.state));

console.log('C4 week outcomes and Tigran secret models: all assertions passed');

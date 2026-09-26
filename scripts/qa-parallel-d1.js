'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const context = {};
vm.runInNewContext(fs.readFileSync('js/distractions.js', 'utf8'), context, { filename: 'js/distractions.js' });
const json = value => JSON.parse(JSON.stringify(value));
const baseContext = overrides => Object.assign({
  shiftId: 'shift-1',
  bossState: 'patrol',
  paused: false,
  legalAway: false,
  shiftEnded: false,
  routeAvailable: true
}, overrides || {});
const target = { id: 'printer-near-copy-room', x: 510, y: 220 };
const started = (state, kind, overrides) => {
  const result = context.beginDistraction(state, baseContext(overrides), kind, target);
  assert.strictEqual(result.ok, true);
  return json(result.state);
};
const arrive = state => json(context.tickDistraction(state, 1, { paused: false, arrived: true }).state);

let state = context.createDistractions();
assert.deepStrictEqual(json(state), {
  shiftId: null, successfulUses: 0, usedKinds: [], nextAttemptId: 1,
  cooldownRemaining: 0, active: null, lastOutcome: null
});
assert.strictEqual(context.canDistract(state, {}, 'printer').reason, 'context_missing');
assert.strictEqual(context.canDistract(state, baseContext({ bossState: 'inspect' }), 'printer').reason, 'boss_unavailable');
assert.strictEqual(context.canDistract(state, baseContext({ paused: true }), 'printer').reason, 'paused');
assert.strictEqual(context.canDistract(state, baseContext({ legalAway: true }), 'printer').reason, 'legal_away');
assert.strictEqual(context.canDistract(state, baseContext({ shiftEnded: true }), 'printer').reason, 'shift_ended');
assert.strictEqual(context.canDistract(state, baseContext({ routeAvailable: false }), 'printer').reason, 'route_unavailable');
assert.strictEqual(context.canDistract(state, baseContext(), 'unknown').reason, 'kind_invalid');

const routeFailed = context.beginDistraction(state, baseContext({ routeAvailable: false }), 'printer', target);
assert.strictEqual(routeFailed.ok, false);
assert.strictEqual(routeFailed.reason, 'route_unavailable');
assert.strictEqual(routeFailed.state, state);
assert.strictEqual(state.successfulUses, 0);
const targetFailed = context.beginDistraction(state, baseContext(), 'printer', { id: 'bad', x: NaN, y: 1 });
assert.strictEqual(targetFailed.reason, 'target_invalid');

const beforeBegin = JSON.stringify(state);
state = started(state, 'printer');
assert.strictEqual(JSON.stringify(context.createDistractions()), beforeBegin);
assert.strictEqual(state.active.phase, 'walking');
assert.strictEqual(state.active.remainingSeconds, 12);
assert.strictEqual(state.active.sourceId, 'shift-1:distraction:1');
assert.strictEqual(context.beginDistraction(state, baseContext(), 'colleague', target).reason, 'busy');
assert.strictEqual(context.tickDistraction(state, 2, { paused: true, arrived: false }).state, state);
assert.strictEqual(state.active.remainingSeconds, 12);

const timeout = context.tickDistraction(state, 12, { paused: false, arrived: false });
assert.strictEqual(timeout.state.active, null);
assert.strictEqual(timeout.state.successfulUses, 0);
assert.strictEqual(timeout.state.lastOutcome, 'walking_timeout');
assert.strictEqual(timeout.state.nextAttemptId, 2);

state = started(timeout.state, 'colleague');
state = arrive(state);
assert.strictEqual(state.active.phase, 'occupied');
assert.strictEqual(state.active.remainingSeconds, 6);
assert.strictEqual(state.successfulUses, 1);
assert.deepStrictEqual(json(state.usedKinds), ['colleague']);
assert.strictEqual(context.beginDistraction(state, baseContext(), 'colleague', target).reason, 'busy');

const rest = context.finishDistraction(state, 'rest_completed');
assert.strictEqual(rest.ok, true);
assert.deepStrictEqual(json(rest.effects), [{
  id: 'shift-1:distraction:2:moment',
  type: 'awardMoment',
  momentId: 'distraction',
  sourceId: 'shift-1:distraction:2'
}]);
const repeatedRest = context.finishDistraction(rest.state, 'rest_completed');
assert.deepStrictEqual(json(repeatedRest.effects), []);
assert.strictEqual(repeatedRest.state, rest.state);
state = rest.state;
const pausedOccupied = context.tickDistraction(state, 5, { paused: true });
assert.strictEqual(pausedOccupied.state, state);
const ended = context.tickDistraction(state, 6, { paused: false });
assert.strictEqual(ended.state.active, null);
assert.strictEqual(ended.state.cooldownRemaining, 45);
assert.strictEqual(ended.state.lastOutcome, 'done');
assert.strictEqual(context.tickDistraction(ended.state, 100, { paused: true }).state.cooldownRemaining, 45);

const cooling = context.tickDistraction(ended.state, 45, { paused: false }).state;
assert.strictEqual(cooling.cooldownRemaining, 0);
assert.strictEqual(context.canDistract(cooling, baseContext(), 'colleague').reason, 'kind_used');
let next = started(cooling, 'printer');
next = arrive(next);
next = json(context.tickDistraction(next, 6, { paused: false }).state);
assert.strictEqual(next.successfulUses, 2);
assert.strictEqual(context.canDistract(next, baseContext(), 'printer').reason, 'limit_reached');
assert.strictEqual(context.canDistract(next, baseContext(), 'colleague').reason, 'limit_reached');

let fresh = started(context.createDistractions(), 'printer');
fresh = arrive(JSON.parse(JSON.stringify(fresh)));
assert.strictEqual(JSON.parse(JSON.stringify(context.finishDistraction(fresh, 'cancel').state)).cooldownRemaining, 45);

console.log('qa-parallel-d1: checks passed');

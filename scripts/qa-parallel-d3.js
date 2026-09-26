'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const context = {};
vm.runInNewContext(fs.readFileSync('js/disguise.js', 'utf8'), context, { filename: 'js/disguise.js' });
const json = value => JSON.parse(JSON.stringify(value));
const beginContext = overrides => Object.assign({
  shiftId: 'shift-3',
  printerAvailable: true,
  action: 'none',
  paused: false,
  shiftEnded: false
}, overrides || {});
const coverContext = overrides => Object.assign({
  moving: true,
  action: 'none',
  bossDistance: 50,
  isRaid: true,
  paused: false,
  shiftEnded: false
}, overrides || {});

let state = context.createDisguise();
assert.deepStrictEqual(json(state), {
  shiftId: null, nextAttemptId: 1, used: false, active: null, lastOutcome: null
});
assert.strictEqual(context.beginDisguise(state, {}).reason, 'context_missing');
assert.strictEqual(context.beginDisguise(state, beginContext({ printerAvailable: false })).reason, 'printer_unavailable');
assert.strictEqual(context.beginDisguise(state, beginContext({ action: 'smoke' })).reason, 'action_busy');

const original = JSON.stringify(state);
state = json(context.beginDisguise(state, beginContext()).state);
assert.strictEqual(JSON.stringify(context.createDisguise()), original);
assert.strictEqual(state.active.phase, 'preparing');
assert.strictEqual(state.active.remainingSeconds, 2);
assert.strictEqual(state.active.sourceId, 'shift-3:disguise:1');
assert.strictEqual(context.beginDisguise(state, beginContext()).reason, 'busy');
assert.strictEqual(context.canDisguiseCover(state, coverContext()).cover, false);

const paused = context.tickDisguise(state, 1.5, { action: 'takeFolder', paused: true, shiftEnded: false });
assert.strictEqual(paused.state, state);
assert.strictEqual(paused.state.active.remainingSeconds, 2);
const prepHalf = context.tickDisguise(state, 1, { action: 'takeFolder', paused: false, shiftEnded: false });
assert.strictEqual(prepHalf.state.active.remainingSeconds, 1);
assert.strictEqual(prepHalf.state.used, false);
const prepCancelled = context.tickDisguise(prepHalf.state, 1, { action: 'none', paused: false, shiftEnded: false });
assert.strictEqual(prepCancelled.state.active, null);
assert.strictEqual(prepCancelled.state.used, false);
assert.strictEqual(prepCancelled.state.lastOutcome, 'preparation_cancelled');

state = json(context.beginDisguise(prepCancelled.state, beginContext()).state);
state = JSON.parse(JSON.stringify(state));
const ready = context.tickDisguise(state, 2, { action: 'takeFolder', paused: false, shiftEnded: false });
assert.strictEqual(ready.state.active.phase, 'active');
assert.strictEqual(ready.state.active.remainingSeconds, 12);
assert.strictEqual(ready.state.used, true);
assert.strictEqual(context.canDisguiseCover(ready.state, coverContext()).cover, true);
assert.strictEqual(context.canDisguiseCover(ready.state, coverContext({ isRaid: false })).reason, 'not_raid');
assert.strictEqual(context.canDisguiseCover(ready.state, coverContext({ moving: false })).reason, 'not_moving');
assert.strictEqual(context.canDisguiseCover(ready.state, coverContext({ action: 'youtube' })).cover, false);
assert.strictEqual(context.canDisguiseCover(ready.state, coverContext({ bossDistance: 34 })).reason, 'boss_too_close');
assert.strictEqual(context.canDisguiseCover(ready.state, coverContext({ paused: true })).cover, false);
assert.strictEqual(context.canDisguiseCover(ready.state, {}).reason, 'context_missing');

const stopped = context.tickDisguise(ready.state, 2, { action: 'none', paused: false, shiftEnded: false });
assert.strictEqual(stopped.state.active.remainingSeconds, 10);
assert.strictEqual(context.canDisguiseCover(stopped.state, coverContext({ moving: false })).cover, false);
const rest = context.tickDisguise(stopped.state, 0, { action: 'rest', paused: false, shiftEnded: false });
assert.strictEqual(rest.state.active, null);
assert.strictEqual(rest.state.used, true);
assert.strictEqual(context.beginDisguise(rest.state, beginContext()).reason, 'already_used');

let expiring = json(context.beginDisguise(context.createDisguise(), beginContext()).state);
expiring = json(context.tickDisguise(expiring, 2, { action: 'takeFolder', paused: false, shiftEnded: false }).state);
const expired = context.tickDisguise(expiring, 12, { action: 'none', paused: false, shiftEnded: false });
assert.strictEqual(expired.state.active, null);
assert.strictEqual(expired.state.lastOutcome, 'expired');
assert.strictEqual(expired.state.used, true);
assert.strictEqual(context.tickDisguise(expired.state, 1, { action: 'none', paused: false, shiftEnded: false }).reason, 'not_active');

const interrupted = context.cancelDisguise(ready.state, 'rest_started');
assert.strictEqual(interrupted.state.used, true);
assert.strictEqual(interrupted.state.active, null);
assert.strictEqual(context.cancelDisguise(interrupted.state, 'cancel').reason, 'not_active');
assert.strictEqual(context.tickDisguise(ready.state, -1, { action: 'none', paused: false, shiftEnded: false }).reason, 'dt_invalid');
assert.strictEqual(context.tickDisguise(ready.state, 1, {}).reason, 'context_missing');

const shiftEnd = context.tickDisguise(ready.state, 1, { action: 'none', paused: false, shiftEnded: true });
assert.strictEqual(shiftEnd.state.active, null);
assert.strictEqual(shiftEnd.state.used, true);

console.log('qa-parallel-d3: checks passed');

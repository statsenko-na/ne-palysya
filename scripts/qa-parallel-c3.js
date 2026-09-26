'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourcePath = path.resolve(__dirname, '../js/event-autoshka.js');
const sandbox = {};
vm.runInNewContext(fs.readFileSync(sourcePath, 'utf8'), sandbox, { filename: sourcePath });
const plain = value => JSON.parse(JSON.stringify(value));
const choiceContext = overrides => ({
  eventActive: true,
  eventId: 'shift-18:autoshka:1',
  eventRemaining: 18,
  sirgeyAvailable: true,
  playerAtDesk: true,
  legalAway: false,
  clockMinutes: 800,
  ...overrides,
});
const repairContext = overrides => ({
  dt: 1,
  paused: false,
  eventActive: true,
  eventId: 'shift-18:autoshka:1',
  eventRemaining: 18,
  sirgeyAvailable: true,
  playerAtDesk: true,
  legalAway: false,
  clockMinutes: 800,
  shiftEnded: false,
  ...overrides,
});
const startChoice = (branch, remaining = 18) => {
  const choice = sandbox.createAutoshkaChoice(choiceContext({ eventRemaining: remaining }));
  assert.equal(choice.ok, true);
  return sandbox.startAutoshkaRepair(choice.state, branch, choiceContext({ eventRemaining: remaining }));
};

assert.equal(sandbox.createAutoshkaChoice(choiceContext({ eventRemaining: 2.99 })).reason, 'event_too_short');
const threeSecondChoice = sandbox.createAutoshkaChoice(choiceContext({ eventRemaining: 3 }));
assert.equal(threeSecondChoice.state.options.quick, true);
assert.equal(threeSecondChoice.state.options.reliable, false);
const sixSecondChoice = sandbox.createAutoshkaChoice(choiceContext({ eventRemaining: 6 }));
assert.equal(sixSecondChoice.state.options.reliable, true);
assert.equal(sixSecondChoice.state.options.quick, true);
assert.equal(sandbox.createAutoshkaChoice(choiceContext({ sirgeyAvailable: false })).reason, 'sirgey_unavailable');
assert.equal(sandbox.createAutoshkaChoice(choiceContext({ playerAtDesk: false })).reason, 'not_at_sirgey_desk');
assert.equal(sandbox.createAutoshkaChoice(choiceContext({ eventActive: false })).reason, 'event_inactive');

const reliableStart = sandbox.startAutoshkaRepair(sixSecondChoice.state, 'reliable', choiceContext({ eventRemaining: 5.99 }));
assert.equal(reliableStart.ok, false, 'start rechecks event time');
assert.equal(sandbox.startAutoshkaRepair(sixSecondChoice.state, 'reliable', choiceContext({ eventId: 'another-event' })).reason, 'event_mismatch');
let reliable = sandbox.startAutoshkaRepair(sixSecondChoice.state, 'reliable', choiceContext({ eventRemaining: 6 }));
assert.equal(reliable.state.remaining, 6);
assert.equal(sandbox.tickAutoshkaRepair(reliable.state, repairContext({ eventId: 'another-event' })).reason, 'event_mismatch');
const beforeTick = JSON.stringify(reliable.state);
let step = sandbox.tickAutoshkaRepair(reliable.state, repairContext({ dt: 3, eventRemaining: 6 }));
assert.equal(step.state.remaining, 3);
assert.equal(JSON.stringify(reliable.state), beforeTick, 'tick does not mutate input state');
reliable = step;
step = sandbox.tickAutoshkaRepair(reliable.state, repairContext({ dt: 3, eventRemaining: 3 }));
assert.equal(step.state.status, 'completed');
assert.equal(step.state.outcome, 'reliable');
assert.deepEqual(plain(step.effects.map(effect => effect.type)), ['addWork', 'relationship', 'awardMoment']);
assert.equal(step.effects[0].amount, 6);
assert.equal(step.effects[1].kind, 'help');
assert.equal(step.effects[1].npcId, 'sirgey');
assert.equal(step.effects[2].momentId, 'colleagueHelp');
assert.equal(step.effects.some(effect => effect.type === 'addFun'), false);
assert.deepEqual(plain(sandbox.tickAutoshkaRepair(step.state, repairContext()).effects), []);
assert.equal(sandbox.startAutoshkaRepair(step.state, 'quick', choiceContext()).reason, 'choice_closed');

const tooLateChoice = sandbox.createAutoshkaChoice(choiceContext());
assert.equal(sandbox.startAutoshkaRepair(tooLateChoice.state, 'quick', choiceContext({ eventRemaining: 2 })).reason, 'event_too_short');
let movedAway = startChoice('quick').state;
step = sandbox.tickAutoshkaRepair(movedAway, repairContext({ dt: 1, playerAtDesk: false }));
assert.equal(step.state.status, 'cancelled');
assert.deepEqual(plain(step.effects), []);
assert.deepEqual(plain(sandbox.cancelAutoshkaRepair(step.state).effects), []);

let endedEarly = startChoice('quick').state;
endedEarly = sandbox.tickAutoshkaRepair(endedEarly, repairContext({ dt: 2, eventRemaining: 2 })).state;
step = sandbox.tickAutoshkaRepair(endedEarly, repairContext({ dt: 1, eventActive: false, eventRemaining: 0 }));
assert.equal(step.state.status, 'cancelled', 'event end before completion cancels without reward');
assert.deepEqual(plain(step.effects), []);

let quick = startChoice('quick', 3);
step = sandbox.tickAutoshkaRepair(quick.state, repairContext({ dt: 3, eventRemaining: 3 }));
assert.equal(step.state.status, 'completed');
assert.equal(step.state.pendingFailure.remaining, 12);
assert.deepEqual(plain(step.effects.map(effect => effect.type)), ['addWork']);
assert.equal(step.effects[0].amount, 3);
assert.equal(step.effects.some(effect => effect.type === 'relationship' || effect.type === 'awardMoment' || effect.type === 'addFun'), false);
quick = step;

let pending = sandbox.tickAutoshkaRepair(quick.state, repairContext({ dt: 5, eventActive: false }));
assert.equal(pending.state.pendingFailure.remaining, 7, 'failure timer survives base event end');
pending = sandbox.tickAutoshkaRepair(pending.state, repairContext({ dt: 7, legalAway: true, eventActive: false }));
assert.equal(pending.state.pendingFailure.remaining, 0);
assert.equal(pending.state.pendingFailure.due, true);
assert.deepEqual(plain(pending.effects), [], 'due failure waits through lunch');
const savedDue = JSON.parse(JSON.stringify(pending.state));
const pausedDue = sandbox.tickAutoshkaRepair(savedDue, repairContext({ dt: 0, paused: true, legalAway: false, eventActive: false }));
assert.deepEqual(plain(pausedDue.effects), [], 'pause delays an already due side effect');
const afterLunch = sandbox.tickAutoshkaRepair(pausedDue.state, repairContext({ dt: 0, legalAway: false, eventActive: false }));
assert.deepEqual(plain(afterLunch.effects.map(effect => effect.type)), ['subtractWork', 'message']);
assert.equal(afterLunch.effects[0].amount, 6);
assert.deepEqual(plain(sandbox.tickAutoshkaRepair(afterLunch.state, repairContext({ dt: 2, eventActive: false })).effects), [], 'failure is applied once');
assert.deepEqual(plain(sandbox.tickAutoshkaRepair(savedDue, repairContext({ dt: 0, legalAway: false, eventActive: false })).effects), plain(afterLunch.effects), 'effect ids survive reload and retry');

let shiftEnd = startChoice('quick').state;
shiftEnd = sandbox.tickAutoshkaRepair(shiftEnd, repairContext({ dt: 3, eventRemaining: 3 })).state;
const discarded = sandbox.tickAutoshkaRepair(shiftEnd, repairContext({ dt: 2, shiftEnded: true, eventActive: false }));
assert.equal(discarded.state.pendingFailure.status, 'discarded', 'not-yet-due failure is discarded at shift end');
assert.deepEqual(plain(discarded.effects), []);
assert.deepEqual(plain(sandbox.tickAutoshkaRepair(discarded.state, repairContext({ dt: 1, shiftEnded: true })).effects), []);

assert.deepEqual(plain(JSON.parse(JSON.stringify(afterLunch.state))), plain(afterLunch.state), 'state survives JSON round trip');
console.log('C3 autoshka model: all assertions passed');

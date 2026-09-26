'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourcePath = path.resolve(__dirname, '../js/story-yogurt.js');
const sandbox = {};
vm.runInNewContext(fs.readFileSync(sourcePath, 'utf8'), sandbox, { filename: sourcePath });
const plain = value => JSON.parse(JSON.stringify(value));
const baseContext = overrides => ({
  dt: 1,
  paused: false,
  clockMinutes: 600,
  shiftEnded: false,
  legalAway: false,
  ownerAvailable: true,
  blebFavorAvailable: false,
  coffeeCompletedAfterDiscovery: false,
  ...overrides,
});
const startStory = (sourceId, clockMinutes = 600) => sandbox.startYogurtStory(sandbox.createYogurtStory(), {
  shiftId: 'shift-17', sourceId, clockMinutes, shiftEnded: false,
});
const discoverStory = (state, clockMinutes = 600) => sandbox.tickYogurtStory(state, baseContext({ dt: 10, clockMinutes }));

const empty = sandbox.createYogurtStory();
assert.equal(empty.status, 'dormant');
assert.deepEqual(plain(JSON.parse(JSON.stringify(empty))), plain(empty));
assert.equal(sandbox.startYogurtStory(empty, { sourceId: 'theft' }).reason, 'missing_shift_id');
assert.equal(sandbox.tickYogurtStory(empty, baseContext()).reason, 'story_not_started');

let started = startStory('theft-1');
assert.equal(started.ok, true);
assert.equal(started.state.status, 'stolen');
assert.equal(sandbox.startYogurtStory(started.state, {
  shiftId: 'shift-17', sourceId: 'theft-1', clockMinutes: 600, shiftEnded: false,
}).reason, 'story_already_started');

let ticking = sandbox.tickYogurtStory(started.state, baseContext({ dt: 5, paused: true }));
assert.equal(ticking.state.detectionElapsed, 0, 'paused time does not advance');
ticking = sandbox.tickYogurtStory(started.state, baseContext({ dt: 8, legalAway: true }));
assert.equal(ticking.state.detectionElapsed, 0, 'legal away delays discovery');
ticking = sandbox.tickYogurtStory(started.state, baseContext({ dt: 8, ownerAvailable: false }));
assert.equal(ticking.state.detectionElapsed, 0, 'missing Hlad delays discovery safely');
ticking = sandbox.tickYogurtStory(started.state, baseContext({ dt: 4 }));
assert.equal(ticking.state.detectionElapsed, 4);
const reload = JSON.parse(JSON.stringify(ticking.state));
const discovered = sandbox.tickYogurtStory(reload, baseContext({ dt: 6 }));
assert.equal(discovered.state.status, 'discovered');
assert.equal(discovered.effects.length, 2);
assert.deepEqual(plain(discovered.effects.map(effect => effect.type)), ['relationship', 'message']);
assert.equal(discovered.effects[0].npcId, 'hlad');
assert.equal(discovered.effects[0].kind, 'betrayal');
assert.deepEqual(plain(sandbox.tickYogurtStory(discovered.state, baseContext()).effects), []);

let noCredit = sandbox.chooseYogurtResolution(discovered.state, 'bleb', baseContext({ blebFavorAvailable: false }));
assert.equal(noCredit.ok, false);
assert.equal(noCredit.reason, 'favor_unavailable');
assert.equal(noCredit.state, discovered.state, 'failed favor leaves the story discovered');
let bleb = sandbox.chooseYogurtResolution(discovered.state, 'bleb', baseContext({ blebFavorAvailable: true }));
assert.equal(bleb.ok, true);
assert.equal(bleb.state.status, 'resolved');
assert.equal(bleb.state.outcome, 'bleb');
assert.deepEqual(plain(bleb.effects.map(effect => effect.type)), ['consumeFavor', 'relationship', 'awardMoment', 'message']);
assert.equal(bleb.effects[0].npcId, 'bleb');
assert.equal(bleb.effects[1].kind, 'apology');
assert.equal(bleb.effects[2].momentId, 'story');
assert.equal(new Set(bleb.effects.map(effect => effect.id)).size, bleb.effects.length);
assert.deepEqual(plain(sandbox.chooseYogurtResolution(discovered.state, 'bleb', baseContext({ blebFavorAvailable: true })).effects), plain(bleb.effects), 'effect ids are stable across reload/retry');
assert.deepEqual(plain(sandbox.chooseYogurtResolution(bleb.state, 'bleb', baseContext()).effects), []);
assert.equal(sandbox.chooseYogurtResolution(bleb.state, 'silent', baseContext()).reason, 'resolution_locked');

let admissionStart = startStory('theft-coffee').state;
let admissionDiscovery = discoverStory(admissionStart, 1000);
let admission = sandbox.chooseYogurtResolution(admissionDiscovery.state, 'admit', baseContext({ clockMinutes: 1005 }));
assert.equal(admission.ok, true);
assert.equal(admission.state.status, 'discovered', 'admission waits for the separate coffee action');
assert.deepEqual(plain(admission.effects), []);
assert.equal(sandbox.completeYogurtCoffee(admission.state, baseContext({ clockMinutes: 1006, coffeeCompletedAfterDiscovery: false })).reason, 'coffee_required');
const coffee = sandbox.completeYogurtCoffee(admission.state, baseContext({ clockMinutes: 1008, coffeeCompletedAfterDiscovery: true }));
assert.equal(coffee.ok, true);
assert.equal(coffee.state.outcome, 'coffee');
assert.deepEqual(plain(coffee.effects.map(effect => effect.type)), ['relationship', 'awardMoment', 'message']);
assert.equal(coffee.effects.some(effect => effect.type === 'addFun' || effect.type === 'activateCoffee'), false);
assert.deepEqual(plain(sandbox.completeYogurtCoffee(coffee.state, baseContext({ coffeeCompletedAfterDiscovery: true })).effects), []);
assert.equal(sandbox.chooseYogurtResolution(admissionDiscovery.state, 'admit', baseContext({ clockMinutes: 1020 })).reason, 'response_expired');

let silentState = discoverStory(startStory('theft-silent').state, 1010).state;
silentState = sandbox.chooseYogurtResolution(silentState, 'silent', baseContext({ clockMinutes: 1015 })).state;
const lunchWait = sandbox.tickYogurtStory(silentState, baseContext({ clockMinutes: 1020, legalAway: true }));
assert.equal(lunchWait.state.status, 'discovered', '17:00 timeout waits through legal away');
const timedOut = sandbox.tickYogurtStory(lunchWait.state, baseContext({ clockMinutes: 1020 }));
assert.equal(timedOut.state.status, 'resolved');
assert.equal(timedOut.state.outcome, 'silent');
assert.equal(timedOut.effects.length, 1);
assert.deepEqual(plain(sandbox.tickYogurtStory(timedOut.state, baseContext({ clockMinutes: 1021 })).effects), []);

let late = discoverStory(startStory('theft-late', 1020).state, 1020);
assert.equal(late.state.responseSecondsRemaining, 20);
late = sandbox.tickYogurtStory(late.state, baseContext({ clockMinutes: 1021, dt: 8 }));
assert.equal(late.state.responseSecondsRemaining, 12);
late = sandbox.tickYogurtStory(late.state, baseContext({ clockMinutes: 1022, dt: 12 }));
assert.equal(late.state.outcome, 'silent', 'late theft allows twenty simulation seconds');
assert.equal(late.state.status, 'resolved');

const absentOwner = sandbox.chooseYogurtResolution(discovered.state, 'admit', baseContext({ ownerAvailable: false }));
assert.equal(absentOwner.reason, 'owner_unavailable');
const endOfShift = sandbox.tickYogurtStory(startStory('theft-end', 1100).state, baseContext({ shiftEnded: true, clockMinutes: 1170 }));
assert.equal(endOfShift.state.status, 'resolved');
assert.equal(endOfShift.state.outcome, 'shift_end');
assert.equal(endOfShift.effects[0].kind, 'betrayal', 'unseen theft at shift end still makes Hlad angry');

let repeated = sandbox.tickYogurtStory(startStory('theft-repeat').state, baseContext({ shiftEnded: true }));
repeated = sandbox.tickYogurtStory(repeated.state, baseContext({ shiftEnded: true }));
assert.deepEqual(plain(repeated.effects), []);
assert.equal(JSON.stringify(JSON.parse(JSON.stringify(bleb.state))), JSON.stringify(plain(bleb.state)), 'resolved state survives JSON round trip');

console.log('C2 yogurt story model: all assertions passed');

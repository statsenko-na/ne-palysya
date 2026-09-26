'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const context = {};
vm.runInNewContext(fs.readFileSync('js/activities.js', 'utf8'), context, { filename: 'js/activities.js' });
const json = value => JSON.parse(JSON.stringify(value));
const base = overrides => Object.assign({ shiftId: 'shift-2', paused: false, shiftEnded: false }, overrides || {});
const start = (state, variant, overrides) => {
  const result = context.startActivityVariant(state, base(overrides), variant);
  assert.strictEqual(result.ok, true);
  return json(result.state);
};
const tick = (state, dt, overrides) => context.tickActivityVariant(state, dt, base(overrides));

let state = context.createActivities();
assert.deepStrictEqual(json(state), {
  shiftId: null, nextAttemptId: 1, active: null,
  listeningCompleted: false, intelGranted: false, yogurtStolen: false
});
assert.strictEqual(context.startActivityVariant(state, {}, 'youtube-quiet').reason, 'context_missing');
assert.strictEqual(context.startActivityVariant(state, base({ dayIndex: 0, ordinarySmokeCompleted: true }), 'smoke-listening').reason, 'locked');
assert.strictEqual(context.startActivityVariant(state, base({ dayIndex: 1, ordinarySmokeCompleted: false }), 'smoke-listening').reason, 'smoke_not_completed');
assert.strictEqual(context.startActivityVariant(state, base({ internetAvailable: false }), 'youtube-quiet').reason, 'internet_unavailable');
assert.strictEqual(context.startActivityVariant(state, base({ internetAvailable: true }), 'unknown').reason, 'variant_invalid');

state = start(state, 'smoke-listening', { dayIndex: 1, ordinarySmokeCompleted: true });
assert.strictEqual(state.active.durationSeconds, 3);
assert.strictEqual(state.active.rate, 0);
assert.strictEqual(state.active.countAsBaseActivity, false);
const listeningPause = tick(state, 2, { paused: true });
assert.strictEqual(listeningPause.state, state);
assert.strictEqual(listeningPause.remaining, 3);
const listeningCancel = context.cancelActivityVariant(state, 'cancel');
assert.deepStrictEqual(json(listeningCancel.effects), []);
assert.strictEqual(listeningCancel.state.intelGranted, false);
state = start(listeningCancel.state, 'smoke-listening', { dayIndex: 1, ordinarySmokeCompleted: true });
let listeningDone = tick(state, 3, {});
assert.strictEqual(listeningDone.completed, true);
assert.strictEqual(listeningDone.rate, 0);
assert.deepStrictEqual(json(listeningDone.effects), [{
  id: 'shift-2:activity:2:intel',
  type: 'grantIntel',
  seconds: 20,
  combine: 'max'
}]);
assert.strictEqual(listeningDone.state.intelGranted, true);
assert.strictEqual(context.startActivityVariant(listeningDone.state, base({ dayIndex: 1, ordinarySmokeCompleted: true }), 'smoke-listening').reason, 'already_listened');
assert.strictEqual(listeningDone.effects.some(effect => effect.type === 'addFun'), false);

state = start(context.createActivities(), 'youtube-quiet', { internetAvailable: true });
assert.strictEqual(state.active.durationSeconds * state.active.rate, 40);
assert.strictEqual(tick(state, 4, {}).remaining, 4);
const canceledVideo = context.cancelActivityVariant(tick(state, 2, {}).state, 'cancel');
assert.deepStrictEqual(json(canceledVideo.effects), []);
let quiet = start(canceledVideo.state, 'youtube-quiet', { internetAvailable: true });
const quietDone = tick(quiet, 8, {});
assert.strictEqual(quietDone.completed, true);
assert.strictEqual(quietDone.rate * 8, 40);
assert.deepStrictEqual(json(quietDone.effects), [{
  id: 'shift-2:activity:2:videos',
  type: 'countCompleted',
  statId: 'videos',
  sourceId: 'shift-2:activity:2'
}]);
assert.strictEqual(json(context.finishActivityVariant(quietDone.state, 'done')).effects.length, 0);

state = start(context.createActivities(), 'youtube-loud', { internetAvailable: true });
assert.strictEqual(state.active.durationSeconds, 6);
assert.strictEqual(state.active.rate * state.active.durationSeconds, 33);
const justBeforeNoise = tick(state, 2.9, { bossState: 'patrol', bossDistance: 100, bossRouteAvailable: true });
assert.deepStrictEqual(json(justBeforeNoise.effects), []);
const loudReloaded = JSON.parse(JSON.stringify(justBeforeNoise.state));
const noise = tick(loudReloaded, 0.1, { bossState: 'patrol', bossDistance: 100, bossRouteAvailable: true });
assert.deepStrictEqual(json(noise.effects), [{
  id: 'shift-2:activity:1:noise',
  type: 'requestBossRoute',
  targetId: 'server',
  reasonId: 'youtube_loud'
}]);
assert.strictEqual(noise.state.active.noiseTriggered, true);
assert.deepStrictEqual(json(tick(noise.state, 1, { bossState: 'patrol', bossDistance: 100, bossRouteAvailable: true }).effects), []);
const loudDone = tick(noise.state, 3, { bossState: 'patrol', bossDistance: 100, bossRouteAvailable: true });
assert.strictEqual(loudDone.completed, true);
assert.strictEqual(loudDone.effects.filter(effect => effect.type === 'requestBossRoute').length, 0);
assert.strictEqual(loudDone.effects.filter(effect => effect.type === 'countCompleted' && effect.statId === 'videos').length, 1);

state = start(context.createActivities(), 'youtube-loud', { internetAvailable: true });
const blockedNoise = tick(state, 3, { bossState: 'inspect', bossDistance: 50, bossRouteAvailable: false });
assert.strictEqual(blockedNoise.effects.length, 1);
assert.strictEqual(blockedNoise.effects[0].type, 'message');
assert.strictEqual(blockedNoise.effects[0].lineId, 'youtubeNoiseBlocked');
assert.strictEqual(blockedNoise.effects.some(effect => effect.type === 'requestBossRoute'), false);

state = start(context.createActivities(), 'youtube-loud', { internetAvailable: true });
const missingNoiseContext = tick(state, 3, {});
assert.strictEqual(missingNoiseContext.ok, false);
assert.strictEqual(missingNoiseContext.reason, 'context_missing');
assert.strictEqual(missingNoiseContext.state, state);
const distantNoise = tick(state, 3, { bossState: 'patrol', bossDistance: 221, bossRouteAvailable: true });
assert.deepStrictEqual(json(distantNoise.effects), []);
assert.strictEqual(distantNoise.state.active.noiseTriggered, true);

state = start(context.createActivities(), 'fridge-own');
assert.strictEqual(state.active.durationSeconds * state.active.rate, 13.5);
const ownCanceled = context.cancelActivityVariant(state, 'cancel');
assert.deepStrictEqual(json(ownCanceled.effects), []);
assert.strictEqual(ownCanceled.state.yogurtStolen, false);
const ownerMissing = context.startActivityVariant(ownCanceled.state, base({ ownerAvailable: false, storyAvailable: true }), 'fridge-yogurt');
assert.strictEqual(ownerMissing.ok, false);
assert.strictEqual(ownerMissing.reason, 'owner_unavailable');
const storyMissing = context.startActivityVariant(ownCanceled.state, base({ ownerAvailable: true, storyAvailable: false }), 'fridge-yogurt');
assert.strictEqual(storyMissing.reason, 'story_unavailable');

const own = start(context.createActivities(), 'fridge-own');
const ownDone = tick(own, 4.5, {});
assert.strictEqual(ownDone.completed, true);
assert.strictEqual(ownDone.rate * 4.5, 13.5);
assert.deepStrictEqual(json(ownDone.effects), [{
  id: 'shift-2:activity:1:fridge',
  type: 'countCompleted',
  statId: 'fridge',
  sourceId: 'shift-2:activity:1'
}]);

state = start(ownCanceled.state, 'fridge-yogurt', { ownerAvailable: true, storyAvailable: true });
assert.strictEqual(state.active.durationSeconds, 4.5);
assert.strictEqual(state.active.rate * state.active.durationSeconds, 18);
const yogurtCancel = context.cancelActivityVariant(tick(state, 2, {}).state, 'cancel');
assert.strictEqual(yogurtCancel.state.yogurtStolen, false);
assert.strictEqual(yogurtCancel.effects.some(effect => effect.type === 'startStory'), false);

state = start(yogurtCancel.state, 'fridge-yogurt', { ownerAvailable: true, storyAvailable: true });
const yogurtDone = tick(state, 4.5, {});
assert.strictEqual(yogurtDone.state.yogurtStolen, true);
assert.deepStrictEqual(json(yogurtDone.effects), [
  {
    id: 'shift-2:activity:3:fridge',
    type: 'countCompleted',
    statId: 'fridge',
    sourceId: 'shift-2:activity:3'
  },
  {
    id: 'shift-2:activity:3:story',
    type: 'startStory',
    storyId: 'yogurt',
    sourceId: 'shift-2:activity:3'
  }
]);
assert.strictEqual(context.startActivityVariant(yogurtDone.state, base({ ownerAvailable: true, storyAvailable: true }), 'fridge-yogurt').reason, 'yogurt_already_stolen');
assert.strictEqual(yogurtDone.effects.some(effect => effect.type === 'addFun'), false);

const notComplete = context.finishActivityVariant(own, 'done');
assert.strictEqual(notComplete.ok, false);
assert.strictEqual(notComplete.reason, 'not_complete');
assert.strictEqual(context.tickActivityVariant(own, -1, base()).reason, 'dt_invalid');
assert.strictEqual(context.tickActivityVariant(own, 1, {}).reason, 'context_missing');
assert.strictEqual(context.tickActivityVariant(own, 1, base({ shiftEnded: true })).state.active, null);
assert.strictEqual(context.startActivityVariant(ownDone.state, base({ shiftId: 'other-shift' }), 'fridge-own').reason, 'shift_mismatch');

const intelEffect = listeningDone.effects[0];
assert.strictEqual(Math.max(45, intelEffect.seconds), 45);

console.log('qa-parallel-d2: checks passed');

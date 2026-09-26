const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'moments.js'), 'utf8');
const sandbox = {};
vm.runInNewContext(`${source}\n;globalThis.api = { createMoments, awardMoment, summarizeMoments, calculateShiftResult };`, sandbox);
const { createMoments, awardMoment, summarizeMoments, calculateShiftResult } = sandbox.api;
const varietyContext = (activityId, completed = true) => ({
  activityId, active: false, completed, paused: false,
});

let moments = createMoments();
for (const id of ['distraction', 'colleagueHelp', 'story', 'groupSmoke']) {
  const result = awardMoment(moments, id, `shift-1:${id}`);
  assert.equal(result.ok, true, `должен начислиться ${id}`);
  moments = result.state;
}
for (const kind of ['smoke', 'youtube', 'fridge', 'chat']) {
  moments = awardMoment(moments, 'variety', `shift-1:rest:${kind}`, varietyContext(kind)).state;
}
assert.equal(summarizeMoments(moments).awarded, 12);
assert.equal(summarizeMoments(moments).remaining, 0);
assert.equal(moments.awards.some(item => item.id === 'variety'), false, 'общий потолок блокирует пятый бонус');

const beforeDuplicate = JSON.stringify(moments);
const duplicate = awardMoment(moments, 'story', 'shift-1:story');
assert.equal(duplicate.ok, false);
assert.equal(duplicate.reason, 'duplicate_source');
assert.equal(JSON.stringify(moments), beforeDuplicate, 'повтор не мутирует исходное состояние');
assert.equal(awardMoment(moments, 'unknown', 'shift-1:unknown').reason, 'unknown_moment');

let variety = createMoments();
const cancelled = awardMoment(variety, 'variety', 'shift-1:smoke-cancel', varietyContext('smoke', false));
assert.equal(cancelled.ok, true);
variety = cancelled.state;
assert.equal(variety.variety.completedKinds.length, 0, 'отмена не считается отдыхом');
variety = awardMoment(variety, 'variety', 'shift-1:smoke', varietyContext('smoke')).state;
variety = awardMoment(variety, 'variety', 'shift-1:youtube', varietyContext('youtube')).state;
variety = awardMoment(variety, 'variety', 'shift-1:fridge', varietyContext('fridge')).state;
variety = awardMoment(variety, 'variety', 'shift-1:phone', {
  activityId: 'phone', active: true, completed: false, paused: false, dt: 3,
}).state;
variety = awardMoment(variety, 'variety', 'shift-1:phone', {
  activityId: 'phone', active: true, completed: false, paused: false, dt: 3,
}).state;
assert.equal(variety.variety.completedKinds.includes('phone'), false, 'открытый телефон пока не считается');
variety = awardMoment(variety, 'variety', 'shift-1:phone', {
  activityId: 'phone', active: false, completed: true, paused: false,
}).state;
assert.equal(summarizeMoments(variety).awarded, 3, 'четыре разных завершённых отдыха дают один бонус');
const roundTrip = JSON.parse(JSON.stringify(variety));
assert.equal(JSON.stringify(roundTrip), JSON.stringify(variety), 'состояние проходит JSON round trip');
const repeatedRest = awardMoment(roundTrip, 'variety', 'shift-1:phone', varietyContext('phone'));
assert.equal(repeatedRest.effects.length, 0, 'повтор завершённого отдыха не платит повторно');

let phoneShort = createMoments();
phoneShort = awardMoment(phoneShort, 'variety', 'shift-1:phone-short', {
  activityId: 'phone', active: true, completed: false, paused: false, dt: 5.99,
}).state;
phoneShort = awardMoment(phoneShort, 'variety', 'shift-1:phone-short', {
  activityId: 'phone', active: false, completed: true, paused: false,
}).state;
assert.equal(phoneShort.variety.completedKinds.includes('phone'), false, 'телефон меньше шести секунд не считается');
const paused = awardMoment(phoneShort, 'variety', 'shift-1:phone-short', {
  activityId: 'phone', active: true, completed: false, paused: true, dt: 20,
}).state;
assert.deepEqual(JSON.parse(JSON.stringify(paused)), JSON.parse(JSON.stringify(phoneShort)), 'пауза не продвигает эпизод');

const result = calculateShiftResult({ fun: 80, fullPlan: true, done: 2, reprimands: 1, momentBonus: 12 });
assert.equal(result.ok, true);
assert.equal(result.score, 121);
assert.equal(result.coins, 12);
assert.deepEqual(JSON.parse(JSON.stringify(result.grade)), { rank: 'A', title: 'Мастер имитации' });
assert.equal(calculateShiftResult({ fun: 0, fullPlan: false, done: 0, reprimands: 0, momentBonus: 0 }).score, 0);
assert.equal(calculateShiftResult({ fun: 120, fullPlan: false, done: 0, reprimands: 0, momentBonus: 0 }).score, 100);
assert.equal(calculateShiftResult({ fun: 0, fullPlan: false, done: 0, reprimands: 1, momentBonus: 0 }).score, 0);
assert.equal(calculateShiftResult({ fun: 0, done: 0 }).reason, 'snapshot_incomplete');

console.log('B1: проверки модели моментов и результата смены пройдены.');

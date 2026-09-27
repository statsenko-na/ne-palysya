'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function load(file, extra = {}) {
  const context = vm.createContext({ structuredClone, ...extra });
  vm.runInContext(read(file), context, { filename: file });
  return context;
}

const configContext = load('js/config.js', { window: {} });
const cfg = configContext.window.NP_CONFIG.CFG;
const playerSource = read('js/player.js');

// Isolated baseline work, without coffee, gear, surveillance, toilet or event multipliers.
assert.match(playerSource, /fun = Math\.max\(0, fun - CFG\.workFunDrain/);
assert.match(playerSource, /addWork\(base \* mult \* dt\)/);
assert.match(playerSource, /day\.excelWorkAcc >= 14/);
const ordinaryWork = {
  seconds: 8,
  plan: cfg.workKpi * 8,
  funDelta: -cfg.workFunDrain * 8,
  microTask: 0,
};
assert.deepEqual(ordinaryWork, { seconds: 8, plan: 8, funDelta: -8, microTask: 0 });
const oneMicroTask = {
  seconds: 14,
  plan: cfg.workKpi * 14,
  funDelta: -cfg.workFunDrain * 14 + 4,
};
assert.deepEqual(oneMicroTask, { seconds: 14, plan: 14, funDelta: -10 });

// Quiet rest and risky rest use the shipped D2 model and its actual runtime adapter inputs.
const activities = load('js/activities.js');
const activityContext = overrides => ({ shiftId: 'balance-audit', paused: false, shiftEnded: false, ...overrides });
const quietStart = activities.startActivityVariant(
  activities.createActivities(), activityContext({ internetAvailable: true }), 'youtube-quiet',
);
assert.equal(quietStart.ok, true);
const quietFinish = activities.tickActivityVariant(quietStart.state, 8, activityContext());
assert.equal(quietFinish.completed, true);
assert.equal(quietFinish.rate * quietStart.state.active.durationSeconds, 40);
assert.equal(quietFinish.effects.filter(effect => effect.type === 'countCompleted' && effect.statId === 'videos').length, 1);
assert.equal(quietFinish.effects.some(effect => effect.type === 'addFun' || effect.type === 'addWork'), false);

const loudStart = activities.startActivityVariant(
  activities.createActivities(), activityContext({ internetAvailable: true }), 'youtube-loud',
);
assert.equal(loudStart.ok, true);
assert.equal(loudStart.state.active.rate * loudStart.state.active.durationSeconds, 33);
const bossNearby = { bossState: 'patrol', bossDistance: 200, bossRouteAvailable: true };
const loudBeforeNoise = activities.tickActivityVariant(loudStart.state, 2.9, activityContext(bossNearby));
assert.equal(loudBeforeNoise.effects.length, 0);
const loudNoise = activities.tickActivityVariant(loudBeforeNoise.state, 0.1, activityContext(bossNearby));
assert.equal(loudNoise.effects.filter(effect => effect.type === 'requestBossRoute').length, 1);
assert.equal(loudNoise.state.active.noiseTriggered, true);
const loudFinish = activities.tickActivityVariant(loudNoise.state, 3, activityContext(bossNearby));
assert.equal(loudFinish.completed, true);
assert.equal(loudFinish.effects.filter(effect => effect.type === 'countCompleted' && effect.statId === 'videos').length, 1);

// Reliable auto-shka repair has a six-second cost, plan +6 and one relationship/story reward, but no fun.
const autoshka = load('js/event-autoshka.js');
const repairContext = {
  eventActive: true, eventId: 'balance-autoshka', eventRemaining: 18,
  sirgeyAvailable: true, playerAtDesk: true, legalAway: false, clockMinutes: 12 * 60,
};
const offeredHelp = autoshka.createAutoshkaChoice(repairContext);
assert.equal(offeredHelp.ok, true);
const startedHelp = autoshka.startAutoshkaRepair(offeredHelp.state, 'reliable', repairContext);
assert.equal(startedHelp.ok, true);
const completedHelp = autoshka.tickAutoshkaRepair(startedHelp.state, {
  ...repairContext, dt: 6, eventRemaining: 12, paused: false, shiftEnded: false,
});
assert.equal(completedHelp.state.status, 'completed');
assert.equal(completedHelp.effects.find(effect => effect.type === 'addWork').amount, 6);
assert.equal(completedHelp.effects.filter(effect => effect.type === 'relationship').length, 1);
assert.equal(completedHelp.effects.filter(effect => effect.type === 'awardMoment' && effect.momentId === 'colleagueHelp').length, 1);
assert.equal(completedHelp.effects.some(effect => effect.type === 'addFun'), false);

// Two concrete purchases: they cost coins and consume at most the two equipment slots; they grant no immediate gameplay effects.
const equipment = load('js/equipment.js');
const editContext = { phase: 'menu', paused: false };
const firstPurchase = equipment.purchaseEquipment(equipment.createEquipmentState(), 'thermos', 100, editContext);
assert.equal(firstPurchase.ok, true);
const secondPurchase = equipment.purchaseEquipment(firstPurchase.state, 'mirror', firstPurchase.coins, editContext);
assert.equal(secondPurchase.ok, true);
assert.equal(secondPurchase.coins, 64);
assert.equal(secondPurchase.effects.length, 0);
const thermosEquipped = equipment.equipItem(secondPurchase.state, 'thermos', 0, editContext);
const mirrorEquipped = equipment.equipItem(thermosEquipped.state, 'mirror', 1, editContext);
assert.equal(mirrorEquipped.ok, true);
assert.deepEqual(JSON.parse(JSON.stringify(mirrorEquipped.state.loadout)), ['thermos', 'mirror']);

// One story moment only; the four-award ceiling is +12, while a reprimand removes exactly 15 final points.
const moments = load('js/moments.js');
let momentState = moments.createMoments();
for (const id of ['story', 'colleagueHelp', 'distraction']) {
  const result = moments.awardMoment(momentState, id, `balance:${id}`);
  assert.equal(result.ok, true);
  momentState = result.state;
}
assert.equal(moments.awardMoment(momentState, 'story', 'balance:second-story').reason, 'moment_already_awarded');
for (const activityId of ['smoke', 'youtube', 'fridge', 'chat']) {
  const result = moments.awardMoment(momentState, 'variety', `balance:variety:${activityId}`, {
    activityId, completed: true, active: false, paused: false, shiftEnded: false,
  });
  if (result.ok) momentState = result.state;
}
assert.equal(moments.summarizeMoments(momentState).awarded, 12);
const scoreNoReprimand = moments.calculateShiftResult({ fun: 50, fullPlan: true, done: 1, reprimands: 0, momentBonus: 12 });
const scoreWithReprimand = moments.calculateShiftResult({ fun: 50, fullPlan: true, done: 1, reprimands: 1, momentBonus: 12 });
assert.equal(scoreNoReprimand.score, 94);
assert.equal(scoreNoReprimand.score - scoreWithReprimand.score, 15);

const eventSource = read('js/events.js');
const aljaziraStart = eventSource.indexOf("if (mood === 'disaster') {");
const aljaziraEnd = eventSource.indexOf("} else if (mood === 'good')", aljaziraStart);
assert.ok(aljaziraStart >= 0 && aljaziraEnd > aljaziraStart, 'Aljazira disaster branch is present');
const aljaziraDisaster = eventSource.slice(aljaziraStart, aljaziraEnd);
assert.match(aljaziraDisaster, /day\.aljaziraDisasterDone = true/);
assert.match(aljaziraDisaster, /fun = 0; usefulness = 0;/);
assert.doesNotMatch(aljaziraDisaster, /awardMoment|addFun\(/, 'the catastrophe remains a reset, not a reward path');

const report = {
  ordinaryWork8s: `${ordinaryWork.plan} plan, ${ordinaryWork.funDelta} fun`,
  ordinaryWork14sWithOneTicket: `${oneMicroTask.plan} plan, ${oneMicroTask.funDelta} net fun`,
  quietYoutube: '8 s → +40 fun, 0 plan',
  loudYoutube: '6 s → +33 fun; one noise event after 3 s when boss is within 220 units',
  reliableAutoshka: '6 s → +6 plan, one Sirgey relationship credit, +3 moment, 0 fun',
  thermosPlusMirror: '−36 KPI coins, two slots, 0 immediate plan/fun effect',
  storyAndMomentCap: 'one story award; +12 maximum moment bonus',
  reprimand: '−15 final points per reprimand',
  aljaziraDisaster: 'once per day; resets current fun and plan to 0; no moment reward',
};
console.log('qa-plan-34: deterministic balance scenarios and integration invariants passed');
console.log(JSON.stringify(report, null, 2));

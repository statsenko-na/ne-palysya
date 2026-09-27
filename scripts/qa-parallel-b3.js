const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'equipment.js'), 'utf8');
const sandbox = {};
vm.runInNewContext(`${source}\n;globalThis.api = { createEquipmentState, validateLoadout, purchaseEquipment, equipItem, beginEquipmentShift, recordThermosBrew, useThermos, equipmentMirrorVisible, activateAutoclicker, beginAutoclickerInspection, tickEquipment };`, sandbox);
const api = sandbox.api;
const menu = { phase: 'menu' };
const ended = { phase: 'ended' };
const shift = (state, shiftId) => api.beginEquipmentShift(state, { shiftId, newShift: true });

let state = api.createEquipmentState();
assert.deepEqual(JSON.parse(JSON.stringify(state.ownedEquipment)), []);
assert.deepEqual(JSON.parse(JSON.stringify(state.loadout)), [null, null]);
const oldSave = api.createEquipmentState({ upgrades: { chair: true, turka: true } });
assert.deepEqual(JSON.parse(JSON.stringify(oldSave.ownedEquipment)), [], 'старые апгрейды не мигрируют в слоты');

let bought = api.purchaseEquipment(state, 'thermos', 17, menu);
assert.equal(bought.ok, false);
assert.equal(bought.reason, 'insufficient_coins');
assert.equal(bought.coins, 17);
bought = api.purchaseEquipment(state, 'thermos', 18, menu);
assert.equal(bought.ok, true);
assert.equal(bought.coins, 0, 'покупка списывает точную цену атомарно');
const duplicatePurchase = api.purchaseEquipment(bought.state, 'thermos', 100, menu);
assert.equal(duplicatePurchase.ok, false);
assert.equal(duplicatePurchase.reason, 'already_owned');
assert.equal(duplicatePurchase.coins, 100, 'повторная покупка не списывает монеты');
assert.equal(api.purchaseEquipment(state, 'mirror', 100, { phase: 'paused' }).reason, 'equipment_locked');
assert.equal(api.purchaseEquipment(state, 'mystery', 100, menu).reason, 'unknown_equipment');

state = api.createEquipmentState({ ownedEquipment: ['thermos', 'mirror', 'autoclicker'] });
assert.equal(api.validateLoadout(state).valid, true);
state = api.equipItem(state, 'thermos', 0, menu).state;
state = api.equipItem(state, 'mirror', 1, menu).state;
assert.equal(api.validateLoadout(state).valid, true);
assert.equal(api.equipItem(state, 'mirror', 0, menu).reason, 'duplicate_loadout_item');
assert.equal(api.equipItem(state, 'autoclicker', 2, menu).reason, 'invalid_slot');
assert.equal(api.equipItem(state, 'autoclicker', 0, { phase: 'paused' }).reason, 'equipment_locked');

let started = shift(state, 'shift-1');
assert.equal(started.ok, true);
state = started.state;
assert.deepEqual(JSON.parse(JSON.stringify(state.activeLoadout)), ['thermos', 'mirror']);
let brew = api.recordThermosBrew(state, {
  brewId: 'shift-1:coffee-1', completed: true, coffeeForColleague: true, paused: false, shiftEnded: false,
});
assert.equal(brew.ok, false);
assert.equal(brew.reason, 'shared_coffee');
assert.equal(state.thermosCharge, false);
brew = api.recordThermosBrew(state, {
  brewId: 'shift-1:coffee-1', completed: true, coffeeForColleague: false, paused: false, shiftEnded: false,
});
assert.equal(brew.ok, true);
state = brew.state;
assert.equal(state.thermosCharge, true);
assert.equal(api.recordThermosBrew(state, {
  brewId: 'shift-1:coffee-1', completed: true, coffeeForColleague: false, paused: false, shiftEnded: false,
}).reason, 'duplicate_brew');
assert.equal(api.recordThermosBrew(state, {
  brewId: 'shift-1:coffee-2', completed: false, coffeeForColleague: false, paused: false, shiftEnded: false,
}).reason, 'brew_not_complete');
assert.equal(api.useThermos(state, { currentBoost: 0, viaPhone: false, paused: false, shiftEnded: false }).reason, 'phone_required');
const thermosUse = api.useThermos(state, { currentBoost: 0, viaPhone: true, paused: false, shiftEnded: false });
assert.equal(thermosUse.ok, true);
assert.equal(thermosUse.coffeeBoost, 8);
assert.equal(Object.hasOwn(thermosUse, 'plan'), false);
assert.equal(Object.hasOwn(thermosUse, 'fun'), false);
assert.equal(api.useThermos(thermosUse.state, { currentBoost: 2, viaPhone: true, paused: false, shiftEnded: false }).reason, 'thermos_charge_unavailable');
assert.equal(api.useThermos(state, { currentBoost: 20, viaPhone: true, paused: true, shiftEnded: false }).reason, 'paused');
assert.equal(api.useThermos(state, { currentBoost: 20, viaPhone: true, paused: false, shiftEnded: true }).reason, 'shift_ended');
let highBoostState = api.createEquipmentState({ ownedEquipment: ['thermos'], loadout: ['thermos', null] });
highBoostState = shift(highBoostState, 'high-boost').state;
highBoostState = api.recordThermosBrew(highBoostState, {
  brewId: 'high-boost:coffee', completed: true, coffeeForColleague: false, paused: false, shiftEnded: false, turka: true,
}).state;
const preservedBoost = api.useThermos(highBoostState, {
  currentBoost: 12, viaPhone: true, paused: false, shiftEnded: false, turka: true,
});
assert.equal(preservedBoost.coffeeBoost, 12, 'термос не укорачивает уже более длинный boost');
assert.equal(api.equipmentMirrorVisible(state, { atDesk: true, distance: 180, lineOfSight: true }), true);
assert.equal(api.equipmentMirrorVisible(state, { atDesk: true, distance: 180.01, lineOfSight: true }), false);
assert.equal(api.equipmentMirrorVisible(state, { atDesk: true, distance: 20, lineOfSight: false }), false);
assert.equal(api.equipmentMirrorVisible(state, { atDesk: false, distance: 20, lineOfSight: true }), false);

const resumed = api.beginEquipmentShift(thermosUse.state, { shiftId: 'shift-1', resume: true });
assert.equal(resumed.ok, true);
assert.equal(resumed.state.usedCharges.thermos, true, 'resume не сбрасывает использованный заряд');
assert.equal(api.equipItem(resumed.state, 'autoclicker', 0, ended).state.activeLoadout.includes('thermos'), true, 'конец смены не меняет активный snapshot');
const nextShift = shift(resumed.state, 'shift-2').state;
assert.equal(nextShift.usedCharges.thermos, false, 'новая смена сбрасывает заряды');
assert.equal(nextShift.thermosBrewed, false);

let clickerState = api.createEquipmentState({ ownedEquipment: ['autoclicker'], loadout: ['autoclicker', null] });
clickerState = shift(clickerState, 'clicker-1').state;
assert.equal(api.activateAutoclicker(clickerState, { atDesk: false, paused: false, shiftEnded: false }).reason, 'not_at_desk');
let activated = api.activateAutoclicker(clickerState, { atDesk: true, paused: false, shiftEnded: false });
assert.equal(activated.ok, true);
clickerState = activated.state;
let tick = api.tickEquipment(clickerState, { dt: 1.9, paused: false });
assert.equal(tick.state.autoclicker.phase, 'installing');
assert.ok(Math.abs(tick.state.autoclicker.installRemaining - 0.1) < 1e-9);
tick = api.tickEquipment(tick.state, { dt: 0.1, paused: false });
assert.equal(tick.state.autoclicker.phase, 'active');
assert.equal(tick.state.autoclicker.activeRemaining, 10);
assert.equal(api.beginAutoclickerInspection(tick.state, { inspectionId: 'desk-1', emptyDesk: false, paused: false, shiftEnded: false }).reason, 'desk_not_empty');
let wait = api.beginAutoclickerInspection(tick.state, { inspectionId: 'desk-1', emptyDesk: true, paused: false, shiftEnded: false });
assert.equal(wait.ok, true);
assert.equal(wait.waitSeconds, 2);
assert.equal(api.beginAutoclickerInspection(wait.state, { inspectionId: 'desk-1', emptyDesk: true, paused: false, shiftEnded: false }).reason, 'inspection_wait_used');
let pending = JSON.parse(JSON.stringify(wait.state));
tick = api.tickEquipment(pending, { dt: 1, paused: true, inspectionId: 'desk-1' });
assert.equal(tick.state.autoclicker.inspectionWait.remaining, 2, 'пауза останавливает ожидание начальника');
tick = api.tickEquipment(tick.state, { dt: 1, paused: false, inspectionId: 'desk-1' });
assert.equal(tick.inspectionOutcome, null);
tick = api.tickEquipment(tick.state, { dt: 1, paused: false, inspectionId: 'desk-1' });
assert.equal(tick.inspectionOutcome, 'missAtDesk');
assert.equal(tick.inspectionId, 'desk-1');
assert.equal(tick.state.autoclicker.phase, 'revealed');
assert.equal(tick.state.autoclicker.activeRemaining, 0, 'раскрытие сжигает остаток заряда');
assert.equal(tick.effects.length, 0, 'модель возвращает исход проверки и сама не вызывает missAtDesk');
const repeatedReveal = api.tickEquipment(tick.state, { dt: 1, paused: false, inspectionId: 'desk-1' });
assert.equal(repeatedReveal.inspectionOutcome, null, 'повторный tick не выдаёт второй промах');
assert.equal(api.activateAutoclicker(tick.state, { atDesk: true, paused: false, shiftEnded: false }).reason, 'autoclicker_used');

let returnState = api.createEquipmentState({ ownedEquipment: ['autoclicker'], loadout: ['autoclicker', null] });
returnState = shift(returnState, 'clicker-2').state;
returnState = api.activateAutoclicker(returnState, { atDesk: true, paused: false, shiftEnded: false }).state;
returnState = api.tickEquipment(returnState, { dt: 2, paused: false }).state;
returnState = api.beginAutoclickerInspection(returnState, { inspectionId: 'desk-return', emptyDesk: true, paused: false, shiftEnded: false }).state;
const returned = api.tickEquipment(returnState, { dt: 0.2, paused: false, inspectionId: 'desk-return', returnedToExcel: true });
assert.equal(returned.inspectionOutcome, 'passed', 'возврат в настоящий Excel проходит обычную проверку');
assert.ok(Math.abs(returned.state.autoclicker.activeRemaining - 9.8) < 1e-9);

let externalState = api.createEquipmentState({ ownedEquipment: ['autoclicker'], loadout: ['autoclicker', null] });
externalState = shift(externalState, 'clicker-camera').state;
externalState = api.activateAutoclicker(externalState, { atDesk: true, paused: false, shiftEnded: false }).state;
externalState = api.tickEquipment(externalState, { dt: 2, paused: false }).state;
externalState = api.beginAutoclickerInspection(externalState, {
  inspectionId: 'desk-camera', emptyDesk: true, paused: false, shiftEnded: false,
}).state;
const alreadyCaught = api.tickEquipment(externalState, {
  dt: 0.5, paused: false, inspectionId: 'desk-camera', inspectionResolved: true,
});
assert.equal(alreadyCaught.inspectionOutcome, 'resolvedElsewhere', 'существующее обнаружение не получает второй промах от модели');
assert.equal(alreadyCaught.effects.length, 0);

let expireState = api.createEquipmentState({ ownedEquipment: ['autoclicker'], loadout: ['autoclicker', null] });
expireState = shift(expireState, 'clicker-3').state;
expireState = api.activateAutoclicker(expireState, { atDesk: true, paused: false, shiftEnded: false }).state;
expireState = api.tickEquipment(expireState, { dt: 2, paused: false }).state;
const expired = api.tickEquipment(expireState, { dt: 11, paused: false, cactusSeconds: 1.5, snusSeconds: 2 });
assert.equal(expired.state.autoclicker.phase, 'expired');
assert.equal(expired.state.autoclicker.activeRemaining, 0, 'cactus/snус не продлевают 10 секунд');
assert.equal(api.beginAutoclickerInspection(expired.state, { inspectionId: 'too-late', emptyDesk: true, paused: false, shiftEnded: false }).reason, 'autoclicker_inactive');

let interrupted = api.createEquipmentState({ ownedEquipment: ['autoclicker'], loadout: ['autoclicker', null] });
interrupted = shift(interrupted, 'clicker-4').state;
interrupted = api.activateAutoclicker(interrupted, { atDesk: true, paused: false, shiftEnded: false }).state;
interrupted = api.tickEquipment(interrupted, { dt: 0.1, paused: false, installationInterrupted: true }).state;
assert.equal(interrupted.autoclicker.phase, 'interrupted');
assert.equal(api.activateAutoclicker(interrupted, { atDesk: true, paused: false, shiftEnded: false }).reason, 'autoclicker_used');

console.log('B3: проверки модели оснащения пройдены.');

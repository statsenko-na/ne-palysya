'use strict';
// Адресная проверка схемы снимка; запускается отдельно от игры через Node.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'save-schema.js'), 'utf8');
const context = vm.createContext({ module: { exports: {} } });
vm.runInContext(`${source}\nmodule.exports = { makeSaveSnapshot, validateSaveSnapshot, migrateSaveV2 };`, context);
const api = context.module.exports;

const sample = () => JSON.parse(JSON.stringify({
  shiftId: 'shift-01', dayIndex: 3, diffKey: 'normal', clockMinutes: 760, usefulness: 3, fun: 14,
  reprimands: 0, weekReprimands: 0, planTarget: 80, majikArc: 0, rngSeed: 123,
  day: { pee: 5, peeActive: true, peeLeft: 2, aljaziraDisasterAt: -1 },
  player: { x: 123, y: 200, action: 'work', actionTimer: 1, path: [{ x: 1, y: 2 }] },
  boss: { x: 12, y: 20, state: 'office', path: [{ x: 2, y: 3 }] },
  coworkers: [{ id: 'aimashyn', x: 12, y: 22, away: false, desk: { x: 1 } }],
  todo: [{ id: 'coffee1', done: false, text: 'не сохранять статическое описание' }],
  stats: { coffees: 1, chatted: ['aimashyn'] },
  officeEvent: { id: 'majik', t: 18, used: false, work: 3, food: { name: 'курт', text: 'текст', color: '#fff' } },
  eventQueue: ['food', 'majik'], nextEvent: 0, nextBossCheck: 14, autoUsed: false,
}));

const original = sample();
const before = JSON.stringify(original);
const made = api.makeSaveSnapshot(original);
assert.strictEqual(made.ok, true, JSON.stringify(made));
assert.strictEqual(JSON.stringify(original), before, 'схема не меняет переданный объект');
assert.deepStrictEqual(JSON.parse(JSON.stringify(made.snapshot.officeEvent)), {
  id: 'majik', t: 18, used: false, food: { name: 'курт', text: 'текст', color: '#fff' }, work: 3,
});
assert.strictEqual('path' in made.snapshot.player, false, 'навигационный путь не сериализуется');
assert.deepStrictEqual(JSON.parse(JSON.stringify(made.snapshot.boss.path)), [{ x: 2, y: 3 }], 'сохраняются только координаты точек пути');
assert.strictEqual('desk' in made.snapshot.coworkers[0], false, 'статическая ссылка на стол не сериализуется');
assert.deepStrictEqual(JSON.parse(JSON.stringify(made.snapshot.extensions)), {}, 'расширения по умолчанию пусты');
const cycle = {}; cycle.self = cycle;
const partialExtension = sample();
partialExtension.extensions = { moments: cycle, relationships: { aimashyn: 2 }, unknownFuture: { kept: true } };
const recoveredExtension = api.makeSaveSnapshot(partialExtension);
assert.strictEqual(recoveredExtension.ok, true, 'ошибка расширения не блокирует общую смену');
assert.deepStrictEqual(JSON.parse(JSON.stringify(recoveredExtension.snapshot.extensions)), { relationships: { aimashyn: 2 } });
assert.strictEqual(recoveredExtension.snapshot.extensionErrors.moments, 'non_json_value', 'ошибка отдельного расширения записана');
assert.strictEqual('unknownFuture' in recoveredExtension.snapshot.extensions, false, 'неизвестное расширение отбрасывается');

const missedMajik = sample();
missedMajik.majikArc = -1;
assert.strictEqual(api.makeSaveSnapshot(missedMajik).ok, true, 'пропущенный Маджикистан законно уменьшает недельную дугу');

const roundTrip = api.validateSaveSnapshot(JSON.parse(JSON.stringify(made.snapshot)));
assert.strictEqual(roundTrip.ok, true, JSON.stringify(roundTrip));

const unknownEvent = sample();
unknownEvent.officeEvent.id = 'not-an-event';
assert.strictEqual(api.makeSaveSnapshot(unknownEvent).reason, 'unknown_event_id');
const badQueueEvent = sample();
badQueueEvent.eventQueue.push('not-an-event');
assert.strictEqual(api.makeSaveSnapshot(badQueueEvent).reason, 'unknown_event_id');
const missingRuntime = sample();
delete missingRuntime.rngSeed; delete missingRuntime.eventQueue; delete missingRuntime.nextEvent; delete missingRuntime.nextBossCheck;
assert.strictEqual(api.makeSaveSnapshot(missingRuntime).ok, false, 'v3 без RNG и расписания не может попасть в интегратор');
missingRuntime.migratedFromV2 = true;
assert.strictEqual(api.makeSaveSnapshot(missingRuntime).ok, false, 'маркер миграции нельзя подделать во v3');

for (const badValue of [-1, NaN]) {
  const invalid = sample();
  invalid.fun = badValue;
  assert.strictEqual(api.makeSaveSnapshot(invalid).ok, false);
}
const invalidTimer = sample();
invalidTimer.nextEvent = -1;
assert.strictEqual(api.makeSaveSnapshot(invalidTimer).snapshot.nextEvent, 0, 'снимок нормализует истёкший таймер');
assert.strictEqual(api.validateSaveSnapshot(invalidTimer).ok, false, 'валидатор отвергает снимок с отрицательным таймером');

const legacy = {
  v: 2, dayIndex: 3, diffKey: 'normal', clockMinutes: 760, usefulness: 22, fun: 18, reprimands: 1,
  weekReprimands: 2, planTarget: 80, majikArc: 1, day: { fed: true, pee: 40, peeActive: true },
  todo: [{ id: 'coffee1', done: true }], stats: { coffees: 1, chatted: ['aimashyn'] },
  officeEvent: { id: 'majik', t: 18, used: false },
};
const migrated = api.migrateSaveV2(legacy);
assert.strictEqual(migrated.ok, true, JSON.stringify(migrated));
assert.strictEqual(migrated.snapshot.migratedFromV2, true);
assert.strictEqual(migrated.snapshot.recoveryGraceUsed, true);
assert.strictEqual(migrated.snapshot.clockMinutes, 760);
assert.strictEqual(migrated.snapshot.usefulness, 22);
assert.strictEqual(migrated.snapshot.officeEvent.id, 'majik');
assert.strictEqual(api.migrateSaveV2({ ...legacy, v: 88 }).reason, 'unsupported_version');

process.stdout.write('qa-plan-01: все проверки пройдены\n');

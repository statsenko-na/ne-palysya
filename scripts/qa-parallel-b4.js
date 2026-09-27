const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'accessibility.js'), 'utf8');
const sandbox = {};
vm.runInNewContext(`${source}\n;globalThis.api = { resolveReducedEffects, getEffectPresentation };`, sandbox);
const { resolveReducedEffects, getEffectPresentation } = sandbox.api;

assert.equal(resolveReducedEffects(null, true), true, 'при отсутствии выбора учитывается системная настройка');
assert.equal(resolveReducedEffects(undefined, false), false);
assert.equal(resolveReducedEffects(true, false), true, 'сохранённое включение выше системного значения');
assert.equal(resolveReducedEffects(false, true), false, 'сохранённое выключение выше системного значения');
assert.equal(resolveReducedEffects('false', true), true, 'небулевое сохранение считается отсутствующим');

const input = { shake: 0.5, flash: 0.9, danger: 0.8 };
const inputBefore = JSON.stringify(input);
const normal = getEffectPresentation(false, input);
assert.equal(normal.ok, true);
assert.equal(normal.shake, 0.5);
assert.equal(normal.flash, 0.9);
assert.equal(normal.dangerLevel, 0.8);
assert.equal(normal.dangerPulse, true);
assert.equal(normal.staticWarning, true);

const reduced = getEffectPresentation(true, input);
assert.equal(reduced.ok, true);
assert.equal(reduced.shake, 0);
assert.equal(reduced.flash, 0);
assert.equal(reduced.dangerLevel, 0.8, 'опасность остаётся различимой');
assert.ok(Math.abs(reduced.dangerAlpha - 0.28) < 1e-9);
assert.equal(reduced.dangerPulse, false, 'красная виньетка остаётся статичной');
assert.equal(reduced.staticWarning, true);
assert.equal(JSON.stringify(input), inputBefore, 'модель не меняет переданные значения');
for (const key of ['suspicion', 'dt', 'npcSpeed', 'noise', 'plan', 'fun']) {
  assert.equal(Object.hasOwn(reduced, key), false, `модель не меняет ${key}`);
}

const noDanger = getEffectPresentation(true, { shake: -1, flash: Infinity, danger: 0 });
assert.equal(noDanger.shake, 0);
assert.equal(noDanger.flash, 0);
assert.equal(noDanger.dangerLevel, 0);
assert.equal(noDanger.staticWarning, false);
assert.equal(noDanger.dangerPulse, false);
const highDanger = getEffectPresentation(true, { shake: NaN, flash: -2, danger: 4 });
assert.equal(highDanger.shake, 0);
assert.equal(highDanger.flash, 0);
assert.equal(highDanger.dangerLevel, 1);
assert.equal(highDanger.staticWarning, true);
assert.equal(getEffectPresentation(true, null).reason, 'invalid_effect_context');
assert.equal(getEffectPresentation('true', input).ok, false);

console.log('B4: проверки модели уменьшения эффектов пройдены.');

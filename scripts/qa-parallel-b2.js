const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'records.js'), 'utf8');
const sandbox = {};
vm.runInNewContext(`${source}\n;globalThis.api = { normalizePlayerName, makeRecord, createLocalRecordsState, addLocalRecord, listLocalRecords };`, sandbox);
const { normalizePlayerName, makeRecord, createLocalRecordsState, addLocalRecord, listLocalRecords } = sandbox.api;

function record(overrides = {}) {
  return {
    runId: 'run-1', name: '  Алия   <b>🙂</b> ', score: 90, dayIndex: 0, difficulty: 'normal',
    rulesetId: 'office-stories-v1', autoUsed: false, maxTimeScale: 1, completedAt: 1000, outcome: 'win',
    ...overrides,
  };
}

assert.equal(normalizePlayerName(' \t\n '), 'Быкентий');
const unicodeName = normalizePlayerName('  А🙂\u0000\tБ  ');
assert.equal(unicodeName, 'А🙂 Б');
assert.equal(Array.from(normalizePlayerName('🙂'.repeat(21))).length, 20, 'ограничение считает Unicode code points');
assert.equal(normalizePlayerName('<b>Ира</b>'), '<b>Ира</b>', 'имя остаётся обычным текстом');

const made = makeRecord(record());
assert.equal(made.ok, true);
assert.equal(made.record.name, 'Алия <b>🙂</b>');
assert.equal(makeRecord(record({ mode: 'demo' })).reason, 'demo_not_recorded');
assert.equal(makeRecord(record({ dayIndex: 5 })).reason, 'invalid_day');
assert.equal(makeRecord(record({ autoUsed: undefined })).reason, 'auto_used_required');
assert.equal(makeRecord(record({ rulesetId: '' })).reason, 'ruleset_required');

let state = createLocalRecordsState({ legacyBest: { 'best.0': 88, 'best.1': 72 } });
let added = addLocalRecord(state, made.record);
assert.equal(added.ok, true);
state = added.state;
const serialized = JSON.parse(JSON.stringify(state));
const duplicate = addLocalRecord(serialized, made.record);
assert.equal(duplicate.ok, false);
assert.equal(duplicate.reason, 'duplicate_run');
assert.equal(duplicate.state.records.length, 1, 'повтор runId не добавляет строку');
let listed = listLocalRecords(state);
assert.equal(listed.ok, true);
assert.equal(listed.records.length, 1);
assert.equal(listed.legacyBest.length, 2);
assert.equal(listed.legacyBest[0].label, 'Старый рекорд, правила 0.24.1');
assert.equal(Object.hasOwn(listed.legacyBest[0], 'name'), false, 'старому рекорду не назначается новое имя');

let ordering = createLocalRecordsState();
for (const item of [
  record({ runId: 'tie-late', score: 100, completedAt: 30 }),
  record({ runId: 'tie-early', score: 100, completedAt: 10 }),
  record({ runId: 'higher', score: 101, completedAt: 50 }),
  record({ runId: 'assisted', score: 200, autoUsed: true }),
  record({ runId: 'hard', score: 180, difficulty: 'hard' }),
  record({ runId: 'other-rules', score: 170, rulesetId: 'rules-v2' }),
  record({ runId: 'fired', score: 999, outcome: 'fired' }),
]) {
  ordering = addLocalRecord(ordering, item).state;
}
listed = listLocalRecords(ordering, { difficulty: 'normal', rulesetId: 'office-stories-v1', autoUsed: false });
assert.deepEqual(JSON.parse(JSON.stringify(listed.records.map(item => item.runId))), ['higher', 'tie-early', 'tie-late', 'fired']);
assert.equal(listLocalRecords(ordering, { autoUsed: true }).records[0].runId, 'assisted');
assert.equal(listLocalRecords(ordering, { difficulty: 'hard' }).records[0].runId, 'hard');
assert.equal(listLocalRecords(ordering, { rulesetId: 'rules-v2' }).records[0].runId, 'other-rules');

let perCategory = createLocalRecordsState();
for (let i = 0; i < 12; i++) {
  perCategory = addLocalRecord(perCategory, record({
    runId: `quota-${i}`, score: i, completedAt: i,
  })).state;
}
assert.equal(perCategory.records.length, 10, 'в одной категории хранится не больше десяти записей');
assert.equal(perCategory.records[0].score, 11, 'в лимит попадают лучшие победные смены');

let globalLimit = createLocalRecordsState();
for (let category = 0; category < 31; category++) {
  for (let i = 0; i < 10; i++) {
    globalLimit = addLocalRecord(globalLimit, record({
      runId: `global-${category}-${i}`, rulesetId: `rules-${category}`, score: category * 10 + i,
      completedAt: category * 100 + i,
    })).state;
  }
}
assert.equal(globalLimit.records.length, 300, 'общий лимит равен трёмстам');

const corrupt = createLocalRecordsState({
  records: [record({ runId: 'survivor' }), { runId: 'broken' }, record({ runId: 'survivor', score: 200 }), record({ runId: 'demo', mode: 'demo' })],
  legacyBest: { 'best.0': 45, 'best.9': 999 },
});
assert.equal(corrupt.records.length, 1, 'повреждённые и повторные строки отбрасываются');
assert.equal(corrupt.legacyBest.length, 1, 'недопустимый старый день отбрасывается');
const repaired = addLocalRecord(corrupt, record({ runId: 'after-repair', difficulty: 'easy' }));
assert.equal(repaired.ok, true);
assert.deepEqual(new Set(JSON.parse(JSON.stringify(repaired.state.records.map(item => item.runId)))), new Set(['survivor', 'after-repair']));
assert.equal(listLocalRecords(null).reason, 'invalid_state');
assert.equal(listLocalRecords(state, { difficulty: 'expert' }).reason, 'invalid_difficulty');

console.log('B2: проверки локальных рекордов пройдены.');

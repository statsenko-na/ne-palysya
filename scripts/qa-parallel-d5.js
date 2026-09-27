'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const context = {};
vm.runInNewContext(fs.readFileSync('js/week-scenarios.js', 'utf8'), context, { filename: 'js/week-scenarios.js' });
const json = value => JSON.parse(JSON.stringify(value));
const baseContext = overrides => Object.assign({
  weekDone: true,
  weekNumber: 2,
  dayIndex: 1,
  unlockedEventIds: ['internet', 'jam', 'autoshka'],
  sergeyAvailable: true,
  replaceableTaskIds: ['event-report']
}, overrides || {});

assert.deepStrictEqual(json(context.selectWeekScenario({ weekDone: false, weekNumber: 0 })), {
  ok: true, scenario: 'normal', active: false, weekNumber: 0, banner: null, reason: 'training_week'
});
assert.strictEqual(context.selectWeekScenario({ weekDone: true, weekNumber: 0 }).reason, 'week_number_invalid');
assert.strictEqual(context.selectWeekScenario({ weekDone: true, weekNumber: 1 }).scenario, 'normal');
assert.strictEqual(context.selectWeekScenario({ weekDone: true, weekNumber: 2 }).scenario, 'reports');
assert.strictEqual(context.selectWeekScenario({ weekDone: true, weekNumber: 3 }).scenario, 'repairs');
assert.strictEqual(context.selectWeekScenario({ weekDone: true, weekNumber: 4 }).scenario, 'normal');
assert.strictEqual(context.selectWeekScenario({ weekDone: true, weekNumber: 2 }).banner, 'Неделя отчётов');
assert.strictEqual(context.selectWeekScenario({ weekDone: true, weekNumber: 3 }).banner, 'Неделя техработ');
assert.strictEqual(context.selectWeekScenario({ weekNumber: 2 }).ok, false);

const taskBase = [
  { id: 'coffee2', text: 'Кофе', goal: 2, done: false, day: true },
  { id: 'event-report', text: 'Старая событийная цель', goal: 1, done: false, day: true },
  { id: 'lunch', text: 'Обед', goal: 1, done: false, day: true }
];
const eventBase = ['internet', 'food'];
const beforeTasks = JSON.stringify(taskBase);
const beforeEvents = JSON.stringify(eventBase);
const reports = context.applyWeekScenario('reports', taskBase, eventBase, baseContext({
  reportTask: { id: 'printReport', text: 'Распечатать отчёт', goal: 1, stat: 'printed' }
}));
assert.strictEqual(reports.ok, true);
assert.strictEqual(reports.replacedTaskId, 'event-report');
assert.strictEqual(reports.tasks.length, taskBase.length);
assert.strictEqual(reports.tasks[0].id, 'coffee2');
assert.strictEqual(reports.tasks[1].id, 'printReport');
assert.strictEqual(reports.tasks[1].done, false);
assert.strictEqual(reports.tasks[1].day, true);
assert.strictEqual(reports.tasks[2].id, 'lunch');
assert.deepStrictEqual(json(reports.requiredEventIds), ['jam']);
assert.deepStrictEqual(json(reports.eventDeadlineMinutes), { jam: 900 });
assert.deepStrictEqual(json(reports.events), eventBase);
assert.strictEqual(JSON.stringify(taskBase), beforeTasks);
assert.strictEqual(JSON.stringify(eventBase), beforeEvents);

const thursdayReports = context.applyWeekScenario('reports', ['hideAudit', 'toilet'], [], baseContext({
  dayIndex: 3,
  replaceableTaskIds: ['hideAudit']
}));
assert.strictEqual(thursdayReports.tasks[0], 'printReport');
assert.deepStrictEqual(json(thursdayReports.requiredEventIds), ['jam']);
const reportNoEvent = context.applyWeekScenario('reports', ['coffee2', 'lunch'], [], baseContext({
  replaceableTaskIds: []
}));
assert.strictEqual(reportNoEvent.ok, false);
assert.strictEqual(reportNoEvent.reason, 'event_task_missing');
const reportLocked = context.applyWeekScenario('reports', ['event-report'], [], baseContext({
  unlockedEventIds: [],
  reportTask: { id: 'printReport' }
}));
assert.strictEqual(reportLocked.ok, false);
assert.strictEqual(reportLocked.reason, 'event_locked');

const training = context.applyWeekScenario('reports', taskBase, eventBase, baseContext({
  weekDone: false,
  weekNumber: 0,
  replaceableTaskIds: []
}));
assert.strictEqual(training.ok, true);
assert.strictEqual(training.reason, 'training_week');
assert.deepStrictEqual(json(training.tasks), taskBase);
assert.deepStrictEqual(json(training.requiredEventIds), []);

const repairsTuesday = context.applyWeekScenario('repairs', ['coffee2', 'lunch'], eventBase, baseContext({
  dayIndex: 1,
  sergeyAvailable: false,
  replaceableTaskIds: []
}));
assert.deepStrictEqual(json(repairsTuesday.requiredEventIds), ['internet']);
assert.strictEqual(repairsTuesday.tasks[0], 'coffee2');
assert.deepStrictEqual(json(repairsTuesday.events), eventBase);

const repairsThursdayWithSergey = context.applyWeekScenario('repairs', ['coffee1', 'lunch'], eventBase, baseContext({
  dayIndex: 3,
  sergeyAvailable: true,
  replaceableTaskIds: []
}));
assert.deepStrictEqual(json(repairsThursdayWithSergey.requiredEventIds), ['autoshka']);
const repairsThursdayWithoutSergey = context.applyWeekScenario('repairs', ['coffee1', 'lunch'], eventBase, baseContext({
  dayIndex: 3,
  sergeyAvailable: false,
  replaceableTaskIds: []
}));
assert.deepStrictEqual(json(repairsThursdayWithoutSergey.requiredEventIds), ['jam']);
const repairsFallback = context.applyWeekScenario('repairs', [], [], baseContext({
  dayIndex: 3,
  sergeyAvailable: true,
  unlockedEventIds: ['internet'],
  replaceableTaskIds: []
}));
assert.deepStrictEqual(json(repairsFallback.requiredEventIds), ['internet']);
const repairsUnavailable = context.applyWeekScenario('repairs', [], [], baseContext({
  dayIndex: 3,
  sergeyAvailable: false,
  unlockedEventIds: [],
  replaceableTaskIds: []
}));
assert.strictEqual(repairsUnavailable.reason, 'event_unavailable');

const untouchedDay = context.applyWeekScenario('repairs', taskBase, eventBase, baseContext({
  dayIndex: 2,
  replaceableTaskIds: []
}));
assert.deepStrictEqual(json(untouchedDay.tasks), taskBase);
assert.deepStrictEqual(json(untouchedDay.requiredEventIds), []);
const mismatch = context.applyWeekScenario(context.selectWeekScenario({ weekDone: true, weekNumber: 2 }), taskBase, eventBase, baseContext({
  weekNumber: 3
}));
assert.strictEqual(mismatch.reason, 'scenario_context_mismatch');
assert.strictEqual(context.applyWeekScenario('unknown', [], [], baseContext()).reason, 'scenario_invalid');

console.log('qa-parallel-d5: checks passed');

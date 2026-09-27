'use strict';
// Темы повторных недель: обычная, «неделя отчётов» (обязательный ксерокс) и «неделя техработ» (обязательная поломка).

const WEEK_SCENARIO_IDS = ['normal', 'reports', 'repairs'];

function createWeekScenarioResult(ok, scenario, active, weekNumber, reason) {
  let banner = null;
  if (scenario === 'reports') banner = 'Неделя отчётов';
  if (scenario === 'repairs') banner = 'Неделя техработ';
  return { ok, scenario, active, weekNumber, banner, reason };
}

function selectWeekScenario(context) {
  if (!context.weekDone) {
    return createWeekScenarioResult(true, 'normal', false, context.weekNumber, 'training_week');
  }
  if (context.weekNumber < 1) {
    return createWeekScenarioResult(false, null, false, context.weekNumber, 'week_number_invalid');
  }
  const index = (context.weekNumber - 1) % WEEK_SCENARIO_IDS.length;
  return createWeekScenarioResult(true, WEEK_SCENARIO_IDS[index], true, context.weekNumber, null);
}

function weekScenarioTaskId(task) {
  if (typeof task === 'string') return task;
  if (task && typeof task === 'object' && typeof task.id === 'string') return task.id;
  return null;
}

function weekScenarioIsHouseholdTask(id) {
  return /^(coffee|smoke|toilet|lunch)/.test(id);
}

function weekScenarioResult(ok, scenario, tasks, events, requiredEventIds, eventDeadlineMinutes, replacedTaskId, reason) {
  return { ok, scenario, tasks, events, requiredEventIds, eventDeadlineMinutes, replacedTaskId, reason };
}

function applyWeekScenario(scenario, baseTasks, baseEvents, context) {
  const scenarioId = scenario && typeof scenario === 'object' ? scenario.scenario : scenario;
  if (!WEEK_SCENARIO_IDS.includes(scenarioId)) {
    return weekScenarioResult(false, scenarioId || null, baseTasks, baseEvents, [], {}, null, 'scenario_invalid');
  }
  if (scenario && typeof scenario === 'object' &&
      (scenario.active !== context.weekDone || scenario.weekNumber !== context.weekNumber)) {
    return weekScenarioResult(false, scenarioId, baseTasks, baseEvents, [], {}, null, 'scenario_context_mismatch');
  }
  if (!context.weekDone) {
    return weekScenarioResult(true, scenarioId, structuredClone(baseTasks), structuredClone(baseEvents), [], {}, null, 'training_week');
  }
  if (context.weekNumber < 1) {
    return weekScenarioResult(false, scenarioId, baseTasks, baseEvents, [], {}, null, 'week_number_invalid');
  }

  const tasks = structuredClone(baseTasks);
  const events = structuredClone(baseEvents);
  const requiredEventIds = [];
  const eventDeadlineMinutes = {};
  let replacedTaskId = null;

  if (scenarioId === 'reports' && (context.dayIndex === 1 || context.dayIndex === 3)) {
    if (!context.unlockedEventIds.includes('jam')) {
      return weekScenarioResult(false, scenarioId, baseTasks, baseEvents, [], {}, null, 'event_locked');
    }
    // Вторник уже содержит эту цель в неизменяемом DAYS; не удваиваем награду за одну печать.
    if (tasks.some(task => weekScenarioTaskId(task) === 'printReport')) {
      requiredEventIds.push('jam');
      eventDeadlineMinutes.jam = 900;
      return weekScenarioResult(true, scenarioId, tasks, events, requiredEventIds, eventDeadlineMinutes, null, null);
    }
    const index = tasks.findIndex(task => {
      const id = weekScenarioTaskId(task);
      return id && context.replaceableTaskIds.includes(id) &&
        id !== 'printReport' && !weekScenarioIsHouseholdTask(id);
    });
    if (index < 0) {
      return weekScenarioResult(false, scenarioId, baseTasks, baseEvents, [], {}, null, 'event_task_missing');
    }
    const original = tasks[index];
    if (typeof original === 'string') {
      tasks[index] = 'printReport';
    } else {
      tasks[index] = Object.assign({}, structuredClone(context.reportTask), { done: false, day: true });
    }
    replacedTaskId = weekScenarioTaskId(original);
    requiredEventIds.push('jam');
    eventDeadlineMinutes.jam = 900;
  }

  if (scenarioId === 'repairs' && (context.dayIndex === 1 || context.dayIndex === 3)) {
    let requiredId = null;
    if (context.dayIndex === 1) {
      if (context.unlockedEventIds.includes('internet')) requiredId = 'internet';
      else if (context.unlockedEventIds.includes('jam')) requiredId = 'jam';
    } else {
      if (context.sergeyAvailable && context.unlockedEventIds.includes('autoshka')) {
        requiredId = 'autoshka';
      } else if (context.sergeyAvailable && context.unlockedEventIds.includes('internet')) {
        requiredId = 'internet';
      } else if (context.unlockedEventIds.includes('jam')) {
        requiredId = 'jam';
      }
    }
    if (!requiredId) {
      return weekScenarioResult(false, scenarioId, baseTasks, baseEvents, [], {}, null, 'event_unavailable');
    }
    requiredEventIds.push(requiredId);
  }

  return weekScenarioResult(true, scenarioId, tasks, events, requiredEventIds, eventDeadlineMinutes, replacedTaskId, null);
}

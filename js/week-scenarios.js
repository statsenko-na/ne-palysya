'use strict';

const WEEK_SCENARIO_IDS = ['normal', 'reports', 'repairs'];

function createWeekScenarioResult(ok, scenario, active, weekNumber, reason) {
  let banner = null;
  if (scenario === 'reports') banner = 'Неделя отчётов';
  if (scenario === 'repairs') banner = 'Неделя техработ';
  return {
    ok: ok,
    scenario: scenario,
    active: active,
    weekNumber: weekNumber,
    banner: banner,
    reason: reason
  };
}

function selectWeekScenario(context) {
  if (!context || typeof context !== 'object' ||
      typeof context.weekDone !== 'boolean' ||
      !Number.isInteger(context.weekNumber) || context.weekNumber < 0) {
    return createWeekScenarioResult(false, null, false, null, 'context_invalid');
  }
  if (!context.weekDone) {
    return createWeekScenarioResult(true, 'normal', false, context.weekNumber, 'training_week');
  }
  if (context.weekNumber < 1) {
    return createWeekScenarioResult(false, null, false, context.weekNumber, 'week_number_invalid');
  }
  const index = (context.weekNumber - 1) % WEEK_SCENARIO_IDS.length;
  return createWeekScenarioResult(true, WEEK_SCENARIO_IDS[index], true, context.weekNumber, null);
}

function cloneWeekScenarioValue(value) {
  if (Array.isArray(value)) return value.map(cloneWeekScenarioValue);
  if (value && typeof value === 'object') {
    const result = {};
    Object.keys(value).forEach(key => { result[key] = cloneWeekScenarioValue(value[key]); });
    return result;
  }
  return value;
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
  return {
    ok: ok,
    scenario: scenario,
    tasks: tasks,
    events: events,
    requiredEventIds: requiredEventIds,
    eventDeadlineMinutes: eventDeadlineMinutes,
    replacedTaskId: replacedTaskId,
    reason: reason
  };
}

function applyWeekScenario(scenario, baseTasks, baseEvents, context) {
  const scenarioId = scenario && typeof scenario === 'object' ? scenario.scenario : scenario;
  if (!WEEK_SCENARIO_IDS.includes(scenarioId)) {
    return weekScenarioResult(false, scenarioId || null, baseTasks, baseEvents, [], {}, null, 'scenario_invalid');
  }
  if (!Array.isArray(baseTasks) || !Array.isArray(baseEvents) ||
      !context || typeof context !== 'object' ||
      typeof context.weekDone !== 'boolean' ||
      !Number.isInteger(context.weekNumber) || context.weekNumber < 0 ||
      !Number.isInteger(context.dayIndex) || context.dayIndex < 0 || context.dayIndex > 4 ||
      !Array.isArray(context.unlockedEventIds) ||
      context.unlockedEventIds.some(id => typeof id !== 'string')) {
    return weekScenarioResult(false, scenarioId, baseTasks, baseEvents, [], {}, null, 'context_invalid');
  }
  if (scenario && typeof scenario === 'object' &&
      (scenario.active !== context.weekDone || scenario.weekNumber !== context.weekNumber)) {
    return weekScenarioResult(false, scenarioId, baseTasks, baseEvents, [], {}, null, 'scenario_context_mismatch');
  }
  if (!context.weekDone) {
    return weekScenarioResult(true, scenarioId, cloneWeekScenarioValue(baseTasks), cloneWeekScenarioValue(baseEvents), [], {}, null, 'training_week');
  }
  if (context.weekNumber < 1) {
    return weekScenarioResult(false, scenarioId, baseTasks, baseEvents, [], {}, null, 'week_number_invalid');
  }

  const tasks = cloneWeekScenarioValue(baseTasks);
  const events = cloneWeekScenarioValue(baseEvents);
  const requiredEventIds = [];
  const eventDeadlineMinutes = {};
  let replacedTaskId = null;

  if (scenarioId === 'reports' && (context.dayIndex === 1 || context.dayIndex === 3)) {
    if (!context.unlockedEventIds.includes('jam')) {
      return weekScenarioResult(false, scenarioId, baseTasks, baseEvents, [], {}, null, 'event_locked');
    }
    if (!Array.isArray(context.replaceableTaskIds) ||
        context.replaceableTaskIds.some(id => typeof id !== 'string')) {
      return weekScenarioResult(false, scenarioId, baseTasks, baseEvents, [], {}, null, 'context_missing');
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
      if (!context.reportTask || typeof context.reportTask !== 'object' || context.reportTask.id !== 'printReport') {
        return weekScenarioResult(false, scenarioId, baseTasks, baseEvents, [], {}, null, 'report_task_missing');
      }
      tasks[index] = Object.assign({}, cloneWeekScenarioValue(context.reportTask), { done: false, day: true });
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
      if (typeof context.sergeyAvailable !== 'boolean') {
        return weekScenarioResult(false, scenarioId, baseTasks, baseEvents, [], {}, null, 'context_missing');
      }
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

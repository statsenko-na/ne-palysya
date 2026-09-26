'use strict';
// «Не пались» — общий короткий выбор для будущих действий.
// Состояние хранит только id/owner/options ids/remaining; определения и обработчики остаются в коде.

const ACTION_CHOICE_HANDLERS = Object.create(null);
let actionChoiceLastCloseReason = null;
let actionChoiceDebugResult = null;
let actionChoiceDebugCalls = 0;
let actionChoiceDebugBlocked = false;
const actionChoiceHandledCodes = new Set();

function registerActionChoiceHandler(id, definition) {
  if (typeof id !== 'string' || !id.trim() || id.length > 96 || ACTION_CHOICE_HANDLERS[id]) return false;
  if (!definition || !Array.isArray(definition.options) || !definition.options.length || definition.options.length > 3 || !definition.handlers) return false;
  const options = Object.create(null);
  for (const raw of definition.options) {
    if (!raw || typeof raw.id !== 'string' || !raw.id.trim() || raw.id.length > 96 || options[raw.id]) return false;
    if (typeof raw.label !== 'string' || !raw.label.trim() || typeof raw.detail !== 'string') return false;
    if (raw.disabledReason !== undefined && typeof raw.disabledReason !== 'string' && typeof raw.disabledReason !== 'function') return false;
    if (typeof definition.handlers[raw.id] !== 'function') return false;
    options[raw.id] = {
      id: raw.id,
      label: raw.label,
      detail: raw.detail,
      disabledReason: raw.disabledReason || '',
    };
  }
  ACTION_CHOICE_HANDLERS[id] = {
    title: typeof definition.title === 'string' ? definition.title : id,
    closeOnMove: definition.closeOnMove !== false,
    options,
    handlers: { ...definition.handlers },
  };
  return true;
}

function actionChoiceOwnerAvailable(owner) {
  if (owner === 'player') return !!player && mode === 'playing';
  if (owner === 'boss') return !!boss && boss.state !== 'gone';
  const person = Array.isArray(coworkers) && coworkers.find(c => c.id === owner);
  return !!person && !person.away && !person.remote;
}

function actionChoiceOwnerLabel(owner) {
  if (owner === 'player') return 'Быкентий';
  if (owner === 'boss') return 'Д.Н.';
  const person = Array.isArray(coworkers) && coworkers.find(c => c.id === owner);
  return person && typeof person.name === 'string' ? person.name : owner;
}

function actionChoiceOptionView(id, optionId, state = actionChoiceState) {
  const definition = ACTION_CHOICE_HANDLERS[id];
  const option = definition && definition.options[optionId];
  if (!option) return null;
  let disabledReason = option.disabledReason;
  if (typeof disabledReason === 'function') {
    try { disabledReason = disabledReason({ ...state, options: state.options.slice() }); }
    catch (_) { disabledReason = 'Сейчас недоступно'; }
  }
  return {
    id: option.id,
    label: option.label,
    detail: option.detail,
    disabledReason: typeof disabledReason === 'string' ? disabledReason : '',
  };
}

function getActionChoiceView() {
  if (!actionChoiceState || mode !== 'playing') return null;
  const definition = ACTION_CHOICE_HANDLERS[actionChoiceState.id];
  if (!definition || !Array.isArray(actionChoiceState.options)) return null;
  const options = actionChoiceState.options.map(id => actionChoiceOptionView(actionChoiceState.id, id)).filter(Boolean);
  if (!options.length) return null;
  return {
    id: actionChoiceState.id,
    title: definition.title,
    owner: actionChoiceState.owner,
    ownerLabel: actionChoiceOwnerLabel(actionChoiceState.owner),
    remaining: actionChoiceState.remaining,
    options,
  };
}

function closeActionChoice(reason = 'closed') {
  if (!actionChoiceState) return false;
  actionChoiceState = null;
  actionChoiceLastCloseReason = reason;
  return true;
}

function openActionChoice(request) {
  if (!request || typeof request.id !== 'string') return false;
  const definition = ACTION_CHOICE_HANDLERS[request.id];
  if (!definition) {
    if (actionChoiceState && actionChoiceState.id === request.id) closeActionChoice('unknown_handler');
    else if (!actionChoiceState) actionChoiceLastCloseReason = 'unknown_handler';
    return false;
  }
  if (mode !== 'playing' || actionChoiceState || (choice && choice.asked && !choice.done)) return false;
  if (typeof request.owner !== 'string' || !actionChoiceOwnerAvailable(request.owner)) {
    actionChoiceLastCloseReason = 'owner_unavailable';
    return false;
  }
  if (!Array.isArray(request.options) || request.options.length < 1 || request.options.length > 3 || new Set(request.options).size !== request.options.length) return false;
  if (request.options.some(optionId => typeof optionId !== 'string' || !definition.options[optionId])) return false;
  if (typeof request.expiresIn !== 'number' || !Number.isFinite(request.expiresIn) || request.expiresIn <= 0) return false;
  actionChoiceState = {
    id: request.id,
    owner: request.owner,
    options: request.options.slice(),
    remaining: request.expiresIn,
  };
  actionChoiceLastCloseReason = null;
  return true;
}

function selectActionChoice(index) {
  if (!actionChoiceState) return false;
  const state = actionChoiceState;
  const definition = ACTION_CHOICE_HANDLERS[state.id];
  if (!definition) { closeActionChoice('unknown_handler'); return false; }
  if (choice && choice.asked && !choice.done) { closeActionChoice('standup_priority'); return false; }
  if (!actionChoiceOwnerAvailable(state.owner)) { closeActionChoice('owner_unavailable'); return false; }
  if (!Number.isInteger(index) || index < 0 || index >= state.options.length) return false;
  const optionId = state.options[index];
  const option = actionChoiceOptionView(state.id, optionId, state);
  const handler = definition.handlers[optionId];
  if (!option || typeof handler !== 'function') { closeActionChoice('unknown_option'); return false; }
  if (option.disabledReason) return false;
  closeActionChoice('selected');
  try { handler({ id: state.id, owner: state.owner, optionId }); }
  catch (_) { actionChoiceLastCloseReason = 'handler_error'; }
  return true;
}

function updateActionChoice(dt) {
  if (!actionChoiceState || mode !== 'playing') return;
  const state = actionChoiceState;
  const definition = ACTION_CHOICE_HANDLERS[state.id];
  if (!definition) { closeActionChoice('unknown_handler'); return; }
  if (choice && choice.asked && !choice.done) { closeActionChoice('standup_priority'); return; }
  if (!actionChoiceOwnerAvailable(state.owner)) { closeActionChoice('owner_unavailable'); return; }
  if (definition.closeOnMove && player.moving) { closeActionChoice('movement'); return; }
  if (!Number.isFinite(dt) || dt <= 0) return;
  state.remaining = Math.max(0, state.remaining - dt);
  if (state.remaining <= 0) closeActionChoice('expired');
}

function actionChoiceIndexFromEvent(event) {
  const code = typeof event.code === 'string' ? event.code : '';
  const match = code.match(/^(?:Digit|Numpad)([1-3])$/);
  return match ? Number(match[1]) - 1 : -1;
}

function handleActionChoiceKeyDown(event, controlKey, moveKeys) {
  const code = event.code || event.key;
  if (actionChoiceHandledCodes.has(code)) { event.preventDefault(); return true; }
  if (!actionChoiceState || mode !== 'playing') return false;
  if (controlKey === 'escape') {
    closeActionChoice('escape');
    actionChoiceHandledCodes.add(code);
    event.preventDefault();
    return true;
  }
  const index = actionChoiceIndexFromEvent(event);
  if (index >= 0) {
    selectActionChoice(index);
    actionChoiceHandledCodes.add(code);
    event.preventDefault();
    return true;
  }
  if (moveKeys.includes(controlKey)) { closeActionChoice('movement'); return false; }
  if (controlKey === 'p') return false;
  event.preventDefault();
  actionChoiceHandledCodes.add(code);
  return true;
}

function releaseActionChoiceKey(event) {
  actionChoiceHandledCodes.delete(event.code || event.key);
}

function openDebugActionChoice(owner = 'boss', expiresIn = 20) {
  actionChoiceDebugResult = null;
  actionChoiceDebugCalls = 0;
  actionChoiceDebugBlocked = false;
  return openActionChoice({ id: 'debug-preview', owner, options: ['debug-one', 'debug-two', 'debug-disabled'], expiresIn });
}

registerActionChoiceHandler('debug-preview', {
  title: 'Проверка интерфейса',
  closeOnMove: true,
  options: [
    { id: 'debug-one', label: 'Тестовый вариант 1', detail: 'Цена: 0 · риск: нет' },
    { id: 'debug-two', label: 'Тестовый вариант 2', detail: 'Цена: 0 · риск: нет', disabledReason: () => actionChoiceDebugBlocked ? 'Тестовое условие изменилось' : '' },
    { id: 'debug-disabled', label: 'Отключённый вариант', detail: 'Цена: 0 · риск: нет', disabledReason: 'Только отладочный пример' },
  ],
  handlers: {
    'debug-one': () => { actionChoiceDebugResult = 'debug-one'; actionChoiceDebugCalls++; },
    'debug-two': () => { actionChoiceDebugResult = 'debug-two'; actionChoiceDebugCalls++; },
    'debug-disabled': () => { actionChoiceDebugResult = 'debug-disabled'; actionChoiceDebugCalls++; },
  },
});

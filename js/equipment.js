const EQUIPMENT_CATALOG = [
  { id: 'thermos', name: 'Термос', cost: 18, description: 'Один запасной boost на 8 секунд после первой полной чашки.' },
  { id: 'mirror', name: 'Зеркало', cost: 18, description: 'Показывает направление на Д.Н. у стола при прямой видимости.' },
  { id: 'autoclicker', name: 'Автокликер', cost: 30, description: 'На 10 секунд оставляет у стола движущийся курсор; не выполняет работу.' },
];
const EQUIPMENT_IDS = EQUIPMENT_CATALOG.map(item => item.id);
const EQUIPMENT_AUTOCLICKER_PHASES = ['idle', 'installing', 'active', 'expired', 'interrupted', 'revealed'];
const EQUIPMENT_TIME_EPSILON = 1e-9;

function equipmentFinite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function equipmentUniqueIds(values) {
  if (!Array.isArray(values)) return [];
  const result = [];
  for (const id of values) {
    if (EQUIPMENT_IDS.includes(id) && !result.includes(id)) result.push(id);
  }
  return result;
}

function equipmentAutoclickerDefaults() {
  return {
    phase: 'idle',
    installRemaining: 0,
    activeRemaining: 0,
    placementUsed: false,
    waitUsed: false,
    inspectionWait: null,
    seenInspectionIds: [],
  };
}

function createEquipmentState(input) {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const ownedEquipment = equipmentUniqueIds(raw.ownedEquipment);
  const loadout = [null, null];
  for (let slot = 0; slot < 2; slot++) {
    const id = Array.isArray(raw.loadout) ? raw.loadout[slot] : null;
    if (ownedEquipment.includes(id) && !loadout.includes(id)) loadout[slot] = id;
  }
  const activeLoadout = Array.isArray(raw.activeLoadout)
    ? equipmentUniqueIds(raw.activeLoadout).filter(id => ownedEquipment.includes(id)).slice(0, 2)
    : null;
  const rawClicker = raw.autoclicker && typeof raw.autoclicker === 'object' ? raw.autoclicker : {};
  const autoclicker = equipmentAutoclickerDefaults();
  if (EQUIPMENT_AUTOCLICKER_PHASES.includes(rawClicker.phase)) autoclicker.phase = rawClicker.phase;
  if (equipmentFinite(rawClicker.installRemaining) && rawClicker.installRemaining >= 0) autoclicker.installRemaining = Math.min(2, rawClicker.installRemaining);
  if (equipmentFinite(rawClicker.activeRemaining) && rawClicker.activeRemaining >= 0) autoclicker.activeRemaining = Math.min(10, rawClicker.activeRemaining);
  autoclicker.placementUsed = rawClicker.placementUsed === true;
  autoclicker.waitUsed = rawClicker.waitUsed === true;
  autoclicker.seenInspectionIds = Array.isArray(rawClicker.seenInspectionIds)
    ? Array.from(new Set(rawClicker.seenInspectionIds.filter(id => typeof id === 'string' && id))).slice(0, 1)
    : [];
  const wait = rawClicker.inspectionWait;
  if (wait && typeof wait === 'object' && typeof wait.inspectionId === 'string' && wait.inspectionId &&
      equipmentFinite(wait.remaining) && wait.remaining >= 0) {
    autoclicker.inspectionWait = { inspectionId: wait.inspectionId, remaining: Math.min(2, wait.remaining) };
    autoclicker.waitUsed = true;
  }
  const used = raw.usedCharges && typeof raw.usedCharges === 'object' ? raw.usedCharges : {};
  return {
    version: 1,
    ownedEquipment,
    loadout,
    activeLoadout,
    shiftId: typeof raw.shiftId === 'string' && raw.shiftId ? raw.shiftId : null,
    usedCharges: { thermos: used.thermos === true, autoclicker: used.autoclicker === true },
    thermosCharge: raw.thermosCharge === true,
    thermosBrewed: raw.thermosBrewed === true,
    thermosBrewSourceId: typeof raw.thermosBrewSourceId === 'string' && raw.thermosBrewSourceId ? raw.thermosBrewSourceId : null,
    autoclicker,
  };
}

function equipmentFailure(state, reason, extra = {}) {
  return { ok: false, state, effects: [], reason, ...extra };
}

function equipmentSuccess(state, extra = {}) {
  return { ok: true, state, effects: [], reason: null, ...extra };
}

function equipmentCanEdit(context) {
  return !!context && (context.phase === 'menu' || context.phase === 'ended') && context.paused !== true;
}

function validateLoadout(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return { ok: false, valid: false, errors: ['invalid_state'], reason: 'invalid_state' };
  }
  if (!Array.isArray(state.ownedEquipment) || !Array.isArray(state.loadout)) {
    return { ok: false, valid: false, errors: ['invalid_state'], reason: 'invalid_state' };
  }
  const owned = Array.isArray(state.ownedEquipment) ? state.ownedEquipment : [];
  const loadout = Array.isArray(state.loadout) ? state.loadout : [];
  const errors = [];
  if (owned.some(id => !EQUIPMENT_IDS.includes(id)) || new Set(owned).size !== owned.length) errors.push('invalid_owned_equipment');
  if (loadout.length > 2) errors.push('too_many_slots');
  const equipped = loadout.filter(id => id != null);
  if (new Set(equipped).size !== equipped.length) errors.push('duplicate_slot_item');
  if (equipped.some(id => !EQUIPMENT_IDS.includes(id) || !owned.includes(id))) errors.push('equipment_not_owned');
  return { ok: errors.length === 0, valid: errors.length === 0, errors, reason: errors[0] || null };
}

function purchaseEquipment(state, id, coins, context) {
  if (!equipmentFinite(coins) || coins < 0) return equipmentFailure(state, 'invalid_coins', { coins: null });
  if (!state || typeof state !== 'object' || Array.isArray(state)) return equipmentFailure(state, 'invalid_state', { coins });
  const item = EQUIPMENT_CATALOG.find(entry => entry.id === id);
  if (!item) return equipmentFailure(state, 'unknown_equipment', { coins });
  if (!equipmentCanEdit(context)) return equipmentFailure(state, 'equipment_locked', { coins });
  const current = createEquipmentState(state);
  if (current.ownedEquipment.includes(id)) return equipmentFailure(state, 'already_owned', { coins });
  if (coins < item.cost) return equipmentFailure(state, 'insufficient_coins', { coins });
  const next = createEquipmentState(current);
  next.ownedEquipment.push(id);
  return equipmentSuccess(next, { coins: coins - item.cost, purchasedId: id });
}

function equipItem(state, id, slot, context) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return equipmentFailure(state, 'invalid_state');
  if (!EQUIPMENT_IDS.includes(id)) return equipmentFailure(state, 'unknown_equipment');
  if (!equipmentCanEdit(context)) return equipmentFailure(state, 'equipment_locked');
  if (!Number.isInteger(slot) || slot < 0 || slot > 1) return equipmentFailure(state, 'invalid_slot');
  const current = createEquipmentState(state);
  if (!current.ownedEquipment.includes(id)) return equipmentFailure(state, 'not_owned');
  const otherSlot = slot === 0 ? 1 : 0;
  if (current.loadout[otherSlot] === id) return equipmentFailure(state, 'duplicate_loadout_item');
  const next = createEquipmentState(current);
  next.loadout[slot] = id;
  const validation = validateLoadout(next);
  if (!validation.valid) return equipmentFailure(state, validation.reason);
  return equipmentSuccess(next, { slot });
}

function beginEquipmentShift(state, context) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return equipmentFailure(state, 'invalid_state');
  if (!context || typeof context.shiftId !== 'string' || !context.shiftId.trim()) return equipmentFailure(state, 'shift_id_required');
  const current = createEquipmentState(state);
  const shiftId = context.shiftId.trim();
  if (context.resume === true) {
    if (current.shiftId !== shiftId || !Array.isArray(current.activeLoadout)) return equipmentFailure(state, 'resume_shift_mismatch');
    return equipmentSuccess(current, { resumed: true });
  }
  if (context.newShift !== true) return equipmentFailure(state, 'shift_kind_required');
  if (current.shiftId === shiftId) {
    if (!Array.isArray(current.activeLoadout)) return equipmentFailure(state, 'shift_snapshot_missing');
    return equipmentSuccess(current, { resumed: true });
  }
  const validation = validateLoadout(current);
  if (!validation.valid) return equipmentFailure(state, validation.reason);
  const next = createEquipmentState(current);
  next.shiftId = shiftId;
  next.activeLoadout = next.loadout.filter(Boolean);
  next.usedCharges = { thermos: false, autoclicker: false };
  next.thermosCharge = false;
  next.thermosBrewed = false;
  next.thermosBrewSourceId = null;
  next.autoclicker = equipmentAutoclickerDefaults();
  return equipmentSuccess(next, { resumed: false });
}

function recordThermosBrew(state, context) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return equipmentFailure(state, 'invalid_state');
  if (!context || typeof context !== 'object') return equipmentFailure(state, 'brew_context_required');
  if (typeof context.paused !== 'boolean' || typeof context.shiftEnded !== 'boolean' || typeof context.completed !== 'boolean' ||
      typeof context.coffeeForColleague !== 'boolean') return equipmentFailure(state, 'brew_context_incomplete');
  if (context.paused === true) return equipmentFailure(state, 'paused');
  if (context.shiftEnded === true) return equipmentFailure(state, 'shift_ended');
  if (context.completed !== true) return equipmentFailure(state, 'brew_not_complete');
  if (context.coffeeForColleague === true) return equipmentFailure(state, 'shared_coffee');
  if (typeof context.brewId !== 'string' || !context.brewId.trim()) return equipmentFailure(state, 'brew_id_required');
  const current = createEquipmentState(state);
  if (!Array.isArray(current.activeLoadout) || !current.activeLoadout.includes('thermos')) return equipmentFailure(state, 'thermos_not_equipped');
  if (current.thermosBrewed) return equipmentFailure(state, current.thermosBrewSourceId === context.brewId ? 'duplicate_brew' : 'thermos_already_filled');
  const next = createEquipmentState(current);
  next.thermosBrewed = true;
  next.thermosBrewSourceId = context.brewId;
  next.thermosCharge = true;
  return equipmentSuccess(next, { chargeStored: true });
}

function useThermos(state, context) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return equipmentFailure(state, 'invalid_state');
  if (!context || typeof context !== 'object' || !equipmentFinite(context.currentBoost) || context.currentBoost < 0 ||
      typeof context.paused !== 'boolean' || typeof context.shiftEnded !== 'boolean' || typeof context.viaPhone !== 'boolean') {
    return equipmentFailure(state, 'invalid_thermos_context');
  }
  if (!context.viaPhone) return equipmentFailure(state, 'phone_required');
  if (context.paused === true) return equipmentFailure(state, 'paused');
  if (context.shiftEnded === true) return equipmentFailure(state, 'shift_ended');
  const current = createEquipmentState(state);
  if (!Array.isArray(current.activeLoadout) || !current.activeLoadout.includes('thermos')) return equipmentFailure(state, 'thermos_not_equipped');
  if (!current.thermosCharge || current.usedCharges.thermos) return equipmentFailure(state, 'thermos_charge_unavailable');
  const next = createEquipmentState(current);
  next.thermosCharge = false;
  next.usedCharges.thermos = true;
  return equipmentSuccess(next, { coffeeBoost: Math.max(context.currentBoost, 8) });
}

function equipmentMirrorVisible(state, context) {
  if (!state || typeof state !== 'object' || Array.isArray(state) || !context || typeof context !== 'object') return false;
  if (context.atDesk !== true || context.lineOfSight !== true || !equipmentFinite(context.distance) || context.distance < 0 || context.distance > 180) return false;
  const current = createEquipmentState(state);
  return Array.isArray(current.activeLoadout) && current.activeLoadout.includes('mirror');
}

function activateAutoclicker(state, context) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return equipmentFailure(state, 'invalid_state');
  if (!context || typeof context.paused !== 'boolean' || typeof context.shiftEnded !== 'boolean') {
    return equipmentFailure(state, 'invalid_activation_context');
  }
  if (context.atDesk !== true) return equipmentFailure(state, 'not_at_desk');
  if (context.paused === true) return equipmentFailure(state, 'paused');
  if (context.shiftEnded === true) return equipmentFailure(state, 'shift_ended');
  const current = createEquipmentState(state);
  if (!Array.isArray(current.activeLoadout) || !current.activeLoadout.includes('autoclicker')) return equipmentFailure(state, 'autoclicker_not_equipped');
  if (current.usedCharges.autoclicker || current.autoclicker.placementUsed) return equipmentFailure(state, 'autoclicker_used');
  if (current.autoclicker.phase !== 'idle') return equipmentFailure(state, 'autoclicker_unavailable');
  const next = createEquipmentState(current);
  next.usedCharges.autoclicker = true;
  next.autoclicker.placementUsed = true;
  next.autoclicker.phase = 'installing';
  next.autoclicker.installRemaining = 2;
  next.autoclicker.activeRemaining = 0;
  return equipmentSuccess(next);
}

function beginAutoclickerInspection(state, context) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return equipmentFailure(state, 'invalid_state', { waitSeconds: 0 });
  if (!context || typeof context.inspectionId !== 'string' || !context.inspectionId.trim() ||
      typeof context.paused !== 'boolean' || typeof context.shiftEnded !== 'boolean') {
    return equipmentFailure(state, 'inspection_context_incomplete', { waitSeconds: 0 });
  }
  if (context.emptyDesk !== true) return equipmentFailure(state, 'desk_not_empty', { waitSeconds: 0 });
  if (context.paused === true) return equipmentFailure(state, 'paused', { waitSeconds: 0 });
  if (context.shiftEnded === true) return equipmentFailure(state, 'shift_ended', { waitSeconds: 0 });
  const inspectionId = context.inspectionId.trim();
  const current = createEquipmentState(state);
  if (current.autoclicker.waitUsed || current.autoclicker.seenInspectionIds.includes(inspectionId)) {
    return equipmentFailure(state, 'inspection_wait_used', { waitSeconds: 0 });
  }
  if (current.autoclicker.phase !== 'active' || current.autoclicker.activeRemaining <= 0) {
    return equipmentFailure(state, 'autoclicker_inactive', { waitSeconds: 0 });
  }
  const next = createEquipmentState(current);
  next.autoclicker.waitUsed = true;
  next.autoclicker.seenInspectionIds.push(inspectionId);
  next.autoclicker.inspectionWait = { inspectionId, remaining: 2 };
  return equipmentSuccess(next, { waitSeconds: 2, inspectionId });
}

function tickEquipment(state, context) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return equipmentFailure(state, 'invalid_state', { inspectionOutcome: null });
  if (!context || !equipmentFinite(context.dt) || context.dt < 0 || typeof context.paused !== 'boolean') {
    return equipmentFailure(state, 'invalid_tick_context', { inspectionOutcome: null });
  }
  if (context.shiftEnded === true) return equipmentFailure(state, 'shift_ended', { inspectionOutcome: null });
  const next = createEquipmentState(state);
  if (context.paused) return equipmentSuccess(next, { inspectionOutcome: null, inspectionId: null });

  let remaining = context.dt;
  if (context.installationInterrupted === true && next.autoclicker.phase === 'installing') {
    next.autoclicker.phase = 'interrupted';
    next.autoclicker.installRemaining = 0;
  } else if (next.autoclicker.phase === 'installing') {
    const used = Math.min(remaining, next.autoclicker.installRemaining);
    next.autoclicker.installRemaining = Math.max(0, next.autoclicker.installRemaining - used);
    if (next.autoclicker.installRemaining < EQUIPMENT_TIME_EPSILON) next.autoclicker.installRemaining = 0;
    remaining = Math.max(0, remaining - used);
    if (next.autoclicker.installRemaining === 0) {
      next.autoclicker.phase = 'active';
      next.autoclicker.activeRemaining = 10;
    }
  }
  if (next.autoclicker.phase === 'active' && remaining > 0) {
    next.autoclicker.activeRemaining = Math.max(0, next.autoclicker.activeRemaining - remaining);
    if (next.autoclicker.activeRemaining < EQUIPMENT_TIME_EPSILON) next.autoclicker.activeRemaining = 0;
    if (next.autoclicker.activeRemaining === 0) next.autoclicker.phase = 'expired';
  }

  let inspectionOutcome = null;
  let inspectionId = null;
  const wait = next.autoclicker.inspectionWait;
  if (wait && context.inspectionId === wait.inspectionId) {
    inspectionId = wait.inspectionId;
    if (context.inspectionResolved === true) {
      inspectionOutcome = 'resolvedElsewhere';
      next.autoclicker.inspectionWait = null;
    } else if (context.returnedToExcel === true) {
      inspectionOutcome = 'passed';
      next.autoclicker.inspectionWait = null;
    } else {
      wait.remaining = Math.max(0, wait.remaining - context.dt);
      if (wait.remaining < EQUIPMENT_TIME_EPSILON) wait.remaining = 0;
      if (wait.remaining === 0) {
        inspectionOutcome = 'missAtDesk';
        next.autoclicker.inspectionWait = null;
        next.autoclicker.phase = 'revealed';
        next.autoclicker.installRemaining = 0;
        next.autoclicker.activeRemaining = 0;
      }
    }
  }
  return equipmentSuccess(next, { inspectionOutcome, inspectionId });
}

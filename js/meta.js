'use strict';
// «Не пались» — магазин апгрейдов, онбординг «Как играть», задачи дня.
// Общие переменные и функции объявлены на верхнем уровне и видны из других скриптов игры (без обёртки и модулей).
// Порядок подключения — в index.html.

  // ---------- МАГАЗИН АПГРЕЙДОВ ----------
  let shopOpen = false;
  const EQUIPMENT_SHOP_AVAILABLE_IDS = new Set();
  EQUIPMENT_SHOP_AVAILABLE_IDS.add('thermos');
  EQUIPMENT_SHOP_AVAILABLE_IDS.add('mirror');
  EQUIPMENT_SHOP_AVAILABLE_IDS.add('autoclicker');
  const EQUIPMENT_SHOP_ICONS = { thermos: '🫖', mirror: '🪞', autoclicker: '🖱️' };
  const EQUIPMENT_SHOP_DESCRIPTIONS = {
    autoclicker: 'Установка занимает 2 с; до 10 игровых секунд курсора. Один раз за смену оттянет одну проверку пустого стола на 2 с, затем Д.Н. поймёт подмену. Если не вернуться в Excel до конца обычного ожидания — будет промах. Курсор не выполняет работу и не добавляет план или заявки.',
  };
  let equipmentMenuState = createEquipmentState(store.get('equipmentLoadout', null));
  function equipmentHas(id) {
    const state = saveExtensions.equipment;
    return !!state && Array.isArray(state.activeLoadout) && state.activeLoadout.includes(id);
  }
  function equipmentEditContext() {
    return { phase: mode, paused: mode === 'paused' };
  }
  function persistEquipmentLoadout(state) {
    equipmentMenuState = createEquipmentState({ ownedEquipment: state.ownedEquipment, loadout: state.loadout });
    store.set('equipmentLoadout', { ownedEquipment: equipmentMenuState.ownedEquipment, loadout: equipmentMenuState.loadout });
    return equipmentMenuState;
  }
  function equipmentSlotName(id) {
    const item = EQUIPMENT_CATALOG.find(entry => entry.id === id);
    return item ? item.name : 'Пусто';
  }
  function renderEquipmentShop() {
    if (!ui.equipmentSlots || !ui.equipmentList) return;
    equipmentMenuState = createEquipmentState(equipmentMenuState);
    ui.equipmentSlots.innerHTML = equipmentMenuState.loadout.map((id, slot) =>
      `<div class="equipment-slot"><b>СЛОТ ${slot + 1}</b><span>${equipmentSlotName(id)}</span><button data-clear-equipment-slot="${slot}" ${id === null ? 'disabled' : ''}>Снять</button></div>`
    ).join('');
    const items = EQUIPMENT_CATALOG.filter(item => EQUIPMENT_SHOP_AVAILABLE_IDS.has(item.id));
    ui.equipmentList.innerHTML = items.length ? items.map(item => {
      const ownedNow = equipmentMenuState.ownedEquipment.includes(item.id);
      const equippedSlot = equipmentMenuState.loadout.indexOf(item.id);
      const controls = ownedNow
        ? `<div class="equipment-actions">${[0, 1].map(slot => {
          const duplicate = equipmentMenuState.loadout[1 - slot] === item.id;
          const installed = equippedSlot === slot;
          return `<button data-equip-equipment="${item.id}" data-equipment-slot="${slot}" ${duplicate || installed ? 'disabled' : ''}>${installed ? `Слот ${slot + 1} ✓` : `В слот ${slot + 1}`}</button>`;
        }).join('')}</div>`
        : `<button class="equipment-buy" data-buy-equipment="${item.id}" ${coins < item.cost ? 'disabled' : ''}>Купить · ${item.cost} ₭</button>`;
      const description = EQUIPMENT_SHOP_DESCRIPTIONS[item.id] || item.description;
      return `<div class="equipment-item${ownedNow ? ' owned' : ''}"><span class="ico">${EQUIPMENT_SHOP_ICONS[item.id] || '🎒'}</span><span class="txt"><b>${item.name}</b><small>${description}</small></span>${controls}</div>`;
    }).join('') : '<p class="equipment-empty">Пока нет доступных приспособлений.</p>';
    ui.equipmentSlots.querySelectorAll('[data-clear-equipment-slot]').forEach(button => {
      addTap(button, () => clearEquipmentSlot(Number(button.dataset.clearEquipmentSlot)));
    });
    ui.equipmentList.querySelectorAll('[data-buy-equipment]').forEach(button => {
      addTap(button, () => buyEquipmentItem(button.dataset.buyEquipment));
    });
    ui.equipmentList.querySelectorAll('[data-equip-equipment]').forEach(button => {
      addTap(button, () => equipOwnedEquipment(button.dataset.equipEquipment, Number(button.dataset.equipmentSlot)));
    });
  }
  function buyEquipmentItem(id) {
    if (!EQUIPMENT_SHOP_AVAILABLE_IDS.has(id)) return { ok: false, state: equipmentMenuState, coins, reason: 'equipment_unavailable' };
    const result = purchaseEquipment(equipmentMenuState, id, coins, equipmentEditContext());
    if (!result.ok) {
      if (result.reason === 'insufficient_coins') toast('Не хватает KPI-коинов на этот предмет.', 1.8);
      return result;
    }
    coins = result.coins;
    store.set('coins', coins);
    persistEquipmentLoadout(result.state);
    playSound('coin');
    renderShop();
    return result;
  }
  function equipOwnedEquipment(id, slot) {
    if (!EQUIPMENT_SHOP_AVAILABLE_IDS.has(id)) return { ok: false, state: equipmentMenuState, reason: 'equipment_unavailable' };
    const result = equipItem(equipmentMenuState, id, slot, equipmentEditContext());
    if (!result.ok) return result;
    persistEquipmentLoadout(result.state);
    renderShop();
    return result;
  }
  function clearEquipmentSlot(slot) {
    if (!['menu', 'ended'].includes(mode) || !Number.isInteger(slot) || slot < 0 || slot > 1) return false;
    const loadout = equipmentMenuState.loadout.slice();
    loadout[slot] = null;
    const next = createEquipmentState({ ownedEquipment: equipmentMenuState.ownedEquipment, loadout });
    if (!validateLoadout(next).valid) return false;
    persistEquipmentLoadout(next);
    renderShop();
    return true;
  }
  function beginEquipmentForShift(loadResult) {
    if (typeof beginEquipmentShift !== 'function') return false;
    const saved = saveExtensions.equipment;
    let result = loadResult.status === 'resumed' && saved
      ? beginEquipmentShift(saved, { shiftId, resume: true })
      : { ok: false, reason: 'new_shift' };
    if (!result.ok) result = beginEquipmentShift(equipmentMenuState, { shiftId, newShift: true });
    if (!result.ok) {
      saveExtensionErrors.equipment = result.reason || 'equipment_state_invalid';
      saveExtensions.equipment = createEquipmentState();
      return false;
    }
    saveExtensions.equipment = result.state;
    delete saveExtensionErrors.equipment;
    persistEquipmentLoadout(result.state);
    return true;
  }
  function renderShop() {
    if (!ui.shopList) return;
    ui.shopCoins.textContent = `${coins} ₭`;
    ui.shopList.innerHTML = UPGRADES.map(u => {
      const own = has(u.id);
      const can = !own && coins >= u.cost;
      return `<div class="shop-item${own ? ' owned' : ''}"><span class="ico">${u.icon}</span><span class="txt"><b>${u.name}</b><small>${u.desc}</small></span>` +
        `<button data-buy="${u.id}" ${own || !can ? 'disabled' : ''}>${own ? 'ЕСТЬ ✓' : `${u.cost} ₭`}</button></div>`;
    }).join('');
    ui.shopList.querySelectorAll('[data-buy]').forEach(b => addTap(b, () => buyUpgrade(b.dataset.buy)));
    renderEquipmentShop();
    const achEl = $('ach-list');
    if (achEl) {
      $('ach-count').textContent = `${achCount()}/${ACHIEVEMENTS.length}`;
      achEl.innerHTML = ACHIEVEMENTS.map(a => `<div class="ach${achieved[a.id] ? ' got' : ''}" title="${a.desc}"><span>${achieved[a.id] ? a.icon : '🔒'}</span><b>${a.name}</b><small>${a.desc}</small></div>`).join('');
    }
  }
  function buyUpgrade(id) {
    const u = UPGRADES.find(x => x.id === id);
    if (!u || has(id) || coins < u.cost) return false;
    coins -= u.cost;
    owned = { ...owned, [id]: true };
    store.set('coins', coins); store.set('upgrades', owned);
    playSound('coin');
    checkAchievements();
    renderShop();
    return true;
  }
  function openShop() {
    if (mode !== 'menu' && mode !== 'ended') return;
    shopOpen = true;
    playSound('click');
    renderShop();
    ui.shop.classList.remove('hidden');
  }
  function closeShop() {
    shopOpen = false;
    ui.shop.classList.add('hidden');
  }

  // Ползунок скорости времени (меню и пауза)
  const REDUCED_EFFECTS_KEY = 'reducedEffects';
  const reducedEffectsMedia = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;
  let reducedEffects = resolveReducedEffects(
    store.get(REDUCED_EFFECTS_KEY, null),
    !!(reducedEffectsMedia && reducedEffectsMedia.matches),
  );
  function syncReducedEffectsButtons() {
    document.querySelectorAll('.reduced-effects-toggle').forEach(button => {
      button.textContent = `Меньше вспышек и тряски: ${reducedEffects ? 'вкл' : 'выкл'}`;
      button.setAttribute('aria-pressed', String(reducedEffects));
      button.classList.toggle('off', !reducedEffects);
    });
  }
  function toggleReducedEffects() {
    reducedEffects = !reducedEffects;
    store.set(REDUCED_EFFECTS_KEY, reducedEffects);
    syncReducedEffectsButtons();
  }
  function syncReducedEffectsFromMedia() {
    const saved = store.get(REDUCED_EFFECTS_KEY, null);
    if (saved === true || saved === false) return;
    reducedEffects = resolveReducedEffects(saved, !!(reducedEffectsMedia && reducedEffectsMedia.matches));
    syncReducedEffectsButtons();
  }
  if (reducedEffectsMedia) {
    if (typeof reducedEffectsMedia.addEventListener === 'function') {
      reducedEffectsMedia.addEventListener('change', syncReducedEffectsFromMedia);
    } else if (typeof reducedEffectsMedia.addListener === 'function') {
      reducedEffectsMedia.addListener(syncReducedEffectsFromMedia);
    }
  }

  function syncAudioButtons() {
    document.querySelectorAll('.music-toggle').forEach(b => { b.textContent = musicOn ? '🎵 Музыка: вкл (N)' : '🔇 Музыка: выкл (N)'; b.classList.toggle('off', !musicOn); });
    document.querySelectorAll('.sound-toggle').forEach(b => { b.textContent = muted ? '🔇 Звуки: выкл (M)' : '🔊 Звуки: вкл (M)'; b.classList.toggle('off', muted); });
    if (coarsePointer) document.querySelectorAll('.music-toggle, .sound-toggle').forEach(b => { b.textContent = b.textContent.replace(/ \([NM]\)$/, ''); });
    document.querySelectorAll('.vol-sfx').forEach(r => { r.value = String(sfxVol); });
    document.querySelectorAll('.vol-music').forEach(r => { r.value = String(musicVol); });
    document.querySelectorAll('.text-toggle').forEach(b => { b.textContent = bigText ? '🔠 Текст: крупный' : '🔠 Текст: обычный'; });
    syncReducedEffectsButtons();
  }
  function toggleMusic() {
    musicOn = !musicOn;
    store.set('music', musicOn);
    toast(musicOn ? '🎵 Музыка включена (N)' : '🔇 Музыка выключена (N). Звуки остаются.', 1.6);
    syncAudioButtons();
  }
  function setDifficulty(k) {
    if (!DIFFICULTY[k]) return;
    diffKey = k;
    store.set('difficulty', k);
    document.querySelectorAll('[data-diff]').forEach(b => b.classList.toggle('on', b.dataset.diff === k));
  }
  function setTimeScale(v) {
    timeScale = clamp(Number(v) || 1, 0.5, 3);
    store.set('timeScale', timeScale);
    updateShiftRecordTimeScale(timeScale);
    document.querySelectorAll('.speed-range').forEach(r => { r.value = String(timeScale); });
    document.querySelectorAll('.speed-val').forEach(el => { el.textContent = `×${+timeScale.toFixed(2)}`; });
  }
  const LOCAL_RECORDS_KEY = 'localRecords';
  const ACTIVE_RECORD_IDENTITY_KEY = 'activeRecordIdentity';
  let shiftRecordIdentity = null;
  let localRecordsCache = null;
  let recordsDialogOpen = false;
  let recordsReturnFocus = null;
  function cleanPlayerNameInput(value) {
    return Array.from(String(value == null ? '' : value).replace(/\p{Cc}/gu, ' ').replace(/\s+/gu, ' ').trim()).slice(0, 20).join('');
  }
  function renderPlayerNameCount(value) {
    const countText = `${Array.from(value || '').length} / 20`;
    document.querySelectorAll('.player-name-input').forEach(field => {
      const count = $(field.dataset.countTarget);
      if (count) count.textContent = countText;
    });
  }
  function updatePlayerNameField(input) {
    if (!input) return '';
    if (auto.demo) {
      const saved = store.get('playerName', '');
      document.querySelectorAll('.player-name-input').forEach(field => { field.value = saved; });
      renderPlayerNameCount(input.value);
      return input.value;
    }
    const oldValue = input.value;
    const oldCaret = typeof input.selectionStart === 'number' ? input.selectionStart : oldValue.length;
    const charsBeforeCaret = Array.from(oldValue.slice(0, oldCaret)).length;
    const value = cleanPlayerNameInput(oldValue);
    if (value !== oldValue) {
      input.value = value;
      const caret = Array.from(value).slice(0, charsBeforeCaret).join('').length;
      try { input.setSelectionRange(caret, caret); } catch (_) {}
    }
    store.set('playerName', value);
    document.querySelectorAll('.player-name-input').forEach(field => { if (field !== input) field.value = value; });
    renderPlayerNameCount(value);
    return value;
  }
  function initializePlayerNameInput() {
    const saved = typeof store.get('playerName', '') === 'string' ? store.get('playerName', '') : '';
    document.querySelectorAll('.player-name-input').forEach(input => {
      input.value = cleanPlayerNameInput(saved);
      input.addEventListener('input', () => updatePlayerNameField(input));
      input.addEventListener('change', () => updatePlayerNameField(input));
    });
    renderPlayerNameCount(cleanPlayerNameInput(saved));
  }
  function validActiveRecordIdentity(identity) {
    return !!identity && typeof identity === 'object' && !Array.isArray(identity)
      && identity.runId === shiftId
      && typeof identity.name === 'string'
      && Number.isInteger(identity.dayIndex) && identity.dayIndex >= 0 && identity.dayIndex < DAYS.length
      && !!DIFFICULTY[identity.difficulty]
      && typeof identity.rulesetId === 'string' && !!identity.rulesetId && identity.rulesetId.length <= 64
      && Number.isFinite(identity.maxTimeScale) && identity.maxTimeScale >= 0.5 && identity.maxTimeScale <= 3;
  }
  function captureShiftRecordIdentity(loadResult) {
    if (auto.demo) { shiftRecordIdentity = null; return null; }
    const saved = store.get(ACTIVE_RECORD_IDENTITY_KEY, null);
    if (loadResult && loadResult.status === 'resumed' && validActiveRecordIdentity(saved)) {
      shiftRecordIdentity = { ...saved, maxTimeScale: Math.max(saved.maxTimeScale, timeScale) };
    } else {
      shiftRecordIdentity = {
        runId: shiftId,
        name: normalizePlayerName(store.get('playerName', '')),
        dayIndex,
        difficulty: diffKey,
        rulesetId: shiftRulesetId,
        maxTimeScale: timeScale,
      };
    }
    store.set(ACTIVE_RECORD_IDENTITY_KEY, shiftRecordIdentity);
    return shiftRecordIdentity;
  }
  function updateShiftRecordTimeScale(value) {
    if (!shiftRecordIdentity || shiftRecordIdentity.runId !== shiftId || auto.demo) return false;
    const maxTimeScale = Math.max(shiftRecordIdentity.maxTimeScale, clamp(Number(value) || 1, 0.5, 3));
    if (maxTimeScale === shiftRecordIdentity.maxTimeScale) return false;
    shiftRecordIdentity = { ...shiftRecordIdentity, maxTimeScale };
    store.set(ACTIVE_RECORD_IDENTITY_KEY, shiftRecordIdentity);
    return true;
  }
  function ensureLocalRecordsState() {
    if (localRecordsCache) return localRecordsCache;
    const raw = store.get(LOCAL_RECORDS_KEY, null);
    const normalized = createLocalRecordsState(raw || {});
    const legacyBest = normalized.legacyBest.slice();
    for (let day = 0; day < DAYS.length; day++) {
      const score = store.get(`best.${day}`, 0);
      if (Number.isFinite(score) && score > 0) legacyBest.push({ dayIndex: day, score });
    }
    const state = createLocalRecordsState({ records: normalized.records, legacyBest });
    if (auto.demo) return state;
    localRecordsCache = state;
    if (!raw || JSON.stringify(raw) !== JSON.stringify(localRecordsCache)) store.set(LOCAL_RECORDS_KEY, localRecordsCache);
    return localRecordsCache;
  }
  function addCompletedShiftRecord(score, outcome) {
    if (auto.demo) return { ok: false, reason: 'demo_not_recorded' };
    const identity = shiftRecordIdentity;
    if (!validActiveRecordIdentity(identity)) return { ok: false, reason: 'record_identity_unavailable' };
    const record = makeRecord({
      runId: identity.runId,
      name: identity.name,
      score,
      dayIndex: identity.dayIndex,
      difficulty: identity.difficulty,
      rulesetId: identity.rulesetId,
      autoUsed: !!autoUsed,
      maxTimeScale: identity.maxTimeScale,
      completedAt: Date.now(),
      outcome,
    });
    if (!record.ok) return record;
    const added = addLocalRecord(ensureLocalRecordsState(), record);
    if (added.ok) {
      localRecordsCache = added.state;
      store.set(LOCAL_RECORDS_KEY, localRecordsCache);
    }
    if (store.get(ACTIVE_RECORD_IDENTITY_KEY, null)?.runId === identity.runId) store.set(ACTIVE_RECORD_IDENTITY_KEY, null);
    shiftRecordIdentity = null;
    return added;
  }
  function appendRecordsCell(row, value, tag = 'td') {
    const cell = document.createElement(tag);
    cell.textContent = String(value);
    row.appendChild(cell);
  }
  function selectedLocalRecordsFilter() {
    const day = $('records-day-filter')?.value || 'all';
    const difficulty = $('records-difficulty-filter')?.value || 'all';
    const assisted = $('records-assist-filter')?.value || 'all';
    const filter = { rulesetId: OFFICE_STORIES_RULESET_ID, limit: 10 };
    if (day !== 'all') filter.dayIndex = Number(day);
    if (difficulty !== 'all') filter.difficulty = difficulty;
    if (assisted !== 'all') filter.autoUsed = assisted === 'assisted';
    return { day, filter };
  }
  function renderLocalRecords() {
    const rows = $('records-rows');
    const empty = $('records-empty');
    const legacy = $('records-legacy');
    if (!rows || !empty || !legacy) return false;
    const { day, filter } = selectedLocalRecordsFilter();
    const listed = listLocalRecords(ensureLocalRecordsState(), filter);
    while (rows.firstChild) rows.removeChild(rows.firstChild);
    const difficultyNames = { easy: 'Стажёр', normal: 'Сотрудник', hard: 'Ветеран' };
    const outcomeNames = { win: 'Победа', munich: 'Мюнхен', fired: 'Увольнение' };
    if (listed.ok) {
      listed.records.forEach((record, index) => {
        const row = document.createElement('tr');
        [index + 1, record.name, DAYS[record.dayIndex].name, difficultyNames[record.difficulty],
          record.autoUsed ? 'С автопилотом' : 'Без автопилота', record.score, outcomeNames[record.outcome]].forEach(value => appendRecordsCell(row, value));
        rows.appendChild(row);
      });
      empty.classList.toggle('hidden', listed.records.length > 0);
      empty.textContent = listed.records.length ? '' : 'Для этих фильтров пока нет смен.';
      const old = listed.legacyBest.filter(item => day === 'all' || item.dayIndex === Number(day));
      legacy.textContent = old.length
        ? `${old[0].label}: ${old.map(item => `${DAYS[item.dayIndex].name} — ${item.score} очков`).join(' · ')}. Для этих результатов имя, сложность и автопилот не записывались.`
        : 'Старых рекордов по правилам 0.24.1 нет.';
    } else {
      empty.classList.remove('hidden');
      empty.textContent = 'Не удалось прочитать локальную таблицу.';
      legacy.textContent = '';
    }
    return true;
  }
  function openLocalRecords() {
    const overlay = $('records-overlay');
    if (!overlay) return false;
    recordsReturnFocus = document.activeElement;
    renderLocalRecords();
    recordsDialogOpen = true;
    overlay.classList.remove('hidden');
    $('records-close-icon')?.focus();
    return true;
  }
  function closeLocalRecords() {
    const overlay = $('records-overlay');
    if (!overlay || !recordsDialogOpen) return false;
    overlay.classList.add('hidden');
    recordsDialogOpen = false;
    if (recordsReturnFocus && typeof recordsReturnFocus.focus === 'function') recordsReturnFocus.focus();
    recordsReturnFocus = null;
    return true;
  }
  function isLocalRecordsOpen() { return recordsDialogOpen; }
  // ---------- ОНБОРДИНГ «КАК ИГРАТЬ» ----------
  const onb = { open: false, i: 0, thenStart: false, el: $('onboarding') };
  // Слайды «Что нового» (data-news) один раз показываются вернувшимся игрокам перед сменой; меняй id с новой волной
  const NEWS_ID = '0.28';
  // Первый запуск — только 3 ключевых слайда (цель, правила, Д.Н.); по I — полная справка
  const onbSlides = () => onb.el ? [...onb.el.querySelectorAll(onb.set === 'core' ? '.onb-slide[data-core]' : onb.set === 'news' ? '.onb-slide[data-news]' : '.onb-slide')] : [];
  function renderSlide() {
    const slides = onbSlides();
    onb.el.querySelectorAll('.onb-slide').forEach(sl => sl.classList.remove('active'));
    slides.forEach((sl, k) => sl.classList.toggle('active', k === onb.i));
    $('onb-num').textContent = `${onb.i + 1}/${slides.length}`;
    $('onb-dots').innerHTML = slides.map((_, k) => `<i class="${k === onb.i ? 'on' : ''}"></i>`).join('');
    $('onb-prev').style.visibility = onb.i ? 'visible' : 'hidden';
    const last = onb.i === slides.length - 1;
    $('onb-next').innerHTML = last ? (onb.thenStart ? 'НАЧАТЬ СМЕНУ ↵' : 'ПОНЯТНО ✓') : 'ДАЛЕЕ →';
  }
  function openOnboarding(thenStart = false, set = thenStart ? 'core' : 'all') {
    if (!onb.el) return;
    if (mode === 'playing') setMode('paused');
    onb.open = true; onb.i = 0; onb.thenStart = thenStart; onb.set = set;
    $('onb-title').textContent = set === 'news' ? 'ЧТО НОВОГО' : 'КАК ИГРАТЬ';
    onb.el.classList.remove('hidden');
    ui.overlay.classList.add('hidden');
    renderSlide();
  }
  function closeOnboarding(start) {
    if (!onb.open) return;
    onb.open = false;
    onb.el.classList.add('hidden');
    ui.overlay.classList.toggle('hidden', mode !== 'menu');
    store.set('onboardingDone', true);
    store.set('newsSeen', NEWS_ID); // новичок видел основную справку, вернувшийся — «Что нового»
    if (start && onb.thenStart) resetGame();
  }
  function onbStep(d) {
    const n = onbSlides().length;
    if (onb.i + d >= n) { closeOnboarding(true); return; }
    onb.i = Math.max(0, onb.i + d);
    playSound('click');
    renderSlide();
  }

  function setMode(next) {
    mode = next;
    if (shopOpen) closeShop();
    ui.overlay.classList.toggle('hidden', next !== 'menu');
    ui.pause.classList.toggle('hidden', next !== 'paused');
    ui.end.classList.toggle('hidden', next !== 'ended');
    document.body.classList.toggle('is-playing', next === 'playing' || next === 'paused');
  }

  // Список дел — задачи дня (обучают тому, что открылось сегодня)
  function pickTodo() {
    return (today().tasks || []).map(id => LINES.dayTasks.find(t => t.id === id)).filter(Boolean).map(t => ({ ...t, done: false, day: true }));
  }
  function requiredEventForTodo(tasks) {
    const prerequisites = window.NP_CONFIG.TASK_EVENT_PREREQUISITES || {};
    const task = (tasks || []).find(t => !t.done && prerequisites[t.id]);
    if (!task) return null;
    const id = prerequisites[task.id];
    if (!EVENT_TIER[id] || !unlocked(EVENT_TIER[id])) return null;
    return { id, deadlineStart: 15 * 60, dispatched: false };
  }
  function applyWeekScenarioToPlan(baseTasks, baseEvents) {
    const weekDone = !!store.get('weekDone', false);
    const selection = selectWeekScenario({ weekDone, weekNumber });
    const reportTask = LINES.dayTasks.find(task => task.id === 'printReport');
    const replaceableTaskIds = baseTasks
      .map(task => task.id)
      .filter(id => id !== 'printReport' && !/^(coffee|smoke|toilet|lunch)/.test(id) &&
        Object.prototype.hasOwnProperty.call(window.NP_CONFIG.TASK_EVENT_PREREQUISITES || {}, id));
    const sergey = coworkers.find(c => c.id === 'sirgey');
    const unlockedEventIds = Object.keys(EVENT_TIER).filter(id => unlocked(EVENT_TIER[id]));
    const context = {
      weekDone,
      weekNumber,
      dayIndex,
      unlockedEventIds,
      sergeyAvailable: !!sergey && !sergey.ghost && !(sergey.extra && !sergey.statist && !unlocked('row2')),
      replaceableTaskIds,
      reportTask,
    };
    const result = selection.ok
      ? applyWeekScenario(selection, baseTasks, baseEvents, context)
      : { ok: false, reason: selection.reason };
    const applied = result.ok ? result : applyWeekScenario('normal', baseTasks, baseEvents, context);
    const tasks = applied.ok ? applied.tasks : baseTasks;
    const events = applied.ok ? applied.events : baseEvents;
    const requiredEvents = applied.ok
      ? applied.requiredEventIds.map(id => ({
        id,
        deadlineStart: Object.prototype.hasOwnProperty.call(applied.eventDeadlineMinutes, id)
          ? applied.eventDeadlineMinutes[id]
          : null,
        dispatched: false,
      }))
      : [];
    saveExtensions.weekScenario = {
      scenario: applied.ok ? applied.scenario : 'normal',
      weekNumber,
      active: weekDone,
      dayIndex,
      banner: result.ok && selection.ok ? selection.banner : null,
      requiredEvents,
      replacedTaskId: applied.ok ? applied.replacedTaskId : null,
    };
    return { tasks, events };
  }
  function todoProgress(t) {
    if (t.stat) return Math.floor(stats[t.stat] || 0);
    switch (t.id) {
      case 'chatAimashyn': return stats.chatted.has('aimashyn') ? 1 : 0;
      case 'chatHlad': return stats.chatted.has('hlad') ? 1 : 0;
      case 'yogurt': return saveExtensions.activities && saveExtensions.activities.yogurtStolen ? 1 : 0;
      case 'cleanFriday': return clockMinutes >= 17 * 60 && reprimands === 0 ? 1 : 0;
      case 'planEarly': return stats.planAt && stats.planAt < 16 * 60 ? 1 : 0;
      default: return 0;
    }
  }
  function checkTodo() {
    let completed = false;
    for (const t of todo) {
      if (t.done) continue;
      if (todoProgress(t) >= t.goal) {
        completed = true;
        t.done = true;
        addFun(8);
        playSound('success');
        toast(`✔ Выполнено: ${t.text}! +8 кайфа`, 2.6);
        addLog(`Список дел: «${t.text}» — готово.`, 'good');
        floater(player.x, player.y - 70, '✔ ДЕЛО СДЕЛАНО', '#f2bb38');
      }
    }
    if (completed) refreshPinnedObjective();
  }

  function createRelationshipStateAtDay(targetDay) {
    return advanceRelationshipsDay(createRelationships(), targetDay).state;
  }
  function readRelationshipSnapshot(key) {
    const raw = store.get(key, null);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const sourceDay = raw.dayIndex === null ? 0 : raw.dayIndex;
    if (!Number.isInteger(sourceDay) || sourceDay < 0 || sourceDay > 4) return null;
    const checked = advanceRelationshipsDay(raw, sourceDay);
    return checked.ok ? checked.state : null;
  }
  function relationshipSnapshotAtDay(state, targetDay) {
    if (!state || (state.dayIndex !== null && state.dayIndex > targetDay)) return null;
    const result = relationshipStateForDay(state, targetDay);
    return result.ok ? result.state : null;
  }
  function prepareRelationshipsForShift(loadResult) {
    const rawExtension = saveExtensions.relationships;
    let loadedState = null;
    if (rawExtension) {
      const check = relationshipStateForDay(rawExtension, dayIndex);
      if (check.ok && (rawExtension.dayIndex === null || rawExtension.dayIndex === dayIndex)) loadedState = check.state;
      else if (!saveExtensionErrors.relationships) saveExtensionErrors.relationships = check.reason || 'day_mismatch';
    }

    const savedDayStart = readRelationshipSnapshot('relationships.dayStart');
    const savedWeekStart = readRelationshipSnapshot('relationships.weekStart');
    const savedCurrent = readRelationshipSnapshot('relationships.current');
    const dayStart = savedDayStart && savedDayStart.dayIndex === dayIndex ? savedDayStart : null;
    const currentAtDay = relationshipSnapshotAtDay(savedCurrent, dayIndex);
    const weekAtDay = savedWeekStart && savedWeekStart.dayIndex === 0
      ? relationshipSnapshotAtDay(savedWeekStart, dayIndex)
      : null;

    if (loadResult.status === 'resumed' && loadedState) saveExtensions.relationships = loadedState;
    else saveExtensions.relationships = dayStart || currentAtDay || weekAtDay || createRelationshipStateAtDay(dayIndex);

    if (auto.on && auto.demo) return;
    if (!savedWeekStart || savedWeekStart.dayIndex !== 0) store.set('relationships.weekStart', createRelationshipStateAtDay(0));
    const resolvedDayStart = dayStart || currentAtDay || weekAtDay || createRelationshipStateAtDay(dayIndex);
    if (!dayStart) store.set('relationships.dayStart', resolvedDayStart);
    if (!savedCurrent) store.set('relationships.current', resolvedDayStart);
  }

  function resetRelationshipsForNewWeek() {
    if (auto.on && auto.demo) return;
    const start = createRelationshipStateAtDay(0);
    store.set('relationships.weekStart', start);
    store.set('relationships.dayStart', start);
    store.set('relationships.current', start);
  }

  function commitRelationshipProgress(completedDay, nextDay, newWeek = false) {
    if (auto.on && auto.demo) return;
    if (newWeek) { resetRelationshipsForNewWeek(); return; }
    const current = ensureRelationshipsExtension();
    const completed = relationshipStateForDay(current, completedDay);
    if (!completed.ok) return;
    const next = relationshipStateForDay(completed.state, nextDay);
    if (!next.ok) return;
    store.set('relationships.current', completed.state);
    store.set('relationships.dayStart', next.state);
  }

  function resetGame(seed) {
    closePhonePanel(true, true);
    const persistedWeekNumber = store.get('weekNumber', null);
    const hasCompletedWeek = !!store.get('weekDone', false);
    weekNumber = Number.isInteger(persistedWeekNumber) && persistedWeekNumber >= 0
      ? Math.max(persistedWeekNumber, hasCompletedWeek ? 1 : 0)
      : (hasCompletedWeek ? 1 : 0);
    if (!Number.isInteger(persistedWeekNumber) || persistedWeekNumber < 0 || persistedWeekNumber !== weekNumber) store.set('weekNumber', weekNumber);
    rngSeed = Number.isInteger(seed) ? seed : Math.floor(Date.now() % 100000); // seed — только для автотестов
    shiftId = createShiftId();
    shiftRulesetId = OFFICE_STORIES_RULESET_ID;
    autoUsed = false;
    recoveryGraceUsed = false;
    requiredEvent = null;
    actionChoiceState = null;
    saveExtensions = { moments: createMoments() };
    saveExtensionErrors = {};
    clockMinutes = CFG.shiftStart;
    shiftTime = 0;
    reprimands = 0;
    usefulness = 0;
    planTarget = Math.round((today().plan || 70) * diff().plan);
    fun = 0;
    resetStats();
    nextBossCheck = (CFG.firstCheck[0] + rand() * (CFG.firstCheck[1] - CFG.firstCheck[0])) * Math.max(1, diff().check);
    intelTimer = 0;
    coverTokens = 0;
    particles = []; floaters = []; bubbles = []; logEntries = [];
    todo = pickTodo();
    officeEvent = null;
    banner = null;
    tutorial = { step: store.get('tutorialDone', false) ? 99 : 0, t: 0 };
    nextEvent = 32 + rand() * 12;
    // D5 меняет задачи и работает с базовой очередью; A03 после этого резервирует все обязательные ID в ней.
    const dailyPlan = applyWeekScenarioToPlan(todo, shuffleEvents([]));
    todo = dailyPlan.tasks;
    eventQueue = dailyPlan.events;
    requiredEvent = requiredEventForTodo(todo);
    ensureRequiredEventQueue();
    Object.assign(player, { x: SEAT.x, y: WD.ROW1_Y + 62, action: 'none', actionTimer: 0, actionTotal: 0, coffeeBoost: 0, speed: CFG.playerSpeed, chatWith: null, chatPair: null, chatReplied: false, hideSpot: null, hideT: 0, queueTarget: null, workFromFront: false, bumpCooldown: 0, walkTimer: 0, moving: false, facingX: -1 });
    for (const key of ['alarm', 'caught', 'coworker', 'emptyDesk', 'gaveUp', 'heat', 'lunchBack', 'noise', 'office', 'patrol', 'praise', 'scold', 'scoldTarget', 'seesPlayer', 'silentCheck', 'snus', 'snusCd', 'stroll', 'suspicious', 'waitT', 'watchingWork', 'outTimer', 'outWhy']) delete boss[key];
    Object.assign(boss, { x: WD.bossHome.x, y: WD.bossHome.y, state: 'office', stateTimer: 5, path: [], mode: 'patrol', spotDesc: 'кабинет', suspicion: 0, catchCooldown: 0, quoteTimer: 4, praiseTimer: 0, lookTimer: 0, inspectTimer: 0, visitedSpots: 0, warned: false, facing: Math.PI / 2, walkTimer: 0, moving: false });
    coworkers.forEach(c => { c.cooldown = 0; c.talkTimer = 0; c.idleTimer = 2 + rand() * 12; c.alert = 0; c.slack = null; c.slackTimer = 10 + rand() * 12; c.scoldCooldown = 0; c.rocketAt = 660 + rand() * 360; c.draftCd = 0; c.path = null; });
    banterT = 10 + rand() * 12; pendingSays.length = 0; ambientQueue.length = 0; ambientGap = 0;
    day = {
      misses: 0, lunchCalled: false, lunchOpen: false, fed: false, hungry: false, bossLunch: false, beer: null,
      toiletCd: 0, queue: 0, queueTotal: 0, qShift: 0, knock: 3, cabinDoor: 0, npcInside: 0, npcTimer: 20,
      drillAwayTimer: 0, drillAwayIndex: 0, lunchAwayTimer: 0, lunchAwayIndex: 0, beerAwayTimer: 0, beerAwayIndex: 0,
      waterCups: 4, waterRecharge: 0,
      coffeeCups: 0, coffeeJammed: false, coffeeQueueTimer: 0, coffeeQueueChecked: false,
      excelWorkAcc: 0, overtimeWork: 0,
      adhocDone: false, adhocAt: 720 + Math.floor(rand() * 210),
      aljaziraTimer: 85 + rand() * 45, aljaziraVisiting: false,
      // Катастрофа Маджикистана: максимум раз в день, с шансом CFG.aljaziraDisasterChance, на визите после случайного часа 11:00–18:00
      aljaziraDisasterAt: rand() < CFG.aljaziraDisasterChance ? 11 * 60 + rand() * 7 * 60 : -1, aljaziraDisasterDone: false, aljaziraPhase: 'desk', aljaziraPhaseTimer: 0,
      lastSavedMinute: 0,
      pee: 0, peeActive: false, peeLeft: CFG.peeTimes[0] + Math.floor(rand() * (CFG.peeTimes[1] - CFG.peeTimes[0] + 1)), peeAt: 0,
    };
    day.vilka = dayIndex === 3; // четверг — стейки в «Вилке»
    day.peeAt = CFG.shiftStart + 50 + rand() * 90; // первый раз — между 09:40 и 11:10
    day.smog = unlocked('almaty') && dayIndex !== 4 && rand() < 0.3;
    day.traffic = unlocked('almaty') && !auto.on && rand() < 0.25;
    coworkers.forEach(c => { c.remote = c.extra && !c.ghost && !c.statist && !unlocked('row2'); c.away = c.remote; });
    walkers = [];
    nudge = null;
    shownThisShift.clear();
    phoneSafe = 0;
    if (dayIndex === 0 && !store.get('currentSave', null)) {
      weekReprimands = 0; store.set('weekReprimands', 0);
    }
    const loadResult = loadSavedProgress();
    captureShiftRecordIdentity(loadResult);
    beginEquipmentForShift(loadResult);
    refreshPinnedObjective();
    lastLoadResult = { ...loadResult };
    prepareRelationshipsForShift(loadResult);
    prepareWeekOutcomesForShift(loadResult);
    const hasSavedShift = loadResult.status !== 'new';
    if (!hasSavedShift && has('lava')) addFun(3);
    addLog(`${today().name}: ${today().mod}.`);
    if (hasSavedShift) {
      addLog(`Продолжение смены: ${timeString(clockMinutes)}, план ${Math.floor(usefulness)}/${planTarget}, кайф ${Math.round(fun)}.`, 'info');
    } else {
      addLog('08:50 — Быкентий пришёл в БЦ «Угар». Хвостик поправлен, в наушниках — «Кино».');
      addLog('Директор Начальникович пьёт чай в кабинете. Пока.');
      addLog('Напоминание: ты ответственный за Маджикистан. Там опять что-то моргает.');
    }
    if (dayIndex === 0 && !hasSavedShift) { majikArc = 0; store.set('majikArc', 0); }
    // Смог, пробка и удалёнка генерируются один раз до загрузки; v3 затем восстанавливает их точные значения.
    if (day.smog) addLog('Смог над Алматы: гор не видно, перекур без вида — кайфа меньше.', 'info');
    if (day.traffic && !hasSavedShift) {
      player.x = WD.exitDoor.x + 12; player.y = WD.exitDoor.y;
      nextBossCheck = Math.min(nextBossCheck, 9);
      addLog('Пробка на Аль-Фараби! Быкентий опоздал — беги к столу, пока Д.Н. не заметил.', 'bad');
    }
    setMode('playing');
    if (!hasSavedShift || loadResult.status === 'migrated') {
      const firstWeek = !store.get('weekDone', false);
      const scenarioBanner = saveExtensions.weekScenario && saveExtensions.weekScenario.active
        ? saveExtensions.weekScenario.banner
        : null;
      banner = scenarioBanner
        ? { dur: 4.4, text: scenarioBanner, sub: today().mod, t: 0 }
        : { dur: firstWeek ? 8 : 4.4, text: `${today().name} · ДЕНЬ ${dayIndex + 1}/5 · ПЛАН ${planTarget}`, sub: firstWeek ? `${today().news} · ${today().mod}` : day.traffic ? 'Пробка на Аль-Фараби! Ты опоздал — беги к столу, Д.Н. скоро с проверкой.' : (day.smog ? `${today().mod} · Смог: гор не видно` : today().mod), t: 0 };
    }
    if (loadResult.status === 'migrated') saveProgress(); // заменяем v2 снимком v3 с уже использованной передышкой
    if (loadResult.status === 'new' && loadResult.reason && !['context_mismatch', 'autopilot'].includes(loadResult.reason)) toast('Сохранение смены повреждено; началась новая смена.', 3);
  }
  function enterFullscreen() {
    try {
      const el = document.documentElement;
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        if (el.requestFullscreen) {
          el.requestFullscreen().catch(() => {});
        } else if (el.webkitRequestFullscreen) {
          el.webkitRequestFullscreen();
        }
      }
      if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('landscape').catch(() => {});
      }
    } catch (_) {}
  }

  function startGame() {
    stopAutopilot();
    playSound('click');
    enterFullscreen();
    // Первый запуск: сначала подробный онбординг, потом смена
    if (!store.get('onboardingDone', false) && mode === 'menu') { openOnboarding(true); return; }
    // Вернувшийся игрок: один раз коротко о новом (автотесты в headless-браузере это окно пропускают)
    if (store.get('newsSeen', '') !== NEWS_ID && mode === 'menu' && !navigator.webdriver) { openOnboarding(true, 'news'); return; }
    resetGame();
  }
  function pauseGame() {
    playSound('click');
    if (mode === 'playing') { closePhonePanel(true, true); setMode('paused'); saveProgress(); }
    else if (mode === 'paused') setMode('playing');
  }

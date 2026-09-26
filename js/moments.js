const MOMENTS_CATALOG = [
  { id: 'variety', label: 'Разнообразие отдыха', points: 3 },
  { id: 'distraction', label: 'Отвлечение', points: 3 },
  { id: 'colleagueHelp', label: 'Помощь коллеги', points: 3 },
  { id: 'story', label: 'История', points: 3 },
  { id: 'groupSmoke', label: 'Общий перекур', points: 3 },
];
const MOMENTS_CAP = 12;
const MOMENTS_REST_TYPES = ['smoke', 'youtube', 'fridge', 'chat', 'phone'];
const MOMENTS_GRADE_TITLES = [
  { score: 160, rank: 'S', title: 'Легенда опенспейса' },
  { score: 120, rank: 'A', title: 'Мастер имитации' },
  { score: 85, rank: 'B', title: 'Крепкий середнячок' },
  { score: 50, rank: 'C', title: 'Зелёный стажёр' },
  { score: 0, rank: 'D', title: 'Слишком честный' },
];

function createMoments() {
  return {
    version: 1,
    awards: [],
    variety: { completedKinds: [], completedSources: [], phoneEpisode: null },
  };
}

function momentsFinite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function momentsSourceKey(sourceId, suffix) {
  return `${sourceId}|${suffix}`;
}

function cloneMomentsState(state) {
  const next = createMoments();
  if (!state || typeof state !== 'object' || Array.isArray(state)) return next;

  const awardedIds = new Set();
  if (Array.isArray(state.awards)) {
    for (const item of state.awards) {
      if (!item || typeof item !== 'object' || typeof item.id !== 'string' || typeof item.sourceId !== 'string') continue;
      const catalogItem = MOMENTS_CATALOG.find(entry => entry.id === item.id);
      if (!catalogItem || awardedIds.has(item.id)) continue;
      awardedIds.add(item.id);
      next.awards.push({ id: item.id, sourceId: item.sourceId, points: catalogItem.points });
    }
  }
  while (next.awards.reduce((sum, item) => sum + item.points, 0) > MOMENTS_CAP) next.awards.pop();

  const sourceKeys = new Set();
  if (state.variety && typeof state.variety === 'object') {
    if (Array.isArray(state.variety.completedKinds)) {
      for (const id of state.variety.completedKinds) {
        if (MOMENTS_REST_TYPES.includes(id) && !next.variety.completedKinds.includes(id)) next.variety.completedKinds.push(id);
      }
    }
    if (Array.isArray(state.variety.completedSources)) {
      for (const key of state.variety.completedSources) {
        if (typeof key === 'string' && key && !sourceKeys.has(key)) {
          sourceKeys.add(key);
          next.variety.completedSources.push(key);
        }
      }
    }
    const phone = state.variety.phoneEpisode;
    if (phone && typeof phone === 'object' && typeof phone.sourceId === 'string' && momentsFinite(phone.seconds) && phone.seconds >= 0) {
      next.variety.phoneEpisode = { sourceId: phone.sourceId, seconds: phone.seconds };
    }
  }
  return next;
}

function momentFailure(state, reason) {
  return { ok: false, state, effects: [], reason };
}

function momentsAwardId(state, id, sourceId) {
  if (typeof sourceId !== 'string' || !sourceId.trim()) return momentFailure(state, 'source_id_required');
  if (state.awards.some(item => item.id === id && item.sourceId === sourceId)) return momentFailure(state, 'duplicate_source');
  if (state.awards.some(item => item.id === id)) return momentFailure(state, 'moment_already_awarded');
  const points = MOMENTS_CATALOG.find(item => item.id === id).points;
  const total = state.awards.reduce((sum, item) => sum + item.points, 0);
  if (total + points > MOMENTS_CAP) return momentFailure(state, 'moment_cap_reached');

  const next = cloneMomentsState(state);
  next.awards.push({ id, sourceId, points });
  return {
    ok: true,
    state: next,
    effects: [{ id: `${sourceId}:moment:${id}`, type: 'awardMoment', momentId: id, sourceId }],
    reason: null,
  };
}

function awardMoment(state, id, sourceId, context) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return momentFailure(state, 'invalid_state');
  const validId = MOMENTS_CATALOG.some(item => item.id === id);
  if (!validId) return momentFailure(state, 'unknown_moment');
  if (id !== 'variety') return momentsAwardId(cloneMomentsState(state), id, sourceId);
  if (typeof sourceId !== 'string' || !sourceId.trim()) return momentFailure(state, 'source_id_required');
  if (!context || typeof context !== 'object' || Array.isArray(context)) return momentFailure(state, 'variety_context_required');
  if (typeof context.activityId !== 'string' || !MOMENTS_REST_TYPES.includes(context.activityId)) return momentFailure(state, 'unknown_rest_type');
  if (typeof context.completed !== 'boolean' || typeof context.active !== 'boolean' || typeof context.paused !== 'boolean') {
    return momentFailure(state, 'variety_context_incomplete');
  }
  if (context.shiftEnded === true) return momentFailure(state, 'shift_ended');

  const next = cloneMomentsState(state);
  if (context.paused) return { ok: true, state: next, effects: [], reason: null };
  const kind = context.activityId;
  if (kind === 'phone') {
    if (context.active) {
      if (!momentsFinite(context.dt) || context.dt < 0) return momentFailure(state, 'invalid_dt');
      const previous = next.variety.phoneEpisode;
      const seconds = previous && previous.sourceId === sourceId ? previous.seconds : 0;
      next.variety.phoneEpisode = { sourceId, seconds: seconds + context.dt };
      if (!context.completed) return { ok: true, state: next, effects: [], reason: null };
    } else if (!context.completed) {
      next.variety.phoneEpisode = null;
      return { ok: true, state: next, effects: [], reason: null };
    }
    const episode = next.variety.phoneEpisode;
    const seconds = episode && episode.sourceId === sourceId ? episode.seconds : 0;
    next.variety.phoneEpisode = null;
    if (seconds < 6) return { ok: true, state: next, effects: [], reason: null };
  } else {
    next.variety.phoneEpisode = null;
    if (!context.completed) return { ok: true, state: next, effects: [], reason: null };
  }

  const sourceKey = momentsSourceKey(sourceId, kind);
  if (next.variety.completedSources.includes(sourceKey)) return momentFailure(state, 'duplicate_source');
  next.variety.completedSources.push(sourceKey);
  if (!next.variety.completedKinds.includes(kind)) next.variety.completedKinds.push(kind);
  if (next.variety.completedKinds.length < 4) return { ok: true, state: next, effects: [], reason: null };

  const awarded = momentsAwardId(next, 'variety', sourceId);
  if (!awarded.ok) {
    return { ok: true, state: next, effects: [], reason: null };
  }
  return awarded;
}

function summarizeMoments(state) {
  const normalized = cloneMomentsState(state);
  const awarded = normalized.awards.reduce((sum, item) => sum + item.points, 0);
  return {
    awarded,
    cap: MOMENTS_CAP,
    remaining: Math.max(0, MOMENTS_CAP - awarded),
    moments: normalized.awards.map(item => ({
      id: item.id,
      label: MOMENTS_CATALOG.find(entry => entry.id === item.id).label,
      points: item.points,
      sourceId: item.sourceId,
    })),
  };
}

function calculateShiftResult(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return { ok: false, breakdown: null, score: null, coins: null, grade: null, reason: 'invalid_snapshot' };
  }
  const { fun, fullPlan, done, reprimands, momentBonus } = snapshot;
  if (!momentsFinite(fun) || typeof fullPlan !== 'boolean' || !momentsFinite(done) || done < 0 ||
      !momentsFinite(reprimands) || reprimands < 0 || !momentsFinite(momentBonus) || momentBonus < 0) {
    return { ok: false, breakdown: null, score: null, coins: null, grade: null, reason: 'snapshot_incomplete' };
  }
  const cleanFun = Math.max(0, Math.min(100, fun));
  const cleanDone = Math.floor(done);
  const cleanReprimands = Math.floor(reprimands);
  const cleanMomentBonus = Math.min(MOMENTS_CAP, momentBonus);
  const planBonus = fullPlan ? 20 : 0;
  const todoBonus = cleanDone * 12;
  const reprimandPenalty = cleanReprimands * 15;
  const unrounded = cleanFun + planBonus + todoBonus - reprimandPenalty + cleanMomentBonus;
  const score = Math.max(0, Math.round(unrounded));
  const grade = MOMENTS_GRADE_TITLES.find(item => score >= item.score);
  return {
    ok: true,
    breakdown: {
      fun: cleanFun,
      fullPlan: planBonus,
      todos: todoBonus,
      reprimands: -reprimandPenalty,
      moments: cleanMomentBonus,
      unrounded,
    },
    score,
    coins: Math.max(1, Math.round(score / 10)),
    grade: { rank: grade.rank, title: grade.title },
    reason: null,
  };
}

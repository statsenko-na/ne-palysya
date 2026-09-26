const RECORDS_MAX_PER_CATEGORY = 10;
const RECORDS_MAX_TOTAL = 300;
const RECORDS_DIFFICULTIES = ['easy', 'normal', 'hard'];
const RECORDS_OUTCOMES = ['win', 'fired', 'munich'];
const RECORDS_LEGACY_LABEL = 'Старый рекорд, правила 0.24.1';

function normalizePlayerName(raw) {
  const value = typeof raw === 'string' ? raw : '';
  const clean = value
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  return Array.from(clean).slice(0, 20).join('') || 'Быкентий';
}

function recordsFailure(reason, state = null) {
  return { ok: false, state, reason };
}

function recordsFinite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function makeRecord(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, record: null, reason: 'invalid_record' };
  if (input.demo === true || input.isDemo === true || input.mode === 'demo') return { ok: false, record: null, reason: 'demo_not_recorded' };

  const runId = typeof input.runId === 'string' ? input.runId.trim() : '';
  const rulesetId = typeof input.rulesetId === 'string' ? input.rulesetId.trim() : '';
  if (!runId || runId.length > 120) return { ok: false, record: null, reason: 'run_id_required' };
  if (typeof input.name !== 'string' && input.name != null) return { ok: false, record: null, reason: 'invalid_name' };
  if (!recordsFinite(input.score) || input.score < 0) return { ok: false, record: null, reason: 'invalid_score' };
  if (!Number.isInteger(input.dayIndex) || input.dayIndex < 0 || input.dayIndex > 4) return { ok: false, record: null, reason: 'invalid_day' };
  if (!RECORDS_DIFFICULTIES.includes(input.difficulty)) return { ok: false, record: null, reason: 'invalid_difficulty' };
  if (!rulesetId || rulesetId.length > 64) return { ok: false, record: null, reason: 'ruleset_required' };
  if (typeof input.autoUsed !== 'boolean') return { ok: false, record: null, reason: 'auto_used_required' };
  if (!recordsFinite(input.maxTimeScale) || input.maxTimeScale < 0.5 || input.maxTimeScale > 3) return { ok: false, record: null, reason: 'invalid_time_scale' };
  if (!recordsFinite(input.completedAt) || input.completedAt < 0) return { ok: false, record: null, reason: 'invalid_completed_at' };
  if (!RECORDS_OUTCOMES.includes(input.outcome)) return { ok: false, record: null, reason: 'invalid_outcome' };

  return {
    ok: true,
    record: {
      runId,
      name: normalizePlayerName(input.name),
      score: Math.round(input.score),
      dayIndex: input.dayIndex,
      difficulty: input.difficulty,
      rulesetId,
      autoUsed: input.autoUsed,
      maxTimeScale: input.maxTimeScale,
      completedAt: input.completedAt,
      outcome: input.outcome,
    },
    reason: null,
  };
}

function recordsIsWin(record) {
  return record.outcome === 'win' || record.outcome === 'munich';
}

function recordsCategoryKey(record) {
  return `${record.difficulty}|${record.rulesetId}|${record.autoUsed ? 'assisted' : 'manual'}`;
}

function recordsCompare(a, b) {
  const aWin = recordsIsWin(a);
  const bWin = recordsIsWin(b);
  if (aWin !== bWin) return aWin ? -1 : 1;
  if (aWin && a.score !== b.score) return b.score - a.score;
  if (aWin && a.completedAt !== b.completedAt) return a.completedAt - b.completedAt;
  if (!aWin && a.completedAt !== b.completedAt) return b.completedAt - a.completedAt;
  if (a.score !== b.score) return b.score - a.score;
  return a.runId === b.runId ? 0 : a.runId < b.runId ? -1 : 1;
}

function recordsNormalizeLegacyBest(raw) {
  let items = [];
  if (Array.isArray(raw)) {
    items = raw;
  } else if (raw && typeof raw === 'object') {
    items = Object.entries(raw).map(([key, score]) => ({ dayIndex: Number(String(key).replace(/^best\./u, '')), score }));
  }
  const byDay = new Map();
  for (const item of items) {
    if (!item || typeof item !== 'object' || !Number.isInteger(item.dayIndex) || item.dayIndex < 0 || item.dayIndex > 4 ||
        !recordsFinite(item.score) || item.score < 0) continue;
    const score = Math.round(item.score);
    const existing = byDay.get(item.dayIndex);
    if (!existing || score > existing.score) {
      byDay.set(item.dayIndex, { dayIndex: item.dayIndex, score, label: RECORDS_LEGACY_LABEL });
    }
  }
  return Array.from(byDay.values()).sort((a, b) => a.dayIndex - b.dayIndex);
}

function recordsNormalizeState(raw) {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const records = [];
  const seen = new Set();
  const candidates = Array.isArray(input.records) ? input.records : [];
  for (const candidate of candidates) {
    const made = makeRecord(candidate);
    if (!made.ok || seen.has(made.record.runId)) continue;
    seen.add(made.record.runId);
    records.push(made.record);
  }

  records.sort(recordsCompare);
  const perCategory = new Map();
  const limited = [];
  for (const record of records) {
    const key = recordsCategoryKey(record);
    const count = perCategory.get(key) || 0;
    if (count >= RECORDS_MAX_PER_CATEGORY) continue;
    perCategory.set(key, count + 1);
    limited.push(record);
  }
  limited.sort(recordsCompare);
  return {
    version: 1,
    records: limited.slice(0, RECORDS_MAX_TOTAL),
    legacyBest: recordsNormalizeLegacyBest(input.legacyBest),
  };
}

function createLocalRecordsState(input) {
  return recordsNormalizeState(input || {});
}

function addLocalRecord(state, recordInput) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return recordsFailure('invalid_state', state);
  const made = makeRecord(recordInput && recordInput.ok === true ? recordInput.record : recordInput);
  if (!made.ok) return recordsFailure(made.reason, state);
  const current = recordsNormalizeState(state);
  if (current.records.some(item => item.runId === made.record.runId)) return recordsFailure('duplicate_run', state);

  const next = recordsNormalizeState({ ...current, records: [...current.records, made.record] });
  return { ok: true, state: next, record: made.record, reason: null };
}

function listLocalRecords(state, filter = {}) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return { ok: false, records: [], legacyBest: [], reason: 'invalid_state' };
  }
  if (filter == null || typeof filter !== 'object' || Array.isArray(filter)) {
    return { ok: false, records: [], legacyBest: [], reason: 'invalid_filter' };
  }
  if (filter.difficulty !== undefined && !RECORDS_DIFFICULTIES.includes(filter.difficulty)) {
    return { ok: false, records: [], legacyBest: [], reason: 'invalid_difficulty' };
  }
  if (filter.autoUsed !== undefined && typeof filter.autoUsed !== 'boolean') {
    return { ok: false, records: [], legacyBest: [], reason: 'invalid_auto_used' };
  }
  if (filter.rulesetId !== undefined && (typeof filter.rulesetId !== 'string' || !filter.rulesetId.trim())) {
    return { ok: false, records: [], legacyBest: [], reason: 'invalid_ruleset' };
  }

  const normalized = recordsNormalizeState(state);
  let records = normalized.records.filter(record =>
    (filter.difficulty === undefined || record.difficulty === filter.difficulty) &&
    (filter.rulesetId === undefined || record.rulesetId === filter.rulesetId) &&
    (filter.autoUsed === undefined || record.autoUsed === filter.autoUsed) &&
    (filter.dayIndex === undefined || record.dayIndex === filter.dayIndex) &&
    (filter.outcome === undefined || record.outcome === filter.outcome));
  if (filter.dayIndex !== undefined && (!Number.isInteger(filter.dayIndex) || filter.dayIndex < 0 || filter.dayIndex > 4)) {
    return { ok: false, records: [], legacyBest: [], reason: 'invalid_day' };
  }
  if (filter.outcome !== undefined && !RECORDS_OUTCOMES.includes(filter.outcome)) {
    return { ok: false, records: [], legacyBest: [], reason: 'invalid_outcome' };
  }
  if (filter.limit !== undefined && (!Number.isInteger(filter.limit) || filter.limit < 0)) {
    return { ok: false, records: [], legacyBest: [], reason: 'invalid_limit' };
  }
  if (filter.limit !== undefined) records = records.slice(0, Math.min(filter.limit, RECORDS_MAX_TOTAL));
  return { ok: true, records, legacyBest: normalized.legacyBest, reason: null };
}

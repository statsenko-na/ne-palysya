'use strict';

const ACTIVITY_VARIANTS = {
  'smoke-listening': { durationSeconds: 3, rate: 0, countAsBaseActivity: false },
  'youtube-quiet': { durationSeconds: 8, rate: 5, countAsBaseActivity: true },
  'youtube-loud': { durationSeconds: 6, rate: 5.5, countAsBaseActivity: true },
  'fridge-own': { durationSeconds: 4.5, rate: 3, countAsBaseActivity: true },
  'fridge-yogurt': { durationSeconds: 4.5, rate: 4, countAsBaseActivity: true }
};
const ACTIVITY_BOSS_ROUTE_STATES = ['office', 'patrol', 'look', 'return'];

function createActivities() {
  return {
    shiftId: null,
    nextAttemptId: 1,
    active: null,
    listeningCompleted: false,
    intelGranted: false,
    yogurtStolen: false
  };
}

function activitiesStateIsValid(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return false;
  if (!(state.shiftId === null || (typeof state.shiftId === 'string' && state.shiftId.length > 0))) return false;
  if (!Number.isInteger(state.nextAttemptId) || state.nextAttemptId < 1) return false;
  if (typeof state.listeningCompleted !== 'boolean' ||
      typeof state.intelGranted !== 'boolean' ||
      typeof state.yogurtStolen !== 'boolean') return false;
  if (state.active === null) return true;
  const active = state.active;
  if (!active || typeof active !== 'object' || !Object.prototype.hasOwnProperty.call(ACTIVITY_VARIANTS, active.variant)) return false;
  if (typeof active.sourceId !== 'string' || !active.sourceId) return false;
  if (!Number.isFinite(active.durationSeconds) || active.durationSeconds <= 0) return false;
  if (!Number.isFinite(active.elapsedSeconds) || active.elapsedSeconds < 0 || active.elapsedSeconds > active.durationSeconds) return false;
  if (!Number.isFinite(active.remainingSeconds) || active.remainingSeconds < 0 || active.remainingSeconds > active.durationSeconds) return false;
  if (!Number.isFinite(active.rate) || active.rate < 0 || typeof active.countAsBaseActivity !== 'boolean') return false;
  return typeof active.noiseTriggered === 'boolean';
}

function cloneActivities(state) {
  return {
    shiftId: state.shiftId,
    nextAttemptId: state.nextAttemptId,
    active: state.active ? {
      variant: state.active.variant,
      sourceId: state.active.sourceId,
      durationSeconds: state.active.durationSeconds,
      elapsedSeconds: state.active.elapsedSeconds,
      remainingSeconds: state.active.remainingSeconds,
      rate: state.active.rate,
      countAsBaseActivity: state.active.countAsBaseActivity,
      noiseTriggered: state.active.noiseTriggered
    } : null,
    listeningCompleted: state.listeningCompleted,
    intelGranted: state.intelGranted,
    yogurtStolen: state.yogurtStolen
  };
}

function activityResult(ok, state, effects, reason, active, completed) {
  return {
    ok: ok,
    state: state,
    effects: effects,
    reason: reason,
    variant: active ? active.variant : null,
    rate: active ? active.rate : 0,
    remaining: active ? active.remainingSeconds : 0,
    completed: completed,
    countAsBaseActivity: active ? active.countAsBaseActivity : false
  };
}

function activityRefusal(state, reason, active) {
  return activityResult(false, state, [], reason, active || null, false);
}

function startActivityVariant(state, context, variant) {
  if (!activitiesStateIsValid(state)) return activityRefusal(state, 'state_invalid');
  if (!context || typeof context !== 'object') return activityRefusal(state, 'context_missing');
  if (typeof context.shiftId !== 'string' || !context.shiftId ||
      typeof context.paused !== 'boolean' || typeof context.shiftEnded !== 'boolean') {
    return activityRefusal(state, 'context_missing');
  }
  if (!Object.prototype.hasOwnProperty.call(ACTIVITY_VARIANTS, variant)) return activityRefusal(state, 'variant_invalid');
  if (state.shiftId && state.shiftId !== context.shiftId) return activityRefusal(state, 'shift_mismatch');
  if (state.active) return activityRefusal(state, 'busy', state.active);
  if (context.paused) return activityRefusal(state, 'paused');
  if (context.shiftEnded) return activityRefusal(state, 'shift_ended');

  if (variant === 'smoke-listening') {
    if (typeof context.dayIndex !== 'number' || !Number.isInteger(context.dayIndex)) return activityRefusal(state, 'context_missing');
    if (context.dayIndex < 1) return activityRefusal(state, 'locked');
    if (context.ordinarySmokeCompleted !== true) return activityRefusal(state, 'smoke_not_completed');
    if (state.listeningCompleted || state.intelGranted) return activityRefusal(state, 'already_listened');
  }
  if (variant === 'youtube-quiet' || variant === 'youtube-loud') {
    if (typeof context.internetAvailable !== 'boolean') return activityRefusal(state, 'context_missing');
    if (!context.internetAvailable) return activityRefusal(state, 'internet_unavailable');
  }
  if (variant === 'fridge-yogurt') {
    if (typeof context.ownerAvailable !== 'boolean' || typeof context.storyAvailable !== 'boolean') {
      return activityRefusal(state, 'context_missing');
    }
    if (!context.ownerAvailable) return activityRefusal(state, 'owner_unavailable');
    if (!context.storyAvailable) return activityRefusal(state, 'story_unavailable');
    if (state.yogurtStolen) return activityRefusal(state, 'yogurt_already_stolen');
  }

  const definition = ACTIVITY_VARIANTS[variant];
  const next = cloneActivities(state);
  const attemptId = next.nextAttemptId;
  next.shiftId = context.shiftId;
  next.nextAttemptId += 1;
  next.active = {
    variant: variant,
    sourceId: context.shiftId + ':activity:' + attemptId,
    durationSeconds: definition.durationSeconds,
    elapsedSeconds: 0,
    remainingSeconds: definition.durationSeconds,
    rate: definition.rate,
    countAsBaseActivity: definition.countAsBaseActivity,
    noiseTriggered: false
  };
  return activityResult(true, next, [], null, next.active, false);
}

function activityNoiseEffects(active, context) {
  const nearBoss = context.bossDistance <= 220;
  if (!nearBoss) return [];
  const routeable = ACTIVITY_BOSS_ROUTE_STATES.includes(context.bossState) && context.bossRouteAvailable;
  if (routeable) {
    return [{
      id: active.sourceId + ':noise',
      type: 'requestBossRoute',
      targetId: 'server',
      reasonId: 'youtube_loud'
    }];
  }
  return [{
    id: active.sourceId + ':noise',
    type: 'message',
    lineId: 'youtubeNoiseBlocked',
    ownerId: 'boss'
  }];
}

function finishActivityVariant(state, reason) {
  if (!activitiesStateIsValid(state)) return activityRefusal(state, 'state_invalid');
  if (!state.active) return activityRefusal(state, 'not_active');
  if (reason !== 'done' && reason !== 'cancel' && reason !== 'shift_ended') {
    return activityRefusal(state, 'reason_invalid', state.active);
  }
  if (reason === 'done' && state.active.remainingSeconds > 0) {
    return activityRefusal(state, 'not_complete', state.active);
  }

  const active = state.active;
  const next = cloneActivities(state);
  const completed = reason === 'done';
  const effects = [];
  if (completed) {
    if (active.variant === 'smoke-listening') {
      next.listeningCompleted = true;
      if (!next.intelGranted) {
        next.intelGranted = true;
        effects.push({
          id: active.sourceId + ':intel',
          type: 'grantIntel',
          seconds: 20,
          combine: 'max'
        });
      }
    } else if (active.variant === 'youtube-quiet' || active.variant === 'youtube-loud') {
      effects.push({
        id: active.sourceId + ':videos',
        type: 'countCompleted',
        statId: 'videos',
        sourceId: active.sourceId
      });
    } else if (active.variant === 'fridge-own' || active.variant === 'fridge-yogurt') {
      effects.push({
        id: active.sourceId + ':fridge',
        type: 'countCompleted',
        statId: 'fridge',
        sourceId: active.sourceId
      });
      if (active.variant === 'fridge-yogurt') {
        next.yogurtStolen = true;
        effects.push({
          id: active.sourceId + ':story',
          type: 'startStory',
          storyId: 'yogurt',
          sourceId: active.sourceId
        });
      }
    }
  }
  next.active = null;
  return activityResult(true, next, effects, null, active, completed);
}

function cancelActivityVariant(state, reason) {
  return finishActivityVariant(state, reason || 'cancel');
}

function tickActivityVariant(state, dt, context) {
  if (!activitiesStateIsValid(state)) return activityRefusal(state, 'state_invalid');
  if (!Number.isFinite(dt) || dt < 0) return activityRefusal(state, 'dt_invalid', state.active);
  if (!context || typeof context !== 'object' ||
      typeof context.paused !== 'boolean' || typeof context.shiftEnded !== 'boolean') {
    return activityRefusal(state, 'context_missing', state.active);
  }
  if (!state.active) return activityRefusal(state, 'not_active');
  if (context.paused) return activityResult(true, state, [], null, state.active, false);
  if (context.shiftEnded) return finishActivityVariant(state, 'shift_ended');

  const active = state.active;
  const elapsedSeconds = Math.min(active.durationSeconds, active.elapsedSeconds + dt);
  const remainingSeconds = Math.max(0, active.durationSeconds - elapsedSeconds);
  const next = cloneActivities(state);
  next.active.elapsedSeconds = elapsedSeconds;
  next.active.remainingSeconds = remainingSeconds;
  const effects = [];

  if (active.variant === 'youtube-loud' && !active.noiseTriggered &&
      active.elapsedSeconds < 3 && elapsedSeconds >= 3) {
    if (typeof context.bossState !== 'string' ||
        !Number.isFinite(context.bossDistance) || context.bossDistance < 0 ||
        typeof context.bossRouteAvailable !== 'boolean') {
      return activityRefusal(state, 'context_missing', state.active);
    }
    next.active.noiseTriggered = true;
    effects.push.apply(effects, activityNoiseEffects(active, context));
  }

  if (remainingSeconds <= 0) {
    const finished = finishActivityVariant(next, 'done');
    return activityResult(
      finished.ok,
      finished.state,
      effects.concat(finished.effects),
      finished.reason,
      active,
      finished.completed
    );
  }
  return activityResult(true, next, effects, null, next.active, false);
}

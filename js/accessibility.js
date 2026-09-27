function resolveReducedEffects(savedBooleanOrNull, mediaPreferenceBoolean) {
  if (savedBooleanOrNull === true || savedBooleanOrNull === false) return savedBooleanOrNull;
  return mediaPreferenceBoolean === true;
}

function getEffectPresentation(reduced, effects) {
  if (typeof reduced !== 'boolean' || !effects || typeof effects !== 'object' || Array.isArray(effects)) {
    return {
      ok: false,
      reason: 'invalid_effect_context',
      shake: 0,
      flash: 0,
      dangerLevel: 0,
      dangerAlpha: 0,
      dangerPulse: false,
      staticWarning: false,
    };
  }
  const shake = typeof effects.shake === 'number' && Number.isFinite(effects.shake) ? Math.max(0, effects.shake) : 0;
  const flash = typeof effects.flash === 'number' && Number.isFinite(effects.flash) ? Math.max(0, effects.flash) : 0;
  const dangerValue = typeof effects.danger === 'number' && Number.isFinite(effects.danger) ? effects.danger : 0;
  const dangerLevel = Math.max(0, Math.min(1, dangerValue));
  return {
    ok: true,
    reason: null,
    shake: reduced ? 0 : shake,
    flash: reduced ? 0 : flash,
    dangerLevel,
    dangerAlpha: dangerLevel * 0.35,
    dangerPulse: !reduced,
    staticWarning: dangerLevel >= 0.05,
  };
}

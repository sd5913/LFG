export const GUARD_CONFUSION_MS = 3000;

// Both NPCs feed one HUD meter. Use the stronger alert rate when both are active.
export function galleryAlertRate(guards) {
  if (guards.some(guard => guard.mode === 'confused')) return 0;
  const chasing = guards.filter(guard => guard.mode === 'chase');
  return chasing.length ? Math.max(...chasing.map(guard => guard.profile.alertRate)) : -7;
}

export function afterSuccessfulPose(resumeState) {
  if (!resumeState) return resumeState;
  const guards = resumeState.guards ?? (resumeState.guard ? [{ ...resumeState.guard, id: 'gallery' }] : []);
  return {
    ...resumeState,
    guards: guards.map(guard => guard.mode === 'chase'
      ? { ...guard, mode: 'confused', confusionRemaining: GUARD_CONFUSION_MS }
      : guard),
  };
}

const GUARD_ENTRY_DELAY = 3;
const GUARD_SPEED = 198;
const GUARD_START_DISTANCE = 82;
const GUARD_CATCH_DISTANCE = 72;
const GUARD_REARM_DISTANCE = 96;
const GUARD_RECOVERY_SECONDS = 2.8;
export const STAGGER_CATCH_LIMIT = 2;

export function advanceStreetChase(guard, playerX, elapsed, delta) {
  if (guard.x === null) {
    if (elapsed < GUARD_ENTRY_DELAY) return;
    guard.x = playerX - GUARD_START_DISTANCE;
  }

  if (guard.recovering) {
    if (elapsed < guard.recoveryUntil || playerX - guard.x < GUARD_REARM_DISTANCE) return;
    guard.recovering = false;
  }

  const contactX = playerX - GUARD_CATCH_DISTANCE;
  guard.x = Math.min(guard.x + GUARD_SPEED * delta, contactX);
  if (guard.x < contactX) return;

  guard.catches += 1;
  guard.recovering = true;
  guard.recoveryUntil = elapsed + GUARD_RECOVERY_SECONDS;
}

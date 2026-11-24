import { STREET_PLAYER_SPAWN } from './street-route.js';

const GUARD_ENTRY_DELAY = 3;
// Keep the pace above the player's while leaving time to reach the van.
const GUARD_SPEED = 187;
const GUARD_CATCH_DISTANCE = 60;
const GUARD_BODY_HEIGHT = 96;
const GUARD_STUN_SECONDS = 3;
export const STREET_MAX_ALERT = 100;
const CHALLENGE_LOSS_ALERT = 50;
const OBSTACLE_HIT_ALERT = 30;
const OBSTACLE_RECOVERY_SECONDS = 2;

function raiseStreetAlert(runtime, amount) {
  runtime.alertLevel = Math.min(STREET_MAX_ALERT, runtime.alertLevel + amount);
}

export function stunStreetGuard(guard, elapsed) {
  guard.stunnedUntil = elapsed + GUARD_STUN_SECONDS;
}

export function settleStreetChallenge(runtime, outcome) {
  if (runtime.phase !== 'challenge' || (outcome !== 'win' && outcome !== 'lose')) return false;

  if (outcome === 'lose') {
    raiseStreetAlert(runtime, CHALLENGE_LOSS_ALERT);
  }
  runtime.lastChallengeOutcome = outcome;
  if (runtime.alertLevel >= STREET_MAX_ALERT) {
    runtime.phase = 'arrested';
  } else {
    // Give the player time to leave contact range before another challenge.
    stunStreetGuard(runtime.guard, runtime.elapsed);
    runtime.phase = 'running';
  }
  return true;
}

export function advanceStreetChase(guard, playerX, playerHeight, elapsed, waitAtContact = false) {
  const moveFrom = Math.max(GUARD_ENTRY_DELAY, guard.stunnedUntil ?? 0, guard.lastUpdated ?? 0);
  if (elapsed < moveFrom) return false;

  const fromX = guard.x ?? STREET_PLAYER_SPAWN;
  const nextX = fromX + (elapsed - moveFrom) * GUARD_SPEED;
  const nearEdge = playerX - GUARD_CATCH_DISTANCE;
  const farEdge = playerX + GUARD_CATCH_DISTANCE;
  guard.lastUpdated = elapsed;

  if (waitAtContact && fromX <= farEdge && nextX >= nearEdge) {
    // Stay beside the player until the recovery animation is over.
    guard.x = Math.max(fromX, nearEdge);
    return true;
  }

  guard.x = nextX;
  return nextX >= nearEdge && nextX <= farEdge && playerHeight < GUARD_BODY_HEIGHT;
}

export function recoverFromStreetObstacle(runtime, collision) {
  raiseStreetAlert(runtime, OBSTACLE_HIT_ALERT);
  runtime.hitObstacle = collision;
  runtime.recoveryUntil = runtime.elapsed + OBSTACLE_RECOVERY_SECONDS;
  runtime.y = 0;
  runtime.jump = null;
  runtime.crouching = false;
  runtime.phase = 'recovering';
}

export function advanceStreetPursuit(runtime) {
  const recovering = runtime.phase === 'recovering';
  const caught = advanceStreetChase(runtime.guard, runtime.x, -runtime.y, runtime.elapsed, recovering);
  if (recovering) {
    if (runtime.elapsed < runtime.recoveryUntil) return;

    if (runtime.alertLevel >= STREET_MAX_ALERT) runtime.phase = 'arrested';
    else runtime.phase = caught ? 'challenge' : 'running';
  } else if (caught) {
    runtime.phase = 'challenge';
  }
}

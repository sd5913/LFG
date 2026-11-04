/**
 * Grounded foreground-guard patrol (pure game logic, reusable in Phaser).
 * The thief, statues and guard share the same museum floor baseline.
 * Rendering order is responsible for making the thief appear behind exhibits
 * and the guard appear IN FRONT of exhibits.
 */
export const PATROL = Object.freeze({
  groundY: 460,
  startX: 105,
  endX: 885,
  speedPxPerSecond: 67,
  flashlightHandOffsetX: 34,
  flashlightHandOffsetY: -57,
  // Aim at the thief's upper torso, not their feet.
  targetTorsoHeight: 42,
});

/** Returns feet position, facing and actual flashlight origin in screen pixels. */
export function getGroundPatrol(timeSeconds, playerX, focus = false, settings = PATROL) {
  const span = settings.endX - settings.startX;
  const traveled = ((Math.max(0, timeSeconds) * settings.speedPxPerSecond) % (span * 2));
  const patrolFacing = traveled <= span ? 1 : -1;
  const x = traveled <= span ? settings.startX + traveled : settings.endX - (traveled - span);
  // The test shortcut can make the guard turn toward the thief; patrol still moves.
  const facing = focus ? (playerX >= x ? 1 : -1) : patrolFacing;
  const origin = { x: x + facing * settings.flashlightHandOffsetX,
    y: settings.groundY + settings.flashlightHandOffsetY };
  // A gently bobbing *horizontal* beam, not a cone from the ceiling.
  const angle = focus
    ? Math.atan2(settings.groundY - settings.targetTorsoHeight - origin.y, playerX - origin.x)
    : (facing === 1 ? 0 : Math.PI) + 0.095 * Math.sin(timeSeconds * 1.6);
  return { x, feetY: settings.groundY, facing, origin, angle, focused: focus };
}

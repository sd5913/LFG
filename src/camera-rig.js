/**
 * LFG - fixed museum security camera rig.
 * Pure math module shared with the stand-alone Canvas demo and future Phaser Scene.
 */
export const CAMERA_CONFIG = Object.freeze({
  pivotX: 563,
  pivotY: 106,
  beamRange: 500,
  beamHalfAngle: 0.255, // total field of view ~29 degrees
  sweepCenter: Math.PI / 2,
  sweepAmplitude: 0.71,
  sweepRate: 0.67, // radians / second inside the sine function
  releaseCooldownSeconds: 2.0,
});

/** Sweeps naturally left and right without rotating a guard or moving the pivot. */
export function sweepAngle(timeSeconds, config = CAMERA_CONFIG) {
  return config.sweepCenter + config.sweepAmplitude * Math.sin(timeSeconds * config.sweepRate);
}

/** Angle from camera lens to the player's upper body. */
export function angleToPlayer(camera, player) {
  return Math.atan2(player.y - (player.height ?? 70) * 0.53 - camera.y, player.x - camera.x);
}

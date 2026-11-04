/**
 * Museum Heist / Guard scanner logic
 * Pure JavaScript module: no DOM, no Canvas, no Phaser dependency.
 * Coordinates are in game-world pixels. Angle is radians from +X, clockwise on screen.
 * This module is intended for reuse from a future Phaser Scene.
 */
export const SETTINGS = Object.freeze({
  beamRange: 440,
  beamHalfAngle: 0.245,
  warningMs: 3200,
  requiredPoseHoldMs: 1000,
  statueRadius: 112,
});

export function pointInCone(point, origin, angle, range, halfAngle) {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const distSquared = dx * dx + dy * dy;
  if (distSquared > range * range) return false;
  if (distSquared < 1e-8) return true;
  const pointAngle = Math.atan2(dy, dx);
  const normalizedDifference = Math.atan2(Math.sin(pointAngle - angle), Math.cos(pointAngle - angle));
  return Math.abs(normalizedDifference) <= halfAngle;
}

/** Check a handful of points on a player sprite rather than only its centre. */
export function playerInCone(player, origin, angle, range, halfAngle) {
  const { x, y, width = 30, height = 67 } = player; // y = feet position
  const points = [
    { x, y: y - height * 0.62 },
    { x, y: y - height * 0.28 },
    { x: x - width * 0.3, y: y - height * 0.6 },
    { x: x + width * 0.3, y: y - height * 0.6 },
  ];
  return points.some(p => pointInCone(p, origin, angle, range, halfAngle));
}

export function nearestExhibit(x, exhibits) {
  return exhibits.reduce((nearest, exhibit) => {
    return !nearest || Math.abs(x - exhibit.x) < Math.abs(x - nearest.x) ? exhibit : nearest;
  }, null);
}

export class ScanController {
  constructor(options = {}) {
    this.options = { ...SETTINGS, ...options };
    this.reset();
  }

  reset() {
    this.state = 'SAFE';
    this.exposureMs = 0;
    this.poseHoldMs = 0;
    this.disguised = false;
    this.alertCount = 0;
  }

  /**
   * @param {number} deltaMs Frame elapsed time (clamped by the caller)
   * @param {{illuminated:boolean, nearExhibit:boolean, poseMatched:boolean}} input
   * @returns {{state:string, event:string|null, exposureProgress:number, holdProgress:number}}
   */
  update(deltaMs, input) {
    if (this.state === 'ALARM') return this.snapshot(null);
    const dt = Math.min(80, Math.max(0, deltaMs));

    if (!input.illuminated) {
      // Leaving the beam ends this one detection attempt. No carryover between scans.
      this.exposureMs = 0;
      this.poseHoldMs = 0;
      this.disguised = false;
      this.state = 'SAFE';
      return this.snapshot(null);
    }

    if (this.disguised) {
      this.state = 'DISGUISED';
      return this.snapshot(null);
    }

    this.exposureMs += dt;
    if (input.nearExhibit && input.poseMatched) {
      this.poseHoldMs += dt;
      this.state = 'MATCHING';
      if (this.poseHoldMs >= this.options.requiredPoseHoldMs) {
        this.poseHoldMs = this.options.requiredPoseHoldMs;
        this.disguised = true;
        this.state = 'DISGUISED';
        return this.snapshot('disguised');
      }
    } else {
      this.poseHoldMs = 0;
      this.state = 'SCANNING';
    }

    if (this.exposureMs >= this.options.warningMs) {
      this.exposureMs = this.options.warningMs;
      this.state = 'ALARM';
      this.alertCount += 1;
      return this.snapshot('alarm');
    }
    return this.snapshot(null);
  }

  snapshot(event) {
    return {
      state: this.state,
      event,
      exposureProgress: Math.min(1, this.exposureMs / this.options.warningMs),
      holdProgress: Math.min(1, this.poseHoldMs / this.options.requiredPoseHoldMs),
      secondsRemaining: Math.max(0, (this.options.warningMs - this.exposureMs) / 1000),
    };
  }
}

export const STEPS = Object.freeze([
  { id: 'POINT', title: ['伸出食指', 'Raise your index finger'], detail: ['其余手指握起并保持 2 秒', 'Curl the other fingers and hold for 2 seconds'], holdMs: 2000 },
  { id: 'PINCH', title: ['拇指食指捏合', 'Pinch thumb and index finger'], detail: ['让两指靠近，保持稳定 2 秒', 'Bring the fingertips together and hold for 2 seconds'], holdMs: 2000 },
  { id: 'FIST', title: ['握紧拳头', 'Make a fist'], detail: ['五指收拢，保持握拳 2 秒', 'Curl all five fingers and hold for 2 seconds'], holdMs: 2000 },
  { id: 'ROTATE', title: ['握拳旋转', 'Rotate your fist'], detail: ['保持握拳，累计转动 80°', 'Keep your fist closed and rotate a total of 80°'], holdMs: 0 },
]);

export const ROTATION_TARGET_DEGREES = 80;
const ROTATION_TARGET = ROTATION_TARGET_DEGREES * Math.PI / 180;
const ROTATION_DEADBAND = 3 * Math.PI / 180;
const clamp = (value) => Math.max(0, Math.min(1, value));
const angleDelta = (next, previous) => {
  let result = next - previous;
  while (result > Math.PI) result -= Math.PI * 2;
  while (result < -Math.PI) result += Math.PI * 2;
  return result;
};

export class UnlockMachine {
  constructor() { this.reset(); }
  reset() { this.stepIndex = 0; this.unlocked = false; this.clearAttempt(); }
  clearAttempt() { this.holdMs = 0; this.lastTime = null; this.lastMatchedAt = null; this.lastAngle = null; this.rotation = 0; }
  get step() { return STEPS[Math.min(this.stepIndex, STEPS.length - 1)]; }
  snapshot() { return { stepIndex: this.stepIndex, unlocked: this.unlocked, progress: this.unlocked ? 1 : this.stepIndex === 3 ? clamp(Math.abs(this.rotation) / ROTATION_TARGET) : clamp(this.holdMs / this.step.holdMs), rotationDegrees: Math.round(Math.abs(this.rotation) * 180 / Math.PI) }; }
  update({ gesture = 'NONE', angle = null, now = 0 } = {}) {
    if (this.unlocked) return this.snapshot();
    const delta = this.lastTime == null ? 0 : Math.max(0, Math.min(100, now - this.lastTime));
    this.lastTime = now;
    const matching = gesture === (this.stepIndex === 3 ? 'FIST' : this.step.id);
    if (this.stepIndex < 3) {
      if (matching) { this.holdMs += delta; this.lastMatchedAt = now; }
      else if (this.lastMatchedAt == null || now - this.lastMatchedAt > 400) this.holdMs = Math.max(0, this.holdMs - delta * 0.9);
      if (this.holdMs >= this.step.holdMs) {
        this.stepIndex += 1;
        this.holdMs = 0;
        this.lastMatchedAt = null;
        if (this.stepIndex === 3 && Number.isFinite(angle)) this.lastAngle = angle;
      }
    } else if (matching && Number.isFinite(angle)) {
      // Count rotation in either direction. Ignore small landmark jitter while
      // retaining the reference angle so slow deliberate movements still count.
      this.lastAngle ??= angle;
      const movement = Math.abs(angleDelta(angle, this.lastAngle));
      if (movement >= ROTATION_DEADBAND) {
        this.rotation = Math.min(ROTATION_TARGET, this.rotation + movement);
        this.lastAngle = angle;
      }
      if (Math.abs(this.rotation) + 1e-9 >= ROTATION_TARGET) { this.stepIndex = 4; this.unlocked = true; }
    } else {
      // Keep earned progress, but re-anchor on the next recognised fist.
      this.lastAngle = null;
    }
    return this.snapshot();
  }
}

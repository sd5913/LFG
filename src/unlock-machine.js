export const STEPS = Object.freeze([
  { id: 'POINT', title: ['伸出食指', 'Raise your index finger'], detail: ['其余手指握起并保持 2 秒', 'Curl the other fingers and hold for 2 seconds'], holdMs: 2000 },
  { id: 'PINCH', title: ['拇指食指捏合', 'Pinch thumb and index finger'], detail: ['让两指靠近，保持稳定 2 秒', 'Bring the fingertips together and hold for 2 seconds'], holdMs: 2000 },
  { id: 'FIST', title: ['握紧拳头', 'Make a fist'], detail: ['五指收拢，保持握拳 2 秒', 'Curl all five fingers and hold for 2 seconds'], holdMs: 2000 },
  { id: 'ROTATE', title: ['握拳旋转', 'Rotate your fist'], detail: ['保持握拳，缓慢转动手腕', 'Keep your fist closed and slowly rotate your wrist'], holdMs: 0 },
]);

const ROTATION_TARGET = 50 * Math.PI / 180;
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
  clearAttempt() { this.holdMs = 0; this.lastTime = null; this.lastMatchedAt = null; this.lastAngle = null; this.rotation = 0; this.lastRotationAt = null; }
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
      if (this.holdMs >= this.step.holdMs) { this.stepIndex += 1; this.holdMs = 0; this.lastMatchedAt = null; }
    } else if (matching && Number.isFinite(angle)) {
      if (this.lastAngle != null) { const change = angleDelta(angle, this.lastAngle); if (Math.abs(change) < Math.PI / 6) this.rotation += change; }
      this.lastAngle = angle; this.lastRotationAt = now;
      if (Math.abs(this.rotation) >= ROTATION_TARGET) { this.stepIndex = 4; this.unlocked = true; }
    } else if (this.lastRotationAt == null || now - this.lastRotationAt > 350) { this.lastAngle = null; this.rotation = 0; }
    return this.snapshot();
  }
}

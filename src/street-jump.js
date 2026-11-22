import { SHORT_BARRICADE_ART_WIDTH, STREET_SPEED } from './street-route.js';

const SMALL_JUMP_DISTANCE = SHORT_BARRICADE_ART_WIDTH * 1.5;
const SMALL_JUMP_DURATION = SMALL_JUMP_DISTANCE / STREET_SPEED;
const BIG_JUMP_DURATION = 2.25;
const CROUCH_TAP_DURATION = 620;

export function pressStreetCrouch(held, jump, now) {
  held.controlHeld = true;
  if (jump) {
    held.crouchOnLanding = true;
    jump.nextJumpQueued = false;
  } else {
    held.crouchUntil = now + CROUCH_TAP_DURATION;
  }
}

export function allowsStreetJump(held, repeated) {
  return !repeated && !held.controlHeld && !held.crouchOnLanding;
}

export function isStreetCrouching(held, jump, now) {
  if (jump) return false;
  if (held.crouchOnLanding) {
    held.crouchOnLanding = false;
    held.crouchUntil = now + CROUCH_TAP_DURATION;
  }
  return held.controlHeld || now < held.crouchUntil;
}

function startStreetJump(big, duration, height = 0) {
  return {
    big,
    elapsed: 0,
    duration,
    peakHeight: big ? 138 : 85,
    startHeight: height,
  };
}

export function jumpOnSpacePress({ jump, y }) {
  if (!jump) return startStreetJump(false, SMALL_JUMP_DURATION);
  if (jump.big) {
    jump.nextJumpQueued = true;
    return jump;
  }

  // An upgrade extends the current jump, counting time already in the air.
  return startStreetJump(true, BIG_JUMP_DURATION - jump.elapsed, -y);
}

export function advanceStreetJump(jump, delta, moveDirection) {
  const airTime = Math.min(delta, jump.duration - jump.elapsed);
  jump.elapsed += airTime;
  const progress = jump.elapsed / jump.duration;
  return {
    distance: moveDirection * STREET_SPEED * airTime,
    height: (1 - progress) * (jump.startHeight + 4 * jump.peakHeight * progress),
    groundTime: delta - airTime,
    landed: jump.elapsed >= jump.duration,
  };
}

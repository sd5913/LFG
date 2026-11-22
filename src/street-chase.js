import { STREET_PLAYER_SPAWN } from './street-route.js';

const GUARD_ENTRY_DELAY = 5;
// Keep a clean one-minute run possible despite the guard's higher speed.
const GUARD_SPEED = 190;
const GUARD_CATCH_DISTANCE = 60;
const GUARD_BODY_HEIGHT = 96;

export function advanceStreetChase(guard, playerX, playerHeight, elapsed) {
  if (elapsed < GUARD_ENTRY_DELAY) return false;
  guard.x = STREET_PLAYER_SPAWN + (elapsed - GUARD_ENTRY_DELAY) * GUARD_SPEED;
  return Math.abs(guard.x - playerX) <= GUARD_CATCH_DISTANCE && playerHeight < GUARD_BODY_HEIGHT;
}

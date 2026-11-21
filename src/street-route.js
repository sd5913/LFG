export const STREET_SPEED = 180;
// Obstacles appear in the opening view. This is only a short reaction lead,
// not the former 15–20 second unobstructed run.
export const SAFE_LEAD_SECONDS = 3;
export const MODULE_TYPES = Object.freeze({
  EMPTY: 'empty',
  SHORT_JUMP: 'short-jump',
  SHORT_CROUCH: 'short-crouch',
  LONG_JUMP: 'long-jump',
  LONG_CROUCH: 'long-crouch',
});

const hardTypes = new Set([MODULE_TYPES.LONG_JUMP, MODULE_TYPES.LONG_CROUCH]);

export function seededRandom(seed) {
  let state = (Number(seed) >>> 0) || 0x9e3779b9;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function choose(random, entries) {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random() * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return entries.at(-1)[0];
}

function earlyPool() {
  return [[MODULE_TYPES.SHORT_JUMP, 50], [MODULE_TYPES.SHORT_CROUCH, 50]];
}

function middlePool() {
  return [[MODULE_TYPES.SHORT_JUMP, 30], [MODULE_TYPES.SHORT_CROUCH, 30], [MODULE_TYPES.LONG_JUMP, 20], [MODULE_TYPES.LONG_CROUCH, 20]];
}

function latePool() {
  return [[MODULE_TYPES.SHORT_JUMP, 30], [MODULE_TYPES.SHORT_CROUCH, 30], [MODULE_TYPES.LONG_JUMP, 18], [MODULE_TYPES.LONG_CROUCH, 18], [MODULE_TYPES.EMPTY, 4]];
}

function collisionFor(type, x, width) {
  // The source art includes plenty of decorative framing. Gameplay only uses
  // the central hazard, sized to the actual airtime / crouch duration with a
  // little timing forgiveness at both edges.
  if (type === MODULE_TYPES.SHORT_JUMP) return { x: x + width * .46, width: Math.min(82, width * .12), kind: 'barrier' };
  if (type === MODULE_TYPES.LONG_JUMP) return { x: x + width * .45, width: Math.min(116, width * .17), kind: 'gap' };
  if (type === MODULE_TYPES.SHORT_CROUCH) return { x: x + width * .44, width: Math.min(110, width * .16), kind: 'awning' };
  if (type === MODULE_TYPES.LONG_CROUCH) return { x: x + width * .37, width: Math.min(190, width * .28), kind: 'scaffold' };
  return null;
}

/**
 * Builds a single, non-overlapping route. The route stays deterministic for
 * a supplied seed, while callers may use Date.now() for a fresh run.
 */
export function createStreetRoute(seed = Date.now()) {
  const random = seededRandom(seed);
  const moduleCount = 48 + Math.floor(random() * 9); // 48–56 modules
  const safeLead = SAFE_LEAD_SECONDS * STREET_SPEED;
  const modules = [];
  let cursor = safeLead;
  let elapsed = SAFE_LEAD_SECONDS;
  let hardStreak = 0;
  let recoverySlots = 0;

  for (let index = 0; index < moduleCount; index += 1) {
    const recovering = recoverySlots > 0;
    let type;
    let seconds;
    if (recovering) {
      type = MODULE_TYPES.EMPTY;
      seconds = 1.5 + random() * .5;
      recoverySlots -= 1;
      hardStreak = 0;
    } else {
      const pool = elapsed < 60 ? earlyPool() : elapsed < 170 ? middlePool() : latePool();
      type = choose(random, pool);
      if (hardStreak >= 2 && hardTypes.has(type)) type = choose(random, earlyPool());
      // Reserve the final slot for a recoverable obstacle: every long action
      // must leave a clear beat before the getaway van.
      if (index === moduleCount - 1 && hardTypes.has(type)) type = choose(random, earlyPool());
      seconds = 3.7 + random() * 1.25;
      if (hardTypes.has(type)) {
        recoverySlots = 1;
        hardStreak += 1;
      } else hardStreak = 0;
    }
    const width = Math.round(seconds * STREET_SPEED);
    modules.push(Object.freeze({ id: `module-${index}`, index, type, x: cursor, width, seconds, recovery: recovering,
      collision: collisionFor(type, cursor, width) }));
    cursor += width;
    elapsed += seconds;
  }
  const van = Object.freeze({ x: cursor + 520, width: 620, triggerX: cursor + 770 });
  return Object.freeze({ seed: Number(seed) >>> 0, safeLead, modules: Object.freeze(modules), van,
    length: van.triggerX + 320, targetSeconds: Math.round(van.triggerX / STREET_SPEED) });
}

export function validateStreetRoute(route) {
  if (route.modules.length < 36 || route.modules.length > 60) return false;
  if (route.safeLead < 0 || route.safeLead > 3 * STREET_SPEED) return false;
  let previousEnd = route.safeLead;
  let hardStreak = 0;
  for (const module of route.modules) {
    if (module.x < previousEnd) return false;
    previousEnd = module.x + module.width;
    if (hardTypes.has(module.type)) {
      hardStreak += 1;
      if (hardStreak > 2) return false;
      const next = route.modules[module.index + 1];
      if (!next || next.type !== MODULE_TYPES.EMPTY || next.seconds < 1.5 || next.seconds > 2) return false;
    } else hardStreak = 0;
  }
  return true;
}

export const STREET_SPEED = 180;
export const STREET_PLAYER_SPAWN = 268;
export const SHORT_BARRICADE_ART_WIDTH = 168;
// 624 opaque columns in the 1536px source canvas (the rest is padding).
export const SHORT_BARRICADE_VISIBLE_WIDTH = SHORT_BARRICADE_ART_WIDTH * 624 / 1536;
export const ROAD_GAP_ART_WIDTH = 292;
// The road surface ends at columns 780 and 1394 in the 2172px-wide sprite.
export const ROAD_GAP_LEFT_LIP = ROAD_GAP_ART_WIDTH * 780 / 2172;
export const ROAD_GAP_RIGHT_LIP = ROAD_GAP_ART_WIDTH * 1394 / 2172;
const ROAD_GAP_WIDTH = 282;
export const SAFE_LEAD_SECONDS = 2;
export const MODULE_TYPES = Object.freeze({
  SHORT_JUMP: 'short-jump',
  SHORT_CROUCH: 'short-crouch',
  LONG_JUMP: 'long-jump',
  LONG_CROUCH: 'long-crouch',
});

const shortTypes = [MODULE_TYPES.SHORT_JUMP, MODULE_TYPES.SHORT_CROUCH];
const hardTypes = new Set([MODULE_TYPES.LONG_JUMP, MODULE_TYPES.LONG_CROUCH]);
const OBSTACLE_BATCH_COUNT = 3;
const OBSTACLES_PER_BATCH = 6;
const collisionSpecs = {
  [MODULE_TYPES.SHORT_JUMP]: { kind: 'barrier', width: Math.round(SHORT_BARRICADE_VISIBLE_WIDTH * .8) },
  [MODULE_TYPES.LONG_JUMP]: { kind: 'gap', width: ROAD_GAP_WIDTH },
  [MODULE_TYPES.SHORT_CROUCH]: { kind: 'awning', width: 100 },
  [MODULE_TYPES.LONG_CROUCH]: { kind: 'scaffold', width: 190 },
};

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

function shuffle(random, types) {
  const shuffled = [...types];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
  }
  return shuffled;
}

function buildObstacleOrder(random) {
  // Two introductory obstacles, then all four types in every shuffled batch.
  const order = shuffle(random, shortTypes);
  const types = [...shortTypes, ...hardTypes];
  for (let batchIndex = 0; batchIndex < OBSTACLE_BATCH_COUNT; batchIndex += 1) {
    const batch = shuffle(random, batchIndex === 0 ? types : [...types, ...shortTypes]);
    const previous = order.at(-1);
    if (batch[0] === previous || (hardTypes.has(previous) && hardTypes.has(batch[0]))) {
      const next = batch.findIndex((type) => shortTypes.includes(type) && type !== previous);
      [batch[0], batch[next]] = [batch[next], batch[0]];
    }
    order.push(...batch);
  }
  return order;
}

/**
 * Builds a single, non-overlapping route. The route stays deterministic for
 * a supplied seed, while callers may use Date.now() for a fresh run.
 */
export function createStreetRoute(seed = Date.now()) {
  const random = seededRandom(seed);
  const safeLead = SAFE_LEAD_SECONDS * STREET_SPEED;
  let cursor = safeLead;

  const modules = buildObstacleOrder(random).map((type, index) => {
    // Keep the landing runway inside each long module, then start the next obstacle.
    const hard = hardTypes.has(type);
    const seconds = hard ? 3.55 + random() * .3 : 2.65 + random() * .5;
    const width = Math.round(seconds * STREET_SPEED);
    const spec = collisionSpecs[type];
    const centerOffset = Math.round(width * .4 - spec.width / 2);
    const collisionOffset = hard
      ? Math.max(width - spec.width - 2 * STREET_SPEED, Math.min(centerOffset, width - spec.width - 1.5 * STREET_SPEED))
      : centerOffset;
    const collision = Object.freeze({ ...spec, x: cursor + collisionOffset });
    const module = Object.freeze({ id: `module-${index}`, index, type, x: cursor, width, seconds: width / STREET_SPEED, collision });
    cursor += width;
    return module;
  });
  const van = Object.freeze({ x: cursor + 520, width: 620, triggerX: cursor + 770 });
  return Object.freeze({ seed: Number(seed) >>> 0, safeLead, modules: Object.freeze(modules), van,
    length: van.triggerX + 320, targetSeconds: Math.round((van.triggerX - STREET_PLAYER_SPAWN) / STREET_SPEED) });
}

export function validateStreetRoute(route) {
  if (route.modules.length !== OBSTACLE_BATCH_COUNT * OBSTACLES_PER_BATCH) return false;
  if (route.safeLead < 0 || route.safeLead > SAFE_LEAD_SECONDS * STREET_SPEED) return false;
  let previousEnd = route.safeLead;
  let hardStreak = 0;
  for (const module of route.modules) {
    if (module.x < previousEnd) return false;
    previousEnd = module.x + module.width;
    if (hardTypes.has(module.type)) {
      hardStreak += 1;
      if (hardStreak > 2) return false;
      const runway = previousEnd - (module.collision.x + module.collision.width);
      if (runway < 1.5 * STREET_SPEED || runway > 2 * STREET_SPEED) return false;
    } else hardStreak = 0;
  }
  return true;
}

export function fallsIntoStreetGap(gap, groundStartX, endX, airborne) {
  return !airborne && Math.max(groundStartX, endX) > gap.x && Math.min(groundStartX, endX) < gap.x + gap.width;
}

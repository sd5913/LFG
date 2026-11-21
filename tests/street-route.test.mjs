import assert from 'node:assert/strict';
import test from 'node:test';
import { MODULE_TYPES, SAFE_LEAD_SECONDS, STREET_SPEED, createStreetRoute, validateStreetRoute } from '../src/street-route.js';

test('street escape route is deterministic, valid, and lasts three to five minutes', () => {
  for (const seed of [1, 42, 5913, 20261119, 0xffffffff]) {
    const route = createStreetRoute(seed);
    assert.deepEqual(route, createStreetRoute(seed));
    assert.equal(validateStreetRoute(route), true);
    assert.ok(route.targetSeconds >= 180 && route.targetSeconds <= 300, `seed ${seed}: ${route.targetSeconds}s`);
    assert.equal(route.safeLead, SAFE_LEAD_SECONDS * STREET_SPEED);
  }
});

test('the first minute contains only short movement challenges', () => {
  const route = createStreetRoute(606);
  let elapsed = SAFE_LEAD_SECONDS;
  for (const module of route.modules) {
    if (elapsed < 60) {
      assert.notEqual(module.type, MODULE_TYPES.LONG_JUMP);
      assert.notEqual(module.type, MODULE_TYPES.LONG_CROUCH);
    }
    elapsed += module.seconds;
  }
});

test('each long challenge has a clear 1.5–2 second recovery module', () => {
  const route = createStreetRoute(911);
  route.modules.forEach((module, index) => {
    if (module.type !== MODULE_TYPES.LONG_JUMP && module.type !== MODULE_TYPES.LONG_CROUCH) return;
    const recovery = route.modules[index + 1];
    assert.equal(recovery.type, MODULE_TYPES.EMPTY);
    assert.ok(recovery.seconds >= 1.5 && recovery.seconds <= 2);
  });
});

test('every obstacle uses a compact central collision zone', () => {
  const maximumCollisionRatio = {
    [MODULE_TYPES.SHORT_JUMP]: .12,
    [MODULE_TYPES.LONG_JUMP]: .17,
    [MODULE_TYPES.SHORT_CROUCH]: .16,
    [MODULE_TYPES.LONG_CROUCH]: .28,
  };

  for (const seed of [12, 404, 5913]) {
    const route = createStreetRoute(seed);
    for (const module of route.modules) {
      if (!module.collision) continue;
      const { collision } = module;
      assert.ok(collision.x >= module.x, `${module.type}: collision starts before its art`);
      assert.ok(collision.x + collision.width <= module.x + module.width, `${module.type}: collision exceeds its art`);
      assert.ok(collision.width / module.width <= maximumCollisionRatio[module.type] + Number.EPSILON,
        `${module.type}: collision area is wider than its tuned action window`);
    }
  }
});

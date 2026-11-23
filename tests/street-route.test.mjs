import assert from 'node:assert/strict';
import test from 'node:test';
import { MODULE_TYPES, SAFE_LEAD_SECONDS, SHORT_BARRICADE_ART_WIDTH, STREET_PLAYER_SPAWN, STREET_SPEED, createStreetRoute, fallsIntoStreetGap, validateStreetRoute } from '../src/street-route.js';
import { advanceStreetJump, allowsStreetJump, isStreetCrouching, jumpOnSpacePress, pressStreetCrouch } from '../src/street-jump.js';
import { advanceStreetChase } from '../src/street-chase.js';

test('a gap only fails grounded travel or a landing inside its opening', () => {
  const { collision: gap } = createStreetRoute(1).modules.find(({ type }) => type === MODULE_TYPES.LONG_JUMP);
  const left = gap.x;
  const right = left + gap.width;
  const middle = (left + right) / 2;
  assert.equal(fallsIntoStreetGap(gap, left - 10, left, false), false);
  assert.equal(fallsIntoStreetGap(gap, right, right + 10, false), false);
  assert.equal(fallsIntoStreetGap(gap, left, middle, true), false);
  assert.equal(fallsIntoStreetGap(gap, middle, right + 10, true), false);
  assert.equal(fallsIntoStreetGap(gap, middle, middle, false), true);
  assert.equal(fallsIntoStreetGap(gap, left - 10, right + 10, false), true);
  assert.equal(fallsIntoStreetGap(gap, right + 10, left - 10, false), true);
});

test('a small jump from the lip lands in the widened pit, while a lower double-tap jump clears it', () => {
  const { collision: gap } = createStreetRoute(5913).modules.find(({ type }) => type === MODULE_TYPES.LONG_JUMP);
  const farLip = gap.x + gap.width;
  const small = jumpOnSpacePress({ jump: null, y: 0 });
  const shortLanding = gap.x + advanceStreetJump(small, small.duration, 1).distance;
  assert.ok(fallsIntoStreetGap(gap, shortLanding, shortLanding, false));

  const takeoff = gap.x - 75;
  const player = { jump: jumpOnSpacePress({ jump: null, y: 0 }), y: 0 };
  const firstTap = advanceStreetJump(player.jump, .12, 1);
  player.y = -firstTap.height;
  const big = jumpOnSpacePress(player);
  assert.equal(big.big, true);
  const halfJump = advanceStreetJump(big, big.duration / 2, 1);
  const secondHalf = advanceStreetJump(big, big.duration / 2, 1);
  const longLanding = takeoff + firstTap.distance + halfJump.distance + secondHalf.distance;
  assert.ok(halfJump.height > 85 && halfJump.height < 175);
  assert.ok(longLanding > farLip);
  assert.equal(fallsIntoStreetGap(gap, longLanding, longLanding, false), false);
});

test('a second tap after 450 ms clears the gap and lands before the following obstacle in either direction', () => {
  const gap = { kind: 'gap', x: 600, width: 282 };
  const before = { kind: 'barrier', x: 300, width: 55 };
  const after = { kind: 'awning', x: 1180, width: 100 };
  for (const [direction, takeoff] of [[1, gap.x], [-1, gap.x + gap.width]]) {
    const player = { jump: null, y: 0 };
    player.jump = jumpOnSpacePress(player);
    assert.equal(player.jump.big, false);
    const smallStep = advanceStreetJump(player.jump, .45, direction);
    player.y = -smallStep.height;
    const big = jumpOnSpacePress(player);
    assert.equal(big.big, true);
    const landing = takeoff + smallStep.distance + advanceStreetJump(big, big.duration, direction).distance;
    if (direction > 0) assert.ok(landing >= gap.x + gap.width && landing < after.x);
    else assert.ok(landing <= gap.x && landing > before.x + before.width);
  }
});

test('Space can upgrade a small jump until landing and rapid taps queue only one follow-up', () => {
  const player = { jump: null, y: 0 };
  player.jump = jumpOnSpacePress(player);
  const descending = advanceStreetJump(player.jump, 1.35, 1);
  assert.equal(descending.landed, false);
  player.y = -descending.height;
  player.jump = jumpOnSpacePress(player);
  assert.equal(player.jump.big, true);
  advanceStreetJump(player.jump, .1, 1);

  const activeJump = player.jump;
  for (let tap = 0; tap < 5; tap += 1) {
    assert.equal(jumpOnSpacePress(player), activeJump);
  }
  assert.equal(activeJump.elapsed, .1);
  assert.equal(activeJump.nextJumpQueued, true);
});

test('holding Space counts as one press even after landing', () => {
  const held = { controlHeld: false, crouchOnLanding: false };
  const player = { jump: null, y: 0 };
  const keyDown = (repeated) => {
    if (allowsStreetJump(held, repeated)) player.jump = jumpOnSpacePress(player);
  };

  keyDown(false);
  player.y = -advanceStreetJump(player.jump, .5, 1).height;
  keyDown(true);
  assert.equal(player.jump.big, false);
  assert.equal(advanceStreetJump(player.jump, player.jump.duration, 1).landed, true);
  player.jump = null;
  player.y = 0;
  keyDown(true);
  assert.equal(player.jump, null);

  keyDown(false);
  keyDown(false);
  assert.equal(player.jump.big, true);
  keyDown(true);
  assert.equal(player.jump.nextJumpQueued, undefined);
});

test('a midair crouch tap replaces a queued rebound and takes effect after landing', () => {
  const held = { controlHeld: false, crouchOnLanding: false, crouchUntil: 0 };
  const player = { jump: jumpOnSpacePress({ jump: null, y: 0 }), y: 0 };
  player.jump = jumpOnSpacePress(player);
  jumpOnSpacePress(player);
  assert.equal(player.jump.nextJumpQueued, true);

  pressStreetCrouch(held, player.jump, 1000);
  assert.equal(player.jump.nextJumpQueued, false);
  assert.equal(allowsStreetJump(held, false), false);
  held.controlHeld = false;
  assert.equal(allowsStreetJump(held, true), false);
  assert.equal(isStreetCrouching(held, player.jump, 1900), false);
  assert.equal(isStreetCrouching(held, null, 2000), true);
  assert.equal(isStreetCrouching(held, null, 2619), true);
  assert.equal(isStreetCrouching(held, null, 2620), false);
  assert.equal(allowsStreetJump(held, true), false);
  assert.equal(allowsStreetJump(held, false), true);
});

test('the guard leaves the shared starting point after three seconds and catches on first contact', () => {
  const guard = { x: null };
  const stoppedPlayer = STREET_PLAYER_SPAWN + STREET_SPEED;
  assert.equal(advanceStreetChase(guard, stoppedPlayer, 0, 2.999), false);
  assert.equal(guard.x, null);
  assert.equal(advanceStreetChase(guard, stoppedPlayer, 0, 3), false);
  assert.equal(guard.x, STREET_PLAYER_SPAWN);
  assert.equal(advanceStreetChase(guard, stoppedPlayer, 0, 3.6), false);
  assert.equal(advanceStreetChase(guard, stoppedPlayer, 138, 3.7), false);
  assert.equal(advanceStreetChase(guard, stoppedPlayer, 0, 3.7), true);
});

test('continuous movement can reach the van before the guard makes contact', () => {
  for (const seed of [1, 42, 5913, 20261119, 0xffffffff]) {
    const route = createStreetRoute(seed);
    const guard = { x: null };
    const duration = (route.van.triggerX - STREET_PLAYER_SPAWN) / STREET_SPEED;
    for (let elapsed = 0; elapsed <= duration; elapsed += 1 / 60) {
      const playerX = STREET_PLAYER_SPAWN + STREET_SPEED * elapsed;
      assert.equal(advanceStreetChase(guard, playerX, 0, elapsed), false);
    }
    assert.equal(advanceStreetChase(guard, route.van.triggerX, 0, duration), false);
  }
});

test('air movement follows A/D at the ground speed and small jump range remains 1.5 barriers', () => {
  for (const delta of [1 / 120, 1 / 60, .05]) {
    for (const direction of [1, 0, -1]) {
      const jump = jumpOnSpacePress({ jump: null, y: 0 });
      let distance = 0;
      let step;
      do {
        step = advanceStreetJump(jump, delta, direction);
        distance += step.distance;
      } while (!step.landed);
      assert.ok(Math.abs(distance - direction * 1.5 * SHORT_BARRICADE_ART_WIDTH) < 1e-9);
      assert.equal(step.height, 0);
      assert.ok(step.groundTime >= 0 && step.groundTime < delta);
    }
  }

  const small = jumpOnSpacePress({ jump: null, y: 0 });
  const step = advanceStreetJump(small, .2, 1);
  assert.equal(step.distance, STREET_SPEED * .2);
  const big = jumpOnSpacePress({ jump: small, y: -step.height });
  assert.equal(advanceStreetJump(big, .2, 1).distance, STREET_SPEED * .2);
  assert.equal(advanceStreetJump(big, .2, 0).distance, 0);
  assert.equal(advanceStreetJump(big, .2, -1).distance, -STREET_SPEED * .2);
});

test('street escape route is deterministic and takes about a minute at the same ground and air speed', () => {
  for (const seed of [1, 42, 5913, 20261119, 0xffffffff]) {
    const route = createStreetRoute(seed);
    assert.deepEqual(route, createStreetRoute(seed));
    assert.equal(validateStreetRoute(route), true);
    assert.equal(route.safeLead, SAFE_LEAD_SECONDS * STREET_SPEED);
    const runSeconds = (route.van.triggerX - STREET_PLAYER_SPAWN) / STREET_SPEED;
    assert.ok(runSeconds >= 55 && runSeconds <= 65, `seed ${seed}: ${runSeconds}s`);
  }
});

test('opening routes mix all four obstacles within the first six and vary between seeds', () => {
  const openers = new Set();
  for (let seed = 1; seed <= 128; seed += 1) {
    const route = createStreetRoute(seed);
    assert.ok(validateStreetRoute(route));
    const opening = route.modules.slice(0, 6).map(({ type }) => type);
    assert.equal(new Set(opening).size, 4);
    openers.add(opening.join(','));
    for (let index = 6; index < route.modules.length; index += 6) {
      assert.equal(new Set(route.modules.slice(index, index + 6).map(({ type }) => type)).size, 4);
    }
  }
  assert.ok(openers.size >= 20);
});

test('obstacles have tighter spacing with recovery runway after long challenges', () => {
  for (const seed of [1, 12, 404, 911, 5913]) {
    const route = createStreetRoute(seed);
    for (const [index, module] of route.modules.entries()) {
      const { collision, type } = module;
      const collisionEnd = collision.x + collision.width;
      assert.ok(collision.x >= module.x, `${module.type}: collision starts before its art`);
      assert.ok(collisionEnd <= module.x + module.width, `${module.type}: collision exceeds its art`);
      const long = type === MODULE_TYPES.LONG_JUMP || type === MODULE_TYPES.LONG_CROUCH;
      if (long) {
        const runway = (module.x + module.width - collisionEnd) / STREET_SPEED;
        assert.ok(runway >= 1.5 && runway <= 2);
      }
      const next = route.modules[index + 1];
      if (next) {
        const gap = (next.collision.x - collisionEnd) / STREET_SPEED;
        assert.ok(gap >= 1.5 && gap <= 3.4, `${type} to ${next.type}: ${gap}s without obstacles`);
      }
    }
  }
});

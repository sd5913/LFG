import assert from 'node:assert/strict';
import test from 'node:test';
import { MODULE_TYPES, SAFE_LEAD_SECONDS, SHORT_BARRICADE_ART_WIDTH, STREET_PLAYER_SPAWN, STREET_SPEED, createStreetRoute, fallsIntoStreetGap, validateStreetRoute } from '../src/street-route.js';
import { advanceStreetJump, jumpOnSpacePress } from '../src/street-jump.js';
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

test('the slower guard catches a continuous runner twice in one minute', () => {
  const guard = { x: null, catches: 0, recovering: false, recoveryUntil: 0 };
  for (let frame = 1; frame <= 60 * 60; frame += 1) {
    const elapsed = frame / 60;
    advanceStreetChase(guard, STREET_PLAYER_SPAWN + STREET_SPEED * elapsed, elapsed, 1 / 60);
  }
  assert.equal(guard.catches, 2);
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

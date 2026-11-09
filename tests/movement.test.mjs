import test from 'node:test';
import assert from 'node:assert/strict';
import {movementIntent} from '../src/game/movement.js';
import {BACKGROUND, GAME, HUD_HEIGHT, OBSTACLES, PLAYER, PLAYER_ART, ROOM_SCALE, WALKABLE} from '../src/game/config.js';

test('all cardinal and diagonal combinations retain the same configured speed', () => {
  for (const codes of [['KeyW'],['KeyS'],['KeyA'],['KeyD'],['KeyW','KeyA'],['KeyW','KeyD'],['KeyS','KeyA'],['KeyS','KeyD']]) {
    const move = movementIntent(new Set(codes), codes, PLAYER.speed, 'down');
    assert.ok(Math.abs(Math.hypot(move.vx, move.vy) - PLAYER.speed) < 1e-9);
  }
});

test('idle and opposed directions stop, preserve facing, and do not create NaNs', () => {
  for (const codes of [[],['KeyW','KeyS'],['KeyA','KeyD'],['KeyW','KeyS','KeyA','KeyD']]) {
    assert.deepEqual(movementIntent(new Set(codes), codes, PLAYER.speed, 'left'), {vx:0,vy:0,facing:'left'});
  }
});

test('the most recently pressed surviving direction controls diagonal facing', () => {
  assert.equal(movementIntent(new Set(['KeyW','KeyD']), ['KeyW','KeyD'], 100, 'left').facing, 'right');
  assert.equal(movementIntent(new Set(['KeyW','KeyD']), ['KeyD','KeyW'], 100, 'left').facing, 'up');
  assert.equal(movementIntent(new Set(['KeyW','KeyS','KeyD']), ['KeyD','KeyW','KeyS'], 100, 'left').facing, 'right');
});

test('arrow aliases do not double speed or cancel matching WASD input', () => {
  const move = movementIntent(new Set(['KeyW','ArrowUp']), ['KeyW','ArrowUp'], 220, 'right');
  assert.deepEqual(move, {vx:0,vy:-220,facing:'up'});
});

test('the room crop removes the baked HUD and uniformly fills the remaining 16:9 view', () => {
  assert.equal(GAME.width / GAME.height, 16/9);
  assert.ok(BACKGROUND.roomTop >= 90);
  assert.ok(Math.abs(HUD_HEIGHT + (BACKGROUND.height-BACKGROUND.roomTop)*ROOM_SCALE - GAME.height) < 1e-9);
});

test('the initial feet body is inside the room and outside every obstacle', () => {
  const body = {x:PLAYER.spawn.x-PLAYER.bodyWidth/2, y:PLAYER.spawn.y-PLAYER.bodyHeight, width:PLAYER.bodyWidth, height:PLAYER.bodyHeight};
  assert.ok(body.x >= WALKABLE.x && body.x+body.width <= WALKABLE.x+WALKABLE.width);
  assert.ok(body.y >= WALKABLE.y && body.y+body.height <= WALKABLE.y+WALKABLE.height);
  for(const obstacle of OBSTACLES) {
    const overlap = body.x < obstacle.x+obstacle.width && body.x+body.width > obstacle.x && body.y < obstacle.y+obstacle.height && body.y+body.height > obstacle.y;
    assert.equal(overlap,false,obstacle.id);
  }
});

test('four transparent directional sources and the four display-case footprints are configured', () => {
  assert.deepEqual(Object.keys(PLAYER_ART).sort(), ['down','left','right','up']);
  for(const art of Object.values(PLAYER_ART)) {
    assert.ok(art.footX >= art.bounds[0] && art.footX < art.bounds[0]+art.bounds[2]);
  }
  assert.equal(OBSTACLES.filter(item=>item.id.startsWith('case-')).length,4);
  assert.equal(OBSTACLES.filter(item=>item.id.startsWith('bench-')).length,2);
});

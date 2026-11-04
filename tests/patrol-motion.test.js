import test from 'node:test';
import assert from 'node:assert/strict';
import { PATROL, getGroundPatrol } from '../src/patrol-motion.js';
import { playerInCone, ScanController, SETTINGS } from '../src/guard-logic.js';

test('guard and thief share the ground Y baseline; light is at hand height', () => {
  for (const time of [0, 1.5, 5, 10, 17, 22, 30]) {
    const pose = getGroundPatrol(time, 436);
    assert.equal(pose.feetY, 460);
    assert.equal(pose.origin.y, 403);
    assert.equal(pose.origin.x, pose.x + pose.facing * PATROL.flashlightHandOffsetX);
  }
});
test('patrol walks left and right and never floats out of its corridor', () => {
  const a = getGroundPatrol(0, 436);
  const b = getGroundPatrol(1, 436);
  const end = getGroundPatrol((PATROL.endX-PATROL.startX)/PATROL.speedPxPerSecond, 436);
  const c = getGroundPatrol((PATROL.endX-PATROL.startX)/PATROL.speedPxPerSecond+1, 436);
  assert.equal(a.facing, 1);
  assert.ok(b.x > a.x);
  assert.equal(end.x, PATROL.endX);
  assert.equal(c.facing, -1);
  assert.ok(c.x < end.x);
});
test('forward flashlight sees the thief from ground-level patrol', () => {
  const guard = getGroundPatrol(0, 436);
  assert.equal(playerInCone({x:436,y:460,width:27,height:70}, guard.origin, guard.angle, SETTINGS.beamRange, SETTINGS.beamHalfAngle), true);
});
test('focus points the hand-held flashlight at player torso from either side', () => {
  for(const time of [0, 9, 14, 18]) {
    const guard=getGroundPatrol(time, 436, true);
    assert.equal(playerInCone({x:436,y:460,width:27,height:70}, guard.origin, guard.angle, SETTINGS.beamRange, SETTINGS.beamHalfAngle), true);
    assert.equal(guard.facing, 436>=guard.x?1:-1);
  }
});

test('automatic horizontal patrol illuminates a stationary thief long enough to alarm', () => {
  const controller = new ScanController();
  let alarm = false;
  for (let i = 1; i <= 380; i++) {
    const t = i * .016;
    const guard = getGroundPatrol(t, 436);
    const illuminated = playerInCone({x:436,y:460,width:27,height:70},
      guard.origin,guard.angle,SETTINGS.beamRange,SETTINGS.beamHalfAngle);
    const status = controller.update(16,{illuminated,nearExhibit:true,poseMatched:false});
    if (status.event === 'alarm') {alarm = true;break;}
  }
  assert.equal(alarm,true);
});

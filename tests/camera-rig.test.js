import test from 'node:test';
import assert from 'node:assert/strict';
import {CAMERA_CONFIG,sweepAngle,angleToPlayer} from '../src/camera-rig.js';
import {playerInCone} from '../src/guard-logic.js';
test('CCTV camera pivot stays fixed during a sweep',()=>{
  const a=sweepAngle(0),b=sweepAngle(6);
  assert.notEqual(a,b);
  assert.equal(CAMERA_CONFIG.pivotX,563);
  assert.ok(Math.abs(a-CAMERA_CONFIG.sweepCenter)<.000001);
  assert.ok(Math.abs(b-CAMERA_CONFIG.sweepCenter)<=CAMERA_CONFIG.sweepAmplitude);
});
test('the camera can aim at either statue to check player pose',()=>{
  for(const x of [388,773]){
    const p={x,y:460,width:27,height:70};
    const source={x:CAMERA_CONFIG.pivotX,y:CAMERA_CONFIG.pivotY};
    const a=angleToPlayer(source,p);
    assert.equal(playerInCone(p,source,a,CAMERA_CONFIG.beamRange,CAMERA_CONFIG.beamHalfAngle),true);
  }
});
test('camera beam does not see distant locations outside its range',()=>{
  const p={x:5000,y:460,width:27,height:70};
  const source={x:CAMERA_CONFIG.pivotX,y:CAMERA_CONFIG.pivotY};
  assert.equal(playerInCone(p,source,angleToPlayer(source,p),CAMERA_CONFIG.beamRange,CAMERA_CONFIG.beamHalfAngle),false);
});

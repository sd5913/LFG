import test from 'node:test';
import assert from 'node:assert/strict';
import { pointInCone, playerInCone, ScanController, nearestExhibit } from '../src/guard-logic.js';

const down = Math.PI / 2;
test('cone detects a point straight ahead and rejects points behind/outside range', () => {
  const origin = {x: 0, y: 0};
  assert.equal(pointInCone({x: 0, y: 100}, origin, down, 200, .25), true);
  assert.equal(pointInCone({x: 120, y: 10}, origin, down, 200, .25), false);
  assert.equal(pointInCone({x: 0, y: -100}, origin, down, 200, .25), false);
  assert.equal(pointInCone({x: 0, y: 220}, origin, down, 200, .25), false);
});
test('player detection checks body, not only feet', () => {
  assert.equal(playerInCone({x:0, y:120, width:24, height:60}, {x:0,y:0}, down, 100, .3), true);
});
test('exposure causes alarm if pose not matched within time', () => {
  const ctrl = new ScanController({warningMs:3000});
  let output;
  for (let i=0;i<50;i++) output = ctrl.update(60,{illuminated:true, nearExhibit:true, poseMatched:false});
  assert.equal(output.state,'ALARM');
  assert.equal(output.event,'alarm');
  assert.equal(ctrl.update(60,{illuminated:true, nearExhibit:true, poseMatched:false}).event,null);
});
test('matching pose while near exhibit prevents alarm', () => {
  const ctrl = new ScanController({warningMs:3000, requiredPoseHoldMs:900});
  let output;
  for (let i=0;i<12;i++) output = ctrl.update(80,{illuminated:true, nearExhibit:true, poseMatched:true});
  assert.equal(output.state,'DISGUISED');
  assert.equal(output.event,'disguised');
  for (let i=0;i<50;i++) output = ctrl.update(80,{illuminated:true, nearExhibit:true, poseMatched:false});
  assert.equal(output.state,'DISGUISED');
});
test('correct pose without an exhibit does not save player', () => {
  const ctrl = new ScanController({warningMs:300});
  let output;
  for (let i=0;i<5;i++) output=ctrl.update(60,{illuminated:true, nearExhibit:false, poseMatched:true});
  assert.equal(output.state,'ALARM');
});
test('a beam leaving resets the detection timer', () => {
  const ctrl = new ScanController();
  ctrl.update(80,{illuminated:true, nearExhibit:true, poseMatched:false});
  ctrl.update(80,{illuminated:false, nearExhibit:true, poseMatched:false});
  assert.equal(ctrl.exposureMs,0);
  assert.equal(ctrl.state,'SAFE');
});
test('nearest exhibit chooses closest', () => {
  assert.equal(nearestExhibit(280,[{x:100,id:'a'},{x:300,id:'b'}]).id,'b');
});

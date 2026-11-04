import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateUpperBodyPose } from '../src/pose-tracker.js';
const keypoints=(left,right)=>{
  const p=Array.from({length:33},()=>({x:0,y:0,visibility:1}));
  p[11]={x:.4,y:.42,visibility:1};p[12]={x:.6,y:.42,visibility:1};
  p[13]=left.elbow;p[14]=right.elbow;p[15]=left.wrist;p[16]=right.wrist;
  return p;
};
const t=keypoints({elbow:{x:.28,y:.41},wrist:{x:.16,y:.42}},{elbow:{x:.72,y:.42},wrist:{x:.83,y:.42}});
const up=keypoints({elbow:{x:.33,y:.32},wrist:{x:.31,y:.20}},{elbow:{x:.67,y:.32},wrist:{x:.69,y:.20}});
test('simple T pose is recognized and arms-up is not',()=>{
 assert.equal(evaluateUpperBodyPose(t,'T_POSE').matched,true);
 assert.equal(evaluateUpperBodyPose(t,'ARMS_UP').matched,false);
});
test('simple arms-up pose is recognized',()=>assert.equal(evaluateUpperBodyPose(up,'ARMS_UP').matched,true));
test('missing body points fail closed (do not count as matched)',()=>{
 const missing=[...t]; missing[15]={...missing[15],visibility:.1};
 assert.deepEqual(evaluateUpperBodyPose(missing,'T_POSE'),{matched:false,recognized:false});
});

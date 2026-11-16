import test from 'node:test';
import assert from 'node:assert/strict';
import {UnlockMachine, shortestAngleDelta, ROTATION_TARGET_RAD} from '../src/unlock-machine.js';
import {analyzeHand, GESTURES} from '../src/hand-gestures.js';
function feed(m, gesture, start, duration, angle=0){for(let now=start;now<=start+duration;now+=50)m.update({gesture,now,angle});}
test('unknown empty frame is NONE',()=>assert.equal(analyzeHand([]).gesture,GESTURES.NONE));
test('tiny palm still yields finite metrics',()=>{const pts=Array.from({length:21},()=>({x:.5,y:.5})); assert.ok(Number.isFinite(analyzeHand(pts).metrics.pinchDistance));});
test('cannot skip point step with other gesture',()=>{const m=new UnlockMachine();feed(m,'FIST',0,1100);assert.equal(m.stepIndex,0);});
test('point needs sustained hold',()=>{const m=new UnlockMachine();feed(m,'POINT',0,500);assert.equal(m.stepIndex,0);feed(m,'POINT',550,200);assert.equal(m.stepIndex,1);});
test('whole gesture order and any-direction rotation unlock',()=>{const events=[];const m=new UnlockMachine(e=>events.push(e));feed(m,'POINT',0,750);feed(m,'PINCH',850,800);feed(m,'FIST',1750,800);assert.equal(m.stepIndex,3);for(let i=0;i<10;i++)m.update({gesture:'FIST',angle:-i*0.12,now:2700+i*70});assert.equal(m.unlocked,true);assert.ok(events.some(e=>e.type==='unlocked'));});
test('rotation without fist cannot unlock',()=>{const m=new UnlockMachine();feed(m,'POINT',0,750);feed(m,'PINCH',850,800);feed(m,'FIST',1750,800);for(let i=0;i<12;i++)m.update({gesture:'PINCH',angle:i*0.12,now:2700+i*70});assert.equal(m.unlocked,false);});
test('tracking lost during hold does not grant extra progress',()=>{const m=new UnlockMachine();feed(m,'POINT',0,350);const before=m.holdMs;feed(m,'NONE',400,100);assert.equal(m.holdMs,before);});
test('long dropout resets rotation baseline',()=>{const m=new UnlockMachine();feed(m,'POINT',0,750);feed(m,'PINCH',850,800);feed(m,'FIST',1750,800);m.update({gesture:'FIST',angle:0,now:2700});m.update({gesture:'FIST',angle:.25,now:2760});m.update({gesture:'NONE',now:3300});assert.equal(m.rotationTotal,0);});
test('angle wraparound short delta',()=>assert.ok(Math.abs(shortestAngleDelta(-3.12,3.12))<.1));
test('rotation target near 50deg',()=>assert.ok(Math.abs(ROTATION_TARGET_RAD*180/Math.PI-50)<.001));
test('reset clears unlock state',()=>{const m=new UnlockMachine();feed(m,'POINT',0,750);m.reset();assert.equal(m.stepIndex,0);assert.equal(m.unlocked,false);});

const baseHand = [
[.52,.90],[.38,.79],[.31,.68],[.25,.61],[.23,.56],
[.42,.59],[.4,.46],[.43,.50],[.46,.62],
[.50,.58],[.51,.44],[.50,.49],[.51,.61],
[.58,.60],[.61,.48],[.61,.55],[.60,.66],
[.65,.65],[.70,.56],[.68,.60],[.67,.69]
].map(([x,y])=>({x,y}));
test('synthetic closed fist recognized',()=>assert.equal(analyzeHand(baseHand).gesture,GESTURES.FIST));
test('synthetic index-only recognized',()=>{const hand=structuredClone(baseHand);hand[7]={x:.39,y:.36};hand[8]={x:.38,y:.27};assert.equal(analyzeHand(hand).gesture,GESTURES.POINT);});
test('synthetic pinching fingers recognized and not mistaken for fist',()=>{const hand=structuredClone(baseHand);hand[7]={x:.40,y:.42};hand[8]={x:.39,y:.41};hand[4]={x:.40,y:.42};assert.equal(analyzeHand(hand).gesture,GESTURES.PINCH);});

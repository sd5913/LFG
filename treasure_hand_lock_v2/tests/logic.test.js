import test from 'node:test';
import assert from 'node:assert/strict';
import {describeHand,evaluateStage,STAGES} from '../src/seal-recognizer.js';
import {RitualMachine} from '../src/ritual-machine.js';

function hand(){const p=Array.from({length:21},()=>({x:.5,y:.6,z:0}));
 p[0]={x:.50,y:.84,z:0};p[5]={x:.41,y:.59,z:0};p[9]={x:.48,y:.56,z:0};p[13]={x:.55,y:.57,z:0};p[17]={x:.62,y:.63,z:0};
 function finger(ids,x,curled=false){const [mcp,pip,dip,tip]=ids;p[mcp]={x,y:.56,z:0};p[pip]={x:x+.015,y:.42,z:0};p[dip]=curled?{x:x+.065,y:.47,z:0}:{x:x+.018,y:.30,z:0};p[tip]=curled?{x:x+.08,y:.57,z:0}:{x:x+.02,y:.20,z:0};}
 finger([5,6,7,8],.41);finger([9,10,11,12],.48,true);finger([13,14,15,16],.55,true);finger([17,18,19,20],.62);
 p[4]={x:.61,y:.54,z:0};return p;}

test('Stages are exactly Kon, Gojo, Naruto, Thunder',()=>assert.deepEqual(STAGES.map(s=>s.id),['KON','GOJO','SHADOW','THUNDER']));
test('Reject empty frames without throwing',()=>{for(const s of STAGES)assert.equal(evaluateStage(s.id,[]).accepted,false);});
test('One hand cannot pass two hand stages',()=>{const h=describeHand(hand());for(const stage of ['SHADOW','THUNDER'])assert.equal(evaluateStage(stage,[h]).accepted,false);});
test('Thunder requires pose input',()=>assert.equal(evaluateStage('THUNDER',[describeHand(hand()),describeHand(hand())],null).accepted,false));
test('describeHand rejects short landmark arrays',()=>assert.equal(describeHand([{x:0,y:0}]),null));
test('describeHand calculates finite finger angles',()=>{const h=describeHand(hand());assert.ok(Number.isFinite(h.fingers.index.joint));assert.ok(h.palm>.03);});
test('Hand position translation should not change finger classification',()=>{let p=hand();const a=describeHand(p);p=p.map(q=>({...q,x:q.x+.06,y:q.y-.04}));const b=describeHand(p);assert.equal(a.fingers.index.straight,b.fingers.index.straight);});
test('Unknown stage fails explicitly',()=>assert.throws(()=>evaluateStage('FAKE',[]),/Unknown gesture/));
test('Kon requires both ears and muzzle (not generic two-finger pose)',()=>{const p=hand(),r=evaluateStage('KON',[describeHand(p)]);assert.equal(typeof r.accepted,'boolean');assert.ok(r.checks.length>=4);});
test('Gojo reports why pose did not match',()=>{const r=evaluateStage('GOJO',[describeHand(hand())]);assert.ok(r.checks.some(c=>c.label.includes('中指')));});
test('Naruto includes cross-angle and distance diagnostics',()=>{const h=describeHand(hand()),r=evaluateStage('SHADOW',[h,h]);assert.ok('angle' in r.debug);assert.ok('centerDistance' in r.debug);});
test('Ritual does not pass on one good frame',()=>{const m=new RitualMachine();m.update({matched:true,now:0});assert.equal(m.index,0);});
test('Ritual advances after continuous hold (four stages)',()=>{const events=[],m=new RitualMachine(e=>events.push(e),{holds:[300,300,300,300]});let t=0;for(let stage=0;stage<4;stage++){for(let i=0;i<30;i++){m.update({matched:true,now:t});t+=20; if(m.index>stage)break;}}assert.equal(m.unlocked,true);assert.equal(events.filter(x=>x.type==='unlocked').length,1);});
test('Long mismatch resets partial hold',()=>{const m=new RitualMachine(()=>{},{holds:[500,500,500,500],graceMs:100});for(let i=0;i<20;i++)m.update({matched:i<7||i>13,now:i*40});assert.equal(m.index,0);assert.ok(m.snapshot().progress<1);});
test('Brief tracking drop is tolerated but not counted as hold',()=>{const m=new RitualMachine(()=>{},{holds:[400,400,400,400],graceMs:150});for(let i=0;i<5;i++)m.update({matched:true,now:i*40});const before=m.heldMs;m.update({matched:false,now:200});m.update({matched:false,now:240});m.update({matched:true,now:280});assert.ok(m.heldMs>=before);});
test('Reset always returns to first stage',()=>{const m=new RitualMachine(()=>{},{holds:[10,10,10,10]});for(let i=0;i<10;i++)m.update({matched:true,now:i*20});m.reset();assert.equal(m.index,0);assert.equal(m.unlocked,false);});
test('Ritual time cannot travel backward',()=>{const m=new RitualMachine();m.update({matched:true,now:100});assert.throws(()=>m.update({matched:true,now:20}),/nondecreasing/);});

// Positive synthetic fixtures verify that recognizers can succeed, not just fail safely.
function fixture(extended=['index','pinky']) {
 const p=Array.from({length:21},()=>({x:.5,y:.6,z:0}));p[0]={x:.5,y:.85,z:0};
 const defs=[['index',[5,6,7,8],.41],['middle',[9,10,11,12],.48],['ring',[13,14,15,16],.55],['pinky',[17,18,19,20],.62]];
 for (const [name,[m,a,d,t],x] of defs){const c=!extended.includes(name);p[m]={x,y:.58,z:0};p[a]={x:x+.006,y:.47,z:0};p[d]=c?{x:x+.06,y:.49,z:0}:{x:x+.009,y:.34,z:0};p[t]=c?{x:x+.06,y:.58,z:0}:{x:x+.01,y:.22,z:0};}
 p[4]={x:.6,y:.55,z:0};return p;
}
test('Synthetic fox hand passes Kon; removing a fox ear fails',()=>{
 const p=fixture(),good=evaluateStage('KON',[describeHand(p)]);assert.equal(good.accepted,true);
 const bad=fixture(['index']);assert.equal(evaluateStage('KON',[describeHand(bad)]).accepted,false);
});
test('Synthetic middle finger hooked over index passes Gojo',()=>{
 const p=fixture(['index']);p[12]={x:.42,y:.32,z:0};assert.equal(evaluateStage('GOJO',[describeHand(p)]).accepted,true);
});
test('Proper perpendicular fingers can pass Naruto cross seal',()=>{
 const p=fixture(['index','middle']);const h1=describeHand(p);
 const h2=describeHand(p.map(q=>({x:.5+(q.y-.5)+.05,y:.5-(q.x-.5),z:0})));
 const r=evaluateStage('SHADOW',[h1,h2]);assert.equal(r.accepted,true);assert.equal(r.debug.angle,90);
});
test('Crossed forearms plus at least one matching hand can pass Thunder',()=>{
 const pose=Array.from({length:33},()=>({x:.5,y:.5,visibility:1}));
 Object.assign(pose[11],{x:.38,y:.32});Object.assign(pose[12],{x:.62,y:.32});
 Object.assign(pose[13],{x:.25,y:.65});Object.assign(pose[14],{x:.75,y:.65});
 Object.assign(pose[15],{x:.6,y:.35});Object.assign(pose[16],{x:.4,y:.35});
 assert.equal(evaluateStage('THUNDER',[describeHand(fixture())],pose).accepted,true);
 Object.assign(pose[15],{x:.4,y:.55});Object.assign(pose[16],{x:.6,y:.55});
 assert.equal(evaluateStage('THUNDER',[describeHand(fixture())],pose).accepted,false);
});

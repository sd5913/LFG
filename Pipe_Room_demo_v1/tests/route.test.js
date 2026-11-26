import test from 'node:test';
import assert from 'node:assert/strict';
import {SEGMENTS,HAZARDS,VALVES,TOTAL_LENGTH,routeAt,movementForKey,clampAtLockedValve,hazardAt,jumpHeight,steamState,resolveSteamMove,ratSpawnDelay,ratCanBite,crawlRate,CRAWL_STROKE_SECONDS,reachedPipeExit} from '../src/route.js';
import {ValveGestureSequence,fistScore,palmRotation} from '../src/gesture-valve.js';
const bodyWidth=92;
test('pipe pieces form six and only six constrained path segments',()=>assert.equal(SEGMENTS.length,6));
test('path starts at left lower inlet',()=>assert.deepEqual([routeAt(0).x,routeAt(0).y],[121,826]));
test('path ends at right lower outlet',()=>assert.deepEqual([routeAt(TOTAL_LENGTH).x,routeAt(TOTAL_LENGTH).y],[1538,800]));
test('ladder rises vertically, mid pipe travels left',()=>{assert.equal(SEGMENTS[1].from[0],SEGMENTS[1].to[0]);assert.ok(SEGMENTS[2].to[0]<SEGMENTS[2].from[0]);});
test('three gap steam hazards belong to bottom, middle, top',()=>assert.deepEqual(HAZARDS.map(h=>h.segment),['bottom','middle','top']));
test('two valves occur in correct order and on intended floors',()=>{assert.equal(VALVES.length,2);assert.ok(VALVES[0].at>HAZARDS[1].center);assert.ok(VALVES[1].at>HAZARDS[2].center);});
test('locked valve blocks forward progress',()=>{const g=VALVES[0];const r=clampAtLockedValve(g.at-12,g.at+20,{left:false,right:false});assert.equal(r.s,g.at);assert.equal(r.blocked?.id,'left');});
test('opened valve does not block',()=>{const g=VALVES[0];assert.equal(clampAtLockedValve(g.at-10,g.at+10,{left:true,right:false}).blocked,null);});
test('player cannot move off vertical ladder with left key',()=>assert.equal(movementForKey(SEGMENTS[1].start+100,'left').delta,0));
test('player can climb with Up',()=>assert.equal(movementForKey(SEGMENTS[1].start+50,'up').delta,1));
test('player can reverse at junction back onto previous segment',()=>assert.equal(movementForKey(SEGMENTS[1].start,'left').delta,-1));
test('player cannot walk upward through bottom horizontal tube',()=>assert.equal(movementForKey(200,'up').delta,0));
test('a gap narrower than half the body still supports the player',()=>{
 const [start,end]=HAZARDS[0].opening,center=(start+end)/2;
 assert.equal(hazardAt(center,(end-start)*2),null);
 assert.equal(hazardAt(center,bodyWidth),HAZARDS[0]);
});
test('jump is an arc lasting 1.2 seconds',()=>{assert.equal(jumpHeight(-1),0);assert.ok(jumpHeight(.6)>69);assert.equal(jumpHeight(1.16),0);});
test('each vent sprays for three seconds and pauses for three seconds',()=>{
 for(const hazard of HAZARDS){
  const cycleStart=-hazard.phase;
  assert.equal(steamState(hazard,cycleStart+2.99).active,true);
  assert.equal(steamState(hazard,cycleStart+3).active,false);
  assert.equal(steamState(hazard,cycleStart+3).remaining,3);
  assert.equal(steamState(hazard,cycleStart+5.99).active,false);
  assert.equal(steamState(hazard,cycleStart+6).active,true);
  assert.equal(steamState(hazard,cycleStart+6).remaining,3);
 }
});
test('the green exit completes the route before the ladder end once both valves are open',()=>{
 const opened={left:true,right:true};
 assert.equal(reachedPipeExit(TOTAL_LENGTH-50,opened),false);
 assert.equal(reachedPipeExit(TOTAL_LENGTH-33,opened),true);
 assert.equal(reachedPipeExit(TOTAL_LENGTH,{left:true}),false);
});
test('airborne movement clears an off vent but active steam causes a separate hit',()=>{
 const s=HAZARDS[0].center;
 assert.equal(resolveSteamMove(s,s,bodyWidth,true,2.99,null).hit,'steam');
 assert.equal(resolveSteamMove(s,s,bodyWidth,true,3,null).hit,null);
 assert.equal(resolveSteamMove(s,s,bodyWidth,false,3,null).hit,'gap');
});
test('every opening allows exactly half the grounded body over either rim',()=>{
 for(const gap of HAZARDS){
  const [start,end]=gap.opening;
  const offTime=3.1-gap.phase;
  for(const [rim,direction] of [[start,1],[end,-1]]){
   assert.equal(resolveSteamMove(rim-direction*4,rim-direction,bodyWidth,false,offTime,null).hit,null);
   assert.equal(resolveSteamMove(rim,rim,bodyWidth,false,offTime,null).hit,null);
   const inside=rim+direction*.1;
   assert.deepEqual(resolveSteamMove(rim,inside,bodyWidth,false,offTime,null),{s:inside,hit:'gap',failedGap:gap});
   assert.equal(resolveSteamMove(rim,inside,bodyWidth,true,offTime,null).hit,null);
  }
 }
});
test('a failed landing can be retried in place or retreated from',()=>{
 const gap=HAZARDS[0],s=gap.center-10;
 assert.deepEqual(resolveSteamMove(s,s,bodyWidth,false,3.1,null),{s,hit:'gap',failedGap:gap});
 assert.deepEqual(resolveSteamMove(s,s+4,bodyWidth,false,3.1,gap),{s,hit:null,failedGap:gap});
 assert.equal(resolveSteamMove(s,s-4,bodyWidth,false,2,gap).s,s-4);
 assert.deepEqual(resolveSteamMove(s,s+4,bodyWidth,true,3.1,gap),{s:s+4,hit:null,failedGap:null});
});
test('rat spawning uses a random delay between five and seven seconds',()=>{
 assert.equal(ratSpawnDelay(()=>0),5);
 assert.equal(ratSpawnDelay(()=>.25),5.5);
 assert.equal(ratSpawnDelay(()=>1),7);
});
test('a rat can bite on the ground and on landing, but a raised jump clears it',()=>{
 assert.equal(ratCanBite(100,120,-1),true);
 assert.equal(ratCanBite(100,120,.35),false);
 assert.equal(ratCanBite(100,120,1.1),true);
 assert.equal(ratCanBite(100,136,-1),false);
});
test('crawl strokes keep moving at a steady average pace with a gentle variation',()=>{
 const samples=Array.from({length:60},(_,index)=>crawlRate(index/60*CRAWL_STROKE_SECONDS));
 assert.ok(Math.min(...samples)>.65 && Math.max(...samples)<.95);
 assert.ok(Math.max(...samples)-Math.min(...samples)>.1);
 assert.ok(Math.abs(samples.reduce((sum,rate)=>sum+rate,0)/samples.length-.79)<.01);
 assert.ok(Math.abs(crawlRate(CRAWL_STROKE_SECONDS)-crawlRate(0))<.001);
});
test('both additional ladders align with the climb-only route segments',()=>{assert.equal(SEGMENTS[3].from[0],211);assert.equal(SEGMENTS[3].to[0],211);assert.equal(SEGMENTS[5].from[0],1538);assert.equal(SEGMENTS[5].to[0],1538);assert.equal(movementForKey(SEGMENTS[5].start+50,'down').delta,1);assert.equal(movementForKey(SEGMENTS[5].start+50,'right').delta,0);});
test('empty hand is not a fist',()=>assert.equal(fistScore(null).fist,false));
test('rotating invalid landmark array returns null',()=>assert.equal(palmRotation([]),null));
test('valve cannot unlock on first frame',()=>{const x=new ValveGestureSequence();assert.equal(x.update(null,1000).done,false);});
test('valve reset restores initial phase',()=>{const x=new ValveGestureSequence();x.grip=500;x.reset();assert.equal(x.phase,'grip');assert.equal(x.grip,0);});

import test from 'node:test';
import assert from 'node:assert/strict';
import {TOTAL_LENGTH,HAZARDS,VALVES,routeAt,movementForKey,clampAtLockedValve,
  safeFromSteam,steamState,crawlRate} from '../src/route.js';

test('simulated real-time run waits for OFF windows, jumps all gaps, opens gates and reaches exit',()=>{
 const dt=1/60, speed=218, jumpDur=1.2;
 let s=0,t=0,crawlClock=0,jump=null,heldAtGap=0,leaps=0;
 const opened={left:false,right:false},passed=new Set();
 for(let tick=0;tick<12000 && s<TOTAL_LENGTH-1;tick++){
  const seg=routeAt(s);
  const m=movementForKey(s,seg.forward);
  assert.equal(m.delta,1,`movement stalled at ${s} on ${seg.id}`);
  const next=HAZARDS.find(h=>h.center>s && h.center-s<148 && !passed.has(h.id));
  let wait=false;
  if(next && jump===null){
   const st=steamState(next,t);
   // Hold at the approach marker until a sufficiently long OFF window arrives.
   if(next.center-s<146 && (st.active||st.remaining<1.2)){
    heldAtGap++;
    wait=true;
   }else if(next.center-s<146){jump=0;leaps++;}
  }
  const rate=jump!==null?1.05:crawlRate(crawlClock);
  const delta=wait?0:speed*rate*dt;
  if(!wait)crawlClock+=dt;
  let target=Math.min(m.limit,s+delta);
  let gate=clampAtLockedValve(s,target,opened);
  if(gate.blocked){opened[gate.blocked.id]=true;gate=clampAtLockedValve(s,target,opened);}
  target=gate.s;
  t+=dt;
  assert.equal(safeFromSteam(target,jump??-1,t),true,`failed hazard at s=${target.toFixed(1)}, t=${t.toFixed(2)}, jump=${jump}`);
  s=target;
  for(const h of HAZARDS){if(s>=h.center+h.halfWidth+24)passed.add(h.id);}
  if(jump!==null){jump+=dt;if(jump>=jumpDur)jump=null;}
 }
 assert.ok(TOTAL_LENGTH-s<2,`did not reach the exit: ${s}/${TOTAL_LENGTH}`);
 assert.deepEqual(opened,{left:true,right:true});
 assert.equal(passed.size,3);assert.equal(leaps,3);
 assert.ok(heldAtGap>0,'did not wait for OFF windows at all');
});

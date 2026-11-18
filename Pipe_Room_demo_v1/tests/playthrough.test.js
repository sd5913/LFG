import test from 'node:test';
import assert from 'node:assert/strict';
import {SEGMENTS,TOTAL_LENGTH,HAZARDS,VALVES,routeAt,movementForKey,clampAtLockedValve,jumpHeight,hazardAt} from '../src/route.js';

test('automated input path can clear all steam and both valve gates to exit',()=>{
 const dt=1/60,speed=272,jumpDur=.94;
 let s=0, jumping=null,fail=0;
 const opened={left:false,right:false},passed=new Set();
 // This is a deterministic simulated controls test, not a browser or camera test.
 for(let tick=0;tick<2400&&s<TOTAL_LENGTH-2;tick++){
  const seg=routeAt(s);
  const dir=seg.forward;
  const m=movementForKey(s,dir);
  if(m.delta!==1)throw Error('Impossible forward move '+s+' '+dir);
  const next=HAZARDS.find(h=>h.center>s&&h.center-s<135&&h.center-s>115);
  if(next&&jumping==null)jumping=0;
  let target=Math.min(m.limit,s+speed*dt);
  let r=clampAtLockedValve(s,target,opened);
  if(r.blocked){opened[r.blocked.id]=true;r=clampAtLockedValve(s,target,opened);}
  s=r.s;
  if(hazardAt(s)&&jumpHeight(jumping??-1,jumpDur)<=17){fail++;throw Error('Hazard collided at '+s.toFixed(1)+' after '+tick+' ticks, jumping '+jumping);}
  for(const h of HAZARDS)if(s>h.center+h.halfWidth+24)passed.add(h.id);
  if(jumping!==null){jumping+=dt;if(jumping>=jumpDur)jumping=null;}
 }
 assert.equal(fail,0);assert.ok(TOTAL_LENGTH-s<3,'exit reached');assert.deepEqual(opened,{left:true,right:true});assert.equal(passed.size,3);
});

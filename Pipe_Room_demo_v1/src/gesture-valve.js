// Uses MediaPipe's 21 hand landmarks; custom gesture rules, not a stock
// "valve gesture" from MediaPipe. The player may rotate in either direction.
const angle=(a,b,c)=>{const u=[a.x-b.x,a.y-b.y],v=[c.x-b.x,c.y-b.y];const d=Math.hypot(...u)*Math.hypot(...v)||1;return Math.acos(Math.max(-1,Math.min(1,(u[0]*v[0]+u[1]*v[1])/d)))*180/Math.PI;};
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const wrap=(rad)=>Math.atan2(Math.sin(rad),Math.cos(rad));
export function fistScore(points){
 if(!points||points.length<21)return {fist:false,curled:0,score:0};
 const a=[[5,6,8],[9,10,12],[13,14,16],[17,18,20]];
 let curled=0;
 for(const [m,p,t] of a){
   const bent=angle(points[m],points[p],points[t])<145;
   const compact=dist(points[t],points[0])<dist(points[m],points[0])*1.13;
   if(bent||compact)curled++;
 }
 return {fist:curled>=3,curled,score:curled/4};
}
export function palmRotation(points){
 if(!points||points.length<21)return null;
 // Angle across knuckles; safe for a tilted 2D closed fist, not a 3D key twist.
 return Math.atan2(points[17].y-points[5].y,points[17].x-points[5].x);
}
export class ValveGestureSequence{
 constructor(){this.reset();}
 reset(){this.phase='grip';this.grip=0;this.turnTime=0;this.base=null;this.angleTravel=0;this.lastTime=null;this.dropout=0;this.done=false;this.fist=false;}
 update(points,now){
  if(this.done)return this.snapshot();
  const dt=this.lastTime==null?0:Math.max(0,Math.min(75,now-this.lastTime));this.lastTime=now;
  const f=fistScore(points);this.fist=f.fist;
  if(!f.fist){
    this.dropout+=dt;
    if(this.dropout>250){this.phase='grip';this.grip=0;this.turnTime=0;this.base=null;this.angleTravel=0;}
    return this.snapshot();
  }
  this.dropout=0;
  if(this.phase==='grip'){
   this.grip+=dt;
   if(this.grip>=550){this.phase='turn';this.base=palmRotation(points);this.turnTime=0;}
  }else{
   this.turnTime+=dt;
   const a=palmRotation(points);
   if(a!=null&&this.base!=null){
    const deg=Math.abs(wrap(a-this.base))*180/Math.PI;
    this.angleTravel=Math.max(this.angleTravel,deg);
    if(this.angleTravel>=38&&this.turnTime>=420){this.done=true;this.phase='done';}
   }
  }
  return this.snapshot();
 }
 snapshot(){return {phase:this.phase,done:this.done,gripProgress:Math.min(1,this.grip/550),turnProgress:Math.min(1,this.angleTravel/38),angle:Math.round(this.angleTravel),fist:this.fist};}
}

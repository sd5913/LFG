/** Shared step logic. Reuse in a Phaser/React parent by calling .update() each frame. */
export const STEPS = Object.freeze([
  {id:'POINT',title:'Point / 寻找锁孔',instruction:'伸出食指，其余手指握起并保持 2 秒',holdMs:2000},
  {id:'PINCH',title:'Pinch / 捏住钥匙',instruction:'拇指与食指指尖捏合并保持 2 秒',holdMs:2000},
  {id:'FIST',title:'Grab / 握住锁柄',instruction:'所有手指握拳并保持 2 秒',holdMs:2000},
  {id:'ROTATE',title:'Rotate / 旋转开锁',instruction:'保持握拳，将手在画面内倾斜至少 50°',holdMs:0},
]);
export const ROTATION_TARGET_RAD = 50*Math.PI/180;
export function shortestAngleDelta(a,b) {let d=a-b; while(d>Math.PI)d-=2*Math.PI;while(d< -Math.PI)d+=2*Math.PI;return d;}
const clamp=(n,min=0,max=1)=>Math.max(min,Math.min(max,n));
export class UnlockMachine {
  constructor(onEvent=()=>{}) {this.onEvent=onEvent;this.reset();}
  reset(){this.stepIndex=0;this.holdMs=0;this.lastTime=null;this.lastMatchedAt=null;
    this.rotationOrigin=null;this.lastAngle=null;this.rotationTotal=0;this.rotationLastGood=null;
    this.unlocked=false;this.openedAt=null;this.onEvent({type:'reset'});}
  get step(){return STEPS[Math.min(this.stepIndex,STEPS.length-1)];}
  get progress(){return this.unlocked?1:this.stepIndex===3?clamp(Math.abs(this.rotationTotal)/ROTATION_TARGET_RAD):clamp(this.holdMs/this.step.holdMs);}
  snapshot(){return {stepIndex:this.stepIndex,step:this.unlocked?'OPENED':this.step.id,progress:this.progress,
    unlocked:this.unlocked,rotationDegrees:Math.round(Math.abs(this.rotationTotal)*180/Math.PI)};}
  advance(at){const finished=STEPS[this.stepIndex];this.stepIndex++;this.holdMs=0;this.lastMatchedAt=null;
    this.rotationOrigin=null;this.lastAngle=null;this.rotationTotal=0;this.rotationLastGood=null;
    this.onEvent({type:'step-complete',step:finished.id,stepIndex:this.stepIndex});
    if(this.stepIndex>=STEPS.length){this.unlocked=true;this.openedAt=at;this.onEvent({type:'unlocked',at});}
  }
  update({gesture='NONE',angle=null,now=0}={}) {
    if(this.unlocked)return this.snapshot();
    if(!Number.isFinite(now))now=0;
    const dt=this.lastTime==null?0:Math.max(0,Math.min(100,now-this.lastTime));
    this.lastTime=now;
    const expected=this.stepIndex===3?'FIST':this.step.id;
    const matches=gesture===expected;
    // Keep previous progress across a short visual-tracking flicker, but never AWARD progress for missing data.
    if(this.stepIndex<3) {
      if(matches){this.holdMs+=dt;this.lastMatchedAt=now;}
      // Keep a short grace window for normal webcam landmark flicker. Progress
      // is still never awarded while the target gesture is missing.
      else if(this.lastMatchedAt==null || now-this.lastMatchedAt>400){this.holdMs=Math.max(0,this.holdMs-dt*.9);}
      if(this.holdMs>=this.step.holdMs)this.advance(now);
    } else {
      if(matches && Number.isFinite(angle)){
        if(this.rotationOrigin==null){this.rotationOrigin=angle;this.lastAngle=angle;this.rotationTotal=0;}
        else {
          const delta=shortestAngleDelta(angle,this.lastAngle);
          // Ignore impossible >30 degree frame jumps, typical of a tracking switch.
          if(Math.abs(delta)<Math.PI/6)this.rotationTotal+=delta;
          this.lastAngle=angle;
        }
        this.rotationLastGood=now;
        if(Math.abs(this.rotationTotal)>=ROTATION_TARGET_RAD)this.advance(now);
      } else if(this.rotationLastGood==null || now-this.rotationLastGood>350){
        this.rotationOrigin=null;this.lastAngle=null;this.rotationTotal=0;
      }
    }
    return this.snapshot();
  }
}

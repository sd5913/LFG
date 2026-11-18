import {STAGES} from './seal-recognizer.js';
/** Strict continuous-hold state machine, with small tracking-loss grace. */
export class RitualMachine {
  constructor(onEvent=()=>{},config={}) {this.onEvent=onEvent;this.holds=config.holds??STAGES.map(s=>s.holdMs);this.graceMs=config.graceMs??220;this.reset();}
  reset(){this.index=0;this.unlocked=false;this.heldMs=0;this.lastAt=null;this.lastGoodAt=null;this.stepStartedAt=null;this.lastMatched=false;}
  get stage(){return STAGES[Math.min(this.index,STAGES.length-1)];}
  update({matched=false,now}) {
    if(!Number.isFinite(now))throw new Error('now must be a number');
    if(this.lastAt!==null && now<this.lastAt)throw new Error('time must be nondecreasing');
    const elapsed=this.lastAt===null?0:Math.min(now-this.lastAt,100);
    this.lastAt=now;
    if(this.unlocked)return this.snapshot();
    if(matched){
      if(this.lastMatched) this.heldMs+=elapsed;
      else if(this.lastGoodAt!==null && now-this.lastGoodAt<=this.graceMs) this.heldMs+=elapsed;
      else this.heldMs=0;
      this.lastMatched=true;this.lastGoodAt=now;
    } else {
      this.lastMatched=false;
      if(this.lastGoodAt===null || now-this.lastGoodAt>this.graceMs){this.heldMs=0;}
    }
    if(matched && this.heldMs>=this.holds[this.index]){
      const completed=this.stage;
      this.index++;this.heldMs=0;this.lastGoodAt=null;this.lastMatched=false;
      this.onEvent({type:'step-complete',stage:completed.id,index:this.index});
      if(this.index>=STAGES.length){this.unlocked=true;this.onEvent({type:'unlocked',steps:STAGES.map(s=>s.id)});}
    }
    return this.snapshot();
  }
  snapshot(){return {index:this.index,unlocked:this.unlocked,progress:this.unlocked?1:Math.min(this.heldMs/this.holds[this.index],1),stage:this.unlocked?'DONE':this.stage.id};}
}

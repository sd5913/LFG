// Route follows the reference map. The player has a single path coordinate s;
// movement can ONLY occur along one of these six pipe/ladder pieces.
export const SEGMENTS=[
 {id:'bottom',label:'底层输送管',from:[121,826],to:[1249,826],forward:'right'},
 {id:'ladder',label:'右侧梯子',from:[1249,826],to:[1249,476],forward:'up'},
 {id:'middle',label:'中层回流管',from:[1249,476],to:[211,476],forward:'left'},
 {id:'left-rise',label:'左侧攀爬梯',from:[211,476],to:[211,237],forward:'up'},
 {id:'top',label:'顶层排气管',from:[211,237],to:[1538,237],forward:'right'},
 {id:'right-down',label:'右侧出口梯',from:[1538,237],to:[1538,800],forward:'down'}
];
export const DIR_OPPOSITE={left:'right',right:'left',up:'down',down:'up'};
let dist=0;
for(const seg of SEGMENTS){seg.start=dist;seg.length=Math.hypot(seg.to[0]-seg.from[0],seg.to[1]-seg.from[1]);seg.end=dist+seg.length;dist=seg.end;}
export const TOTAL_LENGTH=dist;
export const HAZARDS=[
 {id:'steam-bottom',segment:'bottom',center:segById('bottom').start+(753-121),halfWidth:49,name:'第一处间歇喷气',phase:0},
 {id:'steam-middle',segment:'middle',center:segById('middle').start+(1249-816),halfWidth:47,name:'第二处间歇喷气',phase:2.2},
 {id:'steam-top',segment:'top',center:segById('top').start+(853-211),halfWidth:45,name:'第三处间歇喷气',phase:1.1}
];
export const VALVES=[
 {id:'left',name:'左侧分流阀门',at:segById('middle').start+(1249-447),position:[351,445],hint:'转动左侧阀门，才能向左进入上升管'},
 {id:'right',name:'顶层分流阀门',at:segById('top').start+(1240-211),position:[1319,211],hint:'转动右侧阀门，才能进入右侧下降管'}
];
export function segById(id){return SEGMENTS.find(s=>s.id===id);}
export function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
export function routeAt(s){
 const value=clamp(s,0,TOTAL_LENGTH);
 let seg=SEGMENTS.find(e=>value<e.end-1e-7)||SEGMENTS.at(-1);
 const t=clamp((value-seg.start)/seg.length,0,1);
 return {...seg,t,s:value,x:seg.from[0]+(seg.to[0]-seg.from[0])*t,y:seg.from[1]+(seg.to[1]-seg.from[1])*t};
}
export function keyDirection(keys){
 if(keys.has('ArrowRight')||keys.has('KeyD'))return 'right';
 if(keys.has('ArrowLeft')||keys.has('KeyA'))return 'left';
 if(keys.has('ArrowUp')||keys.has('KeyW'))return 'up';
 if(keys.has('ArrowDown')||keys.has('KeyS'))return 'down';
 return null;
}
// Supports entering or backing out of junctions without leaving the pipe.
export function movementForKey(s,dir){
 if(!dir)return {delta:0,limit:s};
 const eps=.11;
 // If exactly on a junction, choose next segment for going forward,
 // previous segment for going backward.
 for(let i=1;i<SEGMENTS.length;i++){
  const b=SEGMENTS[i].start;
  if(Math.abs(s-b)<eps){
   if(dir===SEGMENTS[i].forward)return {delta:1,limit:SEGMENTS[i].end,segment:SEGMENTS[i]};
   if(dir===DIR_OPPOSITE[SEGMENTS[i-1].forward])return {delta:-1,limit:SEGMENTS[i-1].start,segment:SEGMENTS[i-1]};
   return {delta:0,limit:s};
  }
 }
 const seg=routeAt(s);
 if(dir===seg.forward)return {delta:1,limit:seg.end,segment:seg};
 if(dir===DIR_OPPOSITE[seg.forward])return {delta:-1,limit:seg.start,segment:seg};
 return {delta:0,limit:s};
}
export function clampAtLockedValve(oldS,newS,opened){
 for(const valve of VALVES){
  if(opened[valve.id])continue;
  if(oldS<=valve.at&&newS>valve.at)return {s:valve.at,blocked:valve};
 }
 return {s:newS,blocked:null};
}
export function hazardAt(s){return HAZARDS.find(h=>Math.abs(h.center-s)<=h.halfWidth)||null;}
// Steam follows predictable, offset cycles. The OFF window is long enough to
// pause, watch the indicator, then jump the full gap without needing frame-perfect input.
export const STEAM_PERIOD=6.6;
export const STEAM_ON_DURATION=3.9;
export function steamState(h, seconds){
 const t=((seconds+(h?.phase??0))%STEAM_PERIOD+STEAM_PERIOD)%STEAM_PERIOD;
 const active=t<STEAM_ON_DURATION;
 return {active,remaining:active?STEAM_ON_DURATION-t:STEAM_PERIOD-t,
  phase:t,period:STEAM_PERIOD};
}
export function jumpHeight(elapsed,duration=1.2){
 return elapsed>=0&&elapsed<duration?70*Math.sin(Math.PI*elapsed/duration):0;
}
export function safeFromSteam(s,jumpElapsed,seconds=0){
 const h=hazardAt(s);
 // A gap is NOT passable just because the steam pauses. The thief still needs
 // to be mid-jump, and active steam is always lethal even in the air.
 return !h||(!steamState(h,seconds).active&&jumpHeight(jumpElapsed)>16);
}
// Simulate crawl strokes: a pull, a slow follow-through and a visible brief rest.
// A continuous movement key no longer creates perfectly uniform translation.
export const CRAWL_STROKE_SECONDS=.36;
export function crawlRate(seconds){
 const phase=((seconds%CRAWL_STROKE_SECONDS)+CRAWL_STROKE_SECONDS)%CRAWL_STROKE_SECONDS/CRAWL_STROKE_SECONDS;
 if(phase<.12)return .28+1.4*phase/.12;
 if(phase<.59)return 1.68-.38*(phase-.12)/.47;
 return .08;
}


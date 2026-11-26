// Route follows the reference map. The player has a single path coordinate s;
// movement can ONLY occur along one of these six pipe/ladder pieces.
export const SEGMENTS=[
 {id:'bottom',label:'底层输送管',labelEn:'Lower service pipe',from:[121,826],to:[1249,826],forward:'right'},
 {id:'ladder',label:'右侧梯子',labelEn:'Right ladder',from:[1249,826],to:[1249,476],forward:'up'},
 {id:'middle',label:'中层回流管',labelEn:'Middle return pipe',from:[1249,476],to:[211,476],forward:'left'},
 {id:'left-rise',label:'左侧攀爬梯',labelEn:'Left ladder',from:[211,476],to:[211,237],forward:'up'},
 {id:'top',label:'顶层排气管',labelEn:'Upper exhaust pipe',from:[211,237],to:[1538,237],forward:'right'},
 {id:'right-down',label:'右侧出口梯',labelEn:'Exit ladder',from:[1538,237],to:[1538,800],forward:'down'}
];
export const DIR_OPPOSITE={left:'right',right:'left',up:'down',down:'up'};
let dist=0;
for(const seg of SEGMENTS){seg.start=dist;seg.length=Math.hypot(seg.to[0]-seg.from[0],seg.to[1]-seg.from[1]);seg.end=dist+seg.length;dist=seg.end;}
export const TOTAL_LENGTH=dist;
export function segById(id){return SEGMENTS.find(s=>s.id===id);}
export const HAZARDS=[
 {id:'steam-bottom',segment:'bottom',center:segById('bottom').start+(753-121),halfWidth:49,name:'第一处间歇喷气',phase:0},
 {id:'steam-middle',segment:'middle',center:segById('middle').start+(1249-816),halfWidth:47,name:'第二处间歇喷气',phase:1.75},
 {id:'steam-top',segment:'top',center:segById('top').start+(853-211),halfWidth:45,name:'第三处间歇喷气',phase:0.95}
];
export const VALVES=[
 {id:'left',name:'左侧分流阀门',nameEn:'Left diversion valve',at:segById('middle').start+(1249-447),position:[351,445],hint:'转动左侧阀门，才能向左进入上升管'},
 {id:'right',name:'顶层分流阀门',nameEn:'Upper diversion valve',at:segById('top').start+(1240-211),position:[1319,211],hint:'转动右侧阀门，才能进入右侧下降管'}
];
const EXIT_GRATE_ENTRY = TOTAL_LENGTH - 34;

export function reachedPipeExit(s, opened) {
 return s >= EXIT_GRATE_ENTRY && VALVES.every(({id}) => opened[id]);
}

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
export const STEAM_ON_DURATION=3;
export const STEAM_OFF_DURATION=3;
export const STEAM_PERIOD=STEAM_ON_DURATION+STEAM_OFF_DURATION;
export function steamState(h, seconds){
 const t=((seconds+(h?.phase??0))%STEAM_PERIOD+STEAM_PERIOD)%STEAM_PERIOD;
 const active=t<STEAM_ON_DURATION;
 return {active,remaining:active?STEAM_ON_DURATION-t:STEAM_PERIOD-t,phase:t,period:STEAM_PERIOD};
}
export function jumpHeight(elapsed,duration=1.16){
 return elapsed>=0&&elapsed<duration?70*Math.sin(Math.PI*elapsed/duration):0;
}
export function safeFromSteam(s,jumpElapsed,seconds=0){
 const h=hazardAt(s);
 return !h||(!steamState(h,seconds).active&&jumpHeight(jumpElapsed)>16);
}
// v1.2 crawl: more stop-start, less skating.
export const CRAWL_STROKE_SECONDS=.42;
export function crawlRate(seconds){
 const phase=((seconds%CRAWL_STROKE_SECONDS)+CRAWL_STROKE_SECONDS)%CRAWL_STROKE_SECONDS/CRAWL_STROKE_SECONDS;
 if(phase<.16)return .24+1.55*phase/.16;
 if(phase<.56)return 1.79-.52*(phase-.16)/.40;
 return .03;
}
